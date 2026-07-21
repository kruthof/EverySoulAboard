using Moonbase.Dsl;
using Moonbase.Sim;

namespace Moonbase.Tests
{
    /// <summary>
    /// A compact, deterministic two-room ship section shared by the mapper and golden
    /// tests. Two compartments joined by a door, a scatter of devices/items/citizens on
    /// both sides — enough to exercise every projection pass without a giant frame.
    /// </summary>
    internal static class GlyphTestScenario
    {
        // 12 × 5. Column 5 is the party wall; (5,2) is the connecting door.
        private static readonly string[] Deck =
        {
            "############",
            "#....#.....#",
            "#....D.....#",
            "#....#.....#",
            "############",
        };

        public static Simulation Build(ulong seed = 42)
        {
            var map = new string[Deck.Length];
            for (int i = 0; i < Deck.Length; i++) map[i] = Deck[i].Replace('D', '.');

            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), seed, SystemStack.CreateDefault(moss));

            sim.AddDevice(DeviceKind.Door, new Int3(5, 2, 0), "door_mid").IsOpen = true;

            // Right compartment: a little power + life support + water.
            sim.AddDevice(DeviceKind.SolarWing, new Int3(6, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Battery, new Int3(6, 3, 0), "battery").StoredKWh = 20f;
            sim.AddDevice(DeviceKind.Conduit, new Int3(7, 1, 0), "cond_a");
            sim.AddDevice(DeviceKind.Conduit, new Int3(7, 2, 0), "cond_b");
            sim.AddDevice(DeviceKind.Light, new Int3(7, 1, 0), "light");     // shares tile with conduit overlay
            sim.AddDevice(DeviceKind.Scrubber, new Int3(10, 1, 0), "scrubber");
            sim.AddDevice(DeviceKind.AirVent, new Int3(10, 3, 0), "vent");
            sim.AddDevice(DeviceKind.WaterTank, new Int3(9, 3, 0), "tank").StoredLiters = 250f;
            sim.AddDevice(DeviceKind.Pipe, new Int3(9, 2, 0), "pipe_a");

            // Crew: one each side of the door.
            sim.AddCitizen("Okafor", new Int3(2, 2, 0));
            sim.AddCitizen("Reyes", new Int3(8, 2, 0));

            // Items: food on the left, a labelled corpse on the right.
            sim.AddItem(ItemKind.Potato, 3, new Int3(3, 2, 0));
            sim.AddItem(ItemKind.Corpse, 1, new Int3(9, 1, 0)).Label = "Vega";

            sim.Rooms.SetAnchor("left", new Int3(2, 2, 0));
            sim.Rooms.SetAnchor("right", new Int3(8, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(8, 2, 0)));

            return sim;
        }

        /// <summary>Reveal every non-void tile on a level — bypass fog for tests that
        /// aren't about fog.</summary>
        public static void RevealLevel(Simulation sim, int z)
        {
            var level = sim.World.Levels[z];
            for (int y = 0; y < level.Height; y++)
                for (int x = 0; x < level.Width; x++)
                    if (level.Floor[level.Index(x, y)] != TileDefs.Void)
                        sim.World.SetFlag(new Int3(x, y, z), TileFlags.Explored, true);
        }
    }
}
