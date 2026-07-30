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
    public sealed class JobSystem : ISimSystem, IWorkOfferSource
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
        /// M2-2 (G1) — the set of <see cref="WorkType"/>s each source can hand out, one bit per
        /// type, built ONCE at registration from <see cref="IJobSource.HandledKinds"/> exactly as
        /// <see cref="_byKind"/> is. A zero mask means "this source hands out no work the player can
        /// switch off" and is never vetoed (<see cref="WorkTypeMap.MaskOfKinds"/>).
        ///
        /// <para><b>Why the gate is per SOURCE and not per KIND.</b> The dispatcher never sees a
        /// kind before the claim — <see cref="IJobSource.Select"/> returns an opaque index the
        /// source alone decodes, and the kind is only written inside
        /// <see cref="IJobSource.TryClaim"/>. The last point at which the dispatcher can refuse
        /// WITHOUT reaching into a source is therefore the source itself, and that is exactly as
        /// precise as a per-kind gate for as long as every source spans ONE work type — which every
        /// shipped source does, and which <c>WorkTypeVetoTests.EverySource_SpansExactlyOneWorkType</c>
        /// pins. ⚠️ A future source spanning two (say a hauler that also builds) would be offered
        /// whenever EITHER type is on and could then claim the other; that lane must split the
        /// source or push the gate into <c>TryClaim</c>, and the pinning test says so in its
        /// failure message rather than leaving it to be discovered.</para>
        /// </summary>
        private readonly byte[] _sourceWorkMask;

        /// <summary>M2-5: the OR of <see cref="_sourceWorkMask"/> — every work type this dispatcher
        /// can hand out, built once at registration. It is <see cref="OfferedWorkTypes"/>, i.e. what
        /// <see cref="WorkArbiter"/> uses to decide whether to ask this dispatcher about a type at
        /// all.</summary>
        private byte _allSourceWorkMask;

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
            // E0-5 appended LAST on purpose: at an exact distance tie deconstruct loses to dig,
            // haul and build, which is the safe default this doc comment describes. Build's
            // inverse sits directly after build.
            new DeconstructJobSource(),
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
            _sourceWorkMask = new byte[_sources.Length];

            int scanners = 0;
            for (int i = 0; i < _sources.Length; i++) if (_sources[i] is IJobTileScanner) scanners++;
            _tileScanners = new IJobTileScanner[scanners];
            int next = 0;
            for (int i = 0; i < _sources.Length; i++)
            {
                var src = _sources[i];
                if (src is IJobTileScanner ts) _tileScanners[next++] = ts;
                var kinds = src.HandledKinds;
                _sourceWorkMask[i] = WorkTypeMap.MaskOfKinds(kinds); // M2-2 (G1), read once, like _byKind
                _allSourceWorkMask |= _sourceWorkMask[i];             // M2-5, same registration read
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

        /// <summary>
        /// M2-2 test seam: the work-type mask THIS dispatcher cached for
        /// <see cref="Sources"/><c>[index]</c> at registration — the value
        /// <see cref="TryAssign"/> actually gates on, not a recomputation of it. Exposed so
        /// <c>WorkTypeVetoTests</c> can pin the mask at the seam rather than re-deriving it from
        /// <see cref="IJobSource.HandledKinds"/> with the production expression, which would pass
        /// however wrong both were (CLAUDE.md trap 4). Not a tick path.
        /// </summary>
        public byte WorkMaskOfSource(int index) => _sourceWorkMask[index];

        /// <summary>
        /// <b>HAS ANY SOURCE BACKED OFF <paramref name="pos"/> AS OF <paramref name="tick"/>?</b> The
        /// dispatcher-wide fan-out of <see cref="IJobSource.IsBackedOff"/>, so a caller asks ONE
        /// question about a tile instead of walking <see cref="Sources"/> and knowing which concrete
        /// classes exist. Read <see cref="IJobSource.IsBackedOff"/> for what a true answer means — it
        /// is *"a claim was attempted here and failed recently"*, which is WEAKER than "unreachable"
        /// and weaker still than "the world is impassable".
        ///
        /// <para>EVERY SOURCE IS ASKED, INCLUDING HAUL, and that is deliberate rather than an
        /// oversight to be filtered. <c>HaulJobSource</c>'s map is keyed on STOCKPILE tiles, so it can
        /// only answer true for a queued order that happens to sit on a zoned tile — in which case its
        /// answer is the same fact about the same tile ("no crew pathed here recently"), not a
        /// different one. Naming source types here to exclude one would be a second place that knows
        /// which sources exist, and the <c>zones</c> channel already draws the haul back-off for
        /// stockpile POLICY; this is about queued ORDERS, which is a different registry.</para>
        ///
        /// <para><paramref name="untilTick"/> is the LATEST live expiry across the sources that
        /// answered true (0 when none did) — i.e. the tick at which this tile could next be attempted
        /// at all, not the tick the first of several stamps happens to lift. The scan does not
        /// short-circuit, for that reason. Registration order is fixed, and the answer is
        /// order-independent anyway (a max over a set).</para>
        ///
        /// <para>PURE and allocation-free: an indexed loop over the source array plus one
        /// <c>Dictionary.TryGetValue</c> per source. It reads transient job-board scratch that is
        /// never saved, never hashed and never restored, so calling it — from a render thread, a
        /// test, or a wire channel — cannot move a determinism pin. NOT a tick path.</para>
        /// </summary>
        public bool IsBackedOff(Int3 pos, long tick, out long untilTick)
        {
            bool any = false;
            long latest = 0;
            for (int s = 0; s < _sources.Length; s++)
            {
                if (!_sources[s].IsBackedOff(pos, tick, out long until)) continue;
                if (!any || until > latest) latest = until;
                any = true;
            }
            untilTick = any ? latest : 0;
            return any;
        }

        public void Tick(Simulation sim)
        {
            for (int s = 0; s < _sources.Length; s++) _sources[s].BeginTick(sim);

            // Terrain edits (SetTileCommand, MOSS effects, …) publish TileChangedEvent but don't
            // all set JobsDirty themselves — treat any tile change from the previous tick as
            // TILE-dirtying. Cheap, and keeps the board honest.
            //
            // LOAD-BEARING INVARIANT for the W0-3 gating win (read before re-pointing any writer):
            // this line makes TileChangedEvent an INDEPENDENT source of the Tiles flag. Every
            // current Tiles-setting writer also publishes the event, so a writer that forgets its
            // Tiles flag is backstopped here — but nothing backstops the reverse. An ITEM/SITE/
            // CITIZENS writer that wrongly emits TileChangedEvent silently forces the full world
            // pass and quietly erases the win. The whole optimisation therefore rests on item-only
            // writers NEVER publishing TileChangedEvent, not on the Tiles writers setting the flag.
            if (sim.Events.Read<TileChangedEvent>().Length > 0) sim.JobsDirty |= JobBoardDirty.Tiles;
            if (sim.JobsDirty != JobBoardDirty.None) Rescan(sim);

            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                if (citizen.JobKind == JobKind.None)
                {
                    if (citizen.IsRecruitableForWork) TryAssign(sim, citizen); // held + player-ordered crew never self-assign
                    continue;
                }
                // ⭐⭐ M2-8 — PRE-EMPTION, AND IT IS ASKED HERE BECAUSE THIS LOOP IS THE ONLY PLACE
                // THAT SEES EVERY BUSY PAWN. The five M2-5 arbitration sites all answer "may I GIVE
                // her work"; none of them can TAKE work back, because JobKind.Craft and
                // JobKind.Maintain have no IJobSource at all and their systems only ever look at
                // pawns who are already idle. This loop walks the citizen store unconditionally —
                // a Craft/Maintain pawn reaches it and falls out at `owner == null` — so one check
                // here reaches a pawn inside a maintenance chain exactly as it reaches a hauler.
                // Putting it in TryAssign instead would reach nobody: TryAssign is only entered by
                // pawns who have no job to lose.
                if (TryPreempt(sim, citizen)) continue;

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
                int kind = (int)citizen.JobKind; // JobKind : byte, so 0..255 — only the top bound can fail
                var owner = kind < _byKind.Length ? _byKind[kind] : null;
                owner?.Progress(sim, citizen, _ctx);
            }
        }

        // -------------------------------------------------------------- pre-emption

        /// <summary>
        /// ⭐⭐ <b>M2-8 — TAKE A BUSY CREW MEMBER OFF HER JOB WHEN A STRICTLY BETTER-BANDED ONE IS
        /// WAITING.</b> Returns true when she was pre-empted, in which case she holds no job, the
        /// caller must not advance her this tick, and she is offered work again on the NEXT tick's
        /// pass (the M2-0 spike measured that gap at exactly one tick: order at t=231 →
        /// <c>Deconstruct</c> at t=232).
        ///
        /// <para><b>THE CANCEL IS <see cref="Simulation.CancelJob"/> AND THE CHOICE IS
        /// LOAD-BEARING</b>, modelled line-for-line on the flee path (<c>SafetySystem.cs:233-238</c>),
        /// which is the sim's one other pre-emption. <c>JobWork.AbandonJob</c> is the WEAKER path:
        /// it clears job/work/path state and explicitly leaves reservations *"the CALLER's to
        /// release first"*, so a pawn pre-empted through it walks away still holding her cargo —
        /// <c>CarriedBy</c> pointing at a citizen with no job. <see cref="Simulation.CancelJob"/>
        /// sets the stack down at her feet, clears <c>CarriedBy</c> AND <c>ReservedBy</c>, and
        /// dirties the board so the stack re-enters the haul board. Everything else the M2-0 spike
        /// measured survives untouched because it never lived on the pawn: a station's
        /// <c>Progress</c> and a build site's delivered material are on the <c>Device</c> / the site.
        /// Only her own <c>JobWorkTicks</c> countdown is lost.</para>
        ///
        /// <para>⛔ <b>THE SURVIVAL GUARD IS <see cref="WorkTypeMap.TryOf"/>, AND IT IS THE ONLY
        /// ONE.</b> <c>Flee</c>, <c>Eat</c> and <c>Drink</c> are not WORK — they carry no
        /// <see cref="WorkType"/>, the player's grid does not rank them, and pre-emption refuses
        /// them here. There is deliberately no second, belt-and-braces check listing the three
        /// kinds: two guards for one rule means neither can be shown to bite, and the failure mode
        /// this protects against is a crew member who starves while being reassigned.
        /// <c>PreemptionTests.SurvivalKinds_CarryNoWorkType_WhichIsTheWholeSurvivalGuard</c>
        /// pins the premise.</para>
        ///
        /// <para><b>Known and accepted:</b> the offer query is optimistic (see
        /// <see cref="IWorkOfferSource"/>), so a pre-emption whose better-banded claim then fails
        /// leaves her idle for a tick and she re-takes the lower-banded job. The M1-H per-tile /
        /// per-device backoff bounds that to one attempt per 5 s rather than a per-tick churn.</para>
        /// </summary>
        private static bool TryPreempt(Simulation sim, Citizen citizen)
        {
            // NOT WORK ⇒ untouchable. Flee/Eat/Drink (and None, which cannot reach here) — §12.3.
            if (!WorkTypeMap.TryOf(citizen.JobKind, out var mine)) return false;
            // Dead / HoldPosition / mid-ordered-walk: taking the job would strand her, because the
            // same facts stop anything from giving her another one.
            //
            // ⭐⭐ M2-19 — AND *HeldByOrder*, WHICH IS THE ONE THIS LINE EXISTS FOR NOW. A pawn on a
            // direct order ("that machine, NOW") carries a JobKind that maps to a WorkType, so
            // TryPreempt's survival guard above does NOT protect her: without the hold, ordering a
            // band-4 repair while Construct sits at band 1 takes her straight back off it — the
            // player's own instrument loses to the player's own grid. The hold refuses band
            // pre-emption outright. It is read through IsRecruitableIgnoringJob rather than checked
            // here so that the claim gates and the asIfIdle offer queries cannot drift from it.
            //
            // ⚠️ MEASURED: this line is NOT independently pinned for the hold, and saying so is the
            // point. HasOfferAboveBand below asks the SAME predicate again (asIfIdle: true, in all
            // three providers), so a mutation that blinds only this line — or only that one — leaves
            // StickyClaimTests entirely green; only blinding BOTH reddens it. The pinned fact is
            // Citizen.IsRecruitableIgnoringJob itself. Do not delete this check on the strength of
            // that: it is the cheap gate that stops the provider walk, and the two are one
            // expression rather than two spellings.
            if (!citizen.IsRecruitableIgnoringJob) return false;

            int myBand = citizen.GetWorkPriority(mine);
            // Off: she is working a type the player has since switched off. Finishing it is M2-2's
            // decided behaviour (finish, then wait) and pre-emption does not second-guess it.
            if (myBand == WorkPriority.Off) return false;
            if (myBand == WorkPriority.Highest) return false; // nothing can outrank band 1

            if (!WorkArbiter.HasOfferAboveBand(sim, citizen, myBand)) return false;

            sim.CancelJob(citizen);   // drops cargo at her feet, unreserves, sets JobsDirty
            citizen.ClearPath();      // CancelJob deliberately leaves the path (the flee path needs it)
            citizen.OrderedMove = false;
            return true;
        }

        // ------------------------------------------------------------------ board

        /// <summary>
        /// Rebuild the derived sub-boards the dirty flags name, and only those (W0-3). The z,y,x
        /// world pass — the only full-world scan, shared by the tile-derived boards (dig sites,
        /// stockpile zones) — runs iff <see cref="JobBoardDirty.Tiles"/> is set, so an item-only
        /// change no longer walks the world. Each source's own derivation then runs, in registration
        /// order, and reads <paramref name="what"/> to skip the sub-passes it can. Sources derive
        /// independently — no board may read another's — so the order is for determinism of
        /// declaration, not correctness, EXCEPT that the tile pass must precede every source's
        /// Rescan (Haul reads the stockpile board it builds); that is why the tile block is first.
        /// </summary>
        private void Rescan(Simulation sim)
        {
            JobBoardDirty what = sim.JobsDirty;
            sim.JobsDirty = JobBoardDirty.None;

            if ((what & JobBoardDirty.Tiles) != 0 && _tileScanners.Length > 0)
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

            for (int s = 0; s < _sources.Length; s++) _sources[s].Rescan(sim, _ctx, what);
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
            // ⭐⭐ M2-5 — THE BAND LOOP, AND ITS SHAPE IS AN INTEGRATOR RULING.
            //
            // The argmin below is DISTRIBUTED: `Select` threads the running minimum THROUGH the
            // providers and `:334`'s guard enforces it. A (priority, distance) comparison key would
            // therefore change IJobSource.Select's signature and the contract of every source, and
            // that is rejected. What is built instead is banding by SOURCE PARTICIPATION: iterate
            // the player's four priority bands on the OUTSIDE and run the EXISTING, UNMODIFIED
            // argmin once per band over only the sources that sit at that band for THIS citizen.
            // Inside a band the bestDist threading is byte-for-byte shipped behaviour. Up to four
            // passes instead of one; zero signature change; zero change across the four sources.
            //
            // ⛔ AND NOT A SystemStack REORDER EITHER: a reorder inverts a fixed GLOBAL precedence
            // (repair beats haul for every pawn always), so it cannot express Haul@1/Repair@4 and
            // delivers none of OD-A.
            //
            // ⭐ THIS IS ONLY HALF OF THE FIX, and the half the owner does not care about. See
            // WorkArbiter for the measurement: JobKind.Maintain and JobKind.Craft have no
            // IJobSource at all, MaintenanceSystem frees and re-claims the same pawn inside one
            // tick, and a dispatcher-only version of this loop was byte-identical to no change at
            // all on the running-chain case. The other half is the PUSH GATE in
            // MaintenanceSystem/CraftingSystem.
            //
            // Also the loop bound: every failed claim consumes at least one candidate (the source
            // must stamp what it refused), so the pass can iterate at most once per candidate plus
            // one final look that finds nothing.
            //
            // ⭐ M2-2 (G1) — THE VETO, AND IT IS COUNTED HERE FOR A REASON, not only skipped below.
            // A vetoed source can never refuse a candidate, so leaving it out keeps the bound a
            // valid upper bound on refusals (tighter, never looser). What it ALSO buys is the
            // behaviour every other line of this method is written around: `candidates == 0` is the
            // early-out that leaves an idle citizen's PATH untouched. Under OD-H a fresh pawn has
            // every work type off, so without this exclusion she would enter the loop, find no
            // source willing, fall to `bestSource < 0` and have ClearPath() called on her EVERY
            // TICK — killing idle wander (CitizenSystem's A11 path) for the whole boot state the
            // milestone is built around. The veto must therefore look like "no work exists for
            // her", which is exactly what it means.
            int candidates = 0;
            for (int s = 0; s < _sources.Length; s++)
            {
                if (!CanTakeFrom(citizen, s)) continue;
                candidates += _sources[s].CandidateCount;
            }
            if (candidates == 0) return; // nothing on any board: leave the citizen (and his path) untouched

            for (int band = WorkPriority.Highest; band <= WorkPriority.Lowest; band++)
            {
                int bandCandidates = 0;
                for (int s = 0; s < _sources.Length; s++)
                {
                    if (!CanTakeFrom(citizen, s, band)) continue;
                    bandCandidates += _sources[s].CandidateCount;
                }

                // ⭐ THE DEFER HALF. Asked ONCE per band, before the band's argmin, so the answer
                // cannot change under the retry loop. -1 means "no push recruiter has anything for
                // her at this band"; otherwise it is the natural priority of the best thing one of
                // them is holding. `asking: this` is load-bearing — see WorkArbiter.BestOfferAtBand,
                // the dispatcher must not probe its own sources from inside a selection pass.
                int pushNatural = WorkArbiter.BestOfferAtBand(sim, citizen, band, this);

                if (bandCandidates > 0)
                {
                    long gen = _ctx.NextGen();
                    IJobSource lastRefusal = null;
                    bool exhausted = false;

                    for (int attempt = 0; attempt <= bandCandidates; attempt++)
                    {
                        int bestSource = -1, bestCandidate = -1, bestDist = int.MaxValue;
                        for (int s = 0; s < _sources.Length; s++)
                        {
                            // M2-2 (G1): a work type the player switched off is never even OFFERED,
                            // so the source's Select is not called and no generation stamp is spent
                            // on it. M2-5 narrows the same test to THIS band.
                            if (!CanTakeFrom(citizen, s, band)) continue;
                            int cand = _sources[s].Select(sim, citizen, bestDist, gen, out int d);
                            // `d >= bestDist` is not paranoia about our own three sources: the
                            // argmin is a running minimum threaded THROUGH the providers, so one
                            // source reporting a worse distance would RAISE the bar and silently
                            // corrupt the filtering of every source after it. Enforced here rather
                            // than trusted, because the dispatcher is the only file the integrator
                            // reviews. ⚠️ M2-5 does not weaken this: the band restricts WHICH
                            // sources are asked and changes nothing about the minimum they thread.
                            if (cand < 0 || d >= bestDist) continue;
                            bestDist = d;
                            bestSource = s;
                            bestCandidate = cand;
                        }

                        if (bestSource < 0) { exhausted = true; break; } // this band is spent

                        // ⭐ EQUAL BAND: ties break by the work type's NaturalPriority constant
                        // (OD-J, RimWorld §1.3), never by column order, enum order or registration
                        // order. A push recruiter holding higher-ranked work at the SAME band wins,
                        // and the pawn is left idle for it — it claims her later in this same tick
                        // (CraftingSystem and MaintenanceSystem are registered after this system).
                        if (pushNatural > NaturalOfSourceAtBand(citizen, bestSource, band)) return;

                        lastRefusal = _sources[bestSource];
                        if (lastRefusal.TryClaim(sim, citizen, bestCandidate, gen, _ctx)) return;
                    }

                    if (!exhausted)
                        // Unreachable with a conforming source. A source that refuses a candidate
                        // without stamping it (and without a backoff) re-offers it forever:
                        // measured, that is a SILENT HANG — no exception, no log, the sim just stops
                        // advancing. Fail loudly and name the culprit instead; this is the one place
                        // that can defend against a provider.
                        //
                        // TWO faults land here and the message must not presume one: a source that
                        // does not stamp what it refused, or a source that UNDER-REPORTS
                        // CandidateCount (measured: a source stamping correctly but declaring 3 of
                        // its 4 candidates throws exactly this way). Naming only the first sends a
                        // lane hunting a stamping bug that isn't there.
                        throw new InvalidOperationException(
                            $"job source '{lastRefusal.Name}' (CandidateCount {lastRefusal.CandidateCount}) " +
                            $"refused a candidate {bandCandidates + 1} times in one selection pass at " +
                            $"priority band {band}, which is bounded by the total declared count across " +
                            $"that band's sources ({bandCandidates}) — it is either not stamping refused " +
                            "candidates (see IJobSource.TryClaim) or under-reporting CandidateCount");
                }

                // Nothing claimable in this band's own sources. If a push recruiter holds ANYTHING
                // at this band, she waits for it rather than dropping to the next band — that is
                // what makes Repair@1 beat Haul@4 when only the haul has an IJobSource.
                if (pushNatural >= 0) return;
            }

            citizen.ClearPath(); // normalize after any failed FindPath attempts
        }

        /// <summary>
        /// M2-2 (G1) — may <paramref name="citizen"/> take ANY of the work source
        /// <paramref name="s"/> hands out? An indexed test over a cached six-bit mask: no
        /// allocation, no enumeration, no RNG, so it is safe in the places
        /// <see cref="TryAssign"/> calls it even though they run per citizen per tick.
        ///
        /// <para>This band-less form survives M2-5 for ONE caller: the whole-pass candidate sum,
        /// whose job is the OD-H early-out — <c>candidates == 0</c> must mean "there is no work for
        /// her anywhere", so an idle pawn keeps her wander path instead of having
        /// <see cref="Citizen.ClearPath"/> called on her every tick. Banding that sum would make it
        /// mean "no work at band 1", which is a different sentence.</para>
        /// </summary>
        private bool CanTakeFrom(Citizen citizen, int s)
        {
            byte mask = _sourceWorkMask[s];
            if (mask == 0) return true; // hands out no player-assignable work — not the veto's business
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                if ((mask & (1 << t)) != 0 && citizen.CanTakeWorkType((WorkType)t)) return true;
            return false;
        }

        /// <summary>
        /// M2-5 — does source <paramref name="s"/> participate at priority band
        /// <paramref name="band"/> for <paramref name="citizen"/>? The band loop's restriction, and
        /// the ONLY thing that differs between the four passes.
        ///
        /// <para>A source that hands out no player-assignable work (mask 0) has no band of its own,
        /// so it is placed at <see cref="WorkPriority.Highest"/> — offered once, in the first pass,
        /// never starved by a grid it has nothing to do with. There is no such source today;
        /// <c>WorkTypeVetoTests.EverySource_SpansExactlyOneWorkType</c> pins that, and this line is
        /// what a future one would fall into rather than out of.</para>
        /// </summary>
        private bool CanTakeFrom(Citizen citizen, int s, int band)
        {
            byte mask = _sourceWorkMask[s];
            if (mask == 0) return band == WorkPriority.Highest;
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
            {
                if ((mask & (1 << t)) == 0) continue;
                var type = (WorkType)t;
                if (citizen.GetWorkPriority(type) != band) continue;
                if (citizen.CanTakeWorkType(type)) return true; // INCAPABLE ≠ disabled
            }
            return false;
        }

        /// <summary>
        /// M2-5 — the <see cref="WorkPriority.NaturalPriority"/> the equal-band tie-break compares
        /// source <paramref name="s"/> at: the highest-ranked of the work types it hands out that
        /// sit at <paramref name="band"/> for this citizen. Every shipped source spans exactly one
        /// work type (pinned), so today this is simply "that type's constant"; the max is what a
        /// two-type source would get, and it is the generous direction (such a source is not
        /// out-ranked on account of its weaker half).
        ///
        /// <para>A mask-0 source returns <see cref="int.MaxValue"/> — nothing can out-rank work the
        /// player was never offered a switch for.</para>
        /// </summary>
        private int NaturalOfSourceAtBand(Citizen citizen, int s, int band)
        {
            byte mask = _sourceWorkMask[s];
            if (mask == 0) return int.MaxValue;
            int best = -1;
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
            {
                if ((mask & (1 << t)) == 0) continue;
                var type = (WorkType)t;
                if (citizen.GetWorkPriority(type) != band || !citizen.CanTakeWorkType(type)) continue;
                int natural = WorkPriority.NaturalPriority(type);
                if (natural > best) best = natural;
            }
            return best;
        }

        // ------------------------------------------------------------- arbitration (site 2)

        /// <summary>M2-5: every work type this dispatcher's registered sources hand out, OR-ed once
        /// at registration. <see cref="IWorkOfferSource.OfferedWorkTypes"/>.</summary>
        public byte OfferedWorkTypes => _allSourceWorkMask;

        /// <summary>
        /// ⭐ <b>M2-5 ARBITRATION SITE 2 — THE DISPATCHER'S FAN-OUT, AND THE ONE OF THE FIVE THAT
        /// ANSWERS RATHER THAN ASKS.</b> Modelled on <see cref="IsBackedOff"/> and on
        /// <see cref="Tick"/>'s <c>BeginTick</c> fan-out: a caller asks ONE question about a crew
        /// member instead of walking <see cref="Sources"/> and knowing which concrete classes exist.
        /// Delete it (or make it always answer <c>false</c>) and the two push recruiters can never
        /// see the dispatcher's work — <c>Mine@1</c> would lose to <c>Repair@4</c> with no gate
        /// anywhere reporting it, which is why it carries its own blinded leg.
        ///
        /// <para><b>AS STRONG AS THE PULL CLAIM MINUS THE PATH.</b> It runs the real
        /// <see cref="IJobSource.Select"/> — so staleness, another pawn's claim, the per-tile
        /// unreachable backoff and the board's own validity are all honoured — and stops short of
        /// <see cref="IJobSource.TryClaim"/>, which is the whole-region A*. That is the optimism
        /// <see cref="IWorkOfferSource"/> describes, at the strongest point that is affordable.</para>
        ///
        /// <para>⚠️ <b>IT SPENDS A GENERATION AND WRITES GENERATION STAMPS</b>, exactly as a real
        /// selection pass does — which is safe because stamps are per-pass scratch that carry no
        /// meaning past the pass that wrote them, and unsafe from INSIDE a live pass, which is why
        /// <see cref="TryAssign"/> excludes this dispatcher from its own arbitration. The generation
        /// is taken lazily, so a query that matches no source costs nothing.</para>
        /// </summary>
        public bool HasClaimableWork(Simulation sim, Citizen citizen, WorkType type, bool asIfIdle)
        {
            int bit = 1 << (int)type;
            if ((_allSourceWorkMask & bit) == 0) return false;
            // M2-8: `asIfIdle` relaxes THIS gate and nothing else — see IWorkOfferSource.
            if (!(asIfIdle ? citizen.IsRecruitableIgnoringJob : citizen.IsRecruitableForWork) ||
                !citizen.CanTakeWorkType(type)) return false;

            long gen = 0;
            bool haveGen = false;
            for (int s = 0; s < _sources.Length; s++)
            {
                if ((_sourceWorkMask[s] & bit) == 0) continue;
                if (_sources[s].CandidateCount == 0) continue;
                if (!haveGen) { gen = _ctx.NextGen(); haveGen = true; }
                // int.MaxValue: every source filters on strict `<`, so this admits its whole board.
                if (_sources[s].Select(sim, citizen, int.MaxValue, gen, out _) >= 0) return true;
            }
            return false;
        }
    }
}
