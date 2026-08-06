// reveal-model.js — THE DRAW-IN, AS TWO PURE FUNCTIONS.
//
// ⭐⭐ THE OWNER'S SENTENCE (2026-08-06): *"we place an item, first see it as a ghost, the pawn comes
// and constructs it — instead of immediately emerging, could it be DRAWN? like if someone writes on
// paper?"* This file is the derivation half of the answer: WHICH tiles just finished, and WHAT the
// finished piece's fragment looks like once every stroke in it has been told when to be drawn. The
// node lifecycle is `reveal-layer.js`; the join to the wire and the suppression are
// `roomzoom-view.js`. Nothing here touches the DOM, a clock, or module state.
//
// ── WHY A POST-PROCESSOR OVER AN EMITTED FRAGMENT (the shape `sketch.js` already argued) ─────────
// The finished piece is built by exactly one function — `roomzoom-view.standItem` → `buildTileItem`
// → the catalogues → `sketch()`. Re-authoring 34 fittings so each knows how to draw itself in would
// be a second authority on what every piece looks like, and the two would disagree on the first
// lane that edits a builder. So the reveal takes the SAME string the furniture layer would have
// mounted and annotates it: `pathLength="1"` plus a class plus an `animation-delay`. The picture is
// the shipped picture, byte for byte, with three attributes added per element.
//
// ⛔ `pathLength="1"` IS WHY NOTHING IS EVER MEASURED. A draw-in normally needs each path's own
// length (`getTotalLength()`), which is a LAYOUT read: it forces the browser to resolve geometry for
// every element before the first frame, it is unavailable in node, and it would make this module
// impure. `pathLength="1"` tells the renderer to pretend the path is one unit long, so
// `stroke-dasharray: 1 1` is "one whole path, then one whole gap" for EVERY element regardless of
// size, and `stroke-dashoffset: 1 → 0` is the draw. One CSS rule covers a 3-unit rivet and a 260 cm
// bench edge. Chrome honours it on `path`, `rect`, `circle`, `ellipse`, `line`, `polyline` and
// `polygon` alike, which is every geometry tag the catalogues emit.
//
// ⛔ AND THE FAILURE MODE IS FAIL-VISIBLE, WHICH IS WHY THE DASH LIVES IN CSS AND NOT IN AN
// ATTRIBUTE. `stroke-dashoffset` defaults to 0, so an element carrying `stroke-dasharray: 1 1` with
// NO animation running (stylesheet missing, engine too old, `animation: none` under reduced motion)
// draws the dash from 0 to 1 — i.e. THE WHOLE PATH. A piece whose animation never starts is a piece
// that is simply THERE, which is the pre-package behaviour. The opposite arrangement (offset baked
// into the attribute, animation removing it) would leave an invisible piece on any box where the
// animation did not run.
//
// ── EMISSION ORDER IS DRAWING ORDER, AND IT IS NOT A CHOICE ─────────────────────────────────────
// `items/*` emits back-to-front (a painter's algorithm — `sketch.js`'s header spends a paragraph on
// why its two passes are PER ELEMENT for exactly this reason). That is also the order a person
// draws in: the thing behind, then the thing in front. So the stagger is simply the index in the
// fragment, and the two-pass halo falls out for free — `drawShape` emits an element's paper
// knockout BEFORE that element's ink, always, so every knockout begins ahead of the ink it is
// carving room for. PENCIL, THEN INK, structurally rather than by a hand-tuned offset.

/* eslint-disable no-multi-spaces */

/** The class an INK stroke carries. CSS gives it `stroke-dasharray: 1 1` and the draw keyframes. */
export const INK_CLASS = 'rz-rv-ink';
/** The class a FILL-ONLY element (a paper face, a label) carries — the same keyframes, longer. */
export const FILL_CLASS = 'rz-rv-fill';

/**
 * ⭐ THE THREE NUMBERS, AND EACH ONE IS A DECISION RATHER THAN A TASTE.
 *
 * `TOTAL_MS` is the owner's own window ("~1.0–1.5 s"): long enough to read as a hand moving, short
 * enough that a player who places six lockers is not waiting on an animation. It is the time from
 * the FIRST stroke starting to the LAST stroke finishing, which is what a viewer perceives — not a
 * per-element duration that would make a 400-element capsule take twenty seconds.
 *
 * `INK_MS` is one stroke's own draw time. It is FIXED rather than derived from the element count,
 * because a stroke that draws in 3 ms does not read as drawn at all — it reads as appearing. With
 * the total pinned, the count therefore moves the STAGGER and never the stroke.
 *
 * `FILL_STEPS` is how many stagger steps a paper face washes in over, and it is CLAMPED AT BOTH
 * ENDS — which is the honest half. A fill is emitted BEFORE its own outline (the painter's algorithm
 * demands it, and `sketch.drawShape` spends a paragraph on why), so a face given the ink duration
 * exactly would be finished before the pen had gone round it. Running longer keeps the wash arriving
 * while the outline is drawn.
 *   · THE FLOOR IS `INK_MS`, and on any real piece the floor is what applies: at 40 elements a step
 *     is 22 ms and at 400 it is 2 ms, so four of them is far short of a stroke. The multiplier only
 *     bites on a fragment of a handful of elements, which no shipped piece is.
 *   · THE CEILING IS `FILL_MAX_MS`, and without it the sparse case runs away: at n = 2 a step is
 *     880 ms, so four of them would be a 3.5-second wash on a two-element drawing — measured, and
 *     the reason this constant exists rather than the multiplier standing alone.
 */
export const TOTAL_MS = 1200;
export const INK_MS = 320;
export const FILL_STEPS = 4;
export const FILL_MAX_MS = 480;

/**
 * The schedule for `n` animated elements. PURE, and total-anchored: the last element finishes at
 * `total`, which is `TOTAL_MS` unless a fill's longer duration pushes past it.
 *
 * @param {number} n how many elements will be animated
 * @returns {{n:number, step:number, inkMs:number, fillMs:number, total:number}} milliseconds
 */
export function revealTiming(n) {
  const count = Math.max(0, n | 0);
  if (count <= 0) return { n: 0, step: 0, inkMs: INK_MS, fillMs: INK_MS, total: 0 };
  // ⛔ THE SPREAD IS `TOTAL − INK`, NOT `TOTAL`. The last element STARTS at the end of the spread and
  // still has to draw itself; anchoring the spread on the total would run the piece `INK_MS` past
  // the window the suppression is held open for, and the overlay would be pulled out from under a
  // stroke still drawing. (That is the whole reason `total` is returned rather than assumed.)
  const step = count > 1 ? (TOTAL_MS - INK_MS) / (count - 1) : 0;
  const fillMs = Math.round(Math.min(FILL_MAX_MS, Math.max(INK_MS, FILL_STEPS * step)));
  const lastDelay = Math.round(step * (count - 1));
  return {
    n: count,
    step,
    inkMs: INK_MS,
    fillMs,
    // …the true envelope: whichever of the two durations the last element could be carrying. It is
    // RETURNED rather than assumed because it is what the overlay's lifetime is armed for, and a
    // window shorter than the schedule pulls the copy out from under a stroke still drawing.
    total: lastDelay + Math.max(INK_MS, fillMs),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The completion join
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⭐⭐ WHICH TILES JUST FINISHED BUILDING — the wire's own completion signal, joined, with NO client
 * timer anywhere near it.
 *
 * `BuildSystem.Complete` (sim/Sim.Core/Systems/BuildSystem.cs:263) removes the pending entry AND
 * spawns the piece in ONE call on ONE tick, and `GameSession` sends `frame` (the glyph) BEFORE
 * `designs` (the site list) in the same render pass — so "the row is gone AND the tile now carries a
 * drawn piece" is an atomic fact about one repaint, not two events a client has to correlate.
 *
 * ⛔ ALL THREE CLAUSES ARE REQUIRED, AND THE SECOND ONE IS WHAT MAKES THIS HONEST. A design row also
 * disappears when the order is CANCELLED (`erase`, a demolished site, a room that stopped existing),
 * and nothing is built. Keying off the row's absence alone would draw a piece into the room every
 * time a player erased a blueprint — inventing a completion out of a cancellation, which is exactly
 * the "confident wrong number" the blocked/refusal packages exist to remove.
 *
 * ⛔⛔ AND THE THIRD CLAUSE IS "IT APPEARED **ON THIS REPAINT**", WHICH IS A CORRECTION. The sentence
 * that stood here claimed the three facts were *atomic on one repaint* because `BuildSystem.Complete`
 * does both on one tick and `GameSession` sends `frame` before `designs`. **THE SIM HALF IS TRUE AND
 * THE CLIENT HALF WAS NOT.** Repaints are rAF-COALESCED, not message-batched: `Hud`'s dispatch fires
 * `notifyShip` per message and `scheduleRepaint` coalesces on the next animation frame, so a frame
 * boundary can land BETWEEN the `frame` message and the `designs` message. When it does, one repaint
 * sees the piece with its site still queued — and the furniture layer draws it, normally, because
 * nothing is suppressing it yet. The next repaint would then have found "row gone ∧ piece present",
 * suppressed the tile and started the draw-in: the player would watch the fitting POP IN, VANISH,
 * and draw itself. Driven in node; not observed in two live runs (the two messages are written into
 * one socket send), so it is rare — and a rare visible glitch is still a glitch.
 *
 * `drawnBefore` closes it: a tile the scene ALREADY drew a piece on last repaint is not a completion
 * to animate, it is a piece that is simply there. The reveal fires only on the repaint the piece
 * first appears, and the split case degrades to the pre-package behaviour (it appears, and stays).
 *
 * @param {Map<string,object>} prev  last repaint's designs in the focused room, keyed `"x,y"`
 * @param {Map<string,object>} now   this repaint's, same keying
 * @param {Set<string>} pieceKeys    tiles the furniture layer would draw a PIECE for RIGHT NOW
 * @param {Set<string>} [drawnBefore] the same set as of the PREVIOUS repaint. ⚠️ Absent ⇒ empty ⇒
 *   the pre-guard behaviour, which is what the pure legs that do not exercise this clause pass.
 * @returns {Array<{key:string, was:object}>} in `prev`'s own iteration order (the wire's order), so
 *   two simultaneous completions are always processed in the same sequence.
 */
export function completedTiles(prev, now, pieceKeys, drawnBefore) {
  const out = [];
  if (!(prev instanceof Map)) return out;
  const live = now instanceof Map ? now : new Map();
  const built = pieceKeys instanceof Set ? pieceKeys : new Set();
  const before = drawnBefore instanceof Set ? drawnBefore : new Set();
  for (const [key, was] of prev) {
    if (live.has(key)) continue;      // still queued — nothing has happened
    if (!built.has(key)) continue;    // the site is gone and NOTHING stands there ⇒ cancelled
    if (before.has(key)) continue;    // …and the scene already drew it: see the ⛔⛔ block above
    out.push({ key, was });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The fragment annotation
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The same very small tokeniser `sketch.js` uses, for the same reason and against the same input:
// machine-generated self-closing elements with double-quoted values and no `>` inside a value.

const TAG = /<[^>]*>/g;
const GEOM = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

/**
 * ⛔ TOKENISE INTO TAGS **AND THE TEXT BETWEEN THEM**, and the second half is not pedantry — it is a
 * defect this module would otherwise have inherited by copying its neighbour. `sketch.js` tokenises
 * with `src.match(TAG)` and re-joins the matches, which silently DELETES every text node in the
 * fragment; it gets away with it because the four treated catalogues draw with geometry only. This
 * module runs over `standItem`'s output, which reaches the PRE-REDESIGN warm set as well (twenty-odd
 * device rows that keep their old art — `standItem`'s own fallback paragraph names them), and those
 * do carry `<text>`. A reveal that dropped the labels off a piece and then restored them when the
 * overlay was removed would be a flicker nobody could explain.
 *
 * @returns {Array<{tag:boolean, s:string}>} every byte of the input, in order.
 */
function tokenise(src) {
  const out = [];
  let last = 0;
  TAG.lastIndex = 0;
  let m = TAG.exec(src);
  while (m) {
    if (m.index > last) out.push({ tag: false, s: src.slice(last, m.index) });
    out.push({ tag: true, s: m[0] });
    last = m.index + m[0].length;
    m = TAG.exec(src);
  }
  if (last < src.length) out.push({ tag: false, s: src.slice(last) });
  return out;
}

function tagName(tag) {
  const m = /^<\s*\/?\s*([-\w:]+)/.exec(tag);
  return m ? m[1] : '';
}

function attrs(tag) {
  const out = {};
  const re = /([-\w:]+)="([^"]*)"/g;
  let m = re.exec(tag);
  while (m) { out[m[1]] = m[2]; m = re.exec(tag); }
  return out;
}

/** Add or extend an attribute on an open tag, preserving everything already there. */
function withAttr(tag, name, value, join) {
  const re = new RegExp(`\\s${name}="([^"]*)"`);
  const had = re.exec(tag);
  if (had) {
    const merged = join ? had[1] + join + value : value;
    return tag.replace(re, ` ${name}="${merged}"`);
  }
  // insert before the tag's own close, self-closing or not
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end.trim().startsWith('/') ? '/>' : '>'}`);
}

/**
 * ⭐ WHAT KIND OF MARK IS THIS ELEMENT — ink, fill, or neither. The answer needs the `<g>` STACK,
 * not the element alone, and that is not fussiness: `sketch.js` emits an element's paper knockout as
 * a group of `<path>`s carrying only a `stroke-width`, with the colour on the wrapping
 * `<g fill="none" stroke="#EBE4D1">`. Judged on its own attributes a knockout path has no stroke at
 * all and would be skipped — i.e. the ENTIRE pencil pass of a treated piece would appear instantly
 * while the ink drew in around it, which is the opposite of the effect.
 *
 * @param {object} own the element's own attributes
 * @param {{stroke:(string|null), fill:(string|null)}} inherited nearest ancestor `<g>` values
 * @returns {'ink'|'fill'|null}
 */
export function markKind(own, inherited, tag) {
  const stroke = own.stroke != null ? own.stroke : (inherited ? inherited.stroke : null);
  const fill = own.fill != null ? own.fill : (inherited ? inherited.fill : null);
  if (stroke && stroke !== 'none') return 'ink';
  // ⚠️ AN UNSET FILL IS BLACK IN SVG, NOT NOTHING — so a shape with neither attribute set really is
  // painted and really must fade in. The catalogues set `fill` explicitly everywhere; this arm is
  // for the pre-redesign warm pieces, which are the ones most likely not to.
  if (fill !== 'none') return tag === 'text' || GEOM.has(tag) ? 'fill' : null;
  return null;
}

/**
 * ⭐⭐ ONE EMITTED FRAGMENT → THE SAME FRAGMENT, TOLD WHEN TO DRAW ITSELF. PURE: same input, same
 * bytes out, no clock and no randomness (the wobble is already baked in upstream by `sketch()`,
 * seeded on the piece id).
 *
 * ⛔ EVERYTHING INSIDE `<defs>` IS LEFT ALONE, AND SKIPPING IT IS LOAD-BEARING RATHER THAN TIDY. The
 * kit's `#fh` hatch is a `<pattern>` holding a ground rect and a rule; annotated, that rule would
 * carry `pathLength="1"` and the draw animation — so every hatched side face in the piece would
 * flicker as its PATTERN CELL redrew itself, at the pattern's period, forever (a pattern's contents
 * are re-rasterised per tile, not per use). The same argument covers gradients, masks and clip
 * paths: a definition is not a mark on the paper.
 *
 * @param {string} fragment `standItem`'s output for the finished piece
 * @param {{timing?: object}} [opts] `timing` overrides the schedule (the bench passes its own)
 * @returns {{html:string, count:number, timing:object}} `count` is how many elements were annotated
 *   — 0 means the reveal would be invisible, which the caller must treat as "do not mount".
 */
export function revealFragment(fragment, opts = {}) {
  const src = typeof fragment === 'string' ? fragment : '';
  if (!src) return { html: '', count: 0, timing: revealTiming(0) };
  const toks = tokenise(src);

  // ── pass 1: COUNT, because the schedule needs the total before the first delay can be written ──
  // (Two passes over a token list is cheaper than one pass plus a fix-up rewrite, and it keeps the
  // stagger a function of the whole fragment rather than of how far through it we happen to be.)
  const kinds = [];                 // token index → 'ink' | 'fill'
  let depth = 0, defsAt = -1;
  const gStack = [{ stroke: null, fill: null }];
  for (let i = 0; i < toks.length; i += 1) {
    if (!toks[i].tag) continue;
    const t = toks[i].s;
    const nm = tagName(t);
    const closing = t.startsWith('</');
    const selfClosing = t.endsWith('/>');
    if (!closing && !selfClosing) depth += 1;
    if (nm === 'defs' && !closing && defsAt < 0) defsAt = depth;         // depth AFTER the increment
    if (defsAt < 0 && nm === 'g') {
      if (closing) { if (gStack.length > 1) gStack.pop(); }
      else if (!selfClosing) {
        const a = attrs(t);
        const top = gStack[gStack.length - 1];
        gStack.push({
          stroke: a.stroke != null ? a.stroke : top.stroke,
          fill: a.fill != null ? a.fill : top.fill,
        });
      }
    }
    if (defsAt < 0 && !closing && (GEOM.has(nm) || nm === 'text')) {
      kinds[i] = markKind(attrs(t), gStack[gStack.length - 1], nm);
    }
    if (closing) {
      if (defsAt === depth && nm === 'defs') defsAt = -1;
      depth -= 1;
    }
  }
  const n = kinds.reduce((acc, k) => acc + (k ? 1 : 0), 0);
  const timing = (opts && opts.timing) || revealTiming(n);
  if (!n) return { html: src, count: 0, timing };

  // ── pass 2: write the schedule onto the tags that carry a mark ──
  const out = toks.map((t) => t.s);
  let idx = 0;
  for (let i = 0; i < toks.length; i += 1) {
    const kind = kinds[i];
    if (!kind) continue;
    const delay = Math.round(timing.step * idx);
    const dur = kind === 'ink' ? timing.inkMs : timing.fillMs;
    idx += 1;
    let tag = toks[i].s;
    // ⚠️ THE CLASS IS **APPENDED**, never assigned. Two of the treatment's own marks are identified
    // by class and nothing else — `pl-sk-ground` (the floor rule, excluded by name from the
    // amplitude pin) and `pl-sk-2nd` (the doubled silhouette, the one exception to the collinearity
    // leg). Overwriting either would silently defeat a guard in a different file.
    tag = withAttr(tag, 'class', kind === 'ink' ? INK_CLASS : FILL_CLASS, ' ');
    // …and the style likewise, for the same reason in a smaller costume.
    tag = withAttr(tag, 'style', `animation-delay:${delay}ms;animation-duration:${dur}ms`, ';');
    if (kind === 'ink') tag = withAttr(tag, 'pathLength', '1');
    out[i] = tag;
  }
  return { html: out.join(''), count: n, timing };
}
