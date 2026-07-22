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
// Compose stays time-free: `timeSec` (walk-cycle phase) and `nowMs` (slide anchoring) both enter
// ONLY as inputs — never read from a clock in here — so fixing them makes the whole animation
// deterministic for golden/screenshot parity while the live path passes the wall clock in.

import { C } from './palette.js';

/** @typedef {{x:number,y:number,walking:boolean,facing:(string|null),flipX:boolean,fromX:number,fromY:number,dx:number,dy:number,sinceStep:number,stepMs:(number|null),interval:number,originX:number,originY:number}} MotionEntry */
/** @typedef {{deck:(number|null), byCid:Object<string,MotionEntry>}} MotionState */

/** Walk-cycle frame rate (frames per second) — how fast SPRITE_FRAMES advance while walking. */
export const WALK_FPS = 6;

/**
 * Sprite hysteresis: keep showing the WALK sprite for this many step-less frames after a real
 * step. A pathing citizen often steps only every 2nd–3rd wire frame (tick cadence vs render
 * cadence), and without a hold the pawn flip-flops walking↔standing several times a second.
 * The hold covers those gaps; a genuinely stopped pawn settles to standing after the hold.
 * Sub-tile SLIDING (slideOffset) is a separate, time-driven concern — only the sprite choice is held.
 */
export const WALK_HOLD_FRAMES = 2;

/**
 * Continuous-slide tuning (ms). A pawn glides one tile over an interval ESTIMATED from the time
 * between its last two real steps, so the slide auto-adapts to sim speed (1×/5×/…) and wire jitter
 * instead of the old fixed frame-anchored 130 ms (which read as running, then parked ~370 ms between
 * step frames — the square-to-square stutter). DEFAULT applies before two steps exist (2 tiles/s at
 * 1× ⇒ one step per 500 ms); MIN/MAX clamp the estimate; STEP_SMOOTH is the EMA weight so a single
 * late frame nudges rather than lurches the pace.
 */
export const DEFAULT_STEP_MS = 500;
export const MIN_STEP_MS = 80;
export const MAX_STEP_MS = 1200;
export const STEP_SMOOTH = 0.5;

/**
 * Whether a pawn should be DRAWN with its walk-cycle sprite: it stepped this frame, OR its slide is
 * still in flight at `nowMs`, OR it stepped within the last WALK_HOLD_FRAMES frames. The slide clause
 * is the important one: the slide now runs ~one estimated interval (~500 ms), far longer than the
 * fixed 2-frame hold, and wire frames re-send whenever ANY crew steps — so in a busy scene a gliding
 * pawn's `sinceStep` can exceed the frame hold mid-slide. Holding the sprite while `slideActive`
 * keeps the walk cycle running for the whole glide (no standing pose ice-skating across the floor).
 * When `nowMs` is null (frozen/untimed, e.g. ?t= screenshots) there is no slide, so this falls back
 * to the fixed frame-count hold — byte-identical to the pre-slide behaviour. Pure; null-tolerant.
 * @param {MotionEntry|null|undefined} entry @param {number|null} [nowMs]
 * @returns {boolean}
 */
export function isAnimWalking(entry, nowMs) {
  if (!entry) return false;
  return entry.walking || slideActive(entry, nowMs) || entry.sinceStep <= WALK_HOLD_FRAMES;
}

/**
 * ── WHICH WAY A PAWN LOOKS ──────────────────────────────────────────────────────────────────────
 * The art has ONE profile: both walk frames in SPRITE_FRAMES are drawn facing EAST (the idles are
 * front-facing), and there are no directional variants — `SPRITE_FACING` carries no pawn entry and
 * `spriteTurns` is never applied to '@'. So a westbound pawn used to slide backwards under an
 * east-facing sprite: the moonwalk the playtest reported.
 *
 * `flipX` is the fix and it is deliberately STICKY, not a per-step recomputation:
 *   • a step with dx < 0 sets it, dx > 0 clears it;
 *   • a VERTICAL step leaves it untouched — a pawn that walked left and then turns north keeps
 *     facing left, which is what a person looks like; recomputing per step would snap it back to
 *     the default east every time the path turned a corner;
 *   • a step-less frame carries it (like `facing`), and every discontinuity (spawn / teleport /
 *     deck change) resets to east, the art's own orientation.
 * The executors mirror the pawn sprite about its CELL CENTRE, which is a no-op on position: all
 * five pawn images bbox-centre within half a pixel of 63.5 in a 128px cell.
 *
 * `facing` is left exactly as it was (a per-step letter, clobbered by vertical steps, read by
 * nobody) — this is the field the renderer actually uses.
 *
 * ── THE ONE COST, STATED PLAINLY (AD-3) ─────────────────────────────────────────────────────────
 * The art direction requires every sprite's baked light step on its upper-LEFT and its shade step
 * on the lower-right, "in every sprite, in every state, in every frame". A horizontal mirror moves
 * a pawn's baked light step to the upper-right, so a westbound pawn is momentarily lit from the
 * wrong side. That is a knowing trade, not an oversight: the error is a value gradient across ~25
 * CSS px of a moving figure, against a pawn that otherwise walks backwards — the single loudest
 * complaint of the playtest. It is also strictly bounded to the BAKED shading. The RENDERER's own
 * directional work — the grounding shadow — is explicitly NOT mirrored (see canvas2d `_shadow` and
 * webgl2 `pushTex`'s `flip`), so the stage keeps exactly one light direction. The real fix is
 * west-facing walk art; until then this is the smaller of two wrongs.
 */
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
 *
 * `nowMs` is the wall-clock (ms) the frame landed; it flows in as DATA (kept pure) and anchors the
 * continuous slide: each real step records its wall-time + a per-cid interval estimate + the sub-tile
 * origin so slideOffset can glide the pawn origin→tile over the estimated ms/step. Pass null (untimed,
 * e.g. frozen screenshots) to record no slide — every pawn then reads settled on its tile.
 * @param {MotionState} prev
 * @param {{deck?:number, crew?:number[][]}} frame
 * @param {number|null} [nowMs]
 * @returns {MotionState}
 */
export function trackMotion(prev, frame, nowMs) {
  if (!prev) prev = initMotion();
  const deck = frame && frame.deck != null ? frame.deck : null;
  // A deck change invalidates every prior position (you can't walk between decks in one step).
  const deckChanged = prev.deck != null && deck != null && prev.deck !== deck;
  const t = nowMs == null ? null : nowMs;   // null = untimed → no slide is anchored this frame
  const byCid = {};
  const crew = (frame && frame.crew) || [];
  for (const c of crew) {
    if (!Array.isArray(c) || c.length <= 3) continue; // no cid → untrackable
    const x = c[0], y = c[1], cid = c[3];
    const p = deckChanged ? null : prev.byCid[cid];
    // sinceStep: frames since the last REAL step — 0 on a step, counting up while standing,
    // effectively-infinite on a spawn/teleport/deck change (never "recently walked"). Capped
    // so long-idle counters can't overflow into surprising values.
    // flipX: the sticky horizontal mirror (see "WHICH WAY A PAWN LOOKS"). False = the art's own
    // east-facing orientation, which is also what every discontinuity resets to.
    let walking = false, facing = null, flipX = false, fromX = x, fromY = y, dx = 0, dy = 0, sinceStep = 1000;
    // Continuous-slide state: stepMs = wall-time the active slide's step landed (null = settled),
    // interval = estimated ms/step, (originX,originY) = the sub-tile point the slide starts from.
    let stepMs = null, interval = DEFAULT_STEP_MS, originX = x, originY = y;
    if (p) {
      const sx = x - p.x, sy = y - p.y;
      if (Math.abs(sx) + Math.abs(sy) === 1) {
        // a contiguous one-tile step → a real walk; remember where it stepped from.
        walking = true; facing = facingOf(sx, sy); fromX = p.x; fromY = p.y; dx = sx; dy = sy;
        sinceStep = 0;
        // A horizontal step SETS the mirror; a vertical one leaves whatever the pawn last faced.
        flipX = sx !== 0 ? sx < 0 : !!p.flipX;
        if (t != null) {
          // Anchor a fresh slide at t. The origin is where the pawn is RIGHT NOW — if it re-stepped
          // before the last slide finished, that's a sub-tile point, so the walk never jumps back.
          const o = slidePos(p, t); originX = o.x; originY = o.y;
          interval = estimateInterval(p, t);      // ms/step, measured from the last real step
          stepMs = t;
        }
      } else if (sx === 0 && sy === 0) {
        // standing on the tracked tile: the step recency ages by one frame (held facing kept).
        sinceStep = Math.min(1000, (p.sinceStep == null ? 1000 : p.sinceStep) + 1);
        facing = p.facing; flipX = !!p.flipX;   // a standing pawn keeps looking where it was going
        // Carry the in-flight slide across this step-less frame (another crew's step forces a
        // re-send): the offset must SURVIVE so the pawn keeps gliding instead of snapping to tile.
        if (t != null) { stepMs = p.stepMs; interval = p.interval || DEFAULT_STEP_MS; originX = p.originX; originY = p.originY; }
      }
      // >1 tiles → teleport → reset (default, no walk, no slide, stale recency)
    }
    // p == null → fresh spawn / fog reveal / post-deck-change: NOT a walk, no slide.
    byCid[cid] = { x, y, walking, facing, flipX, fromX, fromY, dx, dy, sinceStep, stepMs, interval, originX, originY };
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

/** Continuous sub-tile position of a slide entry at wall-time `nowMs` (origin→current-tile lerp). */
function slidePos(e, nowMs) {
  if (!e || e.stepMs == null || nowMs == null) return { x: e ? e.x : 0, y: e ? e.y : 0 };
  const iv = e.interval > 0 ? e.interval : DEFAULT_STEP_MS;
  const p = clamp01((nowMs - e.stepMs) / iv);
  return { x: e.originX + (e.x - e.originX) * p, y: e.originY + (e.y - e.originY) * p };
}

/** Estimate a pawn's ms-per-step from the gap since its last real step, EMA-smoothed + clamped. */
function estimateInterval(p, nowMs) {
  const prevIv = p && p.interval > 0 ? p.interval : DEFAULT_STEP_MS;
  if (!p || p.stepMs == null) return prevIv;   // no prior step to time from → keep the default
  const gap = clamp(nowMs - p.stepMs, MIN_STEP_MS, MAX_STEP_MS);
  return prevIv + STEP_SMOOTH * (gap - prevIv);
}

/**
 * The sub-tile offset (in TILE units) for an entry mid-slide at wall-time `nowMs`: the pawn glides
 * from (originX,originY) toward its CURRENT tile over its estimated `interval`, so the offset is the
 * remaining travel (origin - cur) * (1 - progress). Self-gating: a settled entry (no active step,
 * arrived, or untimed) offsets 0 — so a step-less frame can't snap the pawn, the carried slide keeps
 * it moving. Compose draws the pawn at its current tile; this is the (negative) offset back. Pure.
 * @param {MotionEntry} entry @param {number|null} nowMs
 * @returns {{ox:number, oy:number}}
 */
export function slideOffset(entry, nowMs) {
  if (!entry || entry.stepMs == null || nowMs == null) return { ox: 0, oy: 0 };
  const iv = entry.interval > 0 ? entry.interval : DEFAULT_STEP_MS;
  const prog = clamp01((nowMs - entry.stepMs) / iv);
  if (prog >= 1) return { ox: 0, oy: 0 }; // arrived: settled onto the tile (smooth stop)
  const ox = (entry.originX - entry.x) * (1 - prog), oy = (entry.originY - entry.y) * (1 - prog);
  return { ox: ox === 0 ? 0 : ox, oy: oy === 0 ? 0 : oy }; // normalize -0 → 0
}

/** Whether an entry's slide is still in flight at `nowMs` — drives the render-loop keep-alive so it
 *  animates every gliding pawn yet idles the instant the last slide finishes. */
export function slideActive(entry, nowMs) {
  if (!entry || entry.stepMs == null || nowMs == null) return false;
  const iv = entry.interval > 0 ? entry.interval : DEFAULT_STEP_MS;
  return (nowMs - entry.stepMs) < iv;
}

function clamp01(v) { return v == null || v < 0 ? 0 : v > 1 ? 1 : v; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

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
