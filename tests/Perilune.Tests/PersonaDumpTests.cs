using System.Globalization;
using System.Threading;
using NUnit.Framework;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tools;

namespace Perilune.Tests
{
    /// <summary>
    /// W4 contract: <c>dump-personas</c> output is byte-deterministic and schema-stable —
    /// the portrait pipeline (art/spritegen) keys files off it, so a drifting byte here
    /// silently orphans generated art.
    /// </summary>
    [TestFixture]
    public class PersonaDumpTests
    {
        private static string RenderOnce(ulong seed, int crew)
        {
            var recipe = ShipRecipe.FromSeed(seed);
            recipe.CrewCount = crew;
            var host = GenSimHost.Build(ProceduralShips.Generate(recipe));
            return PersonaDump.Render(seed, host.Sim, host.Minds, host.Facts);
        }

        [Test]
        public void Render_IsByteDeterministic_AcrossTwinBuilds()
        {
            Assert.That(RenderOnce(7, 8), Is.EqualTo(RenderOnce(7, 8)));
        }

        [Test]
        public void Render_EmitsOneObjectPerCitizen_WithStableKeys()
        {
            string json = RenderOnce(7, 8);
            Assert.That(CountOccurrences(json, "\"key\": \"pk_"), Is.EqualTo(8));
            foreach (string field in new[] { "name", "rolePreRaid", "traits", "values", "fears", "speechStyle", "backstoryHint" })
                Assert.That(CountOccurrences(json, "\"" + field + "\":"), Is.EqualTo(8), field);
            Assert.That(json, Does.StartWith("[\n"));
            Assert.That(json, Does.EndWith("]\n"));
            // Spoiler firewall: persona secrets must never reach art fixtures.
            Assert.That(json, Does.Not.Contain("secret").IgnoreCase);
            Assert.That(json, Does.Not.Contain("stashed supplies off the manifest"));
            Assert.That(json, Does.Not.Contain("never reported"));
        }

        /// <summary>
        /// ⚠️ RETRACTED IN PLACE: THIS WAS NAMED <c>…_AndIsCultureProof</c> AND THAT HALF OF THE NAME
        /// WAS EMPTY. The three seed/citizen assertions below are genuine — they would catch a broken
        /// FNV fold — but they are culture-INDEPENDENT, and the tr-TR wrapper contributed nothing.
        ///
        /// WHY THERE IS NO LEVER HERE. <c>PersonaDump.PersonaKey</c> formats a <c>uint</c> with the
        /// <c>"x8"</c> HEXADECIMAL specifier, and hex consults NO
        /// <see cref="System.Globalization.NumberFormatInfo"/> field at all: no digit substitution, no
        /// group separator, no decimal point, and no sign (the value is unsigned). Separately, tr-TR's
        /// actual lever is the dotted/dotless <c>i</c> in <c>ToUpper</c>/<c>ToLower</c>, which this
        /// code path never invokes — and <c>[0-9a-f]</c> contains no <c>i</c>. So dropping the
        /// <c>InvariantCulture</c> argument at <c>hosts/scenario/PersonaDump.cs:24</c> is an
        /// EQUIVALENT MUTANT — provably unkillable, not untested code. VERIFIED: that mutation was
        /// physically applied and this file stayed GREEN (3 passed, 0 failed).
        ///
        /// THE tr-TR PROBE IS KEPT ON PURPOSE, now that it is labelled: <c>PersonaKey</c> is the
        /// FILENAME IDENTITY for <c>client/assets/portraits/&lt;key&gt;.png</c>, so the day anyone
        /// reaches for <c>ToUpper</c>, a letter-bearing prefix or a decimal format here, the probe is
        /// already in place to catch it. It documents the ABSENCE of a lever rather than pretending
        /// to pull one.
        ///
        /// MUTATION: change the fold constants, or the seed/citizen mixing order ⇒ this fails.
        /// MUTATION 2: drop the <c>InvariantCulture</c> argument ⇒ GREEN, by construction.
        /// </summary>
        [Test]
        public void PersonaKey_DependsOnSeedAndCitizen()
        {
            var previous = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("tr-TR");
                string key = PersonaDump.PersonaKey(7, 1);
                Assert.That(key, Does.Match("^pk_[0-9a-f]{8}$"));
                Assert.That(PersonaDump.PersonaKey(7, 2), Is.Not.EqualTo(key));
                Assert.That(PersonaDump.PersonaKey(8, 1), Is.Not.EqualTo(key));
                Assert.That(PersonaDump.PersonaKey(7, 1), Is.EqualTo(key));
            }
            finally
            {
                Thread.CurrentThread.CurrentCulture = previous;
            }
        }

        private static int CountOccurrences(string text, string needle)
        {
            int count = 0, index = 0;
            while ((index = text.IndexOf(needle, index, System.StringComparison.Ordinal)) >= 0)
            {
                count++;
                index += needle.Length;
            }
            return count;
        }
    }
}
