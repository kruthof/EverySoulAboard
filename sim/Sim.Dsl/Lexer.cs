using System.Collections.Generic;
using System.Globalization;

namespace Moonbase.Dsl
{
    /// <summary>
    /// Hand-written lexer for MOSS. Produces a flat token list with Python-style
    /// Newline/Indent/Dedent layout tokens (indent: 1 column per space or tab —
    /// do not mix). Never throws: problems become diagnostics and the offending
    /// characters are skipped. Blank and comment-only lines produce no tokens.
    /// </summary>
    public static class Lexer
    {
        public static List<Token> Lex(string source, List<Diagnostic> diagnostics)
        {
            if (source == null) source = string.Empty;
            var tokens = new List<Token>(64);
            var indents = new List<int>(8) { 0 };
            int pos = 0;
            int line = 1;
            int n = source.Length;

            while (pos < n)
            {
                int lineStart = pos;

                // Measure indentation.
                int indent = 0;
                while (pos < n && (source[pos] == ' ' || source[pos] == '\t')) { pos++; indent++; }

                if (pos >= n) break;

                char c = source[pos];
                if (c == '\n' || c == '\r')
                {
                    pos = SkipEol(source, pos);
                    line++;
                    continue;
                }
                if (c == '#')
                {
                    while (pos < n && source[pos] != '\n' && source[pos] != '\r') pos++;
                    if (pos < n) { pos = SkipEol(source, pos); line++; }
                    continue;
                }

                // Layout tokens for this content line.
                int indentCol = indent + 1;
                if (indent > indents[indents.Count - 1])
                {
                    indents.Add(indent);
                    tokens.Add(new Token(TokenType.Indent, null, 0, MossUnit.None, line, indentCol));
                }
                else
                {
                    while (indents[indents.Count - 1] > indent)
                    {
                        indents.RemoveAt(indents.Count - 1);
                        tokens.Add(new Token(TokenType.Dedent, null, 0, MossUnit.None, line, indentCol));
                    }
                    if (indents[indents.Count - 1] != indent)
                    {
                        diagnostics.Add(new Diagnostic(line, indentCol, "inconsistent indentation", DiagnosticSeverity.Error));
                        // Recover: treat as a fresh (balanced) level so the parser stays sane.
                        indents.Add(indent);
                        tokens.Add(new Token(TokenType.Indent, null, 0, MossUnit.None, line, indentCol));
                    }
                }

                // Tokens until end of line.
                while (pos < n)
                {
                    c = source[pos];
                    if (c == '\n' || c == '\r') break;
                    if (c == ' ' || c == '\t') { pos++; continue; }
                    if (c == '#')
                    {
                        while (pos < n && source[pos] != '\n' && source[pos] != '\r') pos++;
                        break;
                    }

                    int col = pos - lineStart + 1;
                    if (IsIdentStart(c)) LexIdent(source, ref pos, line, col, tokens);
                    else if (c >= '0' && c <= '9') LexNumber(source, ref pos, line, col, tokens, diagnostics);
                    else if (c == '"') LexString(source, ref pos, line, col, tokens, diagnostics);
                    else LexSymbol(source, ref pos, line, col, tokens, diagnostics);
                }

                tokens.Add(new Token(TokenType.Newline, null, 0, MossUnit.None, line, pos - lineStart + 1));
                if (pos < n) { pos = SkipEol(source, pos); line++; }
            }

            for (int i = indents.Count - 1; i > 0; i--)
                tokens.Add(new Token(TokenType.Dedent, null, 0, MossUnit.None, line, 1));
            tokens.Add(new Token(TokenType.EndOfFile, null, 0, MossUnit.None, line, 1));
            return tokens;
        }

        private static int SkipEol(string s, int pos)
        {
            if (pos < s.Length && s[pos] == '\r') pos++;
            if (pos < s.Length && s[pos] == '\n') pos++;
            return pos;
        }

        private static bool IsIdentStart(char c) =>
            (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_';

        private static bool IsLetter(char c) =>
            (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

        private static bool IsDigit(char c) => c >= '0' && c <= '9';

        private static void LexIdent(string s, ref int pos, int line, int col, List<Token> tokens)
        {
            int start = pos;
            while (pos < s.Length && (IsIdentStart(s[pos]) || IsDigit(s[pos]))) pos++;
            string text = s.Substring(start, pos - start).ToLowerInvariant();
            TokenType type;
            switch (text)
            {
                case "every": type = TokenType.KwEvery; break;
                case "when": type = TokenType.KwWhen; break;
                case "alarm": type = TokenType.KwAlarm; break;
                case "if": type = TokenType.KwIf; break;
                case "else": type = TokenType.KwElse; break;
                case "let": type = TokenType.KwLet; break;
                case "and": type = TokenType.KwAnd; break;
                case "or": type = TokenType.KwOr; break;
                case "not": type = TokenType.KwNot; break;
                case "true": type = TokenType.KwTrue; break;
                case "false": type = TokenType.KwFalse; break;
                case "max": type = TokenType.KwMax; break;
                case "min": type = TokenType.KwMin; break;
                default: type = TokenType.Ident; break;
            }
            tokens.Add(new Token(type, text, 0, MossUnit.None, line, col));
        }

        private static void LexNumber(string s, ref int pos, int line, int col,
            List<Token> tokens, List<Diagnostic> diagnostics)
        {
            int n = s.Length;
            int start = pos;
            while (pos < n && IsDigit(s[pos])) pos++;
            if (pos < n && s[pos] == '.' && pos + 1 < n && IsDigit(s[pos + 1]))
            {
                pos++;
                while (pos < n && IsDigit(s[pos])) pos++;
            }
            int numEnd = pos;

            MossUnit unit = MossUnit.None;
            if (pos < n && s[pos] == '%')
            {
                unit = MossUnit.Percent;
                pos++;
            }
            else if (pos < n && IsLetter(s[pos]))
            {
                int suffixStart = pos;
                while (pos < n && IsLetter(s[pos])) pos++;
                string suffix = s.Substring(suffixStart, pos - suffixStart).ToLowerInvariant();
                switch (suffix)
                {
                    case "ppm": unit = MossUnit.Ppm; break;
                    case "kpa": unit = MossUnit.KPa; break;
                    case "c": unit = MossUnit.Celsius; break;
                    case "kw": unit = MossUnit.KiloWatt; break;
                    case "s": unit = MossUnit.Seconds; break;
                    case "m": unit = MossUnit.Minutes; break;
                    case "h": unit = MossUnit.Hours; break;
                    default:
                        diagnostics.Add(new Diagnostic(line, col + (suffixStart - start),
                            "unknown unit '" + suffix + "'", DiagnosticSeverity.Error));
                        break;
                }
            }

            string numText = s.Substring(start, numEnd - start);
            if (!double.TryParse(numText, NumberStyles.Float, CultureInfo.InvariantCulture, out double value))
            {
                diagnostics.Add(new Diagnostic(line, col, "invalid number '" + numText + "'", DiagnosticSeverity.Error));
                value = 0;
            }

            string lexeme = s.Substring(start, pos - start);
            tokens.Add(new Token(TokenType.Number, lexeme, value, unit, line, col));
        }

        private static void LexString(string s, ref int pos, int line, int col,
            List<Token> tokens, List<Diagnostic> diagnostics)
        {
            int n = s.Length;
            pos++; // opening quote
            int start = pos;
            while (pos < n && s[pos] != '"' && s[pos] != '\n' && s[pos] != '\r') pos++;
            string content = s.Substring(start, pos - start);
            if (pos < n && s[pos] == '"') pos++;
            else diagnostics.Add(new Diagnostic(line, col, "unterminated string", DiagnosticSeverity.Error));
            tokens.Add(new Token(TokenType.String, content, 0, MossUnit.None, line, col));
        }

        private static void LexSymbol(string s, ref int pos, int line, int col,
            List<Token> tokens, List<Diagnostic> diagnostics)
        {
            int n = s.Length;
            char c = s[pos];
            bool two = pos + 1 < n && s[pos + 1] == '=';
            switch (c)
            {
                case '(': tokens.Add(new Token(TokenType.LParen, "(", 0, MossUnit.None, line, col)); pos++; break;
                case ')': tokens.Add(new Token(TokenType.RParen, ")", 0, MossUnit.None, line, col)); pos++; break;
                case ':': tokens.Add(new Token(TokenType.Colon, ":", 0, MossUnit.None, line, col)); pos++; break;
                case ',': tokens.Add(new Token(TokenType.Comma, ",", 0, MossUnit.None, line, col)); pos++; break;
                case ';': tokens.Add(new Token(TokenType.Semicolon, ";", 0, MossUnit.None, line, col)); pos++; break;
                case '.': tokens.Add(new Token(TokenType.Dot, ".", 0, MossUnit.None, line, col)); pos++; break;
                case '+': tokens.Add(new Token(TokenType.Plus, "+", 0, MossUnit.None, line, col)); pos++; break;
                case '-': tokens.Add(new Token(TokenType.Minus, "-", 0, MossUnit.None, line, col)); pos++; break;
                case '*': tokens.Add(new Token(TokenType.Star, "*", 0, MossUnit.None, line, col)); pos++; break;
                case '/': tokens.Add(new Token(TokenType.Slash, "/", 0, MossUnit.None, line, col)); pos++; break;
                case '=':
                    if (two) { tokens.Add(new Token(TokenType.Eq, "==", 0, MossUnit.None, line, col)); pos += 2; }
                    else { tokens.Add(new Token(TokenType.Assign, "=", 0, MossUnit.None, line, col)); pos++; }
                    break;
                case '<':
                    if (two) { tokens.Add(new Token(TokenType.Le, "<=", 0, MossUnit.None, line, col)); pos += 2; }
                    else { tokens.Add(new Token(TokenType.Lt, "<", 0, MossUnit.None, line, col)); pos++; }
                    break;
                case '>':
                    if (two) { tokens.Add(new Token(TokenType.Ge, ">=", 0, MossUnit.None, line, col)); pos += 2; }
                    else { tokens.Add(new Token(TokenType.Gt, ">", 0, MossUnit.None, line, col)); pos++; }
                    break;
                case '!':
                    if (two) { tokens.Add(new Token(TokenType.Ne, "!=", 0, MossUnit.None, line, col)); pos += 2; }
                    else
                    {
                        diagnostics.Add(new Diagnostic(line, col, "unexpected character '!'", DiagnosticSeverity.Error));
                        pos++;
                    }
                    break;
                default:
                    diagnostics.Add(new Diagnostic(line, col, "unexpected character '" + c + "'", DiagnosticSeverity.Error));
                    pos++;
                    break;
            }
        }
    }
}
