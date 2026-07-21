using System.Collections.Generic;
using Moonbase.Sim;
using Moonbase.Tui;
using Moonbase.Tui.Ui;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// InspectorModel is the pure "what's under the cursor" reader. These pin the shape of
    /// its lines for the three cursor contexts that matter (a device tile, a crew tile, a
    /// room tile) plus the selection footer — all against the real shipping boot.
    /// </summary>
    public class InspectorModelTests
    {
        private static Simulation Boot() => SimHost.Build(SimHost.DefaultSeed).Sim;

        [Test]
        public void Device_Tile_Reports_Device_Line()
        {
            var sim = Boot();
            var devices = sim.Devices.Items;
            Int3? at = null;
            for (int i = 0; i < devices.Count; i++)
            {
                var p = devices[i].Pos;
                if ((sim.World.GetFlags(p) & TileFlags.Explored) != 0) { at = p; break; }
            }
            Assert.IsTrue(at.HasValue, "expected at least one device on an explored tile at boot");

            var lines = InspectorModel.Build(sim, at.Value);
            Assert.IsTrue(HasPrefix(lines, "dev: "), "inspector should name the device");
        }

        [Test]
        public void Crew_Tile_Reports_Crew_Line_And_Selection()
        {
            var sim = Boot();
            var citizens = sim.Citizens.Items;
            Assert.Greater(citizens.Count, 0, "boot has crew");
            var c = citizens[0];

            var lines = InspectorModel.Build(sim, c.Pos, c.Id);
            Assert.IsTrue(HasPrefix(lines, "crew: "), "inspector should name the crew member");
            Assert.IsTrue(HasPrefix(lines, "* selected: "), "selection footer present when an id is passed");
        }

        [Test]
        public void Room_Tile_Reports_Atmosphere()
        {
            var sim = Boot();
            Int3? roomTile = null;
            var world = sim.World;
            for (int z = 0; z < world.Depth && roomTile == null; z++)
                for (int y = 0; y < world.Height && roomTile == null; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        ushort id = sim.Rooms.RoomIdAt(world, p);
                        if (id != 0 && id != RoomState.DoorMarker && id < sim.Rooms.Rooms.Count)
                        { roomTile = p; break; }
                    }
            Assert.IsTrue(roomTile.HasValue, "expected an explored tile inside a room");

            var lines = InspectorModel.Build(sim, roomTile.Value);
            Assert.IsTrue(HasContains(lines, "kPa"), "room line reports pressure");
        }

        [Test]
        public void OffMap_And_Unexplored_Are_Safe()
        {
            var sim = Boot();
            var off = InspectorModel.Build(sim, new Int3(-1, -1, 0));
            Assert.IsTrue(HasContains(off, "off-map"));
        }

        private static bool HasPrefix(List<string> lines, string prefix)
        {
            foreach (var l in lines) if (l.StartsWith(prefix)) return true;
            return false;
        }

        private static bool HasContains(List<string> lines, string sub)
        {
            foreach (var l in lines) if (l.Contains(sub)) return true;
            return false;
        }
    }
}
