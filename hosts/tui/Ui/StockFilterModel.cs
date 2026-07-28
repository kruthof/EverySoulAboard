using System;
using System.Text;
using Perilune.Sim;

namespace Perilune.Tui.Ui
{
    /// <summary>
    /// PURE helpers for the TUI's pending stockpile accept-mask (E0-4 WP-5): bit <c>k</c> set ⇒ the
    /// zoned tile accepts <see cref="ItemKind"/> <c>k</c>.
    ///
    /// This lives beside <see cref="InspectorModel"/> rather than inside <c>GameLoop</c> for the
    /// reason that file states about itself: <c>GameLoop</c> owns Console/raw-mode and is NOT in the
    /// headless test host, so any logic left there is untestable by construction. The two keys ('i'
    /// cycles the kind, 'I' toggles it) are the TUI's whole filter surface — the plan's "the
    /// stockpile verb gains a filter argument" has nothing to attach to, because TUI input is a pure
    /// ConsoleKeyInfo → InputAction map with no argument anywhere in it.
    /// </summary>
    public static class StockFilterModel
    {
        /// <summary>
        /// Every declared <see cref="ItemKind"/> BYTE, in enum order. Textually first — everything
        /// below reads it in its own initializer, and C# runs static field initializers in source
        /// order.
        ///
        /// E0-7 CORRECTION, KEPT BY THE WAVE MERGE: this type used to work off the member COUNT and
        /// treat a kind as an index in <c>0..KindCount-1</c>. That is only right while
        /// <see cref="ItemKind"/> is CONTIGUOUS, and it stopped being contiguous while E0-7 developed
        /// against a tree where slot 7 (E0-6's <c>Seals</c>) was reserved but absent and E0-7 took
        /// <c>Ice = 8</c>. Under the count form the TUI's cursor would have offered a kind 7 that
        /// does not exist, refused to reach Ice at all, and <see cref="AcceptAllMask"/> would have
        /// set bit 7 and cleared bit 8 — "accept everything" silently refusing the one kind the
        /// package added.
        ///
        /// The merge landed E0-6, so the enum is contiguous again and the count form would now work
        /// BY ACCIDENT. The value form stays: it is the form that is correct for a reason rather than
        /// by coincidence, and the next appended kind that leaves a hole resurrects the defect.
        /// </summary>
        public static readonly int[] Kinds = BuildKinds();

        private static int[] BuildKinds()
        {
            var values = (ItemKind[])Enum.GetValues(typeof(ItemKind));
            var kinds = new int[values.Length];
            for (int i = 0; i < values.Length; i++) kinds[i] = (int)values[i];
            return kinds;
        }

        /// <summary>How many <see cref="ItemKind"/>s exist. NOT the highest byte — see
        /// <see cref="Kinds"/>.</summary>
        public static readonly int KindCount = Kinds.Length;

        /// <summary>Every kind accepted. DERIVED from the enum's VALUES, never from its member count
        /// and never a literal, so it widens with <see cref="ItemKind"/> and tolerates a gap instead
        /// of silently covering the wrong set. The web host derives its own the same way — the two
        /// host projects share no assembly, and a derived value cannot drift where a copied literal
        /// would.</summary>
        public static readonly ulong AcceptAllMask = BuildAcceptAllMask();

        private static ulong BuildAcceptAllMask()
        {
            ulong m = 0;
            for (int i = 0; i < Kinds.Length; i++)
                if (Kinds[i] < 64) m |= 1UL << Kinds[i];   // >= 64 is unrepresentable (StockZone.AcceptMask)
            return m;
        }

        /// <summary>
        /// The PLAYER-FACING name of each kind, indexed by the ItemKind byte. Deliberately not
        /// <c>ItemKind.ToString()</c>: the two surfaces must speak ONE vocabulary, and the web
        /// palette says FOOD (the kind is "raw food", not one vegetable), ORE (it is the only ore)
        /// and CTRL MOD. A TUI that said "Potato" while the console said "FOOD" would be two names
        /// for one filter bit. Kept identical to <c>STOCK_KINDS</c> in
        /// <c>client/src/ui/stock-filter-model.js</c>, and <c>stock-filter-model.test.js</c> parses
        /// THIS array out of THIS file and compares it label-for-label so the two cannot drift.
        ///
        /// E0-7: parallel to <see cref="Kinds"/> (declaration order), NOT indexed by the ItemKind
        /// byte. Those coincide only while the enum is contiguous — it was not while E0-7 developed
        /// against a hole at 7, where a positional array would have needed a fake row — and the
        /// wave merge closed the hole. The parallel reading is the one that survives the next one.
        /// </summary>
        public static readonly string[] Labels =
        {
            "REGOLITH",  // ItemKind.Regolith          (0)
            "ORE",       // ItemKind.MetalOre          (1)
            "CORPSE",    // ItemKind.Corpse            (2)
            "FOOD",      // ItemKind.Potato            (3)
            "SCRAP",     // ItemKind.Scrap             (4)
            "PARTS",     // ItemKind.Parts             (5)
            "CTRL MOD",  // ItemKind.ControllerModule  (6)
            "SEALS",     // ItemKind.Seals             (7 — E0-6)
            "ICE",       // ItemKind.Ice               (8 — E0-7)
            "SWARF",     // ItemKind.Swarf             (9 — wreck start salvage)
        };

        /// <summary>Position of <paramref name="kind"/> in <see cref="Kinds"/>, or -1 for a byte the
        /// sim does not declare. The ONE range predicate, so every guard below agrees by
        /// construction.</summary>
        private static int IndexOfKind(int kind)
        {
            for (int i = 0; i < Kinds.Length; i++) if (Kinds[i] == kind) return i;
            return -1;
        }

        /// <summary>True for a kind the sim actually has — a DECLARED byte. That is the same set as
        /// "below the member count" only while the enum is contiguous; against E0-7's development
        /// tree it was not (7 was below the count and did not exist, 8 was above it and did), and
        /// this predicate is what does not care either way.</summary>
        private static bool InRange(int kind) => IndexOfKind(kind) >= 0;

        /// <summary>Advance the kind cursor to the next DECLARED ItemKind, wrapping at the last.
        /// Wrapping on a count would let the player select a kind the sim has no name for the moment
        /// the enum gains a hole — as it had while E0-7 was built, where it also made Ice
        /// unreachable.</summary>
        public static int NextKind(int kind)
        {
            int at = IndexOfKind(kind);
            if (at < 0) return Kinds[0];             // cursor on a kind the sim dropped: restart
            return Kinds[(at + 1) % Kinds.Length];
        }

        /// <summary>True when <paramref name="mask"/> accepts <paramref name="kind"/>; false for any
        /// kind the sim does not have.</summary>
        public static bool Accepts(ulong mask, int kind) =>
            InRange(kind) && (mask & (1UL << kind)) != 0UL;

        /// <summary>
        /// Flip exactly one kind's bit; an out-of-range kind is a no-op.
        ///
        /// THE EXPLICIT RANGE CHECK IS LOAD-BEARING, and an earlier revision of this file claimed the
        /// opposite. The trailing <c>&amp; AcceptAllMask</c> alone does NOT make an out-of-range kind
        /// harmless, because <b>C# shift counts are reduced modulo the operand width</b> — for a
        /// <c>ulong</c> that is <c>&amp; 63</c>, so <c>1UL &lt;&lt; 64</c> is <c>1UL</c>, not 0, and
        /// <c>Toggle(0x7F, 64)</c> silently returned <c>0x7E</c> (measured): it flipped Regolith. The
        /// wrapped bit lands back INSIDE the valid range where the mask cannot remove it. Kinds 9-63
        /// are truncated, which is why the old claim looked true. Not a live bug — the only caller
        /// feeds a cursor <see cref="NextKind"/> keeps in range — but this type exists to be the
        /// auditable half of an untestable GameLoop, so it is total.
        /// </summary>
        public static ulong Toggle(ulong mask, int kind) =>
            InRange(kind) ? (mask ^ (1UL << kind)) & AcceptAllMask : mask & AcceptAllMask;

        /// <summary>The player-facing name of a kind, or "?" for a kind the sim does not have (the
        /// unguarded form returned the raw number, e.g. "64", which reads as a real kind).</summary>
        public static string KindName(int kind)
        {
            int at = IndexOfKind(kind);
            return at >= 0 && at < Labels.Length ? Labels[at] : "?";
        }

        /// <summary>The pending mask in words: ALL, NOTHING, or the accepted kind names — the same
        /// vocabulary and the same separator as the web client's <c>stockFilterLabel</c>. The TUI has
        /// no tint for a filtered tile (there is none anywhere — MECHANICS §13), so the status line
        /// is the only readback a TUI player gets.</summary>
        public static string Describe(ulong mask)
        {
            ulong m = mask & AcceptAllMask;
            if (m == AcceptAllMask) return "ALL";
            if (m == 0UL) return "NOTHING";
            var sb = new StringBuilder();
            for (int i = 0; i < Kinds.Length; i++)
            {
                if (!Accepts(m, Kinds[i])) continue;
                if (sb.Length > 0) sb.Append(" · ");
                sb.Append(KindName(Kinds[i]));
            }
            return sb.ToString();
        }
    }
}
