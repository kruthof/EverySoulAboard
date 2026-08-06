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
    /// reachable</b>, so the order is ACCEPTED. She then walks to the NEAREST Parts stack, and the
    /// instant she stands on it <c>DriveWorker</c>'s pickup branch re-asks
    /// <c>FindPath(worker → staging)</c>, gets false, and calls <c>Abandon</c> — which clears
    /// <c>JobKind</c>, which clears <c>HeldByOrder</c>, which IS the order. Measured on the shipped
    /// wreck, unmodified: taken at tick 1, dropped when she reaches that stack.
    /// ⛔ <b>THE TICK AND THE TILE ARE NOT QUOTED HERE ANY MORE — see the note below; they have moved
    /// twice and nothing in this file asserts them.</b></para>
    ///
    /// <para>⚠️ <b>THE ROUTE HAS MOVED TWICE, AND THE SECOND TIME IS WHY THE NUMBERS ARE NOW GONE
    /// FROM THIS HEADER RATHER THAN UPDATED.</b>
    /// It first read <i>"walks 17 sim-seconds to the ship's ONE Parts stack at (7,14,0) … dropped at
    /// tick 171"</i>, true while the reactor bay held the only Parts aboard. D7 (2026-08-03) put the
    /// <c>cabin stores</c> in the CRYO BAY at <c>(2..8, 6, 0)</c>, five tiles from where she wakes,
    /// and it became <b>tick 51 at (3,6,0)</b> — driven as a 2×2, the cache the only difference,
    /// with the old trace reproduced to the digit.
    /// ⛔ The owner's declutter ruling (2026-08-06) then moved the cache OUT of the pod bay
    /// altogether: the crates are at <c>(2..8, 15, 0)</c> in the reactor bay. RE-DERIVED on the
    /// shipped ship — she wakes at <c>(3,1,0)</c> and the nearest Parts is the crate at
    /// <c>(3,15,0)</c>, Manhattan <b>14</b> (the <c>spares</c> at <c>(7,14,0)</c> is 17). <b>The drop
    /// TICK was NOT re-driven and is deliberately not written down</b>: it is longer than 51 and of
    /// the same order as the pre-D7 171, and a figure nobody measured has no place in a header that
    /// two lanes have already had to correct.
    /// The DIAGNOSIS is untouched — it is reachability, and the pickup branch is still the arm that
    /// kills the order. ⛔ NO ASSERTION IN THIS FILE EVER PINNED EITHER NUMBER; they lived in prose,
    /// so a green gate could not see them move, and the same line has now gone stale twice.</para>
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
    /// <para>⛔⛔ <b>THE FIRST PACKAGE'S SCOPE WAS NARROWER THAN "THE `:464` ARM IS COVERED", AND THE
    /// D5 FOLLOW-ON (2026-08-03) CLOSES THE REST OF IT — THE FILE IS IN TWO HALVES AND THE SECOND
    /// STARTS AT ITS OWN BANNER.</b> What the first half surfaces is that arm <b>when the route is
    /// shut AT ISSUE TIME</b>: order the same machine with <c>door_d0_s2</c> OPEN and shut it
    /// mid-order and the job died at the identical arm with <b>nothing on any surface</b> — taken
    /// tick 1, the first render RETIRES the pending record (arm (1) — the held job is the order from
    /// then on), door shut tick 41, dropped tick 171, channel <c>cells:[]</c> — ⚠️ that 171 is the
    /// PRE-D7 route and is left as the record of the sighting; the shipped ship drops at 51 (see the
    /// 2×2 above), and this leg's subject is the empty channel, not the tick. Structural, not a
    /// missing predicate. The follow-on takes the ruled shape: <b>the SIM publishes
    /// <c>OrderDroppedEvent</c> from <c>MaintenanceSystem.Abandon</c></b> — the one funnel all NINE
    /// abandon arms go through — and <c>GameSession</c> re-asks the sim's own killing question, live,
    /// every render. <c>MECHANICS</c> §13.25 b3/b3′.</para>
    ///
    /// <para>⚠️ <b>WHAT NEITHER PACKAGE DOES.</b> Re-issue the order when the route opens: RimWorld's
    /// <c>Pawn_MindState.priorityWork</c> record is still not built (<c>MECHANICS</c> §13.25d), so
    /// the badge clears with the route and the player re-orders. And <b>three of the six drop reasons
    /// are FILED rather than badged</b> — <c>Displaced</c> and <c>CargoLost</c> are self-healing, and
    /// <c>NoRouteToConsumable</c> has no host-side twin to re-ask. The rule is one sentence and it is
    /// stated on <c>GameSession.BuildBlocked</c>'s fifth walk: a dropped order is badged if and only
    /// if this host can RE-ASK THE SIM'S OWN KILLING QUESTION, live.</para>
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
        private static List<(int X, int Y, int Deck, int Order, int Reason, int Detail, int Cid)> Rows(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"blocked\""));
            Assert.IsNotNull(json, "the blocked channel must be cached for Snapshot catch-up");
            var rows = new List<(int, int, int, int, int, int, int)>();
            int at = json.IndexOf("[[", System.StringComparison.Ordinal);
            if (at < 0) return rows;
            foreach (var part in json.Substring(at + 1).Split('['))
            {
                if (part.Length == 0 || !char.IsDigit(part[0])) continue;
                var f = part.Substring(0, part.IndexOf(']')).Split(',');
                Assert.That(f.Length, Is.EqualTo(7), "a blocked tuple is seven elements since D5 OVERVIEW");
                rows.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                          int.Parse(f[1], CultureInfo.InvariantCulture),
                          int.Parse(f[2], CultureInfo.InvariantCulture),
                          int.Parse(f[3], CultureInfo.InvariantCulture),
                          int.Parse(f[4], CultureInfo.InvariantCulture),
                          int.Parse(f[5], CultureInfo.InvariantCulture),
                          int.Parse(f[6], CultureInfo.InvariantCulture)));
            }
            return rows;
        }

        private static (int X, int Y, int Deck, int Order, int Reason, int Detail, int Cid)? RepairRowAt(GameSession gs, Int3 p)
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
        /// been gone long before the drop (a walk of at least a dozen tiles on any version of this
        /// ship — 171 pre-D7, 51 while the cache sat in the pod bay, longer again since the
        /// 2026-08-06 declutter ruling moved it to the reactor bay; see the class header —
        /// the leg waits for the drop rather than pinning the tick).</para>
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
        /// ⭐⭐ <b>D5 OVERVIEW — THE ROW NAMES THE PERSON, so the screen the player is actually looking
        /// at can say it.</b> The badge closed the silence on the machine's TILE, in the Room Zoom. On
        /// the Level-1 Overview the ordered crew member went straight back to <i>"Awaiting orders"</i>
        /// and nothing pointed anywhere — the D5 family's last playtest-facing residue (HANDOVER:
        /// <i>"badge Room-Zoom-only (Overview dock bare)"</i>). The Overview's crew dock is keyed by
        /// CREW and this channel by TILE, so the join needs the owner ON the row.
        ///
        /// <para><b>DRIVEN ON BOTH SIDES OF THE DROP</b>, because both are states a player sits in and
        /// they are served by two different host walks: the PENDING walk while she is still walking
        /// (tick 1) and the DROPPED walk after the sim has let go (tick 600). A cid that only survived
        /// one of them would put the sentence on the dock and then take it away again while the badge
        /// stayed up — two surfaces disagreeing about one order, which is the whole thing the shared
        /// row prevents.</para>
        ///
        /// <para>⛔ <b>IT ASSERTS HER ID, NOT MERELY "NOT THE SENTINEL".</b> An emitter that hard-coded
        /// <c>0</c>, or that passed the DEVICE's id, or that filled the element from the wrong loop
        /// variable, would pass a not-equal-to-−1 check and would put a fault sentence on the wrong
        /// crew member's dock row — a lie about a person, which is worse than the silence it replaced.</para>
        ///
        /// <para>MUTATION: pass <c>WireFormat.CidNone</c> instead of <c>c.Id</c> in
        /// <c>GameSession.AddNoRouteRow</c>'s two call sites ⇒ RED on both halves.</para>
        /// </summary>
        [Test]
        public void TheRowNamesTheORDEREDCrewMember_SoTheOverviewsDockCanSayIt()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var machine = ByName(sim, TheMachine);
            var her = sim.Citizens.Items[0];

            OrderOverTheWire(gs, her, machine);
            sim.Tick();

            var pending = RepairRowAt(gs, machine.Pos);
            Assert.That(pending, Is.Not.Null, "premise: the issue-time badge is up (see the leg above)");
            Assert.That(pending.Value.Cid, Is.EqualTo((int)her.Id),
                "⛔ the row does not name the crew member the player ordered, so the Overview's crew " +
                "dock has nothing to join on and she is back to reading 'Awaiting orders' while the " +
                "machine wears the reason one screen away. THAT IS THE DEFECT.");

            for (int t = 0; t < 600; t++) sim.Tick();

            Assert.That(her.JobKind, Is.EqualTo(JobKind.None), "premise: the sim has dropped the job");
            var dropped = RepairRowAt(gs, machine.Pos);
            Assert.That(dropped, Is.Not.Null, "premise: the badge survives the drop (see the leg above)");
            Assert.That(dropped.Value.Cid, Is.EqualTo((int)her.Id),
                "the DROPPED walk lost the owner the PENDING walk carried — the dock sentence would " +
                "appear while she walks and vanish at the exact moment she has nothing left to do");
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
                "and the identical order that died on the pickup branch now walks the crew member to the " +
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

        // ═════════════════════════════════════════════ D5 FOLLOW-ON: THE ORDER THAT DIES MID-WAY
        //
        // ⭐⭐ WHAT THE RESIDUAL ABOVE WAS, AND WHAT CLOSES IT. Everything before this line rides
        // `GameSession._prioritised` — the record of an order the sim has NOT taken — which is
        // retired on the first render after it IS taken. So the legs above surface the route that
        // was shut AT ISSUE TIME and nothing else: order the same machine with the door OPEN, shut
        // it while she walks, and the job died at the identical arm with `cells:[]`.
        //
        // THE SHAPE, and it is the one the previous lane's reviewer ruled for: the SIM publishes
        // `OrderDroppedEvent` from `MaintenanceSystem.Abandon` — the ONE funnel all NINE of
        // `DriveWorker`'s abandon arms go through — carrying a `JobDropReason`; `GameSession`
        // catches it at the TICK boundary (never at render: the bus swaps every tick and a drop is
        // a one-tick event) and files it; and `BuildBlocked`'s fifth walk RE-ASKS the sim's own
        // killing question, live, every render. The record says WHICH QUESTION about WHICH machine;
        // it is not the answer, so nothing here is latched.
        //
        // ⚠️ THESE LEGS DRIVE `gs.AdvanceTicks`, NEVER `sim.Tick()` — and that is not a style
        // choice. `AdvanceTicks` is what the run loop calls, and it is where the event is read; a
        // leg that ticked the sim directly would run the game the shipping host never runs and
        // would see the bus swap the evidence away. (`SleeperPersonaTests` pins that the run loop
        // really does call it, which is the other half of this claim and is not restated here.)

        /// <summary>Advance the way <c>Run</c> does — the tick AND the host observations that follow
        /// it, which are not separable (<c>AdvanceTicks</c>' own remarks).</summary>
        private static void Advance(GameSession gs, int ticks) => gs.AdvanceTicks(ticks);

        /// <summary>Order the machine with the route OPEN and let the sim take it, then hand back
        /// the door so the caller can shut it. Also RENDERS once, which is what retires the pending
        /// record — the structural fact the whole residual rests on, asserted here so every leg
        /// built on this fixture inherits it as a checked premise rather than as a belief.</summary>
        private static (Device Machine, Citizen Her, Device Door) OrderWithTheRouteOpen(GameSession gs, Simulation sim)
        {
            var machine = ByName(sim, TheMachine);
            var her = sim.Citizens.Items[0];
            Assert.That(sim.TryGetDeviceAt(TheDoor, out var door), Is.True, "premise: the door is there");
            door.IsOpen = true;

            OrderOverTheWire(gs, her, machine);
            Advance(gs, 1);
            Assert.That(her.JobKind, Is.EqualTo(JobKind.Maintain), "premise: the order was ACCEPTED");
            Assert.That(her.HeldByOrder, Is.True, "premise: …and held — the hold IS the order");

            Assert.That(RepairRowAt(gs, machine.Pos), Is.Null,
                "premise: with the route open there is nothing to say, so no badge");
            Assert.That(gs.PendingOrderCount, Is.EqualTo(0),
                "⛔ PREMISE OF THE WHOLE RESIDUAL: the first render RETIRES the pending record. If " +
                "this ever reads 1, the mid-order case is no longer structural and these legs are " +
                "measuring something else.");
            return (machine, her, door);
        }

        /// <summary>Every stack of every repair consumable, gone from the ship — the state
        /// <c>DriveWorker</c>'s empty-handed arm (<c>:479</c>) tests for. Asserts it removed
        /// something: a strip that stripped nothing would leave the leg vacuous and green.</summary>
        private static void StripEveryConsumable(Simulation sim)
        {
            var doomed = new List<uint>();
            foreach (var stack in sim.Items.Items)
                for (int tier = 0; tier < MaintenanceSystem.RepairConsumableTierCount; tier++)
                    if (stack.Kind == MaintenanceSystem.RepairConsumableTier(tier)) { doomed.Add(stack.Id); break; }
            Assert.That(doomed.Count, Is.GreaterThan(0),
                "the wreck boots with repair consumables aboard — a strip that found none means this " +
                "fixture is not the one the leg describes");
            foreach (var id in doomed) sim.Items.Remove(id);
        }

        /// <summary>
        /// ⭐⭐ <b>THE PACKAGE'S HEADLINE, DRIVEN ON THE SHIPPED WRECK: THE ROUTE CLOSES WHILE SHE
        /// IS WALKING, AND THE MACHINE STILL SAYS WHY.</b> This is §13.25 b3's reproduction, verbatim
        /// — order with <c>door_d0_s2</c> OPEN, shut it mid-order, and the job dies at the identical
        /// pickup branch (<c>MachineWearSystem.cs:464</c>) that the issue-time half surfaces. Before
        /// this package the <c>blocked</c> channel read <c>cells:[]</c> here and the crew dock read
        /// <i>"Awaiting orders"</i>: the order evaporated.
        ///
        /// <para>⛔ <b>NOTHING ABOVE THIS LINE CAN SEE IT.</b> The pending record is already retired
        /// (asserted in the fixture), so no re-ask of <c>_prioritised</c> — however clever — reaches
        /// this state. That is why the fix had to come out of the SIM.</para>
        ///
        /// <para>MUTATIONS, RUN — and ⚠️ <b>THE COUNTS BELOW ARE RE-MEASURED ON THIS TREE, NOT THE
        /// ONES THIS COMMENT FIRST CARRIED.</b> The first draft said "the two sibling arm legs" and
        /// "the same 3 red"; independent review re-ran them and measured <b>SIX</b>. The stale figure
        /// was written before <see cref="RenderingTheDroppedOrderRow_RunsAnAStarAndStillTouchesNothing"/>
        /// existed and was never re-taken — <i>a count you did not measure yourself is not evidence,
        /// including your own earlier one</i>. The SIX are, by name:
        /// <see cref="TheRouteClosesMidOrder_AndTheMachineStillSaysWhy"/>,
        /// <see cref="TheDoorOpensAgain_TheBadgeAndTheRecordBothGo"/>,
        /// <see cref="TheLastConsumableVanishesMidOrder_AndTheBadgeNamesTheITEM_NotTheRoute"/>,
        /// <see cref="TheApproachIsWalledInMidOrder_AndTheBadgeSaysSO"/>,
        /// <see cref="ANewOrderSupersedesTheDeadOne_TheOldBadgeGoes"/> and
        /// <see cref="RenderingTheDroppedOrderRow_RunsAnAStarAndStillTouchesNothing"/> — i.e. every
        /// leg below this banner except <see cref="AnAutonomousAbandonIsNotAnOrder_AndIsNeverFiled"/>,
        /// which is the one that asserts a row must NOT appear.</para>
        ///
        /// <para>(1) Delete the <c>sim.Events.Publish(new OrderDroppedEvent…)</c> from
        /// <c>MaintenanceSystem.Abandon</c> ⇒ <b>6 red</b>.
        /// (2) Move the publish BELOW <c>AbandonOrphan(worker)</c> — the ordering the funnel's doc
        /// calls load-bearing, because the <c>JobKind</c> setter releases the hold ⇒ <b>the same 6
        /// red</b>, for the right reason (the channel goes permanently empty, not "the wrong reason
        /// arrives"). (3) Drop <c>NoteDroppedOrders()</c> from <c>AdvanceTicks</c> ⇒ <b>the same 6
        /// red</b>. (4) Move <c>NoteDroppedOrders()</c> into <c>Render</c> instead ⇒ <b>the same 6
        /// red</b>, because 600 ticks pass between renders in this fixture and the bus swapped the
        /// evidence away — which is the reliability claim, driven rather than argued.</para>
        /// </summary>
        [Test]
        public void TheRouteClosesMidOrder_AndTheMachineStillSaysWhy()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var (machine, her, door) = OrderWithTheRouteOpen(gs, sim);

            Advance(gs, 40);
            door.IsOpen = false;   // the route closes UNDER a live order — §13.25 b3's tick 41
            Advance(gs, 600);

            Assert.That(her.JobKind, Is.EqualTo(JobKind.None), "premise: the sim dropped the job");
            Assert.That(her.HeldByOrder, Is.False, "premise: and the hold with it — the order is gone");
            Assert.That(machine.Condition, Is.LessThan(sim.Defs.Machines[(int)machine.Kind].MaintainBelow),
                "premise: the machine is still unserviced — nothing here is a completed repair");

            var row = RepairRowAt(gs, machine.Pos);
            Assert.That(row, Is.Not.Null,
                "⛔ THIS IS §13.25 b3: the order was accepted, the world changed under it, the sim " +
                "ate it — and the ship said nothing at all.");
            Assert.That(row.Value.Reason, Is.EqualTo(WireFormat.ReasonNoRoute),
                "the route is what killed it, so the route is what the badge must name");
            Assert.That(row.Value.Detail, Is.EqualTo(WireFormat.DetailNone));
        }

        /// <summary>
        /// ⭐ <b>LIVE, NOT LATCHED — the drop record is a QUESTION, not an answer.</b> Re-open the
        /// door and the badge is gone on the next frame, and the record is dropped with it (so it
        /// cannot come back if the door shuts again with no order outstanding).
        ///
        /// <para>⚠️ <b>THIS IS THE NON-VACUITY CONTROL FOR THE LEG ABOVE, BY EXCLUSION.</b> A fifth
        /// walk that badged every dropped order regardless of the world would pass the headline and
        /// fail here; without this cell "the badge appears" is compatible with "the badge always
        /// appears". It also pins the CAUSE: the diagnosis says reachability, so the one edit that
        /// restores reachability must clear it.</para>
        ///
        /// <para>⚠️ AND IT PINS THE RECORD, NOT ONLY THE ROW. <c>DroppedOrderCount</c> going to zero
        /// is what makes this a re-ask rather than a suppressed latch — a row hidden by a display
        /// rule while the record lived on would read identically on the wire and would leak one
        /// entry per crew member for the rest of the session.</para>
        /// </summary>
        [Test]
        public void TheDoorOpensAgain_TheBadgeAndTheRecordBothGo()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var (machine, _, door) = OrderWithTheRouteOpen(gs, sim);

            Advance(gs, 40);
            door.IsOpen = false;
            Advance(gs, 600);

            Assert.That(RepairRowAt(gs, machine.Pos), Is.Not.Null, "premise: the badge is up");
            Assert.That(gs.DroppedOrderCount, Is.EqualTo(1), "premise: one dead order is on file");

            door.IsOpen = true;    // the player finds the door and opens it

            Assert.That(RepairRowAt(gs, machine.Pos), Is.Null,
                "⛔ the machine is still badged NO ROUTE with the route wide open — the fifth walk " +
                "is replaying a stored reason instead of re-asking the sim's question");
            Assert.That(gs.DroppedOrderCount, Is.EqualTo(0),
                "…and the record must go with the badge, or it leaks for the rest of the session");
        }

        /// <summary>
        /// ⭐⭐ <b>A SECOND ARM, AND A SECOND SENTENCE — the event covers ARMS, not one branch.</b>
        /// The route is fine; the ship's last repair consumable disappears while she is on her way to
        /// it. <c>DriveWorker</c> then lands on its empty-handed arm (<c>MachineWearSystem.cs:479</c>
        /// — a different line, a different phase, a different <c>JobDropReason</c>) and the badge
        /// says <see cref="WireFormat.ReasonNoConsumable"/>, naming the item, instead of NO ROUTE.
        ///
        /// <para><b>WHY THIS CASE CAN ONLY BE REACHED MID-ORDER.</b> <c>PrioritiseJobCommand</c>
        /// refuses an order at issue time when <c>IsUnfixableWreck(forced: true)</c>
        /// (<c>Commands.cs:346</c>), which is exactly "below the wreck floor and nothing aboard". So
        /// a ship with no consumables never gets this far — the state has to arrive AFTER the order
        /// was accepted, which is the whole subject of this half of the file.</para>
        ///
        /// <para>⚠️ THE DISCRIMINATION IS THE POINT: two legs, same fixture family, same click,
        /// different world change ⇒ different sentence. A fifth walk that emitted one canned reason
        /// would pass the headline and fail here.</para>
        /// </summary>
        [Test]
        public void TheLastConsumableVanishesMidOrder_AndTheBadgeNamesTheITEM_NotTheRoute()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var (machine, her, _) = OrderWithTheRouteOpen(gs, sim);

            Assert.That(MaintenanceSystem.IsBelowWreckFloor(sim, machine), Is.True,
                "premise: this machine is below wear.wreck_threshold, which is what makes the " +
                "empty-handed arm a REFUSAL rather than a free jury-rig");

            StripEveryConsumable(sim);
            Advance(gs, 600);

            Assert.That(her.JobKind, Is.EqualTo(JobKind.None), "premise: the sim dropped the job");

            var row = RepairRowAt(gs, machine.Pos);
            Assert.That(row, Is.Not.Null,
                "⛔ the ship ran out of parts under a live order and the machine she was pointed at " +
                "wears nothing");
            Assert.That(row.Value.Reason, Is.EqualTo(WireFormat.ReasonNoConsumable),
                "the CONSUMABLE is what killed it — a NO ROUTE badge here would send the player " +
                "looking for a door that is wide open");
            Assert.That(row.Value.Detail, Is.EqualTo((int)MaintenanceSystem.WantedRepairConsumable),
                "and it names the item, exactly as the issue-time wreck-rule row does");
        }

        /// <summary>
        /// ⭐ <b>A THIRD ARM: the machine loses its APPROACH mid-order</b> (<c>:321</c>,
        /// <c>JobDropReason.NoWorksiteTile</c>) ⇒ <see cref="WireFormat.ReasonNoApproach"/>, the
        /// sentence <i>NO WAY TO STAND NEXT TO IT</i>. Three arms, three reasons, three sentences,
        /// one event.
        ///
        /// <para>⛔ <b>THIS DOES NOT CLOSE §13.25 b2</b>, and the distinction is the reason the row
        /// is allowed: b2 is the order REFUSED AT ISSUE TIME for want of a staging tile, where no job
        /// is ever created and there is nothing to report. Here the order was accepted, a job
        /// existed, and the world took the approach away. Still filed, still open.</para>
        /// </summary>
        [Test]
        public void TheApproachIsWalledInMidOrder_AndTheBadgeSaysSO()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var (machine, her, _) = OrderWithTheRouteOpen(gs, sim);

            // Wall every walkable neighbour of the machine — the staging tile is whichever comes
            // first in `Neighbor4` order, so taking one is not enough to make `TryFindStagingTile`
            // fail and a leg that took one would pass for the wrong reason.
            int walled = 0;
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(machine.Pos, i);
                if (!sim.World.InBounds(n) || !sim.IsWalkable(n)) continue;
                sim.World.SetWall(n, TileDefs.Wall);
                walled++;
            }
            Assert.That(walled, Is.GreaterThan(0), "premise: the machine HAD an approach to take away");
            Assert.That(MaintenanceSystem.TryFindStagingTile(sim, machine.Pos, out _, forced: true), Is.False,
                "premise: and now it has none — this is the state `DriveWorker`'s first line tests");

            Advance(gs, 600);

            Assert.That(her.JobKind, Is.EqualTo(JobKind.None), "premise: the sim dropped the job");

            var row = RepairRowAt(gs, machine.Pos);
            Assert.That(row, Is.Not.Null, "⛔ the machine was walled in under a live order, silently");
            Assert.That(row.Value.Reason, Is.EqualTo(WireFormat.ReasonNoApproach),
                "NOWHERE TO STAND is a different fix from NO ROUTE — dig it out, versus open a door");
            Assert.That(row.Value.Detail, Is.EqualTo(WireFormat.DetailNone));
        }

        /// <summary>
        /// ⛔ <b>ONE SURFACE, NEVER TWO RECORDS — how the issue-time half and the mid-order half
        /// compose.</b> Order the machine with the door ALREADY SHUT (the original D5 sighting): the
        /// pending record is never retired, because <c>OrderedWorksiteIsOutOfReach</c> is asked
        /// BEFORE the taken-retire rule and keeps it alive. So when the sim later drops the job,
        /// <c>NoteDroppedOrders</c> must file NOTHING — the live record already owns the machine's
        /// row — and the player sees exactly one badge throughout.
        ///
        /// <para><b>WHY IT MATTERS THAT IT IS THE RECORD AND NOT THE ROW.</b> Both emitters dedupe
        /// per order+tile, so two records would still produce ONE row and the duplication would be
        /// invisible on the wire — right up until the door opened, when one record cleared and the
        /// other did not. This leg asserts the count, which is the only place that is visible.</para>
        /// </summary>
        [Test]
        public void TheIssueTimeBadgeOWNSTheMachine_TheDropFilesNothingBehindIt()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var machine = ByName(sim, TheMachine);
            var her = sim.Citizens.Items[0];

            OrderOverTheWire(gs, her, machine);   // door SHUT — the original sighting
            Advance(gs, 600);

            Assert.That(her.JobKind, Is.EqualTo(JobKind.None), "premise: the sim dropped the job");

            var rows = Rows(gs).Where(r => r.Order == WireFormat.OrderRepair
                                        && r.X == machine.Pos.X && r.Y == machine.Pos.Y
                                        && r.Deck == machine.Pos.Z).ToList();
            Assert.That(rows.Count, Is.EqualTo(1), "one machine, one badge");
            Assert.That(rows[0].Reason, Is.EqualTo(WireFormat.ReasonNoRoute));
            Assert.That(gs.PendingOrderCount, Is.EqualTo(1),
                "premise: the issue-time record is still alive — that is what the previous lane built");
            Assert.That(gs.DroppedOrderCount, Is.EqualTo(0),
                "⛔ a second record was filed behind the live one. Both would badge the same machine " +
                "today and disagree about when to stop tomorrow.");
        }

        /// <summary>
        /// ⛔ <b>THE SIM'S GATE, DRIVEN: an AUTONOMOUS abandon publishes nothing.</b> Turn Repair on
        /// for the whole crew — the OD-H opt-in a player makes in the WORK tab — and let the standing
        /// rule work the shipped wreck unattended. It reaches <c>Abandon</c> (measured: it does), and
        /// not one of those drops may be filed: the badge is for machines THE PLAYER POINTED AT, and
        /// a wreck full of half-dead machines behind shut doors would otherwise wear a permanent
        /// screenful of nags about work nobody ordered.
        ///
        /// <para><b>THE COVERAGE PREMISE IS ASSERTED, NOT DESCRIBED, AND IT COST A REDESIGN.</b>
        /// The first draft granted Repair, ran 2 000 ticks and counted <c>JobKind</c> leaving
        /// <c>Maintain</c> — it measured <b>ZERO</b>, and the leg would have pinned nothing while
        /// looking thorough. ⛔ The cause is worth writing down: <c>RecruitForNeediest</c> calls
        /// <c>DriveWorker</c> <i>immediately</i> on the tick it claims a machine, so an abandon and
        /// the next claim happen INSIDE one tick and a per-tick sampler never sees the gap. Measured
        /// on this fixture: she holds a Maintain job on 20 000 consecutive ticks with one visible
        /// "start". The abandon is therefore DRIVEN here rather than waited for — the machine she is
        /// actually working is walled in — and the premise is that her job LEAVES THAT MACHINE, which
        /// is observable exactly once.</para>
        ///
        /// <para>MUTATION, RUN: delete the <c>if (worker.HeldByOrder)</c> gate from
        /// <c>MaintenanceSystem.Abandon</c> ⇒ red here, on the record count.</para>
        /// </summary>
        [Test]
        public void AnAutonomousAbandonIsNotAnOrder_AndIsNeverFiled()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            foreach (var c in sim.Citizens.Items)
                sim.EnqueueCommand(new SetWorkPriorityCommand(c.Id, (int)WorkType.Repair, 3));

            Advance(gs, 50);
            var her = sim.Citizens.Items[0];
            Assert.That(her.JobKind, Is.EqualTo(JobKind.Maintain),
                "COVERAGE PREMISE: the standing rule really did put her on a machine unasked — " +
                "without that this leg pins nothing at all");
            Assert.That(her.HeldByOrder, Is.False,
                "COVERAGE PREMISE: and NOBODY ORDERED IT — that is the whole subject of this leg");
            var hers = her.JobTarget;

            // Take the approach away from the machine she is working: `DriveWorker`'s first line
            // (`:321`) then abandons it, autonomously, on the next pass.
            for (int i = 0; i < 4; i++)
            {
                var n = Int3.Neighbor4(hers, i);
                if (sim.World.InBounds(n) && sim.IsWalkable(n)) sim.World.SetWall(n, TileDefs.Wall);
            }
            Assert.That(MaintenanceSystem.TryFindStagingTile(sim, hers, out _, forced: true), Is.False,
                "premise: the machine she is on has lost its approach");

            Advance(gs, 60);
            Assert.That(her.JobTarget, Is.Not.EqualTo(hers),
                "COVERAGE PREMISE FAILED: she is still on the walled-in machine, so `Abandon` was " +
                "never reached and the gate below was never tested");

            Assert.That(gs.DroppedOrderCount, Is.EqualTo(0),
                "⛔ the dispatcher's own abandons are being filed as dropped ORDERS. Nobody clicked " +
                "anything on this ship.");
            Assert.That(Rows(gs).All(r => r.Order != WireFormat.OrderRepair), Is.True,
                "…and not one repair badge may appear on a ship where no order was ever given");
        }

        /// <summary>
        /// ⭐ <b>A NEW ORDER SUPERSEDES A DEAD ONE — the other half of "a live pending order always
        /// wins".</b> Her order at the unreachable machine died and is badged; the player gives up
        /// and points her at a different machine. The old badge must go with the old order: she is
        /// visibly not going there any more, and a sentence about a machine nobody is heading for is
        /// a nag about the past.
        ///
        /// <para>MUTATION, RUN: delete <c>_dropped.Remove(cmd.Cid)</c> from
        /// <c>GameSession.HandlePrioritise</c> ⇒ red here, on the stale badge.</para>
        /// </summary>
        [Test]
        public void ANewOrderSupersedesTheDeadOne_TheOldBadgeGoes()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var (machine, her, door) = OrderWithTheRouteOpen(gs, sim);

            Advance(gs, 40);
            door.IsOpen = false;
            Advance(gs, 600);
            Assert.That(RepairRowAt(gs, machine.Pos), Is.Not.Null, "premise: the dead order is badged");

            // A second machine, reachable, that the order verb will actually accept.
            Device other = null;
            foreach (var d in sim.Devices.Items)
            {
                if (d == machine || d.Kind == DeviceKind.Door) continue;
                if (d.Condition >= sim.Defs.Machines[(int)d.Kind].MaintainBelow) continue;
                if (!MaintenanceSystem.TryFindStagingTile(sim, d.Pos, out var st, forced: true)) continue;
                if (!sim.Paths.FindPath(sim, her.Pos, st, new List<Int3>())) continue;
                other = d;
                break;
            }
            Assert.That(other, Is.Not.Null, "premise: the wreck offers a second, reachable machine");

            OrderOverTheWire(gs, her, other);
            Advance(gs, 1);

            Assert.That(RepairRowAt(gs, machine.Pos), Is.Null,
                "⛔ the machine she was pulled OFF is still wearing the badge of an order the player " +
                "replaced — a nag about the past, on the surface built to say what is true now");
            Assert.That(gs.DroppedOrderCount, Is.EqualTo(0), "…and the record went with it");
        }

        /// <summary>
        /// ⭐⭐ <b>THE PURITY PIN FOR THE FIFTH WALK — it runs the SAME pathfinder from the render
        /// half, so the claim has to be re-earned rather than inherited.</b>
        ///
        /// <para>⛔ <b>WHY THE SIBLING PIN CANNOT SEE IT (the 9th trap shape, an instrument that goes
        /// blind on a state it was never given).</b>
        /// <see cref="RenderingTheNoRouteRow_RunsAnAStarAndStillTouchesNothing"/> orders with the door
        /// ALREADY SHUT, so the row it renders comes out of the PENDING walk and
        /// <c>_dropped</c> is empty for its whole life — the fifth walk's A* is never reached. Same
        /// method, different caller, and only this fixture enters through the new one.</para>
        ///
        /// <para><b>THE COVERAGE PREMISE IS ASSERTED</b> (the sibling's own hard lesson): without the
        /// row check, deleting the whole fifth walk would leave the hash comparison green and this
        /// leg would pin the purity of code it never ran. <b>AND THE BASELINE IS TAKEN BEFORE THE
        /// FIRST RENDER</b> — the sibling's other lesson, where a baseline snapshotted after a render
        /// already contained the first clobber and the named mutation stayed GREEN.</para>
        /// </summary>
        [Test]
        public void RenderingTheDroppedOrderRow_RunsAnAStarAndStillTouchesNothing()
        {
            var (gs, host) = BootWreck();
            var sim = host.Sim;
            var (machine, her, door) = OrderWithTheRouteOpen(gs, sim);

            Advance(gs, 40);
            door.IsOpen = false;
            Advance(gs, 600);

            Assert.That(gs.DroppedOrderCount, Is.EqualTo(1),
                "PREMISE: the drop is on file, so the fifth walk has something to ask about");

            ulong before = sim.StateHash();
            int pathLenBefore = her.Path.Count;
            int pathIdxBefore = her.PathIndex;
            // ⚠️ PREMISE **AND** DETECTOR, and it is written as both because that is how the named
            // mutation actually lands here. She still carries the walk that took her to the Parts
            // stack (measured: 10 tiles, index at the end — `Abandon` clears the JOB and deliberately
            // not the path), so there IS something for a careless render to overwrite. If the render
            // paths into `c.Path`, the fixture's OWN render (one, at tick 1, inside
            // `OrderWithTheRouteOpen`) has already clobbered it and this line is what reddens —
            // earlier than the two assertions below, for the same one cause. Read a red here as the
            // purity violation, never as a broken fixture.
            Assert.That(pathLenBefore, Is.GreaterThan(0),
                "either she is carrying no route at all (fixture drifted, and the two assertions " +
                "below are vacuous) or A RENDER ALREADY DELETED IT — `FindPath` CLEARS and rewrites " +
                "its out-parameter, so handing it a citizen's own `Path` wipes a live route from the " +
                "render half. The scratch list must be the session's and never the citizen's.");

            var row = RepairRowAt(gs, machine.Pos);   // renders — the first render after the baseline
            Assert.That(row, Is.Not.Null, "COVERAGE PREMISE FAILED: no row, so no A* ran and this " +
                "leg pins the purity of code it never reached");
            Assert.That(row.Value.Reason, Is.EqualTo(WireFormat.ReasonNoRoute),
                "COVERAGE PREMISE: and it is the ROUTE row — the only one on this walk that costs an A*");
            for (int i = 0; i < 4; i++) gs.RenderForTest();

            Assert.AreEqual(pathLenBefore, her.Path.Count,
                "the render overwrote a crew member's ROUTE — `FindPath` writes its out-parameter, " +
                "which is why the scratch list must be the session's and never the citizen's");
            Assert.AreEqual(pathIdxBefore, her.PathIndex, "…and her position along it");
            Assert.AreEqual(before, sim.StateHash(),
                "rendering a DROPPED-order row moved the determinism hash. The render half may READ " +
                "the sim's pathfinder and may never write sim state.");
        }

        // ════════════════════════════════════════════════════════ the arm count is the whole claim

        /// <summary>
        /// ⛔ <b>NINE ARMS, COUNTED IN THE FILE, PINNED HERE — because "one publish covers all nine"
        /// is this package's central claim and it is a claim about a NUMBER.</b> The compiler already
        /// forces every call site to NAME a reason (<c>Abandon</c>'s parameter has no default, on
        /// purpose), so what a scan adds is the count itself: the doc table on
        /// <see cref="JobDropReason"/> maps arm → reason line by line, and a tenth arm would leave it
        /// quietly incomplete while everything stayed green.
        ///
        /// <para>Reads CODE, NOT PROSE (<c>ArchitectureBoundaryTests.CodeOnly</c>, CLAUDE.md trap 1 —
        /// the shared stripper, never a second one), and both controls are below: a commented-out
        /// call must not count, and a real one must.</para>
        ///
        /// <para>⛔ <b>WHAT THIS TEST DOES NOT SAY, so its green is not read as more than it is:</b>
        /// it counts <c>DriveWorker</c>'s <c>Abandon</c> arms, and <c>Abandon</c> is not the only way
        /// a Maintain job ends in this file. <c>DriveWorkers</c> at <c>:207</c> calls
        /// <c>AbandonOrphan</c> directly when the ordered machine has been deconstructed, publishing
        /// nothing — named on <c>Abandon</c>'s own doc comment and in <c>MECHANICS</c> §13.25 b3′.
        /// A scan for the funnel cannot see a path that skips the funnel.</para>
        /// </summary>
        [Test]
        public void DriveWorkerHasNineAbandonArms_AndEveryDropReasonIsUsedByOne()
        {
            string code = ArchitectureBoundaryTests.CodeOnly(
                System.IO.File.ReadAllText(SimFile("Systems/MachineWearSystem.cs")));

            var calls = System.Text.RegularExpressions.Regex
                .Matches(code, @"Abandon\(sim, device, worker, JobDropReason\.(\w+)\)")
                .Cast<System.Text.RegularExpressions.Match>()
                .Select(m => m.Groups[1].Value).ToList();

            Assert.That(calls.Count, Is.EqualTo(9),
                "`MaintenanceSystem.DriveWorker` has " + calls.Count + " Abandon arms and this repo's " +
                "diagnosis (MECHANICS §13.25 b3, and JobDropReason's own table) says NINE. If an arm " +
                "was added, give it a reason in that table and raise this number; if one was removed, " +
                "the table has a dead row.");

            foreach (JobDropReason r in System.Enum.GetValues(typeof(JobDropReason)))
                Assert.That(calls.Contains(r.ToString()), Is.True,
                    "JobDropReason." + r + " is declared and no abandon arm uses it — a reason with " +
                    "no cause behind it, which the host's switch will then answer for forever");
        }

        /// <summary>NEGATIVE CONTROL for the scan above: a call that exists only in a COMMENT must
        /// not be counted. Trap 1's shape, and its stated fix is the shared stripper — this leg is
        /// what proves the stripper is actually in the path.</summary>
        [Test]
        public void TheArmScanIsNotSatisfiedByACommentedOutCall()
        {
            const string fixture =
                "class X {\n" +
                "  void A() { /* Abandon(sim, device, worker, JobDropReason.Displaced); */ }\n" +
                "  // Abandon(sim, device, worker, JobDropReason.CargoLost);\n" +
                "  void B() { Abandon(sim, device, worker, JobDropReason.NoConsumable); }\n" +
                "}\n";
            var found = System.Text.RegularExpressions.Regex
                .Matches(ArchitectureBoundaryTests.CodeOnly(fixture),
                         @"Abandon\(sim, device, worker, JobDropReason\.(\w+)\)")
                .Cast<System.Text.RegularExpressions.Match>()
                .Select(m => m.Groups[1].Value).ToList();

            Assert.That(found, Is.EqualTo(new List<string> { "NoConsumable" }),
                "the stripper let commented-out code satisfy the arm scan (or ate the real call) — " +
                "both halves are the control, because a scan that finds nothing and a scan that " +
                "cannot find anything look identical from the outside");
        }

        /// <summary>A path under <c>sim/Sim.Core</c>, found by walking up from the test binary to
        /// the repo root (the house pattern — the CWD under <c>dotnet test</c> is not the root).</summary>
        private static string SimFile(string relative)
        {
            var dir = new System.IO.DirectoryInfo(System.AppContext.BaseDirectory);
            while (dir != null)
            {
                string candidate = System.IO.Path.Combine(dir.FullName, "sim", "Sim.Core");
                if (System.IO.File.Exists(System.IO.Path.Combine(dir.FullName, "ci.sh")) &&
                    System.IO.Directory.Exists(candidate))
                    return System.IO.Path.Combine(candidate, relative);
                dir = dir.Parent;
            }
            Assert.Fail("the repo root (a directory holding both ci.sh and sim/Sim.Core) must be " +
                        "discoverable by walking up from " + System.AppContext.BaseDirectory);
            return null;
        }
    }
}
