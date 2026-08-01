using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-3 — THE THAW IS EARNED.</b> Today the player cannot ask for a thaw; after this they
    /// can, and the ship answers <b>yes</b>, or <b>no with a named reason and a number</b>.
    ///
    /// <para><b>THE SIX TERMS, IN THE ORDER <see cref="ThawGate.Evaluate"/> RESOLVES THEM</b> —
    /// the pod · the console · the cycle · the rung (OD-L) · the headroom · the price. Every one is
    /// resolved from SIM state; the host renders and never decides.</para>
    ///
    /// <para>⛔ <b>ONE TEST PER REFUSAL REASON, AND EVERY ONE IS DRIVEN.</b> The charter's
    /// acceptance. A verdict computed and asserted in isolation would prove the switch statement,
    /// not the ship: each reason below is produced by a real <see cref="ThawCommand"/> on a real
    /// booted ship, and the assertion is what the SHIP did (a capsule's <c>Progress</c>, an item
    /// census) beside the sentence it said.</para>
    ///
    /// <para><b>THE MUTATION TABLE (charter M3-3), each physically applied, watched go RED for the
    /// right reason and reverted from an in-memory copy — never <c>git checkout</c> (trap 2). The
    /// per-test doc comments name which row they answer.</b></para>
    /// <list type="number">
    /// <item><c>ThawCommand.Execute</c> → no-op ⇒ <see cref="AThawStartsTheCycle_AndTheShipPaysForIt"/></item>
    /// <item>charge the price BEFORE the last refusal ⇒ <see cref="ARefusedThaw_LeavesTheShipsMatterByteIdentical"/></item>
    /// <item>skip term 2 ⇒ <see cref="AThawFromAnUnCommissionedConsole_IsRefusedBySimAlone"/></item>
    /// <item>evaluate term 2 host-side ⇒ that test (sim, no host) + <c>WebThawTests</c>'s render leg</item>
    /// <item>accept while another pod cycles ⇒ <see cref="AThawIsRefusedWhileAnotherCapsuleIsCycling"/></item>
    /// <item>ignore the rung ⇒ <see cref="TheRungRefusalNamesTheItemAndTheCount"/> (a) +
    ///       <see cref="TheRungTheGateResolves_ChangesAtEverySixInteriorBandEdge"/> (b)</item>
    /// <item>bare <c>return;</c> on refusal ⇒ <c>WebThawTests.EveryRefusalReachesThePlayerAsASentence</c></item>
    /// <item>call <c>ShipLedger</c> from <c>ThawGate</c> ⇒ the existing
    ///       <c>ArchitectureBoundaryTests.TheLedgerIsNotReachableFromAnyTickPath</c>, re-verified</item>
    /// <item>a ratio-only suite ⇒ <see cref="TheHeadroomReadsInABSOLUTEUnits_NotRatios"/></item>
    /// </list>
    /// </summary>
    public class ThawGateTests
    {
        // ══════════════════════════════════════════════════════════════════════════ fixtures

        private const string Console = "term_moss";

        /// <summary>Rung 1 on the wreck: Lindqvist's capsule at <c>Condition 0.94</c> ⇒ 1 Seals.</summary>
        private const string Rung1Pod = "pod_lindqvist";
        /// <summary>Rung 7: Torres at 0.78 ⇒ 3 ControllerModule, the deepest capsule aboard.</summary>
        private const string Rung7Pod = "pod_torres";
        /// <summary>A capsule the raid killed (0.04, below <c>CryoPod</c>'s <c>fail</c>) — OD-9.</summary>
        private const string DeadPod = "pod_vance";
        /// <summary>The capsule that boots OPEN: the pawn the player starts with.</summary>
        private const string OpenPod = "pod_rell";

        private static ISimSystem[] Stack()
            => SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        /// <summary>The shipping ship (<c>./play.sh</c>'s default). Chosen over a synthetic room on
        /// purpose: on this ship every device the gate reads is genuinely POWERED at boot (measured),
        /// whereas an off-network synthetic device reads <c>Powered == false</c> and would make
        /// every test below pass through term 1 for a reason that has nothing to do with the gate.</summary>
        private static Simulation BootWreck() => ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());

        private static Device Dev(Simulation sim, string name)
            => sim.Devices.Items.FirstOrDefault(d => d.Name == name);

        /// <summary>
        /// Commission the wreck's console — the ONE thing that stands between the shipping ship and
        /// a legal thaw. It is exactly what <c>CommissionDeviceCommand</c> does for one
        /// <c>ControllerModule</c>; done directly here so a fixture failure can never be mistaken
        /// for a thaw failure.
        /// </summary>
        private static void CommissionConsole(Simulation sim)
        {
            var term = Dev(sim, Console);
            Assert.That(term, Is.Not.Null, "the wreck must carry " + Console);
            Assert.That(term.Scriptable, Is.False,
                "PRECONDITION: " + Console + " must boot UN-commissioned — that is the term this "
                + "fixture exists to switch off, and if it were already true the WHERE gate would "
                + "be untested here and everywhere else in this file");
            term.Scriptable = true;
        }

        /// <summary>Every unit of a kind aboard, wherever it lies. The census the billing leg
        /// compares — carried, reserved and loose alike, so a spend cannot hide by moving.</summary>
        private static int Units(Simulation sim, ItemKind kind)
            => sim.Items.Items.Where(i => i.Kind == kind).Sum(i => i.Count);

        /// <summary>Delete every unit of a kind from the ship. Used to make a rung unaffordable.</summary>
        private static void StripKind(Simulation sim, ItemKind kind)
        {
            foreach (var id in sim.Items.Items.Where(i => i.Kind == kind).Select(i => i.Id).ToList())
                sim.Items.Remove(id);
        }

        /// <summary>A full per-kind census, for the byte-identical claim.</summary>
        private static int[] MatterCensus(Simulation sim)
        {
            var census = new int[Enum.GetValues(typeof(ItemKind)).Length];
            foreach (var it in sim.Items.Items) census[(int)it.Kind] += it.Count;
            return census;
        }

        /// <summary>Send the command the way the sim receives one and let it land.</summary>
        private static void SendThaw(Simulation sim, string tid, string pod)
        {
            sim.EnqueueCommand(new ThawCommand(tid, pod));
            sim.Tick();
        }

        // ═════════════════════════════════════════════════════ 1. the player sentence: YES

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME TEST — the player asks, and the capsule starts counting down.</b>
        ///
        /// <para>⛔ MUTATION 1 (<c>ThawCommand.Execute</c> becomes a no-op) ⇒ RED here: the pod's
        /// <c>Progress</c> never leaves zero. ⛔ MUTATION 2's other half (charge nothing) ⇒ RED here
        /// too, on the price leg — an accepted thaw MUST spend the rung's exact count.</para>
        ///
        /// <para>NON-VACUITY, by inclusion: the capsule is asserted SHUT, powered and at
        /// <c>Progress == 0</c> before the send; the console is asserted commissioned; and the rung
        /// the ship is about to pay is read off <see cref="ThawGate.RungOf"/> and asserted
        /// AFFORDABLE first. A run against an already-cycling pod would pass every clause and prove
        /// nothing.</para>
        /// </summary>
        [Test]
        public void AThawStartsTheCycle_AndTheShipPaysForIt()
        {
            var sim = BootWreck();
            CommissionConsole(sim);
            var pod = Dev(sim, Rung1Pod);

            // ── preconditions ────────────────────────────────────────────────────────────────
            Assert.That(pod, Is.Not.Null, "the wreck must carry " + Rung1Pod);
            Assert.That(pod.IsOpen, Is.False, "precondition: the capsule must start SHUT");
            Assert.That(pod.Progress, Is.EqualTo(0f), "precondition: no cycle may already be live");
            Assert.That(pod.Powered && pod.IsOperational(sim.Defs), Is.True,
                "precondition: the capsule must be able to cycle at all");
            var rung = ThawGate.RungOf(pod.Condition);
            int before = Units(sim, rung.Item);
            Assert.That(before, Is.GreaterThanOrEqualTo(rung.Count),
                "precondition: the ship must be able to afford rung " + rung.Rung + " ("
                + rung.Count + " " + rung.Item + "), or this measures a refusal");

            // ── the drive: a real ISimCommand through a real tick ────────────────────────────
            SendThaw(sim, Console, Rung1Pod);

            // ── the claim ────────────────────────────────────────────────────────────────────
            Assert.That(pod.Progress, Is.GreaterThan(0f),
                "the thaw was accepted and the capsule never started counting — a verb that is "
                + "present and INERT is indistinguishable from a broken one");
            Assert.That(Units(sim, rung.Item), Is.EqualTo(before - rung.Count),
                "the ladder's price was not paid: rung " + rung.Rung + " costs " + rung.Count + " "
                + rung.Item + " and the ship went from " + before + " to " + Units(sim, rung.Item));

            // And the sleeper actually arrives — the cycle is not a bar that fills and stops.
            string expected = CryoSystem.SleeperName(pod.Name);
            for (int t = 0; t < 3000 && !pod.IsOpen; t++) sim.Tick();
            Assert.That(pod.IsOpen, Is.True, "the capsule counted down and never opened");
            Assert.That(sim.Citizens.Items.Any(c => !c.Dead && c.Name == expected), Is.True,
                "nobody called '" + expected + "' is aboard after the thaw completed");
        }

        /// <summary>
        /// The accepted verdict is not silent either: it names who is waking and how long it takes,
        /// which is the number M3-4's countdown badge renders.
        /// </summary>
        [Test]
        public void AnAcceptedThaw_SaysWhoIsWakingAndHowLong()
        {
            var sim = BootWreck();
            CommissionConsole(sim);
            var verdict = ThawGate.Evaluate(sim, Console, Rung1Pod);

            Assert.That(verdict.Allowed, Is.True,
                "the armed wreck must accept its rung-1 thaw; it said: " + ThawGate.Describe(verdict));
            Assert.That(ThawGate.Describe(verdict), Is.EqualTo("THAW ACCEPTED — LINDQVIST — 4 min"),
                "the accepted sentence names the sleeper and the cycle length");
        }

        // ═════════════════════════════════════════ 1b. TERM 1 — the pod, conjunct by conjunct

        /// <summary>
        /// ⭐⭐ <b>TERM 1 SPEAKS THREE SENTENCES, AND EACH LEG ISOLATES ONE CONJUNCT.</b>
        ///
        /// <para>⛔ <b>THIS TEST EXISTS BECAUSE ITS ABSENCE WAS MEASURED.</b> Independent review of
        /// the first cut of this package found term 1 completely uncovered: replacing
        /// <c>if (!pod.Powered || !pod.IsOperational(sim.Defs))</c> with a never-true predicate left
        /// <b>83/83 GREEN</b> across every file naming <c>ThawGate</c>, and swapping the
        /// <see cref="ThawRefusal.PodAlreadyOpen"/> ↔ <see cref="ThawRefusal.PodNoSignal"/> labels
        /// left <b>56/56 GREEN</b>. The charter's acceptance is <i>one test per refusal reason</i>
        /// and term 1's three reasons had <b>zero exact-sentence assertions anywhere</b>.</para>
        ///
        /// <para><b>WHY THE OLD COVERAGE COULD NOT BITE — the fourth trap shape, twice.</b> The
        /// reason CODES asserted in <c>WebThawTests</c> are compared against
        /// <see cref="ThawGate.Evaluate"/>'s OWN output, i.e. a code compared to itself; and the two
        /// <c>&gt;= 6</c> non-vacuity floors are POPULATION COUNTS, which prove the loop ran, not
        /// that it ran over the right reasons — under the never-true mutation the dead capsule falls
        /// through to <see cref="ThawRefusal.Rung"/> and SEVEN distinct codes still clear a floor of
        /// six. ⇒ <b>the assertion has to be the SENTENCE, against a literal.</b></para>
        ///
        /// <para>⛔ <b>AND THE DELETION IS RUN-ENDING, not cosmetic.</b> Without the predicate a dead
        /// sleeper's thaw is ACCEPTED and billed 3 <c>ControllerModule</c>; <see cref="CryoSystem"/>
        /// has its own OD-9 guard so it never advances the capsule; the pod then sits at
        /// <c>Progress &gt; 0</c> forever and term 3 refuses every remaining thaw permanently. The
        /// bay locks, having charged the player for it.</para>
        ///
        /// <para><b>EACH LEG ISOLATES ITS CONJUNCT, ASSERTED BEFORE THE DRIVE</b> — the same
        /// discipline as the <c>Scriptable == false</c> precondition on the console leg. Rell's
        /// capsule is open BUT powered and operational; Vance's is shut and powered BUT below
        /// <c>fail</c>; Lindqvist's is shut and operational BUT depowered. A leg that failed for two
        /// reasons at once would not tell you which conjunct the gate still reads.</para>
        ///
        /// <para>⚠️ <b><c>PowerSystem</c> RE-DERIVES <c>Powered</c> AT THE END OF THE SAME TICK</b>,
        /// so the depowered leg's precondition is asserted BEFORE the send and never after — a
        /// post-tick <c>Powered == false</c> assertion would fail on correct code. Measured: the
        /// command drain runs BEFORE the systems, so <see cref="ThawCommand"/> genuinely sees the
        /// depowered capsule, and the flag reads <c>true</c> again one tick later.</para>
        ///
        /// <para><b>WITH AN INCLUSION CONTROL, because three refusals prove nothing on their own.</b>
        /// The identical Lindqvist fixture WITHOUT the depower must be ACCEPTED and must actually
        /// cycle; otherwise every leg here could be green for a reason that has nothing to do with
        /// term 1 (a broken fixture, a mistyped name, a bound headroom term).</para>
        /// </summary>
        [Test]
        public void TermOne_SpeaksItsThreeSentences_AndEachLegIsolatesOneConjunct()
        {
            var problems = new List<string>();
            var sentences = new HashSet<string>(StringComparer.Ordinal);

            // (label, which capsule, how to arrange it, the sentence the ship must say)
            var legs = new (string Label, string Pod, Action<Simulation> Arrange, string Expected)[]
            {
                ("no such capsule", "pod_nobody", _ => { }, "NO SUCH POD"),
                ("already open",     OpenPod,     _ => { }, "POD IS EMPTY — ALREADY THAWED"),
                ("wrecked (OD-9)",   DeadPod,     _ => { }, "POD — NO SIGNAL"),
                ("depowered",        Rung1Pod,    sim => Dev(sim, Rung1Pod).Powered = false,
                                                            "POD — NO SIGNAL"),
            };

            foreach (var leg in legs)
            {
                var sim = BootWreck();
                CommissionConsole(sim);          // term 2 out of the way: this is term 1's test
                leg.Arrange(sim);
                var pod = Dev(sim, leg.Pod);

                // ── the conjunct this leg isolates, asserted BEFORE the drive ────────────────
                if (leg.Pod == "pod_nobody")
                {
                    if (pod != null) problems.Add(leg.Label + ": a capsule called " + leg.Pod + " exists");
                }
                else if (pod == null)
                {
                    problems.Add(leg.Label + ": the wreck carries no " + leg.Pod);
                    continue;
                }
                else
                {
                    bool open = pod.IsOpen, powered = pod.Powered, oper = pod.IsOperational(sim.Defs);
                    string state = "IsOpen=" + open + " Powered=" + powered + " IsOperational=" + oper;
                    if (leg.Label == "already open" && !(open && powered && oper))
                        problems.Add(leg.Label + ": leg does not isolate IsOpen (" + state + ")");
                    if (leg.Label == "wrecked (OD-9)" && !(!open && powered && !oper))
                        problems.Add(leg.Label + ": leg does not isolate IsOperational (" + state + ")");
                    if (leg.Label == "depowered" && !(!open && !powered && oper))
                        problems.Add(leg.Label + ": leg does not isolate Powered (" + state + ")");
                }

                // ── the SENTENCE, against a literal — never against Evaluate's own output ────
                string said = ThawGate.Describe(ThawGate.Evaluate(sim, Console, leg.Pod));
                sentences.Add(said);
                if (!string.Equals(said, leg.Expected, StringComparison.Ordinal))
                    problems.Add(leg.Label + ": the ship said '" + said + "', expected '" + leg.Expected + "'");

                // ── and it is DRIVEN: no cycle, no bill ──────────────────────────────────────
                var before = MatterCensus(sim);
                SendThaw(sim, Console, leg.Pod);
                if (pod != null && pod.Progress > 0f)
                    problems.Add(leg.Label + ": the capsule started cycling anyway (" + pod.Progress + ")");
                var after = MatterCensus(sim);
                for (int k = 0; k < before.Length; k++)
                    if (before[k] != after[k])
                        problems.Add(leg.Label + ": a term-1 refusal BILLED the ship — "
                                     + (ItemKind)k + " " + before[k] + " -> " + after[k]);
            }

            // ── THE INCLUSION CONTROL ────────────────────────────────────────────────────────
            var control = BootWreck();
            CommissionConsole(control);
            var healthy = Dev(control, Rung1Pod);
            string controlSaid = ThawGate.Describe(ThawGate.Evaluate(control, Console, Rung1Pod));
            SendThaw(control, Console, Rung1Pod);
            if (healthy.Progress <= 0f)
                problems.Add("INCLUSION CONTROL: the same capsule, left powered, was ALSO refused ('"
                             + controlSaid + "') — every leg above is green for some other reason");

            // ⛔ THE SUBSTANTIVE CLAIM IS ASSERTED FIRST, AND THE ORDER IS DELIBERATE. `Assert`
            // throws (fifth trap shape), so whichever assertion runs first is the only one a red
            // ever reports. Putting the COUNT first would answer "the ship said 4 different things"
            // when the useful red is "the wrecked capsule said 'NEEDS 3 CONTROLLER MODULE' where it
            // must say 'POD — NO SIGNAL', and the depowered one was accepted, cycled and billed".
            // Measured, not reasoned: with the OD-9 predicate mutated to never fire, this ordering
            // reports all four of those lines and the count-first ordering reported none of them.
            Assert.That(problems, Is.Empty,
                "term 1 — the pod — is the gate's first and most permanent word, and OD-9 says a "
                + "wrecked capsule's sleeper is DEAD. Losing it accepts and BILLS a thaw the cryo "
                + "system will never advance, which locks the bay forever behind term 3.\n  "
                + string.Join("\n  ", problems));
            // NON-VACUITY: three DISTINCT sentences, not three copies of one. A SUPPLEMENT to the
            // literals above and never a substitute — a population count is the fourth trap shape,
            // and it is precisely what let the missing coverage survive review the first time.
            Assert.That(sentences.Count, Is.EqualTo(3),
                "term 1 must speak THREE distinct sentences; it spoke " + sentences.Count + ": "
                + string.Join(" | ", sentences.OrderBy(s => s, StringComparer.Ordinal)));
        }

        // ═══════════════════════════════════════════════ 2. the price is charged LAST (mut. 2)

        /// <summary>
        /// ⭐ <b>THE BILLING LEG — A REFUSED THAW LEAVES THE SHIP'S MATTER BYTE-IDENTICAL.</b>
        ///
        /// <para>⛔ MUTATION 2 (charge the price before the last refusal) ⇒ RED here, on whichever
        /// reason is evaluated after the charge. Every reachable refusal is driven through a real
        /// command and a real tick, and the whole per-kind census is compared — not just the rung's
        /// own kind, because a mis-ordered spend could take any currency.</para>
        ///
        /// <para><b>ONE ASSERTION, MANY LEGS, ON PURPOSE</b> (fifth trap shape: <c>Assert</c>
        /// throws, so a per-leg assertion would report the first failure and leave the rest
        /// permanently unexercised). The legs accumulate into a list and the list is asserted
        /// empty, so a red names EVERY reason that billed.</para>
        /// </summary>
        [Test]
        public void ARefusedThaw_LeavesTheShipsMatterByteIdentical()
        {
            var problems = new List<string>();
            int drivenReasons = 0;

            foreach (var (label, arrange, pod) in RefusalFixtures())
            {
                var sim = BootWreck();
                arrange(sim);
                var verdict = ThawGate.Evaluate(sim, Console, pod);
                if (verdict.Allowed)
                {
                    problems.Add(label + ": the fixture did not actually refuse (" + ThawGate.Describe(verdict) + ")");
                    continue;
                }
                drivenReasons++;

                var before = MatterCensus(sim);
                SendThaw(sim, Console, pod);
                var after = MatterCensus(sim);

                for (int k = 0; k < before.Length; k++)
                    if (before[k] != after[k])
                        problems.Add(label + " [" + ThawGate.Describe(verdict) + "]: the ship was BILLED for a "
                                     + "refusal — " + (ItemKind)k + " " + before[k] + " -> " + after[k]);

                var device = Dev(sim, pod);
                if (device != null && device.Progress > 0f)
                    problems.Add(label + ": a REFUSED thaw started a cycle (" + device.Progress + ")");
            }

            // NON-VACUITY, by inclusion: a loop that refused nothing would pass trivially.
            Assert.That(drivenReasons, Is.GreaterThanOrEqualTo(6),
                "only " + drivenReasons + " refusal reasons were actually driven — the billing claim "
                + "is only as wide as the reasons it was measured over");
            Assert.That(problems, Is.Empty,
                "the price is charged LAST so that a refusal never bills the player. "
                + string.Join(" | ", problems));
        }

        /// <summary>
        /// Every refusal the shipping ship can reach, as (label, how to arrange it, which capsule).
        /// Shared by the billing leg and the host's render leg so the two can never drift apart.
        /// </summary>
        internal static IEnumerable<(string Label, Action<Simulation> Arrange, string Pod)> RefusalFixtures()
        {
            // term 1 — the pod. Three different sentences, because they are three different facts.
            yield return ("NoSuchPod", CommissionConsole, "pod_nobody");
            yield return ("PodAlreadyOpen", CommissionConsole, OpenPod);
            yield return ("PodNoSignal", CommissionConsole, DeadPod);

            // term 2 — the console. NO arrange at all: the shipping ship boots this way.
            yield return ("NoConsole", _ => { }, Rung1Pod);

            // term 3 — the cycle.
            yield return ("PodCycling", sim =>
            {
                CommissionConsole(sim);
                Dev(sim, Rung1Pod).Progress = 0.5f;
            }, "pod_ozawa");

            // term 4 — the rung. Rung 7 costs 3 ControllerModule and the wreck carries none.
            yield return ("Rung", CommissionConsole, Rung7Pod);

            // term 5 — the headroom. Scrubbing is the one term the shipping ship can reach: one
            // working scrubber covers 3, so a fourth soul is what it refuses.
            yield return ("Scrubbing", sim =>
            {
                CommissionConsole(sim);
                AddCrewUntil(sim, 3);
            }, Rung1Pod);

            // Food: strip the larder. Water and O2 need a ship that is already lost and are driven
            // in their own tests below rather than here, where every leg must be reachable.
            yield return ("Food", sim =>
            {
                CommissionConsole(sim);
                StripKind(sim, ItemKind.Potato);
            }, Rung1Pod);
        }

        /// <summary>Wake extra souls the cheap way — the gate counts living citizens, and where they
        /// stand is irrelevant to it. Used to push the CO2 load past a scrubber's step.</summary>
        private static void AddCrewUntil(Simulation sim, int living)
        {
            var anchor = sim.Citizens.Items.First(c => !c.Dead).Pos;
            while (sim.Citizens.Items.Count(c => !c.Dead) < living)
                sim.AddCitizen("Extra" + sim.Citizens.Items.Count.ToString(CultureInfo.InvariantCulture), anchor);
        }

        // ═════════════════════════════════════════ 3. the WHERE gate, sim-side (mut. 3 and 4)

        /// <summary>
        /// ⭐⭐ <b>THE SINGLE-AUTHORITY LEG — THE SIM REFUSES A THAW WITH NO HOST IN THE ROOM.</b>
        ///
        /// <para>⛔ MUTATION 3 (skip term 2) and ⛔ MUTATION 4 (evaluate term 2 host-side in
        /// <c>GameSession</c>) both ⇒ RED here, and mutation 4 is the reason this test exists in
        /// this file rather than beside the host: <b>there is no host here at all.</b> A term that
        /// lived in <c>GameSession</c> would be "not replayed on load, not folded into the hash, and
        /// not present in the TUI" — and the way to record that is to build the sim, send the
        /// command, and read the CAPSULE, not to scan a source file for a spelling (trap 4).</para>
        ///
        /// <para>⚠️ THE FIXTURE ASSERTS <c>Scriptable == false</c> FIRST, by the charter's own
        /// instruction. Without it a green here could mean "the console term works" or "the wreck
        /// quietly started shipping a commissioned terminal", and those are different worlds.</para>
        /// </summary>
        [Test]
        public void AThawFromAnUnCommissionedConsole_IsRefusedBySimAlone()
        {
            var sim = BootWreck();
            var term = Dev(sim, Console);
            var pod = Dev(sim, Rung1Pod);

            // ── the precondition the charter names ───────────────────────────────────────────
            Assert.That(term.Scriptable, Is.False,
                "PRECONDITION: " + Console + " boots UN-commissioned (AuthoredShips.cs:2059, pinned "
                + "by WreckShipTests.TheMossTerminal_BootsUnCommissioned). If this is ever true at "
                + "boot, this test measures nothing.");
            Assert.That(term.Powered && term.IsOperational(sim.Defs), Is.True,
                "PRECONDITION: and it is POWERED and above its fail threshold — so the ONLY thing "
                + "wrong with it is the missing ControllerModule, which is the term under test");

            // ── the drive ────────────────────────────────────────────────────────────────────
            SendThaw(sim, Console, Rung1Pod);
            Assert.That(pod.Progress, Is.EqualTo(0f),
                "the sim accepted a thaw through an UN-commissioned console. The whole WHERE gate — "
                + "the wreck premise's opening objective, 'restore MOSS' — is bypassed.");
            Assert.That(ThawGate.Describe(ThawGate.Evaluate(sim, Console, Rung1Pod)),
                Is.EqualTo("NO CONSOLE — MOSS IS OFFLINE"));

            // ── and the same ship, one ControllerModule later, says yes ──────────────────────
            // The inclusion half: a refusal that never lifts would pass the clause above for the
            // wrong reason (a broken pod, a missing ship, a typo in the name).
            term.Scriptable = true;
            SendThaw(sim, Console, Rung1Pod);
            Assert.That(pod.Progress, Is.GreaterThan(0f),
                "commissioning the console did not open the gate — the refusal above was not the "
                + "console term");
        }

        /// <summary>
        /// The console term is a CONJUNCTION, and each conjunct is driven. Commissioned is not
        /// enough: a dark or wrecked console is still no console.
        /// </summary>
        [Test]
        public void ACommissionedConsole_MustAlsoBePoweredAndAboveItsFailThreshold()
        {
            var problems = new List<string>();
            foreach (var (label, break_) in new (string, Action<Device>)[]
            {
                ("unpowered", d => d.Powered = false),
                ("wrecked",   d => d.Condition = 0f),
                ("uncommissioned", d => d.Scriptable = false),
            })
            {
                var sim = BootWreck();
                CommissionConsole(sim);
                if (!ThawGate.IsCommissionedConsole(sim, Console))
                    problems.Add(label + ": the fixture's console was already refused before it was broken");
                break_(Dev(sim, Console));
                if (ThawGate.IsCommissionedConsole(sim, Console))
                    problems.Add(label + ": a " + label + " console still counts as a MOSS console");
            }
            Assert.That(problems, Is.Empty, string.Join(" | ", problems));
        }

        // ═════════════════════════════════════════════════════ 4. one at a time (mutation 5)

        /// <summary>
        /// ⭐ <b>TERM 3 — the bay does one capsule at a time, and it says which one and how long.</b>
        ///
        /// <para>⛔ MUTATION 5 (accept a thaw while another pod cycles) ⇒ RED here on the driven
        /// leg: the second capsule's <c>Progress</c> would leave zero.</para>
        /// </summary>
        [Test]
        public void AThawIsRefusedWhileAnotherCapsuleIsCycling()
        {
            var sim = BootWreck();
            CommissionConsole(sim);
            var first = Dev(sim, Rung1Pod);
            var second = Dev(sim, "pod_ozawa");

            // Start the first the way a player would.
            SendThaw(sim, Console, Rung1Pod);
            Assert.That(first.Progress, Is.GreaterThan(0f), "precondition: the first capsule must be cycling");
            Assert.That(second.Progress, Is.EqualTo(0f), "precondition: the second must be idle");

            int sealsBefore = Units(sim, ItemKind.Seals);
            SendThaw(sim, Console, "pod_ozawa");

            Assert.That(second.Progress, Is.EqualTo(0f),
                "two capsules cycling at once. The owner's mechanic is 'only one after the other'.");
            Assert.That(Units(sim, ItemKind.Seals), Is.EqualTo(sealsBefore),
                "the refused second thaw still billed the ship");
            Assert.That(ThawGate.Describe(ThawGate.Evaluate(sim, Console, "pod_ozawa")),
                Is.EqualTo("POD LINDQVIST IS CYCLING — 4 min"),
                "the refusal must name the capsule that is busy and how long it has left — 'no' "
                + "alone is a screen the player cannot act on");
        }

        // ═══════════════════════════════════════════════════════ 5. the rung (mutation 6a/6b)

        /// <summary>
        /// ⭐ <b>TERM 4a — THE REASON IS THE HINT.</b> A refusal that names the item AND the count
        /// is the whole of OD-L's design: the player is told what to go and make.
        ///
        /// <para>⛔ MUTATION 6(a) (ignore the rung) ⇒ RED here: the thaw would be accepted with the
        /// required item stripped from the ship.</para>
        /// </summary>
        [Test]
        public void TheRungRefusalNamesTheItemAndTheCount()
        {
            var sim = BootWreck();
            CommissionConsole(sim);
            var pod = Dev(sim, Rung1Pod);
            var rung = ThawGate.RungOf(pod.Condition);

            Assert.That(rung.Item, Is.EqualTo(ItemKind.Seals), "precondition: " + Rung1Pod + " is a rung-1 capsule");
            Assert.That(Units(sim, rung.Item), Is.GreaterThan(0),
                "precondition: the ship starts WITH the item, so the strip below changes something");

            StripKind(sim, rung.Item);
            SendThaw(sim, Console, Rung1Pod);

            Assert.That(pod.Progress, Is.EqualTo(0f),
                "the capsule cycled with none of the " + rung.Item + " its band requires — the "
                + "ladder is the milestone's pacing and it was bypassed");
            Assert.That(ThawGate.Describe(ThawGate.Evaluate(sim, Console, Rung1Pod)),
                Is.EqualTo("NEEDS 1 SEALS — SHIP HAS 0"),
                "the refusal must carry the item AND the count AND what is aboard");

            // The deepest rung says its own, larger number — a single hard-coded sentence would
            // pass the clause above and be a lie for six of the seven capsules.
            Assert.That(ThawGate.Describe(ThawGate.Evaluate(sim, Console, Rung7Pod)),
                Is.EqualTo("NEEDS 3 CONTROLLER MODULE — SHIP HAS 0"));
        }

        /// <summary>
        /// ⭐⭐ <b>MUTATION 6(b) — M3-6's DEFERRED BAND-EDGE SWEEP, ACCEPTED HERE BY NAME.</b>
        /// M3-6 could not run it (<c>ThawGate.Evaluate</c> did not exist at position 3) and its own
        /// header says this package owns it.
        ///
        /// <para><b>ALL SIX INTERIOR EDGES — 0.92 · 0.90 · 0.87 · 0.85 · 0.82 · 0.80.</b> Six, not
        /// four: the count is the point. <b>The edge that is never crossed is the edge nobody
        /// chose</b>, and a sweep that skipped two would leave two boundaries decided by accident.
        /// </para>
        ///
        /// <para><b>AND IT DRIVES <see cref="ThawGate.Evaluate"/>, NOT <see cref="ThawGate.RungOf"/>.</b>
        /// That is the difference between asserting the table (which M3-6 already did) and
        /// asserting the LADDER: what changes at an edge must be the requirement the ship states to
        /// the player. So the ship is stripped of every ladder item first, and the assertion is on
        /// the SENTENCE either side of each edge.</para>
        ///
        /// <para>⛔ MUTATION 6(b): move any band edge in <see cref="ThawGate.RungOf"/> ⇒ RED here,
        /// naming the edge and both sentences.</para>
        /// </summary>
        [Test]
        public void TheRungTheGateResolves_ChangesAtEverySixInteriorBandEdge()
        {
            // The six INTERIOR edges of a seven-band table. (A seven-rung ladder has six of them —
            // revision 2 of the charter said "four", counting rungs rather than edges.)
            float[] edges = { 0.92f, 0.90f, 0.87f, 0.85f, 0.82f, 0.80f };
            const float below = 0.001f;   // one thousandth under, well inside float resolution here

            var sim = BootWreck();
            CommissionConsole(sim);
            // Every ladder item gone, so EVERY band refuses at term 4 and the refusal is the thing
            // that differs. Without this the healthy bands would be ACCEPTED and the sweep would be
            // comparing "yes" with "yes".
            StripKind(sim, ItemKind.Seals);
            StripKind(sim, ItemKind.Parts);
            StripKind(sim, ItemKind.ControllerModule);

            var pod = Dev(sim, Rung1Pod);
            var problems = new List<string>();
            var seen = new List<string>();

            foreach (float edge in edges)
            {
                pod.Condition = edge;
                var on = ThawGate.Evaluate(sim, Console, Rung1Pod);
                string onSaid = ThawGate.Describe(on);

                pod.Condition = edge - below;
                var under = ThawGate.Evaluate(sim, Console, Rung1Pod);
                string underSaid = ThawGate.Describe(under);

                string e = edge.ToString("0.00", CultureInfo.InvariantCulture);
                seen.Add(e + ": '" + onSaid + "' -> '" + underSaid + "'");

                if (on.Reason != ThawRefusal.Rung || under.Reason != ThawRefusal.Rung)
                    problems.Add(e + ": one side did not refuse at the RUNG term (" + on.Reason
                                 + " / " + under.Reason + ") — the sweep measured something else");
                if (on.Rung.Rung == under.Rung.Rung)
                    problems.Add(e + ": the rung did NOT change across the edge (both rung "
                                 + on.Rung.Rung + ") — this edge is decided by nothing");
                if (on.Rung.Rung + 1 != under.Rung.Rung)
                    problems.Add(e + ": crossing DOWN through the edge moved rung " + on.Rung.Rung
                                 + " -> " + under.Rung.Rung + "; a band edge must step exactly one rung");
                if (string.Equals(onSaid, underSaid, StringComparison.Ordinal))
                    problems.Add(e + ": the SENTENCE the ship says is identical either side ('"
                                 + onSaid + "') — the player cannot see the edge at all");
                // ⭐ THE INCLUSIVITY CHOICE, driven rather than argued: a capsule at EXACTLY the
                // edge is on the HIGHER band (the easier requirement). RimWorld's `CapableOf` uses
                // the opposite convention, which is why this is asserted and not assumed.
                if (on.Rung.Rung != Array.IndexOf(edges, edge) + 1)
                    problems.Add(e + ": a capsule sitting EXACTLY on the edge resolved to rung "
                                 + on.Rung.Rung + ", not the higher band it is authored to be on");
            }

            Assert.That(seen.Count, Is.EqualTo(6),
                "the sweep must cross SIX interior edges; it crossed " + seen.Count);
            Assert.That(problems, Is.Empty,
                "the thaw ladder's band edges are not behavioural.\n  swept: "
                + string.Join("\n         ", seen) + "\n  " + string.Join("\n  ", problems));
        }

        // ═══════════════════════════════════════════════════ 6. the headroom (mutation 9)

        /// <summary>
        /// ⭐⭐ <b>MUTATION 9 — THE SEVENTH TRAP SHAPE, ANSWERED IN ABSOLUTE UNITS.</b>
        ///
        /// <para>A suite built from RATIO assertions cannot see a 2× scale error: E0-9's whole gate
        /// went green with <c>DaysOfFood</c> over-stated exactly 2×, because every assertion in it
        /// was a proportion and <c>&gt; 0</c> can never catch a factor. ⇒ <b>at least one
        /// proportional FLOOR, in absolute units</b> — so every number below is a measured literal
        /// on the shipping ship, not a relation between two of the gate's own outputs.</para>
        ///
        /// <para>The per-crew rates are the ones the 2× bug lived in: <c>hunger_per_second</c> fills
        /// the meter in TWO sim-days, not one, so 1.3888… u/crew/day is right and 2.7777… is the
        /// mistake E0-9 shipped. A gate reading the comment instead of the tuning would print half
        /// the runway and refuse thaws the ship could afford.</para>
        /// </summary>
        [Test]
        public void TheHeadroomReadsInABSOLUTEUnits_NotRatios()
        {
            var sim = BootWreck();
            var room = ThawGate.Headroom(sim);

            // ── the census, in units of the thing itself ─────────────────────────────────────
            Assert.That(room.LivingCrew, Is.EqualTo(1), "the wreck boots with exactly one soul awake");
            Assert.That(room.CrewAfterThaw, Is.EqualTo(2), "the gate measures the crew the thaw would CREATE");
            Assert.That(room.FoodUnits, Is.EqualTo(60), "the wreck's larder is 60 units of Potato");
            Assert.That(room.TankLiters, Is.EqualTo(300f), "tank_reserve holds 300 L");
            Assert.That(room.WorkingScrubbers, Is.EqualTo(1),
                "exactly one scrubber aboard is powered and above its fail threshold (scrubber_cryo, 0.55)");
            Assert.That(room.CrewScrubbingCovers, Is.EqualTo(3),
                "0.001 / 2.73e-4 = 3.663 crew per working scrubber, strict surplus ⇒ ONE scrubber covers 3");

            // ── the rates, absolute, each the one a 2× error would hide in ────────────────────
            Assert.That(ThawGate.FoodUnitsPerCrewPerDay(sim.Defs), Is.EqualTo(1.3888888).Within(1e-6),
                "one crew member eats 1.3889 potatoes a sim-day. 2.7778 is the E0-9 mistake "
                + "(reading sustenance.def's COMMENT, which says one meter per day, instead of "
                + "needs.def's tuning, which fills it in two).");
            Assert.That(ThawGate.LitersPerCrewPerDay(sim.Defs), Is.EqualTo(1.0).Within(1e-6),
                "thirst fills in one sim-day, self-serve triggers at 0.5, a drink is 0.5 L "
                + "⇒ 2 drinks × 0.5 L = exactly 1.0 L per crew per sim-day");
            Assert.That(ThawGate.O2MolesPerCrewPerDay(sim.Defs), Is.EqualTo(26.2656).Within(1e-9),
                "3.04e-4 mol/s × 86 400 s");

            // ── and the runways those rates produce, also absolute ───────────────────────────
            Assert.That(room.DaysOfFood, Is.EqualTo(21.6).Within(0.01),
                "60 u ÷ (2 crew × 1.3889 u) = 21.6 sim-days. The ledger reads 43.20 d for ONE crew "
                + "member on the same ship — this gate divides by the crew the thaw would create, "
                + "and 21.6 is exactly half of 43.2, which is what makes both numbers checkable.");
            Assert.That(room.DaysOfWater, Is.EqualTo(150.0).Within(0.01), "300 L ÷ (2 crew × 1.0 L)");
            Assert.That(room.O2CrewDays, Is.EqualTo(85.6).Within(0.1),
                "~86 crew-days of standing oxygen for two — two orders of magnitude above the "
                + "1.0 floor, which is why this term reports and never binds");
        }

        /// <summary>
        /// ⭐ TERM 5 — the step function, driven, and it says how many it covers. One working
        /// scrubber covers three; the fourth soul is what the ship refuses, and repairing a second
        /// scrubber unlocks three thaws at once (a TIER UNLOCK, not a pacer — wreck plan §3.4.1).
        /// </summary>
        [Test]
        public void TheScrubbingTerm_SaysHowManyCrewItCovers_AndASecondScrubberUnlocksATier()
        {
            var sim = BootWreck();
            CommissionConsole(sim);
            AddCrewUntil(sim, 3);   // three awake ⇒ the thaw would make FOUR, and one scrubber covers 3

            var pod = Dev(sim, Rung1Pod);
            var refused = ThawGate.Evaluate(sim, Console, Rung1Pod);
            Assert.That(refused.Reason, Is.EqualTo(ThawRefusal.Scrubbing),
                "with three souls aboard and one scrubber the CO2 term must bind on the fourth; it said: "
                + ThawGate.Describe(refused));
            Assert.That(ThawGate.Describe(refused), Is.EqualTo("SCRUBBING COVERS 3 OF 4"));

            SendThaw(sim, Console, Rung1Pod);
            Assert.That(pod.Progress, Is.EqualTo(0f), "the capsule cycled past a bound scrubbing term");

            // Repair a second scrubber: the step lifts and covers seven, so this thaw AND the two
            // behind it become legal in one gesture.
            Dev(sim, "scrubber_spine").Condition = 1f;
            var room = ThawGate.Headroom(sim);
            Assert.That(room.WorkingScrubbers, Is.EqualTo(2));
            Assert.That(room.CrewScrubbingCovers, Is.EqualTo(7),
                "two scrubbers cover 7.326 crew ⇒ 7 — the step, and it is why the term unlocks a "
                + "tier rather than pacing anything");
            Assert.That(ThawGate.Evaluate(sim, Console, Rung1Pod).Allowed, Is.True,
                "repairing life support did not lift the refusal it caused");
        }

        /// <summary>
        /// The continuous term. Food is the only headroom term that moves smoothly with the crew,
        /// and it names both what it read and what it needed.
        /// </summary>
        [Test]
        public void TheFoodTerm_NamesTheRunwayAndTheFloor()
        {
            var sim = BootWreck();
            CommissionConsole(sim);
            StripKind(sim, ItemKind.Potato);
            sim.AddItem(ItemKind.Potato, 5, Dev(sim, Rung1Pod).Pos + new Int3(0, 1, 0));

            var verdict = ThawGate.Evaluate(sim, Console, Rung1Pod);
            Assert.That(verdict.Reason, Is.EqualTo(ThawRefusal.Food),
                "5 potatoes for two crew is 1.8 sim-days and the floor is 3.0; it said: "
                + ThawGate.Describe(verdict));
            Assert.That(ThawGate.Describe(verdict), Is.EqualTo("FOOD 1.8 DAYS — NEEDS 3.0"),
                "the number the term READ must travel with the floor it failed");
        }

        /// <summary>
        /// ⭐ The last two headroom terms, and they are asserted DIFFERENTLY because they ARE
        /// different — which is the finding, not a shortcut.
        ///
        /// <para><b>WATER binds and is driven through a real command.</b> Drain the wreck's one tank
        /// and the ship says how many days it has and how many it needs.</para>
        ///
        /// <para>⛔ <b>OXYGEN CANNOT BE MADE TO BIND ON A LIVE SHIP, AND THAT IS PINNED AS THE
        /// CLAIM RATHER THAN FAKED AS A REFUSAL.</b> A powered vent injects gas from nothing
        /// (`AtmosphereSystem`'s own class doc), so there is no reserve to run down: the wreck holds
        /// ~86 crew-days for two against a 1.0 floor, and `--ship grid` measures ~99. Writing a
        /// room's `O2Moles` to a sub-floor value and calling that a driven refusal would be a
        /// fixture proving a state the sim restores on the next tick. What IS true and worth
        /// pinning is the term's own design contract: <b>it reports, and it never binds.</b> The
        /// margin is asserted as a MULTIPLE of the floor, in absolute crew-days, so a lane that
        /// raises the floor into biting range reddens here rather than silently starting to refuse
        /// thaws for a reason the wreck plan measured and killed.</para>
        /// </summary>
        [Test]
        public void TheWaterTermBinds_AndTheOxygenTermReportsButNeverDoes()
        {
            // ── water: driven ────────────────────────────────────────────────────────────────
            var sim = BootWreck();
            CommissionConsole(sim);
            var tank = sim.Devices.Items.First(d => d.Kind == DeviceKind.WaterTank);
            Assert.That(tank.StoredLiters, Is.EqualTo(300f), "precondition: the wreck's tank holds 300 L");
            tank.StoredLiters = 2f;   // 2 L ÷ (2 crew × 1.0 L/day) = 1.0 sim-day, floor is 3.0

            var pod = Dev(sim, Rung1Pod);
            var verdict = ThawGate.Evaluate(sim, Console, Rung1Pod);
            Assert.That(verdict.Reason, Is.EqualTo(ThawRefusal.Water),
                "a two-litre tank must bind the water term; it said: " + ThawGate.Describe(verdict));
            Assert.That(ThawGate.Describe(verdict), Is.EqualTo("WATER 1.0 DAYS — NEEDS 3.0"));

            SendThaw(sim, Console, Rung1Pod);
            Assert.That(pod.Progress, Is.EqualTo(0f), "the capsule cycled past a bound water term");

            // ── oxygen: the claim, in absolute crew-days ─────────────────────────────────────
            var healthy = BootWreck();
            var room = ThawGate.Headroom(healthy);
            Assert.That(room.O2CrewDays, Is.GreaterThan(ThawGate.MinO2CrewDays * 50.0),
                "standing O2 on the shipping ship reads " + room.O2CrewDays + " crew-days against a "
                + ThawGate.MinO2CrewDays + " floor. This term is designed to REPORT and never BIND "
                + "— a powered vent injects gas from nothing, so there is no reserve to run down. "
                + "If the margin has collapsed, either the floor was raised into biting range or "
                + "the ship stopped holding air; both change the milestone's pacing and neither "
                + "should happen quietly (wreck plan §3.4.1).");
            Assert.That(ThawGate.Evaluate(healthy, Console, Rung1Pod).Reason,
                Is.Not.EqualTo(ThawRefusal.Oxygen),
                "the healthy shipping ship was refused a thaw for lack of oxygen");
        }

        // ══════════════════════════════════════════════ 7. one truth, by assertion (mut. 8)

        /// <summary>
        /// ⭐⭐ <b>ONE SOURCE OF TRUTH, BY ASSERTION AND NOT BY CALL.</b>
        ///
        /// <para><c>ThawGate</c> may not name <c>ShipLedger</c> — <c>ArchitectureBoundaryTests</c>
        /// denies the identifier to every file in Sim.Core but the ledger's own, because
        /// <c>ShipLedger.Sample</c> allocates and the gate runs inside <c>Simulation.Tick</c>. So
        /// the gate re-reads the same live state, and THIS is what stops the two drifting: a driven
        /// ship, and the four shared quantities compared exactly.</para>
        ///
        /// <para>⛔ MUTATION 8 (call <c>ShipLedger</c> from <c>ThawGate</c>) is red at the
        /// architecture guard, not here — verified by physically adding the identifier and watching
        /// <c>TheLedgerIsNotReachableFromAnyTickPath</c> name <c>ThawGate.cs</c>.</para>
        ///
        /// <para><b>DRIVEN, and that is the whole design.</b> A comparison at tick 0 would pass on
        /// two constant-folded zeros. The ship runs for a sim-hour first, so crew drink, wear
        /// accumulates and the room gas moves — and the two readings must still agree.</para>
        /// </summary>
        [Test]
        public void TheGateAndTheLedgerAgree_OnADrivenShip()
        {
            var sim = BootWreck();
            for (int t = 0; t < 36_000; t++) sim.Tick();   // one sim-hour at 10 Hz

            var room = ThawGate.Headroom(sim);
            var sample = ShipLedger.Sample(sim);

            // NON-VACUITY, by inclusion: an all-zero census would agree with anything.
            Assert.That(sample.LivingCrew, Is.GreaterThan(0), "nobody alive — the comparison is vacuous");
            Assert.That(sample.FoodUnits, Is.GreaterThan(0), "no food aboard — the comparison is vacuous");
            Assert.That(sample.TankLiters, Is.GreaterThan(0f), "no water aboard — the comparison is vacuous");
            Assert.That(sample.BreathableO2Moles, Is.GreaterThan(0), "no air aboard — the comparison is vacuous");

            var problems = new List<string>();
            if (room.LivingCrew != sample.LivingCrew)
                problems.Add("LivingCrew: gate " + room.LivingCrew + " vs ledger " + sample.LivingCrew);
            if (room.FoodUnits != sample.FoodUnits)
                problems.Add("FoodUnits: gate " + room.FoodUnits + " vs ledger " + sample.FoodUnits);
            if (room.TankLiters != sample.TankLiters)
                problems.Add("TankLiters: gate " + room.TankLiters + " vs ledger " + sample.TankLiters);
            if (room.BreathableO2Moles != sample.BreathableO2Moles)
                problems.Add("BreathableO2Moles: gate " + room.BreathableO2Moles
                             + " vs ledger " + sample.BreathableO2Moles);
            // The per-crew O2 rate, the one number both sides derive rather than count.
            if (Math.Abs(ThawGate.O2MolesPerCrewPerDay(sim.Defs) * sample.LivingCrew
                         - sample.CrewO2MolesPerDay) > 1e-9)
                problems.Add("CrewO2MolesPerDay: gate " + ThawGate.O2MolesPerCrewPerDay(sim.Defs) * sample.LivingCrew
                             + " vs ledger " + sample.CrewO2MolesPerDay);
            // And the food rate, which is where a 2× drift would appear first.
            if (Math.Abs(ThawGate.FoodUnitsPerCrewPerDay(sim.Defs)
                         - ShipLedger.FoodUnitsPerCrewPerDay(sim.Defs)) > 1e-12)
                problems.Add("FoodUnitsPerCrewPerDay: gate " + ThawGate.FoodUnitsPerCrewPerDay(sim.Defs)
                             + " vs ledger " + ShipLedger.FoodUnitsPerCrewPerDay(sim.Defs));

            Assert.That(problems, Is.Empty,
                "the thaw gate and the ship's ledger disagree about the same ship. They may not "
                + "share code (the ledger allocates and the gate is on a tick path), so agreement "
                + "is the ONLY thing keeping them one truth. " + string.Join(" | ", problems));
        }

        // ══════════════════════════════════════════════════ 8. the invariants the sim owes

        /// <summary>
        /// The gate runs inside <c>Simulation.Tick</c>, and Sim.Core is ZERO-ALLOC in tick paths —
        /// test-enforced, not aspirational. This is the reason <see cref="ThawVerdict"/> carries
        /// numbers and <see cref="ThawGate.Describe"/> is a separate, host-side call.
        /// </summary>
        [Test]
        public void EvaluatingTheGate_AllocatesNothing()
        {
            var sim = BootWreck();
            CommissionConsole(sim);
            var sink = ThawGate.Evaluate(sim, Console, Rung1Pod);   // warm the path
            int reasons = (int)sink.Reason;

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 20_000; i++) reasons ^= (int)ThawGate.Evaluate(sim, Console, Rung1Pod).Reason;
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(reasons, Is.EqualTo(0), "the sink is read so the loop cannot be optimised away");
            Assert.That(delta, Is.EqualTo(0),
                "ThawGate.Evaluate allocated " + delta + " bytes over 20 000 calls. It executes "
                + "inside Simulation.Tick; a StringBuilder or a boxed struct here breaks the "
                + "zero-alloc tick invariant eight test files assert.");
        }

        /// <summary>
        /// ⛔ <b>THE THAW IS A MOSS <i>SCREEN</i> VERB, NOT A MOSS <i>LANGUAGE</i> VERB, AND THIS IS
        /// THE PIN.</b> <c>ScriptRuntime.Tick</c> consults no device at all, so a ten-line installed
        /// program carrying a thaw verb could empty the cryo bay unattended — the exact opposite of
        /// "only one after the other".
        ///
        /// <para>⚠️ AND THE OBVIOUS TEST HERE WOULD BE HOLLOW, in exactly the way
        /// <c>WreckShipTests</c> records for the terminal: asserting "no adapter for a CryoPod"
        /// passes today for a reason that has nothing to do with a decision — the registration
        /// switch simply does not list the kind. So the assertion is made against a CONTROL: a
        /// device kind the switch DOES list is registered on the same ship, in the same call, so a
        /// green here means "pods are excluded", not "nothing is registered".</para>
        /// </summary>
        [Test]
        public void NoMossAdapterIsRegisteredForACryoPod()
        {
            var sim = BootWreck();
            var registry = new DeviceRegistry();
            MossBindings.RegisterAdapters(sim, registry);

            var pods = sim.Devices.Items.Where(d => d.Kind == DeviceKind.CryoPod && d.Scriptable).ToList();
            Assert.That(pods, Is.Not.Empty,
                "no scriptable CryoPod aboard — this test would pass vacuously");

            // THE CONTROL: a kind the switch DOES cover must be registered by the same call, or a
            // green below only proves RegisterAdapters did nothing at all.
            var vent = sim.Devices.Items.First(d => d.Kind == DeviceKind.AirVent && d.Scriptable);
            Assert.That(registry.TryResolve(vent.Name, out _), Is.True,
                "the control failed: " + vent.Name + " is a kind MossBindings registers, and it "
                + "did not appear — this run proves nothing about pods");

            var bound = pods.Where(p => registry.TryResolve(p.Name, out _)).Select(p => p.Name).ToList();
            Assert.That(bound, Is.Empty,
                "a MOSS adapter is registered for " + string.Join(", ", bound) + ". A ten-line "
                + "installed program would then be able to empty the cryo bay unattended, with no "
                + "console, no cycle gate and no ladder — ScriptRuntime.Tick consults no device at "
                + "all. The thaw is a MOSS SCREEN verb and this is not reversible later without "
                + "breaking saves.");
        }
    }
}
