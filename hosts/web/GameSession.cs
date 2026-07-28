using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Threading;
using Perilune.Dsl;       // ScriptRuntime, MossCompiler, Diagnostic
using Perilune.Gen;       // SlotDescriptor (authoring slot grid → the `decks` channel)
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

        /// <summary>The `@console` audit ring (IX-M41): every WRITE the player types at the MOSS
        /// prompt, so their own commands sit in the same reviewable log as the DSL's. Host-side and
        /// bounded — it deliberately does NOT live in <see cref="ScriptRuntime"/>'s per-program
        /// rings, because those are enumerated by <c>ScriptRuntime.StateChecksum</c> and registering
        /// a `@console` program there would move the determinism hash for a feature that adds no
        /// sim state. Transient diagnostics either way: never saved, never hashed.</summary>
        private readonly List<(long Tick, string Text)> _consoleAudit = new List<(long, string)>();
        private const string ConsoleTid = "@console";
        private const int ConsoleAuditCapacity = 64;   // matches ScriptRuntime's per-terminal ring

        /// <summary>The ship designation on the `systems` channel — a deterministic NAME from the
        /// world seed, computed once at boot (identity, not a gauge).</summary>
        private readonly string _hull;

        private ShipMetricsSnapshot _metrics;
        private double _metricsAtWall = double.NegativeInfinity;
        // The MOSS ledger is a full triple scan like ShipMetrics and carries the same "call at
        // <=1 Hz" contract, so it is refreshed on the same cadence rather than on every ~10 Hz
        // render. Send() still dedupes, so the wire sees it only when a row actually moves.
        private ShipSystemsReport _systems;
        private double _systemsAtWall = double.NegativeInfinity;
        // E0-8's ledger. Same "call at <=1 Hz, never per tick" contract as the two above — and one
        // stricter reason: ShipLedger.Sample ALLOCATES (one int[] per census), so it must never come
        // near a tick path. The tracker is the HOST's rate window; it holds no sim state, is never
        // saved and folds into no hash, so nothing here can move a determinism pin.
        private readonly ShipLedgerTracker _ledgerWindow = new ShipLedgerTracker();
        private ShipLedgerReport _ledger;
        private double _ledgerAtWall = double.NegativeInfinity;
        private bool _viewDirty = true;

        /// <summary>
        /// Last <c>Simulation.DeviceTopologyVersion</c> the MOSS adapter set was derived from
        /// (E0-6). Deliberately left at its default 0 rather than seeded from the booted sim: the
        /// host already ran <c>MossBindings.RegisterAdapters</c> once during
        /// <c>SimHost.Build</c>, so the extra re-derive this causes on the first frame of a ship
        /// that has any devices at all is a REDUNDANT no-op (Register REPLACES by name, and the
        /// binding is a pure function of sim state). Seeding it would couple this field to how many
        /// devices authoring happened to add, for no behavioural gain.
        /// </summary>
        private int _deviceTopology;

        /// <summary>
        /// E0-6 — re-derive the MOSS adapter set when the ship's device set has changed. Returns
        /// true when it actually rebound, so a caller (and a test) can tell a rebind from a no-op.
        ///
        /// The MOSS <c>DeviceRegistry</c> is HOST state, derived from sim state by
        /// <c>MossBindings.RegisterAdapters</c> and, until E0-6, only ever at boot. A device that
        /// becomes MOSS-scriptable mid-game — <see cref="CommissionDeviceCommand"/> fitting a
        /// controller module — therefore could not be addressed until the next load, which would
        /// have made the whole ControllerModule sink invisible to the player who paid for it.
        /// <c>DeviceTopologyVersion</c> is the counter the sim already bumps on every device
        /// add/remove and on a commission; re-deriving on a bump is idempotent (<c>Register</c>
        /// REPLACES by name) and costs one pass over the device list, only on the frames where the
        /// ship's device set actually changed.
        ///
        /// <para>EXTRACTED FROM THE RUN LOOP so it can be driven (E0-6 review). Inline, both this
        /// block and <c>CommissionDeviceCommand</c>'s <c>DeviceTopologyVersion++</c> were
        /// SURVIVORS — measured: deleting either left the whole suite green, because the only test
        /// that observed a mid-game rebind called <c>RegisterAdapters</c> by hand. The run loop is
        /// the sole caller and it is a one-line call now, so a deletion is a one-line diff rather
        /// than a silent behaviour loss.</para>
        /// </summary>
        internal bool SyncMossAdaptersIfTopologyChanged()
        {
            if (_sim.DeviceTopologyVersion == _deviceTopology) return false;
            _deviceTopology = _sim.DeviceTopologyVersion;
            MossBindings.RegisterAdapters(_sim, _host.Registry);
            return true;
        }
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
            _hull = ShipSystems.HullDesignation(host.Seed);

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
                // NOTE — `materials` is absent from this list and that is a PRE-EXISTING gap, not a
                // WP-3 decision: a reconnecting tab does not get the material layer replayed until the
                // next Render changes it. `zones` is listed because a reconnect must not silently drop
                // the only surface that says WHY a zone never fills; fixing `materials` belongs to
                // whoever owns that channel.
                // ⚠️ THIS LIST IS THE ONLY THING THAT MAKES A CHANNEL SURVIVE A RECONNECT. A channel
                // absent from it renders empty until the next Render happens to change it — and for a
                // channel whose payload can go unchanged for a long stretch (`devices`, whose condition
                // bytes move ~5 quantiser steps per operating hour per machine), "the next change" is
                // not immediate. Which is why `devices` is ON the list.
                //
                // ⚠️ `ledger` (E0-8) IS ALSO ABSENT, AND IT IS NOT THE SAME GAP — a claim this lane
                // shipped and now retracts. It said `ledger` was missing "for the same reason and with
                // the same consequence" as `materials`. The reason is the same; THE CONSEQUENCE IS
                // NOT, and it was settled by MEASURING a live reconnect rather than by reasoning about
                // the list: over 4 s of a reconnected tab, `materials` arrived **0 times** — a real
                // gap, because that payload only changes when a player picks a material — while
                // `ledger` arrived **4 times**, because its payload moves on essentially every render
                // and it therefore self-heals in ~100 ms. `devices` is like `materials`, NOT like
                // `ledger`: at boot every row reads a constant `cond = 255, oper = 1`, so an omitted
                // `devices` would stay empty for as long as nothing on the ship wears. Both omissions
                // are still REPORTED and not fixed here — adding them changes what a reconnecting tab
                // sees on channels this package does not own — but they are not one finding.
                foreach (var key in new[] { "frame", "light", "status", "metrics", "legend", "log", "inspect", "roster", "designs", "terminals", "relations", "systems", "decks", "rooms", "decor", "zones", "marks", "items", "devices" })
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
                _conv.PumpPending();        // dispatch any say queued behind a completed turn
                _conv.PumpEndedSummaries();  // write durable MEMS summaries for ended sessions (sim thread)

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

                SyncMossAdaptersIfTopologyChanged();

                // A view change must SURVIVE a throttled frame. `viewChanged` is a per-iteration local:
                // if the render is skipped because we are inside the RenderSeconds window, it used to be
                // dropped on the floor, and the only thing that re-opened the gate was `ticked` — which a
                // PAUSED sim never sets again. So a pause command that drained on any non-render
                // iteration was applied to the sim and NEVER BROADCAST: the ship stopped while the client's
                // status channel still said "running", so the top bar read "❚❚ HOLD" (i.e. running) and
                // every paused-ship affordance downstream of it was dead. Measured on 2026-07-25 against
                // `--ship grid`: 7 of 8 pause commands were lost this way (scratchpad wp8-pausebug.mjs
                // proves the sim really was paused — any later view change made the truth appear).
                // Folding it into the sticky `_viewDirty` costs one line and cannot lose an edge.
                _viewDirty |= viewChanged;
                if ((ticked || _viewDirty || _conv.HasPending) && now - lastRender >= RenderSeconds)
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
                case CmdKind.Dig: HandleDesignate(cmd, dig: true); return true;
                case CmdKind.Stockpile: HandleDesignate(cmd, dig: false); return true;
                case CmdKind.Strip: HandleStrip(cmd); return true;
                case CmdKind.Filter: HandleFilter(cmd); return true;
                case CmdKind.Place: HandlePlace(cmd); return true;
                case CmdKind.Remove: HandleRemove(cmd); return true;
                case CmdKind.Commission: HandleCommission(cmd); return true;
                case CmdKind.AddRoom: HandleAddRoom(cmd); return true;
                case CmdKind.Talk: _conv.Talk(cmd.Cid); return false;
                case CmdKind.Say: _conv.Say(cmd.Sid, cmd.Text); return false;
                case CmdKind.Bye: _conv.Bye(cmd.Sid); return false;
                case CmdKind.Chron: Emit(_conv.ChroniclePayload()); return false;
                case CmdKind.Bio: EmitCitizen(cmd.Cid); return false;
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
        ///   audit → reply the terminal's audit ring (tid "@console" ⇒ the player's own prompt ring)
        ///   sys   → reply one MOSS-ledger row's per-device breakdown + its derivation note
        ///   exec  → run ONE prompt line through the DSL's own device adapters (see ExecConsole)
        ///   dryrun→ RESERVED (compile-only preview); not implemented.
        /// Unknown op ⇒ ignored.
        /// </summary>
        private void HandleMoss(WebCommand cmd)
        {
            string tid = cmd.Tid;
            if (string.IsNullOrEmpty(tid)) return;
            switch (cmd.Op)
            {
                case "sys":
                {
                    Emit(WireFormat.MossSys(tid, ShipSystems.ComputeDetail(_sim, tid),
                                            ShipSystems.Derivation(tid)));
                    break;
                }
                case "exec":
                {
                    var (ok, lines) = ExecConsole(cmd.Text);
                    Emit(WireFormat.MossExec(tid, ok, lines));
                    break;
                }
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
                    // The player's own prompt writes live in the host-side @console ring; every
                    // other terminal's live in the ScriptRuntime's per-program ring.
                    if (tid == ConsoleTid) Emit(WireFormat.MossAudit(tid, _consoleAudit));
                    else
                    {
                        _host.Moss.GetAuditLog(tid, _mossAuditBuf);
                        Emit(WireFormat.MossAudit(tid, _mossAuditBuf));
                    }
                    break;
                }
                default: break; // unknown op (incl. reserved "dryrun") — ignored
            }
        }

        // ------------------------------------------------------------------- the MOSS prompt

        /// <summary>Maximum prompt line accepted HOST-side (IX-M42) — not only in the DOM, because
        /// the DOM is not the security boundary.</summary>
        private const int MaxConsoleChars = 240;

        private static readonly string[] ConsoleHelp =
        {
            "DEVICE:  open <dev> · close <dev> · lock <dev> · unlock <dev>",
            "         set <dev>.rate <0..1|max|min>",
            "READ:    <dev>.<property>   e.g. ship.power, vent_ls.rate, hab1.co2",
            "SCREEN:  status · open <system> · log [system] · prog [terminal] · clear · exit",
            "Rooms and ship are READ-ONLY, here as in a MOSS program.",
        };

        /// <summary>
        /// Run ONE line from the MOSS command prompt (spec §1.3).
        ///
        /// <para><b>IX-M40 — the prompt grants NO authority the DSL does not already have.</b> The
        /// target is resolved through the SAME <see cref="DeviceRegistry"/> the MOSS interpreter
        /// uses (<c>_host.Registry</c>, populated by <c>MossBindings.RegisterAdapters</c>) and the
        /// verb goes to the SAME <see cref="IScriptable.TryInvoke"/>. The whitelist is therefore
        /// INHERITED, not re-declared: doors get open/close/lock/unlock and utility devices get
        /// open/close/set because <c>DoorAdapter</c> and <c>UtilityDeviceAdapter</c> say so, and
        /// rooms and <c>ship</c> stay read-only because <c>RoomAdapter</c>/<c>ShipMetricsAdapter</c>
        /// refuse every verb (<c>DeviceAdapters.cs:130-134</c>, <c>ShipMetricsAdapter.cs</c>).
        /// <b>The AUTHORITY is inherited, not the vocabulary.</b> The switch below IS a second list
        /// of verb spellings — but it can only ever be MORE restrictive than the adapters, never
        /// less: every verb it recognises is handed to <c>TryInvoke</c>, which has the final say and
        /// can refuse. So this parser cannot grant a permission the DSL withholds, which is what
        /// IX-M40 requires; what it can do is fail to offer one the DSL allows, and that is a
        /// missing feature rather than a privilege escalation.</para>
        ///
        /// <para><b>No new <see cref="ISimCommand"/>.</b> Every write leaves as the existing
        /// <see cref="SetDoorStateCommand"/> / <see cref="SetDeviceStateCommand"/> the adapters
        /// already enqueue, on the ordinary inbox, landing at the next tick boundary.</para>
        ///
        /// <para><b>Why a small host-side parser and not the MossCompiler.</b> Investigated and
        /// rejected, for three independent reasons. (1) The prompt's grammar is not MOSS's: MOSS
        /// writes <c>close(door_storage)</c>, the prompt writes <c>close door_storage</c>, so a
        /// translation step is unavoidable either way. (2) Running a compiled statement needs
        /// <c>Interpreter</c>, <c>MossAuditLog</c> and <c>MossRuntimeException</c>, all
        /// <c>internal</c> to Sim.Dsl — it would take new public API on the DSL to reach them.
        /// (3) Decisively: installing a <c>@console</c> program via <c>ScriptRuntime.SetProgram</c>
        /// registers a ProgramState that <c>ScriptRuntime.StateChecksum</c> enumerates, so a player
        /// typo would MOVE THE DETERMINISM HASH; and a failed statement publishes an
        /// <c>AlarmRaisedEvent</c>, which <c>HistorySystem</c> (an IStatefulSystem) folds into its
        /// checksum. Either alone disqualifies the interpreter route for a feature that must add no
        /// hashed state. So: parsing here, authority there.</para>
        ///
        /// <para>Runs on the sim thread (the command drain, between ticks). Never throws.</para>
        /// </summary>
        private (bool Ok, List<(int Stream, string Text)> Lines) ExecConsole(string raw)
        {
            var lines = new List<(int, string)>(4);
            string text = raw ?? "";

            // Echo first, always, even for a rejected line: the player must see what the console
            // received, not what it decided to keep.
            lines.Add((0, text.Length > MaxConsoleChars ? text.Substring(0, MaxConsoleChars) : text));

            if (text.Length > MaxConsoleChars)
            {
                lines.Add((2, "LINE TOO LONG — MAX " + MaxConsoleChars.ToString(CultureInfo.InvariantCulture) + " CHARACTERS"));
                return (false, lines);
            }

            var tok = Tokenize(text);
            if (tok.Count == 0) return (true, lines);   // blank line: echo and nothing else

            string verb = tok[0].ToLowerInvariant();
            if (verb == "help")
            {
                foreach (var h in ConsoleHelp) lines.Add((1, h));
                return (true, lines);
            }

            switch (verb)
            {
                case "open":
                case "close":
                case "lock":
                case "unlock":
                    if (tok.Count != 2)
                    {
                        lines.Add((2, verb.ToUpperInvariant() + " EXPECTS ONE TARGET — TYPE HELP"));
                        return (false, lines);
                    }
                    return Invoke(lines, verb, tok[1], Array.Empty<DslValue>(), verb + "(" + tok[1].ToLowerInvariant() + ")");

                case "set":
                {
                    // Space-tolerant (IX-M10): "set vent_ls.rate max" == "set vent_ls rate max".
                    string target, prop, valueTok;
                    if (tok.Count == 3 && SplitDotted(tok[1], out target, out prop)) valueTok = tok[2];
                    else if (tok.Count == 4) { target = tok[1]; prop = tok[2].ToLowerInvariant(); valueTok = tok[3]; }
                    else
                    {
                        lines.Add((2, "SET EXPECTS <DEVICE>.<PROPERTY> <VALUE> — TYPE HELP"));
                        return (false, lines);
                    }
                    if (!TryParseSetValue(valueTok, out var value))
                    {
                        lines.Add((2, "SET EXPECTS A NUMBER, MAX OR MIN — GOT '" + valueTok.ToUpperInvariant() + "'"));
                        return (false, lines);
                    }
                    var args = new[] { DslValue.Text(prop), value };
                    return Invoke(lines, "set", target, args,
                        "set(" + target.ToLowerInvariant() + "." + prop + ", " + value.ToString() + ")");
                }
            }

            // A bare `device.property` is a READ (IX-M41: reads are free, writes are audited).
            if (tok.Count == 1 && SplitDotted(tok[0], out var readTarget, out var readProp))
                return Read(lines, readTarget, readProp);

            lines.Add((2, "UNKNOWN COMMAND '" + verb.ToUpperInvariant() + "' — TYPE HELP"));
            return (false, lines);
        }

        /// <summary>Resolve + invoke through the DSL's own adapter, then audit the write. The
        /// adapter owns the verdict: an unknown verb, a read-only target and a bad argument all
        /// come back as ITS error string, so this method has no opinion about what is legal.</summary>
        private (bool, List<(int, string)>) Invoke(List<(int, string)> lines, string verb, string target,
                                                   DslValue[] args, string auditText)
        {
            if (!_host.Registry.TryResolve(target, out var scriptable))
            {
                lines.Add((2, "NO SUCH DEVICE '" + target.ToUpperInvariant() + "'"));
                return (false, lines);
            }
            string error;
            bool ok;
            try { ok = scriptable.TryInvoke(verb, args, args.Length, out error); }
            catch (Exception e) { ok = false; error = "internal error: " + e.Message; }

            if (!ok)
            {
                lines.Add((2, (error ?? "COMMAND REFUSED").ToUpperInvariant()));
                return (false, lines);
            }
            // A write happened. It is queued as an ordinary ISimCommand and lands at the next tick
            // boundary, so say exactly that rather than claiming the device has already moved.
            lines.Add((1, "QUEUED " + auditText.ToUpperInvariant()));
            AuditConsole(auditText);
            return (true, lines);
        }

        /// <summary>A property read through the same adapter surface. Pure; never audited.</summary>
        private (bool, List<(int, string)>) Read(List<(int, string)> lines, string target, string prop)
        {
            if (!_host.Registry.TryResolve(target, out var scriptable))
            {
                lines.Add((2, "NO SUCH DEVICE '" + target.ToUpperInvariant() + "'"));
                return (false, lines);
            }
            DslValue value;
            bool ok;
            try { ok = scriptable.TryGetProperty(prop, out value); }
            catch (Exception) { ok = false; value = default; }

            if (!ok)
            {
                lines.Add((2, target.ToUpperInvariant() + " HAS NO PROPERTY '" + prop.ToUpperInvariant() + "'"));
                return (false, lines);
            }
            lines.Add((1, target.ToUpperInvariant() + "." + prop.ToUpperInvariant() + " = " + Scalar(value)));
            return (true, lines);
        }

        /// <summary>Append one player write to the bounded `@console` audit ring (IX-M41), in the
        /// same text shape the interpreter records ("open(door_lab)", "set(pump1.rate, 50)"), so
        /// the player's commands read as peers of the DSL's in the same log.</summary>
        private void AuditConsole(string text)
        {
            _consoleAudit.Add((_sim.TickCount, text));
            if (_consoleAudit.Count > ConsoleAuditCapacity) _consoleAudit.RemoveAt(0);
        }

        /// <summary>Whitespace tokenizer — space-tolerant by construction (IX-M10). Any run of
        /// whitespace separates; control characters are whitespace too, so an injection-shaped line
        /// carrying newlines or tabs simply becomes more tokens and fails to resolve.</summary>
        private static List<string> Tokenize(string s)
        {
            var tokens = new List<string>(4);
            int i = 0;
            while (i < s.Length)
            {
                while (i < s.Length && (char.IsWhiteSpace(s[i]) || s[i] < 0x20)) i++;
                int start = i;
                while (i < s.Length && !char.IsWhiteSpace(s[i]) && s[i] >= 0x20) i++;
                if (i > start) tokens.Add(s.Substring(start, i - start));
            }
            return tokens;
        }

        /// <summary>"vent_ls.rate" → ("vent_ls", "rate"). False when there is no single interior
        /// dot — a name with two dots is not a thing this DSL has, and guessing would be a lie.</summary>
        private static bool SplitDotted(string token, out string target, out string prop)
        {
            target = null; prop = null;
            int dot = token.IndexOf('.');
            if (dot <= 0 || dot >= token.Length - 1) return false;
            if (token.IndexOf('.', dot + 1) >= 0) return false;
            target = token.Substring(0, dot);
            prop = token.Substring(dot + 1).ToLowerInvariant();
            return true;
        }

        /// <summary>A `set` argument: a plain FINITE InvariantCulture number, or the max/min keywords
        /// the adapters already understand. InvariantCulture ONLY — this dev machine is de-DE, and
        /// accepting "0,5" here would mean the same keystrokes did different things on different
        /// machines.
        ///
        /// <para><b>Non-finite is rejected here because nothing downstream rejects it.</b>
        /// <c>NumberStyles.Float</c> happily parses the culture's `NaN` and `Infinity` symbols, and
        /// then every guard on the path is NaN-blind: <c>UtilityDeviceAdapter</c>'s
        /// <c>if (rate &lt; 0f)</c> is false for NaN, and <c>SetDeviceStateCommand</c>'s clamp
        /// (<c>Commands.cs:47</c>) is <c>v &lt; 0f ? 0 : v &gt; 1f ? 1 : v</c> — both comparisons
        /// false, so NaN is written straight to <see cref="Device.Rate"/>. From there it poisons
        /// <see cref="Device.EffectiveRate"/>, the atmosphere and every ledger row that reads them.
        /// This is a typing-hygiene fix, not an authority one: a MOSS program can still reach NaN
        /// through <c>0/0</c> (<c>Interpreter.cs:407-408</c>), which is why the ledger ALSO renders
        /// non-finite as OFFLINE rather than trusting this gate.</para></summary>
        private static bool TryParseSetValue(string token, out DslValue value)
        {
            string lower = token.ToLowerInvariant();
            if (lower == "max" || lower == "min") { value = DslValue.Text(lower); return true; }
            if (double.TryParse(token, System.Globalization.NumberStyles.Float,
                                CultureInfo.InvariantCulture, out double n) && double.IsFinite(n))
            {
                value = DslValue.Number(n);
                return true;
            }
            value = default;
            return false;
        }

        /// <summary>Render a read value for the wire: booleans as words, numbers InvariantCulture
        /// with a fixed shape (never a locale comma, never exponential).</summary>
        private static string Scalar(DslValue v) => v.Kind switch
        {
            DslKind.Bool => v.Bool ? "TRUE" : "FALSE",
            DslKind.Str => (v.Str ?? "").ToUpperInvariant(),
            _ => v.Num.ToString("0.####", CultureInfo.InvariantCulture),
        };

        /// <summary>Test-only hook: run one prompt line exactly as the sim-thread drain does.</summary>
        internal (bool Ok, List<(int Stream, string Text)> Lines) ExecConsoleForTest(string raw) => ExecConsole(raw);

        /// <summary>Test-only hook: the `@console` audit ring (IX-M41).</summary>
        internal IReadOnlyList<(long Tick, string Text)> ConsoleAuditForTest() => _consoleAudit;

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
            byte material = (byte)Clamp(cmd.I, 0, 255); // material variant (0 = default); door/cancel ignore it
            switch (cmd.Name)
            {
                case "wall":
                    _sim.EnqueueCommand(new DesignateBuildCommand(pos, BuildKind.Wall, on: true, material: material));
                    _status = "designate wall" + MaterialNote();
                    break;
                case "floor":
                    _sim.EnqueueCommand(new DesignateBuildCommand(pos, BuildKind.Floor, on: true, material: material));
                    _status = "designate floor" + MaterialNote();
                    break;
                case "door":
                    _sim.EnqueueCommand(new DesignateBuildCommand(pos, BuildKind.Door));
                    _status = "designate door" + MaterialNote();
                    break;
                case "cancel":
                    _sim.EnqueueCommand(new DesignateBuildCommand(pos, BuildKind.Wall, on: false));
                    _status = "cancel designation";
                    break;
                default:
                    break; // unknown kind — ignored
            }
        }

        /// <summary>
        /// The order bridge (E0-3): dig designations and stockpile zones at the clicked tile on the
        /// CURRENT deck. Closes the designation half of MECHANICS §13.6 — until now
        /// <see cref="DesignateDigCommand"/> was issued from the TUI alone, so the shipping client
        /// could never create demand for the labour pool E0-1 unlocked, and the LLM's AgreeTask verb
        /// stayed dead for want of a designated debris tile.
        ///
        /// Like HandleBuild, this only ever promises the ATTEMPT: both commands carry their own
        /// preconditions (dig marks Debris walls only; stockpile zones walkable tiles only) and an
        /// illegal request is a silent sim no-op decided deterministically at the next tick boundary.
        /// The status line therefore names the order, never the outcome — the player learns it landed
        /// by seeing the tile recolour in the next frame (GlyphColor.Designate / .Stockpile).
        /// </summary>
        private void HandleDesignate(WebCommand cmd, bool dig)
        {
            var pos = new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                               Clamp(cmd.Y, 0, _sim.World.Height - 1), _deck);
            bool on = cmd.I != 0;
            if (dig)
            {
                _sim.EnqueueCommand(new DesignateDigCommand(pos, on));
                _status = on ? "designate dig" : "clear dig";
            }
            else
            {
                _sim.EnqueueCommand(new DesignateStockpileCommand(pos, on));
                _status = on ? "zone stockpile" : "clear stockpile";
            }
        }

        /// <summary>
        /// The STRIP bridge (E0-5 deconstruct verb), sibling of <see cref="HandleDesignate"/>. Maps
        /// a clicked tile to a <see cref="DesignateDeconstructCommand"/>. The <c>on</c> flag is
        /// EXPLICIT (E0-3's decision): a sweep is idempotent and the host never races the sim.
        ///
        /// The KIND (Wall vs Device) is inferred from the host's current view of the tile — a device
        /// on the tile strips the DEVICE, otherwise a WALL — exactly the ContextAction idiom. This
        /// is only routing: the sim RE-VALIDATES through <c>DeconstructSystem.CanDesignate</c> at the
        /// tick boundary, so a stale inference (e.g. Wall for a tile that is not a wall, or Device
        /// for a door) is a silent no-op, never a corrupt designation. THE COMMAND CARRIES A TILE,
        /// never an entity id — the sim resolves the device id itself (WP-2 removed targetId).
        ///
        /// Like <see cref="HandlePlace"/>, this bridge promises only the ATTEMPT: an illegal or hull
        /// tile is a silent sim no-op and the condemned marker only appears once the sim confirms it.
        ///
        /// THE STATUS LINE USED TO LIE, and that is fixed here (HANDOVER §4g's second defect). It
        /// read <c>"designate strip"</c> unconditionally — set BEFORE the sim ever saw the command —
        /// so a refused tile (a floor, a hull wall, a Door, a shelf/rug, which are client-local decor
        /// and not sim devices at all) reported success. Accepted and silently-refused were
        /// indistinguishable to the player, which is exactly the failure mode that made the
        /// invisible device strip so expensive to diagnose: TWO different failures wearing one face.
        ///
        /// THE PRE-CHECK NEVER GATES THE COMMAND. <see cref="DeconstructSystem.CanDesignate"/> is a
        /// pure deterministic query, so it is safe to ask, but the sim stays the ONLY authority on
        /// what actually happens: the command is enqueued either way and the sim re-validates at the
        /// tick boundary. Making the host a second gate would be two owners for one decision — the
        /// bug this file's doc comments keep warning about.
        ///
        /// HONEST RESIDUAL RACE, stated rather than hidden: the query answers for the sim state the
        /// PLAYER WAS LOOKING AT when they clicked, and the command lands at the next tick boundary.
        /// A tick in between could change the answer. That is a far narrower and more useful claim
        /// than "always succeeded", and it is the claim the player actually wants — the status line
        /// describes their click, not the future.
        /// </summary>
        private void HandleStrip(WebCommand cmd)
        {
            var pos = new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                               Clamp(cmd.Y, 0, _sim.World.Height - 1), _deck);
            bool on = cmd.I != 0;
            bool isDevice = _sim.TryGetDeviceAt(pos, out var target);
            var kind = isDevice ? DeconstructKind.Device : DeconstructKind.Wall;
            _sim.EnqueueCommand(new DesignateDeconstructCommand(pos, kind, on));

            var strip = _sim.Deconstruct;
            if (strip == null) { _status = on ? "designate strip" : "clear strip"; return; }
            bool already = strip.TryGet(pos, out _);
            if (!on)
            {
                _status = already ? "clear strip" : "nothing to clear here";
                return;
            }
            if (already) { _status = "already condemned"; return; }
            _status = strip.CanDesignate(_sim, pos, kind)
                ? "designate strip"
                : "cannot strip " + (isDevice ? target.Kind.ToString().ToLowerInvariant() : "this tile");
        }

        /// <summary>
        /// Every <see cref="ItemKind"/> accepted — the canonical "accept all" mask, DERIVED from the
        /// enum rather than written as a literal (0x3FF today; 0x1FF before the wreck start added
        /// Swarf, 0xFF before E0-7 added Ice, 0x7F before E0-6 added Seals — it widened on its own
        /// all three times). A literal would silently stop covering
        /// the whole set the day another kind is added; the derived form widens with the enum, and
        /// <c>AcceptAllMaskIsDerivedFromItemKind_NotALiteral</c> pins that. Reflection is fine here:
        /// this is host command-handling code (not the zero-alloc tick path) and it is computed once
        /// into a static. The TUI host derives its own copy the same way — the two host projects share
        /// no assembly, and a derived value cannot drift where a copied literal would.
        ///
        /// E0-7 CORRECTION — derived from the enum's VALUES, not its member COUNT. The count form
        /// <c>(1UL &lt;&lt; Length) - 1</c> is only right while <see cref="ItemKind"/> is CONTIGUOUS,
        /// and it stopped being contiguous the moment E0-7 took <c>Ice = 8</c> over the slot 7 the
        /// integrator had reserved for E0-6's <c>Seals</c>. With the gap, the count form sets bit 7
        /// (nothing) and clears bit 8 (Ice): "accept everything" would have silently refused the
        /// one kind the package adds, on every stockpile in the game. This form is
        /// <see cref="StockZoneSystem.AcceptAllMask"/>'s, and the two are pinned equal by
        /// <c>StockZoneSystemTests</c>.
        /// </summary>
        internal static readonly ulong AcceptAllMask = ComputeAcceptAllMask();

        private static ulong ComputeAcceptAllMask()
        {
            ulong m = 0;
            foreach (ItemKind kind in Enum.GetValues(typeof(ItemKind)))
            {
                int k = (int)kind;
                if (k < 64) m |= 1UL << k;   // kinds >= 64 are unrepresentable; see StockZone.AcceptMask
            }
            return m;
        }

        /// <summary>
        /// The E0-4 FILTER bridge — set the complete accept-set of a stockpile tile on the current
        /// deck. Sibling of <see cref="HandleDesignate"/>: same clamp, same <c>_deck</c> supplies Z,
        /// same "promise the ATTEMPT only" contract (<see cref="SetStockpileFilterCommand"/> is
        /// precondition-light by design — a mask on a non-stockpile tile is inert, and the OFF path
        /// of a stockpile designation clears any stray entry).
        ///
        /// TWO THINGS THE WIRE VALUE GETS DONE TO IT, both deliberate:
        ///
        /// 1. A NEGATIVE MASK IS REFUSED OUTRIGHT — no command is enqueued at all. This is the single
        ///    drop site for every mask this protocol cannot express: a literal negative on the wire,
        ///    AND an absent/non-numeric "mask" key, which Parse decodes to the -1 sentinel rather
        ///    than to 0 (0 means ACCEPT NOTHING here and must stay reachable as a real value).
        ///    <c>WebCommand.Int</c>
        ///    has an explicit sign branch, so a hand-crafted socket line CAN deliver one, and a naive
        ///    <c>(ulong)cmd.I</c> would widen -1 to every bit set, which <c>StockZoneSystem.Accepts</c>
        ///    reads as ACCEPT EVERYTHING — the exact inverse of a restrictive filter, and silently
        ///    permissive rather than loudly broken. It is deliberately NOT clamped to 0 (accept
        ///    nothing) or to AcceptAllMask either: both invent an intent this protocol cannot express.
        ///    The client never produces a negative (Cmd.filter masks with ACCEPT_ALL); dropping is the
        ///    only honest answer to a message that cannot legitimately exist.
        /// 2. BITS ABOVE THE LAST ItemKind ARE CANONICALISED AWAY. Not cosmetics:
        ///    <c>StockZoneSystem.StateChecksum</c> folds AcceptMask verbatim, so an undefined high bit
        ///    would perturb the hashed state while changing no behaviour — two byte-different sims that
        ///    behave identically. Masking here guarantees ONE representation per meaning in hashed state.
        ///
        ///    SINCE E0-4 WP-6 THIS MASK IS BELT TO THE SIM'S BRACES, AND UN-BITABLE BY A TEST — but
        ///    only conditionally, which is why it stays. <c>StockZoneSystem.SetFilter</c> now performs
        ///    the same <c>mask &amp;= AcceptAllMask</c> at the sim write door, so while the two derived
        ///    masks are EQUAL the operation is idempotent and the stored value is <c>v &amp; 0xFF</c>
        ///    whether or not this line ran — no test can observe its deletion, and
        ///    <c>StockpileFilterVerbTests.BitsAboveTheLastItemKindAreCanonicalisedAway</c> says so in
        ///    its own doc rather than pretending otherwise.
        ///
        ///    ⚠ THE DIVERGENCE THIS PARAGRAPH USED TO WARN ABOUT HAS HAPPENED, AND WAS FIXED (E0-7).
        ///    <see cref="AcceptAllMask"/> here WAS count-based (<c>(1UL &lt;&lt; Length) - 1</c>, which
        ///    assumes <see cref="ItemKind"/> is contiguous from 0) while
        ///    <c>StockZoneSystem.AcceptAllMask</c> was per-enum-VALUE. E0-7 took <c>Ice = 8</c> over the
        ///    slot 7 the integrator had reserved for E0-6's <c>Seals</c>, so the gap is REAL now — and
        ///    the count form would have set bit 7 (nothing) and cleared bit 8 (Ice), making
        ///    "accept everything" silently refuse the newest kind on every stockpile in the game.
        ///    So this site was converted to the per-VALUE derivation too. The two masks are therefore
        ///    EQUAL again, by construction rather than by luck, and this line is once more redundant
        ///    for stored state. DO NOT "simplify" it back to the count form: that is the bug, and it
        ///    is pinned by <c>StockZoneSystemTests.AcceptAllMask_IsTheOrOfDeclaredItemKindValues_InEveryHostSpelling</c>
        ///    (which asserts, by name, that this constant equals the OR of the declared values).
        ///
        ///    STILL LOGGED AND NOT DONE: have every site consume
        ///    <c>StockZoneSystem.AcceptAllMask</c> itself — this bridge, <c>Tui.Ui.StockFilterModel</c>
        ///    and the client's <c>ACCEPT_ALL</c> — after which there is only ONE derivation, this line is
        ///    provably the same operation as the sim's, and it can simply be deleted along with the
        ///    cross-derivation bridge test. Three host files and a JS constant; its own package.
        /// </summary>
        private void HandleFilter(WebCommand cmd)
        {
            if (cmd.I < 0) return;   // (1) — not clamped, DROPPED
            var pos = new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                               Clamp(cmd.Y, 0, _sim.World.Height - 1), _deck);
            ulong mask = (ulong)(uint)cmd.I & AcceptAllMask;   // (2)
            _sim.EnqueueCommand(new SetStockpileFilterCommand(pos, mask));
            _status = mask == AcceptAllMask ? "stockpile accepts all" : "stockpile filter set";
        }

        /// <summary>
        /// The decorate bridge (Room Zoom place palette). Maps the palette tool string to a
        /// furniture <see cref="DeviceKind"/> and enqueues a <see cref="PlaceDeviceCommand"/> at the
        /// clicked tile on the message's deck. Legality (floor tile, unoccupied, placeable kind) is
        /// decided sim-side at the tick boundary, exactly like HandleBuild — an illegal request is a
        /// silent sim no-op and the item only appears once the sim confirms it in the next frame.
        ///
        /// SINCE E0-5 WP-3 PLACEMENT ALSO COSTS MATTER (<c>build.device_place_cost</c> Parts, taken
        /// from loose ground stacks), so "the sim refused" now includes "the ship could not pay".
        /// That needs no change here and cannot desync the host: this bridge already promises only
        /// the ATTEMPT, and an unaffordable placement is the same silent no-op an illegal tile is —
        /// the next frame simply does not contain the furniture. The status line likewise reports
        /// what was asked for, not what happened, exactly as it did for an illegal tile.
        ///
        /// HONESTLY STATED LIMIT (MECHANICS §13 material): a player whose ship cannot pay gets NO
        /// FEEDBACK — the click just does nothing, and the decorate palette shows no price and no
        /// Parts balance. That is pre-existing behaviour for every illegal placement, not a
        /// regression, but "not enough Parts" is the first refusal a player will hit while doing
        /// something perfectly legal. The fix is a client-side affordance (price on the palette,
        /// a refusal reason on the status line) and belongs with the strip UI surface, not here.
        /// </summary>
        private void HandlePlace(WebCommand cmd)
        {
            if (!TryFurnitureKind(cmd.Name, out var kind)) return; // unknown tool — ignored
            var pos = new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                               Clamp(cmd.Y, 0, _sim.World.Height - 1),
                               Clamp(cmd.I, 0, _sim.World.Levels.Length - 1));
            _sim.EnqueueCommand(new PlaceDeviceCommand(kind, pos));
            _status = "place " + cmd.Name;
        }

        /// <summary>The demolish bridge for placed furniture: enqueue a
        /// <see cref="RemoveDeviceCommand"/> at the clicked tile; the sim resolves tile → device and
        /// removes it only if it is removable furniture (silent no-op otherwise).</summary>
        private void HandleRemove(WebCommand cmd)
        {
            var pos = new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                               Clamp(cmd.Y, 0, _sim.World.Height - 1),
                               Clamp(cmd.I, 0, _sim.World.Levels.Length - 1));
            _sim.EnqueueCommand(new RemoveDeviceCommand(pos));
            _status = "remove furniture";
        }

        /// <summary>
        /// The commissioning bridge (E0-6): fit a <see cref="ItemKind.ControllerModule"/> to the
        /// device on a tile so MOSS can address it. Enqueues blind exactly as place/remove do —
        /// <see cref="CommissionDeviceCommand"/> re-validates everything at the tick boundary and
        /// is a silent no-op when the tile has no device, the device is already commissioned, or
        /// the ship cannot pay.
        ///
        /// The status line is written from what is affordable RIGHT NOW rather than from the
        /// command's outcome (which is not known until the next tick), so an unaffordable click
        /// says so instead of looking like nothing happened — the "invisible feedback is
        /// functional" rule. It is a hint, not a result: a module claimed between this line and
        /// the drain still refuses.
        /// </summary>
        private void HandleCommission(WebCommand cmd)
        {
            var pos = new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                               Clamp(cmd.Y, 0, _sim.World.Height - 1),
                               Clamp(cmd.I, 0, _sim.World.Levels.Length - 1));
            _sim.EnqueueCommand(new CommissionDeviceCommand(pos));
            int have = CommissionDeviceCommand.Affordable(_sim);
            int cost = _sim.Defs.Build.CommissionCost;
            _status = have >= cost
                ? "commission device (-" + cost.ToString(System.Globalization.CultureInfo.InvariantCulture) + " ctrl mod)"
                : "no controller module aboard";
        }

        /// <summary>
        /// The room-commission bridge (Overview ＋ADD ROOM). Looks up the target slot in the plan's
        /// view-only, unhashed <see cref="SimHost.SlotGrid"/>, derives its centre PROBE tile (the
        /// interior centre of the wall-inclusive slot window — a floor tile inside the compartment)
        /// and its existing ANCHOR name, and enqueues an <see cref="AddRoomCommand"/> carrying that
        /// geometry. The sim itself has no slot-grid knowledge, so all geometry rides the command.
        /// Legality (the slot must be a SEALED, AIRLESS empty hall) is decided sim-side at the tick
        /// boundary — an illegal request is a silent sim no-op, and the slot only flips occupied+typed
        /// once the sim confirms it in the next <c>decks</c> frame. Unknown room type ⇒ ignored.
        /// </summary>
        private void HandleAddRoom(WebCommand cmd)
        {
            int deck = cmd.X, slotIndex = cmd.Y;
            if (!ParseRoomType(cmd.Name, out var type)) return; // unknown/blank type — ignored
            var slots = _host.SlotGrid;
            if (slots == null) return;
            for (int i = 0; i < slots.Count; i++)
            {
                var s = slots[i];
                if (s.Deck != deck || s.Index != slotIndex) continue;
                var probe = new Int3(s.X + s.W / 2, s.Y + s.H / 2, deck);
                _sim.EnqueueCommand(new AddRoomCommand(deck, slotIndex, type, probe, s.Anchor));
                _status = "commission " + type.ToString().ToLowerInvariant();
                return;
            }
        }

        /// <summary>Overview picker room-type string → <see cref="RoomType"/> (the commissionable set:
        /// the player-facing room kinds, deliberately excluding the structural None/Corridor/Bridge).
        /// Unknown/blank ⇒ false and the command is ignored; the sim re-checks nothing about the type,
        /// so this whitelist is the type gate.</summary>
        private static bool ParseRoomType(string name, out RoomType type)
        {
            type = RoomType.None;
            if (string.IsNullOrEmpty(name)) return false;
            switch (name.ToLowerInvariant())
            {
                case "quarters": type = RoomType.Quarters; return true;
                case "mess": type = RoomType.Mess; return true;
                case "medbay": type = RoomType.Medbay; return true;
                case "hydro": type = RoomType.Hydro; return true;
                case "workshop": type = RoomType.Workshop; return true;
                case "storage": type = RoomType.Storage; return true;
                case "commons": type = RoomType.Commons; return true;
                case "engineering": type = RoomType.Engineering; return true;
                case "fabrication": type = RoomType.Fabrication; return true;
                case "reactor": type = RoomType.Reactor; return true;
                case "lifesupport": type = RoomType.LifeSupport; return true;
                case "command": type = RoomType.Command; return true;
                case "observatory": type = RoomType.Observatory; return true;
                default: return false;
            }
        }

        /// <summary>Room Zoom palette tool string → furniture <see cref="DeviceKind"/> (IX-Z-21).
        /// Unknown tools return false and are ignored — the whitelist is enforced again sim-side.</summary>
        private static bool TryFurnitureKind(string tool, out DeviceKind kind)
        {
            switch (tool)
            {
                case "bunk": kind = DeviceKind.Bed; return true;
                case "desk": kind = DeviceKind.Desk; return true;
                case "chair": kind = DeviceKind.Chair; return true;
                case "locker": kind = DeviceKind.Locker; return true;
                case "plant": kind = DeviceKind.PlantPot; return true;
                case "lamp": kind = DeviceKind.Light; return true;
                case "growbed": kind = DeviceKind.GrowBed; return true;
                case "medbed": kind = DeviceKind.MedBed; return true;
                case "table": kind = DeviceKind.Table; return true;
                default: kind = default; return false;
            }
        }

        /// <summary>
        /// " - N regolith aboard" for the designate status line: the ship's loose (uncarried) stock
        /// of the build material. A designation with nothing to feed it sits starved forever, and
        /// nothing in the UI used to say why — this is the first honest word about it (the ghost's
        /// delivered/required ledger on the `designs` channel is the second). READ-ONLY scan of the
        /// item store on the sim thread; no mutation, no RNG.
        /// </summary>
        private string MaterialNote()
        {
            return " - " + LooseMaterialUnits().ToString(CultureInfo.InvariantCulture) + " " +
                   ItemKindLabel(BuildSystem.Material) + " aboard";
        }

        /// <summary>The ship's loose (uncarried) stock of the build material — the number that gates
        /// whether a wall/door ghost can be fed. READ-ONLY scan of the item store on the sim thread.
        /// Surfaced on the metrics wire so the Overview can show a STORES chip (a designation with no
        /// matter to feed it otherwise sits starved with nothing in the HUD saying why).</summary>
        private int LooseMaterialUnits()
        {
            int units = 0;
            var items = _sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (it.Kind == BuildSystem.Material && it.CarriedBy == 0) units += it.Count;
            }
            return units;
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

        /// <summary>Test-only hook: run one render WITHOUT the force flag, so <see cref="Send"/>'s
        /// dedupe is live. The forced hook above cannot see a dedupe bug and cannot see a channel that
        /// ignores <c>force</c>; a test that cares which of the two it is needs both.</summary>
        internal void RenderUnforcedForTest() => Render(0.0, force: false);

        // Conversation-runtime test hooks: block until the in-flight turn lands, drain the chat
        // outbox to the broadcast sink (Render does this live), dispatch any queued say, and read
        // the llmstatus / chronicle payloads — all on the calling (test = sim) thread.
        internal bool ConvWaitIdle(int ms = 4000) => _conv.WaitIdle(ms);
        internal void ConvFlush() => _conv.Flush();
        internal void ConvPumpPending() => _conv.PumpPending();
        internal void ConvPumpEndedSummaries() => _conv.PumpEndedSummaries();
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
            Send("metrics", WireFormat.Metrics(_metrics, LooseMaterialUnits()), force);
            Send("legend", WireFormat.Legend(LensLegend.For(_lens)), force);
            Send("log", WireFormat.Log(BuildLog()), force);
            Send("inspect", WireFormat.Inspect(InspectorModel.Build(_sim, cursor, _selected)), force);
            Send("status", WireFormat.Status(_status, SpeedLabel[_speedIndex], _speedIndex == 0), force);
            Send("roster", WireFormat.Roster(BuildRoster()), force);
            Send("designs", WireFormat.Designs(BuildDesigns()), force);
            Send("terminals", WireFormat.Terminals(BuildTerminals()), force);
            Send("relations", WireFormat.Relations(BuildRelations()), force);
            if (force || nowWall - _systemsAtWall >= 1.0)
            {
                _systems = BuildSystems();
                _systemsAtWall = nowWall;
            }
            Send("systems", WireFormat.Systems(_hull, _systems), force);

            // E0-8 ledger: matter census + the three rate members. Refreshed on the same <=1 Hz
            // cadence as metrics/systems (it is a full item+device+room+citizen scan and it
            // allocates). An extra census on a forced prime is harmless: the tracker's baseline
            // survives every Observe, so re-sampling widens no window and resets no rate.
            if (force || nowWall - _ledgerAtWall >= 1.0)
            {
                _ledger = _ledgerWindow.Observe(_sim);
                _ledgerAtWall = nowWall;
            }
            Send("ledger", WireFormat.Ledger(_ledger), force);

            // Warm-SVG view channels (view-only, not fog-gated, move no determinism hash): the
            // per-deck compartment grid, per-room atmosphere, and the cosmetic decor layer.
            Send("decks", WireFormat.Decks(BuildDecks()), force);
            Send("rooms", WireFormat.Rooms(BuildRooms()), force);
            Send("decor", WireFormat.Decor(BuildDecor()), force);
            Send("materials", WireFormat.Materials(BuildMaterials()), force);
            Send("zones", WireFormat.Zones(BuildZones()), force);
            Send("marks", WireFormat.Marks(BuildMarks()), force);
            Send("items", WireFormat.Items(BuildItems()), force);
            // Per-device WEAR STATE (`devices`, PLURAL — not the one-shot `device` terminal reply).
            // `Device.Condition` has never reached the client in any form; the projection's only trace
            // of it is a `GlyphColor.Broken` fg byte neither standard surface reads, and that byte is
            // one bit rather than a gradient. See hosts/web/WireFormat.Devices.cs.
            Send("devices", WireFormat.Devices(BuildDevices()), force);

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
            return WireFormat.Citizen(citizen.Id, Name(citizen), role, mood, traits, portrait,
                                      _conv.ConversationLog(citizen.Id));
        }

        /// <summary>Re-emit a living crew member's identity card on demand (the READOUT BIOGRAPHY
        /// button, {"type":"bio","cid":N}) so the client always opens it with the CURRENT
        /// conversation log after new chats. Sim thread (command drain); unknown/dead ⇒ no-op.</summary>
        private void EmitCitizen(uint cid)
        {
            if (_sim.Citizens.TryGet(cid, out var c) && !c.Dead) Emit(BuildCitizenMessage(c));
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
                IReadOnlyList<string> traits = Array.Empty<string>();
                if (_host.Minds != null && _host.Minds.Minds.TryGet(c.Id, out var mind))
                {
                    mood = mind.ActiveEmotion(_sim.TickCount);
                    if (mind.Persona != null)
                    {
                        role = string.IsNullOrEmpty(mind.Persona.RoleNow) ? mind.Persona.RolePreRaid : mind.Persona.RoleNow;
                        portrait = Perilune.Tools.PersonaDump.PersonaKey(_host.Seed, c.Id);
                        traits = mind.Persona.Traits ?? (IReadOnlyList<string>)Array.Empty<string>();
                    }
                }
                rows.Add(new WireFormat.RosterEntry(c.Id, Name(c), role, mood, TaskLabel(c),
                    portrait, c.Morale, c.Pos.Z, c.Pos.X, c.Pos.Y, traits));
            }
            return rows;
        }

        /// <summary>The pending build designations for the BUILD ghosts — a READ-ONLY mirror of the
        /// registered <see cref="BuildSystem.Pending"/> list. Built on the sim thread inside Render
        /// alongside the roster; NEVER mutates BuildSystem state and never touches the RNG. Empty
        /// when the stack registers no BuildSystem (no build-free surprise for the client). The list
        /// carries every deck's pending sites; the client filters to the shown deck.</summary>
        private List<WireFormat.Design> BuildDesigns()
        {
            var rows = new List<WireFormat.Design>();
            if (_host.BuildSys == null) return rows;
            var pending = _host.BuildSys.Pending;
            for (int i = 0; i < pending.Count; i++)
            {
                var b = pending[i];
                // delivered/required are the site's material ledger — the client renders a
                // STARVED ghost (nothing arriving) distinctly from one being actively supplied.
                rows.Add(new WireFormat.Design(b.Pos.X, b.Pos.Y, b.Pos.Z, (byte)b.Kind, b.Delivered, b.Required, b.Material));
            }
            return rows;
        }

        /// <summary>The ship's MOSS terminals for the MOSS-tab directory — a READ-ONLY scan of the
        /// device store for <see cref="DeviceKind.Terminal"/>s with a non-empty name (the terminal
        /// id the MOSS bridge addresses). Built on the sim thread inside Render; NOT fog-gated
        /// (a directory of consoles is fixed ship knowledge, same rationale as the roster). No
        /// mutation, no RNG.</summary>
        private List<(string Tid, int Deck, int X, int Y)> BuildTerminals()
        {
            var rows = new List<(string, int, int, int)>();
            var devices = _sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Terminal || string.IsNullOrEmpty(d.Name)) continue;
                rows.Add((d.Name, d.Pos.Z, d.Pos.X, d.Pos.Y));
            }
            return rows;
        }

        /// <summary>The directed relationship graph for the RELATIONS web — one edge per living,
        /// named social opinion. READ-ONLY: it iterates the SocialSystem's canonical (From,To)-sorted
        /// edge list and joins each edge's note + concealed flag from the owning citizen's mind
        /// persona (host-owned, unhashed). It NEVER calls Nudge (which mutates + inserts and would
        /// perturb the SOCL fold) — built on the sim thread inside Render alongside the roster. Not
        /// fog-gated: the player is the ship's omniscient eye here (same deliberate rule as roster).
        /// An edge whose From or To is dead/unnamed is excluded (mirrors CitizenContext.RenderCrewRelations).</summary>
        private List<WireFormat.RelationEdge> BuildRelations()
        {
            var rows = new List<WireFormat.RelationEdge>();
            if (_host.Social == null) return rows;
            var edges = _host.Social.Edges;
            for (int i = 0; i < edges.Count; i++)
            {
                var e = edges[i];
                if (!_sim.Citizens.TryGet(e.From, out var from) || from.Dead || string.IsNullOrEmpty(from.Name)) continue;
                if (!_sim.Citizens.TryGet(e.To, out var to) || to.Dead || string.IsNullOrEmpty(to.Name)) continue;

                string note = "";
                bool secret = false;
                if (_host.Minds != null && _host.Minds.Minds.TryGet(e.From, out var mind) && mind.Persona != null)
                {
                    if (mind.Persona.RelationshipNotes != null &&
                        mind.Persona.RelationshipNotes.TryGetValue(e.To, out var n)) note = n ?? "";
                    secret = mind.Persona.RelationshipSecrets != null &&
                             mind.Persona.RelationshipSecrets.Contains(e.To);
                }
                int opinion = (int)System.Math.Round(e.Opinion, System.MidpointRounding.AwayFromZero);
                rows.Add(new WireFormat.RelationEdge(e.From, e.To, opinion, e.Rel, note, secret));
            }
            return rows;
        }

        /// <summary>The MOSS phosphor ledger for the `systems` channel — a READ-ONLY walk of sim
        /// state through <see cref="ShipSystems.Compute"/>, built on the sim thread inside Render
        /// alongside BuildRoster/BuildRelations. It is a pure derivation: no mutation, no RNG, no
        /// Nudge-class side effect, and it adds no hashed state (a test ticks twins while reading
        /// one of them and asserts the hashes match). NOT fog-gated — a ship's own telemetry is
        /// fixed crew knowledge, the same deliberate rule as the roster. The optional
        /// <see cref="SimHost.History"/> is the only source of the LAST FAULT column; without it
        /// the column is honestly empty rather than fabricated.</summary>
        private ShipSystemsReport BuildSystems() => ShipSystems.Compute(_sim, _host.History);

        // ------------------------------------------------------------------- decks / rooms / decor

        /// <summary>The per-deck 2×4 compartment grid for the warm SVG Overview — a READ-ONLY join of
        /// the plan's authoring slot geometry (<see cref="SimHost.SlotGrid"/>) with LIVE
        /// <see cref="RoomState"/>. Geometry + roomType come from the slot descriptor; occupancy and
        /// the room's name are DERIVED here from live state, never from the descriptor's authored
        /// anchor (Phase-2a review nit): a slot's <c>anchorName</c> is the anchor whose probe lands in
        /// the slot AND resolves to a non-vacuum (pressurized) room, and is BLANK for an airless empty
        /// hall. <c>occupied</c> = the slot holds such a room; <c>active</c> = the deck holds ≥1 such
        /// room. Pure: no mutation, no RNG; reads the already-recomputed RoomId plane (RecomputeIfDirty
        /// runs in the tick), exactly as ShipMetrics reads the room list. Empty on ships with no slot
        /// grid (Perilune/PeriluneSlice). Moves no determinism hash.</summary>
        private List<WireFormat.DeckEntry> BuildDecks()
        {
            var entries = new List<WireFormat.DeckEntry>();
            var slots = _host.SlotGrid;
            if (slots == null || slots.Count == 0) return entries;

            var world = _sim.World;
            var rs = _sim.Rooms;

            // Group slots by deck in first-seen order (the plan appends them deck-major, slot 0..7).
            var byDeck = new List<int>();
            var buckets = new Dictionary<int, List<WireFormat.DeckSlot>>();
            for (int i = 0; i < slots.Count; i++)
            {
                var slot = slots[i];
                var (occupied, anchorName, liveType) = ResolveSlot(world, rs, slot);
                if (!buckets.TryGetValue(slot.Deck, out var list))
                {
                    list = new List<WireFormat.DeckSlot>(8);
                    buckets[slot.Deck] = list;
                    byDeck.Add(slot.Deck);
                }
                // Room TYPE comes from LIVE state (the RoomAnchor's Type, set by AddRoomCommand when
                // a hall is commissioned), not the authoring descriptor — so a commissioned hall shows
                // its new type. Fall back to the descriptor when no live type is known (airless hall).
                byte typeByte = (occupied && liveType != RoomType.None) ? (byte)liveType : (byte)slot.Type;
                list.Add(new WireFormat.DeckSlot(slot.Index, slot.X, slot.Y, slot.W, slot.H,
                    anchorName, typeByte, occupied, active: false));
            }

            // Second pass: active = the deck holds ≥1 occupied (non-vacuum) room; stamp every slot.
            for (int d = 0; d < byDeck.Count; d++)
            {
                var list = buckets[byDeck[d]];
                bool deckActive = false;
                for (int s = 0; s < list.Count; s++) if (list[s].Occupied) { deckActive = true; break; }
                if (deckActive)
                    for (int s = 0; s < list.Count; s++)
                    {
                        var t = list[s];
                        list[s] = new WireFormat.DeckSlot(t.SlotIndex, t.X, t.Y, t.W, t.H,
                            t.AnchorName, t.RoomType, t.Occupied, active: true);
                    }
                entries.Add(new WireFormat.DeckEntry(byDeck[d], list));
            }
            return entries;
        }

        /// <summary>Resolve a slot's live occupancy + room name from <see cref="RoomState"/>. Scans the
        /// slot's tile rect for the first tile in a real (non-vacuum-sink) room; a slot is OCCUPIED
        /// only when that room actually holds atmosphere (moles &gt; 0), so a sealed-but-airless empty
        /// hall reads unoccupied with a blank name. The name is the anchor on this deck whose probe
        /// resolves to the same room id — derived from live state, never the descriptor's anchor.</summary>
        private static (bool Occupied, string AnchorName, RoomType Type) ResolveSlot(World world, RoomState rs, SlotDescriptor slot)
        {
            int deck = slot.Deck;
            if (deck < 0 || deck >= world.Depth) return (false, "", RoomType.None);

            ushort roomId = 0;
            for (int y = slot.Y; y < slot.Y + slot.H && roomId == 0; y++)
            {
                if (y < 0 || y >= world.Height) continue;
                for (int x = slot.X; x < slot.X + slot.W; x++)
                {
                    if (x < 0 || x >= world.Width) continue;
                    ushort id = rs.RoomIdAt(world, new Int3(x, y, deck));
                    if (id != 0 && id != RoomState.DoorMarker) { roomId = id; break; }
                }
            }
            if (roomId == 0 || roomId >= rs.Rooms.Count) return (false, "", RoomType.None);
            if (rs.Rooms[roomId].TotalMoles <= 0) return (false, "", RoomType.None); // sealed but airless = empty hall

            string name = "";
            RoomType type = RoomType.None;
            var anchors = rs.Anchors;
            for (int i = 0; i < anchors.Count; i++)
            {
                var a = anchors[i];
                if (a.Probe.Z != deck) continue;
                if (rs.RoomIdAt(world, a.Probe) == roomId) { name = a.Name; type = a.Type; break; }
            }
            return (true, name, type);
        }

        /// <summary>Per-room atmosphere for the warm SVG LENS overlays / atmos box — a READ-ONLY walk
        /// of <see cref="RoomState.Anchors"/>, emitting the RAW derived <see cref="Room"/> properties
        /// (fraction/ppm/kPa/K/tiles) for every anchor that resolves to a non-vacuum, non-airless room.
        /// The vacuum sink and empty halls (no meaningful atmosphere) are omitted. Pure; moves no hash;
        /// this is the same data ShipMetrics/MOSS read, so the numbers agree by construction.</summary>
        private List<WireFormat.RoomTuple> BuildRooms()
        {
            var rows = new List<WireFormat.RoomTuple>();
            var world = _sim.World;
            var rs = _sim.Rooms;
            var anchors = rs.Anchors;
            for (int i = 0; i < anchors.Count; i++)
            {
                var a = anchors[i];
                var room = rs.RoomAt(world, a.Probe);
                if (room == rs.Rooms[0] || room.TotalMoles <= 0) continue; // vacuum sink / airless hall
                rows.Add(new WireFormat.RoomTuple(a.Name, a.Probe.Z, room.O2Fraction, room.CO2Ppm,
                    room.PressureKPa, room.TemperatureK, room.TileCount));
            }
            return rows;
        }

        /// <summary>The cosmetic decor layer for the warm SVG views — VIEW-ONLY, never hashed, never
        /// read by the sim. No authored decor set exists yet, so this ships empty; the channel is wired
        /// (and snapshot-replayed) so a placed decor item survives reconnect once a source lands.</summary>
        private List<WireFormat.DecorItem> BuildDecor() => _decor;
        private static readonly List<WireFormat.DecorItem> _decor = new List<WireFormat.DecorItem>();

        /// <summary>The sparse wall/floor MATERIAL layer for the warm SVG views — a VIEW-ONLY read-only
        /// projection of the sim's World material plane (the authoritative, hashed source). One entry per
        /// tile whose material differs from the default; kind 0 = wall, 1 = floor. Never hashed. Ships
        /// empty until a player picks a material, so an untouched ship is unchanged.</summary>
        private readonly List<(int, int, int, int, int)> _materialsScratch = new List<(int, int, int, int, int)>();
        private List<(int, int, int, int, int)> BuildMaterials()
        {
            _materialsScratch.Clear();
            var world = _sim.World;
            int w = world.Width, h = world.Height;
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                for (int y = 0; y < h; y++)
                    for (int x = 0; x < w; x++)
                    {
                        int idx = level.Index(x, y);
                        byte mat = level.Material[idx];
                        if (mat == 0) continue;                      // default → not on the sparse channel
                        int kind = level.Wall[idx] != 0 ? 0 : 1;     // walled tile → wall material, else floor
                        _materialsScratch.Add((x, y, z, kind, mat));
                    }
            }
            return _materialsScratch;
        }

        /// <summary>
        /// The sparse STOCKPILE-ZONE layer for the standard surface — one
        /// <see cref="WireFormat.ZoneTile"/> per tile carrying <see cref="TileFlags.Stockpile"/>,
        /// with its EFFECTIVE accept mask and the WP-7 back-off bit. VIEW-ONLY: a read of
        /// authoritative state, never a write, never hashed. See <c>WireFormat.Zones.cs</c> for what
        /// this channel is for and what it deliberately does not duplicate.
        ///
        /// ORDER — z, y, x, GUARANTEED BY THE WALK AND BY NOTHING ELSE. The emission order is the
        /// triple loop below (the <c>IJobSource</c> rule-3 tile scan order, identical in shape
        /// to <see cref="BuildMaterials"/>), so it is a pure function of world geometry. The two
        /// per-tile facts are fetched by KEY, never by enumeration:
        /// <see cref="StockZoneSystem.TryGetFilter"/> is a linear scan of a canonically sorted list,
        /// and <c>HaulJobSource.IsBackedOff</c> is a Dictionary <c>TryGetValue</c>. So no hash
        /// container's internal layout can reach the socket, and re-ordering the loops is the only way
        /// to change the byte order — which is what
        /// <c>ZonesChannelTests.Zones_AreEmittedInCanonical_Z_Y_X_Order</c> pins.
        ///
        /// COST. One pass over the world per render (≤10 Hz, on the sim thread inside
        /// <see cref="Render"/>) — the same pass <see cref="BuildMaterials"/> already makes, and NOT a
        /// tick path. It reuses one scratch list, so a steady state allocates nothing. On a ship that
        /// never zoned a stockpile the list stays empty and <see cref="Send"/> dedupes the payload
        /// after the first render.
        /// </summary>
        private readonly List<WireFormat.ZoneTile> _zonesScratch = new List<WireFormat.ZoneTile>();
        private List<WireFormat.ZoneTile> BuildZones()
        {
            _zonesScratch.Clear();
            var world = _sim.World;
            var stock = _sim.StockZones;                  // may be null on a stack without the system
            var haul = HaulSource();                      // may be null on a stack without a JobSystem
            long tick = _sim.TickCount;
            int w = world.Width, h = world.Height;
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                for (int y = 0; y < h; y++)
                    for (int x = 0; x < w; x++)
                    {
                        if ((level.Flags[level.Index(x, y)] & (byte)TileFlags.Stockpile) == 0) continue;
                        var pos = new Int3(x, y, z);
                        // ACCEPT-ALL IS THE ABSENCE OF AN ENTRY (StockZoneSystem's whole back-compat
                        // story), so an unfiltered tile ships the derived accept-all mask rather than
                        // 0 — which would read as "accepts nothing", the exact inverse of the truth.
                        ulong mask = StockZoneSystem.AcceptAllMask;
                        if (stock != null && stock.TryGetFilter(pos, out ulong m)) mask = m;
                        int flags = 0;
                        if (haul != null && haul.IsBackedOff(pos, tick, out _)) flags |= WireFormat.ZoneFlagBackedOff;
                        _zonesScratch.Add(new WireFormat.ZoneTile(x, y, z, mask, flags));
                    }
            }
            return _zonesScratch;
        }

        /// <summary>
        /// The sparse MARK layer for the standard surface — one <see cref="WireFormat.MarkCell"/> per
        /// tile carrying debris, a dig order, a stockpile zone or a strip order, read from the
        /// AUTHORITATIVE registries rather than from the projected <c>cell[1]</c> byte. See
        /// <c>WireFormat.Marks.cs</c> for what this channel is, why it is called <c>marks</c> and not
        /// <c>designations</c>, and the three live defects on <c>--ship grid</c> it removes.
        ///
        /// PRECEDENCE AND THE FOG GATE ARE <c>GlyphMapper</c> PASS 1'S, LINE FOR LINE — fog first,
        /// then dig ▸ stockpile ▸ strip ▸ debris. That is not tidiness: it is what keeps this channel
        /// and the frame from ever disagreeing about what a tile IS. They may now disagree only about
        /// whether someone is standing on it, which is the entire point of the package.
        ///
        /// ORDER — z, y, x, GUARANTEED BY THE WALK AND BY NOTHING ELSE, exactly as
        /// <see cref="BuildZones"/> and <see cref="BuildMaterials"/>. The one non-plane source, the
        /// deconstruct registry, is queried by KEY (<see cref="DeconstructSystem.TryGet"/>), never
        /// enumerated, so no container layout reaches the socket. Re-ordering the loops is the only
        /// way to change the byte order, which is what <c>MarksChannelTests</c> pins.
        ///
        /// COST, AND IT IS THE ONE HONEST WORRY ON THIS CHANNEL. This is a third full pass over the
        /// world per render (≤10 Hz, on the sim thread inside <see cref="Render"/>, NOT a tick path),
        /// and unlike <c>zones</c> and <c>materials</c> it is NOT empty on an untouched ship: the grid
        /// ship boots a wreck, so the payload has real volume from tick 0 and <see cref="Send"/> then
        /// rebuilds and string-compares it every render for as long as the game runs. MEASURED, on the
        /// fully-revealed grid ship (the worst case for the walk): <b>+61 microseconds per render</b>
        /// — 345.2 vs 284.0 µs over 4 000 renders — i.e. ~0.06 % of one core at 10 Hz. The scratch
        /// list is reused so a steady state allocates only the payload string, and the registry probe
        /// is short-circuited by <c>anyStrip</c> so a ship with nothing condemned pays one bool per
        /// tile and no lookup at all. The PAYLOAD size is deliberately not quoted here: it is
        /// fog-dependent and therefore a moving snapshot, not a constant (see
        /// <c>MarksChannelTests.The_Boot_Payload_Census_Per_Ship_Is_Pinned</c>).
        /// </summary>
        private readonly List<WireFormat.MarkCell> _marksScratch = new List<WireFormat.MarkCell>();
        private List<WireFormat.MarkCell> BuildMarks()
        {
            _marksScratch.Clear();
            var world = _sim.World;
            var strip = _sim.Deconstruct;                 // may be null on a reduced system stack
            bool anyStrip = strip != null && strip.Pending.Count > 0;
            int w = world.Width, h = world.Height;
            for (int z = 0; z < world.Depth; z++)
            {
                var level = world.Levels[z];
                for (int y = 0; y < h; y++)
                    for (int x = 0; x < w; x++)
                    {
                        int i = level.Index(x, y);
                        byte flags = level.Flags[i];
                        // FOG FIRST, mirroring GlyphMapper pass 1. An unexplored tile emits nothing:
                        // debris is TERRAIN, and shipping it through fog would turn a rendering fix
                        // into a fog-of-war change.
                        if ((flags & (byte)TileFlags.Explored) == 0) continue;

                        // PRECEDENCE: dig ▸ strip ▸ stockpile ▸ debris. AN ORDER OUTRANKS A ZONE, AND
                        // THAT IS THE WHOLE RULE. Ranking stockpile above strip — which is what pass 1
                        // does, and what the first draft of this file copied — makes a CONDEMNED DEVICE
                        // INSIDE A STOCKPILE ZONE draw no ✕ anywhere: the Room Zoom's mark layer skips
                        // the stockpile kind on purpose (the `zones` channel owns that tile) and the
                        // Overview draws a slate tint instead of the order. That is a live regression
                        // of the exact bug that cost three owner reports, and it is reachable with two
                        // ordinary clicks. See the retraction in WireFormat.Marks.cs's header.
                        //
                        // NOTE WHY COPYING PASS 1 WAS WRONG EVEN THOUGH PASS 1 IS RIGHT: pass 4 of
                        // GlyphMapper RE-APPLIES GlyphColor.Deconstruct over a condemned device
                        // unconditionally, AFTER pass 1's ranking, so pass 1's stockpile-over-strip
                        // order never gets the last word on the tile that matters. The frame's real
                        // behaviour is strip-over-stockpile; this now matches it.
                        int kind;
                        if ((flags & (byte)TileFlags.Designated) != 0) kind = WireFormat.MarkDig;
                        else if (anyStrip && strip.TryGet(new Int3(x, y, z), out _)) kind = WireFormat.MarkStrip;
                        else if ((flags & (byte)TileFlags.Stockpile) != 0) kind = WireFormat.MarkStockpile;
                        else if (IsDebrisTile(level, i)) kind = WireFormat.MarkDebris;
                        else continue;

                        _marksScratch.Add(new WireFormat.MarkCell(x, y, z, kind));
                    }
            }
            return _marksScratch;
        }

        /// <summary>
        /// The sparse GROUND ITEM layer for the standard surface — one <see cref="WireFormat.ItemCell"/>
        /// per <see cref="ItemStack"/> lying on a tile, read from <c>sim.Items</c> DIRECTLY and never
        /// from the projection. See <c>hosts/web/WireFormat.Items.cs</c> for the three separate things
        /// the projected glyph loses (the count, every stack but the last, and anything sharing a tile
        /// with a device) and for why carried stacks are deliberately absent.
        ///
        /// ORDER — STORE ORDER, and NOT the z,y,x world walk <see cref="BuildZones"/>,
        /// <see cref="BuildMarks"/> and <see cref="BuildMaterials"/> use. Those three are per-TILE
        /// layers with at most one row per tile, so a geometric walk is their natural order. This one
        /// is per-ENTITY and can carry several rows for one tile, so it emits in the order the entity
        /// store holds them — which is exactly the order <c>GlyphMapper</c> pass 3 draws in (so
        /// "topmost" and "last on the wire" mean the same thing), is a plain <c>List</c> index walk
        /// rather than any hash container's layout, and is part of the saved, hashed state. Pinned by
        /// <c>ItemsChannelTests.Items_Are_Emitted_In_Store_Order</c>.
        ///
        /// COST — MEASURED, not argued. One pass over the ITEM STORE per render (≤10 Hz, on the sim
        /// thread inside <see cref="Render"/>, NOT a tick path): O(items), not O(world), so it is
        /// structurally cheaper than the three world walks above. The numbers, taken in independent
        /// review by timing <c>BuildItems</c> + <see cref="WireFormat.Items"/> against a full
        /// <see cref="Render"/> on the same machine:
        ///
        ///   <c>--ship grid</c>    7 rows,   124 B,  <b>~0.9 µs</b> against a ~392 µs render — <b>0.2 %</b>
        ///   <c>--ship slice</c>  212 rows,  2.8 KB, <b>~14 µs</b>  against a ~312 µs render — <b>~4.5 %</b>
        ///
        /// HOW TO READ THEM HONESTLY: <b>n = 1, one machine, DEBUG build</b>, and both channel figures
        /// are UPPER BOUNDS (the harness reached the private builder by reflection, which is charged to
        /// the channel and not to the render). The playable ship pays two tenths of one percent; the
        /// headless measurement fixture pays ~4.5 % because it boots two orders of magnitude more
        /// stacks, and it has no UI at all. Both are well inside <c>marks</c>' +61 µs, which is the
        /// only render cost this programme has previously judged worth accepting.
        ///
        /// The scratch list is reused, so a steady state allocates only the payload string, and a ship
        /// with nothing on the floor ships <c>{"type":"items","cells":[]}</c>, which <see cref="Send"/>
        /// then dedupes forever.
        ///
        /// VIEW-ONLY: a read of authoritative state, never a write, never hashed.
        /// </summary>
        private readonly List<WireFormat.ItemCell> _itemsScratch = new List<WireFormat.ItemCell>();
        private List<WireFormat.ItemCell> BuildItems()
        {
            _itemsScratch.Clear();
            var world = _sim.World;
            var items = _sim.Items.Items;
            for (int n = 0; n < items.Count; n++)
            {
                var item = items[n];
                // CARRIED STACKS RIDE THEIR CARRIER — `Pos` mirrors the person, not a place the item
                // is. See WireFormat.Items.cs's header for why this channel refuses them rather than
                // inheriting the rule from GlyphMapper pass 3.
                if (item.CarriedBy != 0) continue;
                var p = item.Pos;
                // Bounds first, defensively: an out-of-range Pos would index the flag plane and throw
                // on the render thread. GlyphMapper's own `Explored` helper checks bounds for the same
                // reason.
                if (!world.InBounds(p)) continue;
                // FOG GATE, mirroring GlyphMapper pass 3 (whose gate is pass 1's, and is FIRST). An
                // item in the dark emits nothing: shipping it would widen what the player knows.
                if ((world.GetFlags(p) & TileFlags.Explored) == 0) continue;
                _itemsScratch.Add(new WireFormat.ItemCell(p.X, p.Y, p.Z, (int)item.Kind, item.Count));
            }
            return _itemsScratch;
        }

        /// <summary>
        /// The sparse DEVICE WEAR layer for the standard surface — one
        /// <see cref="WireFormat.DeviceCell"/> per tile-resident <see cref="Device"/>, read from
        /// <c>sim.Devices</c> DIRECTLY and never from the projection. See
        /// <c>hosts/web/WireFormat.Devices.cs</c> for what the projected cell loses (a device's
        /// <see cref="Device.Condition"/> has NEVER reached the client in any form), why utility
        /// overlays are excluded, and what fields are deliberately absent.
        ///
        /// ORDER — STORE ORDER, the same choice <see cref="BuildItems"/> makes and for the same
        /// reason: this is a per-ENTITY layer, not one of the per-TILE layers <see cref="BuildZones"/>
        /// / <see cref="BuildMarks"/> / <see cref="BuildMaterials"/> emit on a z,y,x world walk. It is
        /// the order <c>GlyphMapper</c> pass 4 walks, a plain <c>List</c> index walk rather than any
        /// hash container's layout, and part of the saved, hashed state.
        ///
        /// ⚠️ COST — MEASURED, NOT ARGUED, AND THIS IS THE MOST EXPENSIVE SPARSE CHANNEL SHIPPED SO
        /// FAR. It is stated plainly rather than framed favourably. Method: a delegate bound once to
        /// this builder (NOT <c>MethodInfo.Invoke</c> per call, which costs more than the method and
        /// would be charged to the channel), 200 iterations per sample, <b>median of n = 5</b>, DEBUG
        /// build, one machine, at boot with no other suite running:
        ///
        ///   <c>--ship grid</c>   146 rows, 2 562 B, <b>~26 µs</b> against a ~425 µs render — <b>~6.1 %</b>
        ///   <c>--ship slice</c> 104 rows, 1 870 B, <b>~13 µs</b> against a ~346 µs render — <b>~3.9 %</b>
        ///
        /// FOR COMPARISON the <c>items</c> channel is 0.2 % on grid and <c>marks</c> costs +61 µs, which
        /// is the largest render cost this programme has previously judged worth accepting. This one is
        /// smaller than <c>marks</c> in absolute terms (~26 µs) and larger as a share, because grid has
        /// 146 devices and 7 ground stacks. In wall-clock terms it is ~0.26 ms per second at the ≤10 Hz
        /// render cadence.
        ///
        /// THE COUNTERFACTUAL, measured the same way and the reason the overlay exclusion is not a
        /// micro-optimisation: WITH conduits and pipes the same channel is <b>1 110 rows, 19 066 B and
        /// ~146 µs</b> on grid — ~34 % of the render and ~190 KB/s on the socket — to carry a byte that
        /// <c>machines.def</c> makes a constant.
        ///
        /// TWO-THIRDS OF THAT COST IS THE SERIALIZATION, NOT THIS BUILDER — measured separately in
        /// independent review, which read <b>~10.7 µs for the build against a ~29.4 µs total</b> on
        /// grid. That matters for what the fix has to be: a cheaper loop here buys a third of it at
        /// most, and only emitting fewer rows removes the rest.
        ///
        /// ⛔ AND IT IS A CONDITION ON THE NEXT LANE RATHER THAN AN OPTION FOR IT: the delta /
        /// dirty-version scheme MUST land in the SAME package as the art that first draws this
        /// channel. The full statement, with the sketch and why a coarser quantisation is not a
        /// substitute, is in the header of <c>hosts/web/WireFormat.Devices.cs</c> — it is written there
        /// because that header is the wire contract, and a delta scheme changes it.
        ///
        /// ⚠️ THE SOCKET COST IS SMALLER THAN THE CPU COST, BUT NOT BY AS MUCH AS THE PER-DEVICE
        /// FIGURE SUGGESTS, and the first draft of this paragraph overstated it. <see cref="Send"/>
        /// dedupes by whole-payload string equality, so the window is the MINIMUM over every row, not
        /// the per-device rate. One device is enough: the fastest-wearing kinds lose 0.020 Condition
        /// per operating hour (<c>machines.def</c>), which is ~5 quantiser steps an hour, so ONE
        /// machine changes its byte about every 7 200 ticks — but grid runs tens of them at once, and
        /// they are not in phase. The payload therefore changes far more often than any single row
        /// does, and at 100×/1000× speed it changes on most renders. The volatile fields
        /// (<c>Powered</c>, <c>Progress</c>, <c>StoredLiters</c>) are still off the tuple for the same
        /// reason — they would make it change on EVERY render, on a ship where nothing is wearing at
        /// all — but "normally deduped away entirely" would have been a comfortable claim rather than
        /// a measured one, and it is retracted rather than softened. The ~26 µs is CPU spent either
        /// way; only the ~2.5 KB is at stake here.
        ///
        /// The scratch list is reused, so a steady state allocates only the payload string.
        ///
        /// VIEW-ONLY: a read of authoritative state, never a write, never hashed.
        /// </summary>
        private readonly List<WireFormat.DeviceCell> _devicesScratch = new List<WireFormat.DeviceCell>();
        private List<WireFormat.DeviceCell> BuildDevices()
        {
            _devicesScratch.Clear();
            var world = _sim.World;
            var defs = _sim.Defs;
            var devices = _sim.Devices.Items;
            for (int n = 0; n < devices.Count; n++)
            {
                var device = devices[n];
                // UTILITY OVERLAYS ARE NOT TILE-RESIDENT — they never enter `_deviceGrid`, GlyphMapper
                // pass 4 skips them by the same test, and neither standard surface draws them. They are
                // also wear-free in machines.def and 88% of the device store on `--ship grid`. See the
                // header of WireFormat.Devices.cs; the wear-free half is pinned by a test rather than
                // restated here, so giving a conduit a wear rate fails loudly.
                if (Simulation.IsUtilityOverlay(device.Kind)) continue;
                var p = device.Pos;
                // Bounds first, defensively: an out-of-range Pos would index the flag plane and throw
                // on the render thread — the same guard BuildItems takes for the same reason.
                if (!world.InBounds(p)) continue;
                // FOG GATE, mirroring GlyphMapper pass 4 (whose gate is pass 1's, and is FIRST). A
                // device in the dark emits nothing: shipping it would widen what the player knows.
                if ((world.GetFlags(p) & TileFlags.Explored) == 0) continue;
                _devicesScratch.Add(new WireFormat.DeviceCell(
                    p.X, p.Y, p.Z, (int)device.Kind,
                    WireFormat.ConditionByte(device.Condition),
                    device.IsOperational(defs) ? 1 : 0));
            }
            return _devicesScratch;
        }

        /// <summary>
        /// True when the tile's TERRAIN reads as rubble — the exact condition under which
        /// <c>GlyphMapper</c> pass 1 emits <c>GlyphColor.Debris</c>, restated here rather than shared
        /// because the mapper's version is fused into a glyph+colour decision inside the projection.
        ///
        /// THE WALL PLANE WINS: a standing wall is a wall whatever is under it, so <c>Wall</c> returns
        /// false before the floor is ever consulted; a Debris WALL is rubble; and only a tile whose
        /// wall is neither (an open tile) falls through to its floor, where a Debris FLOOR is also
        /// rubble.
        ///
        /// ⚠️ AN EARLIER DRAFT OF THIS COMMENT CLAIMED *"Swap the two plane reads and every
        /// wall-choked wreck tile on the grid ship stops being a mark."* THAT IS FALSE, MEASURED: on
        /// both authored ships <c>Wall == Debris</c> and <c>Floor == Debris</c> are the SAME tiles
        /// (48 of each on Perilune, 60 on Grid, intersection 48 / 60 — the two planes are written
        /// together), and there is NOT ONE standing wall over a debris floor anywhere. So on shipped
        /// content a floor-first read is an EQUIVALENT MUTANT and swapping the planes changes nothing.
        /// The ordering still matters as a RULE — pass 1 draws a walled tile as a wall, so marking
        /// rubble underneath it would mark something the player cannot see — and it is pinned on a
        /// synthetic disagreement instead of on content that cannot produce one
        /// (<c>MarksChannelTests.A_Standing_Wall_Beats_A_Debris_Floor_Under_It</c>).
        /// </summary>
        private static bool IsDebrisTile(ZLevel level, int i)
        {
            ushort wall = level.Wall[i];
            if (wall == TileDefs.Wall) return false;
            if (wall == TileDefs.Debris) return true;
            return level.Floor[i] == TileDefs.Debris;
        }

        /// <summary>The live <see cref="HaulJobSource"/> out of the running stack, resolved ONCE
        /// (the <c>HaulJobSource._stockZones</c> / <c>DeconstructJobSource</c> lazy-resolve precedent:
        /// a reader owns its own dependency rather than growing <see cref="Simulation"/> a convenience
        /// accessor — <c>Simulation.cs</c> is a spine file). Indexed loops over an array and an
        /// <c>IReadOnlyList</c>, so nothing is enumerated out of a hash container. Null when the stack
        /// registers no <see cref="JobSystem"/> or no haul source, in which case the back-off bit is
        /// simply never set — an honest "we cannot know", not a fabricated zero.</summary>
        private HaulJobSource _haulSource;
        private bool _haulSourceResolved;
        private HaulJobSource HaulSource()
        {
            if (_haulSourceResolved) return _haulSource;
            _haulSourceResolved = true;
            var systems = _sim.Systems;
            for (int i = 0; i < systems.Length; i++)
            {
                if (!(systems[i] is JobSystem js)) continue;
                for (int s = 0; s < js.Sources.Count; s++)
                    if (js.Sources[s] is HaulJobSource h) { _haulSource = h; return _haulSource; }
            }
            return null;
        }

        // Reused scratch for TaskLabel — BuildRoster runs on the sim thread inside Render (≤10 Hz,
        // one call at a time), so a single shared builder is safe and keeps the label path from
        // littering the heap with intermediate concatenations.
        private readonly System.Text.StringBuilder _task = new System.Text.StringBuilder(48);

        /// <summary>
        /// A short, HONEST label for what a crew member is doing right now — it NAMES the thing:
        /// the machine being serviced, the item being carried and where to, the build site and its
        /// material ledger, the tile being dug. The label always opens with a stable verb
        /// (Digging / Fetching / Hauling / Eating / Drinking / Crafting / Servicing / Building /
        /// Heading / Walking / Holding / Idle); the client's on-map work marker classifies on that first word
        /// (`taskTag` in console-model.js) and treats the en-route verb Heading as "has a job but
        /// is not working yet" (`watchTask`), so KEEP THE VERB SET AND THE CLIENT MAP IN STEP.
        ///
        /// The old catch-all reported "walking" for every job-less crew member — 99.9% of all
        /// labels in the playtest — which read as "busy" when the truth was "nothing assigned".
        /// A job-less walker now says so out loud, and a parked crew member reads Idle/Holding.
        ///
        /// The label always names the JOB and its object. It does NOT claim the work has started:
        /// a crew member still crossing the deck reads "Heading to service scrubber_ls", and only
        /// switches to "Servicing scrubber_ls" once they have arrived. The playtest complaint was
        /// "claimed to be fixing X while doing nothing visible", and an activity verb (plus its
        /// on-map SVC tag) floating over a walking pawn is that same claim. `HasPath` is the ground
        /// truth — the very predicate the job-less branch below already reads.
        ///
        /// Transit-shaped jobs (Fetching/Hauling/Eating) already say they are in transit, so they
        /// keep their verb. A crew member with NO job reads Walking / Holding / Idle.
        ///
        /// PURE READ: device/item/build lookups only ever read; nothing here mutates the sim or
        /// touches the RNG. `task` is a pre-existing roster field, so no wire shape moves.
        /// </summary>
        private string TaskLabel(Citizen c)
        {
            var sb = _task;
            sb.Clear();
            // Still walking to the job site ⇒ the work has NOT started; say so instead of
            // asserting an activity the player cannot see (and that the map would tag).
            bool enRoute = c.HasPath;
            switch (c.JobKind)
            {
                case JobKind.Dig:
                    sb.Append(enRoute ? "Heading to dig out " : "Digging out ");
                    AppendTile(sb, c.JobTarget, c.Pos.Z);
                    break;
                case JobKind.HaulPickup:
                    sb.Append("Fetching ").Append(ItemLabel(c.ReservedItemId)).Append(" at ");
                    AppendTile(sb, c.JobTarget, c.Pos.Z);
                    break;
                case JobKind.HaulDeliver:
                    sb.Append("Hauling ").Append(ItemLabel(c.CarryingItemId)).Append(" to ");
                    AppendTile(sb, c.JobTarget, c.Pos.Z);
                    break;
                case JobKind.Eat:
                    sb.Append("Eating");
                    if (c.Pos != c.JobTarget) { sb.Append(" - food at "); AppendTile(sb, c.JobTarget, c.Pos.Z); }
                    break;
                case JobKind.Drink:
                    sb.Append(enRoute ? "Heading to drink at " : "Drinking at ")
                      .Append(DeviceLabel(c.JobTarget, "a water tank"));
                    break;
                case JobKind.Craft:
                    sb.Append(enRoute ? "Heading to work at " : "Crafting at ")
                      .Append(DeviceLabel(c.JobTarget, "a workstation"));
                    break;
                case JobKind.Maintain:
                    sb.Append(enRoute ? "Heading to service " : "Servicing ")
                      .Append(DeviceLabel(c.JobTarget, "a machine"));
                    break;
                case JobKind.HaulToBuild:
                    sb.Append("Hauling ").Append(ItemKindLabel(BuildSystem.Material))
                      .Append(" to ").Append(BuildSiteLabel(c.JobTarget)).Append(' ');
                    AppendTile(sb, c.JobTarget, c.Pos.Z);
                    AppendBuildLedger(sb, c.JobTarget);
                    break;
                case JobKind.Build:
                    sb.Append(enRoute ? "Heading to build " : "Building ")
                      .Append(BuildSiteLabel(c.JobTarget)).Append(' ');
                    AppendTile(sb, c.JobTarget, c.Pos.Z);
                    break;
                case JobKind.Deconstruct:
                    // E0-5: build's inverse. One JobKind, two targets — the tile tells them apart,
                    // because a device site always has a device standing on it and a wall site
                    // never does. Saying "the wall" over a scrubber was a lie WP-2 had to fix.
                    if (_sim.TryGetDeviceAt(c.JobTarget, out _))
                    {
                        sb.Append(enRoute ? "Heading to strip " : "Stripping ")
                          .Append(DeviceLabel(c.JobTarget, "a machine")).Append(' ');
                    }
                    else
                    {
                        sb.Append(enRoute ? "Heading to strip the wall at " : "Stripping the wall at ");
                    }
                    AppendTile(sb, c.JobTarget, c.Pos.Z);
                    break;
                case JobKind.Flee:
                    sb.Append("Heading to safe air"); // E0-2 crew-safety: fleeing unbreathable air
                    break;
                default:
                    // No job. Say which of the three job-less states this actually is.
                    if (c.HasPath)
                    {
                        sb.Append("Walking to ");
                        AppendTile(sb, c.Path[c.Path.Count - 1], c.Pos.Z);
                        sb.Append(" (no task)");
                    }
                    else if (c.HoldPosition) sb.Append("Holding position");
                    else sb.Append("Idle");
                    break;
            }
            return sb.ToString();
        }

        /// <summary>"x,y" — plus " on deck N" when the tile is off the citizen's own deck.</summary>
        private static void AppendTile(System.Text.StringBuilder sb, Int3 p, int ownDeck)
        {
            sb.Append(p.X.ToString(CultureInfo.InvariantCulture)).Append(',')
              .Append(p.Y.ToString(CultureInfo.InvariantCulture));
            if (p.Z != ownDeck) sb.Append(" on deck ").Append(p.Z.ToString(CultureInfo.InvariantCulture));
        }

        /// <summary>The delivered/required ledger of a build site, e.g. " (1/2)". Silent when the
        /// site is gone (resolved between job assignment and this render) or no BuildSystem runs.</summary>
        private void AppendBuildLedger(System.Text.StringBuilder sb, Int3 site)
        {
            if (_host.BuildSys == null || !_host.BuildSys.TryGet(site, out var b)) return;
            sb.Append(" (").Append(b.Delivered.ToString(CultureInfo.InvariantCulture)).Append('/')
              .Append(b.Required.ToString(CultureInfo.InvariantCulture)).Append(')');
        }

        /// <summary>"wall"/"floor"/"door" for a pending site; "the site" when the designation is gone.</summary>
        private string BuildSiteLabel(Int3 site)
        {
            if (_host.BuildSys != null && _host.BuildSys.TryGet(site, out var b))
                return b.Kind == BuildKind.Door ? "door" : b.Kind == BuildKind.Floor ? "floor" : "wall";
            return "the site";
        }

        /// <summary>The player-facing name of the device on a tile (MOSS id when it has one, else
        /// the kind), or <paramref name="fallback"/> when the tile carries no device. Resolved
        /// through the SIM's device grid (<see cref="Simulation.TryGetDeviceAt"/>) — the very same
        /// lookup MaintenanceSystem/SustenanceSystem use to find the job's device, so the label can
        /// never name a different device than the one the crew member is actually working on (a
        /// tile can carry a machine and a conduit at once; the host's own linear scan would pick
        /// whichever came first in store order).</summary>
        private string DeviceLabel(Int3 pos, string fallback)
        {
            if (!_sim.TryGetDeviceAt(pos, out var d) || d == null) return fallback;
            if (!string.IsNullOrEmpty(d.Name)) return d.Name;
            return d.Kind.ToString().ToLowerInvariant();
        }

        /// <summary>The plain-English name of a carried/reserved stack ("regolith", "food"), or
        /// "cargo" when the id no longer resolves.</summary>
        private string ItemLabel(uint itemId)
        {
            if (itemId == 0 || !_sim.Items.TryGet(itemId, out var st)) return "cargo";
            if (st.Kind == ItemKind.Corpse)
                return string.IsNullOrEmpty(st.Label) ? "a body" : st.Label + "'s body";
            return ItemKindLabel(st.Kind);
        }

        /// <summary>Plain-English name of an item kind (allocation-free: interned literals).</summary>
        private static string ItemKindLabel(ItemKind kind) => kind switch
        {
            ItemKind.Regolith => "regolith",
            ItemKind.MetalOre => "metal ore",
            ItemKind.Corpse => "a body",
            ItemKind.Potato => "food",
            ItemKind.Scrap => "scrap",
            ItemKind.Parts => "parts",
            ItemKind.ControllerModule => "a controller module",
            ItemKind.Seals => "seals",
            ItemKind.Ice => "ice",
            ItemKind.Swarf => "swarf",   // wreck start: what a machine too far gone for parts leaves
            _ => "cargo",
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
    public enum CmdKind { Unknown = 0, Cursor, Click, Move, Deck, Lens, Speed, Pause, Talk, Say, Bye, Chron, Moss, Build, Bio, Place, Remove, AddRoom, Dig, Stockpile, Strip, Filter, Commission }

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
        /// {"type":"moss","op":"open|set|audit|sys|exec","tid":"..","text"?}). Unknown/garbage ⇒
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
                    // {"cmd":"build","kind":"wall|floor|door|cancel","x":..,"y":..,"material":..} —
                    // designate/cancel a build at a tile on the current deck (see HandleBuild). The
                    // material byte (0 = default) rides on `i`; it is ignored for door/cancel.
                    case "build": return new WebCommand(CmdKind.Build, Int(json, "x"), Int(json, "y"), i: Int(json, "material"), name: Str(json, "kind"));
                    // E0-3 order verbs: mark/unmark a dig target or a stockpile zone at a tile on
                    // the current deck. `on` is EXPLICIT (1 = mark, 0 = clear) rather than a
                    // host-side read of world state, so a drag-sweep is idempotent and the host
                    // never races the sim over what the tile's flag currently is.
                    case "dig": return new WebCommand(CmdKind.Dig, Int(json, "x"), Int(json, "y"), i: Int(json, "on"));
                    case "stockpile": return new WebCommand(CmdKind.Stockpile, Int(json, "x"), Int(json, "y"), i: Int(json, "on"));
                    case "strip": return new WebCommand(CmdKind.Strip, Int(json, "x"), Int(json, "y"), i: Int(json, "on"));
                    // E0-4 WP-5 filter verb: {"cmd":"filter","x":..,"y":..,"mask":N} — set the
                    // COMPLETE accept-set of the stockpile tile at (x,y) on the current deck. The
                    // mask rides on `i` as a plain non-negative integer: ItemKind has 7 members, so
                    // every legal mask fits in 7 bits and never approaches int's range. It is always
                    // the WHOLE truth for that tile, never a per-kind delta — the same explicit
                    // contract dig/stockpile/strip chose, so a drag-sweep is idempotent and a
                    // repaint can never leave a stale restrictive filter behind.
                    //
                    // An ABSENT (or non-numeric) "mask" decodes to the -1 sentinel, NOT to 0: a mask
                    // of 0 is a real, reachable value here (accept nothing), so letting a missing key
                    // fall to 0 would turn a malformed line into "this zone refuses everything" — the
                    // most destructive reading available. -1 lands on HandleFilter's negative guard
                    // and is dropped, which is the same answer this protocol gives every other
                    // message it cannot express, through the same single drop site.
                    case "filter": return new WebCommand(CmdKind.Filter, Int(json, "x"), Int(json, "y"), i: Int(json, "mask", -1));
                    // {"cmd":"place","kind":"bunk|desk|chair|locker|plant|lamp|growbed|medbed|table",
                    //  "x":..,"y":..,"deck":..} — place a furniture device (Room Zoom decorate palette).
                    case "place": return new WebCommand(CmdKind.Place, Int(json, "x"), Int(json, "y"), i: Int(json, "deck"), name: Str(json, "kind"));
                    // {"cmd":"remove","x":..,"y":..,"deck":..} — remove a placed furniture device at a tile.
                    case "remove": return new WebCommand(CmdKind.Remove, Int(json, "x"), Int(json, "y"), i: Int(json, "deck"));
                    // E0-6 — fit a ControllerModule to the device on a tile, making it
                    // MOSS-scriptable. Same {x,y,deck} shape as place/remove.
                    case "commission": return new WebCommand(CmdKind.Commission, Int(json, "x"), Int(json, "y"), i: Int(json, "deck"));
                    // {"cmd":"addroom","deck":..,"slot":..,"type":"medbay|.."} — commission an empty hall
                    // into a live typed room (Overview ＋ADD ROOM). X=deck, Y=slot, name=roomType string.
                    case "addroom": return new WebCommand(CmdKind.AddRoom, Int(json, "deck"), Int(json, "slot"), name: Str(json, "type"));
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
                case "bio": return new WebCommand(CmdKind.Bio, cid: (uint)Int(json, "cid"));
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

        private static int Int(string s, string key) => Int(s, key, 0);

        /// <summary>As <see cref="Int(string,string)"/>, but returns <paramref name="missing"/> when
        /// the key is absent OR its value has no digits — letting a caller tell "not stated" apart
        /// from a real 0. The two-argument form passes 0 and is therefore byte-identical to what it
        /// always did; only the E0-4 <c>filter</c> case asks for a sentinel, because a mask of 0 is a
        /// REAL value there (accept nothing) and must not be what an absent key decodes to.</summary>
        private static int Int(string s, string key, int missing)
        {
            int v = ValueStart(s, key);
            if (v < 0) return missing;
            int sign = 1;
            if (v < s.Length && s[v] == '-') { sign = -1; v++; }
            int n = 0; bool any = false;
            while (v < s.Length && s[v] >= '0' && s[v] <= '9') { n = n * 10 + (s[v] - '0'); v++; any = true; }
            return any ? sign * n : missing;
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
