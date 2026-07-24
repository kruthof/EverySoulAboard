using System.Collections.Generic;
using System.Globalization;

namespace Perilune.Sim
{
    /// <summary>
    /// One day of the ship's log: the day index, a single most-severe headline, and the
    /// full set of rendered lines for that day. <see cref="ProseOverride"/> is an
    /// optional, hash-exempt slot the later LLM prose pass fills in without changing this
    /// deterministic template output — <see cref="Display"/> prefers it when present.
    /// </summary>
    public sealed class ChronicleDay
    {
        public int Day { get; }
        public string Headline { get; }
        public IReadOnlyList<string> Lines { get; }

        /// <summary>
        /// LLM-authored prose for this day, or null. Filled by a later background job; it is
        /// NOT part of the deterministic render and belongs to no golden/hash surface, so it
        /// can appear or change without churning the template output below.
        /// </summary>
        public string ProseOverride { get; set; }

        /// <summary>The prose to show: the LLM override when present, else the templated headline.</summary>
        public string Display => ProseOverride ?? Headline;

        public ChronicleDay(int day, string headline, IReadOnlyList<string> lines)
        {
            Day = day;
            Headline = headline;
            Lines = lines;
        }
    }

    /// <summary>
    /// Chronicle v1 (WS-NARRATIVE N4; VISION "the ship's log as a first-class artifact"):
    /// a PURE, deterministic renderer that turns <see cref="HistorySystem.Entries"/> into a
    /// per-day log. Zero LLM dependency and zero wire coupling — the prose upgrade is a later
    /// background job that fills each day's hash-exempt <see cref="ChronicleDay.ProseOverride"/>.
    ///
    /// Templates are keyed on <see cref="HistoryKind"/> (the human text already carries the
    /// subject names HistorySystem wove in). Each day's headline is its single most-severe
    /// event: Death &gt; Construction &gt; Brownout &gt; Argument/Bond &gt; Relationship &gt;
    /// Alarm &gt; Goal &gt; Generic; ties resolve to the earliest event (entries are stored in
    /// tick order). Day boundaries use the <see cref="SimClockUtil.TicksPerDay"/> convention
    /// (the same divisor as <see cref="HistoryEntry.Day"/>). Day numbers format under
    /// InvariantCulture (the de-DE dev machine is the live culture canary).
    ///
    /// ALLOCATION: called ON DEMAND (a chronicle reader / eulogy build), never on a tick path
    /// — it allocates the day/line lists freely and holds no per-tick state.
    /// </summary>
    public static class Chronicle
    {
        /// <summary>Render the ship's log from a history system's entries.</summary>
        public static IReadOnlyList<ChronicleDay> Render(HistorySystem history)
            => history == null ? new List<ChronicleDay>() : Render(history.Entries);

        /// <summary>
        /// Render from a raw entry list (tick-ordered, as HistorySystem maintains). Entries
        /// sharing a day index collapse into one <see cref="ChronicleDay"/>; empty in → empty out.
        /// </summary>
        public static IReadOnlyList<ChronicleDay> Render(IReadOnlyList<HistoryEntry> entries)
        {
            var days = new List<ChronicleDay>();
            if (entries == null || entries.Count == 0) return days;

            int i = 0;
            while (i < entries.Count)
            {
                int day = DayOf(entries[i].Tick);

                // Consume the contiguous run of entries in this day (entries are tick-ordered,
                // so a given day index is one contiguous span).
                var lines = new List<string>();
                int bestSeverity = int.MinValue;
                string headlineText = "";
                while (i < entries.Count && DayOf(entries[i].Tick) == day)
                {
                    var e = entries[i];
                    lines.Add(RenderLine(e));
                    int sev = Severity(e.Kind);
                    if (sev > bestSeverity) // strict '>' keeps the earliest on a tie
                    {
                        bestSeverity = sev;
                        headlineText = HeadlineText(e);
                    }
                    i++;
                }

                string headline = "Day " + day.ToString(CultureInfo.InvariantCulture) + " — " + headlineText;
                days.Add(new ChronicleDay(day, headline, lines));
            }

            return days;
        }

        /// <summary>Integer day index for a tick — the same divisor <see cref="HistoryEntry.Day"/> uses.</summary>
        public static int DayOf(long tick) => (int)(tick / SimClockUtil.TicksPerDay);

        // The most-severe event of a day becomes its headline. Order per the N4 spec;
        // RelationshipChanged (not named in the spec) sits with the other social signals,
        // just under Argument/Bond.
        private static int Severity(byte kind) => (HistoryKind)kind switch
        {
            // A eulogy outranks the bare death line it accompanies: on a death day the
            // friend's words ARE the headline (N5). No prior day carries a Eulogy entry,
            // so this only ever reshapes death days (append-only in effect).
            HistoryKind.Eulogy => 8,
            HistoryKind.Death => 7,
            HistoryKind.ConstructionCompleted => 6,
            // E0-5: build's inverse ranks with build. Tearing the ship apart for salvage is at
            // least as much the story of a day as raising a wall was.
            HistoryKind.DeconstructCompleted => 6,
            HistoryKind.Brownout => 5,
            HistoryKind.Argument => 4,
            HistoryKind.Bond => 4,
            HistoryKind.RelationshipChanged => 3,
            HistoryKind.Alarm => 2,
            HistoryKind.Goal => 1,
            HistoryKind.Generic => 0,
            _ => 0,
        };

        // Per-day lines carry a category tag + the subject-rendered text HistorySystem produced.
        private static string RenderLine(in HistoryEntry e) => "[" + Label(e.Kind) + "] " + (e.Text ?? "");

        // The headline drops the tag: the day stamp + the plain sentence read as a log line.
        private static string HeadlineText(in HistoryEntry e) => e.Text ?? "";

        private static string Label(byte kind) => (HistoryKind)kind switch
        {
            HistoryKind.Alarm => "Alarm",
            HistoryKind.Eulogy => "Eulogy",
            HistoryKind.Death => "Death",
            HistoryKind.Goal => "Objective",
            HistoryKind.Brownout => "Power",
            HistoryKind.RelationshipChanged => "Relations",
            HistoryKind.Argument => "Argument",
            HistoryKind.Bond => "Bond",
            HistoryKind.ConstructionCompleted => "Construction",
            HistoryKind.DeconstructCompleted => "Salvage",
            HistoryKind.Generic => "Note",
            _ => "Note",
        };
    }
}
