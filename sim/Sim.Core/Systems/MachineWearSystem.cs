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
            if (!TryFindStagingTile(sim, device.Pos, out var staging))
            {
                DropCarried(sim, worker); // machine walled in mid-job
                Abandon(sim, device, worker);
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
                    Abandon(sim, device, worker);
                    return;
                }

                ItemStack consumable = null;
                if (worker.CarryingItemId != 0)
                {
                    if (!sim.Items.TryGet(worker.CarryingItemId, out consumable) || consumable.CarriedBy != worker.Id)
                    {
                        worker.CarryingItemId = 0; // stack vanished under us
                        Abandon(sim, device, worker);
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
                    Abandon(sim, device, worker);
                    return;
                }
                carried.Pos = worker.Pos; // glue at our 1 Hz cadence
                if (worker.HasPath) return;

                if (!Int3.IsAdjacent4(worker.Pos, device.Pos))
                {
                    DropCarried(sim, worker); // route was lost — the stack re-enters the pool
                    Abandon(sim, device, worker);
                    return;
                }
                worker.JobWorkTicks = sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond; // service begins, parts in hand
                return;
            }

            if (worker.HasPath) return; // ...or en route to a Parts stack / the machine

            // --- Settled and empty-handed: fetch a consumable, or jury-rig if none exist. ---
            // The Swarf rung is offered only to a machine the wreck rule has already refused a free
            // repair to — read off the device's CURRENT condition, at the moment of the fetch.
            var best = FindNearestConsumable(sim, worker.Pos,
                                             allowSwarf: device.Condition < sim.Defs.Wear.WreckThreshold);
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
                        Abandon(sim, device, worker);
                    }
                    return;
                }
                if (sim.Paths.FindPath(sim, worker.Pos, best.Pos, worker.Path)) worker.StartPath(sim.Defs.Citizen.TicksPerTile);
                else Abandon(sim, device, worker); // unreachable from here — retried from ground truth next second
                return;
            }

            // Neither Parts nor Seals anywhere in the colony: jury-rig with what's on hand —
            // UNLESS the machine is a wreck, which cannot be wished better (wreck start W2).
            if (device.Condition < sim.Defs.Wear.WreckThreshold)
            {
                Abandon(sim, device, worker); // no consumable, no free fix; the recruit gate will not re-offer it
                return;
            }
            if (Int3.IsAdjacent4(worker.Pos, device.Pos))
            {
                worker.JobWorkTicks = sim.Defs.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond;
                return;
            }
            if (sim.Paths.FindPath(sim, worker.Pos, staging, worker.Path)) worker.StartPath(sim.Defs.Citizen.TicksPerTile);
            else Abandon(sim, device, worker); // unreachable right now — the standing rule retries
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
        /// </summary>
        public static bool IsUnfixableWreck(Simulation sim, Device device)
        {
            if (device == null) return false;
            if (device.Condition >= sim.Defs.Wear.WreckThreshold) return false;
            // allowSwarf: TRUE unconditionally here, and it is not a shortcut — the line above has
            // already established that this machine is below the wreck floor, which IS the Swarf
            // rung's precondition. Salvage from the dead half of the ship is what makes a wreck
            // fixable at all, so a ship holding Swarf and nothing else has a service to offer.
            return FindNearestConsumable(sim, device.Pos, allowSwarf: true) == null;
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
            if (kind == ItemKind.Swarf) return defs.Wear.SwarfServiceCondition; // salvage patch-up
            return defs.Wear.JuryRigCondition;
        }

        /// <summary>
        /// Nearest unreserved ground stack of a maintenance consumable — <b>Parts first; only if
        /// the ship has none anywhere, Seals; and only then, and only when <paramref name="allowSwarf"/>,
        /// Swarf</b> (ties within a tier: item store order). THREE tiers, not two — the summary said
        /// two after the wreck start added the third.
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
        private static ItemStack FindNearestConsumable(Simulation sim, Int3 from, bool allowSwarf)
        {
            var best = FindNearest(sim, from, ItemKind.Parts);
            if (best != null) return best;
            best = FindNearest(sim, from, ItemKind.Seals);
            if (best != null) return best;
            // THE BOTTOM RUNG (wreck start, owner decision 3), and the ONLY tier with a
            // precondition. `allowSwarf` is true exactly when the machine is below
            // wear.wreck_threshold — i.e. when the free jury-rig has already been refused.
            //
            // ⚠️ IT MUST BE GATED OR IT IS A REGRESSION, not a feature. swarf_service_condition
            // (0.45) is BELOW jury_rig_condition (0.6), so offering Swarf to a merely-ROTTED machine
            // would send a crew member on a fetch to end up WORSE than empty hands — the exact trap
            // WearDefs.SealServiceCondition's comment records from the other direction. Above the
            // wreck floor this loop is never entered and the function is character-for-character the
            // pre-wreck-start FindNearestConsumable.
            return allowSwarf ? FindNearest(sim, from, ItemKind.Swarf) : null;
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
        /// <see cref="DriveWorker"/> drops any carried stack and releases the worker.
        ///
        /// <para><b>PUBLIC since M2-9.</b> <c>PrioritiseJobCommand</c> asks it before accepting a
        /// direct order, because a player's order overrides the work GRID and never
        /// <c>WorksiteSafety.CanStageWorkerAt</c> — and asking THIS method rather than re-walking
        /// the four neighbours is what keeps that promise the same promise the dispatcher makes.
        /// It stays "the second and last place in the sim that picks a tile to park a worker on":
        /// the new caller reads the answer, it does not compute one.</para></summary>
        public static bool TryFindStagingTile(Simulation sim, Int3 devicePos, out Int3 staging)
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
        private void Abandon(Simulation sim, Device device, Citizen worker)
        {
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
