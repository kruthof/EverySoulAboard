namespace Perilune.Sim
{
    /// <summary>
    /// One rung of the thaw ladder: which repair a capsule needs before it will open, and how much
    /// of it. A <c>readonly struct</c> so <see cref="ThawGate.RungOf"/> allocates nothing — the
    /// gate is destined for a command executing inside <c>Simulation.Tick</c>, and Sim.Core is
    /// zero-alloc in tick paths (test-enforced, not aspirational).
    /// </summary>
    public readonly struct ThawRung
    {
        /// <summary>1..7, ascending in difficulty. Rung 1 is the healthiest capsule.</summary>
        public readonly int Rung;
        /// <summary>The consumable the repair spends.</summary>
        public readonly ItemKind Item;
        /// <summary>How many units of <see cref="Item"/>.</summary>
        public readonly int Count;

        public ThawRung(int rung, ItemKind item, int count)
        {
            Rung = rung;
            Item = item;
            Count = count;
        }
    }

    /// <summary>
    /// ⭐ THE THAW LADDER'S RUNG TABLE — the per-pod repair requirement OD-L asks for, derived from
    /// a number the wreck already authors.
    ///
    /// <para><b>WHY <c>Condition</c> CARRIES IT.</b> Three places the rung could have lived: a new
    /// hashed <c>Device</c> field (refused — <c>Entities/Device.cs:46-49</c> and the wreck plan's
    /// W5.1 both say <i>"NO new <c>Device</c> field"</i>), a new def node (moves P4 and P5 for a
    /// table nobody tunes at runtime — and a def field pinned only by the checksum is NOT pinned),
    /// or the pod's own authored <c>Condition</c>, whose documented meaning is already <i>"how badly
    /// the raid treated it"</i> (<c>Device.cs:47</c>). The third is already hashed, already saved,
    /// already authored per pod — so the ladder costs <b>no new state, no def field and no pin</b>.
    /// M2-1's precedent, in its own words: <i>"it is a rule, not a tunable."</i></para>
    ///
    /// <para><b>THE TABLE (owner batch item OD-M item 1, answered 2026-07-31, option A —
    /// BINDING).</b> Depth is the difficulty curve and is non-decreasing; the COUNT escalates inside
    /// a depth. Chain depth runs 0,0,2,2,3,3,3 and the last rung costs <b>three times the
    /// commissioning gate</b>.</para>
    ///
    /// <code>
    ///   rung  band          the wreck's pod   item              count  chain depth
    ///   ----  ------------  ---------------   ----------------  -----  -----------
    ///     1   c &gt;= 0.92     Lindqvist 0.94    Seals                 1       0
    ///     2   c &gt;= 0.90     Ozawa     0.91    Seals                 2       0
    ///     3   c &gt;= 0.87     Ferreira  0.88    Parts                 1       2
    ///     4   c &gt;= 0.85     Mbeki     0.86    Parts                 2       2
    ///     5   c &gt;= 0.82     Bahri     0.83    ControllerModule      1       3
    ///     6   c &gt;= 0.80     Nakamura  0.81    ControllerModule      2       3
    ///     7   otherwise     Torres    0.78    ControllerModule      3       3
    /// </code>
    ///
    /// <para>⚠️ <b>THE COMMISSIONING GATE IS THE PROLOGUE, NOT A RUNG.</b> Every thaw needs a
    /// commissioned terminal and commissioning costs 1 <c>ControllerModule</c>
    /// (<c>Commands/Commands.cs:753,778</c>; <c>build.def commission_cost = 1</c>), and the wreck's
    /// <c>term_moss</c> boots <c>scriptable: false</c>. That gate is <i>"restore MOSS"</i> — the
    /// wreck premise's own opening objective — and it is deliberately NOT encoded here. Its stated
    /// residual, accepted by the owner: rung 1 is much easier than the prologue, which is the
    /// deliberate release of pressure after it.</para>
    ///
    /// <para>⚠️ <b>CHAIN DEPTH 1 (<c>Scrap</c>) IS DELIBERATELY UNUSED.</b> <c>Scrap</c> is a
    /// crafting intermediate, not a repair consumable — the shipped repair ladder is
    /// <c>Parts</c> / <c>Seals</c> / <c>Swarf</c> (<c>Sim.Gen/AuthoredShips.cs:1584</c>). Stated so
    /// nobody "fills the gap" and puts an intermediate in a pod.</para>
    ///
    /// <para>⭐ <b>THE LOWER EDGE OF EVERY BAND IS INCLUSIVE, UNIFORMLY</b> — a pod at exactly 0.92
    /// is rung 1, at exactly 0.90 is rung 2, at exactly 0.80 is rung 6. That matches the owner's own
    /// notation for the top band (<i>"≥ 0.92"</i>), so one comparison spelling reads the whole table.
    /// <b>The choice is made here on purpose</b>: RimWorld's <c>CapableOf</c> is
    /// <c>GetLevel(c) &gt; c.minForCapable</c>, a strict <c>&gt;</c>, so <i>"a capacity sitting
    /// exactly at <c>minForCapable</c> is NOT capable"</i> (<c>docs/design/rimworld-reference.md</c>
    /// §6.1) — the opposite convention, and the lesson it teaches is that <b>an edge nobody chose is
    /// an edge somebody will hit.</b> Pinned by <c>WreckShipTests</c>' exact-edge legs.</para>
    ///
    /// <para>⚠️ <b>NOTHING IN THE SIM CALLS THIS YET.</b> M3-6 authors the numbers and asserts them;
    /// M3-3 adds the thaw contract's remaining terms to this same class and makes the refusal read
    /// the rung. Until then this is authored-and-asserted only — <c>docs/MECHANICS.md</c> §13.28.
    /// ⭐ <b>The band-edge BEHAVIOURAL sweep is owed to M3-3 mutation 6 by name.</b></para>
    /// </summary>
    public static class ThawGate
    {
        /// <summary>The ladder has seven rungs, one per intact occupied capsule on the wreck.</summary>
        public const int RungCount = 7;

        /// <summary>
        /// The rung a capsule at <paramref name="condition"/> sits on. Pure, total (every float
        /// resolves — rung 7 is the catch-all) and zero-alloc.
        ///
        /// <para>Lower edges are INCLUSIVE — see the class remarks for why that was a decision and
        /// not a default.</para>
        /// </summary>
        public static ThawRung RungOf(float condition)
        {
            if (condition >= 0.92f) return new ThawRung(1, ItemKind.Seals, 1);
            if (condition >= 0.90f) return new ThawRung(2, ItemKind.Seals, 2);
            if (condition >= 0.87f) return new ThawRung(3, ItemKind.Parts, 1);
            if (condition >= 0.85f) return new ThawRung(4, ItemKind.Parts, 2);
            if (condition >= 0.82f) return new ThawRung(5, ItemKind.ControllerModule, 1);
            if (condition >= 0.80f) return new ThawRung(6, ItemKind.ControllerModule, 2);
            return new ThawRung(7, ItemKind.ControllerModule, 3);
        }
    }
}
