using System;

namespace Perilune.Glyph
{
    /// <summary>
    /// One character cell: the glyph plus its semantic foreground/background colour ids
    /// and attribute flags. A value type with structural equality — two buffers compare
    /// cell-by-cell for the determinism twin check.
    /// </summary>
    public readonly struct GlyphCell : IEquatable<GlyphCell>
    {
        public readonly char Glyph;
        public readonly GlyphColor Fg;
        public readonly GlyphColor Bg;
        public readonly GlyphAttr Attr;

        public GlyphCell(char glyph, GlyphColor fg, GlyphColor bg, GlyphAttr attr = GlyphAttr.None)
        {
            Glyph = glyph; Fg = fg; Bg = bg; Attr = attr;
        }

        /// <summary>The empty/fog cell: a blank glyph coloured Unknown.</summary>
        public static readonly GlyphCell Blank = new GlyphCell(' ', GlyphColor.Unknown, GlyphColor.Unknown);

        public GlyphCell WithAttr(GlyphAttr attr) => new GlyphCell(Glyph, Fg, Bg, attr);

        public bool Equals(GlyphCell other) =>
            Glyph == other.Glyph && Fg == other.Fg && Bg == other.Bg && Attr == other.Attr;

        public override bool Equals(object obj) => obj is GlyphCell other && Equals(other);

        public override int GetHashCode() =>
            Glyph ^ ((int)Fg << 8) ^ ((int)Bg << 16) ^ ((int)Attr << 24);

        public static bool operator ==(GlyphCell a, GlyphCell b) => a.Equals(b);
        public static bool operator !=(GlyphCell a, GlyphCell b) => !a.Equals(b);
    }
}
