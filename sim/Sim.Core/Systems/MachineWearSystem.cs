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

        public void Tick(Simulation sim)
        {
            var rooms = sim.Rooms.Rooms;
            var vacuum = rooms[0]; // RoomAt resolves DoorMarker/unassigned tiles here
            var wear = sim.Defs.Wear;
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

                device.Condition -= def.WearPerHour / 3600f * DtSeconds * multiplier;
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
                    sim.JobsDirty = true;
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
    ///   - CarryingItemId = the Parts stack in hand. It stays in hand THROUGH the work
    ///                    phase — at completion it is the mode switch: parts in hand
    ///                    means full overhaul (consume one, Condition = 1), empty hands
    ///                    mean jury-rig (Condition = 0.6). Only reachable when no Parts
    ///                    existed anywhere at decision time.
    ///
    /// Reservations: NEVER sets ItemStack.ReservedForJob (Simulation.CancelJob could
    /// not release it for Maintain). Instead everything re-validates from ground truth
    /// each settled moment, and a redirected/dead servicer's carried Parts are dropped
    /// generically by CancelJob — the machine still wants service, so the next pass
    /// re-recruits and the dropped stack re-enters the pool. Nothing leaks.
    ///
    /// Determinism: needy machines picked by strict-&lt; lowest Condition (ties: device
    /// store order), citizens/items scanned in store order with strict-&lt; nearest-first,
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
                    _recruitSkip.Add(needy.Id); // walled in — nowhere to stand
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

                ItemStack parts = null;
                if (worker.CarryingItemId != 0)
                {
                    if (!sim.Items.TryGet(worker.CarryingItemId, out parts) || parts.CarriedBy != worker.Id)
                    {
                        worker.CarryingItemId = 0; // stack vanished under us
                        Abandon(worker);
                        return;
                    }
                    parts.Pos = worker.Pos; // glue at our 1 Hz cadence
                }

                worker.JobWorkTicks -= Interval;
                if (worker.JobWorkTicks > 0) return;

                if (parts != null)
                {
                    parts.Count--; // one unit per overhaul
                    if (parts.Count <= 0) sim.Items.Remove(parts.Id);
                    else parts.CarriedBy = 0; // remainder set down where we stand
                    worker.CarryingItemId = 0;
                    device.Condition = 1f; // full overhaul
                }
                else
                {
                    device.Condition = sim.Defs.Wear.JuryRigCondition; // patched, not fixed
                }
                worker.JobKind = JobKind.None;
                worker.JobWorkTicks = 0;
                sim.JobsDirty = true; // completion is a notice, not an alarm
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

            // --- Settled and empty-handed: fetch Parts, or jury-rig if none exist. ---
            var best = FindNearestParts(sim, worker.Pos);
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
                        sim.JobsDirty = true; // the stack left the ground
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

            // No Parts anywhere in the colony: jury-rig with what's on hand.
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
                if (!c.IsIdleForWork) continue;
                int d = Int3.Manhattan(c.Pos, target);
                if (d < bestDist)
                {
                    bestDist = d;
                    best = c;
                }
            }
            return best;
        }

        /// <summary>Nearest unreserved ground Parts stack (ties: item store order).</summary>
        private static ItemStack FindNearestParts(Simulation sim, Int3 from)
        {
            ItemStack best = null;
            int bestDist = int.MaxValue;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.Kind != ItemKind.Parts || item.CarriedBy != 0 || item.ReservedForJob) continue;
                int d = Int3.Manhattan(from, item.Pos);
                if (d < bestDist)
                {
                    bestDist = d;
                    best = item;
                }
            }
            return best;
        }

        /// <summary>First walkable 4-neighbor in canonical Neighbor4 order (+x,-x,+y,-y).</summary>
        private static bool TryFindStagingTile(Simulation sim, Int3 devicePos, out Int3 staging)
        {
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(devicePos, i);
                if (!sim.World.InBounds(n) || !sim.IsWalkable(n)) continue;
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
                sim.JobsDirty = true;
            }
            worker.CarryingItemId = 0;
        }
    }
}
