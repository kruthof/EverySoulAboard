using System;
using Perilune.Tui.Terminal;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// The key map is pure and the client's only input contract, so it gets a full table
    /// test — including the one case-sensitive collision (lowercase 'l' = cursor-right,
    /// uppercase 'L' = door-lock) and Shift+Enter = lock.
    /// </summary>
    public class KeyDecoderTests
    {
        private static ConsoleKeyInfo Ch(char c, ConsoleKey key = 0, bool shift = false) =>
            new ConsoleKeyInfo(c, key, shift, alt: false, control: false);

        private static ConsoleKeyInfo Key(ConsoleKey key, bool shift = false) =>
            new ConsoleKeyInfo('\0', key, shift, alt: false, control: false);

        [Test]
        public void Arrows_And_Hjkl_Move_Cursor()
        {
            Assert.AreEqual(InputAction.CursorUp, KeyDecoder.Decode(Key(ConsoleKey.UpArrow)));
            Assert.AreEqual(InputAction.CursorDown, KeyDecoder.Decode(Key(ConsoleKey.DownArrow)));
            Assert.AreEqual(InputAction.CursorLeft, KeyDecoder.Decode(Key(ConsoleKey.LeftArrow)));
            Assert.AreEqual(InputAction.CursorRight, KeyDecoder.Decode(Key(ConsoleKey.RightArrow)));

            Assert.AreEqual(InputAction.CursorLeft, KeyDecoder.Decode(Ch('h')));
            Assert.AreEqual(InputAction.CursorDown, KeyDecoder.Decode(Ch('j')));
            Assert.AreEqual(InputAction.CursorUp, KeyDecoder.Decode(Ch('k')));
            Assert.AreEqual(InputAction.CursorRight, KeyDecoder.Decode(Ch('l')));
        }

        [Test]
        public void Lowercase_L_Is_Right_Uppercase_L_Is_Lock()
        {
            Assert.AreEqual(InputAction.CursorRight, KeyDecoder.Decode(Ch('l')));
            Assert.AreEqual(InputAction.Lock, KeyDecoder.Decode(Ch('L', shift: true)));
        }

        [Test]
        public void Enter_Is_Context_ShiftEnter_Is_Lock()
        {
            Assert.AreEqual(InputAction.Context, KeyDecoder.Decode(Key(ConsoleKey.Enter)));
            Assert.AreEqual(InputAction.Lock, KeyDecoder.Decode(Key(ConsoleKey.Enter, shift: true)));
        }

        [Test]
        public void Decks_And_Lenses_And_Speed()
        {
            Assert.AreEqual(InputAction.DeckUp, KeyDecoder.Decode(Ch('R')));
            Assert.AreEqual(InputAction.DeckUp, KeyDecoder.Decode(Ch('>')));
            Assert.AreEqual(InputAction.DeckDown, KeyDecoder.Decode(Ch('F')));
            Assert.AreEqual(InputAction.DeckDown, KeyDecoder.Decode(Ch('<')));

            Assert.AreEqual(InputAction.Lens1, KeyDecoder.Decode(Ch('1')));
            Assert.AreEqual(InputAction.Lens7, KeyDecoder.Decode(Ch('7')));

            Assert.AreEqual(InputAction.SpeedUp, KeyDecoder.Decode(Ch('+')));
            Assert.AreEqual(InputAction.SpeedUp, KeyDecoder.Decode(Ch('=')));
            Assert.AreEqual(InputAction.SpeedDown, KeyDecoder.Decode(Ch('-')));
            Assert.AreEqual(InputAction.Pause, KeyDecoder.Decode(Key(ConsoleKey.Spacebar)));
        }

        [Test]
        public void Command_Letters()
        {
            Assert.AreEqual(InputAction.Move, KeyDecoder.Decode(Ch('m')));
            Assert.AreEqual(InputAction.Dig, KeyDecoder.Decode(Ch('d')));
            Assert.AreEqual(InputAction.Stockpile, KeyDecoder.Decode(Ch('p')));
            Assert.AreEqual(InputAction.Follow, KeyDecoder.Decode(Ch('c')));
            Assert.AreEqual(InputAction.MossOpen, KeyDecoder.Decode(Ch('t')));
            Assert.AreEqual(InputAction.Help, KeyDecoder.Decode(Ch('?')));
            Assert.AreEqual(InputAction.Quit, KeyDecoder.Decode(Ch('q')));
            Assert.AreEqual(InputAction.Cancel, KeyDecoder.Decode(Key(ConsoleKey.Escape)));
        }

        [Test]
        public void Unmapped_Is_None()
        {
            Assert.AreEqual(InputAction.None, KeyDecoder.Decode(Ch('z')));
            Assert.AreEqual(InputAction.None, KeyDecoder.Decode(Ch('9')));
        }
    }
}
