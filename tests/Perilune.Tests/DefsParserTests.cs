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

        /// <summary>
        /// ⚠️ `maint = 0` IS THE OPT-OUT, NOT A THRESHOLD, and the clamp must not touch such a row.
        /// <c>MaintenanceSystem</c> skips every device whose Condition is at or above `maint`, and
        /// Condition is never negative, so a 0 row is never recruited for. The wreck start's
        /// CryoPod is the first row in the table that is BOTH never-serviced AND able to fail
        /// (0 / 0.10): a capsule the raid cracked must stay inoperative and paint Broken, but the
        /// crew must not spend the opening's only Parts nursing a coffin. Before this carve-out the
        /// clamp rewrote its `fail` to 0 the moment <c>content/core/SimDefs/machines.def</c> was
        /// loaded — i.e. on every host — and the wrecked pods silently became working ones.
        ///
        /// The second half is the CONTROL: the ordinary clamp still fires on a row with a real
        /// threshold, so this is a carve-out and not a deletion.
        /// </summary>
        [Test]
        public void FailAboveMaintain_IsNotClamped_WhenMaintainIsTheZeroOptOut()
        {
            var d = Parse("[machines]\nCryoPod 0.2 0 LifeSupport false 0.15 0.001 0 0.10\n", out var problems);
            Assert.That(problems, Is.Empty, "an opt-out row is not a malformed row: " + string.Join(" | ", problems));
            var pod = d.Machines[(int)DeviceKind.CryoPod];
            Assert.That(pod.MaintainBelow, Is.EqualTo(0f), "maint stays the opt-out");
            Assert.That(pod.FailBelow, Is.EqualTo(0.10f),
                "fail was clamped to maint on an opt-out row — a wrecked capsule would read as working");

            // CONTROL: the clamp is intact wherever `maint` is a real threshold.
            var e = Parse("[machines]\nCryoPod 0.2 0 LifeSupport false 0.15 0.001 0.3 0.9\n", out var alsoProblems);
            Assert.That(alsoProblems, Has.Some.Contains("clamped fail to maint"));
            Assert.That(e.Machines[(int)DeviceKind.CryoPod].FailBelow, Is.EqualTo(0.3f));
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

        /// <summary>M3-10 — the heater's two new keys, one per section. Both are asserted to land AND
        /// to leave their neighbour alone: a `case` bolted onto the wrong branch of a switch parses
        /// happily and writes the field next door.</summary>
        [Test]
        public void HeaterOutputScalar_InMachinesSection_Lands()
        {
            var d = Parse("[machines]\nheater_output_kw = 12.5\n", out var problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.HeaterOutputKW, Is.EqualTo(12.5f));
            Assert.That(d.RadiatorRejectKW, Is.EqualTo(5f), "the radiator's scalar must be untouched");
        }

        [Test]
        public void HeaterCeilingKey_InThermalSection_Lands()
        {
            var d = Parse("[thermal]\nheater_ceiling_k = 300.5\n", out var problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.Thermal.HeaterCeilingK, Is.EqualTo(300.5));
            Assert.That(d.Thermal.RadiatorFloorK, Is.EqualTo(283.15), "the radiator's floor must be untouched");
        }

        [Test]
        public void HeaterRow_InMachinesTable_OverridesEntireRow()
        {
            var d = Parse("[machines]\nHeater 2.5 0 Industry false 0 0.006 0.4 0.1\n", out var problems);
            Assert.That(problems, Is.Empty);
            Assert.That(d.Machines[(int)DeviceKind.Heater].DrawKW, Is.EqualTo(2.5f));
            Assert.That(d.Machines[(int)DeviceKind.Heater].Tier, Is.EqualTo(PowerTier.Industry));
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
