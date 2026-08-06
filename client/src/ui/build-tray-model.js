// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ THE BUILD TRAY — the hierarchical build menu's PURE half.
//
// ⛔ THE OWNER'S SENTENCE (2026-08-05): *"the building menu in zoom mode looks like a nightmare —
// too crowded"*, with a design beside it (`design-import/Perilune Build Menu - Tray.html`, copied
// into this repo with the package). What shipped before was a FLAT STRIP of twenty-one equal chips
// that wrapped onto three rows at 1280 px; what the design shows is a TRAY: a breadcrumb
// (`BUILD › MACHINES › POWER`), a two-column category rail, and large item CARDS carrying the
// piece's own drawing, its name, its price and one honest stat line.
//
// ⭐⭐ THE TAXONOMY IS DERIVED, NOT INVENTED — and that is the whole reason this file is 400 lines of
// table plus a re-derivation instead of a hand-written tree. `TOOL_LEAF` below is a TABLE, and
// `deriveLeaf` is a MECHANICAL RULE over data that already exists (`PALETTE_CMD.cls`,
// `PALETTE_CMD.kind`, `PALETTE_CMD.deviceKind`, and the sim's own `machines.def` draw/gen/tier
// columns). `build-tray.test.js` requires the two to agree ROW BY ROW and requires the table to be
// TOTAL over `ROOM_TOOLS` — so a twenty-second tool added tomorrow either lands in a leaf by the
// rule or reddens a test BY NAME. The alternative — a hand tree — is the eleventh hand table
// `glyph-map.js`'s header spends forty lines retracting.
//
// ⛔ THE DESIGN'S FOUR TOP-LEVEL ROWS ARE `STRUCTURE / FURNITURE / MACHINES / HULL`, AND THIS SHIPS
// FIVE MINUS ONE. Two honest departures, each measured against the tools that actually exist:
//
//   · **HULL IS NOT SHIPPED, BECAUSE NOTHING CAN BE DERIVED INTO IT.** The design's HULL row holds
//     outboard pieces (its SOLAR PANEL card reads "outboard, hull mount"). NO tool on this palette
//     is outboard, and there is no outboard/hull FACT anywhere to derive one from: neither the
//     registry (`client/src/items/index.js` carries `kind`/`deviceKind`/`glyph`, nothing spatial)
//     nor the defs (`machines.def`'s eight columns are draw/gen/tier/blocks/heat/wear/maint/fail).
//     Inventing a hand set of "outboard DeviceKinds" would be exactly the fabricated fact this
//     package's third non-negotiable forbids, so HULL is FILED rather than faked. What DOES happen
//     to a generator when one arrives is stated and tested: `deriveLeaf` routes a kind that MOVES
//     power — `draw > 0 || gen > 0` — into MACHINES by its own tier, so a SolarWing tool would land
//     in `machines/comfort` rather than silently in FURNITURE. That leg is driven in the test with a
//     synthetic row, because a rule no member exercises is a rule nobody has checked.
//
//   · **ORDERS IS THE FIFTH ROW, AND IT IS NOT AN INVENTION EITHER — IT IS SIX SHIPPED TOOLS.**
//     DIG/STOCKPILE/STRIP/ERASE/MOVE/DEMOLISH are `cls: 'order' | 'erase' | 'move' | 'demolish'` in
//     `PALETTE_CMD` — four classes the design's four rows have no home for, and ruling E4 (DROP
//     NONE) forbids dropping them. They are the tools that act on what is ALREADY on the tile
//     rather than putting something new down, which is one sentence and therefore one row.
//
// ⛔⛔ AND THE ORDERS SUB-LEAVES PRESERVE THE ADJACENCY RULE `ROOM_TOOLS` SPENT A PARAGRAPH ON.
// That header states, out loud: *"DEMOLISH and ERASE are the most confusable pair on this bar … and
// putting them adjacent would make a mis-click cost a building"*, and ERASE therefore sits
// *"IMMEDIATELY AFTER the three verbs it undoes"*. The leaf map keeps both halves and strengthens
// them: `erase` joins `dig`/`stockpile`/`strip` in `orders/designate` (the verbs it undoes), and
// `demolish` is ALONE in `orders/remove` — a different card row behind a different rail click, so
// the two are no longer even on screen together. That is the shipped rule made stronger by the
// hierarchy, not a new preference.
//
// ⚠️ SECOND-LEVEL NAMES COME FROM DATA TOO, INCLUDING THE ONE THAT LOOKS LIKE A CHOICE.
//   · STRUCTURE's leaves are the tool's own `PALETTE_CMD.kind` — `wall` / `floor` / `door`.
//   · FURNITURE's leaves are the tool's own `cls` — `functional` → FITTED, `cosmetic` → DECOR. That
//     split is not cosmetic in the other sense: the two `cosmetic` tools are exactly the two that
//     REACH NO SIM (`DECOR_NOT_WIRED`), so the rail names the honesty rather than hiding it.
//   · MACHINES' leaves are the SIM'S OWN `PowerTier` — COMFORT / INDUSTRY / LIFE SUPPORT / DEFENSE,
//     the `tier` column of `machines.def`. It is the brownout SHED ORDER, so it is a real fact about
//     the machine a player is about to install (what gets dropped first when the reactor cannot
//     carry the ship) and not a label invented for a menu.
//
// PURE: no DOM, no wire, no clock, no locale API. ASCII only; every number formatted with `String`
// (InvariantCulture by construction — this file never touches `toLocaleString`).
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { ROOM_TOOLS, TOOL_LABEL, paletteCommand, roomDragMode, M_PER_TILE, ROOM_HEIGHT_M, DOOR_HEIGHT_M } from './room-model.js';
import { materialsForTool, toolHasMaterial, materialLabel } from './build-material-model.js';
import { chipCostText } from './build-cost-model.js';
import { ITEMS, itemSpecCm } from '../items/index.js';
import { itemIdForGlyphChar } from '../items/glyph-map.js';

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1 · THE SIM'S MACHINE TABLE, MIRRORED — draw / generation / tier, for the kinds this palette can
// place and for NO OTHERS.
//
// ⚠️ WHY A MIRROR AT ALL, AND WHY IT IS SAFE. It is the `DEVICE_PLACE_COST_PARTS` precedent verbatim
// (`build-cost-model.js`'s header): the authority is `content/core/SimDefs/machines.def` +
// `sim/Sim.Core/Entities/MachineDefs.cs`, NO WIRE CHANNEL CARRIES IT, and adding one to put a stat
// line on a card is a spine change (`WireFormat`) for a table that has moved twice in the project's
// life. So the client mirrors it — and mirroring is only safe when it is PINNED, so
// `build-tray.test.js` PARSES BOTH AUTHORITIES and requires all three to agree to the digit, exactly
// as `palette-honesty.test.js` does for the place cost. Derived from the authorities, never typed
// from memory.
//
// ⛔ IT IS DELIBERATELY NARROW — ten rows, not thirty-one. Every kind here is one `PALETTE_CMD` row
// names; the census test requires that set to be EXACTLY the set of `deviceKind`s the palette
// carries, so a new tool for an unmirrored kind reddens BY NAME rather than quietly showing no stat.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** `DeviceKind` name → its `machines.def` row, mirrored. `draw`/`gen` are kW; `tier` is the
 *  brownout shed order. PINNED against both authorities by `build-tray.test.js`. */
export const MACHINE_ROW = Object.freeze({
  Bed:      Object.freeze({ draw: 0,    gen: 0, tier: 'Comfort' }),
  Table:    Object.freeze({ draw: 0,    gen: 0, tier: 'Comfort' }),
  Chair:    Object.freeze({ draw: 0,    gen: 0, tier: 'Comfort' }),
  MedBed:   Object.freeze({ draw: 0,    gen: 0, tier: 'Comfort' }),
  Locker:   Object.freeze({ draw: 0,    gen: 0, tier: 'Comfort' }),
  Desk:     Object.freeze({ draw: 0,    gen: 0, tier: 'Comfort' }),
  PlantPot: Object.freeze({ draw: 0,    gen: 0, tier: 'Comfort' }),
  Light:    Object.freeze({ draw: 0.15, gen: 0, tier: 'Comfort' }),
  GrowBed:  Object.freeze({ draw: 0.6,  gen: 0, tier: 'Industry' }),
  Heater:   Object.freeze({ draw: 1,    gen: 0, tier: 'LifeSupport' }),
});

/** `PowerTier` member → the leaf id it names under MACHINES. The sim's four tiers, all four mapped,
 *  so a placeable Defense-tier machine has a home the day one exists. */
export const TIER_LEAF = Object.freeze({
  Comfort: 'comfort', Industry: 'industry', LifeSupport: 'lifesupport', Defense: 'defense',
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2 · THE HIERARCHY.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Top-level rows, in rail order. HULL is absent by derivation — see the header. */
export const TRAY_CATEGORIES = Object.freeze(['structure', 'furniture', 'machines', 'orders']);

export const CATEGORY_LABEL = Object.freeze({
  structure: 'STRUCTURE', furniture: 'FURNITURE', machines: 'MACHINES', orders: 'ORDERS',
});

/** Every leaf, in rail order within its category. A leaf id is `category/leaf`. */
export const TRAY_LEAVES = Object.freeze({
  structure: Object.freeze(['structure/wall', 'structure/floor', 'structure/door']),
  furniture: Object.freeze(['furniture/fitted', 'furniture/decor']),
  machines:  Object.freeze(['machines/comfort', 'machines/industry', 'machines/lifesupport',
                            'machines/defense']),
  orders:    Object.freeze(['orders/designate', 'orders/crew', 'orders/remove']),
});

export const LEAF_LABEL = Object.freeze({
  'structure/wall': 'WALL', 'structure/floor': 'FLOOR', 'structure/door': 'DOOR',
  'furniture/fitted': 'FITTED', 'furniture/decor': 'DECOR',
  'machines/comfort': 'COMFORT', 'machines/industry': 'INDUSTRY',
  'machines/lifesupport': 'LIFE SUPPORT', 'machines/defense': 'DEFENSE',
  'orders/designate': 'DESIGNATE', 'orders/crew': 'CREW', 'orders/remove': 'REMOVE',
});

/**
 * ⭐⭐ THE TABLE — every one of the twenty-one shipped tools, and its leaf.
 *
 * It is written out rather than computed at import time on purpose: a reader (and a reviewer) can
 * see the whole taxonomy in one screen, and `build-tray.test.js` re-derives every row from
 * `deriveLeaf` and requires agreement — so the table is a STATEMENT and the rule is the AUTHORITY.
 * A table nothing checks is a hand tree; a rule with no table is a hierarchy nobody can read.
 */
export const TOOL_LEAF = Object.freeze({
  // STRUCTURE — `cls: 'structural'`, split by the tool's own `kind`. WALL and FLOOR carry the six
  // material swatches as their CARDS (see `trayCards`); DOOR is one card, because it has no picker.
  wall: 'structure/wall',
  floor: 'structure/floor',
  door: 'structure/door',
  // FURNITURE — a thing the player puts down that neither draws nor makes power.
  bunk: 'furniture/fitted',
  desk: 'furniture/fitted',
  chair: 'furniture/fitted',
  locker: 'furniture/fitted',
  medbed: 'furniture/fitted',
  table: 'furniture/fitted',
  plant: 'furniture/fitted',
  // …and the two that reach NO SIM AT ALL. `cls: 'cosmetic'` is the same byte `build-cost-model.js`
  // reads to say `NOT BUILDABLE YET — DECOR IS NOT IN THE SIM`, so the rail row and the price line
  // are two views of ONE fact rather than two claims about it.
  shelf: 'furniture/decor',
  rug: 'furniture/decor',
  // MACHINES — a thing that MOVES POWER, filed under the sim's own brownout tier.
  lamp: 'machines/comfort',           // Light      0.15 kW · Comfort
  growbed: 'machines/industry',       // GrowBed    0.6  kW · Industry
  heater: 'machines/lifesupport',     // Heater     1.0  kW · LifeSupport
  // ORDERS — the verbs that act on what is already on the tile.
  dig: 'orders/designate',
  stockpile: 'orders/designate',
  strip: 'orders/designate',
  erase: 'orders/designate',          // beside the three verbs it undoes — ROOM_TOOLS' own rule
  move: 'orders/crew',
  demolish: 'orders/remove',          // ALONE, and away from ERASE — ROOM_TOOLS' own rule
});

/**
 * ⭐⭐ THE RULE. Given a tool, which leaf does its own data put it in? `''` for a tool the rule
 * cannot place — which is the honest answer and the one the census reports BY NAME.
 *
 * Order of the arms is load-bearing: a power-MOVER is asked about before the class, so a generator
 * (`gen > 0`, `draw === 0` — SolarWing's shape) cannot fall through into FURNITURE on the strength
 * of drawing nothing.
 *
 * PURE.
 */
export function deriveLeaf(tool) {
  const pc = paletteCommand(tool);
  if (pc.cls === 'structural') {
    return TRAY_LEAVES.structure.includes('structure/' + pc.kind) ? 'structure/' + pc.kind : '';
  }
  if (pc.cls === 'order' || pc.cls === 'erase') return 'orders/designate';
  if (pc.cls === 'move') return 'orders/crew';
  if (pc.cls === 'demolish') return 'orders/remove';
  if (pc.cls !== 'functional' && pc.cls !== 'cosmetic') return '';
  const row = pc.deviceKind ? MACHINE_ROW[pc.deviceKind] : undefined;
  // A THING THAT MOVES POWER IS A MACHINE — draw OR generation, filed by the sim's own tier.
  if (row && (row.draw > 0 || row.gen > 0)) {
    const leaf = 'machines/' + (TIER_LEAF[row.tier] || '');
    return TRAY_LEAVES.machines.includes(leaf) ? leaf : '';
  }
  // …and a placeable device kind with NO mirrored row is not "furniture", it is an unmapped kind.
  if (pc.cls === 'functional' && (!pc.deviceKind || !row)) return '';
  return pc.cls === 'cosmetic' ? 'furniture/decor' : 'furniture/fitted';
}

/** The leaf a tool lives in, from the TABLE. `''` for an unknown tool. PURE. */
export function trayLeafFor(tool) {
  return TOOL_LEAF[tool] || '';
}

/** The category half of a leaf id (`'machines/comfort'` → `'machines'`). PURE. */
export function categoryOf(leaf) {
  const i = String(leaf || '').indexOf('/');
  return i > 0 ? String(leaf).slice(0, i) : '';
}

/** Every tool filed under `leaf`, in `ROOM_TOOLS` order — the palette's own visual order, preserved
 *  inside each leaf so no chip moves under a player's muscle memory more than the hierarchy already
 *  moves it. PURE. */
export function toolsInLeaf(leaf) {
  return ROOM_TOOLS.filter((t) => TOOL_LEAF[t] === leaf);
}

/** Leaves of a category that actually hold a tool — the rail's own membership. A leaf with no tool
 *  (today: `machines/defense`) is DECLARED so the rule has a home and NOT RENDERED, because an empty
 *  rail row is a control that answers nothing. PURE. */
export function leavesInCategory(cat) {
  return (TRAY_LEAVES[cat] || []).filter((l) => toolsInLeaf(l).length > 0);
}

/** Top-level rows that hold at least one tool. PURE. */
export function categoriesWithTools() {
  return TRAY_CATEGORIES.filter((c) => leavesInCategory(c).length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3 · NAVIGATION — a pure reducer over `{cat, leaf}`, and the ESC ladder's own depth.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The tray's boot state: nothing chosen, so the surface makes NO claim about a mode it is not in
 *  (`zoomChrome`'s own defect — three BUILD announcements on a surface that arms nothing). */
export const TRAY_ROOT = Object.freeze({ cat: '', leaf: '' });

/**
 * How many levels deep the tray is: 0 root, 1 a category, 2 a leaf. This is the number the ESC
 * ladder reads (`escStackRung`'s `trayDepth`), so "back a level" and "the breadcrumb" cannot come to
 * disagree about where the player is. PURE.
 */
export function trayDepth(state) {
  const s = state || TRAY_ROOT;
  if (s.leaf) return 2;
  if (s.cat) return 1;
  return 0;
}

/**
 * The tray reducer. Actions:
 *   `{t:'cat', cat}`   choose a top-level row (and, since a category with ONE leaf has nothing to
 *                      choose, drop straight into it — a rail click that changes nothing visible is
 *                      a control that reads as broken).
 *   `{t:'leaf', leaf}` choose a leaf.
 *   `{t:'back'}`       up one level.
 *   `{t:'root'}`       all the way out.
 *   `{t:'reveal', tool}` show the leaf a tool lives in — what a HOTKEY has to do, or the armed card
 *                      is off screen behind two rail clicks the player never made.
 * Total: an unknown category / leaf / tool returns the state unchanged. PURE.
 */
export function trayNav(state, action) {
  const s = state && typeof state === 'object' ? state : TRAY_ROOT;
  const a = action || {};
  if (a.t === 'cat') {
    if (!categoriesWithTools().includes(a.cat)) return s;
    const leaves = leavesInCategory(a.cat);
    return leaves.length === 1 ? { cat: a.cat, leaf: leaves[0] } : { cat: a.cat, leaf: '' };
  }
  if (a.t === 'leaf') {
    const cat = categoryOf(a.leaf);
    if (!leavesInCategory(cat).includes(a.leaf)) return s;
    return { cat, leaf: a.leaf };
  }
  if (a.t === 'back') {
    if (s.leaf) {
      // A one-leaf category was entered in ONE step, so it is left in one — otherwise ESC would
      // land the player on a rail with a single row and nothing to do, which is a level that exists
      // only in the state machine.
      return leavesInCategory(s.cat).length === 1 ? { cat: '', leaf: '' } : { cat: s.cat, leaf: '' };
    }
    if (s.cat) return { cat: '', leaf: '' };
    return s;
  }
  if (a.t === 'root') return { cat: '', leaf: '' };
  if (a.t === 'reveal') {
    const leaf = trayLeafFor(a.tool);
    if (!leaf) return s;
    return { cat: categoryOf(leaf), leaf };
  }
  return s;
}

/**
 * The breadcrumb segments AFTER the surface's own label — `['MACHINES','COMFORT']` at
 * `machines/comfort`, `[]` at the root. Each carries the depth a click on it should return to, so
 * the crumb and `trayNav` cannot word one ladder two ways. PURE.
 */
export function trayCrumbs(state) {
  const s = state || TRAY_ROOT;
  const out = [];
  if (s.cat) out.push({ label: CATEGORY_LABEL[s.cat] || s.cat, depth: 1, cat: s.cat, leaf: '' });
  if (s.leaf) out.push({ label: LEAF_LABEL[s.leaf] || s.leaf, depth: 2, cat: s.cat, leaf: s.leaf });
  return out;
}

/**
 * ⭐ WHAT ESC WILL DO, IN THE PLAYER'S WORDS — and it is written from the SAME rung the key handler
 * obeys rather than from a second guess. The design puts `ESC · BACK A LEVEL` in the tray's top
 * right; that sentence is TRUE only in the middle of the ladder, and a permanent one would lie on
 * the two rungs either side of it (with a tool in hand ESC disarms; at the root it leaves the room).
 * PURE.
 * @param {'disarm'|'dialogue'|'persona'|'tray'|'exit'|'pass'} rung
 */
export function trayEscText(rung) {
  if (rung === 'disarm') return 'ESC · PUT THE TOOL DOWN';
  if (rung === 'tray') return 'ESC · BACK A LEVEL';
  if (rung === 'exit') return 'ESC · BACK TO THE SHIP';
  return '';
}

/**
 * ⭐ WHAT AN EMPTY CARD ROW SAYS. The tray's band is a FIXED reserve (see `roomzoom.css`: a
 * content-driven height would rescale the whole room on a menu click), so at the root and at a
 * category there is real estate with no cards in it. A blank rectangle reads as a menu that failed
 * to load; naming the control the player is standing in front of costs nothing and is true.
 *
 * ⚠️ IT IS AN INSTRUCTION ABOUT A CONTROL, NOT A CLAIM ABOUT A MODE — `zoomChrome`'s defect was a
 * disarmed surface announcing BUILD three times, and this says only "there is a rail beside you".
 * '' at depth 2, where the cards speak for themselves. PURE.
 */
export function trayEmptyText(state) {
  const d = trayDepth(state);
  if (d === 0) return 'PICK A CATEGORY';
  if (d === 1) return 'PICK A GROUP';
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4 · THE CARDS — art, name, price, one honest stat line.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The ART a tool shows, or `''` for a tool that puts no THING down (the order verbs, ERASE, MOVE,
 * DEMOLISH — all four are functions of what is ALREADY on the tile).
 *
 * ⛔ DERIVED FROM THE REGISTRY, NOT TRANSCRIBED, and it lives HERE now because it has TWO consumers
 * that must never disagree: the build ghost standing on the hovered tile and the CARD the player
 * armed it from. It was `roomzoom-view.js`'s (which still re-exports it, so every existing importer
 * and `build-ghost.test.js` are untouched); moving it into the pure layer is what lets a card draw
 * the piece without the tray reaching into a DOM controller.
 *
 * ⚠️ ONE TOOL CANNOT BE DERIVED AND SAYS SO IN `PALETTE_CMD`. `DeviceKind.Light` has NO `functional`
 * registry row — its art is a glyph SUBSTITUTION — so its row states an `itemId` outright. FILED
 * there, unchanged here.
 * PURE of DOM; reads only the frozen tables.
 */
export function ghostArtId(tool) {
  const pc = paletteCommand(tool);
  if (pc.itemId) return pc.itemId;
  if (pc.cls !== 'functional' || !pc.deviceKind) return '';
  // ⛔⛔ RESOLVE THROUGH THE **GLYPH**, NOT THROUGH THE FIRST MATCHING ROW. `DeviceKind → itemId` IS
  // NOT A FUNCTION (`wear.js deviceKindsWithSeveralPieces`): `plant-pot` and `potted-plant` both
  // carry `deviceKind: 'PlantPot'`, and a first-match scan answers the OLD warm art while a PLACED
  // plant resolves glyph `'P'` and draws `plant-pot`. So this asks the registry which glyph the kind
  // projects and then asks the SAME function the placed piece asks — two hops down ONE route.
  let fallback = '';
  for (const id of Object.keys(ITEMS)) {
    const e = ITEMS[id];
    if (!e || e.kind !== 'functional' || e.deviceKind !== pc.deviceKind) continue;
    if (typeof e.glyph === 'string' && e.glyph.length === 1) {
      const viaGlyph = itemIdForGlyphChar(e.glyph);
      if (viaGlyph) return viaGlyph;
    }
    if (!fallback) fallback = id;
  }
  return fallback;
}

/** InvariantCulture number → string: at most two decimals, no trailing zeros, always `.`.
 *  `String(Number)` is locale-independent in ECMAScript; nothing here reaches `toLocaleString`. */
function num(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}

/** Centimetres → metres, formatted. `200` → `'2'`, `70` → `'0.7'`. PURE. */
function metres(cm) {
  return num(Number(cm) / 100);
}

/** kW a placed piece of this tool draws, or 0. Reads the mirrored `machines.def` row. PURE. */
export function toolDrawKw(tool) {
  const kind = paletteCommand(tool).deviceKind;
  const row = kind ? MACHINE_ROW[kind] : undefined;
  return row ? row.draw : 0;
}

/** The piece's own centimetres, or `undefined` — the registry's `SPECS`, through the SAME art id the
 *  ghost draws. PURE. */
export function toolSpecCm(tool) {
  const id = ghostArtId(tool);
  return id ? itemSpecCm(id) : undefined;
}

/**
 * THE CARD'S PRICE LINE.
 *
 * ⛔ IT IS `chipCostText`'s ANSWER, NOT A SECOND ONE — `3 PARTS` for a placement, `NOT YET` for the
 * two decor tools that reach no sim, and the one thing that function returns nothing for (a tool
 * that spends no PARTS at all: a wall's material is `BuildSystem`'s haul and a designation costs
 * nothing) is said in words rather than left blank, because a card with an empty price line reads as
 * a card whose price nobody worked out.
 *
 * ⚠️ THE DESIGN SAYS `scrip <n>` AND THIS SAYS `3 PARTS`, DELIBERATELY. The design's currency is a
 * format, not a fact: `PlaceDeviceCommand.Currency` is `ItemKind.Parts` and the whole
 * `build-cost-model.js` package exists because the surface used to say nothing about it. Inventing a
 * second currency word on the one surface that spends the first is the fabrication non-negotiable 3
 * forbids. PURE.
 */
export function trayPriceText(tool) {
  return chipCostText(tool) || 'NO PARTS';
}

/** What a gesture-only tool can honestly say about itself: how it is DRIVEN. From `roomDragMode`,
 *  the shipped predicate the canvas itself obeys — never a sentence about what the verb means. */
const GESTURE_TEXT = Object.freeze({
  fill: 'DRAG A REGION', line: 'DRAG A RUN', rect: 'DRAG A REGION', '': 'ONE CLICK',
});

/**
 * ⭐⭐ THE ONE HONEST STAT LINE — the design's `6 kw · 2.1 m`, built ONLY out of numbers that exist.
 *
 * ⛔ NOTHING HERE IS AUTHORED PROSE ABOUT A PIECE. Three sources, in this order, and a term is
 * omitted when its source has nothing to say:
 *   1. `<draw> KW`   — the mirrored `machines.def` draw column, when it is non-zero.
 *   2. `<w> × <d> M` — the piece's own `SPECS` centimetres, through the same art id the ghost draws.
 *   3. a STRUCTURE tool has no `SPECS` row (its art is a box this surface authors), so it states the
 *      geometry the surface actually draws it at: one tile across (`M_PER_TILE`) by the ceiling
 *      (`ROOM_HEIGHT_M`) or the door opening (`DOOR_HEIGHT_M`), per tile.
 * …and when all three are silent — the six ORDER/ERASE/MOVE/DEMOLISH verbs, which place no thing and
 * cost no matter — the line says how the tool is DRIVEN, read off `roomDragMode`, the same predicate
 * the canvas gesture obeys. That is a fact about the control, measured from the control.
 *
 * ⚠️ THE DESIGN'S `stores 40 kwh` HAS NO ANALOGUE AND IS NOT FAKED. No battery is a palette tool and
 * no channel or def carries a storage figure for one; when a battery tool arrives it gets a term
 * here from `machines.def`, not a sentence from a mock. PURE.
 *
 * @param {string} tool
 * @returns {string}
 */
export function trayStatText(tool) {
  const parts = [];
  const draw = toolDrawKw(tool);
  if (draw > 0) parts.push(num(draw) + ' KW');
  const spec = toolSpecCm(tool);
  if (spec) {
    parts.push(metres(spec.w) + ' × ' + metres(spec.d) + ' M');
  } else {
    const pc = paletteCommand(tool);
    if (pc.cls === 'structural') {
      const heightM = pc.kind === 'floor' ? 0 : (pc.kind === 'door' ? DOOR_HEIGHT_M : ROOM_HEIGHT_M);
      parts.push(heightM > 0
        ? num(M_PER_TILE) + ' × ' + num(heightM) + ' M PER TILE'
        : num(M_PER_TILE) + ' × ' + num(M_PER_TILE) + ' M PER TILE');
    }
  }
  if (!parts.length) parts.push(GESTURE_TEXT[roomDragMode(tool) || ''] || GESTURE_TEXT['']);
  return parts.join(' · ');
}

/**
 * ⭐⭐ THE CARDS OF ONE LEAF.
 *
 * Two shapes, and the second one is ruling E4's material strip re-housed rather than re-invented:
 *   · A TOOL CARD — one per tool in the leaf (`{ kind:'tool', tool, … }`).
 *   · A MATERIAL CARD — WALL and FLOOR are ONE tool each with SIX materials, and the flat palette
 *     revealed those six in `#rz-matstrip` on arm. The tray has a level for them already, so the six
 *     ARE the leaf's cards (`{ kind:'mat', tool, mat, … }`), driven by `materialsForTool` — the SAME
 *     data the strip was driven by, so the swatches, their labels and their bytes cannot drift.
 *
 * `artId` is what the caller draws (the registry piece for a tool card, the material's own item-set
 * id for a material card) — this function never touches the DOM.
 *
 * @param {string} leaf
 * @returns {Array<{key:string,kind:'tool'|'mat',tool:string,mat:number,label:string,artId:string,price:string,stat:string}>}
 */
export function trayCards(leaf) {
  const tools = toolsInLeaf(leaf);
  const out = [];
  for (const tool of tools) {
    if (toolHasMaterial(tool)) {
      for (const m of materialsForTool(tool)) {
        out.push({
          key: tool + ':' + m.mat,
          kind: 'mat',
          tool,
          mat: m.mat | 0,
          label: materialLabel(tool, m.mat) || m.label,
          artId: m.id,
          price: trayPriceText(tool),
          stat: trayStatText(tool),
        });
      }
      continue;
    }
    out.push({
      key: tool,
      kind: 'tool',
      tool,
      mat: -1,
      label: TOOL_LABEL[tool] || String(tool).toUpperCase(),
      artId: ghostArtId(tool),
      price: trayPriceText(tool),
      stat: trayStatText(tool),
    });
  }
  return out;
}

/**
 * ⭐ THE IN-ROOM CALLOUT'S TWO SENTENCES — the design's `PLACE · 340` on the leader and
 * `2.1 M · DRAWS 6 KW` on the dimension line, in this repo's own words and off this repo's own data.
 *
 * ⛔ THE REFUSAL ARM IS THE COST ROW'S SENTENCE, NOT A SHORTER ONE. When the surface can already
 * PROVE the click will be refused, the leader says exactly what the armed cost row says
 * (`paletteCostRow(...).text`), because two sentences about one refusal is how a surface comes to
 * explain itself twice and disagree once. The caller passes that row in rather than this file
 * reaching for the ledger — a pure function does not know what is aboard.
 *
 * @param {string} tool
 * @param {{text:string, level:string}|null} costRow  `paletteCostRow(tool, partsAboard)`
 * @returns {{lead:string, dim:string}} `lead` is the leader label; `dim` the dimension line ('' when
 *          the tool has no numbers worth a dimension line).
 */
export function trayCallout(tool, costRow) {
  const refused = !!(costRow && costRow.level === 'fault');
  const price = chipCostText(tool);
  const lead = refused ? String(costRow.text)
    : (price ? 'PLACE · ' + price : 'PLACE · ' + (TOOL_LABEL[tool] || String(tool).toUpperCase()));
  return { lead, dim: trayStatText(tool) };
}
