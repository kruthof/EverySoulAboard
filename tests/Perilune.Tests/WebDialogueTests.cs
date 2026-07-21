using Perilune.Web;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// W1 wire vocabulary: the dialogue (chat), crew identity (citizen) and device
    /// serializers, plus WebCommand.Parse for the "type"-keyed dialogue/MOSS commands.
    /// All asserted on the PURE serializer/parser — no sockets, no sim thread.
    /// </summary>
    public class WebDialogueTests
    {
        // ---------------------------------------------------------------- chat

        [Test]
        public void Chat_Start_Emits_Cid_And_Name_Only()
        {
            Assert.AreEqual(
                "{\"type\":\"chat\",\"sid\":7,\"ev\":\"start\",\"cid\":42,\"name\":\"Reyes\"}",
                WireFormat.ChatStart(7, 42, "Reyes"));
        }

        [Test]
        public void Chat_Delta_Emits_Seq_And_Text_Only()
        {
            Assert.AreEqual(
                "{\"type\":\"chat\",\"sid\":7,\"ev\":\"delta\",\"seq\":3,\"text\":\"hel\"}",
                WireFormat.ChatDelta(7, 3, "hel"));
        }

        [Test]
        public void Chat_Line_Emits_Who_And_Text_Only()
        {
            Assert.AreEqual(
                "{\"type\":\"chat\",\"sid\":7,\"ev\":\"line\",\"who\":\"crew\",\"text\":\"Understood.\"}",
                WireFormat.ChatLine(7, "crew", "Understood."));
        }

        [Test]
        public void Chat_Effect_Emits_Text_Only()
        {
            Assert.AreEqual(
                "{\"type\":\"chat\",\"sid\":7,\"ev\":\"effect\",\"text\":\"trust +3\"}",
                WireFormat.ChatEffect(7, "trust +3"));
        }

        [Test]
        public void Chat_End_Emits_Reason_Only()
        {
            Assert.AreEqual(
                "{\"type\":\"chat\",\"sid\":7,\"ev\":\"end\",\"reason\":\"unavailable\"}",
                WireFormat.ChatEnd(7, "unavailable"));
        }

        [Test]
        public void Chat_Escapes_Quotes_Newlines_And_Control_Chars()
        {
            // Quote, backslash, newline, tab, and a control char must all escape; a non-ASCII
            // unicode letter (>= 0x20) rides through as raw UTF-16 (host encodes UTF-8 on send).
            string s = WireFormat.ChatDelta(1, 0, "a\"b\\c\nd\te café");
            StringAssert.Contains("\\\"", s);
            StringAssert.Contains("\\\\", s);
            StringAssert.Contains("\\n", s);
            StringAssert.Contains("\\t", s);
            StringAssert.Contains("\\u0001", s);
            StringAssert.Contains("café", s, "printable unicode is not escaped");
        }

        // ---------------------------------------------------------------- citizen

        [Test]
        public void Citizen_Serializes_All_Fields_With_Trait_Array()
        {
            string s = WireFormat.Citizen(42, "Reyes", "hydroponics engineer", "wary",
                new[] { "sardonic", "devout" }, "1");
            Assert.AreEqual(
                "{\"type\":\"citizen\",\"cid\":42,\"name\":\"Reyes\",\"role\":\"hydroponics engineer\"," +
                "\"mood\":\"wary\",\"traits\":[\"sardonic\",\"devout\"],\"portrait\":\"1\"}",
                s);
        }

        [Test]
        public void Citizen_NameOnly_Fallback_Has_Empty_Traits_And_Portrait()
        {
            string s = WireFormat.Citizen(9, "Doe", "", "", System.Array.Empty<string>(), "");
            Assert.AreEqual(
                "{\"type\":\"citizen\",\"cid\":9,\"name\":\"Doe\",\"role\":\"\",\"mood\":\"\"," +
                "\"traits\":[],\"portrait\":\"\"}",
                s);
        }

        [Test]
        public void Citizen_Escapes_Name_And_Traits()
        {
            string s = WireFormat.Citizen(1, "O\"Neil\n", "r", "m", new[] { "wry\"" }, "p");
            StringAssert.Contains("\"name\":\"O\\\"Neil\\n\"", s);
            StringAssert.Contains("\"traits\":[\"wry\\\"\"]", s);
        }

        // ---------------------------------------------------------------- device

        [Test]
        public void Device_Serializes_Kind_And_Tid()
        {
            Assert.AreEqual(
                "{\"type\":\"device\",\"kind\":\"terminal\",\"tid\":\"hab1_term\"}",
                WireFormat.Device("terminal", "hab1_term"));
        }

        // ---------------------------------------------------------------- command parse

        [Test]
        public void Parse_Talk_Roundtrips_Cid()
        {
            var c = WebCommand.Parse("{\"type\":\"talk\",\"cid\":42}");
            Assert.AreEqual(CmdKind.Talk, c.Kind);
            Assert.AreEqual(42u, c.Cid);
        }

        [Test]
        public void Parse_Say_Roundtrips_Sid_And_Text()
        {
            var c = WebCommand.Parse("{\"type\":\"say\",\"sid\":7,\"text\":\"open the aft door\"}");
            Assert.AreEqual(CmdKind.Say, c.Kind);
            Assert.AreEqual(7, c.Sid);
            Assert.AreEqual("open the aft door", c.Text);
        }

        [Test]
        public void Parse_Say_Unescapes_Text()
        {
            var c = WebCommand.Parse("{\"type\":\"say\",\"sid\":1,\"text\":\"a\\\"b\\nc\"}");
            Assert.AreEqual("a\"b\nc", c.Text);
        }

        [Test]
        public void Parse_Bye_Roundtrips_Sid()
        {
            var c = WebCommand.Parse("{\"type\":\"bye\",\"sid\":3}");
            Assert.AreEqual(CmdKind.Bye, c.Kind);
            Assert.AreEqual(3, c.Sid);
        }

        [Test]
        public void Parse_ExistingCmd_Family_Still_Works()
        {
            var c = WebCommand.Parse("{\"cmd\":\"cursor\",\"x\":3,\"y\":4}");
            Assert.AreEqual(CmdKind.Cursor, c.Kind);
            Assert.AreEqual(3, c.X);
            Assert.AreEqual(4, c.Y);
        }

        [Test]
        public void Parse_UnknownType_Is_Ignored()
        {
            Assert.AreEqual(CmdKind.Unknown, WebCommand.Parse("{\"type\":\"wobble\",\"x\":1}").Kind);
            Assert.AreEqual(CmdKind.Unknown, WebCommand.Parse("{\"nonsense\":true}").Kind);
            Assert.AreEqual(CmdKind.Unknown, WebCommand.Parse("").Kind);
        }
    }
}
