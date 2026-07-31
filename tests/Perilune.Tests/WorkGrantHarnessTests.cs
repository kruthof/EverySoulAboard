using System;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tools;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>M2-17 — THE OCCUPANCY HARNESS'S WORK GRANT, AND THE CHECK THAT SAYS WHETHER ITS
    /// NUMBERS MAY BE QUOTED.</b>
    ///
    /// <para><b>THE PROBLEM THIS PACKAGE EXISTS FOR, IN ONE LINE.</b> OD-H/OD-I make every work type
    /// boot <c>Off</c> on every ship including the measurement fixtures, so from M2-2 onward an
    /// unattended <c>occupancy</c> run measures a ship where nobody works. <c>A1 = 0.000 %</c> is
    /// therefore BOTH the correct output of a correctly-working game AND the signature of a harness
    /// that measured nothing — and <c>0.000 %</c> on <c>--ship grid</c> was already the measured
    /// post-E0 result, so the two causes are confusable by construction.</para>
    ///
    /// <para>⛔ <b>WHAT IS PINNED HERE, AND WHY IT IS EXACTLY THESE THREE THINGS.</b></para>
    /// <list type="number">
    ///   <item><b>The grant reaches the sim THROUGH THE COMMAND.</b> Driven, not scanned: a real
    ///     <see cref="Simulation"/> is ticked and the grid is read back off
    ///     <see cref="Citizen.GetWorkPriority"/>. ⚠️ This is the leg that separates this harness from
    ///     <c>WorkGridTestSupport.GiveAllCrewAllWork</c>, which sets the citizen directly — legitimate
    ///     inside a unit test, and forbidden in a measurement host, because OD-I's rule is "one rule,
    ///     off everywhere, no authored exception" and a host reaching past
    ///     <see cref="SetWorkPriorityCommand"/> would be that exception.</item>
    ///   <item><b><see cref="WorkGrantHarness.Verify"/> CATCHES a grant that did not land.</b> An
    ///     INCLUSION test: it is handed a sim whose grid was deliberately knocked out of agreement
    ///     with the request, and must name the citizen and the work type.</item>
    ///   <item><b><see cref="WorkGrantHarness.Judge"/> refuses a vacuous zero.</b> The rule is
    ///     "granted a grid AND zero productive ticks ⇒ do not believe this run", and its three cases
    ///     are pinned individually — including the one that must NOT fire, because a check that
    ///     fires on everything is not a check.</item>
    /// </list>
    ///
    /// <para>⚠️ <b>NO TEST HERE ASSERTS A MEASUREMENT.</b> The re-baseline numbers are recorded in
    /// <c>docs/MECHANICS.md</c> §13.26 and are deliberately NOT pinned by a test: A1 is a regression
    /// statistic under OD-B that may be reported and never optimised toward, and a test asserting an
    /// A1 floor would be exactly the "package justified by an A1 number" the charter forbids.</para>
    /// </summary>
    [TestFixture]
    public class WorkGrantHarnessTests
    {
        private static Simulation SliceSim() =>
            GenSimHost.Build(AuthoredShips.PeriluneSlice(), SimDefs.Default).Sim;

        // ------------------------------------------------------------------ 1. the grant lands

        /// <summary>
        /// THE OUTCOME TEST. Boot a fixture ship (every work type off, per OD-I), grant a grid the
        /// way the harness does — <see cref="SetWorkPriorityCommand"/> on the sim's inbox — tick once
        /// so the command phase drains, and read the grid back off the citizens.
        ///
        /// <para>MUTATION 1 (applied, red, reverted): make <see cref="WorkGrantHarness.Grant"/>
        /// enqueue nothing ⇒ this leg reddens on the boot-state assertion's opposite, because the
        /// read-back is still all-<c>Off</c>.</para>
        /// </summary>
        [Test]
        public void Grant_ReachesTheSim_ThroughTheCommand_AndTheGridReadsBack()
        {
            var sim = SliceSim();

            // The precondition OD-I guarantees, asserted rather than assumed: without it, a green
            // read-back below could mean "the grant worked" or "the ship was already all-on".
            foreach (var c in sim.Citizens.Items)
                for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                    Assert.That(c.GetWorkPriority((WorkType)t), Is.EqualTo(WorkPriority.Off),
                        "OD-I: every fixture ship boots with every work type off");

            Assert.That(WorkGrantHarness.TryParseSpec("all", out var grid, out var err), Is.True, err);
            int enqueued = WorkGrantHarness.Grant(sim, grid);
            Assert.That(enqueued, Is.EqualTo(sim.Citizens.Items.Count * WorkPriority.WorkTypeCount),
                "all six cells are written per living crew member, the Off ones included");

            // Nothing has happened yet — commands drain at the TOP of Simulation.Tick. Asserting the
            // BEFORE state is what makes the AFTER state evidence about the command rather than about
            // the harness having reached into the citizen store.
            Assert.That(sim.Citizens.Items[0].GetWorkPriority(WorkType.Repair),
                Is.EqualTo(WorkPriority.Off), "the grant must not apply before a tick");

            sim.Tick();

            Assert.That(WorkGrantHarness.Verify(sim, grid, out string mismatch), Is.True, mismatch);
            foreach (var c in sim.Citizens.Items)
                for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                    Assert.That(c.GetWorkPriority((WorkType)t),
                        Is.EqualTo(WorkGrantHarness.DefaultGrantPriority));
            Assert.That(WorkGrantHarness.AnyCrewHasAnyWork(sim), Is.True);
        }

        /// <summary>A per-type spec grants exactly what it names and explicitly writes Off everywhere
        /// else — so a leg's grid is never a function of <see cref="WorkPriority.Default"/>.</summary>
        [Test]
        public void Grant_PerTypeSpec_WritesTheOffCellsToo()
        {
            var sim = SliceSim();
            Assert.That(WorkGrantHarness.TryParseSpec("Repair@1,Haul@4", out var grid, out var err), Is.True, err);
            WorkGrantHarness.Grant(sim, grid);
            sim.Tick();

            var c = sim.Citizens.Items[0];
            Assert.That(c.GetWorkPriority(WorkType.Repair), Is.EqualTo(WorkPriority.Highest));
            Assert.That(c.GetWorkPriority(WorkType.Haul), Is.EqualTo(WorkPriority.Lowest));
            Assert.That(c.GetWorkPriority(WorkType.Craft), Is.EqualTo(WorkPriority.Off));
            Assert.That(c.CanTakeWorkType(WorkType.Repair), Is.True);
            Assert.That(c.CanTakeWorkType(WorkType.Craft), Is.False);
        }

        // ------------------------------------------------ 2. the read-back catches a lost grant

        /// <summary>
        /// ⛔ THE INCLUSION LEG FOR GRANT INTEGRITY. A grant that never reached the sim, or was
        /// re-zeroed after it did, must be REPORTED — not silently measured. The fixture produces the
        /// disagreement directly (one cell knocked back to Off after the tick), which is the state a
        /// dropped command, a wrong citizen id and a re-zeroing writer all leave behind.
        ///
        /// <para>⚠️ It asserts the MESSAGE names the citizen AND the work type, because "verify
        /// returned false" is not actionable and a harness that only says "something is wrong" gets
        /// its check disabled the first time it fires.</para>
        /// </summary>
        [Test]
        public void Verify_CatchesAGrantThatDidNotLand_AndNamesIt()
        {
            var sim = SliceSim();
            WorkGrantHarness.TryParseSpec("all", out var grid, out _);
            WorkGrantHarness.Grant(sim, grid);
            sim.Tick();
            Assert.That(WorkGrantHarness.Verify(sim, grid, out _), Is.True, "control: the grant landed");

            var victim = sim.Citizens.Items[0];
            victim.SetWorkPriority(WorkType.Craft, WorkPriority.Off);

            Assert.That(WorkGrantHarness.Verify(sim, grid, out string mismatch), Is.False);
            Assert.That(mismatch, Does.Contain("Craft"));
            Assert.That(mismatch, Does.Contain(victim.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        }

        /// <summary>The read-back is a read of the SIM, never a re-print of the spec: with no grant
        /// at all the compact line says ALL OFF, and that string is what has to travel beside a
        /// <c>0.000 %</c> so a reader can tell the boot state from a broken instrument.</summary>
        [Test]
        public void FormatCompact_SaysAllOffAtBoot_AndNamesTheGridAfterAGrant()
        {
            var sim = SliceSim();
            Assert.That(WorkGrantHarness.FormatCompact(sim), Does.Contain("ALL OFF"));

            WorkGrantHarness.TryParseSpec("Repair@1", out var grid, out _);
            WorkGrantHarness.Grant(sim, grid);
            sim.Tick();

            string compact = WorkGrantHarness.FormatCompact(sim);
            Assert.That(compact, Does.Contain("Repair@1"));
            Assert.That(compact, Does.Not.Contain("ALL OFF"));
            Assert.That(compact, Does.Not.Contain("Haul@"), "a type left off must not be printed as granted");
        }

        // ------------------------------------------------------- 3. the non-vacuity rule itself

        /// <summary>
        /// ⛔⛔ THE NON-VACUITY RULE, ALL THREE CASES — including the one that must NOT fire.
        /// A check that reddens on every run cannot distinguish anything, and the case that most
        /// needs stating is the FIRST row: with no grant, zero productive ticks is the shipped
        /// default's own correct output and says nothing about the instrument.
        /// </summary>
        [TestCase(false, 0L, WorkGrantHarness.Vacuity.NotApplicable)]
        [TestCase(false, 5L, WorkGrantHarness.Vacuity.NotApplicable)]
        [TestCase(true, 0L, WorkGrantHarness.Vacuity.Fail)]
        [TestCase(true, 1L, WorkGrantHarness.Vacuity.Pass)]
        public void Judge_RefusesAZeroOnlyWhenAGridWasGranted(bool granted, long productive,
                                                              WorkGrantHarness.Vacuity expected)
        {
            Assert.That(WorkGrantHarness.Judge(granted, productive), Is.EqualTo(expected));
        }

        // ------------------------------------------------------------------ 4. the spec grammar

        [Test]
        public void ParseSpec_NoFlagAndNone_AreNotGrants()
        {
            Assert.That(WorkGrantHarness.TryParseSpec(null, out var a, out _), Is.True);
            Assert.That(a, Is.Null);
            Assert.That(WorkGrantHarness.TryParseSpec("none", out var b, out _), Is.True);
            Assert.That(b, Is.Null);
            Assert.That(WorkGrantHarness.TryParseSpec("OFF", out var c, out _), Is.True);
            Assert.That(c, Is.Null, "case-insensitive, InvariantCulture");
        }

        [Test]
        public void ParseSpec_AllAtAPriority_FillsEverySlot()
        {
            Assert.That(WorkGrantHarness.TryParseSpec("all@1", out var grid, out var err), Is.True, err);
            for (int t = 0; t < WorkPriority.WorkTypeCount; t++)
                Assert.That(grid[t], Is.EqualTo(WorkPriority.Highest));
        }

        /// <summary>
        /// ⚠️ AN ALL-@0 SPEC IS REFUSED, and this is the subtle one. It parses, it is well formed, and
        /// it produces EXACTLY the shipped boot state — so accepting it would let a leg print
        /// "grid granted" above a report measuring the default, which is the confusion this whole
        /// package exists to remove. The error tells the operator to say <c>none</c> instead.
        /// </summary>
        [Test]
        public void ParseSpec_RefusesASpecThatGrantsNothing()
        {
            Assert.That(WorkGrantHarness.TryParseSpec("Repair@0,Haul@0", out var grid, out var err), Is.False);
            Assert.That(grid, Is.Null);
            Assert.That(err, Does.Contain("none"));
        }

        [TestCase("Repair@5")]
        [TestCase("Repair@-1")]
        [TestCase("Repair@x")]
        [TestCase("Plumbing@2")]
        [TestCase("all,Repair@1")]
        [TestCase("Repair@1,,Haul@2")]
        public void ParseSpec_RefusesNonsense(string spec)
        {
            Assert.That(WorkGrantHarness.TryParseSpec(spec, out var grid, out var err), Is.False, spec);
            Assert.That(grid, Is.Null);
            Assert.That(err, Is.Not.Null.And.Not.Empty);
        }

        /// <summary>The default grant priority is RimWorld's <c>alwaysStartActive</c> value (3), not
        /// 1 — pinned so that "just switch it on" cannot silently become "switch it on at the highest
        /// priority in the game", which would change what every ungranted-priority leg measures.</summary>
        [Test]
        public void BareTypeName_GrantsAtPriorityThree()
        {
            Assert.That(WorkGrantHarness.TryParseSpec("Repair", out var grid, out var err), Is.True, err);
            Assert.That(grid[(int)WorkType.Repair], Is.EqualTo((byte)3));
            Assert.That(WorkGrantHarness.DefaultGrantPriority, Is.EqualTo(WorkPriority.SimpleModeEnabled));
        }

        /// <summary>A corpse gets no commands: <see cref="SetWorkPriorityCommand"/> refuses a dead
        /// citizen, so enqueuing for one would make the read-back disagree with the request forever
        /// and turn the integrity check into a permanent false alarm on any ship with a casualty.</summary>
        [Test]
        public void Grant_SkipsTheDead_SoVerifyStaysHonest()
        {
            var sim = SliceSim();
            sim.Citizens.Items[0].Dead = true;
            WorkGrantHarness.TryParseSpec("all", out var grid, out _);
            int enqueued = WorkGrantHarness.Grant(sim, grid);
            Assert.That(enqueued, Is.EqualTo((sim.Citizens.Items.Count - 1) * WorkPriority.WorkTypeCount));
            sim.Tick();
            Assert.That(WorkGrantHarness.Verify(sim, grid, out string mismatch), Is.True, mismatch);
        }
    }
}
