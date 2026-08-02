using System.Collections.Generic;
using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// THE SALVAGE HALF of the recovery economy (wreck start, owner decision 3): a wrecked machine
    /// is worth something. Below the Parts cliff a stripped device pays <see cref="ItemKind.Swarf"/>,
    /// and Swarf's only use is the maintenance rung below a jury-rig.
    ///
    /// <para><b>WHY THE SHIPPED RULE HAD TO CHANGE.</b> <c>DeconstructSystem.DeviceYield</c> pays
    /// <c>floor(device_parts × Condition)</c> and therefore ZERO below Condition 0.5, with a source
    /// comment saying so on purpose — <i>"a wreck is worth nothing, which is the point"</i>. The
    /// wreck start's art badges every wrecked machine at 0 %–35 %, so under that rule stripping the
    /// entire dead half of a raided ship yields exactly nothing, and the premise
    /// (<i>salvaging the dead half feeds the living half</i>) is unbuildable.</para>
    ///
    /// <para><b>WHAT DID NOT CHANGE IS ASSERTED FIRST</b>, because it is the half that could break
    /// the shipped economy: at and above the cliff the Parts yield is byte-identical, and the
    /// place→strip round trip is still 3 Parts out and at most 2 back.</para>
    ///
    /// <para><b>CONSERVATION IS DRIVEN, NOT ARGUED.</b> §2 places a device out of a known Parts
    /// stock, wrecks it, strips it, and counts every stack on the floor.</para>
    /// </summary>
    public class SwarfSalvageTests
    {
        // ═══════════════════════════════════════════════════════════════════════════ helpers

        private static Simulation NewBay(SimDefs defs = null)
        {
            string[] map =
            {
                "########",
                "#......#",
                "#......#",
                "########",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), 42, SystemStack.CreateDefault(moss), defs);
            for (int x = 1; x <= 6; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.AddCitizen("Smith", new Int3(1, 2, 0)).GiveAllWork();
            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        private static int Units(Simulation sim, ItemKind kind)
        {
            int n = 0;
            foreach (var s in sim.Items.Items) if (s.Kind == kind) n += s.Count;
            return n;
        }

        private static void Run(Simulation sim, int ticks) { for (int t = 0; t < ticks; t++) sim.Tick(); }

        private static Device DeviceNamed(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            return null;
        }

        /// <summary>Designate a device strip and drive until the site is gone (or the budget runs
        /// out). Returns whether the strip actually completed, so no test can mistake "nothing was
        /// produced" for "nothing happened".</summary>
        private static bool StripDevice(Simulation sim, Int3 pos, int budgetTicks = 40000)
        {
            var decon = FindDeconstruct(sim);
            Assert.That(decon, Is.Not.Null, "the stack must carry a DeconstructSystem");
            Assert.That(decon.Designate(sim, pos, DeconstructKind.Device), Is.True,
                "premise: the tile must be a legal strip target");
            for (int t = 0; t < budgetTicks; t++)
            {
                sim.Tick();
                if (decon.Pending.Count == 0) return true;
            }
            return false;
        }

        private static DeconstructSystem FindDeconstruct(Simulation sim)
        {
            foreach (var s in sim.Systems) if (s is DeconstructSystem d) return d;
            return null;
        }

        // ═════════════════════════ 1. THE YIELD SPLIT — what changed, and what provably did not

        /// <summary>
        /// THE FULL YIELD CURVE, read off the two shipped functions across the whole Condition
        /// range. The Parts column is character-for-character the pre-wreck-start table (it is
        /// copied from <c>DeconstructSystemTests.DeviceYield_FloorsPartsByCondition…</c>, which
        /// still passes untouched); the Swarf column is the new far side of the cliff.
        ///
        /// <para><b>THE BOUNDARY IS NOT A LITERAL ANYWHERE</b>, and this test is what pins that.
        /// It derives the cliff from <c>device_parts</c> instead of writing 0.5, and drives a
        /// RETUNED defs graph (<c>device_parts = 3</c>) to prove the split MOVES with it. A
        /// hard-coded 0.5 in <c>DeconstructSystem</c> passes every other assertion in this file and
        /// fails only here.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): replace the
        /// <c>deviceYield == 0</c> test in <c>Complete</c> with <c>device.Condition &lt; 0.5f</c>.
        /// The shipped-defs rows all still pass; the retuned-defs rows fail.</para>
        /// </summary>
        [Test]
        public void TheCliffIsDerivedFromDeviceParts_NotWrittenDownAsAHalf()
        {
            var sim = NewBay();
            var d = sim.AddDevice(DeviceKind.Fabricator, new Int3(5, 2, 0), "subject");

            int PartsAt(float c) { d.Condition = c; return DeconstructSystem.DeviceYield(sim.Defs, d); }

            // ── shipped defs: device_parts = 2 ⇒ the cliff falls at Condition 0.5 ──
            Assert.That(sim.Defs.Deconstruct.DeviceParts, Is.EqualTo(2), "precondition for the rows below");
            var shipped = new List<(float c, int parts)>
            {
                (1.00f, 2), (0.75f, 1), (0.50f, 1), (0.49f, 0), (0.00f, 0),
            };

            // ── retuned defs: device_parts = 3 ⇒ the cliff MUST move to 1/3 ──
            var retuned = SimDefs.CreateDefault();
            retuned.Deconstruct.DeviceParts = 3;
            retuned.ComputeChecksum();
            int RetunedPartsAt(float c) { d.Condition = c; return DeconstructSystem.DeviceYield(retuned, d); }

            // …and the same retune DRIVEN through a real strip. Furniture (wear 0 in machines.def)
            // so the Condition at completion is exactly the Condition the test set.
            var retunedSim = NewBay(retuned);
            retunedSim.AddDevice(DeviceKind.Bed, new Int3(5, 2, 0), "subject").Condition = 0.40f;
            bool strippedUnderRetune = StripDevice(retunedSim, new Int3(5, 2, 0));
            int retunedParts = Units(retunedSim, ItemKind.Parts);
            int retunedSwarf = Units(retunedSim, ItemKind.Swarf);

            Assert.Multiple(() =>
            {
                foreach (var (c, parts) in shipped)
                    Assert.That(PartsAt(c), Is.EqualTo(parts),
                        $"SHIPPED PARTS CURVE MOVED at Condition {c} — this column must be byte-identical " +
                        "to the pre-wreck-start game, or the salvage half changed the shipped economy.");

                Assert.That(RetunedPartsAt(0.40f), Is.EqualTo(1),
                    "THE CLIFF FOLLOWS device_parts: at 3, Condition 0.40 is worth a Part — under the " +
                    "shipped 2 it is worth none. A hard-coded 0.5 boundary cannot produce this row.");
                Assert.That(RetunedPartsAt(0.33f), Is.Zero,
                    "and just below 1/3 it is worth none, so the cliff really moved rather than vanished.");

                // ⚠️ THE ROWS ABOVE ARE NOT ENOUGH, AND THE MUTATION PROVED IT. They exercise
                // DeviceYield in isolation; the CLIFF the strip actually uses lives in
                // DeconstructSystem.Complete, and replacing its `deviceYield == 0` test with a
                // hard-coded `Condition < 0.5f` left every one of them GREEN. Only DRIVING a real
                // strip under retuned defs can see it: at device_parts = 3 a machine at Condition
                // 0.40 is worth a PART, and a 0.5 literal would pay it in Swarf instead.
                Assert.That(strippedUnderRetune, Is.True, "NON-VACUITY: the retuned strip must complete");
                Assert.That(retunedParts, Is.EqualTo(1),
                    "THE STRIP'S OWN CLIFF FOLLOWS device_parts: at 3, a machine at Condition 0.40 " +
                    "pays a Part. A hard-coded 0.5 in DeconstructSystem.Complete pays Swarf here and " +
                    "is invisible to every other assertion in this file.");
                Assert.That(retunedSwarf, Is.Zero, "and no Swarf, because it was never below the cliff.");

                // Reads the def rather than a const — this one IS legitimately self-referential,
                // because "does it read the def at all" is exactly what it asks. The ABSOLUTE pin on
                // the def's own value lives in TheShippedWreckYieldIsExactlyOne below.
                var swarfRetune = SimDefs.CreateDefault();
                swarfRetune.Deconstruct.DeviceSwarf = 7;
                Assert.That(DeconstructSystem.WreckYield(swarfRetune), Is.EqualTo(7),
                    "the wreck yield reads deconstruct.device_swarf, never a const");
                Assert.That(DeconstructSystem.WreckYield(sim.Defs), Is.EqualTo(1),
                    "and at shipped values it is exactly 1");
            });
        }

        /// <summary>
        /// DRIVEN THROUGH THE REAL STRIP, on both sides of the cliff, in ONE test so the two cannot
        /// drift: a machine at 0.10 leaves Swarf and no Parts; a machine at 1.0 leaves Parts and no
        /// Swarf. The crew really walk, the device really disappears, and the stacks are counted off
        /// the live sim.
        ///
        /// <para><b>BOTH LEGS ARE BLINDED FROM EACH OTHER</b> (CLAUDE.md's fifth trap shape:
        /// <c>assert</c> throws, so a leg that cannot bite is indistinguishable from one that can).
        /// Each leg builds its own sim and records into locals; every assertion runs inside
        /// <see cref="Assert.Multiple"/> at the end.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): in <c>Complete</c>, drop the
        /// <c>yieldKind</c> reassignment so a wreck pays Parts.</para>
        /// </summary>
        [Test]
        public void ARealStrip_PaysSwarfBelowTheCliffAndPartsAboveIt()
        {
            // DeviceKind.Bed, not a Fabricator, and the reason is a MEASURED first draft failure:
            // machines.def gives the Fabricator wear 0.020/h, so a "pristine" one drops below 1.0
            // during its own 90 s strip and floor(2 × 0.999) pays 1 Part instead of 2. The test read
            // as a broken byte-identity claim when the real cause was the fixture. Furniture is
            // `0 0 0 0` in machines.def — its Condition is exactly what the test set.
            var wreckSim = NewBay();
            wreckSim.AddDevice(DeviceKind.Bed, new Int3(5, 2, 0), "subject").Condition = 0.10f;
            bool wreckStripped = StripDevice(wreckSim, new Int3(5, 2, 0));
            int wreckSwarf = Units(wreckSim, ItemKind.Swarf);
            int wreckParts = Units(wreckSim, ItemKind.Parts);
            bool wreckGone = DeviceNamed(wreckSim, "subject") == null;

            var goodSim = NewBay();
            goodSim.AddDevice(DeviceKind.Bed, new Int3(5, 2, 0), "subject").Condition = 1.00f;
            bool goodStripped = StripDevice(goodSim, new Int3(5, 2, 0));
            int goodSwarf = Units(goodSim, ItemKind.Swarf);
            int goodParts = Units(goodSim, ItemKind.Parts);

            Assert.Multiple(() =>
            {
                Assert.That(wreckStripped, Is.True, "NON-VACUITY: the wreck strip must actually complete");
                Assert.That(wreckGone, Is.True, "PATH: and the device must really be gone");
                Assert.That(wreckSwarf, Is.EqualTo(1),
                    "A WRECKED MACHINE PAYS EXACTLY ONE SWARF. The literal is deliberate: an " +
                    "expectation written as `sim.Defs.Deconstruct.DeviceSwarf` re-derives itself " +
                    "from the field under test and survives ANY retune of it — measured, 1 -> 0 and " +
                    "1 -> 2 both left this file green before the literal went in. It used to pay " +
                    "NOTHING, which is what made the dead half of a raided ship worthless.");
                Assert.That(wreckParts, Is.Zero, "and no Parts: the cliff still refuses to pay Parts for a wreck");

                Assert.That(goodStripped, Is.True, "NON-VACUITY: the pristine strip must actually complete");
                Assert.That(goodParts, Is.EqualTo(2),
                    "a pristine machine still pays 2 Parts — BYTE-IDENTICAL to before, and a literal " +
                    "for the same reason as the row above");
                Assert.That(goodSwarf, Is.Zero,
                    "and no Swarf: above the cliff nothing about the yield changed");
            });
        }

        /// <summary>
        /// <b>THE ABSOLUTE SCALE PIN (CLAUDE.md's seventh trap shape), AND IT WAS WRITTEN BECAUSE THE
        /// MUTATION SURVIVED.</b> Every yield assertion in this file was originally written as
        /// <c>Is.EqualTo(sim.Defs.Deconstruct.DeviceSwarf)</c> — an expectation re-derived from the
        /// very field under test. Measured: <c>device_swarf</c> 1 → 0 and 1 → 2 BOTH left the whole
        /// file GREEN. A self-referential expectation is scale-invariant in exactly the way a ratio
        /// assertion is, and it cannot see a retune by construction.
        ///
        /// <para>So the shipped value is pinned here as a literal, from BOTH sides, each with the
        /// design reason it is bounded:</para>
        /// <list type="bullet">
        /// <item><b>≥ 1</b> — a wreck must be worth SOMETHING. At 0 the package is inert and the
        /// dead half of a raided ship is worthless again, which is the defect it exists to fix.</item>
        /// <item><b>≤ 1</b> — MONOTONICITY. The yield ladder is 2 Parts (pristine) → 1 Part
        /// (Condition ≥ 0.5) → this. At 2 a wrecked machine would buy TWO services at
        /// <c>swarf_service_condition</c> against a half-condition machine's ONE overhaul at 1.0,
        /// which on a ship trying to lift machines over their <c>fail</c> threshold is worth more —
        /// the cliff inverts and optimal play becomes "let everything rot before stripping it".</item>
        /// </list>
        /// </summary>
        [Test]
        public void TheShippedWreckYieldIsExactlyOne_PinnedFromBothSides()
        {
            var defs = SimDefs.Default;
            Assert.Multiple(() =>
            {
                Assert.That(defs.Deconstruct.DeviceSwarf, Is.GreaterThan(0),
                    "AT ZERO THE PACKAGE IS INERT: a wreck is worth nothing again and the wreck " +
                    "start's premise (salvaging the dead half feeds the living half) is unbuildable.");
                Assert.That(defs.Deconstruct.DeviceSwarf, Is.LessThanOrEqualTo(1),
                    "ABOVE ONE THE CLIFF INVERTS: a wreck would out-value a half-condition machine's " +
                    "single Part, and the optimal play would be to let every machine rot before " +
                    "stripping it. If you are raising this deliberately, re-derive the ladder first.");
                Assert.That(defs.Deconstruct.DeviceSwarf, Is.EqualTo(1), "the shipped value");
            });
        }

        // ═════════════════════════════════ 2. CONSERVATION — driven, and the arithmetic stated

        /// <summary>
        /// <b>THE CONSERVATION PROOF, DRIVEN END TO END.</b> The arithmetic first, so the
        /// measurement has something to disagree with:
        ///
        /// <code>
        ///   place a device      −build.device_place_cost Parts     = −3
        ///   let it wreck        (no matter moves)
        ///   strip it            +deconstruct.device_swarf Swarf    = +1 Swarf
        ///   ------------------------------------------------------------------
        ///   net                 −3 Parts, +1 Swarf
        /// </code>
        ///
        /// The best possible cycle — place, then strip while still pristine — is −3 Parts +2 Parts
        /// = −1, exactly as E0-5 WP-3 left it. NO CYCLE PRODUCES PARTS, at any Condition, because
        /// Swarf converts to nothing.
        ///
        /// <para>This test starts with a known Parts stock, drives the real
        /// <see cref="PlaceDeviceCommand"/> and the real strip, and counts every stack. Asserting
        /// the SWARF alone would be satisfied by a sim that also minted Parts, so both currencies
        /// are counted, and the Parts figure is checked against the stock the test put down rather
        /// than against zero.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): make <c>WreckSalvage</c>
        /// <c>ItemKind.Parts</c>. The Parts assertion fails and names the mint.</para>
        /// </summary>
        [Test]
        public void PlaceThenWreckThenStrip_MintsNoParts_AndTheLedgerBalances()
        {
            var sim = NewBay();
            int cost = sim.Defs.Build.DevicePlaceCost;
            int stock = cost + 4;                       // enough to pay, with a remainder to watch
            sim.AddItem(ItemKind.Parts, stock, new Int3(2, 2, 0));

            new PlaceDeviceCommand(DeviceKind.Bed, new Int3(5, 2, 0)).Execute(sim);
            Assert.That(sim.TryGetDeviceAt(new Int3(5, 2, 0), out _), Is.True,
                "NON-VACUITY: the device must really have been placed, or nothing below is a round trip");
            int afterPlace = Units(sim, ItemKind.Parts);

            // Wreck it by hand — this is the raid, not wear: the test is about the YIELD rule, and
            // wearing a Bed down in-sim is impossible (machines.def gives furniture wear 0).
            foreach (var d in sim.Devices.Items) if (d.Pos == new Int3(5, 2, 0)) d.Condition = 0.05f;

            bool stripped = StripDevice(sim, new Int3(5, 2, 0));

            Assert.Multiple(() =>
            {
                Assert.That(afterPlace, Is.EqualTo(stock - cost),
                    "PLACEMENT CHARGED: exactly build.device_place_cost Parts left the floor");
                Assert.That(stripped, Is.True, "NON-VACUITY: the strip must have completed");
                Assert.That(Units(sim, ItemKind.Parts), Is.EqualTo(stock - cost),
                    "NO PARTS WERE MINTED: the floor still holds exactly what placement left. This is " +
                    "the whole conservation claim — a wreck must not pay in the currency that placed it.");
                Assert.That(Units(sim, ItemKind.Swarf), Is.EqualTo(1),
                    "and exactly one unit of salvage arrived, in the terminal currency");
            });
        }

        /// <summary>
        /// <b>SWARF IS A TERMINAL CURRENCY — the structural half of the conservation proof, and the
        /// reason the round trip above cannot be gamed by a longer path.</b> No
        /// <c>[production]</c> node and no <c>[recipes]</c> row anywhere in the shipped graph
        /// mentions Swarf, in either direction. So there is no sequence of benches that turns
        /// salvage back into Parts, Scrap or Regolith, whatever the player builds.
        ///
        /// <para>Counted off the SHIPPED defs graph, not off a transcription of it (CLAUDE.md:
        /// re-count, never compute), and with a non-vacuity control — the same scan must FIND the
        /// kinds that are genuinely in the table, or it is a scan that matches nothing.</para>
        /// </summary>
        [Test]
        public void NoBillAnywhereConsumesOrProducesSwarf_SoItCannotBecomeParts()
        {
            var defs = SimDefs.Default;
            var mentioned = new HashSet<ItemKind>();

            foreach (var node in defs.Production.Nodes)
            {
                foreach (var p in node.Inputs) mentioned.Add(p.Kind);
                foreach (var p in node.Outputs) mentioned.Add(p.Kind);
            }
            for (int i = 0; i < defs.Recipes.Length; i++)
            {
                if (!defs.Recipes[i].Defined) continue;
                mentioned.Add(defs.Recipes[i].Input);
                mentioned.Add(defs.Recipes[i].Output);
            }

            Assert.Multiple(() =>
            {
                Assert.That(mentioned, Does.Not.Contain(ItemKind.Swarf),
                    "A BILL NOW TOUCHES SWARF. That is not forbidden — it is the moment the " +
                    "conservation story changes shape, and it has to be re-derived: today Swarf has " +
                    "ONE source (a wreck strip) and ONE sink (a maintenance service) and therefore " +
                    "cannot become Parts by any path. See production.def for why the bench bill " +
                    "(E1's recycle_swarf) could not ship: CraftingSystem runs ORDINAL 0 only.");
                Assert.That(mentioned, Does.Contain(ItemKind.Regolith),
                    "NON-VACUITY: the scan must find the kinds that ARE in the table…");
                Assert.That(mentioned, Does.Contain(ItemKind.Parts), "…including the one Swarf must not reach.");
            });
        }

        // ═══════════════════════════════════ 3. SWARF'S CONSUMER — the rung below a jury-rig

        /// <summary>
        /// <b>THE LOOP CLOSES, DRIVEN:</b> a machine the wreck rule refuses to repair for free IS
        /// repaired once the ship holds Swarf, to exactly <c>wear.swarf_service_condition</c>, and
        /// the unit is consumed. This is the salvage half meeting half A — cannibalise the dead
        /// machine, revive the live one.
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): drop the <c>ItemKind.Swarf</c>
        /// arm from <c>MaintenanceSystem.RestoredCondition</c> — the machine comes back at the
        /// jury-rig floor instead and the exact-value assertion names it.</para>
        /// </summary>
        [Test]
        public void AWreckedMachine_IsRepairedBySwarf_ToTheBottomRung_AndBurnsOneUnit()
        {
            var sim = NewBay();
            var machine = sim.AddDevice(DeviceKind.Scrubber, new Int3(5, 2, 0), "subject");
            machine.Condition = 0.05f;
            // ⭐ D3 — STOCKED ABOVE `MaintenanceSystem.AutonomousRepairReserve`. The standing rule
            // declines the ship's last few loose consumable units so a player can still spend them
            // by hand (`RepairReserveTests`); a fixture at or below that floor would measure the
            // reserve instead of the property under test. Stated relative to the constant so it
            // follows it rather than going silently vacuous.
            sim.AddItem(ItemKind.Swarf, MaintenanceSystem.AutonomousRepairReserve + 2, new Int3(2, 2, 0));
            Assert.That(Units(sim, ItemKind.Parts), Is.Zero, "premise: no Parts — Parts outrank Swarf");
            Assert.That(Units(sim, ItemKind.Seals), Is.Zero, "premise: no Seals — Seals outrank Swarf too");

            float peak = machine.Condition;
            for (int t = 0; t < 20000; t++)
            {
                sim.Tick();
                if (machine.Condition > peak) peak = machine.Condition;
            }

            Assert.Multiple(() =>
            {
                Assert.That(peak, Is.EqualTo(sim.Defs.Wear.SwarfServiceCondition).Within(1e-4f),
                    "a Swarf service restores exactly wear.swarf_service_condition — not the jury-rig " +
                    "floor (which the wreck rule refuses here) and not a Seals-grade 0.9");
                Assert.That(Units(sim, ItemKind.Swarf),
                    Is.EqualTo(MaintenanceSystem.AutonomousRepairReserve + 1),
                    "exactly ONE unit was consumed — a condition rise with the whole pile still on " +
                    "the ground would be a free repair wearing a Swarf service's clothes");
            });
        }

        /// <summary>
        /// <b>THE RUNG IS GATED, AND WITHOUT THE GATE IT WOULD BE A REGRESSION.</b>
        /// <c>swarf_service_condition</c> (0.45) is BELOW <c>jury_rig_condition</c> (0.6), so
        /// offering Swarf to a machine that merely ROTTED would send a crew member on a fetch to
        /// end up worse than empty hands. A machine at 0.30 — above the wreck floor, below its
        /// maintain threshold — must therefore ignore the Swarf on the floor and jury-rig.
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): make
        /// <c>FindNearestConsumable</c>'s Swarf leg unconditional (drop <c>allowSwarf</c>). The
        /// machine comes back at 0.45 instead of 0.6 and the stack is eaten.</para>
        /// </summary>
        [Test]
        public void ARottedMachine_IgnoresSwarf_AndJuryRigsHigherThanASwarfServiceWouldReach()
        {
            var sim = NewBay();
            var machine = sim.AddDevice(DeviceKind.Scrubber, new Int3(5, 2, 0), "subject");
            machine.Condition = 0.30f;                          // above wreck_threshold, below maint
            // ⭐ D3 — STOCKED ABOVE `MaintenanceSystem.AutonomousRepairReserve`. The standing rule
            // declines the ship's last few loose consumable units so a player can still spend them
            // by hand (`RepairReserveTests`); a fixture at or below that floor would measure the
            // reserve instead of the property under test. Stated relative to the constant so it
            // follows it rather than going silently vacuous.
            sim.AddItem(ItemKind.Swarf, MaintenanceSystem.AutonomousRepairReserve + 2, new Int3(2, 2, 0));

            float peak = machine.Condition;
            for (int t = 0; t < 20000; t++)
            {
                sim.Tick();
                if (machine.Condition > peak) peak = machine.Condition;
            }

            Assert.Multiple(() =>
            {
                Assert.That(peak, Is.EqualTo(sim.Defs.Wear.JuryRigCondition).Within(1e-4f),
                    "a merely-rotted machine must still jury-rig to 0.6 — taking the 0.45 Swarf " +
                    "service instead is a fetch that leaves it WORSE than empty hands");
                Assert.That(Units(sim, ItemKind.Swarf),
                    Is.EqualTo(MaintenanceSystem.AutonomousRepairReserve + 2),
                    "and the salvage must be untouched — spending it here is spending it for nothing");
            });
        }

        /// <summary>
        /// THE LADDER'S BOUNDS, ASSERTED AGAINST THE SHIPPED TABLE RATHER THAN RESTATED. Three of
        /// the four are hard failures if violated, and the first is the nastiest: a
        /// <c>swarf_service_condition</c> at or below the highest <c>maint</c> threshold leaves the
        /// serviced machine STILL NEEDY, so the ship re-services it forever and burns its entire
        /// salvage stock on one device — a matter-consuming livelock with no error anywhere.
        ///
        /// <para>Scale-sensitive by construction: it reads the shipped <c>machines.def</c> rows, so
        /// it fires if either the rung or any threshold moves into conflict.</para>
        /// </summary>
        [Test]
        public void TheSwarfRungIsBoundedOnAllFourSides_AgainstTheShippedMachineTable()
        {
            var defs = SimDefs.Default;
            float rung = defs.Wear.SwarfServiceCondition;
            float worstMaint = 0f, worstFail = 0f;
            foreach (DeviceKind k in System.Enum.GetValues(typeof(DeviceKind)))
            {
                var m = defs.Machines[(int)k];
                if (m.MaintainBelow > worstMaint) worstMaint = m.MaintainBelow;
                if (m.FailBelow > worstFail) worstFail = m.FailBelow;
            }

            Assert.Multiple(() =>
            {
                Assert.That(rung, Is.GreaterThan(worstMaint),
                    "ABOVE EVERY maint THRESHOLD, or a swarf service leaves the machine needy and the " +
                    "ship re-services it until the salvage runs out — a matter-consuming livelock.");
                Assert.That(rung, Is.GreaterThan(defs.Wear.WreckThreshold),
                    "ABOVE THE WRECK FLOOR, or the repair does not lift the machine out of the band " +
                    "that refused it and the rung buys nothing that can be built on.");
                Assert.That(rung, Is.GreaterThan(worstFail),
                    "ABOVE EVERY fail THRESHOLD, or the machine is repaired and still inoperative.");
                Assert.That(rung, Is.LessThan(defs.Wear.JuryRigCondition),
                    "BELOW THE JURY-RIG FLOOR, or salvage beats free labour and the tier order inverts.");
            });
        }

        // ══════════ 3a. THE VALUE ITSELF — pinned ABSOLUTELY, and read THROUGH the def when driven

        /// <summary>A defs instance with the bottom rung retuned, checksum recomputed — the
        /// <c>WreckThresholdTests.DefsWithThreshold</c> shape, so a driven leg can prove the sim
        /// READS the field instead of restating its value.</summary>
        private static SimDefs DefsWithSwarfRung(float rung)
        {
            var d = SimDefs.CreateDefault();
            d.Wear.SwarfServiceCondition = rung;
            d.ComputeChecksum();
            return d;
        }

        /// <summary>
        /// <b>THE ABSOLUTE PIN, WITH A DESIGN REASON ON EACH SIDE.</b>
        /// <see cref="TheSwarfRungIsBoundedOnAllFourSides_AgainstTheShippedMachineTable"/> above
        /// only constrains the rung to the OPEN INTERVAL (0.40, 0.60), and every driven assertion in
        /// this file compares against <c>sim.Defs.Wear.SwarfServiceCondition</c> — i.e. re-derives
        /// the answer from the field under test. So the shipped 0.45 was, until this test,
        /// <b>unpinned</b>.
        ///
        /// <para><b>MEASURED, not assumed</b> (full suite, 1140 tests, before this test existed):
        /// mutating the default <c>0.45f → 0.55f</c> reddened exactly <b>2</b> —
        /// <c>ShippedDefs_Parse_ZeroProblems_ChecksumEqualsDefault</c> and the defs-checksum pin.
        /// Both redden for ANY def change whatsoever, so by this repo's own standard they are not a
        /// pin on this value: <c>device_swarf</c> also moves the checksum and still got a literal.
        /// ZERO behavioural tests could see a 22 % move in the bottom rung.</para>
        ///
        /// <para><b>WHY NOT LOWER.</b> The rung must buy real TIME above the machine's maintain
        /// threshold or the ship re-services the same machine out of its salvage stock. The worst
        /// <c>maint</c> is 0.40 and the worst wear is 0.020/h × the 3× heat cap = 0.06/h, so 0.45
        /// buys ~50 sim-minutes of serviceability. At 0.41 — still legal under the bounds test —
        /// it buys ~10 minutes, and the "matter-consuming livelock" that test names is excluded in
        /// name only.</para>
        ///
        /// <para><b>WHY NOT HIGHER.</b> The rung is offered ONLY below <c>wreck_threshold</c>, so it
        /// is what a WRECK comes back as. At 0.55 a wreck patched with scrap would come back within
        /// 0.05 of what free labour gives a healthy machine (<c>jury_rig_condition</c> = 0.6) —
        /// while COSTING a unit of matter. The tier order would survive arithmetically and die as
        /// design: "a wrecked machine stays wrecked until you invest real Parts" is the premise the
        /// whole wreck start rests on, and a near-jury-rig patch-up erases it.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): <c>SimDefs.cs</c>
        /// <c>SwarfServiceCondition = 0.45f → 0.55f</c>.</para>
        /// </summary>
        [Test]
        public void SwarfServiceCondition_IsPinnedAtTheLiteral_FromBothSides()
        {
            float rung = SimDefs.Default.Wear.SwarfServiceCondition;

            Assert.Multiple(() =>
            {
                Assert.That(rung, Is.GreaterThanOrEqualTo(0.45f),
                    "THE BOTTOM RUNG WAS LOWERED. It must clear the worst maint threshold (0.40) by " +
                    "enough to buy real time: at the worst wear rate (0.020/h x 3x heat cap = " +
                    "0.06/h) 0.45 is ~50 sim-minutes of serviceability, 0.41 is ~10, and a rung that " +
                    "buys minutes is the salvage-burning re-service loop the four-sided bounds test " +
                    "excludes by name only. Lower it deliberately, with a measurement, or not at all.");
                Assert.That(rung, Is.LessThanOrEqualTo(0.45f),
                    "THE BOTTOM RUNG WAS RAISED. It is what a WRECK comes back as — it is offered " +
                    "only below wear.wreck_threshold. Raise it toward jury_rig_condition (0.6) and a " +
                    "scrap patch-up costs matter to reach nearly what free labour gives a healthy " +
                    "machine, which erases the wreck start's premise that a wreck stays wrecked " +
                    "until you invest real Parts. The bounds test would not notice: 0.55 passes it.");
            });
        }

        /// <summary>
        /// <b>THE SIM READS THE FIELD — DRIVEN, with the def RETUNED.</b> Every other Swarf
        /// assertion in this file compares a driven outcome against
        /// <c>sim.Defs.Wear.SwarfServiceCondition</c>, which is true whether
        /// <see cref="MachineWearSystem"/> reads the def or has <c>0.45f</c> written into it. This
        /// leg breaks that circle: the same fixture on a defs instance whose rung is 0.52 must come
        /// back at <b>0.52</b>, so a hard-coded literal in <c>RestoredCondition</c> fails here even
        /// though it agrees with the shipped default everywhere else.
        ///
        /// <para>0.52 is chosen inside every bound the ladder requires — above the worst
        /// <c>maint</c> (0.40) so the serviced machine stops being needy, above
        /// <c>wreck_threshold</c> (0.25) so it leaves the wrecked band, below
        /// <c>jury_rig_condition</c> (0.6) so the tier order holds — and 0.07 away from the shipped
        /// value, which is 700× the 1e-4 tolerance.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): in
        /// <c>MachineWearSystem.RestoredCondition</c>, replace
        /// <c>defs.Wear.SwarfServiceCondition</c> with the literal <c>0.45f</c>. Every other test in
        /// this file stays green; this one fails.</para>
        /// </summary>
        [Test]
        public void ASwarfService_RestoresTheDEFVALUE_NotAHardCodedLiteral()
        {
            const float Retuned = 0.52f;
            var sim = NewBay(DefsWithSwarfRung(Retuned));
            Assert.That(sim.Defs.Wear.SwarfServiceCondition, Is.EqualTo(Retuned).Within(1e-6f),
                "premise: the retuned defs instance actually reached the simulation");

            var machine = sim.AddDevice(DeviceKind.Scrubber, new Int3(5, 2, 0), "subject");
            machine.Condition = 0.05f;
            // ⭐ D3 — STOCKED ABOVE `MaintenanceSystem.AutonomousRepairReserve`. The standing rule
            // declines the ship's last few loose consumable units so a player can still spend them
            // by hand (`RepairReserveTests`); a fixture at or below that floor would measure the
            // reserve instead of the property under test. Stated relative to the constant so it
            // follows it rather than going silently vacuous.
            sim.AddItem(ItemKind.Swarf, MaintenanceSystem.AutonomousRepairReserve + 2, new Int3(2, 2, 0));

            float peak = machine.Condition;
            for (int t = 0; t < 20000; t++)
            {
                sim.Tick();
                if (machine.Condition > peak) peak = machine.Condition;
            }

            Assert.Multiple(() =>
            {
                Assert.That(peak, Is.EqualTo(Retuned).Within(1e-4f),
                    "the service must restore to the DEF's rung. Coming back at the shipped 0.45 " +
                    "here means MachineWearSystem carries the number instead of reading it, and " +
                    "every other assertion in this file would still be green.");
                Assert.That(peak, Is.Not.EqualTo(SimDefs.Default.Wear.SwarfServiceCondition).Within(1e-4f),
                    "and it must NOT be the shipped default — that is the whole point of retuning it");
                Assert.That(Units(sim, ItemKind.Swarf),
                    Is.EqualTo(MaintenanceSystem.AutonomousRepairReserve + 1),
                    "exactly one unit consumed, as at the shipped value — retuning the rung must " +
                    "not change the price");
            });
        }

        // ══════════ 4. WHY THERE IS NO BENCH BILL — the ordinal-0 block, DRIVEN not read off source

        /// <summary>
        /// <b>THE DESIGN DECISION THIS PACKAGE HAD TO MAKE, AND THE MEASUREMENT BEHIND IT.</b>
        /// <c>ECONOMY.md</c> and <c>production.def</c> both stage a <c>recycle_swarf</c> node on the
        /// <c>SalvageRecycler</c> (<c>Swarf:5 → Regolith:3</c>, "recycler, at a loss"). It cannot
        /// ship: <c>ProductionDefs.TryGetBill</c> resolves a station's bill at ORDINAL 0 and nothing
        /// else, and all three benches already carry one. A second node on any of them parses,
        /// checksums, is reachable through <c>TryGetNode</c> — and NEVER RUNS.
        ///
        /// <para>That is the <c>fab_seals</c> trap <c>production.def</c> already documents, and it
        /// is asserted here by DRIVING a bench rather than by reading the source, because the whole
        /// reason the salvage half feeds repair instead of production rests on it.</para>
        ///
        /// <para><b>THE INCLUSION CONTROL IS THE TEST</b> (CLAUDE.md's fourth trap shape): the
        /// identical node placed at ORDINAL 0 must run. Without it, "the batch did not run" is
        /// indistinguishable from a fixture that could never craft — wrong bench, no power, no
        /// staging, no idle crew.</para>
        /// </summary>
        [Test]
        public void ASecondBillOnAStationNeverRuns_WhichIsWhySwarfHasNoBenchRecipe()
        {
            var swarfNode = new ProductionNode(
                "recycle_swarf", DeviceKind.SalvageRecycler, 20,
                new[] { new ProductionPort(ItemKind.Swarf, 4) },
                new[] { new ProductionPort(ItemKind.Regolith, 3) });

            // ── SUBJECT: the swarf node appended AFTER the shipped recycle_stock (ordinal 1). ──
            var second = SimDefs.CreateDefault();
            var nodes = new List<ProductionNode>(second.Production.Nodes) { swarfNode };
            second.Production = new ProductionDefs { Nodes = nodes.ToArray() };
            second.ComputeChecksum();

            // ── CONTROL: the same node FIRST (ordinal 0), everything else identical. ──
            var first = SimDefs.CreateDefault();
            var ctrl = new List<ProductionNode> { swarfNode };
            ctrl.AddRange(first.Production.Nodes);
            first.Production = new ProductionDefs { Nodes = ctrl.ToArray() };
            first.ComputeChecksum();

            int RunBench(SimDefs defs)
            {
                var sim = NewBay(defs);
                sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(5, 2, 0), "bench");
                sim.AddItem(ItemKind.Swarf, 8, new Int3(4, 2, 0));
                Run(sim, 30000);
                return Units(sim, ItemKind.Swarf);
            }

            int leftAtOrdinalOne = RunBench(second);
            int leftAtOrdinalZero = RunBench(first);

            // And the ordinal-0 resolution itself, so the failure names the mechanism as well as
            // the symptom.
            ProductionDefs.TryGetBill(second, DeviceKind.SalvageRecycler, out var resolved);

            Assert.Multiple(() =>
            {
                Assert.That(resolved.Id, Is.EqualTo("recycle_stock"),
                    "TryGetBill resolves ORDINAL 0 — the swarf node at ordinal 1 is not even selected");
                Assert.That(leftAtOrdinalOne, Is.EqualTo(8),
                    "A SECOND BILL ON A STATION IS DEAD: eight Swarf sat on the bench's neighbour for " +
                    "30 000 ticks and not one unit was consumed. This is why the salvage half feeds " +
                    "MaintenanceSystem instead of a bench — see production.def.");
                Assert.That(leftAtOrdinalZero, Is.LessThan(8),
                    "INCLUSION CONTROL: the IDENTICAL node at ordinal 0 really does run and really " +
                    "does eat Swarf. Without this leg the assertion above is satisfied by any fixture " +
                    "that cannot craft at all, and it would prove nothing about ordinals.");
            });
        }
    }
}
