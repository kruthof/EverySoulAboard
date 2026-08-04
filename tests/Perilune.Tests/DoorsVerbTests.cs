using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Dsl;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession, WebCommand, CmdKind

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>THE <c>doors</c> DIRECTORY: the name <c>open</c> needs, learnable in the game.</b>
    ///
    /// <para>⛔ <b>A DEFECT CLOSURE, NOT AN OWNER MANDATE.</b> OD-P's row says MOSS-OS expansion is
    /// VISION and <i>"never implement from this row"</i>; it is cited here only as the SHAPE
    /// precedent (typed commands, a directory like <c>pods</c>). The shape awaits the owner's
    /// ratification — see <c>MossGate.DescribeDoors</c>'s header.</para>
    ///
    /// <para><b>THE STALL, MEASURED IN LIVE PLAY (thaw-path audit, 2026-08-03).</b> OD-N made the
    /// ship's doors answer only to MOSS, MOSS addresses a door BY NAME, and <b>no surface anywhere
    /// named one</b>. Driven at the shipping prompt: <c>open</c> → <i>UNKNOWN SYSTEM ''</i>;
    /// <c>open door</c> → <i>NO SUCH DEVICE 'DOOR'</i>; <c>open door_d0_s1</c> →
    /// <i>QUEUED OPEN(DOOR_D0_S1)</i>. The Regolith → Scrap → Parts → ControllerModule chain — the
    /// thaw arc's spine — sits behind <c>door_d0_s1</c> and <c>door_d0_s2</c> on the shipping wreck,
    /// so a player who cannot LEARN a door's name cannot open the game.</para>
    ///
    /// <para><b>THE MUTATION TABLE, each physically applied, watched go RED for the right reason and
    /// reverted from an in-memory copy — never <c>git checkout</c> (trap 2):</b></para>
    /// <list type="number">
    ///   <item>the listing drops a door (skip the last row) ⇒
    ///         <see cref="TheListingIsTheShipsOwnDoorCensus"/></item>
    ///   <item>the listing names something that is not a door (filter <c>!= Terminal</c>) ⇒
    ///         <see cref="TheListingNamesNOTHINGThatIsNotADoor"/> — the SIXTH shape: ask what a row
    ///         is NOT, because "16 rows" is equally true of 16 wrong rows</item>
    ///   <item>the state word is read from the authored plan rather than live state (freeze it to
    ///         SHUT) ⇒ <see cref="TheStateWordIsLIVE_NotAuthored"/></item>
    ///   <item>the gate tier is wrong — move the op behind <c>ThawGate.IsCommissionedConsole</c> ⇒
    ///         <see cref="TheVerbSitsAtTheREPAIREDTier_TheTierOfTheVerbItServes"/>; delete the gate
    ///         entirely ⇒ <see cref="ADarkShipRefuses_AndTheTailAnswersTheDOORS_Ask"/></item>
    ///   <item>the place is fabricated (drop <c>PlaceWords</c>' Y term) ⇒
    ///         <see cref="EveryRowsPlaceAndStateAreTheDEVICES"/></item>
    /// </list>
    /// </summary>
    public class DoorsVerbTests
    {
        private const string Console = "term_moss";
        private const string ConsoleTid = "@console";

        /// <summary>A paused session on the SHIPPING ship (<c>./play.sh</c>'s default) — no sim
        /// thread, so every tick below is one a test asked for. <c>WebPodBayTests</c>' fixture.</summary>
        private static GameSession WreckSession(out SimHost host, out List<string> sent)
        {
            host = SimHost.Build(AuthoredShips.WreckSeed, ship: ShipChoice.Wreck);
            var captured = new List<string>();
            sent = captured;
            return new GameSession(host, captured.Add);
        }

        private static Device Dev(Simulation sim, string name)
            => sim.Devices.Items.FirstOrDefault(d => d.Name == name);

        private static List<Device> Doors(Simulation sim)
            => sim.Devices.Items.Where(d => d.Kind == DeviceKind.Door).OrderBy(d => d.Id).ToList();

        /// <summary>OD-N's MIDDLE state: the console RUNS and is still not commissioned — the state
        /// the player spends the whole opening in, and the one this verb has to work in.</summary>
        private static void RepairConsole(Simulation sim)
        {
            var term = Dev(sim, Console);
            Assert.That(term, Is.Not.Null, "the wreck must carry " + Console);
            Assert.That(MossGate.IsServerLive(sim), Is.False,
                "PRECONDITION: the wreck boots DARK (term_moss 0.14, below Terminal maint 0.20). "
                + "If this is ever false every gate leg in this file measures nothing.");
            term.Condition = 0.60f;
            Assert.That(MossGate.IsServerLive(sim), Is.True, "the fixture must actually light MOSS");
            Assert.That(term.Scriptable, Is.False,
                "PRECONDITION: and it is still UN-commissioned — that is the whole middle state");
        }

        private static void SendDoors(GameSession gs, string tid = ConsoleTid)
            => gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "doors", tid: tid));

        private static void SendExec(GameSession gs, string line, string tid = ConsoleTid)
            => gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "exec", tid: tid, text: line));

        /// <summary>Every stream-N line the session put on the console transcript, in order. Reads
        /// the WIRE, not a helper's return value: the seam under test is what the player is sent.</summary>
        private static List<string> Stream(List<string> sent, int stream)
        {
            string open = "[" + stream.ToString(CultureInfo.InvariantCulture) + ",\"";
            var outp = new List<string>();
            foreach (var m in sent)
            {
                if (!m.Contains("\"ev\":\"exec\"", StringComparison.Ordinal)) continue;
                int i = 0;
                while (true)
                {
                    i = m.IndexOf(open, i, StringComparison.Ordinal);
                    if (i < 0) break;
                    int s = i + open.Length;
                    int e = m.IndexOf('"', s);
                    if (e <= s) break;
                    outp.Add(m.Substring(s, e - s));
                    i = e;
                }
            }
            return outp;
        }

        /// <summary>The listing WITHOUT its census header — the rows a player reads down.</summary>
        private static List<string> Rows(List<string> sent)
        {
            var lines = Stream(sent, 1);
            return lines.Where(l => !l.StartsWith("DOORS —", StringComparison.Ordinal)).ToList();
        }

        private static string Header(List<string> sent)
            => Stream(sent, 1).FirstOrDefault(l => l.StartsWith("DOORS —", StringComparison.Ordinal));

        /// <summary>A row's first column — the id the player types back at <c>open</c>.</summary>
        private static string IdOf(string row)
        {
            int i = row.IndexOf(" · ", StringComparison.Ordinal);
            return i < 0 ? row : row.Substring(0, i);
        }

        // ══════════════════════════════════════════════════ 1. the listing is the ship's census

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME'S FIRST HALF — every door the ship knows reaches the player, and the
        /// census is the SHIP'S rather than a number this test wrote down.</b> The wreck's 16 doors
        /// are re-derived from <c>sim.Devices</c> here, so a re-authored ship fails loudly instead of
        /// quietly disagreeing with a literal nobody re-reads.
        /// </summary>
        [Test]
        public void TheListingIsTheShipsOwnDoorCensus()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);
            SendDoors(gs);

            var doors = Doors(host.Sim);
            Assert.That(doors.Count, Is.GreaterThan(1),
                "PRECONDITION: the wreck must carry doors, or every leg below is vacuous");

            var rows = Rows(sent);
            Assert.That(rows.Count, Is.EqualTo(doors.Count),
                "the listing printed " + rows.Count + " rows for " + doors.Count + " doors:\n"
                + string.Join("\n", rows));

            foreach (var d in doors)
                Assert.That(rows.Any(r => IdOf(r) == d.Name.ToUpperInvariant()), Is.True,
                    "the ship carries " + d.Name + " and the listing never names it:\n"
                    + string.Join("\n", rows));

            // The header is the count, stated — a 16-row block a player has to count themselves is
            // the pod bay's `#` column defect wearing a different hat.
            string header = Header(sent);
            Assert.That(header, Is.Not.Null, "no census header at all: " + string.Join(" | ", sent));
            int open = doors.Count(d => d.IsOpen);
            var ic = CultureInfo.InvariantCulture;
            Assert.That(header, Is.EqualTo("DOORS — " + doors.Count.ToString(ic) + " ABOARD · "
                + open.ToString(ic) + " OPEN · " + (doors.Count - open).ToString(ic) + " SHUT"));
        }

        /// <summary>
        /// ⛔ <b>THE SIXTH SHAPE — ASK WHAT A ROW IS NOT.</b> "16 rows, all named" is equally true of
        /// a listing that enumerated the ship's vents, or its pods, or everything. The census leg
        /// above cannot see a filter that is too WIDE, so this one names four devices the wreck
        /// definitely carries and requires that none of them is in the listing.
        /// </summary>
        [Test]
        public void TheListingNamesNOTHINGThatIsNotADoor()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);
            SendDoors(gs);

            var rows = Rows(sent);
            // Every one of these is a real, named, non-Door device on the shipping wreck — asserted
            // here so the leg cannot pass by naming things that do not exist.
            foreach (var name in new[] { "vent_cryo", "term_moss", "pod_rell", "recycler_1", "ladder_d0" })
            {
                Assert.That(Dev(host.Sim, name), Is.Not.Null,
                    "PRECONDITION: the wreck must carry " + name + ", or this exclusion is vacuous");
                Assert.That(Dev(host.Sim, name).Kind, Is.Not.EqualTo(DeviceKind.Door));
                Assert.That(rows.Any(r => IdOf(r) == name.ToUpperInvariant()), Is.False,
                    "the DOOR directory listed " + name + ", which is a "
                    + Dev(host.Sim, name).Kind + ":\n" + string.Join("\n", rows));
            }

            // …and the positive control for the same matcher, so "found nothing" and "cannot find
            // anything" are distinguishable.
            var aDoor = Doors(host.Sim)[0];
            Assert.That(rows.Any(r => IdOf(r) == aDoor.Name.ToUpperInvariant()), Is.True,
                "INCLUSION CONTROL: the matcher cannot find a door either, so the five exclusions "
                + "above prove nothing");
        }

        /// <summary>
        /// Every row's PLACE and STATE are read back off the <see cref="Device"/> they claim to be
        /// about — parsed out of the rendered line and compared field by field, which is not the code
        /// path that composed them. A place that drops a coordinate, or a state word that is a
        /// constant, dies here.
        /// </summary>
        [Test]
        public void EveryRowsPlaceAndStateAreTheDEVICES()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);
            // Make the fixture carry BOTH state words — the wreck already does (2 open, 14 shut),
            // asserted rather than assumed, because a listing that printed SHUT unconditionally
            // would pass a 16-row all-shut ship.
            var doors = Doors(host.Sim);
            Assert.That(doors.Any(d => d.IsOpen), Is.True, "PRECONDITION: some door boots OPEN");
            Assert.That(doors.Any(d => !d.IsOpen), Is.True, "PRECONDITION: some door boots SHUT");

            SendDoors(gs);
            var ic = CultureInfo.InvariantCulture;
            foreach (var row in Rows(sent))
            {
                var parts = row.Split(new[] { " · " }, StringSplitOptions.None);
                Assert.That(parts.Length, Is.EqualTo(3), "malformed row: " + row);
                var d = doors.First(x => x.Name.ToUpperInvariant() == parts[0]);
                Assert.That(parts[1], Is.EqualTo("DECK " + d.Pos.Z.ToString(ic)
                    + " AT " + d.Pos.X.ToString(ic) + "," + d.Pos.Y.ToString(ic)),
                    "the place on " + row + " is not where " + d.Name + " stands");
                Assert.That(parts[2], Is.EqualTo(d.IsOpen ? "OPEN" : "SHUT"),
                    "the state on " + row + " is not what " + d.Name + " holds");
            }
        }

        /// <summary>
        /// ⭐ <b>THE STATE WORD IS READ FROM LIVE DEVICE STATE, NOT FROM THE AUTHORED PLAN</b> — the
        /// one claim a boot-time census cannot distinguish from a plan read. The door is moved by the
        /// SIM'S OWN COMMAND (the route the typed <c>open</c> takes), and the listing must follow: the
        /// row flips SHUT → OPEN and the header's split moves with it.
        /// </summary>
        [Test]
        public void TheStateWordIsLIVE_NotAuthored()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            RepairConsole(sim);

            var shut = Doors(sim).First(d => !d.IsOpen);
            SendDoors(gs);
            var before = Rows(sent).First(r => IdOf(r) == shut.Name.ToUpperInvariant());
            StringAssert.EndsWith(" · SHUT", before);
            string headerBefore = Header(sent);

            sim.EnqueueCommand(new SetDoorStateCommand(shut.Id, open: true));
            sim.Tick();
            Assert.That(shut.IsOpen, Is.True, "PRECONDITION: the command must actually open it");

            sent.Clear();
            SendDoors(gs);
            var after = Rows(sent).First(r => IdOf(r) == shut.Name.ToUpperInvariant());
            StringAssert.EndsWith(" · OPEN", after);
            Assert.That(Header(sent), Is.Not.EqualTo(headerBefore),
                "the census header did not move when a door did: " + Header(sent));
        }

        // ══════════════════════════════════════════════════ 2. the tier

        /// <summary>
        /// ⛔⛔ <b>THE VERB SITS AT THE REPAIRED TIER — THE TIER OF THE VERB IT SERVES — AND THAT IS
        /// PINNED AS A CONTRAST RATHER THAN AN ASSERTION.</b>
        ///
        /// <para>The argument, from the gate table (<c>MECHANICS.md</c> §13.31): <c>doors</c> is the
        /// directory for <c>open</c>/<c>close</c>/<c>lock</c>/<c>unlock</c>, which reach the sim
        /// through <c>exec</c> at the REPAIRED tier. A directory the actuation tier cannot see is
        /// useless — a player whose console is repaired could open a door and still not learn its
        /// name, which is this package's own stall moved rather than closed.</para>
        ///
        /// <para>Driven in ONE fixture state (repaired, un-commissioned): <c>doors</c> ANSWERS and
        /// <c>pods</c> — the commissioned tier's own read — REFUSES, in the same session, so the two
        /// tiers are demonstrably distinguishable at that point. M3-17's construction exactly.</para>
        /// </summary>
        [Test]
        public void TheVerbSitsAtTheREPAIREDTier_TheTierOfTheVerbItServes()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);

            SendDoors(gs);
            Assert.That(Rows(sent).Count, Is.EqualTo(Doors(host.Sim).Count),
                "a REPAIRED console did not get the directory: " + string.Join(" | ", sent));
            Assert.That(Stream(sent, 2), Is.Empty, "…and it must not also refuse");

            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "pods", tid: ConsoleTid));
            Assert.That(Stream(sent, 2).Any(s => s.Contains("NOT COMMISSIONED", StringComparison.Ordinal)),
                Is.True,
                "CONTRAST: on the SAME console `pods` must still refuse, or the two tiers are not "
                + "distinguishable here and the leg above says nothing about which one `doors` is at: "
                + string.Join(" | ", sent));
        }

        /// <summary>
        /// The ship gate, and the tail answers the ASK. §13.47 filed <c>MossGate.Ask.Doors</c> as
        /// UNREACHABLE in the shipping client (M3-15 deleted the Room Zoom's OPERATE affordance, its
        /// only other caller). This op is the first shipping-surface caller of it.
        /// </summary>
        [Test]
        public void ADarkShipRefuses_AndTheTailAnswersTheDOORS_Ask()
        {
            var gs = WreckSession(out var host, out var sent);
            Assert.That(MossGate.IsServerLive(host.Sim), Is.False, "PRECONDITION: the wreck boots dark");

            SendDoors(gs);
            Assert.That(Stream(sent, 1), Is.Empty,
                "a dark computer enumerated the ship: " + string.Join(" | ", sent));
            var refusals = Stream(sent, 2);
            Assert.That(refusals.Count, Is.EqualTo(1), "expected exactly one refusal: "
                + string.Join(" | ", sent));
            Assert.That(refusals[0], Is.EqualTo(MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Doors)));
            StringAssert.Contains("TO REACH THE DOORS", refusals[0]);
            StringAssert.Contains("TERM_MOSS", refusals[0],
                "the refusal must still name the terminal a repair would fix (§13.47)");
        }

        // ══════════════════════════════════════════════════ 3. the wire, and the two degenerate arms

        /// <summary>
        /// ⭐ <b>NO NEW WIRE SHAPE.</b> The listing rides <c>MossExec</c>'s existing lines array on
        /// stream 1, the channel every typed line already answers on — so <c>WireFormat.cs</c> takes a
        /// ZERO diff and <c>reduceMossEvent</c> needed no new arm. Asserted at the wire rather than
        /// argued: the session emitted exactly one message, it is an <c>exec</c> reply, it is
        /// <c>ok:true</c>, and every line on it is stream 1.
        /// </summary>
        [Test]
        public void TheReplyRidesTheExecChannel_AndAddsNoWireShape()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);
            SendDoors(gs);

            Assert.That(sent.Count, Is.EqualTo(1), "expected ONE message: " + string.Join(" | ", sent));
            StringAssert.Contains("\"ev\":\"exec\"", sent[0]);
            StringAssert.Contains("\"ok\":true", sent[0]);
            Assert.That(sent[0], Does.Not.Contain("\"ev\":\"doors\""),
                "a new wire event appeared where the exec channel was supposed to carry it");
            Assert.That(Stream(sent, 0), Is.Empty, "stream 0 is the client's own echo");
            Assert.That(Stream(sent, 2), Is.Empty, "a successful listing is not an error stream");
        }

        /// <summary>⛔ <b>A READ: IT ENQUEUES NOTHING AND CHANGES NOTHING.</b> <c>pods</c>' claim, held
        /// to the same standard — the hashed state is identical either side of the ask.</summary>
        [Test]
        public void TheDirectoryIsAREAD_ItMovesNoShipState()
        {
            // A TWIN, because "the hash did not change" is not sayable on one sim that also ticked:
            // two identical sessions, one of which types `doors`, and nothing else differs.
            var gs = WreckSession(out var host, out var sent);
            var twin = WreckSession(out var ctl, out _);
            RepairConsole(host.Sim);
            RepairConsole(ctl.Sim);
            for (int i = 0; i < 5; i++) { host.Sim.Tick(); ctl.Sim.Tick(); }
            Assert.That(host.Sim.StateHash(), Is.EqualTo(ctl.Sim.StateHash()),
                "PRECONDITION: the twins must agree before one of them is asked anything");

            SendDoors(gs);                       // ONE side asks
            Assert.That(Rows(sent).Count, Is.GreaterThan(0), "PRECONDITION: and it was answered");
            // Drain: an op that enqueued an ISimCommand would show up on these ticks and not before.
            for (int i = 0; i < 5; i++) { host.Sim.Tick(); ctl.Sim.Tick(); }

            Assert.That(host.Sim.StateHash(), Is.EqualTo(ctl.Sim.StateHash()),
                "asking for the door directory moved the ship");
            GC.KeepAlive(twin);
        }

        /// <summary>The LOCK is a column and not a second verb: <c>SetDoorStateCommand</c> computes
        /// <c>open &amp;&amp; !IsLocked</c>, so a locked door answers the verb this listing teaches by
        /// silently staying shut. No authored ship locks a door, so it is driven here.</summary>
        [Test]
        public void ALockedDoorSaysSoOnItsOwnRow()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);
            var d = Doors(host.Sim)[0];
            Assert.That(host.Sim.Devices.Items.Any(x => x.Kind == DeviceKind.Door && x.IsLocked), Is.False,
                "PRECONDITION: no authored door is locked, so the marker below is this test's doing");
            d.IsLocked = true;

            SendDoors(gs);
            var rows = Rows(sent);
            var mine = rows.First(r => IdOf(r) == d.Name.ToUpperInvariant());
            StringAssert.EndsWith(" · LOCKED", mine);
            Assert.That(rows.Count(r => r.EndsWith(" · LOCKED", StringComparison.Ordinal)), Is.EqualTo(1),
                "every row was marked LOCKED, so the marker is not reading the flag");
        }

        /// <summary>The degenerate arm, honest rather than clever: a ship with no door has nothing to
        /// list, and a directory that prints NOTHING is M3-13's defect (a screen that says nothing is
        /// a broken verb). Unreachable on shipped content — all four authored ships carry doors — so
        /// it is driven on the smallest ship the composer can be asked about.</summary>
        [Test]
        public void AShipWithNoDoorsSaysSoInWords()
        {
            string[] map = { "#######", "#.....#", "#.....#", "#######" };
            var sim = new Simulation(AsciiWorld.Build(map), 7,
                                     SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));
            Assert.That(sim.Devices.Items.Any(d => d.Kind == DeviceKind.Door), Is.False,
                "PRECONDITION: this fixture must carry no door");

            var lines = MossGate.DescribeDoors(sim);
            Assert.That(lines, Is.EqualTo(new List<string> { MossGate.NoDoorsLine }));
            Assert.That(MossGate.NoDoorsLine, Does.Not.Contain("0 ABOARD"),
                "a census header for nothing is a table with no rows — say it in words instead");
        }

        // ══════════════════════════════════════════════════ 4. THE CHAIN

        /// <summary>
        /// ⭐⭐⭐ <b>THE OUTCOME TEST, AND IT IS THE WRECK CHAIN THIS REPO HAS NEVER DRIVEN END TO
        /// END.</b> Everything below is a PLAYER ACTION on the shipping <c>--ship wreck</c>, through
        /// the real host, with no fixture reaching past a command — the recipe, in order:
        ///
        /// <list type="number">
        ///   <item>type <c>doors</c> on the boot ship ⇒ MOSS IS OFFLINE … TO REACH THE DOORS.</item>
        ///   <item>grant REPAIR + HAUL in the WORK tab (<c>SetWorkPriorityCommand</c>, OD-H's opt-in)
        ///         and run; the crew services <c>term_moss</c> 0.14 → 1.00 and MOSS lights.</item>
        ///   <item>type <c>doors</c>. Read the TWO ids off the reply — <b>derived, not written down</b>:
        ///         the shut doors whose compartment holds a crafting bench.</item>
        ///   <item>type <c>open &lt;id&gt;</c> twice, using the exact strings the listing printed.
        ///         Both compartments open and the core's air floods them (3.2 → ~101 kPa).</item>
        ///   <item>grant CRAFT; the crew crosses the frontier, services the three benches
        ///         (0.09/0.10/0.10 → &gt;0.5) and starts the ladder.</item>
        ///   <item>turn REPAIR back OFF — a repair spends the same <c>Parts</c> the chain makes, and
        ///         choosing what the crew does with them is the player's call.</item>
        ///   <item>run: Regolith → Scrap → Parts → <b>ControllerModule</b>.</item>
        ///   <item>type <c>commission</c> with the module aboard ⇒ COMMISSION ACCEPTED, and
        ///         <c>pods</c> — refused two lines earlier — answers with the bay.</item>
        /// </list>
        ///
        /// <para><b>MEASURED ON THE COMMITTED TREE</b> (deterministic; the caps below carry margin and
        /// the test prints what it actually took): MOSS live at tick <b>64 011</b>, benches serviced by
        /// <b>121 221</b>, ControllerModule at <b>241 751</b> (≈6.7 sim-hours), whole test ≈8 s.</para>
        ///
        /// <para>⛔ <b>THE DOOR HALF IS WHAT THIS PACKAGE OWNS AND IT IS ASSERTED SEPARATELY ABOVE.</b>
        /// This test's job is the JOIN: that the ids the directory prints are the ids the fabrication
        /// chain is actually behind, and that typing them back opens the game.</para>
        /// </summary>
        [Test]
        public void TheChainRunsOnTheShippedWreck_ThroughTheDoorsTheListingNamed()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            int t = 0;

            // ── 1. the boot ship refuses, and names the next step ────────────────────────────────
            SendDoors(gs);
            Assert.That(Stream(sent, 2).Count, Is.EqualTo(1), "the dark ship said nothing");
            StringAssert.Contains("TO REACH THE DOORS", Stream(sent, 2)[0]);

            // ── 2. REPAIR + HAUL granted through the sim's own command; run until MOSS lights ───
            Grant(gs, sim, WorkType.Repair, WorkType.Haul);
            while (t < 150000 && !MossGate.IsServerLive(sim)) { sim.Tick(); t++; }
            Assert.That(MossGate.IsServerLive(sim), Is.True,
                "the crew never brought term_moss above maintain in " + t + " ticks (cond "
                + Dev(sim, Console).Condition.ToString("0.000", CultureInfo.InvariantCulture) + ")");
            TestContext.WriteLine("MOSS live at tick " + t);

            // ── 3. type `doors`, and derive the two ids FROM THE REPLY ───────────────────────────
            sent.Clear();
            SendDoors(gs);
            var rows = Rows(sent);
            Assert.That(rows.Count, Is.EqualTo(Doors(sim).Count), "no listing on a live console");

            // WHICH doors matter is derived from the SHIP — the shut ones whose compartment holds a
            // crafting bench — and the ID is then taken out of the LISTING'S OWN TEXT. A literal
            // "door_d0_s1" here would make this test pass against a listing that printed nothing.
            var wanted = ChainDoors(sim);
            Assert.That(wanted.Count, Is.EqualTo(2),
                "PRECONDITION: the wreck's chain must sit behind exactly two shut doors, found "
                + wanted.Count + " (" + string.Join(",", wanted.Select(d => d.Name)) + ")");
            var typed = new List<string>();
            foreach (var d in wanted)
            {
                var row = rows.FirstOrDefault(r => IdOf(r) == d.Name.ToUpperInvariant());
                Assert.That(row, Is.Not.Null,
                    "the fabrication chain is behind " + d.Name + " and the directory never named it:\n"
                    + string.Join("\n", rows));
                StringAssert.EndsWith(" · SHUT", row);
                typed.Add(IdOf(row));    // ⭐ the string the PLAYER would read and type back
            }
            TestContext.WriteLine("read from the listing: " + string.Join(", ", typed));

            // ── 4. open both, by the ids the listing gave ───────────────────────────────────────
            // ⛔ VERBATIM — the string the listing printed, NOT a case-folded version of it. An
            // earlier draft lower-cased here, which meant the pinned path never typed what the
            // player reads and a listing that printed an un-typeable id could still have passed.
            // The prompt IS case-tolerant (`ExecConsole` resolves the device name for the player),
            // and that tolerance is now pinned by this line rather than assumed by it.
            sent.Clear();
            foreach (var id in typed) SendExec(gs, "open " + id);
            for (int i = 0; i < 20; i++) { sim.Tick(); t++; }
            foreach (var d in wanted)
                Assert.That(d.IsOpen, Is.True, d.Name + " did not open");

            // ── 5. CRAFT granted; the frontier floods and the benches get serviced ──────────────
            var benches = ChainBenches(sim);
            Grant(gs, sim, WorkType.Craft);
            while (t < 250000 && !benches.All(b => b.Condition > 0.5f)) { sim.Tick(); t++; }
            Assert.That(benches.All(b => b.Condition > 0.5f), Is.True,
                "the benches were never serviced in " + t + " ticks: " + string.Join(", ",
                    benches.Select(b => b.Name + "=" + b.Condition.ToString("0.00", CultureInfo.InvariantCulture))));
            foreach (var b in benches)
                Assert.That(sim.Rooms.RoomAt(sim.World, b.Pos).PressureKPa, Is.GreaterThan(50.0),
                    b.Name + " is still standing in vacuum — the doors did not join the compartments");
            TestContext.WriteLine("benches serviced at tick " + t);

            // ── 6. REPAIR back off, so a repair stops spending the Parts the chain makes ────────
            foreach (var c in sim.Citizens.Items)
                gs.ApplyForTest(new WebCommand(CmdKind.WorkPriority, cid: c.Id,
                                               work: (int)WorkType.Repair, priority: 0));

            // ── 7. Regolith → Scrap → Parts → ControllerModule ──────────────────────────────────
            while (t < 450000 && Aboard(sim, ItemKind.ControllerModule) == 0) { sim.Tick(); t++; }
            Assert.That(Aboard(sim, ItemKind.ControllerModule), Is.GreaterThan(0),
                "the chain never produced a ControllerModule in " + t + " ticks — scrap "
                + Aboard(sim, ItemKind.Scrap) + ", parts " + Aboard(sim, ItemKind.Parts)
                + ", regolith " + Aboard(sim, ItemKind.Regolith));
            TestContext.WriteLine("ControllerModule at tick " + t);

            // ── 8. the module buys the console, and the console opens the bay ───────────────────
            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "commission", tid: ConsoleTid));
            Assert.That(Stream(sent, 1).Any(s => s.StartsWith("COMMISSION ACCEPTED", StringComparison.Ordinal)),
                Is.True, "the module was aboard and the console refused: " + string.Join(" | ", sent));
            sim.Tick(); t++;

            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "pods", tid: ConsoleTid));
            Assert.That(sent.Any(m => m.Contains("\"ev\":\"pods\"", StringComparison.Ordinal)), Is.True,
                "the POD BAY still refused a commissioned console: " + string.Join(" | ", sent));
            TestContext.WriteLine("commissioned and the bay is open at tick " + t);
        }

        private static int Aboard(Simulation sim, ItemKind kind)
            => sim.Items.Items.Where(s => s.Kind == kind).Sum(s => s.Count);

        private static readonly DeviceKind[] CraftKinds =
            { DeviceKind.SalvageRecycler, DeviceKind.Fabricator, DeviceKind.MachineShop };

        /// <summary>The wreck's three matter-ladder benches, found by KIND on deck 0 rather than by
        /// name, so a renamed bench fails the precondition instead of quietly narrowing the test.</summary>
        private static List<Device> ChainBenches(Simulation sim)
            => sim.Devices.Items.Where(d => d.Pos.Z == 0 && CraftKinds.Contains(d.Kind))
                               .OrderBy(d => d.Id).ToList();

        /// <summary>
        /// ⭐ WHICH doors the fabrication chain is behind — <b>derived from the ship, never written
        /// down</b>. For each shut door, the four orthogonal neighbours' room ids are compared against
        /// the room id of each crafting bench: a door with a bench's compartment on one side is a door
        /// that chain is locked behind. (A literal <c>door_d0_s1</c> here would survive a listing that
        /// printed the wrong name, which is half of what this test exists to catch.)
        /// </summary>
        private static List<Device> ChainDoors(Simulation sim)
        {
            var benchRooms = new HashSet<ushort>(
                ChainBenches(sim).Select(b => sim.Rooms.RoomIdAt(sim.World, b.Pos)));
            var found = new List<Device>();
            foreach (var d in sim.Devices.Items.Where(x => x.Kind == DeviceKind.Door && !x.IsOpen)
                                               .OrderBy(x => x.Id))
            {
                var near = new[]
                {
                    new Int3(d.Pos.X + 1, d.Pos.Y, d.Pos.Z), new Int3(d.Pos.X - 1, d.Pos.Y, d.Pos.Z),
                    new Int3(d.Pos.X, d.Pos.Y + 1, d.Pos.Z), new Int3(d.Pos.X, d.Pos.Y - 1, d.Pos.Z),
                };
                if (near.Any(p => benchRooms.Contains(sim.Rooms.RoomIdAt(sim.World, p)))) found.Add(d);
            }
            return found;
        }

        /// <summary>Grant work types through <see cref="SetWorkPriorityCommand"/> — the command the
        /// WORK tab sends. ⚠️ Never by touching <c>Citizen.SetWorkPriority</c>: OD-I's rule is "one
        /// rule, off everywhere", and a fixture reaching past the command is an authored exception in
        /// exactly the place OD-I forbids one (<c>WorkGrantHarness</c>'s own reasoning).</summary>
        private static void Grant(GameSession gs, Simulation sim, params WorkType[] types)
        {
            foreach (var c in sim.Citizens.Items)
                foreach (var w in types)
                    gs.ApplyForTest(new WebCommand(CmdKind.WorkPriority, cid: c.Id, work: (int)w,
                                                   priority: WorkPriority.SimpleModeEnabled));
        }
    }
}
