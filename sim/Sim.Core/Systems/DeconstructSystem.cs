using System.Collections.Generic;

namespace Perilune.Sim
{
    /// <summary>What a deconstruct designation tears down. Byte enum, append-only (it is saved
    /// in the STRP chapter and folded into the checksum).</summary>
    public enum DeconstructKind : byte
    {
        /// <summary>A <see cref="TileDefs.Wall"/> tile → open floor, yielding Regolith.</summary>
        Wall = 0,
        /// <summary>A <see cref="Device"/> entity → removed through <c>Simulation.RemoveDevice</c>,
        /// yielding <c>floor(device_parts × Condition)</c> Parts on the freed tile (E0-5 WP-2).
        /// LEGAL FOR EVERY DEVICE KIND EXCEPT <see cref="DeviceKind.Door"/> — see
        /// <see cref="DeconstructSystem.CanDesignate"/>.</summary>
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
        /// RESOLVED FROM THE TILE at designate time (the player clicks a tile, never an entity
        /// id), then saved and hashed because a device can be removed by another path between
        /// designate and completion — so <see cref="DeconstructSystem.Complete"/> RE-VALIDATES it
        /// on arrival rather than trusting a cross-tick reservation (the CraftingSystem
        /// validate-on-arrival pattern). The id, not the position, is the device's identity: a
        /// DIFFERENT device standing on the same tile is not the one the player condemned.</summary>
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
    /// NEARLY PASSIVE: <see cref="Tick"/> does exactly one bounded thing — <see cref="Reap"/>,
    /// the liveness sweep that drops sites whose target stopped existing. It returns on the first
    /// line for an empty registry, so a strip-free ship still costs nothing and allocates nothing
    /// here. WP-1 shipped a literally-empty Tick and that was a LEAK, not a virtue: see
    /// <see cref="Reap"/> for the measurement.
    ///
    /// SCOPE (WP-2): WALLS AND DEVICES. A device site removes the entity through
    /// <c>Simulation.RemoveDevice</c> and drops <c>floor(device_parts × Condition)</c> Parts.
    ///
    /// YIELD, and a deliberate divergence from <c>ECONOMY.md</c> §5's flow diagram: a stripped
    /// wall returns <see cref="ItemKind.Regolith"/>, not Scrap. In the shipped ladder the
    /// SalvageRecycler CONSUMES Regolith to MAKE Scrap, so yielding Scrap would skip a conversion
    /// hop and make tearing down a wall strictly better than digging — inverting the intended
    /// lossiness. Regolith re-enters the ladder at the top and pays full conversion loss.
    /// Revisit at E0-6, when the graph inverts. A stripped DEVICE returns
    /// <see cref="ItemKind.Parts"/>, which feeds the ship's one never-ending sink (a
    /// <c>MaintenanceSystem</c> overhaul consumes one Part), and is the only place outside
    /// <c>MachineWearSystem</c> where <see cref="Device.Condition"/> changes an outcome.
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

        /// <summary>What a stripped device drops (E0-5 WP-2). Parts is the ladder's third rung and
        /// the ship's ONE never-ending sink (an overhaul consumes one), so a device strip pays
        /// straight into the only demand that survives the economy's terminal cliff.</summary>
        public const ItemKind DeviceSalvage = ItemKind.Parts;

        // Canonical packed-position-sorted pending list. Never iterated for lookups (a small
        // linear scan by position is fine at v0 densities and stays alloc-free).
        private readonly List<PendingDeconstruct> _pending = new List<PendingDeconstruct>(32);

        /// <summary>Pending sites in canonical order (the job board + inspectors read this).</summary>
        public IReadOnlyList<PendingDeconstruct> Pending => _pending;

        /// <summary>The registry's only per-tick work: <see cref="Reap"/>. Everything else is
        /// command-driven (designate/cancel) or JobSystem-driven (complete).</summary>
        public void Tick(Simulation sim) => Reap(sim);

        /// <summary>
        /// LIVENESS SWEEP (E0-5 WP-2, fixing a WP-1 leak found by review). Drops every pending
        /// site whose TARGET NO LONGER EXISTS — a designated wall dug/vented/scripted away, a
        /// designated device removed by <c>RemoveDeviceCommand</c>, a save, or another stripper.
        /// Returns how many entries it removed.
        ///
        /// THE BUG THIS FIXES, measured on WP-1: designate a wall, let a worker claim it, then
        /// remove the wall by another path. <c>DeconstructJobSource.Progress</c> abandons cleanly,
        /// <c>Select</c> then skips the site forever (it is no longer a wall), and NOTHING removes
        /// the entry — after 3000 further ticks the registry still read <c>pending = 1</c>,
        /// <c>CandidateCount = 1</c>, <c>workerJob = None</c>. One of <c>max_staged</c>'s 64 slots
        /// was consumed permanently, cancellable only by a player who happened to notice. It also
        /// contradicted <see cref="Complete"/>'s own stated rationale, which garbage-collects an
        /// unsatisfiable entry — but only if a worker survives all the way to arrival.
        ///
        /// WHY HERE AND NOT IN THE JOB SOURCE (the review suggested either): the leaked entry is
        /// REGISTRY state — saved, hashed, and counted against <c>max_staged</c> — so removing it
        /// from a consumer's derived board would have fixed the symptom and left the leak. This
        /// also covers the case no job-source fix reaches: a site nobody ever claimed, whose wall
        /// a dig removed, on a tick where the job board is not dirty.
        ///
        /// NARROW ON PURPOSE — "the target is gone", never "the target became illegal". A wall
        /// that became <see cref="IsPressureHull"/> mid-job is still a wall and is still the
        /// player's order; <see cref="Complete"/> refuses it on arrival and consumes it there, so
        /// the crew member learns by walking over. Reaping it here would make designations near a
        /// hull breach silently evaporate.
        ///
        /// Deterministic: a pure function of world/device state walked in canonical pending order,
        /// no RNG, no Dictionary/HashSet iteration, and alloc-free (<c>RemoveAt</c> on a
        /// <see cref="List{T}"/> shifts in place). Bounded by <c>max_staged</c> = 64.
        /// </summary>
        public int Reap(Simulation sim)
        {
            if (_pending.Count == 0) return 0; // the whole cost on every strip-free ship
            int removed = 0;
            for (int i = _pending.Count - 1; i >= 0; i--) // backwards: RemoveAt keeps the prefix valid
            {
                if (TargetStillExists(sim, _pending[i])) continue;
                _pending.RemoveAt(i);
                removed++;
            }
            if (removed > 0) sim.JobsDirty |= JobBoardDirty.Sites; // the strip board must shrink
            return removed;
        }

        /// <summary>
        /// Does this site still have something to tear down? Shared by <see cref="Reap"/>, by
        /// <c>DeconstructJobSource</c> and (through <see cref="TryGetLiveDevice"/>) by
        /// <see cref="Complete"/>, so the board, the registry and the completion path can never
        /// disagree about which sites are dead.
        ///
        /// MOSTLY "EXISTS", NOT "IS LEGAL" — the tunable legality rules (hull, staging cap,
        /// duplicates) belong to <see cref="CanDesignate"/> at designate time and to
        /// <see cref="Complete"/> on arrival, and are deliberately NOT re-tested here: a wall that
        /// became hull mid-job is still a wall and still the player's order (see
        /// <see cref="Reap"/>'s "narrow on purpose").
        ///
        /// F3, WP-2 review — WITH ONE ADMITTED EXCEPTION, stated rather than hidden: the device
        /// leg's <c>Kind != Door</c> clause is a LEGALITY test living in an existence predicate.
        /// It is kept here on purpose as a corrupt-save backstop. <see cref="CanDesignate"/> is the
        /// only way to create a site and already refuses Doors, and a <see cref="Device"/>'s Kind
        /// is never rewritten, so the ONLY way a Door-targeted site can exist is a hand-edited or
        /// foreign STRP chapter — in which case <see cref="Reap"/> drops it on the next tick
        /// instead of letting <see cref="Complete"/> delete a door and pay Parts for it. Alternative
        /// considered and rejected: hoisting the clause into <c>Complete</c> would put it back in
        /// two places, which is exactly the compound-guard shape F1 was raised about.
        /// </summary>
        public static bool TargetStillExists(Simulation sim, PendingDeconstruct site)
        {
            if (site.Kind == DeconstructKind.Wall)
                return sim.World.InBounds(site.Pos) && sim.World.GetWall(site.Pos) == TileDefs.Wall;
            return TryGetLiveDevice(sim, site, out _);
        }

        /// <summary>
        /// The device leg of <see cref="TargetStillExists"/>, WITH THE ENTITY OUT — so
        /// <see cref="Complete"/> can validate and dereference through ONE guard instead of two.
        ///
        /// F1, WP-2 review: <c>Complete</c> previously asked <c>!TargetStillExists(...) ||
        /// !sim.Devices.TryGet(...)</c>, two guards that each deflected the other's mutation
        /// (dropping either leg alone measured GREEN across the whole suite; only deleting both
        /// went RED). A test cannot name a failing one-line mutation against a guard whose twin
        /// silently covers it, so the redundancy is removed rather than re-worded.
        ///
        /// The ID is the identity: entity ids are never recycled (<c>Simulation._nextEntityId</c>
        /// only increments), so a resolving id IS the condemned object and a REPLACEMENT device on
        /// the same tile can never inherit a condemned site.
        ///
        /// <c>device.Pos == site.Pos</c> is UNREACHABLE-FALSE ON TODAY'S CONTENT and kept anyway:
        /// <see cref="Device.Pos"/> is written in exactly two places in the repo
        /// (<c>Simulation.AddDevice</c> and <c>SaveReader</c>'s DEVC load), so nothing moves a
        /// device after it exists. It costs one comparison and it is the clause that keeps this
        /// honest the day something does.
        /// </summary>
        public static bool TryGetLiveDevice(Simulation sim, PendingDeconstruct site, out Device device) =>
            sim.Devices.TryGet(site.TargetId, out device) &&
            device.Pos == site.Pos &&
            device.Kind != DeviceKind.Door;

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
        ///    <c>DeconstructSystemTests.PressureHull_OnTheRealSlice_IsExactlyTheMapEdgeRing_AndRejectsDesignationThere</c>
        ///    (F3: WP-1 cited a symbol that does not exist — this is the real name).
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

        /// <summary>
        /// <see cref="ItemKind.Parts"/> a stripped device returns:
        /// <c>floor(deconstruct.device_parts × Condition)</c> = 2 for a pristine machine at
        /// shipped values, and <b>0 below Condition 0.5</b> — a wreck is worth nothing, which is
        /// the point. This is <see cref="Device.Condition"/>'s SECOND consumer in the repo (every
        /// reader outside <c>MachineWearSystem</c> is display-only), and it is what makes letting
        /// a machine rot a decision with a price rather than a cosmetic number.
        ///
        /// Condition is CLAMPED to [0,1] before the multiply: the field is a public float that
        /// nothing structurally bounds, and an out-of-range value must never mint more Parts than
        /// <c>device_parts</c>. Widened to double first so the fold-visible float is the only
        /// source of imprecision, then floored.
        /// </summary>
        public static int DeviceYield(SimDefs defs, Device device)
        {
            if (device == null) return 0;
            double condition = device.Condition;
            if (condition <= 0.0) return 0;
            if (condition > 1.0) condition = 1.0;
            int units = (int)System.Math.Floor(defs.Deconstruct.DeviceParts * condition);
            return units < 0 ? 0 : units;
        }

        // ---------------------------------------------------------------- public API

        /// <summary>
        /// Whether <paramref name="pos"/> is a legal target for a fresh <paramref name="kind"/>
        /// deconstruct designation right now. Deterministic — same world, same answer.
        ///
        /// Rejection order (mirrors <see cref="BuildSystem.CanDesignate"/>):
        /// out of bounds → already designated here → over the staging cap →
        /// then, per kind:
        /// <list type="bullet">
        /// <item><b>Device</b>: no device resolves at the tile → reject; the device is a
        /// <see cref="DeviceKind.Door"/> → reject. <b>Everything else is legal, INCLUDING LIFE
        /// SUPPORT</b> (<c>ECONOMY.md</c> §7.2 — stripping the scrubber to make rent is the game,
        /// and E0-2's <c>SafetySystem</c> already handles the consequence).</item>
        /// <item><b>Wall</b>: not a wall tile (so <see cref="TileDefs.Debris"/> stays DIG's verb
        /// and <see cref="TileDefs.Void"/> is nothing) → <see cref="IsPressureHull"/> → a living
        /// citizen standing on the tile.</item>
        /// </list>
        ///
        /// WHY DOORS ARE THE ONE EXCLUSION: a door is <see cref="BuildSystem"/>'s OUTPUT
        /// (<c>BuildSystem.Complete</c> spawns it), so its inverse is build-cancel, not strip.
        /// Two owners for one object's lifetime is the bug. Deliberately NOT
        /// <see cref="PlaceDeviceCommand.IsPlaceableFurniture"/>: that is a different, much
        /// narrower verb (nine decor kinds the player may conjure at runtime), and reusing it
        /// would forbid stripping exactly the machines worth stripping.
        ///
        /// NO CITIZEN-STANDING CHECK ON THE DEVICE PATH, unlike the wall path. A wall tile that
        /// opens under a crew member can drop them into vacuum; a removed device leaves the floor
        /// exactly as it was, only more walkable. Blocking machines already stand on unwalkable
        /// tiles, so nobody can be there at all.
        /// </summary>
        public bool CanDesignate(Simulation sim, Int3 pos, DeconstructKind kind)
        {
            if (!sim.World.InBounds(pos)) return false;
            if (TryGet(pos, out _)) return false;                                 // already designated
            if (_pending.Count >= sim.Defs.Deconstruct.MaxStaged) return false;   // concurrency cap

            if (kind == DeconstructKind.Device)
            {
                // TryGetDeviceAt reads the device GRID, which deliberately excludes the utility
                // overlays (Conduit/Pipe — Simulation.IsUtilityOverlay): they share a tile with a
                // machine and never enter the grid, so a tile-addressed verb cannot name one
                // unambiguously. HONEST LIMIT: conduits and pipes are therefore un-strippable
                // today. They are also the cheapest things on the ship, so nothing is lost yet.
                if (!sim.TryGetDeviceAt(pos, out var device)) return false;
                return device.Kind != DeviceKind.Door;
            }

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
        ///
        /// <see cref="PendingDeconstruct.TargetId"/> is RESOLVED HERE from the device grid, not
        /// supplied by the caller. The player clicks a TILE; entity ids are sim-internal, and a
        /// caller-supplied id would be a second, unvalidated identity for the same object — the
        /// bug class E0-3 settled when it made the designate flag explicit rather than a host-side
        /// read of world state. <c>TargetId</c> stays 0 for a Wall.
        ///
        /// <see cref="PendingDeconstruct.WorkTicks"/> is def-frozen at designate (kind-dependent:
        /// <c>wall_work_ticks</c> or <c>device_work_ticks</c>), exactly as
        /// <see cref="PendingBuild.WorkTicks"/> is, so retuning defs mid-save never rewrites a
        /// live site.
        /// </summary>
        public bool Designate(Simulation sim, Int3 pos, DeconstructKind kind)
        {
            if (!CanDesignate(sim, pos, kind)) return false;
            uint targetId = 0;
            if (kind == DeconstructKind.Device && sim.TryGetDeviceAt(pos, out var device))
                targetId = device.Id;
            InsertSorted(new PendingDeconstruct
            {
                Pos = pos,
                Kind = kind,
                WorkTicks = kind == DeconstructKind.Wall
                    ? sim.Defs.Deconstruct.WallWorkTicks
                    : sim.Defs.Deconstruct.DeviceWorkTicks,
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
        /// On a real WALL completion: the wall tile becomes open floor, the ROOMS ON EITHER SIDE
        /// MERGE and their gas re-equalises for free through <see cref="RoomState.MarkDirty"/> +
        /// <c>AtmosphereSystem</c> (the "strip the wrong bulkhead and you decompress the mess
        /// hall" moment), power reachability may have changed, and the recovered Regolith drops as
        /// a loose stack on the freed tile.
        ///
        /// The tile's MATERIAL byte is deliberately left alone: the freed floor keeps the wall's
        /// material identity, exactly as <c>DigJobSource</c> leaves it on a dug-out tile.
        ///
        /// On a real DEVICE completion: <c>Simulation.RemoveDevice</c> does all of it — clears the
        /// device grid, clears <see cref="TileFlags.HasDevice"/>, marks rooms dirty and bumps
        /// <c>DeviceTopologyVersion</c> — and <c>floor(device_parts × Condition)</c> Parts drop on
        /// the freed tile. <b>THE MOSS CONSEQUENCE IS A FEATURE</b> (<c>ECONOMY.md</c> §9.3:
        /// <i>"deleting a named device un-registers its MOSS adapter, so you can break your own
        /// automation by selling a valve"</i>): a script addressing the stripped device fails with
        /// a legible per-tick runtime error and raises an alarm. Nothing here defends against it.
        ///
        /// <paramref name="workerId"/> is LIVE: it rides
        /// <see cref="DeconstructCompletedEvent"/>, which <c>HistorySystem</c> turns into a
        /// Chronicle line naming the crew member. Published only on a real tear-down.
        /// </summary>
        public bool Complete(Simulation sim, Int3 pos, uint workerId)
        {
            for (int i = 0; i < _pending.Count; i++)
            {
                if (_pending[i].Pos != pos) continue;
                var site = _pending[i];
                _pending.RemoveAt(i);
                sim.JobsDirty |= JobBoardDirty.Sites; // the pending site is gone either way

                if (site.Kind == DeconstructKind.Device)
                {
                    // Validate on ARRIVAL through ONE guard (F1: the two-guard form each leg
                    // deflected the other's mutation). TargetId may have been removed by another
                    // path — a RemoveDeviceCommand, a second stripper — during the 90-second pull;
                    // the id, not the tile, is the identity.
                    if (!TryGetLiveDevice(sim, site, out var device)) return true;

                    int deviceYield = DeviceYield(sim.Defs, device);
                    byte deviceKind = (byte)device.Kind;
                    sim.RemoveDevice(site.TargetId); // grid + HasDevice + rooms + power + topology
                    if (deviceYield > 0) sim.AddItem(DeviceSalvage, deviceYield, pos);
                    // A genuine TILE change: RemoveDevice cleared TileFlags.HasDevice, which is
                    // what BuildSystem.CanDesignate and PlaceDeviceCommand read to decide the tile
                    // is occupied. (It does NOT change walkability today — no shipped machine sets
                    // Blocks, and the one kind IsWalkable gates on is Door, which is never
                    // stripped. It would the moment a blocking kind ships.)
                    sim.Events.Publish(new TileChangedEvent { Pos = pos });
                    sim.Events.Publish(new DeconstructCompletedEvent
                    {
                        Pos = pos,
                        Kind = (byte)DeconstructKind.Device,
                        Device = deviceKind,
                        WorkerId = workerId,
                        Yield = deviceYield,
                    });
                    sim.JobsDirty |= JobBoardDirty.Tiles;
                    return true;
                }

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
                sim.Events.Publish(new DeconstructCompletedEvent
                {
                    Pos = pos,
                    Kind = (byte)DeconstructKind.Wall,
                    Device = 0,          // not a device (Door is 0 and is never stripped)
                    WorkerId = workerId,
                    Yield = yield,
                });
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
            // `if (version != 1) return;` — that shape silently drops every v1 save the moment a
            // v2 ships. A future v2 reads its extra fields under a `version >= 2` branch.
            // STILL v1 AFTER WP-2: device strip added no saved field (TargetId shipped in WP-1
            // precisely so this bump would never be needed), so v1 saves and v1 writers stay
            // byte-identical across the device work.
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
