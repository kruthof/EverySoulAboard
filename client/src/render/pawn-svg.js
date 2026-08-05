// THE INK FIGURES — the parametric SVG PAWN generator, redrawn in the paper-and-ink dialect.
//
// One pure builder serves BOTH forms of a crew member, from ONE path list:
//   • pawnSprite(desc, opts) — the in-world pawn on the floor (16×24 viewBox, feet at 8,23),
//   • pawnChip(desc, opts)   — the roster bust in its ink well  (16×20 viewBox).
//
// ── AUTHORITY ─────────────────────────────────────────────────────────────────────────────────
// `design-import/Perilune Game.dc.html` IS THE SPEC (charter §1 "Pawns", ruling E10). Every path in
// the three BUILDS below is quoted VERBATIM out of that markup — Screen 04's three portrait figures
// (`<g transform="translate(158,282) scale(1.55)">`, lines 419 / 434 / 449) which are the same path
// lists the doc re-emits at Screen 04's "on the board · 1:1" strip (`scale(0.6)`, line 469), at
// Screen 02's room (`scale(1.04)`, line 248), at Screen 02's crew dock (`scale(0.42)`, line 261)
// and at Screen 01's 20×24 crew marker (`viewBox="-26 -152 52 156"`, line 91). THAT IS THE WHOLE
// POINT OF THE IDIOM AND IT IS THE POINT OF THIS FILE: one generator, one path list, every scale —
// "height, stance and silhouette carry them at this size; the details reward zooming" (doc, line 464).
//
// ── FIGURE UNITS ──────────────────────────────────────────────────────────────────────────────
// The design draws a person in its own units: FEET AT y = 0, x CENTRED ON 0, the body rising into
// negative y, head crown between −128 and −152. A form places the figure by `translate + scale`,
// exactly as the doc does, so the two forms cannot drift apart the way a rim-light and its shadow do
// when two hand-kept path lists are maintained side by side.
//
// ── TWO PASSES (charter §1, ruling E10) ───────────────────────────────────────────────────────
// The in-world pawn is emitted through `oblique.ghost()`: a KNOCKOUT pass in paper `#EBE4D1` at
// `ink + 3.0` width, then the ink pass. The knockout is what lets a figure stand on a hatched wall,
// a floor grid or a starfield and still read — it carves its own silhouette out of the art. Measured
// off the doc's marker: 1.4 → 4.4, 1.35 → 4.3, 1.2 → 4.2, 1.0 → 4.0.
// ⚠️ THE CHIP IS SINGLE-PASS, and that is the DESIGN's own choice, not a shortcut: the doc's crew
// dock (line 261) draws the figure with `fill="none" stroke="#14120F"` and NO knockout, because it
// stands on bare paper inside an ink well where there is nothing to knock out. It is also the cheap
// half of E10 — the chip is rebuilt on a roster change, the sprite ten times a second.
//
// ── STROKE WEIGHT IS A PARAMETER, NOT A CONSTANT ──────────────────────────────────────────────
// The doc's board-scale figure is 91 px tall (152 units × 0.6). Ours is ~37 px on the Overview and
// ~64 px in the Room Zoom, so the doc's absolute stroke widths would land at a third of a pixel and
// vanish. `weight` multiplies every stroke (and the knockout's widen term with it, so the halo/ink
// RATIO the doc fixes is preserved). The geometry is the doc's; the pen is ours.
//
// ── DETERMINISM ───────────────────────────────────────────────────────────────────────────────
// Pure ES module: no DOM, no clock, no RNG, no locale API, no memo table. Same (cid, role) ⇒ the
// same bytes, every frame. `cid` chooses BUILD · TOPPER · MARK · STATURE (who the person is);
// `role` chooses the PROP (what they carry). Colour no longer distinguishes anybody — everything is
// ink `#14120F` on paper `#EBE4D1`, and the ONE accent `#7B2C22` is spent on exactly one thing, the
// keepsake mug (the doc's "Osei's mug", the emotional beat charter §1 reserves oxblood for).

import { INK, PAPER, ATTEND, GHOST, ghost, esc } from './oblique.js';
import { ROLE_HUE, roleHue } from '../theme/paper-tokens.js';

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Rounding — LOCAL, and deliberately not `oblique.n()`
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Round to 2 dp, −0 normalised. Figure units are 100-ish wide, so 2 dp is well past the pen. */
function f2(v) { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; }

/**
 * Round to 4 dp. ⚠️ The GROUP SCALE cannot go through a 2-dp round: the three statures are 0.90 /
 * 0.95 / 1.00 of a ~0.144 base, i.e. 0.1302 / 0.1374 / 0.1447 — at 2 dp two of the three collapse to
 * "0.14" and a whole distinctness axis silently disappears from the emitted string.
 */
function f4(v) { const r = Math.round(v * 10000) / 10000; return Object.is(r, -0) ? 0 : r; }

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Deterministic hashing — a soul's stable key → an unsigned 32-bit hash (FNV-1a). Unchanged.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The stable identity key for a descriptor: cid if present, else role, else the empty string. */
function cidKey(desc) {
  const cid = desc && desc.cid;
  if (cid !== undefined && cid !== null && cid !== '') return String(cid);
  if (desc && typeof desc.role === 'string' && desc.role.length) return desc.role;
  return '';
}

/** FNV-1a over a string → unsigned 32-bit. Pure, allocation-free, culture-independent. */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE THREE BUILDS — quoted verbatim from `Perilune Game.dc.html`
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Each build is a complete figure: feet, legs, body, shoulders, arms, head, hair, face. The paths
// the doc uses as PERSONAL detail (Rell's collar and pocket and mug, Nour's apron and bun, Halvard's
// torn shoulder) are lifted OUT of the builds and into the TOPPER / MARK tables below, so a soul is
// a build plus its own details rather than one of three fixed portraits.
//
// Anchors travel with the build so a modifier never has to know which body it is decorating:
//   head    {cx,cy,rx,ry}  the skull ellipse — toppers hang off it
//   hand    [x,y]          the RIGHT hand, where the role's prop is carried
//   off     [x,y]          the LEFT hand, where a keepsake is held
//   sy      shoulder line y   ·  hem  hem line y  ·  hw  half-width at the shoulders
//   wide    the body's WIDEST half-width — measured off the body path's own control points. Props
//           and keepsakes are anchored outside it and linked back to the hand by a grip stub, so a
//           mug never straddles the coat line (which is what the first render did on all three
//           builds: the arm anchors are TUCKED AGAINST the body, not clear of it).
//   top     the crown, BEFORE any topper (the tightest bound a form can use for framing)

/** @type {Readonly<Object<string,object>>} */
export const BUILDS = Object.freeze({
  // ── TALL — Screen 04 "Rell": tall, folded in on herself (doc line 419) ──
  tall: Object.freeze({
    label: 'tall',
    head: Object.freeze({ cx: 0, cy: -132, rx: 11, ry: 12.5 }),
    hand: Object.freeze([17, -86]), off: Object.freeze([-15, -74]),
    sy: -116, hem: -40, hw: 16, wide: 23, top: -147,
    paths: Object.freeze([
      { d: 'M-13 0 L-2 0 M2 0 L13 0', sw: 1.4 },                                          // feet
      { d: 'M-8 -2 L-7 -66 M7 -2 L6 -66', sw: 1.2 },                                      // legs
      { d: 'M-16 -116 C-23 -98 -21 -60 -18 -40 L18 -40 C21 -60 23 -98 16 -116', sw: 1.35 }, // coat
      { d: 'M-16 -116 C-8 -125 8 -125 16 -116', sw: 1.2 },                                // shoulders
      { d: 'M-16 -110 C-25 -96 -23 -80 -15 -74', sw: 1.2 },                               // left arm
      { d: 'M16 -110 C25 -100 23 -90 17 -86', sw: 1.2 },                                  // right arm
      { ellipse: [0, -132, 11, 12.5], sw: 1.3 },                                          // head
      { d: 'M-11 -136 C-8 -147 8 -147 11 -136', sw: 1.3 },                                // hair
      { d: 'M-6 -134 L-3 -134 M4 -134 L7 -134', sw: 1.4 },                                // eyes
      { d: 'M-1 -126 L3 -126', sw: 1 },                                                   // mouth
    ]),
  }),
  // ── SHORT — Screen 04 "Nour": short, wide stance, sleeves rolled (doc line 434) ──
  short: Object.freeze({
    label: 'short',
    head: Object.freeze({ cx: 0, cy: -114, rx: 11.5, ry: 12 }),
    hand: Object.freeze([30, -110]), off: Object.freeze([-19, -64]),
    sy: -100, hem: -34, hw: 18, wide: 27, top: -128,
    paths: Object.freeze([
      { d: 'M-12 0 L-3 0 M3 0 L12 0', sw: 1.4 },                                          // feet
      { d: 'M-7 -2 L-8 -34 M8 -2 L7 -34', sw: 1.2 },                                      // legs
      { d: 'M-18 -100 C-27 -80 -25 -46 -20 -34 L20 -34 C25 -46 27 -80 18 -100', sw: 1.35 }, // body
      { d: 'M-18 -100 C-9 -108 9 -108 18 -100', sw: 1.2 },                                // shoulders
      { d: 'M-22 -88 L-14 -85 M20 -90 L13 -87', sw: 1.1 },                                // rolled sleeves
      { d: 'M-18 -96 C-27 -84 -25 -70 -19 -64', sw: 1.2 },                                // left arm
      { d: 'M18 -96 C28 -92 32 -102 30 -110', sw: 1.2 },                                  // right arm
      { ellipse: [0, -114, 11.5, 12], sw: 1.3 },                                          // head
      { d: 'M-11 -118 C-8 -128 8 -128 11 -118', sw: 1.3 },                                // hair
      { d: 'M-6 -116 L-3 -116 M4 -116 L7 -116', sw: 1.4 },                                // eyes
      { d: 'M-3 -108 Q0 -105 3 -108', sw: 1.1 },                                          // mouth
    ]),
  }),
  // ── BROAD — Screen 04 "Halvard": broad, leaning forward, boots on (doc line 449) ──
  broad: Object.freeze({
    label: 'broad',
    head: Object.freeze({ cx: 0, cy: -138, rx: 12.5, ry: 13.5 }),
    hand: Object.freeze([22, -100]), off: Object.freeze([-22, -100]),
    sy: -122, hem: -52, hw: 24, wide: 31, top: -151,
    paths: Object.freeze([
      { d: 'M-14 0 L-14 -13 L-4 -13 L-4 0 Z', sw: 1.4 },                                  // left boot
      { d: 'M4 0 L4 -13 L14 -13 L14 0 Z', sw: 1.4 },                                      // right boot
      { d: 'M-10 -13 L-10 -52 M10 -13 L10 -52', sw: 1.2 },                                // legs
      { d: 'M-24 -122 C-31 -100 -29 -66 -25 -52 L25 -52 C29 -66 31 -100 24 -122', sw: 1.4 }, // body
      { d: 'M-24 -122 C-12 -131 12 -131 24 -122', sw: 1.25 },                             // shoulders
      { d: 'M-22 -100 C-8 -88 8 -88 22 -100', sw: 1.5 },                                  // folded arms
      { d: 'M-22 -93 C-8 -81 8 -81 22 -93', sw: 1.3 },                                    // folded arms
      { ellipse: [0, -138, 12.5, 13.5], sw: 1.35 },                                       // head
      { d: 'M-12 -142 C-6 -151 6 -151 12 -142', sw: 1.3 },                                // hair
      { d: 'M-10 -132 C-10 -114 10 -114 10 -132', sw: 1.25 },                             // jaw
      { d: 'M-7 -140 L-3 -140 M4 -140 L8 -140', sw: 1.4 },                                // eyes
      { d: 'M-11 -149 L-5 -146', sw: 1.1 },                                               // brow
    ]),
  }),
});

/** The build ids, in the order the hash indexes them. */
export const BUILD_IDS = Object.freeze(Object.keys(BUILDS));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// TOPPERS — what is on the head. Placed off the build's own skull ellipse.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The topper ids, in hash order. `plain` = the build's own hair and nothing else. */
export const TOPPERS = Object.freeze(['plain', 'bun', 'cap', 'band']);

/** @param {{cx:number,cy:number,rx:number,ry:number}} h the build's head anchor */
function topperPaths(kind, h) {
  const crown = h.cy - h.ry;                       // the top of the skull (more negative = higher)
  switch (kind) {
    // Nour's bun + the one strand always loose (doc line 434), generalised off the skull.
    case 'bun': return [
      { ellipse: [f2(h.cx), f2(crown - 6.5), 6, 6], sw: 1.3 },
      { d: `M${f2(h.cx - h.rx)} ${f2(h.cy - 8)} C${f2(h.cx - h.rx - 6)} ${f2(h.cy - 1)} `
        + `${f2(h.cx - h.rx - 5)} ${f2(h.cy + 6)} ${f2(h.cx - h.rx + 1)} ${f2(h.cy + 9)}`, sw: 1.1 },
    ];
    // A soft cap: brim across the brow, crown over it.
    case 'cap': return [
      { d: `M${f2(h.cx - h.rx - 3)} ${f2(crown + 3)} L${f2(h.cx + h.rx + 3)} ${f2(crown + 3)}`, sw: 1.4 },
      { d: `M${f2(h.cx - h.rx)} ${f2(crown + 3)} C${f2(h.cx - h.rx + 2)} ${f2(crown - 7)} `
        + `${f2(h.cx + h.rx - 2)} ${f2(crown - 7)} ${f2(h.cx + h.rx)} ${f2(crown + 3)}`, sw: 1.3 },
    ];
    // A tied band, one end left hanging.
    case 'band': return [
      { d: `M${f2(h.cx - h.rx + 1)} ${f2(crown + 4)} L${f2(h.cx + h.rx - 1)} ${f2(crown + 4)}`, sw: 1.5 },
      { d: `M${f2(h.cx + h.rx - 1)} ${f2(crown + 4)} L${f2(h.cx + h.rx + 5)} ${f2(crown + 10)}`, sw: 1.1 },
    ];
    default: return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// MARKS — the personal detail on the body. The doc's own three, plus two neighbours.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Mark ids, in hash order. `keepsake` is the ONLY oxblood on a figure (charter §1). */
export const MARKS = Object.freeze(['none', 'collar', 'pocket', 'torn', 'apron', 'keepsake']);

/** @param {object} b a BUILDS row */
function markPaths(kind, b) {
  const sy = b.sy, hw = b.hw;
  const [ox, oy] = b.off;
  switch (kind) {
    // Rell's "collar always up" (doc line 419/422).
    case 'collar': return [{
      d: `M${f2(-hw * 0.625)} ${f2(sy - 5)} L${f2(-hw * 0.25)} ${f2(sy + 4)} `
        + `L${f2(hw * 0.25)} ${f2(sy + 4)} L${f2(hw * 0.625)} ${f2(sy - 5)}`, sw: 1.3,
    }];
    // Rell's "hand stays in the pocket" — the placket and the pocket it disappears into.
    case 'pocket': return [
      { d: `M0 ${f2(sy + 4)} L0 ${f2(sy + 16)}`, sw: 1 },
      { d: `M-3 ${f2(sy + 16)} L3 ${f2(sy + 16)} L3 ${f2(sy + 23)} L-3 ${f2(sy + 23)} Z`, sw: 1 },
    ];
    // Halvard's "torn shoulder, never mended" (doc line 449/452).
    case 'torn': return [{
      d: `M${f2(-hw)} ${f2(sy + 3)} L${f2(-hw + 7)} ${f2(sy + 7)} `
        + `L${f2(-hw)} ${f2(sy + 12)} L${f2(-hw + 7)} ${f2(sy + 16)}`, sw: 1.2,
    }];
    // Nour's "apron from a bunk sheet" — the hem across the body and the tie at the waist.
    case 'apron': {
      const ay = f2((sy + b.hem) / 2);
      return [
        { d: `M${f2(-hw - 2)} ${ay} C${f2(-hw * 0.55)} ${f2(ay + 5)} `
          + `${f2(hw * 0.55)} ${f2(ay + 5)} ${f2(hw + 2)} ${ay}`, sw: 1.2 },
        { d: `M-4 ${f2(ay + 1)} C-8 ${f2(ay - 4)} -2 ${f2(ay - 6)} 0 ${ay} `
          + `C2 ${f2(ay - 6)} 8 ${f2(ay - 4)} 4 ${f2(ay + 1)}`, sw: 1.1 },
      ];
    }
    // "Osei's mug" (doc line 419/422) — the doc's own oxblood rect + ink handle, mirrored onto the
    // OFF hand so the role's prop keeps the working hand. THE ONE ACCENT ON A PERSON.
    // The mug's right edge sits at −(wide+2), CLEAR of the widest point of the body, with a grip stub
    // back to the arm's end: the arm anchors are inside the silhouette, so anchoring the mug on one
    // directly draws it straddling the coat line (measured — that is what the first render did).
    case 'keepsake': {
      const gx = -(b.wide + 2);
      return [
        ...(ox < gx ? [] : [{ d: `M${f2(ox)} ${f2(oy)} L${f2(gx)} ${f2(oy)}`, sw: 1.2 }]),
        { rect: [f2(gx - 12), f2(oy - 6), 12, 13, 2], sw: 1.4, stroke: ATTEND },
        { d: `M${f2(gx - 12)} ${f2(oy - 2)} C${f2(gx - 18)} ${f2(oy - 1)} `
          + `${f2(gx - 18)} ${f2(oy + 4)} ${f2(gx - 12)} ${f2(oy + 5)}`, sw: 1.2 },
      ];
    }
    default: return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PROPS — the tool of the trade, carried in the working hand. Chosen by ROLE, never by cid.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// This is where "which pawn can do what" (the binding 2026-07-28 direction) becomes visible without
// a single hue: a grower carries the ladle she never puts down, a medic carries a slate. An unknown
// role carries nothing — never a throw, never a guess.

/** Prop ids. `none` is the fallback for an unknown / absent role. */
export const PROPS = Object.freeze(['none', 'valve', 'ladle', 'rod', 'spanner', 'slate', 'dividers', 'crate', 'handset']);

/**
 * ROLE_HUE id → prop id. The keys are the eight ids `theme/warm-tokens.js` declares; the mapping is
 * pinned key-for-key by `pawn-svg.test.js` so a new role cannot land propless by accident.
 */
export const ROLE_PROP = Object.freeze({
  'life-support':   'valve',
  'hydroponics':    'ladle',     // Nour's "ladle she never puts down" (doc line 437)
  'reactor':        'rod',
  'damage-control': 'spanner',
  'medic':          'slate',
  'helm':           'dividers',
  'stores':         'crate',
  'comms':          'handset',
});

/**
 * Resolve a role phrase to its prop id. Reuses `roleHue()` — the ONE role matcher in the tree — and
 * maps its frozen row back to its id by identity. Doing it this way rather than copying
 * `ROLE_MATCHERS` means the pawn's role vocabulary CANNOT drift from the theme's; an unknown role
 * lands on ROLE_FALLBACK, which is not a member of ROLE_HUE, so the loop finds nothing and returns
 * 'none'. Never throws.
 */
export function roleProp(role) {
  const row = roleHue(role);
  for (const id of Object.keys(ROLE_HUE)) {
    if (ROLE_HUE[id] === row) return ROLE_PROP[id] || 'none';
  }
  return 'none';
}

/**
 * The prop, held clear of the body. `b.hand` is where the doc's arm path ENDS, which on all three
 * builds is tucked against the coat; a prop drawn from there straddles the body outline and reads as
 * scribble at board scale. So the prop starts at `wide + 3` and a GRIP STUB joins it back to the
 * hand — the same fix the keepsake mug takes, for the same measured reason.
 * @param {string} kind @param {object} b a BUILDS row
 */
function propPaths(kind, b) {
  if (kind === 'none' || !PROPS.includes(kind)) return [];
  const [hx, hy] = b.hand;
  const x = b.wide + 3, y = hy;
  const grip = hx < x ? [{ d: `M${f2(hx)} ${f2(hy)} L${f2(x)} ${f2(y)}`, sw: 1.2 }] : [];
  return grip.concat(propShape(kind, x, y));
}

/** The prop itself, drawn from its grip point `(x, y)` outward to the right. */
function propShape(kind, x, y) {
  switch (kind) {
    // Nour's ladle, verbatim geometry (stem + bowl), re-anchored onto any build's hand.
    case 'ladle': return [
      { d: `M${f2(x)} ${f2(y)} L${f2(x + 13)} ${f2(y - 17)}`, sw: 1.3 },
      { ellipse: [f2(x + 16), f2(y - 21), 5.5, 4.5], sw: 1.3 },
    ];
    case 'valve': return [
      { ellipse: [f2(x + 7), f2(y - 6), 7, 7], sw: 1.3 },
      { d: `M${f2(x)} ${f2(y - 6)} L${f2(x + 14)} ${f2(y - 6)} `
        + `M${f2(x + 7)} ${f2(y - 13)} L${f2(x + 7)} ${f2(y + 1)}`, sw: 1.1 },
    ];
    case 'rod': return [
      { d: `M${f2(x - 2)} ${f2(y + 6)} L${f2(x + 10)} ${f2(y - 20)}`, sw: 1.5 },
      { d: `M${f2(x + 7)} ${f2(y - 14)} L${f2(x + 13)} ${f2(y - 17)}`, sw: 1.1 },
    ];
    case 'spanner': return [
      { d: `M${f2(x)} ${f2(y)} L${f2(x + 12)} ${f2(y - 12)}`, sw: 1.4 },
      { d: `M${f2(x + 12)} ${f2(y - 12)} L${f2(x + 16)} ${f2(y - 11)} `
        + `M${f2(x + 12)} ${f2(y - 12)} L${f2(x + 11)} ${f2(y - 16)}`, sw: 1.2 },
    ];
    case 'slate': return [
      { rect: [f2(x + 1), f2(y - 12), 11, 14, 1.5], sw: 1.3 },
      { d: `M${f2(x + 3)} ${f2(y - 8)} L${f2(x + 10)} ${f2(y - 8)} `
        + `M${f2(x + 3)} ${f2(y - 4)} L${f2(x + 8)} ${f2(y - 4)}`, sw: 0.9 },
    ];
    case 'dividers': return [
      { d: `M${f2(x)} ${f2(y)} L${f2(x + 6)} ${f2(y - 16)} L${f2(x + 12)} ${f2(y)}`, sw: 1.3 },
      { d: `M${f2(x + 3)} ${f2(y - 8)} L${f2(x + 9)} ${f2(y - 8)}`, sw: 1 },
    ];
    case 'crate': return [
      { rect: [f2(x), f2(y - 11), 14, 12, 1], sw: 1.4 },
      { d: `M${f2(x)} ${f2(y - 5)} L${f2(x + 14)} ${f2(y - 5)}`, sw: 1.1 },
    ];
    case 'handset': return [
      { rect: [f2(x + 2), f2(y - 13), 7, 13, 2], sw: 1.3 },
      { d: `M${f2(x + 5.5)} ${f2(y - 13)} L${f2(x + 7)} ${f2(y - 24)}`, sw: 1.1 },
    ];
    default: return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// STATURE — the doc's "height … carries them at this size", as a third silhouette axis
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Multiplies the GROUP SCALE, so a short soul is short in the room and short in the chip. Every
// value is ≤ 1 on purpose: the tallest build already fills its 16×24 box, and a stature above 1
// would push a head out through the top of the frame the Room Zoom hangs its WORK tag on.
export const STATURES = Object.freeze([1, 0.95, 0.9]);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// resolvePawnLook — the one place a crew descriptor becomes a figure
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a crew descriptor to its final ink figure.
 *   • `build` / `topper` / `mark` / `stature` come from independent rotations of `hash32(cid)` —
 *     WHO the person is; stable across every frame, distinct across the crew.
 *   • `prop` comes from the ROLE — WHAT they carry. Unknown role ⇒ 'none', never a throw.
 *   • `ink` / `halo` / `accent` are the charter's three values and are not per-person: colour stopped
 *     distinguishing people at ruling E3.
 * Any explicit field on `desc` (build/topper/mark/prop/stature/ink/accent) overrides the resolved one.
 * @param {{role?:string, cid?:string|number, build?:string, topper?:string, mark?:string,
 *          prop?:string, stature?:number, ink?:string, accent?:string}} [desc]
 * @returns {{ink:string, halo:string, accent:string, build:string, topper:string, mark:string,
 *            prop:string, stature:number}}
 */
export function resolvePawnLook(desc) {
  const d = desc || {};
  const h = hash32(cidKey(d));
  const pick = (list, shift) => list[(h >>> shift) % list.length];
  return {
    ink:     typeof d.ink === 'string' && d.ink ? d.ink : INK,
    halo:    PAPER,
    accent:  typeof d.accent === 'string' && d.accent ? d.accent : ATTEND,
    // The four shifts are not decoration: FNV-1a's low bits are the least mixed, and `build` — the
    // axis that carries the silhouette at board scale — was measured over the eight mock crew and
    // over 400 synthetic cids to pick the rotation with the flattest spread (shift 5 → 3/3/2 across
    // the mock crew; shift 3 puts SIX of the eight on one build and leaves another empty).
    build:   BUILDS[d.build] ? d.build : pick(BUILD_IDS, 5),
    topper:  TOPPERS.includes(d.topper) ? d.topper : pick(TOPPERS, 0),
    mark:    MARKS.includes(d.mark) ? d.mark : pick(MARKS, 11),
    prop:    PROPS.includes(d.prop) ? d.prop : roleProp(d.role),
    stature: typeof d.stature === 'number' && Number.isFinite(d.stature) && d.stature > 0
      ? d.stature : pick(STATURES, 17),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// figurePaths — ONE path list, in FIGURE UNITS. Both forms and every future scale read this.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The complete path list for a soul, in figure units (feet at y = 0, x centred on 0).
 * Draw order is the doc's: body first, then the personal mark, then the topper, then the prop —
 * so a mug or a ladle sits OVER the sleeve it is held in, and a bun sits over the hair.
 * `weight` multiplies every stroke width; pass it and the matching `widen` to `ghost()`.
 * @param {object} [desc] a crew descriptor (see `resolvePawnLook`)
 * @param {number} [weight] stroke multiplier (1 = the doc's own pen)
 * @returns {Array<object>} `ghost()`-shaped elements
 */
export function figurePaths(desc, weight = 1) {
  const k = resolvePawnLook(desc);
  const b = BUILDS[k.build];
  const w = Number.isFinite(weight) && weight > 0 ? weight : 1;
  const all = [
    ...b.paths,
    ...markPaths(k.mark, b),
    ...topperPaths(k.topper, b.head),
    ...propPaths(k.prop, b),
  ];
  // The stroke pen is applied ONCE, here, so no caller can emit a figure at one weight and its
  // knockout at another — which is precisely the two-lists-drifting failure `ghost()` exists to stop.
  return all.map((p) => ({ ...p, sw: f2(p.sw * w), stroke: p.stroke || k.ink }));
}

/**
 * A soul as a two-pass ink figure in FIGURE UNITS, ready to be `translate`d and `scale`d by a form.
 * This is the seam a portrait panel (M4's Persona window) draws through at `scale(1.55)`, exactly as
 * the design document does — the same list, a different scale, nothing re-authored.
 * @param {object} [desc]
 * @param {{weight?:number, halo?:boolean}} [opts] weight (1) · halo (true — the knockout pass)
 */
export function inkFigure(desc, opts = {}) {
  const o = opts || {};
  const w = Number.isFinite(o.weight) && o.weight > 0 ? o.weight : 1;
  // `widen` scales WITH the pen, so the doc's halo:ink ratio survives every weight we draw at.
  // `halo:false` is the doc's crew-dock treatment (line 261): bare ink on bare paper, one pass.
  return ghost(figurePaths(desc, w), { widen: GHOST.widen * w, halo: o.halo !== false });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SVG helpers
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The id namespace for a fragment's defs — explicit `idPrefix`, else a hash of the soul. */
function idBase(desc, opts) {
  if (opts && opts.idPrefix) return String(opts.idPrefix);
  return 'pw' + hash32(cidKey(desc)).toString(36);
}

/** An optional ` class="…"` attribute from opts.className. */
function classAttr(opts) {
  return opts && opts.className ? ` class="${esc(opts.className)}"` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// pawnSprite — the in-world pawn (16×24 viewBox, FEET AT 8,23)
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ THE FEET ANCHOR IS A CONTRACT, NOT A DETAIL. `overview-scene.js:635` and `roomzoom-view.js:907`
// both seat the pawn with `translate(fx − 8·S, fy − 23·S) scale(S)`; move (8,23) and every pawn on
// both standard surfaces floats or sinks. The figure group below is what carries it.

/** Base group scale for the sprite: 152 figure units of body + ~5.6 of knockout into 22.8 box units. */
const SPRITE_K = 0.1447;
/** The sprite's pen. The doc's board figure is 91 px tall; ours is 37–64 px (see the header). */
const SPRITE_WEIGHT = 1.9;

/**
 * Build the in-world pawn as an SVG `<g>` fragment for an `<svg viewBox="0 0 16 24">`.
 * Two passes (paper knockout, then ink) plus the design's GROUND LINE — the faint ink rule the doc
 * draws under every portrait (`M110 284 L206 284`, `stroke-width 0.7 opacity 0.35`, line 420). That
 * rule is what replaced the warm skin's black shadow ellipse: a figure on paper does not cast a
 * shadow, it stands on a line.
 * @param {object} [desc]  { role, cid?, build?, topper?, mark?, prop?, stature? }
 * @param {{className?:string, idPrefix?:string}} [opts]
 * @returns {string} an SVG `<g>…</g>` fragment
 */
export function pawnSprite(desc, opts = {}) {
  const k = resolvePawnLook(desc);
  const s = f4(SPRITE_K * k.stature);
  return `<g${classAttr(opts)} data-form="pawn">`
    + `<g transform="translate(8 23) scale(${s})">`
    +   inkFigure(desc, { weight: SPRITE_WEIGHT })
    + `</g>`
    // the ground line — drawn last, below the feet, exactly as the doc draws it
    + `<path d="M3.4 23.5 L12.6 23.5" fill="none" stroke="${k.ink}" stroke-width="0.45"`
    + ` stroke-linecap="round" opacity="0.35"/>`
    + `</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// pawnChip — the roster bust in its INK WELL (16×20 viewBox)
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The doc's crew dock (line 261) is a 58×76 sheet: an ink ellipse `cx29 cy38 rx27 ry36` at 1.4, two
// faint pencil ticks in the upper left, and the WHOLE FIGURE (not a bust) at `translate(29,70)
// scale(0.42)`. Ported at 20/76 = 0.2632 so the proportions are the doc's to the digit.
//
// The chip declares ONE id — a `<clipPath>` for the well. It has a real job: our box is narrower
// than the doc's, and a ladle or a crate on a wide build would otherwise poke out through the side
// of the well. It is also what keeps the id-collision contract alive on this form.

/** 20 / 76 — the doc's 58×76 dock sheet mapped onto our 16×20 box. */
const CHIP_M = 0.2632;
const CHIP_K = 0.42 * CHIP_M;   //  the doc's own figure scale, carried through the same map
const CHIP_WEIGHT = 1.8;        //  the doc's sheet is 76 px tall; ours renders at 28–40 px

/**
 * Build the roster chip as a self-contained SVG `<g>` fragment (its own `<defs>` for the well clip),
 * meant to sit inside an `<svg viewBox="0 0 16 20">`. SINGLE-PASS ink — see the file header.
 * @param {object} [desc]
 * @param {{className?:string, idPrefix?:string}} [opts]
 * @returns {string} an SVG `<g>…</g>` fragment
 */
export function pawnChip(desc, opts = {}) {
  const k = resolvePawnLook(desc);
  const id = idBase(desc, opts);
  const well = `${id}-well`;
  const cx = 8, cy = f2(38 * CHIP_M), rx = f2(27 * CHIP_M), ry = f2(36 * CHIP_M);
  const feet = f2(70 * CHIP_M);
  const s = f4(CHIP_K * k.stature);
  return `<g${classAttr(opts)} data-form="chip">`
    + `<defs><clipPath id="${esc(well)}">`
    +   `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`
    + `</clipPath></defs>`
    // the paper the well is cut into — self-contained, so the chip reads the same in any surround
    + `<rect x="0" y="0" width="16" height="20" fill="${k.halo}"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${k.ink}" stroke-width="0.55"/>`
    // the doc's two pencil ticks in the upper left (`M4 18 L15 22 M4 26 L12 29`, 0.6 @ .4)
    + `<path d="M1.05 4.74 L3.95 5.79 M1.05 6.84 L3.16 7.63" fill="none" stroke="${k.ink}"`
    + ` stroke-width="0.22" stroke-linecap="round" opacity="0.4"/>`
    // ⚠️ THE CLIP AND THE TRANSFORM MUST BE ON TWO DIFFERENT ELEMENTS. `clip-path` resolves in the
    // user space of the element that references it — i.e. AFTER that element's own `transform` — so
    // a clip and a `scale(0.11)` on the SAME `<g>` shrinks the well to a tenth of its size and clips
    // the entire figure away. Measured, not reasoned: the first render drew eight empty ellipses.
    + `<g clip-path="url(#${esc(well)})"><g transform="translate(${cx} ${feet}) scale(${s})">`
    +   inkFigure(desc, { weight: CHIP_WEIGHT, halo: false })
    + `</g></g>`
    + `</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The eight mock crew. Roles are free `RoleNow` phrases so the role matcher is exercised
// end-to-end; the figure comes from the role's PROP and the cid's build, never from a hue.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** @type {ReadonlyArray<{cid:string, surname:string, role:string, roleLabel:string, status:string}>} */
export const MOCK_CREW = Object.freeze([
  { cid: 'okonkwo',  surname: 'OKONKWO',  role: 'life-support lead',    roleLabel: 'LIFE-SUPPORT LEAD',  status: 'On deck 0'      },
  { cid: 'raghavan', surname: 'RAGHAVAN', role: 'hydroponics',          roleLabel: 'HYDROPONICS',        status: 'Tending bay 2'  },
  { cid: 'volkov',   surname: 'VOLKOV',   role: 'reactor watch',        roleLabel: 'REACTOR WATCH',      status: 'Coolant loop B' },
  { cid: 'camara',   surname: 'CAMARA',   role: 'damage control',       roleLabel: 'DAMAGE CONTROL',     status: 'At recycler'    },
  { cid: 'hassan',   surname: 'HASSAN',   role: "ship's medic",         roleLabel: "SHIP'S MEDIC",       status: 'Med bay'        },
  { cid: 'ferreira', surname: 'FERREIRA', role: 'helm watch',           roleLabel: 'HELM WATCH',         status: 'Machine shop'   },
  { cid: 'oyelaran', surname: 'OYELARAN', role: 'stores & logistics',   roleLabel: 'STORES & LOGISTICS', status: 'At fabricator'  },
  { cid: 'chen',     surname: 'CHEN',     role: 'comms & sensors',      roleLabel: 'COMMS & SENSORS',    status: 'Idle'           },
]);
