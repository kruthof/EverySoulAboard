using System.IO;
using System.Linq;
using System.Text;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-4 WP-1 — FILTERED STOCKPILE ZONES, state only. <see cref="StockZoneSystem"/> is
    /// <see cref="DeconstructSystem"/>'s structural twin (a canonical packed-position-sorted
    /// registry, SYSS-saved, checksum-folded), so this file mirrors <c>DeconstructSystemTests</c>'
    /// save/hash discipline: the ZONE chapter round-trips a POPULATED registry bit-exactly, a
    /// save→load→tick-1000 window stays bit-identical to an uninterrupted twin, an old W0-6 v1
    /// marker-byte blob upgrades silently to accept-all, every folded field moves the hash (with
    /// the collision PAIR the per-field table structurally cannot find), the empty registry folds
    /// the bare seed (the pin-hold), and the <see cref="StockZoneSystem.Accepts"/> back-compat
    /// truth table (absent entry ⇒ accept-all) holds.
    ///
    /// GATES THAT DO NOT APPLY, stated so a reviewer does not score against them (lane plan §10,
    /// §2.5): WP-1 adds NO def scalar — the filter is player data, not policy — so the
    /// def-field / defs-checksum / de-DE-float gates are N/A. The mask is an integer over the save
    /// stream (<c>ReadUInt64</c>/<c>Write(ulong)</c>), so there is NO culture-sensitive float parse
    /// anywhere in this package.
    ///
    /// Each test's doc names the one-line mutation that makes it fail. LINQ is used freely — it is
    /// a TEST; the no-LINQ rule governs tick paths under sim/.
    /// </summary>
    public class StockZoneSystemTests
    {
        private static readonly string[] OneRoom = { "#######", "#.....#", "#######" };

        // A minimal stack of ONLY the registry under test: no atmosphere, so no RemapGas reload
        // drift (SaveRestoreRunOnTests' confound) can perturb the save→load→tick comparisons —
        // the exact HashOfInjected philosophy from DeconstructSystemTests.
        private static Simulation NewSim(out StockZoneSystem zones)
        {
            zones = new StockZoneSystem();
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 7, new ISimSystem[] { zones });
            // Real world content so a save round-trips more than the ZONE chapter alone.
            sim.AddCitizen("Ada", new Int3(1, 1, 0));
            sim.AddItem(ItemKind.Potato, 5, new Int3(3, 1, 0));
            return sim;
        }

        private static ulong MaskOf(params ItemKind[] kinds)
        {
            ulong m = 0;
            foreach (var k in kinds) m |= 1UL << (int)k;
            return m;
        }

        // ============================================================== accessor / registration

        /// <summary>
        /// <see cref="Simulation.StockZones"/> is a REFERENCE to the registered system (resolved
        /// once, the <see cref="Simulation.Deconstruct"/> precedent), and it is <c>null</c> on a
        /// reduced stack — the accessor adds no saved or hashed field of its own.
        ///
        /// MUTATION: drop the resolve loop in the <see cref="Simulation"/> constructor ⇒
        /// <c>StockZones</c> is null even when the system is registered ⇒ the SameAs assertion fails.
        /// </summary>
        [Test]
        public void Simulation_ExposesTheRegistryByReference_AndNullWhenAbsent()
        {
            var z = new StockZoneSystem();
            var withIt = new Simulation(AsciiWorld.Build(OneRoom), 1, new ISimSystem[] { z });
            Assert.That(withIt.StockZones, Is.SameAs(z),
                "the accessor is a reference to the registered system, resolved once");

            var without = new Simulation(AsciiWorld.Build(OneRoom), 1, new ISimSystem[0]);
            Assert.That(without.StockZones, Is.Null,
                "a reduced stack has no registry — the accessor is null, not a throw");
        }

        // ============================================================== the Accepts truth table

        /// <summary>
        /// THE BACK-COMPAT RULE (lane plan §2.1): a tile with NO filter entry accepts EVERYTHING —
        /// every E0-3 stockpile and every pre-E0-4 save keeps accept-everything with zero migration.
        /// A present entry honours its bits exactly; a zero mask accepts nothing; clearing reverts
        /// to accept-all.
        ///
        /// MUTATION: make <see cref="StockZoneSystem.Accepts"/> return <c>false</c> when
        /// <c>TryGetFilter</c> misses (drop the <c>!TryGetFilter(...) ||</c> accept-all leg) ⇒ the
        /// absent-entry block fails and every existing stockpile silently stops accepting anything.
        /// </summary>
        [Test]
        public void Accepts_AbsentEntryIsAcceptAll_PresentEntryHonoursItsBits_ZeroMaskAcceptsNothing()
        {
            var sim = NewSim(out var zones);
            var tile = new Int3(1, 1, 0);

            // Absent ⇒ accept-all, for every kind that exists today.
            for (int k = 0; k <= (int)ItemKind.ControllerModule; k++)
                Assert.That(zones.Accepts(tile, (ItemKind)k), Is.True,
                    $"an unfiltered tile accepts every kind (kind {k})");

            // A filter that accepts only Potato + ControllerModule.
            zones.SetFilter(sim, tile, MaskOf(ItemKind.Potato, ItemKind.ControllerModule));
            Assert.That(zones.Accepts(tile, ItemKind.Potato), Is.True, "an accepted bit accepts");
            Assert.That(zones.Accepts(tile, ItemKind.ControllerModule), Is.True);
            Assert.That(zones.Accepts(tile, ItemKind.Scrap), Is.False, "an unset bit rejects");
            Assert.That(zones.Accepts(tile, ItemKind.Regolith), Is.False);

            // A DIFFERENT tile with no entry is still accept-all — the filter is per-tile.
            Assert.That(zones.Accepts(new Int3(2, 1, 0), ItemKind.Scrap), Is.True,
                "a neighbouring unfiltered tile is unaffected");

            // A zero mask is a valid "accept nothing" zone.
            zones.SetFilter(sim, tile, 0UL);
            for (int k = 0; k <= (int)ItemKind.ControllerModule; k++)
                Assert.That(zones.Accepts(tile, (ItemKind)k), Is.False,
                    $"a zero-mask zone accepts nothing (kind {k})");

            // Clearing reverts to accept-all.
            Assert.That(zones.ClearFilter(sim, tile), Is.True, "the entry existed");
            Assert.That(zones.Accepts(tile, ItemKind.Scrap), Is.True, "cleared ⇒ accept-all again");
        }

        // ============================================================== command-free API shape

        /// <summary>
        /// <see cref="StockZoneSystem.SetFilter"/> is insert-or-replace keeping canonical
        /// packed-position order, both it and <see cref="StockZoneSystem.ClearFilter"/> dirty the
        /// TILE board (a zone filter change is a tile-board change), and clearing an unfiltered tile
        /// is a no-op.
        ///
        /// MUTATION: drop <c>sim.JobsDirty |= JobBoardDirty.Tiles;</c> from SetFilter ⇒ the
        /// dirty-after-set assertion fails (the haul board would never see the new filter). Change
        /// the in-place replace to an unconditional <c>InsertSorted</c> ⇒ the replace keeps the
        /// count at 3 assertion fails (a duplicate tile appears).
        /// </summary>
        [Test]
        public void SetFilter_InsertsSortedOrReplacesInPlace_AndDirtiesTheTileBoard()
        {
            var sim = NewSim(out var zones);

            // Insert OUT of packed-position order; the registry must stay sorted.
            zones.SetFilter(sim, new Int3(3, 1, 0), MaskOf(ItemKind.Potato));
            zones.SetFilter(sim, new Int3(1, 1, 0), MaskOf(ItemKind.Scrap));
            zones.SetFilter(sim, new Int3(2, 1, 0), MaskOf(ItemKind.Parts));
            Assert.That(zones.Zones.Select(z => z.Pos.X).ToArray(), Is.EqualTo(new[] { 1, 2, 3 }),
                "kept in canonical packed-position order");
            Assert.That(zones.Zones, Has.Count.EqualTo(3), "three distinct tiles");

            // Replace in place: same count, new mask.
            sim.JobsDirty = JobBoardDirty.None;
            zones.SetFilter(sim, new Int3(2, 1, 0), MaskOf(ItemKind.Corpse));
            Assert.That(zones.Zones, Has.Count.EqualTo(3), "an existing tile is replaced, not duplicated");
            Assert.That((sim.JobsDirty & JobBoardDirty.Tiles), Is.EqualTo(JobBoardDirty.Tiles),
                "a filter change dirties the tile board");
            Assert.That(zones.TryGetFilter(new Int3(2, 1, 0), out var m), Is.True);
            Assert.That(m, Is.EqualTo(MaskOf(ItemKind.Corpse)), "the mask was replaced by value");

            // Clear dirties the board and returns false on a tile with no entry.
            sim.JobsDirty = JobBoardDirty.None;
            Assert.That(zones.ClearFilter(sim, new Int3(2, 1, 0)), Is.True);
            Assert.That((sim.JobsDirty & JobBoardDirty.Tiles), Is.EqualTo(JobBoardDirty.Tiles),
                "a clear dirties the tile board too");
            Assert.That(zones.ClearFilter(sim, new Int3(9, 9, 0)), Is.False,
                "clearing an unfiltered tile is a deterministic no-op");
        }

        // ============================================================== determinism twin

        /// <summary>
        /// Twin determinism: two sims given IDENTICAL filters hash equal; a single different accept
        /// mask on the same tile moves the hash. This is the canary that the mask is genuinely
        /// part of the sim's canonical state and folds deterministically.
        ///
        /// MUTATION: fold a constant instead of <c>z.AcceptMask</c> in
        /// <see cref="StockZoneSystem.StateChecksum"/> ⇒ the two distinct masks hash EQUAL and the
        /// divergence assertion fails.
        /// </summary>
        [Test]
        public void TwinSims_IdenticalFiltersHashEqual_ADifferentMaskDiverges()
        {
            var a = NewSim(out var za);
            var b = NewSim(out var zb);
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "precondition: twins before any filter");

            var tile = new Int3(1, 1, 0);
            za.SetFilter(a, tile, MaskOf(ItemKind.Potato));
            zb.SetFilter(b, tile, MaskOf(ItemKind.Potato));
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "identical filters hash equal");

            zb.SetFilter(b, tile, MaskOf(ItemKind.Scrap));
            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "a different accept mask on the same tile must move the hash");
        }

        // ============================================================== save / restore

        /// <summary>
        /// The ZONE chapter round-trips a POPULATED registry (never an empty one — that round-trips
        /// trivially and proves nothing), and the loaded sim hashes bit-equal. The three entries
        /// exercise a real mask, an accept-NOTHING mask (0), and the WIDEST mask that is still a
        /// restriction (every kind but one), in canonical packed-position order.
        ///
        /// WP-6 changed the third row: it used to be <c>~0UL</c> ("all bits set"), which is now
        /// collapsed to NO entry by <see cref="StockZoneSystem.SetFilter"/> — an accept-everything
        /// mask is the absent-entry state, so it can no longer be a stored row here. The
        /// widest-real-restriction mask keeps the row's original purpose (a mask with many bits set)
        /// while staying a genuine entry.
        ///
        /// MUTATION: delete <c>writer.Write(z.AcceptMask);</c> from
        /// <see cref="StockZoneSystem.CaptureState"/> ⇒ RestoreState reads the next entry's X as a
        /// mask, the list desyncs, and both the count and the hash assertions fail.
        /// </summary>
        [Test]
        public void ZoneChapter_RoundTripsAPopulatedRegistry_BitExactly()
        {
            var sim = NewSim(out var zones);
            zones.SetFilter(sim, new Int3(1, 1, 0), MaskOf(ItemKind.Potato, ItemKind.ControllerModule));
            zones.SetFilter(sim, new Int3(2, 1, 0), 0UL);                // accept-nothing
            zones.SetFilter(sim, new Int3(3, 1, 0),
                StockZoneSystem.AcceptAllMask ^ MaskOf(ItemKind.Corpse)); // widest REAL restriction
            Assert.That(zones.Zones, Has.Count.EqualTo(3), "precondition: a POPULATED registry");

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;
            var loaded = SaveReader.Read(ms, new ISimSystem[] { new StockZoneSystem() });

            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "the ZONE chapter must round-trip every field the checksum folds");
            var lz = loaded.StockZones;
            Assert.That(lz.Zones, Has.Count.EqualTo(3));
            for (int i = 0; i < 3; i++)
            {
                Assert.That(lz.Zones[i].Pos, Is.EqualTo(zones.Zones[i].Pos),
                    "and in the SAME canonical packed-position order");
                Assert.That(lz.Zones[i].AcceptMask, Is.EqualTo(zones.Zones[i].AcceptMask),
                    "the accept mask survived by VALUE");
            }
        }

        /// <summary>
        /// The stronger save gate (ECONOMY-PLAN §5.1): save WITH filters live, load, run BOTH for
        /// 1000 ticks, and they must still hash equal. A chapter can round-trip a snapshot and still
        /// desync the moment either side resumes (a dropped/derived index hashes equal at load and
        /// diverges later). No atmosphere is in this stack, so there is no reload gas drift — the
        /// comparison is whole-<see cref="Simulation.StateHash"/>, exact.
        ///
        /// MUTATION: in <see cref="StockZoneSystem.RestoreState"/> restore into an UN-sorted list
        /// (append at the front) ⇒ the canonical order is lost, the checksum reads a different
        /// order than the twin, and the at-load hash precondition fails.
        /// </summary>
        [Test]
        public void SaveWithFilters_ThenLoad_ThenRun1000Ticks_StaysBitIdentical()
        {
            var twin = NewSim(out var zt);
            var host = NewSim(out var zh);
            zt.SetFilter(twin, new Int3(1, 1, 0), MaskOf(ItemKind.Potato));
            zt.SetFilter(twin, new Int3(3, 1, 0), MaskOf(ItemKind.Scrap, ItemKind.Parts));
            zh.SetFilter(host, new Int3(1, 1, 0), MaskOf(ItemKind.Potato));
            zh.SetFilter(host, new Int3(3, 1, 0), MaskOf(ItemKind.Scrap, ItemKind.Parts));

            for (int i = 0; i < 300; i++) { twin.Tick(); host.Tick(); }
            Assert.That(host.StateHash(), Is.EqualTo(twin.StateHash()), "precondition: twins at the save tick");

            var ms = new MemoryStream();
            SaveWriter.Write(host, ms);
            ms.Position = 0;
            var loaded = SaveReader.Read(ms, new ISimSystem[] { new StockZoneSystem() });
            Assert.That(loaded.StateHash(), Is.EqualTo(host.StateHash()),
                "precondition: the round-trip is bit-exact at the save tick");

            for (int i = 0; i < 1000; i++) { loaded.Tick(); twin.Tick(); }

            Assert.That(loaded.StockZones.Zones, Has.Count.EqualTo(2),
                "precondition: the filters survived and are live after the run-on");
            Assert.That(loaded.StateHash(), Is.EqualTo(twin.StateHash()),
                "the reloaded sim diverged from the uninterrupted twin within 1000 ticks");
        }

        /// <summary>
        /// COMPAT (lane plan §3, §7): an OLD W0-6 v1 blob is a single state-marker byte. It must
        /// load silently as "no filters = accept-all" — <see cref="StockZoneSystem.RestoreState"/>
        /// version-BRANCHES to consume exactly that byte and leave the registry empty, so the byte
        /// stream stays in sync for the next chapter. A save made any time since W0-6 upgrades
        /// instead of vanishing.
        ///
        /// MUTATION: make the <c>if (version == 1)</c> branch <c>return</c> BEFORE
        /// <c>reader.ReadByte()</c> ⇒ the marker byte is left unconsumed, the reader misreads the
        /// trailing sentinel, and the sentinel assertion fails (in a real save this is a stream
        /// desync of the following chapter).
        /// </summary>
        [Test]
        public void OldV1MarkerByteBlob_LoadsSilentlyAsAcceptAll_ConsumingExactlyItsByte()
        {
            const int Sentinel = 0x51525354; // "QRST" — what the NEXT chapter would own

            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, Encoding.UTF8, leaveOpen: true))
            {
                w.Write((byte)1);      // the W0-6 v1 state-marker byte
                w.Write(Sentinel);     // stand-in for the next chapter's bytes
            }
            ms.Position = 0;

            var zones = new StockZoneSystem();
            int readBack;
            using (var r = new BinaryReader(ms, Encoding.UTF8, leaveOpen: true))
            {
                zones.RestoreState(r, 1);   // the v1 read path — version-BRANCH, never version-BAIL
                readBack = r.ReadInt32();   // must be the sentinel, not shifted by an unconsumed byte
            }

            Assert.That(readBack, Is.EqualTo(Sentinel),
                "RestoreState(v1) must consume exactly the marker byte — a desync here misreads the next chapter");
            Assert.That(zones.Zones, Is.Empty, "a v1 blob upgrades to no filters");
            Assert.That(zones.Accepts(new Int3(1, 1, 0), ItemKind.Scrap), Is.True, "empty ⇒ accept-all");
            Assert.That(zones.StateChecksum(), Is.EqualTo(StockZoneSystem.Seed), "and folds the bare seed");
        }

        // ============================================================== hash honesty

        /// <summary>
        /// StateHash of a sim whose <see cref="StockZoneSystem"/> holds exactly the given zones,
        /// injected through the REAL <see cref="IStatefulSystem.RestoreState"/> so the save format
        /// and the fold are exercised by the same helper (and arbitrary masks are reachable without
        /// a command path that does not exist yet).
        /// </summary>
        private static ulong HashOfInjected(params StockZone[] zonesIn)
        {
            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, Encoding.UTF8, leaveOpen: true))
            {
                w.Write(zonesIn.Length);
                foreach (var z in zonesIn)
                {
                    w.Write(z.Pos.X); w.Write(z.Pos.Y); w.Write(z.Pos.Z);
                    w.Write(z.AcceptMask);
                }
            }
            ms.Position = 0;

            var zones = new StockZoneSystem();
            using (var r = new BinaryReader(ms, Encoding.UTF8, leaveOpen: true))
                zones.RestoreState(r, zones.StateVersion);
            Assert.That(ms.Position, Is.EqualTo(ms.Length),
                "RestoreState must consume exactly the bytes CaptureState's format defines");
            Assert.That(zones.Zones.Count, Is.EqualTo(zonesIn.Length), "precondition: the entries really landed");

            var sim = new Simulation(AsciiWorld.Build(OneRoom), 1, new ISimSystem[] { zones });
            return sim.StateHash();
        }

        /// <summary>
        /// HASH HONESTY (§5.1) over every field the ZONE fold claims to cover. Twins are proven
        /// hash-EQUAL first, then exactly one field is mutated. <c>Pos</c> is folded through
        /// <c>Pack</c>, so each axis is perturbed ALONE — an X-only row would pass even if Y and Z
        /// were dropped from the packing entirely.
        ///
        /// MUTATION: delete either <c>XxHash64.Combine</c> line from
        /// <see cref="StockZoneSystem.StateChecksum"/> ⇒ its row fails. Delete the <c>Pack(z.Pos)</c>
        /// line ⇒ all three position rows fail.
        /// </summary>
        [Test]
        public void EveryStockZoneField_MovesTheStateHash()
        {
            var baseline = new StockZone { Pos = new Int3(3, 4, 1), AcceptMask = 0b1010101UL };

            void Row(string field, StockZone mutated)
            {
                ulong a = HashOfInjected(baseline);
                Assert.That(HashOfInjected(baseline), Is.EqualTo(a), "precondition: twins hash equal before any mutation");
                Assert.That(HashOfInjected(mutated), Is.Not.EqualTo(a),
                    $"StockZone.{field} is not folded into StateHash");
            }

            Row("Pos.X", new StockZone { Pos = new Int3(4, 4, 1), AcceptMask = baseline.AcceptMask });
            Row("Pos.Y", new StockZone { Pos = new Int3(3, 5, 1), AcceptMask = baseline.AcceptMask });
            Row("Pos.Z", new StockZone { Pos = new Int3(3, 4, 0), AcceptMask = baseline.AcceptMask });
            Row("AcceptMask", new StockZone { Pos = baseline.Pos, AcceptMask = baseline.AcceptMask ^ 1UL });
        }

        /// <summary>
        /// The COLLISION PAIR the per-field table structurally cannot find (§5.1 — "a per-field
        /// table would NOT have caught either W0-1 alias"). <c>Pos</c> and <c>AcceptMask</c> are the
        /// two fields a future author is most likely to pack into one word to save a Combine; under
        /// <c>Pack(Pos) | AcceptMask</c> the two GENUINELY DIFFERENT zones below hash IDENTICALLY.
        /// (pos origin, mask bit 0 set) packs to word 1; (pos X=1, mask 0) packs to word 1 too.
        /// Under the shipped one-field-per-Combine fold they must not collide.
        ///
        /// MUTATION: replace the two Combines in <see cref="StockZoneSystem.StateChecksum"/> with
        /// the single line <c>h = XxHash64.Combine(h, Pack(z.Pos) | z.AcceptMask);</c> ⇒ the pair
        /// collides (1|0 == 0|1) and this fails while the per-field table above still passes.
        /// </summary>
        [Test]
        public void Aliased_PosAndAcceptMask_AreNotTheSameWord()
        {
            ulong originAcceptBit0 = HashOfInjected(new StockZone { Pos = new Int3(0, 0, 0), AcceptMask = 1UL });
            ulong xOneAcceptNothing = HashOfInjected(new StockZone { Pos = new Int3(1, 0, 0), AcceptMask = 0UL });

            Assert.That(originAcceptBit0, Is.Not.EqualTo(xOneAcceptNothing),
                "(pos origin, mask 1) and (pos X=1, mask 0) are different zones and must hash differently");
        }

        /// <summary>
        /// THE PIN-HOLD (lane plan §3, §7). An EMPTY registry MUST fold the bare 'ZONE' seed —
        /// byte-identical to W0-6 — which is exactly what keeps every determinism pin unmoved on a
        /// ship that never zones a filter. Bumping <see cref="StockZoneSystem.StateVersion"/> 1→2
        /// changes the SAVE BLOB, not this checksum, so it does not move the sim hash.
        ///
        /// MUTATION: fold any nonzero constant into the empty checksum (e.g. seed <c>StateVersion</c>
        /// into <c>h</c>) ⇒ <c>StateChecksum() != Seed</c> ⇒ the scenario / tick-3000 / slice pins
        /// all move even though nothing designated a filter.
        /// </summary>
        [Test]
        public void EmptyRegistry_FoldsToBareSeed_WhichIsWhatHoldsThePins()
        {
            var zones = new StockZoneSystem();
            Assert.That(zones.Zones, Is.Empty, "precondition: nothing designated");
            Assert.That(zones.StateChecksum(), Is.EqualTo(StockZoneSystem.Seed),
                "an empty registry must fold the bare 'ZONE' seed — the fold-only pin-hold");
        }

        // ====================================================== WP-6: accept-all collapses to NO entry

        /// <summary>Inject zones straight through the REAL <see cref="IStatefulSystem.RestoreState"/>
        /// (the only door into the registry that is not <see cref="StockZoneSystem.SetFilter"/>), so a
        /// test can build a registry state that <c>SetFilter</c> itself now refuses to create.</summary>
        private static StockZoneSystem InjectZones(params StockZone[] zonesIn)
        {
            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, Encoding.UTF8, leaveOpen: true))
            {
                w.Write(zonesIn.Length);
                foreach (var z in zonesIn)
                {
                    w.Write(z.Pos.X); w.Write(z.Pos.Y); w.Write(z.Pos.Z);
                    w.Write(z.AcceptMask);
                }
            }
            ms.Position = 0;

            var zones = new StockZoneSystem();
            using (var r = new BinaryReader(ms, Encoding.UTF8, leaveOpen: true))
                zones.RestoreState(r, zones.StateVersion);
            return zones;
        }

        /// <summary>Every declared <see cref="ItemKind"/>, read from the enum — so an 8th kind is
        /// covered by these tests the day it is declared, with no test edit.</summary>
        private static ItemKind[] AllKinds() => (ItemKind[])System.Enum.GetValues(typeof(ItemKind));

        /// <summary>
        /// THE PAYOFF (WP-6). Painting an ACCEPT-EVERYTHING filter must store NO entry, so
        /// <c>Zones.Count</c> stays 0 and <c>HaulJobSource.cs:116</c>'s
        /// <c>filtered = _stockZones != null &amp;&amp; _stockZones.Zones.Count &gt; 0</c> stays FALSE
        /// — the pre-E0-4 fast path remains reachable on a ship whose zones restrict nothing. This
        /// asserts on <c>Zones.Count</c> because that expression IS the fast-path predicate, verbatim;
        /// <c>filtered</c> itself is a local with no diagnostic surface (the end-to-end consequence is
        /// pinned in <c>StockpileFilterHaulTests</c>).
        ///
        /// THREE spellings of accept-all must collapse, and the third is the one that matters:
        ///  1. the canonical <see cref="StockZoneSystem.AcceptAllMask"/> itself;
        ///  2. a mask carrying undefined bits above the enum range (<c>~0UL</c>) — what a caller
        ///     writing "everything" by complement produces (WP-4b, not yet in this tree, plans a
        ///     <c>~(1UL &lt;&lt; k)</c> "everything but k" harness mask; this is the accept-all case
        ///     of that idiom);
        ///  3. <c>MaskOf(AllKinds())</c> — a mask built from the ENUM, INDEPENDENTLY of
        ///     <see cref="StockZoneSystem.AcceptAllMask"/>, which is what any honest caller means by
        ///     "everything". Rows 1 and 2 cannot catch a TOO-WIDE production mask: row 1 compares the
        ///     constant with itself, and <c>~0UL &amp; X == X</c> for every <c>X</c>, so both collapse
        ///     under any value whatsoever. Row 3 is the only one that fails when the sim's idea of
        ///     "everything" is wider than a caller's — the divergence that would make WP-6 a silent
        ///     no-op behind a green gate (every honest accept-all paint stores an entry ⇒
        ///     <c>filtered</c> permanently true ⇒ the fast path dead).
        ///
        /// The registry also keeps folding the bare seed, so an all-accept paint cannot move a pin.
        ///
        /// MUTATION (verified): delete the
        /// <c>if (mask == AcceptAllMask) { ClearFilter(sim, pos); return; }</c> line from
        /// <see cref="StockZoneSystem.SetFilter"/> ⇒ every paint stores an entry, <c>Zones.Count</c> is
        /// 1, the checksum leaves the bare seed, and this fails.
        /// SECOND MUTATION (verified, the too-WIDE direction): append
        /// <c>m |= 1UL &lt;&lt; 7;</c> to <c>ComputeAcceptAllMask</c> ⇒ rows 1 and 2 still pass, and
        /// row 3 goes RED because <c>MaskOf(AllKinds())</c> no longer equals the sim's accept-all.
        /// </summary>
        [Test]
        public void AcceptAllFilter_StoresNoEntry_SoTheHaulFastPathStaysReachable()
        {
            var sim = NewSim(out var zones);
            var tile = new Int3(1, 1, 0);

            zones.SetFilter(sim, tile, StockZoneSystem.AcceptAllMask);
            Assert.That(zones.Zones, Is.Empty,
                "an accept-everything mask is the ABSENT-entry state, not an entry — " +
                "Zones.Count > 0 is HaulJobSource's `filtered` predicate and must stay false");
            Assert.That(zones.TryGetFilter(tile, out _), Is.False, "and nothing is stored for the tile");
            Assert.That(zones.StateChecksum(), Is.EqualTo(StockZoneSystem.Seed),
                "an all-accept paint must not even move the ZONE fold off the bare seed");

            // The same meaning spelled with undefined high bits set must collapse identically.
            zones.SetFilter(sim, tile, ~0UL);
            Assert.That(zones.Zones, Is.Empty,
                "bits above the ItemKind range mean nothing — ~0UL is still accept-everything");

            // THE ROW THAT BITES: "everything" built from the enum, NOT from AcceptAllMask. This is
            // what a caller (a UI, a harness, a host) independently means by accept-all; if the sim's
            // constant is ever WIDER than this, the collapse never fires for any real caller.
            zones.SetFilter(sim, tile, MaskOf(AllKinds()));
            Assert.That(zones.Zones, Is.Empty,
                "a mask covering every declared ItemKind, derived WITHOUT reference to AcceptAllMask, " +
                "must collapse — otherwise the sim's accept-all is wider than any caller's and WP-6 " +
                "is a silent no-op");

            foreach (var k in AllKinds())
                Assert.That(zones.Accepts(tile, k), Is.True,
                    $"and the tile really does accept every kind ({k})");
        }

        /// <summary>
        /// THE STALENESS HALF of the same fix — and the reason the collapse is a REMOVE, not a
        /// return. Restrict a tile, then paint it accept-everything: the old restriction must be
        /// GONE. If the collapse merely declined to store the new mask, the player's "this zone now
        /// takes anything" paint would leave the previous restriction quietly in force, with no entry
        /// in any UI that could reveal it — exactly the bug WP-5's explicit whole-mask paint exists to
        /// prevent.
        ///
        /// MUTATION (verified): in <see cref="StockZoneSystem.SetFilter"/> replace
        /// <c>{ ClearFilter(sim, pos); return; }</c> with a bare <c>{ return; }</c> ⇒ the Potato-only
        /// entry survives the accept-all paint, <c>Accepts(tile, Scrap)</c> is still false, and this fails.
        /// </summary>
        [Test]
        public void AcceptAllAfterARestriction_REMOVESTheStaleMask_AndDirtiesTheBoard()
        {
            var sim = NewSim(out var zones);
            var tile = new Int3(1, 1, 0);

            zones.SetFilter(sim, tile, MaskOf(ItemKind.Potato));
            Assert.That(zones.Accepts(tile, ItemKind.Scrap), Is.False, "precondition: really restricted");
            Assert.That(zones.Zones, Has.Count.EqualTo(1), "precondition: a real entry exists");

            sim.JobsDirty = JobBoardDirty.None;
            zones.SetFilter(sim, tile, StockZoneSystem.AcceptAllMask);

            foreach (var k in AllKinds())
                Assert.That(zones.Accepts(tile, k), Is.True,
                    $"repainting a zone as unrestricted must not leave the old restriction in force ({k})");
            Assert.That(zones.Zones, Is.Empty, "and it must leave NO entry behind");
            Assert.That((sim.JobsDirty & JobBoardDirty.Tiles), Is.EqualTo(JobBoardDirty.Tiles),
                "dropping a live restriction is a tile-board change — the haul board must rebuild");
        }

        /// <summary>
        /// THE DERIVATION GUARD. <see cref="StockZoneSystem.AcceptAllMask"/> must have a bit for
        /// EVERY declared <see cref="ItemKind"/>, no more and no fewer, or the collapse eats a real
        /// restriction. Driven off the enum: for each kind, a mask that accepts everything EXCEPT that
        /// kind must survive as a stored entry that rejects exactly it. This is the TOO-NARROW
        /// direction (the hard-coded-literal rot): a mask missing a kind makes the omitted-top-kind
        /// row collapse into accept-all, eating a real restriction. The TOO-WIDE direction is a
        /// DIFFERENT failure — the collapse silently never fires — and is caught by the third row of
        /// <see cref="AcceptAllFilter_StoresNoEntry_SoTheHaulFastPathStaysReachable"/> plus
        /// <see cref="AcceptAllMask_MatchesTheHostsCountBasedDerivation_WhichNeedsItemKindContiguous"/>.
        ///
        /// MUTATION (verified): make the derivation drop the highest kind — append
        /// <c>m &amp;= ~(1UL &lt;&lt; (int)ItemKind.ControllerModule);</c> to <c>ComputeAcceptAllMask</c>
        /// (the exact silent breakage a hard-coded <c>0x7F</c> would suffer when an 8th kind lands) ⇒
        /// the ControllerModule row's "everything but ControllerModule" mask is now equal to
        /// AcceptAllMask, collapses to no entry, and the "the entry is stored" assertion fails.
        /// </summary>
        [Test]
        public void AMaskOmittingExactlyOneKind_StaysAStoredRestriction_ForEveryDeclaredKind()
        {
            var kinds = AllKinds();
            Assert.That(kinds.Length, Is.GreaterThan(1), "precondition: more than one kind exists to omit");

            foreach (var omitted in kinds)
            {
                var sim = NewSim(out var zones);
                var tile = new Int3(1, 1, 0);
                zones.SetFilter(sim, tile, StockZoneSystem.AcceptAllMask ^ MaskOf(omitted));

                Assert.That(zones.Zones, Has.Count.EqualTo(1),
                    $"a mask that rejects {omitted} restricts something and MUST be stored");
                Assert.That(zones.Accepts(tile, omitted), Is.False,
                    $"and it must actually reject {omitted}");
                foreach (var other in kinds)
                    if (other != omitted)
                        Assert.That(zones.Accepts(tile, other), Is.True,
                            $"while still accepting {other}");
            }
        }

        /// <summary>
        /// THE CROSS-DERIVATION PIN — four independent spellings of "accept everything" will exist
        /// once WP-5 lands, and NOTHING else asserts they agree. The sim ORs <c>1UL &lt;&lt; k</c> over
        /// each declared enum VALUE (<c>StockZoneSystem.ComputeAcceptAllMask</c>); WP-5's three
        /// host/client sites each use a COUNT instead. FORWARD REFERENCE — none of these DERIVATION
        /// SITES exists in this tree yet (they are on the WP-5 branch; <c>GameSession.cs</c> itself is
        /// here but has no <c>AcceptAllMask</c> and no filter bridge). The paths and expressions below
        /// are as reported by this package's independent review, not as verified here:
        /// <c>hosts/tui/Ui/StockFilterModel.cs</c> (<c>(1UL &lt;&lt; KindCount) - 1UL</c>),
        /// <c>hosts/web/GameSession.cs</c> (<c>(1UL &lt;&lt; Enum.GetValues(typeof(ItemKind)).Length) - 1UL</c>)
        /// and <c>client/src/ui/stock-filter-model.js</c> (<c>(1 &lt;&lt; STOCK_KINDS.length) - 1</c>).
        ///
        /// Those agree ONLY while <see cref="ItemKind"/> is contiguous from 0. Give it a gap or a
        /// non-zero base — a kind retired, or explicit values assigned — and they diverge: the hosts
        /// send a mask that covers the hole and misses the top kind, so the collapse never fires (the
        /// fast path dies permanently) AND the stored mask silently rejects a real kind while both UIs
        /// read back "ALL". This assertion is the tripwire; if it goes red, those three files are what
        /// to look at, and the answer is to make every site derive from
        /// <see cref="StockZoneSystem.AcceptAllMask"/> rather than to widen this test.
        ///
        /// INTEGRATION NOTE — and its EXPIRY. This assertion must SURVIVE the merge with the WP-5
        /// branch (which owns those three sites): until then it is the only thing pinning the sim's
        /// door to what WP-5's UI actually sends. But it is a bridge, not a fixture — the moment every
        /// site consumes <see cref="StockZoneSystem.AcceptAllMask"/> directly, there is only ONE
        /// derivation left, nothing to cross-check, and this test should be DELETED rather than
        /// maintained. Do not read "must survive the merge" as "keep forever".
        ///
        /// SHAPE — the contiguity assertion is FIRST and stands on the ENUM, not on the constant. The
        /// mask-equality assertion alone is latently vacuous: rewrite <c>ComputeAcceptAllMask</c>'s
        /// body as the hosts' own <c>(1UL &lt;&lt; Enum.GetValues(typeof(ItemKind)).Length) - 1UL</c> —
        /// a plausible tidy-up — and it degenerates to <c>x == x</c>, silently disarming the tripwire
        /// (row 3 of <see cref="AcceptAllFilter_StoresNoEntry_SoTheHaulFastPathStaysReachable"/> does
        /// not backstop it: both spellings are 0x7F while the enum is contiguous). The per-index
        /// assertion cannot degenerate that way — it names the actual constraint the hosts depend on.
        ///
        /// MUTATION (verified): append <c>m |= 1UL &lt;&lt; 7;</c> to <c>ComputeAcceptAllMask</c> (the
        /// too-WIDE divergence) ⇒ the count-based derivation is 0x7F, the sim's is 0xFF, and the mask
        /// assertion fails.
        ///
        /// MUTATION (verified) for the contiguity assertion — it takes a change to the ENUM, because
        /// that is what it pins: give <see cref="ItemKind"/> a gap (<c>ControllerModule = 7</c>) ⇒ RED
        /// at index 6. MEASURED, so the claim is exact: applying the disarming tidy-up ALONE leaves all
        /// 22 tests GREEN — correctly, since rewriting the derivation to the count expression
        /// introduces no defect while the enum is contiguous. The tidy-up is dangerous only because it
        /// would make the MASK assertion vacuous; the pair (gap + tidy-up) is therefore the real
        /// measurement, and there this test still goes RED on the contiguity assertion. That is the
        /// property being bought: the tripwire cannot be silently disabled by a plausible refactor.
        /// </summary>
        [Test]
        public void AcceptAllMask_MatchesTheHostsCountBasedDerivation_WhichNeedsItemKindContiguous()
        {
            // The constraint itself, pinned on the enum — no reference to AcceptAllMask, so no
            // rewrite of its derivation can make this assertion compare something with itself.
            var kinds = AllKinds();
            for (int i = 0; i < kinds.Length; i++)
                Assert.That((int)kinds[i], Is.EqualTo(i),
                    "ItemKind must stay contiguous from 0 — the hosts derive accept-all from the COUNT " +
                    "((1 << Length) - 1), so a gap or a non-zero base makes their mask cover the hole " +
                    "and miss the top kind");

            Assert.That(StockZoneSystem.AcceptAllMask,
                Is.EqualTo((1UL << System.Enum.GetValues(typeof(ItemKind)).Length) - 1UL),
                "the sim's per-value derivation and the hosts' count derivation must agree — they do " +
                "only while ItemKind is contiguous from 0, and a divergence silently un-fires the " +
                "collapse (see hosts/tui/Ui/StockFilterModel.cs, hosts/web/GameSession.cs, " +
                "client/src/ui/stock-filter-model.js)");
        }

        /// <summary>
        /// ONE MEANING, ONE HASH. Bits above the <see cref="ItemKind"/> range change no behaviour —
        /// <see cref="StockZoneSystem.Accepts"/> only ever consults a declared kind's bit — but
        /// <see cref="StockZoneSystem.StateChecksum"/> folds <see cref="StockZone.AcceptMask"/>
        /// VERBATIM. Without canonicalisation, "everything but Potato" spelled <c>~(1UL &lt;&lt; 3)</c>
        /// (the complement idiom a measurement harness reaches for) and the same filter spelled bit by
        /// bit would be two byte-DIFFERENT sims that behave identically: hashed state that means
        /// nothing, which is the class of defect W0-1 spent a package removing.
        ///
        /// MUTATION (verified): delete <c>mask &amp;= AcceptAllMask;</c> from
        /// <see cref="StockZoneSystem.SetFilter"/> ⇒ the two spellings store 0xFFFFFFFFFFFFFFF7 and
        /// 0x77, the twin sims hash differently, and this fails.
        /// </summary>
        [Test]
        public void UndefinedHighBits_AreCanonicalisedAway_SoIdenticalMeaningIsIdenticalState()
        {
            var a = NewSim(out var za);
            var b = NewSim(out var zb);
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "precondition: twins before any filter");

            var tile = new Int3(1, 1, 0);
            ulong spelledOut = StockZoneSystem.AcceptAllMask ^ MaskOf(ItemKind.Potato);
            ulong spelledByComplement = ~(1UL << (int)ItemKind.Potato);   // same meaning, junk high bits

            za.SetFilter(a, tile, spelledOut);
            zb.SetFilter(b, tile, spelledByComplement);

            Assert.That(zb.TryGetFilter(tile, out var stored), Is.True, "precondition: a real entry landed");
            Assert.That(stored, Is.EqualTo(spelledOut),
                "the complement spelling must be stored in the SAME canonical form as the explicit one");
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()),
                "two sims with identically-behaving filters must be byte-identical, not merely equivalent");
            Assert.That(zb.Accepts(tile, ItemKind.Potato), Is.False, "and the restriction still bites");
        }

        /// <summary>
        /// THE LOAD-PATH DECISION, pinned so it is not "fixed" by accident.
        /// <see cref="StockZoneSystem.RestoreState"/> deliberately does NOT apply the collapse: it
        /// restores exactly what <see cref="StockZoneSystem.CaptureState"/> wrote, so load stays the
        /// exact inverse of save (the <c>loaded.StateHash() == saved.StateHash()</c> gate every
        /// stateful system here is held to) and no format change or StateVersion bump is needed. No
        /// save the game can produce contains an all-accept entry — <c>SetFilter</c> is the only door
        /// — and one injected by hand is behaviourally inert AND self-heals: the next paint on that
        /// tile removes it.
        ///
        /// MUTATION (verified): make the load collapse too — append, inside
        /// <see cref="StockZoneSystem.RestoreState"/>'s v2 read loop after the <c>Add</c>, the line
        /// <c>if ((_zones[_zones.Count - 1].AcceptMask &amp; AcceptAllMask) == AcceptAllMask)
        /// _zones.RemoveAt(_zones.Count - 1);</c> ⇒ the injected entry vanishes at load, the "load is
        /// not lossy" count assertion fails, and a save round-trip would stop being hash-exact for
        /// that blob.
        /// </summary>
        [Test]
        public void RestoreState_KeepsAnInjectedAcceptAllEntryVerbatim_AndTheNextPaintHealsIt()
        {
            var tile = new Int3(2, 1, 0);
            var zones = InjectZones(new StockZone { Pos = tile, AcceptMask = StockZoneSystem.AcceptAllMask });

            Assert.That(zones.Zones, Has.Count.EqualTo(1),
                "load must restore exactly what save wrote — collapsing here would make load lossy");
            Assert.That(zones.Zones[0].AcceptMask, Is.EqualTo(StockZoneSystem.AcceptAllMask),
                "and byte-for-byte, so the round-trip stays hash-exact");
            foreach (var k in AllKinds())
                Assert.That(zones.Accepts(tile, k), Is.True,
                    $"the entry is behaviourally inert — it accepts every kind, exactly like its absence ({k})");

            // Self-heal: the next write through the real door canonicalises the tile away.
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 1, new ISimSystem[] { zones });
            zones.SetFilter(sim, tile, StockZoneSystem.AcceptAllMask);
            Assert.That(zones.Zones, Is.Empty,
                "and one repaint through SetFilter removes it — the invariant heals without a migration");
        }

        /// <summary>
        /// THE SAVE WIDTH, still pinned after WP-6 narrowed what <see cref="StockZoneSystem.SetFilter"/>
        /// can store. <see cref="StockZone.AcceptMask"/> is a <c>ulong</c> written with
        /// <c>Write(ulong)</c>/<c>ReadUInt64</c>, and <see cref="StockZoneSystem.RestoreState"/>
        /// explicitly promises to restore a junk-high-bit entry VERBATIM (that promise is the whole
        /// case for not migrating on load). Since the canonicalisation means no test elsewhere in the
        /// suite can store a mask above <c>0x7F</c> any more, this is the only remaining proof that the
        /// full 64-bit width survives a real <see cref="SaveWriter"/>/<see cref="SaveReader"/> round
        /// trip. Injected through <see cref="RestoreState"/> because <c>SetFilter</c> — correctly —
        /// refuses to create such an entry.
        ///
        /// MUTATION (verified): in <see cref="StockZoneSystem.RestoreState"/>'s v2 loop, truncate the
        /// read to <c>AcceptMask = (uint)reader.ReadUInt64(),</c> (still consuming 8 bytes, so the
        /// stream stays in sync and only the WIDTH is lost) ⇒ the loaded mask is 0x1 and the VERBATIM
        /// assertion fails. Precisely: the hash assertion is unreached, and it would have PASSED —
        /// <see cref="InjectZones"/> goes through <see cref="StockZoneSystem.RestoreState"/> too, so
        /// both sides of the comparison truncate identically. The verbatim assertion is the only one
        /// that pins the width.
        /// </summary>
        [Test]
        public void AcceptMask_RoundTripsAtItsFullSixtyFourBitWidth_ThroughARealSave()
        {
            const ulong junk = 0x8000000000000001UL;   // top bit + bit 0: unreachable through SetFilter
            var tile = new Int3(2, 1, 0);

            var zones = InjectZones(new StockZone { Pos = tile, AcceptMask = junk });
            var sim = new Simulation(AsciiWorld.Build(OneRoom), 1, new ISimSystem[] { zones });

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;
            var loaded = SaveReader.Read(ms, new ISimSystem[] { new StockZoneSystem() });

            Assert.That(loaded.StockZones.Zones, Has.Count.EqualTo(1), "precondition: the entry round-tripped");
            Assert.That(loaded.StockZones.Zones[0].AcceptMask, Is.EqualTo(junk),
                "every one of the mask's 64 bits must survive the ZONE chapter — RestoreState promises verbatim");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "and the fold sees the same bits on both sides of the save");
        }
    }
}
