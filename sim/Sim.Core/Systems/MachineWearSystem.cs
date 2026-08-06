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
    ///   ⭐⭐ THE RESERVE FLOOR (D3, owner decision 2026-08-02): the STANDING RULE declines the
    ///   ship's last MaintenanceSystem.AutonomousRepairReserve loose consumable units — a DIRECT
    ///   ORDER still spends them. Below that line an autonomous service behaves exactly as it does
    ///   on a ship holding nothing: a free jury-rig where the band allows it, no service to offer
    ///   below the wreck floor. Turning the work grid on no longer bankrupts the ship.
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
    public sealed class MaintenanceSystem : ISimSystem, IWorkOfferSource
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

        // --- M1-H: the dispatcher's refusal contract, for the SECOND recruiter that never sees
        // the dispatcher. Identical in shape and in justification to CraftingSystem's — see
        // PushRecruitBackoff. _recruitSkip is a PASS-scoped skip ("I already tried this machine
        // this second"); this is the missing TIME-scoped one ("this machine refused, do not
        // re-offer it for 5 s"). They are not substitutes: _recruitSkip is cleared at the top of
        // every pass, which is exactly why an impossible service was re-offered at 1 Hz forever.
        private readonly PushRecruitBackoff _backoff = new PushRecruitBackoff();

        /// <summary>DIAGNOSTIC SEAM (tests only, never a tick path): this system's per-machine
        /// backoff. Twin of <see cref="CraftingSystem.Backoff"/>.</summary>
        public PushRecruitBackoff Backoff => _backoff;

        // Scratch for the recruit-time reachability probe. NEVER the citizen's own Path: a probe
        // must not leave a half-written path on a crew member it then declines to claim.
        // _probeSkip holds candidates already probed and refused this pass — lookup only.
        private readonly List<Int3> _probePath = new List<Int3>(64);
        private readonly HashSet<uint> _probeSkip = new HashSet<uint>();

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
        private void DriveWorkers(Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.JobKind != JobKind.Maintain) continue;
                if (!sim.TryGetDeviceAt(c.JobTarget, out var device))
                {
                    DropCarried(sim, c); // machine deconstructed mid-service
                    // M1-H: THE ONE ABANDON SITE IN THIS FILE THAT CANNOT STAMP A BACKOFF, and it
                    // is not an omission. The backoff is keyed by the TARGET, and this branch is
                    // reached precisely because the target no longer exists — there is nothing
                    // left to back off, nothing to re-offer, and no thrash available: a machine
                    // that is gone is never recruited for again. It clears job state only.
                    AbandonOrphan(c);
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
                    // M1-H: this machine refused a crew member within the last 5 s. Skipped for
                    // the WINDOW, not just the pass — that distinction is the whole fix.
                    if (_backoff.IsBackedOff(sim, d.Id)) continue;
                    if (d.Condition < lowest && FindWorker(sim, d.Pos) == null)
                    {
                        lowest = d.Condition;
                        needy = d;
                    }
                }
                if (needy == null) return; // nothing (left) to service — zero-alloc idle

                // ⭐ M3-14 RUNG 0, KEPT — no `forced` here, deliberately. This is the AUTONOMOUS
                // path: nobody has ordered anything, so an unordered crew member with Repair on
                // her grid still never walks into vacuum for a needy machine. §8.4's retraction
                // box is binding — *"the directive points toward keeping it"* — and the mutation
                // that passes true here is M3-14's autonomy leg.
                if (!TryFindStagingTile(sim, needy.Pos, out var staging))
                {
                    // Walled in, or — since the livelock package — nowhere beside it a crew member
                    // could survive the 900 s service. Both are "nowhere to stand"; both are skipped
                    // for this pass and never remembered, so the machine becomes serviceable again
                    // on the very pass its compartment is opened or repressurised.
                    _recruitSkip.Add(needy.Id);
                    continue;
                }

                if (IsUnfixableWreck(sim, needy))
                {
                    // A WRECKED machine cannot be wished better (wreck start W2). Below
                    // wear.wreck_threshold an empty-handed jury-rig is refused, so with no
                    // consumable anywhere aboard there is no service to perform — skip it for
                    // this pass, exactly as "nowhere to stand" does, and for the same reasons:
                    // nothing is remembered, so the machine becomes serviceable on the very pass
                    // a Parts, Seals or SWARF stack appears — Swarf counts here, and it is the rung
                    // built for exactly this band (IsUnfixableWreck asks with allowSwarf: true).
                    //
                    // ⚠ THE REFUSAL BELONGS HERE AND NOT IN THE WORK PHASE. DriveWorker's work
                    // phase is reached only after a crew member has walked to the machine and
                    // counted down maintenance_work_seconds = 900 s; discovering the refusal there
                    // would throw those 15 sim-minutes away. Refusing at RECRUITMENT costs one item
                    // scan and no crew time at all.
                    //
                    // ⚠ IT IS *NOT* A LIVELOCK ARGUMENT, and an earlier draft of this comment said
                    // it was — it claimed a work-phase guard would "re-offer the same machine on
                    // the next pass forever". It would not. After such an abandon the machine is
                    // still below the floor with no consumable aboard, so IsUnfixableWreck refuses
                    // it right here on the very next pass; and if a consumable HAS appeared in the
                    // meantime, re-offering it is the correct behaviour. The cost is a single
                    // wasted service, not an unbounded one. Do not re-import the worksite-safety
                    // package's 47 640-job-starts figure as if it applied to this branch.
                    _recruitSkip.Add(needy.Id);
                    continue;
                }

                var recruit = FindNearestReachableIdle(sim, staging, WorkType.Repair, out bool anyIdle);
                if (recruit == null)
                {
                    // No idle hands at all: NOT a refusal by this machine — return and re-ask next
                    // second, as before (the scan is a field read per crew member). Somebody idle
                    // but nobody who can REACH the machine IS a refusal: it cost a whole-region A*
                    // to find out, it is a property of the machine, and paying it every second is
                    // the same thrash CraftingSystem had. Stamp it and go on to the next machine —
                    // an unreachable one must not stop the rest of the pass.
                    if (!anyIdle) return;
                    _backoff.Refuse(sim, needy.Id);
                    _recruitSkip.Add(needy.Id);
                    continue;
                }

                recruit.JobKind = JobKind.Maintain; // claimed now — earlier systems already ran
                recruit.JobTarget = needy.Pos;
                recruit.JobWorkTicks = 0;
                recruit.CarryingItemId = 0;
                _recruitSkip.Add(needy.Id);
                DriveWorker(sim, needy, recruit); // act immediately (path out this tick)
            }
        }

        // ------------------------------------------------------------- worker drive

        private void DriveWorker(Simulation sim, Device device, Citizen worker)
        {
            // ⭐ M3-14 RUNG 2, THE EXECUTION HALF. The hold IS the order (M2-19 / §2.2), so the
            // rule is asked the same way every tick she carries it — issue-time and drive-time
            // cannot come to different answers about the same job. Released with the job by
            // `Citizen.JobKind`'s setter, so the very tick the service ends this reads false again.
            // ⭐ M4-9 — see JobWork.TryPathToAdjacent: a broken crew member's order no longer waives
            // the air (`Citizen.OrderOverridesSafety`).
            // ⚠️ THE SCOPE, STATED EXACTLY, BECAUSE AN EARLIER DRAFT SAID "the two forced-flag
            // computation sites" AND THE CLASS HAS THREE MEMBERS: this one,
            // `JobWork.TryPathToAdjacent` (the job board's staging seam) and
            // `PrioritiseJobCommand`'s acceptance gate. ⛔ A FOURTH SITE READS THE HOLD DIRECTLY AND
            // IS DELIBERATELY NOT CONVERTED — `SafetySystem.cs:284`, M3-14's rung 4 (a held crew
            // member does not flee lethal air). That is a fact about the ORDER, not about whether an
            // order waives a STAGING rule, and converting it would change who dies rather than who
            // is staged. On a minor break the same outcome arrives one step later and through this
            // flag: `forced withdrawn -> staging refused -> Abandon -> job ends -> hold released ->
            // she flees`, driven end to end by
            // `MentalBreakTests.Minor_TheOrderNoLongerCrossesTheFrontier_Driven`. THREE sites
            // convert; the fourth is named here so a later reader does not "finish the job".
            bool forced = worker.OrderOverridesSafety;
            if (!TryFindStagingTile(sim, device.Pos, out var staging, forced))
            {
                DropCarried(sim, worker); // machine walled in mid-job
                Abandon(sim, device, worker, JobDropReason.NoWorksiteTile);
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
                    Abandon(sim, device, worker, JobDropReason.Displaced);
                    return;
                }

                ItemStack consumable = null;
                if (worker.CarryingItemId != 0)
                {
                    if (!sim.Items.TryGet(worker.CarryingItemId, out consumable) || consumable.CarriedBy != worker.Id)
                    {
                        worker.CarryingItemId = 0; // stack vanished under us
                        Abandon(sim, device, worker, JobDropReason.CargoLost);
                        return;
                    }
                    consumable.Pos = worker.Pos; // glue at our 1 Hz cadence
                }

                worker.JobWorkTicks -= Interval;
                if (worker.JobWorkTicks > 0) return;

                RepairTier tier;
                if (consumable != null)
                {
                    // Read the RESTORE LEVEL off the stack in hand BEFORE consuming it — the kind
                    // is the only thing that distinguishes an overhaul from a service, and the
                    // stack may be removed on the next line.
                    float restored = RestoredCondition(sim.Defs, consumable.Kind);
                    tier = TierOf(consumable.Kind);
                    consumable.Count--; // one unit per service, whichever tier it was
                    if (consumable.Count <= 0) sim.Items.Remove(consumable.Id);
                    else consumable.CarriedBy = 0; // remainder set down where we stand
                    worker.CarryingItemId = 0;
                    device.Condition = restored;
                }
                else
                {
                    // NO WRECK GUARD HERE, DELIBERATELY — the wreck rule is decided BEFORE any work
                    // starts (the recruit gate and the fetch-phase guard below), never after. A
                    // guard on this line would fire only for a machine that drifted below
                    // wear.wreck_threshold DURING its own 900 s service, and the trade is a pure
                    // arithmetic one: it would DISCARD 900 s of a crew member's life ALREADY SPENT
                    // in order to recover at most 0.015 of Condition. That bound is exact — the
                    // highest wear rate in machines.def (0.020/h) times the heat cap (3x) is
                    // 0.06/h, and 900 s of it is 0.015 — and the leak is MONOTONE: a machine can be
                    // jury-rigged from at most 0.015 below the floor and never further, because the
                    // next pass starts from the recruit gate again. 0.015 of Condition is not worth
                    // 15 sim-minutes.
                    //
                    // ⚠ NOT a livelock argument (see the recruit gate above, which used to make one
                    // and was wrong): a work-phase guard here would not loop.
                    device.Condition = sim.Defs.Wear.JuryRigCondition; // patched, not fixed
                    tier = RepairTier.JuryRig;
                }

                // ⭐⭐ D1 — THE REPAIR IS ANNOUNCED. This is the ONLY place in the file where a
                // service actually completes and `Condition` is written, so it is the only place
                // that may claim one happened: an abandoned job, a vanished stack and a walled-in
                // machine all return above and announce nothing (DeconstructSystem's
                // validate-on-arrival contract, same shape).
                //
                // AN EVENT, NOT A `HistorySystem.Record` — the rule is pinned, not stylistic.
                // `ArchitectureBoundaryTests.Economy_KnowsNothingAboutSoulsPresentationOrPhysiology`
                // forbids `Chronicle` in this file with the reason written into the test: "narrative
                // record — publish an event, let HistorySystem write it". `BuildSystem`'s
                // ConstructionCompletedEvent is the reference implementation.
                sim.Events.Publish(new RepairCompletedEvent
                {
                    Pos = device.Pos,
                    DeviceId = device.Id,
                    WorkerId = worker.Id,
                    Device = (byte)device.Kind,
                    Tier = (byte)tier,
                    DeviceName = device.Name,
                });

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
                    Abandon(sim, device, worker, JobDropReason.CargoLost);
                    return;
                }
                carried.Pos = worker.Pos; // glue at our 1 Hz cadence
                if (worker.HasPath) return;

                if (!Int3.IsAdjacent4(worker.Pos, device.Pos))
                {
                    DropCarried(sim, worker); // route was lost — the stack re-enters the pool
                    Abandon(sim, device, worker, JobDropReason.NoRouteToWorksite);
                    return;
                }
                // M3-7 — the service begins, parts in hand, and WHO is holding them decides how long
                // it takes. `MaintenanceWorkSeconds` stays the def-frozen UNSKILLED cost; the seam
                // scales it. One seam, and this file names no level — the SAME architecture rule
                // that carves out Director/WearPressure for this file forbids the substring `Skill`
                // in it, and M3-7 is chartered to cross it deliberately or not at all.
                worker.JobWorkTicks = WorkRates.WorkTicksFor(worker, WorkType.Repair,
                    sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond);
                return;
            }

            if (worker.HasPath) return; // ...or en route to a Parts stack / the machine

            // --- Settled and empty-handed: fetch a consumable, or jury-rig if none exist. ---
            // The Swarf rung is offered only to a machine the wreck rule has already refused a free
            // repair to — read off the device's CURRENT condition, at the moment of the fetch.
            var best = FindNearestConsumable(sim, worker.Pos,
                                             allowSwarf: IsBelowWreckFloor(sim, device),
                                             forced);
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
                        // ⭐⭐ D5's ARM. She is standing ON the stack and the leg to the worksite is
                        // gone: the order dies here, 17 sim-seconds after a click that was accepted.
                        Abandon(sim, device, worker, JobDropReason.NoRouteToWorksite);
                    }
                    return;
                }
                if (sim.Paths.FindPath(sim, worker.Pos, best.Pos, worker.Path)) worker.StartPath(sim.Defs.Citizen.TicksPerTile);
                else Abandon(sim, device, worker, JobDropReason.NoRouteToConsumable); // unreachable from here — retried from ground truth next second
                return;
            }

            // Neither Parts nor Seals anywhere in the colony: jury-rig with what's on hand —
            // UNLESS the machine is a wreck, which cannot be wished better (wreck start W2).
            // ⭐ THIS SPLIT IS THE ONE `WhatARepairWouldSpend` MIRRORS: below the floor there is no
            // service (RepairSpend.NoService), at or above it the service is FREE (RepairSpend.Nothing).
            if (IsBelowWreckFloor(sim, device))
            {
                Abandon(sim, device, worker, JobDropReason.NoConsumable); // no consumable, no free fix; the recruit gate will not re-offer it
                return;
            }
            if (Int3.IsAdjacent4(worker.Pos, device.Pos))
            {
                // M3-7 — the JURY-RIG leg, scaled through the same one seam as the parts-in-hand leg
                // above. BOTH legs, or the curve would apply only when the colony happened to have
                // Parts in stock. ⚠️ AND THE SENTENCE THAT STOOD HERE WAS FALSE AND IS QUOTED RATHER
                // THAN QUIETLY REPLACED: it claimed "a per-consumer hole the mutation table's leg 2 is
                // built to catch". It was not caught — independent review reverted the PARTS-IN-HAND
                // site alone and the full 1744-test suite stayed GREEN, because the only Repair
                // fixture drove this leg (empty-handed, no consumable aboard) and the two legs are
                // selected by whether a consumable exists, so one fixture cannot enter both.
                // `SkillConsumerTests.Repair_AServicerWithSkillFinishesInFewerTicks_OnBOTHAssignmentLegs`
                // now drives each, and ASSERTS which one it reached (`CarryingItemId` is the
                // discriminator) so they cannot silently collapse into one again.
                worker.JobWorkTicks = WorkRates.WorkTicksFor(worker, WorkType.Repair,
                    sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond);
                return;
            }
            if (sim.Paths.FindPath(sim, worker.Pos, staging, worker.Path)) worker.StartPath(sim.Defs.Citizen.TicksPerTile);
            else Abandon(sim, device, worker, JobDropReason.NoRouteToWorksite); // unreachable right now — the standing rule retries
        }

        // ------------------------------------------------------------------ helpers

        // ------------------------------------------------------------- arbitration (answering)

        /// <summary>M2-5: this system hands out exactly <see cref="WorkType.Repair"/>.</summary>
        public byte OfferedWorkTypes => 1 << (int)WorkType.Repair;

        /// <summary>
        /// M2-5 — <b>WOULD THIS SYSTEM SERVICE SOMETHING WITH THIS CREW MEMBER RIGHT NOW?</b> The
        /// answer <see cref="WorkArbiter"/> gives to everybody else when they ask whether repair
        /// outranks what they were about to do.
        ///
        /// <para><b>EVERY EARLY RETURN OF <see cref="RecruitForNeediest"/> IS MIRRORED HERE, IN ITS
        /// ORDER, AND THAT IS THE CORRECTNESS REQUIREMENT — NOT A TIDINESS ONE.</b> A condition
        /// missing from this list is an OVER-REPORT, and an over-report is a silent multi-sim-hour
        /// stall for every pawn at or below the Repair band (see <see cref="IWorkOfferSource"/>).
        /// The one thing deliberately NOT mirrored is <c>FindNearestReachableIdle</c>'s A* probe:
        /// that is the expensive half of the claim and this query is optimistic by construction.</para>
        ///
        /// <para>⚠️ It does NOT re-ask the arbitration (that would recurse). The caller has already
        /// decided that repair is the better work; this only says whether there is any.</para>
        /// </summary>
        public bool HasClaimableWork(Simulation sim, Citizen citizen, WorkType type, bool asIfIdle)
        {
            if (type != WorkType.Repair) return false;
            // M2-8: `asIfIdle` relaxes THIS gate and nothing else — see IWorkOfferSource. The
            // "already has a servicer" skip below is what keeps a Maintain pawn from being offered
            // her own machine back under the hypothetical.
            if (!(asIfIdle ? citizen.IsRecruitableIgnoringJob : citizen.IsRecruitableForWork) ||
                !citizen.CanTakeWorkType(WorkType.Repair)) return false;

            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Condition >= sim.Defs.Machines[(int)d.Kind].MaintainBelow) continue;
                if (_backoff.IsBackedOff(sim, d.Id)) continue;   // M1-H: refused within the last 5 s
                if (FindWorker(sim, d.Pos) != null) continue;    // already has a servicer
                if (!TryFindStagingTile(sim, d.Pos, out _)) continue; // walled in / nowhere survivable
                if (IsUnfixableWreck(sim, d)) continue;          // wreck rule W2: no service to offer
                return true;
            }
            return false;
        }

        /// <summary>The machine's single servicer: first live Maintain citizen bound to its tile.
        ///
        /// <para><b>PUBLIC since M2-9</b>, for the same reason <see cref="IsUnfixableWreck"/> is:
        /// <c>PrioritiseJobCommand</c> must refuse to bind a SECOND servicer to a machine, and
        /// "who is servicing this machine" has to be one question. <c>DriveWorkers</c> drives every
        /// Maintain citizen bound to the tile, so two of them would repair it twice while this
        /// method could only ever see the first.</para></summary>
        public static Citizen FindWorker(Simulation sim, Int3 devicePos)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (!c.Dead && c.JobKind == JobKind.Maintain && c.JobTarget == devicePos) return c;
            }
            return null;
        }

        /// <summary>
        /// M1-H: nearest recruitable citizen by Manhattan distance (ties: store order) WHO CAN
        /// ACTUALLY REACH THE MACHINE — next-nearest on a refusal, exactly as
        /// <see cref="JobSystem"/> retries the next-nearest candidate when a pull source's
        /// <c>TryClaim</c> returns false. The twin of
        /// <see cref="CraftingSystem.FindNearestReachableIdle"/>; read its doc comment for the
        /// argument, which is the same one, including the connectivity argument for why this can
        /// never refuse a machine the crew member could actually have got to.
        ///
        /// <para><paramref name="anyIdle"/> separates "nobody is free" (not a refusal) from
        /// "nobody free can get here" (a refusal worth a stamp).</para>
        /// </summary>
        private Citizen FindNearestReachableIdle(Simulation sim, Int3 target, WorkType work, out bool anyIdle)
        {
            anyIdle = false;
            _probeSkip.Clear();
            while (true)
            {
                Citizen best = null;
                int bestDist = int.MaxValue;
                var citizens = sim.Citizens.Items;
                for (int i = 0; i < citizens.Count; i++)
                {
                    var c = citizens[i];
                    if (!c.IsRecruitableForWork) continue;
                    // ⭐ M4-9 (BREAK GATE 4 of 6) — the second PUSH recruiter. Same placement
                    // argument as CraftingSystem's copy: before `anyIdle`, beside M2-2's veto, so a
                    // person's break is never recorded as a refusal by the MACHINE.
                    if (c.BreakRefusesWork) continue;
                    // ⭐ M2-2 (G3) — THE WORK-TYPE VETO, and this is the gate OD-G's opening beat
                    // rests on: without it MaintenanceSystem recruits the wreck's boot pawn for a
                    // Maintain service at ~tick 201 and the game plays itself. Placed BEFORE
                    // `anyIdle = true` for the same reason as CraftingSystem's copy — see its
                    // comment; a player setting must not be recorded as a refusal by the MACHINE.
                    if (!c.CanTakeWorkType(work)) continue;
                    // ⭐⭐ M2-5 (SITE 3) — THE PUSH GATE, AND IT IS THE HALF THAT REACHES A PAWN
                    // INSIDE A CHAIN. Tick() runs DriveWorkers and then RecruitForNeediest: a
                    // servicer who finishes here is freed and re-claimed INSIDE ONE TICK, so the
                    // dispatcher never sees her idle and a defer query in TryAssign is a measured
                    // NO-OP for the owner's own case (the M2-0 spike: zero idle sightings across
                    // 54 450 chain ticks). The order she was given can only reach her HERE.
                    //
                    // Placed BEFORE `anyIdle = true` for the same reason as M2-2's veto directly
                    // above: "she has better work to do" is not a refusal by the MACHINE, and the
                    // caller turns a refusal into a 5 s backoff stamp on the machine (M1-H). Stamp
                    // it here and the machine goes quiet for five seconds because of a decision
                    // about a person.
                    if (WorkArbiter.HasBetterOfferThan(sim, c, work, this)) continue;
                    anyIdle = true;
                    if (_probeSkip.Contains(c.Id)) continue;
                    int d = Int3.Manhattan(c.Pos, target);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        best = c;
                    }
                }
                if (best == null) return null;
                if (sim.Paths.FindPath(sim, best.Pos, target, _probePath)) return best;
                _probeSkip.Add(best.Id); // unreachable from where he stands — try the next-nearest
            }
        }

        /// <summary>
        /// THE WRECK RULE (wreck start W2): is this machine below <c>wear.wreck_threshold</c> with
        /// nothing aboard that could repair it? Such a machine has no service to offer — the
        /// empty-handed jury-rig that would otherwise restore it to
        /// <c>wear.jury_rig_condition</c> is refused.
        ///
        /// <para><b>PUBLIC on purpose.</b> The refusal is silent, exactly like
        /// <see cref="WorksiteSafety.CanStageWorkerAt"/>'s (<c>MECHANICS.md</c> §13.21), and a
        /// view-only <c>blocked</c> wire channel needs to be able to ask the same question the
        /// dispatcher asks rather than re-deriving it — re-deriving is how the two answers drift
        /// apart.</para>
        ///
        /// <para><b>Byte-identical above the threshold.</b> The first term is
        /// <c>Condition &lt; threshold</c>, so on a ship whose machines are all above it this
        /// method never reaches the item scan and never changes an outcome. With
        /// <c>wreck_threshold = 0</c> it is false for every device and the whole rule is inert.</para>
        ///
        /// <para><b>The consumable test is the DISPATCHER'S OWN, not a re-implementation.</b> It
        /// calls <see cref="FindNearestConsumable"/>, which is the only thing in the sim that puts
        /// a stack in a maintainer's hand, so "the gate said yes" and "the worker found something"
        /// cannot disagree. Its null-ness is position-independent — <see cref="FindNearest"/>
        /// filters on kind, carry, reservation and the stack tile's own breathability, and uses
        /// <paramref name="device"/>'s position only to break distance ties — so passing the
        /// machine's tile rather than the eventual worker's tile cannot change the ANSWER, only
        /// which stack would be chosen.</para>
        ///
        /// <para>⭐⭐ <b>M3-14 RUNG 2 — <paramref name="forced"/> IS NOT OPTIONAL BOOKKEEPING HERE,
        /// IT IS A DIFFERENT ANSWER.</b> <see cref="FindNearest"/> refuses a stack resting in
        /// unbreathable air, so on a wreck whose Parts are stranded behind the pressure frontier
        /// this method says UNFIXABLE to the dispatcher (correct — nobody may fetch them on their
        /// own) and <b>must say FIXABLE to a direct order</b>, which may. Leaving the flag out
        /// would refuse the player's order for "no consumable aboard" while the consumable sits
        /// three tiles from the machine, and would raise <c>WireFormat.ReasonNoConsumable</c> over
        /// it — a sentence that is false about the ship. That is the exact menu/job disagreement
        /// §8.4 rung 3 exists to prevent, arriving through the consumable gate instead of the
        /// staging gate.</para>
        ///
        /// <para>⭐⭐ <b>D3 — AND SINCE THE RESERVE FLOOR, <paramref name="forced"/> CHANGES THE
        /// ANSWER A SECOND TIME, FOR A SECOND REASON.</b> The un-forced ask now reads "…and nothing
        /// aboard that the STANDING RULE MAY SPEND on it": with the ship down to
        /// <see cref="AutonomousRepairReserve"/> loose units this returns TRUE while the ship
        /// visibly holds consumables, which is correct and is the whole point — the dispatcher must
        /// not offer a service it is not allowed to pay for, and offering one is the livelock. The
        /// forced ask is unchanged, so <c>PrioritiseJobCommand</c> and the <c>blocked</c> channel
        /// (both of which already pass <c>forced: true</c>) still see the reserved units: an order
        /// is not refused over them and <c>WireFormat.ReasonNoConsumable</c> is not raised over
        /// stock the player can still spend.</para>
        /// </summary>
        public static bool IsUnfixableWreck(Simulation sim, Device device, bool forced = false)
        {
            if (device == null) return false;
            if (!IsBelowWreckFloor(sim, device)) return false;
            // allowSwarf: TRUE unconditionally here, and it is not a shortcut — the line above has
            // already established that this machine is below the wreck floor, which IS the Swarf
            // rung's precondition. Salvage from the dead half of the ship is what makes a wreck
            // fixable at all, so a ship holding Swarf and nothing else has a service to offer.
            return FindNearestConsumable(sim, device.Pos, allowSwarf: true, forced) == null;
        }

        /// <summary>
        /// ⭐ <b>THE WRECK FLOOR TEST, DECLARED ONCE — is this machine below
        /// <c>wear.wreck_threshold</c>?</b> It is the ONE thing about a DEVICE that changes what a
        /// service here would cost, and it appears in FOUR places that must agree:
        /// <see cref="IsUnfixableWreck"/>'s first term, <see cref="DriveWorker"/>'s
        /// <c>allowSwarf</c> argument at the fetch, <c>DriveWorker</c>'s empty-handed split (no
        /// service below the floor, a free jury-rig at or above it), and
        /// <see cref="WhatARepairWouldSpend"/>.
        ///
        /// <para><b>A PURE EXTRACTION, NOT A NEW RULE.</b> Every call site below spelled
        /// <c>device.Condition &lt; sim.Defs.Wear.WreckThreshold</c> (or its negation) inline before
        /// this method existed and the comparison is unchanged. It is extracted because the
        /// <c>devices</c> channel now has to ask the same question host-side to pick between two
        /// precomputed answers, and a fourth hand-written copy of the comparison — this one across a
        /// project boundary — is exactly how the offer and the fetch come to disagree about which
        /// rung a machine is on.</para>
        ///
        /// <para>Null-tolerant like <see cref="IsUnfixableWreck"/>, whose own null arm it preserves:
        /// no device is on no rung.</para>
        /// </summary>
        public static bool IsBelowWreckFloor(Simulation sim, Device device)
            => device != null && device.Condition < sim.Defs.Wear.WreckThreshold;

        /// <summary>
        /// ⭐⭐ <b>WHAT A SERVICE AT THIS MACHINE WOULD SPEND — the three outcomes of
        /// <see cref="WhatARepairWouldSpend"/>, kept apart because two of them are "nothing" for
        /// completely different reasons and the player's sentence differs.</b>
        /// </summary>
        public enum RepairSpend
        {
            /// <summary>One unit of the named <see cref="ItemKind"/> is consumed
            /// (<c>MachineWearSystem.cs:358</c> — exactly one unit, whichever rung).</summary>
            Consumable = 0,

            /// <summary>Nothing is spent: the fetch finds no consumable and the machine is at or
            /// above <c>wear.wreck_threshold</c>, so the service is the free empty-handed jury-rig
            /// to <c>wear.jury_rig_condition</c>.</summary>
            Nothing = 1,

            /// <summary>Nothing is spent because there is NO SERVICE — the fetch finds no consumable
            /// and the machine is below <c>wear.wreck_threshold</c>, which is
            /// <see cref="IsUnfixableWreck"/> exactly. A wreck cannot be wished better.</summary>
            NoService = 2,
        }

        /// <summary>
        /// ⭐⭐ <b>WHAT WOULD A SERVICE AT THIS MACHINE SPEND, RIGHT NOW?</b> The question the Room
        /// Zoom's PRIORITISE offer has to answer BEFORE the player gives the order — the wreck boots
        /// with exactly one <c>Parts</c> unit aboard (<c>AuthoredShips.cs</c>, the WINNABILITY block)
        /// and the first repair order ate it with nothing said (T13 finding, 2026-08-02).
        ///
        /// <para><b>IT IS THE DISPATCHER'S OWN FUNNEL, NOT A SECOND LADDER.</b> The whole body is a
        /// call to <see cref="FindNearestConsumable"/> — the ONE place in the sim that decides which
        /// stack goes into a maintainer's hand — followed by the same
        /// <c>wear.wreck_threshold</c> test <see cref="DriveWorker"/> makes when the fetch comes back
        /// empty (<c>:452</c>). Nothing here restates <see cref="RepairConsumableTier"/>, and that is
        /// the point: ⛔ <see cref="WantedRepairConsumable"/> — the badge's answer — is tier 0
        /// UNCONDITIONALLY, so on a Seals-only ship it says PARTS while the service eats Seals. It is
        /// correct for the badge it serves (raised only when the ship holds NONE of the three) and it
        /// would be a confident lie here.</para>
        ///
        /// <para><b>POSITION-INDEPENDENT, WHICH IS WHY THERE IS NO <c>from</c> ARGUMENT.</b> Same
        /// argument <see cref="IsUnfixableWreck"/>'s doc already makes for its own null-ness:
        /// <see cref="FindNearest"/> filters on kind, carry, reservation and the stack tile's
        /// breathability, and uses <c>from</c> ONLY to break distance ties — and the tier is chosen by
        /// EXISTENCE (<see cref="FindNearestConsumable"/>'s tier-before-distance loop), so the device's
        /// tile can change WHICH stack is chosen but never WHAT KIND it is. Under
        /// <paramref name="forced"/> even the breathability filter is waived, so nothing about a
        /// position survives into this answer at all.</para>
        ///
        /// <para>⭐ <b>THE ONLY PER-DEVICE INPUT IS <paramref name="belowWreckFloor"/></b>
        /// (<see cref="IsBelowWreckFloor"/>), and it is a <c>bool</c> rather than a <see cref="Device"/>
        /// SO THAT A CALLER CAN PRECOMPUTE BOTH ANSWERS. A renderer asking this per device would run
        /// up to three item-store scans per row per frame — a cost <see cref="FindNearestConsumable"/>
        /// files against itself as owed and unmeasured. There are exactly TWO possible answers on any
        /// ship at any instant, so <c>GameSession.BuildDevices</c> computes both once and selects per
        /// row with an O(1) condition compare. The <see cref="Device"/> overload is the convenience
        /// form for a caller that only wants one.</para>
        ///
        /// <para>⚠️ <b>IT IS A HINT, NOT A PROMISE, AND THE OFFER SAYS SO IN THE SAME WORDS THE
        /// COMMISSION STATUS LINE DOES</b> (<c>GameSession.HandleCommission</c>: <i>"written from what
        /// is affordable RIGHT NOW rather than from the command's outcome … a module claimed between
        /// this line and the drain still refuses"</i>). A repair order runs
        /// <c>maintenance_work_seconds × 10 = 9000</c> ticks of fetch-and-service and re-runs this
        /// funnel at the fetch, so stock can move underneath it. ⛔ NOTHING IS RESERVED — the class
        /// header (<c>:134-138</c>) refuses reservations deliberately, and a price that claimed to be a
        /// promise would be the first step toward one.</para>
        ///
        /// <para><b>ASK IT WITH <paramref name="forced"/> TRUE TO PRICE AN ORDER.</b> D3's reserve
        /// floor is inside the funnel, so the unforced answer is what the STANDING RULE may spend —
        /// which on a ship at or below <see cref="AutonomousRepairReserve"/> loose units is nothing at
        /// all. Every host-side caller already passes <c>forced: true</c> for exactly this reason.</para>
        ///
        /// <para>VIEW-SAFE: reads only, allocates nothing, no RNG, no pathfind. Safe from a render
        /// thread on the same terms as <see cref="IsUnfixableWreck"/>.</para>
        /// </summary>
        /// <param name="kind">The unit that would be consumed — meaningful ONLY when the return is
        /// <see cref="RepairSpend.Consumable"/>. Set to <see cref="ItemKind.Regolith"/> (0) otherwise
        /// rather than left undefined, so a caller that ignores the return value cannot read a stale
        /// kind out of it.</param>
        public static RepairSpend WhatARepairWouldSpend(Simulation sim, bool belowWreckFloor, bool forced, out ItemKind kind)
        {
            kind = ItemKind.Regolith;
            // allowSwarf is `belowWreckFloor` because that is what the ONE LIVE CALL SITE passes —
            // `DriveWorker`'s fetch (`:421-423`) asks `device.Condition < sim.Defs.Wear.WreckThreshold`
            // and nothing else. The Swarf rung's precondition IS the wreck floor.
            // `from` is the ORIGIN and that is not a shortcut: see the position paragraph above. It
            // decides which of two equal-tier stacks is "nearest" and cannot decide the KIND, and the
            // KIND is the entire answer — the stack itself is deliberately not returned.
            var found = FindNearestConsumable(sim, default(Int3), allowSwarf: belowWreckFloor, forced);
            if (found != null) { kind = found.Kind; return RepairSpend.Consumable; }
            // The fetch came back empty. `DriveWorker:452-455` then splits on the SAME floor: below
            // it there is no service at all (the wreck rule, W2), at or above it the crew member
            // jury-rigs with empty hands and the ship pays nothing.
            return belowWreckFloor ? RepairSpend.NoService : RepairSpend.Nothing;
        }

        /// <summary>The convenience overload of <see cref="WhatARepairWouldSpend(Simulation, bool, bool, out ItemKind)"/>
        /// for one device — it supplies <see cref="IsBelowWreckFloor"/> and nothing else. A caller
        /// pricing MANY devices in one pass must use the <c>bool</c> form and precompute; see that
        /// method's cost paragraph.</summary>
        public static RepairSpend WhatARepairWouldSpend(Simulation sim, Device device, bool forced, out ItemKind kind)
            => WhatARepairWouldSpend(sim, IsBelowWreckFloor(sim, device), forced, out kind);

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
            if (kind == ItemKind.Swarf) return defs.Wear.SwarfServiceCondition; // salvage patch-up
            return defs.Wear.JuryRigCondition;
        }

        /// <summary>
        /// The same ladder, named rather than valued — what <see cref="RepairCompletedEvent"/>
        /// carries so the ship's log can say WHICH kind of repair happened. Deliberately a second
        /// switch on the same input rather than a reverse lookup on the returned float: the two
        /// service tiers are def scalars (<c>seal_service_condition</c>, <c>swarf_service_condition</c>)
        /// and a content tune that made two of them equal would silently collapse two distinct
        /// sentences into one.
        /// </summary>
        private static RepairTier TierOf(ItemKind kind)
        {
            if (kind == ItemKind.Parts) return RepairTier.Overhaul;
            if (kind == ItemKind.Seals) return RepairTier.Service;
            if (kind == ItemKind.Swarf) return RepairTier.SalvagePatch;
            return RepairTier.JuryRig; // the unreachable arm RestoredCondition also floors
        }

        /// <summary>
        /// Nearest unreserved ground stack of a maintenance consumable — <b>Parts first; only if
        /// the ship has none anywhere, Seals; and only then, and only when <paramref name="allowSwarf"/>,
        /// Swarf</b> (ties within a tier: item store order). THREE tiers, not two — the summary said
        /// two after the wreck start added the third.
        ///
        /// <para>⭐⭐ <b>D3 — AND UNLESS <paramref name="forced"/>, NOTHING AT ALL WHILE THE SHIP IS
        /// DOWN TO ITS RESERVE.</b> See <see cref="HasAutonomouslySpendableStock"/> and
        /// <see cref="AutonomousRepairReserve"/>: this is the ONE funnel every consumable decision
        /// in this file passes through, which is why the floor is applied here and nowhere
        /// else.</para>
        ///
        /// <para>⚠️ COST, unmeasured and owed: this is up to THREE full item-store scans, and the
        /// worst case is exactly the permanently-refused wreck — no Parts, no Seals, no Swarf — which
        /// <c>IsUnfixableWreck</c> re-evaluates at 1 Hz for as long as the machine stays needy.
        /// Unmeasurable on <c>--ship grid</c>; a wreck ship authors hundreds of such machines.</para>
        ///
        /// TIER BEFORE DISTANCE, and that is the whole reason E0-6's new rung is additive: the
        /// first loop is character-for-character the pre-E0-6 <c>FindNearestParts</c>, so on any
        /// ship holding a free Parts stack this function returns exactly what it always returned
        /// and the Seals loop is never entered. The second loop is only reachable in the state
        /// that used to produce a jury-rig at Condition 0.6.
        /// </summary>
        private static ItemStack FindNearestConsumable(Simulation sim, Int3 from, bool allowSwarf, bool forced = false)
        {
            // ⭐⭐ D3 — THE RESERVE FLOOR, AND IT IS DELIBERATELY THE FIRST LINE OF THE ONE FUNNEL.
            // See `AutonomousRepairReserve`. An UNORDERED service declines the ship's last few loose
            // consumable units; an ORDERED one (`forced`) sees the whole pile. Everything else in
            // this function is untouched, so above the floor the ladder is byte-identical.
            if (!forced && !HasAutonomouslySpendableStock(sim)) return null;

            // ⭐ M3-13 — THE TIERS COME FROM `RepairConsumableTier`, WHICH IS NOW THE LADDER'S ONE
            // DECLARATION. Behaviour is unchanged (Parts ▸ Seals ▸ Swarf, Swarf gated); what moved
            // is that a reader — including `WireFormat.ReasonNoConsumable`'s badge, which has to
            // NAME what a stalled repair wants — asks this file instead of restating the order.
            for (int tier = 0; tier < RepairConsumableTierCount; tier++)
            {
                // THE BOTTOM RUNG (wreck start, owner decision 3), and the ONLY tier with a
                // precondition. `allowSwarf` is true exactly when the machine is below
                // wear.wreck_threshold — i.e. when the free jury-rig has already been refused.
                //
                // ⚠️ IT MUST BE GATED OR IT IS A REGRESSION, not a feature. swarf_service_condition
                // (0.45) is BELOW jury_rig_condition (0.6), so offering Swarf to a merely-ROTTED
                // machine would send a crew member on a fetch to end up WORSE than empty hands — the
                // exact trap WearDefs.SealServiceCondition's comment records from the other
                // direction. Above the wreck floor this rung is never entered and the function is
                // behaviourally the pre-wreck-start FindNearestConsumable.
                //
                // GATED BY POSITION, NOT BY KIND: "the last tier is the wreck tier" is the rule, and
                // spelling it `kind == ItemKind.Swarf` would put a second copy of the ladder here.
                if (tier == RepairConsumableTierCount - 1 && !allowSwarf) break;
                var found = FindNearest(sim, from, RepairConsumableTier(tier), forced);
                if (found != null) return found;
            }
            return null;
        }

        /// <summary>
        /// ⭐⭐ <b>M3-13 — THE REPAIR LADDER, DECLARED ONCE.</b> Tier 0 <c>Parts</c> (a full
        /// overhaul), tier 1 <c>Seals</c> (a routine service), tier 2 <c>Swarf</c> (the salvage
        /// patch-up, and the only gated rung — see <see cref="FindNearestConsumable"/>).
        ///
        /// <para><b>WHY IT IS PUBLIC.</b> The <c>blocked</c> wire channel has to tell the player
        /// WHICH consumable a stalled repair order is waiting for, and the one thing it may not do
        /// is restate the ladder host-side: two copies of "what a service spends" is how the badge
        /// and the dispatcher come to name different items. Same rule, and the same words, as
        /// <see cref="IsUnfixableWreck"/>'s own doc comment — <i>"a view-only channel must ask the
        /// same question the dispatcher asks rather than re-deriving it"</i>.</para>
        ///
        /// <para>A <c>switch</c> over consts rather than a <c>static readonly ItemKind[]</c>: an
        /// exposed array is writable by every caller, and this runs on a tick path where the
        /// zero-alloc rule is test-enforced.</para>
        ///
        /// <para>Out-of-range tiers fall to the bottom rung rather than throwing — the ladder is
        /// total by construction, exactly as <c>ThawGate.RungOf</c> is.</para>
        /// </summary>
        public static ItemKind RepairConsumableTier(int tier)
        {
            switch (tier)
            {
                case 0: return ItemKind.Parts;
                case 1: return ItemKind.Seals;
                default: return ItemKind.Swarf;
            }
        }

        /// <summary>How many rungs <see cref="RepairConsumableTier"/> has.</summary>
        public const int RepairConsumableTierCount = 3;

        /// <summary>
        /// ⚠️⚠️ <b>D3 — THE RESERVE FLOOR: LOOSE CONSUMABLE UNITS AUTONOMOUS MAINTENANCE MAY NOT
        /// SPEND.</b> The standing rule stops fetching once the ship's reachable stock is down to
        /// this many units; a DIRECT ORDER (<c>forced</c>) still spends them.
        ///
        /// <para><b>THE DEFECT IT CLOSES, MEASURED IN THE M3 MILESTONE DEMO (finding D3).</b> With
        /// all six work types on, the maintenance board spent all ten of the wreck's loose Seals in
        /// ~4 sim-hours on whatever happened to be neediest. At zero consumables no bench can be
        /// repaired, so the crafting chain that earns the next thaw cannot start and the run
        /// TERMINALLY STALLS at two crew. Turning the work grid on bankrupted the ship, which made
        /// the grid — OD-G/OD-H's opt-in — a trap rather than a choice.</para>
        ///
        /// <para><b>WHY FOUR.</b> It is the ship's own stated critical path, not a tuning taste:
        /// <c>AuthoredShips.cs</c> (the WINNABILITY block, <c>:1601-1620</c>) prices the opening as
        /// <b>THREE BENCHES all booting below the wreck floor, one consumable service each, plus the
        /// MOSS terminal at 0.14 for one more ⇒ 4 consumables total</b>. Four units is therefore
        /// exactly what the player must still be able to spend by hand after autonomy has had its
        /// fill. It is not a safety margin and it is not a fraction of stock — it is the count of
        /// services the opening cannot be won without.</para>
        ///
        /// <para><b>A NAMED CONSTANT AND NOT A DEF FIELD, DELIBERATELY</b> — the shipped precedent
        /// is <see cref="ThawGate.MinDaysOfFood"/> (<c>ThawGate.cs:329-348</c>), whose own comment
        /// carries the argument: <i>"A def scalar moves P4 (defs defaults checksum) and P5
        /// (rules-inclusive), which this package's pin ritual requires to HOLD — and a def field
        /// pinned only by a checksum is not pinned at all."</i> Same reading here, and the same
        /// v1-literal-stated-as-a-rule shape as <c>CryoSystem.ThawSecondsPerCycle</c> and
        /// <c>BuildSystem.FloorConstructTicks</c>.</para>
        /// </summary>
        public const int AutonomousRepairReserve = 4;

        /// <summary>
        /// ⭐⭐ <b>D3 — THE RESERVE PREDICATE, DECLARED ONCE.</b> Does the ship hold MORE than
        /// <see cref="AutonomousRepairReserve"/> loose consumable units that an unordered crew
        /// member could actually reach? False ⇒ the autonomous path must behave as though the ship
        /// held none at all.
        ///
        /// <para>⛔ <b>ONE DECLARATION, AND IT IS CALLED FROM EXACTLY ONE PLACE — the first line of
        /// <see cref="FindNearestConsumable"/> — WHICH IS WHY THE THREE SITES CANNOT DISAGREE.</b>
        /// The reserve has to be seen by (i) <see cref="RecruitForNeediest"/>'s wreck gate, (ii)
        /// <see cref="DriveWorker"/>'s fetch and (iii) <see cref="HasClaimableWork"/>'s mirror, or a
        /// servicer is recruited for a machine the fetch will then refuse and abandons on arrival —
        /// re-offered at 1 Hz forever (M3-14's lesson; the mirror's own doc comment calls a missing
        /// condition <i>"a silent multi-sim-hour stall for every pawn at or below the Repair
        /// band"</i>). All three of those sites already funnel through
        /// <c>FindNearestConsumable</c> — (i) and (iii) via <see cref="IsUnfixableWreck"/> — so
        /// gating the funnel gates all three BY CONSTRUCTION rather than by three call sites that
        /// have to be kept in step. Mutation, applied and observed red: pass <c>forced: true</c>
        /// from <c>IsUnfixableWreck</c> (i.e. put the reserve at the fetch alone) and the recruit
        /// gate re-offers a below-floor machine every backoff window while the fetch refuses it,
        /// which is precisely the livelock.</para>
        ///
        /// <para><b>ALL THREE RUNGS COUNT, UNCONDITIONALLY — <c>allowSwarf</c> IS NOT CONSULTED.</b>
        /// The reserve is a fact about the SHIP'S STOCK, not about the machine being looked at, and
        /// the kinds come from <see cref="RepairConsumableTier"/> so this is not a second copy of
        /// the ladder. A per-machine count would make the ship's answer depend on which device
        /// asked, which is the shape the paragraph above exists to forbid.</para>
        ///
        /// <para><b>THE FILTERS ARE <see cref="FindNearest"/>'S OWN, ASKED IN THE AUTONOMOUS VIEW</b>
        /// (<c>forced: false</c>): unreserved, not in anybody's hands, and standing on a tile an
        /// unordered crew member may be staged on. Counting a stack stranded in vacuum would let the
        /// reserve be satisfied by units the dispatcher can never touch — it would permit spending
        /// the reachable ones down to zero, which is the defect.</para>
        ///
        /// <para><b>EARLY EXIT, so the cost is a partial scan on a healthy ship</b> and the
        /// zero-alloc tick-path rule is kept (no list, no LINQ). <c>Count</c> is the unit count, so
        /// one ten-unit stack answers this on its own.</para>
        ///
        /// <para>⚠️ <b>KNOWN AND FILED, NOT FIXED HERE: THE CARRIED-STACK BLACKOUT.</b>
        /// <see cref="DriveWorker"/> picks up the WHOLE stack for a one-unit service, and a carried
        /// stack has <c>CarriedBy != 0</c>, so while one servicer walks her ten units are invisible
        /// to this count and every other autonomous fetch is blocked until she sets the remainder
        /// down. The spend-down still lands on exactly <see cref="AutonomousRepairReserve"/> units —
        /// it is serialised, not wrong — and the same blindness already exists in
        /// <c>LooseMatter.Affordable</c>. Its own package.</para>
        /// </summary>
        public static bool HasAutonomouslySpendableStock(Simulation sim)
        {
            int units = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.CarriedBy != 0 || item.ReservedBy != 0) continue;
                if (!IsRepairConsumable(item.Kind)) continue;
                if (!WorksiteSafety.CanStageWorkerAt(sim, item.Pos, forced: false)) continue;
                units += item.Count;
                if (units > AutonomousRepairReserve) return true; // beyond the floor — nothing to decide
            }
            return false;
        }

        /// <summary>Is this kind a rung of the repair ladder? Walks
        /// <see cref="RepairConsumableTier"/> rather than restating <c>Parts/Seals/Swarf</c> — the
        /// ladder has ONE declaration (M3-13) and a reserve that spelled the kinds out again would
        /// be the second one. Three comparisons, no allocation.</summary>
        private static bool IsRepairConsumable(ItemKind kind)
        {
            for (int tier = 0; tier < RepairConsumableTierCount; tier++)
                if (RepairConsumableTier(tier) == kind) return true;
            return false;
        }

        /// <summary>
        /// ⭐ <b>WHAT A STALLED REPAIR ORDER IS WAITING FOR</b> — the consumable a service reaches
        /// for FIRST, i.e. <see cref="RepairConsumableTier"/>(0).
        ///
        /// <para>It is the item the <c>blocked</c> channel names on a
        /// <c>WireFormat.ReasonNoConsumable</c> row. That row is emitted only when the ship holds
        /// NONE of the three tiers (<see cref="IsUnfixableWreck"/>), so any of them would clear it;
        /// the badge names the TOP one because that is the one the servicer would actually pick up
        /// and the one that buys a full overhaul rather than a patch. The sentence the client
        /// composes keeps the rest of the truth — see <c>BLOCKED_REASON_DETAIL_TEXT</c>.</para>
        /// </summary>
        public static ItemKind WantedRepairConsumable => RepairConsumableTier(0);

        /// <summary>
        /// ⭐⭐ <b>M3-13 — IS THIS KIND OF MACHINE EVER SERVICEABLE AT ALL?</b> False when its
        /// <c>MachineDefs.MaintainBelow</c> is zero, which is the def's own opt-out.
        ///
        /// <para><b>IT IS THE PERMANENT HALF OF A COMPARISON THAT ALREADY EXISTS</b>, not a new
        /// rule. <c>PrioritiseJobCommand</c> refuses an order with
        /// <c>device.Condition &gt;= Machines[kind].MaintainBelow</c> and
        /// <see cref="RecruitForNeediest"/> skips a machine on the same test.
        /// <c>Device.Condition</c> is clamped at or above zero, so a kind whose
        /// <c>MaintainBelow</c> is <c>0</c> can NEVER satisfy it: there is no condition at which
        /// such a machine has a service to give, on any ship, forever.</para>
        ///
        /// <para><b>WHY ANYTHING NEEDS TO ASK.</b> The Room Zoom's right-click menu offered
        /// <i>PRIORITISE: REPAIR</i> on every device row, including <c>CryoPod</c>, whose
        /// <c>maint</c> is <c>0.00</c> deliberately (<c>MECHANICS.md</c> §13.22c — at 0.30 the lone
        /// pawn spent the ship's whole consumable stock nursing corpses). The click fired a toast,
        /// the command returned at the line above, and NOTHING reached any surface — the
        /// invisible-feedback failure with the menu's own promise in front of it. M3 makes the cryo
        /// bay the main screen, so the menu now asks this before it offers
        /// (<c>rimworld-reference.md</c> §2.2: <i>"if no menu appears, that colonist can do nothing
        /// with that target"</i>). The answer travels on the <c>devices</c> channel because
        /// <c>MaintainBelow</c> is a DEF value and a client-side list of never-serviceable kinds
        /// would be a second authority that drifts the day content moves.</para>
        /// </summary>
        public static bool IsEverServiceable(SimDefs defs, DeviceKind kind)
        {
            if (defs == null) return false;
            int k = (int)kind;
            var machines = defs.Machines;
            if (machines == null || k < 0 || k >= machines.Length) return false;
            return machines[k].MaintainBelow > 0f;
        }

        /// <summary>Nearest unreserved ground stack of one kind (ties: item store order).
        ///
        /// <para>⭐ <b>M3-14 RUNG 2 — <paramref name="forced"/> waives the breathability of the
        /// STACK'S OWN TILE</b>, which is the second place this system parks a worker. See
        /// <see cref="IsUnfixableWreck"/> for why the flag changes the ANSWER and not merely the
        /// journey: a Parts stack stranded in vacuum is invisible to the dispatcher and reachable
        /// by an order.</para></summary>
        private static ItemStack FindNearest(Simulation sim, Int3 from, ItemKind kind, bool forced = false)
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
                if (!WorksiteSafety.CanStageWorkerAt(sim, item.Pos, forced)) continue;
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
        /// <see cref="DriveWorker"/> drops any carried stack and releases the worker.
        ///
        /// <para><b>PUBLIC since M2-9.</b> <c>PrioritiseJobCommand</c> asks it before accepting a
        /// direct order — and asking THIS method rather than re-walking the four neighbours is what
        /// keeps that promise the same promise the dispatcher makes. It stays "the second and last
        /// place in the sim that picks a tile to park a worker on": the new caller reads the answer,
        /// it does not compute one.</para>
        ///
        /// <para>⭐⭐ <b>M3-14 RUNG 2 — AND THE SENTENCE ABOVE USED TO END "…and never
        /// <c>WorksiteSafety.CanStageWorkerAt</c>". THAT HALF IS RETRACTED, BY OWNER DECISION</b>
        /// (batch item 7, answer B, 2026-07-31; OD-K's fourth delegated call). A direct order now
        /// overrides the AIR half of the staging rule too: <paramref name="forced"/> is threaded
        /// straight into <c>CanStageWorkerAt</c>, whose doc comment carries the analogue
        /// (<c>rimworld-reference.md</c> §8.4 rung 2). <b>The APPROACH half is untouched</b> — the
        /// <see cref="Simulation.IsWalkable"/> test above the call is outside the flag, so a
        /// walled-in machine is refused with <paramref name="forced"/> set, exactly as before
        /// (<c>PrioritiseOrderTests.TheOrderNeverOverridesTheStagingRule_AWalledInMachineIsRefused</c>
        /// is that leg and it did not move).
        /// <br/>⚠️ <b>WHO PASSES TRUE, AND WHY IT IS NOT A DEFAULT.</b> <c>PrioritiseJobCommand</c>
        /// (the order being issued) and <see cref="DriveWorker"/> for a
        /// <see cref="Citizen.HeldByOrder"/> servicer (the order being executed). <b>Every
        /// dispatcher-side caller passes false</b> — <see cref="RecruitForNeediest"/> and
        /// <see cref="HasClaimableWork"/> — because rung 0 is the behaviour we are KEEPING: an
        /// unordered crew member with Repair on her grid still never walks into vacuum on her
        /// own.</para></summary>
        public static bool TryFindStagingTile(Simulation sim, Int3 devicePos, out Int3 staging, bool forced = false)
        {
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(devicePos, i);
                if (!sim.World.InBounds(n) || !sim.IsWalkable(n)) continue;
                if (!WorksiteSafety.CanStageWorkerAt(sim, n, forced)) continue;
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
        ///
        /// <para>⭐⭐ <b>D5 FOLLOW-ON — AND IT SAYS WHY, WHEN THE JOB WAS THE PLAYER'S ORDER.</b>
        /// <see cref="DriveWorker"/> reaches this method from NINE places
        /// (<see cref="JobDropReason"/> carries the table, arm by arm), and every one of them used
        /// to leave the same silence: <c>AbandonOrphan</c> clears <see cref="Citizen.JobKind"/>,
        /// whose setter releases <see cref="Citizen.HeldByOrder"/>, <b>which IS the order</b> — so
        /// the order evaporated with no record anywhere that it had ever existed. This is the one
        /// funnel, so one publish covers all nine (<c>MECHANICS</c> §13.25 b3).</para>
        ///
        /// <para>⛔⛔ <b>THE FUNNEL HAS ONE KNOWN EXCEPTION AND IT IS NAMED HERE, BECAUSE "the ONE
        /// funnel" AND "the compiler stops a tenth arm" BOTH READ AS COMPLETE AND ARE NOT.</b>
        /// <see cref="DriveWorkers"/> at <c>:207</c> calls <see cref="AbandonOrphan"/> <b>directly</b>
        /// — bypassing this method entirely — when the machine a servicer is holding has been
        /// deconstructed out from under her. That path publishes nothing, so a player's order dies
        /// there in silence too. It is defensible rather than accidental: the badge's site IS the
        /// machine's tile, and there is no machine, so there is nothing to draw a row on; the host's
        /// dropped-order walk independently drops any record whose device no longer resolves
        /// (<c>!_sim.Devices.TryGet</c>). Censused, not assumed — <c>AbandonOrphan</c> has exactly
        /// two callers in this file, <c>:207</c> and the line below.</para>
        ///
        /// <para>⛔ <b><paramref name="reason"/> HAS NO DEFAULT VALUE, ON PURPOSE</b> —
        /// <c>WireFormat.BlockedCell</c>'s constructor makes the identical argument for the identical
        /// hazard. A defaulted parameter would let a TENTH arm ship silently wearing whichever reason
        /// happened to be first in the enum, and the compiler is the only thing that can catch that:
        /// no test can see an arm that does not exist yet.</para>
        ///
        /// <para>⚠️ <b>THE HOLD IS READ FIRST AND THE ORDERING IS LOAD-BEARING.</b>
        /// <c>AbandonOrphan</c> is what clears it, so a publish written after that line would read
        /// <c>false</c> every time and the channel would be permanently empty — mute in a way that
        /// every "no row appears" assertion in the suite would agree with.</para>
        ///
        /// <para><b>ORDERS ONLY.</b> The dispatcher's own abandons are the ORDINARY case — M1-H's
        /// backoff funnel exists because this method is reached thousands of times a day on an
        /// unattended ship — and publishing them would put an unbounded per-tick stream on the bus
        /// for a reader that only ever wants the rare one. Argued in full on
        /// <see cref="OrderDroppedEvent"/>; the consequence for THIS file is that the branch below is
        /// false on every pinned fixture, which is why the package is pin-neutral.</para>
        /// </summary>
        private void Abandon(Simulation sim, Device device, Citizen worker, JobDropReason reason)
        {
            if (worker.HeldByOrder)
                sim.Events.Publish(new OrderDroppedEvent
                {
                    Pos = device.Pos,
                    DeviceId = device.Id,
                    CitizenId = worker.Id,
                    Reason = (byte)reason,
                });

            AbandonOrphan(worker);
            // M1-H — THE ONE FUNNEL (see CraftingSystem.Abandon for the argument; it is the same
            // one). Every abandon here says "this machine could not use this crew member right
            // now", and the pull sources stamp exactly that. Removing this line is mutation 1 of
            // the package's table on this half of the fix.
            _backoff.Refuse(sim, device.Id);
        }

        /// <summary>Clear job state WITHOUT a backoff stamp — the orphan path only (the machine is
        /// gone, so there is no target to stamp and nothing that could re-offer it).</summary>
        private static void AbandonOrphan(Citizen worker)
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
