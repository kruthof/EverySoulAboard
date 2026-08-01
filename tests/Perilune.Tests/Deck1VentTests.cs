using System;
using System.Collections.Generic;
using System.Globalization;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-11 — A DECK-1 VENT: SOMEWHERE TO PUT THE PEOPLE.</b>
    ///
    /// <para><b>THE PLAYER'S SENTENCE.</b> Today all eight of the wreck's deck-1 halls peak at
    /// 0.000 kPa forever and no verb changes it. After this ONE authored machine can give the upper
    /// deck air, and the act that opens it is a REPAIR — the phase-1 exit-gate shape OD-K ratified
    /// ("order a repair, the lights come back"), here "order a repair, the deck breathes".</para>
    ///
    /// <para><b>THE OWNER DECISION, CITED.</b> OD-M item 2 (2026-07-31) adopted option A and
    /// <b>amends OD-E's headline</b>: <i>"deck 1 boots dead and the player may bring it back; the
    /// sim still has no vertical gas term."</i> The parenthetical STANDS — this package adds no
    /// vertical gas term and needs none, because an <c>AirVent</c> injects into <b>its own room</b>
    /// (<c>AtmosphereSystem.cs:123-145</c>). ⛔ Nothing here may be satisfied by re-pressurising a
    /// room: that is the wand W4b deleted and M1-L-b deleted the command behind it.</para>
    ///
    /// <para>⚠️ <b>EVERY EXPECTATION IS WRITTEN OUT BY HAND</b> and never read back from
    /// <see cref="AuthoredShips"/> — the house rule of <see cref="WreckShipTests"/> and
    /// <see cref="WreckPowerNetworkTests"/>. These literals ARE the pin.</para>
    ///
    /// <para>⚠️ <b>EVERY LEG IS ITS OWN <c>[Test]</c></b> (the fifth trap shape: <c>Assert</c>
    /// throws, so a dead second leg is indistinguishable from a live one). The three legs are the
    /// charter's three mutable rows, and they are deliberately three tests and not one:</para>
    /// <list type="table">
    ///   <item><b>mutation 1 — author the vent but not the riser</b> ⇒
    ///     <see cref="TheVentIsWreckedAtBoot_AndPOWERED_ThroughItsOneSurvivingRiser"/>. ⚠️ This is
    ///     the failure the package exists to avoid and it needs its OWN red test, because an
    ///     unpowered vent is indistinguishable from "not built yet".</item>
    ///   <item><b>mutation 2 — author the vent already repaired</b> ⇒
    ///     <see cref="AtBoot_TheUpperDeckIsStillDead_AndStaysDeadUnattended"/>. Without this leg the
    ///     package silently deletes the milestone's own repair beat.</item>
    ///   <item><b>mutation 3 — repair it, run 3 000 ticks, assert nothing</b> ⇒
    ///     <see cref="AfterTheRepair_TheHallFillsAndBecomesWorkable"/>, which asserts an ABSOLUTE
    ///     kPa floor and not a ratio (the seventh trap: a ratio suite cannot see a 2× scale
    ///     error).</item>
    ///   <item><b>mutation 4 — restore more than one tap</b> ⇒ NOT here: it is the census leg and
    ///     it lives with the census, in
    ///     <c>WreckPowerNetworkTests.Deck1IsGenuinelyOffNetwork_ExceptTheOneExemptedRiser_AndNothingOnDeck0Is</c>.</item>
    ///   <item><b>mutation 5 — close it by re-pressurising on room creation</b> ⇒ ⛔ <b>CANNOT BE
    ///     APPLIED, AND IT IS RECORDED RATHER THAN ATTEMPTED.</b> <c>AddRoomCommand</c> was deleted
    ///     by M1-L-b under OD-K; there is no command left to add the wand back to. The historical
    ///     wand is UNREACHABLE, not merely discouraged.</item>
    /// </list>
    ///
    /// <para>⛔⭐ <b>KNOWN LIMIT, DRIVEN IN THIS LANE AND FILED RATHER THAN FIXED: THE PLAYER
    /// CANNOT PERFORM THIS REPAIR YET. TWO BLOCKERS, IN THIS ORDER.</b></para>
    ///
    /// <para><b>1. REACHABILITY — and it is SILENT.</b> Every deck-1 hall door boots SHUT and
    /// OFF-NETWORK, and <see cref="Simulation.IsWalkable"/> refuses a shut door tile, so at boot
    /// there is NO PATH into <c>hall_d1_s0</c> at all. Measured: <c>door_d1_s0</c> (5,7,1)
    /// <c>IsOpen=false</c> / <c>IsWalkable=false</c>; <c>FindPath</c> to the tile beside the vent
    /// FALSE, control path to the deck-1 ladder head TRUE. ⛔ <c>PrioritiseJobCommand</c> ACCEPTS
    /// the order anyway (<c>TryFindStagingTile</c> tests the staging tile's walkability and air,
    /// never its REACHABILITY) — <c>JobKind=Maintain</c>, <c>HeldByOrder=true</c> — and the job
    /// then evaporates in <c>MaintenanceSystem.DriveWorker</c>'s abandon path: 20 000 ticks later
    /// she is alive on deck 0, <c>JobKind=None</c>, zero work ticks served, vent still 0.06. No
    /// badge, no dock row, no movement. The player must open <c>door_d1_s0</c> by hand first
    /// (<c>SetDoorStateCommand</c> has no power gate, so an off-network door still opens).</para>
    ///
    /// <para><b>2. SURVIVABILITY — only after the door is open.</b> 900 s of service (9 000 work
    /// ticks) against <c>needs.suffocation_per_second_vacuum</c> = 1/90. Driven, door first then
    /// order: she crosses, takes the service and is DEAD at tick 1 341 (~134 sim-seconds), vent
    /// still 0.06. <c>VacuumOrderLadderTests.Rung4_SheMayDie_AndThatIsTheFeature</c> pins the same
    /// arithmetic on its own fixture.</para>
    ///
    /// <para>⚠️ <b>THE CHARTER'S ACCEPTANCE SCRIPT ORDERS ITS STEPS WRONGLY</b> — the hall door
    /// must be opened BEFORE the repair order, or step 2 lands in blocker 1's total silence.</para>
    ///
    /// <para>⚠️ <b>ONLY ONE HALF IS BEYOND AUTHORING.</b> Survivability is: every deck-1 tile is
    /// vacuum, so no geometry can put a breathable staging tile beside this machine. Reachability
    /// is NOT — authoring <c>door_d1_s0</c> open, or exempting its tap, are both choices inside
    /// <see cref="AuthoredShips"/>, and both are OWNER calls left open (the first moves this ship's
    /// "no open door faces vacuum at boot" invariant; the second moves the tap census).</para>
    ///
    /// <para>⇒ The mechanism, the power and the boot state are real and asserted below. <b>These
    /// tests therefore apply the repair as the STATE the sim's own Seals rung leaves</b>
    /// (<c>sim.Defs.Wear.SealServiceCondition</c>, read from the defs so a retune moves with it) —
    /// stated plainly rather than dressed up as a drive that cannot happen.</para>
    /// </summary>
    public class Deck1VentTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static Simulation Boot()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
            for (int i = 0; i < 20; i++) sim.Tick();   // two power balance passes: topology + Powered
            return sim;
        }

        // ----------------------------------------------------------- the hand-written pins

        /// <summary>The vent's name. The pod bay's future refusal ("NO BERTH — UPPER DECK AIRLESS")
        /// wants a name to point at, and so does the player's right-click menu.</summary>
        private const string VentName = "vent_d1";
        /// <summary>Deck 1, slot 0 — the top-left hall, directly above the cryo bay. Not one of the
        /// three collapsed bottom-row slots (5/6/7), so it has a full 10×6 interior.</summary>
        private const string HallAnchor = "hall_d1_s0";
        /// <summary>The vent's tile: the hall's <c>(X1, Y0)</c> corner, DIRECTLY ABOVE
        /// <c>vent_cryo</c> at (10,1,0). Written out, not derived.</summary>
        private static readonly Int3 VentTile = new Int3(10, 1, 1);
        /// <summary>The deck-0 tile under it — the one riser tap <c>WreckCutDeck1Risers</c> exempts,
        /// and the tile <c>vent_cryo</c> itself stands on.</summary>
        private static readonly Int3 TapTile = new Int3(10, 1, 0);
        /// <summary>A floor tile inside the hall, clear of <c>AddWreckedHall</c>'s device row
        /// (y = Y0+1 = 2) — where a worker would stand.</summary>
        private static readonly Int3 HallFloor = new Int3(5, 3, 1);
        /// <summary>A deck-1 hall the vent is NOT in. It must stay at 0.000 kPa in every leg,
        /// including the repaired one: gas is SAME-DECK <b>and</b> same-room, and a vent that
        /// filled the whole deck would mean a transport term nobody wrote.</summary>
        private static readonly Int3 OtherHallFloor = new Int3(16, 3, 1);

        /// <summary>AirVent's <c>fail</c> from machines.def, restated by hand: the vent is authored
        /// BELOW it, which is what makes the deck dead at boot.</summary>
        private const float AirVentFailBelow = 0.10f;
        /// <summary>wear.wreck_threshold, restated by hand: the vent is authored below it too, so it
        /// cannot be bodged back for free — the repair costs a consumable, like every other wreck.
        /// </summary>
        private const float WreckThreshold = 0.25f;

        /// <summary>⭐ AN ABSOLUTE kPa FLOOR, NEVER A RATIO (the seventh trap: a suite built from
        /// ratios is blind to a scale error). 80 kPa is comfortably under nominal 101.3 and
        /// comfortably over what any leak-in could account for; a hall at 0.000 kPa is the state
        /// this package exists to change.</summary>
        private const double BreathableFloorKPa = 80.0;
        /// <summary>"Still 0.000 kPa" with a hair of slack, so the assertion is about a dead deck
        /// and not about float equality.</summary>
        private const double DeadDeckCeilingKPa = 0.001;
        /// <summary>The charter's own window: 3 000 ticks = 300 sim-seconds at 10 Hz.</summary>
        private const int ThreeThousandTicks = 3000;

        private static Device Vent(Simulation sim)
        {
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Name == VentName) return devices[i];
            Assert.Fail(VentName + " is not on the ship at all — M3-11's whole subject is missing");
            return null;
        }

        private static double PressureAt(Simulation sim, Int3 tile) =>
            sim.Rooms.RoomAt(sim.World, tile).PressureKPa;

        private static string F(double v) => v.ToString("F3", CultureInfo.InvariantCulture);

        // ------------------------------------------------- 0. the fixture says what it is

        /// <summary>
        /// The premises every leg below rests on, and each of them is a way this file could be
        /// quiet for the wrong reason: the vent is where the literals say, it is an
        /// <see cref="DeviceKind.AirVent"/>, it boots OPEN, and the two probe tiles really are
        /// inside the two rooms they are supposed to name.
        /// </summary>
        [Test]
        public void TheFixtureIsTheShipTheseLiteralsDescribe()
        {
            var sim = Boot();
            var vent = Vent(sim);
            var offenders = new List<string>();

            if (vent.Kind != DeviceKind.AirVent) offenders.Add($"{VentName} is a {vent.Kind}, not an AirVent");
            if (vent.Pos != VentTile)
                offenders.Add($"{VentName} stands at {vent.Pos.X},{vent.Pos.Y},{vent.Pos.Z}, not at " +
                              $"{VentTile.X},{VentTile.Y},{VentTile.Z}");
            if (!vent.IsOpen)
                offenders.Add($"{VentName} boots SHUT. It must boot OPEN: a closed AirVent draws nothing " +
                              "(PowerSystem.IsWanting) and would need a SECOND gesture after the repair, and " +
                              "the package's sentence is 'order ONE repair and the deck breathes'");

            // The two rooms are DIFFERENT rooms and NEITHER is the vacuum sink. Without this the
            // "other hall stays dead" control could be measuring the same room twice, or room 0.
            ushort ventRoom = sim.Rooms.RoomIdAt(sim.World, HallFloor);
            ushort otherRoom = sim.Rooms.RoomIdAt(sim.World, OtherHallFloor);
            if (ventRoom == 0) offenders.Add("the hall probe tile resolves to the VACUUM SINK, not to a room");
            if (otherRoom == 0) offenders.Add("the control probe tile resolves to the VACUUM SINK, not to a room");
            if (ventRoom == otherRoom)
                offenders.Add("both probe tiles are in the SAME room, so the 'other hall stays dead' control " +
                              "is measuring the vent's own compartment");
            if (sim.Rooms.RoomIdAt(sim.World, VentTile) != ventRoom)
                offenders.Add($"{VentName} is not in the room the hall probe names — the vent would fill a " +
                              "compartment no leg below looks at");

            // The tap. The riser is the mechanism, so its existence is a premise and not a detail.
            // ⚠️ SCANNED, NOT `TryGetDeviceAt` — TWO devices stand on that tile and the tray is not
            // the one it returns. That is the geometry: the exempted tap is the tile `vent_cryo`
            // itself stands on, which is why the exemption costs the deck-0 tray nothing.
            bool tray = false, cryoVent = false;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                if (devices[i].Pos != TapTile) continue;
                if (devices[i].Kind == DeviceKind.Conduit) tray = true;
                if (devices[i].Name == "vent_cryo") cryoVent = true;
            }
            if (!tray)
                offenders.Add($"there is no Conduit at {TapTile.X},{TapTile.Y},{TapTile.Z} — the exempted riser " +
                              "tap is gone, and with it the only way the upper deck can be powered");
            if (!cryoVent)
                offenders.Add($"vent_cryo no longer stands at {TapTile.X},{TapTile.Y},{TapTile.Z}. The deck-1 " +
                              "vent is authored DIRECTLY ABOVE it on purpose — the one riser the raiders left " +
                              "is the one inside the one compartment whose life support they never finished. If " +
                              "the cryo bay moves, re-argue this geometry rather than re-typing the literals.");

            Assert.That(offenders, Is.Empty,
                "this file's literals no longer describe --ship wreck:\n  " + string.Join("\n  ", offenders));
        }

        // ---------------------------------- 1. the power leg (charter mutation 1 goes red here)

        /// <summary>
        /// ⭐⭐ <b>THE POWER LEG.</b> The vent is authored WRECKED — below <c>AirVent</c>'s
        /// <c>fail</c> (0.10) and below <c>wear.wreck_threshold</c> (0.25) — and it is nonetheless
        /// <b>POWERED</b>, through the one deck-0 tray tile <c>WreckCutDeck1Risers</c> exempts.
        ///
        /// <para>⛔ <b>MUTATION 1 (charter): author the vent but not the riser</b> — delete the
        /// <c>if (d.Name == WreckDeck1VentName) continue;</c> exemption in
        /// <c>WreckCutDeck1Risers</c> ⇒ RED HERE, and nowhere else that says why. ⚠️ This mutation
        /// needs its own test precisely because its symptom — a deck that never gets air — is
        /// <b>indistinguishable from "the vent was never built"</b>. A player would file the same
        /// bug report for both.</para>
        ///
        /// <para>⚠️ Both halves are in one accumulate-then-assert list: "wrecked" without "powered"
        /// is the mutation, and "powered" without "wrecked" is mutation 2. A reader needs to see
        /// which one moved.</para>
        /// </summary>
        [Test]
        public void TheVentIsWreckedAtBoot_AndPOWERED_ThroughItsOneSurvivingRiser()
        {
            var sim = Boot();
            var vent = Vent(sim);
            var offenders = new List<string>();

            // --- WRECKED.
            if (vent.Condition >= AirVentFailBelow)
                offenders.Add($"{VentName} boots at Condition {F(vent.Condition)}, at or above AirVent's fail " +
                              $"({F(AirVentFailBelow)}) — it is OPERATIVE at boot, so the upper deck is not dead " +
                              "and OD-E's amended boot state ('deck 1 boots dead') is broken");
            if (vent.IsOperational(sim.Defs))
                offenders.Add($"{VentName} reads IsOperational at boot");
            if (vent.Condition >= WreckThreshold)
                offenders.Add($"{VentName} boots at Condition {F(vent.Condition)}, at or above " +
                              $"wear.wreck_threshold ({F(WreckThreshold)}) — it could be bodged back with EMPTY " +
                              "HANDS, so opening the upper deck would cost the player nothing at all");

            // --- AND POWERED. This is the half mutation 1 deletes.
            if (vent.NetworkId == 0)
                offenders.Add($"{VentName} is OFF-NETWORK. Its riser tap has been cut with the other 23, so the " +
                              "vent is INERT: repairing it would change nothing and the upper deck can never be " +
                              "opened. ⇒ Restore the one exemption in AuthoredShips.WreckCutDeck1Risers.");
            else if (!vent.Powered)
                offenders.Add($"{VentName} is on network {vent.NetworkId} but UNPOWERED — LifeSupport is the " +
                              "LAST tier shed, so if this vent is dark the whole ship is");

            Assert.That(offenders, Is.Empty,
                "the deck-1 vent is not the machine this package authored:\n  " + string.Join("\n  ", offenders));
        }

        // ------------------------------- 2. the frontier leg (charter mutation 2 goes red here)

        /// <summary>
        /// ⭐⭐ <b>THE FRONTIER LEG — THE UPPER DECK IS STILL DEAD AT BOOT, AND STAYS DEAD.</b>
        /// OD-E's headline is amended, not deleted: deck 1 <b>boots</b> dead, and the halls read
        /// 0.000 kPa on the player's first screen and on every screen until they do something.
        ///
        /// <para>⛔ <b>MUTATION 2 (charter): author the vent already repaired</b> (any Condition at
        /// or above AirVent's 0.10 <c>fail</c>) ⇒ RED here. ⭐ <b>Without this leg the package
        /// silently deletes the milestone's own repair beat</b> — the deck would simply come with
        /// air and nobody would notice the objective had evaporated.</para>
        ///
        /// <para>⚠️ <b>IT IS DRIVEN FOR 3 000 TICKS, NOT READ AT TICK 0</b>, and that is what makes
        /// the mutation bite: at tick 0 a repaired vent has not injected anything yet, so a tick-0
        /// assertion would be GREEN on the mutated ship. The window is the same 300 sim-seconds the
        /// repaired leg uses, so the two tests are the same experiment with one variable changed.
        /// </para>
        /// </summary>
        [Test]
        public void AtBoot_TheUpperDeckIsStillDead_AndStaysDeadUnattended()
        {
            var sim = Boot();
            double atBoot = PressureAt(sim, HallFloor);
            for (int t = 0; t < ThreeThousandTicks; t++) sim.Tick();

            var offenders = new List<string>();
            if (atBoot > DeadDeckCeilingKPa)
                offenders.Add($"{HallAnchor} holds {F(atBoot)} kPa at BOOT, not 0.000");
            double after = PressureAt(sim, HallFloor);
            if (after > DeadDeckCeilingKPa)
                offenders.Add($"{HallAnchor} holds {F(after)} kPa after {ThreeThousandTicks} unattended ticks, " +
                              "not 0.000 — the deck-1 vent is OPERATIVE at boot, so the upper deck opens itself " +
                              "and the repair order this package exists to create has nothing to do");
            if (WorksiteSafety.CanStageWorkerAt(sim, HallFloor))
                offenders.Add($"a worker may already be staged inside {HallAnchor} unattended — the pressure " +
                              "frontier has moved without the player doing anything");

            Assert.That(offenders, Is.Empty,
                "deck 1 no longer BOOTS dead (OD-M item 2 amended OD-E's headline; it did not delete " +
                "the boot state):\n  " + string.Join("\n  ", offenders));
        }

        // -------------------------------- 3. the driven leg (charter mutation 3 goes red here)

        /// <summary>
        /// ⭐⭐ <b>THE DRIVEN LEG — THE DECK BREATHES.</b> Repair the one machine, run the sim for
        /// 300 sim-seconds and the hall goes from 0.000 kPa to breathable, and
        /// <c>WorksiteSafety.CanStageWorkerAt</c> — the rule that decides whether ANY job may
        /// happen in a compartment — flips to true inside it. That flip is the package's whole
        /// point: the thaw curve now has somewhere to put people.
        ///
        /// <para>⛔ <b>MUTATION 3 (charter): repair the vent, run 3 000 ticks, assert nothing</b> ⇒
        /// this test is what makes that a red rather than a shrug.</para>
        ///
        /// <para>⚠️ <b>THE FLOOR IS ABSOLUTE kPa, NOT A RATIO OR A "&gt; 0"</b> (seventh trap). A
        /// "pressure rose" assertion passes on a vent injecting a thousandth of what it should, and
        /// a ratio assertion cannot see a 2× scale error at all.</para>
        ///
        /// <para>⚠️ <b>AND THE CONTROL IS A SECOND HALL, which is the leg that keeps this test
        /// honest about the MECHANISM.</b> Gas is same-deck AND same-room: the vent must fill its
        /// own compartment and nothing else. A second deck-1 hall still reading 0.000 kPa is what
        /// distinguishes "an AirVent injected into its room" from "somebody re-pressurised deck 1",
        /// which is the wand W4b deleted and which ⛔ must never come back (MECHANICS §13.23a).
        /// </para>
        ///
        /// <para><b>HOW THE REPAIR IS APPLIED, STATED PLAINLY:</b> the Condition a SEALS service
        /// leaves (<c>wear.seal_service_condition</c>), read from the defs. It is NOT driven through
        /// a crew member, and the reason is measured and filed in this class's header — a 900 s
        /// service inside a 90 s vacuum survival budget kills the servicer. The mechanism under test
        /// here is the VENT; the route to the order is M3-14's and the survivability gap is the
        /// owner's.</para>
        /// </summary>
        [Test]
        public void AfterTheRepair_TheHallFillsAndBecomesWorkable()
        {
            var sim = Boot();
            var vent = Vent(sim);

            // The state a Seals service leaves. Read from the defs so a retune of the repair ladder
            // moves this test with it rather than stranding a magic number here.
            float repaired = sim.Defs.Wear.SealServiceCondition;
            Assert.That(repaired, Is.GreaterThanOrEqualTo(AirVentFailBelow),
                "fixture: wear.seal_service_condition has fallen below AirVent's fail threshold, so " +
                "a Seals service no longer produces a working vent and this leg tests nothing");

            // --- BEFORE: the compartment is dead and unworkable. The inclusion control (§13.4) —
            // without it "it is breathable now" could be true of a hall that always was.
            double before = PressureAt(sim, HallFloor);
            bool stageableBefore = WorksiteSafety.CanStageWorkerAt(sim, HallFloor);
            Assert.That(before, Is.LessThanOrEqualTo(DeadDeckCeilingKPa),
                "control: " + HallAnchor + " must start at 0.000 kPa, or this leg measures nothing");
            Assert.That(stageableBefore, Is.False,
                "control: no worker may be staged in " + HallAnchor + " before the repair");
            double controlBefore = PressureAt(sim, OtherHallFloor);

            vent.Condition = repaired;
            for (int t = 0; t < ThreeThousandTicks; t++) sim.Tick();

            var offenders = new List<string>();
            double after = PressureAt(sim, HallFloor);
            if (after < BreathableFloorKPa)
                offenders.Add($"{HallAnchor} holds {F(after)} kPa after the repair and {ThreeThousandTicks} " +
                              $"ticks, under the floor of {F(BreathableFloorKPa)} kPa (it started at {F(before)})");
            if (!WorksiteSafety.CanStageWorkerAt(sim, HallFloor))
                offenders.Add($"a worker still may not be staged inside {HallAnchor} — the deck has air and is " +
                              "still not WORKABLE, so the thaw curve has nowhere to put anybody and the package " +
                              "delivered a gauge rather than a place");
            if (!Vent(sim).IsOperational(sim.Defs))
                offenders.Add($"{VentName} is not operational after the repair — it wore back through fail inside " +
                              "300 sim-seconds, and the compartment has a fuse on it measured in minutes");

            // THE MECHANISM CONTROL: the OTHER hall must be exactly as dead as it was.
            double controlAfter = PressureAt(sim, OtherHallFloor);
            if (controlBefore > DeadDeckCeilingKPa || controlAfter > DeadDeckCeilingKPa)
                offenders.Add($"a deck-1 hall the vent is NOT in went {F(controlBefore)} -> {F(controlAfter)} kPa. " +
                              "An AirVent fills ITS OWN ROOM; if the rest of the deck filled too, something has " +
                              "added a transport term or re-pressurised the deck, and OD-E's surviving " +
                              "parenthetical ('the sim still has no vertical gas term') is broken");

            Assert.That(offenders, Is.Empty,
                "the repaired vent did not open the upper deck:\n  " + string.Join("\n  ", offenders));
        }
    }
}
