namespace Perilune.Sim
{
    /// <summary>
    /// E-VOY trade (economy Wave 0, W0-6 empty registration).
    ///
    /// Registered NOW, empty, so the 'TRAD' checksum seed folds into
    /// <see cref="Simulation.StateHash"/> and the SYSS chapter exists — both pin moves,
    /// batched by W0-6 so the pin moves exactly once. The E-VOY lane (exclusive path
    /// <c>sim/Sim.Core/Space/</c>, see <c>docs/ECONOMY-PLAN.md</c> §2) fills this in with the
    /// deterministic trade state (offers, faction settlement, price formation with no runtime
    /// RNG) WITHOUT a fresh pin site, stack reorder or new save chapter to discover.
    ///
    /// Note §2 also lists a <c>NAVS ext</c> for E-VOY — that is a CHECKSUM EXTENSION of the
    /// existing <c>NavSystem</c>'s chapter (fuel state on nav), NOT a new system, so it is not
    /// registered here; only the new 'TRAD' SYSS is. Trade itself arrives as an
    /// <see cref="ISimCommand"/> (the LLM may propose, never adjudicate — §7 risk 13).
    ///
    /// PASSIVE registry, exactly like <see cref="BuildSystem"/>: <see cref="Tick"/> is a
    /// no-op (trade is command-driven), so it adds nothing to the tick cost and does not
    /// allocate. It holds NO state yet — a <c>docs/MECHANICS.md</c> §13 "wired but not
    /// connected" entry until E-VOY connects it.
    /// </summary>
    public sealed class TradeSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Trade";          // SYSS chapter key (SaveReader matches by Name)
        public int IntervalTicks => 1;          // registered in the stack; Tick is a no-op
        public ushort StateVersion => 1;

        /// <summary>'TRAD' — the SYSS checksum seed. Big-endian ASCII: T=0x54 R=0x52 A=0x41
        /// D=0x44 (derived exactly as <see cref="BuildSystem"/>'s 0x42554C44 'BULD'). Asserted
        /// to decode to "TRAD" by <c>EconomySystemRegistrationTests.FourCCsSpellTheirChapter</c>.</summary>
        public const ulong Seed = 0x54524144UL;

        public void Tick(Simulation sim) { /* passive: no per-tick work (E-VOY trade is command-driven) */ }

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            // Empty state — E-VOY owns the real TRAD payload. A single state-marker byte keeps
            // the blob self-describing and non-empty so the E-lane extends a versioned format
            // rather than inventing one, and gives RestoreState a concrete branch subject.
            writer.Write((byte)StateVersion);
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            // Version-BRANCH, never version-BAIL (ECONOMY-PLAN §3.3). Deliberately NOT
            // `if (version != 1) return;` — that shape silently drops a v1 save the moment
            // E-VOY ships v2, losing every trade/standing record with no error. Every known blob
            // (v>=1) carries the marker byte; E-VOY reads its real trade state under a
            // `version >= 2` branch and defaults it for a v1 blob, so old saves upgrade.
            if (version < 1) return;   // pre-v1 / unknown-past: nothing was written to read
            reader.ReadByte();         // state-marker byte (present in every v>=1 blob)
            // if (version >= 2) { ... E-VOY reads real trade state here ... }
        }

        /// <summary>Empty fold: only the 'TRAD' seed (there is no state yet). Folding a
        /// constant seed into <see cref="Simulation.StateHash"/> is exactly what moves the
        /// determinism pin — see <see cref="DirectorSystem"/>'s StateChecksum note.</summary>
        public ulong StateChecksum() => Seed;
    }
}
