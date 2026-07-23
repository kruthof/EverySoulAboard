using System.Collections.Generic;
using System.IO;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-2 crew-safety guard (<see cref="SafetySystem"/>). The L1 work-rate rebase stretched a
    /// maintenance call from 20 s to 900 s; before this guard a crew member would stand on a
    /// worksite whose air had turned lethal for that whole window and suffocate, even while the
    /// rest of the ship breathed fine — which killed every generated ship (V6). The guard makes a
    /// crew member in unbreathable air, past <c>needs.FleeSuffocation</c>, drop its job and walk to
    /// the nearest breathable tile. These tests drive the REAL systems and prove the crew LIVES,
    /// with the guard's removal as the named mutation that kills them.
    /// </summary>
    public class CrewSafetyTests
    {
        // Two enclosed rooms joined ONLY by an (open) door tile at (3,2): a vacuum work room on the
        // left (x 1..2) and a breathable refuge on the right (x 4..5). The door tile is a room
        // boundary, so the two rooms hold independent atmospheres, but it is walkable, so a crew
        // member can flee from one to the other.
        private static readonly string[] TwoRoomMap =
        {
            "#######",
            "#..#..#",
            "#.....#",
            "#..#..#",
            "#######",
        };

        private static readonly Int3 WorkTile = new Int3(1, 1, 0);   // in the vacuum room
        private static readonly Int3 DebrisTile = new Int3(2, 1, 0); // adjacent to WorkTile, vacuum room
        private static readonly Int3 RefugeTile = new Int3(4, 2, 0); // in the breathable room
        private static readonly Int3 DoorTile = new Int3(3, 2, 0);

        private static Simulation NewScenario(bool withGuard, SimDefs defs = null)
        {
            var systems = new List<ISimSystem>
            {
                new CitizenSystem(), new JobSystem(), new NeedsSystem(),
            };
            if (withGuard) systems.Add(new SafetySystem()); // the guard under test — removed in the mutation
            var sim = new Simulation(AsciiWorld.Build(TwoRoomMap), 1, systems.ToArray(), defs);

            // Open door joining the two rooms (a room boundary you can walk through).
            sim.AddDevice(DeviceKind.Door, DoorTile, "door").IsOpen = true;

            // Derive rooms, then pressurize ONLY the refuge; the work room is left at vacuum.
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, RefugeTile));

            // A real job in the lethal air: designate a dig the crew will walk over to and work.
            sim.World.SetWall(DebrisTile, TileDefs.Debris);
            sim.World.SetFlag(DebrisTile, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;

            sim.AddCitizen("Ito", WorkTile);
            return sim;
        }

        /// <summary>
        /// A crew member digs in a vacuum compartment, its suffocation climbs, and at
        /// <c>flee_suffocation</c> it abandons the dig and walks to the breathable refuge — ALIVE.
        ///
        /// NAMED MUTATION: remove <c>new SafetySystem()</c> from the stack (drop the guard) — the
        /// crew member keeps digging in the vacuum and suffocates (asserted in the same test via the
        /// no-guard run). A second mutation that also kills it: set <c>flee_suffocation = 1.5</c> so
        /// the threshold is never reached (see the def-field test below).
        /// </summary>
        [Test]
        public void CrewWorkingInLethalAir_AbandonsAndFleesToBreathableAir_Survives()
        {
            var sim = NewScenario(withGuard: true);
            var crew = sim.Citizens.Items[0];

            // Drive it for well over a full flee/recover cycle. Track the two facts that make this a
            // real escape rather than a lucky miss: the crew DID work in the lethal air (so the guard
            // had something to save it from), and it DID reach breathable air (it actually fled).
            bool startedDigInVacuum = false, everReachedSafeAir = false;
            for (int t = 0; t < 3000; t++)
            {
                sim.Tick();
                if (crew.Dead) break; // the guard is supposed to prevent exactly this
                bool breathing = AtmosphereSafety.IsBreathable(sim.Rooms.RoomAt(sim.World, crew.Pos), sim.Defs.Needs);
                if (crew.JobKind == JobKind.Dig && !breathing && crew.Suffocation > 0f) startedDigInVacuum = true;
                if (breathing && crew.Suffocation < sim.Defs.Needs.FleeSuffocation) everReachedSafeAir = true;
            }

            Assert.That(startedDigInVacuum, Is.True,
                "precondition: the crew began digging in unbreathable air (its suffocation was rising)");
            Assert.That(crew.Dead, Is.False, "the crew survived — it fled the lethal air instead of dying in it");
            Assert.That(everReachedSafeAir, Is.True,
                "the crew actually reached and recovered in breathable air (it fled, not merely lingered)");

            // The mutation, applied and asserted: with the guard removed the same crew dies.
            var noGuard = NewScenario(withGuard: false);
            var doomed = noGuard.Citizens.Items[0];
            for (int t = 0; t < 3000 && !doomed.Dead; t++) noGuard.Tick();
            Assert.That(doomed.Dead, Is.True,
                "control: without SafetySystem the crew keeps working in the vacuum and suffocates");
        }

        /// <summary>
        /// The <c>flee_suffocation</c> def field is really consumed (not a dead number): at the
        /// shipped 0.5 the crew lives; pushed above 1.0 the threshold is unreachable and the same
        /// crew dies. Also proves the field moved the defs checksum (parser key + fold).
        ///
        /// NAMED MUTATION: in <see cref="SafetySystem"/>, compare against a hard-coded 0.5 instead of
        /// <c>needs.FleeSuffocation</c> — the "unreachable threshold" run below then survives and the
        /// Is.True/Is.False pair fails.
        /// </summary>
        [Test]
        public void FleeSuffocationDefValue_IsConsumedBySafetySystem()
        {
            Assert.That(SimDefs.Default.Needs.FleeSuffocation, Is.EqualTo(0.5f), "shipped default");

            var unreachable = SimDefs.CreateDefault();
            unreachable.Needs.FleeSuffocation = 1.5f; // above the lethal 1.0 — the guard can never trip
            unreachable.ComputeChecksum();
            Assert.That(unreachable.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum),
                "a retuned flee_suffocation must move the defs checksum (parser key + fold)");

            var lives = NewScenario(withGuard: true);                 // default 0.5
            var dies = NewScenario(withGuard: true, defs: unreachable); // 1.5, never trips
            var a = lives.Citizens.Items[0];
            var b = dies.Citizens.Items[0];
            for (int t = 0; t < 3000; t++) { lives.Tick(); if (!b.Dead) dies.Tick(); }

            Assert.That(a.Dead, Is.False, "at flee_suffocation = 0.5 the crew flees and lives");
            Assert.That(b.Dead, Is.True, "at flee_suffocation = 1.5 the threshold is unreachable and the crew dies");
        }

        // A heavily-vented, breathable refuge (left) joined by an OPEN door to a small vacuum
        // pocket (right) held open to space by a void breach. The pocket stays unbreathable because
        // it bleeds to the void faster than the door diffuses air in; the refuge stays breathable
        // because three powered vents out-inject that same leak. Atmosphere is entirely sim-driven —
        // NO manual RoomState.Pressurize (which does not round-trip under load, per review).
        private static readonly string[] BreachPocketMap =
        {
            "########",
            "#......#",
            "#......#",
            "##.#####",
            "##.  ###",
            "########",
        };

        private static Simulation NewBreachPocketSim()
        {
            var sim = new Simulation(AsciiWorld.Build(BreachPocketMap), 3,
                SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));
            // Solar → a conduit chain along row 1 → three powered, open vents hung below it in
            // row 2. Three are needed: one alone only lifts the refuge to a hypoxic ~60 kPa
            // against the door-to-void bleed, so it too would read unbreathable. The crew's flee
            // corridor (2,2)→door(2,3)→pocket(2,4) is left device-free so it stays walkable.
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddDevice(DeviceKind.Conduit, new Int3(2, 1, 0), "conduit_a");
            sim.AddDevice(DeviceKind.Conduit, new Int3(3, 1, 0), "conduit_b");
            sim.AddDevice(DeviceKind.Conduit, new Int3(4, 1, 0), "conduit_c");
            sim.AddDevice(DeviceKind.Conduit, new Int3(5, 1, 0), "conduit_d");
            sim.AddDevice(DeviceKind.AirVent, new Int3(3, 2, 0), "vent_a").IsOpen = true;
            sim.AddDevice(DeviceKind.AirVent, new Int3(4, 2, 0), "vent_b").IsOpen = true;
            sim.AddDevice(DeviceKind.AirVent, new Int3(5, 2, 0), "vent_c").IsOpen = true;
            sim.AddDevice(DeviceKind.Door, new Int3(2, 3, 0), "door").IsOpen = true;
            // The crew stands in the vacuum pocket (2,4) — void at (3,4) keeps it lethal — with a
            // breathable refuge one door away. It suffocates in place and the guard flees it.
            sim.AddCitizen("Rao", new Int3(2, 4, 0)); // AutoWander false → it does not wander off
            return sim;
        }

        /// <summary>
        /// The <see cref="JobKind.Flee"/> save/load seam. Drives a REAL sim (sim-driven atmosphere,
        /// no manual Pressurize) until a crew member is genuinely mid-Flee — kind 10, carrying a live
        /// flee path — then round-trips it through <see cref="SaveWriter"/>/<see cref="SaveReader"/>
        /// and asserts the reload does not throw on the new kind and is bit-exact: the reloaded
        /// StateHash equals the pre-save one. The precondition (a real fleeing citizen with a path)
        /// is what makes this non-vacuous — it cannot pass on a sim where nobody ever fled.
        ///
        /// NAMED MUTATION: drop <c>JobKind</c> (or the citizen <c>Path</c>) from the CITZ save
        /// chapter / its StateHash fold — the mid-Flee kind (10) and its path would no longer
        /// round-trip, so <c>loaded.StateHash()</c> would differ from the pre-save hash and the
        /// final assertion fails. (The precondition guarantees a Flee citizen with a path is present
        /// to be dropped, so the mutation genuinely bites.)
        /// </summary>
        [Test]
        public void FleeingCitizen_SaveLoad_RoundTripsBitExact()
        {
            var sim = NewBreachPocketSim();

            Citizen fleeing = null;
            for (int t = 0; t < 4000 && fleeing == null; t++)
            {
                sim.Tick();
                var crew = sim.Citizens.Items;
                for (int i = 0; i < crew.Count; i++)
                    if (!crew[i].Dead && crew[i].JobKind == JobKind.Flee && crew[i].HasPath) { fleeing = crew[i]; break; }
            }

            Assert.That(fleeing, Is.Not.Null,
                "precondition: a crew member reached JobKind.Flee mid-walk from lethal air (sim-driven, no manual Pressurize)");
            Assert.That((byte)fleeing.JobKind, Is.EqualTo((byte)10), "precondition: the fleeing kind is the new value 10");
            Assert.That(fleeing.Path.Count, Is.GreaterThan(fleeing.PathIndex),
                "precondition: it is carrying a live flee path (the thing that must round-trip)");

            ulong beforeSave = sim.StateHash();

            var blob = new MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;

            Simulation loaded = null;
            Assert.DoesNotThrow(
                () => loaded = SaveReader.Read(blob, SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()))),
                "loading a save that contains a JobKind.Flee (10) citizen must not throw");

            Assert.That(loaded.StateHash(), Is.EqualTo(beforeSave),
                "the mid-Flee citizen — its kind (10) and its flee path — round-trips bit-exactly");
        }
    }
}
