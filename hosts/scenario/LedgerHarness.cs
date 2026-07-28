using System;
using System.Globalization;
using System.Text;
using Perilune.Sim;

namespace Perilune.Tools
{
    /// <summary>
    /// E0-8 — THE LEDGER'S MEASUREMENT FIXTURE, and the harness that produced its audit of
    /// <see cref="ShipMetrics"/>.
    ///
    /// <para>Two jobs, deliberately in one verb, because the second is why the first was chartered.
    /// (1) It prints the new <see cref="ShipLedger"/> hourly, so the four E0-8 members can be read
    /// against a running economy instead of asserted about. (2) It prints an HONESTY TABLE beside
    /// them: for each existing <see cref="ShipMetricsSnapshot"/> member, the number the HUD is
    /// showing NEXT TO the number that is true. `ECONOMY-PLAN.md` §1's E0-8 row says "today Food
    /// reads 1.00 while food production is dead — the metrics must stop lying before anything else
    /// is tuned against them"; this is the instrument that checks that claim and looks for its
    /// siblings.</para>
    ///
    /// <para><b>PURE, AND OUTSIDE THE PINNED PATH.</b> It ticks a sim and reads it; it designates
    /// nothing, enqueues no command, writes no file, and touches no def. It is reached only through
    /// its own verb, so the CI-pinned verb-less <c>--days 3 --seed 42</c> path is byte-identical
    /// with this file present or absent.</para>
    ///
    /// <para><b>"True" here means A SECOND, INDEPENDENT DERIVATION</b> — a different scan reaching
    /// the same quantity by a different route (worst room instead of a mean; living crew instead of
    /// the store's Count; the wired-and-wanting power gate <c>PowerSystem.Balance</c> itself
    /// applies). It is emphatically NOT the metric's own expression re-evaluated, which would make
    /// this table assert that a function equals itself — the anti-tautology rule at
    /// `ECONOMY-PLAN.md` §5.2.1.</para>
    ///
    /// <para><b>WHY THE LIARS ARE REPORTED HERE AND NOT FIXED IN <see cref="ShipMetrics"/>.</b>
    /// <c>ShipMetrics.cs:20</c> says "call from UI at ~1 Hz, never per tick" and
    /// <c>DirectorSystem.cs:80</c> calls it inside <c>Tick</c>, feeding Morale/Water/Food/Power into
    /// a tension term that moves the wear lever — and <c>DirectorSystem</c> is an
    /// <c>IStatefulSystem</c> whose <c>StateChecksum()</c> folds straight into
    /// <c>Simulation.StateHash</c>. So every metric below is already load-bearing, and correcting any
    /// of them is a determinism pin move rather than a display change.</para>
    ///
    /// <para>⚠️ THAT COUPLING IS NOT A NEW FINDING and this file should not be read as claiming one:
    /// it is documented at <c>DirectorSystem.cs:41-46</c>, in <c>MECHANICS.md</c> (§ around
    /// lines 653-654 and 1057) and in <c>docs/design/perilune-economy-modularity.md</c> §1.5.1, which
    /// treats it as the reference pattern for wiring a soul-derived modulator into an economy system.
    /// What IS new is the consequence for this package: the metrics riding that path are measurably
    /// wrong (see the rows below), so the coupling is currently carrying bad numbers into hashed
    /// state, and the ledger had to be built beside <see cref="ShipMetrics"/> rather than inside
    /// it.</para>
    /// </summary>
    public static class LedgerHarness
    {
        private static readonly CultureInfo Ic = CultureInfo.InvariantCulture;

        /// <summary>Ground truth for one <see cref="ShipMetricsSnapshot"/> member, derived a second
        /// way. <see cref="Verdict"/> is the harness's own words about the gap, never a pass/fail —
        /// a metric may legitimately be a documented proxy.</summary>
        public readonly struct MetricAudit
        {
            public readonly string Name, Shown, Truth, Verdict;
            public MetricAudit(string name, string shown, string truth, string verdict)
            { Name = name; Shown = shown; Truth = truth; Verdict = verdict; }
        }

        /// <summary>
        /// Audit every <see cref="ShipMetricsSnapshot"/> member against an independent derivation.
        /// Pure read; deterministic (store order and room index order throughout).
        /// </summary>
        public static MetricAudit[] Audit(Simulation sim)
        {
            if (sim == null) throw new ArgumentNullException(nameof(sim));
            var m = ShipMetrics.Compute(sim);
            var defs = sim.Defs;

            // ---- crew: living vs the store's Count -------------------------------------------
            // Dead crew are NEVER removed from the store — NeedsSystem only sets Citizen.Dead — so
            // `sim.Citizens.Items.Count` is "souls who ever boarded", not "crew aboard".
            var citizens = sim.Citizens.Items;
            int stored = citizens.Count, living = 0;
            float livingMoodSum = 0f, storedMoodSum = 0f;
            for (int i = 0; i < citizens.Count; i++)
            {
                storedMoodSum += citizens[i].Mood;
                if (citizens[i].Dead) continue;
                living++;
                livingMoodSum += citizens[i].Mood;
            }

            // ---- items ------------------------------------------------------------------------
            var sample = ShipLedger.Sample(sim);
            // `FoodUnits`, not `UnitsOf(ItemKind.Potato)`: which kind is food is a decision, and
            // ShipLedger.FoodKind is where it is made. E1 adds a cooked `Meal`; naming Potato here
            // would make this harness the file that quietly kept counting only the raw crop.
            int potatoes = sample.FoodUnits;

            // ---- power: PowerSystem.Balance's OWN gates ----------------------------------------
            // Balance skips NetworkId == 0 outright, and a vent only WANTS power while open. A device
            // that is off-grid or not wanting is never powered and never shed; counting its draw as
            // unserved demand reports a brownout that is not happening.
            var devices = sim.Devices.Items;
            var machines = defs.Machines;
            float demandAll = 0f, servedAll = 0f, demandWired = 0f, servedWired = 0f;
            int offGridDrawers = 0, notWanting = 0;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                float draw = machines[(int)d.Kind].DrawKW;
                if (draw <= 0f) continue;
                demandAll += draw;
                if (d.Powered) servedAll += draw;
                bool wanting = d.Kind != DeviceKind.AirVent || d.IsOpen;
                if (d.NetworkId == 0) { offGridDrawers++; continue; }
                if (!wanting) { notWanting++; continue; }
                demandWired += draw;
                if (d.Powered) servedWired += draw;
            }
            float powerWired = demandWired <= 0f ? 1f : servedWired / demandWired;

            // ---- rooms: worst vs mean ----------------------------------------------------------
            var rooms = sim.Rooms.Rooms;
            double worstO2Fraction = double.MaxValue, worstPpO2 = double.MaxValue;
            double coldestC = double.MaxValue, warmestC = double.MinValue;
            int pressurized = 0, zeroTileRooms = 0, nonFinite = 0;
            for (int i = 1; i < rooms.Count; i++)
            {
                var room = rooms[i];
                if (room == null) continue;
                if (room.TileCount <= 0) { zeroTileRooms++; continue; }
                if (!double.IsFinite(room.PressureKPa) || !double.IsFinite(room.O2Fraction) ||
                    !double.IsFinite(room.TemperatureK)) { nonFinite++; continue; }
                if (room.PressureKPa < 50.0) continue;
                pressurized++;
                if (room.O2Fraction < worstO2Fraction) worstO2Fraction = room.O2Fraction;
                double ppo2 = room.O2Fraction * room.PressureKPa;
                if (ppo2 < worstPpO2) worstPpO2 = ppo2;
                double c = room.TemperatureK - 273.15;
                if (c < coldestC) coldestC = c;
                if (c > warmestC) warmestC = c;
            }
            if (pressurized == 0) { worstO2Fraction = 0; worstPpO2 = 0; coldestC = 0; warmestC = 0; }

            // ---- tanks: fill vs the driest tank -------------------------------------------------
            int tanks = 0, dryTanks = 0;
            float driest = float.MaxValue;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.WaterTank) continue;
                tanks++;
                if (d.StoredLiters < driest) driest = d.StoredLiters;
                if (d.StoredLiters < defs.Sustenance.DrinkLiters) dryTanks++;
            }
            if (tanks == 0) driest = 0f;

            // ---- how much food is that, really? -------------------------------------------------
            // ⚠️ THIS USED TO BE A SECOND, WRONG DERIVATION and E0-9 deleted it rather than moving it.
            // It read `1 / potato_hunger_value` potatoes per crew per day, justified in a comment as
            // "hunger fills once per sim-day". IT DOES NOT: `needs.def hunger_per_second` is
            // 1/172,800, which fills the meter in TWO sim-days, so this harness UNDER-REPORTED the
            // ship's food runway by exactly 2× — 211 potatoes on `--ship grid` read 9.5 days where
            // the truth is 19.0. The number now comes off `ShipLedgerSample`, which is also what the
            // wire and the Overview's LEDGER island print, so there is one derivation and it cannot
            // drift from the one the player sees.
            double foodDays = sample.DaysOfFood;

            return new[]
            {
                // ⚠️ THE VERDICT COMPARES THE NUMBERS, NOT THE COUNTS. An earlier draft declared
                // "DISAGREES" whenever an off-grid or closed-vent drawer existed — and on the slice
                // that fired while both derivations read exactly 1.000, because PowerSystem powers a
                // closed vent anyway. A harness that reports a liar which is not lying is the same
                // defect as the metric it is auditing.
                new MetricAudit("Power", F3(m.Power),
                    F3(powerWired) + "  (wired+wanting gate: " + demandWired.ToString("0.0", Ic) + " kW of " +
                    demandAll.ToString("0.0", Ic) + " kW)",
                    Math.Abs(m.Power - powerWired) > 0.005f
                        ? "DISAGREES by " + F3(Math.Abs(m.Power - powerWired)) + ": " + offGridDrawers +
                          " off-grid + " + notWanting + " not-wanting drawer(s) sit in ShipMetrics' " +
                          "denominator. They are never wired and never shed, so the bar reports a " +
                          "brownout that is not happening."
                        : "agrees on this ship (" + offGridDrawers + " off-grid, " + notWanting +
                          " not-wanting drawer(s) are in its denominator but do not move the number). " +
                          "Structurally it is a SHED indicator that saturates at 1.0 — it can never " +
                          "show a loaded-but-coping ship."),

                new MetricAudit("Oxygen", F3(m.Oxygen),
                    "worst room " + F3(worstO2Fraction / 0.21) + " (ppO2 " + worstPpO2.ToString("0.0", Ic) + " kPa)",
                    m.Oxygen - (float)(worstO2Fraction / 0.21) > 0.02f
                        ? "MEAN HIDES A ROOM: the bar is " + F3(m.Oxygen) + " while a compartment sits at " +
                          F3(worstO2Fraction / 0.21) + ". It is also CLAMPED to 1, so it cannot show a full ship."
                        : "agrees today (one atmosphere, or all rooms alike) — still a mean, still clamped at 1"),

                new MetricAudit("Co2Ppm", m.Co2Ppm.ToString("0", Ic), "worst pressurised room (same derivation)",
                    "honest — worst-room, not a mean, and raw ppm rather than a fraction"),

                new MetricAudit("Water", F3(m.Water),
                    "driest tank " + driest.ToString("0.00", Ic) + " L of " + tanks + " tank(s); " +
                    dryTanks + " below one drink",
                    dryTanks > 0
                        ? "FILL HIDES A DRY TANK: the bar is " + F3(m.Water) + " while " + dryTanks +
                          " tank(s) hold less than one drink. Fill is a ship total; a thirsty crew " +
                          "member drinks at ONE tank."
                        : "agrees today — but it is a LEVEL, not a flow: a dead reclaimer reads full"),

                new MetricAudit("Food", F3(m.Food),
                    potatoes + " potatoes = " + (foodDays < 0 ? "n/a" : foodDays.ToString("0.0", Ic)) +
                    " days for " + living + " living crew (ShipLedger.DaysOfFood — the number the " +
                    "LEDGER island shows)",
                    m.Food >= 1f && potatoes > living * 5
                        ? "SATURATED — THE CHARTER'S NAMED LIAR. min(1, potatoes/(pop*5)) is CLAMPED, so " +
                          potatoes + " potatoes and " + (living * 5) + " potatoes both read 1.000, and the " +
                          "bar cannot fall until stores are nearly gone. It measures a STOCK and is read " +
                          "as a supply. It also divides by the STORE's crew count (" + stored + "), which " +
                          "includes the dead."
                        : "not saturated on this ship right now (still clamped, still divides by " + stored + ")"),

                new MetricAudit("Heat", F3(m.Heat),
                    "coldest " + coldestC.ToString("0.0", Ic) + " C, warmest " + warmestC.ToString("0.0", Ic) + " C",
                    "honest — a fraction of compartments in the 10-35 C band, and it says so"),

                new MetricAudit("Structural", F3(m.Structural), "mean machine condition (same derivation)",
                    "a DECLARED PROXY (ShipMetrics.cs:12) — no hull-stress model exists"),

                new MetricAudit("Morale", F3(m.Morale),
                    F3((livingMoodSum / Math.Max(1, living) + 100f) / 200f) + " over " + living + " LIVING crew",
                    stored == living
                        ? "agrees — nobody has died on this ship yet"
                        : "DIVIDES BY THE DEAD: " + (stored - living) + " dead crew are still in the store " +
                          "(NeedsSystem.cs:198 sets a flag, it never removes), and their last mood is " +
                          "averaged into the living crew's morale forever."),

                new MetricAudit("(crew count)", "Citizens.Items.Count = " + stored, living + " alive",
                    stored == living ? "agrees" :
                        "the divisor under Food AND Morale is " + stored + ", not " + living),

                new MetricAudit("(room guard)", "none",
                    zeroTileRooms + " zero-tile room(s), " + nonFinite + " non-finite room(s)",
                    "ShipMetrics dereferences rooms[i] with NO null / TileCount / NaN guard, unlike its " +
                    "sibling ShipSystems.Census. Latent today (" + zeroTileRooms + " + " + nonFinite +
                    " such rooms); a NaN room would slip PAST the `< 50 kPa` gate and make Oxygen NaN."),
            };
        }

        /// <summary>One hourly line of the ledger, for the run table.</summary>
        public static string FormatLedgerLine(in ShipLedgerReport r)
        {
            var sb = new StringBuilder(160);
            sb.Append("  matter ").Append(r.Now.TotalUnits.ToString(Ic).PadLeft(6))
              .Append(" u in ").Append(r.Now.Stacks.ToString(Ic).PadLeft(4)).Append(" stacks")
              .Append("   parts ").Append(r.Now.UnitsOf(ItemKind.Parts).ToString(Ic).PadLeft(4))
              .Append(' ').Append(Rate(r.PartsPerDay, r.WindowTicks))
              .Append("   water ").Append(r.Now.TankLiters.ToString("0.0", Ic).PadLeft(7)).Append(" L ")
              .Append(Runway(r.DaysOfWater, r.WindowTicks))
              // Food takes NO window argument, and that asymmetry is the point: DAYS OF FOOD is
              // modelled from this one census, so it is readable on the very first line of the run
              // where every measured runway still says [measuring].
              .Append("   food ").Append(r.Now.FoodUnits.ToString(Ic).PadLeft(5)).Append(" u ")
              .Append(r.Now.DaysOfFood < 0 ? "[no crew]"
                      : "[" + r.Now.DaysOfFood.ToString("0.00", Ic) + " d]")
              .Append("   O2 ").Append(CrewDays(r.Now)).Append(' ')
              .Append(Runway(r.O2TrendDays, r.WindowTicks));
            return sb.ToString();
        }

        /// <summary>Standing O2 in CREW-DAYS — the stock over what the living crew breathe in a day.
        /// A bare mole count has no reference point anywhere on this ship. "n/a" when nobody is alive
        /// to breathe it, never a division by zero.</summary>
        private static string CrewDays(in ShipLedgerSample s) =>
            s.CrewO2MolesPerDay > 0
                ? (s.BreathableO2Moles / s.CrewO2MolesPerDay).ToString("0.0", Ic).PadLeft(6) + " crew-d"
                : "   n/a crew-d";

        private static string Rate(double perDay, long window) =>
            window <= 0 ? "[measuring]" : "(" + (perDay >= 0 ? "+" : "") + perDay.ToString("0.0", Ic) + "/d)";

        private static string Runway(double days, long window) =>
            window <= 0 ? "[measuring]" : days < 0 ? "[not depleting]" : "[" + days.ToString("0.00", Ic) + " d]";

        private static string F3(double v) => v.ToString("0.000", Ic);
    }
}
