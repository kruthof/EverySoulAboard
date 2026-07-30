using System;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-4 WP-4 — the "don't haul what a bench wants" rule (lane plan §2.4/§5). B(sim) is the set of
    /// ItemKinds any device's resolved <see cref="ProductionBill"/> consumes; an item of a bench-wanted
    /// kind is INELIGIBLE for general haul, so the haul board never drags a crafting intermediate off to
    /// a stockpile out from under the chain that eats it (the output-strand / haul-in↔fetch-out
    /// oscillation, §2.6). These tests drive the REAL dispatcher (<see cref="JobSystem"/> +
    /// <see cref="HaulJobSource"/>) so the rule is proven where it bites: on the candidate board.
    ///
    /// ANTI-TAUTOLOGY (lane plan §7 trap 5, §5.2 rule 3): the outcome assertions ("Scrap never boards")
    /// are guarded by a PRECONDITION that the bench-rule branch was actually REACHED — the Haul source's
    /// <see cref="HaulJobSource.BenchWantedMask"/> has the Scrap bit set — so a never-ran rule cannot pass
    /// green. Each test's doc names the one-line mutation that reddens it.
    ///
    /// The default recipe chain (SimDefs.CreateDefault) is the fixture: SalvageRecycler Regolith→Scrap,
    /// Fabricator Scrap→Parts, MachineShop Parts→ControllerModule. So a Fabricator alone makes B(sim) =
    /// { Scrap }; ControllerModule and Potato are terminal (no bench input) and stay haulable.
    ///
    /// GATES N/A, stated so a reviewer does not score against them (lane plan §10): WP-4 adds NO def
    /// scalar and NO float — B(sim) is an integer bitmask over existing bill arrays — so the
    /// def-field / defs-checksum / de-DE-culture gates do not apply. No golden moves (no view format
    /// touched); pins hold (the rule only runs inside <c>if (anyFreeStockpile)</c>, and no pinned ship
    /// zones a stockpile).
    /// </summary>
    public class BenchRuleHaulTests
    {
        // A one-deck corridor: floor at y=1, x=1..9, walls around.
        private static readonly string[] Corridor =
        {
            "###########",
            "#.........#",
            "###########",
        };

        private static Simulation NewSim(out JobSystem jobs, params ISimSystem[] extra)
        {
            jobs = new JobSystem();
            var systems = new ISimSystem[extra.Length + 2];
            systems[0] = new CitizenSystem();
            systems[1] = jobs;
            for (int i = 0; i < extra.Length; i++) systems[i + 2] = extra[i];
            return new Simulation(AsciiWorld.Build(Corridor), 7, systems);
        }

        private static HaulJobSource Haul(JobSystem jobs)
        {
            for (int i = 0; i < jobs.Sources.Count; i++)
                if (jobs.Sources[i] is HaulJobSource h) return h;
            Assert.Fail("no HaulJobSource is registered");
            return null;
        }

        private static bool Wants(HaulJobSource haul, ItemKind kind) =>
            (haul.BenchWantedMask & (1UL << (int)kind)) != 0;

        private static bool IsStockTile(Simulation sim, Int3 p) =>
            (sim.World.GetFlags(p) & TileFlags.Stockpile) != 0;

        // ============================================ the rule: a bench input never boards the haul list

        /// <summary>
        /// THE RULE PROOF. A Fabricator (wants Scrap) plus a free accept-all stockpile far away: the loose
        /// Scrap is CEDED to the crafting chain — it never becomes a haul candidate, so it stays on the
        /// ground where the Fabricator's own fetcher can pull it, instead of being dragged to the wrong
        /// deck. A terminal ControllerModule (no bench consumes it) still boards, proving the gate rejects
        /// BY KIND, not everything.
        ///
        /// PRECONDITION (anti-tautology): <c>BenchWantedMask</c> has the Scrap bit — the bench-rule branch
        /// ran — asserted before the outcome, so a rule that never executed cannot pass this green.
        ///
        /// MUTATION: remove the <c>if ((_benchWanted &amp; (1UL &lt;&lt; (int)item.Kind)) != 0) continue;</c>
        /// skip in <c>HaulJobSource.Rescan</c> ⇒ the Scrap boards (candidate count 1, then 2 with the
        /// Controller), and the "Scrap is not a candidate" assertion fails.
        /// </summary>
        [Test]
        public void HaulCedesBenchInputToTheCraftingChain_NotToAFarStockpile()
        {
            var sim = NewSim(out var jobs);
            var haul = Haul(jobs);
            var far = new Int3(9, 1, 0);

            sim.AddDevice(DeviceKind.Fabricator, new Int3(1, 1, 0), "Fab"); // consumes Scrap
            sim.EnqueueCommand(new DesignateStockpileCommand(far, on: true)); // accept-all (no filter entry)
            var scrap = sim.AddItem(ItemKind.Scrap, 1, new Int3(5, 1, 0));
            sim.Tick(); // rebuild the board with the bench, the stockpile and the Scrap all live

            // Precondition: the bench-rule branch was REACHED (else the outcome below is vacuous).
            Assert.That(Wants(haul, ItemKind.Scrap), Is.True,
                "precondition: the Fabricator makes Scrap a bench-wanted kind — the rule branch ran");

            Assert.That(haul.CandidateCount, Is.EqualTo(0),
                "Scrap is a Fabricator input, so it is ceded to the crafting chain and never boards the haul list");
            Assert.That(scrap.CarriedBy, Is.EqualTo(0u), "…and no hauler ever picked it up");
            Assert.That(IsStockTile(sim, scrap.Pos), Is.False, "…so it never reached the far stockpile");

            // Control: a terminal kind no bench consumes still boards — the gate is per-kind, not a blanket.
            sim.AddItem(ItemKind.ControllerModule, 1, new Int3(4, 1, 0));
            sim.Tick();
            Assert.That(Wants(haul, ItemKind.ControllerModule), Is.False,
                "no bench consumes ControllerModule — it is not bench-wanted");
            Assert.That(haul.CandidateCount, Is.EqualTo(1),
                "the terminal ControllerModule boards (only Scrap is withheld) — the rule rejects by kind");
        }

        // ============================================ the mask self-heals when the consuming bench is gone

        /// <summary>
        /// B(sim) is recomputed every rescan, so removing the last bench that wanted a kind returns that
        /// kind to the haulable pool (lane plan §8 hazard 5). A Fabricator withholds Scrap; strip it (here
        /// via <see cref="Simulation.RemoveDevice"/> — in-game the E0-5 device-strip yields Parts through
        /// <c>AddItem</c>, which dirties the board and drives this same rescan) and Scrap boards again.
        ///
        /// MUTATION: compute <c>_benchWanted</c> once and cache it (never recompute in Rescan) ⇒ the mask
        /// stays stale after the Fabricator is gone, Scrap remains ineligible forever, and both the
        /// "Scrap no longer wanted" and "Scrap boards" assertions fail.
        /// </summary>
        [Test]
        public void BenchWantedMaskSelfHeals_WhenTheOnlyConsumingBenchIsRemoved()
        {
            var sim = NewSim(out var jobs);
            var haul = Haul(jobs);
            var fab = sim.AddDevice(DeviceKind.Fabricator, new Int3(1, 1, 0), "Fab");
            sim.EnqueueCommand(new DesignateStockpileCommand(new Int3(9, 1, 0), on: true));
            sim.AddItem(ItemKind.Scrap, 1, new Int3(5, 1, 0));
            sim.Tick();

            Assert.That(Wants(haul, ItemKind.Scrap), Is.True, "precondition: the Fabricator withholds Scrap");
            Assert.That(haul.CandidateCount, Is.EqualTo(0), "precondition: Scrap is ceded while the Fabricator exists");

            sim.RemoveDevice(fab.Id);
            sim.JobsDirty |= JobBoardDirty.Items; // the strip's yielded Parts (AddItem) does this in-game
            sim.Tick();

            Assert.That(Wants(haul, ItemKind.Scrap), Is.False,
                "with no consuming bench left, Scrap drops out of B(sim) — the mask self-heals");
            Assert.That(haul.CandidateCount, Is.EqualTo(1),
                "Scrap is haulable again now that nothing wants it");
        }

        // ============================================ conservation: the rule creates/destroys no matter

        /// <summary>
        /// The rule only gates ELIGIBILITY — it must never create or destroy matter. A pure-haul world
        /// (no <see cref="CraftingSystem"/>, so there is no legitimate conversion to account for): a
        /// Fabricator makes Scrap bench-wanted (ceded, stays put), a terminal Potato is hauled to the
        /// stockpile. After the haul settles, every kind's total unit count and the item-store size are
        /// exactly what they were at t0 — nothing was duplicated or lost. Whole-economy conservation over
        /// the slice (across crafting conversions) is corroborated by the flip measurement.
        ///
        /// MUTATION: double-count a delivered stack (e.g. in <c>ProgressDeliver</c> spawn a second stack,
        /// or increment its Count, on drop) ⇒ the total Potato units / item-store count rises above t0 and
        /// the conservation assertion fails.
        /// </summary>
        [Test]
        public void TheBenchRuleAndHaulConserveMatter_NothingDuplicatedOrLost()
        {
            var sim = NewSim(out _);
            sim.AddDevice(DeviceKind.Fabricator, new Int3(1, 1, 0), "Fab"); // Scrap is bench-wanted
            sim.EnqueueCommand(new DesignateStockpileCommand(new Int3(9, 1, 0), on: true));
            var scrap = sim.AddItem(ItemKind.Scrap, 1, new Int3(4, 1, 0));   // ceded — stays loose
            var potato = sim.AddItem(ItemKind.Potato, 1, new Int3(5, 1, 0)); // terminal — hauled
            sim.AddCitizen("Ada", new Int3(3, 1, 0)).GiveAllWork();

            long UnitsOf(ItemKind k)
            {
                long n = 0;
                var items = sim.Items.Items;
                for (int i = 0; i < items.Count; i++) if (items[i].Kind == k) n += items[i].Count;
                return n;
            }

            int itemsBefore = sim.Items.Items.Count;
            long scrapBefore = UnitsOf(ItemKind.Scrap);
            long potatoBefore = UnitsOf(ItemKind.Potato);

            for (int t = 0; t < 2000 && !(potato.CarriedBy == 0 && IsStockTile(sim, potato.Pos)); t++)
                sim.Tick();

            Assert.That(potato.CarriedBy, Is.EqualTo(0u), "precondition: the haul ran and set the Potato down");
            Assert.That(IsStockTile(sim, potato.Pos), Is.True, "precondition: the terminal Potato reached the stockpile");
            Assert.That(IsStockTile(sim, scrap.Pos), Is.False, "the ceded Scrap was never hauled off");

            Assert.That(sim.Items.Items.Count, Is.EqualTo(itemsBefore), "no stack was duplicated or lost");
            Assert.That(UnitsOf(ItemKind.Scrap), Is.EqualTo(scrapBefore), "Scrap units conserved");
            Assert.That(UnitsOf(ItemKind.Potato), Is.EqualTo(potatoBefore), "Potato units conserved — no double-count on delivery");
        }

        // ============================================ zero-alloc, with a precondition the branch ran

        /// <summary>
        /// The bench-rule scan (<c>ComputeBenchWanted</c> — a device-store walk OR-ing input-port bits into
        /// a <c>ulong</c>) is alloc-free, and a full rescan every tick that REACHES it allocates nothing.
        /// A held citizen never self-assigns, so no assignment/pathing enters the window — only the rescan.
        ///
        /// PRECONDITION (lane plan §7 trap 5): a zero-alloc assertion over an UNREACHED branch is a
        /// tautology, so this asserts the branch really runs — a stockpile exists (<c>anyFreeStockpile</c>
        /// true), the Haul board is populated, and <c>BenchWantedMask != 0</c> (the Fabricator made
        /// <c>ComputeBenchWanted</c> fold a bit) — before the counter starts.
        ///
        /// MUTATION: allocate inside <c>ComputeBenchWanted</c> (e.g. collect wanted kinds into a
        /// <c>new List&lt;ItemKind&gt;()</c> per call instead of OR-ing into the <c>ulong</c>) ⇒ the
        /// per-tick rescan allocates and the "0 bytes" assertion fails. (The existing JobDispatchTests
        /// zero-alloc pin — which has no bench — stays green independently.)
        /// </summary>
        [Test]
        public void FullRescanReachingTheBenchRule_IsZeroAlloc()
        {
            var sim = NewSim(out var jobs);
            var haul = Haul(jobs);
            sim.AddDevice(DeviceKind.Fabricator, new Int3(1, 1, 0), "Fab"); // makes BenchWantedMask != 0
            sim.EnqueueCommand(new DesignateStockpileCommand(new Int3(9, 1, 0), on: true)); // anyFreeStockpile
            sim.AddItem(ItemKind.ControllerModule, 1, new Int3(5, 1, 0));   // a terminal haul candidate
            var held = sim.AddCitizen("Held", new Int3(3, 1, 0)).GiveAllWork();
            held.HoldPosition = true; // never self-assigns: the rescan is the only path measured

            for (int i = 0; i < 50; i++) { sim.JobsDirty = JobBoardDirty.All; sim.Tick(); } // warm every collection

            Assert.That(haul.BenchWantedMask, Is.Not.EqualTo(0UL),
                "precondition: the bench-rule branch ran — the Fabricator folded Scrap into B(sim)");
            Assert.That(Wants(haul, ItemKind.Scrap), Is.True, "precondition: …specifically the Scrap bit");
            Assert.That(haul.CandidateCount, Is.GreaterThan(0),
                "precondition: the haul board is populated (the terminal ControllerModule), so the rescan does real work");
            Assert.That(held.JobKind, Is.EqualTo(JobKind.None), "precondition: the held citizen never took a job");

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) { sim.JobsDirty = JobBoardDirty.All; sim.Tick(); }
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0),
                $"a full rescan reaching ComputeBenchWanted must not allocate, saw {delta} bytes");
        }
    }
}
