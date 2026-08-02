using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-8 — THE SLEEPERS ARE PEOPLE.</b> Today a thawed citizen arrives with no mind
    /// attached at all and level 0 at everything; after this package each of the wreck's seven
    /// sleepers is a written person before you open her pod, and she is that person the second she
    /// steps out.
    ///
    /// <para><b>THE PACKAGE IS TWO HALVES AND THE SPLIT IS THE DESIGN</b>, so this file is split
    /// the same way:</para>
    /// <list type="number">
    ///   <item><b>THE SIM HALF</b> — six authored skill levels and at least one <c>WorkIncapable</c>
    ///     bit, written into the citizen by <c>CryoSystem.Open</c>. Hashed sim state, present with
    ///     no host, no persona layer and no LLM anywhere near the process.</item>
    ///   <item><b>THE HOST HALF</b> — the prose that explains those numbers, attached by
    ///     <c>GameSession</c> OBSERVING <see cref="CitizenThawedEvent"/>. Enrichment: delete it and
    ///     the same woman still steps out and still works at the same rates.</item>
    /// </list>
    ///
    /// <para><b>THE MUTATION TABLE (charter M3-8 + this lane's two additions), each physically
    /// applied, watched go RED for the right reason, and reverted from an in-memory copy — never
    /// <c>git checkout</c> (trap 2). The per-test doc comments name which row they answer.</b></para>
    ///
    /// <para>⚠️ <b>EVERY EXPECTED NUMBER BELOW IS A HAND-WRITTEN LITERAL</b>, never read back off
    /// <see cref="SleeperAptitudes"/>. A test that asks the table what the table says is the
    /// implementation re-deriving itself, and it cannot see a table zeroed, transposed or
    /// re-ordered — which is exactly the mutation the skill leg exists to catch.</para>
    /// </summary>
    public class SleeperPersonaTests
    {
        // ══════════════════════════════════════════════════════════════════════════ fixtures

        private static ISimSystem[] Stack()
            => SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        /// <summary>The shipping ship on the PURE sim stack: no <c>MemorySystem</c>, no
        /// <see cref="MindState"/>, no <see cref="FactRegistry"/> — nothing that could hold a
        /// persona. The offline fixture.</summary>
        private static Simulation BootWreckBare()
            => ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());

        private static List<Device> Pods(Simulation sim)
            => sim.Devices.Items.Where(d => d.Kind == DeviceKind.CryoPod).OrderBy(d => d.Id).ToList();

        /// <summary>The capsule whose occupant is <paramref name="who"/>. Fails loudly rather than
        /// returning null: a renamed capsule must break the test that names it, not skip it.</summary>
        private static Device PodOf(Simulation sim, string who)
        {
            var pod = Pods(sim).FirstOrDefault(p => CryoSystem.SleeperName(p.Name) == who);
            Assert.IsNotNull(pod, "no capsule aboard for '" + who + "'; occupants present: " +
                string.Join(", ", Pods(sim).Select(p => CryoSystem.SleeperName(p.Name))));
            return pod;
        }

        /// <summary>
        /// Drive ONE named capsule all the way open and return the person who stepped out.
        ///
        /// <para>⚠️ <b>THE OTHER CAPSULES ARE HELD SHUT BY THE SYSTEM, NOT BY THIS HELPER.</b>
        /// <c>CryoSystem</c>'s "one at a time" rule elects the lowest device id among pods with
        /// <c>Progress &gt; 0</c>, and only this one has any — so nothing else can open behind our
        /// back and hand us the wrong person. Asserted, not assumed.</para>
        /// </summary>
        private static Citizen ThawOnBareSim(Simulation sim, string who)
        {
            var pod = PodOf(sim, who);
            Assert.That(pod.IsOpen, Is.False, "precondition: " + who + "'s capsule must start SHUT");
            Assert.That(sim.Citizens.Items.Any(c => c.Name == who), Is.False,
                "precondition: " + who + " is not already aboard — the claim would be vacuous");

            pod.Progress = 0.99f;
            for (int t = 0; t < 100 && !pod.IsOpen; t++) sim.Tick();
            Assert.That(pod.IsOpen, Is.True, who + "'s capsule never opened");

            var person = sim.Citizens.Items.FirstOrDefault(c => c.Name == who);
            Assert.IsNotNull(person, "nobody called '" + who + "' aboard after the thaw; names: " +
                string.Join(", ", sim.Citizens.Items.Select(c => c.Name)));
            return person;
        }

        /// <summary>The six levels in <see cref="WorkType"/> order — the same order the
        /// <c>workcaps</c> wire uses, so a transposition shows up in both places.</summary>
        private static int[] Spread(Citizen c)
        {
            var levels = new int[WorkPriority.WorkTypeCount];
            for (int t = 0; t < levels.Length; t++) levels[t] = c.GetSkill((WorkType)t);
            return levels;
        }

        // ═══════════════════════════════════════════ 1. THE SIM HALF — she arrives as somebody

        /// <summary>
        /// ⭐⭐ <b>THE SKILL-TABLE LEG (this lane's mutation 5), DRIVEN THROUGH A REAL THAW.</b>
        /// Lindqvist steps out of her own capsule carrying the exact spread her sheet claims, and
        /// the numbers here are written out by hand.
        ///
        /// <para>⛔ ZERO THE TABLE (every level in <c>SleeperAptitudes.Rows</c> → 0) ⇒ RED. ⛔ DROP
        /// THE <c>SleeperAptitudes.Apply</c> CALL from <c>CryoSystem.Open</c> ⇒ RED. ⛔ TRANSPOSE
        /// TWO ROWS (Lindqvist ↔ Ozawa) ⇒ RED, because the levels are asserted per work type and
        /// not as a multiset.</para>
        ///
        /// <para>NON-VACUITY BY INCLUSION: the fixture's OTHER crew member — Rell, who boots awake
        /// and is deliberately unauthored — is asserted level 0 in the same run. A build in which
        /// nothing writes a skill fails the first clause; a build in which something writes the
        /// SAME thing to everybody fails the second.</para>
        /// </summary>
        [Test]
        public void AThawedSleeper_CarriesHerAuthoredSpread_AndRellDoesNot()
        {
            var sim = BootWreckBare();
            var lindqvist = ThawOnBareSim(sim, "Lindqvist");

            //                                      rep con cra dec min hau
            Assert.That(Spread(lindqvist), Is.EqualTo(new[] { 9, 7, 2, 5, 0, 4 }),
                "Lindqvist's authored spread reached the wrong levels: " +
                string.Join(",", Spread(lindqvist)));

            var rell = sim.Citizens.Items.First(c => c.Name == AuthoredShips.WreckCrewName);
            Assert.That(Spread(rell), Is.EqualTo(new[] { 0, 0, 0, 0, 0, 0 }),
                "Rell is deliberately unauthored (MECHANICS §13.39) — something wrote a skill to " +
                "every citizen rather than to the sleeper it was authored for");
        }

        /// <summary>
        /// ⭐ <b>THE INCAPABLE LEG.</b> Lindqvist's back was broken under a bulkhead brace, so she
        /// cannot work a dig face at all — and that is a fact about the PERSON, distinct from the
        /// player's grid. Split from the skill leg on purpose (fifth trap: <c>Assert</c> throws, so
        /// a second leg inside one body is indistinguishable from a dead one).
        ///
        /// <para>⛔ ZERO THE MASKS in the table ⇒ RED here and GREEN on the skill leg, which is
        /// the whole reason the two are separate methods.</para>
        /// </summary>
        [Test]
        public void AThawedSleeper_CarriesHerAuthoredIncapability()
        {
            var sim = BootWreckBare();
            var lindqvist = ThawOnBareSim(sim, "Lindqvist");

            Assert.That(lindqvist.IsIncapableOf(WorkType.Mine), Is.True,
                "Lindqvist cannot mine — her sheet says so and the mask must too");
            Assert.That(lindqvist.WorkIncapable, Is.EqualTo((byte)(1 << (int)WorkType.Mine)),
                "she is incapable of Mine and NOTHING ELSE; mask was " + lindqvist.WorkIncapable);

            // The veto is live at the dispatcher's five gates, so the fact has behaviour even
            // before any surface draws it. Switching the work ON must not make her capable.
            lindqvist.SetWorkPriority(WorkType.Mine, 1);
            Assert.That(lindqvist.CanTakeWorkType(WorkType.Mine), Is.False,
                "the player switched Mine on and the sim let an incapable crew member take it — " +
                "incapable is a fact about the person, not an order from the player");
            lindqvist.SetWorkPriority(WorkType.Repair, 1);
            Assert.That(lindqvist.CanTakeWorkType(WorkType.Repair), Is.True,
                "she is incapable of Mine only — the mask leaked onto another work type");
        }

        /// <summary>
        /// ⭐⭐ <b>THE ACCEPTANCE, SIM HALF: thaw two different pods, get two different people.</b>
        /// Not "two rows exist" — two rows that DISAGREE, in both columns that describe a person.
        ///
        /// <para>Mbeki against Lindqvist is the deliberate pairing: the miner nobody can replace
        /// against the fitter who cannot mine at all, so the pair also proves the design statement
        /// in <c>SleeperAptitudes</c>' table doc rather than just proving inequality.</para>
        ///
        /// <para>⛔ Give every sleeper the SAME row ⇒ RED. ⛔ Key the table by position rather than
        /// by name (so the second thaw re-reads the first row) ⇒ RED.</para>
        /// </summary>
        [Test]
        public void TwoPods_TwoPeople_WhoDifferInSkillAndInWhatTheyCannotDo()
        {
            var sim = BootWreckBare();
            var lindqvist = ThawOnBareSim(sim, "Lindqvist");
            var mbeki = ThawOnBareSim(sim, "Mbeki");

            Assert.That(lindqvist.Id, Is.Not.EqualTo(mbeki.Id), "precondition: two distinct people");

            //                                  rep con cra dec min hau
            Assert.That(Spread(mbeki), Is.EqualTo(new[] { 0, 6, 0, 8, 13, 9 }),
                "Mbeki's authored spread reached the wrong levels: " + string.Join(",", Spread(mbeki)));
            Assert.That(Spread(mbeki), Is.Not.EqualTo(Spread(lindqvist)),
                "two sleepers woke up with identical competence — the spread is not per-person");

            Assert.That(mbeki.IsIncapableOf(WorkType.Repair), Is.True, "Mbeki cannot repair");
            Assert.That(mbeki.IsIncapableOf(WorkType.Craft), Is.True, "Mbeki cannot craft");
            // ⚠️ NOT "the ship's only miner" — that was this message's first wording and it was FALSE
            // (four of the seven have a non-zero Mine level; SleeperAptitudes' class doc quotes and
            // corrects it). What is true, and what the design leans on, is that she is the STRONGEST
            // by a wide margin: 13 against a next-best of 7.
            Assert.That(mbeki.IsIncapableOf(WorkType.Mine), Is.False,
                "Mbeki is the ship's strongest miner — the one thing she must be able to do");
            Assert.That(mbeki.GetSkill(WorkType.Mine), Is.EqualTo(13),
                "Mbeki's mining margin is the design statement; a level change here is a balance change");
            Assert.That(mbeki.WorkIncapable, Is.Not.EqualTo(lindqvist.WorkIncapable),
                "both sleepers carry the same incapability mask");

            // The design statement, asserted rather than asserted-in-a-comment: the woman who is
            // best at repair (Torres, level 14) cannot feed the chain her own rescue is priced in.
            var torres = ThawOnBareSim(sim, "Torres");
            Assert.That(torres.GetSkill(WorkType.Repair), Is.EqualTo(14), "Torres is the ship's engineer");
            Assert.That(torres.IsIncapableOf(WorkType.Mine), Is.True,
                "Torres cannot mine — waking the strongest crew member must not also solve mining");
        }

        // ═════════════════════════════════════════════════ 2. THE OFFLINE INVARIANT (mutation 1)

        /// <summary>
        /// ⛔⛔ <b>MUTATION 1 — THE OFFLINE LEG, AND IT IS THE INVARIANT RATHER THAN A NICETY.</b>
        /// The whole persona layer is absent from this fixture: the sim runs on
        /// <c>SystemStack.CreateDefault</c>, which registers no <c>MemorySystem</c>, and no
        /// <see cref="MindState"/> or <see cref="FactRegistry"/> object exists in the test at all.
        /// The thaw still happens, the person still exists, and <b>she still has her competence</b>
        /// — because competence is sim state and a mind is not.
        ///
        /// <para>⛔ MOVE <c>SleeperAptitudes.Apply</c> OUT OF <c>CryoSystem</c> INTO THE HOST (the
        /// tempting refactor, since the prose lives there) ⇒ RED here, and green everywhere a host
        /// is present — which is why this test boots the bare stack and says so.</para>
        ///
        /// <para>NON-VACUITY: the absence of the persona layer is ASSERTED (an inclusion test — the
        /// 4th trap shape), not left to the fixture's reputation.</para>
        /// </summary>
        [Test]
        public void AThawWithNoPersonaLayerAnywhere_StillProducesTheWholePerson()
        {
            var sim = BootWreckBare();
            Assert.That(sim.Systems.Any(s => s is MemorySystem), Is.False,
                "precondition: this fixture must have NO memory/mind system — otherwise the " +
                "offline claim is untested");

            int before = sim.Citizens.Items.Count(c => !c.Dead);
            var ozawa = ThawOnBareSim(sim, "Ozawa");

            Assert.That(sim.Citizens.Items.Count(c => !c.Dead), Is.EqualTo(before + 1),
                "the capsule opened but nobody came out");
            Assert.That(ozawa.Dead, Is.False, "the sleeper woke up dead");
            //                                   rep con cra dec min hau
            Assert.That(Spread(ozawa), Is.EqualTo(new[] { 5, 0, 11, 6, 2, 3 }),
                "with no persona layer present the sleeper lost her competence — the sim half " +
                "must owe the host half nothing");
            Assert.That(ozawa.IsIncapableOf(WorkType.Construct), Is.True,
                "Ozawa's structural ticket was pulled; the mask must survive with no host");

            // And the sim keeps running afterwards: a thaw is not a host-shaped hole.
            for (int t = 0; t < 200; t++) sim.Tick();
            Assert.That(ozawa.Dead, Is.False, "the ship stopped being playable after an offline thaw");
        }

        // ══════════════════════════════════════════ 3. THE HOST HALF — the written person

        /// <summary>A web host on the shipping ship, NOT started (no sim thread to race the
        /// asserts) — the <c>WorkCapsChannelTests</c> fixture. The run loop's tick+observe pairing
        /// is driven through <c>GameSession.AdvanceTicks</c>, which is the loop's own body.</summary>
        private static (GameSession gs, SimHost host) BootWeb()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            return (new GameSession(host, sink.Add), host);
        }

        /// <summary>
        /// Drive one named capsule open through the HOST's loop body, so the double-buffered event
        /// bus is read exactly where the shipping game reads it.
        ///
        /// <para>⚠️ <b>IN BATCHES OF FIVE, DELIBERATELY.</b> The shipping loop hands
        /// <see cref="GameSession.AdvanceTicks"/> however many ticks the wall clock owes it — up to
        /// <c>MaxTicksPerFrame</c> — so a harness that only ever asked for ONE tick would be blind
        /// to the exact defect the method exists to prevent: observing the bus after the batch
        /// instead of after each tick, which silently swallows every event but the last. The
        /// ninth trap's shape, pre-empted at the harness rather than discovered by it.</para>
        /// </summary>
        private static Citizen ThawOnWeb(GameSession gs, SimHost host, string who)
        {
            var pod = PodOf(host.Sim, who);
            Assert.That(pod.IsOpen, Is.False, "precondition: " + who + "'s capsule must start SHUT");
            pod.Progress = 0.99f;
            for (int t = 0; t < 40 && !pod.IsOpen; t++) gs.AdvanceTicks(5);
            Assert.That(pod.IsOpen, Is.True, who + "'s capsule never opened");
            var person = host.Sim.Citizens.Items.FirstOrDefault(c => c.Name == who);
            Assert.IsNotNull(person, "nobody called '" + who + "' aboard after the thaw");
            return person;
        }

        private static PersonaSheet PersonaOf(SimHost host, Citizen c)
            => host.Minds.Minds.TryGet(c.Id, out var mind) ? mind.Persona : null;

        /// <summary>
        /// ⭐⭐ <b>THE PLAYER SENTENCE, HOST HALF: she is a written person the second she steps
        /// out.</b> The sheet attached is HERS — asserted on prose only her sheet contains
        /// (⛔ MUTATION 2: attach the wrong roster entry ⇒ RED), and on the role the CREW WATCH row
        /// will print.
        /// </summary>
        [Test]
        public void TheThawedSleeper_GetsHerOwnAuthoredMind()
        {
            var (gs, host) = BootWeb();
            var lindqvist = ThawOnWeb(gs, host, "Lindqvist");

            var sheet = PersonaOf(host, lindqvist);
            Assert.IsNotNull(sheet, "the thawed sleeper has NO mind at all — this is the gap the " +
                                    "package exists to close");
            Assert.That(sheet.Name, Is.EqualTo("Lindqvist"), "the sheet names somebody else");
            Assert.That(sheet.RoleNow, Is.EqualTo("damage control"),
                "the wrong roster entry was attached; role read '" + sheet.RoleNow + "'");
            Assert.That(sheet.RolePreRaid, Is.EqualTo("hull-seam fitter"));

            // The writing IS the deliverable, and it has to EXPLAIN the numbers. Her backstory
            // carries both halves of her row: why she is good at seams, and why she cannot mine.
            Assert.That(sheet.RaidBackstory, Does.Contain("pressure seams"),
                "her sheet does not explain her aptitude");
            Assert.That(sheet.RaidBackstory, Does.Contain("brace"),
                "her sheet does not explain her incapability");
            Assert.That(sheet.Traits.Length, Is.EqualTo(3), "three traits, like every authored sheet");
            Assert.That(sheet.Secrets.Length, Is.EqualTo(1), "every sleeper carries one fact-backed secret");
        }

        /// <summary>
        /// ⛔ <b>MUTATION 3 — THE RUNTIME LEG, first half: at BOOT there is nobody to attach to.</b>
        /// The wreck boots with exactly one citizen (Rell, the survivor; that is the premise), so a
        /// build that attaches the roster at boot attaches NOTHING and this test is the one that
        /// says why: the sleepers do not exist yet.
        ///
        /// <para>Deliberately a separate <c>[Test]</c> from the post-thaw half below — blinding the
        /// legs, so NUnit reports each independently (fifth trap).</para>
        /// </summary>
        [Test]
        public void AtBoot_NoSleeperExistsToAttachAMindTo()
        {
            var (_, host) = BootWeb();

            var living = host.Sim.Citizens.Items.Where(c => !c.Dead).ToList();
            Assert.That(living.Count, Is.EqualTo(1),
                "precondition: the wreck boots with one survivor; saw " +
                string.Join(", ", living.Select(c => c.Name)));
            Assert.That(living[0].Name, Is.EqualTo(AuthoredShips.WreckCrewName));

            foreach (var name in AuthoredShips.WreckSleepers().Select(s => s.Name))
                Assert.That(host.Sim.Citizens.Items.Any(c => c.Name == name), Is.False,
                    "'" + name + "' is aboard at boot — she is supposed to be frozen");
        }

        /// <summary>
        /// ⛔ <b>MUTATION 3 — THE RUNTIME LEG, second half: the attach happens ON THE EVENT.</b>
        /// The mind appears between "no such citizen" and "the capsule opened", which is a moment
        /// no boot-time pass can be at.
        ///
        /// <para>⛔ MOVE THE ATTACH INTO <c>GeneratePersonas</c> (the boot pass) ⇒ RED here.
        /// ⛔ DELETE THE <c>AttachThawedPersonas</c> CALL from <c>AdvanceTicks</c> ⇒ RED here.
        /// ⛔ READ THE BUS AFTER A BATCH OF TICKS instead of after each one (the double-buffer
        /// swallow) ⇒ RED here, because this drive ticks past the publishing tick.</para>
        /// </summary>
        [Test]
        public void TheMindAppearsOnTheThaw_NotBefore()
        {
            var (gs, host) = BootWeb();
            int mindsAtBoot = host.Minds.Minds.Items.Count;

            var bahri = ThawOnWeb(gs, host, "Bahri");
            // Well past the publishing tick: if the observer only worked when a test looked at the
            // bus immediately, this would have lost the event.
            gs.AdvanceTicks(30);

            Assert.That(host.Minds.Minds.Items.Count, Is.EqualTo(mindsAtBoot + 1),
                "no mind was created for the thawed sleeper");
            var sheet = PersonaOf(host, bahri);
            Assert.IsNotNull(sheet, "Bahri stepped out with no mind attached");
            Assert.That(sheet.RoleNow, Is.EqualTo("construction"));
        }

        /// <summary>
        /// ⛔⛔ <b>THE RUN LOOP ITSELF CALLS THE OBSERVER — driven through <c>Start()</c>, on the
        /// real sim thread, and this is the ONLY test that can see that call site.</b>
        ///
        /// <para><b>WHY IT EXISTS: THE REVIEW MUTATION THAT SURVIVED EVERYTHING ELSE.</b> Reverting
        /// <c>GameSession.Run</c>'s <c>AdvanceTicks(due)</c> to a bare <c>for (…) _sim.Tick();</c>
        /// leaves <c>AdvanceTicks</c> and <c>AttachThawedPersonas</c> compiling, tested and
        /// <b>unreachable from the shipping game</b> — every thawed sleeper in the browser arrives
        /// mindless, which is precisely the gap this package closes. It compiled clean and the whole
        /// suite passed, because every other host leg drives <c>AdvanceTicks</c> DIRECTLY. Driving a
        /// method is not the same claim as the loop calling it (trap 4's shape: pin HOW the API is
        /// reached, not merely that it works).</para>
        ///
        /// <para><b>THE DRIVE.</b> <c>Start()</c> spins the shipping thread; the default speed is
        /// <c>_speedIndex = 1</c> (10 tps), so the ship really advances. The capsule's
        /// <c>Progress</c> is set BEFORE the thread exists — nothing here writes sim state
        /// concurrently with the sim thread — and <c>Stop()</c> JOINS before a single assertion is
        /// made, so no claim below is read out from under a running tick.</para>
        ///
        /// <para>NON-VACUITY: the poll's own success is asserted (a timeout fails with the elapsed
        /// wall time rather than passing quietly), and the mind is required to be the AUTHORED one —
        /// a procedural <c>CreateMind</c> for the same citizen would satisfy "has a persona" and is
        /// exactly what a boot-pass regression would produce.</para>
        /// </summary>
        [Test]
        public void TheRunLoopItself_AttachesTheMind_DrivenThroughStart()
        {
            var (gs, host) = BootWeb();
            var pod = PodOf(host.Sim, "Torres");
            Assert.That(pod.IsOpen, Is.False, "precondition: Torres's capsule must start SHUT");
            Assert.That(host.Minds.Minds.Items.Count, Is.EqualTo(1),
                "precondition: only Rell has a mind before the run starts");

            pod.Progress = 0.99f;   // set BEFORE the sim thread exists

            var clock = System.Diagnostics.Stopwatch.StartNew();
            bool arrived = false;
            gs.Start();
            try
            {
                // The shipping loop is doing everything: ticking, cycling the pod, publishing the
                // event, and — the claim — calling the observer.
                while (clock.Elapsed.TotalSeconds < 30.0)
                {
                    if (host.Sim.Citizens.Items.Count >= 2 && host.Minds.Minds.Items.Count >= 2)
                    {
                        arrived = true;
                        break;
                    }
                    System.Threading.Thread.Sleep(25);
                }
            }
            finally
            {
                gs.Stop();   // joins the sim thread: every assertion below runs on a still ship
            }

            Assert.That(arrived, Is.True,
                "the run loop ran for " + clock.Elapsed.TotalSeconds.ToString("F1", CultureInfo.InvariantCulture) +
                "s and no thawed sleeper ever got a mind — the loop is not calling AdvanceTicks, so " +
                "the observer is unreachable from the shipping game (crew " +
                host.Sim.Citizens.Items.Count + ", minds " + host.Minds.Minds.Items.Count + ")");

            var torres = host.Sim.Citizens.Items.FirstOrDefault(c => c.Name == "Torres");
            Assert.IsNotNull(torres, "the capsule opened but nobody called Torres is aboard");
            var sheet = PersonaOf(host, torres);
            Assert.IsNotNull(sheet, "Torres stepped out of her capsule with no mind attached");
            Assert.That(sheet.RoleNow, Is.EqualTo("chief engineer"),
                "the mind attached is not her AUTHORED sheet — a procedural CreateMind would also " +
                "leave a persona here, and that is what a boot-pass regression looks like");
            Assert.That(torres.GetSkill(WorkType.Repair), Is.EqualTo(14),
                "…and her authored competence rode the same thaw");
        }

        /// <summary>
        /// ⭐ <b>ACCEPTANCE, THE SURFACE HALF: CREW WATCH shows two people who read as two
        /// people.</b> The roster is what the Level-1 Overview's crew list is built from, so this
        /// is the closest a test can stand to the browser without being one.
        ///
        /// <para>⚠️ NOT A CLAIM ABOUT THE M4 DOSSIER. <c>panels.js</c> is four-of-eight fabricated
        /// until M4-3 and this package does not touch it.</para>
        ///
        /// <para>⚠️ <b>RELL IS ASSERTED TO STILL READ <c>"general crew"</c> HERE, AND THAT IS THE
        /// POINT.</b> She is not a sleeper, so nothing authored reaches her (MECHANICS §13.39): in
        /// the browser she sits beside two written people wearing the procedural default. Pinning
        /// it means the decision is visible rather than discovered, and whoever authors her later
        /// gets a red test telling them which claim they just changed.</para>
        /// </summary>
        [Test]
        public void TwoThawedSleepers_ReadAsTwoPeopleOnTheRosterChannel()
        {
            var (gs, host) = BootWeb();
            var nakamura = ThawOnWeb(gs, host, "Nakamura");
            var ferreira = ThawOnWeb(gs, host, "Ferreira");

            gs.RenderForTest();
            string roster = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"roster\"", StringComparison.Ordinal));
            Assert.IsNotNull(roster, "the roster channel must be cached for Snapshot catch-up");

            string nakamuraRow = RosterRow(roster, nakamura.Id);
            string ferreiraRow = RosterRow(roster, ferreira.Id);

            Assert.That(nakamuraRow, Does.Contain("\"name\":\"Nakamura\""), "the roster never names the woken sleeper");
            Assert.That(nakamuraRow, Does.Contain("\"role\":\"electronics\""), "Nakamura's role is missing from CREW WATCH");
            Assert.That(nakamuraRow, Does.Contain("haunted"), "Nakamura's authored traits are missing from CREW WATCH");
            Assert.That(ferreiraRow, Does.Contain("\"role\":\"salvage\""), "Ferreira's role is missing from CREW WATCH");
            Assert.That(ferreiraRow, Does.Contain("superstitious"), "Ferreira's authored traits are missing from CREW WATCH");

            // Two people, not one person twice: the two rows disagree on both columns a player reads.
            Assert.That(nakamuraRow, Does.Not.Contain("\"role\":\"salvage\""),
                "both sleepers were given the same role — the roster attached one sheet twice");
            foreach (var row in new[] { nakamuraRow, ferreiraRow })
                Assert.That(row, Does.Not.Contain("\"role\":\"general crew\""),
                    "a thawed sleeper is still wearing the procedural default: " + row);

            // The Rell decision, pinned where a player would see it.
            var rell = host.Sim.Citizens.Items.First(c => c.Name == AuthoredShips.WreckCrewName);
            Assert.That(RosterRow(roster, rell.Id), Does.Contain("\"role\":\"general crew\""),
                "Rell has been authored — that is a design change (MECHANICS §13.39), not a fix");
        }

        /// <summary>One crew member's roster object, sliced out by cid so a per-person claim cannot
        /// be satisfied by somebody else's row (the 4th trap's shape: a scope filter that lets the
        /// violation through).</summary>
        private static string RosterRow(string roster, uint cid)
        {
            foreach (var part in roster.Split('{').Skip(1))
            {
                string row = part.Split('}')[0];
                if (row.Contains("\"cid\":" + cid.ToString(CultureInfo.InvariantCulture) + ",", StringComparison.Ordinal))
                    return row;
            }
            Assert.Fail("no roster row for cid " + cid + " in " + roster);
            return "";
        }

        /// <summary>
        /// ⭐ <b>THE INCAPABLE LEG REACHES THE WIRE (this lane's mutation 6).</b> Her mask and her
        /// six levels arrive on the <c>workcaps</c> channel M3-7 built and M3-12 will draw — so the
        /// player will be able to see that Nakamura cannot work a dig face.
        ///
        /// <para>Positional parse, deliberately: the tuple IS the contract (M3-7's own note), and a
        /// parser that named its fields would not notice a reorder.</para>
        /// </summary>
        [Test]
        public void HerSpreadAndHerMask_ReachTheWorkcapsWire()
        {
            var (gs, host) = BootWeb();
            var nakamura = ThawOnWeb(gs, host, "Nakamura");

            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"workcaps\"", StringComparison.Ordinal));
            Assert.IsNotNull(json, "the workcaps channel must be cached for Snapshot catch-up");

            var row = WorkCapsRowFor(json, nakamura.Id);
            //                              rep con cra dec min hau
            Assert.That(row.Skills, Is.EqualTo(new[] { 10, 2, 13, 0, 0, 3 }),
                "Nakamura's authored spread did not reach the wire: " + string.Join(",", row.Skills));
            int expectedMask = (1 << (int)WorkType.Deconstruct) | (1 << (int)WorkType.Mine);
            Assert.That(row.Mask, Is.EqualTo(expectedMask),
                "her incapability mask did not reach the wire (saw " + row.Mask + ")");
        }

        /// <summary>Parse one crew member's <c>workcaps</c> tuple out of the payload, positionally.
        /// Fails loudly on a width change: the tuple growing or shrinking silently would turn this
        /// into a confident reader of the wrong column.</summary>
        private static (int[] Skills, int Mask) WorkCapsRowFor(string json, uint cid)
        {
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            int width = WireFormat.WorkCapsSkillSlots + 2;
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                var f = part.Split(']')[0].Split(',');
                Assert.AreEqual(width, f.Length, "a workcaps tuple is " + width + " elements");
                if (int.Parse(f[0], CultureInfo.InvariantCulture) != (int)cid) continue;
                var skills = new int[WireFormat.WorkCapsSkillSlots];
                for (int s = 0; s < skills.Length; s++)
                    skills[s] = int.Parse(f[1 + s], CultureInfo.InvariantCulture);
                return (skills, int.Parse(f[width - 1], CultureInfo.InvariantCulture));
            }
            Assert.Fail("no workcaps row for cid " + cid + " — every LIVING crew member gets one");
            return default;
        }

        // ══════════════════════════════════ 4. DETERMINISM — which half is state, and which is not

        /// <summary>
        /// ⛔ <b>MUTATION 4 — THE DETERMINISM LEG.</b> Attaching a persona writes host state and
        /// NOTHING the sim hashes: same <c>StateHash</c> before and after, on a stack where the
        /// mind layer is not registered. The <c>sim</c> argument exists only because
        /// <c>CreateAuthoredMind</c>'s signature takes it.
        ///
        /// <para>⛔ MAKE THE ATTACH WRITE SIM STATE — the two refactors somebody will actually
        /// reach for: move <c>SleeperAptitudes.Apply</c> into <c>AttachSleeperPersona</c>, or seed
        /// the relationship web with <c>SocialSystem.Nudge</c> as <c>PopulateSlice</c> does at boot
        /// ⇒ RED here. Both were applied; both reddened this test on the hash clause.</para>
        ///
        /// <para>⚠️ <b>AND THE CONVERSE IS ASSERTED IN THE SAME RUN</b> (the leg that stops this
        /// from being a test of nothing): <c>SleeperAptitudes.Apply</c> — the SIM half — DOES move
        /// the hash. If neither call moved it, this test would pass on a build where the whole
        /// package is inert.</para>
        /// </summary>
        [Test]
        public void ThePersonaAttach_TouchesNoSimState_ButTheSkillsAre()
        {
            var sim = BootWreckBare();
            var lindqvist = ThawOnBareSim(sim, "Lindqvist");

            var minds = new MindState();
            var facts = new FactRegistry();

            ulong before = sim.StateHash();
            bool attached = AuthoredShips.AttachSleeperPersona(sim, minds, facts, lindqvist);
            Assert.That(attached, Is.True, "precondition: a sheet must actually have been attached");
            Assert.That(minds.Minds.Items.Count, Is.EqualTo(1), "precondition: the attach did something");
            Assert.That(sim.StateHash(), Is.EqualTo(before),
                "attaching a persona moved the sim's StateHash — the mind layer is HOST state and " +
                "a host that writes hashed sim state at runtime breaks determinism");

            // The converse: competence is sim state, and it had better be.
            var rell = sim.Citizens.Items.First(c => c.Name == AuthoredShips.WreckCrewName);
            rell.SetSkill(WorkType.Repair, 3);
            Assert.That(sim.StateHash(), Is.Not.EqualTo(before),
                "a skill level did NOT reach StateHash — then the sim half of this package is not " +
                "sim state at all and this whole test is vacuous");
        }

        // ═══════════════════════════════════════════ 5. THE CENSUS — three lists that must agree

        /// <summary>
        /// ⚠️ <b>THE EIGHTH TRAP'S SHAPE, PRE-EMPTED: three lists, re-derived from the SHIP.</b> The
        /// aptitude table (sim), the persona roster (host) and the wreck's own thawable capsules are
        /// authored in three different places by three different packages' worth of history. The
        /// capsule list is computed from the built ship rather than copied, so a pod renamed, added
        /// or killed in <c>AuthoredShips.WreckPods</c> breaks this immediately.
        ///
        /// <para>⛔ ADD AN EIGHTH SHEET, or DROP ONE, or rename a capsule ⇒ RED.</para>
        /// </summary>
        [Test]
        public void TheAptitudeTable_ThePersonaRoster_AndTheShipsOwnCapsules_AllNameTheSameSeven()
        {
            var sim = BootWreckBare();

            // Derived from the ship: every capsule that can ever cycle, minus the one that boots
            // open. `IsOperational` is what CryoSystem's own eligibility rule reads, so the four
            // wrecked capsules fall out here for the same reason they can never thaw.
            var thawable = Pods(sim)
                .Where(p => !p.IsOpen && p.IsOperational(sim.Defs))
                .Select(p => CryoSystem.SleeperName(p.Name))
                .OrderBy(n => n, StringComparer.Ordinal)
                .ToArray();

            Assert.That(thawable.Length, Is.EqualTo(SleeperAptitudes.Count),
                "the wreck has " + thawable.Length + " thawable capsules but " +
                SleeperAptitudes.Count + " are authored: " + string.Join(", ", thawable));

            var table = SleeperAptitudes.AuthoredNames().OrderBy(n => n, StringComparer.Ordinal).ToArray();
            var roster = AuthoredShips.WreckSleepers().Select(s => s.Name)
                                      .OrderBy(n => n, StringComparer.Ordinal).ToArray();

            Assert.That(table, Is.EqualTo(thawable),
                "the aptitude table and the ship disagree about who is aboard");
            Assert.That(roster, Is.EqualTo(thawable),
                "the persona roster and the ship disagree about who is aboard");

            // Rell is on none of the three: she boots awake, so nothing on the thaw path reaches her.
            Assert.That(thawable, Does.Not.Contain(AuthoredShips.WreckCrewName));
        }

        /// <summary>
        /// ⚠️ <b>THE DEAD FOUR GET NOTHING</b> (OD-9). Their capsules are below the CryoPod fail
        /// floor, so they can never cycle and no authored row could ever be reached — a sheet for
        /// one of them would be prose the game cannot show and a number the game cannot use.
        /// </summary>
        [Test]
        public void TheFourWreckedCapsules_HaveNoAuthoredSheetAndNoAuthoredRow()
        {
            var sim = BootWreckBare();
            var dead = Pods(sim).Where(p => !p.IsOperational(sim.Defs))
                                .Select(p => CryoSystem.SleeperName(p.Name)).ToArray();
            Assert.That(dead.Length, Is.EqualTo(4),
                "precondition: the wreck has four dead sleepers; saw " + string.Join(", ", dead));

            var roster = AuthoredShips.WreckSleepers().Select(s => s.Name).ToArray();
            foreach (var who in dead)
            {
                Assert.That(SleeperAptitudes.TryGet(who, out _), Is.False,
                    "'" + who + "' is dead in her capsule and must have no aptitude row");
                Assert.That(roster, Does.Not.Contain(who),
                    "'" + who + "' is dead in her capsule and must have no persona sheet");
            }
        }

        /// <summary>
        /// ⚠️ <b>EVERY AUTHORED ROW IS INTERNALLY CONSISTENT</b> — the guard that stops the table
        /// from being edited into two contradictory facts about one woman.
        ///
        /// <list type="bullet">
        ///   <item>every sleeper has AT LEAST ONE incapability (the charter's requirement — a person
        ///     with nothing she cannot do gives M3-12's absent-cell rendering nothing to draw);</item>
        ///   <item>an incapable work type is authored at level 0, always;</item>
        ///   <item>no sleeper is incapable of EVERYTHING (a citizen who can do nothing is a bug
        ///     wearing content's clothes);</item>
        ///   <item>every sheet carries the prose that has to explain the numbers.</item>
        /// </list>
        /// </summary>
        [Test]
        public void EveryAuthoredRow_IsInternallyConsistent()
        {
            var offenders = new List<string>();
            var sheets = AuthoredShips.WreckSleepers();

            foreach (var name in SleeperAptitudes.AuthoredNames())
            {
                Assert.That(SleeperAptitudes.TryGet(name, out var a), Is.True, name + " has no row");

                int incapable = 0;
                for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                {
                    var type = (WorkType)t;
                    if (!a.IsIncapableOf(type)) continue;
                    incapable++;
                    if (a.LevelOf(type) != 0)
                        offenders.Add(name + " is incapable of " + type + " and yet skilled at it (" +
                                      a.LevelOf(type) + ")");
                }
                if (incapable == 0) offenders.Add(name + " has nothing she cannot do");
                if (incapable == WorkPriority.WorkTypeCount) offenders.Add(name + " cannot do anything at all");

                var sheet = sheets.FirstOrDefault(s => s.Name == name);
                Assert.IsNotNull(sheet, name + " has an aptitude row and no persona sheet");
                if (sheet.RaidBackstory.Length < 200) offenders.Add(name + "'s backstory is a stub");
                if (sheet.Traits.Length != 3) offenders.Add(name + " does not carry three traits");
                if (sheet.Values.Length != 2) offenders.Add(name + " does not carry two values");
                if (sheet.Fears.Length != 2) offenders.Add(name + " does not carry two fears");
                if (sheet.Secrets.Length != 1) offenders.Add(name + " does not carry one secret");
                if (string.IsNullOrEmpty(sheet.RoleNow)) offenders.Add(name + " has no role");
            }

            Assert.That(offenders, Is.Empty, string.Join("\n", offenders));
        }

        // ═══════════════════════════════════════ 6. THE PIN PREMISE, MECHANISED

        /// <summary>
        /// ⛔⛔ <b>WHY THIS PACKAGE IS PIN-NEUTRAL, AS AN ASSERTION RATHER THAN AS A PARAGRAPH.</b>
        /// Everything the sim half writes is reachable only through a thaw, a thaw needs a
        /// <c>CryoPod</c>, and <b>the wreck is the only ship in the repo that has one</b> — so no
        /// pinned fixture can reach the table however long it runs.
        ///
        /// <para>P1 is <c>hosts/scenario</c>'s own ship, P2 is <c>Perilune()</c>, P3 is
        /// <c>PeriluneSlice()</c>; the first is not reachable from this assembly and was measured by
        /// inspection (no <c>CryoPod</c> anywhere under <c>hosts/scenario</c>) plus the gate itself,
        /// the other two are asserted here. <c>PeriluneGrid()</c> is included because it is the
        /// economy fixture other measurements are taken against.</para>
        ///
        /// <para>⚠️ THIS IS AN INCLUSION TEST: the wreck's own count is asserted too, so a build
        /// where NO ship has capsules — which would make the "no pinned fixture thaws" claim true
        /// and meaningless — fails here.</para>
        /// </summary>
        [Test]
        public void NoShipButTheWreck_HasACapsuleToThawFrom()
        {
            Assert.That(CapsuleCount(AuthoredShips.PeriluneWreck()), Is.EqualTo(12),
                "the wreck's twelve capsules are the ship this package is about");
            Assert.That(CapsuleCount(AuthoredShips.Perilune()), Is.EqualTo(0),
                "the P2 golden's ship grew a capsule — the pin-neutrality premise is dead");
            Assert.That(CapsuleCount(AuthoredShips.PeriluneSlice()), Is.EqualTo(0),
                "the P3 golden's ship grew a capsule — the pin-neutrality premise is dead");
            Assert.That(CapsuleCount(AuthoredShips.PeriluneGrid()), Is.EqualTo(0),
                "the economy fixture grew a capsule");
        }

        private static int CapsuleCount(ShipPlan plan)
            => plan.Devices.Count(d => d.Kind == DeviceKind.CryoPod);
    }
}
