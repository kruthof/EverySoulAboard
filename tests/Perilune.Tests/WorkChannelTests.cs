using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using NUnit.Framework;
using Perilune.Glyph;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // WireFormat, GameSession, WebCommand

namespace Perilune.Tests
{
    /// <summary>
    /// M2-4 — <c>SetWorkPriorityCommand</c> AND THE <c>work</c> CHANNEL: the two halves that turn
    /// M2-1's storage-only grid into something a player can write and a surface can read.
    ///
    /// WHAT THIS FILE OWNS, in the order the charter's mutation table names it:
    ///   1. THE DRIVEN END-TO-END — a <c>workPriority</c> message off the wire reaches
    ///      <see cref="Citizen"/>. Driven through <c>WebCommand.Parse</c> → <c>GameSession.Apply</c> →
    ///      <c>Simulation.Tick</c>, i.e. the real path, not a hand-built command.
    ///   2. THE <i>OFF</i> LEG — priority 0 means OFF and round-trips as off. A clamp that treated 0
    ///      as 1 would make the grid a ONE-WAY DOOR: the player could switch work on and never off.
    ///   3. THE TWO-PAWN LEG — the order lands on the citizen with that ID, not at that INDEX.
    ///   4. THE SOURCE — the channel reads <c>sim.Citizens</c>, and the fact it carries is INVISIBLE
    ///      in the projection (the <c>marks</c>/<c>items</c> lesson, one step further along: there is
    ///      no tile for a work priority, so no pass ordering could ever have produced it).
    ///   5. THE DELTA GATE, element by element — the eighth trap wearing this package's clothes.
    ///   6. Pin-neutrality's in-suite half: the channel and its gate never move <c>StateHash</c>.
    ///
    /// (Mutation 6 — removing <c>getWork</c> from <c>SHIP_STATE_REACH</c> — is the JS half and is
    /// already mechanised by <c>client/test/surface-boundary.test.js</c>'s frozen census; it needed no
    /// new test, only the entry, and the mutation was run.)
    ///
    /// ⚠️ THE FIXTURE IS THE SHIPPING WRECK, not a synthetic two-citizen sim, and that is deliberate
    /// for legs 3 and 5: the two-pawn leg is about ids not being indices, which needs a real crew
    /// store, and the delta gate's controls (row count unchanged, cid set unchanged) are only
    /// meaningful against a real roster. <c>--ship wreck</c> is what <c>./play.sh</c> boots
    /// (<c>WebHostDefaultShipTests</c>), so these assertions are about the game the player runs.
    /// </summary>
    public class WorkChannelTests
    {
        // ═══════════════════════════════════════════════════════════════════ fixture + readers

        /// <summary>
        /// A session over a shipping ship, NOT started (so no sim thread races the assertions).
        ///
        /// ⚠️ THE DEFAULT IS <c>--ship wreck</c> — what <c>./play.sh</c> boots and
        /// <c>WebHostDefaultShipTests</c> pins — so every leg below is about the game the player runs.
        /// <b>The wreck carries exactly ONE live crew member</b> (the cryo survivor; that is the
        /// premise), which is why the id-versus-index leg boots <c>--ship grid</c> instead and says so
        /// at its own fixture. Two rows do NOT need two pawns: one pawn with two work types enabled is
        /// two rows, and that is what the delta-gate legs use.
        /// </summary>
        private static (GameSession gs, SimHost host, List<string> sink) Boot(ShipChoice ship = ShipChoice.Wreck)
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ship), ship: ship);
            var gs = new GameSession(host, sink.Add);   // NOT started ⇒ no sim thread
            return (gs, host, sink);
        }

        /// <summary>The cached <c>work</c> payload after a FORCED render, taken from the Snapshot a
        /// reconnecting client is caught up from — so every assertion below also proves the channel
        /// survives a reconnect. (A channel absent from <c>Snapshot</c>'s key list renders empty until
        /// the next render happens to change it, and this payload only changes when the PLAYER moves a
        /// priority: it would be the measured `materials` gap — 0 messages in 4 s — applied to the
        /// player's own orders.)</summary>
        private static string WorkJson(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"work\""));
            Assert.IsNotNull(json, "the work channel must be cached for Snapshot catch-up — a " +
                                   "reconnecting tab that loses it shows an EMPTY work grid, i.e. the " +
                                   "player's own orders, for as long as nobody touches the grid again");
            return json;
        }

        /// <summary>The message the tuple-width guards share. ⚠️ BOTH PARSERS BELOW READ FIELDS
        /// POSITIONALLY, so a tuple that silently grows or shrinks turns them into confident readers of
        /// the wrong column — this is the guard that refused the tree when the OPERATE verb and the
        /// devices delta gate merged. UPDATE THE WIDTH AND THE PARSER TOGETHER, never the width
        /// alone.</summary>
        private const string TupleWidth = "a work tuple is THREE elements (cid,workType,priority)";

        /// <summary>Parse the emitted tuples back out, in wire order. Deliberately positional: the
        /// tuple IS the contract, and a parser that named its fields would not notice a reorder.</summary>
        private static List<(int Cid, int Work, int Priority)> Tuples(string json)
        {
            var list = new List<(int, int, int)>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                string body = part.Split(']')[0];
                var f = body.Split(',');
                Assert.AreEqual(3, f.Length, TupleWidth + ", saw: [" + body + "]");
                list.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                          int.Parse(f[1], CultureInfo.InvariantCulture),
                          int.Parse(f[2], CultureInfo.InvariantCulture)));
            }
            return list;
        }

        /// <summary>The channel's answer for one (citizen, work type) pair: the priority, or 0 for a
        /// row that is absent — which is what "absent = off" means, and is the sim's own semantics
        /// rather than a convention this test invented.</summary>
        private static int ChannelPriority(GameSession gs, uint cid, WorkType type)
        {
            foreach (var t in Tuples(WorkJson(gs)))
                if (t.Cid == (int)cid && t.Work == (int)type) return t.Priority;
            return 0;
        }

        /// <summary>Send one <c>workPriority</c> line THROUGH THE REAL PARSER and let the sim apply it
        /// at the next tick boundary. The JSON is built as text on purpose: the wire is text, and a
        /// test that constructed a <see cref="WebCommand"/> directly would skip the reader that has to
        /// tell a missing key from a real 0.</summary>
        private static void SendWorkPriority(GameSession gs, SimHost host, uint cid, int work, int priority)
        {
            string json = "{\"cmd\":\"workPriority\",\"cid\":" + cid.ToString(CultureInfo.InvariantCulture) +
                          ",\"work\":" + work.ToString(CultureInfo.InvariantCulture) +
                          ",\"priority\":" + priority.ToString(CultureInfo.InvariantCulture) + "}";
            var cmd = WebCommand.Parse(json);
            Assert.AreEqual(CmdKind.WorkPriority, cmd.Kind,
                "the tolerant reader did not recognise " + json + " — nothing below is exercising the " +
                "wire at all if this fails");
            gs.ApplyForTest(cmd);
            host.Sim.Tick();   // commands drain at the top of a tick, never mid-tick
        }

        /// <summary>The first LIVE crew member — the one a player on the wreck actually has.</summary>
        private static Citizen OnePawn(Simulation sim)
        {
            var store = sim.Citizens.Items;
            for (int i = 0; i < store.Count; i++) if (!store[i].Dead) return store[i];
            Assert.Fail("no live crew on this ship — every leg below would be vacuous");
            return null;
        }

        /// <summary>Two LIVE crew members whose ids are NOT their store indices, plus the store itself.
        /// Asserted rather than assumed: the whole point of leg 3 is that an id is not an index, and a
        /// fixture where they happened to coincide would make the test vacuous.</summary>
        private static (Citizen a, Citizen b, List<Citizen> store) TwoPawns(Simulation sim)
        {
            var store = new List<Citizen>(sim.Citizens.Items);
            var live = new List<Citizen>();
            for (int i = 0; i < store.Count; i++) if (!store[i].Dead) live.Add(store[i]);
            Assert.That(live.Count, Is.GreaterThanOrEqualTo(2),
                "the fixture carries " + live.Count + " live crew; the two-pawn leg needs two");
            var a = live[0];
            var b = live[1];
            Assert.AreNotEqual(store.IndexOf(b), (int)b.Id,
                "the second pawn's ID equals its store INDEX on this ship, so 'apply by index' and " +
                "'apply by id' would land on the same citizen and leg 3 would be vacuous. Pick a " +
                "citizen further down the store, or a ship with more crew.");
            return (a, b, store);
        }

        // ═══════════════════════════════════════════ 1. THE DRIVEN END-TO-END (the outcome test)

        /// <summary>
        /// ⭐ THE PACKAGE'S OUTCOME, DRIVEN: a <c>workPriority</c> line arrives on the socket, the sim
        /// applies it at a tick boundary, the byte is on <see cref="Citizen"/>, and the <c>work</c>
        /// channel carries it back out. Both directions in one test, because the package's claim is
        /// the ROUND TRIP — a command with no channel is invisible and a channel with no command is
        /// read-only.
        ///
        /// ⚠️ THE PRECONDITION IS ASSERTED. Under OD-H every work type boots OFF, so the channel is
        /// EMPTY at boot; without that leg this test would pass against a host that shipped a
        /// hard-coded row.
        ///
        /// MUTATION 1: make <c>SetWorkPriorityCommand.Execute</c> a no-op ⇒ RED here.
        /// </summary>
        [Test]
        public void A_WorkPriority_Message_Reaches_The_Citizen_And_Comes_Back_On_The_Channel()
        {
            var (gs, host, _) = Boot();
            var a = OnePawn(host.Sim);

            // PRECONDITION — OD-H: nothing is enabled, so the channel is empty.
            Assert.That(Tuples(WorkJson(gs)), Is.Empty,
                "the work channel is not empty at boot. OD-H is that work is OPT-IN (every work type " +
                "off for every crew member on every ship), which is what makes OD-G's idle-and-waiting " +
                "pawn possible — and it is what makes this channel inert until the player acts.");
            Assert.AreEqual(WorkPriority.Off, a.GetWorkPriority(WorkType.Repair));

            SendWorkPriority(gs, host, a.Id, (int)WorkType.Repair, WorkPriority.Highest);

            Assert.AreEqual(WorkPriority.Highest, a.GetWorkPriority(WorkType.Repair),
                "THE ORDER NEVER REACHED THE CITIZEN. A workPriority line was parsed, dispatched and " +
                "drained through a tick, and Citizen.WorkPrioritiesRaw did not move — which means the " +
                "player has no verb at all and M2-2/M2-3 have nothing to operate.");
            Assert.AreEqual(WorkPriority.Highest, ChannelPriority(gs, a.Id, WorkType.Repair),
                "the byte is on the citizen but not on the wire: the channel is not reading the state " +
                "the command writes, so the grid the player just set would draw itself as still off.");
            // …and ONLY that one cell moved: one row, and no other work type touched.
            var rows = Tuples(WorkJson(gs));
            Assert.AreEqual(1, rows.Count,
                "one work type was enabled and the channel carries " + rows.Count + " rows. The channel " +
                "is SPARSE — a row per switched-ON pair — so a second row means either an off type is " +
                "being emitted as 0 or the command wrote more than it was asked to.");
            Assert.AreEqual(((int)a.Id, (int)WorkType.Repair, (int)WorkPriority.Highest), rows[0]);
        }

        /// <summary>
        /// EVERY WORK TYPE IS REACHABLE AND EVERY PRIORITY IS REACHABLE — the domain, driven rather
        /// than described. Six types × 1..4, each set and read back off the citizen AND off the wire.
        ///
        /// ⚠️ WHY THIS IS NOT REDUNDANT WITH THE TEST ABOVE: that one drives <c>Repair</c> at
        /// <c>Highest</c>, i.e. <c>work = 0, priority = 1</c>. A bridge that dropped the payload and
        /// hard-coded those two constants would pass it — and 0/1 are exactly the values a
        /// sloppy default lands on.
        /// </summary>
        [Test]
        public void Every_WorkType_And_Every_Manual_Priority_Is_Reachable_From_The_Wire()
        {
            var (gs, host, _) = Boot();
            var a = OnePawn(host.Sim);

            foreach (WorkType t in Enum.GetValues(typeof(WorkType)))
                for (byte p = WorkPriority.Highest; p <= WorkPriority.Lowest; p++)
                {
                    SendWorkPriority(gs, host, a.Id, (int)t, p);
                    Assert.AreEqual(p, a.GetWorkPriority(t),
                        "work type " + t + " at priority " + p + " did not land on the citizen");
                    Assert.AreEqual(p, ChannelPriority(gs, a.Id, t),
                        "work type " + t + " at priority " + p + " did not reach the wire");
                }
        }

        // ═══════════════════════════════════════════════════════════════ 2. THE *OFF* LEG

        /// <summary>
        /// ⭐ <c>0</c> MEANS OFF, AND OFF IS SENDABLE. Enable a work type, then switch it back off and
        /// read that back — off the citizen (the byte is <see cref="WorkPriority.Off"/>) and off the
        /// wire (the ROW IS GONE, which is what "absent = off" means on a sparse channel).
        ///
        /// ⚠️ WHY THIS IS THE MOST IMPORTANT LEG IN THE FILE AFTER THE OUTCOME TEST. A clamp to
        /// <c>1..4</c> is the natural way to write a range guard, and it is WRONG here in a way that
        /// nothing else would catch: the grid becomes a ONE-WAY DOOR, the player can enable work and
        /// never disable it, and the sim's own documentation of <see cref="WorkPriority.Off"/> —
        /// "the ABSENCE of a priority, not a fifth priority value" — makes 0 a first-class order
        /// rather than an edge case. OD-H's whole premise is that off is the DEFAULT state, so off
        /// must be a reachable destination too.
        ///
        /// MUTATION 2: clamp the priority to 1..4 but accept 0 as 1 (e.g. <c>priority == 0 ? 1 :
        /// priority</c> anywhere on the path) ⇒ RED here.
        /// </summary>
        [Test]
        public void Priority_Zero_Means_OFF_And_Round_Trips_As_Off()
        {
            var (gs, host, _) = Boot();
            var a = OnePawn(host.Sim);

            SendWorkPriority(gs, host, a.Id, (int)WorkType.Haul, 2);
            Assert.AreEqual(2, a.GetWorkPriority(WorkType.Haul), "precondition: the enable did not land");
            Assert.AreEqual(2, ChannelPriority(gs, a.Id, WorkType.Haul), "precondition: it is not on the wire");

            SendWorkPriority(gs, host, a.Id, (int)WorkType.Haul, WorkPriority.Off);

            Assert.AreEqual(WorkPriority.Off, a.GetWorkPriority(WorkType.Haul),
                "PRIORITY 0 DID NOT SWITCH THE WORK TYPE OFF. It was stored as " +
                a.GetWorkPriority(WorkType.Haul) + " instead — a clamp is treating the OFF order as a " +
                "priority. The player can now enable work and never disable it, and every RimWorld " +
                "analogue this grid is built on says blank is a state the player can return to.");
            Assert.IsFalse(a.IsWorkEnabled(WorkType.Haul), "…and IsWorkEnabled agrees it is off");
            Assert.That(Tuples(WorkJson(gs)).Where(r => r.Cid == (int)a.Id && r.Work == (int)WorkType.Haul),
                Is.Empty,
                "the row survived on the wire after the work type was switched off. On a SPARSE channel " +
                "an off pair has NO row — a row carrying 0 would make every client re-derive the " +
                "meaning of 0, and a row carrying the old priority would freeze the grid.");
        }

        // ═══════════════════════════════════════════════════════════ 3. THE TWO-PAWN LEG (id ≠ index)

        /// <summary>
        /// ⭐ THE ORDER LANDS ON THE CITIZEN WITH THAT <b>ID</b>, NOT AT THAT INDEX. Two live pawns; the
        /// order names the SECOND one; the first must be untouched and the second must have exactly the
        /// priority that was sent.
        ///
        /// ⚠️ IDS ARE NOT INDICES, AND ON A WRECK THAT IS NOT HYPOTHETICAL — the premise of this ship
        /// is a post-raid cryo bay, crew die of vacuum and thermal exposure, and every death shifts
        /// every later index while no id moves. <see cref="TwoPawns"/> ASSERTS that the target's id and
        /// index differ, so an index-based implementation lands on a different person rather than
        /// accidentally on the right one.
        ///
        /// MUTATION 3: resolve the citizen by <c>sim.Citizens.Items[(int)_citizenId]</c> instead of
        /// <c>TryGet</c> ⇒ RED here (the priority appears on a third crew member and the named one
        /// stays off).
        /// </summary>
        [Test]
        public void The_Order_Applies_By_Citizen_Id_Not_By_Store_Index()
        {
            // ⚠️ `--ship grid`, NOT the wreck, AND THE REASON IS THE FIXTURE RATHER THAN THE CLAIM: the
            // wreck boots exactly ONE live crew member (the cryo survivor — that is its premise), and
            // with one citizen an index-based lookup and an id-based lookup cannot be told apart. Grid
            // is the repo's crewed fixture (`DevicesDeltaTests` boots it for the same reason). The
            // charter requires the fixture to carry two pawns; this is where it does.
            var (gs, host, _) = Boot(ShipChoice.Grid);
            var (a, b, store) = TwoPawns(host.Sim);

            SendWorkPriority(gs, host, b.Id, (int)WorkType.Construct, 3);

            Assert.AreEqual(3, b.GetWorkPriority(WorkType.Construct),
                "the order named citizen " + b.Id + " (store index " + store.IndexOf(b) + ") and that " +
                "citizen's grid did not move. An id was used as an index: after any death those are " +
                "different people, and the player's order lands on whoever happens to sit at that slot.");
            Assert.AreEqual(WorkPriority.Off, a.GetWorkPriority(WorkType.Construct),
                "the order landed on the WRONG crew member (" + a.Id + ", the first live one) — the id " +
                "is being read as an index.");

            // …and the wire agrees: exactly one row, carrying b's id.
            var rows = Tuples(WorkJson(gs));
            Assert.AreEqual(1, rows.Count, "exactly one pair is enabled, so exactly one row is expected");
            Assert.AreEqual((int)b.Id, rows[0].Cid,
                "the channel reported the priority against cid " + rows[0].Cid + " rather than " + b.Id +
                ": the row is keyed by store position somewhere, so the grid would attach a player's " +
                "order to a different face the first time anyone dies.");
        }

        /// <summary>
        /// AN ILLEGAL REQUEST IS A SILENT NO-OP — never a throw, and never a write. Four shapes: an
        /// unknown citizen id, a work-type index past the end, a negative work type, and a priority
        /// out of range in both directions.
        ///
        /// ⚠️ THE THROW THIS PREVENTS IS REAL AND IS IN THIS TREE:
        /// <see cref="Citizen.SetWorkPriority"/> raises <c>ArgumentOutOfRangeException</c> on a
        /// priority above <see cref="WorkPriority.Lowest"/> — deliberately, because the byte is HASHED
        /// — and <c>GetWorkPriority</c> would index the six-slot array out of bounds for a bad type. A
        /// command that let either escape would take the session down on a malformed line, from the
        /// sim thread's command drain. THE CLASS IS THE GUARD; the host bridge deliberately validates
        /// nothing, so this is the only place the domain is enforced.
        /// </summary>
        [Test]
        public void An_Illegal_Request_Is_A_Silent_No_Op_Not_A_Throw()
        {
            var (gs, host, _) = Boot();
            var a = OnePawn(host.Sim);
            var sim = host.Sim;
            // A TWIN, same ship and same seed, that receives NO orders. It is the control for the hash
            // leg below: each send advances the sim by one tick, so "the hash did not move" is not a
            // statement anyone could make — the tick count alone moves it. What CAN be stated, and is
            // stronger, is that a sim which refused five orders is byte-for-byte a sim that was never
            // asked. (Determinism makes that exact; it is the twin-run equality `ci.sh` pin P1 uses.)
            var (_, twin, _) = Boot();
            const int IllegalOrders = 5;

            Assert.DoesNotThrow(() =>
            {
                SendWorkPriority(gs, host, 999999u, (int)WorkType.Repair, 1);          // no such citizen
                SendWorkPriority(gs, host, a.Id, WorkPriority.WorkTypeCount, 1);        // one past the last type
                SendWorkPriority(gs, host, a.Id, -1, 1);                                // negative type
                SendWorkPriority(gs, host, a.Id, (int)WorkType.Repair, WorkPriority.Lowest + 1); // 5
                SendWorkPriority(gs, host, a.Id, (int)WorkType.Repair, -1);              // the absent-key sentinel
            }, "an illegal work-priority request threw. It arrives from a tolerant reader on a socket, " +
               "and Citizen.SetWorkPriority throws on an out-of-range priority BY DESIGN — a command " +
               "that lets it escape kills the session on a malformed line.");

            Assert.AreEqual(WorkPriority.Off, a.GetWorkPriority(WorkType.Repair),
                "an out-of-range request WROTE to the grid. A refused order must change nothing at all.");
            Assert.That(Tuples(WorkJson(gs)), Is.Empty, "…and nothing reached the wire either");
            for (int i = 0; i < IllegalOrders; i++) twin.Sim.Tick();
            Assert.AreEqual(twin.Sim.StateHash(), sim.StateHash(),
                "a sim that REFUSED five work-priority orders is not byte-for-byte a sim that was never " +
                "asked. A no-op that writes is not a no-op, and this state is hashed and saved (CITZ v8) " +
                "— so a stray write here moves every determinism pin.");

            // A MISSING KEY IS NOT A ZERO — the `filter` mask's lesson, and it bites twice here because
            // 0 is a real value in BOTH fields. `{"cmd":"workPriority","cid":N}` must not read as
            // "Repair off"; it must decode to the sentinel and be dropped.
            SendWorkPriority(gs, host, a.Id, (int)WorkType.Repair, 2);
            var bare = WebCommand.Parse("{\"cmd\":\"workPriority\",\"cid\":" +
                                        a.Id.ToString(CultureInfo.InvariantCulture) + "}");
            Assert.AreEqual(-1, bare.Work, "an ABSENT `work` key decoded to " + bare.Work + " instead of " +
                "the -1 sentinel. 0 is a REAL work type (Repair, the wreck's premise), so a malformed " +
                "line would silently address it.");
            Assert.AreEqual(-1, bare.Priority, "an ABSENT `priority` key decoded to " + bare.Priority +
                " instead of the -1 sentinel. 0 is a REAL order (switch this work type OFF), so a " +
                "malformed line would silently disable work — the most destructive reading available, " +
                "and under OD-H an invisible one.");
            gs.ApplyForTest(bare);
            host.Sim.Tick();
            Assert.AreEqual(2, a.GetWorkPriority(WorkType.Repair),
                "a workPriority line with no payload at all switched Repair off. Both keys must decode " +
                "to a sentinel the command's range guard drops.");
        }

        // ═══════════════════════════════════ 4. THE SOURCE — sim.Citizens, and NOT the projection

        /// <summary>
        /// ⭐ THE CHANNEL READS THE SIM, AND THE PROJECTION CANNOT CARRY THIS AT ALL. A priority moves;
        /// the ENTIRE projected <see cref="GlyphBuffer"/> for the pawn's deck is byte-identical before
        /// and after (glyph, fg, bg and attr, every cell), and the channel changed.
        ///
        /// ⚠️ THIS IS THE <c>marks</c>/<c>items</c> LESSON ONE STEP FURTHER ALONG, AND THE DIFFERENCE
        /// MATTERS. Those channels exist because a LATER <c>GlyphMapper</c> pass overwrites a byte an
        /// EARLIER pass wrote — the fact reaches the projection and is then lost, so "read it off
        /// <c>cell[1]</c>" was at least a coherent (wrong) idea. A work priority never reaches the
        /// projection at all: it is a fact about a PERSON, there is no tile it belongs to, and no pass
        /// ordering, precedence rule or extra byte could produce it. The non-vacuity control is the
        /// whole-buffer comparison — without it this test would pass against a projection that had
        /// quietly started carrying the grid.
        ///
        /// MUTATION 4: emit the channel from the projection instead of <c>sim.Citizens</c> ⇒ there is
        /// nothing to emit FROM, which is what this test says: the payload would be constant while the
        /// grid moved, and the second assertion goes red.
        /// </summary>
        [Test]
        public void The_Channel_Reads_The_Citizen_Store_And_The_Projection_Shows_Nothing()
        {
            var (gs, host, _) = Boot();
            var sim = host.Sim;
            var a = OnePawn(sim);

            var before = Project(sim, a.Pos.Z);
            string wireBefore = WorkJson(gs);

            SendWorkPriority(gs, host, a.Id, (int)WorkType.Mine, WorkPriority.Highest);

            // NON-VACUITY, and it is the point of the test: the projection did not move by one byte.
            var after = Project(sim, a.Pos.Z);
            Assert.IsTrue(SameBuffer(before, after),
                "THE PROJECTION CHANGED when a work priority moved. Either GlyphMapper has started " +
                "carrying per-citizen work state (in which case this channel's whole justification " +
                "needs re-deriving, not this test relaxing), or the fixture moved something else — a " +
                "pawn walked, a machine wore — and this test is no longer isolating the grid.");

            Assert.AreNotEqual(wireBefore, WorkJson(gs),
                "the `work` payload did not change when a citizen's priority did. The channel is not " +
                "reading sim.Citizens — and nothing else can supply this: the projection is byte-" +
                "identical across the same change (asserted above), so there is no other source.");
            Assert.AreEqual(WorkPriority.Highest, ChannelPriority(gs, a.Id, WorkType.Mine));

            // FOG IS NOT A GATE HERE, unlike all six tile-keyed sparse channels — asserted because it
            // is a deliberate divergence and a reviewer will (rightly) ask. This is the player's own
            // order about their own crew; gating it on the tile the pawn stands on would make a work
            // grid blink out when someone walked into an unexplored hall.
            var level = sim.World.Levels[a.Pos.Z];
            level.Flags[a.Pos.Y * sim.World.Width + a.Pos.X] &= unchecked((byte)~(byte)TileFlags.Explored);
            Assert.AreEqual(WorkPriority.Highest, ChannelPriority(gs, a.Id, WorkType.Mine),
                "a crew member standing on an UNEXPLORED tile lost their work priorities. This channel " +
                "is keyed by person, not by place: fog-gating it hides an order the player gave, which " +
                "is the opposite of what the other channels' fog gate protects.");
        }

        private static GlyphBuffer Project(Simulation sim, int deck)
        {
            var dst = new GlyphBuffer(sim.World.Width, sim.World.Height);
            GlyphMapper.Project(sim, deck, Lens.None, null, dst);
            return dst;
        }

        /// <summary>Whole-buffer equality over all four bytes of every cell. Compares CELLS and not
        /// just glyphs: "the projection cannot carry this" has to mean the entire cell is identical, or
        /// a reader could in principle have recovered the fact from some other byte.</summary>
        private static bool SameBuffer(GlyphBuffer x, GlyphBuffer y)
        {
            if (x.Width != y.Width || x.Height != y.Height) return false;
            for (int j = 0; j < x.Height; j++)
                for (int i = 0; i < x.Width; i++)
                {
                    var c = x[i, j];
                    var d = y[i, j];
                    if (c.Glyph != d.Glyph || c.Fg != d.Fg || c.Bg != d.Bg || c.Attr != d.Attr) return false;
                }
            return true;
        }

        // ═══════════════════════════ 5. THE DELTA GATE — element by element, and DRIVEN

        /// <summary>
        /// EACH OF THE THREE FIELDS ALONE MUST DENY A SKIP — an INCLUSION table over
        /// <see cref="WireFormat.WorkCell.SameAs"/>, not a population count (CLAUDE.md's fourth trap is
        /// a guard whose scope excludes the violation).
        ///
        /// ⚠️ AND THIS TEST ALONE CANNOT BIND THE GATE — said here rather than left for the next reader,
        /// because the <c>devices</c> lane's first version of the same file claimed it could and was
        /// wrong: it asserts against <c>SameAs</c>, so it holds only while
        /// <c>GameSession.SameAsLastWork</c> CALLS that method. A gate rewritten to compare fields
        /// inline leaves every row here green. What catches that is
        /// <see cref="Moving_Only_The_Priority_Element_Is_Not_A_Skip"/>, which drives <c>SendWork</c>
        /// itself.
        ///
        /// MUTATION 5 (its unit half): drop any field from <c>WorkCell.SameAs</c> ⇒ its row fails —
        /// and the <c>Priority</c> row is the one the charter names, because it is the field a player
        /// moves without adding or removing a row.
        /// </summary>
        [Test]
        public void The_Cache_Key_Reads_All_THREE_Fields()
        {
            var baseline = new WireFormat.WorkCell(7, (int)WorkType.Repair, 2);
            Assert.IsTrue(baseline.SameAs(baseline), "a cell must equal itself, or every skip is denied");
            Assert.IsTrue(baseline.SameAs(new WireFormat.WorkCell(7, (int)WorkType.Repair, 2)),
                "two identical cells compared unequal — the gate would never skip anything, which makes " +
                "the scheme inert rather than wrong and is the harder failure to notice");

            foreach (var (field, other) in new (string, WireFormat.WorkCell)[]
            {
                ("Cid — the same work type at the same priority on a DIFFERENT crew member. Reachable " +
                 "the moment two pawns are enabled and one dies: the list shortens and every later row " +
                 "shifts, so a key that ignored cid would attach one pawn's grid to another's face",
                    new WireFormat.WorkCell(8, (int)WorkType.Repair, 2)),
                ("WorkType — the same crew member's OTHER work type at the same priority. This is the " +
                 "row a 'compare cid and priority' key fails, and the player would watch a click land " +
                 "on the wrong column",
                    new WireFormat.WorkCell(7, (int)WorkType.Haul, 2)),
                // ⭐ THE ROW THE CHARTER NAMES, and the most reachable one in the table: a player
                // dragging Repair from 3 to 1 changes NO row's existence, NO cid and NO work type. The
                // row count is identical, so a count-keyed gate sees nothing and the grid the player is
                // looking at freezes — with every other test in this file green. That is the DeviceCell
                // `Open` scar in this package's clothes.
                ("Priority — the manual priority itself, i.e. the whole point of the channel",
                    new WireFormat.WorkCell(7, (int)WorkType.Repair, 1)),
            })
            {
                Assert.IsFalse(baseline.SameAs(other),
                    "THE CACHE KEY IGNORES " + field + ". A field the key does not read is a field whose " +
                    "change is silently never re-serialized: the client keeps the previous value " +
                    "forever, because nothing re-broadcasts a state channel that never changes.");
                Assert.AreNotEqual(WireFormat.Work(new[] { baseline }), WireFormat.Work(new[] { other }),
                    "NON-VACUITY for the row above: the serializer really does distinguish these two " +
                    "cells, so denying the skip is necessary rather than merely cautious.");
            }
        }

        /// <summary>
        /// ⭐ THE GUARD THAT ACTUALLY BINDS THE GATE, and the second one mutation 5 reddens. It drives
        /// <c>GameSession.SendWork</c> — not <c>SameAs</c> — through a change whose ONLY moving element
        /// is <c>priority</c>: one crew member's Repair goes from 4 to 1. The row COUNT is unchanged and
        /// the set of (cid, workType) pairs is unchanged, and BOTH are asserted as controls, because if
        /// either moved the test would pass for the wrong reason and be one more guard that cannot see
        /// its own subject.
        ///
        /// ⚠️ THIS IS THE REACHABLE FAILURE, NOT A CONTRIVED ONE. Re-ranking an already-enabled work
        /// type is the ordinary use of a work grid — it is what the grid is FOR once everything the
        /// player wants is switched on — and it is the one edit that moves no row's existence.
        ///
        /// MUTATION: drop the <c>Priority</c> clause from <c>WorkCell.SameAs</c> ⇒ RED here AND in
        /// <see cref="The_Cache_Key_Reads_All_THREE_Fields"/> — two guards, which is what the charter
        /// asks for. Compare the <c>Priority</c> element in a separate, shorter loop instead ⇒ RED here
        /// only.
        /// </summary>
        [Test]
        public void Moving_Only_The_Priority_Element_Is_Not_A_Skip()
        {
            var (gs, host, _) = Boot();
            var a = OnePawn(host.Sim);

            // TWO ROWS, from ONE pawn with two work types on — the wreck has one crew member and two
            // rows is what the count control needs, not two people.
            SendWorkPriority(gs, host, a.Id, (int)WorkType.Repair, WorkPriority.Lowest);
            SendWorkPriority(gs, host, a.Id, (int)WorkType.Haul, 2);
            gs.RenderForTest();                       // prime (forced ⇒ always serializes)
            int before = gs.WorkSerializedForTest;
            string cachedBefore = WorkJson(gs);
            var pairsBefore = Tuples(cachedBefore).Select(r => (r.Cid, r.Work)).OrderBy(p => p).ToList();
            Assert.AreEqual(2, pairsBefore.Count, "the fixture must carry two rows for the controls to bite");
            before = gs.WorkSerializedForTest;        // re-read: WorkJson forces a render

            SendWorkPriority(gs, host, a.Id, (int)WorkType.Repair, WorkPriority.Highest);
            gs.RenderUnforcedForTest();
            string cachedAfter = CachedWork(gs);

            // THE TWO CONTROLS FIRST. Without them a count-only key could be "caught" by a row
            // appearing or disappearing, and this test would say nothing about the third element.
            var pairsAfter = Tuples(cachedAfter).Select(r => (r.Cid, r.Work)).OrderBy(p => p).ToList();
            CollectionAssert.AreEqual(pairsBefore, pairsAfter,
                "the set of (cid, workType) pairs moved, so a key comparing only those two — or only the " +
                "row COUNT — would have denied this skip anyway, and this test is not exercising the " +
                "priority element at all. Re-rank an ALREADY-ENABLED work type.");

            Assert.That(gs.WorkSerializedForTest, Is.EqualTo(before + 1),
                "A CREW MEMBER'S PRIORITY WAS RE-RANKED — same pawn, same work type, same row count — " +
                "AND THE GATE SKIPPED THE RENDER. Re-ranking is the ordinary use of a work grid, so the " +
                "player would drag a column and watch nothing happen, forever: nothing re-broadcasts a " +
                "state channel that never changes. The cache key is reading less than the serializer.");
            Assert.AreNotEqual(cachedBefore, cachedAfter,
                "…and the payload really did differ, so the assertion above is about a real change");
        }

        /// <summary>The cached payload WITHOUT forcing a render — the gate's own output, for tests that
        /// count serializations. (<see cref="WorkJson"/> forces, which bypasses the gate by design.)</summary>
        private static string CachedWork(GameSession gs) =>
            gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"work\""));

        /// <summary>
        /// THE FLIP, which is what a cache test is for: unchanged ⇒ skipped, changed ⇒ re-serialized,
        /// unchanged again ⇒ skipped again (so the gate is not a one-shot that arms and never re-arms).
        /// Driven through the real render path on the shipping wreck.
        ///
        /// MUTATION: delete the <c>SameAsLastWork</c> guard ⇒ leg 1 fails; make it return <c>true</c>
        /// unconditionally ⇒ leg 2 fails and the channel is frozen at boot for the rest of the session;
        /// consult the gate before checking <c>force</c> ⇒ leg 4 fails, and a reconnecting tab would
        /// never be told what the crew are allowed to do.
        /// </summary>
        [Test]
        public void Unchanged_Skips_Changed_Re_Serializes_And_It_Re_Arms()
        {
            var (gs, host, sink) = Boot();
            var a = OnePawn(host.Sim);
            gs.RenderForTest();                       // prime
            int primed = gs.WorkSerializedForTest;
            Assert.That(primed, Is.GreaterThanOrEqualTo(1), "the prime did not serialize at all");

            // LEG 1 — nothing moved. Several renders, so a gate that skips exactly one is caught.
            for (int i = 0; i < 5; i++) gs.RenderUnforcedForTest();
            Assert.That(gs.WorkSerializedForTest, Is.EqualTo(primed),
                "the work payload was re-serialized on a sim where no priority moved. Under OD-H this " +
                "is the ordinary state of the whole game — an empty grid, rebuilt ten times a second.");

            // LEG 2 — one order. One citizen, one work type: the smallest change there is.
            SendWorkPriority(gs, host, a.Id, (int)WorkType.Craft, 2);
            gs.RenderUnforcedForTest();
            Assert.That(gs.WorkSerializedForTest, Is.EqualTo(primed + 1),
                "ONE work priority moved and the gate skipped it. The player's own order would never " +
                "reach the surface, and nothing re-broadcasts a state channel that never changes.");

            // LEG 3 — it re-arms on the NEW state rather than latching.
            for (int i = 0; i < 3; i++) gs.RenderUnforcedForTest();
            Assert.That(gs.WorkSerializedForTest, Is.EqualTo(primed + 1),
                "the gate did not re-arm after a change: it is now serializing every render forever, " +
                "which is the un-optimised behaviour wearing a passing test");

            // LEG 4 — FORCE bypasses the gate entirely (the reconnect path).
            sink.Clear();
            gs.RenderForTest();
            Assert.That(gs.WorkSerializedForTest, Is.EqualTo(primed + 2),
                "a FORCED render was swallowed by the dirty-version gate. Force is the reconnect path: " +
                "a tab that reconnects while nobody is touching the grid would never be told what the " +
                "crew are allowed to do.");
            Assert.That(sink.Count(p => p.Contains("\"type\":\"work\"")), Is.EqualTo(1),
                "…and it must actually reach the socket, not merely be rebuilt");
        }

        /// <summary>
        /// THE ROW COUNT IS PART OF THE KEY — switching a work type OFF removes its row while every
        /// surviving row is untouched, so a comparison that only walked the shared prefix would pass
        /// the whole field-wise table above. Separate test because that is exactly what a
        /// <c>for (i &lt; min(count))</c> loop gives.
        /// </summary>
        [Test]
        public void A_Row_Appearing_Or_Disappearing_Is_Not_A_Skip()
        {
            var (gs, host, _) = Boot();
            var a = OnePawn(host.Sim);
            SendWorkPriority(gs, host, a.Id, (int)WorkType.Repair, 1);
            SendWorkPriority(gs, host, a.Id, (int)WorkType.Haul, 1);
            gs.RenderForTest();
            int before = gs.WorkSerializedForTest;
            Assert.AreEqual(2, Tuples(CachedWork(gs)).Count, "precondition: two rows");
            before = gs.WorkSerializedForTest;

            // REMOVAL — the LAST row goes (Haul is WorkType 5, emitted after Repair's 0 in enum-value
            // order), which is also the closed-at-both-ends half of the loop bound: a `count - 1` bound
            // never inspects it.
            SendWorkPriority(gs, host, a.Id, (int)WorkType.Haul, WorkPriority.Off);
            gs.RenderUnforcedForTest();
            Assert.That(gs.WorkSerializedForTest, Is.EqualTo(before + 1),
                "a work type was switched OFF — its row is gone — and the gate skipped the render. A " +
                "shorter list is a different payload; a comparison bounded by the shared prefix (or by " +
                "count - 1) would pass every other test in this file.");
            Assert.AreEqual(1, Tuples(CachedWork(gs)).Count, "…and the payload really is one row shorter");

            // ADDITION — the symmetric half, driven rather than argued (a name that promises both
            // directions and drives one is how the next reader stops checking).
            SendWorkPriority(gs, host, a.Id, (int)WorkType.Mine, 4);
            gs.RenderUnforcedForTest();
            Assert.That(gs.WorkSerializedForTest, Is.EqualTo(before + 2),
                "a work type was switched ON — a new row — and the gate skipped the render. A loop " +
                "bounded by the PREVIOUS count would never look at the new row.");
            Assert.AreEqual(2, Tuples(CachedWork(gs)).Count, "…and the payload really is two rows again");
        }

        // ═══════════════════════════════════════════════ 6. PIN-NEUTRALITY + CULTURE

        /// <summary>
        /// VIEW-ONLY, the in-suite half of the charter's PIN-NEUTRAL claim: rendering the channel and
        /// running its gate never move <see cref="Simulation.StateHash"/>. (The five determinism pins
        /// themselves are measured by <c>ci.sh</c>; this is the assertion a suite can hold.)
        ///
        /// ⚠️ AND THE COMMAND'S OWN PIN-NEUTRALITY IS A DIFFERENT CLAIM, made honestly: the command
        /// DOES move the hash when it is sent — it writes a hashed byte, which is the whole point.
        /// What makes the package pin-neutral is that NOTHING SENDS IT: no client sender ships in this
        /// package (the WORK tab is M2-3), no authored content, no scenario step, so the pinned runs
        /// never enqueue one. "Inert without player intent" is the E0-5 shape, stated rather than
        /// assumed — and the proof that it holds is <c>ci.sh</c>'s five green pins plus a zero diff
        /// under <c>tests/Perilune.Tests/Golden/</c>, <c>ci.sh</c> and <c>content/</c>.
        /// </summary>
        [Test]
        public void The_Channel_And_Its_Gate_Never_Touch_The_Sim()
        {
            var (gs, host, _) = Boot();
            ulong before = host.Sim.StateHash();
            gs.RenderForTest();
            for (int i = 0; i < 10; i++) gs.RenderUnforcedForTest();
            Assert.AreEqual(before, host.Sim.StateHash(),
                "the work channel moved the sim's StateHash. It is VIEW-ONLY; a write here moves every " +
                "determinism pin for a layer the sim does not have.");
        }

        /// <summary>
        /// THE CULTURE GATE. The dev machine is de-DE, this channel ships three integers per row, and
        /// a payload that changes with the operator's locale is not a payload. Asserted by comparing
        /// whole payloads rather than hunting for a <c>;</c> or a group separator: every value here is
        /// an integer, so any locale artefact — a different separator, digit grouping, other digits —
        /// is caught by equality without naming one.
        /// </summary>
        [Test]
        public void The_Payload_Is_Culture_Invariant()
        {
            var prev = Thread.CurrentThread.CurrentCulture;
            try
            {
                var loud = new CultureInfo("de-DE");
                Thread.CurrentThread.CurrentCulture = loud;
                string deDe = WireFormat.Work(new[] { new WireFormat.WorkCell(1234, 5, 4) });
                Thread.CurrentThread.CurrentCulture = CultureInfo.InvariantCulture;
                string inv = WireFormat.Work(new[] { new WireFormat.WorkCell(1234, 5, 4) });
                Assert.AreEqual(inv, deDe,
                    "this channel must go through InvariantCulture — the dev machine is de-DE, and " +
                    "culture bugs are live in this repo, including in test harnesses' own parsing.");
                StringAssert.Contains("[1234,5,4]", inv, "no group separators, no locale digits");
            }
            finally { Thread.CurrentThread.CurrentCulture = prev; }
        }
    }
}
