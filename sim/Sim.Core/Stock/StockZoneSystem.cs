using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// One filtered stockpile tile: which <see cref="ItemKind"/>s the tile ACCEPTS. Presence
    /// ("this tile is a stockpile") stays on <see cref="TileFlags.Stockpile"/> (E0-3, bit 4,
    /// saved+hashed in the TILE chapter); this registry holds ONLY the filter, keyed by packed
    /// position. A stockpile tile with NO entry here = accept-all (the whole back-compat story:
    /// every E0-3 stockpile and every pre-E0-4 save keeps accept-everything with zero migration).
    /// An entry with <c>AcceptMask == 0</c> is a valid "accept nothing" zone.
    ///
    /// WP-6: an accept-EVERYTHING mask is never an entry — it is the ABSENCE of one. See
    /// <see cref="StockZoneSystem.SetFilter"/>; the invariant is "every stored entry restricts
    /// something", so <c>Zones.Count &gt; 0</c> means "some tile really is restricted".
    /// </summary>
    public struct StockZone
    {
        public Int3 Pos;
        /// <summary>Bit <c>k</c> set ⇒ accept <see cref="ItemKind"/> <c>k</c>. Covers kinds 0–63;
        /// today there are 7 (kinds 0–6). HONEST LIMIT (lane plan §2.3): kinds ≥ 64 are
        /// unrepresentable and would need a wider mask (a format bump). <see cref="ItemKind"/>'s
        /// hard ceiling is 255 (single-byte), so this is a future concern, flagged now.</summary>
        public ulong AcceptMask;
    }

    /// <summary>
    /// E0-4 FILTERED STOCKPILE ZONES — the per-tile filter registry, and <see cref="BuildSystem"/>
    /// / <see cref="DeconstructSystem"/>'s exact structural twin (canonical list, packed-position
    /// sorted, binary-inserted, SYSS-saved, checksum-folded). W0-6 registered this system EMPTY
    /// (<c>SystemStack.cs:50</c>) precisely so this lane fills it WITHOUT a new pin site, a
    /// <c>SystemStack</c> reorder, or a fresh save chapter to invent — so there is no SystemStack
    /// edit here.
    ///
    /// WHERE THE FILTER LIVES — a registry beside the flag, NOT a widened <see cref="TileFlags"/>
    /// (lane plan §2.1, DECIDED: Choice A). <see cref="TileFlags"/> has exactly one bit left and
    /// TILE is exact-version-gated, so a filter bitmask can never live in the flags plane
    /// (<c>ECONOMY.md</c> §8). Presence stays on bit 4 (unchanged, keeps the fast per-tile query
    /// the haul board already reads); only the FILTER moves into this registry. That satisfies
    /// ECONOMY.md §8's actual constraint ("filters must not live in TileFlags") at strictly less
    /// code and zero save migration.
    ///
    /// GRANULARITY — per-tile filter, not a contiguous zone object (lane plan §2.2). Each stockpile
    /// tile carries its own <see cref="StockZone.AcceptMask"/>; the "zone" the player paints is a
    /// client-side visual grouping of tiles with the same filter. A contiguous-zone model would
    /// need hashed zone-identity state (a flood-group id per tile, re-flooded on every edit) — new
    /// hashed state, a new reflood-order determinism hazard, and a save burden — to express what
    /// the per-tile model already delivers. Per-tile is the cheaper, determinism-clean v0 choice.
    ///
    /// PASSIVE registry, exactly like <see cref="BuildSystem"/>: <see cref="Tick"/> is a no-op
    /// (zones are pure command-driven state, not per-tick work), so the system adds nothing to the
    /// tick cost and does not allocate. There is NO <see cref="DeconstructSystem.Reap"/> analogue —
    /// a stockpile tile losing its presence bit is handled by the OFF path clearing the filter
    /// (WP-2), and an orphan mask on a non-stockpile tile is inert (haul ignores non-stockpile
    /// tiles). This keeps the system out of the per-tick cost entirely.
    ///
    /// Determinism: <c>_zones</c> is kept in canonical packed-position order (sorted insert), so
    /// every scan — the save, the checksum, any future haul query — is order-stable. No RNG, no
    /// Dictionary/HashSet iteration, no LINQ.
    ///
    /// SCOPE (WP-1): STATE ONLY. No haul wiring, no command, no client — those are WP-2/WP-5. This
    /// package adds NO def scalar (lane plan §2.5: the filter is player data, not policy), so the
    /// def-field / defs-checksum / de-DE-float gates DO NOT APPLY here.
    /// </summary>
    public sealed class StockZoneSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "StockZones";     // SYSS chapter key (SaveReader matches by Name)
        public int IntervalTicks => 1;          // registered in the stack; Tick is a no-op

        /// <summary>Bumped 1 → 2 for E0-4: v1 was W0-6's single state-marker byte; v2 is the real
        /// per-tile filter payload. <see cref="RestoreState"/> version-BRANCHES so a v1 blob
        /// (any save since W0-6) upgrades to "no filters = accept-all" instead of vanishing.</summary>
        public ushort StateVersion => 2;

        /// <summary>'ZONE' — the SYSS checksum seed. Big-endian ASCII: Z=0x5A O=0x4F N=0x4E
        /// E=0x45 (derived exactly as <see cref="BuildSystem"/>'s 0x42554C44 'BULD'). Asserted
        /// to decode to "ZONE" by <c>EconomySystemRegistrationTests.FourCCsSpellTheirChapter</c>.</summary>
        public const ulong Seed = 0x5A4F4E45UL;

        /// <summary>
        /// WP-6 — the mask that accepts EVERY declared <see cref="ItemKind"/>: bit <c>k</c> set for
        /// each declared kind, and nothing else (today kinds 0–6 ⇒ <c>0x7F</c>). DERIVED FROM THE
        /// ENUM, never hard-coded, so an 8th kind widens it automatically instead of silently
        /// turning "accept everything" into "accept everything except the new kind" — the exact way
        /// a hard-coded <c>0x7F</c> would rot. Computed once at type-init (the
        /// <c>JobSystem.KindCount</c> precedent, <c>JobSystem.cs:57</c>); no tick path touches it.
        ///
        /// Kinds ≥ 64 are skipped, not shifted: <c>1UL &lt;&lt; 64</c> silently aliases to bit 0 in
        /// C#, and <see cref="StockZone.AcceptMask"/> already documents kinds ≥ 64 as
        /// unrepresentable (they would need a wider mask and a format bump).
        /// </summary>
        public static readonly ulong AcceptAllMask = ComputeAcceptAllMask();

        private static ulong ComputeAcceptAllMask()
        {
            ulong m = 0;
            // ItemKind's underlying type is byte, so every value is in 0..255 — the only bound worth
            // testing is the mask's 64-bit ceiling.
            foreach (var kind in (ItemKind[])System.Enum.GetValues(typeof(ItemKind)))
            {
                int k = (int)kind;
                if (k < 64) m |= 1UL << k;
            }
            return m;
        }

        // Canonical packed-position-sorted filter list. Never iterated for lookups (a small linear
        // scan by position, exactly like DeconstructSystem.TryGet/Cancel, is fine at v0 densities
        // and stays alloc-free).
        private readonly List<StockZone> _zones = new List<StockZone>(32);

        /// <summary>The filtered tiles in canonical order (inspectors / the harness read this).</summary>
        public IReadOnlyList<StockZone> Zones => _zones;

        public void Tick(Simulation sim) { /* passive: no per-tick work (E0-4 is command-driven) */ }

        // ---------------------------------------------------------------- public API

        /// <summary>
        /// Insert-or-replace the filter at <paramref name="pos"/> to <paramref name="mask"/>, keeping
        /// the list in canonical packed-position order. Deterministic, no RNG. Sets
        /// <see cref="Simulation.JobsDirty"/> <c>| Tiles</c> — a zone filter change is a tile-board
        /// change (the same axis a stockpile designation dirties). No legality check: an entry on a
        /// non-stockpile tile is inert (haul ignores non-stockpile tiles), so a mask is only ever
        /// consulted where a presence bit already exists.
        ///
        /// WP-6 — TWO CANONICALISATIONS, both at this single write door (the only way a running sim
        /// can ever create an entry; <c>_zones</c> is private and the command path lands here):
        ///
        /// 1. UNDEFINED BITS ARE MASKED OFF. <see cref="Accepts"/> only ever consults a real
        ///    <see cref="ItemKind"/>'s bit, so bits above <see cref="AcceptAllMask"/> change no
        ///    behaviour — but <see cref="StateChecksum"/> folds <see cref="StockZone.AcceptMask"/>
        ///    VERBATIM, so leaving them would make two identically-behaving sims hash differently
        ///    (hashed state that means nothing — the class of thing W0-1 spent a package removing).
        ///    Callers that spell "everything but Potato" as <c>~(1UL &lt;&lt; 3)</c> and callers that
        ///    spell it <c>0x77</c> now produce the same canonical state.
        ///
        /// 2. AN ACCEPT-EVERYTHING MASK STORES NO ENTRY — it collapses to <see cref="ClearFilter"/>.
        ///    "Accept everything" IS the absent-entry state (see the type doc), so storing it would
        ///    be a second, redundant spelling of the same meaning. It would also be actively
        ///    expensive: <c>HaulJobSource.cs:116</c> takes its pre-E0-4 fast path on
        ///    <c>Zones.Count == 0</c>, so one accept-all paint anywhere would turn the per-item
        ///    <c>AnyFreeStockpileAccepts</c> gate — a linear scan over <see cref="TryGetFilter"/>,
        ///    itself a linear scan — on FOREVER, at 10 Hz, on a ship with no restriction on it.
        ///    Collapsing keeps the invariant "every stored entry restricts something".
        ///
        /// Note the collapse is a REMOVE, never a no-op: repainting a restricted tile as unrestricted
        /// must drop the old mask, or the player's restriction survives a "you accept everything now"
        /// paint invisibly. On a tile that had no entry, <see cref="ClearFilter"/> is itself a no-op
        /// and does not dirty the board — nothing changed, so nothing needs rebuilding.
        /// </summary>
        public void SetFilter(Simulation sim, Int3 pos, ulong mask)
        {
            mask &= AcceptAllMask;                                  // (1) drop meaningless bits
            if (mask == AcceptAllMask) { ClearFilter(sim, pos); return; }  // (2) accept-all = no entry

            for (int i = 0; i < _zones.Count; i++)      // replace an existing filter in place
            {
                if (_zones[i].Pos != pos) continue;
                _zones[i] = new StockZone { Pos = pos, AcceptMask = mask };
                sim.JobsDirty |= JobBoardDirty.Tiles;
                return;
            }
            InsertSorted(new StockZone { Pos = pos, AcceptMask = mask });
            sim.JobsDirty |= JobBoardDirty.Tiles;
        }

        /// <summary>
        /// Remove the filter at <paramref name="pos"/> — the tile reverts to accept-all. Returns
        /// false (no state change) if nothing was filtered there. Sets <c>JobsDirty | Tiles</c>. The
        /// OFF path of a stockpile designation calls this (WP-2) so clearing a stockpile never leaves
        /// an orphan filter entry accumulating in the hash.
        /// </summary>
        public bool ClearFilter(Simulation sim, Int3 pos)
        {
            for (int i = 0; i < _zones.Count; i++)
            {
                if (_zones[i].Pos != pos) continue;
                _zones.RemoveAt(i);
                sim.JobsDirty |= JobBoardDirty.Tiles;
                return true;
            }
            return false;
        }

        /// <summary>The filter mask at <paramref name="pos"/>, or false if the tile has no entry
        /// (⇒ accept-all). Linear scan in canonical order, mirroring
        /// <see cref="DeconstructSystem.TryGet"/>.</summary>
        public bool TryGetFilter(Int3 pos, out ulong mask)
        {
            for (int i = 0; i < _zones.Count; i++)
            {
                if (_zones[i].Pos == pos) { mask = _zones[i].AcceptMask; return true; }
            }
            mask = 0;
            return false;
        }

        /// <summary>
        /// The hot query the haul board will use (WP-2): does the tile at <paramref name="pos"/>
        /// accept <paramref name="kind"/>? An ABSENT entry accepts everything (back-compat); a
        /// present entry accepts iff its bit is set. This is the whole "accept-all is a code
        /// constant" story — there is no default mask stored anywhere.
        /// </summary>
        public bool Accepts(Int3 pos, ItemKind kind) =>
            !TryGetFilter(pos, out ulong m) || (m & (1UL << (int)kind)) != 0;

        // ----------------------------------------------------------- sorted insert

        // VERBATIM copy of BuildSystem.Pack / Simulation.Pack / DeconstructSystem.Pack — the FOURTH
        // copy in the repo. It masks none of its fields (X above 2^20 aliases into Y), which is a
        // real latent bug and deliberately NOT fixed here: the masked-21/21/6 correction moves the
        // determinism pins and is its own package (ECONOMY-PLAN; lane plan §7 hazard 3). Copying it
        // keeps this system's ordering byte-identical to its three twins; fixing it in one of four
        // copies would be worse than the bug.
        private static ulong Pack(Int3 p) =>
            (ulong)(uint)p.X | ((ulong)(uint)p.Y << 20) | ((ulong)(uint)p.Z << 40);

        private void InsertSorted(StockZone z)
        {
            ulong key = Pack(z.Pos);
            int lo = 0, hi = _zones.Count;
            while (lo < hi)
            {
                int mid = (lo + hi) >> 1;
                if (Pack(_zones[mid].Pos) < key) lo = mid + 1; else hi = mid;
            }
            _zones.Insert(lo, z);
        }

        // --------------------------------------------------------------- save/hash

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(_zones.Count);
            for (int i = 0; i < _zones.Count; i++)
            {
                var z = _zones[i];
                writer.Write(z.Pos.X);
                writer.Write(z.Pos.Y);
                writer.Write(z.Pos.Z);
                writer.Write(z.AcceptMask);
            }
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            // WP-6, DELIBERATELY NOT MIGRATED: the accept-all collapse is enforced at the WRITE door
            // (SetFilter) only — RestoreState restores exactly what CaptureState wrote, byte for
            // byte, including a hypothetical all-accept or junk-high-bit entry. Reasons: (a) no save
            // the game can produce contains one, because SetFilter is the only way an entry is ever
            // created (_zones is private; the command path lands there) and the ZONE v2 payload has
            // never shipped — so there is nothing to migrate; (b) load must stay the exact inverse of
            // save, or `loaded.StateHash() == saved.StateHash()` (the save gate every stateful system
            // here is held to) stops being true for the blobs it does not rewrite; (c) such an entry
            // is behaviourally inert anyway — it accepts every kind, exactly like its own absence —
            // and the next SetFilter/ClearFilter on that tile removes it. So NO StateVersion bump and
            // NO format change: v2 stays v2.
            //
            // Version-BRANCH, never version-BAIL (ECONOMY-PLAN §3.3). Deliberately NOT
            // `if (version != StateVersion) return;` — that shape silently drops every v1 save the
            // moment v2 ships, losing nothing today but every stockpile the day filters are saved.
            if (version < 1 || version > StateVersion) return;
            _zones.Clear();
            if (version == 1)
            {
                // W0-6's single state-marker byte ⇒ no filters ⇒ accept-all everywhere. A v1 blob
                // (any save made since W0-6) upgrades to empty rather than desyncing the stream.
                reader.ReadByte();
                return;
            }
            int count = reader.ReadInt32();                     // v2+
            for (int i = 0; i < count; i++)
            {
                _zones.Add(new StockZone
                {
                    Pos = new Int3(reader.ReadInt32(), reader.ReadInt32(), reader.ReadInt32()),
                    AcceptMask = reader.ReadUInt64(),
                }); // saved in canonical order → stays sorted
            }
        }

        /// <summary>Folds the 'ZONE' seed and every field of every filtered tile, in canonical
        /// order. An EMPTY registry folds the bare seed — byte-identical to today — which is exactly
        /// what keeps every determinism pin unmoved on ships that never zone a filter. Bumping
        /// <see cref="StateVersion"/> changes the SAVE BLOB, not this checksum, so it does not move
        /// the sim hash.</summary>
        public ulong StateChecksum()
        {
            ulong h = Seed;
            for (int i = 0; i < _zones.Count; i++)
            {
                var z = _zones[i];
                h = XxHash64.Combine(h, Pack(z.Pos));
                h = XxHash64.Combine(h, z.AcceptMask);
            }
            return h;
        }
    }
}
