namespace Perilune.Sim
{
    /// <summary>
    /// E-STOCK filtered stockpile zones (economy Wave 0, W0-6 empty registration).
    ///
    /// Registered NOW, empty, so that the checksum seed is folded into
    /// <see cref="Simulation.StateHash"/> and the 'ZONE' SYSS chapter exists — both are
    /// determinism-pin moves, and W0-6 batches them with the other three economy seeds so
    /// the pin moves exactly once. The E-STOCK lane (exclusive path
    /// <c>sim/Sim.Core/Stock/</c>, see <c>docs/ECONOMY-PLAN.md</c> §2) then fills this in
    /// with the real zone state (filtered stockpiles keyed by packed position, per E0-4)
    /// WITHOUT another pin site to discover, another <see cref="SystemStack"/> reorder, or
    /// a fresh save chapter to invent.
    ///
    /// PASSIVE registry, exactly like <see cref="BuildSystem"/>: <see cref="Tick"/> is a
    /// no-op (zones are command-driven state, not per-tick work), so the system adds nothing
    /// to the tick cost and does not allocate. It holds NO state yet — this is a
    /// <c>docs/MECHANICS.md</c> §13 "wired but not connected" entry until E-STOCK connects it.
    /// </summary>
    public sealed class StockZoneSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "StockZones";     // SYSS chapter key (SaveReader matches by Name)
        public int IntervalTicks => 1;          // registered in the stack; Tick is a no-op
        public ushort StateVersion => 1;

        /// <summary>'ZONE' — the SYSS checksum seed. Big-endian ASCII: Z=0x5A O=0x4F N=0x4E
        /// E=0x45 (derived exactly as <see cref="BuildSystem"/>'s 0x42554C44 'BULD'). Asserted
        /// to decode to "ZONE" by <c>EconomySystemRegistrationTests.FourCCsSpellTheirChapter</c>.</summary>
        public const ulong Seed = 0x5A4F4E45UL;

        public void Tick(Simulation sim) { /* passive: no per-tick work (E-STOCK is command-driven) */ }

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            // Empty state — E-STOCK owns the real ZONE payload. A single state-marker byte
            // keeps the blob self-describing and non-empty, so the E-lane EXTENDS a versioned
            // format rather than inventing one, and gives RestoreState a concrete branch subject.
            writer.Write((byte)StateVersion);
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            // Version-BRANCH, never version-BAIL (ECONOMY-PLAN §3.3). Deliberately NOT
            // `if (version != 1) return;` — that shape silently drops a v1 save the moment
            // E-STOCK ships v2, losing every stockpile with no error. Every known blob (v>=1)
            // carries the marker byte; E-STOCK reads its real zone state under a `version >= 2`
            // branch and defaults it for a v1 blob, so old saves upgrade instead of vanishing.
            if (version < 1) return;   // pre-v1 / unknown-past: nothing was written to read
            reader.ReadByte();         // state-marker byte (present in every v>=1 blob)
            // if (version >= 2) { ... E-STOCK reads real zone state here ... }
        }

        /// <summary>Empty fold: only the 'ZONE' seed (there is no state yet). Folding a
        /// constant seed into <see cref="Simulation.StateHash"/> is exactly what moves the
        /// determinism pin — see <see cref="DirectorSystem"/>'s StateChecksum note.</summary>
        public ulong StateChecksum() => Seed;
    }
}
