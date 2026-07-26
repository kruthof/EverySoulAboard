using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// THE DECK-CONFINED IDLE WANDER (2026-07-25). <see cref="PathService.TryRandomWalkableTileNear"/>
    /// pins the sampled Z to <c>origin.Z</c>: an idle crew member wanders its own deck and never
    /// climbs a ladder for nothing. That let the standard play ship's eight crew flip to
    /// <c>AutoWander = true</c> (<see cref="AuthoredShips.PeriluneGrid"/>) without walking into the six
    /// decks that boot airless-but-walkable from the ladder trunk.
    ///
    /// ⚠️ EVERY TEST HERE IS DRIVEN, NOT SCANNED. A source scan over <c>PathService.cs</c> would
    /// assert that the tokens <c>zLo</c> and <c>origin.Z</c> are co-present; it could never assert
    /// that the sampler's OUTPUT stays on one deck, and (this repo's most-repeated defect) it would
    /// pass just as happily with the fix sitting in a comment. These call the real method against a
    /// real multi-deck ship and read the tiles that come back.
    ///
    /// ⚠️ AND THE FIXTURE IS PROVED NON-VACUOUS, because "every draw was on the origin's deck" is
    /// trivially true on a single-deck map. <see cref="TheOldZBoxedRule_ReallyDoesLeaveTheDeck_OnThisFixture"/>
    /// runs the PRE-CHANGE box over the same ship, seed and draw count and shows it leaves the deck on
    /// the large majority of draws. That test is the only place in this file that reimplements box
    /// math, it is characterising HISTORY rather than production code, and if the grid ship ever loses
    /// its ladder trunk or its decks it goes red — telling you the pin above has gone hollow instead of
    /// letting it quietly stop meaning anything.
    /// </summary>
    public class DeckConfinedWanderTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        // Written out by hand, never read back from the def/authoring constants they characterise —
        // a test that derives its expectation from the value under test cannot fail when it changes.
        private const int GridDepth = 8;              // AuthoredShips.GridDepth
        private const int LiveWanderRadius = 8;       // CitizenDefs.WanderRadiusTiles (content/core/SimDefs/citizen.def)
        private const int DrawsPerOrigin = 400;

        /// <summary>One walkable tile per deck, found by a deterministic scan (canonical z,y,x order),
        /// so the origins below cover every deck of the ship including the airless ones the ladder
        /// trunk reaches.</summary>
        private static List<Int3> OneWalkableTilePerDeck(Simulation sim)
        {
            var origins = new List<Int3>();
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (!sim.IsWalkable(p)) continue;
                        origins.Add(p);
                        y = world.Height; break;   // first walkable tile on this deck is enough
                    }
            return origins;
        }

        /// <summary>
        /// THE PIN. Drive the real sampler over the real grid ship from a walkable tile on EVERY deck,
        /// at three radii (one tile, the live def value, and a radius far larger than the ship), and
        /// assert every tile it hands back sits on the origin's own deck.
        ///
        /// NAMED MUTATION (reviewer applies): restore the old Z box in
        /// <c>PathService.TryRandomWalkableTileNear</c> —
        /// <c>int zLo = origin.Z - radius; if (zLo &lt; 0) zLo = 0; int zHi = origin.Z + radius; if (zHi &gt;= world.Depth) zHi = world.Depth - 1;</c>
        /// — and this fails on the first off-deck draw. PHYSICALLY APPLIED, and the message it printed:
        /// <c>the idle sampler left deck 0: origin (1,1,0), radius 1, target (2,2,1)</c> — i.e. it dies
        /// in the very first leg, before the radius even matters. A WEAKER mutation also bites, and was
        /// also physically applied: box Z at a literal <c>±1</c> instead of pinning it, and the same
        /// first leg fails with the same message (a neighbouring deck is one ladder tile away).
        /// </summary>
        [Test]
        public void WanderTarget_NeverLeavesTheOriginDeck_OnTheGridShip()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());
            Assert.That(sim.World.Depth, Is.EqualTo(GridDepth),
                "fixture: this pin is vacuous on a single-deck world — the grid ship must be 8 decks deep");

            var origins = OneWalkableTilePerDeck(sim);
            Assert.That(origins.Count, Is.EqualTo(GridDepth),
                "fixture: every deck must offer a walkable tile to wander from");

            int[] radii = { 1, LiveWanderRadius, 64 };
            int totalFound = 0, maxXyCheby = 0;
            foreach (var origin in origins)
                foreach (int radius in radii)
                {
                    var rng = new SimRng(20260725UL);
                    for (int i = 0; i < DrawsPerOrigin; i++)
                    {
                        if (!sim.Paths.TryRandomWalkableTileNear(sim, rng, origin, radius, out var target)) continue;
                        totalFound++;
                        Assert.That(target.Z, Is.EqualTo(origin.Z),
                            $"the idle sampler left deck {origin.Z}: origin {origin}, radius {radius}, " +
                            $"target {target}. An idle wander must never change deck — six of this ship's " +
                            "eight decks boot airless and the ladder trunk makes them walkable.");
                        int xy = System.Math.Max(System.Math.Abs(target.X - origin.X),
                                                 System.Math.Abs(target.Y - origin.Y));
                        if (xy > maxXyCheby) maxXyCheby = xy;
                    }
                }

            // Preconditions — a sampler that returned nothing, or that always returned the origin
            // tile, would satisfy the assertion above without meaning anything.
            Assert.That(totalFound, Is.GreaterThan(origins.Count * radii.Length * DrawsPerOrigin / 2),
                $"precondition: the sampler must actually return walkable targets (found {totalFound})");
            Assert.That(maxXyCheby, Is.GreaterThan(0),
                "precondition: draws must still spread in X/Y — pinning Z must not collapse the wander " +
                "onto the origin tile (the X/Y box is deliberately untouched)");
        }

        /// <summary>
        /// THE NON-VACUITY CONTROL, and the reason the pin above is worth anything. It replays the
        /// PRE-2026-07-25 rule — Z boxed by the radius exactly as X and Y are — over the same ship,
        /// the same origins, the same seed and the same draw count, and measures how often it leaves
        /// the deck. It is large: <c>wander_radius_tiles</c> (8) is ≥ the ship's depth (8), so the old
        /// box saturated all eight decks and only ~1 draw in 8 stayed home. MEASURED here:
        /// <b>87.5 % of 3 200 draws left the origin's deck</b> — 7/8 exactly, the uniform Z draw.
        /// The bar is set at a loose 50 % on purpose: this test's job is to catch a fixture that has
        /// gone flat, not to re-pin the historical rule's arithmetic.
        ///
        /// This is the ONLY reimplementation of sampler math in this file and it deliberately models
        /// code that no longer exists; it asserts a property of the FIXTURE ("off-deck draws were
        /// genuinely available here"), never of production code. If the grid ship ever loses its
        /// ladder trunk, its decks, or their walkable tiles, this goes red — which is the signal that
        /// <see cref="WanderTarget_NeverLeavesTheOriginDeck_OnTheGridShip"/> has become vacuous.
        ///
        /// NAMED MUTATION (reviewer applies): pin <c>zLo</c>/<c>zHi</c> to <c>origin.Z</c> in the local
        /// replay below (i.e. make the "old" rule the new one) and this fails at 0 % off-deck.
        /// </summary>
        [Test]
        public void TheOldZBoxedRule_ReallyDoesLeaveTheDeck_OnThisFixture()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());
            var origins = OneWalkableTilePerDeck(sim);

            int found = 0, offDeck = 0;
            foreach (var origin in origins)
            {
                var rng = new SimRng(20260725UL);
                for (int i = 0; i < DrawsPerOrigin; i++)
                {
                    if (!OldZBoxedSample(sim, rng, origin, LiveWanderRadius, out var target)) continue;
                    found++;
                    if (target.Z != origin.Z) offDeck++;
                }
            }

            Assert.That(found, Is.GreaterThan(0), "fixture: the historical sampler returned nothing at all");
            double pct = 100.0 * offDeck / found;
            Assert.That(pct, Is.GreaterThan(50.0),
                $"fixture: the pre-change rule left the origin's deck on only {pct:0.0} % of {found} draws. " +
                "The deck-confinement pin is only meaningful on a fixture where off-deck draws were " +
                "readily available; this one no longer is.");
        }

        /// <summary>The Z-boxed sampler as it stood before the deck confinement, byte-for-byte in
        /// draw order (X, Y, Z; ten attempts; the same <see cref="Simulation.IsWalkable"/> rule) so the
        /// control above measures the rule that was actually replaced. HISTORY ONLY — nothing in the
        /// shipping sim calls this.</summary>
        private static bool OldZBoxedSample(Simulation sim, SimRng rng, Int3 origin, int radius, out Int3 result)
        {
            var world = sim.World;
            int xLo = origin.X - radius; if (xLo < 0) xLo = 0;
            int xHi = origin.X + radius; if (xHi >= world.Width) xHi = world.Width - 1;
            int yLo = origin.Y - radius; if (yLo < 0) yLo = 0;
            int yHi = origin.Y + radius; if (yHi >= world.Height) yHi = world.Height - 1;
            int zLo = origin.Z - radius; if (zLo < 0) zLo = 0;
            int zHi = origin.Z + radius; if (zHi >= world.Depth) zHi = world.Depth - 1;

            for (int attempt = 0; attempt < 10; attempt++)
            {
                var p = new Int3(xLo + rng.NextInt(xHi - xLo + 1),
                                 yLo + rng.NextInt(yHi - yLo + 1),
                                 zLo + rng.NextInt(zHi - zLo + 1));
                if (sim.IsWalkable(p)) { result = p; return true; }
            }
            result = default;
            return false;
        }

        /// <summary>
        /// THE END-TO-END READING, because the sampler pin alone does not prove the shipped ship is
        /// better off. Boot the real grid ship with the real system stack, no player input, and watch
        /// where eight now-wandering crew actually go for ~42 sim-minutes: they must wander (or the
        /// test proves nothing), and they must never stand on a deck the ship boots airless.
        ///
        /// Decks 2..7 are the bar rather than "Z never changes", because a crew member who takes a JOB
        /// on deck 1 legitimately climbs the ladder — deck 1 is the wreck deck and it is pressurised.
        /// It is the idle DRAW that is deck-bounded, not the crew member.
        ///
        /// NAMED MUTATION (reviewer applies): restore the old Z box in
        /// <c>PathService.TryRandomWalkableTileNear</c> and this fails on the airless-deck assertion.
        /// PHYSICALLY APPLIED: <c>Novak is standing on deck 2 at tick 18539</c> with the full old box,
        /// and <c>Okonjo ... deck 2 at tick 18529</c> with the weaker <c>±1</c> box. Note how far in
        /// that is — the crew are busy digging for most of these 25 000 ticks, which is exactly why the
        /// end-to-end reading needs a run this long and why the sampler pin above carries the load.
        /// Flipping the eight crew back to <c>AutoWander = false</c> instead fails the "they actually
        /// wandered" precondition at <c>0 crew-ticks of jobless movement</c> (also applied).
        /// </summary>
        [Test]
        public void GridCrew_Wander_AndNeverStandOnAnAirlessDeck()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());

            var decksVisited = new HashSet<int>();
            int idleWanderTicks = 0;
            bool sawFlee = false;
            for (int t = 0; t < 25000; t++)     // ~42 sim-minutes, the GridWreckTests dig budget
            {
                sim.Tick();
                foreach (var c in sim.Citizens.Items)
                {
                    decksVisited.Add(c.Pos.Z);
                    if (c.JobKind == JobKind.None && c.HasPath) idleWanderTicks++;
                    if (c.JobKind == JobKind.Flee) sawFlee = true;
                    Assert.That(c.Pos.Z, Is.LessThanOrEqualTo(1),
                        $"{c.Name} is standing on deck {c.Pos.Z} at tick {t}: decks 2..7 boot sealed and " +
                        "AIRLESS, and only the ladder trunk makes them walkable. An idle wander must not " +
                        "go there.");
                }
            }

            Assert.That(idleWanderTicks, Is.GreaterThan(1000),
                $"precondition: the crew must actually be wandering while idle (saw {idleWanderTicks} " +
                "crew-ticks of jobless movement). With AutoWander=false this test asserts nothing.");
            Assert.That(decksVisited.Contains(0) && decksVisited.Contains(1), Is.True,
                "precondition: the crew must still use the ladder for WORK — deck confinement bounds the " +
                "idle draw, not the crew member");
            Assert.That(sawFlee, Is.False,
                "a crew member fled unbreathable air on a ship whose two live decks are pressurised — " +
                "the wander is putting them somewhere they should not be");
            foreach (var c in sim.Citizens.Items)
                Assert.That(c.Dead, Is.False, $"{c.Name} died wandering an idle ship");
        }
    }
}
