namespace Perilune.Sim
{
    /// <summary>
    /// M2-5 — <b>A PROVIDER THAT CAN PUT WORK ON AN IDLE CREW MEMBER, AND CAN BE ASKED WHETHER IT
    /// WOULD.</b> Implemented by <see cref="JobSystem"/> (the four pull <see cref="IJobSource"/>s,
    /// fanned out), <see cref="CraftingSystem"/> and <see cref="MaintenanceSystem"/> — the three
    /// families between which <see cref="WorkArbiter"/> arbitrates.
    ///
    /// <para>⚠️ <b><see cref="HasClaimableWork"/> IS OPTIMISTIC BY CONSTRUCTION, AND THAT IS A
    /// DESIGN POSITION RATHER THAN AN OVERSIGHT.</b> A query as strong as the actual claim would
    /// have to walk the path, which IS the expensive part of a claim (M1-H measured it: the walk is
    /// what costs, not the bookkeeping). So the contract is deliberately one-sided:
    /// <list type="bullet">
    ///   <item>a <c>false</c> answer must be TRUE — this provider really cannot use this crew member
    ///     right now, so the arbitration may safely give her to somebody else;</item>
    ///   <item>a <c>true</c> answer is a BELIEF — the claim may still fail when it is attempted.</item>
    /// </list>
    /// ⛔ <b>An over-reporting implementation stalls the band SILENTLY.</b> Every crew member at or
    /// below the over-reporting provider's band waits for work she will never be offered; there is
    /// no error, no log, and it looks exactly like "the pawn is busy". The M2-0 spike shipped one of
    /// these (<see cref="CraftingSystem"/>'s query could not see its own staged inputs) and a
    /// four-pawn fixture took <b>40 782</b> ticks to serve an order that should have been immediate.
    /// ⇒ <b>An implementation must mirror EVERY early return of its own claim path.</b> The stall is
    /// broken only by the M1-H backoff, and a provider that returns early before ever attempting a
    /// claim never stamps one — which is exactly how the spike's stall became unbounded.</para>
    ///
    /// <para><b>NOT PURE, and named so rather than promised otherwise.</b> Implementations may touch
    /// the same transient job-board scratch their claim path does (generation stamps, the
    /// self-cleaning <see cref="PushRecruitBackoff"/>). None of it is saved, hashed or restored, and
    /// all of it is reached in a fixed order, so a query cannot introduce non-determinism — but it
    /// is not a read-only call and must not be described as one.</para>
    ///
    /// <para>Allocation-free, no RNG, no LINQ: it is asked on the tick path.</para>
    /// </summary>
    public interface IWorkOfferSource
    {
        /// <summary>
        /// The set of <see cref="WorkType"/>s this provider can hand out, one bit per type
        /// (bit <c>i</c> = <c>(WorkType)i</c>) — the same shape
        /// <see cref="WorkTypeMap.MaskOfKinds"/> builds. Read on the tick path, so it must be a
        /// cached constant and never a computation.
        /// </summary>
        byte OfferedWorkTypes { get; }

        /// <summary>
        /// Could this provider plausibly put <paramref name="type"/> work on
        /// <paramref name="citizen"/> right now? See the interface comment for the one-sided
        /// contract and for what an over-report costs.
        /// </summary>
        bool HasClaimableWork(Simulation sim, Citizen citizen, WorkType type);
    }

    /// <summary>
    /// ⭐ <b>M2-5 — THE ONE ARBITRATION POINT. "Do you have something better for this pawn?"</b>
    ///
    /// <para><b>WHAT THIS EXISTS TO DELIVER (OD-A).</b> Before it, dispatch was a <i>distance-only
    /// tournament</i> and source registration order was a tie-break, not a priority
    /// (<see cref="JobSystem"/>'s own header said so): a player could switch a work type on or off
    /// (M2-2) but could not say that repair matters MORE than hauling. After it,
    /// <c>Repair@1 / Haul@4</c> means what it says.</para>
    ///
    /// <para>⭐⭐ <b>AND IT IS ASKED AT FIVE SITES BECAUSE THE DISPATCHER IS NOT THE ONLY DOOR — this
    /// was MEASURED, not argued.</b> <c>JobKind.Maintain</c> and <c>JobKind.Craft</c> have no
    /// <see cref="IJobSource"/> at all, so <see cref="MaintenanceSystem"/> and
    /// <see cref="CraftingSystem"/> recruit outside <see cref="JobSystem.Tick"/> entirely. The M2-0
    /// spike built a dispatcher-only version of this — a pawn is left idle for a better-banded push
    /// recruiter — and on the owner's own case (an order painted while a maintenance chain is
    /// running) it was <b>byte-identical to no change at all</b>: <c>MaintenanceSystem.Tick</c> runs
    /// <c>DriveWorkers</c> and then <c>RecruitForNeediest</c>, freeing and re-claiming the same pawn
    /// inside ONE tick, so the dispatcher saw her idle on <b>zero</b> of the 54 450 chain ticks.
    /// <list type="bullet">
    ///   <item><b>(a) THE DEFER HALF</b> — <see cref="JobSystem.TryAssign"/> runs the existing
    ///     distance argmin once per band over only that band's sources, and leaves the pawn idle for
    ///     a push recruiter holding better work.</item>
    ///   <item><b>(b) THE PUSH GATE</b> — <see cref="MaintenanceSystem"/> and
    ///     <see cref="CraftingSystem"/> ASK before claiming and will not re-claim a pawn whose best
    ///     available work sits higher. <b>This is the only half that can reach a pawn already inside
    ///     a chain</b>, because the chain never yields to the dispatcher.</item>
    /// </list>
    /// ⛔ <b>NEITHER HALF IS SUFFICIENT ALONE and a reviewer must refuse a package that ships only
    /// (a):</b> defer-only passes a t=0 demo and a plausible test suite and delivers nothing the
    /// owner asked for (measured: 54 652 both times). Push-gate-only fixes the chain (7 232) and
    /// LOSES the t=0 inversion. Both together: 7 232 <i>and</i> the inversion.</para>
    ///
    /// <para>⭐ <b>THE RANKING RULE — RimWorld's, read out of the decompiled source rather than
    /// re-derived</b> (<c>docs/design/rimworld-reference.md</c> §1.3). The sort key is
    /// <c>naturalPriority + (4 − playerPriority) × 100000</c> descending, i.e. <b>the player's 1..4
    /// band dominates absolutely</b> and the per-work-type <see cref="WorkPriority.NaturalPriority"/>
    /// constant breaks ties inside a band. <see cref="Score"/> is that key negated so that LOWER IS
    /// BETTER, which reads the same direction as the player's own numbers (1 is highest).</para>
    ///
    /// <para>⛔ <b>THE TIE-BREAK IS THE CONSTANT, NEVER THE COLUMN ORDER.</b> OD-J authors
    /// <c>Repair · Construct · Craft · Deconstruct · Mine · Haul</c> and the work grid renders in
    /// that order — but it renders in it because it is DERIVED from
    /// <see cref="WorkPriority.RankedOrder"/>, which is derived from the constant. Left-to-right is a
    /// correct PREDICTION of the outcome and the WRONG mechanism: encode declaration order, array
    /// index or column index and you have implemented the display, and the next lane that tidies the
    /// columns silently re-ranks the ship's labour.</para>
    ///
    /// <para>⚠️ <b>WHERE THE RANKING STOPS, STATED RATHER THAN HIDDEN.</b> Within one band the
    /// dispatcher's own four pull sources still compete by DISTANCE — that is the integrator's
    /// binding shape (<i>"restrict the source set to those whose work type sits at this band, run
    /// the EXISTING distance argmin over just those sources"</i>), and inside a band the
    /// <c>bestDist</c> threading is byte-for-byte shipped behaviour. So <c>Mine@2</c> vs
    /// <c>Haul@2</c> is decided by which job is nearer, while <c>Repair@2</c> vs <c>Haul@2</c> is
    /// decided by <see cref="WorkPriority.NaturalPriority"/>. <b>That boundary is deliberate and it
    /// is a KNOWN LIMIT</b>: making equal-band pull-vs-pull obey the constant too would mean running
    /// one argmin per work type instead of one per band, which the shape rules out. Do not "fix" it
    /// silently — it is a charter question.</para>
    ///
    /// <para><b>Determinism.</b> Work types are walked in <see cref="WorkPriority.RankedOrder"/>
    /// (naturalPriority descending — so the FIRST provider that answers yes is already the best
    /// answer and the scan can stop), providers in system registration order
    /// (<c>Simulation.WorkOfferSources</c>, resolved once per simulation). No allocation, no RNG, no
    /// LINQ, no enumerator: indexed loops only. This class is <b>static and holds no state</b> —
    /// nothing to save, nothing to hash, nothing that can cross-talk between parallel sims.</para>
    /// </summary>
    public static class WorkArbiter
    {
        /// <summary>
        /// How far the player's band outranks the natural-priority tie-break. RimWorld's
        /// <c>×100000</c> against a <c>naturalPriority</c> constrained to 0..10000, so the constant
        /// can never overcome the number the player typed — a band-2 job NEVER beats a band-1 job,
        /// whatever their work types.
        /// </summary>
        public const int BandWeight = 100000;

        /// <summary>
        /// The arbitration key for a work type at a band, <b>LOWER IS BETTER</b>. RimWorld's
        /// descending <c>naturalPriority + (4 − playerPriority) × 100000</c>, negated so the
        /// direction matches the player's own numbers. Exposed for tests and for the
        /// <c>why</c> line (M2-6); not itself a decision point.
        /// </summary>
        public static int Score(int band, WorkType type) =>
            band * BandWeight - WorkPriority.NaturalPriority(type);

        /// <summary>
        /// ⭐ <b>THE ARBITRATION FUNCTION. Everything else in this class is a way of phrasing a
        /// question to it.</b>
        ///
        /// <para>The <see cref="WorkPriority.NaturalPriority"/> of the best work
        /// <paramref name="citizen"/> could be given at exactly <paramref name="band"/> by some
        /// provider OTHER than <paramref name="asking"/>, or <c>-1</c> when there is none.</para>
        ///
        /// <para><paramref name="asking"/> is the caller excluding itself, and for
        /// <see cref="JobSystem"/> that exclusion is <b>load-bearing rather than tidy</b>: its own
        /// <see cref="IWorkOfferSource.HasClaimableWork"/> probes sources with
        /// <see cref="IJobSource.Select"/>, which spends a generation and writes generation stamps.
        /// Called from inside an active selection pass that would silently disturb the pass's own
        /// stamps. The dispatcher therefore never asks itself, and there is no re-entrancy: no
        /// implementation of <see cref="IWorkOfferSource.HasClaimableWork"/> calls back into this
        /// class.</para>
        /// </summary>
        public static int BestOfferAtBand(Simulation sim, Citizen citizen, int band, IWorkOfferSource asking)
        {
            var order = WorkPriority.RankedOrder; // naturalPriority DESCENDING — first hit wins
            var providers = sim.WorkOfferSources;
            for (int i = 0; i < order.Count; i++)
            {
                var type = order[i];
                // GetWorkPriority == band already excludes Off (0), because band is 1..4.
                if (citizen.GetWorkPriority(type) != band) continue;
                if (!citizen.CanTakeWorkType(type)) continue; // INCAPABLE ≠ disabled, and both refuse
                int bit = 1 << (int)type;
                for (int s = 0; s < providers.Length; s++)
                {
                    var provider = providers[s];
                    if (ReferenceEquals(provider, asking)) continue;
                    if ((provider.OfferedWorkTypes & bit) == 0) continue;
                    if (provider.HasClaimableWork(sim, citizen, type))
                        return WorkPriority.NaturalPriority(type);
                }
            }
            return -1;
        }

        /// <summary>
        /// <b>THE PUSH GATE'S PHRASING OF THE SAME QUESTION</b> — is there work for
        /// <paramref name="citizen"/> that strictly outranks <paramref name="mine"/>, and which some
        /// provider other than <paramref name="asking"/> could give her right now?
        ///
        /// <para>A thin wrapper over <see cref="BestOfferAtBand"/>: every band better than hers wins
        /// outright (the band dominates absolutely), and at her OWN band only a higher
        /// <see cref="WorkPriority.NaturalPriority"/> wins. <b>Strictly</b> — equal work is not
        /// better work, so a tie leaves the asker free to claim, which is what stops two recruiters
        /// deferring to each other and leaving the pawn idle forever.</para>
        ///
        /// <para>False when <paramref name="mine"/> is <see cref="WorkPriority.Off"/> for her: she
        /// is not taking that work at all, and M2-2's veto — not this — is what refuses it.</para>
        /// </summary>
        public static bool HasBetterOfferThan(Simulation sim, Citizen citizen, WorkType mine, IWorkOfferSource asking)
        {
            int myBand = citizen.GetWorkPriority(mine);
            if (myBand == WorkPriority.Off) return false;
            int myNatural = WorkPriority.NaturalPriority(mine);
            for (int band = WorkPriority.Highest; band <= myBand; band++)
            {
                // Above her band ANY offer wins (floor -1, and BestOfferAtBand returns -1 for
                // "nothing", so -1 > -1 is false and an empty band cannot win). At her band only a
                // strictly higher natural priority does.
                int floor = band == myBand ? myNatural : -1;
                if (BestOfferAtBand(sim, citizen, band, asking) > floor) return true;
            }
            return false;
        }
    }
}
