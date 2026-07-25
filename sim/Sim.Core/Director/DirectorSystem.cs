namespace Perilune.Sim
{
    /// <summary>
    /// The Director (WS-NARRATIVE N6; VISION "PERILUNE's answer to RimWorld's storyteller").
    /// Hard rule, non-negotiable: the Director NEVER rolls dice and NEVER spawns events. It
    /// watches the sim's REAL state and modulates pacing through sim-legal levers only. v0
    /// computes a deterministic <see cref="Tension"/> curve and drives ONE lever,
    /// <see cref="WearPressure"/> — a bounded multiplier on machine-wear rate — so quiet
    /// stretches build latent stress (machines grind faster) and incident-heavy stretches
    /// release it (the player gets breathing room). Failure cascades stay 100% physical; the
    /// lever only bends WHEN the existing wear physics bites, never WHAT it does.
    ///
    /// TENSION (0..1): a def-weighted sum of resource/morale DEFICITS read off
    /// <see cref="ShipMetrics"/> (mean-morale, water margin, food-per-head, power served)
    /// plus exponentially-decayed recent alarm/death pressure, clamped to [0,1]. All weights,
    /// the decay factors, the lever bound/target/step and the recompute period are def-tunable
    /// (<see cref="SimDefs.DirectorDefs"/>).
    ///
    /// CADENCE: <see cref="IntervalTicks"/> is 1 so alarm/death events are never missed (the
    /// bus is double-buffered — a coarse sampler drops them, the lesson HistorySystem records);
    /// event counts accumulate every tick. The heavier tension/lever recompute is gated to
    /// every <c>PeriodTicks</c> ticks (~0.1 Hz) — that is "the cadenced pass". Both paths are
    /// zero-alloc: the metrics scan is struct-only and no stream is forked.
    ///
    /// STATE: tension, the lever, and the two decay accumulators are canonical sim state —
    /// <see cref="IStatefulSystem"/>, saved via the SYSS chapter and folded into
    /// <see cref="Simulation.StateHash"/> under the 'DRCT' seed.
    ///
    /// REGISTERED — and it is registered TWICE, in two roles, from one instance. This paragraph
    /// previously said the system "ships UNREGISTERED (the M1 pattern)" and that the integrator
    /// would later add "the single SystemStack line". That happened; the prose did not keep up.
    /// What is actually in <see cref="SystemStack.CreateDefault"/> today:
    ///   • <c>SystemStack.cs:24</c> hoists one instance — <c>var director = new DirectorSystem();</c>
    ///   • <c>:36</c> passes it to <see cref="MachineWearSystem"/>, which reads
    ///     <see cref="WearPressure"/> as a wear multiplier. This is a CONSUMER, not a tick slot.
    ///   • <c>:61</c> registers the instance itself in the tick order (after GoalSystem, before
    ///     HistorySystem), which is what folds 'DRCT' into the hash.
    /// The hoist exists because the consumer is registered EARLIER in the stack than the producer
    /// ticks, so the lever MachineWear reads is always the previous cadenced pass's value.
    ///
    /// Consequence worth knowing before touching this: <see cref="WearPressure"/> is the one
    /// sanctioned path by which crew mood reaches the economy — mean crew <c>Mood</c> becomes
    /// <see cref="ShipMetricsSnapshot.Morale"/>, which weights tension, which moves this lever,
    /// which scales device wear. `docs/design/perilune-economy-modularity.md` §1.5.1 documents that
    /// chain and treats this class as the reference pattern for wiring a soul-derived modulator into
    /// an economy system, so keep this doc comment true.
    /// </summary>
    public sealed class DirectorSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Director";
        public int IntervalTicks => 1;

        public ushort StateVersion => 1;

        private const ulong DrctSeed = 0x44524354UL; // 'DRCT'

        private float _tension;
        private float _wearPressure = 1f;   // the lever's floor and its start value
        private float _alarmAccum;
        private float _deathAccum;

        /// <summary>Latest computed tension, 0..1 (host/HUD/wire-readable).</summary>
        public float Tension => _tension;

        /// <summary>Current wear-rate multiplier, [1, MaxWearPressure] (MachineWearSystem reads it).</summary>
        public float WearPressure => _wearPressure;

        public void Tick(Simulation sim)
        {
            // Every tick: accumulate this tick's incident pressure (double-buffer means a
            // coarser cadence would miss most events). Cheap span reads, no allocation.
            _alarmAccum += sim.Events.Read<AlarmRaisedEvent>().Length;
            _deathAccum += sim.Events.Read<CitizenDiedEvent>().Length;

            var d = sim.Defs.Director;
            int period = d.PeriodTicks > 0 ? d.PeriodTicks : 1;
            if (sim.TickCount % period != 0) return; // not a cadenced pass

            // --- The cadenced pass: recompute tension, move the lever, decay the accumulators. ---
            var m = ShipMetrics.Compute(sim);
            float tension =
                  d.WeightMoraleDeficit * (1f - m.Morale)
                + d.WeightWaterDeficit * (1f - m.Water)
                + d.WeightFoodDeficit * (1f - m.Food)
                + d.WeightPowerDeficit * (1f - m.Power)
                + d.WeightAlarm * _alarmAccum
                + d.WeightDeath * _deathAccum;
            _tension = Clamp01(tension);

            // The lever: below target (quiet) it BUILDS toward the max; above target (after
            // incidents) it RELEASES toward 1.0. Always clamped to [1, MaxWearPressure], so
            // an all-dead-crew / zero-resource state pins it at the floor, never past it.
            float max = d.MaxWearPressure < 1f ? 1f : d.MaxWearPressure;
            float next = _wearPressure + d.LeverStep * (d.LeverTargetTension - _tension);
            _wearPressure = next < 1f ? 1f : (next > max ? max : next);

            _alarmAccum *= d.AlarmDecayPerPeriod;
            _deathAccum *= d.DeathDecayPerPeriod;
        }

        private static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);

        // ------------------------------------------------------------ IStatefulSystem

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(_tension);
            writer.Write(_wearPressure);
            writer.Write(_alarmAccum);
            writer.Write(_deathAccum);
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version < 1 || version > StateVersion) return; // unknown/future blob — skip cleanly
            _tension = reader.ReadSingle();
            _wearPressure = reader.ReadSingle();
            _alarmAccum = reader.ReadSingle();
            _deathAccum = reader.ReadSingle();
        }

        public ulong StateChecksum()
        {
            ulong h = DrctSeed;
            h = XxHash64.Combine(h, _tension);
            h = XxHash64.Combine(h, _wearPressure);
            h = XxHash64.Combine(h, _alarmAccum);
            h = XxHash64.Combine(h, _deathAccum);
            return h;
        }
    }
}
