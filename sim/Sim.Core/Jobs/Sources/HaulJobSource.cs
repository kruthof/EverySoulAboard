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

        // E0-4: the optional per-tile stockpile-filter registry, resolved once (the
        // DeconstructJobSource lazy-resolve precedent — a job source owns its own dependency rather
        // than leaning on Simulation's convenience accessor). null on a stack without one, in which
        // case every tile is accept-all and the candidate gate below is byte-for-byte its pre-E0-4
        // self.
        private StockZoneSystem _stockZones;
        private bool _stockZonesResolved;

        // E0-4 WP-4 — the "don't haul what a bench wants" rule. B(sim): every ItemKind that appears
        // as an INPUT port of a device's resolved ProductionBill (the EXACT bill resolution
        // CraftingSystem fetches against, so this can never drift from what a bench actually pulls).
        // Bit k set ⇒ kind k is a bench input ⇒ ineligible for general haul, so it is never dragged
        // to a stockpile out from under the crafting chain (closing the output-strand / haul-in↔
        // fetch-out oscillation, lane plan §2.6). Recomputed once per Rescan(Items|Tiles), and ONLY
        // inside the anyFreeStockpile branch — never even computed on a stockpile-free ship, so it is
        // zero-cost and fully inert on every pinned ship. A ulong field (kinds 0–63), no allocation.
        private ulong _benchWanted;

        public string Name => "Haul";
        public JobKind[] HandledKinds => Kinds;
        public int CandidateCount => _items.Count;

        /// <summary>The bench-input mask B(sim) most recently folded (E0-4 WP-4): bit k ⇒ kind k is
        /// an input port of some device's resolved <see cref="ProductionBill"/> and therefore
        /// ineligible for general haul. Diagnostic surface (mirrors <see cref="CandidateCount"/>) so a
        /// test can assert the bench-rule branch was actually REACHED before scoring its outcome
        /// (lane plan §7 trap 5 — a zero-alloc / never-hauled assertion over an unreached branch is a
        /// tautology). Zero on a stockpile-free tick because the branch that computes it never runs.</summary>
        public ulong BenchWantedMask => _benchWanted;

        /// <summary>Resolve the optional <see cref="StockZoneSystem"/> once, before any progress or
        /// rescan pass reads a filter (the <see cref="DeconstructJobSource"/> pattern).</summary>
        public void BeginTick(Simulation sim)
        {
            if (_stockZonesResolved) return;
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is StockZoneSystem z) { _stockZones = z; break; }
            _stockZonesResolved = true;
        }

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
                    // E0-4 WP-4: fold B(sim) — the set of kinds any device's resolved bill CONSUMES —
                    // once, here, before the candidate loop. Only computed inside this branch, so a
                    // stockpile-free ship never pays for it and the pinned-ship path is byte-identical.
                    _benchWanted = ComputeBenchWanted(sim);

                    // E0-4: a filter can refuse a kind, so the "some free stockpile exists" gate
                    // above (kind-less) is no longer sufficient per item. When any filter is live,
                    // an item is a candidate only if SOME free stockpile tile accepts ITS kind —
                    // otherwise it has nowhere to go and would be picked up only to be dropped again.
                    // With no registry, or no filter set, this fast-path is skipped and every item
                    // that passed the guards below boards exactly as it did pre-E0-4 (the byte-for-byte
                    // inert path on any pinned, filter-free ship).
                    bool filtered = _stockZones != null && _stockZones.Zones.Count > 0;
                    for (int i = 0; i < items.Count; i++)
                    {
                        var item = items[i];
                        if (item.CarriedBy != 0 || item.ReservedBy != 0) continue;
                        if (item.Kind == ItemKind.Corpse) continue; // the dead are not cargo
                        if ((sim.World.GetFlags(item.Pos) & TileFlags.Stockpile) != 0) continue; // already stored
                        // WP-4 (precedence step 2, lane plan §2.4): a bench-wanted kind never enters
                        // the haulable pool — it is ceded to CraftingSystem.StepFetch entirely, so the
                        // haul board stops competing for intermediates and the round-trip that stranded
                        // outputs on the wrong deck cannot form. This OVERRIDES the filter below: a tile
                        // whose mask accepts Scrap still receives no Scrap while a Fabricator exists,
                        // because Scrap never becomes a candidate here.
                        if ((_benchWanted & (1UL << (int)item.Kind)) != 0) continue;
                        if (filtered && !AnyFreeStockpileAccepts(sim, item.Kind)) continue; // no zone takes this kind
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
                    item.CarriedBy != 0 || item.ReservedBy != 0)
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
                ctx.ReserveGroundItem(sim, citizen, item);
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
                    sim.Items.TryGet(citizen.ReservedItemId, out var reserved) &&
                    reserved.CarriedBy == 0 && reserved.ReservedBy == citizen.Id)
                    reserved.ReservedBy = 0;
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
            // exactly as it was (minus the released reservation). The carried kind decides which
            // filtered tiles will take it (E0-4).
            if (!TryPathToFreeStockpile(sim, citizen, ctx, item.Kind, out var dest))
            {
                if (item.ReservedBy == citizen.Id) item.ReservedBy = 0;
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
            item.ReservedBy = 0; // carried by us — our claim to clear
            citizen.CarryingItemId = 0;
            citizen.JobKind = JobKind.None;
            sim.JobsDirty |= JobBoardDirty.Items; // the stack was set down (position/unreserve changed)
        }

        /// <summary>
        /// Fold B(sim) — WP-4's bench-wanted mask (lane plan §2.4). For every device in
        /// <see cref="Simulation.Devices"/> STORE ORDER whose kind resolves a
        /// <see cref="ProductionBill"/>, OR in the bit of each of the bill's INPUT ports. Reuses the
        /// exact <see cref="ProductionDefs.TryGetBill"/> + <see cref="ProductionBill.InputPortCount"/>
        /// / <see cref="ProductionBill.Input"/> resolution <see cref="CraftingSystem"/> fetches
        /// against, so "what a bench wants" can never drift from what a bench actually pulls. Recomputed
        /// every rescan, so removing a bench (e.g. the E0-5 device strip) drops its inputs back out of
        /// the mask on the next Items/Tiles rescan — the mask self-heals (lane plan §8 hazard 5). No
        /// RNG, no allocation: <see cref="ProductionBill"/> is a struct over arrays that already exist.
        /// </summary>
        private static ulong ComputeBenchWanted(Simulation sim)
        {
            ulong mask = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                if (!ProductionDefs.TryGetBill(sim.Defs, devices[i].Kind, out var bill)) continue;
                for (int p = 0; p < bill.InputPortCount; p++)
                    mask |= 1UL << (int)bill.Input(p).Kind;
            }
            return mask;
        }

        /// <summary>Does any free stockpile tile accept <paramref name="kind"/>? The per-item
        /// candidate gate (E0-4): reuses the current tile board and the freshly rebuilt ground-item
        /// occupancy, alloc-free, integer mask ops only.</summary>
        private bool AnyFreeStockpileAccepts(Simulation sim, ItemKind kind)
        {
            for (int i = 0; i < _stockpiles.Count; i++)
                if (JobWork.IsFreeStockpileTile(sim, _stockpiles[i], _groundItemTiles, kind))
                    return true;
            return false;
        }

        /// <summary>
        /// Nearest free stockpile tile (Manhattan; ties: z,y,x scan order) that is actually
        /// reachable AND accepts <paramref name="kind"/> under its filter (E0-4). Occupancy is
        /// recomputed from ground items on demand — the board may be several ticks old by the time
        /// a hauler arrives at his stack.
        /// </summary>
        private bool TryPathToFreeStockpile(Simulation sim, Citizen citizen, JobContext ctx, ItemKind kind, out Int3 dest)
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
                    if (!JobWork.IsFreeStockpileTile(sim, _stockpiles[i], _groundItemTiles, kind))
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
