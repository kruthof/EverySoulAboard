// The warm ITEM LIBRARY registry — the 70 STATIC pieces of docs/design/perilune-item-set.dc.html
// PLUS one repo-authored piece (`swarf`, last row), keyed by a stable kebab-case itemId. Each entry
// pairs the pure SVG builder with its sim classification from docs/design/perilune-item-mapping.md:
//
// ⚠️ "ALL 70 PIECES OF THE MOCK" WAS THIS FILE'S OPENING CLAUSE AND IS NO LONGER TRUE. The registry
// is 93: the mock is a SOURCE for it, not a definition of it. `swarf` is the first row drawn for a
// sim fact the mock predates (`ItemKind.Swarf`, from the wreck start's salvage rule) and it closes
// the mock-order block — see its own comment for why that position is NOT load-bearing. After it come
// the redesign's own rows: nine fittings-catalogue pieces at VR-P2 and thirteen paper MACHINES the
// same day, 71 → 80 → 93.
// ⚠️ RE-COUNT THAT NUMBER OFF THE TABLE, NEVER OFF THIS PARAGRAPH — `client/test/items.test.js` does.
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
import * as S from './structures.js';
import * as F from './fixtures.js';
import * as R from './resources.js';
import * as C from './cryo.js';
import * as FT from './fittings.js';
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
 * ITEMS[itemId] = { build, size, kind, ... }. Order follows the mock (objects → walls → floors →
 * fixtures → resources, #1–#68). Every `build` is a pure `(opts) -> string` SVG-`<g>`-fragment
 * builder.
 */
export const ITEMS = Object.freeze({
  // ── OBJECTS (30) ──
  'reactor':          { build: O.reactor,         size: { w: 64, h: 64 }, ...dev('Reactor', null, 'new') },
  // — lane/paper-machines — glyph 'G' moved to `solar-wing`; see the MACHINES section below.
  'solar-panel':      { build: O.solarPanel,      size: { w: 92, h: 56 }, ...dev('SolarWing', null) },
  'battery-bank':     { build: FT.batteryBank,     size: FT.SIZES['battery-bank'], ...dev('Battery', 'B') },
  'o2-scrubber':      { build: FT.o2Scrubber,      size: FT.SIZES['o2-scrubber'], ...dev('Scrubber', 'S') },
  'oxygen-tank':      { build: O.oxygenTank,      size: { w: 38, h: 70 }, ...dev('OxygenTank', null, 'new') },
  // — lane/paper-machines — glyph 'R' moved to `reclaimer-stack`.
  'water-recycler':   { build: O.waterRecycler,   size: { w: 60, h: 66 }, ...dev('Reclaimer', null) },
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
  // — lane/paper-machines — glyph 'P' moved to `plant-pot`.
  'potted-plant':     { build: O.pottedPlant,     size: { w: 58, h: 68 }, ...dev('PlantPot', null) },
  'bookshelf':        { build: O.bookshelf,       size: { w: 80, h: 66 }, ...cos('bookshelf') },
  // — lane/paper-machines — glyph 'd' moved to `med-cot`.
  'med-bed':          { build: O.medBed,          size: { w: 52, h: 78 }, ...dev('MedBed', null) },
  'research-console': { build: FT.researchConsole, size: FT.SIZES['research-console'], ...dev('Terminal', 'T') },
  'comms-dish':       { build: O.commsDish,       size: { w: 90, h: 90 }, ...cos('comms_dish') },
  // — lane/paper-machines — glyph 'x' moved to `ring-array`.
  'sensor-array':     { build: O.sensorArray,     size: { w: 88, h: 88 }, ...dev('Telescope', null) },
  'workbench':        { build: FT.workbench,       size: FT.SIZES['workbench'], ...dev('MachineShop', 'M') },
  // — lane/paper-machines — glyph 'F' moved to `fab-cell`.
  'fabricator':       { build: O.fabricator,      size: { w: 70, h: 64 }, ...dev('Fabricator', null) },
  'storage-crate':    { build: FT.storageCrate,    size: FT.SIZES['storage-crate'], ...cos('storage_crate') },
  'blast-door':       { build: O.blastDoor,       size: { w: 78, h: 70 }, ...dev('Door', null) },
  'turret':           { build: O.turret,          size: { w: 48, h: 74 }, ...cos('turret') },
  'cryopod':          { build: O.cryopod,         size: { w: 48, h: 82 }, ...cos('cryopod') },
  'fuel-drum':        { build: FT.fuelDrum,        size: FT.SIZES['fuel-drum'], ...cos('fuel_drum') },

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
  // `'+'` is `Glyphs.DoorClosed`, i.e. `Glyphs.ForDevice(DeviceKind.Door)` — the rest glyph of the
  // kind, so this row is an ordinary `ForDevice` claim and needs no exception anywhere. The piece is
  // a steel leaf with a lit centre strip: a shut door, which is what the tile means.
  'sliding-door':     { build: F.slidingDoor,     size: { w: 96, h: 70 }, ...dev('Door', '+') },
  'airlock':          { build: F.airlock,         size: { w: 80, h: 80 }, ...dev('Door', null) },
  'hatch-ladder':     { build: F.hatchLadder,     size: { w: 64, h: 74 }, ...dev('Ladder', 'H') },
  'power-conduit':    { build: F.powerConduit,    size: { w: 96, h: 14 }, ...dev('Conduit', null) },
  'air-vent':         { build: F.airVent,         size: { w: 72, h: 56 }, ...dev('AirVent', '^') },
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
  'regolith':         { build: R.regolith,        size: { w: 70, h: 46 }, ...res('Regolith', ',') },
  'potato':           { build: R.potato,          size: { w: 68, h: 48 }, ...res('Potato', 'f') },
  'scrap':            { build: R.scrap,           size: { w: 72, h: 48 }, ...res('Scrap', 's') },
  'parts':            { build: R.parts,           size: { w: 68, h: 54 }, ...res('Parts', 'p') },
  'controller-module':{ build: R.controllerModule, size: { w: 84, h: 50 }, ...res('ControllerModule', 'c') },
  'seals':            { build: R.seals,           size: { w: 72, h: 62 }, ...res('Seals', 'g') },
  'ice':              { build: R.ice,             size: { w: 68, h: 58 }, ...res('Ice', 'i') },
  'corpse':           { build: R.corpse,          size: { w: 52, h: 86 }, ...res('Corpse', '&') },

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
  'cryo-capsule-occupied': { build: C.cryoCapsuleOccupied, size: { w: 60, h: 104 }, ...dev('CryoPod', 'K') },
  'cryo-capsule-open':     { build: C.cryoCapsuleOpen,     size: { w: 110, h: 104 }, ...dev('CryoPod', 'k') },

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
  'swarf':            { build: R.swarf,          size: { w: 74, h: 50 }, ...res('Swarf', 'w') },

  // ── FITTINGS (9) — THE CATALOGUE ROWS THE MOCK NEVER HAD (VR-P2) ──────────────────────────────
  //
  // `design-import/Perilune Fittings.dc.html` is the owner's buildable set and it is THIRTY pieces.
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
  // ⛔ DELETING THE OLD ROWS WAS CONSIDERED AND REFUSED, with the cost measured rather than guessed.
  // All thirteen are among the SEVENTY the mock draws, and `client/test/wrecked.test.js` walks
  // `docs/design/perilune-item-set.dc.html`'s `brokenD` array POSITIONALLY against `MOCK_TWIN_IDS` as
  // a bijection — that walk is the whole of the evidence that the other fifty-seven are transcribed
  // correctly. Removing thirteen rows would take the mock population to 57 and force a third ledger
  // ("mock pieces deliberately unclaimed") to be invented so the bijection could be relaxed. Thirteen
  // dead rows cost a reader one paragraph; a relaxed bijection costs the next lane its instrument.
  // ⇒ SO SAY IT OUT LOUD: `reactor`, `solar-panel`, `oxygen-tank`, `water-recycler`,
  // `paste-dispenser`, `med-bed`, `fabricator`, `sensor-array`, `comms-dish`, `potted-plant`,
  // `bookshelf`, `turret` and `cryopod` ARE NOW UNREACHED ART. They keep their class, their
  // `deviceKind` and their wrecked twins, and nothing on either surface resolves to them.
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
