using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>What a deconstruct designation tears down. Byte enum, append-only (it is saved
    /// in the STRP chapter and folded into the checksum).</summary>
    public enum DeconstructKind : byte
    {
        /// <summary>A <see cref="TileDefs.Wall"/> tile → open floor, yielding Regolith.</summary>
        Wall = 0,
        /// <summary>A <see cref="Device"/> entity → removed, yielding Parts × Condition.
        /// DECLARED, NOT IMPLEMENTED: <see cref="DeconstructSystem.CanDesignate"/> rejects it —
        /// TODO(E0-5 WP-2) accept it, re-validate <see cref="PendingDeconstruct.TargetId"/> on
        /// arrival, and complete through <c>Simulation.RemoveDevice</c>. The enum member ships
        /// now so the saved/hashed byte never has to be renumbered.</summary>
        Device = 1,
    }

    /// <summary>
    /// One pending deconstruct site. Progress ticks live on the assigned citizen
    /// (<see cref="Citizen.JobWorkTicks"/>, saved+hashed in the CITZ chapter); this struct is
    /// the site's canonical identity. All fields are structural (no strings) so the STRP save
    /// chapter and the checksum stay position/kind/count based.
    /// </summary>
    public struct PendingDeconstruct
    {
        public Int3 Pos;
        public DeconstructKind Kind;
        /// <summary>Work ticks the Deconstruct job counts down from — def-frozen at designate
        /// (exactly <see cref="PendingBuild.WorkTicks"/>'s contract), so retuning
        /// <c>deconstruct.def</c> mid-save never rewrites live sites.</summary>
        public int WorkTicks;
        /// <summary>Device entity id for <see cref="DeconstructKind.Device"/>; 0 for a Wall.
        /// Saved and hashed because a device can be removed by another path between designate
        /// and completion, so the job source must RE-VALIDATE it on arrival rather than trust a
        /// cross-tick reservation (the CraftingSystem validate-on-arrival pattern).</summary>
        public uint TargetId;
    }

    /// <summary>
    /// E0-5 DECONSTRUCT — the pending-strip registry, and <see cref="BuildSystem"/>'s exact
    /// mirror. A designation creates demand the <see cref="JobSystem"/> services via
    /// <see cref="JobKind.Deconstruct"/> (see <c>DeconstructJobSource</c>); on completion the
    /// wall tile becomes open floor, the rooms behind it MERGE and re-equalise through
    /// <see cref="RoomState.MarkDirty"/> + <c>AtmosphereSystem</c>, and the recovered material
    /// drops as a loose stack on the freed tile.
    ///
    /// WHY A REGISTRY AND NOT A TILE FLAG: <see cref="TileFlags"/> has exactly one bit left and
    /// <c>ECONOMY.md</c> §8 reserves it; <c>GoalSystem</c> also documents that
    /// <see cref="TileFlags.Designated"/> has exactly one setter in the repo, so a second verb on
    /// that bit would break a documented invariant. This is the BuildSystem shape instead:
    /// canonical list, packed-position sorted, SYSS-saved, checksum-folded.
    ///
    /// PASSIVE: <see cref="Tick"/> is a no-op — the registry is command-driven (designate/cancel)
    /// and JobSystem-driven (complete), so a strip-free ship costs nothing and allocates nothing
    /// here.
    ///
    /// SCOPE (WP-1): WALLS ONLY. <see cref="DeconstructKind.Device"/> is declared but rejected by
    /// <see cref="CanDesignate"/> — TODO(E0-5 WP-2).
    ///
    /// YIELD, and a deliberate divergence from <c>ECONOMY.md</c> §5's flow diagram: a stripped
    /// wall returns <see cref="ItemKind.Regolith"/>, not Scrap. In the shipped ladder the
    /// SalvageRecycler CONSUMES Regolith to MAKE Scrap, so yielding Scrap would skip a conversion
    /// hop and make tearing down a wall strictly better than digging — inverting the intended
    /// lossiness. Regolith re-enters the ladder at the top and pays full conversion loss.
    /// Revisit at E0-6, when the graph inverts.
    ///
    /// Determinism: the pending list is kept in canonical packed-position order (sorted insert),
    /// so every scan — the job board, the save, the checksum — is order-stable. No RNG, no
    /// Dictionary/HashSet iteration, no LINQ.
    /// </summary>
    public sealed class DeconstructSystem : ISimSystem, IStatefulSystem
    {
        public string Name => "Deconstruct";  // SYSS chapter key (SaveReader matches by Name)
        public int IntervalTicks => 1;        // registered in the stack; Tick is a no-op
        public ushort StateVersion => 1;

        /// <summary>'STRP' — the SYSS checksum seed, big-endian ASCII (S=0x53 T=0x54 R=0x52
        /// P=0x50), derived exactly as <see cref="BuildSystem"/>'s 0x42554C44 'BULD'.</summary>
        public const ulong Seed = 0x53545250UL;

        /// <summary>What a stripped wall drops. The build material's inverse (BuildSystem
        /// consumes Regolith to raise a wall; stripping returns a fraction of it).</summary>
        public const ItemKind WallSalvage = ItemKind.Regolith;

        // Canonical packed-position-sorted pending list. Never iterated for lookups (a small
        // linear scan by position is fine at v0 densities and stays alloc-free).
        private readonly List<PendingDeconstruct> _pending = new List<PendingDeconstruct>(32);

        /// <summary>Pending sites in canonical order (the job board + inspectors read this).</summary>
        public IReadOnlyList<PendingDeconstruct> Pending => _pending;

        public void Tick(Simulation sim) { /* passive: no per-tick work (command/JobSystem driven) */ }

        // ------------------------------------------------------------------ queries

        public bool TryGet(Int3 pos, out PendingDeconstruct site)
        {
            for (int i = 0; i < _pending.Count; i++)
            {
                if (_pending[i].Pos == pos) { site = _pending[i]; return true; }
            }
            site = default;
            return false;
        }

        /// <summary>
        /// THE PRESSURE-HULL GUARDRAIL (<c>ECONOMY.md</c> §9.3: <i>"never allow stripping the
        /// pressure hull itself — the hull is the canvas edge"</i>). A wall is hull iff it
        /// SEPARATES THE INTERIOR FROM VACUUM OR THE MAP EDGE: any 4-neighbour that is off-map or
        /// whose floor is <see cref="TileDefs.Void"/>. Pure, static, no new state — this is
        /// exactly the test <c>World</c>'s class comment already names ("why 'adjacent to void' is
        /// a meaningful hull test").
        ///
        /// Neighbours are visited in the canonical +x, −x, +y, −y order
        /// (<see cref="Int3.Neighbor4"/>), shared with pathing, room flood, atmosphere and power.
        ///
        /// ADDITION beyond the lane plan's spec, stated because it is a real hole the plan's
        /// four-neighbour form leaves open: a wall whose OWN floor is Void is hull too. Stripping
        /// it would run <c>SetFloor(Floor)</c> over vacuum and conjure deck plating out of nothing.
        ///
        /// HONEST LIMITS — read these before trusting it:
        ///  * IN-PLANE ONLY (4-neighbour, no z term), deliberate parity with
        ///    <c>Room.HullTiles</c>/<c>HasHullContact</c>. A top-deck wall with vacuum ABOVE it is
        ///    not detected. Ships are 64×20×2 stacked interiors, so it does not bite today; it
        ///    will on an open-topped ship.
        ///  * GEOMETRIC, NOT STRUCTURAL. There is no hull-stress model anywhere in the sim
        ///    (<c>ShipSystems</c> says so explicitly), so this cannot tell a load-bearing frame
        ///    from a partition. It only knows what is next to vacuum.
        ///  * Consequently, on a ship carved out of SOLID MASS (both authored ships: every
        ///    non-room tile is wall, and there is not one Void tile on either deck) this reduces
        ///    to the map-edge ring. That is correct, not a bug — those ships genuinely have no
        ///    exposed hull face — but it means the predicate protects far fewer walls there than
        ///    "hull" suggests. Measured by
        ///    <c>DeconstructSystemTests.PressureHull_OnTheRealSlice_RejectsTheOuterHullAndAcceptsInteriorPartitions</c>.
        /// </summary>
        public static bool IsPressureHull(World world, Int3 pos)
        {
            if (!world.InBounds(pos)) return false;
            if (world.GetWall(pos) != TileDefs.Wall) return false;
            if (world.GetFloor(pos) == TileDefs.Void) return true; // standing over vacuum itself
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(pos, i);
                if (!world.InBounds(n)) return true;                    // the map edge IS outside
                if (world.GetFloor(n) == TileDefs.Void) return true;    // vacuum on the far side
            }
            return false;
        }

        /// <summary>Regolith units a stripped wall returns:
        /// <c>floor(build.wall_material × deconstruct.wall_recovery)</c> = 1 at shipped values
        /// (2 × 0.5). Widened to double before the multiply so the fold-visible float value is the
        /// only source of imprecision, then floored — a lossy, one-way inverse of build, never a
        /// profit.</summary>
        public static int WallYield(SimDefs defs)
        {
            double y = defs.Build.WallMaterial * (double)defs.Deconstruct.WallRecovery;
            int units = (int)System.Math.Floor(y);
            return units < 0 ? 0 : units;
        }

        // ---------------------------------------------------------------- public API

        /// <summary>
        /// Whether <paramref name="pos"/> is a legal target for a fresh <paramref name="kind"/>
        /// deconstruct designation right now. Deterministic — same world, same answer.
        ///
        /// Rejection order (mirrors <see cref="BuildSystem.CanDesignate"/>):
        /// out of bounds → already designated here → over the staging cap →
        /// <see cref="DeconstructKind.Device"/> (WP-2, not yet) → not a wall tile (so
        /// <see cref="TileDefs.Debris"/> stays DIG's verb and <see cref="TileDefs.Void"/> is
        /// nothing) → <see cref="IsPressureHull"/> → a living citizen standing on the tile.
        /// </summary>
        public bool CanDesignate(Simulation sim, Int3 pos, DeconstructKind kind)
        {
            if (!sim.World.InBounds(pos)) return false;
            if (TryGet(pos, out _)) return false;                                 // already designated
            if (_pending.Count >= sim.Defs.Deconstruct.MaxStaged) return false;   // concurrency cap

            // TODO(E0-5 WP-2): device strip. Accepting it here without the arrival re-validation
            // and the RemoveDevice completion would designate work no source can finish.
            if (kind != DeconstructKind.Wall) return false;

            // Only a real WALL. Debris is DigJobSource's target (a different verb with a
            // different yield); Void is nothing to tear down.
            if (sim.World.GetWall(pos) != TileDefs.Wall) return false;
            if (IsPressureHull(sim.World, pos)) return false;                     // the canvas edge

            // A wall tile is not walkable, so this should be unreachable — but BuildSystem makes
            // the same check for the same reason, and "should be unreachable" is how a crew member
            // ends up standing in a tile that suddenly opens onto vacuum.
            var citizens = sim.Citizens.Items;
            for (int i = 0; i < citizens.Count; i++)
                if (!citizens[i].Dead && citizens[i].Pos == pos) return false;
            return true;
        }

        /// <summary>
        /// Register a deconstruct at <paramref name="pos"/>. Returns false (no state change) when
        /// <see cref="CanDesignate"/> rejects it, so an illegal / hull / duplicate tile is a
        /// deterministic no-op. Sets <see cref="Simulation.JobsDirty"/> so the job board picks the
        /// new site up.
        /// </summary>
        public bool Designate(Simulation sim, Int3 pos, DeconstructKind kind, uint targetId = 0)
        {
            if (!CanDesignate(sim, pos, kind)) return false;
            InsertSorted(new PendingDeconstruct
            {
                Pos = pos,
                Kind = kind,
                WorkTicks = sim.Defs.Deconstruct.WallWorkTicks,
                TargetId = targetId,
            });
            sim.JobsDirty |= JobBoardDirty.Sites; // a new pending site — the strip board re-derives
            return true;
        }

        /// <summary>Cancel the designation at <paramref name="pos"/>. Nothing to refund — a
        /// deconstruct stages no material and holds no reservation, so cancelling is pure
        /// forgetting. Returns false if nothing was pending.</summary>
        public bool Cancel(Simulation sim, Int3 pos)
        {
            for (int i = 0; i < _pending.Count; i++)
            {
                if (_pending[i].Pos != pos) continue;
                _pending.RemoveAt(i);
                sim.JobsDirty |= JobBoardDirty.Sites;
                return true;
            }
            return false;
        }

        /// <summary>
        /// Finish the deconstruct at <paramref name="pos"/> (called by the job source when the
        /// work ticks reach zero). Returns true when a pending entry was CONSUMED — which is not
        /// the same as "the world changed": the site is RE-VALIDATED on arrival, and an entry
        /// whose target stopped being a legal wall (dug/built/vented out from under the worker, or
        /// newly hull because a neighbour opened onto vacuum) is removed with no world write and
        /// no yield. That is deliberate: leaving an unsatisfiable entry pending would loop a crew
        /// member on it forever.
        ///
        /// On a real completion: the wall tile becomes open floor, the ROOMS ON EITHER SIDE MERGE
        /// and their gas re-equalises for free through <see cref="RoomState.MarkDirty"/> +
        /// <c>AtmosphereSystem</c> (the "strip the wrong bulkhead and you decompress the mess
        /// hall" moment), power reachability may have changed, and the recovered Regolith drops as
        /// a loose stack on the freed tile.
        ///
        /// The tile's MATERIAL byte is deliberately left alone: the freed floor keeps the wall's
        /// material identity, exactly as <c>DigJobSource</c> leaves it on a dug-out tile.
        /// </summary>
        public bool Complete(Simulation sim, Int3 pos, uint workerId)
        {
            for (int i = 0; i < _pending.Count; i++)
            {
                if (_pending[i].Pos != pos) continue;
                var kind = _pending[i].Kind;
                _pending.RemoveAt(i);
                sim.JobsDirty |= JobBoardDirty.Sites; // the pending site is gone either way

                // WP-1 is walls only; a Device entry cannot exist yet (CanDesignate rejects it),
                // and if one ever did it would be consumed without effect rather than mis-applied.
                if (kind != DeconstructKind.Wall) return true;

                // Validate on ARRIVAL, never trust the designate-time decision.
                if (sim.World.GetWall(pos) != TileDefs.Wall) return true;
                if (IsPressureHull(sim.World, pos)) return true;

                int yield = WallYield(sim.Defs);
                sim.World.SetWall(pos, 0);                  // RecomputeFlags → walkable, no gas block
                sim.World.SetFloor(pos, TileDefs.Floor);
                sim.Rooms.MarkDirty();                      // reflood next tick: MERGE + re-equalise
                sim.PowerDirty = true;                      // conduit reachability may change
                if (yield > 0) sim.AddItem(WallSalvage, yield, pos); // AddItem sets Items itself
                sim.Events.Publish(new TileChangedEvent { Pos = pos });
                sim.JobsDirty |= JobBoardDirty.Tiles;       // the tile board must re-derive
                return true;
            }
            return false;
        }

        // ----------------------------------------------------------- sorted insert

        // VERBATIM copy of BuildSystem.Pack / Simulation.Pack — the THIRD copy in the repo. It
        // masks none of its fields (X above 2^20 aliases into Y), which is a real latent bug and
        // deliberately NOT fixed here: the masked-21/21/6 correction moves the determinism pins
        // and is its own package (ECONOMY-PLAN; lane plan §6.3). Copying it keeps this system's
        // ordering byte-identical to BuildSystem's; fixing it in one of three copies would be
        // worse than the bug.
        private static ulong Pack(Int3 p) =>
            (ulong)(uint)p.X | ((ulong)(uint)p.Y << 20) | ((ulong)(uint)p.Z << 40);

        private void InsertSorted(PendingDeconstruct s)
        {
            ulong key = Pack(s.Pos);
            int lo = 0, hi = _pending.Count;
            while (lo < hi)
            {
                int mid = (lo + hi) >> 1;
                if (Pack(_pending[mid].Pos) < key) lo = mid + 1; else hi = mid;
            }
            _pending.Insert(lo, s);
        }

        // --------------------------------------------------------------- save/hash

        public void CaptureState(System.IO.BinaryWriter writer)
        {
            writer.Write(_pending.Count);
            for (int i = 0; i < _pending.Count; i++)
            {
                var s = _pending[i];
                writer.Write(s.Pos.X);
                writer.Write(s.Pos.Y);
                writer.Write(s.Pos.Z);
                writer.Write((byte)s.Kind);
                writer.Write(s.WorkTicks);
                writer.Write(s.TargetId);
            }
        }

        public void RestoreState(System.IO.BinaryReader reader, ushort version)
        {
            // Version-BRANCH, never version-BAIL (ECONOMY-PLAN §3.3). Deliberately NOT
            // `if (version != 1) return;` — that shape silently drops every v1 save the moment
            // WP-2 ships v2. A future v2 reads its extra fields under a `version >= 2` branch.
            if (version < 1 || version > StateVersion) return;
            _pending.Clear();
            int count = reader.ReadInt32();
            for (int i = 0; i < count; i++)
            {
                _pending.Add(new PendingDeconstruct
                {
                    Pos = new Int3(reader.ReadInt32(), reader.ReadInt32(), reader.ReadInt32()),
                    Kind = (DeconstructKind)reader.ReadByte(),
                    WorkTicks = reader.ReadInt32(),
                    TargetId = reader.ReadUInt32(),
                }); // saved in canonical order → stays sorted
            }
        }

        /// <summary>Folds the 'STRP' seed and every field of every pending site, in canonical
        /// order. An EMPTY registry folds the bare seed — which is exactly what makes registering
        /// this system a pin move, and exactly what keeps that move fold-only (nothing designates
        /// on any authored ship).</summary>
        public ulong StateChecksum()
        {
            ulong h = Seed;
            for (int i = 0; i < _pending.Count; i++)
            {
                var s = _pending[i];
                h = XxHash64.Combine(h, Pack(s.Pos));
                h = XxHash64.Combine(h, (ulong)(byte)s.Kind);
                h = XxHash64.Combine(h, (ulong)(uint)s.WorkTicks);
                h = XxHash64.Combine(h, (ulong)s.TargetId);
            }
            return h;
        }
    }
}
