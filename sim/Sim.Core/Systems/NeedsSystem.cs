using System;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// Citizen needs v0 (GDD 4.8): breathing environment can kill; hunger/fatigue
    /// accumulate (no food/beds until M3 — they clamp and hurt mood, not health).
    /// Thresholds per GDD §5: hypoxia below 16 kPa ppO2, CO2 narcosis at 40k ppm.
    /// </summary>
    public sealed class NeedsSystem : ISimSystem
    {
        public string Name => "Needs";
        public int IntervalTicks => 10; // 1 Hz

        private const float Dt = 1f; // seconds per needs tick (structural, interval-paired)

        // Every threshold, suffocation/need rate and mood weight now lives in
        // sim.Defs.Needs (SimDefs.Default reproduces the former consts and inline literals:
        // hypoxia 16/10 kPa, CO2 narcosis 40000 ppm, vacuum 5 kPa, thermal-danger 45/-10 C,
        // suffocation 1/90, 1/240, recovery 1/30, hunger 1/172800, thirst 1/86400, fatigue
        // 1/57600, mood 20 - 40h - 30t - 25f - 60s). The 1f/N rate fields keep their exact
        // compile-time bits (CreateDefault authors them as 1f/N), so B4 default-equivalence
        // holds; Tick reads them each pass so parallel sims never cross-talk. The −273.15 K
        // offset stays inline (fixed physical constant).

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
                if (roomId == RoomState.DoorMarker) continue;
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
                double tempC = 20.0;
                if (roomId != 0 && roomId < rooms.Count) tempC = rooms[roomId].TemperatureK - 273.15;
                bool thermalDanger = tempC > needs.HeatStrokeC || tempC < needs.HypothermiaC;

                if (inVacuum || ppO2 < needs.SevereHypoxiaPpO2KPa || co2Ppm > 2 * needs.Co2NarcosisPpm)
                    citizen.Suffocation += needs.SuffocationPerSecondVacuum * Dt;
                else if (ppO2 < needs.HypoxiaPpO2KPa || co2Ppm > needs.Co2NarcosisPpm || thermalDanger)
                    citizen.Suffocation += needs.SuffocationPerSecondHypoxia * Dt;
                else
                    citizen.Suffocation = Math.Max(0f, citizen.Suffocation - needs.SuffocationRecoveryPerSecond * Dt);

                if (citizen.Suffocation >= 1f)
                {
                    _diedThisTick.Add(citizen);
                    continue;
                }

                // --- Slow needs ---
                citizen.Hunger = Math.Min(1f, citizen.Hunger + needs.HungerPerSecond * Dt);
                citizen.Thirst = Math.Min(1f, citizen.Thirst + needs.ThirstPerSecond * Dt);
                citizen.Fatigue = Math.Min(1f, citizen.Fatigue + needs.FatiguePerSecond * Dt);

                // --- Mood (derived scalar for HUD/M3) ---
                citizen.Mood = needs.MoodBase
                               - citizen.Hunger * needs.MoodHungerWeight
                               - citizen.Thirst * needs.MoodThirstWeight
                               - citizen.Fatigue * needs.MoodFatigueWeight
                               - citizen.Suffocation * needs.MoodSuffocationWeight;
            }

            // Deaths after the loop (store mutation): the citizen leaves the live store
            // entirely; the corpse item carries their identity. No system pays a
            // permanent if-Dead tax and saves don't accumulate dead entries.
            for (int i = 0; i < _diedThisTick.Count; i++)
                Kill(sim, _diedThisTick[i]);
        }

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
