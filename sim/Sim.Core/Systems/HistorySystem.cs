using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// Category of a history entry. APPEND-ONLY (persisted as a byte and folded into
    /// the state checksum): never reorder, never repurpose a value. 0 = the pre-enrichment
    /// legacy value, so v1 saves (which carried no kind) restore as <see cref="Generic"/>.
    /// </summary>
    public enum HistoryKind : byte
    {
        Generic = 0,               // legacy / uncategorised
        Alarm = 1,
        Death = 2,
        Goal = 3,
        Brownout = 4,
        RelationshipChanged = 5,
        Argument = 6,
        Bond = 7,
        ConstructionCompleted = 8,
        Eulogy = 9,                // a closest-friend eulogy on a death (EulogySystem, N5)
        DeconstructCompleted = 10, // a wall torn down / a device stripped (DeconstructSystem, E0-5)

        // ⭐ M3-5. Two kinds rather than one Generic line, because M5-1 has to FIND them: THE ENDING
        // is built from `RunEnded`, and the wake line is the one entry in the whole Chronicle that
        // names a person the ship woke without being asked. Appending members moves no pin — the
        // fold reads `e.Kind` off the entries that exist, and no existing entry's value changed.
        EmergencyThaw = 11,        // "With <name> dead, the ship woke <name>." (CryoSystem, M3-5)
        RunEnded = 12,             // every soul aboard is dead and nothing can be woken (CryoSystem, M3-5)

        // ⭐⭐ THE CHRONICLE TELLS THE STORY (defect D1, owner-triaged 2026-08-02). The wreck's
        // three player-authored verbs — wake somebody, fix something, commission something — wrote
        // NOTHING to the ship's log. The emergency thaw had a line and the ORDINARY thaw did not;
        // repair had no completion event at all; commissioning was silent. Appending members moves
        // no pin on its own (the fold reads `e.Kind` off the entries that exist, and no existing
        // entry's value changed) — the ENTRIES do.
        Thaw = 13,                 // "<name> came out of cryosleep…" — an ordinary, player-ordered wake
        RepairCompleted = 14,      // a machine was overhauled / serviced / patched (MaintenanceSystem)
        DeviceCommissioned = 15,   // a controller module was fitted; the device answers MOSS now
    }

    /// <summary>One line of ship history, day-stamped ("Day 142.12 — Blight detected in Bay 3").</summary>
    public readonly struct HistoryEntry
    {
        public readonly long Tick;
        public readonly string Text;

        /// <summary><see cref="HistoryKind"/> as a byte — structural, checksum-folded.</summary>
        public readonly byte Kind;

        /// <summary>Primary subject id (citizen or device); 0 = none.</summary>
        public readonly uint SubjectA;

        /// <summary>Secondary subject id (the other party in a pairwise event); 0 = none.</summary>
        public readonly uint SubjectB;

        public HistoryEntry(long tick, string text, byte kind = 0, uint subjectA = 0, uint subjectB = 0)
        {
            Tick = tick;
            Text = text;
            Kind = kind;
            SubjectA = subjectA;
            SubjectB = subjectB;
        }

        public double Day => Tick / (double)SimClockUtil.TicksPerDay;
    }

    public static class SimClockUtil
    {
        public const long TicksPerDay = Simulation.TicksPerSecond * 60L * 60L * 24L;
    }

    /// <summary>
    /// Historical layer (SIMULATION_ARCHITECTURE §6): notable events become day-stamped
    /// history — the event log's data source and the Chronicle renderer's input. Each
    /// entry carries a structural <see cref="HistoryEntry.Kind"/> + up to two subject ids
    /// (citizen/device) so downstream renderers (chronicle, eulogy) can query by category
    /// and name the people involved, while the human-readable Text stays the display line.
    ///
    /// Entries are sim state (saved via IStatefulSystem). Per the HIST convention strings
    /// are hash-EXEMPT: the checksum folds tick + kind + subjects (the structural fields),
    /// never the free text — so rewording an entry never perturbs determinism, but adding
    /// one, or changing its kind/subjects, does.
    ///
    /// ⭐ ONE ENTRY IS REWRITTEN IN PLACE RATHER THAN ONLY APPENDED: see
    /// <see cref="RecordBrownout"/>, whose episode coalescer bumps an existing entry's
    /// <see cref="HistoryEntry.SubjectB"/> edge count. That is a hashed change, deliberately —
    /// the alternative was unsaved state deciding what gets written.
    /// </summary>
    public sealed class HistorySystem : ISimSystem, IStatefulSystem
    {
        public string Name => "History";
        // Every tick: the event bus double-buffers per tick (events are readable for
        // exactly one tick after publish), so a 10-tick sampler would miss nearly all
        // of them (found by the effect-spine review).
        public int IntervalTicks => 1;

        public const int MaxEntries = 200;

        public readonly List<HistoryEntry> Entries = new List<HistoryEntry>(MaxEntries);

        // v1 = tick+text only (Kind implicitly Generic, subjects 0).
        // v2 = tick+kind+subjectA+subjectB+text (this build).
        public ushort StateVersion => 2;

        public void Tick(Simulation sim)
        {
            long tick = sim.TickCount;

            foreach (var alarm in sim.Events.Read<AlarmRaisedEvent>())
                Add(tick, $"{alarm.SourceId}: {alarm.Message}", HistoryKind.Alarm);

            // Keep the CitizenId (previously discarded) and name the crew member. NeedsSystem.Kill
            // removes the citizen from the store the same tick it publishes CitizenDiedEvent, and
            // HistorySystem reads events one tick later — so in the live death path the id lookup
            // misses. The event now CARRIES the name (P2 wave-2 contract), so the text names the
            // dead from CitizenDiedEvent.Name when the lookup misses; a null/empty name still
            // degrades to the neutral "A crew member" line. The id (SubjectA) is always retained.
            foreach (var death in sim.Events.Read<CitizenDiedEvent>())
                Add(tick, DeathText(sim, death.CitizenId, death.Name), HistoryKind.Death, death.CitizenId);

            foreach (var goal in sim.Events.Read<GoalCompletedEvent>())
                Add(tick, $"Objective complete: {goal.Text}", HistoryKind.Goal);

            foreach (var brownout in sim.Events.Read<BrownoutChangedEvent>())
                RecordBrownout(tick, brownout);

            foreach (var rel in sim.Events.Read<RelationshipChangedEvent>())
                Add(tick, $"{NameOf(sim, rel.From)}'s regard for {NameOf(sim, rel.To)} shifted.",
                    HistoryKind.RelationshipChanged, rel.From, rel.To);

            foreach (var arg in sim.Events.Read<ArgumentEvent>())
                Add(tick, $"{NameOf(sim, arg.A)} and {NameOf(sim, arg.B)} argued.",
                    HistoryKind.Argument, arg.A, arg.B);

            foreach (var bond in sim.Events.Read<BondEvent>())
                Add(tick, $"{NameOf(sim, bond.A)} and {NameOf(sim, bond.B)} grew closer.",
                    HistoryKind.Bond, bond.A, bond.B);

            foreach (var build in sim.Events.Read<ConstructionCompletedEvent>())
                Add(tick, $"{NameOf(sim, build.BuilderId)} finished a construction.",
                    HistoryKind.ConstructionCompleted, build.BuilderId);

            // E0-5: build's inverse deserves the same Chronicle trace build gets. The DEVICE KIND
            // rides the event because RemoveDevice already ran — an id lookup here would always
            // miss, exactly as CitizenDiedEvent.Name exists to solve.
            foreach (var strip in sim.Events.Read<DeconstructCompletedEvent>())
                Add(tick, StripText(sim, strip), HistoryKind.DeconstructCompleted, strip.WorkerId);

            // ⭐⭐ D1 — THE REPAIR ARRIVES IN THE LOG. Build had a line since N4 and its inverse
            // since E0-5; the wreck start's headline verb had none, which is why the MOSS console
            // carried a standing caveat saying recoveries could not be shown. It can now.
            foreach (var repair in sim.Events.Read<RepairCompletedEvent>())
                Add(tick, RepairText(sim, repair), HistoryKind.RepairCompleted,
                    repair.WorkerId, repair.DeviceId);

            foreach (var fitted in sim.Events.Read<DeviceCommissionedEvent>())
                Add(tick, CommissionText(fitted), HistoryKind.DeviceCommissioned, fitted.DeviceId);
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ D6 — THE BROWNOUT COALESCER. The ship's log stops being a power ticker.
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// How long one brownout EPISODE lasts as far as the log is concerned: every
        /// <see cref="BrownoutChangedEvent"/> on a network within this many ticks of that network's
        /// newest surviving <see cref="HistoryKind.Brownout"/> entry folds INTO that entry instead
        /// of appending a new one. 36 000 ticks = one sim-hour at 10 Hz.
        ///
        /// <para><b>A CODE CONSTANT, NOT A DEF FIELD, DELIBERATELY</b> — M2-1's rule-not-tunable
        /// precedent (<c>MinDaysOfFood</c>): a def scalar would move P4/P5 for a number nobody
        /// tunes, and a def field pinned only by a checksum is not pinned at all.</para>
        /// </summary>
        public const long BrownoutQuietTicks = 36000;

        /// <summary>
        /// <b>THE DEFECT (measured on the shipped wreck, unmodified, before this method existed):</b>
        /// <c>PowerSystem.Balance</c> edge-detects at 1 Hz per network and the battery sawtooth makes
        /// it flap, so the wreck published <b>22 562</b> brownout edges in its first sim-day on one
        /// network. At sim-hour 5.56 (tick 200 000) the 200-entry ring held <b>200 Brownout entries
        /// and nothing else</b> — the three boot alarms and four boot notes had already been evicted,
        /// and the whole surviving window spanned 8 510 ticks (14 sim-minutes). A repair, a thaw or a
        /// death posted an hour earlier was gone before the player could open the console.
        ///
        /// <para><b>THE MECHANISM, AND IT IS RIMWORLD'S.</b> <c>docs/design/rimworld-reference.md</c>
        /// §11.1 separates two channels with different contracts: the <b>alert stack</b> is a
        /// DERIVED condition that exists exactly while it holds, and <b>letters</b> are fired once by
        /// an EVENT and persist until dismissed — §11.3 calls letters *"the event log the player
        /// actually reads"*. A brownout that flaps at 1 Hz is a CONDITION, and RimWorld would never
        /// fire a letter per flap. This ring is the letter channel; the condition belongs on D2's
        /// alerts bar and, later, M5-2's stack. So the log keeps ONE line per episode.</para>
        ///
        /// <para><b>NO NEW SAVED STATE, AND THAT IS THE WHOLE REASON FOR THIS SHAPE.</b> The throttle
        /// is derived from the ring, which is already saved and already hashed, so a save taken
        /// mid-episode restores mid-episode and the next edge coalesces exactly as it would have in
        /// an uninterrupted run. A private <c>_lastBrownoutTick</c> field would have been the
        /// disease <c>PowerSystem._wasBrownout</c> already has: unsaved state that decides what gets
        /// written.</para>
        ///
        /// <para><b>IT COALESCES RATHER THAN DROPS, and that is an honesty requirement, not a
        /// flourish.</b> A plain drop would log *"browned out"* and swallow the recovery three
        /// minutes later, leaving the player looking at a fault that no longer exists. Folding the
        /// edge into the existing entry lets the surviving line state the CURRENT state and how many
        /// changes it took to get there.</para>
        ///
        /// <para><see cref="HistoryEntry.SubjectA"/> now carries the NETWORK ID (it was 0 before).
        /// It has to: without it the scan cannot tell network 1's episode from network 2's, and two
        /// flapping networks would fold into one nonsense line. This is a repurpose of a field
        /// documented as "citizen or device" — the <see cref="HistoryKind"/> disambiguates it, the
        /// same way <see cref="HistoryKind.DeconstructCompleted"/>'s SubjectA is a worker and
        /// <see cref="HistoryKind.DeviceCommissioned"/>'s is a device. It is hashed, so it moves
        /// pins on any fixture that browns out at all.</para>
        ///
        /// <para>⭐⭐ <b>AND <see cref="HistoryEntry.SubjectB"/> IS AN EPISODE WORD, NOT A BARE
        /// COUNT — see <see cref="EpisodeWord"/>. The direction bit is not decoration; without it
        /// this method could not tell a REAL edge from a duplicate, and the duplicate is a
        /// determinism bug.</b> Independent review MEASURED it on the shipped wreck: save at tick
        /// 135 000 (mid-brownout), reload, run both on 60 000 ticks, and the HIST fold diverged
        /// (<c>eff48a500b403996</c> vs <c>eff48a500b4e5117</c>) on a single datum — one episode's
        /// edge count, 1036 against 1037. Cause: <c>PowerSystem</c> is deliberately NOT
        /// <see cref="IStatefulSystem"/>, so <c>_wasBrownout</c> restores as <c>false</c> and
        /// re-publishes a <see cref="BrownoutChangedEvent"/> for a network that was already shedding
        /// (the same happens on any topology rebuild). BEFORE this package that duplicate was one
        /// more ring entry that evicted within ~200 s, which is exactly why
        /// <c>PowerSystem</c>'s own header could say "nothing hashed moves" and be right. Coalescing
        /// folded it into a hashed field that never evicts, and the claim went false.</para>
        ///
        /// <para><b>THE FIX IS AN IDEMPOTENCY RULE DERIVED FROM THE RING, and it is exact rather
        /// than heuristic:</b> <c>PowerSystem.Balance</c> publishes only on a CHANGE
        /// (<c>if (_wasBrownout[net] != shedAny)</c>), so within one uninterrupted run a network's
        /// edges STRICTLY ALTERNATE. An incoming edge whose direction equals the direction this ring
        /// already records for that network therefore cannot be a real transition — it is a restore
        /// or rebuild artefact — and is dropped. Note the direction test deliberately ignores
        /// <see cref="BrownoutQuietTicks"/>: an episode boundary does not break alternation (the
        /// next real edge still flips), so a same-direction edge is a duplicate whether the window
        /// is open or shut.</para>
        ///
        /// <para>⚠️ <b>TWO RESIDUALS, AND THE SECOND ONE IS REACHABLE ON THE SHIPPED WRECK. NEITHER
        /// IS CLOSED BY THIS RULE.</b></para>
        ///
        /// <para><b>RESIDUAL 1 — the evicted-episode corner.</b> The rule can only see what is still
        /// IN the ring. If a network's newest brownout entry has been evicted — 200 newer entries
        /// pushed past it — a duplicate appends a fresh episode and a reload diverges. Unreachable
        /// in practice on the shipped wreck (its whole day-1 ring is ~30 entries now, which is the
        /// point of this package) but real.</para>
        ///
        /// <para>⛔ <b>RESIDUAL 2 — A SAVE TAKEN ON AN EPISODE'S OPENING TICK NEVER RE-CONVERGES,
        /// AND THIS RULE STRUCTURALLY CANNOT FIX IT.</b> Found by independent review; re-measured
        /// here on the shipped wreck. The rule DROPS a duplicate edge; it cannot RECONSTRUCT an edge
        /// the loaded sim never published. With <c>_wasBrownout</c> reset, the loaded sim re-derives
        /// the episode's opening edge on a LATER 1 Hz <c>Balance</c> pass than the live sim did, so
        /// the coalesced entry's hashed TICK STAMP differs — measured +10 ticks at the wreck's
        /// 164 361 episode (edge counts equal) and +80 ticks at its 200 371 episode (edge counts 34
        /// vs 32). Because the entry is coalesced and never evicted, the difference is PERMANENT and
        /// COMPOUNDS into later episodes (at 236 391: live <c>t=236391,e=218</c> vs loaded
        /// <c>t=236511,e=216</c>; at 344 571: 74 edges vs 72).</para>
        ///
        /// <para>⭐ <b>IT IS NARROW, AND THE WIDTH WAS SWEPT RATHER THAN ASSUMED:</b> the divergent
        /// save window sits at the episode boundary and ENDS on the tick the entry is stamped —
        /// measured <b>1 tick</b> at the 128 361 and 164 361 episodes (36- and 21-tick sweeps around
        /// each, everything else clean) and <b>11 ticks</b> (200 361–200 371) at the 200 371 episode.
        /// So of order 1–11 ticks in every ~36 000. Every non-boundary tick swept is clean, which is
        /// what <see cref="ShipSystemsTests"/>' sibling and
        /// <c>ChronicleSignalTests.TheShippedWreck_ReplaysBitIdentically_WhenTheSaveIsTakenMidEpisode</c>
        /// pin — read that test's name literally: MID-episode, not AT a boundary.</para>
        ///
        /// <para>⚠️ <b>ON <c>main</c> THE SAME PERTURBATION EXISTS AND SELF-HEALS</b> — pre-fix each
        /// edge was its own entry, so a mis-stamped one evicted within ~200 s. Coalescing is what
        /// makes it permanent. That is D1's mechanism in a second costume, and it is the reason the
        /// honest fix for <c>_wasBrownout</c> is the SAME one: make <c>PowerSystem</c> stateful, a
        /// new SYSS chapter that moves P1/P2/P3. <b>FILED, not chased</b> — and it is now the
        /// strongest argument for that package rather than a footnote to it.</para>
        /// </summary>
        private void RecordBrownout(long tick, in BrownoutChangedEvent e)
        {
            uint net = (uint)e.NetworkId;

            for (int i = Entries.Count - 1; i >= 0; i--)
            {
                var prior = Entries[i];
                if (prior.Kind != (byte)HistoryKind.Brownout || prior.SubjectA != net) continue;

                // IDEMPOTENCY FIRST, and OUTSIDE the window test — see the header. Edges alternate
                // in any uninterrupted run, so a same-direction edge is a restore/rebuild duplicate.
                if (BrownoutIsShedding(prior.SubjectB) == e.InBrownout) return;

                if (tick - prior.Tick >= BrownoutQuietTicks) break; // the episode timed out
                uint word = EpisodeWord(BrownoutEdges(prior.SubjectB) + 1, e.InBrownout);
                Entries[i] = new HistoryEntry(prior.Tick, BrownoutEpisodeLine(e.NetworkId, word),
                                              (byte)HistoryKind.Brownout, net, word);
                return;
            }

            uint first = EpisodeWord(1, e.InBrownout);
            Add(tick, BrownoutEpisodeLine(e.NetworkId, first), HistoryKind.Brownout, net, first);
        }

        // ───────────────────────────── the episode word (HistoryEntry.SubjectB on a Brownout entry)

        /// <summary>
        /// A <see cref="HistoryKind.Brownout"/> entry's <see cref="HistoryEntry.SubjectB"/> packs
        /// TWO facts: <b>bit 0 is the direction the episode currently sits in</b> (1 = shedding),
        /// and <b>bits 1.. are the edge count</b>. Both are hashed and both are saved, because they
        /// are the same already-captured field — no <c>StateVersion</c> bump, no new chapter.
        ///
        /// <para>⛔ <b>THE DIRECTION BIT CANNOT BE DERIVED FROM THE COUNT'S PARITY.</b> An earlier
        /// draft of this package assumed it could ("odd = shedding"). It is false: an episode whose
        /// window expired mid-recovery BEGINS with a recovery edge, so the mapping from parity to
        /// direction depends on the first edge's direction and is not recoverable. Measured on the
        /// shipped wreck: an entry at 1036 edges read "recovered" while one at 891 read "shedding",
        /// and another at 647 read "recovered" — both parities on both sides.</para>
        /// </summary>
        public static uint EpisodeWord(uint edges, bool shedding) => (edges << 1) | (shedding ? 1u : 0u);

        /// <summary>Edges folded into a brownout episode entry (≥ 1).</summary>
        public static uint BrownoutEdges(uint episodeWord) => episodeWord >> 1;

        /// <summary>Whether the episode entry's network is shedding as of its newest folded edge.</summary>
        public static bool BrownoutIsShedding(uint episodeWord) => (episodeWord & 1u) != 0u;

        /// <summary>
        /// ⭐ <b>Whether this episode entry RECORDS A FAULT — the discriminator the MOSS ledger's
        /// LAST FAULT column runs on</b> (<c>ShipSystems.IsNotAFault</c>), and the fix for the
        /// second defect independent review found: coalescing had made a fault line CLEAR ITSELF.
        /// The whole episode is one entry whose text is rewritten in place, so a recovery overwrote
        /// the record of its own fault and the column's "recovered" text sniff then skipped the only
        /// evidence the network had ever shed. Measured on the driven wreck at tick 864 000: 3 of 21
        /// episodes ended recovered, and the reactor row reported the tick-814 211 episode while the
        /// NEWER 850 221 one was skipped — the inversion of spec §5.1.
        ///
        /// <para>The test is structural and direction-independent. An episode contains a brownout
        /// iff it is shedding now, OR it has folded two or more edges (edges alternate, so an entry
        /// that opened on a recovery and has ≥ 2 edges must have shed in between). The one entry
        /// that records no fault is the single-edge pure recovery — <i>"Power network 1
        /// recovered."</i> — which must never be LAST FAULT and never is.</para>
        /// </summary>
        public static bool BrownoutEpisodeRecordsAFault(uint episodeWord)
            => BrownoutIsShedding(episodeWord) || BrownoutEdges(episodeWord) >= 2;

        /// <summary>
        /// ⭐ THE CANONICAL FAULT SENTENCE for a power network, in ONE place. It is both the opening
        /// line of a shedding episode and the text the MOSS ledger's LAST FAULT column renders for
        /// that episode however it later develops (<c>ShipSystems.Fault</c>) — so the column can
        /// never print "… CURRENTLY RECOVERED" under a heading that means the opposite, and can
        /// never depend on where a 56-character truncation happens to land.
        /// </summary>
        public static string BrownoutFaultLine(uint networkId)
            => $"Power network {networkId} browned out — non-critical loads shed.";

        /// <summary>
        /// The rendered line for an episode entry, from its structural word alone — one edge or a
        /// thousand.
        ///
        /// <para>⚠️ <b>"browned out" IS A LOAD-BEARING LITERAL, NOT PROSE.</b> The reactor row asks
        /// <c>ShipSystems.Fault</c> for a <see cref="HistoryKind.Brownout"/> entry whose text
        /// contains it (<c>ShipSystems.cs:457</c>). Every multi-edge form below leads with the
        /// FAULT and states the current state second — which is both the honest ordering (the
        /// episode began with something going wrong) and what keeps that join alive. The
        /// single-edge pure recovery deliberately does NOT contain it.</para>
        ///
        /// <para>A count is only printed from the second edge, where it is ≥ 2 — so "changes" never
        /// needs a pluralisation rule, a class of table this repo refuses
        /// (<c>ThawGate.Describe</c>'s stated reason).</para>
        ///
        /// <para>PUBLIC so a test can author a REALISTIC episode entry — one whose text and whose
        /// episode word agree, as they always do in shipped code because this method is the only
        /// producer of both halves. A fixture that hand-writes placeholder prose beside a real
        /// episode word is testing a state the sim cannot reach; the first draft of
        /// <c>ChronicleSignalTests.ARecoveredBrownoutEpisode_…</c> did exactly that and failed
        /// against the <c>"browned out"</c> gate for the wrong reason.</para>
        /// </summary>
        public static string BrownoutEpisodeLine(ushort networkId, uint episodeWord)
        {
            uint edges = BrownoutEdges(episodeWord);
            bool shedding = BrownoutIsShedding(episodeWord);
            if (edges <= 1)
                return shedding
                    ? BrownoutFaultLine(networkId)
                    : $"Power network {networkId} recovered.";
            return shedding
                ? $"Power network {networkId} browned out — non-critical loads shed; {edges} changes within the hour, still shedding."
                : $"Power network {networkId} browned out — non-critical loads shed; {edges} changes within the hour, since recovered.";
        }

        /// <summary>
        /// "Okafor overhauled the scrubber (scrub_a)." / "…serviced…" / "…patched up… with salvage."
        /// / "…jury-rigged…, with nothing to fix it properly."
        ///
        /// <para>FOUR ARMS, mirroring <see cref="StripText"/>'s three and
        /// <c>MaintenanceSystem.RestoredCondition</c>'s four exactly. The tier is the only thing
        /// that distinguishes a machine restored to new from one patched with the shredded remains
        /// of another machine, and on a wrecked ship that difference IS the story: a jury-rig is a
        /// promise to come back.</para>
        /// </summary>
        private static string RepairText(Simulation sim, in RepairCompletedEvent e)
        {
            string who = NameOf(sim, e.WorkerId);
            string what = string.IsNullOrEmpty(e.DeviceName)
                ? "the " + ((DeviceKind)e.Device).ToString().ToLowerInvariant()
                : "the " + ((DeviceKind)e.Device).ToString().ToLowerInvariant() + " (" + e.DeviceName + ")";
            switch ((RepairTier)e.Tier)
            {
                case RepairTier.Overhaul:     return $"{who} overhauled {what} — as good as new.";
                case RepairTier.Service:      return $"{who} serviced {what}.";
                case RepairTier.SalvagePatch: return $"{who} patched up {what} with salvage.";
                default:                      return $"{who} jury-rigged {what} — there was nothing aboard to fix it properly.";
            }
        }

        /// <summary>"A controller module was fitted to the reclaimer (recl_b) — it answers MOSS now."
        /// Nobody is named: commissioning is a command the player pays for, not work a crew member
        /// does, and inventing a worker would be a lie the Chronicle is specifically for avoiding.</summary>
        private static string CommissionText(in DeviceCommissionedEvent e)
        {
            string kind = ((DeviceKind)e.Device).ToString().ToLowerInvariant();
            string what = string.IsNullOrEmpty(e.DeviceName) ? "the " + kind : $"the {kind} ({e.DeviceName})";
            return $"A controller module was fitted to {what} — it answers MOSS now.";
        }

        /// <summary>"Ito stripped the scrubber for salvage." / "Ito stripped the fabricator for
        /// swarf." / "Ito stripped the light, and it was worth nothing."
        ///
        /// <para>THREE ARMS, NOT TWO, SINCE THE WRECK START. A device below the Parts cliff now pays
        /// <see cref="ItemKind.Swarf"/> rather than nothing, so a yield of 1 no longer implies the
        /// machine was worth keeping — the event carries the KIND and this line names it. Reading
        /// only <c>Yield &gt; 0</c> would report a shredded machine as ordinary salvage, which is the
        /// one thing the Chronicle is for on a wrecked ship: remembering what you cannibalised.</para>
        ///
        /// <para>A zero yield is still stated rather than hidden. It is now reachable only through a
        /// content retune (<c>deconstruct.device_swarf = 0</c>, or a wall whose recovery floors to
        /// nothing), not through condition.</para></summary>
        private static string StripText(Simulation sim, DeconstructCompletedEvent e)
        {
            string who = NameOf(sim, e.WorkerId);
            string what = e.Kind == (byte)DeconstructKind.Wall
                ? "a wall"
                : "the " + ((DeviceKind)e.Device).ToString().ToLowerInvariant();
            if (e.Yield <= 0) return $"{who} stripped {what}, and it was worth nothing.";
            return (ItemKind)e.YieldKind == DeconstructSystem.WreckSalvage
                ? $"{who} stripped {what} for swarf — it was too far gone for parts."
                : $"{who} stripped {what} for salvage.";
        }

        /// <summary>Citizen name if the sim can still resolve the id, else a neutral placeholder.</summary>
        private static string NameOf(Simulation sim, uint id)
            => id != 0 && sim.Citizens.TryGet(id, out var c) && !string.IsNullOrEmpty(c.Name)
                ? c.Name
                : "A crew member";

        /// <summary>
        /// Names the dead: the still-resolvable citizen name first, then the name the
        /// event carried (the live same-tick-removal path), then the neutral fallback.
        /// </summary>
        private static string DeathText(Simulation sim, uint id, string eventName)
        {
            if (id != 0 && sim.Citizens.TryGet(id, out var c) && !string.IsNullOrEmpty(c.Name))
                return $"{c.Name} has died.";
            if (!string.IsNullOrEmpty(eventName))
                return $"{eventName} has died.";
            return "A crew member has died.";
        }

        private void Add(long tick, string text, HistoryKind kind, uint subjectA = 0, uint subjectB = 0)
        {
            if (Entries.Count >= MaxEntries) Entries.RemoveAt(0);
            Entries.Add(new HistoryEntry(tick, text, (byte)kind, subjectA, subjectB));
        }

        /// <summary>
        /// Append a categorised entry through the same capped buffer the event ingestion
        /// uses. Public so the eulogy renderer (<see cref="EulogySystem"/>, host-registered
        /// after this system) can write its Eulogy entry into the ship's history — and thus
        /// the Chronicle — the same tick it reads the death.
        /// </summary>
        public void Record(long tick, string text, HistoryKind kind, uint subjectA = 0, uint subjectB = 0)
            => Add(tick, text, kind, subjectA, subjectB);

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(Entries.Count);
            for (int i = 0; i < Entries.Count; i++)
            {
                var e = Entries[i];
                writer.Write(e.Tick);
                writer.Write(e.Kind);
                writer.Write(e.SubjectA);
                writer.Write(e.SubjectB);
                writer.Write(e.Text);
            }
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version == 0) return; // no such blob is ever written
            Entries.Clear();
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                if (version >= 2)
                {
                    long tick = reader.ReadInt64();
                    byte kind = reader.ReadByte();
                    uint subjectA = reader.ReadUInt32();
                    uint subjectB = reader.ReadUInt32();
                    string text = reader.ReadString();
                    Entries.Add(new HistoryEntry(tick, text, kind, subjectA, subjectB));
                }
                else // v1: tick + text only; kind defaults to Generic, subjects to 0.
                {
                    long tick = reader.ReadInt64();
                    string text = reader.ReadString();
                    Entries.Add(new HistoryEntry(tick, text));
                }
            }
        }

        public ulong StateChecksum()
        {
            ulong h = 0x48495354UL; // 'HIST'
            for (int i = 0; i < Entries.Count; i++)
            {
                var e = Entries[i];
                h = h * 31UL + (ulong)e.Tick;
                h = h * 31UL + e.Kind;
                h = h * 31UL + e.SubjectA;
                h = h * 31UL + e.SubjectB;
            }
            return h;
        }
    }
}
