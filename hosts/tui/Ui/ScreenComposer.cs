using System.Collections.Generic;
using System.Globalization;
using Moonbase.Glyph;
using Moonbase.Sim;

namespace Moonbase.Tui.Ui
{
    /// <summary>
    /// Everything the composer needs for one frame, gathered by GameLoop. Pure data — no
    /// sim handle — so a golden test can build a frame from fixed inputs.
    /// </summary>
    public sealed class HudModel
    {
        public GlyphBuffer Map;                       // one projected deck (from GlyphMapper)
        public ShipMetricsSnapshot Metrics;           // ShipMetrics.Compute snapshot (~1 Hz)
        public IReadOnlyList<string> Inspector = System.Array.Empty<string>();
        public IReadOnlyList<string> EventLog = System.Array.Empty<string>();  // oldest..newest
        public IReadOnlyList<string> Goals = System.Array.Empty<string>();

        public double Day;
        public string SpeedLabel = "1x";
        public int Deck;
        public int DeckCount = 1;
        public string LensLabel = "none";
        public string StatusMessage = "";             // transient hint (quit confirm, no-op feedback)

        // Active lens band key (from Sim.Glyph LensLegend.For). Empty for Lens.None, so the
        // legend NEVER appears in a none-lens frame — it lives in the sidebar only, never in
        // the map, so map-only --dump output is untouched.
        public IReadOnlyList<string> LensLegend = System.Array.Empty<string>();

        // When non-empty, drawn as a centered modal over the frame (help / confirm).
        public IReadOnlyList<string> Overlay = System.Array.Empty<string>();

        // When non-null, the MOSS terminal pane is open — drawn as a centered modal over the
        // frame (script source + compile diagnostics + a hint line). Part of the model so the
        // whole pane is golden-testable; the $EDITOR round-trip that fills it stays in GameLoop.
        public MossPaneModel Moss;
    }

    /// <summary>
    /// The MOSS pane's pure view state: which terminal, its current script source, the compile
    /// diagnostics to show, and a one-line key hint. Built by GameLoop (source from sim.Scripts,
    /// diagnostics from a pure MossCompiler.Compile — no SetProgram side effect until the user
    /// applies an edit), rendered by <see cref="ScreenComposer"/>.
    /// </summary>
    public sealed class MossPaneModel
    {
        public string TerminalId = "";
        public IReadOnlyList<string> SourceLines = System.Array.Empty<string>(); // "" when no script yet
        public IReadOnlyList<string> Diagnostics = System.Array.Empty<string>(); // formatted; "OK" line when clean
        public string Hint = "";
    }

    /// <summary>
    /// PURE full-screen composition: HudModel + terminal size → one screen-sized
    /// GlyphBuffer. No Console, no sim mutation — the whole frame is a value, which is why
    /// it is golden-testable byte-for-byte. Target layout 120×36; degrades to a map-only
    /// view when the sidebar can't fit (min 80×24). Every string is clipped/padded to its
    /// region so a line NEVER wraps and the body never scrolls horizontally.
    ///
    /// Layout (target):
    ///   cols 0..MapW-1   map (world width), col MapW = '|' separator, cols MapW+1.. sidebar
    ///   rows 0..MapH-1   map / sidebar
    ///   row  MapH        '-' rule
    ///   rows MapH+1..H-2 event log (left)   sidebar continues (right)
    ///   row  H-1         status bar (full width)
    /// </summary>
    public static class ScreenComposer
    {
        public const int MapW = 64;                 // fallback map width (the Perilune is 64 wide)
        private const int SidebarMinWidth = 24;     // below this the sidebar collapses

        public static GlyphBuffer Compose(HudModel m, int width, int height)
        {
            if (width < 1) width = 1;
            if (height < 1) height = 1;
            var buf = new GlyphBuffer(width, height);
            buf.Fill(new GlyphCell(' ', GlyphColor.Text, GlyphColor.Void));

            // Map region is the map's own width (clamped to the terminal); the hardcoded 64 is
            // only a fallback when there is no map, so a differently-sized world lays out right.
            int mapW = m.Map != null ? m.Map.Width : MapW;
            if (mapW > width) mapW = width;
            int sidebarX = mapW + 1;                        // col mapW is the separator
            int sidebarW = width - sidebarX;
            bool sidebar = sidebarW >= SidebarMinWidth;

            int statusRow = height - 1;
            int mapH = m.Map != null ? m.Map.Height : 0;
            if (mapH > statusRow) mapH = statusRow;         // keep a status row
            if (mapH < 0) mapH = 0;

            // --- Map (left). ---
            if (m.Map != null)
            {
                for (int y = 0; y < mapH; y++)
                    for (int x = 0; x < mapW && x < m.Map.Width; x++)
                        buf[x, y] = m.Map[x, y];
            }

            // --- Vertical separator + sidebar (right). ---
            if (sidebar)
            {
                for (int y = 0; y < statusRow; y++)
                    buf[mapW, y] = new GlyphCell('|', GlyphColor.Wall, GlyphColor.Void);
                ComposeSidebar(buf, m, sidebarX, sidebarW, statusRow);
            }

            // --- Horizontal rule + event log (left, below the map). ---
            int ruleRow = mapH;
            if (ruleRow < statusRow)
            {
                for (int x = 0; x < mapW; x++)
                    buf[x, ruleRow] = new GlyphCell('-', GlyphColor.Wall, GlyphColor.Void);

                int logTop = ruleRow + 1;
                int logRows = statusRow - logTop;
                ComposeEventLog(buf, m, logTop, logRows, mapW, !sidebar);
            }

            // --- Status bar (full width). ---
            ComposeStatusBar(buf, m, statusRow, width);

            // --- Modal overlay (help / confirm) drawn last, over everything. ---
            if (m.Overlay != null && m.Overlay.Count > 0)
                ComposeOverlay(buf, m.Overlay, width, height);

            // --- MOSS pane drawn on the very top when open (the focused modal). ---
            if (m.Moss != null)
                ComposeMossPane(buf, m.Moss, width, height);

            return buf;
        }

        private static void ComposeSidebar(GlyphBuffer buf, HudModel m, int x, int w, int statusRow)
        {
            int right = x + w - 1;
            var ic = CultureInfo.InvariantCulture;
            int y = 0;

            Blit(buf, x, y++, "SHIP  Day " + m.Day.ToString("0.00", ic), right, GlyphColor.Accent);
            y = Bar(buf, x, y, right, "PWR ", m.Metrics.Power);
            y = Bar(buf, x, y, right, "O2  ", m.Metrics.Oxygen);
            Blit(buf, x, y++, "CO2  " + m.Metrics.Co2Ppm.ToString("0", ic) + " ppm", right, GlyphColor.Text);
            y = Bar(buf, x, y, right, "H2O ", m.Metrics.Water);
            y = Bar(buf, x, y, right, "FOOD", m.Metrics.Food);
            y = Bar(buf, x, y, right, "HEAT", m.Metrics.Heat);
            y = Bar(buf, x, y, right, "STRC", m.Metrics.Structural);
            y = Bar(buf, x, y, right, "MRL ", m.Metrics.Morale);

            // Lens band key — only when a lens is active (None ⇒ empty ⇒ nothing drawn).
            if (m.LensLegend != null && m.LensLegend.Count > 0)
            {
                y++;
                if (y < statusRow)
                {
                    Blit(buf, x, y++, "LENS", right, GlyphColor.Accent);
                    y = BlitBlock(buf, x, y, right, statusRow, m.LensLegend, GlyphColor.TextDim,
                                  maxLines: m.LensLegend.Count);
                }
            }

            y++;
            if (y < statusRow)
            {
                Blit(buf, x, y++, "GOALS", right, GlyphColor.Accent);
                y = BlitBlock(buf, x, y, right, statusRow, m.Goals, GlyphColor.Text, maxLines: 4);
            }

            y++;
            if (y < statusRow)
            {
                Blit(buf, x, y++, "INSPECT", right, GlyphColor.Accent);
                BlitBlock(buf, x, y, right, statusRow, m.Inspector, GlyphColor.Text, maxLines: statusRow - y);
            }
        }

        private static void ComposeEventLog(GlyphBuffer buf, HudModel m, int top, int rows, int width, bool prependInspector)
        {
            if (rows <= 0) return;
            int right = width - 1;
            int y = top;
            Blit(buf, 0, y++, "EVENT LOG", right, GlyphColor.Accent);

            // In collapsed (no-sidebar) mode the inspector rides at the top of this pane.
            if (prependInspector && m.Inspector != null)
                y = BlitBlock(buf, 0, y, right, top + rows, m.Inspector, GlyphColor.TextDim, maxLines: 4);

            int avail = top + rows - y;
            if (avail <= 0 || m.EventLog == null) return;

            // Show the newest tail that fits (log is oldest..newest).
            int count = m.EventLog.Count;
            int start = count > avail ? count - avail : 0;
            for (int i = start; i < count; i++)
                Blit(buf, 0, y++, m.EventLog[i], right, GlyphColor.TextDim);
        }

        private static void ComposeStatusBar(GlyphBuffer buf, HudModel m, int row, int width)
        {
            var ic = CultureInfo.InvariantCulture;
            string left = "Day " + m.Day.ToString("0.00", ic)
                        + " | " + m.SpeedLabel
                        + " | deck " + m.Deck.ToString(ic) + "/" + (m.DeckCount - 1).ToString(ic)
                        + " | lens " + m.LensLabel;
            string help = "? help";
            string msg = m.StatusMessage ?? "";

            for (int x = 0; x < width; x++)
                buf[x, row] = new GlyphCell(' ', GlyphColor.Text, GlyphColor.Wall);
            Blit(buf, 0, row, left, width - 1, GlyphColor.Text, GlyphColor.Wall);
            if (msg.Length > 0)
            {
                int mx = left.Length + 2;
                Blit(buf, mx, row, msg, width - 1, GlyphColor.Accent, GlyphColor.Wall);
            }
            int hx = width - help.Length;
            if (hx > 0) Blit(buf, hx, row, help, width - 1, GlyphColor.TextDim, GlyphColor.Wall);
        }

        private static void ComposeOverlay(GlyphBuffer buf, IReadOnlyList<string> lines, int width, int height)
        {
            int boxW = 0;
            for (int i = 0; i < lines.Count; i++) if (lines[i].Length > boxW) boxW = lines[i].Length;
            boxW += 4;
            int boxH = lines.Count + 2;
            if (boxW > width) boxW = width;
            if (boxH > height) boxH = height;
            int ox = (width - boxW) / 2;
            int oy = (height - boxH) / 2;
            if (ox < 0) ox = 0; if (oy < 0) oy = 0;

            for (int y = 0; y < boxH; y++)
            {
                for (int x = 0; x < boxW; x++)
                {
                    char ch = ' ';
                    bool border = y == 0 || y == boxH - 1 || x == 0 || x == boxW - 1;
                    if (border) ch = (y == 0 || y == boxH - 1) ? '-' : '|';
                    if (border && (x == 0 || x == boxW - 1) && (y == 0 || y == boxH - 1)) ch = '+';
                    buf[ox + x, oy + y] = new GlyphCell(ch, GlyphColor.Accent, GlyphColor.Void);
                }
            }
            for (int i = 0; i < lines.Count; i++)
                Blit(buf, ox + 2, oy + 1 + i, lines[i], ox + boxW - 2, GlyphColor.Text, GlyphColor.Void);
        }

        /// <summary>
        /// The MOSS terminal pane: a centered bordered box with a title row, the script source
        /// (line-numbered), a compile-diagnostics block, and a key hint — sections split by rule
        /// rows. Pure: every glyph comes from <paramref name="m"/>, so the whole pane is golden-
        /// testable. Null body entries render as a horizontal rule (section separators).
        /// </summary>
        private static void ComposeMossPane(GlyphBuffer buf, MossPaneModel m, int width, int height)
        {
            var ic = CultureInfo.InvariantCulture;

            var body = new List<string>();
            body.Add("MOSS  " + (m.TerminalId ?? ""));
            body.Add(null); // rule
            if (m.SourceLines == null || m.SourceLines.Count == 0)
                body.Add("  (no script yet — press e to create one)");
            else
                for (int i = 0; i < m.SourceLines.Count; i++)
                    body.Add((i + 1).ToString(ic).PadLeft(3) + "| " + m.SourceLines[i]);
            body.Add(null); // rule
            if (m.Diagnostics != null)
                for (int i = 0; i < m.Diagnostics.Count; i++) body.Add(m.Diagnostics[i]);
            body.Add(null); // rule
            body.Add(m.Hint ?? "");

            int inner = 24;
            for (int i = 0; i < body.Count; i++)
                if (body[i] != null && body[i].Length > inner) inner = body[i].Length;
            int boxW = inner + 4;                 // border + one pad column each side
            if (boxW > width) boxW = width;
            int boxH = body.Count + 2;
            if (boxH > height) boxH = height;

            int ox = (width - boxW) / 2; if (ox < 0) ox = 0;
            int oy = (height - boxH) / 2; if (oy < 0) oy = 0;

            for (int row = 0; row < boxH; row++)
            {
                int by = oy + row;
                bool topBottom = row == 0 || row == boxH - 1;
                for (int col = 0; col < boxW; col++)
                {
                    bool leftRight = col == 0 || col == boxW - 1;
                    char ch = topBottom && leftRight ? '+' : topBottom ? '-' : leftRight ? '|' : ' ';
                    buf[ox + col, by] = new GlyphCell(ch, GlyphColor.Accent, GlyphColor.Void);
                }
                if (topBottom) continue;

                int bi = row - 1;
                if (bi < 0 || bi >= body.Count) continue;
                if (body[bi] == null)
                {
                    for (int col = 1; col < boxW - 1; col++)
                        buf[ox + col, by] = new GlyphCell('-', GlyphColor.Wall, GlyphColor.Void);
                }
                else
                {
                    var fg = bi == 0 ? GlyphColor.Accent : GlyphColor.Text;
                    Blit(buf, ox + 2, by, body[bi], ox + boxW - 2, fg, GlyphColor.Void);
                }
            }
        }

        // -------------------------------------------------------------- draw helpers

        /// <summary>Draw a "#/-" bar row: "LABL |####----| 0.82". Returns the next y.</summary>
        private static int Bar(GlyphBuffer buf, int x, int y, int right, string label, float frac)
        {
            if (frac < 0f) frac = 0f; if (frac > 1f) frac = 1f;
            const int cells = 10;
            int filled = (int)(frac * cells + 0.5f);
            var sb = new System.Text.StringBuilder(label.Length + cells + 8);
            sb.Append(label).Append('|');
            for (int i = 0; i < cells; i++) sb.Append(i < filled ? '#' : '-');
            sb.Append('|').Append(' ').Append(frac.ToString("0.00", CultureInfo.InvariantCulture));
            Blit(buf, x, y, sb.ToString(), right, GlyphColor.Text);
            return y + 1;
        }

        /// <summary>Blit a block of lines within [y, bottom); returns the next free y.</summary>
        private static int BlitBlock(GlyphBuffer buf, int x, int y, int right, int bottom,
                                     IReadOnlyList<string> lines, GlyphColor fg, int maxLines)
        {
            if (lines == null) return y;
            int drawn = 0;
            for (int i = 0; i < lines.Count && y < bottom && drawn < maxLines; i++, drawn++)
                Blit(buf, x, y++, lines[i], right, fg);
            return y;
        }

        /// <summary>Write <paramref name="text"/> at (x,y), clipped to the inclusive
        /// column <paramref name="right"/>. Cells outside the buffer are ignored.</summary>
        private static void Blit(GlyphBuffer buf, int x, int y, string text, int right,
                                 GlyphColor fg, GlyphColor bg = GlyphColor.Void)
        {
            if (y < 0 || y >= buf.Height || text == null) return;
            for (int i = 0; i < text.Length; i++)
            {
                int cx = x + i;
                if (cx < 0) continue;
                if (cx > right || cx >= buf.Width) break;
                buf[cx, y] = new GlyphCell(text[i], fg, bg);
            }
        }
    }
}
