using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Glyph;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// W3 of the wreck start — <c>--ship wreck</c>, the authored ship the opening happens on.
    /// Design of record: <c>docs/design/perilune-wreck-start.plan.md</c> revision 2.
    ///
    /// ⚠️ EVERY EXPECTATION HERE IS WRITTEN OUT BY HAND AND NEVER READ FROM THE
    /// <see cref="AuthoredShips"/> CONSTANT IT CHECKS. A test that derives its expected value from
    /// the authoring constant cannot fail when that constant changes — the recurring review defect
    /// in this repo, and one <see cref="GridWreckTests"/> was caught committing (with the wreck
    /// depth read from the constant, halving the collapse left every test green). These literals
    /// ARE the pin: changing the ship's content means changing them in the same commit, on purpose.
    ///
    /// ⚠️ EVERY LEG IS ITS OWN <c>[Test]</c> WHEREVER IT CAN BE. <c>Assert</c> throws, so only the
    /// first failing leg of a multi-leg test ever reports and a leg that cannot bite is
    /// indistinguishable from one that can (CLAUDE.md, the fifth trap shape). Every test that does
    /// loop accumulates offenders into one list and asserts ONCE, so nothing hides behind an
    /// earlier failure.
    ///
    /// ⚠️ THAT SENTENCE WAS FALSE WHEN IT WAS FIRST WRITTEN, in this very file, and independent
    /// review found it: FOUR loops asserted per-iteration, so a second offender was invisible until
    /// the first was fixed. One of those per-iteration assertions could not fail at all — the loop
    /// guard had already established a stricter bound than the assertion checked. A claim about
    /// test hygiene in a header is worth exactly as much as any other unmeasured claim.
    ///
    /// ⚠️ THE SHIP IS DRIVEN, NOT ONLY READ. A plan census proves what was authored; it proves
    /// nothing about whether the one crew member lives through the night, whether the cryo bay
    /// freezes, or whether the ladder to the vacuum deck is a death trap. Those three are driven
    /// against the real system stack — that is the E0-4 lesson (a ship that HAS content no crew can
    /// reach is not playable) and the whole reason this file is slower than a census would be.
    ///
    /// ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT TEST: a thaw. Since M3-2 there IS a
    /// <c>CryoSystem</c> (and <c>CryoSystemTests</c> drives it), but there is still no
    /// <c>ThawCommand</c> and no MOSS thaw op — nothing on this ship starts a cycle, so every pod
    /// this file censuses is shut and stays shut. A pod that will not open is correct today. The
    /// verb is M3-3.
    /// </summary>
    public class WreckShipTests
    {
        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static Simulation Boot() => ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());

        // ---------------------------------------------------------------- the hand-written pins

        private const int Decks = 2;
        private const int PodCount = 12;
        private const int PodsOpen = 1;          // the capsule the player's crew member stepped out of
        private const int PodsWreckedDead = 4;   // a wrecked OCCUPIED pod holds a DEAD sleeper (owner)
        private const int PodsIntactOccupied = 7;
        /// <summary>⭐ EIGHT LIVING SOULS — the owner's design target and the roster a won game ends
        /// with: the one already awake plus the seven still to be thawed. NOT a tuning parameter;
        /// the four WRECKED capsules beside them are.</summary>
        private const int LivingSouls = 8;
        /// <summary>Working scrubbers a full roster needs: scrubber_mol_per_second 0.001 against
        /// co2_per_person_per_second 2.73e-4 is ~3.66 crew each, so eight crew needs three. Written
        /// out by hand for the same reason every other literal here is.</summary>
        private const int ScrubbersForAFullRoster = 3;
        private const string AwakeCrew = "Rell";
        private const string CryoAnchor = "cryobay";
        private const string ReactorAnchor = "reactor";
        private const string SpineAnchor = "wreck_spine_0";
        private const string GoalAnchor = "hall_d0_s1";
        private const string MossTerminal = "term_moss";
        private const int DebrisTiles = 80;     // 4 collapsed slots × 2 rows × 10 columns

        /// <summary>The wreck floor and the pod's own fail threshold, restated by hand. Both are
        /// def values this ship is authored AGAINST, so reading them from <c>SimDefs</c> here would
        /// make every census below track a def change instead of catching one.</summary>
        private const float WreckThreshold = 0.25f;
        private const float CryoPodFailBelow = 0.10f;

        [Test]
        public void TheseTestsPinTheAuthoredShip_NotTheOtherWayRound()
        {
            var plan = AuthoredShips.PeriluneWreck();
            Assert.That(Decks, Is.EqualTo(AuthoredShips.WreckDepth), "the ship changed deck count");
            Assert.That(PodsOpen + PodsWreckedDead + PodsIntactOccupied, Is.EqualTo(PodCount),
                "the pod census does not add up");
            Assert.That(PodsOpen + PodsIntactOccupied, Is.EqualTo(LivingSouls),
                "EIGHT living souls is the design target — the open capsule plus the seven thawable " +
                "ones. If this line fails, someone has traded a crew member for set dressing.");
            int scrubbersNeeded = (int)Math.Ceiling(
                LivingSouls * SimDefs.Default.Atmosphere.CO2PerPersonPerSecond
                            / SimDefs.Default.Atmosphere.ScrubberMolPerSecond);
            Assert.That(ScrubbersForAFullRoster, Is.EqualTo(scrubbersNeeded),
                "the scrubber arithmetic moved: at today's defs eight crew need " + scrubbersNeeded +
                " working scrubbers, not " + ScrubbersForAFullRoster + ". The ship is authored " +
                "against this number — re-read the life-support block in AuthoredShips.");
            Assert.That(AwakeCrew, Is.EqualTo(AuthoredShips.WreckCrewName), "the crew member was renamed");
            Assert.That(CryoAnchor, Is.EqualTo(AuthoredShips.WreckCryoAnchor));
            Assert.That(ReactorAnchor, Is.EqualTo(AuthoredShips.WreckReactorAnchor));
            Assert.That(GoalAnchor, Is.EqualTo(AuthoredShips.WreckGoalAnchor));
            Assert.That(plan.DeckRows.Length, Is.EqualTo(Decks));
            Assert.That(WreckThreshold, Is.EqualTo(SimDefs.Default.Wear.WreckThreshold),
                "wear.wreck_threshold moved — this ship is authored against it, re-read the header");
            Assert.That(CryoPodFailBelow, Is.EqualTo(SimDefs.Default.Machines[(int)DeviceKind.CryoPod].FailBelow),
                "the CryoPod fail threshold moved — the FOUR wrecked pods may no longer read as dead");
        }

        // ---------------------------------------------------------------------- 1. the pods

        private static List<Device> Pods(Simulation sim)
        {
            var pods = new List<Device>(16);
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.CryoPod) pods.Add(devices[i]);
            return pods;
        }

        [Test]
        public void CryoBay_HoldsTwelveCapsules()
        {
            Assert.That(Pods(Boot()).Count, Is.EqualTo(PodCount));
        }

        [Test]
        public void PodCensus_IsOneOpen_FourWrecked_SevenIntact()
        {
            var sim = Boot();
            var pods = Pods(sim);
            int open = 0, wrecked = 0, intact = 0;
            var oddities = new List<string>();
            foreach (var p in pods)
            {
                if (p.IsOpen) { open++; continue; }
                if (p.Condition < CryoPodFailBelow) { wrecked++; continue; }
                if (p.Condition >= WreckThreshold) { intact++; continue; }
                oddities.Add($"{p.Name} Condition={p.Condition.ToString("R", CultureInfo.InvariantCulture)} " +
                             "is neither wrecked (below fail) nor intact (at or above the wreck floor)");
            }

            // Asserted ONCE, over the whole census, so a pod in the ambiguous middle band is
            // reported by name rather than swallowed by whichever count it fell into.
            Assert.That(oddities, Is.Empty, string.Join("\n  ", oddities));
            Assert.That(open, Is.EqualTo(PodsOpen), "open pods");
            Assert.That(wrecked, Is.EqualTo(PodsWreckedDead), "wrecked pods (dead sleepers)");
            Assert.That(intact, Is.EqualTo(PodsIntactOccupied), "intact occupied pods");

            // ⚠️ THE ⭐ LINE USED TO READ `open + intact == LivingSouls` AND COULD NEVER REPORT. The
            // three assertions above already pin open = 1 and intact = 7, so the sum was arithmetic
            // over two facts the test had just proved — the roster was really pinned by
            // 1 ∧ 7 ∧ 12 and by nothing that names LivingSouls at all. Found in review, not by
            // reading it.
            //
            // Counted INDEPENDENTLY now, and by the only thing on this ship that actually says
            // somebody died: a corpse on the pod's own tile. That routes through the item store
            // rather than through Condition, so it bites on changes the three counts above cannot
            // see — a fifth corpse, a pod authored dead but above `fail`, a corpse deleted from a
            // wrecked pod — and it is the sentence "eight people are still alive in here" rather
            // than a restatement of the census.
            int souls = 0;
            foreach (var p in pods)
            {
                bool hasBody = false;
                var items = sim.Items.Items;
                for (int i = 0; i < items.Count; i++)
                    if (items[i].Kind == ItemKind.Corpse && items[i].Pos == p.Pos) hasBody = true;
                if (!hasBody) souls++;
            }
            Assert.That(souls, Is.EqualTo(LivingSouls),
                "⭐ EIGHT LIVING SOULS is the owner's design target: the pawn who is already awake " +
                "plus the seven W5 will thaw one at a time. Counted here as capsules with NO body " +
                "on their tile. A wrecked capsule is set dressing with a body in it and must never " +
                "be counted against this number.");
        }

        /// <summary>
        /// ⚠️ THIS TEST'S SECOND LEG USED TO BE UNFALSIFIABLE AND ITS PREMISE WAS WRONG.
        ///
        /// The old second assertion was <c>Condition &lt; WreckThreshold</c> (0.25) inside a loop
        /// whose own guard had already established <c>Condition &lt; CryoPodFailBelow</c> (0.10).
        /// 0.10 &lt; 0.25 by construction, so the leg could not fail under any authoring of this
        /// ship — a dead guard sitting directly beneath a live one, which is why it read as fine.
        ///
        /// And what it was TRYING to say was not true anyway. Being below the wreck floor does not
        /// stop <c>MaintenanceSystem</c> touching a pod; it only stops it being bodged with EMPTY
        /// HANDS. The wreck's opening stock was 1 Parts + 2 Seals (18 units today: M1-I's locker took
        /// it to 11, D7's 7-crate <c>cabin stores</c> to 18), the four wrecked pods are the
        /// four lowest-Condition devices on the ship, and the system recruits neediest-first — so
        /// unattended it spent every last consumable on the coffins. The real guard is the DEF:
        /// <c>CryoPod</c>'s <c>maint</c> is 0, the opt-out, so a pod is never on the board at all.
        /// Mutating it back to 0.30 reddens this and <see cref="WreckedPods_StillReadAsDead_AfterASimDayUnattended"/>.
        /// </summary>
        [Test]
        public void WreckedPods_ReadAsDead_AndAreNotOnTheMaintenanceBoardAtAll()
        {
            var alive = new List<string>();
            foreach (var p in Pods(Boot()))
            {
                if (p.IsOpen || p.Condition >= CryoPodFailBelow) continue;
                if (p.IsOperational(SimDefs.Default))
                    alive.Add($"{p.Name} (Condition {p.Condition.ToString("R", CultureInfo.InvariantCulture)})");
            }
            Assert.That(alive, Is.Empty,
                "a wrecked capsule must be INOPERATIVE, which is what paints it Broken: " +
                string.Join(", ", alive));

            Assert.That(SimDefs.Default.Machines[(int)DeviceKind.CryoPod].MaintainBelow, Is.EqualTo(0f),
                "CryoPod's `maint` must be the ZERO OPT-OUT. MaintenanceSystem skips any device at " +
                "or above `maint` and Condition is never negative, so 0 takes pods off the board " +
                "entirely. Any positive value puts the four wrecked capsules at the TOP of the " +
                "board — they are the lowest-Condition devices on the ship — and the opening's " +
                "whole consumable stock goes into dead sleepers' coffins with no player input.");
        }

        /// <summary>
        /// ⚠️ A PROPERTY THE SIM ERASES IS NOT A PROPERTY. Everything above is a tick-0 census, and
        /// tick 0 is exactly where this ship used to be right: driven for one unattended sim-day
        /// with <c>maint = 0.30</c>, the first <c>Maintain</c> job started at TICK 201 and by the
        /// end of day 1 Parts had gone 1 → 0, Seals 2 → 0, <c>pod_iqbal</c> 0.03 → 1.00,
        /// <c>pod_vance</c> 0.04 → 0.90 and <c>pod_osei</c> 0.06 → 0.90. Three of the four wrecked
        /// capsules had stopped reading as wrecked and the player had not pressed anything.
        ///
        /// WHERE THE STOCK GOES NOW, measured on the same run so the fix is not just a deletion:
        /// the day-1 consumables are spent on SHIP PLANT — <c>wing_c</c> 0.06 → 0.99 (the Parts
        /// overhaul), <c>battery_2</c> 0.09 → 0.89 and <c>light_reactor</c> 0.09 → 0.90 (the two
        /// Seals) — and the two radiators take the free jury-rig to 0.59. That is the maintenance
        /// ladder doing exactly what it is for. The defect was never "the crew maintain things", it
        /// was "the crew maintain CORPSES' CAPSULES first, because a wrecked pod is the neediest
        /// thing on the ship".
        ///
        /// <para>⚠️ UPDATED BY M1-I (2026-07-29): THE SHIP NOW CARRIES ELEVEN UNITS, NOT THREE, and
        /// the fixture literal below moved with it. The three named above are still the FIRST three
        /// spent and in that order — the ladder is unchanged — but the run now completes eleven
        /// consumable services between h0.26 and h2.79, clearing every wrecked machine on the
        /// maintenance board in the survivable core. Both legs of this test are unaffected in
        /// substance: the pods are still never recruited (<c>maint = 0</c>) and leg 2's control is
        /// if anything stronger, because eight more units are demonstrably spent. See
        /// <see cref="WreckRepairEconomyTests"/> for why the number is eleven.</para>
        ///
        /// ⚠️ THE SECOND LEG IS THE NON-VACUITY CONTROL AND IT IS NOT OPTIONAL. The pod leg is a
        /// statement that nothing happened, and "nothing happened" passes just as well on a sim
        /// where <c>MaintenanceSystem</c> never ran at all — an unregistered system, a stack change,
        /// a livelock. Requiring that the consumables WERE spent proves the window under test was
        /// live. Measured together, the pair is the four-cell shape: pods untouched AND maintenance
        /// demonstrably running.
        ///
        /// This is the slowest test in the file (86 400 ticks through the real stack) and it earns
        /// it: it is the only assertion in the repo that the wreck's opening is still the wreck's
        /// opening after a day of nobody playing.
        /// </summary>
        [Test]
        public void WreckedPods_StillReadAsDead_AfterASimDayUnattended()
        {
            var sim = Boot();
            // ⚠️ M2-2 CHANGED WHAT "UNATTENDED" MEANS, and the change is worth stating rather than
            // absorbing. Under OD-H every work type boots OFF, so a genuinely untouched wreck now
            // runs a whole sim-day with the crew member idle — leg 2's control ("consumables were
            // spent") would fail for the RIGHT reason and leg 1 would prove nothing. This test's
            // subject is the CryoPod `maint = 0` opt-out, i.e. what the maintenance board does when
            // it IS running, so the fixture grants the work the player grants on the WORK tab and
            // "unattended" now means "no further player input after that one order".
            // ⭐ The silence itself is not lost: it is pinned by
            // WorkTypeVetoTests.OdG_Wreck_EveryWorkTypeOff_NoCrewMemberEverTakesWork, driven on
            // this same ship from tick 0.
            sim.GiveAllCrewAllWork();
            var conditionAtBoot = new Dictionary<uint, float>();
            var wreckedAtBoot = new List<uint>();
            foreach (var p in Pods(sim))
            {
                conditionAtBoot[p.Id] = p.Condition;
                if (!p.IsOpen && p.Condition < CryoPodFailBelow) wreckedAtBoot.Add(p.Id);
            }
            Assert.That(wreckedAtBoot.Count, Is.EqualTo(PodsWreckedDead), "fixture: four wrecked capsules at boot");
            int partsAtBoot = Ground(sim, ItemKind.Parts), sealsAtBoot = Ground(sim, ItemKind.Seals);
            // 1 Parts + 2 Seals in the reactor bay + the 8-Seal cryo-bay damage-control locker
            // M1-I added + D7's SEVEN one-unit `cabin stores` Parts crates on the cryo bay's bottom
            // row. Written out by hand, like every other literal in this file: it is the pin on the
            // ship's opening stock, and changing the ship means changing it here on purpose.
            Assert.That(partsAtBoot + sealsAtBoot, Is.EqualTo(18),
                "fixture: the opening carries 8 Parts + 10 Seals (M1-I's locker + D7's cabin stores)");

            for (int t = 0; t < 86400; t++) sim.Tick();   // one sim-day, no player input at all

            // LEG 1 — no capsule was serviced. Written as "Condition did not RISE" rather than as
            // "is still inoperative": a pod nursed from 0.03 to 0.09 is still inoperative and would
            // pass the weaker form, while being exactly the behaviour this test exists to forbid.
            var serviced = new List<string>();
            foreach (var p in Pods(sim))
                if (p.Condition > conditionAtBoot[p.Id] + 1e-4f)
                    serviced.Add($"{p.Name} {conditionAtBoot[p.Id].ToString("R", CultureInfo.InvariantCulture)} " +
                                 $"-> {p.Condition.ToString("R", CultureInfo.InvariantCulture)}");
            Assert.That(serviced, Is.Empty,
                "a capsule gained Condition overnight, which means MaintenanceSystem is recruiting " +
                "for pods again — set CryoPod's `maint` back to 0. On this ship that costs the " +
                "opening its whole consumable stock and stops three of the four dead sleepers " +
                "reading as dead: " + string.Join(", ", serviced));

            var stillWrecked = new List<string>();
            foreach (var p in Pods(sim))
                if (wreckedAtBoot.Contains(p.Id) && p.IsOperational(SimDefs.Default))
                    stillWrecked.Add($"{p.Name} -> {p.Condition.ToString("R", CultureInfo.InvariantCulture)}");
            Assert.That(stillWrecked, Is.Empty,
                "a wrecked capsule that came back to life overnight is a dead sleeper who stopped " +
                "reading as dead: " + string.Join(", ", stillWrecked));

            // LEG 2 — NON-VACUITY. Maintenance really did run in the window leg 1 measures.
            Assert.That(Ground(sim, ItemKind.Parts) + Ground(sim, ItemKind.Seals),
                Is.LessThan(partsAtBoot + sealsAtBoot),
                "CONTROL: no consumable was spent all day, so MaintenanceSystem was not running and " +
                "leg 1 above proved nothing. Measured, the day-1 stock goes into wing_c, battery_2 " +
                "and light_reactor first and then the other eight machines on the wrecked backlog " +
                "— ship plant, which is the ladder working.");
        }

        /// <summary>Total ground units of a kind — carried stacks included, since a stack in a
        /// crew member's hands has left the floor but not the ship.</summary>
        private static int Ground(Simulation sim, ItemKind kind)
        {
            int n = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++) if (items[i].Kind == kind) n += items[i].Count;
            return n;
        }

        // ------------------------------------------------------------ 1b. the thaw ladder's rungs
        //
        // ⭐ M3-6. OD-L needs a per-pod repair requirement; OD-M item 1 (answered 2026-07-31,
        // option A, BINDING) fixed the table and the carrier: the rung is DERIVED from the pod's
        // already-authored `Condition` through a literal band table in `ThawGate` — no new
        // `Device` field, no new def field, no pin move. `sim/Sim.Core/ThawGate.cs` holds the
        // table and the reasoning; these two tests hold the numbers.
        //
        // ✅ THE BAND-EDGE BEHAVIOURAL SWEEP WAS DEFERRED BY NAME TO M3-3, MUTATION 6, AND M3-3
        // RAN IT: `ThawGateTests.TheRungTheGateResolves_ChangesAtEverySixInteriorBandEdge` crosses
        // all SIX interior edges (0.92 · 0.90 · 0.87 · 0.85 · 0.82 · 0.80) through the six-term
        // contract and asserts the SENTENCE the ship says changes at each one. It could not run
        // here — that contract did not exist at position 6 — and a leg that cannot run in its own
        // lane is not a mutation, it is a wish. What M3-6 asserts is the ARITHMETIC half (the
        // edges partition the seven authored Conditions into the intended rungs) plus the
        // exact-edge convention, and both are still load-bearing: they pin the TABLE, while M3-3
        // pins the LADDER. (The M3-1 precedent, discharged the same way: `PodIdentityTests`
        // deferred its thaw leg to M3-3 in its own header and M3-3 drove it.)
        //
        // ✅ AND THE SIM CALLS `ThawGate` NOW — `ThawCommand` + the MOSS `thaw` op, M3-3.
        // `docs/MECHANICS.md` §13.28 recorded it wired-but-not-connected; §13.30 records the
        // connection.

        /// <summary>
        /// The rung each intact occupied capsule sits on, WRITTEN OUT BY HAND — pod name, rung
        /// number, item and count — and never read from <see cref="AuthoredShips"/>'s pod table
        /// nor from <see cref="ThawGate"/>'s band table.
        ///
        /// ⚠️ THAT IS THE WHOLE POINT AND IT IS THE CHARTER'S REFUSED MUTATION (M3-6 mutation 4):
        /// a test that derives its expectation from the table under test can never fail. If this
        /// array were built by walking <c>WreckPods</c> and calling <c>RungOf</c>, re-keying the
        /// ladder or re-authoring a Condition would leave it green.
        /// </summary>
        private static readonly (string Pod, int Rung, ItemKind Item, int Count)[] LadderRungs =
        {
            ("pod_lindqvist", 1, ItemKind.Seals,            1),   // 0.99  floor 0.92  chain depth 0
            ("pod_ozawa",     2, ItemKind.Seals,            2),   // 0.91  floor 0.84  chain depth 0
            ("pod_ferreira",  3, ItemKind.Parts,            1),   // 0.83  floor 0.76  chain depth 2
            ("pod_mbeki",     4, ItemKind.Parts,            2),   // 0.75  floor 0.68  chain depth 2
            ("pod_bahri",     5, ItemKind.ControllerModule, 1),   // 0.67  floor 0.60  chain depth 3
            ("pod_nakamura",  6, ItemKind.ControllerModule, 2),   // 0.59  floor 0.52  chain depth 3
            ("pod_torres",    7, ItemKind.ControllerModule, 3),   // 0.51  catch-all   chain depth 3
        };

        /// <summary>
        /// ⭐ THE LADDER, ASSERTED ON THE SHIPPED SHIP: every intact occupied capsule resolves to
        /// the rung OD-M item 1 gave it, and the seven of them use all seven rungs exactly once.
        ///
        /// <para>Three separate things can break and all three are reported by name: a pod's
        /// authored <c>Condition</c> moving across a band edge, a band edge moving under a fixed
        /// Condition, and the SET of intact occupied pods changing (a pod added, renamed, opened
        /// or wrecked) — the last checked as a two-way set comparison, so a swap cannot hide.</para>
        ///
        /// <para>⚠️ The last rung costs three ControllerModules, three times the commissioning
        /// gate, and the gate is the PROLOGUE ("restore MOSS") and deliberately not in this table.
        /// Chain depth runs 0,0,2,2,3,3,3 — non-decreasing, with count escalating inside a depth,
        /// which is OD-L's "chain DEPTH is the difficulty curve" read literally. Depth 1
        /// (<c>Scrap</c>) is deliberately skipped: it is a crafting intermediate, not a repair
        /// consumable.</para>
        /// </summary>
        [Test]
        public void ThawLadder_TheSevenIntactCapsules_SitOnTheSevenAuthoredRungs()
        {
            var sim = Boot();
            var intact = new Dictionary<string, float>();
            foreach (var p in Pods(sim))
            {
                if (p.IsOpen || p.Condition < CryoPodFailBelow) continue;
                intact[p.Name] = p.Condition;
            }

            var offenders = new List<string>();

            // The SET first, both directions, so a renamed/added/removed capsule is a named
            // failure rather than a silently unchecked row.
            foreach (var row in LadderRungs)
                if (!intact.ContainsKey(row.Pod))
                    offenders.Add($"{row.Pod} is not an intact occupied capsule on this ship any more " +
                                  $"(rung {row.Rung.ToString(CultureInfo.InvariantCulture)} has no pod)");
            foreach (var pod in intact.Keys)
            {
                bool named = false;
                foreach (var row in LadderRungs) if (row.Pod == pod) named = true;
                if (!named)
                    offenders.Add($"{pod} is an intact occupied capsule with NO rung — the ladder " +
                                  "and the bay have drifted apart");
            }

            // Then the arithmetic, per pod, through the shipped helper.
            foreach (var row in LadderRungs)
            {
                if (!intact.TryGetValue(row.Pod, out float condition)) continue;
                var got = ThawGate.RungOf(condition);
                string c = condition.ToString("R", CultureInfo.InvariantCulture);
                if (got.Rung != row.Rung)
                    offenders.Add($"{row.Pod} (Condition {c}) resolves rung " +
                                  got.Rung.ToString(CultureInfo.InvariantCulture) + ", expected rung " +
                                  row.Rung.ToString(CultureInfo.InvariantCulture));
                if (got.Item != row.Item)
                    offenders.Add($"{row.Pod} (rung {row.Rung.ToString(CultureInfo.InvariantCulture)}) " +
                                  $"asks for {got.Item}, expected {row.Item}");
                if (got.Count != row.Count)
                    offenders.Add($"{row.Pod} (rung {row.Rung.ToString(CultureInfo.InvariantCulture)}) " +
                                  "asks for " + got.Count.ToString(CultureInfo.InvariantCulture) +
                                  " × " + got.Item + ", expected " +
                                  row.Count.ToString(CultureInfo.InvariantCulture));
            }

            // Asserted ONCE over the whole ladder (the fifth trap shape: `Assert` throws, so a
            // per-row assertion would report only the first broken rung).
            Assert.That(offenders, Is.Empty,
                "⭐ THE THAW LADDER NO LONGER MATCHES OD-M ITEM 1 (answered 2026-07-31, option A, " +
                "BINDING — the rung table in sim/Sim.Core/ThawGate.cs):\n  " +
                string.Join("\n  ", offenders) + "\n" +
                "⇒ Either a pod's authored Condition moved across a band edge (sim/Sim.Gen/" +
                "AuthoredShips.cs, WreckPods), or a band edge moved under it (ThawGate.RungOf), " +
                "or the bay's roster changed. All three are OWNER-VISIBLE pacing changes: the " +
                "ladder's chain depth runs 0,0,2,2,3,3,3 and its last rung is three times the " +
                "commissioning prologue. Fix the content, or take the change to the owner — do " +
                "NOT re-derive this table from WreckPods to make it pass.");

            Assert.That(LadderRungs.Length, Is.EqualTo(PodsIntactOccupied),
                "the ladder must have exactly one rung per intact occupied capsule");
            Assert.That(LadderRungs.Length, Is.EqualTo(ThawGate.RungCount),
                "ThawGate.RungCount and the hand-written ladder disagree about how many rungs " +
                "the thaw curve has");
        }

        /// <summary>
        /// ⭐ THE BAND EDGES ARE INCLUSIVE ON THEIR LOWER SIDE, AND THAT WAS A DECISION.
        ///
        /// <para>A capsule at exactly 0.92 is rung 1; at exactly 0.84 it is rung 2; at exactly
        /// 0.52 it is rung 6. One spelling (<c>&gt;=</c>) reads the whole table, matching the
        /// owner's own notation for the top band ("≥ …"). ⭐ The six numbers were re-scaled by D2
        /// (2026-08-02); the CONVENTION they are read with was not.</para>
        ///
        /// <para>⚠️ RimWorld's analogue chooses the OPPOSITE convention and that is exactly why
        /// this leg exists: <c>CapableOf</c> is <c>GetLevel(c) &gt; c.minForCapable</c>, a strict
        /// <c>&gt;</c>, so "a capacity sitting exactly at <c>minForCapable</c> is NOT capable"
        /// (<c>docs/design/rimworld-reference.md</c> §6.1). The lesson that reference draws is the
        /// one being obeyed here: <b>an edge nobody chose is an edge somebody will hit.</b> No
        /// authored Condition sits on an edge today — the bands were picked to fall between them —
        /// so nothing but this test would notice the convention flipping.</para>
        ///
        /// <para>Both sides of every edge are checked. A one-sided pin is satisfied by a table that
        /// has collapsed two bands into one.</para>
        /// </summary>
        [Test]
        public void ThawLadder_BandLowerEdgesAreInclusive_AndTheEdgeBelowIsTheNextRung()
        {
            // edge value, the rung the edge ITSELF resolves to, and the rung just below it.
            // ⭐ RE-KEYED BY D2 (2026-08-02): the bands are 0.08 wide where they were 0.02–0.03, so
            // a capsule authored 0.07 above its own floor takes ~70 sim-hours to drop a rung
            // instead of 10–20. (0.08 and not 0.11 is the owner's second ruling of the same day —
            // wider bands need more range and pushed the deepest capsule too close to `fail`; see
            // ThawGate's class remarks.) The CONVENTION under test is untouched — the lower edge is
            // still uniformly INCLUSIVE — and so is OD-M item 1's curve; only the six numbers moved.
            var edges = new (float Edge, int OnTheEdge, int JustBelow)[]
            {
                (0.92f, 1, 2),
                (0.84f, 2, 3),
                (0.76f, 3, 4),
                (0.68f, 4, 5),
                (0.60f, 5, 6),
                (0.52f, 6, 7),
            };

            var offenders = new List<string>();
            foreach (var e in edges)
            {
                string edge = e.Edge.ToString("R", CultureInfo.InvariantCulture);
                int on = ThawGate.RungOf(e.Edge).Rung;
                if (on != e.OnTheEdge)
                    offenders.Add($"a capsule at EXACTLY {edge} resolves rung " +
                                  on.ToString(CultureInfo.InvariantCulture) + ", expected rung " +
                                  e.OnTheEdge.ToString(CultureInfo.InvariantCulture) +
                                  " — the lower edge of every band is INCLUSIVE (>=), not exclusive (>)");
                float below = e.Edge - 0.005f;
                int under = ThawGate.RungOf(below).Rung;
                if (under != e.JustBelow)
                    offenders.Add($"a capsule just BELOW {edge} resolves rung " +
                                  under.ToString(CultureInfo.InvariantCulture) + ", expected rung " +
                                  e.JustBelow.ToString(CultureInfo.InvariantCulture) +
                                  " — two bands have collapsed into one");
            }

            // The two open ends: nothing above rung 1, nothing below rung 7.
            if (ThawGate.RungOf(1.00f).Rung != 1)
                offenders.Add("a pristine capsule (1.00) must be rung 1");
            if (ThawGate.RungOf(0.0f).Rung != 7)
                offenders.Add("rung 7 must be the catch-all: RungOf is total, every float resolves");

            Assert.That(offenders, Is.Empty,
                "THE BAND-EDGE CONVENTION MOVED (sim/Sim.Core/ThawGate.cs):\n  " +
                string.Join("\n  ", offenders) + "\n" +
                "⇒ The lower edge of every band is INCLUSIVE, uniformly, and that is written down " +
                "in ThawGate's own remarks. It is the opposite of RimWorld's `CapableOf` strict " +
                "`>` (rimworld-reference.md §6.1) ON PURPOSE — the point of §6.1's lesson is that " +
                "the edge must be CHOSEN, not inherited. Changing it changes which repair a " +
                "capsule authored on an edge demands.");
        }

        // ------------------------------------------------- 1c. the prose header and the literals

        /// <summary>
        /// ⭐ THE SHIP'S OWN PROSE MUST STATE THE CENSUS THE LITERALS ABOVE PIN. The header block
        /// in <c>AuthoredShips.cs</c> explains the bay in words — twelve capsules, eight living,
        /// four dead, seven still to thaw, one already open — and a file whose prose says one
        /// thing while its table says another is the exact failure this package was chartered to
        /// correct: the roadmap outline quoted "pods 8 · intact 5 · wrecked 2" for weeks because a
        /// correction landed in one file and never reached the document that consumed it.
        ///
        /// <para>⚠️ <b>THIS SCAN DELIBERATELY INVERTS THE HOUSE <c>codeOnly</c> CONVENTION, AND
        /// THAT IS THE INTERESTING PART.</b> Every other source scan in this repo runs
        /// <see cref="SurfaceBoundaryTests.CodeOnly"/> first, because a claim sitting in a comment
        /// must not satisfy a guard about code (TRAPS 1). Here the SUBJECT IS THE COMMENT: the
        /// census prose is the artefact under test, so the block is extracted as comment text on
        /// purpose — and the shared stripper is used as the PROOF of that, below, by asserting it
        /// deletes the whole block.</para>
        ///
        /// <para>⚠️ <b>IT IS A POSITIVE SCAN, NEVER A "must not contain 8" ONE.</b> The header
        /// deliberately records the dead draft it replaced ("AN EARLIER DRAFT … AUTHORED EIGHT
        /// CAPSULES OF WHICH TWO WERE WRECKED"), so a negative scan for the stale numbers would
        /// fire on the very paragraph that exists to stop the mistake recurring — a guard that
        /// taxes the explanation of the bug it guards.</para>
        ///
        /// <para>Non-vacuity is by INCLUSION (§13.4): a planted stale header must be CAUGHT.</para>
        /// </summary>
        [Test]
        public void AuthoredShipsProseHeader_StatesTheSameCensusAsTheseLiterals()
        {
            string block = RawCapsuleHeaderBlock();

            Assert.That(block.Length, Is.GreaterThan(400),
                "the capsule header block extracted to " + block.Length + " characters, which is " +
                "too short to be the census paragraph — the anchor has drifted and every " +
                "assertion below would pass vacuously");

            var missing = MissingCensusPhrases(block);
            Assert.That(missing, Is.Empty,
                "THE SHIP'S PROSE HEADER NO LONGER STATES THE CENSUS ITS TABLE AUTHORS.\n" +
                "  missing from sim/Sim.Gen/AuthoredShips.cs's capsule header block:\n    " +
                string.Join("\n    ", missing) + "\n" +
                "⇒ The literals in this file say " + PodCount + " capsules / " + PodsOpen +
                " open / " + PodsIntactOccupied + " intact occupied / " + PodsWreckedDead +
                " wrecked, i.e. " + LivingSouls + " living souls. The header must say the same " +
                "thing in words. ⛔ DO NOT satisfy this by editing the header's record of the " +
                "EARLIER DRAFT (eight capsules, two wrecked) — that paragraph is the anti-" +
                "recurrence note and it stays.");

            // --- NON-VACUITY, BY INCLUSION: the dead draft's own prose must be CAUGHT.
            // Written out by hand rather than mutated out of the real block, so that a scanner
            // that matched nothing at all would still be shown to be able to match something.
            const string staleDraft =
                "        // ⭐ EIGHT CAPSULES: SIX LIVING (the design target) AND TWO DEAD (the tuning parameter)\n" +
                "        // One capsule boots OPEN (the single pawn the player starts with) and the other\n" +
                "        // five are thawable one at a time through MOSS (W5).\n" +
                "        // ⚠️ THE TWO WRECKED CAPSULES ARE *IN ADDITION* TO THE SIX.\n";
            var caught = MissingCensusPhrases(staleDraft);
            Assert.That(caught, Is.Not.Empty,
                "NON-VACUITY: the scanner cannot see a header planted with the stale 8/1/5/2 " +
                "census, so its empty result above means nothing");
            Assert.That(string.Join(" | ", caught), Does.Contain("twelve capsules"),
                "NON-VACUITY: the scanner noticed SOMETHING about the stale draft but not that it " +
                "claims eight capsules where the ship authors twelve — which is the specific " +
                "revert this guard exists to catch");

            // --- AND THE PROOF THAT THE BLOCK REALLY IS COMMENT TEXT, i.e. that inverting the
            // house convention was necessary rather than sloppy: the shared code-only stripper
            // deletes this block entirely. If it ever does not, the census prose has leaked into
            // real code and this guard is scanning the wrong kind of thing.
            string asCode = SurfaceBoundaryTests.CodeOnly(RawCapsuleHeaderBlock());
            Assert.That(asCode.Trim(), Is.Empty,
                "the capsule header block survived SurfaceBoundaryTests.CodeOnly, so it is not " +
                "pure comment text any more: '" + asCode.Trim() + "'. This test scans COMMENTS on " +
                "purpose (the prose is the artefact); if the census now lives in code as well, " +
                "scan that instead — do not silently keep scanning half of it.");
        }

        /// <summary>
        /// ⭐⭐ <b>THE SECOND PROSE CENSUS — <c>WreckPods</c>' OWN <c>&lt;summary&gt;</c>, WHICH THE
        /// TEST ABOVE COULD NOT SEE.</b> M3-6 shipped the header scan anchored on the banner block
        /// titled CAPSULES; independent review then proved that a stale edit to the doc comment on
        /// the <c>WreckPods</c> table ITSELF survives it untouched. Two prose censuses, one guard.
        /// M3-6's integrator handed the widening to this package by name.
        ///
        /// <para>⚠️ <b>A SIBLING LEG, NOT A REBUILT SCANNER.</b> It reuses
        /// <see cref="MissingCensusPhrases"/> unchanged, so the two blocks owe the SAME sentences
        /// built from the SAME hand-written literals — which is the property that matters: a
        /// reader who corrects one census and not the other now fails the build.</para>
        ///
        /// <para>⚠️ <b>THE ANCHOR IS THE DECLARATION, NOT A NUMBER</b> (same reason as
        /// <see cref="RawCapsuleHeaderBlock"/>): a summary reverted to "eight capsules" must still
        /// be FOUND so the phrase checks can fail on it. Anchoring on a value under test would lose
        /// the block and go vacuous instead of red — and it must match EXACTLY ONCE (trap 4, the
        /// fourth shape: non-vacuity is an INCLUSION test).</para>
        /// </summary>
        [Test]
        public void WreckPodsOwnSummary_StatesTheSameCensusAsTheseLiterals()
        {
            string block = RawWreckPodsSummaryBlock();

            Assert.That(block.Length, Is.GreaterThan(400),
                "the WreckPods summary extracted to " + block.Length + " characters, which is too " +
                "short to be the census doc comment — the anchor has drifted and every assertion " +
                "below would pass vacuously");

            var missing = MissingCensusPhrases(block);
            Assert.That(missing, Is.Empty,
                "THE `WreckPods` TABLE'S OWN <summary> NO LONGER STATES THE CENSUS IT AUTHORS.\n" +
                "  missing from sim/Sim.Gen/AuthoredShips.cs's WreckPods doc comment:\n    " +
                string.Join("\n    ", missing) + "\n" +
                "⇒ The literals in this file say " + PodCount + " capsules / " + PodsOpen +
                " open / " + PodsIntactOccupied + " intact occupied / " + PodsWreckedDead +
                " wrecked, i.e. " + LivingSouls + " living souls. THIS IS THE SHIP'S SECOND CENSUS " +
                "PROSE and it must say the same thing as the banner header above it.");

            // --- NON-VACUITY, BY INCLUSION: the planted stale summary must be CAUGHT. Written out
            // by hand, in the `///` form this block really has, so the widened stripper is exercised
            // on the shape it was widened for. THIS IS THE MUTATION M3-6's REVIEWER PROVED SURVIVES
            // TODAY — it is here so it cannot survive again.
            const string staleSummary =
                "        /// <summary>The bay's eight capsules, in two rows of four across the cryo bay's interior.\n" +
                "        ///\n" +
                "        /// SIX LIVING — one already open (the pawn the player starts with) and five intact and\n" +
                "        /// occupied, thawable one at a time through MOSS (W5). Six is the owner's design target\n" +
                "        /// and is NOT tunable here.\n" +
                "        ///\n" +
                "        /// TWO WRECKED — dead sleepers, in addition to the six. Two is this lane's number and\n" +
                "        /// IS tunable; see the header.</summary>\n";
            var caught = MissingCensusPhrases(staleSummary);
            Assert.That(caught, Is.Not.Empty,
                "NON-VACUITY: the scanner cannot see a WreckPods summary planted with the stale " +
                "8/1/5/2 census, so its empty result above means nothing");
            Assert.That(string.Join(" | ", caught), Does.Contain("twelve capsules"),
                "NON-VACUITY: the scanner noticed SOMETHING about the stale summary but not that it " +
                "claims eight capsules where the ship authors twelve");

            // --- AND THE PROOF THAT THIS BLOCK REALLY IS COMMENT TEXT: the shared code-only
            // stripper deletes it entirely. Same inversion, same justification as the header scan.
            string asCode = SurfaceBoundaryTests.CodeOnly(RawWreckPodsSummaryBlock());
            Assert.That(asCode.Trim(), Is.Empty,
                "the WreckPods summary block survived SurfaceBoundaryTests.CodeOnly, so it is not " +
                "pure comment text any more: '" + asCode.Trim() + "'");
        }

        /// <summary>
        /// The contiguous run of <c>///</c> lines immediately above the <c>WreckPods</c> table
        /// declaration. The declaration is the anchor and it must appear EXACTLY ONCE.
        /// </summary>
        private static string RawWreckPodsSummaryBlock()
        {
            string[] lines = File.ReadAllLines(Path.Combine(
                WreckRepoRoot(), "sim", "Sim.Gen", "AuthoredShips.cs"));

            var anchors = new List<int>();
            for (int i = 0; i < lines.Length; i++)
                if (lines[i].Trim().StartsWith("private static readonly PodSpec[] WreckPods",
                                               StringComparison.Ordinal))
                    anchors.Add(i);
            Assert.That(anchors.Count, Is.EqualTo(1),
                "expected EXACTLY ONE `private static readonly PodSpec[] WreckPods` declaration in " +
                "AuthoredShips.cs, found " + anchors.Count + ". The anchor is the declaration the " +
                "prose describes, so ambiguity here is a failure and not a fallback.");

            int first = anchors[0];
            while (first > 0 && lines[first - 1].Trim().StartsWith("///", StringComparison.Ordinal)) first--;
            Assert.That(first, Is.LessThan(anchors[0]),
                "the WreckPods table carries NO doc comment at all — the ship's second census prose " +
                "has been deleted rather than corrected");

            var sb = new StringBuilder();
            for (int i = first; i < anchors[0]; i++) sb.Append(lines[i]).Append('\n');
            return sb.ToString();
        }

        /// <summary>The census phrases the header must contain, each BUILT FROM the hand-written
        /// literal it restates, so changing a literal changes the sentence the prose owes. Matched
        /// case-insensitively against the block with its comment markers stripped and its
        /// whitespace collapsed, so a phrase broken across two wrapped lines still counts.</summary>
        private static List<string> MissingCensusPhrases(string blockText)
        {
            string prose = ProseOf(blockText);
            var required = new List<string>
            {
                NumberWord(PodCount) + " capsules",
                NumberWord(LivingSouls) + " living",
                NumberWord(PodsWreckedDead) + " dead",
                NumberWord(PodsWreckedDead) + " wrecked capsules",
                NumberWord(PodsIntactOccupied) + " are thawable",
                NumberWord(PodsOpen) + " capsule boots open",
            };
            var missing = new List<string>();
            foreach (var phrase in required)
                if (prose.IndexOf(phrase, StringComparison.OrdinalIgnoreCase) < 0)
                    missing.Add("\"" + phrase + "\"");
            return missing;
        }

        /// <summary>Comment markers off, whitespace collapsed. InvariantCulture-safe by
        /// construction: no parsing, no formatting, an ordinal comparison at the call site.
        /// <para>⚠️ M3-11 widened the strip from <c>"//"</c> to "every leading slash", because the
        /// SECOND census block this file now scans is a <c>///</c> doc comment. Leaving a stray
        /// <c>/</c> at the head of each line is not cosmetic: a required phrase that wraps across
        /// two lines would read <c>"EIGHT / LIVING"</c> and silently stop matching, which is a
        /// false RED in the same family as the traps this file is full of.</para></summary>
        private static string ProseOf(string blockText)
        {
            var sb = new StringBuilder(blockText.Length);
            foreach (var raw in blockText.Split('\n'))
            {
                string line = raw.Trim().TrimStart('/');
                sb.Append(' ').Append(line.Trim());
            }
            var collapsed = new StringBuilder(sb.Length);
            bool space = false;
            foreach (char c in sb.ToString())
            {
                bool ws = c == ' ' || c == '\t' || c == '\r';
                if (ws) { space = true; continue; }
                if (space && collapsed.Length > 0) collapsed.Append(' ');
                space = false;
                collapsed.Append(c);
            }
            return collapsed.ToString();
        }

        private static string NumberWord(int n)
        {
            switch (n)
            {
                case 1: return "one";
                case 2: return "two";
                case 4: return "four";
                case 5: return "five";
                case 6: return "six";
                case 7: return "seven";
                case 8: return "eight";
                case 12: return "twelve";
                default:
                    Assert.Fail("the census literal " + n.ToString(CultureInfo.InvariantCulture) +
                                " has no English word in this table — add it, and check the ship's " +
                                "prose header says the new number in words");
                    return null;
            }
        }

        /// <summary>
        /// The banner-delimited comment block in <c>AuthoredShips.cs</c> that states the capsule
        /// census: the title line whose PREVIOUS line is a <c>// ----</c> rule and which names
        /// CAPSULES, through to the next rule line after it.
        ///
        /// <para>⚠️ The anchor is the word CAPSULES and NOT a number, deliberately: a header
        /// reverted to "EIGHT CAPSULES: SIX LIVING" must still be FOUND, so that the phrase checks
        /// can fail on it. An anchor built from the value under test would simply lose the block
        /// and the guard would go vacuous instead of red.</para>
        ///
        /// <para>Every line of the block is required to be a comment line, which is what makes
        /// "this is comment text" a fact rather than an assumption.</para>
        /// </summary>
        private static string RawCapsuleHeaderBlock()
        {
            string[] lines = File.ReadAllLines(Path.Combine(
                WreckRepoRoot(), "sim", "Sim.Gen", "AuthoredShips.cs"));

            var anchors = new List<int>();
            for (int i = 1; i < lines.Length; i++)
            {
                if (!IsRuleLine(lines[i - 1])) continue;
                string t = lines[i].Trim();
                if (t.StartsWith("//", StringComparison.Ordinal) &&
                    t.IndexOf("CAPSULES", StringComparison.Ordinal) >= 0)
                    anchors.Add(i);
            }
            Assert.That(anchors.Count, Is.EqualTo(1),
                "expected EXACTLY ONE banner-titled comment block about CAPSULES in " +
                "AuthoredShips.cs, found " + anchors.Count + ". Ambiguity here would let the " +
                "guard scan the wrong paragraph, so it is a failure and not a fallback.");

            int start = anchors[0];
            int j = start + 1;
            if (j < lines.Length && IsRuleLine(lines[j])) j++;   // the title's closing rule
            var sb = new StringBuilder();
            var nonComment = new List<string>();
            for (; j < lines.Length && !IsRuleLine(lines[j]); j++)
            {
                if (lines[j].Trim().Length > 0 &&
                    !lines[j].Trim().StartsWith("//", StringComparison.Ordinal))
                    nonComment.Add(lines[j].Trim());
                sb.Append(lines[j]).Append('\n');
            }
            Assert.That(nonComment, Is.Empty,
                "the capsule header block contains lines that are not comments (" +
                string.Join(" ⏎ ", nonComment) + "), so the block boundary is wrong");

            return lines[start] + "\n" + sb.ToString();
        }

        private static bool IsRuleLine(string line)
        {
            string t = line.Trim();
            return t.StartsWith("// ---", StringComparison.Ordinal);
        }

        /// <summary>The house repo-root probe (two landmarks, so a stray ci.sh cannot
        /// false-positive) — the same shape as ArchitectureBoundaryTests / SurfaceBoundaryTests.</summary>
        private static string WreckRepoRoot()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                if (File.Exists(Path.Combine(dir.FullName, "ci.sh")) &&
                    Directory.Exists(Path.Combine(dir.FullName, "sim", "Sim.Core")))
                    return dir.FullName;
                dir = dir.Parent;
            }
            Assert.Fail("the repo root must be discoverable by walking up from " + AppContext.BaseDirectory);
            return null;
        }

        /// <summary>
        /// ⚠️ STRIP MUST REFUSE AN OCCUPIED CAPSULE. Seven of the eight souls a won game ends with
        /// are asleep in closed pods, and before this rule one drag of the STRIP palette across the
        /// cryo bay condemned every one of them — driven, with a passing Door control:
        /// <c>CanDesignate(pod_ozawa, Condition, closed)</c> returned True and <c>Designate</c> accepted
        /// it, paying 1 Part. The header of this ship says "nothing here may reduce that number";
        /// nothing enforced it.
        ///
        /// The OPEN control is the whole shape of the rule: an empty capsule is furniture and stays
        /// strippable, so this is a rule about OCCUPANCY and not a blanket exclusion of the kind.
        /// </summary>
        [Test]
        public void StripRefusesAnOccupiedCapsule_ButNotAnEmptyOne()
        {
            var sim = Boot();
            DeconstructSystem dec = null;
            for (int i = 0; i < sim.Systems.Length; i++) if (sim.Systems[i] is DeconstructSystem d) dec = d;
            Assert.That(dec, Is.Not.Null, "fixture: the default stack must carry a DeconstructSystem");

            var condemnable = new List<string>();
            Device openPod = null;
            foreach (var p in Pods(sim))
            {
                if (p.IsOpen) { openPod = p; continue; }
                if (dec.CanDesignate(sim, p.Pos, DeconstructKind.Device))
                    condemnable.Add($"{p.Name} (Condition {p.Condition.ToString("R", CultureInfo.InvariantCulture)})");
            }
            Assert.That(condemnable, Is.Empty,
                "these closed capsules can be STRIPPED, which permanently deletes the sleeper " +
                "inside for 1 Part, with no undo on any client surface: " +
                string.Join(", ", condemnable));

            // CONTROL — the rule is about occupancy, not about the kind. Without this leg, "STRIP
            // refuses CryoPod" would pass just as well and would have quietly removed a verb.
            Assert.That(openPod, Is.Not.Null, "fixture: one capsule boots open");
            Assert.That(dec.CanDesignate(sim, openPod.Pos, DeconstructKind.Device), Is.True,
                $"{openPod.Name} is OPEN and therefore empty furniture — it must still be strippable");
        }

        /// <summary>The four dead sleepers, BY NAME. Hand-written like every other literal here.
        /// ⚠️ The label used to be checked with <c>!string.IsNullOrEmpty</c>, i.e. the test named
        /// the sleepers in its own title and then verified only that SOMEBODY was in the bag —
        /// swapping every name on the ship left it green. The walk through the bay is meant to be
        /// "a reading of who did not make it" (this ship's header), so who is the assertion.</summary>
        private static readonly (string Pod, string Sleeper)[] DeadSleepers =
        {
            ("pod_vance", "Vance"), ("pod_sokolov", "Sokolov"),
            ("pod_iqbal", "Iqbal"), ("pod_osei", "Osei"),
        };

        [Test]
        public void EachWreckedPod_CarriesACorpseOnItsOwnTile_NamedForTheSleeper()
        {
            var sim = Boot();
            var wrong = new List<string>();
            var seen = new List<string>();
            foreach (var p in Pods(sim))
            {
                if (p.IsOpen || p.Condition >= CryoPodFailBelow) continue;
                seen.Add(p.Name);

                string expected = null;
                for (int i = 0; i < DeadSleepers.Length; i++)
                    if (DeadSleepers[i].Pod == p.Name) expected = DeadSleepers[i].Sleeper;
                if (expected == null) { wrong.Add($"{p.Name}: a capsule wrecked that this test does not name"); continue; }

                string label = null;
                var items = sim.Items.Items;
                for (int i = 0; i < items.Count; i++)
                    if (items[i].Kind == ItemKind.Corpse && items[i].Pos == p.Pos) label = items[i].Label;
                if (label == null) wrong.Add($"{p.Name}: no body on the capsule's own tile");
                else if (label != expected) wrong.Add($"{p.Name}: the body is labelled '{label}', not '{expected}'");
            }
            Assert.That(wrong, Is.Empty,
                "a wrecked occupied pod holds a DEAD sleeper (owner decision) and the corpse item is " +
                "the only way the sim has to say so — and it must say WHOSE:\n  " +
                string.Join("\n  ", wrong));

            var expectedPods = new List<string>();
            for (int i = 0; i < DeadSleepers.Length; i++) expectedPods.Add(DeadSleepers[i].Pod);
            CollectionAssert.AreEquivalent(expectedPods, seen,
                "the set of WRECKED capsules moved — the four named above are the ship's content, " +
                "hand-written here on purpose so a content change cannot pass silently");

            int corpses = 0;
            var all = sim.Items.Items;
            for (int i = 0; i < all.Count; i++) if (all[i].Kind == ItemKind.Corpse) corpses++;
            Assert.That(corpses, Is.EqualTo(PodsWreckedDead), "one body per wrecked pod and no others");
        }

        /// <summary>The death reaches the player as a ship's-log line and NOT as a synthesised
        /// <c>CitizenDiedEvent</c> — see <see cref="ShipPlan.LogLines"/> for why that distinction is
        /// load-bearing. Driven through the real <see cref="HistorySystem"/>.</summary>
        [Test]
        public void EachDeadSleeper_GetsOneShipsLogLine_AndNoDeathEvent()
        {
            var systems = Stack();
            HistorySystem history = null;
            for (int i = 0; i < systems.Length; i++) if (systems[i] is HistorySystem h) history = h;
            Assert.That(history, Is.Not.Null, "fixture: the default stack must carry a HistorySystem");

            ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), systems);

            int lines = 0, deaths = 0;
            foreach (var e in history.Entries)
            {
                lines++;
                if (e.Kind == (byte)HistoryKind.Death || e.Kind == (byte)HistoryKind.Eulogy) deaths++;
            }
            Assert.That(lines, Is.EqualTo(PodsWreckedDead),
                "exactly one boot log line per dead sleeper, and nothing else");
            Assert.That(deaths, Is.Zero,
                "a sleeper who was never a Citizen cannot die: a Death/Eulogy entry here means " +
                "someone synthesised a CitizenDiedEvent, which is a lie in the hashed event stream");
        }

        [Test]
        public void OpenPod_And_ClosedPod_ProjectDifferentGlyphs()
        {
            // The pod is the SECOND kind whose glyph comes from state (doors are the first). Driven
            // through the real projection rather than asserted about Glyphs.ForDevice, because
            // ForDevice knows only the rest glyph and GlyphMapper.DeviceGlyph is what a tile sees.
            // GenSimHost, not Boot(): `GlyphMapper.Project` gates on TileFlags.Explored (the fog
            // gate is the projection's first rule), and `FogReveal.RevealReachable` is a HOST boot
            // step that `ShipPlanBuilder.Build` alone never runs.
            // ⚠️ THAT JUSTIFICATION IS NOW STALE FOR *THIS* SHIP, and it is corrected rather than
            // deleted because the rule it states is still the rule. Since M1-1 (OD-C) the wreck's
            // plan sets `ShipPlan.InteriorKnownAtBoot`, which `ShipPlanBuilder.Build` itself applies,
            // so a bare-builder wreck sim would now project fine — the reason to keep GenSimHost here
            // is that it is the boot the HOSTS use, not that the alternative is broken. On any ship
            // that does not opt in, the original justification is exactly as true as it ever was.
            var sim = GenSimHost.Build(AuthoredShips.PeriluneWreck()).Sim;
            var buffer = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, 0, Lens.None, null, buffer);

            // ⚠️ ASSERTED PER CAPSULE, NOT AS `Does.Contain` OVER THE SET. The first draft collected
            // every pod's glyph and asked whether 'k' and 'K' both appeared, which is satisfied by
            // an INVERSION: swap the two arms of GlyphMapper.DeviceGlyph's CryoPod branch and the
            // same two characters are still present, one apiece, and the test stays green while
            // every capsule on the ship draws the wrong piece.
            var wrong = new List<string>();
            foreach (var p in Pods(sim))
            {
                char g = (char)buffer[p.Pos.X, p.Pos.Y].Glyph;
                char want = p.IsOpen ? 'k' : 'K';
                if (g != want) wrong.Add($"{p.Name} (IsOpen={p.IsOpen}) projects '{g}', wanted '{want}'");
            }
            Assert.That(wrong, Is.Empty,
                "each capsule must project the glyph for ITS OWN state — 'k' open, 'K' occupied:\n  " +
                string.Join("\n  ", wrong));
            Assert.That(Glyphs.ForDevice(DeviceKind.CryoPod), Is.Not.EqualTo('?'),
                "the kind must have a rest glyph or the vocabulary test is the only thing that sees it");
        }

        [Test]
        public void TheSurvivableCore_HoldsEnoughScrubberHardwareForAFullRoster()
        {
            // ⭐ THE THAW CURVE'S CEILING, ASSERTED AGAINST THE ROSTER RATHER THAN AGAINST THE ONE
            // PAWN. CO2 is not clamped when breathing outruns scrubbing, and crossing
            // co2_narcosis_ppm makes a compartment unbreathable, hence unworkable — so a ship that
            // cannot eventually run three scrubbers has a hard ceiling BELOW its own design roster,
            // and the player would meet it with no explanation. The hardware must EXIST to be
            // repaired; almost all of it is allowed to boot broken, which is the game.
            var sim = Boot();
            var core = new List<Room>
            {
                RoomOfAnchor(sim, CryoAnchor), RoomOfAnchor(sim, SpineAnchor), RoomOfAnchor(sim, ReactorAnchor),
            };
            int inCore = 0, working = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Scrubber) continue;
                if (!core.Contains(sim.Rooms.RoomAt(sim.World, d.Pos))) continue;
                inCore++;
                if (d.IsOperational(SimDefs.Default)) working++;
            }
            Assert.That(inCore, Is.GreaterThanOrEqualTo(ScrubbersForAFullRoster),
                $"only {inCore} scrubbers stand in the survivable core; eight crew need " +
                $"{ScrubbersForAFullRoster} working ones, and a player who never opens a door must " +
                "still be able to reach that ceiling by salvage alone");
            Assert.That(working, Is.GreaterThanOrEqualTo(1),
                "and at least one must boot WORKING, or the first pawn is scrubbing nothing");
            Assert.That(working, Is.LessThan(ScrubbersForAFullRoster),
                "…but not all of them: a wreck that boots at its own crew ceiling has no repair game");
        }

        // ------------------------------------------------------------------- 2. the one person

        [Test]
        public void ExactlyOneCrewMemberIsAwake_AndItIsNotEight()
        {
            var sim = Boot();
            Assert.That(sim.Citizens.Items.Count, Is.EqualTo(1),
                "this is a ONE-PAWN opening: the other seven souls are pods, not citizens. Eight " +
                "inert citizens would also distort every LivingCrew denominator in the ledger.");
            Assert.That(sim.Citizens.Items[0].Name, Is.EqualTo(AwakeCrew));
        }

        [Test]
        public void TheCrewMember_StartsBesideTheOpenPod_InBreathableAir()
        {
            var sim = Boot();
            var c = sim.Citizens.Items[0];
            Device open = null;
            foreach (var p in Pods(sim)) if (p.IsOpen) open = p;
            Assert.That(open, Is.Not.Null, "fixture: one pod must be open");
            Assert.That(Int3.IsAdjacent4(c.Pos, open.Pos), Is.True,
                "the crew member must be standing at the capsule they came out of");
            Assert.That(AtmosphereSafety.IsBreathable(sim, c.Pos), Is.True,
                "and in air — a pawn that boots suffocating is a lost run in minute one");
        }

        [Test]
        public void TheCrewMember_IsWorkable_AndWanders()
        {
            var c = Boot().Citizens.Items[0];
            Assert.That(c.HoldPosition, Is.False, "a held hand reads in play as 'my crew ignores me'");
            Assert.That(c.AutoWander, Is.True, "the ship must not read as a still photograph");
            Assert.That(c.RevealsFog, Is.True);
        }

        // -------------------------------------------------------------- 3. the pressure frontier

        private static Room RoomOfAnchor(Simulation sim, string anchor)
        {
            var anchors = sim.Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
                if (anchors[i].Name == anchor) return sim.Rooms.RoomAt(sim.World, anchors[i].Probe);
            return null;
        }

        [Test]
        public void ExactlyThreeSpacesBootBreathable_AndTheRestIsVacuum()
        {
            var sim = Boot();
            var breathable = new List<string>();
            var anchors = sim.Rooms.Anchors;
            for (int i = 0; i < anchors.Count; i++)
            {
                var room = sim.Rooms.RoomAt(sim.World, anchors[i].Probe);
                if (room != null && AtmosphereSafety.IsBreathable(room, SimDefs.Default.Needs))
                    breathable.Add(anchors[i].Name);
            }
            breathable.Sort(StringComparer.Ordinal);
            Assert.That(breathable, Is.EqualTo(new[] { CryoAnchor, ReactorAnchor, SpineAnchor }),
                "THE SURVIVABLE CORE IS THE WHOLE POINT. Everything else on both decks must be " +
                "vacuum, or WorksiteSafety stops confining work and the frontier stops being a game.");
        }

        [Test]
        public void TheGoalCompartment_IsAirlessAtBoot_SoTheGoalIsNotAlreadyMet()
        {
            var sim = Boot();
            var room = RoomOfAnchor(sim, GoalAnchor);
            Assert.That(room, Is.Not.Null, "the goal's anchor must exist");
            Assert.That(AtmosphereSafety.IsBreathable(room, SimDefs.Default.Needs), Is.False,
                "a PressurizeAnchor goal on a compartment that already has air is met the moment it " +
                "is polled — a decoration, not an objective");
        }

        [Test]
        public void EveryAirlessCompartment_BootsBehindAClosedDoor()
        {
            // A typed slot boots its door OPEN by default (SlotGridPlanner: `IsOpen = !empty`), so a
            // typed AIRLESS slot would vent the core through its own door at tick 0. This is the
            // assertion that keeps that from happening.
            // ⚠️ THE SHORTHAND IN THE OLD VERSION OF THIS COMMENT — "the typed set and the
            // pressurised set are the same set" — WAS RETIRED BY M1-1 AND IS NO LONGER TRUE: the
            // wreck's typed set is THREE (cryo, life support, reactor) and its pressurised set is
            // still TWO, because `SlotAssign.DoorOpen` now separates NAMING a compartment from
            // OPENING it. **The assertion below is unchanged and is the real protection** — it asks
            // the stronger and still-true question, NO OPEN DOOR FACES VACUUM AT BOOT, which does not
            // care how the door's state was decided. Only this comment needed the correction, and
            // that the assertion still bites is MEASURED, not assumed: dropping `doorOpen: false`
            // from the slot-3 authoring reddens THIS test on its own —
            // "door_d0_s3 is OPEN onto vacuum at (38,6,0)", 1 failed / 0 passed, unmutated control
            // GREEN — independently of the leg in `InteriorKnownAtBootTests` that names the same
            // mutation.
            var sim = Boot();
            var offenders = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.Door || !d.IsOpen) continue;
                // An open door must have breathable air on BOTH sides of it at boot.
                foreach (var n in new[]
                {
                    new Int3(d.Pos.X, d.Pos.Y - 1, d.Pos.Z), new Int3(d.Pos.X, d.Pos.Y + 1, d.Pos.Z),
                    new Int3(d.Pos.X - 1, d.Pos.Y, d.Pos.Z), new Int3(d.Pos.X + 1, d.Pos.Y, d.Pos.Z),
                })
                {
                    if (!sim.World.InBounds(n) || sim.World.GetWall(n) != 0) continue;
                    if (!AtmosphereSafety.IsBreathable(sim, n))
                        offenders.Add($"{d.Name} is OPEN onto vacuum at {n}");
                }
            }
            Assert.That(offenders, Is.Empty, string.Join("\n  ", offenders));
        }

        [Test]
        public void TheCryoBayVent_IsOpenAndWorking_SoTheCoreRefillsItself()
        {
            var sim = Boot();
            Device vent = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++) if (devices[i].Name == "vent_cryo") vent = devices[i];
            Assert.That(vent, Is.Not.Null);
            Assert.That(vent.IsOpen, Is.True,
                "a CLOSED AirVent draws nothing and injects nothing (PowerSystem.IsWanting); this " +
                "one is what recovers the core after the player opens a hall door");
            Assert.That(vent.Condition, Is.GreaterThan(SimDefs.Default.Machines[(int)DeviceKind.AirVent].MaintainBelow),
                "and it must be above its own maint threshold, or the bay's survival is on the " +
                "maintenance board from tick 0 and the player has to act before they have read anything");
        }

        // ------------------------------------------------------------------ 4. the damaged ship

        [Test]
        public void MostOfTheShip_IsAuthoredDamaged_AndTheCoresLifeSupportIsNot()
        {
            var sim = Boot();
            int wrecked = 0, pristine = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (Simulation.IsUtilityOverlay(d.Kind) || d.Kind == DeviceKind.Door ||
                    d.Kind == DeviceKind.Ladder) continue;   // wear-free structure; never wrecked
                if (d.Condition < WreckThreshold) wrecked++; else pristine++;
            }
            Assert.That(wrecked, Is.GreaterThan(pristine),
                $"a WRECK: most wear-bearing devices must be below the wreck floor " +
                $"({wrecked} wrecked vs {pristine} not)");

            // ⚠️ THE FOUR THAT KEEP THE CORE HABITABLE MUST NOT BE AMONG THEM — and until review
            // drove it, this list named only the two AIR devices. `radiator_reactor` could be moved
            // from 0.33 to 0.13 and the ENTIRE 1229-test suite stayed green, though this ship's own
            // header calls the reactor bay "the other half of the survivable core" and spends two
            // paragraphs on the measured cascade that a sub-floor radiator causes (dead at hour ~5,
            // the compartment past heat_stroke_c, WorksiteSafety then refusing every job in it, so
            // the vent and scrubber are never serviced either). THE RULE WAS OBSERVED, NOT ENFORCED.
            //
            // Below `wear.wreck_threshold` a Radiator cannot be jury-rigged back for free, and it
            // wears at 0.006/h — so authoring one under the floor puts a fuse on its compartment
            // measured in hours. That is the general rule this ship's header states; these four
            // names are it, enforced.
            //
            // Accumulated and asserted ONCE: the old shape asserted inside the loop, so a run in
            // which BOTH radiators had been dropped under the floor would have reported one.
            var unfixable = new List<string>();
            foreach (var name in new[] { "vent_cryo", "scrubber_cryo", "radiator_cryo", "radiator_reactor" })
            {
                Device d = null;
                for (int i = 0; i < devices.Count; i++) if (devices[i].Name == name) d = devices[i];
                if (d == null) { unfixable.Add($"{name}: absent from the ship entirely"); continue; }
                if (d.Condition <= WreckThreshold)
                    unfixable.Add($"{name}: Condition {d.Condition.ToString("R", CultureInfo.InvariantCulture)} " +
                                  $"is at or below the wreck floor {WreckThreshold.ToString(CultureInfo.InvariantCulture)}");
            }
            Assert.That(unfixable, Is.Empty,
                "these devices keep the survivable core survivable — the two that keep the only " +
                "crew member breathing and the two that stop the cryo and reactor bays cooking. " +
                "None of them may boot below the free-jury-rig floor:\n  " + string.Join("\n  ", unfixable));
        }

        [Test]
        public void NoUtilityOverlayOrDoorOrLadder_IsAuthoredDamaged()
        {
            // Conduits, pipes, ladders and doors are what keeps the hull traversable and powerable,
            // and they are `0 0 0 0` in machines.def — `maint = 0` means MaintenanceSystem never
            // recruits for them and `fail = 0` means they work at any condition. A damaged one would
            // be permanently unrepairable and fully functional: an object that looks broken and
            // behaves perfectly, which is the exact lie the plan (§2 beat 5) rejects.
            var sim = Boot();
            var offenders = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                bool structural = Simulation.IsUtilityOverlay(d.Kind) ||
                                  d.Kind == DeviceKind.Door || d.Kind == DeviceKind.Ladder;
                if (structural && d.Condition != 1f) offenders.Add($"{d.Name} ({d.Kind}) at {d.Condition}");
            }
            Assert.That(offenders, Is.Empty, string.Join("\n  ", offenders));
        }

        [Test]
        public void NoFurnitureIsAuthoredAtAll()
        {
            // RoomDresser.Dress is deliberately not called. Furniture is maint=0/fail=0, so a
            // smashed bed would be unrepairable AND fully functional; a raided ship having no bunks
            // left is both the better fiction and the only honest option until W6 gives furniture a
            // fail threshold.
            var sim = Boot();
            var found = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                switch (devices[i].Kind)
                {
                    case DeviceKind.Bed: case DeviceKind.Table: case DeviceKind.Chair:
                    case DeviceKind.Locker: case DeviceKind.Desk: case DeviceKind.PlantPot:
                    case DeviceKind.MedBed: case DeviceKind.MedCabinet:
                        found.Add(devices[i].Name); break;
                    default: break;
                }
            }
            Assert.That(found, Is.Empty, string.Join(", ", found));
        }

        // -------------------------------------------------------------------- 5. MOSS is dark

        [Test]
        public void TheMossTerminal_BootsUnCommissioned()
        {
            var sim = Boot();
            Device term = null;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++) if (devices[i].Name == MossTerminal) term = devices[i];
            Assert.That(term, Is.Not.Null, MossTerminal + " must exist — it is the thaw console (W5)");
            Assert.That(term.Kind, Is.EqualTo(DeviceKind.Terminal));
            Assert.That(term.Scriptable, Is.False, "MOSS is DARK until a ControllerModule is spent on it");
            Assert.That(term.Condition, Is.LessThan(WreckThreshold),
                "and it is below the wreck floor too, so it cannot even be bodged back for free");
        }

        /// <summary>
        /// The dark flag driven all the way to ITS OWN consumer. Present-and-INERT is
        /// indistinguishable from working (CLAUDE.md, verb parity), so this drives the real
        /// <see cref="SetScriptCommand"/> through a real tick.
        ///
        /// ⚠️ THE OBVIOUS TEST HERE IS WRONG AND THE FIRST DRAFT OF THIS FILE SHIPPED IT. Asserting
        /// "an authored-dark terminal gets no MOSS adapter" PASSES — and it passes for a reason that
        /// has nothing to do with the flag: <c>MossBindings.RegisterAdapters</c>'s switch covers
        /// Door, AirVent, Scrubber, SolarWing, GrowBed, WaterTank and Reclaimer, and
        /// <b>DeviceKind.Terminal is not one of them</b>. A TERMINAL IS NEVER MOSS-ADDRESSABLE AS A
        /// DEVICE, commissioned or not. Caught by the control below going red: with
        /// <c>Scriptable = true</c> the same terminal still did not register. That is the third trap
        /// shape wearing a green costume — a correct-looking assertion satisfied by an unrelated
        /// code path — and the control is the only thing that found it.
        ///
        /// What `Scriptable` really gates for a Terminal is `SetScriptCommand.Execute`
        /// (`Commands.cs:111`): <c>if (TryFindNamedDevice(...) &amp;&amp; !terminal.Scriptable) return;</c>.
        /// </summary>
        [Test]
        public void TheMossTerminal_RefusesAProgram_UntilItIsCommissioned()
        {
            var sim = Boot();
            Assert.That(sim.Scripts, Is.Empty, "fixture: the wreck authors no scripts");

            sim.EnqueueCommand(new SetScriptCommand(MossTerminal, "every 10 { }"));
            sim.Tick();
            Assert.That(sim.Scripts, Is.Empty,
                "MOSS is DARK: an authored-dark terminal must refuse to take a program until a " +
                "CommissionDeviceCommand has spent a ControllerModule on it");

            // NON-VACUITY AS AN INCLUSION TEST, not a population count: the SAME command on the SAME
            // terminal with the flag cleared must install, or the assertion above is satisfied by a
            // misspelled name, a command that does nothing, or a gate somewhere else entirely.
            var plan = AuthoredShips.PeriluneWreck();
            for (int i = 0; i < plan.Devices.Count; i++)
            {
                var spec = plan.Devices[i];
                if (spec.Name != MossTerminal) continue;
                spec.Scriptable = true;
                plan.Devices[i] = spec;   // struct: write it back or the mutation evaporates
            }
            var lit = ShipPlanBuilder.Build(plan, Stack());
            lit.EnqueueCommand(new SetScriptCommand(MossTerminal, "every 10 { }"));
            lit.Tick();
            Assert.That(lit.Scripts.Count, Is.EqualTo(1),
                "control: with Scriptable=true the SAME terminal must accept the SAME program");
        }

        // ----------------------------------------------------------- 6. nothing is pre-painted

        [Test]
        public void NoDesignationExistsAtTickZero()
        {
            var sim = Boot();
            var plan = AuthoredShips.PeriluneWreck();
            Assert.That(plan.DigDesignations, Is.Empty,
                "the grid ship's 'everyone runs to dig' opening is precisely what this start replaces");

            int designated = 0, stockpile = 0;
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((world.GetFlags(p) & TileFlags.Designated) != 0) designated++;
                        if ((world.GetFlags(p) & TileFlags.Stockpile) != 0) stockpile++;
                    }
            Assert.That(designated, Is.Zero, "no dig or build designation may exist at boot");
            Assert.That(stockpile, Is.Zero, "and no stockpile is zoned — a zone is the player's decision");
        }

        [Test]
        public void TheShipCarriesDebris_ButNoneOfItIsDesignated()
        {
            // Non-vacuity for the test above: "0 designations" is worthless if there is nothing on
            // the ship a designation could sit on.
            var sim = Boot();
            int debris = 0;
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                        if (world.GetWall(new Int3(x, y, z)) == TileDefs.Debris) debris++;
            Assert.That(debris, Is.EqualTo(DebrisTiles));
        }

        [Test]
        public void ThereIsExactlyOneGoal_AndItIsThePressureFrontier()
        {
            var plan = AuthoredShips.PeriluneWreck();
            Assert.That(plan.Goals.Count, Is.EqualTo(1));
            Assert.That(plan.Goals[0].Kind, Is.EqualTo(GoalKind.PressurizeAnchor));
            Assert.That(plan.Goals[0].Param, Is.EqualTo(GoalAnchor));
            Assert.That(plan.Goals[0].Text, Is.Not.Empty);
        }

        // ------------------------------------------------------------ 7. the opening is winnable

        [Test]
        public void TheBootCompartment_HoldsAStrippableWreckedDevice()
        {
            // W3 precondition 2, and it is the one that decides whether the game can start at all.
            //
            // ⚠️ HONEST SCOPE: THIS LEG'S RED IS CORRELATED AND IT WILL NOT FIRE ALONE. Measured by
            // mutation: healing the bay's four wrecked FITTINGS (light, radiator, battery, terminal)
            // leaves it GREEN, because the four wrecked CAPSULES are also strippable and also pay
            // Swarf — a dead pod is salvage. Only healing all eight reddens it, and that reddens
            // `PodCensus_IsOneOpen_FourWrecked_SevenIntact` in the same run. So read it as a
            // statement about the SHIP ("the boot compartment can bootstrap the salvage rung"),
            // which is true and worth pinning, and NOT as a guard that isolates one authored value.
            // Labelled here rather than counted among the guards that bite alone.
            // With W2 shipped, EVERY repair below wear.wreck_threshold needs a consumable, and on a
            // fresh wreck the only consumable in existence comes from stripping a machine. No
            // strippable wreck in breathable air ⇒ the loop cannot bootstrap.
            var sim = Boot();
            var cryo = RoomOfAnchor(sim, CryoAnchor);
            Assert.That(cryo, Is.Not.Null);

            var strippable = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind == DeviceKind.Door) continue;                       // strip refuses doors
                if (Simulation.IsUtilityOverlay(d.Kind)) continue;
                if (!ReferenceEquals(sim.Rooms.RoomAt(sim.World, d.Pos), cryo)) continue;
                // A device pays Swarf exactly when its Parts yield floors to 0.
                if ((int)(SimDefs.Default.Deconstruct.DeviceParts * d.Condition) == 0) strippable.Add(d.Name);
            }
            Assert.That(strippable.Count, Is.GreaterThanOrEqualTo(1),
                "the cryo bay must hold at least one device worth Swarf, or the salvage rung cannot " +
                "start and the ship is unwinnable from tick 0");
        }

        [Test]
        public void TheSurvivableCore_HoldsEnoughSalvageAndMatterToReachAControllerModule()
        {
            // THE ARITHMETIC, ASSERTED. A ControllerModule (the price of commissioning MOSS) is
            // 2 Parts = 4 Scrap = 8 Regolith through the shipped bills, and the three benches plus
            // the terminal each need one consumable service to come back. Both floors are checked
            // against what is reachable WITHOUT opening a door, so a player who never works out the
            // pressure loop still cannot be hard-stuck at tick 0.
            var sim = Boot();
            var core = new List<Room>
            {
                RoomOfAnchor(sim, CryoAnchor), RoomOfAnchor(sim, SpineAnchor), RoomOfAnchor(sim, ReactorAnchor),
            };

            int swarfSources = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind == DeviceKind.Door || Simulation.IsUtilityOverlay(d.Kind)) continue;
                if (!core.Contains(sim.Rooms.RoomAt(sim.World, d.Pos))) continue;
                if ((int)(SimDefs.Default.Deconstruct.DeviceParts * d.Condition) == 0) swarfSources++;
            }
            Assert.That(swarfSources, Is.GreaterThanOrEqualTo(4),
                "four consumable services are needed to bring the three benches and the terminal " +
                "back; the core must be able to pay for all four in Swarf alone");

            int regolith = 0, parts = 0, seals = 0, potatoes = 0;
            var items = sim.Items.Items;
            for (int i = 0; i < items.Count; i++)
            {
                switch (items[i].Kind)
                {
                    case ItemKind.Regolith: regolith += items[i].Count; break;
                    case ItemKind.Parts: parts += items[i].Count; break;
                    case ItemKind.Seals: seals += items[i].Count; break;
                    case ItemKind.Potato: potatoes += items[i].Count; break;
                    default: break;
                }
            }
            Assert.That(regolith, Is.GreaterThanOrEqualTo(8),
                "8 Regolith is the floor for one ControllerModule through the shipped bills");
            Assert.That(parts + seals, Is.GreaterThanOrEqualTo(1),
                "at least one free service before the player has to salvage anything");
            Assert.That(potatoes, Is.GreaterThanOrEqualTo(10), "and something to eat while doing it");
        }

        [Test]
        public void TheThreeBenchesOfTheMatterLadder_ExistAndAreAllBehindTheFrontier()
        {
            var sim = Boot();
            var wanted = new[]
            {
                DeviceKind.SalvageRecycler, DeviceKind.Fabricator, DeviceKind.MachineShop,
            };
            // Accumulated and asserted ONCE (the old shape asserted per-iteration, so a ship that
            // had moved TWO benches into the core reported one and looked like a one-line fix).
            var offenders = new List<string>();
            foreach (var kind in wanted)
            {
                Device best = null;
                var devices = sim.Devices.Items;
                for (int i = 0; i < devices.Count; i++)
                    if (devices[i].Kind == kind && (best == null || devices[i].Condition > best.Condition))
                        best = devices[i];
                if (best == null) { offenders.Add($"{kind}: absent — the matter ladder has a missing rung"); continue; }
                if (AtmosphereSafety.IsBreathable(sim, best.Pos))
                    offenders.Add($"{kind} ({best.Name}) starts in BREATHABLE air — a bench the player " +
                                  "can already reach removes the reason to make any");
                if (best.Condition >= WreckThreshold)
                    offenders.Add($"{kind} ({best.Name}) starts at Condition " +
                                  best.Condition.ToString("R", CultureInfo.InvariantCulture) +
                                  ", at or above the wreck floor — it repairs itself for free and the " +
                                  "salvage rung never gets used");
            }
            Assert.That(offenders, Is.Empty, string.Join("\n  ", offenders));
        }

        [Test]
        public void TheBenchesAreOnAPowerNetwork_AndTheirTierIsServed()
        {
            // ⚠️ THIS IS THE ASSERTION THAT CATCHES THE UNWINNABLE SHIP, AND M2-12 CHANGED WHAT
            // "UNWINNABLE" MEANS HERE. It used to rest on generation being CONDITION-BLIND — "a
            // wrecked SolarWing still supplies its full kW", so authored damage could not brown a
            // tier back in and a tier shed at boot was shed for ever. That premise is GONE:
            // generation now rides Device.EffectiveRate (PowerSystem.cs:235), the wreck's three
            // damaged wings feed 10.65 kW against 14.80 of demand, and PowerTier.Industry is shed
            // once the 15 kWh bank runs out at about sim-hour 4. THE BENCHES BEING DARK IS NOW A
            // STATE THE PLAYER REPAIRS THEIR WAY OUT OF, not a dead end.
            // ⇒ So the unwinnable ship is no longer "Industry shed at boot"; it is "Industry shed
            // even at the reachable power ceiling". Both halves are asserted below, and the second
            // is the one that catches it.
            // ⚠️ AND THE FIRST HALF IS DELIBERATELY READ INSIDE THE BANK'S LIFETIME (60 000 ticks
            // = 1.7 sim-hours, before the h4 drain). That is not the hole the old comment warns
            // about, it is the opposite: at this horizon the benches ARE fed, which is what makes
            // the ship's opening playable, and the ceiling leg is what proves the wings — not the
            // batteries — are what keeps them fed afterwards.
            // ⚠️ THE HORIZON IS THE WHOLE GUARD, AND 20 TICKS WAS A HOLE — FOUND BY MUTATION, NOT BY
            // READING. This test ran two sim-seconds and SURVIVED deleting every SolarWing on the
            // ship. `PowerSystem.cs:247` reads `supply = generation + batteryCharge * 3600`, i.e. a
            // battery can burst its whole stored energy inside one balance second, so 15 kWh of
            // authored charge covers a 13 kW demand with ZERO generation for over an hour. A
            // two-second test therefore measured the batteries, not the wings.
            // 60 000 ticks is ~1.7 sim-hours — past the flat point of this ship's authored charge —
            // and costs ~2 s of wall clock because one pawn on a 612-device ship is cheap.
            var sim = Boot();
            for (int i = 0; i < 60_000; i++) sim.Tick();

            var offenders = new List<string>();
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.SalvageRecycler && d.Kind != DeviceKind.Fabricator &&
                    d.Kind != DeviceKind.MachineShop) continue;
                if (d.NetworkId == 0) continue;   // deck 1's ruined bench: risers cut, by design
                if (!d.Powered) offenders.Add($"{d.Name} ({d.Kind}) is on network {d.NetworkId} and UNPOWERED");
            }
            Assert.That(offenders, Is.Empty,
                "the matter ladder is unreachable and the opening is unwinnable:\n  " +
                string.Join("\n  ", offenders));

            int onNetwork = 0;
            for (int i = 0; i < devices.Count; i++)
                if ((devices[i].Kind == DeviceKind.SalvageRecycler || devices[i].Kind == DeviceKind.Fabricator ||
                     devices[i].Kind == DeviceKind.MachineShop) && devices[i].NetworkId != 0) onNetwork++;
            Assert.That(onNetwork, Is.GreaterThanOrEqualTo(3),
                "fixture: all three deck-0 benches must be trayed, or the check above is vacuous");

            // ⭐ THE LEG THAT NOW CATCHES THE UNWINNABLE SHIP (M2-12). Bring the wings to
            // 1.00 / 0.90 / 0.90 — one Parts overhaul and two Seals services, 17.40 kW against
            // 14.80 of demand. ⚠️ D7 (2026-08-03): M2-12 called this "the ceiling the opening can
            // reach" and that reading is retired — the `cabin stores` cache authors seven more
            // Parts, so three overhauls (18.00 kW) are affordable out of the hold, at the price of
            // the furniture those units also pay for. This leg's subject is unchanged: it asks
            // whether the benches run at a state the opening can REACH, and 1.00/0.90/0.90 still is
            // one (it is now the cheaper of two). See GenerationWearTests.CeilingKW —
            // and hold the ship there for twelve sim-hours. If the benches are dark HERE, no
            // amount of repairing gets the matter ladder running and the opening is unwinnable.
            //
            // ⛔ THE BANK IS FLATTENED FIRST, AND THAT IS THE WHOLE LEG. Review send-back D2:
            // without it this check re-opened the exact hole the comment at the top of this method
            // describes. MEASURED on this tree: the ship enters this leg holding 8.874 kWh, and a
            // battery bursts its entire charge inside one balance second — so the reserve bridges
            // a deficit for the full twelve hours and the benches read lit on generation that
            // cannot pay for them. Driven proof: with generation scaled ×0.6 and the bank LEFT
            // ALONE, the end-of-run sample is 3/3 benches lit and this leg PASSES, while the ship
            // actually spent 20 767 of its 43 200 balance passes with a dark bench. Flattened, the
            // same mutation reads 0/3 immediately and the leg fails, which is correct.
            //
            // ⚠️ AND IT ASSERTS OVER THE WINDOW, NOT AT AN INSTANT — same reason: an end-of-run
            // sample of a flickering ship is a coin toss on the phase (20 767 dark passes still
            // ended on a lit one).
            //
            // ⚠️ THE SECOND ASSERTION IS THE BANK REFILLING, AND IT IS THE SHARPER OF THE TWO.
            // At the true ceiling generation exceeds total demand outright, so the reserve does not
            // merely survive — it rebuilds: MEASURED ON THIS TREE, from flat, 0.000722 -> 27.898 kWh
            // across these twelve hours. That is what makes the repair a WIN rather than a
            // stalemate: the ship has something left for the next thing that breaks.
            //
            // ⭐ ⚠️ RE-MEASURED AT M3-11, AND WHAT MOVED IS THE PARAGRAPH'S CLAIM, NOT ONLY ITS
            // NUMBERS. It used to read "0.000 -> 33.907 kWh (×0.9 gives 13.356) … at ×0.8,
            // generation 13.92 kW still covers LifeSupport 5.70 + Defense 0.90 + Industry 6.50 =
            // 13.10, so every bench is legitimately lit — 3/3, honest, GREEN — while the bank ends
            // at 0.000038 kWh". M3-11 put `vent_d1` on the deck-0 trunk, so LifeSupport is 6.20 and
            // the three tiers above Comfort sum to 6.20 + 0.90 + 6.50 = 13.60 — a 0.32 kW margin
            // under ×0.8's 13.92 where it used to be 0.82. DRIVEN AGAIN, same method as the
            // original (the generation term in PowerSystem scaled, this floor raised so the value
            // prints in the failure message, tree restored from an in-memory copy):
            //     ×1.0   benches 3/3 lit               bank 0.000722 -> 27.898     kWh   PASSES
            //     ×0.9   benches 3/3 lit               bank 0.000239 ->  7.348     kWh   PASSES
            //     ×0.8   a bench DARK in 865 of        bank 0.000089 ->  0.000724  kWh   BOTH FIRE
            //            43 200 balance passes
            // ⇒ "THE BENCH COUNT CANNOT SEE IT" IS NO LONGER TRUE AT ×0.8 AND IS NOT CLAIMED HERE.
            // The wings WEAR across the twelve hours, so on a 0.32 kW margin the drifting generation
            // crosses the Industry line part-way through the run — which is why the bench leg now
            // fires late and partially (2 % of passes) instead of not at all. The bank leg remains
            // the sharper instrument, and it is the one that separates "rebuilds its reserve" from
            // "hovers at empty" cleanly.
            // ⚠️ A FLOOR, NOT A BAND, AND DELIBERATELY SO. This leg's subject is winnability, not
            // scale; a two-sided band on the rebuilt value would redden on any unrelated demand
            // change — M3-11 IS exactly such a change and it moved the value 33.907 -> 27.898. The
            // floor sits 28× below the measured value and 1 381× above the ×0.8 mutant. THE SCALE
            // GUARD IS ELSEWHERE, two-sided, in GenerationWearTests.
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind == DeviceKind.SolarWing)
                    d.Condition = d.Name == "wing_c" ? 1.00f : 0.90f;   // Parts on one, Seals on two
                else if (d.Kind == DeviceKind.Battery)
                    d.StoredKWh = 0f;                                   // no bridging: see above
            }

            // The wired benches are resolved ONCE and held by reference: devices are not recreated,
            // and re-scanning all 612 of them on each of 43 200 samples is 26 M iterations of pure
            // waste inside a shared test process. (Not a style note — this method is one of the
            // longest in the suite and it runs beside an exact-zero allocation pin.)
            var benches = new List<Device>();
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                if (d.Kind != DeviceKind.SalvageRecycler && d.Kind != DeviceKind.Fabricator &&
                    d.Kind != DeviceKind.MachineShop) continue;
                if (d.NetworkId == 0) continue;             // deck 1's ruined bench: risers cut, by design
                benches.Add(d);
            }

            float bankAtRepair = 0f;
            int darkPasses = 0;
            const int Window = 12 * 36_000;                 // twelve sim-hours at 10 Hz
            for (int t = 0; t < Window; t++)
            {
                sim.Tick();
                if (t % 10 != 9) continue;                  // one sample per 1 Hz balance pass
                for (int i = 0; i < benches.Count; i++)
                    if (!benches[i].Powered) { darkPasses++; break; }
                if (t == 9) bankAtRepair = StoredKWh(sim);  // read after the first pass settles
            }

            var afterRepair = new List<string>();
            if (darkPasses != 0)
                afterRepair.Add($"a wired bench was UNPOWERED in {darkPasses.ToString(CultureInfo.InvariantCulture)} " +
                                $"of {(Window / 10).ToString(CultureInfo.InvariantCulture)} balance passes at the " +
                                "reachable power ceiling — the matter ladder cannot be reached by repairing");
            float bankAtEnd = StoredKWh(sim);
            const float BankRebuildFloorKWh = 1.0f;   // M3-11 tree: 27.898 here, 0.000724 at ×0.8
            if (bankAtEnd < BankRebuildFloorKWh)
                afterRepair.Add($"the battery bank went {bankAtRepair.ToString("F6", CultureInfo.InvariantCulture)} -> " +
                                $"{bankAtEnd.ToString("F6", CultureInfo.InvariantCulture)} kWh across twelve sim-hours " +
                                "at the ceiling, under a floor of " +
                                BankRebuildFloorKWh.ToString("F2", CultureInfo.InvariantCulture) + " kWh. It must " +
                                "REBUILD (measured: 27.898 on this tree; 33.907 before M3-11): generation there " +
                                "is 17.40 kW against 14.80 kW of TOTAL " +
                                "demand. A ship whose benches run while its reserve sits at empty is break-even at " +
                                "the Industry line — it can never light a lamp again and has nothing left for the " +
                                "next failure, and the bench count alone cannot tell you that");
            Assert.That(afterRepair, Is.Empty,
                "the matter ladder cannot be reached even at full repairable power — THAT is an " +
                "unwinnable ship:\n  " + string.Join("\n  ", afterRepair));
        }

        /// <summary>Total charge in the ship's battery bank, kWh.</summary>
        private static float StoredKWh(Simulation sim)
        {
            float s = 0f;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
                if (devices[i].Kind == DeviceKind.Battery) s += devices[i].StoredKWh;
            return s;
        }

        // ------------------------------------------------------------------- 8. it is survivable

        /// <summary>
        /// ONE SIM-DAY, DRIVEN, WITH NO PLAYER INPUT. The acceptance the plan asks for: the cryo
        /// bay must be survivable without the player doing anything, or the game ends while they
        /// are still reading the tutorial. It also censuses the bay's TEMPERATURE, because there is
        /// no heater device in the game and the only thing holding the compartment above
        /// hypothermia_c is the waste heat of the pods and the lamp.
        /// </summary>
        [Test]
        public void TheOneCrewMember_SurvivesADayAlone_AndTheBayStaysBreathable()
        {
            var sim = Boot();
            const int Day = 864_000;   // 10 Hz
            for (int t = 0; t < Day; t++) sim.Tick();

            Assert.That(sim.Citizens.Items.Count, Is.EqualTo(1), "the only crew member died");
            var cryo = RoomOfAnchor(sim, CryoAnchor);
            Assert.That(AtmosphereSafety.IsBreathable(cryo, SimDefs.Default.Needs), Is.True,
                $"the cryo bay stopped being breathable after one sim-day: " +
                $"{cryo.PressureKPa.ToString("F1", CultureInfo.InvariantCulture)} kPa, " +
                $"ppO2 {(cryo.PressureKPa * cryo.O2Fraction).ToString("F1", CultureInfo.InvariantCulture)} kPa, " +
                $"{cryo.CO2Ppm.ToString("F0", CultureInfo.InvariantCulture)} ppm CO2, " +
                $"{(cryo.TemperatureK - 273.15).ToString("F1", CultureInfo.InvariantCulture)} degC");
            Assert.That(sim.Citizens.Items[0].Suffocation, Is.LessThan(0.5f),
                "and the crew member must not be in the flee band at the end of it");
        }

        /// <summary>
        /// THE LADDER IS A REAL HAZARD AND THIS IS WHY IT IS KEPT. Deck 1 is vacuum and one ladder
        /// away from the only crew member. Driven: order the pawn down, and require
        /// <see cref="SafetySystem"/> to bring it back to air alive.
        /// </summary>
        [Test]
        public void APawnOrderedIntoTheVacuumDeck_FleesBackToAir_Alive()
        {
            var sim = Boot();
            var c = sim.Citizens.Items[0];
            var target = new Int3(SlotGridPlanner.LadderX + 4, SlotGridPlanner.SpineY1, 1);
            Assert.That(AtmosphereSafety.IsBreathable(sim, target), Is.False,
                "fixture: the deck-1 spine must be vacuum, or this test proves nothing");

            sim.EnqueueCommand(new MoveCitizenCommand(c.Id, target));
            bool reachedDeck1 = false;
            for (int t = 0; t < 30_000; t++)   // 50 sim-minutes: down, suffocate, flee, recover
            {
                sim.Tick();
                if (sim.Citizens.Items.Count == 0) break;
                if (sim.Citizens.Items[0].Pos.Z == 1) reachedDeck1 = true;
            }

            Assert.That(reachedDeck1, Is.True,
                "fixture: the pawn never got to deck 1, so the flee path was never exercised — the " +
                "ladder trunk or the move order is broken, which is a different bug");
            Assert.That(sim.Citizens.Items.Count, Is.EqualTo(1),
                "the only crew member died on the vacuum deck. Until W5's emergency thaw exists, " +
                "that is an unrecoverable run, so SafetySystem is the ONLY thing standing between " +
                "one misclick and the end of the game.");
            Assert.That(AtmosphereSafety.IsBreathable(sim, sim.Citizens.Items[0].Pos), Is.True,
                "and it must have got back to air, not merely survived at the margin");
        }

        // ------------------------------------------------- 9. the shipped ships are not disturbed

        [Test]
        public void TheWreckSeed_IsItsOwnIdentity()
        {
            // Portrait keys are pk_fnv1a32(seed, citizenId): a shared seed would collide this
            // ship's crew art with another ship's.
            var seeds = new[]
            {
                AuthoredShips.Perilune().Seed, AuthoredShips.SliceSeed,
                AuthoredShips.GridSeed, AuthoredShips.WreckSeed,
            };
            CollectionAssert.AllItemsAreUnique(seeds);
        }

        [Test]
        public void NoOtherAuthoredShip_GainedAPodOrACryoRoom()
        {
            // Accumulated and asserted ONCE. Asserting inside the loop meant the FIRST ship to
            // have grown a pod ended the run, so "the wreck start leaked into the shipped ships"
            // reported as a one-ship problem when it could be a three-ship one.
            var leaks = new List<string>();
            foreach (var plan in new[]
            {
                AuthoredShips.Perilune(), AuthoredShips.PeriluneSlice(), AuthoredShips.PeriluneGrid(),
            })
            {
                for (int i = 0; i < plan.Devices.Count; i++)
                    if (plan.Devices[i].Kind == DeviceKind.CryoPod)
                        leaks.Add($"{plan.Name} grew a cryo pod ({plan.Devices[i].Name})");
                for (int i = 0; i < plan.Rooms.Count; i++)
                    if (plan.Rooms[i].Type == RoomType.Cryo)
                        leaks.Add($"{plan.Name} grew a cryo bay ({plan.Rooms[i].Anchor})");
                if (plan.LogLines.Count != 0)
                    leaks.Add($"{plan.Name} grew {plan.LogLines.Count} boot log lines");
            }
            Assert.That(leaks, Is.Empty, string.Join("\n  ", leaks));
        }

        // --------------------------------------------------------------------- 10. the census

        /// <summary>
        /// NOT A GUARD — a CHARACTERISATION test that prints the boot census the lane's report
        /// quotes, so the numbers can be argued about without re-deriving them. It asserts only
        /// that the ship boots at all; every real assertion is above. Labelled in place rather than
        /// counted among the guards (CLAUDE.md: an honest count of what bites).
        /// </summary>
        [Test]
        public void PrintTheBootCensus()
        {
            var sim = Boot();
            for (int i = 0; i < 20; i++) sim.Tick();   // let PowerSystem balance once
            var sb = new StringBuilder();
            var inv = CultureInfo.InvariantCulture;
            sb.AppendLine("=== --ship wreck BOOT CENSUS ===");
            sb.AppendLine($"world {sim.World.Width}x{sim.World.Height}x{sim.World.Depth}  seed {AuthoredShips.WreckSeed}");
            sb.AppendLine($"crew alive: {sim.Citizens.Items.Count}");

            int open = 0, wreckedPods = 0, intactPods = 0;
            foreach (var p in Pods(sim))
            {
                if (p.IsOpen) open++;
                else if (p.Condition < CryoPodFailBelow) wreckedPods++;
                else intactPods++;
            }
            sb.AppendLine($"pods: {open} open / {wreckedPods} wrecked (dead sleeper) / {intactPods} intact occupied");

            int total = 0, overlays = 0, belowWreck = 0, belowFail = 0, swarfWorth = 0, dark = 0;
            var devices = sim.Devices.Items;
            for (int i = 0; i < devices.Count; i++)
            {
                var d = devices[i];
                total++;
                if (Simulation.IsUtilityOverlay(d.Kind)) { overlays++; continue; }
                if (d.Condition < WreckThreshold) belowWreck++;
                if (!d.IsOperational(SimDefs.Default)) belowFail++;
                if (d.Kind != DeviceKind.Door && (int)(SimDefs.Default.Deconstruct.DeviceParts * d.Condition) == 0)
                    swarfWorth++;
                if (!d.Scriptable) dark++;
            }
            sb.AppendLine($"devices: {total} total, {overlays} utility overlays, {total - overlays} tile-resident");
            sb.AppendLine($"  below wear.wreck_threshold ({WreckThreshold.ToString(inv)}): {belowWreck}");
            sb.AppendLine($"  inoperative (below their own fail): {belowFail}");
            sb.AppendLine($"  worth SWARF if stripped (Parts yield floors to 0): {swarfWorth}");
            sb.AppendLine($"  un-commissioned (Scriptable=false): {dark}");

            var anchors = sim.Rooms.Anchors;
            for (int z = 0; z < sim.World.Depth; z++)
            {
                int breathableTiles = 0, breathableRooms = 0, rooms = 0;
                for (int i = 0; i < anchors.Count; i++)
                {
                    if (anchors[i].Probe.Z != z) continue;
                    rooms++;
                    var room = sim.Rooms.RoomAt(sim.World, anchors[i].Probe);
                    if (room == null || !AtmosphereSafety.IsBreathable(room, SimDefs.Default.Needs)) continue;
                    breathableRooms++;
                    breathableTiles += room.TileCount;
                }
                sb.AppendLine($"deck {z}: {rooms} anchored spaces, {breathableRooms} breathable, " +
                              $"{breathableTiles} breathable tiles");
            }

            foreach (var name in new[] { CryoAnchor, SpineAnchor, ReactorAnchor, GoalAnchor })
            {
                var r = RoomOfAnchor(sim, name);
                sb.AppendLine($"  {name,-14} {r.PressureKPa.ToString("F1", inv),7} kPa  " +
                              $"ppO2 {(r.PressureKPa * r.O2Fraction).ToString("F1", inv),5}  " +
                              $"{r.CO2Ppm.ToString("F0", inv),6} ppm  " +
                              $"{(r.TemperatureK - 273.15).ToString("F1", inv),6} degC  " +
                              $"{r.TileCount,4} tiles");
            }

            int debris = 0, designated = 0;
            var world = sim.World;
            for (int z = 0; z < world.Depth; z++)
                for (int y = 0; y < world.Height; y++)
                    for (int x = 0; x < world.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if (world.GetWall(p) == TileDefs.Debris) debris++;
                        if ((world.GetFlags(p) & TileFlags.Designated) != 0) designated++;
                    }
            sb.AppendLine($"debris tiles: {debris}   designated: {designated}   zoned stockpile tiles: 0");
            sb.AppendLine($"boot log lines: {AuthoredShips.PeriluneWreck().LogLines.Count}");
            TestContext.Out.WriteLine(sb.ToString());

            Assert.That(sim.Citizens.Items.Count, Is.EqualTo(1), "the census fixture must boot");
        }
    }
}
