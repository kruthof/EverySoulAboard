// reveal-layer.js — THE PERSISTENT DRAW-IN NODES. `pawn-layer.js`'s pattern, third instance.
//
// ⭐ WHY A SEPARATE LAYER EXISTS AT ALL — the argument is `pawn-layer.js`'s and it is not repeated
// here, only pointed at: `roomzoom-view.paintLayers` assigns the WHOLE cutaway to `#rz-layers`
// `innerHTML` on every coalesced wire repaint (~5–10/s), so NO NODE IN THE SCENE SURVIVES A REPAINT
// and nothing inside it can carry an animation. A CSS `stroke-dashoffset` animation is exactly such
// a thing, and it is worse off than a tween: a tween that lost its node could at least be restarted
// from the current sample, whereas a draw-in restarted five times a second never gets past its first
// 200 ms and reads as a stutter.
//
// ⛔ AND RE-ADOPTING THE NODES INTO THE REBUILT SCENE IS NOT AVAILABLE — MEASURED, not reasoned, by
// the lane that shipped the pawn overlay (`pawn-layer.js`'s header carries the numbers): detaching
// an element mid-animation and re-appending it to the same parent does not restart the animation, it
// TELEPORTS the element to the end value, with `getAnimations().length` going 1 → 0. Applied here
// that is precisely "the piece pops into existence", i.e. the behaviour this package removes.
//
// ── WHAT THIS FILE IS AND IS NOT ─────────────────────────────────────────────────────────────────
// It is the node lifecycle for AT MOST one group per completing tile, and nothing else. It holds no
// clock (the view owns the timer), no schedule (`reveal-model.js` is pure), and no art (`standItem`
// is). That keeps it drivable in `dom-lite` with no projection, no wire and no surface — the same
// property `pawn-layer.js` was built for.
//
// ⛔ ONE GROUP PER TILE, ENFORCED HERE RATHER THAN AT THE CALL SITE. `mount` on a live key is a
// NO-OP that returns the existing node. The double-draw this package must not have has two possible
// sources — the scene's own copy (closed by the suppression set in `roomzoom-view.js`) and a second
// overlay copy — and the second one is closed by this line. A completion signal that arrived twice
// (two repaints inside one animation, a re-entered room) would otherwise stack two identical pieces
// with two different phases and draw the piece twice over.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A keyed layer of per-tile `<g>` nodes inside `svgEl`.
 *
 * @param {Element} svgEl the overlay `<svg>` (created once by the surface's skeleton)
 * @param {{groupClass?:string}} [opts] the class every group carries
 */
export function makeRevealLayer(svgEl, opts) {
  const groupClass = (opts && opts.groupClass) || 'rz-reveal';
  /** key → {el} */
  const recs = new Map();

  function makeG() {
    const doc = svgEl.ownerDocument;
    // `dom-lite` has no `createElementNS`; a real document must have one or the `<g>` lands in the
    // HTML namespace and renders nothing. Same two-armed call `pawn-layer.js` makes, same reason.
    return doc.createElementNS ? doc.createElementNS(SVG_NS, 'g') : doc.createElement('g');
  }

  /**
   * Mount the annotated fragment for `key`. Returns the group node.
   * @param {string} key the tile, `"x,y"`
   * @param {string} html `reveal-model.revealFragment`'s output
   */
  function mount(key, html) {
    const k = String(key);
    const had = recs.get(k);
    if (had) return had.el;                   // see the header: one group per tile, always
    const el = makeG();
    el.setAttribute('class', groupClass);
    // BOTH forms, for `pawn-layer.js`'s measured reason: a real document populates `dataset` from
    // `setAttribute('data-…')` and `dom-lite`'s element keeps the two independent, so a layer that
    // set only one of them would be undrivable in exactly one of the two harnesses.
    el.setAttribute('data-rv-tile', k);
    if (el.dataset) el.dataset.rvTile = k;
    el.innerHTML = html;
    svgEl.appendChild(el);
    recs.set(k, { el });
    return el;
  }

  /** Take the copy away. Returns whether there was one — the caller's "did I actually finish it". */
  function unmount(key) {
    const rec = recs.get(String(key));
    if (!rec) return false;
    rec.el.remove();
    recs.delete(String(key));
    return true;
  }

  return {
    mount,
    unmount,
    clear() { for (const [, rec] of recs) rec.el.remove(); recs.clear(); },
    has: (key) => recs.has(String(key)),
    /** The live node for a tile — the identity a persistence test compares by reference. */
    node: (key) => { const r = recs.get(String(key)); return r ? r.el : null; },
    keys: () => Array.from(recs.keys()),
    size: () => recs.size,
  };
}
