using Perilune.Dsl;
using Perilune.Sim;
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// THE WRECK RULE (wreck start W2, half A): below <c>wear.wreck_threshold</c> an empty-handed
    /// jury-rig is REFUSED. A raid-wrecked machine needs <see cref="ItemKind.Seals"/> or
    /// <see cref="ItemKind.Parts"/>; it cannot be wished better.
    ///
    /// <para><b>WHY THE RULE EXISTS, in one measurement.</b> <c>MaintenanceSystem</c> restores ANY
    /// device to <c>wear.jury_rig_condition</c> = 0.6 with EMPTY HANDS in one 900 s pass, and 0.6 is
    /// above every <c>maint</c> threshold in <c>machines.def</c> (max 0.40). So a ship whose every
    /// machine boots at 0.02–0.35 takes itself permanently out of the needy set in ~45 sim-minutes
    /// with zero player input and zero matter — the wreck premise evaporates before the player has
    /// done anything.</para>
    ///
    /// <para><b>EVERY TEST HERE IS DRIVEN.</b> The real <see cref="SystemStack"/> ticks, real crew
    /// walk, and the assertions read <see cref="Device.Condition"/> and
    /// <see cref="Citizen.JobKind"/> off the live sim. Nothing re-derives an expected value with the
    /// expression the code uses.</para>
    ///
    /// <para><b>NO PIN LITERAL IS ASSERTED IN THIS FILE.</b> Determinism pins live in
    /// <c>DefsChecksumTests</c>, <c>ci.sh</c> and the golden files; a literal measured in a lane is
    /// stale the moment a sibling lane merges.</para>
    ///
    /// <para><b>THE SCALE TRAP (CLAUDE.md, seventh shape).</b> A suite of ratio assertions cannot
    /// see a scale error. Every assertion below is an ABSOLUTE level in Condition units, and
    /// <see cref="TheThresholdDefaultIsBracketedFromBothSides"/> brackets the shipped default from
    /// above AND below by driving the sim at 0.20 and at 0.30 — halving or doubling
    /// <c>wreck_threshold</c> reddens one of the two by construction.</para>
    /// </summary>
    public class WreckThresholdTests
    {
        // ═══════════════════════════════════════════════════════════════════════════ helpers

        /// <summary>Ticks generous enough for one recruit + walk + a full 900 s service (9 000
        /// ticks) with slack, on a room four tiles wide.</summary>
        private const int OneServiceTicks = 12000;

        /// <summary>
        /// A powered, pressurised, breathable single-room bay with one crew member and one
        /// wear-bearing machine ("subject") at <paramref name="condition"/>. The machine is a
        /// <see cref="DeviceKind.Scrubber"/> — <c>machines.def</c> gives it <c>maint 0.40</c> and
        /// <c>fail 0.10</c>, so every condition used in this file is below its maintain threshold
        /// and <c>MaintenanceSystem</c> genuinely wants to service it.
        ///
        /// The crew member starts at (1,2,0), four tiles from the machine at (5,2,0), so a service
        /// requires a real walk and a fetch is a real fetch — a fixture where everything is already
        /// adjacent cannot tell "refused" from "instant".
        /// </summary>
        private static Simulation BuildBay(float condition, SimDefs defs = null)
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

            var subject = sim.AddDevice(DeviceKind.Scrubber, new Int3(5, 2, 0), "subject");
            subject.Condition = condition;

            sim.AddCitizen("Smith", new Int3(1, 2, 0)).GiveAllWork(); // AutoWander false ⇒ recruitable, never strays

            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        private static Device Subject(Simulation sim)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == "subject") return d;
            return null;
        }

        /// <summary>Drive the sim, recording whether ANY citizen was ever bound to a
        /// <see cref="JobKind.Maintain"/> job and the highest Condition the subject ever reached.
        /// Both are sampled EVERY tick: a service that lands and is then undone by wear would be
        /// invisible to an end-state-only assertion.</summary>
        private static (bool everMaintained, float peakCondition) Drive(Simulation sim, int ticks)
        {
            bool ever = false;
            float peak = Subject(sim).Condition;
            for (int t = 0; t < ticks; t++)
            {
                sim.Tick();
                foreach (var c in sim.Citizens.Items) if (c.JobKind == JobKind.Maintain) ever = true;
                float now = Subject(sim).Condition;
                if (now > peak) peak = now;
            }
            return (ever, peak);
        }

        /// <summary>The shipped defaults with ONE value changed — the def-level revert of the whole
        /// rule. <c>wreck_threshold = 0</c> means "no Condition is below the floor", so
        /// <see cref="MaintenanceSystem.IsUnfixableWreck"/> is false for every device and the game
        /// is exactly the pre-2026-07-28 game.</summary>
        private static SimDefs DefsWithThreshold(float threshold)
        {
            var d = SimDefs.CreateDefault();
            d.Wear.WreckThreshold = threshold;
            d.ComputeChecksum();
            return d;
        }

        // ══════════════════════════════════════════ 1. THE HEADLINE + ITS INCLUSION CONTROL

        /// <summary>
        /// THE HEADLINE, DRIVEN, WITH THE CONTROL IN THE SAME TEST. A machine at Condition 0.05 on a
        /// ship holding no Parts and no Seals anywhere is never recruited for and never repaired —
        /// and the very same fixture with the rule turned off at the def IS repaired to
        /// <c>jury_rig_condition</c>. The second half is the INCLUSION TEST: without it, "never
        /// repaired" is indistinguishable from a fixture where maintenance could never have run at
        /// all (unpowered, unreachable, above the maintain threshold, no idle crew).
        ///
        /// <para>Two things are asserted, not one, and the ORDER matters. "No Maintain job was ever
        /// assigned" is the PATH; "Condition never rose" is the OUTCOME. An outcome-only assertion
        /// would also pass if crew walked to the machine and worked 900 s for nothing, which is the
        /// livelock shape this rule is built to avoid.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): make <c>IsUnfixableWreck</c>
        /// always return false. Both assertions fail.</para>
        ///
        /// <para><b>⚠️ WHAT THIS TEST DOES NOT PIN, MEASURED AND RECORDED RATHER THAN ASSUMED.</b>
        /// Disabling the recruit gate ALONE leaves this test GREEN, both assertions included. The
        /// crew member here is settled (<c>AutoWander</c> false), so recruitment and the
        /// fetch-phase abandon happen inside a single <c>Tick</c> and nothing outside it can
        /// observe the claim — the PATH assertion above reads "no Maintain job SURVIVED a tick
        /// boundary", which is weaker than its wording suggests. The gate is pinned by
        /// <see cref="RecruitGate_NeverClaimsAWanderingCrewMemberForAnUnfixableWreck"/> and the
        /// fetch guard by
        /// <see cref="FetchGuard_AConsumableThatVanishesMidWalk_StillLeavesTheWreckWrecked"/>;
        /// each was written because the mutation for it survived everything else in this
        /// file.</para>
        /// </summary>
        [Test]
        public void WreckedMachine_WithNothingAboard_IsNeitherRecruitedForNorHealed()
        {
            var wrecked = BuildBay(0.05f);
            var (everMaintained, peak) = Drive(wrecked, OneServiceTicks);

            Assert.That(everMaintained, Is.False,
                "PATH: no crew member may even be ASSIGNED a Maintain job for an unfixable wreck — " +
                "refusing at completion instead would burn 900 s of a crew member's life per attempt.");
            Assert.That(peak, Is.LessThan(0.06f),
                "OUTCOME: the wreck must never rise. It started at 0.05 and nothing aboard can fix it.");

            // ── INCLUSION CONTROL: the same fixture, rule disabled at the def. It MUST heal. ──
            var control = BuildBay(0.05f, DefsWithThreshold(0f));
            var (controlMaintained, controlPeak) = Drive(control, OneServiceTicks);

            Assert.That(controlMaintained, Is.True,
                "NON-VACUITY: with wreck_threshold = 0 the fixture must produce a real Maintain job. " +
                "If it does not, the assertions above prove nothing about the rule.");
            Assert.That(controlPeak, Is.EqualTo(SimDefs.Default.Wear.JuryRigCondition).Within(1e-4f),
                "NON-VACUITY: with the rule off, empty hands must still jury-rig to exactly " +
                "wear.jury_rig_condition — that is the behaviour the rule removes.");
        }

        // ══════════════════════ 1a. HOW LONG A WRECK STAYS WRECKED — measured, not reasoned about

        /// <summary>
        /// <b>THE DURATION, DRIVEN OVER A FULL SIM-DAY.</b> The rest of this file drives 12 000
        /// ticks (20 sim-minutes), which is one service time plus slack — enough to prove a service
        /// did not happen, not enough to prove it never will. This leg drives <b>864 000 ticks = one
        /// full sim-day</b> and requires the machine to be exactly where it started, having never
        /// once been claimed.
        ///
        /// <para>It matters because the refusal is a PER-PASS SKIP with no memory
        /// (<c>_recruitSkip</c> is cleared every second), which is what makes the machine
        /// serviceable again the instant matter appears — and a per-pass decision re-evaluated
        /// 86 400 times is exactly the shape that can leak once. It does not.</para>
        ///
        /// <para>Wear is left ON, so the Scrubber's 0.018/h drifts the machine DOWN over the day;
        /// the assertion is therefore one-sided (never rose), which is the honest reading.</para>
        /// </summary>
        [Test]
        public void AWreckStaysWreckedForAFullSimDay_WithNoMatterAboard()
        {
            const int OneSimDay = 864000; // 10 Hz × 86 400 s
            var sim = BuildBay(0.20f);
            float start = Subject(sim).Condition;

            var (everMaintained, peak) = Drive(sim, OneSimDay);

            Assert.Multiple(() =>
            {
                Assert.That(everMaintained, Is.False,
                    "over 86 400 recruitment passes the wreck must never once be claimed");
                Assert.That(peak, Is.LessThanOrEqualTo(start),
                    "and its Condition must never RISE — wear may take it down, nothing may lift it");
                Assert.That(Subject(sim).Condition, Is.LessThan(start),
                    "NON-VACUITY: wear must actually have run, or this fixture proves only that a " +
                    "frozen sim stays frozen");
            });
        }

        // ═══════════════════════════ 1b. THE RECRUIT GATE, PINNED ON ITS OWN — and why it is needed

        /// <summary>
        /// THE RECRUIT GATE IS A SEPARATE GUARANTEE FROM THE FETCH-PHASE GUARD, AND IT NEEDED ITS
        /// OWN TEST. Measured, not reasoned: with the fetch-phase guard in place and the recruit
        /// gate deleted, <see cref="WreckedMachine_WithNothingAboard_IsNeitherRecruitedForNorHealed"/>
        /// stays GREEN — because on a crew member that is <b>settled</b>, recruitment and abandon
        /// both happen inside one tick and no observer outside <c>Tick</c> can see the claim. That
        /// test's PATH assertion was therefore a DEAD GUARD for the gate, and only applying the
        /// mutation found it.
        ///
        /// <para><b>What the gate actually buys, and on which crew.</b> <c>DriveWorker</c> returns
        /// early while the worker <c>HasPath</c>. So an idle crew member that is MID-WANDER is
        /// claimed for a job it can never perform and stays claimed for the whole walk —
        /// <see cref="Citizen.IsIdleForWork"/> is false throughout, so it is invisible to every
        /// other job source for that time, every second, forever, on a ship full of wrecks. The
        /// eight crew of <c>--ship grid</c> — the one standard play ship — are
        /// <c>AutoWander = true</c> and idle ~67 % of a sim-day, so this is the crew this rule meets
        /// in practice. This fixture therefore wanders, and the rest of the file does not.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): disable the
        /// <c>IsUnfixableWreck</c> block in <c>RecruitForNeediest</c>.</para>
        /// </summary>
        [Test]
        public void RecruitGate_NeverClaimsAWanderingCrewMemberForAnUnfixableWreck()
        {
            var wrecked = BuildBay(0.05f);
            foreach (var c in wrecked.Citizens.Items) c.AutoWander = true;
            var (everMaintained, peak) = Drive(wrecked, OneServiceTicks);

            Assert.That(everMaintained, Is.False,
                "A wandering crew member must never be CLAIMED for a machine nothing aboard can fix. " +
                "Without the recruit gate it is latched to JobKind.Maintain for the length of every " +
                "wander and is invisible to every other job source while it is.");
            Assert.That(peak, Is.LessThan(0.06f), "and the wreck must still never heal.");

            // ── INCLUSION CONTROL: same wandering fixture, rule disabled at the def. ──
            var control = BuildBay(0.05f, DefsWithThreshold(0f));
            foreach (var c in control.Citizens.Items) c.AutoWander = true;
            var (controlMaintained, _) = Drive(control, OneServiceTicks);

            Assert.That(controlMaintained, Is.True,
                "NON-VACUITY: with wreck_threshold = 0 this wandering fixture MUST produce an " +
                "observable Maintain claim. If it cannot, the assertion above pins nothing.");
        }

        // ══════════════════════════════════════════════════════ 2. THE MATTER PATH IS OPEN

        /// <summary>
        /// ONE Seals stack turns the same refused wreck into a serviced machine, at exactly
        /// <c>seal_service_condition</c>, and the stack is CONSUMED. The refusal is about the
        /// absence of matter, not about the machine being written off.
        ///
        /// <para>The stack is placed at (2,2,0) — not adjacent to the machine — so the service
        /// requires a genuine fetch leg. Asserting the consumption as well as the condition is what
        /// separates "serviced with Seals" from "jury-rigged while a Seals stack happened to be
        /// lying about".</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): make
        /// <c>IsUnfixableWreck</c> ignore its consumable term (<c>return device.Condition &lt;
        /// threshold;</c>) — the machine is then refused even with Seals aboard and both
        /// assertions fail.</para>
        /// </summary>
        [Test]
        public void WreckedMachine_WithOneSealsStack_IsServicedAndTheStackIsConsumed()
        {
            var sim = BuildBay(0.05f);
            var seals = sim.AddItem(ItemKind.Seals, 1, new Int3(2, 2, 0));
            Assert.That(seals, Is.Not.Null);

            var (everMaintained, peak) = Drive(sim, OneServiceTicks);

            Assert.That(everMaintained, Is.True, "PATH: a Maintain job must actually be assigned.");
            Assert.That(peak, Is.EqualTo(SimDefs.Default.Wear.SealServiceCondition).Within(1e-4f),
                "OUTCOME: a Seals service restores exactly wear.seal_service_condition — not the " +
                "jury-rig floor, which would mean the rule let a free repair through.");
            Assert.That(UnitsOf(sim, ItemKind.Seals), Is.Zero,
                "The Seals unit must be CONSUMED. A condition rise with the stack still on the " +
                "ground is a jury-rig wearing a Seals service's clothes.");
        }

        /// <summary>
        /// THE FETCH-PHASE GUARD, PINNED ON ITS OWN — the second of the rule's two halves, and it
        /// needed its own fixture for the mirror-image reason the recruit gate did: with the recruit
        /// gate in place a wreck is never recruited for, so the fetch phase is never reached and
        /// deleting the guard reddens nothing in the rest of this file. Measured, not reasoned.
        ///
        /// <para><b>The reachable case it covers.</b> The gate is evaluated at RECRUITMENT; the
        /// consumable can disappear between then and the worker reaching it — another maintenance
        /// job takes the last Seals unit, a crafting bench claims it, or a fleeing crew member sets
        /// it down in vacuum where <see cref="Perilune.Sim.WorksiteSafety.CanStageWorkerAt"/> makes
        /// it unfetchable. This test reproduces that by removing the stack the moment the servicer
        /// is bound and walking, and requires the wreck to stay wrecked. Without the guard the
        /// servicer falls through to the jury-rig branch and repairs it for free — the exact hole
        /// the rule exists to close, reachable through the back door.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): disable the
        /// <c>device.Condition &lt; wreck_threshold</c> guard above the jury-rig branch in
        /// <c>DriveWorker</c>.</para>
        /// </summary>
        [Test]
        public void FetchGuard_AConsumableThatVanishesMidWalk_StillLeavesTheWreckWrecked()
        {
            var sim = BuildBay(0.05f);
            var seals = sim.AddItem(ItemKind.Seals, 1, new Int3(2, 2, 0));

            bool everMaintained = false, pulled = false;
            float peak = Subject(sim).Condition;
            for (int t = 0; t < 30000; t++)
            {
                sim.Tick();
                foreach (var c in sim.Citizens.Items)
                {
                    if (c.JobKind != JobKind.Maintain) continue;
                    everMaintained = true;
                    if (!pulled && c.CarryingItemId == 0)
                    {
                        // The last Seals unit aboard is taken by something else, mid-walk.
                        sim.Items.Remove(seals.Id);
                        sim.JobsDirty |= JobBoardDirty.Items;
                        pulled = true;
                    }
                }
                float now = Subject(sim).Condition;
                if (now > peak) peak = now;
            }

            Assert.Multiple(() =>
            {
                Assert.That(everMaintained, Is.True,
                    "NON-VACUITY: the servicer must actually have been recruited and bound — " +
                    "otherwise the fetch phase was never entered and this test pins nothing.");
                Assert.That(pulled, Is.True,
                    "NON-VACUITY: the stack must actually have been pulled while the servicer was " +
                    "empty-handed. If it was never pulled, the run never reached the case.");
                Assert.That(UnitsOf(sim, ItemKind.Seals), Is.Zero, "PATH: the ship really holds no consumable.");
                Assert.That(peak, Is.LessThan(0.06f),
                    "OUTCOME: with nothing left to fix it with, the wreck must stay wrecked. A rise " +
                    "to wear.jury_rig_condition here is the free repair coming back through the " +
                    "fetch phase.");
            });
        }

        private static int UnitsOf(Simulation sim, ItemKind kind)
        {
            int n = 0;
            foreach (var s in sim.Items.Items) if (s.Kind == kind) n += s.Count;
            return n;
        }

        // ═══════════════════════════════════════ 3. ROT IS NOT DAMAGE — the byte-identical band

        /// <summary>
        /// A machine that merely ROTTED — above the wreck floor but below its maintain threshold —
        /// still jury-rigs for free with empty hands, exactly as it did before this package. This is
        /// the "byte-identical above the threshold" claim, driven rather than argued.
        ///
        /// <para>0.30 is chosen because it is inside <c>[wreck_threshold, maint)</c> = [0.25, 0.40)
        /// for a Scrubber: high enough that the rule must not bite, low enough that maintenance
        /// genuinely wants the machine. A test at 0.5 would pass even if the rule were wired to the
        /// wrong comparison.</para>
        ///
        /// <para>NAMED MUTATION (applied, observed red, reverted): flip the comparison in
        /// <c>IsUnfixableWreck</c> to <c>&gt;=</c>.</para>
        /// </summary>
        [Test]
        public void RottedMachine_AboveTheWreckFloor_StillJuryRigsForFree()
        {
            var sim = BuildBay(0.30f);
            var (everMaintained, peak) = Drive(sim, OneServiceTicks);

            Assert.That(everMaintained, Is.True,
                "A merely-rotted machine must still be recruited for — the rule is about damage, not rot.");
            Assert.That(peak, Is.EqualTo(SimDefs.Default.Wear.JuryRigCondition).Within(1e-4f),
                "Above the wreck floor, an empty-handed service must restore exactly " +
                "wear.jury_rig_condition. Anything else is a changed shipped economy.");
        }

        // ══════════════════════════════ 4. THE ABSOLUTE SCALE PIN — bracketed from both sides

        /// <summary>
        /// THE SCALE GUARD (CLAUDE.md's seventh trap shape). Every other assertion in this file
        /// would survive a <c>wreck_threshold</c> that is wrong by a factor: 0.05 is below any
        /// plausible value and 0.30 is above most. This test brackets the shipped default from BOTH
        /// SIDES by driving the sim at 0.20 (must be refused) and 0.30 (must be served), which pins
        /// the value into (0.20, 0.30] — halving 0.25 to 0.125 reddens the first leg, doubling it to
        /// 0.5 reddens the second.
        ///
        /// <para><b>THE TWO LEGS ARE BLINDED FROM EACH OTHER.</b> <c>assert</c> throws, so a
        /// multi-leg test reports only its first failing leg and a leg that cannot bite looks
        /// exactly like one that can (CLAUDE.md's fifth trap shape). Each leg therefore runs its own
        /// fixture and records into a local, and BOTH results are asserted at the end — so a leg
        /// that stops biting cannot hide behind its sibling's failure.</para>
        /// </summary>
        [Test]
        public void TheThresholdDefaultIsBracketedFromBothSides()
        {
            var below = BuildBay(0.20f);
            var (belowMaintained, belowPeak) = Drive(below, OneServiceTicks);

            var above = BuildBay(0.30f);
            var (aboveMaintained, abovePeak) = Drive(above, OneServiceTicks);

            Assert.Multiple(() =>
            {
                Assert.That(belowMaintained, Is.False,
                    "LOWER BRACKET: 0.20 is BELOW the shipped wreck floor, so it must be refused. " +
                    "This leg is what a threshold that drifted DOWN (0.25 → 0.125) would break.");
                Assert.That(belowPeak, Is.LessThan(0.21f), "LOWER BRACKET: and it must not heal.");

                Assert.That(aboveMaintained, Is.True,
                    "UPPER BRACKET: 0.30 is ABOVE the shipped wreck floor, so it must be served. " +
                    "This leg is what a threshold that drifted UP (0.25 → 0.5) would break.");
                Assert.That(abovePeak, Is.EqualTo(SimDefs.Default.Wear.JuryRigCondition).Within(1e-4f),
                    "UPPER BRACKET: and it must reach the jury-rig floor for free.");
            });
        }

        // ══════════════ 4b. THE PRICE OF 0.25, MADE VISIBLE — three kinds lose free maintenance

        /// <summary>
        /// <b>WHAT 0.25 COSTS ON EVERY SHIP, NOT JUST A WRECK — a MEASURED consequence of the
        /// shipped default that must not be silent.</b>
        ///
        /// <para>A machine is only offered maintenance below its <c>maint</c> threshold, so its
        /// FREE-JURY-RIG BAND is <c>[wreck_threshold, maint)</c>. Three shipped kinds —
        /// <see cref="DeviceKind.Terminal"/>, <see cref="DeviceKind.Light"/> and
        /// <see cref="DeviceKind.WaterTank"/> — have <c>maint = 0.20</c>, which is BELOW the 0.25
        /// floor, so their band is EMPTY: at the shipped default those three kinds can never be
        /// repaired without Parts or Seals, on any ship, wreck or not. The
        /// <see cref="DeviceKind.Door"/>'s band is the narrowest non-empty one, [0.25, 0.30).</para>
        ///
        /// <para>This is a real change to the shipped economy and it is deliberate rather than
        /// overlooked — the owner set 0.25 as a starting value to be MEASURED. The set is pinned by
        /// EQUALITY, so retuning <c>wreck_threshold</c> cannot quietly add a fourth kind: it fails
        /// here and someone has to write down the decision. It is also the file's second
        /// scale-sensitive assertion — lowering the floor below 0.20 empties this set, raising it
        /// past 0.30 grows it.</para>
        ///
        /// <para>The set is COUNTED OFF THE SHIPPED TABLE, never off a transcription (CLAUDE.md:
        /// re-count, never compute).</para>
        /// </summary>
        [Test]
        public void KindsWhoseFreeJuryRigBandIsEmptyAtTheShippedFloor_ArePinnedByName()
        {
            var defs = SimDefs.Default;
            var starved = new System.Collections.Generic.List<string>();
            var narrowest = new System.Collections.Generic.List<string>();

            foreach (DeviceKind k in System.Enum.GetValues(typeof(DeviceKind)))
            {
                float maint = defs.Machines[(int)k].MaintainBelow;
                if (maint <= 0f) continue;                       // never maintained (conduits, furniture)
                if (maint <= defs.Wear.WreckThreshold) starved.Add(k.ToString());
                else if (maint - defs.Wear.WreckThreshold < 0.06f) narrowest.Add(k.ToString());
            }

            Assert.Multiple(() =>
            {
                Assert.That(starved, Is.EquivalentTo(new[] { "Terminal", "Light", "WaterTank" }),
                    "THE SET OF KINDS THAT CAN NEVER BE FIXED FOR FREE CHANGED. At wreck_threshold = " +
                    "0.25 these three (maint = 0.20) have an EMPTY free-jury-rig band on EVERY ship. " +
                    "That is a shipped-economy consequence of the default, not a wreck-only one. If " +
                    "you retuned the floor, decide and record what the new set means.");
                // ⚠️ `CryoPod` IS NOT IN EITHER SET, AND THAT IS THE POINT — it is the table's first
                // row that is never maintained (`maint = 0`, the opt-out, so the `maint <= 0f`
                // guard above skips it) and can still FAIL (`fail = 0.10`). A draft of the wreck
                // start gave it `maint = 0.30` and this assertion listed it here; driving one
                // unattended sim-day showed why that was wrong — the four wrecked capsules are the
                // lowest-Condition devices on the ship, so `MaintenanceSystem` spent the opening's
                // entire consumable stock (1 Parts, 2 Seals) nursing dead sleepers' coffins before
                // the player pressed anything. Repairing a pod is a PLAYER act. The cost, stated:
                // a pod now has NO free-jury-rig band at all, and nothing repairs one today.
                Assert.That(narrowest, Is.EquivalentTo(new[] { "Door", "Battery" }),
                    "THE NARROW-BAND SET CHANGED — kinds with less than 0.06 of Condition between " +
                    "the wreck floor and their maintain threshold. These are the kinds a small " +
                    "increase in wreck_threshold starves next.");
            });
        }

        // ═════════════════════════════════════════════ 5. THE PREDICATE ITSELF, AT THE BOUNDARY

        /// <summary>
        /// <see cref="MaintenanceSystem.IsUnfixableWreck"/>'s comparison is <c>&lt;</c>, not
        /// <c>&lt;=</c>: a machine sitting EXACTLY on the floor is still fixable for free. Driving
        /// the sim cannot resolve this — 900 s of wear moves a device off an exact boundary — so
        /// this one leg reads the predicate directly, and it is the only non-driven assertion in the
        /// file.
        ///
        /// <para>It also pins the SECOND term: with a Parts stack aboard, a machine far below the
        /// floor is fixable. Two devices, one item, four assertions, all on one sim.</para>
        /// </summary>
        [Test]
        public void IsUnfixableWreck_IsExclusiveAtTheFloor_AndOpensAsSoonAsMatterExists()
        {
            var sim = BuildBay(0.05f);
            float floor = sim.Defs.Wear.WreckThreshold;
            var subject = Subject(sim);

            subject.Condition = floor;
            bool atFloor = MaintenanceSystem.IsUnfixableWreck(sim, subject);

            subject.Condition = floor * 0.5f;
            bool belowFloor = MaintenanceSystem.IsUnfixableWreck(sim, subject);

            sim.AddItem(ItemKind.Parts, 1, new Int3(2, 2, 0));
            bool belowFloorWithParts = MaintenanceSystem.IsUnfixableWreck(sim, subject);

            bool nullIsNotAWreck = MaintenanceSystem.IsUnfixableWreck(sim, null);

            Assert.Multiple(() =>
            {
                Assert.That(atFloor, Is.False, "AT the floor is NOT a wreck — the comparison is <, not <=.");
                Assert.That(belowFloor, Is.True, "BELOW the floor with nothing aboard IS a wreck.");
                Assert.That(belowFloorWithParts, Is.False,
                    "A wreck with Parts aboard is fixable — the rule refuses free repair, not repair.");
                Assert.That(nullIsNotAWreck, Is.False, "A null device must not be reported as a wreck.");
            });
        }
    }
}
