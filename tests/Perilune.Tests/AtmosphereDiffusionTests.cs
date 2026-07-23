using System;
using System.Linq;
using System.Reflection;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// B-3: <see cref="AtmosphereSystem"/>'s per-species partial-pressure diffusion term.
    /// Before it, <see cref="AtmosphereSystem.FlowAcrossDoor"/> was bulk pressure-driven only,
    /// so two rooms joined by an open door that already sit at EQUAL pressure never exchanged
    /// composition — a crew room climbed to ~17 kppm CO2 while the scrubber next door scrubbed
    /// its own air to ~0. These tests drive the atmosphere pass DIRECTLY (no citizens, no
    /// thermal drift) so the only gas mover is the door, and toggle the term on/off through the
    /// def value <c>diffusion_coefficient</c> (0 reproduces the exact pre-B3 behaviour).
    /// </summary>
    public class AtmosphereDiffusionTests
    {
        // Two equal-volume (12-tile) rooms split by a wall with one door at (5,2). Left is the
        // "crew" room (probe (2,2)); right is the "scrubber" room (probe (8,2)).
        private static readonly string[] TwoRooms =
        {
            "###########",
            "#....#....#",
            "#....D....#",
            "#....#....#",
            "###########",
        };

        // A single room whose only door opens onto out-of-bounds vacuum (room 0).
        private static readonly string[] RoomToVacuum =
        {
            "######",
            "#....D",
            "######",
        };

        private static SimDefs Defs(double diffusion, double flow = 0.5)
        {
            var d = SimDefs.CreateDefault();
            d.Atmosphere.DiffusionCoefficient = diffusion;
            d.Atmosphere.FlowCoefficient = flow;
            d.ComputeChecksum();
            return d;
        }

        private static Simulation BuildTwoRooms(SimDefs defs, bool doorOpen, out Room crew, out Room scrub)
        {
            var clean = TwoRooms.Select(r => r.Replace('D', '.')).ToArray();
            var sim = new Simulation(AsciiWorld.Build(clean), 7,
                SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())), defs);
            sim.AddDevice(DeviceKind.Door, new Int3(5, 2, 0), "door").IsOpen = doorOpen;
            sim.Rooms.RecomputeIfDirty(sim);
            crew = sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0));
            scrub = sim.Rooms.RoomAt(sim.World, new Int3(8, 2, 0));
            Assert.That(crew, Is.Not.SameAs(scrub), "the two probes really are distinct rooms");
            Assert.That(crew, Is.Not.SameAs(sim.Rooms.Rooms[0]), "the crew room is not the vacuum sink");
            RoomState.Pressurize(crew);
            RoomState.Pressurize(scrub);
            return sim;
        }

        private static AtmosphereSystem Atmo() => new AtmosphereSystem();

        // -------------------------------------------------------------- equalisation (the B-3 case)

        [Test]
        public void OpenDoor_At_Equal_Pressure_Equalises_CO2_Between_Rooms()
        {
            var sim = BuildTwoRooms(Defs(diffusion: 0.5), doorOpen: true, out var crew, out var scrub);
            // Equal pressure (both Pressurized identically) ⇒ bulk FlowAcrossDoor is inert; only
            // the diffusion term can move the CO2. SetCo2 preserves total moles, so pressure
            // stays equal throughout.
            SetCo2(crew, 17000.0);
            SetCo2(scrub, 500.0);
            Assert.That(crew.PressureKPa, Is.EqualTo(scrub.PressureKPa).Within(1e-9),
                "the two rooms sit at equal pressure, so bulk flow cannot be what moves the CO2");

            var atmo = Atmo();
            for (int i = 0; i < 200; i++) atmo.Tick(sim);

            Assert.That(scrub.CO2Ppm, Is.GreaterThan(4000.0), "the clean room's CO2 rose toward the crew room's");
            Assert.That(crew.CO2Ppm, Is.LessThan(12000.0), "the crew room's CO2 fell toward the clean room's");
            Assert.That(Math.Abs(crew.CO2Ppm - scrub.CO2Ppm), Is.LessThan(2000.0),
                "and the two are converging on the shared mean (~8750 ppm)");
        }

        [Test]
        public void Bulk_Flow_Alone_Does_NOT_Equalise_CO2_The_Exact_B3_Failure()
        {
            // The baseline the fix corrects: diffusion OFF (coefficient 0) reproduces the shipped
            // pre-B3 behaviour — equal pressure, divergent mixes, and NOTHING moves.
            var sim = BuildTwoRooms(Defs(diffusion: 0.0), doorOpen: true, out var crew, out var scrub);
            SetCo2(crew, 17000.0);
            SetCo2(scrub, 500.0);

            var atmo = Atmo();
            for (int i = 0; i < 200; i++) atmo.Tick(sim);

            Assert.That(crew.CO2Ppm, Is.GreaterThan(16000.0), "without the term the crew room stays poisonous");
            Assert.That(scrub.CO2Ppm, Is.LessThan(600.0), "…and the room next door stays clean — the B-3 bug");
        }

        // ------------------------------------------------------------------- mass conservation

        [Test]
        public void Diffusion_Conserves_Total_Moles_Of_Every_Species()
        {
            // Composition-only gradients (CO2, O2 and N2 all differ) at EQUAL pressure, so every
            // species diffuses while bulk flow stays inert. No scrubber, no crew: diffusion is
            // the only thing touching the moles.
            var sim = BuildTwoRooms(Defs(diffusion: 0.5), doorOpen: true, out var crew, out var scrub);
            SetCo2(crew, 17000.0);
            SetCo2(scrub, 500.0);
            SetPpO2Fraction(crew, 0.25);   // move O2<->N2, total (and pressure) unchanged
            SetPpO2Fraction(scrub, 0.18);

            double o2 = crew.O2Moles + scrub.O2Moles;
            double co2 = crew.CO2Moles + scrub.CO2Moles;
            double n2 = crew.N2Moles + scrub.N2Moles;

            var atmo = Atmo();
            for (int i = 0; i < 500; i++) atmo.Tick(sim);

            AssertClose(crew.O2Moles + scrub.O2Moles, o2, "O2 total");
            AssertClose(crew.CO2Moles + scrub.CO2Moles, co2, "CO2 total");
            AssertClose(crew.N2Moles + scrub.N2Moles, n2, "N2 total");
            // The clamp (Max(0,…)) never firing is implied by exact conservation: a clamp would
            // add matter and break the sums above.
        }

        // ------------------------------------------------------------------- sealed door blocks

        [Test]
        public void A_Closed_Door_Transfers_Nothing()
        {
            var sim = BuildTwoRooms(Defs(diffusion: 0.5), doorOpen: false, out var crew, out var scrub);
            SetCo2(crew, 17000.0);
            SetCo2(scrub, 500.0);

            var atmo = Atmo();
            for (int i = 0; i < 200; i++) atmo.Tick(sim);

            Assert.That(crew.CO2Ppm, Is.EqualTo(17000.0).Within(1e-6), "a sealed door must block gas");
            Assert.That(scrub.CO2Ppm, Is.EqualTo(500.0).Within(1e-6), "…so the clean room stays clean");
        }

        // ------------------------------------------------------------------- vacuum drain

        [Test]
        public void An_Open_Door_To_Vacuum_Drains_The_Room_And_Never_Credits_Room_Zero()
        {
            // Bulk flow OFF (coefficient 0) so the ONLY drain is the diffusion term — proving it
            // bleeds one-sidedly into vacuum and never puts moles into the room-0 sink.
            var clean = RoomToVacuum.Select(r => r.Replace('D', '.')).ToArray();
            var sim = new Simulation(AsciiWorld.Build(clean), 7,
                SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())), Defs(diffusion: 0.5, flow: 0.0));
            sim.AddDevice(DeviceKind.Door, new Int3(5, 1, 0), "airlock").IsOpen = true;
            sim.Rooms.RecomputeIfDirty(sim);
            var room = sim.Rooms.RoomAt(sim.World, new Int3(2, 1, 0));
            Assert.That(room, Is.Not.SameAs(sim.Rooms.Rooms[0]), "the compartment is a real room, not vacuum");
            RoomState.Pressurize(room);
            SetCo2(room, 17000.0);
            double startCo2 = room.CO2Moles;

            // Drive DIFFUSION ALONE via the private DiffuseAcrossDoors — NOT a full atmosphere
            // pass. A full Tick ends with an unconditional room-0 re-zero (AtmosphereSystem step 3)
            // that would wipe out any moles wrongly credited to the vacuum sink and make the
            // room-0 assertions below vacuous. Calling the diffusion step directly means room 0's
            // moles are EXACTLY what the diffusion apply wrote — so a mutation that drops the
            // a!=0/b!=0 guards and applies from r=0 (genuinely crediting the sink) is caught here.
            var atmo = Atmo();
            var diffuse = typeof(AtmosphereSystem).GetMethod(
                "DiffuseAcrossDoors", BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(diffuse, Is.Not.Null, "DiffuseAcrossDoors must exist to drive the diffusion step directly");
            for (int i = 0; i < 200; i++) diffuse.Invoke(atmo, new object[] { sim, sim.Defs.Atmosphere });

            Assert.That(room.CO2Moles, Is.LessThan(startCo2), "the compartment bled CO2 to space");
            // With no re-zero in this path, these are load-bearing: room 0 is 0 ONLY because the
            // diffusion code never credits it.
            var vac = sim.Rooms.Rooms[0];
            Assert.That(vac.O2Moles, Is.EqualTo(0.0), "room 0 is never credited O2 (no re-zero here to mask it)");
            Assert.That(vac.CO2Moles, Is.EqualTo(0.0), "room 0 is never credited CO2");
            Assert.That(vac.N2Moles, Is.EqualTo(0.0), "room 0 is never credited N2");
        }

        // ------------------------------------------------------------------- zero allocation

        [Test]
        public void Atmosphere_Pass_Allocates_Nothing_Over_A_Long_Warm_Run()
        {
            // Mirror StateHashHonestyTests' fold guard: the diffusion accumulators are grown once
            // and Array.Clear'd each pass, so a warm atmosphere pass must allocate zero bytes.
            var sim = BuildTwoRooms(Defs(diffusion: 0.5), doorOpen: true, out var crew, out var scrub);
            SetCo2(crew, 17000.0);
            SetCo2(scrub, 500.0);
            var atmo = Atmo();

            // Warm-up: JIT, the one-time array growth, and the first (dirty) room recompute.
            for (int i = 0; i < 500; i++) atmo.Tick(sim);
            Assert.That(crew.CO2Moles, Is.GreaterThan(0.0), "precondition: gas is present to move");

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) atmo.Tick(sim);
            long allocated = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(allocated, Is.EqualTo(0),
                $"the atmosphere pass allocated {allocated} bytes over 3000 warm ticks — the diffusion " +
                "accumulators must be grown once and cleared, never reallocated per pass");
        }

        // ------------------------------------------------------------------------- helpers

        /// <summary>Set a room's CO2 to an exact ppm by moving moles between CO2 and N2, leaving
        /// total moles (and pressure) untouched.</summary>
        private static void SetCo2(Room room, double ppm)
        {
            double total = room.TotalMoles;
            double want = total * ppm / 1_000_000.0;
            room.N2Moles += room.CO2Moles - want;
            room.CO2Moles = want;
        }

        /// <summary>Set a room's O2 mole fraction by moving moles between O2 and N2, leaving total
        /// moles (and pressure) untouched — so an O2 gradient can be built without a pressure one.</summary>
        private static void SetPpO2Fraction(Room room, double fraction)
        {
            double total = room.TotalMoles;
            double want = total * fraction;
            room.N2Moles += room.O2Moles - want;
            room.O2Moles = want;
        }

        private static void AssertClose(double actual, double expected, string what)
            => Assert.That(actual, Is.EqualTo(expected).Within(1e-6),
                $"{what}: diffusion conserves moles to float tolerance");
    }
}
