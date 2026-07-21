using System;
using System.Collections.Generic;
using System.IO;
using Perilune.Content;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Sim.Content pack loader (WS-CONTENT P1, the DLC/mod substrate): manifest
    /// parsing, deterministic dependency ordering, fail-soft degradation, later-pack
    /// override semantics, fingerprinting, and the keystone — loading the shipped
    /// core pack through Sim.Content is bit-equivalent to the direct DefsParser path.
    /// </summary>
    public class ContentPackTests
    {
        private static PackSource Pack(string id, string deps = null,
            (string, string)[] defs = null, (string, string)[] rules = null)
        {
            var problems = new List<string>();
            string toml = "id = \"" + id + "\"\n" +
                          (deps != null ? "dependencies = [" + deps + "]\n" : "");
            var p = new PackSource { Manifest = PackManifest.Parse(toml, id + "/pack.toml", problems) };
            Assert.That(p.Manifest, Is.Not.Null);
            if (defs != null) foreach (var d in defs) p.DefFiles.Add(d);
            if (rules != null) foreach (var r in rules) p.RuleFiles.Add(r);
            return p;
        }

        [Test]
        public void ManifestParsesFullFormAndFailsSoft()
        {
            var problems = new List<string>();
            var m = PackManifest.Parse(
                "# comment\nid = \"ports-of-call\"\nname = 'Ports of Call'\nversion = \"1.2.0\"\n" +
                "dependencies = [\"core\", \"biosphere\"]\nfuture_key = 7\nnot a pair\n",
                "pack.toml", problems);

            Assert.That(m.Id, Is.EqualTo("ports-of-call"));
            Assert.That(m.Name, Is.EqualTo("Ports of Call"));
            Assert.That(m.Version, Is.EqualTo("1.2.0"));
            Assert.That(m.Dependencies, Is.EqualTo(new[] { "core", "biosphere" }));
            Assert.That(problems.Count, Is.EqualTo(2), "unknown key + malformed line warn, never throw");
        }

        [Test]
        public void ManifestWithoutIdIsSkippedWithProblem()
        {
            var problems = new List<string>();
            var m = PackManifest.Parse("name = \"anonymous\"\n", "pack.toml", problems);
            Assert.That(m, Is.Null);
            Assert.That(problems, Has.Some.Contains("no 'id'"));
        }

        [Test]
        public void DependenciesOrderBeforeDependentsWithOrdinalTiebreak()
        {
            var problems = new List<string>();
            // Discovery order deliberately scrambled; zeta has no deps but sorts after core.
            var ordered = ContentSet.ResolveOrder(new[]
            {
                Pack("zeta"),
                Pack("addon", deps: "\"zeta\", \"core\""),
                Pack("core"),
            }, problems);

            Assert.That(problems, Is.Empty);
            Assert.That(new[] { ordered[0].Manifest.Id, ordered[1].Manifest.Id, ordered[2].Manifest.Id },
                Is.EqualTo(new[] { "core", "zeta", "addon" }));
        }

        [Test]
        public void MissingDependencyWarnsOnceAndStillLoads()
        {
            var problems = new List<string>();
            var ordered = ContentSet.ResolveOrder(new[]
            {
                Pack("addon", deps: "\"dlc-not-installed\""),
                Pack("core"),
            }, problems);

            Assert.That(ordered.Count, Is.EqualTo(2), "missing dep must not brick the pack");
            int warnings = 0;
            for (int i = 0; i < problems.Count; i++)
                if (problems[i].Contains("dlc-not-installed")) warnings++;
            Assert.That(warnings, Is.EqualTo(1), "exactly one degradation warning");
        }

        [Test]
        public void DependencyCycleDegradesToOrdinalOrder()
        {
            var problems = new List<string>();
            var ordered = ContentSet.ResolveOrder(new[]
            {
                Pack("b", deps: "\"a\""),
                Pack("a", deps: "\"b\""),
            }, problems);

            Assert.That(ordered.Count, Is.EqualTo(2));
            Assert.That(ordered[0].Manifest.Id, Is.EqualTo("a"));
            Assert.That(problems, Has.Some.Contains("cycle"));
        }

        [Test]
        public void LaterPackOverridesDefValuesAndReplacesSameNamedRule()
        {
            var problems = new List<string>();
            var packs = new[]
            {
                Pack("core",
                    defs: new[] { ("social.def", "[social]\nfamiliarize_per_hour = 2\n") },
                    rules: new[] { ("guard", "alarm when ship.heat > 0.9, \"HOT\"") }),
                Pack("mod", deps: "\"core\"",
                    defs: new[] { ("social.def", "[social]\nfamiliarize_per_hour = 8\n") },
                    rules: new[] { ("guard", "alarm when ship.heat > 0.5, \"WARM\"") }),
            };

            var defs = ContentSet.BuildDefs(packs, problems);
            Assert.That(defs.Social.FamiliarizePerHour, Is.EqualTo(8f), "later pack wins per key");
            Assert.That(defs.Rules.Length, Is.EqualTo(1), "same-named rule replaced, not duplicated");
            Assert.That(defs.Rules[0].Source, Does.Contain("WARM"));
            Assert.That(problems, Has.Some.Contains("overrides an earlier pack's rule"));
        }

        [Test]
        public void ShippedCorePackLoadsBitEquivalentToDirectParse()
        {
            string dir = DiscoverCoreDir();
            var problems = new List<string>();

            // Assemble the core pack exactly as a host would (Ordinal file order).
            var pack = new PackSource
            {
                Manifest = PackManifest.Parse(File.ReadAllText(Path.Combine(dir, "pack.toml")),
                                              "core/pack.toml", problems)
            };
            string simDefs = Path.Combine(dir, "SimDefs");
            string[] defPaths = Directory.GetFiles(simDefs, "*.def");
            Array.Sort(defPaths, StringComparer.Ordinal);
            foreach (var p in defPaths)
                pack.DefFiles.Add((Path.GetFileName(p), File.ReadAllText(p)));
            string[] rulePaths = Directory.GetFiles(Path.Combine(simDefs, "rules"), "*.moss");
            Array.Sort(rulePaths, StringComparer.Ordinal);
            foreach (var p in rulePaths)
                pack.RuleFiles.Add((Path.GetFileNameWithoutExtension(p), File.ReadAllText(p)));

            var viaPacks = ContentSet.BuildDefs(new[] { pack }, problems);
            Assert.That(problems, Is.Empty, string.Join(" | ", problems));

            var direct = DefsParser.Parse(pack.DefFiles, pack.RuleFiles, new List<string>());
            Assert.That(viaPacks.Checksum, Is.EqualTo(direct.Checksum),
                "pack-channel loading must be bit-equivalent to the direct parse path");
        }

        [Test]
        public void FingerprintTracksContentBytesAndOrder()
        {
            var problems = new List<string>();
            var a1 = ContentSet.ResolveOrder(new[] { Pack("core",
                defs: new[] { ("x.def", "[social]\nmax_opinion = 100\n") }) }, problems);
            var a2 = ContentSet.ResolveOrder(new[] { Pack("core",
                defs: new[] { ("x.def", "[social]\nmax_opinion = 100\n") }) }, problems);
            var b = ContentSet.ResolveOrder(new[] { Pack("core",
                defs: new[] { ("x.def", "[social]\nmax_opinion = 90\n") }) }, problems);

            Assert.That(ContentSet.Fingerprint(a1), Is.EqualTo(ContentSet.Fingerprint(a2)));
            Assert.That(ContentSet.Fingerprint(a1), Is.Not.EqualTo(ContentSet.Fingerprint(b)));
        }

        private static string DiscoverCoreDir()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(dir.FullName, "content", "core");
                if (File.Exists(Path.Combine(candidate, "pack.toml"))) return candidate;
                dir = dir.Parent;
            }
            Assert.Fail("content/core must be discoverable from the test binary");
            return null;
        }
    }
}
