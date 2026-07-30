using System;
using System.Collections.Concurrent;
using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>
    /// The deterministic core. Fixed tick (10 Hz), explicit system order, all input
    /// via the command inbox, all randomness via forked SimRng streams.
    /// No UnityEngine anywhere in this assembly.
    /// </summary>
    public sealed class Simulation
    {
        public const int TicksPerSecond = 10;
        public const float TickSeconds = 1f / TicksPerSecond;

        public World World { get; }
        public EventBus Events { get; } = new EventBus();
        public SimRng Rng { get; }
        public long TickCount => _tick;

        /// <summary>The data-driven tuning graph this sim reads its constants from
        /// (B3/B4 redirect the systems here). Defaults to the frozen
        /// <see cref="SimDefs.Default"/> when the caller passes none — behaviour is
        /// unchanged until a system actually consumes it. NOT folded into
        /// <see cref="StateHash"/> (both determinism twins share one instance).</summary>
        public SimDefs Defs { get; }

        public readonly EntityStore<Citizen> Citizens = new EntityStore<Citizen>();
        public readonly EntityStore<Device> Devices = new EntityStore<Device>();
        public readonly EntityStore<ItemStack> Items = new EntityStore<ItemStack>();
        public readonly RoomState Rooms = new RoomState();
        public readonly PathService Paths = new PathService();

        /// <summary>Set by terrain/designation/device changes; PowerSystem rebuilds networks when set.</summary>
        public bool PowerDirty = true;

        /// <summary>Which derived sub-boards changed; JobSystem rescans the flagged ones and skips
        /// the rest (W0-3). Writers <c>|=</c> the axes they touched — see <see cref="JobBoardDirty"/>
        /// for the mapping. Forced to <see cref="JobBoardDirty.All"/> at boot and on load.</summary>
        public JobBoardDirty JobsDirty = JobBoardDirty.All;

        /// <summary>Bumped on any device add/remove — cheap staleness check for derived
        /// topologies (fluid networks) that don't own PowerDirty.</summary>
        public int DeviceTopologyVersion;

        /// <summary>Global greywater pool (liters): drinking and plant transpiration feed
        /// it; reclaimers convert it back to tank water at ~93% (conservation law —
        /// water is never created, only cycled with losses).</summary>
        public float WastewaterLiters;

        private long _tick;
        private uint _nextEntityId = 1;
        private readonly ISimSystem[] _systems;
        private readonly DeconstructSystem _deconstruct;
        private readonly StockZoneSystem _stockZones;
        private readonly ConcurrentQueue<ISimCommand> _inbox = new ConcurrentQueue<ISimCommand>();
        private readonly List<ISimCommand> _drain = new List<ISimCommand>(64);
        private readonly Dictionary<Int3, uint> _deviceGrid = new Dictionary<Int3, uint>();

        public Simulation(World world, ulong seed, ISimSystem[] systems, SimDefs defs = null)
        {
            World = world ?? throw new ArgumentNullException(nameof(world));
            Rng = new SimRng(seed);
            _systems = systems ?? Array.Empty<ISimSystem>();
            Defs = defs ?? SimDefs.Default;
            // Resolve the optional deconstruct registry ONCE (a reduced stack has none). This is
            // purely so the PURE projection can recolour a condemned tile — see Deconstruct.
            for (int i = 0; i < _systems.Length; i++)
                if (_systems[i] is DeconstructSystem d) { _deconstruct = d; break; }
            // Resolve the optional stockpile-filter registry ONCE (E0-4), the exact _deconstruct
            // precedent — a reference for the haul board / harness, NOT a new saved or hashed field
            // (StockZoneSystem serialises and folds itself in its own ZONE chapter).
            for (int i = 0; i < _systems.Length; i++)
                if (_systems[i] is StockZoneSystem z) { _stockZones = z; break; }
        }

        /// <summary>
        /// The deconstruct/strip registry (E0-5), or <c>null</c> on a reduced stack without one.
        /// READ-ONLY VIEW, and it adds no saved or hashed field — the registry serialises and folds
        /// itself in its own STRP chapter; this is only a reference resolved once at construction.
        ///
        /// It exists for the PURE projection (<c>GlyphMapper</c>, a Sim.Glyph consumer that reads
        /// only public sim state): deconstruct is a REGISTRY, not a <see cref="TileFlags"/> bit, so
        /// unlike dig/stockpile the map layer cannot read a condemned tile off the tile plane and
        /// must ask the registry. Nothing here mutates the sim.
        /// </summary>
        public DeconstructSystem Deconstruct => _deconstruct;

        /// <summary>
        /// The E0-4 filtered-stockpile registry (per-tile accept masks), or <c>null</c> on a
        /// reduced stack without one. READ-ONLY VIEW, and it adds no saved or hashed field — the
        /// registry serialises and folds itself in its own ZONE chapter; this is only a reference
        /// resolved once at construction, the <see cref="Deconstruct"/> precedent.
        ///
        /// It exists for the haul board (WP-2, <c>HaulJobSource</c> asks
        /// <see cref="StockZoneSystem.Accepts"/> which free stockpile tiles will take a carried
        /// kind) and the occupancy harness (WP-3). Nothing here mutates the sim.
        /// </summary>
        public StockZoneSystem StockZones => _stockZones;

        /// <summary>Conduits and pipes are service-tray overlays: they share tiles with
        /// machines and never enter the tile grid (side-section world).</summary>
        public static bool IsUtilityOverlay(DeviceKind kind) =>
            kind == DeviceKind.Conduit || kind == DeviceKind.Pipe;

        public Device AddDevice(DeviceKind kind, Int3 pos, string name)
        {
            var device = new Device { Kind = kind, Pos = pos, Name = name };
            Devices.Add(device, _nextEntityId++);
            if (!IsUtilityOverlay(kind))
            {
                _deviceGrid[pos] = device.Id;
                World.SetFlag(pos, TileFlags.HasDevice, true);
            }
            Rooms.MarkDirty();
            PowerDirty = true;
            DeviceTopologyVersion++;
            return device;
        }

        public void RemoveDevice(uint id)
        {
            if (!Devices.TryGet(id, out var device)) return;
            if (!IsUtilityOverlay(device.Kind) &&
                _deviceGrid.TryGetValue(device.Pos, out uint gridId) && gridId == id)
            {
                _deviceGrid.Remove(device.Pos);
                World.SetFlag(device.Pos, TileFlags.HasDevice, false);
            }
            Devices.Remove(id);
            Rooms.MarkDirty();
            PowerDirty = true;
            DeviceTopologyVersion++;
        }

        public bool TryGetDeviceAt(Int3 pos, out Device device)
        {
            device = null;
            return _deviceGrid.TryGetValue(pos, out uint id) && Devices.TryGet(id, out device);
        }

        /// <summary>
        /// THE walkability rule (door-aware), shared by pathing, movement stepping and
        /// job approach checks so they can never drift apart.
        /// </summary>
        public bool IsWalkable(Int3 p)
        {
            var level = World.Levels[p.Z];
            int i = level.Index(p.X, p.Y);
            if ((level.Flags[i] & (byte)TileFlags.Walkable) == 0) return false;
            if ((level.Flags[i] & (byte)TileFlags.Scenery) != 0) return false; // blocking prop
            if ((level.Flags[i] & (byte)TileFlags.HasDevice) != 0 && TryGetDeviceAt(p, out var device))
            {
                if (device.Kind == DeviceKind.Door) return device.IsOpen && !device.IsLocked;
                if (Defs.Machines[(int)device.Kind].Blocks) return false;
            }
            return true;
        }

        /// <summary>
        /// Cleanly cancel a citizen's job: drop carried cargo where they stand and
        /// release pickup reservations. Used by player move orders and death handling.
        /// </summary>
        public void CancelJob(Citizen citizen)
        {
            if (citizen.JobKind == JobKind.None && citizen.CarryingItemId == 0) return;

            if (citizen.CarryingItemId != 0)
            {
                if (Items.TryGet(citizen.CarryingItemId, out var carried) && carried.CarriedBy == citizen.Id)
                {
                    carried.Pos = citizen.Pos;
                    carried.CarriedBy = 0;
                    carried.ReservedBy = 0; // the carrier owned this stack (CarriedBy proved it)
                }
                citizen.CarryingItemId = 0;
            }
            else if (citizen.ReservedItemId != 0)
            {
                // Release exactly the stack this citizen reserved — never a co-located
                // stranger's (or a crafting station's) reservation. Two reserved stacks can share
                // a tile, so gate on the owner id, not just "reserved" (B-1 makes this exact).
                if (Items.TryGet(citizen.ReservedItemId, out var reserved) &&
                    reserved.CarriedBy == 0 && reserved.ReservedBy == citizen.Id)
                    reserved.ReservedBy = 0;
            }

            citizen.ReservedItemId = 0;
            citizen.JobKind = JobKind.None;
            citizen.JobWorkTicks = 0;
            // Cargo was dropped/unreserved (Items) and the citizen left a dig/build site (Citizens,
            // which re-derives every source's assigned set). No tile or pending-list change.
            JobsDirty |= JobBoardDirty.Items | JobBoardDirty.Citizens;
        }

        public Citizen AddCitizen(string name, Int3 pos)
        {
            var citizen = new Citizen { Name = name, Pos = pos, PrevPos = pos };
            Citizens.Add(citizen, _nextEntityId++);
            return citizen;
        }

        public ItemStack AddItem(ItemKind kind, int count, Int3 pos)
        {
            var item = new ItemStack { Kind = kind, Count = count, Pos = pos };
            Items.Add(item, _nextEntityId++);
            JobsDirty |= JobBoardDirty.Items; // a loose ground stack appeared — the headline W0-3 case
            return item;
        }

        // --- MOSS program sources are sim state (TDD §4.5). The DSL runtime compiles
        // them; this list is the canonical, saved copy. Insertion-ordered.
        public readonly List<ScriptEntry> Scripts = new List<ScriptEntry>();

        public void SetScript(string terminalId, string source)
        {
            for (int i = 0; i < Scripts.Count; i++)
            {
                if (Scripts[i].TerminalId != terminalId) continue;
                Scripts[i] = new ScriptEntry(terminalId, source);
                return;
            }
            Scripts.Add(new ScriptEntry(terminalId, source));
        }

        // --- Load-time restore hooks (used by SaveReader/Writer; same assembly) ---
        internal ISimSystem[] Systems => _systems;
        internal uint NextEntityId => _nextEntityId;

        internal void RestoreClock(long tick, uint nextEntityId)
        {
            _tick = tick;
            _nextEntityId = nextEntityId;
        }

        internal void RegisterLoadedDevice(Device device)
        {
            _deviceGrid[device.Pos] = device.Id;
        }

        /// <summary>Thread-safe; commands execute in arrival order at the start of the next tick.</summary>
        public void EnqueueCommand(ISimCommand cmd) => _inbox.Enqueue(cmd);

        /// <summary>Advance exactly one tick.</summary>
        public void Tick()
        {
            // 1. Apply queued commands (player / UI / MOSS / LLM effects).
            while (_inbox.TryDequeue(out var cmd)) _drain.Add(cmd);
            for (int i = 0; i < _drain.Count; i++) _drain[i].Execute(this);
            _drain.Clear();

            // 1b. Derived room state is refreshed as an owned tick phase, before any
            // system reads it — no consumer depends on which system recomputes first.
            Rooms.RecomputeIfDirty(this);

            // 2. Systems, in fixed registration order, at their cadences.
            for (int i = 0; i < _systems.Length; i++)
            {
                var system = _systems[i];
                if (_tick % system.IntervalTicks == 0) system.Tick(this);
            }

            // 3. Publish this tick's events for next tick's readers.
            Events.SwapBuffers();
            _tick++;
        }

        /// <summary>
        /// Canonical-state hash (determinism canary). Two sims with the same seed and
        /// command log must return identical hashes at identical tick counts.
        ///
        /// FOLD LAYOUT — the rule is: <b>no field may share a bit with another field.</b>
        /// A multi-field word is only allowed where every contributor has a statically
        /// bounded width that provably fits its slot; anything whose width could grow
        /// (an enum that might be widened, an int/uint that uses its full range) gets its
        /// own <see cref="XxHash64.Combine"/> call. Clarity beats byte count: the fold is
        /// NOT a per-tick path — it runs on demand (scenario report, --dump, ShipGates V7,
        /// tests), so an extra Combine per entity costs nothing a player can measure.
        ///
        /// Per citizen, in this order: Id · Pack(Pos) · Suffocation · Hunger · Thirst ·
        /// Fatigue · Mood · JobKind (own word) · flag word (Dead b0, RevealsFog b1,
        /// HoldPosition b2, AutoWander b3, OrderedMove b4, HeldByOrder b5 — 1-bit fields, cannot
        /// alias) · JobWorkTicks
        /// (own word, full 32 bits) · CarryingItemId (own word, full 32 bits) ·
        /// Pack(JobTarget) · ReservedItemId · Faction|Archetype&lt;&lt;8 (both `byte`, exact
        /// fit) · Health · Morale · the six work priorities (M2-1, ONE OWN WORD EACH, in
        /// <c>WorkType</c> declaration order, NO count prefix — see the note at the fold) ·
        /// WorkIncapable · Skill · Name (length then code units) · Pack(PrevPos) ·
        /// Path.Count · Pack(Path[0…n−1]) · PathIndex · MoveCooldown · IdleCooldown.
        ///
        /// Per item, in this order: Id (own word, full 32 bits) · Kind (own word) ·
        /// ReservedBy (own word, full 32 bits — the owner id, 0 = free) · Count (own word,
        /// full 32 bits) · Pack(Pos) · CarriedBy · Label.
        ///
        /// Per device: Id · Pack(Pos) · the audited state word (Kind b0-7, IsOpen b8, IsLocked
        /// b9, Powered b10, Scriptable b11, NetworkId b16-31, Rate b32-63) · LockOwner · StoredKWh ·
        /// StoredLiters · Progress · FluidNetworkId · Condition · Name.
        ///
        /// Per room anchor: Pack(Probe) · Type (its OWN word since the wreck start — packing it
        /// into the probe word aliased <c>RoomType.Cryo = 16</c> onto <c>None</c>) · Name.
        /// Then, after WastewaterLiters,
        /// the DSLS script list: Scripts.Count · (TerminalId · Source) per entry.
        ///
        /// <b>Every variable-length member folds its COUNT (or length) before its
        /// entries</b> — <c>Path</c>, the script list, and each string. A length-free fold
        /// over a variable-length run lets adjacent runs shuffle entries across their
        /// boundary and still produce the same call sequence — the same aliasing class W0-1
        /// removed one package earlier. Two exact collision pairs are constructed rather
        /// than argued: <c>Aliased_PathTilesCannotShuffleAcrossTwoCitizens_…</c> (a path
        /// tile moves between two crew members) and
        /// <c>Aliased_NameCharactersCannotShuffleAcrossTwoDevices_…</c> (a code unit moves
        /// between two device names). Path entries fold in list order, index 0 first, which
        /// is walk order; <c>PathIndex</c> follows so path *progress* is canonical too.
        ///
        /// LIMIT on that doctrine, measured and not papered over: the tests pin that the
        /// length IS folded and that the fold is prefix-free. They do NOT pin its POSITION.
        /// Measured: moving the string length to after its code units reddens 0 tests and
        /// only the 2 tick-3000 goldens; moving Path.Count to after its entries reddens 0
        /// tests and only the SLICE golden (the 2-crew reference ship never carries a path).
        /// Either order is still prefix-free for these shapes, so "first" is a convention —
        /// chosen so a reader meets the boundary before the payload — and a golden move is
        /// not evidence to the contrary; it only says the fold VALUE changed.
        ///
        /// History (2026-07-22, W0-1): the previous packing aliased ItemKind bit 7 onto
        /// ReservedForJob (bit 39) and clipped Count to 24 bits, and overlapped
        /// JobWorkTicks (bits 16–47) with CarryingItemId (bits 32–63) — so a ≥128th
        /// ItemKind, a Count ≥ 2^24, or a job longer than 65,535 ticks (109 sim-min, an
        /// ordinary smelt) made two genuinely distinct states hash EQUAL. Not a
        /// determinism break, but canary blindness in the exact fields the economy
        /// stresses. <c>StateHashHonestyTests</c> pins every field in both folds.
        ///
        /// History (2026-07-22, W0-1b): THIRTEEN fields were SAVED but not hashed — the
        /// citizen's Name/PrevPos/AutoWander/Path/PathIndex/MoveCooldown/IdleCooldown
        /// (<c>Save/SaveWriter.cs:241-249</c>), <c>ItemStack.Label</c> (<c>:319</c>),
        /// <c>Device.Name</c> (<c>:287</c>), the header's <c>NextEntityId</c> (<c>:147</c>),
        /// <c>RoomAnchor.Name</c> (<c>:218</c>) and <c>ScriptEntry.TerminalId</c>/<c>.Source</c>
        /// (<c>:333-334</c>). Three of the citizen fields are live tick state consumed by
        /// <c>CitizenSystem</c>, so two sims at different path progress, or differing only
        /// in whether a crew member wanders, hashed EQUAL — the canary was blind to
        /// exactly the regression a job-dispatcher refactor produces (a different
        /// assignment yielding a different path of equal length). All thirteen fold now.
        /// (The first nine were found by the package; the last four by its review — the
        /// package's own first pass at "the list is now complete" was itself wrong, which
        /// is why the scope note above is written as a chapter list rather than a slogan.)
        ///
        /// COST of W0-1b, measured on the slice at tick 300 (8 crew, 12 stacks, 931 devices,
        /// 2 MOSS scripts, 22 anchors), five rounds of 200 calls each side:
        /// +15,000-odd <c>Combine</c> calls per <c>StateHash</c> — the string fold is one
        /// call per code unit and 931 device names dominate (931 + 13,726 = 14,657 of them) —
        /// taking the call from 0.79 ms to 2.01 ms, <b>2.54×</b> (independently reproduced here
        /// at 2.05–2.13 ms/call over five rounds). Immaterial in practice:
        /// <c>Simulation.Tick</c> never calls this, and <c>ValidationGateTests</c>, the
        /// heaviest StateHash consumer in the suite, measures 33 s on both commits. Call
        /// sites are hosts/scenario <c>Report</c> (once per sim-day) + its final twin check,
        /// hosts/tui <c>DumpMode</c>, <c>Sim.Gen ShipGates.V7Determinism</c> (4 per candidate)
        /// and tests. If it ever needs to be cheaper, pack four UTF-16 code units per word in
        /// the string overload — 4× fewer calls, same prefix-free property.
        ///
        /// ALLOCATION: this fold itself allocates nothing — every <c>Combine</c> is a
        /// <c>stackalloc</c>, string indexing copies nothing, and the path loop indexes by
        /// position rather than enumerating. W0-1b adds ZERO bytes (measured identical on the
        /// commit before it). But <c>StateHash()</c> as a whole is NOT allocation-free, and
        /// never was — an earlier draft of this comment said "still zero bytes" and was simply
        /// wrong. Measured on the slice: <b>512 B per call</b>, all of it
        /// <c>MemorySystem.StateChecksum()</c> (102,400 B over 200 calls; bisected to the
        /// "Memory" system by name; identical pre- and post-W0-1b). It is CONTENT-dependent —
        /// the same slice with empty minds allocates 0, so it appears only once
        /// <c>PopulateSlice</c> has fed the mind store. Pre-existing, out of scope here, and now
        /// pinned by <c>StateHashHonestyTests.Fold_AllocatesNothing_OnASimWithoutTheMemorySystem</c>
        /// so the next person gets a red test instead of a comment to trust.
        /// </summary>
        public ulong StateHash()
        {
            ulong h = XxHash64.Combine(0, (ulong)_tick);
            var (s0, s1, s2, s3) = Rng.State;
            h = XxHash64.Combine(h, s0);
            h = XxHash64.Combine(h, s1);
            h = XxHash64.Combine(h, s2);
            h = XxHash64.Combine(h, s3);
            // W0-1b — the save header's next-entity-id (Save/SaveWriter.cs:147). Live state,
            // not derived: two sims equal on every entity still diverge at the next spawn.
            h = XxHash64.Combine(h, _nextEntityId);
            h = World.HashInto(h);

            // SCOPE OF THE FOLD, audited field-by-field against Save/SaveWriter.cs at W0-1b
            // and true as stated — read it as a scoped claim, not a global one:
            //   * Every field of the HEADER, TILE, ROOM, CITZ, DEVC, ITEM and DSLS chapters
            //     is folded here. That is the part the canary would otherwise be blind to
            //     while the save format calls it canonical.
            //   * SYSS is NOT covered field-by-field. Each IStatefulSystem owns its own
            //     StateChecksum, and several deliberately exempt their strings (GoalSystem
            //     and HistorySystem fold kind/tick but not text; the whole mind/persona/fact
            //     layer is host state, gate-proven out of determinism at P2). Those folds
            //     are their systems' contract, not this method's — see the note on
            //     GoalSystem.StateChecksum for why entity fields and SYSS text differ.
            //   * DEFS rides its own chapter and is deliberately unhashed (Simulation.cs:26).
            // The converse is also NOT claimed: this fold covers derived state saved only so
            // a load hashes equal immediately (Device.NetworkId/Powered, Citizen.PrevPos).
            var citizens = Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
            {
                var c = citizens[i];
                h = XxHash64.Combine(h, c.Id);
                h = XxHash64.Combine(h, Pack(c.Pos));
                h = XxHash64.Combine(h, c.Suffocation);
                h = XxHash64.Combine(h, c.Hunger);
                h = XxHash64.Combine(h, c.Thirst);
                h = XxHash64.Combine(h, c.Fatigue);
                h = XxHash64.Combine(h, c.Mood);
                h = XxHash64.Combine(h, (ulong)c.JobKind);
                h = XxHash64.Combine(h, (c.Dead ? 1UL << 0 : 0)
                                       | (c.RevealsFog ? 1UL << 1 : 0)
                                       | (c.HoldPosition ? 1UL << 2 : 0)   // v6
                                       | (c.AutoWander ? 1UL << 3 : 0)     // W0-1b
                                       | (c.OrderedMove ? 1UL << 4 : 0)    // E0-3
                                       | (c.HeldByOrder ? 1UL << 5 : 0));  // M2-1 (reserved, M2-19's)
                h = XxHash64.Combine(h, (ulong)(uint)c.JobWorkTicks);
                h = XxHash64.Combine(h, (ulong)c.CarryingItemId);
                h = XxHash64.Combine(h, Pack(c.JobTarget));
                h = XxHash64.Combine(h, c.ReservedItemId);
                h = XxHash64.Combine(h, (ulong)c.Faction | ((ulong)c.Archetype << 8)); // v5
                h = XxHash64.Combine(h, c.Health);
                h = XxHash64.Combine(h, c.Morale);
                // M2-1 — the work-priority grid (CITZ v8), plus the reserved skill byte. Nothing
                // reads either yet; they are hashed from the day they land so a later consumer
                // costs no pin move.
                //
                // ONE COMBINE PER SLOT, in WorkType VALUE order (which is the storage index — the
                // arbitration order is WorkPriority.NaturalPriority and is not this). Six slots each hold 0..4, so
                // three bits apiece would fit in a single 18-bit word — and that is precisely the
                // packing this fold refuses. `RoomType.Cryo = 16` hashed identically to `None`
                // because a shift ran off the top of a word, and a comment in
                // StateHashHonestyTests had predicted it in writing four days earlier. Here a
                // mis-shifted slot cannot exist: separate chained Combine calls are
                // position-sensitive, so no two work types can share bits at any future member
                // count. Cost is six extra Combines per citizen on a fold that never runs in a tick.
                //
                // ⚠️ NO COUNT PREFIX, and that is deliberate against this fold's own doctrine
                // ("every variable-length member folds its COUNT before its entries"). The grid is
                // NOT variable-length: WorkPriority.WorkTypeCount is a compile-time constant, the
                // run is bounded on both sides by fields of fixed width, and no shuffle across the
                // boundary is constructible. Folding the constant would be worse than useless — it
                // adds a fixed value to every citizen's trailing run, which is exactly the
                // alignment Aliased_PathTilesCannotShuffleAcrossTwoCitizens is built on, and
                // MEASURED BOTH WAYS, twice, by two agents: control — delete `Combine(h,
                // path.Count)` on the shipped fold and that guard is RED (1 of 73). Add a constant
                // grid count here AND delete the same line: 73/73 GREEN. The count would not have
                // weakened a guard, it would have silently KILLED one.
                //
                // ⚠️ STANDING HAZARD FOR WHOEVER ADDS THE NEXT HASHED CITIZEN FIELD — this is the
                // mechanism, and it is more fragile than the finding above makes it sound. That
                // collision pair exists only while EVERY value of crew 1's fixed-width prefix folds
                // to the same number as crew 0's three trailing scalars — i.e. to ZERO. M2-1 already
                // pushed that requirement from three fields to eleven, and it is held by nothing but
                // explicit zeroing in ONE fixture (StateHashHonestyTests.TwoCrewPathFixture). ⇒ THE
                // NEXT HASHED PREFIX FIELD WITH A NON-ZERO DEFAULT KILLS THAT GUARD SILENTLY — it
                // will not go red, it will go green for the wrong reason. If you add one: zero it in
                // that fixture, then verify by deleting the path.Count fold and watching the pair go
                // RED. Do not trust it because the suite is green.
                //
                // The fixed-length premise is itself pinned (WorkPriorityStateTests), and the SAVE
                // stream does carry a count — different medium, different rule; see WriteCitizens.
                //
                // POSITION: folded here, in the citizen's fixed-width prefix, rather than appended
                // after IdleCooldown, so it stays out of the trailing run that the path-boundary
                // pair aligns. Appending would have required editing that fixture, and a collision
                // pair is not a thing to edit casually.
                var work = c.WorkPrioritiesRaw;
                for (int t = 0; t < work.Length; t++) h = XxHash64.Combine(h, (ulong)work[t]);
                h = XxHash64.Combine(h, (ulong)c.WorkIncapable);
                h = XxHash64.Combine(h, (ulong)c.Skill);
                // W0-1b — saved since CITZ v1, folded only now. Name is the identity every
                // other layer keys on; PrevPos is derived-but-hashed (same contract as
                // Device.NetworkId/Powered: a load hashes equal immediately, and dropping it
                // visibly breaks the client's pawn slide across a load); the path triple is
                // live tick state CitizenSystem reads and writes every pass.
                h = XxHash64.Combine(h, c.Name);
                h = XxHash64.Combine(h, Pack(c.PrevPos));
                var path = c.Path;
                h = XxHash64.Combine(h, (ulong)path.Count); // length FIRST — see the fold-layout note
                for (int p = 0; p < path.Count; p++) h = XxHash64.Combine(h, Pack(path[p]));
                h = XxHash64.Combine(h, (ulong)(uint)c.PathIndex);
                h = XxHash64.Combine(h, (ulong)(uint)c.MoveCooldown);
                h = XxHash64.Combine(h, (ulong)(uint)c.IdleCooldown);
            }

            var items = Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                h = XxHash64.Combine(h, (ulong)it.Id);
                h = XxHash64.Combine(h, (ulong)it.Kind);
                h = XxHash64.Combine(h, (ulong)it.ReservedBy);
                h = XxHash64.Combine(h, (ulong)(uint)it.Count);
                h = XxHash64.Combine(h, Pack(it.Pos));
                h = XxHash64.Combine(h, it.CarriedBy);
                h = XxHash64.Combine(h, it.Label); // W0-1b — corpse identity (NeedsSystem.cs:200)
            }

            var devices = Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                h = XxHash64.Combine(h, d.Id);
                h = XxHash64.Combine(h, Pack(d.Pos));
                ulong state = (ulong)d.Kind
                              | (d.IsOpen ? 1UL << 8 : 0)
                              | (d.IsLocked ? 1UL << 9 : 0)
                              | (d.Powered ? 1UL << 10 : 0)
                              | (d.Scriptable ? 1UL << 11 : 0)   // E0-6 (DEVC v5)
                              | ((ulong)d.NetworkId << 16)
                              | ((ulong)(uint)BitConverter.SingleToInt32Bits(d.Rate) << 32);
                h = XxHash64.Combine(h, state);
                h = XxHash64.Combine(h, d.LockOwner); // v4
                h = XxHash64.Combine(h, d.StoredKWh);
                h = XxHash64.Combine(h, d.StoredLiters);
                h = XxHash64.Combine(h, d.Progress);
                h = XxHash64.Combine(h, d.FluidNetworkId);
                h = XxHash64.Combine(h, d.Condition);
                // W0-1b — MossBindings.cs:20-32 registers every MOSS adapter BY NAME, so a
                // restore that changed one silently unbinds every player program, no error.
                h = XxHash64.Combine(h, d.Name);
            }

            var rooms = Rooms.Rooms;
            for (int i = 0; i < rooms.Count; i++)
            {
                var r = rooms[i];
                h = XxHash64.Combine(h, (ulong)r.TileCount);
                h = XxHash64.Combine(h, r.O2Moles);
                h = XxHash64.Combine(h, r.CO2Moles);
                h = XxHash64.Combine(h, r.N2Moles);
                h = XxHash64.Combine(h, r.TemperatureK);
            }

            var anchors = Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
            {
                // ⚠️ `Type` USED TO RIDE THE PROBE WORD AS `| (Type << 60)` AND THAT WAS A LIVE
                // ALIAS, not a latent one. `RoomType` has 4 usable bits up there, its 16 members
                // filled them exactly, and the wreck start's `Cryo = 16` shifted clean off the top
                // of the word: `(ulong)16 << 60 == 0`, so a CRYO BAY hashed IDENTICALLY to an
                // untyped room. Measured on `--ship wreck` before the fix — Cryo and None both
                // `fdcb64eb5b094f75`, Medbay `b5e6a0f45102c979`. `StateHashHonestyTests` predicted
                // exactly this in prose ("a 17th would fold onto None") and the 17th arrived.
                //
                // Type now folds as its OWN word. `RoomType : byte` cannot alias in 64 bits at any
                // future member count, and the fix simultaneously retires the OTHER half of that
                // bullet: `Probe.Z` reaches bit 63 through `Pack(Int3)`, so `Type`'s bits sat on
                // Z's bits 20–23 and `anchor(z = 2^20, None)` equalled `anchor(z = 0, Corridor)`.
                // Nothing shares a word with anything here any more.
                h = XxHash64.Combine(h, Pack(anchors[i].Probe));
                h = XxHash64.Combine(h, (ulong)anchors[i].Type);
                // W0-1b — the anchor name is the MOSS ROOM NAMESPACE (Save/SaveWriter.cs:218).
                // Exactly the Device.Name argument on a different field: a restore that renamed
                // an anchor unbinds every `room.<name>` reference with no error.
                h = XxHash64.Combine(h, anchors[i].Name);
            }

            h = XxHash64.Combine(h, WastewaterLiters);

            // W0-1b — MOSS program sources are canonical sim state (Simulation.cs:171, TDD
            // §4.5), saved verbatim in DSLS (Save/SaveWriter.cs:333-334) and folded by nothing
            // until now. Insertion-ordered; both strings fold, length first.
            h = XxHash64.Combine(h, (ulong)Scripts.Count);
            for (int i = 0; i < Scripts.Count; i++)
            {
                h = XxHash64.Combine(h, Scripts[i].TerminalId);
                h = XxHash64.Combine(h, Scripts[i].Source);
            }

            // System-internal canonical state (MOSS latches/timers etc.).
            for (int i = 0; i < _systems.Length; i++)
                if (_systems[i] is IStatefulSystem stateful)
                    h = XxHash64.Combine(h, stateful.StateChecksum());

            return h;
        }

        private static ulong Pack(Int3 p) =>
            (ulong)(uint)p.X | ((ulong)(uint)p.Y << 20) | ((ulong)(uint)p.Z << 40);
    }
}
