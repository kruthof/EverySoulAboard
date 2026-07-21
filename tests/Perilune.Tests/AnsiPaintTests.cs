using System;
using System.Collections.Generic;
using Perilune.Glyph;
using Perilune.Tui.Terminal;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// The frame differ is pure (prev,next)→ANSI, so its two guarantees are unit-testable
    /// without a terminal: a first/resized frame is a full clear+repaint; a one-cell change
    /// emits ONLY that cell (a single cursor move + glyph), touching nothing else.
    /// </summary>
    public class AnsiPaintTests
    {
        private static GlyphBuffer Filled(int w, int h, char c)
        {
            var b = new GlyphBuffer(w, h);
            b.Fill(new GlyphCell(c, GlyphColor.Text, GlyphColor.Void));
            return b;
        }

        [Test]
        public void NullPrev_Is_Full_Repaint()
        {
            var next = Filled(3, 2, 'a');
            string s = AnsiPaint.Render(null, next);
            StringAssert.Contains("\x1b[2J", s);   // clear screen
            StringAssert.Contains("\x1b[H", s);    // home
            StringAssert.EndsWith("\x1b[0m", s);   // reset at the end
            Assert.AreEqual(6, CountChar(s, 'a'), "every cell repainted");
        }

        [Test]
        public void SizeChange_Forces_Full_Repaint()
        {
            var prev = Filled(2, 2, 'a');
            var next = Filled(3, 3, 'b');
            string s = AnsiPaint.Render(prev, next);
            StringAssert.Contains("\x1b[2J", s);
            Assert.AreEqual(9, CountChar(s, 'b'));
        }

        [Test]
        public void NoChange_Emits_Nothing()
        {
            var prev = Filled(4, 3, 'a');
            var next = Filled(4, 3, 'a');
            Assert.AreEqual("", AnsiPaint.Render(prev, next));
        }

        [Test]
        public void SingleCell_Change_Is_Minimal()
        {
            var prev = Filled(4, 3, 'a');
            var next = Filled(4, 3, 'a');
            next[1, 1] = new GlyphCell('Z', GlyphColor.Hostile, GlyphColor.Void);

            string s = AnsiPaint.Render(prev, next);
            StringAssert.Contains("\x1b[2;2H", s);          // moved to row2,col2 (0-based 1,1)
            Assert.AreEqual(1, CountChar(s, 'Z'));
            Assert.AreEqual(0, CountChar(s, 'a'), "unchanged cells are never re-emitted");
            StringAssert.DoesNotContain("\x1b[2J", s);      // not a full repaint
        }

        private static int CountChar(string s, char c)
        {
            int n = 0;
            for (int i = 0; i < s.Length; i++) if (s[i] == c) n++;
            return n;
        }

        // The switch in AnsiPaint.Fg falls through to 253 (the Text code) for any unhandled
        // GlyphColor. If a new semantic colour is added to the enum but not given a palette
        // entry it would silently render as body-text grey — this catches that: every colour
        // must map to a code OTHER than the fall-through, except the few that legitimately use
        // it (whitelisted here on purpose).
        private static readonly HashSet<GlyphColor> DefaultFgOk = new HashSet<GlyphColor>
        {
            GlyphColor.Text,     // 253 IS the body-text colour — this is its real entry
        };

        [Test]
        public void EveryGlyphColor_HasAnExplicitFgPalette()
        {
            const int FallThrough = 253;
            foreach (GlyphColor c in Enum.GetValues(typeof(GlyphColor)))
            {
                int fg = AnsiPaint.Fg(c);
                if (fg == FallThrough)
                    Assert.IsTrue(DefaultFgOk.Contains(c),
                        $"{c} maps to the fall-through code {FallThrough} — add a palette entry in AnsiPaint.Fg (or whitelist it)");
            }
        }
    }
}
