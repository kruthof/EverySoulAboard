// The parametric SVG PAWN generator — the new warm, chunky, FRONT-FACING crew sprite.
//
// One pure builder serves BOTH forms of a crew member:
//   • pawnSprite(desc, opts) — the in-world pawn on the plank floor (16×24 viewBox),
//   • pawnChip(desc, opts)   — the roster PORTRAIT CHIP bust in a rounded well (16×20 viewBox).
//
// Authority (rect-by-rect, coord-for-coord): docs/design/perilune-crew-sprites.dc.html, and
// docs/design/perilune-art-direction-warm.md §7 (WA-16..WA-20 anatomy / no-rotation / dual-form)
// and §8 (WA-21 per-role hue table). Every geometry constant below is quoted VERBATIM from the
// mock — this file is the design contract, not an approximation.
//
// Pure ES module: no DOM, no clock, no side effects. Every export is a pure function of its
// argument. Role hue is a parameter (resolved via warm-tokens' ROLE_HUE / roleHue); hair, skin
// and the uniform are chosen DETERMINISTICALLY per soul (hash of `cid`) so a soul's look is
// stable across every frame and the eight crew read distinct without any extra art.
//
// This does NOT touch the parked WebGL renderer, the palette, or any golden — it is a fresh,
// standalone SVG builder consumed by the two later SVG views + the roster chip.

import { roleHue } from '../theme/warm-tokens.js';

/* eslint-disable no-multi-spaces */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Warm per-soul palettes (§7 WA-17). Skin tones are the eight lifted verbatim from the bible;
// hair is a warm-dark ramp (browns down to near-black) plus one silver for older crew (Volkov in
// the mock). A soul's index into each is a stable hash of its `cid` — deterministic + distinct.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Warm skin tones (bible §7 WA-17, verbatim — eight so eight souls read distinct). */
export const SKIN_TONES = Object.freeze([
  '#8a5a38', '#a06e42', '#d8b48c', '#6b4327',
  '#9a6440', '#c99a6a', '#7a4a28', '#caa074',
]);

/** Warm hair tones — the mock's crew hairs (dark warm browns) + one silver for older souls. */
export const HAIR_TONES = Object.freeze([
  '#241812', '#1c140e', '#0f0b08', '#1a120c',
  '#2a1c12', '#161008', '#3a2a1a', '#c9b89a',
]);

// Non-role fill constants, lifted verbatim from the mock (eyes / boots / soles / shadow / rim).
const EYE       = '#2a201a';
const BOOT      = '#2b2018';
const SOLE      = '#16100b';
const SHADOW    = 'rgba(0,0,0,.35)';           // ground-shadow ellipse
const ARM_SHADE = 'rgba(0,0,0,.16)';           // the right-side (shadowed) edge
const RIM       = 'rgba(242,181,99,.4)';       // the amber rim-light down the LEFT side (WA-17)

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Deterministic hashing — a soul's stable key → an unsigned 32-bit hash (FNV-1a).
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
// resolvePawnLook — the one place a crew descriptor becomes final colours.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a crew descriptor to its final { uniform, accent, hair, skin }.
 *   • uniform + accent come from the role's hue (warm-tokens `roleHue`, §8) — an unknown role
 *     lands on the neutral warm-grey ROLE_FALLBACK, never a throw.
 *   • hair + skin are chosen deterministically by hashing `cid` (independent rotations of the
 *     hash so the two vary somewhat independently), so a soul is stable across frames and the
 *     crew read distinct.
 * Any explicit field on `desc` (uniform/accent/hair/skin) overrides the resolved value.
 * @param {{role?:string, cid?:string|number, uniform?:string, accent?:string, hair?:string, skin?:string}} [desc]
 * @returns {{uniform:string, accent:string, hair:string, skin:string}}
 */
export function resolvePawnLook(desc) {
  const d = desc || {};
  const hue = roleHue(d.role);
  const h = hash32(cidKey(d));
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const hair = HAIR_TONES[(h >>> 3) % HAIR_TONES.length];
  return {
    uniform: d.uniform || hue.uniform,
    accent:  d.accent  || hue.accent,
    hair:    d.hair    || hair,
    skin:    d.skin    || skin,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SVG string helpers
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** One `<rect>` — omits `rx` when zero (a hard pixel). All coords are viewBox units. */
function rect(x, y, w, h, rx, fill) {
  const r = rx ? ` rx="${rx}"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${r} fill="${fill}"/>`;
}

/** The id namespace for a fragment's gradients — explicit `idPrefix`, else a hash of the soul. */
function idBase(desc, opts) {
  if (opts && opts.idPrefix) return String(opts.idPrefix);
  return 'pw' + hash32(cidKey(desc)).toString(36);
}

/** An optional ` class="…"` attribute from opts.className. */
function classAttr(opts) {
  return opts && opts.className ? ` class="${opts.className}"` : '';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// pawnSprite — the in-world pawn (16×24 viewBox). Front-facing, NO rotation (WA-18).
//   Ground shadow → hair → face → side hair → eyes → collar accent → torso → two arms →
//   shadowed edge → hands → boots → soles → amber rim-light. Order is the mock's paint order.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the in-world pawn as an SVG `<g>` fragment, meant to sit inside an
 * `<svg viewBox="0 0 16 24">`. Includes the ground-shadow ellipse and the amber rim-light —
 * both non-negotiable (§7 WA-17). Never rotated; directional motion is slide + bob, not turning.
 * @param {object} [desc]  { role, cid?, uniform?, accent?, hair?, skin? }
 * @param {{className?:string, idPrefix?:string}} [opts]
 * @returns {string} an SVG `<g>…</g>` fragment
 */
export function pawnSprite(desc, opts = {}) {
  const k = resolvePawnLook(desc);
  return `<g${classAttr(opts)} data-form="pawn">`
    + `<ellipse cx="8" cy="23" rx="6" ry="1.3" fill="${SHADOW}"/>`   // ground shadow
    + rect(4,   2,    8,   3.4, 1.6, k.hair)                          // hair cap
    + rect(4.7, 3.8,  6.6, 6.4, 2.2, k.skin)                         // face
    + rect(4,   4,    1,   6,   0,   k.hair)                         // left hair edge
    + rect(11,  4,    1,   6,   0,   k.hair)                         // right hair edge
    + rect(6,   7,    1,   1,   0,   EYE)                            // left eye
    + rect(9,   7,    1,   1,   0,   EYE)                            // right eye
    + rect(4,   10,   8,   1,   0,   k.accent)                       // collar accent
    + rect(3.8, 10.6, 8.4, 6.6, 1.8, k.uniform)                     // torso
    + rect(2,   11.2, 2.4, 5,   1.1, k.uniform)                     // left arm
    + rect(11.6,11.2, 2.4, 5,   1.1, k.uniform)                     // right arm
    + rect(11,  11,   1,   6,   0,   ARM_SHADE)                     // shadowed right edge
    + rect(2,   16,   2,   1,   0,   k.skin)                        // left hand
    + rect(12,  16,   2,   1,   0,   k.skin)                        // right hand
    + rect(5,   17,   2.9, 5,   1,   BOOT)                          // left boot
    + rect(8.1, 17,   2.9, 5,   1,   BOOT)                          // right boot
    + rect(5,   21,   3,   1,   0,   SOLE)                          // left sole
    + rect(8,   21,   3,   1,   0,   SOLE)                          // right sole
    + rect(4,   4,    1,   13,  0,   RIM)                           // amber rim-light (LEFT side)
    + `</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// pawnChip — the roster PORTRAIT CHIP bust (16×20 viewBox) in its rounded well (WA-20).
//   A radial-gradient well (#2a3a48→#141d26) + an amber underglow strip (rgba(242,181,99,.35))
//   at the base, then the same head/collar/uniform as the pawn but a squared bust torso.
//   Gradient ids are namespaced (idPrefix, else a per-soul hash) so many chips never collide.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the roster portrait-chip bust as a self-contained SVG `<g>` fragment (its own `<defs>`
 * for the well + underglow gradients), meant to sit inside an `<svg viewBox="0 0 16 20">`.
 * @param {object} [desc]  { role, cid?, uniform?, accent?, hair?, skin? }
 * @param {{className?:string, idPrefix?:string}} [opts]
 * @returns {string} an SVG `<g>…</g>` fragment
 */
export function pawnChip(desc, opts = {}) {
  const k = resolvePawnLook(desc);
  const id = idBase(desc, opts);
  const well = `${id}-well`;
  const glow = `${id}-glow`;
  return `<g${classAttr(opts)} data-form="chip">`
    + `<defs>`
    +   `<radialGradient id="${well}" cx="50%" cy="30%" r="75%">`
    +     `<stop offset="0" stop-color="#2a3a48"/><stop offset="1" stop-color="#141d26"/>`
    +   `</radialGradient>`
    +   `<radialGradient id="${glow}" cx="50%" cy="100%" r="65%">`
    +     `<stop offset="0" stop-color="#f2b563" stop-opacity=".35"/>`
    +     `<stop offset="0.7" stop-color="#f2b563" stop-opacity="0"/>`
    +   `</radialGradient>`
    + `</defs>`
    + rect(0, 0,  16, 20, 2.4, `url(#${well})`)                     // the rounded well
    + rect(0, 12, 16, 8,  0,   `url(#${glow})`)                     // amber underglow at base
    + rect(4,   2,   8,   3.4, 1.6, k.hair)                         // hair cap
    + rect(4.7, 3.8, 6.6, 6.4, 2.2, k.skin)                        // face
    + rect(4,   4,   1,   6,   0,   k.hair)                        // left hair edge
    + rect(11,  4,   1,   6,   0,   k.hair)                        // right hair edge
    + rect(6,   7,   1,   1,   0,   EYE)                           // left eye
    + rect(9,   7,   1,   1,   0,   EYE)                           // right eye
    + rect(4,   10,  8,   1,   0,   k.accent)                      // collar accent
    + rect(3,   11,  10,  9,   2,   k.uniform)                     // bust torso (squared)
    + rect(11,  11,  2,   9,   0,   ARM_SHADE)                     // shadowed right edge
    + rect(4,   4,   1,   16,  0,   RIM)                           // amber rim-light (LEFT side)
    + `</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The eight mock crew (crew-sprites.dc.html). Roles are given as free `RoleNow` phrases so the
// warm-tokens role matcher is exercised end-to-end; the hue comes from the role, not the mock's
// per-character placeholder values (bible §8/§12 resolution). Shared by the gallery + the tests.
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
