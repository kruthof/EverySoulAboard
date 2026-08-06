using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession, WireFormat, WebCommand
using NUnit.Framework;

namespace Perilune.Tests
{
    /// <summary>
    /// ⭐⭐ <b>THE BLUEPRINT.</b> The owner, 2026-08-05: <i>"after placing a new item, it should stay
    /// as a ghost until the pawn assembles it."</i>
    ///
    /// <para>Placement used to be a SPAWN: <c>PlaceDeviceCommand</c> called <c>AddDevice</c> and the
    /// table existed, finished, on the tick the player pressed. It is now a <c>BuildSystem</c> SITE —
    /// RimWorld's blueprint — and <c>BuildSystem.Complete</c> spawns the piece when a builder has
    /// done the work.</para>
    ///
    /// <para>⛔ <b>THE OD-H CONSEQUENCE IS THE DESIGN, AND IT IS TESTED RATHER THAN HOPED.</b> Every
    /// work type boots OFF (OD-H/OD-I, <c>Citizen.WorkPriority.Default</c>), so on a fresh wreck
    /// <i>"until the pawn assembles it"</i> can be INDEFINITELY. That is only acceptable if the wait
    /// is HONEST, and the last test in this file is the one that says so: a waiting blueprint appears
    /// on the <c>blocked</c> channel as <c>OrderBuild</c> + <c>ReasonWorkTypeOff</c>, i.e. the
    /// player reads <i>"BUILD BLOCKED — NOBODY ABOARD IS ASSIGNED THAT WORK"</i> on the tile. No new
    /// mechanism was needed for that: <c>GameSession.BuildBlocked</c>'s third walk already visits
    /// <c>BuildSystem.Pending</c> and <c>NobodyAboardTakesTheWorkFor</c> already maps
    /// <c>OrderBuild → JobKind.Build → WorkType.Construct</c>. The blueprint inherits the
    /// why-line the moment it becomes a build site — which is the whole argument for making it one.</para>
    /// </summary>
    [TestFixture]
    public class BlueprintTests
    {
        private static (GameSession Gs, SimHost Host) BootWreck()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            return (new GameSession(host, sink.Add), host);
        }

        private static BuildSystem BuildOf(Simulation sim)
        {
            foreach (var s in sim.Systems) if (s is BuildSystem b) return b;
            Assert.Fail("the stack has no BuildSystem");
            return null;
        }

        /// <summary>A tile a placement really can be laid on. Asked of the world, never hand-written:
        /// a coordinate literal is invalidated silently by the next ship edit.</summary>
        private static Int3 ClearTile(Simulation sim)
        {
            var w = sim.World;
            for (int z = 0; z < w.Depth; z++)
                for (int y = 0; y < w.Height; y++)
                    for (int x = 0; x < w.Width; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((w.GetFlags(p) & TileFlags.Walkable) == 0) continue;
                        if (w.GetWall(p) != TileDefs.Void) continue;
                        if ((w.GetFlags(p) & TileFlags.HasDevice) != 0) continue;
                        if (sim.TryGetDeviceAt(p, out _)) continue;
                        return p;
                    }
            Assert.Fail("no placeable tile on the wreck");
            return default;
        }

        private static void StockParts(Simulation sim, Int3 at, int units)
            => sim.AddItem(PlaceDeviceCommand.Currency, units, at);

        // ─────────────────────────────────────────────────────────────────────────────────────
        // 1. THE OUTCOME — place ⇒ a blueprint, not a table.
        // ─────────────────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// ⭐⭐ <b>THE PACKAGE'S CENTRAL CLAIM.</b> A press lays a SITE carrying the piece and the
        /// facing; no device exists yet; the builder's completion turns it into the real piece, at
        /// that same facing, with the same name and the same <c>Scriptable = false</c> the old spawn
        /// wrote.
        ///
        /// <para>MUTATION: revert <c>PlaceDeviceCommand.Execute</c> to <c>AddDevice</c> ⇒ RED on the
        /// "no device yet" leg. MUTATION: drop <c>Facing = ...</c> from <c>Designate</c> ⇒ RED on the
        /// facing leg (the ghost would stand one way and the piece land another).</para>
        /// </summary>
        [Test]
        public void APlacementLaysABlueprint_AndTheBuilderTurnsItIntoThePiece()
        {
            var (_, host) = BootWreck();
            var sim = host.Sim;
            var pos = ClearTile(sim);
            StockParts(sim, pos, 30);
            sim.Tick();
            var build = BuildOf(sim);

            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Table, pos, facing: 2));
            sim.Tick();

            Assert.IsTrue(build.TryGet(pos, out var site), "the press laid no build site at all");
            Assert.AreEqual(BuildKind.Device, site.Kind, "the site is not a device blueprint");
            Assert.AreEqual((byte)DeviceKind.Table, site.Device, "the blueprint forgot which piece it is");
            Assert.AreEqual(2, site.Facing, "the blueprint forgot the facing the player turned it to");
            Assert.AreEqual(0, site.Required,
                "a device blueprint asked for hauled material. It is paid for in PARTS at designate; "
                + "a Regolith Required would re-open WP-2's measured matter faucet (Regolith in, "
                + "Parts out, bypassing ~30 000 ticks of the crafting ladder).");
            Assert.IsTrue(BuildSystem.IsReady(site),
                "the blueprint is not ready, so nothing but a hauler could ever advance it");
            Assert.IsFalse(sim.TryGetDeviceAt(pos, out _),
                "⛔ THE DEVICE EXISTS ALREADY. This is the whole owner sentence: it must STAY A GHOST "
                + "until a pawn assembles it.");

            // …and the builder finishes it. Driven through `Complete`, the same entry point
            // `BuildJobSource` calls when the Build job's work ticks reach zero.
            Assert.IsTrue(build.Complete(sim, pos, builderId: 0), "Complete refused the ready site");
            Assert.IsTrue(sim.TryGetDeviceAt(pos, out var made), "the finished build spawned no device");
            Assert.AreEqual(DeviceKind.Table, made.Kind, "the wrong piece was built");
            Assert.AreEqual(2, made.Facing,
                "the piece landed at a different facing from the blueprint the player was looking at");
            Assert.IsFalse(made.Scriptable,
                "what the PLAYER bolts on is not commissioned (E0-6) — the old spawn set this and the "
                + "move into BuildSystem.Complete must not have dropped it");
            Assert.AreEqual(FormattableString.Invariant($"table_{pos.X}_{pos.Y}_{pos.Z}"), made.Name,
                "the deterministic name changed when the spawn moved");
            Assert.IsFalse(build.TryGet(pos, out _), "the site outlived its own completion");
        }

        /// <summary>
        /// ⭐ A PAWN STANDING ON THE TILE DOES NOT BLOCK — AND DOES NOT EVICT — A BLUEPRINT.
        ///
        /// <para>Wall and Door refuse an occupied tile because building one seals a person in. A bunk
        /// is furniture: the pawn steps off it. Requiring an empty tile would make placement fail
        /// intermittently because somebody wandered across the square — a silent, unpredictable
        /// refusal, which is the exact class this whole package removes.</para>
        ///
        /// <para>MUTATION: delete the <c>BuildKind.Device</c> arm from <c>CanDesignate</c> so it falls
        /// through to the citizen loop ⇒ RED.</para>
        /// </summary>
        [Test]
        public void ABlueprintMayBeLaidUnderSomebodysFeet()
        {
            var (_, host) = BootWreck();
            var sim = host.Sim;
            var crew = sim.Citizens.Items.FirstOrDefault(c => !c.Dead);
            Assert.IsNotNull(crew, "the wreck booted with nobody aboard");
            var under = crew.Pos;
            Assert.IsFalse(sim.TryGetDeviceAt(under, out _),
                "the crew member is standing on a device tile, so this leg would refuse for the "
                + "OTHER reason and prove nothing");
            StockParts(sim, under, 30);
            sim.Tick();
            var build = BuildOf(sim);

            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Bed, under));
            sim.Tick();
            Assert.IsTrue(build.TryGet(under, out _),
                "a blueprint was refused because a crew member happened to be standing there");

            // …and a WALL on the same tile is still refused, so the arm is narrow rather than a
            // blanket loosening. Non-vacuity by contrast: without this the leg above would pass
            // just as well if CanDesignate had stopped checking citizens for every kind.
            // ⚠️ THE CONTROL TILE MUST BE EMPTY OF PEOPLE, and the first draft's was not — `ClearTile`
            // scans z,y,x and handed back a square a crew member was standing on, so the control
            // failed for the very reason the contrast is about. It failed LOUDLY, which is the only
            // reason it was caught; a control that quietly agreed would have made this whole test
            // vacuous.
            Int3 other = default;
            bool haveOther = false;
            for (int z = 0; z < sim.World.Depth && !haveOther; z++)
                for (int y = 0; y < sim.World.Height && !haveOther; y++)
                    for (int x = 0; x < sim.World.Width && !haveOther; x++)
                    {
                        var p = new Int3(x, y, z);
                        if ((sim.World.GetFlags(p) & TileFlags.Walkable) == 0) continue;
                        if (sim.World.GetWall(p) != TileDefs.Void) continue;
                        if (sim.World.GetFloor(p) == TileDefs.Void) continue;
                        if (sim.TryGetDeviceAt(p, out _)) continue;
                        if (build.TryGet(p, out _)) continue;
                        if (sim.Citizens.Items.Any(c => !c.Dead && c.Pos == p)) continue;
                        other = p; haveOther = true;
                    }
            Assert.IsTrue(haveOther, "no empty, people-free tile on the wreck to use as a control");
            Assert.IsFalse(build.CanDesignate(sim, under, BuildKind.Wall),
                "a WALL may now be designated under a crew member — the Device arm loosened every kind");
            Assert.IsTrue(build.CanDesignate(sim, other, BuildKind.Wall),
                "no wall can be designated anywhere, so the assertion above proves nothing");
        }

        // ─────────────────────────────────────────────────────────────────────────────────────
        // 2. THE MATTER INVARIANT — a cancelled blueprint gives the Parts back, exactly.
        // ─────────────────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// ⛔ <b>PLACE → CANCEL IS MATTER-NEUTRAL, AND PLACE → BUILD → STRIP IS STILL LOSSY.</b>
        /// The site is charged in PARTS at designate and nothing is consumed while it waits, so the
        /// refund is the full price. A refund of MORE would mint; a refund of LESS would make cancel
        /// a matter sink the player cannot see.
        ///
        /// <para>MUTATION: drop the Device arm from <c>BuildSystem.Cancel</c> ⇒ RED (the Parts
        /// evaporate). MUTATION: refund twice ⇒ RED (a faucet).</para>
        /// </summary>
        [Test]
        public void PlaceThenCancelIsMatterNeutral()
        {
            var (_, host) = BootWreck();
            var sim = host.Sim;
            var pos = ClearTile(sim);
            StockParts(sim, pos, 30);
            sim.Tick();
            var build = BuildOf(sim);

            int before = PlaceDeviceCommand.Affordable(sim);
            Assert.Greater(before, sim.Defs.Build.DevicePlaceCost, "the ship cannot afford a placement");

            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Table, pos));
            sim.Tick();
            Assert.IsTrue(build.TryGet(pos, out _), "no site to cancel");
            Assert.AreEqual(before - sim.Defs.Build.DevicePlaceCost, PlaceDeviceCommand.Affordable(sim),
                "designating a blueprint did not charge exactly the place cost");

            Assert.IsTrue(build.Cancel(sim, pos), "Cancel refused a live blueprint");
            Assert.IsFalse(build.TryGet(pos, out _), "the cancelled blueprint is still standing");
            Assert.AreEqual(before, PlaceDeviceCommand.Affordable(sim),
                "cancelling a blueprint did not return exactly what placing it cost");
            Assert.IsFalse(sim.TryGetDeviceAt(pos, out _), "cancelling built the thing");
        }

        // ─────────────────────────────────────────────────────────────────────────────────────
        // 3. THE HASHED FIELDS — the instrument the five pins cannot be.
        // ─────────────────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// ⭐⭐ <b>THE TWO NEW FIELDS ARE INSIDE THE CHECKSUM, AND THIS IS THE ONLY THING IN THE REPO
        /// THAT CAN SEE THAT.</b>
        ///
        /// <para>⛔ <b>SAY THE HARD HALF OUT LOUD: NO PIN SEES THESE FIELDS.</b> Measured before they
        /// were written, by folding a probe (<c>Combine(h, 0xABCDEF01)</c>) into
        /// <c>StateChecksum</c>'s per-entry loop and driving <c>hosts/scenario --days 3 --seed 42</c>:
        /// the probe was <b>INERT</b> — all four day hashes byte-identical
        /// (<c>08d7680e3b6d118a</c> / <c>1716dddd0edaf9d0</c> / <c>773295e3ac0e555b</c> /
        /// <c>7bdd0d6f7756dfdc</c>). So <c>_pending</c> is EMPTY whenever P1's hash is taken, and
        /// P2/P3 are <c>ShipPlan</c>s that enqueue no player command at all. The pins therefore hold
        /// <b>VACUOUSLY</b>: they are blind to these folds because the list they walk is empty, not
        /// because the fields are inert. ⛔ Do not let a later lane read "all five pins held" as
        /// evidence that blueprint state is unhashed.</para>
        ///
        /// <para>MUTATION: delete either <c>Combine</c> line ⇒ RED on that half here, and GREEN on
        /// every one of the five pins — which is the point being made.</para>
        /// </summary>
        [Test]
        public void TheBlueprintFieldsAreINSIDETheChecksum()
        {
            ulong Checksum(DeviceKind kind, byte facing)
            {
                var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
                var sim = host.Sim;
                var pos = ClearTile(sim);
                StockParts(sim, pos, 30);
                sim.Tick();
                sim.EnqueueCommand(new PlaceDeviceCommand(kind, pos, facing));
                sim.Tick();
                var build = BuildOf(sim);
                Assert.IsTrue(build.TryGet(pos, out _), "no site was laid, so the checksum below is of an EMPTY list");
                return build.StateChecksum();
            }

            ulong table0 = Checksum(DeviceKind.Table, 0);
            ulong table2 = Checksum(DeviceKind.Table, 2);
            ulong bunk0 = Checksum(DeviceKind.Bed, 0);

            Assert.AreNotEqual(table0, table2,
                "FACING is not folded into the BULD checksum. It is saved state; an unhashed saved "
                + "field is exactly the invariant CLAUDE.md forbids, and a reload would silently turn "
                + "the piece.");
            Assert.AreNotEqual(table0, bunk0,
                "the blueprint's PIECE is not folded into the BULD checksum — two ships whose queues "
                + "hold different furniture would agree on their hashes.");
            Assert.AreEqual(table0, Checksum(DeviceKind.Table, 0),
                "the checksum is not deterministic for identical state, so the two inequalities above "
                + "prove nothing at all");
        }

        /// <summary>
        /// The BULD chapter round-trips a blueprint at v3, and a pre-v3 save still restores.
        /// A new saved field ⇒ save + hash + round-trip in the SAME commit (CLAUDE.md invariant).
        ///
        /// <para>MUTATION: drop <c>writer.Write(b.Facing)</c> ⇒ RED (the restored checksum differs).
        /// MUTATION: read the two v3 bytes unconditionally ⇒ RED on the legacy leg.</para>
        /// </summary>
        [Test]
        public void TheBlueprintRoundTripsThroughTheSaveChapter()
        {
            var (_, host) = BootWreck();
            var sim = host.Sim;
            var pos = ClearTile(sim);
            StockParts(sim, pos, 30);
            sim.Tick();
            var build = BuildOf(sim);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.MedBed, pos, facing: 3));
            sim.Tick();
            Assert.IsTrue(build.TryGet(pos, out var before), "no blueprint to round-trip");

            var buf = new MemoryStream();
            using (var w = new BinaryWriter(buf, System.Text.Encoding.UTF8, leaveOpen: true)) build.CaptureState(w);
            buf.Position = 0;
            var restored = new BuildSystem();
            using (var r = new BinaryReader(buf, System.Text.Encoding.UTF8, leaveOpen: true))
                restored.RestoreState(r, build.StateVersion);

            Assert.IsTrue(restored.TryGet(pos, out var after), "the blueprint did not survive the save");
            Assert.AreEqual(before.Device, after.Device, "the restored blueprint forgot its piece");
            Assert.AreEqual(before.Facing, after.Facing, "the restored blueprint forgot its facing");
            Assert.AreEqual(before.Kind, after.Kind);
            Assert.AreEqual(build.StateChecksum(), restored.StateChecksum(),
                "the restored system hashes differently from the one it was captured from");

            // A PRE-v3 SAVE: seven fields per entry, no Device/Facing. It must restore as the
            // Wall/Door/Floor site it described — 0/0 — rather than throwing or reading past its end.
            var legacy = new MemoryStream();
            using (var w = new BinaryWriter(legacy, System.Text.Encoding.UTF8, leaveOpen: true))
            {
                w.Write(1);                      // count
                w.Write(pos.X); w.Write(pos.Y); w.Write(pos.Z);
                w.Write((byte)BuildKind.Wall);
                w.Write(4); w.Write(1); w.Write(150);
                w.Write((byte)2);                // v2 material
            }
            legacy.Position = 0;
            var old = new BuildSystem();
            using (var r = new BinaryReader(legacy, System.Text.Encoding.UTF8, leaveOpen: true))
                old.RestoreState(r, 2);
            Assert.IsTrue(old.TryGet(pos, out var v2), "a v2 save no longer restores at all");
            Assert.AreEqual(BuildKind.Wall, v2.Kind);
            Assert.AreEqual(2, v2.Material, "the v2 material was lost");
            Assert.AreEqual(0, v2.Device, "a v2 site grew a piece out of nowhere");
            Assert.AreEqual(0, v2.Facing, "a v2 site grew a facing out of nowhere");
        }

        // ─────────────────────────────────────────────────────────────────────────────────────
        // 4. THE WIRE — the piece reaches the client in the vocabulary it already speaks.
        // ─────────────────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// ⭐ <c>TryFurnitureKind</c> and <c>FurnitureToolName</c> are exact inverses, over every
        /// member, in BOTH directions. Two hand-written switches that agree today are two switches
        /// that disagree after the next kind is added to one of them — and the failure is invisible:
        /// the blueprint would simply draw as the wrong piece, or as nothing.
        ///
        /// <para>MUTATION: add a case to one switch only ⇒ RED.</para>
        /// </summary>
        [Test]
        public void TheFurnitureNameTableIsABijection()
        {
            var placeable = Enum.GetValues(typeof(DeviceKind)).Cast<DeviceKind>()
                .Where(PlaceDeviceCommand.IsPlaceableFurniture).ToArray();
            Assert.Greater(placeable.Length, 5,
                "the whitelist scan found almost nothing — the matcher is not matching and every "
                + "comparison below is against an empty set");

            var seen = new Dictionary<string, DeviceKind>();
            foreach (var kind in placeable)
            {
                string name = GameSession.FurnitureToolName(kind);
                Assert.IsNotEmpty(name, kind + " is placeable furniture but has no wire tool-string, so a "
                    + "blueprint of it would reach the client with no art and draw nothing");
                Assert.IsFalse(seen.ContainsKey(name),
                    "two kinds share the wire tool-string '" + name + "': " + seen.GetValueOrDefault(name) + " and " + kind);
                seen[name] = kind;
                Assert.IsTrue(GameSession.TryFurnitureKindForTest(name, out var back),
                    "the inverse does not round-trip '" + name + "'");
                Assert.AreEqual(kind, back, "'" + name + "' round-tripped to the wrong kind");
            }

            // …and the reverse direction: nothing OFF the whitelist may claim a name.
            foreach (DeviceKind kind in Enum.GetValues(typeof(DeviceKind)))
            {
                if (PlaceDeviceCommand.IsPlaceableFurniture(kind)) continue;
                Assert.IsEmpty(GameSession.FurnitureToolName(kind),
                    kind + " is NOT placeable furniture but has a tool-string, which would let a "
                    + "blueprint of an unplaceable kind reach the client");
            }
        }

        /// <summary>
        /// The <c>designs</c> channel carries the blueprint's piece and facing, as APPEND-ONLY
        /// trailing elements — a reader that knows only the first seven is unaffected.
        /// </summary>
        [Test]
        public void TheDesignsChannelCarriesThePieceAndTheFacing()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, sink.Add);
            var sim = host.Sim;
            var pos = ClearTile(sim);
            StockParts(sim, pos, 30);
            sim.Tick();
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.GrowBed, pos, facing: 1));
            gs.AdvanceTicks(1);
            gs.RenderForTest();

            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"designs\""));
            Assert.IsNotNull(json, "the designs channel is not in the snapshot at all");
            StringAssert.Contains("\"growbed\"", json,
                "the blueprint's PIECE is not on the wire, so the client cannot draw the right art. "
                + "Payload: " + json);
            // The tuple, positionally — the tuple IS the contract.
            int open = json.IndexOf('[', json.IndexOf("\"cells\"", StringComparison.Ordinal) + 1);
            string first = json.Substring(open, json.IndexOf(']', open) - open + 1);
            var parts = first.Trim('[', ']').Split(',');
            Assert.AreEqual(9, parts.Length, "the designs tuple is " + parts.Length + " wide, expected 9: " + first);
            Assert.AreEqual(((int)BuildKind.Device).ToString(CultureInfo.InvariantCulture), parts[3], first);
            Assert.AreEqual("\"growbed\"", parts[7], first);
            Assert.AreEqual("1", parts[8], "the facing did not reach the wire: " + first);
        }

        // ─────────────────────────────────────────────────────────────────────────────────────
        // 5. ⭐⭐ THE HONEST WAIT — the orchestrator's clause, and the reason OD-H is survivable.
        // ─────────────────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// ⭐⭐ <b>A BLUEPRINT NOBODY WILL BUILD SAYS SO, ON THE CHANNEL THAT ALREADY SAYS IT FOR
        /// EVERY OTHER STUCK ORDER.</b> At the OD-H boot state — every work type OFF, which is the
        /// state a player is actually in — a fresh blueprint appears on <c>blocked</c> as
        /// <c>OrderBuild</c> + <c>ReasonWorkTypeOff</c>, which the client renders as
        /// <i>"BUILD BLOCKED — NOBODY ABOARD IS ASSIGNED THAT WORK"</i>.
        ///
        /// <para>⛔ <b>NO NEW MECHANISM, AND THAT IS THE FINDING RATHER THAN A CONVENIENCE.</b>
        /// <c>GameSession.BuildBlocked</c>'s third walk already iterates <c>BuildSystem.Pending</c>,
        /// and <c>NobodyAboardTakesTheWorkFor</c> already maps <c>OrderBuild → JobKind.Build →
        /// WorkType.Construct</c>. Making placement a build SITE is what earns the why-line; nothing
        /// was extended to get it. This test is what proves the inheritance really happens rather
        /// than being argued from the call graph.</para>
        ///
        /// <para>⛔ <b>AND NOTHING HERE TURNS A WORK TYPE ON.</b> OD-H stands; the second leg drives
        /// the player's own remedy (the WORK grid) and requires the row to CLEAR, so the sentence is
        /// shown to be live rather than latched.</para>
        ///
        /// <para>MUTATION: revert <c>PlaceDeviceCommand</c> to a spawn ⇒ RED (no site, no row, and
        /// the wait becomes invisible again).</para>
        /// </summary>
        [Test]
        public void AWaitingBlueprintSaysWhyOnTheBlockedChannel_AndTheRowClearsWhenTheWorkIsTurnedOn()
        {
            var sink = new List<string>();
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            var gs = new GameSession(host, sink.Add);
            var sim = host.Sim;

            // A tile in EXPLORED space — `AddIfBlocked` is fog-gated, and a row missing for fog would
            // read exactly like a row missing for the bug.
            Int3 pos = default;
            bool found = false;
            var crew = sim.Citizens.Items.First(c => !c.Dead);
            for (int r = 1; r < 8 && !found; r++)
                for (int dy = -r; dy <= r && !found; dy++)
                    for (int dx = -r; dx <= r && !found; dx++)
                    {
                        var p = new Int3(crew.Pos.X + dx, crew.Pos.Y + dy, crew.Pos.Z);
                        if (!sim.World.InBounds(p)) continue;
                        if ((sim.World.GetFlags(p) & TileFlags.Explored) == 0) continue;
                        if ((sim.World.GetFlags(p) & TileFlags.Walkable) == 0) continue;
                        if (sim.World.GetWall(p) != TileDefs.Void) continue;
                        if (sim.TryGetDeviceAt(p, out _)) continue;
                        pos = p; found = true;
                    }
            Assert.IsTrue(found, "no explored, clear tile near the crew — the fog gate would hide the row");

            StockParts(sim, pos, 30);
            sim.EnqueueCommand(new PlaceDeviceCommand(DeviceKind.Table, pos));
            gs.AdvanceTicks(2);

            var row = BlockedRowAt(gs, pos);
            Assert.IsNotNull(row,
                "a blueprint nobody aboard can build produced NO blocked row. Under OD-H it would sit "
                + "there forever with the game saying nothing — the wait would be dishonest, which is "
                + "the one condition the blueprint was allowed to ship under.");
            Assert.AreEqual(WireFormat.OrderBuild, row.Value.Order,
                "the blueprint is filed as some other kind of order");
            Assert.AreEqual(WireFormat.ReasonWorkTypeOff, row.Value.Reason,
                "the reason is not 'nobody aboard is assigned that work' — at the OD-H boot state, "
                + "with a reachable, breathable tile, that is the honest answer and the client already "
                + "has words for it");

            // ⭐ THE PLAYER'S OWN REMEDY, DRIVEN — and it is the WORK GRID, never an auto-enable.
            foreach (var c in sim.Citizens.Items)
                if (!c.Dead) sim.EnqueueCommand(new SetWorkPriorityCommand(c.Id, (int)WorkType.Construct, 3));
            gs.AdvanceTicks(2);
            var after = BlockedRowAt(gs, pos);
            Assert.IsTrue(after == null || after.Value.Reason != WireFormat.ReasonWorkTypeOff,
                "the work-type row did not clear after the player switched Construct on, so the "
                + "sentence is latched rather than re-asked live and would go on lying");
        }

        /// <summary>The `blocked` row for a tile, off the SNAPSHOT a reconnecting client is caught up
        /// from — `DroppedOrderTests`' reader, restated so this file drives the shipped channel.</summary>
        private static (int X, int Y, int Deck, int Order, int Reason)? BlockedRowAt(GameSession gs, Int3 p)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"blocked\""));
            Assert.IsNotNull(json, "the blocked channel must be cached for Snapshot catch-up");
            int cells = json.IndexOf("\"cells\"", StringComparison.Ordinal);
            foreach (var raw in json.Substring(cells).Split('[').Skip(2))
            {
                var t = raw.Split(']')[0].Split(',');
                if (t.Length < 5) continue;
                int x = int.Parse(t[0], CultureInfo.InvariantCulture);
                int y = int.Parse(t[1], CultureInfo.InvariantCulture);
                int d = int.Parse(t[2], CultureInfo.InvariantCulture);
                if (x != p.X || y != p.Y || d != p.Z) continue;
                return (x, y, d, int.Parse(t[3], CultureInfo.InvariantCulture),
                        int.Parse(t[4], CultureInfo.InvariantCulture));
            }
            return null;
        }
    }
}
