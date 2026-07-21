using System.IO;

namespace Moonbase.Sim
{
    /// <summary>
    /// A sim system with internal state that must survive save/load (e.g. the MOSS
    /// runtime's edge-trigger latches and every-timers). SaveWriter emits one SYSS
    /// chapter per stateful system keyed by <see cref="ISimSystem.Name"/>; SaveReader
    /// hands the blob back after construction. Systems must tolerate restore arriving
    /// before their derived content is (re)built — stash and apply when ready.
    /// </summary>
    public interface IStatefulSystem : ISimSystem
    {
        /// <summary>Version of this system's blob format (for future migrations).</summary>
        ushort StateVersion { get; }

        void CaptureState(BinaryWriter writer);
        void RestoreState(BinaryReader reader, ushort version);

        /// <summary>
        /// Deterministic checksum of the same state CaptureState persists — folded into
        /// Simulation.StateHash so the determinism canary sees system-internal state
        /// (e.g. MOSS latches/timers) that a bad restore would otherwise hide.
        /// </summary>
        ulong StateChecksum();
    }
}
