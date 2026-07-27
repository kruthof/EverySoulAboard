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
// which reach the same `roomCells` → `furnitureSvg` else-branch and which this table does not
// address at all. What deriving removes is the HAND-MIRROR class: two view files that could drift
// from each other and from `ITEMS`. The unskinned-glyph class is still open on the item side, is
// counted by `client/test/device-sprite-coverage.test.js`'s `NO_GROUND_ITEM_SPRITE` ledger (8
// entries since E0-7 added `Ice`, 7 of them visibly chipping, both pinned by equality), and is
// chartered separately.
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
 * Every entry below `wall-lamp` is inherited from the two hand-mirrored `ROLE_TO_ITEM` tables this
 * module replaces, so this list started as a faithful record of what the game already drew.
 *
 * The guard (`client/test/device-sprite-coverage.test.js`) asserts every value is a real item with
 * a real builder, and that no entry here shadows a glyph a real piece already claims.
 */
export const GLYPH_SUBSTITUTE = Object.freeze({
  // WaterTank (10). The set has no water tank; OXYGEN TANK is the same upright pressure vessel and
  // is otherwise unreachable art (`deviceStatus: 'new'` — no `DeviceKind.OxygenTank` exists).
  O: 'oxygen-tank',
  // Radiator (16). No radiator piece. SPACE HEATER is the set's only thermal fixture; likewise
  // `deviceStatus: 'new'`, so this substitution is the only way it ever reaches the screen.
  '=': 'space-heater',
  // SalvageRecycler (15). No recycler piece. WATER RECYCLER is the same hopper-and-drum machine
  // silhouette; the legacy `recycler` sprite role pointed at it too.
  Y: 'water-recycler',
  // MedCabinet (21). No cabinet piece. LOCKER is the set's only tall closed store.
  C: 'locker',
  // Light (8). The set's luminaires are all COSMETIC (`wall-lamp`, `floodlight`, `sun-lamp`); there
  // is no functional light piece. WALL LAMP is the closest and is what both surfaces already drew.
  '*': 'wall-lamp',
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
});

/** Build the glyph → itemId table from `ITEMS`, then fill the gaps from `GLYPH_SUBSTITUTE`. */
function deriveGlyphToItem() {
  const out = Object.create(null);
  for (const id of Object.keys(ITEMS)) {
    const e = ITEMS[id];
    // FUNCTIONAL only. Materials carry `'#'` / `'.'` — six wall variants and six floor variants all
    // claiming one glyph — and those two codes belong to the wall/floor layers, never to furniture.
    if (!e || e.kind !== 'functional') continue;
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
