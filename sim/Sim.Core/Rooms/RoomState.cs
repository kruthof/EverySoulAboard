using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// One lumped atmosphere node. Room 0 is the vacuum sink (moles pinned to zero).
    /// Pressure follows P = nRT/V with V = tiles × 2.5 m³.
    ///
    /// The mole counts and temperature are the canonical state (saved in the ROOM
    /// chapter, folded into <see cref="Simulation.StateHash"/>); every property below
    /// is derived on read and stores nothing. <see cref="AtmosphereSystem"/> owns the
    /// gas fields, ThermalSystem owns <see cref="TemperatureK"/>, and RoomState
    /// rebuilds the whole list (carrying gas and heat across by tile overlap) whenever
    /// topology changes.
    /// </summary>
    public sealed class Room
    {
        public int TileCount;
        public double O2Moles;   // mol
        public double CO2Moles;  // mol
        public double N2Moles;   // mol
        public double TemperatureK = 293.0; // K; 293 K = 20 °C is the fresh-room default

        /// <summary>
        /// Tiles of this room in thermal contact with the hull (bordering the map
        /// edge, open void, or a wall backed by void/more wall — as opposed to a
        /// single partition wall with another room behind it). ThermalSystem's
        /// space loss scales with this, so interior rooms are insulated by their
        /// neighbors while hull-hugging rooms run cold. Derived on room recompute;
        /// never saved or hashed (pure function of the tile grid).
        /// </summary>
        public int HullTiles;

        /// <summary>m³ at a fixed 2.5 m³ per floor tile — the sim's only statement of
        /// physical ship scale, and the divisor in every pressure reading.</summary>
        public double VolumeM3 => TileCount * 2.5;
        public double TotalMoles => O2Moles + CO2Moles + N2Moles;

        /// <summary>kPa, from the ideal gas law (8.314 J/(mol·K), /1000 for Pa→kPa).
        /// Because T is a factor, a room's pressure moves when ThermalSystem heats or
        /// cools it with no gas going anywhere. Zero-volume rooms read 0 rather than
        /// dividing by zero.</summary>
        public double PressureKPa
        {
            get
            {
                double v = VolumeM3;
                return v <= 0 ? 0 : TotalMoles * 8.314 * TemperatureK / v / 1000.0;
            }
        }

        /// <summary>0..1 mole fraction. Multiply by <see cref="PressureKPa"/> for the
        /// partial pressure NeedsSystem's hypoxia thresholds actually test — a room can
        /// be 21% O2 and still suffocate you if it is at 8 kPa.</summary>
        public double O2Fraction => TotalMoles <= 0 ? 0 : O2Moles / TotalMoles;

        /// <summary>
        /// CO2 as parts per million by mole. READ-ONLY EVERYWHERE, AND A DAMAGE INPUT
        /// ONLY — no system, job, effect or Director lever ever acts on this value. The
        /// complete consumer list is: <c>NeedsSystem.Tick</c> (health damage from
        /// needs.def `co2_narcosis_ppm`, and at 2× that the vacuum-rate band), the CO2
        /// lens ramp (Sim.Glyph <c>LensRamps.Co2</c>, green/amber/red at 1,000 and
        /// 2,000 ppm), <c>ShipMetrics.Co2Ppm</c> (worst pressurized room, for the HUD
        /// and wire), and the MOSS read-only properties <c>room.co2</c> / <c>ship.co2</c>.
        ///
        /// Nothing closes the loop: scrubbers run unconditionally while powered, and a
        /// citizen will stand in lethal CO2 without ever deciding to leave. Player MOSS
        /// can raise an alarm on it — the shipped hydroponics program does — and an
        /// alarm is a log line, not a response.
        /// </summary>
        public double CO2Ppm => TotalMoles <= 0 ? 0 : CO2Moles / TotalMoles * 1_000_000.0;
    }

    /// <summary>
    /// Maintains room assignment (ZLevel.RoomId) and the room list. Rooms are recomputed
    /// on demand when topology changed (walls/doors/floors edited). Door tiles are flow
    /// edges, not room members — they get <see cref="DoorMarker"/>. Regions touching void
    /// become part of room 0 (vacuum). Gas is remapped by tile overlap on recompute.
    /// </summary>
    public sealed class RoomState
    {
        public const ushort DoorMarker = ushort.MaxValue;

        /// <summary>Standard breathable baseline, kPa. This const is the SETUP-time fill
        /// baseline used by <see cref="Pressurize"/> — a static, sim-less utility called
        /// from ~15 sites (ShipPlanBuilder, ScenarioRunner, tests) with no SimDefs in
        /// scope, so it is NOT cleanly threadable (B4: documented and left). The RUNTIME
        /// vent target reads <c>sim.Defs.Atmosphere.NominalPressureKPa</c> (which
        /// SimDefs.CreateDefault mirrors from this const); both hold 101.3 by default, so a
        /// designer retuning atmosphere.def moves the vent's top-up ceiling while the
        /// one-time compiled fill baseline stays here.</summary>
        public const double NominalPressureKPa = 101.3;

        public readonly List<Room> Rooms = new List<Room>(); // index = room id; [0] = vacuum
        public bool Dirty { get; private set; } = true;

        /// <summary>
        /// Named room anchors — sim state (saved), the MOSS namespace source
        /// (`hab1.o2`). An anchor names whatever room contains its probe tile, so it
        /// survives recomputes; merges resolve to the merged room by construction.
        /// </summary>
        public readonly List<RoomAnchor> Anchors = new List<RoomAnchor>();

        public void SetAnchor(string name, Int3 probe) => SetAnchor(name, probe, RoomType.None);

        public void SetAnchor(string name, Int3 probe, RoomType type)
        {
            for (int i = 0; i < Anchors.Count; i++)
            {
                if (Anchors[i].Name != name) continue;
                Anchors[i] = new RoomAnchor(name, probe, type);
                return;
            }
            Anchors.Add(new RoomAnchor(name, probe, type));
        }

        private readonly Queue<Int3> _floodQueue = new Queue<Int3>(256);
        private readonly List<int> _regionTiles = new List<int>(1024); // packed (z,y,x) indices of current region
        private ushort[][] _oldRoomIds; // per level, previous assignment for gas remapping

        public void MarkDirty() => Dirty = true;

        public Room RoomAt(World world, Int3 p)
        {
            ushort id = world.Levels[p.Z].RoomId[world.Levels[p.Z].Index(p.X, p.Y)];
            if (id == DoorMarker || id >= Rooms.Count) return Rooms[0];
            return Rooms[id];
        }

        public ushort RoomIdAt(World world, Int3 p) =>
            world.Levels[p.Z].RoomId[world.Levels[p.Z].Index(p.X, p.Y)];

        /// <summary>Fill a room with a standard breathable mix at nominal pressure.</summary>
        public static void Pressurize(Room room)
        {
            double totalMoles = NominalPressureKPa * 1000.0 * room.VolumeM3 / (8.314 * room.TemperatureK);
            room.O2Moles = totalMoles * 0.21;
            room.N2Moles = totalMoles * 0.79;
            room.CO2Moles = totalMoles * 0.0005; // ~500 ppm baseline
        }

        public void RecomputeIfDirty(Simulation sim)
        {
            if (!Dirty) return;
            Dirty = false;
            Recompute(sim);
            sim.Events.Publish(new RoomsChangedEvent { RoomCount = Rooms.Count });
        }

        private void Recompute(Simulation sim)
        {
            World world = sim.World;

            // Snapshot old assignment + old rooms for gas remapping.
            var oldRooms = new List<Room>(Rooms);
            if (_oldRoomIds == null || _oldRoomIds.Length != world.Depth)
                _oldRoomIds = new ushort[world.Depth][];
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                if (_oldRoomIds[z] == null || _oldRoomIds[z].Length != level.RoomId.Length)
                    _oldRoomIds[z] = new ushort[level.RoomId.Length];
                Array.Copy(level.RoomId, _oldRoomIds[z], level.RoomId.Length);
                Array.Clear(level.RoomId, 0, level.RoomId.Length);
            }

            Rooms.Clear();
            Rooms.Add(new Room()); // room 0 = vacuum; moles stay zero

            // Flood fill in deterministic scan order. Regions touching void join room 0.
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                for (int y = 0; y < world.Height; y++)
                {
                    for (int x = 0; x < world.Width; x++)
                    {
                        int i = level.Index(x, y);
                        if (level.RoomId[i] != 0) continue; // already assigned this pass
                        if (!IsRoomTile(sim, level, x, y, z, i)) continue;

                        bool touchesVacuum = FloodRegion(sim, new Int3(x, y, z));
                        ushort newId;
                        if (touchesVacuum)
                        {
                            newId = VacuumVisited; // converted to 0 in the final sweep; must stay non-zero so the scan skips it
                            Rooms[0].TileCount += _regionTiles.Count;
                        }
                        else
                        {
                            newId = (ushort)Rooms.Count;
                            var room = new Room
                            {
                                TileCount = _regionTiles.Count,
                                HullTiles = CountHullTiles(level, _regionTiles),
                            };
                            RemapGas(world, oldRooms, room, z);
                            Rooms.Add(room);
                        }
                        for (int t = 0; t < _regionTiles.Count; t++)
                            level.RoomId[_regionTiles[t]] = newId;
                        _regionTiles.Clear();
                    }
                }
            }

            // Final sweep: vacuum-visited tiles become room 0.
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                for (int i = 0; i < level.RoomId.Length; i++)
                    if (level.RoomId[i] == VacuumVisited)
                        level.RoomId[i] = 0;
            }

            // Door tiles get the marker.
            var devices = sim.Devices.Items;
            for (int d = 0; d < devices.Count; d++)
            {
                var device = devices[d];
                if (device.Kind != DeviceKind.Door) continue;
                var level = world.Levels[device.Pos.Z];
                level.RoomId[level.Index(device.Pos.X, device.Pos.Y)] = DoorMarker;
            }
        }

        private const ushort VacuumVisited = ushort.MaxValue - 2;

        /// <summary>Count region tiles with at least one hull contact (see Room.HullTiles).</summary>
        private static int CountHullTiles(ZLevel level, List<int> regionTiles)
        {
            int hull = 0;
            for (int t = 0; t < regionTiles.Count; t++)
            {
                int idx = regionTiles[t];
                if (HasHullContact(level, idx % level.Width, idx / level.Width)) hull++;
            }
            return hull;
        }

        private static bool HasHullContact(ZLevel level, int x, int y)
        {
            for (int d = 0; d < 4; d++)
            {
                int dx = d == 0 ? 1 : d == 1 ? -1 : 0;
                int dy = d == 2 ? 1 : d == 3 ? -1 : 0;
                int nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= level.Width || ny >= level.Height) return true; // map edge = space
                int ni = level.Index(nx, ny);
                if (level.Floor[ni] == TileDefs.Void) return true; // open void
                if (level.Wall[ni] != 0)
                {
                    // A wall is hull if there is void/map-edge/more wall behind it;
                    // a single partition wall with another room behind insulates.
                    int bx = nx + dx, by = ny + dy;
                    if (bx < 0 || by < 0 || bx >= level.Width || by >= level.Height) return true;
                    int bi = level.Index(bx, by);
                    if (level.Floor[bi] == TileDefs.Void || level.Wall[bi] != 0) return true;
                }
            }
            return false;
        }

        // A tile can belong to a room: has a non-void floor, doesn't block gas, isn't a door tile.
        private static bool IsRoomTile(Simulation sim, ZLevel level, int x, int y, int z, int i)
        {
            if (level.Floor[i] == TileDefs.Void) return false;
            if ((level.Flags[i] & (byte)TileFlags.BlocksGas) != 0) return false;
            if (sim.TryGetDeviceAt(new Int3(x, y, z), out var device) && device.Kind == DeviceKind.Door) return false;
            return true;
        }

        /// <summary>BFS one region into _regionTiles; returns true if it touches void (vacuum-connected).</summary>
        private bool FloodRegion(Simulation sim, Int3 start)
        {
            World world = sim.World;
            var level = world.Levels[start.Z];
            bool touchesVacuum = false;

            _floodQueue.Clear();
            _floodQueue.Enqueue(start);
            level.RoomId[level.Index(start.X, start.Y)] = ushort.MaxValue - 1; // temp visited mark
            _regionTiles.Add(level.Index(start.X, start.Y));

            while (_floodQueue.Count > 0)
            {
                var p = _floodQueue.Dequeue();
                Span<Int3> neighbors = stackalloc Int3[4]
                {
                    new Int3(p.X + 1, p.Y, p.Z), new Int3(p.X - 1, p.Y, p.Z),
                    new Int3(p.X, p.Y + 1, p.Z), new Int3(p.X, p.Y - 1, p.Z),
                };
                foreach (var n in neighbors)
                {
                    if (!world.InBounds(n)) { touchesVacuum = true; continue; }
                    int ni = level.Index(n.X, n.Y);
                    if (level.Floor[ni] == TileDefs.Void)
                    {
                        // Open connection to void (no wall between: walls are their own tiles here).
                        touchesVacuum = true;
                        continue;
                    }
                    if ((level.Flags[ni] & (byte)TileFlags.BlocksGas) != 0) continue;
                    if (level.RoomId[ni] == ushort.MaxValue - 1) continue; // visited
                    if (sim.TryGetDeviceAt(n, out var device) && device.Kind == DeviceKind.Door) continue;
                    level.RoomId[ni] = ushort.MaxValue - 1;
                    _regionTiles.Add(ni);
                    _floodQueue.Enqueue(n);
                }
            }

            return touchesVacuum;
        }

        /// <summary>
        /// Carry gas AND thermal state from old rooms into a new room, share = overlap
        /// tiles / old room size. Without the temperature remap, any topology edit
        /// snapped every affected room back to 20 °C — un-freezing derelict sections
        /// the moment the player placed one device (thermal review finding).
        /// </summary>
        private void RemapGas(World world, List<Room> oldRooms, Room newRoom, int z)
        {
            if (oldRooms.Count == 0 || _oldRoomIds == null) return;
            var oldIds = _oldRoomIds[z];
            double tempWeighted = 0.0, shareSum = 0.0;
            for (int t = 0; t < _regionTiles.Count; t++)
            {
                ushort oldId = oldIds[_regionTiles[t]];
                if (oldId == 0 || oldId == DoorMarker || oldId >= oldRooms.Count) continue;
                var oldRoom = oldRooms[oldId];
                if (oldRoom.TileCount <= 0) continue;
                double share = 1.0 / oldRoom.TileCount;
                newRoom.O2Moles += oldRoom.O2Moles * share;
                newRoom.CO2Moles += oldRoom.CO2Moles * share;
                newRoom.N2Moles += oldRoom.N2Moles * share;
                tempWeighted += oldRoom.TemperatureK * share;
                shareSum += share;
            }
            if (shareSum > 0)
                newRoom.TemperatureK = tempWeighted / shareSum;
            // else: brand-new volume (freshly cleared debris) keeps the 293 K default —
            // acceptable v0; a rock-temperature model can refine later.
        }
    }

    public readonly struct RoomAnchor
    {
        public readonly string Name;
        public readonly Int3 Probe;
        public readonly RoomType Type; // saved ROOM v3; None on legacy saves

        public RoomAnchor(string name, Int3 probe) : this(name, probe, RoomType.None) { }

        public RoomAnchor(string name, Int3 probe, RoomType type)
        {
            Name = name;
            Probe = probe;
            Type = type;
        }
    }
}
