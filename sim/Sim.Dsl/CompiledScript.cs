using System;
using System.Collections.Generic;

namespace Moonbase.Dsl
{
    /// <summary>
    /// The output of <see cref="MossCompiler.Compile"/>: the program's AST split
    /// into the three execution phases plus its diagnostics. Opaque to callers —
    /// hand it to a <see cref="ScriptRuntime"/> via SetProgram.
    /// </summary>
    public sealed class CompiledScript
    {
        // Phase 1: when / alarm-when triggers, in source order (WhenStmt | AlarmWhenStmt).
        internal readonly Stmt[] Triggers;
        // Phase 2: every-blocks, in source order.
        internal readonly EveryStmt[] Everies;
        // Phase 3: top-level bare statements (command / if / let), in source order — run every tick.
        internal readonly Stmt[] Bare;

        internal readonly int LatchCount;
        internal readonly int TimerCount;
        internal readonly int SlotCount;      // 'let' variable slots
        internal readonly int MaxDeviceArgs;  // widest device-command argument list

        private readonly List<Diagnostic> _diagnostics;
        public IReadOnlyList<Diagnostic> Diagnostics => _diagnostics;
        public bool HasErrors { get; }

        internal CompiledScript(Stmt[] triggers, EveryStmt[] everies, Stmt[] bare,
            int latchCount, int timerCount, int slotCount, int maxDeviceArgs,
            List<Diagnostic> diagnostics, bool hasErrors)
        {
            Triggers = triggers;
            Everies = everies;
            Bare = bare;
            LatchCount = latchCount;
            TimerCount = timerCount;
            SlotCount = slotCount;
            MaxDeviceArgs = maxDeviceArgs;
            _diagnostics = diagnostics;
            HasErrors = hasErrors;
        }

        internal static CompiledScript Failed(List<Diagnostic> diagnostics) =>
            new CompiledScript(Array.Empty<Stmt>(), Array.Empty<EveryStmt>(), Array.Empty<Stmt>(),
                0, 0, 0, 0, diagnostics, true);
    }
}
