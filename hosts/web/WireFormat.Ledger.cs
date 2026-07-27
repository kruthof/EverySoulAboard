using System.Globalization;
using System.Text;
using Perilune.Sim;

namespace Perilune.Web
{
    /// <summary>
    /// THE <c>ledger</c> CHANNEL (E0-8, <c>ECONOMY-PLAN.md</c> §1) — the ship's matter census and the
    /// three rate members, READ-ONLY. A SIBLING PARTIAL of <see cref="WireFormat"/>, not an edit to
    /// it: <c>WireFormat.cs</c> is a spine file (integrator lane only) and WP-3 already paid the
    /// one-token <c>partial</c> cost for the <c>zones</c> channel, so this file is a PURE ADDITION
    /// and <c>WireFormat.cs</c> has no diff at all. <c>SurfaceBoundaryTests.WireFormatFiles</c> globs
    /// <c>WireFormat*.cs</c> for exactly this.
    ///
    /// <para>VIEW-ONLY, PIN-NEUTRAL. Every number is read out of <see cref="ShipLedger"/>, which adds
    /// no sim field, no def row, no hash fold and no <c>GlyphColor</c>. Nothing here mutates the sim.</para>
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// ⚠️ THE MATTER LIST CARRIES <b>NAMES</b>, NOT ORDINALS — the opposite of the <c>marks</c>
    /// channel's choice, deliberately, and the reason is the reason this package exists.
    ///
    /// <c>marks</c> ships a small int because the client "has to hold a table anyway to know what to
    /// DRAW". The ledger's client holds no table: it prints the name. So an ordinal would buy nothing
    /// and would cost the one thing that must not be paid here — a client-side
    /// <c>ITEM_KIND_NAMES</c> array that a new <see cref="ItemKind"/> silently falls off the end of.
    /// Two sibling economy lanes (<c>E0-6 Seals</c>, <c>E0-7 Ice</c>) are adding kinds RIGHT NOW; a
    /// LEDGER THAT QUIETLY STOPS COUNTING A NEW RESOURCE is precisely the lying metric E0-8 was
    /// chartered to end, so the enum's own name travels on the wire and a new kind appears on the
    /// player's screen with no client change at all.
    ///
    /// The list is SPARSE — kinds at zero are omitted — so its cost is bounded by the kinds actually
    /// aboard, not by the enum's length. <c>total</c> is the full sum regardless, so a client that
    /// ignores the list still shows a correct roll-up.
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    ///
    /// <para>THE <c>notes</c> BLOCK is <see cref="ShipLedger.Derivation"/> — the host's plain-prose
    /// statement of how each member is computed and WHAT IT CANNOT SEE. It rides the same channel as
    /// the numbers on purpose: the limit has to travel with the figure, or a surface renders a bare
    /// "DAYS OF AIR" and the player reads it as an oxygen supply this ship does not have. It is
    /// static text repeated at the channel's ≤1 Hz cadence, which is ~3 KB/s against a
    /// <c>frame</c> channel already carrying the whole glyph map at 10 Hz — a rounding error.
    /// <b>⚠️ THE SECOND HALF OF THAT JUSTIFICATION WAS WRONG AND IS WITHDRAWN.</b> It used to add
    /// "and cheaper than a second request/response seam". A sibling <c>ledger-notes</c> channel would
    /// need NO request/response seam at all: <c>GameSession.Send</c> dedupes by payload, so static
    /// notes would go out once on the prime and never again — strictly cheaper on the wire than what
    /// ships here. The shipped arrangement is still the one we want (one channel, the limit
    /// physically inseparable from the number it qualifies), but it is a deliberate ~3 KB/s purchase
    /// and not a saving.</para>
    ///
    /// <para>The last <c>notes</c> entry is <c>caveat</c>, which is NOT a member: it is the one line
    /// the surface must show WITHOUT a hover. Every other limit rides a row's <c>title</c>, which is
    /// the channel a player is least likely to read.</para>
    ///
    ///   ledger {"type":"ledger","tick":N,"window":N,"total":N,"stacks":N,"unknown":N,
    ///           "matter":[["Potato",699],..],"partsPerDay":x,"matterPerDay":x,
    ///           "daysOfWater":x,"o2TrendDays":x,"tankL":x,"tankCapL":x,"greyL":x,"o2mol":x,
    ///           "crewO2PerDay":x,"crew":N,"notes":[["matter",".."],..,["caveat",".."]]}
    ///
    /// <para>SENTINELS, and a client MUST honour them or it will print a confident zero:
    /// <c>window == 0</c> ⇒ no rate on this payload means anything (render "measuring");
    /// <c>daysOfWater</c>/<c>o2TrendDays</c> <c>&lt; 0</c> ⇒ NOT DEPLETING, which is the healthy answer,
    /// not a missing value. <c>partsPerDay</c> is signed and 0 is a real reading.</para>
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo LedgerIc = CultureInfo.InvariantCulture;

        /// <summary>
        /// Serialize one <see cref="ShipLedgerReport"/>.
        ///
        /// <para>ORDER IS THE ENUM'S. The matter list walks <see cref="ShipLedger.KindCount"/>
        /// ascending, so emission order is a function of the <see cref="ItemKind"/> declaration and
        /// nothing else — no container's internal layout can reach the socket, and a kind appended to
        /// the enum appears at the end where a reader expects a new one.</para>
        ///
        /// <para>InvariantCulture on every number (its own <see cref="LedgerIc"/>, so this file is
        /// readable in isolation), one line, no whitespace — the house wire style. The dev machine is
        /// de-DE and a bare <c>ToString()</c> here would put a comma inside a JSON number.</para>
        /// </summary>
        public static string Ledger(in ShipLedgerReport r)
        {
            var sb = new StringBuilder(4096);
            sb.Append("{\"type\":\"ledger\"");
            sb.Append(",\"tick\":").Append(r.Now.Tick.ToString(LedgerIc));
            sb.Append(",\"window\":").Append(r.WindowTicks.ToString(LedgerIc));
            sb.Append(",\"total\":").Append(r.Now.TotalUnits.ToString(LedgerIc));
            sb.Append(",\"stacks\":").Append(r.Now.Stacks.ToString(LedgerIc));
            sb.Append(",\"unknown\":").Append(r.Now.UnknownUnits.ToString(LedgerIc));
            sb.Append(",\"crew\":").Append(r.Now.LivingCrew.ToString(LedgerIc));

            sb.Append(",\"matter\":[");
            var units = r.Now.Units;
            bool first = true;
            for (int k = 0; units != null && k < units.Length; k++)
            {
                if (units[k] == 0) continue;   // sparse: a kind at zero is not news
                if (!first) sb.Append(',');
                first = false;
                sb.Append('[');
                AppendString(sb, ShipLedger.KindName(k));
                sb.Append(',').Append(units[k].ToString(LedgerIc)).Append(']');
            }
            sb.Append(']');

            Field(sb, "partsPerDay", r.PartsPerDay);
            Field(sb, "matterPerDay", r.MatterUnitsPerDay);
            Field(sb, "daysOfWater", r.DaysOfWater);
            Field(sb, "o2TrendDays", r.O2TrendDays);
            Field(sb, "tankL", r.Now.TankLiters);
            Field(sb, "tankCapL", r.Now.TankCapacityLiters);
            Field(sb, "greyL", r.Now.GreywaterLiters);
            Field(sb, "o2mol", r.Now.BreathableO2Moles);
            // The reference point for `o2mol`. A mole count has nothing aboard to be compared
            // against — no capacity, no target, no reserve — so the crew's own daily draw travels
            // with it and the client renders CREW-DAYS.
            Field(sb, "crewO2PerDay", r.Now.CrewO2MolesPerDay);

            sb.Append(",\"notes\":[");
            for (int i = 0; i < ShipLedger.Ids.Length; i++)
            {
                if (i > 0) sb.Append(',');
                string id = ShipLedger.Ids[i];
                sb.Append('[');
                AppendString(sb, id);
                sb.Append(',');
                AppendString(sb, ShipLedger.Derivation(id));
                sb.Append(']');
            }
            sb.Append("]}");
            return sb.ToString();
        }
    }
}
