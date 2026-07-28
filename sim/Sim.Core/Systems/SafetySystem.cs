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

        /// <summary>Is the air at <paramref name="tile"/> survivable? The tile form of
        /// <see cref="IsBreathable"/>, resolving the room the way every other caller does.</summary>
        public static bool IsBreathable(Simulation sim, Int3 tile) =>
            IsBreathable(sim.Rooms.RoomAt(sim.World, tile), sim.Defs.Needs);
    }

    /// <summary>
    /// THE WORKSITE STAGING RULE — <b>a crew member is only ever staged where it can survive.</b>
    /// One predicate, asked by the two places in the whole sim that choose the tile a worker will
    /// stand on to do a job: <see cref="JobWork.TryPathToAdjacent"/> (dig, build, deconstruct) and
    /// <c>MaintenanceSystem.TryFindStagingTile</c>.
    ///
    /// WHY IT EXISTS — the maintenance/deconstruct LIVELOCK (docs/HANDOVER.md §5 item 2). A
    /// dispatcher that stages a worker in unbreathable air gets a crew member who walks there,
    /// suffocates to <c>flee_suffocation</c>, is pulled off the job by <see cref="SafetySystem"/>,
    /// recovers in good air, is re-offered the SAME job by the very next pass, and repeats forever.
    /// Nothing anywhere remembers that the last attempt ended in a flee, and the target never stops
    /// being needy because no work ever lands on it. Measured, <c>--ship grid</c>, seed 20260723,
    /// 14 sim-days: from ~h270 the eight deck-2 doors sit in vacuum below <c>maintain_below</c> and
    /// the crew burn ~70 % of every crew-tick on Maintain with ~21 % on Flee, completing 2 services
    /// in the last hour against 643 job starts. It reads as 91 % busy and scores A1 PASS.
    ///
    /// WHY REFUSING IS NOT A LOSS OF CAPABILITY, and this is the load-bearing argument. Suffocation
    /// reaches the flee threshold in <c>flee_suffocation / suffocation_per_second_*</c> — 45 s in
    /// vacuum, 120 s in thin air or CO2 narcosis at the shipped defaults — while the SHORTEST job
    /// that stands still at a tile is a 90 s device strip, and the rest run 120 s (wall strip),
    /// 240 s (wall build), 600 s (dig) and 900 s (a maintenance service). A job staged in
    /// unbreathable air therefore cannot be completed by anyone, so this rule denies only work that
    /// could never have landed. The single theoretical exception is a device strip in *thin* air
    /// entered with zero accumulated suffocation (90 s of work against a 120 s deadline); it is
    /// refused too, deliberately, rather than special-cased.
    ///
    /// IT IS A LIVE PREDICATE, NOT A BLACKLIST AND NOT A BACKOFF. Nothing is remembered, nothing is
    /// saved, nothing is hashed: every staging attempt re-reads the room, so repressurising a
    /// compartment makes its work available again on the very next pass with no timer to wait out.
    /// That is why this is a gate and not a WP-7-style per-tile stamp.
    ///
    /// INERT WITHOUT <see cref="SafetySystem"/>, which is the whole reason it can be a hard refusal
    /// rather than a rate limiter. The livelock is not caused by bad air; it is caused by the flee
    /// guard pulling a worker off a job that the dispatcher then hands straight back. On a stack
    /// with no <see cref="SafetySystem"/> nothing pulls a worker off, so there is no cycle to break
    /// — and, just as important, a bare test sim or a host that models no atmosphere has every room
    /// at 0 kPa, where an unconditional rule would stop ALL work everywhere. Same shape as
    /// <c>MachineWearSystem</c>'s injected Director: absent sibling ⇒ byte-identical prior
    /// behaviour.
    ///
    /// ⚠️ THE COST, taken deliberately and recorded (MECHANICS.md §13.21): the bug goes from
    /// expensive-and-visible to CHEAP-AND-INVISIBLE, exactly as E0-4 WP-7's haul backoff did
    /// (MECHANICS.md §13.17). A designation painted in an airless compartment now simply never
    /// progresses, silently, with nothing on any surface saying why. <see cref="CanStageWorkerAt"/>
    /// is public so a future wire channel can ask it per tile and finally say so.
    ///
    /// Allocation-free; no RNG, no dictionary/set iteration, no order of its own.
    /// </summary>
    public static class WorksiteSafety
    {
        /// <summary>May a worker be parked on <paramref name="tile"/> for the length of a job?
        /// True when this stack cannot produce the cycle at all (see <see cref="CanCycle"/>), or
        /// when the tile's air is survivable.</summary>
        public static bool CanStageWorkerAt(Simulation sim, Int3 tile) =>
            !CanCycle(sim) || AtmosphereSafety.IsBreathable(sim, tile);

        /// <summary>
        /// Can this stack produce the walk/flee/recover/walk cycle at all? It takes BOTH halves and
        /// the rule is inert unless both are present:
        ///   • a <see cref="NeedsSystem"/>, or <see cref="Citizen.Suffocation"/> never rises and a
        ///     worker in vacuum simply works;
        ///   • a <see cref="SafetySystem"/>, or nothing ever pulls that worker off its job.
        /// Requiring both is not defensive coding — it is the precise statement of what the bug
        /// needs, and it is what keeps the rule out of the way of every sim that models no
        /// atmosphere. Such a sim has EVERY room at 0 kPa, where an unconditional rule would stop
        /// all work everywhere; several shipped test fixtures build exactly that (a full stack
        /// minus NeedsSystem, on an ASCII map nobody pressurised).
        ///
        /// Resolved by scanning <see cref="Simulation.Systems"/> — deliberately NOT cached in a
        /// static (parallel sims with different stacks must never cross-talk) and not cached on the
        /// caller (three call sites, three lifetimes). The array is a handful of entries and this
        /// runs only while a job is being claimed or a servicer staged, never per tile per tick.
        /// </summary>
        private static bool CanCycle(Simulation sim)
        {
            bool needs = false, guard = false;
            var systems = sim.Systems;
            for (int i = 0; i < systems.Length; i++)
            {
                if (systems[i] is NeedsSystem) needs = true;
                else if (systems[i] is SafetySystem) guard = true;
            }
            return needs && guard;
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
