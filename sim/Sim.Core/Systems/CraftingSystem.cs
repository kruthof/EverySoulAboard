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
    public sealed class CraftingSystem : ISimSystem, IWorkOfferSource
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

        // --- M1-H: the dispatcher's refusal contract, for a recruiter that never sees the
        // dispatcher. See PushRecruitBackoff. Every Abandon below is a REFUSAL — this station
        // could not use this crew member right now — and every refusal stamps the station for
        // JobWork.UnreachableRetryTicks, so an impossible bill is re-probed every 5 s instead of
        // re-offered every second. Not saved, not hashed (the pull sources' own precedent).
        private readonly PushRecruitBackoff _backoff = new PushRecruitBackoff();

        /// <summary>DIAGNOSTIC SEAM (tests only, never a tick path): this system's per-station
        /// backoff. See <see cref="PushRecruitBackoff.RetryAtFor"/> for why the stamp is readable
        /// at all rather than inferred from timing.</summary>
        public PushRecruitBackoff Backoff => _backoff;

        // Scratch for the recruit-time reachability probe. NEVER the citizen's own Path: a probe
        // must not leave a half-written path on a crew member it then declines to claim.
        // _probeSkip holds the candidates already probed and refused this pass — lookup only,
        // never iterated, cleared (not reallocated) per scan.
        private readonly List<Int3> _probePath = new List<Int3>(64);
        private readonly HashSet<uint> _probeSkip = new HashSet<uint>();

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
        private long _buildDemandTick = -1;

        public void Tick(Simulation sim)
        {
            BuildWantsMaterial(sim);

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
                    Abandon(sim, station, worker);
                    return;
                }
                DriveWorker(sim, station, recipe, staging, worker);
                return;
            }

            // Standing bill: only powered stations recruit. (A station that loses power
            // mid-batch keeps its worker — DriveWorker holds them at the bench.)
            if (!hasStaging || !station.Powered || !station.IsOperational(sim.Defs)) return;
            // E0-7 backpressure. TRUE for every station that is not an ice melter, so nothing else
            // changes; for a melter it means "your buffer could not hold another batch's meltwater",
            // which on a 2 Hz drain can only be true when the fluid network is full, absent,
            // unpowered or broken. Without it a ship with full tanks would keep recruiting crew to
            // burn finite hold ice into an overflow that is thrown away.
            if (!WaterSystem.HasMeltHeadroom(sim, station, recipe)) return;

            bool canStart = station.Progress > 0f || AllInputsStaged(sim, station.Pos, recipe);
            if (!canStart)
            {
                // Builders have first call on this material: hold the staged set and wait — a
                // batch a builder is starving is NOT dead, and its inputs stay claimed.
                if (FetchBlockedForBuilds(sim, recipe)) return; // nothing to do — zero-alloc idle
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

            // M1-H: this station refused a crew member within the last 5 s and nothing about that
            // refusal was about the crew member, so re-offering the same bill this second is the
            // thrash itself. Gated HERE and not earlier so the B-1 staged-claim release above still
            // runs every pass — a backed-off station must not also strand its inputs.
            if (_backoff.IsBackedOff(sim, station.Id)) return;

            var recruit = FindNearestReachableIdle(sim, staging, WorkType.Craft, out bool anyIdle);
            if (recruit == null)
            {
                // TWO DIFFERENT NULLS, AND THEY MUST NOT BE TREATED THE SAME. "Nobody is idle" is
                // not a refusal by this station at all — it costs one field read per crew member to
                // re-ask, and stamping it would delay by up to 5 s the moment a freed crew member
                // is picked up, on every station, on every ship. "Somebody is idle but none of them
                // can REACH the bench" IS the refusal: it cost a whole-region A* to discover, it is
                // a property of the station, and re-paying it every second is precisely the thrash
                // (the wreck, measured on `main`: 1 468 refusals in 1.2 sim-hours).
                if (anyIdle) _backoff.Refuse(sim, station.Id);
                return;
            }

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
                    Abandon(sim, station, worker);
                    return;
                }
                if (!station.Powered || !station.IsOperational(sim.Defs)) return; // unpowered/broken: hold at the bench

                // ⭐ M3-7 — WHO is at the bench decides how fast the batch fills. ⚠️ THIS IS THE ONE
                // CONSUMER SCALED AT THE ACCRUAL RATHER THAN AT THE ASSIGNMENT, and the asymmetry is
                // forced by the accumulator, not a preference: `station.Progress` lives on the DEVICE
                // and survives a worker being pulled off mid-batch ("Progress holds on the device; a
                // fresh recruit resumes the batch", eleven lines up), so a fresh recruit at a
                // different competence must contribute at HER rate to the remainder. Scaling the
                // assignment — which is what the four JobWorkTicks consumers do, because their
                // countdown is LOST on abandon — would price the whole batch at whoever touched it
                // first. `worker.JobWorkTicks` here is only a phase marker and is never decremented,
                // so there is nothing to scale on that side. ⚠️ AND THIS LINE IS BIT-IDENTICAL TO THE
                // OLD ONE ON THE WHOLE SHIPPING FLEET, exactly rather than approximately: an
                // untrained crafter's rate is EXACTLY 1.0f (`1000 / 1000f` is an exact IEEE
                // quotient), so the expression below is literally `1.0f / recipe.WorkSeconds` — the
                // same division, not a multiply that happens to round back. That is what lets this
                // package's determinism move be fold-only while the fleet is untrained.
                station.Progress += WorkRates.RateFor(worker, WorkType.Craft) / recipe.WorkSeconds;
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
                // E0-7: a station whose product is a FLUID has no output port to spawn. The ice
                // melter's `melt_ice` bill declares `none` outputs (the loop above runs zero times)
                // and the litres land in the melter's own buffer instead. A no-op for every other
                // station kind — see WaterSystem.OnBatchComplete.
                WaterSystem.OnBatchComplete(sim, station, recipe);
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
                    Abandon(sim, station, worker);
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
                    Abandon(sim, station, worker); // route was lost — the dropped input re-enters the pool
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
                else Abandon(sim, station, worker); // unreachable right now — the standing bill retries next second
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
            if (FetchBlockedForBuilds(sim, recipe))
            {
                Abandon(sim, station, worker); // builders have first call on this material — free the citizen
                return;
            }

            if (!TryFirstShortPort(sim, station.Pos, recipe, out var want))
            {
                Abandon(sim, station, worker); // every port is satisfied — the bill will start next pass
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
                Abandon(sim, station, worker); // nothing to fetch — freed for other work; bill rescans next second
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
                    Abandon(sim, station, worker);
                }
                return;
            }

            if (sim.Paths.FindPath(sim, worker.Pos, best.Pos, worker.Path)) worker.StartPath(sim.Defs.Citizen.TicksPerTile);
            else Abandon(sim, station, worker); // unreachable from here — retried from ground truth next second
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
        private bool FetchBlockedForBuilds(Simulation sim, in ProductionBill recipe)
        {
            if (!BuildWantsMaterial(sim)) return false;
            for (int i = 0; i < recipe.InputPortCount; i++)
                if (recipe.Input(i).Kind == BuildSystem.Material) return true;
            return false;
        }

        /// <summary>
        /// ⭐ <b>M2-5 — MEMOISED PER TICK, AND THE MEMO IS FOR CORRECTNESS OF THE DEFER, NOT FOR
        /// SPEED. DO NOT DELETE IT AS A PERF ITEM.</b> (That is not hypothetical: this repo has
        /// already measured a caching change worth ~1 % and not separable from noise, and the lesson
        /// taken from it was that a cache with no correctness argument is dead weight. This one has
        /// the argument.)
        ///
        /// <para><see cref="ComputeBuildDemand"/> used to be evaluated at exactly one moment — the
        /// top of this system's own 1 Hz <see cref="Tick"/> — and stored in a field that only
        /// <see cref="FetchBlockedForBuilds"/> read. M2-5 gives it a SECOND reader on a DIFFERENT
        /// cadence: <see cref="HasClaimableWork"/> is asked by <see cref="WorkArbiter"/> from inside
        /// <see cref="JobSystem"/>'s 10 Hz pass, earlier in the same tick and on the nine ticks in
        /// ten when this system does not run at all. Reading the stale field there would let the
        /// query answer "yes, this bench can be worked" about a bench whose very next claim path
        /// refuses for want of material — <b>the defer query and the claim disagreeing is exactly
        /// the shape that stalls a band silently</b> (the M2-0 spike's own bug: a query that could
        /// not see <see cref="AllInputsStaged"/> / build demand cost a four-pawn fixture 40 782
        /// ticks with no error and no log).</para>
        ///
        /// <para>⇒ The memo is keyed on <see cref="Simulation.TickCount"/> so that <b>every reader
        /// within one tick sees ONE value</b>, whichever of them asked first. It is not saved and
        /// not hashed: it is a per-tick derivation of state that is already saved.</para>
        /// </summary>
        private bool BuildWantsMaterial(Simulation sim)
        {
            if (_buildDemandTick == sim.TickCount) return _buildWantsMaterial;
            if (!_buildResolved) { _build = FindBuildSystem(sim); _buildResolved = true; }
            _buildWantsMaterial = ComputeBuildDemand(sim);
            _buildDemandTick = sim.TickCount;
            return _buildWantsMaterial;
        }

        // ------------------------------------------------------------- arbitration (answering)

        /// <summary>M2-5: this system hands out exactly <see cref="WorkType.Craft"/>.</summary>
        public byte OfferedWorkTypes => 1 << (int)WorkType.Craft;

        /// <summary>
        /// M2-5 — <b>WOULD A BENCH TAKE THIS CREW MEMBER RIGHT NOW?</b>
        ///
        /// <para>⭐ <b>THIS IS THE QUERY THE M2-0 SPIKE GOT WRONG, AND ITS BUG IS THE REASON THE
        /// PACKAGE IS SIZE L.</b> The spike's version could not see <see cref="AllInputsStaged"/> or
        /// the build-material gate — both computed later in this system's own <c>Tick</c> — so it
        /// answered "yes" for benches that would never offer anything, and with four pawns the
        /// low-band order was <b>never served in 40 000 ticks</b> (it took 40 782). There is no
        /// error and no log: an over-reporting defer looks exactly like "the pawn is busy".</para>
        ///
        /// <para>⇒ <b>EVERY EARLY RETURN OF <see cref="TickStation"/>'s recruiting half is mirrored
        /// below, in its order.</b> The stall is unbounded precisely because a station that returns
        /// early never ATTEMPTS a claim and therefore never stamps the M1-H backoff that would
        /// otherwise break it. The one thing deliberately not mirrored is
        /// <c>FindNearestReachableIdle</c>'s A* probe — the expensive half of the claim, and the
        /// optimism <see cref="IWorkOfferSource"/> declares.</para>
        /// </summary>
        public bool HasClaimableWork(Simulation sim, Citizen citizen, WorkType type, bool asIfIdle)
        {
            if (type != WorkType.Craft) return false;
            // M2-8: `asIfIdle` relaxes THIS gate and nothing else — see IWorkOfferSource. The
            // "already crewed" skip below is what keeps a Craft pawn from being offered her own
            // bench back under the hypothetical.
            if (!(asIfIdle ? citizen.IsRecruitableIgnoringJob : citizen.IsRecruitableForWork) ||
                !citizen.CanTakeWorkType(WorkType.Craft)) return false;

            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var station = devices[i];
                if (!TryGetBill(sim.Defs, station.Kind, out var recipe)) continue;
                if (FindWorker(sim, station.Pos) != null) continue;             // already crewed
                if (!TryFindStagingTile(sim, station.Pos, out _)) continue;     // walled in
                if (!station.Powered || !station.IsOperational(sim.Defs)) continue;
                if (!WaterSystem.HasMeltHeadroom(sim, station, recipe)) continue; // E0-7 backpressure

                bool canStart = station.Progress > 0f || AllInputsStaged(sim, station.Pos, recipe);
                if (!canStart)
                {
                    // ⛔ THE TWO LINES THE SPIKE DID NOT HAVE. Without them a bench with un-staged
                    // inputs, or one whose material a builder has first call on, reports itself
                    // claimable forever and every pawn at or below the Craft band waits for it.
                    if (FetchBlockedForBuilds(sim, recipe)) continue;
                    if (!AnyFetchCandidate(sim, station.Pos, recipe)) continue;
                }

                if (_backoff.IsBackedOff(sim, station.Id)) continue; // M1-H: refused within the last 5 s
                return true;
            }
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

        /// <summary>
        /// M1-H: nearest recruitable citizen by Manhattan distance (ties: store order) WHO CAN
        /// ACTUALLY REACH THE BENCH — next-nearest on a refusal, exactly as
        /// <see cref="JobSystem"/> retries the next-nearest candidate when
        /// <see cref="DigJobSource.TryClaim"/> returns false.
        ///
        /// <para>⭐ <b>THIS IS THE LOAD-BEARING HALF OF M1-H, AND THE CHARTER DID NOT ASK FOR IT.
        /// DO NOT "SIMPLIFY" IT AWAY.</b> The chartered fix was the backoff alone. Each half was
        /// built and measured separately on <c>--ship wreck --days 1 --no-repair</c>: <b>backoff
        /// only 597 → 228 Craft starts and 3.575 % → 3.333 % of crew-ticks (−6.8 %); probe only
        /// 0 and 0.000 %.</b> ⇒ The backoff does ~7 % of the work and this does 100 %, because the
        /// WALK is what costs. Delete this and the nine site-coverage legs stay green while 100 %
        /// of the defect returns — which is precisely why they are not the guard for it
        /// (<c>RecruitProbe_*</c> and <c>DrivenThrash_*</c> are).</para>
        ///
        /// <para><b>Why the probe is here and not left to <see cref="DriveWorker"/>.</b> A pull
        /// source PROVES a claim before it makes one: <c>DigJobSource.TryClaim</c> paths to the
        /// site and returns false without ever writing <see cref="Citizen.JobKind"/>. This
        /// recruiter used to write <c>JobKind.Craft</c> first and discover the impossibility later
        /// — sometimes MUCH later, because the fetch leg only ever paths to the STACK, so a crew
        /// member would walk the whole way to an input and only then find (at the
        /// <c>best.Pos == worker.Pos</c> branch of <see cref="StepFetch"/>) that it could not carry
        /// it back. Measured on <c>--ship wreck</c> with repair off: 1 468 such round trips in 1.2
        /// sim-hours, 597 of them long enough to be seen as a job start, 75.3 % of sim-hour 1.
        /// (The TOTALS are independently confirmed; the ALL-AT-ONE-SITE attribution is a single
        /// measurement from a throwaway instrumented build and was not re-derived by review.
        /// Nothing here rests on it — the before/after totals prove the conclusion directly.)
        /// A backoff alone only halves that, because the WALK is what costs; refusing the claim
        /// removes it.</para>
        ///
        /// <para><b>It cannot mis-refuse a reachable bench.</b> Walkability is an undirected graph
        /// (<see cref="PathService.FindPath"/> is plain A* with no node budget and no one-way
        /// links), so "this crew member cannot reach the staging tile" is a statement about the
        /// connected component it stands in — it cannot become false by walking somewhere else in
        /// that same component. Doors are the one thing that can change it, and a door opening is
        /// exactly what the 5 s backoff exists to re-probe for.</para>
        ///
        /// <para><b>Identical selection whenever the nearest candidate is reachable</b>, which is
        /// every recruit on <c>--ship grid</c> and <c>--ship slice</c> — measured, not assumed
        /// (all THREE path-failure abandon sites — the walk-to-bench at <c>:295</c>, the
        /// pick-up-and-return at <c>:360</c> and the walk-to-input at <c>:366</c> — fire zero times
        /// on either ship over a sim-day. <c>:360</c> is the one that accounts for the wreck's
        /// 1 468. An earlier draft of this comment said "two", which was a miscount, not a
        /// different measurement.)
        /// The extra A* is paid once per recruiting station per pass and the backoff amortises the
        /// failing case to once per 5 s.</para>
        ///
        /// <para><paramref name="anyIdle"/> reports whether ANY recruitable citizen existed, so the
        /// caller can tell "nobody is free" (not a refusal — re-ask next second, it costs a field
        /// read) from "nobody free can get here" (a refusal — stamp it).</para>
        /// </summary>
        private Citizen FindNearestReachableIdle(Simulation sim, Int3 target, WorkType work, out bool anyIdle)
        {
            anyIdle = false;
            _probeSkip.Clear();
            while (true)
            {
                Citizen best = null;
                int bestDist = int.MaxValue;
                var citizens = sim.Citizens.Items;
                for (int i = 0; i < citizens.Count; i++)
                {
                    var c = citizens[i];
                    if (!c.IsRecruitableForWork) continue;
                    // ⭐ M4-9 (BREAK GATE 3 of 6) — the PUSH recruiter that bypasses the dispatcher
                    // entirely. Placed BESIDE M2-2's veto (never inside it) and BEFORE `anyIdle`, on
                    // the veto's own positional argument one comment down: "she has broken" is a
                    // fact about the PERSON, and turning it into a 5 s backoff stamp on the STATION
                    // would record the refusal against the wrong subject.
                    if (c.BreakRefusesWork) continue;
                    // ⭐ M2-2 (G2) — THE WORK-TYPE VETO, and its POSITION is behaviour, not style.
                    // It sits BEFORE `anyIdle = true` so a crew member with Craft switched off reads
                    // as "nobody is free", not as "somebody is free but cannot reach the bench". The
                    // caller turns the second into a 5 s station backoff stamp (M1-H), and stamping
                    // a station because of a PLAYER SETTING would be a refusal recorded against the
                    // wrong subject: the bench is fine, and the moment the player ticks Craft on she
                    // must be picked up on the next pass, not up to five seconds later.
                    if (!c.CanTakeWorkType(work)) continue;
                    // ⭐⭐ M2-5 (SITE 4) — THE PUSH GATE. A bench must not take a crew member whose
                    // best available work sits at a better band: this recruiter never passes through
                    // the dispatcher, so the band loop in TryAssign cannot rank it and a defer query
                    // alone is a no-op wherever a recruiter re-claims its own worker.
                    //
                    // Placed BEFORE `anyIdle = true` for exactly the reason M2-2's veto above is:
                    // "she has better work" is a fact about the PERSON, and the caller turns a
                    // refusal into a 5 s backoff stamp on the STATION (M1-H). Stamping the bench
                    // here would silence it for five seconds because of somebody else's priorities.
                    if (WorkArbiter.HasBetterOfferThan(sim, c, work, this)) continue;
                    anyIdle = true;
                    if (_probeSkip.Contains(c.Id)) continue;
                    int d = Int3.Manhattan(c.Pos, target);
                    if (d < bestDist)
                    {
                        bestDist = d;
                        best = c;
                    }
                }
                if (best == null) return null;
                if (sim.Paths.FindPath(sim, best.Pos, target, _probePath)) return best;
                _probeSkip.Add(best.Id); // unreachable from where he stands — try the next-nearest
            }
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
        private void Abandon(Simulation sim, Device station, Citizen worker)
        {
            worker.JobKind = JobKind.None;
            worker.JobWorkTicks = 0;
            // M1-H — THE ONE FUNNEL, AND THAT IS THE POINT. Every abandon in this file is the same
            // statement — "this station could not use this crew member right now" — and the pull
            // sources answer it the same way at every one of their own refusal sites. Stamping here
            // rather than at the ten call sites is a structural guarantee: a future eleventh site
            // inherits the backoff, and CraftingBackoffTests' site-coverage legs then measure ten
            // real paths INTO the funnel rather than ten copies of one line. Removing this line is
            // mutation 1 of the package's table; it reddens the driven thrash leg.
            _backoff.Refuse(sim, station.Id);
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
