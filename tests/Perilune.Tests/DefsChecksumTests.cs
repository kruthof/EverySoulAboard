using System.Collections.Generic;
using System.Globalization;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>The checksum folds VALUES, not formatting: comments, whitespace and
    /// table-row order never change it; a single value edit always does.</summary>
    public class DefsChecksumTests
    {
        private static SimDefs Parse(string text)
        {
            var problems = new List<string>();
            var d = DefsParser.Parse(new[] { ("t.def", text) }, problems);
            Assert.That(problems, Is.Empty, "unexpected parse problems: " + string.Join(" | ", problems));
            return d;
        }

        [Test]
        public void CreateDefaultChecksum_MatchesFrozenDefault()
        {
            Assert.That(SimDefs.CreateDefault().Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        /// <summary>
        /// THE FOURTH DETERMINISM PIN — `SimDefs.Default.Checksum`, pinned to a literal.
        ///
        /// This assertion did not exist until 2026-07-25 and its absence was a real hole. `CLAUDE.md`
        /// and every recent handover describe FOUR pins, but only three were gate-enforced: the
        /// scenario hash (`ci.sh:31`) and the two golden hash files
        /// (`Golden/perilune_tick3000_hash.txt`, `Golden/slice_tick3000_hash.txt`). The defs value
        /// was a *printed* number that lanes copied into prose. The only checksum assertion in this
        /// file was <see cref="CreateDefaultChecksum_MatchesFrozenDefault"/>, which compares the
        /// defaults to themselves — internal consistency, not a frozen value. Every "all four pins
        /// byte-identical" claim before this commit rested on eyeballing a console line.
        ///
        /// ⚠ WHICH CHECKSUM THIS IS — the distinction that has bitten this project repeatedly.
        /// `SimDefs.Default.Checksum` is `CreateDefault()`'s value: the COMPILED-IN defaults, with
        /// `Rules == null`, folding NO designer rules (`SimDefs.cs:686`, `:913-919`).
        /// It is **NOT** the scenario host's `defs:` print (`hosts/scenario/Program.cs:50`), which
        /// parses `content/core/SimDefs/*.def` **plus** `rules/*.moss` and folds each rule's
        /// name+source bytes into the same field — a different, larger value
        /// (`3f23ce5bd40283c8` at the time of writing). The two are not interchangeable and the
        /// difference is exactly the shipped rules. `CLAUDE.md` calls this out too; this test's name
        /// says `SimDefsDefault` so the two can never be confused in a failure report again.
        ///
        /// The shipped `.def` files are asserted to REPRODUCE this same value by
        /// `DefsEquivalenceTests.ShippedDefs_Parse_ZeroProblems_ChecksumEqualsDefault`, so pinning
        /// the compiled default pins the shipped content too, without this test doing any file IO.
        ///
        /// A MOVE HERE IS EXPECTED, NOT A FAILURE. Adding or retuning a def field is *supposed* to
        /// change this number — E0-2 moved it `60147a5…`→`e56d33a2…`, E0-5 `e56d33a2…`→`5a471d12…`.
        /// The ritual, per `CLAUDE.md` ("Def field ships in ONE commit"), is: default +
        /// `CreateDefault` initialiser + parser key + checksum fold (appended at the TAIL of
        /// `ComputeChecksum`, per `SimDefs.cs:699-701` — the fold order is append-only) +
        /// equivalence coverage in `DefsEquivalenceTests` + the `.def` line, ALL IN ONE COMMIT.
        /// Then update this literal, `CLAUDE.md`'s "Determinism proof", `MECHANICS.md` and memory —
        /// also in that commit. What must never happen is this number moving in a commit that did
        /// not intend to touch defs: that means a value drifted, and before this test existed
        /// nothing would have noticed.
        /// </summary>
        [Test]
        public void SimDefsDefaultChecksum_IsPinned_NotTheScenarioHostsRulesInclusiveValue()
        {
            const ulong Pinned = 0x5A471D12643B64F9UL; // E0-5 (three def packages); see the doc comment

            Assert.That(SimDefs.Default.Checksum, Is.EqualTo(Pinned),
                "DETERMINISM PIN MOVED: SimDefs.Default.Checksum is " +
                SimDefs.Default.Checksum.ToString("x16", CultureInfo.InvariantCulture) +
                ", pinned at " + Pinned.ToString("x16", CultureInfo.InvariantCulture) + ".\n" +
                "THIS IS THE COMPILED-IN DEFAULTS value (CreateDefault, Rules == null). It is NOT\n" +
                "  the scenario host's `defs:` print, which additionally folds content/core/SimDefs/\n" +
                "  rules/*.moss and is a different number. Do not paste that one here.\n" +
                "IF YOU CHANGED A DEF: expected — that is what a def change does. Per CLAUDE.md a def\n" +
                "  field ships in ONE commit: default + CreateDefault initialiser + parser key +\n" +
                "  checksum fold appended at the TAIL of ComputeChecksum (the fold order is\n" +
                "  append-only, SimDefs.cs:699-701) + DefsEquivalenceTests coverage + the .def line.\n" +
                "  Update this literal, CLAUDE.md's 'Determinism proof', MECHANICS.md and memory in\n" +
                "  the SAME commit, and say the old→new value in the commit message.\n" +
                "IF YOU DID NOT TOUCH DEFS: stop. A tuning value drifted, or a fold was inserted in\n" +
                "  the middle of ComputeChecksum instead of appended at the tail (which silently\n" +
                "  invalidates every recorded checksum in the repo's history). Find it before\n" +
                "  re-pinning — this is the exact class of drift this assertion was added to catch.");
        }

        [Test]
        public void CommentAndWhitespaceEdits_DoNotChangeChecksum()
        {
            var bare = Parse("[thermal]\ncitizen_heat_w = 125\n");
            var decorated = Parse(
                "# heat tuning\n" +
                "\n" +
                "[thermal]\n" +
                "   citizen_heat_w    =    125     # per-citizen watts\n" +
                "\n");
            Assert.That(decorated.Checksum, Is.EqualTo(bare.Checksum));
        }

        [Test]
        public void MachineRowOrder_DoesNotChangeChecksum()
        {
            var orderA = Parse(
                "[machines]\n" +
                "SolarWing 0 8 Comfort false 0 0.004 0.4 0.1\n" +
                "Fabricator 3 0 Industry false 2.5 0.02 0.4 0.1\n");
            var orderB = Parse(
                "[machines]\n" +
                "Fabricator 3 0 Industry false 2.5 0.02 0.4 0.1\n" +
                "SolarWing 0 8 Comfort false 0 0.004 0.4 0.1\n");
            Assert.That(orderB.Checksum, Is.EqualTo(orderA.Checksum));
        }

        [Test]
        public void SingleValueEdit_ChangesChecksum()
        {
            var a = Parse("[thermal]\ncitizen_heat_w = 100\n"); // default value
            var b = Parse("[thermal]\ncitizen_heat_w = 101\n");
            Assert.That(a.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
            Assert.That(b.Checksum, Is.Not.EqualTo(a.Checksum));
        }

        [Test]
        public void MachineValueEdit_ChangesChecksum()
        {
            var b = Parse("[machines]\nSolarWing 0 7 Comfort false 0 0.004 0.4 0.1\n");
            Assert.That(b.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));
        }
    }
}
