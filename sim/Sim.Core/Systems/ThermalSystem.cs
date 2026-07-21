using System;

namespace Perilune.Sim
{
    /// <summary>
    /// Lumped per-room heat simulation at 2 Hz — the cascade backbone
    /// (SIMULATION_ARCHITECTURE: machines heat rooms, radiators reject to space,
    /// the hull leaks heat, and out-of-band temperatures hurt citizens via
    /// NeedsSystem's thermal-danger band and will drive machine wear).
    ///
    /// Model: each room is one thermal node with heat capacity
    /// TileCount × Thermal.HeatCapacityJPerKPerTile. Every pass, joules are
    /// accumulated per room into a scratch buffer — all reads see start-of-pass
    /// temperatures, so within-pass ordering can never bias flow direction — then
    /// applied once: dT = J / capacity, clamped to [3, 500] K.
    ///
    /// Sources: device waste heat (MachineDefs.HeatKW), citizen body heat.
    /// Sinks: radiators (never below the 10 °C floor), door-edge conduction
    /// (hot → cold; closed doors conduct 5× slower), hull loss to the 3 K space
    /// sink. Room 0 (vacuum) is never heated or cooled.
    ///
    /// Consequences by design: an unpowered, radiator-less room drifts toward the
    /// 3 K sink over days (τ = 53 kJ/K ÷ 0.09 W/K ≈ 164 h) — derelict sections
    /// freeze; a room whose machines outrun its radiators cooks.
    /// </summary>
    public sealed class ThermalSystem : ISimSystem
    {
        public string Name => "Thermal";
        public int IntervalTicks => 5; // 2 Hz

        /// <summary>Seconds per thermal pass (IntervalTicks / Simulation.TicksPerSecond).
        /// Structural (interval-paired) — excluded from the tuning graph by design.</summary>
        public const double Dt = 0.5;

        // All heat scalars now live in sim.Defs.Thermal (SimDefs.Default reproduces the
        // former consts: HeatCapacityJPerKPerTile 53000, CitizenHeatW 100, RadiatorFloorK
        // 283.15, DoorConductOpen/Closed 40/8, HullLossWPerKelvinPerTile 0.09, SpaceSinkK
        // 3, Min/MaxTemperatureK 3/500). Tick reads them each pass; nothing here caches
        // the graph so parallel sims with different defs never cross-talk.

        /// <summary>Total heat capacity of a room, J/K.</summary>
        private static double Capacity(Room room, double heatCapacityJPerKPerTile)
            => room.TileCount * heatCapacityJPerKPerTile;

        // Per-room joule accumulator, index = room id. Grown geometrically, cleared
        // per pass — zero steady-state allocation.
        private double[] _deltaJ = new double[16];

        public void Tick(Simulation sim)
        {
            sim.Rooms.RecomputeIfDirty(sim);
            var rooms = sim.Rooms.Rooms;
            var world = sim.World;
            var th = sim.Defs.Thermal;
            var machines = sim.Defs.Machines;

            if (_deltaJ.Length < rooms.Count)
            {
                int grown = _deltaJ.Length;
                while (grown < rooms.Count) grown *= 2;
                _deltaJ = new double[grown];
            }
            Array.Clear(_deltaJ, 0, rooms.Count);

            // 1. Devices — waste heat, radiators, door conduction. One pass in
            // deterministic store order.
            var devices = sim.Devices.Items;
            for (int d = 0; d < devices.Count; d++)
            {
                var device = devices[d];

                if (device.Kind == DeviceKind.Door)
                {
                    // Doors are conduction edges, not heat sources: a door tile
                    // carries DoorMarker (belongs to no room), so the door's own
                    // HeatKW is dropped by design.
                    ConductAcrossDoor(sim, device);
                    continue;
                }

                if (!device.Powered || !device.IsOperational(sim.Defs)) continue;

                ushort roomId = sim.Rooms.RoomIdAt(world, device.Pos);
                if (roomId == 0 || roomId == RoomState.DoorMarker || roomId >= rooms.Count) continue;

                if (device.Kind == DeviceKind.Radiator)
                {
                    // Reject up to RadiatorRejectKW (condition-scaled), but never
                    // pull the room below the 10 °C floor. The cap reads the
                    // start-of-pass temperature: several radiators in one room can
                    // jointly undershoot the floor by a few mK for one pass — the
                    // next pass they idle and sources recover it. Simplification, fine.
                    var room = rooms[roomId];
                    double excessJ = (room.TemperatureK - th.RadiatorFloorK) * Capacity(room, th.HeatCapacityJPerKPerTile);
                    if (excessJ <= 0) continue;
                    double rejectJ = sim.Defs.RadiatorRejectKW * device.EffectiveRate * 1000.0 * Dt;
                    _deltaJ[roomId] -= Math.Min(rejectJ, excessJ);
                    continue;
                }

                // "Operating" v0: vents emit heat only while open (mirrors their
                // power draw); every other kind with HeatKW > 0 emits whenever
                // powered and operational — crafting/hydro don't expose a
                // per-machine is-running flag yet, so no duty cycle. Documented
                // simplification; revisit when machines get run-state.
                if (device.Kind == DeviceKind.AirVent && !device.IsOpen) continue;
                float heatKW = machines[(int)device.Kind].HeatKW;
                if (heatKW > 0f) _deltaJ[roomId] += heatKW * 1000.0 * Dt;
            }

            // 2. Citizens — body heat into their room.
            var citizens = sim.Citizens.Items;
            for (int c = 0; c < citizens.Count; c++)
            {
                if (citizens[c].Dead) continue;
                ushort roomId = sim.Rooms.RoomIdAt(world, citizens[c].Pos);
                if (roomId == 0 || roomId == RoomState.DoorMarker || roomId >= rooms.Count) continue;
                _deltaJ[roomId] += th.CitizenHeatW * Dt;
            }

            // 3. Hull loss to space, then apply the accumulated joules.
            // Room 0 (vacuum) holds no heat and is skipped throughout.
            for (int i = 1; i < rooms.Count; i++)
            {
                var room = rooms[i];
                double cap = Capacity(room, th.HeatCapacityJPerKPerTile);
                if (cap <= 0) continue;

                if (room.TemperatureK > th.SpaceSinkK)
                    _deltaJ[i] -= th.HullLossWPerKelvinPerTile * room.HullTiles
                                  * (room.TemperatureK - th.SpaceSinkK) * Dt;

                double t = room.TemperatureK + _deltaJ[i] / cap;
                if (t < th.MinTemperatureK) t = th.MinTemperatureK;
                else if (t > th.MaxTemperatureK) t = th.MaxTemperatureK;
                room.TemperatureK = t;
            }
        }

        /// <summary>
        /// Heat conduction across a door edge (same neighbor scan as
        /// AtmosphereSystem.FlowAcrossDoor). Conduction is passive: closed and
        /// unpowered doors still conduct, just slower. A door edge onto vacuum
        /// (room 0 / out of bounds) leaks one-sidedly to the 3 K space sink —
        /// the vacuum side is never mutated.
        /// </summary>
        private void ConductAcrossDoor(Simulation sim, Device door)
        {
            var world = sim.World;
            var level = world.Levels[door.Pos.Z];
            var rooms = sim.Rooms.Rooms;
            var th = sim.Defs.Thermal;

            // Find the two distinct room ids among the door's 4 neighbors.
            ushort a = RoomState.DoorMarker, b = RoomState.DoorMarker;
            for (int n = 0; n < 4; n++)
            {
                var p = Int3.Neighbor4(door.Pos, n);
                ushort id;
                if (!world.InBounds(p)) id = 0; // out of bounds = vacuum
                else
                {
                    int pi = level.Index(p.X, p.Y);
                    if ((level.Flags[pi] & (byte)TileFlags.BlocksGas) != 0) continue;
                    id = level.RoomId[pi];
                    if (id == RoomState.DoorMarker) continue; // adjacent door tile
                    if (id >= rooms.Count) id = 0; // stale id: treat as vacuum, like RoomAt
                }
                if (a == RoomState.DoorMarker) a = id;
                else if (id != a) { b = id; break; }
            }
            if (a == RoomState.DoorMarker || b == RoomState.DoorMarker || a == b) return;

            double ta = a == 0 ? th.SpaceSinkK : rooms[a].TemperatureK;
            double tb = b == 0 ? th.SpaceSinkK : rooms[b].TemperatureK;
            double conductWPerK = door.IsOpen ? th.DoorConductOpenWPerK : th.DoorConductClosedWPerK;
            double j = conductWPerK * (ta - tb) * Dt; // signed: positive flows a → b
            if (a != 0) _deltaJ[a] -= j;
            if (b != 0) _deltaJ[b] += j;
        }
    }
}
