using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// THE SURFACE BOUNDARY, HOST SIDE. The client-side half of this guard lives in
    /// <c>client/test/surface-boundary.test.js</c> and answers "did someone build a player-facing
    /// verb on the surface we are deleting?". This file answers the INVERSE question: "did someone
    /// build a HOST surface that no client ever reads?"
    ///
    /// THE STANDARD SURFACE (decided 2026-07-25, binding). The game has ONE standard UI:
    /// <c>--ship grid</c> wearing the Level-1 Overview (<c>client/src/ui/overview-view.js</c>) plus
    /// the Level-2 Room Zoom (<c>client/src/ui/roomzoom-view.js</c>). The console <c>.app</c> shell
    /// in <c>client/index.html</c> is deprecated and scheduled for deletion.
    /// <c>--ship slice</c> is the headless measurement fixture for the economy programme and has no
    /// UI at all. Authority: <c>docs/design/perilune-console-retirement.plan.md</c>.
    ///
    /// WHY IT EXISTS. E0-4's WP-5 built the whole stockpile ACCEPTS filter onto the deprecated
    /// console; it was implemented, independently reviewed and merged before anyone noticed the
    /// surface was wrong. The failure was not ignorance — "which surface is current?" lived only in
    /// prose a lane author had to go looking for. So it is mechanised, in the style of
    /// <see cref="ArchitectureBoundaryTests"/>, whose philosophy applies verbatim here: none of these
    /// facts is sacred, they are measured facts we chose to keep, and crossing one deliberately means
    /// editing the allowlist in this file IN THE SAME COMMIT as the crossing.
    ///
    /// WHAT IT CANNOT SEE. Source text only, and only literals. A channel whose type string is
    /// COMPUTED at the call site (rather than written into the <c>Append</c>) is invisible to
    /// <see cref="EmittedChannels"/>; the one indirection that exists today (<c>Lines(type, …)</c>)
    /// is matched explicitly at its three call sites. That gap is disclosed, not fixed — and
    /// <see cref="TheChannelParseIsNotVacuous"/> exists so a rename that silently empties the parse
    /// fails loudly instead of making the boundary pass for the wrong reason.
    ///
    /// CODE-ONLY, ON BOTH SIDES, BY TWO DIFFERENT MECHANISMS — do not over-read either.
    /// The EMITTER scan is code-only *by construction*: an emission site writes the escaped literal
    /// <c>{\"type\":\"NAME\"</c> while the doc comments in the same file write the unescaped form, so
    /// the pattern cannot match prose (asserted, both directions). The CONSUMER scan has no such luck
    /// — <c>case 'zones':</c> reads identically in code and in a <c>// TODO</c> — so
    /// <c>client/src/main.js</c> is run through <see cref="CodeOnly"/> first. Without that, the
    /// cheapest way past this boundary would be to write the fix in a comment instead of doing it.
    /// </summary>
    public class SurfaceBoundaryTests
    {
        // ---------------------------------------------------------------- repo discovery

        /// <summary>Probe upward from the test binary for the repo root — the house pattern
        /// (<c>ArchitectureBoundaryTests.RepoRoot</c>, <c>DefsEquivalenceTests.FindSimDefsDir</c>).
        /// Two landmarks so a stray ci.sh on a parent path cannot false-positive.</summary>
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

        private static string ReadRepoFile(params string[] parts)
        {
            string path = Path.Combine(RepoRoot(), Path.Combine(parts));
            Assert.That(File.Exists(path), Is.True, string.Join("/", parts) + " must exist");
            return File.ReadAllText(path);
        }

        /// <summary>
        /// Strip JS/C# comments, STRING-LITERAL AWARE. The client-side half of this guard scans code
        /// only, and this half must too: without it, <c>// TODO: case 'zones':</c> in main.js would
        /// satisfy the consumption boundary below — a channel "consumed" by a comment. A '…'/"…"
        /// scan terminates at the newline, so an unbalanced quote can damage at most its own line and
        /// cannot blind the scan to end of file. Port of <c>codeOnly</c> in
        /// <c>client/test/surface-boundary.test.js</c>; behaviour asserted by
        /// <see cref="TheChannelParseIsNotVacuous"/>.
        /// </summary>
        internal static string CodeOnly(string src)
        {
            var sb = new StringBuilder(src.Length);
            int i = 0, n = src.Length;
            while (i < n)
            {
                char c = src[i];
                if (c == '/' && i + 1 < n && src[i + 1] == '/')
                {
                    while (i < n && src[i] != '\n') i++;                     // to EOL, keep the \n
                }
                else if (c == '/' && i + 1 < n && src[i + 1] == '*')
                {
                    i += 2;
                    while (i + 1 < n && !(src[i] == '*' && src[i + 1] == '/')) { if (src[i] == '\n') sb.Append('\n'); i++; }
                    i += 2;
                }
                else if (c == '\'' || c == '"' || c == '`')
                {
                    char q = c;
                    sb.Append(c); i++;
                    while (i < n)
                    {
                        if (src[i] == '\\') { sb.Append(src[i]); if (i + 1 < n) sb.Append(src[i + 1]); i += 2; continue; }
                        sb.Append(src[i]);
                        bool done = src[i] == q || (q != '`' && src[i] == '\n');
                        i++;
                        if (done) break;
                    }
                }
                else { sb.Append(c); i++; }
            }
            return sb.ToString();
        }

        // ---------------------------------------------------------------- channel census

        /// <summary>An emission site writes the escaped literal <c>{\"type\":\"NAME\"</c>. Doc
        /// comments in the same file write the UNESCAPED form (<c>{"type":"frame",…</c>), so this
        /// pattern is code-only by construction — no comment stripper needed, and no risk of the
        /// "test fires on prose" tax that would get comments deleted.</summary>
        private static readonly Regex TypeLiteral = new Regex(@"\\""type\\"":\\""(\w+)", RegexOptions.Compiled);

        /// <summary>The one indirection: <c>Lines("log", …)</c> / <c>Lines("legend", …)</c> /
        /// <c>Lines("inspect", …)</c> build their envelope from a parameter, so the type never appears
        /// beside the word "type". Matched at the call site instead.</summary>
        private static readonly Regex LinesCall = new Regex(@"\bLines\(\s*""(\w+)""", RegexOptions.Compiled);

        /// <summary>The wire-serializer sources. GLOBBED, not hard-coded: a sibling partial
        /// (<c>WireFormat.Zones.cs</c>) is the obvious way to add a channel without touching the
        /// 900-line original, and a single-file scan would not see it — nor would the vacuity floor
        /// notice, since the original alone clears it.</summary>
        private static List<string> WireFormatFiles()
        {
            var found = new List<string>(Directory.GetFiles(
                Path.Combine(RepoRoot(), "hosts", "web"), "WireFormat*.cs", SearchOption.TopDirectoryOnly));
            found.Sort(StringComparer.Ordinal);
            Assert.That(found, Is.Not.Empty, "hosts/web must contain at least WireFormat.cs");
            return found;
        }

        /// <summary>Every wire channel type <c>hosts/web/WireFormat*.cs</c> can put on the socket.</summary>
        private static SortedSet<string> EmittedChannels()
        {
            var found = new SortedSet<string>(StringComparer.Ordinal);
            foreach (var path in WireFormatFiles())
            {
                string src = File.ReadAllText(path);
                foreach (Match m in TypeLiteral.Matches(src)) found.Add(m.Groups[1].Value);
                foreach (Match m in LinesCall.Matches(src)) found.Add(m.Groups[1].Value);
            }
            return found;
        }

        /// <summary>
        /// Channels the shipping client is allowed NOT to dispatch. EMPTY, deliberately — every
        /// channel on the socket today has a consumer, and that is the fact worth keeping. Adding a
        /// name here is a decision ("this host surface exists for something other than the standard
        /// client"), not a chore, and it belongs in a commit message.
        /// </summary>
        private static readonly string[] ClientlessChannelAllowlist = new string[0];

        // ---------------------------------------------------------------- the boundary

        // MUTATION: add a `Zones(...)` method to WireFormat.cs emitting {\"type\":\"zones\" (exactly
        // what WP-3 of the console-retirement plan does) and do not add `case 'zones':` to main.js
        // ⇒ this fails and names the file to edit. That is the inverse of the WP-5 mistake: host
        // work done for a surface that never reads it.
        [Test]
        public void EveryWireChannelIsConsumedByTheStandardClient()
        {
            // CODE ONLY. `// TODO: case 'zones':` must not count as a consumer — the JS half of this
            // guard strips comments before every scan and this one has to match, or the cheapest way
            // past the boundary is to write the fix in a comment instead of doing it.
            string main = CodeOnly(ReadRepoFile("client", "src", "main.js"));
            var missing = new List<string>();
            foreach (var channel in EmittedChannels())
            {
                if (Array.IndexOf(ClientlessChannelAllowlist, channel) >= 0) continue;
                // The client's single dispatch point is the `onMessage` switch in main.js. A `case`
                // there is the mechanical definition of "the standard surface consumes this".
                if (main.Contains("case '" + channel + "'") || main.Contains("case \"" + channel + "\""))
                    continue;
                missing.Add(channel);
            }

            Assert.That(missing, Is.Empty,
                "WIRE CHANNEL WITH NO CONSUMER ON THE STANDARD SURFACE: " + string.Join(", ", missing) + "\n" +
                "\n" +
                "THE BOUNDARY: hosts/web/WireFormat.cs emits these channels, and client/src/main.js's\n" +
                "`onMessage` switch is the standard client's ONLY dispatch point. A channel with no\n" +
                "`case` there is host work the player can never see — the mirror image of E0-4 WP-5,\n" +
                "which built a whole player-facing feature onto the deprecated console shell instead.\n" +
                "\n" +
                "THE STANDARD SURFACE is `--ship grid` = the Level-1 Overview\n" +
                "(client/src/ui/overview-view.js) + the Level-2 Room Zoom (client/src/ui/roomzoom-view.js).\n" +
                "`--ship slice` is the headless economy fixture and reads no wire at all, so \"the slice\n" +
                "doesn't need it\" is not a reason to skip the client. hosts/web/Client.html is a fourth,\n" +
                "frozen legacy surface and does not count as a consumer either.\n" +
                "\n" +
                "THE TWO LEGITIMATE EXITS:\n" +
                "  (1) WIRE IT UP — add `case '<channel>':` to client/src/main.js and give it a\n" +
                "      consumer on the Overview or the Room Zoom. This is the expected exit, and it is\n" +
                "      one line plus the surface that uses it.\n" +
                "  (2) DECLARE IT CLIENTLESS — add the name to ClientlessChannelAllowlist in this file,\n" +
                "      in the SAME COMMIT, with the reason in the commit message. That list is empty\n" +
                "      today; the first entry should have to be argued for.");
        }

        // Without this, renaming `Lines` or changing the Append style would silently empty the parse
        // and the boundary above would pass because it had nothing left to check — the recurring
        // review defect in this repo (the test whose named mutation cannot bite; six instances in E0-4).
        [Test]
        public void TheChannelParseIsNotVacuous()
        {
            var channels = EmittedChannels();
            Assert.That(channels.Count, Is.GreaterThanOrEqualTo(20),
                "only " + channels.Count + " wire channels parsed out of hosts/web/WireFormat.cs " +
                "(expected 20+). The emission style probably changed — fix TypeLiteral/LinesCall " +
                "before trusting EveryWireChannelIsConsumedByTheStandardClient, which would otherwise " +
                "pass vacuously.");

            // Named anchors: one plain literal, one built through the `Lines(type, …)` indirection,
            // and one built by MossHeader. If any of the three parse paths breaks, this says which.
            Assert.That(channels, Contains.Item("frame"), "the plain-literal parse path broke");
            Assert.That(channels, Contains.Item("legend"), "the Lines(type, …) indirection parse path broke");
            Assert.That(channels, Contains.Item("moss"), "the MossHeader parse path broke");

            // NEGATIVE CONTROL: the doc-comment block at the top of WireFormat.cs writes the
            // UNESCAPED form. If the pattern ever loosened enough to read prose, it would start
            // reporting channels that are only documented, so pin that it does not.
            Assert.That(TypeLiteral.IsMatch("///   frame   {\"type\":\"frame\",\"deck\":0}"), Is.False,
                "the channel scan matched an unescaped doc-comment example — it is reading prose, " +
                "and a test that fires on comments gets the comments deleted");
            Assert.That(TypeLiteral.IsMatch("sb.Append(\"{\\\"type\\\":\\\"frame\\\",\\\"deck\\\":\");"), Is.True,
                "the channel scan stopped matching a real emission site");

            // And the consumer side is code-only too, with the stripper's own behaviour pinned —
            // including that a quoted comment marker cannot blind it to end of file (the hole an
            // earlier hand-verified version of ArchitectureBoundaryTests.CodeOnly actually shipped).
            Assert.That(CodeOnly("// case 'zones': break;\nconst live = 1;"), Does.Not.Contain("zones"),
                "CodeOnly left a line comment in place — a channel could then be 'consumed' by a TODO");
            Assert.That(CodeOnly("/* case 'zones': */ const live = 1;"), Does.Not.Contain("zones"),
                "CodeOnly left a block comment in place");
            Assert.That(CodeOnly("const u = \"http://x//y\";\ncase 'zones':"), Does.Contain("case 'zones'"),
                "a quoted '//' blinded CodeOnly to end of file — every scan using it then passes vacuously");
            Assert.That(CodeOnly("const rx = /['\"]/g;\ncase 'zones':"), Does.Contain("case 'zones'"),
                "an unbalanced quote in a regex ran past its own line; the string scan must stop at the newline");

            // The globbed file set must really be finding the serializer, not an empty directory.
            Assert.That(WireFormatFiles().Count, Is.GreaterThanOrEqualTo(1));
            Assert.That(WireFormatFiles()[0], Does.EndWith("WireFormat.cs"));
        }

        // ---------------------------------------------------------------- the prose, pinned

        // MUTATION: delete the standard-surface paragraph from CLAUDE.md ⇒ this fails.
        // Prose alone is what failed at WP-5, so the prose is belt and the scans are braces — but the
        // prose is still where a HUMAN learns the rule, and it must not be quietly dropped in a
        // reorganisation. Deliberately NOT extended to docs/HANDOVER.md: that file is rewritten every
        // session, and a guard on it would fire on ordinary handover edits — noise, which is how a
        // guard gets suppressed.
        [Test]
        public void TheStandardSurfaceIsWrittenDownWhereALaneAuthorWillSeeIt()
        {
            foreach (var doc in new[] { "CLAUDE.md", Path.Combine("docs", "PLAN.md") })
            {
                string text = ReadRepoFile(doc);
                string where = doc.Replace('\\', '/');
                Assert.That(text, Does.Contain("THE STANDARD SURFACE"),
                    where + " must carry the sentinel heading \"THE STANDARD SURFACE\".\n" +
                    "\n" +
                    "THE BOUNDARY: the game has one standard UI, and a lane author has to be able to " +
                    "find that out without going looking. This test is the mechanised half; the " +
                    "paragraph is the half a human reads. E0-4 WP-5 shipped an entire feature onto the " +
                    "deprecated console because the rule existed only in a document nobody opened.\n" +
                    "\n" +
                    "THE TWO LEGITIMATE EXITS: restore the paragraph, or — if the standard genuinely " +
                    "changed — rewrite it, update this test and " +
                    "client/test/surface-boundary.test.js in the SAME COMMIT, and say what the new " +
                    "standard is in the commit message.");
                foreach (var token in new[] { "--ship grid", "overview-view.js", "roomzoom-view.js", "--ship slice" })
                    Assert.That(text, Does.Contain(token),
                        where + " names the standard surface but not \"" + token + "\" — the paragraph " +
                        "must be specific enough to act on: which ship flag, which two modules, and " +
                        "which ship is the headless measurement fixture.");
            }
        }
    }
}
