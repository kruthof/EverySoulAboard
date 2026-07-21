using Perilune.Sim;

namespace Perilune.Dsl
{
    /// <summary>
    /// The <c>ship</c> metrics namespace (B5): a READ-ONLY MOSS device exposing the
    /// ship-wide readouts from <see cref="ShipMetrics.Compute"/> — <c>power</c>,
    /// <c>o2</c>, <c>co2</c>, <c>water</c>, <c>food</c>, <c>heat</c>, <c>morale</c>.
    /// Registered on the SHARED <see cref="DeviceRegistry"/> as <c>"ship"</c> so both
    /// player scripts and designer rules can read it; it exposes no verbs, so it cannot
    /// perturb the player-script invariant.
    ///
    /// <see cref="ShipMetrics.Compute"/> is a full scan, so the snapshot is cached and
    /// refreshed AT MOST once per second of sim time (keyed by <c>TickCount /
    /// TicksPerSecond</c>). The cadence is a pure function of the tick, so both
    /// determinism twins recompute at the same ticks and read identical values.
    /// Compute returns a struct and iterates entity lists by index — zero heap
    /// allocation — so a script reading <c>ship.*</c> costs one scan per sim-second and
    /// nothing on the other nine ticks.
    /// </summary>
    public sealed class ShipMetricsAdapter : IScriptable
    {
        private readonly Simulation _sim;
        private ShipMetricsSnapshot _cache;
        private long _cachedSecond = -1;

        public ShipMetricsAdapter(Simulation sim)
        {
            _sim = sim;
        }

        private ShipMetricsSnapshot Snapshot()
        {
            long second = _sim.TickCount / Simulation.TicksPerSecond;
            if (second != _cachedSecond)
            {
                _cache = ShipMetrics.Compute(_sim);
                _cachedSecond = second;
            }
            return _cache;
        }

        public bool TryGetProperty(string name, out DslValue value)
        {
            var m = Snapshot();
            switch (name)
            {
                case "power": value = DslValue.Number(m.Power); return true;
                case "o2": value = DslValue.Number(m.Oxygen); return true; // token parity with room.o2; 0..1 normalized (NOT a % like room.o2)
                case "co2": value = DslValue.Number(m.Co2Ppm); return true;
                case "water": value = DslValue.Number(m.Water); return true;
                case "food": value = DslValue.Number(m.Food); return true;
                case "heat": value = DslValue.Number(m.Heat); return true;
                case "morale": value = DslValue.Number(m.Morale); return true;
                default: value = default; return false;
            }
        }

        public bool TryInvoke(string verb, DslValue[] args, int argCount, out string error)
        {
            error = "ship metrics are read-only";
            return false;
        }
    }
}
