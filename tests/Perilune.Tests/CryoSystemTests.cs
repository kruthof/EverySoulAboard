using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ <b>M3-2 — A POD CYCLES.</b> The package's whole claim in one sentence: a capsule whose
    /// <c>Progress</c> is above zero counts down, opens, and <b>a named person steps out as a live
    /// citizen</b>. Everything else here is one of the four rules the system enforces (one at a
    /// time · a wrecked pod never cycles · a pod is single-use · nobody is placed in a wall) or one
    /// of the two contracts a new piece of hashed state owes (it survives a save, and it reaches
    /// <c>Simulation.StateHash</c>).
    ///
    /// <para>⛔ <b>NOTHING PLAYER-FACING DRIVES A CYCLE ON THIS TREE, AND THAT IS BY DESIGN.</b>
    /// <c>ThawCommand</c> and the MOSS thaw op are M3-3's, the countdown badge is M3-4's, the
    /// emergency thaw is M3-5's. Every test below therefore starts a cycle the only way this tree
    /// can — by writing <c>Device.Progress</c> directly, exactly as the charter's mutation table
    /// says to.</para>
    ///
    /// <para><b>THE MUTATION TABLE (charter M3-2), each physically applied, watched go RED for the
    /// right reason, and reverted from an in-memory copy — never <c>git checkout</c> (trap 2). The
    /// per-test doc comments name which row they answer; the quoted failure messages are in the
    /// package report.</b></para>
    ///
    /// <para>⚠️ <b>THE INTERFACE LEG IS SPLIT ACROSS TWO SEPARATE <c>[Test]</c> METHODS ON
    /// PURPOSE</b> (fifth trap shape: <c>Assert</c> throws, so a second leg inside one test body is
    /// indistinguishable from a dead one). Dropping <c>IStatefulSystem</c> from
    /// <see cref="CryoSystem"/>'s declaration must redden BOTH
    /// <see cref="TheCryoFold_ReachesStateHash_AndTheSystemIsRegisteredAsStateful"/> and
    /// <see cref="TheCryoSystem_WritesItsOwnSyssChapter"/>, and NUnit reports each independently.</para>
    /// </summary>
    public class CryoSystemTests
    {
        // ══════════════════════════════════════════════════════════════════════════ fixtures

        /// <summary>The shipping ship (<c>./play.sh</c>'s default) on the default system stack —
        /// twelve authored capsules, eight living sleepers, four wrecked ones.</summary>
        private static Simulation BootWreck()
            => ShipPlanBuilder.Build(
                AuthoredShips.PeriluneWreck(),
                SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));

        private static ISimSystem[] Stack()
            => SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static CryoSystem Cryo(Simulation sim)
        {
            for (int i = 0; i < sim.Systems.Length; i++)
                if (sim.Systems[i] is CryoSystem c) return c;
            return null;
        }

        /// <summary>Every capsule aboard, lowest device id first (the election order).</summary>
        private static List<Device> Pods(Simulation sim)
            => sim.Devices.Items.Where(d => d.Kind == DeviceKind.CryoPod).OrderBy(d => d.Id).ToList();

        /// <summary>A shut, operational capsule — one that CAN cycle.</summary>
        private static List<Device> LivingPods(Simulation sim)
            => Pods(sim).Where(p => !p.IsOpen && p.IsOperational(sim.Defs)).ToList();

        private static int LiveCrew(Simulation sim) => sim.Citizens.Items.Count(c => !c.Dead);

        /// <summary>A one-room synthetic ship: floor x1..3, y1..2, walls all round.</summary>
        private static Simulation Room()
        {
            string[] map =
            {
                "#####",
                "#...#",
                "#...#",
                "#####",
            };
            return new Simulation(AsciiWorld.Build(map), 42, Stack());
        }

        // ═════════════════════════════════════════════════════════════ 1. the player sentence

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME TEST: the pod opens and a PERSON is standing beside it.</b>
        ///
        /// <para>⛔ MUTATION 1 (<c>CryoSystem.Tick</c> becomes a no-op) ⇒ RED here: the pod never
        /// opens. ⛔ MUTATION 2 (open the pod without adding the citizen) ⇒ RED here too, on the
        /// person legs — which are the point of the whole package, so they are asserted first and
        /// by name, not merely by a head-count.</para>
        ///
        /// <para>NON-VACUITY, by inclusion: the chosen capsule is asserted SHUT and OPERATIONAL
        /// before the drive, the crew count is recorded before, and the sim is required to have
        /// advanced. A run in which the pod was already open would pass every clause below while
        /// proving nothing.</para>
        /// </summary>
        [Test]
        public void APodCycles_ThenOpens_AndANamedPersonStepsOut()
        {
            var sim = BootWreck();
            var pod = LivingPods(sim).First();

            // ── preconditions ────────────────────────────────────────────────────────────────
            Assert.That(pod.IsOpen, Is.False, "precondition: the capsule must start SHUT");
            Assert.That(pod.IsOperational(sim.Defs), Is.True, "precondition: the capsule must be able to cycle");
            Assert.That(pod.Name, Does.StartWith("pod_"), "precondition: the capsule carries a sleeper's name");
            int crewBefore = LiveCrew(sim);
            string expected = CryoSystem.SleeperName(pod.Name);
            Assert.That(sim.Citizens.Items.Any(c => c.Name == expected), Is.False,
                "precondition: " + expected + " is not already aboard — the claim would be vacuous");

            // ── the drive: the only way a cycle starts on this tree ──────────────────────────
            pod.Progress = 0.99f;
            for (int t = 0; t < 100 && !pod.IsOpen; t++) sim.Tick();

            // ── the claim ────────────────────────────────────────────────────────────────────
            Assert.That(pod.IsOpen, Is.True, "the capsule never opened");
            Assert.That(LiveCrew(sim), Is.EqualTo(crewBefore + 1),
                "the capsule opened but nobody came out — the whole feature is the person");
            var person = sim.Citizens.Items.FirstOrDefault(c => c.Name == expected);
            Assert.That(person, Is.Not.Null,
                "no crew member called '" + expected + "' aboard; names present: " +
                string.Join(", ", sim.Citizens.Items.Select(c => c.Name)));
            Assert.That(person.Dead, Is.False, "the sleeper woke up dead");
            Assert.That(Int3.IsAdjacent4(person.Pos, pod.Pos), Is.True,
                "the new crew member is not beside their own capsule (" + person.Pos + " vs " + pod.Pos + ")");

            // The cycle is SPENT, not merely finished: Progress is back to 0 so the badge M3-4
            // draws reads "done" rather than a permanently full bar.
            Assert.That(pod.Progress, Is.EqualTo(0f), "an opened capsule must not keep a live cycle");

            // The announcement. The bus is double-buffered and swaps at the END of the publishing
            // tick, so the opening tick's events are readable now — one more Tick would swap them
            // away again (measured: it did, and this comment is what the red taught).
            var thawed = sim.Events.Read<CitizenThawedEvent>().ToArray();
            Assert.That(thawed.Length, Is.EqualTo(1), "exactly one CitizenThawedEvent per thaw");
            Assert.That(thawed[0].CitizenId, Is.EqualTo(person.Id), "the event names a different citizen");
            Assert.That(thawed[0].PodId, Is.EqualTo(pod.Id), "the event names a different capsule");
        }

        /// <summary>
        /// The rate the player will read off M3-4's countdown badge: a cycle from zero takes
        /// <b>240 sim-seconds</b> (4 minutes = 2 400 ticks at 10 Hz), to within one 1 Hz pass.
        /// Spelled in SECONDS and TICKS rather than as <c>Dt / ThawSecondsPerCycle</c>, which would
        /// be the implementation re-deriving itself.
        /// </summary>
        [Test]
        public void AFullCycle_TakesFourSimMinutes()
        {
            var sim = BootWreck();
            var pod = LivingPods(sim).First();
            pod.Progress = 0.000001f; // a cycle just started

            const int FourMinutes = 240 * Simulation.TicksPerSecond; // 2 400 ticks
            for (int t = 0; t < FourMinutes - Simulation.TicksPerSecond * 2; t++) sim.Tick();
            Assert.That(pod.IsOpen, Is.False,
                "the capsule opened EARLY — a four-minute cycle was over in under " +
                (FourMinutes - Simulation.TicksPerSecond * 2) + " ticks");

            for (int t = 0; t < Simulation.TicksPerSecond * 2; t++) sim.Tick();
            Assert.That(pod.IsOpen, Is.True,
                "the capsule had not opened after " + FourMinutes + " ticks (four sim-minutes)");
        }

        // ═════════════════════════════════════════════════════════════════ 2. the four rules

        /// <summary>
        /// ⛔ MUTATION 3 (let a second capsule advance while one is cycling) ⇒ RED: the owner's
        /// stated mechanic is <i>"only one after the other"</i>.
        ///
        /// <para>The second half of the test is the non-vacuity that matters: the queue must
        /// DRAIN. A rule that froze every other capsule forever would pass the first assertion and
        /// break the game.</para>
        /// </summary>
        [Test]
        public void OnlyOneCapsuleCyclesAtATime_AndTheQueueThenDrains()
        {
            var sim = BootWreck();
            var living = LivingPods(sim);
            Assert.That(living.Count, Is.GreaterThan(1), "precondition: the wreck needs two cyclable capsules");
            var first = living[0];   // lower device id ⇒ elected
            var second = living[1];

            int crewBefore = LiveCrew(sim);
            first.Progress = 0.99f;
            second.Progress = 0.5f;
            const float SecondStart = 0.5f;

            for (int t = 0; t < 100 && !first.IsOpen; t++) sim.Tick();

            Assert.That(first.IsOpen, Is.True, "precondition: the elected capsule must finish");
            Assert.That(second.Progress, Is.EqualTo(SecondStart),
                "a second capsule advanced while one was cycling (" + second.Progress + " vs " +
                SecondStart + ") — the owner's mechanic is one after the other");
            Assert.That(LiveCrew(sim), Is.EqualTo(crewBefore + 1), "two people woke at once");

            // …and now that the bay is free, the queued capsule moves.
            for (int t = 0; t < 200; t++) sim.Tick();
            Assert.That(second.Progress, Is.GreaterThan(SecondStart),
                "the queued capsule never resumed once the bay was free — one-at-a-time became never");
        }

        /// <summary>
        /// ⛔ MUTATION 4 (cycle a capsule whose <c>Condition</c> is below <c>fail</c>) ⇒ RED.
        /// <b>Owner decision 9: a wrecked pod's sleeper is dead and it must NEVER cycle.</b>
        ///
        /// <para>⚠️ The fixture asserts the capsule is below <c>fail</c> BEFORE driving — without
        /// that the leg is vacuous. And it carries BOTH shapes: a healthy capsule in the SAME run
        /// opens, which proves the drive itself works and that the wrecked pod's silence is a rule
        /// rather than a dead fixture.</para>
        /// </summary>
        [Test]
        public void AWreckedCapsuleNeverCycles_AndDoesNotBlockAHealthyOne()
        {
            var sim = BootWreck();
            float fail = sim.Defs.Machines[(int)DeviceKind.CryoPod].FailBelow;
            var wrecked = Pods(sim).FirstOrDefault(p => !p.IsOpen && p.Condition < fail);
            Assert.That(wrecked, Is.Not.Null, "precondition: the wreck must author a breached capsule");
            Assert.That(wrecked.Condition, Is.LessThan(fail),
                "precondition: " + wrecked.Name + " must be BELOW the CryoPod fail threshold");
            Assert.That(wrecked.IsOperational(sim.Defs), Is.False, "precondition: and therefore inoperative");

            var healthy = LivingPods(sim).First();
            int crewBefore = LiveCrew(sim);
            wrecked.Progress = 0.99f;
            healthy.Progress = 0.99f;

            for (int t = 0; t < 300; t++) sim.Tick();

            Assert.That(wrecked.IsOpen, Is.False,
                "a breached capsule opened — its sleeper did not survive the raid (OD-9)");
            Assert.That(wrecked.Progress, Is.EqualTo(0.99f),
                "a breached capsule's cycle advanced (" + wrecked.Progress + ") — it must not tick at all");
            // The inclusion control: the drive works, and the wrecked pod did not block it either.
            Assert.That(healthy.IsOpen, Is.True,
                "the healthy capsule never opened — this run proves nothing about the wrecked one");
            Assert.That(LiveCrew(sim), Is.EqualTo(crewBefore + 1), "exactly one person woke");
            Assert.That(sim.Citizens.Items.Any(c => c.Name == CryoSystem.SleeperName(wrecked.Name)), Is.False,
                "a dead sleeper walked out of a breached capsule");
        }

        /// <summary>
        /// A pod is <b>SINGLE-USE</b> (§13.27, owner batch item 6 = A "unfreeze only"): the wreck's
        /// one boot-open capsule can never produce a second copy of the crew member who already
        /// came out of it. ⛔ MUTATION 3b (drop the <c>IsOpen</c> guard from the election) ⇒ RED.
        /// </summary>
        [Test]
        public void AnOpenedCapsuleNeverCyclesAgain()
        {
            var sim = BootWreck();
            var opened = Pods(sim).FirstOrDefault(p => p.IsOpen);
            Assert.That(opened, Is.Not.Null, "precondition: the wreck boots with one open capsule");
            string who = CryoSystem.SleeperName(opened.Name);
            Assert.That(sim.Citizens.Items.Count(c => c.Name == who), Is.EqualTo(1),
                "precondition: that capsule's sleeper is already aboard exactly once");

            int crewBefore = LiveCrew(sim);
            opened.Progress = 0.99f;
            for (int t = 0; t < 300; t++) sim.Tick();

            Assert.That(opened.Progress, Is.EqualTo(0.99f), "an opened capsule's cycle advanced");
            Assert.That(LiveCrew(sim), Is.EqualTo(crewBefore), "an opened capsule produced a second person");
            Assert.That(sim.Citizens.Items.Count(c => c.Name == who), Is.EqualTo(1),
                "there are now two of " + who);
        }

        // ═══════════════════════════════════════════════════════════════════ 3. the exit tile

        /// <summary>
        /// ⛔ MUTATION 6 (place the new citizen on a wall / inside furniture) ⇒ RED. The tile is
        /// the first walkable, DEVICE-FREE 4-neighbour in <see cref="Int3.Neighbor4"/>'s canonical
        /// order (+X, −X, +Y, −Y), and the tie-break is pinned by moving the obstruction rather
        /// than by reading the implementation: with (3,2) clear she stands at (3,2); with a locker
        /// on (3,2) she stands at (1,2), the NEXT candidate in that order.
        /// </summary>
        [Test]
        public void TheExitTile_IsTheFirstWalkableDeviceFreeNeighbour_InCanonicalOrder()
        {
            // leg 1 — nothing in the way: the canonical FIRST candidate wins.
            var a = Room();
            var podA = a.AddDevice(DeviceKind.CryoPod, new Int3(2, 2, 0), "pod_ozawa");
            podA.Progress = 0.99f;
            for (int t = 0; t < 100 && !podA.IsOpen; t++) a.Tick();
            Assert.That(podA.IsOpen, Is.True, "precondition: the capsule must open in the clear room");
            // Counted before Single(), so "nobody came out" reports as a SEMANTIC red rather than
            // as an InvalidOperationException out of LINQ (trap 3: a crash red hides its cause).
            Assert.That(a.Citizens.Count, Is.EqualTo(1), "exactly one person came out of the capsule");
            var personA = a.Citizens.Items.Single();
            Assert.That(personA.Pos, Is.EqualTo(new Int3(3, 2, 0)),
                "the canonical first neighbour (+X) was free and was not chosen");

            // leg 2 — the first candidate carries a device: she must step to the SECOND.
            var b = Room();
            b.AddDevice(DeviceKind.Locker, new Int3(3, 2, 0), "locker");
            var podB = b.AddDevice(DeviceKind.CryoPod, new Int3(2, 2, 0), "pod_ozawa");
            podB.Progress = 0.99f;
            for (int t = 0; t < 100 && !podB.IsOpen; t++) b.Tick();
            Assert.That(podB.IsOpen, Is.True, "precondition: the capsule must still open");
            Assert.That(b.Citizens.Count, Is.EqualTo(1), "exactly one person came out of the capsule");
            var personB = b.Citizens.Items.Single();
            Assert.That(personB.Pos, Is.EqualTo(new Int3(1, 2, 0)),
                "she was placed at " + personB.Pos + " — either inside the locker, or the order moved");
            Assert.That(b.TryGetDeviceAt(personB.Pos, out _), Is.False, "a person was placed inside furniture");
            Assert.That(b.IsWalkable(personB.Pos), Is.True, "a person was placed on an unwalkable tile");
        }

        /// <summary>
        /// The other half of mutation 6: <b>with nowhere legal to stand, the capsule does not
        /// open at all.</b> It holds at full progress and stays shut rather than opening into a
        /// wall or dropping a body onto its own tile.
        /// </summary>
        [Test]
        public void WithNoWalkableNeighbour_TheCapsuleHoldsShut()
        {
            string[] map = { "###", "#.#", "###" };
            var sim = new Simulation(AsciiWorld.Build(map), 42, Stack());
            var pod = sim.AddDevice(DeviceKind.CryoPod, new Int3(1, 1, 0), "pod_ozawa");
            for (int n = 0; n < 4; n++)
                Assert.That(sim.IsWalkable(Int3.Neighbor4(pod.Pos, n)), Is.False,
                    "precondition: the pocket must have no walkable neighbour");

            pod.Progress = 0.99f;
            for (int t = 0; t < 300; t++) sim.Tick();

            Assert.That(pod.IsOpen, Is.False, "the capsule opened with nowhere for anyone to stand");
            Assert.That(sim.Citizens.Count, Is.EqualTo(0), "a person was created inside a sealed pocket");
            Assert.That(pod.Progress, Is.EqualTo(1f), "the held cycle must clamp at 1.0, not drift past it");
        }

        // ══════════════════════════════════════════════════ 4. the state contracts (the pin)

        /// <summary>
        /// ⛔ MUTATION 5: a <b>mid-cycle</b> ship round-trips byte-identically. This is the one
        /// state the feature invents (<c>Progress</c> on a capsule) and the one an existing save
        /// test would otherwise miss — and the run-on leg proves the restored ship keeps CYCLING,
        /// not merely that its bytes matched at rest.
        ///
        /// <para>⚠️ <b>THE CONTROLLED CONFOUND IS NOT OPTIONAL.</b> A load forces a room recompute,
        /// and <c>RemapGas</c>'s pre-existing non-idempotence makes room gas/temperature drift at
        /// ULP scale — measured, documented and deliberately unfixed in
        /// <c>SaveRestoreRunOnTests</c>. Without giving the twin the SAME recompute
        /// (<c>Rooms.MarkDirty()</c>, exactly as that file does at its line 107) the run-on hash
        /// comparison measures that old drift instead of this package's cycle. It was measured
        /// here first: 3 000 ticks of uncontrolled run-on diverged, and it is not a cryo defect.</para>
        /// </summary>
        [Test]
        public void AMidCycleShip_RoundTripsByteIdentical_AndKeepsCycling()
        {
            var sim = BootWreck();
            var pod = LivingPods(sim).First();
            pod.Progress = 0.8f;
            for (int t = 0; t < 100; t++) sim.Tick();
            Assert.That(pod.IsOpen, Is.False, "precondition: the ship must be saved MID-cycle");
            Assert.That(pod.Progress, Is.GreaterThan(0.8f), "precondition: the cycle must have advanced");

            var blob = new MemoryStream();
            SaveWriter.WritePayload(sim, blob);
            byte[] first = blob.ToArray();

            var loaded = SaveReader.ReadPayload(new MemoryStream(first), Stack());
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "the reloaded ship hashes differently");
            var loadedPod = loaded.Devices.Items.First(d => d.Id == pod.Id);
            Assert.That(loadedPod.Progress, Is.EqualTo(pod.Progress), "the mid-cycle Progress did not survive");

            var again = new MemoryStream();
            SaveWriter.WritePayload(loaded, again);
            Assert.That(again.ToArray(), Is.EqualTo(first), "save → load → save is not byte-identical");

            // Run-on: both ships finish the SAME cycle and end on the same state.
            loaded.Rooms.MarkDirty();
            sim.Rooms.MarkDirty(); // the matched recompute — see the note above
            for (int t = 0; t < 500; t++) { sim.Tick(); loaded.Tick(); }

            Assert.That(pod.IsOpen, Is.True, "precondition: the cycle must complete during the run-on");
            Assert.That(loadedPod.IsOpen, Is.True, "the restored ship's capsule never opened");
            Assert.That(loaded.Citizens.Count, Is.EqualTo(sim.Citizens.Count), "a different number of people woke");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "a restored mid-cycle ship diverged from its uninterrupted twin");
        }

        /// <summary>
        /// ⛔ MUTATION 7, leg A — <b>drop <c>IStatefulSystem</c> from <see cref="CryoSystem"/>'s
        /// declaration and the fold disappears</b> (<c>Simulation.cs:605-608</c> is conditional on
        /// the interface: registering a stateless system folds NOTHING). ⛔ MUTATION 8 — make
        /// <c>StateChecksum()</c> return a constant and the emergency bit stops reaching the hash.
        ///
        /// <para>⚠️ <b>THE PRECONDITION IS THE WHOLE TEST.</b> The bit is SET before the second
        /// hash: with a permanently-zero bit, a constant checksum is byte-identical to a real one
        /// and the leg would be vacuous (the same discipline as mutation 4's "assert it is below
        /// <c>fail</c> BEFORE driving").</para>
        ///
        /// <para>⚠️ Blinded from leg B, which is its own <c>[Test]</c> — fifth trap shape.</para>
        /// </summary>
        [Test]
        public void TheCryoFold_ReachesStateHash_AndTheSystemIsRegisteredAsStateful()
        {
            var sim = BootWreck();

            // Registration is by INCLUSION: exactly one stateful system called "Cryo" is in the
            // shipped stack. A cast that failed would make every fold assertion below vacuous.
            var stateful = sim.Systems.OfType<IStatefulSystem>().Where(s => s.Name == "Cryo").ToList();
            Assert.That(stateful.Count, Is.EqualTo(1),
                "the shipped stack has " + stateful.Count + " stateful systems named 'Cryo' — " +
                "registering a STATELESS system folds nothing and saves nothing");

            ulong before = sim.StateHash();
            Cryo(sim).MarkEmergencyThawFired();
            Assert.That(Cryo(sim).EmergencyThawFired, Is.True, "precondition: the bit must actually be set");
            ulong after = sim.StateHash();

            Assert.That(after, Is.Not.EqualTo(before),
                "the emergency-thaw bit does not reach Simulation.StateHash — either CryoSystem is " +
                "not an IStatefulSystem, or its StateChecksum ignores its own state");
        }

        /// <summary>
        /// ⛔ MUTATION 7, leg B — the same mutation must also make the <b>SYSS chapter vanish from
        /// the save</b> (<c>Save/SaveWriter.cs:120-128</c> writes one chapter per
        /// <c>IStatefulSystem</c>). Read off the SAVED BYTES, not off the system list: the claim is
        /// about what a file contains.
        ///
        /// <para>⚠️ Its own <c>[Test]</c>, blinded from leg A (fifth trap shape).</para>
        /// </summary>
        [Test]
        public void TheCryoSystem_WritesItsOwnSyssChapter()
        {
            var sim = BootWreck();
            var names = SyssChapterNames(sim);

            // Non-vacuity by inclusion: the parser really does find chapters, including known ones.
            Assert.That(names, Is.Not.Empty, "the save has no SYSS chapters at all — the parser is broken");
            Assert.That(names, Contains.Item("Build"), "the SYSS parser missed a known stateful system");

            Assert.That(names, Contains.Item("Cryo"),
                "no SYSS chapter for Cryo in the save; chapters present: " + string.Join(", ", names));
        }

        /// <summary>
        /// The emergency-thaw bit survives a save/load — the contract every new piece of hashed
        /// state owes in the SAME commit that invents it. M3-5 inherits storage it does not have to
        /// build, which is the whole reason the bit ships here (M2-1 → M2-19's shape).
        /// </summary>
        [Test]
        public void TheEmergencyThawBit_RoundTrips()
        {
            var sim = BootWreck();
            Cryo(sim).MarkEmergencyThawFired();
            for (int t = 0; t < 20; t++) sim.Tick();

            var blob = new MemoryStream();
            SaveWriter.WritePayload(sim, blob);
            var loaded = SaveReader.ReadPayload(new MemoryStream(blob.ToArray()), Stack());

            Assert.That(Cryo(loaded).EmergencyThawFired, Is.True,
                "the emergency-thaw bit did not survive the save — M3-5 would inherit a latch that resets");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "the restored ship hashes differently");
        }

        /// <summary>
        /// ⛔ MUTATION 9 — <b>set the emergency bit anywhere in this package and this goes RED.</b>
        /// M3-2 STORES the latch and never writes it; M3-5 is the writer. Driven, not scanned: the
        /// wreck runs with a real thaw completing inside the window, which is the code path most
        /// likely to want to set it.
        ///
        /// <para>✅ <b>M3-5 HAS LANDED AND THIS IS STILL TRUE AND STILL MEANINGFUL.</b> M3-5's
        /// branch runs only on a ship with NO living crew (<c>CryoSystem.EmergencyWatch</c>), and
        /// this drive keeps Rell alive throughout — so the claim narrows honestly from "nothing in
        /// the codebase writes it" to "an ordinary thaw with a crew aboard does not". The emergency
        /// writer has its own suite (<c>EmergencyThawTests</c>).</para>
        /// </summary>
        [Test]
        public void NothingInThisPackageEverSetsTheEmergencyThawBit()
        {
            var sim = BootWreck();
            Assert.That(Cryo(sim).EmergencyThawFired, Is.False, "the latch must boot clear");

            var pod = LivingPods(sim).First();
            pod.Progress = 0.99f;
            for (int t = 0; t < 1000; t++) sim.Tick();

            // Non-vacuity: a run in which no capsule ever opened would prove nothing about the
            // one code path that might have been tempted to set it.
            Assert.That(pod.IsOpen, Is.True, "precondition: a thaw must actually have happened in this run");
            Assert.That(Cryo(sim).EmergencyThawFired, Is.False,
                "something in M3-2 set the emergency-thaw latch — this package stores it, M3-5 writes it");
        }

        // ═════════════════════════════════════════════════════════════════ 5. the person's name

        /// <summary>
        /// The display name is the inverse of the authoring convention
        /// (<c>sim/Sim.Gen/AuthoredShips.cs:1963</c>: <c>"pod_" + Who.ToLowerInvariant()</c>), and a
        /// capsule that does not follow the convention keeps its name verbatim rather than being
        /// mangled into an invented person.
        /// </summary>
        [Test]
        public void TheSleepersName_IsTheInverseOfTheAuthoringConvention()
        {
            Assert.That(CryoSystem.SleeperName("pod_ozawa"), Is.EqualTo("Ozawa"));
            Assert.That(CryoSystem.SleeperName("pod_lindqvist"), Is.EqualTo("Lindqvist"));
            Assert.That(CryoSystem.SleeperName("capsule_7"), Is.EqualTo("capsule_7"), "no prefix ⇒ verbatim");
            Assert.That(CryoSystem.SleeperName("pod_"), Is.EqualTo("pod_"), "an empty who ⇒ verbatim");
            Assert.That(CryoSystem.SleeperName(""), Is.EqualTo(""));

            // …and it agrees with what the ship actually authored, for every living sleeper.
            var sim = BootWreck();
            foreach (var pod in LivingPods(sim))
                Assert.That(CryoSystem.SleeperName(pod.Name), Does.Match("^[A-Z][a-z]+$"),
                    pod.Name + " would wake up as '" + CryoSystem.SleeperName(pod.Name) + "'");
        }

        // ══════════════════════════════════════════════════════════════════════════ helpers

        /// <summary>
        /// The <c>Name</c> of every SYSS chapter in a freshly written save, parsed off the raw
        /// payload bytes (header layout: <c>Save/SaveWriter.cs:140-155</c>; chapter framing:
        /// <c>:161-173</c>; SYSS payload: <c>:127-131</c> — name, blob version, body).
        /// </summary>
        private static List<string> SyssChapterNames(Simulation sim)
        {
            var ms = new MemoryStream();
            SaveWriter.WritePayload(sim, ms);
            ms.Position = 0;
            var r = new BinaryReader(ms, SaveFormat.Utf8, leaveOpen: true);

            r.ReadBytes(4);      // magic
            r.ReadUInt16();      // global version
            r.ReadInt64();       // tick
            r.ReadUInt32();      // next entity id
            r.ReadUInt64(); r.ReadUInt64(); r.ReadUInt64(); r.ReadUInt64(); // rng
            r.ReadInt32(); r.ReadInt32(); r.ReadInt32();                    // dimensions
            r.ReadSingle();      // wastewater litres (header v2)

            var names = new List<string>();
            while (ms.Position < ms.Length)
            {
                uint fourCC = r.ReadUInt32();
                r.ReadUInt16();                 // chapter version
                int length = r.ReadInt32();
                long end = ms.Position + length;
                if (fourCC == SaveFormat.SystemChapter) names.Add(r.ReadString());
                ms.Position = end;
            }
            return names;
        }
    }
}
