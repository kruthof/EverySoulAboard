using System.Linq;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M4-9 — HOW SHE IS: the SENTENCE the Persona window's fifth band draws, pinned WHERE IT
    /// IS COMPOSED.</b>
    ///
    /// <para>⛔ <b>WHY THIS FILE EXISTS: THE SENTENCE HAD NO TEST ANYWHERE.</b> Independent review
    /// found `persona-view.test.js` hand-writes the string into its fixture, `WebRosterBuildTests`
    /// hand-writes it into its expectation, and `persona-shot.mjs` sees only the boot state — so
    /// every assertion in the package was about a string a TEST wrote, and
    /// <c>GameSession.HowSheIs</c> itself could have produced anything at all. This is the only leg
    /// that reads the composer.</para>
    ///
    /// <para><b>THE CLAIM UNDER TEST IS NOT "the words are nice".</b> It is M4-1 DESIGN QUESTION
    /// (e)'s sequencing rule, mechanised: <i>"a state line that stops after the adjective is a
    /// COSMETIC OPERATOR"</i> (<c>TARGET.md:65</c>, <c>:69</c>). Every leg below asserts that the
    /// sentence has a SECOND CLAUSE and that the second clause CHANGES with the thing it describes.
    /// A composer that returned the same tail for a whole and a broken crew member would satisfy
    /// every other test in this package and ship the exact thing OD-R's amendment forbids.</para>
    ///
    /// <para>⛔ <b>AND NO NUMBER FROM THE MOOD FORMULA MAY APPEAR.</b> The one figure the sentence is
    /// allowed to carry is a DURATION in sim-hours — a fact about the clock, not a meter. The last
    /// leg scans for the rest.</para>
    /// </summary>
    [TestFixture]
    public class HowSheIsTests
    {
        /// <summary>The SHIPPING game — <c>--ship wreck</c> is what <c>./play.sh</c> opens, so the
        /// sentences pinned here are the ones a player actually reads. Not started ⇒ no sim thread;
        /// the citizen is posed by hand and the composer is called directly.</summary>
        private static (GameSession Gs, Citizen C, SimDefs Defs) Wreck()
        {
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, _ => { });
            return (gs, host.Sim.Citizens.Items.First(x => !x.Dead), host.Sim.Defs);
        }

        /// <summary>A crew member with nothing wrong with her: every need at zero, not broken,
        /// nothing accumulated. The baseline every leg differs from by ONE field.</summary>
        private static Citizen Whole(Citizen c)
        {
            c.Hunger = 0f; c.Thirst = 0f; c.Fatigue = 0f; c.Suffocation = 0f;
            c.BreakTier = BreakTier.None; c.BreakDwell = 0; c.BreakEndsAtTick = 0;
            return c;
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 1. THE FIRST CLAUSE — the adjectives, and every band edge is a gate the SIM already uses
        // ═══════════════════════════════════════════════════════════════════════════════════════

        [Test]
        public void NothingWrong_ReadsSteady_AndStillSaysWhatItMeans()
        {
            var (gs, c, defs) = Wreck();
            string s = gs.HowSheIs(Whole(c));
            Assert.That(s, Does.StartWith("Steady."),
                "a crew member with every need at zero is Steady — not silent, and not a number");
            Assert.That(s, Does.Contain("She will take any work she is capable of."),
                "⛔ AND THE SECOND CLAUSE IS STILL THERE. An empty tail on the healthy case is the "
                + "cosmetic-operator failure arriving through the back door: the band would be an "
                + "adjective for everybody who is not broken, which is almost everybody.");
        }

        /// <summary>
        /// ⭐ THE ADJECTIVE BANDS ARE THE SIM'S OWN THRESHOLDS, not invented cut-points:
        /// <c>sustenance.need_threshold</c> (0.5) is where <c>SustenanceSystem</c> sends her to eat
        /// or drink, and <c>needs.fatigue_rest_threshold</c> (0.75) is where <c>RestSystem</c> sends
        /// her to bed. Each word therefore marks a REAL transition in her behaviour. Driven from the
        /// defs so a retune moves the words with the mechanism.
        /// </summary>
        [Test]
        public void TheAdjectiveBands_AreTheSimsOwnServiceThresholds()
        {
            var (gs, c, defs) = Wreck();
            float serve = defs.Sustenance.NeedThreshold;
            float bed = defs.Needs.FatigueRestThreshold;

            Whole(c); c.Hunger = serve - 0.01f;
            Assert.That(gs.HowSheIs(c), Does.StartWith("Steady."),
                "just below the serve threshold she is not yet hungry — the word marks the gate");
            Whole(c); c.Hunger = serve;
            Assert.That(gs.HowSheIs(c), Does.StartWith("Hungry."),
                "and AT it she is, because that is the value at which the sim sends her to eat");

            Whole(c); c.Thirst = serve;
            Assert.That(gs.HowSheIs(c), Does.StartWith("Thirsty."));
            Whole(c); c.Fatigue = bed - 0.01f;
            Assert.That(gs.HowSheIs(c), Does.StartWith("Steady."));
            Whole(c); c.Fatigue = bed;
            Assert.That(gs.HowSheIs(c), Does.StartWith("Badly short of sleep."));

            // The severe band is this file's own (0.85) and is declared as such — nothing in the sim
            // changes there, it is the word for "well past it".
            Whole(c); c.Hunger = 0.9f;
            Assert.That(gs.HowSheIs(c), Does.StartWith("Starving."));
            Whole(c); c.Thirst = 0.9f;
            Assert.That(gs.HowSheIs(c), Does.StartWith("Parched."));
            Whole(c); c.Fatigue = 0.9f;
            Assert.That(gs.HowSheIs(c), Does.StartWith("Exhausted."));
        }

        /// <summary>Several things wrong at once read as one sentence, worst-track first, and
        /// suffocation leads because it is the one that kills in minutes.</summary>
        [Test]
        public void SeveralThingsWrong_ReadAsOneSentence_WithTheKillingOneFirst()
        {
            var (gs, c, defs) = Wreck();
            Whole(c); c.Suffocation = 0.4f; c.Hunger = 0.9f; c.Thirst = 0.6f;
            string s = gs.HowSheIs(c);
            Assert.That(s, Does.StartWith("Struggling to breathe, starving and thirsty."),
                "one sentence, not three; and the 90-second track is named before the two-day one");
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 2. THE SECOND CLAUSE — one per tier, and it must MOVE
        // ═══════════════════════════════════════════════════════════════════════════════════════

        [TestCase(BreakTier.Minor, "unbreathable air")]
        [TestCase(BreakTier.Major, "stopped working")]
        [TestCase(BreakTier.Extreme, "withdrawn")]
        public void EachTier_SaysWhatSheWillRefuse(BreakTier tier, string mustSay)
        {
            var (gs, c, defs) = Wreck();
            Whole(c);
            c.BreakTier = tier;
            string s = gs.HowSheIs(c);
            Assert.That(s, Does.Contain(mustSay),
                "the " + tier + " sentence must name the thing the player can ACT on. `TARGET.md:66-69` "
                + "forbids a misery meter and `:65` a cosmetic operator — a bare adjective is both.");
            Assert.That(s, Does.Not.Contain("She will take any work"),
                "and the healthy tail must be GONE — a band that appended the broken clause to the "
                + "whole one would say two contradictory things and read as neither");
        }

        /// <summary>⭐ THE THREE TIERS SAY THREE DIFFERENT THINGS. Equality-checked as a SET, because
        /// a composer that returned one shared "she is broken" line for all three would pass every
        /// `Does.Contain` above if the shared line happened to hold the substrings.</summary>
        [Test]
        public void TheThreeTierSentences_AreThreeDifferentSentences()
        {
            var (gs, c, defs) = Wreck();
            var seen = new System.Collections.Generic.HashSet<string>();
            foreach (BreakTier t in System.Enum.GetValues(typeof(BreakTier)))
            {
                Whole(c);
                c.BreakTier = t;
                Assert.That(seen.Add(gs.HowSheIs(c)), Is.True,
                    "tier " + t + " composes a sentence some other tier already composed — the band "
                    + "cannot tell the player which of her verbs just stopped working");
            }
            Assert.That(seen, Has.Count.EqualTo(4), "None + three tiers");
        }

        /// <summary>
        /// ⭐⭐ <b>THE ARMING CLAUSE, AND IT IS THE ONE THE BAND'S HONESTY RESTS ON.</b> Before she
        /// breaks, the counter is real hashed state and the band says how long she has been in the
        /// band a break grows in — which is what makes it a WARNING the player can act on rather
        /// than an epitaph delivered afterwards.
        ///
        /// <para>⚠️ The figure is ELAPSED time, never a forecast: a prediction would have to assume
        /// the mood stays down, and the measured sawtooth (MECHANICS §13.51) says it will not.</para>
        /// </summary>
        [Test]
        public void TheArmingClause_ReportsElapsedTimeFromTheCounterItself()
        {
            var (gs, c, defs) = Wreck();
            Whole(c);
            // 3.0 sim-hours of dwell: 3 h x 3600 s x 10 ticks x 4 units.
            c.BreakDwell = (uint)(3 * 3600 * Simulation.TicksPerSecond * MentalBreak.DwellRisePerTick);
            string s = gs.HowSheIs(c);
            Assert.That(s, Does.Contain("end of her rope for 3.0 h"),
                "the counter is denominated in ticks x " + MentalBreak.DwellRisePerTick + ", and the "
                + "band reports the sim-hours it represents");
            Assert.That(s, Does.Not.Contain("She will take any work"),
                "an ARMING crew member is not a steady one — the two clauses are alternatives");

            // …and it really is read off the counter, not a constant.
            c.BreakDwell = (uint)(6 * 3600 * Simulation.TicksPerSecond * MentalBreak.DwellRisePerTick);
            Assert.That(gs.HowSheIs(c), Does.Contain("6.0 h"), "the figure tracks the counter");

            // …and a BROKEN crew member reports the break, not the counter that produced it.
            c.BreakTier = BreakTier.Major;
            Assert.That(gs.HowSheIs(c), Does.Not.Contain("end of her rope"),
                "once she has broken, the band says what she is refusing — the arming clause is over");
        }

        // ═══════════════════════════════════════════════════════════════════════════════════════
        // 3. ⛔ NO METER, AT THE SEAM THAT COULD BUILD ONE
        // ═══════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⛔ <b>NOT ONE NUMBER FROM THE MOOD FORMULA CROSSES THIS SEAM</b> — not the mood, not the
        /// threshold, not a need value, not a percentage. `dossier-honesty.test.js` pins the CLIENT
        /// side of that promise; this is the host side, and it is the side that would have to leak
        /// first. Swept across the whole reachable state space rather than spot-checked.
        /// </summary>
        [Test]
        public void NoNumberFromTheMoodFormulaEverAppearsInTheSentence()
        {
            var (gs, c, defs) = Wreck();
            var offenders = new System.Collections.Generic.List<string>();
            foreach (BreakTier tier in System.Enum.GetValues(typeof(BreakTier)))
                for (int h = 0; h <= 10; h++)
                    for (int f = 0; f <= 10; f += 5)
                    {
                        Whole(c);
                        c.BreakTier = tier;
                        c.Hunger = h / 10f; c.Thirst = (10 - h) / 10f; c.Fatigue = f / 10f;
                        c.Suffocation = h > 8 ? 0.3f : 0f;
                        string s = gs.HowSheIs(c);
                        // The ONLY numeral the sentence may carry is the arming clause's duration,
                        // and this sweep leaves BreakDwell at 0, so there must be none at all.
                        foreach (char ch in s)
                            if (char.IsDigit(ch)) { offenders.Add(tier + "/" + h + "/" + f + ": " + s); break; }
                    }
            Assert.That(offenders, Is.Empty,
                "a digit reached the state line. The host reads mood/hunger/thirst/fatigue and ships "
                + "WORDS precisely so a client cannot draw the bar TARGET.md:66-69 forbids — the only "
                + "figure allowed here is the arming clause's DURATION, which is a fact about the "
                + "clock. First offender: " + (offenders.Count > 0 ? offenders[0] : ""));
        }

        /// <summary>The sentence is never empty and never null: the client HIDES the band on an empty
        /// string, so a composer that returned one would silently delete the exit gate's fourth
        /// clause on a live ship rather than say something honest.</summary>
        [Test]
        public void TheSentenceIsNeverEmpty_ForAnyReachableState()
        {
            var (gs, c, defs) = Wreck();
            foreach (BreakTier tier in System.Enum.GetValues(typeof(BreakTier)))
                for (int i = 0; i <= 10; i++)
                {
                    Whole(c);
                    c.BreakTier = tier;
                    c.Hunger = i / 10f; c.Thirst = i / 10f; c.Fatigue = i / 10f;
                    string s = gs.HowSheIs(c);
                    Assert.That(s, Is.Not.Null.And.Not.Empty, tier + " at " + i);
                    Assert.That(s.Trim(), Does.EndWith("."), "every state line is a sentence: " + s);
                }
        }
    }
}
