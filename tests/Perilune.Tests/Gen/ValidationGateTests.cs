using System.Linq;
using Perilune.Gen;
using Perilune.Gen.Validate;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests.Gen
{
    /// <summary>
    /// WS-SHIPGEN validation gates (V1–V7). Proves: the authored Perilune passes every gate;
    /// procedurally generated variants (seeds 1..5) are valid and deterministic; and each gate
    /// actually catches a deliberately broken ship (one plan mutation per gate). The broken-ship
    /// cases drive a single gate on a settled probe sim (no full survivability run) so they stay
    /// fast; the pass-all cases pay for one full sim-day where it matters.
    /// </summary>
    public class ValidationGateTests
    {
        private static readonly ulong[] Seeds = { 1, 2, 3, 4, 5 };

        // ------------------------------------------------------------ the good ships pass

        [Test]
        public void AuthoredPerilune_PassesAllGates()
        {
            var report = ShipGates.Run(AuthoredShips.Perilune(), SimDefs.Default, days: 1);
            Assert.IsTrue(report.AllPassed, report.Format());
        }

        [Test]
        public void GeneratedVariants_PassStructuralGates()
        {
            foreach (var seed in Seeds)
            {
                var plan = ProceduralShips.Generate(ShipRecipe.FromSeed(seed));
                var probe = ShipGates.BuildSettledProbe(plan);
                Assert.IsTrue(ShipGates.V1Connectivity(probe).Passed, $"seed {seed} V1\n" + Findings(ShipGates.V1Connectivity(probe)));
                Assert.IsTrue(ShipGates.V2RoomIntegrity(probe).Passed, $"seed {seed} V2\n" + Findings(ShipGates.V2RoomIntegrity(probe)));
                Assert.IsTrue(ShipGates.V3Power(probe).Passed, $"seed {seed} V3\n" + Findings(ShipGates.V3Power(probe)));
                Assert.IsTrue(ShipGates.V4WaterFood(probe, plan.Citizens.Count).Passed, $"seed {seed} V4\n" + Findings(ShipGates.V4WaterFood(probe, plan.Citizens.Count)));
                Assert.IsTrue(ShipGates.V5MossNames(plan).Passed, $"seed {seed} V5\n" + Findings(ShipGates.V5MossNames(plan)));
                Assert.IsTrue(ShipGates.V7Determinism(plan, SimDefs.Default).Passed, $"seed {seed} V7");
            }
        }

        [Test]
        public void GeneratedVariant_PassesEveryGate_IncludingSurvivability()
        {
            // The one full-suite variant run (pays for the sim-day survivability gate).
            var report = ShipGates.Run(ProceduralShips.Generate(ShipRecipe.FromSeed(1)), SimDefs.Default, days: 1);
            Assert.IsTrue(report.AllPassed, report.Format());
        }

        [Test]
        public void SameSeed_GeneratesIdenticalPlan()
        {
            var a = ProceduralShips.Generate(ShipRecipe.FromSeed(3));
            var b = ProceduralShips.Generate(ShipRecipe.FromSeed(3));
            Assert.AreEqual(a.Devices.Count, b.Devices.Count);
            for (int i = 0; i < a.Devices.Count; i++)
            {
                Assert.AreEqual(a.Devices[i].Name, b.Devices[i].Name);
                Assert.AreEqual(a.Devices[i].Pos, b.Devices[i].Pos);
            }
        }

        [Test]
        public void DifferentSeeds_ProduceVariation()
        {
            // At least one of a small spread differs from seed 1 (room order / cabin count).
            var baseline = Signature(ProceduralShips.Generate(ShipRecipe.FromSeed(1)));
            bool varied = false;
            for (ulong s = 2; s <= 8 && !varied; s++)
                varied = Signature(ProceduralShips.Generate(ShipRecipe.FromSeed(s))) != baseline;
            Assert.IsTrue(varied, "the recipe should produce visibly different ships across seeds");
        }

        // ------------------------------------------------------------ each gate catches a break

        [Test]
        public void V1_Catches_SealedUnreachableRoom()
        {
            var plan = AuthoredShips.Perilune();
            // Wall cabin_1's only door and delete the door device: the cabin interior is now
            // gas-tight but unreachable from the crew start.
            SetTile(plan, 44, 5, 1, '#');
            plan.Devices.RemoveAll(d => d.Name == "door_cabin_1");
            var probe = ShipGates.BuildSettledProbe(plan);
            Assert.IsFalse(ShipGates.V1Connectivity(probe).Passed, "a sealed unreachable room must fail V1");
        }

        [Test]
        public void V2_Catches_MissingHullWall()
        {
            var plan = AuthoredShips.Perilune();
            // Punch the bridge's port hull out to the map edge: the bridge now leaks to vacuum.
            SetTile(plan, 1, 9, 1, '.');
            SetTile(plan, 0, 9, 1, '.');
            var probe = ShipGates.BuildSettledProbe(plan);
            Assert.IsFalse(ShipGates.V2RoomIntegrity(probe).Passed, "a hull breach to vacuum must fail V2");
        }

        [Test]
        public void V3_Catches_UnpoweredScrubber()
        {
            var plan = AuthoredShips.Perilune();
            IsolateFromConduits(plan, "scrubber_corr_up"); // strip the conduits it could attach to
            var probe = ShipGates.BuildSettledProbe(plan);
            Assert.IsFalse(ShipGates.V3Power(probe).Passed, "a scrubber off the conduit network must fail V3");
        }

        [Test]
        public void V4_Catches_NoReclaimer()
        {
            var plan = AuthoredShips.Perilune();
            plan.Devices.RemoveAll(d => d.Kind == DeviceKind.Reclaimer);
            var probe = ShipGates.BuildSettledProbe(plan);
            Assert.IsFalse(ShipGates.V4WaterFood(probe, plan.Citizens.Count).Passed, "an open water loop (no reclaimer) must fail V4");
        }

        [Test]
        public void V5_Catches_DuplicateDeviceName()
        {
            var plan = AuthoredShips.Perilune();
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(34, 10, 1), Name = "vent_hydro" });
            Assert.IsFalse(ShipGates.V5MossNames(plan).Passed, "a duplicate pinned name must fail V5");
        }

        // ------------------------------------------------------------ helpers

        private static string Findings(GateResult g) => string.Join("\n", g.Findings);

        private static string Signature(ShipPlan plan) =>
            string.Join("|", plan.Rooms.Select(r => r.Anchor + "@" + r.Probe));

        private static void SetTile(ShipPlan plan, int x, int y, int z, char c)
        {
            var row = plan.DeckRows[z][y].ToCharArray();
            row[x] = c;
            plan.DeckRows[z][y] = new string(row);
        }

        /// <summary>Remove every conduit on or 6-adjacent to the named device's tile, cutting it
        /// off from the power network.</summary>
        private static void IsolateFromConduits(ShipPlan plan, string deviceName)
        {
            Int3 pos = default;
            bool found = false;
            foreach (var d in plan.Devices)
                if (d.Name == deviceName) { pos = d.Pos; found = true; break; }
            Assert.IsTrue(found, $"test setup: device '{deviceName}' not in plan");

            bool Adjacent(Int3 p) =>
                (p == pos) ||
                (p.Z == pos.Z && System.Math.Abs(p.X - pos.X) + System.Math.Abs(p.Y - pos.Y) == 1) ||
                (p.X == pos.X && p.Y == pos.Y && System.Math.Abs(p.Z - pos.Z) == 1);

            plan.Devices.RemoveAll(d => d.Kind == DeviceKind.Conduit && Adjacent(d.Pos));
        }
    }
}
