using System.Collections.Generic;
using System.IO;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// NavSystem v0 (WS-NAV P1): telescope SNR detection gated on power, contact
    /// drift, burn/transit/arrival, delta-v accounting, save round-trip via SYSS,
    /// twin determinism, and the defs tripwire for nav.def consumption.
    /// </summary>
    public class NavSystemTests
    {
        private static readonly string[] Room =
        {
            "#######",
            "#.....#",
            "#######",
        };

        private static Simulation NewSim(out NavSystem nav, SimDefs defs = null, bool poweredScope = true)
        {
            var systems = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            nav = FindNav(systems);
            var sim = new Simulation(AsciiWorld.Build(Room), 7, systems, defs);
            if (poweredScope)
            {
                // Minimal grid: solar wing + conduit + adjacent telescope → Powered.
                sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
                sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit");
                sim.AddDevice(DeviceKind.Telescope, new Int3(3, 1, 0), "scope");
            }
            return sim;
        }

        private static NavSystem FindNav(ISimSystem[] systems)
        {
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is NavSystem n) return n;
            Assert.Fail("NavSystem missing from SystemStack.CreateDefault");
            return null;
        }

        private static SimDefs Tuned(string navDefText)
        {
            var problems = new List<string>();
            var defs = DefsParser.Parse(new[] { ("nav.def", navDefText) }, problems);
            Assert.That(problems, Is.Empty);
            return defs;
        }

        [Test]
        public void PoweredTelescopeDetectsContactInRange()
        {
            var sim = NewSim(out var nav);
            uint near = nav.AddContact(ContactKind.Comet, 300, 0, 0, 0, 1f);   // snr 1.78
            uint far = nav.AddContact(ContactKind.Comet, 500, 0, 0, 0, 1f);    // snr 0.64
            for (int i = 0; i < 20; i++) sim.Tick();

            Assert.That(nav.TryGetContact(near, out var n) && n.Detected, Is.True);
            Assert.That(nav.TryGetContact(far, out var f) && f.Detected, Is.False,
                "below-threshold contact must stay unresolved");
        }

        [Test]
        public void UnpoweredShipDetectsNothing()
        {
            var sim = NewSim(out var nav, poweredScope: false);
            sim.AddDevice(DeviceKind.Telescope, new Int3(3, 1, 0), "scope"); // no grid → unpowered
            nav.AddContact(ContactKind.Comet, 100, 0, 0, 0, 1f);             // trivially in range
            for (int i = 0; i < 20; i++) sim.Tick();

            Assert.That(nav.Contacts[0].Detected, Is.False,
                "detection requires a POWERED telescope — no fog-of-war fiat");
        }

        [Test]
        public void ContactsDriftLinearlyAndDeterministically()
        {
            var sim = NewSim(out var nav, poweredScope: false);
            nav.AddContact(ContactKind.Comet, 100, 50, 0.25, -0.5, 1f);
            for (int i = 0; i < 100; i++) sim.Tick(); // 10 nav passes at 1 Hz

            Assert.That(nav.Contacts[0].X, Is.EqualTo(100 + 10 * 0.25).Within(1e-9));
            Assert.That(nav.Contacts[0].Y, Is.EqualTo(50 - 10 * 0.5).Within(1e-9));
        }

        [Test]
        public void BurnSpendsDeltaVAndArrivesOnStation()
        {
            // Fast transit so the test stays short: 30 Mm/s → 10 passes for 300 Mm.
            var sim = NewSim(out var nav, Tuned("[nav]\ntransit_speed_mm_per_s = 30\n"));
            uint id = nav.AddContact(ContactKind.Comet, 300, 0, 0, 0, 1f);
            for (int i = 0; i < 20; i++) sim.Tick(); // detect first

            sim.EnqueueCommand(new BeginBurnCommand { ContactId = id });
            sim.Tick(); // command applies at tick start; first countdown pass runs
            Assert.That(nav.TransitTargetId, Is.EqualTo(id));
            Assert.That(nav.DeltaVRemainingMps, Is.EqualTo(1000f - 100f).Within(1e-6));

            for (int i = 0; i < 110; i++) sim.Tick();
            Assert.That(nav.TransitTargetId, Is.EqualTo(0), "transit must complete");
            Assert.That(nav.ShipX, Is.EqualTo(300).Within(1e-9));
            Assert.That(nav.ShipY, Is.EqualTo(0).Within(1e-9));
        }

        [Test]
        public void BurnToUndetectedContactIsRejected()
        {
            var sim = NewSim(out var nav, poweredScope: false);
            uint id = nav.AddContact(ContactKind.Comet, 300, 0, 0, 0, 1f); // never detected
            sim.Tick(); // initialize delta-v
            sim.EnqueueCommand(new BeginBurnCommand { ContactId = id });
            for (int i = 0; i < 20; i++) sim.Tick();

            Assert.That(nav.TransitTargetId, Is.EqualTo(0));
            Assert.That(nav.DeltaVRemainingMps, Is.EqualTo(1000f).Within(1e-6),
                "a rejected burn must not spend delta-v");
        }

        [Test]
        public void ExhaustedDeltaVRejectsBurn()
        {
            var sim = NewSim(out var nav, Tuned("[nav]\ninitial_delta_v_mps = 50\n"));
            uint id = nav.AddContact(ContactKind.Comet, 100, 0, 0, 0, 1f);
            for (int i = 0; i < 20; i++) sim.Tick(); // detected; budget 50 < cost 100

            sim.EnqueueCommand(new BeginBurnCommand { ContactId = id });
            for (int i = 0; i < 10; i++) sim.Tick();
            Assert.That(nav.TransitTargetId, Is.EqualTo(0));
            Assert.That(nav.DeltaVRemainingMps, Is.EqualTo(50f).Within(1e-6));
        }

        [Test]
        public void SpaceStateSurvivesSaveRoundTripHashEqual()
        {
            var sim = NewSim(out var nav, Tuned("[nav]\ntransit_speed_mm_per_s = 2\n"));
            uint id = nav.AddContact(ContactKind.Comet, 300, 0, 0.1, 0, 1f);
            nav.AddContact(ContactKind.Derelict, 900, 200, 0, 0, 0.2f);
            for (int i = 0; i < 20; i++) sim.Tick();
            sim.EnqueueCommand(new BeginBurnCommand { ContactId = id });
            for (int i = 0; i < 30; i++) sim.Tick(); // save MID-transit, contact drifting

            Assert.That(nav.TransitTargetId, Is.EqualTo(id), "precondition: in transit");

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;
            var systems = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            var loaded = SaveReader.Read(ms, systems, sim.Defs);
            var loadedNav = FindNav(systems);

            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "save → load must be hash-equal including the NAVS fold");
            Assert.That(loadedNav.TransitTargetId, Is.EqualTo(nav.TransitTargetId));
            Assert.That(loadedNav.DeltaVRemainingMps, Is.EqualTo(nav.DeltaVRemainingMps));
            Assert.That(loadedNav.Contacts.Count, Is.EqualTo(nav.Contacts.Count));
            Assert.That(loadedNav.Contacts[0].X, Is.EqualTo(nav.Contacts[0].X));

            // The loaded twin must CONTINUE identically (arrival included).
            for (int i = 0; i < 200; i++) { sim.Tick(); loaded.Tick(); }
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()));
        }

        [Test]
        public void NavDefFileValuesAreActuallyConsumed()
        {
            // Defs tripwire: a lowered SNR threshold must change detection outcomes.
            var tuned = Tuned("[nav]\ntelescope_snr_threshold = 0.5\n");
            Assert.That(tuned.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));

            var simDefault = NewSim(out var navDefault);
            var simTuned = NewSim(out var navTuned, tuned);
            navDefault.AddContact(ContactKind.Comet, 500, 0, 0, 0, 1f); // snr 0.64
            navTuned.AddContact(ContactKind.Comet, 500, 0, 0, 0, 1f);
            for (int i = 0; i < 20; i++) { simDefault.Tick(); simTuned.Tick(); }

            Assert.That(navDefault.Contacts[0].Detected, Is.False);
            Assert.That(navTuned.Contacts[0].Detected, Is.True,
                "halved threshold must resolve the 500 Mm contact");
        }
    }
}
