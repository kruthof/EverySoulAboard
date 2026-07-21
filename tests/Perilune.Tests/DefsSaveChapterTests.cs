using System;
using System.Collections.Generic;
using System.IO;
using Moonbase.Dsl;
using Moonbase.Sim;
using NUnit.Framework;

namespace Moonbase.Tests
{
    /// <summary>
    /// The DEFS save chapter (FourCC 'DEFS' v1): payload is the ulong checksum of the
    /// sim's active <see cref="SimDefs"/>. On load it is compared to the loader's
    /// active defs; a mismatch records a warning and loads anyway (the tuning values
    /// come from the .def files, not the save). Old saves without the chapter load
    /// silently. Uses the internal uncompressed <c>WritePayload</c>/<c>ReadPayload</c>
    /// (this test assembly compiles Sim.Core's sources, so internals are visible).
    /// </summary>
    public class DefsSaveChapterTests
    {
        private static ISimSystem[] Systems() => new ISimSystem[]
        {
            new AtmosphereSystem(),
            new PowerSystem(),
            new CitizenSystem(),
            new NeedsSystem(),
        };

        /// <summary>A small but non-trivial sim: devices, a citizen, an item, a script,
        /// ticked forward so the saved state is not just the empty initial world.</summary>
        private static Simulation BuildScenario(ulong seed, SimDefs defs)
        {
            var world = AsciiWorld.Build(new[]
            {
                "##########",
                "#........#",
                "#........#",
                "#........#",
                "##########",
            });
            var sim = new Simulation(world, seed, Systems(), defs);
            sim.AddDevice(DeviceKind.Door, new Int3(4, 2, 0), "door_a").IsOpen = true;
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar_a");
            sim.AddDevice(DeviceKind.Battery, new Int3(2, 1, 0), "battery_a").StoredKWh = 5f;
            sim.AddDevice(DeviceKind.Light, new Int3(3, 1, 0), "light_a");
            sim.AddCitizen("Okafor", new Int3(3, 2, 0));
            sim.AddItem(ItemKind.Regolith, 4, new Int3(6, 3, 0));
            sim.SetScript("term_a", "when tick {\n  door_a.open = true\n}");
            for (int t = 0; t < 120; t++) sim.Tick();
            return sim;
        }

        private static byte[] PayloadBytes(Simulation sim)
        {
            var ms = new MemoryStream();
            SaveWriter.WritePayload(sim, ms);
            return ms.ToArray();
        }

        private static Simulation Load(byte[] payload, SimDefs defs, List<string> warnings) =>
            SaveReader.ReadPayload(new MemoryStream(payload), Systems(), defs, warnings);

        private static SimDefs EditedDefs()
        {
            var problems = new List<string>();
            var d = DefsParser.Parse(new[] { ("edit.def", "[thermal]\ncitizen_heat_w = 137\n") }, problems);
            Assert.That(problems, Is.Empty, "edited defs must parse cleanly");
            Assert.That(d.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum),
                "edited defs must have a different checksum than the default");
            return d;
        }

        [Test]
        public void SameDefs_RoundTrips_NoWarning_HashEqual()
        {
            var original = BuildScenario(4242, SimDefs.Default);
            var warnings = new List<string>();
            var loaded = Load(PayloadBytes(original), SimDefs.Default, warnings);

            Assert.That(warnings, Is.Empty, "matching defs checksum must produce no warning");
            Assert.That(loaded.StateHash(), Is.EqualTo(original.StateHash()),
                "state hash must survive the round trip bit-exactly");
        }

        [Test]
        public void DifferentDefs_RecordsWarning_ButLoadsSuccessfully()
        {
            var original = BuildScenario(4242, SimDefs.Default);
            byte[] payload = PayloadBytes(original);

            var edited = EditedDefs();
            var warnings = new List<string>();
            var loaded = Load(payload, edited, warnings);

            Assert.That(loaded, Is.Not.Null, "a defs mismatch must never fail the load");
            Assert.That(warnings, Has.Count.EqualTo(1), "a checksum mismatch must record exactly one warning");
            StringAssert.Contains("checksum", warnings[0]);
            Assert.That(loaded.Defs, Is.SameAs(edited), "the loaded sim runs with the loader's active defs");
            // Defs aren't part of canonical state, and no system reads them yet — the
            // saved-world hash is identical regardless of which defs it was loaded with.
            Assert.That(loaded.StateHash(), Is.EqualTo(original.StateHash()));
        }

        [Test]
        public void NullWarnings_DoesNotThrowOnMismatch()
        {
            var original = BuildScenario(4242, SimDefs.Default);
            // The mismatch path must tolerate a null warnings channel (optional param).
            Assert.DoesNotThrow(() => Load(PayloadBytes(original), EditedDefs(), null));
        }

        [Test]
        public void OldSaveWithoutDefsChapter_LoadsSilently()
        {
            // Simulate a pre-B2 save: strip the DEFS chapter from the payload. The
            // reader must load it with no warning (old saves predate the fingerprint).
            var original = BuildScenario(4242, SimDefs.Default);
            byte[] stripped = StripChapter(PayloadBytes(original), SaveFormat.DefsChapter);

            var warnings = new List<string>();
            var loaded = Load(stripped, SimDefs.Default, warnings);

            Assert.That(warnings, Is.Empty, "an absent DEFS chapter must load silently");
            Assert.That(loaded.StateHash(), Is.EqualTo(original.StateHash()),
                "stripping only the DEFS chapter must not disturb the rest of the save");
        }

        [Test]
        public void OldSaveWithoutDefsChapter_MismatchStillSilent()
        {
            // No DEFS chapter ⇒ nothing to compare ⇒ no warning even if the loader's
            // defs differ from whatever the save was authored with.
            var original = BuildScenario(4242, SimDefs.Default);
            byte[] stripped = StripChapter(PayloadBytes(original), SaveFormat.DefsChapter);

            var warnings = new List<string>();
            var loaded = Load(stripped, EditedDefs(), warnings);

            Assert.That(warnings, Is.Empty);
            Assert.That(loaded, Is.Not.Null);
        }

        /// <summary>Copy an uncompressed MBSV payload, dropping every chapter whose
        /// FourCC matches <paramref name="fourCC"/>. Header is copied verbatim; chapter
        /// framing mirrors SaveWriter (FourCC u32, version u16, length i32, payload).</summary>
        private static byte[] StripChapter(byte[] payload, uint fourCC)
        {
            var src = new MemoryStream(payload);
            var reader = new BinaryReader(src);
            var dst = new MemoryStream();
            var writer = new BinaryWriter(dst);

            // Header (mirrors SaveWriter.WriteHeader / SaveReader header block).
            writer.Write(reader.ReadBytes(4));   // magic
            writer.Write(reader.ReadUInt16());   // global version
            writer.Write(reader.ReadInt64());    // tick count
            writer.Write(reader.ReadUInt32());   // next entity id
            for (int i = 0; i < 4; i++) writer.Write(reader.ReadUInt64()); // rng state
            writer.Write(reader.ReadInt32());    // width
            writer.Write(reader.ReadInt32());    // height
            writer.Write(reader.ReadInt32());    // depth
            writer.Write(reader.ReadSingle());   // wastewater (header v2)

            while (src.Position < src.Length)
            {
                uint id = reader.ReadUInt32();
                ushort version = reader.ReadUInt16();
                int len = reader.ReadInt32();
                byte[] body = reader.ReadBytes(len);
                if (id == fourCC) continue; // drop it
                writer.Write(id);
                writer.Write(version);
                writer.Write(len);
                writer.Write(body);
            }
            writer.Flush();
            return dst.ToArray();
        }

        [Test]
        public void ReadmeDef_ParsesWithZeroProblems()
        {
            string path = FindReadmeDef();
            Assert.That(path, Is.Not.Null,
                "README.def must be discoverable under content/core/SimDefs");

            var problems = new List<string>();
            var defs = DefsParser.Parse(
                new[] { (Path.GetFileName(path), File.ReadAllText(path)) }, problems);

            Assert.That(problems, Is.Empty,
                "the comment-only README.def must parse with zero problems: " + string.Join(" | ", problems));
            Assert.That(defs.Checksum, Is.EqualTo(SimDefs.Default.Checksum),
                "a comment-only file must not change any tuning value");
        }

        /// <summary>Probe upward from the test binary for the shipped README.def.</summary>
        private static string FindReadmeDef()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = Path.Combine(
                    dir.FullName, "content", "core", "SimDefs", "README.def");
                if (File.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
            return null;
        }
    }
}
