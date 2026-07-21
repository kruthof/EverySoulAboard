using System.Collections.Generic;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>Fail-soft contract for <see cref="DefsParser"/>: every malformed line
    /// keeps the default and records a problem; the graph is always usable.</summary>
    public class DefsParserTests
    {
        private static SimDefs Parse(string text, out List<string> problems)
        {
            problems = new List<string>();
            return DefsParser.Parse(new[] { ("test.def", text) }, problems);
        }

        [Test]
        public void NullFileList_ReturnsDefaults_NoProblems()
        {
            var problems = new List<string>();
            var d = DefsParser.Parse(null, problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void EmptyText_ReturnsDefaults_NoProblems()
        {
            var d = Parse("", out var problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void ValidOverride_Lands()
        {
            var d = Parse("[thermal]\ncitizen_heat_w = 125.5\n", out var problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.Thermal.CitizenHeatW, Is.EqualTo(125.5));
            Assert.That(d.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void UnknownSection_Warns_KeepsDefaults()
        {
            var d = Parse("[gravity]\nfoo = 1\n", out var problems);
            Assert.That(problems, Has.Some.Contains("unknown section").And.Some.Contains("gravity"));
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void UnknownKey_Warns_KeepsDefaults()
        {
            var d = Parse("[thermal]\nnot_a_key = 1\n", out var problems);
            Assert.That(problems, Has.Some.Contains("unknown key").And.Some.Contains("not_a_key"));
            Assert.That(d.Thermal.CitizenHeatW, Is.EqualTo(SimDefs.Default.Thermal.CitizenHeatW));
        }

        [Test]
        public void MalformedFloat_Warns_KeepsDefault()
        {
            var d = Parse("[thermal]\ncitizen_heat_w = notanumber\n", out var problems);
            Assert.That(problems, Has.Some.Contains("citizen_heat_w").And.Some.Contains("number"));
            Assert.That(d.Thermal.CitizenHeatW, Is.EqualTo(SimDefs.Default.Thermal.CitizenHeatW));
        }

        [Test]
        public void UnknownEnumName_InMachineRow_SkipsRow()
        {
            var d = Parse("[machines]\nWormhole 1 0 Comfort false 0 0 0 0\n", out var problems);
            Assert.That(problems, Has.Some.Contains("DeviceKind").And.Some.Contains("Wormhole"));
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void WrongArityRow_SkipsRow_Warns()
        {
            var d = Parse("[machines]\nDoor 1 0 Defense false\n", out var problems);
            Assert.That(problems, Has.Some.Contains("9 columns"));
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void CommentsAndBlankLines_Ignored()
        {
            var d = Parse("# a comment\n\n[thermal]   # trailing\n\ncitizen_heat_w = 100 # inline\n", out var problems);
            Assert.That(problems, Is.Empty);
            // 100 is the default value → checksum unchanged.
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void CrlfInput_ParsedLikeLf()
        {
            var d = Parse("[thermal]\r\ncitizen_heat_w = 200\r\n", out var problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.Thermal.CitizenHeatW, Is.EqualTo(200.0));
        }

        [Test]
        public void ContentBeforeSection_Warns()
        {
            var d = Parse("citizen_heat_w = 1\n", out var problems);
            Assert.That(problems, Has.Some.Contains("before any"));
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void NegativeRate_ClampedToZero_Warns()
        {
            var d = Parse("[machines]\nDoor -0.5 0 Defense false 0.05 0.002 0.3 0.05\n", out var problems);
            Assert.That(problems, Has.Some.Contains("clamped to 0"));
            Assert.That(d.Machines[(int)DeviceKind.Door].DrawKW, Is.EqualTo(0f));
        }

        [Test]
        public void FailAboveMaintain_ClampedToMaintain_Warns()
        {
            var d = Parse("[machines]\nDoor 0.1 0 Defense false 0.05 0.002 0.3 0.9\n", out var problems);
            Assert.That(problems, Has.Some.Contains("clamped fail to maint"));
            var door = d.Machines[(int)DeviceKind.Door];
            Assert.That(door.FailBelow, Is.EqualTo(door.MaintainBelow));
        }

        [Test]
        public void ValidMachineRow_OverridesEntireRow()
        {
            var d = Parse("[machines]\nSolarWing 0 12 Comfort false 0 0.004 0.4 0.1\n", out var problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.Machines[(int)DeviceKind.SolarWing].GenerationKW, Is.EqualTo(12f));
        }

        [Test]
        public void RadiatorRejectScalar_InMachinesSection_Lands()
        {
            var d = Parse("[machines]\nradiator_reject_kw = 7.5\n", out var problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.RadiatorRejectKW, Is.EqualTo(7.5f));
        }

        [Test]
        public void ValidRecipeRow_Lands()
        {
            var d = Parse("[recipes]\nFabricator Scrap 3 Parts 2 45\n", out var problems);
            Assert.That(problems, Is.Empty);
            var r = d.Recipes[(int)DeviceKind.Fabricator];
            Assert.That(r.Defined, Is.True);
            Assert.That(r.InputCount, Is.EqualTo(3));
            Assert.That(r.OutputCount, Is.EqualTo(2));
            Assert.That(r.WorkSeconds, Is.EqualTo(45));
        }

        [Test]
        public void CaseInsensitiveEnum_Warns_ButLands()
        {
            var d = Parse("[machines]\ndoor 0.1 0 defense false 0.05 0.002 0.3 0.05\n", out var problems);
            Assert.That(problems, Has.Some.Contains("case-insensitively"));
            // Row still applied (Door defaults, so checksum unchanged).
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void OutOfRangeEnumNumber_SkipsRow_NoCrash()
        {
            var d = Parse("[machines]\n99 0.1 0 Defense false 0.05 0.002 0.3 0.05\n", out var problems);
            Assert.That(problems, Has.Some.Contains("unknown DeviceKind"));
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }

        [Test]
        public void MissingFileList_EmptyList_ReturnsDefaults()
        {
            var problems = new List<string>();
            var d = DefsParser.Parse(new (string, string)[0], problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.Checksum, Is.EqualTo(SimDefs.Default.Checksum));
        }
    }
}
