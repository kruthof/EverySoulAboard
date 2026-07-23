using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>What a build designation constructs on completion. Carried on the wire as
    /// a byte (<see cref="ConstructionCompletedEvent.BuildKind"/>) — append-only.</summary>
    public enum BuildKind : byte
    {
        Wall = 0,  // SetWall tile write, then room reflood (seal + pressurize via atmosphere)
        Door = 1,  // spawn a runtime Door device on the tile
        Floor = 2, // re-material an existing floor tile (no wall created); inert identity write
    }

    /// <summary>
    /// One pending build site. Progress ticks live on the assigned citizen
    /// (<see cref="Citizen.JobWorkTicks"/>, saved+hashed in the CITZ chapter); the site
    /// itself owns the material staging counters. All fields are structural ints (no
    /// strings) so the BULD save chapter and checksum stay position/kind/count based.
    /// </summary>
    public struct PendingBuild
    {
        public Int3 Pos;
        public BuildKind Kind;
        public int Required;   // material units (Regolith) the site needs before it can build
        public int Delivered;  // material units already staged at the site
        public int WorkTicks;  // construct ticks the Build job counts down from (def-frozen at designate)
        public byte Material;  // material-variant byte recorded via World.SetMaterial on completion (0 = default)
    }

    /// <summary>
    /// M1 build/refit v0 (WS-MATTER): the pending-build registry. Designations create
    /// haul demand (Regolith → the site) which the <see cref="JobSystem"/> services via
    /// <see cref="JobKind.HaulToBuild"/>, then constructs via <see cref="JobKind.Build"/>.
    /// On completion a Wall becomes a sealing tile (room reflood pressurizes the new
    /// compartment through the existing atmosphere flow) and a Door spawns as a runtime
    /// device.
    ///
    /// This system holds only canonical state (the pending list) — it has no per-tick
    /// work of its own (its <see cref="Tick"/> is a no-op, so a build-free ship is
    /// zero-alloc here). Designation/cancel arrive through the public deterministic API
    /// (a host command drives <see cref="Designate"/>/<see cref="Cancel"/>); material
    /// deposit and completion are driven by JobSystem through <see cref="Deposit"/> and
    /// <see cref="Complete"/>. State is SYSS-saved via <see cref="IStatefulSystem"/> and
    /// folded into StateHash via <see cref="StateChecksum"/>.
    ///
    /// Determinism: the pending list is kept in canonical packed-position order (sorted
    /// insert), so every scan — the job board, the save, the checksum — is order-stable.
    /// The material for a build is always <see cref="ItemKind.Regolith"/> (the debris
    /// spoil) in v0; costs and construct times are def-tunable per kind.
    /// </summary>
    public sealed class BuildSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Build";
        public int IntervalTicks => 1; // registered in the stack; Tick is a no-op (state is command/JobSystem driven)
        public ushort StateVersion => 2; // v2 adds PendingBuild.Material (pre-v2 restores → Material 0)

        /// <summary>The material every build consumes in v0 (dig spoil → wall/door).</summary>
        public const ItemKind Material = ItemKind.Regolith;

        // Canonical packed-position-sorted pending list. Never iterated for lookups
        // (a small linear scan by position is fine at v0 densities and stays alloc-free).
        private readonly List<PendingBuild> _pending = new List<PendingBuild>(32);

        /// <summary>Pending sites in canonical order (job board + inspectors read this).</summary>
        public IReadOnlyList<PendingBuild> Pending => _pending;

        public void Tick(Simulation sim) { /* passive: no per-tick work */ }

        // ------------------------------------------------------------------ queries

        public bool TryGet(Int3 pos, out PendingBuild build)
        {
            for (int i = 0; i < _pending.Count; i++)
            {
                if (_pending[i].Pos == pos) { build = _pending[i]; return true; }
            }
            build = default;
            return false;
        }

        public static bool NeedsMaterial(in PendingBuild b) => b.Delivered < b.Required;
        public static bool IsReady(in PendingBuild b) => b.Delivered >= b.Required;

        /// <summary>Material units still wanted before a site is buildable.</summary>
        public int RemainingMaterial(Int3 pos) =>
            TryGet(pos, out var b) ? (b.Required - b.Delivered > 0 ? b.Required - b.Delivered : 0) : 0;

        // ---------------------------------------------------------------- public API

        /// <summary>
        /// Whether <paramref name="pos"/> is a legal target for a fresh <paramref name="kind"/>
        /// designation right now (with <paramref name="material"/> the requested material byte).
        /// Wall/Door: in bounds, an open non-void floor tile with no wall, no device, no citizen
        /// standing on it, and not already designated. Floor: in bounds, a non-void floor tile
        /// with no wall, not already designated, under the staging cap, and the material must
        /// actually change (re-flooring the SAME material is a deterministic no-op) — a floor
        /// re-material may sit under furniture or a standing citizen, so it does NOT require an
        /// empty device/tile. Deterministic — same world, same answer.
        /// </summary>
        public bool CanDesignate(Simulation sim, Int3 pos, BuildKind kind, byte material = 0)
        {
            if (!sim.World.InBounds(pos)) return false;
            if (TryGet(pos, out _)) return false;                       // already designated
            if (_pending.Count >= sim.Defs.Build.MaxStaged) return false; // concurrency cap
            if (sim.World.GetFloor(pos) == TileDefs.Void) return false; // nothing to build on
            if (sim.World.GetWall(pos) != 0) return false;              // already walled / debris

            if (kind == BuildKind.Floor)
            {
                // A floor re-material is an inert identity write: it needs only a real floor with
                // no wall (both checked above) and an actual change. It may go under furniture or
                // a citizen — no device/occupancy gate.
                if (sim.World.GetMaterial(pos) == material) return false; // no-op re-floor
                return true;
            }

            if ((sim.World.GetFlags(pos) & TileFlags.HasDevice) != 0) return false; // device present
            if (sim.TryGetDeviceAt(pos, out _)) return false;
            // A citizen standing on the tile blocks a wall (they'd be sealed in) and a door.
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
                if (!citizens[i].Dead && citizens[i].Pos == pos) return false;
            return true;
        }

        /// <summary>
        /// Register a build at <paramref name="pos"/>. Returns false (no state change) when
        /// <see cref="CanDesignate"/> rejects it — so an occupied / invalid / already-walled
        /// / duplicate tile is a deterministic no-op. Sets <see cref="Simulation.JobsDirty"/>
        /// so the job board picks up the new haul/build demand.
        /// </summary>
        public bool Designate(Simulation sim, Int3 pos, BuildKind kind, byte material = 0)
        {
            if (!CanDesignate(sim, pos, kind, material)) return false;
            var b = new PendingBuild
            {
                Pos = pos,
                Kind = kind,
                Required = MaterialCost(sim.Defs.Build, kind),
                Delivered = 0,
                WorkTicks = ConstructTicks(sim.Defs.Build, kind),
                Material = material,
            };
            InsertSorted(b);
            sim.JobsDirty |= JobBoardDirty.Sites; // a new pending site — build board must re-derive
            return true;
        }

        /// <summary>
        /// Cancel the designation at <paramref name="pos"/>, refunding any staged material
        /// as a single loose Regolith stack on the tile (exact conservation — only what was
        /// actually delivered; a hauler still carrying toward the site keeps its stack and
        /// drops it when it finds the site gone). Returns false if nothing was pending.
        /// </summary>
        public bool Cancel(Simulation sim, Int3 pos)
        {
            for (int i = 0; i < _pending.Count; i++)
            {
                if (_pending[i].Pos != pos) continue;
                int delivered = _pending[i].Delivered;
                _pending.RemoveAt(i);
                if (delivered > 0) sim.AddItem(Material, delivered, pos); // AddItem sets Items
                sim.JobsDirty |= JobBoardDirty.Sites; // the pending site is gone — build board re-derives
                return true;
            }
            return false;
        }

        /// <summary>
        /// Stage up to <paramref name="units"/> material at a site, returning how many were
        /// actually accepted (min of the offer and the remaining need). Driven by JobSystem
        /// on a <see cref="JobKind.HaulToBuild"/> delivery; the caller reconciles its carried
        /// stack against the returned count. Sets JobsDirty (the site may now be buildable).
        /// </summary>
        public int Deposit(Simulation sim, Int3 pos, int units)
        {
            if (units <= 0) return 0;
            for (int i = 0; i < _pending.Count; i++)
            {
                if (_pending[i].Pos != pos) continue;
                var b = _pending[i];
                int need = b.Required - b.Delivered;
                if (need <= 0) return 0;
                int consumed = units < need ? units : need;
                b.Delivered += consumed;
                _pending[i] = b;
                sim.JobsDirty |= JobBoardDirty.Sites; // Delivered changed — the site may now be ready
                return consumed;
            }
            return 0;
        }

        /// <summary>
        /// Finish the build at <paramref name="pos"/> (called by JobSystem when the Build
        /// job's work ticks reach zero): apply the world change, publish
        /// <see cref="ConstructionCompletedEvent"/> exactly once, and remove the entry.
        /// Wall = seal tile + room reflood (atmosphere pressurizes the new compartment);
        /// Door = spawn a runtime Door device. No-op if the site is already gone.
        /// </summary>
        public bool Complete(Simulation sim, Int3 pos, uint builderId)
        {
            for (int i = 0; i < _pending.Count; i++)
            {
                if (_pending[i].Pos != pos) continue;
                var kind = _pending[i].Kind;
                var material = _pending[i].Material;
                _pending.RemoveAt(i);

                if (kind == BuildKind.Wall)
                {
                    sim.World.SetWall(pos, TileDefs.Wall);   // RecomputeFlags → BlocksGas, not walkable
                    sim.World.SetMaterial(pos, material);    // record the wall's material variant
                    sim.Rooms.MarkDirty();                   // reflood next tick: seal + RoomsChangedEvent
                    sim.PowerDirty = true;                   // conduit reachability may change
                }
                else if (kind == BuildKind.Floor)
                {
                    // Re-material an existing floor tile: inert identity write only. No SetWall,
                    // no reflood, no PowerDirty — material never affects Walkable/BlocksGas or
                    // atmosphere/power reachability. The tile stays the floor it already was.
                    sim.World.SetMaterial(pos, material);
                }
                else // Door
                {
                    // Runtime device spawn (public path — no Simulation internals touched).
                    // AddDevice marks rooms + power dirty; the door starts closed.
                    sim.AddDevice(DeviceKind.Door, pos,
                        "door_" + pos.X.ToString(System.Globalization.CultureInfo.InvariantCulture)
                        + "_" + pos.Y.ToString(System.Globalization.CultureInfo.InvariantCulture)
                        + "_" + pos.Z.ToString(System.Globalization.CultureInfo.InvariantCulture));
                }

                sim.Events.Publish(new TileChangedEvent { Pos = pos });
                sim.Events.Publish(new ConstructionCompletedEvent
                {
                    Pos = pos,
                    BuildKind = (byte)kind,
                    BuilderId = builderId,
                });
                // The pending site is gone (Sites) and a wall/door now occupies the tile (Tiles —
                // the SetWall/AddDevice above; the TileChangedEvent also re-confirms it).
                sim.JobsDirty |= JobBoardDirty.Sites | JobBoardDirty.Tiles;
                return true;
            }
            return false;
        }

        // ------------------------------------------------------------------ defs read

        // Floor costs/ticks are v1 literals (this package deliberately touches no defs so the defs
        // checksum stays stable). TODO(economy): promote to BuildDefs.FloorMaterial /
        // BuildDefs.FloorConstructTicks tunables in a later economy pass.
        private const int FloorMaterialCost = 1;
        private const int FloorConstructTicks = 20;

        private static int MaterialCost(SimDefs.BuildDefs d, BuildKind kind) =>
            kind == BuildKind.Wall ? d.WallMaterial :
            kind == BuildKind.Floor ? FloorMaterialCost : d.DoorMaterial;

        private static int ConstructTicks(SimDefs.BuildDefs d, BuildKind kind) =>
            kind == BuildKind.Wall ? d.WallConstructTicks :
            kind == BuildKind.Floor ? FloorConstructTicks : d.DoorConstructTicks;

        // ----------------------------------------------------------- sorted insert

        private static ulong Pack(Int3 p) =>
            (ulong)(uint)p.X | ((ulong)(uint)p.Y << 20) | ((ulong)(uint)p.Z << 40);

        private void InsertSorted(PendingBuild b)
        {
            ulong key = Pack(b.Pos);
            int lo = 0, hi = _pending.Count;
            while (lo < hi)
            {
                int mid = (lo + hi) >> 1;
                if (Pack(_pending[mid].Pos) < key) lo = mid + 1; else hi = mid;
            }
            _pending.Insert(lo, b);
        }

        // --------------------------------------------------------------- save/hash

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(_pending.Count);
            for (int i = 0; i < _pending.Count; i++)
            {
                var b = _pending[i];
                writer.Write(b.Pos.X);
                writer.Write(b.Pos.Y);
                writer.Write(b.Pos.Z);
                writer.Write((byte)b.Kind);
                writer.Write(b.Required);
                writer.Write(b.Delivered);
                writer.Write(b.WorkTicks);
                writer.Write(b.Material); // v2: material-variant byte
            }
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            if (version < 1 || version > StateVersion) return;
            _pending.Clear();
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                var b = new PendingBuild
                {
                    Pos = new Int3(reader.ReadInt32(), reader.ReadInt32(), reader.ReadInt32()),
                    Kind = (BuildKind)reader.ReadByte(),
                    Required = reader.ReadInt32(),
                    Delivered = reader.ReadInt32(),
                    WorkTicks = reader.ReadInt32(),
                    // v2 appends Material; a v1 save has none → leave it 0 (default material).
                    Material = version >= 2 ? reader.ReadByte() : (byte)0,
                };
                _pending.Add(b); // saved in canonical order → stays sorted
            }
        }

        public ulong StateChecksum()
        {
            ulong h = 0x42554C44UL; // 'BULD'
            for (int i = 0; i < _pending.Count; i++)
            {
                var b = _pending[i];
                h = XxHash64.Combine(h, Pack(b.Pos));
                h = XxHash64.Combine(h, (ulong)(byte)b.Kind);
                h = XxHash64.Combine(h, (ulong)(uint)b.Required);
                h = XxHash64.Combine(h, (ulong)(uint)b.Delivered);
                h = XxHash64.Combine(h, (ulong)(uint)b.WorkTicks);
                h = XxHash64.Combine(h, (ulong)b.Material); // v2: appended last, fixed position
            }
            return h;
        }
    }
}
