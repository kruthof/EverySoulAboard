using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// M2 labor: dig designations and hauling loose items to stockpile zones.
    /// Registered after <see cref="CitizenSystem"/> — movement already happened this
    /// tick; this system assigns jobs to idle citizens, sets their paths, progresses
    /// work at the job site and keeps carried items glued to their carrier.
    ///
    /// The job board (dig sites, haul candidates, stockpile tiles) is purely derived
    /// state: rebuilt from the world + entity stores whenever
    /// <see cref="Simulation.JobsDirty"/> is set, never serialized. Per-citizen job
    /// progress lives on the citizen itself (JobKind/JobTarget/JobWorkTicks/
    /// CarryingItemId), so saves need nothing from this class.
    ///
    /// Determinism: world scans in z,y,x order, citizens/items iterated in store
    /// order, HashSets used for O(1) lookups only (never iterated), no RNG, no LINQ.
    /// Steady state (no designations, no haulable items) does not allocate.
    /// </summary>
    public sealed class JobSystem : ISimSystem
    {
        public string Name => "Jobs";
        public int IntervalTicks => 1;

        /// <summary>Work ticks to dig one rock tile (6 s at 10 Hz).</summary>
        public const int DigWorkTicks = 60;

        // --- Derived board (rebuilt on JobsDirty; collections reused) ---
        private readonly List<Int3> _digSites = new List<Int3>(64);      // z,y,x scan order
        private readonly List<uint> _haulItems = new List<uint>(64);     // item store order
        private readonly List<Int3> _stockpiles = new List<Int3>(64);    // z,y,x scan order
        private readonly HashSet<Int3> _assignedDigs = new HashSet<Int3>();    // lookup only, never iterated
        private readonly HashSet<Int3> _groundItemTiles = new HashSet<Int3>(); // lookup only, never iterated

        // "Tried and failed during the current selection pass" stamps, one slot per
        // board entry. Generation counters instead of clearing between passes.
        private long[] _digTried = new long[64];
        private long[] _haulTried = new long[64];
        private long[] _stockTried = new long[64];
        private long _gen;

        // Unreachable-candidate backoff: a failed FindPath is a whole-region sweep,
        // so don't re-attempt the same target every tick (lookup-only dictionaries).
        private const int UnreachableRetryTicks = 50; // 5 s
        private readonly Dictionary<Int3, long> _digRetryAt = new Dictionary<Int3, long>();
        private readonly Dictionary<uint, long> _haulRetryAt = new Dictionary<uint, long>();

        public void Tick(Simulation sim)
        {
            // Terrain edits (SetTileCommand, MOSS effects, …) publish TileChangedEvent
            // but don't all set JobsDirty themselves — treat any tile change from the
            // previous tick as board-dirtying. Cheap, and keeps the board honest.
            if (sim.Events.Read<TileChangedEvent>().Length > 0) sim.JobsDirty = true;
            if (sim.JobsDirty) Rescan(sim);

            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                switch (citizen.JobKind)
                {
                    case JobKind.None:
                        if (citizen.IsIdleForWork) TryAssign(sim, citizen); // held citizens never self-assign
                        break;
                    case JobKind.Dig:
                        ProgressDig(sim, citizen);
                        break;
                    case JobKind.HaulPickup:
                        ProgressPickup(sim, citizen);
                        break;
                    case JobKind.HaulDeliver:
                        ProgressDeliver(sim, citizen);
                        break;
                }
            }
        }

        // ------------------------------------------------------------------ board

        private void Rescan(Simulation sim)
        {
            sim.JobsDirty = false;
            _digSites.Clear();
            _stockpiles.Clear();
            _haulItems.Clear();

            // Tiles, deterministic z,y,x order.
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                for (int y = 0; y < world.Height; y++)
                {
                    int row = y * world.Width;
                    for (int x = 0; x < world.Width; x++)
                    {
                        byte flags = level.Flags[row + x];
                        if ((flags & (byte)TileFlags.Designated) != 0 &&
                            level.Wall[row + x] == TileDefs.Debris)
                            _digSites.Add(new Int3(x, y, z));
                        if ((flags & (byte)TileFlags.Stockpile) != 0)
                            _stockpiles.Add(new Int3(x, y, z));
                    }
                }
            }

            // Ground-item occupancy (per-scan; Contains-lookups only).
            _groundItemTiles.Clear();
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.CarriedBy == 0) _groundItemTiles.Add(item.Pos);
            }

            // Haul candidates only exist while at least one stockpile tile is free.
            bool anyFreeStockpile = false;
            for (int i = 0; i < _stockpiles.Count; i++)
            {
                if (IsFreeStockpileTile(sim, _stockpiles[i]))
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
                    if (item.Kind == ItemKind.Corpse) continue; // the dead are not cargo (funerals: M3+)
                    // Items already inside a stockpile zone count as stored —
                    // otherwise every delivery immediately re-dirties into a re-haul.
                    if ((sim.World.GetFlags(item.Pos) & TileFlags.Stockpile) != 0) continue;
                    _haulItems.Add(item.Id);
                }
            }

            // Dig sites already being worked, rebuilt from citizen state (store order).
            _assignedDigs.Clear();
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (!c.Dead && c.JobKind == JobKind.Dig) _assignedDigs.Add(c.JobTarget);
            }

            EnsureSize(ref _digTried, _digSites.Count);
            EnsureSize(ref _haulTried, _haulItems.Count);
            EnsureSize(ref _stockTried, _stockpiles.Count);
        }

        private bool IsFreeStockpileTile(Simulation sim, Int3 p)
        {
            var flags = sim.World.GetFlags(p);
            return (flags & TileFlags.Stockpile) != 0 &&
                   (flags & TileFlags.Walkable) != 0 &&
                   !_groundItemTiles.Contains(p);
        }

        // ------------------------------------------------------------- assignment

        /// <summary>
        /// Pick the nearest available job by Manhattan distance (ties: dig sites
        /// before haul items, then board scan order) and try to path to it. Candidates
        /// that fail validation or pathing are stamped and the next-nearest is tried,
        /// so the loop always terminates. Unreachable candidates stay on the board and
        /// are simply retried on later ticks — a terrain change can make them viable.
        /// </summary>
        private void TryAssign(Simulation sim, Citizen citizen)
        {
            if (_digSites.Count == 0 && _haulItems.Count == 0) return;
            _gen++;

            while (true)
            {
                int bestDig = -1, bestHaul = -1;
                int bestDist = int.MaxValue;

                for (int i = 0; i < _digSites.Count; i++)
                {
                    if (_digTried[i] == _gen) continue;
                    var p = _digSites[i];
                    if (_digRetryAt.TryGetValue(p, out long digRetry) && sim.TickCount < digRetry)
                    {
                        _digTried[i] = _gen; // backing off after a failed path attempt
                        continue;
                    }
                    if (_assignedDigs.Contains(p) ||
                        (sim.World.GetFlags(p) & TileFlags.Designated) == 0 ||
                        sim.World.GetWall(p) != TileDefs.Debris)
                    {
                        _digTried[i] = _gen; // no longer a valid job — skip for this pass
                        continue;
                    }
                    int d = Int3.Manhattan(citizen.Pos, p);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        bestDig = i;
                        bestHaul = -1;
                    }
                }

                for (int i = 0; i < _haulItems.Count; i++)
                {
                    if (_haulTried[i] == _gen) continue;
                    if (_haulRetryAt.TryGetValue(_haulItems[i], out long haulRetry) && sim.TickCount < haulRetry)
                    {
                        _haulTried[i] = _gen;
                        continue;
                    }
                    if (!sim.Items.TryGet(_haulItems[i], out var item) ||
                        item.CarriedBy != 0 || item.ReservedForJob)
                    {
                        _haulTried[i] = _gen;
                        continue;
                    }
                    int d = Int3.Manhattan(citizen.Pos, item.Pos);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        bestDig = -1;
                        bestHaul = i;
                    }
                }

                if (bestDig >= 0)
                {
                    var target = _digSites[bestDig];
                    if (TryPathToAdjacent(sim, citizen, target))
                    {
                        citizen.JobKind = JobKind.Dig;
                        citizen.JobTarget = target;
                        citizen.JobWorkTicks = DigWorkTicks;
                        _assignedDigs.Add(target);
                        _digRetryAt.Remove(target);
                        return;
                    }
                    _digTried[bestDig] = _gen; // unreachable from here — try next-nearest
                    _digRetryAt[target] = sim.TickCount + UnreachableRetryTicks;
                }
                else if (bestHaul >= 0)
                {
                    if (sim.Items.TryGet(_haulItems[bestHaul], out var item) &&
                        sim.Paths.FindPath(sim, citizen.Pos, item.Pos, citizen.Path))
                    {
                        citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                        citizen.JobKind = JobKind.HaulPickup;
                        citizen.JobTarget = item.Pos;
                        item.ReservedForJob = true;
                        citizen.ReservedItemId = item.Id;
                        _haulRetryAt.Remove(item.Id);
                        return;
                    }
                    _haulTried[bestHaul] = _gen;
                    _haulRetryAt[_haulItems[bestHaul]] = sim.TickCount + UnreachableRetryTicks;
                }
                else
                {
                    citizen.ClearPath(); // normalize after any failed FindPath attempts
                    return;
                }
            }
        }

        /// <summary>Path to a walkable 4-neighbor of the dig tile, tried in +x,-x,+y,-y order.</summary>
        private bool TryPathToAdjacent(Simulation sim, Citizen citizen, Int3 target)
        {
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(target, i);
                if (!sim.World.InBounds(n)) continue;
                if (!sim.IsWalkable(n)) continue; // door-aware: shared rule with pathing
                if (sim.Paths.FindPath(sim, citizen.Pos, n, citizen.Path))
                {
                    citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                    return true;
                }
            }
            return false;
        }

        // --------------------------------------------------------------- progress

        private void ProgressDig(Simulation sim, Citizen citizen)
        {
            var target = citizen.JobTarget;

            // Designation revoked or tile already dug out from under us — drop the job.
            if ((sim.World.GetFlags(target) & TileFlags.Designated) == 0 ||
                sim.World.GetWall(target) != TileDefs.Debris)
            {
                AbandonJob(sim, citizen);
                return;
            }

            if (citizen.HasPath) return; // still traveling (CitizenSystem moves us)

            if (!Int3.IsAdjacent4(citizen.Pos, target))
            {
                AbandonJob(sim, citizen); // path was cleared/blocked — rescan retries
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
            sim.JobsDirty = true;
        }

        private void ProgressPickup(Simulation sim, Citizen citizen)
        {
            if (citizen.HasPath) return; // en route to the item

            if (citizen.Pos != citizen.JobTarget)
            {
                // Path was cleared/blocked before arrival — release the reservation.
                if (citizen.ReservedItemId != 0 &&
                    sim.Items.TryGet(citizen.ReservedItemId, out var reserved) && reserved.CarriedBy == 0)
                    reserved.ReservedForJob = false;
                citizen.ReservedItemId = 0;
                AbandonJob(sim, citizen);
                return;
            }

            ItemStack item = null;
            if (citizen.ReservedItemId != 0)
                sim.Items.TryGet(citizen.ReservedItemId, out item);
            if (item == null || item.CarriedBy != 0 || item.Pos != citizen.JobTarget)
            {
                citizen.ReservedItemId = 0;
                AbandonJob(sim, citizen); // item gone (nothing left to unreserve)
                return;
            }

            // Pick the destination before touching carry state, so a failure leaves
            // the world exactly as it was (minus the released reservation).
            if (!TryPathToFreeStockpile(sim, citizen, out var dest))
            {
                item.ReservedForJob = false;
                citizen.ReservedItemId = 0;
                AbandonJob(sim, citizen);
                return;
            }

            item.CarriedBy = citizen.Id;
            citizen.CarryingItemId = item.Id;
            citizen.ReservedItemId = 0; // reservation graduated to carry
            citizen.JobKind = JobKind.HaulDeliver;
            citizen.JobTarget = dest;
        }

        private void ProgressDeliver(Simulation sim, Citizen citizen)
        {
            if (!sim.Items.TryGet(citizen.CarryingItemId, out var item) ||
                item.CarriedBy != citizen.Id)
            {
                citizen.CarryingItemId = 0; // item vanished — nothing to deliver
                AbandonJob(sim, citizen);
                return;
            }

            item.Pos = citizen.Pos; // carried items ride along every tick

            if (citizen.HasPath) return;

            // Arrived (Pos == JobTarget), or the path was lost — either way set the
            // stack down where we stand. A drop outside the stockpile re-enters the
            // haul pool on the rescan triggered below.
            item.CarriedBy = 0;
            item.ReservedForJob = false;
            citizen.CarryingItemId = 0;
            citizen.JobKind = JobKind.None;
            sim.JobsDirty = true;
        }

        /// <summary>
        /// Nearest free stockpile tile (Manhattan; ties: z,y,x scan order) that is
        /// actually reachable. Occupancy is recomputed from ground items on demand.
        /// </summary>
        private bool TryPathToFreeStockpile(Simulation sim, Citizen citizen, out Int3 dest)
        {
            dest = default;

            _groundItemTiles.Clear();
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                if (items[i].CarriedBy == 0) _groundItemTiles.Add(items[i].Pos);
            }

            _gen++;
            while (true)
            {
                int best = -1, bestDist = int.MaxValue;
                for (int i = 0; i < _stockpiles.Count; i++)
                {
                    if (_stockTried[i] == _gen) continue;
                    if (!IsFreeStockpileTile(sim, _stockpiles[i]))
                    {
                        _stockTried[i] = _gen;
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
                _stockTried[best] = _gen;
            }
        }

        // ------------------------------------------------------------------ misc


        private static void AbandonJob(Simulation sim, Citizen citizen)
        {
            citizen.JobKind = JobKind.None;
            citizen.JobWorkTicks = 0;
            citizen.ClearPath();
            sim.JobsDirty = true; // rescan re-derives the board and retries
        }

        private static ItemStack FindReservedGroundItemAt(Simulation sim, Int3 pos)
        {
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.CarriedBy == 0 && item.ReservedForJob && item.Pos == pos) return item;
            }
            return null;
        }



        private static void EnsureSize(ref long[] array, int needed)
        {
            if (array.Length >= needed) return;
            int size = array.Length * 2;
            if (size < needed) size = needed;
            array = new long[size]; // fresh zeros can never equal the current _gen (>= 1)
        }
    }
}
