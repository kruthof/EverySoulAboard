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
        /// deck 1 slot 3 is the FIRST RoomType.None entry in plan.SlotGrid — i.e. it is
        /// AddRoomCommandTests' FirstEmptyHall, which probes the slot's centre tile and asserts a
        /// sealed, AIRLESS, non-vacuum room. Debris on that probe, air in that compartment, or an
        /// opened door would each break the ＋ADD ROOM contract and that test.</summary>
        private static readonly int[] GridWreckSlots = { 5, 6, 7 };

        /// <summary>The one wreck the crew are ALREADY cutting into: its door boots open, its
        /// compartment boots pressurised and its debris boots DESIGNATED, so the dig loop is live
        /// on the standard play ship from tick 0 with no player input and no harness flag — the
        /// grid ship's analogue of the slice's opened door_aft + designated aft field.
        ///
        /// ⚠️ IT IS A TYPED ROOM, NOT A HALL, AND THAT IS A CLIENT CONTRACT. An air-filled slot
        /// reads OCCUPIED to <c>GameSession.ResolveSlot</c>, and the Overview draws an occupied slot
        /// as a room — no ＋ADD ROOM chip, and a label of <c>roomLabel(roomType) || anchorName</c>
        /// (<c>client/src/ui/decks-model.js</c>, <c>deckSlotView</c>). Left as
        /// <c>RoomType.None</c> (this package's first draft) it therefore rendered as a room
        /// LABELLED WITH ITS INTERNAL ANCHOR ID — "hall_d1_s6" — in an UPPERCASE-label UI, and
        /// could never be commissioned out of that state either, because <c>AddRoomCommand</c>
        /// returns early on <c>TotalMoles &gt; 0</c> (Commands.cs:483). A typed slot has a real
        /// label, needs no commissioning, and boots its door OPEN by construction
        /// (<c>SlotGridPlanner.Carve</c>: <c>IsOpen = !empty</c>).
        ///
        /// The other two wrecks boot as every other empty hall does (RoomType.None, door closed,
        /// airless, undesignated): they are the player's own work, reached either by ＋ADD ROOM
        /// (which opens the door and fills the compartment) or by opening the door directly, and
        /// then by painting DIG. The ClearAllDebris goal needs all three, so it cannot be completed
        /// without the player using the verb.</summary>
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
            //     Goal_IsCompletable_ByTheAuthoredCrew_ViaAddRoomAndDig, so deleting them fails.
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

        private static SlotGridPlanner.SlotAssign Slot(RoomType type, string anchor) =>
            new SlotGridPlanner.SlotAssign { Type = type, Anchor = anchor };

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
        // THE PODS DO NOTHING. There is no CryoSystem, no ThawCommand, no MOSS thaw op and no
        // emergency thaw. `DeviceKind.CryoPod` is a PROP with a Condition: it draws power, sheds
        // waste heat, wears at the table's slowest rate and draws a glyph, and that is the entire
        // list. The thaw is W5 — it adds a registered system (which moves all three STATE pins by
        // itself, exactly as W0-6's four EMPTY systems did), a command, a headroom gate and a MOSS
        // screen verb, and it needs its own review. A pod that will not open is therefore CORRECT
        // on this ship today. Do not "fix" it here.
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
        // the wrecked pods are set dressing with bodies in them.
        //
        // Each dead sleeper carries an `ItemKind.Corpse` stack on the pod's own tile, named for the
        // person. That is the only way the sim has to say someone died here.
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
        // ⚠️ EVERY NON-CORE SLOT IS AN EMPTY HALL FOR A MECHANICAL REASON, NOT A FICTIONAL ONE.
        // `SlotGridPlanner.Carve` boots a TYPED slot's door OPEN and an empty hall's door CLOSED
        // (`IsOpen = !empty`). A typed airless slot would therefore vent the core through its own
        // open door at tick 0. The two typed rooms are exactly the two that boot with air.
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
        //   scrubber_ls      0.08  wrecked  hall_d0_s3      — behind the frontier (airless)
        //   scrubber_d1      0.06  wrecked  deck 1          — behind the frontier AND off-network
        // ⇒ THREE of them stand inside the survivable core, so a player who never opens a door can
        // still bring the ship to its eight-crew ceiling. The other two are headroom for later.
        //
        // The same argument does not bind for O2: an `AirVent` injects from an unmodelled reserve at
        // 30 mol/s, which is orders of magnitude above eight people's draw, so ONE working vent is
        // enough and the others are redundancy.
        //
        // ---------------------------------------------------------------------------------------
        // POWER — AND A SHIPPED RULE THAT DELETES THE OBVIOUS DESIGN
        // ---------------------------------------------------------------------------------------
        // ⚠️ GENERATION IS CONDITION-BLIND. `PowerSystem.cs:174-185` says so in its own comment:
        // "a wrecked SolarWing still supplies its full kW", with no `IsOperational` gate and no
        // `EffectiveRate` factor. So "repair a wing to get the benches running" IS NOT EXPRESSIBLE
        // — a wing at 0.06 generates exactly what a wing at 1.00 does. This was found by reading
        // the system, after the first draft of this ship had been authored around the opposite
        // assumption. It is reported as a finding, not worked around.
        //
        // ⇒ Power on this wreck is a fixed authored budget, and it is authored GENEROUS: three
        // SolarWings (18 kW) against ~12.6 kW of total demand, so every tier is served from tick 0
        // and stays served. That is a decision with a cost — it means the wreck's scarcity is
        // MATTER and AIR, never watts — and it is the honest one, because the alternative (a tight
        // budget) browns out `PowerTier.Industry` permanently, the three benches never run, and the
        // matter ladder that ends in a ControllerModule becomes unreachable. An unwinnable opening
        // is worse than an easy one.
        //
        // The wings are still authored damaged (0.31 / 0.18 / 0.06). That is not decoration for its
        // own sake: they are a maintenance sink and three more Swarf-priced repair jobs, and the
        // owner's art badges every wrecked piece. It just is not a power lever.
        //
        // Deck 0 carries a full conduit tray; DECK 1 CARRIES NONE. Off-network devices "contribute
        // nothing either way" (same PowerSystem block), so deck 1's ruined machinery neither draws
        // nor runs — the raiders cut the risers, and the ship's whole power ledger is one deck.
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
        //   * BOOT STOCK: 12 Regolith, 3 Scrap, 1 Parts, 2 Seals, in the reactor bay, in air.
        //     ⇒ 3 free services from Parts+Seals before any salvage is needed, and 12 Regolith is
        //     already 1.5× the 8 the module wants.
        //   * SWARF: every strip of a device below Condition 0.5 pays 1 Swarf. ⚠️ THESE NUMBERS ARE
        //     RE-COUNTED OFF `WreckShipTests.PrintTheBootCensus` DRIVING THE REAL SHIP, NEVER
        //     recomputed from a previous draft's arithmetic — the first version of this paragraph
        //     was wrong in every figure. This ship authors 44 such devices (the census's
        //     "worth SWARF if stripped" line), of which NINETEEN stand in the boot core:
        //       cryobay        8 — the four wrecked pods, light_cryo 0.18, radiator_cryo 0.36,
        //                          battery_cryo 0.11, term_moss 0.14
        //       wreck_spine_0  2 — scrubber_spine 0.09, light_spine_0 0.16
        //       reactor        9 — wing_a/b/c, battery_1, battery_2, tank_reserve,
        //                          radiator_reactor, light_reactor, scrubber_reactor
        //     So the salvage rung can bootstrap without opening a single door, by a wide margin.
        //     (Two of the nineteen must NOT be stripped in practice — radiator_cryo and
        //     radiator_reactor are the survivable core's thermostats — and four of them are the
        //     dead sleepers' capsules, which `DeconstructSystem` now REFUSES outright. Call the
        //     freely-strippable core stock thirteen.)
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

        /// <summary>The reactor bay: deck 0, slot 4 — directly below the cryo bay, so the walk from
        /// the pawn's pod to the ship's power, water and opening stock is the length of one
        /// compartment.</summary>
        public const int WreckReactorSlot = 4;
        public const string WreckReactorAnchor = "reactor";

        /// <summary>The goal's subject: deck 0's slot-1 hall, the compartment that holds the
        /// SalvageRecycler and the MachineShop. Airless and sealed at boot.</summary>
        public const string WreckGoalAnchor = "hall_d0_s1";

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
        /// EIGHT LIVING — one already open (the pawn the player starts with) and seven intact and
        /// occupied, thawable one at a time through MOSS (W5). Eight is the owner's design target
        /// and is NOT tunable here.
        ///
        /// FOUR WRECKED — dead sleepers, in addition to the eight. Four is this lane's number and
        /// IS tunable; see the header.
        ///
        /// Every living pod is authored comfortably above <c>wear.wreck_threshold</c>: they are the
        /// seven people the whole game is about, and a capsule that decayed below the floor while
        /// the player was busy elsewhere would quietly cost them a crew member with no message
        /// anywhere. At the CryoPod wear rate (0.001/h) the lowest of them takes ~480 sim-hours to
        /// reach its `maint` threshold at all.</summary>
        private static readonly PodSpec[] WreckPods =
        {
            // row 1
            new PodSpec { X = 2, Y = 1, Who = "Rell",      Open = true,  Condition = 1.00f },
            new PodSpec { X = 4, Y = 1, Who = "Ozawa",     Open = false, Condition = 0.91f },
            new PodSpec { X = 6, Y = 1, Who = "Vance",     Open = false, Condition = 0.04f, Dead = true },
            new PodSpec { X = 8, Y = 1, Who = "Mbeki",     Open = false, Condition = 0.86f },
            // row 2
            new PodSpec { X = 2, Y = 3, Who = "Torres",    Open = false, Condition = 0.78f },
            new PodSpec { X = 4, Y = 3, Who = "Sokolov",   Open = false, Condition = 0.07f, Dead = true },
            new PodSpec { X = 6, Y = 3, Who = "Lindqvist", Open = false, Condition = 0.94f },
            new PodSpec { X = 8, Y = 3, Who = "Bahri",     Open = false, Condition = 0.83f },
            // row 3
            new PodSpec { X = 2, Y = 5, Who = "Iqbal",     Open = false, Condition = 0.03f, Dead = true },
            new PodSpec { X = 4, Y = 5, Who = "Ferreira",  Open = false, Condition = 0.88f },
            new PodSpec { X = 6, Y = 5, Who = "Nakamura",  Open = false, Condition = 0.81f },
            new PodSpec { X = 8, Y = 5, Who = "Osei",      Open = false, Condition = 0.06f, Dead = true },
        };

        /// <summary>The one crew member who woke up. Stands beside the open capsule, on the bay's
        /// own floor, in the ship's only air.</summary>
        public const string WreckCrewName = "Rell";

        public static ShipPlan PeriluneWreck()
        {
            var plan = new ShipPlan { Name = "MSV Perilune (wreck)", Seed = WreckSeed };

            // Deck 0 — the surviving deck. TWO typed rooms (which boot with an open door) and six
            // empty halls (which boot sealed). See the header: a typed airless slot would vent the
            // core through its own door at tick 0, so the typed set and the pressurised set are the
            // same set, by construction rather than by coincidence.
            var deck0 = new[]
            {
                Slot(RoomType.Cryo,    WreckCryoAnchor),      // slot 0 — the cryo bay
                Hall(0, 1),                                   // slot 1 — workshop bones (the goal)
                Hall(0, 2),                                   // slot 2 — fabrication bones
                Hall(0, 3),                                   // slot 3 — life-support bones
                Slot(RoomType.Reactor, WreckReactorAnchor),   // slot 4 — power, water, stores
                Hall(0, 5),                                   // slot 5 — stripped
                Hall(0, 6),                                   // slot 6 — stripped
                Hall(0, 7),                                   // slot 7 — collapsed
            };
            // Deck 1 — dead. Eight sealed halls, no conduit tray, three of them collapsed.
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
            // Deck 0 only. Deck 1's risers were cut, so its machinery is off-network and neither
            // draws nor runs (PowerSystem: "off-grid: contributes nothing either way").
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
                    // THE BODY IS AN ITEM AND THE DEATH IS A LOG LINE — and that is the WHOLE of it,
                    // deliberately. `ItemKind.Corpse` has art, a label and ZERO consumers anywhere in
                    // the sim; the eulogy/Chronicle path fires on `CitizenDiedEvent`, which a sleeper
                    // who was never a `Citizen` cannot raise. Synthesising one would write a false
                    // death into the hashed event stream and send `EulogySystem` looking for a mind
                    // that does not exist. A log line is a fact; a eulogy is a relationship, and
                    // these FOUR people have no relationships because they have never been entities.
                    // (Four, not eight: this block runs inside `if (pod.Dead)`. The eight are the
                    // LIVING sleepers, who get no log line at all.)
                    plan.Items.Add(new ItemSpec
                    {
                        Kind = ItemKind.Corpse, Count = 1, Pos = new Int3(pod.X, pod.Y, 0), Label = pod.Who,
                    });
                    plan.LogLines.Add(pod.Who + " did not survive the raid — capsule breached.");
                }
            }

            // The bay's own life support is the ONE thing on this ship the raid did not finish, and
            // that is the authoring decision the pawn's life rests on. Both are above their `maint`
            // (0.40), so neither is even on the maintenance board at boot — the bay does not need
            // the player to do anything to stay breathable. The vent boots OPEN (grid's
            // `vent_spine_0` precedent): it is what refills the core after the player opens a hall
            // door, and a closed AirVent draws nothing at all (`PowerSystem.IsWanting`).
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.AirVent, Pos = new Int3(cryo.X1, cryo.Y0, 0), Name = "vent_cryo",
                IsOpen = true, Condition = 0.62f,
            });
            Dev(plan, DeviceKind.Scrubber, cryo.X1, cryo.CenterY, 0, "scrubber_cryo", 0.55f);
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

            // Everything else in the bay is wrecked, and three of the four are the bootstrap: they
            // are the strippable devices standing in breathable air, so the salvage rung can start
            // without opening a single door (the plan's W3 precondition 2).
            Dev(plan, DeviceKind.Light, cryo.X0, cryo.Y0, 0, "light_cryo", 0.18f);
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
            Dev(plan, DeviceKind.Radiator, cryo.X1, cryo.Y1, 0, "radiator_cryo", 0.36f);
            Dev(plan, DeviceKind.Battery, cryo.X0, cryo.Y1, 0, "battery_cryo", 0.11f);
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
            AddWreckedHall(plan, rects[0]["hall_d0_s3"], 0,
                (DeviceKind.Scrubber, "scrubber_ls", 0.08f),
                (DeviceKind.Reclaimer, "reclaimer_ls", 0.12f),
                (DeviceKind.Light, "light_d0_s3", 0.05f));
            // A CLOSED vent, so it draws nothing while it sits there broken — and so the player's
            // first act in this compartment is to open it, which is the one physical gesture the
            // pressure loop is built on.
            plan.Devices.Add(new DeviceSpec
            {
                Kind = DeviceKind.AirVent, Pos = new Int3(rects[0]["hall_d0_s3"].X0 + 1, rects[0]["hall_d0_s3"].Y1, 0),
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

    }
}
