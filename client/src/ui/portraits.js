// Portrait resolver — maps a citizen's portrait key to a drawable descriptor, with a MANDATORY
// procedural silhouette fallback so the citizen card ALWAYS has a face. The pure resolver here
// (deterministic, never throws, no DOM) is the tested surface; the tiny DOM builder at the bottom
// is browser-only glue the panels layer calls.
//
// Contract: `citizen {..., portrait}` where portrait is a string key that MAY be unknown (the art
// pipeline hasn't produced it yet, or it's a modded citizen). When the key is missing from the
// registry — or absent entirely — we synthesize a silhouette: the citizen's initials over a hue
// derived deterministically from their cid, so the same person always gets the same colour.

/** @typedef {{kind:'image', key:string, src:string} | {kind:'silhouette', hue:number, initials:string}} Portrait */

/**
 * Resolve a citizen to a portrait descriptor. Never throws.
 * @param {{cid?:*, name?:*, portrait?:*}} citizen
 * @param {Object<string,string>} [registry]  portrait key → image src (data URI / URL). Empty today.
 * @returns {Portrait}
 */
export function resolvePortrait(citizen, registry = {}) {
  const c = citizen || {};
  const key = c.portrait;
  if (key != null && registry && Object.prototype.hasOwnProperty.call(registry, key) && registry[key]) {
    return { kind: 'image', key: String(key), src: registry[key] };
  }
  return fallbackPortrait(c.cid, c.name);
}

/** The procedural silhouette a citizen falls back to. Deterministic; never throws. */
export function fallbackPortrait(cid, name) {
  return { kind: 'silhouette', hue: hueFromCid(cid), initials: initialsOf(name, cid) };
}

/** Deterministic hue [0,360) from a cid (FNV-ish rolling hash over its string form). */
export function hueFromCid(cid) {
  const s = cid == null ? '' : String(cid);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

/** Up-to-two initials from a name, falling back to the cid, then '?'. Never throws. */
export function initialsOf(name, cid) {
  const src = (name != null && String(name).trim()) || (cid != null && String(cid).trim()) || '';
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---- DOM builder (browser-only; not imported by the pure tests) ----

/**
 * Build a portrait element (an <img> for a known key, else a coloured silhouette <div>). Called at
 * runtime by the panels layer; assumes `document` exists.
 * @param {Portrait} portrait
 * @returns {HTMLElement}
 */
export function portraitElement(portrait) {
  if (portrait.kind === 'image') {
    const img = document.createElement('img');
    img.className = 'portrait';
    img.src = portrait.src;
    img.alt = '';
    return img;
  }
  const el = document.createElement('div');
  el.className = 'portrait silhouette';
  el.style.background = `linear-gradient(160deg, hsl(${portrait.hue} 45% 32%), hsl(${(portrait.hue + 40) % 360} 40% 18%))`;
  el.textContent = portrait.initials;
  return el;
}
