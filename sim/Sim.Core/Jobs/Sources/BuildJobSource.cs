using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// BUILD (M1, WS-MATTER): feed a construction site its material, then build it. Two boards
    /// and two <see cref="JobKind"/>s in ONE source, because they share the reservation set, the
    /// resolved <see cref="BuildSystem"/> and the free-material count, and because their relative
    /// priority is internal: at an exact distance tie a READY site outranks a NEEDY one.
    ///
    /// <see cref="BuildSystem"/> is an OPTIONAL stack member, resolved lazily once. When absent
    /// the whole source is inert — the boards stay empty and every progress path releases — so a
    /// build-free stack behaves and hashes exactly as it did before M1.
    ///
    /// Both boards store the SITE as <see cref="Citizen.JobTarget"/>, so reservations derive from
    /// citizen state exactly as dig's do, and both rank by distance to the site (the hauler routes
    /// via the material first, but the site is the stable destination).
    ///
    /// The free-material COUNT, not a flag, is what makes scarce material work: a boolean "some
    /// material exists somewhere" sent haulers at every needy site, so two designations and two
    /// loose units left both sites stranded at 1/2 forever — <see cref="BuildSystem.Deposit"/> has
    /// no un-deposit. A site is only pursued when its whole remainder is available, and the count
    /// is decremented as stacks are reserved (by ANY source — see
    /// <see cref="OnGroundItemReserved"/>) so one pass cannot over-commit.
    ///
    /// Candidate index space, opaque to the dispatcher: <c>[0.._ready.Count)</c> is the ready
    /// board, <c>_ready.Count + j</c> is <c>_needMat[j]</c>.
    /// </summary>
    public sealed class BuildJobSource : IJobSource
    {
        private static readonly JobKind[] Kinds = { JobKind.HaulToBuild, JobKind.Build };

        private BuildSystem _build;
        private bool _buildResolved;

        private readonly List<Int3> _ready = new List<Int3>(32);            // Delivered >= Required
        private readonly List<Int3> _needMat = new List<Int3>(32);          // Delivered < Required
        private readonly HashSet<Int3> _assigned = new HashSet<Int3>();     // lookup only
        private int _freeMaterialUnits;
        private long[] _readyTried = new long[16];
        private long[] _matTried = new long[16];
        private readonly Dictionary<Int3, long> _readyRetryAt = new Dictionary<Int3, long>(); // lookup only
        // Two writers, one map: TryClaim (no reachable material) and ProgressBuildHaul phase A (no
        // reachable SITE for a committed hauler — M2-21). Read only through Select's _needMat gate
        // and IsBackedOff; keyed Remove and TryGetValue only, never iterated (IJobSource rule 4).
        private readonly Dictionary<Int3, long> _matRetryAt = new Dictionary<Int3, long>();   // lookup only
        private readonly HashSet<uint> _matScanTried = new HashSet<uint>(); // lookup only

        public string Name => "Build";
        public JobKind[] HandledKinds => Kinds;
        public int CandidateCount => _ready.Count + _needMat.Count;

        /// <summary>
        /// <see cref="IJobSource.IsBackedOff"/> for the BUILD board — <b>and this source carries TWO
        /// backoffs for one site, which is the one place the mirror is not a copy.</b> Both are keyed
        /// on the SITE, both are what <see cref="TryClaim"/> stamps, and either one being live means
        /// the same thing to a caller: nobody managed to start work on this site recently.
        ///
        /// <para><b>THEY ARE DIFFERENT FAILURES AND THE DIFFERENCE IS RECORDED HERE RATHER THAN
        /// SMOOTHED OVER.</b> <c>_readyRetryAt</c> is the site's own approach failing — a fully
        /// supplied build whose tile no worker could path to or stand at. <c>_matRetryAt</c> has
        /// <b>TWO writers and therefore two meanings</b>, amended here by M2-21 rather than left to
        /// mislead: (a) <see cref="TryClaim"/> stamps it when <see cref="TryReserveMaterialFor"/>
        /// finds no free material stack this citizen can reach, which can fire on a site whose own
        /// approach is perfectly fine; and (b) <see cref="ProgressBuildHaul"/>'s phase A stamps it
        /// when the approach to the SITE fails for a hauler already committed to it — the case the
        /// claim path structurally cannot see, because it only ever pathfinds to the material. So a
        /// true answer here means "the crew could not get to it, OR to what it needs" — never "the
        /// tile is unreachable". Any surface built on this must say the weaker thing;
        /// <c>WireFormat.Blocked.cs</c>'s <c>ReasonUnreachable</c> is worded for exactly this, and
        /// the widening does not change what a caller is entitled to believe.</para>
        ///
        /// <para>THE LATER EXPIRY WINS when both are live, so <paramref name="untilTick"/> is the tick
        /// at which the site could next be attempted at all rather than the tick the first of two
        /// stamps lifts — the same choice <see cref="JobSystem.IsBackedOff"/> makes across sources,
        /// and made the same way in both places on purpose. Two <c>TryGetValue</c>s, no enumeration
        /// (rule 4), no allocation.</para>
        /// </summary>
        public bool IsBackedOff(Int3 pos, long tick, out long untilTick)
        {
            // `any` is tracked explicitly rather than inferred from `best != 0`. A live stamp is
            // always >= JobWork.UnreachableRetryTicks so the inference happens to hold today, and
            // "happens to hold" is how a sentinel eventually collides with a real value (the same
            // argument GameSession.NotBlocked makes about a bare -1).
            bool any = false;
            long best = 0;
            if (_readyRetryAt.TryGetValue(pos, out long ready) && tick < ready) { any = true; best = ready; }
            if (_matRetryAt.TryGetValue(pos, out long mat) && tick < mat && (!any || mat > best)) { any = true; best = mat; }
            untilTick = any ? best : 0;
            return any;
        }

        /// <summary>Resolve the optional BuildSystem once. Must happen before any progress pass,
        /// not merely before a rescan: a citizen can be mid-job on a tick where nothing is
        /// dirty.</summary>
        public void BeginTick(Simulation sim)
        {
            if (_buildResolved) return;
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is BuildSystem b) { _build = b; break; }
            _buildResolved = true;
        }

        // ------------------------------------------------------------------ board

        public void Rescan(Simulation sim, JobContext ctx, JobBoardDirty what)
        {
            // (1) Sites already claimed, re-derived from citizen state in store order: a citizen
            // hauling to OR building a site stores that site as JobTarget, so one pass covers both.
            // ALWAYS run — cheap (O crew), no separable flag, and the reason an abandon that sets
            // only JobBoardDirty.Citizens still frees its site here. See IJobSource.Rescan.
            _assigned.Clear();
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;
                if (c.JobKind == JobKind.HaulToBuild || c.JobKind == JobKind.Build)
                    _assigned.Add(c.JobTarget);
            }

            // (2) The ready / needs-material split derives from the pending list only, so rebuild it
            // when a site changed (designate/deposit/cancel/complete all set Sites). Skipping on a
            // non-Sites rescan leaves _ready/_needMat — and CandidateCount — at their prior value,
            // correct because no pending entry moved.
            if ((what & JobBoardDirty.Sites) != 0)
            {
                _ready.Clear();
                _needMat.Clear();
                if (_build != null)
                {
                    var pend = _build.Pending;
                    for (int i = 0; i < pend.Count; i++)
                    {
                        if (BuildSystem.IsReady(pend[i])) _ready.Add(pend[i].Pos);
                        else _needMat.Add(pend[i].Pos);
                    }
                }
            }

            // (3) The free-material COUNT derives from the item store, gated by whether any site
            // wants material. Recompute when the item pool changed (Items) OR the needs-material set
            // was just rebuilt (Sites) — either can invalidate it, and both together must never
            // desync. On a Tiles/Citizens-only rescan it is left at its live value, which the
            // OnGroundItemReserved decrements keep equal to a fresh scan as long as no item was
            // added or removed — and Items-not-set is exactly that guarantee.
            if ((what & (JobBoardDirty.Items | JobBoardDirty.Sites)) != 0)
            {
                _freeMaterialUnits = 0;
                if (_build != null && _needMat.Count > 0)
                {
                    var items = sim.Items.Items;
                    for (int i = 0; i < items.Count; i++)
                    {
                        var it = items[i];
                        if (it.Kind == BuildSystem.Material && it.CarriedBy == 0 && it.ReservedBy == 0)
                            _freeMaterialUnits += it.Count;
                    }
                }
            }

            JobWork.EnsureSize(ref _readyTried, _ready.Count);
            JobWork.EnsureSize(ref _matTried, _needMat.Count);
        }

        public void OnGroundItemReserved(Simulation sim, ItemStack item)
        {
            if (item.Kind != BuildSystem.Material) return;
            _freeMaterialUnits -= item.Count;
            if (_freeMaterialUnits < 0) _freeMaterialUnits = 0;
        }

        // ------------------------------------------------------------- assignment

        public int Select(Simulation sim, Citizen citizen, int bestDist, long gen, out int dist)
        {
            int best = -1;
            dist = bestDist;

            // Ready-to-build sites (materialed): distance to the site itself.
            for (int i = 0; i < _ready.Count; i++)
            {
                if (_readyTried[i] == gen) continue;
                var p = _ready[i];
                if (_readyRetryAt.TryGetValue(p, out long r) && sim.TickCount < r)
                {
                    _readyTried[i] = gen;
                    continue;
                }
                if (_assigned.Contains(p) || _build == null ||
                    !_build.TryGet(p, out var b) || !BuildSystem.IsReady(b))
                {
                    _readyTried[i] = gen;
                    continue;
                }
                int d = Int3.Manhattan(citizen.Pos, p);
                if (d < dist)
                {
                    dist = d;
                    best = i;
                }
            }

            // Sites still wanting material: only worth pursuing if enough free material exists to
            // FINISH this site (a partially materialed site is a dead site).
            if (_freeMaterialUnits > 0)
            {
                for (int i = 0; i < _needMat.Count; i++)
                {
                    if (_matTried[i] == gen) continue;
                    var p = _needMat[i];
                    if (_matRetryAt.TryGetValue(p, out long r) && sim.TickCount < r)
                    {
                        _matTried[i] = gen;
                        continue;
                    }
                    if (_assigned.Contains(p) || _build == null ||
                        !_build.TryGet(p, out var b) || !BuildSystem.NeedsMaterial(b) ||
                        _freeMaterialUnits < b.Required - b.Delivered)
                    {
                        _matTried[i] = gen;
                        continue;
                    }
                    int d = Int3.Manhattan(citizen.Pos, p);
                    if (d < dist)
                    {
                        dist = d;
                        best = _ready.Count + i;
                    }
                }
            }

            return best;
        }

        public bool TryClaim(Simulation sim, Citizen citizen, int candidate, long gen, JobContext ctx)
        {
            if (candidate < _ready.Count)
            {
                var target = _ready[candidate];
                if (JobWork.TryPathToAdjacent(sim, citizen, target) &&
                    _build.TryGet(target, out var b))
                {
                    citizen.JobKind = JobKind.Build;
                    citizen.JobTarget = target;
                    // M3-7 — WHO is building decides how long it takes; `b.WorkTicks` stays the
                    // def-frozen UNSKILLED cost and the seam scales it for this crew member. One
                    // seam, no level named in an economy file (see WorkRates' class doc). An
                    // untrained builder gets b.WorkTicks EXACTLY.
                    citizen.JobWorkTicks = WorkRates.WorkTicksFor(citizen, WorkType.Construct, b.WorkTicks);
                    _assigned.Add(target);
                    _readyRetryAt.Remove(target);
                    return true;
                }
                _readyTried[candidate] = gen; // unreachable — the dispatcher tries next-nearest
                _readyRetryAt[target] = sim.TickCount + JobWork.UnreachableRetryTicks;
                return false;
            }

            int idx = candidate - _ready.Count;
            var site = _needMat[idx];
            if (TryReserveMaterialFor(sim, citizen, site, ctx))
            {
                _assigned.Add(site);   // one hauler per site at a time
                _matRetryAt.Remove(site);
                return true;
            }
            _matTried[idx] = gen;      // no reachable material — try next-nearest
            _matRetryAt[site] = sim.TickCount + JobWork.UnreachableRetryTicks;
            return false;
        }

        /// <summary>
        /// Reserve the nearest reachable free material stack for a site and start the citizen
        /// toward it as a <see cref="JobKind.HaulToBuild"/> job. The SITE is stored as JobTarget
        /// from the outset (so the reservation derives from citizen state); the reserved stack is
        /// remembered via <see cref="Citizen.ReservedItemId"/> and the citizen paths to it first,
        /// then to the site (chosen in the progress pass). Returns false when no reachable
        /// material exists (the caller backs the site off).
        ///
        /// Uses its own <c>_matScanTried</c> stamp set rather than the enclosing selection pass's
        /// generation, so the dispatcher's tried-stamps stay valid across this nested search.
        /// Scan order: item entity store order.
        /// </summary>
        private bool TryReserveMaterialFor(Simulation sim, Citizen citizen, Int3 site, JobContext ctx)
        {
            var items = sim.Items.Items;

            while (true)
            {
                int best = -1, bestDist = int.MaxValue;
                for (int i = 0; i < items.Count; i++)
                {
                    var it = items[i];
                    if (it.Kind != BuildSystem.Material || it.CarriedBy != 0 || it.ReservedBy != 0) continue;
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
                    // The stack leaves the free pool immediately, so a second site in the SAME
                    // pass cannot be promised the same units (the board is only rescanned on
                    // JobsDirty). Deliberately conservative: a surplus that gets dropped back
                    // reappears on the next rescan.
                    ctx.ReserveGroundItem(sim, citizen, item);
                    _matScanTried.Clear();
                    return true;
                }
                _matScanTried.Add(item.Id); // unreachable material — try the next-nearest stack
            }
        }

        // --------------------------------------------------------------- progress

        public void Progress(Simulation sim, Citizen citizen, JobContext ctx)
        {
            if (citizen.JobKind == JobKind.HaulToBuild) ProgressBuildHaul(sim, citizen);
            else ProgressBuild(sim, citizen);
        }

        /// <summary>
        /// Drive a <see cref="JobKind.HaulToBuild"/> job. Two hops on one JobTarget (always the
        /// SITE): phase A carries nothing and travels to the reserved material stack; phase B
        /// carries that stack to the site and deposits it. Any lost site / material releases
        /// cleanly (reservation dropped, cargo set down where it stands) and the rescan retries —
        /// mirroring the pickup/deliver reservation discipline exactly.
        ///
        /// <para>⭐ <b>PHASE A IS A SECOND WRITER OF <c>_matRetryAt</c> (M2-21)</b>, because it asks a
        /// question <see cref="TryClaim"/> never asked: can a worker reach the SITE. Read the comment
        /// at that exit — it is the seam of the original 480 000-tick livelock.</para>
        ///
        /// <para><b>PHASE B'S "path lost before reaching the site" EXIT STAMPS NOTHING, AND THAT IS
        /// SAFE ONLY BECAUSE PHASE A NOW DOES.</b> Stated rather than left as a hole a census would
        /// have to re-find: a door shutting mid-carry drops the stack where the hauler stands, and
        /// the re-claim then reserves that same stack (it is underfoot, so trivially reachable) and
        /// falls into phase A on the following tick, which refuses the approach and stamps. So the
        /// unstamped phase-B exit costs one extra tick and cannot loop. Before M2-21 it fed straight
        /// into the same unbounded churn.</para>
        /// </summary>
        private void ProgressBuildHaul(Simulation sim, Citizen citizen)
        {
            Int3 site = citizen.JobTarget;

            // Site gone (cancelled) or already satisfied? Release and abandon.
            if (_build == null || !_build.TryGet(site, out var b) || BuildSystem.IsReady(b))
            {
                DropOrReleaseBuildCargo(sim, citizen);
                JobWork.AbandonJob(sim, citizen);
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
                    if (mat != null && mat.CarriedBy == 0 && mat.ReservedBy == citizen.Id) mat.ReservedBy = 0;
                    citizen.ReservedItemId = 0;
                    JobWork.AbandonJob(sim, citizen);
                    return;
                }

                // Pick the site approach before committing carry state, so a failure leaves the
                // world as it was (minus the released reservation).
                if (!JobWork.TryPathToAdjacent(sim, citizen, site))
                {
                    // ⭐ M2-21 — THE STAMP THAT WAS MISSING, AND WHY IT HAS TO BE HERE AND NOT AT
                    // THE CLAIM. This is the ORIGINAL 480 000-tick livelock, measured on a build
                    // order behind a shut door at 3 000 ticks / 2 999 abandons / ZERO stamps.
                    //
                    // THE ASYMMETRY. TryClaim reaches this site through TryReserveMaterialFor,
                    // which pathfinds citizen → MATERIAL and never citizen → SITE. So on a ship
                    // where the material is reachable and the site is not, the claim SUCCEEDS
                    // (and, worse, its success path REMOVES any stamp this site was carrying) and
                    // the refusal happens here, one hop later, in a progress pass. Stamping at the
                    // claim is therefore not stamping in progress: the claim never asks this
                    // question. Without a stamp here the site is re-offered on the very next tick,
                    // at the board's full rate, forever, and no surface says anything at all.
                    //
                    // WHY _matRetryAt AND NOT _readyRetryAt. Select gates the two boards on two
                    // different maps, and a site whose Delivered < Required is on _needMat, which
                    // reads _matRetryAt (:205). A stamp in _readyRetryAt would be a write nothing
                    // reads while this site is still hungry — a fix that measures as a no-op.
                    // ⛔ AND IT MUST NOT BE A THIRD MAP OR A NEW PREDICATE: IsBackedOff above is
                    // "THE ONE DEFINITION OF 'BACKED OFF'" mirrored from HaulJobSource by M1-D,
                    // and the blocked channel's ReasonUnreachable is that one query fanned out.
                    // A private third carrier would be invisible to the surface built to explain
                    // exactly this silence.
                    //
                    // ⚠️ IT WIDENS WHAT _matRetryAt MEANS, and the doc on IsBackedOff is amended
                    // to say so rather than left to mislead: this carrier now also holds "the
                    // approach to the site failed while a hauler was already committed to it".
                    // Both meanings collapse to the one thing a caller may believe — nobody
                    // managed to start work on this site recently — which is why widening it is
                    // honest and a second map would not have been.
                    //
                    // ⭐ THE LATCH — WHICH SIDE THIS PACKAGE TAKES, IN WRITING (charter mutation 4).
                    // The stamp lives 50 ticks and IsBackedOff is cleared wholesale on a tile-board
                    // rebuild, so on a one-pawn ship the raw predicate can blink out. THIS PACKAGE
                    // ADDS NO LATCH AND CHANGES NONE: it takes the SIM side only. M1-D already
                    // decided this question and latched in the HOST (GameSession._latched, "THE
                    // REACH LATCH"), holding the badge across the expiry and clearing it on the
                    // TRUE event — a crew member holding a job on the tile. That latch covers this
                    // stamp the moment it exists, because it is keyed on the site and asks the
                    // fanned-out query, not on which carrier stamped. The residual flicker (the
                    // badge drops for the one or two ticks of each 50-tick re-probe, while the
                    // pawn genuinely does hold the job again) is M1-D's deliberate clear-on-success
                    // and is left exactly as it is. Adding a sim-side latch here would be a SECOND
                    // definition of "still blocked" in a different layer, which is the drift
                    // WireFormat.Blocked.cs argues against by name.
                    _matRetryAt[site] = sim.TickCount + JobWork.UnreachableRetryTicks;
                    if (mat.ReservedBy == citizen.Id) mat.ReservedBy = 0;
                    citizen.ReservedItemId = 0;
                    JobWork.AbandonJob(sim, citizen);
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
                JobWork.AbandonJob(sim, citizen);
                return;
            }

            carried.Pos = citizen.Pos; // rides along every tick

            if (citizen.HasPath) return;

            if (!Int3.IsAdjacent4(citizen.Pos, site))
            {
                // Path lost before reaching the site — drop the stack where we stand.
                carried.CarriedBy = 0;
                carried.ReservedBy = 0; // carried by us — our claim to clear
                citizen.CarryingItemId = 0;
                JobWork.AbandonJob(sim, citizen);
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
                carried.ReservedBy = 0;       // carried by us — our claim to clear
                carried.Pos = citizen.Pos;    // leftover drops at the site, re-enters the pool
            }
            citizen.CarryingItemId = 0;
            citizen.JobKind = JobKind.None;
            // The carried stack was consumed into the site or a leftover dropped (Items); the site's
            // Delivered changed inside BuildSystem.Deposit, which sets Sites itself.
            sim.JobsDirty |= JobBoardDirty.Items;
        }

        /// <summary>
        /// Drive a <see cref="JobKind.Build"/> job (mirrors the dig progress pass): the site must
        /// still be pending and materialed; on the final work tick the build completes through
        /// <see cref="BuildSystem.Complete"/> (wall seal + reflood, or door spawn) which publishes
        /// <see cref="ConstructionCompletedEvent"/> exactly once.
        /// </summary>
        private void ProgressBuild(Simulation sim, Citizen citizen)
        {
            Int3 target = citizen.JobTarget;

            if (_build == null || !_build.TryGet(target, out var b) || !BuildSystem.IsReady(b))
            {
                JobWork.AbandonJob(sim, citizen); // cancelled or material refunded out from under us
                return;
            }

            if (citizen.HasPath) return; // still traveling

            if (!Int3.IsAdjacent4(citizen.Pos, target))
            {
                JobWork.AbandonJob(sim, citizen); // path lost — rescan retries
                return;
            }

            if (--citizen.JobWorkTicks > 0) return;

            _build.Complete(sim, target, citizen.Id); // world write + event + JobsDirty (Sites|Tiles)
            citizen.JobKind = JobKind.None;
            citizen.JobWorkTicks = 0;
            sim.JobsDirty |= JobBoardDirty.Citizens; // the builder freed itself; Complete set Sites|Tiles
        }

        /// <summary>Release whatever a build-haul citizen holds when its site disappears: a
        /// reserved-but-not-picked stack is unreserved; carried cargo is set down.</summary>
        private static void DropOrReleaseBuildCargo(Simulation sim, Citizen citizen)
        {
            if (citizen.CarryingItemId != 0)
            {
                if (sim.Items.TryGet(citizen.CarryingItemId, out var carried) && carried.CarriedBy == citizen.Id)
                {
                    carried.Pos = citizen.Pos;
                    carried.CarriedBy = 0;
                    carried.ReservedBy = 0; // carried by us — our claim to clear
                }
                citizen.CarryingItemId = 0;
            }
            else if (citizen.ReservedItemId != 0)
            {
                if (sim.Items.TryGet(citizen.ReservedItemId, out var reserved) &&
                    reserved.CarriedBy == 0 && reserved.ReservedBy == citizen.Id)
                    reserved.ReservedBy = 0;
                citizen.ReservedItemId = 0;
            }
        }
    }
}
