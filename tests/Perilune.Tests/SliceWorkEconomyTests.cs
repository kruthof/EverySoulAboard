using System;
using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// The slice's WORK ECONOMY — the loop a player actually watches: crew take jobs, the
    /// dig produces Regolith, and a wall designated at any moment gets built.
    ///
    /// These are the tests whose absence let a dead ship ship. The slice booted with an
    /// EMPTY dig board (48 debris walls, zero designated) behind a sealed aft lock, so the
    /// only labour aboard was the recycler's standing bill — which ate both of the ship's
    /// two Regolith units inside the first minute. A player who designated a wall a few
    /// minutes in watched "0/2" forever: no material, no hauler, no builder, no explanation.
    /// Everything here is measured against a bounded tick budget so a regression fails loudly
    /// instead of degrading into "they just walk around".
    /// </summary>
    public class SliceWorkEconomyTests
    {
        /// <summary>Ten sim-minutes: long enough for the aft dig to finish and the crafting
        /// chain to pick up, short enough to stay a fast test.</summary>
        private const int WorkWindowTicks = 6000;

        private static Simulation NewSlice(out BuildSystem build)
        {
            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;
            build = null;
            foreach (var s in sim.Systems)
                if (s is BuildSystem b) { build = b; break; }
            Assert.That(build, Is.Not.Null, "the slice stack registers a BuildSystem");
            return sim;
        }

        // ------------------------------------------------------ the playtester's bug

        [Test]
        public void WallDesignatedLongAfterBoot_StillGetsBuilt()
        {
            // EXACTLY the reported scenario: play for a while first (so every standing bill
            // has had its chance at the ship's material), THEN designate a wall.
            var sim = NewSlice(out var build);
            for (int t = 0; t < 3000; t++) sim.Tick();

            var site = new Int3(30, 10, 0); // open lower-corridor tile, no device, no citizen
            new DesignateBuildCommand(site, BuildKind.Wall).Execute(sim);
            Assert.That(build.TryGet(site, out var fresh), Is.True, "the designation was accepted");
            Assert.That(fresh.Delivered, Is.EqualTo(0));

            int maxDelivered = 0;
            long completedAt = -1;
            for (int t = 0; t < 6000 && completedAt < 0; t++)
            {
                sim.Tick();
                if (build.TryGet(site, out var b)) maxDelivered = Math.Max(maxDelivered, b.Delivered);
                else completedAt = sim.TickCount;
            }

            Assert.That(completedAt, Is.GreaterThan(0),
                $"a wall designated at tick 3000 must actually get built (stalled at {maxDelivered}/{fresh.Required})");
            Assert.That(sim.World.GetWall(site), Is.EqualTo(TileDefs.Wall), "the wall is standing");
        }

        [Test]
        public void ThreeSimultaneousDesignations_AllComplete_NoneStranded()
        {
            // Three walls at once on a ship with adequate stock: every site must FINISH.
            // The old boolean "some free material exists somewhere" sent a hauler at every
            // needy site regardless of how much material there actually was, so sites
            // deadlocked half-materialed — and nothing ever un-deposits.
            var sim = NewSlice(out var build);
            var sites = new[] { new Int3(36, 10, 0), new Int3(38, 10, 0), new Int3(40, 10, 0) };
            foreach (var s in sites)
                Assert.That(build.Designate(sim, s, BuildKind.Wall), Is.True, $"designation at {s} accepted");

            for (int t = 0; t < 20000 && build.Pending.Count > 0; t++) sim.Tick();

            foreach (var s in sites)
            {
                bool stillPending = build.TryGet(s, out var stuck);
                Assert.That(stillPending, Is.False,
                    $"site {s} stranded at {stuck.Delivered}/{stuck.Required} — nothing ever un-deposits");
                Assert.That(sim.World.GetWall(s), Is.EqualTo(TileDefs.Wall), $"wall standing at {s}");
            }
        }

        // ------------------------------------------------------------- "they work"

        [Test]
        public void CrewActuallyWork_OverTheFirstTenSimMinutes()
        {
            // The anti-regression for "the crew just walk around". Threshold: a fifth of all
            // live crew-ticks spent on a job. Measured on this build it is ~40% (dig 10% +
            // craft 30%); before the fix it was 6.4%, ALL of it the recycler, with zero
            // Dig/Haul/Build ticks in three sim-days. 20% leaves the balance room to move
            // without letting the ship go idle again.
            var sim = NewSlice(out _);

            long working = 0, live = 0, dig = 0;
            for (int t = 0; t < WorkWindowTicks; t++)
            {
                sim.Tick();
                var crew = sim.Citizens.Items;
                for (int i = 0; i < crew.Count; i++)
                {
                    if (crew[i].Dead) continue;
                    live++;
                    if (crew[i].JobKind != JobKind.None) working++;
                    if (crew[i].JobKind == JobKind.Dig) dig++;
                }
            }

            double fraction = (double)working / live;
            Assert.That(fraction, Is.GreaterThan(0.20),
                $"crew must spend real time working — saw {fraction:P1} of {live} crew-ticks on a job");
            Assert.That(dig, Is.GreaterThan(0), "the authored dig board actually gets worked");
        }

        [Test]
        public void Slice_BootsWithADigBoardAndAReachableSeam()
        {
            // The two authored facts that make the dig real, asserted separately — each is
            // useless without the other, and each has silently regressed once already.
            var sim = NewSlice(out _);

            int designated = 0;
            for (int z = 0; z < sim.World.Depth; z++)
            {
                var level = sim.World.Levels[z];
                for (int i = 0; i < level.Flags.Length; i++)
                    if ((level.Flags[i] & (byte)TileFlags.Designated) != 0 &&
                        level.Wall[i] == TileDefs.Debris) designated++;
            }
            Assert.That(designated, Is.EqualTo(48), "the whole aft debris field boots designated");

            Assert.That(sim.TryGetDeviceAt(new Int3(56, 9, 0), out var aft), Is.True, "aft lock present");
            Assert.That(aft.IsOpen, Is.True, "the aft lock is open — a sealed one makes every dig site unreachable");
            Assert.That(sim.IsWalkable(new Int3(56, 9, 0)), Is.True, "crew can reach the seam");
        }

        [Test]
        public void Slice_StocksBuildMaterialInWholeWallStacks()
        {
            // wall_material is 2, so material shipped in stacks of 1 costs two hauler trips
            // per wall and strands sites at 1/2 whenever the second trip loses a race.
            var sim = NewSlice(out _);

            int units = 0, wholeWallStacks = 0;
            foreach (var it in sim.Items.Items)
            {
                if (it.Kind != BuildSystem.Material) continue;
                units += it.Count;
                if (it.Count >= sim.Defs.Build.WallMaterial) wholeWallStacks++;
            }
            Assert.That(wholeWallStacks, Is.GreaterThanOrEqualTo(6),
                "at least six one-trip wall stacks aboard at boot");
            Assert.That(units, Is.GreaterThanOrEqualTo(6 * sim.Defs.Build.WallMaterial),
                "enough opening material for six walls without waiting on the dig");
        }

        // ------------------------------------------------- builders outrank the bills

        // A recycler bench wired to its own power, in a room with a stub tile to build on.
        private static readonly string[] ShopMap =
        {
            "########",
            "#......#",
            "#......#",
            "#####.##",
            "##### ##",
            "########",
        };

        private static readonly Int3 StubSite = new Int3(5, 3, 0);

        private static Simulation NewShop(bool withBuildSystem, out BuildSystem build)
        {
            var full = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            build = null;
            foreach (var s in full)
                if (s is BuildSystem b) { build = b; break; }

            ISimSystem[] systems = full;
            if (!withBuildSystem)
            {
                var kept = new List<ISimSystem>(full.Length);
                foreach (var s in full) if (!(s is BuildSystem)) kept.Add(s);
                systems = kept.ToArray();
                build = null;
            }

            var sim = new Simulation(AsciiWorld.Build(ShopMap), 7, systems);
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit_a");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 2, 0), "conduit_b");
            sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(2, 2, 0), "recycler");
            sim.AddCitizen("Worker", new Int3(3, 2, 0));
            return sim;
        }

        private static int RegolithUnits(Simulation sim)
        {
            int n = 0;
            foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Regolith) n += it.Count;
            return n;
        }

        [Test]
        public void CraftingWithoutABuildSystem_BehavesExactlyAsBefore()
        {
            // The build-priority gate must be invisible to a stack that has no BuildSystem:
            // the standing bill still recruits, fetches and eats its input.
            var sim = NewShop(withBuildSystem: false, out var build);
            Assert.That(build, Is.Null, "precondition: no BuildSystem in this stack");
            sim.AddItem(ItemKind.Regolith, 2, new Int3(4, 2, 0));

            for (int t = 0; t < 3000 && RegolithUnits(sim) > 0; t++) sim.Tick();
            Assert.That(RegolithUnits(sim), Is.LessThan(2), "the recycler still consumes its input");
        }

        [Test]
        public void CraftingWithABuildSystemButNoPendingSites_BehavesExactlyAsBefore()
        {
            // Same stack, BuildSystem present but idle: the gate is scoped to actual demand,
            // not to the mere presence of the system.
            var sim = NewShop(withBuildSystem: true, out var build);
            Assert.That(build.Pending, Is.Empty);
            sim.AddItem(ItemKind.Regolith, 2, new Int3(4, 2, 0));

            for (int t = 0; t < 3000 && RegolithUnits(sim) > 0; t++) sim.Tick();
            Assert.That(RegolithUnits(sim), Is.LessThan(2), "an idle BuildSystem changes nothing");
        }

        [Test]
        public void PendingBuild_OutranksTheRecyclersStandingBill()
        {
            // The root cause of the reported bug, reproduced in miniature: a wall needs two
            // units and the ship has exactly two, as two separate stacks. The builder can only
            // carry one at a time, so between his trips the recycler's standing bill recruits
            // the OTHER idle crewman and eats the second unit — the site then sits at 1/2
            // forever, because nothing ever un-deposits. With builders outranking the bill the
            // hauler simply makes a second trip.
            var sim = NewShop(withBuildSystem: true, out var build);
            sim.AddCitizen("Second", new Int3(4, 2, 0)); // the bill's would-be fetcher
            sim.AddItem(ItemKind.Regolith, 1, new Int3(6, 2, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(6, 1, 0));
            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall), Is.True);

            for (int t = 0; t < 5000 && build.Pending.Count > 0; t++) sim.Tick();

            bool stillPending = build.TryGet(StubSite, out var stuck);
            Assert.That(stillPending, Is.False,
                $"the wall must win the material — stranded at {stuck.Delivered}/{stuck.Required}");
            Assert.That(sim.World.GetWall(StubSite), Is.EqualTo(TileDefs.Wall));
            int scrap = 0;
            foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Scrap) scrap += it.Count;
            Assert.That(scrap, Is.Zero, "no material was recycled out from under the builder");
        }

        [Test]
        public void ScarceMaterial_FinishesOneSiteInsteadOfStrandingSeveral()
        {
            // Three designations, two units of material. The old boolean "some free material
            // exists" pursued EVERY needy site, so two of them took a unit each and both froze
            // at 1/2 with nothing built. Counting units means one site gets the whole cost and
            // completes; the others wait at 0/2 for material that may yet be dug.
            var sim = NewShop(withBuildSystem: true, out var build);
            var sites = new[] { new Int3(4, 1, 0), new Int3(5, 1, 0), new Int3(6, 1, 0) };
            foreach (var s in sites)
                Assert.That(build.Designate(sim, s, BuildKind.Wall), Is.True);
            sim.AddItem(ItemKind.Regolith, 1, new Int3(6, 2, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(5, 2, 0));

            for (int t = 0; t < 5000; t++) sim.Tick();

            int built = 0, stranded = 0;
            foreach (var s in sites)
            {
                if (sim.World.GetWall(s) == TileDefs.Wall) built++;
                if (build.TryGet(s, out var b) && b.Delivered > 0 && b.Delivered < b.Required) stranded++;
            }
            Assert.That(stranded, Is.Zero, "no site is left holding material it can never finish with");
            Assert.That(built, Is.EqualTo(1), "the material that exists finishes exactly one wall");
        }

        [Test]
        public void BuildPriorityGate_IsZeroAllocInSteadyState()
        {
            // The gate adds a per-pass scan of the pending list to CraftingSystem; the tick
            // path must stay allocation-free (hard invariant).
            var build = new BuildSystem();
            var sim = new Simulation(AsciiWorld.Build(ShopMap), 5,
                new ISimSystem[] { new JobSystem(), build, new CraftingSystem() });
            sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(2, 2, 0), "recycler");
            sim.AddCitizen("Idle", new Int3(3, 2, 0)); // AutoWander false → never self-moves
            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall), Is.True); // standing demand, no material

            for (int i = 0; i < 200; i++) sim.Tick(); // warm-up

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) sim.Tick();
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0),
                $"steady-state crafting/build pass must be zero-alloc, saw {delta} bytes");
        }
    }
}
