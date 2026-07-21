namespace Moonbase.Gen
{
    /// <summary>
    /// A mutable per-deck character raster in the AsciiWorld charset. Authored
    /// plans and generator stages carve rooms/corridors into a solid hull mass;
    /// everything not carved stays wall, so compartments can never leak by
    /// omission. Rects are inclusive on both corners.
    /// </summary>
    public sealed class GridCanvas
    {
        public readonly int Width, Height;
        private readonly char[] _cells;

        public GridCanvas(int width, int height, char fill)
        {
            Width = width;
            Height = height;
            _cells = new char[width * height];
            for (int i = 0; i < _cells.Length; i++) _cells[i] = fill;
        }

        public char Get(int x, int y) => _cells[y * Width + x];

        public void Set(int x, int y, char c) => _cells[y * Width + x] = c;

        public void FillRect(int x0, int y0, int x1, int y1, char c)
        {
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                    _cells[y * Width + x] = c;
        }

        /// <summary>Rows in AsciiWorld order (row index = y).</summary>
        public string[] ToRows()
        {
            var rows = new string[Height];
            for (int y = 0; y < Height; y++)
                rows[y] = new string(_cells, y * Width, Width);
            return rows;
        }
    }
}
