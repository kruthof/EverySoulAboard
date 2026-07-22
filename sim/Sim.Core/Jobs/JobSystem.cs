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
    ///      <c>&lt;</c> throughout, so an exact distance tie falls to registration order. The
    ///      running minimum is threaded through the providers, so it is ENFORCED here rather than
    ///      trusted — a source reporting a non-improving distance is declined, not obeyed.
    ///   4. **The retry policy**, and its bound: a claim that fails re-runs the whole selection
    ///      for the same citizen, and terminates because the source stamped the candidate it just
    ///      refused. A source that forgets to stamp would spin forever with no exception and no
    ///      log — a hung game — so the pass is capped at the total candidate count and throws
    ///      naming the offender instead.
    ///
    /// The last two exist because this is the only file in the job system the integrator reviews.
    /// Everything a provider can get wrong that would corrupt or hang the whole dispatcher is
    /// caught here, by design.
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
                // THREE different things land on a null owner, and only one of them is fine:
                //   (a) a kind this dispatcher legitimately does not drive — Eat/Drink
                //       (SustenanceSystem), Craft (CraftingSystem), Maintain (MaintenanceSystem).
                //       Normal, and exactly what the pre-split switch's missing `default:` did.
                //   (b) an out-of-range byte: JobKind comes back off disk unvalidated
                //       (SaveReader.cs:254). The bounds check keeps the old switch's behaviour —
                //       ignore it — where a bare _byKind[k] would throw on a corrupt save.
                //   (c) a REGISTRATION BUG: a kind no source claimed. Silently swallowed here, and
                //       it strands every citizen in that kind forever with nothing advancing them.
                // (c) is indistinguishable from (a) at runtime — JobKind is a flat enum with no
                // ownership metadata — so it is caught at construction (the duplicate-claim throw)
                // and by JobDispatchTests' coverage assertion, never by this line.
                int kind = (int)citizen.JobKind;
                var owner = kind >= 0 && kind < _byKind.Length ? _byKind[kind] : null;
                owner?.Progress(sim, citizen, _ctx);
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
        ///
        /// NO RESCAN MAY HAPPEN INSIDE THIS METHOD. Board indices returned by
        /// <see cref="IJobSource.Select"/> are consumed by <see cref="IJobSource.TryClaim"/>
        /// unvalidated, and the generation stamps are indexed by board position — a source that
        /// rebuilt its board mid-pass would hand the dispatcher a stale index. The dispatcher
        /// enforces this by never setting <see cref="Simulation.JobsDirty"/> here and by rescanning
        /// only at the top of <see cref="Tick"/>; a source must honour the same rule.
        /// </summary>
        private void TryAssign(Simulation sim, Citizen citizen)
        {
            // Also the loop bound: every failed claim consumes at least one candidate (the source
            // must stamp what it refused), so the pass can iterate at most once per candidate plus
            // one final look that finds nothing.
            int candidates = 0;
            for (int s = 0; s < _sources.Length; s++) candidates += _sources[s].CandidateCount;
            if (candidates == 0) return; // nothing on any board: leave the citizen (and his path) untouched

            long gen = _ctx.NextGen();
            IJobSource lastRefusal = null;

            for (int attempt = 0; attempt <= candidates; attempt++)
            {
                int bestSource = -1, bestCandidate = -1, bestDist = int.MaxValue;
                for (int s = 0; s < _sources.Length; s++)
                {
                    int cand = _sources[s].Select(sim, citizen, bestDist, gen, out int d);
                    // `d >= bestDist` is not paranoia about our own three sources: the argmin is a
                    // running minimum threaded THROUGH the providers, so one source reporting a
                    // worse distance would RAISE the bar and silently corrupt the filtering of every
                    // source after it. Enforced here rather than trusted, because the dispatcher is
                    // the only file the integrator reviews.
                    if (cand < 0 || d >= bestDist) continue;
                    bestDist = d;
                    bestSource = s;
                    bestCandidate = cand;
                }

                if (bestSource < 0)
                {
                    citizen.ClearPath(); // normalize after any failed FindPath attempts
                    return;
                }

                lastRefusal = _sources[bestSource];
                if (lastRefusal.TryClaim(sim, citizen, bestCandidate, gen, _ctx)) return;
            }

            // Unreachable with a conforming source. A source that refuses a candidate without
            // stamping it (and without a backoff) re-offers it forever: measured, that is a
            // SILENT HANG — no exception, no log, the sim just stops advancing. Fail loudly and
            // name the culprit instead; this is the one place that can defend against a provider.
            throw new InvalidOperationException(
                $"job source '{lastRefusal.Name}' refused a candidate {candidates + 1} times without " +
                "stamping it for this pass or recording a retry backoff — see IJobSource.TryClaim");
        }
    }
}
