using System;
using System.Collections.Generic;
using System.IO;
using Perilune.Sim;

namespace Perilune.Dsl
{
    /// <summary>
    /// The MOSS sim system: holds one compiled program per terminal and runs
    /// them every tick, in insertion order (deterministic).
    ///
    /// Error model:
    /// - Compile errors: the program is stored but never runs; diagnostics are
    ///   returned from SetProgram.
    /// - Runtime errors (unknown device/property, type mismatch, failed
    ///   command): the program halts for THAT tick, the error is recorded
    ///   (TryGetRuntimeError) and an AlarmRaisedEvent is published; the
    ///   program re-runs next tick (the device may reappear). Other programs
    ///   are unaffected.
    /// - BudgetExceeded (&gt; 1000 steps/program or &gt; 50000 steps globally per
    ///   tick): the program halts permanently until SetProgram is called again.
    ///
    /// Audit log (GDD §6 — post-mortems are gameplay): every executed actuator
    /// command, every raised alarm and every permanent halt is recorded in a
    /// per-terminal 64-entry ring buffer, readable via GetAuditLog. Transient
    /// per-tick runtime errors are NOT recorded (a missing device would refill
    /// the whole ring within 64 ticks and erase the history that matters).
    /// Audit entries are transient diagnostics: they survive SetProgram on the
    /// same terminal (terminal history) but are NOT persisted in saves.
    ///
    /// Save/load (IStatefulSystem, blob v1): edge latches, every-timers and the
    /// halted flag are captured per program so a loaded sim behaves as if never
    /// interrupted — no phantom re-fires of already-latched 'when' triggers, no
    /// re-phased 'every' timers. Restore may arrive before programs exist
    /// (SaveReader runs before scripts are recompiled), so the blob is stashed
    /// and applied inside SetProgram, gated on an FNV-1a hash of the source:
    /// an edited script gets fresh state, which is the correct behavior.
    /// </summary>
    public sealed class ScriptRuntime : ISimSystem, IStatefulSystem
    {
        public string Name => "Moss";
        public int IntervalTicks => 1;

        private sealed class ProgramState
        {
            public string TerminalId;
            public CompiledScript Script;
            public Interpreter Interpreter; // null while the script has compile errors
            public string RuntimeError;     // last tick's runtime error, null when healthy
            public bool Halted;             // permanent halt (budget) until SetProgram
            public int SourceHash;          // FNV-1a of the installed source (save/load identity)
            public readonly MossAuditLog Audit = new MossAuditLog(); // transient, never saved
        }

        /// <summary>Trigger state read from a save, waiting for SetProgram to recompile that terminal.</summary>
        private sealed class PendingRestore
        {
            public int SourceHash;
            public bool[] Latches;  // latch-index order == source order of when / alarm-when
            public long[] Timers;   // timer-index order == source order of every-blocks
            public bool Halted;
            public string RuntimeError; // "" when none
        }

        private readonly DeviceRegistry _registry;
        private readonly List<ProgramState> _programs = new List<ProgramState>(); // insertion order
        private readonly Dictionary<string, ProgramState> _byId = new Dictionary<string, ProgramState>();
        private readonly StepCounter _globalSteps = new StepCounter();
        private Dictionary<string, PendingRestore> _pending; // null until RestoreState is called

        public ScriptRuntime(DeviceRegistry registry)
        {
            _registry = registry ?? throw new ArgumentNullException(nameof(registry));
        }

        /// <summary>
        /// Compiles and installs a program for a terminal, replacing any existing
        /// one (edge latches, timers and runtime errors reset). Never throws.
        /// If trigger state for this terminal is pending from RestoreState AND the
        /// source is byte-identical to the saved one (hash + trigger counts match),
        /// the saved latches/timers/halt are applied instead of the fresh reset —
        /// a loaded sim then behaves as if it was never interrupted. On any
        /// mismatch the pending state is silently discarded (edited script =
        /// fresh state is correct).
        /// </summary>
        public IReadOnlyList<Diagnostic> SetProgram(string terminalId, string source)
        {
            if (terminalId == null) throw new ArgumentNullException(nameof(terminalId));
            var script = MossCompiler.Compile(source);
            if (!_byId.TryGetValue(terminalId, out var state))
            {
                state = new ProgramState { TerminalId = terminalId };
                _byId.Add(terminalId, state);
                _programs.Add(state);
            }
            state.Script = script;
            state.Interpreter = script.HasErrors ? null : new Interpreter(script, _registry, terminalId);
            state.RuntimeError = null;
            state.Halted = false;
            state.SourceHash = Fnv1a32(source);

            if (_pending != null && _pending.TryGetValue(terminalId, out var pending))
            {
                _pending.Remove(terminalId); // consumed either way — apply once or discard
                if (state.Interpreter != null
                    && pending.SourceHash == state.SourceHash
                    && pending.Latches.Length == state.Interpreter.LatchCount
                    && pending.Timers.Length == state.Interpreter.TimerCount)
                {
                    state.Interpreter.RestoreTriggerState(pending.Latches, pending.Timers);
                    state.Halted = pending.Halted;
                    state.RuntimeError = pending.RuntimeError.Length > 0 ? pending.RuntimeError : null;
                }
            }
            return script.Diagnostics;
        }

        public void RemoveProgram(string terminalId)
        {
            if (terminalId == null) return;
            if (_byId.TryGetValue(terminalId, out var state))
            {
                _byId.Remove(terminalId);
                _programs.Remove(state);
            }
        }

        /// <summary>True if the program's most recent run ended in a runtime error (or it is halted).</summary>
        public bool TryGetRuntimeError(string terminalId, out string error)
        {
            error = null;
            if (terminalId != null && _byId.TryGetValue(terminalId, out var state) && state.RuntimeError != null)
            {
                error = state.RuntimeError;
                return true;
            }
            return false;
        }

        /// <summary>
        /// Copies the terminal's audit log into <paramref name="into"/> (cleared
        /// first), oldest entry first, and returns the count (0 for unknown
        /// terminals). The caller owns the list — reuse it across frames to keep
        /// the UI allocation-free. Entries are transient diagnostics and are not
        /// persisted in saves.
        /// </summary>
        public int GetAuditLog(string terminalId, List<(long tick, string text)> into)
        {
            if (into == null) throw new ArgumentNullException(nameof(into));
            into.Clear();
            if (terminalId == null || !_byId.TryGetValue(terminalId, out var state)) return 0;
            return state.Audit.CopyTo(into);
        }

        public void Tick(Simulation sim)
        {
            _globalSteps.Value = 0;
            var events = sim.Events;
            long tick = sim.TickCount;
            for (int i = 0; i < _programs.Count; i++)
            {
                var p = _programs[i];
                if (p.Interpreter == null || p.Halted) continue;
                p.RuntimeError = null;
                try
                {
                    p.Interpreter.RunTick(events, _globalSteps, tick, p.Audit);
                }
                catch (MossRuntimeException e)
                {
                    p.RuntimeError = e.Message;
                    if (e.Permanent)
                    {
                        p.Halted = true;
                        p.Audit.Record(tick, "HALTED: " + e.Message);
                    }
                    events.Publish(new AlarmRaisedEvent { SourceId = p.TerminalId, Message = e.Message });
                }
                catch (Exception e)
                {
                    // A bug in the interpreter must never take the sim down.
                    p.RuntimeError = "internal error: " + e.Message;
                    p.Halted = true;
                    p.Audit.Record(tick, "HALTED: " + p.RuntimeError);
                    events.Publish(new AlarmRaisedEvent { SourceId = p.TerminalId, Message = p.RuntimeError });
                }
            }
        }

        // ---------------- IStatefulSystem (SYSS chapter, blob v1) ----------------
        //
        // Blob layout (BinaryWriter little-endian defaults):
        //   int programCount
        //   per program, in insertion order:
        //     string terminalId
        //     int    sourceHash                (FNV-1a 32 of the source string)
        //     int    latchCount
        //     bool[latchCount] latches         (latch-index order: the i-th latch is
        //                                       the i-th when/alarm-when in source order)
        //     int    timerCount
        //     long[timerCount] everyCounters   (timer-index order: the i-th timer is
        //                                       the i-th every-block in source order)
        //     bool   halted
        //     string runtimeError              ("" when none)
        //
        // Audit logs are deliberately NOT captured — transient diagnostics.
        // Programs with compile errors capture 0 latches / 0 timers.

        public ushort StateVersion => 1;

        public void CaptureState(BinaryWriter writer)
        {
            writer.Write(_programs.Count);
            for (int i = 0; i < _programs.Count; i++)
            {
                var p = _programs[i];
                writer.Write(p.TerminalId);
                writer.Write(p.SourceHash);
                var interp = p.Interpreter;
                int latchCount = interp?.LatchCount ?? 0;
                writer.Write(latchCount);
                for (int l = 0; l < latchCount; l++) writer.Write(interp.GetLatch(l));
                int timerCount = interp?.TimerCount ?? 0;
                writer.Write(timerCount);
                for (int t = 0; t < timerCount; t++) writer.Write(interp.GetTimer(t));
                writer.Write(p.Halted);
                writer.Write(p.RuntimeError ?? "");
            }
        }

        /// <summary>Folds latch/timer/halted state into the determinism canary (IStatefulSystem).</summary>
        public ulong StateChecksum()
        {
            ulong h = 0x4D4F5353UL; // 'MOSS'
            for (int i = 0; i < _programs.Count; i++)
            {
                var p = _programs[i];
                var interp = p.Interpreter;
                int latchCount = interp?.LatchCount ?? 0;
                for (int l = 0; l < latchCount; l++)
                    h = h * 31UL + (interp.GetLatch(l) ? 2UL : 1UL);
                int timerCount = interp?.TimerCount ?? 0;
                for (int t = 0; t < timerCount; t++)
                    h = h * 31UL + (ulong)interp.GetTimer(t) + 3UL;
                h = h * 31UL + (p.Halted ? 5UL : 4UL);
            }
            return h;
        }

        /// <summary>
        /// Stashes saved trigger state per terminal; it is applied (once, no
        /// per-tick cost) when SetProgram recompiles that terminal with an
        /// unchanged source — see SetProgram. Called by SaveReader BEFORE the
        /// scripts are recompiled. An unknown future blob version is ignored
        /// (SaveReader skips the chapter via its length prefix; loaded programs
        /// then simply start with fresh trigger state).
        /// </summary>
        public void RestoreState(BinaryReader reader, ushort version)
        {
            if (version != 1) return;
            var pending = _pending ?? (_pending = new Dictionary<string, PendingRestore>());
            pending.Clear();
            int programCount = reader.ReadInt32();
            for (int i = 0; i < programCount; i++)
            {
                string terminalId = reader.ReadString();
                var entry = new PendingRestore { SourceHash = reader.ReadInt32() };
                int latchCount = reader.ReadInt32();
                entry.Latches = latchCount > 0 ? new bool[latchCount] : Array.Empty<bool>();
                for (int l = 0; l < latchCount; l++) entry.Latches[l] = reader.ReadBoolean();
                int timerCount = reader.ReadInt32();
                entry.Timers = timerCount > 0 ? new long[timerCount] : Array.Empty<long>();
                for (int t = 0; t < timerCount; t++) entry.Timers[t] = reader.ReadInt64();
                entry.Halted = reader.ReadBoolean();
                entry.RuntimeError = reader.ReadString();
                pending[terminalId] = entry;
            }
        }

        /// <summary>
        /// FNV-1a 32-bit over the source's UTF-16 code units (low byte, then high
        /// byte). Stable across processes and platforms — unlike string.GetHashCode,
        /// which is randomized per process and must never be persisted.
        /// </summary>
        internal static int Fnv1a32(string s)
        {
            unchecked
            {
                uint hash = 2166136261;
                if (s != null)
                {
                    for (int i = 0; i < s.Length; i++)
                    {
                        char c = s[i];
                        hash = (hash ^ (byte)c) * 16777619;
                        hash = (hash ^ (byte)(c >> 8)) * 16777619;
                    }
                }
                return (int)hash;
            }
        }
    }

    /// <summary>
    /// Fixed-capacity (64) ring buffer of executed actuator commands, raised
    /// alarms and permanent halts for one terminal — the terminal's audit log
    /// (GDD §6). Preallocated; Record never allocates (the text strings it
    /// stores are cached per command site by the Interpreter). Transient
    /// diagnostics: not part of sim state, never saved.
    /// </summary>
    internal sealed class MossAuditLog
    {
        public const int Capacity = 64; // power of two — indices wrap with a mask
        private const int Mask = Capacity - 1;

        private readonly long[] _ticks = new long[Capacity];
        private readonly string[] _texts = new string[Capacity];
        private int _count; // entries stored, saturates at Capacity
        private int _next;  // next write slot; once full, also the oldest entry

        public void Record(long tick, string text)
        {
            _ticks[_next] = tick;
            _texts[_next] = text;
            _next = (_next + 1) & Mask;
            if (_count < Capacity) _count++;
        }

        /// <summary>Clears <paramref name="into"/>, fills it oldest-first, returns the count.</summary>
        public int CopyTo(List<(long tick, string text)> into)
        {
            into.Clear();
            int start = _count < Capacity ? 0 : _next;
            for (int i = 0; i < _count; i++)
            {
                int index = (start + i) & Mask;
                into.Add((_ticks[index], _texts[index]));
            }
            return _count;
        }
    }
}
