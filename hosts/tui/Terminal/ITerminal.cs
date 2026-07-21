using System;

namespace Perilune.Tui.Terminal
{
    /// <summary>
    /// The terminal seam. Everything the interactive client needs from the outside world
    /// is behind this interface so <see cref="Perilune.Tui.GameLoop"/> can be driven by a
    /// real console (<see cref="AnsiTerminal"/>) or, in principle, a fake — though the
    /// pure UI (ScreenComposer / InspectorModel / KeyDecoder / AnsiPaint) is what the tests
    /// actually assert on, so no fake terminal ships. Resize is discovered by polling
    /// <see cref="Width"/>/<see cref="Height"/> once per frame (no SIGWINCH plumbing).
    /// </summary>
    public interface ITerminal
    {
        /// <summary>Current usable columns. Re-read every frame; a change means resize.</summary>
        int Width { get; }

        /// <summary>Current usable rows. Re-read every frame; a change means resize.</summary>
        int Height { get; }

        /// <summary>Non-blocking key read. Returns false when no key is buffered.</summary>
        bool TryReadKey(out ConsoleKeyInfo key);

        /// <summary>Emit a pre-composed string (one call per rendered frame).</summary>
        void Write(string text);

        /// <summary>Enter alt-screen + raw input (hide cursor, Ctrl-C as data). Idempotent.</summary>
        void EnterRaw();

        /// <summary>Restore the shell: leave alt-screen, show cursor, reset SGR. Idempotent
        /// and safe to call from a crash/exit hook. MUST be reachable on every exit path.</summary>
        void ExitRaw();

        /// <summary>Temporarily hand the terminal back to a child process (e.g. $EDITOR):
        /// leave alt-screen, show the cursor, restore cooked input — WITHOUT tearing down the
        /// crash-safe restore hooks. Paired with <see cref="Resume"/>. Idempotent.</summary>
        void Suspend();

        /// <summary>Re-take the terminal after a suspended child exits: re-enter alt-screen,
        /// hide the cursor, restore raw input. The caller must force a full repaint afterward
        /// (the child scribbled over the alt-screen buffer). Idempotent.</summary>
        void Resume();
    }
}
