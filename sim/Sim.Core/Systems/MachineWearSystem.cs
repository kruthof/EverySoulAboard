using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// Machine wear (SIMULATION_ARCHITECTURE: machines never fail randomly — failure
    /// emerges from operating conditions). Every operating machine loses Condition at
    /// its MachineDefs.WearPerHour rate; rooms hotter than 35 °C accelerate the loss
    /// (up to 3×), so a base that skimps on radiators grinds its scrubbers down. A
    /// machine that crosses MachineDefs.FailBelow goes inoperative (Device.IsOperational;
    /// the operating systems already gate on it) and raises a MACHINE FAILURE alarm.
    ///
    /// Failure-crossing detection is stateless: wear is only applied to machines that
    /// are operational at the top of the pass (Condition >= FailBelow), so landing
    /// below FailBelow after the decrement IS the crossing — no persistent
    /// was-operational bookkeeping. Devices iterated in store order; the steady state
    /// (no crossings) allocates nothing.
    /// </summary>
    public sealed class MachineWearSystem : ISimSystem
    {
        public string Name => "Wear";
        public int IntervalTicks => Interval;

        private const int Interval = 10; // 1 Hz
        private const float DtSeconds = Interval * Simulation.TickSeconds; // 1 s per pass (structural)
        private const float KelvinOffset = 273.15f; // fixed physical constant

        // HotThresholdC (35 C), WearPerDegreeC (0.05) and MaxHeatMultiplier (3) now live in
        // sim.Defs.Wear (SimDefs.Default reproduces the former consts). Tick reads them each
        // pass so parallel sims with different defs never cross-talk.

        /// <summary>
        /// Optional Director coupling (WS-NARRATIVE N6, the granted cross-lane contract). When
        /// present its <see cref="DirectorSystem.WearPressure"/> ([1, MaxWearPressure]) scales
        /// the wear rate — the Director's one sim-legal lever. Null (the default, and today's
        /// spine registration) means a fixed 1.0: <c>× 1f</c> is IEEE identity, so all existing
        /// behaviour, tests and the determinism pin are byte-for-byte unchanged.
        /// </summary>
        private readonly DirectorSystem _director;

        public MachineWearSystem(DirectorSystem director = null) => _director = director;

        public void Tick(Simulation sim)
        {
            var rooms = sim.Rooms.Rooms;
            var vacuum = rooms[0]; // RoomAt resolves DoorMarker/unassigned tiles here
            var wear = sim.Defs.Wear;
            float pressure = _director != null ? _director.WearPressure : 1f;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var device = devices[i];
                var def = sim.Defs.Machines[(int)device.Kind];
                if (def.WearPerHour <= 0f) continue;                          // wear-free kinds
                if (!device.Powered || device.Condition < def.FailBelow) continue; // idle/failed machines don't wear
                if (device.Kind == DeviceKind.AirVent && !device.IsOpen) continue; // closed vents idle too

                float multiplier = 1f;
                var room = sim.Rooms.RoomAt(sim.World, device.Pos);
                if (room != vacuum) // room 0 / door tiles: nominal wear
                {
                    float tempC = (float)room.TemperatureK - KelvinOffset;
                    if (tempC > wear.HotThresholdC)
                    {
                        multiplier = 1f + (tempC - wear.HotThresholdC) * wear.WearPerDegreeC;
                        if (multiplier > wear.MaxHeatMultiplier) multiplier = wear.MaxHeatMultiplier;
                    }
                }

                device.Condition -= def.WearPerHour / 3600f * DtSeconds * multiplier * pressure;
                if (device.Condition < 0f) device.Condition = 0f;

                // Operational going in, below the threshold coming out: this pass IS
                // the failure crossing. The next pass skips the dead machine entirely,
                // so the alarm fires exactly once per failure.
                if (device.Condition < def.FailBelow)
                {
                    sim.Events.Publish(new AlarmRaisedEvent
                    {
                        SourceId = device.Name,
                        Message = "MACHINE FAILURE — " + device.Name,
                    });
                    // Defensive full rescan (rare): a failure changes no board input directly, but a
                    // failed machine's blocking/walkability can shift, so preserve the pre-W0-3
                    // behaviour of a full rescan rather than reason about reachability here.
                    sim.JobsDirty |= JobBoardDirty.All;
                }
            }
        }
    }

    /// <summary>
    /// Standing maintenance rule (no bills, no UI): any machine below its
    /// MachineDefs.MaintainBelow wants service, neediest (lowest Condition) first.
    /// Registered AFTER CraftingSystem at 1 Hz: earlier systems get first pick of idle
    /// citizens; we only recruit JobKind.None ones and stamp them JobKind.Maintain
    /// immediately. One servicer per machine, bound by JobTarget = the machine's tile
    /// (exactly how CraftingSystem binds stations).
    ///
    /// Per-citizen state reuses the existing job fields (CraftingSystem's encoding):
    ///   - JobTarget    = the MACHINE's tile for the whole job (binding key; travel
    ///                    destinations live in the citizen's Path and arrival tiles
    ///                    are re-validated from ground truth).
    ///   - JobWorkTicks = phase marker AND countdown: 0 = logistics (fetching a Parts
    ///                    stack or carrying it over; sub-phase by CarryingItemId),
    ///                    &gt; 0 = servicing adjacent to the machine (counts down by
    ///                    IntervalTicks per pass from WorkSeconds).
    ///   - CarryingItemId = the CONSUMABLE stack in hand. It stays in hand THROUGH the
    ///                    work phase — at completion it is the mode switch, and since E0-6
    ///                    there are THREE rungs, not two:
    ///                      Parts in hand  -> full overhaul,  Condition = 1
    ///                      Seals in hand  -> routine service, Condition = seal_service_condition
    ///                      empty hands    -> jury-rig,        Condition = jury_rig_condition
    ///                    Exactly one unit of exactly one kind is consumed per service —
    ///                    a crew member carries ONE stack (ECONOMY.md §11 forbids multi-stack
    ///                    inventories), so "burn a Seal AND fit a Part" is not expressible
    ///                    and the tiers are a LADDER rather than a co-consumption.
    ///
    ///   FETCH PREFERENCE IS BY TIER, NOT BY DISTANCE (E0-6): a Parts stack on the far
    ///   side of the ship beats a Seals stack at the servicer's feet. That is deliberate
    ///   and it is what makes the rung strictly additive — whenever ANY unreserved Parts
    ///   stack exists anywhere, every decision this system makes is byte-identical to its
    ///   pre-E0-6 self, so the new rung can only be reached in a state that used to
    ///   jury-rig. Seals therefore become the maintenance currency exactly when the ship
    ///   has run its Parts out, which on the slice is the post-cliff window E0-6 is
    ///   measured on.
    ///
    /// Reservations: NEVER sets ItemStack.ReservedBy (Simulation.CancelJob could
    /// not release it for Maintain). Instead everything re-validates from ground truth
    /// each settled moment, and a redirected/dead servicer's carried Parts are dropped
    /// generically by CancelJob — the machine still wants service, so the next pass
    /// re-recruits and the dropped stack re-enters the pool. Nothing leaks.
    ///
    /// Determinism: needy machines picked by strict-&lt; lowest Condition (ties: device
    /// store order), consumable TIER before distance (Parts, then Seals),
    /// citizens/items scanned in store order with strict-&lt; nearest-first,
    /// staging via canonical Neighbor4 order, no RNG, no LINQ. Steady state (nothing
    /// below MaintainBelow) allocates nothing.
    /// </summary>
    public sealed class MaintenanceSystem : ISimSystem
    {
        public string Name => "Maintenance";
        public int IntervalTicks => Interval;

        private const int Interval = 10; // 1 Hz

        // WorkSeconds (20 s of service at the machine) and JuryRigCondition (0.6 — a
        // parts-less repair only gets the machine back to "held together") now live in
        // sim.Defs.Wear (SimDefs.Default reproduces the former consts). The service tick
        // count is DERIVED at use: MaintenanceWorkSeconds × Simulation.TicksPerSecond. All
        // reads go through sim.Defs so parallel sims with different defs never cross-talk.

        // Machines skipped during this pass's recruitment (walled in / already tried).
        // Lookup only, never iterated; empty in the steady state.
        private readonly HashSet<uint> _recruitSkip = new HashSet<uint>();

        public void Tick(Simulation sim)
        {
            DriveWorkers(sim);
            RecruitForNeediest(sim);
        }

        /// <summary>
        /// Advance every bound servicer (citizen store order). Also the orphan sweep:
        /// a Maintain citizen whose machine vanished is freed. Dead citizens are
        /// JobSystem.HandleDead's business — skipped here.
        /// </summary>
        private static void DriveWorkers(Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.JobKind != JobKind.Maintain) continue;
                if (!sim.TryGetDeviceAt(c.JobTarget, out var device))
                {
                    DropCarried(sim, c); // machine deconstructed mid-service
                    Abandon(c);
                    continue;
                }
                DriveWorker(sim, device, c);
            }
        }

        /// <summary>
        /// Recruit one idle citizen per unserviced needy machine, lowest Condition
        /// first (ties: device store order), until machines or idle citizens run out.
        /// </summary>
        private void RecruitForNeediest(Simulation sim)
        {
            _recruitSkip.Clear();
            var devices = sim.Devices.Items;
            while (true)
            {
                Device needy = null;
                float lowest = float.MaxValue;
                for (int i = 0; i < devices.Count; i++)
                {
                    var d = devices[i];
                    if (d.Condition >= sim.Defs.Machines[(int)d.Kind].MaintainBelow) continue;
                    if (_recruitSkip.Contains(d.Id)) continue;
                    if (d.Condition < lowest && FindWorker(sim, d.Pos) == null)
                    {
                        lowest = d.Condition;
                        needy = d;
                    }
                }
                if (needy == null) return; // nothing (left) to service — zero-alloc idle

                if (!TryFindStagingTile(sim, needy.Pos, out var staging))
                {
                    // Walled in, or — since the livelock package — nowhere beside it a crew member
                    // could survive the 900 s service. Both are "nowhere to stand"; both are skipped
                    // for this pass and never remembered, so the machine becomes serviceable again
                    // on the very pass its compartment is opened or repressurised.
                    _recruitSkip.Add(needy.Id);
                    continue;
                }

                var recruit = FindNearestIdle(sim, staging);
                if (recruit == null) return; // no idle hands — retried next second

                recruit.JobKind = JobKind.Maintain; // claimed now — earlier systems already ran
                recruit.JobTarget = needy.Pos;
                recruit.JobWorkTicks = 0;
                recruit.CarryingItemId = 0;
                _recruitSkip.Add(needy.Id);
                DriveWorker(sim, needy, recruit); // act immediately (path out this tick)
            }
        }

        // ------------------------------------------------------------- worker drive

        private static void DriveWorker(Simulation sim, Device device, Citizen worker)
        {
            if (!TryFindStagingTile(sim, device.Pos, out var staging))
            {
                DropCarried(sim, worker); // machine walled in mid-job
                Abandon(worker);
                return;
            }

            // --- Work phase (marker > 0): stand at the machine, count down, repair. ---
            if (worker.JobWorkTicks > 0)
            {
                if (worker.HasPath || !Int3.IsAdjacent4(worker.Pos, device.Pos))
                {
                    // External interference (a path we never set, or displaced) —
                    // restart from ground truth on a later pass.
                    DropCarried(sim, worker);
                    Abandon(worker);
                    return;
                }

                ItemStack consumable = null;
                if (worker.CarryingItemId != 0)
                {
                    if (!sim.Items.TryGet(worker.CarryingItemId, out consumable) || consumable.CarriedBy != worker.Id)
                    {
                        worker.CarryingItemId = 0; // stack vanished under us
                        Abandon(worker);
                        return;
                    }
                    consumable.Pos = worker.Pos; // glue at our 1 Hz cadence
                }

                worker.JobWorkTicks -= Interval;
                if (worker.JobWorkTicks > 0) return;

                if (consumable != null)
                {
                    // Read the RESTORE LEVEL off the stack in hand BEFORE consuming it — the kind
                    // is the only thing that distinguishes an overhaul from a service, and the
                    // stack may be removed on the next line.
                    float restored = RestoredCondition(sim.Defs, consumable.Kind);
                    consumable.Count--; // one unit per service, whichever tier it was
                    if (consumable.Count <= 0) sim.Items.Remove(consumable.Id);
                    else consumable.CarriedBy = 0; // remainder set down where we stand
                    worker.CarryingItemId = 0;
                    device.Condition = restored;
                }
                else
                {
                    device.Condition = sim.Defs.Wear.JuryRigCondition; // patched, not fixed
                }
                worker.JobKind = JobKind.None;
                worker.JobWorkTicks = 0;
                sim.JobsDirty |= JobBoardDirty.Items; // a Parts stack was consumed / set down
                return;
            }

            // --- Logistics phase: carrying a Parts stack to the machine... ---
            if (worker.CarryingItemId != 0)
            {
                if (!sim.Items.TryGet(worker.CarryingItemId, out var carried) || carried.CarriedBy != worker.Id)
                {
                    worker.CarryingItemId = 0; // stack vanished under us — restart from ground truth
                    Abandon(worker);
                    return;
                }
                carried.Pos = worker.Pos; // glue at our 1 Hz cadence
                if (worker.HasPath) return;

                if (!Int3.IsAdjacent4(worker.Pos, device.Pos))
                {
                    DropCarried(sim, worker); // route was lost — the stack re-enters the pool
                    Abandon(worker);
                    return;
                }
                worker.JobWorkTicks = sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond; // service begins, parts in hand
                return;
            }

            if (worker.HasPath) return; // ...or en route to a Parts stack / the machine

            // --- Settled and empty-handed: fetch a consumable, or jury-rig if none exist. ---
            var best = FindNearestConsumable(sim, worker.Pos);
            if (best != null)
            {
                if (best.Pos == worker.Pos)
                {
                    // Pick up only once the leg to the machine is known good, so a
                    // failure leaves the stack untouched on the ground.
                    if (sim.Paths.FindPath(sim, worker.Pos, staging, worker.Path))
                    {
                        best.CarriedBy = worker.Id;
                        worker.CarryingItemId = best.Id;
                        worker.StartPath(sim.Defs.Citizen.TicksPerTile);
                        sim.JobsDirty |= JobBoardDirty.Items; // the stack left the ground
                    }
                    else
                    {
                        Abandon(worker);
                    }
                    return;
                }
                if (sim.Paths.FindPath(sim, worker.Pos, best.Pos, worker.Path)) worker.StartPath(sim.Defs.Citizen.TicksPerTile);
                else Abandon(worker); // unreachable from here — retried from ground truth next second
                return;
            }

            // Neither Parts nor Seals anywhere in the colony: jury-rig with what's on hand.
            if (Int3.IsAdjacent4(worker.Pos, device.Pos))
            {
                worker.JobWorkTicks = sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond;
                return;
            }
            if (sim.Paths.FindPath(sim, worker.Pos, staging, worker.Path)) worker.StartPath(sim.Defs.Citizen.TicksPerTile);
            else Abandon(worker); // unreachable right now — the standing rule retries
        }

        // ------------------------------------------------------------------ helpers

        /// <summary>The machine's single servicer: first live Maintain citizen bound to its tile.</summary>
        private static Citizen FindWorker(Simulation sim, Int3 devicePos)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (!c.Dead && c.JobKind == JobKind.Maintain && c.JobTarget == devicePos) return c;
            }
            return null;
        }

        /// <summary>Nearest recruitable citizen by Manhattan distance (ties: store order).</summary>
        private static Citizen FindNearestIdle(Simulation sim, Int3 target)
        {
            Citizen best = null;
            int bestDist = int.MaxValue;
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (!c.IsRecruitableForWork) continue;
                int d = Int3.Manhattan(c.Pos, target);
                if (d < bestDist)
                {
                    bestDist = d;
                    best = c;
                }
            }
            return best;
        }

        /// <summary>
        /// What a service restores the machine to, given the consumable actually in the
        /// servicer's hand. The ladder in ONE place so the work phase and every test read the
        /// same rule (E0-6). A kind that is neither Parts nor Seals cannot reach here —
        /// <see cref="FindNearestConsumable"/> is the only thing that puts a stack in a
        /// maintainer's hand — but it maps to the jury-rig floor rather than to 1.0 so an
        /// unforeseen carry can never become a free overhaul.
        /// </summary>
        private static float RestoredCondition(SimDefs defs, ItemKind kind)
        {
            if (kind == ItemKind.Parts) return 1f;                          // full overhaul
            if (kind == ItemKind.Seals) return defs.Wear.SealServiceCondition; // routine service
            return defs.Wear.JuryRigCondition;
        }

        /// <summary>
        /// Nearest unreserved ground stack of a maintenance consumable — <b>Parts first, and
        /// only if the ship has none anywhere, Seals</b> (ties within a tier: item store order).
        ///
        /// TIER BEFORE DISTANCE, and that is the whole reason E0-6's new rung is additive: the
        /// first loop is character-for-character the pre-E0-6 <c>FindNearestParts</c>, so on any
        /// ship holding a free Parts stack this function returns exactly what it always returned
        /// and the Seals loop is never entered. The second loop is only reachable in the state
        /// that used to produce a jury-rig at Condition 0.6.
        /// </summary>
        private static ItemStack FindNearestConsumable(Simulation sim, Int3 from)
        {
            var best = FindNearest(sim, from, ItemKind.Parts);
            return best ?? FindNearest(sim, from, ItemKind.Seals);
        }

        /// <summary>Nearest unreserved ground stack of one kind (ties: item store order).</summary>
        private static ItemStack FindNearest(Simulation sim, Int3 from, ItemKind kind)
        {
            ItemStack best = null;
            int bestDist = int.MaxValue;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.Kind != kind || item.CarriedBy != 0 || item.ReservedBy != 0) continue;
                // A consumable resting in unbreathable air is not fetchable. Without this the
                // livelock simply moves one leg upstream: the servicer of a perfectly breathable
                // machine walks to a stack stranded in vacuum, flees, recovers, and is sent for the
                // same stack again — and a stack CAN end up there, because a flee mid-carry sets
                // its cargo down wherever the crew member happened to be standing.
                if (!WorksiteSafety.CanStageWorkerAt(sim, item.Pos)) continue;
                int d = Int3.Manhattan(from, item.Pos);
                if (d < bestDist)
                {
                    bestDist = d;
                    best = item;
                }
            }
            return best;
        }

        /// <summary>First walkable 4-neighbor in canonical Neighbor4 order (+x,-x,+y,-y) that a
        /// worker may be STAGED on — <see cref="WorksiteSafety.CanStageWorkerAt"/>, the same rule
        /// the job board applies in <see cref="JobWork.TryPathToAdjacent"/> and the second and last
        /// place in the sim that picks a tile to park a worker on.
        ///
        /// A machine on a pressure boundary (a door, or a wall-side device between a live room and
        /// an airless hall) has neighbours in two different rooms, so this both REFUSES a machine
        /// with no survivable side and PREFERS the survivable side of one that has both — the
        /// second half matters, because otherwise the first walkable neighbour plants the servicer
        /// in vacuum one step away from breathable air and the livelock returns for exactly the
        /// boundary machines that produced it.
        ///
        /// Returning false here needs no new branch upstream: both callers already handle "nowhere
        /// to stand" — <see cref="RecruitForNeediest"/> skips the machine for the pass, and
        /// <see cref="DriveWorker"/> drops any carried stack and releases the worker.</summary>
        private static bool TryFindStagingTile(Simulation sim, Int3 devicePos, out Int3 staging)
        {
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(devicePos, i);
                if (!sim.World.InBounds(n) || !sim.IsWalkable(n)) continue;
                if (!WorksiteSafety.CanStageWorkerAt(sim, n)) continue;
                staging = n;
                return true;
            }
            staging = default;
            return false;
        }

        /// <summary>
        /// Drop the Maintain job (worker keeps any externally-given path). The standing
        /// rule re-recruits from ground truth on a later pass — nothing is reserved,
        /// nothing leaks. Callers drop carried cargo first where applicable.
        /// </summary>
        private static void Abandon(Citizen worker)
        {
            worker.JobKind = JobKind.None;
            worker.JobWorkTicks = 0;
        }

        /// <summary>Set any carried stack down where the citizen stands.</summary>
        private static void DropCarried(Simulation sim, Citizen worker)
        {
            if (worker.CarryingItemId == 0) return;
            if (sim.Items.TryGet(worker.CarryingItemId, out var carried) && carried.CarriedBy == worker.Id)
            {
                carried.Pos = worker.Pos;
                carried.CarriedBy = 0;
                sim.JobsDirty |= JobBoardDirty.Items; // carried stack set down where we stand
            }
            worker.CarryingItemId = 0;
        }
    }
}
