using Moonbase.Sim;

namespace Moonbase.Gen
{
    /// <summary>
    /// Hand-authored ship plans. The MSV Perilune here is the shipping start map:
    /// a 64×20×2 top-down deck plan (x = length, y = beam, z = decks, z0 = lower).
    /// Rooms are carved out of solid hull mass on a GridCanvas — anything not
    /// carved is wall, so compartments cannot leak by omission. Device and anchor
    /// names are the stable MOSS vocabulary (vent_hydro, door_storage, hydro, …).
    /// </summary>
    public static class AuthoredShips
    {
        public const int Width = 64;
        public const int Height = 20;

        /// <summary>The life-support watch found on the hydroponics terminal.</summary>
        public const string DefaultProgram =
            "# life support watch -- found on the hydroponics terminal\n" +
            "every 2s:\n" +
            "  if hydro.pressure < 96kPa: open(vent_hydro)\n" +
            "  if hydro.pressure > 100kPa: close(vent_hydro)\n" +
            "\n" +
            "when lifesupport.pressure < 60kPa:\n" +
            "  close(door_storage)\n" +
            "  alarm(\"DECOMPRESSION - LIFE SUPPORT SEALED\")\n" +
            "\n" +
            "alarm when hydro.co2 > 2000ppm, \"CO2 HIGH - HYDROPONICS BAY\"\n";

        public static ShipPlan Perilune()
        {
            var plan = new ShipPlan { Name = "MSV Perilune", Seed = 20260718UL };

            // ---------------------------------------------------------- deck rasters
            //
            // Deck z0 (lower)                     Deck z1 (upper)
            //   port band:  reactor | engineering   port:  bridge(fore) | command | medbay
            //               | fabrication | storage         | cabin suite (4 cabins + hall)
            //   corridor y9-10                      corridor y9-10 (aft of the bridge)
            //   starboard band: mess | commons      starboard: hydroponics | observatory
            //               | workshop | lifesupport
            //   aft: debris-choked section behind door_aft (the dig objective)
            //
            // Rooms are carved by the BandPlanner at RoomProgramme sizes — each
            // compartment as big as its job, the rest stays solid hull mass (a
            // dense ship, not a row of hangars). Doors that DeviceLayout.json
            // hand-yaws (command/medbay/quarters/hydro) keep their pinned tiles.

            var z0 = new GridCanvas(Width, Height, '#');
            z0.FillRect(2, 9, 55, 10, '.');   // corridor spine
            z0.FillRect(57, 6, 62, 13, 'R');  // aft debris field (dig objective)
            z0.Set(56, 9, '.'); // aft lock onto the debris seam

            var z1 = new GridCanvas(Width, Height, '#');
            z1.FillRect(13, 9, 61, 10, '.');  // corridor spine (aft of the bridge)
            z1.FillRect(2, 4, 11, 15, '.');   // bridge (spans the bow; fiction keeps it grand)
            // Crew quarters suite: four 4×4 cabins off a private hall (a single
            // 20×7 "quarters" read as a hangar, not a place anyone sleeps).
            z1.FillRect(42, 6, 61, 7, '.');   // quarters hall (door_quarters at 50,8)
            z1.FillRect(42, 1, 45, 4, '.');   // cabin 1
            z1.FillRect(47, 1, 50, 4, '.');   // cabin 2
            z1.FillRect(52, 1, 55, 4, '.');   // cabin 3
            z1.FillRect(57, 1, 60, 4, '.');   // cabin 4
            z1.Set(44, 5, '.'); z1.Set(48, 5, '.'); z1.Set(53, 5, '.'); z1.Set(58, 5, '.'); // cabin doors
            z1.Set(12, 9, '.'); // door_bridge
            z1.Set(50, 8, '.'); // door_quarters

            // ------------------------------------------------- planned room bands
            var north0 = BandPlanner.Carve(z0, plan, 0, startX: 2, corridorWallY: 8, roomsAbove: true, new[]
            {
                new BandPlanner.Room { Anchor = "reactor", Type = RoomType.Reactor, DoorX = -1 },
                new BandPlanner.Room { Anchor = "engineering", Type = RoomType.Engineering, DoorX = -1, DoorName = "door_eng" },
                new BandPlanner.Room { Anchor = "fabrication", Type = RoomType.Fabrication, DoorX = -1, DoorName = "door_fab" },
                new BandPlanner.Room { Anchor = "storage", Type = RoomType.Storage, DoorX = -1 },
            });
            var south0 = BandPlanner.Carve(z0, plan, 0, startX: 2, corridorWallY: 11, roomsAbove: false, new[]
            {
                new BandPlanner.Room { Anchor = "mess", Type = RoomType.Mess, DoorX = -1 },
                new BandPlanner.Room { Anchor = "commons", Type = RoomType.Commons, DoorX = -1 },
                new BandPlanner.Room { Anchor = "workshop", Type = RoomType.Workshop, DoorX = -1 },
                new BandPlanner.Room { Anchor = "lifesupport", Type = RoomType.LifeSupport, DoorX = -1, DoorName = "door_ls" },
            });
            var north1 = BandPlanner.Carve(z1, plan, 1, startX: 13, corridorWallY: 8, roomsAbove: true, new[]
            {
                new BandPlanner.Room { Anchor = "command", Type = RoomType.Command, DoorX = 20 },
                new BandPlanner.Room { Anchor = "medbay", Type = RoomType.Medbay, DoorX = 34 },
            });
            var south1 = BandPlanner.Carve(z1, plan, 1, startX: 13, corridorWallY: 11, roomsAbove: false, new[]
            {
                new BandPlanner.Room { Anchor = "hydro", Type = RoomType.Hydro, DoorX = 22 },
                new BandPlanner.Room { Anchor = "observatory", Type = RoomType.Observatory, DoorX = 55, DoorName = "door_observatory", DoorClosed = true },
            });

            plan.DeckRows = new[] { z0.ToRows(), z1.ToRows() };

            // ---------------------------------------------------------------- doors
            // (band doors come from the planner). Interior doors start OPEN (a
            // lived-in ship; institutional finding: closed defaults once sealed the
            // crew away from all water). Sealed by fiction: door_bridge (vacuum
            // behind it), door_observatory (Reyes sealed himself in), door_aft.
            Door(plan, "door_bridge", 12, 9, 1, open: false);
            Door(plan, "door_quarters", 50, 8, 1, open: true);
            Door(plan, "door_cabin_1", 44, 5, 1, open: true);
            Door(plan, "door_cabin_2", 48, 5, 1, open: true);
            Door(plan, "door_cabin_3", 53, 5, 1, open: true);
            Door(plan, "door_cabin_4", 58, 5, 1, open: true);
            Door(plan, "door_aft", 56, 9, 0, open: false);

            // ------------------------------------------------------- ladder trunks
            // Trunk A x=18, trunk B x=46 (corridor tiles on both decks; the z0
            // device links the decks for pathing, the z1 twin is the visual top).
            Dev(plan, DeviceKind.Ladder, 18, 9, 0, "ladder_a_low");
            Dev(plan, DeviceKind.Ladder, 18, 9, 1, "ladder_a_up");
            Dev(plan, DeviceKind.Ladder, 46, 9, 0, "ladder_b_low");
            Dev(plan, DeviceKind.Ladder, 46, 9, 1, "ladder_b_up");

            // ---------------------------------------------------------------- power
            // Conduit service tray under every carved deck tile (overlay devices
            // share tiles freely); vertical adjacency turns every shared (x,y)
            // column into a riser — one ship-wide network fed from the reactor.
            AddConduits(plan, z0, 0);
            AddConduits(plan, z1, 1);

            // -------------------------------------------------- room outfitting
            // Each room's working devices land by RoomOutfitter rules inside its
            // planned rect; device names are pinned MOSS vocabulary. The water
            // loops stay deliberately separate (potable reserve off the
            // irrigation loop — grow beds would drain a shared network in hours).
            RoomOutfitter.Reactor(plan, north0["reactor"], 0);
            RoomOutfitter.Engineering(plan, north0["engineering"], 0);
            RoomOutfitter.Fabrication(plan, north0["fabrication"], 0);
            Dev(plan, DeviceKind.Light, north0["storage"].CenterX, north0["storage"].Y0, 0, "light_storage"); // stores row stays clear
            RoomOutfitter.Mess(plan, south0["mess"], 0);
            RoomOutfitter.Light(plan, south0["commons"], 0, "light_commons");
            RoomOutfitter.Light(plan, south0["workshop"], 0, "light_workshop");
            RoomOutfitter.LifeSupport(plan, south0["lifesupport"], 0);
            RoomOutfitter.Light(plan, north1["command"], 1, "light_command");
            RoomOutfitter.Light(plan, north1["medbay"], 1, "light_medbay");
            RoomOutfitter.Hydro(plan, south1["hydro"], 1);
            RoomOutfitter.Light(plan, south1["observatory"], 1, "light_obs");
            Dev(plan, DeviceKind.Light, 6, 9, 1, "light_bridge");
            Dev(plan, DeviceKind.Light, 51, 6, 1, "light_quarters"); // hall lamp; cabins stay dim+cozy
            // Upper-deck air recirculator pair, RUNNING at boot: the compact hull
            // holds far less passive air than the old hangar rooms, so the deck
            // needs its scrub→pressure-dip→fresh-mix cycle live from tick 0 (the
            // reason the crew is still breathing when the player arrives).
            Dev(plan, DeviceKind.Scrubber, 33, 9, 1, "scrubber_corr_up");
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(34, 9, 1), Name = "vent_corr_up", IsOpen = true });
            Vent(plan, "vent_hall", 43, 6, 1); // cabin-block reserve feed (closed; MOSS/player opens)
            Dev(plan, DeviceKind.Light, 32, 9, 1, "light_corr_up");
            Dev(plan, DeviceKind.Light, 32, 9, 0, "light_corr_low");

            // ------------------------------------------------- salvage & stores
            var store = north0["storage"];
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Potato, Count = 3, Pos = new Int3(store.X0 + 1, store.CenterY, 0), Label = "emergency rations" });
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Corpse, Count = 1, Pos = new Int3(store.X0 + 2, store.CenterY, 0), Label = "Ensign Rojas" });
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Regolith, Count = 1, Pos = new Int3(store.X0 + 3, store.CenterY, 0) });
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Regolith, Count = 1, Pos = new Int3(store.X0 + 4, store.CenterY, 0) });
            var shop = south0["workshop"];
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Scrap, Count = 2, Pos = new Int3(shop.X0 + 1, shop.CenterY, 0) });

            // -------------------------------------------------------------- people
            // HoldPosition: the recapture crew is under strict player control — they
            // move only on direct orders (and the player owns feeding/watering them).
            // Okafor wakes in the quarters HALL, not a cabin: a sealed 4×4 cabin
            // holds less than a day of air for one person (found the hard way —
            // the day-one survival test asphyxiated him in cabin 2).
            plan.Citizens.Add(new CitizenSpec { Name = "Okafor", Pos = new Int3(49, 7, 1), AutoWander = false, RevealsFog = true, HoldPosition = true });
            plan.Citizens.Add(new CitizenSpec { Name = "Reyes", Pos = new Int3(56, 15, 1), AutoWander = false, RevealsFog = false, HoldPosition = true });

            // ------------------------------------------------------------- anchors
            // (band-room anchors come from the planner; these are the hand-carved spaces)
            Room(plan, "bridge", RoomType.Bridge, 7, 9, 1);
            Room(plan, "cabin_1", RoomType.Quarters, 43, 2, 1);
            Room(plan, "cabin_2", RoomType.Quarters, 49, 2, 1);
            Room(plan, "cabin_3", RoomType.Quarters, 53, 2, 1);
            Room(plan, "cabin_4", RoomType.Quarters, 58, 2, 1);
            Room(plan, "quarters_hall", RoomType.Corridor, 45, 7, 1);
            Room(plan, "corridor_upper", RoomType.Corridor, 30, 9, 1);
            Room(plan, "corridor_lower", RoomType.Corridor, 30, 9, 0);

            // ---------------------------------------------------- starting state
            // Every compartment held pressure except the bridge — restoring it is
            // the early goal. Corridors are rooms too and start breathable.
            foreach (var name in new[]
            {
                "command", "medbay", "cabin_1", "cabin_2", "cabin_3", "cabin_4",
                "quarters_hall", "hydro", "observatory", "corridor_upper",
                "reactor", "engineering", "fabrication", "storage", "mess", "commons",
                "workshop", "lifesupport", "corridor_lower",
            })
                plan.PressurizedAnchors.Add(name);

            plan.Goals.Add(new GoalSpec { Kind = GoalKind.PressurizeAnchor, Param = "bridge", Text = "Restore the bridge" });
            plan.Goals.Add(new GoalSpec { Kind = GoalKind.ClearAllDebris, Param = "", Text = "Clear the aft debris" });
            plan.Goals.Add(new GoalSpec { Kind = GoalKind.ExploreAnchor, Param = "observatory", Text = "Find the crew" });

            plan.Scripts.Add(new ScriptSpec { TerminalId = "term_hydro", Source = DefaultProgram });

            // Furnish every typed room by rule — never by hand (see RoomDresser).
            RoomDresser.Dress(plan);

            return plan;
        }

        // ------------------------------------------------------------ small helpers

        private static void Dev(ShipPlan plan, DeviceKind kind, int x, int y, int z, string name) =>
            plan.Devices.Add(new DeviceSpec { Kind = kind, Pos = new Int3(x, y, z), Name = name });

        private static void Door(ShipPlan plan, string name, int x, int y, int z, bool open) =>
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.Door, Pos = new Int3(x, y, z), Name = name, IsOpen = open });

        private static void Vent(ShipPlan plan, string name, int x, int y, int z) =>
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(x, y, z), Name = name, IsOpen = false });

        private static void Room(ShipPlan plan, string anchor, RoomType type, int x, int y, int z) =>
            plan.Rooms.Add(new RoomSpec { Anchor = anchor, Type = type, Probe = new Int3(x, y, z) });

        /// <summary>Conduit tray under every carved (walkable) tile of a deck.</summary>
        private static void AddConduits(ShipPlan plan, GridCanvas deck, int z)
        {
            for (int y = 0; y < deck.Height; y++)
                for (int x = 0; x < deck.Width; x++)
                    if (deck.Get(x, y) == '.')
                        Dev(plan, DeviceKind.Conduit, x, y, z, $"conduit_d{z}_{x}_{y}");
        }
    }
}
