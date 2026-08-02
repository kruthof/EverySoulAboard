using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// DIG: clear a designated debris tile. The simplest source and the reference implementation
    /// of the <see cref="IJobSource"/> contract — a board derived from tiles, reservations
    /// derived from citizen state, an unreachable backoff, and a work countdown that ends in a
    /// world write.
    ///
    /// Board: designated tiles whose wall is <see cref="TileDefs.Debris"/>, in z,y,x order (via
    /// the dispatcher's shared world pass). Reservations are not stored: they are re-derived
    /// every rescan from the citizens currently on a <see cref="JobKind.Dig"/> job, so a save
    /// needs nothing from this class.
    /// </summary>
    public sealed class DigJobSource : IJobSource, IJobTileScanner
    {
        /// <summary>Work ticks to dig one rock tile (600 s at 10 Hz). E0-2 L1 rebase (~10×):
        /// was 60. TODO(E-MINE/E3): move to mining.def when E-MINE owns dig extraction —
        /// deliberately kept a const in E0-2 to avoid an interim def section E-MINE would migrate.</summary>
        public const int DigWorkTicks = 6000;

        private static readonly JobKind[] Kinds = { JobKind.Dig };

        private readonly List<Int3> _sites = new List<Int3>(64);            // z,y,x scan order
        private readonly HashSet<Int3> _assigned = new HashSet<Int3>();     // lookup only, never iterated
        private long[] _tried = new long[64];
        private readonly Dictionary<Int3, long> _retryAt = new Dictionary<Int3, long>(); // lookup only

        public string Name => "Dig";
        public JobKind[] HandledKinds => Kinds;
        public int CandidateCount => _sites.Count;

        /// <summary>
        /// <see cref="IJobSource.IsBackedOff"/> for the DIG board. Keyed on the SITE — the designated
        /// tile itself, which is what <see cref="TryClaim"/> stamps — not on the neighbour a worker
        /// would stand on. A <c>TryGetValue</c>, so nothing here is enumerated (rule 4).
        ///
        /// <para>MIRRORS <c>HaulJobSource.IsBackedOff</c> LINE FOR LINE, deliberately: that method's
        /// doc calls itself "THE ONE DEFINITION OF 'BACKED OFF'", and a second, parallel copy of the
        /// <c>tick &lt; until</c> comparison is exactly how a diagnostic surface starts lying about
        /// the board it is describing. If this predicate ever needs to change, all four change
        /// together or none does.</para>
        ///
        /// <para>⚠️ The board's <see cref="Select"/> pass asks the same question INLINE
        /// (<c>_retryAt.TryGetValue(p, out long retry) &amp;&amp; sim.TickCount &lt; retry</c>) rather
        /// than through this accessor, and that is left alone on purpose: this package is
        /// pin-neutral, and re-pointing a selection-pass branch at a new method is a determinism-path
        /// edit for a readability gain. The two are asserted equivalent by
        /// <c>JobSourceBackoffTests</c> instead.</para>
        /// </summary>
        public bool IsBackedOff(Int3 pos, long tick, out long untilTick)
        {
            if (_retryAt.TryGetValue(pos, out untilTick) && tick < untilTick) return true;
            untilTick = 0;
            return false;
        }

        public void BeginTick(Simulation sim) { }

        // ------------------------------------------------------------------ board

        public void BeginTileScan(Simulation sim) => _sites.Clear();

        public void VisitTile(Simulation sim, Int3 pos, byte flags, ushort wall, ushort floor)
        {
            if ((flags & (byte)TileFlags.Designated) != 0 && wall == TileDefs.Debris) _sites.Add(pos);
        }

        public void Rescan(Simulation sim, JobContext ctx, JobBoardDirty what)
        {
            // Dig has one derivation and it is not tile-gated: the assigned set, re-derived from
            // citizen state every rescan (store order). The site board itself is filled by the
            // dispatcher's tile pass (gated on Tiles up in JobSystem), so `what` needs no branch
            // here — this pass is O(crew) and always correct to run. See IJobSource.Rescan.
            _assigned.Clear();
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;
                if (c.JobKind == JobKind.Dig) _assigned.Add(c.JobTarget);
            }
            JobWork.EnsureSize(ref _tried, _sites.Count);
        }

        // ------------------------------------------------------------- assignment

        public int Select(Simulation sim, Citizen citizen, int bestDist, long gen, out int dist)
        {
            int best = -1;
            dist = bestDist;
            for (int i = 0; i < _sites.Count; i++)
            {
                if (_tried[i] == gen) continue;
                var p = _sites[i];
                if (_retryAt.TryGetValue(p, out long retry) && sim.TickCount < retry)
                {
                    _tried[i] = gen; // backing off after a failed path attempt
                    continue;
                }
                if (_assigned.Contains(p) ||
                    (sim.World.GetFlags(p) & TileFlags.Designated) == 0 ||
                    sim.World.GetWall(p) != TileDefs.Debris)
                {
                    _tried[i] = gen; // no longer a valid job — skip for this pass
                    continue;
                }
                int d = Int3.Manhattan(citizen.Pos, p);
                if (d < dist)
                {
                    dist = d;
                    best = i;
                }
            }
            return best;
        }

        public bool TryClaim(Simulation sim, Citizen citizen, int candidate, long gen, JobContext ctx)
        {
            var target = _sites[candidate];
            if (JobWork.TryPathToAdjacent(sim, citizen, target))
            {
                citizen.JobKind = JobKind.Dig;
                citizen.JobTarget = target;
                // M3-7 — WHO is digging decides how long it takes. `WorkRates` is the ONE seam
                // between a crew member's per-work-type competence and the work she is given; this
                // file never names or reads a level (ArchitectureBoundaryTests forbids an economy
                // file from doing so, and says in as many words that M3-7 crosses it via one seam).
                // An untrained digger gets DigWorkTicks EXACTLY, so this line is the identity on the
                // whole shipping fleet today.
                citizen.JobWorkTicks = WorkRates.WorkTicksFor(citizen, WorkType.Mine, DigWorkTicks);
                _assigned.Add(target);
                _retryAt.Remove(target);
                return true;
            }
            _tried[candidate] = gen; // unreachable from here — the dispatcher tries next-nearest
            _retryAt[target] = sim.TickCount + JobWork.UnreachableRetryTicks;
            return false;
        }

        public void OnGroundItemReserved(Simulation sim, ItemStack item) { }

        // --------------------------------------------------------------- progress

        public void Progress(Simulation sim, Citizen citizen, JobContext ctx)
        {
            var target = citizen.JobTarget;

            // Designation revoked or tile already dug out from under us — drop the job.
            if ((sim.World.GetFlags(target) & TileFlags.Designated) == 0 ||
                sim.World.GetWall(target) != TileDefs.Debris)
            {
                JobWork.AbandonJob(sim, citizen);
                return;
            }

            if (citizen.HasPath) return; // still traveling (CitizenSystem moves us)

            if (!Int3.IsAdjacent4(citizen.Pos, target))
            {
                JobWork.AbandonJob(sim, citizen); // path was cleared/blocked — rescan retries
                return;
            }

            if (--citizen.JobWorkTicks > 0) return;

            // Dig complete: rock becomes open floor, spoil drops on the new tile.
            sim.World.SetWall(target, 0);
            sim.World.SetFloor(target, TileDefs.Floor);
            sim.World.SetFlag(target, TileFlags.Designated, false); // SetWall preserves it
            sim.Rooms.MarkDirty();
            sim.AddItem(ItemKind.Regolith, 1, target);
            sim.Events.Publish(new TileChangedEvent { Pos = target });
            citizen.JobKind = JobKind.None;
            citizen.JobWorkTicks = 0;
            // The wall/floor/designation changed (Tiles: the dug tile leaves the site board and the
            // TileChangedEvent above re-confirms it); the Regolith drop already set Items via AddItem.
            sim.JobsDirty |= JobBoardDirty.Tiles;
        }
    }
}
