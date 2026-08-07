using System;
using System.Collections.Generic;
using Perilune.Sim;

namespace Perilune.Gen
{
    /// <summary>
    /// Hand-authored ship plans. The MSV Perilune here is the shipping start map:
    /// a 64×20×2 top-down deck plan (x = length, y = beam, z = decks, z0 = lower).
    /// Rooms are carved out of solid hull mass on a GridCanvas — anything not
    /// carved is wall, so compartments cannot leak by omission. Device and anchor
    /// names are the stable MOSS vocabulary (vent_hydro, door_storage, hydro, …).
    /// </summary>
    public static class AuthoredShips
    {
        public const int Width = 64;
        public const int Height = 20;

        /// <summary>The life-support watch found on the hydroponics terminal.</summary>
        public const string DefaultProgram =
            "# life support watch -- found on the hydroponics terminal\n" +
            "every 2s:\n" +
            "  if hydro.pressure < 96kPa: open(vent_hydro)\n" +
            "  if hydro.pressure > 100kPa: close(vent_hydro)\n" +
            "\n" +
            "when lifesupport.pressure < 60kPa:\n" +
            "  close(door_storage)\n" +
            "  alarm(\"DECOMPRESSION - LIFE SUPPORT SEALED\")\n" +
            "\n" +
            "alarm when hydro.co2 > 2000ppm, \"CO2 HIGH - HYDROPONICS BAY\"\n";

        public static ShipPlan Perilune()
        {
            var plan = new ShipPlan { Name = "MSV Perilune", Seed = 20260718UL };

            // ---------------------------------------------------------- deck rasters
            //
            // Deck z0 (lower)                     Deck z1 (upper)
            //   port band:  reactor | engineering   port:  bridge(fore) | command | medbay
            //               | fabrication | storage         | cabin suite (4 cabins + hall)
            //   corridor y9-10                      corridor y9-10 (aft of the bridge)
            //   starboard band: mess | commons      starboard: hydroponics | observatory
            //               | workshop | lifesupport
            //   aft: debris-choked section behind door_aft (the dig objective)
            //
            // Rooms are carved by the BandPlanner at RoomProgramme sizes — each
            // compartment as big as its job, the rest stays solid hull mass (a
            // dense ship, not a row of hangars). Doors that DeviceLayout.json
            // hand-yaws (command/medbay/quarters/hydro) keep their pinned tiles.

            var z0 = new GridCanvas(Width, Height, '#');
            z0.FillRect(2, 9, 55, 10, '.');   // corridor spine
            z0.FillRect(57, 6, 62, 13, 'R');  // aft debris field (dig objective)
            z0.Set(56, 9, '.'); // aft lock onto the debris seam

            var z1 = new GridCanvas(Width, Height, '#');
            z1.FillRect(13, 9, 61, 10, '.');  // corridor spine (aft of the bridge)
            z1.FillRect(2, 4, 11, 15, '.');   // bridge (spans the bow; fiction keeps it grand)
            // Crew quarters suite: four 4×4 cabins off a private hall (a single
            // 20×7 "quarters" read as a hangar, not a place anyone sleeps).
            z1.FillRect(42, 6, 61, 7, '.');   // quarters hall (door_quarters at 50,8)
            z1.FillRect(42, 1, 45, 4, '.');   // cabin 1
            z1.FillRect(47, 1, 50, 4, '.');   // cabin 2
            z1.FillRect(52, 1, 55, 4, '.');   // cabin 3
            z1.FillRect(57, 1, 60, 4, '.');   // cabin 4
            z1.Set(44, 5, '.'); z1.Set(48, 5, '.'); z1.Set(53, 5, '.'); z1.Set(58, 5, '.'); // cabin doors
            z1.Set(12, 9, '.'); // door_bridge
            z1.Set(50, 8, '.'); // door_quarters

            // ------------------------------------------------- planned room bands
            var north0 = BandPlanner.Carve(z0, plan, 0, startX: 2, corridorWallY: 8, roomsAbove: true, new[]
            {
                new BandPlanner.Room { Anchor = "reactor", Type = RoomType.Reactor, DoorX = -1 },
                new BandPlanner.Room { Anchor = "engineering", Type = RoomType.Engineering, DoorX = -1, DoorName = "door_eng" },
                new BandPlanner.Room { Anchor = "fabrication", Type = RoomType.Fabrication, DoorX = -1, DoorName = "door_fab" },
                new BandPlanner.Room { Anchor = "storage", Type = RoomType.Storage, DoorX = -1 },
            });
            var south0 = BandPlanner.Carve(z0, plan, 0, startX: 2, corridorWallY: 11, roomsAbove: false, new[]
            {
                new BandPlanner.Room { Anchor = "mess", Type = RoomType.Mess, DoorX = -1 },
                new BandPlanner.Room { Anchor = "commons", Type = RoomType.Commons, DoorX = -1 },
                new BandPlanner.Room { Anchor = "workshop", Type = RoomType.Workshop, DoorX = -1 },
                new BandPlanner.Room { Anchor = "lifesupport", Type = RoomType.LifeSupport, DoorX = -1, DoorName = "door_ls" },
            });
            var north1 = BandPlanner.Carve(z1, plan, 1, startX: 13, corridorWallY: 8, roomsAbove: true, new[]
            {
                new BandPlanner.Room { Anchor = "command", Type = RoomType.Command, DoorX = 20 },
                new BandPlanner.Room { Anchor = "medbay", Type = RoomType.Medbay, DoorX = 34 },
            });
            var south1 = BandPlanner.Carve(z1, plan, 1, startX: 13, corridorWallY: 11, roomsAbove: false, new[]
            {
                new BandPlanner.Room { Anchor = "hydro", Type = RoomType.Hydro, DoorX = 22 },
                new BandPlanner.Room { Anchor = "observatory", Type = RoomType.Observatory, DoorX = 55, DoorName = "door_observatory", DoorClosed = true },
            });

            plan.DeckRows = new[] { z0.ToRows(), z1.ToRows() };

            // ---------------------------------------------------------------- doors
            // (band doors come from the planner). Interior doors start OPEN (a
            // lived-in ship; institutional finding: closed defaults once sealed the
            // crew away from all water). Sealed by fiction: door_bridge (vacuum
            // behind it), door_observatory (Reyes sealed himself in), door_aft.
            Door(plan, "door_bridge", 12, 9, 1, open: false);
            Door(plan, "door_quarters", 50, 8, 1, open: true);
            Door(plan, "door_cabin_1", 44, 5, 1, open: true);
            Door(plan, "door_cabin_2", 48, 5, 1, open: true);
            Door(plan, "door_cabin_3", 53, 5, 1, open: true);
            Door(plan, "door_cabin_4", 58, 5, 1, open: true);
            Door(plan, "door_aft", 56, 9, 0, open: false);

            // ------------------------------------------------------- ladder trunks
            // Trunk A x=18, trunk B x=46 (corridor tiles on both decks; the z0
            // device links the decks for pathing, the z1 twin is the visual top).
            Dev(plan, DeviceKind.Ladder, 18, 9, 0, "ladder_a_low");
            Dev(plan, DeviceKind.Ladder, 18, 9, 1, "ladder_a_up");
            Dev(plan, DeviceKind.Ladder, 46, 9, 0, "ladder_b_low");
            Dev(plan, DeviceKind.Ladder, 46, 9, 1, "ladder_b_up");

            // ---------------------------------------------------------------- power
            // Conduit service tray under every carved deck tile (overlay devices
            // share tiles freely); vertical adjacency turns every shared (x,y)
            // column into a riser — one ship-wide network fed from the reactor.
            AddConduits(plan, z0, 0);
            AddConduits(plan, z1, 1);

            // -------------------------------------------------- room outfitting
            // Each room's working devices land by RoomOutfitter rules inside its
            // planned rect; device names are pinned MOSS vocabulary. The water
            // loops stay deliberately separate (potable reserve off the
            // irrigation loop — grow beds would drain a shared network in hours).
            RoomOutfitter.Reactor(plan, north0["reactor"], 0);
            RoomOutfitter.Engineering(plan, north0["engineering"], 0);
            RoomOutfitter.Fabrication(plan, north0["fabrication"], 0);
            Dev(plan, DeviceKind.Light, north0["storage"].CenterX, north0["storage"].Y0, 0, "light_storage"); // stores row stays clear
            RoomOutfitter.Mess(plan, south0["mess"], 0);
            RoomOutfitter.Light(plan, south0["commons"], 0, "light_commons");
            RoomOutfitter.Light(plan, south0["workshop"], 0, "light_workshop");
            RoomOutfitter.LifeSupport(plan, south0["lifesupport"], 0);
            RoomOutfitter.Light(plan, north1["command"], 1, "light_command");
            RoomOutfitter.Light(plan, north1["medbay"], 1, "light_medbay");
            RoomOutfitter.Hydro(plan, south1["hydro"], 1);
            RoomOutfitter.Light(plan, south1["observatory"], 1, "light_obs");
            Dev(plan, DeviceKind.Light, 6, 9, 1, "light_bridge");
            Dev(plan, DeviceKind.Light, 51, 6, 1, "light_quarters"); // hall lamp; cabins stay dim+cozy
            // Upper-deck air recirculator pair, RUNNING at boot: the compact hull
            // holds far less passive air than the old hangar rooms, so the deck
            // needs its scrub→pressure-dip→fresh-mix cycle live from tick 0 (the
            // reason the crew is still breathing when the player arrives).
            Dev(plan, DeviceKind.Scrubber, 33, 9, 1, "scrubber_corr_up");
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(34, 9, 1), Name = "vent_corr_up", IsOpen = true });
            Vent(plan, "vent_hall", 43, 6, 1); // cabin-block reserve feed (closed; MOSS/player opens)
            Dev(plan, DeviceKind.Light, 32, 9, 1, "light_corr_up");
            Dev(plan, DeviceKind.Light, 32, 9, 0, "light_corr_low");

            // ------------------------------------------------- salvage & stores
            var store = north0["storage"];
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Potato, Count = 3, Pos = new Int3(store.X0 + 1, store.CenterY, 0), Label = "emergency rations" });
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Corpse, Count = 1, Pos = new Int3(store.X0 + 2, store.CenterY, 0), Label = "Ensign Rojas" });
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Regolith, Count = 1, Pos = new Int3(store.X0 + 3, store.CenterY, 0) });
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Regolith, Count = 1, Pos = new Int3(store.X0 + 4, store.CenterY, 0) });
            var shop = south0["workshop"];
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Scrap, Count = 2, Pos = new Int3(shop.X0 + 1, shop.CenterY, 0) });

            // -------------------------------------------------------------- people
            // HoldPosition: the recapture crew is under strict player control — they
            // move only on direct orders (and the player owns feeding/watering them).
            // Okafor wakes in the quarters HALL, not a cabin: a sealed 4×4 cabin
            // holds less than a day of air for one person (found the hard way —
            // the day-one survival test asphyxiated him in cabin 2).
            plan.Citizens.Add(new CitizenSpec { Name = "Okafor", Pos = new Int3(49, 7, 1), AutoWander = false, RevealsFog = true, HoldPosition = true });
            plan.Citizens.Add(new CitizenSpec { Name = "Reyes", Pos = new Int3(56, 15, 1), AutoWander = false, RevealsFog = false, HoldPosition = true });

            // ------------------------------------------------------------- anchors
            // (band-room anchors come from the planner; these are the hand-carved spaces)
            Room(plan, "bridge", RoomType.Bridge, 7, 9, 1);
            Room(plan, "cabin_1", RoomType.Quarters, 43, 2, 1);
            Room(plan, "cabin_2", RoomType.Quarters, 49, 2, 1);
            Room(plan, "cabin_3", RoomType.Quarters, 53, 2, 1);
            Room(plan, "cabin_4", RoomType.Quarters, 58, 2, 1);
            Room(plan, "quarters_hall", RoomType.Corridor, 45, 7, 1);
            Room(plan, "corridor_upper", RoomType.Corridor, 30, 9, 1);
            Room(plan, "corridor_lower", RoomType.Corridor, 30, 9, 0);

            // ---------------------------------------------------- starting state
            // Every compartment held pressure except the bridge — restoring it is
            // the early goal. Corridors are rooms too and start breathable.
            foreach (var name in new[]
            {
                "command", "medbay", "cabin_1", "cabin_2", "cabin_3", "cabin_4",
                "quarters_hall", "hydro", "observatory", "corridor_upper",
                "reactor", "engineering", "fabrication", "storage", "mess", "commons",
                "workshop", "lifesupport", "corridor_lower",
            })
                plan.PressurizedAnchors.Add(name);

            plan.Goals.Add(new GoalSpec { Kind = GoalKind.PressurizeAnchor, Param = "bridge", Text = "Restore the bridge" });
            plan.Goals.Add(new GoalSpec { Kind = GoalKind.ClearAllDebris, Param = "", Text = "Clear the aft debris" });
            plan.Goals.Add(new GoalSpec { Kind = GoalKind.ExploreAnchor, Param = "observatory", Text = "Find the crew" });

            plan.Scripts.Add(new ScriptSpec { TerminalId = "term_hydro", Source = DefaultProgram });

            // Furnish every typed room by rule — never by hand (see RoomDresser).
            RoomDresser.Dress(plan);

            return plan;
        }

        // =====================================================================
        // P2 "The Talking Ship" slice — PeriluneSlice()
        // =====================================================================
        // The emotional-engine proof ship: the same proven 64×20×2 envelope as
        // Perilune() (reused verbatim — Perilune() returns a fresh plan each call,
        // so mutating the copy never perturbs the pinned goldens that boot the
        // 2-crew original), re-crewed with EIGHT authored citizens and given the
        // extra matter budget eight mouths need over an unattended voyage. The crew
        // personas + secrets + relationship web live in SliceCrew(); the hosts weave
        // them onto the built sim through PopulateSlice() (minds are host-owned, not
        // hashed — only the seeded opinions ride StateHash, deterministically).

        /// <summary>The slice's own ship seed — a DISTINCT identity from Perilune()
        /// (20260718) so the portrait pipeline keys (pk_fnv1a32(seed, citizenId)) never
        /// collide with the 2-crew reference. This is the seed the ART lane conditions on.</summary>
        public const ulong SliceSeed = 20260721UL;

        public static ShipPlan PeriluneSlice()
        {
            // Start from Perilune()'s proven envelope: geometry, rooms, doors, power,
            // water/air loops, pressurization, goals and the life-support watch all come
            // across intact. We only re-crew and re-stock for eight.
            var plan = Perilune();
            plan.Name = "MSV Perilune (slice)";
            plan.Seed = SliceSeed;

            // -------------------------------------------------------------- crew (8)
            // The recapture crew wakes in the recirculated corridors — always breathable
            // (the upper-deck scrubber/vent pair runs from tick 0) and central to the
            // ladders, so every citizen can reach food (storage, deck 0) and water
            // (lifesupport + hydro tanks). AutoWander=TRUE (unlike Perilune's HoldPosition
            // pair): eight crew who only move on need would all reach thirst at the same
            // moment and pile onto the single nearest water tile, breathing one small room
            // down to hypoxia together (a real deadlock seen in testing). Wandering
            // desynchronises them — they disperse between needs, so no room ever holds all eight.
            // ⚠️ "Across the SHIP" until 2026-07-25; it is now "across their own DECK", because the
            // idle sampler is deck-confined (PathService.TryRandomWalkableTileNear pins the draw to
            // origin.Z). The mechanism is unaffected — dispersal within a deck is what breaks the
            // pile-on, and the ladder was never load-bearing for it. MEASURED after the change,
            // 3 sim-days: 8/8 alive, Eat/Drink occupancy unchanged. This DID move the slice's
            // tick-3000 golden (1f8f2225ee568de9 -> c565a68b810f588d) — the state differs even
            // though the aggregate occupancy does not.
            // Names/order here are the persona-match key in SliceCrew().
            plan.Citizens.Clear();
            var starts = new (string name, Int3 pos)[]
            {
                ("Amara Okonkwo", new Int3(20, 9, 1)),
                ("Priya Raghavan", new Int3(24, 9, 1)),
                ("Dmitri Volkov",  new Int3(28, 9, 1)),
                ("Salif Camara",   new Int3(32, 9, 1)),
                ("Nadia Hassan",   new Int3(36, 9, 1)),
                ("Tomas Ferreira", new Int3(20, 9, 0)),
                ("Grace Oyelaran", new Int3(24, 9, 0)),
                ("Wei Chen",       new Int3(28, 9, 0)),
            };
            foreach (var (name, pos) in starts)
                plan.Citizens.Add(new CitizenSpec { Name = name, Pos = pos, AutoWander = true, RevealsFog = true, HoldPosition = false });

            // Pressurise the bridge for the slice. On Perilune it starts in vacuum (the
            // "restore the bridge" goal), harmless because that crew never wanders; but the
            // slice's wandering crew WOULD path through the (traversable) bridge door into
            // vacuum and asphyxiate. The bridge is gas-tight (sealed hull + the one door), so
            // starting it pressurised makes the whole reachable ship breathable — no vacuum
            // deathtrap for a wandering crew. (The pressurise-bridge goal simply reads as met.)
            if (!plan.PressurizedAnchors.Contains("bridge"))
                plan.PressurizedAnchors.Add("bridge");

            // ------------------------------------------------- matter for eight (M2)
            // Eight crew drink, eat and breathe four times the two-crew reference. The
            // balance is authored into the SLICE'S device/stock mix (never a global .def
            // change — those fold into boot state and would move the pinned 2-crew hash):
            //   * more stored water + a primed greywater pool so the reclaimer has a
            //     buffer to cycle through the multi-day run;
            //   * a fuller pantry (grow beds already produce, but a starting stock keeps
            //     nobody starving before the first harvest);
            //   * a second upper-corridor scrubber so CO2 scrubbing covers eight, not
            //     three-per-scrubber-times-the-old-count;
            //   * the lower deck's life-support vent RUNNING, so that deck holds nominal
            //     while the crew dig the aft collapse open;
            //   * an opening stock of build material in whole-wall stacks.
            AddSliceMatter(plan);

            // ------------------------------------------------------- the aft dig (M2 work)
            // Perilune()'s "Clear the aft debris" goal came across with the envelope, but a
            // GOAL is only a completion predicate — it designates nothing, so on the slice the
            // dig board booted EMPTY and the crew had no labour at all (measured: 99.9% of
            // crew-ticks JobKind.None over three days, zero Dig/Haul/Build). Two authored facts
            // fix that, and both are needed — either alone does nothing:
            //   * door_aft OPEN. The 6x8 debris field (57..62, 6..13, z0) touches exactly one
            //     walkable tile, the aft lock at (56,9,0). With the door sealed every dig site
            //     is unreachable and the board is inert even when designated (verified).
            //     Fiction: the recapture crew has already broken the aft seal — clearing the
            //     collapse is what they came back for.
            //   * The field designated. Digging is the ship's ONLY in-sim source of Regolith
            //     (JobSystem drops one unit of spoil per cleared tile), so it is what feeds the
            //     build loop, and CapabilityComputer only lets a citizen AGREE to a dig task
            //     while a designated debris tile exists.
            // ALL 48 tiles, not a subset: the field is one collapse and the goal is "clear the
            // aft debris" — a half-designated field reads as an arbitrary stopping line, and a
            // subset buys nothing in duration (eight crew clear even the full field inside ~10
            // sim-minutes). The volume it opens is paid for by the running vent_ls in
            // AddSliceMatter — see the note there.
            SetDeviceOpen(plan, "door_aft", true);
            DesignateDebrisRect(plan, 57, 6, 62, 13, z: 0);

            return plan;
        }

        /// <summary>The extra device/stock mix that carries eight crew across an unattended
        /// voyage — authored onto the slice plan only (hash-neutral for Perilune()). Split out
        /// so the M2 balance is one readable block. Everything here reuses proven, on-network
        /// positions: existing tanks are topped up (guaranteed on their fluid network), the
        /// pantry rides the existing ration stack's tile (guaranteed on open floor), and the
        /// scrubber lands on a recirculated corridor tile with a conduit already beneath it.</summary>
        private static void AddSliceMatter(ShipPlan plan)
        {
            // Water: fill both loops' tanks to capacity (500 L each) — no new tiles, so no
            // in-wall / off-network risk. The greywater reserve the reclaimers cycle is primed
            // in PopulateSlice (ShipPlan has no wastewater field).
            SetTankLiters(plan, "tank_main", 500f);
            SetTankLiters(plan, "tank_hydro", 500f);

            // Pantry: eight crew eat ~0.36 hunger/potato; a full opening stock bridges the gap
            // to the first grow-bed harvest. Ride the emergency-ration tile (known open floor).
            AddPotatoesAtRations(plan, extra: 24);

            // Air: a second upper-corridor scrubber so CO2 removal scales to eight. (33,9) and
            // (34,9) already hold the recirculator pair; (31,10) is the twin corridor row, an
            // open '.' tile with a conduit tray beneath it (AddConduits covers every corridor
            // tile), so it powers immediately.
            Dev(plan, DeviceKind.Scrubber, 31, 10, 1, "scrubber_corr_up_b");

            // Heat: the fabrication bay ships WITHOUT a radiator (RoomOutfitter.Fabrication
            // lays only the fabricator + a light). The 2-crew Perilune never runs the fab shop
            // (its crew are HoldPosition and never craft), so it never overheats. Eight working
            // crew DO craft — the dig→regolith→recycle→fabricate loop keeps the fabricator
            // powered, and its 2.5 kW waste heat cooks the sealed bay to ~55 °C (heat-stroke
            // country) with nothing to reject it. A single radiator on an open fab-room floor
            // tile (a conduit tray is already beneath it) holds the bay in the safe band. This
            // is the M2 death that authoring — not a global .def change — has to solve.
            Dev(plan, DeviceKind.Radiator, 25, 6, 0, "radiator_fab");

            // Air, lower deck: OPEN the life-support vent. The upper deck holds 101.3 kPa
            // indefinitely because its recirculator pair runs from tick 0; the lower deck's
            // vent_ls ships closed, so that deck merely coasts (96.1 kPa after three unattended
            // days, measured) and every tile the crew clear out of the aft collapse is new
            // volume the coasting deck has to fill — the full 48-tile dig settles it at 82.7 kPa,
            // thin enough to fail the M2 life-support band. Running the vent (through the open
            // door_ls into the corridor spine) holds the deck at nominal instead.
            //   NOT a new device, deliberately: entity ids are handed out in plan order and
            //   citizens come after devices, so ONE extra DeviceSpec shifts every citizen id by
            //   one — and the portrait pipeline keys on pk_fnv1a32(seed, citizenId). A new vent
            //   would silently hand all eight crew each other's committed portraits. Flipping an
            //   authored device's state (like SetTankLiters above) costs nothing.
            SetDeviceOpen(plan, "vent_ls", true);

            // Build material: the slice stocks its walls in stacks of TWO — wall_material is 2,
            // so one stack is one hauler trip is one finished wall. (The 2-crew ship's two
            // single units came across with the envelope; a lone unit strands a site at 1/2
            // until a second trip arrives.) Six stacks = twelve units = six walls, enough to
            // seal a compartment or hang doors the moment the player designates, without
            // waiting on the aft dig. They ride the two authored Regolith tiles (proven open
            // storage floor) — no coordinate guessing.
            AddRegolithAtStores(plan, stacksPerTile: 3, unitsPerStack: 2);

            // ------------------------------------------------ water: the ice chain (E0-7)
            // The MSV Perilune is a GDD-canonical ice-and-concentrate hauler, and until now that
            // was fiction with no mechanism behind it. Two authored facts turn it into the ship's
            // water supply, and BOTH are needed:
            //   * an ICE MELTER on the hydroponics fluid loop. It has to be THAT loop and not the
            //     potable one: the hydro bay is where the water actually dies (irrigation returns
            //     0.8 x 0.93 = 0.744, so ~1,327 L/day of the slice's water is destroyed there and
            //     `tank_hydro` read 0.0 L from day 1.2 before B-2's stand-in propped it up).
            //   * ICE in the forward hold, on deck 0, a LADDER CLIMB away from the melter. The
            //     distance is the feature, not an oversight: this is the durable recurring haul
            //     source E0's charter asks for, and it is the training-wheels version of the comet
            //     loop — the same haul/melt/store cycle with the drill left out (ECONOMY.md §9.6).
            //
            // ⚠ THE MELTER IS THE FIRST DEVICE ADDED TO THE SLICE SINCE THE PORTRAITS WERE BAKED.
            // Entity ids are handed out in plan order and citizens come after devices, so this ONE
            // DeviceSpec shifts every citizen id by one, and the portrait pipeline keys on
            // pk_fnv1a32(seed, citizenId) (see the vent note above, which declines to add a device
            // for exactly this reason). It is paid for in the same commit: client/assets/
            // portraits.g.js gains the eight new keys pointing at the SAME PNGs, so every crew
            // member keeps their own face, and SlicePortraitKeysResolveTests pins that they do.
            AddIceMelterOnHydroLoop(plan);
            AddIceAtTheForwardHold(plan, stacksPerTile: 50, unitsPerStack: 8);
        }

        private const string HoldIceLabel = "forward hold ice";

        /// <summary>
        /// Put the melter ON a hydroponics pipe tile. Utility overlays share tiles freely (the
        /// conduit tray under every corridor tile is the same trick), and standing on the pipe is
        /// what guarantees <c>WaterSystem</c> attaches it to the hydro network — there is no
        /// coordinate to guess and no way for a later geometry change to leave it unplumbed
        /// somewhere it merely LOOKS connected.
        ///
        /// The first <c>pipe_h*</c> in plan order, deterministically. Authoring error if the hydro
        /// bay has no pipe run: that would mean the melter is silently inert, which is the one
        /// failure mode this whole package must not ship (an unplumbed melter fills its buffer and
        /// stops, saying nothing).
        /// </summary>
        private static void AddIceMelterOnHydroLoop(ShipPlan plan)
        {
            for (int i = 0; i < plan.Devices.Count; i++)
            {
                if (plan.Devices[i].Kind != DeviceKind.Pipe) continue;
                if (!plan.Devices[i].Name.StartsWith("pipe_h", StringComparison.Ordinal)) continue;
                Dev(plan, DeviceKind.IceMelter, plan.Devices[i].Pos.X, plan.Devices[i].Pos.Y,
                    plan.Devices[i].Pos.Z, "melter_hydro");
                return;
            }
            throw new InvalidOperationException(
                "AddIceMelterOnHydroLoop found no hydroponics pipe run — the melter would be " +
                "unplumbed, which is silently inert rather than loudly broken.");
        }

        /// <summary>
        /// Stack the hold's ice on the tiles that already hold authored cargo — proven open storage
        /// floor, the same "no coordinate guessing" rule <see cref="AddRegolithAtStores"/> follows.
        /// SINGLE-SHOT and order-sensitive by construction: the source tiles are gathered BEFORE
        /// anything is appended, so a second call is an authoring error rather than a quietly
        /// doubled hold.
        ///
        /// SIZING, MEASURED rather than reasoned, RE-MEASURED after review moved the number by half,
        /// and RE-MEASURED AGAIN ON THE E0-6 x E0-7 MERGED TREE — the figures below are the merged
        /// ones, because the numbers this comment carried were taken on `lane/e0-7-ice` and moved
        /// when E0-6's bills landed underneath them (they said 1,376 left at day 3 and ~75/day).
        ///
        /// Merged, `--ship slice`, seed 20260721, n = 1: 4 tiles x 50 stacks x 8 units = 1,600 units
        /// at boot; 1,382 left at day 3 and 888 at day 10, i.e. 72.7 units/day over three days and
        /// 71.2 over ten. The burn is that high because the hydro loop destroys roughly 0.256 L per
        /// litre irrigated and irrigation is per-SECOND until ECONOMY.md §10's per-crop retune lands
        /// in E1. So 1,600 units is about TWENTY-TWO AND A HALF sim-days (1,600 / 71.2) — call it
        /// 7x the standard 3-day measurement window.
        ///
        /// ⚠ THE FIRST DRAFT OF THIS COMMENT SAID FOURTEEN, and that was not a rounding error: the
        /// melter ran BEFORE the reclaimer, so finite hauled ice was claiming tank headroom ahead of
        /// free recycled greywater and the hold drained a third faster than it had to. Ordering is a
        /// priority decision (WaterSystem.RunMelters). Read any runway figure as a property of that
        /// ordering and of the uncapped greywater pool, not of the ice economy alone.
        ///
        /// That margin is the point: a faucet that empties inside the window is a boot window
        /// wearing a faucet's costume, the exact failure ECONOMY-PLAN §7.7 names. It is still
        /// FINITE, which is also the point — the hold runs out, and going to get more is E3's
        /// comet run. Nothing here is sized against ECONOMY.md §10's designed 36.6 L/day: that
        /// number assumes the E1 irrigation retune, and the two rates differ by ~35x, so a hold
        /// sized for the design would be empty before the first sim-day was out.
        /// </summary>
        private static void AddIceAtTheForwardHold(ShipPlan plan, int stacksPerTile, int unitsPerStack)
        {
            var hold = new List<Int3>(4);
            for (int i = 0; i < plan.Items.Count; i++)
            {
                if (plan.Items[i].Label == HoldIceLabel)
                    throw new InvalidOperationException("AddIceAtTheForwardHold is single-shot — the hold is already stocked.");
                var kind = plan.Items[i].Kind;
                if (kind != ItemKind.Regolith && kind != ItemKind.Potato && kind != ItemKind.Corpse) continue;
                if (!hold.Contains(plan.Items[i].Pos)) hold.Add(plan.Items[i].Pos);
            }
            if (hold.Count == 0)
                throw new InvalidOperationException("AddIceAtTheForwardHold found no authored cargo tile to ride.");

            // Stack the ice one row FORWARD of the cargo it rides, when that tile is open floor.
            // GlyphMapper draws only the TOPMOST stack on a tile, so ice piled onto the rations and
            // onto Ensign Rojas would erase both from the map — a hold that reads as nothing but
            // ice. The offset is checked against the deck raster rather than assumed, and falls
            // back to the cargo tile itself, so a geometry change can never put a stack in a wall.
            for (int i = 0; i < hold.Count; i++)
            {
                var pos = hold[i];
                var forward = new Int3(pos.X, pos.Y - 1, pos.Z);
                if (IsOpenFloor(plan, forward)) pos = forward;
                for (int s = 0; s < stacksPerTile; s++)
                    plan.Items.Add(new ItemSpec { Kind = ItemKind.Ice, Count = unitsPerStack, Pos = pos, Label = HoldIceLabel });
            }
        }

        /// <summary>Is this tile plain open floor in the plan's own raster? (Authoring-time check
        /// against <see cref="ShipPlan.DeckRows"/> — the same source ShipPlanBuilder validates
        /// devices against, so it cannot disagree with the built world.)</summary>
        private static bool IsOpenFloor(ShipPlan plan, Int3 p)
        {
            if (plan.DeckRows == null || p.Z < 0 || p.Z >= plan.DeckRows.Length) return false;
            var rows = plan.DeckRows[p.Z];
            if (p.Y < 0 || p.Y >= rows.Length) return false;
            var row = rows[p.Y];
            return p.X >= 0 && p.X < row.Length && row[p.X] == '.';
        }

        /// <summary>Open/close a named device spec in place (doors, vents — struct-in-list ⇒
        /// mutate by index). Flipping authored state never adds a DeviceSpec, so entity ids
        /// (and with them the portrait keys) stay exactly where they were.</summary>
        private static void SetDeviceOpen(ShipPlan plan, string name, bool open)
        {
            for (int i = 0; i < plan.Devices.Count; i++)
            {
                if (plan.Devices[i].Name != name) continue;
                var d = plan.Devices[i];
                d.IsOpen = open;
                plan.Devices[i] = d;
                return;
            }
        }

        /// <summary>Seed the dig board with every debris tile in an inclusive rect (authoring
        /// error if a tile in it is not debris — ShipPlanBuilder validates at boot).</summary>
        private static void DesignateDebrisRect(ShipPlan plan, int x0, int y0, int x1, int y1, int z)
        {
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                    plan.DigDesignations.Add(new Int3(x, y, z));
        }

        private const string BuildStockLabel = "slice build stock";

        /// <summary>Add build material on top of every authored Regolith stack (tiles already
        /// proven to be open storage floor) — the slice's opening wall budget. SINGLE-SHOT and
        /// order-sensitive by construction: it reads the plan's Regolith tiles and appends to
        /// the same list, so the source positions are gathered first (never a count snapshot
        /// that silently depends on where in the authoring sequence the call sits), and a
        /// second call is an authoring error rather than a quietly doubled stock.</summary>
        private static void AddRegolithAtStores(ShipPlan plan, int stacksPerTile, int unitsPerStack)
        {
            var stores = new List<Int3>(4);
            for (int i = 0; i < plan.Items.Count; i++)
            {
                if (plan.Items[i].Label == BuildStockLabel)
                    throw new InvalidOperationException("AddRegolithAtStores is single-shot — the slice's build stock is already seeded.");
                if (plan.Items[i].Kind == ItemKind.Regolith) stores.Add(plan.Items[i].Pos);
            }
            for (int i = 0; i < stores.Count; i++)
                for (int s = 0; s < stacksPerTile; s++)
                    plan.Items.Add(new ItemSpec { Kind = ItemKind.Regolith, Count = unitsPerStack, Pos = stores[i], Label = BuildStockLabel });
        }

        /// <summary>Set a named tank's StoredLiters in place (struct-in-list ⇒ mutate by index).</summary>
        private static void SetTankLiters(ShipPlan plan, string name, float liters)
        {
            for (int i = 0; i < plan.Devices.Count; i++)
            {
                if (plan.Devices[i].Name != name) continue;
                var d = plan.Devices[i];
                d.StoredLiters = liters;
                plan.Devices[i] = d;
                return;
            }
        }

        /// <summary>Add a potato stack co-located with the authored emergency rations (a tile
        /// already proven to be open storage floor) — no coordinate guessing.</summary>
        private static void AddPotatoesAtRations(ShipPlan plan, int extra)
        {
            for (int i = 0; i < plan.Items.Count; i++)
            {
                if (plan.Items[i].Kind != ItemKind.Potato) continue;
                var pos = plan.Items[i].Pos;
                plan.Items.Add(new ItemSpec { Kind = ItemKind.Potato, Count = extra, Pos = pos, Label = "slice pantry" });
                return;
            }
        }

        // ------------------------------------------------------- slice crew personas

        /// <summary>The eight authored slice personas, in the same order as PeriluneSlice()'s
        /// crew — name-matched onto the built citizens at boot. Every secret is backed by a
        /// real fact; every relationship is a directed opinion seeded into the social graph.
        /// Pure authored data (no sim, no RNG): the hosts consume it through PopulateSlice().</summary>
        public static AuthoredPersona[] SliceCrew()
        {
            return new[]
            {
                new AuthoredPersona
                {
                    Name = "Amara Okonkwo", RolePreRaid = "hydroponics engineer", RoleNow = "life-support lead",
                    Traits = new[] { "meticulous", "gentle", "unbending" },
                    Values = new[] { "no one eats alone", "never waste air" },
                    Fears = new[] { "the water running out", "sealed hatches with someone behind them" },
                    SpeechStyle = "quiet, chooses words like spare parts",
                    RaidBackstory =
                        "Amara ran the grow bays when the Lien boarded, and she kept the irrigation loop alive by " +
                        "hand while the pressure alarms screamed. She got three seedling trays sealed before the " +
                        "aft section vented. She has not slept a full night since.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "I hid a week of seed stock and dried rations off the manifest before the raid — nobody logged it.",
                            FactText = "Amara Okonkwo cached seed stock and dried rations behind the hydroponics bay, unlogged, before the raid.",
                            FactMarker = new Int3(60, 3, 0), RevealDifficulty = 0.55f,
                        },
                    },
                    Relationships = new[]
                    {
                        new AuthoredRelationship { Toward = "Nadia Hassan",   Opinion = 65f, Note = "closest friend aboard; they keep each other standing" },
                        new AuthoredRelationship { Toward = "Priya Raghavan", Opinion = 40f, Note = "her apprentice — she is teaching Priya the loops" },
                    },
                },
                new AuthoredPersona
                {
                    Name = "Priya Raghavan", RolePreRaid = "botanist", RoleNow = "hydroponics apprentice",
                    Traits = new[] { "restless", "garrulous", "devout" },
                    Values = new[] { "protect the young ones", "finish what you seal" },
                    Fears = new[] { "being forgotten out here", "the dark between airlocks" },
                    SpeechStyle = "rapid-fire, jokes when nervous",
                    RaidBackstory =
                        "Priya was two months into her apprenticeship under Amara when the raiders came. She hid in a " +
                        "service tray under the grow deck and listened to boots on the plating for an hour. She came " +
                        "out convinced she owes the crew a life.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "I froze in the tray and never opened the hatch for someone pounding on it. I don't know if they got out.",
                            FactText = "During the raid Priya Raghavan stayed hidden and did not open a hatch for someone trapped on the other side.",
                            RevealDifficulty = 0.7f,
                        },
                    },
                    Relationships = new[]
                    {
                        new AuthoredRelationship { Toward = "Amara Okonkwo", Opinion = 62f, Note = "her mentor; she would follow Amara into vacuum" },
                        new AuthoredRelationship { Toward = "Grace Oyelaran", Opinion = 30f, Note = "bunk-side friend" },
                    },
                },
                new AuthoredPersona
                {
                    Name = "Dmitri Volkov", RolePreRaid = "reactor technician", RoleNow = "reactor watch",
                    Traits = new[] { "stoic", "sardonic", "haunted" },
                    Values = new[] { "the ship comes first", "keep the ledger balanced" },
                    Fears = new[] { "the reactor going quiet", "dying in vacuum" },
                    SpeechStyle = "short sentences, technical jargon, avoids eye contact",
                    RaidBackstory =
                        "Dmitri held the reactor at idle through the boarding so the Lien could not scram it and take the " +
                        "ship dark. He watched the escape pods leave without him from the reactor blister. He has not " +
                        "forgiven the ones who ran.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "I launched an escape pod empty during the raid — to make the Lien think we had already fled.",
                            FactText = "Dmitri Volkov launched one of the escape pods empty during the raid as a decoy.",
                            RevealDifficulty = 0.6f,
                        },
                    },
                    Relationships = new[]
                    {
                        new AuthoredRelationship { Toward = "Salif Camara",   Opinion = -40f, Note = "blames Salif's welds for the aft breach; they snipe constantly" },
                        new AuthoredRelationship { Toward = "Tomas Ferreira", Opinion = 40f, Note = "the one man he trusts on the bridge" },
                    },
                },
                new AuthoredPersona
                {
                    Name = "Salif Camara", RolePreRaid = "hull welder", RoleNow = "damage control",
                    Traits = new[] { "wry", "superstitious", "unbending" },
                    Values = new[] { "finish what you seal", "loyalty above rules" },
                    Fears = new[] { "the Lien returning", "sleeping through an alarm" },
                    SpeechStyle = "clipped deck-slang, softens around food",
                    RaidBackstory =
                        "Salif welded the forward bulkhead shut under fire to buy the bridge crew ten minutes. The seam " +
                        "held; the deck behind it did not. Dmitri has never let him forget which welds failed.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "The aft seam that failed — I knew it was under-spec when I passed it. We had no time and no rod.",
                            FactText = "Salif Camara signed off the aft bulkhead seam knowing it was under-specification before it failed in the raid.",
                            FactMarker = new Int3(58, 9, 0), RevealDifficulty = 0.65f,
                        },
                    },
                    Relationships = new[]
                    {
                        new AuthoredRelationship { Toward = "Dmitri Volkov", Opinion = -40f, Note = "the reactor tech who blames him for the breach" },
                        // CONCEALED bond (dashed on the relations web): a life-debt Salif never
                        // advertises while Dmitri publicly blames him for the breach. Grounded in
                        // his own note ("he owes her") and Nadia's ("keeps their secrets").
                        new AuthoredRelationship { Toward = "Nadia Hassan",  Opinion = 25f, Note = "she stitched his burns; he owes her", Secret = true },
                    },
                },
                new AuthoredPersona
                {
                    Name = "Nadia Hassan", RolePreRaid = "medtech", RoleNow = "ship's medic",
                    Traits = new[] { "gentle", "stoic", "meticulous" },
                    Values = new[] { "protect the young ones", "truth even when it stings" },
                    Fears = new[] { "sealed hatches with someone behind them", "being forgotten out here" },
                    SpeechStyle = "slow and formal, old freighter courtesies",
                    RaidBackstory =
                        "Nadia triaged the wounded in the mess while the fighting moved aft. She lost two on the table and " +
                        "saved five. She keeps the crew standing now, and she keeps their secrets.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "One of the raid dead was still breathing when I called it. I couldn't save them and I needed the table.",
                            FactText = "Nadia Hassan declared a raid casualty dead while they were still alive, to free the surgical table.",
                            RevealDifficulty = 0.75f,
                        },
                    },
                    Relationships = new[]
                    {
                        new AuthoredRelationship { Toward = "Amara Okonkwo", Opinion = 65f, Note = "her closest friend; the two of them hold the ship's morale" },
                        // The other side of the concealed bond above — Nadia, the keeper of the
                        // crew's secrets, quietly fond of the man who owes her a life.
                        new AuthoredRelationship { Toward = "Salif Camara",  Opinion = 32f, Note = "her most frequent patient; fond of him", Secret = true },
                    },
                },
                new AuthoredPersona
                {
                    Name = "Tomas Ferreira", RolePreRaid = "navigator", RoleNow = "helm watch",
                    Traits = new[] { "wry", "restless", "cowardly" },
                    Values = new[] { "keep the ledger balanced", "the ship comes first" },
                    Fears = new[] { "the Lien returning", "the dark between airlocks" },
                    SpeechStyle = "long pauses, then everything at once",
                    RaidBackstory =
                        "Tomas plotted the drift that hid the Perilune in the debris field after the raiders left. It is the " +
                        "only reason they were not caught. He has been jittery at the helm ever since.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "The navigation core the Lien took — I gave them the access key to save my own skin.",
                            FactText = "Tomas Ferreira surrendered the navigation-core access key to the Lien boarding party under threat.",
                            RevealDifficulty = 0.8f,
                        },
                    },
                    Relationships = new[]
                    {
                        new AuthoredRelationship { Toward = "Dmitri Volkov", Opinion = 40f, Note = "the reactor watch he stands beside" },
                        new AuthoredRelationship { Toward = "Wei Chen",      Opinion = 38f, Note = "shares the long quiet watches with Wei" },
                    },
                },
                new AuthoredPersona
                {
                    Name = "Grace Oyelaran", RolePreRaid = "quartermaster", RoleNow = "stores & logistics",
                    Traits = new[] { "garrulous", "meticulous", "devout" },
                    Values = new[] { "keep the ledger balanced", "no one eats alone" },
                    Fears = new[] { "the water running out", "the reactor going quiet" },
                    SpeechStyle = "clipped deck-slang, softens around food",
                    RaidBackstory =
                        "Grace was counting the last of the seed stock when the lights went red. She dragged two crates of " +
                        "rations through smoke to the mess before the corridor sealed. The ship eats today because of her.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "The cargo-two manifest was falsified before we ever left port. I signed it because I was told to.",
                            FactText = "The manifest for cargo hold two was falsified before the Perilune left port, and Grace Oyelaran signed it knowingly.",
                            RevealDifficulty = 0.6f,
                        },
                    },
                    Relationships = new[]
                    {
                        new AuthoredRelationship { Toward = "Wei Chen",       Opinion = 35f, Note = "her closest friend on the crew" },
                        new AuthoredRelationship { Toward = "Priya Raghavan", Opinion = 30f, Note = "looks out for the youngest aboard" },
                    },
                },
                new AuthoredPersona
                {
                    Name = "Wei Chen", RolePreRaid = "comms officer", RoleNow = "comms & sensors",
                    Traits = new[] { "sardonic", "superstitious", "restless" },
                    Values = new[] { "truth even when it stings", "loyalty above rules" },
                    Fears = new[] { "being forgotten out here", "the Lien returning" },
                    SpeechStyle = "rapid-fire, jokes when nervous",
                    RaidBackstory =
                        "Wei kept the distress loop running on a dead battery long after anyone could hear it. No one ever " +
                        "answered. He still checks the band every watch, out of habit or hope.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "I heard a Lien boarding-captain's voice on our own channel during the raid. Someone aboard was talking to them.",
                            FactText = "During the raid Wei Chen intercepted a Lien boarding captain communicating with someone aboard the Perilune on a crew channel.",
                            RevealDifficulty = 0.85f,
                        },
                    },
                    Relationships = new[]
                    {
                        new AuthoredRelationship { Toward = "Grace Oyelaran", Opinion = 35f, Note = "his closest friend on the crew" },
                        new AuthoredRelationship { Toward = "Tomas Ferreira", Opinion = 38f, Note = "the navigator he shares watches with" },
                    },
                },
            };
        }

        /// <summary>
        /// Finish the slice boot: build the authored minds (personas + fact-backed secrets)
        /// for every citizen by name, seed the relationship web into the social graph, and
        /// prime the greywater reserve. The hosts (and the golden test) call this once, right
        /// after <see cref="ShipPlanBuilder"/> builds the sim and before the first tick, so the
        /// slice always boots identically. Minds are host-owned (unhashed); the seeded opinions
        /// are canonical sim state and ride StateHash deterministically. RNG-free.
        /// </summary>
        public static void PopulateSlice(Simulation sim, MindState minds, FactRegistry facts, SocialSystem social)
        {
            var crew = SliceCrew();

            // 1. Minds, matched to citizens by name.
            for (int i = 0; i < crew.Length; i++)
            {
                var citizen = FindCitizen(sim, crew[i].Name);
                if (citizen == null) continue; // a plan/roster mismatch is a no-op, never a throw
                PersonaGenerator.CreateAuthoredMind(sim, minds, facts, citizen, crew[i]);
            }

            // 2. Relationship web, seeded deterministically into the social graph (before the
            //    first pass classifies the tiers). Notes also land on the persona sheet.
            var defs = sim.Defs.Social;
            for (int i = 0; i < crew.Length; i++)
            {
                var from = FindCitizen(sim, crew[i].Name);
                if (from == null) continue;
                var rels = crew[i].Relationships ?? System.Array.Empty<AuthoredRelationship>();
                for (int r = 0; r < rels.Length; r++)
                {
                    var to = FindCitizen(sim, rels[r].Toward);
                    if (to == null || to.Id == from.Id) continue;
                    social?.Nudge(from.Id, to.Id, rels[r].Opinion, defs);
                    if (minds.Minds.TryGet(from.Id, out var mind) && mind.Persona != null)
                    {
                        // Note + secret land on the persona (host-owned, unhashed); the Opinion
                        // above is the only thing that touches the SOCL fold / StateHash.
                        if (!string.IsNullOrEmpty(rels[r].Note)) mind.Persona.RelationshipNotes[to.Id] = rels[r].Note;
                        if (rels[r].Secret) mind.Persona.RelationshipSecrets.Add(to.Id);
                    }
                }
            }

            // 3. Greywater buffer: the reclaimer needs a pool to cycle. Seeded here because
            //    ShipPlan has no wastewater field (matches ScenarioRunner's approach).
            sim.WastewaterLiters += 400f;
        }

        private static Citizen FindCitizen(Simulation sim, string name)
        {
            var items = sim.Citizens.Items;
            for (int i = 0; i < items.Count; i++)
                if (items[i].Name == name) return items[i];
            return null;
        }

        // =====================================================================
        // Grid ship — PeriluneGrid()  (--ship grid)
        // =====================================================================
        // A multi-deck ship laid out on a clean 8-slot-per-deck lattice (a 2×4 grid of
        // uniform compartments around a central horizontal spine corridor), carved by
        // SlotGridPlanner. Distinct from Perilune()/PeriluneSlice() in every respect —
        // its own seed, its own 45×18×8 envelope, its own method — so it perturbs none
        // of their pinned hashes or portrait keys. Purpose: give the warm SVG Overview/
        // Room-Zoom a real slot-grid ship to drive.
        //
        // ALL eight decks are present from boot. Two are furnished (deck 0 fully, deck 1
        // partly); the rest are 8-slot grids of EMPTY HALLS — real compartments (floor +
        // walls + a door) the player builds out, not void. Empty halls boot sealed and
        // airless; the furnished decks' rooms + spines boot pressurised.
        //
        // WP-1 (console retirement) made it a GAME rather than a sandbox, because it is now the
        // ONE standard play ship. Three things landed together and each is load-bearing:
        //   * THE WRECK. Three deck-1 halls boot as a hull-side collapse (GridWreckSlots), so
        //     DesignateDigCommand finally has legal targets aboard this ship — it refuses any
        //     tile whose wall is not TileDefs.Debris (Commands.cs:116), and before WP-1 the grid
        //     ship had none, making DIG a guaranteed silent no-op on the ship the player plays.
        //   * A GOAL. ClearAllDebris over that wreck — the ship had no goal at all.
        //   * EIGHT CREW, all workable, up from three (two workable). Eight is the slice's
        //     number and the number the deck-0 loops are sized for.
        // The wreck is authored so it is CLEARABLE, not merely present: every debris tile sits
        // in a compartment that is (or can be) pressurised and reachable — see the ⚠️ note on
        // GridWreckSlots. Debris in the airless decks 2..7 would have looked identical in a
        // screenshot and been undiggable in play.
        //
        // The crew are AutoWander=TRUE (2026-07-25), and they can be because the WANDER SAMPLER is now
        // deck-confined. Read the two halves together — the flag alone was never safe on this ship.
        //
        //   WHY THEY WERE FALSE. PathService.TryRandomWalkableTileNear used to box Z along with X and
        //   Y, and the default wander_radius_tiles (8) is >= this ship's depth (GridDepth = 8) — so the
        //   box saturated every deck and a SINGLE idle draw could land a crew member in any of the six
        //   VACUUM spines the ladder trunk makes walkable from tick 0.
        //
        //   WHAT THAT ACTUALLY COST — measured, one sim-day, `occupancy --ship grid --days 1`, and NOT
        //   the "death sentence" this note used to claim. With AutoWander=true and the OLD unbounded
        //   sampler: 8/8 alive, work 24.990 % against 24.938 % shipped — survivable — but 4.46 % of all
        //   crew-ticks went to JobKind.Flee, crew walking out of vacuum for nothing on the ship a new
        //   player is watching. The argument was WASTE, not lethality, and it is the weaker, honest one.
        //
        //   WHAT CHANGED. The sampler pins Z to the origin's own deck (a literal, not a def field: idle
        //   crew do not climb ladders for nothing). Same run with both halves in place: Flee 0.00 %,
        //   8/8 alive, work 24.990 %, idle None 67.19 % -> 67.15 %. The X/Y box is untouched, so local
        //   dispersal is exactly what it was.
        //
        // What AutoWander bought the slice — desynchronising eight crew so they never crowd one small
        // room into hypoxia — this ship gets from its geometry anyway: deck 0's eight room doors all
        // boot OPEN, so the deck is one ~570-tile air mass and no single room can be breathed down
        // (75 h of eight-crew O2 draw in the mess alone, before any flow from next door). Wander here
        // buys LIFE ON SCREEN, not safety.
        //
        // ⚠️ Deck confinement is the sampler's, not this ship's. A crew member who takes a JOB on
        // another deck still walks the ladder and then wanders THAT deck while idle — deck 1 (the
        // wreck) is pressurised, so that is fine here. It is the idle draw, not the crew member, that
        // is bounded.

        /// <summary>The grid ship's own seed — a DISTINCT identity from Perilune (20260718)
        /// and the slice (20260721).</summary>
        public const ulong GridSeed = 20260723UL;

        public const int GridWidth = SlotGridPlanner.Width;   // 45
        public const int GridHeight = SlotGridPlanner.Height; // 18
        public const int GridDepth = 8;

        /// <summary>The deck the wreck sits on: deck 1, the ship's other PRESSURISED, powered,
        /// ladder-connected deck. Not decks 2..7 — those boot airless behind closed doors, so
        /// debris there would be undiggable (crew flee unbreathable air, SafetySystem/JobKind.Flee)
        /// and would make the ClearAllDebris goal permanently unreachable.</summary>
        public const int GridWreckDeck = 1;

        /// <summary>Interior rows of a wrecked slot that collapse, counted from the HULL side
        /// inward. Two of the six leaves the door apron, the room's centre probe tile and the
        /// four rows nearest the spine as clear floor.</summary>
        public const int GridWreckRows = 2;

        /// <summary>The deck-1 hall slots that boot WRECKED.
        ///
        /// ⚠️ Slot 3 is deliberately absent and must stay absent. Deck 0 is fully furnished, so
        /// deck 1 slot 3 is the FIRST RoomType.None entry in plan.SlotGrid — the ship's one carved,
        /// sealed, AIRLESS, debris-free compartment, and the fixture the PRESSURE-FRONTIER tests run
        /// on (GridWreckTests: TheEmptyHallSlot_StaysSealedAirlessAndDebrisFree, and the pair that
        /// measure it filling through an opened door / never filling through a shut one). Debris on
        /// its probe tile, air in the compartment, or an opened door would each break "air is
        /// earned" and those tests. (Pre-M1-L-b this slot was described as ＋ADD ROOM's
        /// demonstration slot; that verb is deleted — every compartment IS a room, OD-K.)</summary>
        private static readonly int[] GridWreckSlots = { 5, 6, 7 };

        /// <summary>The one wreck the crew are ALREADY cutting into: its door boots open, its
        /// compartment boots pressurised and its debris boots DESIGNATED, so the dig loop is live
        /// on the standard play ship from tick 0 with no player input and no harness flag — the
        /// grid ship's analogue of the slice's opened door_aft + designated aft field.
        ///
        /// ⚠️ IT IS A TYPED ROOM, NOT A HALL, AND THAT IS A CLIENT CONTRACT. The Overview labels a
        /// slot <c>roomLabel(roomType) || anchorName</c> (<c>client/src/ui/decks-model.js</c>,
        /// <c>deckSlotView</c>), so left as <c>RoomType.None</c> (this package's first draft) it
        /// rendered as a room LABELLED WITH ITS INTERNAL ANCHOR ID — "hall_d1_s6" — in an
        /// UPPERCASE-label UI. A typed slot has a real label and boots its door OPEN by construction
        /// (<c>SlotGridPlanner.Carve</c>: <c>IsOpen = !empty</c>).
        /// ⚠️ TWO CLAUSES OF THIS PARAGRAPH HAVE BEEN RETRACTED, in two different packages, and the
        /// retractions are kept because each was load-bearing when written. W4b struck *"and could
        /// never be commissioned out of that state either, because AddRoomCommand returns early on
        /// TotalMoles &gt; 0"* — the rejection predicate had moved from gas to the anchor's type.
        /// M1-L then struck *"a TYPED slot reads OCCUPIED … no ＋ADD ROOM chip"*: occupancy is
        /// GEOMETRY now and EVERY carved compartment reads occupied, typed or not, so the label is
        /// the only thing a type still buys. M1-L-b deleted the verb, the command and the enum
        /// member outright (OD-K), so there is no chip and no allocation anywhere to reason about.
        ///
        /// The other two wrecks boot as every other empty hall does (RoomType.None, door closed,
        /// airless, undesignated): they are the player's own work. The route is OPEN THE DOOR, wait
        /// for deck 1's spine vent to fill the compartment through it, then paint DIG. The
        /// ClearAllDebris goal needs all three wrecks, so it cannot be completed without the player
        /// opening a door.</summary>
        public const int GridOpenWreckSlot = 6;

        /// <summary>The live wreck's anchor + type: the collapsed aft hold. <c>Storage</c> is
        /// deliberate — <see cref="RoomDresser"/> furnishes only Quarters/Mess/Commons/Command/
        /// Observatory/Medbay/Bridge, so a Storage room takes NO furniture and the compartment reads
        /// as what it is: an emptied hold with the deckhead down in it. The anchor is "hold" and not
        /// "storage" because deck 0 already owns that name — anchors are the MOSS namespace and must
        /// be unique — and it must not be of the internal <c>hall_dN_sM</c> form, which is what the
        /// client would print at the player.</summary>
        public const string GridOpenWreckAnchor = "hold";
        public const RoomType GridOpenWreckType = RoomType.Storage;

        public static ShipPlan PeriluneGrid()
        {
            var plan = new ShipPlan { Name = "MSV Perilune (grid)", Seed = GridSeed };

            // Deck 0 — fully furnished: all eight room types the player starts with.
            var deck0 = new[]
            {
                Slot(RoomType.Quarters,    "quarters"),
                Slot(RoomType.Mess,        "mess"),
                Slot(RoomType.Medbay,      "medbay"),
                Slot(RoomType.Hydro,       "hydro"),
                Slot(RoomType.Reactor,     "reactor"),
                Slot(RoomType.LifeSupport, "lifesupport"),
                Slot(RoomType.Workshop,    "workshop"),
                Slot(RoomType.Storage,     "storage"),
            };
            // Deck 1 — partly furnished: four typed rooms interleaved with four empty halls.
            var deck1 = new[]
            {
                Slot(RoomType.Command,     "command"),
                Slot(RoomType.Commons,     "commons"),
                Slot(RoomType.Engineering, "engineering"),
                Hall(1, 3),
                Slot(RoomType.Fabrication, "fabrication"),
                Hall(1, 5),
                Slot(GridOpenWreckType, GridOpenWreckAnchor),  // slot 6 — the live wreck (GridOpenWreckSlot)
                Hall(1, 7),
            };

            var canvases = new GridCanvas[GridDepth];
            var rects = new System.Collections.Generic.Dictionary<string, BandPlanner.Rect>[GridDepth];
            for (int z = 0; z < GridDepth; z++)
            {
                var canvas = new GridCanvas(GridWidth, GridHeight, '#');
                var slots = z == 0 ? deck0 : z == 1 ? deck1 : EmptyDeck(z);
                rects[z] = SlotGridPlanner.Carve(canvas, plan, z, slots, $"grid_spine_{z}");
                canvases[z] = canvas;
            }

            // ----------------------------------------------------------- the wreck
            // Collapse the hull-side rows of the three free deck-1 halls. This must happen HERE:
            // after Carve (which lays the floor those rows are cut back out of) and before both
            // ToRows() — DeckRows is a one-shot snapshot of the canvas, so a later edit is silently
            // ignored — and AddConduits, which only trays '.' tiles. Trays under the rubble are
            // therefore gone with it: a dug-out tile is bare floor until the player runs conduit to
            // it, which is the honest reading of a collapse and costs the cleared compartment
            // nothing else (its four clear rows keep their trays, connected through the door tile).
            var wrecks = new Dictionary<int, List<Int3>>(GridWreckSlots.Length);
            foreach (int slot in GridWreckSlots)
                wrecks[slot] = WreckFillBottomSlot(canvases[GridWreckDeck], GridWreckDeck, slot, GridWreckRows);

            plan.DeckRows = new string[GridDepth][];
            for (int z = 0; z < GridDepth; z++) plan.DeckRows[z] = canvases[z].ToRows();

            // ---------------------------------------------------------------- power
            // Full conduit trays on the two active decks; vertical adjacency turns every
            // shared column into a riser, so the deck-0 reactor feeds deck 1's machines.
            AddConduits(plan, canvases[0], 0);
            AddConduits(plan, canvases[1], 1);

            // ----------------------------------------------------- room outfitting
            RoomOutfitter.Reactor(plan, rects[0]["reactor"], 0);
            RoomOutfitter.LifeSupport(plan, rects[0]["lifesupport"], 0);
            RoomOutfitter.Hydro(plan, rects[0]["hydro"], 0);
            RoomOutfitter.Mess(plan, rects[0]["mess"], 0);
            RoomOutfitter.Light(plan, rects[0]["quarters"], 0, "light_quarters");
            RoomOutfitter.Light(plan, rects[0]["medbay"], 0, "light_medbay");
            RoomOutfitter.Light(plan, rects[0]["workshop"], 0, "light_workshop");
            RoomOutfitter.Light(plan, rects[0]["storage"], 0, "light_storage");

            RoomOutfitter.Engineering(plan, rects[1]["engineering"], 1);
            RoomOutfitter.Fabrication(plan, rects[1]["fabrication"], 1);
            RoomOutfitter.Light(plan, rects[1]["command"], 1, "light_command");
            RoomOutfitter.Light(plan, rects[1]["commons"], 1, "light_commons");

            // Spine life support + lights on the two active decks. The crew stand in the
            // deck-0 spine, a large air mass (spine + eight open-door rooms) with grow-bed
            // O2 and a corridor scrubber.
            Dev(plan, DeviceKind.Scrubber, 3, SlotGridPlanner.SpineY0, 0, "scrubber_spine_0");
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(4, SlotGridPlanner.SpineY0, 0), Name = "vent_spine_0", IsOpen = true });
            Dev(plan, DeviceKind.Light, 20, SlotGridPlanner.SpineY1, 0, "light_spine_0");
            Dev(plan, DeviceKind.Light, 20, SlotGridPlanner.SpineY1, 1, "light_spine_1");

            // Deck 1's OWN life-support pair (WP-1). Before the wreck, deck 1 held no crew and
            // needed neither; now it is where the work is, and it also GAINS VOLUME as the crew
            // clear the collapse (each dug tile is one more tile of room to fill, ~2.5 m³). Two
            // devices answer that:
            //   * an OPEN vent, which tops the deck's connected mass back toward
            //     nominal_pressure_kpa as the volume grows (clearing all 60 wreck tiles would
            //     otherwise dilute deck 1 from 101.3 kPa to ~89 kPa — breathable, but drifting);
            //   * three scrubbers, which is the whole eight-crew CO2 load on this deck alone
            //     (3 × scrubber_mol_per_second 0.001 > 8 × co2_per_person_per_second 2.73e-4).
            //     Deck 0 already carries four (spine + hydro + mess + lifesupport), so EITHER
            //     active deck can hold the entire crew, which is the property that matters when work
            //     moves them between decks. Two of the three sit on the spine facing the wrecked
            //     halls' doors, because deck 1 is SIX SEPARATE ROOMS and not one: the scrubbers
            //     stand in the spine while the crew's CO2 is made in the wreck, so the sizing rests
            //     entirely on B-3 partial-pressure diffusion carrying it across the open doors. All
            //     four tiles are spine floor with a conduit tray already under them, and LifeSupport
            //     is the LAST tier shed in a brownout.
            //     THE TREND, NOT THE THRESHOLD, is what they buy and what the test asserts. Narcosis
            //     is ~190 h away (deck 1's connected mass is 366 tiles ≈ 915 m³ ≈ 38,000 mol, and 4 %
            //     of that is ~1,520 mol at 2.18e-3 mol/s), so nothing at a playable horizon can bite
            //     on co2_narcosis_ppm — but the DIRECTION separates inside the hour the full-clear
            //     test already runs: at its tick 55,191 the worst deck-1 room reads 384 ppm and
            //     FALLING below its 500 ppm boot fill with these three, and 792 ppm and RISING
            //     without them (at one sim-day, 9 ppm vs 3,405 ppm). That is the assertion in
            //     Goal_IsCompletable_ByTheAuthoredCrew_ViaOpeningDoorsAndDig, so deleting them fails.
            Dev(plan, DeviceKind.Scrubber, 3, SlotGridPlanner.SpineY0, GridWreckDeck, "scrubber_spine_1");
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(4, SlotGridPlanner.SpineY0, GridWreckDeck), Name = "vent_spine_1", IsOpen = true });
            Dev(plan, DeviceKind.Scrubber, SlotGridPlanner.InteriorRect(5).CenterX, SlotGridPlanner.SpineY1, GridWreckDeck, "scrubber_spine_1b");
            Dev(plan, DeviceKind.Scrubber, SlotGridPlanner.InteriorRect(7).CenterX, SlotGridPlanner.SpineY1, GridWreckDeck, "scrubber_spine_1c");

            // ------------------------------------------------------- ladder trunk
            // One vertical trunk at the spine centre column links all eight decks for
            // pathing (a Ladder at every deck's (LadderX, SpineY0)).
            for (int z = 0; z < GridDepth; z++)
                Dev(plan, DeviceKind.Ladder, SlotGridPlanner.LadderX, SlotGridPlanner.SpineY0, z, $"ladder_d{z}");

            // --------------------------------------------------------- people (8)
            // EIGHT crew, ALL WORKABLE (HoldPosition=false ⇒ IsIdleForWork ⇒ they self-assign
            // dig/haul/build/craft work; E0-1 made an idle crew member recruitable without a
            // player order). Was three, of which one was held: a three-hand ship cannot show what
            // the economy verbs do, and the held hand read in play as "my crew ignores me".
            // Direct control did not go anywhere — an explicit MoveCitizenCommand still moves
            // anyone, and HoldPosition remains the strict-control escape hatch for a player who
            // wants one (E0-1's player-control note).
            //
            // AutoWander=true for all eight, matching the slice — the standard play ship should not
            // read as dead while its crew are idle (and they are idle ~67 % of a sim-day). Safe only
            // because TryRandomWalkableTileNear pins the idle draw to the crew member's own deck; with
            // the old deck-crossing sampler this flag sent them into the six airless decks the ladder
            // trunk makes walkable, at a measured 4.46 % of crew-ticks in JobKind.Flee. See the header
            // note above for the full before/after, and for why the slice's pile-on argument does not
            // transfer to this ship's geometry.
            //
            // They stand along the deck-0 spine — the pressurised, life-supported, food-and-water
            // deck — and walk to work: the wreck is up one ladder at the spine's centre column.
            // Two rows so eight bodies do not read as a queue; every tile is spine floor.
            var crewStarts = new (string Name, int X, int Y)[]
            {
                ("Halloran", 8,  SlotGridPlanner.SpineY0),
                ("Vega",     18, SlotGridPlanner.SpineY0),
                ("Sato",     30, SlotGridPlanner.SpineY0),
                ("Okonjo",   12, SlotGridPlanner.SpineY1),
                ("Novak",    24, SlotGridPlanner.SpineY1),
                ("Adeyemi",  36, SlotGridPlanner.SpineY0),
                ("Kaur",     6,  SlotGridPlanner.SpineY1),
                ("Ito",      40, SlotGridPlanner.SpineY1),
            };
            foreach (var c in crewStarts)
                plan.Citizens.Add(new CitizenSpec { Name = c.Name, Pos = new Int3(c.X, c.Y, 0), AutoWander = true, RevealsFog = true, HoldPosition = false });

            // -------------------------------------------------------- opening stock
            var storage = rects[0]["storage"];
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Potato, Count = 8, Pos = new Int3(storage.X0 + 1, storage.CenterY, 0), Label = "grid rations" });

            // Build material: the grid ship seeds NO diggable regolith (its decks are pre-carved,
            // not a collapse to clear), so its build loop needs an opening regolith stock or every
            // wall/door designation starves at "0 regolith aboard" (wall_material=2, door_material=1).
            // Six stacks of four units = 24 units = twelve walls (or more doors) — enough for the
            // workable pair to build out several rooms before the player has to find more matter.
            // The stacks ride the storage room's back row (y = CenterY-1 = 12, clear of the ration
            // tile at CenterY), all proven open storage floor (interior x34..43, y11..16).
            for (int i = 0; i < 6; i++)
                plan.Items.Add(new ItemSpec { Kind = ItemKind.Regolith, Count = 4, Pos = new Int3(storage.X0 + 1 + i, storage.CenterY - 1, 0), Label = "grid build stock" });

            // ---------------------------------------------------- starting state
            // Pressurise the two active decks (furnished rooms + spine). The empty halls
            // stay vacuum — sealed, unbuilt volume the player pressurises as they build out.
            foreach (var a in new[]
            {
                "quarters", "mess", "medbay", "hydro", "reactor", "lifesupport", "workshop", "storage", "grid_spine_0",
                "command", "commons", "engineering", "fabrication", "grid_spine_1",
            })
                plan.PressurizedAnchors.Add(a);

            // ------------------------------------------------- the live collapse
            // GridOpenWreckSlot is the one wreck the ship boots already working: it is a TYPED,
            // commissioned room, so Carve already booted its door OPEN (asserted, not assumed, in
            // GridWreckTests); it is PRESSURISED here, so the diggers stand in breathable air
            // instead of fleeing it; and its debris is DESIGNATED, because a goal designates nothing
            // (GoalSystem is a pure observer) and DesignateDigCommand has exactly one other caller,
            // the player. Every one of those is needed and any one alone does nothing: the slice
            // learned this with door_aft, where a sealed door left every designated tile unreachable
            // and the board inert. The other two wrecks stay closed, airless and undesignated — the
            // player's work, and the reason the goal cannot complete without it.
            plan.PressurizedAnchors.Add(GridOpenWreckAnchor);
            var liveWreck = wrecks[GridOpenWreckSlot];
            for (int i = 0; i < liveWreck.Count; i++) plan.DigDesignations.Add(liveWreck[i]);

            // ------------------------------------------------------------- goal
            // ONE goal, and ClearAllDebris is the only one of the three kinds that is a GAME on
            // this ship. PressurizeAnchor would read as met the moment it was polled (every anchor
            // this ship boots with air is already at 101.3 kPa, and the ones without air are behind
            // sealed doors with no player verb that pressurises them except ＋ADD ROOM, which
            // pressurises as a side effect of commissioning). ExploreAnchor would either be met by
            // a crew member standing where they already stand, or would point at a vacuum deck the
            // player can only reach by sending someone to suffocate. ClearAllDebris is false at
            // boot (60 debris tiles), true only after the player has opened the two sealed wrecks
            // and painted DIG over them, and its subject is the exact content WP-1 authored.
            plan.Goals.Add(new GoalSpec
            {
                Kind = GoalKind.ClearAllDebris, Param = "",
                Text = "Clear the collapsed compartments",
            });

            // Furnish every typed room by rule (empty halls / corridors are skipped).
            RoomDresser.Dress(plan);

            return plan;
        }

        /// <summary>A typed compartment. <paramref name="doorOpen"/> defaults to <c>null</c> =
        /// "say nothing", which lets <see cref="SlotGridPlanner"/> derive the door from the type
        /// exactly as it always has; pass <c>false</c> for a room that is NAMED but AIRLESS.</summary>
        private static SlotGridPlanner.SlotAssign Slot(RoomType type, string anchor, bool? doorOpen = null) =>
            new SlotGridPlanner.SlotAssign { Type = type, Anchor = anchor, DoorOpen = doorOpen };

        /// <summary>An empty hall: a real compartment with its own anchor but no room type
        /// and no furniture, for the player to build out.</summary>
        private static SlotGridPlanner.SlotAssign Hall(int z, int index) =>
            new SlotGridPlanner.SlotAssign { Type = RoomType.None, Anchor = HallAnchor(z, index) };

        /// <summary>The anchor name of a hall slot — the single spelling of the convention, so the
        /// wreck wiring cannot drift from <see cref="Hall"/>.</summary>
        private static string HallAnchor(int z, int index) => $"hall_d{z}_s{index}";

        /// <summary>
        /// Collapse the <paramref name="rows"/> interior rows FARTHEST from a bottom-row slot's
        /// spine door into debris ('R' — floor AND wall, <c>AsciiWorld</c>), i.e. inward from the
        /// hull. Returns the filled tiles in z,y,x scan order (the order the dig board reads the
        /// world in), so an authored designation list matches the board's own ordering.
        ///
        /// BOTTOM-ROW SLOTS ONLY (4..7). Their door sits on the slot's TOP wall, against the
        /// spine, so "farthest from the door" is unambiguously the high-y hull side and the
        /// approach stays clear. Passing a top-row slot would collapse the rows nearest its door
        /// and wall the compartment off from the inside; it throws rather than authoring that.
        ///
        /// Two invariants are asserted here rather than left to a playtest, because both are
        /// silent failures: the room's centre PROBE tile must stay walkable floor (anchors,
        /// pressurisation and ＋ADD ROOM all resolve a room through it), and the door APRON — the
        /// tile inside the compartment directly under the door — must stay walkable floor, or the
        /// wreck is sealed off from the ship and no crew member can ever stand next to it.
        /// </summary>
        private static List<Int3> WreckFillBottomSlot(GridCanvas deck, int z, int slotIndex, int rows)
        {
            if (slotIndex < SlotGridPlanner.Cols || slotIndex >= SlotGridPlanner.SlotCount)
                throw new ArgumentException($"WreckFillBottomSlot: slot {slotIndex} is not a bottom-row slot (4..7)");
            if (rows < 1 || rows > SlotGridPlanner.InteriorH - 2)
                throw new ArgumentException($"WreckFillBottomSlot: {rows} rows leaves no clear approach in a {SlotGridPlanner.InteriorH}-row interior");

            var r = SlotGridPlanner.InteriorRect(slotIndex);
            int firstWreckY = r.Y1 - rows + 1;
            if (r.CenterY >= firstWreckY)
                throw new ArgumentException($"WreckFillBottomSlot: {rows} rows would bury slot {slotIndex}'s probe tile ({r.CenterX},{r.CenterY})");
            if (r.Y0 >= firstWreckY)
                throw new ArgumentException($"WreckFillBottomSlot: {rows} rows would bury slot {slotIndex}'s door apron");

            var filled = new List<Int3>(rows * SlotGridPlanner.InteriorW);
            for (int y = firstWreckY; y <= r.Y1; y++)
                for (int x = r.X0; x <= r.X1; x++)
                {
                    deck.Set(x, y, 'R');
                    filled.Add(new Int3(x, y, z));
                }
            return filled;
        }

        private static SlotGridPlanner.SlotAssign[] EmptyDeck(int z)
        {
            var slots = new SlotGridPlanner.SlotAssign[SlotGridPlanner.SlotCount];
            for (int i = 0; i < slots.Length; i++) slots[i] = Hall(z, i);
            return slots;
        }

        // ------------------------------------------------------------ small helpers

        /// <summary>Append a device. <paramref name="condition"/>/<paramref name="scriptable"/> are
        /// W1's optional damage authoring and default to <c>null</c> = "say nothing", which emits a
        /// DeviceSpec byte-identical to the one this helper emitted before W1. A wreck ship passes
        /// them; a ship that wants today's behaviour simply does not mention them.</summary>
        private static void Dev(ShipPlan plan, DeviceKind kind, int x, int y, int z, string name,
                                float? condition = null, bool? scriptable = null) =>
            plan.Devices.Add(new DeviceSpec
            {
                Kind = kind, Pos = new Int3(x, y, z), Name = name,
                Condition = condition, Scriptable = scriptable,
            });

        private static void Door(ShipPlan plan, string name, int x, int y, int z, bool open) =>
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.Door, Pos = new Int3(x, y, z), Name = name, IsOpen = open });

        private static void Vent(ShipPlan plan, string name, int x, int y, int z) =>
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(x, y, z), Name = name, IsOpen = false });

        private static void Room(ShipPlan plan, string anchor, RoomType type, int x, int y, int z) =>
            plan.Rooms.Add(new RoomSpec { Anchor = anchor, Type = type, Probe = new Int3(x, y, z) });

        /// <summary>Conduit tray under every carved (walkable) tile of a deck.</summary>
        private static void AddConduits(ShipPlan plan, GridCanvas deck, int z)
        {
            for (int y = 0; y < deck.Height; y++)
                for (int x = 0; x < deck.Width; x++)
                    if (deck.Get(x, y) == '.')
                        Dev(plan, DeviceKind.Conduit, x, y, z, $"conduit_d{z}_{x}_{y}");
        }

        // =====================================================================
        // Wreck ship — PeriluneWreck()  (--ship wreck)
        // =====================================================================
        // THE OPENING THE OWNER ASKED FOR: you wake up alone on a raided ship.
        //
        // Design of record: docs/design/perilune-wreck-start.plan.md (revision 2), wave W3.
        // Read its §2 beat sheet before changing anything here — every choice below answers a
        // numbered beat, and several of them are load-bearing in ways that are not obvious.
        //
        // ---------------------------------------------------------------------------------------
        // ⚠️ WHAT IS *NOT* HERE, SO NOBODY MISTAKES INERT FOR BROKEN
        // ---------------------------------------------------------------------------------------
        // THE PODS STILL DO NOTHING IN PLAY, AND THE REASON CHANGED WITH M3-2. `CryoSystem` now
        // exists (sim/Sim.Core/Systems/CryoSystem.cs, registered in the default stack) and a pod
        // whose `Progress` is above zero cycles, opens and produces a named Citizen — but NOTHING
        // ON THIS SHIP STARTS A CYCLE. There is no ThawCommand, no MOSS thaw op (both M3-3), no
        // countdown badge (M3-4) and no emergency thaw (M3-5); the only writer of a pod's
        // `Progress` on this tree is a test. So a pod that will not open is STILL CORRECT here —
        // it is now waiting for a verb rather than waiting for a mechanic. Do not "fix" it here.
        // (M3-2 moved the STATE pins by itself exactly as W0-6's four empty systems did, and for
        // the same reason: it implements IStatefulSystem, which is what folds a seed at all.)
        //
        // ⚠️ AND THE PLAYER CANNOT YET BE TOLD WHY AN ORDER IN VACUUM DOES NOTHING. That is W4's
        // `blocked` channel, on a sibling lane. Until it lands, painting a DIG or a STRIP in an
        // airless compartment on this ship is a SILENT no-op forever (MECHANICS.md §13.21). On
        // `--ship grid` that is rare; here it is most of the map, and it is the single biggest
        // reason this ship is not the default yet (W8).
        //
        // ---------------------------------------------------------------------------------------
        // ⭐ TWELVE CAPSULES: EIGHT LIVING (the design target) AND FOUR DEAD (the tuning parameter)
        // ---------------------------------------------------------------------------------------
        // ⭐ EIGHT IS NOT A TUNING PARAMETER. It is the owner's stated design target — the roster
        // they want to be playing with — so the end state of a won game is EIGHT crew living
        // aboard. One capsule boots OPEN (the single pawn the player starts with) and the other
        // seven are thawable one at a time through MOSS (W5). All eight are recoverable; nothing
        // here may reduce that number.
        //
        // ⚠️ THE FOUR WRECKED CAPSULES ARE *IN ADDITION* TO THE EIGHT, AND FOUR IS THIS LANE'S
        // NUMBER. The owner settled the RULE — a wrecked occupied pod holds a DEAD sleeper, so a
        // raid that cracks a capsule kills the person in it — and left the count open (the plan's
        // OD-9). Four reads unambiguously as a raid rather than an accident, and it makes the walk
        // through the bay a reading of who did not make it. Changing it is an edit to `WreckPods`
        // below plus the matching literals in `tests/Perilune.Tests/WreckShipTests.cs`, which are
        // deliberately hand-written and NOT derived from this table, so a content change cannot
        // pass silently.
        //
        // The fiction reconciles without strain: the ship carried a larger complement than
        // survived. Everyone who was awake is gone, and four of the sleepers went with them.
        //
        // ⚠️ AN EARLIER DRAFT OF THIS SHIP AUTHORED EIGHT CAPSULES OF WHICH TWO WERE WRECKED — i.e.
        // SIX recoverable crew. That was wrong and it is recorded rather than quietly corrected,
        // because the mistake has a shape worth naming: it read an answer about what the wrecked-pod
        // ART DEPICTS as an answer about how many crew are RECOVERABLE. The eight is the roster;
        // the wrecked pods are set dressing with somebody still inside.
        //
        // ⛔ EACH DEAD SLEEPER GETS A SHIP'S-LOG LINE AND NOTHING ELSE. Owner ruling, 2026-08-05,
        // from a screenshot of this bay: "there are still old body bags — delete them." Until then
        // this block also authored an `ItemKind.Corpse` stack on the pod's own tile, named for the
        // person, and this paragraph called it "the only way the sim has to say someone died here."
        // It never was the only way — the log line was already carrying the same name — and the
        // capsule now says the rest by itself: all four dead pods are authored at Condition
        // 0.03–0.07, far below `wear.wreck_threshold` 0.25, so all four draw the wrecked twin of
        // `capsule-sealed`, which is a breached capsule with an occupant. The body bag was the same
        // sentence a second time in the pre-redesign warm idiom.
        // ⇒ `plan.LogLines` is now the whole of the record; see `ShipPlan.LogLines` for why a
        // synthesised `CitizenDiedEvent` is still forbidden. `ItemKind.Corpse` itself is NOT retired
        // — `NeedsSystem` drops one when a living Citizen dies in play.
        //
        // ---------------------------------------------------------------------------------------
        // THE SURVIVABLE CORE, AND WHY IT IS THREE SPACES AND NOT ONE
        // ---------------------------------------------------------------------------------------
        // Boot air: CRYO BAY (slot 0) + the deck-0 SPINE + REACTOR (slot 4). Everything else on
        // both decks is vacuum behind a closed door. `WorksiteSafety.CanStageWorkerAt` therefore
        // confines every job — dig, haul, build, strip, maintain — to those three spaces until the
        // player pushes the frontier outward, which IS the game.
        //
        // ⚠️ THE CHARTER ASKED FOR *ONE* SURVIVABLE COMPARTMENT AND THIS AUTHORS THREE. That is a
        // deliberate departure and here is the arithmetic behind it. With one pawn and no
        // emergency thaw (W5), losing the crew member is losing the run — the plan's OD-10, still
        // open on the owner. A cryo bay sealed alone is 60 tiles ≈ 6 240 mol; opening its door onto
        // the 86-tile spine drops the connected mass to 101.3 × 60/146 ≈ 41.6 kPa and ppO2 to
        // ~8.7 kPa, which is BELOW severe_hypoxia_ppo2_kpa (10) — i.e. the player's first door
        // press would start killing the only pawn, and the vent needs ~5 sim-minutes to recover it.
        // Booting the spine and the reactor bay pressurised makes the core 206 tiles, so opening
        // ONE 60-tile hall lands at ~78 kPa / ~16.5 ppO2 — a survivable dip the open vent closes in
        // ~3.5 sim-minutes, and a lesson ("shut the door") rather than a death.
        // The frontier is still 13 sealed compartments and one whole vacuum deck.
        //
        // ⚠️ EVERY NON-CORE SLOT WAS AN EMPTY HALL FOR A MECHANICAL REASON, NOT A FICTIONAL ONE —
        // AND M1-1 REMOVED THE MECHANICAL HALF, SO READ THIS PARAGRAPH AS HISTORY PLUS ITS FIX.
        // `SlotGridPlanner.Carve` derives a slot's door from its type — TYPED ⇒ OPEN, empty hall ⇒
        // CLOSED (`IsOpen = !empty`) — so a typed airless slot would have had an open door onto
        // vacuum at tick 0, and "the typed set and the pressurised set are the same set" was the
        // way to guarantee that could not happen. It cost the ship something real: an unnamed slot
        // is not a room to the Overview (`roomTileRect` refuses a blank `anchorName`), so the
        // life-support bay could not be ENTERED and `vent_ls` — the premise's own opening move —
        // had no reachable control.
        //
        // ⇒ `SlotAssign.DoorOpen` now separates the two decisions, and slot 3 is typed with its
        // door held SHUT. The invariant that actually mattered is unchanged and is the one the
        // tests assert: NO OPEN DOOR ON THIS SHIP FACES VACUUM AT BOOT
        // (`EveryAirlessCompartment_BootsBehindAClosedDoor`). What is no longer true is the
        // shorthand — the typed set is now THREE and the pressurised set is still TWO.
        //
        // ⚠️ AND THE HARM THAT OVERRIDE PREVENTS IS A DIFFUSION HARM, NOT A BOOT-TIME ONE — worth
        // stating precisely, because the obvious wrong version ("the compartment would boot at
        // 101.3 kPa") is both wrong and reassuring. Rooms NEVER merge across a door: `RoomState`
        // marks the door tile `DoorMarker`, so with slot 3's door open the BOOT census is
        // byte-identical — slot 3 is its own 60-tile room holding 0.0 mol, the spine is a separate
        // 86-tile room of 8 945 mol, and `RoomState.Pressurize("wreck_spine_0")` never reaches it.
        // What fills it is B-3's partial-pressure term (`AtmosphereSystem.DiffuseAcrossDoors`).
        // MEASURED with the override dropped, driven, this tree, `ShipPlanBuilder.Build` + the
        // default stack, NO PLAYER INPUT: 0.000 kPa at tick 0 · 14.459 at 100 · 52.998 at 600 ·
        // BREATHABLE at tick 1 450 (~2.4 sim-minutes; ppO2 crosses hypoxia_ppo2_kpa = 16) · 90.042
        // at 3 000 · 101.302 at 20 000. ⇒ the compartment breathes itself open in under three
        // sim-minutes and `vent_ls` has nothing left to do. The door state is the only thing that
        // differs at tick 0, which is exactly why the guard has to assert the DOOR and not the gas.
        //
        // ---------------------------------------------------------------------------------------
        // ⚠️ THE SHIP GOES COLD, IT IS MEASURED, AND IT IS NOT A KNOB ANY VALUE HERE CAN TURN
        // ---------------------------------------------------------------------------------------
        // MEASURED, driven, `ShipPlanBuilder.Build` + the default stack, one seed, n = 1, Debug,
        // NO PLAYER INPUT AT ALL. Wall-clock is soft (other suites were running); the sim numbers
        // are not.
        //
        //   day   cryo bay            deck-0 spine        reactor bay        crew  suffocation
        //    1    10.0 °C   0 ppm     11.2 °C             8.6 °C             1     0.000
        //    3    10.0 °C   0 ppm      1.9 °C            -0.2 °C             1     0.000
        //    6    10.0 °C   0 ppm     -9.2 °C           -14.0 °C             1     0.000
        //   10    10.0 °C   0 ppm    -18.7 °C           -24.4 °C             1     0.329
        //
        // ⛔ STALE FOR THE SHIPPED SHIP SINCE M1-I (2026-07-29) — READ THIS BEFORE QUOTING THE ROWS
        // ABOVE. They were measured when the wreck carried THREE maintenance consumables. It now
        // carries ELEVEN (the cryo-bay damage-control locker, in the opening-stock block below), and
        // the extra eight lift `scrubber_spine`, `scrubber_reactor`, three batteries, three lamps
        // and `term_moss` back above their `fail` inside the first three sim-hours — so those
        // machines OPERATE, and an operating machine emits `MachineDef.HeatKW`.
        //
        // MEASURED A/B on THIS tree, driven, same method, TILE probes at (9,6,0) cryo / (16,9,0)
        // spine / (7,14,0) reactor bay, sampled every 12 sim-hours. The control is the SAME BUILD
        // with the locker stack deleted at boot, so the only difference is the eight units:
        //   day    cryo bay        spine  before → after      reactor bay  before → after
        //    1     10.0 / 10.0      11.2  →  14.2               9.5  →  10.0
        //    3     10.0 / 10.0       2.7  →   8.2               2.6  →  10.0
        //    6     10.0 / 10.0      -7.9  →   2.7             -10.4  →   9.7
        //    8     10.0 / 10.0     -13.1  →  -0.3             -16.2  →   7.3
        //   12     10.0 / (control not run to day 12) -5.2              (   "   )     2.3
        //   first sample at which the tile stops being STAGEABLE (`hypothermia_c` = -10):
        //     spine        BEFORE h168 (day 7)   AFTER still stageable at h288 (day 12)
        //     reactor bay  BEFORE h144 (day 6)   AFTER still stageable at h288 (day 12)
        // ⇒ the ship still freezes and R-4 (below) still stands — the crossing moves out by about a
        // sim-week. The spine's post-fix slope is ~-0.55 °C per 12 h at h288, which puts its
        // crossing near sim-day 16 — ⚠️ THAT ONE IS AN EXTRAPOLATION, not a measurement; every
        // other figure in this block was sampled. The cryo bay is 10.0 °C at every sample in both
        // legs and its explanation below survives intact.
        //
        // ⚠️ AND THE CONTROL DOES NOT REPRODUCE THE ROWS ABOVE EXACTLY. At day 6 the original table
        // reads spine -9.2 / reactor -14.0; the same-tree pre-M1-I control reads -7.9 / -10.4. The
        // SHAPE and the conclusion agree (both compartments freeze, crossing around day 6-7) and the
        // cryo bay agrees to the digit, but the magnitudes do not.
        //
        // ⭐ THE CAUSE IS ONE COMMIT AWAY, AND AN EARLIER DRAFT OF THIS BLOCK CALLED IT
        // "UNEXPLAINED" WITHOUT LOOKING. `git log -S "-14.0 °C" -- sim/Sim.Gen/AuthoredShips.cs`
        // returns `10e8589`, the commit that WROTE this table. The very next commit on that lane,
        // `042f1d7` ("the crew serviced the coffins"), changed `CryoPod maint 0.30 -> 0`. Before it
        // the opening stock went to FOUR DEAD SLEEPERS' CAPSULES — the four lowest-Condition devices
        // on the ship; after it, to `wing_c` / `battery_2` / `light_reactor`. A different set of
        // machines is lifted above `fail`, so a different set emits `MachineDef.HeatKW` — the exact
        // mechanism the A/B above rests on. ⇒ THE ROWS ABOVE ARE A PRE-`042f1d7` MEASUREMENT and
        // describe a ship whose consumables went into coffins.
        // ⚠️ THAT IS AN ATTRIBUTION BY INSPECTION, NOT A DRIVEN A/B — the pre-`042f1d7` tree was not
        // rebuilt and re-run here. What WAS checked is that the sign works out: the three post-fix
        // recipients sit in the REACTOR BAY and carry 0 + 0.10 + 0.15 kW of `HeatKW`, while the three
        // repaired capsules sat in the CRYO BAY, which `radiator_cryo` clamps to the 283.15 K floor
        // anyway — so their heat never reached the two compartments that moved, and the reactor bay
        // reading warmer after `042f1d7` (-14.0 -> -10.4) is the direction the mechanism predicts.
        // Treat the two tables as measurements of different ships, and do not average them.
        // ⚠️ THE ROWS ABOVE ARE KEPT, NOT DELETED, because the paragraphs beneath reason about
        // them; they are HISTORY OF THE PRE-M1-I SHIP, not a description of `--ship wreck` today.
        //
        // ⭐ THE CRYO BAY IS FLAT AT EXACTLY 10.0 °C FOR TEN SIM-DAYS, and the reason is a surprise
        // worth writing down: `radiator_cryo` is not COOLING the bay, it is THERMOSTATTING it.
        // `ThermalSystem.cs:94` refuses to reject heat below `thermal.radiator_floor_k` = 283.15 K,
        // so a room whose sources outrun its hull loss lands on the floor and stays there. Without
        // the radiator the same bay measured 41.9 °C at day 1 and 48.7 °C at day 3 — past
        // `heat_stroke_c`. WITH it, twelve capsules keep twelve people at a steady 10 °C forever.
        // That is the best-behaved compartment in the repo and it is where the pawn lives.
        //
        // ⚠️ THE SPINE AND THE REACTOR BAY FALL BELOW `hypothermia_c` (-10 °C) AROUND DAY 5–6, and
        // NO AUTHORING CHANGE IN THIS FILE FIXES IT. Measured A/B: killing the reactor's radiator
        // and adding two long-lived lamps moved day 10 from -18.7/-24.4 to -18.5/-24.2 — i.e.
        // nothing. Those two rooms are HEAT-STARVED, not over-cooled: 60 and 86 tiles of hull loss
        // against a few hundred watts of lamps and door motors, on a ship whose machinery is dead.
        // ⇒ **THIS IS THE PLAN'S §6 R-4 ARRIVING ON SCHEDULE: THERE IS NO HEATER DEVICE IN THE
        // GAME.** A radiator can only take heat OUT. Until something can put heat IN, a dead ship
        // freezes, and that is a real gap rather than a tuning failure. Reported, not worked around.
        //
        // WHAT IT MEANS IN PLAY, stated so nobody has to rediscover it: unattended, the crew member
        // is measured ALIVE at day 10 — it keeps eating (potatoes 60 → drawn down steadily) and
        // drinking (`SustenanceSystem`'s water path is deliberately unguarded by
        // `CanStageWorkerAt`), and the cryo bay it stands in never leaves the band. But suffocation
        // is 0.329 and RISING at day 10, and from about day 5 the ship outside the bay is
        // unworkable. The ship is authored to be FIXED, not to be left alone — which is the
        // premise, and it is now a measurement rather than a hope.
        //
        // ---------------------------------------------------------------------------------------
        // LIFE SUPPORT IS SIZED FOR EIGHT, NOT FOR ONE — AND THAT IS THE THAW CURVE'S SPINE
        // ---------------------------------------------------------------------------------------
        // One working scrubber removes `atmosphere.scrubber_mol_per_second` = 0.001 mol/s against
        // `co2_per_person_per_second` = 2.73e-4, i.e. ~3.66 crew per scrubber. EIGHT crew therefore
        // needs THREE working scrubbers, and CO2 is NOT clamped when breathing outruns scrubbing —
        // crossing `co2_narcosis_ppm` (40 000) makes a compartment unbreathable, which makes it
        // unworkable. That is the negative feedback that stops the thaw being a free win, and it is
        // already implemented; this ship's job is to make sure the HARDWARE to beat it exists.
        //
        // FIVE scrubbers are authored, and their boot states are the pacing:
        //   scrubber_cryo    0.55  WORKING  cryo bay        — the one that keeps the first pawn alive
        //   scrubber_spine   0.09  wrecked  deck-0 spine    — reachable at boot; a Swarf-priced repair
        //   scrubber_reactor 0.09  wrecked  reactor bay     — reachable at boot; a Swarf-priced repair
        //   scrubber_ls      0.08  wrecked  lifesupport     — behind the frontier (airless)
        //   scrubber_d1      0.06  wrecked  deck 1          — behind the frontier AND off-network
        //                                                     (genuinely so since M2-11; before it,
        //                                                      this line was wrong — see POWER)
        // ⇒ THREE of them stand inside the survivable core, so a player who never opens a door can
        // still bring the ship to its eight-crew ceiling. The other two are headroom for later.
        //
        // The same argument does not bind for O2: an `AirVent` injects from an unmodelled reserve at
        // 30 mol/s, which is orders of magnitude above eight people's draw, so ONE working vent is
        // enough and the others are redundancy.
        //
        // THREE vents are authored, and since M3-11 one of them is on the dead deck:
        //   vent_cryo  0.62  WORKING  cryo bay      OPEN — refills the core after a door is opened
        //   vent_ls    0.15  wrecked  lifesupport   SHUT — the premise's first physical gesture
        //   vent_d1    0.62  FAULTED  hall_d1_s0    OPEN — THE UPPER DECK'S ONLY SOURCE OF AIR
        // ⇒ `vent_d1` is the whole of OD-M item 2: open it and eight sealed halls stop being a
        // dead end. ⭐ SINCE OD-O (M3-16) IT IS THE ONLY MACHINE ABOARD THAT IS NOT BROKEN AND
        // STILL DOES NOTHING: mechanically sound at 0.62, powered, open, OPERATIONAL — and at
        // `Rate = 0f` with `Faulted = true`, so its switch refuses for every caller and a rate it
        // is given bleeds away. The act that opens the deck is a two-line MOSS program, not a
        // repair, so the ⛔ FILED gap that used to sit here (a 900 s service inside a 90 s vacuum
        // survival budget) is no longer on this beat's path at all. See WreckDeck1VentName.
        //
        // ---------------------------------------------------------------------------------------
        // POWER — THE CURVE THE PLAYER CLIMBS (WAS: "A SHIPPED RULE THAT DELETES THE DESIGN")
        // ---------------------------------------------------------------------------------------
        // ⭐ GENERATION IS CONDITION-SCALED SINCE M2-12, AND THIS PARAGRAPH USED TO SAY THE
        // OPPOSITE. `PowerSystem.cs:235` now reads `def.GenerationKW * d.EffectiveRate` — the same
        // factor a scrubber, a vent, a radiator and a reclaimer have always paid, applied in the
        // power ledger because a generator's output IS power and it has no downstream system in
        // which its wear could otherwise be expressed. There is deliberately NO `IsOperational`
        // gate (that would be a cliff, not a gradient — see PowerSystem's own comment).
        // ⇒ THE WINGS ARE THE POWER LEVER NOW, which is what this ship was authored believing and
        // what it spent two packages not being.
        //
        // ⇒ Power on this wreck is a CURVE the player climbs, not a fixed budget. MEASURED on this
        // tree, driven, `ShipPlanBuilder.Build` + the default stack, read at the seam
        // (`PowerSystem.LastGenerationKW`), against a FLAT 14.80 kW of demand (14.30 until M3-11
        // authored `vent_d1` onto the trunk — an open AirVent is 0.5 kW of LifeSupport):
        //     boot, wings 0.31 / 0.18 / 0.06         10.65 kW   Industry + Comfort shed
        //     the ship's one Parts overhauls wing_c  13.47 kW   the benches run
        //     both Seals into the other two wings    17.40 kW   the lights come back on
        //   ⚠️⚠️ D7 (2026-08-03) MOVED THIS, AND THE PARAGRAPH BELOW IS NOW HISTORY — READ THE NOTE
        //   FIRST. The `cabin stores` block further down authors SEVEN more Parts, so the ship holds
        //   EIGHT, and three Parts overhauls put all three wings at 1.00 ⇒ **18.00 kW IS REACHABLE
        //   ON BOOT STOCK NOW.** It is not free: those are the same units furniture is bought with
        //   (`build.device_place_cost` = 3), so the ceiling and the first bunk compete for one pile
        //   — a real choice rather than a wall, and the reason D7 could not avoid this. ANY Parts
        //   cache does it: even one extra unit puts a second wing at 1.00. The 10.65 / 13.47 / 17.40
        //   figures below are still exactly right as points on the curve — they are the arithmetic
        //   `GenerationWearTests` pins with hand-set conditions — but 17.40 is no longer the CEILING.
        //   ⛔ 18.00 kW WAS OUT OF REACH **ON BOOT STOCK, WITHOUT CRAFTING** — and that qualifier is
        //   load-bearing, an earlier draft of this block said "exactly one wing can EVER reach
        //   1.00" and that is FALSE. The repair ladder is Parts → 1.00, Seals → 0.90,
        //   Swarf → 0.45, and this ship carried exactly ONE Parts until D7, so on the stock in the
        //   hold exactly one wing reached 1.00 and 17.40 kW was the ceiling. PARTS ARE ALSO PRODUCIBLE:
        //   `recipes.def:21` is Fabricator, 2 Scrap → 1 Parts, and `deconstruct.def:19-21` pays
        //   floor(2 × Condition) Parts for a strip, i.e. 2 Parts from anything at 0.50 or better.
        //   The Regolith → Scrap → Parts ladder is spelled out in this file's own WINNABILITY
        //   block below. ⇒ 18.00 kW is a LATE-GAME state behind the matter economy, not an
        //   impossible one; 17.40 is what the opening can reach with what it was given.
        //
        // ⇒ AND THE OPENING IS A DEFICIT. 10.65 against 14.80 is −4.15 kW, so the 15.00 kWh bank
        // is spent by sim-hour 5 and after that Industry and Comfort shed. WINNABILITY IS DRIVEN,
        // NOT ARGUED — 24 sim-hours unattended, hour by hour (OD-H: nothing is enabled, so this is
        // a ship nobody has touched): LifeSupport SERVED at every hour and Defense SERVED at every
        // hour. The crew keep breathing and the doors keep working; what goes out is the lamps and
        // the benches. Pinned in `GenerationWearTests`.
        //   ⚠️ ONCE THE BANK IS FLAT THE LAMPS FLICKER RATHER THAN SETTLING DARK, at 0.5 Hz, for
        //   ever: a battery bursts its whole charge inside one balance second, so the surplus a
        //   shed tier leaves behind buys back one lit second, and the next second sheds again.
        //   Measured from h6: lit, dark, lit, dark. It is a property of the balance model, not of
        //   this ship — but this ship is where a player meets it. FILED, not fixed.
        //
        // The wings are authored damaged (0.31 / 0.18 / 0.06) and that is now load-bearing in two
        // ways at once: they are three Swarf-priced repair jobs and the owner's art badges every
        // wrecked piece, AND they are the ship's power curve. They also ROT — unattended, wing_a
        // reaches 0.21 by h24 and generation drifts 10.65 → 10.10 — so the deficit widens if the
        // player does nothing. wing_b and wing_c stop rotting at machines.def `fail` (0.10), which
        // is why the drift is small.
        //
        // ⛔ THE TWO SENTENCES THAT USED TO STAND HERE WERE BOTH FALSE, AND THE SHIP HAS BEEN
        // SHIPPING THAT WAY. They read "~12.6 kW of total demand, every tier served from tick 0 and
        // stays served" and "Deck 0 carries a full conduit tray; DECK 1 CARRIES NONE … so deck 1's
        // ruined machinery neither draws nor runs". MEASURED on the pre-M2-11 tree, driven,
        // `ShipPlanBuilder.Build` + the default stack, no player input:
        //   * demand was 20.40 kW, not ~12.6 — because ALL 23 deck-1 devices were on the network.
        //     0 of 626 devices were off-network. Laying no tray on deck 1 never did anything:
        //     `PowerSystem.RebuildNetworks` claims through -z, so every deck-1 machine reached down
        //     through the deck plate onto the deck-0 trunk.
        //   * and the tiers did NOT stay served. 18.00 kW of generation against 20.40 kW of demand
        //     is a 2.40 kW deficit the batteries paid for and then could not: h0 = 16/16 lamps lit
        //     and 15.00 kWh stored, h7 = 0/16 lit and 0.00 kWh, and it never came back. The player's
        //     ship went permanently dark seven sim-hours into a new game.
        // ⇒ M2-11 cut the risers for real (`WreckCutDeck1Risers`, called at the end of this method)
        // and BOTH halves are now true. MEASURED on this tree, same method: 23 of 612 devices
        // off-network; one network on deck 0; deck 1's eight lamps never light at any hour of the
        // first day, BY DESIGN. Per tier the 14.80 kW is
        // Comfort 1.20 · Industry 6.50 · Defense 0.90 · LifeSupport 6.20.
        //   ⚠️ SINCE M3-11 "off-network" AND "deck 1" ARE NO LONGER THE SAME SET, and that is the
        //   one sentence above that had to change rather than get a new number. Deck 1 holds 24
        //   devices; 23 of them are off the grid and the twenty-fourth, `vent_d1`, is ON it through
        //   the single exempted riser tap (`WreckCutDeck1Risers`). Everything else up there is as
        //   dead as it was. CUT 23 · EXEMPT 1 · ADDED 8 bulkhead runs — three counts, never a net.
        //   ⚠️ THE DECK-0 HALF OF M2-11'S MEASUREMENT IS SUPERSEDED BY M2-12 AND MUST NOT BE
        //   RE-QUOTED. It read "8/16 lamps lit at h0, h7 and h24; the bank charges 15.00 -> 40.90
        //   -> 103.72 kWh", which was true of a ship generating a flat 18.00 kW. On condition-
        //   scaled generation the bank DRAINS to 0.00 by h5 and deck 0's lamps shed — the deficit
        //   above. Both figures were honest when measured; only one of them is about the ship that
        //   ships.
        //
        // ⭐ AND THE NUMBER IN THIS COMMENT IS PINNED AGAINST THE RUNNING SHIP. The line below is
        // parsed by `WreckPowerNetworkTests` and compared with figures it measures by driving the
        // sim — so changing the ship's power without correcting this paragraph fails the build,
        // which is the defect this package existed to close.
        //   WRECK POWER PIN (measured, driven): flat demand 14.80 kW; off-network 23 of 612
        //
        // ---------------------------------------------------------------------------------------
        // WINNABILITY — THE ARITHMETIC, THEN THE DRIVEN CHECK
        // ---------------------------------------------------------------------------------------
        // With W2 shipped, EVERY repair below wear.wreck_threshold (0.25) needs a consumable in
        // hand: Parts → 1.00, Seals → 0.90, Swarf → 0.45. Nothing below the floor can be bodged for
        // free. So the opening has a hard precondition — there must be reachable matter — and this
        // is the arithmetic it was sized against:
        //
        //   * TO COMMISSION MOSS the player needs one ControllerModule = 2 Parts (MachineShop) =
        //     4 Scrap (Fabricator, 2 Scrap → 1 Part + 1 Seals) = 6 Regolith (SalvageRecycler,
        //     4 Regolith → 3 Scrap; 8 Regolith → 6 Scrap covers the rounding).
        //   * THE THREE BENCHES all boot below the floor, so each needs one consumable service.
        //     A Swarf service restores to 0.45, which clears every bench's `maint` (0.40) and every
        //     `fail` (0.10), so ONE service per bench is enough. ⇒ 3 consumables.
        //   * THE MOSS TERMINAL boots at 0.14 and needs one more. ⇒ 4 consumables total.
        //   * BOOT STOCK, DRIVEN OFF THE BUILT SHIP (D7 re-measured it): 12 Regolith, 3 Scrap,
        //     8 PARTS and 10 SEALS — 1 Parts + 2 Seals in the reactor bay with the rest of the
        //     stock, plus the 8 of M1-I's damage-control locker and the 7 one-unit crates of D7's
        //     `cabin stores`, both in the cryo bay (see the `cabin stores` block below). All in air.
        //     ⇒ EIGHTEEN consumable services from Parts+Seals before any salvage is needed, and 12
        //     Regolith is already 1.5× the 8 the module wants.
        //     ⚠️⚠️ THIS LINE HAS NOW GONE STALE TWICE, WHICH IS WHY THE WARNING IS A HISTORY AND
        //     NOT A ONE-OFF:
        //       1. It read "1 Parts, 2 Seals … ⇒ 3 free services" UNTIL 2026-07-30 and had been
        //          FALSE since M1-I added the 8-Seal locker.
        //       2. It read "1 Parts and 10 SEALS … ⇒ ELEVEN" UNTIL 2026-08-03 and had been FALSE
        //          since D7 added the 7-crate `cabin stores`. Caught at review, not by the author:
        //          the same quantity was moved 11 → 18 in `WreckShipTests` in that very commit and
        //          this copy was left behind.
        //     ⇒ THE STANDING LESSON: the arithmetic under this bullet is sized against whatever
        //     pile the line names, so a stale line UNDERSTATES the ship's slack. Read every
        //     "⇒ N consumables" figure above as a floor the ship clears by more than it says — and
        //     when you change the authored stock, grep this block BEFORE you change the tests.
        //   * SWARF: every strip of a device below Condition 0.5 pays 1 Swarf. ⚠️ THESE NUMBERS ARE
        //     RE-COUNTED OFF `WreckShipTests.PrintTheBootCensus` DRIVING THE REAL SHIP, NEVER
        //     recomputed from a previous draft's arithmetic — the first version of this paragraph
        //     was wrong in every figure. This ship authors 44 such devices (the census's
        //     "worth SWARF if stripped" line), of which NINETEEN stand in the boot core:
        //     ⚠️ THE PER-COMPARTMENT SPLIT WAS RE-DERIVED ON 2026-08-06 AND ONLY THE SPLIT MOVED.
        //     The owner's declutter ruling relocated four machines into the spine and one into the
        //     reactor bay; the TOTAL is untouched (44 aboard, 19 in the core) because relocation is
        //     not authoring. Re-count it off `PrintTheBootCensus`, never off this list.
        //       cryobay        5 — the four wrecked pods, term_moss 0.14
        //       wreck_spine_0  4 — scrubber_spine 0.09, light_spine_0 0.16, light_cryo 0.18,
        //                          radiator_cryo 0.36  (⚠️ vent_cryo 0.62 and scrubber_cryo 0.55 are
        //                          NOT in it — both are above the 0.50 cliff, exactly as they were
        //                          when they stood in the bay)
        //       reactor       10 — wing_a/b/c, battery_1, battery_2, battery_cryo 0.11,
        //                          tank_reserve, radiator_reactor, light_reactor, scrubber_reactor
        //     So the salvage rung can bootstrap without opening a single door, by a wide margin.
        //     (Two of the nineteen must NOT be stripped in practice — radiator_cryo and
        //     radiator_reactor are the survivable core's thermostats — and four of them are the
        //     dead sleepers' capsules, which `DeconstructSystem` now REFUSES outright. Call the
        //     freely-strippable core stock thirteen.)
        //     ⚠️ 45 IS WHAT THIS LINE SAID UNTIL 2026-08-02 AND IT WAS ALREADY WRONG — 44 is the
        //     DRIVEN number, on the pre-D2 tree AND on this one (and it takes the "44 before
        //     M3-11's `vent_d1`" clause with it, which cannot also be true). It was caught only
        //     because D2's first draft dropped two capsules under the Condition-0.5 cliff, moved
        //     the census to 46, and the arithmetic did not reconcile — so BOTH ends were measured.
        //     The owner's second D2 ruling then walked every capsule back above 0.50, and the
        //     census returned to 44 exactly. ⚠️ A LIVING CAPSULE MUST NEVER SIT UNDER THAT CLIFF
        //     WITHOUT SOMEONE SAYING SO: it inflates this line without adding one unit of Swarf,
        //     because a closed occupied pod can never be stripped at all. The census counts what
        //     the CLIFF says, not what the verb allows.
        //   * 80 debris tiles pay Regolith on top of that, once the player can breathe next to them.
        //
        // ⇒ The floor is 4 consumables and 8 Regolith; the ship authors 3 free services, 12
        // Regolith and ≥10 reachable Swarf sources. THE ARITHMETIC IS NOT THE EVIDENCE — see
        // `WreckShipTests` and this lane's report for the DRIVEN boot census and the day-1/3/10
        // survival run.
        //
        // ---------------------------------------------------------------------------------------
        // NO DESIGNATIONS, NO ZONES, AND THAT IS THE POINT
        // ---------------------------------------------------------------------------------------
        // `plan.DigDesignations` is EMPTY and no stockpile is zoned. The grid ship's opening —
        // eight crew sprinting to a pre-painted dig — is exactly what this start replaces. It is
        // also mechanically necessary: with one pawn the dispatcher outranks eating, crafting and
        // maintenance in that order (`SystemStack.cs:33-37`), so a wreck that boots with work on
        // the board boots with its only crew member locked out of the systems the premise is about.
        // A quiet board falls through to eat ▸ craft ▸ maintain, which is the right ladder.
        //
        // The one goal is `PressurizeAnchor` on the workshop hall: false at boot (it is vacuum),
        // true only after the player has opened it, repaired its vent and made air. `ClearAllDebris`
        // was the alternative and is rejected — 80 tiles at 10 sim-minutes each is 13 crew-hours for
        // one pair of hands, which is a chore, not an objective.
        //
        // ---------------------------------------------------------------------------------------
        // OTHER STANDING NOTES
        // ---------------------------------------------------------------------------------------
        // * NO FURNITURE. `RoomDresser.Dress` is deliberately NOT called. Furniture is `maint = 0`
        //   and `fail = 0`, so a SMASHED bed would be permanently unrepairable and fully functional
        //   — an object that looks broken and behaves perfectly. The plan (§2 beat 5) says author it
        //   pristine or not at all; a raided ship having no bunks left is the better fiction.
        // * THE CREW MEMBER IS `AutoWander = true`. Safe because `TryRandomWalkableTileNear` pins
        //   the idle draw to the crew member's own deck, and because deck 0's only walkable air-free
        //   space is behind closed doors, which `Simulation.IsWalkable` refuses. So an idle pawn
        //   paces the lit core and never wanders into vacuum.
        // * THE LADDER IS A REAL HAZARD AND IT STAYS. Deck 1 is vacuum and one ladder away. Only an
        //   explicit `MoveCitizenCommand` can send the pawn down it (the wander sampler cannot), and
        //   `SafetySystem` paths a suffocating crew member back to breathable air — up the ladder,
        //   which `FindPath` handles. Removing the ladder would author half a ship nobody can ever
        //   reach. Driven in `WreckShipTests`.
        // * `--ship grid`, `--ship slice` and `--ship perilune` are not touched by one byte, and
        //   `SimHost.Build`'s own default parameter stays `ShipChoice.Perilune` — the goldens read
        //   it. `hosts/web/Program.cs` still defaults to `--ship grid`; flipping the player-facing
        //   default is W8 and is gated on W4 landing.

        /// <summary>The wreck ship's own seed — a DISTINCT identity from Perilune (20260718),
        /// the slice (20260721) and the grid ship (20260723), so its portrait keys
        /// (pk_fnv1a32(seed, citizenId)) can never collide with theirs.</summary>
        public const ulong WreckSeed = 20260728UL;

        public const int WreckWidth = SlotGridPlanner.Width;   // 45
        public const int WreckHeight = SlotGridPlanner.Height; // 18
        /// <summary>TWO decks, not the grid ship's eight. One pawn cannot use eight, every extra
        /// deck is eight more compartments in the boot census, and the Overview's deck strip reads
        /// better with a lit deck and a dead one than with a lit deck and seven dead ones.</summary>
        public const int WreckDepth = 2;

        /// <summary>The cryo bay: deck 0, slot 0 (top-left). Typed, so its door boots OPEN onto the
        /// spine and the Overview gives it a real label instead of its internal anchor id.</summary>
        public const int WreckCryoSlot = 0;
        public const string WreckCryoAnchor = "cryobay";

        /// <summary>
        /// ⭐ <b>THE CORE PLANT ALCOVE — the two spine columns the pod bay's life support stands in
        /// since the owner's 2026-08-06 ruling</b> ("there should only be the capsules and a
        /// terminal"). Four machines occupy the 2 × 2 block <c>{X0, X1} × {SpineY0, SpineY1}</c>,
        /// immediately outside the cryo bay's doorway.
        ///
        /// <para>⛔ <b>THE DOOR APRON IS THE REASON THESE ARE 4 AND 6 RATHER THAN 5 AND 6.</b>
        /// <see cref="SlotGridPlanner"/> puts every compartment's door at its interior rect's
        /// <c>CenterX</c>, which for slot 0 (interior x 1..10) is <b>x = 5</b> — so the two spine
        /// tiles at x = 5 are the apron the pawn walks through on every trip in or out of the bay.
        /// A machine does not BLOCK a tile on this ship (<c>machines.def</c>: every
        /// <c>blocks</c> is false), so nothing here would have been impassable — but a worksite
        /// staged on a doorway is the shape <c>WorksiteSafety</c> exists to keep honest, and
        /// straddling the apron is also what makes the drawing read as an alcove BESIDE a door
        /// rather than a barricade across it.</para>
        ///
        /// <para>⚠️ DERIVED FROM THE PLANNER, NEVER TYPED: a slot's door column is its interior
        /// <c>CenterX</c>, so these are <c>doorX ∓ 1</c>. A planner change that moves the doorway
        /// moves the alcove with it.</para>
        ///
        /// <para>⛔⛔ <b>THE SENTENCE THAT CLOSED THIS PARAGRAPH WAS A FABRICATED CITATION</b> and is
        /// quoted rather than deleted: *"…which is the property <c>WreckShipTests</c> asserts."*
        /// <b>NO TEST CONTAINED IT.</b> Measured before the leg was written: moving
        /// <c>radiator_cryo</c> ONTO the apron column (x = 5) ran <b>1983/1983 GREEN</b> — the
        /// property this whole paragraph argues for was unguarded while the comment said it was
        /// pinned. It is asserted now, by name, in
        /// <c>WreckShipTests.TheCorePlantAlcove_StraddlesTheDoorway_AndLeavesTheApronClear</c>,
        /// which checks BOTH halves: the columns really are the planner's <c>doorX ∓ 1</c>, and no
        /// relocated device stands on an apron tile.</para>
        /// </summary>
        public static int WreckCorePlantX0 => SlotGridPlanner.InteriorRect(WreckCryoSlot).CenterX - 1;

        /// <inheritdoc cref="WreckCorePlantX0"/>
        public static int WreckCorePlantX1 => SlotGridPlanner.InteriorRect(WreckCryoSlot).CenterX + 1;

        /// <summary>The reactor bay: deck 0, slot 4 — directly below the cryo bay, so the walk from
        /// the pawn's pod to the ship's power, water and opening stock is the length of one
        /// compartment.</summary>
        public const int WreckReactorSlot = 4;
        public const string WreckReactorAnchor = "reactor";

        /// <summary>The goal's subject: deck 0's slot-1 hall, the compartment that holds the
        /// SalvageRecycler and the MachineShop. Airless and sealed at boot.</summary>
        public const string WreckGoalAnchor = "hall_d0_s1";

        /// <summary>
        /// M1-1 — the life-support bay: deck 0, slot 3. <b>THE ONE SLOT ON THIS SHIP THAT IS NAMED
        /// BUT AIRLESS</b>, and the only one that needs <see cref="SlotGridPlanner.SlotAssign.DoorOpen"/>.
        ///
        /// <para>It holds <c>scrubber_ls</c>, <c>reclaimer_ls</c> and — the reason this constant
        /// exists — <c>vent_ls</c>, the closed vent the wreck start's fiction points the player at
        /// as their first physical act. A slot with no <c>anchorName</c> is not a room to the
        /// Overview: <c>roomTileRect</c> refuses a blank anchor, so clicking slot 3 opened the
        /// ＋ADD ROOM picker and there was no way to reach the vent's OPEN/SHUT control at all.
        /// Naming it makes the compartment ENTERABLE; it does not make it breathable, and the door
        /// stays SHUT so the pressure frontier is exactly where it was.</para>
        ///
        /// <para><b>Named, not merely enterable, for a fictional reason too:</b> under OD-C the
        /// ship's own hold is on file, and a crew that knows where its own life-support bay is
        /// should not be shown a numbered hall.</para>
        /// </summary>
        public const int WreckLifeSupportSlot = 3;
        public const string WreckLifeSupportAnchor = "lifesupport";
        public const RoomType WreckLifeSupportType = RoomType.LifeSupport;

        /// <summary>
        /// M3-11 — <b>THE ONE MACHINE THAT CAN GIVE THE UPPER DECK AIR.</b> Deck 1's only
        /// <see cref="DeviceKind.AirVent"/>, standing in <c>hall_d1_s0</c>, and the only deck-1
        /// device whose riser tap survives <see cref="WreckCutDeck1Risers"/>.
        ///
        /// <para><b>OD-M item 2 (2026-07-31) AMENDS OD-E's HEADLINE.</b> OD-E read "deck 1 stays
        /// dead (no vertical gas term is SHIPPED FILED)". The owner adopted option A: <i>"deck 1
        /// boots dead and the player may bring it back; the sim still has no vertical gas term."</i>
        /// The parenthetical STANDS — nothing here adds a vertical gas term, and none is needed,
        /// because an <c>AirVent</c> injects into <b>its own room</b> from an unmodelled reserve
        /// (<c>AtmosphereSystem.cs:123-145</c>). The precedents are <c>vent_corr_up</c> on
        /// <c>--ship perilune</c> (behind P2's tick-3000 golden) and <c>vent_spine_1</c> on
        /// <c>--ship grid</c>.</para>
        ///
        /// <para>⛔ <b>SUPERSEDED BY OD-O (M3-16, 2026-08-01) — READ THIS BEFORE THE THREE
        /// PARAGRAPHS BELOW, WHICH ARE KEPT AS THE RECORD OF A SHIP THAT NO LONGER EXISTS.</b>
        /// <s>IT IS AUTHORED WRECKED (0.06), AND THAT IS THE WHOLE DESIGN.</s> The vent is now
        /// authored <b><c>Condition = 0.62f, Rate = 0f, Faulted = true</c></b>: mechanically sound,
        /// open, powered and OPERATIONAL, with its <b>controller board dead</b>. All eight deck-1
        /// halls still read 0.000 kPa on the player's first screen — <b>for a different reason</b>:
        /// the injection branch RUNS every pass and injects
        /// <c>VentMolPerSecond × EffectiveRate × Dt</c>, and <c>EffectiveRate</c> is zero.
        /// <b>The act that opens the upper deck is a two-line MOSS program</b>, not a repair order:
        /// <c>open vent_d1</c> refuses for every caller with <c>CONTROLLER FAULT — BOARD
        /// UNRESPONSIVE</c>, <c>set(rate, …)</c> is accepted and then bled back toward 0 by
        /// <c>AtmosphereSystem</c>, and <c>every 1s: set(vent_d1.rate, max)</c> holds it open.
        /// See <see cref="Device.Faulted"/>, <c>DeviceFault</c>, and <c>MECHANICS.md</c> §13.34.
        /// ⭐ <b>AND BOTH BLOCKERS BELOW ARE THEREFORE OFF THIS BEAT'S PATH</b> — blocker 1
        /// (reachability) was answered as a MECHANISM by OD-N/M3-15 (a repaired console opens any
        /// named door remotely), and blocker 2 (survivability) is DISSOLVED here, because there is
        /// no crewed repair to perform and nobody has to cross deck 1 at all. <b>Both measurements
        /// below remain TRUE of the ship</b> and are kept verbatim: they are the only place either
        /// was ever driven, and the reachability defect they name is general.</para>
        ///
        /// <para><s><b>IT IS AUTHORED WRECKED (0.06), AND THAT IS THE WHOLE DESIGN.</b> 0.06 is
        /// below <c>AirVent</c>'s <c>fail</c> (0.10), so at boot it is INOPERATIVE and all eight
        /// deck-1 halls still read 0.000 kPa on the player's first screen — OD-E's boot state is
        /// intact. It is also below <c>wear.wreck_threshold</c> (0.25), so it cannot be bodged back
        /// for free: like its five deck-1 siblings it needs Parts, Seals or Swarf. <b>The act that
        /// opens the upper deck is therefore a REPAIR ORDER</b> — the phase-1 exit-gate shape OD-K
        /// ratified ("order a repair, the lights come back"), here "order a repair, the deck
        /// breathes".</s></para>
        ///
        /// <para>⛔ <b>AND THE PLAYER CANNOT ACTUALLY DO IT YET. TWO BLOCKERS, IN THIS ORDER —
        /// DRIVEN ON THE M3-11 TREE, FILED, NOT FIXED. ⚠️ NEITHER IS ON THIS BEAT'S PATH ANY MORE
        /// (see the OD-O block above); the FACTS about the ship are unchanged.</b></para>
        ///
        /// <para><b>BLOCKER 1 — REACHABILITY, AND IT IS COMPLETELY SILENT.</b> Every deck-1 hall
        /// door boots SHUT (<c>SlotGridPlanner.Carve</c>'s derived rule: an empty hall's door is
        /// closed) and OFF-NETWORK, and <see cref="Simulation.IsWalkable"/> refuses a shut door
        /// tile — so at boot <b>there is no path into <c>hall_d1_s0</c> at all</b>. Measured:
        /// <c>door_d1_s0</c> at (5,7,1) reads <c>IsOpen=false</c>, <c>NetworkId=0</c>,
        /// <c>IsWalkable=false</c>; <c>FindPath</c> from the pawn to the tile beside the vent is
        /// FALSE while the control path to the deck-1 spine ladder head is TRUE — so it is the
        /// DOOR, not the ladder and not the deck. ⛔ <c>PrioritiseJobCommand</c> nevertheless
        /// <b>ACCEPTS the order</b> — <c>TryFindStagingTile</c> asks whether the staging tile is
        /// walkable and survivable, never whether it is REACHABLE — giving <c>JobKind=Maintain</c>,
        /// <c>HeldByOrder=true</c>, target (10,1,1); the job then evaporates in
        /// <c>MaintenanceSystem.DriveWorker</c>'s abandon path. 20 000 ticks later she is alive on
        /// deck 0 with <c>JobKind=None</c>, <c>HeldByOrder=false</c>, ZERO work ticks served and
        /// the vent still at 0.06. <b>No badge, no dock row, she never moves.</b> ⇒ The player must
        /// first open <c>door_d1_s0</c> by hand: <c>SetDoorStateCommand</c> carries no power gate,
        /// so it works on an off-network door (measured — the door opens and the path appears).
        /// </para>
        ///
        /// <para><b>BLOCKER 2 — SURVIVABILITY, and only once the door is open.</b>
        /// <c>wear.maintenance_work_seconds</c> is 900 s (9 000 work ticks) against
        /// <c>needs.suffocation_per_second_vacuum</c> of 1/90. Driven, door opened FIRST and then
        /// ordered: she crosses, reaches deck 1, takes the service — and is <b>DEAD at tick
        /// 1 341</b>, about 134 sim-seconds after the order, against a service that needs 900
        /// sim-seconds at the machine. The vent is still at 0.06.
        /// (<c>VacuumOrderLadderTests.Rung4_SheMayDie_AndThatIsTheFeature</c> pins the same
        /// arithmetic on its own fixture.)</para>
        ///
        /// <para>⚠️ <b>THE CHARTER'S ACCEPTANCE SCRIPT HAS ITS STEPS IN THE WRONG ORDER.</b> It
        /// reads "right-click the vent → Prioritise: repair", then "she crosses". <b>Opening the
        /// hall door must come FIRST</b>, or the order lands in blocker 1 and nothing observable
        /// happens at all.</para>
        ///
        /// <para>⚠️ <b>WHICH HALF AUTHORING COULD CLOSE, STATED PRECISELY — because the first
        /// draft of this note wrongly foreclosed both.</b> SURVIVABILITY is NOT an authoring
        /// problem: every tile on deck 1 is vacuum, so no geometry in this file can put a
        /// breathable staging tile beside this machine; it needs a suit, a shorter or segmented
        /// service, or relayed servicers. <b>REACHABILITY, however, IS an authoring choice inside
        /// this very file</b> — author <c>door_d1_s0</c> OPEN through
        /// <see cref="SlotGridPlanner.SlotAssign.DoorOpen"/> (the mechanism
        /// <see cref="WreckLifeSupportAnchor"/> already uses), or exempt its riser tap as well. It
        /// is deliberately NOT taken here, and it is not free either: this ship's
        /// <c>EveryAirlessCompartment_BootsBehindAClosedDoor</c> invariant says NO open door faces
        /// vacuum at boot, and a second exemption moves the tap census the owner has just been
        /// shown. <b>An OWNER call, left open — not foreclosed.</b></para>
        ///
        /// <para><b>WHY THIS TILE.</b> It stands at <c>(hall.X1, hall.Y0, 1)</c> — <b>directly
        /// above <c>vent_cryo</c></b> at <c>(cryo.X1, cryo.Y0, 0)</c>, the cryo bay's own working
        /// vent, in the same corner of the same footprint. So the ONE tap the raiders left is the
        /// one inside the ONE compartment whose life support they never finished, which is the
        /// fiction and the wiring saying the same thing. Mechanically it also picks a hall that
        /// is <i>not</i> collapsed (deck 1's slots 5/6/7 boot as debris) and a tile clear of
        /// <c>AddWreckedHall</c>'s device row (<c>Y0+1</c>).</para>
        /// </summary>
        public const string WreckDeck1VentName = "vent_d1";
        public const string WreckDeck1VentHall = "hall_d1_s0";

        /// <summary>Interior rows that collapse into debris in a wrecked bottom-row slot, counted
        /// from the hull side inward — the same depth the grid ship uses.</summary>
        public const int WreckDebrisRows = 2;

        /// <summary>Bottom-row slots that boot COLLAPSED, per deck. Bottom row only: their doors sit
        /// on the slot's TOP wall against the spine, so filling inward from the hull can never wall
        /// the compartment off from its own door (<see cref="WreckFillBottomSlot"/> asserts it).
        /// 4 slots × 2 rows × 10 columns = 80 debris tiles, NONE of them designated.</summary>
        private static readonly int[] WreckDebrisSlotsDeck0 = { 7 };
        private static readonly int[] WreckDebrisSlotsDeck1 = { 5, 6, 7 };

        /// <summary>
        /// One authored capsule: where it sits, whose it is, whether it is already open, and how
        /// badly the raid treated it.
        ///
        /// ⚠️ THE `Condition` COLUMN IS THE WHOLE FICTION. Below `machines.def`'s CryoPod `fail`
        /// (0.10) a pod is INOPERATIVE and the glyph layer paints it `GlyphColor.Broken`, so the
        /// FOUR wrecked capsules read as dead on the map without any new channel. (Driven, tick 0,
        /// `--ship wreck`: the fg byte is `Broken` for exactly `pod_vance`, `pod_sokolov`,
        /// `pod_iqbal` and `pod_osei` and `Device` for the other eight.)
        ///
        /// ⚠️ AND IT STAYS THAT WAY ONLY BECAUSE CryoPod's `maint` IS 0. At the first draft's
        /// `maint = 0.30` the wrecked pods were the four neediest devices on the ship, so
        /// `MaintenanceSystem` sent the only crew member to nurse them with the opening's entire
        /// consumable stock — measured over one unattended sim-day: Parts 1 → 0, Seals 2 → 0, three
        /// of the four back above `fail`. "The wrecked pods read as dead" is a tick-0 property and
        /// the sim used to erase it inside a day; `WreckShipTests` now asserts it at day 1 too.
        /// </summary>
        private struct PodSpec
        {
            public int X, Y;
            public string Who;
            public bool Open;
            public float Condition;
            public bool Dead;   // a wrecked, occupied pod: the sleeper did not survive the raid
        }

        /// <summary>The bay's twelve capsules, in three rows of four across the cryo bay's interior.
        ///
        /// EIGHT LIVING souls: one capsule boots open (the pawn the player starts with) and the
        /// other seven are thawable one at a time through MOSS (W5). Eight is the owner's design
        /// target and is NOT tunable here.
        ///
        /// FOUR WRECKED CAPSULES — four dead sleepers, in addition to the eight. Four is this
        /// lane's number and IS tunable; see the header.
        ///
        /// ⚠️ THIS PARAGRAPH IS THE SHIP'S SECOND CENSUS PROSE AND IT IS SCANNED, since M3-11.
        /// The banner header above states the same census in the same words, and for a while only
        /// THAT one was checked — so a stale edit here survived, which review proved. Both blocks
        /// are now compared against the hand-written literals in
        /// <c>tests/Perilune.Tests/WreckShipTests.cs</c>; if you re-word one, re-word both.
        ///
        /// ⭐⭐ THE `Condition` COLUMN IS ALSO THE THAW LADDER'S PACING, AND D2 (2026-08-02)
        /// RE-AUTHORED ALL SEVEN LIVING VALUES TOGETHER WITH THE BAND TABLE THEY INDEX
        /// (`sim/Sim.Core/ThawGate.cs`). Every pod keeps the rung OD-M item 1 gave it — Lindqvist 1
        /// … Torres 7, same items, same counts, same chain depths — and every pod now boots
        /// **0.07 above its own band floor**, which at the CryoPod wear rate (0.001/h,
        /// `machines.def:75`) is **~70 sim-hours before its price rises**. It was 0.01–0.02, i.e.
        /// 10–20 sim-hours: the M3 milestone demo watched Mbeki go `2 PARTS` → `1 CONTROLLER MODULE`
        /// inside 100 sim-minutes, and driven on the shipped tree the FIRST crossing landed at
        /// sim-hour 9 with six of the seven pods crossing at once. Owner's call, 2026-08-02: keep
        /// the decay, slow it, say so.
        ///
        /// ⭐ AND **0.07 RATHER THAN 0.10 IS A SECOND OWNER RULING THE SAME DAY**, taken because the
        /// wider table bought its pacing with RANGE: 0.11-wide bands need 0.66 of Condition and
        /// pushed this column down to 0.98 … 0.32, leaving the deepest capsule ~220 unattended
        /// sim-hours from `fail` where the shipped ship left it ~680. The ruling: **walk it back to
        /// ~70 sim-hours so EVERY capsule stays above 0.50.** This column now spans 0.99 … 0.51,
        /// Torres sits ~410 sim-hours above `fail`, and the price pacing is still ~7× the shipped
        /// tree's.
        ///
        /// ⚠️ AND THE PARAGRAPH THAT USED TO STAND HERE MEASURED A THRESHOLD THAT DOES NOT EXIST
        /// FOR THIS KIND. It read *"at the CryoPod wear rate (0.001/h) the lowest of them takes
        /// ~480 sim-hours to reach its `maint` threshold at all"* — but `machines.def:67-68` says in
        /// its own words that CryoPod's `maint = 0` **IS THE OPT-OUT, NOT A THRESHOLD**: there is no
        /// condition at which a pod joins the maintenance board, so there is nothing for 480 hours
        /// to be a countdown TO. The number was reassurance about the wrong floor, and it is the
        /// reason nobody looked at the real one. The floor that exists is `fail` (0.10): below it a
        /// pod is `ThawRefusal.PodNoSignal` and — because `maint = 0` makes every repair path skip
        /// it, player-forced or not (`MaintenanceSystem.cs:223,505`) — that is PERMANENT. Torres,
        /// the deepest capsule, sits ~410 sim-hours above it where he used to sit ~680; the ruling
        /// above is what bought back the difference. Nothing WARNS about that crossing — the alert
        /// bar is about the price — and that row is FILED for M5-2's alert stack.</summary>
        private static readonly PodSpec[] WreckPods =
        {
            // row 1                                                                    rung  band floor
            new PodSpec { X = 2, Y = 1, Who = "Rell",      Open = true,  Condition = 1.00f },
            new PodSpec { X = 4, Y = 1, Who = "Ozawa",     Open = false, Condition = 0.91f },  //  2   0.84
            new PodSpec { X = 6, Y = 1, Who = "Vance",     Open = false, Condition = 0.04f, Dead = true },
            new PodSpec { X = 8, Y = 1, Who = "Mbeki",     Open = false, Condition = 0.75f },  //  4   0.68
            // row 2
            new PodSpec { X = 2, Y = 3, Who = "Torres",    Open = false, Condition = 0.51f },  //  7   catch-all
            new PodSpec { X = 4, Y = 3, Who = "Sokolov",   Open = false, Condition = 0.07f, Dead = true },
            new PodSpec { X = 6, Y = 3, Who = "Lindqvist", Open = false, Condition = 0.99f },  //  1   0.92
            new PodSpec { X = 8, Y = 3, Who = "Bahri",     Open = false, Condition = 0.67f },  //  5   0.60
            // row 3
            new PodSpec { X = 2, Y = 5, Who = "Iqbal",     Open = false, Condition = 0.03f, Dead = true },
            new PodSpec { X = 4, Y = 5, Who = "Ferreira",  Open = false, Condition = 0.83f },  //  3   0.76
            new PodSpec { X = 6, Y = 5, Who = "Nakamura",  Open = false, Condition = 0.59f },  //  6   0.52
            new PodSpec { X = 8, Y = 5, Who = "Osei",      Open = false, Condition = 0.06f, Dead = true },
        };

        /// <summary>The one crew member who woke up. Stands beside the open capsule, on the bay's
        /// own floor, in the ship's only air.</summary>
        public const string WreckCrewName = "Rell";

        public static ShipPlan PeriluneWreck()
        {
            // OD-C — THE SHIP'S INTERIOR IS KNOWN AT BOOT. This is the ONE ship in the repo that
            // sets it, and it is the ship whose premise requires it: `ExplorationSystem` is crew
            // vision, and thirteen of this ship's sixteen compartments are sealed vacuum that no
            // crew member can enter, so under crew vision alone the fabricator, the machine shop,
            // the recycler, both life-support machines and `vent_ls` — the opening move — are
            // invisible and untargetable FOREVER, while the sensor log announces their failures by
            // name. Fog is not deleted: it still ratchets, and every other ship is untouched.
            // See ShipPlan.InteriorKnownAtBoot.
            var plan = new ShipPlan { Name = "MSV Perilune (wreck)", Seed = WreckSeed, InteriorKnownAtBoot = true };

            // Deck 0 — the surviving deck. THREE typed rooms and five empty halls (which boot
            // sealed). ⚠️ THE TYPED SET AND THE PRESSURISED SET ARE NO LONGER THE SAME SET, and
            // that sentence used to be an invariant of this ship — see the header block. Two typed
            // rooms boot with air AND an open door; the third, LIFE SUPPORT, is typed for its NAME
            // and holds its door SHUT via SlotAssign.DoorOpen, because the derived rule
            // (`IsOpen = !empty`) cannot say "named but airless" and this compartment must be both.
            // Everything the old invariant actually protected still holds and is still asserted by
            // `EveryAirlessCompartment_BootsBehindAClosedDoor`: NO open door anywhere on this ship
            // faces vacuum at tick 0.
            var deck0 = new[]
            {
                Slot(RoomType.Cryo,    WreckCryoAnchor),      // slot 0 — the cryo bay
                Hall(0, 1),                                   // slot 1 — workshop bones (the goal)
                Hall(0, 2),                                   // slot 2 — fabrication bones
                // slot 3 — life support: NAMED (so the Overview enters it and `vent_ls` is
                // reachable) and AIRLESS behind its own shut door. See WreckLifeSupportAnchor.
                Slot(WreckLifeSupportType, WreckLifeSupportAnchor, doorOpen: false),
                Slot(RoomType.Reactor, WreckReactorAnchor),   // slot 4 — power, water, stores
                Hall(0, 5),                                   // slot 5 — stripped
                Hall(0, 6),                                   // slot 6 — stripped
                Hall(0, 7),                                   // slot 7 — collapsed
            };
            // Deck 1 — dead AT BOOT, and since M3-11 (OD-M item 2) no longer dead FOREVER. Eight
            // sealed halls, no conduit tray, three of them collapsed; one wrecked vent on one
            // surviving riser tap is the way back. See WreckDeck1VentName.
            var deck1 = EmptyDeck(1);

            var canvases = new GridCanvas[WreckDepth];
            var rects = new Dictionary<string, BandPlanner.Rect>[WreckDepth];
            for (int z = 0; z < WreckDepth; z++)
            {
                var canvas = new GridCanvas(WreckWidth, WreckHeight, '#');
                rects[z] = SlotGridPlanner.Carve(canvas, plan, z, z == 0 ? deck0 : deck1, $"wreck_spine_{z}");
                canvases[z] = canvas;
            }

            // ------------------------------------------------------------- the collapse
            // Must run HERE: after Carve (which lays the floor these rows are cut back out of) and
            // before ToRows(), which is a one-shot snapshot of the canvas, and before AddConduits,
            // which trays only '.' tiles — so the trays under the rubble go with it.
            // The returned tile lists are DELIBERATELY DISCARDED: this ship designates nothing.
            foreach (int slot in WreckDebrisSlotsDeck0) WreckFillBottomSlot(canvases[0], 0, slot, WreckDebrisRows);
            foreach (int slot in WreckDebrisSlotsDeck1) WreckFillBottomSlot(canvases[1], 1, slot, WreckDebrisRows);

            plan.DeckRows = new string[WreckDepth][];
            for (int z = 0; z < WreckDepth; z++) plan.DeckRows[z] = canvases[z].ToRows();

            // ------------------------------------------------------------------- power
            // Deck 0 only — but a bare tray on one deck does NOT make the other deck off-network,
            // which is what this ship believed from W3 until M2-11. The cut that actually does it runs
            // at the END of this method (WreckCutDeck1Risers), because it reads the deck-1 device
            // list; this call just lays the trunk it later re-routes around the doorways.
            AddConduits(plan, canvases[0], 0);

            // -------------------------------------------------------------- the cryo bay
            var cryo = rects[0][WreckCryoAnchor];   // interior x1..10, y1..6
            for (int i = 0; i < WreckPods.Length; i++)
            {
                var pod = WreckPods[i];
                plan.Devices.Add(new DeviceSpec
                {
                    Kind = DeviceKind.CryoPod,
                    Pos = new Int3(pod.X, pod.Y, 0),
                    Name = "pod_" + pod.Who.ToLowerInvariant(),
                    IsOpen = pod.Open,
                    Condition = pod.Condition,
                });
                if (pod.Dead)
                {
                    // ⛔ THE BODY IS NO LONGER AN ITEM. OWNER RULING, 2026-08-05, from a screenshot of
                    // the cryo bay: "there are still old body bags — delete them." The four
                    // `ItemKind.Corpse` stacks this block used to author — one per dead sleeper, on
                    // the sleeper's own pod tile — are gone.
                    //
                    // THE LOG LINE STAYS, AND THAT IS THE WHOLE OF WHAT CHANGED. The paragraph that
                    // stood here is quoted rather than deleted, because half of it is still the
                    // reasoning and the owner overruled only the other half. It read: *"THE BODY IS
                    // AN ITEM AND THE DEATH IS A LOG LINE — and that is the WHOLE of it, deliberately.
                    // `ItemKind.Corpse` has art, a label and ZERO consumers anywhere in the sim; the
                    // eulogy/Chronicle path fires on `CitizenDiedEvent`, which a sleeper who was never
                    // a `Citizen` cannot raise. Synthesising one would write a false death into the
                    // hashed event stream and send `EulogySystem` looking for a mind that does not
                    // exist. A log line is a fact; a eulogy is a relationship, and these FOUR people
                    // have no relationships because they have never been entities."*
                    //
                    // ⇒ Every clause about the EULOGY still holds and still forbids synthesising a
                    // death; what the owner removed is the ITEM half. It is affordable now because the
                    // pod tile tells the story by itself: `capsule-sealed`'s wrecked twin
                    // (`client/src/items/wrecked.js`) is what a breached capsule with someone still in
                    // it looks like, and all four of these pods are authored at Condition 0.03–0.07,
                    // far below `wear.wreck_threshold` 0.25, so all four draw it. A body bag lying on
                    // top of that was the pre-redesign warm art saying a second time, in a second
                    // idiom, what the capsule now says once.
                    //
                    // ⚠️ `ItemKind.Corpse` IS NOT RETIRED and its warm art is still reachable —
                    // `NeedsSystem` drops one when a CITIZEN dies in play. This deletes four AUTHORED
                    // stacks from one ship's boot state; it does not touch the runtime path, and it
                    // deliberately does not touch `Perilune()`'s own "Ensign Rojas" (that fixture sits
                    // behind the tick-3000 golden, and `AddIceAtTheForwardHold` rides its tile).
                    plan.LogLines.Add(pod.Who + " did not survive the raid — capsule breached.");
                }
            }

            // ⭐⭐ THE POD BAY'S PLANT STANDS IN THE CORRIDOR NOW — OWNER RULING, 2026-08-06.
            // ---------------------------------------------------------------------------------------
            // The owner, from a screenshot of the Room Zoom: *"The cryo room looks extremely crowded —
            // there should only be the capsules and a terminal."* The bay drew TWENTY-SIX things
            // (measured on the built ship, not counted off this file: 18 devices — twelve capsules and
            // six machines — plus 8 uncarried ground stacks). It now draws THIRTEEN: the twelve
            // capsules and `term_moss`.
            //
            // ⛔ NOTHING WAS DELETED, BECAUSE THE AUDIT FOUND NOTHING DECORATIVE. Every one of the
            // thirteen pieces that left the bay is load-bearing — four are the core's life support,
            // one is bank storage on the deck-0 network, one is a lamp that is also boot-board
            // machine #9 in M1-I's own derivation, and eight are the ship's consumable stock. They
            // are RELOCATED to the two adjacent pressurised compartments, and the destinations are
            // chosen by mechanism, not by taste:
            //
            //   vent_cryo      -> spine (4,8)   AirVent injects into ITS OWN room and the core is one
            //                                   air volume through the bay's boot-open door; a vent in
            //                                   the corridor refills the corridor and the corridor
            //                                   refills the bay (`AtmosphereSystem.FlowAcrossDoor`).
            //   scrubber_cryo  -> spine (6,8)   `DiffuseAcrossDoors` exists precisely so a scrubber
            //                                   can reach the compartment the crew stand in (B-3,
            //                                   MECHANICS §13.1) — this is that mechanism used on
            //                                   purpose rather than worked around.
            //   radiator_cryo  -> spine (4,9)   ⚠️ THE ONE WITH A REAL COST, STATED WHERE IT HAPPENS.
            //                                   A radiator only ever acts on its own room, so the bay
            //                                   no longer has a thermostat: its heat now leaves
            //                                   through `ThermalSystem.ConductAcrossDoor` (40 W/K
            //                                   while the door is open) into a corridor that is
            //                                   heat-STARVED. Measured below.
            //   light_cryo     -> spine (6,9)   a corridor lamp. Still strippable, still on the
            //                                   maintenance board at boot, still in breathable air —
            //                                   every property M1-I's eight-Seal derivation used.
            //   battery_cryo   -> reactor (9,12) between `battery_1` and `battery_2`. Deck 0 is ONE
            //                                   power network (`WreckCutDeck1Risers`' own
            //                                   measurement), so a battery's position is inert to
            //                                   what it powers — DRIVEN, not argued, below.
            //   the 8 stacks   -> reactor (see the two stock blocks further down)
            //
            // ⚠️ THE NAMES DO NOT MOVE, DELIBERATELY. `vent_cryo`, `scrubber_cryo`, `radiator_cryo`,
            // `light_cryo` and `battery_cryo` are named by NINE test files (`OperateVerbTests`,
            // `MossGateTests`, `BoardFaultTests`, `VentsVerbTests`, `ThawGateTests`, `DoorsVerbTests`,
            // `Deck1VentTests`, `WreckShipTests`, `GridWreckTests`). The suffix still says what the
            // machine is FOR — the pod bay's life support — which is the truthful half; it never said
            // where it stood. Renaming them would have been a rename touching nine files and zero
            // mechanisms.
            //
            // ⛔⛔ WHAT THIS COSTS, MEASURED AND NOT ARGUED — A DRIVEN A/B ON ONE TREE. Both legs are
            // `ShipPlanBuilder.Build` + the default stack with NO PLAYER INPUT (the OD-H boot state),
            // probes at (5,3,0) cryo / (16,9,0) spine / (7,14,0) reactor bay, run to TWELVE SIM-DAYS.
            // ⭐ The control is not another tree and not another commit: it is THIS plan with the
            // thirteen fittings' `Pos` written back to their pre-ruling tiles before `Build`, so the
            // ONLY difference between the columns is where they stand.
            //
            //     h     cryo bay °C        cryo CO2 ppm        spine °C          reactor bay °C
            //           ctrl -> shipped    ctrl -> shipped     ctrl -> shipped   ctrl -> shipped
            //      0    19.85   19.85        500     500       19.85   19.85     19.85   19.85
            //      6    10.06   23.99          0       6       17.43   10.00     10.00    9.97
            //     24    10.00   28.89          0       2       11.22   10.00      9.46    9.61
            //     48    16.38   31.71        516     524        7.53   11.98      5.20    6.54
            //     72    26.71   33.80       1540    1570        7.64   11.89      3.97    7.41
            //     84    28.73   34.01       2048    2090        7.47   11.27      3.70    7.33
            //    108    30.57   33.82       3086    3151        6.25    9.41      1.36    4.75
            //    168    23.94   25.50       5650    5772       -0.44    1.94     -5.04   -2.52
            //    288     9.80   10.63      10798   11040      -16.09  -14.26    -21.08  -19.17
            //
            // ⇒ **THE POD BAY IS WARMER, AND SAYING ANYTHING ELSE WOULD BE FALSE.** It is no longer a
            // thermostatted room; it is a warm room cooled through its own doorway. The control's bay
            // sits pinned at EXACTLY 10.0 °C from h6 to h36 because `radiator_cryo` stood in it and
            // `ThermalSystem.cs:97` will not reject below `radiator_floor_k` (283.15 K); the shipped
            // bay climbs to 24 °C by h6 and 29 °C by h24.
            // ⚠️ THE MAXIMA ARE **HOURLY-SAMPLED** AND ARE QUOTED AS SUCH — an earlier draft read them
            // off the 12-HOURLY table above and understated both: **shipped 34.08 °C at h80** (not
            // 34.01 at h84) and **control 30.80 °C at h112** (not 30.57 at h108). A maximum taken from
            // a coarser grid is a lower bound on the maximum, and calling it "the maximum over 288
            // samples" was the error. Re-sampled every sim-hour for 288 hours, both legs.
            // ⭐ IT STILL NEVER APPROACHES THE ONLY THRESHOLD THAT BITES: `needs.def heat_stroke_c` is
            // 45, so 34.08 leaves **10.9 degrees of margin on the hottest hour** of the unattended
            // ship. `SafetySystem.CanStageWorkerAt` and `NeedsSystem`'s `thermalDanger` are the two
            // consumers and neither fires in any leg.
            // ⛔ AND THE PEAK IS A PEAK, NOT AN ASYMPTOTE THE RUN WAS TOO SHORT TO SEE: the curve
            // turns over at h80 and is back under the control's own peak by h132.
            //
            // ⭐ THE ARITHMETIC BEHIND THE +3.4 K, so the next lane does not re-derive it. The bay's
            // dominant heat source was always the CAPSULES — `CryoPod` heat is 0.15 kW and eight of
            // the twelve are operational, ≈ 0.94 kW condition-scaled — and the four machines that
            // left carried only ≈ 0.62 kW between them. So the ROOM LOST LESS HEAT THAN IT LOST
            // COOLING, and the balance is now `capsules + pawn` against `hull loss + 40 W/K through
            // an open door` instead of against a 5 kW radiator.
            //
            // ⭐ AND THE HEAT THE BAY EXPORTS IS NOT WASTED — IT LANDS IN THE TWO COMPARTMENTS R-4
            // FREEZES. ⚠️ **FROM h48, NOT FROM h36**, and the earlier draft's "2–4 K warmer from h36"
            // was false at the hour it named: at h36 the gap is only **+1.03 K** (spine) and
            // **+0.44 K** (reactor bay). Measured, shipped minus control:
            //     h36  spine +1.03  reactor +0.44      h72  spine +4.25  reactor +3.44
            //     h48  spine +4.45  reactor +1.34     h132  spine +2.74  reactor +2.99
            // ⇒ the honest sentence is: **from h48 the spine runs ~4.5 K warmer and the reactor bay
            // 1.3 K warmer, and by h72 both are 3–4 K warmer**, holding to the end of the run. The
            // reactor bay's `hypothermia_c` crossing moves from ~h216 to ~h228.
            // (Before h48 the spine is COLDER — 10.00 against 17.43 at h6 — because the radiator now
            // clamps the CORRIDOR to its floor. Both directions are the same one mechanism and both
            // are stated.)
            //
            // ⛔ CO2 AND PRESSURE ARE UNCHANGED IN SHAPE AND WITHIN 3 % IN MAGNITUDE at every sample,
            // which is the leg that says `DiffuseAcrossDoors` really does carry a corridor scrubber
            // into the room the crew stand in. ⭐ AND THE POD CENSUS IS IDENTICAL AT EVERY SAMPLE OF
            // BOTH LEGS: **12 powered / 8 operational / 7 intact-and-thawable**, out to 12 sim-days,
            // with the crew member alive. That is the ruling's hard requirement — the battery moved
            // and the capsules never noticed, because deck 0 is one network.
            //
            // ⛔⛔ AND SAY THE HALF THIS DOES NOT CLOSE, WITH THE NUMBER, BECAUSE IT IS THE ONE PLACE
            // THE RULING COSTS SOMETHING REAL. **SHUT THE POD BAY'S DOOR AND THE BAY COOKS.**
            // Conduction drops 5× (`door_conduct_closed_w_per_k` = 8 against 40) while the capsules'
            // 0.94 kW keeps arriving, so the room's only remaining sink is its own hull. Driven, same
            // method, same probes, with `door_d0_s0` shut at tick 0 and BOTH legs run:
            //
            //     leg                    bay at h24   first hour above 45   crew dead by
            //     CONTROL, door shut       10.0 °C            h77                  h78
            //     SHIPPED, door shut       42.3 °C            h28                  h28
            //
            // ⛔⛔ THE CONTROL WINDOW HERE READ "between h60 and h72" UNTIL INDEPENDENT REVIEW
            // RECONSTRUCTED IT, AND IT WAS WRONG — quoted rather than deleted because the mistake is
            // instructive. It was not a measurement error: it was a MISREADING OF MY OWN 12-HOURLY
            // TABLE, whose h72 row says **41.11 °C**, i.e. still BELOW 45. Twelve-hourly sampling
            // cannot locate a crossing to better than twelve hours and I quoted it as if it could.
            // Re-driven at ONE-HOUR sampling, both legs: control h77, shipped h28.
            // ⇒ **THE CONCLUSION SURVIVES AND GETS SHARPER: THE HAZARD IS NOT NEW — IT IS 49
            // SIM-HOURS EARLIER** (77 − 28). The pre-ruling bay cooks the same way once
            // `radiator_cryo` wears through `fail` at ~h43; the ruling removes the grace, it does not
            // create the failure. Saying "the door-shut case is a regression" would be false and
            // saying "nothing changed" would be worse.
            // ⭐ WITH THE DOOR OPEN — the state the ship BOOTS in — neither leg ever crosses: control
            // peaks at 30.80 °C (h112), shipped at 34.08 °C (h80).
            //
            // ⚠️ HOW REACHABLE IT IS, MEASURED RATHER THAN ASSUMED, because the reassuring version of
            // this paragraph is wrong. Doors are MOSS-only since OD-N and `MossGate.IsServerLive`
            // wants any Terminal, Powered, at Condition >= 0.20; `term_moss` boots at 0.14, so the
            // gate is SHUT at tick 0 — but the driven economy leg below shows `MaintenanceSystem`
            // lifting `term_moss` 0.14 -> 1.000 at **h1.778** once the player grants Repair. ⇒ THE
            // GATE OPENS IN THE FIRST TWO SIM-HOURS OF ORDINARY PLAY and the shut-door case is
            // reachable, not hypothetical. FILED FOR THE OWNER, not closed here: closing it means
            // either a machine back in the bay (which is the ruling) or a heat path that does not
            // depend on a door, which is `--ship wreck`'s standing R-4 gap. Both legs are DRIVEN in
            // `WreckShipTests` so the next lane inherits a number rather than a worry.
            //
            // ⛔ THE HEADER'S "FLAT AT EXACTLY 10.0 °C FOR TEN SIM-DAYS" IS STALE FOR *BOTH* SHIPS and
            // this package did not make it so — the control column above reaches 30.57 °C at h108.
            // `radiator_cryo` wears at 0.006/h from 0.36 and crosses `Radiator`'s `fail` (0.10) at
            // ~h43, and under OD-H nothing is ever serviced, so the thermostat dies on the unattended
            // ship either way. Do not quote that sentence for `--ship wreck` as it boots; re-measure.
            // ---------------------------------------------------------------------------------------
            //
            // The bay's own life support is the ONE thing on this ship the raid did not finish, and
            // that is the authoring decision the pawn's life rests on. Both are above their `maint`
            // (0.40), so neither is even on the maintenance board at boot — the core does not need
            // the player to do anything to stay breathable. The vent boots OPEN (grid's
            // `vent_spine_0` precedent): it is what refills the core after the player opens a hall
            // door, and a closed AirVent draws nothing at all (`PowerSystem.IsWanting`).
            //
            // ⚠️ ITS TILE IS THE SPINE ROW DIRECTLY OUTSIDE THE POD BAY'S DOORWAY, one column to
            // port of the door apron at x = 5 (`SlotGridPlanner`: slot 0's door is at its
            // `CenterX`). The apron itself is left clear so the pawn's walk in and out of the bay is
            // never staged on top of a machine.
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.AirVent, Pos = new Int3(WreckCorePlantX0, SlotGridPlanner.SpineY0, 0),
                Name = "vent_cryo", IsOpen = true, Condition = 0.62f,
            });
            Dev(plan, DeviceKind.Scrubber, WreckCorePlantX1, SlotGridPlanner.SpineY0, 0, "scrubber_cryo", 0.55f);
            // Two more scrubbers inside the survivable core, both wrecked. Eight crew needs three
            // working scrubbers (~3.66 crew each) and these are the other two — reachable in air
            // from tick 0, so the ship's eight-crew ceiling is a SALVAGE problem and not a
            // frontier problem. See the header's life-support block for the whole census.
            // ⚠️ 0.09 AND NOT 0.11, AND THE TABLE ABOVE WAS WRONG UNTIL IT WAS DRIVEN. Scrubber
            // `fail` is 0.10, so at 0.11 this scrubber booted OPERATIONAL while every line of this
            // file called it wrecked — the core booted with TWO working scrubbers, not the one the
            // pacing rests on, and it then wore through `fail` unattended within about a sim-hour,
            // so the player would have watched a machine they never touched die for no visible
            // reason. 0.09 puts it in the same band as its three siblings and makes the boot state
            // unambiguous: one working scrubber in the core, four wrecked ones on the ship.
            Dev(plan, DeviceKind.Scrubber, 8, SlotGridPlanner.SpineY1, 0, "scrubber_spine", 0.09f);

            // Everything else that used to stand in the bay is wrecked, and three of the four are the
            // bootstrap: they are the strippable devices standing in breathable air, so the salvage
            // rung can start without opening a single door (the plan's W3 precondition 2). ⚠️ SINCE
            // THE 2026-08-06 RULING THEY STAND IN THE SPINE AND THE REACTOR BAY — both are breathable
            // at boot and both are inside the pressurised core, so W3 precondition 2 is untouched:
            // the census that matters is "strippable wrecked devices the pawn can reach in air", and
            // it is the same set on the same deck.
            Dev(plan, DeviceKind.Light, WreckCorePlantX1, SlotGridPlanner.SpineY1, 0, "light_cryo", 0.18f);
            // ⚠️ 0.36 IS A MEASURED NUMBER AND IT TOOK TWO DRIVEN RUNS TO FIND. It is the single
            // most load-bearing scalar on this ship, and both wrong values LOOKED fine at boot.
            //
            //   * 0.07 (first draft) is BELOW the radiator's own `fail` (0.10), so it was
            //     inoperative from tick 0 and one sim-day took the cryo bay to 48.9 °C — past
            //     needs.def's heat_stroke_c of 45, i.e. the compartment stopped being breathable
            //     with the only crew member standing in it.
            //   * 0.14 is above `fail` and looked correct: the bay read 19.8 °C at boot and the
            //     one-day survival test went GREEN. IT WAS STILL WRONG, and only a ten-day trace
            //     showed why: a Radiator wears at 0.006/h, so 0.14 reaches `fail` in SIX HOURS,
            //     and 0.14 is below wear.wreck_threshold (0.25) so MaintenanceSystem may not bodge
            //     it back without a consumable. Measured cascade — radiator dead at h6, bay at
            //     41.9 °C by day 1 and 48.7 °C by day 3, at which point WorksiteSafety refuses
            //     every job in the bay, so the vent and scrubber are never serviced either and
            //     BOTH decay to their own `fail` by h72. Life support then dies of overheating.
            //
            // ⚠️ AND UNTIL THE SEND-BACK NOTHING ENFORCED ANY OF THAT — the rule above was OBSERVED,
            // not guarded. Measured by mutation, full `WreckShipTests` (the only suite in the repo
            // that boots this ship, so the scope is complete): with `radiator_cryo` at 0.14 the
            // file was 34/34 GREEN, and with `radiator_reactor` at 0.13 it was 34/34 GREEN.
            // ⇒ The paragraph above is right that 0.14 "went GREEN"; what it does not say is that
            // EVERY value went green, including the one it calls the single most load-bearing
            // scalar on the ship. Both radiators are now named in
            // `MostOfTheShip_IsAuthoredDamaged_AndTheCoresLifeSupportIsNot`, and both mutations go
            // RED there. A number that was found by driving and then left unpinned is a number the
            // next lane re-derives from scratch.
            //
            // 0.36 sits in the free-jury-rig band [wreck_threshold 0.25, Radiator maint 0.40), so
            // the ship's one crew member repairs it for FREE, forever, on the 0.6 → 0.4 → 0.6 cycle
            // the shipped rules already run — which is what makes the boot core survivable with no
            // player action at all (the plan's W3 precondition 4). It is still below 0.50, so it is
            // still worth Swarf if stripped; the player just does not cook while deciding.
            //
            // ⇒ THE GENERAL RULE FOR THIS SHIP, AND FOR ANY LATER ONE: a device the CORE'S SURVIVAL
            // depends on must be authored at or above wear.wreck_threshold. Below it, wear is a
            // one-way trip to `fail` and the compartment has a fuse on it measured in hours.
            //
            // ⚠️ AND SINCE 2026-08-06 THE PARAGRAPH ABOVE DESCRIBES A RADIATOR IN THE SPINE, WHICH
            // CHANGES WHAT IT THERMOSTATS AND NOT WHETHER IT MATTERS. Every sentence about the
            // CONDITION stands unaltered — 0.36 is still in the free-jury-rig band, still above
            // `wreck_threshold`, still below 0.50, and a core-survival device authored under the
            // floor is still a compartment with a fuse on it. What moved is the ROOM: it now clamps
            // the corridor, and the pod bay's heat reaches it through the boot-open door. The A/B at
            // the top of this block is the measurement that the bay is no worse for it.
            Dev(plan, DeviceKind.Radiator, WreckCorePlantX0, SlotGridPlanner.SpineY1, 0, "radiator_cryo", 0.36f);
            // THE MOSS BOX. Dark twice over: `Scriptable = false` means no adapter is registered and
            // no program can be installed until a CommissionDeviceCommand spends a ControllerModule
            // on it, and Condition 0.14 is below wear.wreck_threshold so it cannot even be bodged
            // back to working without a consumable. In W5 this is also the door to the other seven
            // sleepers; today it is a terminal that will not take a program, which is the truthful
            // half of that.
            Dev(plan, DeviceKind.Terminal, cryo.X0, cryo.CenterY, 0, "term_moss", 0.14f, scriptable: false);

            // ------------------------------------------------------------ the reactor bay
            var reactor = rects[0][WreckReactorAnchor];   // interior x1..10, y11..16
            int topRow = reactor.Y0 + 1;
            Dev(plan, DeviceKind.SolarWing, reactor.X0 + 1, topRow, 0, "wing_a", 0.31f);
            Dev(plan, DeviceKind.SolarWing, reactor.X0 + 3, topRow, 0, "wing_b", 0.18f);
            Dev(plan, DeviceKind.SolarWing, reactor.X0 + 5, topRow, 0, "wing_c", 0.06f);
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.Battery, Pos = new Int3(reactor.X0 + 7, topRow, 0), Name = "battery_1",
                StoredKWh = 12f, Condition = 0.24f,
            });
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.Battery, Pos = new Int3(reactor.X1, topRow, 0), Name = "battery_2",
                StoredKWh = 3f, Condition = 0.09f,
            });
            // ⭐ THE THIRD CELL OF THE BANK — the 2026-08-06 ruling's one relocation that is not life
            // support. `battery_cryo` stood in the pod bay because the pods draw 0.2 kW each and the
            // first draft of this ship believed a battery served the room it was in. It does not:
            // `PowerSystem` balances a NETWORK, and `WreckCutDeck1Risers`' own measurement is "one
            // network on deck 0" — so this cell's 0.11 Condition, its 0.1 kW of `heat`, its place in
            // M1-I's eleven-machine boot board and everything it stores are unchanged, and the pods
            // it powers are powered from here exactly as they were from (1,6).
            // ⚠️ IT KEEPS ITS StoredKWh DEFAULT (0) AND ITS NAME. The name is read by no test today,
            // but it is read by the maintenance census prose in this file and by the boot-board
            // derivation in the `damage-control locker` block below; changing it would have made
            // both of those look like new numbers.
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.Battery, Pos = new Int3(reactor.X1 - 1, topRow, 0), Name = "battery_cryo",
                Condition = 0.11f,
            });
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.WaterTank, Pos = new Int3(reactor.X0, reactor.Y1, 0), Name = "tank_reserve",
                StoredLiters = 300f, Condition = 0.21f,
            });
            // Above wear.wreck_threshold for the same measured reason as radiator_cryo: at 0.13 it
            // reached `fail` in five hours and never came back, and the reactor bay is the other
            // half of the survivable core.
            Dev(plan, DeviceKind.Radiator, reactor.X1, reactor.Y1, 0, "radiator_reactor", 0.33f);
            Dev(plan, DeviceKind.Light, reactor.CenterX, reactor.CenterY, 0, "light_reactor", 0.09f);
            Dev(plan, DeviceKind.Scrubber, reactor.X0 + 2, reactor.Y1, 0, "scrubber_reactor", 0.09f);

            // ------------------------------------------------------------------ the spine
            Dev(plan, DeviceKind.Light, 20, SlotGridPlanner.SpineY1, 0, "light_spine_0", 0.16f);
            // The ladder trunk. Deck 1 is vacuum; see the header for why the hazard is kept.
            for (int z = 0; z < WreckDepth; z++)
                Dev(plan, DeviceKind.Ladder, SlotGridPlanner.LadderX, SlotGridPlanner.SpineY0, z, $"ladder_d{z}");

            // ------------------------------------------------- the frontier (deck 0, sealed)
            // The three benches of the matter ladder, one hall apart, all below wreck_threshold and
            // all in vacuum. They are the reason the player pushes the frontier at all: the whole
            // Regolith → Scrap → Parts → ControllerModule chain lives behind these three doors.
            AddWreckedHall(plan, rects[0]["hall_d0_s1"], 0,
                (DeviceKind.SalvageRecycler, "recycler_1", 0.09f),
                (DeviceKind.MachineShop, "machineshop_1", 0.13f),
                (DeviceKind.Light, "light_d0_s1", 0.04f));
            AddWreckedHall(plan, rects[0]["hall_d0_s2"], 0,
                (DeviceKind.Fabricator, "fabricator_1", 0.11f),
                (DeviceKind.Light, "light_d0_s2", 0.07f));
            // Slot 3 is a hall in every way except its NAME — typed only so the Overview can enter
            // it (see WreckLifeSupportAnchor), still airless, still behind a shut door. It is
            // dressed by the same AddWreckedHall the other frontier compartments use, deliberately:
            // nothing about being named makes it less wrecked.
            var lifeSupport = rects[0][WreckLifeSupportAnchor];
            AddWreckedHall(plan, lifeSupport, 0,
                (DeviceKind.Scrubber, "scrubber_ls", 0.08f),
                (DeviceKind.Reclaimer, "reclaimer_ls", 0.12f),
                (DeviceKind.Light, "light_d0_s3", 0.05f));
            // A CLOSED vent, so it draws nothing while it sits there broken — and so the player's
            // first act in this compartment is to open it, which is the one physical gesture the
            // pressure loop is built on.
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.AirVent, Pos = new Int3(lifeSupport.X0 + 1, lifeSupport.Y1, 0),
                Name = "vent_ls", IsOpen = false, Condition = 0.15f,
            });
            AddWreckedHall(plan, rects[0]["hall_d0_s5"], 0, (DeviceKind.Light, "light_d0_s5", 0.06f));
            AddWreckedHall(plan, rects[0]["hall_d0_s6"], 0, (DeviceKind.Light, "light_d0_s6", 0.03f));

            // ------------------------------------------------------ the dead deck (deck 1)
            AddWreckedHall(plan, rects[1]["hall_d1_s0"], 1,
                (DeviceKind.GrowBed, "growbed_1", 0.03f),
                (DeviceKind.GrowBed, "growbed_2", 0.06f),
                (DeviceKind.Light, "light_d1_s0", 0.02f));
            AddWreckedHall(plan, rects[1]["hall_d1_s1"], 1,
                (DeviceKind.Telescope, "telescope_1", 0.05f),
                (DeviceKind.Light, "light_d1_s1", 0.04f));
            AddWreckedHall(plan, rects[1]["hall_d1_s2"], 1,
                (DeviceKind.MachineShop, "machineshop_2", 0.02f),
                (DeviceKind.Light, "light_d1_s2", 0.05f));
            AddWreckedHall(plan, rects[1]["hall_d1_s3"], 1,
                (DeviceKind.Scrubber, "scrubber_d1", 0.06f),
                (DeviceKind.Light, "light_d1_s3", 0.03f));
            // The nav terminal, placed by hand rather than through AddWreckedHall because it is the
            // ship's SECOND dark console (`Scriptable = false`) and that is not a hall-scatter
            // property. It is deliberately on the dead deck: MOSS is restored at `term_moss` in the
            // cryo bay, and a second commissionable terminal exists so the flag is not a
            // one-instance special case on this ship.
            Dev(plan, DeviceKind.Terminal, rects[1]["hall_d1_s3"].X0 + 7, rects[1]["hall_d1_s3"].Y0 + 1, 1,
                "term_nav", 0.03f, scriptable: false);
            AddWreckedHall(plan, rects[1]["hall_d1_s4"], 1,
                (DeviceKind.Light, "light_d1_s4", 0.06f));
            // Slots 5..7 are the collapsed ones: their hull-side rows are debris ('R' is BOTH floor
            // and wall to AsciiWorld), so a device may only stand on the clear rows. Everything
            // placed by AddWreckedHall sits on Y0+1 and CenterY, both of which survive a 2-row
            // collapse — asserted by WreckFillBottomSlot's own probe/apron checks.
            AddWreckedHall(plan, rects[1]["hall_d1_s5"], 1, (DeviceKind.Light, "light_d1_s5", 0.02f));
            AddWreckedHall(plan, rects[1]["hall_d1_s6"], 1, (DeviceKind.Light, "light_d1_s6", 0.04f));
            AddWreckedHall(plan, rects[1]["hall_d1_s7"], 1, (DeviceKind.Light, "light_d1_s7", 0.03f));

            // ⭐ M3-11 — THE DECK-1 VENT. The one machine on this ship that can give the upper deck
            // air. Its tile stands directly above `vent_cryo`, and the single surviving riser tap
            // is exempted inside WreckCutDeck1Risers below. Full rationale: WreckDeck1VentName.
            // ⚠️ IT BOOTS OPEN, unlike `vent_ls`. A closed AirVent draws nothing (PowerSystem
            // .IsWanting) and would need a SECOND player gesture; the shutter is already up and
            // the only thing wrong with this machine is its board.
            //
            // ⭐⭐ OD-O (M3-16) RE-AUTHORED IT, AND THE RE-AUTHORING IS THREE FIELDS, NOT ONE.
            // M3-11 shipped it BROKEN (Condition 0.06, below AirVent's fail 0.10) so a repair order
            // was what opened the deck. OD-O replaces that beat with a PROGRAMMING one: the machine
            // is now mechanically FINE and its controller board is dead.
            //
            //   Condition = 0.62f — driven, not arithmetic. Above AirVent's `fail` (0.10) so it is
            //     OPERATIONAL; above wear.wreck_threshold (0.25) so it is not a one-way trip; and
            //     above machines.def `maint` (0.40) so it does NOT queue a Maintain job the player
            //     never asked for. MEASURED on this tree, not computed: AirVent wear is 0.010/h, so
            //     the vent reads 0.6191 after 3 000 ticks and 0.6091 after 30 000, and it would not
            //     reach `maint` for ~22 sim-hours — no unasked repair job appears anywhere near the
            //     opening beat.
            //   Rate = 0f — ⭐ THE FAULT'S VISIBLE HALF, and the edit that keeps the deck dead.
            //     Raising Condition ALONE would make the upper deck breathe at boot with no player
            //     action at all: AtmosphereSystem's injection branch asks exactly
            //     `IsOpen && Powered && IsOperational`, all three of which now hold. An open,
            //     powered, operational vent at rate 0 has EffectiveRate 0 and injects NOTHING.
            //     The machine is fine; the board is dead — the fiction and the arithmetic are the
            //     same sentence, which is the sign the mechanic is the right one.
            //   Faulted = true — the refusal and the bleed (Device.Faulted, DeviceFault). ⛔ THE
            //     ONLY INSTANCE IN THE GAME, and that count is censused by BoardFaultTests rather
            //     than left as a convention (OD-O item (iii): "not a pattern for all devices").
            var deck1Vent = rects[1][WreckDeck1VentHall];
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.AirVent, Pos = new Int3(deck1Vent.X1, deck1Vent.Y0, 1),
                Name = WreckDeck1VentName, IsOpen = true,
                Condition = 0.62f, Rate = 0f, Faulted = true,
            });

            // ⭐ THE RISERS ARE CUT HERE, AND IT MUST BE HERE — the helper reads the deck-1 device
            // list, so it runs after the last one is authored and before anything reads the plan.
            // Not laying a tray on deck 1 was never enough; see WreckCutDeck1Risers for the
            // measurement and for why deck 0's trunk now crosses the bulkheads.
            WreckCutDeck1Risers(plan);

            // ----------------------------------------------------------------- one person
            // AutoWander so the ship is not a still photograph while the pawn is idle; deck-confined
            // by the sampler, and hemmed in by closed doors, so the wander cannot reach vacuum.
            plan.Citizens.Add(new CitizenSpec
            {
                Name = WreckCrewName, Pos = new Int3(WreckPods[0].X + 1, WreckPods[0].Y, 0),
                AutoWander = true, RevealsFog = true, HoldPosition = false,
            });

            // -------------------------------------------------------------- opening stock
            // In the reactor bay, in air, on proven open floor (interior x1..10, y11..16; this row
            // is CenterY+1 = 14, clear of the lamp on the probe tile and of the top service row).
            int stockY = reactor.CenterY + 1;
            // 60 rations. `potato_hunger_value` is 0.36 and Hunger fills in two sim-days, so a crew
            // member eats ~1.39 potatoes/sim-day: 60 is ~43 sim-days for the lone pawn and ~5.4 for
            // the full eight-crew roster. Sized against the ROSTER, deliberately — the thaw curve
            // ends with eight mouths, and the hydroponics bay is behind the frontier for a reason.
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Potato, Count = 60, Pos = new Int3(reactor.X0 + 1, stockY, 0), Label = "survival rations" });
            for (int i = 0; i < 3; i++)
                plan.Items.Add(new ItemSpec { Kind = ItemKind.Regolith, Count = 4, Pos = new Int3(reactor.X0 + 2 + i, stockY, 0), Label = "hull spoil" });
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Scrap, Count = 3, Pos = new Int3(reactor.X0 + 5, stockY, 0), Label = "salvage" });
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Parts, Count = 1, Pos = new Int3(reactor.X0 + 6, stockY, 0), Label = "spares" });
            plan.Items.Add(new ItemSpec { Kind = ItemKind.Seals, Count = 2, Pos = new Int3(reactor.X0 + 7, stockY, 0), Label = "gaskets" });

            // ------------------------------------------------- the damage-control locker (M1-I)
            // ⭐ EIGHT MORE UNITS OF SEALS, AND THEY EXIST TO REMOVE A SOFT-LOCK, NOT TO SOFTEN THE
            // SHIP. Owner decision, 2026-07-29 (roadmap M2 batch item 6, option (a)): author more
            // consumables. `wear.wreck_threshold` and `wear.swarf_service_condition` are NOT touched.
            //
            // WHAT THE SHIPPED THREE UNITS ACTUALLY DID, MEASURED — driven on this tree,
            // ShipPlanBuilder.Build + the default stack, NO PLAYER INPUT AT ALL, three sim-days:
            //   h0.26  Parts -> wing_c          0.060 -> 1.000
            //   h0.51  Seals -> battery_2       0.089 -> 0.900
            //   h0.76  Seals -> light_reactor   0.089 -> 0.900
            // and that is the whole stock gone, spent by MaintenanceSystem.RecruitForNeediest's
            // lowest-Condition-first rule, 46 SIM-MINUTES into a new game, on a battery and a LAMP.
            // ⇒ THE SOFT-LOCK WAS THE DEFAULT OUTCOME, NOT A MISTAKE THE PLAYER HAD TO MAKE. From
            // h0.76 onward `MaintenanceSystem.IsUnfixableWreck` is TRUE, permanently and silently,
            // for `wing_b`, both remaining scrubbers in the core, `term_moss` (the terminal the
            // whole thaw curve is built on), both remaining batteries and the water tank. The
            // player is never told, and there is no verb anywhere that could undo it.
            //
            // ⚠️ AND `wing_b` IS NINTH IN THAT QUEUE, NOT SECOND. The rule picks the lowest
            // Condition on the ship that a worker can stand beside and breathe, and eight core
            // machines are worse off than wing_b (0.18) at boot. That is why the answer is a
            // NUMBER OF UNITS and not a better placement: nothing on this ship can steer the spend
            // until the work-priority grid lands (M2).
            //
            // ⭐ THE DERIVATION OF 8 — one unit per wrecked machine that is ON THE MAINTENANCE
            // BOARD at boot in the survivable core. Counted off the driven boot census, NOT off
            // this file, and narrowed twice:
            //   16  devices boot below `wreck_threshold` in breathable air
            //   −4  CryoPods, whose `MachineDefs.MaintainBelow` is 0.00 — MaintenanceSystem never
            //       recruits them, so a consumable can never be spent on one
            //   −1  `tank_reserve` 0.21, which is below the wreck floor but ABOVE its own `maint`
            //       (WaterTank, 0.20), so it is not on the board at boot and joins it ~10 sim-hours
            //       later, after the pile is gone. See KNOWN LIMIT 1 below — it is NOT covered, and
            //       that is a decision.
            //   =11 wrecked machines on the board at tick 0:
            //       wing_c 0.06 · battery_2 0.09 · light_reactor 0.09 · scrubber_spine 0.09 ·
            //       scrubber_reactor 0.09 · battery_cryo 0.11 · term_moss 0.14 · light_spine_0 0.16
            //       · light_cryo 0.18 · wing_b 0.18 · battery_1 0.24
            // One service consumes exactly ONE unit (`MachineWearSystem.cs`, `consumable.Count--`),
            // and no device can take a second inside the window because a service lands it at
            // 0.90/1.00, far above its own `maint`. 11 needed − 3 shipped = 8.
            // ⚠️ THE 11 ARE SERVED FIRST BY CONSTRUCTION, not by luck: `RecruitForNeediest` picks
            // the strictly LOWEST Condition it can stage a worker beside, and the only other needy
            // machines in the core (`wing_a` 0.31, `radiator_cryo` 0.36, `radiator_reactor` 0.33)
            // are all above every one of them. Measured: the eleven are serviced h0.26 → h2.79 and
            // the pile is exactly empty afterwards, with `wing_a` and both radiators taking the
            // FREE jury-rig at h3.05 / h3.30 / h3.55.
            //
            // ⭐ WHY ONE UNIT EACH IS ENOUGH AND NOT A DOWN PAYMENT: for every kind here whose
            // `maint` is 0.30 or 0.40 (SolarWing, Scrubber, Battery) the lift is PERMANENT. Such a
            // machine falls back only as far as its `maint`, which is ABOVE the 0.25 floor, so the
            // FREE jury-rig band [0.25, maint) can always catch it. ⇒ once both wings are lifted
            // they can never be stranded again, which is exactly the property the owner asked for.
            // VERIFIED to 200 unattended sim-hours: all three wings end clear of the floor and
            // fixable, with free jury-rigs observed at h44.95 / h108.46 / h128.19.
            // ⛔ BUT NOT "FOR FREE FOR THE REST OF THE GAME", AND AN EARLIER DRAFT SAID EXACTLY
            // THAT. `MachineWearSystem.cs:399-431` fetches a consumable BEFORE it will consider a
            // free jury-rig — the machine's Condition only gates whether SWARF is offered, never
            // whether the fetch happens at all. So a needy machine takes Parts or Seals whenever the
            // ship holds ANY, and the free rig is what happens when the ship holds NONE. The
            // 0.600 jury-rigs quoted throughout this block are a consequence of the pile being
            // EMPTY from h2.79, not of the machine being above the floor: driven with 43 units
            // aboard, `wing_a` goes 0.294 -> 0.900 and both radiators and `tank_reserve` likewise.
            // ⚠️ In a package whose whole subject is consumable scarcity, "a repaired wing costs
            // nothing forever" is the wrong shape to leave for a future lane. What is permanent is
            // that such a machine can ALWAYS be recovered — not that recovering it is always free.
            // ⚠️ DRIVEN FOR TWO OF THE THREE KINDS, INFERRED FOR THE THIRD — labelled rather than
            // blurred. SolarWing is OBSERVED taking the free jury-rig twice — `wing_a` at h3.05
            // (0.294 → 0.600) and again at h44.95 (0.399 → 0.600); an earlier draft wrote the two
            // events as if both started from 0.399, which is only the second one — and Scrubber
            // three times (`scrubber_spine` h34.41 / h49.67 / h64.62). Review drove the same ship to
            // 200 sim-hours and adds h108.46 and h128.19. Battery is an INFERENCE from the def table
            // alone (`maint` 0.30 > the 0.25
            // floor ⇒ the band is non-empty): at 0.002/h a Seals service at 0.90 does not fall to
            // 0.30 for ~300 sim-hours, well outside any window measured here.
            // ⚠️ IT IS *NOT* PERMANENT FOR Light/Terminal/WaterTank, whose `maint` is 0.20 — BELOW
            // the floor, so their free band is empty (wear.def says so) and they need a consumable
            // EVERY cycle, forever. That recurrence is the ongoing economy the salvage rung exists
            // to feed; it is deliberately NOT priced in here, because pricing it would mean
            // authoring an infinite pile. ⚠️ FIRST RECURRENCE ~22 SIM-DAYS after a Seals service,
            // NOT the ~29 an earlier draft computed from the def sheet: `machines.def` gives Light
            // 0.001/h nominal, but the OBSERVED rate on the deck-0 lamps is ~0.0013/h (0.040 →
            // 0.032 over 6 sim-hours). The gap is measured and NOT explained here — this package did
            // not chase which term inflates it. Use the measured figure; a wear rate read off the
            // def table is a nominal, not a prediction.
            //
            // ⭐ WHY THE CRYO BAY. ⚠️ THIS IS THE ONE PLACE THIS PACKAGE OVERRODE ITS OWN CHARTER,
            // WHICH ASKED FOR A LOCKER SOMEWHERE IN THE SHIP RATHER THAN A PILE AT THE PLAYER'S
            // FEET. The first draft put it in the spine — better fiction, a corridor damage-control
            // bracket a hurried raider walks past — and a measurement retired it:
            //   1. ⚠️ PRESSURE — THE DECIDING REASON, AND IT IS THE ONLY ONE THAT CAN ACTUALLY BITE
            //      THIS SHIP'S STOCK. `FindNearest` (`MachineWearSystem.cs`) refuses any stack whose
            //      own tile fails `WorksiteSafety.CanStageWorkerAt`, so a stack in a compartment
            //      that loses its air simply STOPS EXISTING as far as maintenance is concerned.
            //      MEASURED per tick over the first 4 sim-hours, three legs, probing all three
            //      consumable tiles:
            //          doors opened at tick 0    (7,14,0) spares   (8,14,0) gaskets   (9,6,0) locker
            //          none                      always Y          always Y           always Y
            //          the goal door alone       always Y          always Y           always Y
            //          BOTH doors of the column  N from h0.028     N from h0.028      always Y
            //                                      back at h0.066    back at h0.066
            //      ⇒ opening TWO frontier compartments at once drains the core's air into 120 tiles
            //      instead of 60 and the REACTOR BAY briefly stops being a place a crew member can
            //      stand. The cryo bay never does, in any leg. That is a real discriminator between
            //      the two candidate sites, and it is why the eight new units are not in the reactor
            //      bay beside the old three.
            //   2. ⛔ THERMAL — REAL, BUT IT CANNOT REACH ANY STACK ON THIS SHIP, AND AN EARLIER
            //      DRAFT OF THIS BLOCK LED WITH IT AS THOUGH IT COULD. Independent review caught the
            //      contradiction: the argument was used to reject the spine and the reactor bay, and
            //      then WAIVED for the two stacks already sitting in the reactor bay on the grounds
            //      that "they are gone by h0.76, so the case does not arise" — which is equally true
            //      of the new locker, gone by h2.79. Both halves cannot be right. The measurement
            //      decides it: EVERY unit on this ship is consumed inside the first three sim-hours,
            //      and nothing freezes before sim-day 6, so the freezing hazard cannot bite EITHER
            //      site. It is a property of a TILE, not of this stock. Kept because a future lane
            //      that authors a cache meant to sit unspent must know about it —
            //      "unbreathable" INCLUDES THERMAL (`needs.def hypothermia_c = -10`).
            //      ⚠️ THE FIRST DRAFT OF THIS REASON QUOTED THIS FILE'S OWN HEADER TABLE (spine
            //      -9.2 °C, reactor bay -14.0 °C at sim-day 6) AND WAS FALSE ON THE SHIPPED TREE.
            //      A guard written to pin it went RED and was right to. RE-MEASURED HERE, driven on
            //      THIS tree, `ShipPlanBuilder.Build` + the default stack, no player input, probes
            //      at (9,6,0) / (16,9,0) / (7,14,0), sampled every 12 sim-hours to sim-day 12:
            //      ⛔⛔ **THE TABLE BELOW IS STALE IN ALL THREE COLUMNS AS OF 2026-08-06** — annotated
            //      rather than deleted, because the paragraph directly above it warns about exactly
            //      this class of rot and the block's ARGUMENT (which site is thermally durable) still
            //      rests on it. It describes the PRE-DECLUTTER ship, where `radiator_cryo` stood in
            //      the pod bay. Re-driven on THIS tree, same probes, sampled every sim-hour:
            //          day    cryo bay        spine          reactor bay
            //                 was  ->  now    was  ->  now   was  ->  now
            //           1     10.0     28.9   14.2     10.0   10.0      9.6
            //           3     10.0     33.8    8.2     11.9   10.0      7.4
            //           6     10.0     33.0    2.7      8.2    9.7      3.2
            //          10     10.0     20.5   -3.0     -3.1    4.6     -6.7
            //          12     10.0     10.6   -5.2    -14.3    2.3    -19.2
            //      ⇒ THE CONCLUSION THIS BLOCK DRAWS FROM IT IS UNCHANGED: the cryo bay is the most
            //      durable of the three sites at every sample on BOTH ships (it is the last to reach
            //      any dangerous band, and it never crosses `hypothermia_c` inside 12 sim-days while
            //      the other two do). What changed is that it is no longer FLAT, because its
            //      thermostat is now in the corridor — see the ruling block above for the full A/B.
            //      The old rows and their reasoning read:
            //      *day 1/3/6/10/12 = cryo 10.0 throughout; spine 14.2 / 8.2 / 2.7 / -3.0 / -5.2;
            //      reactor 10.0 / 10.0 / 9.7 / 4.6 / 2.3 ⇒ the cryo bay is FLAT AT 10.0 °C throughout
            //      (`radiator_cryo` thermostats it — the header's own finding, and it survives); the
            //      spine is still stageable at day 12 and crosses `hypothermia_c` near sim-day 16
            //      (EXTRAPOLATED from its -0.55 °C/12 h slope — the only unsampled number in this
            //      block), not at day 6.*
            //      ⚠️ THE SPINE'S DAY-16 EXTRAPOLATION IS RETIRED, NOT UPDATED: on this tree it
            //      crosses `hypothermia_c` between day 8 and day 9 (h192 = -1.31, h216 = -4.52,
            //      h264 = -11.00), which is a MEASUREMENT and replaces the estimate.
            //      The same-tree PRE-FIX control has the spine unstageable at day 7 and the reactor
            //      bay at day 6, so the hazard is real; this package pushed it out, it did not
            //      remove it.
            //      ⭐ AND THE REASON THE SHIP NOW COOLS FAR MORE SLOWLY IS THIS PACKAGE ITSELF: the
            //      eight extra units bring `scrubber_spine`, `scrubber_reactor`, three batteries,
            //      three lamps and `term_moss` back above their `fail`, and an operating machine
            //      emits `MachineDef.HeatKW`. ⚠️ THE HEADER'S THERMAL TABLE IS THEREFORE STALE FOR
            //      THE SHIPPED SHIP — it is annotated there; do not quote it for `--ship wreck` as
            //      it now boots.
            //   3. ⭐ WHY THE OLD 1 Parts + 2 Seals ARE NOT MOVED TOO — justified on the measurement
            //      in reason 1, NOT on the false claim that the case does not arise. IT DOES ARISE:
            //      those two tiles really do go un-stageable at h0.028 on a two-door opening. The
            //      exposure is bounded and RECOVERABLE — 0.038 sim-hours (~2.3 sim-minutes), after
            //      which the stacks reappear — where the failure this package exists to remove is
            //      PERMANENT. It also closes before the first service at h0.26, so in every leg
            //      measured here it costs nothing at all; the worst it can do is defer one
            //      recruitment pass or convert one Seals service into a free jury-rig, which is
            //      cheaper, not dearer. Against that: moving them changes which stack `FindNearest`
            //      picks (tier first, then Manhattan distance) and therefore re-opens every service
            //      timing quoted in this block, for no gain in durability. ⚠️ That is a STATED
            //      TRADE, not an absence of risk. A lane that wants the ship's whole spares stock on
            //      one thermally- and pressure-stable tile should move all three together and
            //      re-measure the h0.26 → h2.79 sequence.
            //   4. Fiction still holds, and it is not the weaker story: a cryo bay is precisely
            //      where a ship keeps the locker that has to survive everything else — beside the
            //      people it exists to keep alive — and gaskets are what a raider leaves behind.
            // ⛔ THE PARAGRAPH BELOW DESCRIBES THE PRE-2026-08-06 BAY AND IS KEPT AS THE RECORD OF
            // WHERE (9,6,0) CAME FROM, NOT AS A DESCRIPTION OF THIS SHIP. Since the declutter ruling
            // the bay's ONLY devices are the twelve capsules on x∈{2,4,6,8} × y∈{1,3,5} and
            // `term_moss` at (1,3); its floor is otherwise EMPTY, and the locker stands at (9,14,0)
            // in the reactor bay. It read:
            // *(9, 6, 0) is bare floor in the bay's bottom-right, diagonally opposite the capsule
            // the crew member wakes in at (3, 1, 0): the bay's devices are `light_cryo` (1,1),
            // `term_moss` (1,3), `battery_cryo` (1,6), `vent_cryo` (10,1), `scrubber_cryo` (10,3)
            // and `radiator_cryo` (10,6), the twelve capsules sit on x∈{2,4,6,8} × y∈{1,3,5}, and
            // the four corpses sit on their own capsules' tiles. Probed on the built ship:
            // walkable, no device, stageable, breathable.*
            // ⭐⭐ AND THE LOCKER LEFT THE CRYO BAY ON 2026-08-06 — THE OWNER'S RULING OVERRIDES
            // REASONS 1–4 ABOVE, AND THE PARAGRAPHS ARE KEPT BECAUSE THREE OF THEM STILL BIND.
            // "There should only be the capsules and a terminal." Eight Seals on the bay's floor are
            // eight of the twenty-six things the bay drew, so they go — and they go to the REACTOR
            // BAY, beside the `spares` and `gaskets` this block's reason 3 declined to move.
            //
            // ⚠️ REASON 3 IS THE ONE THIS PACKAGE IS ANSWERING, AND IT NAMED THIS LANE IN ADVANCE:
            // *"A lane that wants the ship's whole spares stock on one thermally- and
            // pressure-stable tile should move all three together and re-measure the h0.26 -> h2.79
            // sequence."* That is exactly what happened. All three stacks now sit in one compartment
            // and the sequence was re-driven; the receipts are in the `cabin stores` block below,
            // which is where the ship's whole consumable budget is reasoned about.
            //
            // ⛔ WHAT IT COSTS IS REASON 1, AND IT IS NOT WAIVED — IT IS ACCEPTED AND PRICED. Opening
            // BOTH doors of the column takes the reactor bay's stock tiles un-stageable from h0.028,
            // so from 2026-08-06 that exposure covers the ship's ENTIRE consumable pile rather than
            // three of its eighteen units. It is bounded (0.038 sim-h, ~2.3 sim-minutes), RECOVERABLE
            // (the stacks reappear at h0.066) and it closes BEFORE the first service at h0.26, so in
            // every leg measured it costs nothing; and `LooseMatter.TryPay` has no position term at
            // all, so the PLAYER can always spend it regardless. Reason 2 (thermal) is unchanged and
            // still cannot bite: the reactor bay reads 10.0 °C at day 1 and does not cross
            // `hypothermia_c` inside any window in which this pile still exists.
            // ⇒ THE HONEST SUMMARY: the ruling traded a measured, bounded, recoverable pressure
            // exposure for the owner's decluttered pod bay. That is a content decision, taken by the
            // owner, and it is recorded here rather than smoothed over.
            //
            // (9, 14, 0) probed on the built ship: walkable, no wall, no device, no other item,
            // stageable and breathable. It extends the reactor bay's existing stock row (x 2..8 at
            // y 14) by exactly one tile, so the ship's loose matter reads as one run of crates.
            plan.Items.Add(new ItemSpec
            {
                Kind = ItemKind.Seals, Count = 8,
                Pos = new Int3(reactor.X0 + 8, stockY, 0), Label = "damage-control locker",
            });
            // ⛔ KNOWN LIMITS OF THIS FIX, STATED HERE BECAUSE THE NUMBER ABOVE LOOKS LIKE A
            // GUARANTEE AND IS NOT ONE. All three EXIST by measurement, not by fear — each is
            // reproduced by a driven test in `WreckRepairEconomyTests`. ⚠️ But the "how much would
            // it take to close them" figures inside 1 and 2 are an UPPER BOUND and an ESTIMATE
            // respectively, and say so where they appear; do not quote either as a threshold.
            //  1. `tank_reserve` (WaterTank 0.21) still ends an unattended 3-day run permanently
            //     unfixable at 0.123. It is not on the board at boot, so the pile is gone before it
            //     asks. Covering it needs ~4 more units — 15 in total. MEASURED ONE-SIDED ONLY:
            //     Count 8 -> 12 reddens KnownLimit_TankReserve_IsStillStrandedAndThatIsDeliberate,
            //     so 15 units is SUFFICIENT; whether 14 would also do it was NOT run, so read 15 as
            //     an upper bound and not as a threshold. It buys nothing durable either way:
            //     WaterTank `maint`
            //     is 0.20, BELOW the 0.25 floor, so its free jury-rig band is empty (wear.def says
            //     so) and it needs a consumable EVERY cycle for ever. The same is true of every
            //     Light and Terminal on this ship. That recurrence is the ongoing salvage economy,
            //     not a soft-lock, and no authored quantity closes it.
            //  2. ⛔ OPTION (a) DOES NOT CLOSE THE SOFT-LOCK IN GENERAL, AND THAT IS MEASURED.
            //     `RecruitForNeediest`'s queue is GLOBAL and unsteerable, and every compartment the
            //     player pressurises inserts its wrecked machines into it. Driven with the SINGLE
            //     door at (16,7,0) opened at tick 0 — the compartment this ship's own GoalSpec
            //     names, i.e. ONE CLICK, the move the game itself directs the player toward —
            //     THREE frontier machines (light_d0_s1 0.040, recycler_1 0.090, machineshop_1 0.130)
            //     outrank `wing_b` (0.18) and it ends at 0.148, below the floor and unfixable, at
            //     eleven units and at twelve. Covering every single-compartment opening takes
            //     ~19-22 (an ESTIMATE: at 22 with two doors open, 3 are left over), which would
            //     auto-repair the whole deck-0 frontier and delete the salvage game. ⇒ THE GENERAL
            //     FIX IS THE WORK-PRIORITY GRID (M2), not a bigger pile; this number removes the
            //     soft-lock as the DEFAULT OUTCOME, which is what it can honestly do.
            //  3. The `Swarf` rung is real but ZERO-SUM inside the core: `deconstruct.device_swarf`
            //     pays exactly 1 unit per stripped wrecked device and a service consumes exactly 1,
            //     so a repair always costs the machine that funded it. Pinned at its root by
            //     `WreckRepairEconomyTests.KnownLimit_TheSwarfRungIsZeroSum_OneUnitPerStrippedWreck`.
            //     Measured: condemning all ten strippable in-air wrecked machines at boot (14 tried,
            //     4 CryoPods refused; 626 devices → 616 ON THE PRE-M2-11 TREE, whose deck-0 tray
            //     held 554 tiles against today's 539 — 23 taps gone, 8 bulkhead runs added, net
            //     −15 — so the ten strips are unchanged but do NOT re-quote 626/616 against
            //     today's 612) DOES lift every wing clear of the floor —
            //     at the price of `term_moss`, both core scrubbers and both remaining batteries.
            //     ⚠️ THE END CONDITIONS ARE HORIZON- AND TREE-DEPENDENT AND DO NOT REPRODUCE: this
            //     lane measured wing_b/wing_c 0.763 / 0.706 at 3 sim-days pre-rebase; review
            //     measured 0.959 / 0.901 at h24 on the merged tree. The CONCLUSION is identical
            //     either way and rests on "clear of the floor and fixable", never on the figures —
            //     which is why no test pins them.

            // ------------------------------------------------------ the cabin stores (D7, 2026-08-03)
            // ⭐ SEVEN PARTS, AND THEY EXIST SO THE PLAYER CAN BUILD SOMETHING THAT IS NOT A WALL.
            // Owner, live play 2026-08-03: "I cannot build anything except the walls." Same shape as
            // M1-I directly above and for the same reason — the answer to a soft-lock on this ship is
            // AUTHORED CONSUMABLES, not a softened floor. `build.device_place_cost` is NOT touched;
            // neither is `deconstruct.def`, `LooseMatter.TryPay`, nor the maintenance spend rule.
            //
            // ⛔ THE DEFECT, DRIVEN ON THIS TREE BEFORE THE FIX (ShipPlanBuilder.Build + the default
            // stack, no player input, one full sim-day = 864 000 ticks):
            //   * `build.device_place_cost` is 3 PARTS per furniture piece and the ship authored
            //     exactly ONE. Affordable(Parts) = 1 < 3 AT TICK 0 ⇒ every tool on the Room Zoom
            //     palette — Bed, Desk, Chair, Locker, PlantPot, Light, GrowBed, MedBed, Table,
            //     Heater — refuses on the very first click, for the whole game. Nothing is wired
            //     wrong; the ship simply cannot pay. The one in-game Parts source is
            //     Regolith → Scrap → Parts, three benches deep BEHIND the pressure frontier.
            //   * And the one Parts does not even survive: grant Repair on the WORK tab and
            //     `MaintenanceSystem` fetches TIER BEFORE DISTANCE (`RepairConsumableTier(0)` is
            //     Parts), so it goes into `wing_c` at tick 9211 — h0.256, fifteen sim-minutes after
            //     the player's first work grant — and Parts is 0 for ever after.
            //
            // ⭐ THE DERIVATION OF 7 — A FLOOR OF TWO PIECES AND A CEILING THE SHIP'S OWN DISCLOSED
            // ECONOMY SETS. Neither end is a taste:
            //   FLOOR — `device_place_cost` is 3, so six Parts is exactly two furniture pieces: the
            //   bunk, and the locker beside it. `RoomDresser.Dress` is deliberately NOT called on
            //   this ship (see the header — "a raided ship has no bunks left"), so these are the
            //   only cabin fittings aboard and the raiders' one oversight.
            //   CEILING — SEVEN is the largest cache that leaves M1-I's KNOWN LIMIT 1 below exactly
            //   as M1-I measured it, and the cliff was BISECTED rather than estimated. With a big
            //   enough pile the boot backlog runs dry before the D3 reserve does, so units are still
            //   on the deck when `tank_reserve` joins the board at ~h10 and the ship silently
            //   repairs its own water tank. Driven to h12 with all work granted, one leg per size:
            //     crates  total units   tank_reserve at h12   min Affordable(Parts), h0..h1
            //       0         11          0.195  unfixable              0
            //       3         14          0.195  unfixable              0
            //       6         17          0.195  unfixable              3
            //       7         18          0.195  unfixable              4   ← SHIPPED (the last one)
            //       8         19          0.895  FIXED — LIMIT GONE     5
            //       9         20          0.895  FIXED — LIMIT GONE     —
            //      12         23          0.895  FIXED — LIMIT GONE     —
            // The obvious bigger number is TWELVE — `RoomDresser.DressQuarters`
            // (`RoomDresser.cs:63-76`) is this repo's own declaration of a furnished crew cabin
            // (Bed + Chair + Locker + Desk, four pieces × 3) — and it is two units past the cliff.
            // Whether the wreck should self-repair its water tank is a CONTENT DECISION and it is
            // the owner's: `WreckRepairEconomyTests.KnownLimit_TankReserve_IsStillStrandedAndThatIsDeliberate`
            // exists to force exactly that deliberation ("if this ever goes green, either the stock
            // grew or a def moved — both are decisions someone must take deliberately"). So this
            // package stops ON the cliff and changes nothing about the repair economy M1-I
            // measured; a full-cabin budget is FILED for the owner, not taken here.
            // ⚠️ SEVEN IS THE LAST SAFE VALUE, so ONE more consumable unit authored ANYWHERE on this
            // ship flips that limit. That is deliberate and it is guarded loudly rather than left to
            // margin: the M1-I test above goes red and names the tank.
            //
            // ⛔⛔ READ THIS BEFORE MERGING, RE-SIZING OR COPYING THIS BLOCK — **PARTS IS THIS
            // SHIP'S UNIVERSAL CURRENCY, SO AUTHORING PARTS FOR FURNITURE RE-PRICES THE WHOLE
            // OPENING.** Four systems spend the same pile and none of them can tell the piles apart:
            //   1. `MaintenanceSystem` — Parts is `RepairConsumableTier(0)`, fetched FIRST;
            //   2. `ThawGate` rungs 3 and 4 (1 and 2 Parts) — priced through `LooseMatter.Affordable`;
            //   3. `PlaceDeviceCommand` — `build.device_place_cost`, the same lens;
            //   4. MOSS commissioning, via ControllerModule (2 Parts at the MachineShop).
            // ⇒ THE CONSEQUENCE LADDER, DRIVEN, ONE SIM-DAY PER ROW, ALL WORK GRANTED AT TICK 0
            // (`extra` = crates authored here; `Parts aboard` includes the reactor bay's 1 `spares`):
            //   extra  Parts   brownout entries   wing_b     one piece    ≥1 piece buyable  tank at
            //          aboard  in a sim-day       at h24     buyable?     all through h1    h12
            //     0      1            9            0.100        no             no          0.183
            //     1      2            9            0.100        no             no          0.183
            //     2      3            0            0.802       yes             no          0.183
            //     3      4            0            0.802       yes             no          0.183
            //     4      5            0            0.802       yes             no          0.182
            //     5      6            0            0.802       yes             no          0.183
            //     6      7            0            0.802       yes            yes (3)      0.183
            //     7      8            0            0.802       yes            yes (4)      0.182  ← SHIPPED
            //     8      9            0            0.802       yes            yes (5)      0.895
            // ⛔ **THE TWO BANDS DO NOT OVERLAP, AND THAT IS THE HEADLINE.** One furniture piece
            // needs THREE Parts aboard; the wreck stops browning out at THREE Parts aboard. There is
            // NO cache size that lets the player place a bunk and leaves the ship's power crisis
            // standing — because the second and third spare Parts are exactly what autonomy needs to
            // lift `wing_b` (0.18, stranded below the wreck floor under D3's reserve), and a lifted
            // wing closes the deficit that IS the brownout.
            // ⛔ AND THE THAW LADDER MOVES AT THE FIRST EXTRA UNIT: rung 4 (Mbeki) costs 2 Parts, so
            // ONE spare Part takes his capsule out from behind the crafting ladder. No placement
            // avoids it — `ThawGate` reads `LooseMatter.Affordable`, which has no position term.
            // ⇒ FILED FOR THE OWNER, NOT SETTLED HERE (and the affected fixtures say so at their own
            // sites: `ChronicleSignalTests.WreckInPowerDeficit` now strips this cache by name to get
            // a browning-out ship, and `WebPodBayTests` re-derived its rung count from 4 to 3).
            // The one lever this package did NOT pull, recorded so the next lane does not have to
            // rediscover it: `MaintenanceSystem.FindNearest` refuses a stack whose tile fails
            // `WorksiteSafety.CanStageWorkerAt`, while `LooseMatter.TryPay` has NO position term at
            // all — so a cache on an UNSTAGEABLE tile is invisible to maintenance and still
            // spendable by the player, which would preserve rows 1 and 2 above (brownouts, wing_b,
            // tank) and only the thaw rung would move. It is not taken because it builds content on
            // a simplification `PlaceDeviceCommand`'s own class doc marks as temporary ("the
            // material teleports … the LOGISTICS are not modelled"), and because the integrator's
            // ruling for this package named the boot-air rooms.
            // ⭐ THE SECOND ALTERNATIVE, FILED HERE SO BOTH LIVE AT ONE SITE — and it is the only
            // combination MEASURED that delivers the owner's sentence with the power crisis intact:
            // RE-PRICE instead of stocking. `build.device_place_cost` 3 → 2 with
            // `deconstruct.device_parts` 2 → 1 (the pair is forced: `DefsDefaultTests`.
            // `Build_DevicePlaceCost_StrictlyExceedsTheBestPossibleStripYield` wants cost > yield AND
            // a 50-70 % recovery band, which 2/1 satisfies at exactly 50 %), plus a cache of ONE
            // crate ⇒ 2 Parts aboard buys a piece, and the ladder above says 2 Parts aboard still
            // writes NINE brownout episodes with `wing_b` at 0.100. ⛔ It is route (b), so it MOVES
            // P4 AND P5 and re-prices every strip in the game — the owner's call, which is why this
            // package did not take it. ⚠️ And route (b) ALONE cannot work: cost must reach 1 for the
            // pre-D7 ship's single Parts to buy anything, and at cost 1 the yield must be 0, which
            // puts recovery outside the band. Stocking and re-pricing are complements here, not
            // rivals.
            //
            // ⭐ SEVEN ONE-UNIT CRATES AND NOT ONE STACK OF SEVEN — the shape is load-bearing, and the
            // reason is `MaintenanceSystem`'s documented carried-stack blackout
            // (`MachineWearSystem.HasAutonomouslySpendableStock`'s last paragraph): `DriveWorker`
            // picks up the WHOLE stack for a ONE-UNIT service, and `LooseMatter.Affordable` skips
            // `CarriedBy != 0`, so while a servicer walks, a single pooled stack is worth NOTHING to
            // the build palette. Measured on the one-stack draft, all work granted, at the one-hour
            // mark: 4 Parts aboard but `Affordable` = 1 — three of them in a crew member's hands.
            // Split into units, at most ONE can ever be in transit. Same authoring shape as the
            // three `hull spoil` stacks above.
            //
            // ⚠️ THE DRAIN IS REAL, IT IS MEASURED, AND IT IS NOT CLOSED HERE — read this before
            // quoting "7 Parts" as a standing budget. Driven, one sim-day per leg:
            //   LEG A — the OD-H boot state (every work type OFF, no player input), measured on the
            //           PRE-FIX ship: Parts 1 → 1, Seals 10 → 10 at h24. ⇒ NOTHING IS SPENT AT ALL
            //           until the player grants work. Re-confirmed on the SHIPPED ship: with no work
            //           granted `Affordable(Parts)` is a flat 7 at every tick to h3. On the state the
            //           game actually boots in, this cache is PERMANENT — which is why the audit's
            //           "the ship is at 0 before a player finds the palette" is true only AFTER a
            //           Repair grant, and is corrected here.
            //   LEG B — all six work types granted at tick 0, and LEG C — Repair alone: byte-for-byte
            //           the same curve, so the whole drain is the Repair grant. Parts at h0.256, then
            //           Seals one per ~0.25 h at h0.508 / 0.759 / 1.015 / 1.268 / 1.522 / 1.773, and
            //           then IT STOPS: 4 units left at h1.773 and still 4 at h24.
            //   ⇒ D3's reserve DOES hold a floor, and the floor is TOTAL LOOSE CONSUMABLE UNITS
            //     (`MachineWearSystem.HasAutonomouslySpendableStock`, `:1006`), summed across all
            //     three rungs. ⛔ SO IT PROTECTS SEALS AND CAN NEVER PROTECT PARTS: Parts are tier 0
            //     and are always spent first, so with ten Seals aboard the drain reaches four units
            //     only after every Part is gone. No authored quantity changes that — it changes only
            //     HOW LONG, at ~4 units per sim-hour with one servicer (three of them Parts inside the
            //     first hour). The shipped eight Parts with Repair on from tick 0 leave FIVE aboard at
            //     the one-hour mark and are gone at about h2.
            //   ⇒ OWNER QUESTION, FILED not answered: should autonomous maintenance be allowed to
            //     eat the player's furnishing budget at all? A per-kind reserve, or a Parts rung the
            //     standing rule may not touch, is a SIM-CORE rule change and is not this package's.
            //   ⇒ WHAT THE PLAYER GETS, STATED PLAINLY: 3 Parts = ONE furniture piece, every extra
            //     piece 3 more. On the shipped OD-H boot state the ship holds EIGHT loose Parts (the
            //     reactor bay's 1 `spares` + these 7) and holds them for ever ⇒ TWO pieces with two
            //     units over, which are two maintenance services. Grant Repair and the budget decays
            //     at ~3 Parts per sim-hour; `Affordable(Parts)` never drops below 4 at ANY tick of
            //     the first sim-hour (driven), so a piece is always buyable in that window, and the
            //     Parts are gone at about h2.
            //
            // ⭐ WHY THE CRYO BAY, AND IT IS M1-I'S OWN MEASUREMENT SPEAKING TO THIS LANE BY NAME.
            // The block above ends with: "Kept because a future lane that authors a cache meant to
            // sit unspent must know about it." This IS that cache — under OD-H it sits unspent for
            // ever — so it goes on the one site M1-I proved durable rather than beside the reactor
            // bay's spares:
            //   * PRESSURE: opening two frontier compartments at once takes the reactor bay's stock
            //     tiles un-stageable (measured there: N from h0.028); the cryo bay never goes
            //     un-stageable in any leg.
            //   * THERMAL: the cryo bay is FLAT at 10.0 °C to sim-day 12 (`radiator_cryo`
            //     thermostats it) while the spine crosses `hypothermia_c` near day 16. An
            //     un-stageable tile is invisible to `FindNearest` — and to nothing else: the player
            //     can always spend it, because `LooseMatter.TryPay` has no position term at all.
            //   * FICTION: it is where the player wakes up. The crates stand along the bay's bottom
            //     row, inboard of M1-I's damage-control locker at (9,6,0) and diagonally opposite
            //     Rell's open capsule — the cabin fittings the raiders did not think worth taking,
            //     stowed with the people they were for.
            // ⭐⭐ AND THE CRATES LEFT THE CRYO BAY ON 2026-08-06, FOR THE OWNER'S RULING AND FOR
            // NOTHING ELSE. "There should only be the capsules and a terminal." Seven crates on the
            // bay's bottom row were seven of the twenty-six things it drew. The three bullets above
            // are kept because they are still the reasoning for a cache that must SIT UNSPENT — they
            // are simply no longer the reasoning for THIS one, whose site the owner chose.
            //
            // THE NEW SITE: the reactor bay's y = 15 row, x 2..8 — one row inboard of the ship's own
            // stock row (y = 14) and directly under it, so the whole consumable budget of the ship is
            // one readable block of crates in the compartment that already holds the power, the water
            // and the rations. The FICTION survives the move and is arguably better: cabin fittings
            // the raiders did not think worth taking, stowed in the stores bay with everything else
            // they did not take.
            //
            // ⛔⛔ RE-DRIVEN ON THIS TREE — the h0.26 -> h2.79 sequence M1-I's reason 3 demanded, with
            // ALL EIGHTEEN units in one compartment. Method identical to the block above: the
            // shipped ship, `GiveAllCrewAllWork()` at tick 0 (the WORST case, not the boot state),
            // one sim-hour sampled every tick and then out to h24.
            //   * the eleven boot-board machines are still served FIRST and the pile is still exactly
            //     empty afterwards — the queue is `RecruitForNeediest`'s and it ranks DEVICES by
            //     Condition, which no stack position can reach;
            //   * `Affordable(Parts)` never falls below 4 at any tick of the first sim-hour, so a
            //     furniture piece (3 Parts) is buyable at every tick of D7's own window;
            //   * `tank_reserve` still ends h12 unfixable — M1-I's KNOWN LIMIT 1 stands, which is the
            //     limit D7 bisected the cache size against and the one thing a move like this could
            //     silently have deleted.
            //   ⚠️ THE SERVICE TIMES THEMSELVES MOVED and are NOT re-quoted as the old ones: the
            //   walk from a worksite to the nearest stack of the right tier is a Manhattan distance
            //   and every one of those distances changed. The figures above are the properties that
            //   are load-bearing; the individual h-marks in the blocks above are HISTORY OF THE
            //   PRE-RULING SHIP. `WreckRepairEconomyTests` re-derives them by driving.
            //
            // ⭐ SEVEN ONE-UNIT CRATES AND NOT ONE STACK OF SEVEN is UNCHANGED and still load-bearing
            // for the reason given above (`MaintenanceSystem`'s carried-stack blackout). Moving a
            // cache does not merge it.
            //
            // (2..8, 15, 0) probed on the built ship: walkable, no wall, no device, no other item,
            // stageable and breathable.
            for (int i = 0; i < 7; i++)
                plan.Items.Add(new ItemSpec
                {
                    Kind = ItemKind.Parts, Count = 1,
                    Pos = new Int3(reactor.X0 + 1 + i, stockY + 1, 0), Label = "cabin stores",
                });

            // --------------------------------------------------------------- starting air
            // THE WHOLE PRESSURISED SET, and it is three names long. Everything omitted here boots
            // vacuum, which on this ship is thirteen compartments and one entire deck.
            plan.PressurizedAnchors.Add(WreckCryoAnchor);
            plan.PressurizedAnchors.Add("wreck_spine_0");
            plan.PressurizedAnchors.Add(WreckReactorAnchor);

            // ---------------------------------------------------------------------- goal
            plan.Goals.Add(new GoalSpec
            {
                Kind = GoalKind.PressurizeAnchor, Param = WreckGoalAnchor,
                Text = "Get the workshop breathing again",
            });

            // RoomDresser.Dress is deliberately NOT called — see the header (a smashed bed would be
            // permanently unrepairable and fully functional, and a raided ship has no bunks left).
            return plan;
        }

        /// <summary>
        /// Scatter wrecked machinery through one sealed hall. Devices land on the hall's top
        /// service row and its centre row, spaced two apart from the left wall — positions chosen
        /// so they survive a 2-row hull-side collapse and never land on the door apron.
        /// Every device here is authored damaged; that is what "wrecked hall" means.
        /// </summary>
        private static void AddWreckedHall(ShipPlan plan, BandPlanner.Rect r, int z,
                                           params (DeviceKind Kind, string Name, float Condition)[] devices)
        {
            for (int i = 0; i < devices.Length; i++)
            {
                bool second = i >= 3;
                int x = r.X0 + 1 + (second ? i - 3 : i) * 3;
                int y = second ? r.CenterY : r.Y0 + 1;
                Dev(plan, devices[i].Kind, x, y, z, devices[i].Name, devices[i].Condition);
            }
        }

        /// <summary>
        /// M2-11 — MAKE DECK 1 GENUINELY OFF-NETWORK. The wreck was authored believing that laying
        /// no conduit tray on deck 1 was enough; it never was. <c>PowerSystem.RebuildNetworks</c>
        /// attaches a device to a conduit on its own tile or, failing that, to the first conduit in
        /// <c>+x,-x,+y,-y,+z,-z</c> order — so every deck-1 device reached straight DOWN through the
        /// deck plate and claimed the deck-0 trunk. Measured on the pre-fix tree: 0 of 626 devices
        /// off-network, all 23 deck-1 devices on network 1, flat demand 20.40 kW.
        ///
        /// The content answer (M2-11 decision (a); the rule stays 6-way, so no other ship moves):
        /// delete the deck-0 tray tile UNDER each deck-1 device — that tile is the tap its riser
        /// came up through, and the raiders pulled the lot.
        ///
        /// ⚠️ AND THAT ALONE SHATTERS DECK 0, WHICH IS WHY THE BULKHEAD RUN BELOW EXISTS. Eight of
        /// the 23 deck-1 devices are the halls' own doors, and they sit directly above deck 0's
        /// doorways — the ONE trayed tile joining each deck-0 compartment to the spine. MEASURED
        /// with the naive cut: deck 0 breaks into NINE networks, and the cryo bay (light, scrubber,
        /// radiator, term_moss) and all three benches read UNPOWERED at tick 0. So the deck-0 trunk
        /// is re-routed to cross each bulkhead BESIDE its doorway instead of through it: a conduit
        /// at <c>(doorX - 1, doorY, 0)</c>, which is hull, not floor. Legal and inert — utility
        /// overlays are not in the tile grid (<c>Simulation.IsUtilityOverlay</c>), take no
        /// maintenance and are drawn only under the Power lens.
        ///
        /// ⭐ <b>M3-11 — ONE TAP IS NOW EXEMPT, AND EXACTLY ONE.</b> <c>vent_d1</c>
        /// (<see cref="WreckDeck1VentName"/>) keeps the deck-0 tray tile under it, so it — alone on
        /// deck 1 — is on the trunk and can be POWERED. Everything else on deck 1 is still dead.
        /// Its tap is the tile <c>vent_cryo</c> itself stands on, which is why the exemption costs
        /// the deck-0 tray nothing: that tile was never going to be cut before this vent existed.
        ///
        /// <para>THE THREE COUNTS, RE-DERIVED ON THIS TREE AND STATED SEPARATELY (never as a net —
        /// M2-11's own send-back was a comment that restated the net as the deletion count):
        /// <b>CUT 23 · EXEMPT 1 · ADDED 8</b> (the bulkhead runs). Measured after: one network on
        /// deck 0, <b>23 of 612 devices off-network</b> — that is deck 1's 24 devices minus the one
        /// exempt vent — and a <b>flat demand of 14.80 kW</b>.</para>
        ///
        /// THE TRAY, COUNTED — <b>554 tiles before, 531 with the 23 taps removed and nothing added,
        /// 539 shipped</b> (the 8 bulkhead runs). Net −15. ⚠️ The device store now reads <b>612</b>,
        /// not 611: M3-11 added one device (the vent) and moved no tray tile at all.
        ///
        /// ORDER: must run after the last deck-1 device is authored — it reads the deck-1 device
        /// list. ASSUMPTION, held by a test rather than by an argument: <c>(doorX - 1, doorY)</c> is
        /// hull on deck 0 and laterally touches trayed floor on both sides of the bulkhead. True of
        /// every SlotGridPlanner doorway (x = 5/16/27/38); if a future deck-1 door breaks it, deck 0
        /// splits and <c>WreckPowerNetworkTests</c> says so by name.
        /// </summary>
        private static void WreckCutDeck1Risers(ShipPlan plan)
        {
            var taps = new HashSet<Int3>();
            var bulkheads = new List<Int3>();
            for (int i = 0; i < plan.Devices.Count; i++)
            {
                var d = plan.Devices[i];
                if (d.Pos.Z != 1 || d.Kind == DeviceKind.Conduit) continue;
                // ⭐ M3-11 — THE ONE SURVIVING RISER. Matched by NAME, not by kind: "the deck-1
                // AirVent" would silently exempt a second vent somebody adds later, and "exactly
                // one tap" is the property WreckPowerNetworkTests pins.
                if (d.Name == WreckDeck1VentName) continue;
                taps.Add(new Int3(d.Pos.X, d.Pos.Y, 0));
                if (d.Kind == DeviceKind.Door) bulkheads.Add(new Int3(d.Pos.X - 1, d.Pos.Y, 0));
            }
            plan.Devices.RemoveAll(d => d.Kind == DeviceKind.Conduit && taps.Contains(d.Pos));
            for (int i = 0; i < bulkheads.Count; i++)
                Dev(plan, DeviceKind.Conduit, bulkheads[i].X, bulkheads[i].Y, 0,
                    $"conduit_d0_bulkhead_{bulkheads[i].X}_{bulkheads[i].Y}");
        }

        // ------------------------------------------------------ the wreck's seven sleepers

        /// <summary>
        /// ⭐ <b>M3-8 — THE SEVEN PEOPLE IN THE CAPSULES.</b> One authored sheet per living,
        /// thawable sleeper, in <see cref="ThawGate.RungOf"/> ladder order — the order the player
        /// meets them in, because the ladder is priced by capsule condition.
        ///
        /// <para>⛔ <b>THIS IS THE HOST HALF AND IT IS OPTIONAL BY CONSTRUCTION.</b> Nothing in the
        /// sim reads it. A thawed sleeper's COMPETENCE — her six skill levels and what she cannot
        /// do at all — is <see cref="SleeperAptitudes"/>, applied inside <c>CryoSystem.Open</c>, and
        /// it exists whether or not any of this prose is ever loaded. What lives here is the reason
        /// those numbers are what they are: <b>every sheet's backstory has to explain both the
        /// aptitude and the incapability</b>, or the numbers are arbitrary and the person is a
        /// stat block.</para>
        ///
        /// <para><b>WHY A ROSTER RATHER THAN <see cref="PopulateSlice"/>'s BOOT WEAVE.</b> The slice
        /// crew all exist at tick 0, so their minds are woven once, before the first tick. A sleeper
        /// does not exist until her capsule opens at some unknown later tick — so this roster is
        /// consumed by a host OBSERVING <c>CitizenThawedEvent</c> and calling
        /// <see cref="AttachSleeperPersona"/>. That is the whole architectural difference between
        /// this package and the slice's, and it is why attaching at boot is one of the mutations.</para>
        ///
        /// <para>⚠️ <b>NO <c>Relationships</c> ARE AUTHORED, DELIBERATELY.</b>
        /// <see cref="PopulateSlice"/> seeds its web with <c>SocialSystem.Nudge</c>, which writes
        /// CANONICAL SIM STATE (the SOCL fold) — safe at boot, forbidden here: this roster is
        /// consumed at RUNTIME by a host, and a host that nudges the social graph mid-run is a host
        /// mutating hashed sim state. The bonds are written into the prose instead, and a sim-side
        /// seed at thaw is FILED, not smuggled in. <see cref="PersonaGenerator.CreateAuthoredMind"/>
        /// is RNG-free and touches only the mind/fact layer, which is what makes it callable from a
        /// runtime observer at all.</para>
        ///
        /// <para>⚠️ Rell is not here: she boots awake, so she is not thawed, so no observer ever
        /// fires for her — she keeps the procedural persona <c>GameSession.GeneratePersonas</c>
        /// gives every citizen at boot. The four wrecked capsules are not here either (OD-9: they
        /// can never cycle). Seven sheets, seven thawable capsules — pinned by test against
        /// <see cref="SleeperAptitudes"/> and against <c>WreckPods</c>, so the three lists cannot
        /// drift apart silently.</para>
        /// </summary>
        public static AuthoredPersona[] WreckSleepers()
        {
            return new[]
            {
                // ── rung 1 · pod_lindqvist 0.99 ────────── Repair 9 · Construct 7 · cannot MINE
                new AuthoredPersona
                {
                    Name = "Lindqvist", RolePreRaid = "hull-seam fitter", RoleNow = "damage control",
                    Traits = new[] { "meticulous", "unbending", "stoic" },
                    Values = new[] { "finish what you seal", "never waste air" },
                    Fears = new[] { "dying in vacuum", "sleeping through an alarm" },
                    SpeechStyle = "quiet, chooses words like spare parts",
                    RaidBackstory =
                        "Twenty-one years of pressure seams, and Lindqvist has never lost one she signed. When the " +
                        "Lien blew the ring corridor she was already in the gap with a torch, closing the bay the rest " +
                        "of them are asleep in. The brace that came down across her back is why she went into a capsule " +
                        "at all — the spine set hard in the freeze, and she will stand at a seam all shift, but she " +
                        "will never again swing at a face over her own head.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "I signed this bay's pressure certificate the week before the raid. The secondary seal was out of date and I let it stand.",
                            FactText = "The cryo bay's secondary pressure seal was past certification before the raid, and Lindqvist signed the bay off anyway.",
                            RevealDifficulty = 0.6f,
                        },
                    },
                },

                // ── rung 2 · pod_ozawa 0.91 ───────────── Craft 11 · cannot CONSTRUCT
                new AuthoredPersona
                {
                    Name = "Ozawa", RolePreRaid = "bench machinist", RoleNow = "fabrication",
                    Traits = new[] { "meticulous", "sardonic", "restless" },
                    Values = new[] { "truth even when it stings", "keep the ledger balanced" },
                    Fears = new[] { "being forgotten out here", "the reactor going quiet" },
                    SpeechStyle = "short sentences, technical jargon, avoids eye contact",
                    RaidBackstory =
                        "Ozawa makes things; she does not make rooms, and the distinction is on her record in ink. A " +
                        "gantry she put her name to at Ceres dropped a rigger two decks, and the board pulled her " +
                        "structural ticket for good — out here nobody can give it back, so she will cut, turn and " +
                        "assemble anything at a bench and refuse to raise a wall. She spent the raid in the machine " +
                        "shop making a bar into a weapon nobody ever came close enough for her to use.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "The Ceres gantry was not my weld. I let the finding stand because the yard chief who signed the steel was my father.",
                            FactText = "Ozawa accepted the Ceres gantry finding to protect the yard chief who actually signed the steel — her father.",
                            RevealDifficulty = 0.75f,
                        },
                    },
                },

                // ── rung 3 · pod_ferreira 0.83 ────────── Deconstruct 11 · Haul 9 · cannot CRAFT
                new AuthoredPersona
                {
                    Name = "Ferreira", RolePreRaid = "breaker-crew hand", RoleNow = "salvage",
                    Traits = new[] { "wry", "garrulous", "superstitious" },
                    Values = new[] { "loyalty above rules", "no one eats alone" },
                    Fears = new[] { "the Lien returning", "the dark between airlocks" },
                    SpeechStyle = "clipped deck-slang, softens around food",
                    RaidBackstory =
                        "Eight years cutting dead hulls apart in the Belt taught Ferreira the order things come out of " +
                        "a ship in, and nobody aboard strips a compartment faster. A cargo " +
                        "clamp took the last two fingers and the tendon of his right hand on the morning the Lien " +
                        "arrived, so a bench is finished for him — he cannot hold fine work steady and knows it. He " +
                        "can still lift, cut and carry, and he says that is most of a ship anyway.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "I unsealed the aft airlock from the inside during the raid. It was to get two of mine out. I know what else it let in.",
                            FactText = "Ferreira unsealed the Perilune's aft airlock from the inside during the raid.",
                            RevealDifficulty = 0.8f,
                        },
                    },
                },

                // ── rung 4 · pod_mbeki 0.75 ───────────── Mine 13 · cannot REPAIR, cannot CRAFT
                new AuthoredPersona
                {
                    Name = "Mbeki", RolePreRaid = "regolith surveyor", RoleNow = "mining",
                    Traits = new[] { "stoic", "devout", "unbending" },
                    Values = new[] { "the ship comes first", "protect the young ones" },
                    Fears = new[] { "sealed hatches with someone behind them", "the water running out" },
                    SpeechStyle = "long pauses, then everything at once",
                    RaidBackstory =
                        "Mbeki reads rock the way the others read a manifest — three of the seven cannot work a face " +
                        "at all, and of those who can, the next best is six full grades below her. Others can " +
                        "get the ship its regolith; she gets it faster than any of them, and the ship's first link is " +
                        "the one everything else waits on. " +
                        "A decompression stroke on the second day of the raid took the fine control of her right " +
                        "hand: she can swing a bar and read a face, and she cannot hold a fault probe steady or work a " +
                        "bench at all. She has not once complained about it out loud.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "The survey I filed for this ship's last contract was short by half. I knew, and I let us fly on it.",
                            FactText = "The regolith survey Mbeki filed for the Perilune's last contract understated the yield by half, knowingly.",
                            RevealDifficulty = 0.65f,
                        },
                    },
                },

                // ── rung 5 · pod_bahri 0.67 ───────────── Construct 12 · cannot HAUL
                new AuthoredPersona
                {
                    Name = "Bahri", RolePreRaid = "structural engineer", RoleNow = "construction",
                    Traits = new[] { "gentle", "devout", "garrulous" },
                    Values = new[] { "no one eats alone", "finish what you seal" },
                    Fears = new[] { "the water running out", "being forgotten out here" },
                    SpeechStyle = "slow and formal, old freighter courtesies",
                    RaidBackstory =
                        "Bahri raises structure — frames, decks, bulkheads — and he is better at it than anyone this " +
                        "crew will ever hire again. A fall in dock nine years ago left his lower spine fused: he can " +
                        "stand at a frame for a whole shift and he cannot carry a load the length of a deck, which the " +
                        "ship's medic wrote into his file precisely so nobody would ever have to ask him. He talked a " +
                        "friend out of a better berth to keep him aboard the Perilune, and that friend is Osei.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "Osei only stayed on this ship because I asked him to. His capsule is one of the four that failed.",
                            FactText = "Osei turned down a berth on another ship because Bahri asked him to stay aboard the Perilune.",
                            RevealDifficulty = 0.5f,
                        },
                    },
                },

                // ── rung 6 · pod_nakamura 0.59 ────────── Craft 13 · Repair 10 · cannot DECONSTRUCT, cannot MINE
                new AuthoredPersona
                {
                    Name = "Nakamura", RolePreRaid = "controller-board technician", RoleNow = "electronics",
                    Traits = new[] { "sardonic", "haunted", "meticulous" },
                    Values = new[] { "truth even when it stings", "the ship comes first" },
                    Fears = new[] { "the reactor going quiet", "the dark between airlocks" },
                    SpeechStyle = "rapid-fire, jokes when nervous",
                    RaidBackstory =
                        "Nakamura is the only soul aboard who ever repaired a controller board instead of swapping it, " +
                        "and every board on this ship has been through his hands at least once — MOSS's included. The " +
                        "raid put a bulkhead through his pelvis and the freeze set it badly, so he works seated: no " +
                        "dig face, no demolition, no site where he would have to move fast. Put him at a bench, though, " +
                        "and there is nobody aboard better — Ozawa is the only one near him, and she knows it.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "MOSS's board was already failing before the Lien ever came aboard. I logged it serviced because we had no spare and no time.",
                            FactText = "The MOSS server's controller board was failing before the raid, and Nakamura logged it as serviced without replacing it.",
                            RevealDifficulty = 0.7f,
                        },
                    },
                },

                // ── rung 7 · pod_torres 0.51 ──────────── Repair 14 · Construct 11 · cannot MINE
                new AuthoredPersona
                {
                    Name = "Torres", RolePreRaid = "chief engineer", RoleNow = "chief engineer",
                    Traits = new[] { "unbending", "wry", "stoic" },
                    Values = new[] { "the ship comes first", "keep the ledger balanced" },
                    Fears = new[] { "the reactor going quiet", "sealed hatches with someone behind them" },
                    SpeechStyle = "few words, and the last one is the order",
                    RaidBackstory =
                        "Thirty-one years in engine spaces, the last eleven of them on this hull: there is not a system " +
                        "aboard the Perilune that Torres has not had open. Her own capsule took the worst of the raid " +
                        "of all seven, and it will cost the most to bring her back. She held the reactor's feed line open by hand through the aft " +
                        "fire and took a lungful of it doing so — one lung works now, and she will never breathe a dust " +
                        "face again, which on a ship whose every chain starts in rock is the joke she likes least.",
                    Secrets = new[]
                    {
                        new AuthoredSecret
                        {
                            SecretText = "I gave the order to freeze, and I put the four capsules with bad charge readings under the four who reached the bay last.",
                            FactText = "Torres assigned the four capsules with failing charge readings to the last four crew to reach the cryo bay during the raid.",
                            RevealDifficulty = 0.9f,
                        },
                    },
                },
            };
        }

        /// <summary>
        /// ⭐ <b>THE ATTACH.</b> Give a just-thawed sleeper her authored mind — persona sheet plus
        /// the fact-backed secret behind it — matched to <paramref name="citizen"/> BY NAME against
        /// <see cref="WreckSleepers"/>. Returns whether a sheet was found; anybody with no sheet
        /// (Rell, every crew member on every other ship) is left exactly as she was.
        ///
        /// <para>⛔ <b>TOUCHES NO SIM STATE.</b> It writes the mind store and the fact registry —
        /// host-owned, and <see cref="PersonaGenerator.CreateAuthoredMind"/> is RNG-free, so calling
        /// this at an arbitrary runtime tick neither advances <c>sim.Rng</c> nor changes anything
        /// the sim's own <c>StateHash</c> folds. <paramref name="sim"/> is taken because
        /// <c>CreateAuthoredMind</c>'s signature takes it, not because anything here mutates it.</para>
        ///
        /// <para>⚠️ IDEMPOTENT BY THE CALLER'S CHOICE, NOT BY THIS METHOD: calling it twice rebuilds
        /// the sheet and registers the secret's fact a SECOND time. The host observer fires once per
        /// <c>CitizenThawedEvent</c> and each capsule is single-use (OD-M item 6), so once is once —
        /// stated because the cheap "just call it every frame" refactor is silently wrong.</para>
        /// </summary>
        public static bool AttachSleeperPersona(Simulation sim, MindState minds, FactRegistry facts, Citizen citizen)
        {
            if (sim == null || minds == null || facts == null || citizen == null) return false;
            if (string.IsNullOrEmpty(citizen.Name)) return false;

            var sheets = WreckSleepers();
            for (int i = 0; i < sheets.Length; i++)
            {
                if (!string.Equals(sheets[i].Name, citizen.Name, System.StringComparison.Ordinal)) continue;
                PersonaGenerator.CreateAuthoredMind(sim, minds, facts, citizen, sheets[i]);
                return true;
            }
            return false;
        }

    }
}
