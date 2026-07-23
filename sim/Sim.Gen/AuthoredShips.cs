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
            // desynchronises them — they disperse across the ship between needs, so no room
            // ever holds all eight. Names/order here are the persona-match key in SliceCrew().
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
        // airless; the furnished decks' rooms + spines boot pressurised. The crew is under
        // strict player control (HoldPosition), stationed on the pressurised, life-supported
        // lower deck, so no one ever wanders into an unbuilt vacuum hall.

        /// <summary>The grid ship's own seed — a DISTINCT identity from Perilune (20260718)
        /// and the slice (20260721).</summary>
        public const ulong GridSeed = 20260723UL;

        public const int GridWidth = SlotGridPlanner.Width;   // 45
        public const int GridHeight = SlotGridPlanner.Height; // 18
        public const int GridDepth = 8;

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
                Hall(1, 6),
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
            // O2 and a corridor scrubber, so three held crew breathe easily for days.
            Dev(plan, DeviceKind.Scrubber, 3, SlotGridPlanner.SpineY0, 0, "scrubber_spine_0");
            plan.Devices.Add(new DeviceSpec { Kind = DeviceKind.AirVent, Pos = new Int3(4, SlotGridPlanner.SpineY0, 0), Name = "vent_spine_0", IsOpen = true });
            Dev(plan, DeviceKind.Light, 20, SlotGridPlanner.SpineY1, 0, "light_spine_0");
            Dev(plan, DeviceKind.Light, 20, SlotGridPlanner.SpineY1, 1, "light_spine_1");

            // ------------------------------------------------------- ladder trunk
            // One vertical trunk at the spine centre column links all eight decks for
            // pathing (a Ladder at every deck's (LadderX, SpineY0)).
            for (int z = 0; z < GridDepth; z++)
                Dev(plan, DeviceKind.Ladder, SlotGridPlanner.LadderX, SlotGridPlanner.SpineY0, z, $"ladder_d{z}");

            // ------------------------------------------------------------- people
            // Halloran and Vega are the WORKABLE pair (HoldPosition=false ⇒ IsIdleForWork ⇒
            // they self-assign haul/build jobs): without at least one non-held crew, every
            // wall the player designates stages material forever and never raises, so the ship
            // "cannot build anything". AutoWander stays FALSE so they never idle-wander into an
            // unbuilt vacuum hall — they leave the spine only for real work (a build/haul job at
            // a designated tile), then return. Sato stays under strict player control
            // (HoldPosition) as the direct-order hand.
            plan.Citizens.Add(new CitizenSpec { Name = "Halloran", Pos = new Int3(8, SlotGridPlanner.SpineY0, 0), AutoWander = false, RevealsFog = true, HoldPosition = false });
            plan.Citizens.Add(new CitizenSpec { Name = "Vega",     Pos = new Int3(18, SlotGridPlanner.SpineY0, 0), AutoWander = false, RevealsFog = true, HoldPosition = false });
            plan.Citizens.Add(new CitizenSpec { Name = "Sato",     Pos = new Int3(30, SlotGridPlanner.SpineY0, 0), AutoWander = false, RevealsFog = true, HoldPosition = true });

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

            // Furnish every typed room by rule (empty halls / corridors are skipped).
            RoomDresser.Dress(plan);

            return plan;
        }

        private static SlotGridPlanner.SlotAssign Slot(RoomType type, string anchor) =>
            new SlotGridPlanner.SlotAssign { Type = type, Anchor = anchor };

        /// <summary>An empty hall: a real compartment with its own anchor but no room type
        /// and no furniture, for the player to build out.</summary>
        private static SlotGridPlanner.SlotAssign Hall(int z, int index) =>
            new SlotGridPlanner.SlotAssign { Type = RoomType.None, Anchor = $"hall_d{z}_s{index}" };

        private static SlotGridPlanner.SlotAssign[] EmptyDeck(int z)
        {
            var slots = new SlotGridPlanner.SlotAssign[SlotGridPlanner.SlotCount];
            for (int i = 0; i < slots.Length; i++) slots[i] = Hall(z, i);
            return slots;
        }

        // ------------------------------------------------------------ small helpers

        private static void Dev(ShipPlan plan, DeviceKind kind, int x, int y, int z, string name) =>
            plan.Devices.Add(new DeviceSpec { Kind = kind, Pos = new Int3(x, y, z), Name = name });

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
    }
}
