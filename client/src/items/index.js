// The warm ITEM LIBRARY registry — all 68 pieces of docs/design/perilune-item-set.dc.html, keyed by
// a stable kebab-case itemId. Each entry pairs the pure SVG builder with its sim classification from
// docs/design/perilune-item-mapping.md:
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
// (`sensor-array`'s row carried no such note at all — `x` was never drawn by anything.) Doors,
// `power-conduit` and `pipe-run` stay `null` on purpose: those ARE drawn by other layers on every
// surface, and `items/glyph-map.js` + its guard record that decision by name.
//   decor       the non-hashed decor channel key, for COSMETIC pieces
//   material    'wall' | 'floor', for MATERIAL pieces
//   size        {w,h} — the piece's design footprint in mock px (a placement hint; from the mock)
//
// The two SVG views (Overview, Room Zoom) place items through this registry; `buildItem(id, opts)`
// is the tolerant entry point (unknown id → a neutral placeholder group, never a throw).

import { scene } from './helpers.js';
import * as O from './objects.js';
import * as S from './structures.js';
import * as F from './fixtures.js';
import * as R from './resources.js';

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
 * ITEMS[itemId] = { build, size, kind, ... }. Order follows the mock (objects → walls → floors →
 * fixtures → resources, #1–#68). Every `build` is a pure `(opts) -> string` SVG-`<g>`-fragment
 * builder.
 */
export const ITEMS = Object.freeze({
  // ── OBJECTS (30) ──
  'reactor':          { build: O.reactor,         size: { w: 64, h: 64 }, ...dev('Reactor', null, 'new') },
  'solar-panel':      { build: O.solarPanel,      size: { w: 92, h: 56 }, ...dev('SolarWing', 'G') },
  'battery-bank':     { build: O.batteryBank,     size: { w: 58, h: 56 }, ...dev('Battery', 'B') },
  'o2-scrubber':      { build: O.o2Scrubber,      size: { w: 66, h: 60 }, ...dev('Scrubber', 'S') },
  'oxygen-tank':      { build: O.oxygenTank,      size: { w: 38, h: 70 }, ...dev('OxygenTank', null, 'new') },
  'water-recycler':   { build: O.waterRecycler,   size: { w: 60, h: 66 }, ...dev('Reclaimer', 'R') },
  'hydroponics':      { build: O.hydroponics,     size: { w: 92, h: 48 }, ...dev('GrowBed', '"') },
  'cooker':           { build: O.cooker,          size: { w: 66, h: 52 }, ...dev('Cooker', null, 'new') },
  'cooler':           { build: O.cooler,          size: { w: 52, h: 70 }, ...cos('cooler') },
  'paste-dispenser':  { build: O.pasteDispenser,  size: { w: 58, h: 64 }, ...cos('paste_dispenser') },
  'dining-table':     { build: O.diningTable,     size: { w: 78, h: 50 }, ...dev('Table', 't') },
  'bunk-bed':         { build: O.bunkBed,         size: { w: 56, h: 80 }, ...dev('Bed', 'b') },
  'desk':             { build: O.desk,            size: { w: 88, h: 44 }, ...dev('Desk', 'D') },
  'chair':            { build: O.chair,           size: { w: 44, h: 44 }, ...dev('Chair', 'h') },
  'locker':           { build: O.locker,          size: { w: 52, h: 80 }, ...dev('Locker', 'L') },
  'rug':              { build: O.rug,             size: { w: 96, h: 64 }, ...cos('rug') },
  'standing-lamp':    { build: O.standingLamp,    size: { w: 44, h: 70 }, ...cos('standing_lamp') },
  'potted-plant':     { build: O.pottedPlant,     size: { w: 58, h: 68 }, ...dev('PlantPot', 'P') },
  'bookshelf':        { build: O.bookshelf,       size: { w: 80, h: 66 }, ...cos('bookshelf') },
  'med-bed':          { build: O.medBed,          size: { w: 52, h: 78 }, ...dev('MedBed', 'd') },
  'research-console': { build: O.researchConsole, size: { w: 80, h: 52 }, ...dev('Terminal', 'T') },
  'comms-dish':       { build: O.commsDish,       size: { w: 90, h: 90 }, ...cos('comms_dish') },
  'sensor-array':     { build: O.sensorArray,     size: { w: 88, h: 88 }, ...dev('Telescope', 'x') },
  'workbench':        { build: O.workbench,       size: { w: 92, h: 48 }, ...dev('MachineShop', 'M') },
  'fabricator':       { build: O.fabricator,      size: { w: 70, h: 64 }, ...dev('Fabricator', 'F') },
  'storage-crate':    { build: O.storageCrate,    size: { w: 64, h: 60 }, ...cos('storage_crate') },
  'blast-door':       { build: O.blastDoor,       size: { w: 78, h: 70 }, ...dev('Door', null) },
  'turret':           { build: O.turret,          size: { w: 48, h: 74 }, ...cos('turret') },
  'cryopod':          { build: O.cryopod,         size: { w: 48, h: 82 }, ...cos('cryopod') },
  'fuel-drum':        { build: O.fuelDrum,        size: { w: 48, h: 64 }, ...cos('fuel_drum') },

  // ── WALLS (6) — MATERIAL ──
  'steel-bulkhead':   { build: S.steelBulkhead,   size: { w: 106, h: 94 }, ...wall() },
  'timber-lined-wall':{ build: S.timberLinedWall, size: { w: 106, h: 94 }, ...wall() },
  'blast-wall':       { build: S.blastWall,       size: { w: 106, h: 94 }, ...wall() },
  'glass-partition':  { build: S.glassPartition,  size: { w: 106, h: 94 }, ...wall() },
  'insulated-wall':   { build: S.insulatedWall,   size: { w: 106, h: 94 }, ...wall() },
  'hull-plating':     { build: S.hullPlating,     size: { w: 106, h: 94 }, ...wall() },

  // ── FLOORS (6) — MATERIAL ──
  'steel-tan-floor':  { build: S.steelTanFloor,   size: { w: 106, h: 94 }, ...floor() },
  'wood-plank-floor': { build: S.woodPlankFloor,  size: { w: 106, h: 94 }, ...floor() },
  'grow-matting':     { build: S.growMatting,     size: { w: 106, h: 94 }, ...floor() },
  'cream-tile-floor': { build: S.creamTileFloor,  size: { w: 106, h: 94 }, ...floor() },
  'metal-grating':    { build: S.metalGrating,    size: { w: 106, h: 94 }, ...floor() },
  'carpet-floor':     { build: S.carpetFloor,     size: { w: 106, h: 94 }, ...floor() },

  // ── FIXTURES (18) ──
  'sliding-door':     { build: F.slidingDoor,     size: { w: 96, h: 70 }, ...dev('Door', null) },
  'airlock':          { build: F.airlock,         size: { w: 80, h: 80 }, ...dev('Door', null) },
  'hatch-ladder':     { build: F.hatchLadder,     size: { w: 64, h: 74 }, ...dev('Ladder', 'H') },
  'power-conduit':    { build: F.powerConduit,    size: { w: 96, h: 14 }, ...dev('Conduit', null) },
  'air-vent':         { build: F.airVent,         size: { w: 72, h: 56 }, ...dev('AirVent', '^') },
  'pipe-run':         { build: F.pipeRun,         size: { w: 96, h: 56 }, ...dev('Pipe', null) },
  'wall-lamp':        { build: F.wallLamp,        size: { w: 52, h: 44 }, ...cos('wall_lamp') },
  'viewport':         { build: F.viewport,        size: { w: 90, h: 64 }, ...cos('viewport') },
  'wall-screen':      { build: F.wallScreen,      size: { w: 92, h: 60 }, ...cos('wall_screen') },
  'space-heater':     { build: F.spaceHeater,     size: { w: 60, h: 64 }, ...dev('Heater', null, 'new') },
  'vent-fan':         { build: F.ventFan,         size: { w: 76, h: 76 }, ...cos('vent_fan') },
  'shelf-rack':       { build: F.shelfRack,       size: { w: 88, h: 76 }, ...cos('shelf_rack') },
  'supply-barrel':    { build: F.supplyBarrel,    size: { w: 48, h: 64 }, ...cos('supply_barrel') },
  'weapons-rack':     { build: F.weaponsRack,     size: { w: 88, h: 60 }, ...cos('weapons_rack') },
  'sun-lamp':         { build: F.sunLamp,         size: { w: 70, h: 60 }, ...cos('sun_lamp') },
  'herb-planter':     { build: F.herbPlanter,     size: { w: 50, h: 60 }, ...cos('herb_planter') },
  'deck-sign':        { build: F.deckSign,        size: { w: 80, h: 74 }, ...cos('deck_sign') },
  'floodlight':       { build: F.floodlight,      size: { w: 40, h: 60 }, ...cos('floodlight') },

  // ── RESOURCES (8) — GROUND STACKS, keyed by `Glyphs.ForItem` ──
  // ⚠️ THERE IS DELIBERATELY NO `MetalOre` PIECE. The mock's own header says so, and it was verified
  // against the tree: `ItemKind.MetalOre` has ZERO references anywhere in `sim/` outside the glyph
  // table and the enum itself — nothing produces it, nothing consumes it, no recipe names it. It is
  // dead E3 mining vocabulary and must not be given art until it is real, so it STAYS in
  // `NO_GROUND_ITEM_SPRITE` (client/test/device-sprite-coverage.test.js) with that as its reason.
  'regolith':         { build: R.regolith,        size: { w: 70, h: 46 }, ...res('Regolith', ',') },
  'potato':           { build: R.potato,          size: { w: 68, h: 48 }, ...res('Potato', 'f') },
  'scrap':            { build: R.scrap,           size: { w: 72, h: 48 }, ...res('Scrap', 's') },
  'parts':            { build: R.parts,           size: { w: 68, h: 54 }, ...res('Parts', 'p') },
  'controller-module':{ build: R.controllerModule, size: { w: 84, h: 50 }, ...res('ControllerModule', 'c') },
  'seals':            { build: R.seals,           size: { w: 72, h: 62 }, ...res('Seals', 'g') },
  'ice':              { build: R.ice,             size: { w: 68, h: 58 }, ...res('Ice', 'i') },
  'corpse':           { build: R.corpse,          size: { w: 52, h: 86 }, ...res('Corpse', '&') },
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
