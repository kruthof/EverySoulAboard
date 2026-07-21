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

        // --- Build board (M1, WS-MATTER). BuildSystem is an optional stack member: this
        // system is resolved lazily from sim.Systems once, and when absent the whole build
        // path is inert (the pre-M1 board — so a build-free / BuildSystem-free stack hashes
        // and behaves identically). Sites split into "needs material" and "ready to build";
        // both store the SITE as JobTarget so reservations derive from citizen state like
        // dig. Material is always Regolith. ---
        private BuildSystem _build;
        private bool _buildResolved;
        private readonly List<Int3> _buildReady = new List<Int3>(32);   // Delivered >= Required
        private readonly List<Int3> _buildNeedMat = new List<Int3>(32); // Delivered < Required
        private readonly HashSet<Int3> _assignedBuilds = new HashSet<Int3>(); // lookup only
        private bool _anyFreeMaterial;
        private long[] _buildReadyTried = new long[16];
        private long[] _buildMatTried = new long[16];
        private readonly Dictionary<Int3, long> _buildReadyRetryAt = new Dictionary<Int3, long>();
        private readonly Dictionary<Int3, long> _buildMatRetryAt = new Dictionary<Int3, long>();

        public void Tick(Simulation sim)
        {
            // Resolve the optional BuildSystem once (stack member; absent in save/test
            // stacks that don't register it — the build path then stays inert).
            if (!_buildResolved) { _build = FindBuildSystem(sim); _buildResolved = true; }

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
                    case JobKind.HaulToBuild:
                        ProgressBuildHaul(sim, citizen);
                        break;
                    case JobKind.Build:
                        ProgressBuild(sim, citizen);
                        break;
                }
            }
        }

        private static BuildSystem FindBuildSystem(Simulation sim)
        {
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is BuildSystem b) return b;
            return null;
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
            // The same pass rebuilds build-site reservations: a citizen hauling to or
            // building a site stores that SITE as JobTarget, so one linear pass covers both.
            _assignedDigs.Clear();
            _assignedBuilds.Clear();
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;
                if (c.JobKind == JobKind.Dig) _assignedDigs.Add(c.JobTarget);
                else if (c.JobKind == JobKind.HaulToBuild || c.JobKind == JobKind.Build)
                    _assignedBuilds.Add(c.JobTarget);
            }

            // Build board (M1): split pending sites into needs-material vs ready-to-build.
            // When no BuildSystem is registered the lists stay empty (inert build path).
            _buildReady.Clear();
            _buildNeedMat.Clear();
            _anyFreeMaterial = false;
            if (_build != null)
            {
                var pend = _build.Pending;
                for (int i = 0; i < pend.Count; i++)
                {
                    if (BuildSystem.IsReady(pend[i])) _buildReady.Add(pend[i].Pos);
                    else _buildNeedMat.Add(pend[i].Pos);
                }
                // Only pay for the material scan when a site actually wants some.
                if (_buildNeedMat.Count > 0)
                {
                    for (int i = 0; i < items.Count; i++)
                    {
                        var it = items[i];
                        if (it.Kind == BuildSystem.Material && it.CarriedBy == 0 && !it.ReservedForJob)
                        { _anyFreeMaterial = true; break; }
                    }
                }
            }

            EnsureSize(ref _digTried, _digSites.Count);
            EnsureSize(ref _haulTried, _haulItems.Count);
            EnsureSize(ref _stockTried, _stockpiles.Count);
            EnsureSize(ref _buildReadyTried, _buildReady.Count);
            EnsureSize(ref _buildMatTried, _buildNeedMat.Count);
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
            if (_digSites.Count == 0 && _haulItems.Count == 0 &&
                _buildReady.Count == 0 && _buildNeedMat.Count == 0) return;
            _gen++;

            while (true)
            {
                int bestDig = -1, bestHaul = -1, bestBReady = -1, bestBMat = -1;
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
                        bestHaul = -1; bestBReady = -1; bestBMat = -1;
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
                        bestHaul = i;
                        bestDig = -1; bestBReady = -1; bestBMat = -1;
                    }
                }

                // Ready-to-build sites (materialed): distance to the site itself.
                for (int i = 0; i < _buildReady.Count; i++)
                {
                    if (_buildReadyTried[i] == _gen) continue;
                    var p = _buildReady[i];
                    if (_buildReadyRetryAt.TryGetValue(p, out long r) && sim.TickCount < r)
                    {
                        _buildReadyTried[i] = _gen;
                        continue;
                    }
                    if (_assignedBuilds.Contains(p) || _build == null ||
                        !_build.TryGet(p, out var b) || !BuildSystem.IsReady(b))
                    {
                        _buildReadyTried[i] = _gen;
                        continue;
                    }
                    int d = Int3.Manhattan(citizen.Pos, p);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        bestBReady = i;
                        bestDig = -1; bestHaul = -1; bestBMat = -1;
                    }
                }

                // Sites still wanting material: only worth pursuing if free material exists.
                // Priority proxy is distance to the site (the hauler routes via the material
                // first, but the site is the stable destination — mirrors dig/haul using the
                // target distance).
                if (_anyFreeMaterial)
                {
                    for (int i = 0; i < _buildNeedMat.Count; i++)
                    {
                        if (_buildMatTried[i] == _gen) continue;
                        var p = _buildNeedMat[i];
                        if (_buildMatRetryAt.TryGetValue(p, out long r) && sim.TickCount < r)
                        {
                            _buildMatTried[i] = _gen;
                            continue;
                        }
                        if (_assignedBuilds.Contains(p) || _build == null ||
                            !_build.TryGet(p, out var b) || !BuildSystem.NeedsMaterial(b))
                        {
                            _buildMatTried[i] = _gen;
                            continue;
                        }
                        int d = Int3.Manhattan(citizen.Pos, p);
                        if (d < bestDist)
                        {
                            bestDist = d;
                            bestBMat = i;
                            bestDig = -1; bestHaul = -1; bestBReady = -1;
                        }
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
                else if (bestBReady >= 0)
                {
                    var target = _buildReady[bestBReady];
                    if (TryPathToAdjacent(sim, citizen, target) &&
                        _build.TryGet(target, out var b))
                    {
                        citizen.JobKind = JobKind.Build;
                        citizen.JobTarget = target;
                        citizen.JobWorkTicks = b.WorkTicks;
                        _assignedBuilds.Add(target);
                        _buildReadyRetryAt.Remove(target);
                        return;
                    }
                    _buildReadyTried[bestBReady] = _gen; // unreachable — try next-nearest
                    _buildReadyRetryAt[target] = sim.TickCount + UnreachableRetryTicks;
                }
                else if (bestBMat >= 0)
                {
                    var site = _buildNeedMat[bestBMat];
                    if (TryReserveMaterialFor(sim, citizen, site))
                    {
                        _assignedBuilds.Add(site);   // one hauler per site at a time
                        _buildMatRetryAt.Remove(site);
                        return;
                    }
                    _buildMatTried[bestBMat] = _gen; // no reachable material — try next-nearest
                    _buildMatRetryAt[site] = sim.TickCount + UnreachableRetryTicks;
                }
                else
                {
                    citizen.ClearPath(); // normalize after any failed FindPath attempts
                    return;
                }
            }
        }

        /// <summary>
        /// Reserve the nearest reachable free Regolith stack for a build site and start the
        /// citizen toward it as a <see cref="JobKind.HaulToBuild"/> job. The SITE is stored
        /// as JobTarget from the outset (so the reservation derives from citizen state); the
        /// reserved stack is remembered via <see cref="Citizen.ReservedItemId"/> and the
        /// citizen paths to it first, then to the site (chosen in ProgressBuildHaul). Returns
        /// false when no reachable material exists (the caller backs the site off).
        /// </summary>
        private bool TryReserveMaterialFor(Simulation sim, Citizen citizen, Int3 site)
        {
            var items = sim.Items.Items;
            // Uses its own _matScanTried stamp set (not the outer _gen) so the enclosing
            // TryAssign scan's tried-stamps stay valid across this nested material search.

            while (true)
            {
                int best = -1, bestDist = int.MaxValue;
                for (int i = 0; i < items.Count; i++)
                {
                    var it = items[i];
                    if (it.Kind != BuildSystem.Material || it.CarriedBy != 0 || it.ReservedForJob) continue;
                    int d = Int3.Manhattan(citizen.Pos, it.Pos);
                    if (d < bestDist && !_matScanTried.Contains(it.Id))
                    {
                        bestDist = d;
                        best = i;
                    }
                }
                if (best < 0) { _matScanTried.Clear(); return false; }

                var item = items[best];
                if (sim.Paths.FindPath(sim, citizen.Pos, item.Pos, citizen.Path))
                {
                    citizen.StartPath(sim.Defs.Citizen.TicksPerTile);
                    citizen.JobKind = JobKind.HaulToBuild;
                    citizen.JobTarget = site;          // stable destination (reservation source)
                    citizen.CarryingItemId = 0;        // still en route to the material
                    citizen.ReservedItemId = item.Id;
                    item.ReservedForJob = true;
                    _matScanTried.Clear();
                    return true;
                }
                _matScanTried.Add(item.Id); // unreachable material — try the next-nearest stack
            }
        }

        private readonly HashSet<uint> _matScanTried = new HashSet<uint>();

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

        // ------------------------------------------------------------- build (M1)

        /// <summary>
        /// Drive a <see cref="JobKind.HaulToBuild"/> job. Two hops on one JobTarget (always
        /// the SITE): phase A carries nothing and travels to the reserved material stack;
        /// phase B carries that stack to the site and deposits it. Any lost site / material
        /// releases cleanly (reservation dropped, cargo set down where it stands) and the
        /// rescan retries — mirroring the pickup/deliver reservation discipline exactly.
        /// </summary>
        private void ProgressBuildHaul(Simulation sim, Citizen citizen)
        {
            Int3 site = citizen.JobTarget;

            // Site gone (cancelled) or already satisfied? Release and abandon.
            if (_build == null || !_build.TryGet(site, out var b) || BuildSystem.IsReady(b))
            {
                DropOrReleaseBuildCargo(sim, citizen);
                AbandonJob(sim, citizen);
                return;
            }

            if (citizen.CarryingItemId == 0)
            {
                // Phase A: en route to the reserved material stack.
                if (citizen.HasPath) return;

                ItemStack mat = null;
                if (citizen.ReservedItemId != 0) sim.Items.TryGet(citizen.ReservedItemId, out mat);
                if (mat == null || mat.CarriedBy != 0 || mat.Pos != citizen.Pos)
                {
                    // Never arrived at the material (path lost) or it vanished — release it.
                    if (mat != null && mat.CarriedBy == 0) mat.ReservedForJob = false;
                    citizen.ReservedItemId = 0;
                    AbandonJob(sim, citizen);
                    return;
                }

                // Pick the site approach before committing carry state, so a failure
                // leaves the world as it was (minus the released reservation).
                if (!TryPathToAdjacent(sim, citizen, site))
                {
                    mat.ReservedForJob = false;
                    citizen.ReservedItemId = 0;
                    AbandonJob(sim, citizen);
                    return;
                }

                mat.CarriedBy = citizen.Id;
                citizen.CarryingItemId = mat.Id;
                citizen.ReservedItemId = 0; // reservation graduated to carry
                return;
            }

            // Phase B: carrying the material to the site.
            if (!sim.Items.TryGet(citizen.CarryingItemId, out var carried) ||
                carried.CarriedBy != citizen.Id)
            {
                citizen.CarryingItemId = 0; // cargo vanished
                AbandonJob(sim, citizen);
                return;
            }

            carried.Pos = citizen.Pos; // rides along every tick

            if (citizen.HasPath) return;

            if (!Int3.IsAdjacent4(citizen.Pos, site))
            {
                // Path lost before reaching the site — drop the stack where we stand.
                carried.CarriedBy = 0;
                carried.ReservedForJob = false;
                citizen.CarryingItemId = 0;
                AbandonJob(sim, citizen);
                return;
            }

            // Deposit what the site can take; any surplus stays as a loose stack here.
            int consumed = _build.Deposit(sim, site, carried.Count);
            carried.Count -= consumed;
            if (carried.Count <= 0)
            {
                sim.Items.Remove(carried.Id); // fully consumed into the build
            }
            else
            {
                carried.CarriedBy = 0;
                carried.ReservedForJob = false;
                carried.Pos = citizen.Pos;    // leftover drops at the site, re-enters the pool
            }
            citizen.CarryingItemId = 0;
            citizen.JobKind = JobKind.None;
            sim.JobsDirty = true;
        }

        /// <summary>
        /// Drive a <see cref="JobKind.Build"/> job (mirrors <see cref="ProgressDig"/>): the
        /// site must still be pending and materialed; on the final work tick the build
        /// completes through <see cref="BuildSystem.Complete"/> (wall seal + reflood, or door
        /// spawn) which publishes <see cref="ConstructionCompletedEvent"/> exactly once.
        /// </summary>
        private void ProgressBuild(Simulation sim, Citizen citizen)
        {
            Int3 target = citizen.JobTarget;

            if (_build == null || !_build.TryGet(target, out var b) || !BuildSystem.IsReady(b))
            {
                AbandonJob(sim, citizen); // cancelled or material was refunded out from under us
                return;
            }

            if (citizen.HasPath) return; // still traveling

            if (!Int3.IsAdjacent4(citizen.Pos, target))
            {
                AbandonJob(sim, citizen); // path lost — rescan retries
                return;
            }

            if (--citizen.JobWorkTicks > 0) return;

            _build.Complete(sim, target, citizen.Id); // world write + event + JobsDirty
            citizen.JobKind = JobKind.None;
            citizen.JobWorkTicks = 0;
            sim.JobsDirty = true;
        }

        /// <summary>Release whatever a build-haul citizen holds when its site disappears:
        /// a reserved-but-not-picked stack is unreserved; carried cargo is set down.</summary>
        private static void DropOrReleaseBuildCargo(Simulation sim, Citizen citizen)
        {
            if (citizen.CarryingItemId != 0)
            {
                if (sim.Items.TryGet(citizen.CarryingItemId, out var carried) && carried.CarriedBy == citizen.Id)
                {
                    carried.Pos = citizen.Pos;
                    carried.CarriedBy = 0;
                    carried.ReservedForJob = false;
                }
                citizen.CarryingItemId = 0;
            }
            else if (citizen.ReservedItemId != 0)
            {
                if (sim.Items.TryGet(citizen.ReservedItemId, out var reserved) && reserved.CarriedBy == 0)
                    reserved.ReservedForJob = false;
                citizen.ReservedItemId = 0;
            }
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
