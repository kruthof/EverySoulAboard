using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ M3-7 — THE <c>workcaps</c> CHANNEL: the half of this package that leaves the sim. What each
    /// crew member is GOOD at, and what she CANNOT DO AT ALL.
    ///
    /// <para><b>WHAT THIS FILE OWNS, in the order the charter's mutation table names it:</b>
    /// <list type="number">
    ///   <item><b>THE MASK REACHES THE CLIENT FOR A CITIZEN WITH NO ON-ROWS AT ALL</b> — mutation 4.
    ///     Under OD-H that is every crew member on every ship at boot, i.e. THE DEFAULT FIXTURE, not an
    ///     edge case. A channel that skipped her would be empty exactly when the player first looks.</item>
    ///   <item><b>INCAPABLE ≠ PRIORITY 0</b> — mutation 5, and it needs a fixture carrying BOTH: one
    ///     citizen incapable of a type and one with the same type merely switched off. ⭐ On the sparse
    ///     <c>work</c> channel those two are indistinguishable BY CONSTRUCTION (both are "no row"),
    ///     which is the entire reason this channel exists; the test asserts that indistinguishability
    ///     as a CONTROL and then shows <c>workcaps</c> separating them.</item>
    ///   <item><b>THE MASK IS THE SIM'S OWN BYTE, VERBATIM</b> — mutation 6, recorded at the SEAM
    ///     (TRAPS 4: pin how an API was called by capturing the argument, never by scanning text). The
    ///     probe plants a mask value NO re-derivation could produce.</item>
    ///   <item><b><c>WorkCell</c> IS UNTOUCHED</b> — mutation 7. The contract leg: <c>work</c>'s tuple
    ///     is still three elements and its delta key still reads all three.</item>
    ///   <item><b>THE DELTA GATE, FIELD BY FIELD</b> — the eighth trap wearing this package's clothes,
    ///     and the <c>DeviceCell</c> scar it is named after.</item>
    ///   <item><b>PIN-NEUTRALITY'S IN-SUITE HALF</b> — building and serializing this channel never
    ///     moves <c>StateHash</c>. (The package's pin move is the sim-side fold; this file is no part
    ///     of it.)</item>
    /// </list></para>
    ///
    /// <para>⚠️ THE FIXTURE IS THE SHIPPING WRECK — what <c>./play.sh</c> boots and
    /// <c>WebHostDefaultShipTests</c> pins — so every leg is about the game the player runs. The wreck
    /// carries exactly ONE live crew member (the cryo survivor; that is the premise), which is why the
    /// two-citizen legs boot <c>--ship grid</c> and say so at their own fixture.</para>
    /// </summary>
    public class WorkCapsChannelTests
    {
        // ═══════════════════════════════════════════════════════════════ fixture + readers

        private static (GameSession gs, SimHost host) Boot(ShipChoice ship = ShipChoice.Wreck)
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ship), ship: ship);
            var gs = new GameSession(host, sink.Add);   // NOT started ⇒ no sim thread races the asserts
            return (gs, host);
        }

        /// <summary>The cached <c>workcaps</c> payload after a FORCED render, taken from the Snapshot a
        /// reconnecting client is caught up from — so every assertion below also proves the channel
        /// survives a reconnect. That matters MORE here than for <c>work</c>: nothing in the sim writes
        /// a skill yet, so this payload can be constant for an entire run and a tab left to "self-heal"
        /// would never see it at all.</summary>
        private static string WorkCapsJson(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"workcaps\""));
            Assert.IsNotNull(json, "the workcaps channel must be cached for Snapshot catch-up");
            return json;
        }

        private static string WorkJson(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"work\""));
            Assert.IsNotNull(json, "precondition: the work channel is still cached");
            return json;
        }

        /// <summary>⚠️ THE TUPLE WIDTH AND THE PARSER MOVE TOGETHER. This parser reads POSITIONALLY —
        /// the tuple IS the contract, and a parser that named its fields would not notice a reorder —
        /// so a tuple that silently grows or shrinks turns it into a confident reader of the wrong
        /// column. That is the guard that refused the tree when OPERATE and the devices delta gate
        /// merged.</summary>
        private const int Width = WireFormat.WorkCapsSkillSlots + 2;   // cid + six skills + the mask

        /// <summary>Parse the emitted tuples back out, in wire order.</summary>
        private static List<(int Cid, int[] Skills, int Mask)> Tuples(string json)
        {
            var list = new List<(int, int[], int)>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                string body = part.Split(']')[0];
                var f = body.Split(',');
                Assert.AreEqual(Width, f.Length,
                    "a workcaps tuple is " + Width + " elements (cid, six skills, incapableMask), saw: [" + body + "]");
                var skills = new int[WireFormat.WorkCapsSkillSlots];
                for (int s = 0; s < skills.Length; s++)
                    skills[s] = int.Parse(f[1 + s], CultureInfo.InvariantCulture);
                list.Add((int.Parse(f[0], CultureInfo.InvariantCulture), skills,
                          int.Parse(f[Width - 1], CultureInfo.InvariantCulture)));
            }
            return list;
        }

        private static (int Cid, int[] Skills, int Mask) RowFor(GameSession gs, uint cid)
        {
            foreach (var t in Tuples(WorkCapsJson(gs)))
                if (t.Cid == (int)cid) return t;
            Assert.Fail("no workcaps row for cid " + cid + " — every LIVING crew member gets one");
            return default;
        }

        private static Citizen FirstLiving(SimHost host)
        {
            foreach (var c in host.Sim.Citizens.Items) if (!c.Dead) return c;
            Assert.Fail("precondition: the fixture has no living crew");
            return null;
        }

        // ═══════════════════════════════════ 1. the mask reaches a citizen with NO on-rows (mutation 4)

        /// <summary>
        /// ⛔ <b>MUTATION 4's LEG, ON THE BOOT STATE.</b> A crew member with NOTHING switched on — no
        /// row on the <c>work</c> channel at all, which under OD-H is every crew member on every ship
        /// until the player gives an order — <b>still gets a <c>workcaps</c> row, and that row still
        /// carries her incapability mask.</b>
        ///
        /// <para>This is the leg that makes the channel worth building. The obvious design (two more
        /// columns on <c>work</c>) is not merely worse here, it is EMPTY here: a sparse off-only channel
        /// emits no row for her, and a row that does not exist cannot carry a column.</para>
        ///
        /// <para>NAMED MUTATION: in <c>GameSession.BuildWorkCaps</c>, skip a citizen with no enabled
        /// work type (the shape a reader who assumed sparsity would write) — this leg goes red while
        /// every other leg in this file stays green, because they all set a priority first.</para>
        /// </summary>
        [Test]
        public void ACitizenWithNoEnabledWorkAtAll_StillCarriesHerMaskToTheClient()
        {
            var (gs, host) = Boot();
            var crew = FirstLiving(host);
            crew.SetIncapableOf(WorkType.Craft, true);

            // PRECONDITION, and it is the whole premise: she is invisible on the `work` channel.
            foreach (WorkType t in Enum.GetValues(typeof(WorkType)))
                Assert.That(crew.GetWorkPriority(t), Is.EqualTo(WorkPriority.Off),
                    "precondition: OD-H boots every work type OFF, so this crew member has no work rows");
            Assert.That(WorkJson(gs), Does.Contain("\"cells\":[]"),
                "precondition: the work channel really is EMPTY — that is what makes this leg the " +
                "one the channel exists for, rather than a redundant second reading");

            var row = RowFor(gs, crew.Id);
            Assert.That(row.Mask, Is.EqualTo(crew.WorkIncapable),
                "the incapability mask must reach the client for a crew member with no on-rows — the " +
                "OD-H boot state IS the default fixture, not an edge case");
            Assert.That(row.Mask & (1 << (int)WorkType.Craft), Is.Not.EqualTo(0),
                "…and the bit that is set is the one the sim set");
        }

        // ═══════════════════════════ 2. incapable is NOT priority 0 (mutation 5)

        /// <summary>
        /// ⛔ <b>MUTATION 5's LEG — TWO DISTINCT WIRE FACTS, AND THE FIXTURE CARRIES BOTH.</b> One crew
        /// member is INCAPABLE of Deconstruct (a fact about the person); another has Deconstruct merely
        /// switched OFF (an order from the player). RimWorld §1.2 keeps them apart deliberately —
        /// different provenance, different lifetime, and §1.6's <c>renders as</c> row draws a disabled
        /// cell BLANK and an incapable one as <b>no cell at all</b>.
        ///
        /// <para>⭐ THE CONTROL IS THE POINT: on the sparse <c>work</c> channel the two citizens are
        /// INDISTINGUISHABLE — both simply have no Deconstruct row — and that is asserted here as a
        /// control rather than assumed, because it is the fact that makes a second message necessary
        /// instead of merely convenient. A reviewer who doubts the channel should read this leg first.</para>
        ///
        /// <para>⚠️ FIXTURE IS <c>--ship grid</c>: the wreck carries exactly one living crew member (the
        /// cryo survivor — that is its premise), and this leg needs two.</para>
        ///
        /// <para>NAMED MUTATION: emit the mask as <c>0</c> whenever the priority is <c>Off</c> (the
        /// conflation) — the incapable citizen's row becomes identical to the merely-off one's and the
        /// separation assertion fails, while the <c>work</c>-channel control keeps passing, which is
        /// exactly the asymmetry being pinned.</para>
        /// </summary>
        [Test]
        public void IncapableAndMerelySwitchedOff_AreTheSameOnWork_AndDifferentOnWorkCaps()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var living = host.Sim.Citizens.Items.Where(c => !c.Dead).ToList();
            Assert.That(living.Count, Is.GreaterThanOrEqualTo(2),
                "precondition: this leg needs two living crew, which is why it boots --ship grid");

            var cannot = living[0];   // the PERSON cannot do it
            var wontYet = living[1];  // the PLAYER has not switched it on
            cannot.SetIncapableOf(WorkType.Deconstruct, true);
            Assert.That(wontYet.GetWorkPriority(WorkType.Deconstruct), Is.EqualTo(WorkPriority.Off),
                "precondition: the second crew member is merely OFF for that type (OD-H's boot state)");
            Assert.That(wontYet.IsIncapableOf(WorkType.Deconstruct), Is.False,
                "precondition: …and is perfectly capable of it");

            // CONTROL — on `work` the two are the same fact, BY CONSTRUCTION. This is why workcaps exists.
            var workRows = WorkJson(gs);
            foreach (var c in new[] { cannot, wontYet })
                Assert.That(workRows, Does.Not.Contain("[" + c.Id + "," + (int)WorkType.Deconstruct + ","),
                    "CONTROL: the sparse work channel emits NO Deconstruct row for either of them — " +
                    "'the person cannot' and 'the player has not' are indistinguishable there, and a " +
                    "design that put two more columns on this channel could never have separated them");

            // THE CLAIM — on `workcaps` they are two different facts.
            Assert.That(RowFor(gs, cannot.Id).Mask & (1 << (int)WorkType.Deconstruct), Is.Not.EqualTo(0),
                "the incapable crew member's mask must say so");
            Assert.That(RowFor(gs, wontYet.Id).Mask & (1 << (int)WorkType.Deconstruct), Is.EqualTo(0),
                "…and the merely-switched-off one's must NOT — conflating them throws away the only " +
                "fact this channel was built to carry");
        }

        // ═══════════════════════════ 3. the mask is the sim's byte, VERBATIM (mutation 6)

        /// <summary>
        /// ⛔ <b>MUTATION 6's LEG — SINGLE AUTHORITY, RECORDED AT THE SEAM.</b> The host copies
        /// <c>Citizen.WorkIncapable</c>'s byte; it does not re-derive capability from the priorities,
        /// from <c>CanTakeWorkType</c>, or bit by bit from <c>IsIncapableOf</c>.
        ///
        /// <para>⭐ THE PROBE IS A MASK NO RE-DERIVATION COULD PRODUCE, which is what makes this an
        /// argument-at-the-seam pin (TRAPS 4) rather than a text scan: a work type that is INCAPABLE
        /// <b>and simultaneously switched ON at priority 1</b>. <c>Citizen</c>'s own header records
        /// that this state is deliberately reachable — <i>"nothing stops a caller setting a priority on
        /// an incapable type"</i> — and any host-side second opinion (derive from
        /// <c>!CanTakeWorkType</c>, or from "priority == Off") would report the OPPOSITE bit for it.
        /// The verbatim copy is the only implementation that survives.</para>
        /// </summary>
        [Test]
        public void TheMaskIsTheSimsOwnByte_NotAHostSideRederivation()
        {
            var (gs, host) = Boot();
            var crew = FirstLiving(host);

            // The probe: incapable of Mine AND switched ON for it. A re-derivation cannot express this.
            crew.SetIncapableOf(WorkType.Mine, true);
            crew.SetWorkPriority(WorkType.Mine, WorkPriority.Highest);
            crew.SetWorkPriority(WorkType.Haul, WorkPriority.Highest);   // capable AND on — the other corner

            Assert.That(crew.CanTakeWorkType(WorkType.Mine), Is.False,
                "precondition: the veto still refuses her, which is exactly what a re-derivation would read");

            var row = RowFor(gs, crew.Id);
            Assert.That(row.Mask, Is.EqualTo(crew.WorkIncapable),
                "the emitted mask must be Citizen.WorkIncapable's byte VERBATIM");
            Assert.That(row.Mask & (1 << (int)WorkType.Mine), Is.Not.EqualTo(0),
                "Mine is incapable AND switched on — a host that derived the mask from CanTakeWorkType " +
                "or from 'priority == Off' would clear this bit, because the priority is 1");
            Assert.That(row.Mask & (1 << (int)WorkType.Haul), Is.EqualTo(0),
                "…and Haul is capable and on, so its bit must be clear — the negative corner, without " +
                "which an 'always 0xFF' bug would pass the leg above");
        }

        // ═══════════════════════════════ 4. every skill slot reaches the wire, in the right column

        /// <summary>
        /// Each of the six levels reaches the client IN ITS OWN COLUMN. ⚠️ The six seeds are DISTINCT
        /// and none is zero: a builder that emitted <c>SkillsRaw[0]</c> six times, or that swapped two
        /// columns, is invisible to any fixture whose levels are uniform — and uniform is exactly what
        /// the pre-OD-M single byte would have produced, so this is the leg that pins the widening
        /// actually reaching the surface.
        /// </summary>
        [Test]
        public void EverySkillSlotReachesTheWire_InWorkTypeValueOrder()
        {
            var (gs, host) = Boot();
            var crew = FirstLiving(host);
            foreach (WorkType t in Enum.GetValues(typeof(WorkType))) crew.SetSkill(t, (byte)(3 + (int)t));

            var row = RowFor(gs, crew.Id);
            foreach (WorkType t in Enum.GetValues(typeof(WorkType)))
            {
                Assert.That(row.Skills[(int)t], Is.EqualTo(3 + (int)t),
                    t + " arrived in the wrong column (or not at all) — the wire order is WorkType " +
                    "VALUE order, which is NOT a display order: a work tab's columns come from " +
                    "WorkPriority.RankedOrder and agree with this only by OD-J's coincidence");
                Assert.That(row.Skills[(int)t], Is.EqualTo(crew.GetSkill(t)),
                    t + ": …and the value is the sim's, not a host-side transform of it");
            }
        }

        /// <summary>The wire's slot count and the sim's work-type count are ONE number. A seventh work
        /// type must redden here rather than silently emit a short tuple into a positional decoder.</summary>
        [Test]
        public void TheWireSlotCount_IsTheSimsWorkTypeCount()
        {
            Assert.That(WireFormat.WorkCapsSkillSlots, Is.EqualTo(WorkPriority.WorkTypeCount));
            Assert.That(WireFormat.WorkCapsSkillSlots, Is.EqualTo(Enum.GetValues(typeof(WorkType)).Length));
        }

        // ═══════════════════════════════ 5. dead crew are absent; every living one is present

        /// <summary>DENSE over the LIVING: one row per living crew member and none for a corpse — the
        /// line <c>BuildWork</c> and <c>SetWorkPriorityCommand</c> both draw. A corpse's stored skills
        /// are still saved and hashed; she is simply not part of "who aboard can do what".</summary>
        [Test]
        public void OneRowPerLivingCrewMember_AndNoneForACorpse()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            var living = host.Sim.Citizens.Items.Where(c => !c.Dead).ToList();
            Assert.That(living.Count, Is.GreaterThanOrEqualTo(2), "precondition: at least two living crew");

            Assert.That(Tuples(WorkCapsJson(gs)).Count, Is.EqualTo(living.Count),
                "every LIVING crew member gets exactly one row, whether or not she has any work on");

            var doomed = living[0];
            doomed.Dead = true;
            var after = Tuples(WorkCapsJson(gs));
            Assert.That(after.Count, Is.EqualTo(living.Count - 1), "a corpse's row is dropped");
            Assert.That(after.Any(t => t.Cid == (int)doomed.Id), Is.False,
                "…and it is HER row that went, not merely the last one");
        }

        // ═══════════════════════════════ 6. WorkCell is untouched (mutation 7)

        /// <summary>
        /// ⛔ <b>MUTATION 7's LEG — THE CONTRACT ON <c>work</c> IS UNCHANGED.</b> The charter's design
        /// is that this package adds a channel and edits none: <c>WireFormat.cs</c> AND
        /// <c>WireFormat.Work.cs</c> both take a zero behavioural diff.
        ///
        /// <para>Pinned STRUCTURALLY rather than by scanning a diff, because a diff is not available to
        /// a test and a text scan would be the wrong instrument (TRAPS 4): <c>WorkCell</c> still has
        /// exactly three fields, its delta key still reads all three, and the emitted <c>work</c> tuple
        /// is still three elements wide. Adding <c>skill</c> or <c>incapable</c> to that struct — the
        /// mutation — moves the field count and reddens this.</para>
        /// </summary>
        [Test]
        public void TheWorkChannelsContract_IsUntouchedByThisPackage()
        {
            var fields = typeof(WireFormat.WorkCell).GetFields();
            Assert.That(fields.Length, Is.EqualTo(3),
                "WorkCell gained a field. The `work` channel is sparse and off-only, so an incapable " +
                "work type has NO ROW there and a row that does not exist cannot carry a column — " +
                "that is why workcaps is a second message. Field list: " +
                string.Join(", ", fields.Select(f => f.Name)));
            Assert.That(fields.Select(f => f.Name).OrderBy(n => n, StringComparer.Ordinal),
                Is.EqualTo(new[] { "Cid", "Priority", "WorkType" }));

            // The delta key still reads every one of the three — the DeviceCell scar, re-checked here
            // because this package is the most likely place for someone to "just add a column".
            var a = new WireFormat.WorkCell(1, 2, 3);
            Assert.That(a.SameAs(new WireFormat.WorkCell(9, 2, 3)), Is.False, "Cid is not in the key");
            Assert.That(a.SameAs(new WireFormat.WorkCell(1, 9, 3)), Is.False, "WorkType is not in the key");
            Assert.That(a.SameAs(new WireFormat.WorkCell(1, 2, 9)), Is.False, "Priority is not in the key");
            Assert.That(a.SameAs(new WireFormat.WorkCell(1, 2, 3)), Is.True, "…and equality still holds");
        }

        // ═══════════════════════════════ 7. the delta gate, field by field (the eighth trap)

        /// <summary>
        /// ⚠️ <b>THE DELTA KEY READS ALL EIGHT FIELDS, BLINDED LEG BY LEG.</b> This is the
        /// <c>DeviceCell</c> scar written as a test: the OPERATE verb appended a field to that struct
        /// and the gate's field list AUTO-MERGED with no conflict, leaving a gate that ignored the one
        /// byte a player toggles — a stale readout nothing ever refreshes, with the suite green.
        ///
        /// <para>⭐ Each leg is asserted SEPARATELY rather than as one compound expression: <c>assert</c>
        /// throws, so a multi-leg assertion reports only its first failure and a dead later leg looks
        /// identical to a live one (TRAPS, fifth shape).</para>
        /// </summary>
        [Test]
        public void TheDeltaKey_ReadsEveryFieldOfTheTuple()
        {
            var baseline = new WireFormat.WorkCapsCell(1, 2, 3, 4, 5, 6, 7, 8);
            Assert.That(baseline.SameAs(new WireFormat.WorkCapsCell(1, 2, 3, 4, 5, 6, 7, 8)), Is.True,
                "precondition: two identical rows must compare equal, or every leg below passes vacuously");

            var mutants = new (string Field, WireFormat.WorkCapsCell Cell)[]
            {
                ("Cid",              new WireFormat.WorkCapsCell(9, 2, 3, 4, 5, 6, 7, 8)),
                ("SkillRepair",      new WireFormat.WorkCapsCell(1, 9, 3, 4, 5, 6, 7, 8)),
                ("SkillConstruct",   new WireFormat.WorkCapsCell(1, 2, 9, 4, 5, 6, 7, 8)),
                ("SkillCraft",       new WireFormat.WorkCapsCell(1, 2, 3, 9, 5, 6, 7, 8)),
                ("SkillDeconstruct", new WireFormat.WorkCapsCell(1, 2, 3, 4, 9, 6, 7, 8)),
                ("SkillMine",        new WireFormat.WorkCapsCell(1, 2, 3, 4, 5, 9, 7, 8)),
                ("SkillHaul",        new WireFormat.WorkCapsCell(1, 2, 3, 4, 5, 6, 9, 8)),
                ("IncapableMask",    new WireFormat.WorkCapsCell(1, 2, 3, 4, 5, 6, 7, 9)),
            };
            Assert.That(mutants.Length, Is.EqualTo(Width),
                "one leg per wire element, or a field can be added to the tuple without one");

            foreach (var (field, cell) in mutants)
                Assert.That(baseline.SameAs(cell), Is.False,
                    field + " is not in the delta key. A field the key does not read is a field whose " +
                    "change is NEVER RE-SENT, and the only symptom is a readout nothing refreshes — " +
                    "here, a crew member whose skills visibly never improve.");
        }

        /// <summary>The gate is DRIVEN, not merely unit-tested: an unchanged sim re-serializes nothing,
        /// and a skill change re-serializes exactly once. ⚠️ The COUNT is part of the key too — a crew
        /// member dying removes a row while every survivor's row is untouched, and a loop that walked
        /// only the shared prefix would pass every field-wise leg above.</summary>
        [Test]
        public void TheGate_SkipsAnUnchangedPayload_AndFiresOnASkillChange()
        {
            var (gs, host) = Boot();
            gs.RenderForTest();                        // prime (forced ⇒ always serializes)
            int primed = gs.WorkCapsSerializedForTest;
            Assert.That(primed, Is.GreaterThan(0), "precondition: the first render primes the channel");

            // ⚠️ UNFORCED FROM HERE. RenderForTest FORCES, which bypasses the gate by design — a test
            // that counted serializations through it would count renders, not skips, and would pass
            // with the gate deleted. (Measured: it read 2 where the gate predicts 1.)
            gs.RenderUnforcedForTest();
            Assert.That(gs.WorkCapsSerializedForTest, Is.EqualTo(primed),
                "an unchanged payload must not be rebuilt and re-serialized");

            FirstLiving(host).SetSkill(WorkType.Repair, 4);
            gs.RenderUnforcedForTest();
            Assert.That(gs.WorkCapsSerializedForTest, Is.EqualTo(primed + 1),
                "a skill change must re-serialize exactly once — a gate keyed on the row COUNT alone " +
                "would freeze this channel for ever, because no row's EXISTENCE ever changes");

            gs.RenderUnforcedForTest();
            Assert.That(gs.WorkCapsSerializedForTest, Is.EqualTo(primed + 1), "…and then go quiet again");
        }

        /// <summary>Losing a crew member shortens the list — the count leg of the key, blinded from the
        /// field legs above because a prefix-only loop passes all of those.</summary>
        [Test]
        public void TheGate_FiresWhenACrewMemberIsLost()
        {
            var (gs, host) = Boot(ShipChoice.Grid);
            gs.RenderForTest();                        // prime (forced)
            int primed = gs.WorkCapsSerializedForTest;

            var living = host.Sim.Citizens.Items.Where(c => !c.Dead).ToList();
            Assert.That(living.Count, Is.GreaterThanOrEqualTo(2), "precondition: at least two living crew");
            living[living.Count - 1].Dead = true;   // the LAST row, so a prefix-only loop sees nothing

            gs.RenderUnforcedForTest();                // UNFORCED — the gate must be the thing deciding
            Assert.That(gs.WorkCapsSerializedForTest, Is.EqualTo(primed + 1),
                "a lost crew member removes the LAST row and every surviving row is untouched — the " +
                "count must be part of the key or this change is never re-sent");
        }

        // ═══════════════════════════════ 8. serializer shape + culture

        /// <summary>The payload's exact shape, InvariantCulture, one line, no whitespace — the house
        /// wire style. ⚠️ The dev machine is de-DE; a number formatted with the ambient culture is a
        /// live bug class in this repo, including in test harnesses.</summary>
        [Test]
        public void TheSerializer_EmitsTheHouseShape_InInvariantCulture()
        {
            Assert.That(WireFormat.WorkCaps(null), Is.EqualTo("{\"type\":\"workcaps\",\"cells\":[]}"),
                "a null list is an EMPTY channel, never a throw on the render path");
            Assert.That(WireFormat.WorkCaps(new List<WireFormat.WorkCapsCell>()),
                Is.EqualTo("{\"type\":\"workcaps\",\"cells\":[]}"));
            Assert.That(WireFormat.WorkCaps(new List<WireFormat.WorkCapsCell>
                {
                    new WireFormat.WorkCapsCell(7, 1, 2, 3, 4, 5, 6, 33),
                    new WireFormat.WorkCapsCell(8, 0, 0, 0, 0, 0, 0, 0),
                }),
                Is.EqualTo("{\"type\":\"workcaps\",\"cells\":[[7,1,2,3,4,5,6,33],[8,0,0,0,0,0,0,0]]}"),
                "order is the CALLER's (citizen store order) and the serializer sorts nothing");
        }

        // ═══════════════════════════════ 9. pin-neutrality's in-suite half

        /// <summary>Building and serializing this channel is a READ. It never moves
        /// <c>StateHash</c> — the package's pin move is the sim-side fold of the widened array, and
        /// this file is no part of it.</summary>
        [Test]
        public void TheChannelIsViewOnly_AndNeverMovesTheStateHash()
        {
            var (gs, host) = Boot();
            ulong before = host.Sim.StateHash();
            for (int i = 0; i < 5; i++) { gs.RenderForTest(); _ = gs.Snapshot(); }
            Assert.That(host.Sim.StateHash(), Is.EqualTo(before),
                "rendering the workcaps channel moved the state hash — it is a projection, not a system");
        }
    }
}
