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
    /// such capsules (<c>sim/Sim.Gen/AuthoredShips.cs:1861-1880</c>) and each already carries a
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

        /// <summary>1 Hz, paired with <see cref="Dt"/>. A four-minute cycle needs no finer.</summary>
        public int IntervalTicks => 10;

        public ushort StateVersion => 1;

        /// <summary>Seconds per pass; structural, paired with <see cref="IntervalTicks"/>
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
        /// (<c>sim/Sim.Gen/AuthoredShips.cs:1856</c>: <c>"pod_" + pod.Who.ToLowerInvariant()</c>).
        /// <see cref="SleeperName"/> is its inverse.</summary>
        private const string PodNamePrefix = "pod_";

        // The emergency-thaw latch. STORAGE ONLY in this package — see the class header. Saved in
        // the SYSS chapter (CaptureState/RestoreState) and folded into Simulation.StateHash
        // (StateChecksum), which is what makes this system's registration a real pin move.
        private bool _emergencyThawFired;

        /// <summary>
        /// Has the ship's one emergency thaw already fired? M3-5 owns both the meaning and the
        /// write; on this tree it is <c>false</c> on every ship, forever, and a test drives the
        /// wreck to prove it.
        /// </summary>
        public bool EmergencyThawFired => _emergencyThawFired;

        /// <summary>
        /// ⚠️ THE SEAM M3-5 WILL CALL, AND NOTHING IN THIS PACKAGE CALLS IT. Kept internal so the
        /// latch cannot be set from outside Sim.Core (a host or the DSL flipping it would be a
        /// hashed-state write from outside the sim), and so the round-trip and fold-contents tests
        /// can set it without a mutation of their own — a checksum measured with the bit
        /// permanently zero is byte-identical to a checksum that folds nothing.
        /// </summary>
        internal void MarkEmergencyThawFired() => _emergencyThawFired = true;

        public void Tick(Simulation sim)
        {
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
        /// </summary>
        private static void Open(Simulation sim, Device pod, Int3 exit)
        {
            pod.Progress = 0f;
            pod.IsOpen = true;

            var person = sim.AddCitizen(SleeperName(pod.Name), exit);

            // Matching the ship's own pawn (`sim/Sim.Gen/AuthoredShips.cs:2179-2182`: AutoWander
            // true, RevealsFog true, HoldPosition false), because the alternative is a thawed
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
        }

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
        /// convention at <c>sim/Sim.Gen/AuthoredShips.cs:1856</c> (<c>"pod_" +
        /// pod.Who.ToLowerInvariant()</c>). <c>pod_ozawa</c> ⇒ <c>Ozawa</c>.
        ///
        /// <para>⚠️ A pod whose name does NOT carry the prefix keeps its name verbatim rather than
        /// being mangled: the convention is authoring's, and this function must not invent a person
        /// called <c>Ay</c> out of a capsule somebody named <c>a</c>. InvariantCulture throughout
        /// (the dev machine is de-DE; a Turkish-i style case fold is a real class of bug here).</para>
        /// </summary>
        internal static string SleeperName(string deviceName)
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
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version < 1 || version > StateVersion) return; // a newer build's blob: skipped by length prefix
            _emergencyThawFired = reader.ReadBoolean();
        }

        /// <summary>
        /// The fold that makes this system's registration a pin move. The seed is the human-readable
        /// chapter tag 'CRYO' (the ZONE/PROD/ORES/TRAD convention), and the emergency bit reaches
        /// <c>Simulation.StateHash</c> THROUGH here — a constant would be byte-identical to folding
        /// a permanently-zero bit, which is why the fold-contents test sets the bit first.
        /// </summary>
        public ulong StateChecksum()
        {
            ulong h = 0x4352594FUL; // 'CRYO'
            h = XxHash64.Combine(h, _emergencyThawFired ? 1UL : 0UL);
            return h;
        }
    }
}
