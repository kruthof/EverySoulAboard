namespace Perilune.Sim
{
    /// <summary>
    /// One KIND OF WORK the <see cref="JobSystem"/> dispatcher can hand to an idle citizen —
    /// digging, hauling to a stockpile, feeding a build site, building. A source owns its own
    /// board, its own reservations, its own retry backoff and its own progress handling; the
    /// dispatcher owns the tick loop, the citizen order and the cross-source arbitration.
    ///
    /// ADDING A JOB KIND is one new file implementing this interface plus one line in
    /// <see cref="JobSystem.DefaultSources"/>. Nothing else in the dispatcher changes. That is
    /// the whole point of the split (ECONOMY-PLAN W0-4): E-MINE, E-STOCK and E-PROD each want
    /// their own source and cannot all edit one file.
    ///
    /// THE ARBITRATION CONTRACT, which every implementer must honour or the pins move:
    ///
    /// 1. **One global argmin.** The dispatcher asks every source, in registration order, for
    ///    its nearest candidate STRICTLY CLOSER than the best distance found so far, and the
    ///    last source to answer wins. So a source must use strict <c>&lt;</c> internally too.
    ///    Consequence: an exact distance tie resolves to REGISTRATION ORDER, then to the
    ///    source's own board order. Both are behaviour, both are pinned by
    ///    <c>JobDispatchTests</c>, neither may be changed casually.
    /// 2. **Distance is <see cref="Int3.Manhattan"/> from the citizen to the job's stable
    ///    destination** — not path length (ECONOMY-PLAN §4.9 records that Manhattan-nearest is
    ///    not path-nearest 28.7 % of the time; deterministic, just wrong, and inherited).
    /// 3. **Declared scan orders.** Tiles z,y,x; items/citizens/devices in entity store order;
    ///    4-neighbours +x,−x,+y,−y. A new board must declare its order in a doc comment.
    /// 4. **No allocation on the tick path.** Reuse board lists, use the <paramref name="gen"/>
    ///    stamps instead of clearing, use <see cref="System.Collections.Generic.HashSet{T}"/> /
    ///    <see cref="System.Collections.Generic.Dictionary{K,V}"/> for LOOKUP ONLY and never
    ///    iterate them (that is a determinism rule, not a perf one), indexed <c>for</c> only,
    ///    no LINQ, no lambdas, no closures.
    /// 5. **Reservations go through <see cref="JobContext.ReserveGroundItem"/>**, never by
    ///    setting <see cref="ItemStack.ReservedForJob"/> directly — that is the channel through
    ///    which a source that keeps a derived free-material count learns its pool shrank
    ///    mid-tick. See <see cref="OnGroundItemReserved"/>.
    /// </summary>
    public interface IJobSource
    {
        /// <summary>Stable diagnostic identity. Not hashed, not serialized, not on a tick path.</summary>
        string Name { get; }

        /// <summary>
        /// The <see cref="JobKind"/>s this source drives once assigned. Read ONCE at
        /// registration into the dispatcher's kind→source table, so the array must be a cached
        /// singleton and two sources may never claim the same kind.
        /// </summary>
        JobKind[] HandledKinds { get; }

        /// <summary>
        /// How many RAW candidates the board holds (before validity, backoff or reachability) —
        /// i.e. the number of distinct indices <see cref="Select"/> could return.
        ///
        /// Two contracts ride on it, both behaviour rather than optimisation.
        ///
        /// ZERO across every source makes the dispatcher skip the whole selection pass INCLUDING
        /// <see cref="Citizen.ClearPath"/>, so an idle citizen keeps a stale path when there is no
        /// work anywhere. Note the corollary: a source returning 0 silently disables itself — no
        /// throw, no log, its board simply never offered. (The same silence the previous boolean
        /// had, so not new, but it is the first thing to check when a source "does nothing".)
        ///
        /// The SUM across sources is the dispatcher's retry bound, and it is exactly tight —
        /// <c>sum + 1</c>, zero margin — because every refusal is required to consume a candidate.
        /// So this must be an UPPER bound on how many times this source can refuse in one pass.
        /// Over-reporting is free and safe (measured: declaring 9 against a real board of 4 changes
        /// nothing); under-reporting throws. When in doubt, over-report. A future source that can
        /// refuse a candidate WITHOUT consuming it breaks the bound outright and needs the
        /// dispatcher's cap revisited, not a bigger number here.
        ///
        /// All three shipped implementations are O(1) — a list count, or the sum of two.
        /// </summary>
        int CandidateCount { get; }

        /// <summary>
        /// Once per tick, in registration order, before any rescan/selection/progress. The place
        /// for lazy one-time resolution of an optional stack system — a source must be inert,
        /// not throw, when the system it needs is absent from the stack.
        /// </summary>
        void BeginTick(Simulation sim);

        /// <summary>
        /// Rebuild this source's derived board. Called in registration order, only when
        /// <see cref="Simulation.JobsDirty"/> was set, and AFTER the dispatcher's single world
        /// pass (see <see cref="IJobTileScanner"/>) so tile-derived boards are already filled.
        /// Boards are purely derived: never serialized, never a source of truth.
        /// </summary>
        void Rescan(Simulation sim, JobContext ctx);

        /// <summary>
        /// This source's nearest candidate for <paramref name="citizen"/> that is strictly
        /// nearer than <paramref name="bestDist"/>, or −1. Returns an index the source alone
        /// interprets (the dispatcher never decodes it, so a source may pack several boards into
        /// one index space) and reports its distance in <paramref name="dist"/>.
        ///
        /// The returned <paramref name="dist"/> MUST be strictly less than
        /// <paramref name="bestDist"/> — it is a running minimum threaded through every source, so
        /// a worse distance would raise the bar for every source after this one. The dispatcher
        /// re-checks and declines the candidate rather than trusting it.
        ///
        /// Candidates that are stale, already claimed or inside their unreachable backoff must
        /// be STAMPED with <paramref name="gen"/> so the dispatcher's retry loop terminates.
        ///
        /// Must not mutate the world, the citizen, any reservation, or the BOARD — the one
        /// deliberate exception is the source's own per-pass <paramref name="gen"/> stamps, which
        /// exist precisely so a selection pass can record what it rejected without allocating.
        /// Stamps are scratch: they carry no meaning past this pass.
        /// </summary>
        int Select(Simulation sim, Citizen citizen, int bestDist, long gen, out int dist);

        /// <summary>
        /// Commit <paramref name="candidate"/> to <paramref name="citizen"/>: path, reserve, set
        /// <see cref="Citizen.JobKind"/>/<c>JobTarget</c>/<c>JobWorkTicks</c>. On success the
        /// dispatcher moves to the next citizen.
        ///
        /// On FAILURE (typically an unreachable target — a failed path is a whole-region sweep)
        /// the source must return false having ALREADY done both of:
        ///   (a) stamped the candidate with <paramref name="gen"/>, so this pass cannot pick it
        ///       again — the dispatcher immediately re-runs the whole selection for the same
        ///       citizen; and
        ///   (b) recorded its own retry backoff, so later TICKS do not re-attempt a whole-region
        ///       path sweep against the same dead target every 100 ms.
        /// (a) is what terminates the pass and (b) is what keeps it cheap. Omitting BOTH is a
        /// silent hang — no exception, no log — which is why the dispatcher now carries a bounded
        /// guard that throws naming the source. Omitting only (b) is merely slow.
        /// The world must be left exactly as it was, minus any reservation the attempt released.
        ///
        /// <paramref name="candidate"/> is valid ONLY until this source's next
        /// <see cref="Rescan"/>, and the dispatcher guarantees no rescan happens between
        /// <see cref="Select"/> and this call. A source must not rescan its own board here either:
        /// board indices and generation stamps are both board-position-indexed, so a mid-pass
        /// rebuild silently redirects an index at a different job.
        /// </summary>
        bool TryClaim(Simulation sim, Citizen citizen, int candidate, long gen, JobContext ctx);

        /// <summary>
        /// Advance one citizen already working a kind in <see cref="HandledKinds"/>. Called in
        /// citizen store order from the dispatcher's tick loop, exactly once per tick per
        /// citizen. Owns arrival, work countdown, completion and every abandon path.
        /// </summary>
        void Progress(Simulation sim, Citizen citizen, JobContext ctx);

        /// <summary>
        /// Notification, in registration order, that some source just reserved a loose ground
        /// stack this tick (via <see cref="JobContext.ReserveGroundItem"/>) — including this
        /// source's own reservations. Sources holding a count derived from free ground items
        /// decrement it here; the board is only rebuilt on <see cref="Simulation.JobsDirty"/>,
        /// so without this a second citizen in the SAME tick can be promised units a first
        /// citizen already took. There is deliberately no matching release hook: a released
        /// reservation reappears on the next rescan, which is the conservative direction.
        ///
        /// TIMING, normalised so every implementer sees one world: the notification fires AFTER
        /// the reserving citizen's job state is fully written (JobKind, JobTarget, ReservedItemId)
        /// and after <see cref="ItemStack.ReservedForJob"/> is set. A handler may therefore read
        /// both. It fires before the claiming source's own bookkeeping (assignment sets, backoff
        /// removal), so it must not depend on that.
        /// </summary>
        void OnGroundItemReserved(Simulation sim, ItemStack item);
    }

    /// <summary>
    /// OPTIONAL companion to <see cref="IJobSource"/>: opt into the dispatcher's SINGLE z,y,x
    /// world pass instead of running your own. The dispatcher clears every scanner, walks the
    /// world once per rescan offering each tile to every scanner in registration order, and only
    /// then calls <see cref="IJobSource.Rescan"/>.
    ///
    /// This exists because a full-world scan per source is the exact cost ECONOMY-PLAN W0-3 is
    /// about to attack; two sources deriving boards from tiles (dig sites, stockpile zones —
    /// and soon ore seams and filtered zones) must not cost two passes.
    /// </summary>
    public interface IJobTileScanner
    {
        /// <summary>Clear tile-derived boards. Called before the pass, in registration order.</summary>
        void BeginTileScan(Simulation sim);

        /// <summary>
        /// One tile, in z,y,x order. <paramref name="flags"/> is the raw
        /// <see cref="TileFlags"/> byte; <paramref name="wall"/>/<paramref name="floor"/> are
        /// <see cref="TileDefs"/> ids (wall 0 = none). Appending in call order yields a board in
        /// z,y,x order, which is what every tie-break assumes.
        /// </summary>
        void VisitTile(Simulation sim, Int3 pos, byte flags, ushort wall, ushort floor);
    }
}
