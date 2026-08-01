using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-4 — THE POD BAY.</b> Today the player cannot see who is aboard or what stands
    /// between them and the next person; after this MOSS shows twelve capsules, four <i>NO SIGNAL</i>,
    /// one open, seven named — <b>and every closed row states why it will not cycle.</b>
    ///
    /// <para><b>THE MUTATION TABLE (charter M3-4), each physically applied, watched go RED for the
    /// right reason and reverted from an in-memory copy — never <c>git checkout</c> (trap 2). The
    /// rows this file answers:</b></para>
    /// <list type="number">
    /// <item>render from a client-side guess ⇒ <c>moss-screen.test.js</c> (the seam records the
    ///       MESSAGE, trap 4) — the host half is <see cref="ThePodBayReachesThePlayerAsTwelveRows"/>,
    ///       which is what there would be nothing to render FROM.</item>
    /// <item>show a wrecked pod as thawable ⇒ <see cref="AWreckedCapsuleIsNeverOfferedAsThawable"/></item>
    /// <item>blank the reason column ⇒ <see cref="EverySealedRowCarriesAReason_AndTheNumberThatMadeIt"/></item>
    /// <item>offer <c>[THAW]</c> on a row the gate refuses ⇒
    ///       <see cref="EveryRowsThawBitIsTheGatesOwnVerdict"/></item>
    /// <item>register the key handler in the capture phase ⇒ <c>moss-screen.test.js</c> (a DOM fact)</item>
    /// <item>put the pod list in <c>hud.js</c> ⇒ <c>surface-boundary.test.js</c> (a source fact)</item>
    /// </list>
    /// </summary>
    public class WebPodBayTests
    {
        private const string Console = "term_moss";
        private const string ConsoleTid = "@console";
        private const string Rung1Pod = "pod_lindqvist";   // 0.94 ⇒ 1 Seals, the cheapest rung
        private const string DeadPod = "pod_vance";        // 0.04 — the raid killed the sleeper
        private const string OpenPod = "pod_rell";         // the one capsule that boots open

        /// <summary>A paused session on the SHIPPING ship (<c>./play.sh</c>'s default) — no sim
        /// thread, so every tick below is one a test asked for.</summary>
        private static GameSession WreckSession(out SimHost host, out List<string> sent)
        {
            host = SimHost.Build(AuthoredShips.WreckSeed, ship: ShipChoice.Wreck);
            var captured = new List<string>();
            sent = captured;
            return new GameSession(host, captured.Add);
        }

        private static Device Dev(Simulation sim, string name)
            => sim.Devices.Items.FirstOrDefault(d => d.Name == name);

        /// <summary>
        /// Put the ship in OD-N's MIDDLE state: the console RUNS (it would open a door) and is still
        /// not commissioned. This is the state M3-15 created and the one the player spends the whole
        /// opening in, so it is the fixture most of this file is measured against.
        /// </summary>
        private static void RepairConsole(Simulation sim)
        {
            var term = Dev(sim, Console);
            Assert.That(term, Is.Not.Null, "the wreck must carry " + Console);
            Assert.That(MossGate.IsServerLive(sim), Is.False,
                "PRECONDITION: the wreck boots DARK (term_moss at 0.14, below Terminal maint 0.20). "
                + "If this is ever false the ship-gate legs below measure nothing.");
            term.Condition = 0.60f;
            Assert.That(MossGate.IsServerLive(sim), Is.True, "the fixture must actually light MOSS");
            Assert.That(term.Scriptable, Is.False,
                "PRECONDITION: and it is still UN-commissioned — that is the whole middle state");
        }

        /// <summary>...and the third state: a module is fitted. Exactly what
        /// <c>CommissionDeviceCommand</c> does, written directly so a fixture failure can never be
        /// mistaken for a bay failure.</summary>
        private static void CommissionConsole(Simulation sim)
        {
            RepairConsole(sim);
            Dev(sim, Console).Scriptable = true;
        }

        private static string PodsReply(List<string> sent)
            => sent.Find(m => m.Contains("\"ev\":\"pods\"", StringComparison.Ordinal));

        /// <summary>Every stream-2 (error) sentence the session put on the console transcript.</summary>
        private static List<string> Refusals(List<string> sent)
        {
            var outp = new List<string>();
            foreach (var m in sent)
            {
                if (!m.Contains("\"ev\":\"exec\"", StringComparison.Ordinal)) continue;
                int i = m.IndexOf("[2,\"", StringComparison.Ordinal);
                if (i < 0) continue;
                int start = i + 4;
                int end = m.IndexOf('"', start);
                if (end > start) outp.Add(m.Substring(start, end - start));
            }
            return outp;
        }

        private static void SendPods(GameSession gs, string tid = ConsoleTid)
            => gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "pods", tid: tid));

        // ══════════════════════════════════════════════════ 1. the player sentence

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME TEST — twelve capsules reach the player, and the census is the ship's.</b>
        /// Four <i>NO SIGNAL</i>, one <i>OPEN</i>, seven <i>SEALED</i>: the charter's own numbers,
        /// re-derived here from <c>WreckPods</c> rather than copied, so a re-authored bay fails
        /// loudly instead of quietly disagreeing with a charter nobody re-reads.
        /// </summary>
        [Test]
        public void ThePodBayReachesThePlayerAsTwelveRows()
        {
            var gs = WreckSession(out var host, out var sent);
            CommissionConsole(host.Sim);
            SendPods(gs);

            string json = PodsReply(sent);
            Assert.That(json, Is.Not.Null,
                "a commissioned console answered no POD BAY at all: " + string.Join(" | ", sent));

            int podsAboard = host.Sim.Devices.Items.Count(d => d.Kind == DeviceKind.CryoPod);
            Assert.That(podsAboard, Is.EqualTo(12), "PRECONDITION: the wreck authors twelve capsules");

            var rows = WireFormat.BuildPods(host.Sim, Console);
            Assert.That(rows.Count, Is.EqualTo(podsAboard), "one row per capsule aboard, no more");
            Assert.That(rows.Count(r => r.State == WireFormat.PodStateOpen), Is.EqualTo(1),
                "one capsule boots OPEN — the pawn the player starts with");
            Assert.That(rows.Count(r => r.State == WireFormat.PodStateNoSignal), Is.EqualTo(4),
                "four sleepers did not survive the raid (OD-9)");
            Assert.That(rows.Count(r => r.State == WireFormat.PodStateSealed), Is.EqualTo(7),
                "seven named people are still asleep — the whole rest of the game");

            // …and the WIRE carries them, not just the builder. A row count taken off the JSON, so
            // a handler that computed a census and emitted an empty message cannot pass this.
            Assert.That(CountOf(json, "\"pod_"), Is.EqualTo(12),
                "the reply itself must carry twelve capsule keys: " + json);
            Assert.That(json, Does.Contain("\"moss\":\"COMMISSIONED\""),
                "the header must say WHICH of OD-N's three MOSS states the terminal is in");
        }

        /// <summary>
        /// ⭐ <b>MUTATION 3 — THE REASON COLUMN IS THE FEATURE.</b> Every SEALED row carries a
        /// non-empty sentence, and where the gate produced a number the sentence carries it. A row
        /// that says SEALED with a blank reason is the package failing, not the package minus polish.
        ///
        /// <para><b>ONE ASSERTION OVER MANY LEGS</b> (fifth trap shape): a per-row <c>Assert</c>
        /// would throw on the first bad row and leave the other eleven unexercised.</para>
        /// </summary>
        [Test]
        public void EverySealedRowCarriesAReason_AndTheNumberThatMadeIt()
        {
            var gs = WreckSession(out var host, out _);
            CommissionConsole(host.Sim);
            var rows = WireFormat.BuildPods(host.Sim, Console);

            var problems = new List<string>();
            int sealedRows = 0, numbered = 0;
            foreach (var r in rows)
            {
                if (r.State != WireFormat.PodStateSealed) continue;
                sealedRows++;
                if (string.IsNullOrWhiteSpace(r.Reason)) { problems.Add(r.Pod + ": BLANK reason"); continue; }
                // The gate's own numbered reasons: a rung (`NEEDS 2 SEALS — SHIP HAS 0`), a headroom
                // term, or an allowed row's price (`READY — 1 SEALS`). All of them carry a digit.
                bool hasDigit = r.Reason.Any(char.IsDigit);
                if (hasDigit) numbered++;
                else problems.Add(r.Pod + ": reason has no number — '" + r.Reason + "'");
            }

            Assert.That(sealedRows, Is.EqualTo(7),
                "PRECONDITION: seven sealed rows were examined — with none, every clause below is vacuous");
            Assert.That(problems, Is.Empty,
                "a sealed capsule reached the player with nothing to act on. "
                + string.Join(" | ", problems));
            Assert.That(numbered, Is.EqualTo(sealedRows),
                "OD-L: the reason IS the hint, and a hint without its number is half a hint");
        }

        /// <summary>
        /// ⭐ <b>MUTATION 2 — A WRECKED CAPSULE IS NEVER OFFERED.</b> OD-9: below the CryoPod
        /// <c>fail</c> floor the sleeper did not survive, and that is permanent.
        ///
        /// <para>⭐ <b>WITH ITS INCLUSION HALF.</b> "Nothing is thawable" would pass the first clause
        /// for the wrong reason (a broken fixture, a dark console, a typo), so the same ship must
        /// also offer at least one capsule that CAN cycle — the wreck boots with 10 loose Seals, so
        /// rung 1 is affordable the moment the console is commissioned.</para>
        /// </summary>
        [Test]
        public void AWreckedCapsuleIsNeverOfferedAsThawable()
        {
            var gs = WreckSession(out var host, out _);
            CommissionConsole(host.Sim);
            var rows = WireFormat.BuildPods(host.Sim, Console);

            var offered = rows.Where(r => r.State == WireFormat.PodStateNoSignal && r.Can)
                              .Select(r => r.Pod).ToList();
            Assert.That(offered, Is.Empty,
                "a dead sleeper was offered as thawable — OD-9 says the capsule is INELIGIBLE, not slow");
            Assert.That(rows.Single(r => r.Pod == OpenPod).Can, Is.False,
                "an already-open capsule is single-use and done forever (§13.27)");

            Assert.That(rows.Count(r => r.Can), Is.GreaterThan(0),
                "INCLUSION: nothing at all was thawable, so the clause above proves nothing about "
                + "wrecked capsules specifically");
            Assert.That(rows.Single(r => r.Pod == Rung1Pod).Can, Is.True,
                "rung 1 costs 1 Seals and the wreck boots with ten of them lying loose");
        }

        /// <summary>
        /// ⭐⭐ <b>MUTATION 4 — THE AFFORDANCE AND THE COMMAND SHARE ONE RULE (RW §2.2, §8.4 rung 3).</b>
        /// Every row's <c>Can</c> bit must be <see cref="ThawGate.Evaluate"/>'s own verdict for that
        /// capsule, and every row's sentence must be <see cref="ThawGate.DescribeRow"/>'s for it.
        ///
        /// <para><b>PINNED BY AGREEMENT, NOT BY CALL</b> — the <c>ThawGate</c>/<c>ShipLedger</c>
        /// precedent. The expectation is computed here, independently, from the gate; a host that
        /// re-derived thawability from the STATE word (the obvious shortcut: "SEALED ⇒ offer it")
        /// disagrees on every sealed row the ship cannot pay for, which on the shipping ship is six
        /// of seven.</para>
        /// </summary>
        [Test]
        public void EveryRowsThawBitIsTheGatesOwnVerdict()
        {
            var gs = WreckSession(out var host, out _);
            CommissionConsole(host.Sim);
            var rows = WireFormat.BuildPods(host.Sim, Console);

            var problems = new List<string>();
            int compared = 0, disagreeIfDerivedFromState = 0;
            foreach (var r in rows)
            {
                var v = ThawGate.Evaluate(host.Sim, Console, r.Pod);
                compared++;
                if (r.Can != v.Allowed)
                    problems.Add(r.Pod + ": row says can=" + r.Can + ", the gate says " + v.Allowed);
                if (r.Why != (int)v.Reason)
                    problems.Add(r.Pod + ": row says why=" + r.Why + ", the gate says " + (int)v.Reason);
                if (r.Reason != ThawGate.DescribeRow(v))
                    problems.Add(r.Pod + ": row says '" + r.Reason + "', the gate says '"
                                 + ThawGate.DescribeRow(v) + "'");
                if ((r.State == WireFormat.PodStateSealed) != v.Allowed) disagreeIfDerivedFromState++;
            }

            Assert.That(compared, Is.EqualTo(12), "PRECONDITION: twelve capsules were compared");
            Assert.That(problems, Is.Empty,
                "the surface and the sim disagree about a capsule. " + string.Join(" | ", problems));
            // MEASURED, not guessed: the wreck boots with 10 Seals and 1 Parts, so rungs 1/2/3
            // (Lindqvist, Ozawa, Ferreira) are affordable and rungs 4–7 (Mbeki, Bahri, Nakamura,
            // Torres) are not ⇒ FOUR sealed rows where "SEALED" and "thawable" disagree.
            Assert.That(disagreeIfDerivedFromState, Is.GreaterThanOrEqualTo(4),
                "NON-VACUITY: the cheap re-derivation this test exists to forbid (thawable == SEALED) "
                + "must be WRONG on this ship, or the agreement above is satisfiable by accident");
        }

        /// <summary>
        /// ⭐ <b>THE CYCLING BADGE NAMES THE CAPSULE THAT IS RUNNING — and the others say the bay is
        /// busy.</b> Term 3 refuses EVERY capsule while one cycles, so a bay that read the refusal
        /// alone would print CYCLING twelve times; the verdict's own <c>PodId</c> is what tells the
        /// two apart.
        ///
        /// <para>⭐ <b>AND THE MINUTES ARE THE GATE'S, NOT A SECOND SUM</b> (M3-3's filed item): the
        /// row's sentence is <c>ThawGate.Describe</c>'s, so the badge cannot disagree with the gate
        /// about how long is left. Pinned by comparing the row against the gate's sentence for the
        /// same instant, which is the only way two derivations could differ.</para>
        /// </summary>
        [Test]
        public void OneCapsuleReadsCYCLING_AndTheRestReadTheBayIsBusy()
        {
            var gs = WreckSession(out var host, out _);
            CommissionConsole(host.Sim);
            Dev(host.Sim, Rung1Pod).Progress = 0.5f;

            var rows = WireFormat.BuildPods(host.Sim, Console);
            var cycling = rows.Where(r => r.State == WireFormat.PodStateCycling).ToList();
            Assert.That(cycling.Select(r => r.Pod), Is.EqualTo(new[] { Rung1Pod }),
                "exactly the capsule that is running reads CYCLING");
            Assert.That(cycling[0].Reason, Does.Contain("min"),
                "and it carries the countdown the charter's mock shows");
            Assert.That(cycling[0].Reason,
                Is.EqualTo(ThawGate.Describe(ThawGate.Evaluate(host.Sim, Console, Rung1Pod))),
                "the badge is the GATE's sentence — a second countdown computed anywhere else is "
                + "free to disagree with it, and MinutesLeft(0) already reads 4 min where the truth "
                + "after Execute is 239 s");

            var busy = rows.Where(r => r.Why == (int)ThawRefusal.PodCycling
                                       && r.State == WireFormat.PodStateSealed).ToList();
            Assert.That(busy.Count, Is.GreaterThan(0),
                "the other sealed capsules must say the bay is busy, not go blank");
            Assert.That(busy.All(r => !r.Can), Is.True, "and none of them may be offered");
        }

        // ══════════════════════════════════════════════ 2. the three MOSS states, in words

        /// <summary>
        /// ⭐⭐ <b>WORST-FIRST: THE SHIP GATE, THEN THE TARGET</b> — M3-15's own ordering rule,
        /// discharging the item that package filed against this one.
        ///
        /// <para>On the DARK shipping ship a POD BAY request must answer <i>MOSS IS OFFLINE</i>,
        /// never a commissioning sentence and never a bay: a player told to fit a ControllerModule
        /// is sent across the pressure frontier to a machine shop, for a terminal whose only problem
        /// is that nobody has serviced it.</para>
        /// </summary>
        [Test]
        public void OnADarkShipTheBayAnswersOFFLINE_NotCommissioning()
        {
            var gs = WreckSession(out var host, out var sent);
            Assert.That(MossGate.IsServerLive(host.Sim), Is.False,
                "PRECONDITION: the shipping wreck boots with no live MOSS server");

            SendPods(gs);

            Assert.That(PodsReply(sent), Is.Null, "a dark ship must not publish a pod census");
            var said = Refusals(sent);
            Assert.That(said, Is.Not.Empty, "…and it must not refuse in SILENCE either");
            Assert.That(said.Any(s => s.Contains("MOSS IS OFFLINE", StringComparison.Ordinal)), Is.True,
                "the ship gate's own sentence: " + string.Join(" | ", said));
            Assert.That(said.Any(s => s.Contains("CONTROLLER MODULE", StringComparison.Ordinal)), Is.False,
                "…and NOT the commissioning one, which would send the player to the wrong machine");
        }

        /// <summary>
        /// ⭐ The same rule for M3-3's <c>thaw</c> op, which asked NO ship question until this
        /// package: on a dark ship it answered target-side sentences (<c>NO SUCH POD</c>) from a
        /// computer that is off.
        /// </summary>
        [Test]
        public void OnADarkShipTheThawOpAnswersOFFLINE_NotAPodSentence()
        {
            var gs = WreckSession(out var host, out var sent);
            Assert.That(MossGate.IsServerLive(host.Sim), Is.False, "PRECONDITION: the ship boots dark");

            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "thaw", tid: Console, text: "pod_nobody"));

            var said = Refusals(sent);
            Assert.That(said.Any(s => s.Contains("MOSS IS OFFLINE", StringComparison.Ordinal)), Is.True,
                "ship before target: " + string.Join(" | ", said));
            Assert.That(sent.Any(m => m.Contains("NO SUCH POD", StringComparison.Ordinal)), Is.False,
                "a dark computer must not have an opinion about which capsules exist");
        }

        /// <summary>
        /// ⭐⭐ <b>OD-N's THIRD STATE, REFUSED IN WORDS.</b> The console runs — it would open a door
        /// this second — and the bay still says no. The refusal must NAME COMMISSIONING and the
        /// module, and there must be NO empty POD BAY beside it: a screen that says nothing is
        /// indistinguishable from a broken verb (the binding memory that has cost three owner
        /// reports).
        /// </summary>
        [Test]
        public void ARepairedButUnCommissionedConsoleRefusesTheBay_NamingCommissioning()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);

            SendPods(gs);

            Assert.That(PodsReply(sent), Is.Null,
                "an EMPTY POD BAY is the failure mode the OD-N amendment names by hand");
            var said = Refusals(sent);
            Assert.That(said.Any(s => s.Contains("NOT COMMISSIONED", StringComparison.Ordinal)
                                      && s.Contains("CONTROLLER MODULE", StringComparison.Ordinal)),
                Is.True, "the middle state must say what to MAKE next: " + string.Join(" | ", said));
            Assert.That(said.Any(s => s.Contains("MOSS IS OFFLINE", StringComparison.Ordinal)), Is.False,
                "…and must not read as the DARK sentence — a player who cannot tell the two apart "
                + "repairs a terminal that is already fine");

            // The INCLUSION half: the same ship, one module later, answers with the bay.
            sent.Clear();
            Dev(host.Sim, Console).Scriptable = true;
            SendPods(gs);
            Assert.That(PodsReply(sent), Is.Not.Null,
                "commissioning did not open the bay — the refusal above was not the commissioning term");
        }

        // ══════════════════════════════════════════════ 3. which console is it speaking through?

        /// <summary>
        /// ⭐ <b>THE PROMPT'S PSEUDO-TID RESOLVES TO A REAL TERMINAL, IN THE SIM.</b> The MOSS
        /// command line addresses <c>@console</c>, which has no device behind it — so without
        /// <see cref="ThawGate.CommissionedConsoleName"/> the bay's term 2 would refuse on every
        /// ship forever, and a client picking a terminal would be guessing at <c>Device.Scriptable</c>,
        /// which has never reached the wire.
        ///
        /// <para>The resolved name travels on the reply, and the round trip is what this test drives:
        /// the client sends it back with a thaw and the capsule cycles.</para>
        /// </summary>
        [Test]
        public void TheBayResolvesTheRealConsole_AndAThawAddressedToItIsAccepted()
        {
            var gs = WreckSession(out var host, out var sent);
            CommissionConsole(host.Sim);

            SendPods(gs, ConsoleTid);
            string json = PodsReply(sent);
            Assert.That(json, Is.Not.Null, "the @console pseudo-tid must still get a bay");
            Assert.That(json, Does.Contain("\"term\":\"" + Console + "\""),
                "the reply must name the console the sim resolved, so the client never guesses: " + json);

            // …and that name is one a thaw is actually accepted through.
            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "thaw", tid: Console, text: Rung1Pod));
            host.Sim.Tick();
            Assert.That(Dev(host.Sim, Rung1Pod).Progress, Is.GreaterThan(0f),
                "the capsule the bay said was READY did not cycle when asked through the console the "
                + "bay named — the round trip the screen depends on is broken");
        }

        /// <summary>
        /// The resolver is DEFINED as "the lowest-Id terminal <see cref="ThawGate.IsCommissionedConsole"/>
        /// accepts", so it can never be a second commissioned-console rule. Driven both ways: nothing
        /// on the shipping ship, the console once it is fitted.
        /// </summary>
        [Test]
        public void TheConsoleResolverAsksTheSamePredicate()
        {
            var sim = SimHost.Build(AuthoredShips.WreckSeed, ship: ShipChoice.Wreck).Sim;
            Assert.That(ThawGate.CommissionedConsoleName(sim), Is.Null,
                "the shipping wreck has no commissioned console — that is the opening objective");

            CommissionConsole(sim);
            string name = ThawGate.CommissionedConsoleName(sim);
            Assert.That(name, Is.EqualTo(Console));
            Assert.That(ThawGate.IsCommissionedConsole(sim, name), Is.True,
                "the resolver returned a name its own predicate rejects — that is two rules, not one");

            // Every OTHER terminal aboard must be one the predicate refuses, or "lowest Id" is
            // deciding something the predicate should have.
            foreach (var d in sim.Devices.Items.Where(d => d.Kind == DeviceKind.Terminal && d.Name != name))
                Assert.That(ThawGate.IsCommissionedConsole(sim, d.Name), Is.False,
                    d.Name + " is also commissioned — this test's uniqueness claim is stale");
        }

        // ══════════════════════════════════════════════ 4. the headroom label (M3-3's filed item)

        /// <summary>
        /// ⚠️ <b>THE FOOD NUMBER SAYS WHICH FOOD NUMBER IT IS.</b> <c>ThawHeadroom.FoodUnits</c>
        /// counts carried and reserved stacks (it must equal the ledger's, to the bit) while a rung's
        /// <c>SHIP HAS n</c> reads loose stock only. Both appear on this one screen, so the line that
        /// carries the first must say so — the smallest honest fix, and the sim's accounting is not
        /// touched.
        /// </summary>
        [Test]
        public void TheHeadroomNoteSaysWhichFoodNumberItIs()
        {
            var host = SimHost.Build(AuthoredShips.WreckSeed, ship: ShipChoice.Wreck);
            string note = WireFormat.PodsHeadroomNote(host.Sim);

            var h = ThawGate.Headroom(host.Sim);
            Assert.That(note, Does.Contain(h.FoodUnits.ToString(CultureInfo.InvariantCulture)),
                "the note must carry the number it is labelling: " + note);
            Assert.That(note, Does.Contain("CARRIED AND RESERVED INCLUDED"),
                "…and say what that number counts: " + note);
            Assert.That(note, Does.Contain("LOOSE"),
                "…in the words that distinguish it from a rung's SHIP HAS: " + note);

            // ⭐ NON-VACUITY, DRIVEN. At boot the two counts AGREE (60 == 60, measured), so the
            // label would be documenting a distinction nobody can observe. Reserve one stack —
            // exactly what a crew member hauling a meal does — and they part company, which is the
            // moment the unlabelled screen would have shown a player two food numbers and no way
            // to tell which was which.
            Assert.That(LooseMatter.Affordable(host.Sim, ItemKind.Potato), Is.EqualTo(h.FoodUnits),
                "PRECONDITION: at boot the two counts agree, so the drive below is what separates them");
            var stack = host.Sim.Items.Items.First(i => i.Kind == ItemKind.Potato);
            stack.ReservedBy = 1;
            Assert.That(ThawGate.Headroom(host.Sim).FoodUnits, Is.EqualTo(h.FoodUnits),
                "the headroom census counts a reserved stack — it must equal the ledger's number");
            Assert.That(LooseMatter.Affordable(host.Sim, ItemKind.Potato), Is.LessThan(h.FoodUnits),
                "…while a rung's SHIP HAS does not. THAT is the confusion the label prevents");
        }

        // ══════════════════════════════════════════════ 5. serializer shape

        /// <summary>
        /// The wire shape on FIXED data — independent of any ship, so a re-authored bay cannot make
        /// this test quietly assert a different message. InvariantCulture by construction (every
        /// number here is an int).
        /// </summary>
        [Test]
        public void MossPods_Serializes_The_Row_Tuple()
        {
            var rows = new List<WireFormat.PodBayRow>
            {
                new WireFormat.PodBayRow(1, "pod_rell", "Rell", WireFormat.PodStateOpen,
                                         (int)ThawRefusal.PodAlreadyOpen, "POD IS EMPTY — ALREADY THAWED", false),
                new WireFormat.PodBayRow(2, "pod_ozawa", "Ozawa", WireFormat.PodStateSealed,
                                         (int)ThawRefusal.None, "READY — 2 SEALS", true),
            };
            Assert.AreEqual(
                "{\"type\":\"moss\",\"ev\":\"pods\",\"tid\":\"@console\",\"term\":\"term_moss\"," +
                "\"moss\":\"COMMISSIONED\",\"note\":\"N\",\"rows\":[" +
                "[1,\"pod_rell\",\"Rell\",0,\"OPEN\",2,\"POD IS EMPTY — ALREADY THAWED\",0]," +
                "[2,\"pod_ozawa\",\"Ozawa\",1,\"SEALED\",0,\"READY — 2 SEALS\",1]]}",
                WireFormat.MossPods("@console", "term_moss", "COMMISSIONED", "N", rows));
        }

        /// <summary>An unreadable state code prints UNKNOWN and never OPEN — DA-M1's rule, which
        /// matters more for a capsule than for a load bar.</summary>
        [Test]
        public void AnUnknownPodStateCodeIsNeverPrintedAsOPEN()
        {
            Assert.AreEqual("UNKNOWN", WireFormat.PodStateWord(-1));
            Assert.AreEqual("UNKNOWN", WireFormat.PodStateWord(99));
            Assert.AreEqual("OPEN", WireFormat.PodStateWord(WireFormat.PodStateOpen));
        }

        private static int CountOf(string haystack, string needle)
        {
            int n = 0, i = 0;
            while ((i = haystack.IndexOf(needle, i, StringComparison.Ordinal)) >= 0) { n++; i += needle.Length; }
            return n;
        }
    }
}
