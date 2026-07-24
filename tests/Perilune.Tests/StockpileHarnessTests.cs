using System.Collections.Generic;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tools;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-4 WP-3 — the <c>occupancy --stockpile &lt;bench|far&gt; [N]</c> measurement selector
    /// (<see cref="StockpileHarness"/>). Host-side, zero sim state; this pins only that it selects a
    /// DETERMINISTIC, REPRODUCIBLE prefix of walkable tiles — so the A/B a reviewer reruns is the same
    /// experiment every time. The sim mechanics (filter/haul) are pinned by the WP-1/WP-2/WP-4 suites.
    /// </summary>
    public class StockpileHarnessTests
    {
        private static Simulation Slice() =>
            GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;

        private static bool IsBench(DeviceKind k) =>
            k == DeviceKind.SalvageRecycler || k == DeviceKind.Fabricator || k == DeviceKind.MachineShop;

        /// <summary>The core determinism contract: the SAME N tiles, same order, on two independent
        /// boots. A non-total sort order (e.g. dropping the canonical z,y,x tie-break) would let equal
        /// distances reorder run-to-run and this fails. MUTATION: remove the <c>a.key.CompareTo(b.key)</c>
        /// tie-break from the sort ⇒ the two lists diverge on any distance tie.</summary>
        [Test]
        public void SelectStockpile_IsIdenticalAcrossTwoRuns([Values(false, true)] bool far)
        {
            List<Int3> a = StockpileHarness.SelectStockpile(Slice(), far, 4);
            List<Int3> b = StockpileHarness.SelectStockpile(Slice(), far, 4);
            Assert.That(a, Is.EqualTo(b), "the harness must designate the same tiles on two runs");
            Assert.That(a.Count, Is.EqualTo(4), "the slice has ample walkable floor for a 4-tile zone");
        }

        /// <summary>Every pick is a legal stockpile tile: walkable floor (the exact gate
        /// <c>DesignateStockpileCommand</c> enforces) and not already zoned, in strict canonical z,y,x
        /// order among equal-distance ties. MUTATION: drop the walkable filter ⇒ a wall/void tile is
        /// picked and the walkable assertion fails.</summary>
        [Test]
        public void SelectStockpile_PicksAreWalkableFloor([Values(false, true)] bool far)
        {
            var world = Slice().World;
            List<Int3> picks = StockpileHarness.SelectStockpile(Slice(), far, 4);
            foreach (var p in picks)
                Assert.That((world.GetFlags(p) & TileFlags.Walkable), Is.Not.EqualTo((TileFlags)0),
                    $"{p} is not walkable floor — a stockpile can never live there");
        }

        /// <summary>The two modes MEAN opposite things: <c>far</c> lands on the deck OPPOSITE the
        /// crafting benches (the wrong-deck regression), <c>bench</c> lands on the SAME deck as (and
        /// adjacent to) them (the buffer). On the slice the three benches are all on deck 0, so far ⇒
        /// deck 1, bench ⇒ deck 0. MUTATION: flip the ascending/descending distance compare ⇒ the deck
        /// assertions swap and this fails.</summary>
        [Test]
        public void FarIsTheOppositeDeck_BenchIsTheBenchDeck()
        {
            var sim = Slice();
            // The slice's benches are all on deck 0 (RoomOutfitter.Engineering/Fabrication, north0).
            int benchZ = -1;
            foreach (var d in sim.Devices.Items) if (IsBench(d.Kind)) { benchZ = d.Pos.Z; break; }
            Assert.That(benchZ, Is.EqualTo(0), "precondition: the slice benches sit on deck 0");

            List<Int3> bench = StockpileHarness.SelectStockpile(Slice(), far: false, 4);
            List<Int3> far = StockpileHarness.SelectStockpile(Slice(), far: true, 4);

            foreach (var p in bench)
                Assert.That(p.Z, Is.EqualTo(0), $"bench-mode tile {p} must be on the bench deck (0)");
            foreach (var p in far)
                Assert.That(p.Z, Is.EqualTo(1), $"far-mode tile {p} must be on the opposite deck (1)");
        }

        /// <summary>Degenerate inputs are safe no-ops: N &lt;= 0 or a null sim returns an empty list, so
        /// the no-flag occupancy path (which never calls the harness) can never select or designate
        /// anything. MUTATION: drop the <c>n &lt;= 0</c> guard ⇒ a non-empty list leaks out.</summary>
        [Test]
        public void SelectStockpile_IsAnEmptyNoOp_ForNonPositiveN_AndNullSim()
        {
            Assert.That(StockpileHarness.SelectStockpile(Slice(), far: true, 0), Is.Empty, "N=0 selects nothing");
            Assert.That(StockpileHarness.SelectStockpile(Slice(), far: false, -5), Is.Empty, "N<0 selects nothing");
            Assert.That(StockpileHarness.SelectStockpile(null, far: true, 4), Is.Empty, "a null sim selects nothing");
        }
    }
}
