using Perilune.Sim;
using Rect = Perilune.Gen.BandPlanner.Rect;

namespace Perilune.Gen
{
    /// <summary>
    /// Places each room type's working devices by rule inside its planned rect —
    /// the equipment half of the ship designer (RoomDresser adds furniture after).
    /// Rules mirror how the rooms were laid out by hand before the planner:
    /// lights at the room center, air machinery in corners, water hardware on the
    /// room's service row with the pipe run directly beneath it (tanks/reclaimers
    /// join the network by adjacency). Device NAMES are pinned parameters — they
    /// are MOSS vocabulary (vent_hydro, term_hydro, …) and must survive replans.
    /// </summary>
    public static class RoomOutfitter
    {
        public static void Light(ShipPlan plan, Rect r, int z, string name) =>
            Dev(plan, DeviceKind.Light, r.CenterX, r.CenterY, z, name);

        public static void Reactor(ShipPlan plan, Rect r, int z)
        {
            Dev(plan, DeviceKind.SolarWing, r.X0 + 1, r.Y0 + 1, z, "reactor_feed_a");
            Dev(plan, DeviceKind.SolarWing, r.X0 + 3, r.Y0 + 1, z, "reactor_feed_b");
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.Battery, Pos = new Int3(r.X1 - 2, r.Y0 + 1, z), Name = "battery_1", StoredKWh = 25f });
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.Battery, Pos = new Int3(r.X1, r.Y0 + 1, z), Name = "battery_2", StoredKWh = 10f });
            Light(plan, r, z, "light_reactor");
        }

        public static void Engineering(ShipPlan plan, Rect r, int z)
        {
            Dev(plan, DeviceKind.SalvageRecycler, r.X0 + 1, r.Y0 + 1, z, "recycler_1");
            Dev(plan, DeviceKind.MachineShop, r.X0 + 4, r.Y0 + 1, z, "machineshop_1");
            Dev(plan, DeviceKind.Radiator, r.X1, r.Y0 + 1, z, "radiator_eng");
            Light(plan, r, z, "light_eng");
        }

        public static void Fabrication(ShipPlan plan, Rect r, int z)
        {
            Dev(plan, DeviceKind.Fabricator, r.X0 + 1, r.Y0 + 1, z, "fabricator_1");
            Light(plan, r, z, "light_fab");
        }

        public static void Mess(ShipPlan plan, Rect r, int z)
        {
            Dev(plan, DeviceKind.Scrubber, r.X0 + 1, r.Y0 + 1, z, "scrubber_mess");
            Light(plan, r, z, "light_mess");
        }

        /// <summary>Life-support water loop: the potable reserve stays OFF the
        /// irrigation loop (institutional lesson — grow beds would drain a shared
        /// network dry in hours).</summary>
        public static void LifeSupport(ShipPlan plan, Rect r, int z)
        {
            Dev(plan, DeviceKind.Scrubber, r.X0 + 1, r.Y0 + 1, z, "scrubber_ls");
            Vent(plan, r.X0 + 3, r.Y0 + 1, z, "vent_ls");
            Dev(plan, DeviceKind.Radiator, r.X1, r.Y1, z, "radiator_ls");
            for (int x = r.X0 + 1; x <= r.X1 - 1; x++)
                Dev(plan, DeviceKind.Pipe, x, r.CenterY + 1, z, $"pipe_l{x}");
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.WaterTank, Pos = new Int3(r.CenterX - 1, r.CenterY, z), Name = "tank_main", StoredLiters = 400f });
            Dev(plan, DeviceKind.Reclaimer, r.CenterX + 1, r.CenterY, z, "reclaimer_main");
            Dev(plan, DeviceKind.Light, r.CenterX, r.Y1, z, "light_ls"); // service row is full; lamp on the aisle
        }

        /// <summary>The grow bay is a ~2.7 kW furnace — it gets its own radiator,
        /// its own tank, and the terminal that hosts the found life-support watch.</summary>
        public static void Hydro(ShipPlan plan, Rect r, int z)
        {
            int growY = r.Y0 + 2;
            Dev(plan, DeviceKind.GrowBed, r.X0 + 1, growY, z, "growbed_1");
            Dev(plan, DeviceKind.GrowBed, r.X0 + 3, growY, z, "growbed_2");
            Dev(plan, DeviceKind.GrowBed, r.X0 + 5, growY, z, "growbed_3");
            for (int x = r.X0 + 1; x <= r.X1 - 1; x++)
                Dev(plan, DeviceKind.Pipe, x, growY + 1, z, $"pipe_h{x}");
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.WaterTank, Pos = new Int3(r.X1 - 3, growY, z), Name = "tank_hydro", StoredLiters = 150f });
            Dev(plan, DeviceKind.Reclaimer, r.X1 - 1, growY, z, "reclaimer_hydro");
            Dev(plan, DeviceKind.Scrubber, r.X1 - 1, r.Y0 + 1, z, "scrubber_hydro");
            Vent(plan, r.X0 + 1, r.Y1, z, "vent_hydro");
            Dev(plan, DeviceKind.Radiator, r.X1 - 1, r.Y1, z, "radiator_hydro");
            Dev(plan, DeviceKind.Terminal, r.CenterX + 2, r.Y1, z, "term_hydro");
            Dev(plan, DeviceKind.Light, r.CenterX, r.Y0 + 1, z, "light_hydro");
        }

        private static void Dev(ShipPlan plan, DeviceKind kind, int x, int y, int z, string name) =>
            plan.Devices.Add(new DeviceSpec { Kind = kind, Pos = new Int3(x, y, z), Name = name });

        private static void Vent(ShipPlan plan, int x, int y, int z, string name) =>
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(x, y, z), Name = name, IsOpen = false });
    }
}
