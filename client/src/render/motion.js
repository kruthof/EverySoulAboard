// Motion + animation runtime — PURE. Two concerns, both data-in/data-out (no DOM, no clock read,
// no mutation), so the executors can animate deterministically and the logic is unit-testable:
//
//   1. Per-cid position tracking across frames. The crew tuple is [x, y, pv, cid] (cid at index 3).
//      trackMotion(prev, frame) diffs the new frame's crew against the previous positions to mark
//      each crew member walking (a single-tile step), with a facing and the tile they stepped FROM
//      (for sub-tile interpolation). A move is only a WALK when it is a contiguous one-tile step of
//      a cid we already saw on the SAME deck: a teleport (>1 tile), a deck change, a fog reveal (a
//      cid appearing where none was tracked) and a despawn all RESET rather than animate.
//
//   2. Sprite-variant selection (absence-tolerant). Walking pawns cycle SPRITE_FRAMES; devices pick
//      SPRITE_STATES broken/off variants from their semantic colour / dim. The art maps may lack any
//      given role, so every selector falls back to the base sprite key when the variant is absent.
//
// Compose stays time-free: `timeSec` enters ONLY here (as an input), so a fixed timeSec makes the
// whole animation deterministic for golden/screenshot parity.

import { C } from './palette.js';

/** @typedef {{x:number,y:number,walking:boolean,facing:(string|null),fromX:number,fromY:number,dx:number,dy:number,sinceStep:number}} MotionEntry */
/** @typedef {{deck:(number|null), byCid:Object<string,MotionEntry>}} MotionState */

/** Walk-cycle frame rate (frames per second) — how fast SPRITE_FRAMES advance while walking. */
export const WALK_FPS = 6;

/**
 * Sprite hysteresis: keep showing the WALK sprite for this many step-less frames after a real
 * step. A pathing citizen often steps only every 2nd–3rd wire frame (tick cadence vs render
 * cadence), and without a hold the pawn flip-flops walking↔standing several times a second.
 * The hold covers those gaps; a genuinely stopped pawn settles to standing after the hold.
 * Sub-tile SLIDING (walkOffset) is untouched — only the sprite choice is held.
 */
export const WALK_HOLD_FRAMES = 2;

/**
 * Whether a pawn should be DRAWN with its walk-cycle sprite: it stepped this frame, or within
 * the last WALK_HOLD_FRAMES frames (see above). Pure; null-tolerant (no entry → standing).
 * @param {MotionEntry|null|undefined} entry
 * @returns {boolean}
 */
export function isAnimWalking(entry) {
  if (!entry) return false;
  return entry.walking || entry.sinceStep <= WALK_HOLD_FRAMES;
}

const FACING = ['N', 'E', 'S', 'W'];
/** Facing letter for a unit step (dx,dy). Null for a non-step. */
function facingOf(dx, dy) {
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 0 && dy === -1) return 'N';
  return null;
}

/** A fresh, empty motion tracker. */
export function initMotion() {
  return { deck: null, byCid: {} };
}

/**
 * Diff a new frame's crew against the previous tracker, returning a NEW tracker (never mutates
 * inputs). A crew member is `walking` only when it stepped exactly one tile from a position we
 * tracked on the same deck; every discontinuity (teleport / deck change / fog reveal / despawn)
 * resets to a standing entry at the current tile.
 * @param {MotionState} prev
 * @param {{deck?:number, crew?:number[][]}} frame
 * @returns {MotionState}
 */
export function trackMotion(prev, frame) {
  if (!prev) prev = initMotion();
  const deck = frame && frame.deck != null ? frame.deck : null;
  // A deck change invalidates every prior position (you can't walk between decks in one step).
  const deckChanged = prev.deck != null && deck != null && prev.deck !== deck;
  const byCid = {};
  const crew = (frame && frame.crew) || [];
  for (const c of crew) {
    if (!Array.isArray(c) || c.length <= 3) continue; // no cid → untrackable
    const x = c[0], y = c[1], cid = c[3];
    const p = deckChanged ? null : prev.byCid[cid];
    // sinceStep: frames since the last REAL step — 0 on a step, counting up while standing,
    // effectively-infinite on a spawn/teleport/deck change (never "recently walked"). Capped
    // so long-idle counters can't overflow into surprising values.
    let walking = false, facing = null, fromX = x, fromY = y, dx = 0, dy = 0, sinceStep = 1000;
    if (p) {
      const sx = x - p.x, sy = y - p.y;
      if (Math.abs(sx) + Math.abs(sy) === 1) {
        // a contiguous one-tile step → a real walk; remember where it stepped from.
        walking = true; facing = facingOf(sx, sy); fromX = p.x; fromY = p.y; dx = sx; dy = sy;
        sinceStep = 0;
      } else if (sx === 0 && sy === 0) {
        // standing on the tracked tile: the step recency ages by one frame (held facing kept).
        sinceStep = Math.min(1000, (p.sinceStep == null ? 1000 : p.sinceStep) + 1);
        facing = p.facing;
      }
      // >1 tiles → teleport → reset (default, no walk, stale recency)
    }
    // p == null → fresh spawn / fog reveal / post-deck-change: NOT a walk.
    byCid[cid] = { x, y, walking, facing, fromX, fromY, dx, dy, sinceStep };
  }
  return { deck, byCid };
}

/** Index the tracker by current tile ("x,y") so an executor can look up a crew entity's motion. */
export function motionByTile(state) {
  const m = {};
  if (state && state.byCid) for (const cid in state.byCid) {
    const e = state.byCid[cid];
    m[e.x + ',' + e.y] = e;
  }
  return m;
}

// ---- walk cycle + interpolation (pure functions of their inputs) ----

/**
 * Which SPRITE_FRAMES index a walking pawn shows at `timeSec`. Deterministic data — floor of the
 * time-driven cycle, wrapped to the frame count. A single-frame (or absent) set collapses to 0.
 * @param {number} timeSec @param {number} nFrames @param {number} [fps]
 */
export function walkFrameIndex(timeSec, nFrames, fps = WALK_FPS) {
  if (!nFrames || nFrames <= 1) return 0;
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  return ((Math.floor(t * fps) % nFrames) + nFrames) % nFrames;
}

/**
 * The sub-tile offset (in TILE units) for a walking entry at interpolation `progress` in [0,1]:
 * 0 = still at the tile it stepped from, 1 = arrived at the current tile. Compose draws the pawn at
 * its CURRENT tile, so the offset is the (negative) remaining travel: (from - cur) * (1 - progress).
 * A non-walking entry never offsets. Pure — the executor supplies progress (derived from timeSec).
 * @param {MotionEntry} entry @param {number} progress
 * @returns {{ox:number, oy:number}}
 */
export function walkOffset(entry, progress) {
  if (!entry || !entry.walking) return { ox: 0, oy: 0 };
  const p = clamp01(progress);
  const ox = (entry.fromX - entry.x) * (1 - p), oy = (entry.fromY - entry.y) * (1 - p);
  return { ox: ox === 0 ? 0 : ox, oy: oy === 0 ? 0 : oy }; // normalize -0 → 0

}

function clamp01(v) { return v == null || v < 0 ? 0 : v > 1 ? 1 : v; }

// ---- sprite-variant selection (absence-tolerant) ----

const STATE_BROKEN = '#broken';
const STATE_OFF = '#off';
const FRAME_TAG = '#w';

/**
 * The sprite key for a device role given its semantic colour + dim, honouring SPRITE_STATES when a
 * variant exists, else the base role key. Broken wins over off (a broken device reads broken even
 * when it is also unpowered). Canvas2D passes the raw op fg; the GL quad passes its folded tint
 * (which collapses any dim to DeviceDim) — so a broken+unpowered device reads `off` on the GL path,
 * a documented approximation, and `broken` on the canvas path.
 * @param {string} role @param {number} fg  GlyphColor id (or the folded tint)
 * @param {boolean} dim
 * @param {Object<string,{off?:*,broken?:*}>} states  SPRITE_STATES (or a presence map)
 * @returns {string} the sprite key to sample
 */
export function deviceSpriteKey(role, fg, dim, states) {
  if (!role || !states || !states[role]) return role;
  if (fg === C.Broken && states[role].broken) return role + STATE_BROKEN;
  if ((dim || fg === C.DeviceDim) && states[role].off) return role + STATE_OFF;
  return role;
}

/**
 * The sprite key for a pawn: a walk frame from SPRITE_FRAMES while walking (chosen by timeSec), the
 * base pawn role otherwise or when no frame set exists for that role (absence-tolerant).
 * @param {string} pawnRole @param {boolean} walking @param {number} timeSec
 * @param {Object<string,any[]>} frames  SPRITE_FRAMES
 * @returns {string}
 */
export function pawnSpriteKey(pawnRole, walking, timeSec, frames) {
  const set = frames && frames[pawnRole];
  if (walking && Array.isArray(set) && set.length > 1) {
    return pawnRole + FRAME_TAG + walkFrameIndex(timeSec, set.length);
  }
  return pawnRole;
}

/** All frame-variant keys for a pawn role (so the atlas can bake every walk frame up front, keeping
 *  the atlas signature stable as timeSec advances). Empty when the role has no multi-frame set. */
export function pawnFrameKeys(pawnRole, frames) {
  const set = frames && frames[pawnRole];
  if (!Array.isArray(set) || set.length <= 1) return [];
  const out = [];
  for (let i = 0; i < set.length; i++) out.push(pawnRole + FRAME_TAG + i);
  return out;
}

/** Strip any C7 variant suffix ('#…') from a sprite key → its base role (for image fallback when
 *  the variant art is absent or hasn't decoded yet). Keys without a suffix pass through unchanged. */
export function baseSpriteKey(key) {
  const i = key.indexOf('#');
  return i < 0 ? key : key.slice(0, i);
}

/** The two variant suffixes + tag, exported so the sprite runtime registers matching keys. */
export const VARIANT = { BROKEN: STATE_BROKEN, OFF: STATE_OFF, FRAME: FRAME_TAG };
export { FACING };
