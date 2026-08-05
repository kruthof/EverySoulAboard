using System;
using System.IO;
using System.Linq;
using Perilune.Gen;   // AuthoredShips, ShipPlan, DeviceSpec
using Perilune.Dsl;
using Perilune.Sim;
using Perilune.Tui;   // SimHost
using Perilune.Web;   // GameSession, WebCommand, WireFormat
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>ROTATION — "I want to be able to rotate it (4× rotation)" (the owner, 2026-08-05).</b>
    ///
    /// <para><b>WHAT SHIPPED:</b> <see cref="Device.Facing"/>, two bits in a byte, set by
    /// <c>PlaceDeviceCommand</c>, persisted in DEVC v7, folded into <c>StateHash</c> at bits 13–14,
    /// and carried to both SVG surfaces as the <c>devices</c> channel's eleventh element. The
    /// client's half (the ghost previews it, [E] cycles it, the two surfaces draw it) is driven in
    /// <c>client/test/build-ghost.test.js</c> and <c>client/test/rotation.test.js</c>.</para>
    ///
    /// <para>⛔ <b>IT IS DRAWING-ONLY AND THAT IS ASSERTED, NOT ONLY DOCUMENTED</b> — see
    /// <see cref="TurningADeviceChangesNoMECHANIC_OnlyTheHash"/>. Nothing in <c>sim/</c> reads the
    /// field; a turned device occupies the same one tile, is reached from the same neighbours, and
    /// runs at the same rate. RimWorld couples rotation to the interaction cell and ours deliberately
    /// does not yet (<c>Device.Facing</c>'s own remarks carry the divergence and file the coupling).</para>
    ///
    /// <para>⚠️ <b>EVERY LEG IS ITS OWN <c>[Test]</c></b> — the fifth trap shape: <c>Assert</c>
    /// throws, so a multi-leg test reports only its FIRST failure and the rest of the claim goes
    /// unmeasured.</para>
    /// </summary>
    [TestFixture]
    public class DeviceFacingTests
    {
        /// <summary>A tiny pressurised bay with a conduit run — <c>BoardFaultTests.Bench</c>'s shape,
        /// re-declared rather than shared because a fixture two suites mutate is a fixture neither
        /// can reason about.</summary>
        private static Simulation Bench()
        {
            string[] map = { "#######", "#.....#", "#.....#", "#######" };
            var sim = new Simulation(AsciiWorld.Build(map), 42UL,
                                     SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));
            for (int x = 1; x <= 5; x++) sim.AddDevice(DeviceKind.Conduit, new Int3(x, 1, 0), $"c{x}");
            sim.AddDevice(DeviceKind.SolarWing, new Int3(1, 1, 0), "solar");
            sim.Rooms.SetAnchor("bay", new Int3(2, 2, 0));
            sim.Rooms.RecomputeIfDirty(sim);
            RoomState.Pressurize(sim.Rooms.RoomAt(sim.World, new Int3(2, 2, 0)));
            return sim;
        }

        /// <summary>Give the bench enough Parts to pay <c>DevicePlaceCost</c> a few times over.</summary>
        private static void Stock(Simulation sim, int units)
        {
            // Through `Simulation.AddItem`, the sim's own spawn door — it mints the entity id.
            // (The first draft called `sim.Items.Add(stack, 0)` and every unit collided on id 0.)
            for (int i = 0; i < units; i++) sim.AddItem(ItemKind.Parts, 1, new Int3(2, 2, 0));
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // 1. THE COMMAND — the player's rotation reaches the device
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⭐ THE OUTCOME TEST: place with a facing, and the device stands there turned.
        ///
        /// <para>NAMED MUTATION: drop <c>placed.Facing = _facing;</c> from
        /// <c>PlaceDeviceCommand.Execute</c> ⇒ this reads 0 and fails by name. The rotation would
        /// then be a UI animation that the sim forgets the instant the click lands — which is what
        /// the whole sim half of this package exists to prevent.</para>
        /// </summary>
        [Test]
        public void PlacingWithAFacing_PutsTheDeviceDownTurned()
        {
            var sim = Bench();
            Stock(sim, 12);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Table, new Int3(2, 2, 0), 2));
            sim.Tick();

            var d = sim.Devices.Items.FirstOrDefault(x => x.Kind == DeviceKind.Table);
            Assert.That(d, Is.Not.Null, "premise: the placement was affordable and legal");
            Assert.That(d!.Facing, Is.EqualTo((byte)2),
                "the facing the player rotated to did not reach the device. The preview and the " +
                "placement would then disagree about the one thing the player was looking at.");
        }

        /// <summary>
        /// The DEFAULT is 0, and it is the wire-compatibility contract: an older client sends no
        /// facing, the host's <c>Int(json,"facing")</c> answers 0, and the piece lands exactly as
        /// every piece placed before 2026-08-05 did.
        /// </summary>
        [Test]
        public void PlacingWithNoFacing_IsTheOldBehaviour()
        {
            var sim = Bench();
            Stock(sim, 12);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Chair, new Int3(2, 2, 0)));
            sim.Tick();
            Assert.That(sim.Devices.Items.First(x => x.Kind == DeviceKind.Chair).Facing, Is.EqualTo((byte)0));
        }

        /// <summary>
        /// ⛔ THE MASK, DRIVEN. The facing is packed into a hash word beside <c>NetworkId</c> at bits
        /// 13–14, so a value of 4 would land in bit 15 and a value of 8 in <c>NetworkId</c>'s own
        /// range — the <c>RoomType.Cryo = 16</c> alias this repo has already shipped once. The
        /// constructor masks, so nothing downstream has to.
        ///
        /// <para>NAMED MUTATION: drop the <c>&amp; 3</c> in <c>PlaceDeviceCommand</c>'s constructor
        /// ⇒ the 6 arrives as 6 and this fails.</para>
        /// </summary>
        [Test]
        public void AnOutOfRangeFacing_IsMaskedAtTheCommandBoundary()
        {
            var sim = Bench();
            Stock(sim, 12);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Desk, new Int3(2, 2, 0), 6));
            sim.Tick();
            Assert.That(sim.Devices.Items.First(x => x.Kind == DeviceKind.Desk).Facing, Is.EqualTo((byte)2),
                "6 & 3 == 2. An unmasked facing is a value that indexes past a four-case rotation on " +
                "the client and aliases into NetworkId in the fold.");
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // 2. THE HASH — pin-neutral while 0, and MEASURED to be folded at all
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⛔⭐ <b>THE PIN ARGUMENT, DRIVEN RATHER THAN ARGUED, AND THE NON-VACUITY CONTROL IS THE
        /// HALF THAT MATTERS.</b> <c>| ((ulong)(d.Facing &amp; 3) &lt;&lt; 13)</c> is byte-identical
        /// to the pre-v7 word while the field is 0, which is why the five determinism pins do not
        /// move. That claim is worthless on its own: <b>a term that was never folded at all would
        /// satisfy it too</b>, and "the pins held" would then be true for the wrong reason — the
        /// exact shape <c>CLAUDE.md</c>'s pin table records under "VACUOUS ×4".
        ///
        /// <para>THREE legs, in this order: two identical builds agree · setting a facing on ONE
        /// moves its hash · clearing it returns the hash TO THE DIGIT.</para>
        /// </summary>
        [Test]
        public void TheFacingIsFoldNeutralAtZero_AndMovesTheHashWhenTurned()
        {
            var a = Bench();
            var b = Bench();
            ulong baseline = a.StateHash();
            Assert.That(b.StateHash(), Is.EqualTo(baseline), "premise: the twins start identical");

            var d = b.Devices.Items.First(x => x.Name == "solar");
            Assert.That(d.Facing, Is.EqualTo((byte)0), "premise: an unturned device boots at 0");

            d.Facing = 1;
            Assert.That(b.StateHash(), Is.Not.EqualTo(baseline),
                "NON-VACUITY: turning a device did not move StateHash, so bits 13–14 are not folded " +
                "at all. A saved field the hash cannot see makes the determinism canary blind to it, " +
                "and 'the five pins did not move' would be true for the wrong reason.");

            d.Facing = 0;
            Assert.That(b.StateHash(), Is.EqualTo(baseline),
                "NEUTRALITY: clearing the facing must return the hash to the digit. If it does not, " +
                "the term is not byte-identical while 0 and every ship in the repo is a re-pin.");
        }

        /// <summary>
        /// ⛔ ALL FOUR FACINGS FOLD TO FOUR DIFFERENT HASHES — the field is two bits and both of them
        /// are folded. A one-bit fold (<c>&lt;&lt; 13</c> of a boolean, say) would make 0/2 and 1/3
        /// indistinguishable and half the rotation would silently not be saved.
        /// </summary>
        [Test]
        public void AllFourFacingsFoldDistinctly()
        {
            var sim = Bench();
            var d = sim.Devices.Items.First(x => x.Name == "solar");
            var seen = new System.Collections.Generic.HashSet<ulong>();
            for (byte f = 0; f < 4; f++) { d.Facing = f; seen.Add(sim.StateHash()); }
            Assert.That(seen.Count, Is.EqualTo(4),
                "two facings folded to the same hash — one of the two bits is not in the word, so a " +
                "quarter-turn is unsaveable and a reload silently un-rotates the piece.");
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // 3. THE SAVE — DEVC v7
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// The round trip, and the harder half after it: save → load → tick 1000 → compare. A restore
        /// that dropped the byte would desynchronise the DEVC stream immediately; one that read it
        /// into the wrong device would hash differently at load.
        ///
        /// <para>NAMED MUTATION: delete the <c>w.Write((byte)(d.Facing &amp; 3));</c> line from
        /// <c>SaveWriter.WriteDevices</c> ⇒ the reader runs off the end of the chapter and the load
        /// throws or hashes differently at once.</para>
        /// </summary>
        [Test]
        public void TheFacingSurvivesASaveRoundTrip_AndAThousandTicksAfterIt()
        {
            var sim = Bench();
            Stock(sim, 12);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Table, new Int3(2, 2, 0), 3));
            for (int t = 0; t < 50; t++) sim.Tick();
            Assert.That(sim.Devices.Items.First(x => x.Kind == DeviceKind.Table).Facing, Is.EqualTo((byte)3),
                "premise: the placement really did land turned");

            var blob = new MemoryStream();
            SaveWriter.Write(sim, blob);
            blob.Position = 0;
            var loaded = SaveReader.Read(blob, SystemStack.CreateDefault(new ScriptRuntime(new DeviceRegistry())));

            Assert.That(loaded.Devices.Items.First(x => x.Kind == DeviceKind.Table).Facing, Is.EqualTo((byte)3),
                "the facing came back off the disk unturned — a saved game would silently straighten " +
                "everything the player had rotated");
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()), "twin hashes MATCH at load");

            // A load leaves RoomState dirty, so the loaded sim takes a room recompute on its first
            // tick that the uninterrupted twin does not (the pre-existing thermal ULP drift). Both
            // sims are made to take the identical recompute so the run-on is about the RESTORE.
            sim.Rooms.MarkDirty();
            for (int t = 0; t < 1000; t++) { sim.Tick(); loaded.Tick(); }
            Assert.That(loaded.StateHash(), Is.EqualTo(sim.StateHash()),
                "twin hashes MATCH a thousand ticks later — no derived state was dropped");
        }

        /// <summary>
        /// A PRE-v7 DEVC chapter loads with every device facing 0 — and unlike a merely safe default
        /// this is the HISTORICALLY ACCURATE read: nothing could turn a device before this package,
        /// so no pre-v7 save can contain a turned one. Driven against a hand-built v6 buffer, because
        /// no writer in the tree can emit v6 any more and a compat branch nothing can reach is a
        /// branch nothing can test.
        ///
        /// <para>NAMED MUTATION: drop the <c>version &gt;= 7</c> guard in
        /// <c>SaveReader.ReadDevices</c> ⇒ the reader consumes a byte that is not there and throws.</para>
        /// </summary>
        [Test]
        public void APreV7DeviceChapter_LoadsEveryDeviceFacingZero()
        {
            var buffer = new MemoryStream();
            using (var w = new BinaryWriter(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                w.Write(1);                          // count
                w.Write(9_200u);                     // id, high so it cannot collide with the bench's
                w.Write((byte)DeviceKind.Table);
                w.Write(2); w.Write(2); w.Write(0);  // pos
                w.Write("legacy_table");
                w.Write(false); w.Write(false); w.Write(true); // IsOpen / IsLocked / Powered
                w.Write(1f);                         // Rate
                w.Write(0f);                         // StoredKWh
                w.Write((ushort)0);                  // NetworkId
                w.Write(0f); w.Write(0f); w.Write((ushort)0); // v2
                w.Write(1f);                         // v3 Condition
                w.Write((byte)0);                    // v4 LockOwner
                w.Write(true);                       // v5 Scriptable
                w.Write(false);                      // v6 Faulted
                // ...and NOTHING for v7. This is the whole point.
            }
            buffer.Position = 0;

            var sim = Bench();
            using (var r = new BinaryReader(buffer, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                SaveReader.ReadDevices(sim, r, 6);
            }
            var legacy = sim.Devices.Items.First(x => x.Name == "legacy_table");
            Assert.That(legacy.Facing, Is.EqualTo((byte)0),
                "a device from a save written before rotation existed must read as unturned");
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // 4. THE WIRE — element eleven, and the host really fills it
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// The serializer appends the facing LAST, so a client that has not learnt the element reads
        /// a ten-element row exactly as it did before.
        /// </summary>
        [Test]
        public void TheWireRowCarriesTheFacingAsItsELEVENTHElement()
        {
            string json = WireFormat.Devices(new[]
            {
                new WireFormat.DeviceCell(3, 4, 0, (int)DeviceKind.Table, 255, 1, 0, 1, 1, 5, 2),
            });
            StringAssert.Contains("[3,4,0," + ((int)DeviceKind.Table).ToString(System.Globalization.CultureInfo.InvariantCulture)
                + ",255,1,0,1,1,5,2]", json,
                "the devices row no longer ends with the facing. The two SVG surfaces read it "
                + "positionally and there is no compiler across this seam.");
        }

        /// <summary>
        /// ⭐⭐ END TO END THROUGH THE REAL HOST: a `place` message carrying a facing → the wire row
        /// that comes back out carries the SAME facing on the SAME tile. This is the leg that would
        /// catch a break anywhere in the chain — the JSON key, <c>WebCommand.Facing</c>,
        /// <c>HandlePlace</c>, the command, the device, <c>BuildDevices</c>, the serializer.
        ///
        /// <para>NAMED MUTATION: drop <c>facing: Int(json, "facing")</c> from the <c>case "place"</c>
        /// parse ⇒ the row comes back 0 and this fails by name.</para>
        /// </summary>
        [Test]
        public void APlaceMessageWithAFacing_ParsesIntoTheCommand()
        {
            var parsed = WebCommand.Parse("{\"cmd\":\"place\",\"kind\":\"table\",\"x\":2,\"y\":2,\"deck\":0,\"facing\":3}");
            Assert.That(parsed.Kind, Is.EqualTo(CmdKind.Place), "premise: the message parsed as a place");
            Assert.That(parsed.Facing, Is.EqualTo(3),
                "the `facing` key never reached WebCommand — the rotation dies at the socket");

            var noFacing = WebCommand.Parse("{\"cmd\":\"place\",\"kind\":\"table\",\"x\":2,\"y\":2,\"deck\":0}");
            Assert.That(noFacing.Facing, Is.EqualTo(0),
                "an ABSENT key must be indistinguishable from an explicit 0 — that is the whole "
                + "wire-compatibility contract for an appended argument");
        }

        /// <summary>
        /// ⭐⭐ <b>END TO END THROUGH THE REAL HOST</b> — a `place` message carrying a facing, applied to
        /// a live <see cref="GameSession"/>, and the row that comes back out on the `devices` channel
        /// carries the SAME facing on the SAME tile. Every link is in the loop: the JSON key,
        /// <c>WebCommand.Facing</c>, <c>HandlePlace</c>, <c>PlaceDeviceCommand</c>, <c>Device.Facing</c>,
        /// <c>BuildDevices</c> and the serializer.
        ///
        /// <para>⛔⛔ <b>THIS TEST EXISTS BECAUSE A NAMED MUTATION CAME BACK GREEN.</b> Mutation R9 —
        /// <c>BuildDevices</c> emitting a constant <c>0</c> instead of <c>device.Facing &amp; 3</c> —
        /// left the whole suite passing. The sibling above only PARSES a command, and
        /// <see cref="TheWireRowCarriesTheFacingAsItsELEVENTHElement"/> constructs a
        /// <c>DeviceCell</c> by hand, so nothing anywhere drove the host's own fill. The docstring on
        /// the parse test had claimed "end to end through the real host" while its body did no such
        /// thing; the claim is now this test's, and the parse test says what it actually does.
        /// <b>A mutation that does not bite proves nothing about the guard.</b></para>
        /// </summary>
        [Test]
        public void APlaceMessageWithAFacing_ComesBackOutOnTheDevicesChannel()
        {
            var host = SimHost.Build(SimHost.DefaultSeed);
            var sink = new System.Collections.Generic.List<string>();
            var gs = new GameSession(host, sink.Add);   // NOT started ⇒ no sim thread
            var sim = host.Sim;

            // The first free floor tile on deck 0 — `ConversionLossSealsTests.FirstFreeFloor`'s own
            // four conditions (walkable · no wall · no HasDevice flag · no device in the store),
            // restated here rather than shared because a fixture two suites mutate is a fixture
            // neither can reason about.
            Int3 spot = default;
            bool found = false;
            for (int y = 0; y < sim.World.Height && !found; y++)
                for (int x = 0; x < sim.World.Width && !found; x++)
                {
                    var t = new Int3(x, y, 0);
                    if ((sim.World.GetFlags(t) & TileFlags.Walkable) == 0) continue;
                    if (sim.World.GetWall(t) != TileDefs.Void) continue;
                    if ((sim.World.GetFlags(t) & TileFlags.HasDevice) != 0) continue;
                    if (sim.TryGetDeviceAt(t, out _)) continue;
                    spot = t; found = true;
                }
            Assert.That(found, Is.True, "no free floor tile on deck 0 — this rig has nothing to place on");
            sim.AddItem(ItemKind.Parts, sim.Defs.Build.DevicePlaceCost, spot);

            gs.ApplyForTest(new WebCommand(CmdKind.Place, spot.X, spot.Y, i: spot.Z, name: "table", facing: 2));
            sim.Tick();
            Assert.That(sim.TryGetDeviceAt(spot, out var placed), Is.True,
                "premise: the placement landed (affordable, legal tile)");
            Assert.That(placed.Facing, Is.EqualTo((byte)2), "premise: it landed turned");

            gs.RenderForTest();
            string json = sink.Concat(gs.Snapshot()).LastOrDefault(x => x.Contains("\"type\":\"devices\"", StringComparison.Ordinal));
            Assert.That(json, Is.Not.Null, "the devices channel produced nothing to read");
            string want = "[" + spot.X.ToString(System.Globalization.CultureInfo.InvariantCulture)
                        + "," + spot.Y.ToString(System.Globalization.CultureInfo.InvariantCulture)
                        + "," + spot.Z.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",";
            int at = json.IndexOf(want, StringComparison.Ordinal);
            Assert.That(at, Is.GreaterThanOrEqualTo(0), "the placed device is not on the channel: " + json);
            string row = json.Substring(at + 1).Split(']')[0];
            var f = row.Split(',');
            Assert.That(f.Length, Is.EqualTo(11), "a devices tuple is eleven elements, saw: [" + row + "]");
            Assert.That(f[10], Is.EqualTo("2"),
                "THE HOST FILLED THE FACING WITH SOMETHING OTHER THAN `device.Facing`. The sim knows "
                + "which way the piece is turned and the picture never will: [" + row + "]");
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // 4b. ⛔⛔ WHY THE FIVE PINS HELD — AND THE HOLD IS **VACUOUS**, MEASURED
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⛔⛔ <b>NO PINNED FIXTURE AUTHORS A TURNED DEVICE, SO NO PIN CAN SEE THE FOLD.</b>
        ///
        /// <para><b>THE MEASUREMENT THAT MAKES THIS NECESSARY, taken 2026-08-05 rather than argued:</b>
        /// with the facing field present, the wire live, the save chapter at v7 and every consumer
        /// running, <c>hosts/scenario --days 3 --seed 42</c> reads <c>7bdd0d6f7756dfdc</c> — and with
        /// the fold term <c>| ((ulong)(d.Facing &amp; 3) &lt;&lt; 13)</c> STUBBED OUT ENTIRELY it reads
        /// <b><c>7bdd0d6f7756dfdc</c>, IDENTICAL</b>. P1's hold is therefore not evidence that the term
        /// is folded correctly; it is evidence that P1 never reaches a device with a facing.</para>
        ///
        /// <para>⇒ THAT IS <c>CLAUDE.md</c>'s "VACUOUS ×4" SHAPE AND M2-12's *"no pin sees the
        /// generation term"* IN ANOTHER COSTUME. The cause is structural and is what this test pins:
        /// <b>nothing but <c>PlaceDeviceCommand</c> can set a facing</b> — <c>ShipPlanBuilder</c> never
        /// writes the field, so no authored ship can contain one — and <b>no pinned run enqueues a
        /// place command</b>. The instruments for the fold are
        /// <see cref="TheFacingIsFoldNeutralAtZero_AndMovesTheHashWhenTurned"/> and
        /// <see cref="AllFourFacingsFoldDistinctly"/>, and nothing else. Do not let a later lane read
        /// "the five pins did not move" as evidence that the facing is hashed at all.</para>
        ///
        /// <para>NAMED MUTATION: give any authored device a non-zero <c>Facing</c> in
        /// <c>ShipPlanBuilder</c> ⇒ this goes red AND the pins really do move.</para>
        /// </summary>
        [Test]
        public void NoPinnedShipAuthorsATurnedDevice_SoTheHoldIsVacuous()
        {
            // (a) THE STRUCTURAL HALF — an authored ship CANNOT express a facing. Every device on a
            //     pinned ship comes from a `DeviceSpec`, and `DeviceSpec` has no facing member at
            //     all, so `ShipPlanBuilder` has nothing to copy. Asserted by REFLECTION rather than
            //     by reading the file, so adding the field later reddens here by construction.
            var specMembers = typeof(DeviceSpec).GetMembers()
                .Select(m => m.Name).Where(nm => nm.Contains("Facing", StringComparison.Ordinal)).ToList();
            Assert.That(specMembers, Is.Empty,
                "`DeviceSpec` now carries a facing, so an AUTHORED ship can be turned. P1-P5 are "
                + "reported HELD on the ground that no pinned fixture reaches the fold term. "
                + "Re-measure every pin before merging: " + string.Join(",", specMembers));

            // (b) THE CENSUS, WITH ITS NON-VACUITY CONTROL FIRST. A census that walks an empty list
            //     agrees with everything, so each pinned ship must be shown to author devices at all.
            foreach (var (name, plan) in new (string, ShipPlan)[]
            {
                ("P2 perilune", AuthoredShips.Perilune()),
                ("P3 slice", AuthoredShips.PeriluneSlice()),
                ("grid", AuthoredShips.PeriluneGrid()),
                ("wreck", AuthoredShips.PeriluneWreck()),
            })
            {
                Assert.That(plan.Devices.Count, Is.GreaterThan(0),
                    name + " authored NO devices at all — this census is scanning nothing");
            }
        }

        /// <summary>
        /// ⭐ P1'S OWN FIXTURE IS NOT A <see cref="ShipPlan"/> AT ALL — <c>ci.sh</c>'s determinism proof
        /// is <c>hosts/scenario --days 3 --seed 42</c>, whose sim is <c>Program.cs</c>'s hand-built
        /// <c>BuildScenario</c>, which the census above structurally cannot reach. It is scanned AT THE
        /// SOURCE instead, comment-stripped with the shared <c>CodeOnly</c> (CLAUDE.md trap 1 — a
        /// raw-text guard is satisfied by commented-out code), with an inclusion control so that a
        /// regex which has rotted cannot pass by finding nothing.
        /// </summary>
        [Test]
        public void P1sOwnFixtureTurnsNothing()
        {
            string src = null;
            for (var dir = new DirectoryInfo(TestContext.CurrentContext.TestDirectory);
                 dir != null && src == null; dir = dir.Parent)
            {
                string candidate = Path.Combine(dir.FullName, "hosts", "scenario", "Program.cs");
                if (File.Exists(candidate)) src = File.ReadAllText(candidate);
            }
            Assert.That(src, Is.Not.Null, "hosts/scenario/Program.cs must be discoverable from the test binary");
            string code = ArchitectureBoundaryTests.CodeOnly(src);

            // INCLUSION CONTROL, hand-written and never derived from the scan's own output.
            Assert.That(code, Does.Contain("AddDevice"),
                "the BuildScenario scan found no AddDevice call at all — the fixture moved, or the "
                + "comment stripper ate the file, and this guard is inspecting nothing");
            Assert.That(code, Does.Not.Match(@"\.Facing\s*="),
                "P1's OWN fixture (hosts/scenario BuildScenario) now sets a Facing. P1 is reported as "
                + "HELD on the ground that it never reaches the fold term; re-measure it.");
        }

        // ═════════════════════════════════════════════════════════════════════════════════════
        // 5. THE CLAIM THAT IS EASIEST TO GET WRONG LATER
        // ═════════════════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// ⛔⭐ <b>"DRAWING-ONLY" IS ASSERTED, NOT ONLY WRITTEN DOWN.</b> Two sims, identical but for
        /// one device's facing, ticked 500 times: everything the sim can observe about that device —
        /// its tile, its walkability, its operational state, its rate, its condition — is identical,
        /// and so is the room around it. The ONLY difference is the hash, which is the fold and
        /// nothing else.
        ///
        /// <para>⚠️ WHAT THIS DOES AND DOES NOT PROVE. It proves no CURRENT mechanic reads the field
        /// on this fixture. It cannot prove none ever will, and it is not meant to: the day a
        /// work-spot mechanic lands, THIS is the test that must go red and be rewritten, which is
        /// exactly the notice the future coupling deserves.</para>
        /// </summary>
        [Test]
        public void TurningADeviceChangesNoMECHANIC_OnlyTheHash()
        {
            var a = Bench();
            var b = Bench();
            Stock(a, 12); Stock(b, 12);
            a.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Table, new Int3(3, 2, 0), 0));
            b.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Table, new Int3(3, 2, 0), 1));
            for (int t = 0; t < 500; t++) { a.Tick(); b.Tick(); }

            var da = a.Devices.Items.First(x => x.Kind == DeviceKind.Table);
            var db = b.Devices.Items.First(x => x.Kind == DeviceKind.Table);
            Assert.That(db.Facing, Is.EqualTo((byte)1), "premise: the two really are turned differently");

            Assert.That(db.Pos, Is.EqualTo(da.Pos), "a turned device must occupy the SAME ONE TILE — " +
                "there are no footprints in this sim and this package invented none");
            Assert.That(db.Powered, Is.EqualTo(da.Powered));
            Assert.That(db.Rate, Is.EqualTo(da.Rate));
            Assert.That(db.Condition, Is.EqualTo(da.Condition));
            Assert.That(b.World.GetFlags(db.Pos), Is.EqualTo(a.World.GetFlags(da.Pos)),
                "the tile's own flags differ — a facing has started to change walkability or device " +
                "occupancy, and 'drawing-only' is no longer true");
            Assert.That(b.Devices.Items.Count, Is.EqualTo(a.Devices.Items.Count));
            Assert.That(b.Items.Items.Count, Is.EqualTo(a.Items.Items.Count),
                "the two ships spent different matter — the facing has reached the economy");

            Assert.That(b.StateHash(), Is.Not.EqualTo(a.StateHash()),
                "NON-VACUITY for every equality above: if the hashes matched too, the two sims would " +
                "be identical in every respect and this test would prove nothing about a facing.");
        }
    }
}
