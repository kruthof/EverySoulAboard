using System;
using System.Collections.Generic;
using System.Linq;
using Moonbase.Gen;
using Moonbase.Sim;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// The RoomDresser furnishes rooms by rule, never by hand — these pin the rules'
    /// contract on the shipping Perilune plan: furniture only on carved floor, never
    /// stacked on another placeable, never on a door tile or its keep-clear apron,
    /// beds against walls, every typed room that has a rule actually furnished, and
    /// the whole pass a pure function of the plan (identical on every run).
    /// </summary>
    public class RoomDresserTests
    {
        private static readonly DeviceKind[] FurnitureKinds =
            { DeviceKind.Bed, DeviceKind.Table, DeviceKind.Chair, DeviceKind.MedBed, DeviceKind.MedCabinet };

        private static List<DeviceSpec> Furniture(ShipPlan plan) =>
            plan.Devices.Where(d => Array.IndexOf(FurnitureKinds, d.Kind) >= 0).ToList();

        [Test]
        public void Dressing_Is_Deterministic()
        {
            var a = Furniture(AuthoredShips.Perilune());
            var b = Furniture(AuthoredShips.Perilune());
            Assert.AreEqual(a.Count, b.Count, "same furniture count on every run");
            for (int i = 0; i < a.Count; i++)
            {
                Assert.AreEqual(a[i].Kind, b[i].Kind);
                Assert.AreEqual(a[i].Pos, b[i].Pos);
                Assert.AreEqual(a[i].Name, b[i].Name);
            }
        }

        [Test]
        public void Furniture_Sits_On_Carved_Floor_Only()
        {
            var plan = AuthoredShips.Perilune();
            foreach (var f in Furniture(plan))
                Assert.AreEqual('.', plan.DeckRows[f.Pos.Z][f.Pos.Y][f.Pos.X],
                    $"{f.Name} must sit on a carved floor tile");
        }

        [Test]
        public void Furniture_Never_Stacks_On_Doors_Aprons_Or_Placeables()
        {
            var plan = AuthoredShips.Perilune();
            var doors = plan.Devices.Where(d => d.Kind == DeviceKind.Door).Select(d => d.Pos).ToHashSet();
            var blocked = new HashSet<Int3>(doors);
            foreach (var d in doors)
            {
                blocked.Add(new Int3(d.X, d.Y - 1, d.Z));
                blocked.Add(new Int3(d.X - 1, d.Y, d.Z));
                blocked.Add(new Int3(d.X + 1, d.Y, d.Z));
                blocked.Add(new Int3(d.X, d.Y + 1, d.Z));
            }
            foreach (var d in plan.Devices)
                if (d.Kind != DeviceKind.Conduit && d.Kind != DeviceKind.Pipe
                    && Array.IndexOf(FurnitureKinds, d.Kind) < 0)
                    blocked.Add(d.Pos);
            foreach (var it in plan.Items) blocked.Add(it.Pos);
            foreach (var c in plan.Citizens) blocked.Add(c.Pos);

            var seen = new HashSet<Int3>();
            foreach (var f in Furniture(plan))
            {
                Assert.IsFalse(blocked.Contains(f.Pos), $"{f.Name} landed on a door/apron/occupied tile");
                Assert.IsTrue(seen.Add(f.Pos), $"{f.Name} stacked on other furniture");
            }
        }

        [Test]
        public void Beds_Hug_Walls()
        {
            var plan = AuthoredShips.Perilune();
            foreach (var f in Furniture(plan))
            {
                if (f.Kind != DeviceKind.Bed && f.Kind != DeviceKind.MedBed) continue;
                var rows = plan.DeckRows[f.Pos.Z];
                bool wallAdjacent =
                    rows[f.Pos.Y - 1][f.Pos.X] == '#' || rows[f.Pos.Y + 1][f.Pos.X] == '#' ||
                    rows[f.Pos.Y][f.Pos.X - 1] == '#' || rows[f.Pos.Y][f.Pos.X + 1] == '#';
                Assert.IsTrue(wallAdjacent, $"{f.Name} must be placed against a wall");
            }
        }

        [Test]
        public void Every_Ruled_Room_Is_Furnished()
        {
            var plan = AuthoredShips.Perilune();
            var furniture = Furniture(plan);
            // Cabins: one bed each. Medbay: med-beds + cabinet. Mess/commons: tables.
            foreach (var anchor in new[] { "cabin_1", "cabin_2", "cabin_3", "cabin_4" })
                Assert.AreEqual(1, furniture.Count(f => f.Kind == DeviceKind.Bed && f.Name == "bed_" + anchor),
                    anchor + " needs exactly one bunk");
            Assert.GreaterOrEqual(furniture.Count(f => f.Kind == DeviceKind.MedBed), 2, "medbay med-bed row");
            Assert.AreEqual(1, furniture.Count(f => f.Kind == DeviceKind.MedCabinet), "medbay supply cabinet");
            Assert.GreaterOrEqual(furniture.Count(f => f.Kind == DeviceKind.Table && f.Name.Contains("_mess")), 2,
                "mess hall tables");
            Assert.GreaterOrEqual(furniture.Count(f => f.Kind == DeviceKind.Chair), 8, "chairs throughout the ship");
        }
    }
}
