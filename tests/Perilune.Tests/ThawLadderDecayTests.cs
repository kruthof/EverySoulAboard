using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>D2 — THE THAW LADDER DECAYS ON A SCALE OF DAYS, AND THE SHIP SAYS SO.</b>
    ///
    /// <para><b>THE DEFECT, MEASURED ON THE SHIPPED TREE BEFORE THE FIX</b> (driven, `ac02267`, the
    /// full <c>SystemStack</c>, <c>--ship wreck</c>): the six crossable capsules ALL changed rung at
    /// <b>sim-hour 9</b>, Lindqvist at <b>18</b>, and by sim-hour 120 every capsule aboard had
    /// collapsed onto rung 7 — the deepest, three-<c>ControllerModule</c> rung. The M3 milestone
    /// demo saw one instance of this from the player's chair: Mbeki's price went <c>2 PARTS</c> →
    /// <c>1 CONTROLLER MODULE</c> inside 100 sim-minutes with nothing said anywhere. Owner's ruling
    /// (2026-08-02): <b>keep the decay as a feature, slow it, surface it</b> — and, on the second
    /// ruling of the same day, <b>slow it to ~70 sim-hours rather than ~100, so that every capsule
    /// stays above <c>Condition</c> 0.50 and the deepest one keeps its distance from <c>fail</c></b>
    /// (~410 unattended sim-hours instead of ~220). The numbers in this file are that table's.</para>
    ///
    /// <para><b>WHAT THIS FILE PINS, AND WHY IT IS THREE THINGS AND NOT ONE.</b></para>
    /// <list type="number">
    /// <item><b>THE PACING</b> — <see cref="TheFirstRungCrossing_IsMoreThanTwoAndAHalfSimDaysAway"/> and
    ///       <see cref="NoCapsuleChangesRung_AcrossThirtySixUnattendedSimHours"/>. The first is arithmetic
    ///       off the SHIPPED authored conditions in ABSOLUTE sim-hours (never a ratio — the seventh
    ///       trap: a suite built from proportions cannot see a 2× scale error, and this whole
    ///       package IS a scale change). The second DRIVES the real stack, because the arithmetic
    ///       leg uses the def's nominal 0.001/h and the sim does not: <c>DirectorSystem.WearPressure</c>
    ///       multiplies it by 1.00–1.35 (<c>MachineWearSystem.cs:70</c>), which measures ~1.08 on a
    ///       quiet wreck. Neither leg can replace the other.</item>
    /// <item><b>THE ONE AUTHORITY</b> — <see cref="TheBandFloorIsTheSameEdgeTheRungIsPricedFrom"/>.
    ///       The warning names an edge; the price crosses one. If they were two tables the bar could
    ///       warn about a boundary that no longer exists, which is worse than not warning.</item>
    /// <item><b>THE SURFACE</b> — the <c>alerts</c> section below, driven through
    ///       <c>GameSession.Render</c> onto the wire.</item>
    /// </list>
    ///
    /// <para><b>MUTATIONS (each physically applied to the shipped tree, watched go RED for the right
    /// reason, reverted from an in-memory copy — never <c>git checkout</c>, trap 2). Recorded in the
    /// lane report with the failure text; named here so a reader knows what each test can bite.</b></para>
    /// <list type="number">
    /// <item>revert ONE authored <c>PodSpec.Condition</c> to its pre-D2 value ⇒ RED in
    ///       <see cref="TheFirstRungCrossing_IsMoreThanTwoAndAHalfSimDaysAway"/> naming that pod, and in
    ///       <c>WreckShipTests.ThawLadder_TheSevenIntactCapsules_SitOnTheSevenAuthoredRungs</c>.</item>
    /// <item>revert the band table to its pre-D2 edges ⇒ RED in the pacing leg AND the driven leg
    ///       (crossings return to sim-hour 9).</item>
    /// <item>give <see cref="ThawGate.BandFloorOf"/> its own copy of the six numbers, one of them
    ///       stale ⇒ RED in <see cref="TheBandFloorIsTheSameEdgeTheRungIsPricedFrom"/>.</item>
    /// <item>drop the margin test in <c>ThawGate.CapsuleNearestToRungCrossing</c> (warn always) ⇒
    ///       RED in <see cref="TheBarIsSilent_OnTheShippedShipAtBoot"/>.</item>
    /// <item>delete the <c>alerts</c> <c>Send</c> from <c>GameSession.Render</c> ⇒ RED in
    ///       <see cref="TheBarNamesTheCapsule_WhoseThawPriceIsAboutToRise"/>.</item>
    /// </list>
    /// </summary>
    public class ThawLadderDecayTests
    {
        // ══════════════════════════════════════════════════════════════════════════ fixtures

        /// <summary>The <c>CryoPod</c> wear rate, WRITTEN OUT BY HAND (<c>machines.def:75</c>). The
        /// ship's pacing is authored AGAINST this number, so reading it from <c>SimDefs</c> would
        /// make every hour below track a def change instead of catching one — <c>WreckShipTests</c>'
        /// rule for <c>WreckThreshold</c>, applied to the rate. Pinned equal to the def by
        /// <see cref="TheseTestsPinTheDefTheShipIsAuthoredAgainst"/>.</summary>
        private const float NominalWearPerHour = 0.001f;

        /// <summary>⭐ THE PACING FLOOR, IN ABSOLUTE SIM-HOURS AND NOT IN A RATIO. Two and a half
        /// sim-days. The owner's ruling (2026-08-02, the second of the day) sets the target at
        /// <b>~70 sim-hours</b> with every capsule above <c>Condition</c> 0.50; the shipped
        /// authoring gives every crossable capsule 0.07 of headroom = 70.0 h at
        /// <see cref="NominalWearPerHour"/>, and this floor sits 10 h under it so that float
        /// representation (0.99f − 0.92f is 0.0699999928…) cannot make a correct table fail.
        ///
        /// <para>⛔ <b>IT IS STILL A REAL INSTRUMENT AT 60, AND THAT WAS CHECKED RATHER THAN
        /// ASSUMED.</b> The pre-D2 table's minimum headroom was 0.01 = <b>10 sim-hours</b>, so this
        /// floor fails it by 6×, and mutation M1 (one authored Condition reverted) is driven every
        /// time this file runs in CI. A floor loose enough to pass the shipped defect would be
        /// decoration.</para>
        ///
        /// <para>⚠️ IT IS A FLOOR ON THE MINIMUM, NOT AN AVERAGE. Six capsules wear at the same rate,
        /// so an average would be dominated by whichever pod happens to sit highest and would stay
        /// green with one capsule crossing on the first morning — which is precisely the shipped
        /// defect.</para></summary>
        private const double MinHoursToFirstCrossing = 60.0;

        private static ISimSystem[] Stack()
            => SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static Simulation BootWreck()
            => ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());

        /// <summary>A paused session on the SHIPPING ship — no sim thread, so every tick and every
        /// render below is one a test asked for. <c>WebPodBayTests</c>' fixture, verbatim.</summary>
        private static GameSession WreckSession(out SimHost host, out List<string> sent)
        {
            host = SimHost.Build(AuthoredShips.WreckSeed, ship: ShipChoice.Wreck);
            var captured = new List<string>();
            sent = captured;
            return new GameSession(host, captured.Add);
        }

        private static Device Dev(Simulation sim, string name)
            => sim.Devices.Items.FirstOrDefault(d => d.Name == name);

        /// <summary>Every capsule the ladder can actually price: shut, powered, above <c>fail</c>.
        /// Derived from the SHIP rather than from a literal list, because "the bay's roster changed"
        /// is <c>WreckShipTests</c>' job and duplicating it here would just be a second place to
        /// forget.</summary>
        private static List<Device> ThawableCapsules(Simulation sim)
        {
            var pods = new List<Device>(8);
            foreach (var d in sim.Devices.Items)
                if (d.Kind == DeviceKind.CryoPod && !d.IsOpen && d.Powered && d.IsOperational(sim.Defs))
                    pods.Add(d);
            return pods;
        }

        private static string Inv(double v) => v.ToString("0.00", CultureInfo.InvariantCulture);

        /// <summary>
        /// ⭐ THE SMALLEST GAP ANY CROSSABLE CAPSULE ABOARD STILL HAS TO ITS OWN BAND FLOOR, in
        /// <c>Condition</c> — <b>derived from the ship and the shipped table, never restated as a
        /// literal.</b>
        ///
        /// <para><b>IT EXISTS BECAUSE THE INSTRUMENT LIED ABOUT ITSELF.</b> Review found this file's
        /// failure text still saying <i>"every capsule is authored 0.10 above its floor"</i> after
        /// the owner's second ruling moved the shipped headroom to 0.07 — and that string had been
        /// SEEN firing verbatim under mutation. A guard that reddens correctly and then hands its
        /// reader a number the ship stopped having sends them to the wrong place; every headroom
        /// figure a message in this file prints now comes from here.</para>
        ///
        /// <para><c>float.PositiveInfinity</c> when nothing aboard can cross an edge at all (every
        /// capsule on the catch-all rung) — a failure message that says "Infinity" is telling the
        /// truth about that ship.</para>
        /// </summary>
        private static float SmallestHeadroomAboard(Simulation sim)
        {
            float least = float.PositiveInfinity;
            foreach (var pod in ThawableCapsules(sim))
            {
                float floor = ThawGate.BandFloorOf(ThawGate.RungOf(pod.Condition).Rung);
                if (floor == ThawGate.NoBandFloor) continue;
                float left = pod.Condition - floor;
                if (left < least) least = left;
            }
            return least;
        }

        // ═══════════════════════════════════════════════════════ 0. the def these numbers assume

        [Test]
        public void TheseTestsPinTheDefTheShipIsAuthoredAgainst()
        {
            Assert.That(NominalWearPerHour,
                Is.EqualTo(SimDefs.Default.Machines[(int)DeviceKind.CryoPod].WearPerHour),
                "machines.def's CryoPod wear rate moved. EVERY sim-hour figure in this file, in "
                + "ThawGate's band table and in AuthoredShips' capsule comments is arithmetic over "
                + "it — re-derive them all, do not relax the floor.");
            Assert.That(ThawGate.DecayWarningMargin / NominalWearPerHour, Is.EqualTo(25.0).Within(1e-4),
                "the warning margin is supposed to buy about a sim-DAY of notice at nominal wear; "
                + "at today's numbers it buys "
                + Inv(ThawGate.DecayWarningMargin / NominalWearPerHour) + " sim-hours");
        }

        // ═══════════════════════════════════════════════════════════════════ 1. the pacing

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME, HALF ONE — A CAPSULE'S PRICE TAKES DAYS TO RISE, NOT HOURS.</b>
        ///
        /// <para>Computed from the shipped authored <c>Condition</c>s and the shipped band floors,
        /// in ABSOLUTE sim-hours. Every crossable capsule is reported, so a table that fixed one pod
        /// and left another on a 9-hour fuse fails naming both (the fifth trap shape: one
        /// accumulated assertion, never one per row).</para>
        ///
        /// <para>⚠️ RUNG 7 IS EXCLUDED AND THAT IS NOT A GAP. It is the catch-all — there is no edge
        /// below it, so its price can never rise. What CAN still happen to it is falling under
        /// <c>fail</c>, which is a different, permanent event with a different owner; see the ⚠️
        /// block in <c>ThawGate</c>'s class remarks and this lane's filed line.</para>
        /// </summary>
        [Test]
        public void TheFirstRungCrossing_IsMoreThanTwoAndAHalfSimDaysAway()
        {
            var sim = BootWreck();
            var rows = new List<string>();
            var tooSoon = new List<string>();
            int crossable = 0;

            foreach (var pod in ThawableCapsules(sim))
            {
                int rung = ThawGate.RungOf(pod.Condition).Rung;
                float floor = ThawGate.BandFloorOf(rung);
                if (floor == ThawGate.NoBandFloor)
                {
                    rows.Add($"{pod.Name}: rung {rung} (catch-all — no edge below it)");
                    continue;
                }
                crossable++;
                double hours = (pod.Condition - floor) / NominalWearPerHour;
                rows.Add($"{pod.Name}: Condition {pod.Condition.ToString("R", CultureInfo.InvariantCulture)}"
                         + $" rung {rung} floor {floor.ToString("R", CultureInfo.InvariantCulture)}"
                         + $" ⇒ {Inv(hours)} sim-h ({Inv(hours / 24.0)} sim-days)");
                if (hours < MinHoursToFirstCrossing)
                    tooSoon.Add($"{pod.Name} crosses in {Inv(hours)} sim-h");
            }

            Assert.That(crossable, Is.EqualTo(6),
                "PRECONDITION: six of the seven thawable capsules sit on a band with an edge below "
                + "it (rung 7 is the catch-all). Measured " + crossable + ":\n  "
                + string.Join("\n  ", rows));

            Assert.That(tooSoon, Is.Empty,
                "⭐ THE THAW LADDER DECAYS FASTER THAN THE OWNER'S 2026-08-02 RULING ALLOWS — the "
                + "price of waking somebody rises inside " + Inv(MinHoursToFirstCrossing)
                + " sim-hours:\n  " + string.Join("\n  ", tooSoon) + "\n"
                + "  the whole bay:\n  " + string.Join("\n  ", rows) + "\n"
                + "⇒ Either a capsule's authored Condition dropped toward its floor "
                + "(sim/Sim.Gen/AuthoredShips.cs, WreckPods) or a band edge rose under it "
                + "(sim/Sim.Core/ThawGate.cs, BandFloors). Both are OWNER-VISIBLE pacing changes: "
                + "before D2 the first crossing was at sim-hour 9 and the M3 demo filed it as a "
                + "first-hour defect. Fix the content or take the change to the owner.");
        }

        /// <summary>
        /// ⭐⭐ <b>THE SAME CLAIM, DRIVEN — because the sim does not wear at the def's rate.</b>
        ///
        /// <para><c>MachineWearSystem</c> multiplies <c>WearPerHour</c> by
        /// <c>DirectorSystem.WearPressure</c> (1.00–1.35) and by a heat multiplier, so the
        /// arithmetic leg above is a statement about the TABLE and this one is a statement about the
        /// GAME. On the shipped wreck the pressure measures ~1.08, and the real first crossing is
        /// at <b>sim-hour 65</b>, measured — all six crossable capsules at once, Torres never.
        /// <b>36 sim-hours</b> is a floor with 29 hours under it that was still <b>RED before D2 by
        /// a factor of four</b> (crossings at sim-hour 9).</para>
        ///
        /// <para>⚠️ THIRTY-SIX SIM-HOURS AND NOT SEVENTY, and the reason is cost rather than
        /// confidence: this drives 1.296 M ticks of the full stack. The arithmetic leg owns the
        /// 60-hour claim; this one proves the arithmetic describes the running game.</para>
        /// </summary>
        [Test]
        public void NoCapsuleChangesRung_AcrossThirtySixUnattendedSimHours()
        {
            const int Hours = 36;
            var sim = BootWreck();
            var pods = ThawableCapsules(sim);
            var bootRung = new Dictionary<string, int>();
            var bootCond = new Dictionary<string, float>();
            foreach (var p in pods) { bootRung[p.Name] = ThawGate.RungOf(p.Condition).Rung; bootCond[p.Name] = p.Condition; }

            Assert.That(bootRung.Values.Distinct().Count(), Is.EqualTo(bootRung.Count),
                "PRECONDITION: every capsule starts on its own rung, so a rung change below is "
                + "always a capsule moving and never two capsules colliding");

            for (int t = 0; t < Hours * 36000; t++) sim.Tick();

            var moved = new List<string>();
            var seen = new List<string>();
            foreach (var p in pods)
            {
                int now = ThawGate.RungOf(p.Condition).Rung;
                double perHour = (bootCond[p.Name] - p.Condition) / Hours;
                seen.Add($"{p.Name}: {bootCond[p.Name].ToString("R", CultureInfo.InvariantCulture)}"
                         + $" → {p.Condition.ToString("R", CultureInfo.InvariantCulture)}"
                         + $" (rung {bootRung[p.Name]} → {now}, {perHour.ToString("0.00000", CultureInfo.InvariantCulture)}/h)");
                if (now != bootRung[p.Name])
                    moved.Add($"{p.Name} moved rung {bootRung[p.Name]} → {now} within {Hours} sim-hours");
            }

            Assert.That(moved, Is.Empty,
                "⭐ A CAPSULE'S THAW PRICE ROSE INSIDE 36 UNATTENDED SIM-HOURS. That is the M3 demo's "
                + "finding D2 back on the shipped ship:\n  " + string.Join("\n  ", moved) + "\n"
                + "  the whole bay after " + Hours + " sim-hours:\n  " + string.Join("\n  ", seen));

            // …and the drive really did wear the pods. Without this the test above is satisfied by a
            // sim in which nothing happened at all — a paused ship, a stack missing MachineWearSystem,
            // an unpowered bay. NON-VACUITY BY INCLUSION.
            var worn = pods.Count(p => p.Condition < bootCond[p.Name]);
            Assert.That(worn, Is.EqualTo(pods.Count),
                "NON-VACUITY: only " + worn + " of " + pods.Count + " capsules lost any Condition "
                + "over " + Hours + " sim-hours, so 'nothing crossed a band edge' may just mean "
                + "nothing happened:\n  " + string.Join("\n  ", seen));
        }

        // ═══════════════════════════════════════════════════ 2. one table, two readers

        /// <summary>
        /// ⭐ <b>THE WARNING AND THE PRICE READ THE SAME SIX NUMBERS.</b>
        /// <see cref="ThawGate.BandFloorOf"/> is asserted against <see cref="ThawGate.RungOf"/>
        /// BEHAVIOURALLY — the floor it reports must be the exact <c>Condition</c> at which the rung
        /// changes — rather than against a second hand-written copy of the edges. A copy would pass
        /// even if both had drifted the same way; this cannot.
        ///
        /// <para>Both sides of every edge, because a one-sided pin is satisfied by a table that has
        /// collapsed two bands into one (<c>WreckShipTests</c>' own rule for the same table).</para>
        /// </summary>
        [Test]
        public void TheBandFloorIsTheSameEdgeTheRungIsPricedFrom()
        {
            var offenders = new List<string>();
            const float step = 0.001f;

            for (int rung = 1; rung < ThawGate.RungCount; rung++)
            {
                float floor = ThawGate.BandFloorOf(rung);
                if (floor == ThawGate.NoBandFloor)
                {
                    offenders.Add($"rung {rung} reports NO band floor, but only rung "
                                  + ThawGate.RungCount + " is the catch-all");
                    continue;
                }
                int onIt = ThawGate.RungOf(floor).Rung;
                int under = ThawGate.RungOf(floor - step).Rung;
                if (onIt != rung)
                    offenders.Add($"a capsule at EXACTLY rung {rung}'s reported floor "
                                  + floor.ToString("R", CultureInfo.InvariantCulture)
                                  + $" prices as rung {onIt} — the warning would name an edge the "
                                  + "price does not have");
                if (under != rung + 1)
                    offenders.Add($"just under rung {rung}'s floor the price is rung {under}, "
                                  + $"expected {rung + 1}");
            }

            if (ThawGate.BandFloorOf(ThawGate.RungCount) != ThawGate.NoBandFloor)
                offenders.Add("the catch-all rung reported a band floor; it has no edge below it, "
                              + "and a numeric answer there makes the bar warn about a crossing "
                              + "that can never happen");
            if (ThawGate.BandFloorOf(0) != ThawGate.NoBandFloor ||
                ThawGate.BandFloorOf(ThawGate.RungCount + 1) != ThawGate.NoBandFloor)
                offenders.Add("BandFloorOf must be TOTAL: an out-of-range rung answers NoBandFloor");

            Assert.That(offenders, Is.Empty,
                "THE DECAY WARNING AND THE THAW PRICE HAVE DRIFTED APART (sim/Sim.Core/ThawGate.cs):\n  "
                + string.Join("\n  ", offenders) + "\n"
                + "⇒ RungOf and BandFloorOf must read the SAME BandFloors array. If one of them has "
                + "acquired its own copy of the six edges, delete the copy — do not sync it.");
        }

        // ═══════════════════════════════════════════════════ 3. who the ship warns about

        /// <summary>
        /// ⭐ <b>THE CAPSULE NEAREST TO CROSSING IS THE ONE NAMED — and three kinds of capsule are
        /// never named at all.</b> One test, offenders accumulated, so a dead leg cannot hide behind
        /// an earlier throw (the fifth trap).
        /// </summary>
        [Test]
        public void TheShipWarnsAboutTheNearestCapsule_AndNeverAboutOneWithNothingToLose()
        {
            var offenders = new List<string>();

            // (a) the shipped ship, untouched: nothing is close, so nobody is named.
            var sim = BootWreck();
            if (ThawGate.CapsuleNearestToRungCrossing(sim, out float m0) != null)
                offenders.Add("the shipped wreck warns at boot (margin " + Inv(m0)
                              + ") — the tightest capsule aboard is " + Inv(SmallestHeadroomAboard(sim))
                              + " above its own floor and the warning margin is only "
                              + Inv(ThawGate.DecayWarningMargin));

            // (b) one capsule pushed inside the margin ⇒ that capsule, by name.
            var mbeki = Dev(sim, "pod_mbeki");
            int rung = ThawGate.RungOf(mbeki.Condition).Rung;
            mbeki.Condition = ThawGate.BandFloorOf(rung) + ThawGate.DecayWarningMargin * 0.5f;
            var named = ThawGate.CapsuleNearestToRungCrossing(sim, out float m1);
            if (named == null || named.Name != "pod_mbeki")
                offenders.Add("a capsule half a margin from its edge was not the one reported (got "
                              + (named?.Name ?? "nothing") + ")");
            else if (Math.Abs(m1 - ThawGate.DecayWarningMargin * 0.5f) > 1e-4f)
                offenders.Add("the reported margin was " + Inv(m1) + ", not the distance left");

            // (c) a SECOND capsule closer to its own edge outranks it — nearest-to-crossing wins,
            //     which is the only rule that keeps one line honest when several are decaying.
            var bahri = Dev(sim, "pod_bahri");
            bahri.Condition = ThawGate.BandFloorOf(ThawGate.RungOf(bahri.Condition).Rung)
                              + ThawGate.DecayWarningMargin * 0.1f;
            var nearest = ThawGate.CapsuleNearestToRungCrossing(sim, out _);
            if (nearest == null || nearest.Name != "pod_bahri")
                offenders.Add("with two capsules inside the margin the ship named "
                              + (nearest?.Name ?? "nothing") + " instead of the nearer one");

            // (d) the catch-all rung is never named: its price cannot rise. Driven at the extreme —
            //     Torres put one step above `fail`, i.e. as decayed as a live capsule can be.
            var quiet = BootWreck();
            var torres = Dev(quiet, "pod_torres");
            torres.Condition = SimDefs.Default.Machines[(int)DeviceKind.CryoPod].FailBelow + 0.001f;
            if (ThawGate.RungOf(torres.Condition).Rung != ThawGate.RungCount)
                offenders.Add("FIXTURE: Torres at the bottom of the ladder is not on the catch-all rung");
            if (ThawGate.CapsuleNearestToRungCrossing(quiet, out _) != null)
                offenders.Add("a capsule on the catch-all rung was warned about — its price can "
                              + "never rise again, so the sentence would be false");

            // (e) an OPEN capsule and a capsule below `fail` are both invisible to the warning: one
            //     has no price left to pay and the other's sleeper is already dead (term 1 refuses
            //     it permanently). Driven by putting both exactly where the margin would fire.
            var edge = BootWreck();
            var rell = Dev(edge, "pod_rell");
            var vance = Dev(edge, "pod_vance");
            if (!rell.IsOpen) offenders.Add("FIXTURE: pod_rell is supposed to boot OPEN");
            if (vance.IsOperational(edge.Defs)) offenders.Add("FIXTURE: pod_vance is supposed to boot below fail");
            rell.Condition = ThawGate.BandFloorOf(2) + ThawGate.DecayWarningMargin * 0.1f;
            vance.Condition = 0.04f;   // left where the raid put it: below `fail`, rung 7 anyway
            if (ThawGate.CapsuleNearestToRungCrossing(edge, out _) != null)
                offenders.Add("the warning fired for an open or a wrecked capsule");

            Assert.That(offenders, Is.Empty,
                "THE DECAY WARNING PICKS THE WRONG CAPSULE (sim/Sim.Core/ThawGate.cs, "
                + "CapsuleNearestToRungCrossing):\n  " + string.Join("\n  ", offenders));
        }

        // ═══════════════════════════════════════════════════ 4. the bar the player reads

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME, HALF TWO — THE SHIP SAYS IT, ON THE STANDARD SURFACE, BEFORE THE
        /// PRICE RISES.</b> Driven all the way onto the wire: a real <c>GameSession</c> renders a
        /// real ship and the <c>alerts</c> message it emits must carry the sentence WITH the
        /// sleeper's name in it.
        ///
        /// <para>⚠️ THE NAME IS ASSERTED, not just the presence of a line. "Something is decaying"
        /// is unactionable on a ship with seven capsules — the POD BAY is a typed command away and
        /// the player has no reason to open it unless the bar says WHO.</para>
        /// </summary>
        [Test]
        public void TheBarNamesTheCapsule_WhoseThawPriceIsAboutToRise()
        {
            var gs = WreckSession(out var host, out var sent);
            var mbeki = Dev(host.Sim, "pod_mbeki");
            Assert.That(mbeki, Is.Not.Null, "PRECONDITION: the wreck carries pod_mbeki");
            mbeki.Condition = ThawGate.BandFloorOf(ThawGate.RungOf(mbeki.Condition).Rung)
                              + ThawGate.DecayWarningMargin * 0.5f;

            sent.Clear();
            gs.RenderForTest();

            string msg = sent.Find(m => m.Contains("\"type\":\"alerts\"", StringComparison.Ordinal));
            Assert.That(msg, Is.Not.Null,
                "the session rendered no `alerts` message at all. Channels seen: "
                + string.Join(" | ", sent.Select(s => s.Length > 40 ? s.Substring(0, 40) : s)));
            Assert.That(msg, Does.Contain("MBEKI"),
                "the warning must NAME the capsule — 'something is decaying' is unactionable with "
                + "seven capsules aboard: " + msg);
            Assert.That(msg, Does.Contain("CAPSULE DECAYING").And.Contain("RISES SOON"),
                "…and it must say what is about to happen, in the ship's own voice: " + msg);
            Assert.That(msg, Is.EqualTo(WireFormat.Alerts(WireFormat.DecayAlert(host.Sim))),
                "the wire message and the formatter must be the same string — a second composition "
                + "site is a second vocabulary");
        }

        /// <summary>
        /// ⭐ <b>…AND IT IS SILENT WHEN THERE IS NOTHING TO SAY.</b> The shipped ship at boot: every
        /// capsule is 0.07 above its floor and the margin is 0.025, so the channel arrives carrying
        /// the EMPTY STRING — which is a state the wire expresses rather than an absence the client
        /// has to infer from a channel that stopped arriving (the <c>ending</c> rule).
        ///
        /// <para>⚠️ THOSE TWO NUMBERS ARE PROSE AND THE FAILURE TEXT BELOW DOES NOT REPEAT THEM — it
        /// derives the headroom from the running ship (<see cref="SmallestHeadroomAboard"/>). This
        /// comment said "0.10" for exactly as long as it took a reviewer to notice; a sentence a
        /// human maintains and a number a test prints must not be the same fact.</para>
        ///
        /// <para>⚠️ THE ORDER OF THE TWO BAR TESTS IS DELIBERATE and mirrors
        /// <c>overview-model.test.js</c>'s note: asserting silence is only worth something beside a
        /// test that proves the same rig can speak. That test is
        /// <see cref="TheBarNamesTheCapsule_WhoseThawPriceIsAboutToRise"/>.</para>
        /// </summary>
        [Test]
        public void TheBarIsSilent_OnTheShippedShipAtBoot()
        {
            var gs = WreckSession(out var host, out var sent);
            sent.Clear();
            gs.RenderForTest();

            string msg = sent.Find(m => m.Contains("\"type\":\"alerts\"", StringComparison.Ordinal));
            Assert.That(msg, Is.Not.Null, "the channel must arrive even with nothing to say");
            Assert.That(msg, Is.EqualTo("{\"type\":\"alerts\",\"text\":\"\"}"),
                "a ship whose tightest capsule is still "
                + Inv(SmallestHeadroomAboard(host.Sim) / NominalWearPerHour)
                + " sim-hours from its next edge must not be nagging the player: " + msg);
        }
    }
}
