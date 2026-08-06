using System.Globalization;
using System.Text;

namespace Perilune.Web
{
    /// <summary>
    /// THE <c>placerefused</c> MESSAGE — the sim saying why a placement did not happen, in the one
    /// shape the player can hear.
    ///
    /// <para>A SIBLING PARTIAL of <see cref="WireFormat"/>, not an edit to it: <c>WireFormat.cs</c> is
    /// a spine file (<c>CLAUDE.md</c>, integrator lane only) and <c>WireFormat.Zones.cs</c> /
    /// <c>WireFormat.Marks.cs</c> already paid the one-token <c>partial</c> cost, so this file is a
    /// PURE ADDITION and <c>WireFormat.cs</c> has no diff at all.
    /// <c>SurfaceBoundaryTests.WireFormatFiles</c> globs <c>WireFormat*.cs</c> for exactly this.</para>
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// ⛔ <b>IT IS A ONE-SHOT <c>Emit</c>, NOT A <c>Send</c> STATE CHANNEL, AND THAT IS THE WHOLE
    /// TRANSPORT DECISION.</b> <c>GameSession.Send</c> dedupes on the WHOLE PAYLOAD per channel
    /// (<c>GameSession.cs</c>: <c>if (!force &amp;&amp; _cache.TryGetValue(channel, out var prev) &amp;&amp; prev == json)
    /// return;</c>) — so a player pressing the same unaffordable tile twice would be told once and
    /// then met with the silence this message exists to remove. <c>Emit</c> is the house's transient
    /// path (<c>WireFormat.Operate.cs</c>'s header carries the argument: *"This answers a question
    /// about ONE PLAYER ACTION … which has no per-render cost, no dedupe story and no snapshot
    /// story, because it does not exist until the player acts"*), and this is the same shape.
    ///
    /// <para>⛔ <b>AND IT IS DELIBERATELY ABSENT FROM <c>GameSession.Snapshot()</c>.</b> A reconnecting
    /// tab must not be told, out of nowhere, why a placement it has forgotten about was refused
    /// twenty minutes ago. A refusal is an answer to a gesture, and the gesture is gone.</para>
    ///
    /// <para>⚠️ <b>NOT THE <c>blocked</c> CHANNEL, AND THE REASON IS STRUCTURAL RATHER THAN STYLISTIC.</b>
    /// <c>WireFormat.Blocked.cs</c>'s discipline is that every row is RE-ASKED LIVE against a standing
    /// registry entry (<c>TileFlags.Designated</c>, <c>DeconstructSystem.Pending</c>,
    /// <c>BuildSystem.Pending</c>, <c>_prioritised</c>) — its own header: *"the rows are exactly the
    /// sites the player queued"*. A <c>PlaceDeviceCommand</c> that refuses <b>creates no registry entry
    /// at all</b>, so there is nothing for a later render to re-ask about and nothing that could ever
    /// clear the row. That is the same structural gap D5 hit, and the D5 answer — the sim publishes a
    /// transient event saying WHY — is the answer here too.</para>
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    ///
    /// <para>⛔ <b>THE CLIENT OWNS THE WORDS AND THE SIM OWNS THE CODE.</b> The payload carries a
    /// <see cref="Perilune.Sim.PlaceRefusal"/> BYTE, never a sentence — the same split
    /// <c>WireFormat.Blocked.cs</c> already ships (<c>BLOCKED_REASON_TEXT</c> lives in
    /// <c>client/src/wire/messages.js</c>). A sentence on the socket would be a second place the
    /// player's vocabulary lives, and the client already holds a table to know what to draw.</para>
    ///
    /// <para>VIEW-ONLY, PROJECTION-PURE, PIN-NEUTRAL. Nothing here mutates, allocates into the sim,
    /// mints a <c>GlyphColor</c> id or folds into any determinism hash.</para>
    ///
    ///   placerefused {"type":"placerefused","x":N,"y":N,"deck":N,"kind":N,"reason":N,"price":N,"affordable":N}
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo PlaceIc = CultureInfo.InvariantCulture;

        /// <summary>
        /// Serialize one refused placement. <paramref name="reason"/> is
        /// <see cref="Perilune.Sim.PlaceRefusal"/> as a byte (append-only);
        /// <paramref name="price"/>/<paramref name="affordable"/> are meaningful only for
        /// <c>CannotPay</c> and are 0 otherwise — see <see cref="Perilune.Sim.PlaceRefusedEvent"/>
        /// for why BOTH numbers travel (the ledger's total is an upper bound on what is loose).
        ///
        /// InvariantCulture on every number (its own <see cref="PlaceIc"/>, so this file is readable
        /// in isolation — the dev box is de-DE and a locale comma is invalid JSON), one line, no
        /// whitespace: the house wire style.
        /// </summary>
        public static string PlaceRefused(int x, int y, int deck, int kind, int reason, int price, int affordable)
        {
            var sb = new StringBuilder(128);
            sb.Append("{\"type\":\"placerefused\",\"x\":").Append(x.ToString(PlaceIc))
              .Append(",\"y\":").Append(y.ToString(PlaceIc))
              .Append(",\"deck\":").Append(deck.ToString(PlaceIc))
              .Append(",\"kind\":").Append(kind.ToString(PlaceIc))
              .Append(",\"reason\":").Append(reason.ToString(PlaceIc))
              .Append(",\"price\":").Append(price.ToString(PlaceIc))
              .Append(",\"affordable\":").Append(affordable.ToString(PlaceIc))
              .Append('}');
            return sb.ToString();
        }
    }
}
