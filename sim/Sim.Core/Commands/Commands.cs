namespace Perilune.Sim
{
    /// <summary>Open/close/lock/unlock a door (from UI, MOSS, or LLM effects).
    ///
    /// <para>⛔ ⭐ <b>OD-N — GATED ON <see cref="MossGate.IsServerLive"/>, AND THE GATE IS HERE
    /// RATHER THAN IN A HOST BECAUSE THERE ARE FIVE ROUTES TO THIS COMMAND.</b> The Room Zoom's
    /// operate reply (<c>hosts/web/GameSession.cs</c> <c>HandleOperate</c>), the deprecated console's
    /// cursor toggle (<c>ContextAction</c>), the TUI (<c>hosts/tui/GameLoop.cs:275,295</c>), the
    /// headless scenario host, and — decisively — <b>MOSS itself</b>
    /// (<c>Sim.Dsl/DeviceAdapters.cs:38</c>), which every installed program and every typed console
    /// line goes through. A host-side check would be *"not replayed on load, not folded into the
    /// hash, and not present in the TUI"* (M3-3's single-authority precedent) and would leave four
    /// back doors, one of them MOSS. One rule, five routes, replayed on load.</para>
    ///
    /// <para>⚠️ <b>THE AUTHORING PATHS ARE NOT GATED AND MUST NOT BE.</b> <c>AuthoredShips.cs:508</c>,
    /// <c>ShipPlanBuilder.cs:31</c> and <c>SaveReader.cs:345</c> write <see cref="Device.IsOpen"/>
    /// as a FIELD; the gate is on the COMMAND. A ship whose doors are authored open still boots with
    /// them open on a wreck with a dead computer, and a save restores them. Mutation 6.</para>
    ///
    /// <para><b>The refusal is SILENT here, on purpose, and it is not invisible.</b> An
    /// <see cref="ISimCommand"/> has no return channel and inventing one would be a wire change for
    /// three consumers who each already ask. <b>Refuse by predicate, report by predicate</b>: every
    /// surface calls <see cref="MossGate.IsServerLive"/> itself and renders
    /// <see cref="MossGate.OfflineRefusal"/> — see that constant's remarks for the three of
    /// them.</para></summary>
    public sealed class SetDoorStateCommand : ISimCommand
    {
        private readonly uint _deviceId;
        private readonly bool? _open;
        private readonly bool? _locked;

        public SetDoorStateCommand(uint deviceId, bool? open = null, bool? locked = null)
        {
            _deviceId = deviceId; _open = open; _locked = locked;
        }

        public void Execute(Simulation sim)
        {
            if (!MossGate.IsServerLive(sim)) return;   // OD-N — remote actuation needs a live server
            if (!sim.Devices.TryGet(_deviceId, out var device) || device.Kind != DeviceKind.Door) return;
            if (_locked.HasValue) device.IsLocked = _locked.Value;
            if (_open.HasValue)
            {
                bool target = _open.Value && !device.IsLocked;
                if (device.IsOpen != target)
                {
                    device.IsOpen = target;
                    sim.Events.Publish(new DoorStateChangedEvent { DeviceId = device.Id, IsOpen = device.IsOpen });
                }
            }
        }
    }

    /// <summary>Toggle a vent/scrubber-style device or set its rate.
    ///
    /// <para>⛔ ⭐ <b>OD-N GATES THIS COMMAND TOO, and the "and vents" half is the owner's own
    /// scoping</b> (OD-N follow-up 1: <i>"MOSS-only for doors AND vents"</i>). Gating only the door
    /// command would leave <c>vent_ls</c> — the M1 exit-gate device — and every rate write freely
    /// clickable on a ship with a dead computer. Mutation 1b drives <c>vent_cryo</c>, the vent that
    /// boots OPEN on the wreck, for exactly this leg.</para>
    ///
    /// <para>See <see cref="SetDoorStateCommand"/>'s remarks for why the gate is sim-side and why
    /// the refusal is reported by the surfaces rather than returned from here.</para>
    ///
    /// <para>⭐⭐ <b>OD-O (M3-16) ADDS A SECOND, PER-DEVICE GATE — AND IT COVERS ONLY THE SHUTTER.</b>
    /// <see cref="DeviceFault.BlocksActuation"/> refuses <c>open</c>/<c>close</c> on a device whose
    /// controller board is authored dead, for EVERY caller (there is no caller privilege — see that
    /// type's remarks), while <c>rate</c> writes still land. That asymmetry IS the puzzle: the
    /// switch does nothing, the rate is accepted and then bled away, and the only thing that keeps
    /// the vent running is a MOSS program that re-sets it in a loop.</para></summary>
    public sealed class SetDeviceStateCommand : ISimCommand
    {
        private readonly uint _deviceId;
        private readonly bool? _open;
        private readonly float? _rate;

        public SetDeviceStateCommand(uint deviceId, bool? open = null, float? rate = null)
        {
            _deviceId = deviceId; _open = open; _rate = rate;
        }

        public void Execute(Simulation sim)
        {
            if (!MossGate.IsServerLive(sim)) return;   // OD-N — remote actuation needs a live server
            if (!sim.Devices.TryGet(_deviceId, out var device)) return;
            // ⭐⭐ OD-O (M3-16) — THE DEAD BOARD, AND IT REFUSES ONLY THE SHUTTER. `open`/`close`
            // are the "easy turn-off switch" the owner's sentence kills; `set(rate, …)` is
            // deliberately ACCEPTED and then bled back toward 0 by AtmosphereSystem, which is what
            // makes the workaround a LOOP rather than a permission. The two halves are asked
            // separately here rather than by an early `return`, so a single command carrying both
            // gets each half's own answer instead of the first one's.
            //
            // ⚠️ SHIP GATE FIRST, TARGET SECOND — the M3-15 evaluation-order contract. Swapping
            // these two lines would answer CONTROLLER FAULT on a ship whose computer is off.
            if (_open.HasValue && !DeviceFault.BlocksActuation(device)) device.IsOpen = _open.Value;
            if (_rate.HasValue) device.Rate = _rate.Value < 0f ? 0f : _rate.Value > 1f ? 1f : _rate.Value;
        }
    }

    /// <summary>
    /// Direct move order (lone-survivor phase): path the citizen to the target tile.
    /// Disables auto-wander — from the first order on, the citizen only moves on command
    /// (until the M2 job system takes over idle behavior).
    /// </summary>
    public sealed class MoveCitizenCommand : ISimCommand
    {
        private readonly uint _citizenId;
        private readonly Int3 _target;

        public MoveCitizenCommand(uint citizenId, Int3 target)
        {
            _citizenId = citizenId; _target = target;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.Citizens.TryGet(_citizenId, out var citizen) || citizen.Dead) return;
            // A direct order overrides any job — cancel it cleanly (drop cargo where
            // they stand, release reservations) so nothing stays locked mid-redirect.
            sim.CancelJob(citizen);
            citizen.AutoWander = false;
            citizen.ClearPath();
            // E0-3: the order OWNS the citizen until it completes — no auto-work may hijack it
            // mid-walk (see Citizen.IsRecruitableForWork). Set only on a route that actually
            // exists: an unreachable target leaves the citizen plainly idle and recruitable, not
            // silently locked out of work by an order that never started.
            citizen.OrderedMove = sim.Paths.FindPath(sim, citizen.Pos, _target, citizen.Path);
            if (citizen.OrderedMove)
                citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
        }
    }

    /// <summary>
    /// M2-4 — THE PLAYER'S WORK-PRIORITY ORDER: set ONE crew member's manual priority for ONE
    /// <see cref="WorkType"/>. The only writer of <c>Citizen.WorkPrioritiesRaw</c> outside the save
    /// reader, and the whole reason M2-1's storage stops being storage-only.
    ///
    /// <para>PER-PAWN, BY ID — the <see cref="MoveCitizenCommand"/> precedent. <c>sim.Citizens.TryGet</c>
    /// resolves an ENTITY ID, never a store index: ids are not indices the moment anyone dies, and on
    /// a wreck they do. A dead crew member is refused for the same reason a move order is: writing a
    /// priority onto a corpse would move HASHED state (the CITZ v8 fold) for a row no surface will
    /// ever draw.</para>
    ///
    /// <para>PRECONDITION-LIGHT AND SILENT — the <see cref="SetStockpileFilterCommand"/> precedent. An
    /// unknown citizen id, a work-type index outside <c>0..WorkPriority.WorkTypeCount-1</c>, or a
    /// priority outside <c>0..WorkPriority.Lowest</c> is a NO-OP, not a throw. Two reasons, and the
    /// second is the load-bearing one: a client may enqueue a click blind (every designate verb
    /// already may), and <see cref="Citizen.SetWorkPriority"/> THROWS on an out-of-range priority
    /// because the byte is hashed — a throw that would escape on the sim thread's command drain and
    /// take the whole session down over a malformed line. This class is the guard that keeps that
    /// throw unreachable from the wire.</para>
    ///
    /// <para>⚠️ <b>BOTH PAYLOAD FIELDS ARE <c>int</c>, DELIBERATELY, AND THIS IS NOT A STYLE
    /// CHOICE.</b> The producer is a tolerant JSON reader (<c>WebCommand.Parse</c>) that yields
    /// <c>int</c>. If this constructor took <c>WorkType</c> and <c>byte</c>, the HOST would have to
    /// narrow first — and a narrowing cast is not a guard: <c>(byte)(-256)</c> is <c>0</c>, which is
    /// <see cref="WorkPriority.Off"/>, a perfectly REAL value. A garbled line would then switch a
    /// work type off instead of being dropped. Taking the raw ints puts the range check and the cast
    /// in ONE place, on the far side of the wire, where nothing can have narrowed the value before
    /// the check sees it.</para>
    ///
    /// <para>NO CAPABILITY CHECK, matching <see cref="Citizen.WorkIncapable"/>'s own stated
    /// invariant: nothing stops a priority being set on a work type this person cannot do. RimWorld's
    /// <c>Pawn_WorkSettings.SetPriority</c> refuses that (<c>docs/design/rimworld-reference.md</c>
    /// §1.6), and the refusal belongs with the capability SOURCE — the only package that can know the
    /// incapable state is reachable at all. Nothing writes <c>WorkIncapable</c> in this tree.</para>
    ///
    /// <para>NO EVENT, NO DIRTY FLAG. Unlike the designate commands this publishes no
    /// <c>TileChangedEvent</c> and sets no <c>JobsDirty</c> bit: nothing in the dispatcher reads the
    /// grid yet (M2-2 is the reader), so a dirty flag here would be a claim about a board that does
    /// not consult this state. It is one byte of citizen state and the next render picks it up off
    /// the citizen store.</para>
    /// </summary>
    public sealed class SetWorkPriorityCommand : ISimCommand
    {
        private readonly uint _citizenId;
        private readonly int _workType;
        private readonly int _priority;

        /// <param name="citizenId">The crew member's ENTITY id (never a store index).</param>
        /// <param name="workType">A <see cref="WorkType"/> value as a raw index; anything outside
        /// <c>0..WorkPriority.WorkTypeCount-1</c> is dropped.</param>
        /// <param name="priority">0 = <see cref="WorkPriority.Off"/>, 1..4 with 1 the HIGHEST;
        /// anything else is dropped.</param>
        public SetWorkPriorityCommand(uint citizenId, int workType, int priority)
        {
            _citizenId = citizenId; _workType = workType; _priority = priority;
        }

        public void Execute(Simulation sim)
        {
            if (_workType < 0 || _workType >= WorkPriority.WorkTypeCount) return;
            // ⚠️ THE LOWER BOUND IS PART OF THE GUARD. `0` is OFF and is a real, reachable order —
            // switching a work type back off is the second half of the player's verb — so this must
            // refuse only what is BELOW zero, never clamp it up to Highest. A clamp would make "off"
            // unsendable and the grid a one-way door.
            if (_priority < WorkPriority.Off || _priority > WorkPriority.Lowest) return;
            if (!sim.Citizens.TryGet(_citizenId, out var citizen) || citizen.Dead) return;
            citizen.SetWorkPriority((WorkType)_workType, (byte)_priority);
        }
    }

    /// <summary>
    /// ⭐⭐ <b>M2-9 — THE DIRECT ORDER: "THAT MACHINE, NOW."</b> One named crew member, one machine,
    /// picked by the player. She drops what she is doing, takes the repair, and
    /// <see cref="Citizen.HeldByOrder"/> keeps her on it until it ends (M2-19, <c>MECHANICS</c>
    /// §6.2c). The analogue is RimWorld's right-click ▸ <i>Prioritise doing X</i>
    /// (<c>docs/design/rimworld-reference.md</c> §2.2).
    ///
    /// <para><b>ADDRESSED BY DEVICE ID — TILE RESOLUTION IS HOST WORK</b> (integrator ruling,
    /// M2-9/M2-10 wire contract). The client can only name a machine by the tile it clicked (the
    /// <c>devices</c> channel carries no id), so <c>GameSession.HandlePrioritise</c> resolves
    /// <c>{x, y, deck}</c> through <see cref="Simulation.TryGetDeviceAt"/> — the sim's own
    /// one-device-per-tile index, and emphatically not that file's linear <c>TryDeviceAt</c> scan,
    /// which returns the CONDUIT on any tile that carries one (a live defect the OPERATE verb
    /// documents) — and refuses without enqueuing when the tile holds no machine. What crosses into
    /// the sim is therefore an ENTITY ID, which is stable while a tile's occupant is not.</para>
    ///
    /// <para>⭐ <b>THE DECISION THIS PACKAGE HAD TO TAKE: AN EXPLICIT ORDER OVERRIDES THE WORK GRID,
    /// AND NOTHING ELSE.</b> <see cref="Citizen.CanTakeWorkType"/> — the five-gate veto every
    /// recruiter reads — is deliberately NOT consulted here; <see cref="Citizen.IsIncapableOf"/>,
    /// its incapability half, is. §2.2 is the authority and it splits the two in one sentence, read
    /// off <c>Pawn_JobTracker.cs:112-120</c>: <i>"incapability wins even over a player order; a
    /// player's own priority-0 setting does not."</i> RimWorld keeps the forced job running when the
    /// player blanks its work type and ends it when the pawn is INCAPABLE, which is the same line
    /// drawn here at issue time. §2.2's other paragraph — <i>"it does NOT override disabled or
    /// incapable"</i> — is about <c>PawnCanUseWorkGiver</c>, which tests
    /// <c>WorkTypeIsDisabled</c> (incapability) and NOT <c>GetPriority(w) == 0</c>; that file marks
    /// the wiki's looser wording <b>UNVERIFIED</b> and says not to encode it, so the source-grade
    /// half decides.
    /// <br/>⚠️ <b>And under OD-H this is the DEFAULT case, not an edge case.</b> Every work type
    /// boots OFF on every ship, so a no-override reading would refuse the player's very first
    /// right-click and dead-end OD-G's opening beat anywhere outside the WORK tab.</para>
    ///
    /// <para>⭐⭐ <b>M3-14 (2026-07-31) — AND THE PARAGRAPH BELOW IS QUOTED AND HALF-RETRACTED BY
    /// OWNER DECISION</b> (batch item 7, answer B; OD-K's fourth delegated call). Clause (2) read:
    /// <i>"Safety — <c>TryFindStagingTile</c> (i.e. <c>WorksiteSafety.CanStageWorkerAt</c>) must
    /// find somewhere the servicer can survive the 900 s service; <b>an order may not park a crew
    /// member in vacuum</b>."</i> <b>An order now may.</b> That was rung 0 standing in for a ladder
    /// that had not been built; <c>rimworld-reference.md</c> §8.4 rung 2 is the analogue and the
    /// two gates below are asked with <c>forced: true</c>. What survives of the clause is its
    /// geometric half — <b>an order overrides the air, never the approach</b> — and the wreck rule
    /// (3), which is a fact about the SHIP's stock rather than about where a body may stand, is
    /// asked with the same flag for exactly that reason (a Parts stack behind the frontier is
    /// stock the order can reach). Rungs 3 and 4 land in <c>GameSession.BlockedReason</c> and
    /// <c>SafetySystem.Tick</c>; rung 1 (opt-in deadly work givers) is DEFERRED BY NAME to
    /// M3-7.</para>
    ///
    /// <para><b>WHAT IS NEVER OVERRIDDEN.</b> (1) <b>Incapability</b>, above. (2) <b>Safety</b> —
    /// <see cref="MaintenanceSystem.TryFindStagingTile"/> (i.e.
    /// <c>WorksiteSafety.CanStageWorkerAt</c>) must find somewhere the servicer can survive the
    /// 900 s service; an order may not park a crew member in vacuum. (3) <b>The wreck rule W2</b> —
    /// <see cref="MaintenanceSystem.IsUnfixableWreck"/>; a machine below <c>wear.wreck_threshold</c>
    /// with no Parts, Seals or Swarf aboard has no service to perform, and this is the ONE refusal
    /// that reaches the player, on the <c>blocked</c> wire channel as
    /// <c>WireFormat.ReasonNoConsumable</c>. (4) <see cref="Citizen.HoldPosition"/>, which is a fact
    /// about where a crew member may be rather than a preference about work.</para>
    ///
    /// <para><b>THE GATES ARE ASKED, NEVER RE-DERIVED.</b> Every one of them is
    /// <see cref="MaintenanceSystem"/>'s own — the same predicates <c>RecruitForNeediest</c> applies
    /// one tick later — because two copies of "can this machine be serviced" is exactly how the
    /// order and the dispatcher come to disagree about a machine the player is looking at.</para>
    ///
    /// <para>⚠️ <b>COMPOSITION ORDER IS THE M2-19 WRITER CONTRACT: JOB FIRST, HOLD SECOND</b>
    /// (<see cref="Citizen.HeldByOrder"/>). The <see cref="Citizen.JobKind"/> setter releases the
    /// hold on the way past <c>None</c>, so a hold written before the cancel — or before the new
    /// kind — is cleared again. And <b>the hold is never placed on a crew member who did not get the
    /// job</b>: every refusal above returns BEFORE the cancel, so no path can leave a held pawn with
    /// no job, which is the one state nothing may recruit and nothing can re-order.</para>
    ///
    /// <para><b>NO SAVED STATE, NO ORDER REGISTRY.</b> The held job IS the order — target, worker
    /// and lifetime — exactly as §2.2 keeps the forced flag on <c>curJob</c>. Nothing here is
    /// hashed, no chapter moves, and a command nobody sends changes nothing (the pins are
    /// untouched). ⛔ RimWorld's <c>Pawn_MindState.priorityWork</c> — the saved (cell, workGiver,
    /// tick) record that RE-ISSUES the job after an interruption — is still not built, and neither
    /// is its 30 000-tick timeout (integrator ruling); see <c>MECHANICS</c> §6.2c and §13.25.</para>
    ///
    /// <para>SILENT ON REFUSAL apart from the wreck rule, like every other command here. Autonomy is
    /// what she returns to when the job ends (OD-G), so <see cref="Citizen.AutoWander"/> is
    /// deliberately left alone — this is an order about WORK, not <see cref="MoveCitizenCommand"/>'s
    /// standing "only move when told".</para>
    /// </summary>
    public sealed class PrioritiseJobCommand : ISimCommand
    {
        private readonly int _citizenId;
        private readonly int _deviceId;

        /// <param name="citizenId">The crew member's ENTITY id (never a store index — ids stop being
        /// indices the moment anyone dies, and on a wreck they do).</param>
        /// <param name="deviceId">The machine's ENTITY id, resolved from the clicked tile host-side.</param>
        /// <remarks>⚠️ BOTH PAYLOAD FIELDS ARE <c>int</c>, DELIBERATELY — the
        /// <see cref="SetWorkPriorityCommand"/> argument. The producer is a tolerant JSON reader that
        /// yields <c>int</c>, and a cast is not a guard: <c>(uint)(-1)</c> is a perfectly real id
        /// shape, so a host that narrowed first would hand this class a value no check here could
        /// tell from a genuine one. Taking the raw ints keeps the sign check next to the cast.
        /// <br/>⚠️ It is NOT true that nothing can have reinterpreted the value before the check —
        /// an earlier draft of this remark claimed that and it was wrong. <c>WebCommand.Cid</c> is
        /// <c>uint</c>, so a negative <c>cid</c> is already reinterpreted inside <c>Parse</c> and
        /// cast back on the way in. That is harmless (it lands on an id no citizen has, and
        /// <c>TryGet</c> refuses it) but it means the guarantee is "one sign check in one place",
        /// not "the wire cannot have touched it".</remarks>
        public PrioritiseJobCommand(int citizenId, int deviceId)
        {
            _citizenId = citizenId; _deviceId = deviceId;
        }

        public void Execute(Simulation sim)
        {
            // 0 is the "no entity" id and a negative one cannot be an id at all; both are dropped
            // rather than reinterpreted, so a garbled line can never name a real entity by accident.
            if (_citizenId <= 0 || _deviceId <= 0) return;
            if (!sim.Citizens.TryGet((uint)_citizenId, out var citizen) || citizen.Dead) return;
            if (citizen.HoldPosition) return;
            if (!sim.Devices.TryGet((uint)_deviceId, out var device)) return;

            // The work type this order belongs to, out of M2-2's ONE table — the same lookup the
            // dispatcher's five gates and the `blocked` channel take. Hard-coding WorkType.Repair
            // here would be a second opinion about what a Maintain job is.
            if (!WorkTypeMap.TryOf(JobKind.Maintain, out var work)) return;
            // INCAPABLE ≠ DISABLED (§2.2, and the owner's own distinction): the GRID is overridden,
            // the PERSON's incapability is not. Note what is NOT called: CanTakeWorkType, which
            // folds both together.
            if (citizen.IsIncapableOf(work)) return;

            // Nothing to service — a machine at or above its maintain threshold has no job to give.
            // RimWorld's answer to an impossible order is a refusal at the point of the click
            // (§2.2); the click-time half is M2-10's, this is the sim half.
            if (device.Condition >= sim.Defs.Machines[(int)device.Kind].MaintainBelow) return;
            // ⭐⭐ M3-14 RUNG 2 — THE ORDER CROSSES THE PRESSURE FRONTIER. `forced: true`, and this
            // is MaintenanceSystem's own staging rule, not a second copy of it.
            //
            // ⚠️ WHAT IS STILL REFUSED IS THE GEOMETRY, NOT THE AIR: `TryFindStagingTile` tests
            // `Simulation.IsWalkable` OUTSIDE the flag, so a walled-in machine is refused exactly
            // as it always was. "An order overrides the air, never the geometry."
            if (!MaintenanceSystem.TryFindStagingTile(sim, device.Pos, out _, forced: true)) return;
            // ⭐ THE WRECK RULE W2 — the refusal the `blocked` channel surfaces as
            // ReasonNoConsumable. Asked here for the reason RecruitForNeediest asks it at
            // recruitment rather than in the work phase: discovering it later throws away 900 s of
            // a crew member's life.
            //
            // ⚠️ `forced: true` HERE TOO, AND IT IS THE SAME DECISION, NOT A SECOND ONE. The
            // consumable gate refuses a stack resting in unbreathable air, so without the flag the
            // order would be refused for "nothing aboard to fix it with" on a ship whose Parts are
            // simply behind the frontier the order was given to cross — and the badge raised over
            // the machine would say so on the wire. One rule, one flag, both gates.
            if (MaintenanceSystem.IsUnfixableWreck(sim, device, forced: true)) return;
            // One servicer per machine is an invariant of MaintenanceSystem.DriveWorkers, which
            // drives EVERY Maintain citizen bound to the tile: a second one would repair the same
            // machine twice over and FindWorker would only ever see the first. An order aimed at a
            // machine somebody else is already fixing is refused rather than allowed to double it.
            var servicer = MaintenanceSystem.FindWorker(sim, device.Pos);
            if (servicer != null && servicer != citizen) return;

            // ⛔⛔ SHE IS ALREADY SERVICING THE MACHINE THE ORDER NAMES — SO THE JOB MUST NOT BE
            // RE-ASSIGNED. Falling through to `CancelJob` below DESTROYS the service in flight:
            // measured on a repeat order at the machine she was already on, <c>JobWorkTicks</c>
            // 8 770 → 0 and the Parts stack in her hands dropped on the floor. M2-10 puts the second
            // right-click one click away from the first, so "the player clicked twice" must cost
            // nothing at all.
            //
            // ⭐ THE HOLD IS STILL ASSERTED, and that is the one thing this branch DOES do. It is
            // idempotent on a repeat click (she already carries it) and it is the whole point when
            // she reached this machine on her own: <c>MaintenanceSystem</c> recruited her, the player
            // sees her working and says "stay on THAT" — an order that returned without writing the
            // bool would leave the grid free to take her off it, which is the promise the verb makes.
            // The invariant holds by construction: she carries a Maintain job, so the hold can never
            // land on a jobless pawn here.
            //
            // ⚠️ SAME MACHINE ONLY. An order naming a DIFFERENT machine still replaces this one
            // through the cancel below — that is the player changing their mind, and it is how the
            // old job ends and the old hold is released.
            if (servicer == citizen)
            {
                citizen.HeldByOrder = true;
                return;
            }

            // ── the order takes. JOB FIRST … ──
            // CancelJob drops cargo where she stands, releases her reservations AND — because it
            // assigns JobKind.None — releases any OLDER order's hold on the way past. That is the
            // "a new direct order replaces the old" release condition, taken for free.
            sim.CancelJob(citizen);
            citizen.ClearPath();           // …and the walk she was on, the SafetySystem.cs:233 shape
            citizen.OrderedMove = false;
            citizen.JobKind = JobKind.Maintain;
            citizen.JobTarget = device.Pos;
            citizen.JobWorkTicks = 0;
            citizen.CarryingItemId = 0;
            // … ⭐ HOLD SECOND.
            citizen.HeldByOrder = true;
            // She left whatever site she was on and any stack she carried is back on the ground:
            // the same two bits CancelJob raises, re-raised because the assignment above changed
            // the citizen set every source re-derives.
            sim.JobsDirty |= JobBoardDirty.Citizens;
        }
    }

    /// <summary>
    /// Store a terminal's MOSS source as sim state via the command log (the DSL
    /// runtime compiles it separately; sources are canonical, programs are derived).
    /// </summary>
    public sealed class SetScriptCommand : ISimCommand
    {
        private readonly string _terminalId;
        private readonly string _source;

        public SetScriptCommand(string terminalId, string source)
        {
            _terminalId = terminalId; _source = source;
        }

        /// <summary>
        /// E0-6 — refuses on a terminal that is not <see cref="Device.Scriptable"/>: installing a
        /// program IS scripting the device, so the two doors into MOSS agree. Silent, like every
        /// other command's rejection.
        ///
        /// <b>A terminal id with no device behind it is still allowed</b>, and deliberately: the
        /// id is a free-text key (<c>hosts/scenario</c> and several tests drive `term_main` with no
        /// device at all), and refusing those would turn "no device" into "no automation" for
        /// callers that never had a device to commission. The gate bites exactly where there IS a
        /// device to fit a module to.
        /// </summary>
        public void Execute(Simulation sim)
        {
            if (TryFindNamedDevice(sim, _terminalId, out var terminal) && !terminal.Scriptable) return;
            sim.SetScript(_terminalId, _source);
        }

        /// <summary>The device whose <see cref="Device.Name"/> is <paramref name="name"/> (device
        /// store order, first match — the same identity MOSS resolves adapters by). Ordinal
        /// comparison: MOSS lowercases identifiers, device names are authored lowercase, and a
        /// culture-sensitive compare on a de-DE machine is exactly the bug class this repo keeps
        /// finding.</summary>
        internal static bool TryFindNamedDevice(Simulation sim, string name, out Device device)
        {
            if (!string.IsNullOrEmpty(name))
            {
                var devices = sim.Devices.Items;
                for (int i = 0; i < devices.Count; i++)
                {
                    if (!string.Equals(devices[i].Name, name, System.StringComparison.Ordinal)) continue;
                    device = devices[i];
                    return true;
                }
            }
            device = null;
            return false;
        }
    }

    /// <summary>Mark/unmark a rock tile for digging.</summary>
    public sealed class DesignateDigCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly bool _on;

        public DesignateDigCommand(Int3 pos, bool on)
        {
            _pos = pos; _on = on;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;
            // Only rock walls are diggable.
            if (_on && sim.World.GetWall(_pos) != TileDefs.Debris) return;
            sim.World.SetFlag(_pos, TileFlags.Designated, _on);
            sim.JobsDirty |= JobBoardDirty.Tiles; // a dig designation is a tile-board change
            sim.Events.Publish(new TileChangedEvent { Pos = _pos });
        }
    }

    /// <summary>Mark/unmark a floor tile as stockpile zone (haul destination).</summary>
    public sealed class DesignateStockpileCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly bool _on;

        public DesignateStockpileCommand(Int3 pos, bool on)
        {
            _pos = pos; _on = on;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;
            if (_on && (sim.World.GetFlags(_pos) & TileFlags.Walkable) == 0) return;
            sim.World.SetFlag(_pos, TileFlags.Stockpile, _on);
            // E0-4 (hazard 3): clearing the presence bit clears any E0-4 filter on the same tile,
            // so a de-designated stockpile never orphans a filter entry accumulating in the ZONE
            // hash. Optional-system-guarded — a stack without a StockZoneSystem is a no-op, and a
            // tile that never carried a filter is ClearFilter's own no-op.
            if (!_on) sim.StockZones?.ClearFilter(sim, _pos);
            sim.JobsDirty |= JobBoardDirty.Tiles; // a stockpile zone is a tile-board change
            sim.Events.Publish(new TileChangedEvent { Pos = _pos });
        }
    }

    /// <summary>
    /// Set the E0-4 accept-filter mask on a stockpile tile: bit <c>k</c> set ⇒ accept
    /// <see cref="ItemKind"/> <c>k</c>. Optional-system walk to <see cref="StockZoneSystem.SetFilter"/>
    /// (the <see cref="DesignateDeconstructCommand"/> contract) — a sim without a
    /// <see cref="StockZoneSystem"/> silently ignores it.
    ///
    /// PRECONDITION-LIGHT ON PURPOSE. There is no tile-legality check here: a mask on a
    /// non-stockpile tile is inert (the haul board only ever consults <see cref="StockZoneSystem.Accepts"/>
    /// where a <see cref="TileFlags.Stockpile"/> presence bit already exists), and the OFF path of
    /// <see cref="DesignateStockpileCommand"/> clears any stray entry. So a client may enqueue a
    /// filter click blind and an illegal tile is the same silent no-op every other designate is.
    /// An ABSENT entry (never set, or cleared) = accept-all; a <c>mask == 0</c> entry accepts nothing.
    /// </summary>
    public sealed class SetStockpileFilterCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly ulong _mask;

        public SetStockpileFilterCommand(Int3 pos, ulong mask)
        {
            _pos = pos; _mask = mask;
        }

        public void Execute(Simulation sim) => sim.StockZones?.SetFilter(sim, _pos, _mask);
    }

    /// <summary>
    /// Designate (or cancel) a build at a tile (P2 build/refit v0). Finds the stack's
    /// BuildSystem and calls its deterministic public API; a sim without a BuildSystem
    /// ignores the command (pre-M1 behavior preserved).
    /// </summary>
    public sealed class DesignateBuildCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly BuildKind _kind;
        private readonly bool _on;
        private readonly byte _material;

        public DesignateBuildCommand(Int3 pos, BuildKind kind, bool on = true, byte material = 0)
        {
            _pos = pos; _kind = kind; _on = on; _material = material;
        }

        public void Execute(Simulation sim)
        {
            foreach (var s in sim.Systems)
                if (s is BuildSystem b)
                {
                    if (_on) b.Designate(sim, _pos, _kind, _material);
                    else b.Cancel(sim, _pos);
                    return;
                }
        }
    }

    /// <summary>
    /// Designate (or cancel) a DECONSTRUCT at a tile (E0-5, build's inverse). Finds the stack's
    /// <see cref="DeconstructSystem"/> and calls its deterministic public API; a sim without one
    /// ignores the command (the <see cref="DesignateBuildCommand"/> optional-system walk), so a
    /// reduced stack keeps its pre-E0-5 behaviour.
    ///
    /// The <c>on</c> flag is EXPLICIT rather than a host-side read of world state (E0-3's
    /// decision): a sweep is then idempotent and the host can never race the sim. Every
    /// precondition — bounds, hull, wall-ness, device kind, the staging cap — is enforced sim-side
    /// at the tick boundary, so a client may enqueue a click blind and an illegal order is a
    /// silent no-op.
    ///
    /// THE COMMAND CARRIES A TILE, NEVER AN ENTITY ID (E0-5 WP-2 removed the <c>targetId</c>
    /// parameter WP-1 shipped). A device site's <see cref="PendingDeconstruct.TargetId"/> is
    /// resolved sim-side inside <see cref="DeconstructSystem.Designate"/>: the player clicks a
    /// tile, entity ids are sim-internal, and a client-supplied id would be a second unvalidated
    /// identity for the same object.
    /// </summary>
    public sealed class DesignateDeconstructCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly DeconstructKind _kind;
        private readonly bool _on;

        public DesignateDeconstructCommand(Int3 pos, DeconstructKind kind = DeconstructKind.Wall,
                                           bool on = true)
        {
            _pos = pos; _kind = kind; _on = on;
        }

        public void Execute(Simulation sim)
        {
            foreach (var s in sim.Systems)
                if (s is DeconstructSystem d)
                {
                    if (_on) d.Designate(sim, _pos, _kind);
                    else d.Cancel(sim, _pos);
                    return;
                }
        }
    }

    /// <summary>
    /// Place a piece of functional furniture at a floor tile (Room Zoom decorate palette).
    /// Furniture is inert — no power/heat/wear — so placement rides the existing hashed Device
    /// state (Kind/Pos/Name fold in <see cref="Simulation.StateHash"/>); it adds no new saved
    /// field. Validation is deterministic (no RNG/Date): the kind must be a placeable furniture
    /// kind, and the tile must be in bounds, a walkable non-wall floor, and empty of a device
    /// (one device per tile). An illegal request is a silent no-op — the client only promises the
    /// attempt and shows the item once the sim confirms it in the next frame.
    ///
    /// <para><b>IT COSTS MATTER (E0-5 WP-3).</b> Placing consumes
    /// <c>defs.Build.DevicePlaceCost</c> units of <see cref="Currency"/> from loose ground
    /// stacks. Before this, placement was FREE while <c>DeconstructSystem</c> paid
    /// <c>floor(device_parts × Condition)</c> Parts to strip the same object — measured by WP-2's
    /// independent review as an unbounded matter faucet: place → strip → repeat minted 1 Part per
    /// 476 ticks with zero matter input, against 15 000 ticks + 1 Regolith for the same Part
    /// through the shipped <c>recipes.def</c> ladder, feeding <c>MaintenanceSystem</c> — the one
    /// sink that never ends. Nothing bounded it: not material (free), not <c>max_staged</c> (a
    /// queue-depth cap, not a rate cap), not tiles (re-placeable instantly), not kind.</para>
    ///
    /// <para><b>THE CURRENCY IS THE ONE STRIP REFUNDS</b>, not the one BuildSystem charges for a
    /// wall. A Regolith cost against a Parts yield would be material-neutral and STILL an exploit:
    /// 2 Regolith → 2 Parts in 900 ticks bypasses the ~30 000 ticks of crafting the ladder charges
    /// for that conversion (Regolith →<i>600t</i>→ Scrap ×2 →<i>900t per 2</i>→ Parts). Charging
    /// Parts closes the loop in one move and leaves <see cref="Device.Condition"/> as the loss
    /// term. Structurally pinned: <see cref="Currency"/> == <c>DeconstructSystem.DeviceSalvage</c>
    /// is asserted by <c>DeconstructSystemTests</c>.</para>
    ///
    /// <para><b>HONESTLY STATED LIMIT — THE MATERIAL TELEPORTS.</b> Payment is taken from any free
    /// ground stack anywhere aboard, in item-store order, with no haul job, no reservation, and no
    /// distance term. Nobody carries the Parts to the tile. That is a deliberate simplification, not
    /// an oversight: a real staged-haul placement is <see cref="BuildSystem"/>'s shape
    /// (designate → <c>JobKind.HaulToBuild</c> → build) and belongs to E0-6, which owns the
    /// placement-as-a-build-site rework. Until then this is <c>MECHANICS §13</c> material: the COST
    /// is real and conserved, the LOGISTICS are not modelled.</para>
    ///
    /// <para><b>ALL OR NOTHING.</b> A ship that cannot pay in full places nothing and consumes
    /// nothing — partial consumption would be a matter leak (Parts destroyed, no device). The cost
    /// is charged LAST, after every legality check, so an illegal tile never spends. A refusal is
    /// the same silent no-op every other rejection is, so the web host
    /// (<c>GameSession.HandlePlace</c>) neither throws nor desyncs: it enqueues blind and the next
    /// frame simply does not contain the furniture.</para>
    /// </summary>
    public sealed class PlaceDeviceCommand : ISimCommand
    {
        private readonly DeviceKind _kind;
        private readonly Int3 _pos;

        /// <summary>What placing furniture is paid in. MUST equal
        /// <c>DeconstructSystem.DeviceSalvage</c> — the round trip is only provably lossy if the
        /// charge and the refund are the same currency (see the class doc).</summary>
        public const ItemKind Currency = ItemKind.Parts;

        public PlaceDeviceCommand(DeviceKind kind, Int3 pos)
        {
            _kind = kind; _pos = pos;
        }

        /// <summary>The furniture whitelist: crew/decor pieces the player may place or remove at
        /// runtime. Deliberately excludes doors, life-support, power, crafting, sensors and every
        /// other functional machine — those ship at authoring only.</summary>
        public static bool IsPlaceableFurniture(DeviceKind kind)
        {
            switch (kind)
            {
                case DeviceKind.Bed:
                case DeviceKind.Desk:
                case DeviceKind.Chair:
                case DeviceKind.Locker:
                case DeviceKind.PlantPot:
                case DeviceKind.Light:
                case DeviceKind.GrowBed:
                case DeviceKind.MedBed:
                case DeviceKind.Table:
                // ⭐ M3-10 — THE HEATER, AND IT IS THE POINT OF THE PACKAGE RATHER THAN A ROW ON A
                // LIST. A heater the player cannot place is a def entry: the ship freezes, the
                // compartment refuses work, and the only device that answers it would exist solely
                // for a level author. It is here on the same footing as Light and GrowBed, which
                // are already functional machines the player builds — the whitelist's "no
                // life-support" prose above is about the ship's AUTHORED plant (vents, scrubbers,
                // reactors), not about tier. Being here also makes it REMOVABLE:
                // RemoveDeviceCommand gates on this same predicate, so a heater put in the wrong
                // compartment can be taken back for the usual Parts salvage.
                case DeviceKind.Heater:
                    return true;
                default:
                    return false;
            }
        }

        public void Execute(Simulation sim)
        {
            if (!IsPlaceableFurniture(_kind)) return;
            if (!sim.World.InBounds(_pos)) return;
            // A walkable non-wall floor tile, empty of any device (one-per-tile rule).
            if ((sim.World.GetFlags(_pos) & TileFlags.Walkable) == 0) return;
            if (sim.World.GetWall(_pos) != TileDefs.Void) return;
            if ((sim.World.GetFlags(_pos) & TileFlags.HasDevice) != 0) return;
            if (sim.TryGetDeviceAt(_pos, out _)) return;
            // CHARGED LAST, so an illegal request never spends: every rejection above leaves the
            // ship's matter untouched, and this one leaves it untouched too when it cannot pay.
            if (!TryPay(sim, sim.Defs.Build.DevicePlaceCost)) return;
            // Deterministic name (kind + tile) — no counters, no RNG; InvariantCulture ints.
            string name = System.FormattableString.Invariant(
                $"{_kind.ToString().ToLowerInvariant()}_{_pos.X}_{_pos.Y}_{_pos.Z}");
            var placed = sim.AddDevice(_kind, _pos, name); // marks rooms + power dirty
            // E0-6 — what the PLAYER bolts on is not commissioned. The device works physically the
            // instant it is placed; what it does not have is a controller module, so MOSS cannot
            // see it (MossBindings.RegisterAdapters skips it) until a CommissionDeviceCommand
            // spends one. Authored and generated devices keep Device.Scriptable's true default, so
            // no shipped ship, program or rule changes.
            placed.Scriptable = false;
        }

        /// <summary>
        /// Free <see cref="Currency"/> units lying loose aboard: on the ground
        /// (<c>CarriedBy == 0</c>) and unclaimed (<c>ReservedBy == 0</c>). Carried and reserved
        /// stacks are somebody else's — a builder's haul, a station's staged input, a
        /// maintainer's overhaul Part — and taking them would strand the job that claimed them
        /// (the B-1 bug class).
        /// </summary>
        public static int Affordable(Simulation sim) => LooseMatter.Affordable(sim, Currency);

        /// <summary>
        /// Consume exactly <paramref name="cost"/> units of <see cref="Currency"/>, or NOTHING.
        /// Two passes on purpose: pass one counts, and only if the whole price is affordable does
        /// pass two spend. A single greedy pass that ran out halfway would destroy matter and
        /// place nothing — the leak this command exists to close, inverted.
        ///
        /// DETERMINISTIC: stacks are drained in ITEM-STORE ORDER (insertion order, the sim's
        /// canonical entity order — the same order <c>Simulation.StateHash</c> folds them in), so
        /// two identical sims spend the same stacks. No distance term, no nearest-first tie-break,
        /// no RNG, no Dictionary iteration, and no allocation: emptied stacks are removed in place
        /// and the cursor simply does not advance over the shift
        /// (<see cref="EntityStore{T}.Remove"/> is an order-preserving <c>List.Remove</c>).
        ///
        /// A zero or negative cost is free and consumes nothing, so a content pack that unsets
        /// the price gets the pre-E0-5 behaviour rather than an exception.
        /// </summary>
        private static bool TryPay(Simulation sim, int cost) =>
            LooseMatter.TryPay(sim, Currency, cost);
    }

    /// <summary>
    /// The ship's loose matter, and the ONE way a command spends it (E0-6 extracted this from
    /// <see cref="PlaceDeviceCommand"/>; the semantics below are that command's, verbatim, because
    /// a second copy of an all-or-nothing spend is a second chance to write a matter leak).
    ///
    /// "Loose" means on the ground (<c>CarriedBy == 0</c>) and unclaimed (<c>ReservedBy == 0</c>).
    /// Carried and reserved stacks belong to somebody — a builder's haul, a station's staged input,
    /// a maintainer's overhaul Part — and taking them strands the job that claimed them (the B-1
    /// bug class).
    /// </summary>
    internal static class LooseMatter
    {
        /// <summary>Free units of <paramref name="kind"/> lying loose aboard.</summary>
        public static int Affordable(Simulation sim, ItemKind kind)
        {
            int units = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (it.Kind != kind || it.CarriedBy != 0 || it.ReservedBy != 0) continue;
                units += it.Count;
            }
            return units;
        }

        /// <summary>
        /// Consume exactly <paramref name="cost"/> units of <paramref name="kind"/>, or NOTHING.
        /// Two passes on purpose: pass one counts, and only if the whole price is affordable does
        /// pass two spend. A single greedy pass that ran out halfway would destroy matter and
        /// deliver nothing.
        ///
        /// DETERMINISTIC: stacks are drained in ITEM-STORE ORDER (insertion order, the sim's
        /// canonical entity order — the same order <c>Simulation.StateHash</c> folds them in), so
        /// two identical sims spend the same stacks. No distance term, no nearest-first tie-break,
        /// no RNG, no Dictionary iteration, and no allocation: emptied stacks are removed in place
        /// and the cursor simply does not advance over the shift
        /// (<see cref="EntityStore{T}.Remove"/> is an order-preserving <c>List.Remove</c>).
        ///
        /// A zero or negative cost is free and consumes nothing, so a content pack that unsets a
        /// price gets the un-priced behaviour rather than an exception.
        /// </summary>
        public static bool TryPay(Simulation sim, ItemKind kind, int cost)
        {
            if (cost <= 0) return true;
            if (Affordable(sim, kind) < cost) return false; // all or nothing — never a partial spend

            int remaining = cost;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count && remaining > 0; )
            {
                var it = items[i];
                if (it.Kind != kind || it.CarriedBy != 0 || it.ReservedBy != 0 || it.Count <= 0)
                {
                    i++;
                    continue;
                }
                int take = it.Count < remaining ? it.Count : remaining;
                it.Count -= take;
                remaining -= take;
                if (it.Count == 0) sim.Items.Remove(it.Id); // shifts left: hold the cursor
                else i++;
            }
            sim.JobsDirty |= JobBoardDirty.Items; // ground stacks were spent — the haul board shrinks
            return true;
        }
    }

    /// <summary>
    /// Fit a <see cref="ItemKind.ControllerModule"/> to the device on a tile, making it
    /// MOSS-scriptable (E0-6). <b>This is the only consumer of ControllerModule in the game</b>,
    /// and giving it one is the whole point of the package: until E0-6 every scrap of finite matter
    /// aboard converted up the ladder into modules that nothing could spend, so the economy
    /// terminated permanently at ~sim-hour 28 (MECHANICS §13.15) with 31 of them stacked on one
    /// tile. ECONOMY.md §11 fixes the scope of the fix in one sentence: "No second job for
    /// ControllerModule. It gates MOSS scriptability. One job."
    ///
    /// <para><b>ALL OR NOTHING, and charged LAST</b> — <see cref="PlaceDeviceCommand"/>'s contract,
    /// through the same <see cref="LooseMatter"/> spend. A tile with no device, a device already
    /// commissioned, or a ship that cannot pay: nothing changes and nothing is consumed. Refusal is
    /// the same silent no-op every other designate/place command uses, so a host can enqueue blind.</para>
    ///
    /// <para><b>It bumps <c>DeviceTopologyVersion</c>.</b> The MOSS <c>DeviceRegistry</c> is HOST
    /// state, not sim state, and is populated by <c>MossBindings.RegisterAdapters</c> — so a device
    /// that becomes scriptable mid-game needs the host to re-derive its adapters, and the topology
    /// counter is the signal hosts already watch. Nothing in the deterministic sim depends on it.</para>
    ///
    /// <para><b>Not reversible, on purpose.</b> There is no un-commission: the module is fitted, and
    /// the only way to get it back is E0-5's strip, which destroys the device (and un-registers its
    /// adapter — "you can break your own automation by selling a valve", ECONOMY.md §9.3). Placing a
    /// fresh device and commissioning it again costs another module, which is what makes this a
    /// SINK rather than a toggle.</para>
    /// </summary>
    public sealed class CommissionDeviceCommand : ISimCommand
    {
        private readonly Int3 _pos;

        /// <summary>What commissioning is paid in. One kind, one job (ECONOMY.md §11).</summary>
        public const ItemKind Currency = ItemKind.ControllerModule;

        public CommissionDeviceCommand(Int3 pos)
        {
            _pos = pos;
        }

        /// <summary>
        /// ⚠️ TWO OF THE FOUR GUARDS BELOW ARE UNTESTED, AND THAT IS RECORDED RATHER THAN HIDDEN
        /// (the same disclosure <c>MaintenanceSystem.RestoredCondition</c>'s unreachable arm gets).
        /// <c>InBounds</c> and the nameless-device check are DEFENSIVE: the host clamps every
        /// coordinate before enqueueing (<c>GameSession.HandleCommission</c>), and every device
        /// <c>Simulation.AddDevice</c> creates through a player path is given a deterministic name,
        /// so neither guard is reachable from any surface that exists today. No mutation in the
        /// package's harness turns them red, because no mutation can. They are kept because a
        /// future authoring path could produce either shape and a module spent on a nameless device
        /// would buy the player nothing — but nobody should read them as covered.
        /// </summary>
        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;                  // UNTESTED — see above
            if (!sim.TryGetDeviceAt(_pos, out var device)) return;
            if (device.Scriptable) return;            // already fitted — never charge twice
            if (string.IsNullOrEmpty(device.Name)) return;          // UNTESTED — see above
            // CHARGED LAST, so every rejection above leaves the ship's matter untouched.
            if (!LooseMatter.TryPay(sim, Currency, sim.Defs.Build.CommissionCost)) return;
            device.Scriptable = true;
            sim.DeviceTopologyVersion++; // hosts re-derive MOSS adapters off this

            // ⭐ D1 — AND THE SHIP REMEMBERS IT. Published AFTER the flip, so every refusal above
            // announces nothing; HistorySystem reads it on the next tick (commands run in tick
            // phase 1, the bus swaps at that tick's end). An event rather than a direct
            // HistorySystem.Record because the Record route needs a `sim.Systems` walk, and this
            // file's occurrence count for that escape hatch is pinned at 2 by
            // ArchitectureBoundaryTests.Economy_ReachesIntoShipSystemsAtExactlyTheAllowlistedSites.
            sim.Events.Publish(new DeviceCommissionedEvent
            {
                Pos = _pos,
                DeviceId = device.Id,
                Device = (byte)device.Kind,
                DeviceName = device.Name,
            });
        }

        /// <summary>Free <see cref="Currency"/> units aboard — what a host needs to grey out the
        /// affordance rather than let the player click into a silent refusal.</summary>
        public static int Affordable(Simulation sim) => LooseMatter.Affordable(sim, Currency);
    }

    /// <summary>
    /// ⭐⭐ M3-3 — <b>WAKE SOMEBODY UP.</b> The player's one way to ask, and the ship answers YES —
    /// the capsule begins its cycle and <see cref="CryoSystem"/> takes it from there — or NO, with
    /// a named reason and a number.
    ///
    /// <para>⛔ <b>THIS IS A MOSS <i>SCREEN</i> VERB, NOT A MOSS <i>LANGUAGE</i> VERB, AND THAT IS
    /// NOT REVERSIBLE LATER WITHOUT BREAKING SAVES.</b> <c>ScriptRuntime.Tick</c> consults no
    /// device at all — not <c>Powered</c>, not <c>Condition</c>, not <c>Scriptable</c> — so a
    /// ten-line installed program carrying a thaw verb could <b>empty the cryo bay unattended</b>,
    /// which is the precise opposite of the owner's <i>"only one after the other"</i> and of
    /// control-not-conveyance. ⇒ <b>No adapter is registered for a <see cref="DeviceKind.CryoPod"/>
    /// and <c>MossBindings.RegisterAdapters</c>'s switch is not touched.</b> The only route in is
    /// the host's <c>moss</c> op <c>thaw</c> (<c>GameSession.HandleMoss</c>), which lowers to this
    /// command. It is deliberately NOT a console-prompt verb either: <c>ExecConsole</c> inherits its
    /// authority from the DSL adapters (IX-M40) and a thaw would be the one verb there that grants
    /// authority the DSL withholds.</para>
    ///
    /// <para><b>EVERY TERM IS RESOLVED HERE, FROM SIM STATE.</b> <see cref="ThawGate.Evaluate"/>
    /// is the single authority; the host calls the same function to render the answer and enqueues
    /// this command <b>unconditionally</b>, so the host cannot accept a thaw the sim would refuse
    /// and cannot refuse one the sim would accept. A term evaluated host-side instead would be
    /// "not replayed on load, not folded into the hash, and not present in the TUI".</para>
    ///
    /// <para><b>ALL OR NOTHING, AND CHARGED LAST</b> — <see cref="CommissionDeviceCommand"/>'s
    /// contract, through the same <see cref="LooseMatter"/> spend. Every refusal above returns
    /// before the spend, so <b>a refused thaw leaves the ship's matter byte-identical</b>. That is
    /// structural rather than careful: <see cref="ThawGate.Evaluate"/> is pure and cannot spend.</para>
    ///
    /// <para><b>NO NEW HASHED STATE.</b> The cycle rides <see cref="Device.Progress"/>, which is
    /// already saved (DEVC) and already hashed (<c>Simulation.cs:545-555</c>); the price rides the
    /// item store. Nothing here adds a field, a def or a system, so P1–P5 do not move —
    /// <b>a command nobody sends changes nothing</b> (the E0-5 shape).</para>
    /// </summary>
    public sealed class ThawCommand : ISimCommand
    {
        private readonly string _terminalName;
        private readonly string _podName;

        /// <param name="terminalName">The console the request came through — term 2 resolves it by
        /// <c>Device.Name</c>. It is the WHERE gate and it is why a thaw needs MOSS restored.</param>
        /// <param name="podName">The capsule's <c>Device.Name</c> (<c>pod_ozawa</c>). Names are the
        /// pod's identity and are immutable after boot (M3-1, <c>docs/MECHANICS.md</c> §13.27),
        /// which is what makes a name safe to carry in a command.</param>
        public ThawCommand(string terminalName, string podName)
        {
            _terminalName = terminalName ?? "";
            _podName = podName ?? "";
        }

        /// <summary>
        /// The gate, then the price, then the cycle. Nothing else.
        ///
        /// <para>⚠️ <b>THE REFUSAL PATHS RETURN WITHOUT PUBLISHING, AND THAT IS NOT THE HOUSE
        /// STYLE'S SILENCE.</b> Every other designate/place command refuses silently because there
        /// is nothing to say; here the reason is a first-class product and it is produced by
        /// <see cref="ThawGate.Evaluate"/> — the same call the host makes, on the same state, at the
        /// same tick boundary — so it reaches the player as
        /// <c>{"type":"moss","ev":"thaw",…,"reason":"…"}</c> whether or not this method says
        /// anything. What must never happen is a thaw ACCEPTED here and silently dropped;
        /// <see cref="ThawGate.Evaluate"/> having exactly one caller-visible outcome per refusal is
        /// what prevents it.</para>
        /// </summary>
        public void Execute(Simulation sim)
        {
            var verdict = ThawGate.Evaluate(sim, _terminalName, _podName);
            if (!verdict.Allowed) return;
            if (!sim.Devices.TryGet(verdict.PodId, out var pod)) return; // unreachable: the gate resolved it

            // TERM 6 — the price, all or nothing, and the LAST thing that happens before the
            // capsule moves. Term 4 read the same stock through the same lens one moment ago, so
            // this cannot fail; it is checked anyway because "cannot fail" is a claim about today's
            // callers and the alternative is spending nothing and cycling anyway.
            var rung = verdict.Rung;
            if (!LooseMatter.TryPay(sim, rung.Item, rung.Count)) return;

            // THE CYCLE BEGINS. One pass's worth of progress, so `CryoSystem`'s countdown owns
            // every subsequent step and the capsule is already "busy" for term 3 on the very next
            // evaluation — a thaw accepted at tick N must block a thaw asked for at tick N+1.
            pod.Progress = 1f / CryoSystem.ThawSecondsPerCycle;
        }
    }

    /// <summary>
    /// Remove a placed furniture device from a tile (Room Zoom demolish). Only the furniture
    /// whitelist (<see cref="PlaceDeviceCommand.IsPlaceableFurniture"/>) is removable — doors,
    /// life-support, power, crafting and sensors are never deleted this way. Deterministic no-op
    /// when the tile holds no removable furniture.
    /// </summary>
    public sealed class RemoveDeviceCommand : ISimCommand
    {
        private readonly Int3 _pos;

        public RemoveDeviceCommand(Int3 pos)
        {
            _pos = pos;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;
            if (!sim.TryGetDeviceAt(_pos, out var device)) return;
            if (!PlaceDeviceCommand.IsPlaceableFurniture(device.Kind)) return;
            sim.RemoveDevice(device.Id); // marks rooms + power dirty
        }
    }

    // ⭐ M1-L-b, 2026-07-29: `AddRoomCommand` STOOD HERE AND IS DELETED, together with
    // `GameSession.CmdKind.AddRoom` (which renumbered — see that enum's own note). M1-L had already
    // deleted every route to it on the owner's ruling *"we do not need 'add room' that makes no
    // sense on a ship where rooms are already existing"* (OD-K); every compartment IS a room because
    // its WALLS make it one (RimWorld analogue: `docs/design/rimworld-reference.md` §7 item 10,
    // "Rooms are derived, not authored"), so nothing allocates one and no sim primitive needs to.
    // What the command's ~750-line test file guarded that is STILL LIVE — the pressure frontier
    // ("naming is free, air is earned": an airless carved compartment fills through an OPENED door
    // in a measured band, and never fills with the door shut) — moved to `GridWreckTests`
    // (`OpeningACompartmentsDoor_FillsIt_AndTheFillTimeIsMeasured` + `…_NeverFills`), where it is a
    // statement about the ATMOSPHERE rather than about a command. `RoomType`, `RoomAnchor.Type` and
    // `RoomState.SetAnchor` all stay: the sim still types rooms, the PLAYER just never allocates one.

    /// <summary>Edit terrain (M1: used by tests and the debug UI; designations arrive in M2).</summary>
    public sealed class SetTileCommand : ISimCommand
    {
        private readonly Int3 _pos;
        private readonly ushort? _floor;
        private readonly ushort? _wall;

        public SetTileCommand(Int3 pos, ushort? floor = null, ushort? wall = null)
        {
            _pos = pos; _floor = floor; _wall = wall;
        }

        public void Execute(Simulation sim)
        {
            if (!sim.World.InBounds(_pos)) return;
            if (_floor.HasValue) sim.World.SetFloor(_pos, _floor.Value);
            if (_wall.HasValue) sim.World.SetWall(_pos, _wall.Value);
            sim.Rooms.MarkDirty();
            sim.Events.Publish(new TileChangedEvent { Pos = _pos });
        }
    }
}
