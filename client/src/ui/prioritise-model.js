// M2-10 — THE PRIORITISE-REPAIR OFFER: the two PURE decisions behind the Room Zoom's right-click
// menu, kept out of `roomzoom-view.js` for the reason that file's own header states — *"All
// non-trivial derivations are the PURE room-model.js (node-tested); this file is DOM glue."* It is a
// NEW module rather than three more exports on `room-model.js` because that file is the busiest
// shared surface in the client and M2-10 lands beside a concurrent sim/host lane; a new file cannot
// collide with anything.
//
// TWO QUESTIONS, AND THEY ARE DIFFERENT KINDS OF QUESTION:
//   1. IS THERE ANYTHING HERE TO ORDER WORK ON — answered from the `devices` channel row ALONE.
//   2. WHO WOULD DO IT — answered from the selection, with a one-crew fallback (see below).
// Both are pure; the caller supplies the row, the frame's item id, the selection and the roster.
//
// ⚠️ THE MENU MUST NOT PROMISE AN ORDER THE SIM CANNOT TAKE. The host resolves the clicked tile to a
// device and refuses a tile with none, so a menu offered on a bare or FOGGED tile is a button that
// looks live and does nothing — `invisible-feedback-is-FUNCTIONAL` pointing the other way. The
// `devices` channel is fog-gated host-side (`GameSession.BuildDevices` gates on `TileFlags.Explored`),
// so "no row" covers BOTH cases with one condition, and it is deliberately the ONLY device test here:
// reading the frame glyph as a second opinion would offer the menu on exactly the tiles the host
// refuses. That is `doOperate`'s measured lesson (`vent_ls` at 35,6,0) inverted.

import { ITEMS } from '../items/index.js';

/**
 * The player-facing name for the machine standing on a tile, derived from the REGISTRY PIECE the
 * surface is already drawing there — 'solar-panel' → `SOLAR PANEL`.
 *
 * ⚠️ IT NAMES THE PICTURE, NOT THE SIM'S DEVICE, AND THAT IS A STATED LIMIT — the charter's example
 * label is *"Prioritise: repair `wing_c`"* and **`wing_c` cannot be produced by any client**. A
 * `Device.Name` is authored in `sim/Sim.Gen/AuthoredShips.cs` and reaches NO wire channel: the
 * `devices` channel's tuple is `[x, y, deck, kind, cond, oper, open]` (`WireFormat.Devices.cs`), and
 * nothing else on the wire carries a device identity at all. So v1 names the machine the player is
 * looking at, which has one property a kind-table would not: **it can never disagree with the sprite
 * under the cursor**, because it is derived from the same id `furnitureSvg` passed to `buildTileItem`.
 * (Filed for the owner: naming the authored device needs a host change, not a client one.)
 *
 * ⚠️ THE `functional` CHECK IS THE SIXTH-TRAP DEFENCE and it is not decoration. `GLYPH_SUBSTITUTE`
 * lets a device wear another piece's art, and `itemForGlyph` will happily resolve a RESOURCE piece on
 * a tile that also holds a device — so an unguarded join could label a scrubber `REGOLITH`. A piece
 * the registry does not class as `functional` is not evidence about what is installed, so the answer
 * falls back to the honest generic word rather than to a confident wrong one.
 *
 * PURE and TOTAL: any unknown/absent/garbage id answers `MACHINE`.
 * @param {string} [itemId] a `client/src/items/index.js` registry key
 * @returns {string} an upper-case display name, never empty
 */
export function deviceDisplayName(itemId) {
  const row = typeof itemId === 'string' && itemId ? ITEMS[itemId] : null;
  if (!row || row.kind !== 'functional') return 'MACHINE';
  return itemId.replace(/-/g, ' ').toUpperCase();
}

/**
 * WHO the order would be given to, from the Room Zoom's own selection with a ONE-CREW fallback.
 *
 * ⚠️ THE FALLBACK IS THE INTEGRATOR'S SMALLEST-REVERSIBLE INTERIM (2026-07-30) AND IT IS FLAGGED FOR
 * THE OWNER, not settled here. `--ship wreck` is a ONE-PAWN ship and the opening beat is *"order a
 * repair, the lights come back"* — requiring a selection ritual before the game's first order would
 * put a step in front of the exact moment M2 exists to produce. So: with nothing selected and exactly
 * one soul aboard, she is the one. With nothing selected and SEVERAL, the client refuses and says so
 * in words rather than guessing — picking `crew[0]` would be a silent wrong-pawn order, which is the
 * defect `zoom-pawn.test.js`'s RYN fixture was built to catch on the other selection path.
 *
 * ⚠️ "LIVING" IS THE HOST'S WORD, NOT A FILTER APPLIED HERE. `GameSession.BuildRoster` opens with
 * `if (c.Dead) continue;`, so the roster channel is already the living crew and a second predicate
 * here would be a client-side mirror of a rule it cannot see. What IS filtered is a row with no
 * usable `cid` — a malformed row must never be counted toward "exactly one" and then handed to the
 * wire as `undefined | 0`, which is cid 0, which is the host's own NOBODY sentinel.
 *
 * PURE. @param {number|null} selCid  `selectedCrewCid(frame)` @param {Array|null} crew  roster crew
 * @returns {{cid:number|null, reason:string}} `cid` null ⇒ `reason` says why, in words
 */
export function prioritiseCrew(selCid, crew) {
  if (typeof selCid === 'number' && Number.isFinite(selCid)) return { cid: selCid, reason: '' };
  const list = (Array.isArray(crew) ? crew : [])
    .filter((c) => c && typeof c.cid === 'number' && Number.isFinite(c.cid));
  if (list.length === 1) return { cid: list[0].cid, reason: '' };
  if (list.length === 0) return { cid: null, reason: 'NO CREW ABOARD TO GIVE THIS ORDER TO' };
  return {
    cid: null,
    reason: 'NO CREW SELECTED — CLICK A PAWN OR A CREW ROW, THEN RIGHT-CLICK THE MACHINE',
  };
}

/**
 * THE WHOLE OFFER, in one pure call: may the Room Zoom open its menu on this tile, and what does the
 * one row say?
 *
 * The three outcomes are deliberately distinct, because two of them are silences and only one of them
 * is honest:
 *   • `{ok:true, cid, name, label}` — open the menu.
 *   • `{ok:false, silent:true}`  — this tile is NOT A TARGET (nothing known standing on it). Say
 *     nothing: a right-click on bare floor is not an intent aimed at anything, and a toast on every
 *     stray right-click is noise that trains the player to ignore the toast that matters.
 *   • `{ok:false, silent:false, reason}` — this tile IS a target and there is nobody to order.
 *     ⭐ THIS ONE MUST SPEAK. It is the `doMove` shape exactly: an order that looks identical whether
 *     it worked or not is indistinguishable from a broken verb, and the host's own refusal for a
 *     missing selection lands in `_status`, which this surface renders nowhere.
 *
 * @param {{dev?:object|null, itemId?:string, selCid?:number|null, crew?:Array|null}} [opts]
 * @returns {{ok:boolean, silent:boolean, cid:number|null, name:string, label:string, reason:string}}
 */
export function prioritiseOffer(opts) {
  const o = opts || {};
  const name = deviceDisplayName(o.itemId);
  if (!o.dev) return { ok: false, silent: true, cid: null, name, label: '', reason: '' };
  const who = prioritiseCrew(
    typeof o.selCid === 'number' ? o.selCid : null,
    o.crew,
  );
  if (who.cid == null) {
    return { ok: false, silent: false, cid: null, name, label: '', reason: who.reason };
  }
  return {
    ok: true, silent: false, cid: who.cid, name,
    label: 'PRIORITISE: REPAIR ' + name,
    reason: '',
  };
}
