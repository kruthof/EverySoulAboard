using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Perilune.Sim;

namespace Perilune.Tools
{
    /// <summary>
    /// ⭐⭐ <b>M2-17 — THE WORK GRID THE OCCUPANCY HARNESS AUTHORS, AND THE READ-BACK THAT PROVES IT
    /// LANDED.</b>
    ///
    /// <para><b>WHY THIS FILE EXISTS.</b> Owner decisions <b>OD-H</b> (work is opt-in) and <b>OD-I</b>
    /// (one rule, OFF everywhere — fixtures too) make <see cref="WorkPriority.Default"/> equal
    /// <see cref="WorkPriority.Off"/> on every ship, including <c>--ship slice</c>, <c>--ship grid</c>
    /// and the scenario ship. An unattended fixture run therefore does <b>no work at all</b>, and from
    /// M2-2 onward every occupancy leg in this repo measures a ship where nobody works and reports it
    /// as a number. ⛔ That is not a regression to hunt — it is a harness that no longer states its own
    /// preconditions. This class is the precondition, stated: an occupancy leg <b>grants a work grid
    /// explicitly</b> and <b>prints it beside the result</b>.</para>
    ///
    /// <para><b>THE GRANT GOES THROUGH THE SIM'S OWN COMMAND.</b> Every cell is written by a
    /// <see cref="SetWorkPriorityCommand"/> on the sim's inbox — the same command the WORK tab sends
    /// (<c>GameSession.cs:949</c>) — never by touching <c>Citizen.SetWorkPriority</c> from the host.
    /// ⚠️ That is not fastidiousness: OD-I's rule is "one rule, off everywhere", and a fixture that
    /// reached past the command would be an authored exception in exactly the place OD-I forbids one,
    /// while also skipping the command's own range guards. The measured grid is then whatever the
    /// SIM ended up holding, which is the only grid that can have produced the numbers.</para>
    ///
    /// <para>⛔ <b>AND THE READ-BACK IS THE POINT, NOT THE PRINT.</b> <see cref="Verify"/> compares the
    /// requested grid against <see cref="Citizen.GetWorkPriority"/> after the commands executed, and
    /// <see cref="FormatGrid"/> renders the SIM'S state, never the parsed spec. Printing the spec back
    /// would be an echo: it would read identically whether the grant reached the sim or was dropped on
    /// the floor, which is precisely the failure this package exists to make impossible.</para>
    ///
    /// <para><b>ALL SIX TYPES ARE WRITTEN, INCLUDING THE OFF ONES.</b> Writing only the non-Off cells
    /// would leave the rest at whatever the shipped default happens to be, so the leg's grid would be
    /// a function of <see cref="WorkPriority.Default"/> — and the whole point is that a measurement
    /// must not silently inherit that constant again.</para>
    /// </summary>
    public static class WorkGrantHarness
    {
        /// <summary>Priority a bare type name (no <c>@N</c>) is granted at. Deliberately
        /// <see cref="WorkPriority.SimpleModeEnabled"/> (3) — RimWorld's own
        /// <c>alwaysStartActive</c> value and what a ticked checkbox is worth
        /// (<c>docs/design/rimworld-reference.md</c> §1.4), so "just switch it on" means the same
        /// number here as there. ⚠️ 1 is the HIGHEST priority and 4 the lowest.</summary>
        public const byte DefaultGrantPriority = WorkPriority.SimpleModeEnabled;

        /// <summary>The spec that means "grant nothing" — the shipped OD-H boot state, and the
        /// default when <c>--grant</c> is absent.</summary>
        public const string NoGrant = "none";

        /// <summary>
        /// Parse a <c>--grant</c> spec into a per-<see cref="WorkType"/> priority array.
        ///
        /// <para>Grammar (case-insensitive, InvariantCulture throughout):</para>
        /// <list type="bullet">
        ///   <item><c>none</c> / <c>off</c> — no grant; <paramref name="grid"/> is null.</item>
        ///   <item><c>all</c> or <c>all@N</c> — every work type at N (default 3).</item>
        ///   <item><c>Repair@1,Haul@4</c> — the named types at those priorities; every type NOT
        ///     named is <see cref="WorkPriority.Off"/>, explicitly written.</item>
        /// </list>
        /// Returns false with <paramref name="error"/> set on anything it cannot read; a spec is
        /// never partially applied.
        /// </summary>
        public static bool TryParseSpec(string spec, out byte[] grid, out string error)
        {
            grid = null; error = null;
            if (string.IsNullOrEmpty(spec)) return true;                     // absent flag ⇒ no grant
            string s = spec.Trim();
            if (EqualsInvariant(s, NoGrant) || EqualsInvariant(s, "off")) return true;

            var built = new byte[WorkPriority.WorkTypeCount];
            string[] terms = s.Split(',');
            bool sawAll = false;
            for (int i = 0; i < terms.Length; i++)
            {
                string term = terms[i].Trim();
                if (term.Length == 0) { error = "empty term in --grant spec"; return false; }
                string name = term;
                byte priority = DefaultGrantPriority;
                int at = term.IndexOf('@');
                if (at >= 0)
                {
                    name = term.Substring(0, at).Trim();
                    string num = term.Substring(at + 1).Trim();
                    if (!int.TryParse(num, NumberStyles.Integer, CultureInfo.InvariantCulture, out int p) ||
                        p < WorkPriority.Off || p > WorkPriority.Lowest)
                    {
                        error = $"--grant: '{num}' is not a priority (0 = off, 1..4 with 1 the HIGHEST)";
                        return false;
                    }
                    priority = (byte)p;
                }
                if (EqualsInvariant(name, "all"))
                {
                    if (terms.Length != 1)
                    {
                        error = "--grant: 'all' cannot be combined with per-type terms";
                        return false;
                    }
                    for (int k = 0; k < built.Length; k++) built[k] = priority;
                    sawAll = true;
                    continue;
                }
                if (!TryParseWorkType(name, out var type))
                {
                    error = $"--grant: unknown work type '{name}' (expected one of {TypeNames()})";
                    return false;
                }
                built[(int)type] = priority;
            }
            // An all-Off explicit spec is legal but is NOT a grant: it produces exactly the shipped
            // boot state, so treating it as one would let a leg claim a granted grid while measuring
            // the default. Say so rather than silently accepting it.
            if (!sawAll && IsAllOff(built))
            {
                error = "--grant: every named type is @0, which is the shipped default — use 'none' " +
                        "if that is what you meant, so the report does not claim a grant it did not make";
                return false;
            }
            grid = built;
            return true;
        }

        /// <summary>Whether every cell is <see cref="WorkPriority.Off"/> — i.e. indistinguishable
        /// from the OD-H boot state.</summary>
        public static bool IsAllOff(byte[] grid)
        {
            if (grid == null) return true;
            for (int i = 0; i < grid.Length; i++) if (grid[i] != WorkPriority.Off) return false;
            return true;
        }

        /// <summary>
        /// Enqueue the grant: one <see cref="SetWorkPriorityCommand"/> per (living citizen, work
        /// type), all six types written including the Off ones. Returns the number of commands
        /// enqueued. NOTHING IS APPLIED HERE — the sim executes them at its next tick boundary, which
        /// is why <see cref="Verify"/> must be called after at least one <c>Tick()</c>.
        /// </summary>
        public static int Grant(Simulation sim, byte[] grid)
        {
            if (sim == null || grid == null) return 0;
            int enqueued = 0;
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++)
            {
                var c = crew[i];
                if (c.Dead) continue;   // SetWorkPriorityCommand refuses a corpse; do not pretend otherwise
                for (int t = 0; t < grid.Length; t++)
                {
                    sim.EnqueueCommand(new SetWorkPriorityCommand(c.Id, t, grid[t]));
                    enqueued++;
                }
            }
            return enqueued;
        }

        /// <summary>
        /// ⛔ <b>THE GRANT-INTEGRITY CHECK.</b> Compare the requested grid against what the sim now
        /// holds for every living citizen. A mismatch means the grant did not land — the commands
        /// were dropped, the ids were wrong, or something re-zeroed the grid — and every number the
        /// leg is about to print would be a measurement of a configuration nobody asked for.
        /// Returns false with a citizen-and-type-level description of the first disagreement.
        /// </summary>
        public static bool Verify(Simulation sim, byte[] grid, out string mismatch)
        {
            mismatch = null;
            if (grid == null) return true;
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++)
            {
                var c = crew[i];
                if (c.Dead) continue;
                for (int t = 0; t < grid.Length; t++)
                {
                    byte got = c.GetWorkPriority((WorkType)t);
                    if (got == grid[t]) continue;
                    mismatch = string.Format(CultureInfo.InvariantCulture,
                        "citizen #{0} '{1}' {2}: requested {3}, sim holds {4}",
                        c.Id, c.Name, (WorkType)t, grid[t], got);
                    return false;
                }
            }
            return true;
        }

        /// <summary>
        /// The grid as the SIM holds it, per living crew member, in
        /// <see cref="WorkPriority.RankedOrder"/> (arbitration order, not enum order — the column
        /// order a reader will see in the WORK tab). Never renders the parsed spec: see the class
        /// doc's read-back paragraph.
        /// </summary>
        public static string FormatGrid(Simulation sim, string indent = "  ")
        {
            var sb = new StringBuilder();
            var order = WorkPriority.RankedOrder;
            sb.Append(indent).Append("crew          ");
            for (int k = 0; k < order.Count; k++) sb.Append(' ').Append(order[k].ToString().PadRight(11));
            sb.Append('\n');
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++)
            {
                var c = crew[i];
                sb.Append(indent);
                string label = (c.Dead ? "†" : " ") + (c.Name.Length > 13 ? c.Name.Substring(0, 13) : c.Name);
                sb.Append(label.PadRight(14));
                for (int k = 0; k < order.Count; k++)
                {
                    byte p = c.GetWorkPriority(order[k]);
                    string cell = p == WorkPriority.Off ? "off" : p.ToString(CultureInfo.InvariantCulture);
                    sb.Append(' ').Append(cell.PadRight(11));
                }
                sb.Append('\n');
            }
            return sb.ToString();
        }

        /// <summary>
        /// ONE LINE that must travel beside every headline number: the grid the sim holds, collapsed
        /// when the whole crew share it. This is the string that makes "A1 = 0.000 %" quotable —
        /// without it the reader cannot tell a correctly-working game from a broken harness, because
        /// after M2-2 those two produce the same number.
        /// </summary>
        public static string FormatCompact(Simulation sim)
        {
            var crew = sim.Citizens.Items;
            byte[] first = null;
            int living = 0;
            bool uniform = true;
            for (int i = 0; i < crew.Count; i++)
            {
                if (crew[i].Dead) continue;
                living++;
                var g = ReadGrid(crew[i]);
                if (first == null) { first = g; continue; }
                for (int t = 0; t < g.Length; t++) if (g[t] != first[t]) uniform = false;
            }
            if (first == null) return "no living crew";
            if (!uniform) return $"MIXED across {living} crew (see the work-grid block above)";
            if (IsAllOff(first)) return $"ALL OFF on all {living} crew (the OD-H boot default — NO grant)";
            var sb = new StringBuilder();
            var order = WorkPriority.RankedOrder;
            for (int k = 0; k < order.Count; k++)
            {
                byte p = first[(int)order[k]];
                if (p == WorkPriority.Off) continue;
                if (sb.Length > 0) sb.Append(' ');
                sb.Append(order[k]).Append('@').Append(p.ToString(CultureInfo.InvariantCulture));
            }
            return sb.Append($" on all {living} crew").ToString();
        }

        /// <summary>Copy one citizen's grid out of the sim (indexed by <see cref="WorkType"/>).</summary>
        public static byte[] ReadGrid(Citizen c)
        {
            var g = new byte[WorkPriority.WorkTypeCount];
            for (int t = 0; t < g.Length; t++) g[t] = c.GetWorkPriority((WorkType)t);
            return g;
        }

        /// <summary>What the non-vacuity check decided about a finished leg.</summary>
        public enum Vacuity
        {
            /// <summary>No grid was granted, so a zero is the shipped default's own output and
            /// proves nothing about the instrument.</summary>
            NotApplicable = 0,
            /// <summary>A grid was granted and the run produced productive work — this leg's zeroes
            /// (if any) belong to the ship, not to the harness.</summary>
            Pass = 1,
            /// <summary>A grid was granted and NOTHING productive happened. Indistinguishable from a
            /// broken instrument; the numbers must not be quoted.</summary>
            Fail = 2,
        }

        /// <summary>
        /// ⛔⛔ <b>THE NON-VACUITY RULE, AS ONE PURE FUNCTION.</b> After M2-2, <c>0 %</c> busy is BOTH
        /// the correct output of a correctly-working game (OD-H: nobody is assigned any work) AND the
        /// signature of a harness that measured nothing — and <c>A1 = 0.000 %</c> on <c>--ship grid</c>
        /// was already the measured post-E0 result, so the two causes are confusable by construction.
        ///
        /// <para>It is an <b>INCLUSION</b> test, which is the shape TRAPS' 4th warns about: it fires
        /// precisely on the runs where work WAS possible (a grid was granted) and none happened. A
        /// scope filter that excused those runs would exclude the only case worth catching.</para>
        /// </summary>
        /// <param name="granted">Whether this leg granted a work grid at all.</param>
        /// <param name="productiveTicks">Crew-ticks spent on a productive <c>JobKind</c> over the run.</param>
        public static Vacuity Judge(bool granted, long productiveTicks) =>
            !granted ? Vacuity.NotApplicable
            : productiveTicks == 0 ? Vacuity.Fail
            : Vacuity.Pass;

        /// <summary>Whether ANY living crew member can take ANY work type — the question
        /// "could this run have produced work at all?", asked of the sim rather than of the spec.</summary>
        public static bool AnyCrewHasAnyWork(Simulation sim)
        {
            var crew = sim.Citizens.Items;
            for (int i = 0; i < crew.Count; i++)
            {
                if (crew[i].Dead) continue;
                for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                    if (crew[i].CanTakeWorkType((WorkType)t)) return true;
            }
            return false;
        }

        private static bool TryParseWorkType(string name, out WorkType type)
        {
            foreach (WorkType t in Enum.GetValues(typeof(WorkType)))
                if (EqualsInvariant(name, t.ToString())) { type = t; return true; }
            type = default;
            return false;
        }

        private static string TypeNames()
        {
            var names = new List<string>();
            foreach (WorkType t in Enum.GetValues(typeof(WorkType))) names.Add(t.ToString());
            return string.Join("/", names.ToArray()) + "/all";
        }

        private static bool EqualsInvariant(string a, string b) =>
            string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
    }
}
