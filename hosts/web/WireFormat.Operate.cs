using System.Globalization;
using System.Text;

namespace Perilune.Web
{
    /// <summary>
    /// THE <c>operate</c> REPLY — <b>what happened when the player tried to open or shut a door or a
    /// vent.</b> A SIBLING PARTIAL of <see cref="WireFormat"/>, not an edit to it: <c>WireFormat</c> is
    /// a spine file (<c>CLAUDE.md</c>, integrator lane only) and it has been <c>partial</c> since the
    /// <c>zones</c> channel, so this file is a PURE ADDITION and <c>WireFormat.cs</c> has NO DIFF AT
    /// ALL. <c>SurfaceBoundaryTests.WireFormatFiles</c> globs <c>WireFormat*.cs</c> for exactly this.
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// WHAT WAS WRONG, PRECISELY. <b>Neither standard surface could open a door or a vent at all.</b>
    ///
    /// <c>SetDeviceStateCommand</c> and <c>SetDoorStateCommand</c> (<c>sim/Sim.Core/Commands/Commands.cs</c>)
    /// have existed since M1. The ONLY path to them from a browser was
    /// <c>GameSession.ContextAction</c>, reached by <c>Cmd.click</c> — the DEPRECATED console's
    /// invisible inspection cursor, a global <c>window</c> keydown that happens to survive the
    /// Overview takeover. It has no button, no visible target, and no place on the Level-1 Overview or
    /// the Level-2 Room Zoom. <c>KNOWN_GAPS_SEALED</c> is <c>['dig','stockpile','strip']</c>, so the
    /// console-retirement guard never censused this verb and structurally cannot see its absence.
    ///
    /// On <c>--ship wreck</c> that is not a gap, it is the missing first move: the premise opens on a
    /// sealed compartment and the player's opening gesture is *"restore the vent and it fills the
    /// compartment"* — a vent injects into its OWN room (OD-D, 2026-07-29; there is no neighbour
    /// term), and the breathable frontier grows one restored compartment at a time.
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    ///
    /// ⚠️ WHY A ONE-SHOT REPLY AND NOT A STATE CHANNEL. Every sparse channel in this directory
    /// (<c>zones</c>, <c>marks</c>, <c>items</c>, <c>devices</c>, <c>blocked</c>) answers a question
    /// about the WORLD and is therefore rebuilt on every render. This answers a question about ONE
    /// PLAYER ACTION — "I clicked that vent; what did the ship do?" — which has no per-render cost, no
    /// dedupe story and no snapshot story, because it does not exist until the player acts. It is the
    /// same shape as the <c>device</c> (singular) MOSS-terminal reply and the <c>citizen</c> card:
    /// broadcast through <c>GameSession.Emit</c>, never cached, never deduped.
    ///
    /// ⚠️⚠️ AND IT IS WHY THE FEEDBACK CAN BE HONEST AT ALL. The three refusals that make a toggle look
    /// broken — <b>locked</b>, <b>inoperative</b>, <b>unfixably wrecked</b> — plus the one that makes it
    /// look accepted and do nothing — <b>unpowered</b> — are read HERE, from the device itself, at the
    /// instant of the click.
    ///
    /// <b>⚠️ THAT JUSTIFICATION IS SOFTENED FROM THE FIRST DRAFT'S, WHICH OVERSTATED IT.</b> The
    /// load-bearing case is <c>MaintenanceSystem.IsUnfixableWreck</c>: a whole-item-store scan whose
    /// answer flips the moment a hauler drops a single Part, so it genuinely cannot ride a cached
    /// per-render channel and genuinely cannot go stale here. <c>Powered</c> was named beside it as a
    /// second pillar, and it is a WEAKER one — measured, not argued. It WOULD make the <c>devices</c>
    /// payload differ on most renders (<c>PowerSystem.Balance</c> rewrites it once a second on every
    /// drawing device, on every ship), so keeping it off that channel is still right; but on the
    /// SHIPPED CONTENT every vent reads <c>Powered = true</c>, so the clause it feeds is dead code
    /// today and is pinned by a CONSTRUCTED fixture rather than by any ship. The measurement and the
    /// guard are in <c>GameSession.OperateAdvisory</c>.
    ///
    /// So the reply's SHAPE is justified by <c>IsUnfixableWreck</c> alone, and <c>Powered</c> rides
    /// along because it is free once the reply exists. One live reason is enough; two, when one of
    /// them cannot fire, is the kind of prose this repo has had to retract before.
    ///
    /// <b>VERB PARITY IS NOT SUFFICIENT — the binding lesson (three instances) — so the REASON ships
    /// with the verb.</b> A door that will not move and a door that moved are otherwise the same
    /// picture on a 32-unit tile.
    ///
    /// ⚠️ THE HOST IS NOT A SECOND AUTHORITY, and the line between the two is worth stating because it
    /// is the trap this file is closest to. Every predicate below is the SIM'S OWN, called directly:
    /// <c>Device.IsOperational(defs)</c> (the per-kind <c>machines.def</c> threshold),
    /// <c>Device.IsLocked</c>/<c>IsOpen</c>/<c>Powered</c> (saved, hashed fields) and
    /// <c>MaintenanceSystem.IsUnfixableWreck</c> (public static, the W2 wreck rule). Nothing here
    /// recomputes a rule. What the host DOES decide is the ONE refusal the sim expresses as silence —
    /// a locked door, which <c>SetDoorStateCommand</c> answers with <c>target = open &amp;&amp; !IsLocked</c>,
    /// i.e. by quietly doing nothing. That branch is mirrored, and it is mirrored the way
    /// <c>ContextAction</c> has mirrored it since M1.
    ///
    /// <b>⛔ WHAT IT DELIBERATELY DOES NOT DO: REFUSE A WRECKED MACHINE.</b> An inoperative vent still
    /// takes the toggle. The switch is a physical position and flipping it is legal in the sim; what a
    /// wrecked vent does not do is MOVE AIR (<c>AtmosphereSystem.cs:123</c> gates injection on
    /// <c>IsOpen &amp;&amp; Powered &amp;&amp; IsOperational</c>). Refusing here would invent a legality
    /// rule the sim does not have — a second authority — and would also take away the only sensible
    /// preparation move on a wreck: open it now, repair it later. So the toggle lands and the reply
    /// carries an ADVISORY. <see cref="OperateOk"/> means "the ship accepted the order", never "the
    /// compartment is about to fill".
    ///
    /// VIEW-ONLY, PIN-NEUTRAL. This file reads state that is already saved and hashed and serializes a
    /// string. Nothing here mutates the sim, allocates into it or folds into any determinism hash; the
    /// <c>ISimCommand</c> the click produces is one the sim has enqueued since M1.
    ///
    ///   operate {"type":"operate","x":N,"y":N,"deck":N,"ok":0|1,"state":"OPEN|SHUT|-","reason":"…"}
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo OperateIc = CultureInfo.InvariantCulture;

        /// <summary>The order was accepted and an <c>ISimCommand</c> was enqueued. It does NOT mean the
        /// machine will do anything — see the advisory discussion in this file's header.</summary>
        public const int OperateOk = 1;

        /// <summary>The order was refused and NOTHING was enqueued.</summary>
        public const int OperateRefused = 0;

        /// <summary>
        /// Serialize one operate reply.
        ///
        /// <paramref name="state"/> is the state the device is being moved TO (<c>"OPEN"</c> /
        /// <c>"SHUT"</c>), or <c>"-"</c> when nothing was ordered. It is the TARGET rather than the
        /// current state on purpose: the client shows this the moment the reply lands, which is BEFORE
        /// the command drain has run, so echoing the current state would read as "nothing happened".
        ///
        /// <paramref name="reason"/> is upper-case ASCII prose for the player, assembled by
        /// <c>GameSession.HandleOperate</c>. It is JSON-escaped for <c>"</c> and <c>\</c> only,
        /// deliberately: every producer is a literal in that method, so a control character cannot
        /// arrive here, and a partial escaper that PRETENDED to be general would be worse than one
        /// whose limits are written down. Never null (an empty reason serializes as <c>""</c>).
        ///
        /// InvariantCulture on every number — the house wire style, and a live class of bug on this
        /// de-DE machine.
        /// </summary>
        public static string Operate(int x, int y, int deck, int ok, string state, string reason)
        {
            var sb = new StringBuilder(160);
            sb.Append("{\"type\":\"operate\",\"x\":").Append(x.ToString(OperateIc))
              .Append(",\"y\":").Append(y.ToString(OperateIc))
              .Append(",\"deck\":").Append(deck.ToString(OperateIc))
              .Append(",\"ok\":").Append((ok != 0 ? OperateOk : OperateRefused).ToString(OperateIc))
              .Append(",\"state\":\"").Append(JsonEscapeOperate(state ?? "-"))
              .Append("\",\"reason\":\"").Append(JsonEscapeOperate(reason ?? "")).Append("\"}");
            return sb.ToString();
        }

        /// <summary>Escape the two characters that can break a JSON string literal. NOT a general JSON
        /// escaper and it must not be mistaken for one: control characters and lone surrogates pass
        /// through. Every caller is a literal in <c>GameSession.HandleOperate</c>, plus device
        /// <c>Kind</c> names from the sim's own enum, so the input alphabet is A–Z and spaces.</summary>
        private static string JsonEscapeOperate(string s)
        {
            if (s.IndexOf('"') < 0 && s.IndexOf('\\') < 0) return s;
            var sb = new StringBuilder(s.Length + 8);
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '"' || c == '\\') sb.Append('\\');
                sb.Append(c);
            }
            return sb.ToString();
        }
    }
}
