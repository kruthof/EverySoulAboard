// Executor selection — PURE. main.js decides which render backend to build and whether the
// selection reticle is time-frozen, from the URL query. Kept side-effect-free (no DOM, no GL)
// so the decision logic is unit-testable; main.js does the actual construction + DOM wiring.

/**
 * Choose the render backend from the query. `webgl2` is honoured only when the environment
 * reports WebGL2 support; everything else (including an unknown value) resolves to `canvas2d`.
 * The *actual* GL context acquisition can still fail at construction — main.js catches that and
 * falls back — so this is the requested-and-plausible gate, not a guarantee.
 * @param {{get:(k:string)=>(string|null)}} search  a URLSearchParams-like reader
 * @param {{webgl2Available?:boolean}} [env]
 * @returns {'webgl2'|'canvas2d'}
 */
export function chooseBackend(search, env = {}) {
  const want = (search && search.get && search.get('exec')) || 'canvas2d';
  if (want === 'webgl2' && env.webgl2Available) return 'webgl2';
  return 'canvas2d';
}

/**
 * Parse the `?t=` time-freeze param. When present and finite, the client feeds this fixed value
 * as `timeSec` every frame instead of the wall clock, so the animated selection reticle (and any
 * future time-driven effect) is deterministic for screenshot parity. Returns null when absent or
 * unparseable (→ live wall-clock time).
 * @param {{get:(k:string)=>(string|null)}} search
 * @returns {number|null}
 */
export function parseFrozenTime(search) {
  const raw = search && search.get && search.get('t');
  if (raw == null || raw === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}
