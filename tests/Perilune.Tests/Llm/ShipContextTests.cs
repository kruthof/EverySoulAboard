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
    /// repair it structurally cannot perform. The FIRST cut of the block then over-corrected: it
    /// reported only CO2 and <see cref="Device.Condition"/>, so an unpowered scrubber and a
    /// breached compartment both read as "every machine aboard is running" — and the prompt told
    /// the model that block was the whole truth, so it was instructed to DENY a fault the player
    /// could see. These tests pin what the block reports (air incl. pressure/oxygen, hull
    /// breaches and pressure loss, machines broken / unpowered / worn, water + food, the crew
    /// member's own job and whether they have actually STARTED it), that it is a PURE read (no sim
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

        private static string[] Lines(ConversationTestScenario.Fixture fx) => Snapshot(fx).ShipState.Split('\n');

        private static Device Named(ConversationTestScenario.Fixture fx, string name)
        {
            foreach (var d in fx.Sim.Devices.Items) if (d.Name == name) return d;
            Assert.Fail("the fixture ship has no device named " + name);
            return null;
        }

        private static Citizen Self(ConversationTestScenario.Fixture fx)
        {
            foreach (var c in fx.Sim.Citizens.Items) if (c.Id == fx.CitizenId) return c;
            Assert.Fail("the fixture citizen vanished");
            return null;
        }

        [Test]
        public void ShipState_Reports_Air_Hull_Machines_Stores_And_The_Crew_Members_Own_Job()
        {
            var fx = ConversationTestScenario.Build();
            string ship = Snapshot(fx).ShipState;

            Assert.That(ship, Is.Not.Empty, "every snapshot carries ship grounding");
            string[] lines = ship.Split('\n');
            Assert.That(lines.Length, Is.EqualTo(5), "five compact lines: air, hull, machines, stores, own job");
            Assert.That(lines[0], Does.StartWith("Air: "));
            Assert.That(lines[0], Does.Contain("ppm CO2"));
            Assert.That(lines[1], Does.StartWith("Hull: "));
            Assert.That(lines[2], Does.StartWith("Machines: "));
            Assert.That(lines[3], Does.StartWith("Stores: "));
            Assert.That(lines[4], Does.StartWith("Your job right now: "));

            // A pristine fixture: nothing is broken and nobody has a job — and it SAYS so, which
            // is the whole point (an idle crew member must not sound busy or alarmed).
            Assert.That(lines[1], Is.EqualTo("Hull: every sealed compartment is holding pressure."));
            Assert.That(lines[2], Is.EqualTo("Machines: no machine is broken, unpowered or badly worn."));
            Assert.That(lines[4], Does.Contain("nothing assigned"));
            Assert.That(lines[0], Does.Contain("(normal)"), "a healthy compartment is not reported as a crisis");
        }

        [Test]
        public void Air_Line_Names_The_Worst_Compartment_And_Grades_It_On_All_Three_Readings()
        {
            var fx = ConversationTestScenario.Build();
            // Foul the right-hand room (anchored "right") well past the bad threshold.
            Room right = fx.Sim.Rooms.RoomAt(fx.Sim.World, new Int3(8, 2, 0));
            right.CO2Moles = right.TotalMoles;   // ~1e6 ppm — unmistakably the worst room

            string air = Lines(fx)[0];
            Assert.That(air, Does.Contain("the right"), "the worst compartment is named from its anchor");
            Assert.That(air, Does.Contain("(bad)"), "a genuinely foul room is graded bad");
            Assert.That(air, Does.Contain(" kPa"), "pressure is reported, not just CO2");
            Assert.That(air, Does.Contain("% oxygen"), "oxygen is reported, not just CO2");
            Assert.That(air, Does.Contain("No other compartment has more CO2 than that."),
                "the bounding claim is scoped to CO2 — the line cannot speak for pressure elsewhere");
            Assert.That(air, Does.Not.Contain("Everywhere else is better"),
                "the old unbounded claim licensed generalising a ship-wide all-clear");
        }

        [Test]
        public void Air_Line_Reports_A_Healthy_Rooms_Real_Pressure_And_Oxygen()
        {
            var fx = ConversationTestScenario.Build();
            // RoomState.Pressurize fills to nominal 101.3 kPa with a 21% O2 mix.
            string air = Lines(fx)[0];
            Assert.That(air, Does.Contain("101 kPa"), "nominal pressure is reported as a whole number");
            Assert.That(air, Does.Contain("21% oxygen"));
        }

        // ------------------------------------------------------------------ hull / vacuum

        [Test]
        public void Hull_Line_Surfaces_A_Compartment_That_Vented_To_Vacuum()
        {
            var fx = ConversationTestScenario.Build();
            // Breach the right compartment's outer wall: the flood fill now reaches void, so every
            // one of its tiles joins room 0 and the compartment LEAVES the room list entirely.
            // Nothing but its anchor remembers it existed — which is exactly why the air line
            // (which walks rooms 1..n) cannot see the breach and the hull line must.
            fx.Sim.World.SetWall(new Int3(11, 2, 0), 0);
            fx.Sim.World.SetFloor(new Int3(11, 2, 0), TileDefs.Void);
            fx.Sim.Rooms.MarkDirty();
            fx.Sim.Rooms.RecomputeIfDirty(fx.Sim);
            Assert.That(fx.Sim.Rooms.RoomIdAt(fx.Sim.World, new Int3(8, 2, 0)), Is.EqualTo(0),
                "PRECONDITION: the breached compartment is now part of the vacuum sink");

            string[] lines = Lines(fx);
            Assert.That(lines[1], Does.Contain("the right is open to vacuum"),
                "a breached compartment is named, not silently skipped");
            Assert.That(lines[1], Does.Not.Contain("holding pressure"));
        }

        [Test]
        public void Hull_Line_Surfaces_A_Sealed_Compartment_That_Lost_Its_Pressure()
        {
            var fx = ConversationTestScenario.Build();
            Room right = fx.Sim.Rooms.RoomAt(fx.Sim.World, new Int3(8, 2, 0));
            right.O2Moles *= 0.2; right.N2Moles *= 0.2; right.CO2Moles *= 0.2; // ~20 kPa

            string hull = Lines(fx)[1];
            Assert.That(hull, Does.Contain("the right is down to"), "a depressurising room is named");
            Assert.That(hull, Does.Contain(" kPa"));
        }

        [Test]
        public void Hull_Line_Surfaces_A_Compartment_With_No_Atmosphere_At_All()
        {
            var fx = ConversationTestScenario.Build();
            Room right = fx.Sim.Rooms.RoomAt(fx.Sim.World, new Int3(8, 2, 0));
            right.O2Moles = right.N2Moles = right.CO2Moles = 0.0;

            string[] lines = Lines(fx);
            Assert.That(lines[1], Does.Contain("the right has no air left in it"),
                "the air line skips gasless rooms, so the hull line must not");
            Assert.That(lines[0], Does.Contain("the left"), "the air line falls back to the room that still has a mix");
        }

        // ------------------------------------------------------------------ machines

        [Test]
        public void Machine_Line_Names_Failed_And_Worn_Machines_Only()
        {
            var fx = ConversationTestScenario.Build();
            Device scrubber = Named(fx, "scrubber"), tank = Named(fx, "tank");

            scrubber.Condition = 0f;    // below FailBelow ⇒ failed
            tank.Condition = 0.4f;      // still operational, but wearing out

            string machines = Lines(fx)[2];
            Assert.That(machines, Does.Contain("scrubber has broken down"));
            Assert.That(machines, Does.Contain("tank is wearing out"));
            Assert.That(machines, Does.Not.Contain("battery"), "healthy machines are not listed");
        }

        /// <summary>
        /// THE fix: a brownout-shed or MOSS-disabled scrubber has <c>Condition == 1</c>, so
        /// <see cref="Device.IsOperational"/> is true and the first cut of this block reported
        /// "every machine aboard is running" while CO2 climbed — with the prompt calling that the
        /// only true report of the ship. Dead and worn are different facts and must read
        /// differently.
        /// </summary>
        [Test]
        public void Machine_Line_Reports_An_Unpowered_Machine_Distinctly_From_A_Worn_One()
        {
            var fx = ConversationTestScenario.Build();
            Device scrubber = Named(fx, "scrubber");
            Assert.That(scrubber.Condition, Is.EqualTo(1f), "PRECONDITION: the machine is pristine");
            Assert.That(scrubber.IsOperational(fx.Sim.Defs), Is.True,
                "PRECONDITION: condition alone says it is fine — only Powered knows better");

            scrubber.Powered = false;   // shed by PowerSystem, or switched off by MOSS

            string machines = Lines(fx)[2];
            Assert.That(machines, Does.Contain("scrubber has no power"),
                "an unpowered machine is a real, reportable fault");
            Assert.That(machines, Does.Contain("it is not running"), "and the consequence is spelled out");
            Assert.That(machines, Does.Not.Contain("is wearing out"), "unpowered is not the same fact as worn");
            Assert.That(machines, Does.Not.Contain("no machine is broken, unpowered or badly worn"),
                "the all-clear must not survive a dead scrubber");
        }

        [Test]
        public void Machine_Line_Ignores_Powered_On_Things_That_Never_Draw_Power()
        {
            var fx = ConversationTestScenario.Build();
            // Furniture, conduits and tanks draw 0 kW and legitimately sit off the network, so
            // Powered is meaningless for them — reporting it would bury the real faults.
            Device tank = Named(fx, "tank");
            Assert.That(fx.Sim.Defs.Machines[(int)tank.Kind].DrawKW, Is.EqualTo(0f), "PRECONDITION: a tank draws nothing");
            tank.Powered = false;

            Assert.That(Lines(fx)[2], Is.EqualTo("Machines: no machine is broken, unpowered or badly worn."));
        }

        [Test]
        public void Machine_Line_Puts_The_Worst_Faults_First()
        {
            var fx = ConversationTestScenario.Build();
            Named(fx, "tank").Condition = 0.4f;          // worn
            Named(fx, "vent").Powered = false;           // unpowered
            Named(fx, "scrubber").Condition = 0f;        // broken

            string machines = Lines(fx)[2];
            int broken = machines.IndexOf("scrubber has broken down", System.StringComparison.Ordinal);
            int dead = machines.IndexOf("vent has no power", System.StringComparison.Ordinal);
            int worn = machines.IndexOf("tank is wearing out", System.StringComparison.Ordinal);
            Assert.That(broken, Is.GreaterThanOrEqualTo(0));
            Assert.That(dead, Is.GreaterThan(broken), "broken outranks unpowered");
            Assert.That(worn, Is.GreaterThan(dead), "unpowered outranks merely worn");
        }

        // ------------------------------------------------------------------ stores

        [Test]
        public void Stores_Line_Reports_Water_And_Food()
        {
            var fx = ConversationTestScenario.Build();
            // The fixture ships a 250 L tank and a 3-unit potato stack.
            Assert.That(Lines(fx)[3], Is.EqualTo("Stores: 250 L of water in the tanks, 3 units of food aboard."));
        }

        [Test]
        public void Stores_Line_Says_Empty_Out_Loud()
        {
            var fx = ConversationTestScenario.Build();
            Named(fx, "tank").StoredLiters = 0f;
            foreach (var it in new System.Collections.Generic.List<ItemStack>(fx.Sim.Items.Items))
                if (it.Kind == ItemKind.Potato) fx.Sim.Items.Remove(it.Id);

            Assert.That(Lines(fx)[3], Is.EqualTo("Stores: no water left in the tanks, no food left aboard."));
        }

        // ------------------------------------------------------------------ own job

        [Test]
        public void Own_Job_Line_Names_The_Machine_Being_Serviced()
        {
            var fx = ConversationTestScenario.Build();
            Citizen c = Self(fx);

            c.JobKind = JobKind.Maintain;
            c.JobTarget = new Int3(10, 1, 0);   // the scrubber's tile
            Assert.That(Lines(fx)[4], Is.EqualTo("Your job right now: servicing scrubber."));

            c.JobKind = JobKind.Dig;
            c.JobTarget = new Int3(3, 1, 0);
            Assert.That(Lines(fx)[4], Is.EqualTo("Your job right now: clearing debris at 3,1 on deck 0."));
        }

        /// <summary>A crew member still WALKING to the job has not started it — saying "servicing
        /// the scrubber" while visibly crossing the deck is the same claim the console stopped
        /// making with its work markers.</summary>
        [Test]
        public void Own_Job_Line_Tells_En_Route_Apart_From_At_Work()
        {
            var fx = ConversationTestScenario.Build();
            Citizen c = Self(fx);
            c.JobKind = JobKind.Maintain;
            c.JobTarget = new Int3(10, 1, 0);

            c.Path.Add(c.Pos);
            c.Path.Add(new Int3(9, 1, 0));
            c.PathIndex = 0;
            Assert.That(c.HasPath, Is.True, "PRECONDITION: the pawn is walking");
            Assert.That(Lines(fx)[4], Is.EqualTo("Your job right now: on your way to service scrubber."));

            c.PathIndex = c.Path.Count;  // arrived
            Assert.That(Lines(fx)[4], Is.EqualTo("Your job right now: servicing scrubber."));
        }

        // ------------------------------------------------------------------ purity / determinism

        [Test]
        public void ShipState_Is_Deterministic_And_Pure()
        {
            var fx = ConversationTestScenario.Build();
            Named(fx, "scrubber").Powered = false;      // make the block say something non-trivial
            Named(fx, "tank").Condition = 0.4f;

            ulong before = fx.Sim.StateHash();
            string a = Snapshot(fx).ShipState;
            string b = Snapshot(fx).ShipState;
            ulong after = fx.Sim.StateHash();

            // A comparison of two empty strings would pass with the whole feature reverted, so
            // pin the content first: this is a real block with real facts in it.
            Assert.That(a, Does.Contain("scrubber has no power"));
            Assert.That(a, Does.Contain("tank is wearing out"));
            Assert.That(a.Split('\n').Length, Is.EqualTo(5));
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

            // Again: pin that there ARE numbers to get wrong before comparing the two renders —
            // "" == "" would pass with the whole feature reverted.
            Assert.That(de, Does.Contain("1997 ppm CO2 (stale)"));
            Assert.That(de, Does.Contain("102 kPa"), "the extra CO2 raised the room's pressure a little");
            Assert.That(de, Does.Contain("21% oxygen"));
            Assert.That(de, Does.Contain("250 L of water"));
            Assert.That(de, Is.EqualTo(inv), "ppm/kPa/litre numbers use InvariantCulture, never a locale comma");
        }

        [Test]
        public void ShipState_Survives_A_Mindless_Or_Unknown_Citizen_Without_Throwing()
        {
            var fx = ConversationTestScenario.Build();

            // The contrast is the test: a KNOWN citizen gets a real block...
            Assert.That(Snapshot(fx).ShipState, Does.StartWith("Air: "));
            // ...and an unknown one gets an empty request, so the prompt simply omits [SHIP]
            // (which is what keeps the offline / ship-less layout byte-identical to the old one).
            Assert.That(Snapshot(fx, 99999u).ShipState, Is.Empty);
        }
    }
}
