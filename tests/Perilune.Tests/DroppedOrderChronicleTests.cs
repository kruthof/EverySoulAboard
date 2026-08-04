using System.Collections.Generic;
using System.Linq;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession, WebCommand
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>b3-R — WHEN AN ORDER DIES MID-WAY, THE SHIP'S LOG RECORDS IT.</b> The player sentence:
    /// <i>an order I gave that dies mid-way leaves a line in the log — who let go, which machine, and
    /// the sim's own reason — so even a drop with no honest live badge is no longer silent.</i>
    ///
    /// <para><b>WHAT WAS WRONG, AND IT IS A RESIDUAL OF THE PACKAGE THAT SHIPPED THE BADGE</b>
    /// (MECHANICS §13.25 b3-R, owner-ruled 2026-08-03). <c>MaintenanceSystem.Abandon</c> publishes
    /// <c>OrderDroppedEvent</c> with one of SIX <c>JobDropReason</c>s, and the host badges a machine
    /// only where it can RE-ASK the sim's killing question live. Three reasons qualify.
    /// <c>Displaced</c>, <c>CargoLost</c> and <c>NoRouteToConsumable</c> do not — they are facts about
    /// a MOMENT and a PAWN, not standing properties of a machine — so those orders died with
    /// <b>nothing on any surface</b>, and under OD-H (every work type OFF) nothing ever re-recruits
    /// her: driven on the shipped wreck, 3 000 further ticks and <c>blocked</c> read <c>cells:[]</c>
    /// throughout. The ruled fix is not a latched badge (the live-re-ask discipline exists to refuse
    /// exactly that) but a CHRONICLE LINE: a badge says what is true now, the log says what happened.
    /// All six reasons write it, including the three that also badge.</para>
    ///
    /// <para><b>THE OUTCOME TEST DRIVES <c>gs.AdvanceTicks</c>, NEVER <c>sim.Tick()</c></b> —
    /// <c>DroppedOrderTests</c>' protocol, for its reason: that is the run loop's own path and the
    /// only one the shipping game takes. It also boots through <see cref="SimHost"/> so the ring the
    /// two surfaces read is the host's own.</para>
    ///
    /// <para><b>THE LEGS ARE BLINDED</b> (CLAUDE.md fifth shape): <c>Assert</c> throws, so a
    /// multi-clause outcome records into locals and asserts inside <c>Assert.Multiple</c>.</para>
    /// </summary>
    public class DroppedOrderChronicleTests
    {
        /// <summary>The shipping ship, a session over it, no sim thread. ⚠️ NOT
        /// <c>GiveAllCrewAllWork</c>: b3-R is measured at the OD-H boot state, which is the state a
        /// player is in when they give their first order.</summary>
        private static (GameSession Gs, SimHost Host) BootWreck()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            return (new GameSession(host, sink.Add), host);
        }

        /// <summary>The sighting's machine (§13.25 b3) and the one shut door between the crew and it,
        /// written out rather than searched for — <c>DroppedOrderTests</c>' constants.</summary>
        private const string TheMachine = "fabricator_1";
        private static readonly Int3 TheDoor = new Int3(27, 7, 0);

        private static Device ByName(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            Assert.Fail("no device named '" + name + "' on the wreck");
            return null;
        }

        private static void OrderOverTheWire(GameSession gs, Citizen who, Device machine)
            => gs.ApplyForTest(new WebCommand(CmdKind.Prioritise, machine.Pos.X, machine.Pos.Y,
                                              i: machine.Pos.Z, cid: who.Id));

        private static List<HistoryEntry> OfKind(SimHost host, HistoryKind kind)
            => host.History.Entries.Where(e => e.Kind == (byte)kind).ToList();

        // ══════════════════════════════════════════════════════════ 1. THE OUTCOME TEST, on the wreck

        /// <summary>
        /// ⭐⭐ <b>THE PACKAGE'S HEADLINE, DRIVEN ON THE SHIPPED WRECK: THE STACK IN HER HANDS
        /// VANISHES, THE ORDER DIES — AND THE LOG SAYS SO.</b> This is §13.25 b3-R's own recipe,
        /// verbatim: order <c>fabricator_1</c> with <c>door_d0_s2</c> OPEN so the order is really
        /// taken and the pending record is really retired, let her pick the Parts stack up, then
        /// remove it from the item store. <c>DriveWorker</c>'s logistics arm
        /// (<c>MachineWearSystem.cs:419</c>, <c>JobDropReason.CargoLost</c>) abandons the job — and
        /// this is one of the three reasons that CANNOT honestly badge, so before this package the
        /// player's order evaporated in total silence.
        ///
        /// <para><b>FOUR THINGS ARE ASSERTED AND THEY ARE NOT THE SAME CLAIM.</b> (1) the ring gained
        /// exactly one <see cref="HistoryKind.OrderDropped"/> entry carrying the right crew member,
        /// the right machine and the sim's OWN reason clause (never a literal retyped here — the
        /// authority is <c>HistorySystem.DropReasonClause</c>, and a copy in this file would agree
        /// with itself while disagreeing with the ship); (2) it reaches the shipped <c>log</c> wire
        /// payload, which is the MOSS log screen and the Overview's SENSOR LOG; (3) it reaches the
        /// <c>chron</c> payload, the other consumer of the same ring; and (4) it does NOT reach the
        /// MOSS ledger's LAST FAULT column, which it would have without
        /// <c>ShipSystems.IsNotAFault</c>'s new clause — the line names <c>fabricator_1</c> and the
        /// FABRICATION row's name join matches on exactly that (§13.43.3's regression, second
        /// instance).</para>
        ///
        /// <para><b>NON-VACUITY IS ASSERTED BY INCLUSION at every step</b>: the order must be
        /// ACCEPTED and HELD (or nothing publishes at all), she must really be CARRYING a stack
        /// before it is yanked (a yank that removed nothing would leave the leg green and empty), the
        /// job must really end, and the entry's text must really contain the device name (or clause 4
        /// is asserting that a join it never fed found nothing).</para>
        ///
        /// <para><b>MUTATIONS, RUN — each applied, observed red for the reason named, reverted from
        /// an in-memory copy:</b>
        /// (1) delete the <c>OrderDroppedEvent</c> consumer from <c>HistorySystem.Tick</c> ⇒ red on
        /// clause 1 (no entry) and every clause after it — the whole package.
        /// (2) move <c>HistorySystem</c>'s read to a later tick (drain the bus first) — the event is
        /// readable for exactly one tick ⇒ same red, which is why the consumer is IN <c>Tick</c>.
        /// (3) delete the <c>OrderDropped</c> clause from <c>ShipSystems.IsNotAFault</c> ⇒ red on
        /// clause 4 ONLY, with the FABRICATION row reading
        /// <c>"ORDER DROPPED — RELL LET GO OF THE FABRICATOR (FABRICATO…"</c> under a column
        /// headed LAST FAULT (verbatim from the run — <c>Summarize</c> truncates at 56 characters).
        /// (4) swap <c>DropReasonClause</c>'s <c>CargoLost</c> arm for another member's ⇒ red on the
        /// wrong-reason clause here AND on
        /// <see cref="EveryDropReasonHasItsOwnSentence_AndNoneFallsThroughToTheFallback"/>'s
        /// collision sweep — two instruments, because the positive assertion above reads the same
        /// authority the ship writes with and would agree with a mis-wired arm.
        /// (5) delete <c>Chronicle</c>'s <c>OrderDropped</c> label row ⇒ red on the <c>[Order]</c>
        /// clause here (and on <c>ChronicleTests.EveryHistoryKindHasBothALabelAndASeverityRow</c>);
        /// (6) delete its severity row ⇒ red on
        /// <see cref="ADeathAndAThawStillOutrankADroppedOrder"/>'s non-vacuity leg and the same
        /// sweep.</para>
        /// </summary>
        [Test]
        public void TheOrderDiesMidWay_AndTheShipsLogRecordsItWithTheSimsOwnReason()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var machine = ByName(sim, TheMachine);
            var her = sim.Citizens.Items[0];

            Assert.That(sim.TryGetDeviceAt(TheDoor, out var door), Is.True, "premise: the door is there");
            door.IsOpen = true;   // the route is OPEN, so the order is TAKEN and the badge half retires

            OrderOverTheWire(gs, her, machine);
            gs.AdvanceTicks(1);
            Assert.That(her.JobKind, Is.EqualTo(JobKind.Maintain), "premise: the order was ACCEPTED");
            Assert.That(her.HeldByOrder, Is.True, "premise: …and HELD — the hold IS the order, and it " +
                "is the only thing `Abandon` publishes for");

            // She walks to the NEAREST Parts stack and picks it up — measured at tick ~51 on this
            // ship since D7 put the `cabin stores` crates at (2..8,6,0) five tiles from her capsule
            // (it was ~171 at the reactor bay's (7,14,0) when that was the only Parts aboard; driven
            // 2×2 in DroppedOrderTests' header). Waited for rather than assumed: the pickup is what
            // makes the yank below reach the CARGO arm instead of some earlier one.
            for (int i = 0; i < 600 && her.CarryingItemId == 0; i++) gs.AdvanceTicks(1);
            Assert.That(her.CarryingItemId, Is.Not.EqualTo(0u),
                "COVERAGE PREMISE FAILED: she never picked a stack up, so the yank below removes " +
                "nothing and this leg would pass while testing another arm entirely");

            sim.Items.Remove(her.CarryingItemId);   // §13.25 b3-R's recipe: the stack changes hands
            gs.AdvanceTicks(60);

            Assert.That(her.JobKind, Is.EqualTo(JobKind.None), "premise: the sim dropped the job");
            Assert.That(her.HeldByOrder, Is.False, "premise: and the hold with it — the order is gone");

            var dropped = OfKind(host, HistoryKind.OrderDropped);
            gs.RenderForTest();
            // The SNAPSHOT's cached payload, not a hand-built one: that is what a reconnecting tab
            // is caught up from and what every live tab has been sent (BlockedChannelTests' reader).
            string logPayload = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"log\""));
            string chronPayload = gs.ConvChroniclePayload();
            var fabrication = ShipSystems.Compute(sim, host.History).Rows.First(r => r.Id == "fabrication");
            string line = dropped.Count == 1 ? dropped[0].Text : "";
            // ⚠️ THE CLAUSE ABOVE IS READ OFF THE SAME AUTHORITY THE SHIP WRITES WITH, so it agrees
            // with a MIS-WIRED arm as happily as with a correct one. This is the leg that closes
            // that: no OTHER reason's sentence may appear in the line, so swapping two arms of
            // `DropReasonClause` — or handing `OrderDroppedText` the wrong reason byte — is visible
            // here rather than only in the distinctness sweep below.
            var wrongReasons = System.Enum.GetValues(typeof(JobDropReason)).Cast<JobDropReason>()
                .Where(r => r != JobDropReason.CargoLost)
                .Where(r => line.Length > 0 && line.Contains(HistorySystem.DropReasonClause(r)))
                .Select(r => r.ToString())
                .ToList();

            Assert.Multiple(() =>
            {
                Assert.That(dropped.Count, Is.EqualTo(1),
                    "⛔ THIS IS §13.25 b3-R: the player's order was accepted, the world changed under " +
                    "it, the sim ate it — and no surface in the game remembers that it existed.");
                Assert.That(line, Does.Contain(her.Name), "the line must name WHO let go");
                Assert.That(line, Does.Contain(TheMachine), "…and WHICH machine");
                Assert.That(line, Does.Contain(HistorySystem.DropReasonClause(JobDropReason.CargoLost)),
                    "…and the SIM's own reason for this arm — read off the one authority, never " +
                    "retyped here: a private copy would agree with itself and drift from the ship");
                Assert.That(wrongReasons, Is.Empty,
                    "the line carries ANOTHER reason's sentence, so the arm that fired and the words " +
                    "the player reads disagree: " + string.Join(", ", wrongReasons));
                Assert.That(dropped.Count == 1 ? dropped[0].SubjectA : 0u, Is.EqualTo(her.Id),
                    "SubjectA is the crew member — RepairCompleted's convention, so the two halves of " +
                    "one order's life key the same way");
                Assert.That(dropped.Count == 1 ? dropped[0].SubjectB : 0u, Is.EqualTo(machine.Id),
                    "…and SubjectB the machine");

                Assert.That(logPayload, Is.Not.Null.And.Contains("ORDER DROPPED"),
                    "INVISIBLE FEEDBACK IS FUNCTIONAL BREAKAGE: the entry exists in the ring and the " +
                    "shipped `log` channel — the MOSS log screen and the Overview SENSOR LOG — does " +
                    "not carry it");
                Assert.That(chronPayload, Does.Contain("ORDER DROPPED"),
                    "…and the other consumer of the same ring, the `chron` payload, must carry it too");
                Assert.That(chronPayload, Does.Contain("[Order]"),
                    "the Chronicle tags every line with its kind's LABEL; a missing Chronicle.Label " +
                    "row renders as [Note] and nothing else in the repo fails");

                Assert.That(fabrication.FaultText, Does.Not.Contain("ORDER DROPPED").IgnoreCase,
                    "⛔ a dropped ORDER is reporting itself as a MACHINE FAULT — §13.43.3's " +
                    "regression, second instance. LAST FAULT read: '" + fabrication.FaultText + "'");
                Assert.That(fabrication.FaultText, Does.Not.Contain(TheMachine).IgnoreCase,
                    "…and the name join is what would have matched it: this row's device group is " +
                    "the fabricator's, which is what makes the clause above non-vacuous");
            });
        }

        // ═══════════════════════════════════════════════ 2. one authority for the reason wording

        /// <summary>
        /// ⛔ <b>SWEEP THE CLASS, NOT THE LIST — every declared <see cref="JobDropReason"/> has a
        /// sentence of its own.</b> <c>MaintenanceSystem.Abandon</c>'s parameter has no default, so
        /// the compiler forces a tenth arm to NAME a reason; nothing forces a seventh REASON to be
        /// worded, and a reason that falls through to the fallback ships a line saying the sim gave
        /// no reason — which is the silence this package removes, wearing a sentence.
        ///
        /// <para>Distinctness is asserted as well as presence: two reasons sharing a clause would
        /// pass a presence check while telling the player the wrong thing about one of them (the
        /// badge's own <c>BLOCKED_REASON_TEXT</c> coverage leg, in the sim's costume).</para>
        /// </summary>
        [Test]
        public void EveryDropReasonHasItsOwnSentence_AndNoneFallsThroughToTheFallback()
        {
            string fallback = HistorySystem.DropReasonClause((JobDropReason)200);
            var unworded = new List<string>();
            var byClause = new Dictionary<string, string>();
            var collisions = new List<string>();

            foreach (JobDropReason r in System.Enum.GetValues(typeof(JobDropReason)))
            {
                string clause = HistorySystem.DropReasonClause(r);
                if (string.IsNullOrEmpty(clause) || clause == fallback) unworded.Add(r.ToString());
                else if (byClause.TryGetValue(clause, out var first)) collisions.Add(first + "/" + r);
                else byClause[clause] = r.ToString();
            }

            Assert.Multiple(() =>
            {
                Assert.That(unworded, Is.Empty,
                    "these JobDropReasons have no sentence and would tell the player the sim gave no " +
                    "reason — word them in HistorySystem.DropReasonClause in the SAME commit as the " +
                    "enum member: " + string.Join(", ", unworded));
                Assert.That(collisions, Is.Empty,
                    "these JobDropReasons share one sentence, so the log cannot tell them apart: "
                    + string.Join(", ", collisions));
                Assert.That(fallback, Is.Not.Empty,
                    "NON-VACUITY: the fallback must itself be a real string, or the comparison above " +
                    "is satisfied by everything");
            });
        }

        // ═══════════════════════════════════════════ 3. the owner-ruled day-headline order stands

        /// <summary>
        /// ⛔ <b>DEATH FIRST — the day-headline ladder is an OWNER-RULED shape and a new kind must not
        /// quietly move it</b> (ruled 2026-08-02 for the ordinary thaw, restated 2026-08-03). A day
        /// holding a death, a thaw and a dropped order is remembered as the day somebody died; a day
        /// holding a thaw and a dropped order is remembered as the wake.
        ///
        /// <para>Both legs put the DROPPED ORDER FIRST in tick order, because <c>Chronicle.Render</c>
        /// breaks ties on the EARLIEST entry — an ordering that would let a wrongly-ranked
        /// <c>OrderDropped</c> pass while looking correct. Pure render, no drive: the ladder is a
        /// property of <c>Chronicle</c> and nothing else.</para>
        /// </summary>
        [Test]
        public void ADeathAndAThawStillOutrankADroppedOrder()
        {
            HistoryEntry E(long tick, HistoryKind kind, string text)
                => new HistoryEntry(tick, text, (byte)kind);

            var withDeath = Chronicle.Render(new List<HistoryEntry>
            {
                E(10, HistoryKind.OrderDropped, "the drop"),
                E(20, HistoryKind.Thaw, "the wake"),
                E(30, HistoryKind.Death, "the death"),
            });
            var withThaw = Chronicle.Render(new List<HistoryEntry>
            {
                E(10, HistoryKind.OrderDropped, "the drop"),
                E(20, HistoryKind.Thaw, "the wake"),
            });
            var alone = Chronicle.Render(new List<HistoryEntry>
            {
                E(10, HistoryKind.Alarm, "an alarm"),
                E(20, HistoryKind.OrderDropped, "the drop"),
            });

            Assert.Multiple(() =>
            {
                Assert.That(withDeath[0].Headline, Is.EqualTo("Day 0 — the death"),
                    "a death must headline a day that also holds a dropped order");
                Assert.That(withThaw[0].Headline, Is.EqualTo("Day 0 — the wake"),
                    "and so must a thaw");
                Assert.That(alone[0].Headline, Is.EqualTo("Day 0 — the drop"),
                    "NON-VACUITY, BY INCLUSION: the two legs above are satisfied by a kind ranked at " +
                    "the floor. A dropped order must still OUT-RANK the noise it sits above — an " +
                    "alarm, which is what a klaxon on a cold ship writes all day.");
            });
        }
    }
}
