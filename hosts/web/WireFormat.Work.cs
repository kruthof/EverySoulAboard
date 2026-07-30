using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Perilune.Web
{
    /// <summary>
    /// THE <c>work</c> CHANNEL (M2-4) — each crew member's MANUAL WORK PRIORITIES, read from
    /// <see cref="Perilune.Sim.Citizen"/> itself. A SIBLING PARTIAL of <see cref="WireFormat"/>, not an
    /// edit to it: <c>WireFormat</c> is a spine file (<c>CLAUDE.md</c>, integrator lane only), and the
    /// <c>items</c> lane proved this pattern is better than the one-token <c>partial</c> edit —
    /// <c>WireFormat.cs</c> has NO DIFF AT ALL. <c>SurfaceBoundaryTests.WireFormatFiles</c> globs
    /// <c>WireFormat*.cs</c> for exactly this.
    ///
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    /// WHY THIS CHANNEL EXISTS. M2-1 landed the grid as per-citizen HASHED, SAVED state
    /// (<c>Citizen.WorkPrioritiesRaw</c>, CITZ v8) that <b>nothing outside the save writer could
    /// read</b>: no projection byte, no roster field, no channel. It is not a fact about a TILE, so no
    /// amount of work on <c>GlyphMapper</c> could ever have carried it — the same argument
    /// <c>WireFormat.Devices.cs</c> makes about <c>Device.Condition</c>, one step further along,
    /// because a work priority has no tile to be drawn on at all.
    /// ─────────────────────────────────────────────────────────────────────────────────────────
    ///
    /// ⚠️ <b>THE TUPLE DOES NOT LEAD WITH <c>x, y, deck</c>, AND THAT IS THE POINT.</b> The six
    /// existing sparse channels (<c>materials</c>, <c>zones</c>, <c>marks</c>, <c>items</c>,
    /// <c>devices</c>, <c>blocked</c>) all lead <c>x, y, deck</c> because they are keyed by TILE. This
    /// one is keyed by CITIZEN. Leading with a position would have to invent one — a crew member's
    /// <c>Pos</c> changes ten times a second while their priorities do not, so a tile-shaped row would
    /// make this payload differ on nearly every render (the reason <c>devices</c> refuses to carry
    /// <c>Powered</c>) and would invite a reader to draw a work grid at coordinates that mean nothing.
    /// <b>One decoder shape per KEYING</b> is the checked-in rule: <c>[cid, workType, priority]</c>.
    ///
    /// SPARSE MEANS "ABSENT = OFF", which is the sim's own semantics rather than a wire convention.
    /// <c>WorkPriority.Off</c> is documented as <i>"the ABSENCE of a priority, not a fifth priority
    /// value"</i> (<c>sim/Sim.Core/Entities/Citizen.cs</c>), so a row is emitted only for a work type
    /// that is switched ON. Under <b>OD-H</b> — work is opt-in, every work type boots OFF for every
    /// crew member on every ship — <b>this channel is EMPTY at boot and stays empty until the player
    /// gives an order</b>. That is not a degenerate case to be worked around; it is the milestone's
    /// safety property in payload form: the bytes can sit on <c>main</c> doing nothing at all until
    /// M2-2 gives them a reader and M2-3 gives them a producer.
    ///
    /// DEAD CREW ARE ABSENT, matching <see cref="Perilune.Sim.SetWorkPriorityCommand"/>, which refuses
    /// to write a corpse's grid. A dead crew member's stored priorities are still saved and hashed
    /// (the CITZ chapter walks the whole store); they are simply not part of "who can be ordered to do
    /// what", which is the question this channel answers.
    ///
    /// ROW ORDER IS <c>sim.Citizens</c> STORE ORDER, and within a citizen, <see cref="Perilune.Sim.WorkType"/>
    /// VALUE order — the storage index order, which is also the order <c>Simulation.StateHash</c>'s
    /// CITZ fold walks. ⚠️ <b>IT IS NOT A DISPLAY ORDER AND A CLIENT MUST NOT READ IT AS ONE.</b> The
    /// column order of a work tab is derived from <c>WorkPriority.RankedOrder</c> (itself derived from
    /// <c>NaturalPriority</c>); the two agree today only because OD-J's ranking happens to match the
    /// enum's declaration, and <c>Citizen.cs</c> is explicit that reordering the members must NOT
    /// silently re-rank arbitration. A surface that wants columns asks for the ranking, not for this.
    ///
    /// NOT FOG-GATED, and the omission is deliberate: every other sparse channel gates on
    /// <c>TileFlags.Explored</c> because it reports a fact about a PLACE the player may not have seen.
    /// This reports a fact about a PERSON on the player's own crew — an order the player themselves
    /// gave. Gating it on the tile the pawn happens to stand on would make a player's own work grid
    /// blink out when a crew member walked into an unexplored hall.
    ///
    /// VIEW-ONLY, PROJECTION-PURE, PIN-NEUTRAL. Every value is READ from state that is already saved
    /// and hashed (the CITZ chapter's id and priority bytes). Nothing here mutates, allocates into the
    /// sim, mints a <see cref="Perilune.Glyph.GlyphColor"/> id (<c>GlyphColor</c> is a spine file and
    /// is untouched) or folds into any determinism hash.
    ///
    ///   work {"type":"work","cells":[[cid,workType,priority],..]}
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo WorkIc = CultureInfo.InvariantCulture;

        /// <summary>
        /// One switched-ON work type for one crew member on the <c>work</c> channel. Tuple
        /// <c>[cid, workType, priority]</c>, append-only (a future field is a trailing element,
        /// exactly as <see cref="ItemCell"/> and <see cref="DeviceCell"/> document).
        ///
        /// <para><see cref="Cid"/> is the citizen's ENTITY id — the same id the <c>frame</c> crew
        /// tuple's fourth element and the <c>roster</c> channel carry, and the same id
        /// <see cref="Perilune.Sim.SetWorkPriorityCommand"/> takes back. NOT a store index: ids are not
        /// indices the moment anyone dies.</para>
        ///
        /// <para><see cref="WorkType"/> is the raw <see cref="Perilune.Sim.WorkType"/> byte and
        /// <see cref="Priority"/> the raw stored byte (<c>1</c>..<c>4</c>, <b>1 the HIGHEST</b>). Both
        /// are the sim's own values, not a wire vocabulary invented here — the <c>items</c> channel's
        /// choice for <c>ItemKind</c>, and for its reason: a second declaration would be a hand mirror
        /// of the enum. <c>0</c> never appears in <see cref="Priority"/>; an off work type has no row.</para>
        /// </summary>
        public readonly struct WorkCell
        {
            public readonly int Cid, WorkType, Priority;

            public WorkCell(int cid, int workType, int priority)
            { Cid = cid; WorkType = workType; Priority = priority; }

            /// <summary>
            /// Element-wise equality, for <c>GameSession.SendWork</c>'s dirty-version gate.
            ///
            /// <para>⚠️ <b>A FIELD ADDED TO THE TUPLE MUST BE ADDED HERE IN THE SAME COMMIT.</b> This
            /// is the <see cref="DeviceCell"/> scar written down where the next person will trip over
            /// it: the OPERATE verb appended <c>Open</c> to that struct and the delta gate's field
            /// list AUTO-MERGED WITH NO CONFLICT, leaving a gate that ignored the one byte a player
            /// toggles — a door would have stopped re-serializing with the whole suite green. A field
            /// the key does not read is a field whose change is never re-sent, and the only symptom is
            /// a stale readout that nothing ever refreshes.</para>
            /// </summary>
            public bool SameAs(WorkCell other) =>
                Cid == other.Cid && WorkType == other.WorkType && Priority == other.Priority;
        }

        /// <summary>
        /// Serialize the sparse work-priority layer: one entry per switched-ON (citizen, work type)
        /// pair, in the caller's order.
        ///
        /// ORDER IS THE CALLER'S — same contract as <see cref="Items"/> and <see cref="Devices"/>.
        /// This method sorts nothing. <c>GameSession.BuildWork</c> walks <c>sim.Citizens.Items</c> in
        /// STORE ORDER (a plain <c>List</c> — index order, never a hash container's layout) and the
        /// work types in enum-value order, so no dictionary iteration can reach the socket and two
        /// runs of one seed emit the same bytes.
        ///
        /// InvariantCulture on every number (its own <see cref="WorkIc"/>, so this file is readable in
        /// isolation), one line, no whitespace — the house wire style.
        /// </summary>
        public static string Work(IReadOnlyList<WorkCell> cells)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"work\",\"cells\":[");
            if (cells != null)
                for (int i = 0; i < cells.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var c = cells[i];
                    sb.Append('[').Append(c.Cid.ToString(WorkIc))
                      .Append(',').Append(c.WorkType.ToString(WorkIc))
                      .Append(',').Append(c.Priority.ToString(WorkIc)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }
    }
}
