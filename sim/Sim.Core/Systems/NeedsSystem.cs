using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// Citizen needs v0 (GDD 4.8), polled at 1 Hz. Two tracks, only one of which can
    /// kill you:
    ///
    /// (1) The SUFFOCATION track — a single 0..1 accumulator that every "the
    /// environment is hurting you" condition feeds, so vacuum, hypoxia, CO2 narcosis
    /// and thermal injury all share one meter and one death pipeline. It rises at the
    /// vacuum rate (needs.def `suffocation_per_second_vacuum`, ~90 s to death) in
    /// vacuum, below `severe_hypoxia_ppo2_kpa`, or above 2× `co2_narcosis_ppm`; at the
    /// slow rate (`suffocation_per_second_hypoxia`, ~240 s) below `hypoxia_ppo2_kpa`,
    /// above `co2_narcosis_ppm`, or outside `hypothermia_c`..`heat_stroke_c`; and
    /// otherwise recovers at `suffocation_recovery_per_second` (~30 s from the brink).
    /// At 1.0 the citizen dies.
    ///
    /// (2) The SLOW needs — Hunger, Thirst, Fatigue: monotone ramps clamped at 1. Within
    /// THIS system they feed only <see cref="Citizen.Mood"/> and never touch health, but
    /// Hunger and Thirst are not mood-only ship-wide: <see cref="SustenanceSystem"/>
    /// compares both against sustenance.def `need_threshold` (0.5) in
    /// <c>TryStartNeed</c>/<c>TryServeInPlace</c> to decide when an idle citizen fetches
    /// or consumes — so those two meters gate behaviour as well as mood. Hunger and
    /// Thirst are reset by that same system; Fatigue has NO reducer anywhere in
    /// v0 (there are no beds yet), so it climbs to 1 over ~16 h and stays there,
    /// permanently costing `mood_fatigue_weight` points of mood.
    ///
    /// **CO2 IS A DAMAGE INPUT ONLY.** Nothing in this sim turns an atmosphere reading
    /// into crew action. The complete set of <see cref="Room.CO2Ppm"/> consumers is:
    /// the two thresholds below, the CO2 lens colour ramp (Sim.Glyph LensRamps.Co2),
    /// the HUD/sidebar worst-room figure (ShipMetrics.Co2Ppm), and the MOSS read-only
    /// properties `room.co2` / `ship.co2`. No system, job, effect or Director lever
    /// reads it — <see cref="AtmosphereSystem"/>'s scrubbers run unconditionally while
    /// powered, and a citizen will stand in 60,000 ppm taking damage without ever
    /// choosing to leave. The shipped MOSS program can raise an alarm on it
    /// (`alarm when hydro.co2 > 2000ppm`), and an alarm is a log line, not a response.
    ///
    /// Interactions: reads Room pressure/O2 fraction/CO2/temperature (owned by
    /// <see cref="AtmosphereSystem"/> and ThermalSystem) and
    /// <see cref="RoomState.RoomIdAt"/>. The steady path writes nothing but citizen
    /// fields (all saved in the CITZ chapter and folded into
    /// <see cref="Simulation.StateHash"/> by Simulation, not by this system); only
    /// <see cref="Kill"/> reaches wider — into the item store, the citizen store and
    /// the event bus. Registered AFTER everything that moves people, so a citizen is
    /// judged on the room they are standing in once the tick's movement is settled.
    /// The Mood written here is read by SocialSystem on the very next line of the
    /// stack: a pair's lower mood being below social.def `argument_mood_threshold` is
    /// one of the conditions its argument roll requires (alongside an already-poor
    /// opinion and the dice) — which is how hunger and fatigue end up causing fights.
    ///
    /// Determinism/allocation: store order, no RNG, no LINQ. The steady path allocates
    /// nothing; DEATHS do, twice over — <see cref="_diedThisTick"/> can grow past its
    /// 4-entry capacity in a mass casualty (it is reused, cleared not reallocated,
    /// thereafter), and every <see cref="Kill"/> news up a corpse ItemStack through
    /// <see cref="Simulation.AddItem"/>. Both are per-death, not per-tick. NOT
    /// <see cref="IStatefulSystem"/> — it owns no state between ticks.
    /// </summary>
    public sealed class NeedsSystem : ISimSystem
    {
        public string Name => "Needs";
        public int IntervalTicks => 10; // 1 Hz

        /// <summary>Seconds per pass. Structural: paired with <see cref="IntervalTicks"/>
        /// at the 10 Hz base rate, so every needs.def rate below is genuinely per-second
        /// and is NOT re-derived if the cadence changes.</summary>
        private const float Dt = 1f;

        // Every threshold, suffocation/need rate and mood weight now lives in
        // sim.Defs.Needs (SimDefs.Default reproduces the former consts and inline literals:
        // hypoxia 16/10 kPa, CO2 narcosis 40000 ppm, vacuum 5 kPa, thermal-danger 45/-10 C,
        // suffocation 1/90, 1/240, recovery 1/30, hunger 1/172800, thirst 1/86400, fatigue
        // 1/57600, mood 20 - 40h - 30t - 25f - 60s). The 1f/N rate fields keep their exact
        // compile-time bits (CreateDefault authors them as 1f/N), so B4 default-equivalence
        // holds; Tick reads them each pass so parallel sims never cross-talk. The −273.15 K
        // offset stays inline (fixed physical constant).

        /// <summary>Deaths deferred out of the main loop — <see cref="Kill"/> removes
        /// from the citizen store, which cannot be done while iterating it.</summary>
        private readonly List<Citizen> _diedThisTick = new List<Citizen>(4);

        public void Tick(Simulation sim)
        {
            var citizens = sim.Citizens.Items;
            var rooms = sim.Rooms.Rooms;
            var needs = sim.Defs.Needs;
            _diedThisTick.Clear();

            for (int i = 0; i < citizens.Count; i++)
            {
                var citizen = citizens[i];
                if (citizen.Dead) continue;

                // --- Breathing ---
                ushort roomId = sim.Rooms.RoomIdAt(sim.World, citizen.Pos);
                // A door tile is the threshold between two rooms, not vacuum — passing
                // (or pausing) on one neither suffocates nor recovers; skip this second.
                // NOTE the `continue` skips the WHOLE citizen: hunger, thirst, fatigue
                // and mood also do not advance for a second spent standing in a doorway.
                // Harmless at walking speed (one 1 Hz sample), but it is the reason a
                // citizen parked on a door is frozen in every need, not just breathing.
                if (roomId == RoomState.DoorMarker) continue;
                // Defaults are the lethal ones: an unknown or out-of-range room reads as
                // hard vacuum (ppO2 0) rather than silently as breathable air.
                double ppO2 = 0, co2Ppm = 0;
                bool inVacuum = true;
                if (roomId != 0 && roomId < rooms.Count)
                {
                    var room = rooms[roomId];
                    ppO2 = room.PressureKPa * room.O2Fraction;
                    co2Ppm = room.CO2Ppm;
                    inVacuum = room.PressureKPa < needs.VacuumPressureKPa;
                }

                // Thermal injury (heat stroke / hypothermia) uses the suffocation
                // track: same "environment is killing you" pacing, one death pipeline.
                // 20 °C is the "no room, no reading" fallback, deliberately benign: an
                // unknown or vacuum room must not also read as a thermal hazard. (In
                // vacuum it is moot — the vacuum band below wins regardless.)
                double tempC = 20.0;
                if (roomId != 0 && roomId < rooms.Count) tempC = rooms[roomId].TemperatureK - 273.15;
                bool thermalDanger = tempC > needs.HeatStrokeC || tempC < needs.HypothermiaC;

                // Three-way, fastest cause wins: the fast (vacuum) band, the slow band,
                // then recovery. The 2× on Co2NarcosisPpm is the only inline factor left
                // in the ladder — 40,000 ppm impairs, 80,000 ppm kills at the vacuum rate.
                // Thermal danger only ever reaches the SLOW band: burning and freezing
                // hurt at hypoxia pace, so a hot room is survivable long enough to fix.
                if (inVacuum || ppO2 < needs.SevereHypoxiaPpO2KPa || co2Ppm > 2 * needs.Co2NarcosisPpm)
                    citizen.Suffocation += needs.SuffocationPerSecondVacuum * Dt;
                else if (ppO2 < needs.HypoxiaPpO2KPa || co2Ppm > needs.Co2NarcosisPpm || thermalDanger)
                    citizen.Suffocation += needs.SuffocationPerSecondHypoxia * Dt;
                else
                    // Any fully safe room heals the meter — there is no lasting injury
                    // model in v0, so a citizen who reaches 0.99 and walks out is, a
                    // half-minute later, indistinguishable from one who never suffered.
                    citizen.Suffocation = Math.Max(0f, citizen.Suffocation - needs.SuffocationRecoveryPerSecond * Dt);

                if (citizen.Suffocation >= 1f)
                {
                    _diedThisTick.Add(citizen);
                    continue;
                }

                // --- Slow needs ---
                // Only ever rise here. Hunger/Thirst are cleared by SustenanceSystem
                // (eat/drink); Fatigue has no consumer at all in v0, so it saturates
                // at 1 after ~16 h and never comes back down.
                citizen.Hunger = Math.Min(1f, citizen.Hunger + needs.HungerPerSecond * Dt);
                citizen.Thirst = Math.Min(1f, citizen.Thirst + needs.ThirstPerSecond * Dt);
                citizen.Fatigue = Math.Min(1f, citizen.Fatigue + needs.FatiguePerSecond * Dt);

                // --- Mood (derived scalar for HUD/M3) ---
                // Fully recomputed every pass — Mood holds no history of its own, so
                // nothing else may write it and expect the value to survive a second.
                // With shipped defs the range is (20 - 40 - 30 - 25 - 60) = -135 at
                // worst to +20 at best; it is NOT a percentage and NOT centred on zero.
                // Sinking below zero is one of the preconditions for a SocialSystem
                // argument, so this line is where deprivation becomes interpersonal.
                citizen.Mood = needs.MoodBase
                               - citizen.Hunger * needs.MoodHungerWeight
                               - citizen.Thirst * needs.MoodThirstWeight
                               - citizen.Fatigue * needs.MoodFatigueWeight
                               - citizen.Suffocation * needs.MoodSuffocationWeight;
            }

            // Deaths after the loop (store mutation): the citizen leaves the live store
            // entirely, the corpse item carries their identity, and saves don't
            // accumulate dead entries. Note this does NOT retire the `if (Dead)` guards
            // elsewhere — a dozen live sites still test the flag (see Kill).
            for (int i = 0; i < _diedThisTick.Count; i++)
                Kill(sim, _diedThisTick[i]);
        }

        /// <summary>
        /// Retire a citizen: cancel their job (dropping cargo and releasing every
        /// reservation, so no item stays claimed by a dead claimant), leave a Corpse
        /// stack labelled with their name at the tile they fell on, publish the death
        /// and an alarm, and remove them from the live store. Suffocation is pinned to 1
        /// first so any reference still held to the object reads as unambiguously dead;
        /// the store entry itself is gone, so nothing iterating the store afterwards can
        /// see them. That is NOT the same as "no if-Dead tax anywhere": at least a dozen
        /// live sites still guard on the flag — AtmosphereSystem, CitizenSystem,
        /// JobSystem, SocialSystem, ThermalSystem, SustenanceSystem, ExplorationSystem,
        /// MachineWearSystem, CraftingSystem and BuildSystem all do — because the flag is
        /// set before the removal, callers hold references across it, and several of
        /// those scans run within the same tick as the death.
        ///
        /// The alarm text says "asphyxiation" for EVERY cause on this track, including
        /// heat stroke and hypothermia — the meter does not record which band filled it.
        /// </summary>
        private static void Kill(Simulation sim, Citizen citizen)
        {
            citizen.Suffocation = 1f;
            citizen.Dead = true;
            sim.CancelJob(citizen); // drop cargo, release reservations
            citizen.ClearPath();
            var corpse = sim.AddItem(ItemKind.Corpse, 1, citizen.Pos);
            corpse.Label = citizen.Name;
            sim.Events.Publish(new CitizenDiedEvent { CitizenId = citizen.Id, Pos = citizen.Pos, Name = citizen.Name });
            sim.Events.Publish(new AlarmRaisedEvent { SourceId = citizen.Name, Message = "CITIZEN DOWN — asphyxiation" });
            sim.Citizens.Remove(citizen.Id);
        }
    }
}
