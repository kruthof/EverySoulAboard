using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Threading;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Tui;      // SimHost
using Perilune.Web;      // GameSession, WebCommand, CmdKind
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-6 — conversion loss, <see cref="ItemKind.Seals"/>, and
    /// <see cref="ItemKind.ControllerModule"/>'s one consumer.
    ///
    /// THE PROBLEM THIS PACKAGE EXISTS FOR (MECHANICS §13.15): every scrap of finite matter aboard
    /// converted up the ladder into ControllerModules that NOTHING consumed, so the economy
    /// terminated permanently at ~sim-hour 28 on every ship. Two things were wrong at once and the
    /// package fixes both: the ladder's second hop <b>created</b> matter (1 Regolith → 2 Scrap,
    /// against ECONOMY.md §2.1's closed box), and its terminal product had no sink.
    ///
    /// EVERY TEST BELOW IS DRIVEN. The sim is really ticked and observable state is asserted —
    /// items produced and consumed, Device.Condition, Device.Scriptable, what the MOSS
    /// <see cref="DeviceRegistry"/> can resolve after the REAL
    /// <see cref="MossBindings.RegisterAdapters"/> ran. Nothing here re-derives an expected value
    /// with the same expression the code uses (ECONOMY-PLAN §5.2 rule 1), and every test names a
    /// mutation that makes it fail (rule 2). Each named mutation was APPLIED, observed red, and
    /// reverted; the mutation table is in the package report.
    ///
    /// NO LITERAL PIN VALUE IS ASSERTED ANYWHERE IN THIS FILE (ECONOMY-PLAN §2.1 rule 4). The
    /// determinism claims below are "the twins MATCH" and "the hash MOVED", never "the hash is
    /// 0x…" — a literal measured in a lane is stale the moment a sibling lane merges, and the
    /// integrator owns the re-pin.
    /// </summary>
    public class ConversionLossSealsTests
    {
        // ═══════════════════════════════════════════════════════════════════════════ helpers

        private const int MaintainableKindTicks = 20000;

        /// <summary>
        /// A powered single-bench workshop. The bench sits at (3,2,0); its 4-neighbours are (2,2)
        /// and (4,2) plus the conduit row above, so cargo dropped at (1,2) or (5,2) has to be
        /// genuinely FETCHED and cargo at (4,2) is already staged.
        /// </summary>
        private static Simulation BuildBench(DeviceKind bench, SimDefs defs = null, ulong seed = 42)
        {
            string[] map =
            {
                "#######",
                "#.....#",
                "#.....#",
                "#######",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), seed, SystemStack.CreateDefault(moss), defs);

            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(bench, new Int3(3, 2, 0), "bench");

            sim.AddCitizen("Smith", new Int3(1, 2, 0)); // AutoWander false → recruitable, never strays

            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        private static int Units(Simulation sim, ItemKind kind)
        {
            int n = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++) if (items[i].Kind == kind) n += items[i].Count;
            return n;
        }

        private static void Run(Simulation sim, int ticks)
        {
            for (int t = 0; t < ticks; t++) sim.Tick();
        }

        private static Device DeviceNamed(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            return null;
        }

        /// <summary>Total units a bill takes in / puts out per batch, over its ports.</summary>
        private static int SumIn(in ProductionBill b)
        {
            int n = 0;
            for (int i = 0; i < b.InputPortCount; i++) n += b.Input(i).Count;
            return n;
        }

        private static int SumOut(in ProductionBill b)
        {
            int n = 0;
            for (int i = 0; i < b.OutputPortCount; i++) n += b.Output(i).Count;
            return n;
        }

        // ══════════════════════════════════════════════════ 1. CONVERSION LOSS (the axiom)

        /// <summary>
        /// THE HEADLINE, DRIVEN: the recycler returns strictly LESS than it took. Four Regolith go
        /// in, three Scrap come out, and no Regolith is left — the units are counted off the real
        /// sim after the real CraftingSystem ran a real batch.
        ///
        /// The pre-E0-6 row did the opposite: one Regolith became TWO Scrap, which is where roughly
        /// half of the shipped economy's matter came from.
        ///
        /// PATH ASSERTED BEFORE OUTCOME (§5.2 rule 3): the Regolith must actually be gone, or "3
        /// Scrap" could be true of a bench that never ran and a hand-placed stack.
        ///
        /// NAMED MUTATION: in <see cref="SimDefs.CreateDefault"/> set recycle_stock's output to
        /// <c>new ProductionPort(ItemKind.Scrap, 4)</c> (a lossless recycler) — the strict-less
        /// assertion fails by name.
        /// </summary>
        [Test]
        public void Recycler_ReturnsStrictlyLessMatterThanItConsumed()
        {
            var sim = BuildBench(DeviceKind.SalvageRecycler);
            Assert.That(ProductionDefs.TryGetBill(sim.Defs, DeviceKind.SalvageRecycler, out var bill), Is.True);
            Assert.That(bill.IsGraphNode, Is.True, "premise: the recycler runs the [production] node");

            int batch = bill.Input(0).Count;
            sim.AddItem(ItemKind.Regolith, batch, new Int3(5, 2, 0)); // must be fetched
            Assert.That(Units(sim, ItemKind.Scrap), Is.Zero, "premise: no Scrap aboard to start with");

            // Batch work is WorkSeconds x 10 ticks; add room for the fetch legs.
            Run(sim, bill.WorkSeconds * Simulation.TicksPerSecond + 5000);

            Assert.That(Units(sim, ItemKind.Regolith), Is.Zero,
                "the batch really ran — the staged input was consumed");
            int produced = Units(sim, ItemKind.Scrap);
            Assert.That(produced, Is.GreaterThan(0), "and it really produced something");
            Assert.That(produced, Is.LessThan(batch),
                "ECONOMY.md §2.1: every hop must return LESS than it took. " + batch +
                " Regolith produced " + produced + " Scrap.");
        }

        /// <summary>
        /// The same claim over the WHOLE shipped ladder, read off the resolved bills rather than one
        /// bench: no station anywhere may return more units than it consumes, and the ladder as a
        /// whole must lose matter.
        ///
        /// This is the guard the pre-E0-6 tree would have failed: <c>Regolith:1 → Scrap:2</c> is
        /// <c>SumOut &gt; SumIn</c>, in the shipped defaults, and nothing in the repo said so.
        ///
        /// NON-VACUITY: it asserts it actually FOUND all three crafting stations first — a
        /// "no station creates matter" loop over an empty set is the emptiest possible pass.
        ///
        /// NAMED MUTATION: restore the pre-E0-6 recycler row (<c>Regolith:1 → Scrap:2</c>) in
        /// <see cref="SimDefs.CreateDefault"/> — the SalvageRecycler leg fails and names it.
        /// </summary>
        [Test]
        public void NoShippedStation_ReturnsMoreUnitsThanItConsumes()
        {
            var defs = SimDefs.Default;
            var stations = new[] { DeviceKind.SalvageRecycler, DeviceKind.Fabricator, DeviceKind.MachineShop };
            int seen = 0;
            int strictlyLossy = 0;

            foreach (var station in stations)
            {
                Assert.That(ProductionDefs.TryGetBill(defs, station, out var bill), Is.True,
                    station + " must have a bill — this test is about the shipped ladder");
                seen++;
                int inUnits = SumIn(bill);
                int outUnits = SumOut(bill);
                Assert.That(outUnits, Is.LessThanOrEqualTo(inUnits),
                    station + " returns " + outUnits + " units for " + inUnits +
                    " — that is matter creation (ECONOMY.md §2.1), whatever the kinds are called");
                if (outUnits < inUnits) strictlyLossy++;
            }

            Assert.That(seen, Is.EqualTo(3), "non-vacuity: all three crafting stations were measured");
            Assert.That(strictlyLossy, Is.GreaterThan(0),
                "a ladder in which every hop merely BREAKS EVEN is not a lossy ladder");

            // AND THE LEGACY ARRAY ON ITS OWN. TryGetBill prefers the [production] node, so the
            // loop above never reads Recipes[SalvageRecycler] — and that row shipped as
            // Regolith:1 -> Scrap:2, i.e. the mass creation E0-6 removed, still reachable through
            // the fallback leg by any defs set that declares an EMPTY [production] section. The
            // DefsParser guard does NOT cover that case (it covers "no [production] SECTION at
            // all"), so the row itself had to move, and this is what says it did.
            int legacySeen = 0;
            for (int k = 0; k < defs.Recipes.Length; k++)
            {
                var r = defs.Recipes[k];
                if (!r.Defined) continue;
                legacySeen++;
                Assert.That(r.OutputCount, Is.LessThanOrEqualTo(r.InputCount),
                    "[recipes] row for " + (DeviceKind)k + " returns " +
                    r.OutputCount.ToString(CultureInfo.InvariantCulture) + " for " +
                    r.InputCount.ToString(CultureInfo.InvariantCulture) +
                    ". The fallback leg is as much of the shipped ladder as the node table is.");
            }
            Assert.That(legacySeen, Is.EqualTo(3), "non-vacuity: all three legacy rows were measured");
        }

        /// <summary>
        /// THE CONSERVATION PROPERTY TEST (ECONOMY-PLAN §5.1, mandatory and until now written
        /// nowhere). Driven on the shipped slice for THREE SIM-DAYS: at no sample does the ship
        /// hold more units of the metal ladder than it started with plus everything it has dug.
        ///
        /// WHY IT IS SCOPED TO THE METAL LADDER, stated rather than glossed. "Total units aboard"
        /// is NOT non-increasing and never was: hydroponics grows <c>Potato</c> and a death mints a
        /// <c>Corpse</c>, both genuine sources with nothing to do with conversion. The closed-box
        /// axiom (ECONOMY.md §2.1) is a claim about the CONVERSION LADDER, so that is what is
        /// measured — Regolith · MetalOre · Scrap · Parts · Seals · ControllerModule — against its
        /// one in-sim source, the debris field (<c>DigJobSource</c>, one Regolith per cleared
        /// tile).
        ///
        /// THIS IS THE TEST THAT WOULD HAVE CAUGHT THE PRE-E0-6 DEFECT AT THE SYSTEM LEVEL. The
        /// shipped SalvageRecycler row turned 1 Regolith into 2 Scrap; against this invariant that
        /// is a runaway — the ladder mints a unit per batch out of nothing — and it is caught by
        /// running the ship rather than by reading a defs row. Measured with main's ratio restored: it
        /// fires at tick 30 000 (50 sim-minutes), holding 32 units against a budget of 31.
        ///
        /// NON-VACUITY IS TWO ASSERTIONS, NOT ONE, AND THE FIRST DRAFT GOT THIS WRONG. It claimed
        /// that "ends strictly below budget" closes the do-nothing hole because <i>"never more than
        /// X is satisfied by a ship that never converts anything"</i>. True in the abstract,
        /// <b>false of this ship</b>, and measured: with the recycler's <c>work_s</c> multiplied by
        /// 1000 so that NO BATCH COMPLETES in three sim-days, the strict-below assertion stays
        /// GREEN. Two structural reasons, both real:
        ///
        ///   1. <c>MaintenanceSystem</c> burns <see cref="ItemKind.Parts"/> — a genuine drain with
        ///      nothing to do with conversion — so the ledger falls below budget on a ship whose
        ///      ladder never runs at all.
        ///   2. <c>CraftingSystem</c> consumes staged inputs at batch START (<c>Progress &lt;= 0f</c>),
        ///      so a batch that never completes has already destroyed its 4 Regolith into an
        ///      in-flight void that <see cref="MetalUnits"/> cannot see.
        ///
        /// So strict-below excludes an INERT ship but does not require the CONVERSION LADDER to
        /// have run, which is what the claim needed. The assertion that actually closes it is the
        /// third one: the ladder's COMPOSITION must have changed — a terminal
        /// <see cref="ItemKind.ControllerModule"/> exists, which no amount of maintenance or
        /// in-flight staging can produce and which requires all three hops
        /// (Regolith → Scrap → Parts → ControllerModule) to have completed at least once.
        ///
        /// LIMITS, meant literally and in the name:
        ///   * ONE SEED, ONE SHIP, ONE RUN.
        ///   * It samples every <c>SampleEvery</c> ticks rather than continuously, so a violation
        ///     that opened and closed inside one window would be missed.
        ///   * <b>THE IN-FLIGHT WINDOW.</b> Reason 2 above is not only a non-vacuity problem: a
        ///     batch's inputs leave the ledger at START and its outputs arrive at COMPLETION, so
        ///     every mid-batch sample UNDERCOUNTS by up to 4 units for up to 24 000 ticks — longer
        ///     than the 10 000-tick sampling interval, so it affects most in-batch samples. It
        ///     makes <c>≤ budget</c> conservative and can never produce a false red, but it
        ///     correspondingly WEAKENS <c>worstSlack &gt; 0</c> as evidence that real loss occurred:
        ///     some of that slack is matter in transit, not matter destroyed. The composition
        ///     assertion is what carries the "loss really happened" claim; <c>worstSlack</c> is a
        ///     bound, not a measurement.
        ///   * It does not cover build (which consumes Regolith into walls) or strip (which returns
        ///     it): the shipped slice designates neither, so both are outside the measured window
        ///     and are named here rather than implied.
        ///
        /// COST: ~70 s of wall clock, the single most expensive test in the suite. That is the
        /// price of the window ECONOMY-PLAN §5.1 asks for; a ten-sim-minute version of this test
        /// would be the <c>EconomyIsSustainable</c> lie its §5.2 rule 4 names.
        ///
        /// NAMED MUTATIONS, both applied and both observed red:
        ///   * restore the pre-E0-6 recycler row (<c>Regolith:1 → Scrap:2</c>, 600 s) in
        ///     <see cref="SimDefs.CreateDefault"/> — the BUDGET assertion fails, naming the tick and
        ///     the overshoot (tick 30 000, 32 against 31);
        ///   * multiply <c>recycle_stock</c>'s <c>work_s</c> by 1000 so no batch ever completes —
        ///     the COMPOSITION assertion fails. Before that assertion existed this mutation left
        ///     the whole test green, which is how the strictness claim above was found to be false.
        /// </summary>
        [Test]
        public void MetalLedger_NeverExceedsOpeningStockPlusDigYield_OverThreeSimDaysOnTheSlice()
        {
            const int ThreeSimDays = 3 * 24 * 60 * 60 * Simulation.TicksPerSecond;
            const int SampleEvery = 10_000;

            var host = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default);
            AuthoredShips.PopulateSlice(host.Sim, host.Minds, host.Facts, null);
            var sim = host.Sim;

            int opening = MetalUnits(sim);
            int debrisAtStart = DebrisTiles(sim);
            Assert.That(opening, Is.GreaterThan(0), "non-vacuity: the slice really boots with stock");
            Assert.That(debrisAtStart, Is.GreaterThan(0), "non-vacuity: the slice really boots with debris");

            int worstSlack = int.MaxValue;
            for (int t = 1; t <= ThreeSimDays; t++)
            {
                sim.Tick();
                if (t % SampleEvery != 0) continue;

                int dug = debrisAtStart - DebrisTiles(sim);   // the ladder's ONE in-sim source
                int budget = opening + dug;
                int held = MetalUnits(sim);
                int slack = budget - held;
                if (slack < worstSlack) worstSlack = slack;

                Assert.That(held, Is.LessThanOrEqualTo(budget),
                    "MATTER CREATED. At tick " + t.ToString(CultureInfo.InvariantCulture) + " the ship holds " +
                    held.ToString(CultureInfo.InvariantCulture) + " units of the metal ladder against a budget of " +
                    budget.ToString(CultureInfo.InvariantCulture) + " (" +
                    opening.ToString(CultureInfo.InvariantCulture) + " aboard at boot + " +
                    dug.ToString(CultureInfo.InvariantCulture) + " dug). ECONOMY.md §2.1: the hull is a closed box " +
                    "and the voyage is the only faucet — a conversion that returns more than it took is the " +
                    "defect E0-6 exists to remove, and the shipped ladder had one.");
            }

            Assert.That(MetalUnits(sim), Is.LessThan(opening + (debrisAtStart - DebrisTiles(sim))),
                "the ledger must end STRICTLY below its budget. NOTE what this does and does not " +
                "exclude: it rules out an inert ship, but NOT a ship whose ladder never ran — " +
                "maintenance burns Parts, and a never-completing batch has already eaten its " +
                "staged inputs. The composition assertion below is what carries that.");
            Assert.That(worstSlack, Is.GreaterThan(0),
                "and the ledger was strictly under budget at every sample, not merely at the end " +
                "(a BOUND, not a measurement of loss — see the in-flight window in the limits)");

            // THE ASSERTION THAT ACTUALLY CLOSES THE DO-NOTHING HOLE. A ControllerModule is the
            // ladder's terminal product: it cannot be dug, cannot be maintained into existence and
            // cannot be sitting in an in-flight batch, so holding one at the end proves all THREE
            // hops (Regolith -> Scrap -> Parts -> ControllerModule) completed at least once inside
            // the window. Measured: with recycle_stock's work_s x1000 so that no batch ever
            // finishes, every assertion above still passes and only this one fails.
            Assert.That(Units(sim, ItemKind.ControllerModule), Is.GreaterThan(0),
                "THE LADDER NEVER RAN. Three sim-days ended with no ControllerModule aboard, so " +
                "the conservation assertions above are about a ship that converted nothing — they " +
                "are satisfied by maintenance burning Parts and by inputs staged into a batch that " +
                "never completed, neither of which is a conversion.");
        }

        /// <summary>Units of the CONVERSION LADDER aboard, carried and loose alike. Deliberately
        /// not "all items": Potato is grown and Corpse is minted by death, neither through a
        /// conversion, so folding them in would measure the biological loop instead of the
        /// closed-box axiom.</summary>
        private static int MetalUnits(Simulation sim)
        {
            int n = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                switch (items[i].Kind)
                {
                    case ItemKind.Regolith:
                    case ItemKind.MetalOre:
                    case ItemKind.Scrap:
                    case ItemKind.Parts:
                    case ItemKind.Seals:
                    case ItemKind.ControllerModule:
                        n += items[i].Count;
                        break;
                }
            }
            return n;
        }

        /// <summary>Debris tiles left in the world — the ladder's one in-sim source, one Regolith
        /// per tile cleared (DigJobSource).</summary>
        private static int DebrisTiles(Simulation sim)
        {
            int n = 0;
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                        if (w.GetWall(new Int3(x, y, z)) == TileDefs.Debris) n++;
            return n;
        }

        // ══════════════════════════════════════════════════════ 2. SEALS — producer + consumer

        /// <summary>
        /// The Fabricator's CO-OUTPUT, driven: one batch spawns Parts AND Seals together. Seals
        /// cannot be a second bill on the same station — CraftingSystem resolves at ordinal 0
        /// (MECHANICS §13.12) — so this is the only shape that gives the kind a producer today, and
        /// this test is what says it really has one.
        ///
        /// NAMED MUTATION: delete the <c>ItemKind.Seals</c> output port from fab_components in
        /// <see cref="SimDefs.CreateDefault"/> — the Seals assertion fails while the Parts one
        /// still passes, so the failure names the missing half.
        /// </summary>
        [Test]
        public void Fabricator_ProducesSealsBesideParts_InOneBatch()
        {
            var sim = BuildBench(DeviceKind.Fabricator);
            Assert.That(ProductionDefs.TryGetBill(sim.Defs, DeviceKind.Fabricator, out var bill), Is.True);
            sim.AddItem(ItemKind.Scrap, bill.Input(0).Count, new Int3(5, 2, 0));

            Assert.That(Units(sim, ItemKind.Seals), Is.Zero, "premise: no Seals aboard to start with");
            Assert.That(Units(sim, ItemKind.Parts), Is.Zero, "premise: no Parts aboard to start with");

            Run(sim, bill.WorkSeconds * Simulation.TicksPerSecond + 5000);

            Assert.That(Units(sim, ItemKind.Scrap), Is.Zero, "the batch really ran — the Scrap is gone");
            Assert.That(Units(sim, ItemKind.Parts), Is.GreaterThan(0), "Parts, as before E0-6");
            Assert.That(Units(sim, ItemKind.Seals), Is.GreaterThan(0),
                "SEALS HAVE NO PRODUCER. ItemKind.Seals exists, the maintenance ladder consumes it, " +
                "and nothing anywhere makes it — a third dead ItemKind, which is the exact defect " +
                "(A6) this package was chartered to remove.");
        }

        /// <summary>
        /// A needy machine, no Parts anywhere, one Seals stack: the servicer fetches it, burns
        /// exactly one unit, and the machine comes back to <c>seal_service_condition</c> — NOT to
        /// the jury-rig floor it would have reached before E0-6, and NOT to 1.0.
        ///
        /// The three-value assertion is the whole tier: equal to the Seals rung, strictly above the
        /// jury-rig rung, strictly below a Parts overhaul. A rung that coincided with either
        /// neighbour would be indistinguishable from not having it.
        ///
        /// NAMED MUTATION: in <c>MaintenanceSystem.RestoredCondition</c> return
        /// <c>defs.Wear.JuryRigCondition</c> for <c>ItemKind.Seals</c> — the condition assertion
        /// fails AND the "one unit consumed" assertion still passes, so the failure is unambiguous
        /// about which half broke.
        /// </summary>
        [Test]
        public void SealsService_RestoresToTheSealRung_AndBurnsExactlyOneUnit()
        {
            var (sim, machine) = BuildNeedyMachine();
            sim.AddItem(ItemKind.Seals, 3, new Int3(5, 2, 0));
            Assert.That(Units(sim, ItemKind.Parts), Is.Zero,
                "premise: NO Parts aboard — Parts outrank Seals, so a stray Part would silently " +
                "turn this into a test of the overhaul rung");

            Run(sim, MaintainableKindTicks);

            Assert.That(Units(sim, ItemKind.Seals), Is.EqualTo(2),
                "exactly ONE Seal was consumed by the service");
            Assert.That(machine.Condition, Is.EqualTo(sim.Defs.Wear.SealServiceCondition).Within(1e-4f),
                "the machine came back to the SEALS rung");
            Assert.That(machine.Condition, Is.GreaterThan(sim.Defs.Wear.JuryRigCondition),
                "...which must be strictly better than empty hands, or the walk buys nothing");
            Assert.That(machine.Condition, Is.LessThan(1f),
                "...and strictly worse than a Parts overhaul, or a Seal is just a cheap Part");
        }

        /// <summary>
        /// THE NON-VACUITY CONTROL for the test above, and the additivity proof for the whole rung:
        /// with the SAME machine and the SAME wear, but no consumable of any kind aboard, the
        /// service still jury-rigs to <c>jury_rig_condition</c> exactly as it did before E0-6.
        ///
        /// Without this leg, "condition == 0.9" could be a machine that was never serviced at all.
        ///
        /// NAMED MUTATION: in <c>MaintenanceSystem.DriveWorker</c>'s work phase, change the
        /// empty-handed branch to <c>device.Condition = 1f;</c> — this fails while the Seals test
        /// above still passes.
        ///
        /// ⚠️ AN EARLIER DRAFT NAMED A MUTATION THAT COULD NOT BITE, and the harness caught it:
        /// "make RestoredCondition's fallthrough return 1f" is GREEN, because that arm is
        /// UNREACHABLE — an empty-handed servicer never calls RestoredCondition at all
        /// (<c>consumable == null</c> takes the else branch). The fallthrough is defence against a
        /// future kind reaching the ladder, it is deliberately kept, and it is deliberately
        /// recorded here as untested rather than covered by a mutation that does nothing.
        /// </summary>
        [Test]
        public void NoConsumableAboard_StillJuryRigs_ExactlyAsBeforeE0_6()
        {
            var (sim, machine) = BuildNeedyMachine();
            Assert.That(Units(sim, ItemKind.Parts), Is.Zero);
            Assert.That(Units(sim, ItemKind.Seals), Is.Zero);

            Run(sim, MaintainableKindTicks);

            Assert.That(machine.Condition, Is.EqualTo(sim.Defs.Wear.JuryRigCondition).Within(1e-4f),
                "empty hands still jury-rig — E0-6 inserted a rung, it did not move the floor");
        }

        /// <summary>
        /// The Parts rung is UNCHANGED: with Parts aboard the machine goes to 1.0 and one Part is
        /// consumed, exactly as before E0-6.
        ///
        /// NAMED MUTATION: in <c>RestoredCondition</c> return <c>defs.Wear.SealServiceCondition</c>
        /// for <c>ItemKind.Parts</c> — this fails.
        /// </summary>
        [Test]
        public void PartsOverhaul_StillRestoresToOne_ExactlyAsBeforeE0_6()
        {
            var (sim, machine) = BuildNeedyMachine();
            sim.AddItem(ItemKind.Parts, 3, new Int3(5, 2, 0));

            Run(sim, MaintainableKindTicks);

            Assert.That(Units(sim, ItemKind.Parts), Is.EqualTo(2), "exactly ONE Part was consumed");
            Assert.That(machine.Condition, Is.EqualTo(1f).Within(1e-4f), "a full overhaul, as before");
        }

        /// <summary>
        /// TIER BEFORE DISTANCE, and it is the property that makes the new rung strictly additive:
        /// the Seals stack lies UNDER THE SERVICER'S FEET and the Part lies at the far end of the
        /// bay, and he walks past the Seals to fetch the Part.
        ///
        /// If the preference were nearest-first-across-kinds, this ship would burn its cheap tier
        /// while a full overhaul was available, and every pre-E0-6 maintenance decision on a ship
        /// holding both would silently change.
        ///
        /// ⚠️ THE GEOMETRY IS THE TEST, and the first draft of this file got it BACKWARDS — Parts
        /// at the servicer's tile (distance 0) and Seals three tiles away, so nearest-across-kinds
        /// picked Parts too and the test could not see the difference. Independent review measured
        /// the hole: with the tier order replaced by a single nearest-across-kinds scan, the whole
        /// suite stayed green. Distance is measured from the SERVICER (FindNearestConsumable takes
        /// <c>worker.Pos</c>), not from the machine, which is why the stack that has to be nearer
        /// is the one at (1,2,0) — where BuildBench puts the crew member.
        ///
        /// NAMED MUTATIONS, both applied: swap the two legs of <c>FindNearestConsumable</c> (Seals
        /// first), and — the one that actually matters — replace it with a single nearest-across-
        /// kinds scan over both kinds. Each turns this red.
        /// </summary>
        [Test]
        public void PartsOutrankSeals_EvenWhenTheSealsAreNearer()
        {
            var (sim, machine) = BuildNeedyMachine();
            sim.AddItem(ItemKind.Seals, 3, new Int3(1, 2, 0)); // UNDER the servicer's feet
            sim.AddItem(ItemKind.Parts, 1, new Int3(5, 2, 0)); // the far end of the bay

            // The premise the whole test rests on, asserted rather than assumed: the SEALS really
            // are the nearer stack from where the servicer stands.
            var servicer = sim.Citizens.Items[0];
            Assert.That(Int3.Manhattan(servicer.Pos, new Int3(1, 2, 0)),
                Is.LessThan(Int3.Manhattan(servicer.Pos, new Int3(5, 2, 0))),
                "premise: the Seals stack is strictly nearer the servicer than the Part, or a " +
                "nearest-first-across-kinds implementation would pass this test too");

            Run(sim, MaintainableKindTicks);

            Assert.That(Units(sim, ItemKind.Seals), Is.EqualTo(3),
                "the nearer SEALS stack was not touched");
            Assert.That(Units(sim, ItemKind.Parts), Is.Zero,
                "the distant PART was fetched and consumed instead");
            Assert.That(machine.Condition, Is.EqualTo(1f).Within(1e-4f),
                "and the machine got the full overhaul the Part pays for");
        }

        /// <summary>
        /// A machine at (3,2,0) worn below its maintain threshold, in a stack that runs
        /// MaintenanceSystem, with one idle crew member. Wear is DISABLED for the window by
        /// zeroing the kind's wear rate in a local defs copy, so the condition the test reads after
        /// the service is the SERVICE's value and not the service value minus whatever wore off
        /// while the assertions were being written.
        /// </summary>
        private static (Simulation sim, Device machine) BuildNeedyMachine()
        {
            var defs = SimDefs.CreateDefault();
            int k = (int)DeviceKind.Scrubber;
            var m = defs.Machines[k];
            // Wear rate 0, thresholds untouched: the machine can be BELOW maintain_below and stay
            // there, so MaintenanceSystem's recruitment is what moves Condition and nothing else.
            defs.Machines[k] = new MachineDef(m.DrawKW, m.GenerationKW, m.Tier, m.Blocks, m.HeatKW,
                                              0f, m.MaintainBelow, m.FailBelow);

            var sim = BuildBench(DeviceKind.Scrubber, defs);
            var machine = DeviceNamed(sim, "bench");
            Assert.That(machine, Is.Not.Null);
            // 0.30, not the 0.2 this fixture used before the wreck rule (wreck start W2). The
            // needy band has TWO ends now: below maintain_below (0.4) so the standing rule
            // recruits, and AT OR ABOVE wear.wreck_threshold (0.25) so an EMPTY-HANDED service is
            // still legal. At 0.2 the empty-handed leg below measured the wreck rule's refusal
            // instead of E0-6's jury-rig floor and went red — the right failure, in the wrong file.
            machine.Condition = 0.3f;
            Assert.That(machine.Condition, Is.LessThan(defs.Machines[k].MaintainBelow),
                "premise: the machine is below maintain_below, so the standing rule recruits");
            Assert.That(machine.Condition, Is.GreaterThanOrEqualTo(defs.Wear.WreckThreshold),
                "premise: the machine is NOT a wreck, so the empty-handed rung is reachable — " +
                "otherwise this fixture silently measures wear.wreck_threshold");
            return (sim, machine);
        }

        // ═══════════════════════════════════════════ 3. CONTROLLERMODULE'S ONE CONSUMER

        /// <summary>
        /// THE HOST-SIDE REBIND, DRIVEN — the leg that was a pair of SURVIVORS until independent
        /// review measured them: deleting <c>DeviceTopologyVersion++</c> from
        /// <see cref="CommissionDeviceCommand"/>, or deleting the whole re-derive block from
        /// <c>GameSession</c>'s run loop, both left the entire suite green. The only test that
        /// observed a mid-game rebind called <c>MossBindings.RegisterAdapters</c> BY HAND, so it
        /// proved the binding recipe honours the flag and proved nothing at all about the host ever
        /// running it.
        ///
        /// This drives the REAL <c>GameSession</c> against a REAL <c>SimHost</c>: the same
        /// <c>{"cmd":"commission"}</c> path a client would use, then the host's own
        /// <c>SyncMossAdaptersIfTopologyChanged</c>, then the host's own
        /// <c>DeviceRegistry</c> — the one the MOSS interpreter and the <c>&gt;</c> prompt resolve
        /// through. Nothing is registered by hand anywhere in it.
        ///
        /// NAMED MUTATIONS, both applied: delete <c>sim.DeviceTopologyVersion++</c> from
        /// <see cref="CommissionDeviceCommand"/> (the sync returns false and the device is never
        /// addressable), and make <c>SyncMossAdaptersIfTopologyChanged</c> return false without
        /// rebinding (same). Each turns this red; before this test, neither turned anything red.
        /// </summary>
        [Test]
        public void TheHostItselfRebindsMoss_WhenADeviceIsCommissionedMidGame()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeed);
            var gs = new GameSession(host, sink.Add); // NOT started ⇒ no sim thread
            var sim = host.Sim;

            // Boot already bound the adapters once, so drain that first transition before
            // measuring — otherwise "it rebound" could be the boot bump, not the commission.
            gs.SyncMossAdaptersIfTopologyChanged();
            Assert.That(gs.SyncMossAdaptersIfTopologyChanged(), Is.False,
                "premise: with the device set unchanged the host does NOT rebind — so the true " +
                "below is caused by the commission and not by a counter that always differs");

            var spot = FirstFreeFloor(sim);
            sim.AddItem(ItemKind.Parts, sim.Defs.Build.DevicePlaceCost, spot);
            sim.AddItem(ItemKind.ControllerModule, sim.Defs.Build.CommissionCost, spot);
            gs.ApplyForTest(new WebCommand(CmdKind.Place, spot.X, spot.Y, i: spot.Z, name: "growbed"));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(spot, out var placed), Is.True, "premise: the device was placed");
            Assert.That(placed.Scriptable, Is.False, "premise: it arrives uncommissioned");

            // Placing bumped the topology too, so drain that transition as well: what we are
            // measuring is the COMMISSION's rebind.
            gs.SyncMossAdaptersIfTopologyChanged();
            Assert.That(host.Registry.TryResolve(placed.Name, out _), Is.False,
                "the host's own registry cannot address an uncommissioned device");

            gs.ApplyForTest(new WebCommand(CmdKind.Commission, spot.X, spot.Y, i: spot.Z));
            sim.Tick();
            Assert.That(placed.Scriptable, Is.True, "premise: the module was fitted");

            Assert.That(gs.SyncMossAdaptersIfTopologyChanged(), Is.True,
                "THE SURVIVOR: the commission must move DeviceTopologyVersion, or the host never " +
                "re-derives and the module the player spent buys nothing until the next load");
            Assert.That(host.Registry.TryResolve(placed.Name, out var target), Is.True,
                "and the HOST's registry — the one MOSS resolves through — can now address it");
            Assert.That(target, Is.Not.Null);
        }

        /// <summary>First walkable, device-free, wall-free floor tile on deck 0 (scan order).</summary>
        private static Int3 FirstFreeFloor(Simulation sim)
        {
            for (int y = 0; y < sim.World.Height; y++)
                for (int x = 0; x < sim.World.Width; x++)
                {
                    var p = new Int3(x, y, 0);
                    if ((sim.World.GetFlags(p) & TileFlags.Walkable) == 0) continue;
                    if (sim.World.GetWall(p) != TileDefs.Void) continue;
                    if ((sim.World.GetFlags(p) & TileFlags.HasDevice) != 0) continue;
                    if (sim.TryGetDeviceAt(p, out _)) continue;
                    return p;
                }
            Assert.Fail("no free floor tile on deck 0");
            return default;
        }


        /// <summary>
        /// THE SINK, END TO END. A player-placed device is NOT MOSS-addressable; commissioning it
        /// spends exactly one ControllerModule and makes it addressable through the REAL
        /// <see cref="MossBindings.RegisterAdapters"/> and a REAL <see cref="DeviceRegistry"/>.
        ///
        /// Both halves matter. The registry leg is what stops this being a boolean nobody reads —
        /// before E0-6 <c>ControllerModule</c> had a producer and no consumer anywhere, and a flag
        /// that only a save file observes would be the same defect in a new costume.
        ///
        /// NAMED MUTATION: delete <c>placed.Scriptable = false;</c> from
        /// <see cref="PlaceDeviceCommand"/> — the first "not resolvable" assertion fails, because
        /// the device is addressable before anything was ever spent.
        /// </summary>
        [Test]
        public void CommissioningAPlacedDevice_SpendsOneModule_AndMakesItMossAddressable()
        {
            var sim = BuildBench(DeviceKind.Scrubber);
            var spot = new Int3(2, 2, 0);
            sim.AddItem(ItemKind.Parts, sim.Defs.Build.DevicePlaceCost, spot);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.GrowBed, spot));
            sim.Tick();

            Assert.That(sim.TryGetDeviceAt(spot, out var placed), Is.True, "premise: the device was placed");
            Assert.That(placed.Scriptable, Is.False, "a player-placed device arrives uncommissioned");

            var registry = new DeviceRegistry();
            MossBindings.RegisterAdapters(sim, registry);
            Assert.That(registry.TryResolve(placed.Name, out _), Is.False,
                "and MOSS cannot address it — the whole point of the gate");

            // Pay.
            sim.AddItem(ItemKind.ControllerModule, 1, spot);
            int before = Units(sim, ItemKind.ControllerModule);
            Assert.That(before, Is.EqualTo(1), "premise: exactly one module aboard");
            sim.EnqueueCommand(new CommissionDeviceCommand(spot));
            sim.Tick();

            Assert.That(placed.Scriptable, Is.True, "the module was fitted");
            Assert.That(Units(sim, ItemKind.ControllerModule), Is.Zero,
                "CONTROLLERMODULE HAS NO CONSUMER. This is the assertion the whole package exists " +
                "for: before E0-6 the kind accumulated forever and the economy stopped at h28.");

            var after = new DeviceRegistry();
            MossBindings.RegisterAdapters(sim, after);
            Assert.That(after.TryResolve(placed.Name, out var target), Is.True,
                "and NOW MOSS can address it — the module bought something the player can use");
            Assert.That(target, Is.Not.Null);
        }

        /// <summary>
        /// ALL OR NOTHING, and never charged twice. A ship with no module commissions nothing and
        /// spends nothing; a second commission on the same device is a free no-op.
        ///
        /// NAMED MUTATION: in <see cref="CommissionDeviceCommand"/> delete the
        /// <c>if (device.Scriptable) return;</c> guard — the double-commission leg spends a second
        /// module and its count assertion fails.
        /// </summary>
        [Test]
        public void Commissioning_IsAllOrNothing_AndNeverChargesTwice()
        {
            var sim = BuildBench(DeviceKind.Scrubber);
            var spot = new Int3(2, 2, 0);
            sim.AddItem(ItemKind.Parts, sim.Defs.Build.DevicePlaceCost, spot);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.GrowBed, spot));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(spot, out var placed), Is.True);

            // Leg 1 — cannot pay.
            Assert.That(Units(sim, ItemKind.ControllerModule), Is.Zero, "premise: nothing to pay with");
            sim.EnqueueCommand(new CommissionDeviceCommand(spot));
            sim.Tick();
            Assert.That(placed.Scriptable, Is.False, "an unaffordable commission changes nothing");

            // Leg 2 — pays once.
            sim.AddItem(ItemKind.ControllerModule, 2, spot);
            sim.EnqueueCommand(new CommissionDeviceCommand(spot));
            sim.Tick();
            Assert.That(placed.Scriptable, Is.True);
            Assert.That(Units(sim, ItemKind.ControllerModule), Is.EqualTo(1), "exactly one spent");

            // Leg 3 — already commissioned.
            sim.EnqueueCommand(new CommissionDeviceCommand(spot));
            sim.Tick();
            Assert.That(Units(sim, ItemKind.ControllerModule), Is.EqualTo(1),
                "a second commission on a commissioned device is free — it buys nothing, so it " +
                "must cost nothing");
        }

        /// <summary>
        /// EVERY AUTHORED AND GENERATED DEVICE IS ALREADY COMMISSIONED, so E0-6 is inert on every
        /// shipped ship. This is the assertion that separates "a new sink" from "a catastrophic
        /// regression that silently unbinds every MOSS program in the repo".
        ///
        /// Driven against the real slice, through the real binding recipe.
        ///
        /// NAMED MUTATION: change <see cref="Device"/>'s field initialiser to
        /// <c>public bool Scriptable;</c> (default false) — every device on the slice becomes
        /// unaddressable and the resolved-count assertion collapses to zero.
        /// </summary>
        [Test]
        public void EveryAuthoredDevice_ShipsCommissioned_SoMossBindingIsUnchanged()
        {
            var host = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default);
            var sim = host.Sim;

            int named = 0, notScriptable = 0;
            foreach (var d in sim.Devices.Items)
            {
                if (string.IsNullOrEmpty(d.Name)) continue;
                named++;
                if (!d.Scriptable) notScriptable++;
            }
            Assert.That(named, Is.GreaterThan(0), "non-vacuity: the slice really has named devices");
            Assert.That(notScriptable, Is.Zero,
                "an AUTHORED device must arrive commissioned — the ship left the yard with its own " +
                "automation fitted, and anything else deletes the player's MOSS on upgrade");

            // ...and the binding recipe really registers them.
            var registry = new DeviceRegistry();
            MossBindings.RegisterAdapters(sim, registry);
            int resolved = 0;
            foreach (var d in sim.Devices.Items)
                if (!string.IsNullOrEmpty(d.Name) && registry.TryResolve(d.Name, out _)) resolved++;
            Assert.That(resolved, Is.GreaterThan(0), "the adapters really bound");
        }

        /// <summary>
        /// The other MOSS door agrees with the first: a program cannot be INSTALLED on a terminal
        /// that is not commissioned, and a terminal id with no device behind it is still free
        /// (hosts/scenario and several tests drive `term_main` with no device at all).
        ///
        /// NAMED MUTATION: delete the <c>!terminal.Scriptable</c> guard from
        /// <see cref="SetScriptCommand"/> — the refused leg installs and its Scripts.Count
        /// assertion fails.
        /// </summary>
        [Test]
        public void SetScript_RefusesAnUncommissionedTerminal_ButNotADevicelessId()
        {
            var sim = BuildBench(DeviceKind.Scrubber);
            var term = sim.AddDevice(DeviceKind.Terminal, new Int3(2, 2, 0), "term_new");
            term.Scriptable = false;

            sim.EnqueueCommand(new SetScriptCommand("term_new", "every 5s:\n  open(door_a)\n"));
            sim.Tick();
            Assert.That(sim.Scripts.Count, Is.Zero, "an uncommissioned terminal takes no program");

            sim.EnqueueCommand(new SetScriptCommand("term_ghost", "every 5s:\n  open(door_a)\n"));
            sim.Tick();
            Assert.That(sim.Scripts.Count, Is.EqualTo(1),
                "an id with NO device behind it is not a gated device — refusing it would turn " +
                "'no device' into 'no automation' for every headless caller");

            term.Scriptable = true;
            sim.EnqueueCommand(new SetScriptCommand("term_new", "every 5s:\n  open(door_a)\n"));
            sim.Tick();
            Assert.That(sim.Scripts.Count, Is.EqualTo(2),
                "non-vacuity: the SAME command on the SAME terminal installs once commissioned, so " +
                "the refusal above was the gate and not a broken command");
        }

        // ═════════════════════════════════════════════════ 4. HASH HONESTY + SAVE ROUND-TRIP

        /// <summary>
        /// <see cref="Device.Scriptable"/> is saved, so it must be hashed: two sims differing in
        /// nothing but that flag must not hash equal.
        ///
        /// It shares a WORD with Kind / IsOpen / IsLocked / Powered / NetworkId / Rate, so the
        /// single-field probe is paired with CONSTRUCTED COLLISION PAIRS (ECONOMY-PLAN §5.1: a
        /// per-field table finds dropped and truncated fields; only a constructed pair finds an
        /// ALIAS). The division of labour between them is precise, and an earlier draft of this
        /// comment stated it BACKWARDS — corrected here from measurement:
        ///
        ///   * An alias onto a bit that is SET in the probe's own state — <c>Powered</c>, which is
        ///     true on a live bench — makes the field INVISIBLE (<c>true|false</c> and
        ///     <c>true|true</c> are both 1), so the SINGLE-FIELD PROBE catches it, first and by
        ///     name. Measured: shifting 11→10 reddens the single-field assertion, not the pair.
        ///   * An alias onto a bit that is CLEAR — <c>IsLocked</c>, false on a fresh device — is
        ///     INVISIBLE TO THE SINGLE-FIELD PROBE (the flag still moves a bit, just the wrong
        ///     one) and is caught only by a pair constructed so the two states differ in WHICH of
        ///     the two flags is set. Independent review measured that an 11→9 alias survives all
        ///     111 hash/save tests in the suite against the older, weaker pair; the pairs below
        ///     are built to close it rather than to record it.
        ///
        /// The pairs are therefore genuine collisions: under the named alias each pair's two
        /// states are bit-identical in the packed word, while at HEAD they differ.
        ///
        /// NAMED MUTATIONS, all three applied: delete the <c>d.Scriptable ? 1UL &lt;&lt; 11 : 0</c>
        /// term (single-field probe red); change the shift to <c>10</c> (single-field probe red);
        /// change the shift to <c>9</c> (the IsLocked PAIR red, and nothing else in the suite).
        /// </summary>
        [Test]
        public void DeviceScriptable_IsHashed_AndDoesNotAliasItsNeighbours()
        {
            var a = BuildBench(DeviceKind.Scrubber);
            var b = BuildBench(DeviceKind.Scrubber);
            Assert.That(a.StateHash(), Is.EqualTo(b.StateHash()), "premise: the twins start identical");

            DeviceNamed(a, "bench").Scriptable = false;
            Assert.That(a.StateHash(), Is.Not.EqualTo(b.StateHash()),
                "a saved field that does not move the hash makes the determinism canary blind to it");

            // COLLISION PAIR 1 — against IsLocked (bit 9, CLEAR on a fresh device). Under an 11→9
            // alias both states are "bit 9 set, nothing else moved" and hash EQUAL.
            var p = BuildBench(DeviceKind.Scrubber);
            var q = BuildBench(DeviceKind.Scrubber);
            var pd = DeviceNamed(p, "bench");
            var qd = DeviceNamed(q, "bench");
            pd.IsLocked = true;  pd.Scriptable = false;
            qd.IsLocked = false; qd.Scriptable = true;
            Assert.That(p.StateHash(), Is.Not.EqualTo(q.StateHash()),
                "COLLISION: 'locked but uncommissioned' and 'unlocked and commissioned' are " +
                "different ships. If they hash equal, Scriptable is sharing IsLocked's bit and " +
                "the canary is blind to BOTH of them in exactly the states that differ.");

            // COLLISION PAIR 2 — against Powered (bit 10, SET on a live bench). Same construction.
            var r = BuildBench(DeviceKind.Scrubber);
            var t = BuildBench(DeviceKind.Scrubber);
            var rd = DeviceNamed(r, "bench");
            var td = DeviceNamed(t, "bench");
            rd.Powered = true;  rd.Scriptable = false;
            td.Powered = false; td.Scriptable = true;
            Assert.That(r.StateHash(), Is.Not.EqualTo(t.StateHash()),
                "COLLISION: 'powered but uncommissioned' and 'unpowered but commissioned' must " +
                "not hash equal");
        }

        /// <summary>
        /// DEVC v5 round-trip, and the harder half: save → load → tick 1000 → compare. A restore
        /// that dropped the flag would hash equal at load (the flag is derived from nothing) and
        /// diverge only once a MOSS-driven device did something different — the exact hole
        /// ECONOMY-PLAN §5.1 added the run-on leg for.
        ///
        /// NAMED MUTATION: delete <c>w.Write(d.Scriptable);</c> from <c>SaveWriter.WriteDevices</c>
        /// — the reader then desynchronises the DEVC stream and the load throws or hashes
        /// differently immediately.
        /// </summary>
        [Test]
        public void ScriptableSurvivesASaveRoundTrip_AndAThousandTicksAfterIt()
        {
            var sim = BuildBench(DeviceKind.Scrubber);
            DeviceNamed(sim, "bench").Scriptable = false;
            Run(sim, 50);

            var blob = new MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;
            var loaded = SaveReader.Read(blob, SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));

            Assert.That(DeviceNamed(loaded, "bench").Scriptable, Is.False,
                "the flag came back off the disk");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "twin hashes MATCH at load");

            // A load leaves RoomState dirty, so the loaded sim takes a room recompute on its first
            // tick that the uninterrupted twin does not — and RoomState.RemapGas re-derives moles
            // as a sum of per-tile shares, so recomputing an UNCHANGED partition perturbs gas at
            // ULP scale. That is a pre-existing defect (HANDOVER "Save-reload thermal ULP drift"),
            // measured here as a 3-in-1000-tick divergence with Scriptable never touched at all.
            // Both sims are made to take the identical recompute, exactly as
            // SaveRestoreRunOnTests:106 does, so the run-on below is about the RESTORE and not
            // about float remapping.
            sim.Rooms.MarkDirty();

            Run(sim, 1000);
            Run(loaded, 1000);
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "twin hashes MATCH a thousand ticks later — no derived index was dropped");
        }

        /// <summary>
        /// A PRE-v5 DEVC chapter loads with every device COMMISSIONED. This is the compat gate that
        /// matters most in the package: a v4 save was written by a build in which every named
        /// device was MOSS-addressable, so reading them back un-addressable would delete the
        /// player's automation on load, silently, with no error anywhere.
        ///
        /// It drives the real <c>SaveReader.ReadDevices</c> against a hand-built v4 buffer, because
        /// no writer in the tree can emit v4 any more and a compat branch nothing can reach is a
        /// branch nothing can test.
        ///
        /// NAMED MUTATION: change the reader's guard to <c>d.Scriptable = version &gt;= 5 &amp;&amp;
        /// reader.ReadBoolean();</c> (i.e. false for old saves) — the assertion fails by name.
        /// </summary>
        [Test]
        public void APreV5DeviceChapter_LoadsEveryDeviceCommissioned()
        {
            var buffer = new MemoryStream();
            using (var w = new BinaryWriter(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                w.Write(1);                          // count
                w.Write(9_000u);                     // id (high, so it cannot collide with
                                                     // the ids the bench scenario already used)
                w.Write((byte)DeviceKind.GrowBed);   // kind
                w.Write(2); w.Write(2); w.Write(0);  // pos
                w.Write("legacy_bed");               // name
                w.Write(false); w.Write(false); w.Write(true); // IsOpen / IsLocked / Powered
                w.Write(1f);                         // Rate
                w.Write(0f);                         // StoredKWh
                w.Write((ushort)0);                  // NetworkId
                w.Write(0f); w.Write(0f); w.Write((ushort)0); // v2
                w.Write(1f);                         // v3 Condition
                w.Write((byte)0);                    // v4 LockOwner
                // ...and NOTHING for v5. This is the whole point.
            }
            buffer.Position = 0;

            var sim = BuildBench(DeviceKind.Scrubber);
            using (var r = new BinaryReader(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                SaveReader.ReadDevices(sim, r, version: 4);
            }

            var legacy = DeviceNamed(sim, "legacy_bed");
            Assert.That(legacy, Is.Not.Null, "non-vacuity: the hand-built v4 chapter really parsed");
            Assert.That(legacy.Scriptable, Is.True,
                "a pre-v5 device was addressable when the save was written; restoring it " +
                "unaddressable deletes the player's automation on load, with no error anywhere");
        }

        // ═══════════════════════════════════════════════════════ 5. THE DEF-FIELD RITUAL

        /// <summary>
        /// Both new def fields move <see cref="SimDefs.ComputeChecksum"/> — the defs mutation probe.
        /// No literal checksum is asserted (ECONOMY-PLAN §2.1 rule 4); the claim is that the value
        /// MOVES, which is the claim that survives a sibling lane merging.
        ///
        /// NAMED MUTATION: delete either of the two E0-6 folds at the end of
        /// <see cref="SimDefs.ComputeChecksum"/> — the matching leg fails.
        /// </summary>
        [Test]
        public void BothNewDefFields_MoveTheDefsChecksum()
        {
            ulong baseline = SimDefs.CreateDefault().Checksum;

            var a = SimDefs.CreateDefault();
            a.Wear.SealServiceCondition += 0.05f;
            Assert.That(a.ComputeChecksum(), Is.Not.EqualTo(baseline), "seal_service_condition folds");

            var b = SimDefs.CreateDefault();
            b.Build.CommissionCost += 1;
            Assert.That(b.ComputeChecksum(), Is.Not.EqualTo(baseline), "commission_cost folds");
        }

        /// <summary>
        /// CONSUMPTION TRIPWIRE for <c>seal_service_condition</c> — a def field nothing reads is a
        /// lie (MECHANICS §13 exists because that step gets skipped). Two REAL sims, identical but
        /// for the field, both driven through a real Seals service: the machine ends at different
        /// conditions.
        ///
        /// NAMED MUTATION: hard-code <c>0.9f</c> in <c>MaintenanceSystem.RestoredCondition</c>
        /// instead of reading <c>defs.Wear.SealServiceCondition</c> — both sims land on 0.9 and
        /// this fails.
        /// </summary>
        [Test]
        public void SealServiceCondition_IsREAD_NotJustParsed()
        {
            var lo = SealServiceRun(0.7f);
            var hi = SealServiceRun(0.95f);

            Assert.That(lo, Is.EqualTo(0.7f).Within(1e-4f));
            Assert.That(hi, Is.EqualTo(0.95f).Within(1e-4f));
            Assert.That(lo, Is.Not.EqualTo(hi));
        }

        private static float SealServiceRun(float sealCondition)
        {
            var defs = SimDefs.CreateDefault();
            defs.Wear.SealServiceCondition = sealCondition;
            int k = (int)DeviceKind.Scrubber;
            var m = defs.Machines[k];
            defs.Machines[k] = new MachineDef(m.DrawKW, m.GenerationKW, m.Tier, m.Blocks, m.HeatKW,
                                              0f, m.MaintainBelow, m.FailBelow);

            var sim = BuildBench(DeviceKind.Scrubber, defs);
            var machine = DeviceNamed(sim, "bench");
            machine.Condition = 0.2f;
            sim.AddItem(ItemKind.Seals, 1, new Int3(5, 2, 0));
            Run(sim, MaintainableKindTicks);

            Assert.That(Units(sim, ItemKind.Seals), Is.Zero,
                "path assertion: the Seal really was consumed, so the condition below is a SERVICE " +
                "result and not an untouched machine");
            return machine.Condition;
        }

        /// <summary>
        /// CONSUMPTION TRIPWIRE for <c>commission_cost</c>: raise the price above what the ship
        /// holds and the same command refuses.
        ///
        /// NAMED MUTATION: hard-code <c>1</c> in <see cref="CommissionDeviceCommand"/> instead of
        /// reading <c>sim.Defs.Build.CommissionCost</c> — the expensive leg succeeds and fails here.
        /// </summary>
        [Test]
        public void CommissionCost_IsREAD_NotJustParsed()
        {
            Assert.That(CommissionWithCost(1, modulesAboard: 1), Is.True, "priced at 1, one aboard: pays");
            Assert.That(CommissionWithCost(2, modulesAboard: 1), Is.False, "priced at 2, one aboard: refuses");
        }

        private static bool CommissionWithCost(int cost, int modulesAboard)
        {
            var defs = SimDefs.CreateDefault();
            defs.Build.CommissionCost = cost;
            var sim = BuildBench(DeviceKind.Scrubber, defs);
            var spot = new Int3(2, 2, 0);
            sim.AddItem(ItemKind.Parts, defs.Build.DevicePlaceCost, spot);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.GrowBed, spot));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(spot, out var placed), Is.True, "premise: placed");
            Assert.That(placed.Scriptable, Is.False, "premise: uncommissioned");

            sim.AddItem(ItemKind.ControllerModule, modulesAboard, spot);
            sim.EnqueueCommand(new CommissionDeviceCommand(spot));
            sim.Tick();
            return placed.Scriptable;
        }

        /// <summary>
        /// de-DE CULTURE on every value E0-6 added to the parse surface (ECONOMY-PLAN §4 trap 10:
        /// the dev machine is de-DE, and a bare float parse there reads "0.9" as 9).
        ///
        /// The production ROWS are integers and enum names by design, so their exposure is the port
        /// counts; <c>seal_service_condition</c> is a genuine decimal and is the one that would
        /// actually bite.
        ///
        /// NAMED MUTATION: change the <c>F(...)</c> helper's parse in <c>DefsParser</c> to a
        /// culture-sensitive <c>float.Parse(v)</c> — the 0.9 assertion reads 9 under de-DE and fails.
        /// </summary>
        [Test]
        public void TheNewDefValues_ParseIdenticallyUnderDeDE()
        {
            var previous = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                var problems = new List<string>();
                var parsed = DefsParser.Parse(new[]
                {
                    ("wear.def", "[wear]\nseal_service_condition = 0.9\n"),
                    ("build.def", "[build]\ncommission_cost = 1\n"),
                    ("production.def",
                     "[production]\nrecycle_stock SalvageRecycler 2400 Regolith:4 Scrap:3\n" +
                     "fab_components Fabricator 900 Scrap:2 Parts:1+Seals:1\n"),
                }, problems);

                Assert.That(problems, Is.Empty, string.Join(" | ", problems));
                Assert.That(parsed.Wear.SealServiceCondition, Is.EqualTo(0.9f).Within(1e-6f),
                    "de-DE must not read '0.9' as 9 — a machine restored to 900 % condition");
                Assert.That(parsed.Build.CommissionCost, Is.EqualTo(1));
                Assert.That(parsed.Production.Nodes[0].Inputs[0].Count, Is.EqualTo(4));
                Assert.That(parsed.Production.Nodes[1].Outputs[1].Kind, Is.EqualTo(ItemKind.Seals));
                Assert.That(parsed.Checksum, Is.EqualTo(SimDefs.Default.Checksum),
                    "and the whole shipped surface parses to the compiled default under de-DE");
            }
            finally
            {
                Thread.CurrentThread.CurrentCulture = previous;
            }
        }

        // ═════════════════════════════════════════════════════════════ 6. THE TICK PATH

        /// <summary>
        /// The maintenance ladder must not allocate: <c>FindNearestConsumable</c> runs every second
        /// per unserviced needy machine and now makes up to TWO passes over the item store.
        ///
        /// PRECONDITION ASSERTED (§5.2 rule 3): the measured window must actually contain a bound
        /// servicer, or a zero-alloc result proves only that nothing ran.
        ///
        /// NAMED MUTATION: make <c>FindNearestConsumable</c> allocate — e.g. build the tier order as
        /// <c>new[] { ItemKind.Parts, ItemKind.Seals }</c> inside the method and loop it — and the
        /// delta becomes non-zero.
        /// </summary>
        [Test]
        public void TheMaintenanceLadder_AllocatesNothingInSteadyState()
        {
            var (sim, machine) = BuildNeedyMachine();
            // Seals only: the SECOND tier pass is the new code, and it runs only when the Parts
            // pass found nothing — so this is the window that actually exercises it.
            sim.AddItem(ItemKind.Seals, 500, new Int3(5, 2, 0));
            Run(sim, 3000); // warm-up: recruit, fetch, settle into the service loop

            bool serviced = false;
            foreach (var c in sim.Citizens.Items) if (c.JobKind == JobKind.Maintain) serviced = true;
            Assert.That(serviced || machine.Condition > 0.2f, Is.True,
                "precondition: a servicer was recruited (or has already finished one service) — " +
                "otherwise the measured window contains no maintenance work at all");

            long before = GC.GetAllocatedBytesForCurrentThread();
            Run(sim, 3000);
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0L),
                "the maintenance pass must be allocation-free (saw " + delta + " bytes)");
        }

        /// <summary>
        /// DETERMINISM, the shape a lane is allowed to assert (ECONOMY-PLAN §2.1 rule 4): two sims
        /// built the same way from the same seed, exercising every path E0-6 added — a lossy
        /// recycle, a Seals service, a commission — reach the SAME hash. No literal.
        ///
        /// NAMED MUTATION: make <c>FindNearestConsumable</c> pick by nearest-across-kinds using a
        /// <c>Dictionary</c> enumeration order — the twins still match (that bug class is
        /// structurally invisible to a twin test, ECONOMY-PLAN §4 trap 3), which is stated here so
        /// nobody reads this test as covering it. What it DOES catch is a wall-clock or unforked-RNG
        /// dependency in any of the three new paths.
        /// </summary>
        [Test]
        public void TheThreeNewPaths_AreDeterministic_TwinHashesMatch()
        {
            ulong Play()
            {
                var sim = BuildBench(DeviceKind.SalvageRecycler);
                sim.AddItem(ItemKind.Regolith, 8, new Int3(5, 2, 0));
                sim.AddItem(ItemKind.Seals, 2, new Int3(1, 2, 0));
                var spot = new Int3(2, 2, 0);
                sim.AddItem(ItemKind.Parts, sim.Defs.Build.DevicePlaceCost, spot);
                sim.AddItem(ItemKind.ControllerModule, 1, spot);
                sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Locker, spot));
                Run(sim, 10);
                sim.EnqueueCommand(new CommissionDeviceCommand(spot));
                Run(sim, 30000);
                return sim.StateHash();
            }

            ulong a = Play();
            ulong b = Play();
            Assert.That(b, Is.EqualTo(a), "twin hashes MATCH");
            // Non-vacuity: the run really did something, so "they match" is not two empty sims.
            var probe = BuildBench(DeviceKind.SalvageRecycler);
            Assert.That(a, Is.Not.EqualTo(probe.StateHash()),
                "the twins moved off the untouched-boot state — they are not matching on nothing");
        }
    }
}
