using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Perilune.Web
{
    /// <summary>
    /// ⭐ THE <c>workcaps</c> CHANNEL (M3-7) — <b>WHAT EACH CREW MEMBER IS GOOD AT, AND WHAT SHE
    /// CANNOT DO AT ALL.</b> One row per living crew member: <c>[cid, s0..s5, incapableMask]</c>.
    /// A SIBLING PARTIAL of <see cref="WireFormat"/>, on the <c>WireFormat.Work.cs</c> precedent —
    /// <c>WireFormat.cs</c> has NO DIFF AT ALL and neither has <c>WireFormat.Work.cs</c>
    /// (<c>SurfaceBoundaryTests.WireFormatFiles</c> globs <c>WireFormat*.cs</c> for exactly this).
    ///
    /// ═════════════════════════════════════════════════════════════════════════════════════════
    /// <para>⛔ <b>WHY THIS IS A SECOND MESSAGE AND NOT TWO MORE COLUMNS ON <c>work</c>. THE OBVIOUS
    /// DESIGN IS UNBUILDABLE, NOT MERELY WORSE.</b> <c>WireFormat.Work.cs:86-87</c>: <i>"<c>0</c> never
    /// appears in <c>Priority</c>; an off work type has no row."</i> The <c>work</c> channel emits one
    /// row per switched-ON (citizen, work type) pair and nothing else. And an INCAPABLE work type is
    /// BY DEFINITION never on (<c>Citizen.CanTakeWorkType</c>), so it has no row — <b>and a row that
    /// does not exist cannot carry a column.</b> Under OD-H the whole channel is EMPTY at boot, so at
    /// the exact moment the player first looks at a crew member, a columns-on-<c>work</c> design
    /// carries nothing at all.</para>
    ///
    /// <para>Three mechanisms were available and this is B: <b>A</b> densify <c>work</c> (emit every
    /// pair, breaking the <i>"0 never appears"</i> contract other readers rely on and taking the row
    /// count from <i>on-pairs</i> to <i>crew × 6</i>); <b>B</b> a second message; <b>C</b> ride the
    /// <c>crew</c>/<c>roster</c> cadence (couples two unrelated update rates — <c>work</c> is
    /// dirty-versioned separately for a reason). <b>B is the only one that adds nothing to a struct
    /// whose delta gate has already caused one silent defect</b> (the <c>DeviceCell</c> scar,
    /// <c>WireFormat.Work.cs:97-105</c>), and it is the only shape that fits the DATA: skill is
    /// per-citizen-per-work-type while incapability is a per-citizen MASK — neither is naturally a
    /// column on a per-priority row.</para>
    ///
    /// <para>⭐ AND IT RECONCILES WITH HOW THE ANALOGUE DRAWS THE FACT. <c>rimworld-reference.md:335</c>
    /// — the <c>renders as</c> row — has disabled (priority 0) rendering as a <b>blank cell / unchecked
    /// box</b> and incapable as <b>"no cell at all — the box is absent"</b>. ⚠️ The rendering is
    /// ABSENCE, not decoration: not struck through, not greyed. A sparse <c>work</c> wire that omits
    /// the row and a tab that omits the cell are the same fact expressed once. <b>M3-12 draws it; this
    /// package ships the channel.</b></para>
    ///
    /// ═════════════════════════════════════════════════════════════════════════════════════════
    /// <para>⚠️ <b>THE TUPLE DOES NOT LEAD WITH <c>x, y, deck</c></b>, for <c>work</c>'s reason: it is
    /// keyed by CITIZEN, not by TILE. A crew member's <c>Pos</c> changes ten times a second while her
    /// competence does not, so a tile-shaped row would make this payload differ on nearly every render
    /// and would invite a reader to draw a skill grid at coordinates that mean nothing.</para>
    ///
    /// <para><b>DENSE, WHERE <c>work</c> IS SPARSE, AND THAT IS THE WHOLE POINT.</b> Every living crew
    /// member gets a row <b>even when she has no on-rows on <c>work</c> at all</b> — which under OD-H
    /// is every crew member on every ship at boot, i.e. THE DEFAULT FIXTURE. A channel that skipped
    /// the all-zero citizen would be empty exactly when the player first opens the WORK tab, and the
    /// one fact this channel exists to carry (what she CANNOT do) would arrive only after the player
    /// had already switched something on.</para>
    ///
    /// <para>⛔ <b>THE MASK IS <c>Citizen.WorkIncapable</c>'s OWN BYTE, SENT VERBATIM.</b> Not
    /// re-derived, not recomputed from the priorities, not assembled bit by bit from
    /// <c>IsIncapableOf</c>. SINGLE AUTHORITY: the sim owns what a person cannot do, and a host-side
    /// second implementation is how <c>WireFormat.Blocked.cs:548</c> and <c>GameSession.cs:2886</c>
    /// both record the same class of defect. The seam is pinned by recording the ARGUMENT at the
    /// boundary rather than by scanning text (TRAPS 4).</para>
    ///
    /// <para>⚠️ <b>AND <c>incapable</c> IS NOT <c>priority == 0</c>.</b> RimWorld §1.2: <i>"blank and
    /// disabled are one stored value while INCAPABLE is a different thing entirely"</i> — an order
    /// from the PLAYER versus a fact about the PERSON, with different provenance, lifetime and UI.
    /// ⭐ On the sparse <c>work</c> channel the two are indistinguishable BY CONSTRUCTION (both are "no
    /// row"), <b>which is precisely why this channel exists</b>. A fixture that carries one citizen
    /// incapable of a type and one with the same type merely switched off is the only thing that can
    /// see the difference.</para>
    ///
    /// <para>DEAD CREW ARE ABSENT, matching <c>work</c>: their stored skills are still saved and
    /// hashed (the CITZ chapter walks the whole store), they are simply not part of "who aboard can do
    /// what". NOT FOG-GATED, for <c>work</c>'s reason: this is a fact about a PERSON on the player's
    /// own crew, and gating it on the tile she happens to stand on would make her sheet blink out when
    /// she walked into an unexplored hall.</para>
    ///
    /// <para>ROW ORDER IS <c>sim.Citizens</c> STORE ORDER; within a row, <c>WorkType</c> VALUE order.
    /// ⚠️ <b>NOT A DISPLAY ORDER.</b> A work tab's column order is derived from
    /// <c>WorkPriority.RankedOrder</c>; the two agree today only because OD-J's ranking happens to
    /// match the enum's declaration. A surface that wants columns asks for the ranking.</para>
    ///
    /// <para>VIEW-ONLY, PROJECTION-PURE, PIN-NEUTRAL. Every value is READ from state already saved and
    /// hashed (CITZ v9's skill array and the incapability mask). Nothing here mutates, allocates into
    /// the sim, mints a <c>GlyphColor</c> id or folds into any determinism hash — the package's pin
    /// move is the sim-side fold, and this file is no part of it.</para>
    ///
    ///   workcaps {"type":"workcaps","cells":[[cid,s0,s1,s2,s3,s4,s5,incapable],..]}
    /// </summary>
    public static partial class WireFormat
    {
        private static readonly CultureInfo WorkCapsIc = CultureInfo.InvariantCulture;

        /// <summary>Skill levels per row — one per <c>Perilune.Sim.WorkType</c>. ⚠️ PINNED against
        /// <c>WorkPriority.WorkTypeCount</c> by <c>WorkCapsChannelTests</c>, so a seventh work type
        /// reddens here instead of silently emitting a short tuple into a positional decoder.</summary>
        public const int WorkCapsSkillSlots = 6;

        /// <summary>
        /// One crew member's competence row on the <c>workcaps</c> channel. Tuple
        /// <c>[cid, s0, s1, s2, s3, s4, s5, incapableMask]</c> — append-only, exactly as
        /// <see cref="WorkCell"/>, <c>ItemCell</c> and <c>DeviceCell</c> document.
        ///
        /// <para><see cref="Cid"/> is the citizen's ENTITY id — the same id the <c>frame</c> crew
        /// tuple's fourth element, the <c>roster</c> channel and the <c>work</c> channel carry. NOT a
        /// store index: ids stop being indices the moment anyone dies.</para>
        ///
        /// <para>The six skill fields are named for their work types rather than indexed, so a
        /// mis-ordered builder is a compile-time-visible mistake at the call site instead of a silent
        /// column swap. <see cref="SkillAt"/> exists for the serializer and the tests, which want the
        /// positional view the WIRE actually has.</para>
        ///
        /// <para><see cref="IncapableMask"/> is <c>Citizen.WorkIncapable</c>'s raw byte — bit
        /// <c>1 &lt;&lt; (int)workType</c> set = this person can never do it. Sent as the sim's own
        /// value, not a wire vocabulary invented here (the <c>items</c> channel's choice for
        /// <c>ItemKind</c>, and for its reason: a second declaration would be a hand mirror).</para>
        /// </summary>
        public readonly struct WorkCapsCell
        {
            public readonly int Cid;
            public readonly int SkillRepair, SkillConstruct, SkillCraft, SkillDeconstruct, SkillMine, SkillHaul;
            public readonly int IncapableMask;

            public WorkCapsCell(int cid, int repair, int construct, int craft,
                                int deconstruct, int mine, int haul, int incapableMask)
            {
                Cid = cid;
                SkillRepair = repair; SkillConstruct = construct; SkillCraft = craft;
                SkillDeconstruct = deconstruct; SkillMine = mine; SkillHaul = haul;
                IncapableMask = incapableMask;
            }

            /// <summary>The skill in wire position <paramref name="slot"/> (<c>WorkType</c> value
            /// order). Out of range returns 0 rather than throwing: a serializer must not take the
            /// socket down over an index.</summary>
            public int SkillAt(int slot) => slot switch
            {
                0 => SkillRepair,
                1 => SkillConstruct,
                2 => SkillCraft,
                3 => SkillDeconstruct,
                4 => SkillMine,
                5 => SkillHaul,
                _ => 0,
            };

            /// <summary>
            /// Element-wise equality, for <c>GameSession.SendWorkCaps</c>'s dirty-version gate.
            ///
            /// <para>⚠️ <b>A FIELD ADDED TO THE TUPLE MUST BE ADDED HERE IN THE SAME COMMIT.</b> The
            /// <see cref="WorkCell"/> header carries this warning because it is the <c>DeviceCell</c>
            /// scar: the OPERATE verb appended <c>Open</c> to that struct and the delta gate's field
            /// list AUTO-MERGED WITH NO CONFLICT, leaving a gate that ignored the one byte a player
            /// toggles. A field the key does not read is a field whose change is never re-sent, and
            /// the only symptom is a stale readout nothing ever refreshes. ⭐ Here that would be a
            /// crew member whose skills visibly never improve, or an incapability that never clears.
            /// Every field below is asserted individually by <c>WorkCapsChannelTests</c>.</para>
            /// </summary>
            public bool SameAs(WorkCapsCell other) =>
                Cid == other.Cid &&
                SkillRepair == other.SkillRepair && SkillConstruct == other.SkillConstruct &&
                SkillCraft == other.SkillCraft && SkillDeconstruct == other.SkillDeconstruct &&
                SkillMine == other.SkillMine && SkillHaul == other.SkillHaul &&
                IncapableMask == other.IncapableMask;
        }

        /// <summary>
        /// Serialize the competence layer: one entry per living crew member, in the caller's order.
        ///
        /// ORDER IS THE CALLER'S — the same contract as <see cref="Work"/>, <c>Items</c> and
        /// <c>Devices</c>. This method sorts nothing. <c>GameSession.BuildWorkCaps</c> walks
        /// <c>sim.Citizens.Items</c> in STORE ORDER (a plain <c>List</c> — index order, never a hash
        /// container's layout), so no dictionary iteration can reach the socket and two runs of one
        /// seed emit the same bytes.
        ///
        /// InvariantCulture on every number (its own <see cref="WorkCapsIc"/>, so this file is readable
        /// in isolation), one line, no whitespace — the house wire style.
        /// </summary>
        public static string WorkCaps(IReadOnlyList<WorkCapsCell> cells)
        {
            var sb = new StringBuilder(256);
            sb.Append("{\"type\":\"workcaps\",\"cells\":[");
            if (cells != null)
                for (int i = 0; i < cells.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var c = cells[i];
                    sb.Append('[').Append(c.Cid.ToString(WorkCapsIc));
                    for (int s = 0; s < WorkCapsSkillSlots; s++)
                        sb.Append(',').Append(c.SkillAt(s).ToString(WorkCapsIc));
                    sb.Append(',').Append(c.IncapableMask.ToString(WorkCapsIc)).Append(']');
                }
            sb.Append("]}");
            return sb.ToString();
        }
    }
}
