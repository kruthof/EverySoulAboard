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
    /// ⭐⭐ <b>RE-CUT BY M3-16 (OD-O), AND THE RE-CUT IS THE FIRST THING TO READ.</b>
    ///
    /// <para><b>WHAT CHANGED, AND WHAT DID NOT.</b> M3-11 authored <c>vent_d1</c> BROKEN
    /// (<c>Condition = 0.06</c>, below <c>AirVent</c>'s <c>fail</c> 0.10) so the deck booted dead
    /// and a REPAIR order was what opened it. OD-O replaced that beat with a programming one: the
    /// vent is now authored <b>mechanically fine and OPERATIONAL</b> (<c>Condition = 0.62</c>) with
    /// its <b>controller board dead</b> (<c>Rate = 0f</c>, <c>Faulted = true</c>). ⛔ <b>THE
    /// MECHANISM, THE POWER AND THE DEAD DECK ARE UNCHANGED AND ARE STILL PINNED HERE.</b> What
    /// moved is the AUTHORED PREMISE and, with it, which of these tests is about what:</para>
    /// <list type="table">
    ///   <item><b>RED BY CONSTRUCTION, RE-CUT</b> —
    ///     <see cref="TheVentIsMechanicallySound_ButItsBoardIsDead_AndItIsPOWERED_ThroughItsOneSurvivingRiser"/>
    ///     (was <c>TheVentIsWreckedAtBoot_AndPOWERED_…</c>). Its three "wrecked" assertions
    ///     (<c>Condition &lt; 0.10</c>, <c>!IsOperational</c>, <c>Condition &lt; 0.25</c>) ALL
    ///     invert at 0.62 and are replaced by the new premise. ⚠️ <b>ITS POWERED HALF
    ///     (<c>NetworkId != 0</c>, <c>Powered</c>) IS UNTOUCHED AND SURVIVES VERBATIM</b> — that
    ///     half is M3-11's real subject and M3-11's mutation 1 still reddens here and nowhere else
    ///     that says why. Deleting it with the rest would be M3-16 quietly removing somebody else's
    ///     coverage (the ninth trap: an instrument narrowed goes blind).</item>
    ///   <item><b>RED BY CONSTRUCTION, SPLIT IN TWO</b> — <c>AfterTheRepair_TheHallFillsAnd
    ///     BecomesWorkable</c> became
    ///     <see cref="WhenSomethingHoldsTheRate_TheHallFillsAndBecomesWorkable"/> (M3-11's whole
    ///     mechanism claim, kept: an AirVent fills ITS OWN ROOM and the compartment turns workable,
    ///     with the second-hall control intact) and
    ///     <see cref="ARepairAloneDoesNothing_BecauseTheMACHINEWasNeverBroken"/> (the new premise's
    ///     own leg). Under OD-O "repairing" the vent is a NO-OP, so the old test could only have
    ///     been re-pointed or deleted; it was re-pointed, because the mechanism it proved is still
    ///     the reason the deck can ever hold air.</item>
    ///   <item><b>STILL GREEN — FOR A DIFFERENT REASON, AND THAT IS THE DANGEROUS ONE</b> —
    ///     <see cref="AtBoot_TheUpperDeckIsStillDead_AndStaysDeadUnattended"/>. It used to pass
    ///     because the vent was BELOW <c>fail</c>; it now passes because the vent's RATE is 0 while
    ///     it is open, powered AND operational. ⛔ Coverage that looks like proof: the leg therefore
    ///     asserts <c>IsOperational</c> is TRUE as a stated premise before it measures anything, so
    ///     a tree that quietly restored the old authoring would redden it rather than inherit its
    ///     green. Same demand on <see cref="TheFixtureIsTheShipTheseLiteralsDescribe"/>.</item>
    /// </list>
    /// <para>M3-16's own claims — the refusal, the bleed, the one-instance census, the program that
    /// solves the puzzle — live in <c>BoardFaultTests</c>, not here.</para>
    ///
    /// <para><b>THE PLAYER'S SENTENCE.</b> Today all eight of the wreck's deck-1 halls peak at
    /// 0.000 kPa forever and no verb changes it. After this ONE authored machine can give the upper
    /// deck air, and the act that opens it is a REPAIR — the phase-1 exit-gate shape OD-K ratified
    /// ("order a repair, the lights come back"), here "order a repair, the deck breathes".
    /// ⚠️ <b>OD-O SUPERSEDES THE SECOND HALF OF THAT SENTENCE</b>: the act that opens the deck is
    /// now a two-line MOSS program. The first half — one authored machine can give the upper deck
    /// air — is what this file still pins.</para>
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
    ///     <see cref="TheVentIsMechanicallySound_ButItsBoardIsDead_AndItIsPOWERED_ThroughItsOneSurvivingRiser"/>.
    ///     ⚠️ This is the failure the package exists to avoid and it needs its OWN red test, because
    ///     an unpowered vent is indistinguishable from "not built yet".</item>
    ///   <item><b>mutation 2 — author the vent able to inject at boot</b> ⇒
    ///     <see cref="AtBoot_TheUpperDeckIsStillDead_AndStaysDeadUnattended"/>. Without this leg the
    ///     package silently deletes the milestone's own beat. ⚠️ Since OD-O the mutation is
    ///     "author <c>Rate = 1</c>" rather than "author it repaired" — the same red, a different
    ///     field.</item>
    ///   <item><b>mutation 3 — drive the vent for 3 000 ticks and assert nothing</b> ⇒
    ///     <see cref="WhenSomethingHoldsTheRate_TheHallFillsAndBecomesWorkable"/>, which asserts an
    ///     ABSOLUTE kPa floor and not a ratio (the seventh trap: a ratio suite cannot see a 2×
    ///     scale error).</item>
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
    /// CANNOT PERFORM THIS REPAIR YET. TWO BLOCKERS, IN THIS ORDER.</b>
    /// ⭐ <b>OD-O DISSOLVES THIS LIMIT RATHER THAN CLOSING IT, AND THE DIFFERENCE MATTERS.</b>
    /// There is no repair to perform any more — the deck is opened from a console on deck 0, so
    /// nobody has to cross the frontier and nobody dies doing it. <b>Both measurements below remain
    /// TRUE of the ship</b> (deck-1 hall doors still boot shut and off-network, deck-1 tiles are
    /// still vacuum, an order to an unreachable worksite is still accepted and then silently
    /// dropped), and they are kept here verbatim because they are the only place either was ever
    /// driven. They are simply no longer on the path of this beat.</para>
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

        /// <summary>AirVent's <c>fail</c> from machines.def, restated by hand. ⚠️ SINCE OD-O THE
        /// VENT IS AUTHORED ABOVE IT: the deck is dead because the RATE is 0, not because the
        /// machine is broken.</summary>
        private const float AirVentFailBelow = 0.10f;
        /// <summary>wear.wreck_threshold, restated by hand. ⚠️ SINCE OD-O THE VENT IS AUTHORED ABOVE
        /// IT: the machine is mechanically sound and jury-riggable, not a one-way trip.</summary>
        private const float WreckThreshold = 0.25f;
        /// <summary>AirVent's <c>maint</c> from machines.def, restated by hand — OD-O's third floor.
        /// The vent is authored above it so <c>MaintenanceSystem</c> does NOT queue a service the
        /// player never asked for beside the puzzle they are trying to read.</summary>
        private const float AirVentMaintainBelow = 0.40f;
        /// <summary>The vent's authored boot condition since OD-O, restated by hand.</summary>
        private const float AuthoredCondition = 0.62f;

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
        ///
        /// <para>⭐⭐ <b>SINCE OD-O IT ALSO ASSERTS THAT THE VENT IS OPERATIONAL AND AT RATE 0, AND
        /// THAT PAIR IS THE WHOLE RE-CUT IN ONE LINE.</b> Without the first half every "the deck is
        /// dead" leg below would still pass on a tree that had quietly re-authored the vent broken
        /// — passing for the OLD reason, which is coverage that looks like proof. Without the
        /// second half nothing states why an open, powered, operational vent injects nothing.</para>
        /// </summary>
        [Test]
        public void TheFixtureIsTheShipTheseLiteralsDescribe()
        {
            var sim = Boot();
            var vent = Vent(sim);
            var offenders = new List<string>();

            if (vent.Kind != DeviceKind.AirVent) offenders.Add($"{VentName} is a {vent.Kind}, not an AirVent");
            if (!vent.IsOperational(sim.Defs))
                offenders.Add($"{VentName} is NOT operational at boot (Condition {F(vent.Condition)}, " +
                              $"AirVent fail {F(AirVentFailBelow)}). Since OD-O the machine is fine and only " +
                              "its BOARD is dead — a vent below `fail` would make every 'the deck is dead' " +
                              "leg below pass for the pre-OD-O reason and say nothing about the new premise");
            if (vent.Rate != 0f)
                offenders.Add($"{VentName} boots at Rate {F(vent.Rate)}, not 0. That is the fault's visible " +
                              "half: an open, powered, OPERATIONAL vent injects nothing only because its rate " +
                              "is zero (EffectiveRate = Rate x (0.5 + 0.5 x Condition)). Restore " +
                              "`Rate = 0f` in AuthoredShips or the upper deck breathes at boot with no player " +
                              "action at all");
            if (!vent.Faulted)
                offenders.Add($"{VentName} does not carry the OD-O fault. Its switch would answer, the rate " +
                              "would hold, and the puzzle would be a single typed line");
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
        /// ⭐⭐ <b>THE POWER LEG — RE-CUT BY OD-O ABOVE THE WAIST AND UNTOUCHED BELOW IT.</b> The
        /// vent is authored MECHANICALLY SOUND — above <c>AirVent</c>'s <c>fail</c> (0.10), above
        /// <c>wear.wreck_threshold</c> (0.25) and above <c>maint</c> (0.40) — with its controller
        /// board dead (<c>Faulted</c>, <c>Rate = 0</c>), and it is <b>POWERED</b>, through the one
        /// deck-0 tray tile <c>WreckCutDeck1Risers</c> exempts.
        ///
        /// <para>⛔ <b>MUTATION 1 (M3-11's charter): author the vent but not the riser</b> — delete
        /// the <c>if (d.Name == WreckDeck1VentName) continue;</c> exemption in
        /// <c>WreckCutDeck1Risers</c> ⇒ RED HERE, and nowhere else that says why. ⚠️ This mutation
        /// needs its own test precisely because its symptom — a deck that never gets air — is
        /// <b>indistinguishable from "the vent was never built"</b>. A player would file the same
        /// bug report for both. ⭐ <b>THE POWERED HALF BELOW IS M3-11'S, VERBATIM, AND M3-16 MAY NOT
        /// TOUCH IT</b> — the ninth trap is a correct finding that narrows an instrument, and
        /// re-cutting the three assertions above it while sweeping this away with them is exactly
        /// that shape.</para>
        ///
        /// <para>⚠️ <b>THE THIRD FLOOR — <c>maint</c> — IS NEW AND IT IS NOT DECORATION.</b> A vent
        /// authored between <c>fail</c> and <c>maint</c> would be operational and would still make
        /// <c>MaintenanceSystem</c> queue a repair job at boot, so the player's first screen would
        /// show a work item nobody ordered sitting beside a machine whose problem is not wear. The
        /// authored 0.62 clears it by 0.22 and wears at 0.010/h.</para>
        ///
        /// <para>⚠️ Every half is in one accumulate-then-assert list, because a reader needs to see
        /// WHICH premise moved: a sound machine that is unpowered is mutation 1, and a powered
        /// machine that is broken (or unfaulted, or at rate 1) is somebody re-authoring the beat.
        /// </para>
        /// </summary>
        [Test]
        public void TheVentIsMechanicallySound_ButItsBoardIsDead_AndItIsPOWERED_ThroughItsOneSurvivingRiser()
        {
            var sim = Boot();
            var vent = Vent(sim);
            var offenders = new List<string>();

            // --- MECHANICALLY SOUND. All three floors, worst first.
            if (!vent.IsOperational(sim.Defs))
                offenders.Add($"{VentName} boots at Condition {F(vent.Condition)}, below AirVent's fail " +
                              $"({F(AirVentFailBelow)}) — it is INOPERATIVE, so the deck is dead for the " +
                              "pre-OD-O reason (a broken machine) and the whole point of the beat, that the " +
                              "MACHINE IS FINE and only its board is not, has been re-authored away");
            if (vent.Condition < WreckThreshold)
                offenders.Add($"{VentName} boots at Condition {F(vent.Condition)}, below " +
                              $"wear.wreck_threshold ({F(WreckThreshold)}) — the sim calls that WRECKED, and " +
                              "a wrecked machine is a repair story, not a programming one");
            if (vent.Condition < AirVentMaintainBelow)
                offenders.Add($"{VentName} boots at Condition {F(vent.Condition)}, below AirVent's maint " +
                              $"({F(AirVentMaintainBelow)}) — MaintenanceSystem will queue a service the player " +
                              "never asked for, beside a machine whose problem is not wear");
            // ⚠️ A BAND, NOT AN EQUALITY. `Boot()` ticks 20 times to settle the power balance and
            // MachineWearSystem has already nibbled ~6e-6 off the authored value by then; an exact
            // compare here fails on the shipping ship for a reason that has nothing to do with
            // authoring. The band is tight enough that any RE-AUTHORING moves it.
            if (Math.Abs(vent.Condition - AuthoredCondition) > 0.01f)
                offenders.Add($"{VentName} boots at Condition {F(vent.Condition)}, not the authored " +
                              $"{F(AuthoredCondition)}");

            // --- BUT ITS BOARD IS DEAD. The two fields that make the beat a puzzle.
            if (!vent.Faulted)
                offenders.Add($"{VentName} is not Faulted — its switch answers and its rate holds, so there " +
                              "is nothing to work around");
            if (vent.Rate != 0f)
                offenders.Add($"{VentName} boots at Rate {F(vent.Rate)}, not 0 — it injects at boot");

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
        /// <para>⛔ <b>MUTATION 2, RE-AIMED BY OD-O: author <c>Rate = 1</c>rather than <c>0f</c></b>
        /// (or simply delete the authored <c>Rate</c>, whose <c>Device</c> default is <c>1f</c>) ⇒
        /// RED here. ⭐ <b>Without this leg the package silently deletes the milestone's own
        /// beat</b> — the deck would come with air and nobody would notice the objective had
        /// evaporated. It is <b>M3-16's mutation 6</b> under its new name.</para>
        ///
        /// <para>⛔⭐ <b>THIS LEG SURVIVED OD-O, AND IT NOW PASSES FOR A COMPLETELY DIFFERENT
        /// REASON.</b> Before: the vent sat below <c>fail</c>, so <c>AtmosphereSystem</c>'s
        /// injection branch (<c>IsOpen &amp;&amp; Powered &amp;&amp; IsOperational</c>) never ran.
        /// Now: all three of those hold and the branch RUNS every pass — it injects
        /// <c>VentMolPerSecond × EffectiveRate × Dt</c>, and <c>EffectiveRate</c> is zero.
        /// <b>Coverage that looks like proof is worse than no coverage</b>, so the leg asserts the
        /// new premise OUT LOUD before it measures anything: the vent must read
        /// <c>IsOperational</c>. A tree that quietly restored the old authoring inherits no green
        /// from here.</para>
        ///
        /// <para>⚠️ <b>IT IS DRIVEN FOR 3 000 TICKS, NOT READ AT TICK 0</b>, and that is what makes
        /// the mutation bite: at tick 0 an injecting vent has not injected anything yet, so a tick-0
        /// assertion would be GREEN on the mutated ship. The window is the same 300 sim-seconds the
        /// mechanism leg uses, so the two tests are the same experiment with one variable changed.
        /// </para>
        /// </summary>
        [Test]
        public void AtBoot_TheUpperDeckIsStillDead_AndStaysDeadUnattended()
        {
            var sim = Boot();

            // ⭐ THE PREMISE, STATED BEFORE ANYTHING IS MEASURED. Since OD-O this test is about the
            // RATE; if the vent were below `fail` it would be about the CONDITION, i.e. the old
            // test passing under a new name.
            Assert.That(Vent(sim).IsOperational(sim.Defs), Is.True,
                "PREMISE: since OD-O the deck is dead DESPITE an operational vent. A vent below " +
                "AirVent's fail threshold would make everything below pass for the pre-OD-O reason " +
                "and say nothing at all about the authored Rate = 0.");

            double atBoot = PressureAt(sim, HallFloor);
            for (int t = 0; t < ThreeThousandTicks; t++) sim.Tick();

            var offenders = new List<string>();
            if (atBoot > DeadDeckCeilingKPa)
                offenders.Add($"{HallAnchor} holds {F(atBoot)} kPa at BOOT, not 0.000");
            double after = PressureAt(sim, HallFloor);
            if (after > DeadDeckCeilingKPa)
                offenders.Add($"{HallAnchor} holds {F(after)} kPa after {ThreeThousandTicks} unattended ticks, " +
                              "not 0.000 — the deck-1 vent is INJECTING at boot, so the upper deck opens itself " +
                              "and the puzzle this package exists to create has nothing to solve");
            if (WorksiteSafety.CanStageWorkerAt(sim, HallFloor))
                offenders.Add($"a worker may already be staged inside {HallAnchor} unattended — the pressure " +
                              "frontier has moved without the player doing anything");

            Assert.That(offenders, Is.Empty,
                "deck 1 no longer BOOTS dead (OD-M item 2 amended OD-E's headline; it did not delete " +
                "the boot state):\n  " + string.Join("\n  ", offenders));
        }

        // -------------------------------- 3. the driven leg (charter mutation 3 goes red here)

        /// <summary>
        /// ⭐⭐ <b>THE DRIVEN LEG — THE DECK BREATHES.</b> Give the one machine a rate and hold it,
        /// run the sim for 300 sim-seconds, and the hall goes from 0.000 kPa to breathable while
        /// <c>WorksiteSafety.CanStageWorkerAt</c> — the rule that decides whether ANY job may
        /// happen in a compartment — flips to true inside it. That flip is M3-11's whole point: the
        /// thaw curve now has somewhere to put people.
        ///
        /// <para>⛔ <b>MUTATION 3 (charter): drive the vent for 3 000 ticks and assert nothing</b> ⇒
        /// this test is what makes that a red rather than a shrug.</para>
        ///
        /// <para>⭐⭐ <b>RE-CUT BY OD-O: THE VARIABLE IS NOW THE RATE, NOT THE CONDITION.</b> The old
        /// leg repaired the vent (<c>Condition = wear.seal_service_condition</c>) and watched the
        /// hall fill. Under OD-O the vent is ALREADY above <c>fail</c>, so that write is a no-op and
        /// the hall would stay at 0.000 — the test was red by construction and had to be re-pointed
        /// or deleted. It is re-pointed, because the claim underneath it — <b>an <c>AirVent</c>
        /// fills ITS OWN ROOM and that room becomes workable</b> — is still the reason the upper
        /// deck can ever hold air, and nothing else in the suite pins it. The no-op half is not
        /// lost either: it is
        /// <see cref="ARepairAloneDoesNothing_BecauseTheMACHINEWasNeverBroken"/>.</para>
        ///
        /// <para><b>HOW THE RATE IS HELD, STATED PLAINLY:</b> written to the field once per tick, by
        /// hand. That is a STAND-IN for the two-line <c>every 1s</c> MOSS program the player
        /// installs, and it is deliberately not the program — the mechanism under test here is the
        /// VENT, and driving it through the console, the registry, the compiler and the interpreter
        /// would make a vent failure and a MOSS failure the same red. The program's own end-to-end
        /// leg lives in <c>BoardFaultTests</c>, where the bleed constant is tuned against it.
        /// ⚠️ The hand-held rate is why this leg crosses the floor inside ONE 3 000-tick window
        /// while the real program needs two: the program is a ~50 % duty cycle by design.</para>
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
        /// </summary>
        [Test]
        public void WhenSomethingHoldsTheRate_TheHallFillsAndBecomesWorkable()
        {
            var sim = Boot();
            var vent = Vent(sim);

            // The premise the re-cut rests on: the machine needs NOTHING done to it. If this ever
            // fails the leg below would be measuring a repair again, under a name that says it is
            // not.
            Assert.That(vent.IsOperational(sim.Defs), Is.True,
                "PREMISE: since OD-O the vent is already operational, so the ONLY variable in this " +
                "leg is the rate. A vent below fail would make it the old repair test in disguise.");

            // --- BEFORE: the compartment is dead and unworkable. The inclusion control (§13.4) —
            // without it "it is breathable now" could be true of a hall that always was.
            double before = PressureAt(sim, HallFloor);
            bool stageableBefore = WorksiteSafety.CanStageWorkerAt(sim, HallFloor);
            Assert.That(before, Is.LessThanOrEqualTo(DeadDeckCeilingKPa),
                "control: " + HallAnchor + " must start at 0.000 kPa, or this leg measures nothing");
            Assert.That(stageableBefore, Is.False,
                "control: no worker may be staged in " + HallAnchor + " before the vent runs");
            double controlBefore = PressureAt(sim, OtherHallFloor);

            // HOLD THE RATE, once per tick, by hand — the stand-in for the player's `every 1s`
            // program described in the header. AtmosphereSystem bleeds a faulted device's rate back
            // toward 0 every pass, so a single write here would reproduce the puff, not the fill.
            for (int t = 0; t < ThreeThousandTicks; t++) { vent.Rate = 1f; sim.Tick(); }

            var offenders = new List<string>();
            double after = PressureAt(sim, HallFloor);
            if (after < BreathableFloorKPa)
                offenders.Add($"{HallAnchor} holds {F(after)} kPa after {ThreeThousandTicks} ticks at a held " +
                              $"rate, under the floor of {F(BreathableFloorKPa)} kPa (it started at {F(before)})");
            if (!WorksiteSafety.CanStageWorkerAt(sim, HallFloor))
                offenders.Add($"a worker still may not be staged inside {HallAnchor} — the deck has air and is " +
                              "still not WORKABLE, so the thaw curve has nowhere to put anybody and the package " +
                              "delivered a gauge rather than a place");
            if (!Vent(sim).IsOperational(sim.Defs))
                offenders.Add($"{VentName} is not operational after the run — it wore through fail inside " +
                              "300 sim-seconds, and the compartment has a fuse on it measured in minutes");

            // THE MECHANISM CONTROL: the OTHER hall must be exactly as dead as it was.
            double controlAfter = PressureAt(sim, OtherHallFloor);
            if (controlBefore > DeadDeckCeilingKPa || controlAfter > DeadDeckCeilingKPa)
                offenders.Add($"a deck-1 hall the vent is NOT in went {F(controlBefore)} -> {F(controlAfter)} kPa. " +
                              "An AirVent fills ITS OWN ROOM; if the rest of the deck filled too, something has " +
                              "added a transport term or re-pressurised the deck, and OD-E's surviving " +
                              "parenthetical ('the sim still has no vertical gas term') is broken");

            Assert.That(offenders, Is.Empty,
                "the running vent did not open the upper deck:\n  " + string.Join("\n  ", offenders));
        }

        // --------------------------- 4. the new premise's own leg (OD-O; M3-16 mutation 6's mirror)

        /// <summary>
        /// ⭐⭐ <b>A REPAIR ALONE DOES NOTHING, BECAUSE THE MACHINE WAS NEVER BROKEN.</b> The half of
        /// the old driven leg that OD-O turned into a statement about the ship rather than a step in
        /// a beat: apply the Condition a SEALS service leaves, run the same 3 000-tick window, and
        /// <c>hall_d1_s0</c> is still at 0.000 kPa.
        ///
        /// <para>⛔ <b>THIS IS THE LEG THAT STOPS OD-O BEING HALF-APPLIED.</b> A tree that raised
        /// <c>Condition</c> without authoring <c>Rate = 0f</c> reads as "the vent is fine now" to
        /// every other test in this file — and a tree that keeps <c>Rate = 0f</c> but drops the
        /// fault would let a single typed <c>set</c> line hold. Both would leave a player able to
        /// open the deck by servicing a machine that has nothing wrong with it, which is the
        /// walkthrough OD-O replaced with a puzzle.</para>
        ///
        /// <para>⚠️ Its own <c>[Test]</c>, not a leg of the one above: <c>Assert</c> throws, and a
        /// dead leg inside a passing test is indistinguishable from a live one (fifth trap).</para>
        /// </summary>
        [Test]
        public void ARepairAloneDoesNothing_BecauseTheMACHINEWasNeverBroken()
        {
            var sim = Boot();
            var vent = Vent(sim);

            // The state a Seals service leaves. Read from the defs so a retune of the repair ladder
            // moves this test with it rather than stranding a magic number here.
            float repaired = sim.Defs.Wear.SealServiceCondition;
            Assert.That(repaired, Is.GreaterThan(vent.Condition),
                "fixture: a Seals service must actually RAISE this vent's condition, or 'the repair " +
                "changed nothing' is true because the repair did nothing at all");

            vent.Condition = repaired;
            for (int t = 0; t < ThreeThousandTicks; t++) sim.Tick();

            var offenders = new List<string>();
            if (!Vent(sim).IsOperational(sim.Defs))
                offenders.Add("fixture: the serviced vent is not even operational, so the assertion below " +
                              "is about a broken machine and not about a dead board");
            if (Vent(sim).Rate != 0f)
                offenders.Add($"{VentName} holds Rate {F(Vent(sim).Rate)} after a repair — a SERVICE has " +
                              "started clearing the fault, which is the 'spend a module to replace the board' " +
                              "alternative OD-O item (ii) refused: the path is program-only");
            double after = PressureAt(sim, HallFloor);
            if (after > DeadDeckCeilingKPa)
                offenders.Add($"{HallAnchor} holds {F(after)} kPa after a repair and {ThreeThousandTicks} ticks. " +
                              "A crewed repair now opens the upper deck, so the player never has to write the " +
                              "program and OD-O's beat is a walkthrough again");

            Assert.That(offenders, Is.Empty,
                "repairing vent_d1 opened the deck — but the machine was never what was broken:\n  " +
                string.Join("\n  ", offenders));
        }
    }
}
