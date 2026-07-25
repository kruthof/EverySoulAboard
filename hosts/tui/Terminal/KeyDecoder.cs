using System;

namespace Perilune.Tui.Terminal
{
    /// <summary>
    /// The semantic result of a keypress — the ONLY thing GameLoop switches on, so the
    /// key map lives in one pure, testable place (no Console coupling). New actions append.
    /// </summary>
    public enum InputAction
    {
        None = 0,

        CursorUp, CursorDown, CursorLeft, CursorRight,
        DeckUp, DeckDown,

        Lens1, Lens2, Lens3, Lens4, Lens5, Lens6, Lens7,

        Pause,
        SpeedUp, SpeedDown,

        Context,   // Enter / select — the default context action under the cursor
        Lock,      // Shift+Enter or L — lock/unlock a door
        Move,      // m — order the selected citizen to the cursor
        Dig,       // d — designate dig on debris
        Stockpile, // p — designate a stockpile tile
        Strip,     // v — designate deconstruct (strip a wall/device for salvage), E0-5
        Follow,    // c — keep the cursor on the selected citizen
        MossOpen,  // t — (A5) MOSS editor; today a one-line status

        Help,      // ?
        Cancel,    // Esc — deselect / close overlay
        Quit,      // q

        // E0-4 WP-5 — the TUI's stockpile accept-filter. APPENDED (the file's own rule), so no
        // existing member's ordinal moves. Two keys rather than one because the filter is a SET,
        // not a flag: 'i' walks the ItemKind cursor, 'I' accepts/rejects the kind under it. The
        // resulting pending mask rides along with the next 'p' designation.
        StockFilterKind,   // i — step the pending stockpile-filter kind cursor
        StockFilterToggle, // I — accept/reject that kind in the pending stockpile filter
    }

    /// <summary>
    /// Pure ConsoleKeyInfo → <see cref="InputAction"/> map. Arrows and vim hjkl move the
    /// cursor; digits 1-7 pick a lens; the letter commands mirror the DF idiom. Case
    /// matters in exactly TWO spots: lowercase 'l' is cursor-right (hjkl) vs uppercase 'L'
    /// door-lock, and lowercase 'i' steps the stockpile-filter kind vs uppercase 'I' toggles
    /// it (E0-4) — so we branch on KeyChar, not just ConsoleKey. Every other letter command
    /// accepts both cases. Unmapped keys return <see cref="InputAction.None"/>.
    ///
    /// Deck keys: R and '>' raise the deck (z+1, "up the stack"); F and '<' lower it
    /// (z-1). Speed: '+'/'=' faster, '-'/'_' slower.
    /// </summary>
    public static class KeyDecoder
    {
        public static InputAction Decode(ConsoleKeyInfo key)
        {
            // Structural keys first (independent of the character/locale).
            switch (key.Key)
            {
                case ConsoleKey.UpArrow: return InputAction.CursorUp;
                case ConsoleKey.DownArrow: return InputAction.CursorDown;
                case ConsoleKey.LeftArrow: return InputAction.CursorLeft;
                case ConsoleKey.RightArrow: return InputAction.CursorRight;
                case ConsoleKey.Escape: return InputAction.Cancel;
                case ConsoleKey.Spacebar: return InputAction.Pause;
                case ConsoleKey.Enter:
                    return (key.Modifiers & ConsoleModifiers.Shift) != 0
                        ? InputAction.Lock : InputAction.Context;
            }

            char c = key.KeyChar;
            switch (c)
            {
                // Cursor (vim). Lowercase only — 'L' is Lock below.
                case 'h': return InputAction.CursorLeft;
                case 'j': return InputAction.CursorDown;
                case 'k': return InputAction.CursorUp;
                case 'l': return InputAction.CursorRight;

                // Deck switch.
                case 'R': case 'r': case '>': return InputAction.DeckUp;
                case 'F': case 'f': case '<': return InputAction.DeckDown;

                // Lenses.
                case '1': return InputAction.Lens1;
                case '2': return InputAction.Lens2;
                case '3': return InputAction.Lens3;
                case '4': return InputAction.Lens4;
                case '5': return InputAction.Lens5;
                case '6': return InputAction.Lens6;
                case '7': return InputAction.Lens7;

                // Speed.
                case '+': case '=': return InputAction.SpeedUp;
                case '-': case '_': return InputAction.SpeedDown;

                // Commands.
                case 'L': return InputAction.Lock;
                case 'm': case 'M': return InputAction.Move;
                case 'd': case 'D': return InputAction.Dig;
                case 'p': case 'P': return InputAction.Stockpile;
                case 'v': case 'V': return InputAction.Strip;   // E0-5: salVage / strip
                // E0-4: case matters here exactly as it does for 'l'/'L' above — lowercase 'i'
                // steps the stockpile-filter kind cursor, uppercase 'I' toggles that kind.
                case 'i': return InputAction.StockFilterKind;
                case 'I': return InputAction.StockFilterToggle;
                case 'c': case 'C': return InputAction.Follow;
                case 't': case 'T': return InputAction.MossOpen;
                case 'q': case 'Q': return InputAction.Quit;
                case '?': return InputAction.Help;

                default: return InputAction.None;
            }
        }
    }
}
