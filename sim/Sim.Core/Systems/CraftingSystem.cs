using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// M3 crafting v0 (GDD §4.7): standing bills, no UI. Every powered workstation
    /// (SalvageRecycler / Fabricator / MachineShop) wants to run its recipe whenever
    /// inputs exist. Registered AFTER JobSystem at 1 Hz: assignment systems earlier in
    /// the tick get first pick of idle citizens; we only recruit JobKind.None citizens
    /// and stamp them JobKind.Craft immediately.
    ///
    /// Per-citizen Craft state is encoded entirely in existing fields (no new fields):
    ///   - JobTarget    = the STATION's tile for the whole job (fetching, carrying and
    ///                    working alike). It is the worker-binding key: at most one
    ///                    citizen with JobKind.Craft targets a given station, enforced
    ///                    at recruit time. (The travel destination — input stack or
    ///                    staging tile — lives in the citizen's Path, and arrival tiles
    ///                    are re-validated from ground truth, so JobTarget never needs
    ///                    to point at the item.)
    ///   - JobWorkTicks = phase marker: 0 = logistics (fetching an input stack or
    ///                    carrying one to the bench; sub-phase by CarryingItemId),
    ///                    &gt; 0 = working at the bench (set to the recipe's work ticks;
    ///                    it is a marker only — Device.Progress is authoritative).
    ///   - CarryingItemId = the input stack in hand during the carry leg.
    ///
    /// Staging: inputs are dropped on (and outputs spawn at) the station's staging
    /// tile — the first walkable 4-neighbor in Int3.Neighbor4 order. "Staged" counting
    /// is more forgiving: any unreserved ground stack of the input kind on ANY
    /// 4-neighbor of the station counts, so drops that land on other adjacent tiles
    /// still work.
    ///
    /// Reservations: fetched stacks travel as plain carries; ON STAGING they become the
    /// station's claim (ReservedBy = the station's Device.Id) so the haul board can never
    /// drag staged inputs to a stockpile mid-batch (review livelock fix). The claim is
    /// OWNER-SCOPED: only this station (or, once the batch dies, its own release path) can
    /// clear it — a co-located citizen reservation on the same tile is untouched.
    /// A carried stack is still dropped by Simulation.CancelJob itself (it is CarriedBy the
    /// worker), and un-carried stacks are never marked. The one thing CancelJob cannot reach
    /// is a STAGED claim (no citizen owns it, so CancelJob's citizen-keyed release skips it):
    /// that is freed by <see cref="ReleaseStagedClaims"/> when the batch goes dead — no live
    /// worker and no input left to fetch, so the set can never complete. Before the owner id
    /// (B-1) the ownerless flag had ONLY <see cref="ConsumeStagedInputs"/> as a release, which a
    /// half-staged batch never reached, so the last unit stayed reserved by nobody forever —
    /// invisible to the haul board and to MachineWearSystem, yet still counted 1/2 staged.
    ///
    /// Interruption semantics: when the worker is redirected or dies mid-work, the
    /// station's Progress holds (frozen) and already-consumed inputs stay consumed —
    /// a new idle citizen is recruited to walk back and resume the batch (Progress &gt; 0
    /// starts work without consuming again). An unpowered station holds progress with
    /// the worker waiting at the bench.
    ///
    /// W0-5 (economy programme): what a station runs is a <see cref="ProductionBill"/>,
    /// resolved by <see cref="ProductionDefs.TryGetBill"/> — the station's
    /// <c>[production]</c> node if it has one, else its legacy <c>sim.Defs.Recipes</c> row.
    /// The loops below are written over PORTS (N inputs, M outputs, integer counts) rather
    /// than a single input/output pair, but shipped content declares zero nodes, so every
    /// shipped station resolves to a one-port legacy bill and behaves exactly as before.
    ///
    /// Determinism: stations iterated in device store order, citizens/items in store
    /// order with strict-&lt; nearest-first (ties resolve to lowest store index), tiles
    /// via the canonical Neighbor4 order, input/output PORTS in port (array) order, no
    /// RNG, no LINQ. Steady state (stations but no inputs) allocates nothing —
    /// <see cref="ProductionBill"/> is a struct over arrays that already exist.
    /// </summary>
    public sealed class CraftingSystem : ISimSystem
    {
        public string Name => "Crafting";
        public int IntervalTicks => 10; // 1 Hz

        private const float CompletionEpsilon = 1e-4f; // float sum of 1/workSeconds won't hit 1.0 exactly

        /// <summary>
        /// W0-5: what a station runs comes from <see cref="ProductionDefs.TryGetBill"/> —
        /// prefer the station's <c>[production]</c> node, fall back to its legacy
        /// <c>sim.Defs.Recipes</c> row (indexed by DeviceKind; SimDefs.Default reproduces the
        /// former hardcoded switch — SalvageRecycler, Fabricator, MachineShop). Shipped
        /// content declares no nodes, so every shipped station takes the fallback leg and
        /// behaves exactly as before. A kind with neither has
        /// <see cref="ProductionBill.Defined"/> false. Reads go through sim.Defs so parallel
        /// sims never cross-talk; the tick count is derived at use as
        /// WorkSeconds × Simulation.TicksPerSecond.
        /// </summary>
        private static bool TryGetBill(SimDefs defs, DeviceKind kind, out ProductionBill bill) =>
            ProductionDefs.TryGetBill(defs, kind, out bill);

        // Scratch for input consumption (EntityStore.Remove during iteration is unsafe).
        private readonly List<uint> _consumeIds = new List<uint>(8);

        // --- Build-material priority (WS-MATTER). BuildSystem is an OPTIONAL stack member,
        // resolved lazily exactly as JobSystem resolves it: when absent (_build == null) the
        // flag below can never be set and this system behaves bit-for-bit as it did before.
        // While a pending site could actually be FINISHED with the material aboard, the
        // standing bills stop FETCHING that material — a player designation must not lose a
        // race with a recycler that eats the ship's only Regolith. Already-staged inputs and a
        // batch in progress are never clawed back (no un-consume exists), so only the fetch
        // leg is gated. Sites nobody can fund never gate anything (see ComputeBuildDemand).
        private BuildSystem _build;
        private bool _buildResolved;
        private bool _buildWantsMaterial;

        public void Tick(Simulation sim)
        {
            if (!_buildResolved) { _build = FindBuildSystem(sim); _buildResolved = true; }
            _buildWantsMaterial = ComputeBuildDemand(sim);

            ReleaseOrphanedWorkers(sim);

            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var station = devices[i];
                if (!TryGetBill(sim.Defs, station.Kind, out var bill)) continue;
                TickStation(sim, station, bill);
            }
        }

        // ------------------------------------------------------------- station tick

        private void TickStation(Simulation sim, Device station, in ProductionBill recipe)
        {
            var worker = FindWorker(sim, station.Pos);
            bool hasStaging = TryFindStagingTile(sim, station.Pos, out var staging);

            if (worker != null)
            {
                if (!hasStaging) // bench walled in mid-job
                {
                    DropCarried(sim, worker);
                    Abandon(worker);
                    return;
                }
                DriveWorker(sim, station, recipe, staging, worker);
                return;
            }

            // Standing bill: only powered stations recruit. (A station that loses power
            // mid-batch keeps its worker — DriveWorker holds them at the bench.)
            if (!hasStaging || !station.Powered || !station.IsOperational(sim.Defs)) return;

            bool canStart = station.Progress > 0f || AllInputsStaged(sim, station.Pos, recipe);
            if (!canStart)
            {
                // Builders have first call on this material: hold the staged set and wait — a
                // batch a builder is starving is NOT dead, and its inputs stay claimed.
                if (FetchBlockedForBuilds(recipe)) return; // nothing to do — zero-alloc idle
                // Otherwise, if there is no un-staged input left to fetch, the batch is DEAD:
                // no worker, and the set can never be completed. Free this station's staged
                // claim so the stranded inputs re-enter the pool (B-1 — an ownerless staged
                // reservation used to strand the last unit here forever).
                if (!AnyFetchCandidate(sim, station.Pos, recipe))
                {
                    ReleaseStagedClaims(sim, station);
                    return;
                }
            }

            var recruit = FindNearestIdle(sim, staging);
            if (recruit == null) return;

            recruit.JobKind = JobKind.Craft; // claimed now — Jobs/Sustenance already ran this tick
            recruit.JobTarget = station.Pos;
            recruit.JobWorkTicks = 0;
            recruit.CarryingItemId = 0;
            DriveWorker(sim, station, recipe, staging, recruit); // act immediately (path out this tick)
        }

        // ------------------------------------------------------------- worker drive

        private void DriveWorker(Simulation sim, Device station, in ProductionBill recipe, Int3 staging, Citizen worker)
        {
            // --- Work phase (marker set): stand at the bench and drive Progress. ---
            if (worker.JobWorkTicks > 0)
            {
                if (worker.HasPath || !Int3.IsAdjacent4(worker.Pos, station.Pos))
                {
                    // External interference (a path we never set, or displaced). Progress
                    // holds on the device; a fresh recruit resumes the batch.
                    Abandon(worker);
                    return;
                }
                if (!station.Powered || !station.IsOperational(sim.Defs)) return; // unpowered/broken: hold at the bench

                station.Progress += 1f / recipe.WorkSeconds;
                if (station.Progress < 1f - CompletionEpsilon) return;

                station.Progress = 0f;
                // Every output port spawns at the worker's tile, in port order. Counts are
                // whole units straight from the bill — conversion loss lives in the
                // input:output ratio, so there is no rounding step here and no float in the
                // path at all (W0-5 review, B4). A legacy bill is one port, making this
                // bit-identical to the old single AddItem call.
                for (int pIdx = 0; pIdx < recipe.OutputPortCount; pIdx++)
                {
                    var port = recipe.Output(pIdx);
                    sim.AddItem(port.Kind, port.Count, worker.Pos); // sets JobsDirty → haulable
                }
                worker.JobKind = JobKind.None;
                worker.JobWorkTicks = 0;
                return;
            }

            // --- Logistics phase: carrying an input stack to the bench... ---
            if (worker.CarryingItemId != 0)
            {
                if (!sim.Items.TryGet(worker.CarryingItemId, out var carried) || carried.CarriedBy != worker.Id)
                {
                    worker.CarryingItemId = 0; // stack vanished under us — restart from ground truth
                    Abandon(worker);
                    return;
                }
                carried.Pos = worker.Pos; // glue at our 1 Hz cadence; exact again on drop
                if (worker.HasPath) return;

                carried.CarriedBy = 0; // set the stack down where we stand
                carried.ReservedBy = station.Id; // the STATION's claim: staged inputs are
                                                 // invisible to the haul board (livelock fix)
                worker.CarryingItemId = 0;
                sim.JobsDirty |= JobBoardDirty.Items; // input staged/dropped — haul board must re-derive
                if (!Int3.IsAdjacent4(worker.Pos, station.Pos))
                {
                    Abandon(worker); // route was lost — the dropped input re-enters the pool
                    return;
                }
                // Fall through: the drop may complete the staged set.
            }
            else if (worker.HasPath)
            {
                return; // ...or en route to an input stack
            }

            // --- Settled and empty-handed: start work, walk to the bench, or fetch. ---
            bool canStart = station.Progress > 0f || AllInputsStaged(sim, station.Pos, recipe);

            if (Int3.IsAdjacent4(worker.Pos, station.Pos) && canStart)
            {
                if (!station.Powered || !station.IsOperational(sim.Defs)) return; // wait at the bench for power/repair
                if (station.Progress <= 0f) ConsumeStagedInputs(sim, station.Pos, recipe);
                // Marker only; Device.Progress carries the real state across interruptions.
                worker.JobWorkTicks = recipe.WorkSeconds * Simulation.TicksPerSecond;
                return;
            }

            if (canStart)
            {
                // Resume/start from afar: walk to the staging tile.
                if (sim.Paths.FindPath(sim, worker.Pos, staging, worker.Path)) worker.StartPath(sim.Defs.Citizen.TicksPerTile);
                else Abandon(worker); // unreachable right now — the standing bill retries next second
                return;
            }

            StepFetch(sim, station, recipe, worker, staging);
        }

        /// <summary>
        /// Retarget the nearest un-staged input stack from where the worker stands
        /// (called every settled moment, so stolen/consumed stacks self-heal). Standing
        /// on the stack picks it up and turns toward the bench.
        ///
        /// With several input ports the worker fetches for the FIRST short port in port
        /// order — the canonical, stateless order (ECONOMY-PLAN §4 trap 2: "any new scan
        /// must declare its order"). With one port this is the old behaviour verbatim.
        /// </summary>
        private void StepFetch(Simulation sim, Device station, in ProductionBill recipe, Citizen worker, Int3 staging)
        {
            if (FetchBlockedForBuilds(recipe))
            {
                Abandon(worker); // builders have first call on this material — free the citizen
                return;
            }

            if (!TryFirstShortPort(sim, station.Pos, recipe, out var want))
            {
                Abandon(worker); // every port is satisfied — the bill will start next pass
                return;
            }

            ItemStack best = null;
            int bestDist = int.MaxValue;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.Kind != want.Kind || item.CarriedBy != 0 || item.ReservedBy != 0) continue;
                if (Int3.IsAdjacent4(item.Pos, station.Pos)) continue; // already staged at this bench
                int d = Int3.Manhattan(worker.Pos, item.Pos);
                if (d < bestDist)
                {
                    bestDist = d;
                    best = item;
                }
            }

            if (best == null)
            {
                Abandon(worker); // nothing to fetch — freed for other work; bill rescans next second
                return;
            }

            if (best.Pos == worker.Pos)
            {
                // Pick up only once the return leg is known good, so a failure leaves
                // the stack untouched on the ground.
                if (sim.Paths.FindPath(sim, worker.Pos, staging, worker.Path))
                {
                    best.CarriedBy = worker.Id;
                    worker.CarryingItemId = best.Id;
                    worker.StartPath(sim.Defs.Citizen.TicksPerTile);
                    sim.JobsDirty |= JobBoardDirty.Items; // the stack left the ground — haul board must not chase it
                }
                else
                {
                    Abandon(worker);
                }
                return;
            }

            if (sim.Paths.FindPath(sim, worker.Pos, best.Pos, worker.Path)) worker.StartPath(sim.Defs.Citizen.TicksPerTile);
            else Abandon(worker); // unreachable from here — retried from ground truth next second
        }

        // ------------------------------------------------------------- build priority

        private static BuildSystem FindBuildSystem(Simulation sim)
        {
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is BuildSystem b) return b;
            return null;
        }

        /// <summary>
        /// Is any pending site short of material a builder could ACTUALLY put in it? This is
        /// JobSystem's own sufficiency gate (JobSystem refuses to work a site unless the whole
        /// remainder is free at once, because nothing ever un-deposits), plus the units already
        /// in flight to that same site — a hauler mid-trip must keep the rest of his site's cost
        /// protected, or the bills would eat trip two out from under trip one.
        ///
        /// Matching the two predicates is load-bearing. A bare "any site is short" gate makes the
        /// exact set of sites JobSystem has decided it CANNOT work the set that blocks the bills
        /// forever — one lone Regolith beside a 0/2 wall stops the SalvageRecycler for the rest of
        /// the game (a site only leaves Pending via Complete or a player Cancel), and with it
        /// Fabricator and MachineShop, so MachineWearSystem jury-rigs every repair at Condition
        /// 0.6 on a ship whose whole tension model is wear. Player-reachable on the slice:
        /// designate eight walls against twelve units aboard and the last two strand.
        ///
        /// Evaluated once per pass (1 Hz): the item scan is paid only when a site wants material,
        /// the citizen scan only when free units alone are not enough. No allocation, no LINQ.
        /// Always false when the stack has no BuildSystem.
        /// </summary>
        private bool ComputeBuildDemand(Simulation sim)
        {
            if (_build == null) return false;
            var pending = _build.Pending;
            int free = -1; // lazily counted once, then reused across sites
            for (int i = 0; i < pending.Count; i++)
            {
                var site = pending[i];
                if (!BuildSystem.NeedsMaterial(site)) continue;
                if (free < 0) free = CountFreeMaterial(sim);
                int need = site.Required - site.Delivered;
                if (free >= need) return true;                                   // JobSystem would work it now
                if (free + InFlightMaterial(sim, site.Pos) >= need) return true; // ...or is already funding it
            }
            return false;
        }

        /// <summary>Unreserved, uncarried build material on the ground — JobSystem's
        /// <c>_freeMaterialUnits</c>, recomputed from ground truth at our own cadence.</summary>
        private static int CountFreeMaterial(Simulation sim)
        {
            int units = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (it.Kind == BuildSystem.Material && it.CarriedBy == 0 && it.ReservedBy == 0) units += it.Count;
            }
            return units;
        }

        /// <summary>Material reserved by (or in the hands of) a hauler bound for this site.
        /// JobSystem takes one stack per trip, so without this term the gate would drop the
        /// instant the first stack left the free pool.</summary>
        private static int InFlightMaterial(Simulation sim, Int3 site)
        {
            int units = 0;
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.JobKind != JobKind.HaulToBuild || c.JobTarget != site) continue;
                uint id = c.CarryingItemId != 0 ? c.CarryingItemId : c.ReservedItemId;
                if (id != 0 && sim.Items.TryGet(id, out var stack) && stack.Kind == BuildSystem.Material)
                    units += stack.Count;
            }
            return units;
        }

        /// <summary>
        /// Should this station stop FETCHING right now because builders want its input?
        /// True whenever the recipe eats the build material and some site can actually use it.
        ///
        /// There is deliberately NO half-staged carve-out. It was dead code — shipped
        /// SalvageRecycler takes one unit per batch, so <c>!canStart</c> already implies zero
        /// staged units at every call site — and under a retuned <c>in_count &gt;= 2</c> it would
        /// let a bench holding one unit take the last unit a builder was waiting on and consume
        /// both, starving the build for good. The strand it was meant to prevent (a half-staged
        /// bench that can never finish) is now handled by the demand predicate itself: the gate
        /// releases as soon as no pending site can be funded, so the bench always gets its turn.
        /// </summary>
        private bool FetchBlockedForBuilds(in ProductionBill recipe)
        {
            if (!_buildWantsMaterial) return false;
            for (int i = 0; i < recipe.InputPortCount; i++)
                if (recipe.Input(i).Kind == BuildSystem.Material) return true;
            return false;
        }

        // ------------------------------------------------------------------ helpers

        /// <summary>
        /// Free any JobKind.Craft citizen whose bound station no longer exists (or is
        /// no longer a crafting station): drop what they hold, back to the idle pool.
        /// Dead citizens are JobSystem.HandleDead's business — skipped here.
        /// </summary>
        private static void ReleaseOrphanedWorkers(Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.JobKind != JobKind.Craft) continue;
                if (sim.TryGetDeviceAt(c.JobTarget, out var device) && TryGetBill(sim.Defs, device.Kind, out _)) continue;

                DropCarried(sim, c);
                c.JobKind = JobKind.None;
                c.JobWorkTicks = 0;
                c.ClearPath();
            }
        }

        /// <summary>The station's single worker: first live Craft citizen bound to its tile.</summary>
        private static Citizen FindWorker(Simulation sim, Int3 stationPos)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (!c.Dead && c.JobKind == JobKind.Craft && c.JobTarget == stationPos) return c;
            }
            return null;
        }

        /// <summary>Nearest recruitable citizen by Manhattan distance (ties: store order).</summary>
        private static Citizen FindNearestIdle(Simulation sim, Int3 target)
        {
            Citizen best = null;
            int bestDist = int.MaxValue;
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (!c.IsRecruitableForWork) continue;
                int d = Int3.Manhattan(c.Pos, target);
                if (d < bestDist)
                {
                    bestDist = d;
                    best = c;
                }
            }
            return best;
        }

        /// <summary>First walkable 4-neighbor in canonical Neighbor4 order (+x,-x,+y,-y).</summary>
        private static bool TryFindStagingTile(Simulation sim, Int3 stationPos, out Int3 staging)
        {
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(stationPos, i);
                if (!sim.World.InBounds(n) || !sim.IsWalkable(n)) continue;
                staging = n;
                return true;
            }
            staging = default;
            return false;
        }

        /// <summary>Units of <paramref name="kind"/> on the ground on any 4-neighbor of the
        /// station (incl. the station's own staged claim).</summary>
        private static int StagedUnits(Simulation sim, Int3 stationPos, ItemKind kind)
        {
            int total = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.Kind != kind || item.CarriedBy != 0) continue;
                if (Int3.IsAdjacent4(item.Pos, stationPos)) total += item.Count; // incl. our own staged claim
            }
            return total;
        }

        /// <summary>Is EVERY input port's demand already staged at the bench? A batch starts
        /// all-or-nothing, so a multi-port bill waits until the whole set is present.</summary>
        private static bool AllInputsStaged(Simulation sim, Int3 stationPos, in ProductionBill recipe)
        {
            for (int i = 0; i < recipe.InputPortCount; i++)
            {
                var port = recipe.Input(i);
                if (StagedUnits(sim, stationPos, port.Kind) < port.Count) return false;
            }
            return true;
        }

        /// <summary>The first input port (port order) whose demand is not yet staged — what
        /// a fetcher should go get. False when the whole set is already at the bench.</summary>
        private static bool TryFirstShortPort(Simulation sim, Int3 stationPos, in ProductionBill recipe, out ProductionPort want)
        {
            for (int i = 0; i < recipe.InputPortCount; i++)
            {
                var port = recipe.Input(i);
                if (StagedUnits(sim, stationPos, port.Kind) < port.Count) { want = port; return true; }
            }
            want = default;
            return false;
        }

        /// <summary>
        /// Could a fetcher actually complete the whole staged set? True only when EVERY
        /// short port has an un-staged, unreserved stack somewhere. Stricter than a
        /// per-port "any candidate" would be, and deliberately so: recruiting a worker for
        /// a bill that can never be completed strands him fetching for a batch that will
        /// not start. With a single input port this is the old predicate verbatim.
        /// </summary>
        private static bool AnyFetchCandidate(Simulation sim, Int3 stationPos, in ProductionBill recipe)
        {
            bool anyShort = false;
            for (int i = 0; i < recipe.InputPortCount; i++)
            {
                var port = recipe.Input(i);
                if (StagedUnits(sim, stationPos, port.Kind) >= port.Count) continue;
                anyShort = true;
                if (!HasFetchCandidate(sim, stationPos, port.Kind)) return false;
            }
            return anyShort;
        }

        /// <summary>Is there any un-staged stack of this kind a fetcher could go get?</summary>
        private static bool HasFetchCandidate(Simulation sim, Int3 stationPos, ItemKind kind)
        {
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.Kind != kind || item.CarriedBy != 0 || item.ReservedBy != 0) continue;
                if (!Int3.IsAdjacent4(item.Pos, stationPos)) return true;
            }
            return false;
        }

        /// <summary>
        /// Consume every input port's demand from staged stacks (ports in port order, stacks
        /// in item store order): decrement counts, remove emptied stacks. Consumed inputs are
        /// gone for good — an interrupted batch resumes from Device.Progress without
        /// re-consuming.
        ///
        /// Only called once <see cref="AllInputsStaged"/> holds. That check is per port
        /// against the AGGREGATE staged units of the port's kind, and this consumption is
        /// per port with a restarted item scan — so the two agree ONLY because no kind
        /// appears twice in <c>Inputs</c>. The parser refuses such a row (W0-5 review, B1);
        /// without that guard one staged stack would satisfy both ports' checks, port 0
        /// would drain it, port 1 would consume nothing, and the batch would run anyway —
        /// matter created out of the encoding.
        /// </summary>
        private void ConsumeStagedInputs(Simulation sim, Int3 stationPos, in ProductionBill recipe)
        {
            _consumeIds.Clear();
            var items = sim.Items.Items;
            for (int pIdx = 0; pIdx < recipe.InputPortCount; pIdx++)
            {
                var port = recipe.Input(pIdx);
                int remaining = port.Count;
                for (int i = 0; i < items.Count && remaining > 0; i++)
                {
                    var item = items[i];
                    if (item.Kind != port.Kind || item.CarriedBy != 0 || item.Count == 0) continue;
                    if (!Int3.IsAdjacent4(item.Pos, stationPos)) continue; // staged (reserved) stacks are ours to consume
                    int take = item.Count < remaining ? item.Count : remaining;
                    item.Count -= take;
                    remaining -= take;
                    if (item.Count == 0) _consumeIds.Add(item.Id);
                }
            }
            for (int i = 0; i < _consumeIds.Count; i++) sim.Items.Remove(_consumeIds[i]);
            sim.JobsDirty |= JobBoardDirty.Items; // staged inputs consumed into the craft
        }

        /// <summary>
        /// Drop the Craft job (worker keeps any externally-given path; callers drop
        /// carried cargo first — see <see cref="DropCarried"/>). The standing bill
        /// re-recruits from ground truth on a later tick — nothing is reserved,
        /// nothing leaks.
        /// </summary>
        private static void Abandon(Citizen worker)
        {
            worker.JobKind = JobKind.None;
            worker.JobWorkTicks = 0;
        }

        /// <summary>
        /// Free this station's staged claims — every ground stack it stamped with its own id
        /// (<see cref="ItemStack.ReservedBy"/> == <paramref name="station"/>.Id) — back to the
        /// pool. Called ONLY when the batch is dead (no worker, the set can never be completed),
        /// so the reserved-but-idle inputs stop being invisible to the haul board and to
        /// MachineWearSystem. Owner-scoped: a citizen's (or another station's) claim on a
        /// co-located tile is never touched. Store order, no allocation, no RNG (B-1).
        /// </summary>
        private static void ReleaseStagedClaims(Simulation sim, Device station)
        {
            bool any = false;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.CarriedBy != 0 || item.ReservedBy != station.Id) continue;
                item.ReservedBy = 0;
                any = true;
            }
            if (any) sim.JobsDirty |= JobBoardDirty.Items; // freed inputs re-enter the haul board
        }

        /// <summary>Set any carried stack down where the citizen stands.</summary>
        private static void DropCarried(Simulation sim, Citizen worker)
        {
            if (worker.CarryingItemId == 0) return;
            if (sim.Items.TryGet(worker.CarryingItemId, out var carried) && carried.CarriedBy == worker.Id)
            {
                carried.Pos = worker.Pos;
                carried.CarriedBy = 0;
                sim.JobsDirty |= JobBoardDirty.Items; // carried input set down where we stand
            }
            worker.CarryingItemId = 0;
        }


    }
}
