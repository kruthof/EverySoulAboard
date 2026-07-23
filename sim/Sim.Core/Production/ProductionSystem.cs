namespace Perilune.Sim
{
    /// <summary>
    /// E-PROD production graph &amp; bills (economy Wave 0, W0-6 empty registration).
    ///
    /// Registered NOW, empty, so the 'PROD' checksum seed folds into
    /// <see cref="Simulation.StateHash"/> and the SYSS chapter exists — both pin moves,
    /// batched by W0-6 so the pin moves exactly once. The E-PROD lane (exclusive path
    /// <c>sim/Sim.Core/Production/</c>, which also takes over <c>CraftingSystem.cs</c>, see
    /// <c>docs/ECONOMY-PLAN.md</c> §2) fills this in with the station-bill / conversion-graph
    /// state that the W0-5 <c>[production]</c> table already describes, WITHOUT a fresh pin
    /// site, stack reorder or new save chapter to discover mid-flight.
    ///
    /// PASSIVE registry, exactly like <see cref="BuildSystem"/>: <see cref="Tick"/> is a
    /// no-op (bills are command-driven state), so it adds nothing to the tick cost and does
    /// not allocate. It holds NO state yet — a <c>docs/MECHANICS.md</c> §13 "wired but not
    /// connected" entry until E-PROD connects it.
    /// </summary>
    public sealed class ProductionSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Production";     // SYSS chapter key (SaveReader matches by Name)
        public int IntervalTicks => 1;          // registered in the stack; Tick is a no-op
        public ushort StateVersion => 1;

        /// <summary>'PROD' — the SYSS checksum seed. Big-endian ASCII: P=0x50 R=0x52 O=0x4F
        /// D=0x44 (derived exactly as <see cref="BuildSystem"/>'s 0x42554C44 'BULD'). Asserted
        /// to decode to "PROD" by <c>EconomySystemRegistrationTests.FourCCsSpellTheirChapter</c>.</summary>
        public const ulong Seed = 0x50524F44UL;

        public void Tick(Simulation sim) { /* passive: no per-tick work (E-PROD is command-driven) */ }

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            // Empty state — E-PROD owns the real PROD payload. A single state-marker byte
            // keeps the blob self-describing and non-empty so the E-lane extends a versioned
            // format rather than inventing one, and gives RestoreState a concrete branch subject.
            writer.Write((byte)StateVersion);
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            // Version-BRANCH, never version-BAIL (ECONOMY-PLAN §3.3). Deliberately NOT
            // `if (version != 1) return;` — that shape silently drops a v1 save the moment
            // E-PROD ships v2, losing every bill with no error. Every known blob (v>=1) carries
            // the marker byte; E-PROD reads its real bill state under a `version >= 2` branch and
            // defaults it for a v1 blob, so old saves upgrade instead of vanishing.
            if (version < 1) return;   // pre-v1 / unknown-past: nothing was written to read
            reader.ReadByte();         // state-marker byte (present in every v>=1 blob)
            // if (version >= 2) { ... E-PROD reads real bill state here ... }
        }

        /// <summary>Empty fold: only the 'PROD' seed (there is no state yet). Folding a
        /// constant seed into <see cref="Simulation.StateHash"/> is exactly what moves the
        /// determinism pin — see <see cref="DirectorSystem"/>'s StateChecksum note.</summary>
        public ulong StateChecksum() => Seed;
    }
}
