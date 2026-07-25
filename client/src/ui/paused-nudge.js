// THE PAUSED-SHIP NUDGE, on the standard surface — "you gave the ship an order while it is on HOLD".
//
// WHAT IT IS FOR (console-retirement plan §1(b) B6). A first-run player arms a tool on a paused ship,
// places a wall, watches nothing happen, and concludes the game is broken. The console answered that
// with a blinking chip beside the run-state readout (`index.html` `#s-nudge`, driven by
// `hud.js nudgeIfPaused`). That chip lives inside the deprecated `.app` shell, which
// `body.overview-open` hides — so on the surface the game actually ships with, the affordance was
// silently gone. This module is it, re-homed.
//
// WHY A FACTORY AND NOT TWO COPIES. Both modern surfaces need it, and they need it in different
// places: the Overview arms MOVE and commissions rooms, while the Room Zoom is where walls, floors and
// devices are actually placed — which is where the "nothing happened" moment overwhelmingly lands.
// One behaviour implemented twice is one behaviour that will drift, so each surface owns its own
// ELEMENT and shares this one state machine.
//
// The decision of WHEN to fire is not here: it stays with the reducer `console-model.nextNudge`
// (fires only while paused, clears on unpause) and its time-derived visibility `nudgeVisible`, both
// already node-tested. This file is the glue that gives them an element and a dismissal timer, and
// every dependency it has on the outside world — the clock, the timer, the element — is injectable,
// so the auto-dismiss is provable without a test that sleeps.

import { nextNudge, nudgeVisible, NUDGE_MS } from './console-model.js';

/**
 * Make a nudge controller bound to one element.
 *
 * @param {object} opts
 * @param {() => (null|{hidden:boolean})} opts.el   resolve the nudge element (late, so the caller may
 *   build its skeleton in any order). A missing element makes every call a safe no-op.
 * @param {() => number} [opts.now]                 clock, ms. Injected for tests.
 * @param {(fn:Function, ms:number) => *} [opts.setTimer]
 * @param {(h:*) => void} [opts.clearTimer]
 * @returns {{trigger:(paused:boolean)=>void, unpause:()=>void, visible:()=>boolean, paint:()=>void}}
 */
export function makeNudge(opts) {
  const o = opts || {};
  const getEl = typeof o.el === 'function' ? o.el : () => null;
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  const setTimer = typeof o.setTimer === 'function' ? o.setTimer
    : (fn, ms) => setTimeout(fn, ms);
  const clearTimer = typeof o.clearTimer === 'function' ? o.clearTimer
    : (h) => clearTimeout(h);

  let state = { shownAt: null };
  let handle = 0;

  /** Reflect the time-derived visibility onto the element. Guarded — no churn when unchanged. */
  function paint() {
    const el = getEl();
    if (!el) return;
    const want = !nudgeVisible(state, now());
    if (el.hidden !== want) el.hidden = want;
  }

  return {
    /** An order/arm just happened. Fires ONLY while paused (the reducer ignores a running trigger). */
    trigger(paused) {
      state = nextNudge(state, { t: 'trigger', paused: !!paused }, now());
      paint();
      if (nudgeVisible(state, now())) {
        // The nudge is time-derived, so something has to come back and repaint it when the window
        // closes — nothing else on either surface is guaranteed to tick while the ship is paused.
        if (handle) clearTimer(handle);
        handle = setTimer(() => { handle = 0; paint(); }, NUDGE_MS + 40);
      }
    },
    /** The sim resumed: the nudge has served its purpose and clears immediately. */
    unpause() {
      state = nextNudge(state, { t: 'unpause' }, now());
      paint();
    },
    /** Whether the nudge should be on screen right now. */
    visible() { return nudgeVisible(state, now()); },
    paint,
  };
}

export default makeNudge;
