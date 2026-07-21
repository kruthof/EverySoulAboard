using System.Text;

namespace Perilune.Glyph
{
    /// <summary>
    /// Deterministic text serialisation of a GlyphBuffer. ToText is the human/agent view
    /// (glyphs only); ToAnnotatedText is the golden format — four stacked planes (glyph,
    /// foreground, background, attribute) so a golden diff pins colour and attribute
    /// regressions the glyph plane alone would hide. Colours/attrs are encoded as a
    /// single base-36 character per cell (their enum value), keeping every plane the same
    /// shape as the map. '\n' only; no culture-sensitive formatting anywhere.
    /// </summary>
    public static class GlyphFrame
    {
        /// <summary>Rows of glyphs, '\n'-separated (no trailing newline).</summary>
        public static string ToText(GlyphBuffer buffer)
        {
            var sb = new StringBuilder(buffer.Height * (buffer.Width + 1));
            for (int y = 0; y < buffer.Height; y++)
            {
                if (y > 0) sb.Append('\n');
                for (int x = 0; x < buffer.Width; x++) sb.Append(buffer[x, y].Glyph);
            }
            return sb.ToString();
        }

        /// <summary>
        /// Glyph plane, blank line, foreground plane, blank line, background plane, blank
        /// line, attribute plane. Each plane is one printable char per cell.
        /// </summary>
        public static string ToAnnotatedText(GlyphBuffer buffer)
        {
            var sb = new StringBuilder();
            AppendPlane(sb, buffer, Plane.Glyph);
            sb.Append('\n').Append('\n');
            AppendPlane(sb, buffer, Plane.Fg);
            sb.Append('\n').Append('\n');
            AppendPlane(sb, buffer, Plane.Bg);
            sb.Append('\n').Append('\n');
            AppendPlane(sb, buffer, Plane.Attr);
            return sb.ToString();
        }

        private enum Plane { Glyph, Fg, Bg, Attr }

        private static void AppendPlane(StringBuilder sb, GlyphBuffer buffer, Plane plane)
        {
            for (int y = 0; y < buffer.Height; y++)
            {
                if (y > 0) sb.Append('\n');
                for (int x = 0; x < buffer.Width; x++)
                {
                    var cell = buffer[x, y];
                    switch (plane)
                    {
                        case Plane.Glyph: sb.Append(cell.Glyph); break;
                        case Plane.Fg: sb.Append(Base36((int)cell.Fg)); break;
                        case Plane.Bg: sb.Append(Base36((int)cell.Bg)); break;
                        default: sb.Append(Base36((int)cell.Attr)); break;
                    }
                }
            }
        }

        /// <summary>0-9 then a-z; a stable single-char token for enum values 0..35.</summary>
        private static char Base36(int value) =>
            (char)(value < 10 ? '0' + value : 'a' + (value - 10));
    }
}
