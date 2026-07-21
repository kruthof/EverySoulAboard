using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Threading;
using Perilune.Dsl;
using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Tui.Terminal;
using Perilune.Tui.Ui;

namespace Perilune.Tui
{
    /// <summary>
    /// The interactive DF-style client: one thread that reads keys, advances the sim on a
    /// fixed-tick wall-clock accumulator, and repaints via a diffed ANSI frame. No second
    /// thread touches the sim, so determinism and StateHash coverage are untouched — input
    /// only ever enqueues <see cref="ISimCommand"/>s, which apply on the next tick.
    ///
    /// Speeds map wall-seconds → ticks: pause / 1× (10 t/s) / 5× / 20× / 100× / 1000×.
    /// Ticks per frame are capped so a huge speed or a stalled frame can never freeze input.
    /// Rendering is throttled to ~30 fps and skipped entirely on idle frames (no tick, no
    /// UI change). ShipMetrics recomputes at most once a second.
    /// </summary>
    public sealed class GameLoop
    {
        private static readonly int[] SpeedTps = { 0, 10, 50, 200, 1000, 10000 };
        private static readonly string[] SpeedLabel = { "paused", "1x", "5x", "20x", "100x", "1000x" };
        private const int MaxTicksPerFrame = 2000;
        private const double FrameSeconds = 1.0 / 30.0;

        private readonly ITerminal _term;
        private readonly SimHost _host;
        private readonly Simulation _sim;

        // View / interaction state.
        private Int3 _cursor;
        private int _deck;
        private Lens _lens = Lens.None;
        private int _speedIndex = 1;    // 1×
        private int _resumeIndex = 1;   // speed to restore when unpausing
        private uint _selected;         // 0 = none
        private bool _follow;
        private bool _showHelp;
        private bool _confirmQuit;
        private string _status = "";
        private bool _running = true;

        // MOSS pane state. When _mossTerminal != null the pane is open (a modal): only e/Esc
        // act, and RenderFrame builds the MossPaneModel from these.
        private string _mossTerminal;   // terminal id the pane is bound to, or null = closed
        private MossPaneModel _mossModel;

        // Render state.
        private readonly GlyphBuffer _map;
        private GlyphBuffer _prevScreen;
        private int _prevW, _prevH;
        private bool _uiDirty = true;

        // Metrics cache (~1 Hz).
        private ShipMetricsSnapshot _metrics;
        private double _metricsAtWall = double.NegativeInfinity;

        public GameLoop(ITerminal term, SimHost host)
        {
            _term = term;
            _host = host;
            _sim = host.Sim;
            _map = new GlyphBuffer(_sim.World.Width, _sim.World.Height);
            _cursor = new Int3(_sim.World.Width / 2, _sim.World.Height / 2, 0);
            _metrics = ShipMetrics.Compute(_sim);
        }

        /// <summary>Run until the user quits. Owns the raw-mode lifetime: EnterRaw before
        /// the loop, ExitRaw in a finally that runs on every exit path (quit, exception,
        /// signal — the terminal also self-restores via its own hooks).</summary>
        public void Run()
        {
            _term.EnterRaw();
            try
            {
                var clock = Stopwatch.StartNew();
                double last = clock.Elapsed.TotalSeconds;
                double acc = 0.0;
                double lastRender = double.NegativeInfinity;

                while (_running)
                {
                    double now = clock.Elapsed.TotalSeconds;
                    double dt = now - last;
                    last = now;

                    DrainInput();

                    // Advance the sim on accumulated wall time at the current speed.
                    bool ticked = false;
                    int tps = SpeedTps[_speedIndex];
                    if (tps > 0)
                    {
                        acc += dt * tps;
                        // Clamp the BACKLOG, not just this frame's work: a stall at high
                        // speed drops the excess instead of fast-forwarding a time debt
                        // that would also delay later speed changes.
                        if (acc > MaxTicksPerFrame) acc = MaxTicksPerFrame;
                        int due = (int)acc;
                        if (due > 0)
                        {
                            for (int i = 0; i < due; i++) _sim.Tick();
                            acc -= due;
                            ticked = true;
                        }
                    }
                    else acc = 0.0;

                    if (_follow) FollowSelected();

                    bool resize = _term.Width != _prevW || _term.Height != _prevH;
                    if ((ticked || _uiDirty || resize) && now - lastRender >= FrameSeconds)
                    {
                        RefreshMetrics(now);
                        RenderFrame(resize);
                        _uiDirty = false;
                        lastRender = now;
                    }

                    Thread.Sleep(4); // yield; keeps the loop near ~30 fps without busy-spin
                }
            }
            finally
            {
                _term.ExitRaw();
            }
        }

        // ------------------------------------------------------------------- input

        private void DrainInput()
        {
            while (_term.TryReadKey(out var key))
                HandleKey(key);
        }

        private void HandleKey(ConsoleKeyInfo key)
        {
            if (_confirmQuit)
            {
                char c = key.KeyChar;
                if (c == 'y' || c == 'Y') { _running = false; }
                else { _confirmQuit = false; _status = ""; _uiDirty = true; }
                return;
            }

            // While the MOSS pane is open it owns input: only e (edit) and Esc (close) act.
            if (_mossTerminal != null)
            {
                var pk = KeyDecoder.Decode(key);
                if (key.KeyChar == 'e' || key.KeyChar == 'E') EditMossScript();
                else if (pk == InputAction.Cancel) CloseMoss();
                return;
            }

            var action = KeyDecoder.Decode(key);
            switch (action)
            {
                case InputAction.CursorUp: MoveCursor(0, -1); break;
                case InputAction.CursorDown: MoveCursor(0, 1); break;
                case InputAction.CursorLeft: MoveCursor(-1, 0); break;
                case InputAction.CursorRight: MoveCursor(1, 0); break;

                case InputAction.DeckUp: ChangeDeck(1); break;
                case InputAction.DeckDown: ChangeDeck(-1); break;

                case InputAction.Lens1: SetLens(Lens.None); break;
                case InputAction.Lens2: SetLens(Lens.Pressure); break;
                case InputAction.Lens3: SetLens(Lens.Oxygen); break;
                case InputAction.Lens4: SetLens(Lens.Co2); break;
                case InputAction.Lens5: SetLens(Lens.Temperature); break;
                case InputAction.Lens6: SetLens(Lens.Power); break;
                case InputAction.Lens7: SetLens(Lens.Water); break;

                case InputAction.Pause: TogglePause(); break;
                case InputAction.SpeedUp: ChangeSpeed(1); break;
                case InputAction.SpeedDown: ChangeSpeed(-1); break;

                case InputAction.Context: ContextAction(); break;
                case InputAction.Lock: LockDoor(); break;
                case InputAction.Move: MoveOrder(); break;
                case InputAction.Dig: DesignateDig(); break;
                case InputAction.Stockpile: DesignateStockpile(); break;
                case InputAction.Follow: ToggleFollow(); break;
                case InputAction.MossOpen: OpenMoss(); break;

                case InputAction.Help: _showHelp = !_showHelp; _uiDirty = true; break;
                case InputAction.Cancel: Cancel(); break;
                case InputAction.Quit: _confirmQuit = true; _status = "quit? (y/n)"; _uiDirty = true; break;
            }
        }

        private void MoveCursor(int dx, int dy)
        {
            _follow = false;
            int x = Clamp(_cursor.X + dx, 0, _sim.World.Width - 1);
            int y = Clamp(_cursor.Y + dy, 0, _sim.World.Height - 1);
            _cursor = new Int3(x, y, _deck);
            _uiDirty = true;
        }

        private void ChangeDeck(int d)
        {
            int z = Clamp(_deck + d, 0, _sim.World.Depth - 1);
            if (z == _deck) return;
            _deck = z;
            _cursor = new Int3(_cursor.X, _cursor.Y, _deck);
            _uiDirty = true;
        }

        private void SetLens(Lens lens) { _lens = lens; _uiDirty = true; }

        private void TogglePause()
        {
            if (_speedIndex == 0) _speedIndex = _resumeIndex;
            else { _resumeIndex = _speedIndex; _speedIndex = 0; }
            _uiDirty = true;
        }

        private void ChangeSpeed(int d)
        {
            // +/- move within the running speeds (1..5); pause is space-only.
            int i = Clamp((_speedIndex == 0 ? _resumeIndex : _speedIndex) + d, 1, SpeedTps.Length - 1);
            _speedIndex = i;
            _resumeIndex = i;
            _uiDirty = true;
        }

        private void ContextAction()
        {
            // Living citizen under the cursor ⇒ select. Otherwise a device ⇒ toggle.
            if (TryCitizenAt(_cursor, out var citizen))
            {
                _selected = citizen.Id;
                _status = "selected " + Name(citizen);
                _uiDirty = true;
                return;
            }
            if (TryDeviceAt(_cursor, out var device))
            {
                if (device.Kind == DeviceKind.Door)
                {
                    // Opening a locked door is a validated no-op (SetDoorStateCommand keeps it
                    // shut while locked) — report the block instead of a false "open".
                    if (!device.IsOpen && device.IsLocked)
                    {
                        _status = "door locked";
                    }
                    else
                    {
                        _sim.EnqueueCommand(new SetDoorStateCommand(device.Id, open: !device.IsOpen));
                        _status = (device.IsOpen ? "close " : "open ") + device.Kind;
                    }
                }
                else
                {
                    _sim.EnqueueCommand(new SetDeviceStateCommand(device.Id, open: !device.IsOpen));
                    _status = "toggle " + device.Kind;
                }
                _uiDirty = true;
                return;
            }
            _status = "nothing here";
            _uiDirty = true;
        }

        private void LockDoor()
        {
            if (TryDeviceAt(_cursor, out var device) && device.Kind == DeviceKind.Door)
            {
                _sim.EnqueueCommand(new SetDoorStateCommand(device.Id, locked: !device.IsLocked));
                _status = (device.IsLocked ? "unlock" : "lock") + " door";
            }
            else _status = "no door here";
            _uiDirty = true;
        }

        private void MoveOrder()
        {
            if (_selected == 0) { _status = "no crew selected"; _uiDirty = true; return; }
            _sim.EnqueueCommand(new MoveCitizenCommand(_selected, _cursor));
            _status = "move order";
            _uiDirty = true;
        }

        private void DesignateDig()
        {
            bool on = (_sim.World.GetFlags(_cursor) & TileFlags.Designated) == 0;
            // DesignateDigCommand only marks Debris walls — mirror that precondition so a dig
            // order on solid wall / floor reports the truth instead of a phantom "designated".
            if (on && _sim.World.GetWall(_cursor) != TileDefs.Debris)
            {
                _status = "not diggable";
                _uiDirty = true;
                return;
            }
            _sim.EnqueueCommand(new DesignateDigCommand(_cursor, on));
            _status = on ? "dig designated" : "dig cleared";
            _uiDirty = true;
        }

        private void DesignateStockpile()
        {
            bool on = (_sim.World.GetFlags(_cursor) & TileFlags.Stockpile) == 0;
            // DesignateStockpileCommand only zones walkable tiles — mirror that so a stockpile
            // order on a wall reports the truth instead of a phantom "stockpile set".
            if (on && (_sim.World.GetFlags(_cursor) & TileFlags.Walkable) == 0)
            {
                _status = "not walkable";
                _uiDirty = true;
                return;
            }
            _sim.EnqueueCommand(new DesignateStockpileCommand(_cursor, on));
            _status = on ? "stockpile set" : "stockpile cleared";
            _uiDirty = true;
        }

        // ------------------------------------------------------------------- MOSS pane

        private void OpenMoss()
        {
            if (!TryTerminalAt(_cursor, out var term) || string.IsNullOrEmpty(term.Name))
            {
                _status = "no terminal here";
                _uiDirty = true;
                return;
            }
            _mossTerminal = term.Name;
            _mossModel = BuildMossModel(_mossTerminal, CurrentScriptSource(_mossTerminal));
            _status = "MOSS " + _mossTerminal;
            _uiDirty = true;
        }

        private void CloseMoss()
        {
            _mossTerminal = null;
            _mossModel = null;
            _status = "";
            _uiDirty = true;
        }

        /// <summary>Build the pane model for a given source. Diagnostics come from a PURE
        /// MossCompiler.Compile — reading them must not call SetProgram, which would reset the
        /// running program's latches/timers; only an applied edit calls SetProgram. The source
        /// shown is passed in (not re-read) because a just-applied edit is still queued as a
        /// SetScriptCommand and won't reach sim.Scripts until the next tick.</summary>
        private MossPaneModel BuildMossModel(string terminalId, string source) => new MossPaneModel
        {
            TerminalId = terminalId,
            SourceLines = SplitLines(source),
            Diagnostics = DiagnosticLines(source, terminalId),
            Hint = "e edit in $EDITOR    esc close",
        };

        private string CurrentScriptSource(string terminalId)
        {
            var scripts = _sim.Scripts;
            for (int i = 0; i < scripts.Count; i++)
                if (scripts[i].TerminalId == terminalId) return scripts[i].Source ?? "";
            return "";
        }

        private static IReadOnlyList<string> SplitLines(string source)
        {
            if (string.IsNullOrEmpty(source)) return Array.Empty<string>();
            return source.Replace("\r\n", "\n").TrimEnd('\n').Split('\n');
        }

        private IReadOnlyList<string> DiagnosticLines(string source, string terminalId)
        {
            var lines = new List<string>();
            var diags = MossCompiler.Compile(source).Diagnostics;
            if (diags != null && diags.Count > 0)
            {
                int shown = diags.Count < 6 ? diags.Count : 6;
                for (int i = 0; i < shown; i++)
                {
                    var d = diags[i];
                    lines.Add("line " + d.Line.ToString(CultureInfo.InvariantCulture) + ":" +
                              d.Col.ToString(CultureInfo.InvariantCulture) + "  " + d.Message);
                }
                if (diags.Count > shown)
                    lines.Add("(+" + (diags.Count - shown).ToString(CultureInfo.InvariantCulture) + " more)");
            }
            else if (_host.Moss.TryGetRuntimeError(terminalId, out var runtimeError))
                lines.Add("RUNTIME: " + runtimeError);
            else if (string.IsNullOrWhiteSpace(source))
                lines.Add("(empty program)");
            else
                lines.Add("OK - compiles clean");
            return lines;
        }

        /// <summary>The impure half (kept out of ScreenComposer): suspend the terminal, spill the
        /// source to a temp file, spawn $EDITOR (vi fallback) through the shell, re-take the
        /// terminal, read the file back, then DUAL APPLY exactly like MossBindings/the Unity
        /// panel — a SetScriptCommand makes the source canonical sim state (saved, fed to both
        /// twins) AND moss.SetProgram hot-swaps the running program now. Then rebuild the pane so
        /// the new diagnostics show.</summary>
        private void EditMossScript()
        {
            string terminalId = _mossTerminal;
            string original = CurrentScriptSource(terminalId);
            string edited;
            try { edited = RunExternalEditor(terminalId, original); }
            catch (Exception e)
            {
                _status = "editor failed: " + e.Message;
                _uiDirty = true;
                return;
            }

            if (edited == null || edited == original)
            {
                _status = "MOSS unchanged";
                _mossModel = BuildMossModel(terminalId, original);
                _uiDirty = true;
                return;
            }

            // DUAL APPLY — canonical source through the command log; hot-swap the live program.
            _sim.EnqueueCommand(new SetScriptCommand(terminalId, edited));
            _host.Moss.SetProgram(terminalId, edited);
            _mossModel = BuildMossModel(terminalId, edited); // show what we just applied
            _status = "MOSS applied";
            _uiDirty = true;
        }

        private string RunExternalEditor(string terminalId, string source)
        {
            string safeId = SafeFileToken(terminalId);
            string path = Path.Combine(Path.GetTempPath(),
                "perilune_" + safeId + "_" + Process.GetCurrentProcess().Id.ToString(CultureInfo.InvariantCulture) + ".moss");
            File.WriteAllText(path, source ?? "");

            string editor = Environment.GetEnvironmentVariable("EDITOR");
            if (string.IsNullOrWhiteSpace(editor)) editor = "vi";

            _term.Suspend();
            try
            {
                // Through the shell so an EDITOR with flags (e.g. "code -w") still works.
                var psi = new ProcessStartInfo { FileName = "/bin/sh", UseShellExecute = false };
                psi.ArgumentList.Add("-c");
                psi.ArgumentList.Add(editor + " \"" + path + "\"");
                using var proc = Process.Start(psi);
                proc?.WaitForExit();
            }
            finally
            {
                _term.Resume();
                _prevScreen = null; _prevW = -1; _prevH = -1; // child scribbled the screen: full repaint
                _uiDirty = true;
            }

            string result = File.ReadAllText(path);
            try { File.Delete(path); } catch { /* best effort */ }
            return result;
        }

        private static string SafeFileToken(string s)
        {
            if (string.IsNullOrEmpty(s)) return "terminal";
            var chars = s.ToCharArray();
            for (int i = 0; i < chars.Length; i++)
                if (!char.IsLetterOrDigit(chars[i])) chars[i] = '_';
            return new string(chars);
        }

        private bool TryTerminalAt(Int3 p, out Device term)
        {
            var items = _sim.Devices.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var d = items[i];
                if (d.Kind != DeviceKind.Terminal) continue;
                if (d.Pos.X == p.X && d.Pos.Y == p.Y && d.Pos.Z == p.Z) { term = d; return true; }
            }
            term = null;
            return false;
        }

        private void ToggleFollow()
        {
            if (_selected == 0) { _status = "no crew selected"; _uiDirty = true; return; }
            _follow = !_follow;
            _status = _follow ? "following" : "follow off";
            if (_follow) FollowSelected();
            _uiDirty = true;
        }

        private void Cancel()
        {
            if (_showHelp) { _showHelp = false; }
            else if (_selected != 0 || _follow) { _selected = 0; _follow = false; _status = "deselected"; }
            _uiDirty = true;
        }

        private void FollowSelected()
        {
            if (_selected == 0) { _follow = false; return; }
            if (!_sim.Citizens.TryGet(_selected, out var c) || c.Dead) { _follow = false; return; }
            var p = c.Pos;
            if (p.Z != _deck) { _deck = Clamp(p.Z, 0, _sim.World.Depth - 1); }
            var next = new Int3(p.X, p.Y, _deck);
            if (next != _cursor) { _cursor = next; _uiDirty = true; }
        }

        // ------------------------------------------------------------------ render

        private void RefreshMetrics(double nowWall)
        {
            if (nowWall - _metricsAtWall < 1.0) return;
            _metrics = ShipMetrics.Compute(_sim);
            _metricsAtWall = nowWall;
        }

        private void RenderFrame(bool resize)
        {
            var cursor = new Int3(_cursor.X, _cursor.Y, _deck);
            GlyphMapper.Project(_sim, _deck, _lens, cursor, _map);

            var model = new HudModel
            {
                Map = _map,
                Metrics = _metrics,
                Inspector = InspectorModel.Build(_sim, cursor, _selected),
                EventLog = BuildLog(),
                Goals = BuildGoals(),
                Day = _sim.TickCount / (double)SimClockUtil.TicksPerDay,
                SpeedLabel = SpeedLabel[_speedIndex],
                Deck = _deck,
                DeckCount = _sim.World.Depth,
                LensLabel = _lens.ToString().ToLowerInvariant(),
                LensLegend = LensLegend.For(_lens),
                StatusMessage = _status,
                Overlay = _showHelp ? HelpLines : System.Array.Empty<string>(),
                Moss = _mossModel,
            };

            int w = _term.Width, h = _term.Height;
            var screen = ScreenComposer.Compose(model, w, h);
            string ansi = AnsiPaint.Render(resize ? null : _prevScreen, screen);
            if (ansi.Length > 0) _term.Write(ansi);
            _prevScreen = screen;
            _prevW = w; _prevH = h;
        }

        private IReadOnlyList<string> BuildLog()
        {
            var history = _host.History;
            if (history == null) return System.Array.Empty<string>();
            var entries = history.Entries;
            int take = 12;
            int start = entries.Count > take ? entries.Count - take : 0;
            var lines = new List<string>(entries.Count - start);
            for (int i = start; i < entries.Count; i++)
                lines.Add("D" + entries[i].Day.ToString("0.00", CultureInfo.InvariantCulture) + " " + entries[i].Text);
            return lines;
        }

        private IReadOnlyList<string> BuildGoals()
        {
            var goals = _host.Goals;
            if (goals == null) return System.Array.Empty<string>();
            var lines = new List<string>(goals.Goals.Count);
            for (int i = 0; i < goals.Goals.Count; i++)
            {
                var g = goals.Goals[i];
                lines.Add((g.Done ? "[x] " : "[ ] ") + g.Text);
            }
            return lines;
        }

        private bool TryDeviceAt(Int3 p, out Device device)
        {
            var items = _sim.Devices.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var d = items[i];
                if (d.Pos.X == p.X && d.Pos.Y == p.Y && d.Pos.Z == p.Z) { device = d; return true; }
            }
            device = null;
            return false;
        }

        private bool TryCitizenAt(Int3 p, out Citizen citizen)
        {
            var items = _sim.Citizens.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var c = items[i];
                if (c.Dead) continue;
                if (c.Pos.X == p.X && c.Pos.Y == p.Y && c.Pos.Z == p.Z) { citizen = c; return true; }
            }
            citizen = null;
            return false;
        }

        private static string Name(Citizen c) =>
            string.IsNullOrEmpty(c.Name) ? ("#" + c.Id.ToString(CultureInfo.InvariantCulture)) : c.Name;

        private static int Clamp(int v, int lo, int hi) => v < lo ? lo : v > hi ? hi : v;

        private static readonly string[] HelpLines =
        {
            "PERILUNE  -  keys",
            "",
            "arrows / hjkl   move cursor",
            "R F  or  < >    change deck",
            "1..7            lens (none/press/o2/co2/temp/pwr/water)",
            "space           pause     + -   speed",
            "enter           select crew / toggle door or device",
            "L               lock / unlock door",
            "m               move selected crew to cursor",
            "d               designate dig (debris)",
            "p               designate stockpile",
            "c               follow selected crew",
            "t               open MOSS pane on terminal (e edit)",
            "esc             deselect / close",
            "q               quit",
            "",
            "press ? or esc to close",
        };
    }
}
