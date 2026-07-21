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

        /// <summary>Set when designations/items/stockpiles change; JobSystem rescans when set.</summary>
        public bool JobsDirty = true;

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
        private readonly ConcurrentQueue<ISimCommand> _inbox = new ConcurrentQueue<ISimCommand>();
        private readonly List<ISimCommand> _drain = new List<ISimCommand>(64);
        private readonly Dictionary<Int3, uint> _deviceGrid = new Dictionary<Int3, uint>();

        public Simulation(World world, ulong seed, ISimSystem[] systems, SimDefs defs = null)
        {
            World = world ?? throw new ArgumentNullException(nameof(world));
            Rng = new SimRng(seed);
            _systems = systems ?? Array.Empty<ISimSystem>();
            Defs = defs ?? SimDefs.Default;
        }

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
                    carried.ReservedForJob = false;
                }
                citizen.CarryingItemId = 0;
            }
            else if (citizen.ReservedItemId != 0)
            {
                // Release exactly the stack this citizen reserved — never a co-located
                // stranger's reservation (two reserved stacks can share a tile).
                if (Items.TryGet(citizen.ReservedItemId, out var reserved) && reserved.CarriedBy == 0)
                    reserved.ReservedForJob = false;
            }

            citizen.ReservedItemId = 0;
            citizen.JobKind = JobKind.None;
            citizen.JobWorkTicks = 0;
            JobsDirty = true;
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
            JobsDirty = true;
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
        /// </summary>
        public ulong StateHash()
        {
            ulong h = XxHash64.Combine(0, (ulong)_tick);
            var (s0, s1, s2, s3) = Rng.State;
            h = XxHash64.Combine(h, s0);
            h = XxHash64.Combine(h, s1);
            h = XxHash64.Combine(h, s2);
            h = XxHash64.Combine(h, s3);
            h = World.HashInto(h);

            // Every field that is saved is also hashed — otherwise the determinism
            // canary is blind exactly where the save format claims canonical state.
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
                h = XxHash64.Combine(h, (ulong)c.JobKind
                                       | (c.Dead ? 1UL << 8 : 0)
                                       | (c.RevealsFog ? 1UL << 9 : 0)
                                       | (c.HoldPosition ? 1UL << 10 : 0) // v6
                                       | ((ulong)(uint)c.JobWorkTicks << 16)
                                       | ((ulong)c.CarryingItemId << 32));
                h = XxHash64.Combine(h, Pack(c.JobTarget));
                h = XxHash64.Combine(h, c.ReservedItemId);
                h = XxHash64.Combine(h, (ulong)c.Faction | ((ulong)c.Archetype << 8)); // v5
                h = XxHash64.Combine(h, c.Health);
                h = XxHash64.Combine(h, c.Morale);
            }

            var items = Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                h = XxHash64.Combine(h, it.Id
                                       | ((ulong)it.Kind << 32)
                                       | (it.ReservedForJob ? 1UL << 39 : 0)
                                       | ((ulong)(uint)it.Count << 40));
                h = XxHash64.Combine(h, Pack(it.Pos));
                h = XxHash64.Combine(h, it.CarriedBy);
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
                              | ((ulong)d.NetworkId << 16)
                              | ((ulong)(uint)BitConverter.SingleToInt32Bits(d.Rate) << 32);
                h = XxHash64.Combine(h, state);
                h = XxHash64.Combine(h, d.LockOwner); // v4
                h = XxHash64.Combine(h, d.StoredKWh);
                h = XxHash64.Combine(h, d.StoredLiters);
                h = XxHash64.Combine(h, d.Progress);
                h = XxHash64.Combine(h, d.FluidNetworkId);
                h = XxHash64.Combine(h, d.Condition);
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
                h = XxHash64.Combine(h, Pack(anchors[i].Probe) | ((ulong)anchors[i].Type << 60));

            h = XxHash64.Combine(h, WastewaterLiters);

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
