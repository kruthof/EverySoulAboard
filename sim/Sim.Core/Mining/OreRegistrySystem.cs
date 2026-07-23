namespace Perilune.Sim
{
    /// <summary>
    /// E-MINE extraction ore registry (economy Wave 0, W0-6 empty registration).
    ///
    /// Registered NOW, empty, so the 'ORES' checksum seed folds into
    /// <see cref="Simulation.StateHash"/> and the SYSS chapter exists — both pin moves,
    /// batched by W0-6 so the pin moves exactly once.
    ///
    /// This is a REGISTRY, not an extraction system. Per <c>docs/ECONOMY-PLAN.md</c> §3.4,
    /// "extraction is a job source, not a system": the actual mining work belongs to an
    /// <see cref="Perilune.Sim.Jobs.IJobSource"/> inside the <see cref="JobSystem"/>
    /// dispatcher (W0-4). What lives HERE is the passive ore-deposit state that source reads
    /// — remaining yield per deposit, keyed by packed position — owned by the E-MINE lane
    /// (exclusive path <c>sim/Sim.Core/Mining/</c> plus one <c>IJobSource</c> file, see §2).
    /// So <see cref="Tick"/> is a no-op and NO ticking extraction system is added.
    ///
    /// PASSIVE registry, exactly like <see cref="BuildSystem"/>: adds nothing to the tick
    /// cost and does not allocate. It holds NO state yet — a <c>docs/MECHANICS.md</c> §13
    /// "wired but not connected" entry until E-MINE connects it.
    /// </summary>
    public sealed class OreRegistrySystem : ISimSystem, IStatefulSystem
    {
        public string Name => "OreRegistry";    // SYSS chapter key (SaveReader matches by Name)
        public int IntervalTicks => 1;          // registered in the stack; Tick is a no-op
        public ushort StateVersion => 1;

        /// <summary>'ORES' — the SYSS checksum seed. Big-endian ASCII: O=0x4F R=0x52 E=0x45
        /// S=0x53 (derived exactly as <see cref="BuildSystem"/>'s 0x42554C44 'BULD'). Asserted
        /// to decode to "ORES" by <c>EconomySystemRegistrationTests.FourCCsSpellTheirChapter</c>.</summary>
        public const ulong Seed = 0x4F524553UL;

        public void Tick(Simulation sim) { /* passive: extraction is a job source, not a ticking system */ }

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            // Empty state — E-MINE owns the real ORES payload (per-deposit remaining yield).
            // A single state-marker byte keeps the blob self-describing and non-empty so the
            // E-lane extends a versioned format rather than inventing one, and gives
            // RestoreState a concrete branch subject.
            writer.Write((byte)StateVersion);
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            // Version-BRANCH, never version-BAIL (ECONOMY-PLAN §3.3). Deliberately NOT
            // `if (version != 1) return;` — that shape silently drops a v1 save the moment
            // E-MINE ships v2, losing every ore deposit with no error. Every known blob (v>=1)
            // carries the marker byte; E-MINE reads its real deposit state under a `version >= 2`
            // branch and defaults it for a v1 blob, so old saves upgrade instead of vanishing.
            if (version < 1) return;   // pre-v1 / unknown-past: nothing was written to read
            reader.ReadByte();         // state-marker byte (present in every v>=1 blob)
            // if (version >= 2) { ... E-MINE reads real ore-deposit state here ... }
        }

        /// <summary>Empty fold: only the 'ORES' seed (there is no state yet). Folding a
        /// constant seed into <see cref="Simulation.StateHash"/> is exactly what moves the
        /// determinism pin — see <see cref="DirectorSystem"/>'s StateChecksum note.</summary>
        public ulong StateChecksum() => Seed;
    }
}
