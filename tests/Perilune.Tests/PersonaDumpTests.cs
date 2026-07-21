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

        [Test]
        public void PersonaKey_DependsOnSeedAndCitizen_AndIsCultureProof()
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
