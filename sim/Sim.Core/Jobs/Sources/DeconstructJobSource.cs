using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// DECONSTRUCT (E0-5): tear down a designated wall, or pull a designated device.
    /// <see cref="BuildJobSource"/>'s mirror and <see cref="DigJobSource"/>'s twin — one board,
    /// one kind, a work countdown that ends in a world write.
    ///
    /// ONE JobKind FOR BOTH TARGETS. A wall strip and a device strip differ only in what
    /// <see cref="DeconstructSystem.Complete"/> does at the end and in the def-frozen work budget;
    /// splitting them would have bought a second <see cref="JobKind"/>, a second board, a second
    /// tie-break slot in the dispatcher's registration order, and a second entry in every
    /// exhaustive label switch, to express a difference the citizen does not experience.
    ///
    /// BOARD ORDER: the pending sites of <see cref="DeconstructSystem"/>, copied in that
    /// registry's canonical PACKED-POSITION order (z,y,x by construction — <c>Pack</c> puts x in
    /// the low bits, then y, then z). Deliberately NOT an <see cref="IJobTileScanner"/>: the board
    /// is registry-derived, not tile-derived, so this source adds no private world scan and does
    /// not join the dispatcher's tile pass — the same shape as <see cref="BuildJobSource"/>.
    /// Rebuilt only on <see cref="JobBoardDirty.Sites"/>; on any other axis the prior board — and
    /// therefore <see cref="CandidateCount"/>, which is BEHAVIOUR — stays correct because no
    /// pending entry moved.
    ///
    /// RESERVATIONS are not stored: they are re-derived every rescan from the citizens currently
    /// on a <see cref="JobKind.Deconstruct"/> job, so a save needs nothing from this class and a
    /// pre-empted worker (E0-2's <c>SafetySystem</c> flee, a player move order, death) frees its
    /// site automatically on the next rescan. A deconstruct holds NO item reservation and NO
    /// cargo, so <c>Simulation.CancelJob</c> needs no deconstruct branch — proven, not assumed, by
    /// <c>DeconstructSystemTests.FleePreemptionMidStrip_LeavesTheSiteReclaimable_AndLeaksNothing</c>.
    ///
    /// <see cref="DeconstructSystem"/> is an OPTIONAL stack member, resolved lazily once. When
    /// absent the whole source is inert (the board stays empty and every progress path releases),
    /// so a deconstruct-free stack behaves and hashes exactly as it did before E0-5.
    /// </summary>
    public sealed class DeconstructJobSource : IJobSource
    {
        private static readonly JobKind[] Kinds = { JobKind.Deconstruct };

        private DeconstructSystem _strip;
        private bool _stripResolved;

        private readonly List<Int3> _sites = new List<Int3>(32);          // registry order
        private readonly HashSet<Int3> _assigned = new HashSet<Int3>();   // lookup only, never iterated
        private long[] _tried = new long[16];
        private readonly Dictionary<Int3, long> _retryAt = new Dictionary<Int3, long>(); // lookup only

        public string Name => "Deconstruct";
        public JobKind[] HandledKinds => Kinds;
        public int CandidateCount => _sites.Count;

        /// <summary>Resolve the optional DeconstructSystem once. Must happen before any progress
        /// pass, not merely before a rescan: a citizen can be mid-job on a tick where nothing is
        /// dirty (the <see cref="BuildJobSource"/> precedent).</summary>
        public void BeginTick(Simulation sim)
        {
            if (_stripResolved) return;
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is DeconstructSystem d) { _strip = d; break; }
            _stripResolved = true;
        }

        // ------------------------------------------------------------------ board

        public void Rescan(Simulation sim, JobContext ctx, JobBoardDirty what)
        {
            // (1) Sites already claimed, re-derived from citizen state in store order. ALWAYS run —
            // cheap (O crew), no separable flag, and the reason an abandon that sets only
            // JobBoardDirty.Citizens still frees its site here. See IJobSource.Rescan.
            _assigned.Clear();
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;
                if (c.JobKind == JobKind.Deconstruct) _assigned.Add(c.JobTarget);
            }

            // (2) The site board derives from the pending list only (designate/cancel/complete all
            // set Sites). Skipping on a non-Sites rescan leaves _sites — and CandidateCount — at
            // their prior value, correct because no pending entry moved.
            if ((what & JobBoardDirty.Sites) != 0)
            {
                _sites.Clear();
                if (_strip != null)
                {
                    var pend = _strip.Pending;
                    // EVERY kind, walls and devices alike (WP-2). The per-kind validity check
                    // lives in Select/Progress via DeconstructSystem.TargetStillExists, so the
                    // board and the registry can never disagree about what is still tearable.
                    for (int i = 0; i < pend.Count; i++) _sites.Add(pend[i].Pos);
                }
            }

            JobWork.EnsureSize(ref _tried, _sites.Count);
        }

        public void OnGroundItemReserved(Simulation sim, ItemStack item) { }

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
                if (_assigned.Contains(p) || _strip == null ||
                    !_strip.TryGet(p, out var s) ||
                    !DeconstructSystem.TargetStillExists(sim, s))
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
            if (_strip != null && _strip.TryGet(target, out var site) &&
                JobWork.TryPathToAdjacent(sim, citizen, target))
            {
                citizen.JobKind = JobKind.Deconstruct;
                citizen.JobTarget = target;
                citizen.JobWorkTicks = site.WorkTicks; // def-frozen at designate
                _assigned.Add(target);
                _retryAt.Remove(target);
                return true;
            }
            _tried[candidate] = gen; // unreachable from here — the dispatcher tries next-nearest
            _retryAt[target] = sim.TickCount + JobWork.UnreachableRetryTicks;
            return false;
        }

        // --------------------------------------------------------------- progress

        public void Progress(Simulation sim, Citizen citizen, JobContext ctx)
        {
            var target = citizen.JobTarget;

            // Designation cancelled, or the target went away under us (another worker, a dig, a
            // MOSS tile write, a RemoveDeviceCommand) — drop the job. Nothing to release: a
            // deconstruct carries no cargo and reserves no stack.
            //
            // The now-dead SITE is not this method's to remove: DeconstructSystem.Reap owns that,
            // runs every tick, and covers the case no abandon can reach (a site nobody ever
            // claimed). WP-1 left the site here AND had no reap, which is how a removed wall
            // leaked a permanent zombie designation — see DeconstructSystem.Reap.
            if (_strip == null || !_strip.TryGet(target, out var site) ||
                !DeconstructSystem.TargetStillExists(sim, site))
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

            // Strip complete: the registry owns the world write, the room merge / device removal
            // and the yield — and re-validates on arrival (a wall that became hull mid-job, a
            // device removed by another path) so an unsatisfiable site is consumed without a
            // world change instead of looping forever.
            _strip.Complete(sim, target, citizen.Id);
            citizen.JobKind = JobKind.None;
            citizen.JobWorkTicks = 0;
            sim.JobsDirty |= JobBoardDirty.Citizens; // the worker freed itself; Complete set Sites|Tiles
        }
    }
}
