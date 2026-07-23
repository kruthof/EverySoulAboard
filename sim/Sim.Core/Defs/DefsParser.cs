using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

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
    /// <c>radiator_reject_kw = …</c> scalar. <c>[production]</c> (W0-5) is a whitespace-
    /// aligned table too, but keyed by a free-text node id and ORDERED — rows accumulate
    /// across files in file order, and a repeated id replaces in place. It is also the one
    /// table with no decimal column at all: every value is an integer or an enum name.
    ///
    /// FAIL-SOFT (DeviceLayout.json precedent: warn, never brick): every malformed line
    /// appends a problem string and keeps the default value, so <see cref="Parse"/>
    /// always returns a usable graph. All numbers parse with
    /// <see cref="CultureInfo.InvariantCulture"/> — this machine runs de-DE where
    /// <c>float.Parse("0.5")</c> would otherwise yield 5.
    /// </summary>
    public static class DefsParser
    {
        private enum Section { None, Thermal, Atmosphere, Needs, Sustenance, Water, Hydro, Wear, Citizen, Exploration, Social, Nav, Build, Director, Machines, Recipes, Production, Unknown }

        private static readonly char[] Whitespace = { ' ', '\t' };
        private static readonly char[] PortSeparator = { '+' };

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

            // [production] is an ORDERED, ADDITIVE table (unlike the keyed [machines]/
            // [recipes] arrays), so rows accumulate across every file in file order and are
            // installed once at the end. A repeated node id REPLACES in place — the overlay
            // contract, without disturbing table order.
            var production = new List<ProductionNode>();

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

                        if (section == Section.Machines || section == Section.Recipes || section == Section.Production)
                        {
                            if (section == Section.Machines && line.IndexOf('=') >= 0) ApplyMachineScalar(d, line, loc, problems);
                            else if (section == Section.Machines) ApplyMachineRow(d, line, loc, problems);
                            else if (section == Section.Recipes) ApplyRecipeRow(d, line, loc, problems);
                            else ApplyProductionRow(production, line, loc, problems);
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

            d.Production = new ProductionDefs
            {
                Nodes = production.Count == 0 ? Array.Empty<ProductionNode>() : production.ToArray(),
            };
            if (production.Count > 1) WarnOnShadowedNodes(d.Production, problems);

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
                case "social": return Section.Social;
                case "nav": return Section.Nav;
                case "build": return Section.Build;
                case "director": return Section.Director;
                case "machines": return Section.Machines;
                case "recipes": return Section.Recipes;
                case "production": return Section.Production;
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
                case Section.Social: known = SocialKey(d, key, val, loc, p); break;
                case Section.Nav: known = NavKey(d, key, val, loc, p); break;
                case Section.Build: known = BuildKey(d, key, val, loc, p); break;
                case Section.Director: known = DirectorKey(d, key, val, loc, p); break;
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
                case "diffusion_coefficient": if (D(v, k, loc, p, out var h)) d.Atmosphere.DiffusionCoefficient = h; return true;
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
                case "flee_suffocation": if (F(v, k, loc, p, out var fs)) d.Needs.FleeSuffocation = fs; return true;
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
                case "makeup_floor_liters": if (F(v, k, loc, p, out var e)) d.Water.MakeupFloorLiters = e; return true;
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
                case "wander_radius_tiles": if (I(v, k, loc, p, out var c)) d.Citizen.WanderRadiusTiles = c; return true;
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

        private static bool SocialKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "familiarize_per_hour": if (F(v, k, loc, p, out var a)) d.Social.FamiliarizePerHour = a; return true;
                case "decay_per_hour": if (F(v, k, loc, p, out var b)) d.Social.DecayPerHour = b; return true;
                case "max_opinion": if (F(v, k, loc, p, out var c)) d.Social.MaxOpinion = c; return true;
                case "min_opinion": if (F(v, k, loc, p, out var e)) d.Social.MinOpinion = e; return true;
                case "friend_enter_opinion": if (F(v, k, loc, p, out var f)) d.Social.FriendEnterOpinion = f; return true;
                case "friend_exit_opinion": if (F(v, k, loc, p, out var g)) d.Social.FriendExitOpinion = g; return true;
                case "close_friend_enter_opinion": if (F(v, k, loc, p, out var h)) d.Social.CloseFriendEnterOpinion = h; return true;
                case "close_friend_exit_opinion": if (F(v, k, loc, p, out var i)) d.Social.CloseFriendExitOpinion = i; return true;
                case "rival_enter_opinion": if (F(v, k, loc, p, out var j)) d.Social.RivalEnterOpinion = j; return true;
                case "rival_exit_opinion": if (F(v, k, loc, p, out var l)) d.Social.RivalExitOpinion = l; return true;
                case "enemy_enter_opinion": if (F(v, k, loc, p, out var m)) d.Social.EnemyEnterOpinion = m; return true;
                case "enemy_exit_opinion": if (F(v, k, loc, p, out var n)) d.Social.EnemyExitOpinion = n; return true;
                case "argument_chance_per_pass": if (F(v, k, loc, p, out var o)) d.Social.ArgumentChancePerPass = o; return true;
                case "bond_chance_per_pass": if (F(v, k, loc, p, out var q)) d.Social.BondChancePerPass = q; return true;
                case "argument_mood_threshold": if (F(v, k, loc, p, out var r)) d.Social.ArgumentMoodThreshold = r; return true;
                case "argument_opinion_ceiling": if (F(v, k, loc, p, out var s)) d.Social.ArgumentOpinionCeiling = s; return true;
                case "bond_opinion_floor": if (F(v, k, loc, p, out var t)) d.Social.BondOpinionFloor = t; return true;
                case "argument_opinion_delta": if (F(v, k, loc, p, out var u)) d.Social.ArgumentOpinionDelta = u; return true;
                case "bond_opinion_delta": if (F(v, k, loc, p, out var w)) d.Social.BondOpinionDelta = w; return true;
                default: return false;
            }
        }

        private static bool NavKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "initial_delta_v_mps": if (F(v, k, loc, p, out var a)) d.Nav.InitialDeltaVMps = a; return true;
                case "burn_cost_mps": if (F(v, k, loc, p, out var b)) d.Nav.BurnCostMps = b; return true;
                case "transit_speed_mm_per_s": if (F(v, k, loc, p, out var c)) d.Nav.TransitSpeedMmPerS = c; return true;
                case "telescope_snr_threshold": if (F(v, k, loc, p, out var e)) d.Nav.TelescopeSnrThreshold = e; return true;
                case "telescope_reference_range_mm": if (F(v, k, loc, p, out var f)) d.Nav.TelescopeReferenceRangeMm = f; return true;
                default: return false;
            }
        }

        private static bool BuildKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "wall_material": if (I(v, k, loc, p, out var a)) d.Build.WallMaterial = a; return true;
                case "wall_construct_ticks": if (I(v, k, loc, p, out var b)) d.Build.WallConstructTicks = b; return true;
                case "door_material": if (I(v, k, loc, p, out var c)) d.Build.DoorMaterial = c; return true;
                case "door_construct_ticks": if (I(v, k, loc, p, out var e)) d.Build.DoorConstructTicks = e; return true;
                case "max_staged": if (I(v, k, loc, p, out var f)) d.Build.MaxStaged = f; return true;
                default: return false;
            }
        }

        private static bool DirectorKey(SimDefs d, string k, string v, string loc, List<string> p)
        {
            switch (k)
            {
                case "weight_morale_deficit": if (F(v, k, loc, p, out var a)) d.Director.WeightMoraleDeficit = a; return true;
                case "weight_water_deficit": if (F(v, k, loc, p, out var b)) d.Director.WeightWaterDeficit = b; return true;
                case "weight_food_deficit": if (F(v, k, loc, p, out var c)) d.Director.WeightFoodDeficit = c; return true;
                case "weight_power_deficit": if (F(v, k, loc, p, out var e)) d.Director.WeightPowerDeficit = e; return true;
                case "weight_alarm": if (F(v, k, loc, p, out var f)) d.Director.WeightAlarm = f; return true;
                case "weight_death": if (F(v, k, loc, p, out var g)) d.Director.WeightDeath = g; return true;
                case "alarm_decay_per_period": if (F(v, k, loc, p, out var h)) d.Director.AlarmDecayPerPeriod = h; return true;
                case "death_decay_per_period": if (F(v, k, loc, p, out var i)) d.Director.DeathDecayPerPeriod = i; return true;
                case "max_wear_pressure": if (F(v, k, loc, p, out var j)) d.Director.MaxWearPressure = j; return true;
                case "lever_target_tension": if (F(v, k, loc, p, out var l)) d.Director.LeverTargetTension = l; return true;
                case "lever_step": if (F(v, k, loc, p, out var m)) d.Director.LeverStep = m; return true;
                case "period_ticks": if (I(v, k, loc, p, out var n)) d.Director.PeriodTicks = n; return true;
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

        /// <summary>
        /// One <c>[production]</c> row — the conversion-graph node table (W0-5):
        /// <c>ID STATION WORK_S INPUTS OUTPUTS</c>, five whitespace-aligned columns.
        /// Port lists are <c>Kind:count</c> pairs joined by <c>+</c> with NO spaces (the
        /// row is whitespace-split), or the literal <c>none</c> for an empty side.
        ///
        /// Every column is an integer or an enum name. There is deliberately no float yield
        /// column (W0-5 review, B4): conversion loss is the integer input:output RATIO, which
        /// is exact where <c>floor(n·y)</c> is not, and which takes this whole table out of
        /// reach of ECONOMY-PLAN §4's trap 10 (InvariantCulture) — there is no decimal to
        /// mis-parse.
        ///
        /// Fail-soft like every other row: a malformed row is warned about and skipped, and
        /// the table keeps whatever rows already parsed. Validation is deliberately strict
        /// where a bad value would be UNSAFE rather than merely wrong:
        ///   • <c>work_s</c> in [1, <see cref="ProductionNode.MaxWorkSeconds"/>] — CraftingSystem
        ///     divides by it, and the derived tick count must not overflow int (N3);
        ///   • <c>count</c> in [1, <see cref="ProductionNode.MaxPortCount"/>] per port — unit
        ///     counts feed int accumulators and an unbounded count wraps them (N3b);
        ///   • at least one input port, and no same-kind gain — a node with no inputs, or one
        ///     that turns <c>Scrap:1</c> into <c>Scrap:5</c>, is a matter SOURCE, which
        ///     ECONOMY.md §2.1's closed-mass axiom forbids. Cross-kind ratios are NOT policed:
        ///     <c>Regolith:1 → Seals:2</c> is §4's own design and kinds are not comparable
        ///     without a mass model;
        ///   • <b>no ItemKind twice within one side</b> (B1) — the consumers check staging
        ///     per port against the AGGREGATE staged units of a kind, so a repeated kind lets
        ///     one stack satisfy two ports and the batch creates matter.
        /// </summary>
        private static void ApplyProductionRow(List<ProductionNode> nodes, string line, string loc, List<string> p)
        {
            string[] c = line.Split(Whitespace, StringSplitOptions.RemoveEmptyEntries);
            if (c.Length != 5)
            {
                p.Add(loc + ": [production] row needs 5 columns (id station work_s inputs outputs), got " + c.Length + " — skipped");
                return;
            }

            string id = c[0];
            if (!TryEnum<DeviceKind>(c[1], loc, p, out var station)) return;
            if (!int.TryParse(c[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out int work))
            {
                p.Add(loc + ": [production] row '" + id + "' work_s expects an integer, got '" + c[2] + "' — skipped");
                return;
            }
            if (work < 1 || work > ProductionNode.MaxWorkSeconds)
            {
                p.Add(loc + ": [production] row '" + id + "' work_s must be in [1, "
                      + ProductionNode.MaxWorkSeconds.ToString(CultureInfo.InvariantCulture) + "], got "
                      + work.ToString(CultureInfo.InvariantCulture) + " — skipped");
                return;
            }

            if (!TryPorts(c[3], "inputs", id, loc, p, out var inputs)) return;
            if (!TryPorts(c[4], "outputs", id, loc, p, out var outputs)) return;
            if (inputs.Length == 0)
            {
                p.Add(loc + ": [production] row '" + id + "' has no inputs — a node with no inputs is a matter source — skipped");
                return;
            }

            // SAME-KIND matter creation is statically detectable and unambiguous: Scrap:1 →
            // Scrap:5 mints four units of Scrap out of nothing, whatever else the row does.
            // CROSS-kind ratios are deliberately NOT policed — Regolith:1 → Seals:2 is
            // ECONOMY.md §4's own design, and units of different kinds are not comparable
            // without a mass model the sim does not have.
            for (int o = 0; o < outputs.Length; o++)
            {
                for (int i = 0; i < inputs.Length; i++)
                {
                    if (inputs[i].Kind != outputs[o].Kind || outputs[o].Count <= inputs[i].Count) continue;
                    p.Add(loc + ": [production] row '" + id + "' turns " + inputs[i].Count.ToString(CultureInfo.InvariantCulture)
                          + " " + inputs[i].Kind + " into " + outputs[o].Count.ToString(CultureInfo.InvariantCulture)
                          + " " + outputs[o].Kind + " — a same-kind gain is unambiguous matter creation "
                          + "(ECONOMY.md §2.1) — skipped");
                    return;
                }
            }

            var node = new ProductionNode(id, station, work, inputs, outputs);
            int existing = -1;
            for (int i = 0; i < nodes.Count; i++)
                if (string.Equals(nodes[i].Id, id, StringComparison.Ordinal)) { existing = i; break; }
            if (existing >= 0) nodes[existing] = node; // overlay: replace in place, order preserved
            else nodes.Add(node);
            // Shadowed-node detection is NOT done here: an overlay row can retarget an existing
            // id onto a station that already has a node, which no per-row check sees. It runs
            // once over the ASSEMBLED table instead — see WarnOnShadowedNodes.
        }

        /// <summary>
        /// One scan over the finished table: every station carrying more than one node gets one
        /// problem line naming the node that RUNS and the ones it shadows.
        ///
        /// <see cref="ProductionDefs.TryGetBill"/> resolves ordinal 0 only, so a second node on
        /// a station parses and folds into the checksum but is dead until E-PROD's <c>PROD</c>
        /// chapter carries per-station bill state. Shipping the limitation is fine; shipping it
        /// silently is not (W0-5 review, B3).
        ///
        /// Deliberately a whole-table pass rather than a per-row one. The per-row form had a
        /// hole exactly where the overlay contract is most useful: <c>b</c> declared on
        /// SalvageRecycler and then re-declared on Fabricator (which already had a node) took
        /// the overlay branch, never reached the check, and installed a silent dead node. A
        /// single scan over the assembled list closes every route — first declaration, overlay,
        /// retarget, or rows split across files — and costs one pass instead of an O(n²)
        /// per-row check. The trade is the line number, which is why both node ids are named.
        /// </summary>
        private static void WarnOnShadowedNodes(ProductionDefs production, List<string> p)
        {
            var nodes = production.Nodes;
            for (int i = 0; i < nodes.Length; i++)
            {
                var station = nodes[i].Station;

                bool isFirstOnStation = true;                       // report once per station,
                for (int j = 0; j < i; j++)                          // at its running node
                    if (nodes[j].Station == station) { isFirstOnStation = false; break; }
                if (!isFirstOnStation) continue;

                int count = production.CountFor(station);
                if (count < 2) continue;

                var sb = new StringBuilder();
                sb.Append("[production]: ").Append(count.ToString(CultureInfo.InvariantCulture))
                  .Append(" nodes are declared on ").Append(station)
                  .Append(" — only '").Append(nodes[i].Id)
                  .Append("' (the first in table order) is ever run today; shadowed: ");
                bool first = true;
                for (int j = i + 1; j < nodes.Length; j++)
                {
                    if (nodes[j].Station != station) continue;
                    if (!first) sb.Append(", ");
                    sb.Append('\'').Append(nodes[j].Id).Append('\'');
                    first = false;
                }
                sb.Append(" — see MECHANICS.md §13.12");
                p.Add(sb.ToString());
            }
        }

        /// <summary>Parse a <c>Kind:count+Kind:count</c> port list (or <c>none</c>). Rejects
        /// empty segments (a trailing or leading <c>+</c>) and a kind repeated within the
        /// list.</summary>
        private static bool TryPorts(string text, string field, string id, string loc, List<string> p, out ProductionPort[] ports)
        {
            ports = Array.Empty<ProductionPort>();
            if (string.Equals(text, "none", StringComparison.OrdinalIgnoreCase)) return true;

            // NOT RemoveEmptyEntries: "Scrap:2+" and "+Scrap:2" are authoring errors, and
            // silently accepting them hides a half-written port list (N8).
            string[] parts = text.Split(PortSeparator);
            var result = new ProductionPort[parts.Length];
            for (int i = 0; i < parts.Length; i++)
            {
                if (parts[i].Length == 0)
                {
                    p.Add(loc + ": [production] row '" + id + "' " + field + " has an empty port (stray '+') — skipped");
                    return false;
                }
                int colon = parts[i].IndexOf(':');
                if (colon <= 0 || colon == parts[i].Length - 1)
                {
                    p.Add(loc + ": [production] row '" + id + "' " + field + " port '" + parts[i] + "' must be Kind:count — skipped");
                    return false;
                }
                if (!TryEnum<ItemKind>(parts[i].Substring(0, colon), loc, p, out var kind)) return false;

                string countText = parts[i].Substring(colon + 1);
                if (!int.TryParse(countText, NumberStyles.Integer, CultureInfo.InvariantCulture, out int count))
                {
                    p.Add(loc + ": [production] row '" + id + "' " + field + " port '" + parts[i]
                          + "' count expects an integer, got '" + countText + "' — skipped");
                    return false;
                }
                if (count < 1 || count > ProductionNode.MaxPortCount)
                {
                    p.Add(loc + ": [production] row '" + id + "' " + field + " port '" + parts[i]
                          + "' count must be in [1, " + ProductionNode.MaxPortCount.ToString(CultureInfo.InvariantCulture)
                          + "] — unit counts feed int accumulators and an unbounded count wraps them — skipped");
                    return false;
                }
                for (int j = 0; j < i; j++)
                {
                    if (result[j].Kind != kind) continue;
                    p.Add(loc + ": [production] row '" + id + "' names " + kind + " twice in " + field
                          + " — staging is counted per KIND, so a repeated kind would let one stack "
                          + "satisfy two ports and the batch would create matter — skipped");
                    return false;
                }
                result[i] = new ProductionPort(kind, count);
            }
            ports = result;
            return true;
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
