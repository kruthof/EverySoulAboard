// The warm ITEM LIBRARY registry — the 70 STATIC pieces of docs/design/perilune-item-set.dc.html
// PLUS one repo-authored piece (`swarf`, last row), keyed by a stable kebab-case itemId. Each entry
// pairs the pure SVG builder with its sim classification from docs/design/perilune-item-mapping.md:
//
// ⚠️ "ALL 70 PIECES OF THE MOCK" WAS THIS FILE'S OPENING CLAUSE AND IS NO LONGER TRUE. The registry
// is 107: the mock is a SOURCE for it, not a definition of it. `swarf` is the first row drawn for a
// sim fact the mock predates (`ItemKind.Swarf`, from the wreck start's salvage rule) and it is
// deliberately LAST of the mock-order block — see its own comment for why the position is NOT
// load-bearing. After it come the redesign's own rows: nine from the owner's fittings catalogue
// (VR-P2, 2026-08-05), four more the same day when the catalogue grew its "Capsules and cells"
// section, then the NINE PAPER GROUND STACKS, and then the FOURTEEN PAPER FIXTURES — the ship's
// architecture, redrawn (lane/paper-fixtures, the same day): 71 → 80 → 84 → 93 → 107.
// ⚠️ RE-COUNT THAT NUMBER OFF THE TABLE, NEVER OFF THIS PARAGRAPH — `client/test/items.test.js` does.
// ⚠️ RE-COUNT THAT NUMBER OFF THE TABLE, NEVER OFF THIS PARAGRAPH — `client/test/items.test.js` does.
//
// ⚠️ AND `resource` IS NOW TWO POPULATIONS, which is the one thing a reader of this table has to
// know before trusting a row. A resource row is either LIVE — it claims a sim `ItemKind` name and a
// `Glyphs.ForItem` char, and both joins land on it — or SUPERSEDED, meaning its art is still here and
// still builds but another row took both joins (`itemKind: null, glyph: null, supersededBy: '…'`).
// The nine warm ground stacks are all superseded; see `resSuperseded` below for why they are kept.
//
// ⚠️ THE MOCK ALSO CARRIES 70 *WRECKED* TWINS AND THEY ARE NOT IN THIS TABLE. They live in
// `client/src/items/wrecked.js`, keyed by the PRISTINE itemId, because a wrecked piece is not a
// separate thing a player places — it is the same registry row in a state. Nothing in this file
// needs to know they exist; `wrecked.js` imports FROM here, never the other way round, so the
// wrecked set reverts by deleting one file. See its header for the join and why it is derived.
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
import * as O from './objects.js';
// — lane/paper-materials —
// `./structures.js` IS GONE. It held the twelve warm wall/floor swatches and nothing else, and all
// twelve are replaced below by `./paper-materials.js` — same ids, same class, same `material` tag,
// new drawing. That is the shape VR-P2 used for the twenty-one furniture rows it replaced (it left
// `objects.js` holding only the fourteen rows still drawn from it), and it is used here for the same
// reason: a module nothing imports is the next reader's invitation to draw the old art back.
import * as PM from './paper-materials.js';
// — end lane/paper-materials —
import * as F from './fixtures.js';
import * as R from './resources.js';
import * as C from './cryo.js';
import * as FT from './fittings.js';
// — lane/paper-resources —
import * as PR from './paper-resources.js';
// — lane/paper-fixtures —
import * as PF from './paper-fixtures.js';

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
 * — lane/paper-resources — A SUPERSEDED GROUND STACK: still a `resource` row, still a real builder,
 * but claiming NEITHER the sim kind NOR the glyph any more, because another row draws that pile now.
 *
 * ⚠️ THE TWO JOINS BOTH HAVE TO MOVE AND THEY ARE NOT THE SAME JOIN — confusing them is trap 6.
 * A resource row is reached TWICE: `glyph-map.js`'s `deriveGlyphToItem` resolves a projected
 * `Glyphs.ForItem` char to a piece, and `room-model.js` joins the `items` channel's kind BYTE through
 * `STOCK_KINDS` → `RESOURCE_ITEM_BY_KIND_NAME` → a piece. The first keys on `glyph`, the second on
 * `itemKind`, and BOTH derivations take the FIRST row that claims the key — so a demoted row that
 * kept either field would silently keep winning it, from above the new row, forever. Setting both to
 * `null` is what actually hands the join over; `supersededBy` names the row that took it, so the
 * demotion is greppable and the guard can check the pair rather than trusting a comment.
 *
 * ⛔ RETIRING THE ROWS OUTRIGHT WAS CONSIDERED AND REFUSED, with the cost measured rather than
 * guessed — the same call the capsules lane made for `cryo-capsule-occupied`. Eight of these nine
 * have twins that are eight of the SEVENTY the mock ships, and `client/test/wrecked.test.js` walks
 * `docs/design/perilune-item-set.dc.html`'s `brokenD` array POSITIONALLY against `MOCK_TWIN_IDS` as a
 * bijection — that walk is the whole of the evidence that the other sixty-two are transcribed
 * correctly. Deleting them would take `MOCK_TWIN_IDS` to 62 and force a third ledger to be invented
 * so the bijection could be relaxed. Nine dead rows cost a reader one paragraph.
 */
const resSuperseded = (supersededBy) => ({
  kind: 'resource', itemKind: null, glyph: null, supersededBy,
});

/**
 * ITEMS[itemId] = { build, size, kind, ... }. Order follows the mock (objects → walls → floors →
 * fixtures → resources, #1–#68). Every `build` is a pure `(opts) -> string` SVG-`<g>`-fragment
 * builder.
 */
export const ITEMS = Object.freeze({
  // ── OBJECTS (30) ──
  'reactor':          { build: O.reactor,         size: { w: 64, h: 64 }, ...dev('Reactor', null, 'new') },
  'solar-panel':      { build: O.solarPanel,      size: { w: 92, h: 56 }, ...dev('SolarWing', 'G') },
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
  'oxygen-tank':      { build: O.oxygenTank,      size: { w: 38, h: 70 }, ...dev('OxygenTank', null, 'new') },
  'water-recycler':   { build: O.waterRecycler,   size: { w: 60, h: 66 }, ...dev('Reclaimer', 'R') },
  'hydroponics':      { build: FT.hydroponics,     size: FT.SIZES['hydroponics'], ...dev('GrowBed', '"') },
  'cooker':           { build: FT.cooker,          size: FT.SIZES['cooker'], ...dev('Cooker', null, 'new') },
  'cooler':           { build: FT.cooler,          size: FT.SIZES['cooler'], ...cos('cooler') },
  'paste-dispenser':  { build: O.pasteDispenser,  size: { w: 58, h: 64 }, ...cos('paste_dispenser') },
  'dining-table':     { build: FT.diningTable,     size: FT.SIZES['dining-table'], ...dev('Table', 't') },
  'bunk-bed':         { build: FT.bunkBed,         size: FT.SIZES['bunk-bed'], ...dev('Bed', 'b') },
  'desk':             { build: FT.desk,            size: FT.SIZES['desk'], ...dev('Desk', 'D') },
  'chair':            { build: FT.chair,           size: FT.SIZES['chair'], ...dev('Chair', 'h') },
  'locker':           { build: FT.locker,          size: FT.SIZES['locker'], ...dev('Locker', 'L') },
  'rug':              { build: FT.rug,             size: FT.SIZES['rug'], ...cos('rug') },
  'standing-lamp':    { build: FT.standingLamp,    size: FT.SIZES['standing-lamp'], ...cos('standing_lamp') },
  'potted-plant':     { build: O.pottedPlant,     size: { w: 58, h: 68 }, ...dev('PlantPot', 'P') },
  'bookshelf':        { build: O.bookshelf,       size: { w: 80, h: 66 }, ...cos('bookshelf') },
  'med-bed':          { build: O.medBed,          size: { w: 52, h: 78 }, ...dev('MedBed', 'd') },
  'research-console': { build: FT.researchConsole, size: FT.SIZES['research-console'], ...dev('Terminal', 'T') },
  'comms-dish':       { build: O.commsDish,       size: { w: 90, h: 90 }, ...cos('comms_dish') },
  'sensor-array':     { build: O.sensorArray,     size: { w: 88, h: 88 }, ...dev('Telescope', 'x') },
  'workbench':        { build: FT.workbench,       size: FT.SIZES['workbench'], ...dev('MachineShop', 'M') },
  'fabricator':       { build: O.fabricator,      size: { w: 70, h: 64 }, ...dev('Fabricator', 'F') },
  'storage-crate':    { build: FT.storageCrate,    size: FT.SIZES['storage-crate'], ...cos('storage_crate') },
  'blast-door':       { build: O.blastDoor,       size: { w: 78, h: 70 }, ...dev('Door', null) },
  'turret':           { build: O.turret,          size: { w: 48, h: 74 }, ...cos('turret') },
  'cryopod':          { build: O.cryopod,         size: { w: 48, h: 82 }, ...cos('cryopod') },
  'fuel-drum':        { build: FT.fuelDrum,        size: FT.SIZES['fuel-drum'], ...cos('fuel_drum') },

  // — lane/paper-materials — THE TWELVE MATERIALS, REDRAWN (see `./paper-materials.js`) ─────────
  //
  // ⚠️ REPLACED IN PLACE — same ids, same `kind: 'material'`, same `'#'`/`'.'` glyphs, new builders.
  // The alternative (twelve NEW rows beside the old twelve) was measured and refused, and the
  // evidence is `client/src/items/wrecked.js`: every one of these ids carries a WRECKED TWIN, and
  // the twin set is joined POSITIONALLY to `docs/design/perilune-item-set.dc.html`'s own `brokenD`
  // array as a BIJECTION over exactly seventy mock pieces (`client/test/wrecked.test.js`). Twelve
  // new registry rows would each need a twin plus a `NON_MOCK_TWIN` ledger entry to stay out of that
  // join, and twelve old rows would keep drawing warm art nothing reaches — 24 material rows, two
  // ledgers touched, and a palette that has to choose. Replacing the `build` reference moves NO
  // count anywhere: class tally material 12 and the twin bijection's 70 are unchanged by it.
  // (The registry TOTAL is other lanes' business and goes stale here — 80 when this was written,
  // 84 after the capsules merge; re-derive it from ITEMS, never quote this line. TRAPS 8th.)
  //
  // ⚠️ THE WRECKED TWINS STAY WARM, and that is the wave's own FILED inconsistency rather than an
  // oversight — charter §3's P2b, the same state the twenty-one furniture rows VR-P2 replaced are
  // in. It is invisible on the shipping surface here: `roomzoom-view.js materialLayerSvg` and
  // `paintMatStrip` both call `buildItem`, never `buildTileItem`, so no material twin has ever been
  // drawn by the Room Zoom (a material is a tile's SKIN — there is no `Device.Condition` for it to
  // read). The twins reach a screen only through `client/tools/wrecked-gallery.mjs`.
  //
  // `size` is now DERIVED from each piece's centimetres (`paper-materials.SIZES`) instead of the
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

  // ── FIXTURES (18) ──
  // `'+'` is `Glyphs.DoorClosed`, i.e. `Glyphs.ForDevice(DeviceKind.Door)` — the rest glyph of the
  // kind, so this row is an ordinary `ForDevice` claim and needs no exception anywhere. The piece is
  // a steel leaf with a lit centre strip: a shut door, which is what the tile means.
  //
  // ⚠️ THAT PARAGRAPH IS HISTORY SINCE 2026-08-05 (lane/paper-fixtures) AND IS QUOTED, NOT DELETED,
  // BECAUSE THE JOIN IT DESCRIBES IS UNCHANGED — only the row it lands on moved. `'+'`, `'H'` and
  // `'^'` now belong to `door-sliding`, `deck-hatch` and `vent-grille` in the PAPER FIXTURES section
  // at the bottom of this table, which are the same three objects drawn in the owner's paper/ink
  // dialect. These three keep their `deviceKind`, their class, their `size` and their wrecked twins
  // and are UNREACHED WARM ART, in exactly the position `battery-bank` and the two cryo capsules are
  // in and for exactly their reason.
  // ⛔ RETIRING THEM WAS CONSIDERED AND REFUSED, and the cost is measured rather than guessed: their
  // twins are three of the SEVENTY the mock ships, and `client/test/wrecked.test.js` walks
  // `docs/design/perilune-item-set.dc.html`'s `brokenD` array POSITIONALLY against `MOCK_TWIN_IDS` as
  // a bijection — that walk is the whole of the evidence that the other sixty-seven are transcribed
  // correctly. Three dead rows cost a reader one paragraph; a relaxed bijection costs the next lane
  // its instrument.
  'sliding-door':     { build: F.slidingDoor,     size: { w: 96, h: 70 }, ...dev('Door', null) },
  'airlock':          { build: F.airlock,         size: { w: 80, h: 80 }, ...dev('Door', null) },
  'hatch-ladder':     { build: F.hatchLadder,     size: { w: 64, h: 74 }, ...dev('Ladder', null) },
  'power-conduit':    { build: F.powerConduit,    size: { w: 96, h: 14 }, ...dev('Conduit', null) },
  'air-vent':         { build: F.airVent,         size: { w: 72, h: 56 }, ...dev('AirVent', null) },
  'pipe-run':         { build: FT.pipeRun,         size: FT.SIZES['pipe-run'], ...dev('Pipe', null) },
  'wall-lamp':        { build: F.wallLamp,        size: { w: 52, h: 44 }, ...cos('wall_lamp') },
  'viewport':         { build: F.viewport,        size: { w: 90, h: 64 }, ...cos('viewport') },
  'wall-screen':      { build: F.wallScreen,      size: { w: 92, h: 60 }, ...cos('wall_screen') },
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
  'vent-fan':         { build: F.ventFan,         size: { w: 76, h: 76 }, ...cos('vent_fan') },
  'shelf-rack':       { build: FT.shelfRack,       size: FT.SIZES['shelf-rack'], ...cos('shelf_rack') },
  'supply-barrel':    { build: FT.supplyBarrel,    size: FT.SIZES['supply-barrel'], ...cos('supply_barrel') },
  'weapons-rack':     { build: F.weaponsRack,     size: { w: 88, h: 60 }, ...cos('weapons_rack') },
  'sun-lamp':         { build: F.sunLamp,         size: { w: 70, h: 60 }, ...cos('sun_lamp') },
  'herb-planter':     { build: FT.herbPlanter,     size: FT.SIZES['herb-planter'], ...cos('herb_planter') },
  'deck-sign':        { build: F.deckSign,        size: { w: 80, h: 74 }, ...cos('deck_sign') },
  'floodlight':       { build: F.floodlight,      size: { w: 40, h: 60 }, ...cos('floodlight') },

  // ── RESOURCES (8, from the mock; `swarf` is a ninth at the end of the file) — GROUND STACKS,
  //    keyed by `Glyphs.ForItem` ──
  // ⚠️ THERE IS DELIBERATELY NO `MetalOre` PIECE. The mock's own header says so, and it was verified
  // against the tree: `ItemKind.MetalOre` has ZERO references anywhere in `sim/` outside the glyph
  // table and the enum itself — nothing produces it, nothing consumes it, no recipe names it. It is
  // dead E3 mining vocabulary and must not be given art until it is real, so it STAYS in
  // `NO_GROUND_ITEM_SPRITE` (client/test/device-sprite-coverage.test.js) with that as its reason.
  //
  // ⚠️ ALL EIGHT WENT `itemKind: null, glyph: null` ON 2026-08-05 (lane/paper-resources) AND THE
  // PARAGRAPH ABOVE IS NOW HISTORY, NOT WIRING. The nine ground stacks were redrawn in the owner's
  // paper/ink dialect — `client/src/items/paper-resources.js`, the nine rows at the bottom of this
  // table — and both joins moved with them: the `Glyphs.ForItem` char AND the `ItemKind` name. These
  // eight keep their class, their builder, their `size` and their mock twins, and are now UNREACHED
  // WARM ART, in exactly the position `battery-bank` and the two cryo capsules are in.
  //   Everything the note above says about `MetalOre` is still true and still lives in
  // `NO_GROUND_ITEM_SPRITE`; only the rows the eight kinds land on changed.
  'regolith':         { build: R.regolith,        size: { w: 70, h: 46 }, ...resSuperseded('spoil-heap') },
  'potato':           { build: R.potato,          size: { w: 68, h: 48 }, ...resSuperseded('tuber-crate') },
  'scrap':            { build: R.scrap,           size: { w: 72, h: 48 }, ...resSuperseded('plate-offcut') },
  'parts':            { build: R.parts,           size: { w: 68, h: 54 }, ...resSuperseded('gear-set') },
  'controller-module':{ build: R.controllerModule, size: { w: 84, h: 50 }, ...resSuperseded('control-card') },
  'seals':            { build: R.seals,           size: { w: 72, h: 62 }, ...resSuperseded('seal-set') },
  'ice':              { build: R.ice,             size: { w: 68, h: 58 }, ...resSuperseded('ice-block') },
  'corpse':           { build: R.corpse,          size: { w: 52, h: 86 }, ...resSuperseded('body-bag') },

  // ── CRYO (2) — FUNCTIONAL since the wreck start (W3) ──
  // ⚠️ THE NOTE THAT STOOD HERE IS QUOTED RATHER THAN DELETED, BECAUSE IT WAS TRUE WHEN WRITTEN AND
  // IS THE REASON THESE TWO ARRIVED UNSKINNED: *"NEITHER CLAIMS A GLYPH. There is no cryo-capsule
  // `DeviceKind` in the sim, so there is no `Glyphs.ForDevice` char to claim and no tile the sim
  // would project one onto."* `DeviceKind.CryoPod` now exists (`--ship wreck` authors twelve of
  // them), so both halves are false and both pieces are `functional`.
  //
  // TWO ROWS, TWO GLYPHS, ONE DEVICE KIND — the shape doors already use (`sliding-door` claims
  // `'+'`, `blast-door` claims `'X'` through GLYPH_SUBSTITUTE, `airlock` claims nothing). A pod's
  // glyph comes from its STATE: `GlyphMapper.DeviceGlyph` returns `Glyphs.CryoPodOpen 'k'` for an
  // open capsule and `Glyphs.CryoPodClosed 'K'` for an occupied one, and `'K'` is additionally the
  // `Glyphs.ForDevice` arm (the kind's rest glyph). So the join is derived from THIS table by
  // `glyph-map.js`, with nothing hand-mirrored anywhere.
  //
  // `cryopod` above stays COSMETIC and is NOT retired: it is a different, smaller piece the mock
  // ships alongside these two, it claims no glyph, and giving it one would put two pieces on one
  // char. The registry's first-wins rule would then pick by declaration order rather than by
  // decision, which is exactly the kind of silent choice `deriveGlyphToItem`'s guard exists to stop.
  //
  // ⚠️ BOTH GLYPHS WENT `null` ON 2026-08-05 AND THE PARAGRAPH ABOVE IS NOW HISTORY, NOT WIRING. The
  // owner's "Capsules and cells" revision draws this exact state pair in the paper idiom — catalogue
  // 31 CAPSULE, SEALED and 32 CAPSULE, OPEN — and `'K'`/`'k'` moved to those two rows at the bottom of
  // this table. Everything the paragraph says about the JOIN is still true; only the two rows it
  // lands on changed. These two keep their `deviceKind`, their class and their wrecked twins and are
  // now UNREACHED WARM ART, in the same position `battery-bank` is in and for the same reason.
  // ⛔ RETIRING THEM WAS CONSIDERED AND REFUSED, with the cost measured rather than guessed: their
  // twins are two of the SEVENTY the mock ships, and `client/test/wrecked.test.js` walks
  // `docs/design/perilune-item-set.dc.html`'s `brokenD` array POSITIONALLY against `MOCK_TWIN_IDS` as
  // a bijection — that walk is the whole of the evidence that the other sixty-eight are transcribed
  // correctly. Deleting two rows would take `MOCK_TWIN_IDS` to 68 and force a third ledger ("mock
  // pieces deliberately unclaimed") to be invented so the bijection could be relaxed. Two dead rows
  // cost a reader one paragraph; a relaxed bijection costs the next lane its instrument.
  'cryo-capsule-occupied': { build: C.cryoCapsuleOccupied, size: { w: 60, h: 104 }, ...dev('CryoPod', null) },
  'cryo-capsule-open':     { build: C.cryoCapsuleOpen,     size: { w: 110, h: 104 }, ...dev('CryoPod', null) },

  // ── SALVAGE (1) — REPO-AUTHORED, NOT FROM THE MOCK ──
  // ⛔ THIS ROW IS LAST BY CONVENTION, NOT BY CONSTRAINT — and the sentence that used to stand here
  // claimed the opposite, so it is quoted rather than deleted. It read: *"THIS ROW IS LAST FOR A
  // REASON THAT IS NOT TIDINESS … `wrecked.test.js` walks that order POSITIONALLY … inserting a
  // non-mock row anywhere but the end shifts every row after it onto the wrong label."* **FALSE, and
  // proven false by mutation: moving this row into the middle of `ITEMS` leaves the node suite
  // unchanged (85 pass / 0 fail across the four files that could see it).** The positional join runs
  // over `MOCK_IDS = ITEM_IDS.filter(id => !(id in NO_WRECKED_TWIN))`, which strips a LEDGERED row
  // wherever it sits, so it is position-independent for exactly the class of row this comment is
  // about. A load-bearing-sounding constraint on a file other lanes edit is worse than none.
  //
  // ⇒ WHAT ACTUALLY PROTECTS THE JOIN is the ledger test in `client/test/wrecked.test.js`
  // (`itemsWithoutWreckedTwin()` deep-equals `Object.keys(NO_WRECKED_TWIN)`). So the rule to follow
  // is *"a registry row either has a twin or is in the ledger"*, and the position is free.
  //
  // ⚠️ AND THE NUMBER THAT USED TO BE HERE OVERSTATED IT. It read *"an UNLEDGERED row inserted
  // mid-list reddens **12** tests"*, which is true and misleading: **only three or four of those
  // twelve are about the LEDGER** (`the ledger is exactly the rows with no twin`, `every registry row
  // has exactly one wrecked twin`, `hasWreckedTwin follows the registry`, and the positional label
  // walk). The other eight fire on ANY registry growth — the size census, the class tally, the
  // mapping doc's Tally, the painter-name floor — and the probe row also duplicated glyph `'w'`, so
  // the glyph-collision guard fired for a third reason again. Re-counted by attribution rather than
  // by total, which is this repo's *re-count, never compute* applied to a number I published myself.
  //
  // Last is still the right place for it, for the ordinary reason: every row above comes from
  // `docs/design/perilune-item-set.dc.html` in the mock's own order, and keeping that prefix
  // uninterrupted is what lets a reader diff this table against the spec by eye.
  //
  // `ItemKind.Swarf` came from the wreck start's salvage rule (`deconstruct.device_swarf = 1`), after
  // the mock was drawn, so there is no mock piece and no mock WRECKED twin for it. The missing twin is
  // ledgered by name in `client/src/items/wrecked.js` (`NO_WRECKED_TWIN`) with its reason; it is not an
  // omission to be filled in later.
  // ⚠️ AND THIS ONE WENT `null`/`null` WITH THE EIGHT ABOVE — see their block. `turnings` draws
  // `ItemKind.Swarf` now; this row is unreached warm art and keeps its `NO_WRECKED_TWIN` line,
  // because the reason for that line is a fact about the MATERIAL and follows it onto the new art.
  'swarf':            { build: R.swarf,          size: { w: 74, h: 50 }, ...resSuperseded('turnings') },

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
  // Their wrecked twins are REPO-AUTHORED (the mock has none) and are ledgered as such in
  // `client/src/items/wrecked.js` (`NON_MOCK_TWIN`), which is what keeps the twin↔mock bijection —
  // the thing that proves the other seventy are right — measuring exactly seventy.
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
  // Their wrecked twins are REPO-AUTHORED (no catalogue card, so nothing to transcribe) and are
  // ledgered in `client/src/items/wrecked.js`'s `NON_MOCK_TWIN`, which is what keeps the twin↔mock
  // bijection measuring exactly seventy.
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
