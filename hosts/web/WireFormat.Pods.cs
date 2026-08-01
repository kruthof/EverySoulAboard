using System.Collections.Generic;
using System.Text;
using Perilune.Sim;

namespace Perilune.Web
{
    /// <summary>
    /// ⭐⭐ M3-4 — <b>THE POD BAY.</b> Twelve capsules, who is in each one, what state it is in, and
    /// — for every capsule that will not cycle — <b>WHY, with the number that produced it.</b>
    ///
    /// <para>⛔ <b>NOT ONE SENTENCE IN THIS FILE IS ITS OWN.</b> Every reason string is
    /// <see cref="ThawGate.Describe"/>'s, composed in Sim.Core from the same
    /// <see cref="ThawVerdict"/> the command executes against; every STATE word is derived from that
    /// verdict's <see cref="ThawRefusal"/> and from nothing else. The host asks and serialises; the
    /// client renders. Neither re-derives — that is OD-L's whole mechanic (<i>the reason IS the hint
    /// what to repair next</i>) and the M2-18 discipline it inherits.</para>
    ///
    /// <para><b>WHY A SEPARATE <c>partial</c> FILE.</b> <c>WireFormat.cs</c> is a spine file
    /// (CLAUDE.md); this package must leave it at a ZERO diff. A partial shares the class's private
    /// helpers — <c>MossHeader</c>, <c>AppendString</c>, <c>Ic</c> — so nothing is duplicated to buy
    /// the separation.</para>
    /// </summary>
    public static partial class WireFormat
    {
        /// <summary>The capsule states the bay can print. Codes are APPEND-ONLY (they reach the
        /// wire and the client styles off them); the words travel beside them so the client never
        /// keeps a second copy of the vocabulary — the <see cref="MossThaw"/> rule, verbatim:
        /// <i>a code with no sentence is unrenderable and a sentence with no code is
        /// unstylable</i>.</summary>
        public const int PodStateOpen = 0;
        /// <summary>Shut, occupied, and the gate has an opinion about it.</summary>
        public const int PodStateSealed = 1;
        /// <summary>Unpowered or below the <c>CryoPod</c> <c>fail</c> floor — OD-9's dead sleeper.</summary>
        public const int PodStateNoSignal = 2;
        /// <summary>Mid-cycle. THIS capsule, not merely "the bay is busy" — see
        /// <see cref="BuildPods"/> for how the two are told apart.</summary>
        public const int PodStateCycling = 3;

        private static readonly string[] PodStateWords = { "OPEN", "SEALED", "NO SIGNAL", "CYCLING" };

        /// <summary>
        /// One POD BAY row, fully decided host-side so the client makes no judgements at all.
        /// </summary>
        public readonly struct PodBayRow
        {
            /// <summary>The bay ordinal the player reads in the <c>#</c> column, 1-based, in
            /// <see cref="Device.Id"/> order (which is authoring order). ⚠️ NOT the device id: ids
            /// are shared with every other device on the ship and would print as four-digit noise
            /// in a twelve-row table.</summary>
            public readonly int Number;
            /// <summary>The capsule's <c>Device.Name</c> (<c>pod_ozawa</c>) — the key the client
            /// sends back with a thaw. ⛔ The client must never COMPOSE this from the occupant: the
            /// <c>"pod_" + who</c> convention is authoring's and lives in <c>CryoSystem</c>.</summary>
            public readonly string Pod;
            /// <summary>Who is inside, from <c>CryoSystem.SleeperName</c> — the sim's own inverse of
            /// the authoring convention, so the bay, the refusal and the arrival all name the same
            /// person the same way.</summary>
            public readonly string Occupant;
            /// <summary>One of the <c>PodState*</c> codes.</summary>
            public readonly int State;
            /// <summary>The <see cref="ThawRefusal"/> ordinal (0 = the gate said yes).</summary>
            public readonly int Why;
            /// <summary><see cref="ThawGate.DescribeRow"/>'s sentence for this capsule's verdict —
            /// the refusal in words, or <c>READY — 1 SEALS</c> for one that will cycle.</summary>
            public readonly string Reason;
            /// <summary>⭐ THE GATE'S OWN BIT. The client offers <c>[THAW]</c> on exactly the rows
            /// where this is true and refuses the typed <c>thaw</c> on exactly the rows where it is
            /// false — ONE rule asked in two places (RW §8.4 rung 3), never re-derived from the
            /// state word.</summary>
            public readonly bool Can;

            public PodBayRow(int number, string pod, string occupant, int state, int why,
                             string reason, bool can)
            {
                Number = number; Pod = pod; Occupant = occupant; State = state;
                Why = why; Reason = reason; Can = can;
            }
        }

        /// <summary>
        /// ⭐ THE CENSUS, ASKED OF THE GATE ONCE PER CAPSULE.
        ///
        /// <para><paramref name="term"/> is the console the bay speaks through, already resolved by
        /// <see cref="ThawGate.CommissionedConsoleName"/>. Passing it to every
        /// <see cref="ThawGate.Evaluate"/> call is what makes term 2 pass on every row, which in
        /// turn is what makes the REST of each row's answer meaningful: a bay rendered through an
        /// uncommissioned console would print <i>NO COMMISSIONED CONSOLE</i> twelve times and tell
        /// the player nothing about their crew. (That state does not reach this method — the op
        /// refuses in words before it is called.)</para>
        ///
        /// <para><b>THE STATE WORD IS DERIVED FROM THE VERDICT, NOT FROM THE DEVICE</b>, and the
        /// one non-obvious case is CYCLING. Term 3 refuses EVERY capsule while ANY capsule is
        /// mid-cycle, and the verdict it returns carries the CYCLING capsule's own
        /// <see cref="ThawVerdict.PodId"/> — so <c>PodCycling &amp;&amp; PodId == this pod</c> is
        /// "this one is running" and <c>PodCycling &amp;&amp; PodId != this pod</c> is "the bay is
        /// busy with somebody else", which is exactly the two different things the player needs to
        /// read. A second pass over <c>Device.Progress</c> would have been a second authority on
        /// the same fact.</para>
        ///
        /// <para><b>ALLOCATES, and that is fine.</b> This is a host reply to a player request (~1 Hz
        /// while the screen is up), never a tick path. It is also O(pods × devices) through
        /// <c>Evaluate</c>'s own scans; on the shipping ship that is 12 × 612 comparisons, measured
        /// at well under a millisecond, and the alternative — a bay-wide fast path — would be the
        /// second implementation of the gate this package exists to avoid.</para>
        /// </summary>
        public static List<PodBayRow> BuildPods(Simulation sim, string term)
        {
            var rows = new List<PodBayRow>(16);
            if (sim == null) return rows;

            // Device.Id order, taken explicitly rather than assumed off store order: the number in
            // the `#` column is the one thing on this screen the player will use to address a
            // capsule out loud, and it must not shuffle because a store compacted.
            var pods = new List<Device>(16);
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.CryoPod) pods.Add(devices[i]);
            pods.Sort((a, b) => a.Id.CompareTo(b.Id));

            for (int i = 0; i < pods.Count; i++)
            {
                var pod = pods[i];
                var v = ThawGate.Evaluate(sim, term, pod.Name);
                int state;
                switch (v.Reason)
                {
                    case ThawRefusal.PodAlreadyOpen: state = PodStateOpen; break;
                    case ThawRefusal.PodNoSignal: state = PodStateNoSignal; break;
                    case ThawRefusal.PodCycling:
                        state = v.PodId == pod.Id ? PodStateCycling : PodStateSealed; break;
                    default: state = PodStateSealed; break;
                }
                rows.Add(new PodBayRow(i + 1, pod.Name ?? "", CryoSystem.SleeperName(pod.Name ?? ""),
                                       state, (int)v.Reason, ThawGate.DescribeRow(v), v.Allowed));
            }
            return rows;
        }

        /// <summary>
        /// ⚠️ <b>THE HEADROOM LINE, AND ITS LABEL IS THE WHOLE POINT OF IT</b> (M3-3's filed item,
        /// discharged here as a DISPLAY question and nothing more).
        ///
        /// <para><c>ThawHeadroom.FoodUnits</c> counts every <c>Potato</c> aboard — carried and
        /// reserved stacks included, because it must equal <c>ShipLedgerSample.FoodUnits</c> to the
        /// bit — while a rung's <c>SHIP HAS n</c> reads <c>LooseMatter.Affordable</c>, which is
        /// loose stock only. Two numbers, two questions, and a player who saw them side by side
        /// with one label would reasonably conclude one of them is broken. So this line says which
        /// it is, in words, and <b>the sim's accounting is not touched</b> — changing what the
        /// ledger counts is a different package with a pin ritual.</para>
        ///
        /// <para>Composed host-side, like <c>ShipSystems.Derivation</c>: it is a report about
        /// numbers, not a refusal, so it is not <see cref="ThawGate.Describe"/>'s to write.
        /// InvariantCulture throughout.</para>
        /// </summary>
        public static string PodsHeadroomNote(Simulation sim)
        {
            if (sim == null) return "";
            var h = ThawGate.Headroom(sim);
            var sb = new StringBuilder(220);
            sb.Append("HEADROOM FOR ").Append(h.CrewAfterThaw.ToString(Ic)).Append(" CREW (").
               Append(h.LivingCrew.ToString(Ic)).Append(" AWAKE + 1) — SCRUBBING COVERS ").
               Append(h.CrewScrubbingCovers == int.MaxValue ? "ANY" : h.CrewScrubbingCovers.ToString(Ic));
            sb.Append(" · FOOD ").Append(h.FoodUnits.ToString(Ic)).Append(" U = ").Append(Days(h.DaysOfFood)).
               Append(" DAYS · WATER ").Append(h.TankLiters.ToString("0.0", Ic)).Append(" L = ").
               Append(Days(h.DaysOfWater)).Append(" DAYS");
            sb.Append(" · O2 ").Append(Days(h.O2CrewDays)).Append(" CREW-DAYS");
            sb.Append(". FOOD IS ALL STOCK ABOARD — CARRIED AND RESERVED INCLUDED, NOT THE LOOSE ");
            sb.Append("STOCK A REPAIR'S 'SHIP HAS' READS.");
            return sb.ToString();
        }

        /// <summary>One decimal, InvariantCulture, `999+` above the point a runway stops meaning
        /// anything — <see cref="ThawGate.Describe"/>'s own formatter, matched so the note and the
        /// refusals under it never print the same quantity two ways.</summary>
        private static string Days(double days)
        {
            if (!double.IsFinite(days) || days > 999.0) return "999+";
            return days.ToString("0.0", Ic);
        }

        /// <summary>
        /// ⭐ THE POD BAY REPLY:
        /// <code>
        /// {"type":"moss","ev":"pods","tid":"@console","term":"term_moss","moss":"COMMISSIONED",
        ///  "note":"HEADROOM FOR 2 CREW …",
        ///  "rows":[[n,"pod_ozawa","Ozawa",1,"SEALED",6,"NEEDS 2 SEALS — SHIP HAS 0",0],…]}
        /// </code>
        ///
        /// <para><c>term</c> is the console the sim resolved (the client sends it straight back with
        /// a <c>thaw</c>, so the command's term 2 asks about a real terminal instead of the
        /// <c>@console</c> pseudo-tid). <c>moss</c> is which of OD-N's three states the terminal is
        /// in — DARK · REPAIRED · COMMISSIONED — because <i>"the console is live and the bay is
        /// not"</i> is the state the player spends the whole opening in, and it is the one that
        /// tells them what to make next.</para>
        ///
        /// <para>A row is <c>[number, pod, occupant, state, stateWord, why, reason, can]</c>.
        /// ⛔ <b>THE ROW IS SENT WHOLE OR NOT AT ALL:</b> a state code with no word cannot be
        /// printed, a word with no code cannot be styled, and a refusal with no reason is the
        /// package failing (the charter's own words). The client asserts none of this — it simply
        /// has nothing else to render from, which is the point.</para>
        /// </summary>
        public static string MossPods(string tid, string term, string moss, string note,
                                      IReadOnlyList<PodBayRow> rows)
        {
            var sb = MossHeader(tid, "pods");
            sb.Append(",\"term\":"); AppendString(sb, term ?? "");
            sb.Append(",\"moss\":"); AppendString(sb, moss ?? "");
            sb.Append(",\"note\":"); AppendString(sb, note ?? "");
            sb.Append(",\"rows\":[");
            if (rows != null)
                for (int i = 0; i < rows.Count; i++)
                {
                    var r = rows[i];
                    if (i > 0) sb.Append(',');
                    sb.Append('[').Append(r.Number.ToString(Ic)).Append(',');
                    AppendString(sb, r.Pod ?? "");
                    sb.Append(',');
                    AppendString(sb, r.Occupant ?? "");
                    sb.Append(',').Append(r.State.ToString(Ic)).Append(',');
                    AppendString(sb, PodStateWord(r.State));
                    sb.Append(',').Append(r.Why.ToString(Ic)).Append(',');
                    AppendString(sb, r.Reason ?? "");
                    sb.Append(',').Append(r.Can ? "1" : "0").Append(']');
                }
            sb.Append(']');
            return sb.Append('}').ToString();
        }

        /// <summary>The word for a state code. An out-of-range code renders <c>UNKNOWN</c> and never
        /// <c>OPEN</c>: DA-M1's rule, that an unreadable value must not be printed as the healthy
        /// one, applies to a capsule harder than it applies to a load bar.</summary>
        public static string PodStateWord(int state)
            => state >= 0 && state < PodStateWords.Length ? PodStateWords[state] : "UNKNOWN";
    }
}
