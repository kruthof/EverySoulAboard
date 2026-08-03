using System.Collections.Generic;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Chronicle v1 (WS-NARRATIVE N4): the pure, deterministic renderer over
    /// HistorySystem.Entries → per-day log. Covers the golden text for a scripted multi-day
    /// sequence, exact day-boundary math, empty→empty, headline severity ordering,
    /// twin-render determinism, InvariantCulture day formatting, and the hash-exempt
    /// ProseOverride pass-through.
    /// </summary>
    public class ChronicleTests
    {
        private const long TPD = SimClockUtil.TicksPerDay;

        private static HistoryEntry E(long tick, string text, HistoryKind kind, uint a = 0, uint b = 0)
            => new HistoryEntry(tick, text, (byte)kind, a, b);

        // ------------------------------------------------------------------ golden sequence

        [Test]
        public void ScriptedThreeDaySequenceRendersGoldenText()
        {
            // A scripted arc across three sim days: an alarm, then an argument, then a death
            // and a construction on the same final day.
            var entries = new List<HistoryEntry>
            {
                E(100, "reactor: OVERHEAT", HistoryKind.Alarm),
                E(1 * TPD + 200, "Ada and Bo argued.", HistoryKind.Argument, 5, 9),
                E(2 * TPD + 50, "Vega has died.", HistoryKind.Death, 7),
                E(2 * TPD + 900, "Ada finished a construction.", HistoryKind.ConstructionCompleted, 5),
            };

            var days = Chronicle.Render(entries);

            Assert.That(days.Count, Is.EqualTo(3));

            Assert.That(days[0].Day, Is.EqualTo(0));
            Assert.That(days[0].Headline, Is.EqualTo("Day 0 — reactor: OVERHEAT"));
            Assert.That(days[0].Lines, Is.EqualTo(new[] { "[Alarm] reactor: OVERHEAT" }));

            Assert.That(days[1].Day, Is.EqualTo(1));
            Assert.That(days[1].Headline, Is.EqualTo("Day 1 — Ada and Bo argued."));
            Assert.That(days[1].Lines, Is.EqualTo(new[] { "[Argument] Ada and Bo argued." }));

            Assert.That(days[2].Day, Is.EqualTo(2));
            // Death (severity 7) beats Construction (6) for the headline.
            Assert.That(days[2].Headline, Is.EqualTo("Day 2 — Vega has died."));
            Assert.That(days[2].Lines, Is.EqualTo(new[]
            {
                "[Death] Vega has died.",
                "[Construction] Ada finished a construction.",
            }));
        }

        [Test]
        public void RenderFromHistorySystemMatchesRawEntryOverload()
        {
            var h = new HistorySystem();
            h.Entries.Add(E(10, "reactor: OVERHEAT", HistoryKind.Alarm));
            h.Entries.Add(E(TPD + 5, "Vega has died.", HistoryKind.Death, 7));

            var viaSystem = Chronicle.Render(h);
            var viaList = Chronicle.Render(h.Entries);

            Assert.That(viaSystem.Count, Is.EqualTo(viaList.Count));
            for (int i = 0; i < viaSystem.Count; i++)
            {
                Assert.That(viaSystem[i].Headline, Is.EqualTo(viaList[i].Headline));
                Assert.That(viaSystem[i].Lines, Is.EqualTo(viaList[i].Lines));
            }
        }

        // ------------------------------------------------------------------ day boundaries

        [Test]
        public void DayBoundaryMathIsExact()
        {
            // The last tick of day 0 and the first tick of day 1 must split into two days.
            var days = Chronicle.Render(new List<HistoryEntry>
            {
                E(TPD - 1, "end of day zero", HistoryKind.Generic),
                E(TPD, "start of day one", HistoryKind.Generic),
            });

            Assert.That(days.Count, Is.EqualTo(2));
            Assert.That(days[0].Day, Is.EqualTo(0));
            Assert.That(days[1].Day, Is.EqualTo(1));
            Assert.That(Chronicle.DayOf(TPD - 1), Is.EqualTo(0));
            Assert.That(Chronicle.DayOf(TPD), Is.EqualTo(1));
        }

        [Test]
        public void MultipleEntriesSameDayCollapseToOneDayInOrder()
        {
            var days = Chronicle.Render(new List<HistoryEntry>
            {
                E(100, "first", HistoryKind.Generic),
                E(200, "second", HistoryKind.Generic),
                E(300, "third", HistoryKind.Generic),
            });

            Assert.That(days.Count, Is.EqualTo(1));
            Assert.That(days[0].Lines, Is.EqualTo(new[] { "[Note] first", "[Note] second", "[Note] third" }));
        }

        // ------------------------------------------------------------------ empty

        [Test]
        public void EmptyHistoryRendersEmptyList()
        {
            Assert.That(Chronicle.Render(new List<HistoryEntry>()).Count, Is.EqualTo(0));
            Assert.That(Chronicle.Render(new HistorySystem()).Count, Is.EqualTo(0));
            Assert.That(Chronicle.Render((HistorySystem)null).Count, Is.EqualTo(0));
        }

        // ------------------------------------------------------------------ headline severity

        [Test]
        public void HeadlineIsMostSevereRegardlessOfOrder()
        {
            // Construction appears FIRST, death SECOND — the headline must still be the death.
            var days = Chronicle.Render(new List<HistoryEntry>
            {
                E(10, "Ada finished a construction.", HistoryKind.ConstructionCompleted, 5),
                E(20, "Vega has died.", HistoryKind.Death, 7),
                E(30, "reactor: OVERHEAT", HistoryKind.Alarm),
            });

            Assert.That(days.Count, Is.EqualTo(1));
            Assert.That(days[0].Headline, Is.EqualTo("Day 0 — Vega has died."));
        }

        [Test]
        public void SeverityLadderPicksTheHigherTierForEachPairing()
        {
            // ⭐⭐ D1/D6 EXTENDED THIS LADDER AT BOTH ENDS, and the new rungs are checked FIRST
            // because they are the ones nothing pinned. Five kinds had no Severity row at all until
            // 2026-08-02 — EmergencyThaw and RunEnded had been rendering as "[Note]" at severity 0
            // since M3-5 (filed at MECHANICS §13.35), and the three D1 kinds are new. A kind with no
            // row can never headline a day, which for the ENDING is the worst possible outcome.
            //
            // THE TOP OF THE LADDER AS SHIPPED: RunEnded 12 > EmergencyThaw 11 > Eulogy 9 >
            // Death 8 > Thaw 7 > the work tier 6. Each pairing is asserted against its immediate
            // neighbour, so a future reshuffle cannot slide one past another unnoticed.
            // ⚠️ An earlier draft of this comment (and of the code) read
            // "RunEnded > EmergencyThaw > Thaw > Eulogy" — the ordinary Thaw ABOVE both death rows.
            // That was corrected under the RimWorld-analogue rule; see the Thaw pairings below.
            AssertHeadlineText("Every soul aboard is dead.",
                E(10, "Every soul aboard is dead.", HistoryKind.RunEnded),
                E(20, "With Vega dead, the ship woke Ozawa.", HistoryKind.EmergencyThaw));
            AssertHeadlineText("With Vega dead, the ship woke Ozawa.",
                E(10, "With Vega dead, the ship woke Ozawa.", HistoryKind.EmergencyThaw),
                E(20, "Bo spoke for Vega.", HistoryKind.Eulogy));
            // ⛔ AND THE ORDINARY THAW SITS BELOW BOTH DEATH ROWS — RimWorld's own classing
            // (`rimworld-reference.md` §14.3: "wanderer joins" is a GOOD/NEUTRAL event beside cargo
            // pods and traders, while a raid is a big threat; §11.3's gold-vs-red letter colours say
            // the same). A day holding a death AND a wake is remembered as the day somebody died.
            // Owner-directed 2026-08-02 after review; an earlier draft ranked Thaw above both.
            AssertHeadlineText("Bo spoke for Vega.",
                E(10, "Bo spoke for Vega.", HistoryKind.Eulogy),
                E(20, "Mbeki came out of cryosleep — awake, and awaiting orders.", HistoryKind.Thaw));
            AssertHeadlineText("Vega has died.",
                E(10, "Vega has died.", HistoryKind.Death),
                E(20, "Mbeki came out of cryosleep — awake, and awaiting orders.", HistoryKind.Thaw));
            // …but still ABOVE the work tier: a soul waking is not a wall going up.
            AssertHeadlineText("Mbeki came out of cryosleep — awake, and awaiting orders.",
                E(10, "Mbeki came out of cryosleep — awake, and awaiting orders.", HistoryKind.Thaw),
                E(20, "Okafor serviced the scrubber (scrub_a).", HistoryKind.RepairCompleted));
            // …and the work tier: repair and commission rank WITH build (a four-way tie resolved to
            // the earliest entry), and both must out-rank a brownout — the brownout is usually what
            // the repair was for.
            AssertHeadlineText("Vega has died.",
                E(10, "Vega has died.", HistoryKind.Death),
                E(20, "Okafor serviced the scrubber (scrub_a).", HistoryKind.RepairCompleted));
            AssertHeadlineText("Okafor serviced the scrubber (scrub_a).",
                E(10, "Okafor serviced the scrubber (scrub_a).", HistoryKind.RepairCompleted),
                E(20, "Power network 1 browned out — non-critical loads shed.", HistoryKind.Brownout));
            AssertHeadlineText("A controller module was fitted to the reclaimer (recl_b) — it answers MOSS now.",
                E(10, "A controller module was fitted to the reclaimer (recl_b) — it answers MOSS now.",
                  HistoryKind.DeviceCommissioned),
                E(20, "Power network 1 browned out — non-critical loads shed.", HistoryKind.Brownout));

            // Spot-check the documented ladder Death>Construction>Brownout>Argument>Alarm>Goal>Generic.
            AssertHeadlineText("A crew member has died.",
                E(10, "A crew member has died.", HistoryKind.Death),
                E(20, "Ada finished a construction.", HistoryKind.ConstructionCompleted));
            AssertHeadlineText("Ada finished a construction.",
                E(10, "Ada finished a construction.", HistoryKind.ConstructionCompleted),
                E(20, "Power network 3 browned out — non-critical loads shed.", HistoryKind.Brownout));
            AssertHeadlineText("Power network 3 browned out.",
                E(10, "Power network 3 browned out.", HistoryKind.Brownout),
                E(20, "Ada and Bo argued.", HistoryKind.Argument));
            AssertHeadlineText("Ada and Bo argued.",
                E(10, "Ada and Bo argued.", HistoryKind.Argument),
                E(20, "reactor: OVERHEAT", HistoryKind.Alarm));
            AssertHeadlineText("reactor: OVERHEAT",
                E(10, "reactor: OVERHEAT", HistoryKind.Alarm),
                E(20, "Objective complete: Restore power", HistoryKind.Goal));
            AssertHeadlineText("Objective complete: Restore power",
                E(10, "Objective complete: Restore power", HistoryKind.Goal),
                E(20, "something happened", HistoryKind.Generic));
        }

        /// <summary>
        /// ⭐⭐ <b>SWEEP THE CLASS, NOT THE LIST.</b> Every declared <see cref="HistoryKind"/> except
        /// <see cref="HistoryKind.Generic"/> must have a row in BOTH of <c>Chronicle</c>'s switches:
        /// a label of its own, and a severity above Generic's floor so it can headline a day.
        ///
        /// <para><b>THIS IS NOT A HYPOTHETICAL GUARD — IT HAS TWO REAL INSTANCES.</b>
        /// <see cref="HistoryKind.EmergencyThaw"/> and <see cref="HistoryKind.RunEnded"/> shipped in
        /// M3-5 with rows in NEITHER switch, so the most severe line a run can produce rendered as
        /// "[Note]" and lost its headline to a eulogy (filed at MECHANICS §13.35, fixed 2026-08-02
        /// alongside D1's three new kinds). The defect is structurally invisible: a missing case
        /// falls through the <c>_ =&gt; </c> arm and nothing fails. Appending a member and forgetting
        /// the renderer is a two-line mistake that no other test in the repo can see.</para>
        ///
        /// <para>Driven through the public <see cref="Chronicle.Render"/> — the switches are private,
        /// and reflecting into them would pin the implementation instead of the output.</para>
        /// </summary>
        [Test]
        public void EveryHistoryKindHasBothALabelAndASeverityRow()
        {
            var unlabelled = new List<string>();
            var unranked = new List<string>();

            foreach (HistoryKind kind in System.Enum.GetValues(typeof(HistoryKind)))
            {
                if (kind == HistoryKind.Generic) continue; // "[Note]" at 0 IS Generic's row

                var solo = Chronicle.Render(new List<HistoryEntry> { E(10, "x", kind) });
                if (solo[0].Lines[0].StartsWith("[Note] ", System.StringComparison.Ordinal))
                    unlabelled.Add(kind.ToString());

                // Severity: paired against a Generic entry that comes FIRST. The strict '>' in
                // Render keeps the earliest on a tie, so a kind sitting at Generic's 0 loses the
                // headline to it — which is exactly the failure this catches.
                var paired = Chronicle.Render(new List<HistoryEntry>
                {
                    E(10, "generic first", HistoryKind.Generic),
                    E(20, "the real event", kind),
                });
                if (paired[0].Headline != "Day 0 — the real event") unranked.Add(kind.ToString());
            }

            Assert.Multiple(() =>
            {
                Assert.That(unlabelled, Is.Empty,
                    "these kinds render as [Note] — add a Chronicle.Label row in the SAME commit as " +
                    "the enum member: " + string.Join(", ", unlabelled));
                Assert.That(unranked, Is.Empty,
                    "these kinds cannot out-rank a Generic note and so can never headline a day — " +
                    "add a Chronicle.Severity row: " + string.Join(", ", unranked));
            });
        }

        private static void AssertHeadlineText(string expectedText, params HistoryEntry[] entries)
        {
            var days = Chronicle.Render(new List<HistoryEntry>(entries));
            Assert.That(days[0].Headline, Is.EqualTo("Day 0 — " + expectedText));
        }

        [Test]
        public void EulogyOutranksTheDeathLineForTheHeadline()
        {
            // On a death day both the bare death line and the friend's eulogy are present;
            // the eulogy (severity 8) becomes the headline (N5), and both render as lines.
            var days = Chronicle.Render(new List<HistoryEntry>
            {
                E(20, "Vega has died.", HistoryKind.Death, 7),
                E(21, "Bo spoke for Vega. \"Grew closer to Vega.\"", HistoryKind.Eulogy, 7, 9),
            });

            Assert.That(days.Count, Is.EqualTo(1));
            Assert.That(days[0].Headline, Is.EqualTo("Day 0 — Bo spoke for Vega. \"Grew closer to Vega.\""));
            Assert.That(days[0].Lines, Is.EqualTo(new[]
            {
                "[Death] Vega has died.",
                "[Eulogy] Bo spoke for Vega. \"Grew closer to Vega.\"",
            }));
        }

        // ------------------------------------------------------------------ determinism

        [Test]
        public void TwinRendersAreByteEqual()
        {
            var entries = new List<HistoryEntry>
            {
                E(100, "reactor: OVERHEAT", HistoryKind.Alarm),
                E(TPD + 10, "Ada and Bo grew closer.", HistoryKind.Bond, 5, 9),
                E(2 * TPD + 5, "Vega has died.", HistoryKind.Death, 7),
            };

            var a = Chronicle.Render(entries);
            var b = Chronicle.Render(entries);

            Assert.That(a.Count, Is.EqualTo(b.Count));
            for (int i = 0; i < a.Count; i++)
            {
                Assert.That(a[i].Day, Is.EqualTo(b[i].Day));
                Assert.That(a[i].Headline, Is.EqualTo(b[i].Headline));
                Assert.That(a[i].Lines, Is.EqualTo(b[i].Lines));
            }
        }

        // ------------------------------------------------------------------ culture

        /// <summary>
        /// ⚠️ RETRACTED IN PLACE. THIS WAS NAMED <c>DayNumberFormatsUnderInvariantCulture</c> AND ITS
        /// COMMENT TAUGHT A FALSE FACT ABOUT .NET — which is worse than the dead guard itself,
        /// because a wrong explanation is how this idiom keeps propagating (<c>docs/HANDOVER.md</c>
        /// §4k: "correct-looking code with a wrong explanation of itself, where the explanation is
        /// the thing that hides the bug"). The comment said:
        ///
        ///   *"On a de-DE machine a naive ToString() would render "1.234"; InvariantCulture must
        ///   not."*
        ///
        /// IT WOULD NOT. <c>day</c> is an integer and <c>int.ToString()</c> uses the "G" format,
        /// which NEVER emits a group separator under ANY culture; <c>1234.ToString(de-DE)</c> is
        /// <c>"1234"</c>. Only an explicit <c>"N0"</c>/<c>"#,##0"</c> would produce <c>"1.234"</c>,
        /// and <c>Chronicle.Render</c> uses neither. Compounding it, this test NEVER SET
        /// <c>CurrentCulture</c> at all — there is no probe here and no <c>[SetUp]</c> in the suite —
        /// so it asserted, under the ambient culture, a property that holds under every culture.
        ///
        /// ⚠️ AND IT CANNOT BE FIXED THE WAY ITS SIBLINGS WERE. The one
        /// <see cref="System.Globalization.NumberFormatInfo"/> knob that reaches a bare "G" integer
        /// is <c>NegativeSign</c>, and a chronicle day number is non-negative by construction. So
        /// dropping the <c>InvariantCulture</c> argument at <c>Chronicle.cs:91</c> is an EQUIVALENT
        /// MUTANT — provably unkillable, not untested code — and it is recorded as such rather than
        /// dressed up as a guard. VERIFIED: that mutation was physically applied and this whole file
        /// stayed GREEN (11 passed, 0 failed).
        ///
        /// WHAT SURVIVES, AND IT IS REAL: the HEADLINE FORMAT. The day number, the separator and the
        /// headline text must compose to exactly <c>"Day N — text"</c>, with plain ASCII digits and
        /// no thousands punctuation of any kind. That is what the assertions below actually measure,
        /// and the test is renamed to say so.
        ///
        /// MUTATION: change <c>Chronicle.cs:91</c>'s format to <c>day.ToString("N0", Ic)</c>, or
        /// change the em-dash separator ⇒ this fails. MUTATION 2: drop the <c>InvariantCulture</c>
        /// argument ⇒ GREEN, by construction, as argued above.
        /// </summary>
        [Test]
        public void DayNumberFormatsAsPlainAsciiWithNoThousandsSeparator()
        {
            var days = Chronicle.Render(new List<HistoryEntry>
            {
                E(1234 * TPD + 7, "the ship endures", HistoryKind.Generic),
            });

            Assert.That(days[0].Day, Is.EqualTo(1234));
            Assert.That(days[0].Headline, Is.EqualTo("Day 1234 — the ship endures"));
            Assert.That(days[0].Headline, Does.Not.Contain("1.234"));
            Assert.That(days[0].Headline, Does.Not.Contain("1,234"));
        }

        // ------------------------------------------------------------------ prose override

        [Test]
        public void ProseOverridePassesThroughWithoutTouchingTemplate()
        {
            var days = Chronicle.Render(new List<HistoryEntry>
            {
                E(10, "Vega has died.", HistoryKind.Death, 7),
            });

            var day = days[0];
            Assert.That(day.ProseOverride, Is.Null, "default is null");
            Assert.That(day.Display, Is.EqualTo(day.Headline), "no override → Display is the template headline");

            day.ProseOverride = "On the fourth watch, the ship kept a silence for Vega.";
            Assert.That(day.Display, Is.EqualTo("On the fourth watch, the ship kept a silence for Vega."));
            Assert.That(day.Headline, Is.EqualTo("Day 0 — Vega has died."), "the template headline is untouched");
        }
    }
}
