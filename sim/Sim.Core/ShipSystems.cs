using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Perilune.Sim
{
    /// <summary>The MOSS ledger's four-rung state ladder. APPEND-ONLY (the wire ships the byte).</summary>
    public enum ShipSystemState : byte
    {
        Nominal = 0,
        Attend = 1,
        Degraded = 2,
        Offline = 3,
    }

    /// <summary>
    /// One row of the MOSS phosphor ledger (`docs/design/perilune-moss-terminal.spec.md` §1.1).
    /// <see cref="Load"/> is 0..100 or <b>-1</b> ("no meaningful load" — the client renders an
    /// empty bar and `--`). <see cref="FaultDay"/> is -1 when no fault attributes to this row,
    /// in which case <see cref="FaultText"/> is "".
    ///
    /// <para>NOTE on the LOAD column: it is the row's PRIMARY GAUGE, not uniformly a
    /// utilisation percentage. `reactor`/`life_support`/`thermal` are utilisations (demand ÷
    /// capacity); `water_reclaim` is tank fill; `hydroponics` is mean crop progress;
    /// `fabrication`/`nav_sensors` are powered-fraction; `hull_integrity` is mean condition.
    /// Each row's DERIVATION note (<see cref="ShipSystems.Derivation"/>) says which it is —
    /// that text is part of the feature (IX-M22), not a comment.</para>
    /// </summary>
    public readonly struct ShipSystemRow
    {
        public readonly string Id;         // stable snake_case key
        public readonly string Label;      // display text, already uppercase
        public readonly int Load;          // 0..100, or -1 = no meaningful load
        public readonly ShipSystemState State;
        public readonly int FaultDay;      // -1 = none
        public readonly string FaultText;  // uppercase, no day prefix; "" when FaultDay < 0
        public readonly string Advisory;   // deterministic host prose; "" renders nothing

        public ShipSystemRow(string id, string label, int load, ShipSystemState state,
                             int faultDay, string faultText, string advisory)
        {
            Id = id; Label = label; Load = load; State = state;
            FaultDay = faultDay; FaultText = faultText ?? ""; Advisory = advisory ?? "";
        }
    }

    /// <summary>One device line of the SYSTEM DETAIL breakdown (spec §1.2). Condition and Rate are
    /// percent ints 0..100 (the sim holds 0..1 floats; this rounds once, AwayFromZero).</summary>
    public readonly struct ShipSystemDevice
    {
        public readonly string Name;       // MOSS-addressable name, or "" for an unnamed device
        public readonly DeviceKind Kind;
        public readonly int Condition;     // 0..100
        public readonly bool Powered;
        public readonly int Rate;          // 0..100 (Device.Rate)
        public readonly int Deck, X, Y;
        public readonly string Note;       // "" | "FAILED" | "UNWIRED" | "UNPOWERED" | "WORN — MAINTENANCE DUE"

        public ShipSystemDevice(string name, DeviceKind kind, int condition, bool powered,
                                int rate, int deck, int x, int y, string note)
        {
            Name = name ?? ""; Kind = kind; Condition = condition; Powered = powered;
            Rate = rate; Deck = deck; X = x; Y = y; Note = note ?? "";
        }
    }

    /// <summary>The whole ledger: identity + the 8 rows, in fixed presentation order.</summary>
    public readonly struct ShipSystemsReport
    {
        public readonly int Day;
        public readonly long Uptime;   // RAW tick count — the client formats it (never a host duration string)
        public readonly IReadOnlyList<ShipSystemRow> Rows;

        public ShipSystemsReport(int day, long uptime, IReadOnlyList<ShipSystemRow> rows)
        {
            Day = day; Uptime = uptime; Rows = rows;
        }
    }

    /// <summary>
    /// The MOSS terminal's ship-systems ledger — a PURE, ON-DEMAND DERIVATION, modelled on its
    /// neighbour <see cref="ShipMetrics"/>. Full linear device/room scans; call at ≤1 Hz, never
    /// per tick.
    ///
    /// <para><b>No row ever invents a day.</b> <see cref="ShipSystemRow.FaultDay"/> is -1 (and
    /// <see cref="ShipSystemRow.FaultText"/> is "") unless a real history entry attributes to the
    /// row. An absence of hardware is not a fault and has no timestamp: `nav_sensors` says OFFLINE
    /// in its STATE and explains itself in its ADVISORY, because a fabricated
    /// `DAY 0 · NO SENSOR HARDWARE` on a diagnostic screen is exactly the lie DA-M1 forbids.</para>
    ///
    /// <para><b>It adds no sim state.</b> No field, no <c>IStatefulSystem</c>, no def row, no
    /// hash fold: every number below is read out of state some system already owns. Nothing here
    /// mutates the sim, touches the RNG, or publishes an event — a read of this report between
    /// two ticks leaves both determinism twins byte-identical.</para>
    ///
    /// <para><b>The honesty rule (spec §0 / DA-M1).</b> Every gauge is derived from live sim
    /// state or the row says OFFLINE with a stated reason. Three rows deliberately surface known
    /// failures rather than papering over them, and each is called out at its derivation:</para>
    /// <list type="bullet">
    /// <item><c>life_support</c> is banded off WORST-ROOM CO₂ ppm, not scrubber nameplate
    /// capacity — measured, worst-room CO₂ climbs 500 → 17,644 ppm over 3 days on the shipping
    /// slice while every scrubber is healthy and at 2.3× nameplate (`MECHANICS.md` §13.1). A
    /// capacity-derived NOMINAL would be a lie.</item>
    /// <item><c>hull_integrity</c> is an explicit PROXY (mean machine condition). No hull-stress
    /// model exists — `ShipMetrics.cs:12` already carries that admission; this surfaces it.</item>
    /// <item><c>nav_sensors</c> is OFFLINE <b>because the device census finds no
    /// <see cref="DeviceKind.Telescope"/></b>. It is never hardcoded: place a telescope and the
    /// row computes a real load and a real condition ladder like any other.</item>
    /// </list>
    /// </summary>
    public static class ShipSystems
    {
        // ---------------------------------------------------------------- row identity

        public const string IdReactor = "reactor";
        public const string IdLifeSupport = "life_support";
        public const string IdWaterReclaim = "water_reclaim";
        public const string IdHydroponics = "hydroponics";
        public const string IdThermal = "thermal";
        public const string IdFabrication = "fabrication";
        public const string IdHullIntegrity = "hull_integrity";
        public const string IdNavSensors = "nav_sensors";

        /// <summary>The 8 row ids in FIXED presentation order (a host decision, not a client sort —
        /// same rule as the relations ring).</summary>
        public static readonly string[] Ids =
        {
            IdReactor, IdLifeSupport, IdWaterReclaim, IdHydroponics,
            IdThermal, IdFabrication, IdHullIntegrity, IdNavSensors,
        };

        // ---------------------------------------------------------------- device groups
        //
        // Group membership is by DeviceKind, so a row is a census of real hardware: a group with
        // no members is an ABSENCE the row must report, never a plausible number.

        private static readonly DeviceKind[] ReactorKinds = { DeviceKind.SolarWing, DeviceKind.Battery };
        private static readonly DeviceKind[] LifeSupportKinds = { DeviceKind.AirVent, DeviceKind.Scrubber };
        // E0-7 puts the melter in WATER, not FABRICATION, even though CraftingSystem drives it: this
        // row is a census of the ship's water hardware, and on a ship whose only water source is ice
        // a failed melter is a WATER fault. It also makes the row honest about the wear/failure a
        // player has to act on — a broken melter and a broken reclaimer are the same emergency.
        private static readonly DeviceKind[] WaterKinds =
            { DeviceKind.WaterTank, DeviceKind.Reclaimer, DeviceKind.IceMelter };
        private static readonly DeviceKind[] HydroKinds = { DeviceKind.GrowBed };
        private static readonly DeviceKind[] ThermalKinds = { DeviceKind.Radiator };
        private static readonly DeviceKind[] FabricationKinds =
            { DeviceKind.Fabricator, DeviceKind.MachineShop, DeviceKind.SalvageRecycler };
        private static readonly DeviceKind[] NavKinds = { DeviceKind.Telescope };

        // ---------------------------------------------------------------- CO2 bands
        //
        // The life-support ladder uses the ONLY CO2 thresholds in this codebase that have a real
        // consumer, so the row can never invent a comfort standard:
        //   * 1,000 / 2,000 ppm — the "stale" / "bad" wording the crew themselves use in their
        //     situation prompt (`Sim.Llm/CitizenContext.cs:67,69`). Mirrored (not referenced):
        //     Sim.Core must not depend on Sim.Llm.
        //   * `needs.def co2_narcosis_ppm` (40,000) and `hypoxia_ppo2_kpa` /
        //     `severe_hypoxia_ppo2_kpa` — read live from sim.Defs, because these are the atmosphere
        //     numbers that actually damage a crew member. The consumers are the two rungs of the
        //     suffocation ladder at `NeedsSystem.cs:130,132` (NOT `:52`, which is class-doc prose
        //     about SocialSystem — an earlier revision of this file cited it in error).

        private const double Co2StalePpm = 1000.0;
        private const double Co2BadPpm = 2000.0;

        /// <summary>Pressure below which a SEALED compartment counts as losing air — mirrors the
        /// deterministic hull derivation at `Sim.Llm/CitizenContext.cs:155-193` (its
        /// `LowPressureKPa = 80`). Mirrored, not referenced: Sim.Core must not depend on Sim.Llm.</summary>
        private const double LowPressureKPa = 80.0;

        /// <summary>ShipMetrics' pressurized-room gate (`ShipMetrics.cs:63`) — a room below this
        /// is not a compartment the crew live in, so it is excluded from the atmosphere and
        /// thermal bands exactly as it is from the HUD.</summary>
        private const double PressurizedKPa = 50.0;

        /// <summary>The comfort band ThermalSystem's HUD metric uses (`ShipMetrics.cs:68-69`).</summary>
        private const double ComfortLowC = 10.0, ComfortHighC = 35.0;

        /// <summary>Battery reserve below which the reactor row asks for attention (spec §5).</summary>
        private const float BatteryAttendFraction = 0.25f;

        private static readonly CultureInfo Ic = CultureInfo.InvariantCulture;

        // ---------------------------------------------------------------- ledger

        /// <summary>
        /// The 8-row ledger. <paramref name="history"/> is OPTIONAL: it is the only source of
        /// fault attribution, and it lives on the host's <see cref="HistorySystem"/> rather than
        /// on <see cref="Simulation"/>, so a caller without one gets a complete ledger whose
        /// LAST FAULT column is honestly empty rather than a fabricated `—`-shaped guess.
        /// Read-only over both.
        /// </summary>
        public static ShipSystemsReport Compute(Simulation sim, HistorySystem history = null)
        {
            if (sim == null) throw new ArgumentNullException(nameof(sim));

            var census = Census.Take(sim);
            var rows = new List<ShipSystemRow>(Ids.Length)
            {
                Reactor(sim, census, history),
                LifeSupport(sim, census, history),
                WaterReclaim(sim, census, history),
                Hydroponics(sim, census, history),
                Thermal(sim, census, history),
                Fabrication(sim, census, history),
                HullIntegrity(sim, census, history),
                NavSensors(sim, census, history),
            };
            int day = (int)(sim.TickCount / SimClockUtil.TicksPerDay);
            return new ShipSystemsReport(day, sim.TickCount, rows);
        }

        /// <summary>
        /// The per-device breakdown behind one row (spec §1.2). Unknown id ⇒ an EMPTY list, which
        /// is also the honest answer for a row whose hardware does not exist (`nav_sensors` on
        /// every shipped ship). Device store order — deterministic.
        /// </summary>
        public static IReadOnlyList<ShipSystemDevice> ComputeDetail(Simulation sim, string id)
        {
            if (sim == null) throw new ArgumentNullException(nameof(sim));
            var rows = new List<ShipSystemDevice>();
            var kinds = KindsOf(id);
            bool wearing = id == IdHullIntegrity;   // hull's group is "everything that wears"
            if (kinds == null && !wearing) return rows;

            var devices = sim.Devices.Items;
            var machines = sim.Defs.Machines;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                var def = machines[(int)d.Kind];
                if (wearing) { if (def.WearPerHour <= 0f) continue; }
                else if (!Contains(kinds, d.Kind)) continue;

                rows.Add(new ShipSystemDevice(
                    d.Name, d.Kind, Pct(d.Condition), d.Powered, Pct(d.Rate),
                    d.Pos.Z, d.Pos.X, d.Pos.Y, DeviceNote(d, def, sim.Defs)));
            }
            return rows;
        }

        /// <summary>
        /// The plain-prose DERIVATION note for a row (IX-M22 / DA-M3): exactly how its LOAD and
        /// STATE are computed and what the proxy's limits are. HOST knowledge — it ships beside
        /// the detail table so the client never has to describe a derivation it cannot see.
        /// Deterministic, never LLM text. Unknown id ⇒ "".
        /// </summary>
        public static string Derivation(string id)
        {
            string body = DerivationBody(id);
            return body.Length == 0 ? "" : body + " " + FaultCaveat;
        }

        /// <summary>
        /// The sentence EVERY row's derivation note ends with (spec §5.1). `MaintenanceSystem`
        /// publishes nothing on repair (`MachineWearSystem.cs:262` — "completion is a notice, not an
        /// alarm"), so faults can be shown but recoveries cannot. A player who reads LAST FAULT as
        /// "the current problem" will chase a fault that was fixed two days ago, and the screen must
        /// say so rather than let them.
        /// </summary>
        private const string FaultCaveat =
            "LAST FAULT is the last thing that went wrong on this row, NOT the current problem: "
          + "nothing is published when a machine is repaired, so a fault line never clears itself.";

        private static string DerivationBody(string id)
        {
            switch (id)
            {
                case IdReactor:
                    return "LOAD is the sum of the electrical draw of every wanting, wired device "
                         + "divided by total generation. STATE: any wanting device left unpowered is a "
                         + "brownout (DEGRADED); battery reserve under 25% is ATTEND. "
                         + "LIMIT: there is no reactor aboard. The row is named for the compartment; the "
                         + "hardware is solar wings and batteries. Generation is condition-blind by design "
                         + "(PowerSystem.cs:174-189), so a wrecked wing still supplies its full kW here.";
                case IdLifeSupport:
                    return "LOAD is crew CO2 production divided by the CO2 removal capacity of powered, "
                         + "operational scrubbers (condition-scaled). STATE is banded off WORST-ROOM CO2 ppm, "
                         + "NOT capacity. LIMIT: capacity is not the constraint. Scrubbers are room-local and "
                         + "door flow carries no diffusion term, so a ship at 2.3x nameplate capacity still "
                         + "poisons the compartment the crew stand in. Reading this row off capacity would "
                         + "report NOMINAL at 17,000 ppm.";
                case IdWaterReclaim:
                    // The note must state the rule the CODE uses. "Any tank at 0 L" was the survey's
                    // rule and it is wrong: the slice's tank_hydro holds 0.02 L at day 3, so a
                    // literal zero test reads NOMINAL and hides the very failure this row exists to
                    // show. The DETAIL table prints each tank's litres so the player can see it.
                    return "LOAD is stored litres divided by total tank capacity. STATE: a tank holding less "
                         + "than one drink (0.5 L, the sim's own dry test — below it a tank is invisible to a "
                         + "thirsty crew member) is ATTEND; the tank/reclaimer condition ladder can raise it "
                         + "to DEGRADED. A tank is NOT required to read exactly 0 L to count as dry, and each "
                         + "tank's litres are printed in the table above so you can check. LIMIT: fill is a "
                         + "level, not a flow — a full tank on a dead reclaimer and a full tank on a healthy "
                         + "one read the same until the level moves.";
                case IdHydroponics:
                    return "LOAD is mean grow-bed crop progress. STATE: the grow-bed condition ladder, raised "
                         + "to ATTEND when any bed sits on a fluid network that cannot cover one second of "
                         + "irrigation. LIMIT: progress HOLDS on an unpowered or dry bed — there is no wilting "
                         + "and no crop loss, so a frozen bar is the only symptom of a stalled crop.";
                case IdThermal:
                    return "LOAD is total waste heat (powered operational machines plus crew body heat) "
                         + "divided by radiator rejection capacity. STATE reads the MEASURED room "
                         + "temperatures: any pressurised compartment outside the crew-damage band is "
                         + "DEGRADED, any outside the 10-35 C comfort band is ATTEND. LIMIT: this ship loses "
                         + "heat, it does not gain it. Radiators have a 10 C floor, hull loss does not, and "
                         + "nothing deliberately heats a room. A high LOAD here does not mean the ship is hot.";
                case IdFabrication:
                    return "LOAD is powered, operational industry machines divided by all of them. STATE is "
                         + "the condition ladder over the same set. LIMIT: powered is not busy. No machine "
                         + "exposes a run-state, so an idle powered fabricator is indistinguishable from a "
                         + "working one on this row.";
                case IdHullIntegrity:
                    return "LOAD is mean machine condition over every device that wears. STATE: a compartment "
                         + "whose anchor probe now resolves to vacuum is a breach (DEGRADED); a still-sealed "
                         + "compartment under 80 kPa is ATTEND. LIMIT: THIS IS A PROXY. No hull-stress model "
                         + "exists anywhere in the sim (ShipMetrics.cs:12 says so itself), so the bar measures "
                         + "how worn the machinery is, not how sound the hull is. Nothing publishes a breach "
                         + "event either, so LAST FAULT on this row is legitimately empty.";
                case IdNavSensors:
                    return "LOAD is powered, operational telescopes divided by all of them. STATE is OFFLINE "
                         + "whenever the device census finds no telescope aboard — derived, not hardcoded. "
                         + "LIMIT: NavSystem is fully built, saved and hashed, and no ship generator or "
                         + "authored ship places a telescope, so the sensor pass never runs. Place one and "
                         + "this row computes like any other.";
                default:
                    return "";
            }
        }

        /// <summary>
        /// The ship's hull designation — a deterministic four-digit NAME derived from the world
        /// seed. It is identity, not a gauge, so DA-M1 does not apply; it exists so the header
        /// reads like a real console. Pure function of the seed: the same ship always shows the
        /// same number.
        /// </summary>
        public static string HullDesignation(ulong seed)
        {
            // FNV-1a 64 over the seed's 8 bytes, folded to 4 digits. Any stable mix would do;
            // this one matches the repo's existing FNV habit and never allocates a hash object.
            ulong h = 14695981039346656037UL;
            for (int i = 0; i < 8; i++)
            {
                h ^= (byte)(seed >> (i * 8));
                h *= 1099511628211UL;
            }
            return (h % 9000UL + 1000UL).ToString(Ic);
        }

        // ---------------------------------------------------------------- rows

        /// <summary>
        /// REACTOR. LOAD = Σ DrawKW of wired, WANTING devices ÷ Σ GenerationKW OF WIRED SOURCES,
        /// clamped 0..100. BOTH sides carry `PowerSystem.Balance`'s off-grid gate
        /// (`PowerSystem.cs:184`) — see the Census power ledger for why an ungated denominator makes
        /// a darkening ship read as less loaded. "Wanting" mirrors `PowerSystem.IsWanting`
        /// (`PowerSystem.cs:262-266`): a vent only wants power while open; everything else always does.
        /// STATE: brownout ⇒ DEGRADED, derived from the OBSERVABLE consequence — a wanting, wired,
        /// drawing device that <see cref="Device.Powered"/> is false on has been shed
        /// (`PowerSystem.cs:203-234` stamps exactly that). Generating hardware aboard but NONE of it
        /// wired is also DEGRADED: the ship is running on reserve with nothing replenishing it, and
        /// that must never render as a quiet `--`. Else battery reserve &lt; 25% ⇒ ATTEND.
        /// Deliberately NOT <see cref="ShipMetricsSnapshot.Power"/>: that is served ÷ demand, a
        /// shed indicator which saturates at 1.0 and can never show a loaded-but-coping ship.
        /// <para>Cold-start artifact, same class as `hydroponics`: before the first tick no power
        /// network exists, so generation reaches nothing and the row reads DEGRADED for that one
        /// instant. That is exactly what `PowerSystem` would find at tick 0.</para>
        /// </summary>
        private static ShipSystemRow Reactor(Simulation sim, in Census c, HistorySystem history)
        {
            if (!double.IsFinite(c.GenerationKW) || !double.IsFinite(c.WantingDrawKW) ||
                !double.IsFinite(c.BatteryKWh))
                return Unreadable(IdReactor, "REACTOR", "the power ledger");

            int load = c.GenerationKW <= 0f
                ? (c.WantingDrawKW > 0f ? 100 : -1)
                : Pct(c.WantingDrawKW / c.GenerationKW);

            // Hardware aboard but none of it on a network: nothing is generating INTO the ship.
            bool generationStranded = c.PowerSourceCount > 0 && c.GenerationKW <= 0f;

            ShipSystemState state;
            if (c.PowerSourceCount == 0) state = ShipSystemState.Offline;
            else if (c.BrownedOutDevices > 0 || generationStranded) state = ShipSystemState.Degraded;
            else if (c.WiredBatteries > 0 && c.BatteryChargeFraction < BatteryAttendFraction) state = ShipSystemState.Attend;
            else state = ShipSystemState.Nominal;

            var sb = new StringBuilder(256);
            if (c.PowerSourceCount == 0)
            {
                sb.Append("No generating hardware aboard — nothing on this ship makes power, so every "
                          + "wired device is running on whatever the batteries still hold.");
            }
            else
            {
                sb.Append(Fixed1(c.WantingDrawKW)).Append(" kW of wanting draw against ")
                  .Append(Fixed1(c.GenerationKW)).Append(" kW reaching the grid from ")
                  .Append(Count(c.SolarWings, "solar wing")).Append('.');
                if (c.UnwiredGenerationKW > 0f)
                    sb.Append(' ').Append(Fixed1(c.UnwiredGenerationKW))
                      .Append(" kW of generating hardware is on no network and contributes nothing.");
                if (c.WiredBatteries > 0)
                    sb.Append(' ').Append(Count(c.WiredBatteries, "wired battery", "wired batteries")).Append(" hold ")
                      .Append(Fixed1(c.BatteryKWh)).Append(" kWh (")
                      .Append(Pct(c.BatteryChargeFraction).ToString(Ic)).Append("%).");
                else if (c.BatteryCount > 0) sb.Append(" The battery bank is on no network.");
                else sb.Append(" No battery bank.");
                if (c.BrownedOutDevices > 0)
                    sb.Append(' ').Append(c.BrownedOutDevices.ToString(Ic))
                      .Append(c.BrownedOutDevices == 1 ? " device is" : " devices are")
                      .Append(" shed right now.");
                sb.Append(" There is no reactor aboard — the name is the compartment's.");
            }

            // A brownout entry is a power fault; the RECOVERY entry HistorySystem writes from the
            // same event (`HistorySystem.cs:104-110`) is not, and must never appear under LAST
            // FAULT. `BrownoutChangedEvent` carries the direction but the history entry does not,
            // so the only surviving discriminator is HistorySystem's own literal.
            var fault = Fault(sim, history, ReactorKinds, HistoryKind.Brownout, "browned out");
            return new ShipSystemRow(IdReactor, "REACTOR", load, state, fault.Day, fault.Text, sb.ToString());
        }

        /// <summary>
        /// LIFE SUPPORT. LOAD = crew CO₂ production ÷ scrubber removal capacity
        /// (`atmosphere.def co2_per_person_per_second` × living crew vs `scrubber_mol_per_second` ×
        /// <see cref="Device.EffectiveRate"/> over powered, operational scrubbers —
        /// `AtmosphereSystem`'s own numbers).
        /// STATE is banded off WORST-ROOM CO₂ ppm (DA-M4), never capacity: measured, worst-room CO₂
        /// climbs 500 → 17,644 ppm over 3 days on the shipping slice with every scrubber healthy at
        /// 2.3× nameplate, because scrubbers are room-local and `FlowAcrossDoor` has no diffusion
        /// term (`MECHANICS.md` §13.1). CO2 bands: &lt; 1,000 NOMINAL · ≥ 1,000 ATTEND · ≥ 2,000
        /// DEGRADED · ≥ `needs.def co2_narcosis_ppm` OFFLINE.
        /// <para>The STATE is the WORSE of that ladder and a WORST-ROOM ppO₂ ladder — DA-M4's own
        /// logic ("band off the measured quantity that damages crew") applies identically to oxygen,
        /// and `NeedsSystem.cs:130,132` reads ppO₂ and CO2 through the SAME two-rung damage test.
        /// Banding on CO2 alone would let a single hypoxic compartment sit behind a NOMINAL row on
        /// the screen named LIFE SUPPORT, with only a ship-wide MEAN in the advisory to contradict
        /// it — and a mean is exactly what hides one bad room. ppO₂ bands: &lt; `hypoxia_ppo2_kpa`
        /// DEGRADED · &lt; `severe_hypoxia_ppo2_kpa` OFFLINE (that rung damages at the vacuum rate).
        /// There is no ATTEND rung for ppO₂ because `needs.def` defines no third threshold and this
        /// row does not invent one.</para>
        /// </summary>
        private static ShipSystemRow LifeSupport(Simulation sim, in Census c, HistorySystem history)
        {
            if (c.NonFiniteRooms > 0) return Unreadable(IdLifeSupport, "LIFE SUPPORT", "a compartment's atmosphere");
            if (!double.IsFinite(c.ScrubberCapacityMolPerSecond))
                return Unreadable(IdLifeSupport, "LIFE SUPPORT", "scrubber capacity");

            int load = c.ScrubberCapacityMolPerSecond <= 0.0
                ? (c.CrewCo2MolPerSecond > 0.0 ? 100 : -1)
                : Pct(c.CrewCo2MolPerSecond / c.ScrubberCapacityMolPerSecond);

            var needs = sim.Defs.Needs;
            double narcosis = needs.Co2NarcosisPpm;
            ShipSystemState co2Band =
                c.WorstCo2Ppm >= narcosis ? ShipSystemState.Offline
                : c.WorstCo2Ppm >= Co2BadPpm ? ShipSystemState.Degraded
                : c.WorstCo2Ppm >= Co2StalePpm ? ShipSystemState.Attend
                : ShipSystemState.Nominal;
            ShipSystemState o2Band =
                c.WorstPpO2KPa < needs.SevereHypoxiaPpO2KPa ? ShipSystemState.Offline
                : c.WorstPpO2KPa < needs.HypoxiaPpO2KPa ? ShipSystemState.Degraded
                : ShipSystemState.Nominal;
            ShipSystemState state = c.PressurizedRooms == 0
                ? ShipSystemState.Offline
                : Worse(co2Band, o2Band);

            var sb = new StringBuilder(288);
            if (c.PressurizedRooms == 0)
            {
                sb.Append("No pressurised compartment left aboard — there is no air to read, so this row "
                          + "cannot band itself and reports nothing rather than guessing.");
            }
            else
            {
                sb.Append("Worst compartment at ").Append(Whole(c.WorstCo2Ppm)).Append(" ppm CO2 (")
                  .Append(c.WorstCo2Ppm >= narcosis ? "crew-damaging"
                        : c.WorstCo2Ppm >= Co2BadPpm ? "bad"
                        : c.WorstCo2Ppm >= Co2StalePpm ? "stale" : "normal")
                  .Append("); worst oxygen partial pressure ").Append(Fixed1(c.WorstPpO2KPa)).Append(" kPa (")
                  .Append(o2Band == ShipSystemState.Offline ? "crew-damaging"
                        : o2Band == ShipSystemState.Degraded ? "hypoxic" : "breathable")
                  .Append("), mean O2 ").Append(Whole(c.MeanO2Fraction * 100.0)).Append("%. ")
                  .Append(Count(c.Scrubbers, "scrubber")).Append(" running at ")
                  .Append(Fixed1(c.ScrubberCapacityMolPerSecond <= 0.0 || c.CrewCo2MolPerSecond <= 0.0
                                 ? 0.0 : c.ScrubberCapacityMolPerSecond / c.CrewCo2MolPerSecond))
                  .Append("x the crew's output — capacity is not what limits this row, ")
                  .Append("scrubbers only clean the compartment they stand in.");
            }

            var fault = Fault(sim, history, LifeSupportKinds);
            return new ShipSystemRow(IdLifeSupport, "LIFE SUPPORT", load, state, fault.Day, fault.Text, sb.ToString());
        }

        /// <summary>
        /// WATER RECLAIM. LOAD = stored litres ÷ total tank capacity (`water.def
        /// tank_capacity_liters` × tank count) — the same fraction as
        /// <see cref="ShipMetricsSnapshot.Water"/>, recomputed here so the row owns its own scan.
        /// STATE: the reclaimer condition ladder, raised to at least ATTEND by any tank sitting at
        /// exactly 0 L. `tank_hydro` hits 0.0 L on day 1.2 on the shipping slice
        /// (`ECONOMY-PLAN.md` B-2) — this row is where that becomes visible.
        /// </summary>
        private static ShipSystemRow WaterReclaim(Simulation sim, in Census c, HistorySystem history)
        {
            if (!double.IsFinite(c.TankStoredLiters) || !double.IsFinite(c.TankCapacityLiters))
                return Unreadable(IdWaterReclaim, "WATER RECLAIM", "the tank ledger");

            int load = c.TankCapacityLiters <= 0f ? -1 : Pct(c.TankStoredLiters / c.TankCapacityLiters);

            ShipSystemState state;
            if (c.Tanks == 0 && c.Reclaimers == 0) state = ShipSystemState.Offline;
            else state = Worse(Ladder(c.WaterFailed, c.WaterWorn),
                               c.EmptyTanks > 0 ? ShipSystemState.Attend : ShipSystemState.Nominal);

            var sb = new StringBuilder(192);
            if (c.Tanks == 0 && c.Reclaimers == 0)
            {
                sb.Append("No tanks and no reclaimer aboard — this ship stores no water and recycles "
                          + "none, so there is no level to report.");
            }
            else
            {
                sb.Append(Fixed1(c.TankStoredLiters)).Append(" L of ").Append(Fixed1(c.TankCapacityLiters))
                  .Append(" L stored across ").Append(Count(c.Tanks, "tank")).Append("; ")
                  .Append(Fixed1(sim.WastewaterLiters)).Append(" L of greywater waiting on ")
                  .Append(Count(c.Reclaimers, "reclaimer")).Append('.');
                if (c.EmptyTanks > 0)
                    sb.Append(' ').Append(Count(c.EmptyTanks, "tank")).Append(" dry.");
            }

            var fault = Fault(sim, history, WaterKinds);
            return new ShipSystemRow(IdWaterReclaim, "WATER RECLAIM", load, state, fault.Day, fault.Text, sb.ToString());
        }

        /// <summary>
        /// HYDROPONICS. LOAD = mean <see cref="Device.Progress"/> over grow beds (0..1 fraction of
        /// a crop, `HydroponicsSystem.cs:70-72`).
        /// STATE: the grow-bed condition ladder, raised to at least ATTEND when any bed's fluid
        /// network cannot cover one second of irrigation — the same all-or-nothing test
        /// `HydroponicsSystem` makes through `WaterSystem.TryDrawWater`, evaluated here by summing
        /// tank litres on the bed's network (READ-ONLY; TryDrawWater mutates and is never called).
        /// A dry or unpowered bed HOLDS progress, so a frozen bar is the whole symptom.
        /// </summary>
        private static ShipSystemRow Hydroponics(Simulation sim, in Census c, HistorySystem history)
        {
            if (!double.IsFinite(c.GrowProgressSum))
                return Unreadable(IdHydroponics, "HYDROPONICS", "grow-bed progress");

            int load = c.GrowBeds == 0 ? -1 : Pct(c.GrowProgressSum / c.GrowBeds);

            ShipSystemState state;
            if (c.GrowBeds == 0) state = ShipSystemState.Offline;
            else state = Worse(Ladder(c.HydroFailed, c.HydroWorn),
                               c.DryGrowBeds > 0 ? ShipSystemState.Attend : ShipSystemState.Nominal);

            var sb = new StringBuilder(192);
            if (c.GrowBeds == 0)
            {
                sb.Append("No grow beds aboard — nothing on this ship grows food, so the crew eat only "
                          + "what is already in stores.");
            }
            else
            {
                sb.Append(Count(c.GrowBeds, "grow bed")).Append(" at ")
                  .Append(Pct(c.GrowProgressSum / c.GrowBeds).ToString(Ic)).Append("% mean crop progress.");
                if (c.DryGrowBeds > 0)
                    sb.Append(' ').Append(Count(c.DryGrowBeds, "bed")).Append(" on a dry line — progress held, not lost.");
                if (c.UnpoweredGrowBeds > 0)
                    sb.Append(' ').Append(Count(c.UnpoweredGrowBeds, "bed")).Append(" dark.");
            }

            var fault = Fault(sim, history, HydroKinds);
            return new ShipSystemRow(IdHydroponics, "HYDROPONICS", load, state, fault.Day, fault.Text, sb.ToString());
        }

        /// <summary>
        /// THERMAL. LOAD = total waste heat ÷ radiator rejection capacity, both read exactly as
        /// `ThermalSystem` reads them (`ThermalSystem.cs:81-110`): sources are powered, operational
        /// machines with `HeatKW &gt; 0` (a vent only while open) plus `thermal.def citizen_heat_w`
        /// per living citizen; capacity is `RadiatorRejectKW` × <see cref="Device.EffectiveRate"/>
        /// over powered, operational radiators.
        /// STATE reads MEASURED temperatures, not the rejection ratio: any pressurised compartment
        /// outside the crew-damage band (`needs.def hypothermia_c` / `heat_stroke_c`) is DEGRADED,
        /// any outside the 10–35 °C comfort band is ATTEND.
        /// <para>The shipped `overheat_guard` rule fires 2,579×/3 days claiming "THERMAL LOAD HIGH";
        /// measured, the ship FREEZES to −12.9 °C (`MECHANICS.md` §13.2). This row therefore reports
        /// the temperature it measured and never repeats that rule's claim.</para>
        /// </summary>
        private static ShipSystemRow Thermal(Simulation sim, in Census c, HistorySystem history)
        {
            if (c.NonFiniteRooms > 0) return Unreadable(IdThermal, "THERMAL", "a compartment's temperature");
            if (!double.IsFinite(c.WasteHeatKW) || !double.IsFinite(c.RadiatorRejectKW))
                return Unreadable(IdThermal, "THERMAL", "the heat ledger");

            int load = c.RadiatorRejectKW <= 0f
                ? (c.WasteHeatKW > 0f ? 100 : -1)
                : Pct(c.WasteHeatKW / c.RadiatorRejectKW);

            ShipSystemState state;
            if (c.PressurizedRooms == 0) state = ShipSystemState.Offline;
            else if (c.DangerousRooms > 0) state = ShipSystemState.Degraded;
            else if (c.UncomfortableRooms > 0) state = ShipSystemState.Attend;
            else state = ShipSystemState.Nominal;

            var sb = new StringBuilder(224);
            if (c.PressurizedRooms == 0)
            {
                sb.Append("No pressurised compartment left aboard — with no air there is nothing to hold "
                          + "heat, so there is no temperature worth reporting.");
            }
            else
            {
                sb.Append("Coldest compartment ").Append(Fixed1(c.ColdestC)).Append(" C, warmest ")
                  .Append(Fixed1(c.WarmestC)).Append(" C; ")
                  .Append((c.PressurizedRooms - c.UncomfortableRooms).ToString(Ic)).Append(" of ")
                  .Append(c.PressurizedRooms.ToString(Ic)).Append(" compartments in the 10-35 C band. ")
                  .Append(Fixed1(c.WasteHeatKW)).Append(" kW of waste heat against ")
                  .Append(Fixed1(c.RadiatorRejectKW)).Append(" kW of radiator capacity.");
                if (c.ColdestC < sim.Defs.Needs.HypothermiaC)
                    sb.Append(" This ship is LOSING heat, not gaining it — radiators stop at 10 C, hull loss does not.");
            }

            var fault = Fault(sim, history, ThermalKinds);
            return new ShipSystemRow(IdThermal, "THERMAL", load, state, fault.Day, fault.Text, sb.ToString());
        }

        /// <summary>
        /// FABRICATION. LOAD = powered, operational industry machines ÷ all of them
        /// (`Fabricator`, `MachineShop`, `SalvageRecycler`). STATE is the condition ladder over the
        /// same set; no machines at all ⇒ OFFLINE with a stated reason. Powered is NOT busy — no
        /// machine exposes a run-state (`ThermalSystem.cs:103-106` documents the same gap).
        /// </summary>
        private static ShipSystemRow Fabrication(Simulation sim, in Census c, HistorySystem history)
        {
            int load = c.IndustryTotal == 0 ? -1 : Pct(c.IndustryLive / (double)c.IndustryTotal);
            ShipSystemState state = c.IndustryTotal == 0
                ? ShipSystemState.Offline
                : Ladder(c.IndustryFailed, c.IndustryWorn);

            var sb = new StringBuilder(160);
            if (c.IndustryTotal == 0)
                sb.Append("No fabricator, machine shop or recycler aboard — nothing on this ship can "
                    + "make or reclaim parts.");
            else
                sb.Append(c.IndustryLive.ToString(Ic)).Append(" of ").Append(c.IndustryTotal.ToString(Ic))
                  .Append(" industry machines powered and serviceable. ")
                  .Append("Powered is not busy — no machine reports a run state.");

            var fault = Fault(sim, history, FabricationKinds);
            return new ShipSystemRow(IdFabrication, "FABRICATION", load, state, fault.Day, fault.Text, sb.ToString());
        }

        /// <summary>
        /// HULL INTEGRITY — an explicit PROXY (DA-M3). LOAD = mean <see cref="Device.Condition"/>
        /// over devices with `WearPerHour &gt; 0`, i.e. <see cref="ShipMetricsSnapshot.Structural"/>,
        /// whose own source comment already admits "proxy until hull stress exists"
        /// (`ShipMetrics.cs:12`).
        /// STATE reuses the deterministic breach derivation at `Sim.Llm/CitizenContext.cs:155-193`
        /// rather than re-deriving it: a NAMED anchor whose probe tile now resolves to room 0 has
        /// had its compartment flooded into the vacuum sink ⇒ DEGRADED; a still-sealed compartment
        /// under 80 kPa ⇒ ATTEND.
        /// Nothing publishes a breach event anywhere in the sim, so LAST FAULT here is legitimately
        /// empty — that is honest, not a bug.
        /// </summary>
        private static ShipSystemRow HullIntegrity(Simulation sim, in Census c, HistorySystem history)
        {
            if (!double.IsFinite(c.ConditionSum))
                return Unreadable(IdHullIntegrity, "HULL INTEGRITY", "machine condition");
            // The pressure half of this row reads rooms too, so it owes the SAME room guard as
            // life_support / thermal. Without it a NaN-pressure room is dropped by the census
            // `continue`, LowPressureRooms stays 0, and hull renders a false all-clear — "every
            // sealed compartment is holding pressure" about a compartment whose pressure is
            // undefined. It can never be the SOLE alarmed row (the same NaN forces life_support and
            // thermal UNREADABLE too), but a row inconsistent with its siblings' own principle is
            // exactly the drift this ledger refuses.
            if (c.NonFiniteRooms > 0)
                return Unreadable(IdHullIntegrity, "HULL INTEGRITY", "a compartment's pressure");

            int load = c.WearingDevices == 0 ? -1 : Pct(c.ConditionSum / c.WearingDevices);

            ShipSystemState state =
                c.BreachedAnchors > 0 ? ShipSystemState.Degraded
                : c.LowPressureRooms > 0 ? ShipSystemState.Attend
                : ShipSystemState.Nominal;

            var sb = new StringBuilder(224);
            sb.Append("PROXY: mean condition of ").Append(Count(c.WearingDevices, "wearing machine"))
              .Append(" — no hull-stress model exists in this sim. ");
            if (c.BreachedAnchors > 0)
                sb.Append(Count(c.BreachedAnchors, "compartment")).Append(" open to vacuum. ");
            if (c.LowPressureRooms > 0)
                sb.Append(Count(c.LowPressureRooms, "sealed compartment")).Append(" under 80 kPa. ");
            if (c.BreachedAnchors == 0 && c.LowPressureRooms == 0)
                sb.Append("Every sealed compartment is holding pressure.");

            // Deliberately NO history join: nothing publishes a breach, so a name-matched
            // maintenance alarm here would read as a hull fault. Empty is the honest render.
            return new ShipSystemRow(IdHullIntegrity, "HULL INTEGRITY", load, state, -1, "", sb.ToString().TrimEnd());
        }

        /// <summary>
        /// NAV / SENSORS. OFFLINE <b>because the device census finds no
        /// <see cref="DeviceKind.Telescope"/></b> — derived from <paramref name="c"/>, never
        /// hardcoded. `NavSystem` is fully built, saved, hashed and tested, and provably inert:
        /// its sensor pass is gated on `AnyPoweredTelescope` (`NavSystem.cs:104,121-128`) and no ship
        /// generator or authored ship places one. Place a telescope and this row computes a real
        /// LOAD (powered, operational ÷ total) and a real condition ladder like any other row.
        /// </summary>
        private static ShipSystemRow NavSensors(Simulation sim, in Census c, HistorySystem history)
        {
            if (c.TelescopeTotal == 0)
            {
                // faultDay -1 / faultText "" — an ABSENCE OF HARDWARE IS NOT A FAULT and has no day.
                // The reason belongs in the advisory; the STATE column already says OFFLINE.
                // Emitting a fault line here would collapse to "DAY 0 · NO SENSOR HARDWARE", i.e. a
                // fabricated timestamp on a diagnostic screen — precisely what DA-M1 forbids.
                return new ShipSystemRow(IdNavSensors, "NAV / SENSORS", -1, ShipSystemState.Offline,
                    -1, "",
                    "NO SENSOR HARDWARE — no telescope is installed, so NavSystem's sensor pass "
                  + "never runs. Place one and this row comes alive.");
            }

            int load = Pct(c.TelescopeLive / (double)c.TelescopeTotal);
            ShipSystemState state = c.TelescopeLive == 0
                ? ShipSystemState.Offline
                : Ladder(c.TelescopeFailed, c.TelescopeWorn);

            var sb = new StringBuilder(160);
            sb.Append(c.TelescopeLive.ToString(Ic)).Append(" of ").Append(c.TelescopeTotal.ToString(Ic))
              .Append(" telescopes powered and serviceable.");

            var fault = Fault(sim, history, NavKinds);
            return new ShipSystemRow(IdNavSensors, "NAV / SENSORS", load, state, fault.Day, fault.Text, sb.ToString());
        }

        // ---------------------------------------------------------------- census

        /// <summary>
        /// Every scalar the 8 rows need, gathered in ONE device pass + ONE room pass + ONE citizen
        /// pass — so the whole ledger costs the same order as a single <see cref="ShipMetrics"/>
        /// call. Pure reads in entity store order (deterministic).
        /// </summary>
        private struct Census
        {
            // power
            public float GenerationKW, WantingDrawKW, BatteryKWh, UnwiredGenerationKW;
            public int SolarWings, BatteryCount, WiredBatteries, PowerSourceCount, BrownedOutDevices;
            public float BatteryChargeFraction;
            // life support
            public int Scrubbers;
            public double ScrubberCapacityMolPerSecond, CrewCo2MolPerSecond;
            // water
            public int Tanks, Reclaimers, EmptyTanks, WaterFailed, WaterWorn;
            public float TankStoredLiters, TankCapacityLiters;
            // hydroponics
            public int GrowBeds, DryGrowBeds, UnpoweredGrowBeds, HydroFailed, HydroWorn;
            public double GrowProgressSum;
            // thermal
            public float WasteHeatKW, RadiatorRejectKW;
            public double ColdestC, WarmestC;
            public int DangerousRooms, UncomfortableRooms;
            // fabrication
            public int IndustryTotal, IndustryLive, IndustryFailed, IndustryWorn;
            // hull
            public int WearingDevices, BreachedAnchors, LowPressureRooms;
            public double ConditionSum;
            // nav
            public int TelescopeTotal, TelescopeLive, TelescopeFailed, TelescopeWorn;
            // shared
            public int PressurizedRooms, LivingCrew, NonFiniteRooms;
            public double WorstCo2Ppm, MeanO2Fraction, WorstPpO2KPa;

            public static Census Take(Simulation sim)
            {
                var c = new Census { ColdestC = double.MaxValue, WarmestC = double.MinValue };
                var defs = sim.Defs;
                var machines = defs.Machines;

                // --- citizens (one pass) ---
                var citizens = sim.Citizens.Items;
                for (int i = 0; i < citizens.Count; i++) if (!citizens[i].Dead) c.LivingCrew++;
                c.CrewCo2MolPerSecond = c.LivingCrew * defs.Atmosphere.CO2PerPersonPerSecond;
                c.WasteHeatKW = (float)(c.LivingCrew * defs.Thermal.CitizenHeatW / 1000.0);

                // --- devices (one pass) ---
                var devices = sim.Devices.Items;
                for (int i = 0; i < devices.Count; i++)
                {
                    var d = devices[i];
                    var def = machines[(int)d.Kind];
                    bool operational = d.IsOperational(defs);
                    bool live = d.Powered && operational;
                    bool worn = d.Condition < def.MaintainBelow;

                    // Power ledger — mirrors PowerSystem.Balance's own tallies, INCLUDING its
                    // very first line: `if (d.NetworkId == 0) continue;` (PowerSystem.cs:184)
                    // skips off-grid devices ENTIRELY, so an unwired SolarWing's kW reaches no
                    // network and an unwired battery bridges nothing. Both sides of the ratio
                    // must carry the same gate or the row rewards unplugging things: an off-grid
                    // wing would inflate the denominator and make a darkening ship read as LESS
                    // loaded. PowerSystem.cs:243-248 warns about exactly this — `Powered` on a
                    // SolarWing says nothing about whether it is contributing, only NetworkId does.
                    if (d.NetworkId != 0)
                    {
                        c.GenerationKW += def.GenerationKW;
                        if (d.Kind == DeviceKind.Battery) { c.WiredBatteries++; c.BatteryKWh += d.StoredKWh; }
                        if (def.DrawKW > 0f && Wanting(d))
                        {
                            c.WantingDrawKW += def.DrawKW;
                            if (!d.Powered) c.BrownedOutDevices++;   // shed by the tier walk = a brownout
                        }
                    }
                    else if (def.GenerationKW > 0f) c.UnwiredGenerationKW += def.GenerationKW;

                    // Census of generating HARDWARE (ungated): "none aboard" and "none of it is
                    // plugged in" are different failures and the row must not conflate them.
                    if (def.GenerationKW > 0f || d.Kind == DeviceKind.Battery) c.PowerSourceCount++;

                    // hull proxy — identical predicate to ShipMetrics.Structural.
                    if (def.WearPerHour > 0f) { c.ConditionSum += d.Condition; c.WearingDevices++; }

                    // Thermal sources — the SAME predicate as ThermalSystem's device pass, which
                    // means all four of its gates, not just the vent one (`ThermalSystem.cs:70-108`):
                    //   * a DOOR is a conduction edge, never a source — it is routed to
                    //     ConductAcrossDoor and its HeatKW is dropped BY DESIGN (`:70-78`), because
                    //     a door tile carries DoorMarker and belongs to no room. The slice has 19
                    //     powered doors worth 0.95 kW, a ~6% overstatement of ship waste heat;
                    //   * a device whose tile resolves to vacuum, a door marker or an out-of-range
                    //     room heats nothing (`:83`) — its warmth goes nowhere the model tracks;
                    //   * powered AND operational (`:81`);
                    //   * a vent emits only while open (`:105`).
                    if (live && def.HeatKW > 0f && d.Kind != DeviceKind.Door &&
                        !(d.Kind == DeviceKind.AirVent && !d.IsOpen) && HeatsARoom(sim, d))
                        c.WasteHeatKW += def.HeatKW;

                    switch (d.Kind)
                    {
                        case DeviceKind.SolarWing:
                            c.SolarWings++;
                            break;
                        case DeviceKind.Battery:
                            c.BatteryCount++;   // census; WiredBatteries/BatteryKWh are gated above
                            break;
                        case DeviceKind.Scrubber:
                            c.Scrubbers++;
                            if (live) c.ScrubberCapacityMolPerSecond +=
                                defs.Atmosphere.ScrubberMolPerSecond * d.EffectiveRate;
                            break;
                        case DeviceKind.WaterTank:
                            c.Tanks++;
                            c.TankStoredLiters += d.StoredLiters;
                            c.TankCapacityLiters += defs.Water.TankCapacityLiters;
                            // "Dry" is the SIM'S OWN test, not a round number: a tank holding less
                            // than one drink is invisible to a thirsty crew member
                            // (`SustenanceSystem.cs:126,220,261` all gate on
                            // `StoredLiters < sustenance.def drink_liters`). On the shipping slice
                            // `tank_hydro` sits at 0.02 L by day 3 — a `<= 0f` test would call that
                            // full enough and hide the very failure this row exists to show.
                            if (d.StoredLiters < defs.Sustenance.DrinkLiters) c.EmptyTanks++;
                            if (!operational) c.WaterFailed++; else if (worn) c.WaterWorn++;
                            break;
                        case DeviceKind.Reclaimer:
                            c.Reclaimers++;
                            if (!operational) c.WaterFailed++; else if (worn) c.WaterWorn++;
                            break;
                        case DeviceKind.IceMelter:
                            // E0-7. No dedicated counter — the melter has no rate of its own to
                            // report (its throughput is the crew's haul rate), so what the WATER row
                            // needs from it is exactly what it needs from a reclaimer: is it broken,
                            // and is it wearing out.
                            if (!operational) c.WaterFailed++; else if (worn) c.WaterWorn++;
                            break;
                        case DeviceKind.GrowBed:
                            c.GrowBeds++;
                            c.GrowProgressSum += d.Progress;
                            if (!d.Powered) c.UnpoweredGrowBeds++;
                            if (!operational) c.HydroFailed++; else if (worn) c.HydroWorn++;
                            break;
                        case DeviceKind.Radiator:
                            // Same room gate as the sources: a radiator in vacuum rejects nothing
                            // the model tracks (`ThermalSystem.cs:83` skips it before `:86`).
                            if (live && HeatsARoom(sim, d))
                                c.RadiatorRejectKW += defs.RadiatorRejectKW * d.EffectiveRate;
                            break;
                        case DeviceKind.Fabricator:
                        case DeviceKind.MachineShop:
                        case DeviceKind.SalvageRecycler:
                            c.IndustryTotal++;
                            if (live) c.IndustryLive++;
                            if (!operational) c.IndustryFailed++; else if (worn) c.IndustryWorn++;
                            break;
                        case DeviceKind.Telescope:
                            c.TelescopeTotal++;
                            if (live) c.TelescopeLive++;
                            if (!operational) c.TelescopeFailed++; else if (worn) c.TelescopeWorn++;
                            break;
                    }
                }
                // Reserve is over WIRED batteries only — an off-grid battery bridges no deficit
                // (PowerSystem.cs:184-186), so counting it would report a reserve that cannot be spent.
                c.BatteryChargeFraction = c.WiredBatteries == 0
                    ? 0f : c.BatteryKWh / (c.WiredBatteries * Device.BatteryCapacityKWh);

                // Dry grow beds: the all-or-nothing draw HydroponicsSystem makes, evaluated
                // read-only (WaterSystem.TryDrawWater mutates and is never called from here).
                if (c.GrowBeds > 0)
                {
                    float need = defs.Hydro.GrowBedWaterPerSecond; // × Dt (1 s)
                    for (int i = 0; i < devices.Count; i++)
                    {
                        var bed = devices[i];
                        if (bed.Kind != DeviceKind.GrowBed) continue;
                        if (bed.FluidNetworkId == 0 ||
                            AvailableLiters(devices, bed.FluidNetworkId) + DrawEpsilon < need)
                            c.DryGrowBeds++;
                    }
                }

                // --- rooms (one pass) — the ShipMetrics pressurized gate, verbatim. ---
                var rooms = sim.Rooms.Rooms;
                double o2Sum = 0;
                c.WorstPpO2KPa = double.MaxValue;
                for (int i = 1; i < rooms.Count; i++)
                {
                    var room = rooms[i];
                    if (room == null || room.TileCount <= 0) continue;

                    // A non-finite room is counted ONCE and then excluded from every band. Left in,
                    // NaN loses every comparison silently — it would slip past the pressure gate as
                    // "pressurised", past the CO2 and temperature maxima as "not the worst", and
                    // land in the O2 mean as a fabricated 0%. Rows that read these fields report
                    // themselves UNREADABLE instead (see Unreadable).
                    if (!double.IsFinite(room.PressureKPa) || !double.IsFinite(room.CO2Ppm) ||
                        !double.IsFinite(room.O2Fraction) || !double.IsFinite(room.TemperatureK))
                    { c.NonFiniteRooms++; continue; }

                    if (room.PressureKPa < LowPressureKPa) c.LowPressureRooms++;
                    if (room.PressureKPa < PressurizedKPa) continue;
                    c.PressurizedRooms++;
                    o2Sum += room.O2Fraction;
                    if (room.CO2Ppm > c.WorstCo2Ppm) c.WorstCo2Ppm = room.CO2Ppm;
                    // Partial pressure of oxygen, exactly as NeedsSystem computes it
                    // (`NeedsSystem.cs:111`): the quantity its hypoxia ladder actually reads.
                    double ppO2 = room.PressureKPa * room.O2Fraction;
                    if (ppO2 < c.WorstPpO2KPa) c.WorstPpO2KPa = ppO2;
                    double tempC = room.TemperatureK - 273.15;
                    if (tempC < c.ColdestC) c.ColdestC = tempC;
                    if (tempC > c.WarmestC) c.WarmestC = tempC;
                    if (tempC < defs.Needs.HypothermiaC || tempC > defs.Needs.HeatStrokeC) c.DangerousRooms++;
                    else if (tempC < ComfortLowC || tempC > ComfortHighC) c.UncomfortableRooms++;
                }
                if (c.PressurizedRooms == 0) c.WorstPpO2KPa = 0;
                // DangerousRooms are also outside the comfort band; the advisory's "in band" count
                // subtracts both, so fold them in here rather than double-classifying above.
                c.UncomfortableRooms += c.DangerousRooms;
                c.MeanO2Fraction = c.PressurizedRooms == 0 ? 0 : o2Sum / c.PressurizedRooms;
                if (c.PressurizedRooms == 0) { c.ColdestC = 0; c.WarmestC = 0; }

                // --- breaches: the CitizenContext.cs:155-193 derivation, reused. A NAMED anchor
                // whose probe now resolves to room 0 had its compartment flooded into the vacuum
                // sink by RoomState, so the anchor is the only trace it ever existed. ---
                var anchors = sim.Rooms.Anchors;
                for (int i = 0; i < anchors.Count; i++)
                {
                    if (string.IsNullOrEmpty(anchors[i].Name)) continue;
                    if (sim.Rooms.RoomIdAt(sim.World, anchors[i].Probe) == 0) c.BreachedAnchors++;
                }
                return c;
            }

            /// <summary>Mirror of the private `WaterSystem.DrawEpsilon` (`WaterSystem.cs:65`) so the
            /// dry test here matches the one the sim actually makes, float bit for float bit.</summary>
            private const float DrawEpsilon = 1e-4f;

            /// <summary>Litres a fluid network can supply — the read half of
            /// `WaterSystem.TryDrawWater` (`WaterSystem.cs:215-228`), without its mutation.</summary>
            private static float AvailableLiters(IReadOnlyList<Device> devices, ushort net)
            {
                float available = 0f;
                for (int i = 0; i < devices.Count; i++)
                {
                    var d = devices[i];
                    if (d.Kind == DeviceKind.WaterTank && d.FluidNetworkId == net) available += d.StoredLiters;
                }
                return available;
            }

            /// <summary>Mirror of the private `PowerSystem.IsWanting` (`PowerSystem.cs:262-266`): a
            /// CLOSED vent is the only device that idles — everything else pays its full
            /// `machines.def` draw continuously, in use or not.</summary>
            private static bool Wanting(Device d) => d.Kind != DeviceKind.AirVent || d.IsOpen;

            /// <summary>Whether a device's tile resolves to a real room, i.e. whether its heat has
            /// anywhere to go in the thermal model. Mirror of `ThermalSystem.cs:83`.</summary>
            private static bool HeatsARoom(Simulation sim, Device d)
            {
                ushort roomId = sim.Rooms.RoomIdAt(sim.World, d.Pos);
                return roomId != 0 && roomId != RoomState.DoorMarker && roomId < sim.Rooms.Rooms.Count;
            }
        }

        // ---------------------------------------------------------------- fault attribution

        /// <summary>
        /// The newest history entry attributable to a row, or (-1, "").
        ///
        /// <para><b>A KNOWN-WEAK JOIN, documented not hidden.</b> `AlarmRaisedEvent` carries no
        /// device id — `HistorySystem.Add` passes `subjectA = 0` for alarms
        /// (`HistorySystem.cs:88-89`) and `SourceId` is a STRING (the device name, or the terminal
        /// id for a MOSS `alarm()`). So attribution is a STRING MATCH of the group's device names
        /// against the entry text, plus an optional structural <see cref="HistoryKind"/> a row
        /// declares as its own (only `reactor` does: a brownout IS a power fault, and its entry text
        /// names a network, not a device). <paramref name="ownKindMustContain"/> then narrows that
        /// structural match to HistorySystem's own literal, because the brownout KIND covers both
        /// the fault and its recovery and only one of those belongs under LAST FAULT.</para>
        ///
        /// <para>Two consequences designed around rather than discovered later: the 200-entry ring
        /// is ~87% brownout spam by day 3 (`MECHANICS.md` §13.8), so non-power rows frequently have
        /// nothing — `—` is then the correct render; and `MaintenanceSystem` publishes NOTHING on
        /// repair (`MachineWearSystem.cs:262`), so this column is "the last thing that went wrong",
        /// NEVER "the current problem".</para>
        /// </summary>
        private static (int Day, string Text) Fault(Simulation sim, HistorySystem history,
                                                    DeviceKind[] kinds, HistoryKind? ownKind = null,
                                                    string ownKindMustContain = null)
        {
            if (history == null) return (-1, "");
            var entries = history.Entries;
            if (entries.Count == 0) return (-1, "");

            // Group device names, gathered once per row (a handful of strings).
            var names = new List<string>(8);
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (string.IsNullOrEmpty(d.Name) || !Contains(kinds, d.Kind)) continue;
                names.Add(d.Name);
            }

            for (int i = entries.Count - 1; i >= 0; i--)
            {
                var e = entries[i];
                if (e.Text == null) continue;

                // A RECOVERY is not a fault, on EITHER branch. HistorySystem writes both the
                // brownout and its recovery under the same HistoryKind and the entry does not carry
                // the direction (`HistorySystem.cs:104-110`), so its own literal is the only
                // discriminator left. The name branch needs the identical guard: nothing stops a
                // future recovery line from naming a device, and "DAY 2 · … RECOVERED" under a
                // column headed LAST FAULT is the same misread whichever branch produced it.
                if (IsRecovery(e.Text)) continue;

                bool hit = ownKind.HasValue && e.Kind == (byte)ownKind.Value
                           && (ownKindMustContain == null ||
                               e.Text.IndexOf(ownKindMustContain, StringComparison.OrdinalIgnoreCase) >= 0);
                for (int n = 0; n < names.Count && !hit; n++)
                    hit = e.Text.IndexOf(names[n], StringComparison.OrdinalIgnoreCase) >= 0;
                if (!hit) continue;
                return ((int)(e.Tick / SimClockUtil.TicksPerDay), Summarize(e.Text));
            }
            return (-1, "");
        }

        /// <summary>Whether a history line reads as a RECOVERY rather than a fault. A string sniff of
        /// HistorySystem's own literals, and said out loud as one: the entries carry no structural
        /// "this got better" bit to test instead (`HistorySystem.cs:104-110`).</summary>
        private static bool IsRecovery(string text) =>
            text.IndexOf("recovered", StringComparison.OrdinalIgnoreCase) >= 0;

        /// <summary>Uppercase, single-line, bounded fault summary — no day prefix (the client
        /// composes `DAY {n} · {text}`). InvariantCulture upcasing: the dev machine is de-DE and
        /// `ToUpper()` there turns a dotted i into something else on a Turkish locale.</summary>
        private static string Summarize(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            var sb = new StringBuilder(64);
            for (int i = 0; i < text.Length && sb.Length < MaxFaultChars; i++)
            {
                char ch = text[i];
                sb.Append(ch == '\n' || ch == '\r' || ch == '\t' ? ' ' : ch);
            }
            string s = sb.ToString().Trim().ToUpperInvariant();
            if (text.Length > MaxFaultChars) s += "…";
            return s;
        }

        private const int MaxFaultChars = 56;

        // ---------------------------------------------------------------- shared helpers

        /// <summary>The `MaintainBelow` / `FailBelow` ladder every row inherits for free
        /// (`MachineDefs.cs:38-64`): any member below `FailBelow` (i.e. `!IsOperational`) ⇒
        /// DEGRADED, any below `MaintainBelow` ⇒ ATTEND, else NOMINAL.</summary>
        private static ShipSystemState Ladder(int failed, int worn) =>
            failed > 0 ? ShipSystemState.Degraded
            : worn > 0 ? ShipSystemState.Attend
            : ShipSystemState.Nominal;

        private static ShipSystemState Worse(ShipSystemState a, ShipSystemState b) => a > b ? a : b;

        private static DeviceKind[] KindsOf(string id)
        {
            switch (id)
            {
                case IdReactor: return ReactorKinds;
                case IdLifeSupport: return LifeSupportKinds;
                case IdWaterReclaim: return WaterKinds;
                case IdHydroponics: return HydroKinds;
                case IdThermal: return ThermalKinds;
                case IdFabrication: return FabricationKinds;
                case IdNavSensors: return NavKinds;
                default: return null;   // hull_integrity is "everything that wears"; unknown ⇒ none
            }
        }

        private static bool Contains(DeviceKind[] kinds, DeviceKind k)
        {
            if (kinds == null) return false;
            for (int i = 0; i < kinds.Length; i++) if (kinds[i] == k) return true;
            return false;
        }

        /// <summary>The device's own worst honest word. Order is severity: dead first, then
        /// wiring, then power, then wear.</summary>
        private static string DeviceNote(Device d, in MachineDef def, SimDefs defs)
        {
            if (!d.IsOperational(defs)) return "FAILED";
            if (def.DrawKW > 0f && d.NetworkId == 0) return "UNWIRED";
            if (def.DrawKW > 0f && !d.Powered) return "UNPOWERED";
            if (def.WearPerHour > 0f && d.Condition < def.MaintainBelow) return "WORN — MAINTENANCE DUE";
            // A tank always prints its LITRES, because `water_reclaim`'s STATE turns on a level the
            // rest of this table cannot show: the slice's dry tank holds 0.02 L, not 0, and a player
            // told "a tank is dry" with no way to see the number would reasonably call the row broken.
            if (d.Kind == DeviceKind.WaterTank)
                return Fixed1(d.StoredLiters) + " L"
                     + (d.StoredLiters < defs.Sustenance.DrinkLiters ? " — DRY, BELOW ONE DRINK" : "");
            // A non-finite rate has no percent; say so rather than let Pct's -1 read as a number.
            if (!double.IsFinite(d.Rate) || !double.IsFinite(d.Condition)) return "READING NOT FINITE";
            return "";
        }

        /// <summary>
        /// The row a system reports when one of its inputs is not a finite number.
        ///
        /// <para><b>The ledger must never answer "unknown" with "nominal".</b> A NaN or infinity in
        /// sim state is a BUG, and the previous formatters laundered it into healthy-looking zeros:
        /// `Pct(NaN)` read 0, `Fixed1(NaN)` printed "0.0", and a NaN room slipped past every
        /// comparison while still being counted as pressurised — so a ship with a poisoned float
        /// rendered eight NOMINAL rows and a fabricated "mean O2 0%". Meanwhile the command prompt
        /// read the same field back as `NaN`: the two halves of one feature disagreeing about one
        /// number. The spec already provides the vocabulary for this — load `-1`, STATE OFFLINE, a
        /// stated reason — so use it.</para>
        /// </summary>
        private static ShipSystemRow Unreadable(string id, string label, string what) =>
            new ShipSystemRow(id, label, -1, ShipSystemState.Offline, -1, "",
                "INSTRUMENT UNREADABLE — " + what + " is not a finite number, so this row cannot be "
              + "computed. A non-finite value in sim state is a fault in the ship's software, not a "
              + "reading: this row reports that it cannot tell you rather than reporting a healthy zero.");

        /// <summary>0..1 fraction → 0..100 int, clamped, MidpointRounding.AwayFromZero. A non-finite
        /// input returns the <b>-1</b> "no meaningful value" sentinel, never 0 — see
        /// <see cref="Unreadable"/>.</summary>
        private static int Pct(double fraction)
        {
            if (!double.IsFinite(fraction)) return -1;
            double v = Math.Round(fraction * 100.0, MidpointRounding.AwayFromZero);
            if (v < 0) return 0;
            if (v > 100) return 100;
            return (int)v;
        }

        /// <summary>InvariantCulture one-decimal number for advisory prose (de-DE machine: a bare
        /// ToString() here would emit "12,0" into the wire). A non-finite value prints "?" — an
        /// undefined quantity is not zero, and prose is the last place to pretend otherwise.</summary>
        private static string Fixed1(double v) =>
            !double.IsFinite(v) ? "?" : v.ToString("0.0", Ic);

        private static string Whole(double v) =>
            !double.IsFinite(v) ? "?" : Math.Round(v, MidpointRounding.AwayFromZero).ToString("0", Ic);

        private static string Count(int n, string singular, string plural = null) =>
            n.ToString(Ic) + " " + (n == 1 ? singular : plural ?? singular + "s");
    }
}
