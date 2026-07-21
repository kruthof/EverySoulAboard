using System;
using System.Collections.Generic;
using System.Text;
using Moonbase.Sim;

namespace Moonbase.Dsl
{
    internal static class MossLimits
    {
        public const int StepsPerProgram = 1000;
        public const int StepsGlobal = 50000;
    }

    /// <summary>Shared per-tick step counter across all programs (global budget).</summary>
    internal sealed class StepCounter
    {
        public int Value;
    }

    /// <summary>
    /// A MOSS runtime error. Permanent == true (budget overrun) halts the
    /// program until SetProgram is called again; otherwise the program is
    /// halted for the current tick only and re-runs next tick.
    /// Thrown only on error paths — steady-state ticking never throws.
    /// </summary>
    internal sealed class MossRuntimeException : Exception
    {
        public readonly bool Permanent;

        public MossRuntimeException(string message, bool permanent) : base(message)
        {
            Permanent = permanent;
        }
    }

    /// <summary>
    /// Tree-walking interpreter for one compiled program. All mutable state
    /// (edge latches, every-timers, 'let' slots, the argument buffer) is
    /// preallocated in the constructor — RunTick allocates nothing on the
    /// happy path. SetProgram creates a fresh Interpreter, which is what
    /// resets latches and timers.
    ///
    /// Documented v0 choices:
    /// - Tick phases: (1) when / alarm-when triggers, (2) every-blocks,
    ///   (3) top-level bare statements; each phase in source order.
    /// - 'let' variables reset every tick (cleared at the start of RunTick);
    ///   reading a variable before its 'let' ran this tick is a runtime error.
    /// - An 'every Ns' block first fires on the (N * TicksPerSecond)-th runtime
    ///   tick after (re)load, then every N*TicksPerSecond ticks.
    /// - Edge latches start false, so a condition already true on the first
    ///   tick fires immediately.
    /// - Every AST node visit costs one budget step.
    /// - Type errors (e.g. 'not' on a number, comparing bool to number) and
    ///   unknown devices/properties halt the program for this tick only.
    /// </summary>
    internal sealed class Interpreter
    {
        private readonly CompiledScript _script;
        private readonly DeviceRegistry _registry;
        private readonly string _terminalId;
        private readonly bool[] _latches;
        private readonly long[] _timers;
        private readonly DslValue[] _slots;
        private readonly bool[] _assigned;
        private readonly DslValue[] _argBuffer;
        private int _steps;
        private StepCounter _globalSteps;
        private EventBus _events;
        private long _tick;
        private MossAuditLog _audit;

        // Per-site audit text cache: the audit string for a command site is only
        // (re)built when that site's argument VALUES change, so a program issuing
        // the same command every tick allocates nothing in steady state (the ring
        // then stores the same string reference again). Keyed by AST node identity;
        // populated lazily on a site's first execution ("warmup").
        private readonly Dictionary<Stmt, AuditSite> _auditSites = new Dictionary<Stmt, AuditSite>();

        private sealed class AuditSite
        {
            public DslValue[] Args; // evaluated values Text was built from
            public int ArgCount;
            public string Text;     // null until first build
        }

        public Interpreter(CompiledScript script, DeviceRegistry registry, string terminalId)
        {
            _script = script;
            _registry = registry;
            _terminalId = terminalId;
            _latches = script.LatchCount > 0 ? new bool[script.LatchCount] : Array.Empty<bool>();
            _timers = script.TimerCount > 0 ? new long[script.TimerCount] : Array.Empty<long>();
            _slots = script.SlotCount > 0 ? new DslValue[script.SlotCount] : Array.Empty<DslValue>();
            _assigned = script.SlotCount > 0 ? new bool[script.SlotCount] : Array.Empty<bool>();
            _argBuffer = script.MaxDeviceArgs > 0 ? new DslValue[script.MaxDeviceArgs] : Array.Empty<DslValue>();
        }

        // ---------------- save/load trigger state ----------------
        // Canonical order (documented, relied on by ScriptRuntime.CaptureState):
        // latch i is the i-th 'when' / 'alarm when' in SOURCE order (the parser
        // assigns LatchIndex from one shared counter across both kinds); timer i
        // is the i-th 'every' block in source order (TimerIndex). The arrays below
        // are indexed by exactly those indices.

        internal int LatchCount => _latches.Length;
        internal int TimerCount => _timers.Length;
        internal bool GetLatch(int index) => _latches[index];
        internal long GetTimer(int index) => _timers[index];

        /// <summary>
        /// One-shot restore of edge latches and every-timers after load. Copies into
        /// the preallocated arrays — no per-tick cost afterwards. Lengths must match
        /// (ScriptRuntime verifies against the compiled script before calling).
        /// </summary>
        internal void RestoreTriggerState(bool[] latches, long[] timers)
        {
            Array.Copy(latches, _latches, _latches.Length);
            Array.Copy(timers, _timers, _timers.Length);
        }

        /// <summary>Runs one tick of the program. Throws MossRuntimeException on runtime errors.</summary>
        public void RunTick(EventBus events, StepCounter globalSteps, long tick, MossAuditLog audit)
        {
            _events = events;
            _globalSteps = globalSteps;
            _tick = tick;
            _audit = audit;
            _steps = 0;
            if (_assigned.Length > 0) Array.Clear(_assigned, 0, _assigned.Length);

            // Phase 1: edge-triggered when / alarm-when, in source order.
            var triggers = _script.Triggers;
            for (int i = 0; i < triggers.Length; i++)
            {
                Step();
                if (triggers[i] is WhenStmt w)
                {
                    bool cond = EvalBool(w.Condition);
                    bool old = _latches[w.LatchIndex];
                    _latches[w.LatchIndex] = cond;
                    if (cond && !old) ExecBlock(w.Body);
                }
                else
                {
                    var a = (AlarmWhenStmt)triggers[i];
                    bool cond = EvalBool(a.Condition);
                    bool old = _latches[a.LatchIndex];
                    _latches[a.LatchIndex] = cond;
                    if (cond && !old)
                    {
                        _events.Publish(new AlarmRaisedEvent { SourceId = _terminalId, Message = a.Message });
                        RecordAlarmWhenAudit(a);
                    }
                }
            }

            // Phase 2: every-blocks whose tick counter elapsed.
            var everies = _script.Everies;
            for (int i = 0; i < everies.Length; i++)
            {
                Step();
                var e = everies[i];
                long timer = _timers[e.TimerIndex] + 1;
                if (timer >= e.IntervalTicks)
                {
                    _timers[e.TimerIndex] = 0;
                    ExecBlock(e.Body);
                }
                else
                {
                    _timers[e.TimerIndex] = timer;
                }
            }

            // Phase 3: top-level bare statements — every tick.
            var bare = _script.Bare;
            for (int i = 0; i < bare.Length; i++) ExecStmt(bare[i]);
        }

        // ---------------- statements ----------------

        private void ExecBlock(Stmt[] body)
        {
            for (int i = 0; i < body.Length; i++) ExecStmt(body[i]);
        }

        private void ExecStmt(Stmt s)
        {
            Step();
            if (s is CommandStmt c)
            {
                ExecCommand(c);
            }
            else if (s is IfStmt f)
            {
                if (EvalBool(f.Condition)) ExecBlock(f.Then);
                else if (f.Else != null) ExecBlock(f.Else);
            }
            else if (s is LetStmt l)
            {
                _slots[l.Slot] = Eval(l.Value);
                _assigned[l.Slot] = true;
            }
            else
            {
                throw new MossRuntimeException("internal error: unexpected statement", false);
            }
        }

        private void ExecCommand(CommandStmt c)
        {
            if (c.Builtin != CommandStmt.BuiltinNone)
            {
                DslValue v = c.Args.Length > 0 ? Eval(c.Args[0]) : default;
                if (c.Builtin == CommandStmt.BuiltinAlarm)
                {
                    string message = v.Kind == DslKind.Str ? (v.Str ?? "") : v.ToString();
                    _events.Publish(new AlarmRaisedEvent { SourceId = _terminalId, Message = message });
                    RecordAlarmAudit(c, in v, message);
                }
                // log(...) is accepted and ignored in v0.
                return;
            }

            if (!_registry.TryResolve(c.TargetDevice, out var device))
                throw RuntimeError(c.Line, "unknown device '" + c.TargetDevice + "'");

            int n = 0;
            if (c.TargetProperty != null) _argBuffer[n++] = DslValue.Text(c.TargetProperty);
            var args = c.Args;
            for (int i = 0; i < args.Length; i++) _argBuffer[n++] = Eval(args[i]);

            if (!device.TryInvoke(c.Verb, _argBuffer, n, out string error))
                throw RuntimeError(c.Line, error ?? ("command '" + c.Verb + "' failed on '" + c.TargetDevice + "'"));

            RecordCommandAudit(c, n);
        }

        // ---------------- audit recording ----------------
        // Called only on action paths (a command actually executed, an alarm
        // actually fired) — ticks with no actions never touch the audit code.
        // Text formats: "open(door_lab)", "set(pump1.rate, 50)", "alarm: CO2 HIGH".

        private void RecordCommandAudit(CommandStmt c, int argCount)
        {
            var site = GetAuditSite(c, argCount);
            if (!SiteMatchesArgBuffer(site, argCount))
            {
                // (Re)build — allocates, but only on the site's first execution or
                // when its argument values changed since the last recording.
                var sb = new StringBuilder(48);
                sb.Append(c.Verb).Append('(').Append(c.TargetDevice);
                int first = 0;
                if (c.TargetProperty != null)
                {
                    sb.Append('.').Append(c.TargetProperty);
                    first = 1; // _argBuffer[0] is the property name — already printed
                }
                for (int i = first; i < argCount; i++)
                    sb.Append(", ").Append(_argBuffer[i].ToString());
                sb.Append(')');
                site.Text = sb.ToString();
                site.ArgCount = argCount;
                for (int i = 0; i < argCount; i++) site.Args[i] = _argBuffer[i];
            }
            _audit.Record(_tick, site.Text);
        }

        private void RecordAlarmAudit(CommandStmt c, in DslValue value, string message)
        {
            var site = GetAuditSite(c, 1);
            if (site.Text == null || !ValueEquals(in site.Args[0], in value))
            {
                site.Text = "alarm: " + message;
                site.ArgCount = 1;
                site.Args[0] = value;
            }
            _audit.Record(_tick, site.Text);
        }

        private void RecordAlarmWhenAudit(AlarmWhenStmt a)
        {
            var site = GetAuditSite(a, 0);
            if (site.Text == null) site.Text = "alarm: " + a.Message; // message is constant
            _audit.Record(_tick, site.Text);
        }

        private AuditSite GetAuditSite(Stmt key, int argCapacity)
        {
            if (!_auditSites.TryGetValue(key, out var site))
            {
                // argCapacity is fixed per site (property presence + Args.Length are
                // compile-time constants), so the array never needs to grow.
                site = new AuditSite { Args = argCapacity > 0 ? new DslValue[argCapacity] : Array.Empty<DslValue>() };
                _auditSites.Add(key, site);
            }
            return site;
        }

        private bool SiteMatchesArgBuffer(AuditSite site, int argCount)
        {
            if (site.Text == null || site.ArgCount != argCount) return false;
            for (int i = 0; i < argCount; i++)
                if (!ValueEquals(in site.Args[i], in _argBuffer[i])) return false;
            return true;
        }

        private static bool ValueEquals(in DslValue a, in DslValue b)
        {
            if (a.Kind != b.Kind) return false;
            switch (a.Kind)
            {
                case DslKind.Number: return a.Num.Equals(b.Num); // NaN-stable
                case DslKind.Bool: return a.Bool == b.Bool;
                default: return string.Equals(a.Str, b.Str, StringComparison.Ordinal);
            }
        }

        // ---------------- expressions ----------------

        private bool EvalBool(Expr e)
        {
            var v = Eval(e);
            if (v.Kind != DslKind.Bool)
                throw RuntimeError(e.Line, "condition must be true/false");
            return v.Bool;
        }

        private DslValue Eval(Expr e)
        {
            Step();
            if (e is NumberExpr num) return DslValue.Number(num.Value);
            if (e is PropertyExpr p)
            {
                if (!_registry.TryResolve(p.Device, out var device))
                    throw RuntimeError(e.Line, "unknown device '" + p.Device + "'");
                if (!device.TryGetProperty(p.Property, out var value))
                    throw RuntimeError(e.Line, "device '" + p.Device + "' has no property '" + p.Property + "'");
                return value;
            }
            if (e is BinaryExpr b) return EvalBinary(b);
            if (e is UnaryExpr u)
            {
                var v = Eval(u.Operand);
                if (u.Op == UnOp.Not)
                {
                    if (v.Kind != DslKind.Bool) throw RuntimeError(e.Line, "'not' needs a true/false value");
                    return DslValue.Boolean(!v.Bool);
                }
                if (v.Kind != DslKind.Number) throw RuntimeError(e.Line, "'-' needs a number");
                return DslValue.Number(-v.Num);
            }
            if (e is VarExpr vr)
            {
                if (vr.Slot >= 0 && _assigned[vr.Slot]) return _slots[vr.Slot];
                throw RuntimeError(e.Line, "variable '" + vr.Name + "' has no value yet this tick");
            }
            if (e is BoolExpr bl) return DslValue.Boolean(bl.Value);
            if (e is StringExpr s) return DslValue.Text(s.Value);
            throw new MossRuntimeException("internal error: unexpected expression", false);
        }

        private DslValue EvalBinary(BinaryExpr b)
        {
            // Short-circuit logical operators.
            if (b.Op == BinOp.And)
            {
                var l = Eval(b.Left);
                if (l.Kind != DslKind.Bool) throw RuntimeError(b.Line, "'and' needs true/false values");
                if (!l.Bool) return DslValue.Boolean(false);
                var r = Eval(b.Right);
                if (r.Kind != DslKind.Bool) throw RuntimeError(b.Line, "'and' needs true/false values");
                return DslValue.Boolean(r.Bool);
            }
            if (b.Op == BinOp.Or)
            {
                var l = Eval(b.Left);
                if (l.Kind != DslKind.Bool) throw RuntimeError(b.Line, "'or' needs true/false values");
                if (l.Bool) return DslValue.Boolean(true);
                var r = Eval(b.Right);
                if (r.Kind != DslKind.Bool) throw RuntimeError(b.Line, "'or' needs true/false values");
                return DslValue.Boolean(r.Bool);
            }

            var lv = Eval(b.Left);
            var rv = Eval(b.Right);
            switch (b.Op)
            {
                case BinOp.Eq:
                case BinOp.Ne:
                {
                    if (lv.Kind != rv.Kind)
                        throw RuntimeError(b.Line, "cannot compare values of different types");
                    bool eq;
                    if (lv.Kind == DslKind.Number) eq = lv.Num == rv.Num;
                    else if (lv.Kind == DslKind.Bool) eq = lv.Bool == rv.Bool;
                    else eq = string.Equals(lv.Str, rv.Str, StringComparison.Ordinal);
                    return DslValue.Boolean(b.Op == BinOp.Eq ? eq : !eq);
                }
                case BinOp.Lt: return DslValue.Boolean(NumOf(lv, b) < NumOf(rv, b));
                case BinOp.Le: return DslValue.Boolean(NumOf(lv, b) <= NumOf(rv, b));
                case BinOp.Gt: return DslValue.Boolean(NumOf(lv, b) > NumOf(rv, b));
                case BinOp.Ge: return DslValue.Boolean(NumOf(lv, b) >= NumOf(rv, b));
                case BinOp.Add: return DslValue.Number(NumOf(lv, b) + NumOf(rv, b));
                case BinOp.Sub: return DslValue.Number(NumOf(lv, b) - NumOf(rv, b));
                case BinOp.Mul: return DslValue.Number(NumOf(lv, b) * NumOf(rv, b));
                // Division by zero follows IEEE 754 (infinity/NaN) — no error.
                case BinOp.Div: return DslValue.Number(NumOf(lv, b) / NumOf(rv, b));
                default:
                    throw new MossRuntimeException("internal error: unexpected operator", false);
            }
        }

        private double NumOf(in DslValue v, BinaryExpr at)
        {
            if (v.Kind != DslKind.Number)
                throw RuntimeError(at.Line, "this operation needs numbers");
            return v.Num;
        }

        // ---------------- plumbing ----------------

        private void Step()
        {
            _steps++;
            _globalSteps.Value++;
            if (_steps > MossLimits.StepsPerProgram || _globalSteps.Value > MossLimits.StepsGlobal)
                throw new MossRuntimeException("BudgetExceeded", true);
        }

        private static MossRuntimeException RuntimeError(int line, string message) =>
            new MossRuntimeException("line " + line + ": " + message, false);
    }
}
