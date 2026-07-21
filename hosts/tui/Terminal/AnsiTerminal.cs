using System;
using System.Text;

namespace Perilune.Tui.Terminal
{
    /// <summary>
    /// The real console behind <see cref="ITerminal"/>: alt-screen (ESC[?1049h/l), hidden
    /// cursor, Ctrl-C delivered as input, one Write per frame, UTF-8 output (frame content
    /// is pure ASCII, but the encoding is set so an accidental non-ASCII byte can't corrupt
    /// the stream).
    ///
    /// RESTORE IS GUARANTEED. <see cref="ExitRaw"/> is idempotent and wired to three
    /// escape hatches installed by <see cref="EnterRaw"/>: <see cref="Console.CancelKeyPress"/>
    /// (Ctrl-C), <see cref="AppDomain.ProcessExit"/>, and <see cref="AppDomain.UnhandledException"/>.
    /// Combined with the try/finally in GameLoop, no exit path — clean quit, signal, or
    /// crash — can leave the user's shell in the alt-screen/hidden-cursor state.
    /// </summary>
    public sealed class AnsiTerminal : ITerminal
    {
        private bool _raw;
        private bool _suspended;
        private bool _prevTreatCtrlC;
        private Encoding _prevOutEncoding;
        private ConsoleCancelEventHandler _cancelHandler;
        private EventHandler _processExit;
        private UnhandledExceptionEventHandler _unhandled;

        public int Width => SafeDim(() => Console.WindowWidth, 80);
        public int Height => SafeDim(() => Console.WindowHeight, 24);

        public bool TryReadKey(out ConsoleKeyInfo key)
        {
            if (Console.KeyAvailable)
            {
                key = Console.ReadKey(intercept: true);
                return true;
            }
            key = default;
            return false;
        }

        public void Write(string text) => Console.Out.Write(text);

        public void EnterRaw()
        {
            if (_raw) return;
            _raw = true;

            _prevOutEncoding = Console.OutputEncoding;
            try { Console.OutputEncoding = new UTF8Encoding(false); } catch { /* some hosts refuse */ }

            _prevTreatCtrlC = Console.TreatControlCAsInput;
            try { Console.TreatControlCAsInput = true; } catch { }

            // Safety nets — restore on Ctrl-C, normal exit, and unhandled crash.
            _cancelHandler = (s, e) => { e.Cancel = true; }; // deliver Ctrl-C as a key, not a kill
            _processExit = (s, e) => ExitRaw();
            _unhandled = (s, e) => ExitRaw();
            Console.CancelKeyPress += _cancelHandler;
            AppDomain.CurrentDomain.ProcessExit += _processExit;
            AppDomain.CurrentDomain.UnhandledException += _unhandled;

            Console.Out.Write(AnsiPaint.Esc + "[?1049h");  // enter alt screen
            Console.Out.Write(AnsiPaint.Esc + "[?25l");    // hide cursor
            Console.Out.Write(AnsiPaint.Esc + "[2J");      // clear
            Console.Out.Flush();
        }

        public void ExitRaw()
        {
            if (!_raw) return;
            _raw = false;
            _suspended = false;

            try
            {
                Console.Out.Write(AnsiPaint.Esc + "[0m");      // reset SGR
                Console.Out.Write(AnsiPaint.Esc + "[?25h");    // show cursor
                Console.Out.Write(AnsiPaint.Esc + "[?1049l");  // leave alt screen
                Console.Out.Flush();
            }
            catch { }

            try { Console.TreatControlCAsInput = _prevTreatCtrlC; } catch { }
            try { if (_prevOutEncoding != null) Console.OutputEncoding = _prevOutEncoding; } catch { }

            if (_cancelHandler != null) { Console.CancelKeyPress -= _cancelHandler; _cancelHandler = null; }
            if (_processExit != null) { AppDomain.CurrentDomain.ProcessExit -= _processExit; _processExit = null; }
            if (_unhandled != null) { AppDomain.CurrentDomain.UnhandledException -= _unhandled; _unhandled = null; }
        }

        public void Suspend()
        {
            if (!_raw || _suspended) return;
            _suspended = true;
            try
            {
                Console.Out.Write(AnsiPaint.Esc + "[0m");      // reset SGR
                Console.Out.Write(AnsiPaint.Esc + "[?25h");    // show cursor
                Console.Out.Write(AnsiPaint.Esc + "[?1049l");  // leave alt screen
                Console.Out.Flush();
            }
            catch { }
            // Cooked input so the child editor's own line discipline works; the crash-safe
            // hooks (Ctrl-C/exit/unhandled) stay installed so an editor-time crash still restores.
            try { Console.TreatControlCAsInput = _prevTreatCtrlC; } catch { }
        }

        public void Resume()
        {
            if (!_raw || !_suspended) return;
            _suspended = false;
            try { Console.TreatControlCAsInput = true; } catch { }
            try
            {
                Console.Out.Write(AnsiPaint.Esc + "[?1049h");  // re-enter alt screen
                Console.Out.Write(AnsiPaint.Esc + "[?25l");    // hide cursor
                Console.Out.Write(AnsiPaint.Esc + "[2J");      // clear (caller forces full repaint)
                Console.Out.Flush();
            }
            catch { }
        }

        private static int SafeDim(Func<int> read, int fallback)
        {
            try { int v = read(); return v > 0 ? v : fallback; }
            catch { return fallback; }
        }
    }
}
