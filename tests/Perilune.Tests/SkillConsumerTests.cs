using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Sim;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M3-7 — SKILL REACHES WORK. The package's whole claim, driven: two crew members, the same
    /// job, different competence ⇒ DIFFERENT COMPLETION TICKS.</b>
    ///
    /// <para>⚠️ <b>THIS FILE IS THE ONLY INSTRUMENT THE RATE CURVE HAS.</b> Said plainly because the
    /// determinism pins CANNOT see it: measured, not assumed — with EVERY crew member forced to skill
    /// 20 (a 2.24×–3.00× rate change) all three pinned runs are BIT-IDENTICAL with the rate seam live
    /// and with it stubbed out. No pinned fixture does any work at all, because under OD-H every work
    /// type boots off and no pinned run enqueues a command. That is M2-12's <i>"no pin sees the
    /// generation term"</i> wearing this package's clothes, and M2-17's lesson exactly: an unattended
    /// fixture does no work, so a held pin here is VACUOUSLY held. ⛔ <b>If a leg below is deleted,
    /// nothing anywhere replaces it.</b></para>
    ///
    /// <para><b>ONE LEG PER CONSUMER, NOT ONE PER PACKAGE</b> (the charter's mutation 2). There are
    /// FIVE places work progress accrues and the charter's census named four of them correctly:
    /// <c>DigJobSource</c> (Mine), <c>BuildJobSource</c> (Construct), <c>DeconstructJobSource</c>
    /// (Deconstruct — the charter said "DeconstructSystem", which is the site REGISTRY, not the
    /// accrual), <c>MaintenanceSystem</c> (Repair — the second class in <c>MachineWearSystem.cs</c>)
    /// and <c>CraftingSystem</c> (Craft). "JobWork" accrues nothing at all; it is a static helper.
    /// A SIXTH assignment site the charter did not name is <c>EffectValidator</c>'s LLM dig grant,
    /// covered below. ⚠️ AND <see cref="WorkType.Haul"/> HAS NO ACCRUAL SITE ANYWHERE — haul is pure
    /// travel plus an instantaneous pickup and drop — which is why its curve is flat and why that is
    /// pinned here rather than left to be discovered.</para>
    ///
    /// <para><b>ABSOLUTE, NOT RATIO.</b> Every rate leg asserts a tick count against an EXACT expected
    /// number, never merely "faster than". TRAPS, seventh shape: a suite built from ratios cannot see
    /// a 2× scale error — E0-9's whole gate went green with a figure that was 2× wrong, and
    /// <c>&gt; 0</c> could not catch it by construction.</para>
    /// </summary>
    [TestFixture]
    public class SkillConsumerTests
    {
        private static readonly WorkType[] All = (WorkType[])Enum.GetValues(typeof(WorkType));

        /// <summary>The maxed level every "skilled" leg below uses. Named so a change to
        /// <see cref="SkillLevel.Max"/> moves one line rather than twenty literals.</summary>
        private const byte Maxed = SkillLevel.Max;

        /// <summary>
        /// ⚠️ ±1 TICK, AND IT IS AN OBSERVATION ARTEFACT RATHER THAN A TOLERANCE ON THE CLAIM. The
        /// countdown may be primed on the very tick the drive loop first observes it (dig: the crew is
        /// already adjacent) or one tick earlier (build: the builder walks to the far side of the site
        /// and the first work tick fires on arrival), so the measured span is the budget or the budget
        /// minus one. MEASURED, not guessed — the build leg read 2399 against an exact 2400 and that is
        /// what put this constant here.
        ///
        /// <para>⛔ IT DOES NOT WEAKEN THE ABSOLUTE CLAIM, which is the whole point of asserting ticks
        /// rather than ratios (TRAPS, seventh shape): ±1 in 960 cannot hide a 2× scale error, and a
        /// one-sided "faster than untrained" — the assertion this file deliberately does NOT make —
        /// would pass at 100× as happily as at 2.50×.</para>
        /// </summary>
        private const int ObservationSlack = 1;

        // ═══════════════════════════════════════════════════════════════ the curve itself

        /// <summary>
        /// ⭐ <b>LEVEL 0 IS EXACTLY TODAY'S RATE — the identity, not approximately it.</b> This is the
        /// property that makes the package's P1/P2/P3 move provably FOLD-ONLY on a fleet that is
        /// entirely untrained, and it is the reason every pre-existing work-rate test in this repo
        /// (<c>WorkRateRetuneTests</c>, <c>DeconstructSystemTests</c>) still reads the def value
        /// unchanged.
        ///
        /// <para>NAMED MUTATION: make <c>WorkRates.BaseMilli</c> anything but <c>Unit</c> — every
        /// equality below fails, and so does half the existing suite, which is the point.</para>
        /// </summary>
        [Test]
        public void UntrainedRate_IsTheExactIdentity_ForEveryWorkType()
        {
            var c = LoneCitizen();
            foreach (var t in All)
            {
                Assert.That(WorkRates.RateMilliFor(c, t), Is.EqualTo(WorkRates.Unit),
                    t + ": an untrained crew member must work at exactly the pre-M3-7 rate");
                Assert.That(WorkRates.RateFor(c, t), Is.EqualTo(1f),
                    t + ": and the float form must be EXACTLY 1f — `x * 1f` is IEEE identity, which " +
                    "is what makes CraftingSystem's accrual bit-identical while the fleet is untrained");
                foreach (int baseTicks in new[] { 1, 7, 60, 1200, 2400, 6000, 9000 })
                    Assert.That(WorkRates.WorkTicksFor(c, t, baseTicks), Is.EqualTo(baseTicks),
                        t + ": " + baseTicks + " ticks of work must cost exactly " + baseTicks +
                        " ticks at level 0 — an off-by-one from rounding would move every pin for " +
                        "a reason nobody could account for");
            }
        }

        /// <summary>
        /// ⭐ <b>THE SIX CURVES ARE INDEPENDENT — a pawn skilled at ONE thing is faster at that thing
        /// AND UNCHANGED AT THE OTHER FIVE.</b>
        ///
        /// <para>⛔ THIS IS THE LEG THAT KILLS TWO MUTATIONS AT ONCE, and neither is caught by a
        /// per-consumer speed test: <b>(a)</b> "apply the curve to only one work type" and <b>(b)</b>
        /// a single global multiplier — the shape <c>rimworld-reference.md</c> §5.1 warns against in
        /// as many words (<i>"a single 'skill → work speed' multiplier is not the RimWorld model"</i>).
        /// Under (b) every leg that raises one skill would still show that work type speed up, because
        /// the multiplier would be reading the one number it was given; only asking about the OTHER
        /// five can tell the two designs apart. It is also the mechanical statement of OD-M item 8A:
        /// two pawns may now differ in SHAPE, not only in magnitude.</para>
        /// </summary>
        [Test]
        public void SkillIsPerWorkType_RaisingOneLeavesTheOtherFiveExactlyWhereTheyWere()
        {
            foreach (var raised in All)
            {
                var c = LoneCitizen();
                c.SetSkill(raised, Maxed);
                foreach (var other in All)
                {
                    int mine = WorkRates.RateMilliFor(c, other);
                    if (other == raised)
                    {
                        // Haul is the one type with a deliberately FLAT curve — there is no accrual
                        // anywhere for a rate to multiply. Stated, not silently excused.
                        if (raised == WorkType.Haul)
                            Assert.That(mine, Is.EqualTo(WorkRates.Unit),
                                "Haul's curve is flat BY DESIGN: haul accrues no work ticks anywhere " +
                                "in this sim (pure travel + an instantaneous pickup and drop), so a " +
                                "non-zero bonus would be a number that looked like a mechanic");
                        else
                            Assert.That(mine, Is.GreaterThan(WorkRates.Unit),
                                raised + " at level " + Maxed + " must actually be faster");
                    }
                    else
                    {
                        Assert.That(mine, Is.EqualTo(WorkRates.Unit),
                            "raising " + raised + " moved " + other + " — the curve is either " +
                            "applied to the wrong type or it is ONE GLOBAL MULTIPLIER, which §5.1 " +
                            "names as the wrong model and OD-M item 8A rejected");
                    }
                }
            }
        }

        /// <summary>The published span, asserted as ABSOLUTE milli-rates rather than as an ordering.
        /// A ratio-only suite cannot see a scale error (seventh trap), and these six numbers ARE the
        /// balance decision — if one moves, it should move here, deliberately, in one place.</summary>
        [Test]
        public void TheCurveConstants_AreTheOnesTheHeaderPublishes()
        {
            var expected = new (WorkType Type, int MilliAtMax)[]
            {
                (WorkType.Repair,      2240),
                (WorkType.Construct,   2500),
                (WorkType.Craft,       2500),
                (WorkType.Deconstruct, 2000),
                (WorkType.Mine,        3000),
                (WorkType.Haul,        1000),   // flat, and deliberately so — see above
            };
            var c = LoneCitizen();
            foreach (var t in All) c.SetSkill(t, Maxed);
            foreach (var (type, milli) in expected)
                Assert.That(WorkRates.RateMilliFor(c, type), Is.EqualTo(milli),
                    type + " at level " + Maxed + " must be " + (milli / 1000f).ToString("0.00",
                        System.Globalization.CultureInfo.InvariantCulture) + "× — this table IS the " +
                    "balance decision and WorkRates' header publishes exactly these numbers");
        }

        // ═══════════════════════════════════════════════════════ consumer 1 — Mine (DigJobSource)

        /// <summary>
        /// ⭐ DRIVEN, END TO END: two diggers, the same debris tile, different Mine levels ⇒ different
        /// COMPLETION TICKS. The map is a corridor with the debris orthogonally adjacent to the crew,
        /// so the measured span is the dig countdown alone and no travel is in it.
        ///
        /// <para>ABSOLUTE FLOOR: 6000 ticks untrained, 2000 at level 20 (3.00×). Not "faster" —
        /// the numbers, because a ratio suite cannot see a 2× scale error.</para>
        ///
        /// <para>NAMED MUTATION: drop the <c>WorkRates.WorkTicksFor</c> call in
        /// <c>DigJobSource.TryClaim</c> — both runs take 6000 and the skilled leg fails.</para>
        /// </summary>
        [Test]
        public void Mine_ADiggerWithSkillFinishesInFewerTicks_AndTheCountIsAbsolute()
        {
            long untrained = DriveDig(SkillLevel.Min);
            long skilled = DriveDig(Maxed);

            Assert.That(untrained, Is.EqualTo(DigJobSource.DigWorkTicks).Within(ObservationSlack),
                "an untrained digger must take exactly the unscaled budget");
            Assert.That(skilled, Is.EqualTo(2000).Within(ObservationSlack),
                "a level-20 digger must take exactly 6000 / 3.00 = 2000 ticks — Mine is the most " +
                "skill-sensitive work type, matching rimworld-reference.md §5.1's Mining Speed");
            Assert.That(skilled, Is.LessThan(untrained), "…and WHO dug it changed how long it took");
        }

        private static long DriveDig(byte mineSkill)
        {
            string[] map = { "#####", "#...#", "#####" };
            var sim = new Simulation(AsciiWorld.Build(map), 1,
                new ISimSystem[] { new CitizenSystem(), new JobSystem() });
            var digger = sim.AddCitizen("Digger", new Int3(1, 1, 0)).GiveAllWork();
            digger.SetSkill(WorkType.Mine, mineSkill);

            var debris = new Int3(2, 1, 0);   // orthogonally adjacent — no travel in the measurement
            sim.World.SetWall(debris, TileDefs.Debris);
            sim.World.SetFlag(debris, TileFlags.Designated, true);
            sim.JobsDirty = JobBoardDirty.All;

            int guard = 0;
            while (guard++ < 400 && !(digger.JobKind == JobKind.Dig && !digger.HasPath &&
                                      Int3.IsAdjacent4(digger.Pos, debris)))
                sim.Tick();
            Assert.That(digger.JobKind, Is.EqualTo(JobKind.Dig), "precondition: the dig really started");

            // The first work tick fires on the same tick the countdown is observed, so the primed
            // value plus the ticks that follow is the whole span. Asserted against the seam's own
            // arithmetic so a mis-scaled ASSIGNMENT is caught here and not only at the finish line.
            long primed = digger.JobWorkTicks;
            Assert.That(primed, Is.EqualTo(WorkRates.WorkTicksFor(digger, WorkType.Mine, DigJobSource.DigWorkTicks)),
                "the claim must price the dig through the seam, at the digger's OWN Mine level");

            long start = sim.TickCount;
            for (int t = 0; t < 20000 && sim.World.GetWall(debris) == TileDefs.Debris; t++) sim.Tick();
            Assert.That(sim.World.GetWall(debris), Is.EqualTo((ushort)0), "the debris was actually dug out");
            return sim.TickCount - start;
        }

        // ═══════════════════════════════════════════════════ consumer 2 — Construct (BuildJobSource)

        /// <summary>
        /// ⭐ DRIVEN: two builders, the same fully-materialed wall, different Construct levels.
        /// ABSOLUTE FLOOR: 2400 ticks untrained, 960 at level 20 (2.50×).
        ///
        /// <para>NAMED MUTATION: drop the seam call in <c>BuildJobSource.TryClaim</c> — the skilled
        /// leg reads 2400 and fails. ⚠️ A mutation that scaled the SITE's <c>b.WorkTicks</c> instead of
        /// the citizen's countdown would also fail, and should: the site's budget is def-frozen at
        /// designate so the player's queue does not silently re-price itself per claimant.</para>
        /// </summary>
        [Test]
        public void Construct_ABuilderWithSkillRaisesTheWallInFewerTicks_AndTheCountIsAbsolute()
        {
            long untrained = DriveBuild(SkillLevel.Min);
            long skilled = DriveBuild(Maxed);

            Assert.That(untrained, Is.EqualTo(SimDefs.Default.Build.WallConstructTicks).Within(ObservationSlack),
                "an untrained builder must take exactly wall_construct_ticks");
            Assert.That(skilled, Is.EqualTo(960).Within(ObservationSlack),
                "a level-20 builder must take exactly 2400 / 2.50 = 960 ticks");
            Assert.That(skilled, Is.LessThan(untrained));
        }

        private static long DriveBuild(byte constructSkill)
        {
            string[] map = { "#######", "#.....#", "#######" };
            var systems = SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));
            BuildSystem build = null;
            foreach (var s in systems) if (s is BuildSystem b) { build = b; break; }
            Assert.That(build, Is.Not.Null, "precondition: BuildSystem is registered");

            var sim = new Simulation(AsciiWorld.Build(map), 1,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), build });
            var builder = sim.AddCitizen("Builder", new Int3(2, 1, 0)).GiveAllWork();
            builder.SetSkill(WorkType.Construct, constructSkill);

            var site = new Int3(3, 1, 0);
            Assert.That(build.Designate(sim, site, BuildKind.Wall), Is.True);
            Assert.That(build.Deposit(sim, site, sim.Defs.Build.WallMaterial),
                Is.EqualTo(sim.Defs.Build.WallMaterial), "precondition: materialed up front — no haul in the span");

            int guard = 0;
            while (guard++ < 400 && !(builder.JobKind == JobKind.Build && !builder.HasPath)) sim.Tick();
            Assert.That(builder.JobKind, Is.EqualTo(JobKind.Build), "precondition: the build really started");

            long primed = builder.JobWorkTicks;
            Assert.That(primed, Is.EqualTo(WorkRates.WorkTicksFor(builder, WorkType.Construct,
                                                                  SimDefs.Default.Build.WallConstructTicks))
                                  .Within(ObservationSlack),
                "the claim must price the build through the seam, at the builder's OWN Construct level " +
                "(±1: the builder walks to the far side of the site, so the first work tick has already " +
                "fired by the time this loop can observe the countdown — measured, 2399 against 2400)");

            long start = sim.TickCount;
            for (int t = 0; t < 20000 && sim.World.GetWall(site) != TileDefs.Wall; t++) sim.Tick();
            Assert.That(sim.World.GetWall(site), Is.EqualTo(TileDefs.Wall), "the wall was actually raised");
            return sim.TickCount - start;
        }

        // ═════════════════════════════════════════════ consumer 3 — Deconstruct (DeconstructJobSource)

        /// <summary>
        /// ⭐ DRIVEN: two strippers, the same condemned wall, different Deconstruct levels.
        /// ABSOLUTE FLOOR: 1200 ticks untrained, 600 at level 20 (2.00× — the least skill-sensitive
        /// type, because taking a thing apart is mostly force and §5.1 has no deconstruction stat).
        ///
        /// <para>NAMED MUTATION: drop the seam call in <c>DeconstructJobSource.TryClaim</c>.</para>
        /// </summary>
        [Test]
        public void Deconstruct_AStripperWithSkillFinishesInFewerTicks_AndTheCountIsAbsolute()
        {
            long untrained = DriveStrip(SkillLevel.Min);
            long skilled = DriveStrip(Maxed);

            Assert.That(untrained, Is.EqualTo(SimDefs.Default.Deconstruct.WallWorkTicks).Within(ObservationSlack),
                "an untrained stripper must take exactly wall_work_ticks");
            Assert.That(skilled, Is.EqualTo(600).Within(ObservationSlack),
                "a level-20 stripper must take exactly 1200 / 2.00 = 600 ticks");
            Assert.That(skilled, Is.LessThan(untrained));
        }

        private static long DriveStrip(byte deconstructSkill)
        {
            string[] map = { "#######", "#.....#", "#######" };
            var strip = new DeconstructSystem();
            var sim = new Simulation(AsciiWorld.Build(map), 3,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), strip });
            var worker = sim.AddCitizen("Reyes", new Int3(2, 1, 0)).GiveAllWork();
            worker.SetSkill(WorkType.Deconstruct, deconstructSkill);

            var wall = new Int3(3, 1, 0);
            sim.World.SetWall(wall, TileDefs.Wall);
            sim.JobsDirty = JobBoardDirty.All;
            Assert.That(strip.Designate(sim, wall, DeconstructKind.Wall), Is.True);

            int guard = 0;
            while (guard++ < 400 && !(worker.JobKind == JobKind.Deconstruct && !worker.HasPath)) sim.Tick();
            Assert.That(worker.JobKind, Is.EqualTo(JobKind.Deconstruct), "precondition: the strip really started");

            long primed = worker.JobWorkTicks;
            Assert.That(primed, Is.EqualTo(WorkRates.WorkTicksFor(worker, WorkType.Deconstruct,
                                                                  SimDefs.Default.Deconstruct.WallWorkTicks)),
                "the claim must price the strip through the seam, at the stripper's OWN level");

            long start = sim.TickCount;
            for (int t = 0; t < 20000 && sim.World.GetWall(wall) == TileDefs.Wall; t++) sim.Tick();
            Assert.That(sim.World.GetWall(wall), Is.Not.EqualTo(TileDefs.Wall), "the wall really came down");
            return sim.TickCount - start;
        }

        // ═══════════════════════════════════════════════ consumer 4 — Repair (MaintenanceSystem)

        /// <summary>
        /// ⭐ DRIVEN: two servicers, the same needy scrubber, different Repair levels.
        ///
        /// <para>⛔ <b>BOTH ASSIGNMENT LEGS, SEPARATELY, AND THE FIRST DRAFT OF THIS TEST DROVE ONLY
        /// ONE.</b> <c>MaintenanceSystem</c> primes the countdown in TWO places — the JURY-RIG leg
        /// (settled, empty-handed, no consumable in the colony) and the PARTS-IN-HAND leg (a Parts
        /// stack was fetched and carried to the machine). They are selected by whether a consumable
        /// exists, so one fixture cannot enter both. Independent review reverted the parts-in-hand
        /// site to its pre-M3-7 form and <b>the whole 1744-test suite stayed GREEN</b> — a survivor,
        /// invisible because the fleet is level 0 and the seam is the identity there. This is now two
        /// drives, and <see cref="DriveService"/> ASSERTS WHICH LEG IT ENTERED
        /// (<c>CarryingItemId</c> is the discriminator) so neither can silently become the other.</para>
        ///
        /// <para>ABSOLUTE FLOOR: 9000 ticks untrained (<c>MaintenanceWorkSeconds</c> 900 × 10 Hz),
        /// 4018 at level 20 (2.24×, rounded half-up) — <b>on each leg independently</b>.</para>
        ///
        /// <para>NAMED MUTATIONS: revert EITHER seam call in <c>MaintenanceSystem</c>. The
        /// parts-in-hand revert reddens the parts legs only; the jury-rig revert reddens the
        /// empty-handed legs only. Both were applied and both went red.</para>
        /// </summary>
        [Test]
        public void Repair_AServicerWithSkillFinishesInFewerTicks_OnBOTHAssignmentLegs()
        {
            int expectedUntrained = SimDefs.Default.Wear.MaintenanceWorkSeconds * Simulation.TicksPerSecond;

            foreach (bool withParts in new[] { false, true })
            {
                string leg = withParts ? "PARTS-IN-HAND" : "JURY-RIG";
                int untrained = DriveService(SkillLevel.Min, withParts);
                int skilled = DriveService(Maxed, withParts);

                Assert.That(untrained, Is.EqualTo(expectedUntrained),
                    leg + ": an untrained servicer must be primed at exactly maintenance_work_s × 10");
                Assert.That(skilled, Is.EqualTo(4018),
                    leg + ": a level-20 servicer must be primed at exactly round(9000 / 2.24) = 4018 ticks");
                Assert.That(skilled, Is.LessThan(untrained), leg + ": …and WHO serviced it changed the span");
            }
        }

        /// <summary>
        /// Drive the sim to the moment a service actually begins and return the PRIMED countdown —
        /// the value <c>MaintenanceSystem</c> assigned through the seam.
        ///
        /// <para>⚠️ <paramref name="withParts"/> SELECTS THE ASSIGNMENT LEG, and the leg reached is
        /// ASSERTED rather than assumed: with a Parts stack aboard the servicer fetches it and the
        /// service begins with <c>CarryingItemId != 0</c>; with the colony empty she jury-rigs and it
        /// begins with <c>CarryingItemId == 0</c>. Without that assertion the two calls could quietly
        /// drive the same site twice, which is exactly how the parts-in-hand survivor hid.</para>
        /// </summary>
        private static int DriveService(byte repairSkill, bool withParts)
        {
            string[] map = { "#######", "#.....#", "#.....#", "#######" };
            var sim = new Simulation(AsciiWorld.Build(map), 7,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), new MaintenanceSystem() });
            var machine = sim.AddDevice(DeviceKind.Scrubber, new Int3(4, 1, 0), "scrubber");
            machine.Condition = 0.3f;
            Assert.That(machine.Condition, Is.LessThan(sim.Defs.Machines[(int)DeviceKind.Scrubber].MaintainBelow),
                "precondition: the machine must actually want service");
            Assert.That(machine.Condition, Is.GreaterThanOrEqualTo(sim.Defs.Wear.WreckThreshold),
                "precondition: at/above wreck_threshold, so an empty-handed service is legal and the " +
                "no-parts run reaches the JURY-RIG leg rather than being refused outright");

            sim.Rooms.RecomputeIfDirty(sim);
            var crew = sim.AddCitizen("Adeyemi", new Int3(1, 1, 0)).GiveAllWork();
            crew.SetSkill(WorkType.Repair, repairSkill);
            if (withParts) sim.AddItem(ItemKind.Parts, 1, new Int3(2, 2, 0));
            sim.JobsDirty = JobBoardDirty.All;

            int guard = 0;
            while (guard++ < 4000 && !(crew.JobKind == JobKind.Maintain && crew.JobWorkTicks > 0)) sim.Tick();
            Assert.That(crew.JobKind, Is.EqualTo(JobKind.Maintain), "precondition: the service really started");
            Assert.That(crew.JobWorkTicks, Is.GreaterThan(0), "precondition: the countdown is primed");

            // ⛔ WHICH LEG DID WE ACTUALLY ENTER? Asserted, because "both legs are covered" was the
            // false claim independent review caught.
            if (withParts)
                Assert.That(crew.CarryingItemId, Is.Not.EqualTo(0u),
                    "this run was supposed to reach the PARTS-IN-HAND assignment leg, and the servicer " +
                    "is carrying nothing — she jury-rigged instead, so this call is a duplicate of the " +
                    "other one and the parts site is UNTESTED");
            else
                Assert.That(crew.CarryingItemId, Is.EqualTo(0u),
                    "this run was supposed to reach the JURY-RIG leg and the servicer found a consumable");
            return crew.JobWorkTicks;
        }

        // ═══════════════════════════════════════════════ consumer 5 — Craft (CraftingSystem)

        /// <summary>
        /// ⭐ DRIVEN, END TO END: two crafters, the same recycler batch, different Craft levels ⇒ a
        /// batch that COMPLETES SOONER. Measured by when the output stack appears, not by reading
        /// <c>Device.Progress</c> back.
        ///
        /// <para>⚠️ CRAFT IS THE ONE CONSUMER SCALED AT THE ACCRUAL RATHER THAN AT THE ASSIGNMENT, and
        /// the asymmetry is forced by the accumulator: <c>station.Progress</c> lives on the DEVICE and
        /// survives a worker being pulled off mid-batch, so a fresh recruit at a different competence
        /// must contribute at HER rate to the remainder. <c>worker.JobWorkTicks</c> is only a phase
        /// marker here and is never decremented. Scaling the assignment would price the whole batch at
        /// whoever touched it first — this leg is what would catch that mistake being made.</para>
        ///
        /// <para>ABSOLUTE FLOOR: the skilled batch must finish in at most 45 % of the untrained span
        /// AND strictly more than 35 % — a 2.50× rate with a 1 Hz pass grid and a fixed travel prefix
        /// cannot land outside that window, and a two-sided bound is what a scale error cannot slip
        /// through (a one-sided "&lt; untrained" would pass at 100× as happily as at 2.5×).</para>
        ///
        /// <para>NAMED MUTATION: revert <c>CraftingSystem</c>'s accrual to <c>1f / recipe.WorkSeconds</c>
        /// — the two spans become equal and both bounds fail.</para>
        /// </summary>
        [Test]
        public void Craft_ACrafterWithSkillFillsTheBatchSooner_AndTheSpanIsBounded()
        {
            long untrained = DriveBatch(SkillLevel.Min);
            long skilled = DriveBatch(Maxed);

            Assert.That(untrained, Is.GreaterThan(0), "precondition: the untrained batch really completed");
            Assert.That(skilled, Is.LessThan(untrained * 45 / 100),
                $"a level-20 crafter works at 2.50×, so the batch must land well under half the " +
                $"untrained span (untrained {untrained}, skilled {skilled})");
            Assert.That(skilled, Is.GreaterThan(untrained * 35 / 100),
                $"…and NOT arbitrarily sooner — a two-sided bound is what a scale error cannot slip " +
                $"through (untrained {untrained}, skilled {skilled})");
        }

        private static long DriveBatch(byte craftSkill)
        {
            // One room, x=1..8, y=1..3 — worker and bench connected.
            string[] map = { "##########", "#........#", "#........#", "#........#", "##########" };
            var sim = new Simulation(AsciiWorld.Build(map), 11,
                new ISimSystem[] { new CitizenSystem(), new JobSystem(), new CraftingSystem() });
            var station = sim.AddDevice(DeviceKind.SalvageRecycler, new Int3(7, 2, 0), "recycler");
            Assert.That(station.Powered && station.IsOperational(sim.Defs), Is.True,
                "precondition: no PowerSystem in this stack, so the bench is live from the start");

            Assert.That(ProductionDefs.TryGetBill(SimDefs.Default, DeviceKind.SalvageRecycler, out var bill),
                Is.True, "precondition: the SalvageRecycler must still have a bill");

            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();
            pawn.SetSkill(WorkType.Craft, craftSkill);
            sim.AddItem(ItemKind.Regolith, bill.Input(0).Count, new Int3(2, 1, 0));

            long start = sim.TickCount;
            for (int t = 0; t < 60000; t++)
            {
                sim.Tick();
                int scrap = 0;
                foreach (var it in sim.Items.Items) if (it.Kind == ItemKind.Scrap) scrap += it.Count;
                if (scrap > 0) return sim.TickCount - start;
            }
            Assert.Fail("the batch never completed — this fixture measures nothing");
            return 0;
        }

        // ═══════════════════════════════════ consumer 6 — the LLM dig grant (EffectValidator)

        /// <summary>
        /// ⭐ <b>THE SIXTH ASSIGNMENT SITE, WHICH THE CHARTER'S CENSUS DID NOT NAME — DRIVEN THROUGH
        /// <c>EffectValidator.TryApply</c>.</b> A dig granted through the LLM effect path must cost
        /// the same as a dig the dispatcher hands out, or a crew member could be TALKED INTO a job
        /// that ignored how good she is at it.
        ///
        /// <para>⚠️ <b>THE FIRST DRAFT OF THIS TEST WAS A PROPERTY OF <c>WorkRates</c>, NOT OF
        /// <c>EffectValidator</c>, AND IT WAS A SURVIVOR.</b> Independent review reverted
        /// <c>EffectValidator</c>'s assignment to <c>JobSystem.DigWorkTicks</c> and the whole
        /// 1744-test suite stayed GREEN — the leg asserted arithmetic the seam does on its own, which
        /// is true whether or not anyone calls it, and its doc comment claimed a "call-site guard
        /// below" that did not exist. This drives the REAL effect pipeline
        /// (<c>TryApply</c> → <c>ApplyAgreeTask</c>) and reads the countdown off the citizen
        /// afterwards, so the value is recorded where the API was actually called (TRAPS 4) and
        /// never scanned out of the source.</para>
        ///
        /// <para>ABSOLUTE: 6000 ticks untrained, 2000 at level 20 — the same two numbers the
        /// dispatcher's own leg asserts, which is the point of the site existing at all.</para>
        /// </summary>
        [Test]
        public void LlmDigGrant_PricesADigAtTheGranteesOwnSkill_Driven()
        {
            Assert.That(JobSystem.DigWorkTicks, Is.EqualTo(DigJobSource.DigWorkTicks),
                "precondition: both sites start from the same unskilled constant");

            int untrained = DriveLlmDigGrant(SkillLevel.Min);
            int skilled = DriveLlmDigGrant(Maxed);

            Assert.That(untrained, Is.EqualTo(JobSystem.DigWorkTicks),
                "an untrained grantee must be primed at exactly the unscaled budget");
            Assert.That(skilled, Is.EqualTo(2000),
                "a level-20 grantee must be primed at exactly 6000 / 3.00 = 2000 ticks — the SAME " +
                "price DigJobSource gives her, which is the whole reason this site is scaled");
            Assert.That(skilled, Is.LessThan(untrained));
        }

        /// <summary>Drive a real <c>AgreeTask</c> through <c>EffectValidator.TryApply</c> and return
        /// the countdown the grant wrote. ⚠️ The grant is asserted to have been ACCEPTED — a refused
        /// effect leaves <c>JobWorkTicks</c> at 0 and would make the reads below meaningless.</summary>
        private static int DriveLlmDigGrant(byte mineSkill)
        {
            string[] map = { "##########", "#........#", "#........#", "#........#", "##########" };
            var sim = new Simulation(AsciiWorld.Build(map), 11, new ISimSystem[] { new CitizenSystem() });

            var target = new Int3(5, 2, 0);
            sim.World.SetWall(target, TileDefs.Debris);
            sim.World.SetFlag(target, TileFlags.Designated, true);

            var pawn = sim.AddCitizen("Rell", new Int3(2, 2, 0)).GiveAllWork();
            pawn.SetSkill(WorkType.Mine, mineSkill);
            Assert.That(pawn.CanTakeWorkType(WorkType.Mine), Is.True,
                "precondition: the grid permits Mine, so the grid veto is not what this leg measures");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.None), "precondition: off-job");

            var minds = new MindState();
            minds.Minds.GetOrCreate(pawn.Id);
            var facts = new FactRegistry();
            var validator = new EffectValidator();

            Assert.That(validator.TryApply(sim, minds, facts, new AgreeTask(pawn.Id, JobKind.Dig, target)),
                Is.True, "precondition: the grant must be ACCEPTED — a refusal writes no countdown " +
                         "at all and every assertion downstream would pass on a zero");
            Assert.That(pawn.JobKind, Is.EqualTo(JobKind.Dig), "precondition: the grant really landed a dig");
            return pawn.JobWorkTicks;
        }

        // ═════════════════════════════════════════════════════ RW §5.2 — skill never gates WHETHER

        /// <summary>
        /// ⛔ <b>rimworld-reference.md §5.2: "Skill never gates WHETHER, only HOW WELL."</b> A crew
        /// member at level 0 in every work type still TAKES the job — she is untrained, not unable.
        /// DRIVEN: the untrained digger in <see cref="DriveDig"/> claims and completes; here the claim
        /// itself is asserted against the predicate that decides it.
        ///
        /// <para>NAMED MUTATION: add <c>&amp;&amp; GetSkill(type) &gt; 0</c> to
        /// <c>Citizen.CanTakeWorkType</c> — every leg here fails, and so does most of the suite, which
        /// is the correct blast radius for a change that would silently make half a crew useless.</para>
        /// </summary>
        [Test]
        public void SkillZero_StillTakesTheJob_ForEveryWorkType()
        {
            var c = LoneCitizen().GiveAllWork();
            foreach (var t in All)
            {
                Assert.That(c.GetSkill(t), Is.EqualTo(SkillLevel.Min), "precondition: untrained at " + t);
                Assert.That(c.CanTakeWorkType(t), Is.True,
                    "§5.2: a level-0 crew member must still be allowed to do " + t + " — 0 is " +
                    "UNTRAINED, never UNABLE. The only two refusals are the player's grid and " +
                    "Citizen.WorkIncapable, and skill is neither");
            }
        }

        /// <summary>
        /// ⭐ THE STRUCTURAL HALF OF §5.2, so the rule cannot come back by a later lane's side door:
        /// <b>the capability predicate's own source must not consult a skill.</b> Scanned CODE-ONLY
        /// through the shipped stripper, because a doc comment naming skill is documentation (this
        /// package's own header does exactly that, two lines above the predicate).
        ///
        /// <para>NON-VACUITY BY INCLUSION, not by population count (§13.4): a planted call is required
        /// to be CAUGHT and a planted COMMENT is required NOT to be.</para>
        /// </summary>
        [Test]
        public void TheCapabilityPredicate_DoesNotConsultASkill()
        {
            string body = CanTakeWorkTypeBody(File.ReadAllText(CitizenSourcePath()));
            foreach (var needle in new[] { "GetSkill", "SkillsRaw", "WorkRates" })
                Assert.That(body, Does.Not.Contain(needle),
                    "CanTakeWorkType reads " + needle + " — §5.2 forbids skill from gating WHETHER, " +
                    "and the two refusals it may make are the player's grid and WorkIncapable");

            // INCLUSION CONTROL: the extractor really can see a violation planted in the body…
            Assert.That(CanTakeWorkTypeBody(
                    "public bool CanTakeWorkType(WorkType type) =>\n    GetSkill(type) > 0;\n\npublic void Next() { }"),
                Does.Contain("GetSkill"),
                "CONTROL: the extractor cannot see a planted violation, so its silence above means nothing");
            // …and the assertion above is scanning a body that is genuinely non-empty.
            Assert.That(body.Length, Is.GreaterThan(20),
                "CONTROL: the extracted body is empty — a scan of nothing passes trivially");
        }

        /// <summary>
        /// ⭐ THE ONE-SEAM LEDGER. Only <c>WorkRates.cs</c> and <c>Citizen.cs</c> may name a skill
        /// inside <c>sim/</c>; every consumer reaches competence THROUGH the seam and never touches a
        /// level. That is what <c>ArchitectureBoundaryTests</c>' <c>Skill</c> row asks for in as many
        /// words (<i>"E2/M3-7 crosses this via ONE seam"</i>) — and it is why that row needed no
        /// carve-out for this package: all five consumers are ECONOMY files, and not one of them
        /// contains the substring.
        ///
        /// <para>⛔ A LEDGER THAT ONLY ENROLS. A new reader is a decision, added here by name with a
        /// reason, not a diff nobody read.</para>
        /// </summary>
        [Test]
        public void OnlyTheSeamAndTheStorageMayNameASkill()
        {
            var enrolled = new HashSet<string>(StringComparer.Ordinal)
            {
                "sim/Sim.Core/Entities/WorkRates.cs",   // THE SEAM — the only file that reads a level
                "sim/Sim.Core/Entities/Citizen.cs",     // THE STORAGE — SkillsRaw, GetSkill, SetSkill, SkillLevel
                "sim/Sim.Core/Save/SaveWriter.cs",      // the CITZ v9 chapter writes the array
                "sim/Sim.Core/Save/SaveReader.cs",      // …and reads it, with the v8 migration
                "sim/Sim.Core/Simulation.cs",           // the state-hash fold walks it
                // ⭐⭐ M3-8 — THE AUTHOR. The first file in the game that WRITES a skill: seven
                // literal rows, one per wreck sleeper, stamped on by `CryoSystem.Open` when a
                // capsule opens. It names `SetSkill` (the storage's own writer) and nothing else —
                // it never reads a level, never computes a rate and never touches `WorkRates`, so
                // the one-seam claim above is untouched: competence still reaches WORK through
                // WorkRates alone. This file is where competence reaches the PERSON.
                "sim/Sim.Core/SleeperAptitudes.cs",
            };

            var offenders = new List<string>();
            bool sawEnrolled = false;
            foreach (var abs in Directory.GetFiles(Path.Combine(RepoRoot(), "sim"), "*.cs", SearchOption.AllDirectories))
            {
                string rel = abs.Substring(RepoRoot().Length + 1).Replace('\\', '/');
                string code = SurfaceBoundaryTests.CodeOnly(File.ReadAllText(abs));
                if (!code.Contains("Skill")) continue;
                if (enrolled.Contains(rel)) { sawEnrolled = true; continue; }
                offenders.Add(rel);
            }

            Assert.That(sawEnrolled, Is.True,
                "NON-VACUITY: not one enrolled file was seen to name a skill in CODE — the scan or " +
                "the comment stripper is broken and this ledger is guarding nothing");
            Assert.That(offenders, Is.Empty,
                "a file outside the ledger reads a skill directly. Competence reaches work through " +
                "WorkRates and nowhere else — that is what keeps ArchitectureBoundaryTests' `Skill` " +
                "row holding with no carve-out. If the crossing is deliberate, enrol it here BY NAME " +
                "with a one-line reason, in the same commit: " + string.Join(", ", offenders));
        }

        // ═══════════════════════════════════════════════════ the curve is a RULE, not a tunable

        /// <summary>
        /// ⭐ THE PIN-SCOPE LEG (mutation 8): <b>the curve is not a def field, so the defs checksums
        /// P4/P5 are not in this row.</b> Asserted two ways — no shipped <c>.def</c> line mentions a
        /// skill, and no <c>SimDefs</c> member does either. ⚠️ The <c>.def</c> half alone would be
        /// satisfied by a compiled default with no parser key, which is exactly how a def field ships
        /// half-built.
        ///
        /// <para>NON-VACUITY: the def corpus really was read and really is non-empty.</para>
        /// </summary>
        [Test]
        public void TheSkillCurve_IsNotADefField()
        {
            var defFiles = Directory.GetFiles(Path.Combine(RepoRoot(), "content", "core"), "*.def",
                                              SearchOption.AllDirectories);
            Assert.That(defFiles.Length, Is.GreaterThan(0), "NON-VACUITY: no .def files were found at all");
            int totalLines = 0;
            foreach (var f in defFiles)
            {
                var lines = File.ReadAllLines(f);
                totalLines += lines.Length;
                for (int i = 0; i < lines.Length; i++)
                    Assert.That(lines[i].IndexOf("skill", StringComparison.OrdinalIgnoreCase), Is.LessThan(0),
                        Path.GetFileName(f) + ":" + (i + 1) + " mentions a skill. M3-7's curve is a " +
                        "RULE, not a tunable (M2-1's precedent), and shipping it as a def field would " +
                        "pull the defaults checksum P4 and the rules-inclusive checksum P5 into this " +
                        "pin row: " + lines[i]);
            }
            Assert.That(totalLines, Is.GreaterThan(50), "NON-VACUITY: the def corpus scanned is implausibly small");

            foreach (var member in DefsMemberNames(typeof(SimDefs), new HashSet<Type>(), 0))
                Assert.That(member.IndexOf("skill", StringComparison.OrdinalIgnoreCase), Is.LessThan(0),
                    "SimDefs exposes `" + member + "` — the curve must not be reachable through the " +
                    "defs graph at all, or P4 moves the next time anyone edits it");
        }

        // ══════════════════════════════════════════════════════════════════════ helpers

        private static Citizen LoneCitizen()
        {
            string[] map = { "###", "#.#", "###" };
            var sim = new Simulation(AsciiWorld.Build(map), 1, Array.Empty<ISimSystem>());
            return sim.AddCitizen("Vale", new Int3(1, 1, 0));
        }

        private static string _repoRoot;
        private static string RepoRoot()
        {
            if (_repoRoot != null) return _repoRoot;
            var dir = new DirectoryInfo(TestContext.CurrentContext.TestDirectory);
            while (dir != null && !File.Exists(Path.Combine(dir.FullName, "Perilune.sln"))) dir = dir.Parent;
            Assert.That(dir, Is.Not.Null, "could not locate the repo root (Perilune.sln)");
            return _repoRoot = dir.FullName;
        }

        private static string CitizenSourcePath() =>
            Path.Combine(RepoRoot(), "sim", "Sim.Core", "Entities", "Citizen.cs");

        /// <summary>The source text of <c>CanTakeWorkType</c>'s expression body — from its signature to
        /// the terminating semicolon. Comment-free (the caller strips first is NOT assumed: this
        /// strips itself, so the extractor is testable in isolation by the inclusion control).</summary>
        private static string CanTakeWorkTypeBody(string source)
        {
            string code = SurfaceBoundaryTests.CodeOnly(source);
            int at = code.IndexOf("bool CanTakeWorkType(", StringComparison.Ordinal);
            if (at < 0) return "";
            int end = code.IndexOf(';', at);
            return end < 0 ? code.Substring(at) : code.Substring(at, end - at + 1);
        }

        /// <summary>Every public field/property name reachable in the <see cref="SimDefs"/> graph,
        /// depth-limited and cycle-guarded.</summary>
        private static IEnumerable<string> DefsMemberNames(Type t, HashSet<Type> seen, int depth)
        {
            if (depth > 4 || t == null || t.IsPrimitive || t == typeof(string) || !seen.Add(t)) yield break;
            foreach (var f in t.GetFields())
            {
                yield return f.Name;
                foreach (var n in DefsMemberNames(f.FieldType, seen, depth + 1)) yield return n;
            }
            foreach (var p in t.GetProperties())
            {
                yield return p.Name;
                foreach (var n in DefsMemberNames(p.PropertyType, seen, depth + 1)) yield return n;
            }
        }
    }
}
