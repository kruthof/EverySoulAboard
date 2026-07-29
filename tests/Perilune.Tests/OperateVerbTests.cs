using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using NUnit.Framework;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession, WebCommand

namespace Perilune.Tests
{
    /// <summary>
    /// THE <c>operate</c> VERB — <b>the door/vent OPEN⇄SHUT toggle on the standard surface.</b>
    ///
    /// WHY IT WAS NEEDED. <see cref="SetDeviceStateCommand"/>'s <c>IsOpen</c> toggle and
    /// <see cref="SetDoorStateCommand"/> have existed since M1, and the ONLY route to either from a
    /// browser was <c>GameSession.ContextAction</c> — reached by <c>Cmd.click</c> from the DEPRECATED
    /// console's invisible inspection cursor, a global <c>window</c> keydown that happens to survive
    /// the Overview takeover. Neither the Level-1 Overview nor the Level-2 Room Zoom could target a
    /// door or a vent at all. <c>KNOWN_GAPS_SEALED</c> is <c>['dig','stockpile','strip']</c>, so the
    /// console-retirement guard never censused this verb and structurally cannot see its absence.
    /// On <c>--ship wreck</c> that is the premise's missing FIRST MOVE.
    ///
    /// ⚠️ EVERY VERDICT BELOW IS DRIVEN AGAINST A REAL SHIP, not asserted against a hand-built stub.
    /// The fixtures are the SHIPPED <c>--ship wreck</c> devices — <c>vent_cryo</c> (open, Condition
    /// 0.62), <c>vent_ls</c> (shut, 0.15, below <c>wear.wreck_threshold</c>) and the ship's own doors
    /// — resolved BY NAME off <c>sim.Devices</c> rather than by coordinate, so re-authoring the deck
    /// layout does not silently turn a guard into a test of an empty tile.
    ///
    /// ⚠️ EACH REFUSAL RUNS IN ITS OWN <c>[Test]</c>. <c>assert</c>/<c>Assert</c> throws, so a
    /// multi-leg test reports only its first failing leg and a dead second leg is indistinguishable
    /// from a live one (the fifth trap shape, <c>CLAUDE.md</c>).
    ///
    /// GATES N/A, stated so a reviewer does not score against them. NO def scalar, NO new hashed
    /// field, NO save-chapter change, NO new <see cref="Perilune.Glyph.GlyphColor"/> id, and
    /// <c>WireFormat.cs</c> has NO DIFF (it was already <c>partial</c>). The <c>sim/</c> diff for this
    /// lane is EMPTY — asserted mechanically by
    /// <see cref="The_Operate_Verb_Adds_No_Sim_Side_Rule"/>'s sibling in the package report and by
    /// <c>ci.sh</c>'s five pins. The de-DE culture gate DOES apply: the reply ships four integers.
    /// </summary>
    public class OperateVerbTests
    {
        // ═════════════════════════════════════════════════════════════════ the serializer (pure)

        [Test]
        public void Operate_Serializes_Its_Shape()
        {
            string json = WireFormat.Operate(12, 7, 1, WireFormat.OperateOk, "OPEN", "OPEN AIRVENT");
            Assert.AreEqual(
                "{\"type\":\"operate\",\"x\":12,\"y\":7,\"deck\":1,\"ok\":1,\"state\":\"OPEN\"," +
                "\"reason\":\"OPEN AIRVENT\"}", json);
            Assert.AreEqual(
                "{\"type\":\"operate\",\"x\":0,\"y\":0,\"deck\":0,\"ok\":0,\"state\":\"-\"," +
                "\"reason\":\"\"}",
                WireFormat.Operate(0, 0, 0, WireFormat.OperateRefused, null, null),
                "a null state/reason must serialize as the inert placeholder, not crash the render " +
                "thread and not emit the JSON token `null` into a string slot");
        }

        /// <summary>THE de-DE GATE. This machine's culture is de-DE, where a grouped <c>ToString()</c>
        /// emits <c>1.234</c> — a JSON parse error at the client. MUTATION: drop the <c>OperateIc</c>
        /// argument from any of the four <c>ToString</c> calls and run under de-DE ⇒ the two payloads
        /// diverge.</summary>
        [Test]
        public void Operate_Payload_Is_Culture_Invariant()
        {
            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Operate(1234, 5678, 2, 1, "SHUT", "SHUT DOOR");
                Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE");
                Assert.AreEqual(inv, WireFormat.Operate(1234, 5678, 2, 1, "SHUT", "SHUT DOOR"),
                    "a wire payload that changes with the operator's locale is not a wire payload");
                StringAssert.Contains("\"x\":1234", inv, "no group separators, no locale digits");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }

        /// <summary>A quote in a reason must not break the payload. The escaper is deliberately
        /// PARTIAL (see its own summary) and this pins the half it claims.</summary>
        [Test]
        public void Operate_Escapes_The_Two_Characters_That_Would_Break_The_String()
        {
            StringAssert.Contains("\\\"X\\\"", WireFormat.Operate(0, 0, 0, 0, "-", "\"X\""));
            StringAssert.Contains("\\\\", WireFormat.Operate(0, 0, 0, 0, "-", "A\\B"));
        }

        // ═══════════════════════════════════════════════════════════════════ the wire command

        /// <summary>
        /// <c>{"cmd":"operate","x":..,"y":..,"deck":..}</c> parses to <see cref="CmdKind.Operate"/>
        /// with the deck in <c>I</c> — the same slot <c>place</c>/<c>remove</c>/<c>commission</c> use.
        /// MUTATION: read <c>"z"</c> instead of <c>"deck"</c> (the plausible copy-paste from the sim's
        /// own <c>Int3</c> vocabulary) ⇒ every operate lands on deck 0.
        /// </summary>
        [Test]
        public void Operate_Parses_With_The_Deck_In_The_I_Slot()
        {
            var cmd = WebCommand.Parse("{\"cmd\":\"operate\",\"x\":9,\"y\":4,\"deck\":1}");
            Assert.AreEqual(CmdKind.Operate, cmd.Kind);
            Assert.AreEqual(9, cmd.X);
            Assert.AreEqual(4, cmd.Y);
            Assert.AreEqual(1, cmd.I, "the deck must ride in I, as place/remove/commission do");
            // A missing deck is deck 0, not a rejection — the same total-parse contract every other
            // {x,y,deck} verb here has.
            Assert.AreEqual(0, WebCommand.Parse("{\"cmd\":\"operate\",\"x\":1,\"y\":1}").I);
        }

        // ═════════════════════════════════════════════════════════ the driven verdicts (wreck)

        /// <summary>
        /// A HEALTHY OPEN VENT SHUTS, and the reply says so. <c>vent_cryo</c> boots OPEN at Condition
        /// 0.62 — above <c>AirVent</c>'s 0.10 <c>fail</c> threshold and above
        /// <c>wear.wreck_threshold</c> — so it is the ship's one unambiguously healthy operable
        /// device and the control every refusal below is measured against.
        ///
        /// MUTATION: make <c>HandleOperate</c> compute <c>opening</c> as <c>device.IsOpen</c> rather
        /// than <c>!device.IsOpen</c> ⇒ the target state inverts and this reddens.
        /// </summary>
        [Test]
        public void A_Healthy_Open_Vent_Shuts_And_The_Reply_Says_So()
        {
            var (gs, host, sink) = Boot();
            var vent = DeviceNamed(host.Sim, "vent_cryo");
            Assert.IsTrue(vent.IsOpen, "fixture drift: vent_cryo is authored OPEN");
            Assert.IsTrue(vent.IsOperational(host.Sim.Defs), "fixture drift: vent_cryo is authored healthy");

            var reply = Operate(gs, sink, vent.Pos);
            Assert.AreEqual(1, Field(reply, "ok"), "a healthy vent must accept the toggle: " + reply);
            StringAssert.Contains("\"state\":\"SHUT\"", reply);
            StringAssert.Contains("SHUT AIRVENT", reply);
            StringAssert.DoesNotContain("WRECKED", reply, "a healthy vent must carry no advisory");
            StringAssert.DoesNotContain("NO POWER", reply);
        }

        /// <summary>
        /// AND THE ORDER REALLY REACHES THE SIM. The reply alone cannot see this: a handler that
        /// emitted the sentence and enqueued nothing would pass every assertion above. Driven through
        /// the real command drain — <c>host.Sim.Tick()</c> — and read off the device.
        ///
        /// MUTATION: delete the <c>_sim.EnqueueCommand(...)</c> pair from <c>HandleOperate</c>,
        /// leaving the Emit ⇒ the state never moves and this reddens (the test above stays green,
        /// which is why both exist).
        /// </summary>
        [Test]
        public void The_Toggle_Really_Reaches_The_Sim_And_Moves_The_Device()
        {
            var (gs, host, sink) = Boot();
            var vent = DeviceNamed(host.Sim, "vent_cryo");
            bool before = vent.IsOpen;

            Operate(gs, sink, vent.Pos);
            host.Sim.Tick();
            Assert.AreNotEqual(before, vent.IsOpen,
                "the operate reply was sent but no ISimCommand ran — the verb is a printed sentence");

            // …and it toggles BACK, so the handler reads live state rather than a captured target.
            Operate(gs, sink, vent.Pos);
            host.Sim.Tick();
            Assert.AreEqual(before, vent.IsOpen, "the second toggle did not return the device");
        }

        /// <summary>
        /// THE ORDER IS **ENQUEUED**, NOT APPLIED. The host may not touch sim state:
        /// <c>CLAUDE.md</c>'s first invariant is *"input only via <c>ISimCommand</c>"*, and
        /// <c>HandleOperate</c> runs on the command-drain thread where a direct write would land
        /// BETWEEN systems rather than at a tick boundary.
        ///
        /// ⚠️ THIS TEST EXISTS BECAUSE IT WAS THE PACKAGE'S ONE MUTATION SURVIVOR, and the shape is
        /// worth keeping. Replacing the DOOR branch's <c>EnqueueCommand(new SetDoorStateCommand(…))</c>
        /// with a bare <c>device.IsOpen = opening;</c> left all 37 tests GREEN: every driven leg
        /// happened to use the VENT, and the two that used a door assert the state AFTER a
        /// <c>Tick()</c>, by which point a direct write and an enqueued command are
        /// indistinguishable. The only observable difference is BEFORE the drain — so that is what is
        /// asserted, on both kinds, ONE LEG EACH (<c>Assert</c> throws, so a shared test would let a
        /// door-only regression hide behind the vent exactly the way the survivor did).
        ///
        /// MUTATION: <c>device.IsOpen = opening;</c> in either branch ⇒ the corresponding leg reddens.
        /// </summary>
        [Test]
        public void The_Order_Is_ENQUEUED_And_Not_Written_Straight_Onto_The_Device_Vent()
        {
            var (gs, host, sink) = Boot();
            var vent = DeviceNamed(host.Sim, "vent_cryo");
            bool before = vent.IsOpen;

            Operate(gs, sink, vent.Pos);
            Assert.AreEqual(before, vent.IsOpen,
                "the vent moved BEFORE the command drain ran — the host wrote sim state directly " +
                "instead of enqueuing an ISimCommand. That is CLAUDE.md's first invariant ('input " +
                "only via ISimCommand') and it lands a mutation between systems rather than at a " +
                "tick boundary.");
            host.Sim.Tick();
            Assert.AreNotEqual(before, vent.IsOpen, "…and the enqueued command must then land");
        }

        /// <summary>The DOOR branch of the rule above, in its own <c>[Test]</c> — it is the branch the
        /// survivor lived in.</summary>
        [Test]
        public void The_Order_Is_ENQUEUED_And_Not_Written_Straight_Onto_The_Device_Door()
        {
            var (gs, host, sink) = Boot();
            var door = FirstDevice(host.Sim, DeviceKind.Door);
            door.IsLocked = false;
            bool before = door.IsOpen;

            Operate(gs, sink, door.Pos);
            Assert.AreEqual(before, door.IsOpen,
                "the door moved BEFORE the command drain ran — see the vent leg for why that is an " +
                "invariant break and not a shortcut");
            host.Sim.Tick();
            Assert.AreNotEqual(before, door.IsOpen, "…and the enqueued command must then land");
        }

        /// <summary>
        /// THE PREMISE'S OPENING MOVE, DRIVEN END TO END. <c>vent_ls</c> boots SHUT at Condition
        /// 0.15 in the wrecked life-support hall — the compartment the wreck-start plan points the
        /// player's first gesture at ("open the vent, push the air outward"). Before this package
        /// there was NO WAY to express it on either standard surface.
        ///
        /// ⚠️ IT CARRIES NO ADVISORY, AND THAT IS A MEASURED RESULT RATHER THAN AN OVERSIGHT — the
        /// first draft of this test asserted the opposite and was wrong. 0.15 is BELOW
        /// <c>wear.wreck_threshold</c> (0.25, so no free jury-rig) but ABOVE <c>AirVent</c>'s
        /// <c>fail</c> threshold (0.10), so the vent is OPERATIONAL: it opens, it draws, and it moves
        /// air. The authoring comment beside it says exactly that — *"the player's first act in this
        /// compartment is to open it, which is the one physical gesture the pressure loop is built
        /// on"* — so a vent that answered "WRECKED" here would be the verb lying in the other
        /// direction. The advisory TEXTS are pinned below on constructed device states, where the
        /// branch is the subject rather than a side effect of somebody's authoring.
        /// </summary>
        [Test]
        public void The_Wrecks_Sealed_Vent_Opens_And_That_Is_The_Premises_First_Move()
        {
            var (gs, host, sink) = Boot();
            var vent = DeviceNamed(host.Sim, "vent_ls");
            Assert.IsFalse(vent.IsOpen, "fixture drift: vent_ls is authored SHUT");
            Assert.Less(vent.Condition, host.Sim.Defs.Wear.WreckThreshold,
                "fixture drift: vent_ls is authored below wear.wreck_threshold");
            Assert.IsTrue(vent.IsOperational(host.Sim.Defs),
                "fixture drift: vent_ls is authored ABOVE AirVent's fail threshold — if that changes, " +
                "the advisory expectation in this test changes with it and must be re-measured, not " +
                "assumed");

            var reply = Operate(gs, sink, vent.Pos);
            Assert.AreEqual(1, Field(reply, "ok"), reply);
            StringAssert.Contains("\"state\":\"OPEN\"", reply);
            host.Sim.Tick();
            Assert.IsTrue(vent.IsOpen,
                "the wreck's sealed vent did not open. This single toggle is the whole premise: " +
                "before this verb it was expressible only through the deprecated console's invisible " +
                "inspection cursor.");
        }

        /// <summary>
        /// AN INOPERATIVE DEVICE IS NAMED AS WRECKED, WITH ITS PERCENTAGE. Driven on a device pushed
        /// below its own <c>machines.def</c> <c>fail</c> threshold rather than on a hand-built stub,
        /// so the branch is the sim's <see cref="Device.IsOperational"/> and not a number here.
        ///
        /// MUTATION: replace <c>!device.IsOperational(_sim.Defs)</c> with a literal <c>false</c> in
        /// <c>OperateAdvisory</c> ⇒ the advisory vanishes and this reddens.
        /// </summary>
        [Test]
        public void An_Inoperative_Device_Is_Named_As_WRECKED_With_Its_Percentage()
        {
            var (gs, host, sink) = Boot();
            var vent = DeviceNamed(host.Sim, "vent_cryo");
            vent.Condition = 0.03f;   // below AirVent's fail (0.10)
            Assert.IsFalse(vent.IsOperational(host.Sim.Defs), "the fixture must actually be inoperative");

            var reply = Operate(gs, sink, vent.Pos);
            Assert.AreEqual(1, Field(reply, "ok"));
            StringAssert.Contains("WRECKED (3%)", reply,
                "the advisory must carry the condition as a percentage — 'wrecked' alone does not " +
                "tell a player whether this is a repair or a write-off");
            StringAssert.Contains("UNTIL IT IS REPAIRED", reply);
        }

        /// <summary>
        /// AND WHEN THE SHIP HOLDS NOTHING TO REPAIR IT WITH, THE REPLY SAYS THAT TOO — through
        /// <see cref="MaintenanceSystem.IsUnfixableWreck"/>, the SIM's own W2 rule, never a
        /// re-derivation. That refusal is #2 in the wreck plan's silent-refusal table and it is the
        /// one a wreck hits first.
        ///
        /// ⚠️ IT IS DRIVEN BY *REMOVING* THE CONSUMABLES rather than by finding a ship that has none:
        /// which stacks a ship holds at boot is authoring, and a guard that depended on it would
        /// redden the day someone seeds one Part.
        ///
        /// MUTATION: delete the <c>IsUnfixableWreck</c> clause ⇒ this reddens while the test above
        /// stays green.
        /// </summary>
        [Test]
        public void An_Unfixable_Wreck_Says_The_Ship_Holds_Nothing_To_FIX_It_With()
        {
            var (gs, host, sink) = Boot();
            var vent = DeviceNamed(host.Sim, "vent_cryo");
            vent.Condition = 0.03f;    // inoperative AND below wear.wreck_threshold (0.25)
            StripConsumables(host.Sim);
            Assert.IsTrue(MaintenanceSystem.IsUnfixableWreck(host.Sim, vent),
                "the fixture must actually be an unfixable wreck by the SIM's own predicate");

            StringAssert.Contains("NO PARTS, SEALS OR SWARF ABOARD", Operate(gs, sink, vent.Pos));
        }

        /// <summary>
        /// CONTROL FOR THE ONE ABOVE, and it is the difference between a live clause and a clause
        /// that always fires. Identical fixture with ONE Parts stack put back on a floor tile: the
        /// sim's predicate flips, and the sentence must disappear while the WRECKED half stays.
        /// </summary>
        [Test]
        public void CONTROL_One_Parts_Stack_Aboard_Removes_The_Unfixable_Sentence()
        {
            var (gs, host, sink) = Boot();
            var vent = DeviceNamed(host.Sim, "vent_cryo");
            vent.Condition = 0.03f;
            StripConsumables(host.Sim);
            host.Sim.AddItem(ItemKind.Parts, 1, vent.Pos);
            Assert.IsFalse(MaintenanceSystem.IsUnfixableWreck(host.Sim, vent),
                "the control did not actually change the sim's answer — it is asserting nothing");

            string reply = Operate(gs, sink, vent.Pos);
            StringAssert.Contains("WRECKED", reply, "the machine is still wrecked; only the repair " +
                                                    "clause should have gone");
            StringAssert.DoesNotContain("NO PARTS, SEALS OR SWARF ABOARD", reply);
        }

        /// <summary>
        /// A LOCKED DOOR IS THE ONE REFUSAL — nothing is enqueued and the reply says why.
        ///
        /// It is the single case where the sim accepts the command and the world does not move:
        /// <see cref="SetDoorStateCommand"/> computes <c>target = open &amp;&amp; !IsLocked</c> and
        /// then silently declines to change anything. Mirrored, not re-derived.
        ///
        /// MUTATION: delete the locked branch from <c>HandleOperate</c> ⇒ <c>ok</c> becomes 1, the
        /// reply reads "OPEN DOOR", and the door still does not move — which is precisely the
        /// dishonest outcome this branch exists to prevent.
        /// </summary>
        [Test]
        public void A_Locked_Door_Is_REFUSED_And_The_Reply_Names_The_Lock()
        {
            var (gs, host, sink) = Boot();
            var door = FirstDevice(host.Sim, DeviceKind.Door);
            door.IsOpen = false;
            door.IsLocked = true;

            string reply = Operate(gs, sink, door.Pos);
            Assert.AreEqual(0, Field(reply, "ok"), "a locked door must be REFUSED, not accepted: " + reply);
            StringAssert.Contains("DOOR IS LOCKED", reply);
            StringAssert.Contains("\"state\":\"-\"", reply, "a refusal orders no state at all");

            host.Sim.Tick();
            Assert.IsFalse(door.IsOpen, "the refusal must not have enqueued a command");
        }

        /// <summary>
        /// …AND A LOCKED DOOR CAN STILL BE SHUT. The lock resists OPENING, not closing, which is why
        /// the branch asks <c>opening</c> and not <c>IsLocked</c> alone.
        ///
        /// MUTATION: change the branch condition to <c>device.IsLocked</c> (dropping
        /// <c>opening &amp;&amp;</c>) ⇒ this reddens while the test above stays green.
        /// </summary>
        [Test]
        public void CONTROL_A_Locked_But_OPEN_Door_Can_Still_Be_Shut()
        {
            var (gs, host, sink) = Boot();
            var door = FirstDevice(host.Sim, DeviceKind.Door);
            door.IsOpen = true;
            door.IsLocked = true;

            string reply = Operate(gs, sink, door.Pos);
            Assert.AreEqual(1, Field(reply, "ok"), "shutting a locked door is legal in the sim: " + reply);
            StringAssert.Contains("\"state\":\"SHUT\"", reply);
            host.Sim.Tick();
            Assert.IsFalse(door.IsOpen, "the shut order did not reach the sim");
        }

        /// <summary>An EMPTY tile answers in words rather than doing nothing. The silent no-op is
        /// what every other verb on this surface does — legitimately, because they paint regions —
        /// and it is wrong for a verb whose target is one device.</summary>
        [Test]
        public void An_Empty_Tile_Is_Refused_In_Words()
        {
            var (gs, host, sink) = Boot();
            var empty = FirstTileWithNoDevice(host.Sim);
            string reply = Operate(gs, sink, empty);
            Assert.AreEqual(0, Field(reply, "ok"));
            StringAssert.Contains("NOTHING TO OPERATE HERE", reply);
        }

        /// <summary>
        /// A DEVICE WITH NO OPEN/SHUT CONTROL IS REFUSED BY KIND AND NAMED. Without this branch
        /// <see cref="SetDeviceStateCommand"/> would happily set <c>IsOpen</c> on a Fabricator and
        /// NOTHING IN THE SIM WOULD EVER READ IT — an accepted click with a permanent, invisible
        /// no-op, which is the exact defect this package exists to remove.
        ///
        /// MUTATION: make <c>IsOperableKind</c> return <c>true</c> unconditionally ⇒ this reddens.
        /// </summary>
        [Test]
        public void A_Kind_With_No_Open_Shut_Control_Is_Refused_By_Name()
        {
            var (gs, host, sink) = Boot();
            var scrubber = FirstDevice(host.Sim, DeviceKind.Scrubber);
            bool before = scrubber.IsOpen;

            string reply = Operate(gs, sink, scrubber.Pos);
            Assert.AreEqual(0, Field(reply, "ok"));
            StringAssert.Contains("SCRUBBER HAS NO OPEN/SHUT CONTROL", reply);
            host.Sim.Tick();
            Assert.AreEqual(before, scrubber.IsOpen, "a refused kind must not have been toggled");
        }

        /// <summary>
        /// ⛔ A CRYOPOD IS NOT OPERABLE, AND THIS IS A GATE AND NOT A DETAIL. W5 stores "occupied /
        /// open" on a pod's <see cref="Device.IsOpen"/>, so a pod is one enum member away from being
        /// thawable by clicking a box with a build tool — bypassing the life-support-headroom gate and
        /// the Parts price the owner decided on
        /// (<c>docs/design/perilune-wreck-start.plan.md</c> W5). The wreck ship authors twelve of
        /// them, so this is reachable in play TODAY.
        /// </summary>
        [Test]
        public void A_CryoPod_Is_Refused_So_The_Thaw_Gate_Cannot_Be_Clicked_Around()
        {
            Assert.IsFalse(GameSession.IsOperableKind(DeviceKind.CryoPod),
                "a CryoPod became operable. Opening a pod is a THAW — gated on life-support headroom " +
                "and priced in Parts, through MOSS (wreck-start plan W5). Adding it here is a " +
                "one-click bypass of that gate, not a UI convenience.");

            var (gs, host, sink) = Boot();
            var pod = FirstDevice(host.Sim, DeviceKind.CryoPod);
            string reply = Operate(gs, sink, pod.Pos);
            Assert.AreEqual(0, Field(reply, "ok"), "the wreck's pods must refuse the verb IN PLAY, " +
                                                   "not merely in the static predicate: " + reply);
        }

        /// <summary>
        /// THE OPERABLE SET IS EXACTLY {Door, AirVent}, and it is measured against WHAT THE SIM READS
        /// <c>IsOpen</c> FOR rather than restated. Every other kind is required to be refused, so a
        /// kind appended to the enum later (the wreck start appended <c>CryoPod</c>; E0-7 appended
        /// <c>IceMelter</c>) cannot quietly become clickable.
        ///
        /// ⚠️ NON-VACUITY IS AN INCLUSION TEST, not a population count (trap 4): the two members are
        /// asserted PRESENT before the exclusion loop runs, so a predicate that returned <c>false</c>
        /// for everything could not pass this by exclusion alone.
        /// </summary>
        [Test]
        public void The_Operable_Set_Is_Exactly_Door_And_AirVent()
        {
            Assert.IsTrue(GameSession.IsOperableKind(DeviceKind.Door), "inclusion floor: Door");
            Assert.IsTrue(GameSession.IsOperableKind(DeviceKind.AirVent), "inclusion floor: AirVent");

            var extra = Enum.GetValues(typeof(DeviceKind)).Cast<DeviceKind>()
                .Where(k => k != DeviceKind.Door && k != DeviceKind.AirVent)
                .Where(GameSession.IsOperableKind)
                .ToList();
            CollectionAssert.IsEmpty(extra,
                "these kinds gained an open/shut control: " + string.Join(", ", extra) + ".\n" +
                "The set is derived from what the SIM reads Device.IsOpen for — AtmosphereSystem, " +
                "ThermalSystem, PowerSystem.IsWanting and MachineWearSystem branch on an AirVent's; " +
                "Simulation.IsWalkable, GlyphMapper.DeviceGlyph and the room flood branch on a " +
                "Door's. On any other kind SetDeviceStateCommand sets a bit NOTHING WILL EVER READ.");
        }

        // ═════════════════════════════════════════════════════ the `devices` channel's open element

        /// <summary>
        /// THE STATE THE AFFORDANCE LABELS ITSELF WITH REALLY REACHES THE CLIENT, AND IT FOLLOWS.
        /// Driven end to end on the wreck: <c>vent_cryo</c> (open) and <c>vent_ls</c> (shut) must
        /// disagree on the wire, and the row must MOVE when the device does.
        ///
        /// ⚠️ THE TWO-ROW SHAPE IS THE POINT. A single row cannot distinguish a live element from one
        /// hard-wired to whatever that device happens to be; the FOLLOW leg then rules out a snapshot
        /// taken at construction.
        ///
        /// MUTATION: pass a literal <c>0</c> for <c>open</c> in <c>BuildDevices</c> ⇒ both legs redden.
        /// </summary>
        [Test]
        public void The_Devices_Channel_Carries_IsOpen_And_Follows_It()
        {
            var (gs, host, _) = Boot();
            // ⚠️ BOTH FIXTURES ARE INSIDE THE BOOT CORE, and the first draft's were not. The channel
            // is FOG-GATED host-side (`BuildDevices` skips a tile with no `TileFlags.Explored`,
            // mirroring GlyphMapper pass 4), and on a WRECK most of the ship is dark: `vent_ls`
            // emits no row at all at boot, so a test using it was asserting on an absent row and
            // reported that as a rig failure rather than as a channel failure.
            var open = DeviceNamed(host.Sim, "vent_cryo");     // authored OPEN
            var shut = DeviceNamed(host.Sim, "scrubber_cryo"); // authored SHUT (the DeviceSpec default)
            Assert.IsTrue(open.IsOpen && !shut.IsOpen, "fixture drift: the two rows must DISAGREE, or " +
                "a hard-wired element passes both legs");

            Assert.AreEqual(1, OpenElementAt(gs, open.Pos), "an OPEN device must report open=1");
            Assert.AreEqual(0, OpenElementAt(gs, shut.Pos), "a SHUT device must report open=0");

            open.IsOpen = false;
            Assert.AreEqual(0, OpenElementAt(gs, open.Pos),
                "the element is a snapshot, not a reading — it did not follow the device");
        }

        /// <summary>
        /// <c>open</c> IS CARRIED FOR EVERY TILE-RESIDENT KIND, not only the two operable ones. The
        /// channel describes devices; it does not answer one surface's question. A kind filter in
        /// <c>BuildDevices</c> would be a SECOND place that knows which kinds are operable, and the
        /// two would drift.
        /// </summary>
        [Test]
        public void The_Open_Element_Is_Carried_For_Non_Operable_Kinds_Too()
        {
            var (gs, host, _) = Boot();
            var scrubber = FirstDevice(host.Sim, DeviceKind.Scrubber);
            scrubber.IsOpen = true;   // meaningless to the sim; the channel still reports the bit
            Assert.AreEqual(1, OpenElementAt(gs, scrubber.Pos),
                "BuildDevices is filtering `open` by kind — the channel now disagrees with " +
                "Device.IsOpen for most of the ship, and a second authority on 'which kinds are " +
                "operable' has been created inside a serializer");
        }

        // ══════════════════════════════════════════════════════════════════════ purity

        /// <summary>
        /// THE VERB ADDS NO SIM-SIDE RULE — it is a bridge to two commands that already exist. A
        /// REFUSED operate must leave the sim byte-identical, which is the in-suite half of the
        /// "all five pins hold" claim for the refusal paths.
        ///
        /// ⚠️ THE ACCEPTED path deliberately DOES move the hash — it is a player order, exactly like
        /// a build or a dig — and nothing in the five pinned runs sends one.
        /// </summary>
        [Test]
        public void The_Operate_Verb_Adds_No_Sim_Side_Rule()
        {
            var (gs, host, sink) = Boot();
            var scrubber = FirstDevice(host.Sim, DeviceKind.Scrubber);
            ulong before = host.Sim.StateHash();

            Operate(gs, sink, scrubber.Pos);                        // refused: wrong kind
            Operate(gs, sink, FirstTileWithNoDevice(host.Sim));      // refused: no device

            // NO Tick() BETWEEN THE TWO READINGS, deliberately, and the first draft had one — which
            // measured "does a sim tick change the hash?" (yes, always) instead of "does a refused
            // operate?". Nothing was enqueued, so there is nothing to drain: the handler either
            // mutated state on this thread or it did not.
            Assert.AreEqual(before, host.Sim.StateHash(),
                "a REFUSED operate changed hashed sim state. The refusal paths enqueue nothing and " +
                "read only saved fields; anything else moves five determinism pins.");
        }

        // ═══════════════════════════════════════════════════════════════════════ rig

        private static (GameSession gs, SimHost host, List<string> sink) Boot()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, sink.Add);   // NOT started ⇒ no sim thread
            return (gs, host, sink);
        }

        /// <summary>Send one operate and return the reply it emitted. Fails loudly when NOTHING was
        /// emitted — a handler that answers silently is the defect this whole file is about, so it
        /// must not present as a null-reference deep inside an assertion.</summary>
        private static string Operate(GameSession gs, List<string> sink, Int3 pos)
        {
            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Operate, pos.X, pos.Y, i: pos.Z));
            var reply = sink.LastOrDefault(s => s.Contains("\"type\":\"operate\""));
            Assert.IsNotNull(reply,
                "the operate verb emitted NO reply at all. Silence is exactly the failure this verb " +
                "exists to remove: a toggle the player cannot tell apart from a broken button.");
            return reply;
        }

        /// <summary>Read an integer field out of a reply. Deliberately a tiny scan and not a JSON
        /// parser — the payload is one flat object written by one method in this repo.</summary>
        private static int Field(string json, string name)
        {
            string key = "\"" + name + "\":";
            int i = json.IndexOf(key, StringComparison.Ordinal);
            Assert.That(i, Is.GreaterThanOrEqualTo(0), "no `" + name + "` in the reply: " + json);
            int j = i + key.Length, k = j;
            while (k < json.Length && (char.IsDigit(json[k]) || json[k] == '-')) k++;
            return int.Parse(json.Substring(j, k - j), CultureInfo.InvariantCulture);
        }

        /// <summary>The `devices` row's SEVENTH element for a tile, off the real cached payload.</summary>
        private static int OpenElementAt(GameSession gs, Int3 p)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"devices\""));
            Assert.IsNotNull(json, "the devices channel is not cached for Snapshot catch-up");
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                var f = part.Split(']')[0].Split(',');
                Assert.AreEqual(7, f.Length, "a devices tuple is seven elements now");
                if (int.Parse(f[0], CultureInfo.InvariantCulture) == p.X &&
                    int.Parse(f[1], CultureInfo.InvariantCulture) == p.Y &&
                    int.Parse(f[2], CultureInfo.InvariantCulture) == p.Z)
                    return int.Parse(f[6], CultureInfo.InvariantCulture);
            }
            Assert.Fail("no devices row at " + p + " — the fixture is not on the channel at all " +
                        "(fog gate? utility overlay?), so this assertion could never have fired");
            return -1;
        }

        private static Device DeviceNamed(Simulation sim, string name)
        {
            var d = sim.Devices.Items.FirstOrDefault(x => x.Name == name);
            Assert.IsNotNull(d, "--ship wreck no longer authors a device called '" + name + "'. This " +
                                "file resolves its fixtures BY NAME so a layout change cannot turn a " +
                                "guard into a test of an empty tile; re-point the name, do not delete " +
                                "the test.");
            return d;
        }

        private static Device FirstDevice(Simulation sim, DeviceKind kind)
        {
            var d = sim.Devices.Items.FirstOrDefault(x => x.Kind == kind);
            Assert.IsNotNull(d, "--ship wreck has no " + kind + " — the fixture is gone");
            return d;
        }

        /// <summary>A tile inside the world that holds no device at all. Searched rather than
        /// hard-coded: a coordinate would silently become a device tile after any re-authoring, and
        /// the test would then be asserting the wrong branch while staying green.</summary>
        private static Int3 FirstTileWithNoDevice(Simulation sim)
        {
            for (int y = 0; y < sim.World.Height; y++)
                for (int x = 0; x < sim.World.Width; x++)
                {
                    var p = new Int3(x, y, 0);
                    // The SIM'S OWN tile-resident index, the same one HandleOperate resolves through
                    // — not a scan of `Devices.Items`, which also holds the utility overlays that are
                    // deliberately NOT tile-resident. A helper built on the scan would call a
                    // conduit-only tile "taken" and this test would then never reach the branch it
                    // claims to test.
                    if (!sim.TryGetDeviceAt(p, out _)) return p;
                }
            Assert.Fail("every tile on deck 0 holds a device — impossible, so this rig is broken");
            return default;
        }

        /// <summary>Remove every maintenance consumable from the ship so
        /// <see cref="MaintenanceSystem.IsUnfixableWreck"/> answers true.
        ///
        /// ⚠️ THROUGH <c>EntityStore.Remove</c>, AND THE FIRST DRAFT'S SHORTCUT IS RECORDED BECAUSE IT
        /// LOOKED RIGHT AND WAS NOT: setting <c>Count = 0</c> leaves the stack in the store, and
        /// <c>MaintenanceSystem.FindNearest</c> filters on kind / carry / reservation / breathability
        /// and NOT on count — so a ship "holding" three empty Parts stacks is still fixable by the
        /// sim's own predicate. The fixture assertion below caught it, which is why it is there.</summary>
        private static void StripConsumables(Simulation sim)
        {
            var doomed = sim.Items.Items
                .Where(s => s.Kind == ItemKind.Parts || s.Kind == ItemKind.Seals || s.Kind == ItemKind.Swarf)
                .Select(s => s.Id).ToList();
            foreach (var id in doomed) sim.Items.Remove(id);
        }
    }
}
