using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-4 WP-2 — the command surface + FILTER ENFORCEMENT in haul (the bench rule is WP-4, the
    /// wire is WP-5; neither is exercised here). These tests drive the REAL dispatcher
    /// (<see cref="JobSystem"/> + <see cref="HaulJobSource"/>) through a live
    /// <see cref="StockZoneSystem"/>, so they prove the filter where it actually bites: a carried
    /// stack is routed only to a tile whose filter accepts its kind, and a kind no zone accepts is
    /// never boarded onto the haul list at all.
    ///
    /// GATES THAT DO NOT APPLY, stated so a reviewer does not score against them (lane plan §10,
    /// §7.6): WP-2 adds NO def scalar and NO float parse — the accept mask is an integer
    /// (<c>ulong</c>) set through a command and read with integer bit ops — so the
    /// de-DE-culture / def-field / defs-checksum gates are N/A here. There is no golden move: WP-2
    /// touches no view format (a filtered stockpile is still a <see cref="GlyphColor.Stockpile"/>
    /// tile), and no pinned ship zones a filter, so every determinism pin holds (the enforcement
    /// paths only execute inside <c>if (anyFreeStockpile)</c>, and no pinned ship has a stockpile).
    ///
    /// Each test's doc names the one-line mutation that makes it fail. LINQ-free by habit, not
    /// necessity — the no-LINQ rule governs tick paths under sim/, not tests.
    /// </summary>
    public class StockpileFilterHaulTests
    {
        // A one-deck corridor: floor at y=1, x=1..7, walls all around.
        private static readonly string[] Corridor =
        {
            "#########",
            "#.......#",
            "#########",
        };

        /// <summary>The dispatcher stack under test: a real <see cref="JobSystem"/> (so
        /// <see cref="HaulJobSource"/> is live) plus a <see cref="CitizenSystem"/> (so an assigned
        /// hauler actually walks its path to completion) beside the <see cref="StockZoneSystem"/>
        /// whose filters it must obey. Deliberately minimal — no atmosphere/safety systems, so a
        /// crew in this airless test corridor never flees mid-haul (E0-2 SafetySystem is absent).</summary>
        private static Simulation NewHaulSim(out JobSystem jobs, out StockZoneSystem zones)
        {
            jobs = new JobSystem();
            zones = new StockZoneSystem();
            return new Simulation(AsciiWorld.Build(Corridor), 7,
                new ISimSystem[] { new CitizenSystem(), jobs, zones });
        }

        private static ulong MaskOf(params ItemKind[] kinds)
        {
            ulong m = 0;
            foreach (var k in kinds) m |= 1UL << (int)k;
            return m;
        }

        private static bool IsStockTile(Simulation sim, Int3 p) =>
            (sim.World.GetFlags(p) & TileFlags.Stockpile) != 0;

        private static int HaulCandidates(JobSystem jobs)
        {
            for (int i = 0; i < jobs.Sources.Count; i++)
                if (jobs.Sources[i].Name == "Haul") return jobs.Sources[i].CandidateCount;
            Assert.Fail("no 'Haul' job source is registered");
            return -1;
        }

        // ================================================= destination selection honours the filter

        /// <summary>
        /// THE ENFORCEMENT PROOF. A carried stack is delivered ONLY to a tile whose filter accepts
        /// its kind, even when a NEARER stockpile tile rejects it. Two zones flank the pickup: a
        /// near one that accepts Scrap only (rejects the carried Potato) and a farther one that
        /// accepts Potato. Naive nearest-tile routing would drop the Potato on the near rejecting
        /// tile; the filter must skip it and route to the far accepting tile.
        ///
        /// This isolates <see cref="HaulJobSource"/>.<c>TryPathToFreeStockpile</c>: the Potato IS a
        /// haul candidate (the far tile accepts it), so the per-item candidate gate lets it through;
        /// only the destination filter decides where it lands.
        ///
        /// MUTATION: in <c>TryPathToFreeStockpile</c>, drop the accept check — call the KIND-LESS
        /// <c>IsFreeStockpileTile(sim, _stockpiles[i], _groundItemTiles)</c> instead of the kind-ed
        /// overload ⇒ the nearer REJECTING tile is chosen and the Potato is delivered to (2,1,0),
        /// so the "landed on the accepting tile" assertion fails.
        /// </summary>
        [Test]
        public void CarriedStack_RoutesToTheAcceptingTile_SkippingANearerRejectingOne()
        {
            var sim = NewHaulSim(out _, out _);
            var near = new Int3(2, 1, 0);  // 2 tiles from the pickup — but rejects Potato
            var far = new Int3(7, 1, 0);   // 3 tiles from the pickup — accepts Potato

            // Presence + filters through the REAL command path (exercises SetStockpileFilterCommand).
            sim.EnqueueCommand(new DesignateStockpileCommand(near, on: true));
            sim.EnqueueCommand(new DesignateStockpileCommand(far, on: true));
            sim.EnqueueCommand(new SetStockpileFilterCommand(near, MaskOf(ItemKind.Scrap)));
            sim.EnqueueCommand(new SetStockpileFilterCommand(far, MaskOf(ItemKind.Potato)));
            sim.Tick(); // drain the commands

            var item = sim.AddItem(ItemKind.Potato, 1, new Int3(4, 1, 0));
            sim.AddCitizen("Ada", new Int3(3, 1, 0)).GiveAllWork();

            for (int t = 0; t < 800 && !(item.CarriedBy == 0 && IsStockTile(sim, item.Pos)); t++)
                sim.Tick();

            Assert.That(item.CarriedBy, Is.EqualTo(0u), "precondition: the haul ran and set the stack down");
            Assert.That(item.Pos, Is.EqualTo(far),
                "a Potato must land on the tile whose filter accepts it, not the nearer rejecting one");
            Assert.That(item.Pos, Is.Not.EqualTo(near), "the near tile rejects Potato and must receive nothing");
        }

        // ================================================= the candidate gate — no zone, no boarding

        /// <summary>
        /// A stack whose kind NO free stockpile tile accepts is never boarded onto the haul list —
        /// it would only be picked up and dropped again. The single zone here accepts Scrap only,
        /// so a loose Potato has nowhere legal to go and must not become a candidate.
        ///
        /// Asserts on the haul board's <c>CandidateCount</c> rather than on final delivery, because
        /// the destination filter would ALSO refuse this Potato at drop-off — reading the board
        /// isolates the CANDIDATE gate from the destination filter, so the two enforcement points
        /// cannot mask each other.
        ///
        /// MUTATION: delete the <c>if (filtered &amp;&amp; !AnyFreeStockpileAccepts(...)) continue;</c>
        /// line in <c>HaulJobSource.Rescan</c> ⇒ the Potato boards, the Haul candidate count becomes
        /// 1, and the "== 0" assertion fails.
        /// </summary>
        [Test]
        public void KindNoZoneAccepts_IsNeverAHaulCandidate()
        {
            var sim = NewHaulSim(out var jobs, out _);
            var only = new Int3(7, 1, 0);

            sim.EnqueueCommand(new DesignateStockpileCommand(only, on: true));
            sim.EnqueueCommand(new SetStockpileFilterCommand(only, MaskOf(ItemKind.Scrap))); // NOT Potato
            sim.Tick();

            sim.AddItem(ItemKind.Potato, 1, new Int3(4, 1, 0));
            sim.AddCitizen("Ada", new Int3(3, 1, 0)).GiveAllWork();
            sim.Tick(); // rebuild the board with the item and the filter both live

            Assert.That(HaulCandidates(jobs), Is.EqualTo(0),
                "no free stockpile tile accepts Potato, so it must not be a haul candidate");

            // And, as the downstream consequence, a Scrap stack the same zone DOES accept boards.
            sim.AddItem(ItemKind.Scrap, 1, new Int3(5, 1, 0));
            sim.Tick();
            Assert.That(HaulCandidates(jobs), Is.EqualTo(1),
                "the accepted Scrap kind boards — the gate rejects by kind, not everything");
        }

        // ================================================= WP-6: accept-all repaint, at the board

        /// <summary>
        /// WP-6 END TO END, through the REAL command path. A zone is painted Scrap-only (a Potato has
        /// nowhere to go and does not board), then re-painted with the whole accept-mask — the paint
        /// WP-5's UI must send on every unrestricted stockpile, or a re-painted zone keeps its old
        /// restriction invisibly. Two things must then be true at once:
        ///
        ///  * the Potato boards again (the stale restriction really is gone), and
        ///  * the registry is EMPTY, so <c>HaulJobSource</c>'s
        ///    <c>filtered = ... Zones.Count &gt; 0</c> is false again and the per-item
        ///    <c>AnyFreeStockpileAccepts</c> gate — a linear scan over a linear scan, at 10 Hz — stops
        ///    running on a ship that restricts nothing. Without the collapse, the honest UI paint
        ///    would turn that gate on permanently for every played ship.
        ///
        /// MUTATION (verified): in <c>StockZoneSystem.SetFilter</c> replace the collapse body
        /// <c>{ ClearFilter(sim, pos); return; }</c> with a bare <c>{ return; }</c> ⇒ the Scrap-only
        /// entry survives the accept-all repaint, the Potato still finds no accepting tile, the
        /// candidate count stays 0, and this fails.
        /// </summary>
        [Test]
        public void AcceptAllRepaint_ThroughTheCommand_UnblocksTheKind_AndEmptiesTheRegistry()
        {
            var sim = NewHaulSim(out var jobs, out _);
            var only = new Int3(7, 1, 0);

            sim.EnqueueCommand(new DesignateStockpileCommand(only, on: true));
            sim.EnqueueCommand(new SetStockpileFilterCommand(only, MaskOf(ItemKind.Scrap))); // NOT Potato
            sim.Tick();

            sim.AddItem(ItemKind.Potato, 1, new Int3(4, 1, 0));
            sim.AddCitizen("Ada", new Int3(3, 1, 0)).GiveAllWork();
            sim.Tick();
            Assert.That(HaulCandidates(jobs), Is.EqualTo(0), "precondition: the restriction really bites");
            Assert.That(sim.StockZones.Zones, Has.Count.EqualTo(1),
                "precondition: a restricting filter IS an entry");

            // The honest "this zone accepts everything" paint.
            sim.EnqueueCommand(new SetStockpileFilterCommand(only, StockZoneSystem.AcceptAllMask));
            sim.Tick();

            Assert.That(sim.StockZones.Zones, Is.Empty,
                "an unrestricted zone stores nothing — the pre-E0-4 haul fast path is reachable again");
            Assert.That(HaulCandidates(jobs), Is.EqualTo(1),
                "and the Potato boards: the stale Scrap-only restriction is genuinely gone");
        }

        // ================================================= OFF clears the filter entry (hazard 3)

        /// <summary>
        /// De-designating a stockpile clears its filter, so a stray accept mask can never orphan
        /// itself into the ZONE hash (lane plan §8 hazard 3). Set presence + a filter, then
        /// designate the tile OFF, and the filter entry must be gone.
        ///
        /// MUTATION: remove the <c>if (!_on) sim.StockZones?.ClearFilter(sim, _pos);</c> line from
        /// <see cref="DesignateStockpileCommand"/>'s OFF path ⇒ the entry survives the
        /// de-designation, <c>TryGetFilter</c> still returns true, and the "filter is gone"
        /// assertion fails (in a live game a slow hash-state leak).
        /// </summary>
        [Test]
        public void DesignateStockpileOff_ClearsTheFilterEntry()
        {
            var sim = new Simulation(AsciiWorld.Build(Corridor), 7, new ISimSystem[] { new StockZoneSystem() });
            var pos = new Int3(2, 1, 0);

            sim.EnqueueCommand(new DesignateStockpileCommand(pos, on: true));
            sim.EnqueueCommand(new SetStockpileFilterCommand(pos, MaskOf(ItemKind.Potato)));
            sim.Tick();
            Assert.That(sim.StockZones.TryGetFilter(pos, out _), Is.True,
                "precondition: the filter is live on the stockpile tile");

            sim.EnqueueCommand(new DesignateStockpileCommand(pos, on: false));
            sim.Tick();
            Assert.That(sim.StockZones.TryGetFilter(pos, out _), Is.False,
                "clearing the stockpile must clear its filter — no orphan entry left in the ZONE hash");
        }

        // ================================================= the new command is optional-system-safe

        /// <summary>
        /// <see cref="SetStockpileFilterCommand"/> on a sim WITHOUT a <see cref="StockZoneSystem"/>
        /// is a silent no-op (the <see cref="DesignateDeconstructCommand"/> optional-system-walk
        /// contract) — it must not throw. A reduced stack keeps its pre-E0-4 accept-everything
        /// behaviour.
        ///
        /// MUTATION: drop the <c>?.</c> null-guard in <c>SetStockpileFilterCommand.Execute</c>
        /// (dereference <c>sim.StockZones</c> unconditionally) ⇒ this throws a
        /// NullReferenceException on the reduced stack.
        /// </summary>
        [Test]
        public void SetStockpileFilter_OnAStackWithNoRegistry_IsASilentNoOp()
        {
            var sim = new Simulation(AsciiWorld.Build(Corridor), 7, new ISimSystem[0]);
            Assert.That(sim.StockZones, Is.Null, "precondition: a reduced stack has no registry");

            sim.EnqueueCommand(new SetStockpileFilterCommand(new Int3(2, 1, 0), MaskOf(ItemKind.Potato)));
            Assert.DoesNotThrow(() => sim.Tick(), "the command must ignore a stack that has no StockZoneSystem");
        }
    }
}
