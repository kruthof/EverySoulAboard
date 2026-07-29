using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// THE BACKOFF THE PULL SOURCES HAVE HAD SINCE W0-4, FOR THE TWO RECRUITERS THAT NEVER PASS
    /// THROUGH THE DISPATCHER.
    ///
    /// <para><b>The asymmetry this closes.</b> Every <see cref="IJobSource"/> that refuses a
    /// candidate stamps <see cref="JobWork.UnreachableRetryTicks"/> on it
    /// (<c>DigJobSource.cs:107</c>, <c>DeconstructJobSource.cs:147</c>,
    /// <c>BuildJobSource.cs:210</c>/<c>:223</c>, <c>HaulJobSource.cs:311</c>/<c>:543</c>), and
    /// <see cref="JobSystem"/>'s own contract calls a source that refuses without stamping "a
    /// SILENT HANG" and throws naming the offender. <see cref="CraftingSystem"/> and
    /// <see cref="MaintenanceSystem"/> recruit OUTSIDE the dispatcher, so they were held to none
    /// of it: each re-offered the same impossible job at their 1 Hz cadence, forever.</para>
    ///
    /// <para><b>Keyed by the TARGET, not the worker.</b> A refusal is a fact about the station or
    /// the machine ("nobody can work this right now"), never about the crew member who happened
    /// to be nearest — exactly as the pull sources back off a SITE and leave the citizen free to
    /// take other work. Keys are <see cref="Device.Id"/>.</para>
    ///
    /// <para><b>Not saved and not hashed, deliberately, and this is precedent rather than a new
    /// decision.</b> <c>DigJobSource._retryAt</c> and <c>HaulJobSource._tileRetryAt</c> are plain
    /// in-memory dictionaries too. A reload therefore starts eager — it re-probes once and
    /// re-stamps — which is the same one-pass cost the very first tick of a fresh sim pays. It
    /// adds no field to any save chapter and moves neither defs checksum.</para>
    ///
    /// <para><b>Determinism.</b> The dictionary is LOOKUP-ONLY — never iterated, never enumerated
    /// — so its internal ordering can reach nothing. No RNG, no allocation once an entry exists
    /// for a target, and no float.</para>
    /// </summary>
    public sealed class PushRecruitBackoff
    {
        private readonly Dictionary<uint, long> _retryAt = new Dictionary<uint, long>();

        /// <summary>
        /// DIAGNOSTIC SEAM, NON-MUTATING: the tick at which <paramref name="targetId"/> may be
        /// tried again, or 0 when it carries no stamp.
        ///
        /// <para>It exists because of trap 4 in <c>CLAUDE.md</c> — <i>to pin HOW something was
        /// called, record it at the seam rather than inferring it</i>. A guard that could only
        /// watch the clock cannot tell "site k stamped the station" from "site k's own blocking
        /// condition happens to still hold", and that is exactly the distinction the ten
        /// site-coverage legs exist to make. Unlike <see cref="IsBackedOff"/> this does NOT
        /// self-clean, so reading it cannot change what it measures.</para>
        ///
        /// <para>Never read on a tick path.</para>
        /// </summary>
        public long RetryAtFor(uint targetId) => _retryAt.TryGetValue(targetId, out long t) ? t : 0;

        /// <summary>How many targets are currently carrying a stamp (expired or not). Exposed for
        /// tests and diagnostics ONLY — never read on a tick path, so it can never influence the
        /// sim. It exists because "the backoff is engaged" is otherwise invisible to a test except
        /// through timing, and a guard that can only see timing cannot tell a stamp that was never
        /// written from one that expired.</summary>
        public int StampedCount => _retryAt.Count;

        /// <summary>
        /// This target refused work on this tick: skip it for
        /// <see cref="JobWork.UnreachableRetryTicks"/> (5 s at 10 Hz). The target stays on the
        /// board — a door opening, a stack landing or a repair can make it viable — exactly as an
        /// unreachable dig site does.
        /// </summary>
        public void Refuse(Simulation sim, uint targetId)
        {
            _retryAt[targetId] = sim.TickCount + JobWork.UnreachableRetryTicks;
        }

        /// <summary>
        /// Is this target still inside its backoff window? SELF-CLEANING: an expired stamp is
        /// removed as it is read, so a target that recovers stops costing a dictionary entry
        /// without anyone sweeping. (A target that is DESTROYED while stamped keeps its entry
        /// until something asks about that id again — the same bounded leak
        /// <c>DigJobSource._retryAt</c> carries for a tile that stops being designated.)
        /// </summary>
        public bool IsBackedOff(Simulation sim, uint targetId)
        {
            if (!_retryAt.TryGetValue(targetId, out long until)) return false;
            if (sim.TickCount < until) return true;
            _retryAt.Remove(targetId);
            return false;
        }

        // NO Clear(): a stamp is an ABSOLUTE deadline, so one written before a batch is already
        // in the past by the time the batch ends and clearing it would be a no-op. An API nobody
        // calls is an API nobody can be sure about.
    }
}
