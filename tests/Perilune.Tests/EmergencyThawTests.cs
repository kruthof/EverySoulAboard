using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-5 — THE EMERGENCY THAW, AND THE ENDING IT IMPLIES.</b>
    ///
    /// <para><b>THE PLAYER SENTENCE.</b> Today the run dies with the first pawn, silently, in minute
    /// three. After this the ship wakes one more soul <b>by itself, once</b>, and says so — and when
    /// no intact pod remains, <b>the run ends on screen</b>.</para>
    ///
    /// <para>⛔ <b>EVERY DEATH HERE IS DRIVEN THROUGH A SYSTEM, NOT SYNTHESISED BETWEEN TICKS, AND
    /// THAT IS NOT FUSSINESS — IT IS THE ONLY WAY THE FIXTURE IS HONEST.</b> The event bus
    /// double-buffers per tick: a <c>CitizenDiedEvent</c> published from test code BETWEEN ticks
    /// lands in the write buffer and is not readable until the tick AFTER the next one, by which
    /// time <c>CryoSystem</c> has already seen an empty ship and fired with no name to say. In the
    /// real path <c>NeedsSystem</c> publishes and removes INSIDE tick N and ticks AFTER
    /// <c>CryoSystem</c> (<c>SystemStack.cs</c>), so <c>CryoSystem</c>'s first look at a crewless
    /// ship is tick N+1 — exactly when the event is readable. <see cref="Executioner"/> reproduces
    /// that alignment by sitting at the same place in the stack and doing what
    /// <c>NeedsSystem.Kill</c> does, line for line. A test that got this wrong would have passed
    /// every clause below with the wake line reading <i>"With a crew member dead…"</i>.</para>
    ///
    /// <para><b>THE MUTATION TABLE (charter M3-5), each physically applied, watched go RED for the
    /// right reason, and reverted from an in-memory copy — never <c>git checkout</c> (trap 2). The
    /// per-test doc comments name which row they answer; the quoted failure messages are in the
    /// package report.</b></para>
    ///
    /// <para>⚠️ <b>THE LEGS ARE SPLIT ACROSS SEPARATE <c>[Test]</c> METHODS ON PURPOSE</b> (fifth
    /// trap shape: <c>Assert</c> throws, so a second leg inside one body is indistinguishable from a
    /// dead one), and where several facts have to be checked about ONE drive they are COLLECTED into
    /// a problem list and asserted once at the end, so a failure reports every leg rather than the
    /// first.</para>
    /// </summary>
    public class EmergencyThawTests
    {
        // ══════════════════════════════════════════════════════════════════════════ fixtures

        /// <summary>
        /// ⭐ THE DEATH, DRIVEN FROM INSIDE THE TICK. Registered LAST in the stack — after
        /// <c>CryoSystem</c>, which is what <c>NeedsSystem</c>'s real position guarantees — and it
        /// does exactly what <c>NeedsSystem.Kill</c> does (<c>Systems/NeedsSystem.cs:196-206</c>):
        /// flag <c>Dead</c>, cancel the job, leave a labelled <see cref="ItemKind.Corpse"/>, publish
        /// <see cref="CitizenDiedEvent"/> CARRYING THE NAME, and remove from the store.
        /// </summary>
        private sealed class Executioner : ISimSystem
        {
            public string Name => "Executioner";
            public int IntervalTicks => 1;
            private bool _armed;

            /// <summary>Kill everyone alive on the next tick.</summary>
            public void ArmAll() => _armed = true;

            public void Tick(Simulation sim)
            {
                if (!_armed) return;
                _armed = false;
                var doomed = sim.Citizens.Items.Where(c => !c.Dead).ToList();
                foreach (var c in doomed)
                {
                    c.Suffocation = 1f;
                    c.Dead = true;
                    sim.CancelJob(c);
                    var corpse = sim.AddItem(ItemKind.Corpse, 1, c.Pos);
                    corpse.Label = c.Name;
                    sim.Events.Publish(new CitizenDiedEvent { CitizenId = c.Id, Pos = c.Pos, Name = c.Name });
                    sim.Citizens.Remove(c.Id);
                }
            }
        }

        private static ISimSystem[] Stack(out Executioner exec)
        {
            exec = new Executioner();
            var list = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())).ToList();
            list.Add(exec);
            return list.ToArray();
        }

        private static ISimSystem[] PlainStack()
            => SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        /// <summary>The shipping ship (<c>./play.sh</c>'s default) with the executioner appended —
        /// twelve authored capsules and exactly one soul awake.</summary>
        private static Simulation BootWreck(out Executioner exec)
            => ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack(out exec));

        private static CryoSystem Cryo(Simulation sim) => CryoSystem.Of(sim);

        private static HistorySystem History(Simulation sim)
            => sim.Systems.OfType<HistorySystem>().Single();

        private static List<string> Chronicle(Simulation sim)
            => History(sim).Entries.Select(e => e.Text).ToList();

        private static Device Pod(Simulation sim, string name)
            => sim.Devices.Items.Single(d => d.Kind == DeviceKind.CryoPod && d.Name == name);

        private static int LiveCrew(Simulation sim) => sim.Citizens.Items.Count(c => !c.Dead);

        /// <summary>
        /// ⚠️ <b>A DISCLOSED FIXTURE CONTROL, and every test that names an expected capsule needs
        /// it.</b> The wreck's one pawn boots with <c>AutoWander</c> on (<c>AuthoredShips.cs</c>),
        /// so she is somewhere else on every tick — and "the NEAREST intact capsule" is measured
        /// from where she FELL. Without pinning her down the expected answer is a function of how
        /// many ticks the test happened to run, which is a green test that pins nothing. She is
        /// frozen at her authored tile (4,2,0) and the tests assert that is where she is.
        /// </summary>
        private static Citizen FreezeTheCrew(Simulation sim)
        {
            Citizen last = null;
            foreach (var c in sim.Citizens.Items)
            {
                c.AutoWander = false;
                c.HoldPosition = true;
                last = c;
            }
            return last;
        }

        /// <summary>Run the last soul aboard to their death.</summary>
        private static void KillEveryone(Simulation sim, Executioner exec)
        {
            Assert.That(LiveCrew(sim), Is.GreaterThan(0), "PRECONDITION: somebody has to be alive to die");
            exec.ArmAll();
            sim.Tick();                                    // the kill happens INSIDE this tick
            Assert.That(LiveCrew(sim), Is.Zero, "PRECONDITION: the crew really is gone");
        }

        // ═════════════════════════════════════════════════ 1. the player sentence, end to end

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME TEST: the last pawn dies and — without a pause — a capsule is
        /// cycling; four sim-minutes later a named person is standing beside it.</b>
        ///
        /// <para>NON-VACUITY, by inclusion: the ship is asserted to boot with exactly one soul and a
        /// clear latch, and the elected capsule is asserted SHUT and OPERATIONAL beforehand. A run
        /// that started with nobody aboard, or with the latch already set, would satisfy several
        /// clauses below while proving nothing.</para>
        ///
        /// <para>⛔ <b>"WITHOUT A PAUSE" IS ASSERTED AS ONE TICK, not as "eventually".</b> The
        /// charter's own reason: <i>if the grace is silent the player believes the game ended and
        /// quits</i>. A grace that starts a second later is a different feature.</para>
        /// </summary>
        [Test]
        public void TheLastPawnDies_AndTheShipWakesOneMoreSoulByItself()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            Assert.That(LiveCrew(sim), Is.EqualTo(1), "PRECONDITION: the wreck boots with exactly one soul awake");
            Assert.That(Cryo(sim).EmergencyThawFired, Is.False, "PRECONDITION: the latch boots clear");
            Assert.That(Cryo(sim).RunEnded, Is.False, "PRECONDITION: the run has not ended before it started");

            // The nearest INTACT capsule to where Rell stands. Named, not derived, so a fixture
            // change cannot silently redefine the expected answer (M3-6's discipline).
            var ozawa = Pod(sim, "pod_ozawa");
            Assert.That(ozawa.IsOpen, Is.False, "PRECONDITION: pod_ozawa must be shut");
            Assert.That(ozawa.IsOperational(sim.Defs), Is.True, "PRECONDITION: pod_ozawa must be intact");
            Assert.That(ozawa.Progress, Is.Zero, "PRECONDITION: pod_ozawa is not already cycling");

            for (int t = 0; t < 20; t++) sim.Tick();       // let the ship settle
            KillEveryone(sim, exec);

            sim.Tick();                                    // ⇐ THE VERY NEXT TICK

            var problems = new List<string>();
            if (!Cryo(sim).EmergencyThawFired) problems.Add("the latch did not fire");
            if (Cryo(sim).EmergencyPodId != ozawa.Id)
                problems.Add("the ship elected device " + Cryo(sim).EmergencyPodId + ", not pod_ozawa (" + ozawa.Id + ")");
            if (ozawa.Progress <= 0f)
                problems.Add("pod_ozawa is not counting down one tick after the death — the grace is silent");
            if (Cryo(sim).RunEnded) problems.Add("the run ended during the grace period");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));

            // …and four sim-minutes later, a person.
            for (int t = 0; t < 3000 && LiveCrew(sim) == 0; t++) sim.Tick();

            Assert.That(LiveCrew(sim), Is.EqualTo(1),
                "the capsule cycled but nobody came out — the whole feature is the person");
            var woken = sim.Citizens.Items.Single(c => !c.Dead);
            Assert.That(woken.Name, Is.EqualTo("Ozawa"), "the ship woke the wrong sleeper");
            Assert.That(ozawa.IsOpen, Is.True, "the elected capsule never opened");
            Assert.That(Int3.IsAdjacent4(woken.Pos, ozawa.Pos), Is.True,
                "Ozawa is not standing beside her own capsule (" + woken.Pos + " vs " + ozawa.Pos + ")");
            Assert.That(Cryo(sim).RunEnded, Is.False, "the run ended even though somebody is alive");
        }

        // ═══════════════════════════════════════════ 2. mutation 4 — the message leg, BOTH lines

        /// <summary>
        /// ⛔ <b>MUTATION 4 — fire with an intact pod but skip the Chronicle.</b> The whole feature
        /// is a message, so both lines are pinned by their EXACT sentence: the death (already
        /// automatic, <c>HistorySystem</c> on <c>CitizenDiedEvent</c>) and the wake (new).
        ///
        /// <para>⚠️ COLLECT-THEN-ASSERT. Two independent facts about one drive; a bare
        /// <c>Assert</c> on the first would hide a dead second leg (fifth trap).</para>
        /// </summary>
        [Test]
        public void TheChronicle_NamesBothPeople()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();
            string deadName = sim.Citizens.Items.Single(c => !c.Dead).Name;
            Assert.That(deadName, Is.EqualTo("Rell"), "PRECONDITION: the wreck's one soul is Rell");
            Assert.That(Chronicle(sim).Any(t => t.Contains("Rell")), Is.False,
                "PRECONDITION: the Chronicle does not already name Rell — the claim would be vacuous");

            KillEveryone(sim, exec);
            for (int t = 0; t < 3200 && LiveCrew(sim) == 0; t++) sim.Tick();

            var lines = Chronicle(sim);
            var kinds = History(sim).Entries;
            var problems = new List<string>();

            if (!lines.Contains("Rell has died."))
                problems.Add("no death line; Chronicle = [" + string.Join(" | ", lines) + "]");
            if (!lines.Contains("With Rell dead, the ship woke Ozawa."))
                problems.Add("no wake line naming BOTH people; Chronicle = [" + string.Join(" | ", lines) + "]");
            if (!kinds.Any(e => e.Kind == (byte)HistoryKind.EmergencyThaw))
                problems.Add("the wake line is not a HistoryKind.EmergencyThaw entry — M5-1 cannot find it");
            if (kinds.Count(e => e.Kind == (byte)HistoryKind.EmergencyThaw) != 1)
                problems.Add("the wake line was recorded " +
                             kinds.Count(e => e.Kind == (byte)HistoryKind.EmergencyThaw) + " times");

            Assert.That(problems, Is.Empty, string.Join(" · ", problems));
        }

        // ═══════════════════════════════════════════════════ 3. mutation 1 — once per run

        /// <summary>
        /// ⛔ <b>MUTATION 1 — fire twice.</b> The woken soul dies in her turn and <b>nothing
        /// cycles</b>: <i>"protects minute three without protecting hour three"</i>.
        ///
        /// <para>NON-VACUITY: the ship is asserted to still hold intact capsules at the moment of
        /// the second death — otherwise "nothing cycled" would be true for the wrong reason, and
        /// this test would be a duplicate of the ending leg.</para>
        /// </summary>
        [Test]
        public void TheEmergencyThawFiresOncePerRun()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();

            KillEveryone(sim, exec);                                   // death 1 — the reprieve
            for (int t = 0; t < 3200 && LiveCrew(sim) == 0; t++) sim.Tick();
            Assert.That(LiveCrew(sim), Is.EqualTo(1), "PRECONDITION: the first emergency thaw must have worked");
            int openPods = sim.Devices.Items.Count(d => d.Kind == DeviceKind.CryoPod && d.IsOpen);

            KillEveryone(sim, exec);                                   // death 2 — no reprieve
            for (int t = 0; t < 3200; t++) sim.Tick();

            var problems = new List<string>();
            int intact = sim.Devices.Items.Count(d => d.Kind == DeviceKind.CryoPod && !d.IsOpen
                                                      && d.Powered && d.IsOperational(sim.Defs));
            if (intact == 0) problems.Add("NON-VACUITY FAILED: no intact capsule was left to refuse");
            if (LiveCrew(sim) != 0) problems.Add("a SECOND soul was woken — the reprieve is not once per run");
            if (sim.Devices.Items.Any(d => d.Kind == DeviceKind.CryoPod && d.Progress > 0f))
                problems.Add("a capsule started counting down after the second death");
            if (sim.Devices.Items.Count(d => d.Kind == DeviceKind.CryoPod && d.IsOpen) != openPods)
                problems.Add("a second capsule opened");
            if (!Cryo(sim).RunEnded) problems.Add("the run did not end after the second death");

            Assert.That(problems, Is.Empty, string.Join(" · ", problems));
        }

        // ══════════════════════════════ 4. mutation 2 — a wrecked capsule is never elected

        /// <summary>
        /// ⛔ <b>MUTATION 2 — select a wrecked pod.</b> The charter's fixture (<i>nearest pod
        /// wrecked, next-nearest intact</i>), built on the SHIPPING SHIP rather than a synthetic
        /// one — <c>PowerSystem</c> leaves every device on a conduit-less test map unpowered, so a
        /// synthetic bay would fail term 1 for a reason that has nothing to do with the claim.
        ///
        /// <para>⭐ <b>THE FIXTURE DISCRIMINATES THREE WRONG ANSWERS AT ONCE</b>, which is why it is
        /// built by wrecking exactly one capsule. Rell comes to rest at (3,1,0) and the right answer
        /// is <c>pod_torres</c> (distance 3, id 552):</para>
        /// <list type="bullet">
        /// <item><b>wrecked capsules eligible</b> ⇒ <c>pod_ozawa</c> (distance 1, wrecked by this
        /// fixture) would win instead.</item>
        /// <item><b>opened capsules eligible</b> ⇒ <c>pod_rell</c> (distance 1, already open — the
        /// boot pawn's own capsule) would win instead.</item>
        /// <item><b>distance ignored, lowest id only</b> ⇒ <c>pod_mbeki</c> (id 551 &lt; 552, but
        /// distance 5) would win instead.</item>
        /// </list>
        ///
        /// <para>⚠️ COLLECT-THEN-ASSERT, and the three discriminators are asserted as PROPERTIES OF
        /// THE FIXTURE first: if the wreck's authoring ever moves a capsule, this test says the
        /// fixture stopped discriminating rather than quietly testing nothing.</para>
        /// </summary>
        [Test]
        public void AWreckedCapsuleIsNeverElected_NorAnOpenedOne()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();

            var rellPod = Pod(sim, "pod_rell");
            var ozawa = Pod(sim, "pod_ozawa");
            var sokolov = Pod(sim, "pod_sokolov");
            var torres = Pod(sim, "pod_torres");
            var mbeki = Pod(sim, "pod_mbeki");
            var rell = sim.Citizens.Items.Single(c => !c.Dead);

            // Wreck the one capsule that is both nearest and intact, so "nearest" and "intact"
            // point at different capsules from here on.
            ozawa.Condition = 0.02f;

            var fixture = new List<string>();
            if (rell.Pos != new Int3(3, 1, 0))
                fixture.Add("the pawn came to rest at " + rell.Pos + ", not (3,1,0) — every distance below moved");
            if (!rellPod.IsOpen) fixture.Add("pod_rell is not open — the opened-capsule discriminator is gone");
            if (ozawa.IsOperational(sim.Defs)) fixture.Add("pod_ozawa is still operational — the wreck did not take");
            if (sokolov.IsOperational(sim.Defs)) fixture.Add("pod_sokolov is operational — it must be a wreck");
            if (!torres.IsOperational(sim.Defs)) fixture.Add("pod_torres is not intact — there is no right answer left");
            if (Manhattan(ozawa, rell) >= Manhattan(torres, rell))
                fixture.Add("the WRECKED capsule is no longer NEARER than the intact one");
            if (Manhattan(rellPod, rell) >= Manhattan(torres, rell))
                fixture.Add("the OPENED capsule is no longer NEARER than the intact one");
            if (mbeki.Id >= torres.Id) fixture.Add("pod_mbeki no longer beats pod_torres on id alone");
            if (Manhattan(mbeki, rell) <= Manhattan(torres, rell))
                fixture.Add("pod_mbeki is no longer FARTHER than pod_torres");
            Assert.That(fixture, Is.Empty, "THE FIXTURE STOPPED DISCRIMINATING: " + string.Join(" · ", fixture));

            KillEveryone(sim, exec);
            sim.Tick();

            var problems = new List<string>();
            uint elected = Cryo(sim).EmergencyPodId;
            if (elected != torres.Id)
                problems.Add("elected device " + elected + " (" + NameOfDevice(sim, elected) +
                             "), expected pod_torres (" + torres.Id + ")");
            if (ozawa.Progress > 0f) problems.Add("a WRECKED capsule (pod_ozawa) was started");
            if (sokolov.Progress > 0f) problems.Add("a WRECKED capsule (pod_sokolov) was started");
            if (rellPod.Progress > 0f) problems.Add("an OPENED capsule (pod_rell) was started");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));

            // …and the person who steps out is the one the intact capsule held.
            for (int t = 0; t < 3200 && LiveCrew(sim) == 0; t++) sim.Tick();
            Assert.That(sim.Citizens.Items.Where(c => !c.Dead).Select(c => c.Name).ToList(),
                Is.EqualTo(new List<string> { "Torres" }),
                "the intact capsule is the one that must have opened");
        }

        /// <summary>
        /// ⛔⛔ <b>A CYCLE THE PLAYER PAID FOR IS NEVER STAMPED ON, AND THE REPRIEVE IS NOT SPENT ON
        /// IT.</b> Found in independent review, driven: the election used to ignore
        /// <c>Device.Progress</c> and the assignment was unconditional, so a `ThawCommand` cycle
        /// 216 s into its 240 was reset to one pass — <b>3.6 sim-minutes of purchased progress
        /// discarded, silently, at the moment the player can least afford it.</b>
        ///
        /// <para>⭐ <b>THE SEMANTICS THIS PINS, STATED.</b> A capsule already counting down IS the
        /// grace, so the ship's one free reprieve is <b>not</b> spent on it. That is the charter's
        /// "protects minute three without protecting hour three" read literally: the reprieve exists
        /// because the player has nobody left and no way to ask. A player who ALREADY asked, and
        /// paid, has not used it — and the last leg below proves it is still there afterwards.</para>
        ///
        /// <para>⚠️ COLLECT-THEN-ASSERT, and the paid cycle's progress is recorded BEFORE the death
        /// so the comparison is against a measured value rather than a literal.</para>
        ///
        /// <para>⛔⛔ <b>TWO ARRANGEMENTS, AND THE FIRST ONE IS THE FIX FOR A NAMED MUTATION THAT
        /// COULD NOT BITE</b> — the very shape this test exists to close, found in this test by
        /// independent review. The paid capsule must be <b>the one the election would otherwise
        /// pick</b> (<c>pod_ozawa</c>, nearest to where the pawn falls): with the paid cycle on a
        /// capsule the election would ignore, mutation D2-a starts a DIFFERENT capsule and the
        /// headline clause — <i>"the paid cycle was RESET"</i>, the defect's own sentence — can
        /// never fire. The not-nearest arrangement is kept as
        /// <see cref="ACycleOnACapsuleTheElectionWouldNotHavePicked_IsAlsoLeftAlone"/> because it
        /// produces a discriminator the nearest one cannot: <i>"a SECOND capsule started counting
        /// down"</i>. Each is its own <c>[Test]</c> so NUnit reports them independently (fifth trap
        /// shape).</para>
        /// </summary>
        [Test]
        public void ACycleThePlayerPaidFor_IsNeverStampedOn_AndDoesNotSpendTheReprieve()
            => DriveAPaidCycleThroughTheLastDeath("pod_ozawa", "OZAWA", "Ozawa");

        /// <summary>
        /// The second arrangement (see the test above): the paid capsule is one the election would
        /// NOT have picked, which is the only way to produce the <i>"a SECOND capsule started
        /// counting down"</i> discriminator — under mutation D2-a the ship starts <c>pod_ozawa</c>
        /// beside the player's own running cycle.
        /// </summary>
        [Test]
        public void ACycleOnACapsuleTheElectionWouldNotHavePicked_IsAlsoLeftAlone()
            => DriveAPaidCycleThroughTheLastDeath("pod_lindqvist", "LINDQVIST", "Lindqvist");

        private static void DriveAPaidCycleThroughTheLastDeath(string podName, string bannerName, string sleeper)
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();

            // The state a paid `ThawCommand` is in 216 s into its 240 — the command's only effect on
            // the capsule is `Progress`, so this IS that state (Commands.cs:939 + M3-2's countdown).
            var paid = Pod(sim, podName);
            paid.Progress = 0.9f;
            for (int t = 0; t < 10; t++) sim.Tick();
            float before = paid.Progress;
            Assert.That(before, Is.GreaterThan(0.9f), "PRECONDITION: the paid cycle must be advancing");

            KillEveryone(sim, exec);
            sim.Tick();

            var problems = new List<string>();
            if (paid.Progress < before)
                problems.Add("the paid cycle was RESET (" + before + " → " + paid.Progress + ")");
            if (Cryo(sim).EmergencyThawFired)
                problems.Add("the reprieve was spent on a cycle the player had already paid for");
            if (Cryo(sim).EmergencyPodId != 0)
                problems.Add("the ship elected a capsule while one was already counting down");
            if (Cryo(sim).RunEnded) problems.Add("the run ended while a capsule was counting down");
            if (sim.Devices.Items.Count(d => d.Kind == DeviceKind.CryoPod && d.Progress > 0f) != 1)
                problems.Add("a SECOND capsule started counting down");
            // …and the grace is still not silent, even though nothing was elected.
            if (WireFormat.EndingBanner(sim) != "ALL HANDS DOWN — THE SHIP IS WAKING " + bannerName + ".")
                problems.Add("the banner reads '" + WireFormat.EndingBanner(sim) + "' — a dead ship with a "
                             + "capsule counting down and a blank screen is the silence this package closes");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));

            // The paid sleeper arrives, and the ship claims no credit for her.
            for (int t = 0; t < 3200 && LiveCrew(sim) == 0; t++) sim.Tick();
            Assert.That(sim.Citizens.Items.Where(c => !c.Dead).Select(c => c.Name).ToList(),
                Is.EqualTo(new List<string> { sleeper }), "the paid capsule is the one that must have opened");
            Assert.That(History(sim).Entries.Any(e => e.Kind == (byte)HistoryKind.EmergencyThaw), Is.False,
                "the ship wrote a wake line for a rescue the PLAYER paid for");

            // ⭐ THE JUSTIFICATION LEG: the reprieve really is still there.
            KillEveryone(sim, exec);
            sim.Tick();
            Assert.That(Cryo(sim).EmergencyThawFired, Is.True,
                "the reprieve did not fire on the NEXT death — it had been silently burnt after all");
            Assert.That(Cryo(sim).EmergencyPodId, Is.Not.Zero, "and it elected nobody");
        }

        /// <summary>
        /// ⛔ <b>A DEPOWERED CAPSULE IS NEVER ELECTED</b> — term 1's third conjunct
        /// (<c>PodNoSignal</c>), which the first draft of this suite left uncovered and wrongly
        /// filed as "no cheap fixture exists". The fixture is
        /// <c>ThawGateTests.TermOne_SpeaksItsThreeSentences</c>'s own, on the SHIPPING ship:
        /// <c>Powered = false</c> by hand.
        ///
        /// <para>⭐ <b>IT REACHES THIS PATH ONLY BECAUSE OF A COUPLING M3-5 CREATED, AND THE
        /// PRECONDITION BELOW IS WHAT MAKES THE LEG HONEST RATHER THAN LUCKY.</b>
        /// <c>PowerSystem.IntervalTicks</c> is 10 and it re-assigns <c>Powered</c> unconditionally
        /// (<c>PowerSystem.cs:298-301</c>), so a hand-set <c>false</c> is wiped on every tick divisible
        /// by ten. <c>CryoSystem</c> now ticks at 1, so on the other nine it survives to the read.
        /// The drive is therefore phase-locked OFF a power pass, and the capsule is asserted STILL
        /// DEPOWERED afterwards — without that check a run that happened to land on a power pass
        /// would pass this test while proving nothing.</para>
        ///
        /// <para>The fixture is <see cref="AWreckedCapsuleIsNeverElected_NorAnOpenedOne"/>'s with the
        /// wreck swapped for a depower, so the right answer and its three discriminators are the
        /// same and are re-asserted here rather than inherited.</para>
        /// </summary>
        [Test]
        public void ADepoweredCapsuleIsNeverElected()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();

            // Phase-lock: the kill lands on …8 and the watch reads on …9, so no power pass runs
            // between the depower and the election.
            while (sim.TickCount % 10 != 8) sim.Tick();

            var ozawa = Pod(sim, "pod_ozawa");
            var torres = Pod(sim, "pod_torres");
            var rell = sim.Citizens.Items.Single(c => !c.Dead);

            var fixture = new List<string>();
            if (rell.Pos != new Int3(3, 1, 0))
                fixture.Add("the pawn came to rest at " + rell.Pos + ", not (3,1,0) — the distances moved");
            if (!ozawa.Powered) fixture.Add("pod_ozawa was ALREADY depowered — the arrangement proves nothing");
            if (!ozawa.IsOperational(sim.Defs))
                fixture.Add("pod_ozawa is not operational — this leg must isolate POWER, not condition");
            if (Manhattan(ozawa, rell) >= Manhattan(torres, rell))
                fixture.Add("the depowered capsule is no longer NEARER than the intact one");
            Assert.That(fixture, Is.Empty, "THE FIXTURE STOPPED DISCRIMINATING: " + string.Join(" · ", fixture));

            ozawa.Powered = false;

            // ⚠️ THE TICKS **EXECUTED**, NOT THE COUNTER AFTERWARDS. `Simulation.Tick` increments
            // `_tick` at the END, so a drive that ran ticks …8 and …9 leaves `TickCount` reading
            // …0 — which is a power pass that never ran. Asserting on the counter reddened this leg
            // for exactly that wrong reason on its first run; the two executed numbers are the
            // claim, and `ozawa.Powered` below is the fact they exist to explain.
            long t0 = sim.TickCount, t1 = t0 + 1;

            KillEveryone(sim, exec);     // executes tick t0 (…8)
            sim.Tick();                  // executes tick t1 (…9) — the watch

            var problems = new List<string>();
            if (t0 % 10 == 0 || t1 % 10 == 0)
                problems.Add("NON-VACUITY FAILED: the drive executed a power pass (ticks " + t0 + ", " + t1 + ")");
            if (ozawa.Powered)
                problems.Add("NON-VACUITY FAILED: PowerSystem re-powered pod_ozawa before the election read it");
            if (ozawa.IsOperational(sim.Defs) == false)
                problems.Add("NON-VACUITY FAILED: pod_ozawa stopped being operational, so this is the WRECK leg again");
            uint elected = Cryo(sim).EmergencyPodId;
            if (elected != torres.Id)
                problems.Add("elected device " + elected + " (" + NameOfDevice(sim, elected) +
                             "), expected pod_torres (" + torres.Id + ")");
            if (ozawa.Progress > 0f) problems.Add("a DEPOWERED capsule (pod_ozawa) was started");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));
        }

        private static int Manhattan(Device d, Citizen c)
            => System.Math.Abs(d.Pos.X - c.Pos.X) + System.Math.Abs(d.Pos.Y - c.Pos.Y)
               + System.Math.Abs(d.Pos.Z - c.Pos.Z);

        private static string NameOfDevice(Simulation sim, uint id)
            => id != 0 && sim.Devices.TryGet(id, out var d) ? d.Name : "none";

        // ═══════════════════════════════════════ 5. mutation 3 — the architecture leg (OD-10)

        /// <summary>
        /// ⛔⛔ <b>MUTATION 3 — add a bypass parameter to <c>ThawCommand</c>. THE ARCHITECTURE
        /// LEG.</b> <i>"<c>ThawCommand</c> is a player-reachable <c>ISimCommand</c>. Any bypass
        /// inside it — a <c>skipGate</c> flag, a nullable pod argument, an early return before the
        /// term list — is a code path the player can reach, and the first player who finds it uses
        /// it as the normal route."</i>
        ///
        /// <para>⭐ <b>RECORDED AT THE SEAM, NOT SCANNED (trap 4).</b> The claim is behavioural, so
        /// it is DRIVEN: on the very ship where the emergency thaw has just fired — a crewless ship,
        /// the one state where a "helpful" bypass would be most tempting — the player's command is
        /// sent for real and must still be REFUSED by the gate, with the ship byte-identical
        /// afterwards. A text scan for <c>skipGate</c> would pass against a bypass spelled any other
        /// way; this passes only if no path through <c>ThawCommand</c> reaches the cycle.</para>
        ///
        /// <para>The refusal asserted is <c>ThawGate.Evaluate</c>'s own verdict on the same state at
        /// the same tick — the single authority the command consults — so the leg cannot be
        /// satisfied by the command failing for an unrelated reason.</para>
        /// </summary>
        [Test]
        public void ThawCommand_NeverLearnsTheBypassExists()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();
            KillEveryone(sim, exec);
            sim.Tick();

            Assert.That(LiveCrew(sim), Is.Zero, "PRECONDITION: nobody alive — the tempting state");
            Assert.That(Cryo(sim).EmergencyThawFired, Is.True, "PRECONDITION: the exception has fired");

            // A capsule the emergency did NOT elect, so nothing about this is the exception's doing.
            var target = Pod(sim, "pod_lindqvist");
            Assert.That(target.Id, Is.Not.EqualTo(Cryo(sim).EmergencyPodId), "PRECONDITION: a different capsule");
            Assert.That(target.IsOperational(sim.Defs), Is.True,
                "PRECONDITION: term 1 must ACCEPT this capsule, or the refusal below proves nothing");

            var verdict = ThawGate.Evaluate(sim, "term_moss", target.Name);
            float progressBefore = target.Progress;
            bool openBefore = target.IsOpen;
            int crewBefore = LiveCrew(sim);
            int sealsBefore = LooseMatter.Affordable(sim, ItemKind.Seals);

            sim.EnqueueCommand(new ThawCommand("term_moss", target.Name));
            sim.Tick();

            var problems = new List<string>();
            if (verdict.Allowed)
                problems.Add("the GATE allowed a thaw on a crewless ship — the terms no longer presume a crew");
            if (verdict.Reason != ThawRefusal.NoConsole)
                problems.Add("the gate refused with " + verdict.Reason + ", not the console term — the " +
                             "refusal this leg records at the seam is term 2's");
            if (target.Progress != progressBefore)
                problems.Add("the refused command started a cycle anyway (" + progressBefore + " → " + target.Progress + ")");
            if (target.IsOpen != openBefore) problems.Add("the refused command opened the capsule");
            if (LiveCrew(sim) != crewBefore) problems.Add("the refused command woke somebody");
            if (LooseMatter.Affordable(sim, ItemKind.Seals) != sealsBefore)
                problems.Add("the refused command spent matter");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));
        }

        // ════════════════════════════════════════════════ 6. mutation 6 — the ending leg

        /// <summary>
        /// ⛔ <b>MUTATION 6 — no intact pod remains and nothing happens.</b> A real lose state fires
        /// at the one moment OD-10 calls honest: the player has spent every soul aboard. All three
        /// halves of the claim are asserted — the sim-side bit, the Chronicle line, and the web
        /// host's one-line banner.
        ///
        /// <para>⛔ <b>AND NO ENDING SCREEN.</b> M5-1 owns THE ENDING (OD-M item 4 = A); the whole
        /// claim here is one bit, one line and one banner.</para>
        /// </summary>
        [Test]
        public void WithNoIntactPodLeft_TheRunEndsOnScreen()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();

            // Wreck the whole bay — the state a player reaches by spending every soul aboard.
            foreach (var pod in sim.Devices.Items.Where(d => d.Kind == DeviceKind.CryoPod))
                pod.Condition = 0.02f;
            Assert.That(sim.Devices.Items.Any(d => d.Kind == DeviceKind.CryoPod && !d.IsOpen
                                                   && d.IsOperational(sim.Defs)), Is.False,
                "PRECONDITION: no intact capsule may remain");
            Assert.That(WireFormat.EndingBanner(sim), Is.Empty,
                "PRECONDITION: the banner is silent while somebody is alive");

            KillEveryone(sim, exec);
            sim.Tick();

            var problems = new List<string>();
            if (!Cryo(sim).RunEnded) problems.Add("CryoSystem.RunEnded is false — M5-1 has no lose state to read");
            if (!Chronicle(sim).Contains("Every soul aboard is dead, and no intact pod remains. The run is over."))
                problems.Add("no ending line; Chronicle = [" + string.Join(" | ", Chronicle(sim)) + "]");
            if (!History(sim).Entries.Any(e => e.Kind == (byte)HistoryKind.RunEnded))
                problems.Add("the ending line is not a HistoryKind.RunEnded entry");
            if (WireFormat.EndingBanner(sim) != "EVERY SOUL ABOARD IS DEAD — THE RUN IS OVER.")
                problems.Add("the banner reads '" + WireFormat.EndingBanner(sim) + "'");
            if (!WireFormat.RunIsOver(sim)) problems.Add("the wire's `over` flag is false on an ended run");
            if (!WireFormat.Ending(WireFormat.EndingBanner(sim), WireFormat.RunIsOver(sim)).Contains("\"over\":true"))
                problems.Add("the `ending` payload does not carry over:true");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));

            // It is said ONCE, not ten times a second forever after.
            for (int t = 0; t < 600; t++) sim.Tick();
            Assert.That(History(sim).Entries.Count(e => e.Kind == (byte)HistoryKind.RunEnded), Is.EqualTo(1),
                "the ending was announced more than once — the latch is not doing its job");
        }

        /// <summary>
        /// The OTHER ending arm, worded differently on purpose: the reprieve was spent on a capsule
        /// that WORKED, and the ship still holds intact ones it can no longer reach (nobody is alive
        /// to ask). "No intact pod remains" would be a lie here, and a Chronicle that lies about why
        /// the run ended is worse than one that says nothing.
        /// </summary>
        [Test]
        public void TheEndingLine_SaysWhyItReallyEnded()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();
            KillEveryone(sim, exec);
            for (int t = 0; t < 3200 && LiveCrew(sim) == 0; t++) sim.Tick();
            Assert.That(LiveCrew(sim), Is.EqualTo(1), "PRECONDITION: the reprieve must have been spent successfully");

            KillEveryone(sim, exec);
            sim.Tick();

            Assert.That(sim.Devices.Items.Any(d => d.Kind == DeviceKind.CryoPod && !d.IsOpen
                                                   && d.Powered && d.IsOperational(sim.Defs)), Is.True,
                "PRECONDITION: intact capsules must still be aboard, or both arms would say the same thing");
            Assert.That(Chronicle(sim),
                Does.Contain("Every soul aboard is dead, and the ship's one reprieve is already spent. The run is over."),
                "Chronicle = [" + string.Join(" | ", Chronicle(sim)) + "]");
        }

        /// <summary>
        /// ⭐ THE GRACE BANNER — the only thing on the STANDARD surface between the death and the
        /// capsule opening four sim-minutes later (the Chronicle lives on the MOSS console). The
        /// charter's own reason: <i>if the grace is silent the player believes the game ended and
        /// quits</i>.
        ///
        /// <para>⚠️ It must NOT read as the ending: <c>over</c> is false and the sentence is the
        /// other one. A banner that said the run was over during the grace would be worse than no
        /// banner at all.</para>
        /// </summary>
        [Test]
        public void DuringTheGrace_TheBannerNamesTheSleeperAndDoesNotSayTheRunIsOver()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();
            Assert.That(WireFormat.EndingBanner(sim), Is.Empty, "PRECONDITION: silent on an ordinary run");

            KillEveryone(sim, exec);
            sim.Tick();

            var problems = new List<string>();
            if (WireFormat.EndingBanner(sim) != "ALL HANDS DOWN — THE SHIP IS WAKING OZAWA.")
                problems.Add("the grace banner reads '" + WireFormat.EndingBanner(sim) + "'");
            if (WireFormat.RunIsOver(sim)) problems.Add("`over` is true during the grace — the player is told they lost");
            if (!WireFormat.Ending(WireFormat.EndingBanner(sim), WireFormat.RunIsOver(sim)).Contains("\"over\":false"))
                problems.Add("the `ending` payload does not carry over:false during the grace");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));

            // …and it clears itself when the sleeper is on the floor.
            for (int t = 0; t < 3200 && LiveCrew(sim) == 0; t++) sim.Tick();
            Assert.That(WireFormat.EndingBanner(sim), Is.Empty,
                "the banner is still up after the sleeper woke — it would sit there for the rest of the run");
        }

        // ═══════════════════════════════════════════ 7. mutation 5 — save / load

        /// <summary>
        /// ⛔ <b>MUTATION 5 — save/load across the fired flag.</b> Two saves, because the emergency
        /// has two states worth losing: MID-GRACE (latch set, a capsule elected, a dead name waiting
        /// to be said) and RUN OVER.
        ///
        /// <para>⭐ <b>THE MID-GRACE LEG IS THE ONE THAT MATTERS AND IT IS DRIVEN TO COMPLETION.</b>
        /// A round trip that only compared hashes would be satisfied by a build that dropped
        /// <c>_emergencyDeadName</c> entirely — the name is deliberately hash-EXEMPT (the HIST
        /// convention). So the restored ship is RUN ON until its capsule opens, and its Chronicle
        /// must carry the identical sentence, naming the identical dead.</para>
        /// </summary>
        [Test]
        public void TheEmergencyRecord_RoundTrips()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();
            KillEveryone(sim, exec);
            for (int t = 0; t < 30; t++) sim.Tick();       // mid-grace: elected, counting down

            Assert.That(Cryo(sim).EmergencyPodId, Is.Not.Zero, "PRECONDITION: a capsule must be elected");
            Assert.That(Cryo(sim).RunEnded, Is.False, "PRECONDITION: mid-grace, not ended");

            var blob = new MemoryStream();
            SaveWriter.WritePayload(sim, blob);
            var loaded = SaveReader.ReadPayload(new MemoryStream(blob.ToArray()), PlainStack());

            var problems = new List<string>();
            if (!Cryo(loaded).EmergencyThawFired) problems.Add("the latch did not survive the save");
            if (Cryo(loaded).EmergencyPodId != Cryo(sim).EmergencyPodId)
                problems.Add("the elected capsule did not survive (" + Cryo(loaded).EmergencyPodId +
                             " vs " + Cryo(sim).EmergencyPodId + ")");
            if (Cryo(loaded).RunEnded) problems.Add("the restored ship believes the run is over");
            if (loaded.StateHash() != sim.StateHash()) problems.Add("the restored ship hashes differently");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));

            // Run BOTH on, and the sentence must be the same one — this is what pins the dead name.
            //
            // ⚠️ THE CONTROLLED CONFOUND IS NOT OPTIONAL, and it is M3-2's, measured again here: a
            // load forces a room recompute and `RemapGas`'s pre-existing non-idempotence drifts room
            // gas at ULP scale (`SaveRestoreRunOnTests`). BOTH twins must get the SAME recompute or
            // this comparison measures that old drift instead of the emergency record. Measured
            // first with only `loaded` marked — it diverged, and nothing about it was cryo.
            loaded.Rooms.MarkDirty();
            sim.Rooms.MarkDirty();
            for (int t = 0; t < 3200; t++) { sim.Tick(); loaded.Tick(); }

            Assert.That(Chronicle(loaded), Does.Contain("With Rell dead, the ship woke Ozawa."),
                "the restored ship forgot who died; Chronicle = [" + string.Join(" | ", Chronicle(loaded)) + "]");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "a restored mid-grace ship diverged from its uninterrupted twin");
        }

        /// <summary>The other half of mutation 5, its own <c>[Test]</c> (fifth trap shape): a run
        /// that ENDED stays ended across a save. A lose state that resets on load is not a lose
        /// state.</summary>
        [Test]
        public void AnEndedRun_StaysEndedAcrossASave()
        {
            var sim = BootWreck(out var exec);
            FreezeTheCrew(sim);
            for (int t = 0; t < 20; t++) sim.Tick();
            foreach (var pod in sim.Devices.Items.Where(d => d.Kind == DeviceKind.CryoPod))
                pod.Condition = 0.02f;
            KillEveryone(sim, exec);
            sim.Tick();
            Assert.That(Cryo(sim).RunEnded, Is.True, "PRECONDITION: the run must have ended");

            var blob = new MemoryStream();
            SaveWriter.WritePayload(sim, blob);
            var loaded = SaveReader.ReadPayload(new MemoryStream(blob.ToArray()), PlainStack());

            Assert.That(Cryo(loaded).RunEnded, Is.True, "the lose state reset on load");
            Assert.That(WireFormat.RunIsOver(loaded), Is.True, "the restored ship's banner would say nothing");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "the restored ship hashes differently");
        }

        // ══════════════════════════════════════════════════════ 8. the contracts M3-5 owes

        /// <summary>
        /// ⛔ <b>THE PIN-NEUTRALITY CLAIM, LOCALLY.</b> M3-5 moved <c>CryoSystem</c> to 10 Hz and
        /// added two structural members to its fold, and P1/P2/P3 must not move for either. This is
        /// the fold half: <b>a ship that never lost its crew must hash exactly what M3-2 hashed</b>,
        /// which is why the three members are packed into ONE state word rather than folded as three
        /// steps (<c>XxHash64.Combine</c> is not idempotent on zero — a second <c>Combine(h, 0)</c>
        /// changes <c>h</c>).
        ///
        /// <para>The literal is M3-2's value, measured on this tree.</para>
        /// </summary>
        [Test]
        public void AShipThatNeverLostItsCrew_HashesExactlyWhatM32Hashed()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), PlainStack());
            Assert.That(Cryo(sim).StateChecksum().ToString("x16", System.Globalization.CultureInfo.InvariantCulture),
                Is.EqualTo("c25ab65f198b0144"),
                "the CRYO fold moved on a ship whose crew is alive — P1, P2 and P3 move with it");

            for (int t = 0; t < 200; t++) sim.Tick();
            Assert.That(Cryo(sim).StateChecksum().ToString("x16", System.Globalization.CultureInfo.InvariantCulture),
                Is.EqualTo("c25ab65f198b0144"), "…and it must still be that value after the ship has run");
        }

        /// <summary>
        /// The other half of the fold contract: each of M3-5's two structural members really does
        /// reach <c>Simulation.StateHash</c>. Driven ONE MEMBER AT A TIME — a packed word that
        /// dropped a member would still move the hash for the other one, and a single combined
        /// assertion could not tell the difference.
        ///
        /// <para>⚠️ COLLECT-THEN-ASSERT (fifth trap): both members are measured before anything is
        /// asserted.</para>
        /// </summary>
        [Test]
        public void BothNewMembers_ReachTheStateHash()
        {
            // `_runEnded`, isolated: the same ship, the bit set by hand, nothing else touched.
            var a = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), PlainStack());
            ulong beforeRunEnded = a.StateHash();
            Cryo(a).MarkRunEndedForTest();
            ulong afterRunEnded = a.StateHash();

            // `_emergencyPodId`, isolated: two ships whose ONLY difference is that one elected a
            // capsule. Both have the latch set, so the latch cannot be what moved the hash.
            var elected = BootWreck(out var exec);
            FreezeTheCrew(elected);
            for (int t = 0; t < 20; t++) elected.Tick();
            KillEveryone(elected, exec);
            elected.Tick();
            var latchOnly = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), PlainStack());
            Cryo(latchOnly).MarkEmergencyThawFired();

            var problems = new List<string>();
            if (afterRunEnded == beforeRunEnded)
                problems.Add("_runEnded does not reach Simulation.StateHash — the lose state is unhashed");
            if (Cryo(elected).EmergencyPodId == 0)
                problems.Add("NON-VACUITY FAILED: no capsule was elected, so the pod-id leg proves nothing");
            if (Cryo(elected).StateChecksum() == Cryo(latchOnly).StateChecksum())
                problems.Add("_emergencyPodId does not reach the CRYO fold — WHICH capsule is unhashed");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));
        }

        /// <summary>
        /// ⛔ <b>THE CADENCE CONTRACT.</b> M3-5 changed <see cref="CryoSystem.IntervalTicks"/> from
        /// 10 to 1 so the emergency watch can read a death event, and the countdown MUST be
        /// untouched by that — otherwise every capsule in the game would thaw ten times faster,
        /// every <c>ThawGate</c> "minutes left" number would be wrong, and M3-4's badge would count
        /// down in the wrong units.
        ///
        /// <para>Driven as an EXACT increment per exact tick window, not as "roughly right": ten
        /// ticks advance a capsule by exactly one pass, and the nine ticks in between advance it by
        /// nothing at all.</para>
        /// </summary>
        [Test]
        public void TheCountdownStillAdvancesOncePerSimSecond()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), PlainStack());
            var pod = Pod(sim, "pod_ozawa");
            Assert.That(pod.IsOperational(sim.Defs), Is.True, "PRECONDITION: the capsule must be able to cycle");

            const float onePass = 1f / CryoSystem.ThawSecondsPerCycle;

            // Land on a pass boundary first, so the window below is a clean ten ticks.
            while (sim.TickCount % 10 != 0) sim.Tick();
            pod.Progress = 0.5f;

            for (int t = 0; t < 9; t++) sim.Tick();
            float afterNine = pod.Progress;

            sim.Tick();
            float afterTen = pod.Progress;

            var problems = new List<string>();
            if (System.Math.Abs(afterNine - (0.5f + onePass)) > 1e-6f)
                problems.Add("nine ticks advanced the capsule by " + (afterNine - 0.5f) +
                             ", expected exactly one pass (" + onePass + ")");
            if (System.Math.Abs(afterTen - (0.5f + onePass)) > 1e-6f)
                problems.Add("the tenth tick advanced it again — the countdown is running at 10 Hz");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));

            // …and the whole cycle still takes 240 sim-seconds end to end. Re-align to a pass
            // boundary first: the window is counted in ticks, so a start half-way between passes
            // would measure the phase rather than the cycle.
            while (sim.TickCount % 10 != 0) sim.Tick();
            pod.Progress = onePass;
            long start = sim.TickCount;
            for (int t = 0; t < 4000 && !pod.IsOpen; t++) sim.Tick();
            Assert.That(pod.IsOpen, Is.True, "the capsule never opened");
            // 2391 ticks = 239.1 sim-seconds, and the extra pass over the nominal 239 is FLOAT, not
            // cadence: 240 additions of `1f/240f` land at 0.99999994, one hair under the `< 1f`
            // test, so one more pass runs. That is M3-2's arithmetic unchanged — the number to
            // watch is the ORDER OF MAGNITUDE, since a 10 Hz countdown would finish in ~239 ticks.
            Assert.That(sim.TickCount - start, Is.EqualTo(2391),
                "a four-minute cycle no longer takes four sim-minutes");
        }

        /// <summary>
        /// ⭐ <b>THE AGREEMENT CONTRACT.</b> The emergency restates term 1 rather than calling
        /// <see cref="ThawGate"/> (OD-10: the two must share none of the gate), so the restatement
        /// has to be pinned against the real thing or it drifts silently.
        ///
        /// <para>DRIVEN, one capsule at a time, by ISOLATION: every OTHER capsule is opened so the
        /// candidate under test is the only thing the emergency could possibly elect. The emergency
        /// must elect it exactly when <see cref="ThawGate.Evaluate"/> gets past term 1 on it — and
        /// term 1 is identified by its own three refusals, not by "the gate said yes" (the gate also
        /// refuses for the console, the rung and the headroom, none of which the emergency honours).</para>
        /// </summary>
        [Test]
        public void TheEmergencysNotionOfIntact_IsThawGatesTerm1()
        {
            var term1Refusals = new[] { ThawRefusal.NoSuchPod, ThawRefusal.PodAlreadyOpen, ThawRefusal.PodNoSignal };
            var names = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), PlainStack())
                .Devices.Items.Where(d => d.Kind == DeviceKind.CryoPod).Select(d => d.Name).ToList();
            Assert.That(names.Count, Is.EqualTo(12), "PRECONDITION: the wreck authors twelve capsules");

            var problems = new List<string>();
            int accepted = 0, refused = 0;
            foreach (var name in names)
            {
                var sim = BootWreck(out var exec);
                FreezeTheCrew(sim);
                for (int t = 0; t < 20; t++) sim.Tick();

                var candidate = Pod(sim, name);
                foreach (var other in sim.Devices.Items.Where(d => d.Kind == DeviceKind.CryoPod && d.Name != name))
                    other.IsOpen = true;   // isolation: nothing else can be elected

                bool term1Accepts = !term1Refusals.Contains(ThawGate.Evaluate(sim, "term_moss", name).Reason);
                KillEveryone(sim, exec);
                sim.Tick();
                bool elected = Cryo(sim).EmergencyPodId == candidate.Id;

                if (term1Accepts) accepted++; else refused++;
                if (term1Accepts != elected)
                    problems.Add(name + ": term 1 " + (term1Accepts ? "accepts" : "refuses") +
                                 " but the emergency " + (elected ? "elected" : "skipped") + " it");
            }

            // NON-VACUITY BY INCLUSION: the sweep must have seen both answers, or an agreement that
            // is always "no" would look identical to one that is always right.
            if (accepted == 0) problems.Add("NON-VACUITY FAILED: term 1 accepted no capsule at all");
            if (refused == 0) problems.Add("NON-VACUITY FAILED: term 1 refused no capsule at all");
            Assert.That(problems, Is.Empty, string.Join(" · ", problems));
        }
    }
}
