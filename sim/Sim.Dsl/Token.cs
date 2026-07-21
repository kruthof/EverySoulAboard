namespace Perilune.Dsl
{
    public enum TokenType : byte
    {
        Number, String, Ident,
        KwEvery, KwWhen, KwAlarm, KwIf, KwElse, KwLet,
        KwAnd, KwOr, KwNot, KwTrue, KwFalse, KwMax, KwMin,
        LParen, RParen, Colon, Comma, Semicolon, Dot, Assign,
        Plus, Minus, Star, Slash,
        Lt, Le, Gt, Ge, Eq, Ne,
        Newline, Indent, Dedent, EndOfFile
    }

    /// <summary>
    /// Unit/duration suffix on a number literal. Units are metadata (the raw
    /// number is used in comparisons); Seconds/Minutes/Hours are only legal
    /// after 'every'.
    /// </summary>
    public enum MossUnit : byte { None, Percent, Ppm, KPa, Celsius, KiloWatt, Seconds, Minutes, Hours }

    /// <summary>
    /// One lexical token. Text holds the lexeme: lowercased for identifiers and
    /// keywords, raw (including suffix) for numbers, the decoded content for
    /// strings, the symbol itself for punctuation, null for layout tokens.
    /// </summary>
    public readonly struct Token
    {
        public readonly TokenType Type;
        public readonly string Text;
        public readonly double Number;   // valid for TokenType.Number
        public readonly MossUnit Unit;   // valid for TokenType.Number
        public readonly int Line, Col;   // 1-based

        public Token(TokenType type, string text, double number, MossUnit unit, int line, int col)
        {
            Type = type;
            Text = text;
            Number = number;
            Unit = unit;
            Line = line;
            Col = col;
        }

        public override string ToString() => Text != null ? Type + "(" + Text + ")" : Type.ToString();
    }
}
