using System.IO;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Package S1 — the authoritative, hashed, per-tile MATERIAL plane (<see cref="ZLevel.Material"/>).
    /// Material is inert identity: it is SAVED (TILE chapter v2) and FOLDED into the world hash
    /// (<see cref="World.HashInto"/>), but it drives no derived state — no Walkable/BlocksGas, no
    /// RecomputeFlags. These tests pin the three things that make it authoritative sim state:
    /// it survives a save/load by value, a differing material moves the determinism hash, and a
    /// pre-v2 save (no Material array) loads with Material all-zero and does not throw.
    /// </summary>
    public class MaterialPlaneTests
    {
        private static Simulation SmallSim() => new Simulation(AsciiWorld.Build(new[]
        {
            "#####",
            "#...#",
            "#...#",
            "#####",
        }), 1UL, new ISimSystem[0]);

        // --- round trip by value, and hash equality across the round trip ---

        [Test]
        public void Material_RoundTripsByValue_AndHashSurvives()
        {
            var sim = SmallSim();
            var world = sim.World;
            // A handful of non-default materials on distinct tiles (floors and a wall).
            world.SetMaterial(new Int3(1, 1, 0), 3);
            world.SetMaterial(new Int3(2, 1, 0), 7);
            world.SetMaterial(new Int3(3, 2, 0), 250);
            world.SetMaterial(new Int3(0, 0, 0), 42); // on a wall tile — material is orthogonal to wall/floor
            Assert.That(world.GetMaterial(new Int3(2, 1, 0)), Is.EqualTo((byte)7),
                "precondition: SetMaterial/GetMaterial agree before the save");

            ulong preSaveHash = world.HashInto(0);

            var blob = new MemoryStream();
            SaveWriter.WritePayload(sim, blob);
            blob.Position = 0;
            var loaded = SaveReader.ReadPayload(blob, new ISimSystem[0]);

            var lw = loaded.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        Assert.That(lw.GetMaterial(p), Is.EqualTo(world.GetMaterial(p)),
                            $"material at {p} must round-trip by value");
                    }

            Assert.That(lw.HashInto(0), Is.EqualTo(preSaveHash),
                "the post-load world hash must equal the pre-save world hash (Material is folded and restored)");
        }

        // --- hash visibility: a single differing material tile moves the fold ---

        [Test]
        public void Material_IsFoldedIntoTheWorldHash()
        {
            var a = SmallSim();
            var b = SmallSim();
            Assert.That(a.World.HashInto(0), Is.EqualTo(b.World.HashInto(0)),
                "precondition: two identically-built worlds hash equal");

            b.World.SetMaterial(new Int3(2, 2, 0), 5);
            Assert.That(b.World.GetMaterial(new Int3(2, 2, 0)), Is.EqualTo((byte)5),
                "precondition: the mutation landed");

            Assert.That(b.World.HashInto(0), Is.Not.EqualTo(a.World.HashInto(0)),
                "one differing Material tile must change the world hash — material is authoritative, hashed state");
        }

        // --- backward compat: a pre-v2 TILE chapter (no Material array) loads clean, all-zero ---

        [Test]
        public void PreV2Save_WithoutMaterialArray_LoadsWithMaterialAllZero()
        {
            var sim = SmallSim();
            // Set materials that a v1 save would NOT carry — the downgrade drops them, so the
            // loaded world must read them back as the default (0), never garbage or a throw.
            sim.World.SetMaterial(new Int3(1, 1, 0), 9);
            sim.World.SetMaterial(new Int3(3, 2, 0), 200);

            var v2 = new MemoryStream();
            SaveWriter.WritePayload(sim, v2);
            byte[] v1 = DowngradeTileChapterToV1(v2.ToArray(), sim.World.Width * sim.World.Height, sim.World.Depth);

            Simulation loaded = null;
            Assert.DoesNotThrow(() => loaded = SaveReader.ReadPayload(new MemoryStream(v1), new ISimSystem[0]),
                "a pre-v2 TILE chapter (no Material array) must load without throwing");

            var lw = loaded.World;
            for (int z = 0; z < lw.Depth; z++)
                for (int y = 0; y < lw.Height; y++)
                    for (int x = 0; x < lw.Width; x++)
                        Assert.That(lw.GetMaterial(new Int3(x, y, z)), Is.EqualTo((byte)0),
                            "a pre-v2 save has no Material — every tile loads as the default 0");

            // And the rest of the tile plane survived the downgrade unharmed.
            Assert.That(lw.GetWall(new Int3(0, 0, 0)), Is.EqualTo(sim.World.GetWall(new Int3(0, 0, 0))),
                "the downgrade must preserve Wall (only the appended Material bytes are stripped)");
            Assert.That(lw.GetFloor(new Int3(1, 1, 0)), Is.EqualTo(sim.World.GetFloor(new Int3(1, 1, 0))),
                "the downgrade must preserve Floor");
        }

        /// <summary>
        /// Rewrite a v2 MBSV payload as if the TILE chapter had been written by an OLD build:
        /// strip the per-level Material array (the last <paramref name="n"/> bytes of each level's
        /// block) and stamp the chapter version back to 1. Header is copied verbatim; every other
        /// chapter is passed through untouched. Mirrors the framing in SaveWriter/SaveReader.
        /// </summary>
        private static byte[] DowngradeTileChapterToV1(byte[] payload, int n, int depth)
        {
            var src = new MemoryStream(payload);
            var reader = new BinaryReader(src, SaveFormat.Utf8);
            var dst = new MemoryStream();
            var writer = new BinaryWriter(dst, SaveFormat.Utf8);

            // Header (mirrors SaveWriter.WriteHeader).
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

                if (id == SaveFormat.TileChapter)
                {
                    // v2 per-level block = Floor(2n) + Wall(2n) + Flags(n) + RoomId(2n) + Material(n) = 8n.
                    // v1 block = the first 7n bytes; drop the trailing n Material bytes per level.
                    int v2Block = 8 * n, v1Block = 7 * n;
                    Assert.That(body.Length, Is.EqualTo(v2Block * depth), "v2 TILE body has the expected size");
                    var v1Body = new MemoryStream();
                    for (int z = 0; z < depth; z++)
                        v1Body.Write(body, z * v2Block, v1Block);
                    byte[] stripped = v1Body.ToArray();

                    writer.Write(id);
                    writer.Write((ushort)1); // stamp back to TILE v1
                    writer.Write(stripped.Length);
                    writer.Write(stripped);
                }
                else
                {
                    writer.Write(id);
                    writer.Write(version);
                    writer.Write(len);
                    writer.Write(body);
                }
            }
            writer.Flush();
            return dst.ToArray();
        }
    }
}
