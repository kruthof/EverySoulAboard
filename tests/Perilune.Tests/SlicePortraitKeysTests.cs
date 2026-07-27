using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tools;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// RISK 5, MECHANISED (ECONOMY-PLAN §7.5 — "`_nextEntityId` silently rebinding all eight crew
    /// portraits"). Entity ids are handed out in plan order and citizens come AFTER devices, so a
    /// single new <c>DeviceSpec</c> on the slice moves all eight crew ids by one — and a portrait
    /// key is <c>pk_fnv1a32(shipSeed, citizenId)</c>. The failure is not a missing image: every
    /// crew member starts wearing the NEXT crew member's face and the last one wears nothing. It is
    /// silent, it is visual, and nothing in the tree caught it. E0-7 is the lane that finally
    /// triggered it (the ice melter is the first device added to the slice since the portraits were
    /// baked), so E0-7 is the lane that pays for the guard.
    ///
    /// This test computes each key with the REAL <see cref="PersonaDump.PersonaKey"/> against the
    /// REAL built slice, then asks whether the client can resolve it — reading the two JS asset
    /// files as DATA rather than re-deriving the key or the mapping (§5.2 rule 1). It deliberately
    /// spans the language boundary because that is exactly where this bug lives: nothing else in
    /// the repo connects a C# entity id to a committed PNG.
    /// </summary>
    public class SlicePortraitKeysTests
    {
        /// <summary>Keys the browser can actually resolve: the generated manifest's own keys plus
        /// the hand-written adapter's remap. Parsed textually, comments stripped first — a guard
        /// that matches raw source is satisfied by the thing it guards against, COMMENTED OUT
        /// (CLAUDE.md trap 1), and this file's remap table is surrounded by prose that names every
        /// key in it.</summary>
        /// <summary>
        /// The remap, as pairs: crew member's NEW key → the manifest key whose PNG they keep.
        ///
        /// ⚠ BOTH HALVES MATTER, and an earlier draft collected only the left. Pointing an entry at
        /// a key the manifest does not contain left the whole gate green while one crew member wore
        /// somebody else's face: the adapter USED TO silently DROP an unresolvable target, with a
        /// <c>.filter(([, baked]) =&gt; PORTRAITS[baked])</c>, so the JS "nothing is invented" check
        /// never saw it and a left-hand-side-only completeness check passed while the key still
        /// resolved — through the generated manifest, to that person's predecessor's face.
        /// Found by independent review as survivor C19.
        ///
        /// PAST TENSE ON PURPOSE: that <c>.filter</c> was REMOVED in the same commit that found it.
        /// <c>client/assets/portraits-registry.js</c> now maps an unresolvable target to a visible
        /// <c>undefined</c> instead of dropping the row (there is a comment there saying so). The
        /// dangling-target assertion below is kept regardless — it names the offending key, where
        /// the JS side only observes an <c>undefined</c> URL.
        /// </summary>
        private static Dictionary<string, string> Remap()
        {
            string assets = FindClientAssetsDir();
            string registry = CodeOnly(File.ReadAllText(Path.Combine(assets, "portraits-registry.js")));
            var pairs = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (Match m in Regex.Matches(registry, @"(pk_[0-9a-f]{8})\s*:\s*'(pk_[0-9a-f]{8})'"))
                pairs[m.Groups[1].Value] = m.Groups[2].Value;
            return pairs;
        }

        /// <summary>Keys the GENERATED manifest declares — the only keys with a committed PNG
        /// behind them, and therefore the only legal remap targets.</summary>
        private static HashSet<string> ManifestKeys()
        {
            string assets = FindClientAssetsDir();
            string manifest = CodeOnly(File.ReadAllText(Path.Combine(assets, "portraits.g.js")));
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (Match m in Regex.Matches(manifest, "\"(pk_[0-9a-f]{8})\"\\s*:"))
                keys.Add(m.Groups[1].Value);
            return keys;
        }

        private static HashSet<string> ResolvableKeys(out int manifestKeys, out int remapKeys)
        {
            string assets = FindClientAssetsDir();
            Assert.That(assets, Is.Not.Null, "client/assets must be discoverable from " + AppContext.BaseDirectory);

            string manifest = CodeOnly(File.ReadAllText(Path.Combine(assets, "portraits.g.js")));
            string registry = CodeOnly(File.ReadAllText(Path.Combine(assets, "portraits-registry.js")));

            var keys = new HashSet<string>(StringComparer.Ordinal);
            // "pk_xxxxxxxx": { file: ... }   — the generated manifest's entries
            foreach (Match m in Regex.Matches(manifest, "\"(pk_[0-9a-f]{8})\"\\s*:"))
                keys.Add(m.Groups[1].Value);
            manifestKeys = keys.Count;

            // pk_xxxxxxxx: 'pk_yyyyyyyy'    — the adapter's remap (unquoted keys)
            int before = keys.Count;
            foreach (Match m in Regex.Matches(registry, @"(pk_[0-9a-f]{8})\s*:\s*'(pk_[0-9a-f]{8})'"))
                if (keys.Contains(m.Groups[2].Value)) keys.Add(m.Groups[1].Value);
            remapKeys = keys.Count - before;
            return keys;
        }

        /// <summary>
        /// EVERY slice crew member's portrait key resolves to a committed PNG, and the eight keys
        /// are DISTINCT — so no two crew share a face and nobody falls back to a silhouette.
        ///
        /// The distinctness half is not decoration: the failure mode this guards against is a
        /// PERMUTATION, and a set of eight keys that all resolved to one image would satisfy the
        /// resolvability half on its own.
        ///
        /// MUTATION THAT MAKES THIS FAIL: delete any one line from <c>SLICE_ID_SHIFT_REMAP</c> in
        /// <c>client/assets/portraits-registry.js</c> — the crew member it named is no longer
        /// REMAPPED and the test says whose face is wrong. ⚠ THIS MUTATION SURVIVED THE FIRST
        /// DRAFT of this test, which asserted only that each key RESOLVED: the deleted crew
        /// member's new key is another crew member's OLD key, so it was still in the generated
        /// manifest and still resolved — to the wrong face. The remap-completeness assertion below
        /// exists because of that survivor, and this note is here so nobody weakens it back.
        ///
        /// SECOND MUTATION: add one more <c>DeviceSpec</c> anywhere in
        /// <c>AuthoredShips.PeriluneSlice</c> — all eight keys shift again and all eight fail,
        /// which is precisely the silent regression this exists for. (Both applied, observed red,
        /// reverted.)
        /// </summary>
        [Test]
        public void EverySliceCrewMembersPortraitKeyResolvesToACommittedImage()
        {
            // ── STRUCTURE OF THE TWO ASSET FILES FIRST. These run before anything derived from
            //    them, because a derived set can be short for two very different reasons — a broken
            //    reader, or a dangling remap target — and the generic "reader is broken"
            //    precondition used to fire first and blame the wrong one.
            var remap = Remap();
            var manifestKeySet = ManifestKeys();
            Assert.That(manifestKeySet.Count, Is.GreaterThan(8),
                "PRECONDITION: portraits.g.js parsed to " + manifestKeySet.Count + " keys — reader broken");
            Assert.That(remap.Count, Is.EqualTo(8),
                "PRECONDITION: the remap table parsed to " + remap.Count + " entries, expected 8 " +
                "(one per slice crew member) — a broken reader or a comment stripper that swallowed " +
                "the table looks exactly like this");

            // THE SECOND DOOR (survivor C19): an entry whose TARGET is not a manifest key is
            // silently dropped by the adapter, so the remapped crew member falls through to whatever
            // the generated manifest happens to say for that key — their predecessor's face — and
            // every other guard stays green.
            var danglingTargets = new List<string>();
            foreach (var pair in remap)
                if (!manifestKeySet.Contains(pair.Value))
                    danglingTargets.Add($"{pair.Key} → {pair.Value}");
            danglingTargets.Sort(StringComparer.Ordinal);
            Assert.That(danglingTargets, Is.Empty,
                "A REMAP ENTRY POINTS AT A KEY THE GENERATED MANIFEST DOES NOT DECLARE. The adapter\n" +
                "  drops such an entry silently, so that crew member keeps resolving through the\n" +
                "  manifest to somebody else's baked face. Dangling: " + string.Join(", ", danglingTargets));

            // ...and no two crew may be sent to the SAME baked face, which a permutation typo does.
            var targets = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var pair in remap)
            {
                Assert.That(targets.ContainsKey(pair.Value), Is.False,
                    $"remap targets {pair.Value} twice ({targets.GetValueOrDefault(pair.Value)} and {pair.Key})");
                targets[pair.Value] = pair.Key;
            }

            var keys = ResolvableKeys(out int manifestKeys, out int remapKeys);
            Assert.That(manifestKeys, Is.GreaterThan(8),
                "PRECONDITION: portraits.g.js parsed to " + manifestKeys + " keys — the reader is broken");
            // A `remapKeys >= 0` assertion stood here and was replaced at the wave merge: a count is
            // never negative, so it could not fail. This one can — an empty remap, or one whose every
            // target dangles, contributes nothing and reads 0.
            Assert.That(remapKeys, Is.GreaterThan(0),
                "PRECONDITION: the adapter's remap contributes no resolvable key at all — either the "
                + "table is empty or every target dangles, and the eight-crew check below would then "
                + "be measuring the generated manifest alone");

            var host = GenSimHost.Build(AuthoredShips.PeriluneSlice());
            var citizens = host.Sim.Citizens.Items;
            Assert.That(citizens.Count, Is.EqualTo(8), "PRECONDITION: the slice still crews eight");

            var seen = new Dictionary<string, string>(StringComparer.Ordinal);
            var missing = new List<string>();
            for (int i = 0; i < citizens.Count; i++)
            {
                string key = PersonaDump.PersonaKey(AuthoredShips.SliceSeed, citizens[i].Id);
                if (!keys.Contains(key))
                    missing.Add($"{citizens[i].Name} (id {citizens[i].Id}) → {key}");
                if (seen.TryGetValue(key, out string other))
                    Assert.Fail($"{citizens[i].Name} and {other} resolve to the SAME portrait key {key}");
                seen[key] = citizens[i].Name;
            }

            // ── THE HOLE THIS TEST HAD, AND HOW IT WAS FOUND. "Resolves to a committed image" is
            //    NOT enough, and a mutation proved it: deleting ONE crew member's line from
            //    SLICE_ID_SHIFT_REMAP left this test GREEN, because that crew member's NEW key
            //    happens to be another crew member's OLD key and is therefore still in the
            //    generated manifest — resolving, correctly-shaped, and showing the wrong face.
            //    A permutation is exactly the failure this file exists for, so the property has to
            //    be that every crew member is REMAPPED, not merely resolvable.
            //
            //    NOTE THE LIMIT HONESTLY: nothing here can verify that Amara's key points at
            //    AMARA's face. That fact lives only in the baking, and the remap table IS the
            //    record of it. What is mechanised is "there is a decision recorded for every crew
            //    member, and no two of them collide"; reading the faces is a human job, once.
            var unremapped = new List<string>();
            for (int i = 0; i < citizens.Count; i++)
            {
                string key = PersonaDump.PersonaKey(AuthoredShips.SliceSeed, citizens[i].Id);
                if (!remap.ContainsKey(key)) unremapped.Add($"{citizens[i].Name} → {key}");
            }
            Assert.That(unremapped, Is.Empty,
                "NOT EVERY SLICE CREW MEMBER HAS A REMAP ENTRY. Their key may still RESOLVE — the\n" +
                "  keys overlap between generations — but it resolves to somebody else's face.\n" +
                "Unremapped: " + string.Join(", ", unremapped));

            Assert.That(missing, Is.Empty,
                "SLICE PORTRAIT KEYS NO LONGER RESOLVE — the crew are wearing each other's faces.\n" +
                "This happens when a DeviceSpec is added to (or removed from) AuthoredShips\n" +
                "  .PeriluneSlice: ids are handed out in plan order, citizens come after devices, and\n" +
                "  a portrait key is pk_fnv1a32(seed, citizenId).\n" +
                "FIX: re-measure with `dotnet run --project hosts/scenario -- dump-personas --ship\n" +
                "  slice`, then update SLICE_ID_SHIFT_REMAP in client/assets/portraits-registry.js so\n" +
                "  each NEW key points at the PNG baked for that same crew member. Do NOT rename the\n" +
                "  PNGs and do NOT regenerate art.\n" +
                "Unresolved: " + string.Join(", ", missing));
        }

        // ------------------------------------------------------------------ helpers

        /// <summary>Quote-aware line/block comment stripper for JS. Copied in shape from
        /// <c>SurfaceBoundaryTests.CodeOnly</c>: a quoted <c>//</c> must not blind the stripper and
        /// swallow the rest of the file.</summary>
        private static string CodeOnly(string src)
        {
            var sb = new System.Text.StringBuilder(src.Length);
            bool inLine = false, inBlock = false, inStr = false;
            char quote = '\0';
            for (int i = 0; i < src.Length; i++)
            {
                char c = src[i];
                char next = i + 1 < src.Length ? src[i + 1] : '\0';
                if (inLine) { if (c == '\n') { inLine = false; sb.Append(c); } continue; }
                if (inBlock) { if (c == '*' && next == '/') { inBlock = false; i++; } continue; }
                if (inStr)
                {
                    sb.Append(c);
                    if (c == '\\') { if (i + 1 < src.Length) sb.Append(src[++i]); continue; }
                    if (c == quote) inStr = false;
                    continue;
                }
                if (c == '"' || c == '\'' || c == '`') { inStr = true; quote = c; sb.Append(c); continue; }
                if (c == '/' && next == '/') { inLine = true; continue; }
                if (c == '/' && next == '*') { inBlock = true; i++; continue; }
                sb.Append(c);
            }
            return sb.ToString();
        }

        /// <summary>
        /// NEGATIVE CONTROL for <see cref="CodeOnly"/>: a commented-out remap line must NOT be
        /// picked up, and — the half that is usually forgotten and that landed broken in two
        /// packages on one day — a LATER REAL entry after the comment must still be seen. Without
        /// the second half a stripper that swallows the whole rest of the file would pass.
        /// </summary>
        [Test]
        public void TheCommentStripper_BlindsACommentedRemap_ButNotTheOneAfterIt()
        {
            const string src =
                "const R = Object.freeze({\n" +
                "  // pk_deadbeef: 'pk_00000000', // retired\n" +
                "  /* pk_cafebabe: 'pk_11111111', */\n" +
                "  pk_12345678: 'pk_99999999', // THE REAL ONE, after both comments\n" +
                "  note: 'a quoted // slash must not blind the stripper',\n" +
                "  pk_87654321: 'pk_88888888',\n" +
                "});\n";
            string code = CodeOnly(src);
            var found = new List<string>();
            foreach (Match m in Regex.Matches(code, @"(pk_[0-9a-f]{8})\s*:\s*'(pk_[0-9a-f]{8})'"))
                found.Add(m.Groups[1].Value);

            CollectionAssert.DoesNotContain(found, "pk_deadbeef", "a // commented entry must be blind");
            CollectionAssert.DoesNotContain(found, "pk_cafebabe", "a /* */ commented entry must be blind");
            CollectionAssert.Contains(found, "pk_12345678", "the REAL entry after both comments must survive");
            CollectionAssert.Contains(found, "pk_87654321",
                "and so must one after a string literal containing '//' — a stripper blinded by that " +
                "quote would swallow the rest of the file and the guard would silently pass");
        }

        private static string FindClientAssetsDir()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(dir.FullName, "client", "assets");
                if (File.Exists(Path.Combine(candidate, "portraits.g.js"))) return candidate;
                dir = dir.Parent;
            }
            return null;
        }
    }
}
