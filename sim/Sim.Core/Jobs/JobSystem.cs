using System;

namespace Perilune.Sim
{
    /// <summary>
    /// M2 labor: the JOB DISPATCHER. Registered after <see cref="CitizenSystem"/> — movement
    /// already happened this tick; this system offers work to idle citizens, advances the ones
    /// already working, and does neither itself: every job KIND lives behind
    /// <see cref="IJobSource"/> (dig, haul, build).
    ///
    /// This file is INTEGRATOR-OWNED and deliberately small. It owns exactly four things, and
    /// each of them is behaviour that a provider must not be able to change on its own:
    ///
    ///   1. **The tick loop and the citizen order** — citizens in entity store order, one pass,
    ///      idle ones offered work, working ones advanced by whichever source owns their kind.
    ///   2. **The source registration order**, which IS the cross-kind priority (below).
    ///   3. **The arbitration**: one global nearest-job argmin across all sources, strict
    ///      <c>&lt;</c> throughout, so an exact distance tie falls to registration order.
    ///   4. **The retry policy**: a claim that fails re-runs the whole selection for the same
    ///      citizen, and terminates because the source stamped the candidate it just refused.
    ///
    /// THE SOURCE PRIORITY ORDER — Dig, then Haul, then Build — is not a preference, it is a
    /// tie-break, and it was read verbatim off the pre-split <c>TryAssign</c>, whose four inline
    /// candidate scans shared one <c>bestDist</c> in exactly that sequence (dig sites, haul
    /// items, ready-to-build sites, sites wanting material). The trailing <c>if/else if</c> chain
    /// there looked like a priority ladder but was not: each scan nulled the others when it won,
    /// so only one branch was ever live. <c>JobDispatchTests</c> pins the order behaviourally.
    ///
    /// The board (dig sites, haul candidates, stockpile tiles, build sites) is purely derived
    /// state: rebuilt from the world + entity stores whenever <see cref="Simulation.JobsDirty"/>
    /// is set, never serialized. Per-citizen job progress lives on the citizen itself
    /// (JobKind/JobTarget/JobWorkTicks/CarryingItemId), so saves need nothing from this class or
    /// from any source.
    ///
    /// Determinism: world scans in z,y,x order, citizens/items iterated in store order,
    /// HashSets/Dictionaries used for O(1) lookups only (never iterated), no RNG, no LINQ, no
    /// lambdas. Steady state (no designations, no haulable items) does not allocate.
    /// </summary>
    public sealed class JobSystem : ISimSystem
    {
        public string Name => "Jobs";
        public int IntervalTicks => 1;

        /// <summary>Work ticks to dig one rock tile. Retained here because the LLM effect
        /// pipeline (<c>EffectValidator</c>) sets it when the model grants a dig.</summary>
        public const int DigWorkTicks = DigJobSource.DigWorkTicks;

        private static readonly int KindCount = Enum.GetValues(typeof(JobKind)).Length;

        private readonly IJobSource[] _sources;
        private readonly IJobTileScanner[] _tileScanners; // the subset that wants the world pass
        private readonly IJobSource[] _byKind;            // JobKind → owning source (null = not ours)
        private readonly JobContext _ctx;

        /// <summary>
        /// THE REGISTRATION. Adding a job kind is one new file plus one line here — and the line's
        /// POSITION is behaviour, because it is the tie-break at equal distance. A new source
        /// appended at the end loses every tie to the shipped three, which is the safe default;
        /// inserting one earlier is a deliberate priority decision and moves the pinned assignment
        /// sequence in <c>JobDispatchTests</c>.
        /// </summary>
        public static IJobSource[] DefaultSources() => new IJobSource[]
        {
            new DigJobSource(),
            new HaulJobSource(),
            new BuildJobSource(),
        };

        public JobSystem() : this(DefaultSources()) { }

        /// <summary>Construct over an explicit source set. For tests and for hosts that want a
        /// reduced stack; the shipped stack always uses <see cref="DefaultSources"/>.</summary>
        public JobSystem(IJobSource[] sources)
        {
            if (sources == null) throw new ArgumentNullException(nameof(sources));
            _sources = sources;
            _ctx = new JobContext(_sources);
            _byKind = new IJobSource[KindCount];

            int scanners = 0;
            for (int i = 0; i < _sources.Length; i++) if (_sources[i] is IJobTileScanner) scanners++;
            _tileScanners = new IJobTileScanner[scanners];
            int next = 0;
            for (int i = 0; i < _sources.Length; i++)
            {
                var src = _sources[i];
                if (src is IJobTileScanner ts) _tileScanners[next++] = ts;
                var kinds = src.HandledKinds;
                for (int k = 0; k < kinds.Length; k++)
                {
                    int slot = (int)kinds[k];
                    if (_byKind[slot] != null)
                        throw new InvalidOperationException(
                            $"job kind {kinds[k]} claimed by both '{_byKind[slot].Name}' and '{src.Name}'");
                    _byKind[slot] = src;
                }
            }
        }

        /// <summary>The registered sources, in registration order. Read-only; not a tick path.</summary>
        public System.Collections.Generic.IReadOnlyList<IJobSource> Sources => _sources;

        public void Tick(Simulation sim)
        {
            for (int s = 0; s < _sources.Length; s++) _sources[s].BeginTick(sim);

            // Terrain edits (SetTileCommand, MOSS effects, …) publish TileChangedEvent but don't
            // all set JobsDirty themselves — treat any tile change from the previous tick as
            // board-dirtying. Cheap, and keeps the board honest.
            if (sim.Events.Read<TileChangedEvent>().Length > 0) sim.JobsDirty = true;
            if (sim.JobsDirty) Rescan(sim);

            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                if (citizen.JobKind == JobKind.None)
                {
                    if (citizen.IsIdleForWork) TryAssign(sim, citizen); // held citizens never self-assign
                    continue;
                }
                var owner = _byKind[(int)citizen.JobKind];
                owner?.Progress(sim, citizen, _ctx); // null = another system's kind (Eat/Craft/…)
            }
        }

        // ------------------------------------------------------------------ board

        /// <summary>
        /// Rebuild every source's board: ONE z,y,x world pass shared by the tile-derived boards
        /// (dig sites, stockpile zones), then each source's own derivation, in registration order.
        /// Sources derive independently — no board may read another's — so the order is for
        /// determinism of declaration, not correctness.
        /// </summary>
        private void Rescan(Simulation sim)
        {
            sim.JobsDirty = false;

            if (_tileScanners.Length > 0)
            {
                for (int s = 0; s < _tileScanners.Length; s++) _tileScanners[s].BeginTileScan(sim);

                var world = sim.World;
                for (int z = 0; z < world.Depth; z++)
                {
                    var level = world.Levels[z];
                    for (int y = 0; y < world.Height; y++)
                    {
                        int row = y * world.Width;
                        for (int x = 0; x < world.Width; x++)
                        {
                            int idx = row + x;
                            var pos = new Int3(x, y, z);
                            for (int s = 0; s < _tileScanners.Length; s++)
                                _tileScanners[s].VisitTile(sim, pos, level.Flags[idx], level.Wall[idx], level.Floor[idx]);
                        }
                    }
                }
            }

            for (int s = 0; s < _sources.Length; s++) _sources[s].Rescan(sim, _ctx);
        }

        // ------------------------------------------------------------- assignment

        /// <summary>
        /// Offer <paramref name="citizen"/> the nearest available job across every source
        /// (Manhattan; ties resolve to registration order, then to the source's own board order)
        /// and let that source try to commit it. A source that cannot commit stamps the candidate
        /// and the next-nearest is tried, so the loop always terminates. Unreachable candidates
        /// stay on their board and are simply retried on later ticks — a terrain change can make
        /// them viable.
        /// </summary>
        private void TryAssign(Simulation sim, Citizen citizen)
        {
            bool any = false;
            for (int s = 0; s < _sources.Length; s++) if (_sources[s].HasCandidates) { any = true; break; }
            if (!any) return; // nothing on any board: leave the citizen (and his path) untouched

            long gen = _ctx.NextGen();

            while (true)
            {
                int bestSource = -1, bestCandidate = -1, bestDist = int.MaxValue;
                for (int s = 0; s < _sources.Length; s++)
                {
                    int cand = _sources[s].Select(sim, citizen, bestDist, gen, out int d);
                    if (cand < 0) continue; // nothing strictly nearer than what we already hold
                    bestDist = d;
                    bestSource = s;
                    bestCandidate = cand;
                }

                if (bestSource < 0)
                {
                    citizen.ClearPath(); // normalize after any failed FindPath attempts
                    return;
                }

                if (_sources[bestSource].TryClaim(sim, citizen, bestCandidate, gen, _ctx)) return;
            }
        }
    }
}
