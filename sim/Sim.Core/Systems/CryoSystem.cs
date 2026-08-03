namespace Perilune.Sim
{
    /// <summary>
    /// ⭐ M3-2 — A POD CYCLES. The wreck's capsules stop being props: a pod whose
    /// <see cref="Device.Progress"/> is above zero counts down, opens, and a named person steps
    /// out onto the floor beside it as a live <see cref="Citizen"/>.
    ///
    /// <para><b>WHAT DRIVES A CYCLE — NOTHING PLAYER-FACING, YET.</b> This package deliberately
    /// ships no verb: <c>ThawCommand</c> and its gate are M3-3's, the MOSS screen op is M3-3's, the
    /// countdown badge on the capsule is M3-4's client-side flourish over <c>Device.Progress</c>,
    /// and the emergency thaw is M3-5's. The only way a cycle starts on this tree is a test writing
    /// <c>Progress</c> directly — which is exactly what the charter's mutation table drives. A pod
    /// that never starts is therefore still CORRECT on the shipping ship today.</para>
    ///
    /// <para><b>NO NEW <c>Device</c> FIELD</b> (<c>Entities/Device.cs:46-49</c>, and
    /// <c>docs/MECHANICS.md</c> §13.27). The four fields this mechanic needs are already hashed
    /// (<c>Simulation.cs:545-555</c>) and already saved (DEVC v1/v2/v3): <see cref="Device.IsOpen"/>
    /// = opened vs still occupied, <see cref="Device.Name"/> = who is inside,
    /// <see cref="Device.Condition"/> = how badly the raid treated it,
    /// <see cref="Device.Progress"/> = the cycle itself.</para>
    ///
    /// <para>⭐ <b>THE RULES, ALL FOUR, ENFORCED HERE AND NOT IN A FUTURE COMMAND.</b></para>
    /// <list type="number">
    /// <item><b>ONE AT A TIME</b> — the owner's stated mechanic ("only one after the other").
    /// At most ONE pod advances per pass, elected by lowest <see cref="Device.Id"/> among the
    /// eligible; every other pod holds its <c>Progress</c> untouched until the elected one is done.
    /// A gate that lived in <c>ThawCommand</c> instead would be bypassed by the emergency thaw, by
    /// a restored save that already holds two live cycles, and by any later writer of
    /// <c>Progress</c>. It belongs in the system.</item>
    /// <item><b>A WRECKED POD NEVER CYCLES</b> (owner decision 9) — below the <c>CryoPod</c> row's
    /// <c>fail</c> threshold the sleeper did not survive the raid, so the capsule is not merely
    /// slow, it is INELIGIBLE: it neither advances nor blocks anyone else. The wreck authors four
    /// such capsules (<c>sim/Sim.Gen/AuthoredShips.cs:1865-1882</c>, <c>WreckPods</c>) and each carries a
    /// <see cref="ItemKind.Corpse"/> and a log line.</item>
    /// <item><b>SINGLE-USE</b> (§13.27, owner batch item 6 = A, unfreeze only) — an OPEN pod is
    /// done forever. That is what lets <see cref="Device.Name"/> be simultaneously the MOSS registry
    /// key and the sleeper's identity without contradiction, and it is why the wreck's one
    /// boot-open capsule (Rell's) can never produce a second Rell.</item>
    /// <item><b>SOMEWHERE TO STAND</b> — a person is placed on the first walkable, device-free
    /// 4-neighbour in <see cref="Int3.Neighbor4"/>'s canonical order (+X, −X, +Y, −Y). If no such
    /// tile exists the pod HOLDS at full progress and stays shut — it does not open into a wall and
    /// it does not put a body inside the furniture. The <see cref="HydroponicsSystem"/> harvest drop
    /// is the shipped precedent for the order; the difference is that a crop may legally land on a
    /// blocked tile and a person may not.</item>
    /// </list>
    ///
    /// <para>⛔ <b>WHY THIS IS AN <see cref="IStatefulSystem"/>, AND WHY THAT IS THE PIN.</b>
    /// <c>Simulation.StateHash</c> folds a system's seed ONLY through this interface
    /// (<c>Simulation.cs:605-608</c>) and <c>SaveWriter</c> writes a SYSS chapter under the same
    /// test (<c>Save/SaveWriter.cs:120-128</c>) — <b>registering a stateless system folds nothing
    /// and saves nothing.</b> W0-6's four "empty" systems moved three pins precisely because all
    /// four implement it (<c>StockZoneSystem.cs:65</c>, <c>ProductionSystem.cs:19</c>,
    /// <c>OreRegistrySystem.cs:22</c>, <c>Space/TradeSystem.cs:23</c>).</para>
    ///
    /// <para>⛔ <b>THE REFUSED ALTERNATIVE, REFUSED EXPLICITLY RATHER THAN BY OMISSION</b>: a
    /// stateless <c>CryoSystem</c> with the emergency-thaw bit on <see cref="Simulation"/>'s save
    /// HEADER. It works, and it is rejected because <b>the header is written by every ship while a
    /// SYSS chapter is written only for the ships that have the system</b> — the bit is cryo state,
    /// so it belongs where cryo state lives. (The third option, a new <c>Device</c> field, is
    /// refused by <c>Device.cs:48</c> and would be a second hashed-field migration.)</para>
    ///
    /// <para>⭐ <b>AND IT SHIPS ONE PIECE OF STATE IT NEVER WRITES: the emergency-thaw "has fired"
    /// bit</b> (<see cref="EmergencyThawFired"/>). M3-5 is the reader AND the writer; M3-2 gives it
    /// a home that is already saved and already hashed. This is M2-1 → M2-19's shape (storage
    /// first, reader later) and it exists so that M3-5 is not a SECOND re-pin. Nothing in this file
    /// or this package sets it — pinned by <c>CryoSystemTests</c>, driven, not scanned.</para>
    ///
    /// <para><b>DETERMINISM.</b> Device store order for the scan, lowest-Id election for the
    /// choice, canonical neighbour order for the tile, no RNG at all, and no allocation on the tick
    /// path. A COMPLETED cycle does allocate — <see cref="Simulation.AddCitizen"/> news up a
    /// <see cref="Citizen"/> and the display name is composed — which is once per thaw, never per
    /// tick, exactly the <see cref="HydroponicsSystem"/> harvest precedent.</para>
    /// </summary>
    public sealed class CryoSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Cryo";

        /// <summary>
        /// ⚠️ <b>10 Hz SINCE M3-5, AND THE CYCLE DID NOT SPEED UP.</b> M3-2 shipped
        /// <c>IntervalTicks => 10</c> because a four-minute countdown needs no finer sampler. M3-5's
        /// emergency watch does: it reads <see cref="CitizenDiedEvent"/>, and the event bus
        /// double-buffers PER TICK (an event published on tick N is readable on tick N+1 and gone on
        /// N+2), so a 10-tick sampler misses nine deaths in ten — the same reason
        /// <see cref="HistorySystem"/> and <see cref="EulogySystem"/> are both 1.
        ///
        /// <para>⛔ <b>THE COUNTDOWN'S CADENCE IS UNCHANGED, and it is preserved by CONSTRUCTION
        /// rather than by retuning <see cref="Dt"/>.</b> <c>Simulation.cs:293</c> dispatches on
        /// <c>_tick % IntervalTicks == 0</c>, so M3-2's pass ran on ticks 0, 10, 20… — and
        /// <see cref="CycleIntervalTicks"/> below re-applies exactly that predicate to exactly the
        /// same counter (<c>Simulation.TickCount</c> IS <c>_tick</c>, not yet incremented when a
        /// system ticks). A capsule therefore advances on the identical ticks by the identical
        /// <see cref="Dt"/>, which is why this is not a pin move and why no <c>ThawGate</c>
        /// "minutes left" number shifts. The alternative — 10 Hz with <c>Dt = 0.1f</c> — would have
        /// been ten float additions where there was one, and float accumulation is not
        /// associative.</para>
        /// </summary>
        public int IntervalTicks => 1;

        /// <summary>M3-2's 1 Hz countdown cadence, re-applied inside <see cref="Tick"/> now that the
        /// system itself is dispatched every tick. Paired with <see cref="Dt"/>; see
        /// <see cref="IntervalTicks"/> for why the pair must stay 10/1f.</summary>
        private const int CycleIntervalTicks = 10;

        /// <summary>
        /// v1 = the emergency-thaw latch alone (M3-2). v2 = M3-5's full emergency record: the latch,
        /// the run-over bit, the capsule the ship elected, and the name of the dead the wake line
        /// has to say. A v1 blob still restores (the version branch in
        /// <see cref="RestoreState"/>); a v2 blob read by a v1 build is skipped whole by the
        /// chapter's length prefix.
        /// </summary>
        public ushort StateVersion => 2;

        /// <summary>Seconds per pass; structural, paired with <see cref="CycleIntervalTicks"/>
        /// (<see cref="HydroponicsSystem"/>'s <c>Dt</c> is the shipped precedent).</summary>
        private const float Dt = 1f;

        /// <summary>
        /// ⭐ THE CYCLE RATE, AND WHY IT IS A CONSTANT HERE RATHER THAN A DEF.
        ///
        /// <para>240 s of sim time from a just-started capsule to a person on the floor — the
        /// charter's "4 min"-scale reference. It is a NAMED CONSTANT because a new def field would
        /// move P4 (the defs-defaults checksum) and P5 (the rules-inclusive checksum), which this
        /// package's pin ritual requires to HOLD, and because a def scalar pinned only by a
        /// checksum is not pinned at all (a behavioural consumer test is owed with it). The shipped
        /// precedent for exactly this trade is <see cref="BuildSystem"/>'s <c>FloorConstructTicks</c>
        /// (<c>Systems/BuildSystem.cs:253-254</c>): a v1 literal, deliberately not a def, so the
        /// defs checksum stays stable.</para>
        ///
        /// <para><see cref="Device.Progress"/> is a 0..1 FRACTION of a cycle, not a second count —
        /// so re-tuning this number rescales what a saved, mid-cycle capsule has left rather than
        /// invalidating it (<see cref="HydroponicsSystem"/>'s <c>GrowSecondsPerCrop</c> comment
        /// makes the same argument for the same reason).</para>
        ///
        /// <para>⚠️ <b>M3-4's countdown badge will DISPLAY this.</b> The client reads
        /// <c>Device.Progress</c> off the wire and renders the remaining time; the seconds it shows
        /// are this constant. Retuning it is therefore a player-visible change, not an internal
        /// one. TODO(M3): promote to a <c>cryo.def</c> scalar when a def package next moves P4/P5
        /// anyway, with a behavioural consumer test in the same commit.</para>
        /// </summary>
        public const float ThawSecondsPerCycle = 240f;

        /// <summary>The authored prefix on every capsule's name
        /// (<c>sim/Sim.Gen/AuthoredShips.cs:1963</c>: <c>"pod_" + pod.Who.ToLowerInvariant()</c>).
        /// <see cref="SleeperName"/> is its inverse.</summary>
        private const string PodNamePrefix = "pod_";

        // The emergency-thaw latch. M3-2 STORED it; M3-5 reads AND writes it. Saved in the SYSS
        // chapter (CaptureState/RestoreState) and folded into Simulation.StateHash (StateChecksum),
        // which is what makes this system's registration a real pin move.
        private bool _emergencyThawFired;

        // ⭐ M3-5's own state, all three saved and the two STRUCTURAL ones folded.
        //
        // `_runEnded`  — the lose state. Every soul aboard is dead and the ship has nothing left to
        //                wake: the one moment OD-10 option A calls honest.
        // `_emergencyPodId` — WHICH capsule the ship elected, 0 = none in flight. It is what tells
        //                `Open` that a completing cycle is the emergency's rather than an ordinary
        //                `ThawCommand`'s, WITHOUT `ThawCommand` knowing anything about it.
        // `_emergencyDeadName` — the dead the wake line has to name, captured at the moment of the
        //                death (240 s before the capsule opens, by which time NeedsSystem.Kill has
        //                long removed the citizen from the store and no id lookup can answer).
        private bool _runEnded;
        private uint _emergencyPodId;
        private string _emergencyDeadName = "";

        /// <summary>
        /// Has the ship's one emergency thaw already fired? Set the first tick the ship notices it
        /// has no living crew — whether or not there was an intact capsule to spend it on, because
        /// the reprieve is spent either way. Once true it is never cleared: a SECOND
        /// <c>LivingCrew == 0</c> cycles nothing ("protects minute three without protecting hour
        /// three").
        /// </summary>
        public bool EmergencyThawFired => _emergencyThawFired;

        /// <summary>
        /// ⭐ <b>THE LOSE STATE, AS SIM STATE — OD-M item 4 = A.</b> True once every soul aboard is
        /// dead, the emergency thaw is spent, and no capsule is counting down. Saved and folded, so
        /// a run that ended stays ended across a save.
        ///
        /// <para>⚠️ <b>M3-5 SHIPS NO ENDING SCREEN, DELIBERATELY.</b> This bit + the
        /// <see cref="HistoryKind.RunEnded"/> Chronicle line + <c>hosts/web</c>'s one-line banner
        /// are the whole player-facing claim; <b>M5-1 owns THE ENDING</b> and reads this. Shipping a
        /// full screen here would duplicate M5-1; shipping nothing would leave the loss silent,
        /// which is the failure this package exists to close.</para>
        /// </summary>
        public bool RunEnded => _runEnded;

        /// <summary>The capsule the emergency thaw is currently cycling, or 0. Host-readable so the
        /// banner can name the sleeper without re-deriving which pod is the emergency's.</summary>
        public uint EmergencyPodId => _emergencyPodId;

        /// <summary>
        /// The one <see cref="CryoSystem"/> in <paramref name="sim"/>'s stack, or null on a stack
        /// that has none. <c>Simulation.Systems</c> is <c>internal</c>, so a host in another
        /// assembly cannot walk it — and the alternative (widening <c>Systems</c>) would open the
        /// whole stack to every caller for one reader's sake.
        /// </summary>
        public static CryoSystem Of(Simulation sim)
        {
            if (sim == null) return null;
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is CryoSystem cryo) return cryo;
            return null;
        }

        /// <summary>
        /// ⚠️ M3-2's test-only setter, KEPT. It exists so the fold-contents and round-trip tests can
        /// set the latch without driving a whole death — a checksum measured with the bit
        /// permanently zero is byte-identical to a checksum that folds nothing. Internal so the
        /// latch cannot be set from outside Sim.Core (a host or the DSL flipping it would be a
        /// hashed-state write from outside the sim).
        /// </summary>
        internal void MarkEmergencyThawFired() => _emergencyThawFired = true;

        /// <summary>⚠️ Test-only, and it exists for the same reason as
        /// <see cref="MarkEmergencyThawFired"/>: <see cref="_runEnded"/> is folded, so the fold test
        /// has to be able to set it without ending a run.</summary>
        internal void MarkRunEndedForTest() => _runEnded = true;

        public void Tick(Simulation sim)
        {
            // ── ⭐ M3-5: THE EMERGENCY THAW. A NAMED EXCEPTION WITH ITS OWN BRANCH ────────────
            //
            // ⛔ IT LIVES HERE AND `ThawCommand` NEVER LEARNS IT EXISTS (OD-10). `ThawCommand` is a
            // player-reachable ISimCommand; any bypass inside it — a skipGate flag, a nullable pod
            // argument, an early return before the term list — is a code path the player can reach,
            // and the first player who finds it uses it as the normal route. The two share the
            // MECHANISM (Progress -> cycle -> AddCitizen) and share NONE of the gate.
            //
            // WHAT IT BYPASSES, stated rather than inferred: the console (term 2), the cycle
            // exclusion (term 3), the rung (term 4), the headroom (term 5) and the price (term 6).
            // All of it, CORRECTLY — every one of those terms presumes a living crew member to
            // satisfy them, and there is none. Term 1, the pod itself, is the one thing it does NOT
            // bypass (`IsIntactPod` below restates it).
            //
            // THE GUARD IS THE CHEAP HALF, and it has to be: this runs 10 Hz on every ship.
            // `AnyoneAlive` returns on the FIRST living citizen, so the normal cost is one array
            // index and one bool test — no allocation, no ledger sample, no room walk.
            if (!AnyoneAlive(sim)) EmergencyWatch(sim);

            // ── M3-2's countdown, at M3-2's cadence (see IntervalTicks) ──────────────────────
            if (sim.TickCount % CycleIntervalTicks != 0) return;

            // ── one at a time: elect the single pod allowed to advance this pass ──────────────
            // Lowest Id among the eligible. Store order and Id order coincide today (EntityStore
            // appends with an increasing id), but the ELECTION is by Id so that a store whose order
            // a future load or compaction changed still elects the same capsule.
            Device elected = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var pod = devices[i];
                if (pod.Kind != DeviceKind.CryoPod) continue;
                if (pod.IsOpen) continue;                       // single-use: an opened pod is done
                if (pod.Progress <= 0f) continue;               // not cycling; nothing starts a cycle here
                if (!pod.IsOperational(sim.Defs)) continue;     // OD-9: a wrecked pod's sleeper is dead
                if (elected == null || pod.Id < elected.Id) elected = pod;
            }
            if (elected == null) return;                        // the whole-ship no-op: zero allocation

            elected.Progress += Dt / ThawSecondsPerCycle;
            if (elected.Progress < 1f) return;

            // Full: clamp rather than overshoot, so a capsule with nowhere to open holds at exactly
            // 1.0 instead of drifting upward tick after tick (and keeps blocking, correctly — the
            // bay is busy with a cycle that has finished counting and cannot finish opening).
            elected.Progress = 1f;
            if (!TryFindExitTile(sim, elected.Pos, out var exit)) return;

            Open(sim, elected, exit);
        }

        /// <summary>
        /// The capsule opens and the sleeper becomes a person. Progress returns to 0 (the cycle is
        /// spent, and <see cref="Device.IsOpen"/> — not a leftover 1.0 — is what makes the pod
        /// single-use), <see cref="CitizenThawedEvent"/> announces it, and the job board is told a
        /// new pair of hands exists.
        ///
        /// <para>⭐ AN INSTANCE METHOD SINCE M3-5, for one reason: the SECOND of the three required
        /// moments is a Chronicle line written HERE, and only this object knows whether the capsule
        /// that just opened is the one the ship elected in the emergency.</para>
        /// </summary>
        private void Open(Simulation sim, Device pod, Int3 exit)
        {
            pod.Progress = 0f;
            pod.IsOpen = true;

            var person = sim.AddCitizen(SleeperName(pod.Name), exit);

            // ⭐ M3-8 — SHE ARRIVES AS SOMEBODY. Her six skill levels and the work she cannot do at
            // all are authored literals keyed by this very name (`SleeperAptitudes`), stamped HERE
            // rather than by the host, because competence is hashed sim state (CITZ v9) and the sim
            // must be fully playable with no persona layer attached at all. The prose that explains
            // the numbers is `AuthoredShips.WreckSleepers()` and rides a host observer on
            // `CitizenThawedEvent`; nothing on this path knows or needs that it exists.
            // A name with no authored row is a no-op: level 0, capable of everything.
            SleeperAptitudes.Apply(person);

            // Matching the ship's own pawn (`AuthoredShips.cs:2181-2185`, the fields at `:2184`:
            // AutoWander/RevealsFog true, HoldPosition false) — the alternative is a thawed
            // sibling standing dead still beside a wandering one. What she does NOT get is work:
            // the priority grid boots all-off (OD-H) and HoldPosition stays false, so she is
            // exactly OD-G's shape — awake, idle, awaiting orders.
            person.AutoWander = true;

            sim.Events.Publish(new CitizenThawedEvent
            {
                Pos = exit,
                CitizenId = person.Id,
                PodId = pod.Id,
            });

            // A new citizen exists and a device changed state on its tile: the board must re-derive
            // its assigned sets (Citizens) and re-read the tile (Tiles).
            sim.JobsDirty |= JobBoardDirty.Citizens | JobBoardDirty.Tiles;

            // ⭐ MOMENT 2 OF THREE: the emergency capsule opens and the Chronicle names BOTH people.
            // The death line is already automatic (`HistorySystem` on `CitizenDiedEvent`); this is
            // the new one, and the whole feature is this message.
            if (pod.Id != 0 && pod.Id == _emergencyPodId)
            {
                _emergencyPodId = 0;
                string dead = string.IsNullOrEmpty(_emergencyDeadName) ? "a crew member" : _emergencyDeadName;
                _emergencyDeadName = "";
                Record(sim, "With " + dead + " dead, the ship woke " + person.Name + ".",
                       HistoryKind.EmergencyThaw, person.Id, pod.Id);
            }
            else
            {
                // ⭐⭐ D1 (owner-triaged 2026-08-02) — THE ORDINARY THAW WAS SILENT, and it is the
                // one the player ORDERS. M3-5 wrote the emergency line and left this arm falling
                // through to nothing, so the single largest change a player can make to the crew
                // roster — a soul waking because they asked for it — left no trace in the ship's
                // log at all. A DISTINCT kind, not a re-use of EmergencyThaw: M5-1 builds the
                // ending out of the emergency line, and "the ship woke somebody because you were
                // dying" and "you woke somebody" are not the same sentence.
                // The capsule is NOT named in the prose: every shipped pod is `pod_<sleeper>`
                // (`AuthoredShips.cs:2022`), so naming it would read "Mbeki came out of capsule
                // pod_mbeki". The pod id rides SubjectB instead, where a renderer can find it.
                // "awaiting orders" is OD-G's shape stated as fact — she boots idle, work grid off.
                Record(sim, person.Name + " came out of cryosleep — awake, and awaiting orders.",
                       HistoryKind.Thaw, person.Id, pod.Id);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // ⭐ M3-5 — THE EMERGENCY THAW AND THE ENDING IT IMPLIES
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>The opening move of a cycle — one pass's worth of progress, byte-identical to
        /// <c>ThawCommand</c>'s (<c>Commands/Commands.cs:939</c>). The two share the MECHANISM; that
        /// is the whole of what they share.</summary>
        private const float StartProgress = Dt / ThawSecondsPerCycle;

        /// <summary>
        /// ⭐ THE WHOLE EXCEPTION, reached only on a ship with nobody alive on it.
        ///
        /// <para><b>THE FOUR OUTCOMES, IN ORDER.</b></para>
        /// <list type="number">
        /// <item><b>A capsule is ALREADY counting down</b> ⇒ do nothing at all, and <b>do not spend
        /// the reprieve</b>. See the ⛔ block below — this is the case that matters most.</item>
        /// <item><b>The reprieve is unspent and there is an intact capsule</b> ⇒ elect it and start
        /// its cycle. The latch flips the same tick, so a second <c>LivingCrew == 0</c> — after the
        /// woken soul dies in hour three — reaches the ending instead.</item>
        /// <item><b>The reprieve is unspent and there is NO intact capsule</b> ⇒ it is still spent
        /// (there was nothing to spend it on) and the run ends on the same tick.</item>
        /// <item><b>The reprieve is spent</b> ⇒ the run ends, UNLESS a capsule is still counting
        /// down. That exception is the grace period, and it is why the ending cannot simply be
        /// "nobody is alive": for 240 s after the last death nobody is alive AND the run is very
        /// much still on.</item>
        /// </list>
        ///
        /// <para>⚠️ <b>THE ENDING IS ANNOUNCED ONCE BECAUSE <see cref="_runEnded"/> IS SAVED AND
        /// FOLDED</b>, not because this branch happens to run once — it runs 10 Hz forever after the
        /// last death. A transient latch would re-announce on every load and would make a restored
        /// ship's <c>HIST</c> fold diverge from its uninterrupted twin.</para>
        /// </summary>
        private void EmergencyWatch(Simulation sim)
        {
            // ⛔⛔ A CAPSULE ALREADY COUNTING DOWN **IS** THE GRACE, AND THE REPRIEVE IS NOT SPENT
            // ON IT. Both halves of that sentence are decisions, and both are the charter's
            // "protects minute three without protecting hour three" read literally:
            //
            //   · DO NOT TOUCH IT. Without this line the election below could pick a capsule the
            //     PLAYER had already paid a `ThawCommand` rung for and reset its `Progress` to one
            //     pass — a paid cycle 216 s into 240 silently thrown away at the exact moment the
            //     player can least afford it. (Found in review, driven.)
            //   · DO NOT BURN THE LATCH. The ship's one free reprieve exists because the player has
            //     nobody left and no way to ask. A player who ALREADY asked, and paid, has not used
            //     it — so it is still there for the next time the crew hits zero. Spending it here
            //     would charge them twice for one rescue.
            //
            // ⇒ IT ALSO MAKES THE UNCONDITIONAL `elected.Progress = StartProgress` BELOW SAFE, and
            // that is why the guard is here rather than at the assignment: past this line NOTHING
            // aboard is cycling, so no capsule the election can reach has progress to lose. A
            // `Progress <= 0f` guard at the assignment would be unreachable and therefore untestable.
            //
            // ⚠️ The window this covers is small and completely reachable: `ThawCommand`'s cycle
            // runs for 240 sim-seconds and the crew can die at any point inside it.
            if (AnyPodCycling(sim)) return;

            if (!_emergencyThawFired)
            {
                _emergencyThawFired = true;

                // The death that just happened is readable for EXACTLY this tick (the bus swaps
                // buffers at the end of every tick). `NeedsSystem` ticks AFTER this system, so a
                // kill on tick N is seen here on tick N+1 — the first tick `AnyoneAlive` is false,
                // which is this one. On a ship loaded with nobody aboard there is no event and both
                // fall back: no origin, no name.
                bool hasOrigin = TryLastDeath(sim, out Int3 origin, out string deadName);
                _emergencyDeadName = deadName;

                Device elected = NearestIntactPod(sim, hasOrigin, origin);
                if (elected != null)
                {
                    _emergencyPodId = elected.Id;
                    elected.Progress = StartProgress;
                    return;
                }
                _emergencyDeadName = "";   // nobody to wake; the name has no line to appear in
            }

            if (_runEnded) return;
            // (the grace period is already handled by the guard at the top of this method)

            // ⭐ MOMENT 3 OF THREE: a real lose state. Sim-side bit + Chronicle line here; the
            // one-line banner is the web host's (hosts/web/GameSession.cs); THE ENDING SCREEN IS
            // M5-1's and is deliberately not built here (OD-M item 4 = A).
            _runEnded = true;
            Record(sim,
                   AnyIntactPod(sim)
                       ? "Every soul aboard is dead, and the ship's one reprieve is already spent. The run is over."
                       : "Every soul aboard is dead, and no intact pod remains. The run is over.",
                   HistoryKind.RunEnded);
        }

        /// <summary>
        /// ⛔ THE TRIGGER'S OTHER HALF, AND THE ONE THAT RUNS ON EVERY SHIP EVERY TICK. Returns on
        /// the FIRST living citizen — on a crewed ship that is one index and one bool. Zero alloc.
        ///
        /// <para>It counts <c>!Dead</c> rather than trusting <c>Citizens.Count</c> because both
        /// states are real: <c>NeedsSystem.Kill</c> flags <c>Dead</c> AND removes from the store
        /// (<c>Systems/NeedsSystem.cs:196-206</c>), but a dozen live sites still guard on the flag
        /// because callers hold references across the removal — and the suites flag <c>Dead</c>
        /// directly without removing. This is <c>ShipLedgerSample.LivingCrew</c>'s own rule
        /// (<c>ShipSystems.cs:787</c>), restated rather than sampled: the ledger's sample walks
        /// rooms, devices and every item stack aboard, which is not a thing to do 10 Hz to answer
        /// one bool.</para>
        /// </summary>
        private static bool AnyoneAlive(Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
                if (!citizens[i].Dead) return true;
            return false;
        }

        /// <summary>
        /// ⭐ TERM 1 OF THE THAW GATE, AND NOTHING ELSE — the charter's "one a normal thaw would
        /// accept on term 1 alone". Restated here rather than called, because
        /// <see cref="ThawGate"/> and <c>ThawCommand</c> are the player's route and this branch must
        /// share none of it (OD-10). <c>ThawGateTests</c> pins that the two READINGS agree, driven
        /// against <see cref="ThawGate.Evaluate"/> itself, so the restatement cannot drift silently.
        ///
        /// <para>⚠️ <b>A WRECKED CAPSULE IS NEVER ELECTED.</b> It would cycle, open, and deliver
        /// NOTHING — leaving the player staring at an open capsule with a body in it, which is worse
        /// than the silence this package exists to remove.</para>
        /// </summary>
        private static bool IsIntactPod(Simulation sim, Device d)
            => d.Kind == DeviceKind.CryoPod
               && !d.IsOpen                       // term 1: PodAlreadyOpen — single-use, and it is spent
               && d.Powered                       // term 1: PodNoSignal
               && d.IsOperational(sim.Defs);      // term 1: PodNoSignal — OD-9, the sleeper did not survive

        /// <summary>
        /// ⭐ THE TIE-BREAK, STATED: <b>fewest decks away, then fewest tiles away (Manhattan on
        /// X/Y), then lowest <see cref="Device.Id"/></b> — a strict lexicographic total order over
        /// integers, so it is the same capsule on every machine forever. The origin is the tile the
        /// last crew member fell on; with no death event to read (a save loaded with nobody aboard)
        /// there is no origin and the order degenerates to M3-2's own lowest-Id precedent.
        ///
        /// <para>"Nearest" is deliberately NOT a path length. A path cost would make the choice
        /// depend on doors, on air, and on the pathfinder's own tie-breaks — three things that have
        /// nothing to do with which sleeper the ship should spend its one reprieve on, and all
        /// three of which can make the answer unreachable.</para>
        /// </summary>
        private static Device NearestIntactPod(Simulation sim, bool hasOrigin, Int3 origin)
        {
            Device best = null;
            int bestDeck = 0, bestDist = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var pod = devices[i];
                if (!IsIntactPod(sim, pod)) continue;

                int deck = 0, dist = 0;
                if (hasOrigin)
                {
                    deck = pod.Pos.Z > origin.Z ? pod.Pos.Z - origin.Z : origin.Z - pod.Pos.Z;
                    int dx = pod.Pos.X > origin.X ? pod.Pos.X - origin.X : origin.X - pod.Pos.X;
                    int dy = pod.Pos.Y > origin.Y ? pod.Pos.Y - origin.Y : origin.Y - pod.Pos.Y;
                    dist = dx + dy;
                }

                if (best == null
                    || deck < bestDeck
                    || (deck == bestDeck && dist < bestDist)
                    || (deck == bestDeck && dist == bestDist && pod.Id < best.Id))
                {
                    best = pod; bestDeck = deck; bestDist = dist;
                }
            }
            return best;
        }

        /// <summary>
        /// The capsule counting down, or null. The predicate is the COUNTDOWN'S OWN election,
        /// conjunct for conjunct (see <see cref="Tick"/>) — a pod the countdown would never advance
        /// must not be able to hold the ending open forever, and must not be mistaken for the grace.
        ///
        /// <para>⚠️ <b>IT DOES NOT TEST <see cref="Device.Powered"/>, AND THAT ASYMMETRY WITH
        /// <see cref="IsIntactPod"/> IS CORRECT.</b> Term 1 asks "may this capsule be STARTED", which
        /// is a question about signal; this asks "is this capsule ADVANCING", and M3-2's countdown
        /// deliberately ignores power once a cycle is under way (§13.29: <i>once started, a cycle
        /// completes</i>). Adding <c>Powered</c> here would make a brownout silently convert a
        /// running thaw into a lost run.</para>
        /// </summary>
        private static Device CyclingPod(Simulation sim)
        {
            Device best = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var pod = devices[i];
                if (pod.Kind != DeviceKind.CryoPod || pod.IsOpen || pod.Progress <= 0f) continue;
                if (!pod.IsOperational(sim.Defs)) continue;
                if (best == null || pod.Id < best.Id) best = pod;
            }
            return best;
        }

        private static bool AnyPodCycling(Simulation sim) => CyclingPod(sim) != null;

        /// <summary>
        /// ⭐ <b>THE CAPSULE THE SHIP'S LAST HOPE IS RIDING ON RIGHT NOW</b>, or 0 — the one fact the
        /// web host's banner needs, answered here because only this object knows what the reprieve
        /// did (<c>hosts/web/WireFormat.Ending.cs</c>).
        ///
        /// <para><b>TWO WAYS TO BE IN A GRACE, AND THE BANNER MUST NOT BE SILENT IN EITHER.</b> The
        /// ship elected a capsule (<see cref="_emergencyPodId"/>), OR the player had already paid
        /// for a cycle when the crew hit zero — in which case the reprieve is deliberately NOT spent
        /// (see <see cref="EmergencyWatch"/>) and there is no elected id to read. Reading only the
        /// elected id would leave the second case with a dead ship, a capsule counting down and a
        /// blank screen, which is the exact silence this package exists to close.</para>
        ///
        /// <para>The elected id WINS when both are set, so an ordinary cycle in flight can never
        /// make the banner name the wrong person.</para>
        /// </summary>
        public uint GraceCapsuleId(Simulation sim)
        {
            if (sim == null || _runEnded) return 0;
            if (AnyoneAlive(sim)) return 0;         // a cycle with a crew aboard is just a thaw
            if (_emergencyPodId != 0) return _emergencyPodId;
            var cycling = CyclingPod(sim);
            return cycling?.Id ?? 0;
        }

        /// <summary>Is there an intact capsule aboard at all? Only ever asked to word the ending
        /// line honestly — "no intact pod remains" is a lie when the reprieve was simply spent.</summary>
        private static bool AnyIntactPod(Simulation sim)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (IsIntactPod(sim, devices[i])) return true;
            return false;
        }

        /// <summary>
        /// The last death published this tick: where they fell and what they were called. The name
        /// rides the EVENT rather than an id lookup for the reason
        /// <c>HistorySystem.cs:93-98</c> records — <c>NeedsSystem.Kill</c> removes the citizen from
        /// the store the same tick it publishes, so by the time anybody reads the event the id
        /// misses. "Last" (rather than first) is the only choice that is right when a compartment
        /// vents and takes the last two people together.
        /// </summary>
        private static bool TryLastDeath(Simulation sim, out Int3 pos, out string name)
        {
            var deaths = sim.Events.Read<CitizenDiedEvent>();
            if (deaths.Length == 0) { pos = default; name = ""; return false; }
            var last = deaths[deaths.Length - 1];
            pos = last.Pos;
            name = last.Name ?? "";
            return true;
        }

        /// <summary>
        /// One Chronicle line, through <see cref="HistorySystem"/>'s own capped buffer — the seam
        /// <see cref="EulogySystem"/> already uses for exactly this (<c>Memory/Eulogy.cs:110</c>).
        ///
        /// <para>The lookup is cached because it is a walk of the system array; it is not saved,
        /// and it does not need to be — a loaded sim builds a fresh stack and a fresh
        /// <see cref="CryoSystem"/>, so the cache is per-object and cannot outlive its stack. A
        /// stack with no <see cref="HistorySystem"/> (a bespoke test rig) silently writes nothing
        /// rather than throwing: the Chronicle is a renderer, not a mechanism.</para>
        /// </summary>
        private void Record(Simulation sim, string text, HistoryKind kind, uint subjectA = 0, uint subjectB = 0)
        {
            if (_history == null)
            {
                var systems = sim.Systems;
                for (int i = 0; i < systems.Length; i++)
                    if (systems[i] is HistorySystem h) { _history = h; break; }
                if (_history == null) return;
            }
            _history.Record(sim.TickCount, text, kind, subjectA, subjectB);
        }

        private HistorySystem _history;

        /// <summary>
        /// The first tile beside <paramref name="pos"/> a person may legally stand on: in bounds,
        /// walkable by THE walkability rule (<see cref="Simulation.IsWalkable"/> — door-aware, so a
        /// shut door beside the bay is not an exit) and free of any device, so nobody is placed
        /// inside the neighbouring capsule or on top of a conduit run. Canonical
        /// <see cref="Int3.Neighbor4"/> order (+X, −X, +Y, −Y) is the tie-break, and it is a
        /// deterministic total order over the four candidates — same ship, same tile, forever.
        /// </summary>
        private static bool TryFindExitTile(Simulation sim, Int3 pos, out Int3 exit)
        {
            for (int n = 0; n < 4; n++)
            {
                var q = Int3.Neighbor4(pos, n);
                if (!sim.World.InBounds(q)) continue;
                if (!sim.IsWalkable(q)) continue;
                if (sim.TryGetDeviceAt(q, out _)) continue; // never inside the furniture
                exit = q;
                return true;
            }
            exit = pos;
            return false;
        }

        /// <summary>
        /// The person's display name from the capsule's device name — the inverse of the authoring
        /// convention at <c>sim/Sim.Gen/AuthoredShips.cs:1963</c> (<c>"pod_" +
        /// pod.Who.ToLowerInvariant()</c>). <c>pod_ozawa</c> ⇒ <c>Ozawa</c>.
        ///
        /// <para>⚠️ A pod whose name does NOT carry the prefix keeps its name verbatim rather than
        /// being mangled: the convention is authoring's, and this function must not invent a person
        /// called <c>Ay</c> out of a capsule somebody named <c>a</c>. InvariantCulture throughout
        /// (the dev machine is de-DE; a Turkish-i style case fold is a real class of bug here).</para>
        /// </summary>
        /// <remarks>⚠️ WIDENED FROM <c>internal</c> TO <c>public</c> BY M3-4. The POD BAY prints an
        /// OCCUPANT column, and a host in another assembly that cannot call this would have to keep
        /// a second copy of the <c>"pod_" + who</c> convention — the one thing this repo's own
        /// "one authority" rule forbids, on the column whose whole job is to name a person
        /// correctly. Nothing about the function changed.</remarks>
        public static string SleeperName(string deviceName)
        {
            if (string.IsNullOrEmpty(deviceName)) return "";
            if (!deviceName.StartsWith(PodNamePrefix, System.StringComparison.Ordinal)) return deviceName;
            string who = deviceName.Substring(PodNamePrefix.Length);
            if (who.Length == 0) return deviceName;
            return char.ToUpperInvariant(who[0]) + who.Substring(1);
        }

        // --------------------------------------------------------------------- save / hash

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(_emergencyThawFired);
            // v2 (M3-5). Order is the blob's contract — never reorder, only append behind a version.
            writer.Write(_runEnded);
            writer.Write(_emergencyPodId);
            writer.Write(_emergencyDeadName ?? "");
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version < 1 || version > StateVersion) return; // a newer build's blob: skipped by length prefix
            _emergencyThawFired = reader.ReadBoolean();
            if (version < 2)
            {
                // A v1 save predates M3-5: no run had an ending to record, and no emergency cycle
                // could have been in flight (nothing wrote the latch). The defaults are the truth.
                _runEnded = false;
                _emergencyPodId = 0;
                _emergencyDeadName = "";
                return;
            }
            _runEnded = reader.ReadBoolean();
            _emergencyPodId = reader.ReadUInt32();
            _emergencyDeadName = reader.ReadString();
        }

        /// <summary>
        /// The fold that makes this system's registration a pin move. The seed is the human-readable
        /// chapter tag 'CRYO' (the ZONE/PROD/ORES/TRAD convention), and the emergency state reaches
        /// <c>Simulation.StateHash</c> THROUGH here — a constant would be byte-identical to folding
        /// a permanently-zero bit, which is why the fold-contents test sets the state first.
        ///
        /// <para>⛔ <b>ONE STATE WORD, NOT THREE FOLDS, AND THAT IS WHY M3-5 IS PIN-NEUTRAL.</b>
        /// <c>XxHash64.Combine</c> is not idempotent on zero: a SECOND <c>Combine(h, 0)</c> changes
        /// <c>h</c>, so folding M3-5's two new structural members as their own steps would have moved
        /// P1, P2 and P3 on every ship in the game to record two zeros. Packed into one word they
        /// cost nothing on a ship that never lost its crew — the word is <c>0</c> exactly where
        /// M3-2's <c>fired ? 1 : 0</c> was <c>0</c>, and <c>1</c> exactly where it was <c>1</c> —
        /// and they are still genuinely folded, which is the claim
        /// <c>TheCryoFold_ReachesStateHash…</c> drives one member at a time.</para>
        ///
        /// <para>⚠️ <b><see cref="_emergencyDeadName"/> IS NOT FOLDED, DELIBERATELY.</b> It is
        /// Chronicle prose and nothing else — <see cref="HistorySystem"/>'s own HIST convention
        /// ("strings are hash-EXEMPT: the checksum folds tick + kind + subjects, never the free
        /// text"), for the same reason: rewording must never perturb determinism. It cannot
        /// desynchronise a twin either, because it is derived from state that IS folded (the death
        /// that produced it rides HIST as a <see cref="HistoryKind.Death"/> entry carrying the
        /// citizen id) and it is SAVED, so a restored ship carries the identical string.</para>
        /// </summary>
        public ulong StateChecksum()
        {
            ulong state = (_emergencyThawFired ? 1UL : 0UL)
                        | (_runEnded ? 2UL : 0UL)
                        | ((ulong)_emergencyPodId << 2);
            ulong h = 0x4352594FUL; // 'CRYO'
            h = XxHash64.Combine(h, state);
            return h;
        }
    }
}
