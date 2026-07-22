using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// The services a <see cref="IJobSource"/> may use that belong to the dispatcher rather than
    /// to any one source: the shared selection-pass counter and the one channel through which a
    /// ground stack becomes reserved.
    ///
    /// Deliberately tiny. Everything a source can do alone, it does alone; this type exists only
    /// for the two things that are genuinely cross-source, and each new member here is a member
    /// three future lanes inherit. Allocated once per <see cref="JobSystem"/>, never per tick.
    /// </summary>
    public sealed class JobContext
    {
        private readonly IJobSource[] _sources;
        private long _gen;

        internal JobContext(IJobSource[] sources) { _sources = sources; }

        /// <summary>The registered sources, in registration order — which IS the tie-break
        /// priority. Exposed read-only for tests and diagnostics; not a tick path.</summary>
        public IReadOnlyList<IJobSource> Sources => _sources;

        /// <summary>
        /// A fresh stamp for one selection pass. Generation counters replace clearing the
        /// per-candidate "tried" arrays between passes (the zero-alloc pattern ECONOMY-PLAN
        /// §3.5 names). Monotonic and shared, so a stamp written in an earlier pass — by any
        /// source, in any array — can never equal a later pass's value.
        /// </summary>
        public long NextGen() => ++_gen;

        /// <summary>
        /// Reserve a loose ground stack for a job and tell every source, in registration order,
        /// that the free pool shrank. The ONLY sanctioned way to set
        /// <see cref="ItemStack.ReservedForJob"/> from a job source — see
        /// <see cref="IJobSource.OnGroundItemReserved"/> for why.
        /// </summary>
        public void ReserveGroundItem(Simulation sim, ItemStack item)
        {
            item.ReservedForJob = true;
            for (int i = 0; i < _sources.Length; i++) _sources[i].OnGroundItemReserved(sim, item);
        }
    }

    /// <summary>Helpers shared by more than one job source. Static and stateless by design: a
    /// source may call them freely without the dispatcher mediating.</summary>
    public static class JobWork
    {
        /// <summary>How long a failed target is skipped before it is tried again (5 s at 10 Hz).
        /// A failed <c>FindPath</c> is a whole-region sweep, so re-attempting the same
        /// unreachable target every tick is the difference between a cheap board and a hot loop.
        /// The candidate stays on the board — a terrain change can make it viable.</summary>
        public const int UnreachableRetryTicks = 50;

        /// <summary>Path to a walkable 4-neighbor of <paramref name="target"/>, tried in
        /// +x,−x,+y,−y order (<see cref="Int3.Neighbor4"/> — the canonical order shared with
        /// pathing, room flood, atmosphere and power, so they can never disagree). Walkability
        /// goes through <see cref="Simulation.IsWalkable"/> so the rule is door-aware.</summary>
        public static bool TryPathToAdjacent(Simulation sim, Citizen citizen, Int3 target)
        {
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(target, i);
                if (!sim.World.InBounds(n)) continue;
                if (!sim.IsWalkable(n)) continue;
                if (sim.Paths.FindPath(sim, citizen.Pos, n, citizen.Path))
                {
                    citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                    return true;
                }
            }
            return false;
        }

        /// <summary>Give up the current job and re-dirty the board so the rescan re-derives it
        /// and the citizen is offered work again next tick. Reservations are the CALLER's to
        /// release first — this only clears job/work/path state.</summary>
        public static void AbandonJob(Simulation sim, Citizen citizen)
        {
            citizen.JobKind = JobKind.None;
            citizen.JobWorkTicks = 0;
            citizen.ClearPath();
            sim.JobsDirty = true;
        }

        /// <summary>Grow a generation-stamp array to hold <paramref name="needed"/> slots.
        /// Deliberately does NOT copy: stamps are valid for one selection pass only, and fresh
        /// zeros can never equal the current generation (which is >= 1).</summary>
        public static void EnsureSize(ref long[] array, int needed)
        {
            if (array.Length >= needed) return;
            int size = array.Length * 2;
            if (size < needed) size = needed;
            array = new long[size];
        }
    }
}
