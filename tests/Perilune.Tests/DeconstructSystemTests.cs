using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-5 — DECONSTRUCT. <see cref="BuildSystem"/>'s mirror: the designate → walk → tear-down
    /// loop, the pressure-hull guardrail measured ON THE REAL SLICE, the bulkhead consequence
    /// (rooms MERGE and re-equalise), the STRP save chapter, hash honesty over every folded field,
    /// flee pre-emption, twin determinism, zero-alloc steady state over a POPULATED board, and the
    /// deconstruct.def consumption tripwires.
    ///
    /// WP-2 adds DEVICE STRIP below the "device strip" banner: legality (any kind but a Door), the
    /// <c>floor(device_parts × Condition)</c> yield, validate-on-arrival, the liveness reap that
    /// fixes WP-1's zombie-site leak, the Chronicle trace, and the MOSS consequence
    /// (<c>ECONOMY.md</c> §9.3) exercised as a FEATURE.
    ///
    /// LINQ is used freely here — it is a TEST; the no-LINQ rule governs tick paths under sim/.
    ///
    /// LIMITS OF THIS FILE, stated so a reviewer does not read more into it than it proves:
    ///  * The hull predicate is measured on the two AUTHORED decks, which contain no
    ///    <see cref="TileDefs.Void"/> tile at all — so the "adjacent to vacuum" leg is exercised
    ///    on a synthetic map, and the slice measurement pins the (surprising, real) fact that on
    ///    that ship the predicate reduces to the map-edge ring.
    ///  * No test here runs a full sim-day; the conservation ledger over 3 sim-days is WP-4's
    ///    harness, because nothing designates without the <c>--strip</c> flag it ships.
    ///  * <see cref="DeviceKind.Conduit"/> / <see cref="DeviceKind.Pipe"/> are pinned as
    ///    UN-STRIPPABLE, which is a consequence of the device grid excluding utility overlays, not
    ///    a designed rule. If overlays ever become tile-addressable this file must be revisited.
    /// </summary>
    public class DeconstructSystemTests
    {
        // A sealed two-room map: rooms A (x1-4) and B (x6-9) separated by the SOLID partition
        // column x=5. No door, no void anywhere except beyond the outer ring, so the partition is
        // interior (strippable) and the outer ring is hull (never strippable).
        private static readonly string[] TwoRooms =
        {
            "###########",
            "#....#....#",
            "#....#....#",
            "#....#....#",
            "###########",
        };

        private static readonly Int3 Partition = new Int3(5, 2, 0);

        private static ISimSystem[] Stack(out DeconstructSystem strip)
        {
            var baseStack = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            strip = null;
            foreach (var s in baseStack)
                if (s is DeconstructSystem d) { strip = d; break; }
            Assert.That(strip, Is.Not.Null,
                "DeconstructSystem must be registered in SystemStack.CreateDefault");
            return baseStack;
        }

        /// <summary>The default stack minus <see cref="NeedsSystem"/>. E0-2's precedent from
        /// <c>BuildSystemTests</c>: a lone crew member in an unpressurized micro-map suffocates in
        /// ~900 ticks, and a wall tear-down is 1200. Suffocation is orthogonal to every mechanic
        /// under test here; AtmosphereSystem stays, so the room-merge path is unaffected.</summary>
        private static ISimSystem[] StackNoNeeds(out DeconstructSystem strip)
        {
            var kept = new List<ISimSystem>();
            foreach (var s in Stack(out strip)) if (!(s is NeedsSystem)) kept.Add(s);
            return kept.ToArray();
        }

        private static Simulation NewSim(string[] map, ulong seed, out DeconstructSystem strip,
                                         SimDefs defs = null) =>
            new Simulation(AsciiWorld.Build(map), seed, StackNoNeeds(out strip), defs);

        private static Simulation NewSlice(out DeconstructSystem strip)
        {
            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;
            strip = null;
            foreach (var s in sim.Systems)
                if (s is DeconstructSystem d) { strip = d; break; }
            Assert.That(strip, Is.Not.Null, "the slice stack registers a DeconstructSystem");
            return sim;
        }

        // ============================================================== the hull guardrail

        /// <summary>
        /// THE LOAD-BEARING SAFETY RULE (<c>ECONOMY.md</c> §9.3), measured on the REAL SLICE rather
        /// than a synthetic 3×3 — the lane plan's §10.1 requirement, because a 3×3 makes every wall
        /// hull and proves nothing about a ship anyone plays.
        ///
        /// It pins three things, and the third is the uncomfortable one:
        ///  1. The outer ring of BOTH decks is hull and is REJECTED by <c>Designate</c>.
        ///  2. A real interior partition (the reactor/corridor bulkhead at 2,8,0) is ACCEPTED.
        ///  3. On this ship the predicate is EXACTLY the map-edge ring — 328 of 1705 wall tiles,
        ///     and 0 of those 328 qualify by vacuum-adjacency, because the authored decks are
        ///     carved out of solid mass and contain not one Void tile. That is honest behaviour,
        ///     not a bug (the ship has no exposed hull face), but it means "hull" protects far
        ///     fewer walls here than the word suggests. Anyone re-reading this: 328 = 2 decks ×
        ///     (2·64 + 2·20 − 4).
        ///
        /// MUTATION that makes this fail (apply, observe, revert): delete the
        /// <c>if (!world.InBounds(n)) return true;</c> line from
        /// <see cref="DeconstructSystem.IsPressureHull"/> → hull drops from 328 to 0, every corner
        /// assertion flips, and the whole outer ring becomes strippable.
        /// </summary>
        [Test]
        public void PressureHull_OnTheRealSlice_IsExactlyTheMapEdgeRing_AndRejectsDesignationThere()
        {
            var sim = NewSlice(out var strip);
            sim.Tick(); // rooms computed
            var w = sim.World;

            int walls = 0, hull = 0, edgeHull = 0, vacuumAdjacentHull = 0, voidTiles = 0;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (w.GetFloor(p) == TileDefs.Void) voidTiles++;
                        if (w.GetWall(p) != TileDefs.Wall) continue;
                        walls++;
                        if (!DeconstructSystem.IsPressureHull(w, p)) continue;
                        hull++;
                        bool onEdge = x == 0 || y == 0 || x == w.Width - 1 || y == w.Height - 1;
                        if (onEdge) edgeHull++; else vacuumAdjacentHull++;
                    }

            Assert.That(walls, Is.EqualTo(1705), "the slice's wall census (precondition for the ratio below)");
            Assert.That(hull, Is.EqualTo(328), "hull = the outer ring of both decks, 2 × (2·64 + 2·20 − 4)");
            Assert.That(edgeHull, Is.EqualTo(328));
            Assert.That(vacuumAdjacentHull, Is.EqualTo(0),
                "no wall on this ship qualifies by vacuum-adjacency — see voidTiles");
            Assert.That(voidTiles, Is.EqualTo(0),
                "the authored decks are carved out of solid mass: there is not one Void tile aboard, " +
                "which is WHY the predicate reduces to the map-edge ring here");

            // (1) hull is rejected, at every corner and mid-edge, on both decks.
            foreach (var p in new[]
            {
                new Int3(0, 0, 0), new Int3(63, 0, 0), new Int3(0, 19, 0), new Int3(63, 19, 0),
                new Int3(30, 0, 0), new Int3(0, 10, 1), new Int3(30, 19, 1),
            })
            {
                Assert.That(w.GetWall(p), Is.EqualTo(TileDefs.Wall), $"precondition: {p} is a wall");
                Assert.That(DeconstructSystem.IsPressureHull(w, p), Is.True, $"{p} must read as hull");
                Assert.That(strip.Designate(sim, p, DeconstructKind.Wall), Is.False,
                    $"the pressure hull must never be strippable ({p})");
            }
            Assert.That(strip.Pending, Is.Empty, "no hull designation may have landed");

            // (2) a REAL interior bulkhead — the reactor/corridor partition — is accepted.
            var bulkhead = new Int3(2, 8, 0);
            Assert.That(w.GetWall(bulkhead), Is.EqualTo(TileDefs.Wall), "precondition: 2,8,0 is a wall");
            Assert.That(DeconstructSystem.IsPressureHull(w, bulkhead), Is.False);
            Assert.That(strip.Designate(sim, bulkhead, DeconstructKind.Wall), Is.True,
                "an interior partition IS the player's decision to make");
            Assert.That(strip.Pending, Has.Count.EqualTo(1));
        }

        /// <summary>
        /// The OTHER leg of the predicate, which the authored ships cannot exercise because they
        /// contain no Void: a wall with vacuum on the far side is hull even in the middle of the
        /// map, and a wall standing over vacuum itself is hull too.
        ///
        /// MUTATION: delete <c>if (world.GetFloor(n) == TileDefs.Void) return true;</c> → the
        /// breach-facing wall at (5,3,0) becomes strippable and the first assertion fails. Delete
        /// the <c>GetFloor(pos) == Void</c> line instead → the floorless wall assertion fails.
        /// </summary>
        [Test]
        public void PressureHull_AlsoBitesOnVacuumAdjacency_NotOnlyTheMapEdge()
        {
            //  (5,4) is a void breach; (5,3) is an interior wall that FACES it.
            var map = new[]
            {
                "########",
                "#......#",
                "#......#",
                "#####.##",
                "##### ##",
                "########",
            };
            var sim = NewSim(map, 3, out var strip);
            sim.Tick();

            var facingTheBreach = new Int3(4, 3, 0); // wall, 4-neighbour (4,4)? no — check both
            var overTheBreach = new Int3(5, 4, 0);   // the void tile itself (no wall)

            // (4,3,0) is a wall whose +x neighbour (5,3,0) is floor and whose +y neighbour (4,4,0)
            // is a wall over floor — but (5,4,0) is void, so the wall at (5,3,0) is the one facing
            // vacuum. Assert on the one that actually touches it.
            var breachFacing = new Int3(4, 4, 0);
            Assert.That(sim.World.GetWall(breachFacing), Is.EqualTo(TileDefs.Wall), "precondition");
            Assert.That(sim.World.GetFloor(overTheBreach), Is.EqualTo(TileDefs.Void), "precondition: void");
            Assert.That(DeconstructSystem.IsPressureHull(sim.World, breachFacing), Is.True,
                "a wall with vacuum on the far side is hull no matter where on the map it stands");
            Assert.That(strip.Designate(sim, breachFacing, DeconstructKind.Wall), Is.False);

            // A wall an entire tile away from the breach, with solid mass all round, is NOT hull.
            Assert.That(DeconstructSystem.IsPressureHull(sim.World, facingTheBreach), Is.False,
                "in-plane 4-neighbour only: one tile of separation is enough");

            // A wall standing over vacuum itself (no floor beneath) is hull — stripping it would
            // run SetFloor(Floor) over nothing and conjure deck plating out of thin air.
            var floorless = new Int3(2, 4, 0);
            sim.World.SetFloor(floorless, TileDefs.Void);
            sim.World.SetWall(floorless, TileDefs.Wall);
            Assert.That(DeconstructSystem.IsPressureHull(sim.World, floorless), Is.True);
            Assert.That(strip.Designate(sim, floorless, DeconstructKind.Wall), Is.False);
        }

        // ============================================================== designation rules

        /// <summary>
        /// Every rejection leg of <see cref="DeconstructSystem.CanDesignate"/>'s WALL path, in its
        /// documented order, plus the cross-kind rule WP-2 makes load-bearing: a
        /// <see cref="DeconstructKind.Device"/> designation on a tile with NO DEVICE on it is
        /// refused, so the two kinds can never claim each other's targets. (The device path's own
        /// legality — any kind but a Door — is
        /// <see cref="Designate_AcceptsEveryGridDeviceKindExceptDoor_AndResolvesTargetIdFromTheTile"/>.)
        ///
        /// MUTATION: delete <c>if (!sim.TryGetDeviceAt(pos, out var device)) return false;</c> from
        /// the Device branch → a Device entry is accepted on a bare wall tile, the Device assertion
        /// fails, and the registry acquires a site whose target never existed. Delete the
        /// <c>GetWall(pos) != TileDefs.Wall</c> guard → the debris assertion fails, and dig's verb
        /// silently acquires a second owner.
        /// </summary>
        [Test]
        public void Designate_RejectsIllegalTargets_IncludingDebrisDeviceKindAndDuplicates()
        {
            var map = new[]
            {
                "#######",
                "#..R..#",
                "#..#..#",   // (3,2,0): an interior wall with floor on all four sides
                "#.....#",
                "#######",
            };
            var sim = NewSim(map, 9, out var strip);
            sim.Tick();
            var interior = new Int3(3, 2, 0);

            Assert.That(strip.Designate(sim, new Int3(-1, 0, 0), DeconstructKind.Wall), Is.False, "oob");
            Assert.That(strip.Designate(sim, new Int3(1, 1, 0), DeconstructKind.Wall), Is.False,
                "a plain floor tile has no wall to tear down");
            Assert.That(strip.Designate(sim, new Int3(3, 1, 0), DeconstructKind.Wall), Is.False,
                "DEBRIS is dig's verb, with dig's yield — deconstruct must not claim it too");
            Assert.That(strip.Designate(sim, new Int3(0, 0, 0), DeconstructKind.Wall), Is.False,
                "the outer ring is hull");

            // The two kinds never claim each other's targets: a Device designation needs a DEVICE.
            Assert.That(sim.TryGetDeviceAt(interior, out _), Is.False, "precondition: bare wall tile");
            Assert.That(strip.Designate(sim, interior, DeconstructKind.Device), Is.False,
                "a Device designation on a tile with no device on it is nothing to tear down");
            Assert.That(strip.Designate(sim, new Int3(1, 1, 0), DeconstructKind.Device), Is.False,
                "…and an empty floor tile is no different");
            Assert.That(strip.Pending, Is.Empty);

            Assert.That(strip.Designate(sim, interior, DeconstructKind.Wall), Is.True, "valid interior wall");
            Assert.That(strip.Designate(sim, interior, DeconstructKind.Wall), Is.False, "duplicate");
            Assert.That(strip.Pending, Has.Count.EqualTo(1));

            // Cancel is pure forgetting — a deconstruct stages nothing, so nothing is refunded.
            int itemsBefore = sim.Items.Items.Count;
            sim.JobsDirty = JobBoardDirty.None;
            Assert.That(strip.Cancel(sim, interior), Is.True);
            // MUTATION: delete `sim.JobsDirty |= JobBoardDirty.Sites;` from Cancel → the strip
            // board keeps offering a site the player just revoked until something else dirties it.
            Assert.That(sim.JobsDirty & JobBoardDirty.Sites, Is.Not.EqualTo(JobBoardDirty.None),
                "a cancelled site must re-dirty the SITES axis, or the board keeps offering it");
            Assert.That(strip.Pending, Is.Empty);
            Assert.That(sim.Items.Items.Count, Is.EqualTo(itemsBefore),
                "cancelling a deconstruct must not conjure a refund — nothing was ever staged");
            Assert.That(strip.Cancel(sim, interior), Is.False, "cancelling nothing is false, not a throw");
        }

        /// <summary>
        /// The optional-system contract: a sim WITHOUT a <see cref="DeconstructSystem"/> ignores
        /// <see cref="DesignateDeconstructCommand"/> instead of throwing, so a reduced stack keeps
        /// its pre-E0-5 behaviour exactly. Also pins the command's EXPLICIT on/off flag: a
        /// repeated on-sweep is idempotent, and off cancels.
        ///
        /// MUTATION: change <c>DesignateDeconstructCommand.Execute</c> to
        /// <c>((DeconstructSystem)sim.Systems[0]).Designate(...)</c> → the stack-less case throws
        /// and this fails.
        /// </summary>
        [Test]
        public void DesignateCommand_IsInertWithoutTheSystem_AndItsOnFlagIsIdempotent()
        {
            var interior = new Int3(3, 2, 0);
            var map = new[] { "#######", "#.....#", "#..#..#", "#.....#", "#######" };

            var without = new Simulation(AsciiWorld.Build(map), 1, new ISimSystem[] { new JobSystem() });
            ulong before = without.StateHash();
            Assert.DoesNotThrow(() => new DesignateDeconstructCommand(interior).Execute(without),
                "a stack without a DeconstructSystem must ignore the command, not throw");
            Assert.That(without.StateHash(), Is.EqualTo(before), "and change nothing");

            var sim = NewSim(map, 1, out var strip);
            sim.Tick();
            new DesignateDeconstructCommand(interior).Execute(sim);
            new DesignateDeconstructCommand(interior).Execute(sim); // a sweep may repeat itself
            Assert.That(strip.Pending, Has.Count.EqualTo(1), "the on-flag is explicit, so a sweep is idempotent");
            new DesignateDeconstructCommand(interior, DeconstructKind.Wall, on: false).Execute(sim);
            Assert.That(strip.Pending, Is.Empty);
        }

        // ============================================================== the bulkhead moment

        /// <summary>
        /// THE consequence <c>ECONOMY.md</c> §9.3 names — "strip the wrong bulkhead and you
        /// decompress the mess hall" — and the one that would make the whole feature COSMETIC if it
        /// silently did not happen. Two sealed rooms at very different pressures; the partition
        /// between them is stripped; the two rooms must MERGE into one room id and their gas must
        /// re-equalise.
        ///
        /// The room-id merge is the load-bearing half: gas flow alone could equalise two rooms
        /// through a door, but only a topology change can make two room ids become one.
        ///
        /// MUTATION: delete <c>sim.Rooms.MarkDirty();</c> from
        /// <see cref="DeconstructSystem.Complete"/> → the tile opens but RoomState never refloods,
        /// the two ids stay distinct, and this fails on the merge assertion (the pressure
        /// assertion fails too, a tick later).
        /// </summary>
        [Test]
        public void StrippingAnInteriorBulkhead_MergesTheTwoRoomIds_AndEqualisesTheirPressure()
        {
            var sim = NewSim(TwoRooms, 11, out var strip);
            sim.Tick(); // rooms flooded

            var inA = new Int3(2, 2, 0);
            var inB = new Int3(8, 2, 0);
            ushort idA = sim.Rooms.RoomIdAt(sim.World, inA);
            ushort idB = sim.Rooms.RoomIdAt(sim.World, inB);
            Assert.That(idA, Is.Not.EqualTo(idB), "precondition: the partition really separates two rooms");
            Assert.That(idA, Is.Not.EqualTo(0)); Assert.That(idB, Is.Not.EqualTo(0));

            // Charge room A and empty room B — the "one side is a vacuum" case.
            var roomA = sim.Rooms.RoomAt(sim.World, inA);
            var roomB = sim.Rooms.RoomAt(sim.World, inB);
            RoomState.Pressurize(roomA);
            roomB.O2Moles = roomB.CO2Moles = roomB.N2Moles = 0;
            double pA = roomA.PressureKPa, pB = roomB.PressureKPa;
            Assert.That(pA, Is.GreaterThan(50.0), "precondition: A is pressurized");
            Assert.That(pB, Is.LessThan(1.0), "precondition: B is near-vacuum");
            double totalMolesBefore = roomA.TotalMoles + roomB.TotalMoles;

            // Strip the partition through the system's own completion path (no world poking).
            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);
            Assert.That(sim.PowerDirty, Is.False,
                "precondition: PowerSystem settled the networks on the tick above");
            Assert.That(strip.Complete(sim, Partition, 0u), Is.True);
            Assert.That(sim.World.GetWall(Partition), Is.EqualTo(0), "the bulkhead is gone");
            // Opening a wall changes what a conduit network can REACH, so the strip must re-dirty
            // power. Unpinned in WP-1 and the one of the reviewer's three probes with a real
            // consequence. MUTATION: delete `sim.PowerDirty = true;` from Complete → this fails.
            Assert.That(sim.PowerDirty, Is.True,
                "a wall that opens changes conduit reachability — PowerSystem must rebuild");

            for (int t = 0; t < 200; t++) sim.Tick(); // reflood + atmosphere settle

            ushort mergedA = sim.Rooms.RoomIdAt(sim.World, inA);
            ushort mergedB = sim.Rooms.RoomIdAt(sim.World, inB);
            Assert.That(mergedA, Is.EqualTo(mergedB),
                "the two compartments must be ONE room now — this is the bulkhead consequence, and " +
                "no amount of gas flow can produce it");
            Assert.That(mergedA, Is.Not.EqualTo(0), "and not the vacuum sink");

            var merged = sim.Rooms.RoomAt(sim.World, inA);
            Assert.That(merged.TileCount, Is.EqualTo(25),
                "12 + 12 tiles plus the freed partition tile — the merged room owns them all");
            Assert.That(merged.TotalMoles, Is.EqualTo(totalMolesBefore).Within(1e-6),
                "gas is CARRIED ACROSS the merge by tile overlap, not created or destroyed");
            Assert.That(merged.PressureKPa, Is.LessThan(pA).And.GreaterThan(pB),
                $"the charged side decompressed into the empty one (was {pA:F1}/{pB:F1} kPa, " +
                $"now {merged.PressureKPa:F1})");
        }

        // ============================================================== the full loop

        /// <summary>
        /// End to end through the DISPATCHER, not through the registry API: designate, a crew
        /// member is offered the job, walks, tears the wall down over the def-frozen work ticks,
        /// and the floored recovery drops as a loose stack ON the freed tile.
        ///
        /// Named for its limits: it runs the tear-down of ONE wall inside a bounded budget. It says
        /// nothing about a durable strip economy — that is WP-4's measurement.
        ///
        /// MUTATION: delete <c>sim.AddItem(WallSalvage, yield, pos)</c> from
        /// <see cref="DeconstructSystem.Complete"/> → the wall still opens, so a laxer test would
        /// pass, but the Regolith assertion fails: deconstruct would be pure destruction with no
        /// salvage, which is the whole economic point.
        /// </summary>
        [Test]
        public void FullLoop_OneWallTornDownByTheDispatcher_YieldsFlooredRecoveryOnTheFreedTile()
        {
            var sim = NewSim(TwoRooms, 42, out var strip);
            var worker = sim.AddCitizen("Ito", new Int3(2, 2, 0));
            sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.None), "precondition: idle, nothing to do");
            int regolithBefore = CountGround(sim, ItemKind.Regolith);
            Assert.That(regolithBefore, Is.EqualTo(0), "precondition: no salvage aboard yet");

            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);
            Assert.That(strip.TryGet(Partition, out var pending), Is.True);
            Assert.That(pending.WorkTicks, Is.EqualTo(SimDefs.Default.Deconstruct.WallWorkTicks),
                "work ticks are def-frozen at designate");

            // The dispatcher must OFFER it — that is the half a registry test cannot prove.
            for (int t = 0; t < 20 && worker.JobKind == JobKind.None; t++) sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct),
                "an idle crew member must be offered the strip job by JobSystem");
            Assert.That(worker.JobTarget, Is.EqualTo(Partition));

            for (int t = 0; t < 4000 && strip.Pending.Count > 0; t++) sim.Tick();

            Assert.That(strip.Pending, Is.Empty, "the site completed inside the budget");
            Assert.That(sim.World.GetWall(Partition), Is.EqualTo(0), "the wall is gone");
            Assert.That(sim.World.GetFloor(Partition), Is.EqualTo(TileDefs.Floor), "and it left deck");
            Assert.That((sim.World.GetFlags(Partition) & TileFlags.Walkable), Is.Not.EqualTo((TileFlags)0),
                "the freed tile is walkable — the crew can use what they opened");

            Assert.That(CountGround(sim, ItemKind.Regolith),
                Is.EqualTo(DeconstructSystem.WallYield(SimDefs.Default)));
            Assert.That(DeconstructSystem.WallYield(SimDefs.Default), Is.EqualTo(1),
                "floor(wall_material 2 × wall_recovery 0.5) = 1 — LOSSY, half of what building cost");
            var salvage = sim.Items.Items.First(i => i.Kind == ItemKind.Regolith);
            Assert.That(salvage.Pos, Is.EqualTo(Partition), "the salvage drops on the tile it came from");
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.None), "and the worker is free again");
        }

        /// <summary>
        /// Validate-on-arrival: a site whose wall vanished under the worker (another verb, a MOSS
        /// tile write, a second stripper) is CONSUMED without a world change and without a yield,
        /// rather than left pending forever for the same crew member to re-claim in a loop.
        ///
        /// MUTATION: delete <c>if (sim.World.GetWall(pos) != TileDefs.Wall) return true;</c> from
        /// <see cref="DeconstructSystem.Complete"/> → a Regolith stack appears out of a tile that
        /// was already open floor, and the yield assertion fails. That is matter from nowhere.
        /// </summary>
        [Test]
        public void Complete_OnATileThatStoppedBeingAWall_ConsumesTheSiteAndYieldsNothing()
        {
            var sim = NewSim(TwoRooms, 13, out var strip);
            sim.Tick();
            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);

            new SetTileCommand(Partition, floor: TileDefs.Floor, wall: 0).Execute(sim); // someone else opened it
            Assert.That(sim.World.GetWall(Partition), Is.EqualTo(0), "precondition: no wall left");

            Assert.That(strip.Complete(sim, Partition, 0u), Is.True, "the pending entry is consumed");
            Assert.That(strip.Pending, Is.Empty, "…so nothing loops on it");
            Assert.That(CountGround(sim, ItemKind.Regolith), Is.EqualTo(0),
                "no salvage from a wall that was not there");
        }

        /// <summary>
        /// The same validate-on-arrival guard for the HULL rule, which is the one that matters:
        /// a wall that BECAME hull between designate and completion (a neighbour opened onto
        /// vacuum) must not be torn down. Without the re-check, the guardrail is only as good as
        /// the world at designate time — and a strip takes two sim-minutes.
        ///
        /// MUTATION: delete <c>if (IsPressureHull(sim.World, pos)) return true;</c> from
        /// <see cref="DeconstructSystem.Complete"/> → the newly-hull wall is torn down and the
        /// "still a wall" assertion fails.
        /// </summary>
        [Test]
        public void Complete_OnAWallThatBecameHullMidJob_AbortsWithoutTearingItDown()
        {
            var sim = NewSim(TwoRooms, 17, out var strip);
            sim.Tick();
            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True,
                "precondition: legal, interior, not hull at designate time");

            // A neighbour of the partition opens onto vacuum while the worker is walking over.
            new SetTileCommand(new Int3(5, 1, 0), floor: TileDefs.Void, wall: 0).Execute(sim);
            Assert.That(DeconstructSystem.IsPressureHull(sim.World, Partition), Is.True,
                "precondition: the partition is now the pressure hull");

            Assert.That(strip.Complete(sim, Partition, 0u), Is.True, "the site is consumed…");
            Assert.That(sim.World.GetWall(Partition), Is.EqualTo(TileDefs.Wall),
                "…but the hull is NOT torn down: the guardrail re-checks on arrival, not only at designate");
            Assert.That(CountGround(sim, ItemKind.Regolith), Is.EqualTo(0));
        }

        // ============================================================== pre-emption

        /// <summary>
        /// E0-2's <c>SafetySystem</c> can pre-empt any job mid-work. A deconstruct holds NO item
        /// reservation and NO cargo, which is exactly why <c>Simulation.CancelJob</c> needs no
        /// deconstruct branch — verified here rather than assumed (the lane plan §3 asks for this
        /// explicitly). After the flee the SITE must still be pending and re-claimable, and no
        /// stack anywhere may be left reserved by the fled worker.
        ///
        /// MUTATION (applied, observed failing, reverted): delete <c>_assigned.Clear();</c> from
        /// <c>DeconstructJobSource.Rescan</c> — i.e. keep reservations in the source's own set
        /// instead of RE-DERIVING them from citizen state, which is the shape a source author
        /// reaches for first. The site then stays "assigned" to a crew member who is no longer on
        /// it, is never offered again, and the re-claim assertion fails.
        ///
        /// HONESTLY STATED LIMIT: the "still pending" and "nothing reserved" assertions are
        /// NEGATIVE invariants — no code today cancels a site or reserves a stack on pre-emption,
        /// so no single-line mutation of the shipped tree reddens them. They are pinned because
        /// WP-2's device strip is the change most likely to break both (a device claim is the
        /// obvious thing to reserve), and because <c>Simulation.CancelJob</c> has no deconstruct
        /// branch precisely on the strength of them. The RE-CLAIM assertion is the one that
        /// currently bites.
        /// </summary>
        [Test]
        public void FleePreemptionMidStrip_LeavesTheSiteStillPendingAndReclaimable_AndLeaksNothing()
        {
            var sim = NewSim(TwoRooms, 23, out var strip);
            var worker = sim.AddCitizen("Reyes", new Int3(2, 2, 0));
            sim.AddItem(ItemKind.Regolith, 3, new Int3(3, 3, 0)); // a bystander stack that must stay free
            sim.Tick();
            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);

            for (int t = 0; t < 400 && !(worker.JobKind == JobKind.Deconstruct && !worker.HasPath); t++)
                sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct), "precondition: on the job");
            Assert.That(worker.HasPath, Is.False, "precondition: arrived, counting down");
            Assert.That(worker.JobWorkTicks, Is.GreaterThan(0).And.LessThan(
                SimDefs.Default.Deconstruct.WallWorkTicks), "precondition: MID-work, not just claimed");

            // Exactly what SafetySystem does to a working crew member (SafetySystem.cs:96-102).
            sim.CancelJob(worker);
            worker.JobKind = JobKind.Flee;
            sim.Tick();

            Assert.That(strip.TryGet(Partition, out var still), Is.True,
                "the player's order must survive its worker being pulled off it");
            Assert.That(still.WorkTicks, Is.EqualTo(SimDefs.Default.Deconstruct.WallWorkTicks),
                "and the site's def-frozen budget is untouched — progress lived on the citizen");
            foreach (var it in sim.Items.Items)
                Assert.That(it.ReservedBy, Is.EqualTo(0u),
                    "a deconstruct reserves no stack, so a pre-emption can leak none");
            Assert.That(worker.CarryingItemId, Is.EqualTo(0u));

            // …and it is genuinely RE-CLAIMABLE: release the flee and the board offers it again.
            worker.JobKind = JobKind.None;
            worker.ClearPath();
            sim.JobsDirty |= JobBoardDirty.Citizens;
            for (int t = 0; t < 40 && worker.JobKind == JobKind.None; t++) sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct), "the site is re-offered");
            Assert.That(worker.JobWorkTicks, Is.EqualTo(SimDefs.Default.Deconstruct.WallWorkTicks),
                "and restarts from the full budget — half-done work is not banked on the site");
        }

        // ============================================================== save / restore

        /// <summary>
        /// The STRP chapter round-trips a POPULATED pending list (never an empty one — an empty
        /// blob round-trips trivially and proves nothing), and the loaded sim hashes bit-equal.
        /// The list carries BOTH kinds, so the device row exercises the one field a wall-only list
        /// leaves at zero for free: a non-zero <see cref="PendingDeconstruct.TargetId"/>.
        ///
        /// MUTATION: delete <c>writer.Write(s.TargetId);</c> from
        /// <see cref="DeconstructSystem.CaptureState"/> → RestoreState reads the next entry's X as
        /// a TargetId, the whole list desyncs, and both the count and the hash assertions fail.
        /// (Before WP-2 every shipped TargetId was 0, so this mutation cost only the desync; the
        /// device row makes the VALUE itself load-bearing.)
        /// </summary>
        [Test]
        public void StrpChapter_RoundTripsAPopulatedPendingList_OfBothKinds_BitExactly()
        {
            var map = new[] { "########", "#......#", "#.#.#..#", "#......#", "#.#....#", "########" };
            var sim = NewSim(map, 5, out var strip);
            sim.Tick();
            var device = sim.AddDevice(DeviceKind.WaterTank, new Int3(5, 1, 0), "tank_a");
            Assert.That(strip.Designate(sim, new Int3(4, 2, 0), DeconstructKind.Wall), Is.True);
            Assert.That(strip.Designate(sim, new Int3(2, 4, 0), DeconstructKind.Wall), Is.True);
            Assert.That(strip.Designate(sim, new Int3(2, 2, 0), DeconstructKind.Wall), Is.True);
            Assert.That(strip.Designate(sim, new Int3(5, 1, 0), DeconstructKind.Device), Is.True);
            Assert.That(strip.Pending, Has.Count.EqualTo(4), "precondition: a POPULATED list");
            Assert.That(strip.Pending.Any(s => s.TargetId != 0), Is.True,
                "precondition: at least one entry carries a NON-ZERO TargetId, or the field is free");

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;
            var loaded = SaveReader.Read(ms, StackNoNeeds(out var loadedStrip));

            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "the STRP chapter must round-trip every field the checksum folds");
            Assert.That(loadedStrip.Pending, Has.Count.EqualTo(4));
            Assert.That(loadedStrip.Pending.First(s => s.Kind == DeconstructKind.Device).TargetId,
                Is.EqualTo(device.Id), "the device site's target survived the round trip by VALUE");
            for (int i = 0; i < 4; i++)
            {
                Assert.That(loadedStrip.Pending[i].Pos, Is.EqualTo(strip.Pending[i].Pos),
                    "and in the SAME canonical packed-position order");
                Assert.That(loadedStrip.Pending[i].WorkTicks, Is.EqualTo(strip.Pending[i].WorkTicks));
                Assert.That(loadedStrip.Pending[i].Kind, Is.EqualTo(strip.Pending[i].Kind));
                Assert.That(loadedStrip.Pending[i].TargetId, Is.EqualTo(strip.Pending[i].TargetId));
            }
        }

        /// <summary>
        /// The stronger save gate (ECONOMY-PLAN §5.1): save MID-STRIP, load, run BOTH for 1000
        /// ticks, and they must still hash equal. A chapter can round-trip a snapshot and still
        /// desync the moment either side resumes.
        ///
        /// MUTATION (applied, observed failing, reverted): in
        /// <see cref="DeconstructSystem.RestoreState"/> write
        /// <c>WorkTicks = reader.ReadInt32() * 0,</c> — the int is still CONSUMED, so the byte
        /// stream stays in sync and only the value is lost → the snapshot assertion fails.
        ///
        /// HONESTLY STATED LIMIT so a reviewer does not hunt for one: no mutation available today
        /// fails ONLY the run-on half. The STRP fold covers every field the chapter saves, so
        /// anything that breaks the resume also breaks the snapshot. The run-on window is defence
        /// in depth for WP-2, which adds a field (the device target) whose restore CAN diverge
        /// later than tick 0.
        /// </summary>
        [Test]
        public void SaveMidStrip_ThenLoad_ThenRun1000Ticks_StaysBitIdentical()
        {
            var sim = NewSim(TwoRooms, 31, out var strip);
            sim.AddCitizen("Okafor", new Int3(2, 2, 0));
            sim.Tick();
            strip.Designate(sim, Partition, DeconstructKind.Wall);

            var worker = sim.Citizens.Items[0];
            int guard = 0;
            while (guard++ < 600 && !(worker.JobKind == JobKind.Deconstruct && !worker.HasPath &&
                   worker.JobWorkTicks < SimDefs.Default.Deconstruct.WallWorkTicks))
                sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct), "precondition: mid-strip");
            Assert.That(worker.JobWorkTicks, Is.LessThan(SimDefs.Default.Deconstruct.WallWorkTicks),
                "precondition: the countdown has actually started");

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;
            var loaded = SaveReader.Read(ms, StackNoNeeds(out _));
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "the snapshot matches");

            for (int t = 0; t < 1000; t++) { sim.Tick(); loaded.Tick(); }
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "resumed sims stay bit-identical over the §5.1 1000-tick window");

            // …and on past the completion, which is where a lost WorkTicks would finally show:
            // the two would tear the wall down on different ticks.
            for (int t = 0; t < 600; t++) { sim.Tick(); loaded.Tick(); }
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "resumed sims stay bit-identical ACROSS the completion");
            Assert.That(sim.World.GetWall(Partition), Is.EqualTo(0),
                "post-condition: the compared window actually contained the tear-down");
        }

        /// <summary>
        /// COMPAT (§3.3): a save written by a build WITHOUT a <see cref="DeconstructSystem"/> — so
        /// its file has no STRP chapter at all — must load into a build that has one, tick, and be
        /// indistinguishable from a save whose STRP chapter was present but empty. This is the
        /// guarantee that lets WP-2 bump the chapter later without touching old saves.
        ///
        /// MUTATION: give <see cref="DeconstructSystem"/> a field that <c>RestoreState</c>
        /// normalises but the constructor does not (e.g. <c>private int _n = 7;</c> folded in
        /// StateChecksum and zeroed in RestoreState) → the reference load runs RestoreState and
        /// normalises, the compat load never does, the two diverge, and this fails. That is the
        /// exact bug class §5.1 warns about.
        /// </summary>
        [Test]
        public void PreDeconstructSave_LoadsIntoADeconstructBuild_HashEqualToAnEmptyChapterLoad()
        {
            byte[] SaveOf(bool withDeconstruct)
            {
                var stack = StackNoNeeds(out _);
                if (!withDeconstruct) stack = stack.Where(s => !(s is DeconstructSystem)).ToArray();
                var sim = new Simulation(AsciiWorld.Build(TwoRooms), 13, stack);
                sim.AddCitizen("Ada", new Int3(2, 2, 0));
                sim.AddItem(ItemKind.Regolith, 5, new Int3(3, 2, 0));
                for (int i = 0; i < 200; i++) sim.Tick();
                var ms = new MemoryStream();
                SaveWriter.Write(sim, ms);
                return ms.ToArray();
            }

            byte[] preE05 = SaveOf(withDeconstruct: false); // no STRP chapter at all
            byte[] withEmpty = SaveOf(withDeconstruct: true);

            ulong LoadTick(byte[] bytes)
            {
                Simulation loaded = null;
                Assert.DoesNotThrow(() => loaded = SaveReader.Read(new MemoryStream(bytes), StackNoNeeds(out _)),
                    "a save missing the STRP chapter must load into the E0-5 build");
                for (int i = 0; i < 500; i++) loaded.Tick();
                return loaded.StateHash();
            }

            Assert.That(LoadTick(preE05), Is.EqualTo(LoadTick(withEmpty)),
                "a missing STRP chapter loads as exactly-empty deconstruct state");
        }

        // ============================================================== hash honesty

        /// <summary>
        /// HASH HONESTY (§5.1) over every field the STRP fold claims to cover. Twins are proven
        /// hash-EQUAL first (otherwise "the hash changed" proves nothing), then exactly one field
        /// is mutated on one twin — through <see cref="DeconstructSystem.RestoreState"/>, so
        /// arbitrary Kind/TargetId values are reachable without a designate path that rejects them.
        ///
        /// MUTATION: delete any one <c>XxHash64.Combine</c> line from
        /// <see cref="DeconstructSystem.StateChecksum"/> → exactly that row fails. Delete the
        /// <c>Pack(s.Pos)</c> line → all three position rows fail.
        /// </summary>
        [Test]
        public void EveryPendingDeconstructField_MovesTheStateHash()
        {
            var baseline = new PendingDeconstruct
            {
                Pos = new Int3(3, 4, 1), Kind = DeconstructKind.Wall, WorkTicks = 1200, TargetId = 7,
            };

            void Row(string field, PendingDeconstruct mutated)
            {
                ulong a = HashOfInjected(baseline);
                ulong b = HashOfInjected(baseline);
                Assert.That(a, Is.EqualTo(b), "precondition: twins hash equal before any mutation");
                Assert.That(HashOfInjected(mutated), Is.Not.EqualTo(a),
                    $"PendingDeconstruct.{field} is not folded into StateHash");
            }

            Row("Pos.X", With(baseline, pos: new Int3(4, 4, 1)));
            Row("Pos.Y", With(baseline, pos: new Int3(3, 5, 1)));
            Row("Pos.Z", With(baseline, pos: new Int3(3, 4, 0)));
            Row("Kind", With(baseline, kind: DeconstructKind.Device));
            Row("WorkTicks", With(baseline, workTicks: 1201));
            Row("TargetId", With(baseline, targetId: 8));
        }

        /// <summary>
        /// The COLLISION PAIR the per-field table structurally cannot find (§5.1 — "a per-field
        /// table would NOT have caught either W0-1 alias"). <c>Kind</c> and <c>TargetId</c> are the
        /// two fields a future author is most likely to pack into one word to save a Combine;
        /// under <c>(ulong)kind | ((ulong)targetId &lt;&lt; 0)</c> — or any pack where Kind's byte
        /// overlaps TargetId's low bits — these two GENUINELY DIFFERENT sites hash IDENTICALLY.
        /// Under the shipped one-field-per-Combine fold they must not.
        ///
        /// MUTATION: replace the Kind and TargetId Combines in
        /// <see cref="DeconstructSystem.StateChecksum"/> with the single line
        /// <c>h = XxHash64.Combine(h, (ulong)(byte)s.Kind | (ulong)s.TargetId);</c> → the pair
        /// collides (1|0 == 0|1) and this fails while the per-field table above still passes.
        /// </summary>
        [Test]
        public void Aliased_KindAndTargetId_AreNotTheSameWord()
        {
            var pos = new Int3(3, 4, 1);
            ulong deviceKindNoTarget = HashOfInjected(new PendingDeconstruct
            { Pos = pos, Kind = DeconstructKind.Device, WorkTicks = 900, TargetId = 0 });
            ulong wallKindTargetOne = HashOfInjected(new PendingDeconstruct
            { Pos = pos, Kind = DeconstructKind.Wall, WorkTicks = 900, TargetId = 1 });

            Assert.That(deviceKindNoTarget, Is.Not.EqualTo(wallKindTargetOne),
                "(Device, target 0) and (Wall, target 1) are different ship states and must hash differently");
        }

        /// <summary>
        /// The registration itself must genuinely fold — otherwise "registered" is a lie and WP-2's
        /// bump would move nothing. Drives the REAL default stack against one with exactly the
        /// DeconstructSystem removed. Also pins that 'STRP' spells its chapter.
        ///
        /// MUTATION: delete <c>new DeconstructSystem()</c> from <see cref="SystemStack"/> →
        /// "default" and "default minus Deconstruct" become the same stack and the inequality fails.
        /// </summary>
        [Test]
        public void DeconstructSystem_IsRegistered_AndFoldsItsSeedIntoStateHash()
        {
            Assert.That(new string(new[]
            {
                (char)((DeconstructSystem.Seed >> 24) & 0xFF), (char)((DeconstructSystem.Seed >> 16) & 0xFF),
                (char)((DeconstructSystem.Seed >> 8) & 0xFF), (char)(DeconstructSystem.Seed & 0xFF),
            }), Is.EqualTo("STRP"), $"seed 0x{DeconstructSystem.Seed:X8} must decode to \"STRP\"");

            ulong HashOf(ISimSystem[] systems)
            {
                var sim = new Simulation(AsciiWorld.Build(TwoRooms), 7, systems);
                sim.AddCitizen("Ada", new Int3(2, 2, 0));
                sim.AddItem(ItemKind.Regolith, 5, new Int3(3, 2, 0));
                for (int i = 0; i < 50; i++) sim.Tick();
                return sim.StateHash();
            }

            ulong full = HashOf(StackNoNeeds(out _));
            Assert.That(HashOf(StackNoNeeds(out _)), Is.EqualTo(full), "two default stacks are twins");

            var minus = StackNoNeeds(out _).Where(s => !(s is DeconstructSystem)).ToArray();
            Assert.That(minus.Length, Is.EqualTo(StackNoNeeds(out _).Length - 1),
                "exactly one DeconstructSystem is registered");
            Assert.That(HashOf(minus), Is.Not.EqualTo(full),
                "dropping the DeconstructSystem must change StateHash — its seed must genuinely fold");
        }

        // ============================================================== determinism / cost

        /// <summary>
        /// Twin determinism with live strip work: two identical sims, one crew member, one
        /// designation, compared every 250 ticks across the completion.
        ///
        /// MUTATION (applied, observed failing, reverted): in <c>DeconstructJobSource</c>, change
        /// <c>private bool _stripResolved;</c> to <c>private static bool _stripResolved;</c> — the
        /// accidental-static bug class, ONE KEYWORD, on <c>BeginTick</c>, which runs every tick of
        /// every sim. The twins then share the "have I found my DeconstructSystem yet" latch: x
        /// resolves first and sets it, y reads it as already-done and keeps a null registry, so y
        /// never offers the job, never tears the wall down, and the hashes part company.
        /// (<c>private static DeconstructSystem _strip;</c> reddens it the same way, for the
        /// symmetric reason — y's source ends up driving x's registry.)
        ///
        /// TWO MUTATIONS THAT DO NOT REDDEN IT, measured, so nobody re-proposes them: making
        /// <c>_tried</c> or <c>_assigned</c> static. Both are rebuilt or written only on paths this
        /// scenario never takes — the single partition is claimed on the first attempt, so nothing
        /// is ever stamped as refused, and <c>_assigned</c> is cleared and refilled by each sim's
        /// own Rescan before it is read.
        ///
        /// HONESTLY STATED LIMIT — WP-1's doc comment named a mutation that CANNOT fail this test,
        /// and a reviewer measured it three ways. It claimed "make <c>Select</c> iterate
        /// <c>_retryAt</c> instead of probing it". Two independent faithful readings of that
        /// mutation passed, and instrumenting <c>Select</c> to THROW whenever
        /// <c>_retryAt.Count > 0</c> also passed: <c>_retryAt</c> is empty for this entire run,
        /// because the single partition is reachable on the first claim, so the named path never
        /// executes at all. More generally, a twin test cannot catch Dictionary/HashSet iteration
        /// order in .NET — two identically-constructed dictionaries fed identical insertions
        /// enumerate identically, so BOTH twins would take the same wrong order and still agree.
        /// The no-foreach-over-Dictionary rule is an integrator grep, not something this shape can
        /// enforce. What this test genuinely catches is state that is shared or non-reproducible
        /// ACROSS sim instances — statics, wall-clock, ambient RNG — which is what the mutation
        /// above injects.
        /// </summary>
        [Test]
        public void TwinRuns_WithALiveStripJob_StayHashIdentical()
        {
            Simulation Make(ulong seed)
            {
                var sim = NewSim(TwoRooms, seed, out var strip);
                sim.AddCitizen("Twin", new Int3(2, 2, 0));
                sim.Tick();
                strip.Designate(sim, Partition, DeconstructKind.Wall);
                return sim;
            }

            var x = Make(77);
            var y = Make(77);
            Assert.That(x.StateHash(), Is.EqualTo(y.StateHash()), "twins start identical");
            for (int t = 1; t <= 2000; t++)
            {
                x.Tick(); y.Tick();
                if (t % 250 == 0)
                    Assert.That(x.StateHash(), Is.EqualTo(y.StateHash()), $"twins diverged at tick {t}");
            }
            Assert.That(x.World.GetWall(Partition), Is.EqualTo(0),
                "precondition on the whole test: the twins actually DID the work being compared");
        }

        /// <summary>
        /// Zero-alloc steady state — over a POPULATED board with a worker mid-countdown, not an
        /// empty one. The precondition assertions are the point: a zero-alloc test over a board
        /// that was never filled is a tautology (§5.1), and this is the shape that catches an
        /// allocation in <c>Progress</c>, which is the only deconstruct code that runs every tick.
        ///
        /// MUTATION: add <c>var _ = new byte[1];</c> to <c>DeconstructJobSource.Progress</c> →
        /// ~48 KB over the measured window and the == 0 assertion fails. Remove the two
        /// precondition assertions instead and the test becomes the tautology it is guarding
        /// against — which is why they are assertions, not comments.
        /// </summary>
        [Test]
        public void ZeroAllocSteadyState_WithAPopulatedBoardAndAWorkerMidCountdown()
        {
            var sim = new Simulation(AsciiWorld.Build(TwoRooms), 1,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), new DeconstructSystem() });
            DeconstructSystem strip = null;
            foreach (var s in sim.Systems) if (s is DeconstructSystem d) strip = d;
            var worker = sim.AddCitizen("Idle", new Int3(2, 2, 0)); // AutoWander false → never self-moves
            sim.Tick();
            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);

            for (int t = 0; t < 400 && !(worker.JobKind == JobKind.Deconstruct && !worker.HasPath); t++)
                sim.Tick();

            // PRECONDITIONS — without these the measurement below proves nothing.
            var source = ((JobSystem)sim.Systems[1]).Sources.First(s => s is DeconstructJobSource);
            Assert.That(source.CandidateCount, Is.EqualTo(1), "the strip board is POPULATED");
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct),
                "and a worker is actually on it, so Progress runs on every measured tick");
            Assert.That(worker.HasPath, Is.False, "arrived — the measured path is the work countdown");
            Assert.That(worker.JobWorkTicks, Is.GreaterThan(1000),
                "and it will NOT complete inside the measured window (completion legitimately allocates)");

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int i = 0; i < 1000; i++) sim.Tick();
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct),
                "post-condition: still counting down, so the window measured the steady state");
            Assert.That(delta, Is.EqualTo(0),
                $"the deconstruct tick path must not allocate, saw {delta} bytes");
        }

        // ============================================================== defs

        /// <summary>
        /// DEF-FIELD CONSUMPTION TRIPWIRES — one per shipped <c>[deconstruct]</c> field. Each
        /// retunes the value through the REAL parser and proves the SYSTEM's behaviour follows,
        /// which is what makes the field a tunable rather than decoration. Also the mutation probe:
        /// a retuned value must move the defs checksum (parser key + fold, both present).
        ///
        /// MUTATION: delete the <c>case "wall_recovery":</c> line from
        /// <c>DefsParser.DeconstructKey</c> → the parse reports an unknown key, <c>problems</c> is
        /// non-empty and the yield stays 1. Delete the <c>Deconstruct.WallWorkTicks</c> fold from
        /// <c>SimDefs.ComputeChecksum</c> → the checksum-moved assertion for that field fails.
        /// Hard-code <c>WorkTicks = 1200</c> in <c>DeconstructSystem.Designate</c> → the
        /// wall_work_ticks tripwire fails.
        /// MUTATION (WP-2): delete the <c>Deconstruct.DeviceParts</c> fold → the device_parts
        /// checksum row fails. Hard-code <c>2</c> in <see cref="DeconstructSystem.DeviceYield"/> →
        /// the device_parts yield row fails. Drop the <c>kind == Wall ? … : …</c> ternary in
        /// <c>Designate</c> → the device_work_ticks row fails.
        /// </summary>
        [Test]
        public void EveryDeconstructDefField_IsActuallyConsumed_AndMovesTheChecksum()
        {
            SimDefs Tuned(string body)
            {
                var problems = new List<string>();
                var d = DefsParser.Parse(new[] { ("deconstruct.def", "[deconstruct]\n" + body) }, problems);
                Assert.That(problems, Is.Empty, "the tuned file must parse cleanly: " + string.Join(" | ", problems));
                Assert.That(d.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum),
                    "a retuned deconstruct value must move the defs checksum (parser key + fold)");
                return d;
            }

            // wall_recovery: the yield is floor(wall_material × recovery). 0.5 → 1, 1.0 → 2, 0.4 → 0.
            Assert.That(DeconstructSystem.WallYield(SimDefs.Default), Is.EqualTo(1), "shipped default");
            Assert.That(DeconstructSystem.WallYield(Tuned("wall_recovery = 1.0\n")), Is.EqualTo(2),
                "a full-recovery ship returns everything the wall cost");
            Assert.That(DeconstructSystem.WallYield(Tuned("wall_recovery = 0.4\n")), Is.EqualTo(0),
                "and the floor is a real floor: 2 × 0.4 = 0.8 → nothing");

            // wall_work_ticks: def-frozen onto the site at designate.
            var fast = Tuned("wall_work_ticks = 17\n");
            var sim = NewSim(TwoRooms, 2, out var strip, fast);
            sim.Tick();
            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);
            Assert.That(strip.Pending[0].WorkTicks, Is.EqualTo(17),
                "DeconstructSystem must read sim.Defs.Deconstruct.WallWorkTicks, not a const");

            // max_staged: the concurrency cap.
            var capped = Tuned("max_staged = 1\n");
            var map = new[] { "########", "#......#", "#.#.#..#", "#......#", "########" };
            var sim2 = NewSim(map, 2, out var strip2, capped);
            sim2.Tick();
            Assert.That(strip2.Designate(sim2, new Int3(2, 2, 0), DeconstructKind.Wall), Is.True);
            Assert.That(strip2.Designate(sim2, new Int3(4, 2, 0), DeconstructKind.Wall), Is.False,
                "max_staged = 1 must reject the second designation");
            Assert.That(strip2.Pending, Has.Count.EqualTo(1));

            // --- WP-2's two device fields, same ritual. ---

            // device_parts: the base the Condition scaling multiplies.
            var rich = Tuned("device_parts = 7\n");
            var probe = NewSim(TwoRooms, 3, out _, rich);
            var machine = probe.AddDevice(DeviceKind.Fabricator, MachineTile, "fab_probe");
            Assert.That(DeconstructSystem.DeviceYield(rich, machine), Is.EqualTo(7),
                "DeviceYield must read sim.Defs.Deconstruct.DeviceParts, not a const");
            machine.Condition = 0.5f;
            Assert.That(DeconstructSystem.DeviceYield(rich, machine), Is.EqualTo(3),
                "…and still floor(7 × 0.5) = 3, so the retune flows through the scaling too");

            // device_work_ticks: def-frozen onto a DEVICE site at designate, independently of walls.
            var slow = Tuned("device_work_ticks = 23\n");
            var sim3 = NewSim(TwoRooms, 4, out var strip3, slow);
            sim3.AddDevice(DeviceKind.Scrubber, MachineTile, "scrub_probe");
            sim3.Tick();
            Assert.That(strip3.Designate(sim3, MachineTile, DeconstructKind.Device), Is.True);
            Assert.That(strip3.Pending[0].WorkTicks, Is.EqualTo(23),
                "a device site freezes device_work_ticks…");
            Assert.That(strip3.Designate(sim3, Partition, DeconstructKind.Wall), Is.True);
            Assert.That(strip3.TryGet(Partition, out var wallSite), Is.True);
            Assert.That(wallSite.WorkTicks, Is.EqualTo(slow.Deconstruct.WallWorkTicks),
                "…and a wall site on the SAME sim is unaffected by it");
        }

        /// <summary>
        /// The live de-DE hazard on the section's one decimal value: under a comma-decimal locale a
        /// bare <c>float.Parse("0.5")</c> yields FIVE, which would make a stripped wall return ten
        /// Regolith — a matter printer. Parsed under an explicitly German culture.
        ///
        /// MUTATION: change <c>F()</c>'s parse in <c>DefsParser</c> to
        /// <c>float.TryParse(s, out r)</c> (dropping InvariantCulture) → wall_recovery reads 5,
        /// the yield becomes 10, and both assertions fail.
        /// </summary>
        [Test]
        public void WallRecovery_ParsesAsOneHalf_UnderGermanLocale()
        {
            var previous = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                var problems = new List<string>();
                var d = DefsParser.Parse(new[] { ("d.def", "[deconstruct]\nwall_recovery = 0.5\n") }, problems);
                Assert.That(problems, Is.Empty);
                Assert.That(d.Deconstruct.WallRecovery, Is.EqualTo(0.5f));
                Assert.That(DeconstructSystem.WallYield(d), Is.EqualTo(1),
                    "and the consumer agrees: half of a 2-Regolith wall is 1, not 10");
            }
            finally
            {
                Thread.CurrentThread.CurrentCulture = previous;
            }
        }

        // ============================================================== the E2 boundary

        /// <summary>
        /// DELIBERATELY NOT WIDENED (lane plan §3): <c>EffectValidator.ApplyAgreeTask</c>'s job
        /// whitelist stays <see cref="JobKind.Dig"/>-only. An LLM-driven crew member cannot agree
        /// to a <see cref="JobKind.Deconstruct"/>, because that escape hatch is E2's brief and
        /// widening it here would ship an un-reviewed way for a model to reshape the ship's
        /// topology. A test rather than a commit-message claim, so widening it later is a
        /// deliberate red test and not an accident.
        ///
        /// CONSTRUCTED SO THE WHITELIST IS THE ONLY THING REFUSING. The effect names a DESIGNATED
        /// DEBRIS tile — a perfectly legal, adjacent, unclaimed DIG target — and differs from an
        /// accepted effect in exactly one field: <c>Job</c>. Pointing it at a wall instead would
        /// have been refused by the debris precondition three lines later, and the test would have
        /// passed with the whitelist wide open (measured: it did, on this file's first draft).
        ///
        /// THE FINDING THIS PINS, which is worse than "not yet supported": <c>ApplyAgreeTask</c>
        /// hard-assigns <c>citizen.JobKind = JobKind.Dig</c> at the end regardless of
        /// <c>e.Job</c>. So a careless one-line widening does not grant a deconstruct — it grants
        /// a DIG on the agreed tile. E2 must widen the assignment and the target predicate too,
        /// not just the guard.
        ///
        /// MUTATION (applied, observed failing, reverted): change
        /// <c>if (e.Job != JobKind.Dig) return false;</c> to
        /// <c>if (e.Job != JobKind.Dig &amp;&amp; e.Job != JobKind.Deconstruct) return false;</c>
        /// → the effect is accepted, a Dig job is granted, and both assertions fail.
        /// </summary>
        [Test]
        public void AgreeTask_RefusesDeconstruct_EvenOnATileItWouldHaveAcceptedForDig()
        {
            // A designated debris tile: everything ApplyAgreeTask asks for EXCEPT the job kind.
            var map = new[] { "#######", "#.....#", "#..R..#", "#.....#", "#######" };
            var debris = new Int3(3, 2, 0);
            var sim = NewSim(map, 4, out _);
            var crew = sim.AddCitizen("Vale", new Int3(2, 2, 0));
            sim.Tick();
            new DesignateDigCommand(debris, on: true).Execute(sim);
            Assert.That((sim.World.GetFlags(debris) & TileFlags.Designated), Is.Not.EqualTo((TileFlags)0),
                "precondition: designated");
            Assert.That(sim.World.GetWall(debris), Is.EqualTo(TileDefs.Debris), "precondition: debris");
            Assert.That(crew.JobKind, Is.EqualTo(JobKind.None), "precondition: off-job");

            var minds = new MindState();
            minds.Minds.GetOrCreate(crew.Id);
            var facts = new FactRegistry();
            var validator = new EffectValidator();

            bool asDeconstruct = validator.TryApply(sim, minds, facts,
                new AgreeTask(crew.Id, JobKind.Deconstruct, debris));
            Assert.That(asDeconstruct, Is.False, "AgreeTask must stay Dig-only until E2 says otherwise");
            Assert.That(crew.JobKind, Is.EqualTo(JobKind.None), "and no job may have been granted");

            // The control that makes the refusal meaningful: the SAME effect with Job = Dig is
            // accepted, so the tile really was legal and the whitelist really is what refused.
            Assert.That(validator.TryApply(sim, minds, facts, new AgreeTask(crew.Id, JobKind.Dig, debris)),
                Is.True, "control: this exact target IS an acceptable dig agreement");
            Assert.That(crew.JobKind, Is.EqualTo(JobKind.Dig));
        }

        // ========================================================= device strip (E0-5 WP-2)

        /// <summary>A floor tile inside room A of <see cref="TwoRooms"/> — where the device tests
        /// stand their machine. Room A because the two rooms have NO DOOR between them, so a
        /// machine in room B would be genuinely unreachable and the dispatcher loop could never
        /// close (measured: it does not).</summary>
        private static readonly Int3 MachineTile = new Int3(3, 3, 0);

        /// <summary>The device kinds a TILE-ADDRESSED verb can name: everything except the utility
        /// overlays, which <see cref="Simulation.IsUtilityOverlay"/> keeps out of the device grid
        /// because they share a tile with a machine.</summary>
        private static IEnumerable<DeviceKind> GridAddressableKinds()
        {
            foreach (DeviceKind k in Enum.GetValues(typeof(DeviceKind)))
                if (!Simulation.IsUtilityOverlay(k)) yield return k;
        }

        /// <summary>
        /// THE LEGALITY RULE (lane plan §5): <b>any device is strippable EXCEPT a
        /// <see cref="DeviceKind.Door"/> and an OCCUPIED <see cref="DeviceKind.CryoPod"/></b> —
        /// walked over EVERY grid-addressable kind rather than
        /// a sample, so a kind added later is refused-or-accepted by a rule and not by luck. Life
        /// support (<see cref="DeviceKind.Scrubber"/>, <see cref="DeviceKind.AirVent"/>) is
        /// deliberately INCLUDED: stripping the scrubber to make rent is the game.
        ///
        /// <para>⚠️ THE SECOND EXCLUSION ARRIVED WITH THE WRECK START AND THIS TEST IS HOW IT WAS
        /// NOTICED — it went red on a lane that had only meant to touch one ship. That is the guard
        /// working: "the exclusion set is exactly {Door}" was a claim, and widening the set has to
        /// be a deliberate edit here rather than a silent one in <c>CanDesignate</c>.
        ///
        /// The two exclusions rest on DIFFERENT arguments and the test keeps them separable. A door
        /// is excluded by KIND, because it has another owner (<c>BuildSystem</c> spawns it, so its
        /// inverse is build-cancel). A capsule is excluded by STATE, because there is a person
        /// inside it — so a CryoPod is walked TWICE here, refused while closed and then accepted
        /// once opened, which is what stops the rule degenerating into "CryoPod is un-strippable"
        /// and quietly deleting a verb.</para>
        ///
        /// Also pins the two things <see cref="DeconstructSystem.Designate"/> resolves SIM-SIDE:
        /// the device id (from the tile — the player clicks a tile, never an entity id) and the
        /// kind-dependent def-frozen work budget.
        ///
        /// MUTATION: drop the <c>Kind == Door</c> refusal → the Door row fails, and build's output
        /// acquires a second owner for its lifetime.
        /// MUTATION: drop the <c>Kind == CryoPod &amp;&amp; !IsOpen</c> refusal → the closed-capsule
        /// row fails, and a sleeper can be condemned with a drag of the STRIP palette.
        /// MUTATION: set <c>targetId = 0</c> in <c>Designate</c> → the TargetId row fails and every
        /// device site becomes unfinishable. MUTATION: drop the <c>kind == Wall ? … : …</c> ternary
        /// on <c>WorkTicks</c> → the 900-vs-1200 row fails and <c>device_work_ticks</c> is
        /// decoration.
        /// </summary>
        [Test]
        public void Designate_AcceptsEveryGridDeviceKindExceptDoorAndAnOccupiedCapsule_AndResolvesTargetIdFromTheTile()
        {
            int accepted = 0, refused = 0;
            foreach (var kind in GridAddressableKinds())
            {
                var sim = NewSim(TwoRooms, 101, out var strip);
                sim.Tick();
                var device = sim.AddDevice(kind, MachineTile, "unit_" + kind.ToString().ToLowerInvariant());
                Assert.That(sim.TryGetDeviceAt(MachineTile, out _), Is.True,
                    $"precondition: {kind} really entered the device grid");

                bool ok = strip.Designate(sim, MachineTile, DeconstructKind.Device);
                if (kind == DeviceKind.Door)
                {
                    Assert.That(ok, Is.False,
                        "a Door is BuildSystem's output — its inverse is build-cancel, not strip");
                    Assert.That(strip.Pending, Is.Empty);
                    refused++;
                    continue;
                }

                // A CAPSULE IS EXCLUDED BY STATE, NOT BY KIND. `AddDevice` leaves IsOpen false, so
                // the device above is an OCCUPIED pod and must be refused; opening it makes it
                // empty furniture and it then walks the accepted path below like every other kind.
                // Both halves matter: without the first the sleeper is strippable, without the
                // second "refuse CryoPod" would pass and a verb would have been deleted.
                if (kind == DeviceKind.CryoPod)
                {
                    Assert.That(ok, Is.False,
                        "an OCCUPIED cryo capsule holds a person — stripping it deletes a crew " +
                        "member for 1 Part, with no undo on any client surface");
                    Assert.That(strip.Pending, Is.Empty);
                    refused++;

                    device.IsOpen = true;
                    ok = strip.Designate(sim, MachineTile, DeconstructKind.Device);
                }

                Assert.That(ok, Is.True,
                    $"{kind} must be strippable — the rule is 'anything but a door or an occupied capsule'");
                Assert.That(strip.TryGet(MachineTile, out var site), Is.True);
                Assert.That(site.Kind, Is.EqualTo(DeconstructKind.Device));
                Assert.That(site.TargetId, Is.EqualTo(device.Id),
                    "the id is resolved from the TILE by the sim, not supplied by the caller");
                Assert.That(site.WorkTicks, Is.EqualTo(SimDefs.Default.Deconstruct.DeviceWorkTicks),
                    "a device site freezes device_work_ticks, not wall_work_ticks");
                accepted++;
            }

            Assert.That(refused, Is.EqualTo(2),
                "exactly two things are excluded: the Door (by KIND) and an occupied CryoPod (by " +
                "STATE). A third refusal means someone widened the rule — say why, here, in the " +
                "same commit.");
            Assert.That(accepted, Is.EqualTo(Enum.GetValues(typeof(DeviceKind)).Length - 3),
                "every kind except Door, Conduit and Pipe (the two overlays are not grid-addressable) " +
                "— CryoPod counts once here, via its OPEN form, which is why the refusal above did " +
                "not cost the accepted census a row");
            Assert.That(SimDefs.Default.Deconstruct.DeviceWorkTicks,
                Is.Not.EqualTo(SimDefs.Default.Deconstruct.WallWorkTicks),
                "precondition on the WorkTicks row above: the two budgets must differ, or it proves nothing");

            // The overlays, pinned as a CONSEQUENCE of the device grid, not as a designed rule.
            var overlay = NewSim(TwoRooms, 102, out var oStrip);
            overlay.Tick();
            overlay.AddDevice(DeviceKind.Conduit, MachineTile, "conduit_b");
            Assert.That(overlay.TryGetDeviceAt(MachineTile, out _), Is.False,
                "utility overlays never enter the device grid (Simulation.IsUtilityOverlay)");
            Assert.That(oStrip.Designate(overlay, MachineTile, DeconstructKind.Device), Is.False,
                "so a tile-addressed strip cannot name a conduit — an honest limit, not a rule");
        }

        /// <summary>
        /// End to end through the DISPATCHER: designate a scrubber, a crew member walks over,
        /// spends <c>device_work_ticks</c>, and the machine is GONE — off the grid, off the tile
        /// flags, out of the entity store — leaving <c>floor(device_parts × Condition)</c> Parts
        /// where it stood.
        ///
        /// Named for its limits: ONE device, inside a bounded tick budget, on a synthetic two-room
        /// map. It says nothing about a durable strip economy — that is WP-4's measurement.
        ///
        /// MUTATION: delete <c>if (deviceYield > 0) sim.AddItem(DeviceSalvage, deviceYield, pos);</c>
        /// → the machine still vanishes (so a laxer test would pass) but the Parts assertion fails:
        /// device strip would be pure destruction, and <c>Condition</c> would gain no consumer.
        /// MUTATION: replace <c>sim.RemoveDevice(site.TargetId)</c> with
        /// <c>sim.Devices.Remove(site.TargetId)</c> → the entity goes but the device GRID and
        /// <see cref="TileFlags.HasDevice"/> keep a dangling reference, and the two flag assertions
        /// fail. That is the corruption the plan asked to be checked for by name.
        /// </summary>
        [Test]
        public void FullLoop_OneScrubberStrippedByTheDispatcher_LeavesNoDeviceStateAndDropsParts()
        {
            var sim = NewSim(TwoRooms, 43, out var strip);
            var worker = sim.AddCitizen("Ito", new Int3(2, 2, 0));
            var scrubber = sim.AddDevice(DeviceKind.Scrubber, MachineTile, "scrub_b");
            sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.None), "precondition: idle, nothing to do");
            Assert.That(CountGround(sim, ItemKind.Parts), Is.EqualTo(0), "precondition: no Parts aboard");
            Assert.That(scrubber.Condition, Is.EqualTo(1f), "precondition: pristine, so the yield is full");
            int topologyBefore = sim.DeviceTopologyVersion;

            Assert.That(strip.Designate(sim, MachineTile, DeconstructKind.Device), Is.True);

            for (int t = 0; t < 20 && worker.JobKind == JobKind.None; t++) sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct),
                "an idle crew member must be offered the device strip by JobSystem");
            Assert.That(worker.JobTarget, Is.EqualTo(MachineTile));

            for (int t = 0; t < 3000 && strip.Pending.Count > 0; t++) sim.Tick();

            Assert.That(strip.Pending, Is.Empty, "the site completed inside the budget");
            Assert.That(sim.Devices.TryGet(scrubber.Id, out _), Is.False, "the entity is gone");
            Assert.That(sim.TryGetDeviceAt(MachineTile, out _), Is.False,
                "…and so is its device-grid entry (RemoveDevice owns both)");
            Assert.That(sim.World.GetFlags(MachineTile) & TileFlags.HasDevice, Is.EqualTo((TileFlags)0),
                "…and the tile no longer claims to hold a device");
            Assert.That(sim.DeviceTopologyVersion, Is.GreaterThan(topologyBefore),
                "derived topologies (fluid networks) must see the removal");

            Assert.That(CountGround(sim, ItemKind.Parts),
                Is.EqualTo(DeconstructSystem.DeviceYield(SimDefs.Default, scrubber)));
            Assert.That(DeconstructSystem.DeviceYield(SimDefs.Default, scrubber), Is.EqualTo(2),
                "floor(device_parts 2 × Condition 1.0) = 2 Parts — exactly two maintenance overhauls");
            var salvage = sim.Items.Items.First(i => i.Kind == ItemKind.Parts);
            Assert.That(salvage.Pos, Is.EqualTo(MachineTile), "the parts drop where the machine stood");
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.None), "and the worker is free again");
        }

        /// <summary>
        /// <c>floor(device_parts × Condition)</c>, measured across the whole range — and the row
        /// that matters is the LAST one: a machine below half condition is worth NOTHING. That is
        /// what gives <see cref="Device.Condition"/> its second consumer in the repo (every reader
        /// outside <c>MachineWearSystem</c> is display-only) and what makes letting a machine rot
        /// a decision with a price.
        ///
        /// MUTATION: change <c>Math.Floor</c> to <c>Math.Round</c> in
        /// <see cref="DeconstructSystem.DeviceYield"/> → the 0.49 row returns 1 instead of 0 and
        /// fails; a wreck becomes worth as much as a working machine.
        /// MUTATION: delete <c>if (condition > 1.0) condition = 1.0;</c> → the over-unity row
        /// returns 3 and fails: Condition is a bare public float, and an out-of-range value must
        /// never mint more Parts than <c>device_parts</c>.
        /// </summary>
        [Test]
        public void DeviceYield_FloorsPartsByCondition_SoAMachineBelowHalfIsWorthNothing()
        {
            var sim = NewSim(TwoRooms, 44, out _);
            var d = sim.AddDevice(DeviceKind.Fabricator, MachineTile, "fab_b");

            int YieldAt(float condition) { d.Condition = condition; return DeconstructSystem.DeviceYield(SimDefs.Default, d); }

            Assert.That(SimDefs.Default.Deconstruct.DeviceParts, Is.EqualTo(2),
                "precondition: the rows below are read against device_parts = 2");
            Assert.That(YieldAt(1.00f), Is.EqualTo(2), "pristine: the full base value");
            Assert.That(YieldAt(0.75f), Is.EqualTo(1), "floor(1.5) — three quarters of a machine is one Part");
            Assert.That(YieldAt(0.50f), Is.EqualTo(1), "floor(1.0) — exactly half still pays once");
            Assert.That(YieldAt(0.49f), Is.EqualTo(0), "floor(0.98) — below half is WORTH NOTHING");
            Assert.That(YieldAt(0.00f), Is.EqualTo(0), "a wreck is scrap the ship cannot even use");
            Assert.That(YieldAt(-1f), Is.EqualTo(0), "and a negative never mints a negative stack");
            Assert.That(YieldAt(1.5f), Is.EqualTo(2), "Condition is clamped: over-unity never mints extra");
            Assert.That(DeconstructSystem.DeviceYield(SimDefs.Default, null), Is.EqualTo(0),
                "a device that no longer resolves yields nothing rather than throwing");
        }

        /// <summary>
        /// VALIDATE-ON-ARRIVAL for the device path (lane plan §10.6). The target is removed by
        /// ANOTHER path between designate and arrival; the site must be consumed with no yield and
        /// no throw. The ID is the identity, so a DIFFERENT device that moved onto the same tile in
        /// the meantime is not the one the player condemned and must survive.
        ///
        /// F1 (WP-2 review, medium) — THIS DOC COMMENT'S MUTATION USED TO BE UNFALSIFIABLE, and the
        /// guard was restructured rather than the sentence re-worded. WP-1/WP-2 shipped a COMPOUND
        /// arrival guard, <c>if (!TargetStillExists(sim, site) || !sim.Devices.TryGet(site.TargetId,
        /// out var device)) return true;</c>, and the review measured that each leg deflected the
        /// other: dropping only the <c>TargetStillExists</c> leg was GREEN, dropping only the
        /// <c>TryGet</c> early-return was GREEN, and only deleting BOTH went red. The predicted
        /// NullReferenceException was impossible from the single-line mutation the comment named.
        /// The <c>TargetStillExists</c> call was genuinely redundant here — its <c>Pos</c> clause is
        /// unreachable (nothing writes <see cref="Device.Pos"/> after creation) and entity ids are
        /// never recycled, so no impostor can inherit a condemned id — so WP-3 collapsed the two
        /// into ONE guard, <see cref="DeconstructSystem.TryGetLiveDevice"/>, which both validates
        /// and hands out the entity.
        ///
        /// MUTATION (applied, observed failing, reverted): drop the early return in
        /// <see cref="DeconstructSystem.Complete"/>'s device branch —
        /// <c>if (!TryGetLiveDevice(sim, site, out var device)) return true;</c> →
        /// <c>TryGetLiveDevice(sim, site, out var device);</c> — one line, nothing left to deflect
        /// it: <c>DeviceYield</c> tolerates the null, and the very next statement
        /// (<c>byte deviceKind = (byte)device.Kind;</c>) dies on a NullReferenceException.
        /// </summary>
        [Test]
        public void Complete_OnADeviceRemovedByAnotherPath_ConsumesTheSite_AndSparesAnImpostorOnTheSameTile()
        {
            var sim = NewSim(TwoRooms, 45, out var strip);
            sim.Tick();
            var condemned = sim.AddDevice(DeviceKind.Scrubber, MachineTile, "scrub_old");
            Assert.That(strip.Designate(sim, MachineTile, DeconstructKind.Device), Is.True);
            Assert.That(strip.TryGet(MachineTile, out var site), Is.True);
            Assert.That(site.TargetId, Is.EqualTo(condemned.Id));

            // Somebody else pulls it, and a NEW machine is installed on the same tile.
            sim.RemoveDevice(condemned.Id);
            var impostor = sim.AddDevice(DeviceKind.Scrubber, MachineTile, "scrub_new");
            Assert.That(impostor.Id, Is.Not.EqualTo(condemned.Id), "precondition: a genuinely new entity");

            Assert.That(strip.Complete(sim, MachineTile, 0u), Is.True, "the pending entry is consumed…");
            Assert.That(strip.Pending, Is.Empty, "…so nothing loops on it");
            Assert.That(sim.Devices.TryGet(impostor.Id, out _), Is.True,
                "…and the REPLACEMENT survives: the condemned id, not the tile, was the identity");
            Assert.That(CountGround(sim, ItemKind.Parts), Is.EqualTo(0),
                "no Parts from a machine that was already gone — that would be matter from nowhere");
        }

        /// <summary>
        /// The plan's §5 instruction: "if the implementer finds a device kind whose removal throws
        /// or corrupts state, report it as a finding." This is that probe, run as a test so a kind
        /// added later cannot quietly break it. Every grid-addressable kind except the Door is
        /// stood up on a live default stack, stripped through the registry's own completion path,
        /// and the sim is ticked 60 further ticks with every system running. (A
        /// <see cref="DeviceKind.CryoPod"/> is OPENED first: an occupied one is refused at
        /// designate time, and a kind that cannot be designated would drop out of this probe
        /// without failing it — which is how a removal bug would hide.)
        ///
        /// RESULT AT WP-2: none of them throws and none corrupts. Every device lookup in the repo
        /// is <c>TryGet</c>-guarded, and the two systems that hold a device across ticks
        /// (<c>CraftingSystem</c>, <c>MaintenanceSystem</c>) already re-resolve by tile each pass.
        ///
        /// MUTATION: replace <c>sim.RemoveDevice(site.TargetId)</c> with
        /// <c>sim.Devices.Remove(site.TargetId)</c> → the device grid and
        /// <see cref="TileFlags.HasDevice"/> keep dangling references for every kind and the
        /// per-kind flag assertion fails on the first one.
        /// </summary>
        [Test]
        public void StrippingEveryGridDeviceKind_NeitherThrowsNorLeavesDanglingState()
        {
            int checkedKinds = 0;
            foreach (var kind in GridAddressableKinds())
            {
                if (kind == DeviceKind.Door) continue;
                var sim = new Simulation(AsciiWorld.Build(TwoRooms), 46, StackNoNeeds(out var strip));
                sim.AddCitizen("Probe", new Int3(2, 2, 0));
                sim.Tick();
                var device = sim.AddDevice(kind, MachineTile, "unit_" + kind.ToString().ToLowerInvariant());
                // An OCCUPIED capsule is refused by CanDesignate (a person is inside it), so open
                // it first — this test is about whether REMOVAL corrupts state for each kind, and a
                // kind that could never be designated would silently drop out of the probe. The
                // refusal itself is pinned next door, in the legality test.
                if (kind == DeviceKind.CryoPod) device.IsOpen = true;
                Assert.That(strip.Designate(sim, MachineTile, DeconstructKind.Device), Is.True, kind.ToString());

                Assert.DoesNotThrow(() => strip.Complete(sim, MachineTile, 0u),
                    $"RemoveDevice must not throw for {kind}");
                Assert.DoesNotThrow(() => { for (int t = 0; t < 60; t++) sim.Tick(); },
                    $"…and the full system stack must survive 60 ticks after a {kind} is stripped");

                Assert.That(sim.Devices.TryGet(device.Id, out _), Is.False, kind.ToString());
                Assert.That(sim.TryGetDeviceAt(MachineTile, out _), Is.False,
                    $"{kind}: the device grid must not keep a dangling entry");
                Assert.That(sim.World.GetFlags(MachineTile) & TileFlags.HasDevice, Is.EqualTo((TileFlags)0),
                    $"{kind}: TileFlags.HasDevice must be cleared");
                Assert.That(CountGround(sim, ItemKind.Parts), Is.EqualTo(2),
                    $"{kind}: a pristine device is worth floor(2 × 1.0) Parts whatever it was");
                checkedKinds++;
            }
            Assert.That(checkedKinds, Is.EqualTo(Enum.GetValues(typeof(DeviceKind)).Length - 3),
                "precondition: every kind but Door and the two overlays was actually exercised");
        }

        /// <summary>
        /// THE MOSS CONSEQUENCE, exercised as the FEATURE <c>ECONOMY.md</c> §9.3 says it is:
        /// <i>"deleting a named device un-registers its MOSS adapter, so you can break your own
        /// automation by selling a valve."</i> Nothing here defends against it. What IS required is
        /// that the break is LEGIBLE: the program reports a runtime error naming the device it can
        /// no longer read, raises an alarm the Chronicle records, and neither throws out of
        /// <c>Tick</c> nor takes the sim or any OTHER program down with it.
        ///
        /// MUTATION: delete <c>sim.RemoveDevice(site.TargetId)</c> from
        /// <see cref="DeconstructSystem.Complete"/>'s device branch → the adapter keeps resolving,
        /// no runtime error ever appears, and the "the automation is broken" assertion fails.
        ///
        /// HONESTLY STATED LIMIT — a real gap this test pins the SHAPE of but cannot fix: only
        /// READS fail legibly. <c>UtilityDeviceAdapter.TryInvoke</c> enqueues its command against a
        /// dead entity id and returns TRUE, so a write-only script (<c>do scrub.close</c> with no
        /// property read) goes on silently doing nothing forever. Asserted below so the silence is
        /// on the record; fixing it means an existence check inside the adapters, which is
        /// Sim.Dsl's package and not this one's.
        /// </summary>
        [Test]
        public void MossProgramBoundToAStrippedDevice_BreaksLegiblyOnReads_ButSilentlyOnWrites()
        {
            var registry = new DeviceRegistry();
            var moss = new ScriptRuntime(registry);
            var stack = new List<ISimSystem>();
            foreach (var s in SystemStack.CreateDefault(moss)) if (!(s is NeedsSystem)) stack.Add(s);
            var sim = new Simulation(AsciiWorld.Build(TwoRooms), 47, stack.ToArray());
            DeconstructSystem strip = null;
            foreach (var s in sim.Systems) if (s is DeconstructSystem d) strip = d;

            var scrubber = sim.AddDevice(DeviceKind.Scrubber, MachineTile, "scrub_b");
            sim.AddDevice(DeviceKind.AirVent, new Int3(1, 1, 0), "vent_a"); // the untouched control
            MossBindings.RegisterAdapters(sim, registry);
            Assert.That(moss.SetProgram("term_reader", "if scrub_b.powered: alarm(\"scrubber nominal\")\n"),
                Is.Empty, "precondition: the reader program compiles");
            Assert.That(moss.SetProgram("term_writer", "close(scrub_b)\n"),
                Is.Empty, "precondition: the writer program compiles");
            Assert.That(moss.SetProgram("term_control", "if vent_a.powered: alarm(\"vent nominal\")\n"),
                Is.Empty, "precondition: the control program compiles");

            sim.Tick();
            Assert.That(moss.TryGetRuntimeError("term_reader", out _), Is.False,
                "precondition: while the scrubber exists the automation is HEALTHY");

            Assert.That(strip.Designate(sim, MachineTile, DeconstructKind.Device), Is.True);
            Assert.DoesNotThrow(() => strip.Complete(sim, MachineTile, 0u),
                "stripping a MOSS-addressed device must not throw");
            Assert.That(sim.Devices.TryGet(scrubber.Id, out _), Is.False, "precondition: it really went");

            Assert.DoesNotThrow(() => { for (int t = 0; t < 10; t++) sim.Tick(); },
                "a broken program must never take the sim down");

            Assert.That(moss.TryGetRuntimeError("term_reader", out var err), Is.True,
                "the player broke their own automation — that is the feature, and it must SHOW");
            Assert.That(err, Does.Contain("scrub_b"),
                "…legibly: the message must name the device the script can no longer read");
            Assert.That(moss.TryGetRuntimeError("term_control", out _), Is.False,
                "…and exactly one program is affected: the control still runs");

            // The gap, pinned rather than hidden: a write-only script fails SILENTLY.
            Assert.That(moss.TryGetRuntimeError("term_writer", out _), Is.False,
                "KNOWN GAP: DeviceAdapters.TryInvoke never checks the id still resolves, so a " +
                "write-only script against a stripped device reports nothing at all");
        }

        // ------------------------------------------------- liveness: the WP-1 zombie-site leak

        /// <summary>
        /// F2, the leak an independent review of WP-1 measured: a designated WALL removed by
        /// another path (a MOSS tile write, a <see cref="SetTileCommand"/>, a dig) left a PERMANENT
        /// zombie site. <c>Progress</c> abandoned cleanly, <c>Select</c> then skipped it forever,
        /// and nothing removed the entry — after 3000 further ticks the registry still read
        /// <c>pending = 1, CandidateCount = 1, workerJob = None</c>. One of <c>max_staged</c>'s 64
        /// slots was consumed forever, cancellable only by a player who happened to notice.
        ///
        /// The consequence is asserted where it BITES, not where it is convenient: with
        /// <c>max_staged = 1</c> a zombie makes the whole verb unusable for the rest of the game.
        ///
        /// MUTATION: revert <c>DeconstructSystem.Tick</c> to WP-1's <c>{ }</c> no-op (i.e. delete
        /// the <c>=&gt; Reap(sim)</c>) → every assertion after the tear-away fails, exactly as
        /// measured on WP-1.
        /// </summary>
        [Test]
        public void ADesignatedWallRemovedByAnotherPath_IsReaped_AndFreesItsMaxStagedSlot()
        {
            var oneSlot = DefsParser.Parse(
                new[] { ("d.def", "[deconstruct]\nmax_staged = 1\n") }, new List<string>());
            var sim = NewSim(TwoRooms, 48, out var strip, oneSlot);
            var worker = sim.AddCitizen("Reyes", new Int3(2, 2, 0));
            sim.Tick();
            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);

            for (int t = 0; t < 400 && !(worker.JobKind == JobKind.Deconstruct && !worker.HasPath); t++)
                sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct), "precondition: a worker is on it");

            // Somebody else opens the wall while the tear-down is in progress.
            new SetTileCommand(Partition, floor: TileDefs.Floor, wall: 0).Execute(sim);
            for (int t = 0; t < 20; t++) sim.Tick();

            Assert.That(worker.JobKind, Is.EqualTo(JobKind.None), "the worker abandoned (WP-1 did this much)");
            Assert.That(strip.Pending, Is.Empty,
                "and the SITE is gone too — WP-1 left it pending forever with nobody able to finish it");
            var source = ((JobSystem)FindSystem<JobSystem>(sim)).Sources.First(s => s is DeconstructJobSource);
            Assert.That(source.CandidateCount, Is.EqualTo(0), "…so the board is empty, not permanently stuck at 1");

            // The bite: with one slot, a zombie would have made the verb unusable forever.
            Assert.That(strip.Designate(sim, new Int3(5, 1, 0), DeconstructKind.Wall), Is.True,
                "the freed max_staged slot is genuinely reusable");
        }

        /// <summary>
        /// The same leak on the DEVICE path, and the case no job-source-side fix can reach: NO
        /// CITIZEN EXISTS, so nothing ever claims the site and <c>Progress</c> never runs — and
        /// <c>Simulation.RemoveDevice</c> sets no <see cref="JobBoardDirty"/> flag, so the job
        /// board is never even rescanned. Only a registry-owned per-tick reap collects this one.
        /// That is why <see cref="DeconstructSystem.Reap"/> lives in <c>Tick</c> and not in
        /// <c>DeconstructJobSource.Rescan</c>, which the review offered as the alternative.
        ///
        /// MUTATION: move the reap into <c>DeconstructJobSource.Rescan</c> (or revert
        /// <c>Tick</c> to a no-op) → nothing dirties the board on this map, the rescan never runs,
        /// and the site is still pending at the end.
        /// </summary>
        [Test]
        public void ADesignatedDeviceRemovedByAnotherPath_IsReaped_EvenWithNoCrewAndNoBoardRescan()
        {
            var sim = NewSim(TwoRooms, 49, out var strip);
            sim.Tick();
            var device = sim.AddDevice(DeviceKind.GrowBed, MachineTile, "bed_b");
            Assert.That(strip.Designate(sim, MachineTile, DeconstructKind.Device), Is.True);
            Assert.That(sim.Citizens.Items, Is.Empty, "precondition: nobody can ever claim this site");

            sim.RemoveDevice(device.Id);          // another path — e.g. RemoveDeviceCommand
            sim.JobsDirty = JobBoardDirty.None;   // …and it dirties no job axis, so no rescan is due
            sim.Tick();

            Assert.That(strip.Pending, Is.Empty,
                "a site whose device no longer exists must not survive a single tick");
        }

        /// <summary>
        /// <see cref="DeconstructSystem.Reap"/> is deliberately NARROW: "the target is gone", never
        /// "the target became illegal". A wall that became <see cref="DeconstructSystem.IsPressureHull"/>
        /// mid-job is STILL a wall and still the player's standing order — it is
        /// <see cref="DeconstructSystem.Complete"/> that refuses it on arrival. If the reap also
        /// collected newly-illegal sites, designations near a hull breach would silently evaporate
        /// between the click and the crew member arriving, with no feedback anywhere.
        ///
        /// MUTATION: add <c>|| IsPressureHull(sim.World, site.Pos)</c> to
        /// <see cref="DeconstructSystem.TargetStillExists"/>'s wall leg (i.e. widen the reap to
        /// "still legal") → the designation vanishes and this fails.
        /// </summary>
        [Test]
        public void Reap_DropsOnlyVanishedTargets_NotAWallThatMerelyBecameHull()
        {
            var sim = NewSim(TwoRooms, 50, out var strip);
            sim.Tick();
            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);

            new SetTileCommand(new Int3(5, 1, 0), floor: TileDefs.Void, wall: 0).Execute(sim);
            Assert.That(DeconstructSystem.IsPressureHull(sim.World, Partition), Is.True,
                "precondition: the partition became hull — illegal, but still very much a wall");

            for (int t = 0; t < 30; t++) sim.Tick();
            Assert.That(strip.Pending, Has.Count.EqualTo(1),
                "an illegal-but-present target stays the player's order; Complete refuses it on arrival");
            Assert.That(strip.Reap(sim), Is.EqualTo(0), "and a direct reap agrees");
        }

        // ------------------------------------------------------------------ the Chronicle trace

        /// <summary>
        /// <c>Complete</c>'s <c>workerId</c> was a DEAD PARAMETER in WP-1: read by nothing, while
        /// its presence implied a trace that did not exist — a strip left no Chronicle line at all,
        /// unlike every build. WP-2 wires it through <see cref="DeconstructCompletedEvent"/> so
        /// tearing the ship apart is remembered the way building it is.
        ///
        /// Both rows matter: the wall row proves the event fires and names the crew member; the
        /// device row proves the DEVICE KIND survives the entity's removal (RemoveDevice runs a
        /// full tick before HistorySystem reads the event, so an id lookup would always miss —
        /// exactly the problem <c>CitizenDiedEvent.Name</c> exists to solve).
        ///
        /// MUTATION: delete the <c>sim.Events.Publish(new DeconstructCompletedEvent …)</c> from
        /// <see cref="DeconstructSystem.Complete"/>'s wall branch → the wall row fails.
        /// MUTATION: set <c>Device = 0</c> instead of <c>Device = deviceKind</c> in the device
        /// branch → the Chronicle says "the door" and the device row fails.
        /// </summary>
        [Test]
        public void EveryCompletedStrip_LeavesAChronicleLine_NamingTheWorkerAndWhatWasTornDown()
        {
            var sim = NewSim(TwoRooms, 51, out var strip);
            var worker = sim.AddCitizen("Okafor", new Int3(2, 2, 0));
            sim.AddDevice(DeviceKind.Reclaimer, MachineTile, "recl_b");
            sim.Tick();
            var history = (HistorySystem)FindSystem<HistorySystem>(sim);
            int before = history.Entries.Count;

            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);
            Assert.That(strip.Complete(sim, Partition, worker.Id), Is.True);
            Assert.That(strip.Designate(sim, MachineTile, DeconstructKind.Device), Is.True);
            Assert.That(strip.Complete(sim, MachineTile, worker.Id), Is.True);
            // TWO ticks: the bus swaps at tick END, so an event published outside a tick is only
            // readable during the tick AFTER the next swap.
            sim.Tick(); sim.Tick();

            var lines = history.Entries.Skip(before)
                .Where(e => e.Kind == (byte)HistoryKind.DeconstructCompleted).ToList();
            Assert.That(lines, Has.Count.EqualTo(2), "one Chronicle line per completed strip");
            foreach (var line in lines)
            {
                Assert.That(line.Text, Does.Contain("Okafor"), "the Chronicle names who did it");
                Assert.That(line.SubjectA, Is.EqualTo(worker.Id), "…structurally, not only in prose");
            }
            Assert.That(lines.Any(l => l.Text.Contains("a wall")), Is.True,
                "the wall strip is recorded as a wall");
            Assert.That(lines.Any(l => l.Text.Contains("reclaimer")), Is.True,
                "and the device strip NAMES THE MACHINE, which only works because the kind rides " +
                "the event — the entity itself is long gone by the time HistorySystem reads it");
        }

        /// <summary>
        /// The other half of the same contract: a strip that changes NOTHING announces nothing. A
        /// site consumed by validate-on-arrival (the wall had already gone) must publish no
        /// completion event, or the Chronicle fills with tear-downs that never happened.
        ///
        /// MUTATION: hoist the <c>sim.Events.Publish(new DeconstructCompletedEvent …)</c> above the
        /// two <c>return true;</c> validate-on-arrival guards in
        /// <see cref="DeconstructSystem.Complete"/> → a phantom line appears and this fails.
        /// </summary>
        [Test]
        public void AStripConsumedByValidateOnArrival_LeavesNoChronicleLine()
        {
            var sim = NewSim(TwoRooms, 52, out var strip);
            var worker = sim.AddCitizen("Vale", new Int3(2, 2, 0));
            sim.Tick();
            var history = (HistorySystem)FindSystem<HistorySystem>(sim);
            int before = history.Entries.Count;

            Assert.That(strip.Designate(sim, Partition, DeconstructKind.Wall), Is.True);
            new SetTileCommand(Partition, floor: TileDefs.Floor, wall: 0).Execute(sim);
            Assert.That(strip.Complete(sim, Partition, worker.Id), Is.True, "the entry is consumed…");
            sim.Tick(); sim.Tick(); // the same two-tick window the positive test uses

            Assert.That(history.Entries.Skip(before)
                    .Count(e => e.Kind == (byte)HistoryKind.DeconstructCompleted), Is.EqualTo(0),
                "…but nothing was torn down, so nothing may be remembered as torn down");
        }

        // ============================== WP-3: the round trip is CLOSED, and provably lossy

        /// <summary>
        /// THE HEADLINE INVARIANT of E0-5 WP-3, driven through the REAL command and the REAL
        /// dispatcher end to end: <b>place a device, strip it back at Condition 1.0, and the ship
        /// is strictly poorer.</b>
        ///
        /// WP-2's independent review measured the hole this closes: <c>PlaceDeviceCommand</c>
        /// charged nothing while a strip paid <c>floor(device_parts × Condition)</c> = 2 Parts, so
        /// place → strip → repeat minted 1 Part per 476 ticks with zero matter input, against
        /// 15 000 ticks + 1 Regolith for the same Part through the shipped <c>recipes.def</c>
        /// ladder — into <c>MaintenanceSystem</c>, the one sink that never ends.
        ///
        /// This is the BEST case for the exploiter (a brand-new machine, full recovery) and it is
        /// still a loss: 3 Parts out, 2 back. Every worn machine is worse.
        ///
        /// The strip half runs through <c>JobSystem</c>, not through a direct
        /// <see cref="DeconstructSystem.Complete"/> call, so the crew member really walks over and
        /// really spends <c>device_work_ticks</c> — a registry-only test would not prove the
        /// shipping path pays.
        ///
        /// MUTATION (apply, observe, revert): delete
        /// <c>if (!TryPay(sim, sim.Defs.Build.DevicePlaceCost)) return;</c> from
        /// <c>PlaceDeviceCommand.Execute</c> → the 3 seeded Parts are still there after placement,
        /// the "spent" assertion fails, and the net becomes +2 instead of −1. That single line IS
        /// the fix, and nothing else deflects it.
        /// </summary>
        [Test]
        public void PlaceThenStripAtFullCondition_ThroughTheCommandAndTheDispatcher_LeavesTheShipOnePartPoorer()
        {
            var sim = NewSim(TwoRooms, 61, out var strip);
            var worker = sim.AddCitizen("Ito", new Int3(2, 2, 0));
            int price = SimDefs.Default.Build.DevicePlaceCost;
            sim.AddItem(ItemKind.Parts, price, new Int3(1, 1, 0)); // the ship's entire treasury
            sim.Tick();
            Assert.That(CountGround(sim, ItemKind.Parts), Is.EqualTo(price),
                "precondition: exactly the price is aboard, and nothing else");
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.None), "precondition: idle");

            // --- PLACE, through the real command over the real inbox.
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Bed, MachineTile));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(MachineTile, out var bed), Is.True, "the bed is placed…");
            Assert.That(CountGround(sim, ItemKind.Parts), Is.EqualTo(0),
                "…and it was PAID FOR: every seeded Part is gone");
            Assert.That(bed.Condition, Is.EqualTo(1f),
                "precondition: brand new, so the strip below is the exploiter's BEST case");

            // --- STRIP, through the real dispatcher.
            Assert.That(strip.Designate(sim, MachineTile, DeconstructKind.Device), Is.True);
            for (int t = 0; t < 20 && worker.JobKind == JobKind.None; t++) sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct),
                "precondition: the dispatcher really offered the strip");
            for (int t = 0; t < 3000 && strip.Pending.Count > 0; t++) sim.Tick();
            Assert.That(strip.Pending, Is.Empty, "the strip completed inside the budget");
            Assert.That(sim.Devices.TryGet(bed.Id, out _), Is.False, "the bed is gone");

            int back = CountGround(sim, ItemKind.Parts);
            Assert.That(back, Is.EqualTo(2), "a pristine device refunds floor(2 × 1.0) = 2 Parts");
            Assert.That(back, Is.LessThan(price),
                $"THE INVARIANT: {price} Parts in, {back} back — the round trip is a LOSS, not a faucet");
        }

        /// <summary>
        /// The exploit loop, run until it STOPS — the falsifiable form of "bounded". WP-2's finding
        /// was that nothing bounded place → strip → repeat: not material (free), not
        /// <c>max_staged</c> (a queue-depth cap, not a rate cap), not tiles (re-placeable
        /// instantly), not kind. Charging in the currency the strip refunds makes the loop a
        /// monotone drain that terminates in a refusal, and this measures the exact arithmetic:
        ///
        /// <code>
        ///   7 Parts → −3 +2 = 6 → 5 → 4 → 3 → 2   (five cycles)
        ///   2 &lt; 3 ⇒ the sixth placement is refused and consumes nothing
        /// </code>
        ///
        /// Uses the registry's <see cref="DeconstructSystem.Complete"/> rather than the dispatcher
        /// on purpose — it is the CYCLE COUNT that is under test, and the dispatcher half is
        /// pinned by the test above. Named for that limit.
        ///
        /// MUTATION: change <c>if (Affordable(sim) &lt; cost) return false;</c> in
        /// <c>PlaceDeviceCommand.TryPay</c> to <c>if (false) return false;</c> → the loop never
        /// refuses, the treasury goes to 0 and then stays there while devices keep appearing
        /// (matter destroyed, furniture from nothing), and both the cycle count and the "consumed
        /// nothing" assertion fail.
        /// </summary>
        [Test]
        public void RepeatedPlaceStripCycles_AreAMonotoneDrain_AndTerminateInARefusal()
        {
            var sim = NewSim(TwoRooms, 62, out var strip);
            sim.AddItem(ItemKind.Parts, 7, new Int3(1, 1, 0));
            sim.Tick();

            int previous = CountGround(sim, ItemKind.Parts);
            Assert.That(previous, Is.EqualTo(7), "precondition: the treasury");

            int cycles = 0;
            while (true)
            {
                new PlaceDeviceCommand(DeviceKind.Bed, MachineTile).Execute(sim);
                if (!sim.TryGetDeviceAt(MachineTile, out _)) break; // the ship could not pay
                Assert.That(strip.Designate(sim, MachineTile, DeconstructKind.Device), Is.True);
                Assert.That(strip.Complete(sim, MachineTile, 0u), Is.True);
                cycles++;
                int now = CountGround(sim, ItemKind.Parts);
                Assert.That(now, Is.LessThan(previous),
                    $"cycle {cycles} must LOSE Parts, not gain or hold them");
                previous = now;
                Assert.That(cycles, Is.LessThan(100), "the loop must terminate, not run forever");
            }

            Assert.That(cycles, Is.EqualTo(5), "7 Parts buys exactly five −3/+2 cycles");
            Assert.That(CountGround(sim, ItemKind.Parts), Is.EqualTo(2),
                "and the refused sixth placement consumed NOTHING — 2 Parts are still aboard");
            Assert.That(sim.TryGetDeviceAt(MachineTile, out _), Is.False,
                "…and placed nothing: an unaffordable request is a clean no-op, not a half-spend");
        }

        /// <summary>
        /// ALL OR NOTHING, and PROVABLY INERT ON REFUSAL. A ship one Part short must place nothing
        /// AND consume nothing — a partial spend would destroy matter and produce no device, which
        /// is the leak this package exists to close, inverted.
        ///
        /// The strong assertion is the last one: an unaffordable placement leaves
        /// <see cref="Simulation.StateHash"/> BIT-IDENTICAL to a twin sim that never enqueued the
        /// command at all. That is what "a refusal cannot desync the web host"
        /// (<c>GameSession.HandlePlace</c> enqueues blind) means in a form a test can check —
        /// a `TryGetDeviceAt` assertion alone would pass even if the command had quietly eaten a
        /// stack or dirtied the job board.
        ///
        /// MUTATION (applied, observed failing, reverted): change
        /// <c>if (Affordable(sim) &lt; cost) return false;</c> in <c>PlaceDeviceCommand.TryPay</c>
        /// to <c>if (false) return false;</c> — one line, dropping the all-or-nothing pre-check →
        /// the greedy loop spends both Parts, places the bed anyway, and all three assertions fail
        /// including the twin-hash one.
        /// </summary>
        [Test]
        public void PlacementOnePartShort_PlacesNothing_ConsumesNothing_AndHashesLikeItNeverHappened()
        {
            Simulation Build(ulong seed)
            {
                var s = NewSim(TwoRooms, seed, out _);
                s.AddItem(ItemKind.Parts, SimDefs.Default.Build.DevicePlaceCost - 1, new Int3(1, 1, 0));
                s.Tick();
                return s;
            }

            var acted = Build(63);
            var untouched = Build(63);
            Assert.That(acted.StateHash(), Is.EqualTo(untouched.StateHash()), "precondition: twins");

            acted.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Bed, MachineTile));
            acted.Tick();
            untouched.Tick();

            Assert.That(acted.TryGetDeviceAt(MachineTile, out _), Is.False,
                "one Part short buys nothing");
            Assert.That(CountGround(acted, ItemKind.Parts),
                Is.EqualTo(SimDefs.Default.Build.DevicePlaceCost - 1),
                "…and costs nothing: a partial spend would be matter destroyed for no device");
            Assert.That(acted.StateHash(), Is.EqualTo(untouched.StateHash()),
                "a refused placement is bit-for-bit a no-op — the host may enqueue blind");
        }

        /// <summary>
        /// The treasury is LOOSE GROUND STOCK ONLY. Parts a crew member is carrying, and Parts a
        /// job has claimed (<see cref="ItemStack.ReservedBy"/> — a builder's haul, a crafting
        /// station's staged input, a maintainer's overhaul Part), are somebody else's: spending
        /// them would strand the job that reserved them, which is exactly the B-1 bug class the
        /// owner-scoped <c>ReservedBy</c> field was introduced to end.
        ///
        /// Three Parts aboard, price three, and the placement is still REFUSED because two of them
        /// are spoken for. Freeing one claim then makes the identical request succeed — so the
        /// filter, not some unrelated rejection, is what refused.
        ///
        /// MUTATION: delete <c>|| it.CarriedBy != 0 || it.ReservedBy != 0</c> from
        /// <c>PlaceDeviceCommand.Affordable</c> → the first placement succeeds and the
        /// "refused while claimed" assertion fails; the carried stack is silently eaten out of a
        /// crew member's hands.
        /// </summary>
        [Test]
        public void Placement_NeverSpendsCarriedOrReservedParts_EvenWhenTheyWouldCoverThePrice()
        {
            var sim = NewSim(TwoRooms, 64, out _);
            var hauler = sim.AddCitizen("Vale", new Int3(2, 2, 0));
            sim.Tick();

            var free = sim.AddItem(ItemKind.Parts, 1, new Int3(1, 1, 0));
            var claimed = sim.AddItem(ItemKind.Parts, 1, new Int3(1, 2, 0));
            var carried = sim.AddItem(ItemKind.Parts, 1, new Int3(1, 3, 0));
            claimed.ReservedBy = hauler.Id;
            carried.CarriedBy = hauler.Id;

            Assert.That(CountGround(sim, ItemKind.Parts) + carried.Count, Is.EqualTo(3),
                "precondition: three Parts exist aboard, exactly the price");
            Assert.That(PlaceDeviceCommand.Affordable(sim), Is.EqualTo(1),
                "…but only ONE of them is loose, unclaimed ground stock");

            new PlaceDeviceCommand(DeviceKind.Bed, MachineTile).Execute(sim);
            Assert.That(sim.TryGetDeviceAt(MachineTile, out _), Is.False,
                "refused: a claimed stack is not the ship's to spend");
            Assert.That(claimed.Count, Is.EqualTo(1), "the reserved stack is untouched");
            Assert.That(carried.Count, Is.EqualTo(1), "and so is the carried one");

            // Release the two claims: the SAME request must now go through, so the claim filter
            // is what refused above and not the tile, the kind or the total.
            claimed.ReservedBy = 0;
            carried.CarriedBy = 0;
            Assert.That(PlaceDeviceCommand.Affordable(sim), Is.EqualTo(3));
            new PlaceDeviceCommand(DeviceKind.Bed, MachineTile).Execute(sim);
            Assert.That(sim.TryGetDeviceAt(MachineTile, out _), Is.True,
                "…and with the claims released the identical request succeeds");
            Assert.That(CountGround(sim, ItemKind.Parts), Is.EqualTo(0), "all three spent");
            Assert.That(free.Count + claimed.Count + carried.Count, Is.EqualTo(0),
                "drained in item-store order, every stack emptied");
        }

        // ===================== F2: the SHIPPING path reads the def, not only the helper

        /// <summary>
        /// F2 (WP-2 review, medium) — <b>the yield defs were not proven to be consumed by the
        /// shipping completion path.</b> Measured: replacing
        /// <c>int deviceYield = DeviceYield(sim.Defs, device);</c> with <c>int deviceYield = 2;</c>
        /// in <see cref="DeconstructSystem.Complete"/> passed the ENTIRE suite, and
        /// <c>int yield = WallYield(sim.Defs);</c> → <c>int yield = 1;</c> did too. The tripwires
        /// called the static helpers directly; the loop tests anchored on the default value
        /// (<c>Is.EqualTo(WallYield(SimDefs.Default))</c> — rule 1, recomputing the subject); nothing
        /// joined them. A content pack setting <c>device_parts = 7</c> would have moved the defs
        /// checksum, passed every gate, and still dropped 2.
        ///
        /// The fix is to run the FULL DISPATCHER under a TUNED sim and assert the tuned number
        /// lands on the freed tile — a literal, not an expression the code could satisfy by
        /// accident.
        ///
        /// MUTATION A: <c>int yield = WallYield(sim.Defs);</c> → <c>int yield = 1;</c> → the wall
        /// half fails (1 Regolith where 2 was tuned). Previously GREEN.
        /// MUTATION B: <c>int deviceYield = DeviceYield(sim.Defs, device);</c> →
        /// <c>int deviceYield = 2;</c> → the device half fails (2 Parts where 7 was tuned).
        /// Previously GREEN.
        /// </summary>
        [Test]
        public void TunedYieldDefs_ReachTheDispatcherCompletionPath_NotJustTheStaticHelpers()
        {
            SimDefs Tuned(string text)
            {
                var problems = new List<string>();
                var d = DefsParser.Parse(new[] { ("tuned.def", text) }, problems);
                Assert.That(problems, Is.Empty, "the tuned file must parse cleanly: " + string.Join(" | ", problems));
                return d;
            }

            // --- WALL: wall_recovery 1.0 ⇒ floor(2 × 1.0) = 2 Regolith, not the shipped 1.
            var fullRecovery = Tuned("[deconstruct]\nwall_recovery = 1.0\n");
            Assert.That(DeconstructSystem.WallYield(SimDefs.Default), Is.EqualTo(1),
                "precondition: the SHIPPED yield is 1, so 2 can only come from the tuned defs");
            var wallSim = NewSim(TwoRooms, 65, out var wallStrip, fullRecovery);
            var digger = wallSim.AddCitizen("Ito", new Int3(2, 2, 0));
            wallSim.Tick();
            Assert.That(wallStrip.Designate(wallSim, Partition, DeconstructKind.Wall), Is.True);
            for (int t = 0; t < 20 && digger.JobKind == JobKind.None; t++) wallSim.Tick();
            Assert.That(digger.JobKind, Is.EqualTo(JobKind.Deconstruct),
                "precondition: the dispatcher offered the wall strip — the path under test was reached");
            for (int t = 0; t < 4000 && wallStrip.Pending.Count > 0; t++) wallSim.Tick();
            Assert.That(wallStrip.Pending, Is.Empty, "the wall came down inside the budget");
            Assert.That(CountGround(wallSim, ItemKind.Regolith), Is.EqualTo(2),
                "Complete must read sim.Defs.Deconstruct.WallRecovery — a hard-coded 1 fails here");

            // --- DEVICE: device_parts 7 ⇒ floor(7 × 1.0) = 7 Parts, not the shipped 2.
            var richParts = Tuned("[deconstruct]\ndevice_parts = 7\n");
            Assert.That(SimDefs.Default.Deconstruct.DeviceParts, Is.EqualTo(2),
                "precondition: the SHIPPED base is 2, so 7 can only come from the tuned defs");
            var devSim = NewSim(TwoRooms, 66, out var devStrip, richParts);
            var puller = devSim.AddCitizen("Okafor", new Int3(2, 2, 0));
            var machine = devSim.AddDevice(DeviceKind.Scrubber, MachineTile, "scrub_tuned");
            devSim.Tick();
            Assert.That(machine.Condition, Is.EqualTo(1f), "precondition: pristine, so the base is undiluted");
            Assert.That(devStrip.Designate(devSim, MachineTile, DeconstructKind.Device), Is.True);
            for (int t = 0; t < 20 && puller.JobKind == JobKind.None; t++) devSim.Tick();
            Assert.That(puller.JobKind, Is.EqualTo(JobKind.Deconstruct),
                "precondition: the dispatcher offered the device strip");
            for (int t = 0; t < 3000 && devStrip.Pending.Count > 0; t++) devSim.Tick();
            Assert.That(devStrip.Pending, Is.Empty, "the machine came out inside the budget");
            Assert.That(CountGround(devSim, ItemKind.Parts), Is.EqualTo(7),
                "Complete must read sim.Defs.Deconstruct.DeviceParts — a hard-coded 2 fails here");
        }

        /// <summary>
        /// The same F2 question asked of the field this package ADDS, before anyone can ask it of
        /// us: does <c>PlaceDeviceCommand</c> read <c>build.device_place_cost</c>, or does it
        /// charge a constant that happens to equal the default? Tuned to 5 and to 1 — two values,
        /// so a hard-coded 3 fails whichever direction it is wrong in — and driven through the
        /// real command over the real command inbox.
        ///
        /// Also pins the fail-soft floor: a content pack that sets the price to 0 gets the
        /// pre-E0-5 free placement rather than an exception or a negative stack.
        ///
        /// MUTATION: change <c>TryPay(sim, sim.Defs.Build.DevicePlaceCost)</c> to
        /// <c>TryPay(sim, 3)</c> in <c>PlaceDeviceCommand.Execute</c> → the price-5 ship still has
        /// 2 Parts left (it should have 0) and the price-1 ship has 0 left (it should have 4).
        /// MUTATION: delete the <c>case "device_place_cost":</c> line from
        /// <c>DefsParser.BuildKey</c> → the parse reports an unknown key, <c>problems</c> is
        /// non-empty and every row fails at the parse assertion.
        /// MUTATION: delete the <c>Build.DevicePlaceCost</c> fold from
        /// <c>SimDefs.ComputeChecksum</c> → the checksum-moved assertion fails.
        /// </summary>
        [Test]
        public void DevicePlaceCost_IsReadFromDefsByTheShippingPlacementPath_AndZeroMeansFree()
        {
            SimDefs Tuned(string body)
            {
                var problems = new List<string>();
                var d = DefsParser.Parse(new[] { ("build.def", "[build]\n" + body) }, problems);
                Assert.That(problems, Is.Empty, "the tuned file must parse cleanly: " + string.Join(" | ", problems));
                Assert.That(d.Checksum, Is.Not.EqualTo(SimDefs.Default.Checksum),
                    "a retuned device_place_cost must move the defs checksum (parser key + fold)");
                return d;
            }

            int PlaceWith(SimDefs defs, int purse, ulong seed)
            {
                var sim = NewSim(TwoRooms, seed, out _, defs);
                sim.AddItem(ItemKind.Parts, purse, new Int3(1, 1, 0));
                sim.Tick();
                sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Desk, MachineTile));
                sim.Tick();
                Assert.That(sim.TryGetDeviceAt(MachineTile, out _), Is.True,
                    "precondition: the purse covers the tuned price, so the placement path was REACHED");
                return CountGround(sim, ItemKind.Parts);
            }

            Assert.That(SimDefs.Default.Build.DevicePlaceCost, Is.EqualTo(3),
                "precondition: the shipped price, which neither tuned value equals");
            Assert.That(PlaceWith(Tuned("device_place_cost = 5\n"), 5, 71), Is.EqualTo(0),
                "a price-5 ship spends all five — a hard-coded 3 would leave 2");
            Assert.That(PlaceWith(Tuned("device_place_cost = 1\n"), 5, 72), Is.EqualTo(4),
                "…and a price-1 ship spends exactly one — a hard-coded 3 would leave 2");

            // Fail-soft: an unset/zero price is free, not a crash and not a negative stack.
            var freeDefs = Tuned("device_place_cost = 0\n");
            var broke = NewSim(TwoRooms, 73, out _, freeDefs);
            broke.Tick();
            Assert.That(CountGround(broke, ItemKind.Parts), Is.EqualTo(0), "precondition: penniless");
            new PlaceDeviceCommand(DeviceKind.Chair, MachineTile).Execute(broke);
            Assert.That(broke.TryGetDeviceAt(MachineTile, out _), Is.True,
                "device_place_cost = 0 restores pre-E0-5 free placement rather than bricking it");
            Assert.That(CountGround(broke, ItemKind.Parts), Is.EqualTo(0),
                "and never mints or destroys a stack doing so");
        }

        // ------------------------------------------------------------------ helpers

        private static ISimSystem FindSystem<T>(Simulation sim) where T : ISimSystem
        {
            foreach (var s in sim.Systems) if (s is T) return s;
            Assert.Fail($"the stack must register a {typeof(T).Name}");
            return null;
        }

        private static int CountGround(Simulation sim, ItemKind kind)
        {
            int n = 0;
            foreach (var it in sim.Items.Items) if (it.Kind == kind && it.CarriedBy == 0) n += it.Count;
            return n;
        }

        private static PendingDeconstruct With(PendingDeconstruct b, Int3? pos = null,
            DeconstructKind? kind = null, int? workTicks = null, uint? targetId = null) =>
            new PendingDeconstruct
            {
                Pos = pos ?? b.Pos,
                Kind = kind ?? b.Kind,
                WorkTicks = workTicks ?? b.WorkTicks,
                TargetId = targetId ?? b.TargetId,
            };

        /// <summary>
        /// StateHash of a sim whose DeconstructSystem holds exactly <paramref name="entry"/>,
        /// injected through the REAL <see cref="IStatefulSystem.RestoreState"/> so arbitrary
        /// Kind/TargetId values are reachable (Designate legitimately refuses most of them) and so
        /// the save format and the fold are exercised by the same helper.
        /// </summary>
        private static ulong HashOfInjected(PendingDeconstruct entry)
        {
            var ms = new MemoryStream();
            using (var w = new BinaryWriter(ms, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                w.Write(1);
                w.Write(entry.Pos.X); w.Write(entry.Pos.Y); w.Write(entry.Pos.Z);
                w.Write((byte)entry.Kind);
                w.Write(entry.WorkTicks);
                w.Write(entry.TargetId);
            }
            ms.Position = 0;

            var strip = new DeconstructSystem();
            using (var r = new BinaryReader(ms, System.Text.Encoding.UTF8, leaveOpen: true))
                strip.RestoreState(r, strip.StateVersion);
            Assert.That(ms.Position, Is.EqualTo(ms.Length),
                "RestoreState must consume exactly the bytes CaptureState's format defines");
            Assert.That(strip.Pending, Has.Count.EqualTo(1), "precondition: the entry really landed");

            var sim = new Simulation(AsciiWorld.Build(TwoRooms), 1, new ISimSystem[] { strip });
            return sim.StateHash();
        }
    }
}
