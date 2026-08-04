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
    /// ⭐⭐ <b>THE <c>vents</c> DIRECTORY: the name <c>open</c> needs for a VENT, learnable in the
    /// game.</b> <c>DoorsVerbTests</c>' sibling, member for member where the analogue holds.
    ///
    /// <para>⭐ <b>OWNER-DIRECTED, 2026-08-04.</b> The <c>doors</c> lane shipped as a defect closure
    /// and carried a question to the owner: <i>is the typed directory the right shape, and is
    /// <c>vents</c> the second noun?</i> Both were answered YES in session. This file is that noun
    /// and nothing else — no third noun, no <c>ls</c>, no filter grammar.</para>
    ///
    /// <para><b>WHAT IT IS FOR, AND IT IS NOT <c>doors</c>' STALL.</b> OD-N put the vents behind
    /// MOSS in the same breath as the doors, and MOSS addresses a vent BY NAME. On the shipping
    /// wreck the upper deck's only source of air is <c>vent_d1</c> (OD-O's dead-board puzzle) and
    /// the life-support compartment's authored first gesture is <c>open vent_ls</c> — two keys the
    /// player has to type and had no way to read.</para>
    ///
    /// <para><b>THE MUTATION TABLE, each physically applied to the shipped tree, watched go RED for
    /// the right reason and reverted from an in-memory copy — never <c>git checkout</c> (trap 2);
    /// the failure texts are in the commit message:</b></para>
    /// <list type="number">
    ///   <item>the listing drops a vent (skip the last row) ⇒
    ///         <see cref="TheListingIsTheShipsOwnVentCensus"/> + <see cref="TheWreckListingIsPinnedVERBATIM"/></item>
    ///   <item>the listing names something that is not a vent (widen the filter to the
    ///         life-support KINDS — <c>AirVent</c> + <c>Scrubber</c>, the plausible superset) ⇒
    ///         <see cref="TheListingNamesNOTHINGThatIsNotAVent"/> — the SIXTH shape</item>
    ///   <item>the place drops its deck column (<c>PlaceWords</c> without <c>DECK n</c>) ⇒
    ///         <see cref="EveryRowsPlaceAndStateAreTheDEVICES"/> + the verbatim pin + §13.47's
    ///         offline-sentence tests, which is the shape of a single spelling</item>
    ///   <item>the state word is read from the plan rather than live state ⇒
    ///         <see cref="TheStateWordIsLIVE_NotAuthored"/></item>
    ///   <item>the board-fault column is dropped ⇒ <see cref="TheDeadBoardIsACOLUMN_OnTheOneVentThatHasOne"/></item>
    ///   <item>the gate is deleted / moved one tier up ⇒
    ///         <see cref="TheVerbSitsAtTheREPAIREDTier_TheTierOfTheVerbItServes"/> and
    ///         <see cref="ADarkShipRefuses_AndTheTailAnswersTheVENTS_Ask"/></item>
    ///   <item>the refusal answers <c>Ask.Doors</c> (the wrong noun) ⇒
    ///         <see cref="ADarkShipRefuses_AndTheTailAnswersTheVENTS_Ask"/></item>
    /// </list>
    /// </summary>
    public class VentsVerbTests
    {
        private const string Console = "term_moss";
        private const string ConsoleTid = "@console";

        /// <summary>A paused session on the SHIPPING ship (<c>./play.sh</c>'s default) — no sim
        /// thread, so every tick below is one a test asked for. <c>DoorsVerbTests</c>' fixture.</summary>
        private static GameSession WreckSession(out SimHost host, out List<string> sent)
        {
            host = SimHost.Build(AuthoredShips.WreckSeed, ship: ShipChoice.Wreck);
            var captured = new List<string>();
            sent = captured;
            return new GameSession(host, captured.Add);
        }

        private static Device Dev(Simulation sim, string name)
            => sim.Devices.Items.FirstOrDefault(d => d.Name == name);

        private static List<Device> Vents(Simulation sim)
            => sim.Devices.Items.Where(d => d.Kind == DeviceKind.AirVent).OrderBy(d => d.Id).ToList();

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

        private static void SendVents(GameSession gs, string tid = ConsoleTid)
            => gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "vents", tid: tid));

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
            => Stream(sent, 1).Where(l => !l.StartsWith("VENTS —", StringComparison.Ordinal)).ToList();

        private static string Header(List<string> sent)
            => Stream(sent, 1).FirstOrDefault(l => l.StartsWith("VENTS —", StringComparison.Ordinal));

        /// <summary>A row's first column — the id the player types back at <c>open</c>.</summary>
        private static string IdOf(string row)
        {
            int i = row.IndexOf(" · ", StringComparison.Ordinal);
            return i < 0 ? row : row.Substring(0, i);
        }

        // ══════════════════════════════════════════════════ 1. the listing is the ship's census

        /// <summary>
        /// ⭐⭐ <b>THE OUTCOME'S FIRST HALF — every vent the ship knows reaches the player, and the
        /// census is the SHIP'S rather than a number this test wrote down.</b> The wreck's vents are
        /// re-derived from <c>sim.Devices</c> here, so a re-authored ship fails loudly instead of
        /// quietly disagreeing with a literal nobody re-reads. (The literal block IS pinned, one
        /// test below — deliberately as a SECOND instrument, never as this one's source.)
        /// </summary>
        [Test]
        public void TheListingIsTheShipsOwnVentCensus()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);
            SendVents(gs);

            var vents = Vents(host.Sim);
            Assert.That(vents.Count, Is.GreaterThan(1),
                "PRECONDITION: the wreck must carry vents, or every leg below is vacuous");

            var rows = Rows(sent);
            Assert.That(rows.Count, Is.EqualTo(vents.Count),
                "the listing printed " + rows.Count + " rows for " + vents.Count + " vents:\n"
                + string.Join("\n", rows));

            foreach (var v in vents)
                Assert.That(rows.Any(r => IdOf(r) == v.Name.ToUpperInvariant()), Is.True,
                    "the ship carries " + v.Name + " and the listing never names it:\n"
                    + string.Join("\n", rows));

            // The header is the count, stated — a block a player has to count themselves is the pod
            // bay's `#` column defect wearing a different hat.
            string header = Header(sent);
            Assert.That(header, Is.Not.Null, "no census header at all: " + string.Join(" | ", sent));
            int open = vents.Count(v => v.IsOpen);
            var ic = CultureInfo.InvariantCulture;
            Assert.That(header, Is.EqualTo("VENTS — " + vents.Count.ToString(ic) + " ABOARD · "
                + open.ToString(ic) + " OPEN · " + (vents.Count - open).ToString(ic) + " SHUT"));
        }

        /// <summary>
        /// ⭐ <b>THE WRECK'S LISTING, PINNED VERBATIM — every character the player reads.</b> The
        /// census leg above is derived and would stay green if the ship were re-authored; this one
        /// would not, on purpose. It is the instrument that says an unannounced content edit moved
        /// what the console prints, and it is the block quoted in <c>MECHANICS §13.49</c>.
        ///
        /// <para>⚠️ MEASURED, NOT TRANSCRIBED FROM A DOC: the values below were read off this very
        /// wire on the committed tree (printed by <c>TestContext</c> below, so a failure shows the
        /// replacement rather than making the next reader re-derive it).</para>
        /// </summary>
        [Test]
        public void TheWreckListingIsPinnedVERBATIM()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);
            SendVents(gs);

            var got = Stream(sent, 1);
            TestContext.WriteLine(string.Join("\n", got));
            Assert.That(got, Is.EqualTo(new List<string>
            {
                "VENTS — 3 ABOARD · 2 OPEN · 1 SHUT",
                // ⭐ VENT_D1 stands directly ABOVE VENT_CRYO — same x,y, deck 1 — which is not a
                // coincidence in the fixture: AuthoredShips puts the deck-1 vent on the one
                // surviving riser tap. If these two ever stop sharing a column, read that comment.
                "VENT_CRYO · DECK 0 AT 10,1 · OPEN",
                "VENT_LS · DECK 0 AT 35,6 · SHUT",
                "VENT_D1 · DECK 1 AT 10,1 · OPEN · BOARD FAULT",
            }), "the shipping wreck's vent listing changed:\n" + string.Join("\n", got));
        }

        /// <summary>
        /// ⛔ <b>THE SIXTH SHAPE — ASK WHAT A ROW IS NOT.</b> "3 rows, all named" is equally true of
        /// a listing that enumerated the ship's scrubbers too, or its doors, or everything. The
        /// census leg cannot see a filter that is too WIDE, so this one names five devices the wreck
        /// definitely carries and requires that none of them is in the listing.
        ///
        /// <para>⭐ <c>scrubber_cryo</c> leads the list on purpose: a <see cref="DeviceKind.Scrubber"/>
        /// shares the vent's DSL adapter and shares <c>ShipSystems.LifeSupportKinds</c> with it, so
        /// "everything that moves air" is the plausible wrong filter — and it is the one mutation 2
        /// installs.</para>
        /// </summary>
        [Test]
        public void TheListingNamesNOTHINGThatIsNotAVent()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);
            SendVents(gs);

            var rows = Rows(sent);
            foreach (var name in new[] { "scrubber_cryo", "door_d0_s1", "term_moss", "pod_rell", "recycler_1" })
            {
                Assert.That(Dev(host.Sim, name), Is.Not.Null,
                    "PRECONDITION: the wreck must carry " + name + ", or this exclusion is vacuous");
                Assert.That(Dev(host.Sim, name).Kind, Is.Not.EqualTo(DeviceKind.AirVent));
                Assert.That(rows.Any(r => IdOf(r) == name.ToUpperInvariant()), Is.False,
                    "the VENT directory listed " + name + ", which is a "
                    + Dev(host.Sim, name).Kind + ":\n" + string.Join("\n", rows));
            }

            // …and the positive control for the same matcher, so "found nothing" and "cannot find
            // anything" are distinguishable.
            var aVent = Vents(host.Sim)[0];
            Assert.That(rows.Any(r => IdOf(r) == aVent.Name.ToUpperInvariant()), Is.True,
                "INCLUSION CONTROL: the matcher cannot find a vent either, so the five exclusions "
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
            // The fixture must carry BOTH state words — the wreck already does, asserted rather than
            // assumed, because a listing that printed OPEN unconditionally would pass an all-open ship.
            var vents = Vents(host.Sim);
            Assert.That(vents.Any(v => v.IsOpen), Is.True, "PRECONDITION: some vent boots OPEN");
            Assert.That(vents.Any(v => !v.IsOpen), Is.True, "PRECONDITION: some vent boots SHUT");

            SendVents(gs);
            var ic = CultureInfo.InvariantCulture;
            foreach (var row in Rows(sent))
            {
                var parts = row.Split(new[] { " · " }, StringSplitOptions.None);
                Assert.That(parts.Length, Is.InRange(3, 4), "malformed row: " + row);
                // ⚠️ GUARDED, NOT `First(…)` — trap 3. A row naming something that is not a vent
                // (a widened filter) made `First` throw a raw InvalidOperationException, which is a
                // CRASH-red: it reads as a broken test rather than as the semantic failure it is.
                // The lookup now says WHICH row it could not join and to what.
                var v = vents.FirstOrDefault(x => x.Name.ToUpperInvariant() == parts[0]);
                Assert.That(v, Is.Not.Null,
                    "the listing printed a row for `" + parts[0] + "`, which is not a vent this ship "
                    + "carries — the whole row: " + row + "\nthe ship's vents: "
                    + string.Join(", ", vents.Select(x => x.Name.ToUpperInvariant())));
                Assert.That(parts[1], Is.EqualTo("DECK " + v.Pos.Z.ToString(ic)
                    + " AT " + v.Pos.X.ToString(ic) + "," + v.Pos.Y.ToString(ic)),
                    "the place on " + row + " is not where " + v.Name + " stands");
                Assert.That(parts[2], Is.EqualTo(v.IsOpen ? "OPEN" : "SHUT"),
                    "the state on " + row + " is not what " + v.Name + " holds");
            }
        }

        /// <summary>
        /// ⭐ <b>THE STATE WORD IS READ FROM LIVE DEVICE STATE, NOT FROM THE AUTHORED PLAN</b> — the
        /// one claim a boot-time census cannot distinguish from a plan read. The vent is moved by the
        /// SIM'S OWN COMMAND (the route the typed <c>open</c> takes), and the listing must follow:
        /// the row flips SHUT → OPEN and the header's split moves with it.
        /// </summary>
        [Test]
        public void TheStateWordIsLIVE_NotAuthored()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            RepairConsole(sim);

            var shut = Vents(sim).First(v => !v.IsOpen);
            SendVents(gs);
            var before = Rows(sent).First(r => IdOf(r) == shut.Name.ToUpperInvariant());
            StringAssert.EndsWith(" · SHUT", before);
            string headerBefore = Header(sent);

            sim.EnqueueCommand(new SetDeviceStateCommand(shut.Id, open: true));
            sim.Tick();
            Assert.That(shut.IsOpen, Is.True, "PRECONDITION: the command must actually open it");

            sent.Clear();
            SendVents(gs);
            var after = Rows(sent).First(r => IdOf(r) == shut.Name.ToUpperInvariant());
            StringAssert.EndsWith(" · OPEN", after);
            Assert.That(Header(sent), Is.Not.EqualTo(headerBefore),
                "the census header did not move when a vent did: " + Header(sent));
        }

        // ══════════════════════════════════════════════════ 2. OD-O's dead board, as a COLUMN

        /// <summary>
        /// ⭐⭐ <b>THE BOARD-FAULT COLUMN, AND IT IS <c>doors</c>' <c>LOCKED</c> RULE ON THE
        /// PREDICATE THAT ACTUALLY DECIDES A VENT.</b> <see cref="SetDeviceStateCommand.Execute"/>
        /// computes <c>_open.HasValue &amp;&amp; !DeviceFault.BlocksActuation(device)</c> — the same
        /// shape as the door command's <c>open &amp;&amp; !IsLocked</c> — so a faulted vent answers
        /// the verb this listing teaches by silently not moving. A listing that showed OPEN/SHUT and
        /// hid the one flag that decides whether the verb will work would be teaching a dead key.
        ///
        /// <para>⚠️ <b>AND UNLIKE <c>LOCKED</c>, THIS ONE IS REACHABLE ON SHIPPED CONTENT</b> —
        /// OD-O's <c>vent_d1</c> is the game's only faulted device (censused by
        /// <c>BoardFaultTests</c>), so the flag is driven on the SHIPPING wreck and the "exactly one
        /// row carries it" leg is the non-vacuity control the doors lane had to fabricate.</para>
        ///
        /// <para>⛔ <b>THE LISTING LISTS IT — LISTING IS READING, NOT ACTUATION.</b> A vent the
        /// player cannot open is still a vent whose NAME they need: the whole OD-O workaround is
        /// <c>set vent_d1.rate max</c> in a program, which needs the same string. Hiding the row
        /// would delete the puzzle's key from the only surface that names it.</para>
        /// </summary>
        [Test]
        public void TheDeadBoardIsACOLUMN_OnTheOneVentThatHasOne()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            RepairConsole(sim);

            var faulted = sim.Devices.Items.Where(d => d.Faulted).ToList();
            Assert.That(faulted.Count, Is.EqualTo(1),
                "PRECONDITION: OD-O ships exactly one faulted device and it is the whole subject "
                + "of this leg; found " + faulted.Count);
            Assert.That(faulted[0].Kind, Is.EqualTo(DeviceKind.AirVent));

            SendVents(gs);
            var rows = Rows(sent);
            var mine = rows.First(r => IdOf(r) == faulted[0].Name.ToUpperInvariant());
            StringAssert.EndsWith(" · " + MossGate.BoardFaultFlag, mine);
            Assert.That(rows.Count(r => r.EndsWith(" · " + MossGate.BoardFaultFlag, StringComparison.Ordinal)),
                Is.EqualTo(1),
                "every row was flagged, so the flag is not reading the predicate:\n"
                + string.Join("\n", rows));

            // ⛔ THE FLAG IS A COLUMN AND NOT THE REFUSAL. `DeviceFault.Refusal` belongs to the
            // ACTUATION verb and to the pairwise-distinct console-sentence family; a READ that
            // printed it would be a directory impersonating a refusal.
            Assert.That(rows.Any(r => r.Contains(DeviceFault.Refusal, StringComparison.Ordinal)), Is.False,
                "the listing printed the actuation refusal verbatim: " + mine);
            Assert.That(DeviceFault.Refusal, Does.Contain("BOARD"),
                "…while still sharing its noun, so a player meets one fact and not two");
        }

        /// <summary>
        /// ⭐ <b>THE COLUMN READS THE PREDICATE, NOT THE FIELD — and the two are distinguishable
        /// here.</b> Clearing the fault on the shipped vent must clear the flag: without this, a
        /// composer that appended <c>BOARD FAULT</c> to whatever row happened to be <c>vent_d1</c>
        /// would pass every leg above.
        /// </summary>
        [Test]
        public void TheFlagFollowsTheFault_BothWays()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;
            RepairConsole(sim);
            var vent = sim.Devices.Items.First(d => d.Faulted);
            var healthy = Vents(sim).First(v => !v.Faulted);

            vent.Faulted = false;
            healthy.Faulted = true;
            SendVents(gs);
            var rows = Rows(sent);
            Assert.That(rows.First(r => IdOf(r) == vent.Name.ToUpperInvariant()),
                Does.Not.Contain(MossGate.BoardFaultFlag),
                "the flag stayed on a vent whose board was fixed");
            StringAssert.EndsWith(" · " + MossGate.BoardFaultFlag,
                rows.First(r => IdOf(r) == healthy.Name.ToUpperInvariant()));
        }

        // ══════════════════════════════════════════════════ 3. the tier

        /// <summary>
        /// ⛔⛔ <b>THE VERB SITS AT THE REPAIRED TIER — THE TIER OF THE VERB IT SERVES — AND THAT IS
        /// PINNED AS A CONTRAST RATHER THAN AN ASSERTION.</b> <c>doors</c>' argument, unchanged:
        /// <c>vents</c> is the directory for <c>open</c>/<c>close</c> (and the <c>set … .rate</c>
        /// workaround), which reach the sim through <c>exec</c> at the REPAIRED tier (§13.31). One
        /// tier up, a player whose console is repaired could actuate a vent and still not learn its
        /// name; ungated, a dark computer enumerates the ship.
        ///
        /// <para>Driven in ONE fixture state (repaired, un-commissioned): <c>vents</c> ANSWERS and
        /// <c>pods</c> — the commissioned tier's own read — REFUSES, in the same session, so the two
        /// tiers are demonstrably distinguishable at that point.</para>
        /// </summary>
        [Test]
        public void TheVerbSitsAtTheREPAIREDTier_TheTierOfTheVerbItServes()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);

            SendVents(gs);
            Assert.That(Rows(sent).Count, Is.EqualTo(Vents(host.Sim).Count),
                "a REPAIRED console did not get the directory: " + string.Join(" | ", sent));
            Assert.That(Stream(sent, 2), Is.Empty, "…and it must not also refuse");

            sent.Clear();
            gs.ApplyForTest(new WebCommand(CmdKind.Moss, op: "pods", tid: ConsoleTid));
            Assert.That(Stream(sent, 2).Any(s => s.Contains("NOT COMMISSIONED", StringComparison.Ordinal)),
                Is.True,
                "CONTRAST: on the SAME console `pods` must still refuse, or the two tiers are not "
                + "distinguishable here and the leg above says nothing about which one `vents` is at: "
                + string.Join(" | ", sent));
        }

        /// <summary>
        /// ⭐ <b>THE SHIP GATE, AND THE TAIL ANSWERS THE <c>VENTS</c> ASK.</b> The refusal must not
        /// be <c>Ask.Doors</c>': a player who typed <c>vents</c> and was told <i>TO REACH THE
        /// DOORS</i> is the owner-reported wrong-noun defect (§13.47) in a fourth costume, and
        /// reusing the doors member is the cheap way to ship it.
        /// </summary>
        [Test]
        public void ADarkShipRefuses_AndTheTailAnswersTheVENTS_Ask()
        {
            var gs = WreckSession(out var host, out var sent);
            Assert.That(MossGate.IsServerLive(host.Sim), Is.False, "PRECONDITION: the wreck boots dark");

            SendVents(gs);
            Assert.That(Stream(sent, 1), Is.Empty,
                "a dark computer enumerated the ship: " + string.Join(" | ", sent));
            var refusals = Stream(sent, 2);
            Assert.That(refusals.Count, Is.EqualTo(1), "expected exactly one refusal: "
                + string.Join(" | ", sent));
            Assert.That(refusals[0], Is.EqualTo(MossGate.OfflineRefusal(host.Sim, MossGate.Ask.Vents)));
            StringAssert.Contains("TO REACH THE VENTS", refusals[0]);
            Assert.That(refusals[0], Does.Not.Contain("DOORS"),
                "⛔ THE WRONG-NOUN DEFECT: the player asked about the VENTS: " + refusals[0]);
            StringAssert.Contains("TERM_MOSS", refusals[0],
                "the refusal must still name the terminal a repair would fix (§13.47)");
        }

        // ══════════════════════════════════════════════════ 4. the wire, and the degenerate arm

        /// <summary>
        /// ⭐ <b>NO NEW WIRE SHAPE.</b> The listing rides <c>MossExec</c>'s existing lines array on
        /// stream 1 — <c>WireFormat.cs</c> takes a ZERO diff and <c>reduceMossEvent</c> needed no new
        /// arm. Asserted at the wire rather than argued.
        /// </summary>
        [Test]
        public void TheReplyRidesTheExecChannel_AndAddsNoWireShape()
        {
            var gs = WreckSession(out var host, out var sent);
            RepairConsole(host.Sim);
            SendVents(gs);

            Assert.That(sent.Count, Is.EqualTo(1), "expected ONE message: " + string.Join(" | ", sent));
            StringAssert.Contains("\"ev\":\"exec\"", sent[0]);
            StringAssert.Contains("\"ok\":true", sent[0]);
            Assert.That(sent[0], Does.Not.Contain("\"ev\":\"vents\""),
                "a new wire event appeared where the exec channel was supposed to carry it");
            Assert.That(Stream(sent, 0), Is.Empty, "stream 0 is the client's own echo");
            Assert.That(Stream(sent, 2), Is.Empty, "a successful listing is not an error stream");
        }

        /// <summary>⛔ <b>A READ: IT ENQUEUES NOTHING AND CHANGES NOTHING.</b> <c>pods</c>' claim,
        /// held to the same standard — the hashed state is identical either side of the ask.</summary>
        [Test]
        public void TheDirectoryIsAREAD_ItMovesNoShipState()
        {
            // A TWIN, because "the hash did not change" is not sayable on one sim that also ticked.
            var gs = WreckSession(out var host, out var sent);
            var twin = WreckSession(out var ctl, out _);
            RepairConsole(host.Sim);
            RepairConsole(ctl.Sim);
            for (int i = 0; i < 5; i++) { host.Sim.Tick(); ctl.Sim.Tick(); }
            Assert.That(host.Sim.StateHash(), Is.EqualTo(ctl.Sim.StateHash()),
                "PRECONDITION: the twins must agree before one of them is asked anything");

            SendVents(gs);                       // ONE side asks
            Assert.That(Rows(sent).Count, Is.GreaterThan(0), "PRECONDITION: and it was answered");
            for (int i = 0; i < 5; i++) { host.Sim.Tick(); ctl.Sim.Tick(); }

            Assert.That(host.Sim.StateHash(), Is.EqualTo(ctl.Sim.StateHash()),
                "asking for the vent directory moved the ship");
            GC.KeepAlive(twin);
        }

        /// <summary>The degenerate arm, honest rather than clever: a ship with no vent has nothing to
        /// list, and a directory that prints NOTHING is M3-13's defect. Unlike <c>NO DOORS ABOARD</c>
        /// this arm is genuinely plausible on content — a ship need not carry a vent.</summary>
        [Test]
        public void AShipWithNoVentsSaysSoInWords()
        {
            string[] map = { "#######", "#.....#", "#.....#", "#######" };
            var sim = new Simulation(AsciiWorld.Build(map), 7,
                                     SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));
            Assert.That(sim.Devices.Items.Any(d => d.Kind == DeviceKind.AirVent), Is.False,
                "PRECONDITION: this fixture must carry no vent");

            var lines = MossGate.DescribeVents(sim);
            Assert.That(lines, Is.EqualTo(new List<string> { MossGate.NoVentsLine }));
            Assert.That(MossGate.NoVentsLine, Does.Not.Contain("0 ABOARD"),
                "a census header for nothing is a table with no rows — say it in words instead");
        }

        // ══════════════════════════════════════════════════ 5. THE OUTCOME

        /// <summary>
        /// ⭐⭐⭐ <b>THE OUTCOME TEST: THE ID THE LISTING PRINTS IS EXACTLY THE NAME <c>open</c>
        /// ACCEPTS.</b> Player actions only, on the shipping <c>--ship wreck</c>, through the real
        /// host: repair <c>term_moss</c> → type <c>vents</c> → read a HEALTHY vent's id OFF THE REPLY
        /// → type <c>open &lt;that string, VERBATIM&gt;</c> → the shutter moves and the listing says
        /// so on the next ask.
        ///
        /// <para>⛔ <b>THE ~6.7 SIM-HOUR FABRICATION CHAIN IS NOT REPEATED HERE.</b> That is
        /// <c>DoorsVerbTests</c>' proof and it belongs to that lane; duplicating it would buy a
        /// second copy of someone else's claim and eight seconds of gate time. What this test owns is
        /// the JOIN: the string the directory prints and the string the actuation verb resolves are
        /// the same string, un-case-folded.</para>
        ///
        /// <para>⭐ <b>AND THE CONTRAST LEG IS OD-O's VENT.</b> The faulted vent's printed id
        /// resolves too — the console does NOT answer <i>NO SUCH DEVICE</i> — and is then refused by
        /// the BOARD, with <see cref="DeviceFault.Refusal"/> unchanged. That is what says the flag in
        /// the listing was telling the truth, and that this package did not touch the puzzle.</para>
        /// </summary>
        [Test]
        public void TheIdTheListingPrintsIsTheNameOpenAccepts()
        {
            var gs = WreckSession(out var host, out var sent);
            var sim = host.Sim;

            // ── 1. the boot ship refuses, and names the next step ────────────────────────────────
            SendVents(gs);
            Assert.That(Stream(sent, 2).Count, Is.EqualTo(1), "the dark ship said nothing");
            StringAssert.Contains("TO REACH THE VENTS", Stream(sent, 2)[0]);

            // ── 2. the console is serviced — the state the player reaches by ordering a repair ──
            //    (the DRIVEN repair-order route is DoorsVerbTests' step 2 and is not re-run here.)
            sent.Clear();
            RepairConsole(sim);

            // ── 3. type `vents`, and pick the target FROM THE REPLY ─────────────────────────────
            SendVents(gs);
            var rows = Rows(sent);
            Assert.That(rows.Count, Is.EqualTo(Vents(sim).Count), "no listing on a live console");

            // WHICH vent is derived from the SHIP — a shut vent whose board is sound — and the ID is
            // then taken out of the LISTING'S OWN TEXT. A literal "vent_ls" here would make this test
            // pass against a listing that printed nothing.
            var target = Vents(sim).First(v => !v.IsOpen && !v.Faulted);
            var row = rows.FirstOrDefault(r => IdOf(r) == target.Name.ToUpperInvariant());
            Assert.That(row, Is.Not.Null,
                "the ship carries the shut vent " + target.Name + " and the directory never named it:\n"
                + string.Join("\n", rows));
            StringAssert.EndsWith(" · SHUT", row);
            string typed = IdOf(row);            // ⭐ the string the PLAYER would read and type back
            TestContext.WriteLine("read from the listing: " + typed);

            // ── 4. open it, by the id the listing gave — VERBATIM, not case-folded ──────────────
            sent.Clear();
            SendExec(gs, "open " + typed);
            Assert.That(Stream(sent, 2), Is.Empty,
                "the console refused the id its own directory printed: " + string.Join(" | ", sent));
            for (int i = 0; i < 20; i++) sim.Tick();
            Assert.That(target.IsOpen, Is.True,
                target.Name + " did not open when the player typed `open " + typed + "`");

            // ── 5. …and the directory now says so ───────────────────────────────────────────────
            sent.Clear();
            SendVents(gs);
            StringAssert.EndsWith(" · OPEN",
                Rows(sent).First(r => IdOf(r) == target.Name.ToUpperInvariant()));

            // ── 6. THE CONTRAST: OD-O's vent resolves by the SAME printed id and is refused by the
            //      BOARD, in the board's own unchanged words ──────────────────────────────────────
            var dead = Vents(sim).First(v => v.Faulted);
            string deadId = IdOf(rows.First(r => IdOf(r) == dead.Name.ToUpperInvariant()));
            bool wasOpen = dead.IsOpen;
            sent.Clear();
            SendExec(gs, "close " + deadId);
            for (int i = 0; i < 20; i++) sim.Tick();
            var said = Stream(sent, 2);
            Assert.That(said.Count, Is.EqualTo(1), "expected the board's refusal: " + string.Join(" | ", sent));
            Assert.That(said[0], Is.EqualTo(DeviceFault.Refusal.ToUpperInvariant()),
                "the board's refusal is not this package's to change: " + said[0]);
            Assert.That(dead.IsOpen, Is.EqualTo(wasOpen),
                "OD-O's shutter moved — the puzzle changed, which this package must not do");
        }
    }
}
