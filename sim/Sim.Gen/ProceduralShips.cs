using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// The P1 procedural ship generator — the embryo of WS-SHIPGEN's P2 generator. It
    /// reuses every proven authored stage (GridCanvas carve → <see cref="BandPlanner"/> →
    /// <see cref="RoomOutfitter"/> → <see cref="RoomDresser"/>) and varies only what is safe
    /// within that pattern, driven by a <see cref="ShipRecipe"/>'s forked RNG:
    ///  - the ORDER of rooms inside each of the four bands (seeded shuffle);
    ///  - the number of crew cabins off the quarters hall (3 or 4).
    /// Everything the validation gates depend on — a reactor with generators, a life-support
    /// water loop, a hydroponics bay, the running upper-corridor recirculator, conduits under
    /// every tile, ladder trunks linking the decks — is always present, so a generated ship
    /// is as survivable as the authored Perilune. A generated plan is a pure function of
    /// (generator, seed): no file IO, no wall-clock, RNG only.
    /// </summary>
    public static class ProceduralShips
    {
        public static ShipPlan Generate(ShipRecipe recipe)
        {
            int w = recipe.Width, h = recipe.Height;
            var plan = new ShipPlan { Name = $"Generated Ship (seed {recipe.Seed})", Seed = recipe.Seed };
            var rng = new SimRng(recipe.Seed).Fork(0x5417u); // geometry stream, disjoint from the sim's

            // ------------------------------------------------------------ deck rasters
            var z0 = new GridCanvas(w, h, '#');
            z0.FillRect(2, 9, w - 3, 10, '.');            // lower corridor spine
            var z1 = new GridCanvas(w, h, '#');
            z1.FillRect(13, 9, w - 3, 10, '.');           // upper corridor spine (aft of the bridge)
            z1.FillRect(2, 4, 11, 15, '.');               // bridge (spans the bow)
            z1.Set(12, 9, '.');                           // door_bridge gap

            // Crew quarters suite: N cabins off a private hall (like the authored ship).
            z1.FillRect(42, 6, w - 3, 7, '.');            // quarters hall
            z1.Set(50, 8, '.');                           // door_quarters gap
            int cabins = recipe.CabinCount < 3 ? 3 : recipe.CabinCount > 4 ? 4 : recipe.CabinCount;
            var cabinX0 = new[] { 42, 47, 52, 57 };
            var cabinDoorX = new[] { 44, 48, 53, 58 };
            for (int c = 0; c < cabins; c++)
            {
                z1.FillRect(cabinX0[c], 1, cabinX0[c] + 3, 4, '.'); // 4x4 cabin
                z1.Set(cabinDoorX[c], 5, '.');                      // cabin door gap
            }

            // ------------------------------------------------- planned room bands
            // Room ORDER inside each band is the seeded variation; the room SET is fixed so
            // every ship keeps its reactor, life support and hydroponics.
            var north0 = BandPlanner.Carve(z0, plan, 0, startX: 2, corridorWallY: 8, roomsAbove: true,
                Shuffle(rng, new[]
                {
                    Room("reactor", RoomType.Reactor),
                    Room("engineering", RoomType.Engineering, "door_eng"),
                    Room("fabrication", RoomType.Fabrication, "door_fab"),
                    Room("storage", RoomType.Storage),
                }));
            var south0 = BandPlanner.Carve(z0, plan, 0, startX: 2, corridorWallY: 11, roomsAbove: false,
                Shuffle(rng, new[]
                {
                    Room("mess", RoomType.Mess),
                    Room("commons", RoomType.Commons),
                    Room("workshop", RoomType.Workshop),
                    Room("lifesupport", RoomType.LifeSupport, "door_ls"),
                }));
            var north1 = BandPlanner.Carve(z1, plan, 1, startX: 13, corridorWallY: 8, roomsAbove: true,
                Shuffle(rng, new[]
                {
                    Room("command", RoomType.Command),
                    Room("medbay", RoomType.Medbay),
                }));
            var south1 = BandPlanner.Carve(z1, plan, 1, startX: 13, corridorWallY: 11, roomsAbove: false,
                Shuffle(rng, new[]
                {
                    Room("hydro", RoomType.Hydro),
                    Room("observatory", RoomType.Observatory),
                }));

            plan.DeckRows = new[] { z0.ToRows(), z1.ToRows() };

            // ---------------------------------------------------------------- doors
            // Generated ships are pristine — every door starts OPEN, so the whole hull is
            // one reachable, breathable volume (no sealed-by-fiction compartments).
            Door(plan, "door_bridge", 12, 9, 1);
            Door(plan, "door_quarters", 50, 8, 1);
            for (int c = 0; c < cabins; c++)
                Door(plan, $"door_cabin_{c + 1}", cabinDoorX[c], 5, 1);

            // ------------------------------------------------------- ladder trunks
            Dev(plan, DeviceKind.Ladder, 18, 9, 0, "ladder_a_low");
            Dev(plan, DeviceKind.Ladder, 18, 9, 1, "ladder_a_up");
            Dev(plan, DeviceKind.Ladder, 46, 9, 0, "ladder_b_low");
            Dev(plan, DeviceKind.Ladder, 46, 9, 1, "ladder_b_up");

            // ---------------------------------------------------------------- power
            AddConduits(plan, z0, 0);
            AddConduits(plan, z1, 1);

            // -------------------------------------------------- room outfitting
            RoomOutfitter.Reactor(plan, north0["reactor"], 0);
            RoomOutfitter.Engineering(plan, north0["engineering"], 0);
            RoomOutfitter.Fabrication(plan, north0["fabrication"], 0);
            Dev(plan, DeviceKind.Light, north0["storage"].CenterX, north0["storage"].Y0, 0, "light_storage");
            RoomOutfitter.Mess(plan, south0["mess"], 0);
            RoomOutfitter.Light(plan, south0["commons"], 0, "light_commons");
            RoomOutfitter.Light(plan, south0["workshop"], 0, "light_workshop");
            RoomOutfitter.LifeSupport(plan, south0["lifesupport"], 0);
            RoomOutfitter.Light(plan, north1["command"], 1, "light_command");
            RoomOutfitter.Light(plan, north1["medbay"], 1, "light_medbay");
            RoomOutfitter.Hydro(plan, south1["hydro"], 1);
            RoomOutfitter.Light(plan, south1["observatory"], 1, "light_obs");
            Dev(plan, DeviceKind.Light, 6, 9, 1, "light_bridge");
            Dev(plan, DeviceKind.Light, 51, 6, 1, "light_quarters");
            // Upper-deck air recirculator pair, RUNNING at boot (the compact hull's
            // scrub→pressure-dip→fresh-mix life-support cycle — the reason the crew breathe).
            Dev(plan, DeviceKind.Scrubber, 33, 9, 1, "scrubber_corr_up");
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(34, 9, 1), Name = "vent_corr_up", IsOpen = true });
            Dev(plan, DeviceKind.Light, 32, 9, 1, "light_corr_up");
            Dev(plan, DeviceKind.Light, 32, 9, 0, "light_corr_low");

            // ------------------------------------------------- stores & people
            var store = north0["storage"];
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Potato, Count = 6, Pos = new Int3(store.X0 + 1, store.CenterY, 0), Label = "rations" });

            // Crew spawn in the recirculated upper corridor — always breathable, so a fresh
            // variant survives day one on air while reachable tanks/food cover longer runs.
            for (int i = 0; i < recipe.CrewCount; i++)
                plan.Citizens.Add(new CitizenSpec
                {
                    Name = $"Crew{i + 1}",
                    Pos = new Int3(28 + i, 9, 1),
                    AutoWander = false,
                    RevealsFog = true,
                    HoldPosition = false,
                });

            // ------------------------------------------------------------- anchors
            // (band-room anchors come from the planner; these are the hand-carved spaces)
            Anchor(plan, "bridge", RoomType.Bridge, 7, 9, 1);
            for (int c = 0; c < cabins; c++)
                Anchor(plan, $"cabin_{c + 1}", RoomType.Quarters, cabinX0[c] + 1, 2, 1);
            Anchor(plan, "quarters_hall", RoomType.Corridor, 45, 7, 1);
            Anchor(plan, "corridor_upper", RoomType.Corridor, 30, 9, 1);
            Anchor(plan, "corridor_lower", RoomType.Corridor, 30, 9, 0);

            // ---------------------------------------------------- starting state
            // Every compartment holds air (a pristine ship). Corridors are rooms too.
            foreach (var r in plan.Rooms)
                plan.PressurizedAnchors.Add(r.Anchor);

            // The life-support watch, on the hydroponics terminal (same MOSS vocabulary the
            // shipped rules assume: vent_hydro / hydro / lifesupport / door_storage).
            plan.Scripts.Add(new ScriptSpec { TerminalId = "term_hydro", Source = AuthoredShips.DefaultProgram });

            // Furnish every typed room by rule — never by hand (see RoomDresser).
            RoomDresser.Dress(plan);

            return plan;
        }

        // ------------------------------------------------------------ small helpers

        private static BandPlanner.Room Room(string anchor, RoomType type, string doorName = null) =>
            new BandPlanner.Room { Anchor = anchor, Type = type, DoorX = -1, DoorName = doorName };

        /// <summary>In-place Fisher–Yates over a copy, using the sim RNG (deterministic).</summary>
        private static BandPlanner.Room[] Shuffle(SimRng rng, BandPlanner.Room[] rooms)
        {
            for (int i = rooms.Length - 1; i > 0; i--)
            {
                int j = rng.NextInt(i + 1);
                (rooms[i], rooms[j]) = (rooms[j], rooms[i]);
            }
            return rooms;
        }

        private static void Dev(ShipPlan plan, DeviceKind kind, int x, int y, int z, string name) =>
            plan.Devices.Add(new DeviceSpec { Kind = kind, Pos = new Int3(x, y, z), Name = name });

        private static void Door(ShipPlan plan, string name, int x, int y, int z) =>
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.Door, Pos = new Int3(x, y, z), Name = name, IsOpen = true });

        private static void Anchor(ShipPlan plan, string anchor, RoomType type, int x, int y, int z) =>
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
