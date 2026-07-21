using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Threading;
using Perilune.Dsl;       // ScriptRuntime, MossCompiler, Diagnostic
using Perilune.Glyph;
using Perilune.Llm;       // IChatBackend, TemplateBackend, ConversationHub deps
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
        private readonly byte[] _light;     // reused per-tile light grid (LightMapper output)
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

        // MOSS bridge (W3). _mossSource caches the last source the client SET per terminal
        // (serves `open` + hash even while paused, before the canonical SetScriptCommand
        // drains); _lastRtError remembers each terminal's runtime-error state so Render only
        // pushes an rterror on a transition; _mossAuditBuf is a reused scratch list.
        private readonly Dictionary<string, string> _mossSource = new Dictionary<string, string>();
        private readonly Dictionary<string, string> _lastRtError = new Dictionary<string, string>();
        private readonly List<(long Tick, string Text)> _mossAuditBuf = new List<(long, string)>();

        private ShipMetricsSnapshot _metrics;
        private double _metricsAtWall = double.NegativeInfinity;
        private bool _viewDirty = true;
        private Thread _thread;
        private volatile bool _running;

        // Conversation runtime (L6): the talking half. Broadcasts chat/llmstatus/chron through
        // the same socket fan-out; PrepareTurn stays on this sim thread (see ConversationHub).
        private readonly ConversationHub _conv;
        private double _llmStatusAtWall = double.NegativeInfinity;
        private int _lastChronDay = int.MinValue;
        private bool _simThreadCaptured;

        public GameSession(SimHost host, Action<string> broadcast)
            : this(host, broadcast, null) { }

        /// <param name="conv">The conversation runtime. Null ⇒ a default offline
        /// (TemplateBackend-only) hub, so a bare GameSession still converses without any
        /// provider config; Program builds a settings-driven hub, tests inject a fake backend +
        /// clock.</param>
        internal GameSession(SimHost host, Action<string> broadcast, ConversationHub conv)
        {
            _host = host;
            _sim = host.Sim;
            _broadcast = broadcast;
            _map = new GlyphBuffer(_sim.World.Width, _sim.World.Height);
            _light = new byte[_sim.World.Width * _sim.World.Height];
            _cursor = new Int3(_sim.World.Width / 2, _sim.World.Height / 2, 0);
            _metrics = ShipMetrics.Compute(_sim);

            // Worldgen persona pass — SimHost boots UnityEngine-free and skips GenerateMinds, so
            // do it here (once). PersonaGenerator forks its own RNG and never advances sim.Rng, so
            // the sim trajectory and every StateHash are untouched. This fills each citizen's card
            // (role/traits/portrait) and gives conversations a persona + a revealable secret.
            GeneratePersonas();

            _conv = conv ?? new ConversationHub(host, broadcast,
                new IChatBackend[] { new TemplateBackend() }, null, 0m, null);
        }

        private void GeneratePersonas()
        {
            if (_host.Minds == null || _host.Facts == null) return;
            var citizens = _sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (!_host.Minds.Minds.TryGet(c.Id, out var mind) || mind.Persona == null)
                    PersonaGenerator.CreateMind(_sim, _host.Minds, _host.Facts, c);
            }
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
                foreach (var key in new[] { "frame", "light", "status", "metrics", "legend", "log", "inspect", "roster" })
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

            // This is the sim thread — arm the conversation-runtime affinity tripwires.
            CaptureSimThread();

            // Prime the caches so the very first connection has a full frame immediately.
            Render(clock.Elapsed.TotalSeconds, force: true);

            while (_running)
            {
                double now = clock.Elapsed.TotalSeconds;
                double dt = now - last;
                last = now;

                bool viewChanged = DrainCommands();
                _conv.PumpPending(); // dispatch any say queued behind a completed turn

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

                if ((ticked || viewChanged || _viewDirty || _conv.HasPending) && now - lastRender >= RenderSeconds)
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
            CaptureSimThread(); // first command drain on this thread arms the affinity tripwires
            switch (cmd.Kind)
            {
                case CmdKind.Cursor: return SetCursor(cmd.X, cmd.Y);
                case CmdKind.Click: SetCursor(cmd.X, cmd.Y); ContextAction(); return true;
                case CmdKind.Move: MoveOrder(); return true;
                case CmdKind.Deck: return ChangeDeck(cmd.I);
                case CmdKind.Lens: return SetLens(cmd.Name);
                case CmdKind.Speed: ChangeSpeed(cmd.I); return true;
                case CmdKind.Pause: TogglePause(); return true;
                case CmdKind.Build: HandleBuild(cmd); return true;
                case CmdKind.Talk: _conv.Talk(cmd.Cid); return false;
                case CmdKind.Say: _conv.Say(cmd.Sid, cmd.Text); return false;
                case CmdKind.Bye: _conv.Bye(cmd.Sid); return false;
                case CmdKind.Chron: Emit(_conv.ChroniclePayload()); return false;
                case CmdKind.Moss: HandleMoss(cmd); return false;
                default: return false;
            }
        }

        /// <summary>
        /// The MOSS terminal bridge. Runs on the sim thread inside DrainCommands — the command
        /// drain happens BETWEEN ticks, never mid-tick, so SetProgram compiles/installs at a
        /// tick boundary by construction (no mid-tick sim mutation).
        ///   open  → reply source (current program text + hash) and its compile diagnostics
        ///   set   → SetProgram (compile+install now, paused-safe) → reply diag; also enqueue
        ///           the canonical SetScriptCommand so the saved source (sim.Scripts) tracks
        ///           the edit; cache the text for a later `open`.
        ///   audit → reply the terminal's audit ring
        ///   dryrun→ RESERVED (compile-only preview); not implemented.
        /// Unknown op ⇒ ignored.
        /// </summary>
        private void HandleMoss(WebCommand cmd)
        {
            string tid = cmd.Tid;
            if (string.IsNullOrEmpty(tid)) return;
            switch (cmd.Op)
            {
                case "open":
                {
                    string src = CurrentMossSource(tid);
                    Emit(WireFormat.MossSource(tid, src));
                    Emit(WireFormat.MossDiag(tid, MossCompiler.Compile(src).Diagnostics));
                    break;
                }
                case "set":
                {
                    string text = cmd.Text ?? "";
                    var diags = _host.Moss.SetProgram(tid, text); // compile + install (tick-boundary safe)
                    _mossSource[tid] = text;
                    _sim.EnqueueCommand(new SetScriptCommand(tid, text)); // canonical/saved source
                    Emit(WireFormat.MossDiag(tid, diags));
                    break;
                }
                case "audit":
                {
                    _host.Moss.GetAuditLog(tid, _mossAuditBuf);
                    Emit(WireFormat.MossAudit(tid, _mossAuditBuf));
                    break;
                }
                default: break; // unknown op (incl. reserved "dryrun") — ignored
            }
        }

        /// <summary>
        /// The build/refit bridge (P2 M1 over the wire). Kind "wall"/"door" designates at the
        /// clicked tile on the CURRENT deck; "cancel" removes a pending designation there.
        /// Everything goes through the ordinary inbox as a <see cref="DesignateBuildCommand"/>,
        /// so legality (occupied tile, already walled, staging cap …) is decided by
        /// BuildSystem.CanDesignate deterministically at the next tick boundary — an illegal
        /// designation is a silent sim no-op, and the status line only promises the attempt.
        /// </summary>
        private void HandleBuild(WebCommand cmd)
        {
            var pos = new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                               Clamp(cmd.Y, 0, _sim.World.Height - 1), _deck);
            switch (cmd.Name)
            {
                case "wall":
                    _sim.EnqueueCommand(new DesignateBuildCommand(pos, BuildKind.Wall));
                    _status = "designate wall";
                    break;
                case "door":
                    _sim.EnqueueCommand(new DesignateBuildCommand(pos, BuildKind.Door));
                    _status = "designate door";
                    break;
                case "cancel":
                    _sim.EnqueueCommand(new DesignateBuildCommand(pos, BuildKind.Wall, on: false));
                    _status = "cancel designation";
                    break;
                default:
                    break; // unknown kind — ignored
            }
        }

        /// <summary>The current program text for a terminal: the last text SET this session
        /// (reflects unsaved edits) else the canonical saved source in sim.Scripts, else "".</summary>
        private string CurrentMossSource(string tid)
        {
            if (_mossSource.TryGetValue(tid, out var cached)) return cached;
            var scripts = _sim.Scripts;
            for (int i = 0; i < scripts.Count; i++)
                if (scripts[i].TerminalId == tid) return scripts[i].Source ?? "";
            return "";
        }

        /// <summary>Push a moss rterror whenever a terminal's runtime-error state transitions to a
        /// (new) error. Polled each render; last state remembered per terminal.</summary>
        private void PollRuntimeErrors()
        {
            var scripts = _sim.Scripts;
            for (int i = 0; i < scripts.Count; i++)
            {
                string tid = scripts[i].TerminalId;
                string cur = _host.Moss.TryGetRuntimeError(tid, out var err) ? (err ?? "") : "";
                _lastRtError.TryGetValue(tid, out var prev);
                if (cur == (prev ?? "")) continue;
                _lastRtError[tid] = cur;
                if (cur.Length > 0) Emit(WireFormat.MossRuntimeError(tid, cur));
            }
        }

        /// <summary>Test-only hook: apply a command exactly as the sim-thread command drain does
        /// (between ticks). Lets unit tests exercise the command handlers without the loop.</summary>
        internal bool ApplyForTest(WebCommand cmd) => Apply(cmd);

        /// <summary>Test-only hook: run the per-render runtime-error poll.</summary>
        internal void PollRuntimeErrorsForTest() => PollRuntimeErrors();

        /// <summary>Test-only hook: run one full Render pass (primes every cached channel and
        /// broadcasts to the test sink) without starting the sim thread.</summary>
        internal void RenderForTest() => Render(0.0, force: true);

        // Conversation-runtime test hooks: block until the in-flight turn lands, drain the chat
        // outbox to the broadcast sink (Render does this live), dispatch any queued say, and read
        // the llmstatus / chronicle payloads — all on the calling (test = sim) thread.
        internal bool ConvWaitIdle(int ms = 4000) => _conv.WaitIdle(ms);
        internal void ConvFlush() => _conv.Flush();
        internal void ConvPumpPending() => _conv.PumpPending();
        internal string ConvStatusPayload() => _conv.StatusPayload();
        internal string ConvChroniclePayload() => _conv.ChroniclePayload();

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
                // Ship the crew identity card so the client can open the inspector/dialogue.
                Emit(BuildCitizenMessage(citizen));
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
                // A terminal additionally announces itself so the client can open its MOSS panel.
                if (device.Kind == DeviceKind.Terminal && !string.IsNullOrEmpty(device.Name))
                    Emit(WireFormat.Device("terminal", device.Name));
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
            // Visible crew with a stable per-citizen portrait variant and their sim id. Only
            // tiles the projection actually shows as '@' — the fog gate stays authoritative.
            var crew = new List<(int X, int Y, int Pv, uint Cid)>();
            var citizens = _sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.Pos.Z != _deck) continue;
                if (_map[c.Pos.X, c.Pos.Y].Glyph != Glyphs.Citizen) continue;
                crew.Add((c.Pos.X, c.Pos.Y, Portrait(c.Id), c.Id));
            }
            Send("frame", WireFormat.Frame(_map, _deck, _lens.ToString().ToLowerInvariant(), selX, selY, crew), force);

            // Per-tile light overlay for this deck — pure projection, fog-gated first.
            LightMapper.Project(_sim, _deck, _light);
            Send("light", WireFormat.Light(_deck, _sim.World.Width, _sim.World.Height, _light), force);

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
            Send("roster", WireFormat.Roster(BuildRoster()), force);

            // MOSS runtime-error transitions (one-shot rterror pushes; not a cached channel).
            PollRuntimeErrors();

            // Conversation runtime (L6): drain queued chat events (start/delta/line/effect/end),
            // push llmstatus about once a second, and send the chronicle when the day rolls over.
            _conv.Flush();
            if (force || nowWall - _llmStatusAtWall >= 1.0)
            {
                Emit(_conv.StatusPayload());
                _llmStatusAtWall = nowWall;
            }
            int day = (int)(_sim.TickCount / SimClockUtil.TicksPerDay);
            if (day != _lastChronDay)
            {
                _lastChronDay = day;
                Emit(_conv.ChroniclePayload());
            }
        }

        /// <summary>Arm the conversation-runtime thread-affinity tripwires on first use from the
        /// owning thread (the sim loop, or a test's drive thread). Idempotent.</summary>
        private void CaptureSimThread()
        {
            if (_simThreadCaptured) return;
            _simThreadCaptured = true;
            _conv.CaptureSimThread();
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

        /// <summary>Broadcast a one-shot event message (chat / citizen / device / moss) — NOT a
        /// state channel, so it is never cached or deduped: it is a direct reply to a client
        /// action, fanned out to every tab (single-session design).</summary>
        private void Emit(string json) => _broadcast(json);

        /// <summary>The crew identity card. Role/traits/mood come from the mind persona the boot
        /// pass (GeneratePersonas) generated. The portrait is the ship-and-citizen-keyed
        /// <see cref="PersonaDump.PersonaKey"/> (the art pipeline's filename identity), computed
        /// AS COMPUTED for THIS ship's seed — the committed portrait fixtures were baked for the
        /// slice ship (seed 7), whose citizen ids/seed differ, so these keys generally miss and
        /// the client falls back to a procedural silhouette until slice-ship portraits exist.</summary>
        private string BuildCitizenMessage(Citizen citizen)
        {
            string role = "", mood = "", portrait = "";
            IReadOnlyList<string> traits = Array.Empty<string>();
            if (_host.Minds != null && _host.Minds.Minds.TryGet(citizen.Id, out var mind))
            {
                mood = mind.ActiveEmotion(_sim.TickCount);
                if (mind.Persona != null)
                {
                    role = string.IsNullOrEmpty(mind.Persona.RoleNow) ? mind.Persona.RolePreRaid : mind.Persona.RoleNow;
                    traits = mind.Persona.Traits;
                    portrait = Perilune.Tools.PersonaDump.PersonaKey(_host.Seed, citizen.Id);
                }
            }
            return WireFormat.Citizen(citizen.Id, Name(citizen), role, mood, traits, portrait);
        }

        /// <summary>Stable per-citizen portrait/sprite variant (keeps a crew member's face steady
        /// across frames). Mirrored in the frame crew tuple's <c>pv</c> element. Named crew whose
        /// authored gender is known map to a matching pawn sprite (0 = androgynous `pawn`,
        /// 1 = male `pawn_b`, 2 = female `pawn_c`); everyone else keeps the id-stable rotation.
        /// View-only host logic — the sim carries no appearance state (yet), so this table is
        /// the web skin's knowledge, exactly like the id%3 fallback it refines.</summary>
        private int Portrait(uint id)
        {
            if (_sim.Citizens.TryGet(id, out var c) && c.Name != null &&
                SliceVariant.TryGetValue(c.Name, out int v)) return v;
            return (int)(id % 3);
        }

        /// <summary>Pawn-sprite variants for the authored slice crew, by gender as written in
        /// their AuthoredShips backstories (F → pawn_c, M → pawn_b / pawn).</summary>
        private static readonly Dictionary<string, int> SliceVariant = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["Amara Okonkwo"] = 2, ["Priya Raghavan"] = 2, ["Nadia Hassan"] = 2, ["Grace Oyelaran"] = 2,
            ["Dmitri Volkov"] = 1, ["Salif Camara"] = 1, ["Tomas Ferreira"] = 1, ["Wei Chen"] = 0,
        };

        /// <summary>One roster row per LIVING crew member — identity (persona role/mood),
        /// wellbeing (morale), whereabouts (deck + tile) and current task. Deliberately not
        /// fog-gated: the player always knows their own crew (ship's intercom), unlike the
        /// frame crew tuple which stays projection-gated.</summary>
        private List<WireFormat.RosterEntry> BuildRoster()
        {
            var citizens = _sim.Citizens.Items;
            var rows = new List<WireFormat.RosterEntry>(citizens.Count);
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;
                string role = "", mood = "", portrait = "";
                if (_host.Minds != null && _host.Minds.Minds.TryGet(c.Id, out var mind))
                {
                    mood = mind.ActiveEmotion(_sim.TickCount);
                    if (mind.Persona != null)
                    {
                        role = string.IsNullOrEmpty(mind.Persona.RoleNow) ? mind.Persona.RolePreRaid : mind.Persona.RoleNow;
                        portrait = Perilune.Tools.PersonaDump.PersonaKey(_host.Seed, c.Id);
                    }
                }
                rows.Add(new WireFormat.RosterEntry(c.Id, Name(c), role, mood, TaskLabel(c),
                    portrait, c.Morale, c.Pos.Z, c.Pos.X, c.Pos.Y));
            }
            return rows;
        }

        /// <summary>A short human label for what a crew member is doing right now.</summary>
        private static string TaskLabel(Citizen c) => c.JobKind switch
        {
            JobKind.Dig => "digging",
            JobKind.HaulPickup or JobKind.HaulDeliver => "hauling",
            JobKind.Eat => "eating",
            JobKind.Drink => "drinking",
            JobKind.Craft => "crafting",
            JobKind.Maintain => "servicing a machine",
            JobKind.HaulToBuild => "hauling build materials",
            JobKind.Build => "building",
            _ => c.HasPath ? "walking" : "idle",
        };

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
    public enum CmdKind { Unknown = 0, Cursor, Click, Move, Deck, Lens, Speed, Pause, Talk, Say, Bye, Chron, Moss, Build }

    /// <summary>A decoded client→server message. Pure value; parsed from JSON by
    /// <see cref="Parse"/> (a tiny tolerant reader — the browser client is the only
    /// producer, but a malformed line must never throw on the receive thread).</summary>
    public readonly struct WebCommand
    {
        public readonly CmdKind Kind;
        public readonly int X, Y, I;
        public readonly string Name;
        // Dialogue / MOSS payload (W1/W3). Sid = conversation id, Cid = citizen id,
        // Text = free text (say / moss set), Op = moss op, Tid = moss/device terminal id.
        public readonly int Sid;
        public readonly uint Cid;
        public readonly string Text, Op, Tid;

        public WebCommand(CmdKind kind, int x = 0, int y = 0, int i = 0, string name = null,
                          int sid = 0, uint cid = 0, string text = null, string op = null, string tid = null)
        {
            Kind = kind; X = x; Y = y; I = i; Name = name;
            Sid = sid; Cid = cid; Text = text; Op = op; Tid = tid;
        }

        /// <summary>Parse one message. Two families share this reader:
        /// the original view commands keyed by "cmd" ({"cmd":"cursor","x":3,"y":4} /
        /// {"cmd":"deck","dz":1} / {"cmd":"lens","name":"power"} / {"cmd":"speed","delta":-1} /
        /// {"cmd":"pause"}), and the dialogue/MOSS commands keyed by "type"
        /// ({"type":"talk","cid":N} / {"type":"say","sid":N,"text":".."} / {"type":"bye","sid":N} /
        /// {"type":"moss","op":"open|set|audit","tid":"..","text"?}). Unknown/garbage ⇒
        /// Kind.Unknown (ignored by the session).</summary>
        public static WebCommand Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) return default;
            string cmd = Str(json, "cmd");
            if (cmd != null)
            {
                switch (cmd)
                {
                    case "cursor": return new WebCommand(CmdKind.Cursor, Int(json, "x"), Int(json, "y"));
                    case "click": return new WebCommand(CmdKind.Click, Int(json, "x"), Int(json, "y"));
                    case "move": return new WebCommand(CmdKind.Move);
                    case "deck": return new WebCommand(CmdKind.Deck, i: Int(json, "dz"));
                    case "lens": return new WebCommand(CmdKind.Lens, name: Str(json, "name"));
                    case "speed": return new WebCommand(CmdKind.Speed, i: Int(json, "delta"));
                    case "pause": return new WebCommand(CmdKind.Pause);
                    // {"cmd":"build","kind":"wall|door|cancel","x":..,"y":..} — designate/cancel
                    // a build at a tile on the current deck (see GameSession.HandleBuild).
                    case "build": return new WebCommand(CmdKind.Build, Int(json, "x"), Int(json, "y"), name: Str(json, "kind"));
                    default: return default;
                }
            }
            // Dialogue / MOSS family, keyed by "type".
            string type = Str(json, "type");
            if (type == null) return default;
            switch (type)
            {
                case "talk": return new WebCommand(CmdKind.Talk, cid: (uint)Int(json, "cid"));
                case "say": return new WebCommand(CmdKind.Say, sid: Int(json, "sid"), text: Str(json, "text"));
                case "bye": return new WebCommand(CmdKind.Bye, sid: Int(json, "sid"));
                case "chron": return new WebCommand(CmdKind.Chron);
                case "moss": return new WebCommand(CmdKind.Moss, op: Str(json, "op"), tid: Str(json, "tid"), text: Str(json, "text"));
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
