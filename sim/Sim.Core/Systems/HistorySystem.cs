using System;
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

        // ⭐⭐ b3-R (owner-ruled 2026-08-03). The ORDER the player gave died mid-way and the ship
        // said nothing that outlived the frame. Three of the six `JobDropReason`s carry a LIVE badge
        // (the host re-asks the sim's killing question every render); the other three —
        // `Displaced`, `CargoLost`, `NoRouteToConsumable` — are per-worker transients with no
        // standing world question to re-ask, so under the live-re-ask discipline no honest badge is
        // available and the order evaporated permanently (MECHANICS §13.25 b3-R). The log is the
        // channel that CAN hold them: a badge says what is true now, history says what happened.
        // ALL SIX write the line, badge or no badge, for that reason.
        OrderDropped = 16,         // "ORDER DROPPED — <who> let go of <machine>: <why>" (MaintenanceSystem.Abandon)
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
    /// ⭐ TWO ENTRY KINDS ARE REWRITTEN IN PLACE RATHER THAN ONLY APPENDED: see
    /// <see cref="RecordBrownout"/>, whose episode coalescer bumps an existing entry's
    /// <see cref="HistoryEntry.SubjectB"/> edge count, and <see cref="RecordAlarm"/>, which does
    /// the same for a REPEATING alarm's firing count. That is a hashed change, deliberately —
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
                RecordAlarm(tick, $"{alarm.SourceId}: {alarm.Message}");

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

            // ⭐⭐ b3-R — THE ORDER THAT DIED MID-WAY LEAVES A TRACE. `MaintenanceSystem.Abandon`
            // publishes only when the abandoned job was `Citizen.HeldByOrder` — the hold IS the
            // order — so this stream is the RARE one by construction: the dispatcher's own abandons
            // (thousands a day on an unattended ship, which is why M1-H has a backoff funnel) never
            // reach the bus at all.
            //
            // ⛔ NO COALESCER HERE, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT — say it where
            // the next reader of `RecordAlarm`/`RecordBrownout` will look for one. Those two exist
            // because a CONDITION was firing an event at 1 Hz forever (§13.8.1, §13.44). A dropped
            // order needs a player to have clicked a machine and the sim to have taken the job and
            // the world to have changed under it; one click can produce at most one drop, and OD-H
            // guarantees nothing re-recruits her afterwards. There is no repeating source to fold.
            foreach (var drop in sim.Events.Read<OrderDroppedEvent>())
                Add(tick, OrderDroppedText(sim, drop), HistoryKind.OrderDropped,
                    drop.CitizenId, drop.DeviceId);
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ RING SATURATION — THE ALARM COALESCER. A standing klaxon is one line, not the ring.
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// How long one ALARM RUN lasts as far as the log is concerned: a repeat of an alarm whose
        /// identical line is still the newest of its kind in the ring, and whose run OPENED within
        /// this many ticks, folds into that entry instead of appending. 36 000 ticks = one sim-hour
        /// at 10 Hz, the same window <see cref="BrownoutQuietTicks"/> uses for the same reason.
        ///
        /// <para><b>A CODE CONSTANT, NOT A DEF FIELD</b> — M2-1's rule-not-tunable precedent, and
        /// <see cref="BrownoutQuietTicks"/>' precedent directly: a def scalar would move P4/P5 for
        /// a number nobody tunes, and a def field pinned only by a checksum is not pinned at all.
        /// It is a SEPARATE constant from the brownout window on purpose — the two mechanisms are
        /// unrelated and either may be retuned without dragging the other with it.</para>
        ///
        /// <para>⭐ <b>THE WINDOW IS MEASURED FROM THE RUN'S FIRST FIRING, NOT ITS LAST, AND THAT
        /// IS A DELIBERATE CHOICE AGAINST A LONGER-LIVED ENTRY.</b> Measuring from the last firing
        /// would give a permanently-sounding alarm exactly ONE entry for the whole run — which
        /// sounds better and is worse: the MOSS fault log renders the ring's LAST 14 ENTRIES
        /// POSITIONALLY (<c>GameSession.BuildLog</c>), so an entry frozen at its old ring position
        /// scrolls out of the tail as the ship's story grows and a still-sounding alarm becomes
        /// INVISIBLE. Re-announcing once per sim-hour keeps a standing fault readable in the tail
        /// and in every day of the Chronicle, at ≤ 25 entries per sim-day against a 200 ring.</para>
        /// </summary>
        public const long AlarmQuietTicks = 36000;

        /// <summary>
        /// <b>THE DEFECT (measured on the shipped wreck, unmodified, before this method existed;
        /// <c>--ship wreck</c> is what <c>./play.sh</c> boots, and no pin covers it).</b> The one
        /// shipped MOSS rule <c>content/core/SimDefs/rules/overheat_guard.moss</c> fires
        /// <c>alarm("THERMAL LOAD HIGH — check radiators")</c> every 60 s while <c>ship.heat</c> is
        /// under 0.5, and on the wreck the ship never warms back up (MECHANICS §13.2). Driven
        /// unattended: the first firing lands at tick <b>1 085 400</b> (day 1.26) and one arrives
        /// every 600 ticks after it, so the 200-entry ring is FULL OF ONE SENTENCE by roughly tick
        /// 1 205 400 — day 1.4. At three sim-days the ring held <b>197 identical alarm lines</b>
        /// plus 3 brownout episodes and NOTHING ELSE: the four boot lines, every repair, every
        /// machine-failure alarm and every thaw had been evicted, and the whole surviving window
        /// spanned 117 600 ticks (3.3 sim-hours) of a three-day run. Both consumers read this one
        /// ring — the Chronicle and the MOSS fault log — so both drowned at once.
        ///
        /// <para><b>THE MECHANISM IS D6's, AND D6's IS RIMWORLD's.</b> See
        /// <see cref="RecordBrownout"/>: <c>docs/design/rimworld-reference.md</c> §11.1 separates
        /// the <b>alert stack</b> (a DERIVED condition that exists exactly while it holds) from
        /// <b>letters</b> (fired once by an EVENT, and persisting). A klaxon that repeats every
        /// 60 s because a ship is cold is a CONDITION, and RimWorld would never fire a letter per
        /// tick of one. This ring is the letter channel, so the log keeps ONE line per run.</para>
        ///
        /// <para><b>IDENTITY IS THE RENDERED LINE, and it is exact rather than fuzzy.</b> An alarm
        /// carries no ids — <c>AlarmRaisedEvent</c> is two strings — so there is no structural key
        /// to match on, and inventing one (a hash of the text in <see cref="HistoryEntry.SubjectA"/>)
        /// would put a collision risk into a HASHED field. Instead a candidate entry matches iff its
        /// stored text is EXACTLY what <see cref="AlarmLine"/> would have produced for the incoming
        /// alarm at that entry's own repeat count — i.e. iff this writer could have written it. That
        /// is "same rule id + same message" and nothing else, since the line is
        /// <c>"{SourceId}: {Message}"</c>. ⛔ It is deliberately NOT a text-dedupe of the ring: two
        /// runs of the same alarm separated by a quiet hour are two entries, and an unrelated line
        /// that merely repeats a word is never touched.</para>
        ///
        /// <para>⭐⭐ <b>A FIRST FIRING IS BIT-IDENTICAL TO THE PRE-COALESCING WRITER, ON PURPOSE.</b>
        /// <see cref="AlarmRepeatWord"/> encodes one firing as <b>0</b>, so an alarm that fires once
        /// stores <c>(tick, Alarm, 0, 0)</c> exactly as <c>Add</c> did before this package and folds
        /// into <see cref="StateChecksum"/> identically. Only the SECOND firing of the same line
        /// moves a hash — which is the defect's own case and nothing else. Every alarm on every
        /// pinned fixture was measured to be a single firing or absent (see the package's pin
        /// survey), so the pins hold for that reason rather than by luck.</para>
        ///
        /// <para><b>NO NEW SAVED STATE, AND THAT IS THE WHOLE REASON FOR THIS SHAPE</b> — D6's
        /// argument, unchanged. The throttle is derived from the ring, which is already a save
        /// chapter and already hashed, so a save taken mid-run restores mid-run and the next firing
        /// folds exactly as it would have in an uninterrupted run. <see cref="StateVersion"/> stays
        /// at <b>2</b>: <see cref="HistoryEntry.SubjectB"/> was already written by
        /// <see cref="CaptureState"/> and already folded by <see cref="StateChecksum"/>.</para>
        ///
        /// <para>⚠️ <b>WHY THERE IS NO IDEMPOTENCY RULE HERE, unlike <see cref="RecordBrownout"/> —
        /// AND THE HALF THAT RULE COULD NOT HAVE FIXED ANYWAY.</b> Events cross a save boundary in
        /// TWO directions and this survey must name both, because an earlier draft named only the
        /// first and was therefore CLAUDE.md's fourth shape: a survey whose scope excludes the
        /// violation.</para>
        ///
        /// <para><b>DIRECTION 1 — an event RE-PUBLISHED after a reload.</b> This is what broke D6:
        /// <c>PowerSystem</c> is NOT <see cref="IStatefulSystem"/>, so it re-publishes a brownout
        /// edge a live twin never sent (§13.43.2 — a determinism REGRESSION coalescing created).
        /// Every publisher of <c>AlarmRaisedEvent</c> was checked against that shape:
        /// <c>DesignerRuleSystem</c> IS stateful and saves its <c>every</c> timers, latches and halt
        /// flags (SYSS blob v1), <c>ScriptRuntime</c> likewise; <c>MachineWearSystem</c> fires on a
        /// <c>Device.Condition</c> crossing and condition is saved; <c>NeedsSystem</c> fires once per
        /// death. None can re-publish an alarm a live twin did not, so there is no duplicate to drop
        /// — and a drop rule invented anyway would silently swallow the SECOND real firing of an
        /// alarm that legitimately repeats.</para>
        ///
        /// <para>⛔⛔ <b>DIRECTION 2 — an event DROPPED IN FLIGHT, WHICH IS REAL, REACHABLE ON THE
        /// SHIPPED WRECK, AND MADE PERMANENT BY THIS COALESCER. FILED RESIDUAL, see MECHANICS
        /// §13.44.5.</b> The event bus is NOT a save chapter. An <c>AlarmRaisedEvent</c> published on
        /// the very tick a save is taken is never written, so the loaded sim publishes one FEWER
        /// firing than its twin — the mirror image of direction 1, and no idempotency rule can close
        /// it (dropping duplicates cannot RECONSTRUCT an event that was lost). Driven on the shipped
        /// wreck, 200 000 ticks of run-on: a save on the run's OPENING firing tick 1 085 400 leaves
        /// live <c>1085400/b60</c> against loaded <c>1086000/b60</c> — the whole run stamped 600 ticks
        /// late — and EVERY subsequent run inherits the offset (1121400→1122000, 1157400→1158000, …)
        /// with the trailing counts 34 against 33. A save on a LATER firing tick (1 086 000) diverges
        /// on the count alone. A save on a non-firing tick (1 085 700) is clean on both the alarm
        /// entries and the whole <see cref="Simulation.StateHash"/>. Width: <b>1 tick in 600</b>
        /// (0.17 %) for as long as the klaxon sounds — continuously, on the shipped wreck, from tick
        /// 1 085 400 to end of run.</para>
        ///
        /// <para>⚠️ <b>AND COALESCING IS WHAT MAKES IT PERMANENT — §13.8.1's D6 sentence verbatim,
        /// measured here as a control.</b> With this coalescer reverted to the pre-fix
        /// <c>Add</c>, the same leg reads <c>ALARMS_EQUAL=True HASH_EQUAL=True</c>: each firing was
        /// its own entry and the mis-stamped one evicted. Folding them into an entry that survives
        /// the whole run turns a self-healing perturbation into a compounding one. The closer is the
        /// same family as D6's residual 2 — save-boundary event delivery, not a consumer-side rule.
        /// <b>FILED, not chased</b> (PROCESS §2 "SHIP IT FILED").</para>
        ///
        /// <para>⛔ <b>WHAT THIS DOES NOT FIX:</b> the wreck still gets cold and the rule still fires
        /// 2 512 times in three sim-days (MECHANICS §13.2). The log stops recording each one; the
        /// ship still does them. That is D6's residual in the same words, and closing it is a
        /// content/thermal decision, not a log one.</para>
        /// </summary>
        private void RecordAlarm(long tick, string line)
        {
            for (int i = Entries.Count - 1; i >= 0; i--)
            {
                var prior = Entries[i];
                if (prior.Kind != (byte)HistoryKind.Alarm) continue;

                // THE WINDOW TEST COMES FIRST, and that is both cheaper and exactly equivalent.
                // Entries sit in ASCENDING tick order — appends carry the current tick and both
                // coalescers rewrite in place keeping the entry's ORIGINAL tick — so once a
                // candidate is older than the window, every candidate further back is older still
                // and a match among them would have failed this same test. Testing it before
                // rendering saves building a string for a candidate that cannot be folded into.
                if (tick - prior.Tick >= AlarmQuietTicks) break; // the run timed out — a new line

                // THE IDENTITY TEST: would this writer have produced that entry, for THIS alarm, at
                // that entry's own repeat count? Only then is it the same alarm. The SubjectB == 0
                // arm is the overwhelmingly common one (every alarm that has fired once) and it
                // compares against the base line with NO allocation — AlarmLine(line, 0) returns
                // `line` itself, so the two arms are the same question asked without the garbage.
                bool sameAlarm = prior.SubjectB == 0u
                    ? string.Equals(prior.Text, line, StringComparison.Ordinal)
                    : string.Equals(prior.Text, AlarmLine(line, prior.SubjectB), StringComparison.Ordinal);
                if (!sameAlarm) continue;

                uint word = AlarmRepeatWord(AlarmFirings(prior.SubjectB) + 1);
                Entries[i] = new HistoryEntry(prior.Tick, AlarmLine(line, word),
                                              (byte)HistoryKind.Alarm, prior.SubjectA, word);
                return;
            }

            // ⭐ THE FIRST FIRING'S ZERO COMES FROM AlarmRepeatWord, EXPLICITLY, rather than from
            // Add's default parameter. It is the same value either way — but routing it through the
            // encoder is what makes the bit-identity claim below a property OF THE ENCODER and not a
            // coincidence of two defaults agreeing. With the argument left implicit, a mutation of
            // AlarmRepeatWord's one-firing arm was an EQUIVALENT MUTANT: nothing observed it.
            Add(tick, line, HistoryKind.Alarm, 0, AlarmRepeatWord(1));
        }

        // ─────────────────────────────── the repeat word (HistoryEntry.SubjectB on an Alarm entry)

        /// <summary>
        /// An <see cref="HistoryKind.Alarm"/> entry's <see cref="HistoryEntry.SubjectB"/> is its
        /// FIRING COUNT, with <b>0 meaning one firing</b> — so the first entry of a run is
        /// bit-identical to what the pre-coalescing writer stored, and so a v1/v2 save restored
        /// from before this package reads back as the single firing it was.
        ///
        /// <para>⚠️ <b>THE ONE-FIRING ARM IS ON THE SHIPPED PATH, and it has to be deliberately.</b>
        /// <see cref="RecordAlarm"/> passes <c>AlarmRepeatWord(1)</c> to <c>Add</c> explicitly rather
        /// than letting the parameter default to 0. Both produce 0; the difference is that this
        /// method is then the thing that DELIVERS the bit-identity the pin survey rests on, so
        /// breaking this arm is observable. While the argument was implicit it was not: a mutation
        /// of this expression changed no behaviour at all — an equivalent mutant, found by review.
        /// The folding call site can only ever pass ≥ 2 (<see cref="AlarmFirings"/> returns ≥ 1).</para>
        /// </summary>
        public static uint AlarmRepeatWord(uint firings) => firings <= 1u ? 0u : firings;

        /// <summary>Firings folded into an alarm entry (≥ 1). Inverse of <see cref="AlarmRepeatWord"/>.</summary>
        public static uint AlarmFirings(uint repeatWord) => repeatWord == 0u ? 1u : repeatWord;

        /// <summary>
        /// The rendered line for an alarm entry, from its base line and structural word alone — one
        /// firing or a thousand.
        ///
        /// <para>⚠️ <b>THE BASE LINE IS A PREFIX, AND THAT IS LOAD-BEARING.</b>
        /// <c>ShipSystems.Fault</c> attributes the MOSS ledger's LAST FAULT column by searching an
        /// entry's text for a device NAME (<c>ShipSystems.cs:1101</c>), and <c>Summarize</c>
        /// truncates it to 56 characters. Appending the count leaves both untouched: the name is
        /// still in the text and still in the first 56 characters wherever it was before. Prefixing
        /// a count — "(×60) scrub_a: FLOW FAULT" — would have pushed the name past the truncation on
        /// the longer lines, which is the same class of silent-column failure §13.43.3 records.</para>
        ///
        /// <para>PRIVATE, unlike <see cref="BrownoutEpisodeLine"/>. That sibling is public for a
        /// stated reason — a test authors a realistic episode entry with it — and this one was
        /// given the same sentence by copy, which was false: nothing outside this class calls it.
        /// <c>RingSaturationTests</c> asserts the rendered lines as LITERALS, because here the text
        /// itself is the thing under test and re-deriving it with the code's own expression would
        /// assert nothing. Make it public again when a caller exists, not before.</para>
        /// </summary>
        private static string AlarmLine(string baseLine, uint repeatWord)
        {
            uint firings = AlarmFirings(repeatWord);
            return firings <= 1u
                ? baseLine
                : baseLine + "; " + firings.ToString(System.Globalization.CultureInfo.InvariantCulture)
                           + " times within the hour.";
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
            string what = DevicePhrase(e.Device, e.DeviceName);
            switch ((RepairTier)e.Tier)
            {
                case RepairTier.Overhaul:     return $"{who} overhauled {what} — as good as new.";
                case RepairTier.Service:      return $"{who} serviced {what}.";
                case RepairTier.SalvagePatch: return $"{who} patched up {what} with salvage.";
                default:                      return $"{who} jury-rigged {what} — there was nothing aboard to fix it properly.";
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // ⭐⭐ b3-R — THE DROPPED ORDER'S LINE. The badge is what is true now; this is what happened.
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐⭐ <b>THE ONE AUTHORITY FOR WHAT THE SIM SAYS KILLED AN ORDER</b> — one clause per
        /// <see cref="JobDropReason"/>, and nothing anywhere else may word a drop reason.
        ///
        /// <para>⛔ <b>IT IS NOT A SECOND COPY OF THE BADGE'S SENTENCES, AND THE DIFFERENCE IS
        /// STRUCTURAL RATHER THAN STYLISTIC.</b> The client's <c>BLOCKED_REASON_TEXT</c>
        /// (<c>client/src/wire/messages.js</c>) is keyed by <c>WireFormat.Reason*</c> — the LIVE
        /// re-ask channel, three values, each of them a question the host can put to the sim again
        /// this frame ("NO WAY TO WALK TO IT"). This table is keyed by <see cref="JobDropReason"/> —
        /// <b>six</b> values, a HISTORICAL statement about one moment that no longer exists. Wording
        /// the log through the badge's table would need a mapping that discards three reasons
        /// (exactly the three b3-R is FOR), and wording the badge through this one would put history
        /// prose on a live surface. Two channels, two vocabularies, one authority each.</para>
        ///
        /// <para>⚠️ <b>NO PRONOUNS, DELIBERATELY.</b> <c>Citizen</c> carries no gender, so a clause
        /// saying "she" would be an invention; the crew member is already named by
        /// <see cref="OrderDroppedText"/> before the colon and the clause states the WORLD's reason.
        /// Past tense, because the whole line is.</para>
        ///
        /// <para>The default arm exists only because C# demands totality: a reason declared without a
        /// clause would ship a line that says nothing, which is the silence this package removes.
        /// <c>DroppedOrderChronicleTests.EveryDropReasonHasItsOwnSentence</c> sweeps the CLASS (every
        /// declared member, distinct, never the fallback) rather than listing today's six.</para>
        /// </summary>
        public static string DropReasonClause(JobDropReason reason)
        {
            switch (reason)
            {
                case JobDropReason.NoWorksiteTile:     return "there was nowhere left to stand next to it";
                case JobDropReason.Displaced:          return "the job was interrupted part-way through";
                case JobDropReason.CargoLost:          return "the parts in hand were gone";
                case JobDropReason.NoRouteToWorksite:  return "there was no way to walk to it";
                case JobDropReason.NoRouteToConsumable:return "there was no way to walk to the parts";
                case JobDropReason.NoConsumable:       return "there was nothing aboard to fix it with";
                default:                               return "the sim gave no reason";
            }
        }

        /// <summary>
        /// ⭐⭐ <b>"ORDER DROPPED — Okafor let go of the fabricator (fabricator_1): there was no way
        /// to walk to it."</b> — the line b3-R exists to write.
        ///
        /// <para><b>WHY THE LOG AND NOT A BADGE, in one sentence:</b> a badge is only honest while
        /// the host can RE-ASK the sim's killing question live (<c>GameSession.BuildBlocked</c>'s
        /// fifth walk), and three of the six reasons are per-worker transients with no standing
        /// world question — so those orders died with nothing on any surface at all. The ring has no
        /// such requirement: it records what HAPPENED. All six write the line, including the three
        /// that also badge, because the badge vanishes with the world and the log does not
        /// (MECHANICS §13.25 b3-R, owner-ruled 2026-08-03).</para>
        ///
        /// <para><b>THE PREFIX IS UPPERCASE AND THE REST IS NOT.</b> The MOSS <c>log</c> screen and
        /// the Overview's SENSOR LOG render the raw text with no kind tag (only the Chronicle
        /// prepends <c>[Order]</c>), so the line has to announce itself in its own first two words or
        /// it reads as narration of a repair that never happened.</para>
        ///
        /// <para>⚠️ <b>THE DEVICE IS RESOLVED BY ID, WHICH IS SAFE HERE AND IS NOT SAFE FOR EVERY
        /// EVENT ON THIS BUS.</b> <c>CitizenDiedEvent</c> and <c>DeconstructCompletedEvent</c> carry
        /// their subject's NAME/KIND precisely because the subject is removed from the store on the
        /// publishing tick. A drop is the opposite case: <c>MaintenanceSystem.Abandon</c> is handed a
        /// live <c>Device</c>, and the one path that abandons a DECONSTRUCTED machine
        /// (<c>DriveWorkers</c>' direct <c>AbandonOrphan</c> at <c>:207</c>) deliberately publishes
        /// nothing. The fallback is still written rather than assumed.</para>
        ///
        /// <para>⛔ <b>THE REASON LIVES IN THE TEXT AND IS THEREFORE HASH-EXEMPT</b>, exactly as
        /// <c>RepairTier</c> is: the HIST fold takes tick + kind + subjects only. The structural
        /// fields follow <see cref="HistoryKind.RepairCompleted"/>'s convention — SubjectA the crew
        /// member, SubjectB the machine — so the two halves of one order's life (the drop and, if it
        /// is ever re-ordered and finished, the repair) key the same way.</para>
        /// </summary>
        private static string OrderDroppedText(Simulation sim, in OrderDroppedEvent e)
        {
            string who = NameOf(sim, e.CitizenId);
            string what = sim.Devices.TryGet(e.DeviceId, out var device)
                ? DevicePhrase((byte)device.Kind, device.Name)
                : "a machine";
            return $"ORDER DROPPED — {who} let go of {what}: {DropReasonClause((JobDropReason)e.Reason)}.";
        }

        /// <summary>"the reclaimer (recl_b)", or "the reclaimer" for an unnamed device — the one
        /// phrase every device-naming line in this file composes, so a machine cannot read one way
        /// in a repair line and another in a drop line.</summary>
        private static string DevicePhrase(byte deviceKind, string name)
        {
            string kind = "the " + ((DeviceKind)deviceKind).ToString().ToLowerInvariant();
            return string.IsNullOrEmpty(name) ? kind : kind + " (" + name + ")";
        }

        /// <summary>"A controller module was fitted to the reclaimer (recl_b) — it answers MOSS now."
        /// Nobody is named: commissioning is a command the player pays for, not work a crew member
        /// does, and inventing a worker would be a lie the Chronicle is specifically for avoiding.</summary>
        private static string CommissionText(in DeviceCommissionedEvent e)
        {
            string what = DevicePhrase(e.Device, e.DeviceName);
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
