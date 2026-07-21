using System;

namespace Perilune.Glyph
{
    /// <summary>
    /// A W×H grid of cells in one flat row-major array (index = y*Width + x), the render
    /// target of <see cref="GlyphMapper"/>. Reused across frames — allocate once, refill
    /// per projection. Origin (0,0) is the top-left; y increases downward like the world
    /// arrays, so a frame reads in the same orientation the sim scans.
    /// </summary>
    public sealed class GlyphBuffer
    {
        public readonly int Width, Height;
        private readonly GlyphCell[] _cells;

        public GlyphBuffer(int width, int height)
        {
            if (width <= 0 || height <= 0) throw new ArgumentOutOfRangeException();
            Width = width; Height = height;
            _cells = new GlyphCell[width * height];
        }

        public GlyphCell this[int x, int y]
        {
            get => _cells[y * Width + x];
            set => _cells[y * Width + x] = value;
        }

        public bool InBounds(int x, int y) => x >= 0 && x < Width && y >= 0 && y < Height;

        /// <summary>Overwrite every cell with <paramref name="cell"/>.</summary>
        public void Fill(GlyphCell cell)
        {
            for (int i = 0; i < _cells.Length; i++) _cells[i] = cell;
        }

        /// <summary>True if <paramref name="other"/> has the same size and identical cells.</summary>
        public bool ContentEquals(GlyphBuffer other)
        {
            if (other == null || other.Width != Width || other.Height != Height) return false;
            for (int i = 0; i < _cells.Length; i++)
                if (_cells[i] != other._cells[i]) return false;
            return true;
        }
    }
}
