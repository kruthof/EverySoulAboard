using System.Globalization;
using System.Threading;
using NUnit.Framework;
using Perilune.Llm;
using Perilune.Sim;

namespace Perilune.Tests.Llm
{
    /// <summary>
    /// The <c>[SHIP]</c> grounding block behind <see cref="CitizenContext"/>. Before it existed
    /// the snapshot handed the model persona, mood, memories and legal effects and NOTHING about
    /// the ship — so a live model asked "how are things?" invented a CO2 crisis and promised a
    /// repair it structurally cannot perform. These tests pin what the block reports (worst-room
    /// air, machines in trouble, the crew member's own job), that it is a PURE read (no sim
    /// mutation, no room recompute, no hash move), and that it is byte-deterministic and
    /// culture-invariant so it stays cheap to diff turn-over-turn.
    /// </summary>
    [TestFixture]
    public sealed class ShipContextTests
    {
        private static ConversationRequest Snapshot(ConversationTestScenario.Fixture fx, uint? cid = null)
        {
            var manifest = new CapabilityManifest();
            uint id = cid ?? fx.CitizenId;
            new CapabilityComputer().Compute(fx.Sim, fx.Minds, fx.Facts, id, manifest);
            return CitizenContext.Build(fx.Sim, fx.Minds, fx.Facts, manifest, id);
        }

        [Test]
        public void ShipState_Reports_Air_Machines_And_The_Crew_Members_Own_Job()
        {
            var fx = ConversationTestScenario.Build();
            string ship = Snapshot(fx).ShipState;

            Assert.That(ship, Is.Not.Empty, "every snapshot carries ship grounding");
            string[] lines = ship.Split('\n');
            Assert.That(lines.Length, Is.EqualTo(3), "exactly three compact lines: air, machines, own job");
            Assert.That(lines[0], Does.StartWith("Air: "));
            Assert.That(lines[0], Does.Contain("ppm CO2"));
            Assert.That(lines[1], Does.StartWith("Machines: "));
            Assert.That(lines[2], Does.StartWith("Your job right now: "));

            // A pristine fixture: nothing is broken and nobody has a job — and it SAYS so, which
            // is the whole point (an idle crew member must not sound busy or alarmed).
            Assert.That(lines[1], Is.EqualTo("Machines: every machine aboard is running."));
            Assert.That(lines[2], Does.Contain("nothing assigned"));
            Assert.That(lines[0], Does.Contain("(normal)"), "a healthy compartment is not reported as a crisis");
        }

        [Test]
        public void Air_Line_Names_The_Worst_Compartment_And_Grades_It()
        {
            var fx = ConversationTestScenario.Build();
            // Foul the right-hand room (anchored "right") well past the bad threshold.
            Room right = fx.Sim.Rooms.RoomAt(fx.Sim.World, new Int3(8, 2, 0));
            right.CO2Moles = right.TotalMoles;   // ~1e6 ppm — unmistakably the worst room

            string air = Snapshot(fx).ShipState.Split('\n')[0];
            Assert.That(air, Does.Contain("the right"), "the worst compartment is named from its anchor");
            Assert.That(air, Does.Contain("(bad)"), "a genuinely foul room is graded bad");
            Assert.That(air, Does.Contain("Everywhere else is better than that."),
                "the block bounds the claim so the model cannot generalise a ship-wide crisis");
        }

        [Test]
        public void Machine_Line_Names_Failed_And_Worn_Machines_Only()
        {
            var fx = ConversationTestScenario.Build();
            Device scrubber = null, tank = null;
            foreach (var d in fx.Sim.Devices.Items)
            {
                if (d.Name == "scrubber") scrubber = d;
                if (d.Name == "tank") tank = d;
            }
            Assert.That(scrubber, Is.Not.Null);
            Assert.That(tank, Is.Not.Null);

            scrubber.Condition = 0f;    // below FailBelow ⇒ failed
            tank.Condition = 0.4f;      // still operational, but wearing out

            string machines = Snapshot(fx).ShipState.Split('\n')[1];
            Assert.That(machines, Does.Contain("scrubber has failed"));
            Assert.That(machines, Does.Contain("tank is wearing out"));
            Assert.That(machines, Does.Not.Contain("battery"), "healthy machines are not listed");
        }

        [Test]
        public void Own_Job_Line_Names_The_Machine_Being_Serviced()
        {
            var fx = ConversationTestScenario.Build();
            Citizen c = null;
            foreach (var x in fx.Sim.Citizens.Items) if (x.Id == fx.CitizenId) c = x;
            Assert.That(c, Is.Not.Null);

            c.JobKind = JobKind.Maintain;
            c.JobTarget = new Int3(10, 1, 0);   // the scrubber's tile
            Assert.That(Snapshot(fx).ShipState.Split('\n')[2], Is.EqualTo("Your job right now: servicing scrubber."));

            c.JobKind = JobKind.Dig;
            c.JobTarget = new Int3(3, 1, 0);
            Assert.That(Snapshot(fx).ShipState.Split('\n')[2],
                Is.EqualTo("Your job right now: clearing debris at 3,1 on deck 0."));
        }

        [Test]
        public void ShipState_Is_Deterministic_And_Pure()
        {
            var fx = ConversationTestScenario.Build();
            ulong before = fx.Sim.StateHash();
            string a = Snapshot(fx).ShipState;
            string b = Snapshot(fx).ShipState;
            ulong after = fx.Sim.StateHash();

            Assert.That(b, Is.EqualTo(a), "same sim state ⇒ byte-identical block");
            Assert.That(after, Is.EqualTo(before), "building the snapshot never touches hashed sim state");
        }

        [Test]
        public void ShipState_Is_CultureInvariant()
        {
            var fx = ConversationTestScenario.Build();
            Room right = fx.Sim.Rooms.RoomAt(fx.Sim.World, new Int3(8, 2, 0));
            right.CO2Moles = right.TotalMoles * 0.002; // a few thousand ppm — a number with digits

            CultureInfo prev = Thread.CurrentThread.CurrentCulture;
            string de, inv;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                de = Snapshot(fx).ShipState;
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                inv = Snapshot(fx).ShipState;
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }

            Assert.That(de, Is.EqualTo(inv), "ppm/tile numbers use InvariantCulture, never a locale comma");
        }

        [Test]
        public void ShipState_Survives_A_Mindless_Or_Unknown_Citizen_Without_Throwing()
        {
            var fx = ConversationTestScenario.Build();

            // Unknown citizen ⇒ an empty request; the prompt then simply omits the [SHIP] block.
            Assert.That(Snapshot(fx, 99999u).ShipState, Is.Empty);
        }
    }
}
