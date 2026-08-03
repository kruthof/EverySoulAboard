namespace Perilune.Sim
{
    /// <summary>A tile's floor/wall/flags changed — view marks the containing chunk dirty.</summary>
    public struct TileChangedEvent : ISimEvent
    {
        public Int3 Pos;
    }

    /// <summary>Rooms were recomputed (topology change) — atmosphere overlays refresh.</summary>
    public struct RoomsChangedEvent : ISimEvent
    {
        public int RoomCount;
    }

    /// <summary>Fog of war: at least one tile became Explored this pass (view refresh).</summary>
    public struct FogRevealedEvent : ISimEvent
    {
        public int NewlyRevealed;
    }

    public struct DoorStateChangedEvent : ISimEvent
    {
        public uint DeviceId;
        public bool IsOpen;
    }

    /// <summary>Raised by MOSS `alarm(...)` / `alarm when` and by sim systems; feeds the alerts UI.</summary>
    public struct AlarmRaisedEvent : ISimEvent
    {
        public string SourceId;   // terminal/device name
        public string Message;
    }

    public struct CitizenDiedEvent : ISimEvent
    {
        public uint CitizenId;
        public Int3 Pos;

        /// <summary>Appended (P2 wave-2 contract): NeedsSystem removes the citizen from the
        /// store the same tick it publishes, so consumers reading one tick later (history,
        /// eulogy) can no longer resolve the name by id — the event carries it instead.
        /// Transient event data; never hashed or saved.</summary>
        public string Name;
    }

    /// <summary>An authored objective completed (GoalSystem); HistorySystem logs it.</summary>
    public struct GoalCompletedEvent : ISimEvent
    {
        public string Text;
    }

    /// <summary>A power network shed (or restored) consumers this balance pass.</summary>
    public struct BrownoutChangedEvent : ISimEvent
    {
        public ushort NetworkId;
        public bool InBrownout;
    }

    /// <summary>
    /// A directed opinion edge crossed a relationship-type threshold (SocialSystem hysteresis
    /// classifier). Rel values are the Social RelationType enum, carried as byte so the event
    /// contract stays append-only and lane-independent.
    /// </summary>
    public struct RelationshipChangedEvent : ISimEvent
    {
        public uint From;
        public uint To;
        public byte OldRel;
        public byte NewRel;
    }

    /// <summary>Two co-located citizens argued (deterministic social pass roll) — memory + history consume.</summary>
    public struct ArgumentEvent : ISimEvent
    {
        public uint A;
        public uint B;
        public Int3 Pos;
    }

    /// <summary>Two co-located citizens bonded (deterministic social pass roll) — memory + history consume.</summary>
    public struct BondEvent : ISimEvent
    {
        public uint A;
        public uint B;
        public Int3 Pos;
    }

    /// <summary>
    /// An agreed task (AgreeTask effect) was dropped unfinished — job cancelled, citizen
    /// died, or target invalidated before completion (P2 wave-2 contract; publisher lands
    /// with the promise-watcher package). Feeds the broken-promise grudge memory.
    /// </summary>
    public struct PromiseBrokenEvent : ISimEvent
    {
        public uint CitizenId;
        public Int3 JobTarget;
    }

    /// <summary>A designated build (wall/door/device) finished constructing (BuildSystem).</summary>
    public struct ConstructionCompletedEvent : ISimEvent
    {
        public Int3 Pos;
        public byte BuildKind;   // BuildSystem's kind enum as byte (append-only contract)
        public uint BuilderId;
    }

    /// <summary>
    /// A designated deconstruct finished and the world actually changed (E0-5,
    /// <see cref="DeconstructSystem.Complete"/>) — build's inverse of
    /// <see cref="ConstructionCompletedEvent"/>, and the reason <c>Complete</c>'s worker id is a
    /// live parameter rather than decoration. Published ONLY on a real tear-down: a site consumed
    /// by validate-on-arrival (the wall went away, the device was already removed, the wall became
    /// hull) changes nothing and therefore announces nothing.
    ///
    /// <see cref="Device"/> carries the removed device's kind as a byte so the Chronicle can name
    /// what was stripped AFTER the entity is gone — <see cref="Simulation.RemoveDevice"/> runs in
    /// the same tick, and HistorySystem reads events one tick later, so an id lookup would always
    /// miss (exactly the CitizenDiedEvent.Name precedent). 0 is unambiguous "not a device":
    /// <see cref="DeviceKind.Door"/> is 0 and is the one kind deconstruct never strips.
    /// </summary>
    public struct DeconstructCompletedEvent : ISimEvent
    {
        public Int3 Pos;
        public byte Kind;        // DeconstructKind as byte (append-only contract)
        public byte Device;      // DeviceKind as byte; 0 when Kind == Wall (Door is never stripped)
        public uint WorkerId;
        public int Yield;        // units actually dropped (0 when a worn machine is worth nothing)
        /// <summary>The <see cref="ItemKind"/> those units were, as a byte (wreck start, owner
        /// decision 3). A device strip pays Parts above the Parts cliff and
        /// <see cref="ItemKind.Swarf"/> below it, so <see cref="Yield"/> alone can no longer tell
        /// the Chronicle what was recovered. Walls carry <see cref="ItemKind.Regolith"/>.
        ///
        /// This bus is TRANSIENT: events are neither saved nor folded into
        /// <c>Simulation.StateHash</c> (HistorySystem folds kind and tick, never text), so the field
        /// and the Chronicle line it feeds are pin-neutral.</summary>
        public byte YieldKind;
    }

    /// <summary>
    /// Which rung of <c>MaintenanceSystem</c>'s ladder a finished service was — the ONE thing that
    /// distinguishes a machine restored to new from a machine patched with the shredded remains of
    /// another machine. Persisted nowhere; it rides <see cref="RepairCompletedEvent"/> only, so it
    /// is free to reorder — but it will not be, because it mirrors
    /// <c>MaintenanceSystem.RestoredCondition</c>'s four arms one for one.
    /// </summary>
    public enum RepairTier : byte
    {
        /// <summary>No consumable was in hand: the machine was patched to
        /// <c>wear.jury_rig_condition</c>, not fixed.</summary>
        JuryRig = 0,
        /// <summary><see cref="ItemKind.Swarf"/> — the salvage patch-up rung.</summary>
        SalvagePatch = 1,
        /// <summary><see cref="ItemKind.Seals"/> — the routine service rung.</summary>
        Service = 2,
        /// <summary><see cref="ItemKind.Parts"/> — a full overhaul, Condition back to 1.0.</summary>
        Overhaul = 3,
    }

    /// <summary>
    /// ⭐⭐ THE REPAIR ARRIVED. Published by <c>MaintenanceSystem.DriveWorker</c> on the tick a
    /// service's work phase actually ends and <c>Device.Condition</c> is written — never when a job
    /// is abandoned, never when a worker is merely recruited.
    ///
    /// <para><b>WHY AN EVENT AND NOT A DIRECT <c>HistorySystem.Record</c>:</b> the rule is pinned,
    /// not stylistic. <c>MachineWearSystem.cs</c> is an ECONOMY file
    /// (<c>ArchitectureBoundaryTests.EconomyFilesInSharedDirectories</c>), and
    /// <c>Economy_KnowsNothingAboutSoulsPresentationOrPhysiology</c> forbids the identifier
    /// <c>Chronicle</c> there with the reason written into the test itself: <i>"narrative record —
    /// publish an event, let HistorySystem write it"</i>. <see cref="ConstructionCompletedEvent"/>
    /// and <see cref="DeconstructCompletedEvent"/> are the two reference implementations.</para>
    ///
    /// <para>The device's KIND and NAME ride the event for the same reason
    /// <see cref="DeconstructCompletedEvent.Device"/> does — not because the entity is gone (it is
    /// not), but because HistorySystem reads a tick late and a machine can be stripped, or a
    /// worker can die, in between. The line must be able to name what was fixed with no lookup.</para>
    ///
    /// <para>TRANSIENT, like every other channel on this bus: not saved, not folded into
    /// <c>Simulation.StateHash</c>. What IS hashed is the history ENTRY it produces.</para>
    /// </summary>
    public struct RepairCompletedEvent : ISimEvent
    {
        public Int3 Pos;
        public uint DeviceId;
        public uint WorkerId;
        /// <summary><see cref="DeviceKind"/> as a byte (append-only contract).</summary>
        public byte Device;
        /// <summary><see cref="RepairTier"/> as a byte — which of the four arms paid for it.</summary>
        public byte Tier;
        /// <summary>The device's authored name, so the line can say <i>which</i> scrubber.</summary>
        public string DeviceName;
    }

    /// <summary>
    /// ⭐ A DEVICE BECAME SCRIPTABLE. Published by <c>CommissionDeviceCommand.Execute</c> after the
    /// module is spent and <c>Device.Scriptable</c> is flipped — so a refusal (no device, already
    /// commissioned, cannot pay) announces nothing, exactly as
    /// <see cref="DeconstructCompletedEvent"/>'s validate-on-arrival arm announces nothing.
    ///
    /// <para>A COMMAND publishing onto the bus is precedented in the same file
    /// (<c>SetDoorStateCommand</c> publishes <c>DoorStateChangedEvent</c>; three commands publish
    /// <c>TileChangedEvent</c>), and it is the route the architecture boundary permits: the direct
    /// <c>HistorySystem.Record</c> route CryoSystem uses needs a <c>sim.Systems</c> walk, whose
    /// occurrence count in <c>Commands.cs</c> is pinned at 2 by
    /// <c>Economy_ReachesIntoShipSystemsAtExactlyTheAllowlistedSites</c>.</para>
    ///
    /// <para>Commands execute in phase 1 of a tick and the bus swaps at that tick's end, so
    /// HistorySystem reads this on the FOLLOWING tick — one tick later than the flip, which is the
    /// same lag every other Chronicle line already carries.</para>
    /// </summary>
    public struct DeviceCommissionedEvent : ISimEvent
    {
        public Int3 Pos;
        public uint DeviceId;
        /// <summary><see cref="DeviceKind"/> as a byte (append-only contract).</summary>
        public byte Device;
        /// <summary>The device's authored name — the handle the player will type at the console.</summary>
        public string DeviceName;
    }

    /// <summary>
    /// ⭐ M3-2 — A CAPSULE OPENED AND A PERSON CAME OUT. Published by
    /// <see cref="CryoSystem"/> exactly once per thaw, on the tick the pod actually opens —
    /// never on a cycle that merely finished counting and found nowhere to put anybody
    /// (<c>CryoSystem.TryFindExitTile</c> holds the pod shut in that case, and a capsule that
    /// did not open announces nothing). Mirrors <see cref="DeconstructCompletedEvent"/>'s shape:
    /// a position plus the two entity ids, no strings.
    ///
    /// <para>The person's name is deliberately NOT on the event. <see cref="CitizenId"/> resolves
    /// to a live <see cref="Citizen"/> that is still in the store when readers run one tick later
    /// — unlike <c>DeconstructCompletedEvent.Device</c> or <c>CitizenDiedEvent.Name</c>, which
    /// carry data BECAUSE their subject is gone by then. A thaw is a birth, not a removal.</para>
    ///
    /// <para>This bus is TRANSIENT: events are neither saved nor folded into
    /// <c>Simulation.StateHash</c>, so this type is pin-neutral by itself — the pin this package
    /// moves comes from <c>CryoSystem</c>'s <see cref="IStatefulSystem"/> fold.</para>
    /// </summary>
    public struct CitizenThawedEvent : ISimEvent
    {
        /// <summary>The tile the new crew member is standing on (the pod's exit neighbour).</summary>
        public Int3 Pos;
        /// <summary>The freshly added <see cref="Citizen"/>.</summary>
        public uint CitizenId;
        /// <summary>The capsule that opened; its <see cref="Device.Name"/> is the sleeper's identity.</summary>
        public uint PodId;
    }

    /// <summary>
    /// ⭐⭐ <b>D5 FOLLOW-ON — WHY <c>MaintenanceSystem.DriveWorker</c> LET GO OF A JOB.</b> One
    /// member per distinct CAUSE, and the mapping onto <c>DriveWorker</c>'s <b>nine</b>
    /// <c>Abandon</c> call sites is written out here because the count is the whole claim of the
    /// package that added it — the parameter has NO DEFAULT, so the compiler is what keeps a tenth
    /// arm from shipping mute.
    ///
    /// <code>
    ///   MachineWearSystem.cs   phase                                   reason
    ///   ---------------------  --------------------------------------  --------------------
    ///   :321  drive entry      the machine lost its staging tile        NoWorksiteTile
    ///   :333  work phase       displaced / a path we never set          Displaced
    ///   :343  work phase       the stack in hand is not ours any more   CargoLost
    ///   :419  logistics        the stack in hand is not ours any more   CargoLost
    ///   :428  logistics        arrived, and not beside the machine      NoRouteToWorksite
    ///   :466  fetch, on stack  no route from the stack to the worksite  NoRouteToWorksite  ⭐ D5
    ///   :471  fetch            no route to the stack itself             NoRouteToConsumable
    ///   :481  fetch, empty     nothing aboard and below the wreck floor NoConsumable
    ///   :502  fetch, empty     no route to the worksite to jury-rig it  NoRouteToWorksite
    /// </code>
    ///
    /// <para>⚠️ <b>THE LINE NUMBERS ARE THIS TREE'S, RE-MEASURED AFTER THE EDIT — the last four moved.</b>
    /// D5's diagnosis (<c>MECHANICS</c> §13.25 b3, <c>WireFormat.ReasonNoRoute</c>) names the pickup
    /// branch as <c>:464</c>, which was its line BEFORE this package added a two-line comment above
    /// it. Same arm, same branch; only the number moved. The COUNT — nine — is the load-bearing part
    /// and it is pinned by <c>DroppedOrderTests.DriveWorkerHasNineAbandonArms_AndEveryDropReasonIsUsedByOne</c>,
    /// which counts call sites rather than trusting this table.</para>
    ///
    /// <para><b>TWO COLLAPSES, BOTH DELIBERATE, AND NEITHER IS TIDINESS.</b> <c>:343</c>/<c>:419</c>
    /// are the identical sentence about the identical fact (the carried stack vanished under her)
    /// reached from two phases. <c>:428</c>/<c>:464</c>/<c>:500</c> are the identical fact about the
    /// WORKSITE's route — the reader's live re-ask is one question, so three codes would be three
    /// names for one predicate. What is NOT collapsed is <c>:469</c>: the route to the PARTS is a
    /// different route from the route to the MACHINE, and a reader that could not tell them apart
    /// would point the player at the wrong door.</para>
    ///
    /// <para>⛔ <b>THIS IS A REASON, NOT A SENTENCE.</b> Nothing here decides what a player is told.
    /// Three of the six are answered by the host RE-ASKING a live predicate — never by replaying
    /// this byte as text — and three have no surface today. See
    /// <c>GameSession.BuildBlocked</c>'s dropped-order walk.</para>
    ///
    /// <para>⛔⛔ <b>AND THE REASON THE OTHER THREE HAVE NO SURFACE IS NOT "THEY HEAL" — THAT CLAIM
    /// STOOD HERE AND IS MEASURABLY FALSE. IT IS CORRECTED RATHER THAN QUIETLY REPLACED.</b> The
    /// first draft said <see cref="Displaced"/> and <see cref="CargoLost"/> were <i>self-healing —
    /// the standing rule re-recruits from ground truth on the next pass</i>. It does not, in the
    /// state the game actually boots in: <c>FindNearestReachableIdle</c> gates on
    /// <c>CanTakeWorkType</c> (<c>MachineWearSystem.cs:598</c>, mirrored in <c>HasClaimableWork</c>
    /// at <c>:534</c>), and under OD-H <b>every work type boots OFF</b> — so nothing re-recruits
    /// anybody, ever, until the player opens the WORK tab. Driven on the shipped wreck: order
    /// <c>fabricator_1</c> with the route open, the first render retires the pending record, yank
    /// the carried stack at the pickup (tick 171) ⇒ <c>CargoLost</c>, the host FILES the drop, and
    /// 3 000 further ticks later she has never been re-recruited and the channel has read
    /// <c>cells:[]</c> throughout. <b>The player's order is permanently and silently gone.</b>
    /// <c>MECHANICS</c> §13.25 b3′ carries it as a named residual.</para>
    ///
    /// <para><b>THE JUSTIFICATION THAT DOES HOLD</b>, and it is the only one claimed now: these two
    /// are <b>per-worker transients</b>. What killed the job — she was displaced, the stack changed
    /// hands — is a fact about a MOMENT and about a PAWN, not a standing property of the machine, so
    /// there is no world question for a render to re-ask. Under the live-re-ask discipline that
    /// governs this whole channel, no honest badge is available; a latched sentence would be the one
    /// thing the discipline exists to refuse. <see cref="NoRouteToConsumable"/> is filed for a
    /// different reason again — the question is real and standing, but its declaration is private
    /// and per-worker-position, so the host cannot ask it without becoming a second authority.</para>
    /// </summary>
    public enum JobDropReason : byte
    {
        /// <summary>The machine has no walkable+survivable neighbour any more — walled in, or the
        /// tile beside it stopped being floor, DURING the job.</summary>
        NoWorksiteTile = 0,
        /// <summary>She is not where the job left her, or carries a path this system never set:
        /// external interference, restarted from ground truth on a later pass.</summary>
        Displaced = 1,
        /// <summary>The stack in her hands is gone from the item store, or is no longer hers.</summary>
        CargoLost = 2,
        /// <summary>⭐ <b>D5's arm.</b> The pathfinder says there is no route from where she is to
        /// the machine's staging tile.</summary>
        NoRouteToWorksite = 3,
        /// <summary>There is a consumable to fetch and no route from where she is to it.</summary>
        NoRouteToConsumable = 4,
        /// <summary>Nothing aboard to repair it with, and the machine is below
        /// <c>wear.wreck_threshold</c>, so there is no free jury-rig either.</summary>
        NoConsumable = 5,
    }

    /// <summary>
    /// ⭐⭐ <b>D5 FOLLOW-ON (2026-08-03) — THE ORDER THE PLAYER GAVE HAS JUST DIED, AND THIS SAYS
    /// WHY.</b> Published by <c>MaintenanceSystem.Abandon</c> — the ONE funnel every one of
    /// <c>DriveWorker</c>'s nine abandon arms goes through — on the tick the job is let go.
    ///
    /// <para><b>THE DEFECT IT CLOSES</b> (<c>MECHANICS</c> §13.25 b3). The issue-time half of D5 is
    /// surfaced by re-asking a live predicate about a PENDING order record; but that record is
    /// retired the moment the sim takes the order, so an order given while the route is OPEN whose
    /// route closes mid-job died at <c>MachineWearSystem.cs:464</c> with <b>nothing on any
    /// surface</b> — driven on the shipped wreck: taken tick 1, door shut tick 41, dropped tick 171,
    /// <c>blocked</c> channel <c>cells:[]</c>. Structural rather than a missing predicate: once the
    /// host's record is retired there is nothing left for a render to re-ask about. This event is
    /// the thing that hands the question back.</para>
    ///
    /// <para>⛔ <b>ORDERS ONLY, AND THAT IS A SCOPE DECISION WITH A COST ARGUMENT.</b> It is
    /// published only when the abandoned job was <see cref="Citizen.HeldByOrder"/> — the hold IS the
    /// order (§2.2, M2-19). The dispatcher's own abandons are ORDINARY: the standing rule refuses,
    /// backs off and re-recruits thousands of times a day (M1-H's backoff funnel exists because of
    /// exactly that thrash), and publishing them would put an unbounded per-tick stream on a bus
    /// whose only reader wants the rare case. The badge this feeds is player-ordered-machines-only
    /// anyway (<c>WireFormat.ReasonNoRoute</c>'s scope paragraph), so a wider event would be
    /// unreadable payload. ⚠️ It also means <b>the reader may assume the subject is an order</b> —
    /// there is no "was this an order" flag on the event because there is no other kind.</para>
    ///
    /// <para>⚠️ <b>THE READ OF <see cref="Citizen.HeldByOrder"/> HAPPENS BEFORE THE JOB IS CLEARED,
    /// AND THAT ORDERING IS LOAD-BEARING.</b> <c>Citizen.JobKind</c>'s setter releases the hold, so
    /// a publish written after <c>AbandonOrphan</c> would see <c>false</c> every single time and the
    /// channel would be permanently empty — a mute event that every test asserting "no row" would
    /// happily agree with.</para>
    ///
    /// <para>TRANSIENT, like every other channel on this bus: not saved, not folded into
    /// <c>Simulation.StateHash</c>, no def field, no <c>IStatefulSystem</c> checksum. ⛔ That is not
    /// decoration — the chronicle-signal lane's save/restore regression (CLAUDE.md's pin block) was
    /// a transient event folded into a hashed, never-evicted field, and the whole point of the shape
    /// chosen here is that a re-published event on reload can change nothing.</para>
    ///
    /// <para>Mirrors <see cref="CitizenThawedEvent"/>'s shape — a position plus the two entity ids,
    /// no strings. <see cref="Pos"/> is the DEVICE's tile (the tile the player clicked and the tile
    /// a badge is drawn on), never the tile she was standing on when it died.</para>
    /// </summary>
    public struct OrderDroppedEvent : ISimEvent
    {
        /// <summary>The ordered machine's tile — the badge's site.</summary>
        public Int3 Pos;
        /// <summary>The machine the order named.</summary>
        public uint DeviceId;
        /// <summary>The crew member who was carrying it; still in the store when readers run.</summary>
        public uint CitizenId;
        /// <summary><see cref="JobDropReason"/> as a byte (append-only contract).</summary>
        public byte Reason;
    }
}
