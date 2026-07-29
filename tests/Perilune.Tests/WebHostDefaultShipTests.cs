using System.IO;
using System.Text.RegularExpressions;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐ THE PLAYER-FACING DEFAULT SHIP, PINNED. `./play.sh` runs `hosts/web` with no `--ship`, so
    /// the one line this file watches decides what a person sees when they start the game — and it
    /// is an OWNER DECISION, not an implementation detail: *"we decided to always ship the main
    /// version in play.sh"*, i.e. the default must track whatever is currently being built.
    ///
    /// <para>WHY A PIN AT ALL, given the value is expected to move again. Precisely because it is
    /// expected to move: a default that changes silently is how the repo got *"starting it with
    /// start.sh gives me the old ship"*. This test does not forbid the change; it forbids the
    /// change happening without anyone writing it down. When the next ship lands, edit the
    /// constant below and say so in the commit.</para>
    ///
    /// <para>⚠️ WHY THIS IS A SOURCE SCAN AND NOT AN ASSERTION ABOUT A SYMBOL. `hosts/web/Program.cs`
    /// IS NOT COMPILED BY THIS TEST PROJECT — the csproj pulls in only WireFormat / GameSession /
    /// ConversationHub, which is exactly why `ci.sh` builds `PeriluneWeb.csproj` as its own separate
    /// stage. There is no `Program` type to reference here, so the file's TEXT is the only thing
    /// available. Extracting the default into a shared constant would be the better fix and is a
    /// bigger change than this lane should make.</para>
    ///
    /// <para>⚠️ A RAW TEXT SCAN IS SATISFIED BY THE THING IT GUARDS AGAINST, COMMENTED OUT — the
    /// first trap in `CLAUDE.md`, which has landed in four packages in one day. Both halves of the
    /// countermeasure are here: the source is stripped of comments through
    /// <see cref="SurfaceBoundaryTests.CodeOnly"/> (the shared, quote-aware stripper, IMPORTED
    /// rather than re-derived) before any match, and
    /// <see cref="TheScanIsNotSatisfiedByACommentedOutDefault"/> is the negative control that
    /// proves a commented default cannot trip it.</para>
    /// </summary>
    public class WebHostDefaultShipTests
    {
        /// <summary>The value a player gets with no flag. Hand-written; changing the host without
        /// changing this is the whole point.</summary>
        private const string DefaultShip = "ShipChoice.Wreck";

        /// <summary>Ships that must remain reachable BY FLAG whatever the default is. `grid` is the
        /// economy programme's comparison baseline and `slice` is the headless measurement fixture;
        /// a default flip that quietly dropped either would take the measurement surface with it.
        /// `perilune` backs the tick-3000 goldens.</summary>
        private static readonly (string Arg, string Choice)[] SelectableByFlag =
        {
            ("slice", "ShipChoice.Slice"), ("grid", "ShipChoice.Grid"),
            ("wreck", "ShipChoice.Wreck"), ("perilune", "ShipChoice.Perilune"),
        };

        private static string ProgramSource()
        {
            var dir = new DirectoryInfo(TestContext.CurrentContext.TestDirectory);
            while (dir != null)
            {
                string p = Path.Combine(dir.FullName, "hosts", "web", "Program.cs");
                if (File.Exists(p)) return File.ReadAllText(p);
                dir = dir.Parent;
            }
            Assert.Fail("hosts/web/Program.cs must be discoverable by walking up from " +
                        TestContext.CurrentContext.TestDirectory);
            return null;
        }

        /// <summary>The initialiser, matched on CODE ONLY. Written as a regex over
        /// <c>var ship = …;</c> rather than as a substring search for the enum member, because the
        /// member name also appears in the `--ship` switch below it — a substring test would pass
        /// on a host whose default was Grid and which merely SUPPORTS `--ship wreck`.</summary>
        private static string DeclaredDefault(string code)
        {
            var m = Regex.Match(code, @"var\s+ship\s*=\s*(ShipChoice\.\w+)\s*;");
            Assert.That(m.Success, Is.True,
                "hosts/web/Program.cs no longer declares its default as `var ship = ShipChoice.X;`. " +
                "If the declaration moved or was renamed, re-point this guard at it — do not delete " +
                "it: the player-facing default is the one line in the host a person actually meets.");
            return m.Groups[1].Value;
        }

        [Test]
        public void TheWebHostDefaultShip_IsPinned()
        {
            string code = SurfaceBoundaryTests.CodeOnly(ProgramSource());
            Assert.That(DeclaredDefault(code), Is.EqualTo(DefaultShip),
                "THE PLAYER-FACING DEFAULT SHIP MOVED. `./play.sh` passes no --ship, so this is what " +
                "a person sees when they start the game.\n" +
                "IF YOU MEANT IT: that is fine and expected — the owner's rule is that play.sh always " +
                "  launches the CURRENT version. Update DefaultShip here, hosts/web/Program.cs's\n" +
                "  header, play.sh's header and CLAUDE.md's \"Play:\" section in the SAME commit.\n" +
                "IF YOU DID NOT: someone changed what the game is without saying so, which is the " +
                "  exact failure this pin exists for.");
        }

        [Test]
        public void EveryShip_IsStillReachableByFlag_WhateverTheDefaultIs()
        {
            string code = SurfaceBoundaryTests.CodeOnly(ProgramSource());
            var missing = new System.Collections.Generic.List<string>();
            foreach (var (arg, choice) in SelectableByFlag)
                if (!Regex.IsMatch(code, @"shipArg\s*==\s*""" + arg + @"""\s*\)\s*ship\s*=\s*" + Regex.Escape(choice)))
                    missing.Add($"--ship {arg} -> {choice}");
            Assert.That(missing, Is.Empty,
                "a --ship value stopped mapping to its own ShipChoice. `grid` is the economy " +
                "programme's comparison baseline and `slice` is the headless measurement fixture — " +
                "a default flip that dropped either would take the measurement surface with it, and " +
                "the arm would silently hand back the DEFAULT rather than erroring:\n  " +
                string.Join("\n  ", missing));
        }

        /// <summary>
        /// ⚠️ THE NEGATIVE CONTROL, and it is the half that is usually missing. Without it, a host
        /// whose real default was Grid and which merely CARRIED the string `ShipChoice.Wreck` in a
        /// comment would satisfy the pin above.
        ///
        /// <para>The fixture carries a LATER REAL declaration after the commented one, so the
        /// stripper is proved to resume rather than merely to swallow — the exact hole
        /// `CLAUDE.md` records for the CSS comment stripper, where a fixture with no later content
        /// made the control vacuous. Both comment spellings are covered, and the assertion is that
        /// the LIVE declaration is what is read.</para>
        /// </summary>
        [Test]
        public void TheScanIsNotSatisfiedByACommentedOutDefault()
        {
            const string Fixture = @"
                // var ship = ShipChoice.Wreck;
                /* var ship = ShipChoice.Wreck; */
                var ship = ShipChoice.Grid;
                if (shipArg == ""grid"") ship = ShipChoice.Grid;
            ";
            string code = SurfaceBoundaryTests.CodeOnly(Fixture);

            Assert.That(code, Does.Not.Contain("ShipChoice.Wreck"),
                "the shared comment stripper left a commented-out default in the code text, so the " +
                "pin above could be satisfied by a comment");
            Assert.That(DeclaredDefault(code), Is.EqualTo("ShipChoice.Grid"),
                "the guard read a COMMENTED default instead of the live one — this is CLAUDE.md's " +
                "first trap, and it is the reason the scan runs on CodeOnly output");

            // And the stripper really did resume: the line AFTER the comments is still matchable.
            Assert.That(code, Does.Contain(@"shipArg == ""grid"""),
                "the stripper swallowed everything after the first comment, which would make this " +
                "control vacuous — a negative control needs a LATER REAL statement to prove resume");
        }
    }
}
