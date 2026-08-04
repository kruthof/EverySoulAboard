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
import { itemWords, SPEND_NOTHING } from '../wire/messages.js';

/**
 * ⭐⭐ THE PRICE CLAUSE — *what will this order spend?*, in the player's words, or `''` for silence.
 *
 * THE FINDING IT CLOSES (T13, 2026-08-02): the wreck THEN booted with EXACTLY ONE `Parts` unit
 * aboard, the player's first repair order eats it, and nothing on any surface says so. The
 * commissioning chain that needed that Part is then quietly unwinnable, and the player has no way to
 * know which of their orders did it. `invisible-feedback-is-FUNCTIONAL`.
 *
 * THREE OUTCOMES, and the third is a SILENCE rather than a word:
 *   • a kind byte     → `SPENDS 1 PARTS` — one unit, which is the sim's own pinned constant
 *     (`MachineWearSystem.cs:358`, *"exactly one unit of exactly one kind is consumed per service"*).
 *   • `SPEND_NOTHING` → `SPENDS NOTHING` — the empty-handed jury-rig. It is worth saying out loud
 *     rather than leaving blank: "this repair is free" is the reason a player picks THIS machine
 *     first when the ship is down to its last unit, and a blank line reads as "no information".
 *   • anything else   → `''`. That covers `SPEND_UNKNOWN` (an older host, or a machine the sim would
 *     refuse a service to outright) AND an `ItemKind` this client has never heard of. ⛔ IT MUST BE A
 *     SILENCE AND NOT A GUESS: a fabricated `SPENDS 1 PARTS` on a ship with no Parts is worse than
 *     the nothing this package exists to replace, and `itemWords` already answers `''` for a byte it
 *     cannot name rather than splicing a number into prose.
 *
 * ⚠️ IT IS A HINT, NOT A PROMISE, and the same one `GameSession.HandleCommission` writes: *"from what
 * is affordable RIGHT NOW rather than from the command's outcome … a module claimed between this line
 * and the drain still refuses."* A repair order is 9 000 ticks of fetch-and-service and the sim
 * re-runs its fetch funnel at the end of the walk, so the ship's stock can move between this sentence
 * and the spend. Nothing is reserved — `MaintenanceSystem`'s class header refuses reservations
 * deliberately, and a price that claimed to be a promise would be the first step toward one.
 *
 * ⛔ NO NUMBER IS DERIVED HERE. The `1` is prose about a pinned sim constant; the KIND is read off
 * the wire and spelled through `itemWords`, the ONE table this client turns an `ItemKind` byte into
 * words with (pinned equal to `ThawGate.ItemWords` by a test that parses the C#). A second spelling
 * of PARTS on this surface is the M2-18 defect exactly.
 *
 * PURE and TOTAL. @param {number} [spend] a `devices`-channel `spend` element
 * @returns {string} an upper-case clause, or `''` for say-nothing
 */
export function spendClause(spend) {
  if (typeof spend !== 'number' || !Number.isFinite(spend)) return '';
  if (spend === SPEND_NOTHING) return 'SPENDS NOTHING';
  const words = itemWords(spend);
  return words ? 'SPENDS 1 ' + words : '';
}

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
 * `dev` is the `devices`-channel row (`roomDeviceConditions`'s `{tx,ty,kind,cond,oper,open,serv}`)
 * — it answers ALL the questions this function asks of the tile: whether anything is known to stand
 * there, what it is, and (M3-13) whether that kind of machine is EVER serviceable. There is
 * deliberately no second source: a caller that had to supply the tile's ART as well could supply one
 * that disagrees with the row, and then the menu would name one machine and order another.
 *
 * ⭐ M3-13 ADDS A FOURTH OUTCOME'S WORTH OF MEANING TO THE THIRD ONE. `{ok:false, silent:false}` now
 * covers two different truths — "nobody to order" and "nothing to order" — and they are DIFFERENT
 * SENTENCES for the reason RimWorld's menu states a reason at all (§2.2): the first is answered by
 * selecting a pawn, the second can never be answered. What they share is that the menu does not
 * open and the player is told why, which is the shape, not the words.
 *
 * ⭐⭐ AND SINCE "THE ORDER NAMES ITS PRICE" IT ALSO SAYS WHAT THE ORDER WILL SPEND — `spend`, its own
 * field beside `hazard` for the same reason `hazard` is its own field: a caller that wants to render
 * the clauses separately (a two-line menu, a tooltip) must not have to re-split the label.
 *
 * @param {{kind?:number, serv?:number, air?:number, spend?:number}|null} [opts.dev]
 * @param {{dev?:{kind?:number, serv?:number, air?:number, spend?:number}|null, selCid?:number|null, crew?:Array|null}} [opts]
 * @returns {{ok:boolean, silent:boolean, cid:number|null, name:string, label:string, spend:string, hazard:string, reason:string}}
 */
export function prioritiseOffer(opts) {
  const o = opts || {};
  const name = deviceDisplayName(o.dev ? o.dev.kind : undefined);
  if (!o.dev) return { ok: false, silent: true, cid: null, name, label: '', spend: '', hazard: '', reason: '' };
  // ⭐⭐ M3-13 — THE MACHINE IS NEVER SERVICED, SO THERE IS NO ORDER TO OFFER. `serv` is the
  // `devices` channel's own bit (`MaintenanceSystem.IsEverServiceable`, the def's `maint` opt-out);
  // this asks it and derives nothing. It ranks ABOVE the crew question deliberately: "there is
  // nobody to give this order to" is the wrong sentence about a machine that has no order to give.
  //
  // ⚠️ IT SPEAKS RATHER THAN GOING SILENT, and that is `rimworld-reference.md` §2.2 read exactly.
  // RimWorld's menu "greys the entry and states the reason"; this surface's menu is a SINGLE ROW,
  // so a greyed row is an empty box, and the reachable equivalent is the model's existing
  // says-so-in-words outcome. The silent outcome is reserved for a tile that is NOT A TARGET —
  // a right-click on bare floor — and a capsule very much is a target: the player aimed at it.
  //
  // ⛔ THE CONDITION IS `=== 0`, NOT FALSY. `undefined` is what an older host's row yields, and it
  // must mean "offer as before" — see `decodeDevices`. A falsy test would withdraw the verb from
  // every machine aboard the moment a field went missing, which is a silent total loss of the
  // package M2-10 shipped.
  if (o.dev.serv === 0) {
    return {
      ok: false,
      silent: false,
      cid: null,
      name,
      label: '',
      // ⛔ NO PRICE ON A REFUSAL, and `serv` ranking above this is why it is safe to say so: there is
      // no service at this machine on any ship, ever, so there is nothing for a price to be about.
      // The wire still carries a `spend` for this row (the channel reports facts about devices, not
      // answers to one surface's question) and this surface deliberately does not read it.
      spend: '',
      hazard: '',
      reason: name + ' IS NEVER SERVICED — NO REPAIR TO ORDER HERE',
    };
  }
  const who = prioritiseCrew(
    typeof o.selCid === 'number' ? o.selCid : null,
    o.crew,
  );
  if (who.cid == null) {
    return { ok: false, silent: false, cid: null, name, label: '', spend: '', hazard: '', reason: who.reason };
  }
  // ⭐⭐ D4 — THE OFFER NAMES THE HAZARD. IT DOES NOT WITHDRAW THE ORDER.
  //
  // The M3 milestone demo's finding D4: a direct prioritise-repair order into a hall that was still
  // depressurising was accepted, the pawn walked in, and she died — and this menu, the one surface
  // that speaks BEFORE the order exists, said nothing at all. RimWorld's shape (§2.2, and §8.4 rung
  // 3) is that the menu STATES THE REASON and the player still gets to click: the order is the whole
  // contract, and rung 2 walks her in because the player said so. So this is a clause on the label,
  // never a refusal and never a confirm dialog — `ok` stays true and `cid` is unchanged.
  //
  // `air` is the `devices` channel's own bit, asked of `MaintenanceSystem.TryFindStagingTile` host-
  // side. It is READ here and nothing is derived from room numbers: the four bands behind
  // `AtmosphereSafety.IsBreathable` (vacuum, thin air, CO₂, thermal) are the sim's, and re-deriving
  // them client-side is the second authority `WireFormat.Blocked.cs` refuses by name. That is also
  // why the words are NO AIR rather than NO OXYGEN — they have to be true of a fully pressurised
  // room that is merely freezing.
  //
  // ⛔ THE CONDITION IS `=== 0`, NOT FALSY — the same rule `serv` states above with the stakes
  // reversed. `undefined` is what an older host's eight-element row yields and it must mean "offer
  // as before"; a falsy test would stamp a death warning on every machine on the ship the moment the
  // field went missing, and a warning that is always on is a warning nobody reads.
  const hazard = o.dev.air === 0 ? 'NO AIR AT THE WORKSITE — SHE MAY DIE' : '';
  // ⭐⭐ THE ORDER NAMES ITS PRICE. Same shape as the hazard clause above and for the same reason: the
  // menu is the one surface that speaks BEFORE the order exists, so it is the only place a cost can
  // be stated in time to change the player's mind. It is a CLAUSE, never a refusal and never a
  // confirm — `ok` stays true and `cid` is unchanged, exactly as D4 left it.
  //
  // ⛔ NOTE WHAT IS *NOT* TESTED HERE: there is no `=== 0` rule for this element, because `spend`'s
  // absent value is a SENTINEL rather than a meaningful 0. `spendClause` is total over every input —
  // `undefined`, an old host's missing element, a kind this client cannot name — and answers `''`,
  // which is the same silence the surface had before the element existed.
  const spend = spendClause(o.dev.spend);
  // ⚠️ PRICE FIRST, HAZARD LAST, AND THE ORDER IS A DECISION. The hazard is life-and-death and the
  // price is arithmetic, so the hazard keeps the end of the line — the position a reader's eye lands
  // on last and the position it held alone before this clause existed. Inserting the price AFTER it
  // would push `SHE MAY DIE` into the middle of a sentence about inventory.
  return {
    ok: true, silent: false, cid: who.cid, name,
    label: 'PRIORITISE: REPAIR ' + name + (spend ? ' · ' + spend : '') + (hazard ? ' · ' + hazard : ''),
    spend,
    hazard,
    reason: '',
  };
}
