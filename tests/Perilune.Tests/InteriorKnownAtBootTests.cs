using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using Perilune.Gen;
using Perilune.Sim;
using Perilune.Tui;   // SimHost, ShipChoice
using Perilune.Web;   // GameSession

namespace Perilune.Tests
{
    /// <summary>
    /// <b>M1-1 — OD-C: THE SHIP'S OWN INTERIOR IS KNOWN AT BOOT.</b> <i>"You woke up on your own
    /// ship; its hold is on file."</i>
    ///
    /// <para><b>THE MEASURED DEFECT.</b> On <c>--ship wreck</c>, six of eight deck-0 slots rendered
    /// as blank ＋ADD ROOM boxes while holding <c>fabricator_1</c> (0.11), <c>machineshop_1</c>
    /// (0.13), <c>recycler_1</c> (0.09), <c>scrubber_ls</c> (0.08), <c>reclaimer_ls</c> (0.12) and
    /// <c>vent_ls</c> (0.15). None of them reached the <c>devices</c> channel, because that channel
    /// is fog-gated on <see cref="TileFlags.Explored"/> and <see cref="ExplorationSystem"/> is CREW
    /// VISION — and thirteen of this ship's sixteen compartments are sealed vacuum nobody can walk
    /// into. <c>vent_ls</c> is the premise's own opening move and it read <c>Explored = false</c> at
    /// tick 0, tick 600 and tick 36 000. Meanwhile the sensor log announced
    /// <c>fabricator_1: MACHINE FAILURE</c> by name, for a machine the player could not see.</para>
    ///
    /// <para><b>WHAT THIS FILE GUARDS, AND WHAT IT DELIBERATELY DOES NOT.</b> It guards that the
    /// wreck's interior IS known, that <b>no other ship's fog moved a bit</b>, and that fog is still
    /// a live mechanic rather than a deleted one. It does NOT guard the browser half — that a player
    /// can actually click the vent open — because no assertion in this repo can (an SVG chip in a
    /// zero-height container is byte-identical to a visible one). That is
    /// <c>client/tools/operate-shot.mjs</c>'s job, and the lane report carries its pictures.</para>
    ///
    /// <para><b>GATES.</b> No def scalar, no new save chapter, no new <c>GlyphColor</c> id, no
    /// <c>WireFormat</c> diff. <see cref="TileFlags.Explored"/> IS hashed, so this DOES move the
    /// StateHash of the one ship that opts in — and of no other, which is what
    /// <see cref="NoOtherAuthoredShip_OptsIn_AndTheirFogSurvivesTheBoot"/> exists to hold. None of
    /// the five pinned runs boots the wreck.</para>
    /// </summary>
    public class InteriorKnownAtBootTests
    {
        /// <summary>
        /// The six machines the recon report named, BY NAME. Written out by hand rather than derived
        /// from "everything on a fogged tile", because the point of the list is to fail loudly if a
        /// later lane re-authors one of them away — which is exactly when this guard would otherwise
        /// quietly start asserting less.
        /// </summary>
        private static readonly string[] TheInvisibleSix =
        {
            "fabricator_1", "machineshop_1", "recycler_1", "scrubber_ls", "reclaimer_ls", "vent_ls",
        };

        // ═════════════════════════════════════════════════════ 1. the wreck's interior is on file

        /// <summary>
        /// THE SIX NAMED MACHINES REACH THE <c>devices</c> CHANNEL AT TICK 0. Driven through the real
        /// web host and the real channel builder, and resolved BY NAME off <c>sim.Devices</c> so a
        /// re-authored layout cannot turn this into a test of six empty tiles.
        ///
        /// <para>MUTATION APPLIED: <c>InteriorKnownAtBoot = true</c> → <c>false</c> in
        /// <see cref="AuthoredShips.PeriluneWreck"/> ⇒ RED, naming all six.</para>
        /// </summary>
        [Test]
        public void TheWrecksInvisibleSix_ReachTheDevicesChannel_AtTickZero()
        {
            var (gs, host) = BootWreck();
            var onChannel = ChannelTiles(gs);

            // NON-VACUITY: the channel must be carrying SOMETHING, or `ChannelTiles` silently
            // returning an EMPTY set would turn the six-name loop below into a loop over nothing.
            // ⚠️ IT GUARDS THE EMPTY DIRECTION ONLY. An earlier draft of this comment claimed it also
            // catches "a parser that returns the whole world" — `Is.GreaterThan(0)` cannot see that,
            // and stating a guard's reach backwards is worse than not stating it. The over-reporting
            // direction is guarded by a DIFFERENT test: `OperateVerbTests`'
            // `The_Verb_And_The_Devices_Channel_Have_The_Same_Population`, which sweeps a whole ship
            // and requires the channel and the verb to agree in BOTH directions, with its own
            // inclusion floor demanding at least one device be off the channel.
            Assert.That(onChannel.Count, Is.GreaterThan(0), "the devices channel is empty — nothing below means anything");

            var missing = new List<string>();
            foreach (string name in TheInvisibleSix)
            {
                var d = DeviceNamed(host.Sim, name);
                bool explored = (host.Sim.World.GetFlags(d.Pos) & TileFlags.Explored) != 0;
                bool listed = onChannel.Contains((d.Pos.X, d.Pos.Y, d.Pos.Z));
                if (!explored || !listed)
                    missing.Add($"{name} @ {d.Pos}: explored={explored}, onChannel={listed}");
            }
            Assert.That(missing, Is.Empty,
                "these machines are authored into the shipped ship and the client is never told they " +
                "exist, so they cannot be seen, entered, stripped or repaired:\n  " +
                string.Join("\n  ", missing));
        }

        /// <summary>
        /// EVERY NON-VOID TILE OF BOTH DECKS IS KNOWN, not merely the six above — and the ship
        /// carries NO void at all, which is what makes the builder's <c>Void</c> skip provably a
        /// no-op here rather than a hole this test is stepping over.
        ///
        /// <para>MUTATION APPLIED: delete the <c>InteriorKnownAtBoot</c> block from
        /// <see cref="ShipPlanBuilder"/> ⇒ RED (1 034 unknown tiles of 1 620).</para>
        /// </summary>
        [Test]
        public void TheWholeWreckInterior_IsKnown_AndItCarriesNoVoidForTheSkipToHide()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
            int unknown = 0, voids = 0, total = 0;
            for (int z = 0; z < sim.World.Depth; z++)
            {
                var level = sim.World.Levels[z];
                for (int i = 0; i < level.Flags.Length; i++)
                {
                    total++;
                    if (level.Floor[i] == TileDefs.Void) { voids++; continue; }
                    if ((level.Flags[i] & (byte)TileFlags.Explored) == 0) unknown++;
                }
            }
            Assert.That(total, Is.GreaterThan(0), "the world is empty — nothing below means anything");
            Assert.That(voids, Is.Zero,
                "the wreck grew VOID tiles. The builder deliberately skips them (ExplorationSystem's " +
                "own rule), so this ship having none is what makes that skip a no-op rather than a " +
                "hole. If this fires, decide whether the new void SHOULD be known and say so in " +
                "ShipPlan.InteriorKnownAtBoot — do not just widen this number.");
            Assert.That(unknown, Is.Zero, $"{unknown} of {total} tiles of the ship's own hold are still fogged");
        }

        // ══════════════════════════════════════════ 2. and NO other ship's fog moved (the big one)

        /// <summary>
        /// <b>THE GUARD THAT STOPS THIS BECOMING A GLOBAL FOG DISABLE.</b> Every other authored ship
        /// must leave the flag off AND — the leg that actually bites — must still boot with fogged
        /// tiles and fogged DEVICES on it, through the same <see cref="GenSimHost"/> boot the hosts
        /// use (which runs <see cref="FogReveal.RevealReachable"/>, so this is the real boot fog and
        /// not a bare builder's).
        ///
        /// <para><b>NON-VACUITY IS AN INCLUSION TEST (CLAUDE.md, the fourth trap shape), and it is
        /// the decisive half.</b> A census that reported "still fogged" no matter what would pass
        /// this whatever the builder did. So the SAME census is run once more against grid's plan
        /// with <c>InteriorKnownAtBoot</c> FORCED ON, and it is required to report ZERO fogged
        /// devices and ZERO fogged tiles. Only then does "grid still has fog" mean anything.</para>
        ///
        /// <para><b>THE SHIP SET IS DERIVED, NOT HAND-LISTED</b> — every public parameterless
        /// <see cref="ShipPlan"/> factory on <see cref="AuthoredShips"/> except the wreck, found by
        /// reflection. A hand-written list of three of four is a join that goes silently stale the day
        /// a fifth authored ship arrives, which is the shape that has already cost this repo a whole
        /// review round (an id→implementation join is invisible when wrong). Its non-vacuity is
        /// asserted BOTH ways: the wreck must have been found AND excluded, and at least three other
        /// ships must remain — so neither an empty sweep nor a sweep that quietly includes the wreck
        /// can report itself as agreement.</para>
        ///
        /// <para>MUTATIONS APPLIED, all three physically run and reverted: drop the
        /// <c>if (plan.InteriorKnownAtBoot)</c> condition in <see cref="ShipPlanBuilder"/> so the
        /// reveal runs for every plan ⇒ <b>RED</b>, naming all three ships (perilune tiles+devices,
        /// slice tiles+devices, grid tiles); rename the wreck out of the reflection exclusion ⇒
        /// <b>RED</b> on the first floor; empty the derived set ⇒ <b>RED</b> on the second. The
        /// unmutated control is GREEN.</para>
        /// </summary>
        [Test]
        public void NoOtherAuthoredShip_OptsIn_AndTheirFogSurvivesTheBoot()
        {
            var factories = typeof(AuthoredShips)
                .GetMethods(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)
                .Where(mi => mi.ReturnType == typeof(ShipPlan) && mi.GetParameters().Length == 0)
                .OrderBy(mi => mi.Name, StringComparer.Ordinal)
                .ToList();
            Assert.That(factories.Any(mi => mi.Name == nameof(AuthoredShips.PeriluneWreck)), Is.True,
                "the reflection sweep cannot see PeriluneWreck itself, so 'every ship BUT the wreck' " +
                "is not what it is measuring and the exclusion below proves nothing");
            var others = factories.Where(mi => mi.Name != nameof(AuthoredShips.PeriluneWreck)).ToList();
            Assert.That(others.Count, Is.GreaterThanOrEqualTo(3),
                "fewer than three non-wreck authored ships were found by reflection — the sweep has " +
                "gone vacuous and 'no other ship opted in' would be true of an empty set");

            var offenders = new List<string>();
            foreach (var factory in others)
            {
                var plan = (ShipPlan)factory.Invoke(null, null);
                if (plan.InteriorKnownAtBoot)
                    offenders.Add($"{plan.Name} opted into InteriorKnownAtBoot");

                var (fogTiles, fogDevices) = FogCensus(GenSimHost.Build(plan).Sim);
                if (fogTiles == 0) offenders.Add($"{plan.Name} boots with NO fogged tile at all");
                // ⚠️ MEASURED, AND ONLY TWO OF THE THREE. `--ship grid` boots with fogged TILES (its
                // sealed halls) but ZERO fogged tile-resident DEVICES — its halls are unfurnished and
                // its conduits are utility overlays, which this census excludes. That is a fact about
                // grid at boot today, not about this lane, and asserting `> 0` for it would have been
                // asserting something untrue. It is written down rather than quietly dropped because
                // it is also WHY the fog-gate controls in OperateVerbTests use `--ship perilune`.
                bool expectFoggedDevices = plan.Name != "MSV Perilune (grid)";
                if (expectFoggedDevices && fogDevices == 0)
                    offenders.Add($"{plan.Name} boots with NO fogged device at all");
                if (!expectFoggedDevices && fogDevices != 0)
                    offenders.Add($"{plan.Name} GREW {fogDevices} fogged devices — re-read the note above; " +
                                  "grid measured 0 when this was written and the OperateVerbTests fixture " +
                                  "choice rests on it");
            }
            Assert.That(offenders, Is.Empty,
                "fog is a shipped mechanic on every ship but the wreck, and this lane must not have " +
                "touched it:\n  " + string.Join("\n  ", offenders));

            // ── INCLUSION CONTROL: plant the violation and require the same census to catch it. ──
            // On `--ship perilune`, because it is the one authored ship that boots with BOTH fogged
            // tiles and fogged devices — so the control exercises BOTH halves of the census. Run on
            // grid it would only ever have proved the tile half.
            var planted = AuthoredShips.Perilune();
            planted.InteriorKnownAtBoot = true;
            var (plantedTiles, plantedDevices) = FogCensus(GenSimHost.Build(planted).Sim);
            Assert.That(plantedDevices, Is.Zero,
                "INCLUSION: perilune booted with the flag FORCED ON and the census still reported " +
                "fogged devices. The census cannot see a global reveal, so the assertions above " +
                "prove nothing.");
            Assert.That(plantedTiles, Is.Zero,
                "INCLUSION: perilune booted with the flag FORCED ON and the census still reported " +
                "fogged tiles. Same conclusion.");
        }

        /// <summary>
        /// <b>FOG IS STILL A LIVE MECHANIC, NOT A DELETED ONE</b> — driven, not asserted about source.
        /// A crew member put down inside a compartment grid has never entered reveals that
        /// compartment through <see cref="ExplorationSystem"/>, exactly as before.
        ///
        /// <para>This is the leg that separates "the wreck opted in" from "somebody quietly made
        /// exploration unnecessary". Its own non-vacuity is structural: the tile is REQUIRED to be
        /// fogged before the citizen arrives, so the assertion cannot be satisfied by a tile that was
        /// already known.</para>
        ///
        /// <para>MUTATION APPLIED: <c>return</c> at the top of <c>ExplorationSystem.Tick</c> ⇒ RED.</para>
        /// </summary>
        [Test]
        public void ExplorationSystem_StillReveals_WhatTheCrewWalkInto()
        {
            var host = GenSimHost.Build(AuthoredShips.PeriluneGrid());
            var sim = host.Sim;

            // A fogged floor tile that is INSIDE a room (ExplorationSystem reveals a tile only when it
            // shares the citizen's room or is a boundary), on a deck the crew are not already on.
            Int3 target = default;
            bool found = false;
            for (int z = 0; z < sim.World.Depth && !found; z++)
            {
                var level = sim.World.Levels[z];
                for (int y = 0; y < sim.World.Height && !found; y++)
                    for (int x = 0; x < sim.World.Width; x++)
                    {
                        int idx = level.Index(x, y);
                        if ((level.Flags[idx] & (byte)TileFlags.Explored) != 0) continue;
                        if (level.Floor[idx] != TileDefs.Floor) continue;
                        ushort rid = level.RoomId[idx];
                        if (rid == 0 || rid == RoomState.DoorMarker) continue;
                        target = new Int3(x, y, z); found = true; break;
                    }
            }
            Assert.That(found, Is.True,
                "--ship grid has no fogged in-room floor tile, so this test cannot measure a reveal");

            var citizen = sim.Citizens.Items.First(c => !c.Dead);
            citizen.RevealsFog = true;
            citizen.Pos = target;
            Assert.That((sim.World.GetFlags(target) & TileFlags.Explored), Is.EqualTo((TileFlags)0),
                "the fixture tile is already known — the reveal below would be unobservable");

            for (int i = 0; i < 20; i++) sim.Tick();   // ExplorationSystem is 1 Hz (IntervalTicks = 10)
            Assert.That((sim.World.GetFlags(target) & TileFlags.Explored), Is.Not.EqualTo((TileFlags)0),
                "a crew member stood in a fogged compartment for two seconds and it stayed unknown — " +
                "fog of war has been disabled, not authored around");
        }

        // ═══════════════════════════════════════════ 3. wreck deck-0 slot 3 is a NAMED compartment

        /// <summary>
        /// <b>W4b's DEBT: SLOT 3 HAS A NAME</b>, so the Overview opens a Room Zoom on it instead of
        /// the ＋ADD ROOM picker. <c>roomTileRect</c> refuses a blank <c>anchorName</c>, so without
        /// this the compartment holding <c>vent_ls</c> could not be ENTERED at all and the fog fix
        /// above would still leave the opening move unreachable.
        ///
        /// <para>Asserted at BOTH ends: the plan's authoring, and the <c>decks</c> wire payload the
        /// client actually decodes — because a named anchor that the host blanks on its way out is
        /// exactly as unreachable as no anchor.</para>
        ///
        /// <para>MUTATION APPLIED: put <c>Hall(0, 3)</c> back <b>together with its two
        /// <c>rects[0]["hall_d0_s3"]</c> lookups</b> ⇒ a clean semantic RED on this test and on
        /// <c>The_Wrecks_Sealed_Vent_OPENS_...</c>, and on nothing else (2 red / 95 green).</para>
        ///
        /// <para>⚠️ <b>THE FIRST ATTEMPT AT THAT MUTATION WAS A FALSE RED (CLAUDE.md trap 3) AND IT
        /// IS WORTH THE THREE LINES.</b> Swapping only the slot line leaves the two device-placement
        /// lookups keyed on an anchor that no longer exists, so <see cref="AuthoredShips.PeriluneWreck"/>
        /// throws <c>KeyNotFoundException</c> and <b>60 tests</b> go red — including
        /// <c>PrintTheBootCensus</c>, which asserts only that the ship boots at all. Sixty reds read
        /// as overwhelming confirmation and proved nothing whatever about <c>anchorName</c>. The
        /// tell was the breadth, and the check is the one the trap prescribes: read the failure SET,
        /// not the count.</para>
        /// </summary>
        [Test]
        public void WreckDeck0Slot3_IsANamedCompartment_OnThePlanAndOnTheWire()
        {
            var plan = AuthoredShips.PeriluneWreck();

            var slot = plan.SlotGrid.Single(s => s.Deck == 0 && s.Index == AuthoredShips.WreckLifeSupportSlot);
            Assert.That(slot.Anchor, Is.EqualTo(AuthoredShips.WreckLifeSupportAnchor));
            Assert.That(slot.Type, Is.Not.EqualTo(RoomType.None),
                "an anchor with RoomType.None reads UNOCCUPIED with a BLANK name (GameSession.ResolveSlot " +
                "skips it), which is the whole defect");
            Assert.That(plan.Rooms.Any(r => r.Anchor == AuthoredShips.WreckLifeSupportAnchor
                                            && r.Type == AuthoredShips.WreckLifeSupportType), Is.True,
                "the ROOM anchor is what ResolveSlot reads — the SlotDescriptor is view-only geometry");

            var (gs, host) = BootWreck();
            var wire = SlotTuple(gs, 0, AuthoredShips.WreckLifeSupportSlot);
            Assert.That(wire.Anchor, Is.EqualTo(AuthoredShips.WreckLifeSupportAnchor),
                "the decks channel blanked the name on its way to the client, so roomTileRect still " +
                "refuses the slot and the Room Zoom still cannot be opened on it");
            Assert.That(wire.Occupied, Is.True, "a blank/unoccupied slot draws the ＋ADD ROOM chip instead of a room");
            Assert.That(wire.RoomType, Is.EqualTo((int)AuthoredShips.WreckLifeSupportType));

            // …and the vent really is inside that slot's rect, or naming it reaches nothing.
            var vent = DeviceNamed(host.Sim, "vent_ls");
            Assert.That(vent.Pos.Z, Is.EqualTo(0));
            Assert.That(vent.Pos.X, Is.InRange(slot.X, slot.X + slot.W - 1));
            Assert.That(vent.Pos.Y, Is.InRange(slot.Y, slot.Y + slot.H - 1));
        }

        /// <summary>
        /// <b>NAMING IT DID NOT GIVE IT AIR — the pressure frontier is exactly where it was.</b> This
        /// is the half a reviewer should be most suspicious of: <c>SlotGridPlanner</c> derives a
        /// slot's door from its type (<c>IsOpen = !empty</c>), so typing slot 3 the ordinary way would
        /// have booted its door OPEN onto the pressurised spine — and the compartment would then have
        /// filled ITSELF, for free, with no player action at all, deleting the very pressure loop
        /// <c>vent_ls</c> exists for. <c>SlotAssign.DoorOpen</c> is what separates the two decisions,
        /// and this is the assertion that it did.
        ///
        /// <para><b>⚠️ THE MECHANISM IS DIFFUSION, NOT A ROOM MERGE, AND AN EARLIER DRAFT OF THIS
        /// COMMENT WAS WRONG IN BOTH THE NUMBER AND THE TIMING.</b> It said the mutation "boots the
        /// door open and the compartment reads 101.3 kPa". It does not. <see cref="RoomState"/> marks
        /// a door tile <see cref="RoomState.DoorMarker"/> and rooms NEVER merge across one, so with
        /// the door open the boot census is byte-identical to the shipped tree: slot 3 is still its
        /// own 60-tile room holding <b>0.0 mol</b> (the spine is a separate 86-tile room of 8 945 mol,
        /// cryo and reactor 6 240 mol each), and <c>RoomState.Pressurize("wreck_spine_0")</c> cannot
        /// reach it. What fills it is B-3's partial-pressure term
        /// (<c>AtmosphereSystem.DiffuseAcrossDoors</c>), out of the spine and the reactor bay, over
        /// minutes. <b>MEASURED, driven in this tree</b> (<c>ShipPlanBuilder.Build</c> + the default
        /// stack, the mutation applied, n = 1, Debug):
        /// <list type="bullet">
        /// <item>tick <b>0</b> — <b>0.000 kPa</b>, 0.0 mol: AIRLESS at boot <i>either way</i>;</item>
        /// <item>tick 100 — 14.459 kPa (ppO2 3.035); tick 600 — 52.998 kPa (ppO2 11.124);</item>
        /// <item>tick <b>1 450</b> — the first tick <c>AtmosphereSafety.IsBreathable</c> returns TRUE
        ///   (ppO2 crosses <c>needs.def hypoxia_ppo2_kpa</c> = 16), i.e. ~2.4 sim-minutes;</item>
        /// <item>tick 3 000 — 90.042 kPa (ppO2 18.900); tick 20 000 — 101.302 kPa.</item>
        /// </list>
        /// ⇒ <b>The conclusion is unchanged and if anything worse — the compartment breathes itself
        /// open in under three sim-minutes with nobody touching anything.</b> But "101.3 kPa at boot"
        /// would tell a reader the mutation is caught by a boot-time gas census, and it is NOT: at
        /// tick 0 the two trees agree to the mole. Only <c>door.IsOpen</c> separates them there.</para>
        ///
        /// <para><b>⚠️ EACH LEG HAS ITS OWN NAMED MUTATION, AND EACH WAS RUN WITH THE OTHER LEG
        /// BLINDED</b> (CLAUDE.md, the fifth trap: <c>assert</c> throws, so only the FIRST failing leg
        /// ever reports, and a leg that cannot bite is indistinguishable from one that can). Blinding
        /// = rewriting the other leg's constraint to <c>Is.Not.Null</c>, which a boxed value type
        /// always satisfies, leaving the file compiling and the module loadable (trap 3).
        /// <list type="table">
        /// <item><term>LEG 1 — <c>door.IsOpen</c></term><description>mutation: drop
        ///   <c>doorOpen: false</c> from the slot-3 authoring. With LEG 2 BLINDED ⇒ <b>RED</b>,
        ///   1 failed / 0 passed, on this leg's own message.</description></item>
        /// <item><term>LEG 2 — <c>room.TotalMoles</c></term><description>mutation:
        ///   <c>plan.PressurizedAnchors.Add(WreckLifeSupportAnchor)</c>. With LEG 1 BLINDED ⇒
        ///   <b>RED</b>, 1 failed / 0 passed, on this leg's own message.</description></item>
        /// </list>
        /// <b>The two CROSS runs are why both legs must stay.</b> The door mutation with LEG 1 blinded
        /// is <b>GREEN</b> (0 failed / 1 passed) — at tick 0 there is no gas for leg 2 to see — and the
        /// anchor mutation with LEG 2 blinded is <b>GREEN</b> too. Neither leg can stand in for the
        /// other: leg 1 guards the DOOR, leg 2 guards the PRESSURISED SET, and only leg 2 would catch
        /// a future lane that pressurises this anchor while leaving the door shut. Three no-mutation
        /// controls (both legs live; each blinding alone) are GREEN, so the blinding is not itself
        /// what reddens the runs.</para>
        /// </summary>
        [Test]
        public void TheNamedLifeSupportBay_IsStillAirless_BehindItsOwnShutDoor()
        {
            var sim = ShipPlanBuilder.Build(AuthoredShips.PeriluneWreck(), Stack());
            var door = DeviceNamed(sim, "door_d0_s" + AuthoredShips.WreckLifeSupportSlot.ToString(CultureInfo.InvariantCulture));
            Assert.That(door.IsOpen, Is.False,
                "the life-support bay's door boots OPEN. It faces the pressurised spine, so the " +
                "compartment fills ITSELF by diffusion — measured breathable by tick ~1 450, under " +
                "three sim-minutes, with no player action — and the vent the wreck start is built " +
                "around has nothing left to do. (It is still 0.000 kPa at TICK 0, which is why the " +
                "gas leg below cannot catch this one: see the mutation table in the summary.)");

            sim.Rooms.RecomputeIfDirty(sim);
            var probe = ProbeOfSlot(AuthoredShips.WreckLifeSupportSlot);
            var room = sim.Rooms.RoomAt(sim.World, probe);
            Assert.That(room.TotalMoles, Is.EqualTo(0.0),
                "the life-support bay boots with gas in it — naming a compartment must not pressurise it");

            // CONTROL, so "airless" is not satisfied by a ship where everything is airless: the cryo
            // bay next door boots breathable through the same code path.
            var cryo = sim.Rooms.RoomAt(sim.World, ProbeOfSlot(AuthoredShips.WreckCryoSlot));
            Assert.That(cryo.TotalMoles, Is.GreaterThan(0.0),
                "CONTROL: the cryo bay is airless too, so this test cannot tell a frontier from a dead ship");
        }

        /// <summary>
        /// <b>THE <c>DoorOpen</c> OVERRIDE CHANGED EXACTLY ONE DOOR IN THE REPO.</b> Every slot door
        /// on every slot-grid ship still boots at the DERIVED state (typed ⇒ open, hall ⇒ shut), with
        /// the wreck's slot 3 as the single, named exception. This is the pin-neutrality argument for
        /// touching <see cref="SlotGridPlanner"/> at all, mechanised rather than asserted in prose.
        ///
        /// <para>MUTATION APPLIED: change the fallback to <c>slot.DoorOpen ?? empty</c> ⇒ RED with 24
        /// offenders across grid and the wreck.</para>
        /// </summary>
        [Test]
        public void TheDoorOverride_MovedExactlyOneDoor_AcrossEverySlotGridShip()
        {
            var offenders = new List<string>();
            int checkedDoors = 0, exceptions = 0;
            foreach (var plan in new[] { AuthoredShips.PeriluneGrid(), AuthoredShips.PeriluneWreck() })
            {
                foreach (var slot in plan.SlotGrid)
                {
                    string doorName = $"door_d{slot.Deck.ToString(CultureInfo.InvariantCulture)}" +
                                      $"_s{slot.Index.ToString(CultureInfo.InvariantCulture)}";
                    var spec = plan.Devices.Single(d => d.Name == doorName);
                    checkedDoors++;
                    bool derived = slot.Type != RoomType.None;
                    bool isTheKnownException = plan.Name == "MSV Perilune (wreck)"
                                               && slot.Deck == 0
                                               && slot.Index == AuthoredShips.WreckLifeSupportSlot;
                    if (isTheKnownException)
                    {
                        exceptions++;
                        if (spec.IsOpen) offenders.Add($"{plan.Name} {doorName}: the ONE override is not applied");
                        continue;
                    }
                    if (spec.IsOpen != derived)
                        offenders.Add($"{plan.Name} {doorName}: IsOpen={spec.IsOpen}, derived={derived}");
                }
            }
            Assert.That(checkedDoors, Is.GreaterThan(0), "no slot-grid doors were examined at all");
            Assert.That(exceptions, Is.EqualTo(1),
                "there must be EXACTLY ONE authored door-state override in the repo. A second one " +
                "arriving silently is how 'the typed set and the pressurised set' stopped being true " +
                "the first time.");
            Assert.That(offenders, Is.Empty, string.Join("\n  ", offenders));
        }

        // ═══════════════════════════════════════════════════════════════════════════════ helpers

        private static (GameSession gs, SimHost host) BootWreck()
        {
            var host = SimHost.Build(SimHost.DefaultSeedFor(ShipChoice.Wreck), ship: ShipChoice.Wreck);
            return (new GameSession(host, _ => { }), host);   // NOT started ⇒ no sim thread
        }

        private static ISimSystem[] Stack() =>
            SystemStack.CreateDefault(new Perilune.Dsl.ScriptRuntime(new Perilune.Dsl.DeviceRegistry()));

        private static Device DeviceNamed(Simulation sim, string name)
        {
            var d = sim.Devices.Items.FirstOrDefault(x => x.Name == name);
            Assert.That(d, Is.Not.Null, $"--ship wreck no longer authors '{name}' — the fixture is gone, " +
                                        "so every assertion about it below would pass or fail for the wrong reason");
            return d;
        }

        /// <summary>A slot's centre probe tile — the tile anchors, pressurisation and ＋ADD ROOM all
        /// resolve a room through (<see cref="SlotGridPlanner.InteriorRect"/>), on deck 0.</summary>
        private static Int3 ProbeOfSlot(int slotIndex)
        {
            var r = SlotGridPlanner.InteriorRect(slotIndex);
            return new Int3(r.CenterX, r.CenterY, 0);
        }

        /// <summary>(fogged tiles, fogged tile-resident devices) after a full host boot.</summary>
        private static (int Tiles, int Devices) FogCensus(Simulation sim)
        {
            int tiles = 0;
            for (int z = 0; z < sim.World.Depth; z++)
            {
                var level = sim.World.Levels[z];
                for (int i = 0; i < level.Flags.Length; i++)
                {
                    if (level.Floor[i] == TileDefs.Void) continue;   // never "explored" either way
                    if ((level.Flags[i] & (byte)TileFlags.Explored) == 0) tiles++;
                }
            }
            int devices = sim.Devices.Items.Count(
                d => !Simulation.IsUtilityOverlay(d.Kind)
                     && sim.World.InBounds(d.Pos)
                     && (sim.World.GetFlags(d.Pos) & TileFlags.Explored) == 0);
            return (tiles, devices);
        }

        /// <summary>Every tile the <c>devices</c> channel emits, parsed positionally out of the cached
        /// payload a reconnecting client is caught up from.</summary>
        private static HashSet<(int, int, int)> ChannelTiles(GameSession gs)
        {
            gs.RenderForTest();
            string json = gs.Snapshot().FirstOrDefault(s => s.Contains("\"type\":\"devices\""));
            Assert.That(json, Is.Not.Null, "the devices channel is not in the Snapshot at all");
            var set = new HashSet<(int, int, int)>();
            int open = json.IndexOf("\"cells\":[", StringComparison.Ordinal);
            Assert.That(open, Is.GreaterThanOrEqualTo(0), "the payload has no cells array: " + json);
            foreach (var part in json.Substring(open).Split('[').Skip(2))
            {
                var f = part.Split(']')[0].Split(',');
                Assert.That(f.Length, Is.EqualTo(10), "a devices tuple is TEN elements since the price landed (…,open,serv,air,spend)");
                set.Add((int.Parse(f[0], CultureInfo.InvariantCulture),
                         int.Parse(f[1], CultureInfo.InvariantCulture),
                         int.Parse(f[2], CultureInfo.InvariantCulture)));
            }
            return set;
        }

        /// <summary>One slot's tuple out of the cached <c>decks</c> payload. Parsed POSITIONALLY —
        /// [slotIndex, x, y, w, h, anchorName, roomType, occupied, active] IS the contract. Same shape
        /// as <c>EveryCompartmentIsARoomTests</c>' deck-wide parser, deliberately duplicated rather
        /// than shared: these two files pin different ships and a shared parser makes one file's
        /// re-authoring silently change the other's subject. (The third copy of this shape lived in
        /// <c>AddRoomCommandTests</c> and went with it in M1-L-b.)</summary>
        private static (int RoomType, bool Occupied, string Anchor) SlotTuple(GameSession gs, int deck, int slotIndex)
        {
            gs.RenderForTest();
            string json = null;
            foreach (var s in gs.Snapshot())
                if (s.Contains("\"type\":\"decks\"")) json = s;
            Assert.That(json, Is.Not.Null, "the decks channel must be cached for Snapshot catch-up");

            int at = json.IndexOf("{\"deck\":" + deck.ToString(CultureInfo.InvariantCulture) + ",", StringComparison.Ordinal);
            Assert.That(at, Is.GreaterThanOrEqualTo(0), $"no deck {deck} in: {json}");
            string body = json.Substring(at);
            body = body.Substring(0, body.IndexOf("]}", StringComparison.Ordinal));

            foreach (var part in body.Split('['))
            {
                if (part.Length == 0 || !char.IsDigit(part[0])) continue;
                var f = part.Split(']')[0].Split(',');
                if (f.Length != 9) continue;
                if (int.Parse(f[0], CultureInfo.InvariantCulture) != slotIndex) continue;
                return (int.Parse(f[6], CultureInfo.InvariantCulture), f[7] == "true", f[5].Trim('"'));
            }
            Assert.Fail($"no slot {slotIndex} on deck {deck} in: {json}");
            return default;
        }
    }
}
