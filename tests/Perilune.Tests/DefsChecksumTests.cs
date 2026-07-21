using System.Collections.Generic;
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
