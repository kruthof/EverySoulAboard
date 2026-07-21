namespace Moonbase.Sim
{
    /// <summary>The systems-sidebar readout (concept UI): 0..1 fractions + CO2 ppm.</summary>
    public struct ShipMetricsSnapshot
    {
        public float Power;       // served demand / total demand (1 = no shedding)
        public float Oxygen;      // mean O2 fraction of pressurized rooms vs 21%
        public double Co2Ppm;     // worst pressurized room
        public float Water;       // stored / capacity across tanks
        public float Food;        // potatoes per citizen vs a 5-per-head comfort target
        public float Heat;        // fraction of pressurized rooms in the 10..35C comfort band
        public float Structural;  // mean machine condition (proxy until hull stress exists)
        public float Morale;      // mean mood mapped from [-100..100] to [0..1]
        public int Day;
        public double DayFraction;
    }

    public static class ShipMetrics
    {
        /// <summary>Cheap full scan — call from UI at ~1 Hz, never per tick.</summary>
        public static ShipMetricsSnapshot Compute(Simulation sim)
        {
            var m = new ShipMetricsSnapshot();

            // Power: demand vs powered demand.
            float demand = 0f, served = 0f;
            float tankStored = 0f, tankCapacity = 0f;
            float conditionSum = 0f;
            int conditionCount = 0;
            var devices = sim.Devices.Items;
            var machines = sim.Defs.Machines;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                var def = machines[(int)d.Kind];
                float draw = def.DrawKW;
                if (draw > 0f)
                {
                    demand += draw;
                    if (d.Powered) served += draw;
                }
                if (d.Kind == DeviceKind.WaterTank)
                {
                    tankStored += d.StoredLiters;
                    tankCapacity += sim.Defs.Water.TankCapacityLiters;
                }
                if (def.WearPerHour > 0f)
                {
                    conditionSum += d.Condition;
                    conditionCount++;
                }
            }
            m.Power = demand <= 0f ? 1f : served / demand;
            m.Water = tankCapacity <= 0f ? 0f : tankStored / tankCapacity;
            m.Structural = conditionCount == 0 ? 1f : conditionSum / conditionCount;

            // Atmosphere & heat over pressurized rooms.
            var rooms = sim.Rooms.Rooms;
            int pressurized = 0, comfy = 0;
            double o2Sum = 0, worstCo2 = 0;
            for (int i = 1; i < rooms.Count; i++)
            {
                var room = rooms[i];
                if (room.PressureKPa < 50.0) continue;
                pressurized++;
                o2Sum += room.O2Fraction;
                if (room.CO2Ppm > worstCo2) worstCo2 = room.CO2Ppm;
                double tempC = room.TemperatureK - 273.15;
                if (tempC >= 10.0 && tempC <= 35.0) comfy++;
            }
            m.Oxygen = pressurized == 0 ? 0f : (float)(o2Sum / pressurized / 0.21);
            if (m.Oxygen > 1f) m.Oxygen = 1f;
            m.Co2Ppm = worstCo2;
            m.Heat = pressurized == 0 ? 0f : comfy / (float)pressurized;

            // Food & morale.
            int potatoes = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
                if (items[i].Kind == ItemKind.Potato) potatoes += items[i].Count;
            var citizens = sim.Citizens.Items;
            float moodSum = 0f;
            for (int i = 0; i < citizens.Count; i++) moodSum += citizens[i].Mood;
            int pop = citizens.Count;
            m.Food = pop == 0 ? 0f : System.Math.Min(1f, potatoes / (pop * 5f));
            m.Morale = pop == 0 ? 0f : (moodSum / pop + 100f) / 200f;

            m.Day = (int)(sim.TickCount / SimClockUtil.TicksPerDay);
            m.DayFraction = sim.TickCount % SimClockUtil.TicksPerDay / (double)SimClockUtil.TicksPerDay;
            return m;
        }
    }
}
