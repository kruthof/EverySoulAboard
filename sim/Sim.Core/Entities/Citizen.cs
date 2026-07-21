using System.Collections.Generic;

namespace Moonbase.Sim
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

        public bool IsIdleForWork => !Dead && !HoldPosition && JobKind == JobKind.None && !HasPath;

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
    }
}
