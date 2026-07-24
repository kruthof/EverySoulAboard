namespace Perilune.Sim
{
    /// <summary>
    /// M1 citizen behavior: follow the current path tile-by-tile; when idle, wander
    /// to a random reachable tile. Jobs replace wandering in M2 — the movement and
    /// path plumbing here stays.
    /// </summary>
    public sealed class CitizenSystem : ISimSystem
    {
        public string Name => "Citizens";
        public int IntervalTicks => 1;

        /// <summary>1 tile/s at 10 Hz — a measured walk on 1 m tiles (E0-2 movement retune,
        /// was 5 = 2 tiles/s). Reads the compiled DEFAULT — retained only for the frozen
        /// Game.View DISPLAY path (IsoWorldPresenter interpolates movement with it and has no
        /// <c>SimDefs</c> in scope). Every determinism read is migrated: CitizenSystem.Tick
        /// and Citizen.StartPath both take <c>sim.Defs.Citizen.TicksPerTile</c> (B4;
        /// SimDefs.CreateDefault mirrors this const), so no sim cadence flows through this
        /// const.</summary>
        public const int TicksPerTile = 10;

        // IdleTicksBetweenWanders (30) now lives in sim.Defs.Citizen (SimDefs.Default
        // reproduces it). Tick reads both movement scalars each pass so parallel sims
        // with different defs never cross-talk.

        public void Tick(Simulation sim)
        {
            var paths = sim.Paths;
            var citizens = sim.Citizens.Items;
            var rng = sim.Rng;
            int ticksPerTile = sim.Defs.Citizen.TicksPerTile;
            int idleTicksBetweenWanders = sim.Defs.Citizen.IdleTicksBetweenWanders;
            int wanderRadius = sim.Defs.Citizen.WanderRadiusTiles; // E0-1: bound the wander locally

            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                if (citizen.Dead) continue;

                if (citizen.HasPath)
                {
                    if (--citizen.MoveCooldown > 0) continue;
                    var next = citizen.Path[citizen.PathIndex];
                    if (!IsStepStillValid(sim, next))
                    {
                        citizen.ClearPath(); // blocked (door closed etc.) — re-decide next tick
                        citizen.OrderedMove = false; // E0-3: a dead-ended order releases its claim
                        citizen.IdleCooldown = 1;
                        continue;
                    }
                    citizen.PrevPos = citizen.Pos;
                    citizen.Pos = next;
                    citizen.PathIndex++;
                    citizen.MoveCooldown = ticksPerTile;
                    if (!citizen.HasPath)
                    {
                        citizen.IdleCooldown = idleTicksBetweenWanders;
                        // E0-3: arrival ends the order. From here the crew member is recruitable
                        // again — the order bought them the walk, not permanent idleness.
                        citizen.OrderedMove = false;
                    }
                }
                else
                {
                    // Let the final step's interpolation window run out, then settle:
                    // PrevPos == Pos is the presenter's "stand exactly on the tile" signal.
                    if (citizen.MoveCooldown > 0 && --citizen.MoveCooldown == 0)
                        citizen.PrevPos = citizen.Pos;

                    if (!citizen.AutoWander || citizen.HoldPosition) continue;
                    if (citizen.JobKind != JobKind.None) continue; // working citizens don't wander
                    if (--citizen.IdleCooldown > 0) continue;
                    citizen.IdleCooldown = idleTicksBetweenWanders;
                    if (paths.TryRandomWalkableTileNear(sim, rng, citizen.Pos, wanderRadius, out var target) && target != citizen.Pos)
                    {
                        if (paths.FindPath(sim, citizen.Pos, target, citizen.Path))
                        {
                            citizen.PrevPos = citizen.Pos; // start interpolation from a settled stance
                            citizen.PathIndex = 0;
                            citizen.MoveCooldown = ticksPerTile;
                        }
                        else
                        {
                            citizen.ClearPath();
                        }
                    }
                }
            }
        }

        private static bool IsStepStillValid(Simulation sim, Int3 next) => sim.IsWalkable(next);
    }
}
