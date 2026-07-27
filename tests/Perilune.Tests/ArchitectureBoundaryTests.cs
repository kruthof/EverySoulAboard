using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// THE MODULE BOUNDARIES, MECHANISED. Everything asserted here was previously held only by
    /// convention, review and memory — and this repo has a documented history of its own written
    /// record going stale (`docs/HANDOVER.md` carries live retractions). These are the invariants
    /// from `docs/design/perilune-economy-modularity.md` §1.2 / §1.5 / §8.1 and `CLAUDE.md`
    /// "Invariants", turned into something that fails a build instead of a code review.
    ///
    /// WHY SOURCE SCANNING, and what it can and cannot see.
    /// There are no per-module assemblies to reflect over: `sim/Sim.Core`, `Sim.Dsl`, `Sim.Glyph`,
    /// `Sim.Gen`, `Sim.Llm` and `Sim.Content` have NO .csproj — every host source-globs them into
    /// one flat assembly (`hosts/*/…csproj`, `<Compile Include="../../sim/Sim.Core/**/*.cs" />`).
    /// So a reflection-based layering test is impossible today: at runtime all six modules ARE one
    /// assembly. Scanning the sources is the only mechanism available, and these limits are real:
    ///
    ///   • A regex is not a compiler. A dependency introduced via a FULLY-QUALIFIED name
    ///     (`Perilune.Glyph.GlyphColor.Foo` with no `using`) is INVISIBLE to the DAG tests. They
    ///     pin the DECLARED dependency — the `using` line a reviewer reads, and what a future
    ///     .csproj split would turn into a `ProjectReference`. MATCHED: plain `using`,
    ///     `using static`, `using ALIAS =`, an optional `global::` prefix, and a directive split
    ///     across lines (<see cref="DeclaredPeriluneUsings"/>). NOT MATCHED — and this is the honest
    ///     boundary of the claim, not a footnote: a bare fully-qualified reference with no `using`
    ///     at all (`Perilune.Glyph.GlyphColor.Foo`), which no text scan can catch without type
    ///     resolution. That one gap is deliberate and disclosed, not fixed.
    ///   • `global using` and MSBuild `<Using Include="…"/>` would also evade the DAG tests. Both
    ///     are closed today by `LangVersion 9.0` in every .csproj (global usings are C# 10), and
    ///     the `<Using>` route additionally generates into `obj/`, which
    ///     <see cref="ModuleFiles"/> skips — so it would be doubly invisible. If LangVersion is
    ///     ever raised, revisit this test before trusting it.
    ///   • The identifier and call-site scans run over CODE ONLY (<see cref="CodeOnly"/>), because
    ///     a doc comment naming a downstream consumer is documentation, not a dependency —
    ///     deleting such a comment to appease a test is precisely the maintenance tax this file
    ///     must not create. That stripper is string-literal aware and its own behaviour is
    ///     asserted by <see cref="CodeOnly_IsStringLiteralAware_SoAQuotedCommentMarkerCannotBlindTheScans"/>,
    ///     because an earlier hand-verified version had a hole that silently blinded every scan
    ///     from a quoted "/*" to end of FILE.
    ///   • A CONSTRUCTOR-INJECTED SIBLING SYSTEM is invisible to all of it. That is not
    ///     hypothetical: it is how the one shipped souls→economy channel is wired, and this file
    ///     originally missed it entirely. See
    ///     <see cref="Economy_KnowsNothingAboutSoulsPresentationOrPhysiology"/>.
    ///
    /// HOW TO RESPOND WHEN ONE OF THESE FAILS. Every message below names the boundary, why it
    /// exists, and the two legitimate paths forward. None of these invariants is sacred — they are
    /// *measured facts we chose to keep*. Crossing one deliberately means editing the allowlist in
    /// this file IN THE SAME COMMIT as the crossing, and saying why in the commit message. That
    /// edit is the point: it makes an architectural decision visible in a diff instead of
    /// invisible in a merge. Measured over 299 commits of history, the ship-state reach total
    /// changed substantively exactly twice (3→5 at the first build verb, 5→7 at E0-5's
    /// deconstruct) — both moments a human should have looked. That is the intended fire rate.
    /// </summary>
    public class ArchitectureBoundaryTests
    {
        // ---------------------------------------------------------------- repo discovery

        /// <summary>
        /// Probe upward from the test binary for the repo root, exactly as
        /// <c>DefsEquivalenceTests.FindSimDefsDir</c> / <c>ContentPackTests.DiscoverCoreDir</c> do
        /// (the house pattern — the test binary's CWD is not the repo root under `dotnet test`).
        /// Two landmarks, not one, so a stray `ci.sh` on a parent path cannot false-positive.
        /// </summary>
        private static string RepoRoot()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                if (File.Exists(Path.Combine(dir.FullName, "ci.sh")) &&
                    Directory.Exists(Path.Combine(dir.FullName, "sim", "Sim.Core")))
                    return dir.FullName;
                dir = dir.Parent;
            }
            Assert.Fail("the repo root (a directory holding both ci.sh and sim/Sim.Core) must be " +
                        "discoverable by walking up from the test binary at " + AppContext.BaseDirectory);
            return null;
        }

        /// <summary>Every .cs file under sim/&lt;module&gt;, ordinal-sorted, excluding build output.
        /// Ordinal sort keeps failure messages stable across machines (the dev box is de-DE — a
        /// culture-sensitive sort here would reorder messages between machines, and culture bugs
        /// have been live in this repo).</summary>
        private static List<string> ModuleFiles(string module)
        {
            string root = Path.Combine(RepoRoot(), "sim", module);
            Assert.That(Directory.Exists(root), Is.True, "sim/" + module + " must exist");
            var found = new List<string>();
            foreach (var path in Directory.GetFiles(root, "*.cs", SearchOption.AllDirectories))
            {
                // Build output can contain generated .cs (AssemblyInfo, ref assemblies, and the
                // MSBuild <Using Include> global-using file). Not hand-written source; never scanned.
                if (path.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar) ||
                    path.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar))
                    continue;
                found.Add(path);
            }
            found.Sort(StringComparer.Ordinal);
            Assert.That(found, Is.Not.Empty, "sim/" + module + " must contain at least one .cs file");
            return found;
        }

        /// <summary>Repo-relative, forward-slashed, for messages that read the same on any OS.</summary>
        private static string Rel(string absolute) =>
            absolute.Substring(RepoRoot().Length).TrimStart('/', '\\').Replace('\\', '/');

        /// <summary>
        /// Matches every FORM of a declared dependency on another Perilune module:
        ///   `using Perilune.Dsl;`              — plain
        ///   `using static Perilune.Gen.X;`     — static import
        ///   `using GEN = Perilune.Gen;`        — alias
        /// The first version of this helper gated on `StartsWith("using Perilune")` and therefore
        /// missed the last two, which meant a genuine `Sim.Core → Sim.Gen` CYCLE could be
        /// introduced with the whole suite green. All three are "the `using` line a reviewer
        /// reads", which is this test's own stated criterion, so all three are matched.
        /// </summary>
        private static readonly Regex PeriluneUsing = new Regex(
            @"^[ \t]*using\s+(?:static\s+)?(?:[A-Za-z_]\w*\s*=\s*)?(?:global::)?Perilune\.(?<module>[A-Za-z_]\w*)",
            RegexOptions.Compiled | RegexOptions.Multiline);

        /// <summary>
        /// The root namespace each module directory declares. A `using` naming a module's OWN
        /// namespace is not a dependency on anything — it is redundant or, more usefully, an alias
        /// for one of its own nested types. Note `Sim.Core`'s namespace is `Perilune.Sim`, not
        /// `Perilune.Core`.
        /// </summary>
        private static readonly Dictionary<string, string> OwnNamespace =
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["Sim.Core"] = "Sim",
                ["Sim.Dsl"] = "Dsl",
                ["Sim.Glyph"] = "Glyph",
                ["Sim.Gen"] = "Gen",
                ["Sim.Llm"] = "Llm",
                ["Sim.Content"] = "Content",
            };

        /// <summary>
        /// The Perilune module names declared by one file, ordinal-sorted, duplicates kept.
        ///
        /// Scanned over the WHOLE FILE with <see cref="RegexOptions.Multiline"/> rather than
        /// line-by-line, because <c>using\s+</c> must be able to cross a newline: a directive split
        /// as <c>using⏎    Perilune.Gen;</c> is legal C# and creates a real edge, and a per-line
        /// matcher cannot see it. The leading <c>[ \t]*</c> — deliberately not <c>\s*</c> — keeps
        /// <c>^</c> anchored to a genuine line start, so allowing whitespace to cross a newline
        /// after the `using` keyword cannot let the match slide past an intervening line.
        /// </summary>
        private static List<string> DeclaredPeriluneUsings(string path)
        {
            var modules = new List<string>();
            foreach (Match m in PeriluneUsing.Matches(File.ReadAllText(path)))
                modules.Add(m.Groups["module"].Value);
            modules.Sort(StringComparer.Ordinal);
            return modules;
        }

        /// <summary>
        /// The same, minus self-references. Self-references are real `using` lines but they are not
        /// edges: `sim/Sim.Gen/RoomOutfitter.cs:2` reads
        /// <c>using Rect = Perilune.Gen.BandPlanner.Rect;</c> — Sim.Gen aliasing one of its own
        /// nested types.
        ///
        /// That line is worth knowing about for a second reason: it is shipped proof that
        /// <see cref="PeriluneUsing"/>'s alias clause was a necessary fix and not a hypothetical.
        /// The original `StartsWith("using Perilune")` matcher could not see it at all, which is
        /// exactly the hole through which a real `Sim.Core → Sim.Gen` cycle could have been
        /// introduced with the whole suite green.
        /// </summary>
        private static List<string> CrossModuleUsings(string path, string module)
        {
            // Never let an unmapped module surface as a KeyNotFoundException — that failure mode
            // tells the reader nothing. EveryModule below should catch it first.
            Assert.That(OwnNamespace.ContainsKey(module), Is.True,
                "UNMAPPED MODULE: sim/" + module + " has no OwnNamespace entry, so this test cannot " +
                "tell its self-references from its cross-module edges — it would silently scan the " +
                "wrong thing.\n" +
                "FIX: add sim/" + module + " to BOTH hand-maintained maps in this file, in the same " +
                "commit:\n" +
                "  1. OwnNamespace — its ROOT namespace. Note this is not mechanical: Sim.Core's is " +
                "`Sim`, not `Core`.\n" +
                "  2. `allowed` in SimModules_FormTheDeclaredAcyclicDependencyGraph — the modules it " +
                "may depend on. Check the result is still acyclic with Sim.Core as the sink.\n" +
                "If you are seeing this instead of SimModuleCensus_ForcesADecisionOnEveryNewModule, " +
                "that census is stale too.");
            string self = OwnNamespace[module];
            var external = new List<string>();
            foreach (var m in DeclaredPeriluneUsings(path))
                if (!string.Equals(m, self, StringComparison.Ordinal)) external.Add(m);
            return external;
        }

        // ---------------------------------------------------------------- comment stripping

        /// <summary>
        /// Source with comments removed, so a DEPENDENCY scan is not fooled by PROSE — and
        /// STRING-LITERAL AWARE, so a quoted comment marker cannot blind the scan.
        ///
        /// WHY THE PROSE/CODE SPLIT EXISTS. `DeconstructSystem.cs` has a doc comment reading
        /// *"…which HistorySystem turns into a Chronicle line naming the crew member"* — describing
        /// a DOWNSTREAM consumer of the event it publishes. That is exactly the documentation we
        /// want, and the economy has no dependency on `Chronicle` (it publishes
        /// `DeconstructCompletedEvent`; `HistorySystem`, outside the economy, writes the Chronicle).
        /// A raw-text scan would flag it and the "fix" would be to delete a true comment.
        ///
        /// WHY IT IS STRING-AWARE. The first version tracked no string state, and was
        /// hand-verified against the then-current economy files rather than mechanised. A review
        /// probe defeated it in one line: `private const string F4Sep = "/*";` makes a
        /// non-string-aware stripper scan to the next `*/` **or end of file**, silently deleting
        /// the rest of the file from every scan. Four real forbidden identifiers were then added in
        /// real code and the whole suite stayed green. A hand-verification dated "today" is exactly
        /// the class of claim these tests exist to eliminate, so the behaviour is now asserted by
        /// <see cref="CodeOnly_IsStringLiteralAware_SoAQuotedCommentMarkerCannotBlindTheScans"/>.
        ///
        /// HANDLED: `//` to end of line · `/* … */` (including unterminated) · `"…"` with
        /// backslash escapes · `@"…"` verbatim with `""` escapes · `'c'` char literals ·
        /// `$"…"` (treated as an ordinary string).
        ///
        /// NOT HANDLED, and both are closed by the build today: C# 11 raw string literals
        /// (`"""…"""`) and interpolated-string HOLES (`$"{Foo.Bar}"` — the hole's contents are
        /// treated as string text, so an identifier used only there is invisible). Raw strings
        /// need LangVersion ≥ 11 and every .csproj pins `LangVersion 9.0`. Interpolation holes are
        /// a genuine residual gap; it is fail-OPEN (a missed violation, never a false failure).
        /// </summary>
        private static string CodeOnly(string source)
        {
            var sb = new StringBuilder(source.Length);
            int i = 0;
            while (i < source.Length)
            {
                char c = source[i];

                // ---- line comment
                if (c == '/' && i + 1 < source.Length && source[i + 1] == '/')
                {
                    while (i < source.Length && source[i] != '\n') i++;
                    sb.Append('\n');
                    continue;
                }
                // ---- block comment (unterminated ⇒ drop the rest; fail-open)
                if (c == '/' && i + 1 < source.Length && source[i + 1] == '*')
                {
                    int end = source.IndexOf("*/", i + 2, StringComparison.Ordinal);
                    i = end < 0 ? source.Length : end + 2;
                    sb.Append(' ');
                    continue;
                }
                // ---- verbatim string @"…"  ("" escapes an embedded quote)
                if (c == '@' && i + 1 < source.Length && source[i + 1] == '"')
                {
                    sb.Append("\"\""); // token-shaped placeholder; contents dropped
                    i += 2;
                    while (i < source.Length)
                    {
                        if (source[i] == '"')
                        {
                            if (i + 1 < source.Length && source[i + 1] == '"') { i += 2; continue; }
                            i++;
                            break;
                        }
                        i++;
                    }
                    continue;
                }
                // ---- ordinary or interpolated string "…" / $"…"  (backslash escapes)
                if (c == '"')
                {
                    sb.Append("\"\"");
                    i++;
                    while (i < source.Length)
                    {
                        if (source[i] == '\\') { i += 2; continue; }
                        if (source[i] == '"') { i++; break; }
                        if (source[i] == '\n') break; // unterminated line-string; fail-open
                        i++;
                    }
                    continue;
                }
                // ---- char literal 'c' / '\n' / '\'' / '"'
                if (c == '\'')
                {
                    sb.Append("' '");
                    i++;
                    while (i < source.Length)
                    {
                        if (source[i] == '\\') { i += 2; continue; }
                        if (source[i] == '\'') { i++; break; }
                        if (source[i] == '\n') break; // fail-open
                        i++;
                    }
                    continue;
                }

                sb.Append(c);
                i++;
            }
            return sb.ToString();
        }

        /// <summary>
        /// THE STRIPPER'S OWN CORRECTNESS, asserted rather than hand-checked. Each case below is a
        /// construct that defeated an earlier version of <see cref="CodeOnly"/> or could plausibly
        /// defeat the next one. The load-bearing case is #3: a quoted `/*` used to blind every
        /// other test in this file from that point to end of file, silently.
        /// </summary>
        [Test]
        public void CodeOnly_IsStringLiteralAware_SoAQuotedCommentMarkerCannotBlindTheScans()
        {
            // 1. prose is removed …
            Assert.That(CodeOnly("// Mood\nint a;"), Does.Not.Contain("Mood"));
            Assert.That(CodeOnly("/// <see cref=\"Mood\"/>\nint a;"), Does.Not.Contain("Mood"));
            Assert.That(CodeOnly("/* Mood */ int a;"), Does.Not.Contain("Mood"));
            // … and code is kept
            Assert.That(CodeOnly("int a; // x"), Does.Contain("int a;"));

            // 2. a quoted // must not be treated as a comment
            Assert.That(CodeOnly("string s = \"a//b\"; int Mood;"), Does.Contain("Mood"),
                "a '//' inside a string literal must not be treated as a comment");

            // 3. THE REGRESSION: a quoted /* must not eat the rest of the FILE
            Assert.That(CodeOnly("string s = \"/*\";\nint Mood;\n"), Does.Contain("Mood"),
                "a '/*' inside a string literal blinded every scan in this file to end-of-file; " +
                "this is the exact hole a review probe used to hide four forbidden identifiers");
            Assert.That(CodeOnly("const string A = \"/*\", B = \"*/\";\nfloat m = c.Mood;\n"),
                Does.Contain("Mood"));

            // 4. verbatim strings, including the "" escape
            Assert.That(CodeOnly("var s = @\"/* not a comment\";\nint Mood;"), Does.Contain("Mood"));
            Assert.That(CodeOnly("var s = @\"a\"\"/*\"\"b\";\nint Mood;"), Does.Contain("Mood"));

            // 5. char literals, including the quote character and an escaped backslash
            Assert.That(CodeOnly("char c = '\"'; int Mood;"), Does.Contain("Mood"),
                "a quote CHARACTER must not open a string");
            Assert.That(CodeOnly("char c = '\\\\'; int Mood;"), Does.Contain("Mood"));

            // 6. escapes inside ordinary strings must not swallow the closing quote
            Assert.That(CodeOnly("var s = \"a\\\\\"; int Mood;"), Does.Contain("Mood"));

            // 7. string CONTENTS are dropped, so a forbidden word in a message is not a dependency
            Assert.That(CodeOnly("var s = \"Mood\";"), Does.Not.Contain("Mood"),
                "an identifier appearing only inside a string literal is not a code dependency");

            // 8. an unterminated block comment drops the remainder (fail-open, never a false fail)
            Assert.That(CodeOnly("/* unterminated\nint Mood;"), Does.Not.Contain("Mood"));
        }

        // ---------------------------------------------------------------- the economy file set

        /// <summary>
        /// THE ECONOMY, as a file set. Whole directories are globbed rather than listed so a NEW
        /// economy file is covered automatically — a lane adding `Jobs/Sources/MineJobSource.cs`
        /// (E-MINE) inherits every assertion here without touching this file (proven by mutation).
        /// Files living in shared directories are listed explicitly because their neighbours
        /// (`Systems/AtmosphereSystem.cs`, `Systems/NeedsSystem.cs`, …) are emphatically NOT
        /// economy and must not be scanned — <see cref="EconomySystemCensus_ForcesADecisionOnEveryNewSystemFile"/>
        /// is what stops that hand-written list going stale.
        ///
        /// `Stock/`, `Production/`, `Mining/` and `Space/TradeSystem.cs` are the W0-6 empty
        /// registrations — no behaviour yet, but they are where E-STOCK / E-PROD / E-MINE / E-VOY
        /// land, so they are inside the boundary from the start rather than joining it later.
        ///
        /// `Commands/Commands.cs` IS INCLUDED, and it is a MIXED file — worth reading. It holds the
        /// entire player-intent surface of the economy (`DesignateDig`, `DesignateStockpile`,
        /// `DesignateBuild`, `DesignateDeconstruct`, `PlaceDeviceCommand` with E0-5's Parts charge
        /// that closed the matter faucet, `RemoveDeviceCommand`) — and also commands that are not
        /// economy at all (`AddRoomCommand`, `SetTileCommand`, `SetDoorStateCommand`,
        /// `MoveCitizenCommand`, `SetScriptCommand`). Leaving it out left a hole a review probe
        /// walked straight through: a verbatim copy of `IsPressureHull` in
        /// `DesignateDeconstructCommand` — the single most likely place for that predicate to be
        /// duplicated — was not scanned at all, so
        /// <see cref="PressureHullGuard_LivesInDeconstructSystemAlone"/> could not catch the exact
        /// drift it is named after. So it is scanned, and the ship-reach allowlist annotates which
        /// COMMAND owns each of its reaches, so a reader can see that three of them belong to
        /// `AddRoomCommand` (a room command, definitionally ship) rather than mistaking them for
        /// economy coupling.
        /// </summary>
        private static List<string> EconomyFiles()
        {
            string root = RepoRoot();
            var files = new List<string>();

            foreach (var dir in new[] { "Jobs", "Stock", "Production", "Mining" })
            {
                string abs = Path.Combine(root, "sim", "Sim.Core", dir);
                Assert.That(Directory.Exists(abs), Is.True,
                    "the economy directory sim/Sim.Core/" + dir + " must exist — if it was renamed, " +
                    "update EconomyFiles() in this file in the same commit");
                files.AddRange(Directory.GetFiles(abs, "*.cs", SearchOption.AllDirectories));
            }

            foreach (var rel in EconomyFilesInSharedDirectories)
            {
                string abs = Path.Combine(root, "sim", "Sim.Core", rel.Replace('/', Path.DirectorySeparatorChar));
                Assert.That(File.Exists(abs), Is.True,
                    "the economy file sim/Sim.Core/" + rel + " must exist — if it moved, update " +
                    "EconomyFilesInSharedDirectories in this file in the same commit");
                files.Add(abs);
            }

            files.Sort(StringComparer.Ordinal);
            return files;
        }

        /// <summary>Economy files that live in directories shared with non-economy code.</summary>
        private static readonly string[] EconomyFilesInSharedDirectories =
        {
            "Systems/BuildSystem.cs",        // the pending-build registry
            "Systems/DeconstructSystem.cs",  // build's inverse (E0-5)
            "Systems/CraftingSystem.cs",     // bills at stations
            "Systems/MachineWearSystem.cs",  // wear + MaintenanceSystem (two classes, one file)
            "Entities/ItemStack.cs",         // ItemKind + the stack
            "Defs/ProductionDefs.cs",        // the [production] node table
            "Space/TradeSystem.cs",          // E-VOY trade (empty registration)
            "Commands/Commands.cs",          // the player-intent surface (mixed file — see EconomyFiles)
        };

        /// <summary>Occurrences of a literal substring. Caller decides raw vs <see cref="CodeOnly"/>.</summary>
        private static int CountOccurrences(string text, string needle)
        {
            int n = 0, i = 0;
            while ((i = text.IndexOf(needle, i, StringComparison.Ordinal)) >= 0) { n++; i += needle.Length; }
            return n;
        }

        // ================================================================ 1. the module DAG

        /// <summary>
        /// `Sim.Core` DEPENDS ON NOTHING ELSE IN THE REPO. This is the load-bearing fact behind
        /// every portability claim in `docs/design/perilune-economy-modularity.md`: it is what let
        /// 49 of 84 sim files cross the moonbase→perilune engine port essentially untouched (§2),
        /// and it is the sink of the dependency graph, so it is also what makes the graph acyclic.
        ///
        /// It is currently guaranteed by nothing but this test. There is no `Sim.Core.csproj`, so
        /// the compiler cannot help (see the class doc).
        /// </summary>
        /// <summary>
        /// THE LEDGER MUST NEVER BE REACHABLE FROM A TICK PATH (E0-8).
        ///
        /// <para><see cref="ShipMetrics.Compute"/> is ZERO-ALLOC, and that is precisely why it may
        /// legally sit inside <c>DirectorSystem.Tick</c>, which it does.
        /// <see cref="ShipLedger.Sample"/> ALLOCATES — one <c>int[]</c> per census — so the same move
        /// would break the zero-alloc tick invariant that eight test files assert with
        /// <c>GC.GetAllocatedBytesForCurrentThread()</c> deltas.</para>
        ///
        /// <para><b>This is not a hypothetical.</b> The charter's own stated destination for these
        /// aggregates is "the new MOSS <c>ship.*</c> bindings and Director tension inputs"
        /// (<c>ECONOMY-PLAN.md</c> §1, E0-8). A Director tension input is read inside <c>Tick</c>. So
        /// the single most likely next edit to this code is the one edit it must not receive, and
        /// prose in a doc comment would not survive that lane. When that work is genuinely wanted it
        /// needs a zero-alloc census (a caller-supplied buffer) plus a deliberate pin move — and
        /// editing the list below in the same commit is how it gets argued for.</para>
        /// </summary>
        [Test]
        public void TheLedgerIsNotReachableFromAnyTickPath()
        {
            // The ledger's own file legitimately mentions its own type names; nothing else in
            // Sim.Core may.
            var owners = new[] { "sim/Sim.Core/ShipLedger.cs" };
            var offenders = new List<string>();
            int scanned = 0, sawSimSystem = 0;

            foreach (var path in ModuleFiles("Sim.Core"))
            {
                string rel = Rel(path);
                if (Array.IndexOf(owners, rel) >= 0) continue;
                string code = CodeOnly(File.ReadAllText(path));
                scanned++;
                // Only files that ARE a system can put something on a tick path.
                if (!code.Contains(": ISimSystem") && !code.Contains(", ISimSystem") &&
                    !code.Contains("ISimSystem,")) continue;
                sawSimSystem++;
                if (code.Contains("ShipLedger")) offenders.Add(rel);
            }

            Assert.That(offenders, Is.Empty,
                "BOUNDARY CROSSED: an ISimSystem references ShipLedger.\n" +
                "  found: " + string.Join("\n         ", offenders) + "\n" +
                "WHY: ShipLedger.Sample ALLOCATES (one int[] per census). ShipMetrics.Compute does\n" +
                "  not, which is the only reason DirectorSystem is allowed to call IT from Tick. The\n" +
                "  sim core is zero-alloc in tick paths and that is test-enforced, not aspirational.\n" +
                "  E0-8's charter names 'Director tension inputs' as a destination for these\n" +
                "  aggregates, so this is the mistake most likely to be made, by someone reading the\n" +
                "  plan and doing what it says.\n" +
                "FIX: read the ledger from a HOST, at <=1 Hz, exactly as GameSession and the scenario\n" +
                "  `ledger` verb do. ShipLedgerTracker is deliberately not an ISimSystem.\n" +
                "IF DELIBERATE: it needs a zero-alloc census (caller-supplied buffer) AND a determinism\n" +
                "  pin move, because a sim system reading it makes it hashed state. Edit `owners` in\n" +
                "  this test in the SAME commit and say why in the commit message.");

            // Non-vacuity, both halves: the scan must have read real files, and it must have found
            // real ISimSystem implementations. A denylist that matches nothing guards nothing.
            Assert.That(scanned, Is.GreaterThan(20), "the Sim.Core scan read only " + scanned + " files");
            Assert.That(sawSimSystem, Is.GreaterThan(10),
                "the scan recognised only " + sawSimSystem + " ISimSystem implementations — the " +
                "detection changed and this boundary now passes because it is looking at nothing");
        }

        [Test]
        public void SimCore_DependsOnNothingElseInTheRepo()
        {
            var offenders = new List<string>();
            foreach (var path in ModuleFiles("Sim.Core"))
                foreach (var module in CrossModuleUsings(path, "Sim.Core"))
                    offenders.Add(Rel(path) + " → Perilune." + module);

            Assert.That(offenders, Is.Empty,
                "BOUNDARY CROSSED: sim/Sim.Core must not depend on any other module.\n" +
                "  found: " + string.Join("\n         ", offenders) + "\n" +
                "WHY: Sim.Core is the sink of the module DAG. Everything else depends on it and it\n" +
                "  depends on nothing, which is (a) what makes the graph acyclic, (b) what keeps the\n" +
                "  sim engine-free and headless, and (c) the single reason the last engine port cost\n" +
                "  a sed instead of a rewrite (economy-modularity §2.2).\n" +
                "FIX: invert the dependency. If a Sim.Core system needs something from Sim.Dsl or\n" +
                "  Sim.Glyph, pass it IN as an interface — SystemStack.CreateDefault(ISimSystem\n" +
                "  mossRuntime, …) is the shipped precedent for exactly this (the MOSS runtime lives\n" +
                "  in Sim.Dsl and is injected, never referenced).\n" +
                "IF DELIBERATE: it almost certainly is not. Changing this inverts the architecture in\n" +
                "  docs/ARCHITECTURE.md and CLAUDE.md; it is an integrator decision, not a lane's.");
        }

        /// <summary>
        /// The declared module graph, whole. Each module may depend only on the modules listed
        /// here; the graph below is acyclic by inspection and `Sim.Core` is its sink. Measured
        /// 2026-07-25 — these ARE the shipped edges, not an aspiration.
        /// </summary>
        [Test]
        public void SimModules_FormTheDeclaredAcyclicDependencyGraph()
        {
            // module → the ONLY modules it may declare a using on.
            var allowed = new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["Sim.Core"]    = new string[0],           // the sink
                ["Sim.Dsl"]     = new[] { "Sim" },         // namespace Perilune.Sim == module Sim.Core
                ["Sim.Glyph"]   = new[] { "Sim" },
                ["Sim.Llm"]     = new[] { "Sim" },
                ["Sim.Content"] = new[] { "Sim" },
                ["Sim.Gen"]     = new[] { "Sim", "Dsl" },  // the only module with two edges
            };

            var offenders = new List<string>();
            foreach (var pair in allowed)
            {
                var permitted = new List<string>(pair.Value);
                foreach (var path in ModuleFiles(pair.Key))
                    foreach (var module in CrossModuleUsings(path, pair.Key))
                        if (!permitted.Contains(module))
                            offenders.Add(Rel(path) + " → Perilune." + module +
                                          " (sim/" + pair.Key + " may only use: " +
                                          (pair.Value.Length == 0 ? "<nothing>" : string.Join(", ", pair.Value)) + ")");
            }

            Assert.That(offenders, Is.Empty,
                "BOUNDARY CROSSED: a new edge in the sim module graph.\n" +
                "  found: " + string.Join("\n         ", offenders) + "\n" +
                "WHY: the declared graph is\n" +
                "    Sim.Core  ← Sim.Dsl · Sim.Glyph · Sim.Llm · Sim.Content · Sim.Gen(+Sim.Dsl)\n" +
                "  It is acyclic with Sim.Core as the sink, and it is enforced by NOTHING ELSE — the\n" +
                "  six sim modules have no .csproj, so at runtime they are one assembly and the\n" +
                "  compiler cannot see a cycle (economy-modularity §1.1). `using static` and\n" +
                "  `using ALIAS =` count: both are declared dependencies and both are matched here.\n" +
                "FIX: prefer injecting an interface over adding an edge.\n" +
                "IF DELIBERATE: add the edge to `allowed` in this test IN THE SAME COMMIT, check the\n" +
                "  result is still acyclic, and update docs/ARCHITECTURE.md's module map. A cycle\n" +
                "  here is what would make a future .csproj split (economy-modularity §7 step 3)\n" +
                "  impossible, so it is worth the argument.");
        }

        // ================================================================ 2. Sim.Dsl (MOSS)

        /// <summary>
        /// THE MOSS LANGUAGE CORE STAYS GAME-AGNOSTIC. These nine files are the lexer, parser, AST,
        /// value type, diagnostics, compiler, token and registry — ~1,300 lines that reference no
        /// simulation type at all. `docs/design/perilune-economy-modularity.md` §8.5 rates
        /// `Sim.Dsl` the most portable asset in the repo (16 of 16 files crossed the engine port
        /// byte-identical modulo the namespace), and this file set is *why*: a scripting language
        /// that knows nothing about ships is reusable in any game.
        ///
        /// A `using Perilune.Sim` appearing in any of these nine is the specific regression that
        /// would quietly destroy that. The seam for anything sim-shaped is
        /// <c>IScriptable</c> (`DeviceRegistry.cs`) — two methods, string in, DslValue out.
        /// </summary>
        [Test]
        public void MossLanguageCore_HasNoSimulationDependency()
        {
            // The pure language layer. NOT the adapters — see the companion test below.
            var pure = new[]
            {
                "Ast.cs", "CompiledScript.cs", "DeviceRegistry.cs", "Diagnostics.cs", "DslValue.cs",
                "Lexer.cs", "MossCompiler.cs", "Parser.cs", "Token.cs",
            };

            var offenders = new List<string>();
            foreach (var name in pure)
            {
                string path = Path.Combine(RepoRoot(), "sim", "Sim.Dsl", name);
                Assert.That(File.Exists(path), Is.True,
                    "sim/Sim.Dsl/" + name + " must exist — if it was renamed, update the `pure` list " +
                    "in this test in the same commit");
                foreach (var module in CrossModuleUsings(path, "Sim.Dsl"))
                    offenders.Add("sim/Sim.Dsl/" + name + " → Perilune." + module);
            }

            Assert.That(offenders, Is.Empty,
                "BOUNDARY CROSSED: the MOSS language core acquired a simulation dependency.\n" +
                "  found: " + string.Join("\n         ", offenders) + "\n" +
                "WHY: these nine files are the lexer/parser/AST/values/diagnostics/compiler/registry.\n" +
                "  Their independence from the sim is what makes MOSS reusable in a DIFFERENT game —\n" +
                "  rated the repo's most portable asset in economy-modularity §8.5, and the only\n" +
                "  module that crossed the engine port 16/16 byte-identical.\n" +
                "FIX: put the sim-facing code behind IScriptable (DeviceRegistry.cs) and register an\n" +
                "  adapter, exactly as DeviceAdapters.cs / ShipMetricsAdapter.cs already do. The\n" +
                "  language should never learn what a device IS.\n" +
                "IF DELIBERATE: you are trading away the one asset this repo could hand a future game\n" +
                "  for free. Say so explicitly in the commit message.");
        }

        /// <summary>
        /// The MOSS→sim dependency is confined to the SEVEN adapter/runtime files, and the count is
        /// pinned so it cannot creep. This is the "Sim.Dsl acquires no new Sim.Core dependency"
        /// budget from economy-modularity §7 step 2.
        /// </summary>
        [Test]
        public void SimDsl_TouchesTheSimulationFromExactlyTheSevenAdapterFiles()
        {
            var expected = new[]
            {
                "DesignerRuleSystem.cs", // the ISimSystem wrapper for designer rules
                "DeviceAdapters.cs",     // Device/Room → IScriptable
                "Interpreter.cs",        // publishes AlarmRaisedEvent via EventBus
                "MossBindings.cs",       // registers adapters by DeviceKind
                "RulesLoader.cs",        // reads content/core/SimDefs/rules/*.moss
                "ScriptRuntime.cs",      // the ISimSystem player-script runtime
                "ShipMetricsAdapter.cs", // ShipMetrics → IScriptable
            };

            var actual = new List<string>();
            foreach (var path in ModuleFiles("Sim.Dsl"))
                if (CrossModuleUsings(path, "Sim.Dsl").Count > 0)
                    actual.Add(Path.GetFileName(path));
            actual.Sort(StringComparer.Ordinal);

            Assert.That(actual, Is.EqualTo(expected),
                "BOUNDARY MOVED: the set of Sim.Dsl files that depend on the simulation changed.\n" +
                "  expected (7): " + string.Join(", ", expected) + "\n" +
                "  actual  (" + actual.Count + "): " + string.Join(", ", actual) + "\n" +
                "WHY: MOSS's value as a portable asset is that its dependency on this game is small,\n" +
                "  enumerable and confined to adapters. Seven files is the measured budget\n" +
                "  (economy-modularity §8.5). Growth here is how a portable language quietly becomes\n" +
                "  a game-specific one.\n" +
                "FIX: if a new file needs sim state, ask whether an existing adapter can supply it\n" +
                "  through IScriptable instead.\n" +
                "IF DELIBERATE: add the file to `expected` in this test in the same commit and say in\n" +
                "  the commit message what sim state it needs and why an adapter could not carry it.");
        }

        // ================================================================ 3. economy ↔ souls

        /// <summary>
        /// WHAT THE ECONOMY MAY NOT NAME — souls, presentation, physiology, the LLM, and the
        /// Director's tension lever. Measured 2026-07-25: every identifier below appears zero times
        /// in economy CODE, except the two the carve-out permits explicitly.
        ///
        /// ⚠ DO NOT SAY "THE ECONOMY KNOWS NOTHING ABOUT SOULS". It is false, and an earlier
        /// version of this very test asserted it. There is exactly ONE shipped souls→economy
        /// channel and it is live in the default system stack:
        ///
        ///     Citizen.Mood ──(mean)──▶ ShipMetrics.Morale ──(WeightMoraleDeficit 0.4)──▶
        ///     DirectorSystem tension ──(lever)──▶ DirectorSystem.WearPressure ──▶
        ///     MachineWearSystem: device.Condition -= … * pressure
        ///
        ///   `SystemStack.cs:24,36`    var director = new DirectorSystem(); … new MachineWearSystem(director)
        ///   `MachineWearSystem.cs:47` float pressure = _director != null ? _director.WearPressure : 1f;
        ///   `MachineWearSystem.cs:70` device.Condition -= def.WearPerHour / 3600f * DtSeconds * multiplier * pressure;
        ///   `DirectorSystem.cs:66`    d.WeightMoraleDeficit * (1f - m.Morale)
        ///   `ShipMetrics.cs:83,86`    moodSum += citizens[i].Mood;  m.Morale = (moodSum / pop + 100f) / 200f;
        ///   `SimDefs.cs:655`          WeightMoraleDeficit = 0.4f
        ///
        /// So crew mood already modulates machine wear. Two consequences worth internalising:
        ///
        ///   1. The mechanism — a CONSTRUCTOR-INJECTED SIBLING SYSTEM — is invisible to every other
        ///      assertion in this file. It is not a `using`, and it is not a `sim.X` reach, so
        ///      nothing here saw it; the audit that produced these tests read the code and still
        ///      missed the connection. That is why `Director` and `WearPressure` are scanned now,
        ///      with a reasoned carve-out rather than a blanket ban: the channel is legitimate and
        ///      shipped, but a SECOND one must be a deliberate act.
        ///   2. It is a PRECEDENT, not a violation. `docs/design/perilune-automation-and-souls.md`
        ///      §4's operator model ("mood + skill are the throughput") is unbuilt — but it is not
        ///      unprecedented, and the claim that it has "no seam to build against" was wrong. The
        ///      wiring pattern it needs already exists here: injected sibling system, def-weighted,
        ///      mood-derived, deterministic, hashed, and inert when the sibling is null (`× 1f` is
        ///      IEEE identity, `MachineWearSystem.cs:36-37`). economy-modularity §7 step 1's
        ///      `JobWork.WorkRate` should FOLLOW this pattern, not invent one.
        ///
        /// The list is therefore a checkpoint, not a wall. When E2 lands the operator model, widen
        /// the carve-out deliberately, in the E2 commit, citing the design authority — and check
        /// the crossing has the right SHAPE: one seam (`JobWork.WorkRate`), not mood references
        /// scattered across five job sources.
        /// </summary>
        [Test]
        public void Economy_KnowsNothingAboutSoulsPresentationOrPhysiology()
        {
            // Grouped by what they are, because the right response differs per group.
            // COUNTING NOTE: GlyphColor/GlyphMapper are substrings of Glyph, so the 25 rows below
            // are 23 DISTINCT checks — the two specific names exist so a failure message can name
            // the exact type rather than just "Glyph".
            var forbidden = new (string Name, string Why)[]
            {
                // ---- souls / inner life. E2 crosses Mood and Skill DELIBERATELY — see the doc.
                ("Mood",           "crew inner life — E2's operator model crosses this via ONE seam"),
                ("Morale",         "crew inner life (note: ShipMetrics.Morale IS mean crew Mood)"),
                ("Skill",          "does not exist anywhere in sim/ yet; E2 introduces it"),
                ("Persona",        "LLM persona sheets"),
                ("CitizenMind",    "LLM-facing mind state"),
                ("CitizenMemory",  "MEMS persistence"),
                ("Chronicle",      "narrative record — publish an event, let HistorySystem write it"),
                ("Eulogy",         "narrative record"),
                ("SocialSystem",   "relationships"),
                ("RelationType",   "relationships"),
                // ---- the Director's tension lever: the ONE shipped souls→economy channel.
                ("Director",       "the tension lever — mood reaches wear THROUGH this; carved out below"),
                ("WearPressure",   "the lever's value; carved out for MachineWearSystem only"),
                // ---- the LLM. Must never be reachable from a deterministic tick path.
                ("Llm",            "the LLM runtime — never on a deterministic tick path"),
                ("IChatBackend",   "the LLM runtime"),
                ("CitizenEffect",  "the LLM→sim effect pipeline; applied at tick boundaries elsewhere"),
                // ---- presentation. Projection is one-way: sim → glyph, never back.
                ("Glyph",          "presentation — projection is one-way, sim → glyph"),
                ("GlyphColor",     "presentation"),
                ("GlyphMapper",    "presentation"),
                // ---- the automation language. Devices are exposed TO MOSS, never the reverse.
                ("Moss",           "the automation DSL — devices reach it via IScriptable adapters"),
                ("ScriptRuntime",  "the MOSS runtime is an injected ISimSystem, never called into"),
                // ---- ship physiology / atmosphere. Owned by their own systems.
                ("Atmosphere",     "ship physiology — AtmosphereSystem owns gas"),
                ("Oxygen",         "ship physiology"),
                ("Suffocation",    "physiology — SafetySystem owns fleeing lethal air, not the job board"),
                ("Fatigue",        "physiology — and note Citizen.cs's claim that it 'slows work' is FALSE"),
                // ---- spatial vocabulary the sim does not actually have.
                ("Deck",           "the sim has z-levels, not 'decks'; hauling is deck-agnostic"),
            };

            // The ONE legitimate, shipped crossing. file → identifier → measured count.
            var carveOut = new Dictionary<string, Dictionary<string, int>>(StringComparer.Ordinal)
            {
                ["sim/Sim.Core/Systems/MachineWearSystem.cs"] = new Dictionary<string, int>(StringComparer.Ordinal)
                {
                    // Exactly two in CODE: the field's declared type (`DirectorSystem _director;`)
                    // and the ctor parameter's type (`MachineWearSystem(DirectorSystem director…)`).
                    // The lowercase `_director` / `director` do not match, and the three mentions in
                    // the doc comment are stripped by CodeOnly.
                    ["Director"] = 2,
                    // `_director.WearPressure` — the single read.
                    ["WearPressure"] = 1,
                },
            };

            var offenders = new List<string>();
            foreach (var path in EconomyFiles())
            {
                string rel = Rel(path);
                // CODE only. A doc comment naming a downstream consumer is documentation, not a
                // dependency — see CodeOnly() for the concrete case that forced this distinction.
                string code = CodeOnly(File.ReadAllText(path));
                carveOut.TryGetValue(rel, out var permitted);

                foreach (var (name, why) in forbidden)
                {
                    int actual = CountOccurrences(code, name);
                    int allowed = 0;
                    if (permitted != null) permitted.TryGetValue(name, out allowed);
                    if (actual != allowed)
                        offenders.Add(string.Format(CultureInfo.InvariantCulture,
                            "{0}: '{1}' expected ×{2}, found ×{3}  [{4}]", rel, name, allowed, actual, why));
                }
            }

            Assert.That(offenders, Is.Empty,
                "BOUNDARY CHANGED: the economy's knowledge of souls / presentation / physiology moved.\n" +
                "  " + string.Join("\n  ", offenders) + "\n" +
                "WHY (portability): with ONE carved-out exception, every identifier above is zero in\n" +
                "  economy code. That is the strongest evidence in economy-modularity §1.5 that this\n" +
                "  economy is close to a generic tile-colony economy rather than welded to a\n" +
                "  spaceship with an LLM crew.\n" +
                "THE ONE EXCEPTION, so you know what 'normal' looks like: MachineWearSystem takes a\n" +
                "  DirectorSystem by constructor injection and multiplies device wear by its\n" +
                "  WearPressure lever, which the Director derives from ShipMetrics.Morale — i.e. mean\n" +
                "  crew Mood. Crew mood ALREADY modulates machine wear. That channel is legitimate,\n" +
                "  shipped, deterministic and hashed, and it is the PATTERN to copy.\n" +
                "SO — WHICH IS THIS?\n" +
                "  (a) E2 / the operator model: correct and expected. docs/design/\n" +
                "      perilune-automation-and-souls.md §4 requires 'mood + skill are the\n" +
                "      throughput'. Widen the carve-out above in the SAME commit, cite the design\n" +
                "      authority, and FOLLOW THE EXISTING PATTERN — injected sibling system,\n" +
                "      def-weighted, mood-derived, inert when the sibling is null. Then check the\n" +
                "      SHAPE: economy-modularity §7 step 1 wants ONE seam (JobWork.WorkRate).\n" +
                "      Several files in this failure list is the WRONG shape even for E2.\n" +
                "  (b) anything else — a balance tweak reading citizen.Mood, a job source importing a\n" +
                "      GlyphColor, an economy system checking Suffocation or Atmosphere: revert it.\n" +
                "      SafetySystem owns lethal air; AtmosphereSystem owns gas; the projection is\n" +
                "      one-way; MOSS reaches devices through IScriptable, never the reverse.\n" +
                "  (c) a count that DROPPED inside the carve-out: someone removed a coupling. Good.\n" +
                "      Lower the number in the same commit.");
        }

        // ================================================================ 4. economy → ship

        /// <summary>
        /// THE ECONOMY REACHES INTO SHIP-SYSTEM STATE AT EXACTLY THESE SITES — an allowlist, pinned
        /// by count, keyed by file (never by line number: E0-4 is editing this directory in a
        /// sibling worktree as of 2026-07-25).
        ///
        /// This is `docs/design/perilune-economy-modularity.md` §1.5's table, mechanised — and
        /// writing it corrected that table twice. The honest shape, measured, from the economy
        /// SYSTEMS (excluding the mixed `Commands.cs`, annotated separately in the allowlist):
        ///
        ///   FIVE notifications (a write or a dirty-flag; no read of ship state):
        ///     3× sim.Rooms.MarkDirty()   — DigJobSource, BuildSystem, DeconstructSystem
        ///     2× sim.PowerDirty = true   — BuildSystem, DeconstructSystem
        ///   TWO reads of ship state, BOTH in MachineWearSystem:
        ///     sim.Rooms.Rooms                  — the vacuum sentinel (rooms[0])
        ///     sim.Rooms.RoomAt(…).TemperatureK — heat modulates wear
        ///
        /// Seven reaches: FIVE notifications and TWO reads. (An earlier version of this message said
        /// "six notify-only", which is arithmetically impossible — 3+2=5 — and mis-classified the
        /// `sim.Rooms.Rooms` list fetch as a notification. Fixed, because the whole justification of
        /// these messages is that the next reader trusts them.)
        ///
        /// `sim.Systems` IS ALSO TRACKED HERE, and it is the sharper hazard. It is an untyped
        /// `internal ISimSystem[]` escape hatch used for lazy sibling-system resolution; a review
        /// probe added a type-test for `AtmosphereSystem` beside an existing loop and the suite
        /// stayed green. Nothing in the text says WHICH system is being fished out, so it can
        /// smuggle a dependency on anything past every other assertion in this file. Pinning the
        /// call count at least makes a new caller visible.
        ///
        /// `IsPressureHull` is deliberately NOT counted as a reach: it is a static predicate defined
        /// INSIDE the economy that reads `World` geometry, not a ship system. It is asserted
        /// separately below, because which file may know that vacuum exists is its own boundary.
        /// </summary>
        [Test]
        public void Economy_ReachesIntoShipSystemsAtExactlyTheAllowlistedSites()
        {
            // pattern → (economy file → exact occurrence count). Anything not listed must be 0.
            var allowlist = new Dictionary<string, Dictionary<string, int>>(StringComparer.Ordinal)
            {
                ["sim.Rooms"] = new Dictionary<string, int>(StringComparer.Ordinal)
                {
                    // NOTIFY-ONLY: a void call telling RoomState to reflood next tick.
                    ["sim/Sim.Core/Jobs/Sources/DigJobSource.cs"] = 1,
                    ["sim/Sim.Core/Systems/BuildSystem.cs"] = 1,
                    ["sim/Sim.Core/Systems/DeconstructSystem.cs"] = 1,
                    // THE ONLY TWO READS in the whole economy: vacuum sentinel + room temperature.
                    ["sim/Sim.Core/Systems/MachineWearSystem.cs"] = 2,
                    // MIXED FILE: all three belong to AddRoomCommand — a ROOM command, definitionally
                    // ship rather than economy. Scanned because Commands.cs also holds the economy's
                    // designate/place/remove verbs (see EconomyFiles), NOT because the economy
                    // reaches rooms three more times. Do not fold these into the seven above.
                    ["sim/Sim.Core/Commands/Commands.cs"] = 3,
                },
                ["sim.PowerDirty"] = new Dictionary<string, int>(StringComparer.Ordinal)
                {
                    // NOTIFY-ONLY: structural change may alter conduit reachability.
                    ["sim/Sim.Core/Systems/BuildSystem.cs"] = 1,
                    ["sim/Sim.Core/Systems/DeconstructSystem.cs"] = 1,
                },
                ["sim.Systems"] = new Dictionary<string, int>(StringComparer.Ordinal)
                {
                    // The untyped sibling-system escape hatch. Each resolves ONE known system lazily
                    // so a source stays inert when that system is absent from the stack.
                    ["sim/Sim.Core/Jobs/Sources/BuildJobSource.cs"] = 1,
                    ["sim/Sim.Core/Jobs/Sources/DeconstructJobSource.cs"] = 1,
                    // E0-4 WP-4 (`e88e548`): resolves the optional StockZoneSystem so the haul
                    // filter is inert on a stack without it. ONCE-ONLY and precedented — the
                    // lookup sits behind a `_stockZonesResolved` bool in `BeginTick`, exactly the
                    // `DeconstructJobSource.BeginTick` / `_stripResolved` shape, so it is one array
                    // walk per SIMULATION, not per tick. This entry was added hours after the rest
                    // of the allowlist was measured: E0-4 and the lane that wrote this test landed
                    // in parallel on 2026-07-25, so the reach was real before the number was.
                    ["sim/Sim.Core/Jobs/Sources/HaulJobSource.cs"] = 1,
                    ["sim/Sim.Core/Systems/CraftingSystem.cs"] = 1,
                    // MIXED FILE: PlaceDeviceCommand / RemoveDeviceCommand resolving their registries.
                    ["sim/Sim.Core/Commands/Commands.cs"] = 2,
                },
            };

            var economy = EconomyFiles();
            var relSet = new List<string>();
            foreach (var path in economy) relSet.Add(Rel(path));

            var problems = new List<string>();
            foreach (var pattern in allowlist)
            {
                var expected = pattern.Value;
                foreach (var path in economy)
                {
                    string rel = Rel(path);
                    // Code only: a doc comment may discuss sim.Rooms freely without tripping this.
                    int actual = CountOccurrences(CodeOnly(File.ReadAllText(path)), pattern.Key);
                    expected.TryGetValue(rel, out int want); // absent ⇒ 0
                    if (actual != want)
                        problems.Add(string.Format(CultureInfo.InvariantCulture,
                            "{0}: '{1}' expected ×{2}, found ×{3}", rel, pattern.Key, want, actual));
                }
                // An allowlist entry for a file that is no longer in the economy set is stale.
                foreach (var entry in expected)
                    if (!relSet.Contains(entry.Key))
                        problems.Add("stale allowlist entry: " + entry.Key + " ('" + pattern.Key +
                                     "') is not in the economy file set");
            }

            Assert.That(problems, Is.Empty,
                "BOUNDARY CHANGED: the economy's reach into ship systems moved.\n" +
                "  " + string.Join("\n  ", problems) + "\n" +
                "WHY: the whole portability argument in economy-modularity §1.5 rests on this reach\n" +
                "  being tiny and enumerable — from the economy SYSTEMS, SEVEN sites: FIVE\n" +
                "  notifications (3× sim.Rooms.MarkDirty, 2× sim.PowerDirty) and TWO reads, both in\n" +
                "  MachineWearSystem (the vacuum sentinel and a room's temperature). An economy that\n" +
                "  starts reading rooms, atmosphere or power is an economy that cannot be reused.\n" +
                "  Measured over 299 commits this total changed substantively twice, so a failure\n" +
                "  here is rare and worth reading properly.\n" +
                "ON Commands.cs: it is a MIXED file. Its three sim.Rooms reaches belong to\n" +
                "  AddRoomCommand — a room command, not economy — and are annotated as such above.\n" +
                "  It is scanned because it also holds every economy designate/place/remove verb.\n" +
                "ON sim.Systems: an untyped ISimSystem[] escape hatch. It can smuggle a dependency on\n" +
                "  ANY system past every other assertion in this file, because nothing in the text\n" +
                "  says which system is fished out. A new caller is a design decision; treat it so.\n" +
                "FIX (a new reach): can it be an EVENT instead? Every notify-only site here is a\n" +
                "  candidate for exactly that refactor (economy-modularity §7 step 4). Can the value\n" +
                "  be a def instead of a live read? MachineWearSystem already takes its thresholds\n" +
                "  from WearDefs and only the temperature itself from the ship.\n" +
                "FIX (a count that DROPPED): good news, probably — someone removed a coupling.\n" +
                "  Lower the number here in the same commit.\n" +
                "IF DELIBERATE: edit the allowlist above in the same commit and update\n" +
                "  economy-modularity §1.5's table, which is the prose version of this data.");
        }

        /// <summary>
        /// ONLY `DeconstructSystem` KNOWS THE SHIP CAN BE OPENED TO VACUUM. `IsPressureHull` — a
        /// wall adjacent to `TileDefs.Void` or to the map edge is never strippable — is the one
        /// irreducibly spaceship-shaped rule in the economy (economy-modularity §1.5, §9). It is a
        /// static predicate over `World` geometry, so it costs the economy no system dependency,
        /// but it must stay in one file: a second copy is how two definitions of "the hull" drift
        /// apart, and the guardrail's whole job is to be the canvas edge nothing can cross.
        ///
        /// This test was toothless until `Commands/Commands.cs` joined the economy set: a verbatim
        /// copy of the predicate in `DesignateDeconstructCommand` — the single most likely place for
        /// it to be duplicated — was not scanned at all.
        /// </summary>
        [Test]
        public void PressureHullGuard_LivesInDeconstructSystemAlone()
        {
            const string Owner = "sim/Sim.Core/Systems/DeconstructSystem.cs";
            var offenders = new List<string>();
            foreach (var path in EconomyFiles())
            {
                string rel = Rel(path);
                if (rel == Owner) continue;
                // Code only: another file's doc comment may reference the guard by name.
                if (CountOccurrences(CodeOnly(File.ReadAllText(path)), "IsPressureHull") > 0)
                    offenders.Add(rel);
            }

            Assert.That(offenders, Is.Empty,
                "BOUNDARY CROSSED: 'IsPressureHull' appeared outside " + Owner + ".\n" +
                "  found in: " + string.Join(", ", offenders) + "\n" +
                "WHY: this is the one rule in the economy that is irreducibly about a SPACESHIP (a\n" +
                "  wall adjacent to vacuum or the map edge is never strippable — the canvas edge).\n" +
                "  Keeping it in one file does two things: it keeps the rest of the economy free of\n" +
                "  any vacuum concept (economy-modularity §9), and it keeps the guardrail single-\n" +
                "  definition. JobWork.IsFreeStockpileTile's doc comment records why a second copy\n" +
                "  of a shared predicate is a bug shape: two definitions drift.\n" +
                "FIX: call DeconstructSystem.IsPressureHull (it is public static) rather than\n" +
                "  reimplementing it, and if the CALLER is not deconstruct-shaped, ask whether the\n" +
                "  predicate belongs on World instead — then move it once, not twice.");
        }

        // ================================================================ 5. determinism rule

        /// <summary>
        /// NO UNORDERED ITERATION IN `sim/Sim.Core/Jobs/`. This is a DETERMINISM rule, not a style
        /// preference — `IJobSource.cs`'s arbitration contract states it outright: use
        /// `HashSet`/`Dictionary` "for LOOKUP ONLY and never iterate them (that is a determinism
        /// rule, not a perf one), indexed `for` only, no LINQ, no lambdas, no closures."
        ///
        /// Hash-container iteration order is not specified by the runtime and can differ between
        /// runs, versions and platforms. The job board's arbitration is a global argmin whose ties
        /// break on board order, so a single unordered iteration silently makes job assignment
        /// non-reproducible — which moves the determinism pins and, worse, does so intermittently.
        ///
        /// SCOPE — read this before trusting a pass. The contract has four clauses and this test
        /// mechanises three of them by BANNED TOKEN, not by type analysis:
        ///   • `foreach` — banned outright. `Jobs/` has zero today and every board is walked with
        ///     an indexed `for`, so this is exact and costs nothing. A regex cannot tell `foreach`
        ///     over a `List` (harmless) from `foreach` over a `HashSet` (a determinism bug); it does
        ///     not have to, because neither is wanted here. Matched with `\bforeach\b` — an earlier
        ///     version required a leading space or line start and a probe walked past it with
        ///     `int n=0;foreach (…)`.
        ///   • the ORDER-LAUNDERING escapes — `.CopyTo(`, `ToArray()`, `ToList()`, `.Keys`,
        ///     `.Values`, `using System.Linq` — are banned too, because they reproduce the exact
        ///     defect without the keyword: `var a = new Int3[_set.Count]; _set.CopyTo(a);` followed
        ///     by an indexed `for` IS order-unspecified hash iteration, and a review probe used
        ///     precisely that to pass this test green.
        ///   • lambdas/closures are NOT mechanised (`=>` is ubiquitous in expression-bodied members,
        ///     so a token ban would be pure noise). That clause stays review-only; this is the
        ///     disclosure.
        /// `Stock/`, `Production/` and `Mining/` are deliberately OUT of scope — this is a `Jobs/`
        /// rule, and `Stock/StockZoneSystem.cs` legitimately uses `foreach` off the tick path. Five
        /// files elsewhere in `Sim.Core` use `foreach` too; generalising would fire on correct code
        /// and get suppressed.
        /// </summary>
        [Test]
        public void EconomyJobBoard_UsesIndexedForOnly_NoUnorderedIteration()
        {
            var banned = new (Regex Pattern, string Label, string Instead)[]
            {
                (new Regex(@"\bforeach\b"), "foreach",
                 "an indexed `for` over a List whose order you declared"),
                (new Regex(@"\.CopyTo\s*\("), ".CopyTo(",
                 "a parallel List in a declared order — copying a HashSet out does not give it one"),
                (new Regex(@"\bToArray\s*\(\s*\)"), "ToArray()",
                 "a parallel List in a declared order"),
                (new Regex(@"\bToList\s*\(\s*\)"), "ToList()",
                 "a parallel List in a declared order"),
                (new Regex(@"\.Keys\b"), ".Keys",
                 "TryGetValue — a Dictionary's key ORDER is unspecified"),
                (new Regex(@"\.Values\b"), ".Values",
                 "TryGetValue — a Dictionary's value ORDER is unspecified"),
                (new Regex(@"^\s*using\s+System\.Linq\s*;", RegexOptions.Multiline), "using System.Linq",
                 "no LINQ on a tick path — it allocates and hides iteration order"),
            };

            var jobFiles = Directory.GetFiles(
                Path.Combine(RepoRoot(), "sim", "Sim.Core", "Jobs"), "*.cs", SearchOption.AllDirectories);
            Array.Sort(jobFiles, StringComparer.Ordinal);
            Assert.That(jobFiles, Is.Not.Empty, "sim/Sim.Core/Jobs must contain .cs files");

            var offenders = new List<string>();
            foreach (var path in jobFiles)
            {
                // Comments stripped by the same helper the other scans use, so the class doc's prose
                // ("never iterate them") and this very sentence cannot trip the test.
                string[] codeLines = CodeOnly(File.ReadAllText(path)).Split('\n');
                for (int i = 0; i < codeLines.Length; i++)
                    foreach (var (pattern, label, instead) in banned)
                        if (pattern.IsMatch(codeLines[i]))
                            offenders.Add(string.Format(CultureInfo.InvariantCulture,
                                "{0}:{1}: '{2}' — use {3}\n      {4}",
                                Rel(path), i + 1, label, instead, codeLines[i].Trim()));
            }

            Assert.That(offenders, Is.Empty,
                "DETERMINISM RULE VIOLATED in sim/Sim.Core/Jobs/.\n" +
                "  " + string.Join("\n  ", offenders) + "\n" +
                "WHY: IJobSource.cs's arbitration contract requires HashSet/Dictionary be used for\n" +
                "  LOOKUP ONLY and never iterated — 'that is a determinism rule, not a perf one,\n" +
                "  indexed `for` only, no LINQ, no lambdas, no closures'. Hash-container iteration\n" +
                "  order is unspecified, and the dispatcher's global argmin breaks ties on BOARD\n" +
                "  ORDER, so one unordered walk makes job assignment irreproducible — intermittently,\n" +
                "  which is the worst way for a determinism bug to arrive. It would move the pins\n" +
                "  (scenario 00e0a2dadb8e5076 · tick-3000 4be2e77864fb7409 · slice c565a68b810f588d).\n" +
                "  Zero-alloc matters too: foreach over a generic interface boxes its enumerator,\n" +
                "  and JobDispatchTests asserts 3000 dirty-every-tick rescans allocate ZERO bytes.\n" +
                "FIX: an indexed `for` over a List whose order you DECLARED. Every shipped board does\n" +
                "  this — HaulJobSource's `_items` (item store order) and `_stockpiles` (z,y,x).\n" +
                "  Need set semantics? Keep the HashSet for Contains() and a parallel List for order:\n" +
                "  JobWork.RebuildGroundItemTiles + `_stockpiles` is the shipped pattern.\n" +
                "  Copying the set out (.CopyTo / ToArray / .Keys / .Values) does NOT launder the\n" +
                "  order — that is the same bug with extra steps, which is why those are banned too.\n" +
                "NOTE: token ban, not type analysis, and it does NOT cover the contract's\n" +
                "  lambda/closure clause (`=>` is everywhere in expression-bodied members). Scope is\n" +
                "  Jobs/ only — Stock/StockZoneSystem.cs legitimately uses foreach off the tick path.");
        }

        // ================================================================ 6. drift detector

        /// <summary>
        /// EVERY FILE IN `Systems/` IS CLASSIFIED — economy or not. A new file under `Jobs/`,
        /// `Stock/`, `Production/` or `Mining/` inherits every assertion in this file automatically
        /// (globbed; proven by mutation). A new file under `Systems/` does NOT, because that
        /// directory is shared and the economy members are listed by hand — and `Systems/` is
        /// exactly where E0-6 (`Seals` + conversion loss) and E0-7 (ice → melter → water) are most
        /// likely to land. Without this test, a new economy system would silently sit outside every
        /// boundary check in this file.
        ///
        /// FIRE RATE, measured before writing this rather than guessed: 16 files have ever been
        /// added under `Systems/` across 302 commits, and only two since the engine port
        /// (`SafetySystem` at E0-2, `DeconstructSystem` at E0-5). So it asks a human one question
        /// roughly twice a year, at exactly the moment the answer matters. That is a prompt, not a
        /// tax.
        /// </summary>
        /// <summary>
        /// EVERY SIM MODULE IS DECLARED — the same gap as the `Systems/` census, one level up.
        ///
        /// `OwnNamespace` and `allowed` are hand-maintained maps keyed by module directory. A future
        /// `sim/Sim.Ui/` would therefore be **entirely unscanned**: no DAG check, no cycle check,
        /// nothing — because every other test in this file iterates the maps, not the filesystem.
        /// Worse, the first thing to notice would have been a bare `KeyNotFoundException` out of
        /// <see cref="CrossModuleUsings"/>, which tells a reader nothing. This closes both: a new
        /// module directory fails HERE first, with instructions.
        ///
        /// Cheap and near-zero fire rate: six module directories have existed since the founding
        /// commit and none has been added since.
        /// </summary>
        [Test]
        public void SimModuleCensus_ForcesADecisionOnEveryNewModule()
        {
            var declared = new List<string>(OwnNamespace.Keys);
            declared.Sort(StringComparer.Ordinal);

            var onDisk = new List<string>();
            foreach (var dir in Directory.GetDirectories(Path.Combine(RepoRoot(), "sim")))
                onDisk.Add(Path.GetFileName(dir));
            onDisk.Sort(StringComparer.Ordinal);

            Assert.That(onDisk, Is.EqualTo(declared),
                "UNDECLARED MODULE: sim/ gained or lost a module directory.\n" +
                "  declared (" + declared.Count + "): " + string.Join(", ", declared) + "\n" +
                "  on disk  (" + onDisk.Count + "): " + string.Join(", ", onDisk) + "\n" +
                "WHY: every other test in this file iterates the hand-maintained maps rather than the\n" +
                "  filesystem, so a module absent from them is a module NOTHING here checks — no DAG\n" +
                "  assertion, no cycle assertion. It would be invisible rather than merely unpinned.\n" +
                "FIX (a NEW module) — three edits, all in the same commit:\n" +
                "  1. OwnNamespace: its root namespace. Not mechanical — Sim.Core's is `Sim`.\n" +
                "  2. `allowed` in SimModules_FormTheDeclaredAcyclicDependencyGraph: which modules it\n" +
                "     may depend on. Keep the graph acyclic with Sim.Core as the sink.\n" +
                "  3. The hosts that should compile it — there are no per-module .csproj, so a module\n" +
                "     only ships if a host's <Compile Include> glob names it (economy-modularity §1.1;\n" +
                "     sim/Sim.Content is compiled by the TEST project alone and is dead at runtime,\n" +
                "     which is exactly the mistake to avoid repeating).\n" +
                "FIX (a REMOVED module): delete it from both maps, same commit.");
        }

        [Test]
        public void EconomySystemCensus_ForcesADecisionOnEveryNewSystemFile()
        {
            // NOT economy: ship physiology, crew, narrative. A positive list, so a new file cannot
            // join it by accident.
            var notEconomy = new[]
            {
                "AtmosphereSystem.cs", "CitizenSystem.cs", "ExplorationSystem.cs", "GoalSystem.cs",
                "HistorySystem.cs", "HydroponicsSystem.cs", "NeedsSystem.cs", "PowerSystem.cs",
                "SafetySystem.cs", "SustenanceSystem.cs", "ThermalSystem.cs", "WaterSystem.cs",
            };

            var expected = new List<string>(notEconomy);
            foreach (var rel in EconomyFilesInSharedDirectories)
                if (rel.StartsWith("Systems/", StringComparison.Ordinal))
                    expected.Add(rel.Substring("Systems/".Length));
            expected.Sort(StringComparer.Ordinal);

            var actual = new List<string>();
            foreach (var path in Directory.GetFiles(
                         Path.Combine(RepoRoot(), "sim", "Sim.Core", "Systems"), "*.cs"))
                actual.Add(Path.GetFileName(path));
            actual.Sort(StringComparer.Ordinal);

            Assert.That(actual, Is.EqualTo(expected),
                "UNCLASSIFIED SYSTEM: sim/Sim.Core/Systems/ gained or lost a file.\n" +
                "  expected (" + expected.Count + "): " + string.Join(", ", expected) + "\n" +
                "  actual   (" + actual.Count + "): " + string.Join(", ", actual) + "\n" +
                "WHY: Systems/ is a SHARED directory, so its economy members are listed by hand in\n" +
                "  EconomyFilesInSharedDirectories rather than globbed. A new economy system landing\n" +
                "  here would otherwise sit outside every boundary check in this file — and Systems/\n" +
                "  is where E0-6 (Seals, conversion loss) and E0-7 (ice → melter → water) are most\n" +
                "  likely to land.\n" +
                "FIX — answer one question: is the new file ECONOMY (matter, labour, items, work,\n" +
                "  machines, value)?\n" +
                "  • YES → add it to EconomyFilesInSharedDirectories. It then inherits the souls,\n" +
                "    ship-reach and hull-guard assertions; expect to extend the ship-reach allowlist\n" +
                "    with its measured counts, in the same commit.\n" +
                "  • NO  → add it to `notEconomy` in this test, and say in the commit message why it\n" +
                "    sits outside the economy boundary.\n" +
                "Either way it is one line, and the point is that someone DECIDED rather than\n" +
                "  defaulted. This fires about twice a year (16 adds in 302 commits, 2 since the\n" +
                "  engine port), so do not suppress it — read it.");
        }
    }
}
