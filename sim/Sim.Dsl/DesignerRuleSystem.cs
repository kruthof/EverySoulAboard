using System;
using System.Collections.Generic;
using System.IO;
using Moonbase.Sim;

namespace Moonbase.Dsl
{
    /// <summary>
    /// The DESIGNER-RULE sim system (B5): a SECOND MOSS interpreter instance running
    /// ship-wide rules authored as data (<c>StreamingAssets/SimDefs/rules/*.moss</c>,
    /// carried on <see cref="SimDefs.Rules"/>). It mirrors <see cref="ScriptRuntime"/>
    /// closely — same compiler, same <see cref="Interpreter"/>, same per-program budgets,
    /// same edge-latch/every-timer persistence — but its programs come from game CONTENT
    /// (the defs), not from player state (<c>Simulation.Scripts</c>), so the two never mix.
    ///
    /// Shared registry: constructed with the SAME <see cref="DeviceRegistry"/> as the
    /// player runtime (threaded in by the host), so rules address the same device names
    /// and the read-only <c>ship</c> metrics namespace with no duplicate wiring. Placed
    /// just before the player runtime in <see cref="SystemStack"/>.
    ///
    /// Budgets: 1000 steps/rule/tick and a 50000-step global budget PER TICK, mirroring
    /// <c>MossLimits</c> via a private <see cref="StepCounter"/> — rules get their own
    /// global budget, independent of the player scripts. A budget overrun halts THAT rule
    /// permanently (until recompile); other rules keep running. A compile error skips
    /// that rule (diagnostics recorded, others run). A runtime error halts the rule for
    /// one tick and re-runs it next tick. No interpreter bug can take the sim down.
    ///
    /// Compilation is lazy on the first tick (the defs live on the sim, available only in
    /// <see cref="Tick"/>): both twins compile identical programs from the shared defs.
    /// Save/load (IStatefulSystem, blob v1) captures each rule's latches/every-timers/halt
    /// keyed by rule NAME under its own SYSS chapter (<see cref="Name"/> = "DesignerRules")
    /// — identical shape to ScriptRuntime. A restore that arrives before the first tick is
    /// stashed and applied during compilation, gated on an FNV-1a hash of the source (an
    /// edited rule correctly starts with fresh state).
    /// </summary>
    public sealed class DesignerRuleSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "DesignerRules";
        public int IntervalTicks => 1;

        private sealed class RuleState
        {
            public string RuleName;
            public CompiledScript Script;
            public Interpreter Interpreter; // null while the rule has compile errors
            public string RuntimeError;     // last tick's runtime error, null when healthy
            public bool Halted;             // permanent halt (budget) until recompile
            public int SourceHash;          // FNV-1a of the compiled source (save/load identity)
            public readonly MossAuditLog Audit = new MossAuditLog(); // transient, never saved
        }

        /// <summary>Trigger state read from a save, waiting for the first-tick compile.</summary>
        private sealed class PendingRestore
        {
            public int SourceHash;
            public bool[] Latches;
            public long[] Timers;
            public bool Halted;
            public string RuntimeError; // "" when none
        }

        private readonly DeviceRegistry _registry;
        private readonly List<RuleState> _rules = new List<RuleState>(); // defs (filename) order
        private readonly Dictionary<string, RuleState> _byName = new Dictionary<string, RuleState>();
        private readonly StepCounter _globalSteps = new StepCounter();
        private readonly List<(string rule, IReadOnlyList<Diagnostic> diagnostics)> _diagnostics =
            new List<(string, IReadOnlyList<Diagnostic>)>();
        private Dictionary<string, PendingRestore> _pending; // null until RestoreState is called
        private bool _compiled;

        public DesignerRuleSystem(DeviceRegistry registry)
        {
            _registry = registry ?? throw new ArgumentNullException(nameof(registry));
        }

        /// <summary>Per-rule compile diagnostics (only rules that produced any), available
        /// after the first tick. A broken rule appears here AND is skipped at runtime.</summary>
        public IReadOnlyList<(string rule, IReadOnlyList<Diagnostic> diagnostics)> CompileDiagnostics => _diagnostics;

        /// <summary>Number of rules that compiled clean (have a live interpreter).</summary>
        public int ActiveRuleCount
        {
            get
            {
                int n = 0;
                for (int i = 0; i < _rules.Count; i++) if (_rules[i].Interpreter != null) n++;
                return n;
            }
        }

        /// <summary>True if the named rule's most recent run ended in a runtime error (or it is halted).</summary>
        public bool TryGetRuntimeError(string ruleName, out string error)
        {
            error = null;
            if (ruleName != null && _byName.TryGetValue(ruleName, out var state) && state.RuntimeError != null)
            {
                error = state.RuntimeError;
                return true;
            }
            return false;
        }

        /// <summary>Copies the rule's transient audit log into <paramref name="into"/>
        /// (cleared first), oldest first; returns the count (0 for unknown rules).</summary>
        public int GetAuditLog(string ruleName, List<(long tick, string text)> into)
        {
            if (into == null) throw new ArgumentNullException(nameof(into));
            into.Clear();
            if (ruleName == null || !_byName.TryGetValue(ruleName, out var state)) return 0;
            return state.Audit.CopyTo(into);
        }

        /// <summary>Compile every rule from the sim's defs, once, on the first tick.
        /// Fail-soft: a broken rule is skipped (diagnostics recorded), others still run.</summary>
        private void CompileFromDefs(Simulation sim)
        {
            if (_compiled) return;
            _compiled = true;

            var rules = sim.Defs?.Rules;
            if (rules == null) return;

            for (int i = 0; i < rules.Length; i++)
            {
                string ruleName = rules[i].Name ?? "<unnamed>";
                string source = rules[i].Source ?? "";
                if (_byName.ContainsKey(ruleName)) continue; // duplicate name — first wins

                var script = MossCompiler.Compile(source);
                var state = new RuleState
                {
                    RuleName = ruleName,
                    Script = script,
                    Interpreter = script.HasErrors ? null : new Interpreter(script, _registry, ruleName),
                    SourceHash = ScriptRuntime.Fnv1a32(source),
                };
                if (script.Diagnostics.Count > 0) _diagnostics.Add((ruleName, script.Diagnostics));

                // Apply any saved trigger state (same source only), then discard it.
                if (_pending != null && _pending.TryGetValue(ruleName, out var pending))
                {
                    _pending.Remove(ruleName);
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

                _rules.Add(state);
                _byName.Add(ruleName, state);
            }
        }

        public void Tick(Simulation sim)
        {
            CompileFromDefs(sim);

            _globalSteps.Value = 0;
            var events = sim.Events;
            long tick = sim.TickCount;
            for (int i = 0; i < _rules.Count; i++)
            {
                var r = _rules[i];
                if (r.Interpreter == null || r.Halted) continue;
                r.RuntimeError = null;
                try
                {
                    r.Interpreter.RunTick(events, _globalSteps, tick, r.Audit);
                }
                catch (MossRuntimeException e)
                {
                    r.RuntimeError = e.Message;
                    if (e.Permanent)
                    {
                        r.Halted = true;
                        r.Audit.Record(tick, "HALTED: " + e.Message);
                    }
                    events.Publish(new AlarmRaisedEvent { SourceId = r.RuleName, Message = e.Message });
                }
                catch (Exception e)
                {
                    // A bug in the interpreter must never take the sim down.
                    r.RuntimeError = "internal error: " + e.Message;
                    r.Halted = true;
                    r.Audit.Record(tick, "HALTED: " + r.RuntimeError);
                    events.Publish(new AlarmRaisedEvent { SourceId = r.RuleName, Message = r.RuntimeError });
                }
            }
        }

        // ---------------- IStatefulSystem (SYSS chapter, blob v1) ----------------
        // Identical layout to ScriptRuntime, keyed by rule name:
        //   int ruleCount
        //   per rule, in defs order:
        //     string ruleName
        //     int    sourceHash
        //     int    latchCount ; bool[latchCount] latches
        //     int    timerCount ; long[timerCount] everyCounters
        //     bool   halted
        //     string runtimeError ("" when none)

        public ushort StateVersion => 1;

        public void CaptureState(BinaryWriter writer)
        {
            writer.Write(_rules.Count);
            for (int i = 0; i < _rules.Count; i++)
            {
                var r = _rules[i];
                writer.Write(r.RuleName);
                writer.Write(r.SourceHash);
                var interp = r.Interpreter;
                int latchCount = interp?.LatchCount ?? 0;
                writer.Write(latchCount);
                for (int l = 0; l < latchCount; l++) writer.Write(interp.GetLatch(l));
                int timerCount = interp?.TimerCount ?? 0;
                writer.Write(timerCount);
                for (int t = 0; t < timerCount; t++) writer.Write(interp.GetTimer(t));
                writer.Write(r.Halted);
                writer.Write(r.RuntimeError ?? "");
            }
        }

        /// <summary>Folds latch/timer/halted state into the determinism canary (IStatefulSystem).
        /// A distinct seed from ScriptRuntime so the two systems' folds never coincide.</summary>
        public ulong StateChecksum()
        {
            ulong h = 0x4452554CUL; // 'DRUL'
            for (int i = 0; i < _rules.Count; i++)
            {
                var r = _rules[i];
                var interp = r.Interpreter;
                int latchCount = interp?.LatchCount ?? 0;
                for (int l = 0; l < latchCount; l++)
                    h = h * 31UL + (interp.GetLatch(l) ? 2UL : 1UL);
                int timerCount = interp?.TimerCount ?? 0;
                for (int t = 0; t < timerCount; t++)
                    h = h * 31UL + (ulong)interp.GetTimer(t) + 3UL;
                h = h * 31UL + (r.Halted ? 5UL : 4UL);
            }
            return h;
        }

        /// <summary>Stashes saved trigger state per rule name; applied (once) when the
        /// first tick recompiles the rules from defs. Called by SaveReader before the
        /// first tick. An unknown future version is ignored.</summary>
        public void RestoreState(BinaryReader reader, ushort version)
        {
            if (version != 1) return;
            var pending = _pending ?? (_pending = new Dictionary<string, PendingRestore>());
            pending.Clear();
            int ruleCount = reader.ReadInt32();
            for (int i = 0; i < ruleCount; i++)
            {
                string ruleName = reader.ReadString();
                var entry = new PendingRestore { SourceHash = reader.ReadInt32() };
                int latchCount = reader.ReadInt32();
                entry.Latches = latchCount > 0 ? new bool[latchCount] : Array.Empty<bool>();
                for (int l = 0; l < latchCount; l++) entry.Latches[l] = reader.ReadBoolean();
                int timerCount = reader.ReadInt32();
                entry.Timers = timerCount > 0 ? new long[timerCount] : Array.Empty<long>();
                for (int t = 0; t < timerCount; t++) entry.Timers[t] = reader.ReadInt64();
                entry.Halted = reader.ReadBoolean();
                entry.RuntimeError = reader.ReadString();
                pending[ruleName] = entry;
            }
        }
    }
}
