namespace Perilune.Sim
{
    /// <summary>
    /// Shared "is this room safe to breathe in" test — the exact negation of the danger bands
    /// <see cref="NeedsSystem"/> feeds into the suffocation accumulator, so a tile this returns
    /// true for is a tile where suffocation RECOVERS. Kept as one definition so the flee guard
    /// and NeedsSystem can never disagree about what counts as breathable. Pure; no allocation.
    /// </summary>
    public static class AtmosphereSafety
    {
        public static bool IsBreathable(Room room, SimDefs.NeedsDefs needs)
        {
            double pressure = room.PressureKPa;
            if (pressure < needs.VacuumPressureKPa) return false;         // vacuum
            if (pressure * room.O2Fraction < needs.HypoxiaPpO2KPa) return false; // thin air
            if (room.CO2Ppm > needs.Co2NarcosisPpm) return false;         // CO2 narcosis
            double tempC = room.TemperatureK - 273.15;
            if (tempC > needs.HeatStrokeC || tempC < needs.HypothermiaC) return false; // thermal injury
            return true;
        }
    }

    /// <summary>
    /// E0-2 crew-safety guard. A working crew member has no self-preservation: it will stand on a
    /// worksite whose air has turned lethal for the full (now 15-minute) service and suffocate,
    /// even while the rest of the ship breathes fine. This is what killed every procedurally
    /// generated ship once the L1 rebase stretched a maintenance call from 20 s to 900 s — the
    /// servicer is simply pinned in bad air long enough to die.
    ///
    /// The guard runs a small per-crew state machine on top of <see cref="JobKind.Flee"/>:
    ///  • A crew member NOT already fleeing, once its <see cref="Citizen.Suffocation"/> reaches
    ///    <c>needs.FleeSuffocation</c> AND the tile it stands on is not breathable, drops whatever it
    ///    is doing (<see cref="Simulation.CancelJob"/> — cargo dropped, reservations released, as on
    ///    death), takes <c>JobKind.Flee</c>, and paths to the NEAREST breathable tile.
    ///  • While it is <c>Flee</c> it is NOT idle, so no dispatcher recruits it (this is the whole
    ///    point of the dedicated kind: a plain None-with-a-path crew is recruited straight back into
    ///    the bad air and deadlocks). If it reaches the end of its path still unsafe, it re-paths.
    ///  • Once it stands in breathable air AND has recovered below half the flee threshold it returns
    ///    to <c>None</c> and normal work resumes — so it rests in safe air before being sent back,
    ///    which is what stops the flee/return/flee cycle from creeping to death.
    ///
    /// The threshold is well below the lethal 1.0 with ample travel margin at both decline rates, so
    /// a crew member with reachable air always lives; a genuinely sealed-in pocket (no breathable
    /// tile reachable) still kills it, which is a real ship defect the survivability gate should
    /// catch. Registered AFTER <see cref="NeedsSystem"/> so it acts on this tick's fresh suffocation
    /// and after any death is settled; <see cref="CitizenSystem"/> next tick walks the flee path.
    /// Determinism: store-order iteration, no RNG, no dict/set iteration; the pathfind is the shared
    /// deterministic <see cref="PathService"/>. Writes nothing unless a crew member is actually in
    /// lethal air, so on a healthy ship (crew never suffocate) it is inert and moves no hash. Owns
    /// no saved state.
    /// </summary>
    public sealed class SafetySystem : ISimSystem
    {
        public string Name => "Safety";
        public int IntervalTicks => 10; // 1 Hz — matches the cadence at which Suffocation changes

        public void Tick(Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            var needs = sim.Defs.Needs;
            float fleeAt = needs.FleeSuffocation;

            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;

                bool breathingSafely = AtmosphereSafety.IsBreathable(sim.Rooms.RoomAt(sim.World, c.Pos), needs);

                if (c.JobKind == JobKind.Flee)
                {
                    // Recovered in good air ⇒ done fleeing; hand back to normal dispatch. The
                    // half-threshold rest is what breaks the flee→return→flee creep: the crew is
                    // not sent back toward the hazard until it is genuinely out of danger.
                    if (breathingSafely && c.Suffocation < 0.5f * fleeAt)
                    {
                        c.JobKind = JobKind.None;
                        sim.JobsDirty |= JobBoardDirty.Citizens; // available for work again
                        continue;
                    }
                    // Still walking to air ⇒ let CitizenSystem carry it. Arrived but not yet safe
                    // (dead end, or the air moved) ⇒ re-path toward the nearest breathable tile.
                    if (!c.HasPath && !breathingSafely &&
                        sim.Paths.FindNearestBreathable(sim, c.Pos, needs, c.Path))
                        c.StartPath(sim.Defs.Citizen.TicksPerTile);
                    continue;
                }

                // Not fleeing yet: trip only once the danger is real and the air here is bad.
                if (c.Suffocation < fleeAt || breathingSafely) continue;

                if (sim.Paths.FindNearestBreathable(sim, c.Pos, needs, c.Path))
                {
                    // FindNearestBreathable filled c.Path; drop the job (cargo/reservations released,
                    // as on death) WITHOUT clearing that path, then commit to the flee.
                    sim.CancelJob(c);
                    c.JobKind = JobKind.Flee;
                    // E0-3: survival outranks a player order. The flee has already overwritten the
                    // ordered path, so the claim must go with it — otherwise a crew member who fled
                    // an order would stay flagged as "executing" it and never be recruitable again.
                    c.OrderedMove = false;
                    c.StartPath(sim.Defs.Citizen.TicksPerTile);
                }
            }
        }
    }
}
