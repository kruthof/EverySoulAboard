using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession, WireFormat, WebCommand
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>D5 — AN ACCEPTED ORDER IS NEVER SILENTLY DROPPED.</b> The player sentence:
    /// <i>when you order a repair and it cannot proceed, the game says so — the order never just
    /// evaporates into "Awaiting orders".</i>
    ///
    /// <para><b>THE SIGHTING, AND IT IS THIS FILE'S FIXTURE.</b> 2026-08-03, the spend-visible lane's
    /// browser run on the SHIPPED wreck: right-click ▸ <i>PRIORITISE: REPAIR</i> on
    /// <c>fabricator_1</c> ⇒ the crew dock read <i>"Heading to service fabricator_1"</i> ⇒ shortly
    /// after, <i>"Awaiting orders"</i>. No badge, no toast, no reason anywhere. The same thing was
    /// observed-not-checked by <c>client/tools/vacuum-shot.mjs</c> ("the job is then dropped before
    /// she leaves the cryobay"). T13 the day before did NOT see it, on five direct orders.</para>
    ///
    /// <para>⭐⭐ <b>THE DIAGNOSIS, DRIVEN HEADLESSLY, AND THE GEOMETRY ANSWER T13 WAS MISSING.</b>
    /// <c>fabricator_1</c> sits at <c>(24,2,0)</c> in <c>hall_d0_s2</c>. Its staging tile —
    /// <c>MaintenanceSystem.TryFindStagingTile(forced: true)</c>, the SAME call
    /// <c>PrioritiseJobCommand</c> and <c>MaintenanceSystem.DriveWorker</c> both make — is
    /// <c>(25,2,0)</c>, and that tile is <b>walkable and (forced) survivable but NOT REACHABLE</b>:
    /// <c>door_d0_s2</c> at <c>(27,7,0)</c> boots SHUT, and since OD-N doors are actuated through
    /// MOSS only. <c>TryFindStagingTile</c> asks walkable + survivable and <b>never asks
    /// reachable</b>, so the order is ACCEPTED. She then walks 17 sim-seconds to the ship's one Parts
    /// stack at <c>(7,14,0)</c>, and the instant she stands on it <c>DriveWorker</c>'s pickup branch
    /// re-asks <c>FindPath(worker → staging)</c>, gets false, and calls <c>Abandon</c> — which clears
    /// <c>JobKind</c>, which clears <c>HeldByOrder</c>, which IS the order. Measured on the shipped
    /// wreck, unmodified: taken at tick 1, dropped at <b>tick 171</b>, at <c>(7,14,0)</c>.</para>
    ///
    /// <para>⛔ <b>IT IS NOT "GEOMETRY-SPECIFIC" AND IT IS NOT FLAKY — IT IS REACHABILITY, AND IT IS
    /// DETERMINISTIC.</b> D5 fires exactly when the ordered machine's staging tile is in a different
    /// connected region from the ordered crew member. T13 did not see it because every machine it
    /// ordered was in the boot-breathable core, or was ordered AFTER the MOSS console had opened the
    /// hall doors. Open <c>door_d0_s2</c> and the identical order is taken and driven to the machine
    /// — <see cref="OneDoor_IsTheWholeDifference_TheRouteExistsAndTheBadgeIsGone"/> is that cell.</para>
    ///
    /// <para><b>THE FIX IS THE SURFACE, NOT THE BEHAVIOUR.</b> §2.2's ruling stands — an order beats
    /// the grid, never incapability, never the staging rule — and RimWorld's own shape is the
    /// authority for what was actually wrong here: <c>docs/design/rimworld-reference.md</c> §2.2,
    /// <i>"RimWorld's answer to an impossible order is a refusal at the point of the click … It does
    /// not accept the order and then fail silently"</i>, called out in that file as <b>the single
    /// most transferable fact in §2 for Perilune</b>. The order is still accepted (this repo's
    /// deliberate difference); what changes is that the machine now wears
    /// <see cref="WireFormat.ReasonNoRoute"/> on the shipped <c>blocked</c> channel from the frame
    /// after the click, and keeps it after the sim drops the job.</para>
    ///
    /// <para>⛔⛔ <b>THE SCOPE, AND IT IS NARROWER THAN "THE `:464` ARM IS COVERED" — READ IT BEFORE
    /// THE GREEN LEGS.</b> What is surfaced is that arm <b>when the route is shut AT ISSUE TIME</b>.
    /// Order the same machine with <c>door_d0_s2</c> OPEN and shut it mid-order and the job dies at
    /// the identical arm with <b>nothing on any surface</b> — driven: taken tick 1, the first render
    /// RETIRES the pending record (arm (1) — the held job is the order from then on), door shut tick
    /// 41, dropped tick 171, channel <c>cells:[]</c>. Structural, not a missing predicate: once the
    /// record is retired there is nothing left to re-ask about. Follow-on package (host keeps retired
    /// records and re-checks on drop, or the sim emits a drop reason — the second covers all nine
    /// arms at once). <c>MECHANICS</c> §13.25 b3 carries it; NOT built here, by ruling.</para>
    ///
    /// <para>⚠️ <b>WHAT THIS PACKAGE ALSO DOES NOT DO.</b> It does not re-issue the order when the
    /// route opens: RimWorld's <c>Pawn_MindState.priorityWork</c> record is still not built
    /// (<c>MECHANICS</c> §13.25d), so the badge clears with the route and the player re-orders. And
    /// it surfaces ONE drop site; the other EIGHT <c>Abandon</c> arms in
    /// <c>MachineWearSystem.DriveWorker</c> (nine, counted) are a named CLASS, reported to the
    /// integrator for <c>HANDOVER</c>'s OPEN list, not swept here.</para>
    /// </summary>
    public class DroppedOrderTests
    {
        /// <summary>The shipping ship, a session over it, no sim thread. ⚠️ NOT
        /// <c>GiveAllCrewAllWork</c>: the sighting is at the OD-H boot state, which is the state a
        /// player is actually in — the direct order is the only work on the ship.</summary>
        private static (GameSession Gs, SimHost Host) BootWreck()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            return (new GameSession(host, sink.Add), host);
        }

        /// <summary>The sighting's machine, written out rather than searched for.</summary>
        private const string TheMachine = "fabricator_1";

        /// <summary>The one shut door between the crew and that machine, written out by hand so a
        /// leg claiming ONE CLICK cannot quietly grow to two. Measured, not guessed: of the eight
        /// deck-0 spine doors, opening this one alone makes the staging tile reachable and opening
        /// any of the other seven alone does not.</summary>
        private static readonly Int3 TheDoor = new Int3(27, 7, 0);

        private static Device ByName(Simulation sim, string name)
        {
            foreach (var d in sim.Devices.Items) if (d.Name == name) return d;
            Assert.Fail("no device named '" + name + "' on the wreck");
            return null;
        }

        /// <summary>Right-click ▸ <i>prioritise: repair</i>, as the wire spells it —
        /// <c>PrioritiseOrderTests.OrderOverTheWire</c>'s call, restated so this file drives the
        /// host bridge rather than the command.</summary>
        private static void OrderOverTheWire(GameSession gs, Citizen who, Device machine)
            => gs.ApplyForTest(new WebCommand(CmdKind.Prioritise, machine.Pos.X, machine.Pos.Y,
                                              i: machine.Pos.Z, cid: who.Id));

        /// <summary>The cached <c>blocked</c> payload's tuples, off the SNAPSHOT a reconnecting
        /// client is caught up from (BlockedChannelTests' reader). Positional on purpose — the tuple
        /// IS the contract.</summary>
        private static List<(int X, int Y, int Deck, int Order, int Reason, int Detail)> Rows(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"blocked\""));
            Assert.IsNotNull(json, "the blocked channel must be cached for Snapshot catch-up");
            var rows = new List<(int, int, int, int, int, int)>();
            int at = json.IndexOf("[[", System.StringComparison.Ordinal);
            if (at < 0) return rows;
            foreach (var part in json.Substring(at + 1).Split('['))
            {
                if (part.Length == 0 || !char.IsDigit(part[0])) continue;
                var f = part.Substring(0, part.IndexOf(']')).Split(',');
                Assert.That(f.Length, Is.EqualTo(6), "a blocked tuple is six elements since M3-13");
                rows.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                          int.Parse(f[1], CultureInfo.InvariantCulture),
                          int.Parse(f[2], CultureInfo.InvariantCulture),
                          int.Parse(f[3], CultureInfo.InvariantCulture),
                          int.Parse(f[4], CultureInfo.InvariantCulture),
                          int.Parse(f[5], CultureInfo.InvariantCulture)));
            }
            return rows;
        }

        private static (int X, int Y, int Deck, int Order, int Reason, int Detail)? RepairRowAt(GameSession gs, Int3 p)
        {
            foreach (var t in Rows(gs))
                if (t.Order == WireFormat.OrderRepair && t.X == p.X && t.Y == p.Y && t.Deck == p.Z) return t;
            return null;
        }

        // ═════════════════════════════════════════════════════════════════ the premise: the sighting

        /// <summary>
        /// ⛔ <b>THE DEFECT ITSELF, DRIVEN ON THE SHIPPED WRECK — the premise every other leg here
        /// rests on, and the thing a reader must not have to take on trust.</b> The order is ACCEPTED
        /// (a held Maintain job on the frame after the click), and then the sim DROPS IT unattended,
        /// with the machine untouched and the crew member back to no job at all.
        ///
        /// <para>⚠️ IT IS ALSO THE LEG THAT WOULD CATCH A LATER LANE "FIXING" D5 BY CHANGING THE
        /// BEHAVIOUR instead of the surface — the ruling is that the order is accepted (§2.2) and the
        /// silence is the bug. If this leg ever reddens, the diagnosis above needs re-taking before
        /// anything else in this file is believed.</para>
        /// </summary>
        [Test]
        public void ThePremise_TheOrderIsAcceptedAndThenTheSimDropsIt()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var machine = ByName(sim, TheMachine);
            var her = sim.Citizens.Items[0];
            float conditionAtBoot = machine.Condition;

            Assert.That(MaintenanceSystem.TryFindStagingTile(sim, machine.Pos, out var staging, forced: true),
                Is.True, "premise: the machine HAS a staging tile — this is not the no-approach case");
            Assert.That(sim.Paths.FindPath(sim, her.Pos, staging, new List<Int3>()), Is.False,
                "premise: and she cannot walk to it — THIS is the case, and the whole diagnosis");

            OrderOverTheWire(gs, her, machine);
            sim.Tick();
            Assert.That(her.JobKind, Is.EqualTo(JobKind.Maintain), "the order was ACCEPTED");
            Assert.That(her.HeldByOrder, Is.True, "…and held — the hold IS the order (§2.2)");

            int droppedAt = -1;
            for (int t = 0; t < 600 && droppedAt < 0; t++)
            {
                sim.Tick();
                if (her.JobKind != JobKind.Maintain) droppedAt = (int)sim.TickCount;
            }

            Assert.That(droppedAt, Is.GreaterThan(0),
                "⛔ the sim did NOT drop the order — the sighting no longer reproduces and this " +
                "file's diagnosis is stale. Re-take it before trusting any other leg here.");
            Assert.That(her.HeldByOrder, Is.False, "the hold died with the job — the order is gone");
            // ⚠️ NOT `EqualTo(conditionAtBoot)`: `MachineWearSystem` is running and the machine wears
            // DOWN by ~0.0001 over these 600 ticks. What a service would do is set Condition to a
            // RESTORE LEVEL (jury-rig 0.60, or a consumable's own tier) — an unmissable step UP. So
            // the honest assertion is that it never rose.
            Assert.That(machine.Condition, Is.LessThanOrEqualTo(conditionAtBoot),
                "and not one work tick landed on the machine she was pointed at — a completed " +
                "service writes a restore level, which is a step UP, not a drift down");
        }

        // ═══════════════════════════════════════════════════════════════════════ the outcome

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME, HALF ONE — THE GAME SAYS SO WHILE SHE IS STILL WALKING.</b> One frame
        /// after the click the machine carries a repair row on the <c>blocked</c> channel reading
        /// <see cref="WireFormat.ReasonNoRoute"/>. The player does not have to wait 17 sim-seconds
        /// for the drop to find out the order cannot land.
        ///
        /// <para>⚠️ THE ROW IS ON THE MACHINE'S TILE, not on the staging tile and not on the door —
        /// <c>BlockedCell</c>'s stated rule ("the tile they clicked and the tile they will look at").</para>
        ///
        /// <para>MUTATIONS, RUN, and the counts are the MEASURED ones: delete the
        /// <c>OrderedWorksiteIsOutOfReach</c> arm from <c>GameSession.BuildBlocked</c>'s repair walk
        /// ⇒ <b>2 red</b> (this leg and <see cref="TheBadgeSurvivesTheDrop_TheOrderDoesNotJustEvaporate"/>;
        /// the door leg stays green, because it is an EXCLUSION control and a badge that never appears
        /// satisfies it). Move the arm BELOW the <c>taken</c>/retire rule ⇒ the same 2 red — that is
        /// the precedence claim, driven. Ask <c>TryFindStagingTile</c> with <c>forced: false</c> ⇒ the
        /// same 2 red.</para>
        /// </summary>
        [Test]
        public void TheOrderIsAcceptedAndTheMachineIsBadgedTheVeryNextFrame()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var machine = ByName(sim, TheMachine);
            var her = sim.Citizens.Items[0];

            Assert.That(RepairRowAt(gs, machine.Pos), Is.Null,
                "control: before the order there is no repair row — automatic maintenance stays off " +
                "this channel, or a wreck badges every damaged device aboard");

            OrderOverTheWire(gs, her, machine);
            sim.Tick();

            var row = RepairRowAt(gs, machine.Pos);
            Assert.That(row, Is.Not.Null,
                "⛔ the player clicked, the sim took the order it cannot finish, and NOTHING on any " +
                "surface said so. That is D5.");
            Assert.That(row.Value.Reason, Is.EqualTo(WireFormat.ReasonNoRoute),
                "the reason must be the ROUTE — not the wreck rule (there are 11 consumable units " +
                "aboard) and not the air (an order crosses air, rung 2)");
            Assert.That(row.Value.Detail, Is.EqualTo(WireFormat.DetailNone),
                "this reason has nothing to add — DetailNone, never 0 (a real ItemKind)");
        }

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME, HALF TWO — AND IT IS THE ONE THE PLAYER SENTENCE IS ABOUT: THE BADGE
        /// SURVIVES THE DROP.</b> Run past the abandon, to the state the sighting photographed —
        /// crew dock reading <i>"Awaiting orders"</i>, no job, no hold — and the machine is STILL
        /// badged. The order did not evaporate; the reason it could not land is still on the screen.
        ///
        /// <para>⛔ THIS IS THE LEG THE OBVIOUS IMPLEMENTATION FAILS. <c>_prioritised</c> retires an
        /// entry the moment the sim turns it into a held job ("the held job IS the order from then
        /// on") — so a badge that rode only on the pending record would have vanished at tick 1 and
        /// been gone long before the drop at tick 171.</para>
        /// </summary>
        [Test]
        public void TheBadgeSurvivesTheDrop_TheOrderDoesNotJustEvaporate()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var machine = ByName(sim, TheMachine);
            var her = sim.Citizens.Items[0];

            OrderOverTheWire(gs, her, machine);
            for (int t = 0; t < 600; t++) sim.Tick();

            Assert.That(her.JobKind, Is.EqualTo(JobKind.None), "premise: the sim has dropped the job");
            Assert.That(her.HeldByOrder, Is.False, "premise: and the hold with it");

            var row = RepairRowAt(gs, machine.Pos);
            Assert.That(row, Is.Not.Null,
                "⛔ she is back to 'Awaiting orders' and the machine she was ordered to fix wears " +
                "nothing. THIS IS THE SIGHTING, and it is what D5 is.");
            Assert.That(row.Value.Reason, Is.EqualTo(WireFormat.ReasonNoRoute));
        }

        /// <summary>
        /// ⭐ <b>THE TWO-CELL DISCRIMINATOR: identical ship, identical order, ONE DOOR the only
        /// difference.</b> Open <c>door_d0_s2</c> and the route exists, so the badge must not appear
        /// AND the order must actually run — she reaches the machine's staging tile.
        ///
        /// <para>⚠️ <b>THIS IS THE NON-VACUITY CONTROL AND IT IS BY EXCLUSION, DELIBERATELY.</b>
        /// A badge that is emitted for every ordered machine would pass both legs above and fail
        /// here; without this cell "the row appears" is compatible with "the row always appears".
        /// It is also the leg that pins the CAUSE rather than the correlation — the diagnosis says
        /// reachability, so the one edit that restores reachability must clear it.</para>
        /// </summary>
        [Test]
        public void OneDoor_IsTheWholeDifference_TheRouteExistsAndTheBadgeIsGone()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var machine = ByName(sim, TheMachine);
            var her = sim.Citizens.Items[0];

            Assert.That(sim.TryGetDeviceAt(TheDoor, out var door), Is.True, "premise: the door is there");
            Assert.That(door.Kind, Is.EqualTo(DeviceKind.Door), "premise: and it is a door");
            Assert.That(door.IsOpen, Is.False, "premise: shut at boot (OD-N — doors are MOSS-only)");
            door.IsOpen = true;

            MaintenanceSystem.TryFindStagingTile(sim, machine.Pos, out var staging, forced: true);
            Assert.That(sim.Paths.FindPath(sim, her.Pos, staging, new List<Int3>()), Is.True,
                "premise: this one door IS the route");

            OrderOverTheWire(gs, her, machine);
            sim.Tick();

            Assert.That(RepairRowAt(gs, machine.Pos), Is.Null,
                "⛔ the machine is badged NO ROUTE with the route wide open — the badge is not " +
                "measuring reachability at all");

            bool reachedTheWorksite = false;
            for (int t = 0; t < 600 && !reachedTheWorksite; t++)
            {
                sim.Tick();
                if (her.Pos == staging) reachedTheWorksite = true;
            }
            Assert.That(reachedTheWorksite, Is.True,
                "and the identical order that died at tick 171 now walks the crew member to the " +
                "worksite — the door is the whole difference");
        }

        /// <summary>
        /// ⭐⭐ <b>THE PURITY PIN FOR THE ONE WALK THAT NOW RUNS A PATHFINDER DURING RENDER.</b>
        /// <c>OrderedWorksiteIsOutOfReach</c> calls <c>PathService.FindPath</c> from the render half,
        /// and <c>PathService</c> holds preallocated scratch reachable from <c>Simulation.Paths</c> —
        /// so "the render never touches the sim" is a claim this package has to re-earn rather than
        /// inherit.
        ///
        /// <para>⛔ <b>WHY IT COULD NOT LIVE IN THE EXISTING PIN.</b>
        /// <c>BlockedChannelTests.Rendering_The_Blocked_Channel_Never_Touches_The_Sim</c> boots
        /// <c>--ship grid</c> and issues NO direct order, so <c>_prioritised</c> stays empty, the
        /// fourth walk is gated out and the A* is never reached: the one walk that needed pinning is
        /// the one walk that pin cannot see. That is trap 4's shape — a guard whose fixture excludes
        /// the violation — and independent review caught it. This leg is the missing cell, and it
        /// lives here because the fixture it needs (a wreck, an order, an unreachable worksite) is
        /// this package's.</para>
        ///
        /// <para><b>THE COVERAGE PREMISE IS ASSERTED, NOT DESCRIBED</b> — the sibling pin's own hard
        /// lesson. Without the row check below, deleting the whole repair walk would leave the hash
        /// comparison green and this test would pin the purity of code it never ran.</para>
        ///
        /// <para>MUTATION, RUN: have <c>OrderedWorksiteIsOutOfReach</c> path into <c>c.Path</c>
        /// instead of <c>_reachScratch</c> — i.e. let the render delete a live crew member's route —
        /// ⇒ <b>1 red, here, on the route assertion</b>.
        /// <br/>⛔ <b>AND IT SURVIVED THE FIRST DRAFT OF THIS LEG, which is why the body is written
        /// the way it is.</b> That draft took the baseline hash AFTER the coverage probe (which
        /// renders), so the first clobber was already inside the baseline and the four later renders
        /// changed nothing: the mutation was applied and the suite stayed GREEN. A named mutation
        /// that cannot bite is this repo's oldest recurring defect, and the fix was ordering, not
        /// more assertions — snapshot BEFORE the first render.</para>
        /// </summary>
        [Test]
        public void RenderingTheNoRouteRow_RunsAnAStarAndStillTouchesNothing()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var machine = ByName(sim, TheMachine);
            var her = sim.Citizens.Items[0];

            OrderOverTheWire(gs, her, machine);
            sim.Tick();

            // ⚠️⚠️ THE BASELINE IS TAKEN BEFORE THE FIRST RENDER, AND THAT ORDERING IS THE WHOLE
            // TEST. The first draft read the hash AFTER a render (the coverage probe below renders),
            // so the FIRST clobber was already baked into the baseline and every later render was a
            // no-op — the named mutation "path into `c.Path` instead of `_reachScratch`" was applied
            // and the leg stayed GREEN. A pin whose baseline is taken after the damage cannot see the
            // damage. Snapshot first, then render, then compare.
            ulong before = sim.StateHash();
            int pathLenBefore = her.Path.Count;
            int pathIdxBefore = her.PathIndex;
            Assert.That(pathLenBefore, Is.GreaterThan(0),
                "PREMISE: she is walking (to the Parts stack) at this moment — without a live route " +
                "there is nothing for a careless render to overwrite and the leg is vacuous");

            var row = RepairRowAt(gs, machine.Pos);   // renders
            Assert.That(row, Is.Not.Null, "COVERAGE PREMISE FAILED: no repair row, so the walk that " +
                "runs the pathfinder never ran and the purity claim below covers nothing");
            Assert.That(row.Value.Reason, Is.EqualTo(WireFormat.ReasonNoRoute),
                "COVERAGE PREMISE: and it is the ROUTE row — the only one that costs an A*");
            for (int i = 0; i < 4; i++) gs.RenderForTest();

            // ⭐ THE DIRECT STATEMENT OF THE RISK, asserted rather than left to whatever the fold
            // happens to cover: `FindPath` CLEARS and rewrites its out-parameter, so handing it a
            // citizen's own `Path` would delete a live route from the render half. `StateHash` folds
            // `PathIndex` and the path COUNT but not its contents, so the hash alone is a partial
            // instrument here — this pair is the whole one.
            Assert.AreEqual(pathLenBefore, her.Path.Count,
                "the render overwrote a live crew member's ROUTE. FindPath writes its out-parameter, " +
                "which is why the scratch list must be the session's and never the citizen's.");
            Assert.AreEqual(pathIdxBefore, her.PathIndex, "…and her position along it");
            Assert.AreEqual(before, sim.StateHash(),
                "rendering a no-route row moved the determinism hash. The render half may READ the " +
                "sim's pathfinder and may never write sim state.");
        }

        /// <summary>
        /// ⛔ <b>SCOPE: the reason is emitted for a machine the PLAYER pointed at, and for nothing
        /// else.</b> On the shipped wreck most machines behind the shut spine doors are unreachable
        /// at boot; badging all of them would be a permanent screenful of nags about work nobody
        /// ordered — omission (4) of the channel's header, and the same rule that keeps
        /// <see cref="WireFormat.ReasonNoConsumable"/> off automatic maintenance.
        /// </summary>
        [Test]
        public void UnorderedUnreachableMachines_AreNeverBadged()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            for (int t = 0; t < 200; t++) sim.Tick();

            Assert.That(Rows(gs).All(r => r.Reason != WireFormat.ReasonNoRoute), Is.True,
                "no order was ever issued on this fixture, and the wreck is full of unreachable " +
                "machines — not one of them may carry this reason");
        }
    }
}
