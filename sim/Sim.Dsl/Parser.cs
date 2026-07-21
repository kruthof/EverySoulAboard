using System;
using System.Collections.Generic;

namespace Moonbase.Dsl
{
    /// <summary>
    /// Recursive-descent parser for MOSS v0. Recovers from errors (skip to end
    /// of line / end of indented block) so that the first error(s) carry correct
    /// 1-based line/col and parsing never throws or loops forever.
    ///
    /// Documented v0 choices:
    /// - 'every'/'when'/'alarm when' are top-level only; blocks may contain
    ///   command / if / let (nested 'if' works at any depth).
    /// - Duration literals (5s/2m/1h) are only legal directly after 'every'.
    /// - 'max'/'min' are only legal as a whole command argument (they pass
    ///   through as strings for the device to interpret); anywhere else in an
    ///   expression they are a compile error.
    /// - Device commands: verb(device[, args...]) or verb(device.prop, args...);
    ///   the .prop form passes the property name as the first string argument
    ///   to IScriptable.TryInvoke (e.g. set(pump1.rate, 50) => TryInvoke("set", ["rate", 50])).
    /// - 'alarm(msg)' and 'log(msg)' are terminal builtins taking exactly one argument.
    /// - Bare identifiers in expressions are 'let' variables; a name never
    ///   defined by any 'let' is a compile error.
    /// </summary>
    internal sealed class Parser
    {
        private readonly List<Token> _tokens;
        private readonly List<Diagnostic> _diags;
        private int _i;

        private readonly List<Stmt> _triggers = new List<Stmt>();
        private readonly List<EveryStmt> _everies = new List<EveryStmt>();
        private readonly List<Stmt> _bare = new List<Stmt>();
        private readonly Dictionary<string, int> _letSlots = new Dictionary<string, int>();
        private readonly List<VarExpr> _varRefs = new List<VarExpr>();
        private int _latchCount;
        private int _timerCount;
        private int _maxArgs;

        public Parser(List<Token> tokens, List<Diagnostic> diagnostics)
        {
            _tokens = tokens;
            _diags = diagnostics;
        }

        public CompiledScript ParseProgram()
        {
            while (true)
            {
                var t = Peek();
                if (t.Type == TokenType.EndOfFile) break;
                if (t.Type == TokenType.Newline || t.Type == TokenType.Dedent) { _i++; continue; }
                if (t.Type == TokenType.Indent)
                {
                    Error(t, "unexpected indent");
                    _i++;
                    SkipIndentedBlockBody();
                    continue;
                }
                int before = _i;
                ParseTopStmt();
                if (_i == before) _i++; // safety: always make progress
            }

            // Resolve bare identifiers against 'let' names.
            for (int i = 0; i < _varRefs.Count; i++)
            {
                var v = _varRefs[i];
                if (_letSlots.TryGetValue(v.Name, out int slot)) v.Slot = slot;
                else Error(v.Line, v.Col, "unknown identifier '" + v.Name
                    + "' (device values are read as name.property; variables need a 'let')");
            }

            bool hasErrors = false;
            for (int i = 0; i < _diags.Count; i++)
            {
                if (_diags[i].Severity == DiagnosticSeverity.Error) { hasErrors = true; break; }
            }

            return new CompiledScript(_triggers.ToArray(), _everies.ToArray(), _bare.ToArray(),
                _latchCount, _timerCount, _letSlots.Count, _maxArgs, _diags, hasErrors);
        }

        // ---------------- statements ----------------

        private void ParseTopStmt()
        {
            var t = Peek();
            switch (t.Type)
            {
                case TokenType.KwEvery:
                    ParseEvery();
                    break;
                case TokenType.KwWhen:
                    ParseWhen();
                    break;
                case TokenType.KwAlarm:
                    if (PeekAt(1).Type == TokenType.KwWhen) ParseAlarmWhen();
                    else ParseCommandLine(_bare);
                    break;
                case TokenType.KwIf:
                {
                    var s = ParseIf();
                    if (s != null) _bare.Add(s);
                    break;
                }
                case TokenType.KwLet:
                {
                    var s = ParseLet();
                    if (s != null) _bare.Add(s);
                    break;
                }
                case TokenType.Ident:
                    ParseCommandLine(_bare);
                    break;
                case TokenType.KwElse:
                    Error(t, "'else' without a matching 'if'");
                    RecoverStatement();
                    break;
                default:
                    Error(t, "unexpected " + Describe(t) + " — expected a statement");
                    RecoverStatement();
                    break;
            }
        }

        private void ParseEvery()
        {
            var et = Peek();
            _i++;
            var dt = Peek();
            long ticks = 0;
            bool ok = false;
            if (dt.Type == TokenType.Number &&
                (dt.Unit == MossUnit.Seconds || dt.Unit == MossUnit.Minutes || dt.Unit == MossUnit.Hours))
            {
                _i++;
                double seconds = dt.Number *
                    (dt.Unit == MossUnit.Seconds ? 1.0 : dt.Unit == MossUnit.Minutes ? 60.0 : 3600.0);
                ticks = (long)Math.Round(seconds * Moonbase.Sim.Simulation.TicksPerSecond);
                if (ticks <= 0) Error(dt, "duration must be at least one tick");
                else ok = true;
            }
            else
            {
                Error(dt, "expected a duration (like 5s, 2m or 1h) after 'every'");
                RecoverStatement();
                return;
            }

            Expect(TokenType.Colon, "expected ':' after the duration");
            var body = ParseBlock();
            if (ok) _everies.Add(new EveryStmt(et.Line, et.Col, ticks, body, _timerCount++));
        }

        private void ParseWhen()
        {
            var wt = Peek();
            _i++;
            var cond = ParseExpr();
            Expect(TokenType.Colon, "expected ':' after the 'when' condition");
            var body = ParseBlock();
            _triggers.Add(new WhenStmt(wt.Line, wt.Col, cond, body, _latchCount++));
        }

        private void ParseAlarmWhen()
        {
            var at = Peek();
            _i += 2; // 'alarm' 'when'
            var cond = ParseExpr();
            string message = "alarm";
            if (Peek().Type == TokenType.Comma)
            {
                _i++;
                var mt = Peek();
                if (mt.Type == TokenType.String) { _i++; message = mt.Text; }
                else Error(mt, "expected a message string after ','");
            }
            ExpectNewline();
            _triggers.Add(new AlarmWhenStmt(at.Line, at.Col, cond, message, _latchCount++));
        }

        private Stmt ParseIf()
        {
            var t = Peek();
            _i++;
            var cond = ParseExpr();
            Expect(TokenType.Colon, "expected ':' after the 'if' condition");
            var thenBody = ParseBlock();
            Stmt[] elseBody = null;
            if (Peek().Type == TokenType.KwElse)
            {
                _i++;
                Expect(TokenType.Colon, "expected ':' after 'else'");
                elseBody = ParseBlock();
            }
            return new IfStmt(t.Line, t.Col, cond, thenBody, elseBody);
        }

        private Stmt ParseLet()
        {
            var lt = Peek();
            _i++;
            var nt = Peek();
            if (nt.Type != TokenType.Ident)
            {
                Error(nt, "expected a variable name after 'let'");
                RecoverToLineEnd();
                return null;
            }
            _i++;
            Expect(TokenType.Assign, "expected '=' after the variable name");
            var value = ParseExpr();
            ExpectNewline();
            if (!_letSlots.TryGetValue(nt.Text, out int slot))
            {
                slot = _letSlots.Count;
                _letSlots.Add(nt.Text, slot);
            }
            return new LetStmt(lt.Line, lt.Col, nt.Text, slot, value);
        }

        /// <summary>An inline or indented block. Inline: command (";" command)* NEWLINE.</summary>
        private Stmt[] ParseBlock()
        {
            var list = new List<Stmt>(4);
            if (Peek().Type == TokenType.Newline)
            {
                _i++;
                if (Peek().Type != TokenType.Indent)
                {
                    Error(Peek(), "expected an indented block");
                    return list.ToArray();
                }
                _i++;
                while (true)
                {
                    var t = Peek();
                    if (t.Type == TokenType.Dedent) { _i++; break; }
                    if (t.Type == TokenType.EndOfFile) break;
                    if (t.Type == TokenType.Newline) { _i++; continue; }
                    int before = _i;
                    ParseBlockStmt(list);
                    if (_i == before) _i++; // safety
                }
            }
            else
            {
                ParseCommandLine(list);
            }
            return list.ToArray();
        }

        private void ParseBlockStmt(List<Stmt> into)
        {
            var t = Peek();
            switch (t.Type)
            {
                case TokenType.KwIf:
                {
                    var s = ParseIf();
                    if (s != null) into.Add(s);
                    break;
                }
                case TokenType.KwLet:
                {
                    var s = ParseLet();
                    if (s != null) into.Add(s);
                    break;
                }
                case TokenType.KwAlarm:
                    if (PeekAt(1).Type == TokenType.KwWhen)
                    {
                        Error(t, "'alarm when' is only allowed at the top level");
                        RecoverStatement();
                        break;
                    }
                    ParseCommandLine(into);
                    break;
                case TokenType.Ident:
                    ParseCommandLine(into);
                    break;
                case TokenType.KwEvery:
                case TokenType.KwWhen:
                    Error(t, "'" + t.Text + "' blocks are only allowed at the top level");
                    RecoverStatement();
                    break;
                default:
                    Error(t, "unexpected " + Describe(t) + " — expected a command, 'if' or 'let'");
                    RecoverStatement();
                    break;
            }
        }

        /// <summary>command (";" command)* NEWLINE, appending to <paramref name="into"/>.</summary>
        private void ParseCommandLine(List<Stmt> into)
        {
            while (true)
            {
                var c = ParseCommand();
                if (c != null) into.Add(c);
                if (Peek().Type == TokenType.Semicolon) { _i++; continue; }
                break;
            }
            ExpectNewline();
        }

        private CommandStmt ParseCommand()
        {
            var vt = Peek();
            string verb;
            if (vt.Type == TokenType.Ident) verb = vt.Text;
            else if (vt.Type == TokenType.KwAlarm) verb = "alarm";
            else
            {
                Error(vt, "expected a command name");
                return null;
            }
            _i++;
            Expect(TokenType.LParen, "expected '(' after command name");

            byte builtin = verb == "alarm" ? CommandStmt.BuiltinAlarm
                : verb == "log" ? CommandStmt.BuiltinLog
                : CommandStmt.BuiltinNone;
            string device = null;
            string property = null;
            var args = new List<Expr>(2);

            if (builtin != CommandStmt.BuiltinNone)
            {
                if (Peek().Type != TokenType.RParen)
                {
                    args.Add(ParseArg());
                    while (Peek().Type == TokenType.Comma) { _i++; args.Add(ParseArg()); }
                }
                if (args.Count != 1)
                    Error(vt, "'" + verb + "' expects exactly one argument");
            }
            else
            {
                var dt = Peek();
                if (dt.Type == TokenType.Ident)
                {
                    _i++;
                    device = dt.Text;
                    if (Peek().Type == TokenType.Dot)
                    {
                        _i++;
                        var pt = Peek();
                        if (pt.Type == TokenType.Ident) { _i++; property = pt.Text; }
                        else Error(pt, "expected a property name after '.'");
                    }
                }
                else
                {
                    Error(dt, "first argument of '" + verb + "' must be a device name");
                }
                while (Peek().Type == TokenType.Comma) { _i++; args.Add(ParseArg()); }
            }

            Expect(TokenType.RParen, "expected ')'");

            if (builtin == CommandStmt.BuiltinNone)
            {
                int slots = (property != null ? 1 : 0) + args.Count;
                if (slots > _maxArgs) _maxArgs = slots;
            }
            return new CommandStmt(vt.Line, vt.Col, verb, builtin, device, property, args.ToArray());
        }

        /// <summary>
        /// A command argument: 'max'/'min' as a whole argument pass through as
        /// strings for the device to interpret; otherwise a normal expression.
        /// </summary>
        private Expr ParseArg()
        {
            var t = Peek();
            if ((t.Type == TokenType.KwMax || t.Type == TokenType.KwMin))
            {
                var next = PeekAt(1).Type;
                if (next == TokenType.Comma || next == TokenType.RParen)
                {
                    _i++;
                    return new StringExpr(t.Line, t.Col, t.Type == TokenType.KwMax ? "max" : "min");
                }
            }
            return ParseExpr();
        }

        // ---------------- expressions ----------------

        private Expr ParseExpr() => ParseOr();

        private Expr ParseOr()
        {
            var left = ParseAnd();
            while (Peek().Type == TokenType.KwOr)
            {
                var t = Peek();
                _i++;
                left = new BinaryExpr(t.Line, t.Col, BinOp.Or, left, ParseAnd());
            }
            return left;
        }

        private Expr ParseAnd()
        {
            var left = ParseNot();
            while (Peek().Type == TokenType.KwAnd)
            {
                var t = Peek();
                _i++;
                left = new BinaryExpr(t.Line, t.Col, BinOp.And, left, ParseNot());
            }
            return left;
        }

        private Expr ParseNot()
        {
            if (Peek().Type == TokenType.KwNot)
            {
                var t = Peek();
                _i++;
                return new UnaryExpr(t.Line, t.Col, UnOp.Not, ParseNot());
            }
            return ParseComparison();
        }

        private Expr ParseComparison()
        {
            var left = ParseAdditive();
            while (true)
            {
                BinOp op;
                switch (Peek().Type)
                {
                    case TokenType.Lt: op = BinOp.Lt; break;
                    case TokenType.Le: op = BinOp.Le; break;
                    case TokenType.Gt: op = BinOp.Gt; break;
                    case TokenType.Ge: op = BinOp.Ge; break;
                    case TokenType.Eq: op = BinOp.Eq; break;
                    case TokenType.Ne: op = BinOp.Ne; break;
                    default: return left;
                }
                var t = Peek();
                _i++;
                left = new BinaryExpr(t.Line, t.Col, op, left, ParseAdditive());
            }
        }

        private Expr ParseAdditive()
        {
            var left = ParseMultiplicative();
            while (true)
            {
                var type = Peek().Type;
                if (type != TokenType.Plus && type != TokenType.Minus) return left;
                var t = Peek();
                _i++;
                left = new BinaryExpr(t.Line, t.Col, type == TokenType.Plus ? BinOp.Add : BinOp.Sub,
                    left, ParseMultiplicative());
            }
        }

        private Expr ParseMultiplicative()
        {
            var left = ParseUnary();
            while (true)
            {
                var type = Peek().Type;
                if (type != TokenType.Star && type != TokenType.Slash) return left;
                var t = Peek();
                _i++;
                left = new BinaryExpr(t.Line, t.Col, type == TokenType.Star ? BinOp.Mul : BinOp.Div,
                    left, ParseUnary());
            }
        }

        private Expr ParseUnary()
        {
            if (Peek().Type == TokenType.Minus)
            {
                var t = Peek();
                _i++;
                return new UnaryExpr(t.Line, t.Col, UnOp.Neg, ParseUnary());
            }
            return ParsePrimary();
        }

        private Expr ParsePrimary()
        {
            var t = Peek();
            switch (t.Type)
            {
                case TokenType.Number:
                    _i++;
                    if (t.Unit == MossUnit.Seconds || t.Unit == MossUnit.Minutes || t.Unit == MossUnit.Hours)
                        Error(t, "duration literals are only valid after 'every'");
                    return new NumberExpr(t.Line, t.Col, t.Number, t.Unit);

                case TokenType.String:
                    _i++;
                    return new StringExpr(t.Line, t.Col, t.Text);

                case TokenType.KwTrue:
                    _i++;
                    return new BoolExpr(t.Line, t.Col, true);

                case TokenType.KwFalse:
                    _i++;
                    return new BoolExpr(t.Line, t.Col, false);

                case TokenType.KwMax:
                case TokenType.KwMin:
                    _i++;
                    Error(t, "'" + t.Text + "' is only valid as a command argument");
                    return new NumberExpr(t.Line, t.Col, 0, MossUnit.None);

                case TokenType.Ident:
                {
                    _i++;
                    if (Peek().Type == TokenType.Dot)
                    {
                        _i++;
                        var pt = Peek();
                        if (pt.Type == TokenType.Ident)
                        {
                            _i++;
                            if (Peek().Type == TokenType.Dot)
                            {
                                Error(Peek(), "only one level of property access is supported");
                                while (Peek().Type == TokenType.Dot)
                                {
                                    _i++;
                                    if (Peek().Type == TokenType.Ident) _i++;
                                }
                            }
                            return new PropertyExpr(t.Line, t.Col, t.Text, pt.Text);
                        }
                        Error(pt, "expected a property name after '.'");
                        return new NumberExpr(t.Line, t.Col, 0, MossUnit.None);
                    }
                    var v = new VarExpr(t.Line, t.Col, t.Text);
                    _varRefs.Add(v);
                    return v;
                }

                case TokenType.LParen:
                {
                    _i++;
                    var e = ParseExpr();
                    Expect(TokenType.RParen, "expected ')'");
                    return e;
                }

                default:
                    Error(t, "unexpected " + Describe(t) + " in expression");
                    // Do not consume structural tokens; the statement level recovers.
                    return new NumberExpr(t.Line, t.Col, 0, MossUnit.None);
            }
        }

        // ---------------- plumbing ----------------

        private Token Peek() => _tokens[_i < _tokens.Count ? _i : _tokens.Count - 1];

        private Token PeekAt(int offset)
        {
            int j = _i + offset;
            return _tokens[j < _tokens.Count ? j : _tokens.Count - 1];
        }

        private bool Expect(TokenType type, string message)
        {
            if (Peek().Type == type) { _i++; return true; }
            Error(Peek(), message);
            return false;
        }

        private void ExpectNewline()
        {
            var t = Peek();
            if (t.Type == TokenType.Newline) { _i++; return; }
            if (t.Type == TokenType.EndOfFile || t.Type == TokenType.Dedent) return;
            Error(t, "unexpected " + Describe(t) + " — expected end of line");
            RecoverToLineEnd();
        }

        private void RecoverToLineEnd()
        {
            while (true)
            {
                var t = Peek();
                if (t.Type == TokenType.EndOfFile || t.Type == TokenType.Dedent) return;
                _i++;
                if (t.Type == TokenType.Newline) return;
            }
        }

        /// <summary>Call with the cursor just past an Indent token; consumes through the matching Dedent.</summary>
        private void SkipIndentedBlockBody()
        {
            int depth = 1;
            while (depth > 0)
            {
                var t = Peek();
                if (t.Type == TokenType.EndOfFile) return;
                _i++;
                if (t.Type == TokenType.Indent) depth++;
                else if (t.Type == TokenType.Dedent) depth--;
            }
        }

        private void RecoverStatement()
        {
            RecoverToLineEnd();
            if (Peek().Type == TokenType.Indent)
            {
                _i++;
                SkipIndentedBlockBody();
            }
        }

        private void Error(in Token t, string message) => Error(t.Line, t.Col, message);

        private void Error(int line, int col, string message) =>
            _diags.Add(new Diagnostic(line, col, message, DiagnosticSeverity.Error));

        private static string Describe(in Token t)
        {
            switch (t.Type)
            {
                case TokenType.Newline: return "end of line";
                case TokenType.Indent: return "indent";
                case TokenType.Dedent: return "end of block";
                case TokenType.EndOfFile: return "end of file";
                case TokenType.String: return "string \"" + t.Text + "\"";
                case TokenType.Number: return "number '" + t.Text + "'";
                default: return t.Text != null ? "'" + t.Text + "'" : t.Type.ToString();
            }
        }
    }
}
