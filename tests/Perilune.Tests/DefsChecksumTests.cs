using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Perilune.Dsl;
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
        /// (`bbd76cd7245fcf65` at the time of writing). The two are not interchangeable and the
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
            // ⚠ MEASURED IN THE `lane/e0-7-ice` WORKTREE, NOT ON `main`. E0-7 adds two [water] fields
            // (ice_liters_per_unit, melter_buffer_liters), one [machines] row (IceMelter) and one
            // [production] node (melt_ice), so this value moved from E0-5's 0x5A471D12643B64F9. A
            // SIBLING LANE (E0-6) IS APPENDING TO ComputeChecksum AHEAD OF THIS ONE, so the merged
            // value on `main` will be neither lane's — the integrator re-pins after the merge
            // (ECONOMY-PLAN §2.1 rule 4). Do not treat this literal as authoritative until then.
            // ⚠ MOVED BY THE WRECK START'S W3 (--ship wreck), and by exactly ONE thing: the new
            // [machines] row for DeviceKind.CryoPod. ComputeChecksum folds all eight columns of
            // every Machines row, so appending a kind moves this pin even though no shipped ship
            // has one and nothing about the sim's behaviour changed. No def FIELD was added.
            // ⚠ MOVED BY M3-10 (PIN M3-d, 2026-08-01), 0c5ddbc07e41f07d -> 77a7a8a9e967eab4, and by
            // FOUR things at once — worth spelling out because "one new device kind" sounds like one
            // change and is not:
            //   1. `DeviceKind.Heater = 28` grows Machines by a row — 8 columns through the fold loop;
            //   2. it ALSO grows Recipes, which CreateDefault sizes `new RecipeDef[Machines.Length]`
            //      — 6 more fields, all default, for an entry no crafting will ever use;
            //   3. `HeaterOutputKW`, a new [machines] scalar folded at the tail;
            //   4. `Thermal.HeaterCeilingK`, a new [thermal] scalar folded after it.
            // MEASURED TWICE, on fresh runs: this pin read 77a7a8a9e967eab4 from CreateDefault, and
            // `DefsEquivalenceTests` independently parsed the shipped .def files to the SAME value
            // ("parsed 18 shipped .def files, checksum 77a7a8a9e967eab4"), which is the two-code-path
            // agreement that says the three transcriptions really do match.
            const ulong Pinned = 0x77A7A8A9E967EAB4UL; // M3-10 (PIN M3-d): Heater = 28 + its two def scalars

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

        /// <summary>
        /// THE OTHER CHECKSUM — the SHIPPED-CONTENT, RULES-INCLUSIVE value that the scenario host
        /// prints, pinned deliberately RIGHT NEXT TO its twin so the two can never be confused
        /// again.
        ///
        /// This is the number a human actually sees. `./ci.sh` runs the determinism proof, and
        /// `hosts/scenario/Program.cs:50` prints
        /// <c>defs: bbd76cd7245fcf65 (18 files, 0 problems, 1 rules)</c>. That is the value lanes
        /// copy into handovers — and it is NOT
        /// <see cref="SimDefsDefaultChecksum_IsPinned_NotTheScenarioHostsRulesInclusiveValue"/>'s
        /// `0c5ddbc07e41f07d`, which is the compiled-in defaults with no rules. Pinning only one of
        /// the two left the confusion alive; pinning both, adjacently, with the difference spelled
        /// out, is what ends it.
        ///
        /// WHERE THE DIFFERENCE COMES FROM — exactly one thing: `DefsParser.Parse(files, ruleFiles,
        /// problems)` folds each designer rule's NAME and SOURCE BYTES into the same
        /// `SimDefs.Checksum` field (`SimDefs.cs:913-919`). `CreateDefault()` leaves `Rules` null
        /// and folds nothing, so:
        ///
        ///   SimDefs.Default.Checksum      = 0c5ddbc07e41f07d   compiled-in defaults, no rules
        ///   shipped .def + rules/*.moss   = 09900b9a44119272   what the console prints
        ///   (both MEASURED on the wreck lane after the send-back's CryoPod `maint` change)
        ///
        /// The shipped `.def` files are separately asserted to reproduce the DEFAULTS exactly
        /// (`DefsEquivalenceTests.ShippedDefs_Parse_ZeroProblems_ChecksumEqualsDefault`), so the
        /// whole delta between these two numbers is `content/core/SimDefs/rules/*.moss`.
        ///
        /// This loads defs the way BOTH hosts do — `ScenarioRunner.LoadDefs` and
        /// `SimHost.LoadDefs:243-265` are the same seven lines — so it cannot drift from the
        /// printed value.
        ///
        /// THE DIAGNOSTIC MATRIX — measured 2026-07-25 by mutating each input in turn. Together
        /// with `DefsEquivalenceTests.ShippedDefs_Parse_ZeroProblems_ChecksumEqualsDefault` these
        /// three assertions localise EXACTLY WHERE a change happened, which no single pin can do:
        ///
        ///   what changed                     defaults pin   THIS pin   equivalence
        ///   ────────────────────────────────────────────────────────────────────────
        ///   nothing                          pass           pass       pass
        ///   a compiled default only          FAIL           pass       FAIL
        ///   a shipped .def value only        pass           FAIL       FAIL
        ///   both, consistently (the ritual)  FAIL           FAIL       pass
        ///   a rules/*.moss edit              pass           FAIL       pass
        ///
        /// Read the rows, because two of them are counter-intuitive. Changing only
        /// `CreateDefault()`'s literal does NOT move this pin — the shipped `.def` files state the
        /// value explicitly, so parsing them yields the old number regardless. And changing only a
        /// `.def` does not move the defaults pin. In BOTH of those cases the equivalence test is
        /// what fires, and it is telling you the two halves of a def field have gone out of sync —
        /// i.e. that the ONE-commit ritual was done as half a commit.
        ///
        /// So: `equivalence red` ⇒ default and shipped value disagree, fix that first.
        /// `equivalence green, both pins red` ⇒ a correct def change, re-pin both.
        /// `equivalence green, only this pin red` ⇒ a rules/*.moss edit, re-pin this one alone.
        /// </summary>
        [Test]
        public void ShippedDefsPlusRulesChecksum_IsPinned_ThisIsTheValueTheScenarioHostPrints()
        {
            // ⚠ MEASURED IN THE `lane/e0-7-ice` WORKTREE — see the sibling pin above for why this is
            // stale the moment E0-6 merges, and who re-pins it.
            // ⚠ MOVED BY THE WRECK START'S W3, for the same single reason as its twin above: the
            // CryoPod row is present in BOTH SimDefs.CreateDefault and content/core/SimDefs/
            // machines.def, so the parsed value tracks the compiled one and the equivalence test
            // stays green (the "both, consistently" row of the diagnostic matrix below).
            // ⚠ MOVED AGAIN BY THE W3 SEND-BACK: CryoPod's `maint` went 0.30 -> 0, the OPT-OUT, so
            // MaintenanceSystem never targets a capsule. That one column is the whole delta. Note
            // it also required DefsParser to stop clamping `fail` to `maint` on a maint = 0 row —
            // the clamp was rewriting this row's fail to 0 on every host that reads the .def, i.e.
            // the parsed and compiled values would otherwise have DISAGREED and the equivalence
            // test would have gone red instead of this pin.
            // ⚠ MOVED BY M3-10 (PIN M3-d, 2026-08-01), 09900b9a44119272 -> edf1577c32f14e55, for the
            // same four reasons as its twin above and NOT for a fifth: no rules/*.moss file changed,
            // so the whole delta between the two pins is still exactly the shipped rule set. The
            // Heater row and both new scalars are present in machines.def / thermal.def AND in
            // CreateDefault, so the parsed value tracks the compiled one and the equivalence test
            // stays green — the "both, consistently (the ritual)" row of the matrix below.
            // MEASURED TWICE, on fresh runs and through two different loaders: this test read
            // edf1577c32f14e55, and `hosts/scenario --days 0 --seed 42` printed
            // `defs: edf1577c32f14e55 (18 files, 0 problems, 1 rules)` — the number a human sees.
            const ulong Pinned = 0xEDF1577C32F14E55UL; // M3-10 (PIN M3-d): Heater = 28 + its two def scalars

            string dir = FindShippedSimDefsDir();
            Assert.That(dir, Is.Not.Null,
                "content/core/SimDefs must be discoverable by walking up from " + AppContext.BaseDirectory);

            // Mirrors ScenarioRunner.LoadDefs / SimHost.LoadDefs exactly: ordinal-sorted *.def,
            // then RulesLoader.Load, then the three-argument Parse that folds the rules.
            string[] paths = Directory.GetFiles(dir, "*.def");
            Array.Sort(paths, StringComparer.Ordinal);
            var files = new List<(string name, string text)>(paths.Length);
            foreach (var path in paths) files.Add((Path.GetFileName(path), File.ReadAllText(path)));

            var problems = new List<string>();
            var ruleFiles = RulesLoader.Load(dir, problems);
            var defs = DefsParser.Parse(files, ruleFiles, problems);

            Assert.That(problems, Is.Empty,
                "the shipped content must parse with zero problems: " + string.Join(" | ", problems));
            Assert.That(ruleFiles.Count, Is.GreaterThan(0),
                "at least one rules/*.moss must load, or this test would silently degenerate into a " +
                "duplicate of the defaults pin and the two values would coincide");

            Assert.That(defs.Checksum, Is.EqualTo(Pinned),
                "DETERMINISM PIN MOVED: the shipped defs+rules checksum is " +
                defs.Checksum.ToString("x16", CultureInfo.InvariantCulture) +
                ", pinned at " + Pinned.ToString("x16", CultureInfo.InvariantCulture) + ".\n" +
                "THIS IS THE NUMBER THE SCENARIO HOST PRINTS (`defs: …`, " + ruleFiles.Count +
                " rules, " + files.Count + " files). It is NOT SimDefs.Default.Checksum\n" +
                "  (0c5ddbc07e41f07d), which folds no designer rules — see the sibling test.\n" +
                "NOW CHECK THE OTHER TWO ASSERTIONS — the three of them localise the change:\n" +
                "  • DefsEquivalenceTests …ChecksumEqualsDefault ALSO RED\n" +
                "      ⇒ a shipped .def value and its compiled default disagree. The ONE-commit def\n" +
                "        ritual was done as half a commit. Fix that first; do not re-pin anything.\n" +
                "  • the defaults pin ALSO RED, equivalence GREEN\n" +
                "      ⇒ a correct, complete def change. Re-pin BOTH literals, plus CLAUDE.md's\n" +
                "        'Determinism proof', MECHANICS.md and memory, in the same commit.\n" +
                "  • the defaults pin GREEN, equivalence GREEN, only this one red\n" +
                "      ⇒ a content/core/SimDefs/rules/*.moss edit. Rules fold by name+source bytes,\n" +
                "        so editing a rule's text or renaming its file moves ONLY this value. Re-pin\n" +
                "        this literal alone and say which rule changed.\n" +
                "  • all three green except this one, and you touched no rule\n" +
                "      ⇒ stop. Something changed the rules directory that you did not intend.");
        }

        /// <summary>Probe upward for content/core/SimDefs — the house pattern, matching
        /// <c>DefsEquivalenceTests.FindSimDefsDir</c> and <c>ContentPackTests.DiscoverCoreDir</c>.</summary>
        private static string FindShippedSimDefsDir()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(dir.FullName, "content", "core", "SimDefs");
                if (Directory.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
            return null;
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
