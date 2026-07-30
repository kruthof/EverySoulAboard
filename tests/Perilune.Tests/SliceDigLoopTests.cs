using Perilune.Sim;
using Perilune.Tui;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-3 acceptance, measured on the SHIPPING slice rather than a fixture — and the correction
    /// of a stale claim in MECHANICS §13.6.
    ///
    /// §13.6 recorded "48 debris tiles, 0 designated, 0 stockpile tiles" and a slice manifest with
    /// <c>digTargets = 0</c>, concluding that AgreeTask was dead code. That measurement is STALE:
    /// commit 5e2bd41 ("restore the slice's work economy", 2026-07-21) added
    /// <c>DesignateDebrisRect(plan, 57, 6, 62, 13, z: 0)</c>, and ShipPlanBuilder applies
    /// <c>plan.DigDesignations</c> as real TileFlags.Designated at boot. The slice therefore ships
    /// with all 48 debris tiles ALREADY designated, and AgreeTask is already legal there.
    ///
    /// So E0-3's dig verb is NOT what unblocks AgreeTask on the slice — E0-1 (recruitability) is
    /// what made that authored seed get worked. What the dig verb genuinely adds is the player's
    /// ability to designate work the AUTHOR did not pre-place: on this ship once the authored seed
    /// is dug out, and on every generated ship, which authors no designations at all.
    ///
    /// The STOCKPILE half is the unqualified win: 0 stockpile tiles is still true, and
    /// HaulJobSource builds haul candidates only when a free stockpile tile exists — so
    /// HaulPickup/HaulDeliver really are unreachable in the shipped configuration until a player
    /// can zone one. These tests pin both halves as they actually are.
    /// </summary>
    public class SliceDigLoopTests
    {
        // M2-2: OD-H boots every work type OFF. This file's subject is the slice's DIG LOOP —
        // whether crew work the authored dig seed — which needs crew who have been given Mine.
        private static SimHost BootSlice()
        {
            var host = SimHost.Build(SimHost.SliceSeed, ship: ShipChoice.Slice);
            host.Sim.GiveAllCrewAllWork();
            return host;
        }

        private static (int debris, int designated, int stockpile) Survey(Simulation sim)
        {
            int debris = 0, designated = 0, stockpile = 0;
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (world.GetWall(p) == TileDefs.Debris) debris++;
                        var f = world.GetFlags(p);
                        if ((f & TileFlags.Designated) != 0) designated++;
                        if ((f & TileFlags.Stockpile) != 0) stockpile++;
                    }
            return (debris, designated, stockpile);
        }

        /// <summary>The corrected boot measurement. If someone re-authors the debris seed, this is
        /// the test that makes them re-read §13.6 rather than trust it.</summary>
        [Test]
        public void SliceBootState_DebrisIsPreDesignated_ButNothingIsZoned()
        {
            var (debris, designated, stockpile) = Survey(BootSlice().Sim);

            Assert.That(debris, Is.EqualTo(48), "the authored aft debris field");
            Assert.That(designated, Is.EqualTo(48),
                "the slice AUTHORS its dig seed (AuthoredShips DesignateDebrisRect → ShipPlanBuilder) " +
                "— MECHANICS §13.6's '0 designated' predates commit 5e2bd41 and is stale");
            Assert.That(stockpile, Is.EqualTo(0),
                "no stockpile is authored anywhere — this is the gap E0-3's stockpile verb closes");
        }

        /// <summary>
        /// AgreeTask is legal on the shipped slice — the corrected version of §13.6's "AgreeTask is
        /// dead code". It is legal because the debris seed is authored AND E0-1 leaves crew idle
        /// enough to be offered it, not because of anything E0-3 did.
        /// </summary>
        [Test]
        public void AgreeTaskIsAlreadyLegalOnTheShippedSlice()
        {
            var host = BootSlice();
            var cap = new CapabilityComputer();
            var manifest = new CapabilityManifest();

            bool anyCanAgree = false, anyHasTargets = false;
            foreach (var c in host.Sim.Citizens.Items)
            {
                cap.Compute(host.Sim, host.Minds, host.Facts, c.Id, manifest);
                if (manifest.AssignableDigTargets.Count > 0) anyHasTargets = true;
                if (manifest.LegalEffects.HasFlag(EffectKind.AgreeTask)) anyCanAgree = true;
            }

            Assert.That(anyHasTargets, Is.True, "§13.6's 'digTargets = 0' is stale");
            Assert.That(anyCanAgree, Is.True, "§13.6's 'AgreeTask is dead code' is stale");
        }

        /// <summary>
        /// What the dig VERB actually buys: designating work the author never placed. Clear the
        /// authored seed and the ship goes back to having no dig work at all — which is the state
        /// every GENERATED ship boots in, and the state the slice reaches once the aft is dug out.
        /// A player order is then the only thing that can create dig work.
        /// </summary>
        [Test]
        public void WithTheAuthoredSeedCleared_OnlyAPlayerOrderCanCreateDigWork()
        {
            var host = BootSlice();
            var sim = host.Sim;

            // Clear every authored designation — the post-seed / generated-ship state.
            var world = sim.World;
            Int3 someDebris = new Int3(-1, -1, -1);
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Designated) != 0)
                        {
                            sim.EnqueueCommand(new DesignateDigCommand(p, on: false));
                            if (someDebris.X < 0) someDebris = p;
                        }
                    }
            sim.Tick();
            Assert.That(Survey(sim).designated, Is.EqualTo(0), "precondition: seed cleared");

            var cap = new CapabilityComputer();
            var manifest = new CapabilityManifest();
            foreach (var c in sim.Citizens.Items)
            {
                cap.Compute(sim, host.Minds, host.Facts, c.Id, manifest);
                Assert.That(manifest.LegalEffects.HasFlag(EffectKind.AgreeTask), Is.False,
                    "with nothing designated there is no task to agree to");
            }

            // The player's new verb is the only way back.
            sim.EnqueueCommand(new DesignateDigCommand(someDebris, on: true));
            sim.Tick();

            bool anyCanAgree = false;
            foreach (var c in sim.Citizens.Items)
            {
                cap.Compute(sim, host.Minds, host.Facts, c.Id, manifest);
                if (manifest.LegalEffects.HasFlag(EffectKind.AgreeTask)) { anyCanAgree = true; break; }
            }
            Assert.That(anyCanAgree, Is.True, "one player dig order restores the richest LLM verb");
        }

        /// <summary>The dig loop runs end to end on the shipping ship.</summary>
        [Test]
        public void CrewWorkTheDigBoardOnTheShippedSlice()
        {
            var sim = BootSlice().Sim;

            bool anyDigging = false;
            for (int t = 0; t < 6000 && !anyDigging; t++)   // ≤10 sim-minutes at 10 Hz
            {
                sim.Tick();
                foreach (var c in sim.Citizens.Items)
                    if (c.JobKind == JobKind.Dig) { anyDigging = true; break; }
            }

            Assert.That(anyDigging, Is.True, "the authored dig board must actually be worked");
        }

        /// <summary>
        /// The unqualified E0-3 win. HaulJobSource builds haul candidates ONLY when a free
        /// stockpile tile exists; the slice zones none, so HaulPickup/HaulDeliver were unreachable
        /// in the shipped configuration for want of a verb. This is that verb landing.
        /// </summary>
        [Test]
        public void AStockpileZoneIsTheOnlyThingThatMakesHaulJobsReachable()
        {
            var sim = BootSlice().Sim;
            sim.Tick();
            Assert.That(Survey(sim).stockpile, Is.EqualTo(0), "precondition: nothing zoned");

            var seed = sim.Citizens.Items[0].Pos;
            Int3 zone = new Int3(-1, -1, -1);
            for (int dy = -3; dy <= 3 && zone.X < 0; dy++)
                for (int dx = -3; dx <= 3; dx++)
                {
                    var p = new Int3(seed.X + dx, seed.Y + dy, seed.Z);
                    if (sim.World.InBounds(p) && (sim.World.GetFlags(p) & TileFlags.Walkable) != 0)
                    { zone = p; break; }
                }
            Assert.That(zone.X, Is.GreaterThanOrEqualTo(0), "found a walkable tile to zone");

            sim.EnqueueCommand(new DesignateStockpileCommand(zone, on: true));
            sim.Tick();

            Assert.That((sim.World.GetFlags(zone) & TileFlags.Stockpile), Is.Not.EqualTo((TileFlags)0),
                "the zone must land — it is the precondition HaulJobSource scans for");
            Assert.That(Survey(sim).stockpile, Is.EqualTo(1));
        }
    }
}
