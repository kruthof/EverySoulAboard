using System;
using System.Collections.Generic;
using System.Globalization;

namespace Perilune.Sim
{
    /// <summary>
    /// Hand-rolled reader for the <c>.def</c> tuning format (repo culture: MOSS lexer,
    /// AsciiWorld, MBSV — no JSON, no packages, System.* only, netstandard2.1-safe so
    /// Unity compiles it too). PURE: text in, <see cref="SimDefs"/> out — Sim.Core never
    /// touches the filesystem, so the caller owns file IO and passes (name, text) pairs.
    ///
    /// Format: <c>#</c> starts a comment to end of line; blank lines ignored; CRLF
    /// tolerated. <c>[section]</c> opens a section; scalar sections take
    /// <c>key = value</c>; <c>[machines]</c>/<c>[recipes]</c> are whitespace-aligned
    /// tables keyed by enum NAME, and <c>[machines]</c> also accepts the
    /// <c>radiator_reject_kw = …</c> scalar.
    ///
    /// FAIL-SOFT (DeviceLayout.json precedent: warn, never brick): every malformed line
    /// appends a problem string and keeps the default value, so <see cref="Parse"/>
    /// always returns a usable graph. All numbers parse with
    /// <see cref="CultureInfo.InvariantCulture"/> — this machine runs de-DE where
    /// <c>float.Parse("0.5")</c> would otherwise yield 5.
    /// </summary>
    public static class DefsParser
    {
        private enum Section { None, Thermal, Atmosphere, Needs, Sustenance, Water, Hydro, Wear, Citizen, Exploration, Machines, Recipes, Unknown }

        private static readonly char[] Whitespace = { ' ', '\t' };

        public static SimDefs Parse(IReadOnlyList<(string name, string text)> files, List<string> problems) =>
            Parse(files, null, problems);

        /// <summary>
        /// As <see cref="Parse(IReadOnlyList{ValueTuple{string, string}}, List{string})"/>,
        /// but also folds designer rules (B5) into <see cref="SimDefs.Rules"/> and the
        /// checksum. <paramref name="ruleFiles"/> are (ruleName, mossSource) pairs — the
        /// host is expected to pass them already Ordinal-sorted by filename, with the
        /// rule name being the filename without extension. Rules are stored verbatim (no
        /// compile here — <see cref="DesignerRuleSystem"/> compiles them fail-soft); a
        /// null/empty set leaves the graph's checksum identical to the tuning-only run.
        /// </summary>
        public static SimDefs Parse(
            IReadOnlyList<(string name, string text)> files,
            IReadOnlyList<(string name, string source)> ruleFiles,
            List<string> problems)
        {
            if (problems == null) throw new ArgumentNullException(nameof(problems));
            var d = SimDefs.CreateDefault(); // fresh graph — never mutate SimDefs.Default

            if (files != null)
            {
                for (int f = 0; f < files.Count; f++)
                {
                    string name = files[f].name ?? "<unnamed>";
                    string text = files[f].text;
                    if (text == null) continue;

                    var section = Section.None;
                    string[] lines = text.Split('\n');
                    for (int i = 0; i < lines.Length; i++)
                    {
                        string line = StripComment(lines[i]).Trim();
                        if (line.Length == 0) continue;
                        string loc = name + ":" + (i + 1);

                        if (line[0] == '[')
                        {
                            section = OpenSection(line, loc, problems);
                            continue;
                        }
                        if (section == Section.None) { problems.Add(loc + ": content before any [section] — ignored"); continue; }
                        if (section == Section.Unknown) continue; // already warned at the header

                        if (section == Section.Machines || section == Section.Recipes)
                        {
                            if (section == Section.Machines && line.IndexOf('=') >= 0) ApplyMachineScalar(d, line, loc, problems);
                            else if (section == Section.Machines) ApplyMachineRow(d, line, loc, problems);
                            else ApplyRecipeRow(d, line, loc, problems);
                            continue;
                        }

                        // Scalar sections: key = value.
                        int eq = line.IndexOf('=');
                        if (eq < 0) { problems.Add(loc + ": expected 'key = value' — ignored"); continue; }
                        string key = line.Substring(0, eq).Trim().ToLowerInvariant();
                        string val = line.Substring(eq + 1).Trim();
                        ApplyScalar(d, section, key, val, loc, problems);
                    }
                }
            }

            if (ruleFiles != null && ruleFiles.Count > 0)
            {
                var rules = new RuleDef[ruleFiles.Count];
                for (int i = 0; i < ruleFiles.Count; i++)
                    rules[i] = new RuleDef(ruleFiles[i].name ?? "<unnamed>", ruleFiles[i].source ?? "");
                d.Rules = rules;
            }
            else
            {
                d.Rules = Array.Empty<RuleDef>();
            }

            d.ComputeChecksum(); // now includes any rules (no-op when empty)
            return d;
        }

        private static Section OpenSection(string line, string loc, List<string> problems)
        {
            int close = line.IndexOf(']');
            string raw = close > 0 ? line.Substring(1, close - 1) : line.Substring(1);
            switch (raw.Trim().ToLowerInvariant())
            {
                case "thermal": return Section.Thermal;
                case "atmosphere": return Section.Atmosphere;
                case "needs": return Section.Needs;
                case "sustenance": return Section.Sustenance;
                case "water": return Section.Water;
                case "hydro": return Section.Hydro;
                case "wear": return Section.Wear;
                case "citizen": return Section.Citizen;
                case "exploration": return Section.Exploration;
                case "machines": return Section.Machines;
                case "recipes": return Section.Recipes;
                default:
                    problems.Add(loc + ": unknown section '" + raw.Trim() + "' — ignored");
                    return Section.Unknown;
            }
        }

        // ------------------------------------------------------------------ scalars

        private static void ApplyScalar(SimDefs d, Section s, string key, string val, string loc, List<string> p)
        {
            bool known;
            switch (s)
            {
                case Section.Thermal: known = ThermalKey(d, key, val, loc, p); break;
                case Section.Atmosphere: known = AtmosphereKey(d, key, val, loc, p); break;
                case Section.Needs: known = NeedsKey(d, key, val, loc, p); break;
                case Section.Sustenance: known = SustenanceKey(d, key, val, loc, p); break;
                case Section.Water: known = WaterKey(d, key, val, loc, p); break;
                case Section.Hydro: known = HydroKey(d, key, val, loc, p); break;
                case Section.Wear: known = WearKey(d, key, val, loc, p); break;
                case Section.Citizen: known = CitizenKey(d, key, val, loc, p); break;
                case Section.Exploration: known = ExplorationKey(d, key, val, loc, p); break;
                default: known = false; break;
            }
            if (!known) p.Add(loc + ": unknown key '" + key + "' — ignored");
        }

        private static bool ThermalKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "heat_capacity_j_per_k_per_tile": if (D(v, k, loc, p, out var a)) d.Thermal.HeatCapacityJPerKPerTile = a; return true;
                case "citizen_heat_w": if (D(v, k, loc, p, out var b)) d.Thermal.CitizenHeatW = b; return true;
                case "radiator_floor_k": if (D(v, k, loc, p, out var c)) d.Thermal.RadiatorFloorK = c; return true;
                case "door_conduct_open_w_per_k": if (D(v, k, loc, p, out var e)) d.Thermal.DoorConductOpenWPerK = e; return true;
                case "door_conduct_closed_w_per_k": if (D(v, k, loc, p, out var f)) d.Thermal.DoorConductClosedWPerK = f; return true;
                case "hull_loss_w_per_k_per_tile": if (D(v, k, loc, p, out var g)) d.Thermal.HullLossWPerKelvinPerTile = g; return true;
                case "space_sink_k": if (D(v, k, loc, p, out var h)) d.Thermal.SpaceSinkK = h; return true;
                case "min_temperature_k": if (D(v, k, loc, p, out var i)) d.Thermal.MinTemperatureK = i; return true;
                case "max_temperature_k": if (D(v, k, loc, p, out var j)) d.Thermal.MaxTemperatureK = j; return true;
                default: return false;
            }
        }

        private static bool AtmosphereKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "flow_coefficient": if (D(v, k, loc, p, out var a)) d.Atmosphere.FlowCoefficient = a; return true;
                case "o2_per_person_per_second": if (D(v, k, loc, p, out var b)) d.Atmosphere.O2PerPersonPerSecond = b; return true;
                case "co2_per_person_per_second": if (D(v, k, loc, p, out var c)) d.Atmosphere.CO2PerPersonPerSecond = c; return true;
                case "vent_mol_per_second": if (D(v, k, loc, p, out var e)) d.Atmosphere.VentMolPerSecond = e; return true;
                case "scrubber_mol_per_second": if (D(v, k, loc, p, out var f)) d.Atmosphere.ScrubberMolPerSecond = f; return true;
                case "nominal_pressure_kpa": if (D(v, k, loc, p, out var g)) d.Atmosphere.NominalPressureKPa = g; return true;
                default: return false;
            }
        }

        private static bool NeedsKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "hypoxia_ppo2_kpa": if (D(v, k, loc, p, out var a)) d.Needs.HypoxiaPpO2KPa = a; return true;
                case "severe_hypoxia_ppo2_kpa": if (D(v, k, loc, p, out var b)) d.Needs.SevereHypoxiaPpO2KPa = b; return true;
                case "co2_narcosis_ppm": if (D(v, k, loc, p, out var c)) d.Needs.Co2NarcosisPpm = c; return true;
                case "vacuum_pressure_kpa": if (D(v, k, loc, p, out var e)) d.Needs.VacuumPressureKPa = e; return true;
                case "heat_stroke_c": if (D(v, k, loc, p, out var f)) d.Needs.HeatStrokeC = f; return true;
                case "hypothermia_c": if (D(v, k, loc, p, out var g)) d.Needs.HypothermiaC = g; return true;
                case "suffocation_per_second_vacuum": if (F(v, k, loc, p, out var h)) d.Needs.SuffocationPerSecondVacuum = h; return true;
                case "suffocation_per_second_hypoxia": if (F(v, k, loc, p, out var i)) d.Needs.SuffocationPerSecondHypoxia = i; return true;
                case "suffocation_recovery_per_second": if (F(v, k, loc, p, out var j)) d.Needs.SuffocationRecoveryPerSecond = j; return true;
                case "hunger_per_second": if (F(v, k, loc, p, out var l)) d.Needs.HungerPerSecond = l; return true;
                case "thirst_per_second": if (F(v, k, loc, p, out var m)) d.Needs.ThirstPerSecond = m; return true;
                case "fatigue_per_second": if (F(v, k, loc, p, out var n)) d.Needs.FatiguePerSecond = n; return true;
                case "mood_base": if (F(v, k, loc, p, out var o)) d.Needs.MoodBase = o; return true;
                case "mood_hunger_weight": if (F(v, k, loc, p, out var q)) d.Needs.MoodHungerWeight = q; return true;
                case "mood_thirst_weight": if (F(v, k, loc, p, out var r)) d.Needs.MoodThirstWeight = r; return true;
                case "mood_fatigue_weight": if (F(v, k, loc, p, out var s)) d.Needs.MoodFatigueWeight = s; return true;
                case "mood_suffocation_weight": if (F(v, k, loc, p, out var t)) d.Needs.MoodSuffocationWeight = t; return true;
                default: return false;
            }
        }

        private static bool SustenanceKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "drink_liters": if (F(v, k, loc, p, out var a)) d.Sustenance.DrinkLiters = a; return true;
                case "potato_hunger_value": if (F(v, k, loc, p, out var b)) d.Sustenance.PotatoHungerValue = b; return true;
                case "need_threshold": if (F(v, k, loc, p, out var c)) d.Sustenance.NeedThreshold = c; return true;
                default: return false;
            }
        }

        private static bool WaterKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "tank_capacity_liters": if (F(v, k, loc, p, out var a)) d.Water.TankCapacityLiters = a; return true;
                case "reclaimer_liters_per_second": if (F(v, k, loc, p, out var b)) d.Water.ReclaimerLitersPerSecond = b; return true;
                case "reclaim_efficiency": if (F(v, k, loc, p, out var c)) d.Water.ReclaimEfficiency = c; return true;
                default: return false;
            }
        }

        private static bool HydroKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "grow_bed_water_per_second": if (F(v, k, loc, p, out var a)) d.Hydro.GrowBedWaterPerSecond = a; return true;
                case "grow_seconds_per_crop": if (F(v, k, loc, p, out var b)) d.Hydro.GrowSecondsPerCrop = b; return true;
                case "transpiration_recapture_fraction": if (F(v, k, loc, p, out var c)) d.Hydro.TranspirationRecaptureFraction = c; return true;
                default: return false;
            }
        }

        private static bool WearKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "hot_threshold_c": if (F(v, k, loc, p, out var a)) d.Wear.HotThresholdC = a; return true;
                case "wear_per_degree_c": if (F(v, k, loc, p, out var b)) d.Wear.WearPerDegreeC = b; return true;
                case "max_heat_multiplier": if (F(v, k, loc, p, out var c)) d.Wear.MaxHeatMultiplier = c; return true;
                case "maintenance_work_seconds": if (I(v, k, loc, p, out var e)) d.Wear.MaintenanceWorkSeconds = e; return true;
                case "jury_rig_condition": if (F(v, k, loc, p, out var f)) d.Wear.JuryRigCondition = f; return true;
                default: return false;
            }
        }

        private static bool CitizenKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "ticks_per_tile": if (I(v, k, loc, p, out var a)) d.Citizen.TicksPerTile = a; return true;
                case "idle_ticks_between_wanders": if (I(v, k, loc, p, out var b)) d.Citizen.IdleTicksBetweenWanders = b; return true;
                default: return false;
            }
        }

        private static bool ExplorationKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "radius": if (I(v, k, loc, p, out var a)) d.Exploration.Radius = a; return true;
                default: return false;
            }
        }

        // ------------------------------------------------------------------- tables

        private static void ApplyMachineScalar(SimDefs d, string line, string loc, List<string> p)
        {
            int eq = line.IndexOf('=');
            string key = line.Substring(0, eq).Trim().ToLowerInvariant();
            string val = line.Substring(eq + 1).Trim();
            if (key == "radiator_reject_kw") { if (F(val, key, loc, p, out var v)) d.RadiatorRejectKW = ClampNonNeg(v, key, loc, p); }
            else p.Add(loc + ": unknown key '" + key + "' in [machines] — ignored");
        }

        private static void ApplyMachineRow(SimDefs d, string line, string loc, List<string> p)
        {
            string[] c = line.Split(Whitespace, StringSplitOptions.RemoveEmptyEntries);
            if (c.Length != 9) { p.Add(loc + ": [machines] row needs 9 columns (kind draw gen tier blocks heat wear maint fail), got " + c.Length + " — skipped"); return; }
            if (!TryEnum<DeviceKind>(c[0], loc, p, out var kind)) return;
            if (!TryEnum<PowerTier>(c[3], loc, p, out var tier)) return;
            if (!F(c[1], "draw", loc, p, out var draw) || !F(c[2], "gen", loc, p, out var gen) ||
                !B(c[4], "blocks", loc, p, out var blocks) || !F(c[5], "heat", loc, p, out var heat) ||
                !F(c[6], "wear", loc, p, out var wear) || !F(c[7], "maint", loc, p, out var maint) ||
                !F(c[8], "fail", loc, p, out var fail))
            {
                p.Add(loc + ": [machines] row '" + c[0] + "' has a malformed number — skipped");
                return;
            }

            draw = ClampNonNeg(draw, "draw", loc, p);
            gen = ClampNonNeg(gen, "gen", loc, p);
            heat = ClampNonNeg(heat, "heat", loc, p);
            wear = ClampNonNeg(wear, "wear", loc, p);
            maint = ClampNonNeg(maint, "maint", loc, p);
            fail = ClampNonNeg(fail, "fail", loc, p);
            if (fail > maint) { p.Add(loc + ": [machines] row '" + c[0] + "' fail (" + fail.ToString(CultureInfo.InvariantCulture) + ") > maint (" + maint.ToString(CultureInfo.InvariantCulture) + ") — clamped fail to maint"); fail = maint; }

            d.Machines[(int)kind] = new MachineDef(draw, gen, tier, blocks, heat, wear, maint, fail);
        }

        private static void ApplyRecipeRow(SimDefs d, string line, string loc, List<string> p)
        {
            string[] c = line.Split(Whitespace, StringSplitOptions.RemoveEmptyEntries);
            if (c.Length != 6) { p.Add(loc + ": [recipes] row needs 6 columns (kind input in_count output out_count work_s), got " + c.Length + " — skipped"); return; }
            if (!TryEnum<DeviceKind>(c[0], loc, p, out var kind)) return;
            if (!TryEnum<ItemKind>(c[1], loc, p, out var input) || !TryEnum<ItemKind>(c[3], loc, p, out var output)) return;
            if (!I(c[2], "in_count", loc, p, out var inCount) || !I(c[4], "out_count", loc, p, out var outCount) || !I(c[5], "work_s", loc, p, out var work))
            {
                p.Add(loc + ": [recipes] row '" + c[0] + "' has a malformed integer — skipped");
                return;
            }
            d.Recipes[(int)kind] = new RecipeDef(input, inCount, output, outCount, work);
        }

        // ------------------------------------------------------------------ helpers

        private static string StripComment(string line)
        {
            int h = line.IndexOf('#');
            return h < 0 ? line : line.Substring(0, h);
        }

        private static float ClampNonNeg(float v, string field, string loc, List<string> p)
        {
            if (v >= 0f) return v;
            p.Add(loc + ": '" + field + "' must be >= 0 — clamped to 0");
            return 0f;
        }

        private static bool F(string s, string key, string loc, List<string> p, out float r)
        {
            if (float.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out r)) return true;
            p.Add(loc + ": '" + key + "' expects a number, got '" + s + "' — keeping default");
            return false;
        }

        private static bool D(string s, string key, string loc, List<string> p, out double r)
        {
            if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out r)) return true;
            p.Add(loc + ": '" + key + "' expects a number, got '" + s + "' — keeping default");
            return false;
        }

        private static bool I(string s, string key, string loc, List<string> p, out int r)
        {
            if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out r)) return true;
            p.Add(loc + ": '" + key + "' expects an integer, got '" + s + "' — keeping default");
            return false;
        }

        private static bool B(string s, string key, string loc, List<string> p, out bool r)
        {
            if (bool.TryParse(s, out r)) return true;
            if (s == "1") { r = true; return true; }
            if (s == "0") { r = false; return true; }
            p.Add(loc + ": '" + key + "' expects true/false, got '" + s + "' — keeping default");
            return false;
        }

        private static bool TryEnum<T>(string s, string loc, List<string> p, out T result) where T : struct
        {
            // Enum.TryParse also accepts numeric text (incl. undefined values like "99"),
            // which would then crash an array index — require a DEFINED enum value.
            if (Enum.TryParse(s, false, out result) && Enum.IsDefined(typeof(T), result)) return true; // exact case
            if (Enum.TryParse(s, true, out result) && Enum.IsDefined(typeof(T), result))               // case-insensitive
            {
                p.Add(loc + ": " + typeof(T).Name + " '" + s + "' matched case-insensitively — prefer exact case");
                return true;
            }
            p.Add(loc + ": unknown " + typeof(T).Name + " '" + s + "' — row skipped");
            result = default;
            return false;
        }
    }
}
