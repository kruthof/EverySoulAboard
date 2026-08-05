// ⛔ RETIRED (VR-A, 2026-08-04) — BEHIND `paper-tokens.js`, WHICH RE-EXPORTS EVERY NAME BELOW.
// Import `./paper-tokens.js` from here on; this module's `INK` is re-exported there as `WARM_INK`
// because the paper layer claims that name for the opposite meaning (black on paper, not cream on
// navy). Nothing here is deleted this wave — seventeen consumers still read it and the visual
// redesign restyles surface by surface (P3 room zoom, P4 overview, P5 pawns, P6 moss). Its tests
// moved with it: `warm-tokens.test.js` is now `paper-tokens.test.js` and covers BOTH layers.
//
// Warm-theme token module — the SINGLE source of the warm palette + material/role tables for the
// SVG visual rework. The SVG item library, the pawn generator, and the two SVG views (all built in
// later phases) import from here; nothing else defines a warm colour. Pure ES module: no DOM, no
// side effects, no clock — every export is a frozen table or a pure helper.
//
// Authority: docs/design/perilune-art-direction-warm.md ("the welcoming ship"). Every hex/rgba
// below is quoted verbatim from that bible; the section it comes from is cited inline. Where a
// value is DERIVED rather than lifted (e.g. a room-label ink), that is written out.
//
// This is a VIEW-ONLY token set. Nothing here is hashed, nothing here touches the sim, and it does
// NOT revive the parked WebGL renderer — render/palette.js (the GlyphColor→RGB skin) is a separate,
// frozen module and is intentionally untouched.

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §2.1  Void / space — the deep-navy ramp (never black)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The canonical full-bleed space ramp (bible §2.1 / §12 resolution: the UI-warm navy is canon). */
export const VOID = Object.freeze({
  core: '#141a2b', //  lit centre of the field
  mid:  '#0a0c16', //  the 50% ring
  edge: '#05060c', //  outermost navy — as dark as the ship gets, still blue-navy, never #000
});

/** The three-stop radial for the Ship-Overview backdrop (bible §2.1, literal). */
export const VOID_GRADIENT =
  'radial-gradient(150% 120% at 60% 30%, #141a2b 0%, #0a0c16 50%, #05060c 100%)';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §2.2  Hull — navy-steel + the amber trim-light
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Navy-steel hull tokens (bible §2.2; §12 conflict-2 resolution keeps #3a4b5c vs #3f4e5c apart). */
export const HULL = Object.freeze({
  plate:     '#28323d', //  hull body / silhouette fill (== HULL PLATING floor)
  stroke:    '#3f4e5c', //  the ship's edge line (lighter than the wall body)
  shadow:    '#1c242d', //  inner bevel on the plate
  wallBody:  '#3a4b5c', //  bulkhead / wall body in the tileset
  deepSteel: '#1f2830', //  nacelle / bridge-nub structural triangle
  deepSteel2:'#1a222b', //  the darkest structural steel
});

/**
 * The amber trim-light — the inset top edge that makes navy-steel read warm+powered (bible §2.2).
 * The band is the ship's heartbeat: alpha scales with how powered the room is (min→max), so a
 * consumer lerps between `min` and `max`; `base` is the mid value to use when power is unknown.
 */
export const TRIM_LIGHT = Object.freeze({
  min:  'rgba(232,147,74,.35)', //  low power
  base: 'rgba(232,147,74,.5)',  //  default when power is unknown (mid of the .35–.6 band)
  max:  'rgba(232,147,74,.6)',  //  fully powered
  rgb:  '232,147,74',           //  the raw amber-trim triple, for consumers building their own alpha
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §2.3  Amber — the accent ramp
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The amber accent ramp + its rust/highlight neighbours (bible §2.3, literal). */
export const AMBER = Object.freeze({
  deep:  '#cf7a33', //  the anchor (matches console --amber-1); ship name, active borders
  base:  '#e8934a', //  primary amber accent, trim source, links       (amber-1)
  light: '#f2b563', //  highlights, selected text, rim-light, cursor
  rust:  '#b5652a', //  the darker warm end (also stores-role uniform)
  ember: '#e8863c', //  radiant cores (reactor, cooker, hearth)
  emberHot: '#ffe6b0', // hot centre of an ember core
  rustRed: '#c14a32', // reactor role, hazard, med cross — the warm-red end
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §2.5  Status colours — the harmonic's resolved semantic ramp (H-7). One meaning, one colour.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** good / warn / bad / cold — shared with console chrome and stage lens washes (bible §2.5). */
export const STATUS = Object.freeze({
  good:       '#5aa77f', //  online / nominal (matches console --good)
  goodBright: '#6fc09a',
  warn:       '#cf7a33', //  caution / brownout (matches console --warn; == AMBER.deep)
  bad:        '#c25a3f', //  fault / hazard (matches console --bad)
  badBright:  '#e07a5f',
  cold:       '#5a9fd4', //  the ONE cool signal — cryo / coolant / cold-lens, reserved (H-2)
  coldBright: '#5ac8dc',
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §2.6  UI ink ramp — warm-grey ascending to cream (HUD text hierarchy)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The text/label hierarchy on the floating HUD (bible §2.6, literal). */
export const INK = Object.freeze({
  bright: '#e8dcc9', //  crew names, headings — the brightest ink
  body:   '#b3aa9c', //  default HUD body text
  mute:   '#8c8377', //  secondary text, role labels
  faint:  '#57503f', //  micro-labels ("CREW WATCH", "SELECTED", "LENS")
  hairline:     '#2b241c', //  hairline borders
  insetBorder:  '#3a332a', //  panel-inset borders
  activeBorder: '#cf7a33', //  active border (== AMBER.deep)
  highlight:    '#f2b563', //  highlight text (== AMBER.light)
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §8  Per-role hue table — each role owns a hue so the deck reads at a glance
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Keyed by a STABLE role id. The crew-sprites role→hue table (bible §8) is authoritative
// (§12 conflict-1: the UI-mock per-character hues are placeholder data, not a competing table).
// The role ids match the `RoleNow` phrases authored in sim/Sim.Gen/AuthoredShips.cs
// ("life-support lead", "hydroponics apprentice", "reactor watch", "damage control", "ship's
// medic", "helm watch", "stores & logistics", "comms & sensors"); `roleHue()` normalizes those
// phrases onto these ids.

/** role id → { uniform, accent, label }. `uniform` is the role hue; `accent` the collar accent. */
export const ROLE_HUE = Object.freeze({
  'life-support':   Object.freeze({ uniform: '#e8934a', accent: '#f2b563', label: 'LIFE-SUPPORT'      }),
  'hydroponics':    Object.freeze({ uniform: '#6f8a3a', accent: '#9ab55a', label: 'HYDROPONICS'       }),
  'reactor':        Object.freeze({ uniform: '#c14a32', accent: '#e8724a', label: 'REACTOR WATCH'     }),
  'damage-control': Object.freeze({ uniform: '#4a6b82', accent: '#7fb0d8', label: 'DAMAGE CONTROL'    }),
  'medic':          Object.freeze({ uniform: '#e8dcc9', accent: '#c14a32', label: "SHIP'S MEDIC"      }),
  'helm':           Object.freeze({ uniform: '#2f6f7a', accent: '#5ab0b8', label: 'HELM WATCH'        }),
  'stores':         Object.freeze({ uniform: '#b5852f', accent: '#e0b45a', label: 'STORES & LOGISTICS'}),
  'comms':          Object.freeze({ uniform: '#5a9fd4', accent: '#8fc4ea', label: 'COMMS & SENSORS'   }),
});

/**
 * Deterministic fallback for an unknown role (bible §8 note + UI-mock apprentice grey #8c8377):
 * a neutral warm-grey uniform. Never null, never a throw.
 */
export const ROLE_FALLBACK = Object.freeze({ uniform: '#8c8377', accent: '#b3aa9c', label: 'CREW' });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §2.4 / §5  RoomType → floor material
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Every member of `RoomType` (sim/Sim.Core/Rooms/RoomType.cs) is covered — a missing member would
// leave a room unfloored. `material` is one of 'wood' | 'grow' | 'cream' | 'steel-tan' (the four
// load-bearing categories, bible §2.4). `floor`/`line` are lifted from §2.4/§5; `trim` is the amber
// heartbeat base (bible §2.2, TRIM_LIGHT.base); `label` is a DERIVED warm-dark translucent ink for
// the room name drawn over the floor (each material is a mid-value warm surface, so a dark warm
// label reads on all four — derived, not lifted).

/** The four material category definitions (bible §2.4/§5). */
export const MATERIAL = Object.freeze({
  wood:        Object.freeze({ floor: '#c2894e', line: '#b57e45',            label: 'rgba(60,42,26,.72)' }),
  grow:        Object.freeze({ floor: '#8a9857', line: 'rgba(60,90,40,.55)', label: 'rgba(40,50,24,.72)' }),
  cream:       Object.freeze({ floor: '#d8c39c', line: 'rgba(0,0,0,.1)',     label: 'rgba(70,58,40,.72)' }),
  'steel-tan': Object.freeze({ floor: '#9c8763', line: 'rgba(0,0,0,.16)',    label: 'rgba(43,36,28,.72)' }),
});

/** Build a frozen room-material row from a material category (bible §2.2 trim base for all). */
function room(material) {
  const m = MATERIAL[material];
  return Object.freeze({ material, floor: m.floor, line: m.line, trim: TRIM_LIGHT.base, label: m.label });
}

/**
 * RoomType name → material row. Covers ALL 17 members of the enum. Judgment calls documented:
 *   - None          → steel-tan : unassigned/neutral deck (same as the fallback).
 *   - Bridge/Command→ cream      : helm/command instrument rooms (task rule).
 *   - Medbay        → cream      : clinical (task rule).
 *   - Observatory   → cream      : an instrument/viewing room, kin to the helm cream (JUDGMENT).
 *   - Quarters      → wood       : living space; §5 offers CARPET as a comfort variant, but the
 *                                  task's "living/social = wood" rule wins (JUDGMENT: wood over carpet).
 *   - Mess/Commons  → wood       : galley / common room, social (bible §2.4).
 *   - Hydro         → grow       : hydroponics (task rule).
 *   - Corridor      → steel-tan  : spine/utility (task rule).
 *   - Cryo          → cream      : the sleeper bay is a clinical room in every way that matters —
 *                                  sealed vessels, sterile surfaces, bodies under supervision — so it
 *                                  takes Medbay's cream rather than the utility steel-tan (JUDGMENT).
 *   - Workshop/Fabrication/Reactor/Engineering/LifeSupport/Storage → steel-tan : work + utility.
 *                                  §5 offers METAL GRATING for reactor/engineering, but the material
 *                                  CATEGORY is the utility steel-tan (JUDGMENT: grating is a floor
 *                                  variant within the steel-tan utility family, not a 5th category).
 */
export const ROOM_MATERIAL = Object.freeze({
  None:        room('steel-tan'),
  Corridor:    room('steel-tan'),
  Bridge:      room('cream'),
  Command:     room('cream'),
  Medbay:      room('cream'),
  Quarters:    room('wood'),
  Observatory: room('cream'),
  Hydro:       room('grow'),
  Mess:        room('wood'),
  Workshop:    room('steel-tan'),
  Commons:     room('wood'),
  Reactor:     room('steel-tan'),
  Engineering: room('steel-tan'),
  Fabrication: room('steel-tan'),
  Storage:     room('steel-tan'),
  LifeSupport: room('steel-tan'),
  Cryo:        room('cream'),
});

/** RoomType name → stable enum id (mirrors sim/Sim.Core/Rooms/RoomType.cs; never reorder). */
export const ROOM_TYPE = Object.freeze({
  None: 0, Corridor: 1, Bridge: 2, Command: 3, Medbay: 4, Quarters: 5, Observatory: 6, Hydro: 7,
  Mess: 8, Workshop: 9, Commons: 10, Reactor: 11, Engineering: 12, Fabrication: 13, Storage: 14,
  LifeSupport: 15, Cryo: 16,
});

/** id → RoomType name (reverse of ROOM_TYPE), for the tolerant numeric helper path. */
const ROOM_BY_ID = Object.freeze(
  Object.fromEntries(Object.entries(ROOM_TYPE).map(([name, id]) => [id, name])),
);

/** The neutral fallback material row (== None): a utility steel-tan deck. */
export const ROOM_MATERIAL_FALLBACK = ROOM_MATERIAL.None;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §9  The HUD — floating, translucent, blurred glass (`.hud` token, literal)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The `.hud` glass-panel token (bible §9, literal). Constants for the later HUD/DOM reskin. */
export const HUD_TOKEN = Object.freeze({
  background:  'rgba(18,14,10,.62)',        //  warm near-black brown at 62%
  blur:        '10px',                       //  backdrop-filter blur radius
  backdropFilter: 'blur(10px)',
  borderColor: 'rgba(232,147,74,.16)',       //  hairline amber
  border:      '1px solid rgba(232,147,74,.16)',
  shadow:      '0 10px 34px rgba(0,0,0,.5)', //  soft drop shadow
  fontFamily:  "'Space Mono', ui-monospace, monospace", //  bible §9 WA-25
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Pure helpers — tolerant of unknown keys (deterministic fallback, NEVER throw)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a RoomType (enum name string, or numeric enum byte) to its frozen material row.
 * Unknown / null / out-of-range → ROOM_MATERIAL_FALLBACK (the neutral steel-tan deck). Never throws.
 * @param {string|number|null|undefined} roomType
 */
export function roomMaterial(roomType) {
  if (typeof roomType === 'number') {
    const name = ROOM_BY_ID[roomType];
    return (name && ROOM_MATERIAL[name]) || ROOM_MATERIAL_FALLBACK;
  }
  if (typeof roomType === 'string' && roomType.length) {
    return ROOM_MATERIAL[roomType] || ROOM_MATERIAL_FALLBACK;
  }
  return ROOM_MATERIAL_FALLBACK;
}

// Ordered longest-first so "life-support" is tried before a bare "support", etc. Each entry maps a
// substring found in a `RoleNow` phrase to a ROLE_HUE id.
const ROLE_MATCHERS = Object.freeze([
  ['life-support', 'life-support'], ['life support', 'life-support'],
  ['hydroponic', 'hydroponics'],
  ['reactor', 'reactor'],
  ['damage control', 'damage-control'], ['damage-control', 'damage-control'],
  ['medic', 'medic'], ['medtech', 'medic'],
  ['helm', 'helm'], ['navigat', 'helm'],
  ['stores', 'stores'], ['logistics', 'stores'], ['quartermaster', 'stores'],
  ['comms', 'comms'], ['sensor', 'comms'],
]);

/**
 * Resolve a crew role — either a stable ROLE_HUE id ('reactor') or a free `RoleNow` phrase
 * ("reactor watch", "ship's medic") — to its frozen hue row. Unknown / null → ROLE_FALLBACK
 * (a neutral warm-grey). Never throws.
 * @param {string|null|undefined} role
 */
export function roleHue(role) {
  if (typeof role !== 'string' || !role.length) return ROLE_FALLBACK;
  const key = role.toLowerCase().trim();
  if (ROLE_HUE[key]) return ROLE_HUE[key]; // exact id fast-path
  for (const [needle, id] of ROLE_MATCHERS) {
    if (key.includes(needle)) return ROLE_HUE[id];
  }
  return ROLE_FALLBACK;
}
