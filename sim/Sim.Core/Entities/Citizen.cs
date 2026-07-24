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

        // --- Jobs (M2). Job state lives on the citizen (not in the board) so the
        // JobBoard stays purely derived and saves never serialize it. ---
        public JobKind JobKind;     // None = available for work
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
        public bool IsRecruitableForWork => IsIdleForWork && !(OrderedMove && HasPath);

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
}
