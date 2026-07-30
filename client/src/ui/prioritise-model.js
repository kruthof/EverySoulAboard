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
// Both are pure, and the caller supplies exactly THREE things: the `devices` row, the selection and
// the roster. The row answers both halves of question 1 — whether anything is known to stand there
// AND what it is — so there is no fourth argument carrying the tile's ART. There was one, and it was
// the bug: see `deviceDisplayName`.
//
// ⚠️ THE MENU MUST NOT PROMISE AN ORDER THE SIM CANNOT TAKE. The host resolves the clicked tile to a
// device and refuses a tile with none, so a menu offered on a bare or FOGGED tile is a button that
// looks live and does nothing — `invisible-feedback-is-FUNCTIONAL` pointing the other way. The
// `devices` channel is fog-gated host-side (`GameSession.BuildDevices` gates on `TileFlags.Explored`),
// so "no row" covers BOTH cases with one condition, and it is deliberately the ONLY device test here:
// reading the frame glyph as a second opinion would offer the menu on exactly the tiles the host
// refuses. That is `doOperate`'s measured lesson (`vent_ls` at 35,6,0) inverted.

import { deviceKindName } from './room-model.js';

/**
 * The player-facing name for the machine standing on a tile, from the `devices` channel's own `kind`
 * byte — the SIM'S IDENTITY for the thing, not the picture drawn over it. `WaterTank` → `WATER TANK`.
 *
 * ⚠️ THE PARAGRAPH THAT STOOD HERE IS QUOTED AND RETRACTED, because it asserted a measurement that
 * was FALSE and then built a design on it. It read: *"IT NAMES THE PICTURE, NOT THE SIM'S DEVICE …
 * nothing else on the wire carries a device identity at all. So v1 names the machine the player is
 * looking at, which has one property a kind-table would not: it can never disagree with the sprite
 * under the cursor."* **The wire carries `kind` on every `devices` row** — it survives `decodeDevices`
 * (`wire/messages.js`) and `roomDeviceConditions` keeps it on the very object this module is handed —
 * and `room-model.js`'s `OPERABLE_NAME_BY_KIND` was already the surface's idiom for turning it into a
 * name. The claimed property was not a virtue either: agreeing with the sprite is EXACTLY the bug,
 * because `items/glyph-map.js`'s `GLYPH_SUBSTITUTE` deliberately makes six kinds wear another piece's
 * art. Measured on the shipped tables, the retracted version named these FIVE CONFIDENTLY WRONG:
 *   WaterTank → "OXYGEN TANK" · Radiator → "SPACE HEATER" · SalvageRecycler → "WATER RECYCLER" ·
 *   MedCabinet → "LOCKER" · IceMelter → "COOKER".
 * ⚠️ FIVE, NOT SIX — corrected by RUNNING the guard rather than by counting the substitution ledger,
 * which is the same class of error this whole paragraph exists to retract. `GLYPH_SUBSTITUTE` has six
 * rows and the sixth is `Light` → `wall-lamp`, which is COSMETIC: the old `functional`-only check DID
 * refuse that one and answered the honest "MACHINE". That single kind was the entire reach of the
 * check, and it is exactly why it LOOKED like a sixth-trap defence while being none — the other five
 * are FUNCTIONAL wearing FUNCTIONAL and it admitted them without a murmur. The test meant to catch
 * this drove RESOURCE and COSMETIC pieces only (`CLAUDE.md` trap, 4th shape — a scope filter that
 * excludes the violation), so it was green on all five.
 *
 * ⚠️ WHAT REMAINS TRUE, NARROWED TO ITS TRUE HALF: the AUTHORED INSTANCE name — `wing_c`,
 * `battery_2`, the charter's own example — is a `Device.Name` written in `sim/Sim.Gen/AuthoredShips.cs`
 * that reaches no channel, so THAT still needs a host change. The TYPE name needs none and is here.
 *
 * PURE and TOTAL: an absent/unknown/garbage byte answers `MACHINE` rather than a confident guess.
 * @param {number} [kind] a `devices`-channel `DeviceKind` byte
 * @returns {string} an upper-case display name, never empty
 */
export function deviceDisplayName(kind) {
  const name = deviceKindName(kind);
  if (!name) return 'MACHINE';
  // camelCase → SPACED CAPS, so `SalvageRecycler` reads as three words a player can say out loud.
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase();
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
 * `dev` is the `devices`-channel row (`roomDeviceConditions`'s `{tx,ty,kind,cond,oper,open}`) — it
 * answers BOTH questions this function asks of the tile: whether anything is known to stand there,
 * and what it is. There is deliberately no second source: a caller that had to supply the tile's ART
 * as well could supply one that disagrees with the row, and then the menu would name one machine and
 * order another.
 *
 * @param {{dev?:{kind?:number}|null, selCid?:number|null, crew?:Array|null}} [opts]
 * @returns {{ok:boolean, silent:boolean, cid:number|null, name:string, label:string, reason:string}}
 */
export function prioritiseOffer(opts) {
  const o = opts || {};
  const name = deviceDisplayName(o.dev ? o.dev.kind : undefined);
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
