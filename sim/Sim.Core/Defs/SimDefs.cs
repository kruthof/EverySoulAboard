using System;
using System.Text;

namespace Perilune.Sim
{
    /// <summary>
    /// The data-driven tuning graph: every sim CONSTANT that a designer may want to
    /// retune, mirrored as a plain field so the systems can read <c>sim.Defs.X</c>
    /// instead of a compiled literal (SIMULATION_ARCHITECTURE: "everything data
    /// driven"). <see cref="CreateDefault"/> reproduces today's values bit-for-bit;
    /// <see cref="DefsParser"/> overlays edits from <c>.def</c> text files fail-soft.
    ///
    /// WIRING STATUS: this graph is the SOURCE of the values, not yet the CONSUMER of
    /// them — the systems still read their own consts. B2 adds the ctor param /
    /// plumbing; B3/B4 redirect each system to <c>sim.Defs</c> under a
    /// default-equivalence test (parsed shipped files vs <see cref="CreateDefault"/> →
    /// identical StateHash). Field doc comments record the owning system, unit, current
    /// value, and any derivation B4 must reproduce.
    ///
    /// DETERMINISM: <see cref="SimDefs"/> is NOT folded into Simulation.StateHash (both
    /// determinism twins share one instance). <see cref="Checksum"/> is a separate
    /// XxHash64 over the tunable VALUES (exact float bits, fixed order) so a save/run
    /// can flag "these defs differ from the shipped defaults".
    ///
    /// EXCLUDED BY DESIGN (structural / non-tunable — changing them is a code change,
    /// not a tuning edit, and several are cadence-coupled to StateHash):
    ///   - every system's <c>IntervalTicks</c> and its paired <c>Dt</c>/<c>DtSeconds</c>
    ///     (Atmosphere 0.2, Thermal 0.5, Water 0.5, Needs 1, Hydro 1, Wear derived) —
    ///     a Dt change without the matching interval change silently rescales physics;
    ///   - <c>Simulation.TicksPerSecond</c>/<c>TickSeconds</c> (the clock itself);
    ///   - <c>RoomState.DoorMarker</c> / <c>VacuumVisited</c> sentinels;
    ///   - the 273.15 K Kelvin offset (Wear.KelvinOffset, Needs' inline −273.15);
    ///   - float-accumulation epsilons (Water.DrawEpsilon, Crafting.CompletionEpsilon);
    ///   - fixed physical constants and geometry not surfaced as game knobs:
    ///     the 8.314 gas constant, 2.5 m³/tile volume, and the 0.21/0.79/0.0005 air-mix
    ///     fractions in Room/RoomState.Pressurize.
    /// </summary>
    public sealed class SimDefs
    {
        // ------------------------------------------------------------ machines/power

        /// <summary>One row per DeviceKind, indexed by <c>(int)DeviceKind</c> (mirrors
        /// MachineDefs.Table). Reuses the engine-free <see cref="MachineDef"/> struct.</summary>
        public MachineDef[] Machines;

        /// <summary>MachineDefs.RadiatorRejectKW — kW a powered, operational radiator
        /// rejects (condition-scaled by ThermalSystem). Current: 5.</summary>
        public float RadiatorRejectKW;

        // ------------------------------------------------------------------- recipes

        /// <summary>One crafting recipe per DeviceKind, indexed by <c>(int)DeviceKind</c>
        /// (mirrors CraftingSystem's <c>TryGetRecipe</c> switch). Entries whose
        /// <see cref="RecipeDef.Defined"/> is false are non-crafting kinds.</summary>
        public RecipeDef[] Recipes;

        // ---------------------------------------------------------------- production

        /// <summary>The <c>[production]</c> conversion-graph node table (W0-5), living
        /// BESIDE <see cref="Recipes"/> — multi-input, multi-output, per-node yield, keyed
        /// by node id so two bills on one station coexist instead of overwriting, with
        /// conversion loss carried by the integer input:output ratio (no float anywhere in
        /// the table — W0-5 review B4). Shipped
        /// content declares ZERO nodes, so every shipped station still runs its legacy
        /// <see cref="RecipeDef"/>: <see cref="ProductionDefs.TryGetBill"/> is the single
        /// additive lookup (prefer the node, fall back to the array) and
        /// <see cref="CraftingSystem"/> is its only consumer. An EMPTY table folds nothing
        /// into <see cref="Checksum"/> (the <see cref="Rules"/> precedent), so W0-5 leaves
        /// the shipped defs fingerprint byte-identical.</summary>
        public ProductionDefs Production;

        // -------------------------------------------------------------- sub-sections

        // ------------------------------------------------------------- designer rules

        /// <summary>Ship-wide designer rules authored as MOSS scripts, loaded from
        /// <c>StreamingAssets/SimDefs/rules/*.moss</c> (B5). CONTENT, not player state —
        /// never placed in <c>Simulation.Scripts</c>. Ordinal-sorted by filename; the
        /// rule <see cref="RuleDef.Name"/> is the filename without extension. Both
        /// determinism twins share this instance, so <see cref="DesignerRuleSystem"/>
        /// compiles identical programs for each. Folded into <see cref="Checksum"/>
        /// (name+source bytes) — an empty/absent set leaves the checksum unchanged, so
        /// <see cref="CreateDefault"/>'s fingerprint is identical to pre-B5.</summary>
        public RuleDef[] Rules;

        public ThermalDefs Thermal;
        public AtmosphereDefs Atmosphere;
        public NeedsDefs Needs;
        public SustenanceDefs Sustenance;
        public WaterDefs Water;
        public HydroDefs Hydro;
        public WearDefs Wear;
        public CitizenDefs Citizen;
        public ExplorationDefs Exploration;
        public SocialDefs Social;
        public NavDefs Nav;
        public BuildDefs Build;
        public DeconstructDefs Deconstruct;
        public DirectorDefs Director;

        /// <summary>XxHash64 over every tunable value in the fixed order of
        /// <see cref="ComputeChecksum"/>. Recomputed by CreateDefault and by the parser;
        /// comment/whitespace/row-order edits leave it unchanged, a value edit changes it.</summary>
        public ulong Checksum;

        /// <summary>ThermalSystem constants (all J/W/K doubles; see that file for the
        /// lumped-node model). Excludes Dt (0.5 s, interval-paired).</summary>
        public sealed class ThermalDefs
        {
            /// <summary>ThermalSystem.HeatCapacityJPerKPerTile — J/K per room tile. Current: 53000.</summary>
            public double HeatCapacityJPerKPerTile;
            /// <summary>ThermalSystem.CitizenHeatW — resting metabolic heat per living citizen, W. Current: 100.</summary>
            public double CitizenHeatW;
            /// <summary>ThermalSystem.RadiatorFloorK — radiators never cool below this, K (10 °C). Current: 283.15.</summary>
            public double RadiatorFloorK;
            /// <summary>ThermalSystem.DoorConductOpenWPerK — open-door bulk exchange, W/K. Current: 40.</summary>
            public double DoorConductOpenWPerK;
            /// <summary>ThermalSystem.DoorConductClosedWPerK — closed-door slab conduction, W/K. Current: 8.</summary>
            public double DoorConductClosedWPerK;
            /// <summary>ThermalSystem.HullLossWPerKelvinPerTile — leak per hull-contact tile per K above sink. Current: 0.09.</summary>
            public double HullLossWPerKelvinPerTile;
            /// <summary>ThermalSystem.SpaceSinkK — lunar-night sink temperature, K. Current: 3.</summary>
            public double SpaceSinkK;
            /// <summary>ThermalSystem.MinTemperatureK — integrator clamp floor, K. Current: 3.</summary>
            public double MinTemperatureK;
            /// <summary>ThermalSystem.MaxTemperatureK — integrator clamp ceiling, K. Current: 500.</summary>
            public double MaxTemperatureK;
        }

        /// <summary>AtmosphereSystem constants (currently private consts there). Excludes
        /// Dt (0.2 s) and the air-mix fractions (fixed chemistry).</summary>
        public sealed class AtmosphereDefs
        {
            /// <summary>AtmosphereSystem.FlowCoefficient — mol/(kPa·s) per open door. Current: 0.5.</summary>
            public double FlowCoefficient;
            /// <summary>AtmosphereSystem.O2PerPersonPerSecond — mol/s O2 consumed (0.84 kg/day). Current: 3.04e-4.</summary>
            public double O2PerPersonPerSecond;
            /// <summary>AtmosphereSystem.CO2PerPersonPerSecond — mol/s CO2 produced (1.04 kg/day). Current: 2.73e-4.</summary>
            public double CO2PerPersonPerSecond;
            /// <summary>AtmosphereSystem.VentMolPerSecond — mol/s a powered vent injects. Current: 30.</summary>
            public double VentMolPerSecond;
            /// <summary>AtmosphereSystem.ScrubberMolPerSecond — mol/s CO2 a scrubber removes. Current: 0.001.</summary>
            public double ScrubberMolPerSecond;
            /// <summary>RoomState.NominalPressureKPa — vent target / Pressurize baseline, kPa. Current: 101.3.</summary>
            public double NominalPressureKPa;
            /// <summary>AtmosphereSystem.DiffusionCoefficient — mol/(kPa·s) per open door of
            /// per-species partial-pressure diffusion (the B-3 fix). Same units as
            /// <see cref="FlowCoefficient"/>. Current: 0.5.</summary>
            public double DiffusionCoefficient;
        }

        /// <summary>NeedsSystem thresholds and accumulation rates (currently private consts;
        /// some inline literals — thermal-danger band, vacuum pressure, mood weights).
        /// Excludes Dt (1 s) and the −273.15 K offset. Rate fields keep their exact
        /// <c>1f / N</c> compile-time bits so B4 default-equivalence holds.</summary>
        public sealed class NeedsDefs
        {
            /// <summary>NeedsSystem.HypoxiaPpO2KPa — hypoxia below this ppO2, kPa. Current: 16.</summary>
            public double HypoxiaPpO2KPa;
            /// <summary>NeedsSystem.SevereHypoxiaPpO2KPa — vacuum-rate decline below this, kPa. Current: 10.</summary>
            public double SevereHypoxiaPpO2KPa;
            /// <summary>NeedsSystem.Co2NarcosisPpm — CO2 narcosis onset, ppm (2× = vacuum rate). Current: 40000.</summary>
            public double Co2NarcosisPpm;
            /// <summary>NeedsSystem inline <c>PressureKPa &lt; 5.0</c> — "counts as vacuum", kPa. Current: 5.</summary>
            public double VacuumPressureKPa;
            /// <summary>NeedsSystem inline thermal-danger upper bound, °C. Current: 45.</summary>
            public double HeatStrokeC;
            /// <summary>NeedsSystem inline thermal-danger lower bound, °C. Current: −10.</summary>
            public double HypothermiaC;
            /// <summary>NeedsSystem.SuffocationPerSecondVacuum — 1/s (1f/90f ≈ 90 s to death). Current: 1/90.</summary>
            public float SuffocationPerSecondVacuum;
            /// <summary>NeedsSystem.SuffocationPerSecondHypoxia — 1/s (1f/240f). Current: 1/240.</summary>
            public float SuffocationPerSecondHypoxia;
            /// <summary>NeedsSystem.SuffocationRecoveryPerSecond — 1/s (1f/30f). Current: 1/30.</summary>
            public float SuffocationRecoveryPerSecond;
            /// <summary>NeedsSystem.HungerPerSecond — 1/s (1f/172800f, 2 days to starving). Current: 1/172800.</summary>
            public float HungerPerSecond;
            /// <summary>NeedsSystem.ThirstPerSecond — 1/s (1f/86400f, 1 day to parched). Current: 1/86400.</summary>
            public float ThirstPerSecond;
            /// <summary>NeedsSystem.FatiguePerSecond — 1/s (1f/57600f, 16 h to exhausted). Current: 1/57600.</summary>
            public float FatiguePerSecond;
            /// <summary>NeedsSystem inline mood intercept. Current: 20.</summary>
            public float MoodBase;
            /// <summary>NeedsSystem inline mood penalty per unit Hunger. Current: 40.</summary>
            public float MoodHungerWeight;
            /// <summary>NeedsSystem inline mood penalty per unit Thirst. Current: 30.</summary>
            public float MoodThirstWeight;
            /// <summary>NeedsSystem inline mood penalty per unit Fatigue. Current: 25.</summary>
            public float MoodFatigueWeight;
            /// <summary>NeedsSystem inline mood penalty per unit Suffocation. Current: 60.</summary>
            public float MoodSuffocationWeight;
            /// <summary>SafetySystem.FleeSuffocation — the <see cref="Citizen.Suffocation"/> level
            /// at which a crew member in unbreathable air abandons its job and flees to the nearest
            /// breathable tile (E0-2 crew-safety guard). 0.5 = "halfway to death, get out"; below 1
            /// with ample travel margin at the vacuum/hypoxia decline rates. NeedsSystem does not
            /// read it — SafetySystem does. Current: 0.5.</summary>
            public float FleeSuffocation;
        }

        /// <summary>SustenanceSystem constants (public consts there today).</summary>
        public sealed class SustenanceDefs
        {
            /// <summary>SustenanceSystem.DrinkLiters — liters per drink. Current: 0.5.</summary>
            public float DrinkLiters;
            /// <summary>SustenanceSystem.PotatoHungerValue — hunger removed per potato (800/2200 kcal). Current: 0.36.</summary>
            public float PotatoHungerValue;
            /// <summary>SustenanceSystem.NeedThreshold — self-serve trigger for hunger/thirst. Current: 0.5.</summary>
            public float NeedThreshold;
        }

        /// <summary>WaterSystem constants (public consts there today). Excludes Dt (0.5 s)
        /// and DrawEpsilon.</summary>
        public sealed class WaterDefs
        {
            /// <summary>WaterSystem.TankCapacityLiters — per-tank capacity, L. Current: 500.</summary>
            public float TankCapacityLiters;
            /// <summary>WaterSystem.ReclaimerLitersPerSecond — reclaimer output rate, L/s. Current: 0.05.</summary>
            public float ReclaimerLitersPerSecond;
            /// <summary>WaterSystem.ReclaimEfficiency — recovered fraction (ISS-class 93%). Current: 0.93.</summary>
            public float ReclaimEfficiency;
            /// <summary>WaterSystem.MakeupFloorLiters — self-throttling floor on the shipwide
            /// greywater pool, L. Each Water pass tops the pool up to this level ONLY when it
            /// would otherwise fall below it, and never otherwise — so it conjures exactly the
            /// water the closed loop destroys (irrigation's ~0.256 L/L, drinking's ~7%) and
            /// nothing when the loop is healthy. This is the fix for B-2 (the hydro loop drank
            /// its pool dry ~day 1.2, then every grow bed stalled forever). Current: 20.</summary>
            public float MakeupFloorLiters;
        }

        /// <summary>HydroponicsSystem constants (public consts there today). Excludes Dt (1 s).</summary>
        public sealed class HydroDefs
        {
            /// <summary>HydroponicsSystem.GrowBedWaterPerSecond — irrigation draw, L/s. Current: 0.02.</summary>
            public float GrowBedWaterPerSecond;
            /// <summary>HydroponicsSystem.GrowSecondsPerCrop — DEV RATE, s per crop (not the GDD 12-day cycle). Current: 600.</summary>
            public float GrowSecondsPerCrop;
            /// <summary>HydroponicsSystem inline transpiration-recapture fraction of irrigation. Current: 0.8.</summary>
            public float TranspirationRecaptureFraction;
        }

        /// <summary>MachineWearSystem + MaintenanceSystem constants. Excludes the Interval
        /// (10) and derived DtSeconds, and the 273.15 K offset. MaintenanceWorkSeconds is
        /// the BASE value — MaintenanceSystem derives WorkTicks = WorkSeconds ×
        /// TicksPerSecond (B4 must recompute the tick count from this field).</summary>
        public sealed class WearDefs
        {
            /// <summary>MachineWearSystem.HotThresholdC — wear accelerates above this, °C. Current: 35.</summary>
            public float HotThresholdC;
            /// <summary>MachineWearSystem.WearPerDegreeC — extra wear fraction per °C over threshold. Current: 0.05.</summary>
            public float WearPerDegreeC;
            /// <summary>MachineWearSystem.MaxHeatMultiplier — cap on the heat wear multiplier. Current: 3.</summary>
            public float MaxHeatMultiplier;
            /// <summary>MaintenanceSystem.WorkSeconds — service time (BASE; WorkTicks = ×TicksPerSecond). Current: 900 (E0-2 L1 rebase).</summary>
            public int MaintenanceWorkSeconds;
            /// <summary>MaintenanceSystem.JuryRigCondition — condition after a parts-less repair. Current: 0.6.</summary>
            public float JuryRigCondition;
        }

        /// <summary>CitizenSystem movement constants.</summary>
        public sealed class CitizenDefs
        {
            /// <summary>CitizenSystem.TicksPerTile — ticks to cross one tile (10 = 1 tile/s at 10 Hz). Current: 10 (E0-2 movement retune, was 5).</summary>
            public int TicksPerTile;
            /// <summary>CitizenSystem.IdleTicksBetweenWanders — idle ticks before a wander. Current: 30.</summary>
            public int IdleTicksBetweenWanders;
            /// <summary>CitizenSystem wander scope — an idle-wander target is drawn within this
            /// Chebyshev radius (in tiles) of the citizen's current position (E0-1). Bounds the
            /// wander LOCALLY so crew disperse near their work (short job paths, bounded need
            /// drag) instead of roaming ship-wide, WITHOUT reducing wander cadence — the slice
            /// depends on wandering to desynchronise needs (AuthoredShips.cs:235-241), so we bound
            /// reach, not frequency. A radius ≥ the ship extent reproduces the pre-E0-1 global
            /// wander (the sample box saturates to the whole world). UNTUNED default pending A1
            /// measurement. Current: 8.</summary>
            public int WanderRadiusTiles;
        }

        /// <summary>ExplorationSystem fog-reveal reach.</summary>
        public sealed class ExplorationDefs
        {
            /// <summary>ExplorationSystem.Radius — Chebyshev reveal radius, tiles. Current: 8.</summary>
            public int Radius;
        }

        /// <summary>SocialSystem opinion-graph rates (1 Hz pass; Dt is interval-paired
        /// and structural). Net co-location accrual per pass is familiarize − decay.</summary>
        public sealed class SocialDefs
        {
            /// <summary>SocialSystem — opinion points/hour accrued in BOTH directions while two
            /// living citizens share a room. Current: 2.</summary>
            public float FamiliarizePerHour;
            /// <summary>SocialSystem — opinion points/hour every edge relaxes toward 0 (applies
            /// during co-location too). Current: 0.1.</summary>
            public float DecayPerHour;
            /// <summary>SocialSystem clamp ceiling. Current: 100.</summary>
            public float MaxOpinion;
            /// <summary>SocialSystem clamp floor. Current: −100.</summary>
            public float MinOpinion;

            // --- Relationship-type hysteresis thresholds (S1). Classification enters a
            // type at the ENTER opinion and only leaves at the EXIT opinion (nearer zero),
            // so a type never flickers on a jittering opinion. Eight independent knobs. ---
            /// <summary>SocialSystem — opinion at/above which None→Friend. Current: 30.</summary>
            public float FriendEnterOpinion;
            /// <summary>SocialSystem — opinion below which Friend→None. Current: 20.</summary>
            public float FriendExitOpinion;
            /// <summary>SocialSystem — opinion at/above which →CloseFriend. Current: 60.</summary>
            public float CloseFriendEnterOpinion;
            /// <summary>SocialSystem — opinion below which CloseFriend→Friend. Current: 45.</summary>
            public float CloseFriendExitOpinion;
            /// <summary>SocialSystem — opinion at/below which None→Rival. Current: −30.</summary>
            public float RivalEnterOpinion;
            /// <summary>SocialSystem — opinion above which Rival→None. Current: −20.</summary>
            public float RivalExitOpinion;
            /// <summary>SocialSystem — opinion at/below which →Enemy. Current: −60.</summary>
            public float EnemyEnterOpinion;
            /// <summary>SocialSystem — opinion above which Enemy→Rival. Current: −45.</summary>
            public float EnemyExitOpinion;

            // --- Argument / bond generation (S1). Each co-located pair rolls once per
            // pass against these rates when its gate is open; a fire applies the delta
            // through the single Nudge entry point and publishes the event. ---
            /// <summary>SocialSystem — per-pass argument probability when the gate is open. Current: 0.05.</summary>
            public float ArgumentChancePerPass;
            /// <summary>SocialSystem — per-pass bond probability when the gate is open. Current: 0.02.</summary>
            public float BondChancePerPass;
            /// <summary>SocialSystem — argument gate: min mood in the pair must be below this. Current: 0.</summary>
            public float ArgumentMoodThreshold;
            /// <summary>SocialSystem — argument gate: from→to opinion must be at/below this. Current: −20.</summary>
            public float ArgumentOpinionCeiling;
            /// <summary>SocialSystem — bond gate: from→to opinion must be at/above this. Current: 20.</summary>
            public float BondOpinionFloor;
            /// <summary>SocialSystem — opinion delta (both directions) applied on an argument. Current: −8.</summary>
            public float ArgumentOpinionDelta;
            /// <summary>SocialSystem — opinion delta (both directions) applied on a bond. Current: 5.</summary>
            public float BondOpinionDelta;
        }

        /// <summary>NavSystem space-layer tuning (1 Hz pass; Dt interval-paired). Chart
        /// units are megameters (Mm); the linear-drift/no-orbital-mechanics model is the
        /// flagged honest simplification.</summary>
        public sealed class NavDefs
        {
            /// <summary>NavSystem — ship delta-v budget at start, m/s. Current: 1000.</summary>
            public float InitialDeltaVMps;
            /// <summary>NavSystem — flat delta-v cost per burn, m/s. Current: 100.</summary>
            public float BurnCostMps;
            /// <summary>NavSystem — transit speed toward a target, Mm/s. Current: 0.5.</summary>
            public float TransitSpeedMmPerS;
            /// <summary>NavSystem — detection when snr = emission × (ref_range/dist)² clears this. Current: 1.</summary>
            public float TelescopeSnrThreshold;
            /// <summary>NavSystem — range (Mm) at which a unit-emission contact is exactly at threshold. Current: 400.</summary>
            public float TelescopeReferenceRangeMm;
        }

        /// <summary>BuildSystem (WS-MATTER) build/refit costs. Material is always Regolith
        /// in v0; these tune how much of it each build kind wants and how long it takes to
        /// raise, plus a concurrency guard on the number of open designations. Construct
        /// times are whole ticks (10 Hz), so they are interval-agnostic and safe as defs.</summary>
        public sealed class BuildDefs
        {
            /// <summary>BuildSystem — Regolith units a Wall designation stages before it builds. Current: 2.</summary>
            public int WallMaterial;
            /// <summary>BuildSystem — work ticks to raise a Wall once materialed (240 s at 10 Hz). Current: 2400 (E0-2 L1 rebase, was 60).</summary>
            public int WallConstructTicks;
            /// <summary>BuildSystem — Regolith units a Door designation stages before it builds. Current: 1.</summary>
            public int DoorMaterial;
            /// <summary>BuildSystem — work ticks to hang a Door once materialed (180 s at 10 Hz). Current: 1800 (E0-2 L1 rebase, was 40).</summary>
            public int DoorConstructTicks;
            /// <summary>BuildSystem — cap on concurrent pending designations; a designate past it
            /// is a deterministic no-op (a runaway/queue guard, not a per-site buffer). Current: 64.</summary>
            public int MaxStaged;
        }

        /// <summary>DeconstructSystem (E0-5) strip costs — build's inverse. A stripped WALL returns
        /// a FRACTION of the Regolith raising it consumed, so the loop is lossy and one-way; a
        /// stripped DEVICE returns <c>floor(device_parts × Condition)</c> Parts, which is
        /// <see cref="Device.Condition"/>'s second consumer in the whole repo (every other reader
        /// outside MachineWearSystem is display-only). Work ticks are whole ticks at 10 Hz, so they
        /// are interval-agnostic and safe as defs.</summary>
        public sealed class DeconstructDefs
        {
            /// <summary>DeconstructSystem — fraction of <see cref="BuildDefs.WallMaterial"/> a
            /// stripped wall returns, floored to whole units (2 × 0.5 → 1). DECIMAL: parses with
            /// InvariantCulture, or de-DE reads "0.5" as 5. Current: 0.5.</summary>
            public float WallRecovery;
            /// <summary>DeconstructSystem — work ticks to tear a Wall down (120 s at 10 Hz), half
            /// <see cref="BuildDefs.WallConstructTicks"/>: tearing down is faster than building.
            /// Current: 1200.</summary>
            public int WallWorkTicks;
            /// <summary>DeconstructSystem — cap on concurrent pending deconstruct designations; a
            /// designate past it is a deterministic no-op. Mirrors
            /// <see cref="BuildDefs.MaxStaged"/>. Current: 64.</summary>
            public int MaxStaged;
            /// <summary>DeconstructSystem (E0-5 WP-2) — base <see cref="ItemKind.Parts"/> a stripped
            /// device returns, BEFORE the <c>floor(× Condition)</c> scaling, so only a machine in
            /// good repair is worth its full value and a wreck is worth nothing. 2 matches the
            /// MachineShop's 2-Parts input (one stripped machine ≈ one ControllerModule of value)
            /// and exactly two <see cref="WearDefs"/> overhauls, which consume one Part each.
            /// Current: 2.</summary>
            public int DeviceParts;
            /// <summary>DeconstructSystem (E0-5 WP-2) — work ticks to strip a device (90 s at
            /// 10 Hz). Between a maintenance service (900) and a wall tear-down (1200): pulling a
            /// machine is quicker than cutting structure. Current: 900.</summary>
            public int DeviceWorkTicks;
        }

        /// <summary>DirectorSystem (WS-NARRATIVE N6) tension curve + one lever. The Director
        /// never rolls dice or spawns events (VISION honesty contract): it reads real sim
        /// state into a tension scalar and modulates pacing through a sim-legal lever only —
        /// here <c>WearPressure</c>, a multiplier on machine-wear rate bounded to
        /// [1, <see cref="MaxWearPressure"/>]. Tension is a weighted sum of resource/morale
        /// DEFICITS (each 0..1, from <see cref="ShipMetrics"/>) plus exponentially-decayed
        /// recent alarm/death pressure, clamped to 0..1. The recompute is cadenced every
        /// <see cref="PeriodTicks"/> ticks; event counting runs every tick (double-buffer).</summary>
        public sealed class DirectorDefs
        {
            /// <summary>Tension weight on the mean-morale deficit (1 − morale). Current: 0.4.</summary>
            public float WeightMoraleDeficit;
            /// <summary>Tension weight on the water margin deficit (1 − stored/capacity). Current: 0.2.</summary>
            public float WeightWaterDeficit;
            /// <summary>Tension weight on the food deficit (1 − food-per-head fraction). Current: 0.2.</summary>
            public float WeightFoodDeficit;
            /// <summary>Tension weight on the power deficit (1 − served/demand). Current: 0.2.</summary>
            public float WeightPowerDeficit;
            /// <summary>Tension weight per unit of decayed recent-alarm pressure. Current: 0.1.</summary>
            public float WeightAlarm;
            /// <summary>Tension weight per unit of decayed recent-death pressure. Current: 0.5.</summary>
            public float WeightDeath;
            /// <summary>Per-period multiplier applied to the alarm accumulator (exponential decay, 0..1). Current: 0.9.</summary>
            public float AlarmDecayPerPeriod;
            /// <summary>Per-period multiplier applied to the death accumulator (exponential decay, 0..1). Current: 0.95.</summary>
            public float DeathDecayPerPeriod;
            /// <summary>Upper bound on the WearPressure lever (lower bound is a fixed 1.0). Current: 1.35.</summary>
            public float MaxWearPressure;
            /// <summary>Tension the lever curve targets: below it (quiet) the lever BUILDS toward
            /// the max; above it (after incidents) the lever RELEASES toward 1.0. Current: 0.35.</summary>
            public float LeverTargetTension;
            /// <summary>Per-period step of the lever toward/away from the bound, scaled by
            /// (target − tension). Current: 0.1.</summary>
            public float LeverStep;
            /// <summary>Ticks between tension/lever recomputes (~0.1 Hz at 100). Structural to the
            /// decay cadence, but exposed as a designer knob for pacing feel. Current: 100.</summary>
            public int PeriodTicks;
        }

        /// <summary>Fresh graph holding today's constants verbatim. The parser always starts
        /// from a fresh copy of this; <see cref="Default"/> is frozen and never mutated.</summary>
        public static SimDefs CreateDefault()
        {
            var d = new SimDefs
            {
                RadiatorRejectKW = 5f,

                // Index = (int)DeviceKind — verbatim copy of MachineDefs.Table.
                Machines = new[]
                {
                    //                    draw   gen  tier                   blocks heat  wear/h  maint fail
                    /* Door            */ new MachineDef(0.1f,  0f, PowerTier.Defense,     false, 0.05f, 0.002f, 0.3f, 0.05f),
                    /* AirVent         */ new MachineDef(0.5f,  0f, PowerTier.LifeSupport, false, 0.2f,  0.010f, 0.4f, 0.10f),
                    /* Scrubber        */ new MachineDef(0.4f,  0f, PowerTier.LifeSupport, false, 0.4f,  0.012f, 0.4f, 0.10f),
                    /* Ladder          */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* Terminal        */ new MachineDef(0.1f,  0f, PowerTier.Defense,     false, 0.1f,  0.001f, 0.2f, 0.02f),
                    /* SolarWing       */ new MachineDef(0f,    6f, PowerTier.Comfort,     false, 0f,    0.004f, 0.4f, 0.10f),
                    /* Battery         */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0.1f,  0.002f, 0.3f, 0.05f),
                    /* Conduit         */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* Light           */ new MachineDef(0.15f, 0f, PowerTier.Comfort,     false, 0.15f, 0.001f, 0.2f, 0.02f),
                    /* GrowBed         */ new MachineDef(0.6f,  0f, PowerTier.Industry,    false, 0.5f,  0.008f, 0.4f, 0.10f),
                    /* WaterTank       */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0.001f, 0.2f, 0.02f),
                    /* Pipe            */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* Reclaimer       */ new MachineDef(0.8f,  0f, PowerTier.LifeSupport, false, 0.6f,  0.012f, 0.4f, 0.10f),
                    /* Fabricator      */ new MachineDef(3f,    0f, PowerTier.Industry,    false, 2.5f,  0.020f, 0.4f, 0.10f),
                    /* MachineShop     */ new MachineDef(2f,    0f, PowerTier.Industry,    false, 1.6f,  0.020f, 0.4f, 0.10f),
                    /* SalvageRecycler */ new MachineDef(1.5f,  0f, PowerTier.Industry,    false, 1.2f,  0.018f, 0.4f, 0.10f),
                    /* Radiator        */ new MachineDef(0.2f,  0f, PowerTier.LifeSupport, false, 0f,    0.006f, 0.4f, 0.10f),
                    // Furniture: inert rows (no draw/heat/wear), like Ladder.
                    /* Bed             */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* Table           */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* Chair           */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* MedBed          */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* MedCabinet      */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* Locker          */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* Desk            */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* PlantPot        */ new MachineDef(0f,    0f, PowerTier.Comfort,     false, 0f,    0f,     0f,   0f),
                    /* Telescope       */ new MachineDef(0.4f,  0f, PowerTier.Industry,    false, 0.2f,  0.004f, 0.4f, 0.10f),
                },

                Thermal = new ThermalDefs
                {
                    HeatCapacityJPerKPerTile = 53_000.0,
                    CitizenHeatW = 100.0,
                    RadiatorFloorK = 283.15,
                    DoorConductOpenWPerK = 40.0,
                    DoorConductClosedWPerK = 8.0,
                    HullLossWPerKelvinPerTile = 0.09,
                    SpaceSinkK = 3.0,
                    MinTemperatureK = 3.0,
                    MaxTemperatureK = 500.0,
                },

                Atmosphere = new AtmosphereDefs
                {
                    FlowCoefficient = 0.5,
                    O2PerPersonPerSecond = 3.04e-4,
                    CO2PerPersonPerSecond = 2.73e-4,
                    VentMolPerSecond = 30.0,
                    ScrubberMolPerSecond = 0.001,
                    NominalPressureKPa = 101.3,
                    DiffusionCoefficient = 0.5,
                },

                Needs = new NeedsDefs
                {
                    HypoxiaPpO2KPa = 16.0,
                    SevereHypoxiaPpO2KPa = 10.0,
                    Co2NarcosisPpm = 40_000.0,
                    VacuumPressureKPa = 5.0,
                    HeatStrokeC = 45.0,
                    HypothermiaC = -10.0,
                    SuffocationPerSecondVacuum = 1f / 90f,
                    SuffocationPerSecondHypoxia = 1f / 240f,
                    SuffocationRecoveryPerSecond = 1f / 30f,
                    HungerPerSecond = 1f / 172_800f,
                    ThirstPerSecond = 1f / 86_400f,
                    FatiguePerSecond = 1f / 57_600f,
                    MoodBase = 20f,
                    MoodHungerWeight = 40f,
                    MoodThirstWeight = 30f,
                    MoodFatigueWeight = 25f,
                    MoodSuffocationWeight = 60f,
                    FleeSuffocation = 0.5f, // E0-2 crew-safety guard (SafetySystem)
                },

                Sustenance = new SustenanceDefs
                {
                    DrinkLiters = 0.5f,
                    PotatoHungerValue = 0.36f,
                    NeedThreshold = 0.5f,
                },

                Water = new WaterDefs
                {
                    TankCapacityLiters = 500f,
                    ReclaimerLitersPerSecond = 0.05f,
                    ReclaimEfficiency = 0.93f,
                    MakeupFloorLiters = 20f,
                },

                Hydro = new HydroDefs
                {
                    GrowBedWaterPerSecond = 0.02f,
                    GrowSecondsPerCrop = 600f,
                    TranspirationRecaptureFraction = 0.8f,
                },

                Wear = new WearDefs
                {
                    HotThresholdC = 35f,
                    WearPerDegreeC = 0.05f,
                    MaxHeatMultiplier = 3f,
                    MaintenanceWorkSeconds = 900,
                    JuryRigCondition = 0.6f,
                },

                Citizen = new CitizenDefs
                {
                    TicksPerTile = 10,
                    IdleTicksBetweenWanders = 30,
                    WanderRadiusTiles = 8,
                },

                Exploration = new ExplorationDefs
                {
                    Radius = 8,
                },

                Social = new SocialDefs
                {
                    FamiliarizePerHour = 2f,
                    DecayPerHour = 0.1f,
                    MaxOpinion = 100f,
                    MinOpinion = -100f,

                    FriendEnterOpinion = 30f,
                    FriendExitOpinion = 20f,
                    CloseFriendEnterOpinion = 60f,
                    CloseFriendExitOpinion = 45f,
                    RivalEnterOpinion = -30f,
                    RivalExitOpinion = -20f,
                    EnemyEnterOpinion = -60f,
                    EnemyExitOpinion = -45f,

                    ArgumentChancePerPass = 0.05f,
                    BondChancePerPass = 0.02f,
                    ArgumentMoodThreshold = 0f,
                    ArgumentOpinionCeiling = -20f,
                    BondOpinionFloor = 20f,
                    ArgumentOpinionDelta = -8f,
                    BondOpinionDelta = 5f,
                },

                Nav = new NavDefs
                {
                    InitialDeltaVMps = 1000f,
                    BurnCostMps = 100f,
                    TransitSpeedMmPerS = 0.5f,
                    TelescopeSnrThreshold = 1f,
                    TelescopeReferenceRangeMm = 400f,
                },

                Build = new BuildDefs
                {
                    WallMaterial = 2,
                    WallConstructTicks = 2400,
                    DoorMaterial = 1,
                    DoorConstructTicks = 1800,
                    MaxStaged = 64,
                },

                Deconstruct = new DeconstructDefs
                {
                    WallRecovery = 0.5f,
                    WallWorkTicks = 1200,
                    MaxStaged = 64,
                    DeviceParts = 2,
                    DeviceWorkTicks = 900,
                },

                Director = new DirectorDefs
                {
                    WeightMoraleDeficit = 0.4f,
                    WeightWaterDeficit = 0.2f,
                    WeightFoodDeficit = 0.2f,
                    WeightPowerDeficit = 0.2f,
                    WeightAlarm = 0.1f,
                    WeightDeath = 0.5f,
                    AlarmDecayPerPeriod = 0.9f,
                    DeathDecayPerPeriod = 0.95f,
                    MaxWearPressure = 1.35f,
                    LeverTargetTension = 0.35f,
                    LeverStep = 0.1f,
                    PeriodTicks = 100,
                },
            };

            // Index = (int)DeviceKind — verbatim copy of CraftingSystem.TryGetRecipe.
            d.Recipes = new RecipeDef[d.Machines.Length];
            d.Recipes[(int)DeviceKind.SalvageRecycler] = new RecipeDef(ItemKind.Regolith, 1, ItemKind.Scrap, 2, 600);
            d.Recipes[(int)DeviceKind.Fabricator] = new RecipeDef(ItemKind.Scrap, 2, ItemKind.Parts, 1, 900);
            d.Recipes[(int)DeviceKind.MachineShop] = new RecipeDef(ItemKind.Parts, 2, ItemKind.ControllerModule, 1, 1800);

            // W0-5: the conversion-graph container ships EMPTY. Shipped crafting is still
            // the three legacy rows above, reached through TryGetBill's fallback leg.
            d.Production = new ProductionDefs { Nodes = Array.Empty<ProductionNode>() };

            d.ComputeChecksum();
            return d;
        }

        /// <summary>Frozen reference graph. Treat as read-only: the parser starts from a
        /// fresh <see cref="CreateDefault"/> and never mutates this instance.</summary>
        public static readonly SimDefs Default = CreateDefault();

        /// <summary>
        /// Fold every tunable value into <see cref="Checksum"/> in a FIXED, documented
        /// order (floats/doubles via their exact bits, so formatting never matters —
        /// only the numeric value). Order: RadiatorRejectKW → each machine row (8 fields)
        /// → Thermal → Atmosphere → Needs → Sustenance → Water → Hydro → Wear → Citizen
        /// → Exploration → each recipe (6 fields) → Social (4 fields) → Nav (5 fields)
        /// → Social S1 tunables (15 fields, appended) → Build (5 fields, appended)
        /// → Director (12 fields, appended) → Production nodes (W0-5, appended; a no-op
        /// while the table is empty) → Atmosphere.DiffusionCoefficient (B-3, appended)
        /// → Deconstruct (E0-5, 3 fields, appended) → Deconstruct device fields (E0-5 WP-2,
        /// 2 fields, appended).
        /// Appending a field
        /// ⇒ append one fold at the END (before the rules fold, which stays last so an
        /// empty rule set remains a no-op) so existing checksums stay comparable.
        /// </summary>
        public ulong ComputeChecksum()
        {
            ulong h = 0;

            h = XxHash64.Combine(h, RadiatorRejectKW);

            for (int i = 0; i < Machines.Length; i++)
            {
                var m = Machines[i];
                h = XxHash64.Combine(h, m.DrawKW);
                h = XxHash64.Combine(h, m.GenerationKW);
                h = XxHash64.Combine(h, (ulong)(byte)m.Tier);
                h = XxHash64.Combine(h, m.Blocks ? 1UL : 0UL);
                h = XxHash64.Combine(h, m.HeatKW);
                h = XxHash64.Combine(h, m.WearPerHour);
                h = XxHash64.Combine(h, m.MaintainBelow);
                h = XxHash64.Combine(h, m.FailBelow);
            }

            h = XxHash64.Combine(h, Thermal.HeatCapacityJPerKPerTile);
            h = XxHash64.Combine(h, Thermal.CitizenHeatW);
            h = XxHash64.Combine(h, Thermal.RadiatorFloorK);
            h = XxHash64.Combine(h, Thermal.DoorConductOpenWPerK);
            h = XxHash64.Combine(h, Thermal.DoorConductClosedWPerK);
            h = XxHash64.Combine(h, Thermal.HullLossWPerKelvinPerTile);
            h = XxHash64.Combine(h, Thermal.SpaceSinkK);
            h = XxHash64.Combine(h, Thermal.MinTemperatureK);
            h = XxHash64.Combine(h, Thermal.MaxTemperatureK);

            h = XxHash64.Combine(h, Atmosphere.FlowCoefficient);
            h = XxHash64.Combine(h, Atmosphere.O2PerPersonPerSecond);
            h = XxHash64.Combine(h, Atmosphere.CO2PerPersonPerSecond);
            h = XxHash64.Combine(h, Atmosphere.VentMolPerSecond);
            h = XxHash64.Combine(h, Atmosphere.ScrubberMolPerSecond);
            h = XxHash64.Combine(h, Atmosphere.NominalPressureKPa);

            h = XxHash64.Combine(h, Needs.HypoxiaPpO2KPa);
            h = XxHash64.Combine(h, Needs.SevereHypoxiaPpO2KPa);
            h = XxHash64.Combine(h, Needs.Co2NarcosisPpm);
            h = XxHash64.Combine(h, Needs.VacuumPressureKPa);
            h = XxHash64.Combine(h, Needs.HeatStrokeC);
            h = XxHash64.Combine(h, Needs.HypothermiaC);
            h = XxHash64.Combine(h, Needs.SuffocationPerSecondVacuum);
            h = XxHash64.Combine(h, Needs.SuffocationPerSecondHypoxia);
            h = XxHash64.Combine(h, Needs.SuffocationRecoveryPerSecond);
            h = XxHash64.Combine(h, Needs.HungerPerSecond);
            h = XxHash64.Combine(h, Needs.ThirstPerSecond);
            h = XxHash64.Combine(h, Needs.FatiguePerSecond);
            h = XxHash64.Combine(h, Needs.MoodBase);
            h = XxHash64.Combine(h, Needs.MoodHungerWeight);
            h = XxHash64.Combine(h, Needs.MoodThirstWeight);
            h = XxHash64.Combine(h, Needs.MoodFatigueWeight);
            h = XxHash64.Combine(h, Needs.MoodSuffocationWeight);
            h = XxHash64.Combine(h, Needs.FleeSuffocation); // E0-2 crew-safety guard (append-only)

            h = XxHash64.Combine(h, Sustenance.DrinkLiters);
            h = XxHash64.Combine(h, Sustenance.PotatoHungerValue);
            h = XxHash64.Combine(h, Sustenance.NeedThreshold);

            h = XxHash64.Combine(h, Water.TankCapacityLiters);
            h = XxHash64.Combine(h, Water.ReclaimerLitersPerSecond);
            h = XxHash64.Combine(h, Water.ReclaimEfficiency);
            h = XxHash64.Combine(h, Water.MakeupFloorLiters);

            h = XxHash64.Combine(h, Hydro.GrowBedWaterPerSecond);
            h = XxHash64.Combine(h, Hydro.GrowSecondsPerCrop);
            h = XxHash64.Combine(h, Hydro.TranspirationRecaptureFraction);

            h = XxHash64.Combine(h, Wear.HotThresholdC);
            h = XxHash64.Combine(h, Wear.WearPerDegreeC);
            h = XxHash64.Combine(h, Wear.MaxHeatMultiplier);
            h = XxHash64.Combine(h, (ulong)(uint)Wear.MaintenanceWorkSeconds);
            h = XxHash64.Combine(h, Wear.JuryRigCondition);

            h = XxHash64.Combine(h, (ulong)(uint)Citizen.TicksPerTile);
            h = XxHash64.Combine(h, (ulong)(uint)Citizen.IdleTicksBetweenWanders);
            h = XxHash64.Combine(h, (ulong)(uint)Citizen.WanderRadiusTiles);

            h = XxHash64.Combine(h, (ulong)(uint)Exploration.Radius);

            for (int i = 0; i < Recipes.Length; i++)
            {
                var r = Recipes[i];
                h = XxHash64.Combine(h, r.Defined ? 1UL : 0UL);
                h = XxHash64.Combine(h, (ulong)(byte)r.Input);
                h = XxHash64.Combine(h, (ulong)(uint)r.InputCount);
                h = XxHash64.Combine(h, (ulong)(byte)r.Output);
                h = XxHash64.Combine(h, (ulong)(uint)r.OutputCount);
                h = XxHash64.Combine(h, (ulong)(uint)r.WorkSeconds);
            }

            h = XxHash64.Combine(h, Social.FamiliarizePerHour);
            h = XxHash64.Combine(h, Social.DecayPerHour);
            h = XxHash64.Combine(h, Social.MaxOpinion);
            h = XxHash64.Combine(h, Social.MinOpinion);

            h = XxHash64.Combine(h, Nav.InitialDeltaVMps);
            h = XxHash64.Combine(h, Nav.BurnCostMps);
            h = XxHash64.Combine(h, Nav.TransitSpeedMmPerS);
            h = XxHash64.Combine(h, Nav.TelescopeSnrThreshold);
            h = XxHash64.Combine(h, Nav.TelescopeReferenceRangeMm);

            // Social S1 relationship-type + argument/bond tunables, APPENDED here (after
            // the original Social(4)/Nav(5) folds, before the rules fold) so every prior
            // checksum stays byte-comparable.
            h = XxHash64.Combine(h, Social.FriendEnterOpinion);
            h = XxHash64.Combine(h, Social.FriendExitOpinion);
            h = XxHash64.Combine(h, Social.CloseFriendEnterOpinion);
            h = XxHash64.Combine(h, Social.CloseFriendExitOpinion);
            h = XxHash64.Combine(h, Social.RivalEnterOpinion);
            h = XxHash64.Combine(h, Social.RivalExitOpinion);
            h = XxHash64.Combine(h, Social.EnemyEnterOpinion);
            h = XxHash64.Combine(h, Social.EnemyExitOpinion);
            h = XxHash64.Combine(h, Social.ArgumentChancePerPass);
            h = XxHash64.Combine(h, Social.BondChancePerPass);
            h = XxHash64.Combine(h, Social.ArgumentMoodThreshold);
            h = XxHash64.Combine(h, Social.ArgumentOpinionCeiling);
            h = XxHash64.Combine(h, Social.BondOpinionFloor);
            h = XxHash64.Combine(h, Social.ArgumentOpinionDelta);
            h = XxHash64.Combine(h, Social.BondOpinionDelta);

            // Build (WS-MATTER M1) costs, APPENDED after Social S1 and before the rules
            // fold so every prior checksum stays byte-comparable.
            h = XxHash64.Combine(h, (ulong)(uint)Build.WallMaterial);
            h = XxHash64.Combine(h, (ulong)(uint)Build.WallConstructTicks);
            h = XxHash64.Combine(h, (ulong)(uint)Build.DoorMaterial);
            h = XxHash64.Combine(h, (ulong)(uint)Build.DoorConstructTicks);
            h = XxHash64.Combine(h, (ulong)(uint)Build.MaxStaged);

            // Director (WS-NARRATIVE N6) tension weights + lever bounds + cadence, APPENDED
            // after Build and before the rules fold so every prior checksum stays comparable.
            h = XxHash64.Combine(h, Director.WeightMoraleDeficit);
            h = XxHash64.Combine(h, Director.WeightWaterDeficit);
            h = XxHash64.Combine(h, Director.WeightFoodDeficit);
            h = XxHash64.Combine(h, Director.WeightPowerDeficit);
            h = XxHash64.Combine(h, Director.WeightAlarm);
            h = XxHash64.Combine(h, Director.WeightDeath);
            h = XxHash64.Combine(h, Director.AlarmDecayPerPeriod);
            h = XxHash64.Combine(h, Director.DeathDecayPerPeriod);
            h = XxHash64.Combine(h, Director.MaxWearPressure);
            h = XxHash64.Combine(h, Director.LeverTargetTension);
            h = XxHash64.Combine(h, Director.LeverStep);
            h = XxHash64.Combine(h, (ulong)(uint)Director.PeriodTicks);

            // Production graph (W0-5) node table, APPENDED after Director and before the
            // rules fold. An EMPTY table folds NOTHING — exactly the RuleDef precedent — so
            // CreateDefault's fingerprint is identical to pre-W0-5 and every previously
            // recorded defs checksum stays byte-comparable. Rows fold in TABLE ORDER: unlike
            // [machines]/[recipes] this section is an ordered list, and reordering it changes
            // which node TryGetBill resolves, so the order is a value, not formatting.
            if (Production != null && Production.Nodes != null)
            {
                for (int i = 0; i < Production.Nodes.Length; i++)
                {
                    var n = Production.Nodes[i];
                    h = XxHash64.Hash(Encoding.UTF8.GetBytes(n.Id ?? ""), h);
                    h = XxHash64.Combine(h, (ulong)(byte)n.Station);
                    h = XxHash64.Combine(h, (ulong)(uint)n.WorkSeconds);
                    int inCount = n.Inputs == null ? 0 : n.Inputs.Length;
                    h = XxHash64.Combine(h, (ulong)(uint)inCount);
                    for (int p = 0; p < inCount; p++)
                    {
                        h = XxHash64.Combine(h, (ulong)(byte)n.Inputs[p].Kind);
                        h = XxHash64.Combine(h, (ulong)(uint)n.Inputs[p].Count);
                    }
                    int outCount = n.Outputs == null ? 0 : n.Outputs.Length;
                    h = XxHash64.Combine(h, (ulong)(uint)outCount);
                    for (int p = 0; p < outCount; p++)
                    {
                        h = XxHash64.Combine(h, (ulong)(byte)n.Outputs[p].Kind);
                        h = XxHash64.Combine(h, (ulong)(uint)n.Outputs[p].Count);
                    }
                }
            }

            // Atmosphere.DiffusionCoefficient (B-3 gas-transport fix), APPENDED after
            // Production and before the rules fold so every prior checksum stays byte-
            // comparable. It sits here rather than beside the other Atmosphere folds above for
            // the same reason every field since Social-S1 does: append-at-END is the invariant
            // (README.def HANDOVER INVARIANT #3), and inserting mid-block would renumber the
            // fold order of everything after it.
            h = XxHash64.Combine(h, Atmosphere.DiffusionCoefficient);

            // Deconstruct (E0-5 strip costs), APPENDED after Atmosphere.DiffusionCoefficient and
            // before the rules fold — the append-at-END invariant (README.def HANDOVER INVARIANT
            // #3), so every previously recorded checksum stays byte-comparable and only the
            // trailing bytes change. WP-2's device_parts / device_work_ticks append HERE, after
            // MaxStaged, for the same reason.
            h = XxHash64.Combine(h, Deconstruct.WallRecovery);
            h = XxHash64.Combine(h, (ulong)(uint)Deconstruct.WallWorkTicks);
            h = XxHash64.Combine(h, (ulong)(uint)Deconstruct.MaxStaged);

            // Deconstruct DEVICE fields (E0-5 WP-2), appended after MaxStaged exactly as the
            // block above promised — the SECOND defs-checksum move this lane makes, and a
            // deliberate one: WP-1 held these back because a def with no consumer has no honest
            // tripwire, and DeconstructSystem.DeviceYield / Designate are that consumer.
            h = XxHash64.Combine(h, (ulong)(uint)Deconstruct.DeviceParts);
            h = XxHash64.Combine(h, (ulong)(uint)Deconstruct.DeviceWorkTicks);

            // Designer rules (B5). Folded LAST so existing checksums stay comparable and
            // an empty/absent set is a no-op (CreateDefault's fingerprint is unchanged).
            // Name+source enter as UTF-8 bytes in loaded order (Ordinal-sorted filenames),
            // so retuning a rule's text changes the checksum, mirroring a value edit.
            if (Rules != null)
            {
                for (int i = 0; i < Rules.Length; i++)
                {
                    h = XxHash64.Hash(Encoding.UTF8.GetBytes(Rules[i].Name ?? ""), h);
                    h = XxHash64.Hash(Encoding.UTF8.GetBytes(Rules[i].Source ?? ""), h);
                }
            }

            Checksum = h;
            return h;
        }
    }

    /// <summary>
    /// One ship-wide designer rule: a MOSS program authored in a data file (B5).
    /// <see cref="Name"/> is the source filename without extension (also the SYSS
    /// save key and the alarm SourceId); <see cref="Source"/> is the raw MOSS text,
    /// compiled by <see cref="DesignerRuleSystem"/>. Rules are game CONTENT — they
    /// never enter <c>Simulation.Scripts</c> (the player-script invariant).
    /// </summary>
    public readonly struct RuleDef
    {
        public readonly string Name;
        public readonly string Source;

        public RuleDef(string name, string source)
        {
            Name = name;
            Source = source;
        }
    }

    /// <summary>
    /// One crafting recipe (mirrors CraftingSystem's private <c>Recipe</c> as data).
    /// <see cref="Defined"/> distinguishes a real recipe from an empty array slot —
    /// the Recipes array is indexed by <c>(int)DeviceKind</c> and most kinds have none.
    /// <see cref="WorkSeconds"/> is the BASE value; CraftingSystem derives the tick
    /// count as <c>WorkSeconds × Simulation.TicksPerSecond</c>.
    /// </summary>
    public readonly struct RecipeDef
    {
        public readonly bool Defined;
        public readonly ItemKind Input;
        public readonly int InputCount;
        public readonly ItemKind Output;
        public readonly int OutputCount;
        public readonly int WorkSeconds;

        public RecipeDef(ItemKind input, int inputCount, ItemKind output, int outputCount, int workSeconds)
        {
            Defined = true;
            Input = input; InputCount = inputCount;
            Output = output; OutputCount = outputCount;
            WorkSeconds = workSeconds;
        }
    }
}
