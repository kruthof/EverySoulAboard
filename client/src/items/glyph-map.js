// THE glyph → itemId derivation — ONE table, derived from `ITEMS`, for both SVG surfaces.
//
// WHY THIS MODULE EXISTS. Until 2026-07-26 the Level-1 Overview (`overview-scene.js`) and the
// Level-2 Room Zoom (`room-model.js`) each carried their own hand-written `ROLE_TO_ITEM` object,
// each with a comment saying it mirrored the other, and both fed from `render/glyphs.js`'s
// `SPRITE_FOR_GLYPH` (glyph → sprite *role*). That is a three-hop chain — glyph → role → itemId,
// hand-mirrored twice — re-deriving something `ITEMS` already states in one place: every registry
// entry carries the sim glyph its piece skins.
//
// The cost of the hand mirror was paid in the running game. `GrowBed` (`"`), `Terminal` (`T`) and
// `Telescope` (`x`) had **no** `SPRITE_FOR_GLYPH` entry, so on the Room Zoom the food loop and the
// door into the whole MOSS terminal rendered as VS-Z-25 dashed boxes with a raw ASCII letter in
// them — a development stopgap, shipped, found by the owner from a screenshot (HANDOVER §4l). The
// art existed the whole time (`ITEMS['hydroponics' | 'research-console' | 'sensor-array']`); only
// the `glyph` field was `null`.
//
// ⚠️ THE SENTENCE THAT STOOD HERE WAS FALSE AND IS QUOTED, NOT DELETED: *"Deriving removes the class
// of bug, not just the three instances."* **IT DOES NOT.** Independent review photographed room
// STORAGE on `--ship grid` deck 0 *after* this module landed: **seven dashed chips carrying `,` six
// times and `f` once.** Those are GROUND ITEMS (`Glyphs.ForItem` — Regolith, Potato, and four more),
// which reach the same `roomCells` → `furnitureSvg` else-branch and which this table did not
// address at all. What deriving removed was the HAND-MIRROR class: two view files that could drift
// from each other and from `ITEMS`.
//
// ⇒ THE GROUND-ITEM HALF WAS CLOSED ON 2026-07-27 by the ground-item art package, and the closure is
// STRUCTURAL rather than eight more rows: `deriveGlyphToItem` below now reads `Glyphs.ForItem`'s side
// of the registry (`kind: 'resource'`) as well as `Glyphs.ForDevice`'s, so a new `ItemKind` with a
// registry row is skinned by existing. THE LEDGER IS DOWN TO ONE ENTRY — `MetalOre`, which has ZERO
// references anywhere in `sim/` outside the glyph table and is deliberately left unskinned until it
// is a real material. Both counts are pinned by EQUALITY over in
// `client/test/device-sprite-coverage.test.js` (`NO_GROUND_ITEM_SPRITE`'s size and
// `EXPECT_CHIPPING_ITEM_KINDS`), so this sentence is prose ABOUT a pin and must be re-COUNTED
// against it, never edited by arithmetic: it read "8 entries, 7 chipping" through the E0-6 × E0-7
// wave, which was already off by one before the wave and off by two after it.
//
// `SPRITE_FOR_GLYPH` is NOT retired: it is the *WebGL/canvas* skin's table (`render/compose.js`,
// `render/webgl/batch.js`, the frozen `hosts/web/Client.html`), where roles carry facing and the
// executor switch draws growbed/terminal/doors itself. It stays exactly as it is. What is retired
// is the two SVG surfaces routing THROUGH it to reach an itemId.
//
// PURE, allocation-light, no DOM. Frozen at module load.

import { ITEMS } from './index.js';

/**
 * Device glyphs with NO dedicated piece in the 60-piece warm set, and the piece that stands in.
 *
 * ⚠️ ITS KEYS ARE NOT ALL `Glyphs.ForDevice` CHARS, AND THE SENTENCE BELOW THAT SAYS THEY ARE IS
 * QUOTED RATHER THAN DELETED — it was true until the door package (2026-07-27) and it is the exact
 * assumption that let a whole device glyph escape the coverage guard. It reads: *"Every key here is
 * a `Glyphs.ForDevice` char, so the KEY always means 'a device stands on this tile'."* The first
 * clause is now false; **the second is still true and is the one that matters.**
 *
 * `Glyphs.ForDevice` is NOT the set of device glyphs the sim projects. `GlyphMapper.DeviceGlyph`
 * (`sim/Sim.Glyph/GlyphMapper.cs:217-224`) intercepts `DeviceKind.Door` BEFORE calling `ForDevice`
 * and returns one of three chars from state — `DoorLocked 'X'`, `DoorOpen '/'`, `DoorClosed '+'` —
 * of which only `'+'` is a switch arm. So `'X'` and `'/'` are glyphs a real device really does put
 * on a real tile while being invisible to any guard whose population is `ForDevice`. That is
 * `CLAUDE.md` trap 4 (a guard whose SCOPE FILTER excludes the violation) and it is why
 * `device-sprite-coverage.test.js` now parses `DeviceGlyph`'s own body as well as the switch.
 *
 * ⚠️ THIS LEDGER SHRINKS BY DEFAULT AND GROWS ONLY DELIBERATELY. Every entry is a substitution the
 * player can see — a real device wearing another device's art — so each one is a decision with a
 * reason, not a chore. Deleting an entry means the set grew a real piece for that kind (draw it,
 * give the entry's `glyph` field in `ITEMS` the char, delete the line here). ADDING one means a new
 * `DeviceKind` shipped and a stand-in was chosen over drawing art: legitimate, but only with the
 * reason written beside the entry and the equality pin in
 * `device-sprite-coverage.test.js` bumped in the same commit, so the decision lands in a commit
 * message instead of a default.
 *
 * (The headline read "ONLY SHRINKS" until E0-7, whose `IceMelter` is the first addition. The rule
 * it was really expressing is the one above — the pin forces the decision to be made out loud —
 * and leaving the absolute wording over a live counter-example would have handed the next lane a
 * contradiction.)
 *
 * ⚠️ **THIS LEDGER IS NOT HOMOGENEOUS IN REGISTRY `kind`, AND THAT HAS ALREADY COST A LIVE BUG.**
 * Five entries point at `functional` rows; `'*'` (Light) points at `wall-lamp`, which is
 * **`cosmetic`** — the set has no functional luminaire. Every key here is a `Glyphs.ForDevice` char,
 * so the KEY always means "a device stands on this tile"; the VALUE is only the art it borrows.
 * ⇒ **A predicate over "what a glyph resolves to" must never read the borrowed piece's `kind`.**
 * `demolishTarget` did exactly that for one commit and DEMOLISH stopped working on every lamp on
 * `--ship grid` (a placeable device the player could build and then not remove); it now asks the
 * complement — is the piece a `resource` — which is a question about the tile rather than the art.
 * The same trap waits for the next reader.
 *
 * Every entry below `wall-lamp` is inherited from the two hand-mirrored `ROLE_TO_ITEM` tables this
 * module replaces, so this list started as a faithful record of what the game already drew.
 *
 * The guard (`client/test/device-sprite-coverage.test.js`) asserts every value is a real item with
 * a real builder, and that no entry here shadows a glyph a real piece already claims.
 */
export const GLYPH_SUBSTITUTE = Object.freeze({
  // WaterTank (10). The set has no water tank; the OXYGEN BOTTLE RACK is the same upright pressure
  // vessel and is otherwise unreachable art (`deviceStatus: 'new'` — no `DeviceKind.OxygenTank`).
  // — lane/paper-machines — REPOINTED from `oxygen-tank` (the warm row) to `bottle-rack` (the paper
  // one) on 2026-08-05. The SUBSTITUTION is unchanged and so is its reason: what moved is only which
  // drawing the borrow lands on, and leaving it on the warm row would have made a WaterTank the one
  // tile on the ship still projecting mock art after the whole plant was redrawn.
  O: 'bottle-rack',
  // Radiator (16). No radiator piece. SPACE HEATER is the set's only thermal fixture; likewise
  // `deviceStatus: 'new'`, so this substitution is the only way it ever reaches the screen.
  '=': 'space-heater',
  // SalvageRecycler (15). No recycler piece. THE RECLAIMER STACK is the same hopper-and-drum machine
  // silhouette; the legacy `recycler` sprite role pointed at its warm predecessor too.
  // — lane/paper-machines — REPOINTED from `water-recycler` to `reclaimer-stack`, 2026-08-05, for the
  // reason given on `O` above.
  Y: 'reclaimer-stack',
  // MedCabinet (21). No cabinet piece. LOCKER is the set's only tall closed store.
  C: 'locker',
  // Light (8). The set's luminaires are all COSMETIC (`lamp-sconce`, `flood-lamp`, `grow-lamp`, and
  // their retired warm predecessors); there is no functional light piece. A SCONCE is the closest and
  // is what both surfaces already drew.
  // — lane/paper-fixtures — ⚠️ THE VALUE MOVED FROM `wall-lamp` TO `lamp-sconce` ON 2026-08-05, and
  // the SHAPE is deliberately unchanged: this entry still points at a COSMETIC row, which is the trap
  // this ledger's header spends a paragraph on and which `room-model.test.js` uses as its named case.
  // Only the drawing changed — `lamp-sconce` is the same wall sconce in the paper/ink dialect. Making
  // Light functional is a decision about `DeviceKind.Light` and the build palette, not about art, and
  // it is NOT taken here.
  '*': 'lamp-sconce',
  // IceMelter (26, E0-7). No melter piece. COOKER is the set's only heat-into-a-box machine — a
  // dark steel cabinet with glowing elements, which is exactly what a melter is — and it is
  // otherwise unreachable art (`deviceStatus: 'new'`; no `DeviceKind.Cooker` exists). Chosen over
  // `water-recycler`, which is thematically closer but already stands in for SalvageRecycler AND
  // has its own Reclaimer row, so a third use would put three different machines on one silhouette.
  // NOTE this is the FIRST entry added to this ledger since it was written, and the header says the
  // ledger only shrinks. It grows here for the reason the header itself names as legitimate: a new
  // DeviceKind shipped and a stand-in was chosen over drawing new art, which is a decision with a
  // reason rather than a chore. Drawing a real melter piece is a job for the art lane.
  I: 'cooker',
  // Door, LOCKED (`Glyphs.DoorLocked`). ⚠️ NOT A `ForDevice` ARM — see the header. A locked door is
  // the SAME DeviceKind as a closed one, in a state `GlyphMapper.DeviceGlyph` gives its own char;
  // `sliding-door` already claims the closed char `'+'`, and one ITEMS row can claim one glyph, so
  // the second state has to be expressed here. BLAST DOOR is the set's other real door piece —
  // reinforced steel with two hazard bands — and "sealed, do not pass" is exactly what locked means.
  // Using a DIFFERENT piece rather than the same one is deliberate: the SVG furniture layer ignores
  // `cell[1]` entirely, so `GlyphColor.Locked` (GlyphMapper.cs:243) reaches neither surface, and the
  // art is the only channel left that can tell a player a door is locked rather than merely shut.
  // Reachable today through `SetDoorStateCommand(locked:)` — the TUI's lock key and the MOSS/DSL
  // device adapters — so this is live vocabulary, not a hypothetical.
  // — lane/paper-fixtures — ⚠️ THE VALUE MOVED FROM `blast-door` TO `door-blast` ON 2026-08-05: the
  // same reinforced slab with the same two hazard bands, drawn in the paper/ink dialect, where the
  // bands are the set's one accent colour rather than a red stripe. `door-sliding` claims `'+'` for
  // the same reason `sliding-door` used to, so the closed/locked pair still lands on two pieces.
  X: 'door-blast',
  // ⭐⭐ SolarWing (5) — owner ruling, 2026-08-06: *"Solars inside a ship make not a lot of sense."*
  // ⚠️ THIS ENTRY IS THE SECOND SHAPE THIS LEDGER HAS EVER CARRIED, AND THE DIFFERENCE IS WORTH THE
  // PARAGRAPH. Every other line here exists because THE SET HAS NO PIECE for that kind. This one
  // exists because the set's piece is not a thing that stands in a room: `ITEMS['solar-wing']` is a
  // ruled photovoltaic panel in a heavy frame, and a panel is bolted to the OUTSIDE of the hull. The
  // sim's tile is the wing's ADDRESS — where its feed comes into the ship — so what a player should
  // see standing on that tile is the FEED, and the panel belongs on the hull.
  //   ⇒ the Level-1 plate hangs `solar-wing` outboard (`overview-scene.js` `outboardLayer`, reached
  //     through `OUTBOARD_ITEM_FOR_KIND` below), and BOTH surfaces draw `conduit-run` on the tile.
  // ⭐ WHY `conduit-run` AND NOT NEW ART: it is the catalogue's own SERVICES piece — a wall-hung
  // cable tray with three nodes and a drop that leaves the picture on a dashed cut — and its three
  // nodes are ink-filled when POWERED and empty when not, so the feed of a generator says whether the
  // generator is delivering. No new colours, no new row, and its wrecked twin already exists
  // (`wrecked.js`, state '7%'), so the wear join is unbroken: the wreck's `wing_b` 0.18 and `wing_c`
  // 0.06 draw a wrecked feed on the tile AND a wrecked panel on the hull.
  // ⛔ IT DOES *NOT* SHADOW A GLYPH A REAL PIECE CLAIMS, which is the invariant this ledger's guard
  // asserts: `solar-wing`'s registry row gave `'G'` up in the SAME COMMIT. Two rows are involved and
  // both had to move, which is why neither change is legible alone.
  // ⚠️ AND IT IS A HOMOGENEITY EXCEPTION IN ONE DIRECTION ONLY: `conduit-run` is `functional`, like
  // five of the seven entries above, so the header's "never read the borrowed piece's `kind`" trap is
  // not made worse here. Its `deviceKind` is `Conduit`, not `SolarWing` — which is exactly why a
  // NAME must never be taken from the art (`room-model.js` `DEVICE_KIND_NAMES` is the authority, and
  // it still answers "SolarWing" for this tile).
  G: 'conduit-run',
});

/**
 * ⭐⭐ <b>THE OUTBOARD LEDGER — a kind whose art does not stand INSIDE the ship.</b> Owner ruling,
 * 2026-08-06. Keyed by the sim `DeviceKind` MEMBER NAME (`room-model.js`'s `DEVICE_KIND_NAMES`,
 * which is pinned member-for-member against `sim/Sim.Core/Entities/Device.cs`), because that is the
 * one identity of a tile's machine that does not depend on what is drawn on it.
 *
 * <p>THE ONE READER is `overview-scene.js`'s `outboardLayer`: a device whose kind is in this table
 * is pulled OUT of the plate's in-room fitting layer and hung on the hull's outer edge instead, at
 * the `u` its own tile projects to. The Room Zoom has no hull to hang anything on and is untouched —
 * there the tile wears its `GLYPH_SUBSTITUTE` art like any other.</p>
 *
 * ⛔ IT IS A HAND LEDGER AND IT MUST STAY ONE. `DeviceKind → itemId` is NOT a function of `ITEMS`
 * (`items/wear.js`'s header measures this: `SolarWing` alone is claimed by `solar-panel` AND
 * `solar-wing`, and `Battery` by three rows), so a derivation would have to pick arbitrarily and
 * would pick the retired warm piece as readily as the shipped one. Every entry is a decision with a
 * reason, exactly like `GLYPH_SUBSTITUTE`.
 *
 * ⛔⛔ THE SENTENCE THAT STOOD HERE WAS A FABRICATED CITATION AND IS QUOTED RATHER THAN DELETED,
 * because it is the exact shape that makes a lie readable: *"…and `device-sprite-coverage.test.js`
 * pins the size of this table so a second kind cannot be added by habit."* **NO SUCH LEG EXISTED.**
 * It read true to a reviewer because the SIBLING ledger twenty lines up really is pinned that way,
 * in that file, by a leg with almost that wording. Measured before the legs were written: a BOGUS
 * key and a SECOND REAL KIND (`Telescope`) each left the client suite 1892/1892 GREEN.
 * ⚠️ THE TELESCOPE MUTATION'S LIVENESS READ *"from one hull piece to three"* HERE AND *"0 to 2
 * extra"* IN THE TEST FILE, AND NEITHER WAS THE SHIPPED SHIP'S NUMBER. Re-measured 2026-08-06 on a
 * LIVE `--ship wreck` host — its `devices` channel (73 rows) fed through the real `overviewScene` —
 * the plate hangs **3 pieces on the hull, and 4 with `Telescope: 'ring-array'` added**: the wreck
 * authors exactly ONE Telescope (`telescope_1`, deck 1, tile 13,2, in `hall_d1_s1`) beside its three
 * `SolarWing`s at (2,12)/(4,12)/(6,12) on deck 0. So the mutation is **3 → 4, one more piece** — it
 * is semantically live, and that is the whole point; the count was simply never taken.
 * ⇒ THE TWO LEGS NOW EXIST and are named here rather than gestured at:
 *   · `OUTBOARD_ITEM_FOR_KIND: every KEY is a real DeviceKind and every VALUE is real art`
 *   · `OUTBOARD_ITEM_FOR_KIND is pinned to its SIZE — a kind does not go outboard by habit`
 * Both were driven RED by the two mutations above and are green reverted.
 */
export const OUTBOARD_ITEM_FOR_KIND = Object.freeze({
  // The only outboard machine in the game. `--ship wreck` authors three of them in the reactor bay
  // and the power budget depends on all three (6 kW each, condition-scaled) — nothing about the SIM
  // moved with this ruling, only where the plate draws the panel.
  SolarWing: 'solar-wing',
});

// `'/'` (`Glyphs.DoorOpen`) is the third state and it is DELIBERATELY UNSKINNED — an open doorway is
// a gap, and a gap is what both surfaces already draw (`'/'` 47 is in `NON_FURNITURE`, so the Room
// Zoom's wall run has a hole in it where the door tile is). It is ledgered by name, with the reason
// and an equality pin, as `NO_DEVICE_GLYPH_ART` in `client/test/device-sprite-coverage.test.js` —
// beside `NO_FURNITURE_SPRITE`, where this repo keeps its "allowed to be unskinned" ledgers.

/**
 * Build the glyph → itemId table from `ITEMS`, then fill the gaps from `GLYPH_SUBSTITUTE`.
 *
 * ⚠️ IT READS TWO KINDS, NOT ONE, SINCE THE GROUND-ITEM ART PACKAGE (2026-07-27). `functional` rows
 * carry a `Glyphs.ForDevice` char; `resource` rows carry a `Glyphs.ForItem` char. Both switches write
 * into the SAME `GlyphCell` byte and both reach the same `roomCells` → `furnitureSvg` branch, so a
 * table that read only one of them was structurally unable to skin the other — which is exactly what
 * the header above records as the thing deriving did NOT fix. `device-sprite-coverage.test.js`
 * asserts the two switches never claim one char (they hold apart by upper/lower case today), so
 * first-wins can never silently pick a device over a pile.
 */
function deriveGlyphToItem() {
  const out = Object.create(null);
  for (const id of Object.keys(ITEMS)) {
    const e = ITEMS[id];
    // FUNCTIONAL + RESOURCE only. Materials carry `'#'` / `'.'` — six wall variants and six floor
    // variants all claiming one glyph — and those two codes belong to the wall/floor layers, never to
    // furniture. Cosmetic decor is placed by itemId and never resolved from a glyph at all.
    if (!e || (e.kind !== 'functional' && e.kind !== 'resource')) continue;
    if (typeof e.glyph !== 'string' || e.glyph.length !== 1) continue;
    // First registration wins, so the table is a deterministic function of `ITEMS` order rather
    // than of iteration luck. A collision is a registry bug; the guard fails on it by name.
    if (out[e.glyph] === undefined) out[e.glyph] = id;
  }
  for (const g of Object.keys(GLYPH_SUBSTITUTE)) {
    if (out[g] === undefined) out[g] = GLYPH_SUBSTITUTE[g];
  }
  return out;
}

/** Glyph char → the warm itemId that skins it. Frozen; derived once at module load. */
export const GLYPH_TO_ITEM = Object.freeze(deriveGlyphToItem());

/**
 * The warm itemId for a single glyph character, or `''` when nothing skins it. PURE.
 * @param {string} ch a single glyph character
 * @returns {string} an itemId in `ITEMS`, or `''`
 */
export function itemIdForGlyphChar(ch) {
  if (typeof ch !== 'string' || ch.length !== 1) return '';
  const id = GLYPH_TO_ITEM[ch];
  return id === undefined ? '' : id;
}
