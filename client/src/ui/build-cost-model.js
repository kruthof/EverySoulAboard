// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ THE PALETTE'S PRICE AND ITS REFUSALS — the pure half of "every build button answers honestly".
//
// ⛔ THE DEFECT THIS FILE EXISTS FOR, in the owner's words (live play, 2026-08-03): *"I cannot build
// anything except the walls."* Driven audit the same night found the cause, and it is not a broken
// verb. The seven furniture tools (BUNK/DESK/CHAIR/LOCKER/LAMP/PLANT/HEATER) are FULLY WIRED —
// `Cmd.place` → `GameSession.HandlePlace` → `PlaceDeviceCommand`, which since E0-5 WP-3 charges
// `defs.Build.DevicePlaceCost` = 3 PARTS (`sim/Sim.Core/Commands/Commands.cs`, the `TryPay` line).
// `--ship wreck` boots holding ONE Parts unit against a price of THREE, so every furniture click on
// the shipped ship is refused for want of matter from the first tick — 1 < 3, with nothing else
// having to happen.
// ⚠️ AN EARLIER DRAFT OF THIS PARAGRAPH SAID `MaintenanceSystem` HAS SPENT THAT UNIT BY ~TICK 201,
// AND THAT IS FALSE OF THE STATE THE PLAYER ACTUALLY BOOTS INTO (corrected 2026-08-04, measured
// twice by independent agents). The tick-201 figure is `MECHANICS.md` §(cryo-pod maint) reporting an
// UNATTENDED sim-day with the work grid granted; under OD-H every work type boots OFF, and
// `MaintenanceSystem.HasClaimableWork` refuses at `!citizen.CanTakeWorkType(WorkType.Repair)`
// (`MachineWearSystem.cs:534`, and `FindNearestReachableIdle`'s same check at :598). So on the
// shipped wreck no Maintain job is ever claimed and the Parts unit is NOT spent until the player
// grants Repair. The defect this file exists for is UNAFFECTED — the price is 3 and the census is 1
// either way — but the drain is a consequence of the player's first work grant, not of the clock.
// So every furniture click on the shipped ship is refused for want of matter, and the refusal is a
// SILENT NO-OP end to end: the sim returns, the host writes `_status = "place bunk"` whether it
// worked or not, no toast fires, and the Room Zoom shows no price and no Parts balance anywhere.
// The player is left with a button that looks armed, pulses, and does nothing — which is this repo's
// `invisible-feedback-is-FUNCTIONAL` rule with the cause in a def value rather than in a renderer.
// `GameSession.HandlePlace`'s own doc comment predicted this exact complaint and named the fix as
// "a client-side affordance (price on the palette, a refusal reason on the status line)". This is it.
//
// ⚠️ WHERE THE PRICE'S AUTHORITY LIVES, AND WHY THERE IS A LITERAL HERE ANYWAY. The authority is
// `content/core/SimDefs/build.def`'s `device_place_cost` (parsed at `DefsParser.cs`, defaulted in
// `SimDefs.CreateDefault`, folded into determinism pins P4/P5). NO WIRE CHANNEL CARRIES IT — the
// `ledger` channel carries the matter CENSUS and the `metrics` channel loose material units, but no
// message on this socket carries a build def, and adding one to price a button is a spine change
// (`WireFormat`) for a constant that has moved once in the project's life. So the client mirrors the
// value, and mirroring is only safe when it is PINNED, so it is pinned the way `BLOCKED_ORDER_NAMES`
// is pinned: `client/test/palette-honesty.test.js` reads the def file AND `SimDefs.cs`'s default and
// requires all three to agree — derived from the authority, never hand-copied. That precedent exists
// because the hand-copied `deepEqual` half of the blocked-names pin could not see the hole that
// shipped for four days (`client/test/blocked-model.test.js`, the ⭐⭐ paragraph).
//
// ⛔ THE STOCK NUMBER IS AN UPPER BOUND, AND THAT ASYMMETRY IS THE WHOLE SAFETY ARGUMENT. The
// client reads Parts from the `ledger` channel, whose census (`ShipLedger.Sample`) walks EVERY item
// stack — including stacks a crew member is carrying and stacks a job has reserved. The sim spends
// through `LooseMatter.Affordable`, which counts only stacks with `CarriedBy == 0 && ReservedBy == 0`.
// So `loose <= aboard`, ALWAYS, and therefore:
//   • `aboard < cost` ⇒ `loose < cost` ⇒ the sim WILL refuse — of the SNAPSHOT this file was handed.
//   • `aboard >= cost` with the loose subset short ⇒ the sim refuses and this file says nothing —
//     the pre-existing silent no-op, NARROWED but not closed. FILED, not hidden (see the report).
// The inequality only runs one way, so the sentence this file produces is sound and incomplete,
// which is the correct direction for a claim made about somebody else's rule.
//
// ⚠️ BUT THE SNAPSHOT IS NOT THE INSTANT, AND AN EARLIER DRAFT OVERSTATED THIS AS "a refusal
// sentence here is never wrong" (corrected 2026-08-04, review). The census the client holds is the
// last `ledger` message, and the host re-samples it only when a render pass finds a WALL SECOND has
// elapsed (`GameSession.cs:2027`, `force || nowWall - _ledgerAtWall >= 1.0`) — so at the wire's
// 10 Hz it refreshes every ~10–12 ticks, ≈1.0–1.2 s, and NOTHING forces a fresh census on a place
// command (`force` is the connect-time prime, not a per-command flag). Inside that window a hauler
// can drop the third Parts unit, `TryPay` succeeds, and this file will still have toasted `NEEDS 3
// PARTS — SHIP HAS 1` beside a placement that WORKED. The error is benign and self-correcting: the
// command always goes (see below), the furniture appears, and the next census silences the row — so
// the failure mode is one stale sentence, never a withheld build. It is stated here rather than
// engineered away because closing it means gating the send on a fresh census, which is exactly the
// silent refusal this package deletes.
//
// ⚠️ AND THE CLIENT NEVER GATES THE WIRE. `roomzoom-view.js` sends `Cmd.place` unconditionally and
// then speaks; it does not withhold the command on this file's say-so. The ledger refreshes at ≤1 Hz
// (`GameSession`'s `_ledgerAtWall` cadence), so a census up to a second stale that gated the send
// would REFUSE A LEGAL PLACEMENT — re-creating the silent no-op this package deletes, from the other
// side. The host stays the only authority on whether a placement happens; this file only says what
// the player is owed when it plainly cannot.
//
// PURE: no DOM, no wire, no imports beyond the palette's own table. ASCII only, InvariantCulture
// (integers only — nothing here formats a float).
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { paletteCommand, TOOL_LABEL } from './room-model.js';

/**
 * PARTS consumed to place ONE piece of furniture. MIRRORS `content/core/SimDefs/build.def`'s
 * `device_place_cost` (and `SimDefs.CreateDefault`'s `DevicePlaceCost = 3`); pinned against BOTH by
 * `client/test/palette-honesty.test.js`. If you retune the def, that test reddens — move this line
 * in the same commit, exactly as a def field's one-commit ritual requires.
 */
export const DEVICE_PLACE_COST_PARTS = 3;

/** The consumable the price is quoted in — `PlaceDeviceCommand.Currency` is `ItemKind.Parts`, and
 *  this is the word the `ledger` island and the order's own SPENDS clause already use. */
export const PLACE_CURRENCY_WORD = 'PARTS';

/** The separator every palette sentence uses, matching the sweep toast's `WALL ▸ 5 TILES`. */
const SEP = ' ▸ ';

/** What a cosmetic tool says when clicked. ⛔ SHELF and RUG reach NO SIM AT ALL: the Room Zoom wrote
 *  them into a module-local `_decor` array and the host's `BuildDecor()` returns a permanently empty
 *  static list, so they drew local art for a piece of furniture the ship did not have and could not
 *  save. That is worse than a dead button — it is a button that LIES. M4-6 owns the wire-or-remove
 *  decision (owner's, not ours); until it rules, they stop pretending and say what they are. */
export const DECOR_NOT_WIRED = 'NOT BUILDABLE YET — DECOR IS NOT IN THE SIM';

/** The two-word form of the same fact, for the chip's own cost line (the palette is ~55 px wide per
 *  button — measured, see `client/tools/palette-honesty-shot.mjs`; the sentence goes in the detail
 *  row and the `title`, never on the chip). */
export const DECOR_CHIP_TEXT = 'NOT YET';

/** True for a tool that spends PARTS to place a device (the `functional` palette class). PURE. */
export function isPlaceTool(tool) {
  return paletteCommand(tool).cls === 'functional';
}

/** True for a tool that draws cosmetic decor and reaches no sim (SHELF / RUG). PURE. */
export function isDecorTool(tool) {
  return paletteCommand(tool).cls === 'cosmetic';
}

/** PARTS this tool spends per click — the place cost for furniture, 0 for everything else (a wall's
 *  material is `BuildSystem`'s haul, a designation costs nothing, decor reaches no sim). PURE. */
export function toolPlaceCost(tool) {
  return isPlaceTool(tool) ? DEVICE_PLACE_COST_PARTS : 0;
}

/** Parts aboard, defensively read: a missing/NaN census is 0, which is what a sparse list means. */
function units(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Can the ship PROVABLY not pay for this tool's placement? True only when the census — an upper
 * bound on what is spendable (see the header) — is already short. Non-place tools are never
 * unaffordable. PURE.
 */
export function placeIsUnaffordable(tool, partsAboard) {
  const cost = toolPlaceCost(tool);
  return cost > 0 && units(partsAboard) < cost;
}

/** The chip's own second line: `3 PARTS` for furniture, `NOT YET` for decor, '' otherwise. PURE. */
export function chipCostText(tool) {
  if (isPlaceTool(tool)) return DEVICE_PLACE_COST_PARTS + ' ' + PLACE_CURRENCY_WORD;
  if (isDecorTool(tool)) return DECOR_CHIP_TEXT;
  return '';
}

/**
 * THE REFUSAL SENTENCE — what a click that the ship cannot pay for says out loud. '' when the tool
 * is not a placement or when the census does not prove a refusal, because a toast is only owed where
 * the surface KNOWS. Wording mirrors the commission/offer price family (MECHANICS §13.41.5):
 * name the thing, name the price, name the stock. PURE.
 *
 *   `BUNK ▸ NEEDS 3 PARTS — SHIP HAS 1`
 */
export function placeRefusalText(tool, partsAboard) {
  if (!placeIsUnaffordable(tool, partsAboard)) return '';
  return (TOOL_LABEL[tool] || String(tool || '').toUpperCase()) + SEP +
    'NEEDS ' + toolPlaceCost(tool) + ' ' + PLACE_CURRENCY_WORD +
    ' — SHIP HAS ' + units(partsAboard);
}

/** What a SHELF/RUG click says. '' for every other tool. PURE. */
export function decorRefusalText(tool) {
  if (!isDecorTool(tool)) return '';
  return (TOOL_LABEL[tool] || String(tool || '').toUpperCase()) + SEP + DECOR_NOT_WIRED;
}

/**
 * ⭐⭐ THE SIM'S OWN REFUSAL, PUT INTO WORDS — `PlaceRefusal` (sim) → the player's sentence.
 *
 * ⛔ THE CLIENT OWNS THE WORDS AND THE SIM OWNS THE CODE, which is `BLOCKED_REASON_TEXT`'s split
 * (`client/src/wire/messages.js`) applied to a second channel rather than a new idea. The sim never
 * sends prose; this table is the one place the vocabulary lives.
 *
 * ⛔ AND THERE IS NO DEFAULT SENTENCE FOR AN UNKNOWN CODE — see `placeRefusedText`. A `reason` this
 * client has not heard of gets an honest "this client does not know why", never a plausible guess:
 * the whole defect being closed is a refusal the player cannot act on, and a wrong sentence is worse
 * than an admitted gap.
 *
 * ⚠️ THE KEYS MIRROR `Perilune.Sim.PlaceRefusal` AND NOTHING ACROSS THAT SEAM COMPILES. Pinned equal
 * by `client/test/build-feel.test.js`, which PARSES `sim/Sim.Core/Events/SimEvents.cs` — the house
 * tripwire idiom (`marks-model.test.js` parses `WireFormat.Marks.cs`, `palette.test.js` parses
 * `GlyphColor.cs`). `None = 0` is deliberately ABSENT: it is never published, and giving it a
 * sentence would make the no-default-reason rule unobservable here.
 */
export const PLACE_REFUSAL_TEXT = {
  1: 'THAT PIECE CANNOT BE PLACED BY HAND',
  2: 'THAT IS OFF THE SHIP',
  // ⛔ 3 AND 4 SWAPPED JOBS ON 2026-08-06, AND THE OLD 3 IS THE SENTENCE THE OWNER REPORTED.
  // `NotWalkable` used to be asked before the two causes that SET it, so every wall in the game
  // answered "NOBODY COULD STAND HERE" — 552 of them on the wreck, measured, with reason 4 dead.
  // The order is fixed in `PlaceDeviceCommand.Execute`; these two words follow it. 3 is now the
  // corrupt-state backstop its sim doc describes, and it is deliberately NOT worded like 5
  // ("SOMETHING IS ALREADY STANDING HERE") — the two used to be tellable apart only by their code.
  3: 'THIS TILE CANNOT BE WALKED ON',
  4: 'THIS IS A WALL',
  5: 'SOMETHING IS ALREADY STANDING HERE',
  // 6 (CannotPay) is composed from the two numbers on the wire — see `placeRefusedText`.
  7: 'A BLUEPRINT IS ALREADY WAITING ON THIS TILE',
  8: 'TOO MANY THINGS QUEUED — FINISH OR CANCEL ONE FIRST',
  9: 'THERE IS NO FLOOR HERE — THAT IS OPEN SPACE',
};

/**
 * THE SENTENCE FOR ONE `placerefused` MESSAGE. `msg` is the decoded wire object
 * `{kind, reason, price, affordable}`; `toolLabel` is what the player pressed, or '' .
 *
 * ⭐ THE `CannotPay` ARM IS COMPOSED FROM THE WIRE'S OWN NUMBERS RATHER THAN FROM THE LEDGER, and
 * that is the half `placeRefusalText` above cannot do. The ledger totals every Part ABOARD;
 * `PlaceDeviceCommand.TryPay` spends only LOOSE, UNRESERVED stacks. A ship whose three Parts are in
 * a hauler's arms reads rich on the ledger and refuses in the sim — "it works on some tiles and not
 * others" with no tile involved at all — and only the sim knows the smaller number.
 *
 * PURE. Returns '' for nothing sayable, and the caller must never `toast('')` (an empty box unhidden
 * for 2.6 s reads as a glitch — overview-view.js's own rule).
 */
export function placeRefusedText(msg, toolLabel) {
  if (!msg) return '';
  const lead = toolLabel ? String(toolLabel).toUpperCase() + SEP : '';
  const reason = Number(msg.reason);
  if (reason === 6) {
    return lead + 'NEEDS ' + units(msg.price) + ' ' + PLACE_CURRENCY_WORD +
      ' WITHIN REACH — ONLY ' + units(msg.affordable) + ' IS LOOSE ABOARD';
  }
  const words = PLACE_REFUSAL_TEXT[reason];
  // ⛔ NO FALLBACK PROSE. An unknown code is a client that is behind the sim, and saying so is the
  // only honest answer available — the same shape `console-model.js` ships for a blocked row it
  // cannot name ('STUCK — REASON UNKNOWN TO THIS CLIENT').
  return lead + (words || 'REFUSED — REASON UNKNOWN TO THIS CLIENT');
}

/**
 * THE ARMED DETAIL ROW — the price and stock, in words, for the tool the player is holding. Null
 * for every tool that spends nothing and lies about nothing, so the row stays hidden.
 *
 * ⚠️ IT ANSWERS BEFORE THE CLICK, and that is the point rather than a bonus. The refusal toast tells
 * a player why the thing they just did failed; this row tells them it will fail while they still
 * have the tool in hand — which is the difference between a game that explains itself and a game
 * that apologises. It is a SIBLING of `#rz-matstrip` and `#rz-accepts` in every sense (same wrapper,
 * same reveal-on-arm rule, same "the options belonging to the armed tool" job) and is mutually
 * exclusive with both — materials are WALL/FLOOR, accepts is STOCKPILE, this is furniture/decor —
 * so it costs the wrapping palette ZERO net height. That exclusivity was the deciding argument for
 * the ACCEPTS row too; see its markup comment.
 *
 * @returns {{text:string, level:''|'fault'}|null}
 */
export function paletteCostRow(tool, partsAboard) {
  if (isDecorTool(tool)) return { text: decorRefusalText(tool), level: 'fault' };
  if (!isPlaceTool(tool)) return null;
  const refusal = placeRefusalText(tool, partsAboard);
  if (refusal) return { text: refusal, level: 'fault' };
  return {
    text: (TOOL_LABEL[tool] || String(tool).toUpperCase()) + SEP +
      DEVICE_PLACE_COST_PARTS + ' ' + PLACE_CURRENCY_WORD +
      ' · ' + units(partsAboard) + ' ABOARD',
    level: '',
  };
}

/** The chip's hover `title`: the full sentence, so the price is readable without arming. '' for a
 *  tool that has neither a price nor a lie to own up to. PURE. */
export function chipTitleText(tool, partsAboard) {
  const row = paletteCostRow(tool, partsAboard);
  return row ? row.text : '';
}
