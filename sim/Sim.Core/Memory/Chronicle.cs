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
    /// event: RunEnded &gt; EmergencyThaw &gt; Eulogy &gt; Death &gt; Thaw &gt;
    /// Construction/Deconstruct/Repair/Commission &gt; Brownout &gt; Argument/Bond &gt;
    /// Relationship &gt; Alarm &gt; Goal &gt; Generic; ties resolve to the earliest event (entries
    /// are stored in tick order). Day boundaries use the <see cref="SimClockUtil.TicksPerDay"/> convention
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
            // ⭐⭐ THE TOP OF THE LADDER — THE CREW ROSTER. These are the entries that change WHO IS
            // ABOARD, which on a post-raid wreck is the run's actual subject.
            //
            // RunEnded is unconditionally first: there is no day after it, so nothing on that day
            // can out-rank it. EmergencyThaw sits above the death tier because its own sentence
            // ALREADY CONTAINS the death ("With <name> dead, the ship woke <name>") — promoting it
            // costs the day's death line nothing, it says the same thing better.
            //
            // ⛔ THE ORDINARY THAW SITS BELOW DEATH AND EULOGY, AND THAT IS RIMWORLD'S CLASSING
            // RATHER THAN a judgement call (binding mechanism rule; owner-directed 2026-08-02 after
            // review). `docs/design/rimworld-reference.md` §14.3 puts "wanderer joins" in the
            // GOOD/NEUTRAL EVENT bucket of the incident deck, beside cargo pods and traders, while
            // a raid is a "big threat"; §11.3's letter colours match — gold for good news, red
            // pulsing for the big ones. A joinee is a lesser positive event; a death is a major
            // negative one. So a day that holds BOTH is remembered as the day somebody died. An
            // earlier draft of this row had Thaw at 10, above both, and headlined the thaw.
            //
            // ⚠️ FIVE KINDS BELOW EXISTED WITH NO ROW AT ALL UNTIL THIS PACKAGE (EmergencyThaw and
            // RunEnded since M3-5, filed at MECHANICS §13.35): they fell through to 0 and rendered
            // as "[Note]", so the most severe line a run can produce lost its headline to a eulogy.
            // Swept as a CLASS rather than added one at a time.
            //
            // Death 7→8 and Eulogy 8→9 are a RENUMBER, not a reorder: every pinned pairing (Eulogy >
            // Death > Construction > Brownout > …) is preserved, and the gap is what gives the
            // ordinary Thaw a slot of its own between the work tier and the death tier.
            HistoryKind.RunEnded => 12,
            HistoryKind.EmergencyThaw => 11,

            // A eulogy outranks the bare death line it accompanies: on a death day the
            // friend's words ARE the headline (N5). No prior day carries a Eulogy entry,
            // so this only ever reshapes death days (append-only in effect).
            HistoryKind.Eulogy => 9,
            HistoryKind.Death => 8,
            HistoryKind.Thaw => 7,
            HistoryKind.ConstructionCompleted => 6,
            // E0-5: build's inverse ranks with build. Tearing the ship apart for salvage is at
            // least as much the story of a day as raising a wall was.
            HistoryKind.DeconstructCompleted => 6,
            // D1: repair ranks WITH build and its inverse — the same tier for the same reason.
            // Putting the machine back is as much the story of a day on a wreck as raising a wall
            // was on a colony, and it must out-rank a brownout: the brownout is usually what the
            // repair was FOR (`PowerSystem` browns out when a worn SolarWing under-supplies).
            HistoryKind.RepairCompleted => 6,
            // Commissioning joins the same tier — a FOUR-WAY TIE now, on purpose. Tier 6 means "the
            // ship's capability changed and a person made it happen"; a fitted controller module is
            // permanent, paid for in a terminal currency, and is the whole MOSS gate. Ties resolve
            // to the earliest entry (the strict '>' in Render), which is the tie-break
            // Construction/Deconstruct have used since E0-5. Below Brownout it must NOT go: a power
            // flap is the one thing this ladder already out-ranks by design.
            HistoryKind.DeviceCommissioned => 6,
            HistoryKind.Brownout => 5,
            // ⭐⭐ b3-R — A DROPPED ORDER TIES WITH A BROWNOUT, AND THE TIE IS ARGUED RATHER THAN
            // convenient. It must not sink BELOW the power flap, by D1's own reasoning one tier up:
            // the order that died is usually the repair the brownout was FOR, and a day remembered
            // as "the power flapped" when what actually happened is "the fix you ordered never
            // arrived" tells the player the symptom instead of the cause. It must not RISE to the
            // work tier either: tier 6 means "the ship's capability changed and a person made it
            // happen", and here nothing changed at all — that is the whole complaint.
            //
            // ⛔ IT STAYS BELOW THE CREW TIER, AND THAT IS OWNER-RULED, NOT A JUDGEMENT CALL: a
            // death (8) and a thaw (7) still headline a day that also holds a dropped order (ruled
            // 2026-08-02 for the thaw, restated 2026-08-03 — DEATH FIRST STANDS). Pinned by
            // `DroppedOrderChronicleTests.ADeathAndAThawStillOutrankADroppedOrder`.
            //
            // ⚠️ THE TIE IS RESOLVED BY THE STRICT '>' IN Render — the EARLIEST entry keeps the
            // headline — so a drop and a brownout on one day are ordered by when they happened,
            // which is the same tie-break Construction/Deconstruct have used since E0-5.
            //
            // (`rimworld-reference.md` §11.1 would put an interrupted forced job in the TRANSIENT
            // message channel rather than the letter stack — Perilune has no transient channel, and
            // the owner ruled the log line because the alternative here is permanent silence. That
            // classing is the reason it sits low on this ladder rather than beside the work tier.)
            HistoryKind.OrderDropped => 5,
            // ⭐⭐ M4-9 — A MENTAL BREAK JOINS THE WORK TIER, AND THE PLACEMENT IS ARGUED RATHER
            // THAN CONVENIENT.
            //
            // It must out-rank the brownout (5) for D1's own reason one tier up, run backwards: the
            // break is often WHY the repair the brownout was about never happened, and a day
            // remembered as "the power flapped" when what actually happened is "she stopped working"
            // tells the player the symptom instead of the cause. Tier 6 means "the ship's capability
            // changed and a person made it happen" — a break is that sentence with the agency
            // reversed, and the capability change is real: a crew member who takes no work is the
            // largest single change to what this ship can do that is not a death.
            //
            // ⛔ AND IT DOES NOT GO ABOVE 6, WHICH IS A SCOPE RULE RATHER THAN A JUDGEMENT. Every
            // pairing above tier 6 is owner-ruled and pinned by name, and `perilune-m4.packages.md`
            // §10 item 5 says in terms that M4-7 "must NOT re-order anything above tier 6". Six is
            // the highest slot available to this package without an owner ruling. ⚠️ FILED FOR THE
            // OWNER: whether a break should headline a day over a repair or a commissioning is a
            // real question and the tie currently answers it by CLOCK — item 5's own rule (the
            // strict '>' in Render keeps the earliest entry), which is the same tie-break
            // Construction/Deconstruct have used since E0-5.
            HistoryKind.MentalBreak => 6,
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
            // ⭐ Swept as a class with the severity rows above. EmergencyThaw and RunEnded have
            // existed since M3-5 and rendered as "[Note]" until now; the three D1 kinds are new.
            HistoryKind.RunEnded => "Ending",
            HistoryKind.EmergencyThaw => "Thaw",
            HistoryKind.Thaw => "Thaw",
            HistoryKind.RepairCompleted => "Repair",
            HistoryKind.DeviceCommissioned => "Commission",
            // b3-R. "Order" and not "Dropped": the tag names the SUBJECT, as every other row here
            // does (Repair, Commission, Salvage), and the line's own first two words say what
            // became of it.
            HistoryKind.OrderDropped => "Order",
            // M4-9. The tag names the SUBJECT, as every other row here does — and the subject is a
            // PERSON, which is why it is not "Break".
            HistoryKind.MentalBreak => "Crew",
            HistoryKind.Generic => "Note",
            _ => "Note",
        };
    }
}
