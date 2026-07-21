using System.Collections.Generic;
using System.IO;
using Perilune.Tui;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// The hand-rolled DeviceLayout.json reader must parse the REAL repo file cleanly
    /// (it feeds the shipping boot) and must fail SOFT on every malformation — a stale
    /// or corrupt layout edit reports problems, it never throws and never bricks the boot.
    /// </summary>
    public class DeviceLayoutFileTests
    {
        [Test]
        public void RealRepoLayout_Parses_WithZeroProblems()
        {
            string path = SimHost.ResolveLayoutPath();
            Assert.That(path, Is.Not.Null.And.Not.Empty, "checkout marker resolved");
            Assert.That(File.Exists(path), Is.True);

            var entries = DeviceLayoutFile.Parse(File.ReadAllText(path), out var problems);
            Assert.That(problems, Is.Empty, "the shipped layout is well-formed");
            Assert.That(entries.Count, Is.GreaterThan(0), "the shipped layout has entries");
            // Spot-check the schema round-trips into typed entries.
            var door = entries.Find(e => e.Name == "door_command");
            Assert.That(door.Name, Is.EqualTo("door_command"));
            Assert.That(door.Pos.X, Is.EqualTo(20));
            Assert.That(door.HasYaw, Is.True);
        }

        [Test]
        public void WellFormed_Inline_Parses()
        {
            const string json = "{ \"entries\": [ " +
                "{ \"name\": \"a\", \"x\": 3, \"y\": 4, \"z\": 1, \"remove\": false, \"hasYaw\": true, \"yaw\": -90.0 } ] }";
            var entries = DeviceLayoutFile.Parse(json, out var problems);
            Assert.That(problems, Is.Empty);
            Assert.That(entries.Count, Is.EqualTo(1));
            Assert.That(entries[0].Pos.X, Is.EqualTo(3));
            Assert.That(entries[0].Pos.Z, Is.EqualTo(1));
            Assert.That(entries[0].YawDeg, Is.EqualTo(-90f));
        }

        [Test]
        public void Truncated_FailsSoft_NeverThrows()
        {
            List<string> problems = null;
            Assert.DoesNotThrow(() => DeviceLayoutFile.Parse("{ \"entries\": [ { \"name\": \"a\", \"x\":", out problems));
            Assert.That(problems, Is.Not.Empty, "truncated input is reported, not thrown");
        }

        [Test]
        public void BadUnicodeEscape_FailsSoft_NeverThrows()
        {
            // A non-hex \u escape must not surface as a FormatException from int.Parse —
            // the module's contract is: report a problem, never throw, never brick boot.
            const string json = "{ \"entries\": [ { \"name\": \"\\uZZZZ\", \"x\": 0, \"y\": 0, \"z\": 0 } ] }";
            List<string> problems = null;
            List<Perilune.Gen.DeviceLayout.Entry> entries = null;
            Assert.DoesNotThrow(() => entries = DeviceLayoutFile.Parse(json, out problems));
            Assert.That(problems, Is.Not.Empty, "the bad \\u escape is reported as a problem");
            Assert.That(entries, Is.Empty);
        }

        [Test]
        public void EmptyAndGarbage_FailSoft()
        {
            DeviceLayoutFile.Parse("", out var p1);
            Assert.That(p1, Is.Not.Empty);
            DeviceLayoutFile.Parse("not json at all", out var p2);
            Assert.That(p2, Is.Not.Empty);
            var entries = DeviceLayoutFile.Parse("[1,2,3]", out var p3);
            Assert.That(p3, Is.Not.Empty, "a non-object root is reported");
            Assert.That(entries, Is.Empty);
        }

        [Test]
        public void WrongFieldTypes_SkipEntry_WithProblem_ButKeepGoodOnes()
        {
            // First entry has a string where a number is required; second is valid.
            const string json = "{ \"entries\": [ " +
                "{ \"name\": \"bad\", \"x\": \"nope\", \"y\": 0, \"z\": 0 }, " +
                "{ \"name\": \"good\", \"x\": 5, \"y\": 6, \"z\": 0, \"remove\": false, \"hasYaw\": false, \"yaw\": 0 } ] }";
            var entries = DeviceLayoutFile.Parse(json, out var problems);
            Assert.That(problems, Is.Not.Empty, "the bad entry is reported");
            Assert.That(entries.Count, Is.EqualTo(1), "the good entry still loads");
            Assert.That(entries[0].Name, Is.EqualTo("good"));
        }

        [Test]
        public void MissingName_IsReported_AndSkipped()
        {
            const string json = "{ \"entries\": [ { \"x\": 1, \"y\": 2, \"z\": 0 } ] }";
            var entries = DeviceLayoutFile.Parse(json, out var problems);
            Assert.That(entries, Is.Empty);
            Assert.That(problems, Is.Not.Empty);
        }

        [Test]
        public void MissingEntriesKey_IsNoOverrides_NotAProblem()
        {
            var entries = DeviceLayoutFile.Parse("{ \"other\": 1 }", out var problems);
            Assert.That(entries, Is.Empty);
            Assert.That(problems, Is.Empty, "no 'entries' simply means no overrides (JsonUtility parity)");
        }
    }
}
