using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// HAUL: carry a loose stack to a stockpile zone. Two <see cref="JobKind"/>s on one job —
    /// <see cref="JobKind.HaulPickup"/> (empty-handed, en route to the stack) then
    /// <see cref="JobKind.HaulDeliver"/> (carrying, en route to the tile chosen at pickup).
    ///
    /// Boards: stockpile tiles in z,y,x order (dispatcher world pass); haul candidates in item
    /// ENTITY STORE order. Candidates only exist while at least one stockpile tile is free —
    /// otherwise the crew would queue for a destination that does not exist. Items already
    /// standing inside a zone count as stored, or every delivery would re-dirty into a re-haul.
    /// Corpses are excluded (the dead are not cargo; funerals are M3+).
    /// </summary>
    public sealed class HaulJobSource : IJobSource, IJobTileScanner
    {
        private static readonly JobKind[] Kinds = { JobKind.HaulPickup, JobKind.HaulDeliver };

        private readonly List<uint> _items = new List<uint>(64);            // item store order
        private readonly List<Int3> _stockpiles = new List<Int3>(64);       // z,y,x scan order
        private readonly HashSet<Int3> _groundItemTiles = new HashSet<Int3>(); // lookup only
        private long[] _tried = new long[64];
        private long[] _stockTried = new long[64];
        private readonly Dictionary<uint, long> _retryAt = new Dictionary<uint, long>(); // lookup only

        public string Name => "Haul";
        public JobKind[] HandledKinds => Kinds;
        public int CandidateCount => _items.Count;

        public void BeginTick(Simulation sim) { }

        // ------------------------------------------------------------------ board

        public void BeginTileScan(Simulation sim) => _stockpiles.Clear();

        public void VisitTile(Simulation sim, Int3 pos, byte flags, ushort wall, ushort floor)
        {
            if ((flags & (byte)TileFlags.Stockpile) != 0) _stockpiles.Add(pos);
        }

        public void Rescan(Simulation sim, JobContext ctx, JobBoardDirty what)
        {
            // The haul candidate list depends on BOTH the item store AND the stockpile tile board
            // (no free stockpile ⇒ no candidates), so rebuild it when either changed. A Sites- or
            // Citizens-only rescan leaves `_items` — and hence CandidateCount — at its prior value,
            // which is correct because neither items nor stockpiles moved. Haul has no
            // citizen-derived set, so there is nothing to run on those rescans but the EnsureSize.
            if ((what & (JobBoardDirty.Items | JobBoardDirty.Tiles)) != 0)
            {
                _items.Clear();

                // Ground-item occupancy (per-scan; Contains-lookups only).
                JobWork.RebuildGroundItemTiles(sim, _groundItemTiles);
                var items = sim.Items.Items;

                bool anyFreeStockpile = false;
                for (int i = 0; i < _stockpiles.Count; i++)
                {
                    if (JobWork.IsFreeStockpileTile(sim, _stockpiles[i], _groundItemTiles))
                    {
                        anyFreeStockpile = true;
                        break;
                    }
                }

                if (anyFreeStockpile)
                {
                    for (int i = 0; i < items.Count; i++)
                    {
                        var item = items[i];
                        if (item.CarriedBy != 0 || item.ReservedForJob) continue;
                        if (item.Kind == ItemKind.Corpse) continue; // the dead are not cargo
                        if ((sim.World.GetFlags(item.Pos) & TileFlags.Stockpile) != 0) continue; // already stored
                        _items.Add(item.Id);
                    }
                }
            }

            JobWork.EnsureSize(ref _tried, _items.Count);
            JobWork.EnsureSize(ref _stockTried, _stockpiles.Count);
        }

        // ------------------------------------------------------------- assignment

        public int Select(Simulation sim, Citizen citizen, int bestDist, long gen, out int dist)
        {
            int best = -1;
            dist = bestDist;
            for (int i = 0; i < _items.Count; i++)
            {
                if (_tried[i] == gen) continue;
                if (_retryAt.TryGetValue(_items[i], out long retry) && sim.TickCount < retry)
                {
                    _tried[i] = gen;
                    continue;
                }
                if (!sim.Items.TryGet(_items[i], out var item) ||
                    item.CarriedBy != 0 || item.ReservedForJob)
                {
                    _tried[i] = gen;
                    continue;
                }
                int d = Int3.Manhattan(citizen.Pos, item.Pos);
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
            if (sim.Items.TryGet(_items[candidate], out var item) &&
                sim.Paths.FindPath(sim, citizen.Pos, item.Pos, citizen.Path))
            {
                citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                citizen.JobKind = JobKind.HaulPickup;
                citizen.JobTarget = item.Pos;
                citizen.ReservedItemId = item.Id;
                // A stockpile haul takes material out of the free pool just as surely as a build
                // haul does — without the notification, a later site in the SAME board pass can
                // clear its sufficiency gate and then find nothing to reserve, costing it a 5 s
                // backoff. Inert unless a source actually tracks a pool. Fired here, after the
                // citizen's job state is complete, so every handler sees one world (IJobSource).
                ctx.ReserveGroundItem(sim, item);
                _retryAt.Remove(item.Id);
                return true;
            }
            _tried[candidate] = gen;
            _retryAt[_items[candidate]] = sim.TickCount + JobWork.UnreachableRetryTicks;
            return false;
        }

        public void OnGroundItemReserved(Simulation sim, ItemStack item) { }

        // --------------------------------------------------------------- progress

        public void Progress(Simulation sim, Citizen citizen, JobContext ctx)
        {
            if (citizen.JobKind == JobKind.HaulPickup) ProgressPickup(sim, citizen, ctx);
            else ProgressDeliver(sim, citizen);
        }

        private void ProgressPickup(Simulation sim, Citizen citizen, JobContext ctx)
        {
            if (citizen.HasPath) return; // en route to the item

            if (citizen.Pos != citizen.JobTarget)
            {
                // Path was cleared/blocked before arrival — release the reservation.
                if (citizen.ReservedItemId != 0 &&
                    sim.Items.TryGet(citizen.ReservedItemId, out var reserved) && reserved.CarriedBy == 0)
                    reserved.ReservedForJob = false;
                citizen.ReservedItemId = 0;
                JobWork.AbandonJob(sim, citizen);
                return;
            }

            ItemStack item = null;
            if (citizen.ReservedItemId != 0)
                sim.Items.TryGet(citizen.ReservedItemId, out item);
            if (item == null || item.CarriedBy != 0 || item.Pos != citizen.JobTarget)
            {
                citizen.ReservedItemId = 0;
                JobWork.AbandonJob(sim, citizen); // item gone (nothing left to unreserve)
                return;
            }

            // Pick the destination before touching carry state, so a failure leaves the world
            // exactly as it was (minus the released reservation).
            if (!TryPathToFreeStockpile(sim, citizen, ctx, out var dest))
            {
                item.ReservedForJob = false;
                citizen.ReservedItemId = 0;
                JobWork.AbandonJob(sim, citizen);
                return;
            }

            item.CarriedBy = citizen.Id;
            citizen.CarryingItemId = item.Id;
            citizen.ReservedItemId = 0; // reservation graduated to carry
            citizen.JobKind = JobKind.HaulDeliver;
            citizen.JobTarget = dest;
        }

        private static void ProgressDeliver(Simulation sim, Citizen citizen)
        {
            if (!sim.Items.TryGet(citizen.CarryingItemId, out var item) ||
                item.CarriedBy != citizen.Id)
            {
                citizen.CarryingItemId = 0; // item vanished — nothing to deliver
                JobWork.AbandonJob(sim, citizen);
                return;
            }

            item.Pos = citizen.Pos; // carried items ride along every tick

            if (citizen.HasPath) return;

            // Arrived (Pos == JobTarget), or the path was lost — either way set the stack down
            // where we stand. A drop outside the stockpile re-enters the haul pool on the rescan
            // triggered below.
            item.CarriedBy = 0;
            item.ReservedForJob = false;
            citizen.CarryingItemId = 0;
            citizen.JobKind = JobKind.None;
            sim.JobsDirty |= JobBoardDirty.Items; // the stack was set down (position/unreserve changed)
        }

        /// <summary>
        /// Nearest free stockpile tile (Manhattan; ties: z,y,x scan order) that is actually
        /// reachable. Occupancy is recomputed from ground items on demand — the board may be
        /// several ticks old by the time a hauler arrives at his stack.
        /// </summary>
        private bool TryPathToFreeStockpile(Simulation sim, Citizen citizen, JobContext ctx, out Int3 dest)
        {
            dest = default;

            JobWork.RebuildGroundItemTiles(sim, _groundItemTiles);

            long gen = ctx.NextGen();
            while (true)
            {
                int best = -1, bestDist = int.MaxValue;
                for (int i = 0; i < _stockpiles.Count; i++)
                {
                    if (_stockTried[i] == gen) continue;
                    if (!JobWork.IsFreeStockpileTile(sim, _stockpiles[i], _groundItemTiles))
                    {
                        _stockTried[i] = gen;
                        continue;
                    }
                    int d = Int3.Manhattan(citizen.Pos, _stockpiles[i]);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        best = i;
                    }
                }
                if (best < 0) return false;

                var tile = _stockpiles[best];
                if (sim.Paths.FindPath(sim, citizen.Pos, tile, citizen.Path))
                {
                    citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                    dest = tile;
                    return true;
                }
                _stockTried[best] = gen;
            }
        }
    }
}
