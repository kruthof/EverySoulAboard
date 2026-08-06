// pawn-tween-model.js — CLIENT-SIDE INTERPOLATION OF THE PAWN GLIDE. PURE MATH, NO DOM.
//
// ⭐ WHAT THIS IS FOR. The host publishes `fx`/`fy` on the roster — the sub-tile position a walking
// crew member should be DRAWN at (`hosts/web/WireFormat.cs` `RosterEntry.Fx`, which owns the
// coordinate convention and the drawn-tile-vs-sim-tile split). That turned a one-tile teleport into
// 6–8 sub-steps per tile, at 5–7.7 roster messages a second. It is much better and it is still a
// STEP FUNCTION: the eye sees ~7 discrete positions per tile where the display can show 60.
//
// This module closes the gap on the CLIENT ONLY. Nothing here changes the sim, the wire, or what the
// host believes. It buffers the last two samples per crew member and reports, for any instant `now`,
// where the figure should be drawn BETWEEN them.
//
// ⛔⛔ THE FIVE RULES, AND EACH ONE EXISTS BECAUSE ITS ABSENCE IS A VISIBLE LIE.
//
//  1. NO EXTRAPOLATION, EVER. `u` is clamped to [0,1], so the tween never passes the newest sample.
//     The alternative — predicting forward past `b` to hide the one-interval latency — draws a
//     figure at a position the host has NOT approved, and `RosterEntry.Fx`'s contract makes that
//     concretely wrong rather than merely speculative: room membership, the `N HERE` caption and the
//     Room Zoom's pawn hit test are all decided from the DRAWN TILE, and every one of them is
//     evaluated at message cadence against `b`. A tween that ran past `b` would draw a person on a
//     tile no membership test ever admitted — the "standing on the cryo bay's back wall" defect the
//     glide package's send-back was about, re-introduced from the other end.
//     ⚠️⚠️ THE COST IS STATED, MEASURED, AND IT HAS A SECOND HALF THIS COMMENT ORIGINALLY ARGUED
//     ONLY THE FORWARD DIRECTION OF. The figure trails the host's newest word by up to one sample
//     interval, and IN TILES that lag is bounded by the wire's own step size — measured on
//     `--ship wreck`, re-measured by this lane over four 5 s walks: consecutive samples are median
//     0.100-0.200, p90 0.200, max 0.200-0.300 of a tile apart, so the drawn body sits up to about a
//     quarter of a tile behind the sample and, at a tile boundary, in the PREVIOUS TILE.
//     Independent review measured the consequence as `round(drawn) != round(sample)` on 11.0% of
//     moving frames; on a HELD ship it is not a percentage at all, it is PERMANENT until the player
//     starts the ship again.
//     ⛔ SO ANY CONSUMER WHOSE JOB IS TO AGREE WITH THE PIXELS MUST ASK THIS MODULE, NOT THE WIRE.
//     Exactly one does — the crew CLICK (`roomzoom-view.js`'s `crewDrawnAtTile`), whose entire
//     justification is that you select what you can see. Everything else on the drawn-tile side of
//     `WireFormat.RosterEntry.Fx`'s split — room membership, the `N HERE` caption, the crew dock's
//     HERE flag — is a per-message LIST and correctly stays on the sample: promoting those would make
//     a compartment's population flicker at 60 Hz to chase a body that is on its way in anyway.
//
//  2. SNAP, NEVER TWEEN, when the step is not a walk. Two triggers, both measured against the last
//     sample: a jump longer than `SNAP_TILES`, and a change of DECK. A re-path, a thaw, a ladder
//     step and the filed m6 teleport all present as one of those, and interpolating across them
//     would slide a figure through the hull at speed. `SNAP_TILES` is 1.5 because a legitimate walk
//     step is at most ~1 tile per sample even at the fastest game speed (the render cadence is fixed
//     at 10 Hz — `GameSession.RenderSeconds` — so a higher speed makes each sample a BIGGER step,
//     which is exactly why the threshold is not tighter).
//
//  3. FREEZE, don't drift, when the samples stop. `u` saturates at 1 and stays there, so a crew
//     member who arrives and stands still settles at exactly `b` — and a settled pawn is what
//     `settled()` reports, so the caller can stop its animation loop entirely. This is not a nicety:
//     an idle ship emits ZERO roster messages (measured on `--ship wreck`: 7.67 msg/s while someone
//     walks, 0.00 idle), so "no samples" is the NORMAL state of a ship where nobody is moving, and a
//     renderer that kept ticking would burn a frame budget to redraw a stationary drawing forever.
//
//  4. A COLD CID DOES NOT TWEEN. The first time a cid is seen it is placed exactly at its sample.
//     Callers feed this module the set of pawns THEIR SURFACE DRAWS, so "first seen" also covers a
//     crew member walking INTO the focused room: she appears at the position membership approved,
//     rather than gliding in from a tile this room never drew.
//
//  5. THE SEGMENT STARTS AT THE CURRENT DRAWN POINT, not at the previous sample. In the ordinary
//     case they are the same point — the previous segment has completed, because the durations are
//     measured from real arrivals. They differ only when a sample lands EARLY, and there taking the
//     previous sample as `a` TELEPORTS THE FIGURE FORWARD to a point it has not walked to yet: the
//     drawn body is mid-way between sample n-1 and n, and re-anchoring on sample n jumps it the rest
//     of that segment in one frame. (An earlier draft of this line said "backwards", which is the
//     wrong direction — the tween is BEHIND the samples, never ahead, so re-anchoring on a sample can
//     only ever skip forward. The defect is a visible snap either way; the sentence was wrong.)
//     `pawn-tween.test.js` pins it as a discontinuity — the drawn position must not move at all on
//     the frame a sample arrives — and the live witness's zero-reversals leg is a separate claim.
//
// ⛔ THE CLOCK IS PAUSABLE, AND THAT IS A PRODUCT REQUIREMENT, NOT A CONVENIENCE. When the player
// holds the ship the host stops ticking, so no new samples arrive — and a wall-clock tween would
// keep running out its current segment, creeping ~0.15 of a tile over ~130 ms after the world froze.
// `makePausableClock` stops accumulating while paused, so the figure stops within one frame and does
// not creep. On resume the same segment continues from where it stopped.

/** The tuning, in one place. Every value is used by a test that fails when it moves. */
export const TWEEN = Object.freeze({
  /** A step longer than this many tiles is a teleport, not a walk ⇒ snap (rule 2). */
  SNAP_TILES: 1.5,
  /** Floor on the measured inter-sample interval. Below ~2 display frames a tween is a step anyway,
   *  and a zero would divide by zero. */
  MIN_INTERVAL_MS: 33,
  /** Ceiling on the measured interval. A long gap (the ship was paused, the tab was backgrounded, a
   *  crew member stood still for a minute) must not make the next step crawl for that long. The
   *  figure then arrives early and FREEZES — bounded, and never extrapolation. */
  MAX_INTERVAL_MS: 250,
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Where a record is drawn at `now`. `u === 1` ⇒ settled at the newest sample. */
function at(rec, now) {
  const u = rec.dur > 0 ? clamp01((now - rec.t0) / rec.dur) : 1;
  return { x: rec.ax + (rec.bx - rec.ax) * u, y: rec.ay + (rec.by - rec.ay) * u, u };
}

/**
 * The interpolator. One instance per SURFACE (each surface feeds it only the cids it draws — see
 * rule 4), keyed by `String(cid)`.
 *
 * @param {{snapTiles?:number, minIntervalMs?:number, maxIntervalMs?:number}} [cfg]
 */
export function makePawnTween(cfg) {
  const snapTiles = Number.isFinite(cfg && cfg.snapTiles) ? cfg.snapTiles : TWEEN.SNAP_TILES;
  const minMs = Number.isFinite(cfg && cfg.minIntervalMs) ? cfg.minIntervalMs : TWEEN.MIN_INTERVAL_MS;
  const maxMs = Number.isFinite(cfg && cfg.maxIntervalMs) ? cfg.maxIntervalMs : TWEEN.MAX_INTERVAL_MS;
  /** key → {ax,ay,bx,by,t0,dur,deck,arr} */
  const recs = new Map();

  /**
   * Take one roster message's worth of samples. Cids NOT in `entries` are forgotten (they left this
   * surface: another deck, another room, a death) — so returning re-enters through rule 4.
   *
   * @param {Array<{cid:*, x:number, y:number, deck?:number}>} entries  tile-space positions ALREADY
   *   resolved by the caller (the `fx ?? x` fallback is the view's, so this module never has to know
   *   about an older host).
   * @param {number} now  the pausable clock's reading, ms.
   */
  function sample(entries, now) {
    const seen = new Set();
    for (const e of (Array.isArray(entries) ? entries : [])) {
      if (!e) continue;
      const key = String(e.cid);
      // ⚠️ MARKED SEEN BEFORE THE JUNK CHECK, AND THE ORDER IS THE BUG THIS FILE'S OWN TEST FOUND.
      // A malformed sample means "this message told us nothing about her", NOT "she is gone": with
      // the check first, one NaN on the wire dropped her out of `seen`, the sweep below EVICTED her
      // record, and the next good sample re-entered her as a cold start — a visible hitch caused by
      // a field the view had already decided to ignore.
      seen.add(key);
      const x = Number(e.x), y = Number(e.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue; // a junk sample is not a position
      const deck = e.deck | 0;
      const prev = recs.get(key);
      if (!prev) {                                            // rule 4 — cold: no tween
        recs.set(key, { ax: x, ay: y, bx: x, by: y, t0: now, dur: 0, deck, arr: now });
        continue;
      }
      const dx = x - prev.bx, dy = y - prev.by;
      const step = Math.sqrt(dx * dx + dy * dy);
      if (deck !== prev.deck || step > snapTiles) {            // rule 2 — snap
        prev.ax = x; prev.ay = y; prev.bx = x; prev.by = y;
        prev.t0 = now; prev.dur = 0; prev.deck = deck; prev.arr = now;
        continue;
      }
      if (step === 0) { prev.arr = now; continue; }            // a resend: never restart the segment
      const cur = at(prev, now);                               // rule 5 — start from what is DRAWN
      const gap = now - prev.arr;
      const dur = Math.min(maxMs, Math.max(minMs, Number.isFinite(gap) && gap > 0 ? gap : minMs));
      prev.ax = cur.x; prev.ay = cur.y; prev.bx = x; prev.by = y;
      prev.t0 = now; prev.dur = dur; prev.deck = deck; prev.arr = now;
    }
    for (const k of Array.from(recs.keys())) if (!seen.has(k)) recs.delete(k);
  }

  /**
   * Where every tracked pawn is drawn at `now`. `moving` is false once the segment is spent — the
   * caller uses it to skip DOM writes for a figure that has not changed by a millipixel.
   *
   * ⭐ `deck` IS REPORTED, AND IT IS NOT A CONVENIENCE. The Level-1 plate draws EVERY deck at once
   * (`ship-elevation.js`), so projecting a tween position needs the band as well as the tile —
   * `t.project(x, y, deck)`. The record has always held `deck` (rule 2 snaps on it); reporting it
   * here is what stops the caller keeping a parallel cid→deck table beside this one, which is
   * exactly how a figure would come to be drawn on the band she just left. It is the SNAPPED value,
   * i.e. the deck of the newest sample, because a deck change is never interpolated.
   *
   * @returns {Map<string,{x:number,y:number,deck:number,u:number,moving:boolean}>}
   */
  function positions(now) {
    const out = new Map();
    for (const [k, r] of recs) {
      const p = at(r, now);
      out.set(k, { x: p.x, y: p.y, deck: r.deck, u: p.u, moving: p.u < 1 });
    }
    return out;
  }

  /** True when NO tracked pawn has an unspent segment ⇒ the caller may stop its loop (rule 3). */
  function settled(now) {
    for (const r of recs) if (r[1].dur > 0 && now - r[1].t0 < r[1].dur) return false;
    return true;
  }

  return {
    sample,
    positions,
    settled,
    /** How many cids are tracked. */
    size: () => recs.size,
    /** Forget everything (a surface closing, a ship reload). */
    clear: () => recs.clear(),
  };
}

/**
 * A monotonic millisecond clock THAT DOES NOT ADVANCE WHILE THE SHIP IS PAUSED.
 *
 * `tick(paused)` attributes the time since the previous call to the state that held AT that previous
 * call, then records the new state. So a hold entered at frame N stops the clock from frame N
 * onwards — the figure freezes within one frame — and the segment resumes, mid-flight, when the
 * player starts the ship again.
 *
 * @param {() => number} nowFn a wall-clock source (performance.now / Date.now); injected so the
 *   whole thing is testable without a browser.
 */
export function makePausableClock(nowFn) {
  const src = typeof nowFn === 'function' ? nowFn : () => Date.now();
  let clock = 0;
  let wall = src();
  let paused = false;
  return {
    tick(isPaused) {
      const w = src();
      if (!paused) clock += Math.max(0, w - wall);
      wall = w;
      paused = !!isPaused;
      return clock;
    },
    /** The current reading WITHOUT advancing — for assertions and for a second read in one frame. */
    peek: () => clock,
  };
}
