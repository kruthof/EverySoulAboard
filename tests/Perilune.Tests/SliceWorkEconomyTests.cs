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
    /// instead of degrading into "they just walk around". Read the census test's scope note
    /// before quoting it: it guards the BOOT WINDOW, not a durable work economy — the aft dig
    /// is a one-off and the crew do run out of work later. That is a design limitation on
    /// record, not something these tests paper over.
    /// </summary>
    public class SliceWorkEconomyTests
    {
        /// <summary>Ten sim-minutes — the BOOT WINDOW the census test samples. Pre-E0-2 this was
        /// long enough for the aft dig to FINISH; after the E0-2 work-rate rebase a single dig is
        /// 6000 work ticks, so 6000 ticks now covers only the OPENING of the dig-out (the field is
        /// not cleared until ~t61493 — see JobDispatchTests' saturation sequence). Kept at 6000: it
        /// still proves the crew take work and the dig fires in the stretch a player first watches,
        /// which is all the census test asserts.</summary>
        private const int WorkWindowTicks = 6000;

        private static Simulation NewSlice(out BuildSystem build)
        {
            // M2-2 (OD-H): this whole file measures what a WORKING crew gets done on the slice —
            // build throughput, bench arbitration, the boot window's busy fraction. With the
            // shipped grid every number is zero for one reason, and it is not the one under test.
            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim.GiveAllCrewAllWork();
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
        public void CrewWorkTheBootWindow_FirstTenSimMinutes()
        {
            // SCOPE, stated plainly: this guards the BOOT WINDOW only — the first ten sim-minutes,
            // which is the stretch a player watches after loading the slice and the stretch that
            // used to be dead (6.4% of crew-ticks, all of it the recycler, zero Dig/Haul/Build in
            // three sim-days). Threshold: a fifth of live crew-ticks on a job.
            //
            // It is NOT evidence of a durable work economy, and must not be quoted as one. The aft
            // dig is a ONE-OFF: 48 tiles of debris and once they are cleared and the spoil recycled
            // there is nothing left to do. The slice has no renewable labour — a real design
            // limitation, not a test defect; the fix is a standing source of work (P3's business).
            //
            // The specific cumulative-fraction figures once cited here (39.5% at 10 sim-min, 28.9%
            // at 60, 10.4% at 180, 4.3% at 432) were measured PRE-E0-2, when a dig was 60 ticks and
            // the field cleared in under four sim-minutes. E0-2 rebased dig to 6000 ticks and
            // movement to 10 ticks/tile, so the SAME 48-tile field now occupies the crew for the
            // span of a shift (last dig assigned ~t61493, JobDispatchTests) — the decay is far
            // slower and the old percentages no longer describe it. This test asserts only the
            // floor (a fifth of crew-ticks on a job, and the dig fires); it does not pin the curve.
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
                $"the boot window must not be dead — saw {fraction:P1} of {live} crew-ticks on a job");
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

        private static Simulation NewShop(bool withBuildSystem, out BuildSystem build, SimDefs defs = null)
        {
            var full = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            build = null;
            foreach (var s in full)
                if (s is BuildSystem b) { build = b; break; }

            // E0-2: drop NeedsSystem from this micro-map bench. The work-rate rebase makes a wall
            // 2400 ticks and a recycle batch 6000 (were 60/200), and a crew in this unpressurized
            // shop suffocates in ~900 ticks — the old tests only passed by finishing first. The
            // build-priority / material-conservation mechanics under test are orthogonal to
            // suffocation; the slice-level tests (NewSlice) keep the full stack and its survival.
            var keptNeeds = new List<ISimSystem>(full.Length);
            foreach (var s in full)
            {
                if (s is NeedsSystem) continue;
                if (!withBuildSystem && s is BuildSystem) { continue; }
                keptNeeds.Add(s);
            }
            if (!withBuildSystem) build = null;
            ISimSystem[] systems = keptNeeds.ToArray();

            var sim = new Simulation(AsciiWorld.Build(ShopMap), 7, systems, defs);
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit_a");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 2, 0), "conduit_b");
            sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(2, 2, 0), "recycler");
            sim.AddCitizen("Worker", new Int3(3, 2, 0)).GiveAllWork();
            return sim;
        }

        /// <summary>Units of Regolith one SalvageRecycler batch consumes, READ OFF THE SHIPPED
        /// BILL rather than typed as a literal (E0-6 moved it 1 -> 4, and a literal here would have
        /// to be chased again the next time the ratio is retuned). Every shop test that wants the
        /// bench to actually run stages exactly this much.</summary>
        private static int RecyclerBatch
        {
            get
            {
                Assert.That(ProductionDefs.TryGetBill(SimDefs.Default, DeviceKind.SalvageRecycler, out var bill), Is.True);
                return bill.Input(0).Count;
            }
        }

        private static int RegolithUnits(Simulation sim)
        {
            int n = 0;
            foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Regolith) n += it.Count;
            return n;
        }

        private static int ScrapUnits(Simulation sim)
        {
            int n = 0;
            foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Scrap) n += it.Count;
            return n;
        }

        private static Device DeviceNamed(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            return null;
        }

        [Test]
        public void CraftingWithoutABuildSystem_BehavesExactlyAsBefore()
        {
            // The build-priority gate must be invisible to a stack that has no BuildSystem:
            // the standing bill still recruits, fetches and eats its input.
            var sim = NewShop(withBuildSystem: false, out var build);
            Assert.That(build, Is.Null, "precondition: no BuildSystem in this stack");
            // E0-6: the recycler's batch is FOUR Regolith (Regolith:4 -> Scrap:3), not one.
            sim.AddItem(ItemKind.Regolith, RecyclerBatch, new Int3(4, 2, 0));

            for (int t = 0; t < 3000 && RegolithUnits(sim) > 0; t++) sim.Tick();
            Assert.That(RegolithUnits(sim), Is.Zero, "the recycler still consumes its input");
        }

        [Test]
        public void CraftingWithABuildSystemButNoPendingSites_BehavesExactlyAsBefore()
        {
            // Same stack, BuildSystem present but idle: the gate is scoped to actual demand,
            // not to the mere presence of the system.
            var sim = NewShop(withBuildSystem: true, out var build);
            Assert.That(build.Pending, Is.Empty);
            sim.AddItem(ItemKind.Regolith, RecyclerBatch, new Int3(4, 2, 0));

            for (int t = 0; t < 3000 && RegolithUnits(sim) > 0; t++) sim.Tick();
            Assert.That(RegolithUnits(sim), Is.Zero, "an idle BuildSystem changes nothing");
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
            sim.AddCitizen("Second", new Int3(4, 2, 0)).GiveAllWork(); // the bill's would-be fetcher
            sim.AddItem(ItemKind.Regolith, 1, new Int3(6, 2, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(6, 1, 0));
            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall), Is.True);

            // E0-2: WallConstructTicks 60→2400 (plus slower haul/travel), so the budget is widened.
            for (int t = 0; t < 10000 && build.Pending.Count > 0; t++) sim.Tick();

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

            // E0-2: WallConstructTicks 60→2400 (plus slower haul/travel), so the budget is widened.
            for (int t = 0; t < 10000; t++) sim.Tick();

            int built = 0, stranded = 0;
            foreach (var s in sites)
            {
                if (sim.World.GetWall(s) == TileDefs.Wall) built++;
                if (build.TryGet(s, out var b) && b.Delivered > 0 && b.Delivered < b.Required) stranded++;
            }
            Assert.That(stranded, Is.Zero, "no site is left holding material it can never finish with");
            Assert.That(built, Is.EqualTo(1), "the material that exists finishes exactly one wall");
        }

        // ------------------------------------------- ...but an unfundable site owns nothing

        [Test]
        public void UnderFundedSite_DoesNotKillTheCraftingChainForever()
        {
            // The gate must never hold material hostage for a site a builder CANNOT work.
            // JobSystem refuses a site unless the whole remainder is free at once; if the bills
            // stopped for "any site is short", the exact set of sites JobSystem gave up on would
            // block every bench for the rest of the game — a site only leaves Pending via
            // Complete or a player Cancel. One wall (needs two) and one loose unit was enough:
            // recycler dead, so Fabricator and MachineShop dead, so no Parts, so MachineWear
            // jury-rigs every repair at 0.6 forever. No player signal, no way back.
            // E0-6 FORCED THIS SETUP TO CHANGE, and the change is stated rather than tuned away.
            // The scenario needs free stock that is ENOUGH FOR A RECYCLE BATCH and STILL NOT ENOUGH
            // FOR THE WALL. Before E0-6 a batch was one unit and a wall two, so "1 loose unit" said
            // both at once; a batch is now four (Regolith:4 -> Scrap:3), so the wall has to be the
            // expensive side. wall_material is raised to batch+1 — the smallest value that keeps the
            // site strictly unfundable — and NOTHING ELSE about the test moves.
            var defs = SimDefs.CreateDefault();
            defs.Build.WallMaterial = RecyclerBatch + 1;
            var sim = NewShop(withBuildSystem: true, out var build, defs);
            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall), Is.True);
            Assert.That(build.TryGet(StubSite, out var site), Is.True);
            sim.AddItem(ItemKind.Regolith, RecyclerBatch, new Int3(6, 2, 0));
            Assert.That(site.Required, Is.GreaterThan(RegolithUnits(sim)),
                "precondition: the ship's whole free stock is STRICTLY LESS than the site needs, so " +
                "JobSystem can never work it — the state the gate must not hold matter hostage in");
            Assert.That(RegolithUnits(sim), Is.GreaterThanOrEqualTo(RecyclerBatch),
                "precondition: ...and yet it IS enough for one recycle batch, or the bench could " +
                "never run and 'scrap > 0' would be measuring the batch size, not the gate");

            // E0-2: SalvageRecycler WorkSeconds 20→600; E0-6: the batch is 4 units at 2400 s, so a
            // completed batch is 24 000 work ticks. Widen the budget to match.
            int scrap = 0;
            for (int t = 0; t < 40000 && scrap == 0; t++) { sim.Tick(); scrap = ScrapUnits(sim); }

            Assert.That(scrap, Is.GreaterThan(0),
                "an under-funded designation must not stop the recycler — the salvage chain has to keep running");
            Assert.That(build.TryGet(StubSite, out var after), Is.True,
                "the designation still stands (nothing cancels it behind the player's back)");
            Assert.That(after.Delivered, Is.Zero, "and it never took a partial delivery it could not finish");
        }

        // ------------------------------------------- the long haul: races made deterministic

        // A bench at one end of a long bay and the build site at the other. The distance is the
        // point: a hauler's round trip is hundreds of ticks, so any moment the gate wrongly
        // opens is a moment the bills can actually take the material — in the cramped ShopMap
        // above the same mistakes are hidden by luck (the bench worker reaches the stack but the
        // gate slams shut again before his next settled pass). Nothing here depends on that.
        private static readonly string[] LongBayMap =
        {
            "######################",
            "#....................#",
            "#....................#",
            "######################",
        };

        private static readonly Int3 FarSite = new Int3(19, 2, 0); // ~17 tiles from the bench

        private static Simulation NewLongBay(out BuildSystem build, SimDefs defs = null)
        {
            var full = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            build = null;
            foreach (var s in full) if (s is BuildSystem b) { build = b; break; }
            // E0-2: drop NeedsSystem — see NewShop. A far-site wall now takes 2400 ticks plus a
            // long two-trip haul across the bay, far past the suffocation window in this
            // unpressurized map; the in-flight-material mechanic under test is orthogonal.
            var kept = new List<ISimSystem>(full.Length);
            foreach (var s in full) if (!(s is NeedsSystem)) kept.Add(s);
            var systems = kept.ToArray();
            var sim = new Simulation(AsciiWorld.Build(LongBayMap), 7, systems, defs);
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit_a");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 2, 0), "conduit_b");
            sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(2, 2, 0), "recycler");
            sim.AddCitizen("Hauler", new Int3(3, 2, 0)).GiveAllWork();
            sim.AddCitizen("Bench", new Int3(3, 1, 0)).GiveAllWork();
            return sim;
        }

        [Test]
        public void MaterialInFlightToASite_StaysProtectedFromTheBills()
        {
            // JobSystem takes ONE stack per trip, so a two-unit wall funded by two one-unit
            // stacks spends a whole round trip with only half its cost still on the floor. A
            // gate that looked at free units alone would drop for exactly that window and the
            // standing bill would eat trip two — the site freezes at 1/2, and nothing ever
            // un-deposits. Counting the units already reserved by (or in the hands of) a hauler
            // bound for THIS site is what closes it.
            var sim = NewLongBay(out var build);
            Assert.That(build.Designate(sim, FarSite, BuildKind.Wall), Is.True);
            Assert.That(build.TryGet(FarSite, out var site), Is.True);
            Assert.That(site.Required, Is.EqualTo(2), "precondition: two units, therefore two trips");
            sim.AddItem(ItemKind.Regolith, 1, new Int3(4, 2, 0)); // both stacks sit AT the bench end,
            sim.AddItem(ItemKind.Regolith, 1, new Int3(5, 2, 0)); // seconds from the recycler's fetcher

            // E0-2: WallConstructTicks 60→2400 + ticks_per_tile 5→10 over a ~17-tile bay (two
            // round trips), so the budget is widened well past the new construct+haul time.
            for (int t = 0; t < 15000 && build.Pending.Count > 0; t++) sim.Tick();

            Assert.That(build.TryGet(FarSite, out var stuck), Is.False,
                $"the site must keep the material promised to it — stranded at {stuck.Delivered}/{stuck.Required}");
            Assert.That(sim.World.GetWall(FarSite), Is.EqualTo(TileDefs.Wall), "the wall is standing");
            Assert.That(ScrapUnits(sim), Is.Zero, "the bill never got a unit the builder was owed");
        }

        [Test]
        public void RetunedMultiUnitRecipe_HalfStagedBench_NeverOutbidsABuilder()
        {
            // Why FetchBlockedForBuilds has no half-staged carve-out. Against the shipped table
            // the carve-out was dead code: SalvageRecycler eats one unit per batch, so at every
            // call site "cannot start" already means "nothing staged". Retune in_count to two and
            // it wakes up on the wrong side — a bench holding one unit is exempted from the gate
            // and takes the second stack a hauler is already halfway to spending, consuming both
            // and stranding the wall at 1/2 for good. Deleting the term costs nothing today and
            // cannot strand the bench either: the demand gate releases the moment no site can be
            // funded, so the half-staged batch always gets its turn.
            var defs = SimDefs.CreateDefault();
            defs.Recipes[(int)DeviceKind.SalvageRecycler] = new RecipeDef(ItemKind.Regolith, 2, ItemKind.Scrap, 2, 20);
            var sim = NewLongBay(out var build, defs);

            // Phase 1 — no designations: the bench fetches the one unit aboard and parks
            // half-staged, because its retuned batch wants two.
            sim.AddItem(ItemKind.Regolith, 1, new Int3(4, 2, 0));
            for (int t = 0; t < 300; t++) sim.Tick();
            Assert.That(ScrapUnits(sim), Is.Zero, "one unit cannot complete a two-unit batch");
            Assert.That(RegolithUnits(sim), Is.EqualTo(1), "the unit is still aboard...");
            // B-1: the bench stages it as the station's own claim, but a batch that can never be
            // completed is DEAD — the station releases the claim so the unit re-enters the pool.
            // (Under the old ownerless bool it leaked here and stayed reserved by nobody forever.)
            Assert.That(sim.Items.Items[0].ReservedBy, Is.EqualTo(0u),
                "...and, the batch being uncompletable, freed back to the pool rather than stranded");

            // Phase 2 — the player designates a far wall and exactly its cost arrives, in the
            // two stacks that force two trips, right under the half-staged bench's nose.
            Assert.That(build.Designate(sim, FarSite, BuildKind.Wall), Is.True);
            sim.AddItem(ItemKind.Regolith, 1, new Int3(5, 2, 0));
            sim.AddItem(ItemKind.Regolith, 1, new Int3(6, 2, 0));

            // E0-2: WallConstructTicks 60→2400 + ticks_per_tile 5→10 over the ~17-tile bay, so widen.
            for (int t = 0; t < 15000 && build.Pending.Count > 0; t++) sim.Tick();

            Assert.That(build.TryGet(FarSite, out var stuck), Is.False,
                $"the builder must win both stacks — stranded at {stuck.Delivered}/{stuck.Required}");
            Assert.That(sim.World.GetWall(FarSite), Is.EqualTo(TileDefs.Wall), "the wall is standing");
            Assert.That(ScrapUnits(sim), Is.Zero,
                "the half-staged bench never completed a batch off the builder's material");
        }

        [Test]
        public void StationClaimOnAHalfStagedInput_IsReleasedWhenTheBatchGoesDead()  // B-1
        {
            // THE B-1 LEAK, isolated. A crafting station stamps a staged input with its own claim
            // so the haul board can't drag it off mid-batch. Before the fix that claim had NO
            // owner and its ONLY release was ConsumeStagedInputs — never reached by a half-staged
            // batch — so the last unit was reserved by NOBODY forever: invisible to the haul board
            // and to MachineWearSystem.FindNearestParts, yet still counted 1/2 staged, so the bench
            // waited at 1/2 and every repair jury-rigged. With ReservedBy owning the claim, a dead
            // batch (no worker, nothing left to fetch) frees it and the unit re-enters the pool.
            var defs = SimDefs.CreateDefault();
            defs.Recipes[(int)DeviceKind.SalvageRecycler] = new RecipeDef(ItemKind.Regolith, 2, ItemKind.Scrap, 2, 20);
            var sim = NewLongBay(out _, defs);
            Assert.That(sim.TryGetDeviceAt(new Int3(2, 2, 0), out var recycler), Is.True,
                "precondition: the recycler is where NewLongBay places it");

            var unit = sim.AddItem(ItemKind.Regolith, 1, new Int3(4, 2, 0));

            // The bench stages the one unit aboard as the STATION's own claim (owned, not a bare
            // flag): prove that window is real before proving the release.
            bool sawStationClaim = false;
            for (int t = 0; t < 600 && !sawStationClaim; t++)
            {
                sim.Tick();
                if (sim.Items.TryGet(unit.Id, out var s) && s.ReservedBy == recycler.Id) sawStationClaim = true;
            }
            Assert.That(sawStationClaim, Is.True,
                "the staged input is claimed by the STATION id — an owned reservation, not an ownerless flag");

            // The retuned batch wants two units and only one exists, so it can never complete:
            // a dead half-staged batch must free its input rather than strand it forever.
            for (int t = 0; t < 300; t++) sim.Tick();
            Assert.That(sim.Items.TryGet(unit.Id, out var freed), Is.True, "the unit is still aboard (nothing consumed it)");
            Assert.That(ScrapUnits(sim), Is.Zero, "one unit cannot complete a two-unit batch");
            // ReservedBy == 0 && CarriedBy == 0 on a ground stack IS the exact skip-predicate the
            // haul board (HaulJobSource), the build source and MachineWearSystem.FindNearestParts
            // all gate on — so this is precisely "visible again to every consumer", not a proxy.
            Assert.That(freed.ReservedBy, Is.EqualTo(0u), "the dead half-staged batch freed its input (the B-1 leak)");
            Assert.That(freed.CarriedBy, Is.EqualTo(0u), "and it sits on the ground, back in the pool");

            // Stable: the freed unit is NOT re-leaked on subsequent passes (the release is idempotent,
            // and with no un-staged unit to fetch the station never re-claims it).
            for (int t = 0; t < 300; t++) sim.Tick();
            Assert.That(sim.Items.TryGet(unit.Id, out var still), Is.True);
            Assert.That(still.ReservedBy, Is.EqualTo(0u), "the freed unit stays free — no re-leak, no thrash");
        }

        [Test]
        public void BuildPriorityGate_IsZeroAllocInSteadyState()
        {
            // The gate scans the pending list, the item store and (when free units alone can't
            // fund a site) the citizen store, once per crafting pass; the tick path must stay
            // allocation-free (hard invariant).
            //
            // The measured window must actually REACH that code, so the setup is deliberate:
            // the bench is powered and operational (Device.Powered defaults true and no
            // PowerSystem is registered — asserted below so a default flip can't silently turn
            // this test into a no-op), it has a staging tile, and one pending site wants two
            // units against zero free ones, which is exactly the case that walks both scans.
            // The warm-up feeds it a single unit first, so the full fetch/carry/craft cycle
            // (the allocating paths, if any) is behind us before the counter starts.
            var build = new BuildSystem();
            var gateDefs = SimDefs.CreateDefault();
            gateDefs.Build.WallMaterial = RecyclerBatch + 1;
            var sim = new Simulation(AsciiWorld.Build(ShopMap), 5,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), build, new CraftingSystem() },
                gateDefs);
            var bench = sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(2, 2, 0), "recycler");
            sim.AddCitizen("Idle", new Int3(3, 2, 0)).GiveAllWork(); // AutoWander false → never self-moves
            Assert.That(build.Designate(sim, StubSite, BuildKind.Wall), Is.True); // standing demand
            // Same E0-6 adjustment as UnderFundedSite above: enough for one batch, never enough for
            // the wall, so the warm-up really completes a batch and the measured window really sits
            // in the both-scans state.
            sim.AddItem(ItemKind.Regolith, RecyclerBatch, new Int3(6, 2, 0));

            Assert.That(bench.Powered && bench.IsOperational(sim.Defs), Is.True,
                "precondition: the bench must be live, or TickStation returns before the gate");

            // E0-2: SalvageRecycler WorkSeconds 20→600; E0-6: 4 units at 2400 s = 24 000 work
            // ticks per batch, so the warm-up must run long enough to fetch and complete one.
            for (int i = 0; i < 30000; i++) sim.Tick(); // warm-up: the stock is fetched and recycled
            Assert.That(ScrapUnits(sim), Is.GreaterThan(0),
                "the bench really ran — the gate was reached, evaluated and released");
            Assert.That(build.TryGet(StubSite, out var still), Is.True);
            Assert.That(still.Delivered, Is.Zero, "steady state: a 0/N site with nothing to fund it");

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) sim.Tick();
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0),
                $"steady-state crafting/build pass must be zero-alloc, saw {delta} bytes");
        }
    }
}
