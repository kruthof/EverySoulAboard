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
        /// <summary>How many <see cref="ItemKind"/>s exist. Textually first — <see cref="AcceptAllMask"/>
        /// reads it in its own initializer, and C# runs static field initializers in source order.</summary>
        public static readonly int KindCount = Enum.GetValues(typeof(ItemKind)).Length;

        /// <summary>Every kind accepted (0x7F today). DERIVED from the enum, never a literal, so it
        /// widens with <see cref="ItemKind"/> instead of silently covering a stale subset. The web
        /// host derives its own the same way — the two host projects share no assembly, and a derived
        /// value cannot drift where a copied literal would.</summary>
        public static readonly ulong AcceptAllMask = (1UL << KindCount) - 1UL;

        /// <summary>
        /// The PLAYER-FACING name of each kind, indexed by the ItemKind byte. Deliberately not
        /// <c>ItemKind.ToString()</c>: the two surfaces must speak ONE vocabulary, and the web
        /// palette says FOOD (the kind is "raw food", not one vegetable), ORE (it is the only ore)
        /// and CTRL MOD. A TUI that said "Potato" while the console said "FOOD" would be two names
        /// for one filter bit. Kept identical to <c>STOCK_KINDS</c> in
        /// <c>client/src/ui/stock-filter-model.js</c>, and <c>stock-filter-model.test.js</c> parses
        /// THIS array out of THIS file and compares it label-for-label so the two cannot drift.
        /// </summary>
        public static readonly string[] Labels =
        {
            "REGOLITH",  // ItemKind.Regolith
            "ORE",       // ItemKind.MetalOre
            "CORPSE",    // ItemKind.Corpse
            "FOOD",      // ItemKind.Potato
            "SCRAP",     // ItemKind.Scrap
            "PARTS",     // ItemKind.Parts
            "CTRL MOD",  // ItemKind.ControllerModule
            "SEALS",     // ItemKind.Seals (E0-6)
        };

        /// <summary>True for a kind the sim actually has. The ONE range predicate, so every guard
        /// below agrees by construction.</summary>
        private static bool InRange(int kind) => kind >= 0 && kind < KindCount;

        /// <summary>Advance the kind cursor, wrapping at the LAST REAL ItemKind. Wrapping at a
        /// literal would let the player select a kind the sim has no name for.</summary>
        public static int NextKind(int kind) => ((kind + 1) % KindCount + KindCount) % KindCount;

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
        /// wrapped bit lands back INSIDE the valid range where the mask cannot remove it. Kinds 7-63
        /// are truncated, which is why the old claim looked true. Not a live bug — the only caller
        /// feeds a cursor <see cref="NextKind"/> keeps in range — but this type exists to be the
        /// auditable half of an untestable GameLoop, so it is total.
        /// </summary>
        public static ulong Toggle(ulong mask, int kind) =>
            InRange(kind) ? (mask ^ (1UL << kind)) & AcceptAllMask : mask & AcceptAllMask;

        /// <summary>The player-facing name of a kind, or "?" for a kind the sim does not have (the
        /// unguarded form returned the raw number, e.g. "64", which reads as a real kind).</summary>
        public static string KindName(int kind) =>
            InRange(kind) && kind < Labels.Length ? Labels[kind] : "?";

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
            for (int k = 0; k < KindCount; k++)
            {
                if (!Accepts(m, k)) continue;
                if (sb.Length > 0) sb.Append(" · ");
                sb.Append(KindName(k));
            }
            return sb.ToString();
        }
    }
}
