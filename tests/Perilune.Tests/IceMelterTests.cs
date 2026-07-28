using System;
using System.Collections.Generic;
using System.IO;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Glyph;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// E0-7 — ICE → MELTER → WATER, the chain that replaces B-2's abstract "shipwide
    /// condensate/ice makeup" with a thing the crew physically do.
    ///
    /// Every test here DRIVES the real system stack against a real <see cref="Simulation"/> and
    /// asserts observable state (units of Ice on the ground, litres in a tank, litres buffered in
    /// the melter, <see cref="Simulation.WastewaterLiters"/>). Nothing re-derives an expected value
    /// with the expression the code uses (§5.2 rule 1): every litre figure below is spelled as
    /// <c>units × Defs.Water.IceLitersPerUnit</c>, which is the DEFINITION of the def field, not a
    /// copy of the melter's arithmetic — and the def-tripwire test proves the field is really read
    /// by changing it and watching the delivered litres change with it.
    ///
    /// Each test's doc comment names the mutation that makes it fail; each was applied, observed
    /// RED, and reverted (see the package report for the table, including which reds were SEMANTIC
    /// and which were CRASHES).
    /// </summary>
    public class IceMelterTests
    {
        // ══════════════════════════════════════════════════════════════════════════ the fixture

        /// <summary>
        /// A plumbed, powered melter with a tank on its fluid network and one citizen who must
        /// genuinely FETCH the ice.
        ///
        /// <code>
        ///   y=1   solar(1,1)  conduits(1..5,1)  pipes(3,1)(4,1)(5,1)
        ///   y=2   crew(1,2)   ice(1,2)          MELTER(3,2)          tank(5,2)
        /// </code>
        ///
        /// (1,2) is NOT 4-adjacent to the melter at (3,2), so a stack placed there is only ever
        /// staged by a worker walking it over — which is the "durable recurring haul source" the
        /// charter claims, exercised rather than assumed. The melter draws its fluid network from
        /// the pipe directly above it; the tank draws the same network from the pipe above IT, and
        /// the three pipes are contiguous so they flood into one component.
        /// </summary>
        private static Simulation BuildMelterScenario(SimDefs defs, int iceUnits, float tankLiters = 0f,
                                                      bool plumbed = true, bool secondTank = false,
                                                      bool reclaimer = false)
        {
            string[] map =
            {
                "#######",
                "#.....#",
                "#.....#",
                "#######",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), 42, SystemStack.CreateDefault(moss), defs);

            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            if (plumbed)
                for (int x = 3; x <= 5; x++) sim.AddDevice(DeviceKind.Pipe, new Int3(x, 1, 0), $"p{x}");

            sim.AddDevice(DeviceKind.IceMelter, new Int3(3, 2, 0), "melter");
            sim.AddDevice(DeviceKind.WaterTank, new Int3(5, 2, 0), "tank").StoredLiters = tankLiters;
            // A SECOND tank on the SAME fluid network, at the SAME level, later in device store
            // order. Only built when asked for: it exists to make the least-full tie-break in
            // RunMelters observable, and it is observable only when two tanks tie.
            if (secondTank)
                sim.AddDevice(DeviceKind.WaterTank, new Int3(4, 2, 0), "tank_b").StoredLiters = tankLiters;

            // A reclaimer on the SAME network, when asked for: the only way to make the two water
            // sources compete for one tank's headroom, which is what the pass ordering decides.
            if (reclaimer) sim.AddDevice(DeviceKind.Reclaimer, new Int3(4, 2, 0), "reclaimer");

            sim.AddCitizen("Smith", new Int3(1, 2, 0)); // AutoWander false ⇒ recruitable
            if (iceUnits > 0) sim.AddItem(ItemKind.Ice, iceUnits, new Int3(1, 2, 0));

            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        private static Device Dev(Simulation sim, string name)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++) if (devices[i].Name == name) return devices[i];
            throw new InvalidOperationException("no device named " + name);
        }

        /// <summary>Ground-truth unit count of a kind, carried stacks included (a stack in a
        /// worker's hands has not been consumed).</summary>
        private static int UnitsAnywhere(Simulation sim, ItemKind kind)
        {
            int n = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++) if (items[i].Kind == kind) n += items[i].Count;
            return n;
        }

        private static void Run(Simulation sim, int ticks) { for (int t = 0; t < ticks; t++) sim.Tick(); }

        /// <summary>One batch is 300 s of bench work plus fetch travel; 12 000 ticks (20 sim-min)
        /// clears a couple of them on this four-tile walk with room to spare.</summary>
        private const int TwoBatchTicks = 12_000;

        // ══════════════════════════════════════════════════════ 1. the chain, end to end

        /// <summary>
        /// THE HEADLINE CLAIM, DRIVEN: a crew member fetches hold ice, melts it at the melter, and
        /// the water lands in a tank on the melter's fluid network. Every leg is asserted from
        /// observable state, and the preconditions (§5.2 rule 3) are asserted before the outcome:
        /// the melter really is powered, really is on a fluid network, and the ice really did start
        /// out of reach of the bench.
        ///
        /// MUTATION THAT MAKES THIS FAIL: delete the <c>WaterSystem.OnBatchComplete</c> call from
        /// <c>CraftingSystem.DriveWorker</c> — the ice is still consumed (the batch still runs) and
        /// NOT ONE LITRE appears anywhere. That is the exact shape of the bug this package could
        /// most easily have shipped: a chain that looks busy and produces nothing.
        /// </summary>
        [Test]
        public void CrewFetchIce_MeltIt_AndTheWaterLandsInATankOnTheMelterSNetwork()
        {
            var defs = SimDefs.CreateDefault();
            var sim = BuildMelterScenario(defs, iceUnits: 4);
            var melter = Dev(sim, "melter");
            var tank = Dev(sim, "tank");

            Run(sim, 20); // let Power and Water settle their networks
            Assert.That(melter.Powered, Is.True, "PRECONDITION: the melter is on the power network");
            Assert.That(melter.FluidNetworkId, Is.Not.EqualTo(0),
                "PRECONDITION: the melter is plumbed");
            Assert.That(tank.FluidNetworkId, Is.EqualTo(melter.FluidNetworkId),
                "PRECONDITION: the tank is on the SAME fluid network");
            Assert.That(Int3.IsAdjacent4(new Int3(1, 2, 0), melter.Pos), Is.False,
                "PRECONDITION: the ice starts out of reach — it has to be HAULED, not merely counted");
            Assert.That(UnitsAnywhere(sim, ItemKind.Ice), Is.EqualTo(4));
            Assert.That(tank.StoredLiters, Is.EqualTo(0f), "PRECONDITION: the tank starts empty");

            Run(sim, TwoBatchTicks * 2);
            Assert.That(melter.Progress, Is.EqualTo(0f),
                "PRECONDITION: no batch is MID-FLIGHT. Inputs are consumed when a batch STARTS and " +
                "the litres arrive when it COMPLETES, so an exact ice-to-litres comparison taken " +
                "across a running batch is short by one unit and means nothing.");

            int consumed = 4 - UnitsAnywhere(sim, ItemKind.Ice);
            Assert.That(consumed, Is.GreaterThan(0), "the crew melted at least one unit of ice");
            Assert.That(tank.StoredLiters, Is.GreaterThan(0f), "and the water reached the TANK");
            Assert.That(tank.StoredLiters + melter.StoredLiters,
                        Is.EqualTo(consumed * defs.Water.IceLitersPerUnit).Within(0.001f),
                        "every consumed unit became exactly ice_liters_per_unit litres, all of it " +
                        "accounted for between the tank and the melter's buffer");
        }

        /// <summary>
        /// MELTWATER IS CLEAN — it does NOT pay the reclaimer's 7 %. This is the difference between
        /// the melter and the reclaimer, and it is the whole reason the melter is a separate pass
        /// rather than a second kind of reclaimer: a reclaimer recovers greywater, a melter creates
        /// potable water out of a solid.
        ///
        /// It also pins that the melter does NOT touch the greywater pool: an implementation that
        /// pushed meltwater into <see cref="Simulation.WastewaterLiters"/> and let the reclaimer
        /// carry it (which is the tempting shortcut, because it needs no plumbing) would deliver
        /// <c>0.93 ×</c> the litres and would show up here.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>WaterSystem.RunMelters</c>, scale the moved litres
        /// by <c>water.ReclaimEfficiency</c> — the delivered total drops to 93 % and the equality
        /// fails by 7 %.
        /// </summary>
        [Test]
        public void MeltwaterIsClean_ItDoesNotPayTheReclaimersSevenPercent()
        {
            var defs = SimDefs.CreateDefault();
            var sim = BuildMelterScenario(defs, iceUnits: 3);
            float greyBefore = sim.WastewaterLiters;

            Run(sim, TwoBatchTicks * 2);
            Assert.That(Dev(sim, "melter").Progress, Is.EqualTo(0f),
                "PRECONDITION: no batch mid-flight (see the headline test for why that matters)");

            int consumed = 3 - UnitsAnywhere(sim, ItemKind.Ice);
            Assert.That(consumed, Is.GreaterThan(0), "PRECONDITION: something actually melted");

            float delivered = Dev(sim, "tank").StoredLiters + Dev(sim, "melter").StoredLiters;
            Assert.That(delivered, Is.EqualTo(consumed * defs.Water.IceLitersPerUnit).Within(0.001f),
                "100 % of the ice's litres arrive; there is no efficiency term on this hop");
            Assert.That(sim.WastewaterLiters, Is.LessThanOrEqualTo(greyBefore),
                "and none of it was routed through the greywater pool");
        }

        // ══════════════════════════════════════════════════════ 2. the def fields are really read

        /// <summary>
        /// THE CONSUMPTION TRIPWIRE for <c>ice_liters_per_unit</c> (CLAUDE.md's def-field ritual:
        /// a def with no consumer is a lie). Two identical ships differing ONLY in that scalar must
        /// deliver proportionally different litres per unit of ice consumed.
        ///
        /// Expressed as a RATIO of (litres per unit consumed) rather than as an absolute, so the
        /// two legs need not melt the same number of units for the assertion to mean something.
        ///
        /// MUTATION THAT MAKES THIS FAIL: replace <c>water.IceLitersPerUnit</c> in
        /// <c>WaterSystem.OnBatchComplete</c> with the literal <c>25f</c> — the two legs deliver
        /// the same litres per unit and the ratio collapses to 1.
        /// </summary>
        [Test]
        public void IceLitersPerUnit_IsReallyRead_NotAConstant()
        {
            float LitresPerUnit(float perUnit)
            {
                var defs = SimDefs.CreateDefault();
                defs.Water.IceLitersPerUnit = perUnit;
                defs.Water.MelterBufferLiters = 10_000f; // out of the way — this test is not about backpressure
                defs.ComputeChecksum();
                var sim = BuildMelterScenario(defs, iceUnits: 3);
                Run(sim, TwoBatchTicks * 2);
                Assert.That(Dev(sim, "melter").Progress, Is.EqualTo(0f), "no batch mid-flight");
                int consumed = 3 - UnitsAnywhere(sim, ItemKind.Ice);
                Assert.That(consumed, Is.GreaterThan(0), "PRECONDITION: something melted at " + perUnit + " L/unit");
                return (Dev(sim, "tank").StoredLiters + Dev(sim, "melter").StoredLiters) / consumed;
            }

            float low = LitresPerUnit(10f);
            float high = LitresPerUnit(40f);
            Assert.That(low, Is.EqualTo(10f).Within(0.001f));
            Assert.That(high, Is.EqualTo(40f).Within(0.001f));
            Assert.That(high / low, Is.EqualTo(4f).Within(0.001f),
                "the scalar sets the yield; a hard-coded litre count would make this ratio 1");
        }

        /// <summary>
        /// THE CONSUMPTION TRIPWIRE for <c>melter_buffer_liters</c>, and the BACKPRESSURE rule it
        /// exists for: an UNPLUMBED melter fills its buffer and then stops recruiting, so the rest
        /// of the hold's ice is still there. Without the gate the crew would keep melting into an
        /// overflow that is thrown away — burning a finite, hauled resource for nothing.
        ///
        /// The buffer is set to exactly two batches, so the arithmetic is checkable by eye: at
        /// 25 L/unit and a 50 L buffer, exactly 2 units melt and 6 of the 8 survive.
        ///
        /// MUTATION THAT MAKES THIS FAIL: delete the <c>if (!WaterSystem.HasMeltHeadroom(...))
        /// return;</c> line from <c>CraftingSystem.TickStation</c> — every unit of ice is consumed
        /// and the melter's buffer clamps at 50 L, so 6 units of hold cargo evaporate.
        /// SECOND MUTATION: make <c>HasMeltHeadroom</c> return <c>true</c> unconditionally — same
        /// result, and it proves the gate and not merely its call site.
        /// </summary>
        [Test]
        public void AnUnplumbedMelter_FillsItsBufferThenStops_AndTheRestOfTheIceSurvives()
        {
            var defs = SimDefs.CreateDefault();
            defs.Water.IceLitersPerUnit = 25f;
            defs.Water.MelterBufferLiters = 50f;   // exactly two batches
            defs.ComputeChecksum();

            var sim = BuildMelterScenario(defs, iceUnits: 8, plumbed: false);
            var melter = Dev(sim, "melter");
            Run(sim, 20);
            Assert.That(melter.Powered, Is.True, "PRECONDITION: the melter has power (only WATER is missing)");
            Assert.That(melter.FluidNetworkId, Is.EqualTo(0),
                "PRECONDITION: and it is genuinely unplumbed");

            Run(sim, TwoBatchTicks * 3);   // long enough for six more batches, had they been allowed

            Assert.That(melter.StoredLiters, Is.EqualTo(50f).Within(0.001f),
                "the buffer filled to capacity");
            Assert.That(UnitsAnywhere(sim, ItemKind.Ice), Is.EqualTo(6),
                "and then the melter STOPPED: exactly two units were spent, six are still hold cargo");
        }

        /// <summary>
        /// The same backpressure, on the case that actually happens in play: the melter IS plumbed,
        /// but the network's tanks are full. The melter drains into the tank at 2 Hz, so the buffer
        /// only stays full when the network cannot take any more — and then the ice stops burning.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>WaterSystem.RunMelters</c>, drop the
        /// <c>if (room &lt;= 0f) continue;</c> guard and always move the buffer's contents — the
        /// tank overshoots its capacity, the buffer empties, and the melter never stops (the ice
        /// count falls below 6). This is the assertion that catches a melter that quietly exceeds
        /// tank_capacity_liters.
        /// </summary>
        [Test]
        public void AFullNetwork_StopsTheMelter_RatherThanOverfillingTheTank()
        {
            var defs = SimDefs.CreateDefault();
            defs.Water.IceLitersPerUnit = 25f;
            defs.Water.MelterBufferLiters = 50f;
            defs.ComputeChecksum();

            var sim = BuildMelterScenario(defs, iceUnits: 8, tankLiters: defs.Water.TankCapacityLiters);
            var melter = Dev(sim, "melter");
            var tank = Dev(sim, "tank");
            Run(sim, 20);
            Assert.That(melter.FluidNetworkId, Is.Not.EqualTo(0), "PRECONDITION: plumbed");
            Assert.That(tank.StoredLiters, Is.EqualTo(defs.Water.TankCapacityLiters).Within(0.001f),
                "PRECONDITION: the tank starts FULL");

            Run(sim, TwoBatchTicks * 3);

            Assert.That(tank.StoredLiters, Is.LessThanOrEqualTo(defs.Water.TankCapacityLiters + 0.001f),
                "a tank is never overfilled");
            Assert.That(UnitsAnywhere(sim, ItemKind.Ice), Is.EqualTo(6),
                "and the crew stopped burning hold ice once there was nowhere to put the water");
        }

        // ══════════════════════════════════════════════════════ 3. the B-2 decision

        /// <summary>
        /// THE B-2 DECISION, both directions, on the SAME ship. B-2's greywater makeup floor is the
        /// stand-in for this package ("an abstract shipwide condensate/ice makeup",
        /// <c>WaterSystem.cs</c>) and running both would be a double faucet in which the ice chain
        /// is decorative. So the floor is suppressed on a ship that owns a melter — and ONLY on
        /// such a ship, because deleting it outright would re-kill the food loop on the grid ship,
        /// the 2-crew reference and every procedural ship, none of which has ice.
        ///
        /// Two sims, identical but for one device. Both start with a bone-dry greywater pool.
        ///
        /// MUTATION THAT MAKES THIS FAIL: delete the <c>if (HasIceChain(sim)) return;</c> line from
        /// <c>WaterSystem.RunMakeup</c> — the melter ship's pool is floored too, and the "no makeup"
        /// assertion fails. SECOND MUTATION: invert the guard to <c>if (!HasIceChain(sim)) return;</c>
        /// — the NO-melter ship loses the B-2 fix, and the second assertion fails. The pair is what
        /// makes this a decision rather than a one-way switch.
        /// </summary>
        [Test]
        public void TheB2MakeupFloor_IsSuppressedByAMelter_AndOnlyByAMelter()
        {
            var defs = SimDefs.CreateDefault();
            Assert.That(defs.Water.MakeupFloorLiters, Is.GreaterThan(0f),
                "PRECONDITION: the stand-in is switched on in shipped defs, or this measures nothing");

            var withMelter = BuildMelterScenario(defs, iceUnits: 0);
            var withoutMelter = BuildMelterScenario(defs, iceUnits: 0);
            withoutMelter.RemoveDevice(Dev(withoutMelter, "melter").Id);

            withMelter.WastewaterLiters = 0f;
            withoutMelter.WastewaterLiters = 0f;
            Run(withMelter, 50);
            Run(withoutMelter, 50);

            Assert.That(withMelter.WastewaterLiters, Is.EqualTo(0f).Within(0.001f),
                "A SHIP WITH A MELTER GETS NO FREE WATER: its greywater pool stays exactly where the " +
                "loop left it. This is the whole point of the package — if the floor still ran, every " +
                "measurement of the ice chain would be measuring the stand-in.");
            Assert.That(withoutMelter.WastewaterLiters, Is.EqualTo(defs.Water.MakeupFloorLiters).Within(0.001f),
                "...and a ship with NO melter keeps B-2 unchanged (the grid ship, the 2-crew " +
                "reference, every procedural ship)");
        }

        /// <summary>
        /// The suppression tests for the melter's EXISTENCE, not its readiness. An unpowered or
        /// broken melter must NOT silently re-arm the stand-in: if it did, a brownout would quietly
        /// refill the tanks and the player would never learn that the melter is what feeds them —
        /// the "invisible feedback is functional" failure, inverted.
        ///
        /// MUTATION THAT MAKES THIS FAIL: add <c>&amp;&amp; devices[i].Powered</c> to
        /// <c>WaterSystem.HasIceChain</c>'s test — the unpowered ship's pool is floored again.
        /// </summary>
        [Test]
        public void AnUnpoweredMelter_StillSuppressesTheStandIn()
        {
            var defs = SimDefs.CreateDefault();
            var sim = BuildMelterScenario(defs, iceUnits: 0);
            sim.RemoveDevice(Dev(sim, "solar").Id);   // no generation anywhere on the ship

            Run(sim, 30);
            Assert.That(Dev(sim, "melter").Powered, Is.False,
                "PRECONDITION: the melter really has lost power");

            sim.WastewaterLiters = 0f;
            Run(sim, 50);
            Assert.That(sim.WastewaterLiters, Is.EqualTo(0f).Within(0.001f),
                "a dark melter is still a melter — the ship is on the ice economy and stays on it");
        }

        // ══════════════════════════════════════════════════════ 4. nothing else changed

        /// <summary>
        /// THE NO-OP CLAIM. Both hooks E0-7 put into <c>CraftingSystem</c> are guarded on
        /// <see cref="DeviceKind.IceMelter"/>, so a Fabricator must behave exactly as before: it
        /// recruits, it consumes Scrap, it spawns Parts, and it never accrues a litre.
        ///
        /// Driven through the real crafting path rather than asserted about the guards, because the
        /// guards are what is being doubted.
        ///
        /// MUTATION THAT MAKES THIS FAIL: delete the <c>if (station.Kind != DeviceKind.IceMelter)
        /// return;</c> line from <c>WaterSystem.OnBatchComplete</c> — the Fabricator's completed
        /// batches start filling its StoredLiters (its bill has no Ice port, so units is 0 and it
        /// returns early anyway; the honest mutation is to drop BOTH that line and the
        /// <c>units &lt;= 0</c> early return, after which the fabricator buffers water).
        /// SECOND MUTATION: make <c>HasMeltHeadroom</c> return <c>false</c> unconditionally — the
        /// Fabricator never recruits and makes no Parts at all.
        /// </summary>
        [Test]
        public void AFabricator_IsUntouched_ByBothMelterHooks()
        {
            var defs = SimDefs.CreateDefault();
            string[] map = { "#######", "#.....#", "#.....#", "#######" };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), 42, SystemStack.CreateDefault(moss), defs);
            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            var fab = sim.AddDevice(DeviceKind.Fabricator, new Int3(3, 2, 0), "fab");
            sim.AddCitizen("Smith", new Int3(1, 2, 0));
            sim.AddItem(ItemKind.Scrap, 6, new Int3(1, 2, 0));
            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));

            Assert.That(ProductionDefs.TryGetBill(defs, DeviceKind.Fabricator, out var fabBill), Is.True,
                "PRECONDITION: the fabricator still resolves a bill");
            Assert.That(WaterSystem.HasMeltHeadroom(sim, fab, fabBill), Is.True,
                "the backpressure gate is transparent to every station that is not a melter");

            Run(sim, 30_000);   // the legacy Scrap→Parts bill is 900 s of work

            Assert.That(UnitsAnywhere(sim, ItemKind.Parts), Is.GreaterThan(0),
                "the fabricator still crafts");
            Assert.That(UnitsAnywhere(sim, ItemKind.Scrap), Is.LessThan(6),
                "...consuming its input, exactly as before");
            Assert.That(fab.StoredLiters, Is.EqualTo(0f),
                "and it never accrued a litre of anything");
        }

        // ══════════════════════════════════════════════════════ 5. determinism & persistence

        /// <summary>
        /// THE TWIN. Two melter ships built the same way must hash identically at every checkpoint.
        /// Never asserts a literal hash (ECONOMY-PLAN §2.1 rule 4) — only that the twins agree.
        ///
        /// The chain introduces two new scans over the device store (RunMelters, HasIceChain) and a
        /// float accumulation into <c>Device.StoredLiters</c>; this is what says none of them
        /// depends on anything but store order.
        ///
        /// MUTATION THAT MAKES THIS FAIL: nothing here, on its own — with ONE tank the tie-break
        /// cannot be exercised at all. See
        /// <see cref="TheTankTieBreak_KeepsTheEARLIERTank_OnATwoTankNetwork"/>, which is the leg
        /// that pins it. ⚠ AN EARLIER DRAFT OF THIS COMMENT CLAIMED THE TWO-TANK LEG EXISTED AND IT
        /// DID NOT: the <c>&lt;=</c> mutation survived the entire gate. Found in independent review;
        /// the named mutation is now attached to a test that can actually fail on it.
        /// </summary>
        [Test]
        public void TwoIdenticalMelterShips_StayHashEqual()
        {
            var a = BuildMelterScenario(SimDefs.CreateDefault(), iceUnits: 6);
            var b = BuildMelterScenario(SimDefs.CreateDefault(), iceUnits: 6);
            Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), "twins start equal");

            for (int t = 1; t <= TwoBatchTicks; t++)
            {
                a.Tick();
                b.Tick();
                if (t % 1000 == 0)
                    Assert.That(b.StateHash(), Is.EqualTo(a.StateHash()), $"diverged at tick {t}");
            }
            // NON-VACUITY: the run must actually have done something, or two frozen sims agree.
            Assert.That(UnitsAnywhere(a, ItemKind.Ice), Is.LessThan(6), "ice really was melted");
            Assert.That(Dev(a, "tank").StoredLiters, Is.GreaterThan(0f), "water really was made");
        }

        /// <summary>
        /// A HALF-FULL MELTER SURVIVES SAVE/LOAD, and — the part a hash-at-load comparison misses —
        /// keeps behaving identically for a thousand ticks afterwards (ECONOMY-PLAN §5.1: "a restore
        /// that drops a derived index hashes equal AT LOAD and diverges hundreds of ticks later").
        /// The melter's buffer rides <see cref="Device.StoredLiters"/>, which DEVC already saves and
        /// hashes, so this package adds no new save surface — and this test is what makes that claim
        /// checkable rather than asserted.
        ///
        /// The precondition matters: if the melter's buffer were empty at save time the round trip
        /// would prove nothing, so the buffer is asserted non-zero AND non-full first.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>SaveWriter</c>, write <c>0f</c> instead of
        /// <c>d.StoredLiters</c> — the restored melter has an empty buffer, the load-time hash
        /// differs, and the ship's water total is short by the buffered litres.
        /// </summary>
        [Test]
        public void AHalfFullMelter_RoundTripsThroughASave_AndKeepsTickingIdentically()
        {
            var defs = SimDefs.CreateDefault();
            defs.Water.MelterBufferLiters = 200f;   // deep enough that a batch does not fill it
            defs.ComputeChecksum();

            // Unplumbed, so the buffer HOLDS its litres instead of draining to a tank the instant
            // they land — that is what gives the save something to carry.
            var sim = BuildMelterScenario(defs, iceUnits: 4, plumbed: false);
            Run(sim, TwoBatchTicks);
            var melter = Dev(sim, "melter");
            Assert.That(melter.StoredLiters, Is.GreaterThan(0f).And.LessThan(200f),
                "PRECONDITION: the melter is holding a PARTIAL buffer at save time");

            var blob = new MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;
            var moss = new ScriptRuntime(new DeviceRegistry());
            var loaded = SaveReader.Read(blob, SystemStack.CreateDefault(moss), defs);

            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "the load-time hash matches");
            Assert.That(Dev(loaded, "melter").StoredLiters, Is.EqualTo(melter.StoredLiters).Within(0.0001f),
                "and the buffered litres are the field that carried it");

            // CONTROLLED CONFOUND, borrowed verbatim from SaveRestoreRunOnTests: a load leaves the
            // room partition dirty, so the loaded sim takes a Recompute the uninterrupted twin does
            // not, and RoomState.RemapGas is not bit-idempotent (a pre-existing defect, HANDOVER
            // "Save-reload thermal ULP drift"). Marking the twin dirty puts the identical recompute
            // on BOTH sides so the run-on comparison can demand exact equality instead of a band.
            sim.Rooms.MarkDirty();

            for (int t = 1; t <= 1000; t++)
            {
                sim.Tick();
                loaded.Tick();
            }
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "...and a thousand ticks later they are STILL identical (nothing derived was dropped)");
        }

        // ══════════════════════════════════════════════════════ 6. zero-alloc

        /// <summary>
        /// The two passes E0-7 adds to <c>WaterSystem.Tick</c> (<c>RunMelters</c> and
        /// <c>HasIceChain</c>, the latter running every pass on every ship) allocate nothing in
        /// steady state — the tick-path rule, and this one is on the 2 Hz path of EVERY ship, not
        /// just a ship with a melter.
        ///
        /// PRECONDITION ASSERTED BEFORE THE OUTCOME (§5.1): the window is chosen so the melter is
        /// actually MOVING litres during it, and the test says so — a window in which the melter
        /// buffer never changed would measure an early <c>continue</c> and prove nothing.
        ///
        /// Batch COMPLETION is deliberately outside the claim: it allocates nothing here (the
        /// melter's bill spawns no output stacks) but the crafting path around it does, and that
        /// cost is pre-existing and measured by <c>DefsProductionTests</c>.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>RunMelters</c>, replace the store scan with
        /// <c>foreach (var d in new List&lt;Device&gt;(sim.Devices.Items))</c> — one list per pass,
        /// 2 Hz, and the measured delta stops being 0.
        /// </summary>
        [Test]
        public void TheMelterPasses_AllocateNothing_WhileReallyMovingWater()
        {
            var defs = SimDefs.CreateDefault();
            defs.Water.IceLitersPerUnit = 25f;
            defs.Water.MelterBufferLiters = 10_000f;   // never full ⇒ the melter always has work
            defs.ComputeChecksum();

            var sim = BuildMelterScenario(defs, iceUnits: 40);
            Run(sim, TwoBatchTicks);   // warm up: JIT, network rebuilds, first batches
            var melter = Dev(sim, "melter");
            var tank = Dev(sim, "tank");

            // Prime the buffer so RunMelters has litres to move during the measured window,
            // independently of whether a batch happens to complete inside it.
            melter.StoredLiters = 500f;
            float tankBefore = tank.StoredLiters;

            long before = GC.GetAllocatedBytesForCurrentThread();
            for (int t = 0; t < 3000; t++) sim.Tick();
            long delta = GC.GetAllocatedBytesForCurrentThread() - before;

            Assert.That(tank.StoredLiters, Is.GreaterThan(tankBefore),
                "PRECONDITION: RunMelters really moved litres inside the measured window");
            Assert.That(delta, Is.EqualTo(0L),
                "the melter passes allocated " + delta + " bytes over 3000 ticks");
        }

        /// <summary>
        /// THE TANK TIE-BREAK, ON A NETWORK THAT CAN ACTUALLY SHOW IT. <c>RunMelters</c> picks the
        /// least-full tank with a strict <c>&lt;</c>, so a tie keeps the EARLIER tank in device
        /// store order — the same rule <c>RunReclaimers</c> uses, deliberately, so the two passes
        /// cannot drift apart.
        ///
        /// This needs TWO tanks at the SAME level on ONE fluid network, which no other fixture in
        /// this file (or the repo) builds: with a single tank the argmin has nothing to choose
        /// between and a <c>&lt;=</c> would be inert. That is exactly why this test exists — the
        /// mutation was NAMED by the determinism test above and pinned by nothing, and it survived
        /// the full 1034-test gate.
        ///
        /// It is not a style point. Store order IS the hash order (ECONOMY-PLAN §4.1), so a
        /// non-strict argmin moves which tank holds the litres, which moves <c>StateHash</c>, on
        /// every ship whose water loop has redundant tankage.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>WaterSystem.RunMelters</c>, change
        /// <c>tank.StoredLiters &lt; target.StoredLiters</c> to <c>&lt;=</c> — the meltwater lands
        /// in <c>tank_b</c> instead. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void TheTankTieBreak_KeepsTheEARLIERTank_OnATwoTankNetwork()
        {
            var defs = SimDefs.CreateDefault();
            var sim = BuildMelterScenario(defs, iceUnits: 0, secondTank: true);
            var melter = Dev(sim, "melter");
            var first = Dev(sim, "tank");
            var second = Dev(sim, "tank_b");

            Run(sim, 20);
            // PRECONDITIONS — without all four the argmin has nothing to choose between and this
            // test would pass under either spelling.
            Assert.That(first.FluidNetworkId, Is.Not.EqualTo(0), "tank is plumbed");
            Assert.That(second.FluidNetworkId, Is.EqualTo(first.FluidNetworkId),
                "and BOTH tanks are on the melter's ONE network");
            Assert.That(second.StoredLiters, Is.EqualTo(first.StoredLiters),
                "and they are exactly TIED, which is the only case a tie-break decides");
            var devices = sim.Devices.Items;
            int iFirst = devices.IndexOf(first), iSecond = devices.IndexOf(second);
            Assert.That(iFirst, Is.LessThan(iSecond),
                "and 'tank' really is the EARLIER of the two in device store order");

            // ONE drain, from a primed buffer, with no crew in the loop. The tie-break decides only
            // the FIRST delivery — after it the earlier tank is no longer tied and the argmin
            // legitimately moves on — so a multi-batch run would fill both tanks under either
            // spelling and prove nothing. This is the single decision, isolated.
            melter.StoredLiters = 10f;
            Run(sim, 10);   // one 2 Hz Water pass, with margin

            Assert.That(first.StoredLiters, Is.EqualTo(10f).Within(0.001f),
                "a tie keeps the EARLIER tank — strict '<', exactly as RunReclaimers does");
            Assert.That(second.StoredLiters, Is.EqualTo(0f),
                "...and the later tank got nothing from this pass");
            Assert.That(melter.StoredLiters, Is.EqualTo(0f).Within(0.001f),
                "PRECONDITION (after the fact): the buffer really drained, so a decision was made");
        }

        /// <summary>
        /// THE GATE AND THE COMPLETION AGREE ON WHAT A BATCH IS WORTH, on a bill that is not
        /// <c>Ice:1</c>. <c>OnBatchComplete</c> adds <c>IceLitersPerUnit × units</c>; the first
        /// draft's <c>HasMeltHeadroom</c> tested ONE unit's yield, and the two agreed only because
        /// the shipped bill happens to consume one. The doc comment promising that retuning to
        /// <c>Ice:4</c> "scales the yield without touching code" was itself the thing that broke
        /// them: at <c>Ice:4</c> the gate admitted a batch the buffer could not hold, and 4 units of
        /// hauled hold ice bought 30 L instead of 100.
        ///
        /// The arithmetic is chosen to be checkable by eye: 25 L/unit × 4 units = 100 L a batch,
        /// against a 130 L buffer. One batch fits. A second does not, and must never start.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>HasMeltHeadroom</c>, drop the <c>* units</c> (back
        /// to the one-unit test) — a second batch starts, 8 units of ice are consumed instead of 4,
        /// and the buffer clamps at 130 L having destroyed 70 L. (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void AMultiUnitBill_IsGatedOnTheWHOLEBatchsYield_NotOnOneUnits()
        {
            var problems = new List<string>();
            var defs = DefsParser.Parse(
                new[] { ("test.def", "[production]\nmelt_ice IceMelter 300 Ice:4 none\n") }, problems);
            Assert.That(problems, Is.Empty, string.Join(" | ", problems));
            defs.Water.IceLitersPerUnit = 25f;
            defs.Water.MelterBufferLiters = 130f;   // exactly one 100 L batch, with 30 L to spare
            defs.ComputeChecksum();

            Assert.That(ProductionDefs.TryGetBill(defs, DeviceKind.IceMelter, out var bill), Is.True);
            Assert.That(bill.Input(0).Count, Is.EqualTo(4),
                "PRECONDITION: the overlay really retuned melt_ice to a four-unit bill");

            // Unplumbed on purpose: the buffer is then the ONLY thing the gate can be reading.
            var sim = BuildMelterScenario(defs, iceUnits: 12, plumbed: false);
            var melter = Dev(sim, "melter");
            Run(sim, TwoBatchTicks * 3);   // time for three batches, if they were allowed

            Assert.That(melter.StoredLiters, Is.EqualTo(100f).Within(0.001f),
                "one batch landed WHOLE — nothing was clamped away");
            Assert.That(UnitsAnywhere(sim, ItemKind.Ice), Is.EqualTo(8),
                "and exactly ONE batch ran: 4 of 12 units spent, the other 8 still hold cargo");
        }

        /// <summary>
        /// FREE WATER IS CLAIMED BEFORE FINITE WATER. <c>WaterSystem.Tick</c> runs
        /// <c>RunReclaimers</c> before <c>RunMelters</c>, so recycled greywater — which the ship
        /// gets for nothing — takes tank headroom ahead of meltwater the crew hauled up a ladder as
        /// finite hold cargo.
        ///
        /// This is a PRIORITY decision dressed as a plumbing detail, and E0-7 shipped it the wrong
        /// way round in its first draft ("land meltwater before the tanks are drawn from"). The cost
        /// was not a rounding error: measured on the slice, melter-first burned 335 units of hold
        /// ice over 3 sim-days against 224 reclaim-first (−33 %), for identical food and identical
        /// full tanks. Nothing was traded for it. It survived review's whole mutation sweep because
        /// NOTHING PINNED IT — this test is that pin.
        ///
        /// Driven on one Water pass with both sources primed and exactly one tank's worth of
        /// headroom to compete for, so the outcome is the ordering and nothing else.
        ///
        /// MUTATION THAT MAKES THIS FAIL: swap the two calls in <c>WaterSystem.Tick</c> back —
        /// the melter drains into the headroom first and the pool is left holding the greywater.
        /// (Applied, observed red, reverted.)
        /// </summary>
        [Test]
        public void TheReclaimerClaimsTankHeadroomBeforeTheMelterDoes()
        {
            var defs = SimDefs.CreateDefault();
            // 10 L of headroom: less than either source could fill on its own, so exactly one of
            // them gets it and which one IS the assertion.
            var sim = BuildMelterScenario(defs, iceUnits: 0, tankLiters: defs.Water.TankCapacityLiters - 10f,
                                          reclaimer: true);
            var tank = Dev(sim, "tank");
            var melter = Dev(sim, "melter");
            var recl = Dev(sim, "reclaimer");

            Run(sim, 20);
            Assert.That(recl.FluidNetworkId, Is.EqualTo(tank.FluidNetworkId),
                "PRECONDITION: the reclaimer is on the tank's network");
            Assert.That(melter.FluidNetworkId, Is.EqualTo(tank.FluidNetworkId),
                "PRECONDITION: and so is the melter — they are competing for ONE tank");
            Assert.That(recl.Powered, Is.True, "PRECONDITION: the reclaimer can run");

            // Prime both sources. The greywater pool is the reclaimer's input; the buffer is the
            // melter's. Both are re-primed each pass so neither runs out and 'who got there first'
            // stays the only variable.
            // The headroom is RESET every pass as well, because a reclaimer fills 0.025 L a pass and
            // would otherwise close the 10 L gap once and leave every later pass measuring a full
            // tank — which is a no-op for BOTH sources and would make this test vacuous.
            float reclaimed = 0f, meltedAway = 0f;
            for (int pass = 0; pass < 6; pass++)
            {
                tank.StoredLiters = defs.Water.TankCapacityLiters - 10f;
                sim.WastewaterLiters = 200f;
                melter.StoredLiters = 200f;
                Run(sim, 5);                       // exactly one 2 Hz Water pass
                reclaimed += 200f - sim.WastewaterLiters;
                meltedAway += 200f - melter.StoredLiters;
            }

            // THE DISCRIMINATOR. A melter drains min(buffer, headroom) — with 200 L buffered against
            // 10 L of headroom it takes ALL of it — so under melter-first the reclaimer finds a full
            // tank every pass and moves exactly nothing. Reclaim-first, the reclaimer takes its
            // rate-limited share FIRST and the melter fills only the remainder.
            Assert.That(reclaimed, Is.GreaterThan(0f),
                "THE RECLAIMER GOT NOTHING. Free recycled greywater must claim tank headroom before " +
                "finite hauled meltwater does — check the call order in WaterSystem.Tick.");
            Assert.That(meltedAway, Is.GreaterThan(0f),
                "PRECONDITION: the melter was draining too, or 'the reclaimer went first' is a " +
                "statement about a race with only one runner");
            Assert.That(reclaimed + meltedAway, Is.EqualTo(60f).Within(0.05f),
                "and between them they filled exactly the headroom offered (6 passes x 10 L) — so " +
                "the split above is a PRIORITY, not one source simply being absent");
        }

        // ══════════════════════════════════════════════════ 6b. the AUTHORED chain, on the fixture

        /// <summary>
        /// THE CHAIN IS REALLY WIRED ON THE SHIP THAT SHIPS. Everything above drives a four-tile
        /// test scenario; this drives <c>--ship slice</c>, the economy programme's measurement
        /// fixture, and asserts the three things that make the authoring correct rather than merely
        /// present. It exists because the failure mode here is SILENT: a melter placed one tile off
        /// the pipe run is unplumbed, fills its 100 L buffer, stops recruiting, and says nothing on
        /// any surface — the ship would simply be back on a dying water loop with a decorative
        /// machine in the hydro bay. (MECHANICS §13.17's unreachable-stockpile shape, again.)
        ///
        /// 6 000 ticks is 10 sim-minutes: two 300 s batches plus the cross-deck haul from the
        /// forward hold up the ladder to the hydro bay, with margin.
        ///
        /// MUTATION THAT MAKES THIS FAIL: in <c>AuthoredShips.AddIceMelterOnHydroLoop</c>, offset
        /// the melter by one tile (<c>Pos.Y + 2</c>) so it lands off the pipe run — it is still on
        /// the ship, still powered, still visible, and the fluid-network assertion fails, followed
        /// by the tank assertion. SECOND MUTATION: drop <c>AddIceAtTheForwardHold</c> entirely — the
        /// melter is plumbed and idle, and the ice-consumed assertion fails. (Both applied, observed
        /// red, reverted.)
        /// </summary>
        [Test]
        public void TheAuthoredSlice_MeltsHoldIceIntoTheHydroLoop()
        {
            var sim = GenSimHost.Build(AuthoredShips.PeriluneSlice()).Sim;

            Device melter = null, hydroTank = null;
            foreach (var d in sim.Devices.Items)
            {
                if (d.Kind == DeviceKind.IceMelter) melter = d;
                else if (d.Name == "tank_hydro") hydroTank = d;
            }
            Assert.That(melter, Is.Not.Null, "the slice authors exactly one ice melter");
            Assert.That(hydroTank, Is.Not.Null, "PRECONDITION: the hydro tank is still named tank_hydro");

            int iceAtBoot = UnitsAnywhere(sim, ItemKind.Ice);
            Assert.That(iceAtBoot, Is.GreaterThan(0), "PRECONDITION: the forward hold is stocked");

            Run(sim, 20);
            // (1) PLUMBED, and plumbed to the loop that is actually dying — the hydro loop, not the
            //     potable one. This is the assertion an off-by-one placement fails.
            Assert.That(melter.FluidNetworkId, Is.Not.EqualTo(0), "the melter is on a fluid network");
            Assert.That(melter.FluidNetworkId, Is.EqualTo(hydroTank.FluidNetworkId),
                "and it is the HYDRO loop's network — the melter must feed the loop that loses the water");
            Assert.That(melter.Powered, Is.True, "and it is powered at boot");

            float tankAtBoot = hydroTank.StoredLiters;
            Run(sim, 6000);

            // (2) The crew really haul and melt: the hold is smaller than it was.
            Assert.That(UnitsAnywhere(sim, ItemKind.Ice), Is.LessThan(iceAtBoot),
                "the crew fetched hold ice up the ladder and melted it");
            // (3) ...and the water landed where it was needed.
            Assert.That(hydroTank.StoredLiters + melter.StoredLiters, Is.GreaterThan(tankAtBoot),
                "meltwater reached the hydro loop (tank plus the melter's own buffer)");
        }

        // ══════════════════════════════════════════════════════ 7. the enum gap

        /// <summary>
        /// <see cref="ItemKind.Ice"/> is 8, NOT 7, and slot 7 is E0-6's <see cref="ItemKind.Seals"/>.
        /// The integrator pre-assigned those two slots so the lanes could not collide on a byte that
        /// is written into every save (ECONOMY-PLAN §2.1 rule 2). Pinned by NAME and by VALUE because
        /// a well-meaning tidy-up that renumbered either would silently re-label every stack in every
        /// existing save.
        ///
        /// RENAMED AT THE WAVE MERGE. It was <c>IceIsKindEight_LeavingSevenReservedForTheSiblingLane</c>
        /// and asserted <c>Enum.IsDefined(ItemKind, 7)</c> is FALSE — true on E0-7's branch, where 7
        /// was reserved but absent, and false the moment E0-6 landed and filled it. The slot being
        /// EMPTY was never the property worth pinning; the property is that Ice took 8 and left 7 to
        /// its owner, which is now checkable positively: 7 exists AND it is Seals, not Ice.
        ///
        /// MUTATION THAT MAKES THIS FAIL: renumber <c>Ice = 7</c> (which also collides with Seals) or
        /// swap the two — the by-value assertions name which one moved.
        /// </summary>
        [Test]
        public void IceIsKindEight_AndSevenBelongsToTheSiblingLanesSeals()
        {
            Assert.That((int)ItemKind.Ice, Is.EqualTo(8));
            Assert.That((int)ItemKind.Seals, Is.EqualTo(7),
                "slot 7 was RESERVED for E0-6's Seals and the wave merge is what filled it");
            Assert.That(Enum.IsDefined(typeof(ItemKind), (byte)7), Is.True,
                "the hole is CLOSED — 0..9 contiguous. While it was open, three of the four " +
                "accept-all masks were count-derived and would have refused Ice; see " +
                "StockZoneSystemTests.AcceptAllMask_IsTheOrOfDeclaredItemKindValues_InEveryHostSpelling");
            Assert.That((int)ItemKind.Swarf, Is.EqualTo(9),
                "...and 9 went to the wreck start's Swarf, APPENDED past Ice. This line asserted " +
                "`IsDefined(9) is False` until then, which was never the property worth pinning — " +
                "the property is that Ice took 8 and nothing RENUMBERED it.");
            Assert.That(Enum.IsDefined(typeof(ItemKind), (byte)10), Is.False,
                "10 is the next free slot");
            Assert.That((int)DeviceKind.IceMelter, Is.EqualTo(26),
                "the melter appends at the END of DeviceKind; nothing is renumbered");
            Assert.That(Glyphs.ForItem(ItemKind.Ice), Is.EqualTo('i'));
            Assert.That(Glyphs.ForItem(ItemKind.Seals), Is.EqualTo('g'),
                "and the two lanes' glyphs are distinct");
            Assert.That(Glyphs.ForDevice(DeviceKind.IceMelter), Is.EqualTo('I'));
        }
    }
}
