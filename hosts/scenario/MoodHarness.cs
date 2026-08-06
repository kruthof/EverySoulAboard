using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Perilune.Sim;

namespace Perilune.Tools
{
    /// <summary>
    /// ⭐⭐ M4-9 — THE POST-M3-9 MOOD ENVELOPE, MEASURED.
    ///
    /// <para><b>WHY IT EXISTS.</b> `docs/design/perilune-m4.packages.md` §5's MUST RE-MEASURE box
    /// makes this the break package's FIRST deliverable and forbids tuning a threshold before it:
    /// every published Perilune mood number is PRE-M3-9 (`MECHANICS.md` §13.4 says so about itself),
    /// and M3-9 gave <see cref="Citizen.Fatigue"/> a reducer, which moves the one term that used to
    /// saturate. A break threshold set from a stale envelope is D-3 (`argument_mood_threshold = 0`
    /// against a permanently-negative mood) being re-committed on purpose.</para>
    ///
    /// <para><b>THE FOUR REQUIRED OUTPUTS</b> (the charter's own table, in its own order):
    /// <list type="number">
    ///   <item><b>day-means</b> — whether the ship's mood sits where a ladder can reach it;</item>
    ///   <item><b>per-citizen min/max</b> — the tier thresholds' band;</item>
    ///   <item><b>the sawtooth's AMPLITUDE</b> — whether a threshold inside the swing is crossed
    ///     every meal, i.e. whether a HARD RESET of a dwell counter can ever accumulate;</item>
    ///   <item><b>the sawtooth's PERIOD</b> — how it compares to <c>dwell_ticks[T]</c>. If the
    ///     period is shorter than the dwell, design question (h) option 1 cannot fire at all.</item>
    /// </list>
    /// A fifth table is printed because outputs 3 and 4 are only half the decision: the
    /// <b>DWELL SWEEP</b> reports, for a ladder of candidate thresholds, how much of the run each
    /// crew member spends below it, how often she crosses it, and the LONGEST CONTIGUOUS run below.
    /// That last column is what a <c>dwell_ticks</c> literal has to be shorter than for the tier to
    /// be reachable at all.</para>
    ///
    /// <para><b>PURE, AND OUTSIDE THE PINNED PATH.</b> It ticks a sim and reads it: no designation,
    /// no command, no def touched, no file written, no RNG drawn. It is reached only through its own
    /// verb, so <c>ci.sh</c>'s pinned verb-less <c>--days 3 --seed 42</c> run is byte-identical with
    /// this file present or absent. <c>LedgerHarness</c>'s own header states the same contract and is
    /// the precedent this file is written against.</para>
    ///
    /// <para>⚠️ <b>WHAT THE NUMBERS DESCRIBE, said out loud so nobody over-reads them.</b> Under
    /// <b>OD-H</b> every work type boots OFF, so an unattended run measures a crew that eats, drinks,
    /// sleeps and does no work. That is the SHIPPED BOOT STATE and a legitimate thing to measure —
    /// it is the state the mood formula's inputs are actually in for a player who has not yet given
    /// an order — but it is not a working ship, and a later lane must not read this table as
    /// covering one.</para>
    /// </summary>
    public static class MoodHarness
    {
        private static readonly CultureInfo Ic = CultureInfo.InvariantCulture;

        /// <summary>Sampling cadence. 10 ticks = 1 s, which is exactly
        /// <see cref="NeedsSystem"/>'s own pass rate: mood cannot change between two of these
        /// samples, so this is a LOSSLESS record of the signal rather than a sub-sample of it.</summary>
        public const int SampleTicks = 10;

        /// <summary>A rise larger than this between two adjacent samples is a RESET EVENT (a meal,
        /// a drink, or a sleep episode's fatigue drain), not the ordinary ramp. The ramp's own
        /// per-second rise is zero — every need term only ever grows between resets — so any
        /// positive step at all is a reset; the epsilon exists only to keep float noise out.</summary>
        private const float RiseEpsilon = 0.01f;

        /// <summary>One crew member's sampled trace. Arrays are pre-sized from the run length: the
        /// harness allocates once, outside the tick loop.</summary>
        public sealed class Trace
        {
            public uint Id;
            public string Name = "";
            public readonly List<float> Mood = new List<float>();
            public readonly List<float> Hunger = new List<float>();
            public readonly List<float> Thirst = new List<float>();
            public readonly List<float> Fatigue = new List<float>();
            public readonly List<float> Suffocation = new List<float>();
            public readonly List<byte> Job = new List<byte>();
            /// <summary>⭐ M4-9 — the break ladder's own state, sampled beside the mood that drives
            /// it. This is what turns the envelope table from "where does mood sit" into "does the
            /// SHIPPED ship ever reach the first rung", which is the question a threshold whose
            /// default was chosen from this envelope has to answer about itself.</summary>
            public readonly List<byte> Tier = new List<byte>();
            public readonly List<uint> Dwell = new List<uint>();
            /// <summary>Sample index of the first sample of this trace (crew who thaw mid-run start
            /// late; without this every later table would be off by the thaw).</summary>
            public int FirstSample;
        }

        /// <summary>One reset event on one crew member's trace.</summary>
        public readonly struct Reset
        {
            public readonly int Sample;      // sample index the rise ENDED on
            public readonly float Jump;      // total mood recovered by this event
            public readonly bool Hunger, Thirst, Fatigue;
            public Reset(int sample, float jump, bool hunger, bool thirst, bool fatigue)
            {
                Sample = sample; Jump = jump; Hunger = hunger; Thirst = thirst; Fatigue = fatigue;
            }
        }

        /// <summary>Sample every living crew member. Call once per <see cref="SampleTicks"/> ticks.</summary>
        public static void Sample(Simulation sim, Dictionary<uint, Trace> traces, int sampleIndex)
        {
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;
                if (!traces.TryGetValue(c.Id, out var t))
                {
                    t = new Trace { Id = c.Id, Name = c.Name, FirstSample = sampleIndex };
                    traces[c.Id] = t;
                }
                t.Mood.Add(c.Mood);
                t.Hunger.Add(c.Hunger);
                t.Thirst.Add(c.Thirst);
                t.Fatigue.Add(c.Fatigue);
                t.Suffocation.Add(c.Suffocation);
                t.Job.Add((byte)c.JobKind);
                t.Tier.Add((byte)c.BreakTier);
                t.Dwell.Add(c.BreakDwell);
            }
        }

        /// <summary>
        /// The mood formula's own extremes, derived from the defs rather than pasted as −135/+20.
        /// <see cref="NeedsSystem"/>: <c>Mood = base − hunger·Wh − thirst·Wt − fatigue·Wf −
        /// suffocation·Ws</c>, every need clamped to 0..1 ⇒ the ceiling is the base (every need at 0)
        /// and the floor is base minus the four weights (every need saturated).
        /// ⛔ Deriving it is not decoration: the four weights are DEF FIELDS, so a hard-coded −135
        /// would silently stop describing the game the first time one moved.
        /// </summary>
        public static void MoodSpan(SimDefs defs, out float floor, out float ceil)
        {
            var n = defs.Needs;
            ceil = n.MoodBase;
            floor = n.MoodBase - n.MoodHungerWeight - n.MoodThirstWeight
                    - n.MoodFatigueWeight - n.MoodSuffocationWeight;
        }

        /// <summary>Reset events on one trace, adjacent rising samples merged into one event (an eat
        /// followed by a drink two seconds later is ONE recovery as far as a sawtooth is concerned,
        /// and counting it as two would halve the measured period).</summary>
        public static List<Reset> Resets(Trace t)
        {
            var events = new List<Reset>();
            int i = 1;
            while (i < t.Mood.Count)
            {
                if (t.Mood[i] - t.Mood[i - 1] <= RiseEpsilon) { i++; continue; }
                int start = i - 1;
                while (i < t.Mood.Count && t.Mood[i] - t.Mood[i - 1] > RiseEpsilon) i++;
                int end = i - 1;
                events.Add(new Reset(
                    end,
                    t.Mood[end] - t.Mood[start],
                    t.Hunger[end] < t.Hunger[start] - 1e-4f,
                    t.Thirst[end] < t.Thirst[start] - 1e-4f,
                    t.Fatigue[end] < t.Fatigue[start] - 1e-4f));
            }
            return events;
        }

        // ------------------------------------------------------------------ report

        public static string Report(IReadOnlyList<Trace> traces, SimDefs defs, int days, int samplesPerDay)
        {
            var sb = new StringBuilder();
            MoodSpan(defs, out float floor, out float ceil);
            float span = ceil - floor;
            var n = defs.Needs;

            sb.AppendLine("THE MOOD FORMULA, from the defs this run loaded (NeedsSystem.cs:200-204)");
            sb.AppendLine($"  Mood = {F(n.MoodBase)} − hunger·{F(n.MoodHungerWeight)} − thirst·{F(n.MoodThirstWeight)} " +
                          $"− fatigue·{F(n.MoodFatigueWeight)} − suffocation·{F(n.MoodSuffocationWeight)}");
            sb.AppendLine($"  ⇒ ceiling {F(ceil)} (every need 0) · floor {F(floor)} (every need 1) · SPAN {F(span)}");
            sb.AppendLine($"  fatigue_rest_threshold {F(n.FatigueRestThreshold)}   " +
                          $"(RestSystem's trigger — the one reducer M3-9 added)");
            sb.AppendLine();

            // ---- 1. day-means, and 2. the envelope
            sb.AppendLine("1+2. DAY-MEANS and the ENVELOPE (per crew member; mood units)");
            sb.Append("  crew                 ");
            for (int d = 1; d <= days; d++) sb.Append($"  day{d} mean");
            sb.AppendLine("     run mean       min       max     swing");
            for (int c = 0; c < traces.Count; c++)
            {
                var t = traces[c];
                sb.Append($"  {Trim(t.Name, 18),-18}   ");
                for (int d = 0; d < days; d++)
                {
                    int lo = d * samplesPerDay - t.FirstSample, hi = (d + 1) * samplesPerDay - t.FirstSample;
                    sb.Append(Mean(t.Mood, lo, hi, out bool any) is var m && any
                        ? $"{F(m),10}" : $"{"—",10}");
                }
                float mean = Mean(t.Mood, 0, t.Mood.Count, out _);
                MinMax(t.Mood, out float mn, out float mx);
                sb.AppendLine($"{F(mean),13}{F(mn),10}{F(mx),10}{F(mx - mn),10}");
            }
            sb.AppendLine();
            sb.AppendLine("  crew-mean at the day marks (the §13.4 row's own shape):");
            for (int d = 0; d < days; d++)
            {
                double sum = 0; int k = 0;
                for (int c = 0; c < traces.Count; c++)
                {
                    var t = traces[c];
                    int idx = (d + 1) * samplesPerDay - 1 - t.FirstSample;
                    if (idx >= 0 && idx < t.Mood.Count) { sum += t.Mood[idx]; k++; }
                }
                sb.AppendLine($"    end of day {d + 1}: {(k > 0 ? F((float)(sum / k)) : "—")}  (over {k} living crew)");
            }
            sb.AppendLine();

            // ---- component decomposition at the day marks
            sb.AppendLine("  what the mood is MADE OF at each day mark (need values 0..1, and the mood points each costs)");
            for (int c = 0; c < traces.Count; c++)
            {
                var t = traces[c];
                for (int d = 0; d < days; d++)
                {
                    int idx = (d + 1) * samplesPerDay - 1 - t.FirstSample;
                    if (idx < 0 || idx >= t.Mood.Count) continue;
                    sb.AppendLine($"    {Trim(t.Name, 18),-18} d{d + 1}  " +
                        $"hunger {t.Hunger[idx],5:0.000} (−{t.Hunger[idx] * n.MoodHungerWeight,5:0.0})  " +
                        $"thirst {t.Thirst[idx],5:0.000} (−{t.Thirst[idx] * n.MoodThirstWeight,5:0.0})  " +
                        $"fatigue {t.Fatigue[idx],5:0.000} (−{t.Fatigue[idx] * n.MoodFatigueWeight,5:0.0})  " +
                        $"suffoc {t.Suffocation[idx],5:0.000} (−{t.Suffocation[idx] * n.MoodSuffocationWeight,5:0.0})  " +
                        $"= {F(t.Mood[idx])}");
                }
            }
            sb.AppendLine();

            // ---- 3+4. the sawtooth
            sb.AppendLine("3+4. THE SAWTOOTH — amplitude (mood points recovered per reset) and PERIOD (ticks between resets)");
            sb.AppendLine("     ⚠️ THE NUMBER (h) TURNS ON: if the PERIOD is shorter than dwell_ticks[T], a HARD-RESET");
            sb.AppendLine("        counter can never reach the dwell and the tier NEVER FIRES.");
            sb.AppendLine("  crew                 resets   amp mean    amp med    amp min    amp max   per mean    per med    per min    per max");
            for (int c = 0; c < traces.Count; c++)
            {
                var t = traces[c];
                var ev = Resets(t);
                if (ev.Count == 0)
                {
                    sb.AppendLine($"  {Trim(t.Name, 18),-18}        0          —          —          —          —          —          —          —          —");
                    continue;
                }
                var amps = new List<float>();
                var pers = new List<float>();
                for (int i = 0; i < ev.Count; i++)
                {
                    amps.Add(ev[i].Jump);
                    if (i > 0) pers.Add((ev[i].Sample - ev[i - 1].Sample) * (float)SampleTicks);
                }
                sb.Append($"  {Trim(t.Name, 18),-18}{ev.Count,9}");
                sb.Append($"{F(Mean(amps)),11}{F(Median(amps)),11}{F(Min(amps)),11}{F(Max(amps)),11}");
                if (pers.Count == 0) sb.AppendLine($"{"—",11}{"—",11}{"—",11}{"—",11}");
                else sb.AppendLine($"{Ticks(Mean(pers)),11}{Ticks(Median(pers)),11}{Ticks(Min(pers)),11}{Ticks(Max(pers)),11}");
            }
            sb.AppendLine("  (periods printed in TICKS. 864 000 ticks = 1 sim-day; 36 000 = 1 sim-hour.)");
            sb.AppendLine();
            sb.AppendLine("  what CAUSED each reset (one event can have more than one cause — an eat and a drink in the same second):");
            for (int c = 0; c < traces.Count; c++)
            {
                var t = traces[c];
                var ev = Resets(t);
                int h = 0, th = 0, f = 0;
                for (int i = 0; i < ev.Count; i++) { if (ev[i].Hunger) h++; if (ev[i].Thirst) th++; if (ev[i].Fatigue) f++; }
                sb.AppendLine($"    {Trim(t.Name, 18),-18} hunger-drop {h,4}   thirst-drop {th,4}   fatigue-drop {f,4}");
            }
            sb.AppendLine();

            // ---- 4b. SLEEP IS NOT A TOOTH — measured, because the shape of the third term decides (h)
            sb.AppendLine("4b. SLEEP IS A PLATEAU, NOT A TOOTH — the mood SLOPE while asleep against the slope while awake");
            sb.AppendLine("    (a step reset shows up in the table above; a slow ramp cannot, and the fatigue term is a RAMP.)");
            sb.AppendLine("  crew                asleep%   episodes   mean episode (ticks)   slope awake (mood/1000 ticks)   slope asleep");
            for (int c = 0; c < traces.Count; c++)
            {
                var t = traces[c];
                int asleep = 0, episodes = 0; bool prev = false;
                double awakeD = 0, asleepD = 0; int awakeN = 0, asleepN = 0;
                for (int i = 0; i < t.Job.Count; i++)
                {
                    bool s = t.Job[i] == (byte)JobKind.Sleep;
                    if (s) { asleep++; if (!prev) episodes++; }
                    if (i > 0)
                    {
                        // Attribute the step to the state it was taken IN (both endpoints agree),
                        // so a wake-up transition is counted in neither and cannot fake a slope.
                        bool sPrev = t.Job[i - 1] == (byte)JobKind.Sleep;
                        if (s && sPrev) { asleepD += t.Mood[i] - t.Mood[i - 1]; asleepN++; }
                        else if (!s && !sPrev) { awakeD += t.Mood[i] - t.Mood[i - 1]; awakeN++; }
                    }
                    prev = s;
                }
                double aw = awakeN == 0 ? 0 : awakeD / awakeN * (1000.0 / SampleTicks);
                double sl = asleepN == 0 ? 0 : asleepD / asleepN * (1000.0 / SampleTicks);
                sb.AppendLine($"  {Trim(t.Name, 18),-18}{asleep * 100.0 / Math.Max(1, t.Job.Count),8:0.0}{episodes,11}" +
                              $"{(episodes == 0 ? 0 : (long)asleep * SampleTicks / episodes),23:N0}" +
                              $"{aw,31:0.0000}{sl,15:0.0000}");
            }
            sb.AppendLine();

            // ---- 5. the dwell sweep
            sb.AppendLine("5. THE DWELL SWEEP — for each candidate MINOR threshold, can a dwell counter ever reach a dwell?");
            sb.AppendLine("   pct is the RimWorld-shaped tunable carried across: a fraction of the mood SPAN above the FLOOR");
            sb.AppendLine("   (RW§4.2's minor threshold is 35 % of a 0..100 bar; the DERIVATION carries, the units do not).");
            sb.AppendLine();
            int[] pcts = { 1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50 };
            sb.AppendLine("  (a) THE RIMWORLD-SHAPED LADDER — pct of the FULL span above the FLOOR, crew-wide");
            sb.AppendLine("     pct    mood     crew below at all   worst below%   longest-below (ticks)      (sim-h)");
            for (int p = 0; p < pcts.Length; p++)
            {
                float thr = floor + span * (pcts[p] / 100f);
                int who = 0; double worst = 0; int longestAll = 0;
                for (int c = 0; c < traces.Count; c++)
                {
                    Dwell(traces[c], thr, out double bf, out _, out int lg, out _);
                    if (bf > 0) who++;
                    if (bf > worst) worst = bf;
                    if (lg > longestAll) longestAll = lg;
                }
                sb.AppendLine($"    {pcts[p],4}{F(thr),9}{who,21}{worst * 100,15:0.00}" +
                              $"{(longestAll * SampleTicks),24:N0}{longestAll * SampleTicks / 36000.0,13:0.00}");
            }
            sb.AppendLine();

            // ---- 5c. what the SHIPPED ladder actually did on this run
            // ⚠️ THE LADDER'S FLOOR IS NOT THIS FILE'S. `floor`/`span` above are the FULL mood range
            // (−135 / 155, suffocation included) because that is what the envelope tables are about;
            // MentalBreak's own span excludes suffocation and is −75 / 95. Printing the wrong one
            // here would put the threshold column 34 points below the line the sim actually uses.
            float ladderFloor = MentalBreak.DeprivationFloor(defs);
            float ladderSpan = MentalBreak.MoodSpan(defs);
            sb.AppendLine("  (c) ⭐ THE SHIPPED LADDER, DRIVEN — did anybody actually break on this run?");
            sb.AppendLine("      ⛔ This is the row that says whether the threshold's default is VACUOUS. A ladder that");
            sb.AppendLine("         never fires and one that fires constantly both look like a shipped mechanism.");
            sb.AppendLine("  crew                 minor thr   peak dwell / needed      breaks (tick:tier)");
            for (int c = 0; c < traces.Count; c++)
            {
                var t = traces[c];
                uint peak = 0;
                for (int i = 0; i < t.Dwell.Count; i++) if (t.Dwell[i] > peak) peak = t.Dwell[i];
                var fires = new StringBuilder();
                for (int i = 1; i < t.Tier.Count; i++)
                    if (t.Tier[i] != 0 && t.Tier[i - 1] == 0)
                        fires.Append(fires.Length > 0 ? ", " : "")
                             .Append(((long)(i + t.FirstSample) * SampleTicks).ToString("N0", Ic))
                             .Append(':').Append((BreakTier)t.Tier[i]);
                sb.AppendLine($"  {Trim(t.Name, 18),-18}{ladderFloor + ladderSpan * 0.43f,11:0.00}" +
                              $"{peak,14:N0} / {(uint)(216_000 * 4),0:N0}   " +
                              (fires.Length > 0 ? fires.ToString() : "none"));
            }
            sb.AppendLine("  (the minor threshold column is the SHIPPED 43 % default; a crew member's own byte may differ.)");
            sb.AppendLine();

            sb.AppendLine("  (b) AN ABSOLUTE LADDER ACROSS THE OBSERVED ENVELOPE — the same three questions, per crew member.");
            sb.AppendLine("      ⭐ This table, not (a), is what a dwell_ticks literal has to be read against: the LONGEST");
            sb.AppendLine("         contiguous run below a threshold is the ceiling on any dwell that can ever complete.");
            float[] abs = { 0f, -5f, -10f, -15f, -20f, -25f, -30f, -35f, -40f, -45f, -50f, -55f, -60f, -65f, -70f };
            for (int c = 0; c < traces.Count; c++)
            {
                var t = traces[c];
                sb.AppendLine($"  {t.Name}");
                sb.AppendLine("    mood     pct-of-span      below%   crossings   longest-below (ticks)      (sim-h)   median-below (ticks)");
                for (int a = 0; a < abs.Length; a++)
                {
                    Dwell(t, abs[a], out double belowFrac, out int crossings, out int longest, out int median);
                    sb.AppendLine($"  {F(abs[a]),6}{(abs[a] - floor) / span * 100,16:0.0}{belowFrac * 100,12:0.00}{crossings,12}" +
                                  $"{(longest * SampleTicks),24:N0}{longest * SampleTicks / 36000.0,13:0.00}" +
                                  $"{(median * SampleTicks),23:N0}");
                }
                sb.AppendLine();
            }
            return sb.ToString();
        }

        /// <summary>Time below <paramref name="threshold"/>, downward crossings, and the longest and
        /// median contiguous run below it — in SAMPLES (the caller scales to ticks).</summary>
        public static void Dwell(Trace t, float threshold, out double belowFrac, out int crossings,
                                 out int longest, out int median)
        {
            int below = 0; crossings = 0; longest = 0;
            var runs = new List<int>();
            int run = 0;
            bool prevBelow = false;
            for (int i = 0; i < t.Mood.Count; i++)
            {
                bool b = t.Mood[i] < threshold;
                if (b)
                {
                    below++; run++;
                    if (!prevBelow) crossings++;
                }
                else if (run > 0) { runs.Add(run); if (run > longest) longest = run; run = 0; }
                prevBelow = b;
            }
            if (run > 0) { runs.Add(run); if (run > longest) longest = run; }
            belowFrac = t.Mood.Count == 0 ? 0 : below / (double)t.Mood.Count;
            median = runs.Count == 0 ? 0 : MedianInt(runs);
        }

        // ------------------------------------------------------------------ small helpers

        private static string F(float v) => v.ToString("0.00", Ic);
        private static string Ticks(float v) => ((long)Math.Round(v)).ToString("N0", Ic);

        private static string Trim(string s, int n) => s.Length <= n ? s : s.Substring(0, n);

        private static float Mean(List<float> xs, int lo, int hi, out bool any)
        {
            if (lo < 0) lo = 0;
            if (hi > xs.Count) hi = xs.Count;
            any = hi > lo;
            if (!any) return 0;
            double s = 0;
            for (int i = lo; i < hi; i++) s += xs[i];
            return (float)(s / (hi - lo));
        }

        private static float Mean(List<float> xs)
        {
            if (xs.Count == 0) return 0;
            double s = 0;
            for (int i = 0; i < xs.Count; i++) s += xs[i];
            return (float)(s / xs.Count);
        }

        private static float Median(List<float> xs)
        {
            if (xs.Count == 0) return 0;
            var copy = new List<float>(xs);
            copy.Sort();
            return copy[copy.Count / 2];
        }

        private static int MedianInt(List<int> xs)
        {
            var copy = new List<int>(xs);
            copy.Sort();
            return copy[copy.Count / 2];
        }

        private static float Min(List<float> xs)
        {
            float m = float.MaxValue;
            for (int i = 0; i < xs.Count; i++) if (xs[i] < m) m = xs[i];
            return xs.Count == 0 ? 0 : m;
        }

        private static float Max(List<float> xs)
        {
            float m = float.MinValue;
            for (int i = 0; i < xs.Count; i++) if (xs[i] > m) m = xs[i];
            return xs.Count == 0 ? 0 : m;
        }

        private static void MinMax(List<float> xs, out float mn, out float mx)
        {
            mn = float.MaxValue; mx = float.MinValue;
            for (int i = 0; i < xs.Count; i++) { if (xs[i] < mn) mn = xs[i]; if (xs[i] > mx) mx = xs[i]; }
            if (xs.Count == 0) { mn = 0; mx = 0; }
        }
    }
}
