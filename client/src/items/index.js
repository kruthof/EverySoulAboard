// The ITEM LIBRARY registry — 82 pieces, every one of them drawn in the visual redesign's paper/ink
// dialect, keyed by a stable kebab-case itemId. Each entry pairs the pure SVG builder with its sim
// classification from docs/design/perilune-item-mapping.md.
//
// ⛔ THE WARM SET IS GONE — lane/warm-purge, 2026-08-06, on the owner's ruling. This header's own
// history is the shortest statement of what happened, and it is QUOTED rather than deleted because
// two of its claims were load-bearing and are now false:
//
//   *"The warm ITEM LIBRARY registry — the 70 STATIC pieces of docs/design/perilune-item-set.dc.html
//   PLUS one repo-authored piece (`swarf`, last row) … The registry is 120: the mock is a SOURCE for
//   it, not a definition of it … 71 → 80 → 84 → 93 → 107 → 120."*
//
//   *"AND `resource` IS NOW TWO POPULATIONS … A resource row is either LIVE … or SUPERSEDED, meaning
//   its art is still here and still builds but another row took both joins (`itemKind: null,
//   glyph: null, supersededBy: '…'`). The nine warm ground stacks are all superseded."*
//
// Thirty-eight rows were retired in one commit: fourteen from `objects.js`, thirteen from
// `fixtures.js`, nine from `resources.js` and two from `cryo.js`, all four modules deleted with them.
// Every one was UNREACHED ART — none claimed a `glyph` or an `itemKind`, and no value of
// `GLYPH_TO_ITEM` or `GLYPH_SUBSTITUTE` was one of them (re-measured in the retiring commit, not
// quoted from here). ⇒ SO THERE IS NO SUPERSEDED POPULATION LEFT: every `resource` row is LIVE, which
// `client/test/items.test.js` pins as a rule rather than as an exclusive-or.
// ⚠️ RE-COUNT 82 OFF THE TABLE, NEVER OFF THIS PARAGRAPH — `client/test/items.test.js` does.
//
// ⚠️ THE 80 *WRECKED* TWINS ARE NOT IN THIS TABLE. They live in `client/src/items/wrecked.js`, keyed
// by the PRISTINE itemId, because a wrecked piece is not a separate thing a player places — it is the
// same registry row in a state. Nothing in this file needs to know they exist; `wrecked.js` imports
// FROM here, never the other way round, so the wrecked set reverts by deleting one file. See its
// header for the join and why it is derived.
//
//
//   kind       'functional' | 'cosmetic' | 'material' | 'resource'  (mapping.md class column)
//   deviceKind  the sim DeviceKind name, for FUNCTIONAL pieces (Device.cs). Present on NEW kinds too,
//               flagged via `deviceStatus: 'new'` — those need a real sim change before they place.
//   itemKind    the sim ItemKind name, for RESOURCE pieces (ItemStack.cs).
//   glyph       the sim glyph char the piece maps to, or null (— in mapping.md)
//
// ⚠️ `resource` IS THE FOURTH KIND AND IT WAS ADDED BECAUSE THE OTHER THREE ARE ALL WRONG FOR A PILE.
// A ground stack is not `functional` (it has no `DeviceKind`; nothing places it, the sim's haul board
// moves it), not `cosmetic` (a decor piece is view-only and session-local — a pile of Regolith is
// hashed sim state and the only reason the ship's economy is visible), and not `material` (that is a
// wall/floor SKIN, not a thing on a tile). Filing one under any of the three would have made a real,
// counted, hauled entity indistinguishable from decoration in the one table both SVG surfaces read.
//
// `itemKind` CARRIES THE SIM'S OWN ENUM MEMBER NAME so the kind-byte → art mapping is DERIVED and not
// hand-mirrored: `room-model.js` joins this column to `STOCK_KINDS` (the client's one mirror of
// `ItemStack.cs`, pinned member-for-member by `stock-filter-model.test.js`) to turn the `items` wire
// channel's kind byte into a piece. Writing kind BYTES here instead would have been a fourth
// transcription of the enum, which is the defect `items/glyph-map.js` was built to remove.
//
// ⚠️ `glyph` IS LOAD-BEARING SINCE 2026-07-26: `items/glyph-map.js` derives the ONE glyph → itemId
// table both SVG surfaces skin from, straight out of this column. A FUNCTIONAL piece left at
// `glyph: null` whose `DeviceKind` the sim really projects draws a dashed VS-Z-25 "unknown" box with
// a raw ASCII letter in it, in the shipping game. `hydroponics` (`"`), `research-console` (`T`) and
// `sensor-array` (`x`) shipped exactly that way and were filled in here.
//   Their `—` in `docs/design/perilune-item-mapping.md` was NOT a decision to leave them unskinned.
// ⚠️ THE PRACTICE THAT PRODUCED THAT `—` IS RETIRED, and the past tense matters: this column USED TO
// BE cross-checked against `render/glyphs.js` `SPRITE_FOR_GLYPH` — the WEBGL skin's table — and
// growbed/terminal are drawn by that skin's own executor switch instead
// (`hosts/web/Client.html:630,634`). The SVG surfaces have no executor switch, so a `—` justified
// that way silently meant "no art" on the one standard surface. **It is NO LONGER cross-checked
// against `SPRITE_FOR_GLYPH`** (`perilune-item-mapping.md` says so in bold); the authority is
// `Glyphs.ForDevice`, mechanically, via `client/test/device-sprite-coverage.test.js`.
// (`sensor-array`'s row carried no such note at all — `x` was never drawn by anything.)
// `power-conduit` and `pipe-run` stay `null` on purpose: those ARE drawn by other layers on every
// surface, and `items/glyph-map.js` + its guard record that decision by name.
//
// ⚠️ "DOORS" USED TO BE IN THAT LAST SENTENCE AND IT WAS FALSE — quoted, not deleted, because the
// claim survived three packages and a guard was built on top of it. It read *"Doors, `power-conduit`
// and `pipe-run` stay `null` on purpose: those ARE drawn by other layers on every surface"*.
// **NO LAYER ON EITHER SVG SURFACE DRAWS A DOOR.** The Room Zoom's so-called structure layer is
// `roomMaterialTiles` → `materialLayerSvg`, which emits `kind:'wall'` for glyph 35 and
// `kind:'floor'` for glyph 46 and NOTHING else; the Overview's compartments come from the `decks`
// slot rects, not from frame codes at all. So a CLOSED door (`'+'`) inside a room rect drew the
// VS-Z-25 dashed chip carrying a raw `+`, and a LOCKED one (`'X'`) the same — and the DOOR tool on
// the Room Zoom palette builds a door that `BuildSystem.cs:226` starts CLOSED, so this was reachable
// by one first-class player gesture, not by a corner case. `sliding-door` now claims `'+'`;
// `'X'` is in `GLYPH_SUBSTITUTE`. See `client/src/items/glyph-map.js` for why `'/'` (open) is the one
// door state that correctly draws nothing.
//   decor       the non-hashed decor channel key, for COSMETIC pieces
//   material    'wall' | 'floor', for MATERIAL pieces
//   size        {w,h} — the piece's design footprint in mock px (a placement hint; from the mock).
//               ⚠️ NOTHING LAYS OUT ON IT TODAY: the only reader outside the tests is
//               `wrecked.js:wreckedInfo()`, which passes it through so a twin cannot carry a second,
//               drifting copy. That is why it can be — and now is — an HONEST number rather than a
//               tile size. The thirty fitting rows take theirs from `fittings.SIZES`, which is each
//               piece's own centimetres at ONE shared scale (`PX_PER_CM.catalogue`), so a 260 cm
//               bench reads bigger than a ∅46 cm chair; the warm-set rows below are the mock's own
//               card measurements, at roughly the same px/cm. ⛔ It is NOT the drawn tile extent —
//               that is `fittings.BOX_EXTENT`, and a rule about ink length must use that one.
//
// The two SVG views (Overview, Room Zoom) place items through this registry; `buildItem(id, opts)`
// is the tolerant entry point (unknown id → a neutral placeholder group, never a throw).

import { scene } from './helpers.js';
// — lane/warm-purge, 2026-08-06 —
// ⛔ `./objects.js`, `./fixtures.js`, `./resources.js` and `./cryo.js` ARE GONE, with `./structures.js`
// (which went the same way at lane/paper-materials). They held the pre-redesign warm drawings and
// nothing else, and every row that pointed at them has been retired on the owner's ruling. The habit
// is the one this line has recorded since the materials package: a module nothing imports is the next
// reader's invitation to draw the old art back, so it is deleted rather than left orphaned.
import * as PM from './paper-materials.js';
import * as FT from './fittings.js';
// — lane/paper-resources —
import * as PR from './paper-resources.js';
// — lane/paper-fixtures —
import * as PF from './paper-fixtures.js';
// — lane/paper-machines — the thirteen paper machines (see the section at the bottom of `ITEMS`).
import * as MC from './machines.js';

const fn = (kind, glyph = null) => ({ kind, glyph });
const dev = (deviceKind, glyph = null, deviceStatus = 'exists') => ({
  kind: 'functional',
  deviceKind,
  deviceStatus,
  glyph,
});
const cos = (decor) => ({ kind: 'cosmetic', decor, glyph: null });
const wall = () => ({ kind: 'material', material: 'wall', glyph: '#' });
const floor = () => ({ kind: 'material', material: 'floor', glyph: '.' });
/** A GROUND STACK: `itemKind` is the sim `ItemKind` member name, `glyph` its `Glyphs.ForItem` char. */
const res = (itemKind, glyph) => ({ kind: 'resource', itemKind, glyph });
/**
 * ⛔ `resSuperseded` STOOD HERE UNTIL 2026-08-06 AND IS QUOTED RATHER THAN DELETED, because its
 * argument is the one the owner overruled and the next reader has to be able to read what was given
 * up. It built A SUPERSEDED GROUND STACK: *"still a `resource` row, still a real builder, but
 * claiming NEITHER the sim kind NOR the glyph any more, because another row draws that pile now …
 * `supersededBy` names the row that took it, so the demotion is greppable"*. Nine rows carried it —
 * the eight warm mock resources and `swarf` — and its own header ended:
 *
 *   *"⛔ RETIRING THE ROWS OUTRIGHT WAS CONSIDERED AND REFUSED, with the cost measured rather than
 *   guessed … Eight of these nine have twins that are eight of the SEVENTY the mock ships, and
 *   `client/test/wrecked.test.js` walks `docs/design/perilune-item-set.dc.html`'s `brokenD` array
 *   POSITIONALLY against `MOCK_TWIN_IDS` as a bijection … Deleting them would take `MOCK_TWIN_IDS`
 *   to 62 and force a third ledger to be invented so the bijection could be relaxed. Nine dead rows
 *   cost a reader one paragraph."*
 *
 * ⇒ THE OWNER RULED THE OTHER WAY ON 2026-08-06 and all nine rows are gone, along with every other
 * warm one. The bijection is gone with them (see `client/src/items/wrecked.js`'s header for what
 * replaced it), so the reason to keep a demoted row alive has no referent — and the "two joins both
 * have to move" trap it guarded is closed the only way that cannot be half-made: THE ROW IS NOT
 * THERE. `client/test/items.test.js` pins that the superseded population is now empty and that every
 * `resource` row is LIVE, which is a strictly stronger contract than the exclusive-or it replaces.
 */

/**
 * ITEMS[itemId] = { build, size, kind, ... }. Every `build` is a pure `(opts) -> string`
 * SVG-`<g>`-fragment builder, and since 2026-08-06 every one of them draws in the paper/ink dialect.
 *
 * ⚠️ THE ORDER USED TO BE THE MOCK'S (*"objects → walls → floors → fixtures → resources, #1–#68"*)
 * and it no longer is: the mock-ordered prefix was the thing a reader could diff against
 * `docs/design/perilune-item-set.dc.html` by eye, and with the warm rows retired there is nothing
 * left to diff. What survives of that order is the position of the twenty-one rows that were IN the
 * mock and were re-drawn in place; nothing anywhere depends on it (`wrecked.test.js`'s positional
 * walk was deleted in the same commit).
 */
export const ITEMS = Object.freeze({
  // ── THE TWENTY-ONE CATALOGUE ROWS THE MOCK ALSO HAD (VR-P2) — re-drawn in place ──
  // ⚠️ `glyph: null` SINCE 2026-08-05, AND IT IS A DEMOTION RATHER THAN AN OVERSIGHT. This row is
  // catalogue 27, the CELL RACK, and it held `'B'` (`Glyphs.ForDevice(DeviceKind.Battery)`) from the
  // mock until the owner's "Capsules and cells" revision. `'B'` now belongs to `cell-sound` (34 rows
  // below), because that pair — sound cell / spent cell — is what gives a Battery an honest wrecked
  // drawing in the paper idiom; the rack has none and could only ever have been given repo-authored
  // ink damage. The shape is `airlock`'s and `blast-door`'s exactly: a second registered piece for a
  // kind whose glyph another row claims. ⇒ THE RACK IS NOW UNREACHED ART, said out loud rather than
  // left to be discovered. It is NOT deleted — every `FITTING_IDS` id must be a registry row
  // (`items.test.js` pins that both ways), and the catalogue still publishes it as piece 27. What it
  // is waiting for is a rack that HOLDS cells; the caption on card 33 ("Sits on the rack bus bars")
  // is the design's own statement that these two pieces belong together.
  'battery-bank':     { build: FT.batteryBank,     size: FT.SIZES['battery-bank'], ...dev('Battery', null) },
  'o2-scrubber':      { build: FT.o2Scrubber,      size: FT.SIZES['o2-scrubber'], ...dev('Scrubber', 'S') },
  // — lane/paper-machines — glyph 'R' moved to `reclaimer-stack`.
  'hydroponics':      { build: FT.hydroponics,     size: FT.SIZES['hydroponics'], ...dev('GrowBed', '"') },
  'cooker':           { build: FT.cooker,          size: FT.SIZES['cooker'], ...dev('Cooker', null, 'new') },
  'cooler':           { build: FT.cooler,          size: FT.SIZES['cooler'], ...cos('cooler') },
  'dining-table':     { build: FT.diningTable,     size: FT.SIZES['dining-table'], ...dev('Table', 't') },
  'bunk-bed':         { build: FT.bunkBed,         size: FT.SIZES['bunk-bed'], ...dev('Bed', 'b') },
  'desk':             { build: FT.desk,            size: FT.SIZES['desk'], ...dev('Desk', 'D') },
  'chair':            { build: FT.chair,           size: FT.SIZES['chair'], ...dev('Chair', 'h') },
  'locker':           { build: FT.locker,          size: FT.SIZES['locker'], ...dev('Locker', 'L') },
  'rug':              { build: FT.rug,             size: FT.SIZES['rug'], ...cos('rug') },
  'standing-lamp':    { build: FT.standingLamp,    size: FT.SIZES['standing-lamp'], ...cos('standing_lamp') },
  // — lane/paper-machines — glyph 'P' moved to `plant-pot`.
  // — lane/paper-machines — glyph 'd' moved to `med-cot`.
  'research-console': { build: FT.researchConsole, size: FT.SIZES['research-console'], ...dev('Terminal', 'T') },
  // — lane/paper-machines — glyph 'x' moved to `ring-array`.
  'workbench':        { build: FT.workbench,       size: FT.SIZES['workbench'], ...dev('MachineShop', 'M') },
  // — lane/paper-machines — glyph 'F' moved to `fab-cell`.
  'storage-crate':    { build: FT.storageCrate,    size: FT.SIZES['storage-crate'], ...cos('storage_crate') },
  'fuel-drum':        { build: FT.fuelDrum,        size: FT.SIZES['fuel-drum'], ...cos('fuel_drum') },

  // — lane/paper-materials — THE TWELVE MATERIALS, REDRAWN (see `./paper-materials.js`) ─────────
  //
  // ⚠️ REPLACED IN PLACE — same ids, same `kind: 'material'`, same `'#'`/`'.'` glyphs, new builders.
  // The alternative (twelve NEW rows beside the old twelve) was measured and refused, and the reason
  // it gave is HISTORY since 2026-08-06 and is quoted rather than deleted, because it names what the
  // warm-purge commit had to close before it could delete anything: *"the twin set is joined
  // POSITIONALLY to `docs/design/perilune-item-set.dc.html`'s own `brokenD` array as a BIJECTION over
  // exactly seventy mock pieces … Twelve new registry rows would each need a twin plus a
  // `NON_MOCK_TWIN` ledger entry to stay out of that join."* Both the bijection and that ledger are
  // gone; `wrecked.js`'s `TWIN_SOURCE` is a TOTAL provenance map, and a row joins it by existing.
  //
  // ⛔ AND THE FILED INCONSISTENCY IS CLOSED. This block used to end *"THE WRECKED TWINS STAY WARM,
  // and that is the wave's own FILED inconsistency rather than an oversight — charter §3's P2b"*.
  // All twelve twins were re-authored on paper on 2026-08-06 (`wrecked.js`, the material-twin block),
  // each one re-running `paintMaterial` and adding ink damage on the same frame. ⚠️ THE OTHER HALF OF
  // that note is still TRUE and still worth reading: no material twin has ever been drawn by the Room
  // Zoom — `materialLayerSvg` and the build tray's material CARDS both call `buildItem`, never
  // `buildTileItem`, because a material is a tile's SKIN and there is no `Device.Condition` for it to
  // read. The twins reach a screen only through `client/tools/wrecked-gallery.mjs` and the
  // warm-purge sheet.
  //
  // `size` is DERIVED from each piece's centimetres (`paper-materials.SIZES`) rather than from the
  // mock's identical `106 × 94` card measurement — see that constant's own header.
  //
  // ── WALLS (6) — MATERIAL ──
  'steel-bulkhead':   { build: PM.steelBulkhead,   size: PM.SIZES['steel-bulkhead'], ...wall() },
  'timber-lined-wall':{ build: PM.timberLinedWall, size: PM.SIZES['timber-lined-wall'], ...wall() },
  'blast-wall':       { build: PM.blastWall,       size: PM.SIZES['blast-wall'], ...wall() },
  'glass-partition':  { build: PM.glassPartition,  size: PM.SIZES['glass-partition'], ...wall() },
  'insulated-wall':   { build: PM.insulatedWall,   size: PM.SIZES['insulated-wall'], ...wall() },
  'hull-plating':     { build: PM.hullPlating,     size: PM.SIZES['hull-plating'], ...wall() },

  // ── FLOORS (6) — MATERIAL ──
  'steel-tan-floor':  { build: PM.steelTanFloor,   size: PM.SIZES['steel-tan-floor'], ...floor() },
  'wood-plank-floor': { build: PM.woodPlankFloor,  size: PM.SIZES['wood-plank-floor'], ...floor() },
  'grow-matting':     { build: PM.growMatting,     size: PM.SIZES['grow-matting'], ...floor() },
  'cream-tile-floor': { build: PM.creamTileFloor,  size: PM.SIZES['cream-tile-floor'], ...floor() },
  'metal-grating':    { build: PM.metalGrating,    size: PM.SIZES['metal-grating'], ...floor() },
  'carpet-floor':     { build: PM.carpetFloor,     size: PM.SIZES['carpet-floor'], ...floor() },
  // — end lane/paper-materials —

  // ── THE FIVE FITTINGS THAT SIT IN THE MOCK'S OLD "FIXTURES" RUN ──
  //
  // ⛔ THIRTEEN WARM ROWS STOOD HERE UNTIL 2026-08-06 (`sliding-door`, `airlock`, `hatch-ladder`,
  // `power-conduit`, `air-vent`, `wall-lamp`, `viewport`, `wall-screen`, `vent-fan`, `weapons-rack`,
  // `sun-lamp`, `deck-sign`, `floodlight`) and the argument for keeping them is quoted, not deleted:
  // *"⛔ RETIRING THEM WAS CONSIDERED AND REFUSED … their twins are three of the SEVENTY the mock
  // ships, and `client/test/wrecked.test.js` walks … a bijection — that walk is the whole of the
  // evidence that the other sixty-seven are transcribed correctly. Three dead rows cost a reader one
  // paragraph; a relaxed bijection costs the next lane its instrument."* The owner ruled the other
  // way; the bijection was not RELAXED but retired, and what replaced it does not need the rows.
  // Their glyphs had already moved to `door-sliding`, `deck-hatch` and `vent-grille` at
  // lane/paper-fixtures, so nothing on either surface resolved to any of the thirteen.
  'pipe-run':         { build: FT.pipeRun,         size: FT.SIZES['pipe-run'], ...dev('Pipe', null) },
  // ⭐ M3-10 — THIS PIECE STOPS BEING UNREACHED ART. It has read `deviceKind: 'Heater'` since the
  // warm set was drawn, with `glyph: null` and `deviceStatus: 'new'` because no `DeviceKind.Heater`
  // existed to project it; the only way it ever reached a screen was `GLYPH_SUBSTITUTE['=']`, where
  // the RADIATOR borrows it. `Heater = 28` now exists and `Glyphs.ForDevice` gives it `'E'`, so the
  // piece claims its own glyph directly through `deriveGlyphToItem` and the status is plain
  // `exists`. ⚠️ THE RADIATOR'S BORROW IS LEFT ALONE AND IT IS A REAL, VISIBLE CONSEQUENCE: two
  // device kinds now draw this same silhouette. Reassigning `'='` to the unused `cooler` piece was
  // considered and REFUSED here — `cooler` is registered `cosmetic`, and `glyph-map.js`'s header
  // records the live bug that came from a functional device wearing a cosmetic piece. Picking the
  // radiator's art is an OWNER call on art, not a seam call; it is FILED, not decided.
  'space-heater':     { build: FT.spaceHeater,     size: FT.SIZES['space-heater'], ...dev('Heater', 'E') },
  'shelf-rack':       { build: FT.shelfRack,       size: FT.SIZES['shelf-rack'], ...cos('shelf_rack') },
  'supply-barrel':    { build: FT.supplyBarrel,    size: FT.SIZES['supply-barrel'], ...cos('supply_barrel') },
  'herb-planter':     { build: FT.herbPlanter,     size: FT.SIZES['herb-planter'], ...cos('herb_planter') },

  // ⛔ THE EIGHT WARM GROUND STACKS AND THE TWO CRYO CAPSULES STOOD HERE, AND `swarf` AFTER THEM.
  // All eleven were retired on 2026-08-06. Their glyph and `ItemKind` claims had already been handed
  // to `client/src/items/paper-resources.js` and to catalogue 31/32 (`capsule-sealed`,
  // `capsule-open`) on 2026-08-05, so all eleven were unreached art; what kept them registered was
  // the mock bijection, quoted at `resSuperseded` above and now gone.
  //
  // ⚠️ ONE THING FROM THAT BLOCK IS STILL LIVE AND MOVES NOWHERE: *"THERE IS DELIBERATELY NO
  // `MetalOre` PIECE … `ItemKind.MetalOre` has ZERO references anywhere in `sim/` outside the glyph
  // table and the enum itself — nothing produces it, nothing consumes it, no recipe names it. It is
  // dead E3 mining vocabulary and must not be given art until it is real."* It stays in
  // `NO_GROUND_ITEM_SPRITE` (client/test/device-sprite-coverage.test.js) with that as its reason.
  //
  // ⚠️ AND ONE SENTENCE ABOUT THE CAPSULES IS STILL THE LIVE DESCRIPTION OF THE JOIN, only the rows
  // it lands on changed: *"A pod's glyph comes from its STATE: `GlyphMapper.DeviceGlyph` returns
  // `Glyphs.CryoPodOpen 'k'` for an open capsule and `Glyphs.CryoPodClosed 'K'` for an occupied
  // one, and `'K'` is additionally the `Glyphs.ForDevice` arm."* Both chars are claimed by the two
  // catalogue rows further down this table, derived by `glyph-map.js` with nothing hand-mirrored.

  // ⛔ THE `swarf` ROW STOOD HERE, AND SO DID THE LONGEST FALSE CLAIM IN THIS FILE — quoted, because
  // the correction is the more useful half and it outlived the row. The comment read *"THIS ROW IS
  // LAST FOR A REASON THAT IS NOT TIDINESS … `wrecked.test.js` walks that order POSITIONALLY …
  // inserting a non-mock row anywhere but the end shifts every row after it onto the wrong label."*
  // **FALSE, and proven false by mutation: moving the row into the middle of `ITEMS` left the node
  // suite unchanged (85 pass / 0 fail across the four files that could see it)** — the positional
  // join filtered ledgered rows out wherever they sat. ⇒ The rule that DID protect the join is the
  // one that survives the purge intact: *"a registry row either has a twin or is in the ledger"*, and
  // the position is free. `client/test/wrecked.test.js` still pins exactly that, both ways.
  //
  // `swarf` itself was `ItemKind.Swarf`'s art until lane/paper-resources gave the kind to `turnings`
  // on 2026-08-05; it was unreached from that day and retired on 2026-08-06 with the rest of the warm
  // set. Its `NO_WRECKED_TWIN` line went with it — see `turnings`' entry there, which said in advance
  // that it would.
  // ── FITTINGS (9) — THE CATALOGUE ROWS THE MOCK NEVER HAD (VR-P2) ──────────────────────────────
  //
  // `design-import/Perilune Fittings.dc.html` was the owner's buildable set and it was THIRTY pieces
  // when these nine landed. It is now THIRTY-FOUR — see the section at the very bottom of this table.
  // Twenty-one of them are the mock's own furniture wearing new art, and those replaced their
  // builders in place above — same id, same class, same glyph, new drawing. These nine have no mock
  // piece at all, so they are new rows, and they sit after `swarf` for the reason that row's comment
  // gives: the prefix above is `docs/design/perilune-item-set.dc.html` in the mock's own order, and
  // keeping it uninterrupted is what lets a reader diff this table against that spec by eye.
  //
  // ⚠️ ALL NINE ARE COSMETIC, AND THAT IS A MEASUREMENT RATHER THAN A DEFAULT. A `functional` row
  // must name a `DeviceKind` the sim really has (`items.test.js` asserts it), and every kind these
  // pieces could plausibly claim is ALREADY CLAIMED by a row above: `Chair` by `chair` (so not bench
  // or stool), `Bed` by `bunk-bed` (so not cot), `Locker` by `locker` (so not footlocker),
  // `MachineShop` by `workbench` (so not vice post). Sink, compost bin, curtain rail and shrine shelf
  // name nothing in `DeviceKind` at all. Filing any of them `functional` would mean either a second
  // piece on one glyph — which `glyph-map.js`'s first-wins rule would resolve by DECLARATION ORDER
  // rather than by decision — or a `deviceStatus: 'new'` row promising a sim change nobody has
  // chartered. Both are worse than decor, and decor is the honest state: nothing places these yet.
  // ⇒ WHEN A KIND ARRIVES for one of them, the change is this row's `...cos(…)` becoming `...dev(…)`
  // plus the two censuses that move with it; the ART does not change.
  //
  // ⚠️ AND NONE OF THEM CLAIMS A GLYPH, so `items/glyph-map.js` is untouched by this package and
  // `device-sprite-coverage.test.js`'s pins do not move: `deriveGlyphToItem` reads `functional` and
  // `resource` rows only, and a cosmetic row is placed by itemId and never resolved from a glyph.
  //
  // Their wrecked twins re-run their own pristine painter and add ink damage, and every one names
  // its source card in `client/src/items/wrecked.js`'s `TWIN_SOURCE`. ⚠️ THAT SENTENCE USED TO READ
  // *"ledgered as such in `NON_MOCK_TWIN`, which is what keeps the twin↔mock bijection … measuring
  // exactly seventy"* — the ledger was an EXCEPTION list and the bijection it protected is gone
  // (2026-08-06); the replacement is TOTAL, so these nine are in it for the same reason every other
  // row is: they exist.
  'bench':            { build: FT.bench,         size: FT.SIZES.bench,          ...cos('bench') },
  'stool':            { build: FT.stool,         size: FT.SIZES.stool,          ...cos('stool') },
  'cot':              { build: FT.cot,           size: FT.SIZES.cot,            ...cos('cot') },
  'footlocker':       { build: FT.footlocker,    size: FT.SIZES.footlocker,     ...cos('footlocker') },
  'sink':             { build: FT.sink,          size: FT.SIZES.sink,           ...cos('sink') },
  'compost-bin':      { build: FT.compostBin,    size: FT.SIZES['compost-bin'], ...cos('compost_bin') },
  'vice-post':        { build: FT.vicePost,      size: FT.SIZES['vice-post'],   ...cos('vice_post') },
  'curtain-rail':     { build: FT.curtainRail,   size: FT.SIZES['curtain-rail'], ...cos('curtain_rail') },
  'shrine-shelf':     { build: FT.shrineShelf,   size: FT.SIZES['shrine-shelf'], ...cos('shrine_shelf') },

  // ── CAPSULES AND CELLS (4) — THE OWNER'S 2026-08-05 CATALOGUE SECTION, 31–34 ─────────────────
  //
  // ⚠️ THESE FOUR ARE THE OPPOSITE OF THE NINE ABOVE, AND THE CONTRAST IS THE POINT. The nine are
  // COSMETIC because every `DeviceKind` they could plausibly claim was already claimed. All four of
  // these are FUNCTIONAL because they are drawings OF two kinds the sim really projects and has been
  // drawing warm: `CryoPod` (twelve on `--ship wreck`, eleven sealed and one open) and `Battery`
  // (three). Nothing here is placeable from the build palette — a pod and a battery are commissioned
  // and repaired, never dragged out of a tool tray — so no palette row moves with them.
  //
  // ⚠️ THE FOUR JOIN THE SIM BY TWO DIFFERENT SEAMS, AND CONFUSING THEM IS TRAP 6. 31/32 are a STATE
  // pair and their state is a GLYPH: `GlyphMapper.DeviceGlyph` reads `Device.IsOpen` and emits
  // `'K'` occupied / `'k'` open, so `deriveGlyphToItem` picks the piece with nothing hand-mirrored.
  // 33/34 are a CONDITION pair and there is no second Battery glyph to carry it — `'B'` is the kind's
  // only arm — so `cell-spent` is NOT resolved from art or from a glyph: it is `WRECKED['cell-sound']`
  // in `client/src/items/wrecked.js`, and `wear.js` picks it off the `devices` channel's own `cond`
  // byte at `WRECK_THRESHOLD`, the same predicate every other device uses.
  //
  // ⇒ `cell-spent` therefore carries `glyph: null` (it is a Battery, in a state the wire spells with
  // a number rather than a char) and is an entry in `NO_WRECKED_TWIN`: a spent cell IS
  // the wrecked state, so "a wrecked spent cell" names nothing the sim can reach. That is `swarf`'s
  // argument, in a second instance. ⚠️ RE-COUNT THAT LEDGER OFF `wrecked.js`, NOT OFF THIS COMMENT —
  // it was written when the ledger held two and the paper ground stacks brought `turnings` (the same
  // argument, third instance) the same day.
  'capsule-sealed':   { build: FT.capsuleSealed, size: FT.SIZES['capsule-sealed'], ...dev('CryoPod', 'K') },
  'capsule-open':     { build: FT.capsuleOpen,   size: FT.SIZES['capsule-open'],   ...dev('CryoPod', 'k') },
  'cell-sound':       { build: FT.cellSound,     size: FT.SIZES['cell-sound'],     ...dev('Battery', 'B') },
  'cell-spent':       { build: FT.cellSpent,     size: FT.SIZES['cell-spent'],     ...dev('Battery', null) },

  // ── PAPER GROUND STACKS (9) — lane/paper-resources, 2026-08-05 ───────────────────────────────
  //
  // The nine loose piles of the `items` wire channel, redrawn in the owner's paper/ink dialect on
  // the cabinet-oblique kit. They REPLACE the eight warm mock resources and `swarf` — see that block
  // above for the demotion and why those rows are kept — so this is a NINE-ROW ADDITION that moves
  // no sim kind and no glyph anywhere else: the same nine `ItemKind`s, the same nine `Glyphs.ForItem`
  // chars, nine different rows carrying them.
  //
  // ⚠️ THE IDS ARE NEW AND THAT IS DELIBERATE. A registry key is unique, so the redraw could not
  // reuse `regolith`/`potato`/… while the warm rows stayed registered. Each new id names the OBJECT
  // rather than the material — a spoil heap, a tuber crate, a body bag — which is the catalogue's own
  // habit, and which is the honest description of what is drawn: the sim's `Potato` is a food unit,
  // and what a hold floor actually carries is a crate of them.
  //
  //   Regolith          → spoil-heap        Seals    → seal-set
  //   Potato            → tuber-crate       Ice      → ice-block
  //   Scrap             → plate-offcut      Corpse   → body-bag
  //   Parts             → gear-set          Swarf    → turnings
  //   ControllerModule  → control-card
  //
  // ⚠️ NOTHING HAND-MIRRORS THAT TABLE. `itemKind` carries the sim's own enum member NAME and
  // `glyph` its `Glyphs.ForItem` char, exactly as the warm rows did, so `room-model.js`'s kind-byte
  // join and `glyph-map.js`'s glyph join both land here by DERIVATION. The list above is a reader's
  // aid; `client/test/paper-resources.test.js` drives the real join for every one of the nine.
  //
  // ⛔ `size` IS `PR.SIZES`, THE DERIVED ONE, never a transcription — same rule as the fittings rows:
  // a piece cannot disagree with its own drawing about how big it is.
  'spoil-heap':       { build: PR.spoilHeap,     size: PR.SIZES['spoil-heap'],    ...res('Regolith', ',') },
  'tuber-crate':      { build: PR.tuberCrate,    size: PR.SIZES['tuber-crate'],   ...res('Potato', 'f') },
  'plate-offcut':     { build: PR.plateOffcut,   size: PR.SIZES['plate-offcut'],  ...res('Scrap', 's') },
  'gear-set':         { build: PR.gearSet,       size: PR.SIZES['gear-set'],      ...res('Parts', 'p') },
  'control-card':     { build: PR.controlCard,   size: PR.SIZES['control-card'],  ...res('ControllerModule', 'c') },
  'seal-set':         { build: PR.sealSet,       size: PR.SIZES['seal-set'],      ...res('Seals', 'g') },
  'ice-block':        { build: PR.iceBlock,      size: PR.SIZES['ice-block'],     ...res('Ice', 'i') },
  'body-bag':         { build: PR.bodyBag,       size: PR.SIZES['body-bag'],      ...res('Corpse', '&') },
  'turnings':         { build: PR.turnings,      size: PR.SIZES.turnings,         ...res('Swarf', 'w') },

  // — lane/paper-fixtures —
  // ── THE PAPER FIXTURES (14) — THE SHIP'S ARCHITECTURE, REDRAWN (2026-08-05) ───────────────────
  //
  // Owner-directed: *"produce new svg materials to replace the old ones… full spectrum for release;
  // ensure the dimensionalities are correct."* These fourteen are doors, hatches, service runs, wall
  // furniture and the three luminaires — the pieces a player meets in every corridor of
  // `--ship wreck`, and the last block of the warm set still wearing the pre-redesign steel-and-amber
  // drawings of `fixtures.js` (plus `blast-door` from `objects.js`). They are drawn in
  // `client/src/items/paper-fixtures.js`, in the same paper/ink/oxblood oblique as the fittings
  // catalogue, on the same cm-space vocabulary and through the same ONE derivation of the drawing
  // scale (`fittings.geometryFor`).
  //
  // ⚠️ THEY ARE NOT CATALOGUE CARDS, and that is why they are a separate module rather than fourteen
  // more rows in `fittings.js`. `design-import/Perilune Fittings.dc.html` has no card for any of
  // them; every dimension in `paper-fixtures.SPECS` is a real-world measurement chosen here (a 1 m
  // door opening, a 40 × 40 vent grille at duct height, a floodlight's mounting height), with the
  // dimension line written into the spec's own comment the way the design document's footer asks for
  // wall-hung pieces.
  //
  // ⚠️ SIX ARE FUNCTIONAL AND EIGHT ARE COSMETIC, and the split is a MEASUREMENT rather than a
  // default — the same test `items.test.js` applies to every other row: a `functional` row must name
  // a `DeviceKind` the sim really has. `Door` (three states), `Ladder`, `Conduit` and `AirVent` all
  // exist and are all projected by `--ship wreck`; a porthole, a wall screen, an extract fan, an arms
  // rack, a deck sign and the three luminaires name nothing in `DeviceKind` at all. ⛔ THE FAN AND
  // THE LAMPS ARE THE ONES WORTH SAYING OUT LOUD: `DeviceKind.Light` exists and is projected, but the
  // set has no FUNCTIONAL luminaire and never has — `GLYPH_SUBSTITUTE['*']` borrows a cosmetic row
  // for it, which `items/glyph-map.js` records as a live trap and `room-model.js` records as a live
  // bug it already cost. That borrow is REPOINTED to `lamp-sconce` in the same commit; its shape —
  // a device wearing a cosmetic piece's art — is deliberately unchanged, because changing it is a
  // decision about `DeviceKind.Light`, not about a drawing.
  //
  // ⚠️ `conduit-run` KEEPS `glyph: null` ON PURPOSE, exactly as `power-conduit` and `pipe-run` do:
  // `Conduit` and `Pipe` share `'~'` (an intentional collision in `Glyphs.cs`) and both are
  // utility-LENS overlay lines drawn by other layers, never furniture on a tile. `glyph-map.js` and
  // `device-sprite-coverage.test.js` record that decision by name and this package does not touch it.
  //
  // Their wrecked twins have no catalogue card, so `TWIN_SOURCE` names the SECTION of
  // `client/src/items/paper-fixtures.js` each drawing comes from. (It was `NON_MOCK_TWIN` until
  // 2026-08-06, an exception list guarding a mock bijection that no longer exists.)
  'door-sliding':     { build: PF.doorSliding,    size: PF.SIZES['door-sliding'],    ...dev('Door', '+') },
  'door-airlock':     { build: PF.doorAirlock,    size: PF.SIZES['door-airlock'],    ...dev('Door', null) },
  'door-blast':       { build: PF.doorBlast,      size: PF.SIZES['door-blast'],      ...dev('Door', null) },
  'deck-hatch':       { build: PF.deckHatch,      size: PF.SIZES['deck-hatch'],      ...dev('Ladder', 'H') },
  'conduit-run':      { build: PF.conduitRun,     size: PF.SIZES['conduit-run'],     ...dev('Conduit', null) },
  'vent-grille':      { build: PF.ventGrille,     size: PF.SIZES['vent-grille'],     ...dev('AirVent', '^') },
  'extractor-fan':    { build: PF.extractorFan,   size: PF.SIZES['extractor-fan'],   ...cos('extractor_fan') },
  'hull-port':        { build: PF.hullPort,       size: PF.SIZES['hull-port'],       ...cos('hull_port') },
  'bulkhead-screen':  { build: PF.bulkheadScreen, size: PF.SIZES['bulkhead-screen'], ...cos('bulkhead_screen') },
  'arms-rack':        { build: PF.armsRack,       size: PF.SIZES['arms-rack'],       ...cos('arms_rack') },
  'deck-marker':      { build: PF.deckMarker,     size: PF.SIZES['deck-marker'],     ...cos('deck_marker') },
  'lamp-sconce':      { build: PF.lampSconce,     size: PF.SIZES['lamp-sconce'],     ...cos('lamp_sconce') },
  'grow-lamp':        { build: PF.growLamp,       size: PF.SIZES['grow-lamp'],       ...cos('grow_lamp') },
  'flood-lamp':       { build: PF.floodLamp,      size: PF.SIZES['flood-lamp'],      ...cos('flood_lamp') },

  // ── MACHINES (13) — lane/paper-machines, 2026-08-05 ───────────────────────────────────────────
  //
  // ⭐ THE SHIP'S OWN PLANT, ON PAPER. `design-import/Perilune Fittings.dc.html` is the owner's
  // catalogue of things a CREW BUILDS and it draws no machinery at all, so after VR-P2 the reactor,
  // the solar wing, the gas bottles, the reclaimer, the paste column, the med bed, the fab cell, the
  // sensor array, the dish, the plant pot, the bookshelf, the turret and the cryopod were still
  // wearing `objects.js`'s steel-and-glow mock art. That is charter §4's filed P2b in its most
  // conspicuous form, because SIX of those thirteen are glyphs the sim really projects: a wreck deck
  // drew warm art and paper art side by side on one screen. `client/src/items/machines.js` is the
  // paper half; these thirteen rows are the wiring.
  //
  // ⚠️ SIX GLYPHS MOVED, AND THE OLD ROWS ARE KEPT AT `glyph: null`. Above, each strip is marked
  // `— lane/paper-machines —` at the row it happens on:
  //     'G' SolarWing  solar-panel    → solar-wing        'd' MedBed     med-bed      → med-cot
  //     'R' Reclaimer  water-recycler → reclaimer-stack   'F' Fabricator fabricator   → fab-cell
  //     'P' PlantPot   potted-plant   → plant-pot         'x' Telescope  sensor-array → ring-array
  // ⛔ THE THIRTEEN OLD ROWS ARE GONE (2026-08-06), AND THE REFUSAL THAT KEPT THEM IS QUOTED HERE
  // BECAUSE IT IS THE CLEAREST STATEMENT OF WHAT WAS TRADED: *"DELETING THE OLD ROWS WAS CONSIDERED
  // AND REFUSED, with the cost measured rather than guessed. All thirteen are among the SEVENTY the
  // mock draws, and `client/test/wrecked.test.js` walks `docs/design/perilune-item-set.dc.html`'s
  // `brokenD` array POSITIONALLY against `MOCK_TWIN_IDS` as a bijection — that walk is the whole of
  // the evidence that the other fifty-seven are transcribed correctly … Thirteen dead rows cost a
  // reader one paragraph; a relaxed bijection costs the next lane its instrument."* The bijection was
  // not relaxed — it was RETIRED, because after the redraw no twin transcribes anything and a walk
  // over an empty population is a guard kept green forever. This lane's own note below (*"SO SAY IT
  // OUT LOUD: `reactor`, `solar-panel`, `oxygen-tank`, `water-recycler`, `paste-dispenser`,
  // `med-bed`, `fabricator`, `sensor-array`, `comms-dish`, `potted-plant`, `bookshelf`, `turret` and
  // `cryopod` ARE NOW UNREACHED ART"*) is what made the deletion measurable: it was re-measured, not
  // quoted, before the rows were removed.
  //
  // ⚠️ TWO OF THE THIRTEEN ARE `deviceStatus: 'new'`, LIKE THE ROWS THEY REPLACE. `DeviceKind.Reactor`
  // and `DeviceKind.OxygenTank` do not exist in `sim/Sim.Core/Entities/Device.cs` — checked, not
  // assumed — so neither piece can claim a `Glyphs.ForDevice` char and neither is placeable. Drawing
  // them anyway is right: the catalogue-and-registry pair is the art authority, and a machine the
  // owner asked for does not wait on an enum member. `items.test.js` pins the `new` list, so this is
  // a decision recorded in a commit rather than a default.
  //
  // ⚠️ FIVE ARE COSMETIC, AND IT IS THE SAME MEASUREMENT THE NINE FITTINGS ROWS RECORD: a `functional`
  // row must name a `DeviceKind` the sim really has. `paste-column`, `dish-mast`, `book-case`,
  // `deck-turret` and `sleeper-pod` name nothing — there is no Dispenser, Antenna, Shelf, Turret or
  // (single) Pod kind — exactly as their warm predecessors named nothing. Their decor keys are NEW
  // strings, not the old ones: the `decor` wire channel is keyed by itemId and two rows sharing a key
  // would make the local decor store ambiguous about which art a placed tile wears.
  //
  // ⛔⭐ ALL FIVE ARE UNREACHED, AND THE FIRST DRAFT OF THIS PARAGRAPH SAID OTHERWISE. It claimed the
  // SHELF palette tool "places `book-case`" and was the one draw site reaching a cosmetic piece. It is
  // not: `roomzoom-view.js`'s `cls === 'cosmetic'` branch only TOASTS `decorRefusalText(_armed)` and
  // pulses the tile — no command is sent, `addDecor` has no caller in `client/src` at all, and the
  // host's `decor` channel is a permanently empty static list (`GameSession.cs:2800-2801`,
  // `BuildDecor() => _decor`). SHELF and RUG stopped placing anything on 2026-08-04, deliberately, and
  // this lane read a live tool where there was a dead one. So the honest state: `paste-column`,
  // `dish-mast`, `book-case`, `deck-turret` and `sleeper-pod` are registered art that NOTHING draws —
  // exactly the state their five warm predecessors were already in, unchanged by this package.
  //
  // ⇒ THE REWIRE ITSELF STAYS, and it is forward-looking rather than live: `room-model.js`'s SHELF row
  // carries `itemId: 'book-case'` where it carried `'bookshelf'`, so IF the decor path returns the
  // tool draws the paper piece instead of the warm one. Today it changes no pixel.
  // ⚠️ AND THIS NOTE DECIDES NOTHING. "Wire it or remove it" is OPEN OWNER RULING M4-6; recording that
  // the five are unreached is a measurement, not an answer to it.
  'reactor-plant':    { build: MC.reactorPlant,   size: MC.SIZES['reactor-plant'],   ...dev('Reactor', null, 'new') },
  'solar-wing':       { build: MC.solarWing,      size: MC.SIZES['solar-wing'],      ...dev('SolarWing', 'G') },
  'bottle-rack':      { build: MC.bottleRack,     size: MC.SIZES['bottle-rack'],     ...dev('OxygenTank', null, 'new') },
  'reclaimer-stack':  { build: MC.reclaimerStack, size: MC.SIZES['reclaimer-stack'], ...dev('Reclaimer', 'R') },
  'paste-column':     { build: MC.pasteColumn,    size: MC.SIZES['paste-column'],    ...cos('paste_column') },
  'med-cot':          { build: MC.medCot,         size: MC.SIZES['med-cot'],         ...dev('MedBed', 'd') },
  'fab-cell':         { build: MC.fabCell,        size: MC.SIZES['fab-cell'],        ...dev('Fabricator', 'F') },
  'ring-array':       { build: MC.ringArray,      size: MC.SIZES['ring-array'],      ...dev('Telescope', 'x') },
  'dish-mast':        { build: MC.dishMast,       size: MC.SIZES['dish-mast'],       ...cos('dish_mast') },
  'plant-pot':        { build: MC.plantPot,       size: MC.SIZES['plant-pot'],       ...dev('PlantPot', 'P') },
  'book-case':        { build: MC.bookCase,       size: MC.SIZES['book-case'],       ...cos('book_case') },
  'deck-turret':      { build: MC.deckTurret,     size: MC.SIZES['deck-turret'],     ...cos('deck_turret') },
  'sleeper-pod':      { build: MC.sleeperPod,     size: MC.SIZES['sleeper-pod'],     ...cos('sleeper_pod') },
});

/** The full list of registered itemIds, in mock order. */
export const ITEM_IDS = Object.freeze(Object.keys(ITEMS));

/** The valid `kind` values every registry entry carries. */
export const ITEM_KINDS = Object.freeze(['functional', 'cosmetic', 'material', 'resource']);

/** The registered RESOURCE pieces as `{ itemKind → itemId }` — the sim `ItemKind` NAME, never a
 *  byte. Derived from the registry, so a new resource row joins it by existing. PURE. */
export const RESOURCE_ITEM_BY_KIND_NAME = Object.freeze(
  Object.keys(ITEMS).reduce((out, id) => {
    const e = ITEMS[id];
    if (e.kind === 'resource' && typeof e.itemKind === 'string' && out[e.itemKind] === undefined) {
      out[e.itemKind] = id;
    }
    return out;
  }, Object.create(null)),
);

/** True when `itemId` names a RESOURCE piece — a ground stack, not furniture. PURE, tolerant. */
export function isResourceItem(itemId) {
  const e = typeof itemId === 'string' ? ITEMS[itemId] : undefined;
  return !!e && e.kind === 'resource';
}

/** True when `itemId` names a FUNCTIONAL piece — a real `DeviceKind` standing on a tile. PURE. */
export function isDeviceItem(itemId) {
  const e = typeof itemId === 'string' ? ITEMS[itemId] : undefined;
  return !!e && e.kind === 'functional';
}

/**
 * A neutral steel placeholder tile with a "?" — used when an unknown itemId is requested. Pure and
 * deterministic; never throws. `idPrefix` still namespaces it so many placeholders can coexist.
 */
export function placeholderItem(opts = {}) {
  const w = opts.w == null ? 100 : opts.w;
  const h = opts.h == null ? 100 : opts.h;
  const s = scene(opts.idPrefix || 'placeholder-0');
  s.rect({ x: -30, y: -30, w: 60, h: 60, rx: 6, fill: '#38424d' });
  s.border({ x: -30, y: -30, w: 60, h: 60, rx: 6, color: '#2b3742', width: 2 });
  s.text('?', { x: 0, y: 0, size: 40, weight: 700, fill: '#8c8377' });
  return s.render(w, h);
}

/**
 * Build any item by id. Unknown / missing id → the neutral placeholder (never throws). `opts` is
 * forwarded to the builder: `{ w, h, idPrefix, index, state }`.
 * @param {string} itemId
 * @param {object} [opts]
 * @returns {string} an SVG `<g>…</g>` fragment
 */
export function buildItem(itemId, opts = {}) {
  const entry = typeof itemId === 'string' ? ITEMS[itemId] : undefined;
  if (!entry) return placeholderItem(opts);
  return entry.build(opts);
}

/** Registry entry for an id (or undefined). */
export function itemInfo(itemId) {
  return ITEMS[itemId];
}

/**
 * ⭐ A PIECE'S HONEST CENTIMETRES — `{w, d, h}` (+ `z0` when it hangs), or `undefined` for a piece
 * that declares none.
 *
 * ⛔ THE CATALOGUES ARE THE AUTHORITY AND THIS IS ONLY THE DOOR TO THEM. Four of the standing
 * catalogues each publish their own `SPECS` in real centimetres (`art-style.md` §2: *"a piece
 * declares honest centimetres and DERIVES its drawing scale"*), and until now every consumer either
 * imported the catalogue it happened to want (`fittings.roomBox`) or did without. The build tray
 * needs the number for a piece it knows only by REGISTRY ID — the card's stat line is the piece's
 * own footprint — and a fifth consumer re-implementing "look in fittings, then machines, then…" is
 * the second authority this registry exists to prevent.
 *
 * ⚠️ `paper-materials.SPECS` IS DELIBERATELY NOT CONSULTED. A material skin is a TILING FIELD, and
 * its spec is a centimetre PITCH, not a footprint (`paper-materials.test.js` measures it as such).
 * Answering a pitch to a caller asking "how much floor does this cover" would be a wrong number
 * wearing the right shape — worse than `undefined`, which callers already handle.
 *
 * ⚠️ THE FOUR ARE SEARCHED IN REGISTRATION ORDER AND NO ID IS IN TWO OF THEM (pinned by
 * `build-tray.test.js`, which requires the four key sets to be pairwise disjoint — otherwise this
 * function's answer would depend on the order of the lines below, which is not a fact about a
 * piece). PURE; never throws.
 */
export function itemSpecCm(itemId) {
  if (typeof itemId !== 'string') return undefined;
  return FT.SPECS[itemId] || MC.SPECS[itemId] || PF.SPECS[itemId] || PR.SPECS[itemId] || undefined;
}
