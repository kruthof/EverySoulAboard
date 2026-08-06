using System.Collections.Generic;
using System.Globalization;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// D7 — <b>THE FIRST BUNK GOES DOWN IN THE FIRST HOUR.</b> Owner, live play 2026-08-03: <i>"I
    /// cannot build anything except the walls."</i> Subject: the <c>cabin stores</c> cache authored
    /// into <c>AuthoredShips.PeriluneWreck()</c>'s cryo bay, read against
    /// <c>build.device_place_cost</c> and <see cref="PlaceDeviceCommand"/>.
    ///
    /// <para><b>THE DEFECT, DRIVEN BEFORE THE FIX.</b> <c>device_place_cost</c> is 3 PARTS and the
    /// wreck authored exactly ONE, so <see cref="PlaceDeviceCommand.Affordable"/> was 1 at tick 0
    /// and every furniture tool on the Room Zoom palette refused on the first click, for ever.
    /// Nothing was mis-wired — the ship could not pay. And the one Parts did not survive either:
    /// <c>MaintenanceSystem</c> fetches TIER BEFORE DISTANCE and Parts is rung 0, so a Repair grant
    /// put it into <c>wing_c</c> at tick 9211 (h0.256).</para>
    ///
    /// <para>⚠️ <b>THE FIX IS CONTENT AND ONLY CONTENT</b>, on M1-I/OD-F's precedent (author
    /// consumables, never soften a floor). No def value moved, <c>LooseMatter.TryPay</c> is
    /// untouched, and the D3 reserve rule is untouched.</para>
    ///
    /// <para>⛔ <b>WHAT THIS FILE DOES NOT CLAIM.</b> The cache is NOT protected from autonomous
    /// maintenance and no authored quantity could protect it:
    /// <c>MachineWearSystem.AutonomousRepairReserve</c> floors the ship's TOTAL loose consumable
    /// units across all three rungs, and Parts are rung 0, so with ten Seals aboard the drain
    /// reaches the floor only after every Part is spent. What is pinned here is the WINDOW — the
    /// player's first sim-hour — measured at every tick of it, in the worst case where the drain is
    /// running from tick 0. Whether maintenance should be allowed to eat the furnishing budget at
    /// all is a sim-core rule question and is FILED, not answered.</para>
    /// </summary>
    public class CabinStoresTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static Simulation Boot() =>
            ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());

        /// <summary>The seven <c>cabin stores</c> tiles, written out by hand — the cryo bay's bottom
        /// row between <c>battery_cryo</c> (1,6) and M1-I's damage-control locker (9,6). Hand-written
        /// rather than searched for by LABEL, on <c>WreckRepairEconomyTests.RestoreThePreFixStock</c>'s
        /// precedent: a label is prose and a control keyed on one tracks a rename instead of a ship.</summary>
        private static readonly Int3[] CabinStoresTiles =
        {
            new Int3(2, 6, 0), new Int3(3, 6, 0), new Int3(4, 6, 0), new Int3(5, 6, 0),
            new Int3(6, 6, 0), new Int3(7, 6, 0), new Int3(8, 6, 0),
        };

        /// <summary>Units in the cache. The pin on the SIZE; see the derivation beside the authoring
        /// (floor: two furniture pieces at 3 Parts each; ceiling: the last value that leaves M1-I's
        /// KNOWN LIMIT 1 standing, bisected and driven).</summary>
        private const int CabinStoresUnits = 7;

        /// <summary>One sim-hour. 10 Hz × 3600 s.</summary>
        private const int OneSimHour = 3600 * Simulation.TicksPerSecond;

        /// <summary>Where the bunk goes: bare walkable floor in the cryo bay's second row, no
        /// device, no item, in the ship's boot air. Probed on the built ship.</summary>
        private static readonly Int3 BunkTile = new Int3(3, 2, 0);

        /// <summary>The pre-D7 ship: delete the cabin stores and nothing else. This is the MUTATION
        /// the outcome test is required to detect, and it is applied to a freshly built sim rather
        /// than to a restored copy of a shared one.</summary>
        private static void RemoveTheCabinStores(Simulation sim)
        {
            var doomed = new List<uint>();
            foreach (var it in sim.Items.Items)
            {
                if (it.Kind != ItemKind.Parts) continue;
                foreach (var tile in CabinStoresTiles) if (it.Pos == tile) { doomed.Add(it.Id); break; }
            }
            foreach (uint id in doomed) sim.Items.Remove(id);
        }

        private static int DeviceCount(Simulation sim) => sim.Devices.Items.Count;

        private static bool BedIsAt(Simulation sim, Int3 pos)
        {
            foreach (var d in sim.Devices.Items) if (d.Pos == pos && d.Kind == DeviceKind.Bed) return true;
            return false;
        }

        private static string N(int v) => v.ToString(CultureInfo.InvariantCulture);

        // ------------------------------------------------------------------- THE OUTCOME TEST

        /// <summary>
        /// ⭐⭐ <b>THE PLAYER SENTENCE, DRIVEN.</b> Boot the shipped wreck, grant the work the
        /// player grants on the WORK tab so that autonomous maintenance is eating the pile from
        /// tick 0 — the WORST case, not the boot state — run the whole first sim-hour, and put a
        /// bunk down at the end of it.
        ///
        /// <para>FOUR legs, blinded into one list and asserted once, because <c>Assert</c> throws
        /// and a per-leg assertion would let the first hide the rest (the fifth trap shape):</para>
        /// <list type="number">
        ///   <item>the ship can pay for a piece AT BOOT (<c>Affordable &gt;= device_place_cost</c>);</item>
        ///   <item>it can pay at EVERY tick of the first sim-hour — a minimum over 36 000 samples,
        ///         not an endpoint reading, because the drain is a staircase and an endpoint can sit
        ///         on either side of a step;</item>
        ///   <item>⭐ the bunk ACTUALLY LANDS: <c>PlaceDeviceCommand</c> at the hour mark raises the
        ///         device count by one and leaves a <c>Bed</c> on the tile. This is the leg the
        ///         package exists for — legs 1 and 2 are about a number, this one is about the
        ///         ship;</item>
        ///   <item>and the ship PAID for it: <c>Affordable</c> falls by exactly
        ///         <c>device_place_cost</c>. Without this the placement could be free and the whole
        ///         file would be measuring nothing (E0-5 WP-3's matter faucet, inverted).</item>
        /// </list>
        /// </summary>
        [Test]
        public void TheFirstBunkGoesDownInTheFirstHour_WithTheDrainRunning()
        {
            var sim = Boot().GiveAllCrewAllWork();
            int cost = sim.Defs.Build.DevicePlaceCost;
            var offenders = new List<string>();

            int atBoot = PlaceDeviceCommand.Affordable(sim);
            if (atBoot < cost)
                offenders.Add("LEG 1 — the wreck cannot pay for one furniture piece at tick 0: " +
                              "Affordable(Parts) = " + N(atBoot) + " against device_place_cost = " + N(cost) +
                              ". This is the owner's defect verbatim ('I cannot build anything except the walls').");

            int floor = atBoot, floorTick = 0;
            for (int t = 1; t <= OneSimHour; t++)
            {
                sim.Tick();
                int a = PlaceDeviceCommand.Affordable(sim);
                if (a < floor) { floor = a; floorTick = t; }
            }
            if (floor < cost)
                offenders.Add("LEG 2 — the furnishing budget dipped below one piece INSIDE the first " +
                              "sim-hour: Affordable(Parts) fell to " + N(floor) + " at tick " + N(floorTick) +
                              " against a cost of " + N(cost) + ". Either the cache shrank or the " +
                              "maintenance drain got faster; note that a single POOLED stack also fails " +
                              "this leg, because DriveWorker carries the whole stack for a one-unit " +
                              "service and LooseMatter.Affordable skips CarriedBy != 0.");

            int devicesBefore = DeviceCount(sim);
            int affordableBefore = PlaceDeviceCommand.Affordable(sim);
            // ⭐ PLACE **AND BUILD**. This file's claim is about MATTER — can the ship afford
            // furniture through the first hour's maintenance drain — and the bunk landing is its
            // outcome. Since 2026-08-05 a press lays a blueprint, so the outcome needs the builder's
            // half too; `PlaceAndBuild` drives `BuildSystem.Complete`, the same entry point
            // `BuildJobSource` calls. ⛔ NOT a tick-until-a-pawn-turns-up loop: that would make a
            // matter test depend on pathing, air and the job dispatcher.
            // ⚠️ LEG 4 BELOW IS UNAFFECTED — the Parts are still charged at DESIGNATE, so the purse
            // moves on the press exactly as it did before.
            sim.PlaceAndBuild(DeviceKind.Bed, BunkTile);

            if (DeviceCount(sim) != devicesBefore + 1 || !BedIsAt(sim, BunkTile))
                offenders.Add("LEG 3 — ⛔ THE OUTCOME: the bunk did not go down. Devices " +
                              N(devicesBefore) + " -> " + N(DeviceCount(sim)) + ", Bed at " +
                              BunkTile.X.ToString(CultureInfo.InvariantCulture) + "," +
                              BunkTile.Y.ToString(CultureInfo.InvariantCulture) + "," +
                              BunkTile.Z.ToString(CultureInfo.InvariantCulture) + " = " +
                              BedIsAt(sim, BunkTile) + ". PlaceDeviceCommand refuses silently, so the " +
                              "reason is one of: the tile stopped being legal, or TryPay could not " +
                              "raise " + N(cost) + " loose Parts (Affordable was " + N(affordableBefore) + ").");

            int affordableAfter = PlaceDeviceCommand.Affordable(sim);
            if (affordableBefore - affordableAfter != cost)
                offenders.Add("LEG 4 — the placement did not COST the ship: Affordable(Parts) went " +
                              N(affordableBefore) + " -> " + N(affordableAfter) + ", a change of " +
                              N(affordableBefore - affordableAfter) + " against device_place_cost = " +
                              N(cost) + ". A free placement is the E0-5 WP-3 matter faucet and would " +
                              "make every other leg here vacuous.");

            Assert.That(offenders, Is.Empty,
                "the first bunk cannot go down in the first hour:\n  " + string.Join("\n  ", offenders));
        }

        // -------------------------------------------------- NON-VACUITY BY INCLUSION: the mutation

        /// <summary>
        /// ⭐ <b>THE NAMED MUTATION, AND IT MUST BITE ON THE PLACEMENT.</b> Delete the cabin stores
        /// — the pre-D7 ship, one Parts aboard — and the SAME drive must leave the bunk unplaced.
        ///
        /// <para>⚠️ It asserts the DEVICE, not the count of Parts. A guard that only checked
        /// "Affordable &lt; 3" would pass with <c>PlaceDeviceCommand</c> deleted, with the whitelist
        /// broken, or with <c>TryPay</c> inverted — it would be a test of arithmetic, and the
        /// package's claim is about a bunk appearing on a floor tile. This leg and LEG 3 above are
        /// the same measurement with the cache present and absent, which is why they are written the
        /// same way.</para>
        /// </summary>
        [Test]
        public void WithoutTheCabinStores_TheBunkIsRefused()
        {
            var sim = Boot().GiveAllCrewAllWork();
            RemoveTheCabinStores(sim);

            int cost = sim.Defs.Build.DevicePlaceCost;
            Assert.That(PlaceDeviceCommand.Affordable(sim), Is.LessThan(cost),
                "PRECONDITION: with the cabin stores gone the pre-D7 ship must be unable to afford a " +
                "piece — if it can, this control is measuring the wrong ship and the outcome test " +
                "above proves nothing");

            for (int t = 1; t <= OneSimHour; t++) sim.Tick();

            int devicesBefore = DeviceCount(sim);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Bed, BunkTile));
            sim.Tick();

            Assert.Multiple(() =>
            {
                Assert.That(DeviceCount(sim), Is.EqualTo(devicesBefore),
                    "⛔ THE MUTATION DID NOT BITE: a bunk went down on a ship with no cabin stores, " +
                    "so the outcome test above would pass with the cache deleted and pins nothing");
                Assert.That(BedIsAt(sim, BunkTile), Is.False,
                    "⛔ a Bed is on the bunk tile with the cache removed");
            });
        }

        // ------------------------------------------------------------------ the content contract

        /// <summary>
        /// The cache is SEVEN ONE-UNIT crates on seven distinct tiles, and the SHAPE is pinned, not
        /// just the total. One pooled stack of seven carries the identical total and fails the
        /// outcome test, because <c>MachineWearSystem.DriveWorker</c> picks up the WHOLE stack for a
        /// one-unit service and <c>LooseMatter.Affordable</c> skips <c>CarriedBy != 0</c> — measured
        /// on the pooled draft: 4 Parts aboard at the hour mark, <c>Affordable</c> = 1.
        ///
        /// <para>Every tile must also be STAGEABLE. That is not this package wanting maintenance to
        /// reach the cache — it emphatically does not — it is the honest statement of where the
        /// cache is: in the ship's air, on floor a crew member can stand on, in the room the player
        /// wakes up in. A cache on an unstageable tile would be invisible to maintenance and still
        /// spendable (<c>LooseMatter.TryPay</c> has no position term at all), and that trick is
        /// deliberately NOT taken: it builds content on a limitation the <c>PlaceDeviceCommand</c>
        /// class doc marks as temporary ("the material teleports … the LOGISTICS are not
        /// modelled").</para>
        /// </summary>
        [Test]
        public void TheCabinStores_AreSevenSingleUnitCratesOnStageableTiles()
        {
            var sim = Boot();
            var offenders = new List<string>();
            int found = 0;

            foreach (var tile in CabinStoresTiles)
            {
                int hereStacks = 0, hereUnits = 0;
                foreach (var it in sim.Items.Items)
                    if (it.Pos == tile && it.Kind == ItemKind.Parts) { hereStacks++; hereUnits += it.Count; }

                if (hereStacks != 1 || hereUnits != 1)
                    offenders.Add("tile " + N(tile.X) + "," + N(tile.Y) + "," + N(tile.Z) + " carries " +
                                  N(hereStacks) + " Parts stack(s) / " + N(hereUnits) + " unit(s), not 1/1 " +
                                  "— pooling the cache makes it invisible to the build palette while a " +
                                  "maintainer walks");
                else found++;

                if (!WorksiteSafety.CanStageWorkerAt(sim, tile))
                    offenders.Add("tile " + N(tile.X) + "," + N(tile.Y) + "," + N(tile.Z) +
                                  " is not stageable — the cache is no longer in the ship's air");
            }

            if (found != CabinStoresUnits)
                offenders.Add("the cabin stores hold " + N(found) + " units, not " + N(CabinStoresUnits) +
                              ". ⚠️ SEVEN IS THE LAST VALUE THAT LEAVES M1-I's KNOWN LIMIT 1 STANDING " +
                              "(bisected and driven: 7 crates ⇒ tank_reserve 0.195 unfixable at h12, " +
                              "8 crates ⇒ 0.895 FIXED). Growing it re-decides an owner-owned content " +
                              "question — see WreckRepairEconomyTests.KnownLimit_TankReserve_… .");

            Assert.That(offenders, Is.Empty,
                "the cabin stores moved:\n  " + string.Join("\n  ", offenders));
        }
    }
}
