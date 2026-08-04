using System;
using System.IO;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession, WebCommand, CmdKind

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ M3-15 / OD-N — <b>THE SHIP'S DOORS AND VENTS ANSWER ONLY TO A LIVE MOSS SERVER.</b>
    ///
    /// <para><b>WHAT WAS WRONG.</b> On the shipping <c>--ship wreck</c> at tick 0, a player could open
    /// any door with a free click, on a ship whose computer is a dead box in the corner. The MOSS
    /// prompt was WIDER still: <c>GameSession.HandleMoss</c> asked no question about any device at
    /// all, so <c>open door_d0_s1</c> typed into the console opened the door. The owner's ruling
    /// (OD-N) is that remote actuation belongs to MOSS, and MOSS belongs to a REPAIRED server.</para>
    ///
    /// <para>⛔ <b>THE GATE IS IN THE COMMANDS, NOT IN A HOST, AND THAT IS THE FILE'S FIRST CLAIM.</b>
    /// There are FIVE routes to <see cref="SetDoorStateCommand"/> / <see cref="SetDeviceStateCommand"/>
    /// — the web operate handler, the deprecated console's cursor toggle, the TUI, the headless
    /// scenario host, and MOSS's own DSL adapters. A host-side check would be <i>"not replayed on
    /// load, not folded into the hash, and not present in the TUI"</i> (M3-3's precedent) and would
    /// leave four back doors, one of them MOSS itself. ⚠️ <b>The single-authority leg is therefore
    /// DRIVEN ON THE SIM WITH NO HOST IN THE PICTURE</b> — a leg that goes through
    /// <c>GameSession</c> cannot tell a sim gate from a host gate.</para>
    ///
    /// <para>⚠️ <b>EACH REFUSAL AND EACH TIER RUNS IN ITS OWN <c>[Test]</c>.</b> <c>Assert</c> throws,
    /// so a multi-leg test reports only its first failing leg and a dead second leg is
    /// indistinguishable from a live one (the fifth trap shape, <c>CLAUDE.md</c>). The SPLIT's two
    /// halves — a repaired console opens a door, an uncommissioned one still refuses a program — are
    /// two tests for exactly that reason.</para>
    ///
    /// <para>GATES: NO def scalar (the threshold is <c>machines.def</c>'s existing
    /// <c>Terminal.maintain_below</c>), NO new hashed field, NO save-chapter change, NO new
    /// <c>DeviceKind</c>. P1–P5 are expected to HOLD, and <see cref="TheGateAddsNoHashedState"/>
    /// drives the reason rather than asserting it.</para>
    /// </summary>
    public class MossGateTests
    {
        private const string MossTerminal = "term_moss";
        private const string NavTerminal = "term_nav";
        private const string CryoVent = "vent_cryo";      // boots OPEN on the wreck
        private const string HydroVent = "vent_hydro";     // the fixture ships' authored vent

        /// <summary>The wreck's <c>term_moss</c> as authored. Restated by hand, not read from the
        /// plan: this file is about a THRESHOLD the ship is authored against, so deriving the number
        /// from the ship would make every leg below track a re-authoring instead of catching one.
        /// (<c>Sim.Gen/AuthoredShips.cs:2059</c>.)</summary>
        private const float AuthoredMossCondition = 0.14f;

        /// <summary>The <c>Terminal</c> row's two thresholds, by hand, same reason
        /// (<c>Sim.Core/Entities/MachineDefs.cs:42</c>). ⭐ THE GAP BETWEEN THEM IS THE WHOLE
        /// PACKAGE: 0.14 is ABOVE <c>fail</c> and BELOW <c>maintain</c>.</summary>
        private const float TerminalMaintainBelow = 0.20f;
        private const float TerminalFailBelow = 0.02f;

        /// <summary>What ONE bare-handed service leaves behind (<c>wear.def:18-20,61</c>) — the
        /// cheapest repair in the game, and it clears the gate with room to spare.</summary>
        private const float BareHandsService = 0.60f;

        private static Simulation Wreck() => ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
        private static Simulation Perilune() => ShipPlanBuilder.Build(AuthoredShips.Perilune(), Stack());
        private static Simulation Slice() => ShipPlanBuilder.Build(AuthoredShips.PeriluneSlice(), Stack());
        private static Simulation Grid() => ShipPlanBuilder.Build(AuthoredShips.PeriluneGrid(), Stack());

        private static ISimSystem[] Stack() => SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry()));

        private static Device Named(Simulation sim, string name)
        {
            var d = sim.Devices.Items.FirstOrDefault(x => x.Name == name);
            Assert.IsNotNull(d, "the ship no longer authors a device called '" + name + "'. This file " +
                                "resolves its fixtures BY NAME so a layout change cannot turn a guard " +
                                "into a test of nothing; re-point the name, do not delete the test.");
            return d;
        }

        /// <summary>Bring the wreck's MOSS server up the way one repair does — by moving the only
        /// field the gate reads. NOT by opening a door, NOT by touching a def, and NOT by a flag on
        /// the sim: if this helper ever needs more than one assignment, the gate has grown state.</summary>
        private static void Service(Simulation sim, string terminal = MossTerminal)
            => Named(sim, terminal).Condition = BareHandsService;

        // ═══════════════════════════════════════════════════ 1. THE PREDICATE, ON THE SHIPPED SHIP

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME TEST, AND THE CHARTER'S OWN CORRECTED DEFECT IN ONE ASSERTION.</b> The
        /// package was chartered against <c>Powered &amp;&amp; IsOperational</c>, which is TRUE on
        /// this ship at boot — so the gate would have shipped OPEN and OD-N would have delivered
        /// nothing.
        ///
        /// <para>⚠️ <b>THE NON-VACUITY PRECONDITION IS THE POINT OF THE TEST, NOT A COURTESY.</b>
        /// <c>IsOperational == true</c> is asserted in the SAME test: without it, a gate written
        /// against <c>fail</c> and a gate written against <c>maintain</c> are indistinguishable here,
        /// and the leg would prove nothing about which predicate shipped. (The same discipline M3-2's
        /// mutation 8 and M3-6's mutation 4 record.) MUTATION 3: rewrite
        /// <see cref="MossGate.IsServerLive"/> to ask <c>d.IsOperational(sim.Defs)</c> ⇒ this test is
        /// the one that reddens, on the SHIPPED wreck rather than on a fixture.</para>
        /// </summary>
        [Test]
        public void TheWreckBootsWithADarkConsole_AndItIsTheMaintainThresholdThatMakesItDark()
        {
            var sim = Wreck();
            var moss = Named(sim, MossTerminal);

            // The ship, as authored.
            Assert.That(moss.Condition, Is.EqualTo(AuthoredMossCondition).Within(1e-6f),
                "term_moss was re-authored; this file's whole subject is the band it sits in");
            Assert.That(moss.Powered, Is.True, "an unpowered terminal would make the leg below vacuous");

            // ⛔ NON-VACUITY: the CHARTERED term is TRUE here. If this ever reads False the ship has
            // been re-authored below `fail` and mutation 3 can no longer bite.
            Assert.That(moss.IsOperational(sim.Defs), Is.True,
                "term_moss is BELOW its fail threshold, so `Condition >= fail` and `Condition >= " +
                "maintain` now agree on this ship — mutation 3 has gone vacuous and this file no " +
                "longer proves which threshold the gate reads.");
            Assert.That(sim.Defs.Machines[(int)DeviceKind.Terminal].FailBelow,
                        Is.EqualTo(TerminalFailBelow).Within(1e-6f));
            Assert.That(sim.Defs.Machines[(int)DeviceKind.Terminal].MaintainBelow,
                        Is.EqualTo(TerminalMaintainBelow).Within(1e-6f));

            // ⭐ AND THE GATE IS SHUT ANYWAY.
            Assert.That(MossGate.IsServerLive(sim), Is.False,
                "the console is LIT at boot on the shipping wreck. OD-N asks for a repair to be the " +
                "player's first move; a gate that is open before they touch anything delivers nothing.");
        }

        /// <summary>One service — the cheapest one in the game — lights it. The other half of the
        /// outcome: a gate nothing can open is a brick, not a gate.</summary>
        [Test]
        public void OneServiceLightsTheConsole()
        {
            var sim = Wreck();
            Assert.That(MossGate.IsServerLive(sim), Is.False, "precondition");
            Service(sim);
            Assert.That(MossGate.IsServerLive(sim), Is.True,
                "a serviced terminal (bare hands ⇒ 0.60, the cheapest repair authored) still leaves " +
                "MOSS dark — the gate is asking for something a repair cannot give it.");
        }

        /// <summary>An unpowered terminal is not a server, however healthy its board. ⭐ THIS IS THE
        /// LEG THAT SEPARATES <c>Powered</c> FROM <c>IsOperational</c>: the latter does not read
        /// power at all (<c>Device.cs:119</c>), so asking both is not double-stating. MUTATION: drop
        /// <c>if (!d.Powered) continue;</c> ⇒ red here.</summary>
        [Test]
        public void APerfectlyHealthyTerminalWithNoPowerIsNotAServer()
        {
            var sim = Wreck();
            var moss = Named(sim, MossTerminal);
            moss.Condition = 1.0f;
            moss.Powered = false;
            Assert.That(moss.IsOperational(sim.Defs), Is.True, "non-vacuity: the board is fine");
            Assert.That(MossGate.IsServerLive(sim), Is.False,
                "an unpowered terminal answered as a live MOSS server");
        }

        /// <summary>⚠️ THE DISCLOSED BACK DOOR, PINNED AS A FACT RATHER THAN LEFT AS A SURPRISE. The
        /// predicate is ANY healthy powered Terminal — deliberately, because a
        /// <c>Name == "term_moss"</c> literal in <c>sim/Sim.Core/</c> would make every other ship
        /// ungateable. The integrator ruled to keep it (2026-07-31) because <c>term_nav</c> is
        /// unpowered, off-network and unreachable in the boot flood, so a player who can reach and
        /// power it has already opened the doors the console was gating. <b>This test records that
        /// the rule really is any-Terminal, so a content author who lights a second terminal finds a
        /// test that says so rather than a mystery.</b></summary>
        [Test]
        public void ANY_HealthyPoweredTerminalIsAServer_AndTheWreckSecondOneIsNeither()
        {
            var sim = Wreck();
            for (int i = 0; i < 40; i++) sim.Tick();   // ⚠️ `Powered` is stamped by PowerSystem, not
            // by authoring: a freshly BUILT plan reads `Powered = true` on every device because the
            // field's default is true and no balance pass has run yet. Measured at tick 40, which is
            // the horizon the charter's own census used.
            var nav = Named(sim, NavTerminal);
            Assert.That(nav.Powered, Is.False, "term_nav is authored off-network; that is why the " +
                                               "any-Terminal predicate is harmless on this ship");
            Assert.That(nav.Condition, Is.LessThan(TerminalMaintainBelow),
                "term_nav is also below `maintain`, so it fails the gate twice over — both halves " +
                "are part of why the integrator kept the any-Terminal predicate");
            Assert.That(MossGate.IsServerLive(sim), Is.False, "precondition: still dark at tick 40");
            nav.Condition = 1.0f;
            nav.Powered = true;
            Assert.That(MossGate.IsServerLive(sim), Is.True,
                "the gate refused a healthy powered Terminal because of its NAME — the sim must not " +
                "carry an authored-name literal (Simulation.cs:553-555)");
        }

        // ═════════════════════════════════════════════ 2. THE COMMANDS — SINGLE AUTHORITY, NO HOST

        /// <summary>
        /// ⛔⭐ <b>MUTATION 1 — THE SINGLE-AUTHORITY LEG.</b> Move the gate host-side (into
        /// <c>GameSession.HandleOperate</c>) and leave the commands open ⇒ this reddens, because
        /// there is NO HOST HERE: the command is constructed and executed against the sim directly,
        /// which is exactly the shape MOSS, a replay and a load all take.
        ///
        /// <para><b>RECORDED AT THE SEAM</b> (trap 4): the assertion is on <see cref="Device.IsOpen"/>
        /// after a real tick, never a text scan for a spelling.</para>
        ///
        /// <para>Its own non-vacuity is the second half: service the terminal and the SAME command
        /// moves the SAME door. Without it, a gate that refused everything for any reason would pass.</para>
        /// </summary>
        [Test]
        public void ADoorDoesNotMoveOnADeadServerShip_DrivenOnTheSimWithNoHost()
        {
            var sim = Wreck();
            var door = sim.Devices.Items.First(d => d.Kind == DeviceKind.Door && !d.IsOpen && !d.IsLocked);
            uint id = door.Id;

            sim.EnqueueCommand(new SetDoorStateCommand(id, open: true));
            sim.Tick();
            Assert.That(door.IsOpen, Is.False,
                "a door opened on a ship with no live MOSS server. The gate is not in the COMMAND — " +
                "so MOSS, the TUI, the scenario host and a save replay all still open it.");

            Service(sim);
            sim.EnqueueCommand(new SetDoorStateCommand(id, open: true));
            sim.Tick();
            Assert.That(door.IsOpen, Is.True,
                "NON-VACUITY: the same command on the same door with the server up did nothing " +
                "either — the leg above proves the gate refuses, not that this fixture can move.");
        }

        /// <summary>The lock/unlock half of the same command — it rides the same gate and would
        /// otherwise be a silent hole in the middle of the refusal.</summary>
        [Test]
        public void ADoorLockDoesNotMoveOnADeadServerShip()
        {
            var sim = Wreck();
            var door = sim.Devices.Items.First(d => d.Kind == DeviceKind.Door);
            bool was = door.IsLocked;
            sim.EnqueueCommand(new SetDoorStateCommand(door.Id, locked: !was));
            sim.Tick();
            Assert.That(door.IsLocked, Is.EqualTo(was), "the lock moved with MOSS offline");

            Service(sim);
            sim.EnqueueCommand(new SetDoorStateCommand(door.Id, locked: !was));
            sim.Tick();
            Assert.That(door.IsLocked, Is.EqualTo(!was), "NON-VACUITY: the lock never moves at all");
        }

        /// <summary>⛔⭐ <b>MUTATION 1b — THE VENT LEG.</b> Gate <see cref="SetDoorStateCommand"/> and
        /// NOT <see cref="SetDeviceStateCommand"/> ⇒ this reddens. OD-N scopes doors <b>and</b> vents
        /// (follow-up 1), and <c>vent_ls</c> — the M1 exit-gate device — is a vent.
        /// <c>vent_cryo</c> is the fixture because it boots OPEN, so the refusal is a CLOSE that does
        /// not happen: a leg written on a shut vent could be passed by a command that never ran.</summary>
        [Test]
        public void AVentDoesNotMoveOnADeadServerShip()
        {
            var sim = Wreck();
            var vent = Named(sim, CryoVent);
            Assert.That(vent.IsOpen, Is.True, "precondition: vent_cryo boots OPEN");

            sim.EnqueueCommand(new SetDeviceStateCommand(vent.Id, open: false));
            sim.Tick();
            Assert.That(vent.IsOpen, Is.True, "a vent shut itself on a ship with no live MOSS server");

            Service(sim);
            sim.EnqueueCommand(new SetDeviceStateCommand(vent.Id, open: false));
            sim.Tick();
            Assert.That(vent.IsOpen, Is.False, "NON-VACUITY: the vent never moves at all");
        }

        /// <summary>A vent's RATE is the other field the same command writes, and the console's
        /// <c>set &lt;dev&gt;.rate</c> is scoped with the device verbs for exactly this reason: one
        /// command must not straddle two tiers.</summary>
        [Test]
        public void AVentRateDoesNotMoveOnADeadServerShip()
        {
            var sim = Wreck();
            var vent = Named(sim, CryoVent);
            float was = vent.Rate;
            float target = was >= 0.5f ? 0.25f : 0.75f;

            sim.EnqueueCommand(new SetDeviceStateCommand(vent.Id, rate: target));
            sim.Tick();
            Assert.That(vent.Rate, Is.EqualTo(was).Within(1e-6f), "a rate was written with MOSS offline");

            Service(sim);
            sim.EnqueueCommand(new SetDeviceStateCommand(vent.Id, rate: target));
            sim.Tick();
            Assert.That(vent.Rate, Is.EqualTo(target).Within(1e-6f), "NON-VACUITY: the rate never moves");
        }

        /// <summary>⭐ <b>ROUTE 4 — MOSS ITSELF, through the DSL adapters every installed program and
        /// every typed console line goes through.</b> This is the route a host-side gate could not
        /// have closed, and it is driven here rather than argued.</summary>
        [Test]
        public void TheMOSS_DSL_AdapterIsGatedToo_AndItIsTheRouteAHostCouldNotClose()
        {
            var sim = Wreck();
            var registry = new DeviceRegistry();
            MossBindings.RegisterAdapters(sim, registry);
            var door = sim.Devices.Items.First(d => d.Kind == DeviceKind.Door && !d.IsOpen && !d.IsLocked);

            Assert.That(registry.TryResolve(door.Name, out var scriptable), Is.True,
                "the door is not in the MOSS registry at all, so this leg measures nothing");
            Assert.That(scriptable.TryInvoke("open", Array.Empty<DslValue>(), 0, out _), Is.True,
                "the ADAPTER still accepts the verb — the gate is in the COMMAND, deliberately, so " +
                "MOSS's own path stays self-consistent without a provenance flag on the wire");
            sim.Tick();
            Assert.That(door.IsOpen, Is.False, "MOSS opened a door on a ship with no live MOSS server");

            Service(sim);
            scriptable.TryInvoke("open", Array.Empty<DslValue>(), 0, out _);
            sim.Tick();
            Assert.That(door.IsOpen, Is.True, "NON-VACUITY: the adapter route never moves this door");
        }

        // ═════════════════════════════════════════ 3. AUTHORING AND SAVES ARE NOT COMMANDS (MUT. 6)

        /// <summary>
        /// ⛔⭐ <b>MUTATION 6 — THE BOOT LEG.</b> Gate the AUTHORING path too
        /// (<c>AuthoredShips.cs:508</c> / <c>ShipPlanBuilder.cs:31</c>) ⇒ this reddens. The gate is on
        /// the COMMAND; authoring writes the FIELD. A ship whose doors are authored open must boot
        /// with them open even on a wreck whose computer is dead — otherwise OD-N does not gate a
        /// verb, it re-authors every ship in the repo.
        /// </summary>
        [Test]
        public void AuthoredOpenDoorsStillBootOpen_OnADeadServerWreckAndOnTheGrid()
        {
            var wreck = Wreck();
            Assert.That(MossGate.IsServerLive(wreck), Is.False, "precondition: the wreck's server is dead");
            int wreckOpen = wreck.Devices.Items.Count(d => d.Kind == DeviceKind.Door && d.IsOpen);
            Assert.That(wreckOpen, Is.GreaterThan(0),
                "the wreck booted with EVERY door shut. Authoring is not a command and must not be " +
                "gated; if the ship really has no open door, this guard has gone vacuous.");

            // The grid is the wide fixture: dozens of authored doors, and its server is LIVE, so a
            // gate that leaked into authoring would show up on both ships for different reasons.
            var grid = Grid();
            int gridOpen = grid.Devices.Items.Count(d => d.Kind == DeviceKind.Door && d.IsOpen);
            Assert.That(gridOpen, Is.GreaterThan(wreckOpen),
                "--ship grid used to boot far more open doors than the wreck; that is the population " +
                "this leg needs");
        }

        /// <summary>Save/load rides the same leg: <c>SaveReader</c> writes <see cref="Device.IsOpen"/>
        /// as a field, so a door that was open when the game was saved comes back open even though
        /// the ship's server is dead and no command could have opened it.</summary>
        [Test]
        public void ASaveRestoresAnOpenDoorOnADeadServerShip()
        {
            var sim = Wreck();
            var door = sim.Devices.Items.First(d => d.Kind == DeviceKind.Door && !d.IsOpen && !d.IsLocked);
            uint id = door.Id;
            door.IsOpen = true;                      // the authoring/loader shape: a FIELD write

            var blob = new MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;
            var loaded = SaveReader.Read(blob, Stack());

            Assert.That(MossGate.IsServerLive(loaded), Is.False, "the loaded ship's server is dead too");
            Assert.That(loaded.Devices.TryGet(id, out var back), Is.True);
            Assert.That(back.IsOpen, Is.True,
                "loading a save shut a door the player had open. The gate belongs to the COMMAND; a " +
                "loader that replays through it would silently re-seal a ship on every load.");
        }

        // ═══════════════════════════════════════════ 4. THE FIXTURE SHIPS ARE OPEN (MUTATION 7)

        /// <summary>
        /// ⛔⭐ <b>MUTATION 7 — THE FIXTURE LEG, AND THE PIN STORY'S NON-VACUITY CONTROL.</b> Make the
        /// gate name <c>term_moss</c> ⇒ every fixture ship goes DARK and this reddens. The three
        /// pinned ships carry <c>term_hydro</c> at <c>Condition 1.000</c>, so the gate is open before
        /// their first tick and they behave exactly as they did — which is WHY P1/P2/P3 hold.
        /// </summary>
        [Test]
        public void EveryFixtureShipBootsWithTheGateOPEN()
        {
            foreach (var (name, sim) in new[]
                     { ("perilune", Perilune()), ("slice", Slice()), ("grid", Grid()) })
            {
                var term = sim.Devices.Items.FirstOrDefault(d => d.Kind == DeviceKind.Terminal);
                Assert.IsNotNull(term, "--ship " + name + " has no Terminal at all");
                Assert.That(MossGate.IsServerLive(sim), Is.True,
                    "--ship " + name + " boots with MOSS DARK. Its authored terminal is at " +
                    term.Condition.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                    "; a fixture the gate bricks is a re-pin, not a feature.");
            }
        }

        /// <summary>
        /// ⭐ The half that matters for P2/P3: on <c>--ship perilune</c> the authored
        /// <c>DefaultProgram</c>'s <c>open(vent_hydro)</c> STILL REACHES <see cref="Device.IsOpen"/>.
        /// Driven through the same adapter the program's statement uses, because the pin windows
        /// happen to contain zero firings and a zero is worthless without a control that the
        /// mechanism can fire at all.
        /// </summary>
        [Test]
        public void ThePeriluneProgramsVentStillOpens()
        {
            var sim = Perilune();
            var registry = new DeviceRegistry();
            MossBindings.RegisterAdapters(sim, registry);
            var vent = Named(sim, HydroVent);
            vent.IsOpen = false;

            Assert.That(registry.TryResolve(HydroVent, out var scriptable), Is.True);
            Assert.That(scriptable.TryInvoke("open", Array.Empty<DslValue>(), 0, out _), Is.True);
            sim.Tick();
            Assert.That(vent.IsOpen, Is.True,
                "the authored DefaultProgram's `open(vent_hydro)` no longer reaches the device on the " +
                "PINNED ship. P2 and P3 are measured through this path.");
        }

        // ═════════════════════════════════════════════════ 5. THE GATE HOLDS NOTHING (MUTATION 8)

        /// <summary>
        /// ⛔⭐ <b>MUTATION 8 — THE PIN LEG.</b> Cache "MOSS is live" on <see cref="Simulation"/> or on
        /// a system field ⇒ new hashed state ⇒ a re-pin of P1/P2/P3, which this package refuses by
        /// construction. Two halves, and the second is the one a reader should trust:
        /// <list type="number">
        ///   <item>the TYPE holds nothing — no instance fields, and no mutable static ones;</item>
        ///   <item>asking the question does not move <c>StateHash</c> on a real ship.</item>
        /// </list>
        /// </summary>
        [Test]
        public void TheGateAddsNoHashedState()
        {
            var t = typeof(MossGate);
            Assert.That(t.IsAbstract && t.IsSealed, Is.True, "MossGate must be a static class");
            Assert.That(t.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic),
                        Is.Empty, "MossGate grew an instance field");
            foreach (var f in t.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
                Assert.That(f.IsLiteral || f.IsInitOnly, Is.True,
                    "MossGate.'" + f.Name + "' is MUTABLE static state. A cached verdict is a second " +
                    "authority that a load, a replay and the determinism twin can all disagree with.");

            var sim = Wreck();
            for (int i = 0; i < 40; i++) sim.Tick();
            ulong before = sim.StateHash();
            for (int i = 0; i < 50; i++) MossGate.IsServerLive(sim);
            Assert.That(sim.StateHash(), Is.EqualTo(before),
                "asking the gate moved the determinism hash — it is not a pure read of saved fields");
        }

        /// <summary>The refusal must be a SENTENCE, and it must not read like M3-16's. OD-O gives one
        /// vent a dead controller board whose refusal is <i>CONTROLLER FAULT — BOARD UNRESPONSIVE</i>;
        /// a player who cannot tell the two apart is sent to repair the wrong machine on the wrong
        /// deck. <b>One vocabulary, two facts.</b></summary>
        [Test]
        public void TheOfflineSentenceNamesTheSERVER_AndIsNotAControllerFault()
        {
            string said = MossGate.OfflineRefusal(Wreck(), MossGate.Ask.Ship);
            StringAssert.Contains("MOSS", said);
            StringAssert.Contains("TERMINAL", said);
            StringAssert.Contains("REPAIR", said);
            Assert.That(said.ToUpperInvariant(), Does.Not.Contain("CONTROLLER"),
                "the ship-gate refusal names a CONTROLLER — M3-16's target-side fault says exactly " +
                "that, and the two must be distinguishable at a glance");
            StringAssert.Contains("CONTROLLER MODULE", MossGate.NotCommissionedRefusal(MossTerminal));
            StringAssert.Contains("TERM_MOSS", MossGate.NotCommissionedRefusal(MossTerminal));
        }

        // ══════════════════════════════════ THE OFFLINE SENTENCE NAMES THE NEXT STEP (2026-08-04)
        //
        // ⛔ THE OWNER'S REPORT, LIVE PLAY 2026-08-03: *"there is still no way to defreeze others."*
        // The thaw arc works end to end; the TEACHING failed at this sentence. It used to read
        //
        //     MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE; REPAIR ONE TO REACH THE DOORS
        //
        // which names neither WHICH terminal nor WHERE — on a ship with TWO of them, one behind a
        // pressure frontier on the dead deck — and whose tail says DOORS to a player who has just
        // been told to type `pods`. The audit drove the whole loop: `thaw` → "TYPE PODS" → `pods` →
        // this sentence → dead end.

        /// <summary>
        /// ⭐⭐ <b>THE SENTENCE NAMES THE TERMINAL AND WHERE IT SITS — on the SHIPPING wreck.</b> The
        /// precedent was two hundred lines below it in the same file: <c>NotCommissionedRefusal</c>
        /// has named its device since M3-4.
        ///
        /// <para>The place is asserted against the DEVICE's own <c>Pos</c> rather than against
        /// <c>(1,3,0)</c> written down here: a re-authored cryo bay must move the sentence, not
        /// redden this test. The NAME is asserted as a literal because a name is what the player
        /// types and reads, and its drift IS the thing worth reporting.</para>
        /// </summary>
        [Test]
        public void TheOfflineSentenceNamesTHISShipsTerminalAndItsDeckAndTile()
        {
            var sim = Wreck();
            Assert.That(MossGate.IsServerLive(sim), Is.False, "precondition: the wreck boots dark");

            var moss = Named(sim, MossTerminal);
            string said = MossGate.OfflineRefusal(sim, MossGate.Ask.Pods);

            StringAssert.Contains("TERM_MOSS", said,
                "the refusal does not name the terminal the ship wants serviced. 'REPAIR ONE' on a " +
                "ship with two terminals is not a next step — it is a search. Said: " + said);
            StringAssert.Contains("DECK " + moss.Pos.Z, said,
                "the refusal names no deck: Said: " + said);
            StringAssert.Contains(moss.Pos.X + "," + moss.Pos.Y, said,
                "the refusal names no tile, so the player cannot find the machine on the Overview. " +
                "Said: " + said);
            Assert.That(said, Does.Not.Contain("TERM_NAV"),
                "the sentence sent the player to the OTHER terminal — term_nav is unpowered, on the " +
                "dead deck, behind the pressure frontier. Said: " + said);
        }

        /// <summary>
        /// ⛔⭐ <b>THE NO-HARD-CODE LEG. A DIFFERENT SHIP MUST GET A DIFFERENT NAME.</b> Without this,
        /// a sentence with <c>"TERM_MOSS"</c> typed into it passes every leg above and lies on every
        /// other ship — the authored-name coupling <c>Simulation.cs:553-555</c> warns about, and the
        /// reason <see cref="MossGate"/> carries no name literal anywhere.
        ///
        /// <para>MUTATION: replace <c>RepairCandidate</c>'s scan with <c>"TERM_MOSS"</c> ⇒ red here,
        /// green everywhere else in this file.</para>
        /// </summary>
        [Test]
        public void TheNamedTerminalIsDERIVED_AShipWithADifferentConsoleGetsADifferentSentence()
        {
            var sim = BareShip();
            var t = sim.AddDevice(DeviceKind.Terminal, new Int3(4, 2, 0), "bridge_console");
            t.Powered = true;
            t.Condition = 0.10f;   // below Terminal.maintain (0.20) — the ship is dark

            Assert.That(MossGate.IsServerLive(sim), Is.False, "precondition: dark");
            string said = MossGate.OfflineRefusal(sim, MossGate.Ask.Ship);

            StringAssert.Contains("BRIDGE_CONSOLE", said,
                "the sentence did not name THIS ship's terminal — it is reading a literal, not the " +
                "ship. Said: " + said);
            Assert.That(said, Does.Not.Contain("TERM_MOSS"),
                "the sentence named the WRECK's terminal on a ship that has no such device. Said: " + said);
            StringAssert.Contains("DECK 0", said);
            StringAssert.Contains("4,2", said);
        }

        /// <summary>
        /// ⭐ <b>WHICH TERMINAL, AND THE RULE IS ABOUT WHAT A REPAIR CAN FIX.</b> A repair moves
        /// <c>Condition</c> and nothing else, so an UNPOWERED terminal is the wrong machine to send
        /// anyone to however healthy it is. Driven as a 2×2 rather than asserted: the same two
        /// devices, with the power flipped, must produce the OTHER name — otherwise "it preferred
        /// the powered one" is indistinguishable from "it preferred the first one", or from "it
        /// preferred the healthier one".
        /// </summary>
        [Test]
        public void ThePOWEREDTerminalIsNamed_EvenWhenTheDarkOneIsHealthier()
        {
            var problems = new System.Collections.Generic.List<string>();

            // Leg A — the healthier terminal is UNPOWERED. The powered one must win.
            {
                var sim = BareShip();
                var dark = sim.AddDevice(DeviceKind.Terminal, new Int3(2, 1, 0), "dark_term");
                dark.Powered = false; dark.Condition = 0.19f;     // healthier, and hopeless
                var live = sim.AddDevice(DeviceKind.Terminal, new Int3(4, 2, 0), "live_term");
                live.Powered = true; live.Condition = 0.05f;
                string said = MossGate.OfflineRefusal(sim, MossGate.Ask.Ship);
                if (!said.Contains("LIVE_TERM", StringComparison.Ordinal))
                    problems.Add("A: the sentence sent the player to a terminal a repair cannot fix — "
                                 + "its fault is the GRID. Said: " + said);
            }

            // Leg B — THE CONTROL. Same two devices, power flipped, and nothing else touched.
            {
                var sim = BareShip();
                var a = sim.AddDevice(DeviceKind.Terminal, new Int3(2, 1, 0), "dark_term");
                a.Powered = true; a.Condition = 0.19f;
                var b = sim.AddDevice(DeviceKind.Terminal, new Int3(4, 2, 0), "live_term");
                b.Powered = false; b.Condition = 0.05f;
                string said = MossGate.OfflineRefusal(sim, MossGate.Ask.Ship);
                if (!said.Contains("DARK_TERM", StringComparison.Ordinal))
                    problems.Add("B: flipping the power did NOT move the answer, so leg A proves "
                                 + "nothing about the Powered term. Said: " + said);
            }

            // Leg C — both powered: the CLOSEST to the threshold, i.e. the cheapest service.
            {
                var sim = BareShip();
                var far = sim.AddDevice(DeviceKind.Terminal, new Int3(2, 1, 0), "far_term");
                far.Powered = true; far.Condition = 0.02f;
                var near = sim.AddDevice(DeviceKind.Terminal, new Int3(4, 2, 0), "near_term");
                near.Powered = true; near.Condition = 0.18f;
                string said = MossGate.OfflineRefusal(sim, MossGate.Ask.Ship);
                if (!said.Contains("NEAR_TERM", StringComparison.Ordinal))
                    problems.Add("C: with both powered the sentence must name the one closest to the "
                                 + "maintain floor. Said: " + said);
            }

            Assert.That(problems, Is.Empty, string.Join("\n", problems));
        }

        /// <summary>
        /// ⛔⭐ <b>THE TAIL ANSWERS THE ASK — THE OWNER-REPORTED HALF.</b> Every ask, its own tail,
        /// asserted together with blinded legs (the fifth trap shape) because the failure that
        /// shipped was <b>one</b> tail answering all of them.
        ///
        /// <para>The load-bearing leg is the third: a refusal to a <c>pods</c> ask MUST NOT say
        /// DOORS. Revert <see cref="MossGate.OfflineRefusal"/> to the old constant ⇒ that leg names
        /// the missing noun.</para>
        ///
        /// <para>⭐ <b>AND IT IS EXHAUSTIVE OVER THE ENUM, which it was not until the <c>vents</c>
        /// noun landed.</b> It named three members by hand; a fourth was added beside them and this
        /// test could not have seen a fourth that answered the third's noun — the NINTH shape (an
        /// instrument that goes blind exactly where the next change lands). The pairwise leg now
        /// walks <c>Enum.GetValues</c>, so a fifth member with a copied tail fails HERE.</para>
        /// </summary>
        [Test]
        public void TheTailAnswersTheVERBThatWasRefused_AndPodsNeverSaysDOORS()
        {
            var sim = Wreck();
            var problems = new System.Collections.Generic.List<string>();

            string pods = MossGate.OfflineRefusal(sim, MossGate.Ask.Pods);
            string doors = MossGate.OfflineRefusal(sim, MossGate.Ask.Doors);
            string ship = MossGate.OfflineRefusal(sim, MossGate.Ask.Ship);
            string vents = MossGate.OfflineRefusal(sim, MossGate.Ask.Vents);

            // ⭐ the owner-ratified second directory noun (2026-08-04). Its refusal must answer the
            // VENTS and must not borrow the doors' clause — the reported defect, one costume along.
            if (!vents.Contains("VENTS", StringComparison.Ordinal))
                problems.Add("Ask.Vents does not mention the VENTS: " + vents);
            if (vents.Contains("DOORS", StringComparison.Ordinal))
                problems.Add("⛔ THE REPORTED DEFECT, ONE NOUN ALONG: a player who typed `vents` was "
                             + "answered with a clause about DOORS: " + vents);

            // EXHAUSTIVE PAIRWISE — every member against every other, so a member added later
            // cannot ship a copied tail without failing here.
            //
            // ⚠️ THE NON-VACUITY GUARD IS ACCUMULATED, NEVER ASSERTED HERE (the FIFTH shape).
            // `Assert.That` THROWS, and this test is deliberately blinded-legs: an assert in the
            // MIDDLE would swallow every leg below it — the pods/doors/ship legs — and report only
            // its own message. The guard's job is real (a shrunken enum would make the walk measure
            // less than the hand-written legs it replaced), so it stays; it just joins `problems`
            // like everything else and surfaces at the single final assert.
            var asks = (MossGate.Ask[])System.Enum.GetValues(typeof(MossGate.Ask));
            if (asks.Length < 4)
                problems.Add("the enum shrank to " + asks.Length + " members — the walk below is "
                             + "measuring less than the hand-written legs it stands in for");
            for (int i = 0; i < asks.Length; i++)
                for (int j = i + 1; j < asks.Length; j++)
                    if (MossGate.OfflineRefusal(sim, asks[i]) == MossGate.OfflineRefusal(sim, asks[j]))
                        problems.Add("Ask." + asks[i] + " and Ask." + asks[j] + " produced the SAME "
                                     + "sentence — the tail is not reading the ask");

            if (!pods.Contains("PODS", StringComparison.Ordinal))
                problems.Add("Ask.Pods does not mention the PODS: " + pods);
            if (pods.Contains("DOORS", StringComparison.Ordinal))
                problems.Add("⛔ THE REPORTED DEFECT: a player who typed `pods` — because `thaw` told "
                             + "them to — was answered with a clause about DOORS: " + pods);
            if (!doors.Contains("DOORS", StringComparison.Ordinal))
                problems.Add("Ask.Doors does not mention the DOORS: " + doors);
            if (ship.Contains("DOORS", StringComparison.Ordinal) || ship.Contains("PODS", StringComparison.Ordinal)
                || ship.Contains("VENTS", StringComparison.Ordinal))
                problems.Add("the generic ask names a noun it cannot know is wanted: " + ship);
            if (!ship.Contains("MOSS ONLINE", StringComparison.Ordinal))
                problems.Add("the generic ask says nothing about what a repair buys: " + ship);

            Assert.That(problems, Is.Empty, string.Join("\n", problems));
        }

        /// <summary>The degenerate arm, and it is honest rather than clever: a ship carrying no
        /// <c>Terminal</c> at all has nothing to name, so the sentence keeps M3-15's original
        /// <i>REPAIR ONE</i> wording. Naming <c>THE TERMINAL</c> on a ship that has none would be a
        /// fabricated noun — the defect this lane is closing, pointing the other way.</summary>
        [Test]
        public void AShipWithNoTerminalAboardNamesNothing_AndDoesNotInventOne()
        {
            var sim = BareShip();
            Assert.That(MossGate.RepairCandidate(sim), Is.Null, "precondition: no Terminal aboard");

            string said = MossGate.OfflineRefusal(sim, MossGate.Ask.Pods);
            StringAssert.Contains(MossGate.OfflineLead, said);
            StringAssert.Contains("REPAIR ONE", said);
            StringAssert.Contains("PODS", said, "the tail still answers the ask");
            Assert.That(said, Does.Not.Contain("DECK"),
                "a ship with no terminal was given a place to go: " + said);
        }

        /// <summary>A four-walled room and nothing in it — the smallest ship on which the sentence's
        /// derivation can be driven without the wreck's authored answers standing in for it.</summary>
        private static Simulation BareShip()
        {
            string[] map = { "#######", "#.....#", "#.....#", "#######" };
            return new Simulation(AsciiWorld.Build(map), 7, Stack());
        }

        /// <summary>⭐ THE TWO TIERS ARE DIFFERENT PREDICATES ABOUT THE SAME TERMINAL, and this
        /// records the ordering that makes the split legible: a repaired-but-uncommissioned terminal
        /// is a LIVE SERVER and is NOT a commissioned console. Pinned here on the sim so the host's
        /// worst-first ordering has a fact to be ordered against.</summary>
        [Test]
        public void RepairedIsNotCommissioned_TheTwoTiersDisagreeOnPurpose()
        {
            var sim = Wreck();
            Service(sim);
            Assert.That(Named(sim, MossTerminal).Scriptable, Is.False,
                "term_moss is authored UN-commissioned; if that changes the split has no subject");
            Assert.That(MossGate.IsServerLive(sim), Is.True, "REPAIRED tier: the console is live");
            Assert.That(ThawGate.IsCommissionedConsole(sim, MossTerminal), Is.False,
                "COMMISSIONED tier: a repaired terminal with no ControllerModule must still refuse " +
                "programs and thaws. If both tiers answer the same thing, OD-N's split is not shipped.");
        }
    }

    /// <summary>
    /// ⭐⭐ M3-15 / OD-N — <b>THE CONSOLE SPLIT, DRIVEN THROUGH THE REAL WEB HOST.</b>
    ///
    /// <para><b>WHAT WAS WRONG, MEASURED AND NOT ASSUMED.</b> Before this package
    /// <c>GameSession.HandleMoss</c> asked <b>no question about any device</b>: five ops, a
    /// <c>default: break;</c>, and a prompt that addresses the pseudo-terminal <c>@console</c>. So on
    /// <c>--ship wreck</c> at tick 0 a player could open the MOSS tab, type <c>open &lt;door&gt;</c>,
    /// and the door opened. The console was a WIDER hole than the Room Zoom click OD-N also closes.</para>
    ///
    /// <para>⚠️ <b>THE SPLIT'S TWO HALVES ARE TWO TESTS, BLINDED.</b> A repaired-but-uncommissioned
    /// <c>term_moss</c> must OPEN A DOOR and must STILL REFUSE A PROGRAM. <c>Assert</c> throws, so
    /// running them as two legs of one test would let a dead second leg read exactly like a live one
    /// (the fifth trap shape). They are separate <c>[Test]</c>s and each carries its own
    /// precondition.</para>
    /// </summary>
    public class MossConsoleGateTests
    {
        private const string MossTerminal = "term_moss";
        private const string ConsoleTid = "@console";   // the prompt's pseudo-terminal (spec §1.3)
        private const float BareHandsService = 0.60f;
        private const string AnyProgram = "every 5s:\n  open(door_storage)\n";

        private static (GameSession gs, SimHost host, System.Collections.Generic.List<string> sink) Boot()
        {
            var sink = new System.Collections.Generic.List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, sink.Add);   // NOT started ⇒ no sim thread
            return (gs, host, sink);
        }

        private static Device Named(Simulation sim, string name)
        {
            var d = sim.Devices.Items.FirstOrDefault(x => x.Name == name);
            Assert.IsNotNull(d, "--ship wreck no longer authors a device called '" + name + "'");
            return d;
        }

        private static void Service(Simulation sim) => Named(sim, MossTerminal).Condition = BareHandsService;

        /// <summary>A shut, unlocked, NAMED door on the wreck — the thing the acceptance script types
        /// at. Resolved from the ship rather than hard-coded so a re-authored deck cannot turn these
        /// guards into tests of an empty name.</summary>
        private static Device ShutNamedDoor(Simulation sim)
        {
            var d = sim.Devices.Items.FirstOrDefault(x => x.Kind == DeviceKind.Door
                                                       && !x.IsOpen && !x.IsLocked
                                                       && !string.IsNullOrEmpty(x.Name));
            Assert.IsNotNull(d, "the wreck has no shut, unlocked, NAMED door — the console cannot be " +
                                "asked to open anything and every leg below is vacuous");
            return d;
        }

        /// <summary>Send one prompt line and return the <c>moss ev:exec</c> reply. Fails loudly on
        /// silence: <c>default: break;</c> in <c>HandleMoss</c> is a SILENT SWALLOW, and a gated op
        /// joining it is the defect these tests exist to stop.</summary>
        private static string Exec(GameSession gs, System.Collections.Generic.List<string> sink, string line)
        {
            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "exec", tid: ConsoleTid, text: line));
            string reply = sink.FirstOrDefault(m => m.Contains("\"ev\":\"exec\""));
            Assert.IsNotNull(reply, "the console answered NOTHING. Every refused op must reply — " +
                                    "silence is indistinguishable from a broken prompt.");
            return reply;
        }

        // ═══════════════════════════════════════════════════════ MUTATION 2 — THE SILENCE LEG

        /// <summary>
        /// ⛔⭐ <b>MUTATION 2 — REFUSE WITH A BARE <c>return;</c> ⇒ THIS REDDENS.</b> The assertion is
        /// on the RENDERED SENTENCE carried by the reply's stream-2 error line, not on "a method was
        /// called": this repo has paid three owner reports for <i>invisible feedback is
        /// functional</i>, and a refusal the player cannot read is a broken verb.
        /// </summary>
        [Test]
        public void TheConsoleRefusesADoorInWords_NamingTheServerAndWhatItNeeds()
        {
            var (gs, host, sink) = Boot();
            var door = ShutNamedDoor(host.Sim);
            Assert.That(MossGate.IsServerLive(host.Sim), Is.False, "precondition: the wreck is dark");

            string reply = Exec(gs, sink, "open " + door.Name);

            StringAssert.Contains("\"ok\":false", reply, "a refused line must not report success");
            StringAssert.Contains(MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Ship), reply,
                "the console refused WITHOUT SAYING WHY. The player is standing next to the terminal " +
                "that would fix it; the sentence is the whole feature.");
            StringAssert.Contains("[2,", reply, "the refusal must ride the ERROR stream, not output");

            host.Sim.Tick();
            Assert.That(door.IsOpen, Is.False, "and the door must not have moved either");
        }

        /// <summary>The other half of the same rule: a REFUSED console line must not move hashed sim
        /// state. The refusal reads saved fields and enqueues nothing.</summary>
        [Test]
        public void ARefusedConsoleLineMovesNoHashedState()
        {
            var (gs, host, sink) = Boot();
            var door = ShutNamedDoor(host.Sim);
            for (int i = 0; i < 20; i++) host.Sim.Tick();
            ulong before = host.Sim.StateHash();
            Exec(gs, sink, "open " + door.Name);
            Assert.That(host.Sim.StateHash(), Is.EqualTo(before),
                "a refused console line changed hashed sim state — that is five determinism pins");
        }

        // ══════════════════════════════════════════ MUTATION 4 — THE SPLIT, TWO BLINDED LEGS

        /// <summary>⭐ <b>SPLIT LEG 1 of 2 — REPAIRED IS ENOUGH FOR A DOOR.</b> MUTATION 4: require
        /// <c>Scriptable</c> for the DEVICE verbs ⇒ this reddens. <c>term_moss</c> is repaired and
        /// still un-commissioned; the door must open anyway, because that is what breaks OD-N's
        /// deadlock (a `ControllerModule` lives behind the three doors the console is gating).</summary>
        [Test]
        public void SplitLeg1_ARepairedButUncommissionedConsoleOpensADoor()
        {
            var (gs, host, sink) = Boot();
            var door = ShutNamedDoor(host.Sim);
            Service(host.Sim);
            Assert.That(Named(host.Sim, MossTerminal).Scriptable, Is.False,
                "precondition: term_moss is REPAIRED and NOT commissioned — if it were commissioned " +
                "this leg would prove nothing about the split");

            string reply = Exec(gs, sink, "open " + door.Name);
            StringAssert.Contains("\"ok\":true", reply, "a repaired console refused a DEVICE verb: " +
                "reply was " + reply);
            host.Sim.Tick();
            Assert.That(door.IsOpen, Is.True, "the console accepted the line and the door did not move");
        }

        /// <summary>⭐ <b>SPLIT LEG 2 of 2 — REPAIRED IS NOT ENOUGH FOR A PROGRAM, AND THE REFUSAL IS
        /// NOW VISIBLE.</b> <c>SetScriptCommand</c> has refused this since E0-6 with a bare
        /// <c>return;</c> (<c>Commands.cs:376</c>); the console never said so. Its own <c>[Test]</c>
        /// because a dead leg inside leg 1 would be invisible.</summary>
        [Test]
        public void SplitLeg2_ARepairedButUncommissionedConsoleStillRefusesAProgram_VISIBLY()
        {
            var (gs, host, sink) = Boot();
            Service(host.Sim);
            Assert.That(MossGate.IsServerLive(host.Sim), Is.True,
                "precondition: the SHIP gate is open, so what follows is the COMMISSION gate and " +
                "not the offline one");

            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "set", tid: MossTerminal, text: AnyProgram));

            string reply = sink.FirstOrDefault(m => m.Contains("\"ev\":\"exec\""));
            Assert.IsNotNull(reply, "installing a program on an un-commissioned terminal answered " +
                                    "NOTHING — the silent `return;` at Commands.cs:376 reached the player");
            StringAssert.Contains(MossGate.NotCommissionedRefusal(MossTerminal), reply,
                "the refusal does not name the CONTROLLER MODULE the player has to go and make");
            Assert.That(reply, Does.Not.Contain(MossGate.OfflineLead),
                "a REPAIRED console reported MOSS OFFLINE — the two tiers are being confused, and " +
                "the player would go and repair a terminal that is already fine");
            Assert.IsNull(sink.FirstOrDefault(m => m.Contains("\"ev\":\"diag\"")),
                "a diag came back, so the program was compiled and installed anyway");
        }

        // ═══════════════════════════════════════════════ EVALUATION ORDER — SHIP BEFORE TARGET

        /// <summary>⛔⭐ <b>THE ORDER IS THE CONTRACT.</b> On a dead-computer ship an un-commissioned
        /// terminal fails BOTH tiers; the player must be told MOSS IS OFFLINE, because the actual next
        /// move is one repair in the room they are standing in — not a trip across the pressure
        /// frontier to fit a module. MUTATION: swap the two `if`s in the <c>set</c> case ⇒ red.</summary>
        [Test]
        public void OnADeadShipTheOfflineSentenceWinsOverTheCommissioningOne()
        {
            var (gs, host, sink) = Boot();
            Assert.That(MossGate.IsServerLive(host.Sim), Is.False, "precondition: dark");
            Assert.That(Named(host.Sim, MossTerminal).Scriptable, Is.False,
                "precondition: also un-commissioned, so BOTH refusals are true and the ORDER decides");

            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "set", tid: MossTerminal, text: AnyProgram));
            string reply = sink.FirstOrDefault(m => m.Contains("\"ev\":\"exec\""));
            Assert.IsNotNull(reply, "silence again");
            StringAssert.Contains(MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Ship), reply,
                "the ship gate must be asked FIRST — worst-first, ship before target");
        }

        // ═══════════════════════════════════════════════════ THE OTHER GATED OPS ANSWER TOO

        /// <summary>Reading the ship needs a computer. ⚠️ AND THE DETAIL SCREEN MUST NOT BE LEFT
        /// LOADING: the client opens DETAIL empty-and-`loading` and waits for a <c>sys</c> reply, so
        /// the refusal ships BOTH a transcript line and an empty <c>sys</c> whose derivation note
        /// carries the reason.</summary>
        [Test]
        public void SysIsGated_AndClearsTheDetailScreensLoadingState()
        {
            var (gs, host, sink) = Boot();
            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "sys", tid: "power"));

            string exec = sink.FirstOrDefault(m => m.Contains("\"ev\":\"exec\""));
            Assert.IsNotNull(exec, "a refused `sys` said nothing at all");
            StringAssert.Contains(MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Ship), exec);

            string sys = sink.FirstOrDefault(m => m.Contains("\"ev\":\"sys\""));
            Assert.IsNotNull(sys, "no `sys` reply came back, so the DETAIL screen sits on LOADING… " +
                                  "for ever beside a transcript line saying why — a contradiction");
            StringAssert.Contains(MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Ship), sys,
                "the empty detail must carry the reason as its derivation note");
        }

        /// <summary>The audit ring is a read of the ship through the computer, and it is gated with
        /// the rest of them. Its own test because a refusal that reached only ONE op would look
        /// exactly like a refusal that reached all of them from inside a shared test.</summary>
        [Test]
        public void AuditIsGated()
        {
            var (gs, host, sink) = Boot();
            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "audit", tid: ConsoleTid));
            string reply = sink.FirstOrDefault(m => m.Contains("\"ev\":\"exec\""));
            Assert.IsNotNull(reply, "a refused `audit` said nothing at all");
            StringAssert.Contains(MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Ship), reply);
            Assert.IsNull(sink.FirstOrDefault(m => m.Contains("\"ev\":\"audit\"")),
                "the audit ring came back anyway");
        }

        /// <summary>A bare property READ is free of AUDIT (IX-M41), never free of a computer.</summary>
        [Test]
        public void ABarePropertyReadIsGatedToo()
        {
            var (gs, host, sink) = Boot();
            string reply = Exec(gs, sink, "ship.power");
            StringAssert.Contains(MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Ship), reply);
        }

        /// <summary>And once the server is up, the same read answers — the non-vacuity control for
        /// every refusal above. Without it a console that refused EVERYTHING for any reason would
        /// satisfy the whole class.</summary>
        [Test]
        public void NON_VACUITY_ARepairedConsoleAnswersAReadInstedOfRefusingIt()
        {
            var (gs, host, sink) = Boot();
            Service(host.Sim);
            string reply = Exec(gs, sink, "ship.power");
            Assert.That(reply, Does.Not.Contain(MossGate.OfflineLead),
                "the console refuses reads even with the server up — every refusal leg in this " +
                "class is measuring a console that says no to everything");
        }

        // ═══════════════════════════════════════════════════ THE OPERATE HOST HANDLER (SURFACE)

        /// <summary>⭐ THE SIM GATE, PROVEN FROM A SURFACE. The Room Zoom's click verb is deleted, but
        /// <c>HandleOperate</c> survives one more package precisely because it is the cheapest place
        /// to show that a refusal reaches a player rather than only a unit test. Without the ship
        /// gate here the reply would read <c>⇄ OPEN DOOR</c> while nothing moved — a confident
        /// success doing nothing, the failure this verb's own header says it exists to remove.</summary>
        [Test]
        public void TheOperateReplyNamesTheOfflineServerInsteadOfClaimingSuccess()
        {
            var (gs, host, sink) = Boot();
            var door = ShutNamedDoor(host.Sim);
            sink.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Operate, door.Pos.X, door.Pos.Y, i: door.Pos.Z));

            string reply = sink.LastOrDefault(m => m.Contains("\"type\":\"operate\""));
            Assert.IsNotNull(reply, "the operate verb emitted NO reply at all");
            StringAssert.Contains("\"ok\":0", reply, "it reported SUCCESS on a ship with no computer");
            StringAssert.Contains(MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Doors), reply);
            host.Sim.Tick();
            Assert.That(door.IsOpen, Is.False);
        }
    }
}
