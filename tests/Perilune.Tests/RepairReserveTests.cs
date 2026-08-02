using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>D3 — THE RESERVE FLOOR ON AUTONOMOUS REPAIR SPEND</b> (owner decision, 2026-08-02).
    ///
    /// <para><b>THE OUTCOME THIS FILE DRIVES:</b> <i>turning the work grid on no longer bankrupts
    /// the ship — auto-maintenance declines the last
    /// <see cref="MaintenanceSystem.AutonomousRepairReserve"/> loose consumable units, a direct
    /// order may still spend them, so the run no longer terminally stalls.</i></para>
    ///
    /// <para><b>THE DEFECT, MEASURED IN THE M3 MILESTONE DEMO (finding D3).</b> With all six work
    /// types on, the maintenance board spent all ten of the wreck's loose Seals in ~4 sim-hours. At
    /// zero consumables no bench can be repaired, the crafting chain that earns the next thaw cannot
    /// start, and the run terminally stalls at two crew. The demo survived only by leaving REPAIR
    /// OFF and using direct orders.</para>
    ///
    /// <para><b>EVERY TEST HERE IS DRIVEN</b> — the real <see cref="SystemStack"/> ticks, real crew
    /// walk and fetch, and every assertion reads <see cref="Device.Condition"/>,
    /// <see cref="Citizen.JobKind"/> or the live item store. Nothing re-derives an expected value
    /// with the expression the code uses, and no determinism-pin literal is asserted here.</para>
    ///
    /// <para><b>THE SCALE PIN (CLAUDE.md, seventh shape).</b> A reserve is a COUNT, and a suite that
    /// only asked "did it stop early?" would survive a reserve of 2 or of 40.
    /// <see cref="TheReserveIsBracketedFromBothSides_FiveUnitsAreSpent_FourAreNot"/> drives the same
    /// fixture at 5 units (must be serviced) and at 4 (must be refused), which pins the floor into
    /// exactly [4, 5) — any other value reddens one of the two legs by construction.</para>
    ///
    /// <para><b>THE LEGS ARE BLINDED (CLAUDE.md, fifth shape).</b> <c>Assert</c> throws, so a
    /// multi-leg test reports only its first failing leg and a dead leg looks exactly like a live
    /// one. Every leg below runs its own fixture, records into a local, and the results are asserted
    /// together inside <c>Assert.Multiple</c>.</para>
    /// </summary>
    public class RepairReserveTests
    {
        // ═══════════════════════════════════════════════════════════════════════════ helpers

        /// <summary>Long enough for one recruit + walk + a full 900 s service (9 000 ticks) with
        /// slack for a fetch leg across the bay.</summary>
        private const int OneServiceTicks = 14000;

        /// <summary>Long enough for FIVE consecutive services with their fetch and walk legs — the
        /// spend-down leg needs the ship to actually run itself down to the floor.</summary>
        private const int SpendDownTicks = 140000;

        /// <summary>Below <c>wear.wreck_threshold</c> (0.25): a consumable is the ONLY way to repair
        /// it, so a refusal here means "no service at all".</summary>
        private const float BelowTheWreckFloor = 0.05f;

        /// <summary>Inside <c>[wreck_threshold, maint)</c> = [0.25, 0.40) for a Scrubber: the band
        /// where an empty-handed jury-rig is still legal, so a refusal here means "the FREE repair
        /// instead of the paid one".</summary>
        private const float InTheJuryRigBand = 0.30f;

        /// <summary>
        /// A powered, pressurised, breathable bay with <paramref name="machines"/> wear-bearing
        /// machines all at <paramref name="condition"/>, <paramref name="sealUnits"/> loose Seals in
        /// ONE-UNIT stacks, and <paramref name="crew"/> crew members with the whole work grid on.
        ///
        /// <para>The machines are <see cref="DeviceKind.Scrubber"/>s — <c>machines.def</c> gives
        /// them <c>maint 0.40</c> / <c>fail 0.10</c>, so every condition used in this file is below
        /// the maintain threshold and the standing rule genuinely wants to service them.</para>
        ///
        /// <para><b>ONE-UNIT STACKS, DELIBERATELY.</b> <c>DriveWorker</c> picks up the WHOLE stack
        /// for a one-unit service and a carried stack is invisible to the reserve count (the filed
        /// carried-stack blackout), so a single ten-unit stack would serialise the spend-down and
        /// make the arithmetic a statement about carrying rather than about the floor. Separate
        /// units keep the count on the ground where the predicate reads it.</para>
        ///
        /// <para>Crew start on row 3, machines on row 2, stock spread across row 3 — so a service
        /// is a genuine walk AND a genuine fetch. A fixture where everything is adjacent cannot tell
        /// "refused" from "instant".</para>
        /// </summary>
        private static Simulation BuildBay(float condition, int sealUnits, int machines = 1, int crew = 1)
        {
            string[] map =
            {
                "################",
                "#..............#",
                "#..............#",
                "#..............#",
                "################",
            };
            var moss = new ScriptRuntime(new DeviceRegistry());
            var sim = new Simulation(AsciiWorld.Build(map), 42, SystemStack.CreateDefault(moss));

            for (int x = 1; x <= 14; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");

            for (int m = 0; m < machines; m++)
            {
                var d = sim.AddDevice(DeviceKind.Scrubber, new Int3(2 + 2 * m, 2, 0), $"subject{m}");
                d.Condition = condition;
            }

            for (int u = 0; u < sealUnits; u++)
                sim.AddItem(ItemKind.Seals, 1, new Int3(1 + u, 3, 0));

            for (int c = 0; c < crew; c++)
                sim.AddCitizen($"crew{c}", new Int3(14 - c, 3, 0)).GiveAllWork();

            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        /// <summary>Every unit of every repair-ladder kind aboard, carried or on the ground. The
        /// SHIP'S STOCK, which is what "the ship was bankrupted" is a claim about.</summary>
        private static int ConsumableUnits(Simulation sim)
        {
            int n = 0;
            foreach (var s in sim.Items.Items)
                if (s.Kind == ItemKind.Parts || s.Kind == ItemKind.Seals || s.Kind == ItemKind.Swarf) n += s.Count;
            return n;
        }

        private static Device Machine(Simulation sim, int index)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == "subject" + index) return d;
            return null;
        }

        /// <summary>Drive, sampling EVERY tick: whether any crew member was ever bound to a
        /// <see cref="JobKind.Maintain"/> job, and the highest Condition machine 0 ever reached. A
        /// service that lands and is then eaten by wear is invisible to an end-state read.</summary>
        private static (bool everMaintained, float peak) Drive(Simulation sim, int ticks)
        {
            bool ever = false;
            float peak = Machine(sim, 0).Condition;
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                foreach (var c in sim.Citizens.Items) if (c.JobKind == JobKind.Maintain) ever = true;
                float now = Machine(sim, 0).Condition;
                if (now > peak) peak = now;
            }
            return (ever, peak);
        }

        /// <summary>How many machines this run actually lifted out of the needy band.</summary>
        private static int MachinesServiced(Simulation sim, int machines, float startCondition)
        {
            int n = 0;
            for (int m = 0; m < machines; m++) if (Machine(sim, m).Condition > startCondition + 0.05f) n++;
            return n;
        }

        // ═══════════════════════════════ 1. THE HEADLINE — the ship runs down TO the floor, not past it

        /// <summary>
        /// ⭐ <b>THE OUTCOME, DRIVEN: AUTONOMY SPENDS DOWN TO THE RESERVE AND STOPS.</b> Six wrecked
        /// machines, nine loose Seals, two crew with the whole work grid on and nobody ordering
        /// anything. The standing rule services five machines, spends five units, and leaves
        /// EXACTLY <see cref="MaintenanceSystem.AutonomousRepairReserve"/> on the deck with the
        /// sixth machine still wrecked.
        ///
        /// <para><b>THIS TEST IS ALSO THE NON-VACUITY CONTROL FOR THE WHOLE FILE.</b> Every pinned
        /// fixture in the repo boots with the work grid OFF (OD-H), so a reserve that did nothing
        /// would leave every determinism pin exactly where it is — "held by construction" proves
        /// nothing about this rule. The assertion that FIVE services actually completed and five
        /// units were actually consumed is the inclusion control: this fixture demonstrably DOES
        /// autonomous repair work, so the refusals in the tests below are refusals and not a fixture
        /// that could never have worked.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): delete the reserve line at the
        /// top of <c>FindNearestConsumable</c>. All nine units are spent, all six machines are
        /// serviced, and the ship holds nothing — which is finding D3 reproduced exactly.</para>
        /// </summary>
        [Test]
        public void AutonomousMaintenance_SpendsDownToTheReserveAndStops()
        {
            const int Machines = 6, Stock = 9;
            var sim = BuildBay(BelowTheWreckFloor, sealUnits: Stock, machines: Machines, crew: 2);
            Assert.That(ConsumableUnits(sim), Is.EqualTo(Stock), "fixture sanity: the stock is on the deck");

            Drive(sim, SpendDownTicks);

            int left = ConsumableUnits(sim);
            int serviced = MachinesServiced(sim, Machines, BelowTheWreckFloor);

            Assert.Multiple(() =>
            {
                Assert.That(left, Is.EqualTo(MaintenanceSystem.AutonomousRepairReserve),
                    "OUTCOME: the standing rule must leave the reserve untouched on the deck. " +
                    "Spending it is finding D3 — the run terminally stalls with no consumable left " +
                    "for the benches the player needs by hand.");
                Assert.That(Stock - left, Is.EqualTo(5),
                    "NON-VACUITY: five units must actually have been SPENT. Without this the " +
                    "assertion above also passes on a fixture where maintenance never ran at all.");
                Assert.That(serviced, Is.EqualTo(5),
                    "NON-VACUITY: and five machines must actually have been REPAIRED — the units " +
                    "left the store because services completed, not because a stack was deleted.");
                Assert.That(Machine(sim, Machines - 1).Condition, Is.LessThan(BelowTheWreckFloor + 0.01f),
                    "and the sixth machine must still be wrecked: there was nothing left the " +
                    "standing rule was allowed to spend on it.");
            });
        }

        // ══════════════════ 2. THE SCALE PIN — the floor is bracketed from BOTH sides, at 4 and 5

        /// <summary>
        /// <b>THE ABSOLUTE COUNT, BRACKETED — AND EVERY NUMBER HERE IS A LITERAL, ON PURPOSE.</b>
        /// The same one-machine fixture is driven at <b>5</b> loose units (the service must happen
        /// and must cost exactly one) and at <b>4</b> (nothing may be spent and nothing repaired).
        /// That pins the reserve into exactly [4, 5).
        ///
        /// <para>⛔ <b>THE FIRST DRAFT OF THIS TEST WAS A DEAD GUARD AND THE MUTATION TABLE FOUND
        /// IT.</b> It stocked <c>AutonomousRepairReserve + 1</c> and <c>AutonomousRepairReserve</c>,
        /// so both fixtures FOLLOWED the constant they claimed to pin: with the constant mutated to
        /// 3 and to 5 this test stayed <b>green both times</b> while its own doc comment promised it
        /// would redden. That is the fourth trap shape — a test that derives its expectation from
        /// the value under test cannot fail when that value changes. The literals below are the pin;
        /// <see cref="TheReserveConstantIsFour"/> ties them back to the constant so the two can
        /// never drift apart in silence.</para>
        ///
        /// <para>The machine is BELOW the wreck floor, so "refused" here means no service at all —
        /// the free jury-rig is not available to blur the reading.</para>
        ///
        /// <para><b>THE CREW WANDER, AND THAT IS LOAD-BEARING</b> — see
        /// <see cref="TheRecruitGateSeesTheReserveToo_OrAServicerIsClaimedForAFetchThatWillRefuse"/>.
        /// A settled crew member is recruited and released inside a single <c>Tick</c>, so the
        /// claim is invisible from outside and <c>everMaintained</c> would be a dead guard.</para>
        ///
        /// <para>NAMED MUTATIONS (applied, observed red, reverted): <c>AutonomousRepairReserve</c>
        /// to 3 ⇒ the four-unit leg is serviced and reddens; to 5 ⇒ the five-unit leg is refused
        /// and reddens.</para>
        /// </summary>
        [Test]
        public void TheReserveIsBracketedFromBothSides_FiveUnitsAreSpent_FourAreNot()
        {
            var above = BuildBay(BelowTheWreckFloor, sealUnits: 5);
            foreach (var c in above.Citizens.Items) c.AutoWander = true;
            var (aboveMaintained, abovePeak) = Drive(above, OneServiceTicks);
            int aboveLeft = ConsumableUnits(above);

            var at = BuildBay(BelowTheWreckFloor, sealUnits: 4);
            foreach (var c in at.Citizens.Items) c.AutoWander = true;
            var (atMaintained, atPeak) = Drive(at, OneServiceTicks);
            int atLeft = ConsumableUnits(at);

            Assert.Multiple(() =>
            {
                Assert.That(aboveMaintained, Is.True,
                    "UPPER BRACKET (5 units, a literal): the standing rule must still work. This " +
                    "leg is what a reserve that drifted UP would break.");
                Assert.That(abovePeak, Is.EqualTo(SimDefs.Default.Wear.SealServiceCondition).Within(1e-4f),
                    "UPPER BRACKET: and the repair must be a real SEALS service, not a jury-rig " +
                    "wearing its clothes.");
                Assert.That(aboveLeft, Is.EqualTo(4),
                    "UPPER BRACKET: exactly one unit spent — the run stops ON the floor.");

                Assert.That(atMaintained, Is.False,
                    "LOWER BRACKET (4 units, a literal): AT the floor no crew member may even be " +
                    "CLAIMED. This leg is what a reserve that drifted DOWN would break.");
                Assert.That(atPeak, Is.LessThan(BelowTheWreckFloor + 0.01f),
                    "LOWER BRACKET: and the machine must not heal.");
                Assert.That(atLeft, Is.EqualTo(4),
                    "LOWER BRACKET: and not one reserved unit may leave the deck.");
            });
        }

        /// <summary>
        /// <b>THE CONSTANT ITSELF, WRITTEN OUT BY HAND.</b> The bracket above is driven at the
        /// literals 5 and 4; this line is what ties those literals to
        /// <see cref="MaintenanceSystem.AutonomousRepairReserve"/>, so moving the constant reddens
        /// HERE with the reason stated, rather than leaving a suite of constant-relative fixtures
        /// that quietly re-measure themselves against the new value.
        ///
        /// <para>Four is not a taste: <c>AuthoredShips</c>'s WINNABILITY block prices the wreck's
        /// opening at three benches below the floor plus the MOSS terminal — <b>4 consumable
        /// services the player must be able to buy by hand</b>. Changing it is changing that
        /// arithmetic, and it belongs to the owner.</para>
        /// </summary>
        [Test]
        public void TheReserveConstantIsFour()
        {
            Assert.That(MaintenanceSystem.AutonomousRepairReserve, Is.EqualTo(4),
                "the reserve is the wreck's stated critical path — 3 benches + term_moss = 4 " +
                "consumable services. Moving it is an owner decision, not a tuning pass.");
        }

        // ══════════════════ 3. THE THREE SITES MUST AGREE — the livelock the package is built to avoid

        /// <summary>
        /// ⛔⛔ <b>THE LIVELOCK LEG. THE RESERVE MUST BE SEEN BY THE RECRUIT GATE AND BY
        /// <c>HasClaimableWork</c>, NOT ONLY BY THE FETCH.</b> This is M3-14's lesson in a second
        /// costume, and the mirror's own doc comment says what a missing condition costs: <i>"a
        /// silent multi-sim-hour stall for every pawn at or below the Repair band"</i>.
        ///
        /// <para><b>THE SHAPE OF THE FAILURE.</b> If only the fetch respected the reserve, then on a
        /// ship AT the floor <c>RecruitForNeediest</c> would still see a fixable machine, claim a
        /// crew member, and <c>DriveWorker</c> would refuse the fetch on arrival and abandon —
        /// re-offering the same machine every backoff window, forever. On a WANDERING crew member
        /// the damage is worse than churn: <c>DriveWorker</c> returns early while she
        /// <c>HasPath</c>, so she stays latched to <see cref="JobKind.Maintain"/> for the whole
        /// wander and is invisible to every other job source while she is.</para>
        ///
        /// <para><b>THE THREE SITES ARE (i) the recruit gate's <c>IsUnfixableWreck</c> ask, (ii) the
        /// fetch in <c>DriveWorker</c>, (iii) <c>HasClaimableWork</c>'s mirror.</b> All three funnel
        /// through <c>FindNearestConsumable</c>, so the shipped fix is ONE line in that funnel and
        /// the three cannot come apart. This test is what proves the funnel is really shared: leg 1
        /// watches a wandering crew member never be claimed (sites i + ii), leg 2 asks the mirror
        /// directly (site iii), and each has its own inclusion control one unit above the floor.</para>
        ///
        /// <para>⛔ <b>NAMED MUTATION (applied, observed red, reverted): the "patch only the fetch"
        /// lane.</b> Pass <c>forced: true</c> from <c>IsUnfixableWreck</c>'s call to
        /// <c>FindNearestConsumable</c> — the reserve then lives at the fetch alone. Both legs go
        /// red for the right reason: the mirror answers "there is repair work" and the wandering
        /// crew member IS claimed for a machine that is then abandoned unrepaired, which is the
        /// stall.</para>
        /// </summary>
        [Test]
        public void TheRecruitGateSeesTheReserveToo_OrAServicerIsClaimedForAFetchThatWillRefuse()
        {
            // ── LEG 1 (sites i + ii): a wandering crew member is never claimed at the floor. ──
            var at = BuildBay(BelowTheWreckFloor, sealUnits: MaintenanceSystem.AutonomousRepairReserve);
            foreach (var c in at.Citizens.Items) c.AutoWander = true;
            var (atClaimed, atPeak) = Drive(at, OneServiceTicks);

            var control = BuildBay(BelowTheWreckFloor, sealUnits: MaintenanceSystem.AutonomousRepairReserve + 1);
            foreach (var c in control.Citizens.Items) c.AutoWander = true;
            var (controlClaimed, _) = Drive(control, OneServiceTicks);

            // ── LEG 2 (site iii): the arbitration mirror, asked directly on an undriven ship. ──
            var mirrorAt = BuildBay(BelowTheWreckFloor, sealUnits: MaintenanceSystem.AutonomousRepairReserve);
            var mirrorAbove = BuildBay(BelowTheWreckFloor, sealUnits: MaintenanceSystem.AutonomousRepairReserve + 1);
            bool mirrorSaysWorkAtFloor = new MaintenanceSystem()
                .HasClaimableWork(mirrorAt, mirrorAt.Citizens.Items[0], WorkType.Repair, asIfIdle: false);
            bool mirrorSaysWorkAbove = new MaintenanceSystem()
                .HasClaimableWork(mirrorAbove, mirrorAbove.Citizens.Items[0], WorkType.Repair, asIfIdle: false);

            Assert.Multiple(() =>
            {
                Assert.That(atClaimed, Is.False,
                    "SITES i+ii: at the reserve floor a wandering crew member must NEVER be claimed " +
                    "for a machine the fetch is going to refuse. A claim here is the livelock: she " +
                    "walks, abandons, and is re-offered the same machine every backoff window.");
                Assert.That(atPeak, Is.LessThan(BelowTheWreckFloor + 0.01f),
                    "SITES i+ii: and the machine must stay wrecked — a claim that DID repair it " +
                    "would mean the fetch spent a reserved unit.");
                Assert.That(controlClaimed, Is.True,
                    "NON-VACUITY: one unit above the floor this same wandering fixture MUST produce " +
                    "an observable claim. Without it the assertion above pins nothing.");

                Assert.That(mirrorSaysWorkAtFloor, Is.False,
                    "SITE iii: HasClaimableWork must answer the same question the dispatcher does. " +
                    "An over-report here defers every pawn at or below the Repair band into work " +
                    "that will never be offered.");
                Assert.That(mirrorSaysWorkAbove, Is.True,
                    "NON-VACUITY: and it must say YES one unit above the floor, or it is answering " +
                    "'no' for some reason that has nothing to do with the reserve.");
            });
        }

        // ══════════════════ 4. THE FREE REPAIR IS STILL FREE — the band the reserve must not close

        /// <summary>
        /// <b>AT THE FLOOR, A MACHINE IN THE JURY-RIG BAND IS STILL REPAIRED — FOR FREE.</b> The
        /// reserve makes the autonomous path behave as though the ship held NOTHING, and on a ship
        /// holding nothing a machine inside <c>[wreck_threshold, maint)</c> is jury-rigged to
        /// <c>wear.jury_rig_condition</c>. So the reserve must cost the ship a paid overhaul, never
        /// the free patch: the crew do not down tools, they stop shopping.
        ///
        /// <para>Asserting the EXACT restore level is what separates the two: 0.6 is the jury-rig,
        /// 0.9 is a Seals service. An "it got repaired" assertion could not tell them apart, and a
        /// reserve that leaked would show up as 0.9 here with a unit missing.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): delete the reserve line at the
        /// top of <c>FindNearestConsumable</c> ⇒ the machine is serviced to 0.9 and a reserved unit
        /// is gone.</para>
        /// </summary>
        [Test]
        public void AtTheFloor_AMachineInTheJuryRigBand_IsStillPatchedForFree()
        {
            var sim = BuildBay(InTheJuryRigBand, sealUnits: MaintenanceSystem.AutonomousRepairReserve);
            var (everMaintained, peak) = Drive(sim, OneServiceTicks);

            Assert.Multiple(() =>
            {
                Assert.That(everMaintained, Is.True,
                    "PATH: the free repair band is not closed by the reserve — a rotted machine is " +
                    "still recruited for.");
                Assert.That(peak, Is.EqualTo(SimDefs.Default.Wear.JuryRigCondition).Within(1e-4f),
                    "OUTCOME: exactly wear.jury_rig_condition. 0.9 here would mean the standing " +
                    "rule spent a reserved unit; anything else is a changed economy.");
                Assert.That(ConsumableUnits(sim), Is.EqualTo(MaintenanceSystem.AutonomousRepairReserve),
                    "and the reserve is untouched — the repair was FREE.");
            });
        }

        // ══════════════════════════════ 5. THE ORDER STILL SPENDS — the other half of the decision

        /// <summary>
        /// ⭐ <b>A DIRECT ORDER SPENDS A RESERVED UNIT.</b> The reserve is a floor on AUTONOMY, not
        /// on the ship: the four units exist precisely so the player can put them into the three
        /// benches and the MOSS terminal by hand. On the identical fixture that
        /// <see cref="TheReserveIsBracketedFromBothSides_FiveUnitsAreSpent_FourAreNot"/> proves the
        /// standing rule refuses, one <c>PrioritiseJobCommand</c> gets the machine overhauled and
        /// the stock drops to three.
        ///
        /// <para>The machine is BELOW the wreck floor, which is the load-bearing choice: there is no
        /// free jury-rig available down here, so a Condition rise can ONLY have been paid for with a
        /// reserved unit. In the jury-rig band the same assertion would be satisfiable for free.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): drop the <c>forced</c> bypass by
        /// applying the reserve unconditionally in <c>FindNearestConsumable</c> (<c>if
        /// (!HasAutonomouslySpendableStock(sim)) return null;</c>) ⇒ <c>PrioritiseJobCommand</c>
        /// refuses the order at its <c>IsUnfixableWreck</c> gate, nothing is repaired, nothing is
        /// spent, and the run is stalled exactly as finding D3 describes.</para>
        /// </summary>
        [Test]
        public void ADirectOrder_StillSpendsAReservedUnit()
        {
            var sim = BuildBay(BelowTheWreckFloor, sealUnits: MaintenanceSystem.AutonomousRepairReserve);
            var who = sim.Citizens.Items[0];
            var machine = Machine(sim, 0);

            sim.EnqueueCommand(new PrioritiseJobCommand((int)who.Id, (int)machine.Id));
            var (everMaintained, peak) = Drive(sim, OneServiceTicks);

            Assert.Multiple(() =>
            {
                Assert.That(everMaintained, Is.True,
                    "PATH: the ordered servicer must actually be bound to the job the player gave her.");
                Assert.That(peak, Is.EqualTo(SimDefs.Default.Wear.SealServiceCondition).Within(1e-4f),
                    "OUTCOME: a real Seals service below the wreck floor, where no free repair " +
                    "exists — so the rise can only have been bought with a RESERVED unit.");
                Assert.That(ConsumableUnits(sim), Is.EqualTo(MaintenanceSystem.AutonomousRepairReserve - 1),
                    "and the ship is one unit poorer: the order reaches stock autonomy may not touch.");
            });
        }
    }
}
