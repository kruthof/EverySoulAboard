// ⭐⭐ D5 OVERVIEW — WHEN THE ORDER I GAVE IS STUCK, THE OVERVIEW SAYS SO.
//
// THE DEFECT, AS HANDOVER FILED IT: *"badge Room-Zoom-only (Overview dock bare)"*, named there as a
// first-hour playtest risk — *"the Overview dock's bare 'Awaiting orders' while a badge sits in the
// Room Zoom"*. D5 and its follow-on made the ship say WHY a direct repair order cannot land, on the
// MACHINE'S TILE. The Level-1 Overview is the screen a first-hour player actually watches, and there
// the ordered crew member read `Awaiting orders` — M2-20's honest word for a state that was no longer
// hers, since the player HAD given her an order and the sim had eaten it.
//
// WHAT THIS FILE DRIVES, and what it deliberately does not. The join and the words are driven here,
// on a payload built in the HOST'S OWN WIRE SHAPE (the raw seven-element tuple, through the real
// `decodeBlocked`) rather than on hand-made objects — a fixture of decoded rows would prove the join
// and not the seam. What is NOT provable in node: that the element's textContent is the sentence.
// There is no jsdom here and `dom-lite` has neither `innerHTML` nor `querySelector`, so neither view
// can be mounted — the same limit `why-line.test.js` and `awaiting-orders.test.js` record. The render
// LINES are pinned in those two files and in `console-carryover.test.js`, whose payload tokens moved
// with this package; the element-level claim is proven in real Chrome by
// `client/tools/overview-dock-badge-shot.mjs` and reported with the commit.
//
// THE MUTATION TABLE, PHYSICALLY APPLIED AND RECORDED (2026-08-03). Each row was edited into the
// shipped tree, the whole node suite was run, and the file was restored from an in-memory copy —
// never `git checkout` (TRAPS 2). Results are in the package report.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { codeOnly } from './code-only.js';

import { decodeBlocked, BLOCKED_ORDER_REPAIR, BLOCKED_ORDER_DIG, BLOCKED_REASON_NO_ROUTE,
  BLOCKED_REASON_NO_APPROACH, BLOCKED_REASON_NO_CONSUMABLE, BLOCKED_REASON_AIR,
  BLOCKED_DETAIL_NONE, BLOCKED_CID_NONE } from '../src/wire/messages.js';
import { crewBlockedOrder, watchTask, OV_DOCK_TASK_CHARS } from '../src/ui/console-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '..', rel), 'utf8');
/** Comment out every line containing `token` — the trap-1 negative control. */
const commentOutLines = (source, token) =>
  source.split('\n').map((l) => (l.includes(token) ? '// ' + l : l)).join('\n');

// ⚠️ THE HOST'S OWN PAYLOAD, TYPED OUT AS THE WIRE SPELLS IT — `[x,y,deck,order,reason,detail,cid]`,
// verbatim from `hosts/web/WireFormat.Blocked.cs`'s serializer and pinned element-for-element by
// `blocked-model.test.js`. The tile and the machine are the shipped wreck's `fabricator_1` (24,2,0),
// the reproduction `DroppedOrderTests` drives, and `HER` is the ordered crew member's id.
const HER = 1;
const SOMEONE_ELSE = 2;
const msg = (cells) => ({ type: 'blocked', cells });
const NO_ROUTE_ROW = [24, 2, 0, BLOCKED_ORDER_REPAIR, BLOCKED_REASON_NO_ROUTE, BLOCKED_DETAIL_NONE, HER];
// A dig the player painted in an airless compartment: a DESIGNATION, so it belongs to nobody.
const DIG_ROW = [8, 11, 0, BLOCKED_ORDER_DIG, BLOCKED_REASON_AIR, BLOCKED_DETAIL_NONE, BLOCKED_CID_NONE];

// The host's own label for the state the defect photographed (`GameSession.AwaitingOrdersLabel`).
const AWAITING = 'Awaiting orders';

// ═══════════════════════════ 1. the outcome

test('⭐ THE OUTCOME — the crew member whose order is stuck gets the REASON, not "Awaiting orders"', () => {
  // PREMISE, asserted rather than assumed: without this package's join the dock renders `t.what`,
  // and `t.what` for the state the sighting photographed is the bare label. If this ever stops being
  // the baseline, the claim below is about a different defect.
  const dock = watchTask({ task: AWAITING }, OV_DOCK_TASK_CHARS);
  assert.equal(dock.what, AWAITING,
    'the baseline moved: the dock no longer reads the bare label for a job-less crew member, so the '
    + 'defect this package closes is not the one measured');

  const blocked = decodeBlocked(msg([NO_ROUTE_ROW]));
  const bl = crewBlockedOrder(blocked, HER);
  assert.ok(bl, '⛔ the Overview cannot name her stuck order at all — this IS the defect: the badge '
    + 'is up in the Room Zoom and the dock says nothing');
  assert.equal(bl.sentence, 'NO WAY TO WALK TO IT',
    'the dock must say the same sentence the badge says — one vocabulary, one row, two surfaces');
  assert.notEqual(bl.sentence, AWAITING);
});

// ⭐ THE LIVE HALF, and it is the discipline the whole channel is built on (MECHANICS §13.25 b3′:
// *a dropped order is badged if and only if the host can re-ask the sim's own killing question,
// LIVE*). The host drops the row the frame the world stops agreeing — open `door_d0_s2` and the
// route exists — so the ONLY thing the client must do is not remember. Driven as the host's two
// frames, in order, through the same call: a latch, a memo or a fade would keep the sentence on the
// dock after the badge had gone.
test('⭐ IT IS LIVE, NOT LATCHED — the frame the row goes, the dock sentence goes with it', () => {
  const before = crewBlockedOrder(decodeBlocked(msg([NO_ROUTE_ROW])), HER);
  assert.ok(before, 'premise: frame 1 has the row');
  const after = crewBlockedOrder(decodeBlocked(msg([])), HER);
  assert.equal(after, null,
    '⛔ the sentence outlived its row. The badge is gone from the Room Zoom on this frame and the '
    + 'dock is still telling the player their order is stuck — a latched claim about a world that '
    + 'stopped agreeing, which is the one thing the live-re-ask rule exists to refuse.');
  // and the channel going quiet ENTIRELY is the same answer, not a crash: a client that is caught up
  // before the first `blocked` message has `null`, not `[]`.
  assert.equal(crewBlockedOrder(null, HER), null);
});

// ═══════════════════════════ 2. the join is BY PERSON — the control by exclusion

// ⛔ WITHOUT THIS LEG "the sentence appears" is compatible with "the sentence always appears".
// A join that answered "is ANY repair order stuck" would put the fault on every crew member in the
// dock — including the six the player never ordered anywhere — which is a lie about five people to
// tell the truth about one.
test('the join is BY CREW MEMBER: another soul\'s stuck order never reaches this row', () => {
  const blocked = decodeBlocked(msg([NO_ROUTE_ROW]));
  assert.ok(crewBlockedOrder(blocked, HER), 'inclusion: her own row reaches her');
  assert.equal(crewBlockedOrder(blocked, SOMEONE_ELSE), null,
    'a crew member who was never ordered anywhere is wearing somebody else\'s fault');
});

// ⛔ AND A DESIGNATION HAS NO OWNER. The three registry walks emit `CidNone` (pinned host-side by
// `BlockedChannelTests.A_Designation_Belongs_To_Nobody_And_Sends_The_Cid_Sentinel_Not_Zero`), and a
// join that matched the sentinel would hang "NO BREATHABLE AIR WHERE THE CREW MUST STAND" on
// whichever crew member a `cid`-less roster row resolved to.
test('a DIG row belongs to nobody — the sentinel is never joined to a person', () => {
  const blocked = decodeBlocked(msg([DIG_ROW]));
  assert.equal(crewBlockedOrder(blocked, BLOCKED_CID_NONE), null,
    'the sentinel was treated as a crew id, so every airless dig on the ship now names a person');
  assert.equal(crewBlockedOrder(blocked, HER), null, 'and it did not leak onto a real crew member');
  // NON-VACUITY: the fixture really is a row this client keeps and can word — otherwise both
  // assertions above are satisfied by a decoder that dropped it.
  assert.equal(blocked.length, 1, 'the dig row was dropped by the decoder — the leg above is vacuous');
  assert.equal(crewBlockedOrder(decodeBlocked(msg([[...DIG_ROW.slice(0, 6), HER]])), HER).sentence,
    'NO BREATHABLE AIR WHERE THE CREW MUST STAND',
    'control: the identical row WITH an owner is joined and worded, so the two legs above are about '
    + 'the sentinel and not about the reason being unnameable');
});

// ═══════════════════════════ 3. the box — measured, because invisible feedback is functional

// ⛔ THE M2-6 SEND-BACK WAS EXACTLY THIS SHAPE: a clause that measured INVISIBLE in both docks. The
// Overview's cell fits 26 characters (`OV_DOCK_TASK_CHARS`, walked in real Chrome by
// `why-line-shot.mjs` STEP 6). This leg is why the row REPLACES the label instead of appending a
// D4-style middot clause to it: `"Awaiting orders · NO WAY TO WALK TO IT"` is 38 characters and
// `dockTask` would have shipped `"Aw… · NO WAY TO WALK TO IT"`.
test('the two short repair sentences fit the Overview dock WHOLE, and the long one leads with its payload', () => {
  const sentence = (reason, detail, cid = HER) =>
    crewBlockedOrder(decodeBlocked(msg([[24, 2, 0, BLOCKED_ORDER_REPAIR, reason, detail, cid]])), cid).sentence;

  for (const [what, reason] of [['no_route', BLOCKED_REASON_NO_ROUTE],
                                ['no_approach', BLOCKED_REASON_NO_APPROACH]]) {
    const s = sentence(reason, BLOCKED_DETAIL_NONE);
    assert.ok(s.length <= OV_DOCK_TASK_CHARS,
      `${what} is ${s.length} characters against the dock's measured ${OV_DOCK_TASK_CHARS}: `
      + `"${s}" ships ellipsized and the player reads a fragment`);
  }

  // ⚠️ THE THIRD ONE DOES NOT FIT AND IS SHIPPED ANYWAY, DELIBERATELY. `NEEDS PARTS — NOTHING ABOARD
  // TO REPAIR IT WITH` is 45 characters, and CSS eats the TAIL — which here is prose, because M3-13
  // put the item in the first two words. That is the exact inversion of the M2-6/D4 defects, where
  // the ellipsis ate the payload; the whole sentence is in the readout (264 px MEASURED — the
  // ELEMENT, not the 298 px island it sits in) and in the hover title. Pinned so a re-wording that
  // moves the item to the end cannot land silently.
  const long = sentence(BLOCKED_REASON_NO_CONSUMABLE, 5 /* ItemKind.Parts */);
  assert.ok(long.length > OV_DOCK_TASK_CHARS,
    'the no_consumable sentence now fits — if it was shortened, this leg has nothing left to say and '
    + 'the claim below should be re-taken rather than deleted');
  assert.ok(long.slice(0, OV_DOCK_TASK_CHARS).includes('PARTS'),
    `the visible ${OV_DOCK_TASK_CHARS} characters of "${long}" do not name the item, so what the `
    + 'player sees is prose and the payload is past the ellipsis — the M2-6 defect exactly');
});

// ═══════════════════════════ 4. the WIDE surface, pinned where node can reach it

// ⛔ THIS LEG EXISTS BECAUSE A NAMED MUTATION SURVIVED. Hiding the readout's stuck-order line
// unconditionally (`setHidden(_el.roBlocked, true)`) was GREEN across the whole node suite: the dock
// is pinned by three payload scans in three files and the readout by nothing at all. It cannot be
// driven here — there is no jsdom and `dom-lite` has no `querySelector`, so the view will not mount —
// so this is a source scan WITH its negative control, which is the house answer when a driven
// assertion is impossible rather than merely inconvenient (PROCESS §3).
// ⚠️ WHY THE WIDE SURFACE IS NOT OPTIONAL: the dock cell holds 26 characters and the longest sentence
// this channel emits is 45 (`NEEDS PARTS — NOTHING ABOARD TO REPAIR IT WITH`). `.ov-roblocked` is
// 264px and wraps, so it is the only place on the Overview where that reason is readable whole.
// ⚠️ 264 IS THE ELEMENT, 298 IS THE ISLAND, AND THIS LINE SAID 298 UNTIL IT WAS WALKED (corrected by
// review, 2026-08-03). `.ov-readout` is `width:298px` in the stylesheet; `.ov-roblocked` is a
// zero-padding sibling of `.ov-task` INSIDE it, and `overview-dock-badge-shot.mjs` measures both at
// clientWidth 264. Neither number is derivable from the other by arithmetic anyone should trust —
// the island's padding is not the only term — so the rig walks the element itself.
test('the SELECTED readout shows the stuck-order line, and hides it when nothing is stuck', () => {
  const raw = src('src/ui/overview-view.js');
  const PAYLOAD = "setText(_el.roBlocked, roBlocked ? 'ORDER STUCK — ' + roBlocked.sentence : '')";
  const TOGGLE = 'setHidden(_el.roBlocked, !roBlocked)';
  const code = codeOnly(raw);
  assert.ok(code.includes(PAYLOAD),
    `the readout no longer words the stuck order (looked for: ${PAYLOAD}). The dock is 26 characters `
    + 'and the longest reason is 45 — without this line that sentence is readable NOWHERE');
  assert.ok(code.includes(TOGGLE),
    `the readout's stuck-order line is no longer LIVE (looked for: ${TOGGLE}). Hidden unconditionally `
    + 'it is dead; shown unconditionally it is an empty red line under every crew member forever');
  for (const token of [PAYLOAD, TOGGLE])
    assert.equal(codeOnly(commentOutLines(raw, token)).includes(token), false,
      `the scan passes on a source where the line is COMMENTED OUT, so it proves nothing (trap 1)`);
});

// ⛔⛔ AND THE LEG ABOVE IS NOT ENOUGH — THIS IS THE SAME SURVIVOR ONE LEVEL DOWN, found by review.
// `setText`/`setHidden` are null-tolerant, so if `.ov-roblocked` in the BUILT HTML and the
// `querySelector` that resolves it ever stop naming the same class, `_el.roBlocked` is `null`, both
// calls no-op, and the ENTIRE selected-readout surface dies in silence — the only place the
// 45-character `NEEDS PARTS — …` sentence is readable whole. Measured: misspelling the class in the
// built HTML is GREEN across all 1254 node tests without this leg.
//
// ⚠️ IT IS A PAIR, NOT TWO SCANS, AND THE PAIRING IS THE WHOLE POINT: either token alone is satisfied
// by a tree where the other has drifted. This is `console-carryover.test.js`'s own idiom (its B1
// token list pins `'<span class="ov-crewtask"></span>'` AND `querySelector('.ov-crewtask')` together,
// after a scan for the bare class name stayed green while the row rendered nothing), applied to the
// element this package adds.
test('the readout line\'s class is the SAME string in the built HTML and in the querySelector', () => {
  const raw = src('src/ui/overview-view.js');
  const code = codeOnly(raw);
  const BUILT = '<div class="ov-roblocked" hidden></div>';
  const RESOLVED = "_root.querySelector('.ov-roblocked')";
  assert.ok(code.includes(BUILT),
    `the readout's stuck-order element is no longer BUILT (looked for: ${BUILT})`);
  assert.ok(code.includes(RESOLVED),
    `nothing RESOLVES the readout's stuck-order element (looked for: ${RESOLVED}). setText and `
    + 'setHidden are null-tolerant, so a drifted class name kills this surface without a single '
    + 'error anywhere');
  // The CSS rule that colours it is the third member of the same string, and it is cheap to include:
  // an element that is built and resolved but never styled is a fault sentence in body ink.
  assert.ok(codeOnly(src('styles.css')).includes('.ov-roblocked'),
    'styles.css has no rule for .ov-roblocked — the line renders in default ink and stops reading '
    + 'as a fault');
  for (const token of [BUILT, RESOLVED])
    assert.equal(codeOnly(commentOutLines(raw, token)).includes(token), false,
      'the scan passes on a source where the line is COMMENTED OUT, so it proves nothing (trap 1)');
});
