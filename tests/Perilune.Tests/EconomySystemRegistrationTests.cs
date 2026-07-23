using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// Economy Wave 0, W0-6: the four PASSIVE, EMPTY economy systems registered into
    /// <see cref="SystemStack"/> — <see cref="StockZoneSystem"/> ('ZONE'),
    /// <see cref="ProductionSystem"/> ('PROD'), <see cref="OreRegistrySystem"/> ('ORES') and
    /// <see cref="TradeSystem"/> ('TRAD'). They hold no state yet; they exist so their SYSS
    /// chapters and checksum seeds are registered (one batched pin move) before the economy
    /// lanes spawn. These tests pin the three things that a later E-lane must be able to trust:
    /// the FourCC seeds spell their chapter, each empty system genuinely folds into StateHash,
    /// and a PRE-economy save (missing every economy chapter) loads into a post-economy build
    /// with empty economy state and no reader branch. LINQ is used freely here — it is a TEST;
    /// the no-LINQ rule governs tick paths under sim/, not test fixtures.
    /// </summary>
    public class EconomySystemRegistrationTests
    {
        private static readonly string[] OneRoom = { "#######", "#.....#", "#######" };

        // The four economy systems, paired with the ASCII their seed must spell.
        private static readonly (Type Type, ulong Seed, string Cc)[] Economy =
        {
            (typeof(StockZoneSystem),   StockZoneSystem.Seed,   "ZONE"),
            (typeof(ProductionSystem),  ProductionSystem.Seed,  "PROD"),
            (typeof(OreRegistrySystem), OreRegistrySystem.Seed, "ORES"),
            (typeof(TradeSystem),       TradeSystem.Seed,       "TRAD"),
        };

        private static ISimSystem[] DefaultStack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        // Decode a big-endian-packed FourCC seed back to its four ASCII characters — the same
        // byte order BuildSystem's 0x42554C44 = "BULD" uses (high byte = first char).
        private static string Decode(ulong seed) => new string(new[]
        {
            (char)((seed >> 24) & 0xFF),
            (char)((seed >> 16) & 0xFF),
            (char)((seed >> 8) & 0xFF),
            (char)(seed & 0xFF),
        });

        // A couple of citizens + a loose item, so a save has real world content to round-trip.
        private static void Populate(Simulation sim)
        {
            sim.AddCitizen("Ada", new Int3(1, 1, 0));
            sim.AddCitizen("Ben", new Int3(2, 1, 0));
            sim.AddItem(ItemKind.Regolith, 5, new Int3(3, 1, 0));
        }

        // -------------------------------------------------------------- FourCC spelling

        /// <summary>
        /// A FourCC that does not spell what its author thinks is a silent save-format decision
        /// (SaveReader keys SYSS by Name, but the seed IS the human-readable chapter tag and the
        /// StateChecksum contribution). Assert each constant decodes to its four ASCII letters.
        ///
        /// MUTATION (applied, observed failing, reverted): flip <c>StockZoneSystem.Seed</c>'s low
        /// byte from 0x45 ('E') to 0x44 ('D') → 0x5A4F4E44 decodes "ZOND", not "ZONE" → this fails.
        /// </summary>
        [Test]
        public void FourCCsSpellTheirChapter()
        {
            foreach (var (_, seed, cc) in Economy)
                Assert.That(Decode(seed), Is.EqualTo(cc),
                    $"seed 0x{seed:X8} must decode to \"{cc}\"");
        }

        // ---------------------------------------------------------- hash-honesty (folds in)

        /// <summary>
        /// Each empty economy system must genuinely fold its seed into <see cref="Simulation.StateHash"/>
        /// — otherwise "registered" is a lie and the E-lane's later bump would move nothing. Drive the
        /// REAL default stack, then a stack with exactly one economy system removed, and assert the
        /// hash changes; also assert two full default stacks are twins.
        ///
        /// MUTATION (applied, observed failing, reverted): delete <c>new StockZoneSystem()</c> from
        /// <see cref="SystemStack"/> → the default stack no longer contains 'ZONE', so "default" and
        /// "default minus ZONE" become identical and the ZONE inequality assertion fails (this is
        /// also the "remove one registration → the pin moves" proof, done without editing source).
        /// </summary>
        [Test]
        public void EachEmptySystemFoldsIntoStateHash()
        {
            ulong HashOf(ISimSystem[] systems)
            {
                var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, systems);
                Populate(sim);
                for (int i = 0; i < 50; i++) sim.Tick();
                return sim.StateHash();
            }

            ulong full = HashOf(DefaultStack());

            // Twin: a second identical stack hashes equal (determinism holds with them registered).
            Assert.That(HashOf(DefaultStack()), Is.EqualTo(full), "two default stacks are twins");

            // Removing any ONE economy system's seed from the fold must change the hash.
            foreach (var (type, _, cc) in Economy)
            {
                var minus = DefaultStack().Where(s => s.GetType() != type).ToArray();
                Assert.That(minus.Length, Is.EqualTo(DefaultStack().Length - 1),
                    $"exactly one {cc} system is registered");
                Assert.That(HashOf(minus), Is.Not.EqualTo(full),
                    $"dropping the {cc} system must change StateHash — it must genuinely fold");
            }
        }

        // ------------------------------------------------------- compat: pre-economy save

        /// <summary>
        /// The §3.3 compat test that did not exist: a PRE-economy save (a stack WITHOUT the four
        /// economy systems, so its file has no ZONE/PROD/ORES/TRAD SYSS chapters) must load into a
        /// post-economy build, tick, and not throw — the economy systems keep empty state and the
        /// reader length-skips nothing it must branch on. This is the guarantee that lets the
        /// E-lanes bump these chapters later without bricking old saves.
        ///
        /// Proof shape: build a pre-economy sim and an economy sim from the SAME world/seed,
        /// populate identically, tick identically (the economy systems are no-ops, so both evolve
        /// the same). Save each; load BOTH back into fresh FULL economy stacks; tick 1000. The
        /// chapter-less load (compat) must hash EQUAL to the empty-chapter load (reference) — i.e.
        /// a missing economy chapter loads as exactly-empty economy state, deterministically.
        ///
        /// MUTATION (applied, observed failing, reverted): add <c>private int _n = 7;</c> to
        /// StockZoneSystem, fold it in StateChecksum, and set <c>_n = 0</c> in RestoreState. The
        /// reference save HAS the ZONE chapter so RestoreState runs and normalises _n→0; the compat
        /// save has NO ZONE chapter so RestoreState never runs and _n stays 7 → the two loads
        /// diverge and this fails. (That is the exact "a restore normalises state the constructor
        /// does not" bug class §5.1 warns of.)
        /// </summary>
        [Test]
        public void PreEconomySaveLoadsIntoEconomyBuild_EmptyStateStableTwinHash()
        {
            byte[] SaveOf(bool economy)
            {
                var stack = economy
                    ? DefaultStack()
                    : DefaultStack().Where(s => !IsEconomy(s)).ToArray();
                var sim = new Simulation(AsciiWorld.Build(OneRoom), 13, stack);
                Populate(sim);
                for (int i = 0; i < 200; i++) sim.Tick();
                var ms = new MemoryStream();
                SaveWriter.Write(sim, ms);
                return ms.ToArray();
            }

            byte[] preEconomy = SaveOf(economy: false); // no ZONE/PROD/ORES/TRAD chapters at all
            byte[] withEmpty = SaveOf(economy: true);   // the four chapters present but empty

            ulong LoadTick(byte[] bytes)
            {
                Simulation loaded = null;
                Assert.DoesNotThrow(() =>
                    loaded = SaveReader.Read(new MemoryStream(bytes), DefaultStack()),
                    "a save missing the economy chapters must load into the economy build");
                for (int i = 0; i < 1000; i++) loaded.Tick();
                return loaded.StateHash();
            }

            ulong compat = LoadTick(preEconomy);
            ulong reference = LoadTick(withEmpty);

            Assert.That(compat, Is.EqualTo(reference),
                "a missing economy chapter loads as exactly-empty economy state — the E-lanes can " +
                "bump these chapters later without a reader branch and without touching old saves");
        }

        private static bool IsEconomy(ISimSystem s) =>
            s is StockZoneSystem || s is ProductionSystem || s is OreRegistrySystem || s is TradeSystem;

        // ------------------------------------------------------------------- zero-alloc

        /// <summary>
        /// The four passive systems' no-op <see cref="ISimSystem.Tick"/> must not allocate — a
        /// registered system that allocates every tick would silently break the zero-alloc tick
        /// path the moment it is on the default stack. Tick a sim of ONLY the four economy systems
        /// and assert the steady-state GC delta is zero.
        ///
        /// MUTATION (applied, observed failing, reverted): add <c>var _ = new byte[1];</c> to
        /// <c>StockZoneSystem.Tick</c> → 3000 ticks allocate ~48 KB and the == 0 assertion fails.
        /// </summary>
        [Test]
        public void EmptyEconomyTicksAllocateNothing()
        {
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[]
            {
                new StockZoneSystem(), new ProductionSystem(), new OreRegistrySystem(), new TradeSystem(),
            });
            Populate(sim);
            for (int i = 0; i < 100; i++) sim.Tick(); // warm up: room recompute + channels settle

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 3000; i++) sim.Tick();
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(delta, Is.EqualTo(0),
                $"the four passive economy Ticks must not allocate (saw {delta} bytes)");
        }

        // ----------------------------------------------------------- version-branch shape

        /// <summary>
        /// RestoreState must CONSUME exactly what CaptureState wrote (the state-marker byte), and
        /// must version-BRANCH rather than version-BAIL (§3.3) so a v1 blob restores cleanly. An
        /// under-/over-reading RestoreState desyncs the E-lane's future format even though today's
        /// SaveReader re-syncs on the length prefix. Assert the reader position equals the written
        /// length after each round-trip, and that the empty checksum survives.
        ///
        /// MUTATION (applied, observed failing, reverted): remove <c>reader.ReadByte()</c> from
        /// <c>StockZoneSystem.RestoreState</c> → the marker byte CaptureState wrote is left
        /// unconsumed, position (0) != length (1), and this fails. (The forbidden
        /// <c>if (version != 1) return;</c> guard is the same failure at v0/v2.)
        /// </summary>
        [Test]
        public void EmptyBlobsRoundTripAndFullyConsumeTheirBytes()
        {
            void RoundTrip(IStatefulSystem write, IStatefulSystem read)
            {
                var ms = new MemoryStream();
                using (var w = new BinaryWriter(ms, System.Text.Encoding.UTF8, leaveOpen: true))
                    write.CaptureState(w);
                long written = ms.Length;
                Assert.That(written, Is.GreaterThan(0), $"{write.Name} writes a self-describing blob");
                ms.Position = 0;
                using (var r = new BinaryReader(ms, System.Text.Encoding.UTF8, leaveOpen: true))
                    read.RestoreState(r, write.StateVersion);
                Assert.That(ms.Position, Is.EqualTo(written),
                    $"{write.Name}.RestoreState must consume exactly the {written} byte(s) it wrote");
                Assert.That(read.StateChecksum(), Is.EqualTo(write.StateChecksum()),
                    $"{write.Name} empty blob round-trips at v{write.StateVersion}");
            }

            RoundTrip(new StockZoneSystem(), new StockZoneSystem());
            RoundTrip(new ProductionSystem(), new ProductionSystem());
            RoundTrip(new OreRegistrySystem(), new OreRegistrySystem());
            RoundTrip(new TradeSystem(), new TradeSystem());
        }
    }
}
