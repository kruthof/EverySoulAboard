namespace Moonbase.Dsl
{
    // AST nodes are allocated at compile time only; the interpreter walks them
    // without allocating. All classes are internal — the public surface is
    // CompiledScript / MossCompiler / ScriptRuntime.

    internal abstract class Stmt
    {
        public readonly int Line;
        public readonly int Col;
        protected Stmt(int line, int col) { Line = line; Col = col; }
    }

    internal sealed class EveryStmt : Stmt
    {
        public readonly long IntervalTicks; // duration * Simulation.TicksPerSecond
        public readonly Stmt[] Body;
        public readonly int TimerIndex;

        public EveryStmt(int line, int col, long intervalTicks, Stmt[] body, int timerIndex)
            : base(line, col)
        {
            IntervalTicks = intervalTicks;
            Body = body;
            TimerIndex = timerIndex;
        }
    }

    internal sealed class WhenStmt : Stmt
    {
        public readonly Expr Condition;
        public readonly Stmt[] Body;
        public readonly int LatchIndex;

        public WhenStmt(int line, int col, Expr condition, Stmt[] body, int latchIndex)
            : base(line, col)
        {
            Condition = condition;
            Body = body;
            LatchIndex = latchIndex;
        }
    }

    internal sealed class AlarmWhenStmt : Stmt
    {
        public readonly Expr Condition;
        public readonly string Message;
        public readonly int LatchIndex;

        public AlarmWhenStmt(int line, int col, Expr condition, string message, int latchIndex)
            : base(line, col)
        {
            Condition = condition;
            Message = message;
            LatchIndex = latchIndex;
        }
    }

    internal sealed class IfStmt : Stmt
    {
        public readonly Expr Condition;
        public readonly Stmt[] Then;
        public readonly Stmt[] Else; // null when absent

        public IfStmt(int line, int col, Expr condition, Stmt[] thenBody, Stmt[] elseBody)
            : base(line, col)
        {
            Condition = condition;
            Then = thenBody;
            Else = elseBody;
        }
    }

    internal sealed class CommandStmt : Stmt
    {
        public const byte BuiltinNone = 0;
        public const byte BuiltinAlarm = 1;
        public const byte BuiltinLog = 2;

        public readonly string Verb;            // lowercased
        public readonly byte Builtin;           // BuiltinNone / BuiltinAlarm / BuiltinLog
        public readonly string TargetDevice;    // null for builtins
        public readonly string TargetProperty;  // non-null for set(dev.prop, ...) style calls
        public readonly Expr[] Args;

        public CommandStmt(int line, int col, string verb, byte builtin,
            string targetDevice, string targetProperty, Expr[] args)
            : base(line, col)
        {
            Verb = verb;
            Builtin = builtin;
            TargetDevice = targetDevice;
            TargetProperty = targetProperty;
            Args = args;
        }
    }

    internal sealed class LetStmt : Stmt
    {
        public readonly string Name; // lowercased
        public readonly int Slot;
        public readonly Expr Value;

        public LetStmt(int line, int col, string name, int slot, Expr value)
            : base(line, col)
        {
            Name = name;
            Slot = slot;
            Value = value;
        }
    }

    internal abstract class Expr
    {
        public readonly int Line;
        public readonly int Col;
        protected Expr(int line, int col) { Line = line; Col = col; }
    }

    internal sealed class NumberExpr : Expr
    {
        public readonly double Value;
        public readonly MossUnit Unit; // metadata only; Value is the raw number

        public NumberExpr(int line, int col, double value, MossUnit unit)
            : base(line, col)
        {
            Value = value;
            Unit = unit;
        }
    }

    internal sealed class StringExpr : Expr
    {
        public readonly string Value;
        public StringExpr(int line, int col, string value) : base(line, col) { Value = value; }
    }

    internal sealed class BoolExpr : Expr
    {
        public readonly bool Value;
        public BoolExpr(int line, int col, bool value) : base(line, col) { Value = value; }
    }

    /// <summary>A bare identifier: a 'let' variable. Slot resolved after parsing.</summary>
    internal sealed class VarExpr : Expr
    {
        public readonly string Name; // lowercased
        public int Slot = -1;
        public VarExpr(int line, int col, string name) : base(line, col) { Name = name; }
    }

    /// <summary>device.property — read through the DeviceRegistry at evaluation time.</summary>
    internal sealed class PropertyExpr : Expr
    {
        public readonly string Device;   // lowercased
        public readonly string Property; // lowercased

        public PropertyExpr(int line, int col, string device, string property)
            : base(line, col)
        {
            Device = device;
            Property = property;
        }
    }

    internal enum UnOp : byte { Not, Neg }

    internal sealed class UnaryExpr : Expr
    {
        public readonly UnOp Op;
        public readonly Expr Operand;
        public UnaryExpr(int line, int col, UnOp op, Expr operand) : base(line, col) { Op = op; Operand = operand; }
    }

    internal enum BinOp : byte { Or, And, Lt, Le, Gt, Ge, Eq, Ne, Add, Sub, Mul, Div }

    internal sealed class BinaryExpr : Expr
    {
        public readonly BinOp Op;
        public readonly Expr Left;
        public readonly Expr Right;

        public BinaryExpr(int line, int col, BinOp op, Expr left, Expr right)
            : base(line, col)
        {
            Op = op;
            Left = left;
            Right = right;
        }
    }
}
