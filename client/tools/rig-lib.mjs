// rig-lib.mjs — THE SHARED PRECONDITION MACHINERY FOR THE BROWSER RIGS (2026-08-03, INFRA).
//
// ⛔ WHY THIS FILE EXISTS. `client/tools/*.mjs` is 39 hand-written rigs and NOTHING GATES THEM: they
// are the demo instruments and the only place several product claims are ever checked, and every one
// of them re-implements the same three preconditions by hand — dismiss the onboarding card, select a
// crew member, open a room. Session F's `why-line-shot.mjs` package proved that shape wrong in the
// most expensive way available: an unverified fire-and-forget click reddened a rig 1 run in 3 while
// the product was fine, AND the same missed click made a downstream overflow leg pass VACUOUSLY. A
// rig that coin-flips red teaches a lane to distrust its instruments; a rig that passes vacuously
// teaches it something false. Both are gate problems, four days before a playtest.
//
// SO THE HOUSE PATTERN LIVES HERE ONCE. It is `why-line-shot.mjs`'s, ported verbatim in shape:
//   · WAIT FOR A CONDITION, NEVER FOR A CLOCK — `waitFor`, hard bound, LOUD exit naming what never
//     appeared and what was there instead.
//   · RE-DERIVE THE TARGET FROM THE CURRENT FRAME BEFORE EVERY RE-CLICK — `verifiedClick`. A cached
//     rectangle is a bet on a pawn that is walking, and a missed click never resolves by waiting.
//   · VERIFY WHAT THE CLICK ACTUALLY HIT — `settled` is frame-derived truth (the HOST's answer),
//     never "we sent the gesture".
//   · AND VERIFY WHAT IT DID *NOT* HIT — `deviceOpenState`/`actuationDiff`. See the hazard below.
//
// ⛔⛔ THE PRODUCT-ADJACENT HAZARD A RETRY LOOP CREATES, and it is why `verifiedClick` carries a
// witness rather than just a bound. `Cmd.click(x,y)` reaches `GameSession.ContextAction`
// (GameSession.cs:475), whose SECOND arm — reached whenever no citizen is on the clicked tile —
// TOGGLES THE DEVICE STANDING THERE (`SetDoorStateCommand` / `SetDeviceStateCommand`,
// GameSession.cs:1936-1958). And the client's crew-row / pawn gesture sends exactly that command at
// the pawn's LAST-FRAME tile (`crewClickTarget`, console-model.js:166 ← `crewRowClick`,
// hud.js:940). So a rig that re-clicks a walking pawn can ACTUATE THE SHIP IT IS ABOUT TO
// PHOTOGRAPH — a green run whose screenshots are of a state the rig itself caused.
//
// ⭐ HOW REACHABLE, MEASURED RATHER THAN ASSUMED (2026-08-03) — because the first draft of this
// header got it wrong and said "doors and vents are MOSS-gated, every other kind is not". BOTH
// commands open with `if (!MossGate.IsServerLive(sim)) return;` (Commands.cs:84 and its
// SetDoorState sibling); ContextAction's `actuates` flag governs only the STATUS LINE. So:
//   · ON THE SHIPPED WRECK AT BOOT THE HAZARD IS SHUT. One `Cmd.click` sent at every one of the 49
//     deck-0 device tiles moved NOTHING (`open` unchanged on all 49) — MOSS boots dark there
//     (`term_moss` at 0.14 against Terminal's 0.20 maintain floor).
//   · ⛔ ON A SHIP WHOSE MOSS IS LIVE IT LANDS, and doors are the loud case: the same sweep on
//     `--ship grid` (its `term_hydro` is 1.000, so the gate is open before the first tick) SHUT
//     EIGHT DOORS — `device kind 0 at 5,7,0: open 1 → 0`, and seven more. The wreck REACHES that
//     state by design the moment the player repairs `term_moss`, which is the game's own ladder and
//     the first thing a playtest does.
// The witness is therefore not decoration: it is quiet today and it will bite tomorrow, and a rig
// that could not tell the difference would report a mutated ship as a clean run.
//
// ⚠️ EVERY FATAL PATH KILLS CHROME. Measured 2026-08-02 (why-line-shot.mjs's header): two leaked
// headless instances at ~290 MB each got another agent's `dotnet test` OOM-killed as exit 137, which
// reads exactly like a suite crash. A helper that `process.exit`s on behalf of twelve callers would
// have industrialised that leak, so every exit here takes the caller's `chrome` handle.

/** Sleep. Deliberately NOT exported as a precondition tool — see `waitFor`. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kill the caller's Chrome, if it gave us one. Never throws — the handle may already be dead. */
function killChrome(chrome) { try { if (chrome) chrome.kill('SIGKILL'); } catch { /* already gone */ } }

/**
 * ⛔ THE ONE WAY OUT OF A RIG THAT HAS A BROWSER OPEN — say why, kill Chrome, exit.
 *
 * ⚠️ IT EXISTS BECAUSE THE HANDWRITTEN VERSION WAS NOT APPLIED EVENLY, and the gap was measured
 * rather than assumed (2026-08-03, review of this lane): of the exits in the three hardened rigs,
 * the `if (!wsUrl)` and end-of-run paths killed the handle and FIVE DID NOT — the three
 * `captureScreenshot returned nothing` guards plus zoom-pawn's two "no node for this selector"
 * guards. Every exit ABOVE each file's `spawn` is safe by construction (there is no browser yet),
 * which is why the count is five and not eleven.
 *
 * ⛔ A LEAK HERE IS NOT THIS RIG'S PROBLEM, IT IS SOMEBODY ELSE'S GATE. Measured 2026-08-02: two
 * leaked headless instances at ~290 MB each were enough to get another agent's `dotnet test`
 * OOM-killed — SIGKILL, exit 137, which reads exactly like a test-suite crash. The failure lands on
 * a lane that did nothing wrong and cannot see the cause. This package's whole stated motivation is
 * that shape, so leaving five of its own exits outside the kill path would have been the "guard
 * that cannot catch its own subject" (4th shape) one more time.
 *
 * ⭐ DRIVEN AS A 2x2, not asserted (2026-08-03). The failure was planted AT THE SEAM rather than by
 * forcing the branch — `Page.captureScreenshotNOPE` is not a CDP method, so the call really does
 * come back without `result.data` and the guard fires as it would on a real capture failure:
 *   · PRE-FIX bare `process.exit(6)` → exit 6, and TEN Chrome processes survived the run, ~1.5 GB
 *     resident between them (parent 10758 re-parented to init, plus its helpers). That is one run.
 *   · SHIPPED `die(chrome, 6, …)`   → exit 6, the SAME sentence on stderr, and ZERO survivors.
 * Same plant, same exit code, same message: the only variable is the handle being killed.
 */
export function die(chrome, code, message) {
  console.error('FAIL: ' + message);
  killChrome(chrome);
  process.exit(code);
}

/**
 * ⭐ WAIT FOR A CONDITION, NEVER FOR A CLOCK (why-line-shot.mjs's `waitFor`, shared).
 *
 * Every `sleep(n)` standing in for a precondition is a BET that a cold `dotnet`, a cold Chrome, a
 * cold module graph and two websockets all finish inside `n` ms on a box that may be running three
 * other agents' gates. ⛔ THE HARD TIMEOUT IS THE POINT, not the poll: a rig that quietly carries on
 * without its precondition is worse than a flaky one (OD-P), so this NAMES what never appeared,
 * prints whatever `diagnose` can see, and exits.
 *
 * `fatal: false` is for the one legitimate other case — a PRODUCT claim, which must stay a `check`
 * so its FAIL is reported with all the others instead of truncating the run.
 *
 * @param {string} what     the missing thing, spelt as the sentence the error should read
 * @param {() => any} probe truthy ⇒ done; its value is returned (so `centre(sel)` works directly)
 */
export async function waitFor(what, probe, {
  timeoutMs = 30000, everyMs = 250, code = 9, fatal = true, diagnose = null, chrome = null,
} = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await probe();
    if (v) return v;
    await sleep(everyMs);
  }
  if (!fatal) return null;
  let extra = '';
  try { if (diagnose) extra = ' — what IS there: ' + JSON.stringify(await diagnose()); } catch { /* best effort */ }
  console.error(`FAIL: waited ${Math.round(timeoutMs / 1000)}s and ${what} never appeared${extra}. `
    + 'This is a PRECONDITION of the checks below, so the run stops rather than reporting findings '
    + 'about a state that was never established.');
  killChrome(chrome);
  process.exit(code);
  return null;   // unreachable; keeps the return type honest
}

/**
 * ⭐⭐ CLICK UNTIL THE HOST AGREES, RE-READING THE TARGET EVERY TIME.
 *
 * ⛔ THE RACE THIS CLOSES IS NOT A SLOW-PAINT RACE, so no amount of `sleep` was ever going to fix
 * it. Selection is HOST state and the gesture is fire-and-forget at a tile that may already be
 * stale: the client reads the pawn's tile out of the LAST FRAME IT RECEIVED and sends
 * `Cmd.click(x,y)`; the host selects whoever stands there WHEN THE COMMAND LANDS and answers on
 * `frame.sel`. One frame of staleness and the click hits empty floor and selects NOBODY — and the
 * rig then reports the FEATURE as broken. That is a FALSE RED in TRAPS-3's family: a red for the
 * wrong reason is not evidence, and on an instrument nothing gates it is worse than no red at all.
 *
 * ⚠️ `target` IS RE-EVALUATED ON EVERY ATTEMPT AND THAT IS THE SAFETY PROPERTY, not a nicety. The
 * pawn's `.pl-pawn` node MOVES ACROSS THE SCREEN as she walks: a cached rectangle does not merely
 * miss her, it lands on whatever is under it now — a `.pl-room` (which opens the Room Zoom and
 * derails every later step) or, through `ContextAction`, a DEVICE THAT THEN TOGGLES (see the file
 * header). Pass a probe, never a point.
 *
 * @param {object} o
 * @param {string} o.what        the state that must arrive, as the sentence the error should read
 * @param {() => Promise<{x:number,y:number}|null>} o.target  RE-READ each attempt; null ⇒ wait
 * ⛔ `settled` MUST NOT BE A BARE `centre(sel)` — MEASURED, 2026-08-03, by this lane shipping it and
 * watching it fail. `.rz-canvas` is in the DOM while the Room Zoom is CLOSED, so `centre` answers
 * `{x:0,y:0,w:0,h:0}` — an object, and objects are truthy. `verifiedClick` then reported the room
 * "already" open, never clicked, and the three legs downstream failed against a sweep of a
 * zero-size box: a FALSE RED manufactured by the very machinery meant to remove them. The filed
 * "centre() truthy for zero-size rect" hazard, collected. Settle on a STATE (a class, a literal
 * `0`/`1`, a host field), or at minimum require `w > 0`.
 *
 * @param {() => Promise<any>} o.settled  frame-derived truth; truthy ⇒ done, and it is RETURNED
 * @param {(x:number,y:number) => Promise<any>} o.clickAt
 * @param {() => Promise<string|null>} [o.guard]  a reason NOT to click this attempt (logged, waits)
 */
export async function verifiedClick({
  what, target, settled, clickAt, guard = null, log = console.log,
  timeoutMs = 30000, everyMs = 600, code = 9, chrome = null, diagnose = null,
}) {
  const t0 = Date.now();
  let clicks = 0, last = null, held = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await settled();
    if (last) {
      log(`  verified: ${what}` + (clicks ? ` after ${clicks} click(s)` : ' already'));
      return last;
    }
    held = guard ? await guard() : null;
    if (held) { log(`  holding off a click: ${held}`); }
    else {
      const t = await target();
      // ⚠️ A ZERO-SIZE RECTANGLE IS TRUTHY. `centre()` answers {x:0,y:0,w:0,h:0} for an element that
      // exists but is not laid out, and clicking 0,0 is a click on the page corner — a gesture that
      // lands somewhere real and is not the thing we meant. Require a box.
      if (t && (t.w === undefined || t.w > 0)) { clicks += 1; await clickAt(t.x, t.y); }
    }
    await sleep(everyMs);
  }
  let extra = '';
  try { if (diagnose) extra = ' — what IS there: ' + JSON.stringify(await diagnose()); } catch { /* best effort */ }
  console.error(
    `FAIL: ${what} — never happened. ${clicks} click(s) over ${Math.round(timeoutMs / 1000)}s, last `
    + `read ${JSON.stringify(last)}${held ? `, last held off by "${held}"` : ''}${extra}. The gesture is `
    + 'fire-and-forget at a tile the host resolves when the command LANDS, so a click at a walking '
    + 'pawn can select nobody; this loop re-derives the target and re-clicks, and if the host still '
    + 'never agrees then the checks below would be measuring a state that was never established. '
    + 'The run stops here rather than reporting findings about it.');
  killChrome(chrome);
  process.exit(code);
  return null;
}

/**
 * ⭐ THE ONE-SHOT ONBOARDING DISMISSAL, VERIFIED — swept across the class (2026-08-03).
 *
 * ⛔ WHAT THE ONE-SHOT COSTS. `onboarding.js` opens a FULL-SCREEN MODAL on any profile that has not
 * seen it, and every rig here launches Chrome on a fresh `--user-data-dir`, so it is up on every
 * run. The inherited shape was `sleep(6000)` then one `centre()` then one click: if the card had not
 * painted yet the dismissal was SILENTLY SKIPPED, and every click in every step below then landed on
 * the card instead of the ship — so the run died steps later blaming the work grid, the lens rail or
 * the room. Twelve tools carried that shape (measured by grep at adoption, not remembered).
 *
 * THREE CONDITIONS, THREE SENTENCES — the card cannot be waited for until the page exists at all,
 * and its ABSENCE is legitimate (a profile that has seen it) while a card that will not CLOSE is
 * fatal, because nothing below could be clicked.
 *
 * ⛔ THE POLARITY OF THE LAST PROBE IS DELIBERATE. It asks for the literal `0`, so a FAILED evaluate
 * (undefined, an unreadable page, a crashed renderer) keeps WAITING instead of reading as "the card
 * is gone". A mis-capture that silently passes is the exact failure this whole package removes.
 *
 * ⚠️ AND THE GRACE POLL TAKES THE SAME `w > 0` TERM `verifiedClick` ENFORCES — applied here in
 * review, because the first cut of this file made the zero-size-rect finding and then did not apply
 * it to its own helper. `centre()` answers `{x:0,y:0,w:0,h:0}` for a node that exists but is not
 * laid out, and that object is TRUTHY: without the term this would stop waiting for a card that has
 * not been laid out yet and click the page corner. Today that degrades to a LOUD failure (the
 * "closed?" poll below never sees the card go, so the run exits by name) rather than to a silent
 * pass — so this is consistency, not a bug fix, and it is written down as which of the two it is.
 *
 * @returns {boolean} whether a card was seen and dismissed
 */
export async function dismissOnboarding({
  centre, clickAt, evaluate, log = console.log, chrome = null,
  graceMs = 5000, timeoutMs = 20000, code = 4,
} = {}) {
  await waitFor('the client rendered anything at all (the onboarding card or the Overview)',
    () => evaluate("!!document.querySelector('[data-onb-begin], .ov-crewwatch')"),
    { timeoutMs: 60000, code, chrome });
  const onb = await waitFor('the onboarding card ([data-onb-begin], laid out)',
    async () => { const r = await centre('[data-onb-begin]'); return (r && (r.w === undefined || r.w > 0)) ? r : null; },
    { timeoutMs: graceMs, fatal: false });
  if (!onb) { log('no onboarding card on screen (a profile that has seen it) — continuing'); return false; }
  log('dismissing the onboarding card');
  await clickAt(onb.x, onb.y);
  await waitFor('the onboarding card closed after BEGIN was clicked (it is a modal overlay — every '
    + 'click below would land on it instead of the ship)',
  async () => (await evaluate("document.querySelector('[data-onb-begin]')?1:0")) === 0,
  { timeoutMs, code, chrome });
  return true;
}

/**
 * ⭐ THE ACTUATION WITNESS — what the rig's clicks did to the ship, read off the sim's own channel.
 *
 * One entry per tile-resident device: `devices` cells are `[x,y,deck,kind,cond,oper,open,serv,air,
 * spend]` (WireFormat.Devices.cs:200), and element 6 is the OPEN/SHUT state `ContextAction` flips.
 * Read from the rig's OWN socket, never from the page — the page is the thing under test.
 *
 * ⚠️ The channel is FOG-GATED, so rows appear and disappear as crew move. `actuationDiff` therefore
 * compares only tiles present in BOTH snapshots: a row that arrived is new sight, not a toggle, and
 * calling it one would be a false alarm on an instrument whose whole job is to be believed.
 *
 * ⭐ DRIVEN BOTH WAYS, 2026-08-03, against a running host rather than a stub — because "nothing
 * moved" and "the instrument cannot see movement" print the same:
 *   · NEGATIVE — two snapshots of an IDLE ship 3 s apart: 146 devices witnessed, `actuationDiff`
 *     empty. The witness is quiet when the world is quiet, so a fired witness means something.
 *   · POSITIVE — one `Cmd.click` per deck-0 device tile on a MOSS-live ship: EIGHT rows returned,
 *     `device kind 0 at 5,7,0: open 1 → 0` and seven more, and the callers' check expression then
 *     reads FAIL and names them. The doors really do shut, and the witness really does say so.
 */
export function deviceOpenState(latest) {
  const out = {};
  for (const c of (latest.get('devices')?.cells || [])) {
    if (!Array.isArray(c) || c.length < 7) continue;
    out[`${c[0]},${c[1]},${c[2]}`] = { kind: c[3], open: c[6] };
  }
  return out;
}

/** @returns {string[]} one sentence per device whose OPEN state moved between the two snapshots. */
export function actuationDiff(before, after) {
  const moved = [];
  for (const k of Object.keys(before)) {
    const b = before[k], a = after[k];
    if (a && b.open !== a.open) moved.push(`device kind ${b.kind} at ${k}: open ${b.open} → ${a.open}`);
  }
  return moved;
}
