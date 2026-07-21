using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Threading;
using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Tui;       // SimHost
using Perilune.Tui.Ui;    // InspectorModel

namespace Perilune.Web
{
    /// <summary>
    /// The single global game behind the web skin. One sim thread owns the Simulation and
    /// advances it on a fixed-tick wall-clock accumulator (the GameLoop pattern, copied — a
    /// shared clock extraction was declined as speculative). No other thread touches the sim:
    /// WebSocket receive loops marshal input through a thread-safe command queue, and the sim
    /// thread applies each command as an <see cref="ISimCommand"/> (or a view-state change)
    /// before ticking, so determinism and StateHash coverage are untouched.
    ///
    /// SINGLE-SESSION by design: deck / lens / speed / cursor / selection are GLOBAL, so every
    /// connected browser tab sees and steers the same game. A rendered frame is therefore
    /// identical for all clients — built once per render tick (~10 fps, only when changed) and
    /// broadcast to everyone. A freshly-connected tab is caught up from <see cref="Snapshot"/>.
    /// </summary>
    public sealed class GameSession
    {
        // Speeds map wall-seconds → ticks: pause / 1× (10 t/s) / 5× / 20× / 100× / 1000×.
        private static readonly int[] SpeedTps = { 0, 10, 50, 200, 1000, 10000 };
        private static readonly string[] SpeedLabel = { "paused", "1x", "5x", "20x", "100x", "1000x" };
        private const int MaxTicksPerFrame = 2000;      // backlog clamp (drop excess, don't fast-forward)
        private const double RenderSeconds = 1.0 / 10.0; // broadcast at most ~10 fps

        private readonly SimHost _host;
        private readonly Simulation _sim;
        private readonly GlyphBuffer _map;
        private readonly Action<string> _broadcast;

        private readonly System.Collections.Concurrent.ConcurrentQueue<WebCommand> _inbox
            = new System.Collections.Concurrent.ConcurrentQueue<WebCommand>();

        // Global view / interaction state (see class summary).
        private Int3 _cursor;
        private int _deck;
        private Lens _lens = Lens.None;
        private int _speedIndex = 1;    // 1×
        private int _resumeIndex = 1;
        private uint _selected;         // 0 = none
        private string _status = "";

        // Cached channel payloads: last JSON broadcast per channel, so a new connection can be
        // caught up (Snapshot) and a render only re-sends channels that actually changed.
        private readonly object _cacheLock = new object();
        private readonly Dictionary<string, string> _cache = new Dictionary<string, string>();

        private ShipMetricsSnapshot _metrics;
        private double _metricsAtWall = double.NegativeInfinity;
        private bool _viewDirty = true;
        private Thread _thread;
        private volatile bool _running;

        public GameSession(SimHost host, Action<string> broadcast)
        {
            _host = host;
            _sim = host.Sim;
            _broadcast = broadcast;
            _map = new GlyphBuffer(_sim.World.Width, _sim.World.Height);
            _cursor = new Int3(_sim.World.Width / 2, _sim.World.Height / 2, 0);
            _metrics = ShipMetrics.Compute(_sim);
        }

        public void Start()
        {
            _running = true;
            _thread = new Thread(Run) { IsBackground = true, Name = "perilune-sim" };
            _thread.Start();
        }

        public void Stop()
        {
            _running = false;
            _thread?.Join(500);
        }

        /// <summary>Queue an input command from any WebSocket receive loop (thread-safe).</summary>
        public void Enqueue(WebCommand cmd) => _inbox.Enqueue(cmd);

        /// <summary>The current payload for every channel, for catching up a new connection.
        /// A snapshot of the caches under lock — order is frame first so the client paints
        /// before it wires up the sidebar.</summary>
        public List<string> Snapshot()
        {
            var list = new List<string>(8);
            lock (_cacheLock)
            {
                foreach (var key in new[] { "frame", "status", "metrics", "legend", "log", "inspect" })
                    if (_cache.TryGetValue(key, out var v)) list.Add(v);
            }
            return list;
        }

        // ------------------------------------------------------------------- loop

        private void Run()
        {
            var clock = Stopwatch.StartNew();
            double last = clock.Elapsed.TotalSeconds;
            double acc = 0.0;
            double lastRender = double.NegativeInfinity;

            // Prime the caches so the very first connection has a full frame immediately.
            Render(clock.Elapsed.TotalSeconds, force: true);

            while (_running)
            {
                double now = clock.Elapsed.TotalSeconds;
                double dt = now - last;
                last = now;

                bool viewChanged = DrainCommands();

                bool ticked = false;
                int tps = SpeedTps[_speedIndex];
                if (tps > 0)
                {
                    acc += dt * tps;
                    if (acc > MaxTicksPerFrame) acc = MaxTicksPerFrame; // clamp backlog, not just this frame
                    int due = (int)acc;
                    if (due > 0)
                    {
                        for (int i = 0; i < due; i++) _sim.Tick();
                        acc -= due;
                        ticked = true;
                    }
                }
                else acc = 0.0;

                if ((ticked || viewChanged || _viewDirty) && now - lastRender >= RenderSeconds)
                {
                    Render(now, force: false);
                    _viewDirty = false;
                    lastRender = now;
                }

                Thread.Sleep(5); // yield; keeps the loop near ~10-20 Hz without busy-spin
            }
        }

        private bool DrainCommands()
        {
            bool changed = false;
            while (_inbox.TryDequeue(out var cmd)) changed |= Apply(cmd);
            return changed;
        }

        // ------------------------------------------------------------------- commands

        /// <summary>Apply one input command. Returns true if it changed view state (so the loop
        /// re-renders even with the sim paused). Sim-affecting commands enqueue an ISimCommand —
        /// they never mutate sim state here.</summary>
        private bool Apply(WebCommand cmd)
        {
            switch (cmd.Kind)
            {
                case CmdKind.Cursor: return SetCursor(cmd.X, cmd.Y);
                case CmdKind.Click: SetCursor(cmd.X, cmd.Y); ContextAction(); return true;
                case CmdKind.Move: MoveOrder(); return true;
                case CmdKind.Deck: return ChangeDeck(cmd.I);
                case CmdKind.Lens: return SetLens(cmd.Name);
                case CmdKind.Speed: ChangeSpeed(cmd.I); return true;
                case CmdKind.Pause: TogglePause(); return true;
                default: return false;
            }
        }

        private bool SetCursor(int x, int y)
        {
            x = Clamp(x, 0, _sim.World.Width - 1);
            y = Clamp(y, 0, _sim.World.Height - 1);
            var next = new Int3(x, y, _deck);
            if (next == _cursor) return false;
            _cursor = next;
            return true;
        }

        private bool ChangeDeck(int d)
        {
            int z = Clamp(_deck + d, 0, _sim.World.Depth - 1);
            if (z == _deck) return false;
            _deck = z;
            _cursor = new Int3(_cursor.X, _cursor.Y, _deck);
            return true;
        }

        private bool SetLens(string name)
        {
            var lens = ParseLens(name);
            if (lens == _lens) return false;
            _lens = lens;
            return true;
        }

        private void TogglePause()
        {
            if (_speedIndex == 0) _speedIndex = _resumeIndex;
            else { _resumeIndex = _speedIndex; _speedIndex = 0; }
        }

        private void ChangeSpeed(int d)
        {
            int i = Clamp((_speedIndex == 0 ? _resumeIndex : _speedIndex) + d, 1, SpeedTps.Length - 1);
            _speedIndex = i;
            _resumeIndex = i;
        }

        /// <summary>Mirror of GameLoop.ContextAction, incl. the honest no-op feedback: a living
        /// citizen under the cursor selects; else a device toggles (a locked door reports the
        /// block instead of a false "open"); else "nothing here".</summary>
        private void ContextAction()
        {
            if (TryCitizenAt(_cursor, out var citizen))
            {
                _selected = citizen.Id;
                _status = "selected " + Name(citizen);
                return;
            }
            if (TryDeviceAt(_cursor, out var device))
            {
                if (device.Kind == DeviceKind.Door)
                {
                    if (!device.IsOpen && device.IsLocked) { _status = "door locked"; }
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
                return;
            }
            _status = "nothing here";
        }

        private void MoveOrder()
        {
            if (_selected == 0) { _status = "no crew selected"; return; }
            _sim.EnqueueCommand(new MoveCitizenCommand(_selected, _cursor));
            _status = "move order";
        }

        // ------------------------------------------------------------------- render

        private void Render(double nowWall, bool force)
        {
            var cursor = new Int3(_cursor.X, _cursor.Y, _deck);
            GlyphMapper.Project(_sim, _deck, _lens, cursor, _map);
            // Selected crew tile, if alive and on the shown deck — the client draws the
            // selection reticle there (selection is view state, not part of the glyph map).
            int selX = -1, selY = -1;
            if (_selected != 0 && _sim.Citizens.TryGet(_selected, out var sel) && !sel.Dead && sel.Pos.Z == _deck)
            { selX = sel.Pos.X; selY = sel.Pos.Y; }
            // Visible crew with a stable per-citizen sprite variant. Only tiles the
            // projection actually shows as '@' — the fog gate stays authoritative.
            var crew = new List<(int X, int Y, int Variant)>();
            var citizens = _sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.Pos.Z != _deck) continue;
                if (_map[c.Pos.X, c.Pos.Y].Glyph != Glyphs.Citizen) continue;
                crew.Add((c.Pos.X, c.Pos.Y, (int)(c.Id % 3)));
            }
            Send("frame", WireFormat.Frame(_map, _deck, _lens.ToString().ToLowerInvariant(), selX, selY, crew), force);

            if (force || nowWall - _metricsAtWall >= 1.0)
            {
                _metrics = ShipMetrics.Compute(_sim);
                _metricsAtWall = nowWall;
            }
            Send("metrics", WireFormat.Metrics(_metrics), force);
            Send("legend", WireFormat.Legend(LensLegend.For(_lens)), force);
            Send("log", WireFormat.Log(BuildLog()), force);
            Send("inspect", WireFormat.Inspect(InspectorModel.Build(_sim, cursor, _selected)), force);
            Send("status", WireFormat.Status(_status, SpeedLabel[_speedIndex], _speedIndex == 0), force);
        }

        /// <summary>Cache the payload and broadcast it — but only when it changed (or on a
        /// forced prime), so idle frames put nothing on the wire.</summary>
        private void Send(string channel, string json, bool force)
        {
            lock (_cacheLock)
            {
                if (!force && _cache.TryGetValue(channel, out var prev) && prev == json) return;
                _cache[channel] = json;
            }
            _broadcast(json);
        }

        private IReadOnlyList<string> BuildLog()
        {
            var history = _host.History;
            if (history == null) return Array.Empty<string>();
            var entries = history.Entries;
            int take = 14;
            int start = entries.Count > take ? entries.Count - take : 0;
            var lines = new List<string>(entries.Count - start);
            for (int i = start; i < entries.Count; i++)
                lines.Add("D" + entries[i].Day.ToString("0.00", CultureInfo.InvariantCulture) + " " + entries[i].Text);
            return lines;
        }

        // ------------------------------------------------------------------- queries

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

        private static Lens ParseLens(string name)
        {
            if (string.IsNullOrEmpty(name)) return Lens.None;
            switch (name.ToLowerInvariant())
            {
                case "pressure": return Lens.Pressure;
                case "oxygen": return Lens.Oxygen;
                case "co2": return Lens.Co2;
                case "temperature": return Lens.Temperature;
                case "power": return Lens.Power;
                case "water": return Lens.Water;
                default: return Lens.None;
            }
        }

        private static int Clamp(int v, int lo, int hi) => v < lo ? lo : v > hi ? hi : v;
    }

    /// <summary>Input command kinds the browser can send (mirrors GameLoop's key actions).</summary>
    public enum CmdKind { Unknown = 0, Cursor, Click, Move, Deck, Lens, Speed, Pause }

    /// <summary>A decoded client→server message. Pure value; parsed from JSON by
    /// <see cref="Parse"/> (a tiny tolerant reader — the browser client is the only
    /// producer, but a malformed line must never throw on the receive thread).</summary>
    public readonly struct WebCommand
    {
        public readonly CmdKind Kind;
        public readonly int X, Y, I;
        public readonly string Name;

        public WebCommand(CmdKind kind, int x = 0, int y = 0, int i = 0, string name = null)
        {
            Kind = kind; X = x; Y = y; I = i; Name = name;
        }

        /// <summary>Parse one message: {"cmd":"cursor","x":3,"y":4} / {"cmd":"deck","dz":1} /
        /// {"cmd":"lens","name":"power"} / {"cmd":"speed","delta":-1} / {"cmd":"pause"} etc.
        /// Unknown/garbage ⇒ Kind.Unknown (ignored by the session).</summary>
        public static WebCommand Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) return default;
            string cmd = Str(json, "cmd");
            if (cmd == null) return default;
            switch (cmd)
            {
                case "cursor": return new WebCommand(CmdKind.Cursor, Int(json, "x"), Int(json, "y"));
                case "click": return new WebCommand(CmdKind.Click, Int(json, "x"), Int(json, "y"));
                case "move": return new WebCommand(CmdKind.Move);
                case "deck": return new WebCommand(CmdKind.Deck, i: Int(json, "dz"));
                case "lens": return new WebCommand(CmdKind.Lens, name: Str(json, "name"));
                case "speed": return new WebCommand(CmdKind.Speed, i: Int(json, "delta"));
                case "pause": return new WebCommand(CmdKind.Pause);
                default: return default;
            }
        }

        // Minimal field extractors — locate "key" then read the following JSON scalar. Good
        // enough for our own flat one-object messages; never throws.
        private static string Str(string s, string key)
        {
            int v = ValueStart(s, key);
            if (v < 0 || v >= s.Length || s[v] != '"') return null;
            v++;
            var sb = new System.Text.StringBuilder();
            while (v < s.Length && s[v] != '"')
            {
                if (s[v] == '\\' && v + 1 < s.Length) { v++; sb.Append(Unescape(s[v])); }
                else sb.Append(s[v]);
                v++;
            }
            return sb.ToString();
        }

        private static int Int(string s, string key)
        {
            int v = ValueStart(s, key);
            if (v < 0) return 0;
            int sign = 1;
            if (v < s.Length && s[v] == '-') { sign = -1; v++; }
            int n = 0; bool any = false;
            while (v < s.Length && s[v] >= '0' && s[v] <= '9') { n = n * 10 + (s[v] - '0'); v++; any = true; }
            return any ? sign * n : 0;
        }

        /// <summary>Index of the first char of the value for "key", skipping the colon and
        /// whitespace; -1 if the key is absent.</summary>
        private static int ValueStart(string s, string key)
        {
            string token = "\"" + key + "\"";
            int k = s.IndexOf(token, StringComparison.Ordinal);
            if (k < 0) return -1;
            int i = k + token.Length;
            while (i < s.Length && (s[i] == ':' || s[i] == ' ' || s[i] == '\t')) i++;
            return i;
        }

        private static char Unescape(char c) => c switch { 'n' => '\n', 't' => '\t', 'r' => '\r', _ => c };
    }
}
