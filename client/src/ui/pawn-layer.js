// pawn-layer.js — THE PERSISTENT PAWN NODES. Shared by both standard surfaces.
//
// ⭐ WHY A SEPARATE LAYER EXISTS AT ALL. Both surfaces rebuild their scene as ONE STRING assigned to
// `innerHTML` at the wire's render rate (`overview-view.js` `paintScene`, `roomzoom-view.js`
// `paintLayers`). That is a deliberate, argued design — the scenes are pure string builders and
// `overview-view.js`'s own `_el` header explains why converting them to keyed reconciles is a
// rewrite rather than an edit. But it has one consequence that cannot be argued away: NO NODE IN
// EITHER SCENE SURVIVES A REPAINT, so no node can be animated across one. A tween needs a DOM
// element that outlives the message that moved it, and that is what this file owns — nothing else.
//
// ⛔⛔ OVERLAY, NOT RE-ADOPTION, AND THE CHOICE IS MEASURED (2026-08-05, headless Chrome 1440×900,
// a synthetic 300-rect scene + 8 pawns of 10 nodes each — the shipped plate's own shape).
//
//   · RE-PARENTING KILLS AN IN-FLIGHT ANIMATION, and it does not merely restart it — it TELEPORTS
//     the element to the end value. A `<g>` 200 ms into a 400 ms linear `transform` transition sat
//     at x = 190.4 px; detaching it and re-appending it to the same parent (which is exactly what
//     "re-adopt the live nodes into the rebuilt scene" does) put it at x = 400.0 px in the same
//     frame, with `getAnimations().length` going 1 → 0. The SMIL leg is the same: 0 animations
//     survive the round trip. So option (b) forecloses the whole CSS-transition family of clocks,
//     and would visibly snap any figure whose repaint landed mid-tween.
//   · IT ALSO COSTS MORE. Per repaint, median over 200 runs, twice each: scene rebuild ALONE
//     0.6 ms / 0.6 ms; scene rebuild + re-adopt 0.8 ms / 0.8 ms (p90 0.9 / 1.0). +0.2 ms on every
//     one of ~10 repaints a second, bought nothing.
//   · AND THE REPO ALREADY DECIDED THIS ONCE, TWICE. `.rz-pulse-tile` is a `div` in a sibling layer
//     *"for the reason it always was: the pulse must survive `_layers.innerHTML =` being replaced
//     under it"*, and the Overview's drifting starfield is built once in the skeleton *"so its CSS
//     drift is never restarted by the scene's innerHTML rebuild"*. This is the third instance of
//     the same shape, and the first one that had to be measured rather than reasoned.
//
// THE PRICE OF THE OVERLAY IS COORDINATE COUPLING, and it is paid in exactly one place per surface:
// the overlay `<svg>` must carry the SAME `viewBox` and the SAME `preserveAspectRatio` over the SAME
// client box as the scene it floats on, or a figure drifts off its floor. Both mounts do it from the
// scene's own numbers (never from a second derivation) and both CSS boxes are literally the scene
// layer's box copied — `.rz-pawnlay` shares `.rz-pulse`'s `inset:6px`, which is `.rz-layers`' box.
//
// WHAT THIS FILE IS NOT. It holds no interpolation (that is `pawn-tween-model.js`, pure) and no
// pawn art (that is `overview-scene.js`'s `pawnLayerParts` and `roomzoom-view.js`'s `pawnParts`,
// both pure). It is the node lifecycle and nothing else, so it is drivable in `dom-lite` with no
// projection, no wire and no surface.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * ⭐ `prefers-reduced-motion` — THE HONEST FALLBACK IS TODAY'S BEHAVIOUR, NOT A DEGRADED TWEEN.
 *
 * A caller that reads `true` here reads the tween at `u = 1` — i.e. exactly the newest sample, which
 * is byte-for-byte where the figure was drawn before this package existed — and never starts an
 * animation loop. So a reduced-motion visitor gets the shipped 6–8 steps per tile, at zero per-frame
 * cost, with no second code path to keep alive. `.rz-pulse-tile` already answers the same query in
 * `roomzoom.css`; this is the same promise made in JS because the motion here is not a CSS
 * animation that a media query could switch off.
 *
 * ⚠️ FALSE WHEN THE QUERY CANNOT BE ASKED (a node harness, an old engine): the tween is the default
 * and the opt-out is the exception, so an unanswerable query must not silently disable the feature.
 */
export function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/** Two-decimal fixed — enough for sub-pixel motion, coarse enough that a settled figure produces a
 *  byte-identical attribute and is therefore skipped by the guard in `place`. */
const n2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

/**
 * A keyed layer of persistent per-cid `<g>` nodes inside `svgEl`.
 *
 * @param {Element} svgEl   the overlay `<svg>` (created once by the surface's skeleton).
 * @param {{groupClass?:string}} [opts]  the class every pawn group carries — `pl-pawn` on the
 *   Overview (its hit test is `target.closest('.pl-pawn')` plus `data-cid`, so the class and the
 *   dataset are not decoration: they ARE the selection gesture) and `rz-pawn-root` in the Room Zoom.
 */
export function makePawnLayer(svgEl, opts) {
  const groupClass = (opts && opts.groupClass) || 'pl-pawn';
  /** key → {el, html, tx, ty} */
  const recs = new Map();

  /**
   * Reconcile the layer against one message's worth of pawns.
   *
   * ⭐ THE CONTENT IS REWRITTEN ONLY WHEN IT CHANGES, and the signature IS the markup — not a hand
   * listed tuple of the fields that feed it. A field-list signature is a bug waiting for the next
   * lane to add a field to the art and forget the list; comparing the string cannot miss one, and
   * at 8 pawns × ~600 chars × 10 messages a second the comparison is free.
   *
   * ⚠️ WHAT THIS DOES *NOT* MAKE PERSISTENT: the label de-clutter row. `layoutPawnLabels` re-slots
   * at MESSAGE cadence (~5–8/s) because it is a function of every pawn's position at once, so a
   * lifted pill can still step between rows while the figures below it glide continuously. That is
   * the honest trade and it is stated rather than hidden: the alternative is re-running an O(n²)
   * 2-D occupancy sweep 60 times a second to smooth an affordance nobody is watching move.
   *
   * @param {Array<{cid:*, x:number, y:number, html:string}>} parts  pure-built, FOOT-RELATIVE markup
   *   (the art is drawn around (0,0)) plus the projected foot point.
   */
  function sync(parts) {
    const list = Array.isArray(parts) ? parts : [];
    const seen = new Set();
    for (const p of list) {
      if (!p) continue;
      const key = String(p.cid);
      seen.add(key);
      let rec = recs.get(key);
      if (!rec) {
        const el = svgEl.ownerDocument.createElementNS
          ? svgEl.ownerDocument.createElementNS(SVG_NS, 'g')
          : svgEl.ownerDocument.createElement('g');
        el.setAttribute('class', groupClass);
        // BOTH forms, because the two consumers read it two ways: `hitTest` reads `pawn.dataset.cid`
        // and the rigs/tests select `[data-cid="…"]`. In a real document `setAttribute('data-cid')`
        // populates `dataset`, but `dom-lite`'s element keeps them independent, so a layer that set
        // only one of them would be undrivable in exactly one of the two harnesses.
        el.setAttribute('data-cid', key);
        if (el.dataset) el.dataset.cid = key;
        svgEl.appendChild(el);
        rec = { el, html: null, tx: null, ty: null };
        recs.set(key, rec);
      }
      if (rec.html !== p.html) { rec.el.innerHTML = p.html; rec.html = p.html; }
    }
    for (const [k, rec] of Array.from(recs)) {
      if (!seen.has(k)) { rec.el.remove(); recs.delete(k); }
    }
  }

  /**
   * Move the nodes. THE ONLY THING THAT RUNS PER DISPLAY FRAME.
   *
   * ⛔ A SETTLED PAWN MUST WRITE NOTHING. `positions` reports where each figure is at `now`; when
   * that is bit-identical to what the node already carries, no attribute is touched — so a ship
   * where everybody is standing still produces ZERO DOM mutations per frame even if a caller keeps
   * calling. That is the belt to `pawn-tween-model`'s braces (`settled()` stops the loop entirely):
   * the loop's stop condition is a decision that can be got wrong, this is a property that cannot.
   *
   * @param {Map<string,{x:number,y:number}>} positions keyed as `sync` keys.
   * @returns {number} how many nodes actually moved — the number a zero-work test asserts on.
   */
  function place(positions) {
    if (!positions) return 0;
    let moved = 0;
    for (const [key, rec] of recs) {
      const p = positions.get(key);
      if (!p) continue;
      const tx = n2(p.x), ty = n2(p.y);
      if (rec.tx === tx && rec.ty === ty) continue;
      rec.tx = tx; rec.ty = ty;
      rec.el.setAttribute('transform', 'translate(' + tx + ' ' + ty + ')');
      moved += 1;
    }
    return moved;
  }

  return {
    sync,
    place,
    /** The live node for a cid — the identity a persistence test compares by reference. */
    node: (cid) => { const r = recs.get(String(cid)); return r ? r.el : null; },
    size: () => recs.size,
    clear() { for (const [, rec] of recs) rec.el.remove(); recs.clear(); },
  };
}
