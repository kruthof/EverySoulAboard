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
}
