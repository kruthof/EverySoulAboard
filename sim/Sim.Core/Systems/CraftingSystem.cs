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
    /// station's claim (ReservedForJob=true) so the haul board can never drag staged
    /// inputs to a stockpile mid-batch (review livelock fix). Simulation.CancelJob
    /// (player redirects, death) does not know how to release a Craft input
    /// reservation, so instead of reserving across ticks we validate on arrival: the
    /// fetch leg walks to a stack and re-checks the ground when it gets there; if the
    /// stack is gone (hauled away, consumed by another station) the job is abandoned
    /// and the every-tick rescan retries from ground truth. A canceled Craft therefore
    /// leaks nothing: a carried stack is dropped by CancelJob itself, and un-carried
    /// stacks were never marked.
    ///
    /// Interruption semantics: when the worker is redirected or dies mid-work, the
    /// station's Progress holds (frozen) and already-consumed inputs stay consumed —
    /// a new idle citizen is recruited to walk back and resume the batch (Progress &gt; 0
    /// starts work without consuming again). An unpowered station holds progress with
    /// the worker waiting at the bench.
    ///
    /// Determinism: stations iterated in device store order, citizens/items in store
    /// order with strict-&lt; nearest-first (ties resolve to lowest store index), tiles
    /// via the canonical Neighbor4 order, no RNG, no LINQ. Steady state (stations but
    /// no inputs) allocates nothing.
    /// </summary>
    public sealed class CraftingSystem : ISimSystem
    {
        public string Name => "Crafting";
        public int IntervalTicks => 10; // 1 Hz

        private const float CompletionEpsilon = 1e-4f; // float sum of 1/workSeconds won't hit 1.0 exactly

        /// <summary>The recipe table now lives in sim.Defs.Recipes (indexed by DeviceKind;
        /// SimDefs.Default reproduces the former hardcoded switch — SalvageRecycler,
        /// Fabricator, MachineShop). A kind with no recipe has <see cref="RecipeDef.Defined"/>
        /// false. Reads go through sim.Defs so parallel sims never cross-talk; the tick count
        /// is derived at use as WorkSeconds × Simulation.TicksPerSecond.</summary>
        private static bool TryGetRecipe(SimDefs defs, DeviceKind kind, out RecipeDef recipe)
        {
            recipe = defs.Recipes[(int)kind];
            return recipe.Defined;
        }

        // Scratch for input consumption (EntityStore.Remove during iteration is unsafe).
        private readonly List<uint> _consumeIds = new List<uint>(8);

        // --- Build-material priority (WS-MATTER). BuildSystem is an OPTIONAL stack member,
        // resolved lazily exactly as JobSystem resolves it: when absent (_build == null) the
        // flag below can never be set and this system behaves bit-for-bit as it did before.
        // While any pending site is still short of material, the standing bills stop FETCHING
        // that material — a player designation must not lose a race with a recycler that eats
        // the ship's only Regolith. Already-staged inputs and a batch in progress are never
        // clawed back (no un-consume exists), so only the fetch leg is gated.
        private BuildSystem _build;
        private bool _buildResolved;
        private bool _buildWantsMaterial;

        public void Tick(Simulation sim)
        {
            if (!_buildResolved) { _build = FindBuildSystem(sim); _buildResolved = true; }
            _buildWantsMaterial = ComputeBuildDemand();

            ReleaseOrphanedWorkers(sim);

            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var station = devices[i];
                if (!TryGetRecipe(sim.Defs, station.Kind, out var recipe)) continue;
                TickStation(sim, station, recipe);
            }
        }

        // ------------------------------------------------------------- station tick

        private void TickStation(Simulation sim, Device station, in RecipeDef recipe)
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

            bool canStart = station.Progress > 0f ||
                            StagedUnits(sim, station.Pos, recipe) >= recipe.InputCount;
            // Don't recruit anyone to go fetch material the builders are waiting on.
            if (!canStart && (FetchBlockedForBuilds(sim, station.Pos, recipe) ||
                              !AnyFetchCandidate(sim, station.Pos, recipe)))
                return; // nothing to do — zero-alloc idle

            var recruit = FindNearestIdle(sim, staging);
            if (recruit == null) return;

            recruit.JobKind = JobKind.Craft; // claimed now — Jobs/Sustenance already ran this tick
            recruit.JobTarget = station.Pos;
            recruit.JobWorkTicks = 0;
            recruit.CarryingItemId = 0;
            DriveWorker(sim, station, recipe, staging, recruit); // act immediately (path out this tick)
        }

        // ------------------------------------------------------------- worker drive

        private void DriveWorker(Simulation sim, Device station, in RecipeDef recipe, Int3 staging, Citizen worker)
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
                sim.AddItem(recipe.Output, recipe.OutputCount, worker.Pos); // sets JobsDirty → haulable
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
                carried.ReservedForJob = true; // the STATION's claim: staged inputs are
                                               // invisible to the haul board (livelock fix)
                worker.CarryingItemId = 0;
                sim.JobsDirty = true;
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
            bool canStart = station.Progress > 0f ||
                            StagedUnits(sim, station.Pos, recipe) >= recipe.InputCount;

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
        /// </summary>
        private void StepFetch(Simulation sim, Device station, in RecipeDef recipe, Citizen worker, Int3 staging)
        {
            if (FetchBlockedForBuilds(sim, station.Pos, recipe))
            {
                Abandon(worker); // builders have first call on this material — free the citizen
                return;
            }

            ItemStack best = null;
            int bestDist = int.MaxValue;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.Kind != recipe.Input || item.CarriedBy != 0 || item.ReservedForJob) continue;
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
                    sim.JobsDirty = true; // the stack left the ground — haul board must not chase it
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

        /// <summary>Is any pending build site still short of material? Evaluated once per pass
        /// (1 Hz) over the canonical pending list — no allocation, no LINQ. Always false when
        /// the stack has no BuildSystem.</summary>
        private bool ComputeBuildDemand()
        {
            if (_build == null) return false;
            var pending = _build.Pending;
            for (int i = 0; i < pending.Count; i++)
                if (BuildSystem.NeedsMaterial(pending[i])) return true;
            return false;
        }

        /// <summary>
        /// Should this station stop FETCHING right now because builders want its input?
        /// True only when the recipe eats the build material, some site is short of it, and
        /// this bench has nothing staged yet. The nothing-staged condition is what keeps the gate
        /// deadlock-free: a bench that already holds part of a batch is allowed to complete it
        /// (staged inputs carry the station's own reservation and are invisible to the build
        /// board, so a half-staged bench that could never finish would strand them for good).
        /// Shipped content can't reach that case — only SalvageRecycler eats Regolith and it
        /// takes one unit per batch — but a retuned recipes.def could.
        /// </summary>
        private bool FetchBlockedForBuilds(Simulation sim, Int3 stationPos, in RecipeDef recipe) =>
            _buildWantsMaterial && recipe.Input == BuildSystem.Material &&
            StagedUnits(sim, stationPos, recipe) == 0;

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
                if (sim.TryGetDeviceAt(c.JobTarget, out var device) && TryGetRecipe(sim.Defs, device.Kind, out _)) continue;

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
                if (!c.IsIdleForWork) continue;
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

        /// <summary>Input units on the ground on any 4-neighbor of the station (unreserved).</summary>
        private static int StagedUnits(Simulation sim, Int3 stationPos, in RecipeDef recipe)
        {
            int total = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.Kind != recipe.Input || item.CarriedBy != 0) continue;
                if (Int3.IsAdjacent4(item.Pos, stationPos)) total += item.Count; // incl. our own staged claim
            }
            return total;
        }

        /// <summary>Is there any un-staged input stack a fetcher could go get?</summary>
        private static bool AnyFetchCandidate(Simulation sim, Int3 stationPos, in RecipeDef recipe)
        {
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item.Kind != recipe.Input || item.CarriedBy != 0 || item.ReservedForJob) continue;
                if (!Int3.IsAdjacent4(item.Pos, stationPos)) return true;
            }
            return false;
        }

        /// <summary>
        /// Consume InputCount units from staged stacks (item store order): decrement
        /// counts, remove emptied stacks. Consumed inputs are gone for good — an
        /// interrupted batch resumes from Device.Progress without re-consuming.
        /// </summary>
        private void ConsumeStagedInputs(Simulation sim, Int3 stationPos, in RecipeDef recipe)
        {
            int remaining = recipe.InputCount;
            _consumeIds.Clear();
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count && remaining > 0; i++)
            {
                var item = items[i];
                if (item.Kind != recipe.Input || item.CarriedBy != 0) continue;
                if (!Int3.IsAdjacent4(item.Pos, stationPos)) continue; // staged (reserved) stacks are ours to consume
                int take = item.Count < remaining ? item.Count : remaining;
                item.Count -= take;
                remaining -= take;
                if (item.Count == 0) _consumeIds.Add(item.Id);
            }
            for (int i = 0; i < _consumeIds.Count; i++) sim.Items.Remove(_consumeIds[i]);
            sim.JobsDirty = true;
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

        /// <summary>Set any carried stack down where the citizen stands.</summary>
        private static void DropCarried(Simulation sim, Citizen worker)
        {
            if (worker.CarryingItemId == 0) return;
            if (sim.Items.TryGet(worker.CarryingItemId, out var carried) && carried.CarriedBy == worker.Id)
            {
                carried.Pos = worker.Pos;
                carried.CarriedBy = 0;
                sim.JobsDirty = true;
            }
            worker.CarryingItemId = 0;
        }


    }
}
