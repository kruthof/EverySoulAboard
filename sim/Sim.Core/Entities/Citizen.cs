using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    public sealed class Citizen : IEntity
    {
        public uint Id { get; set; }
        public string Name = "";
        public Int3 Pos;
        public Int3 PrevPos;

        /// <summary>Opt-in idle wandering (off by default: an institution's crew stands
        /// at their station when idle — movement comes from tasks, needs and orders).</summary>
        public bool AutoWander;

        /// <summary>Strict player control (saved CITZ v6): the citizen never
        /// self-initiates movement — no wander, no job pickup, no self-serve needs.
        /// Movement comes exclusively from direct orders (MoveCitizenCommand).
        /// The player owns their survival.</summary>
        public bool HoldPosition;

        /// <summary>Hidden survivors (sealed compartments) don't lift fog until found.</summary>
        public bool RevealsFog = true;

        // --- Factions & physiology groundwork (raider milestone; saved CITZ v5) ---

        /// <summary>0 = crew, 1 = the Lien (raiders), 2 = neutral/surrendered.</summary>
        public byte Faction;

        /// <summary>1 = healthy .. 0 = dead. Damaged by hypoxia, cold and struggle.</summary>
        public float Health = 1f;

        /// <summary>Raider resolve 1..0; breaking triggers withdraw/surrender (RaiderSystem).</summary>
        public float Morale = 1f;

        /// <summary>Role template (0 = none; raider archetypes arrive with RaiderSystem).</summary>
        public byte Archetype;

        // Path following (M1: wander + follow; jobs arrive in M2).
        public readonly List<Int3> Path = new List<Int3>(64);
        public int PathIndex;
        public int MoveCooldown;   // ticks until next tile step
        public int IdleCooldown;   // ticks until next wander decision

        // --- Needs & health (M2 v0; 0..1 scales) ---
        public float Suffocation;   // rises in unbreathable air; 1 = dead
        public float Hunger;        // 1 = starving; eat to reduce (SustenanceSystem)
        public float Thirst;        // 1 = parched; drink from the water network
        public float Fatigue;       // 1 = exhausted (slows work)
        public float Mood;          // derived scalar, -100..100, for HUD/M3 systems
        public bool Dead;

        // --- The work-priority grid (M2-1, saved CITZ v8; READ SINCE M2-2). ⚠️ THIS HEADER SAID
        // "STORAGE ONLY: nothing in the sim reads any of the four fields below, and that inertness
        // is the package's whole claim" — TRUE OF M2-1's TREE, FALSE OF THIS ONE. M2-2 landed the
        // work-type VETO: WorkPrioritiesRaw and WorkIncapable are now read at five gates through
        // CanTakeWorkType below, so this grid is BEHAVIOUR and its default (OD-H: off) is what a
        // new game boots into. ⚠️ AND M2-19 GAVE HeldByOrder A READER TOO (IsRecruitableIgnoringJob
        // — the sticky claim), so of the three "reserved" fields only Skill is still inert. And
        // M2-9's PrioritiseJobCommand WRITES it, so HeldByOrder is now live end to end in the sim.
        // The enrolment ledger in WorkPriorityStateTests.OnlyEnrolledFilesReadTheWorkGrid names
        // every file that may look at them.
        // See the WorkType / WorkPriority declarations at the bottom of this file. ---

        /// <summary>
        /// This crew member's manual work priority per <see cref="WorkType"/>, indexed by the
        /// enum's own value. <c>0</c> = the pawn will not do it; <c>1</c>..<c>4</c> = a manual
        /// priority with <b>1 the highest</b> (<see cref="WorkPriority"/>).
        ///
        /// SHAPE, and why it is this one. A fixed-length inline array, sized by
        /// <see cref="WorkPriority.WorkTypeCount"/>: no <c>Dictionary</c> (its enumeration order can
        /// reach the hash — the constraint <c>Jobs/Sources/HaulJobSource.cs:137</c> states in the other
        /// direction), no bit-packing (six slots × a 5-value domain would be 18 bits in one word,
        /// and a mis-shifted slot is <c>RoomType.Cryo = 16</c> wearing a new coat — one whole byte
        /// per slot makes that class of alias impossible <i>by construction</i> rather than by
        /// arithmetic anyone has to get right), and no allocation on any tick path: the array is
        /// built once per citizen, at construction.
        ///
        /// <c>internal</c> so <c>SaveWriter</c>/<c>SaveReader</c>/<c>Simulation.StateHash</c> (same
        /// assembly) can walk it positionally while every other caller goes through
        /// <see cref="GetWorkPriority"/>/<see cref="SetWorkPriority"/> and cannot store a value
        /// outside the domain into a HASHED field.
        /// </summary>
        internal readonly byte[] WorkPrioritiesRaw = DefaultWorkPriorities();

        /// <summary>
        /// The work types this PERSON cannot do at all — one bit per <see cref="WorkType"/>, set =
        /// permanently impossible. <c>0</c> = capable of everything, which is why the mask stores
        /// INCAPABILITY rather than capability: a pawn with no backstory and no traits is capable,
        /// and that must be the uninitialised state.
        ///
        /// ⭐ WHY THIS EXISTS IN A STORAGE-ONLY PACKAGE. In RimWorld a backstory or trait can render
        /// a work type struck through and <b>the player cannot enable it</b>
        /// (<c>docs/design/rimworld-reference.md</c> §1.6; §1.2 is explicit that blank and disabled
        /// are one stored value while INCAPABLE is a different thing entirely). It is a fact about
        /// the PERSON, where a blank priority is an order from the PLAYER: different UI, different
        /// provenance, different lifetime. Shipping only the priority byte would make a later
        /// capability package migrate a hashed, saved field — a SECOND CITZ chapter bump and a
        /// SECOND pin move — where carrying it inside this package's already-paid bump costs
        /// nothing. The SOURCE of incapability (backstories, traits, a skill model) is deliberately
        /// NOT built here; M3-7 is the expected first writer.
        ///
        /// ⚠️ <b>NO WRITER EXISTS AS OF THIS COMMIT.</b> Phrased that way on purpose: "nothing calls
        /// this yet" is a statement about a TREE, and a merge changes the tree.
        ///
        /// ⭐ AND THERE ARE TWO SOURCES, NOT ONE — the representation must not foreclose either.
        /// RimWorld's incapability is not only a categorical backstory/trait flag: the gate is a
        /// THRESHOLD on a continuous capacity, <c>CapableOf(c) =&gt; GetLevel(c) &gt; c.minForCapable</c>
        /// (<c>PawnCapacitiesHandler.cs:78-81</c>, vanilla <c>Moving = 0.15</c>), so an INJURY that
        /// drags a capacity under its floor makes a work type impossible exactly as a backstory
        /// does. A bare bitmask holds both, because it records the CONCLUSION rather than its cause;
        /// a representation that stored "which backstory disabled this" would have foreclosed the
        /// injury-driven half. Neither mechanism is built here.
        ///
        /// ⚠️ WIDTH. Six work types × 1 bit = 6 bits of an 8-bit mask; a NINTH work type would fold
        /// onto bit 0 and hash identically to the first. Pinned by
        /// <c>WorkPriorityStateTests.WorkIncapableMask_IsWideEnoughForEveryWorkType</c>, which
        /// writes that arithmetic out — <c>StateHashHonestyTests.cs</c> predicted the RoomType alias
        /// in prose and the prose did not stop it.
        ///
        /// ⚠️ INVARIANT NOT ENFORCED, deliberately: nothing stops a caller setting a priority on an
        /// incapable type. RimWorld's own <c>Pawn_WorkSettings.SetPriority</c> refuses that, but
        /// refusing is a RULE and a rule is behaviour; this package must stay byte-for-byte inert.
        /// The refusal belongs with the capability SOURCE, which is the only package that can know
        /// the state is reachable.
        /// </summary>
        public byte WorkIncapable;

        /// <summary>
        /// RESERVED, zeroed, and with NO READER AND NO WRITER AS OF THIS COMMIT (a statement about
        /// this tree, which a merge can change) — M3-7's per-citizen skill byte, landed here only
        /// because the CITZ chapter is bumping anyway (W0-1b folded thirteen saved-but-unhashed
        /// fields in one pin move).
        ///
        /// ⚠️ WHAT THIS SAVES M3-7 IS A <b>CHAPTER BUMP AND A SAVE-FORMAT MIGRATION, NOT A RE-PIN</b>
        /// — an earlier draft claimed the re-pin, and that is false:
        /// <c>docs/design/perilune-roadmap-q3.packages.md:403</c> charters M3-7 as a P1/P2/P3 pin row
        /// in its own right ("work rates change on every ship"), so it pays a re-pin whatever this
        /// field does. The saving is real but smaller than advertised, and it IS a saved re-pin for
        /// <see cref="HeldByOrder"/>, whose package (M2-19) is chartered pin-neutral *if* its storage
        /// landed here.
        /// </summary>
        public byte Skill;

        /// <summary>
        /// ⭐⭐ <b>M2-19 — THE STICKY CLAIM. This crew member is executing a DIRECT PLAYER ORDER
        /// ("that machine, NOW"), and until that job ends nothing in the sim may put other work on
        /// her.</b> ⚠️ The header above (M2-1's) called this field RESERVED with no reader; that was
        /// true of M2-1's and M2-8's trees and is FALSE OF THIS ONE — it is read by
        /// <see cref="IsRecruitableIgnoringJob"/>, which every claim gate and the pre-emption gate
        /// share. ⭐ <b>AND M2-9 LANDED ITS WRITER</b> — <c>PrioritiseJobCommand</c>, which composes
        /// the job and then this bool in the order the writer contract below requires.
        ///
        /// <para><b>WHY A HOLD AND NOT A DISPATCHER PREFERENCE.</b> The M2-0 spike measured
        /// <c>MaintenanceSystem.Tick</c> freeing and re-claiming the same pawn inside ONE tick —
        /// the dispatcher saw her idle on 11 ticks of 30 000 — so "work on that, now" cannot be
        /// expressed as a preference something else gets to overrule a tick later. Even with M2-8's
        /// pre-emption in the tree, a directly-ordered pawn at a low band is taken straight back off
        /// her order by the grid. The hold is what outranks the grid.</para>
        ///
        /// <para>⭐ <b>THE MECHANISM IS RIMWORLD'S <c>Job.playerForced</c>, AND ITS PLACEMENT IS THE
        /// DESIGN.</b> <c>docs/design/rimworld-reference.md</c> §2.2 reads the forced flag off
        /// <c>curJob.playerForced</c> — it lives on the JOB and dies with it. So does this:
        /// <b>the INVARIANT is <c>HeldByOrder ⇒ JobKind != JobKind.None</c></b>, enforced at the one
        /// place a job can end (the <see cref="JobKind"/> setter). ⚠️ A hold that could outlive its
        /// job would be a silent, unrecoverable idle bug — a pawn nothing may recruit and nothing
        /// can re-order, which is the exact failure <see cref="OrderedMove"/>'s comment warns about
        /// two fields below. RimWorld's OTHER half — <c>Pawn_MindState.priorityWork</c>, a saved
        /// (cell, workGiver, tick) record that RE-ISSUES the prioritised job and expires after
        /// 30 000 ticks — is deliberately NOT built: it needs a saved target this package may not
        /// add (it is chartered PIN-NEUTRAL on M2-1's storage), and the integrator ruling rejects
        /// the timeout outright ("a timeout makes the hold a race the player cannot see").
        /// <b>That timeout is a MEASURED DIVERGENCE from §2.2, taken on purpose.</b></para>
        ///
        /// <para><b>THE RELEASE PATHS, and there is one mechanism for all of them</b> — every one
        /// ends by writing <c>JobKind = JobKind.None</c>:
        /// <list type="bullet">
        ///   <item><b>COMPLETION</b> — the ordered job finished (e.g.
        ///     <c>MachineWearSystem.cs:366</c>, <c>DigJobSource.cs:169</c>). She returns to normal
        ///     autonomy under the grid.</item>
        ///   <item><b>A NEW DIRECT ORDER</b> — the writer cancels the old job first, so the old hold
        ///     falls with it and the new one is placed on the new job.</item>
        ///   <item><b>DEATH</b> — <c>NeedsSystem.Kill</c> → <see cref="Simulation.CancelJob"/>.</item>
        ///   <item><b>GENUINE INABILITY TO CONTINUE</b> — safety (<c>SafetySystem</c> cancels then
        ///     flees — ⚠️ <b>but NOT for a held pawn since M3-14's rung 4; see below</b>), the
        ///     target vanishing or being walled in
        ///     (<c>MachineWearSystem.AbandonOrphan</c>), a lost path (<c>JobWork.AbandonJob</c>).
        ///     §2.2's analogue: RimWorld drops forced work on drafting and clears the prioritised
        ///     record when the work giver can produce no job. <b>She does not resume it</b> — a
        ///     needs break or a flee that ends the job ends the order too.</item>
        /// </list>
        /// ⛔ <b>NEVER a timeout</b> (integrator ruling).
        ///
        /// <para>⭐⭐ <b>M3-14 (2026-07-31) — AND THE SENTENCE THAT STOOD HERE IS QUOTED AND HALF
        /// RETRACTED, BY OWNER DECISION</b> (batch item 7, answer B). It read: <i>"⛔ never at the
        /// expense of survival: <c>SafetySystem</c> consults no recruitability predicate at all and
        /// <c>SustenanceSystem</c> gates on <see cref="IsIdleForWork"/> …"</i>. <b><c>SafetySystem</c>
        /// now consults exactly one predicate and it is THIS ONE</b> — a held crew member does not
        /// flee lethal air, and <b>she may die</b>. That is RimWorld's rung 4
        /// (<c>rimworld-reference.md</c> §8.4, <c>JobGiver_FindOxygen</c>'s
        /// <c>PlayerForcedJobNowOrSoon</c> guard: <i>"the player can order a colonist to stay and
        /// suffocate"</i>), and it is deliberate.
        /// <br/><b>WHAT SURVIVES OF THE SENTENCE, and it is the half that was about a different
        /// system:</b> <c>SustenanceSystem</c> gates on <see cref="IsIdleForWork"/>, which does NOT
        /// carry the hold — a held pawn who somehow holds no job still eats and drinks. And
        /// <see cref="OrderedMove"/>, the MOVE order, is untouched: a pawn walking somewhere because
        /// the player said so still flees. <b>Only the WORK hold suppresses the rescue.</b></para>
        ///
        /// <para>⚠️ <b>WRITER CONTRACT (for M2-9): SET THE JOB FIRST, THEN THE HOLD.</b> Writing the
        /// hold before a <see cref="Simulation.CancelJob"/> or before the new <see cref="JobKind"/>
        /// would clear it again on the way past <c>None</c>.</para>
        /// </summary>
        public bool HeldByOrder;

        /// <summary>This crew member's manual priority for <paramref name="type"/>;
        /// <see cref="WorkPriority.Off"/> (0) means they will not do it.</summary>
        public byte GetWorkPriority(WorkType type) => WorkPrioritiesRaw[(int)type];

        /// <summary>
        /// Set this crew member's manual priority for <paramref name="type"/>.
        /// RANGE is validated (and only range) because the byte is HASHED state: a value outside
        /// 0..4 has no meaning, would survive a save round-trip, and would silently break any later
        /// packing. Capability is NOT validated here — see <see cref="WorkIncapable"/>.
        /// </summary>
        public void SetWorkPriority(WorkType type, byte priority)
        {
            if (priority > WorkPriority.Lowest)
                throw new ArgumentOutOfRangeException(nameof(priority), priority,
                    "a work priority is " + WorkPriority.Off + " (off) or " + WorkPriority.Highest +
                    ".." + WorkPriority.Lowest + ", 1 highest");
            WorkPrioritiesRaw[(int)type] = priority;
        }

        /// <summary>The player has switched this work type ON for this crew member (any manual
        /// priority at all). The ABSENCE of a priority is what "will not do it" means — there is
        /// no fifth "disabled" value, exactly as in RimWorld's work tab.</summary>
        public bool IsWorkEnabled(WorkType type) => WorkPrioritiesRaw[(int)type] != WorkPriority.Off;

        /// <summary>This PERSON cannot do this work at all — distinct from the player having
        /// switched it off. See <see cref="WorkIncapable"/>.</summary>
        public bool IsIncapableOf(WorkType type) => (WorkIncapable & (1 << (int)type)) != 0;

        /// <summary>
        /// ⭐ <b>M2-2 — THE WORK-TYPE VETO. THE ONE PREDICATE, ASKED AT FIVE GATES.</b> May this
        /// crew member be put on <paramref name="type"/> work right now?
        ///
        /// <para>The five askers, and why there are five rather than one: <c>JobSystem.TryAssign</c>
        /// (the dispatcher, covering all four <see cref="IJobSource"/>s at once),
        /// <c>CraftingSystem.FindNearestReachableIdle</c> and
        /// <c>MaintenanceSystem.FindNearestReachableIdle</c> (two PUSH recruiters that bypass the
        /// dispatcher entirely — a veto in the dispatcher alone leaves both wide open),
        /// <c>EffectValidator.ApplyAgreeTask</c> (the LLM grant), and
        /// <c>CapabilityComputer.Compute</c> (the LLM OFFER — omit it and the crew member agrees in
        /// dialogue to work the player forbade and then does nothing, which is a shipped defect
        /// this repo has already fixed once).</para>
        ///
        /// <para><b>IT IS DELIBERATELY NOT FOLDED INTO <see cref="IsRecruitableForWork"/>.</b> Under
        /// OD-H every work type boots off, so <c>IsRecruitableForWork &amp;&amp; HasAnyWorkEnabled</c>
        /// would close three of the five gates in one line — and it is wrong, not merely coarse.
        /// <see cref="IsRecruitableForWork"/> is a per-CITIZEN fact ("held and player-ordered crew
        /// never self-assign"); this is a per-(citizen, work type) fact. Collapsing them makes
        /// <c>Repair@1 / Haul@off</c> indistinguishable from all-off, silently re-subjects
        /// <c>PlayerOrderPrecedenceTests</c>, and pre-empts M2-19's own use of the property.
        /// The four <c>WorkTypeVetoTests.MixedGrid_*</c> legs are what bite the shortcut (measured:
        /// the fold reddens all four and nothing else).</para>
        ///
        /// <para><b>TWO REASONS TO REFUSE, ONE ANSWER.</b> The player switched it off
        /// (<see cref="GetWorkPriority"/> = <see cref="WorkPriority.Off"/>) or the PERSON cannot do
        /// it (<see cref="WorkIncapable"/>). RimWorld keeps them distinct in the TAB — blank versus
        /// struck through, an order versus a fact — and identical in the DISPATCHER
        /// (<c>docs/design/rimworld-reference.md</c> §1.2, §1.6: "incapable ≠ disabled" is a claim
        /// about provenance and UI, not about whether the pawn takes the job). The incapability
        /// half has no writer as of this commit and is asked anyway, so the capability SOURCE
        /// package (M3-7) does not have to find five gates again.</para>
        ///
        /// <para>Pure state read: no allocation, no RNG, safe on every tick path, and it cannot by
        /// itself move a determinism pin — what moves the pins is the DEFAULT it reads
        /// (<see cref="WorkPriority.Default"/>), which landed in M2-1.</para>
        /// </summary>
        public bool CanTakeWorkType(WorkType type) =>
            WorkPrioritiesRaw[(int)type] != WorkPriority.Off && !IsIncapableOf(type);

        /// <summary>Mark (or clear) a permanent incapability. No consumer yet — the capability
        /// SOURCE is a later package; this exists so the state is reachable and testable.</summary>
        public void SetIncapableOf(WorkType type, bool incapable)
        {
            if (incapable) WorkIncapable |= (byte)(1 << (int)type);
            else WorkIncapable &= (byte)~(1 << (int)type);
        }

        private static byte[] DefaultWorkPriorities()
        {
            var grid = new byte[WorkPriority.WorkTypeCount];
            // Written from the named constant rather than left at the array's implicit zeroes, so
            // that flipping WorkPriority.Default is genuinely a ONE-LINE change: a constant no code
            // reads is not a default, it is a comment that lies.
            for (int i = 0; i < grid.Length; i++) grid[i] = WorkPriority.Default;
            return grid;
        }

        // --- Jobs (M2). Job state lives on the citizen (not in the board) so the
        // JobBoard stays purely derived and saves never serialize it. ---
        /// <summary>
        /// The job this crew member is on; <see cref="JobKind.None"/> = available for work.
        ///
        /// <para>⭐⭐ <b>M2-19 — IT IS A PROPERTY, AND THE ONLY REASON IS THE ONE LINE IN THE
        /// SETTER: writing <see cref="JobKind.None"/> IS "the job ended", so it is also where
        /// <see cref="HeldByOrder"/> is released.</b> Twenty sites in <c>sim/</c> end a job and they
        /// do it in every conceivable way — a source's completion, <c>JobWork.AbandonJob</c>,
        /// <see cref="Simulation.CancelJob"/>, <c>MachineWearSystem.AbandonOrphan</c>,
        /// <c>SafetySystem</c>'s flee, <c>NeedsSystem.Kill</c> — and EVERY ONE of them assigns
        /// <see cref="JobKind.None"/> here. Releasing at those twenty sites instead is the same
        /// five-site discipline that has cost this repo four packages: one missed site is a pawn
        /// held forever on a job that no longer exists, which nothing can recruit and nothing can
        /// re-order. Releasing here cannot miss one.</para>
        ///
        /// <para>The invariant it buys, and the one <see cref="HeldByOrder"/>'s whole design rests
        /// on: <b><c>HeldByOrder ⇒ JobKind != None</c></b>. It is RimWorld's placement, not a
        /// convenience — §2.2 keeps the forced flag on <c>curJob</c>, so it dies with the job.</para>
        ///
        /// <para>Setting any NON-<c>None</c> kind leaves the hold alone, which is what lets a writer
        /// stage a job and then hold it (see <see cref="HeldByOrder"/>'s writer contract). No
        /// allocation, no branch on a hot read — the getter is a field read, and the setter is on
        /// the job-transition path, not the per-tick advance.</para>
        /// </summary>
        public JobKind JobKind
        {
            get => _jobKind;
            set
            {
                // THE RELEASE. Not `if (value != _jobKind)`: SafetySystem writes None (via
                // CancelJob) to a pawn who may already read None, and a held pawn with no job is
                // exactly the state this must never leave standing.
                if (value == JobKind.None) HeldByOrder = false;
                _jobKind = value;
            }
        }

        private JobKind _jobKind;

        public Int3 JobTarget;      // dig tile / item tile / stockpile tile (phase-dependent)
        public uint CarryingItemId; // 0 = empty-handed
        public uint ReservedItemId; // the stack this citizen has claimed (haul/eat); 0 = none
        public int JobWorkTicks;    // remaining work at the job site

        public bool HasPath => PathIndex < Path.Count;

        // E0-1 (recruitability): "idle for work" means carrying no *job* — NOT "standing
        // still". The old `&& !HasPath` excluded any crew mid-wander (AutoWander crew almost
        // always are), collapsing the effective labour pool to ~1.43 of 8: a wanderer was only
        // pickable in the brief settle gap between wander paths. Because this already requires
        // JobKind==None, the ONLY path a citizen carries here is a wander path (or a player
        // MoveCitizenCommand, also JobKind==None — a player who left crew idle-walking is content
        // to have them auto-assigned). Every consumer overwrites that path from the citizen's
        // current tile on claim (JobWork.TryPathToAdjacent / FindPath(sim, citizen.Pos, ...)) or
        // leaves it untouched when nothing is on offer (JobSystem.TryAssign, candidates==0), so a
        // wander path is simply replaced when real work exists — no takeover machinery needed.
        public bool IsIdleForWork => !Dead && !HoldPosition && JobKind == JobKind.None;

        /// <summary>
        /// E0-3 (player-order precedence): executing an explicit <c>MoveCitizenCommand</c>. Set when
        /// the order paths successfully, cleared the moment that path ends — on arrival, when the
        /// route is blocked, or when the crew member flees lethal air. It is therefore true ONLY
        /// while a player-ordered walk is actually in progress, and never survives it.
        /// </summary>
        public bool OrderedMove;

        /// <summary>
        /// Recruitable by the AUTO-WORK dispatchers (jobs, crafting, maintenance). E0-1 relaxed
        /// <see cref="IsIdleForWork"/> so a wandering crew member could be offered work; the same
        /// relaxation made a player's explicit move order — which also carries JobKind.None —
        /// hijackable by an auto-assignment mid-walk. That was latent until E0-3 gave the web
        /// client a dig verb and made auto-work reachable at all; this is the promised revisit.
        ///
        /// Deliberately NOT used by <c>SustenanceSystem</c>: a move order suppresses WORK, never
        /// SURVIVAL. A crew member who crosses a real thirst/hunger threshold mid-order still
        /// diverts to drink or eat, exactly as E0-2's SafetySystem still lets them flee lethal air.
        /// An order the player gave must not be a way to starve someone.
        ///
        /// The guard is <c>OrderedMove &amp;&amp; HasPath</c>, not <c>OrderedMove</c> alone, so it can
        /// only ever bite while the ordered walk is actually in progress. That matters because the
        /// systems allowed to interrupt an order (self-serve, flee) overwrite the citizen's path
        /// wholesale: a bare flag left standing after such an interrupt would lock that crew member
        /// out of work permanently. This way an order protects the walk and nothing more — the
        /// explicit clears on arrival / blocked / flee keep the flag honest, and this keeps a missed
        /// one from being a silent, unrecoverable idle bug.
        /// </summary>
        public bool IsRecruitableForWork => IsRecruitableIgnoringJob && JobKind == JobKind.None;

        /// <summary>
        /// ⭐ <b>M2-8 — <see cref="IsRecruitableForWork"/> WITH THE "carries no job" CLAUSE REMOVED:
        /// everything about this crew member EXCEPT her current job that decides whether work may be
        /// put on her.</b> Dead, held, or mid-ordered-walk still refuse.
        ///
        /// <para>It exists because pre-emption asks a HYPOTHETICAL question about a BUSY pawn —
        /// <i>"if she were free, would anybody have better-banded work for her?"</i> — and
        /// <see cref="IsRecruitableForWork"/> answers <c>false</c> for every busy pawn by
        /// construction, so a pre-emption query routed through it can never fire. See
        /// <c>IWorkOfferSource.HasClaimableWork</c>'s <c>asIfIdle</c> argument, which is the ONLY
        /// caller that may use this in place of <see cref="IsRecruitableForWork"/>.</para>
        ///
        /// <para>⚠️ <b>It is factored OUT of <see cref="IsRecruitableForWork"/> rather than written
        /// beside it</b> — two independent spellings of "dead, held or under orders" are two things
        /// that drift, and the pre-emption gate must never be able to become laxer than the claim
        /// gate it is the hypothetical form of. ⚠️ <b>M2-8 left
        /// <see cref="IsRecruitableForWork"/> byte-for-byte the expression it was
        /// (<c>IsIdleForWork &amp;&amp; !(OrderedMove &amp;&amp; HasPath)</c>); M2-19 ENDED THAT</b> —
        /// adding <see cref="HeldByOrder"/> to this property widened both, so
        /// <see cref="IsRecruitableForWork"/> now also excludes a directly-ordered crew member. The
        /// factoring is what makes that one edit rather than two, and it is the reason the pair
        /// still cannot drift. (The widening is INERT on the claim side — see the placement
        /// paragraph below for why, and for the measurement.)</para>
        ///
        /// <para>⭐⭐ <b>M2-19 — <see cref="HeldByOrder"/> IS PLACED HERE, AND THIS IS THE
        /// PLACEMENT ARGUMENT.</b> The sticky claim has to be un-stealable by EVERY path, and this
        /// is the ONE predicate every path already shares:
        /// <list type="bullet">
        ///   <item><c>JobSystem.Tick</c>'s dispatcher gate (<c>:220</c>) and both push recruiters'
        ///     idle searches (<c>MachineWearSystem.cs:522</c>, <c>CraftingSystem.cs:654</c>) reach
        ///     it through <see cref="IsRecruitableForWork"/>;</item>
        ///   <item>the two LLM gates the enrolment ledger names <b>G4</b> and <b>G5</b> —
        ///     <c>EffectValidator.cs:119</c> (the GRANT) and <c>CapabilityComputer.cs:78</c> (the
        ///     OFFER) — do NOT read this property, and are listed anyway because an auditor of
        ///     "every path" must not have to rediscover them: both gate on
        ///     <c>JobKind == None</c> directly, so a held pawn is refused there for exactly the
        ///     reason the claim gates refuse her, and neither needs the hold spelled out;</item>
        ///   <item>all three <c>IWorkOfferSource.HasClaimableWork</c> implementations reach it
        ///     directly on the <c>asIfIdle</c> branch (<c>JobSystem.cs:622</c>,
        ///     <c>MachineWearSystem.cs:469</c>, <c>CraftingSystem.cs:527</c>);</item>
        ///   <item><b>and so does <c>JobSystem.TryPreempt</c> (<c>:309</c>).</b> M2-8 landed after
        ///     this package was chartered and it can steal a held pawn: her <c>JobKind</c> maps to a
        ///     <see cref="WorkType"/>, so the survival guard does not protect her, and a strictly
        ///     better band takes her off the machine the player pointed at. <i>"That machine,
        ///     NOW"</i> outranks the grid by definition.</item>
        /// </list>
        /// ⚠️ <b>AND HERE IS WHICH OF THOSE SITES CAN ACTUALLY BITE — MEASURED, NOT REASONED.</b>
        /// Because <see cref="HeldByOrder"/> implies she carries a job, and every CLAIM gate (the
        /// three above plus G4/G5) already requires <c>JobKind == None</c>, <b>the claim-side clause
        /// is SUBSUMED and stops nothing</b>;
        /// the whole hold lives on the PRE-EMPTION path. And that path reads this predicate
        /// <b>twice</b> — at <c>TryPreempt</c>'s own gate and again inside the <c>asIfIdle</c> offer
        /// query — so <b>removing the hold from either one alone leaves the suite entirely GREEN
        /// (0/11 twice); only removing both reddens.</b> ⇒ <b>What is pinned is THIS PROPERTY, not
        /// either call site</b>, which is precisely why the hold belongs here and not spelled out at
        /// the sites. ⚠️ The charter's mutation rows 1 and 2 predicted a dispatcher-only hold would
        /// be re-claimed by a push recruiter in the same tick; that was written before M2-2 moved
        /// BOTH push recruiters onto <see cref="IsRecruitableForWork"/>, so the rows do redden
        /// (3/11 each) but by a different mechanism than the one they name. The full measured table
        /// is in <c>tests/Perilune.Tests/StickyClaimTests.cs</c>'s header.</para>
        /// </summary>
        public bool IsRecruitableIgnoringJob =>
            !Dead && !HoldPosition && !HeldByOrder && !(OrderedMove && HasPath);

        public void ClearPath()
        {
            Path.Clear();
            PathIndex = 0;
        }

        /// <summary>
        /// Kick off following the freshly-filled Path from a settled stance. The single
        /// authority for the path-start contract (presenter interpolates PrevPos→Pos).
        /// The first-tile cooldown is a determinism-path value, so callers pass the tuned
        /// <c>sim.Defs.Citizen.TicksPerTile</c> (B4) rather than the retained display const.
        /// </summary>
        public void StartPath(int ticksPerTile)
        {
            PrevPos = Pos;
            PathIndex = 0;
            MoveCooldown = ticksPerTile;
        }
    }

    public enum JobKind : byte
    {
        None = 0,
        Dig = 1,
        HaulPickup = 2,  // en route to the item
        HaulDeliver = 3, // carrying to the stockpile
        Eat = 4,         // en route to food (SustenanceSystem)
        Drink = 5,       // en route to a water tank (SustenanceSystem)
        Craft = 6,       // working a bill at a workstation (CraftingSystem)
        Maintain = 7,    // servicing a worn machine (MaintenanceSystem)
        HaulToBuild = 8, // carrying materials to a build designation (BuildSystem)
        Build = 9,       // constructing at a build designation (BuildSystem)
        Flee = 10,       // walking out of unbreathable air to survive (SafetySystem) — not None, so no
                         //   dispatcher recruits a fleeing crew until it has recovered in safe air
        Deconstruct = 11, // tearing down a designated wall (DeconstructSystem, E0-5) — build's inverse
    }

    /// <summary>
    /// The six player-assignable WORK TYPES (M2-1; owner decision OD-J, 2026-07-29). They are
    /// mapped onto work the sim already does rather than invented: <c>Repair</c> ⇒ the
    /// <c>Maintain</c> job, <c>Construct</c> ⇒ <c>Build</c> + <c>HaulToBuild</c>,
    /// <c>Craft</c> ⇒ <c>Craft</c>, <c>Deconstruct</c> ⇒ <c>Deconstruct</c>, <c>Mine</c> ⇒
    /// <c>Dig</c>, <c>Haul</c> ⇒ <c>HaulPickup</c> + <c>HaulDeliver</c>. Wiring those job kinds to
    /// these types is M2-2's; this file only stores the grid.
    ///
    /// ⛔ <c>Eat</c>, <c>Drink</c> and <c>Flee</c> are NOT work types and never will be. Needs and
    /// self-preservation are not work — RimWorld agrees; you cannot switch off eating.
    ///
    /// ⚠️ <b>THE DECLARATION ORDER IS THE DISPLAY ORDER, NOT THE ARBITRATION RULE.</b> The
    /// equal-priority tie-break is <see cref="WorkPriority.NaturalPriority"/>, an explicit per-type
    /// ranking constant; the column order is DERIVED from it
    /// (<see cref="WorkPriority.RankedOrder"/>) and the two are pinned to agree. ⭐ An earlier draft
    /// of this file encoded "first declared wins" as the rule, and that is wrong in the way that
    /// matters: <c>docs/design/rimworld-reference.md</c> §1.3 measures RimWorld's actual sort key as
    /// <c>naturalPriority + (4 − playerPriority) × 100000</c>, sorted descending, so "left is first"
    /// is a correct PREDICTION only because the tab happens to be displayed in <c>naturalPriority</c>
    /// order — two orderings sharing one key. Implementing left-to-right implements the display.
    /// OD-J is unaffected: <c>Repair · Construct · Craft · Deconstruct · Mine · Haul</c> is still the
    /// owner's chosen ranking (repair first because it is the wreck's premise, haul last as in
    /// RimWorld); it is now encoded as the ranking constant it actually is.
    ///
    /// The values are contiguous from 0 because they index <see cref="Citizen.WorkPrioritiesRaw"/>
    /// and bit-index <see cref="Citizen.WorkIncapable"/>; a gap or a re-based value would leave a
    /// slot no work type addresses and a bit no work type owns. Pinned. The natural-priority table
    /// is keyed by MEMBER NAME rather than by position, so reordering these members re-orders the
    /// display without silently re-ordering the arbitration — which is the whole point of splitting
    /// them, and is itself pinned.
    /// </summary>
    public enum WorkType : byte
    {
        Repair = 0,
        Construct = 1,
        Craft = 2,
        Deconstruct = 3,
        Mine = 4,
        Haul = 5,
    }

    /// <summary>
    /// The domain of a work priority, and the per-type ranking constant that breaks ties.
    /// Analogised from RimWorld's work tab; see <c>docs/design/rimworld-reference.md</c> §1 for the
    /// measured original rather than a restatement of it here. The load-bearing claims:
    ///
    ///   * <b>Manual priorities are 1..4 and <see cref="Highest"/> is 1</b>, not 4 (§1.2). A pawn
    ///     finishes ALL available priority-1 work before starting ANY priority-2 work — a strict
    ///     partition, not a weighting. This reads backwards against the intuition that a bigger
    ///     number is more important, which is exactly why <see cref="Highest"/> and
    ///     <see cref="Lowest"/> are named rather than written as literals at call sites.
    ///   * <b><see cref="Off"/> is the ABSENCE of a priority, not a fifth priority value</b> (§1.2:
    ///     "blank and disabled are the same stored value 0, but INCAPABLE is a different thing
    ///     entirely" — see <see cref="Citizen.WorkIncapable"/>). This is what lets the default be
    ///     the array's natural zero: an uninitialised crew member is a disabled one, and no code has
    ///     to remember to write a default in.
    ///   * <b>Simple (checkbox) mode needs no second field.</b> RimWorld stores one number per work
    ///     type either way; with manual priorities switched off, any non-zero stored priority READS
    ///     as <see cref="SimpleModeEnabled"/> (3), so a checkbox is just "priority != 0". The
    ///     manual/simple toggle itself is GAME-WIDE in RimWorld, not per-pawn — so it is not
    ///     <see cref="Citizen"/> state and is deliberately absent from this chapter. It has no
    ///     storage anywhere yet; see this package's KNOWN LIMITS.
    /// </summary>
    public static class WorkPriority
    {
        /// <summary>Blank: the pawn will not do this work. Not a priority — the absence of one.</summary>
        public const byte Off = 0;

        /// <summary>⚠️ 1 IS THE HIGHEST manual priority (RimWorld's convention).</summary>
        public const byte Highest = 1;

        /// <summary>⚠️ 4 is the LOWEST manual priority — a bigger number means LESS urgent.</summary>
        public const byte Lowest = 4;

        /// <summary>What a ticked checkbox is worth when manual priorities are switched off.
        /// Storage-only today: nothing reads it, and the manual/simple toggle has no home yet.</summary>
        public const byte SimpleModeEnabled = 3;

        /// <summary>
        /// ⭐ THE ONE PLACE THE SHIPPED DEFAULT IS DECIDED — every new crew member's every work type
        /// (<see cref="Citizen.WorkPrioritiesRaw"/>'s initialiser is its only reader, so changing
        /// this line changes the game and moves determinism pins P1/P2/P3).
        ///
        /// ⚠️ <b>A DELIBERATE DIVERGENCE FROM RIMWORLD, NOT AN OVERSIGHT — DO NOT "FIX" IT.</b>
        /// And the divergence is SMALLER than it is usually stated: RimWorld's
        /// <c>EnableAndInitialize</c> also starts from a ZEROED grid — it then enables up to six
        /// work types ranked by the pawn's average relevant skill, PLUS the six flagged
        /// <c>alwaysStartActive</c> (Firefighter, Patient, PatientBedRest, BasicWorker, Hauling,
        /// Cleaning), each at priority 3 (<c>docs/design/rimworld-reference.md</c> §1.4). So the
        /// shared part is the zeroed grid; what this game does not do is either auto-enable.
        /// ⛔ ALWAYS-ACTIVE IS NOT IMPLEMENTED AND IS NOT PENDING — OD-H is default-OFF and that is
        /// decided. Owner decision <b>OD-H</b> (2026-07-29,
        /// re-confirmed): work is opt-in, because that is what delivers <b>OD-G</b> — the pawn boots
        /// idle and waiting and the player's first act is giving an order. <b>OD-I</b> extends the
        /// same one rule to <c>--ship slice</c>, <c>--ship grid</c> and the scenario ship: there is
        /// no authored exception anywhere.
        ///
        /// ⭐ AND NOTE WHAT RIMWORLD'S DEFAULT ACTUALLY IS: <b>skill-shaped, and different per
        /// pawn.</b> That is close to the owner's standing "authored people with real mechanical
        /// differences". Nothing here forecloses it — a later lane can compute the boot grid per
        /// pawn at spawn instead of applying this constant uniformly, and the STORAGE does not care
        /// (it is a per-citizen array either way). <b>Do not read "one constant" as a contract that
        /// the default is uniform.</b> Not built here: there is no skill model to rank by yet.
        ///
        /// <see cref="Citizen.WorkPrioritiesRaw"/>'s initialiser is this constant's only reader, so
        /// changing this line changes the game and moves determinism pins P1/P2/P3. Pinned by
        /// exactly one test (<c>WorkPriorityStateTests.Default_IsOff_ForEveryWorkType_AndOnIsReachable</c>)
        /// so that flipping it moves one test deliberately instead of reddening five by surprise.
        /// </summary>
        public const byte Default = Off;

        /// <summary>Number of <see cref="WorkType"/> members. A compile-time constant: the grid is a
        /// FIXED-length array, which is why <c>Simulation.StateHash</c> deliberately does NOT fold a
        /// length before it (see the fold's note). Pinned against the enum in
        /// <c>WorkPriorityStateTests</c>, so adding a seventh type without widening anything is a
        /// red test rather than a silent save-format change.</summary>
        public const int WorkTypeCount = 6;

        /// <summary>
        /// ⭐ THE EQUAL-PRIORITY TIE-BREAK — a per-work-type ranking constant, HIGHER RANKS FIRST.
        ///
        /// RimWorld's sort key is <c>naturalPriority + (4 − playerPriority) × 100000</c>, sorted
        /// descending, with <c>naturalPriority</c> constrained to 0..10000 so the player's number
        /// can never be overcome (<c>docs/design/rimworld-reference.md</c> §1.3, read out of the
        /// decompiled source). ⚠️ THE ×100000 ARITHMETIC IS NOT IMPLEMENTED HERE — arbitration is
        /// M2-5's, and this package is storage. What is decided here is the only part that has to be
        /// decided before the state exists: that the tie-break is an EXPLICIT PER-TYPE CONSTANT and
        /// not screen position. §1.3 measures exactly that trap — the tab is displayed in
        /// <c>naturalPriority</c> order, so "left is first" predicts the behaviour correctly while
        /// naming the wrong mechanism, and a lane that encodes left-to-right has implemented the
        /// display.
        ///
        /// ⚠️ THESE INTEGERS ARE PERILUNE'S, NOT RIMWORLD'S. Vanilla's table is at
        /// <c>docs/design/rimworld-reference.md:388-407</c> — cited by line rather than restated,
        /// because an earlier draft of THIS comment restated it and got six of nine rows wrong
        /// (Construction 950 not 900, Growing 900 not 700, Mining 850 not 600, Crafting 600 not 400,
        /// Hauling 500 not 300, Cleaning 400 not 200; only Firefighter 1400, Doctor 1300 and
        /// Research 100 were right). A restated table drifts; a line citation does not.
        ///
        /// ⚠️ AND THE SOURCE ITSELF IS NOT SETTLED — recorded, not silently resolved. TWO relayed
        /// copies of the vanilla table, both carrying the same <b>2018 defs mirror (0.19.2009), not
        /// 1.6</b> caveat, DISAGREE in 6 of 20 rows. The merged reference is the authority this file
        /// cites, but no winner is declared, because <b>nothing in the code depends on either</b> —
        /// only the ORDER is used as corroboration, and both copies agree on the order. Anyone with
        /// the game installed settles it in thirty seconds at
        /// <c>Data/Core/Defs/WorkTypeDefs/WorkTypes.xml</c>.
        ///
        /// TWO properties of vanilla's shape are copied deliberately, and one is NOT:
        ///   * COPIED — <b>all values distinct</b>: no two vanilla work types share one
        ///     (reference <c>:394</c>), so RimWorld's stable-sort tie case never arises in the base
        ///     game, and it will not arise here either (pinned).
        ///   * COPIED — <b>bounded 0..10000</b>, so the ×100000 player term can never be overcome.
        ///   * ⭐ NOT COPIED — <b>the gap pattern. Vanilla's gaps are a REGULAR 50 with deliberate
        ///     jumps at the bottom</b> (reference <c>:411</c>); Perilune's below are uneven, 100 to
        ///     200. That is a PERILUNE CHOICE and it does not need vanilla's authority: these are a
        ///     compile-time table today, but they become an input to M2-5's sort key, and a wide gap
        ///     lets a seventh work type be ranked BETWEEN two existing ones without renumbering the
        ///     rest. A future work type is certain. (An earlier draft claimed vanilla clustered
        ///     470/450/430 in a "craft tier" as precedent for this — those numbers appear nowhere in
        ///     the reference and the claim was fabricated. The reasoning above stands alone.)
        /// Vanilla's Hauling and Cleaning being its bottom two — an ORDINAL claim, unaffected by the
        /// numeric disagreement above — independently corroborates OD-J putting Haul last.
        ///
        /// Keyed by MEMBER NAME, never by position, so that reordering the <see cref="WorkType"/>
        /// enum re-orders the DISPLAY without silently re-ordering the ARBITRATION. That separation
        /// is the entire reason this table exists instead of a comment on the enum.
        /// </summary>
        public static int NaturalPriority(WorkType type) => Natural[(int)type];

        private static readonly int[] Natural = BuildNaturalPriorities();

        private static int[] BuildNaturalPriorities()
        {
            var table = new int[WorkTypeCount];
            table[(int)WorkType.Repair] = 900;      // OD-J: first, because it is the wreck's premise
            table[(int)WorkType.Construct] = 700;
            table[(int)WorkType.Craft] = 500;
            table[(int)WorkType.Deconstruct] = 400;
            table[(int)WorkType.Mine] = 300;
            table[(int)WorkType.Haul] = 100;        // OD-J: last, as Hauling is near-last in vanilla
            return table;
        }

        /// <summary>
        /// The work types in ARBITRATION order — <see cref="NaturalPriority"/> descending, ties
        /// broken by declaration order (a stable sort, matching RimWorld's own <c>InsertionSort</c>,
        /// reference §1.3). This is what a work-tab column order should be DERIVED from; column
        /// order is not a fact about the enum. Computed once at type initialisation, never on a tick
        /// path, and it adds no saved or hashed state. <b>No consumer exists as of this commit</b> —
        /// M2-3's column order is its intended first reader.
        /// </summary>
        /// <remarks>Wrapped in <see cref="Array.AsReadOnly{T}"/> rather than returned as the array
        /// itself: an <c>IReadOnlyList&lt;T&gt;</c> backed directly by a <c>T[]</c> can be cast back
        /// to the array and mutated, and this one is a process-global static. The wrapper makes the
        /// cast fail instead of silently re-ranking arbitration for every ship in the process.</remarks>
        public static IReadOnlyList<WorkType> RankedOrder { get; } = Array.AsReadOnly(BuildRankedOrder());

        private static WorkType[] BuildRankedOrder()
        {
            var order = new WorkType[WorkTypeCount];
            for (int i = 0; i < WorkTypeCount; i++) order[i] = (WorkType)i;
            // Insertion sort, descending by natural priority, STABLE: equal ranks keep declaration
            // order. Six elements — chosen for being obviously stable, not for speed.
            for (int i = 1; i < order.Length; i++)
            {
                var held = order[i];
                int j = i - 1;
                while (j >= 0 && NaturalPriority(order[j]) < NaturalPriority(held))
                {
                    order[j + 1] = order[j];
                    j--;
                }
                order[j + 1] = held;
            }
            return order;
        }
    }
}
