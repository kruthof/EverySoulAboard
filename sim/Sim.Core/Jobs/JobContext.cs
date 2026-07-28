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
        /// Reserve a loose ground stack for a job on behalf of <paramref name="owner"/> and tell
        /// every source, in registration order, that the free pool shrank. The ONLY sanctioned way
        /// to set <see cref="ItemStack.ReservedBy"/> from a job source — see
        /// <see cref="IJobSource.OnGroundItemReserved"/> for why. Stamping the OWNER id (not a bare
        /// flag) lets each release path clear only its own claim on a co-located tile (B-1).
        /// </summary>
        public void ReserveGroundItem(Simulation sim, Citizen owner, ItemStack item)
        {
            item.ReservedBy = owner.Id;
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
        /// goes through <see cref="Simulation.IsWalkable"/> so the rule is door-aware.
        ///
        /// THE ONE JOB-BOARD SEAM OF THE WORKSITE STAGING RULE (docs/HANDOVER.md §5 item 2). This
        /// is where dig, build and deconstruct all choose the tile the worker will stand on, so
        /// <see cref="WorksiteSafety.CanStageWorkerAt"/> is asked here and NOWHERE ELSE in the job
        /// board — read its doc comment for why a worker staged in unbreathable air produces an
        /// unbounded walk/flee/recover/walk cycle instead of work. A refusal is not new machinery:
        /// every caller already treats "no adjacent tile worked" as an unreachable target and stamps
        /// its own <c>JobWork.UnreachableRetryTicks</c> backoff, so the site is simply re-probed
        /// every 5 s until the compartment breathes again.
        ///
        /// The rule is inert on a stack without <see cref="SafetySystem"/>, which is what keeps
        /// every atmosphere-free test sim and every pinned ship byte-identical.</summary>
        public static bool TryPathToAdjacent(Simulation sim, Citizen citizen, Int3 target)
        {
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(target, i);
                if (!sim.World.InBounds(n)) continue;
                if (!sim.IsWalkable(n)) continue;
                if (!WorksiteSafety.CanStageWorkerAt(sim, n)) continue;
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
            // A shared helper with callers of differing needs: a dig/build abandon frees a site
            // (Citizens re-derives every assigned set), while a haul/build-haul abandon has just
            // released a ground stack / material unit back to the free pool (Items — the released
            // stack must re-enter the haul board and the build free-material count). Set both so no
            // caller can under-trigger; over-triggering Items on a dig abandon rebuilds the haul
            // board to an identical result and never walks the world tile pass.
            sim.JobsDirty |= JobBoardDirty.Items | JobBoardDirty.Citizens;
        }

        /// <summary>
        /// Rebuild the "a loose stack is standing here" set from the item store (store order;
        /// the set is a Contains-lookup only, never iterated). Cleared and refilled in place, so
        /// it does not allocate once warm.
        /// </summary>
        public static void RebuildGroundItemTiles(Simulation sim, HashSet<Int3> into)
        {
            into.Clear();
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                if (items[i].CarriedBy == 0) into.Add(items[i].Pos);
            }
        }

        /// <summary>
        /// Can a stack be set down here? A zoned, walkable tile with nothing already on it.
        /// Shared rather than private to <see cref="HaulJobSource"/> because E-STOCK's filtered
        /// zones need exactly this predicate, and a second copy is how two definitions of "free
        /// stockpile tile" drift apart — the file-level version of the problem W0-4 exists to fix.
        /// </summary>
        public static bool IsFreeStockpileTile(Simulation sim, Int3 p, HashSet<Int3> groundItemTiles)
        {
            var flags = sim.World.GetFlags(p);
            return (flags & TileFlags.Stockpile) != 0 &&
                   (flags & TileFlags.Walkable) != 0 &&
                   !groundItemTiles.Contains(p);
        }

        /// <summary>
        /// E0-4 kind-ed overload: a free stockpile tile that ALSO accepts <paramref name="kind"/>
        /// under its filter. An ABSENT filter entry — and a sim with no <see cref="StockZoneSystem"/>
        /// — is accept-all (<c>sim.StockZones?.Accepts(p, kind) ?? true</c>), so on an unfiltered
        /// tile this is byte-for-byte the kind-less overload above. The single shared free-stockpile
        /// predicate the haul board's per-item candidate gate and destination selection both call
        /// with the CARRIED kind; the kind-less overload stays the accept-all-equivalent "does ANY
        /// free stockpile tile exist" gate (lane plan §8 hazard 4 — keeping both so the existing
        /// caller's behaviour cannot silently change).
        /// </summary>
        public static bool IsFreeStockpileTile(Simulation sim, Int3 p, HashSet<Int3> groundItemTiles, ItemKind kind)
        {
            return IsFreeStockpileTile(sim, p, groundItemTiles) &&
                   (sim.StockZones?.Accepts(p, kind) ?? true);
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
