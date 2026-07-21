using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Perilune.Glyph;
using Perilune.Sim;

namespace Perilune.Tui
{
    /// <summary>
    /// The <c>--dump</c> command: boot the shipping ship, run it flat-out for a
    /// requested stretch, and emit text frames (via Sim.Glyph) at a cadence, closing
    /// with the StateHash footer. Every rendered frame goes through <see cref="RenderFrame"/>
    /// — the SAME helper the golden tests assert on, so CI output == test fixture.
    /// Pure with respect to the sim: rendering never mutates it (GlyphMapper is a pure
    /// projection), so the footer hash equals a twin run's.
    /// </summary>
    public static class DumpMode
    {
        public sealed class Options
        {
            public ulong? Seed;            // null ⇒ authored default (Unity's seed)
            public long? Ticks;            // explicit tick count
            public int? Days;              // days ⇒ Days * TicksPerDay ticks (wins over Ticks)
            public long Every;             // frame cadence in ticks (0 ⇒ boot + final only)
            public int Deck = -1;          // -1 ⇒ all decks; else the single z to render
            public Lens Lens = Lens.None;
            public (int X, int Y)? Cursor; // applied on each rendered deck
            public bool Colors;            // annotated (glyph+fg+bg+attr planes) instead of glyphs
            public bool Metrics;           // append a ShipMetrics block per emit
            public string OutFile;         // write to a file instead of the console
            public string LayoutPath;      // override layout discovery
            public string DataDir;         // override SimDefs (tuning) discovery
        }

        /// <summary>Run a dump to <paramref name="output"/>. Returns a process exit code
        /// (always 0 today — the dump is a report, not a determinism gate).</summary>
        public static int Run(Options opt, TextWriter output)
        {
            ulong seed = opt.Seed ?? SimHost.DefaultSeed;
            var host = SimHost.Build(seed, opt.LayoutPath, opt.DataDir);
            var sim = host.Sim;

            long totalTicks = opt.Days.HasValue
                ? (long)opt.Days.Value * SimClockUtil.TicksPerDay
                : (opt.Ticks ?? 0L);
            if (totalTicks < 0) totalTicks = 0;

            WriteHeader(output, host, opt, totalTicks);

            var decks = ResolveDecks(host, opt.Deck);

            EmitIfDue(output, host, opt, decks, 0, totalTicks);
            for (long t = 1; t <= totalTicks; t++)
            {
                sim.Tick();
                EmitIfDue(output, host, opt, decks, t, totalTicks);
            }

            output.Write("hash: ");
            output.WriteLine(sim.StateHash().ToString("x16", CultureInfo.InvariantCulture));
            return 0;
        }

        // ------------------------------------------------------------- shared render

        /// <summary>THE shared render step — DumpMode and the golden tests both call this,
        /// so a golden file is exactly what the CLI prints. Sizes a buffer to the world,
        /// projects one deck, and serialises it (glyphs, or the 4-plane annotated form
        /// when <paramref name="annotated"/>).</summary>
        public static string RenderFrame(Simulation sim, int z, Lens lens, Int3? cursor, bool annotated)
        {
            var buffer = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, z, lens, cursor, buffer);
            return annotated ? GlyphFrame.ToAnnotatedText(buffer) : GlyphFrame.ToText(buffer);
        }

        /// <summary>Fixed-width, InvariantCulture metrics block matching ShipMetrics.Compute —
        /// the same numbers the in-game sidebar shows.</summary>
        public static string FormatMetrics(ShipMetricsSnapshot m)
        {
            var sb = new StringBuilder();
            var ic = CultureInfo.InvariantCulture;
            sb.Append("metrics:");
            sb.Append("  power=").Append(m.Power.ToString("0.00", ic));
            sb.Append("  o2=").Append(m.Oxygen.ToString("0.00", ic));
            sb.Append("  co2ppm=").Append(m.Co2Ppm.ToString("0", ic).PadLeft(6));
            sb.Append("  water=").Append(m.Water.ToString("0.00", ic));
            sb.Append("  food=").Append(m.Food.ToString("0.00", ic));
            sb.Append("  heat=").Append(m.Heat.ToString("0.00", ic));
            sb.Append("  struct=").Append(m.Structural.ToString("0.00", ic));
            sb.Append("  morale=").Append(m.Morale.ToString("0.00", ic));
            return sb.ToString();
        }

        // ------------------------------------------------------------------ internals

        private static int[] ResolveDecks(SimHost host, int deck)
        {
            if (deck < 0)
            {
                var all = new int[host.Depth];
                for (int z = 0; z < host.Depth; z++) all[z] = z;
                return all;
            }
            if (deck >= host.Depth)
                return new int[0];
            return new[] { deck };
        }

        private static bool IsDue(long t, long every, long totalTicks) =>
            t == 0 || t == totalTicks || (every > 0 && t % every == 0);

        private static void EmitIfDue(TextWriter output, SimHost host, Options opt, int[] decks, long t, long totalTicks)
        {
            if (!IsDue(t, opt.Every, totalTicks)) return;

            var sim = host.Sim;
            double dayFraction = t / (double)SimClockUtil.TicksPerDay;
            var ic = CultureInfo.InvariantCulture;

            foreach (int z in decks)
            {
                Int3? cursor = opt.Cursor.HasValue ? new Int3(opt.Cursor.Value.X, opt.Cursor.Value.Y, z) : (Int3?)null;
                output.WriteLine();
                output.WriteLine($"--- day {dayFraction.ToString("0.000", ic)}  tick {t.ToString(ic)}  " +
                                 $"deck {z}  lens {opt.Lens.ToString().ToLowerInvariant()} ---");
                output.WriteLine(RenderFrame(sim, z, opt.Lens, cursor, opt.Colors));
            }

            if (opt.Metrics)
            {
                output.WriteLine();
                output.WriteLine(FormatMetrics(ShipMetrics.Compute(sim)));
            }
        }

        private static void WriteHeader(TextWriter output, SimHost host, Options opt, long totalTicks)
        {
            var ic = CultureInfo.InvariantCulture;
            output.WriteLine("# PeriluneTui --dump");
            output.WriteLine($"# seed:    {host.Seed.ToString(ic)}");
            output.WriteLine($"# layout:  {host.LayoutPath ?? "(none)"}");
            output.WriteLine($"# layout-checksum: {host.LayoutChecksum}  problems: {host.LayoutProblemCount.ToString(ic)}");
            for (int i = 0; i < host.LayoutProblems.Count; i++)
                output.WriteLine($"#   ! {host.LayoutProblems[i]}");
            output.WriteLine($"# defs:    {host.DefsChecksum.ToString("x16", ic)} " +
                             $"({host.DefsFileCount.ToString(ic)} files, {host.DefsProblems.Count.ToString(ic)} problems)");
            for (int i = 0; i < host.DefsProblems.Count; i++)
                output.WriteLine($"#   ! {host.DefsProblems[i]}");
            output.WriteLine($"# ship:    {host.Width.ToString(ic)}x{host.Height.ToString(ic)}x{host.Depth.ToString(ic)}");
            output.WriteLine($"# ticks:   {totalTicks.ToString(ic)}  every: {opt.Every.ToString(ic)}");
        }

        // -------------------------------------------------------------- arg parsing

        /// <summary>Parse the CLI args into <see cref="Options"/>. Unknown flags and bad
        /// values are reported to <paramref name="err"/>; parsing continues so a typo
        /// never brings the dump down. Returns false only if the caller should abort.</summary>
        public static bool TryParse(string[] args, int start, Options opt, TextWriter err)
        {
            for (int i = start; i < args.Length; i++)
            {
                string a = args[i];
                switch (a)
                {
                    case "--seed": opt.Seed = ParseULong(Next(args, ref i), err, "--seed"); break;
                    case "--ticks": opt.Ticks = ParseLong(Next(args, ref i), err, "--ticks"); break;
                    case "--days": opt.Days = (int?)ParseLong(Next(args, ref i), err, "--days"); break;
                    case "--every": opt.Every = ParseLong(Next(args, ref i), err, "--every") ?? 0L; break;
                    case "--deck": opt.Deck = ParseDeck(Next(args, ref i), err); break;
                    case "--lens": opt.Lens = ParseLens(Next(args, ref i), err); break;
                    case "--cursor": opt.Cursor = ParseCursor(Next(args, ref i), err); break;
                    case "--colors": opt.Colors = true; break;
                    case "--metrics": opt.Metrics = true; break;
                    case "--out": opt.OutFile = Next(args, ref i); break;
                    case "--layout": opt.LayoutPath = Next(args, ref i); break;
                    case "--data": opt.DataDir = Next(args, ref i); break;
                    case "--dump": break; // mode selector, handled by Program
                    case "--play": break; // interactive selector, handled by Program
                    default:
                        err.WriteLine($"warning: ignoring unknown argument '{a}'");
                        break;
                }
            }
            return true;
        }

        private static string Next(string[] args, ref int i) => i + 1 < args.Length ? args[++i] : null;

        private static ulong? ParseULong(string s, TextWriter err, string flag)
        {
            if (s != null && ulong.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v)) return v;
            err.WriteLine($"warning: bad value for {flag}: '{s}'");
            return null;
        }

        private static long? ParseLong(string s, TextWriter err, string flag)
        {
            if (s != null && long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v)) return v;
            err.WriteLine($"warning: bad value for {flag}: '{s}'");
            return null;
        }

        private static int ParseDeck(string s, TextWriter err)
        {
            if (s == "all" || s == null) return -1;
            if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v)) return v;
            err.WriteLine($"warning: bad --deck '{s}' (expected 0|1|all)");
            return -1;
        }

        private static Lens ParseLens(string s, TextWriter err)
        {
            switch (s)
            {
                case null:
                case "none": return Lens.None;
                case "pressure": return Lens.Pressure;
                case "oxygen": return Lens.Oxygen;
                case "co2": return Lens.Co2;
                case "temperature": return Lens.Temperature;
                case "power": return Lens.Power;
                case "water": return Lens.Water;
                default:
                    err.WriteLine($"warning: unknown --lens '{s}', using none");
                    return Lens.None;
            }
        }

        private static (int, int)? ParseCursor(string s, TextWriter err)
        {
            if (s != null)
            {
                var parts = s.Split(',');
                if (parts.Length == 2 &&
                    int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out int x) &&
                    int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out int y))
                    return (x, y);
            }
            err.WriteLine($"warning: bad --cursor '{s}' (expected x,y)");
            return null;
        }
    }
}
