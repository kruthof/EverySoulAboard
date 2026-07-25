using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
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
    ///   • A regex is not a compiler. A dependency introduced via a fully-qualified name
    ///     (`Perilune.Glyph.GlyphColor.Foo` with no `using`) is INVISIBLE to the DAG tests.
    ///     They pin the DECLARED dependency (the `using` line), which is what a reviewer reads
    ///     and what a future .csproj split would turn into a `ProjectReference`.
    ///   • The identifier and call-site scans run over CODE ONLY (<see cref="CodeOnly"/>), because
    ///     a doc comment naming a downstream consumer is documentation, not a dependency — deleting
    ///     such a comment to appease a test is precisely the maintenance tax this file must not
    ///     create. That stripper is deliberately fail-OPEN: an unhandled construct makes it see less
    ///     code, so the worst case is a missed violation, never a false failure. Read its doc before
    ///     trusting a pass.
    ///   • Line numbers are never asserted. E0-4 is editing `Jobs/Sources/HaulJobSource.cs` and
    ///     `Stock/StockZoneSystem.cs` in a sibling worktree right now; a test keyed on line numbers
    ///     would be a tripwire people learn to ignore. Counts and file identities are asserted.
    ///
    /// HOW TO RESPOND WHEN ONE OF THESE FAILS. Every message below names the boundary, why it
    /// exists, and the two legitimate paths forward. None of these invariants is sacred — they are
    /// *measured facts we chose to keep*. Crossing one deliberately means editing the allowlist in
    /// this file IN THE SAME COMMIT as the crossing, and saying why in the commit message. That
    /// edit is the point: it makes an architectural decision visible in a diff instead of
    /// invisible in a merge.
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
                // Build output can contain generated .cs (AssemblyInfo, ref assemblies). It is not
                // hand-written source and must never be scanned.
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

        /// <summary>The `using Perilune.X;` module names declared by one file, ordinal-sorted.
        /// Matches only a leading `using` (a file-scoped declaration), never a using INSIDE a
        /// comment block, because the line must start with `using` after trimming.</summary>
        private static List<string> DeclaredPeriluneUsings(string path)
        {
            var modules = new List<string>();
            foreach (var raw in File.ReadAllLines(path))
            {
                string line = raw.Trim();
                if (!line.StartsWith("using Perilune", StringComparison.Ordinal)) continue;
                // "using Perilune.Dsl;" -> "Dsl";  "using Perilune.Llm.Providers;" -> "Llm"
                string tail = line.Substring("using ".Length).TrimEnd(';').Trim();
                string[] parts = tail.Split('.');
                modules.Add(parts.Length >= 2 ? parts[1] : tail);
            }
            modules.Sort(StringComparer.Ordinal);
            return modules;
        }

        // ---------------------------------------------------------------- the economy file set

        /// <summary>
        /// THE ECONOMY, as a file set. Whole directories are globbed rather than listed so a NEW
        /// economy file is covered automatically — a lane adding `Jobs/Sources/MineJobSource.cs`
        /// (E-MINE) inherits every assertion here without touching this file. The four economy
        /// systems that live in shared directories are listed explicitly because their neighbours
        /// (`Systems/AtmosphereSystem.cs`, `Systems/NeedsSystem.cs`, …) are emphatically NOT
        /// economy and must not be scanned.
        ///
        /// `Stock/`, `Production/`, `Mining/` and `Space/TradeSystem.cs` are the W0-6 empty
        /// registrations — no behaviour yet, but they are where E-STOCK / E-PROD / E-MINE / E-VOY
        /// land, so they are inside the boundary from the start rather than joining it later.
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

            foreach (var rel in new[]
            {
                "Systems/BuildSystem.cs",        // the pending-build registry
                "Systems/DeconstructSystem.cs",  // build's inverse (E0-5)
                "Systems/CraftingSystem.cs",     // bills at stations
                "Systems/MachineWearSystem.cs",  // wear + MaintenanceSystem (two classes, one file)
                "Entities/ItemStack.cs",         // ItemKind + the stack
                "Defs/ProductionDefs.cs",        // the [production] node table
                "Space/TradeSystem.cs",          // E-VOY trade (empty registration)
            })
            {
                string abs = Path.Combine(root, "sim", "Sim.Core", rel.Replace('/', Path.DirectorySeparatorChar));
                Assert.That(File.Exists(abs), Is.True,
                    "the economy file sim/Sim.Core/" + rel + " must exist — if it moved, update " +
                    "EconomyFiles() in this file in the same commit");
                files.Add(abs);
            }

            files.Sort(StringComparer.Ordinal);
            return files;
        }

        /// <summary>Occurrences of a literal substring in a file. Raw text: comments included.</summary>
        private static int CountOccurrences(string text, string needle)
        {
            int n = 0, i = 0;
            while ((i = text.IndexOf(needle, i, StringComparison.Ordinal)) >= 0) { n++; i += needle.Length; }
            return n;
        }

        /// <summary>
        /// Source with comments removed, so a DEPENDENCY scan is not fooled by PROSE.
        ///
        /// This distinction is load-bearing rather than pedantic. `DeconstructSystem.cs:441` has a
        /// doc comment reading *"…which HistorySystem turns into a Chronicle line naming the crew
        /// member"* — describing a DOWNSTREAM consumer of the event it publishes. That is exactly
        /// the documentation we want, and the economy has no dependency on `Chronicle` whatsoever
        /// (it publishes `DeconstructCompletedEvent`; `HistorySystem`, outside the economy, writes
        /// the Chronicle). A raw-text scan would flag it and the "fix" would be to delete a true
        /// comment — the maintenance tax this whole file is meant to avoid.
        ///
        /// EXACTLY WHAT THIS HANDLES, and how it fails. It drops `/* … */` spans and everything
        /// from a `//` (or `///`) to end of line. It does NOT track string literals, so a `//`
        /// inside a string would truncate the rest of that line. Verified 2026-07-25 against the
        /// economy file set: no string literal contains `//`, every `/* */` is single-line, and
        /// there are no verbatim (`@"…"`) strings — so this is exact for the current set.
        ///
        /// It fails in the SAFE direction on purpose: an unhandled construct makes the scan see
        /// LESS code, so the worst case is a missed violation (a false pass), never a false failure
        /// that blocks a legitimate commit. A regex is not a compiler; when it is unsure it should
        /// get out of the way rather than cry wolf.
        /// </summary>
        private static string CodeOnly(string source)
        {
            var sb = new StringBuilder(source.Length);
            for (int i = 0; i < source.Length; i++)
            {
                if (source[i] == '/' && i + 1 < source.Length && source[i + 1] == '/')
                {
                    while (i < source.Length && source[i] != '\n') i++;
                    sb.Append('\n');
                    continue;
                }
                if (source[i] == '/' && i + 1 < source.Length && source[i + 1] == '*')
                {
                    int end = source.IndexOf("*/", i + 2, StringComparison.Ordinal);
                    i = end < 0 ? source.Length : end + 1; // unterminated ⇒ drop the rest (safe direction)
                    sb.Append(' ');
                    continue;
                }
                sb.Append(source[i]);
            }
            return sb.ToString();
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
        [Test]
        public void SimCore_DependsOnNothingElseInTheRepo()
        {
            var offenders = new List<string>();
            foreach (var path in ModuleFiles("Sim.Core"))
                foreach (var module in DeclaredPeriluneUsings(path))
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
                    foreach (var module in DeclaredPeriluneUsings(path))
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
                "  compiler cannot see a cycle (economy-modularity §1.1).\n" +
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
                foreach (var module in DeclaredPeriluneUsings(path))
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
                if (DeclaredPeriluneUsings(path).Count > 0)
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
        /// THE ECONOMY KNOWS NOTHING ABOUT SOULS, PRESENTATION OR PHYSIOLOGY. Measured 2026-07-25:
        /// every identifier below appears ZERO times across the whole economy file set — not in
        /// code and not even in a comment. That is why this scan is raw text with no
        /// comment-stripping: the assertion is absolute, so it needs no fragile C#-parsing regex
        /// and cannot be fooled by one.
        ///
        /// TWO REASONS THIS MATTERS, and they pull in opposite directions — read both before
        /// "fixing" a failure.
        ///
        /// 1. PORTABILITY (keep it at zero). An economy that reads mood, personas or glyph colours
        ///    is welded to *this* game. The measured zero is the best evidence in
        ///    economy-modularity §1.5 that the economy is closer to generic than the docs implied.
        ///
        /// 2. THE BINDING PRINCIPLE (this zero is ALSO the gap). `docs/design/
        ///    perilune-automation-and-souls.md` §4 — a DESIGN AUTHORITY — requires that "mood +
        ///    skill are the throughput". `Mood` and `Skill` being absent here is precisely why that
        ///    principle is 0 % implemented (economy-modularity §6). E2 is *supposed* to cross this
        ///    line.
        ///
        /// So this test is not a wall, it is a checkpoint. When E2 lands the operator model, the
        /// right response is to remove `Mood` (and add `Skill`, once it exists) from the forbidden
        /// list — deliberately, in the E2 commit, with the design authority cited. What must NOT
        /// happen is a stray `citizen.Mood` sneaking into a job source as a balance tweak. The
        /// difference between those two is exactly what this test forces someone to notice.
        ///
        /// NOTE the intended shape of the eventual crossing: economy-modularity §7 step 1 proposes
        /// ONE seam (`JobWork.WorkRate`) so that mood/skill enter the economy in a single function
        /// rather than at the five independent `--citizen.JobWorkTicks` sites. If this test fails
        /// with mood references scattered across several files, that is the wrong shape.
        /// </summary>
        [Test]
        public void Economy_KnowsNothingAboutSoulsPresentationOrPhysiology()
        {
            // Grouped by what they are, because the right response differs per group.
            var forbidden = new (string Name, string Why)[]
            {
                // Souls / inner life. E2 is expected to cross Mood and Skill — see the doc comment.
                ("Mood",           "crew inner life — E2's operator model crosses this DELIBERATELY, via one seam"),
                ("Morale",         "crew inner life"),
                ("Skill",          "does not exist anywhere in sim/ yet; E2 introduces it"),
                ("Persona",        "LLM persona sheets"),
                ("CitizenMind",    "LLM-facing mind state"),
                ("CitizenMemory",  "MEMS persistence"),
                ("Chronicle",      "narrative record"),
                ("Eulogy",         "narrative record"),
                ("SocialSystem",   "relationships"),
                ("RelationType",   "relationships"),
                // The LLM. Must never be reachable from a deterministic tick path.
                ("Llm",            "the LLM runtime — never on a deterministic tick path"),
                ("IChatBackend",   "the LLM runtime"),
                // Presentation. The projection reads the sim; the sim must never read the projection.
                ("Glyph",          "presentation — projection is one-way, sim → glyph"),
                ("GlyphColor",     "presentation"),
                ("GlyphMapper",    "presentation"),
                // Physiology. Needs belong to NeedsSystem/SustenanceSystem/SafetySystem, not to work.
                ("Suffocation",    "physiology — SafetySystem owns fleeing lethal air, not the job board"),
                ("Hunger",         "physiology — SustenanceSystem owns eating"),
                ("Thirst",         "physiology — SustenanceSystem owns drinking"),
                ("Fatigue",        "physiology — and note Citizen.cs's claim that it 'slows work' is FALSE"),
                // Spatial vocabulary the sim does not actually have.
                ("Deck",           "the sim has z-levels, not 'decks'; hauling is deck-agnostic"),
            };

            var offenders = new List<string>();
            foreach (var path in EconomyFiles())
            {
                // CODE only. A doc comment naming a downstream consumer is documentation, not a
                // dependency — see CodeOnly() for the concrete case that forced this distinction.
                string code = CodeOnly(File.ReadAllText(path));
                foreach (var (name, why) in forbidden)
                {
                    int n = CountOccurrences(code, name);
                    if (n > 0)
                        offenders.Add(string.Format(CultureInfo.InvariantCulture,
                            "{0}: '{1}' ×{2}  [{3}]", Rel(path), name, n, why));
                }
            }

            Assert.That(offenders, Is.Empty,
                "BOUNDARY CROSSED: the economy now references souls / presentation / physiology.\n" +
                "  found: " + string.Join("\n         ", offenders) + "\n" +
                "WHY (portability): every one of these identifiers was measured at ZERO across the\n" +
                "  whole economy file set on 2026-07-25 — comments included. That zero is the\n" +
                "  strongest evidence in economy-modularity §1.5 that this economy is close to a\n" +
                "  generic tile-colony economy rather than welded to a spaceship with an LLM crew.\n" +
                "WHY (design): the same zero is the GAP. docs/design/perilune-automation-and-souls.md\n" +
                "  §4 is binding and requires 'mood + skill are the throughput'. E2 is supposed to\n" +
                "  cross this line for Mood and Skill.\n" +
                "SO — WHICH IS THIS?\n" +
                "  (a) E2 / the operator model: correct and expected. Remove that identifier from\n" +
                "      `forbidden` above in the SAME commit, cite the design authority, and make sure\n" +
                "      it enters through ONE seam (economy-modularity §7 step 1 proposes\n" +
                "      JobWork.WorkRate) — not scattered across job sources. Several files in this\n" +
                "      failure list is the WRONG shape even for E2.\n" +
                "  (b) anything else — a balance tweak reading citizen.Mood, a job source importing a\n" +
                "      GlyphColor, an economy system checking Suffocation: revert it. SafetySystem\n" +
                "      owns lethal air; SustenanceSystem owns eating and drinking; the projection is\n" +
                "      one-way. Reaching for these from the economy is how the two halves of this\n" +
                "      game become one tangled half.");
        }

        // ================================================================ 4. economy → ship

        /// <summary>
        /// THE ECONOMY REACHES INTO SHIP SYSTEMS AT EXACTLY THESE SITES — an allowlist, pinned by
        /// count, keyed by file (never by line number: E0-4 is editing this directory in a sibling
        /// worktree as of 2026-07-25).
        ///
        /// This is `docs/design/perilune-economy-modularity.md` §1.5's table, mechanised — and
        /// writing the test CORRECTED it. The doc's headline said "exactly six game-specific call
        /// sites" and its own member table listed `sim.PowerDirty` ×2 without counting them. The
        /// measured total is SEVEN reaches into ship state: five `sim.Rooms` and two
        /// `sim.PowerDirty`. §1.5 is amended accordingly.
        ///
        /// Read the shape, because the shape is the finding: THREE of the five `sim.Rooms` reaches
        /// are `MarkDirty()` — a void notification, no read, trivially replaceable by an event
        /// (economy-modularity §7 step 4). Only `MachineWearSystem` genuinely READS ship state
        /// (a room's temperature, to modulate wear — a generic mechanism with a game-specific
        /// source for the value). `sim.PowerDirty` is likewise a notification, not a read.
        ///
        /// `IsPressureHull` is deliberately NOT counted as a reach: it is a static predicate
        /// defined INSIDE the economy that reads `World` geometry, not a ship system. It is
        /// asserted separately below, because which file may know that vacuum exists is its own
        /// boundary.
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
                    // THE ONLY REAL READ in the whole economy: room temperature modulates wear.
                    ["sim/Sim.Core/Systems/MachineWearSystem.cs"] = 2,
                },
                ["sim.PowerDirty"] = new Dictionary<string, int>(StringComparer.Ordinal)
                {
                    // NOTIFY-ONLY: structural change may alter conduit reachability.
                    ["sim/Sim.Core/Systems/BuildSystem.cs"] = 1,
                    ["sim/Sim.Core/Systems/DeconstructSystem.cs"] = 1,
                },
            };

            var problems = new List<string>();
            foreach (var pattern in allowlist)
            {
                var expected = pattern.Value;
                foreach (var path in EconomyFiles())
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
                {
                    bool present = false;
                    foreach (var path in EconomyFiles()) if (Rel(path) == entry.Key) { present = true; break; }
                    if (!present)
                        problems.Add("stale allowlist entry: " + entry.Key + " ('" + pattern.Key +
                                     "') is not in the economy file set");
                }
            }

            Assert.That(problems, Is.Empty,
                "BOUNDARY CHANGED: the economy's reach into ship systems moved.\n" +
                "  " + string.Join("\n  ", problems) + "\n" +
                "WHY: the whole portability argument in economy-modularity §1.5 rests on this reach\n" +
                "  being tiny and enumerable — SEVEN sites, of which SIX are notify-only\n" +
                "  (3× sim.Rooms.MarkDirty, 2× sim.PowerDirty) and exactly ONE is a real read\n" +
                "  (MachineWearSystem's room temperature). An economy that starts reading rooms,\n" +
                "  atmosphere or power is an economy that cannot be reused anywhere.\n" +
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
        /// NO `foreach` IN `sim/Sim.Core/Jobs/`. This is a DETERMINISM rule, not a style
        /// preference — `IJobSource.cs`'s arbitration contract states it outright: use
        /// `HashSet`/`Dictionary` "for LOOKUP ONLY and never iterate them (that is a determinism
        /// rule, not a perf one), indexed `for` only, no LINQ, no lambdas, no closures."
        ///
        /// Hash-container iteration order is not specified by the runtime and can differ between
        /// runs, versions and platforms. The job board's arbitration is a global argmin whose ties
        /// break on board order, so a single unordered iteration silently makes job assignment
        /// non-reproducible — which moves the determinism pins and, worse, does so intermittently.
        ///
        /// A regex cannot type-resolve, so it cannot tell `foreach` over a `List` (harmless) from
        /// `foreach` over a `HashSet` (a determinism bug). It does not need to: `Jobs/` currently
        /// contains ZERO `foreach` of any kind, and every board is walked with an indexed `for`
        /// already. Banning the keyword outright in this one directory is therefore exact today,
        /// costs nothing, and is far more robust than trying to parse C# — and the rule's own
        /// wording ("indexed `for` only") is what is being enforced. Five files elsewhere in
        /// Sim.Core do use `foreach`; this is a Jobs/-only constraint, deliberately.
        /// </summary>
        [Test]
        public void EconomyJobBoard_UsesIndexedForOnly_NoForeach()
        {
            var offenders = new List<string>();
            var jobFiles = Directory.GetFiles(
                Path.Combine(RepoRoot(), "sim", "Sim.Core", "Jobs"), "*.cs", SearchOption.AllDirectories);
            Array.Sort(jobFiles, StringComparer.Ordinal);
            Assert.That(jobFiles, Is.Not.Empty, "sim/Sim.Core/Jobs must contain .cs files");

            foreach (var path in jobFiles)
            {
                // Comments stripped by the same helper the other scans use, so the class doc's
                // prose ("never iterate them") and this very sentence cannot trip the test.
                string[] codeLines = CodeOnly(File.ReadAllText(path)).Split('\n');
                for (int i = 0; i < codeLines.Length; i++)
                {
                    string t = codeLines[i].Trim();
                    if (t.StartsWith("foreach", StringComparison.Ordinal) ||
                        t.Contains(" foreach ") || t.Contains(" foreach(") ||
                        t.Contains("\tforeach") || t.Contains("{foreach"))
                        offenders.Add(string.Format(CultureInfo.InvariantCulture,
                            "{0}:{1}: {2}", Rel(path), i + 1, t));
                }
            }

            Assert.That(offenders, Is.Empty,
                "DETERMINISM RULE VIOLATED: a `foreach` appeared in sim/Sim.Core/Jobs/.\n" +
                "  " + string.Join("\n  ", offenders) + "\n" +
                "WHY: IJobSource.cs's arbitration contract requires HashSet/Dictionary be used for\n" +
                "  LOOKUP ONLY and never iterated — 'that is a determinism rule, not a perf one,\n" +
                "  indexed `for` only, no LINQ, no lambdas, no closures'. Hash-container iteration\n" +
                "  order is unspecified, and the dispatcher's global argmin breaks ties on BOARD\n" +
                "  ORDER, so one unordered walk makes job assignment irreproducible — intermittently,\n" +
                "  which is the worst way for a determinism bug to arrive. It would move the pins\n" +
                "  (scenario 00e0a2dadb8e5076 · tick-3000 4be2e77864fb7409 · slice 1f8f2225ee568de9).\n" +
                "  Zero-alloc matters too: foreach over a generic interface boxes its enumerator.\n" +
                "FIX: an indexed `for` over a List whose order you declared. Every shipped board does\n" +
                "  this — see HaulJobSource's `_items` (item store order) and `_stockpiles` (z,y,x).\n" +
                "  Need set semantics? Keep the HashSet for Contains() and a parallel List for order,\n" +
                "  which is exactly what JobWork.RebuildGroundItemTiles + `_stockpiles` already do.\n" +
                "NOTE: this test bans the keyword outright because Jobs/ has zero `foreach` today and\n" +
                "  a regex cannot tell a List walk from a HashSet walk. If you have a genuinely safe,\n" +
                "  order-declared foreach, prefer the indexed `for` anyway — the rule says so.");
        }
    }
}
