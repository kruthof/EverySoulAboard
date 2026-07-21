using System;

namespace Moonbase.Sim
{
    /// <summary>
    /// Lumped per-room gas simulation at 5 Hz (TDD §3.6). Flow happens only across
    /// open door edges; regions merged by wall removal equalize instantly via room
    /// recompute. Room 0 is an infinite vacuum sink. Citizens breathe; vents inject
    /// breathable mix; scrubbers remove CO2. Numbers per GDD §5.
    /// </summary>
    public sealed class AtmosphereSystem : ISimSystem
    {
        public string Name => "Atmosphere";
        public int IntervalTicks => 2;

        private const double Dt = 0.2;                    // seconds per atmosphere tick (structural, interval-paired)

        // FlowCoefficient / O2/CO2PerPersonPerSecond / Vent/ScrubberMolPerSecond and the
        // vent's NominalPressureKPa target now live in sim.Defs.Atmosphere (SimDefs.Default
        // reproduces the former consts: 0.5, 3.04e-4, 2.73e-4, 30, 0.001, 101.3). Tick reads
        // them each pass; nothing here caches the graph so parallel sims stay isolated.

        public void Tick(Simulation sim)
        {
            sim.Rooms.RecomputeIfDirty(sim);
            var rooms = sim.Rooms.Rooms;
            var world = sim.World;
            var atmo = sim.Defs.Atmosphere;

            // 1. Door-edge flow.
            var devices = sim.Devices.Items;
            for (int d = 0; d < devices.Count; d++)
            {
                var device = devices[d];
                switch (device.Kind)
                {
                    case DeviceKind.Door when device.IsOpen:
                        FlowAcrossDoor(sim, device.Pos, atmo);
                        break;

                    case DeviceKind.AirVent when device.IsOpen && device.Powered && device.IsOperational(sim.Defs):
                    {
                        var room = sim.Rooms.RoomAt(world, device.Pos);
                        if (room != rooms[0] && room.PressureKPa < atmo.NominalPressureKPa)
                        {
                            double moles = atmo.VentMolPerSecond * device.EffectiveRate * Dt;
                            room.O2Moles += moles * 0.21;
                            room.N2Moles += moles * 0.79;
                        }
                        break;
                    }

                    case DeviceKind.Scrubber when device.Powered && device.IsOperational(sim.Defs):
                    {
                        var room = sim.Rooms.RoomAt(world, device.Pos);
                        if (room != rooms[0])
                            room.CO2Moles = Math.Max(0, room.CO2Moles - atmo.ScrubberMolPerSecond * device.EffectiveRate * Dt);
                        break;
                    }
                }
            }

            // 2. Citizens breathe into their room.
            var citizens = sim.Citizens.Items;
            for (int c = 0; c < citizens.Count; c++)
            {
                if (citizens[c].Dead) continue;
                ushort roomId = sim.Rooms.RoomIdAt(world, citizens[c].Pos);
                if (roomId == 0 || roomId == RoomState.DoorMarker || roomId >= rooms.Count) continue;
                var room = rooms[roomId];
                double o2Take = Math.Min(room.O2Moles, atmo.O2PerPersonPerSecond * Dt);
                room.O2Moles -= o2Take;
                room.CO2Moles += atmo.CO2PerPersonPerSecond * Dt;
            }

            // 3. Vacuum room stays empty.
            rooms[0].O2Moles = 0; rooms[0].CO2Moles = 0; rooms[0].N2Moles = 0;
        }

        private static void FlowAcrossDoor(Simulation sim, Int3 doorPos, SimDefs.AtmosphereDefs atmo)
        {
            var world = sim.World;
            var level = world.Levels[doorPos.Z];
            var rooms = sim.Rooms.Rooms;

            // Find the two distinct room ids among the door's 4 neighbors.
            ushort a = RoomState.DoorMarker, b = RoomState.DoorMarker;
            Span<Int3> neighbors = stackalloc Int3[4]
            {
                new Int3(doorPos.X + 1, doorPos.Y, doorPos.Z), new Int3(doorPos.X - 1, doorPos.Y, doorPos.Z),
                new Int3(doorPos.X, doorPos.Y + 1, doorPos.Z), new Int3(doorPos.X, doorPos.Y - 1, doorPos.Z),
            };
            foreach (var n in neighbors)
            {
                ushort id;
                if (!world.InBounds(n)) id = 0; // out of bounds = vacuum
                else
                {
                    int ni = level.Index(n.X, n.Y);
                    if ((level.Flags[ni] & (byte)TileFlags.BlocksGas) != 0) continue;
                    id = level.RoomId[ni];
                    if (id == RoomState.DoorMarker) continue;
                    if (id == 0 && level.Floor[ni] != TileDefs.Void && id >= rooms.Count) continue;
                }
                if (a == RoomState.DoorMarker) a = id;
                else if (id != a) { b = id; break; }
            }
            if (a == RoomState.DoorMarker || b == RoomState.DoorMarker || a == b) return;

            var roomA = a < rooms.Count ? rooms[a] : rooms[0];
            var roomB = b < rooms.Count ? rooms[b] : rooms[0];
            double pa = roomA.PressureKPa, pb = roomB.PressureKPa;
            if (Math.Abs(pa - pb) < 1e-6) return;

            var (src, dst) = pa > pb ? (roomA, roomB) : (roomB, roomA);
            double dn = atmo.FlowCoefficient * Math.Abs(pa - pb) * Dt;
            double total = src.TotalMoles;
            if (total <= 0) return;
            dn = Math.Min(dn, total);

            double fO2 = src.O2Moles / total, fCO2 = src.CO2Moles / total, fN2 = src.N2Moles / total;
            src.O2Moles -= dn * fO2; src.CO2Moles -= dn * fCO2; src.N2Moles -= dn * fN2;
            bool dstIsVacuum = dst == rooms[0];
            if (!dstIsVacuum)
            {
                dst.O2Moles += dn * fO2; dst.CO2Moles += dn * fCO2; dst.N2Moles += dn * fN2;
            }
        }
    }
}
