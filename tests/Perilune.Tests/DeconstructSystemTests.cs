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
    /// E0-5 WP-1 — DECONSTRUCT, walls only. <see cref="BuildSystem"/>'s mirror: the designate →
    /// walk → tear-down loop, the pressure-hull guardrail measured ON THE REAL SLICE, the bulkhead
    /// consequence (rooms MERGE and re-equalise), the STRP save chapter, hash honesty over every
    /// new folded field, flee pre-emption, twin determinism, zero-alloc steady state over a
    /// POPULATED board, and the deconstruct.def consumption tripwires.
    ///
    /// LINQ is used freely here — it is a TEST; the no-LINQ rule governs tick paths under sim/.
    ///
    /// LIMITS OF THIS FILE, stated so a reviewer does not read more into it than it proves:
    ///  * WALLS ONLY. <see cref="DeconstructKind.Device"/> is pinned as REJECTED, nothing more;
    ///    WP-2 owns its behaviour.
    ///  * The hull predicate is measured on the two AUTHORED decks, which contain no
    ///    <see cref="TileDefs.Void"/> tile at all — so the "adjacent to vacuum" leg is exercised
    ///    on a synthetic map, and the slice measurement pins the (surprising, real) fact that on
    ///    that ship the predicate reduces to the map-edge ring.
    ///  * No test here runs a full sim-day; the conservation ledger over 3 sim-days is WP-4's
    ///    harness, because nothing designates without the <c>--strip</c> flag it ships.
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
        /// Every rejection leg of <see cref="DeconstructSystem.CanDesignate"/>, in its documented
        /// order, plus the WP-2 marker: <see cref="DeconstructKind.Device"/> is DECLARED and
        /// REJECTED, so a save can never carry a Device entry no source knows how to finish.
        ///
        /// MUTATION: delete <c>if (kind != DeconstructKind.Wall) return false;</c> → the Device
        /// assertion fails (a Device entry would be accepted on any wall tile). Delete the
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

            // WP-2 marker: the enum member ships, the behaviour does not.
            Assert.That(strip.Designate(sim, interior, DeconstructKind.Device), Is.False,
                "DeconstructKind.Device is declared but rejected until E0-5 WP-2");
            Assert.That(strip.Pending, Is.Empty);

            Assert.That(strip.Designate(sim, interior, DeconstructKind.Wall), Is.True, "valid interior wall");
            Assert.That(strip.Designate(sim, interior, DeconstructKind.Wall), Is.False, "duplicate");
            Assert.That(strip.Pending, Has.Count.EqualTo(1));

            // Cancel is pure forgetting — a deconstruct stages nothing, so nothing is refunded.
            int itemsBefore = sim.Items.Items.Count;
            Assert.That(strip.Cancel(sim, interior), Is.True);
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
            Assert.That(strip.Complete(sim, Partition, 0u), Is.True);
            Assert.That(sim.World.GetWall(Partition), Is.EqualTo(0), "the bulkhead is gone");

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
        ///
        /// MUTATION: delete <c>writer.Write(s.TargetId);</c> from
        /// <see cref="DeconstructSystem.CaptureState"/> → RestoreState reads the next entry's X as
        /// a TargetId, the whole list desyncs, and both the count and the hash assertions fail.
        /// </summary>
        [Test]
        public void StrpChapter_RoundTripsAPopulatedPendingList_BitExactly()
        {
            var map = new[] { "########", "#......#", "#.#.#..#", "#......#", "#.#....#", "########" };
            var sim = NewSim(map, 5, out var strip);
            sim.Tick();
            Assert.That(strip.Designate(sim, new Int3(4, 2, 0), DeconstructKind.Wall), Is.True);
            Assert.That(strip.Designate(sim, new Int3(2, 4, 0), DeconstructKind.Wall), Is.True);
            Assert.That(strip.Designate(sim, new Int3(2, 2, 0), DeconstructKind.Wall), Is.True);
            Assert.That(strip.Pending, Has.Count.EqualTo(3), "precondition: a POPULATED list");

            var ms = new MemoryStream();
            SaveWriter.Write(sim, ms);
            ms.Position = 0;
            var loaded = SaveReader.Read(ms, StackNoNeeds(out var loadedStrip));

            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "the STRP chapter must round-trip every field the checksum folds");
            Assert.That(loadedStrip.Pending, Has.Count.EqualTo(3));
            for (int i = 0; i < 3; i++)
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
        /// MUTATION: make <c>DeconstructJobSource.Select</c> iterate <c>_retryAt</c> (a Dictionary)
        /// instead of probing it → enumeration order is not part of the sim's contract and the
        /// twins diverge. (Also the exact bug class the no-foreach-over-Dictionary rule exists for.)
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

        // ------------------------------------------------------------------ helpers

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
