using System.Globalization;
using System.Text;
using Perilune.Glyph;

namespace Perilune.Tui.Terminal
{
    /// <summary>
    /// The terminal skin's colour authority and frame differ — PURE (string in, string
    /// out; no Console), so the minimal-run emission is unit-testable.
    ///
    /// Palette: a moody sci-fi ANSI-256 scheme. Background stays near-black (233); the
    /// crew mint accent is #5FE8CB ≈ ANSI 122. Semantics, not decoration: hostile/broken
    /// read red, warnings amber, water cyan, growth/good green, and every "dim/unpowered"
    /// state drops to grey. Lens backgrounds are DARKENED tints so the room floor reads a
    /// gradient without drowning the foreground glyph.
    ///
    /// Diff: keep the previously painted buffer; emit only cells that changed, coalesced
    /// into row runs with the cursor moved once per run and an SGR sequence emitted only
    /// when the style actually changes. A null/size-mismatched prev (first frame, resize)
    /// forces a full clear+repaint.
    /// </summary>
    public static class AnsiPaint
    {
        public const string Esc = "\x1b";
        private const int DefaultBg = 233;   // near-black screen field

        /// <summary>Foreground ANSI-256 code for a semantic colour.</summary>
        public static int Fg(GlyphColor c)
        {
            switch (c)
            {
                case GlyphColor.Unknown: return 236;   // fog (glyph is blank anyway)
                case GlyphColor.Void: return 234;
                case GlyphColor.Floor: return 240;     // dim grey-blue floor
                case GlyphColor.Wall: return 246;       // steel
                case GlyphColor.Debris: return 137;     // dusty brown
                case GlyphColor.Crew: return 122;       // mint #5FE8CB
                case GlyphColor.Hostile: return 196;    // red
                case GlyphColor.Item: return 179;       // warm tan
                case GlyphColor.Device: return 109;     // soft steel-blue
                case GlyphColor.DeviceDim: return 240;  // unpowered grey
                case GlyphColor.Broken: return 160;     // deep red (broken / corpse)
                case GlyphColor.Locked: return 208;     // amber-orange
                case GlyphColor.Terminal: return 122;   // mint terminal glow
                case GlyphColor.Water: return 39;       // cyan
                case GlyphColor.Growth: return 40;      // green
                case GlyphColor.Designate: return 170;  // magenta order (dig)
                case GlyphColor.Stockpile: return 100;  // olive zone
                case GlyphColor.Deconstruct: return 166; // E0-5 strip: burnt orange (distinct from
                                                         // dig-magenta 170, Locked-amber 208, Item 179)
                case GlyphColor.LensGood: return 46;    // bright green
                case GlyphColor.LensOk: return 190;     // yellow-green
                case GlyphColor.LensWarn: return 214;   // amber
                case GlyphColor.LensBad: return 196;    // red
                case GlyphColor.LensCold: return 39;    // cyan pole
                case GlyphColor.LensHot: return 202;    // orange-red pole
                case GlyphColor.Accent: return 122;     // mint UI accent
                case GlyphColor.Text: return 253;       // near-white body text
                case GlyphColor.TextDim: return 245;    // secondary text
                default: return 253;
            }
        }

        /// <summary>Background ANSI-256 code. Most cells sit on the dark field; lens
        /// colours become darkened room tints.</summary>
        public static int Bg(GlyphColor c)
        {
            switch (c)
            {
                case GlyphColor.LensGood: return 22;    // dark green
                case GlyphColor.LensOk: return 58;      // dark olive
                case GlyphColor.LensWarn: return 94;    // dark amber
                case GlyphColor.LensBad: return 52;     // dark red
                case GlyphColor.LensCold: return 23;    // dark cyan
                case GlyphColor.LensHot: return 88;     // dark red-orange
                case GlyphColor.Wall: return 236;       // status/border strip
                default: return DefaultBg;
            }
        }

        /// <summary>The SGR (reset + attrs + fg + bg) for one cell.</summary>
        public static string Sgr(GlyphCell cell)
        {
            var sb = new StringBuilder(24);
            sb.Append(Esc).Append("[0");
            var attr = cell.Attr;
            if ((attr & GlyphAttr.Bold) != 0) sb.Append(";1");
            if ((attr & GlyphAttr.Dim) != 0) sb.Append(";2");
            if ((attr & GlyphAttr.Inverse) != 0) sb.Append(";7");
            sb.Append(";38;5;").Append(Fg(cell.Fg).ToString(CultureInfo.InvariantCulture));
            sb.Append(";48;5;").Append(Bg(cell.Bg).ToString(CultureInfo.InvariantCulture));
            sb.Append('m');
            return sb.ToString();
        }

        /// <summary>
        /// Emit the ANSI to turn a terminal showing <paramref name="prev"/> into one
        /// showing <paramref name="next"/>. prev == null (or a different size) ⇒ full
        /// clear + repaint. Returns "" when nothing changed.
        /// </summary>
        public static string Render(GlyphBuffer prev, GlyphBuffer next)
        {
            bool full = prev == null || prev.Width != next.Width || prev.Height != next.Height;
            var sb = new StringBuilder(full ? next.Width * next.Height + 64 : 256);
            if (full)
            {
                sb.Append(Esc).Append("[2J");   // clear screen
                sb.Append(Esc).Append("[H");    // home
            }

            string style = null;                // last SGR emitted this frame (cross-run)
            for (int y = 0; y < next.Height; y++)
            {
                int x = 0;
                while (x < next.Width)
                {
                    // Skip unchanged cells (in a diff frame).
                    if (!full && next[x, y] == prev[x, y]) { x++; continue; }

                    // Start of a run of cells to repaint on this row.
                    Move(sb, x, y);
                    while (x < next.Width && (full || next[x, y] != prev[x, y]))
                    {
                        var cell = next[x, y];
                        string s = Sgr(cell);
                        if (s != style) { sb.Append(s); style = s; }
                        sb.Append(cell.Glyph);
                        x++;
                    }
                }
            }

            if (sb.Length > 0) sb.Append(Esc).Append("[0m");
            return sb.ToString();
        }

        /// <summary>Move the cursor to (x,y), 0-based → ANSI 1-based CUP.</summary>
        private static void Move(StringBuilder sb, int x, int y)
        {
            sb.Append(Esc).Append('[')
              .Append((y + 1).ToString(CultureInfo.InvariantCulture)).Append(';')
              .Append((x + 1).ToString(CultureInfo.InvariantCulture)).Append('H');
        }
    }
}
