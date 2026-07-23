namespace Perilune.Sim
{
    /// <summary>Open/close/lock/unlock a door (from UI, MOSS, or LLM effects).</summary>
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

    /// <summary>Toggle a vent/scrubber-style device or set its rate.</summary>
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
            if (!sim.Devices.TryGet(_deviceId, out var device)) return;
            if (_open.HasValue) device.IsOpen = _open.Value;
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
            if (sim.Paths.FindPath(sim, citizen.Pos, _target, citizen.Path))
                citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
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

        public void Execute(Simulation sim) => sim.SetScript(_terminalId, _source);
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
            sim.JobsDirty |= JobBoardDirty.Tiles; // a stockpile zone is a tile-board change
            sim.Events.Publish(new TileChangedEvent { Pos = _pos });
        }
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

        public DesignateBuildCommand(Int3 pos, BuildKind kind, bool on = true)
        {
            _pos = pos; _kind = kind; _on = on;
        }

        public void Execute(Simulation sim)
        {
            foreach (var s in sim.Systems)
                if (s is BuildSystem b)
                {
                    if (_on) b.Designate(sim, _pos, _kind);
                    else b.Cancel(sim, _pos);
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
    /// </summary>
    public sealed class PlaceDeviceCommand : ISimCommand
    {
        private readonly DeviceKind _kind;
        private readonly Int3 _pos;

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
            // Deterministic name (kind + tile) — no counters, no RNG; InvariantCulture ints.
            string name = System.FormattableString.Invariant(
                $"{_kind.ToString().ToLowerInvariant()}_{_pos.X}_{_pos.Y}_{_pos.Z}");
            sim.AddDevice(_kind, _pos, name); // marks rooms + power dirty
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
