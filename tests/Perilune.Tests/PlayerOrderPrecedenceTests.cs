using System.IO;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-3 — player-order precedence. The revisit E0-1 explicitly parked.
    ///
    /// E0-1 relaxed <see cref="Citizen.IsIdleForWork"/> (dropping <c>&amp;&amp; !HasPath</c>) so a
    /// wandering crew member could be offered work. A <c>MoveCitizenCommand</c> order also carries
    /// <c>JobKind.None</c>, so the same relaxation made an explicit player order hijackable by an
    /// auto-assignment mid-walk. That stayed LATENT only because the web client had no verb that
    /// could create work — which is exactly what the rest of E0-3 adds. Hence the fix lands here.
    ///
    /// The contract: an order suppresses auto-WORK for the duration of the walk, and nothing else.
    /// Survival (self-serve needs, fleeing lethal air) still interrupts it, and the guard cannot
    /// outlive the walk.
    /// </summary>
    public class PlayerOrderPrecedenceTests
    {
        // A 12×3 corridor with rubble at the far end: an ordered walk is long enough to be
        // interrupted, and there is real work on offer the whole time.
        private static readonly string[] Deck =
        {
            "############",
            "#.........R#",
            "############",
        };

        private static Simulation Build()
        {
            var moss = new ScriptRuntime(new DeviceRegistry());
            return new Simulation(AsciiWorld.Build(Deck), 42, SystemStack.CreateDefault(moss));
        }

        [Test]
        public void AnOrderedWalkIsNotHijackedByAutoWork()
        {
            var sim = Build();
            var crew = sim.AddCitizen("Okafor", new Int3(1, 1, 0));
            sim.EnqueueCommand(new DesignateDigCommand(new Int3(10, 1, 0), on: true));
            sim.Tick();

            // Order them to a tile that is NOT the dig site, while a dig job is on offer.
            sim.EnqueueCommand(new MoveCitizenCommand(crew.Id, new Int3(5, 1, 0)));
            sim.Tick();
            Assert.That(crew.OrderedMove, Is.True, "the order should have taken");
            Assert.That(crew.HasPath, Is.True);

            // Walk most of the way. Without the guard the dispatcher claims them on tick 1.
            for (int i = 0; i < 20 && crew.HasPath; i++)
            {
                Assert.That(crew.JobKind, Is.EqualTo(JobKind.None),
                    "auto-work hijacked an explicit player order mid-walk");
                sim.Tick();
            }
        }

        [Test]
        public void ArrivalReleasesTheOrderAndTheCrewBecomeRecruitableAgain()
        {
            var sim = Build();
            var crew = sim.AddCitizen("Okafor", new Int3(1, 1, 0));
            sim.EnqueueCommand(new DesignateDigCommand(new Int3(10, 1, 0), on: true));
            sim.Tick();

            sim.EnqueueCommand(new MoveCitizenCommand(crew.Id, new Int3(5, 1, 0)));
            for (int i = 0; i < 400 && crew.JobKind == JobKind.None; i++) sim.Tick();

            Assert.That(crew.OrderedMove, Is.False, "arrival must clear the order claim");
            Assert.That(crew.JobKind, Is.EqualTo(JobKind.Dig),
                "the order bought the walk, not permanent idleness — work resumes after it");
        }

        /// <summary>An unreachable target must not leave the citizen flagged: the order never
        /// started, so it cannot be allowed to lock them out of work.</summary>
        [Test]
        public void AnUnreachableOrderLeavesTheCrewPlainlyRecruitable()
        {
            var sim = Build();
            var crew = sim.AddCitizen("Okafor", new Int3(1, 1, 0));
            sim.Tick();

            sim.EnqueueCommand(new MoveCitizenCommand(crew.Id, new Int3(0, 0, 0))); // solid wall
            sim.Tick();

            Assert.That(crew.OrderedMove, Is.False);
            Assert.That(crew.IsRecruitableForWork, Is.True);
        }

        /// <summary>
        /// The line between WORK and SURVIVAL. Auto-work is suppressed by an order; self-serve is
        /// not. SustenanceSystem keeps using IsIdleForWork precisely so a player order can never be
        /// a way to starve someone — the same principle as E0-2's SafetySystem letting a working
        /// crew member flee lethal air.
        /// </summary>
        [Test]
        public void AnOrderSuppressesWorkButNeverSurvival()
        {
            var sim = Build();
            var crew = sim.AddCitizen("Okafor", new Int3(1, 1, 0));
            sim.AddDevice(DeviceKind.WaterTank, new Int3(8, 1, 0), "tank").StoredLiters = 250f;
            sim.EnqueueCommand(new DesignateDigCommand(new Int3(10, 1, 0), on: true));
            sim.Tick();

            sim.EnqueueCommand(new MoveCitizenCommand(crew.Id, new Int3(3, 1, 0)));
            sim.Tick();
            Assert.That(crew.OrderedMove, Is.True);

            // Mid-order, they cross a real thirst threshold.
            crew.Thirst = 1.0f;
            sim.Tick();

            Assert.That(crew.IsRecruitableForWork, Is.False, "work stays suppressed by the order");
            Assert.That(crew.IsIdleForWork, Is.True, "survival is NOT suppressed by the order");
        }

        /// <summary>
        /// The guard is <c>OrderedMove &amp;&amp; HasPath</c> so it cannot outlive the walk. The
        /// systems permitted to interrupt an order overwrite the citizen's path wholesale; a bare
        /// flag surviving such an interrupt would strand that crew member permanently unrecruitable
        /// — a silent, unrecoverable idle bug rather than a visible one.
        /// </summary>
        [Test]
        public void AStaleOrderFlagWithNoPathCannotStrandACrewMember()
        {
            var sim = Build();
            var crew = sim.AddCitizen("Okafor", new Int3(1, 1, 0));
            sim.Tick();

            crew.OrderedMove = true;   // as if an interrupt had overwritten the path and missed the clear
            crew.ClearPath();

            Assert.That(crew.HasPath, Is.False);
            Assert.That(crew.IsRecruitableForWork, Is.True,
                "the guard must only bite while an ordered walk is actually in progress");
        }

        /// <summary>Every saved field is hashed and round-trips (the standing invariant).</summary>
        [Test]
        public void OrderedMoveSurvivesSaveLoadAndIsHashed()
        {
            var sim = Build();
            var crew = sim.AddCitizen("Okafor", new Int3(1, 1, 0));
            sim.Tick();
            sim.EnqueueCommand(new MoveCitizenCommand(crew.Id, new Int3(8, 1, 0)));
            sim.Tick();
            Assert.That(crew.OrderedMove, Is.True, "precondition: an order is in flight");

            ulong before = sim.StateHash();

            using var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;
            var loaded = SaveReader.Read(ms, SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));

            Assert.That(loaded.Citizens.Items[0].OrderedMove, Is.True, "OrderedMove must round-trip");
            Assert.That(loaded.StateHash(), Is.EqualTo(before), "a loaded sim must hash identically");

            // And the field must actually MOVE the hash — a field that is saved but not folded is
            // the exact bug W0-1b existed to clean up across thirteen other fields.
            loaded.Citizens.Items[0].OrderedMove = false;
            Assert.That(loaded.StateHash(), Is.Not.EqualTo(before), "OrderedMove is not folded");
        }
    }
}
