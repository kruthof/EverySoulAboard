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
                //
                // ⚠️ `blocked` IS ON THE LIST, and it is the `materials` case rather than the `ledger`
                // case — which is why it is listed rather than left to self-heal. Its payload is a
                // function of what the PLAYER painted and of compartment air, both of which can sit
                // unchanged for hours: a reconnecting tab would show a screenful of orders with no
                // explanation for exactly as long as nobody paints anything, and "the game does not say
                // why" is the one failure this channel exists to remove. The measured `materials`
                // consequence (0 messages in 4 s on a live reconnect) is the shape it would take.
                //
                // ⚠️ `work` (M2-4) IS ON THE LIST, and it is the `materials`/`blocked` case rather than
                // the `ledger` one. Its payload is a function of what the PLAYER set and of who is
                // alive, both of which can sit unchanged for hours — under OD-H it is empty until the
                // first order and then changes only when the player touches the grid again. A
                // reconnecting tab left to self-heal would therefore show an EMPTY work grid for
                // exactly as long as nobody clicks: the player's own orders, invisible, which is the
                // measured `materials` consequence (0 messages in 4 s) applied to state the player
                // typed in themselves.
                // ⚠️ `ending` (M3-5) IS ON THE LIST, and it is the strongest case on it. Its payload
                // changes at most twice in a whole run and then never again — a reconnecting tab
                // left to self-heal would show NO banner on a ship whose entire crew is dead, for
                // ever, because nothing will ever change it back. "The run is over and the game does
                // not say so" is precisely the silence this channel exists to remove.
                // ⭐ `workcaps` (M3-7) IS ON THE LIST, and its case is STRONGER than `work`'s. Nothing
                // in the sim writes a skill or an incapability yet, so this payload can be constant for
                // an ENTIRE RUN — a reconnecting tab left to self-heal would show a crew with no
                // competences and no incapabilities for ever, because nothing will ever change it back.
                // That is the `ending` argument, not the `ledger` one.
                foreach (var key in new[] { "frame", "light", "status", "metrics", "legend", "log", "inspect", "roster", "designs", "terminals", "relations", "systems", "decks", "rooms", "decor", "zones", "marks", "items", "devices", "work", "workcaps", "blocked", "ending" })
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
                // The OPERATE verb. Returns FALSE — it changes no VIEW state (no cursor, no deck, no
                // lens), and the return value of this switch is only "re-render even though the sim is
                // paused". The reply is Emit-ted from inside the handler, exactly as Talk/Bio/Chron do
                // on the three lines below, all of which return false for the same reason.
                case CmdKind.Operate: HandleOperate(cmd); return false;
                // M2-4 — the work-priority order. Returns FALSE for the same reason OPERATE does: it
                // moves no VIEW state (no cursor, no deck, no lens), and this switch's return value only
                // means "re-render even though the sim is paused". The `work` channel picks the new byte
                // up off `sim.Citizens` on the next render, which the sim loop takes anyway.
                case CmdKind.WorkPriority: HandleWorkPriority(cmd); return false;
                // ⭐ M2-9 — the direct order ("that machine, now"). Returns TRUE, unlike the two
                // above, and the difference is not a slip: this handler writes HOST VIEW STATE
                // (`_prioritised`, the pending-order record the `blocked` channel reads), so a
                // right-click taken while the sim is PAUSED must still repaint — otherwise the
                // "NO PARTS OR SEALS ABOARD" answer to that click waits for the player to unpause.
                case CmdKind.Prioritise: HandlePrioritise(cmd); return true;
                // ⭐ M1-L: `case CmdKind.AddRoom: HandleAddRoom(cmd); return true;` is DELETED, with
                // the `"addroom"` parse case and the two private methods behind it. The verb is
                // UNREACHABLE end to end: no client sender, no parse, no route. ⭐ M1-L-b then
                // deleted the `CmdKind.AddRoom` MEMBER and the sim's `AddRoomCommand` as well (see
                // the enum's own note for the renumber that took).
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
        ///   pods  → ⭐ M3-4: the POD BAY census — one row per CryoPod, each carrying the gate's own
        ///           verdict (state, refusal ordinal, sentence, and whether it may cycle). A READ.
        ///   thaw  → ⭐ M3-3: ask the ship to wake the capsule named in `text`, through the console
        ///           named in `tid`. Renders ThawGate's verdict and enqueues ThawCommand.
        ///   dryrun→ RESERVED (compile-only preview); not implemented.
        /// Unknown op ⇒ ignored.
        ///
        /// <para>⭐⭐ <b>M3-15 / OD-N — THE SPLIT GATE, op by op.</b> Until this package
        /// <b>nothing whatsoever gated this method</b>: it took a <c>tid</c>, switched on <c>op</c>,
        /// and asked no question about any device — so on <c>--ship wreck</c> at tick 0 a player
        /// could open the MOSS tab and type <c>open door_d0_s1</c> and the door opened. The console
        /// was the wider hole, not the Room Zoom's click.</para>
        /// <list type="table">
        ///   <item><term><c>sys</c> · <c>audit</c> · <c>exec</c></term><description><b>REPAIRED
        ///   tier</b> — <see cref="MossGate.IsServerLive"/>. Reading the ship, or writing one device
        ///   one line at a time, needs a working computer. This covers the DEVICE verbs
        ///   (<c>open</c>/<c>close</c>/<c>lock</c>/<c>unlock</c>), <c>set &lt;dev&gt;.rate</c> and
        ///   bare property reads, because all three leave <see cref="ExecConsole"/> through the same
        ///   adapter and the same two <see cref="ISimCommand"/>s. ⚠️ Scoping <c>set rate</c> with the
        ///   device verbs is THIS package's ruling and not the owner's: OD-N's line is <i>manual vs
        ///   scripted</i>, and splitting one command across two tiers is the only cut it forbids by
        ///   construction.</description></item>
        ///   <item><term><c>open</c> · <c>set</c> (program source / install)</term><description>
        ///   <b>COMMISSIONED tier</b> — <see cref="MossGate.CanInstallProgram"/>, which IS
        ///   <c>SetScriptCommand</c>'s own predicate. A program is scripting, and scripting costs a
        ///   <c>ControllerModule</c>.
        ///   ⭐ <c>SetScriptCommand</c> has refused this since E0-6 with a bare <c>return;</c>
        ///   (<c>Commands.cs:376</c>); the refusal becomes VISIBLE here.</description></item>
        ///   <item><term><c>thaw</c> (M3-3) · <c>pods</c> (M3-4)</term><description><b>COMMISSIONED
        ///   tier</b>, through <see cref="ThawGate"/>'s own term 2 — but M3-4 put the SHIP gate in
        ///   front of both, because a dark ship answering <i>NO SUCH POD</i> is a computer that is
        ///   off giving an opinion about a capsule.</description></item>
        /// </list>
        /// <para>⛔ <b>EVALUATION ORDER IS PART OF THE CONTRACT: THE SHIP GATE IS ASKED FIRST, THE
        /// TARGET'S OWN FAULT SECOND.</b> The two predicates are disjoint — <i>is a MOSS server live
        /// aboard?</i> is a property of the SHIP, <i>is this terminal commissioned?</i> (and, from
        /// M3-16, <i>is this device's board dead?</i>) of the TARGET — so both can be true at once
        /// and nothing else states which sentence the player gets. A player on a dead-computer ship
        /// must be told MOSS IS OFFLINE, not sent across the pressure frontier to fit a module.
        /// The <see cref="OperateAdvisory"/> precedent, whose own <c>else if</c> ordering is pinned
        /// for the same reason.</para>
        /// <para>⚠️ <b><c>default: break;</c> IS A SILENT SWALLOW AND A GATED OP MUST NOT JOIN IT.</b>
        /// Every refusal replies — <see cref="Refuse"/> puts it on <c>MossExec</c>'s stream-2 line,
        /// which the console transcript already renders on every screen.</para>
        /// </summary>
        private void HandleMoss(WebCommand cmd)
        {
            string tid = cmd.Tid;
            if (string.IsNullOrEmpty(tid)) return;
            switch (cmd.Op)
            {
                case "sys":
                {
                    // ⚠️ A REFUSED `sys` ALSO CLEARS THE DETAIL SCREEN'S `loading` STATE, and both
                    // halves are needed. The client opens DETAIL empty-and-loading and waits for a
                    // `sys` reply (moss-model.js `openDetail`), so a refusal that only wrote a
                    // transcript line would leave `LOADING…` on screen for ever beside it — a
                    // contradiction, and the invisible-feedback defect wearing a different hat. The
                    // empty reply carries the refusal as its DERIVATION note, which is the field
                    // that already exists for "how this table was computed".
                    if (!MossGate.IsServerLive(_sim))
                    {
                        Refuse(tid, MossGate.OfflineRefusal);
                        Emit(WireFormat.MossSys(tid, Array.Empty<ShipSystemDevice>(),
                                                MossGate.OfflineRefusal));
                        break;
                    }
                    Emit(WireFormat.MossSys(tid, ShipSystems.ComputeDetail(_sim, tid),
                                            ShipSystems.Derivation(tid)));
                    break;
                }
                case "exec":
                {
                    if (!MossGate.IsServerLive(_sim)) { Refuse(tid, MossGate.OfflineRefusal); break; }
                    var (ok, lines) = ExecConsole(cmd.Text);
                    Emit(WireFormat.MossExec(tid, ok, lines));
                    break;
                }
                case "open":
                {
                    if (!MossGate.IsServerLive(_sim)) { Refuse(tid, MossGate.OfflineRefusal); break; }
                    if (!MossGate.CanInstallProgram(_sim, tid))
                    { Refuse(tid, MossGate.NotCommissionedRefusal(tid)); break; }
                    string src = CurrentMossSource(tid);
                    Emit(WireFormat.MossSource(tid, src));
                    Emit(WireFormat.MossDiag(tid, MossCompiler.Compile(src).Diagnostics));
                    break;
                }
                case "set":
                {
                    if (!MossGate.IsServerLive(_sim)) { Refuse(tid, MossGate.OfflineRefusal); break; }
                    // ⭐ THE SPLIT'S OWN LEG, AND THE ONE A REVIEWER SKIPS. A REPAIRED `term_moss`
                    // opens doors one line at a time; installing a PROGRAM on it still refuses until
                    // a ControllerModule is fitted.
                    //
                    // ⚠️ ASKED THROUGH `MossGate.CanInstallProgram`, WHICH IS `SetScriptCommand`'s
                    // OWN PREDICATE — and deliberately NOT through `ThawGate.IsCommissionedConsole`,
                    // even though both are "the commissioned tier". The thaw's term 2 also requires
                    // the named terminal to EXIST and be powered and operational; `SetScriptCommand`
                    // deliberately allows a tid with NO device behind it (a free-text key several
                    // tests and `hosts/scenario` drive). Reporting the stricter one here would make
                    // this line refuse installs the command it is about to enqueue would ACCEPT —
                    // a surface disagreeing with the sim, which is the defect either way round.
                    if (!MossGate.CanInstallProgram(_sim, tid))
                    { Refuse(tid, MossGate.NotCommissionedRefusal(tid)); break; }
                    string text = cmd.Text ?? "";
                    var diags = _host.Moss.SetProgram(tid, text); // compile + install (tick-boundary safe)
                    _mossSource[tid] = text;
                    _sim.EnqueueCommand(new SetScriptCommand(tid, text)); // canonical/saved source
                    Emit(WireFormat.MossDiag(tid, diags));
                    break;
                }
                case "audit":
                {
                    if (!MossGate.IsServerLive(_sim)) { Refuse(tid, MossGate.OfflineRefusal); break; }
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
                // ⭐⭐ M3-3 — THE THAW. A MOSS *SCREEN* verb: a distinct op, sent by the POD BAY
                // (M3-4), never a line the player types at the prompt and never a MOSS *language*
                // verb. `ExecConsole` inherits its authority from the DSL adapters (IX-M40) and no
                // adapter exists for a CryoPod, deliberately — a ten-line installed program must
                // never be able to empty the cryo bay unattended.
                // ⭐⭐ M3-4 — THE POD BAY. Twelve capsules, who is in each, and why each shut one
                // will not cycle. A READ: it enqueues nothing and changes nothing.
                case "pods":
                {
                    // ⛔ WORST-FIRST — THE SHIP GATE, THEN THE TARGET (M3-15's own ordering rule).
                    // A player on a dead-computer ship must be told MOSS IS OFFLINE, not sent
                    // across the pressure frontier to fit a module to a terminal that works.
                    if (!MossGate.IsServerLive(_sim)) { Refuse(tid, MossGate.OfflineRefusal); break; }
                    // ⭐ WHICH CONSOLE. The prompt addresses the `@console` pseudo-tid (§1.3), which
                    // has no device behind it, so the SIM resolves a commissioned terminal through
                    // its own predicate and the name travels on the reply — the client then sends
                    // THAT name back with a thaw. A client picking one would be guessing at
                    // `Device.Scriptable`, which has never reached the wire.
                    string term = ThawGate.IsCommissionedConsole(_sim, tid)
                        ? tid : ThawGate.CommissionedConsoleName(_sim);
                    if (string.IsNullOrEmpty(term))
                    {
                        // ⭐ OD-N's THIRD STATE, SAID IN WORDS. The console runs (it just opened a
                        // door) and the bay still refuses — so the refusal must name COMMISSIONING
                        // and the module, or the player goes and repairs a terminal that is fine.
                        // An EMPTY POD BAY here would be the M3-13 defect this package is warned
                        // about by name: a screen that says nothing is a broken verb.
                        Refuse(tid, MossGate.NotCommissionedRefusal(tid == ConsoleTid ? null : tid));
                        break;
                    }
                    Emit(WireFormat.MossPods(tid, term, "COMMISSIONED",
                                             WireFormat.PodsHeadroomNote(_sim),
                                             WireFormat.BuildPods(_sim, term)));
                    break;
                }
                case "thaw":
                {
                    string pod = cmd.Text ?? "";

                    // ⛔ THE SHIP GATE FIRST — M3-4, discharging M3-15's filed item. Until this
                    // line the thaw op asked NO ship question, so a DARK ship answered target-side
                    // sentences (`NO SUCH POD`) from a computer that is off. Same ordering as
                    // `pods` above and as every other op in this switch: ship, then target.
                    if (!MossGate.IsServerLive(_sim)) { Refuse(tid, MossGate.OfflineRefusal); break; }

                    // ⛔ THE HOST DECIDES NOTHING. It calls the sim's own gate to RENDER the
                    // answer and enqueues the command REGARDLESS of what that answer was. Both
                    // halves matter: reading the gate here is what lets a refusal reach the player
                    // in the same frame as the click (the RimWorld analogue,
                    // `rimworld-reference.md` §2.2), and enqueueing unconditionally is what stops
                    // this line becoming a second, host-side gate that a load, a replay and the
                    // TUI would all disagree with. `ThawCommand.Execute` re-evaluates the SAME
                    // function on the SAME state and IT is authoritative.
                    //
                    // The two calls cannot disagree today — the command drain runs BETWEEN ticks,
                    // so no system moves the ship between this read and that execute — but the
                    // command is written as if they could, because a future drain that reorders
                    // itself must not be able to make an accepted thaw silently free.
                    var verdict = ThawGate.Evaluate(_sim, tid, pod);
                    _sim.EnqueueCommand(new ThawCommand(tid, pod));
                    Emit(WireFormat.MossThaw(tid, verdict.Allowed, pod,
                                             (int)verdict.Reason, ThawGate.Describe(verdict)));
                    break;
                }
                default: break; // unknown op (incl. reserved "dryrun") — ignored
            }
        }

        /// <summary>
        /// ⭐ M3-15 — ONE refused MOSS op, said in words on the console transcript. Stream 2 is the
        /// error stream <see cref="ExecConsole"/> already writes its own refusals to, and the
        /// transcript element is part of the MOSS page on EVERY screen (<c>moss-screen.js</c> builds
        /// it once into <c>moss-page</c>), so this sentence reaches the player whether they are at
        /// the prompt, in a ledger detail or in the program editor.
        ///
        /// <para><c>ok: false</c> because a refusal is not a successful line — the client's
        /// <c>reduceMossEvent</c> renders stream-2 text regardless, but the flag is what any future
        /// consumer would ask.</para>
        /// </summary>
        private void Refuse(string tid, string sentence)
            => Emit(WireFormat.MossExec(tid, false, new List<(int Stream, string Text)> { (2, sentence) }));

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
        /// M2-4 — THE WORK-PRIORITY BRIDGE. One crew member, one <see cref="WorkType"/>, one priority:
        /// enqueue a <see cref="SetWorkPriorityCommand"/> and let the sim decide at the tick boundary.
        ///
        /// <para>⚠️ <b>THIS BRIDGE VALIDATES NOTHING, ON PURPOSE.</b> It does not resolve the citizen,
        /// does not range-check the work type, does not clamp the priority — the command does all three
        /// and is the ONE validator. A second check here would be a second authority that can drift from
        /// the first, and the drift is not hypothetical: a host-side <c>(byte)</c> cast is the exact
        /// mechanism by which a garbled <c>-256</c> becomes <c>0</c> — <c>WorkPriority.Off</c>, a real
        /// order — before any guard could see it, which is why the command takes raw <c>int</c>s.
        /// <c>HandleFilter</c> above drops its own sentinel here because a negative mask widens to
        /// "accept everything" INSIDE the host's cast, i.e. before the sim can refuse it; nothing
        /// analogous happens on this path.</para>
        ///
        /// <para>SILENT ON REFUSAL, like every designate verb, and there is no reply channel: the
        /// <c>work</c> channel simply does not change, which is what the surface reads. ⚠️ That means an
        /// order the sim refuses is INVISIBLE — the failure shape this repo has already paid for three
        /// owner reports over. It is acceptable HERE and only here because the sole producer of this
        /// message is a grid built from the same six work types and the same 0..4 domain (M2-3), so a
        /// refusal implies a client bug rather than a player mistake; a player cannot express an illegal
        /// work priority by clicking. If a future surface can, it needs feedback, not this comment.</para>
        ///
        /// <para>NO STATUS LINE, unlike <c>HandleFilter</c>: the status text is console chrome on a
        /// deprecated shell, and the work grid's own cell is the feedback — it repaints from the
        /// <c>work</c> channel on the next render.</para>
        /// </summary>
        private void HandleWorkPriority(WebCommand cmd)
        {
            _sim.EnqueueCommand(new SetWorkPriorityCommand(cmd.Cid, cmd.Work, cmd.Priority));
        }

        /// <summary>
        /// ⭐⭐ <b>M2-9 — THE DIRECT-ORDER BRIDGE: one named crew member, one machine, "now".</b>
        /// Enqueues a <see cref="PrioritiseJobCommand"/> and lets the sim decide at the tick
        /// boundary — <c>HandleWorkPriority</c>'s contract, and for its reasons: the command is the
        /// ONE validator, and a second host-side check is a second authority that can drift.
        ///
        /// <para>⭐ <b>AND IT REMEMBERS WHAT WAS ASKED, WHICH IS THE HALF THAT DISCHARGES
        /// <see cref="WireFormat.ReasonNoConsumable"/>.</b> A repair order the sim refuses under the
        /// wreck rule leaves NOTHING behind in the sim to report — no job, no hold, and this package
        /// may add no order registry to sim state — so the <c>blocked</c> channel would have nothing
        /// to hang the refusal on and the player's click would vanish silently: the
        /// invisible-feedback failure this repo has paid three owner reports for.
        /// <see cref="_prioritised"/> is that memory, and it is HOST-SIDE RENDER SCRATCH exactly as
        /// the reach latch (<see cref="_latched"/>) is — never saved, never hashed, never sim state.
        /// It records only WHAT WAS ASKED; the reason is re-derived live at render time from
        /// <c>MaintenanceSystem.IsUnfixableWreck</c>, so nothing here decides a refusal.</para>
        ///
        /// <para><b>THE TILE→DEVICE RESOLUTION IS THIS SIDE'S JOB</b> (the M2-9/M2-10 wire contract):
        /// the client can only name a machine by the tile it clicked, because the <c>devices</c>
        /// channel carries no device id, and what crosses into the sim is an ENTITY ID. Resolved
        /// through <c>_sim.TryGetDeviceAt</c> and ⚠️ <b>emphatically not this file's own
        /// <c>TryDeviceAt</c></b> — see <see cref="HandleOperate"/>, where the linear scan's habit of
        /// returning the CONDUIT on any powered device's tile was a measured live defect. A tile with
        /// no machine on it is refused WITHOUT ENQUEUING, exactly as OPERATE refuses one, so a
        /// mis-click never becomes a pending order; the same goes for a tile the player has not
        /// explored, which they cannot have meant to click.</para>
        ///
        /// <para>THE COORDINATES ARE CLAMPED FIRST, <c>HandleOperate</c>'s shape, because an
        /// out-of-range tile would index the flag plane on the render thread. Clamping (rather than
        /// dropping) matches every other {x,y,deck} verb here; a clamped tile has no machine on it
        /// and lands on the refusal above.</para>
        ///
        /// <para>NO STATUS LINE and no reply message: the answer is the <c>blocked</c> badge on the
        /// machine, and the crew dock's own row once she is on it. ⚠️ Only the WRECK RULE reaches
        /// the player. The command's other refusals — incapable, nothing to service, nowhere
        /// survivable to stand, somebody else already on it — are still SILENT, which is a real gap
        /// and is recorded in <c>docs/MECHANICS.md</c> §13 rather than papered over here.</para>
        /// </summary>
        private void HandlePrioritise(WebCommand cmd)
        {
            var pos = new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                               Clamp(cmd.Y, 0, _sim.World.Height - 1),
                               Clamp(cmd.I, 0, _sim.World.Levels.Length - 1));
            if (!_sim.TryGetDeviceAt(pos, out var device) || !IsExplored(pos)) return;
            _prioritised[cmd.Cid] = device.Id;
            _sim.EnqueueCommand(new PrioritiseJobCommand((int)cmd.Cid, (int)device.Id));
        }

        /// <summary>
        /// ⭐ <b>THE PENDING DIRECT ORDERS — crew id → the ID of the machine the player last pointed
        /// that crew member at.</b> By ID and not by tile, matching what crosses the wire into the
        /// sim: a tile's occupant can change under a pending order, an entity id cannot.
        /// Written by <see cref="HandlePrioritise"/>, read by
        /// <see cref="BuildBlocked"/>'s fourth walk, and that is its entire life. Host-side, transient,
        /// never saved, never hashed, never restored on a reconnect — the <see cref="_latched"/>
        /// precedent.
        ///
        /// <para><b>BOUNDED BY THE CREW, not by the number of clicks</b>: one entry per crew member,
        /// overwritten by their next order. A player who right-clicks a hundred machines leaves one
        /// row behind.</para>
        ///
        /// <para><b>RETIRED THE MOMENT THE SIM TURNS THE ORDER INTO A HELD JOB.</b> The held job IS
        /// the order from then on (RimWorld §2.2 keeps the forced flag on <c>curJob</c>), so keeping
        /// the record would let a machine she successfully repaired, and which wore out again months
        /// later with the parts bins empty, wear a badge belonging to an order that finished. What
        /// survives here is therefore exactly the set of orders that produced NO job — which is what
        /// the channel is about.</para>
        ///
        /// <para>⚠️ <b>IT IS A LOOKUP, NEVER AN ENUMERATION</b> on the emit path. That walk iterates
        /// the CITIZEN STORE and probes this dictionary, because a hash container's layout must not
        /// decide the order of rows on the socket — the rule <see cref="BuildBlocked"/> states for
        /// all three of its other walks. The prune pass DOES enumerate the keys, and may, because it
        /// only removes.</para>
        ///
        /// <para>NO LOCK, and none is needed: <c>Start</c>'s loop calls <see cref="DrainCommands"/>
        /// (which writes this) and <see cref="Render"/> (which reads it) on the SAME thread, one
        /// after the other — the affinity <see cref="CaptureSimThread"/> arms and <c>_latched</c> and
        /// <c>_status</c> already rely on.</para>
        /// </summary>
        private readonly Dictionary<uint, uint> _prioritised = new Dictionary<uint, uint>();

        /// <summary>Scratch for the prune pass above — the crew ids whose order is to be dropped,
        /// collected because a <see cref="Dictionary{TKey,TValue}"/> may not be mutated mid-enumeration.
        /// Reused for the life of the session; bounded by the crew.</summary>
        private readonly List<uint> _prioritiseDrop = new List<uint>();

        /// <summary>
        /// How many direct repair orders are still PENDING — issued, and not yet turned into a held
        /// job by the sim. Test seam (<see cref="ApplyForTest"/>'s precedent) and nothing else reads
        /// it.
        ///
        /// <para>⚠️ <b>IT EXISTS BECAUSE THE ALTERNATIVE IS UNTESTABLE.</b> An order whose crew member
        /// has died is never visited by the emit walk — she is gone from the citizen store — so a
        /// leaked entry emits no row, changes no payload and is invisible on the wire by construction.
        /// Without this seam the cleanup could only be pinned by a test that cannot fail.</para>
        /// </summary>
        internal int PendingOrderCount => _prioritised.Count;

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
        /// THE OPERATE BRIDGE — the Room Zoom's door/vent OPEN⇄SHUT verb.
        ///
        /// <para>It is the ONLY route from a standard surface to <see cref="SetDoorStateCommand"/> /
        /// <see cref="SetDeviceStateCommand"/>. Before it, the toggle was reachable only through
        /// <see cref="ContextAction"/>, driven by <c>Cmd.click</c> from the DEPRECATED console's
        /// invisible inspection cursor — see the header of <c>hosts/web/WireFormat.Operate.cs</c> for
        /// why that made the wreck premise's opening move inexpressible.</para>
        ///
        /// <para>⚠️ IT IS NOT A COPY OF <see cref="ContextAction"/> AND MUST NOT BECOME ONE. The two
        /// share exactly one rule — a locked door refuses — and they differ in everything else:
        /// ContextAction is a CURSOR action that resolves crew before devices, toggles ANY device kind
        /// whatsoever, doubles as the MOSS-terminal opener, and reports through <c>_status</c>, a
        /// console string this surface never shows. This is a TARGETED verb: it addresses one tile on
        /// one deck, it operates only the two kinds that HAVE an open/shut control, and it answers on
        /// the wire. Folding them together would drag the terminal-opening side effect and the
        /// crew-selection precedence into a build palette.</para>
        ///
        /// <para><b>THE FEEDBACK IS THE FEATURE.</b> "Verb parity is not sufficient" is binding here
        /// (three prior instances): a door that refuses and a door that moved are the same picture. So
        /// every branch below ends in a sentence the player can read, and the four states that make a
        /// toggle look broken are named — LOCKED (refused), INOPERATIVE, UNFIXABLE, UNPOWERED. The
        /// last three are ADVISORIES on an ACCEPTED order, deliberately: the sim lets a wrecked vent's
        /// switch move and simply declines to inject air (<c>AtmosphereSystem.cs:123</c>), so refusing
        /// here would invent a rule. See the header of <c>WireFormat.Operate.cs</c>.</para>
        ///
        /// <para><b>⚠️ IT IS FOG-GATED, AND THAT WAS A SEND-BACK.</b> The first draft resolved the tile
        /// through <c>_deviceGrid</c> ALONE, while the client short-circuits on the <c>devices</c>
        /// channel — which <see cref="BuildDevices"/> gates on <see cref="Perilune.Sim.TileFlags.Explored"/>.
        /// The two populations therefore disagreed on every UNEXPLORED tile, and the disagreement was
        /// live and measured on <c>--ship wreck</c>: the client toasted <i>"NOTHING TO OPEN OR SHUT
        /// HERE"</i> on <c>vent_ls</c> (35,6,0) — a tile that holds a vent — while this handler would
        /// have accepted the same click and opened it. That is a CONFIDENT WRONG REASON, the exact
        /// defect the CryoPod fix in <c>doOperate</c> exists to remove, pointing the other way.</para>
        ///
        /// <para><b>The gate is here rather than removed from the client for a reason that is not
        /// symmetry.</b> Accepting a click on an unexplored tile would make this verb a FOG-OF-WAR
        /// CHANGE: a player could open doors and vents in compartments they have never seen. The
        /// <c>devices</c> channel's own header states the rule it inherited from <c>marks</c> and
        /// <c>items</c> — <i>"a rendering fix must not become a fog-of-war change"</i> — and a verb has
        /// no more licence than a renderer. So the host refuses, in the same words the client uses, and
        /// the two populations are now provably identical: tile-resident (both exclude the utility
        /// overlays, which are not in <c>_deviceGrid</c>) ∧ in-bounds ∧ explored.</para>
        ///
        /// <para>⚠️ <b>WHAT THIS DOES NOT FIX, filed rather than fudged.</b> The premise's opening move
        /// is still not expressible. <c>vent_ls</c> reads <c>Explored = false</c> at tick 0, tick 600
        /// AND tick 36 000 (a full sim-hour) — measured — so it is on no channel and now honestly
        /// refused rather than dishonestly refused. Its slot is also authored UNNAMED, so
        /// <c>roomTileRect</c> cannot resolve it and the Overview opens the ＋ADD ROOM picker there
        /// instead of a Room Zoom. Making that vent reachable needs W4b (naming the hall) AND something
        /// that explores it; both are outside this package. See the report.</para>
        ///
        /// <para>Runs on the sim thread (the command drain, between ticks), like every other handler
        /// here, so reading device fields is safe and the enqueued command lands in the same drain.</para>
        /// </summary>
        private void HandleOperate(WebCommand cmd)
        {
            // ⛔ ⭐ M3-15 / OD-N — THE SHIP GATE, ASKED FIRST AND BEFORE ANYTHING ABOUT THE TILE.
            //
            // The two commands below refuse on a ship with no live MOSS server (`MossGate`), so
            // without this line the handler would answer `⇄ OPEN DOOR` and NOTHING WOULD MOVE —
            // "a confident success while doing nothing", which is precisely the failure this verb's
            // own header says it exists to remove. It is asked BEFORE the tile resolves because the
            // contract is ship-first, target-second: a player whose computer is dead must be told
            // that, not "NOTHING KNOWN HERE TO OPERATE" about a tile they cannot act on either way.
            //
            // ⚠️ IT REPORTS BY CALLING THE SAME STATIC THE COMMAND REFUSES BY. This handler decides
            // nothing; if `MossGate` changes its mind, this sentence changes with it.
            //
            // ⚠️ AND THIS SURFACE IS ALREADY GONE. M3-15 deleted the Room Zoom's OPERATE affordance,
            // so nothing in the shipping client sends `Cmd.operate` any more; the handler survives
            // exactly one more package (M4-8's console-deletion sweep owns its retirement, beside
            // `hud.js` and `ContextAction`). It is kept for this one lane because M3-14 landed a
            // rung-3 pin inside `OperateAdvisory` a day earlier, and because a host handler is the
            // cheapest place to prove from a SURFACE that the sim-side gate bites.
            if (!MossGate.IsServerLive(_sim))
            {
                EmitOperate(new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                                     Clamp(cmd.Y, 0, _sim.World.Height - 1),
                                     Clamp(cmd.I, 0, _sim.World.Levels.Length - 1)),
                            WireFormat.OperateRefused, "-", MossGate.OfflineRefusal);
                _status = "moss offline";
                return;
            }

            var pos = new Int3(Clamp(cmd.X, 0, _sim.World.Width - 1),
                               Clamp(cmd.Y, 0, _sim.World.Height - 1),
                               Clamp(cmd.I, 0, _sim.World.Levels.Length - 1));

            // ⚠️ `_sim.TryGetDeviceAt` AND EMPHATICALLY NOT THIS FILE'S OWN `TryDeviceAt`, and the
            // difference is a LIVE DEFECT that only driving the wreck exposed. `TryDeviceAt` is a
            // linear scan over `sim.Devices.Items` that returns the FIRST device sharing the tile —
            // INCLUDING utility overlays. `Simulation.IsUtilityOverlay` deliberately keeps Conduits
            // and Pipes out of `_deviceGrid` and off `TileFlags.HasDevice` because they are not
            // tile-resident; they are also 88 % of the device store. So on any tile that also carries
            // a conduit — which is where a vent USUALLY is, since a vent needs power — the scan
            // returns the CONDUIT.
            //
            // Measured on `--ship wreck`: the very first attempt to open `vent_ls` (35,6,0), the
            // device the premise's opening move points at, answered "CONDUIT HAS NO OPEN/SHUT
            // CONTROL". `_deviceGrid` is the sim's own one-device-per-tile index and the same
            // authority `GlyphMapper` pass 4 and the `devices` channel resolve through.
            //
            // ⇒ THIS IS A PRE-EXISTING BUG IN `ContextAction` TOO (the deprecated console's cursor
            // toggle, the only door/vent route that existed before this verb), and it is NOT fixed
            // here: that path is closed to new work and touching it would put a behaviour change on a
            // deprecated surface inside a package about a live one. Recorded in the package report.
            if (!_sim.TryGetDeviceAt(pos, out var device) || !IsExplored(pos))
            {
                EmitOperate(pos, WireFormat.OperateRefused, "-", "NOTHING KNOWN HERE TO OPERATE");
                return;
            }
            if (!IsOperableKind(device.Kind))
            {
                EmitOperate(pos, WireFormat.OperateRefused, "-",
                    device.Kind.ToString().ToUpperInvariant() + " HAS NO OPEN/SHUT CONTROL");
                return;
            }

            bool opening = !device.IsOpen;
            string target = opening ? "OPEN" : "SHUT";

            // THE ONE REFUSAL. SetDoorStateCommand computes `target = open && !IsLocked` and then
            // silently does nothing when that leaves the state unchanged — so a locked door is the
            // single case where the sim accepts the command and the world does not move. Mirrored
            // rather than re-derived: the same two fields, in the same order, ContextAction has read
            // since M1. A locked door can still be SHUT (the lock resists opening, not closing),
            // which is why this asks `opening` rather than `IsLocked` alone.
            if (device.Kind == DeviceKind.Door && opening && device.IsLocked)
            {
                EmitOperate(pos, WireFormat.OperateRefused, "-",
                    device.LockOwner != 0 ? "DOOR IS LOCKED — THE LIEN HOLDS THIS ZONE" : "DOOR IS LOCKED");
                return;
            }

            if (device.Kind == DeviceKind.Door)
                _sim.EnqueueCommand(new SetDoorStateCommand(device.Id, open: opening));
            else
                _sim.EnqueueCommand(new SetDeviceStateCommand(device.Id, open: opening));

            EmitOperate(pos, WireFormat.OperateOk, target,
                target + " " + device.Kind.ToString().ToUpperInvariant() + OperateAdvisory(device, opening));
            _status = (opening ? "open " : "close ") + device.Kind;
        }

        /// <summary>
        /// The kinds that HAVE an open/shut control. <b>THE ONE PLACE THAT KNOWS,</b> host-side.
        ///
        /// <para>It is derived from what the SIM reads <see cref="Device.IsOpen"/> for, not from a
        /// taste about which machines feel switchable. <c>AtmosphereSystem.cs:123</c>,
        /// <c>ThermalSystem.cs:106</c>, <c>PowerSystem.IsWanting</c>, <c>MachineWearSystem</c> and
        /// <c>ShipSystems</c> all branch on an <c>AirVent</c>'s <c>IsOpen</c>; <c>Simulation.IsWalkable</c>,
        /// <c>GlyphMapper.DeviceGlyph</c> and the room flood all branch on a <c>Door</c>'s. Nothing in
        /// the sim reads <c>IsOpen</c> on any other kind — <c>SetDeviceStateCommand</c> will happily
        /// set the bit on a Fabricator and NOTHING WILL EVER READ IT, which is precisely the invisible
        /// no-op this verb exists to stop shipping.</para>
        ///
        /// <para>⚠️ <c>CryoPod</c> IS DELIBERATELY NOT HERE, and it is the one that will tempt the next
        /// lane. W5 stores "occupied / open" on a pod's <c>IsOpen</c> — but opening a pod is a THAW,
        /// gated on life-support headroom and priced in Parts, and it belongs to <c>ThawCommand</c>
        /// through MOSS (<c>docs/design/perilune-wreck-start.plan.md</c> W5). Adding <c>CryoPod</c> to
        /// this list would let a player thaw a sleeper by clicking a box with a build tool, bypassing
        /// the gate entirely. The client mirrors this set and a node test derives the mirror from the
        /// sim's own enum, so the two cannot drift silently.</para>
        /// </summary>
        internal static bool IsOperableKind(DeviceKind kind)
            => kind == DeviceKind.Door || kind == DeviceKind.AirVent;

        /// <summary>Has the player seen this tile? The SAME predicate <see cref="BuildDevices"/> gates
        /// the <c>devices</c> channel on, written once so the verb and the channel cannot come to
        /// disagree about which devices exist as far as the player is concerned. Out of bounds counts
        /// as unexplored rather than throwing — <c>HandleOperate</c> clamps first, so this is defence
        /// against a future caller, not a live path.</summary>
        private bool IsExplored(Int3 p)
            => _sim.World.InBounds(p) && (_sim.World.GetFlags(p) & TileFlags.Explored) != 0;

        /// <summary>
        /// The advisory tail — why an ACCEPTED toggle may still change nothing on the ship. Empty
        /// string when there is nothing to warn about, so the ordinary case reads as one clean verb.
        ///
        /// <para>Order is worst-first and each clause is the SIM'S OWN predicate:
        /// <see cref="Device.IsOperational"/> (the per-kind <c>machines.def</c> threshold — the client
        /// cannot derive it, which is why the <c>devices</c> channel carries <c>oper</c>),
        /// <see cref="MaintenanceSystem.IsUnfixableWreck"/> (the W2 wreck rule: below
        /// <c>wear.wreck_threshold</c> with no Parts, Seals or Swarf anywhere aboard) and
        /// <see cref="Device.Powered"/> (stamped by <c>PowerSystem.Balance</c>).</para>
        ///
        /// <para>⚠️ THE POWER CLAUSE IS ONLY ASKED WHEN <paramref name="opening"/>, and only of a VENT,
        /// and both halves are load-bearing. Shutting something needs no power in this sim — the bit
        /// is set by a command, not by a motor — so warning about power on the way shut would be a
        /// fabricated worry. And on a DOOR, power says nothing about whether it moves:
        /// <c>SetDoorStateCommand</c> ignores <c>Powered</c> entirely and so does
        /// <c>Simulation.IsWalkable</c>, so an unpowered door opens and stays open.</para>
        ///
        /// <para>⚠️ AND IT IS AN ADVISORY, NOT A PREDICTION. <c>PowerSystem.IsWanting</c> makes a CLOSED
        /// vent book no demand at all, so the vent the player is about to open was not in the last
        /// balance pass's tally: <c>Powered</c> currently reads only "is this device wired to a network
        /// whose tier is being served". Opening it adds draw, which can itself shed the tier. So a
        /// missing warning here does NOT promise the vent will run; a PRESENT one is certain (an
        /// unwired device has <c>NetworkId == 0</c> and can never be served). Worded to match: "NO
        /// POWER REACHES IT" is about the wire, not about the next second.</para>
        ///
        /// <para>⛔ <b>THE POWER CLAUSE CANNOT FIRE ON ANY SHIPPED SHIP TODAY, AND SAYING SO IS A
        /// SEND-BACK CORRECTION.</b> Measured, 40 ticks in: every <c>AirVent</c> on <c>--ship wreck</c>
        /// (2) and <c>--ship grid</c> (4) reads <c>Powered = true</c> with <c>NetworkId = 1</c>, and no
        /// palette tool places a vent, so no player action can produce an unwired one. (Grid has 40
        /// UNPOWERED doors — but a door is excluded by the <c>Kind</c> half of this branch, for the
        /// reason above, so they cannot reach it either.) It is therefore DEAD CODE ON THE SHIPPED
        /// CONTENT, kept because a wreck generator authoring an off-grid vent is one line away, and it
        /// is pinned by a CONSTRUCTED fixture — <c>OperateVerbTests.An_Unpowered_Vent_Being_Opened_...</c>
        /// — rather than by any ship. Before this was measured, the ONLY assertion naming the clause was
        /// a <c>DoesNotContain</c> on a vent that boots OPEN, i.e. one that could never bite: deleting
        /// the clause was a SURVIVOR at 1258/1258.</para>
        ///
        /// <para>⚠️ THE <c>else if</c> IS A DECISION, NOT AN ACCIDENT: a device that is BOTH wrecked and
        /// unpowered says only WRECKED. Power is moot while the machine is dead, and the player's next
        /// move is the repair either way; the power sentence appears once the repair lands. Pinned by
        /// <c>A_Wrecked_And_Unpowered_Device_Reports_Only_The_Wreck</c> so the precedence cannot invert
        /// silently.</para>
        /// </summary>
        private string OperateAdvisory(Device device, bool opening)
        {
            var sb = new System.Text.StringBuilder(64);
            if (!device.IsOperational(_sim.Defs))
            {
                sb.Append(" · WRECKED (")
                  .Append(((int)(device.Condition * 100f + 0.5f)).ToString(CultureInfo.InvariantCulture))
                  .Append("%) — IT WILL DO NOTHING UNTIL IT IS REPAIRED");
                // ⭐⭐ M3-14 RUNG 3, THE FIFTH CALL SITE — `forced: true`, AND THE WORD THAT DECIDES
                // IT IS "ABOARD". This sentence is a claim about the SHIP'S STOCK, not about what an
                // idle crew member happens to be able to reach: `FindNearest` refuses a stack resting
                // in unbreathable air, so the un-forced question answers "nothing aboard" on a wreck
                // holding four Parts three tiles behind the pressure frontier — Parts the player can
                // now order fetched (rung 2) and the repair completed. Asking it un-forced put a
                // sentence that is FALSE ABOUT THE SHIP into the reply to every door/vent toggle,
                // `vent_ls` — the phase-1 gate device — included.
                //
                // ⛔ IT IS THE SAME DECISION AS `BuildBlocked`'s retire rule and
                // `PrioritiseJobCommand`'s W2 gate, taken in a third place because the advisory is a
                // third surface: one rule, one flag, every gate (§8.4 rung 3). Pinned by
                // `OperateVerbTests.A_Parts_Stack_Behind_The_FRONTIER_Still_Counts_As_ABOARD`.
                if (MaintenanceSystem.IsUnfixableWreck(_sim, device, forced: true))
                    sb.Append(" · NO PARTS, SEALS OR SWARF ABOARD TO REPAIR IT");
            }
            else if (opening && device.Kind == DeviceKind.AirVent && !device.Powered)
            {
                sb.Append(" · NO POWER REACHES IT — IT WILL MOVE NO AIR");
            }
            return sb.ToString();
        }

        /// <summary>Broadcast the operate reply. One-shot (<see cref="Emit"/>), never cached: it is a
        /// direct answer to a click, not a fact about the world.</summary>
        private void EmitOperate(Int3 pos, int ok, string state, string reason)
            => Emit(WireFormat.Operate(pos.X, pos.Y, pos.Z, ok, state, reason));

        // ⭐ M1-L: `HandleAddRoom` and `ParseRoomType` (the 13-type whitelist that WAS the
        // type gate) are DELETED. They were reachable only from the `CmdKind.AddRoom` route
        // above, which is deleted too, so nothing could call them. ⭐ M1-L-b then retired the
        // enum member and the sim command; nothing named "add room" survives anywhere.

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
                // M3-10 — the palette's HEATER tool. Unlike growbed/medbed/table above (which are
                // wire-reachable but have no palette button), this one IS on ROOM_TOOLS, because a
                // verb only the wire can reach is a verb the player does not have.
                case "heater": kind = DeviceKind.Heater; return true;
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
                // ⭐ M3-15 / OD-N — route 2 of five. The commands refuse without a live MOSS server,
                // so reporting "open Door" here would be a status line that is simply false. The
                // gate is NOT re-derived: it is the same static the command refuses by. (This is a
                // DEPRECATED surface, closed to new work — the two lines are honesty about a
                // behaviour change made elsewhere, not a feature.)
                bool actuates = device.Kind == DeviceKind.Door || device.Kind == DeviceKind.AirVent;
                if (actuates && !MossGate.IsServerLive(_sim)) { _status = "moss offline"; }
                else if (device.Kind == DeviceKind.Door)
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
            SendDevices(force);
            // WHO WILL DO WHAT (`work`, M2-4). Each crew member's manual work priorities, read off
            // `sim.Citizens` — the only route there is, since a priority is a fact about a PERSON and
            // reaches no projection byte at all. Sparse (absent = off), so under OD-H it is EMPTY until
            // the player gives an order. Same dirty-version gate shape as `devices`; see
            // hosts/web/WireFormat.Work.cs.
            SendWork(force);
            // ⭐ WHAT EACH CREW MEMBER IS GOOD AT, AND WHAT SHE CANNOT DO AT ALL (`workcaps`, M3-7).
            // `work`'s SIBLING, not an extension of it: that channel is sparse and off-only, an
            // incapable work type is by definition never on, and a row that does not exist cannot carry
            // a column. DENSE — every living crew member gets a row even with nothing switched on,
            // which under OD-H is the boot state and therefore the default case. The incapability mask
            // is `Citizen.WorkIncapable`'s own byte, copied rather than re-derived. See
            // hosts/web/WireFormat.WorkCaps.cs.
            SendWorkCaps(force);
            // WHY AN ORDER IS DOING NOTHING (`blocked`). `WorksiteSafety.CanStageWorkerAt` refuses to
            // park a worker in air that would pull it off the job, and its own header records that this
            // took the failure from expensive-and-visible to CHEAP-AND-INVISIBLE: a designation painted
            // in an airless compartment simply never progresses, silently. This is the channel that
            // header asks for. NOT empty on the standard ship — grid authors 20 digs in the hold and
            // ten are badged for the first ~35 sim-minutes, then the field clears itself and this
            // channel goes quiet for good. See hosts/web/WireFormat.Blocked.cs.
            Send("blocked", WireFormat.Blocked(BuildBlocked()), force);

            // ⭐ M3-5 — THE EMERGENCY THAW AND THE ENDING IT IMPLIES (`ending`). One line: the grace
            // while the ship wakes one more soul by itself, and the lose state when it has nobody
            // left to wake. Derived from `CryoSystem`'s own saved bits (`RunEnded`,
            // `EmergencyPodId`), never from a host-side guess at what the sim is doing — see
            // hosts/web/WireFormat.Ending.cs. `Send` dedupes by payload, so on the overwhelming
            // majority of ticks this is one small string built and thrown away, and nothing sent.
            //
            // ⛔ THIS IS NOT THE ENDING SCREEN. M5-1 owns THE ENDING (OD-M item 4 = A); the claim
            // made here is deliberately one line, and it must stay one line.
            Send("ending", WireFormat.Ending(WireFormat.EndingBanner(_sim), WireFormat.RunIsOver(_sim)), force);

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

        /// <summary>
        /// THE <c>devices</c> CHANNEL'S DIRTY-VERSION GATE — the delta scheme
        /// <c>hosts/web/WireFormat.Devices.cs</c> made a WRITTEN CONDITION of that channel's merge,
        /// landing in the same package as the art that first draws it (W0b), exactly as its header
        /// required.
        ///
        /// WHAT IT SAVES, AND WHAT IT DOES NOT. <see cref="Send"/> already dedupes by whole-payload
        /// string equality, so an unchanged channel never reached the SOCKET — but the payload was
        /// still BUILT AND SERIALIZED ten times a second to discover that, and independent review
        /// measured two-thirds of the channel's cost in the serialization rather than the build
        /// (~10.7 µs of a ~29.4 µs total on <c>--ship grid</c>). This gate skips the serialization
        /// when the cells are byte-for-byte what they were last time. The BUILD still runs, and that
        /// is the honest limit of the scheme: there is no sim-side version counter on
        /// <see cref="Device.Condition"/> to consult, and adding one is a sim change that would move
        /// hashed state for a rendering concern.
        ///
        /// ⇒ WHY THE CACHE KEY IS SUFFICIENT, WHICH IS THE QUESTION A CACHE HAS TO ANSWER.
        /// The key is THE ENTIRE CELL LIST, compared element-wise across all six fields, and
        /// <see cref="WireFormat.Devices"/> is a pure function of that list. So "the skip was taken"
        /// and "the payload would have been byte-identical" are the SAME STATEMENT — not a heuristic
        /// that happens to hold. A device that moves, is placed, or is stripped changes the list even
        /// at equal condition, because position, kind and COUNT are all part of the comparison.
        /// (The tempting cheap key — condition alone, or a count — is exactly what would not be
        /// sufficient, and <c>DevicesDeltaTests</c> plants each of those and requires it to be caught.)
        ///
        /// ⚠️ A COUNT OF SKIPPED BYTES IS NOT A SPEED-UP (the <c>HasIceChain</c> lesson: 91.7 M slots
        /// per sim-day became 1 250 and was worth ~1 %, not separated from noise). The measurement and
        /// its honest verdict live in the package report and in <c>DevicesDeltaTests</c>'s header; what
        /// is asserted in code is CORRECTNESS, and the saving is stated as measured rather than
        /// implied by the mechanism.
        ///
        /// FORCE ALWAYS RE-EMITS. A forced render is the prime for a newly-connected client and the
        /// resync path a delta scheme needs; it existed already and needed no invention. The gate is
        /// never consulted when <paramref name="force"/> is set, so a reconnecting tab cannot be
        /// caught out by a cache that agrees with itself.
        /// </summary>
        private readonly List<WireFormat.DeviceCell> _devicesSent = new List<WireFormat.DeviceCell>();
        private bool _devicesSentPrimed;

        /// <summary>
        /// HOW MANY TIMES THE <c>devices</c> PAYLOAD HAS BEEN SERIALIZED — a TEST SEAM, and it exists
        /// because without it the gate is UNOBSERVABLE FROM OUTSIDE. <see cref="Send"/> already
        /// suppressed the broadcast of an unchanged payload, so deleting the whole gate changes not
        /// one byte of behaviour on the socket, in <see cref="Snapshot"/>, or in any sink a test can
        /// read: every behavioural assertion in <c>DevicesChannelTests</c> stays green with the
        /// optimisation removed. A performance change that nothing can see is a performance change
        /// nothing protects.
        ///
        /// <para>It is incremented on the line ADJACENT to the serialization it counts, which is as
        /// close as a counter gets to being the thing itself. It is not read anywhere in the host.</para>
        /// </summary>
        internal int DevicesSerializedForTest { get; private set; }

        private void SendDevices(bool force)
        {
            var cells = BuildDevices();
            if (!force && _devicesSentPrimed && SameAsLastDevices(cells)) return;
            DevicesSerializedForTest++;
            Send("devices", WireFormat.Devices(cells), force);
            _devicesSent.Clear();
            _devicesSent.AddRange(cells);
            _devicesSentPrimed = true;
        }

        /// <summary>Element-wise equality against the last EMITTED cell list. An explicit field
        /// compare and not <c>ValueType.Equals</c>, which on a struct with no override falls back to
        /// reflection and boxes — it would cost more per render than the serialization this gate
        /// exists to avoid, which would be a fine way to make a channel slower while reporting a
        /// saving.</summary>
        private bool SameAsLastDevices(List<WireFormat.DeviceCell> cells)
        {
            if (_devicesSent.Count != cells.Count) return false;
            for (int i = 0; i < cells.Count; i++)
                if (!_devicesSent[i].SameAs(cells[i])) return false;
            return true;
        }

        /// <summary>
        /// M2-4 — THE <c>work</c> CHANNEL'S DIRTY-VERSION GATE, the <see cref="SendDevices"/> scheme
        /// applied to a channel keyed by citizen. <see cref="Send"/> already dedupes by whole-payload
        /// string equality, so an unchanged channel never reached the SOCKET; this skips BUILDING and
        /// SERIALIZING it to discover that.
        ///
        /// <para>⚠️ <b>THE SAVING HERE IS SMALL AND IS NOT THE REASON.</b> This channel is
        /// O(crew × 6) over single-digit crew — the <c>HasIceChain</c> scar in this repo is that a
        /// count of skipped work is not a speed-up (91.7 M slots/sim-day became 1 250 and was worth
        /// ~1 %, not separated from noise), and nobody has measured a saving for this one. What the
        /// gate buys is a CORRECTNESS PROPERTY the charter asks for by name: the comparison is
        /// element-wise over all three fields, so "the skip was taken" and "the payload would have been
        /// byte-identical" are the same statement rather than a heuristic. A cheap key — the row COUNT
        /// alone — would be the reachable failure: a player moving Repair from 4 to 1 changes no row's
        /// existence and no count, only the third element, and a count-keyed gate would freeze that
        /// player's own grid on the surface with every test green.</para>
        ///
        /// <para>FORCE ALWAYS RE-EMITS, and it must be checked BEFORE the gate: a forced render is the
        /// prime for a newly-connected tab and the resync path. This channel is also in
        /// <see cref="Snapshot"/>'s key list, which is the <c>materials</c>/<c>blocked</c> reasoning
        /// and not the <c>ledger</c> one — the payload is a function of what the PLAYER set and can sit
        /// unchanged for hours, so a reconnecting tab left to "self-heal" would show an empty work grid
        /// for exactly as long as nobody touches it.</para>
        /// </summary>
        private readonly List<WireFormat.WorkCell> _workSent = new List<WireFormat.WorkCell>();
        private bool _workSentPrimed;

        /// <summary>HOW MANY TIMES THE <c>work</c> PAYLOAD HAS BEEN SERIALIZED — a TEST SEAM, for the
        /// reason <see cref="DevicesSerializedForTest"/> spells out: <see cref="Send"/> already
        /// suppresses the broadcast of an unchanged payload, so the gate is otherwise UNOBSERVABLE from
        /// outside and a performance change nothing can see is one nothing protects. Incremented on the
        /// line adjacent to the serialization it counts; not read anywhere in the host.</summary>
        internal int WorkSerializedForTest { get; private set; }

        private void SendWork(bool force)
        {
            var cells = BuildWork();
            if (!force && _workSentPrimed && SameAsLastWork(cells)) return;
            WorkSerializedForTest++;
            Send("work", WireFormat.Work(cells), force);
            _workSent.Clear();
            _workSent.AddRange(cells);
            _workSentPrimed = true;
        }

        /// <summary>Element-wise equality against the last EMITTED cell list — an explicit field
        /// compare through <see cref="WireFormat.WorkCell.SameAs"/> and not <c>ValueType.Equals</c>,
        /// which on a struct with no override falls back to reflection and boxes. The COUNT is part of
        /// the key: a crew member dying (or a work type being switched off, which REMOVES its row on a
        /// sparse channel) shortens the list while every surviving row is untouched, and a loop that
        /// only walked the shared prefix would pass every field-wise test there is.</summary>
        private bool SameAsLastWork(List<WireFormat.WorkCell> cells)
        {
            if (_workSent.Count != cells.Count) return false;
            for (int i = 0; i < cells.Count; i++)
                if (!_workSent[i].SameAs(cells[i])) return false;
            return true;
        }

        /// <summary>
        /// ⭐ M3-7 — THE <c>workcaps</c> CHANNEL'S DIRTY-VERSION GATE. <see cref="SendWork"/>'s scheme
        /// applied to its SIBLING, deliberately as a separate pair of fields rather than as a field on
        /// <see cref="WorkCell"/> or a second list inside <see cref="SendWork"/>: the two channels have
        /// different cadences (a priority changes when the player clicks; a skill changes when someone
        /// learns something, and an incapability when someone is injured) and the whole reason
        /// <c>workcaps</c> is its own message is that <c>work</c>'s shape could not carry it.
        ///
        /// <para>Element-wise over ALL EIGHT fields through
        /// <see cref="WireFormat.WorkCapsCell.SameAs"/> — the <c>DeviceCell</c> scar, and here the
        /// reachable failure is a crew member whose skills visibly never improve. The COUNT is part of
        /// the key because a crew member dying REMOVES a row while every survivor's row is untouched,
        /// and a loop that only walked the shared prefix would pass every field-wise test there is.</para>
        ///
        /// <para>FORCE IS CHECKED BEFORE THE GATE (the prime for a newly-connected tab), and the
        /// channel is in <see cref="Snapshot"/>'s key list on the <c>materials</c>/<c>blocked</c>
        /// reasoning rather than the <c>ledger</c> one — and MORE strongly than <c>work</c>: nothing in
        /// the sim writes a skill yet, so this payload can be constant for an ENTIRE RUN. A
        /// reconnecting tab left to "self-heal" would show a crew with no competences and no
        /// incapabilities, for ever, because nothing will ever change it back.</para>
        /// </summary>
        private readonly List<WireFormat.WorkCapsCell> _workCapsSent = new List<WireFormat.WorkCapsCell>();
        private bool _workCapsSentPrimed;

        /// <summary>HOW MANY TIMES THE <c>workcaps</c> PAYLOAD HAS BEEN SERIALIZED — a TEST SEAM, for
        /// <see cref="WorkSerializedForTest"/>'s reason: <see cref="Send"/> already suppresses the
        /// broadcast of an unchanged payload, so the gate is otherwise UNOBSERVABLE from outside.</summary>
        internal int WorkCapsSerializedForTest { get; private set; }

        private void SendWorkCaps(bool force)
        {
            var cells = BuildWorkCaps();
            if (!force && _workCapsSentPrimed && SameAsLastWorkCaps(cells)) return;
            WorkCapsSerializedForTest++;
            Send("workcaps", WireFormat.WorkCaps(cells), force);
            _workCapsSent.Clear();
            _workCapsSent.AddRange(cells);
            _workCapsSentPrimed = true;
        }

        /// <summary>Element-wise equality against the last EMITTED cell list — an explicit field
        /// compare through <see cref="WireFormat.WorkCapsCell.SameAs"/> and not
        /// <c>ValueType.Equals</c>, which on a struct with no override falls back to reflection and
        /// boxes.</summary>
        private bool SameAsLastWorkCaps(List<WireFormat.WorkCapsCell> cells)
        {
            if (_workCapsSent.Count != cells.Count) return false;
            for (int i = 0; i < cells.Count; i++)
                if (!_workCapsSent[i].SameAs(cells[i])) return false;
            return true;
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
            var liveDecks = new HashSet<int>();   // decks holding ≥1 room with gas — see the second pass
            for (int i = 0; i < slots.Count; i++)
            {
                var slot = slots[i];
                var (occupied, anchorName, liveType, hasGas) = ResolveSlot(world, rs, slot);
                if (hasGas) liveDecks.Add(slot.Deck);
                if (!buckets.TryGetValue(slot.Deck, out var list))
                {
                    list = new List<WireFormat.DeckSlot>(8);
                    buckets[slot.Deck] = list;
                    byDeck.Add(slot.Deck);
                }
                // Room TYPE comes from LIVE state (the RoomAnchor's Type), not the authoring
                // descriptor, so a room re-typed at runtime shows its new type. No PLAYER route sets
                // one any more — M1-L-b deleted the last writer, AddRoomCommand (OD-K) — but the sim
                // still owns the field (saves, MOSS, RoomDresser), so reading live state stays right
                // and is strictly more correct than trusting the plan. Fall back to the descriptor
                // when no live type is known (an untyped compartment).
                byte typeByte = (occupied && liveType != RoomType.None) ? (byte)liveType : (byte)slot.Type;
                list.Add(new WireFormat.DeckSlot(slot.Index, slot.X, slot.Y, slot.W, slot.H,
                    anchorName, typeByte, occupied, active: false));
            }

            // Second pass: active = the deck holds ≥1 room WITH GAS; stamp every slot.
            //
            // ⚠️ ⭐ M1-L: THIS USED TO READ `list[s].Occupied`, AND LEAVING IT THERE WAS A LIVE LIE.
            // Occupancy is now geometry, so it is TRUE FOR EVERY SLOT ON EVERY SHIPPED SHIP — which
            // would have made `active` a constant, and `active` is not decoration: `lensSlotTint`
            // reads it for the POWER lens (`overview-model.js:400`), tinting `good` when set.
            // MEASURED on `--ship wreck` before the fix: the POWER lens painted all EIGHT
            // compartments of DECK 1 green — the deck that is off-network by authoring and dead by
            // owner decision (OD-E). A widened flag quietly repurposed a player-facing readout, which
            // is the M1-F failure (a gauge that is never anything but a constant) arriving by
            // side effect.
            //
            // Gas restores what the flag always MEANT — "is anything on this deck alive?" — and is
            // measured to reproduce its pre-M1-L value on every shipped ship: wreck deck 0 true /
            // deck 1 false; grid decks 0-1 true, decks 2-7 false.
            for (int d = 0; d < byDeck.Count; d++)
            {
                var list = buckets[byDeck[d]];
                bool deckActive = liveDecks.Contains(byDeck[d]);
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

        /// <summary>Resolve a slot's live ROOM + name from <see cref="RoomState"/>. Scans the slot's
        /// tile rect for the first tile in a real (non-vacuum-sink) room, then finds the anchor whose
        /// probe resolves to that same room id. That anchor IS the occupancy: <c>occupied</c> means
        /// <b>"this slot's walls enclose a real room"</b> — a fact about GEOMETRY.
        ///
        /// <para><b>⭐ M1-L — OCCUPANCY IS GEOMETRY, NOT TYPE. THIS IS THE WHOLE PACKAGE.</b> Until
        /// now the walk carried <c>if (a.Type == RoomType.None) continue;</c>, so a compartment that
        /// the ship had CARVED — interior floor, perimeter walls, a door onto the spine
        /// (<c>SlotGridPlanner.Carve</c> builds all three for every slot, hall or not) — reported
        /// <c>occupied:false</c> with a BLANK name purely because nobody had picked a
        /// <see cref="RoomType"/> for it. Blank name ⇒ the Overview drew a ＋ADD ROOM chip ⇒ the Room
        /// Zoom could not be entered at all (<c>roomTileRect</c> looks a room up BY anchor name and a
        /// blank one never matches). On <c>--ship wreck</c> that hid FIVE of the eight deck-0
        /// compartments, FOUR of which contain real, named, wrecked machinery the player is meant to
        /// repair. The owner's ruling, 2026-07-29: <i>"we do not need 'add room' that makes no sense
        /// on a ship where rooms are already existing."</i>
        ///
        /// <para><b>RimWorld analogue</b> (<c>docs/design/rimworld-reference.md</c> §10, "Rooms are
        /// derived, not authored"): <i>"RimWorld computes rooms from walls … the player never names or
        /// allocates one."</i> Removing the type gate is exactly that — walls decide, not a picker.</para>
        ///
        /// <para><b>⚠️ THE SLOT'S OWN ANCHOR IS PREFERRED, and that is not cosmetic.</b> The old walk
        /// returned the FIRST anchor resolving to the room, which was unambiguous only because the
        /// <c>None</c> skip left at most one typed candidate per room. With the skip gone, two anchors
        /// can resolve to one room the moment an interior bulkhead is stripped (<c>Rooms.MarkDirty</c>
        /// merges them, E0-5) — and then list order, not the slot, would choose the caption. Matching
        /// <c>slot.Anchor</c> first makes a merged compartment keep its own name on both halves; the
        /// scan survives only as the fallback for a slot whose own anchor has drifted off its room.</para>
        ///
        /// <para>⚠️ W4b history, still true: OCCUPANCY used to gate on GAS (<c>TotalMoles &gt; 0</c>).
        /// "Named" and "has air" are different events — a furnished room can be vented and a carved
        /// one can be airless — so gas was never the right question FOR OCCUPANCY. <c>occupied</c> with
        /// a null atmos row is the NORMAL case now, not the new one, and <c>decks-model.js</c>'s
        /// <c>deckSlotView</c> null-guards the atmos join.</para>
        ///
        /// <para><b>⭐ <c>HasGas</c> IS RETURNED SEPARATELY, AND IT IS NOT A RELAPSE.</b> It feeds the
        /// DECK-LEVEL <c>active</c> flag, which asks a different question — "is anything on this deck
        /// alive?" — and for that, gas is exactly right and always was. Nobody "allocates" a deck, so
        /// the W4b argument (that naming and pressurising are separate events) does not apply to it.
        /// It exists because widening <c>occupied</c> would otherwise have silently widened
        /// <c>active</c> with it: see <c>BuildDecks</c>, where that was measured as a live lie.</para>
        /// </summary>
        private static (bool Occupied, string AnchorName, RoomType Type, bool HasGas) ResolveSlot(World world, RoomState rs, SlotDescriptor slot)
        {
            int deck = slot.Deck;
            if (deck < 0 || deck >= world.Depth) return (false, "", RoomType.None, false);

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
            if (roomId == 0 || roomId >= rs.Rooms.Count) return (false, "", RoomType.None, false);

            bool hasGas = rs.Rooms[roomId].TotalMoles > 0;
            var anchors = rs.Anchors;

            // 1. THE SLOT'S OWN ANCHOR, when it still sits in this slot's room (see the header).
            for (int i = 0; i < anchors.Count; i++)
            {
                var a = anchors[i];
                if (a.Probe.Z != deck) continue;
                if (!string.Equals(a.Name, slot.Anchor, StringComparison.Ordinal)) continue;
                if (rs.RoomIdAt(world, a.Probe) == roomId) return (true, a.Name, a.Type, hasGas);
            }

            // 2. Fallback: any anchor whose probe lands in the same room. Reached when the slot's own
            //    anchor has drifted off its room (a probe now under debris, a wall change) but another
            //    compartment's anchor still describes the merged volume.
            for (int i = 0; i < anchors.Count; i++)
            {
                var a = anchors[i];
                if (a.Probe.Z != deck) continue;
                if (rs.RoomIdAt(world, a.Probe) == roomId) return (true, a.Name, a.Type, hasGas);
            }
            return (false, "", RoomType.None, false);
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
        /// M2-4 — the sparse WORK-PRIORITY layer: one <see cref="WireFormat.WorkCell"/> per switched-ON
        /// (crew member, <see cref="WorkType"/>) pair, read from <c>sim.Citizens</c> DIRECTLY. See
        /// <c>hosts/web/WireFormat.Work.cs</c> for the tuple's keying (by CITIZEN, not by tile), for why
        /// "absent = off" is the sim's own semantics rather than a wire convention, and for why this
        /// channel is empty at boot under OD-H.
        ///
        /// ⚠️ <b>THERE IS NO PROJECTION TO READ THIS FROM, AND THAT IS STRONGER THAN THE
        /// <c>marks</c>/<c>items</c> CASE RATHER THAN THE SAME.</b> Those two channels exist because a
        /// later <c>GlyphMapper</c> pass overwrites a byte an earlier pass wrote — a fact that reaches
        /// the projection and is then lost. A work priority never reaches it at all: it is a fact about
        /// a PERSON with no tile to be drawn on, so <see cref="GlyphMapper"/> has nowhere to put it and
        /// no pass ordering could produce it. Reading the grid off <c>sim.Citizens</c> is not the better
        /// of two routes here; it is the only one there is.
        ///
        /// ORDER — CITIZEN STORE ORDER, and within a citizen, <see cref="WorkType"/> VALUE order (the
        /// storage index order, which is what <c>Simulation.StateHash</c>'s CITZ fold walks). A plain
        /// <c>List</c> index walk and a <c>for</c> over a compile-time count: no hash container's
        /// enumeration order can reach the socket, so two runs of one seed emit the same bytes. It is
        /// NOT a display order — see the channel header.
        ///
        /// COST — O(live crew × 6), a fixed 6-iteration inner loop over a store that holds single
        /// digits of crew on every shipped ship, on the sim thread inside <see cref="Render"/> at
        /// ≤10 Hz and never on a tick path. It is the cheapest of the sparse channels by a wide margin:
        /// the three world walks are O(width × height × depth) and <see cref="BuildItems"/> is
        /// O(items) with 212 rows on the slice. The scratch list is reused, so a steady state allocates
        /// only the payload string — and under OD-H the payload is <c>{"type":"work","cells":[]}</c>,
        /// which <see cref="Send"/> then dedupes forever.
        ///
        /// VIEW-ONLY: a read of authoritative state, never a write, never hashed.
        /// </summary>
        private readonly List<WireFormat.WorkCell> _workScratch = new List<WireFormat.WorkCell>();
        private List<WireFormat.WorkCell> BuildWork()
        {
            _workScratch.Clear();
            var citizens = _sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                // DEAD CREW ARE ABSENT — the same line SetWorkPriorityCommand draws. A corpse cannot be
                // ordered to do anything, so a row for one would be a claim about a person who is not
                // there; their stored bytes are still saved and hashed by the CITZ chapter.
                if (c.Dead) continue;
                for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                {
                    // SPARSE: only a switched-ON work type gets a row. `WorkPriority.Off` is documented
                    // as the ABSENCE of a priority rather than a fifth value, so an omitted row is not a
                    // compression of "0" — it IS the sim's representation of "will not do it".
                    byte p = c.GetWorkPriority((WorkType)t);
                    if (p == WorkPriority.Off) continue;
                    _workScratch.Add(new WireFormat.WorkCell((int)c.Id, t, p));
                }
            }
            return _workScratch;
        }

        /// <summary>
        /// ⭐ M3-7 — THE <c>workcaps</c> LAYER: what each living crew member is GOOD at and what she
        /// CANNOT DO AT ALL. One row per citizen, and see <c>WireFormat.WorkCaps.cs</c> for why this is
        /// a second message rather than two more columns on <c>work</c> (short version: <c>work</c> is
        /// sparse and off-only, an incapable type is never on, and a row that does not exist cannot
        /// carry a column).
        ///
        /// <para>⛔ <b>DENSE ON PURPOSE — a citizen with NO on-rows on <c>work</c> STILL GETS A
        /// ROW.</b> Under OD-H that is every crew member on every ship at boot, which makes the
        /// all-zero citizen the DEFAULT fixture rather than an edge case. Skipping her would leave this
        /// channel empty at exactly the moment the player first opens the WORK tab.</para>
        ///
        /// <para>⛔ <b>THE MASK IS <c>Citizen.WorkIncapable</c> VERBATIM.</b> Nothing here re-derives
        /// capability, consults <c>CanTakeWorkType</c>, or assembles bits from <c>IsIncapableOf</c> —
        /// the sim owns what a person cannot do and the host copies the byte. A host-side second
        /// opinion is the defect shape <see cref="WireFormat.ReasonWorkTypeOff"/>'s own header and the
        /// note at <c>WireFormat.Blocked.cs:548</c> both record; the whole reason the channel is worth
        /// building is that <i>incapable</i> and <i>priority 0</i> are DIFFERENT facts, and a
        /// re-derivation is precisely how they would silently become one.</para>
        ///
        /// <para>The scratch list is reused, so a steady state allocates only the payload string.
        /// VIEW-ONLY: a read of authoritative state, never a write, never hashed.</para>
        /// </summary>
        private readonly List<WireFormat.WorkCapsCell> _workCapsScratch = new List<WireFormat.WorkCapsCell>();
        private List<WireFormat.WorkCapsCell> BuildWorkCaps()
        {
            _workCapsScratch.Clear();
            var citizens = _sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                // DEAD CREW ARE ABSENT — the line BuildWork and SetWorkPriorityCommand both draw.
                if (c.Dead) continue;
                _workCapsScratch.Add(new WireFormat.WorkCapsCell(
                    (int)c.Id,
                    c.GetSkill(WorkType.Repair),
                    c.GetSkill(WorkType.Construct),
                    c.GetSkill(WorkType.Craft),
                    c.GetSkill(WorkType.Deconstruct),
                    c.GetSkill(WorkType.Mine),
                    c.GetSkill(WorkType.Haul),
                    c.WorkIncapable));   // ⛔ the sim's own byte, copied — never re-derived
            }
            return _workCapsScratch;
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
                    device.IsOperational(defs) ? 1 : 0,
                    // IsOpen — the OPERATE verb's label state. Read for EVERY kind, not only the two
                    // that can be operated: the channel carries facts about devices, not answers to
                    // one surface's question, and a kind filter here would be a second place that
                    // knows which kinds have an open/shut control (GameSession.IsOperableKind is the
                    // one place, and it gates the VERB, not the data).
                    device.IsOpen ? 1 : 0,
                    // ⭐ M3-13 — CAN THIS KIND OF MACHINE EVER BE SERVICED? Asked of
                    // MaintenanceSystem, which owns the `maint` opt-out, and never computed here
                    // from `defs.Machines[...].MaintainBelow`: the comparison that makes the answer
                    // true (`Condition >= MaintainBelow`, and Condition is clamped at or above 0)
                    // lives in the sim beside the command it refuses, and a host-side copy of it is
                    // how the menu and the command come to disagree about the same machine.
                    MaintenanceSystem.IsEverServiceable(defs, device.Kind) ? 1 : 0));
            }
            return _devicesScratch;
        }

        /// <summary>
        /// ⛔ NOT BLOCKED — the sentinel <see cref="BlockedReason"/> returns when the worksite staging
        /// rule would accept this site. Deliberately a named constant and not <c>-1</c> scattered at
        /// three call sites: the reason vocabulary is append-only and a bare literal is how a sentinel
        /// eventually collides with a real value.
        /// </summary>
        private const int NotBlocked = -1;

        /// <summary>
        /// <b>WOULD THE JOB BOARD REFUSE TO STAGE A WORKER FOR THE SITE AT <paramref name="target"/>,
        /// AND WHY?</b> Returns <see cref="WireFormat.ReasonAir"/>,
        /// <see cref="WireFormat.ReasonNoApproach"/>, <see cref="WireFormat.ReasonWorkTypeOff"/>,
        /// <see cref="WireFormat.ReasonUnreachable"/>, or <see cref="NotBlocked"/>.
        ///
        /// THIS IS <c>JobWork.TryPathToAdjacent</c>'S LOOP WITH THE <c>FindPath</c> REMOVED AND NOTHING
        /// ELSE CHANGED (<c>sim/Sim.Core/Jobs/JobContext.cs:73-88</c>) — the same
        /// <see cref="Int3.Neighbor4"/> order, the same <c>InBounds</c>, the same
        /// <see cref="Simulation.IsWalkable"/>, the same <c>WorksiteSafety.CanStageWorkerAt</c>. That
        /// is not a coincidence to be maintained by hand: all three of dig, build and deconstruct route
        /// through that one method (checked in source — <c>DigJobSource.cs:97</c>,
        /// <c>BuildJobSource.cs:199,324</c>, <c>DeconstructJobSource.cs:137</c>), so mirroring its
        /// shape is the only way this channel can answer for all three.
        ///
        /// <b>THE PREDICATES ARE ASKED, NEVER RE-DERIVED.</b> The whole reason the atmosphere
        /// sub-reasons are absent is that asking is impossible for them and re-deriving is a second
        /// authority; see <c>WireFormat.Blocked.cs</c>'s header, omission (1).
        ///
        /// <b>IT NOW ASKS A THIRD QUESTION, AND IT ASKS IT LAST.</b> What used to be omission (2) —
        /// *"no crew can PATH here"* — is answered by <c>JobSystem.IsBackedOff</c>, the fan-out of
        /// <c>IJobSource.IsBackedOff</c> over dig, strip, build-ready, build-material and haul. It is
        /// still not a pathfind: the host never calls <c>FindPath</c>: it asks the job board what its
        /// own recent attempts did, which is a <c>Dictionary.TryGetValue</c> per source. See
        /// <see cref="WireFormat.ReasonUnreachable"/> for exactly how much weaker that answer is than
        /// "unreachable", and for why it still under-claims (only sites somebody TRIED carry a stamp).
        ///
        /// <b>⚠️ THE ORDER OF THE FOUR QUESTIONS IS BEHAVIOUR, NOT STYLE.</b>
        /// <c>JobWork.TryPathToAdjacent</c> stamps its back-off for an AIR refusal exactly as it does
        /// for a pathing one, so a site in bad air is very often backed off TOO. Asking the reach
        /// question first would repaint every airless order with a reason that sends the player
        /// looking for a route. <b>Approach ▸ air ▸ work-type ▸ reach</b>, and the first that fires
        /// wins.
        ///
        /// <b>⭐ AND IT NOW ASKS A FOURTH: IS ANYONE ABOARD EVEN ALLOWED TO DO THIS? (M2-18)</b>
        /// See <see cref="WireFormat.ReasonWorkTypeOff"/> for why it sits third — below the two
        /// questions about the WORLD (which stay true after the player flips the switch) and above
        /// the reach question (a latched record of a PAST attempt, where this is a live fact about
        /// the present). Under OD-H every work type boots off, so this is the reason the very first
        /// order a new player paints carries.
        ///
        /// The rows this channel emits are still a SUBSET of the truly-refused sites, never a
        /// superset — it under-claims, which is the safe direction for a surface whose entire purpose
        /// is to be believed.
        ///
        /// Allocation-free, and inert on a stack with no <see cref="SafetySystem"/> —
        /// <c>CanStageWorkerAt</c> short-circuits there, so the air reason simply never fires and only
        /// genuinely walled-in sites are reported. An honest "the rule is not running", not a
        /// fabricated all-clear. Inert likewise on a stack with no <see cref="JobSystem"/>: the reach
        /// question is simply never asked.
        ///
        /// ⚠️ NOT PURE ANY MORE, and that is the latch. This method WRITES <see cref="_latchNext"/>
        /// while it reads <see cref="_latched"/> — host-side render scratch, not sim state — so it
        /// must be called exactly once per site per render, from <see cref="AddIfBlocked"/>, inside
        /// one <see cref="BuildBlocked"/> pass. See <see cref="_latched"/> for the whole scheme.
        /// </summary>
        private int BlockedReason(Int3 target, int order)
        {
            bool anyWalkable = false, anyStageable = false;
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(target, i);
                if (!_sim.World.InBounds(n)) continue;
                if (!_sim.IsWalkable(n)) continue;
                anyWalkable = true;
                if (WorksiteSafety.CanStageWorkerAt(_sim, n)) { anyStageable = true; break; }
            }

            // ⭐⭐ M3-14 RUNG 3 — THE THIRD SURFACE ASKS THE SAME QUESTION WITH THE SAME FLAG.
            // `WorksiteSafety.CanStageWorkerAt(sim, tile, forced: true)` is TRUE unconditionally,
            // so "some walkable neighbour, and a HELD order on this site" is that call, spelled to
            // cost nothing on the healthy path — see CrewHeldByOrderAt for the cost argument.
            //
            // ⛔ WITHOUT THIS LINE THE SIM AND THE SURFACE DISAGREE ABOUT THE SAME TILE. Rung 2
            // walks a pawn into vacuum because the player said so; a `blocked` channel still asking
            // the UN-bypassed question then paints `ReasonAir` — "the air where a worker would have
            // to stand is not survivable" — over a site the sim is happily working. A false badge is
            // worse than the silence this channel exists to remove (the same argument
            // A_Site_Approached_Only_Through_A_DOORWAY_Is_Not_Blocked makes for the door clause),
            // and it is precisely the menu/job disagreement §8.4 rung 3 exists to prevent.
            //
            // ⚠️ NOT REACHABLE FROM THE SHIPPED COMMAND SET TODAY, WIRED ANYWAY, AND SAID SO. The
            // only writer of the hold is `PrioritiseJobCommand`, which issues `JobKind.Maintain`
            // against a DEVICE tile, and this builder's three `AddIfBlocked` walks visit dig, strip
            // and build sites. The two sets do not currently intersect. It is here for the reason
            // `JobContext.TryPathToAdjacent`'s twin is: one rule asked the same way at every site
            // that asks it, so the disagreement cannot arrive silently the day a held order can be
            // a dig. `BlockedChannelTests` drives it by staging the hold by hand.
            if (anyWalkable && !anyStageable && CrewHeldByOrderAt(target)) anyStageable = true;

            // ── question 3: has the job board itself failed to get anyone started here? ──
            // Asked for EVERY site, including the airless ones, because the LATCH has to keep
            // tracking a site while it is blocked for another reason — otherwise venting a
            // compartment would clear a reach latch that nothing had actually fixed. What the air
            // and approach questions win is the REPORTED REASON, not the bookkeeping.
            bool reached = _latchNext.Contains(target); // already folded this render (two orders, one tile)
            if (!reached)
            {
                var jobs = JobSystemOfStack();
                bool live = jobs != null && jobs.IsBackedOff(target, _sim.TickCount, out _);
                // A live stamp only STARTS a latch when nothing else is wrong with the site. A stamp
                // taken while the compartment was airless says "the air was bad", not "the route was
                // bad", and promoting it would let a vented room inherit a reach badge it never
                // earned. An EXISTING latch is carried regardless — see _latched.
                bool carry = _latched.Contains(target) && !CrewHoldsJobAt(target);
                if ((live && anyStageable) || carry) { _latchNext.Add(target); reached = true; }
            }

            if (!anyWalkable) return WireFormat.ReasonNoApproach;
            if (!anyStageable) return WireFormat.ReasonAir;
            if (NobodyAboardTakesTheWorkFor(order)) return WireFormat.ReasonWorkTypeOff;
            return reached ? WireFormat.ReasonUnreachable : NotBlocked;
        }

        /// <summary>
        /// ⭐ <b>M2-18 — CAN NOT ONE LIVING CREW MEMBER TAKE THE WORK THIS ORDER BELONGS TO?</b>
        /// The predicate behind <see cref="WireFormat.ReasonWorkTypeOff"/>, which carries the whole
        /// argument; only what is decided HERE is written here.
        ///
        /// <para><b>ASKED, NEVER RE-DERIVED — the single-authority rule this channel exists to
        /// keep.</b> Two questions, and the sim answers both: <c>WorkTypeMap.TryOf</c> classifies the
        /// job kind (M2-2's one table, the same one the dispatcher's five gates read), and
        /// <see cref="Citizen.CanTakeWorkType"/> answers per crew member. Reading
        /// <c>WorkPrioritiesRaw</c> here instead would be a host-side second implementation that
        /// disagrees with the dispatcher for an INCAPABLE pawn — the badge would vanish for a pawn
        /// the sim will never employ. Pinned by
        /// <c>BlockedChannelTests.A_Pawn_Whose_Work_Is_ON_But_Who_Is_INCAPABLE_Still_Blocks_The_Order</c>.</para>
        ///
        /// <para><b>THE ONE MAPPING THIS SIDE OWNS is order → job kind</b>, and it owns it because
        /// the ORDER enum is this channel's own vocabulary (<c>WireFormat.OrderDig</c> …), invented
        /// on the wire and unknown to the sim. It stops there: the kind goes straight into the sim's
        /// table rather than into a second opinion about what work a dig is. <c>OrderBuild</c> maps to
        /// <c>JobKind.Build</c>, and <c>HaulToBuild</c> — the material leg of the same site — is
        /// <c>Construct</c> in that same table (M2-2 charter row A7), so one lookup covers both legs
        /// of a build.</para>
        ///
        /// <para><b>ALL, not ANY</b>, and dead crew are skipped. An unrecognised order kind, or a job
        /// kind the sim classifies as not-work, returns <c>false</c>: this question cannot be answered
        /// for it, and the channel's standing direction is to under-claim rather than badge a tile on
        /// a guess. Allocation-free, no RNG, no mutation — an indexed walk of the citizen store, the
        /// declared scan order, exactly as <see cref="CrewHoldsJobAt"/> takes it.</para>
        /// </summary>
        private bool NobodyAboardTakesTheWorkFor(int order)
        {
            JobKind kind;
            switch (order)
            {
                case WireFormat.OrderDig: kind = JobKind.Dig; break;
                case WireFormat.OrderStrip: kind = JobKind.Deconstruct; break;
                case WireFormat.OrderBuild: kind = JobKind.Build; break;
                default: return false;
            }
            if (!WorkTypeMap.TryOf(kind, out var work)) return false;

            var citizens = _sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead) continue;
                if (c.CanTakeWorkType(work)) return false;
            }
            return true;
        }

        /// <summary>
        /// ⭐ <b>THE REACH LATCH — the decision this package had to take, stated here where it lives.</b>
        ///
        /// <b>THE PROBLEM.</b> <c>JobWork.UnreachableRetryTicks</c> is 50 ticks — FIVE SECONDS — and
        /// <c>HaulJobSource.ForgetBackoffsOnTileChange</c> wipes its whole map on any
        /// <c>JobBoardDirty.Tiles</c> event. Re-stamping requires a citizen to attempt the claim
        /// again, and a one-pawn crew on a 900 s Maintain service will not for 9 000 ticks. So the raw
        /// <c>IsBackedOff</c> predicate says "nobody can get here" for five seconds and then goes
        /// silent for a quarter of an hour with the door still shut. Shipping that would re-introduce
        /// the invisible-feedback failure the <c>marks</c> channel exists to prevent, inside the
        /// package built to remove it — *a designation the player cannot see is indistinguishable from
        /// a broken verb.*
        ///
        /// <b>THE DECISION: LATCH IN THE HOST.</b> The package charter recommended latching in the
        /// CLIENT. It is done here instead, for four reasons, and the first two are the ones that
        /// decided it:
        ///
        /// <para>(1) <b>A CLIENT LATCH IS LOST ON RELOAD.</b> This channel's own doc says the payload
        /// "can sit unchanged for hours"; <c>BlockedChannelTests</c> asserts it survives a reconnect
        /// through <c>Snapshot()</c> precisely because of that. A latch held in a browser tab is
        /// discarded by F5 and by every reconnect, so the player who reloads gets the fifteen-minute
        /// silence back — the exact defect, re-introduced for anyone who refreshes.</para>
        ///
        /// <para>(2) <b>THE CLEAR CONDITION IS A FACT ONLY THIS SIDE HAS.</b> The charter's own rule
        /// is "until the tile leaves the order registry entirely" — and the client cannot see the
        /// order registries. It would have to JOIN <c>marks</c> (dig + strip) and <c>designs</c>
        /// (build) to approximate it, which is the cross-channel join <c>WireFormat.Blocked.cs</c>
        /// argues against by name when it explains why <c>order</c> rides the tuple at all. Making the
        /// anti-drift channel depend on two other channels to know when to stop talking is the wrong
        /// trade. Worse, absence is AMBIGUOUS to a client: "the stamp expired" and "somebody fixed it"
        /// look identical on the wire. This side can clear on the true event instead — see (3).</para>
        ///
        /// <para>(3) <b>IT CAN CLEAR ON SUCCESS, NOT MERELY ON ABSENCE.</b> <c>TryClaim</c> removes a
        /// site's stamp when a claim SUCCEEDS, and the same instant is visible here as a live citizen
        /// holding a job on that tile (<see cref="CrewHoldsJobAt"/>). So the latched claim is the
        /// honest one — *the last attempt failed and none has succeeded since* — and re-opening the
        /// door really does clear the badge on its own, which is step 7 of the package's acceptance
        /// demo.</para>
        ///
        /// <para>(4) It costs the same as the client option in the things that matter: <b>no
        /// <c>sim/</c> behaviour change, nothing hashed, nothing saved, no def field, no tuning of
        /// <c>UnreachableRetryTicks</c></b> (which would be a determinism-path change affecting the
        /// dispatcher's cost on every ship). This is render scratch beside
        /// <c>_blockedScratch</c>/<c>_haulSourceResolved</c>.</para>
        ///
        /// <b>THE SCHEME, AND WHY IT IS TWO SETS AND NOT A DICTIONARY WITH A TIMESTAMP.</b>
        /// <see cref="_latched"/> is what was latched as of the previous render;
        /// <see cref="_latchNext"/> is filled during the current one and the two are swapped at the
        /// end of <see cref="BuildBlocked"/>. A site is carried forward only if it is visited again —
        /// so a site that leaves its registry (dug out, un-designated, built, stripped) is pruned
        /// automatically, with no sweep, no expiry heuristic and no unbounded growth. Neither set is
        /// ever ENUMERATED: they are <c>Contains</c>/<c>Add</c> only, so no hash container's layout can
        /// reach the socket and the emission order stays the three registry walks. (That is the
        /// <c>IJobSource</c> rule-4 discipline, applied on this side of the wire for the same reason.)
        ///
        /// <b>⚠️ WHAT IT COSTS, STATED NOT BURIED.</b> A latched site keeps its badge while the crew
        /// are busy elsewhere even if the obstruction has been cleared — nobody has reached it, which
        /// is what the row says, but a player who opens the door and then watches an idle-less ship
        /// will see the badge persist until somebody actually takes the job. That is the deliberate
        /// direction: this channel's failure mode must be "still complaining after the fix" rather
        /// than "silent while broken". A second, smaller cost: two orders on one tile fold to one
        /// latch entry (the <c>_latchNext.Contains</c> short-circuit above), which is consistent with
        /// the client drawing one badge per tile.
        /// </summary>
        private System.Collections.Generic.HashSet<Int3> _latched = new System.Collections.Generic.HashSet<Int3>();
        private System.Collections.Generic.HashSet<Int3> _latchNext = new System.Collections.Generic.HashSet<Int3>();

        /// <summary>Is some live citizen currently holding a job whose target is <paramref name="p"/>?
        /// The observable consequence of <c>IJobSource.TryClaim</c> having SUCCEEDED there, which is
        /// the event that clears a reach latch. An indexed loop over the citizen entity store — the
        /// declared scan order, no enumeration of a hash container — and <c>JobTarget</c> is the site
        /// for every kind this channel reports (dig, strip, build, and <c>HaulToBuild</c>, which
        /// stores the SITE as its target from the outset even while the citizen walks to the
        /// material). Kind is deliberately NOT filtered: a citizen standing on this tile for any
        /// reason at all still means somebody got here.</summary>
        /// <summary>⭐ <b>M3-14 — is some live citizen HELD BY A PLAYER ORDER on a job whose target
        /// is <paramref name="p"/>?</b> The host-side spelling of the `forced` flag
        /// <c>WorksiteSafety.CanStageWorkerAt</c> takes, and the sim's own record of an order:
        /// <see cref="Citizen.HeldByOrder"/>, whose invariant <c>HeldByOrder ⇒ JobKind != None</c>
        /// means a true answer is always a working pawn. Nothing is re-derived and no second
        /// registry is consulted — <c>_prioritised</c> is host render scratch and would answer for
        /// orders the sim REFUSED, which is the opposite of the question.
        ///
        /// <para>⚠️ <b>ASKED ONLY ON THE REFUSED PATH, and that is a cost decision.</b>
        /// <see cref="BlockedReason"/> runs per designated site per render; an O(crew) walk per
        /// site would be a real bill on a ship painted with orders. It is asked only after the
        /// four-neighbour loop has already concluded the site is AIR-refused, which is rare and is
        /// the only branch whose answer it can change. The twin
        /// <see cref="CrewHoldsJobAt"/> is a different question (ANY job, for the reach latch) and
        /// deliberately stays a different method.</para></summary>
        private bool CrewHeldByOrderAt(Int3 p)
        {
            var citizens = _sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || !c.HeldByOrder) continue;
                var t = c.JobTarget;
                if (t.X == p.X && t.Y == p.Y && t.Z == p.Z) return true;
            }
            return false;
        }

        private bool CrewHoldsJobAt(Int3 p)
        {
            var citizens = _sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                if (c.Dead || c.JobKind == JobKind.None) continue;
                var t = c.JobTarget;
                if (t.X == p.X && t.Y == p.Y && t.Z == p.Z) return true;
            }
            return false;
        }

        /// <summary>The live <see cref="JobSystem"/> out of the running stack, resolved ONCE — the
        /// <see cref="HaulSource"/> / <see cref="BuildSystemOfStack"/> precedent, and for the same
        /// reason: a reader owns its own dependency rather than growing <see cref="Simulation"/> a
        /// convenience accessor. Null when the stack registers no dispatcher, in which case the reach
        /// question is never asked and no latch is ever started — an honest "we cannot know", not a
        /// fabricated all-clear.</summary>
        private JobSystem _jobSystem;
        private bool _jobSystemResolved;
        private JobSystem JobSystemOfStack()
        {
            if (_jobSystemResolved) return _jobSystem;
            _jobSystemResolved = true;
            var systems = _sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is JobSystem js) { _jobSystem = js; return _jobSystem; }
            return null;
        }

        /// <summary>Add one refused site to the scratch list, fog-gated and bounds-gated. Returns
        /// silently when the site is fine, out of the world, or in the dark — one place, so the three
        /// registry walks below cannot come to disagree about the gates.</summary>
        private void AddIfBlocked(Int3 p, int order)
        {
            // Bounds first, defensively: an out-of-range Pos would index the flag plane and throw on
            // the render thread — the guard BuildItems and BuildDevices both take, for the same reason.
            if (!_sim.World.InBounds(p)) return;
            // FOG GATE, mirroring GlyphMapper pass 1 and every sparse channel since. See the header of
            // WireFormat.Blocked.cs: a player can only designate what they can see, so this is
            // consistency rather than a live filter — and it is what stops this channel becoming the
            // one that leaks the map the day a designation arrives from somewhere that is not a click.
            if ((_sim.World.GetFlags(p) & TileFlags.Explored) == 0) return;
            int reason = BlockedReason(p, order);
            if (reason == NotBlocked) return;
            // ⭐ M3-13 — `DetailNone`. None of the four reasons this walk can produce (air, approach,
            // work-type-off, unreachable) has a per-reason payload: each is a complete sentence about
            // the WORLD, and the one reason that names a thing — ReasonNoConsumable — is emitted by
            // `AddUnfixableRow` and never from here. Written as the constant rather than as a literal
            // −1 so a reader of this line finds the table in `WireFormat.BlockedCell`.
            _blockedScratch.Add(new WireFormat.BlockedCell(p.X, p.Y, p.Z, order, reason,
                                                           WireFormat.DetailNone));
        }

        /// <summary>
        /// ⭐⭐ <b>M2-9 — THE REPAIR ORDER'S ONE REFUSAL: the machine the player pointed at is below
        /// <c>wear.wreck_threshold</c> and there is no Parts, Seals or Swarf aboard to fix it with.</b>
        /// Emits <see cref="WireFormat.ReasonNoConsumable"/>, which until this package was DECLARED
        /// AND NEVER EMITTED.
        ///
        /// <para><b>THE PREDICATE IS ASKED, IN ONE LINE, AND IT IS THE SIM'S OWN</b> —
        /// <c>MaintenanceSystem.IsUnfixableWreck</c>, in <see cref="BuildBlocked"/>'s repair walk
        /// immediately above the call to this method, which is where the SAME answer also decides
        /// whether the order is still worth remembering. It is public for exactly that call: its own
        /// doc comment says a view-only <c>blocked</c> channel *"needs to be able to ask the same
        /// question the dispatcher asks rather than re-deriving it — re-deriving is how the two
        /// answers drift apart"*. A host-side scan for a Parts stack would be that second authority,
        /// and it would be wrong in three ways this file could not see: the tier ladder (Parts ▸
        /// Seals ▸ Swarf), the reservation and carry filters, and the breathability of the stack's
        /// own tile.</para>
        ///
        /// <para>⚠️ <b>THIS METHOD THEREFORE DOES NOT RE-ASK IT.</b> The caller has established that
        /// the machine is an unfixable wreck; what is left here is the CHANNEL's own discipline —
        /// bounds, fog, de-duplication — and nothing about repair. Asking again would double the
        /// expensive call for every badged machine on every render.</para>
        ///
        /// <para>⛔ <b>IT ASKS ONLY THAT ONE QUESTION — <see cref="BlockedReason"/>'s four-reason
        /// ladder is deliberately NOT applied to a repair order</b>, and the reason is
        /// <see cref="WireFormat.ReasonWorkTypeOff"/>: a direct order OVERRIDES the work grid
        /// (<c>PrioritiseJobCommand</c>, §2.2), so "nobody aboard is assigned that work" is FALSE of
        /// this order by construction, and under OD-H it would be the answer the player got on every
        /// right-click of a fresh game. The air and approach questions would be honest, and their
        /// absence is a stated gap rather than a claim: the command's staging refusal stays silent
        /// (<c>docs/MECHANICS.md</c> §13). Under-claiming is this channel's standing direction.</para>
        ///
        /// <para>⭐⭐ <b>M3-14 (2026-07-31) — HALF OF THAT GAP IS NOW CLOSED AND THE OTHER HALF IS
        /// NARROWED, AND THE DIFFERENCE MATTERS TO WHOEVER READS THIS NEXT.</b> ⛔ <b>THE AIR
        /// QUESTION IS NO LONGER "HONEST BUT ABSENT" — APPLYING IT TO A REPAIR ORDER WOULD NOW BE
        /// WRONG.</b> A direct order overrides the air (rung 2, <c>rimworld-reference.md</c> §8.4;
        /// <c>PrioritiseJobCommand</c> asks <c>TryFindStagingTile</c> with <c>forced: true</c>), so
        /// a <see cref="WireFormat.ReasonAir"/> row over an ordered machine would badge work the sim
        /// is about to do — the exact menu/job disagreement rung 3 exists to prevent, and the
        /// thing a well-meant "finish the ladder" edit would re-create. <b>Do not add it.</b>
        /// <br/><b>WHAT REMAINS A GENUINE GAP is the APPROACH question alone</b> — a machine with no
        /// walkable neighbour at all is still refused (an order crosses air, never geometry) and the
        /// player is still told nothing. That is the residual, named here rather than left implicit,
        /// and it is FILED, not fixed: it is a new emission on a shipped channel and M3-14's outcome
        /// did not need it.
        /// <br/>⚠️ <b>AND M3-14 WIDENED THAT SILENCE'S REACH RATHER THAN MERELY INHERITING IT — say
        /// so, because it is a cost this package took, not one it found.</b> The air gate used to
        /// refuse these orders AT ISSUE TIME: an order into a sealed compartment was dropped by
        /// <c>PrioritiseJobCommand</c> and nothing further happened. Now the order is ACCEPTED, the
        /// hold is placed, and the refusal moves downstream to the GEOMETRY — with the ship's doors
        /// still shut at boot, <c>TryFindStagingTile</c> finds no walkable neighbour, so she is held
        /// on a job she never starts. Driven by independent review: <c>held = true</c>,
        /// <c>took = true</c>, <c>startedWork = false</c>, stationary for 300 sim-s and resolving
        /// only around tick 12 000. <b>It self-clears</b> (the hold dies with the job) and it is
        /// strictly better than the old silent drop — the player can at least see who is holding
        /// what — but the class of "an order that visibly goes nowhere" is now REACHABLE FROM THE
        /// BOOT STATE, which it was not before. Open the door and it proceeds.</para>
        ///
        /// <para>Bounds- and fog-gated exactly as <see cref="AddIfBlocked"/> is, and de-duplicated
        /// against rows already emitted for the same tile by this walk — two crew members ordered at
        /// one machine are one blocked machine, not two. (The scan is over the repair rows only and
        /// they are bounded by the crew; a tile may still legitimately carry BOTH a dig row and a
        /// repair row, exactly as it may carry a dig and a build row today.)</para>
        /// </summary>
        private void AddUnfixableRow(Device device)
        {
            var p = device.Pos;
            if (!_sim.World.InBounds(p)) return;
            if ((_sim.World.GetFlags(p) & TileFlags.Explored) == 0) return;
            for (int i = 0; i < _blockedScratch.Count; i++)
            {
                var row = _blockedScratch[i];
                if (row.Order == WireFormat.OrderRepair && row.X == p.X && row.Y == p.Y && row.Deck == p.Z) return;
            }
            // ⭐⭐ M3-13 — THE DETAIL: WHICH CONSUMABLE THIS STALLED ORDER IS WAITING FOR, so the
            // badge can say `NEEDS PARTS` instead of the generic `NO PARTS OR SEALS ABOARD` — a
            // sentence that OMITS SWARF (a third tier that clears this row on its own) and names no
            // item to go and get. ⚠️ It is NOT wrong because of ControllerModule: a repair order
            // never wants one (censused — CommissionDeviceCommand and ThawGate's rungs are its only
            // consumers), and the charter's premise on that point is corrected in
            // WireFormat.ReasonNoConsumable's remarks. ⛔ ASKED, NOT RESTATED: `MaintenanceSystem`'s own ladder
            // (`RepairConsumableTier`, the declaration `FindNearestConsumable` walks). An
            // `ItemKind.Parts` literal here would read identically today and would drift silently
            // the day the top tier moves — omission (1) of this channel's header, by name.
            _blockedScratch.Add(new WireFormat.BlockedCell(p.X, p.Y, p.Z,
                                                           WireFormat.OrderRepair, WireFormat.ReasonNoConsumable,
                                                           (int)MaintenanceSystem.WantedRepairConsumable));
        }

        /// <summary>
        /// The sparse BLOCKED-ORDER layer — one <see cref="WireFormat.BlockedCell"/> per site the
        /// player queued that the sim's own rules refuse, read from the two order
        /// registries, the tile flag plane and (M2-9) this host's pending direct orders. See
        /// <c>hosts/web/WireFormat.Blocked.cs</c> for what this
        /// channel is, which predicates it ASKS versus INFERS, and the four things it deliberately
        /// leaves out.
        ///
        /// ORDER — digs on the z,y,x world walk (the <c>IJobSource</c> rule-3 scan order, identical in
        /// shape to <see cref="BuildMaterials"/> / <see cref="BuildZones"/> / <see cref="BuildMarks"/>),
        /// then strips in <c>DeconstructSystem.Pending</c> index order, then builds in
        /// <c>BuildSystem.Pending</c> index order, then direct repair orders in CITIZEN STORE order.
        /// Four deterministic walks over plain
        /// <c>IReadOnlyList</c>s; nothing is enumerated out of a hash container, so no container layout
        /// can reach the socket. Pinned by <c>BlockedChannelTests</c>.
        ///
        /// <b>WHY DIG NEEDS THE WORLD WALK AND THE OTHER TWO DO NOT</b>, since it is the one asymmetry
        /// here: a dig order is a TILE FLAG (<c>TileFlags.Designated</c>) and has no registry to
        /// enumerate, while strip and build both keep a <c>Pending</c> list. Walking the world for
        /// strip/build as well would turn two O(orders) walks into two O(45×18×8) walks with a linear
        /// registry probe inside each — which is the shape <see cref="BuildMarks"/> pays for and the
        /// reason its cost is +61 µs.
        ///
        /// ⚠️ COST — MEASURED, NOT ARGUED, AND THE EMPTY CASE IS THE ONE THAT MATTERS, because it is
        /// the normal state of a healthy ship. The world walk costs a flag read and one bit test per
        /// tile whether or not anything is designated; only tiles that ARE designated pay for
        /// <see cref="BlockedReason"/>. Method: a delegate bound once to this builder (NOT
        /// <c>MethodInfo.Invoke</c> per call, which costs more than the method and would be charged to
        /// the channel), 400-call warm-up, then 200 iterations per sample, median of n = 5 WITHIN a
        /// run, repeated over THREE process runs, DEBUG build, one machine, <c>--ship grid</c> fully
        /// explored, with the render measured by the same method in the same process:
        ///
        ///   nothing painted   <b>0 rows, 29 B, 8.45 / 8.45 / 8.45 µs</b> of a ~517 µs render — <b>~1.6 %</b>
        ///   44 digs painted   <b>34 rows, 480 B, 58.0 / 57.2 / 57.5 µs</b> of a ~446 µs render — <b>~12.9 %</b>
        ///
        /// ⚠️ <b>THE PUBLISHED "BIMODAL 25–56 µs" IS RETRACTED. There is no bimodality</b> — both
        /// configurations are flat within a run and across runs (spread &lt; 1.5 %), re-measured here
        /// and independently by review. The earlier run's alternating 26/56 pattern was never
        /// explained; the machine was carrying concurrent suites, which that write-up noted elsewhere
        /// and then set aside in favour of a guess about tiered JIT. <b>The lesson is the ordering: a
        /// hypothesis about the CODE was published ahead of a known confound in the MEASUREMENT.</b>
        ///
        /// ⚠️ <b>AND THE LEVEL IS NOT PORTABLE, WHICH IS THE MORE USEFUL FINDING.</b> Independent
        /// review re-measured the SAME row count on the SAME machine and read a flat <b>~24.2 µs</b>
        /// where this run reads a flat ~57.6 µs — a 2.4× disagreement between two careful runs of the
        /// same code, unexplained. The empty case moved too (~12.0 µs published, 8.45 µs here). <b>Only
        /// the SHAPE is durable: empty is cheap and flat, painted is ~5–7× empty, and the likeliest
        /// term behind that multiple is <c>CanCycle</c>'s linear scan of <c>Simulation.Systems</c>
        /// inside <c>CanStageWorkerAt</c> — INFERRED, not isolated by a measurement</b> (see
        /// <c>WireFormat.Blocked.cs</c> on that comment's own justification going stale).
        /// Do not quote a single microsecond figure from this file as a fact about a player's machine.
        /// <b>The empty case was ~26 µs before the dig walk was flattened</b> (see the walk itself), so
        /// most of what this channel costs an untouched ship was removed by a two-line change — and the
        /// rest of it is removable outright by exposing <c>DigJobSource._sites</c> (named in the header
        /// as the next lane's cheap win).
        ///
        /// FOR COMPARISON, from the same programme's own records: <c>devices</c> is ~26 µs (~6.1 %) on
        /// grid, <c>marks</c> is +61 µs forever, <c>items</c> is ~0.9 µs. The honest placement is
        /// BELOW <c>items</c>+<c>devices</c> with nothing painted, and around <c>marks</c> once the
        /// player has painted — <b>not</b> "nearly free".
        ///
        /// ⚠️ AND THE SOCKET IS NOT FREE EITHER, WHICH AN EARLIER DRAFT OF THIS PARAGRAPH CLAIMED. It
        /// said <see cref="Send"/> "dedupes the empty payload forever after the first render, so the
        /// socket cost on a healthy ship is zero". The dedupe is real, but the premise is not:
        /// <c>--ship grid</c> AUTHORS 20 dig designations and TEN of them are blocked, so the standard
        /// ship's steady-state payload is 10 rows, not zero (see <c>WireFormat.Blocked.cs</c>'s
        /// retraction and <c>BlockedChannelTests</c>). It is still deduped — the payload does not
        /// change while the geometry does not — so the socket sees it once; but "empty" was wrong and
        /// is corrected rather than softened. <b>It is also TEMPORARY: driven, the ten rows clear
        /// themselves by ~35 sim-minutes and the channel is empty from then on</b>, so the standard
        /// ship's true steady state is 0 rows and the 10-row state is the opening. Wall-clock is soft
        /// under concurrency and this machine ran other suites during the run.
        ///
        /// The scratch list is reused, so a steady state allocates only the payload string.
        ///
        /// ⚠️ <b>WHAT THE THIRD QUESTION ADDS TO THAT COST — DECLARED, AND NOT SEPARATELY MEASURED.</b>
        /// Per EXPLORED order site: one <c>JobSystem.IsBackedOff</c>, which is one
        /// <c>Dictionary.TryGetValue</c> per registered source (five probes today — dig, haul,
        /// deconstruct, and build×2 inside one call) plus one <c>HashSet</c> probe of
        /// <see cref="_latched"/>. Per LATCHED site only, one further O(crew) walk
        /// (<see cref="CrewHoldsJobAt"/>, 8 on the standard ship). Nothing here walks the world, and
        /// <b>the empty-ship cost is UNCHANGED</b> — a ship with no orders visits no sites, so the flat
        /// flag-plane scan above is still the whole idle bill.
        ///
        /// ⚠️ <b>WHAT THE FOURTH WALK (M2-9's REPAIR ORDERS) ADDS — DECLARED, AND NOT MEASURED,
        /// FOR THE SAME REASON.</b> It is gated on <c>_prioritised.Count > 0</c>, so a session in
        /// which nobody has ever right-clicked a machine pays <b>one integer compare</b> and the idle
        /// bill is untouched. With orders pending it is O(crew): one dictionary probe per living crew
        /// member, plus — per PENDING order only — one <c>Devices.TryGet</c> and one
        /// <c>MaintenanceSystem.IsUnfixableWreck</c>. ⛔ That last call is the expensive one and its
        /// own doc comment says so: below <c>wear.wreck_threshold</c> it is up to THREE full
        /// item-store scans, and the worst case is exactly the state that produces a row. It is
        /// bounded by the number of PENDING orders (an order the sim has accepted is retired from the
        /// map on the next render), which is at most the crew — and on a wreck a machine ABOVE the
        /// floor short-circuits on the first line without scanning at all.
        /// <b>No microsecond figure is quoted because none was taken.</b> This file's own history is
        /// the reason: it carries a retracted "bimodal 25–56 µs", and two careful runs of the SAME
        /// code disagreed by 2.4× on the same machine — with several lanes building concurrently the
        /// night this landed, a number taken here would be worth less than the sentence saying it was
        /// not taken.
        ///
        /// VIEW-ONLY: a read of authoritative state, never a write, never hashed. ⚠️ The ONE piece of
        /// mutable state this builder owns is the reach latch (<see cref="_latched"/>), which lives
        /// entirely on this side of the wire, is never saved, never hashed and never restored — and is
        /// folded exactly once per render, because <see cref="Render"/> calls this method exactly once.
        /// </summary>
        private readonly List<WireFormat.BlockedCell> _blockedScratch = new List<WireFormat.BlockedCell>();
        private List<WireFormat.BlockedCell> BuildBlocked()
        {
            _blockedScratch.Clear();
            // The reach latch's mark half. `_latchNext` accumulates every site still worth latching
            // as the three walks below visit it, and the two sets are swapped at the bottom — so a
            // site that has left its registry is pruned by simply not being visited. See _latched.
            _latchNext.Clear();
            var world = _sim.World;
            int w = world.Width;   // only to recover x,y from a flat index — see the dig walk below

            // 1) DIG — a tile flag, so this one has to be a world walk.
            //
            // ⚠️ A FLAT SCAN OF THE FLAG PLANE, NOT THE HOUSE z,y,x TRIPLE LOOP, AND THE ORDER IS
            // IDENTICAL. `ZLevel.Index(x, y)` is `y * Width + x` (checked in source), so ascending
            // index IS ascending y then x — the same emission order `BuildMarks`/`BuildZones`/
            // `BuildMaterials` produce, and `BlockedChannelTests` pins it. What it removes is the
            // per-tile multiply and the inner loop's bounds work, and `x`/`y` are recovered by a
            // divide ONLY on the rare tile that is actually designated.
            //
            // It is written this way because this walk is THE ONE COST THIS CHANNEL PAYS WHEN ITS
            // PAYLOAD IS EMPTY, which is the normal state of a healthy ship, and the empty case was
            // MEASURED before and after rather than argued: ~26 µs → ~12 µs of a ~430–480 µs render on
            // `--ship grid` (median n = 5, 200 iterations/sample, DEBUG, delegate-bound builder),
            // i.e. it roughly HALVED the empty-payload cost. ⚠️ Re-measured on the same machine after
            // the send-back, the flattened walk reads 8.45 µs of a ~517 µs render (~1.6 %) — the same
            // improvement, a different absolute level. LEVELS FROM THIS FILE ARE NOT PORTABLE and the
            // method's doc comment says why; the RATIO is what this paragraph claims. It is still not
            // free, and it is removable outright — see the header's note on `DigJobSource._sites`.
            for (int z = 0; z < world.Depth; z++)
            {
                var flags = world.Levels[z].Flags;
                for (int i = 0; i < flags.Length; i++)
                {
                    if ((flags[i] & (byte)TileFlags.Designated) == 0) continue;
                    AddIfBlocked(new Int3(i % w, i / w, z), WireFormat.OrderDig);
                }
            }

            // 2) STRIP — the deconstruct registry, in its own list order. Null on a reduced stack.
            var strip = _sim.Deconstruct;
            if (strip != null)
            {
                var pending = strip.Pending;
                for (int i = 0; i < pending.Count; i++) AddIfBlocked(pending[i].Pos, WireFormat.OrderStrip);
            }

            // 3) BUILD — the build registry, in its own list order. Null on a stack without a
            // BuildSystem, in which case there are no build sites to be blocked at.
            //
            // ⚠️ A BUILD SITE IS THE CLASS WHERE THE STAGING RULE DESTROYS ACHIEVABLE WORK, and it is
            // on this channel for exactly that reason. `BuildSystem.cs` FloorConstructTicks = 20 — a
            // floor build is TWO SECONDS and completes in hard vacuum against a 45 s flee deadline, so
            // the rule denies work that would have landed (SafetySystem.cs's own retraction says so).
            // Leaving builds off would have made the one loss that matters invisible on the surface
            // built to make losses visible — the same argument the scenario host's livelock audit makes
            // for its own BUILD column.
            var build = BuildSystemOfStack();
            if (build != null)
            {
                var sites = build.Pending;
                for (int i = 0; i < sites.Count; i++) AddIfBlocked(sites[i].Pos, WireFormat.OrderBuild);
            }

            // ⭐ 4) REPAIR — the player's DIRECT orders (M2-9), and the walk that discharges
            // ReasonNoConsumable. Appended LAST, so the emission order the other three walks pin is
            // unchanged; the wire's order contract is append-only exactly as its vocabularies are.
            //
            // ⚠️ WALKED OVER THE CITIZEN STORE, NOT OVER `_prioritised`. The dictionary is a lookup;
            // enumerating it would put a hash container's layout on the socket, which every other
            // walk here is written to avoid. The citizen store is the same declared scan order
            // `NobodyAboardTakesTheWorkFor` and `CrewHoldsJobAt` take.
            if (_prioritised.Count > 0)
            {
                // (a) ⭐ THE ORDER DOES NOT SURVIVE THE PAWN. `NeedsSystem.Kill` REMOVES the citizen
                // from the store (NeedsSystem.cs, its last line), so a dead crew member's order is
                // never visited by the emit walk below and would sit in this map for the rest of the
                // session — invisible, and one entry per crew member who ever dies. §2.1 draws the
                // line this closes: a designation survives the pawn, a DIRECT ORDER does not.
                // The keys ARE enumerated here, unlike anywhere else in this builder, and that is
                // safe for one reason only: this pass exclusively REMOVES. Nothing a hash container's
                // layout decides can reach the socket. The doomed keys are collected first because a
                // Dictionary may not be mutated while it is being enumerated.
                _prioritiseDrop.Clear();
                foreach (var order in _prioritised)
                    if (!_sim.Citizens.TryGet(order.Key, out var owner) || owner.Dead)
                        _prioritiseDrop.Add(order.Key);
                for (int i = 0; i < _prioritiseDrop.Count; i++) _prioritised.Remove(_prioritiseDrop[i]);

                // (b) EMIT, over the CITIZEN STORE.
                var citizens = _sim.Citizens.Items;
                for (int i = 0; i < citizens.Count; i++)
                {
                    var c = citizens[i];
                    if (!_prioritised.TryGetValue(c.Id, out uint deviceId)) continue;
                    if (!_sim.Devices.TryGet(deviceId, out var device)) { _prioritised.Remove(c.Id); continue; }

                    // ⭐ THE RETIRE RULE, AND IT IS A WHITELIST — an entry survives this render for
                    // exactly TWO reasons, and everything else is dropped.
                    //
                    // ⛔ IT WAS A BLACKLIST AND THAT LEAKED. The first version retired only the
                    // order the sim had TAKEN, which quietly kept every order the sim REFUSED for a
                    // reason other than the wreck rule: order a repair on a healthy machine and the
                    // entry outlived the command's own tick, cost up to three item-store scans per
                    // render for the rest of the session (`IsUnfixableWreck`'s own declared worst
                    // case), and could later raise a NO PARTS badge for an order the sim never took
                    // — a sentence about a machine the player was never actually waiting on.
                    //
                    // (1) SHE IS HELD ON A JOB AT THAT MACHINE — the order was taken, and from here
                    //     the HELD JOB is the record of it (§2.2 keeps the forced flag on `curJob`),
                    //     so this side needs to remember nothing.
                    // (2) THE MACHINE IS AN UNFIXABLE WRECK — the one refusal this channel exists to
                    //     NAME. The entry is what keeps the badge up, and the badge comes down by
                    //     itself the moment a stack the crew can reach appears.
                    //
                    // Both are LIVE predicates re-asked every render, so nothing here latches: an
                    // order refused on Condition, on staging, on incapability or because somebody
                    // else got the machine first is gone by the next frame.
                    //
                    // ⚠️ `IsUnfixableWreck` IS ASKED EXACTLY ONCE PER PENDING ORDER, HERE, and the
                    // answer is handed to the emitter rather than asked again inside it. The retire
                    // rule and the badge are the SAME question, and this call is the expensive one:
                    // below the wreck floor it is up to three full item-store scans (its own doc
                    // comment says so), and the worst case is precisely the state that keeps a row.
                    //
                    // ⭐⭐ M3-14 RUNG 3 — `forced: true`, AND THIS IS THE REACHABLE HALF OF THE
                    // MENU/JOB AGREEMENT. Every entry in `_prioritised` IS a player order, so the
                    // question this row answers is "would the ORDER be refused for want of a
                    // consumable", and that is `PrioritiseJobCommand`'s question — asked there with
                    // the same flag, one line apart. Without it the badge lies in the one state the
                    // wreck premise makes ordinary: a machine behind the pressure frontier whose
                    // Parts are behind it too. The dispatcher cannot fetch them (correct, rung 0),
                    // the ORDER can, and an un-bypassed `IsUnfixableWreck` would stamp NO PARTS over
                    // a repair that is already under way three tiles from the stack.
                    bool taken = c.HeldByOrder && c.JobKind == JobKind.Maintain && c.JobTarget == device.Pos;
                    if (taken || !MaintenanceSystem.IsUnfixableWreck(_sim, device, forced: true))
                    {
                        _prioritised.Remove(c.Id);
                        continue;
                    }
                    AddUnfixableRow(device);
                }
            }

            // SWEEP: this render's marks become the latch. A plain reference swap, so the sets are
            // reused for the life of the session and a steady state allocates only the payload string.
            var swap = _latched; _latched = _latchNext; _latchNext = swap;

            return _blockedScratch;
        }

        /// <summary>The live <see cref="BuildSystem"/> out of the running stack, resolved ONCE — the
        /// <see cref="HaulSource"/> precedent, and for the same reason: a reader owns its own dependency
        /// rather than growing <see cref="Simulation"/> a convenience accessor (<c>Simulation.cs</c> is a
        /// spine file, and this lane's <c>sim/</c> diff must be empty). An indexed loop over an array, so
        /// nothing is enumerated out of a hash container. Null when the stack registers no
        /// <see cref="BuildSystem"/>, in which case there are no pending builds to report at all.</summary>
        private BuildSystem _buildSystem;
        private bool _buildSystemResolved;
        private BuildSystem BuildSystemOfStack()
        {
            if (_buildSystemResolved) return _buildSystem;
            _buildSystemResolved = true;
            var systems = _sim.Systems;
            for (int i = 0; i < systems.Length; i++)
                if (systems[i] is BuildSystem bs) { _buildSystem = bs; return _buildSystem; }
            return null;
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
        /// Heading / Walking / Holding / Awaiting / Idle); the client's on-map work marker classifies on that first word
        /// (`taskTag` in console-model.js) and treats the en-route verb Heading as "has a job but
        /// is not working yet" (`watchTask`), so KEEP THE VERB SET AND THE CLIENT MAP IN STEP.
        ///
        /// The old catch-all reported "walking" for every job-less crew member — 99.9% of all
        /// labels in the playtest — which read as "busy" when the truth was "nothing assigned".
        /// A job-less walker now says so out loud, and a parked crew member reads Idle/Holding.
        ///
        /// ⭐ M2-20 — TWO WORDS FOR THE TWO JOB-LESS STATES OD-H CREATED, and the distinction is
        /// the package: <b>"Awaiting orders"</b> (the player has switched NO work type on, so the
        /// ship is waiting on them) and <b>"Idle"</b> (she is enabled and has nothing reachable to
        /// do — the state that already existed and keeps its word unchanged). Under
        /// OD-H every work type boots off, so *unassigned* is the state of every crew member on
        /// every new game and *idle* is the rarer one. Collapsing them into one word is a lie in
        /// whichever direction it is done — see `client/src/ui/overview-view.js`, where the
        /// opposite collapse was the shipped position until this package.
        ///
        /// ⚠️ AN UNASSIGNED PAWN WHO IS WANDERING STILL READS UNASSIGNED. Idle wander
        /// (`CitizenSystem.cs:70-79`) sets a path and never a JobKind, and it is what an unassigned
        /// pawn DOES while she waits — so the *unassigned* branch deliberately wins over the
        /// "Walking to …(no task)" prefix rather than composing with it. The alternative was a row
        /// whose destination coordinates change on every tile step during the first ten seconds of
        /// a new game, which is exactly when the sentence has to be readable. HOLDING still wins
        /// over both: it is a per-citizen park (authored today, `AuthoredShips.cs:170-171`) that
        /// blocks work by itself, so it is the more specific answer to "why is she not working".
        ///
        /// The label always names the JOB and its object. It does NOT claim the work has started:
        /// a crew member still crossing the deck reads "Heading to service scrubber_ls", and only
        /// switches to "Servicing scrubber_ls" once they have arrived. The playtest complaint was
        /// "claimed to be fixing X while doing nothing visible", and an activity verb (plus its
        /// on-map SVC tag) floating over a walking pawn is that same claim. `HasPath` is the ground
        /// truth — the very predicate the job-less branch below already reads.
        ///
        /// Transit-shaped jobs (Fetching/Hauling/Eating) already say they are in transit, so they
        /// keep their verb. A crew member with NO job reads Walking / Holding / Awaiting / Idle.
        ///
        /// ⭐ M2-6 — AND THEN <b>WHY THAT JOB AND NOT ANOTHER</b>: <see cref="AppendRankingClause"/>
        /// may append <i>" — Deconstruct is priority 4"</i>. It is a SUFFIX by design, after every
        /// branch above including the job-less ones, for two reasons: the client's on-map work
        /// marker classifies on the label's FIRST word (`taskTag`), which a suffix cannot disturb;
        /// and M2-6 CONSUMES M2-20's vocabulary rather than competing with it — the words for
        /// *unassigned* and *idle* are decided above and this package adds no third one. See that
        /// method for the three states in which it deliberately says nothing at all.
        ///
        /// PURE READ: device/item/build lookups only ever read; nothing here mutates the sim or
        /// touches the RNG. `task` is a pre-existing roster field, so no wire shape moves.
        /// </summary>
        /// <remarks>⚠️ <c>internal</c>, not <c>private</c>, and only for one reason (M2-20): the
        /// zero-alloc guard has to MEASURE this method rather than infer it from a whole render,
        /// where a 48-byte-per-call regression sits well inside the JSON builder's noise. Same
        /// assembly, same protection in the shipping host; the tests compile
        /// <c>GameSession.cs</c> directly (see <c>Perilune.Tests.csproj</c>).</remarks>
        internal string TaskLabel(Citizen c)
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
                    // No job. Say which of the FOUR job-less states this actually is (M2-20).
                    // ⛔ TWO WORDS, NOT ONE — see the header above. `awaiting` is the sim's own
                    // answer, never a host-side re-derivation.
                    bool awaiting = !HasAnyWorkEnabled(c);
                    if (c.HasPath && !awaiting)
                    {
                        sb.Append("Walking to ");
                        AppendTile(sb, c.Path[c.Path.Count - 1], c.Pos.Z);
                        sb.Append(" (no task)");
                    }
                    else if (c.HoldPosition) sb.Append("Holding position");
                    else if (awaiting) sb.Append(AwaitingOrdersLabel);
                    else sb.Append("Idle");
                    break;
            }
            AppendRankingClause(sb, c);   // ⭐ M2-6 — …and WHY this job and not another
            return sb.ToString();
        }

        /// <summary>
        /// ⭐ <b>M2-6 — THE <c>why</c> CLAUSE: <i>"Stripping the wall at 12,7 — Deconstruct is
        /// priority 4"</i>.</b> The label above says WHAT she is doing; without this it never says
        /// why THAT job and not the one the player just ordered, so <i>"she is ignoring me"</i> and
        /// <i>"she ranked it lower"</i> are the same picture. The clause names the work type the
        /// current job belongs to and the priority the player gave it — the number that chose it.
        ///
        /// <para>⛔ <b>IT SPEAKS ONLY WHEN IT HAS SOMETHING TO SAY. THREE REFUSALS, EACH A DECISION:</b>
        /// <list type="number">
        ///   <item><b>Nothing was ranked</b> — no job at all, or a NEED (<c>Eat</c>, <c>Drink</c>,
        ///     <c>Flee</c>), which the work grid never gates. <see cref="WorkTypeMap.TryOf"/> is the
        ///     ONE place that classifies a <see cref="JobKind"/> as work, and its <c>false</c> is
        ///     read rather than discarded: an ignored return here would append <i>"Repair is
        ///     priority 0"</i> (the enum's natural zero) to <b>"Awaiting orders"</b> — plausible
        ///     prose over a state it does not describe, which is the charter's mutation 1b and the
        ///     shape this repo calls cheap-and-invisible.</item>
        ///   <item><b>She has no ranking for the work she is holding</b> —
        ///     <see cref="Citizen.CanTakeWorkType"/>, the sim's own predicate, folding BOTH reasons
        ///     (switched off, or incapable). This state is REACHABLE, not theoretical: the haul veto
        ///     is asked at the CLAIM only, so a crew member finishes a delivery whose work type the
        ///     player switched off mid-carry (<c>WorkTypeVetoTests.MidHaul_HaulSwitchedOff_DeliveryStillCompletes</c>).
        ///     <i>"Haul is priority 0"</i> would be a lie about a grid cell that is blank.</item>
        ///   <item><b>Exactly one work type is switched on</b> — <i>"Repairing — Repair is priority
        ///     1"</i> when Repair is the only thing she is ALLOWED to do explains nothing, and under
        ///     OD-H (every work type boots off) that is the state of nearly every crew member for
        ///     the player's whole first hour. A ranking clause is an answer to <i>"why this and not
        ///     that"</i>; with one candidate there is no <i>that</i>.</item>
        /// </list></para>
        ///
        /// <para><b>THE PRIORITY IS READ FRESH FROM THE <see cref="Citizen"/> ON EVERY CALL</b> —
        /// <see cref="Citizen.GetWorkPriority"/>, never a host-side copy cached beside the roster.
        /// The clause is a claim about the grid as it is NOW, and the player's own gesture is to
        /// flip a cell and watch the line: a stale number would make the WORK tab look inert at the
        /// exact moment it is being used. Pinned by
        /// <c>WhyLineTests.FlippingThePriority_TheNextFramesClauseFollows</c>.</para>
        ///
        /// <para><b>ZERO ALLOCATION, NO RNG, NO MUTATION</b> — it appends into <see cref="_task"/>,
        /// the reused scratch builder, and the work-type word is a <see cref="WorkTypeWords"/> table
        /// lookup because <c>Enum.ToString()</c> hands back a fresh string every call (MEASURED at
        /// 24 B/call on this runtime — it is mutation 3 and the allocation guard's own yardstick).</para>
        ///
        /// <para>⚠️ <b>THE PRIORITY IS A SINGLE <c>char</c> FOR CULTURE, NOT FOR BYTES — and the
        /// difference was measured rather than assumed.</b> <c>byte.ToString()</c> on a value under
        /// 300 returns a CACHED string on .NET 8 and allocates <b>nothing</b>, so "it would allocate"
        /// would have been a false justification for this line. What it would do is read the
        /// AMBIENT CULTURE, on a dev machine that is de-DE, in a repo whose rule is InvariantCulture
        /// everywhere; <c>'0' + band</c> cannot. The arithmetic is safe BY DOMAIN — a manual priority
        /// is <c>1</c>..<see cref="WorkPriority.Lowest"/> and <see cref="Citizen.SetWorkPriority"/>
        /// throws outside it — and <c>WhyLineTests.AManualPriorityIsAlwaysASingleDigit</c> reddens
        /// if that domain ever grows past 9, which is the only way this could silently emit
        /// punctuation instead of a number.</para>
        /// </summary>
        private static void AppendRankingClause(System.Text.StringBuilder sb, Citizen c)
        {
            if (!WorkTypeMap.TryOf(c.JobKind, out var type)) return;   // refusal 1 — nothing was ranked
            if (!c.CanTakeWorkType(type)) return;                      // refusal 2 — no ranking to report
            if (CountWorkEnabled(c) < 2) return;                       // refusal 3 — there was no choice

            sb.Append(RankingSeparator).Append(WorkTypeWords[(int)type])
              .Append(" is priority ").Append((char)('0' + c.GetWorkPriority(type)));
        }

        /// <summary>
        /// ⭐ <b>M2-6 fix-back — THE ONE SEPARATOR BETWEEN <i>WHAT</i> SHE IS DOING AND <i>WHY</i>.</b>
        /// Everything before it is the job; everything after it is the ranking clause.
        ///
        /// <para><b>IT IS A PARSING CONTRACT, NOT DECORATION, AND IT HAS A SECOND HALF IN THE
        /// CLIENT.</b> The two crew docks are ~26 and ~23 characters wide and every clause-bearing
        /// label is 43–54, so a dock that renders the whole string shows a junk fragment
        /// (<i>"Servicing door_d0_s0 — Re…"</i>) — the payload always past the ellipsis. The docks
        /// therefore render only the part BEFORE this separator, and the Overview's selected readout
        /// (<c>.ov-task</c>, 266 px and wrapping) renders the whole sentence. The client's half of
        /// this constant is <c>WHY_SEPARATOR</c> in
        /// <c>client/src/ui/console-model.js</c> — ⛔ change one and you must change the other, and
        /// <c>client/test/why-line.test.js</c> is where that pairing is pinned.</para>
        ///
        /// <para>⚠️ <b>WHY SPLITTING ON IT IS UNAMBIGUOUS.</b> No base label
        /// <see cref="TaskLabel"/> can emit contains " — ": the labels are verbs, device names, item
        /// names and tile coordinates, and the only em dash the method appends is this one. It is
        /// also always a SUFFIX — <see cref="AppendRankingClause"/> runs after every branch of the
        /// switch — so the clause can be taken off the end without looking at what precedes it.
        /// <c>WhyLineTests.NoBaseLabel_ContainsTheSeparator</c> drives every
        /// <see cref="JobKind"/> and reddens the day that stops being true.</para>
        /// </summary>
        internal const string RankingSeparator = " — ";

        /// <summary>
        /// The player-facing word for each <see cref="WorkType"/>, indexed by the enum's own value.
        ///
        /// <para><b>A TABLE RATHER THAN <c>Enum.ToString()</c> FOR ONE REASON: allocation.</b> This
        /// is read once per crew member per render and <c>Enum.ToString()</c> hands back a fresh
        /// string every call — the same trap <see cref="HasAnyWorkEnabled"/>'s counted loop exists
        /// to avoid. ⛔ Which makes it a HAND-MIRRORED PAIR, the shape this repo has been bitten by
        /// four times, so it is pinned to the enum it mirrors rather than merely believed:
        /// <c>WhyLineTests.EveryWorkType_HasTheSimsOwnWordInTheHostsTable</c> requires
        /// <c>WorkTypeWords[t] == ((WorkType)t).ToString()</c> for every t and reddens the day a
        /// seventh work type is declared.</para>
        ///
        /// <para>⚠️ These are the WORK TAB'S TOOLTIP WORDS, not its column headers: the grid's
        /// headers are abbreviations (<c>BUILD</c> for Construct, <c>STRIP</c> for Deconstruct —
        /// <c>client/src/ui/overview-model.js</c> <c>WORK_COLUMNS</c>) while each column's title
        /// spells the work type out in full. The clause uses the full word because it is a sentence,
        /// not a 5-character column head.</para>
        /// </summary>
        /// <remarks>⚠️ <c>internal</c>, not <c>private</c>, for the same one reason M2-20 made
        /// <see cref="TaskLabel"/> internal: the pair guard has to READ the table it is pinning
        /// rather than infer it from prose. Same assembly, same protection in the shipping host.</remarks>
        internal static readonly string[] WorkTypeWords =
            { "Repair", "Construct", "Craft", "Deconstruct", "Mine", "Haul" };

        /// <summary>
        /// ⭐ <b>M2-20 — THE WORD FOR A CREW MEMBER THE PLAYER HAS NOT GIVEN ANY WORK TO.</b>
        ///
        /// <para>⚠️ <b>THE EXACT STRING IS REVERSIBLE AND IS OWNER BATCH ITEM 11.</b> It ships as
        /// the INTEGRATOR'S RECOMMENDATION (2026-07-29, unanswered), not as a settled decision:
        /// change it here and both surfaces follow, because both render the host's own words.</para>
        ///
        /// <para>⛔ <b>AND IT IS THE SHORT FORM BECAUSE THE LONG ONE WAS MEASURED CLIPPED IN THE
        /// SHIPPING GAME.</b> The recommendation was <c>"Unassigned — awaiting orders"</c>, and it
        /// was built, shipped to a browser and driven before it was believed. Real Chrome,
        /// <c>--ship wreck</c>, 1600×1000 (<c>client/tools/awaiting-shot.mjs</c>'s rig, 2026-07-30):
        /// <list type="bullet">
        ///   <item>CREW WATCH <c>.ov-crewtask</c>: content <b>155 px</b> in a <b>145 px</b> box ⇒
        ///     <c>text-overflow:ellipsis</c> ate the last word — the row read "…awaiting order…".</item>
        ///   <item>Room Zoom <c>.rz-crewtask</c>: content <b>146 px</b> in a <b>118 px</b> box ⇒
        ///     worse, and this is the narrower dock by design.</item>
        /// </list>
        /// ⇒ The two docks are ~28 and ~24 characters wide at their shipped font sizes. A sentence
        /// that has to be scrolled to be read is the invisible-feedback defect wearing a longer
        /// word, and widening two shared docks to fit one label is the wrong trade. So the fact
        /// about the PLAYER is kept ("the ship is waiting on you") and the fact about her grid is
        /// dropped: the WORK tab already answers <i>which</i> types are off, cell by cell.
        /// ⚠️ If the owner reverses this to a longer string, MEASURE IT — the guard that failed
        /// here is a browser, not a test.</para>
        /// </summary>
        internal const string AwaitingOrdersLabel = "Awaiting orders";

        /// <summary>
        /// Has the player switched ON any work type at all for this crew member?
        ///
        /// <para><b>THE SIM'S OWN PREDICATE, ASKED SIX TIMES — never a host-side re-derivation of
        /// the grid.</b> <see cref="Citizen.CanTakeWorkType"/> folds BOTH reasons to refuse (the
        /// player switched it off, or the person is incapable of it), and the dispatcher, the
        /// crafting recruiter, the maintenance recruiter and both LLM gates ask exactly this
        /// question at exactly this granularity (M2-2's five gates). A label derived from
        /// <c>WorkPrioritiesRaw</c> directly would read "unassigned" over a pawn the sim will
        /// happily employ the moment her incapability clears — two answers to one question, which
        /// is the defect the <c>marks</c> channel exists to remove.</para>
        ///
        /// <para><b>ZERO ALLOCATION, NO RNG, NO MUTATION.</b> A counted <c>for</c> over
        /// <see cref="WorkPriority.WorkTypeCount"/> with an <c>int</c>→enum cast: no
        /// <c>Enum.GetValues</c> (allocates an array per call), no LINQ, no boxing. Pinned by
        /// <c>AwaitingOrdersTests.TaskLabel_AddsNoPerCallAllocation_ForTheUnassignedBranch</c>,
        /// because <see cref="TaskLabel"/> runs once per crew member per render at ≤10 Hz.
        /// The same shape as <c>JobSystem.cs:378</c>, which sums candidate work the same way.</para>
        ///
        /// <para>⚠️ <c>WorkPriorityStateTests.OnlyEnrolledFilesReadTheWorkGrid</c> is the ledger of
        /// who may read this grid, and it scans <c>sim/</c> ONLY — so this host-side read is
        /// outside its reach and enrols nothing. Stated rather than discovered: the ledger's
        /// silence here is a scope, not a permission.</para>
        /// </summary>
        internal static bool HasAnyWorkEnabled(Citizen c) => CountWorkEnabled(c) > 0;

        /// <summary>
        /// ⭐ <b>M2-6 — HOW MANY work types the player has switched on, and it is
        /// <see cref="HasAnyWorkEnabled"/>'s only implementation.</b>
        ///
        /// <para>The <c>why</c> clause needs a COUNT ("is there more than one candidate?") where
        /// M2-20 needed only a bit ("is there any?"), and the two questions are the same walk over
        /// the same grid asking <see cref="Citizen.CanTakeWorkType"/>. ⛔ Writing a second loop
        /// beside the first is exactly how a repo acquires two answers to one question — the
        /// <c>IsBackedOff</c> / <c>codeOnly</c> / <c>NON_FURNITURE</c> shape CLAUDE.md names — so
        /// there is ONE loop and the predicate is derived from it. The cost is the early exit
        /// (at most six comparisons per crew member per render, on a ≤10 Hz path) and the price of
        /// keeping it would have been a mirrored pair.</para>
        ///
        /// <para><b>ZERO ALLOCATION, NO RNG, NO MUTATION</b> — the same counted <c>for</c> with the
        /// same <c>int</c>→enum cast M2-20 shipped: no <c>Enum.GetValues</c>, no LINQ, no boxing.
        /// Still pinned by <c>AwaitingOrdersTests.HasAnyWorkEnabled_IsZeroAlloc</c>, which now
        /// measures this loop through its caller.</para>
        /// </summary>
        internal static int CountWorkEnabled(Citizen c)
        {
            int n = 0;
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                if (c.CanTakeWorkType((WorkType)t)) n++;
            return n;
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

    /// <summary>Input command kinds the browser can send (mirrors GameLoop's key actions).
    ///
    /// <para>⭐ <b><c>AddRoom</c> IS GONE, AND THE RENUMBER IT WAS FEARED FOR HAPPENED — M1-L-b,
    /// 2026-07-29.</b> M1-L (OD-K) had already deleted every route to it — the client sender
    /// (<c>Cmd.addRoom</c>), the <c>"addroom"</c> parse case, the dispatch route and
    /// <c>HandleAddRoom</c>/<c>ParseRoomType</c> — and left the MEMBER standing at ordinal 17 only
    /// because removing it shifts every sibling after it down by one. M1-L-b removed it and let that
    /// shift happen: <c>Dig</c> 18→17, <c>Stockpile</c> 19→18, <c>Strip</c> 20→19, <c>Filter</c>
    /// 21→20, <c>Commission</c> 22→21, <c>Operate</c> 23→22, <c>WorkPriority</c> 24→23.</para>
    ///
    /// <para><b>WHY THE SHIFT IS SAFE, censused on the MERGED tree rather than assumed</b> (the
    /// eighth trap shape — <i>"nothing calls this" is a statement about a TREE, and a merge changes a
    /// tree</i>): <b>nothing anywhere converts between a <c>CmdKind</c> and a number.</b> The wire
    /// carries verb STRINGS and <see cref="WebCommand.Parse"/> maps string→member; there is no
    /// number→member path at all. <c>CmdKind</c> appears in no save chapter and in no
    /// <c>WireFormat*.cs</c>. Its only two consumers read MEMBERS — <c>WebHost.cs:219</c>'s
    /// <c>!= CmdKind.Unknown</c> and this file's dispatch <c>switch</c>. The only <c>(int)CmdKind</c>
    /// casts in the tree were the three lines of
    /// <c>EveryCompartmentIsARoomTests.CmdKindOrdinals_ArePinned_AndAddRoomIsGone</c>, which exists to be the
    /// checklist of exactly this move and was updated in the same commit.</para>
    ///
    /// <para>⭐ <b>A NEW KIND IS APPENDED, NEVER INSERTED</b> (M2-4, and the arithmetic above is
    /// why). These members are implicitly numbered, so inserting one renumbers every sibling after
    /// it exactly as removing one does. A new kind goes at the END even when a neighbouring position
    /// would read better — and if a future lane ever gives the ordinals a consumer (a persisted
    /// value, a binary frame), write the numbers out explicitly first.</para></summary>
    public enum CmdKind { Unknown = 0, Cursor, Click, Move, Deck, Lens, Speed, Pause, Talk, Say, Bye, Chron, Moss, Build, Bio, Place, Remove, Dig, Stockpile, Strip, Filter, Commission, Operate, WorkPriority, Prioritise }

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
        // M2-4 work-priority payload: Work = a WorkType index, Priority = 0 (off) or 1..4 with 1 the
        // HIGHEST. NAMED FIELDS RATHER THAN A RIDE ON `X`/`Y`/`I`, and deliberately: `filter`'s mask
        // and `place`'s deck ride on `i` because each verb needs ONE scalar beside a tile, whereas this
        // verb has no tile at all and needs TWO — and X/Y mean "a tile on the current deck" in every
        // other message this struct carries. A priority silently read as a coordinate is a bug no
        // compiler could catch. Both DEFAULT TO THE -1 SENTINEL, not to 0: on this verb 0 is a real
        // value in BOTH fields (Repair, and OFF), so a default of 0 would make an absent key
        // indistinguishable from the order "stop repairing".
        public readonly int Work, Priority;

        public WebCommand(CmdKind kind, int x = 0, int y = 0, int i = 0, string name = null,
                          int sid = 0, uint cid = 0, string text = null, string op = null, string tid = null,
                          int work = -1, int priority = -1)
        {
            Kind = kind; X = x; Y = y; I = i; Name = name;
            Sid = sid; Cid = cid; Text = text; Op = op; Tid = tid;
            Work = work; Priority = priority;
        }

        /// <summary>Parse one message. Two families share this reader:
        /// the original view commands keyed by "cmd" ({"cmd":"cursor","x":3,"y":4} /
        /// {"cmd":"deck","dz":1} / {"cmd":"lens","name":"power"} / {"cmd":"speed","delta":-1} /
        /// {"cmd":"pause"}), and the dialogue/MOSS commands keyed by "type"
        /// ({"type":"talk","cid":N} / {"type":"say","sid":N,"text":".."} / {"type":"bye","sid":N} /
        /// {"type":"moss","op":"open|set|audit|sys|exec|thaw","tid":"..","text"?}). For `thaw`,
        /// `text` is the capsule's Device.Name (M3-3). Unknown/garbage ⇒
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
                    // {"cmd":"place","kind":"bunk|desk|chair|locker|plant|lamp|growbed|medbed|table|heater",
                    //  "x":..,"y":..,"deck":..} — place a furniture device (Room Zoom decorate palette).
                    case "place": return new WebCommand(CmdKind.Place, Int(json, "x"), Int(json, "y"), i: Int(json, "deck"), name: Str(json, "kind"));
                    // {"cmd":"remove","x":..,"y":..,"deck":..} — remove a placed furniture device at a tile.
                    case "remove": return new WebCommand(CmdKind.Remove, Int(json, "x"), Int(json, "y"), i: Int(json, "deck"));
                    // E0-6 — fit a ControllerModule to the device on a tile, making it
                    // MOSS-scriptable. Same {x,y,deck} shape as place/remove.
                    case "commission": return new WebCommand(CmdKind.Commission, Int(json, "x"), Int(json, "y"), i: Int(json, "deck"));
                    // ⭐ M1-L: `case "addroom":` is DELETED. An `{"cmd":"addroom"}` line from an OLD
                    // client now falls to `default` and decodes as `CmdKind.Unknown`, which the
                    // dispatcher ignores — the same treatment as any other unrecognised verb, and the
                    // reason the deletion is safe against a stale browser tab.
                    // {"cmd":"operate","x":..,"y":..,"deck":..} — toggle the door/vent on a tile
                    // OPEN⇄SHUT. Same {x,y,deck} shape as place/remove/commission, and DELIBERATELY
                    // NOT an explicit `on` the way dig/stockpile/strip carry one: those are painted in
                    // sweeps where idempotence matters, whereas this is one click on one device whose
                    // current state the player is looking at. An explicit target would also let a
                    // stale client re-assert a state the crew or MOSS has since changed.
                    case "operate": return new WebCommand(CmdKind.Operate, Int(json, "x"), Int(json, "y"), i: Int(json, "deck"));
                    // M2-4 — THE WORK-PRIORITY ORDER: {"cmd":"workPriority","cid":N,"work":T,"priority":P}
                    // — set ONE crew member's manual priority for ONE work type. `work` is a WorkType
                    // index (0..5, the OD-J order Repair·Construct·Craft·Deconstruct·Mine·Haul) and
                    // `priority` is 0 = off or 1..4 with 1 the HIGHEST (RimWorld's convention, which
                    // reads backwards against intuition and is why the sim names the constants).
                    //
                    // KEYED BY `cmd` LIKE EVERY OTHER ORDER VERB (dig/stockpile/strip/filter/place/
                    // operate) rather than by `type`, which is the dialogue/MOSS family. It carries a
                    // `cid` the way `talk`/`bio` do, but what it IS is an order about work, not a
                    // conversation.
                    //
                    // ⚠️ BOTH PAYLOAD FIELDS DECODE TO THE -1 SENTINEL WHEN ABSENT OR NON-NUMERIC, NOT
                    // TO 0 — the `filter` mask's lesson, and it bites twice as hard here. `priority` 0
                    // is a REAL, reachable order (switch this work type OFF) and `work` 0 is a REAL work
                    // type (Repair, the wreck's premise), so letting a missing key fall to 0 would turn
                    // a malformed line into "stop repairing" — the most destructive reading available
                    // and, under OD-H, an invisible one. Both sentinels land on
                    // SetWorkPriorityCommand's own range guard and are dropped there, which is the same
                    // single silent drop every other unexpressible message gets. (The sentinel is the
                    // CONSTRUCTOR's default, so `return default` — the garbage path — leaves both at 0
                    // instead; that is unreachable rather than a hole, because `default` carries
                    // `CmdKind.Unknown` and `Apply` never routes it.)
                    case "workPriority": return new WebCommand(CmdKind.WorkPriority, cid: (uint)Int(json, "cid"),
                                                              work: Int(json, "work", -1), priority: Int(json, "priority", -1));
                    // ⭐ M2-9 — THE DIRECT ORDER: {"cmd":"prioritise","cid":N,"x":..,"y":..,"deck":..}
                    // — send ONE named crew member to repair the machine on ONE tile. The {x,y,deck}
                    // shape is operate/place/remove's, and it is the only shape available: the
                    // `devices` channel carries no device id, so a tile is how a client names a
                    // machine. `cid` is the same entity id `talk`/`bio`/`workPriority` carry.
                    //
                    // NO SENTINELS HERE, and the difference from `workPriority` directly above is
                    // worth stating rather than looking like an oversight: a missing key falling to
                    // 0 lands on tile (0,0,0) with citizen 0 — a hull corner and an id no citizen
                    // has — so the worst a malformed line can express is an order the sim silently
                    // refuses, not a DESTRUCTIVE one. `workPriority` needed sentinels precisely
                    // because 0 is a real order there ("stop repairing").
                    case "prioritise": return new WebCommand(CmdKind.Prioritise, Int(json, "x"), Int(json, "y"),
                                                             i: Int(json, "deck"), cid: (uint)Int(json, "cid"));
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
