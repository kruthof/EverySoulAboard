// THE LEVEL-1 OVERVIEW SURFACE CONTROLLER — the warm deck schematic + its floating HUD, made the
// default SHIP surface whenever the wire carries a compartment grid (the `decks` channel). It mounts
// the PURE `overviewScene` SVG (client/src/ui/overview-scene.js) over the parked WebGL canvas and
// wraps it in blur-glass `.hud` islands (top status · left CREW WATCH · right SELECTED readout ·
// bottom-left LENS · bottom-centre command bar · bottom-right SENSOR LOG · left-centre deck rail).
//
// It owns NO wire state and NO second selection model: everything authoritative is read back from
// the console HUD (hud.js caches + getters) and every action LOWERS to an existing `Cmd` or an
// existing hud seam (armed-tool slot, tab machinery, the shared crew-selection flow). All non-trivial
// derivations are the PURE overview-model.js (node-tested). This file is DOM glue.
//
// Default-view switch (IX-O-07): when `decks` is populated AND the active tab is a ship tab
// (BUILD/CREW) the Overview takes over (`body.overview-open` hides the console `.app`, the canvas
// keeps running behind it). An empty `decks` (e.g. --ship slice) never shows the Overview at all,
// so the legacy tile view is unchanged.
//
// The non-ship tabs are NOT a delegation to the console any more. MOSS (`body.moss-open`) and
// RELATIONS (`body.relations-open`) are body-level takeovers of their own, each hiding `.app` and
// this surface with its own CSS switch; CHRONICLE is the one still-inert slot (`overview-model.js`
// INERT_TABS). That distinction is load-bearing: while RELATIONS was a console overlay, selecting it
// dropped `overview-open` and brought the entire deprecated console back on screen over the modern
// game. Any tab added here that leaves for a surface of its own MUST bring its own body switch —
// `client/test/relations-view.test.js` "A2" fails if one does not.

import * as Hud from './hud.js';
import { Cmd } from '../wire/session.js';
import {
  selectedCrewCid, decodeDecks, decodeRooms, decodeMarks, decodeDevices, decodeWork,
  decodeWorkCaps, decodeBlocked,
} from '../wire/messages.js';
// `deckDeviceConditions` is the wear join; `eraseTarget`/`tileOrders` are the un-designate precedence
// + the tile-facts derivation it runs on, SHARED VERBATIM with the Room Zoom (M1-C) rather than
// re-stated, so the two surfaces cannot come to disagree about which of two orders on one tile an
// erase click takes off.
import { deckDeviceConditions, eraseTarget, tileOrders } from './room-model.js';
import { decksView } from './decks-model.js';
import { overviewScene, makeTransform, starLayerSvg } from './overview-scene.js';
import { pawnChip } from '../render/pawn-svg.js';
import {
  // ⚠️ `moraleColor` IS DELIBERATELY NOT IMPORTED HERE (M1-F). This surface used to tint a CREW
  // WATCH bar with it. NO SYSTEM IN `sim/` EVER CHANGES `Citizen.Morale`, and that scope is the
  // whole claim: **inside `sim/` the field has exactly four references** — its `= 1f` initialiser
  // (`Entities/Citizen.cs:34`), the hash fold (`Simulation.cs:420`), the save write
  // (`SaveWriter.cs:265`) and the save read (`SaveReader.cs:268`, restoring the 1f that was
  // written). Not one of them is a simulation writing a value it computed. Outside `sim/` there are
  // FOUR more, none of which move it either: **1 in `hosts/`** — `GameSession.cs:1705`, which copies
  // it onto the roster wire and is how it reaches this file at all — and **3 in `tests/`** —
  // `StateHashHonestyTests.cs:176,234,645`, which assign it to prove it is HASHED (`:234` is
  // `Case("Citizen.Morale", …)`, the equivalence case that is this package's evidence for NOT
  // deleting the field: moving it is a determinism pin move). **EIGHT in total: 4 + 1 + 3.**
  // ⚠️ `hosts/web/WireFormat.cs:272` is deliberately NOT in that count — it serialises
  // `RosterEntry.Morale`, the DTO copy, which is a DIFFERENT field. Named here so a reader can tell
  // "excluded on purpose" from "missed", which is the whole reason this paragraph keeps being
  // rewritten. So the bar was a constant painted to look like a reading. `moraleColor` still exists
  // in `console-model.js` for the deprecated console shell, until it dies at M4-8/WP-9.
  clockHHMM, cautionState, surnameOf, speedLabel, logLineParts, logTail,
  selectedRosterEntry, crewClickTarget, terminalList, watchTask, OV_DOCK_TASK_CHARS,
  crewBlockedOrder,
} from './console-model.js';
import { makeNudge } from './paused-nudge.js';
import { ledgerRows, matterLine, caveatLine, LEDGER_ROW_IDS } from './ledger-model.js';
import {
  tileAt, overviewClickAction, lensSlotTint, currentRoom, deckPips, deckDelta,
  fmtO2, fmtCo2, fmtTemp, fmtPressure, powerLabel, tabIsInert,
  ORDER_TOOLS, ORDER_LABEL, orderHintLine, orderPlacedLine,
  ERASE_TOOL, ERASE_LABEL, markNameAt, erasePlacedLine,
  WORK_COLUMNS, nextWorkPriority, workCellLabel, workRowColumns, workSkillLabel,
} from './overview-model.js';

/* eslint-disable no-multi-spaces */

const LENSES = ['none', 'pressure', 'oxygen', 'co2', 'temperature', 'power', 'water'];
const LENS_SHORT = ['∅', 'PRES', 'O₂', 'CO₂', 'TEMP', 'PWR', 'H₂O'];
// ⭐ M1-L: `ROOM_TYPE_CHOICES` — the ＋ADD ROOM picker's 13 commissionable room types — is DELETED,
// with the picker, the chip, the hit test and `Cmd.addRoom`. Owner ruling 2026-07-29: *"we do not
// need 'add room' that makes no sense on a ship where rooms are already existing."* RimWorld
// analogue: `docs/design/rimworld-reference.md` §10, *"Rooms are derived, not authored … the player
// never names or allocates one."*
// Ship tabs the Overview owns; the rest lower to the console (v1 delegation).
// ⭐ M2-3 added WORK. It is a SHIP TAB — the grid is an island on THIS surface, not a body-level
// takeover like MOSS/RELATIONS — so it must be in BOTH lists: `OV_TABS` puts the button in the
// command bar, `SHIP_TABS` keeps `shouldShow()` true while it is selected. A tab in the first list
// only would drop `overview-open` on selection and bring the deprecated console `.app` back on
// screen over the modern game, which is the exact regression the module header records RELATIONS
// causing. And it is NOT in `overview-model.js`'s `INERT_TABS`: under OD-H this tab is the only
// route to enabling any work at all.
const OV_TABS = [['build', 'BUILD'], ['crew', 'CREW'], ['work', 'WORK'], ['relations', 'RELATIONS'], ['moss', 'MOSS'], ['chron', 'CHRONICLE']];
const SHIP_TABS = new Set(['build', 'crew', 'work']);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _send = () => {};
let _root = null;            // #overview-view
let _stage = null;           // the scene mount (over the parked canvas)
let _toast = null;           // transient status toast
let _toastTimer = 0;
let _raf = 0;                // coalesce many wire messages into one repaint
let _ctx = { transform: null, frame: null }; // last projection, for click→tile
// Level-2 room-zoom hooks (owned by a later lane). For now: select/centre + an honest toast.
let _onEnterRoom = (anchor) => { toast('ROOM ZOOM — coming soon (' + anchor + ')'); };
// ⚠️ THERE IS NO STOCKPILE ACCEPT-MASK SEAM ON THIS SURFACE ANY MORE, and its absence is deliberate
// rather than an omission. WP-5 held `_getStockFilter`, an injected getter read at click time, and
// `initOverview` took it as an option. It moved to `roomzoom-view.js` with the verb: the mask is
// meaningless without a tool that can paint it, and a getter left standing here would be a live
// injection point that nothing reads — the shape a later package mistakes for a wiring bug and
// "fixes" by adding the button back. If a stockpile seam ever seems wanted here, read
// `overview-model.js`'s header first: authoring a region is zoom-only.

// ── keyed in-place reconciliation state (BUG-A fix) ──────────────────────────────────────────
// The HUD islands used to rebuild wholesale (`innerHTML =`) on EVERY coalesced wire rebroadcast
// (~1–5×/s). That tore down every button each frame, so the node under the pointer lost its
// hover/active/armed highlight and clicks that spanned a rebuild were swallowed (the "MOSS button
// doesn't work" report). Now the islands' skeletons are built ONCE (buildSkeleton) and the paint
// helpers MUTATE existing nodes through guarded setters; DOM is only created/removed/reordered when
// the underlying SET changes. Mirrors the console HUD's `reconcileRows` pattern (hud.js).
//
// ⚠️ THE SVG SCENE WAS EXEMPTED FROM THAT FIX ON A FALSE PREMISE, AND THE EXEMPTION RE-SHIPPED THE
// VERY BUG (BUG-B, owner report 2026-07-26: *"entering zoom view requires multiple clicks on a
// room"*). The exemption used to read, in this comment, verbatim:
//
//     "The SVG scene (paintScene) is still rebuilt as one string — it holds no interactive focus
//      (its clicks are one-shot, RESOLVED SYNCHRONOUSLY BEFORE THE NEXT REPAINT)."
//
// **A click is not synchronous, and that clause is false.** A click spans mousedown→mouseup;
// `paintScene` does `_stage.innerHTML = svg` UNCONDITIONALLY on every repaint, at the wire's render
// rate (100 ms — `hosts/web/GameSession.cs` `RenderSeconds = 1.0/10.0`); and when a rebuild lands
// between the two, the mousedown target is detached, Chrome finds no common ancestor for down/up
// and FIRES NO `click` EVENT AT ALL. Not a wrong action — NO action, which is why it presented as
// "the room ignores me". Measured in Chrome on `--ship grid` with `body.overview-open` asserted:
// **19/20** room entries with no repaint during the press, **0/10** with exactly one
// `stage.innerHTML = stage.innerHTML` strictly between down and up. A 50 ms press failed ~50 % of
// the time; the owner's ordinary press, comfortably over 100 ms, failed essentially always.
//
// The scene is STILL rebuilt as one string. What changed is that the gesture no longer depends on
// the pressed node surviving: it resolves on `pointerup` (`onScenePointerUp` below), hit-testing
// whatever is live under the pointer at release. THE KNOWN-BETTER FIX IS THE KEYED RECONCILE —
// extend the pattern above to the scene so its nodes persist across a repaint — and it is
// deliberately NOT built here: `overview-scene.js` is a string builder, converting it is a rewrite
// rather than an edit, and it would move the widget counts `client/test/surface-boundary.test.js`
// pins by equality. Anything that ever needs node identity across a repaint on this surface (a
// drag) must do that work first — `pointerup` alone will not carry it.
const _el = {};                 // cached skeleton element references
const _pips = new Map();        // deck key → {el}
const _crew = new Map();        // cid key → {el, nameEl, roleEl, fill}
const _workRows = new Map();    // cid key → {el, nameEl, cells:[{el, type}]} — the WORK grid's rows
let _roBustCid = null;          // readout bust: whose portrait the <svg> currently holds
let _roTraitsKey = '';          // readout traits: the last-rendered trait set (rebuild only on change)
let _lastSpeed = '1×';          // last running speed label — shown (dimmed) while paused so the stepper never blanks
let _nudge = null;              // the paused-ship nudge controller (paused-nudge.js), bound to #ov-nudge
let _wasPaused = false;         // previous run state — the edge that dismisses the nudge on resume

/** Guarded text write — no DOM mutation when the value is unchanged (keeps idle repaints inert). */
function setText(node, v) { if (node && node.textContent !== v) node.textContent = v; }
/** Guarded className write. */
function setClassName(node, v) { if (node && node.className !== v) node.className = v; }
/** Guarded class toggle (no attribute churn when already in the wanted state). */
function setCls(node, cls, on) { if (node && node.classList.contains(cls) !== !!on) node.classList.toggle(cls, !!on); }
/** Guarded hidden toggle. */
function setHidden(node, on) { if (node && node.hidden !== !!on) node.hidden = !!on; }
/** Guarded disabled toggle. */
function setDisabled(node, on) { if (node && node.disabled !== !!on) node.disabled = !!on; }
/** Guarded attribute write (no attribute churn when already set). */
function setAttr(node, k, v) { if (node && node.getAttribute(k) !== v) node.setAttribute(k, v); }

/** Keyed list reconcile: update in place, create/remove only on membership change, reorder with
 *  minimal moves. `container` holds ONLY the reconciled children. Mirrors hud.js reconcileRows. */
function reconcile(container, map, items, keyOf, make, update) {
  const seen = new Set();
  for (const it of items) {
    const k = keyOf(it);
    seen.add(k);
    let rec = map.get(k);
    if (!rec) { rec = make(it); map.set(k, rec); }
    update(rec, it);
  }
  for (const [k, rec] of Array.from(map)) {
    if (!seen.has(k)) { rec.el.remove(); map.delete(k); }
  }
  let cursor = container.firstElementChild;
  for (const it of items) {
    const el = map.get(keyOf(it)).el;
    if (el === cursor) { cursor = cursor.nextElementSibling; continue; }
    container.insertBefore(el, cursor);
  }
}

/**
 * M2-4 — THIS SURFACE'S READER OF THE `work` CHANNEL: one crew member's manual priority for one
 * <code>WorkType</code> index, or <code>null</code> when the channel has not arrived at all.
 *
 * ⭐ M2-3 GAVE IT ITS FIRST CALLER: `paintWork` below reads every cell of the WORK grid through it,
 * and `onWorkCellClick` reads the cell's CURRENT value through it to compute the next step of the
 * cycle. It shipped caller-less at M2-4 on purpose — the `deviceConditionAt` shape
 * (`roomzoom-view.js`), same reason: the data had to exist and be reachable before the tab that
 * draws it could be built. The decode still happens per CALL rather than per frame, so a repaint on
 * a tab that is not the WORK tab costs nothing (`paintWork` returns before the first call) — the
 * `devices` lane was fairly criticised for paying a per-repaint decode for zero consumers.
 *
 * ⚠️ THE TWO ANSWERS THAT ARE NOT THE SAME. `0` means the player has switched this work type OFF —
 * the channel is sparse and *absent = off* is the sim's own semantics (`WorkPriority.Off` is "the
 * ABSENCE of a priority, not a fifth value"). `null` means WE HAVE NO PAYLOAD YET, which is a
 * different claim and must not be rendered as "off": under OD-H every work type really is off at
 * boot, so conflating them would be invisibly wrong exactly when it is least noticeable. (`work` is
 * in the host's `Snapshot` key list, so a connected tab has the layer from its first frame.)
 *
 * ⚠️ AND 1 IS THE HIGHEST PRIORITY, 4 THE LOWEST — RimWorld's convention, which reads backwards
 * against the intuition that a bigger number matters more.
 * @param {number} cid crew member's entity id (the frame crew tuple's 4th element)
 * @param {number} workType a WorkType index, 0..5 in the OD-J order
 * @returns {number|null}
 */
export function workPriorityFor(cid, workType) {
  const rows = decodeWork(Hud.getWork());
  if (!rows) return null;
  const c = cid | 0, t = workType | 0;
  for (const r of rows) if (r.cid === c && r.workType === t) return r.priority;
  return 0;
}

/**
 * ⭐ M3-12 — ONE CREW MEMBER'S CAPABILITY ROW off the LIVE `workcaps` cache: her six skill levels
 * (`0..20`, in `WorkType` value order) and the `incapableMask` byte that says which work types she
 * can never do at all. `null` when the channel has not arrived or carries no row for this cid.
 *
 * ⛔ THIS IS THE ONLY ROUTE. Neither number exists anywhere else on this client — a skill is
 * per-PERSON state with no tile to project onto, and the incapability mask is `Citizen.WorkIncapable`
 * copied verbatim by the host rather than re-derived (`hosts/web/WireFormat.WorkCaps.cs`). Anything
 * this surface computed for itself — "she has no work rows, so she must be incapable", "level 0
 * because we have not been told otherwise" — would be a CLIENT GUESS about a person, which is the
 * mutation this package's first leg exists to catch.
 *
 * ⚠️ `null` IS NOT "INCAPABLE OF NOTHING" AND IT IS NOT "LEVEL 0". It is *we have not been told*, and
 * `workRowColumns`/`workSkillLabel` render it as such: every cell stays present (deleting a box on a
 * missing message would state a permanent fact about a person on no evidence) and the skill corner
 * reads `·`. `workcaps` is in the host's snapshot key list, so a connected tab has the layer from its
 * first frame; this branch is the boot frame and the disconnected harness.
 *
 * Decoded per CALL, and called ONCE PER ROW rather than once per cell — `paintWork` returns before
 * the first call on any other tab, so a repaint elsewhere costs nothing (the `devices` lane was
 * fairly criticised for paying a per-repaint decode for zero consumers).
 * @param {number} cid crew member's entity id
 * @returns {{cid:number, skills:number[], incapableMask:number}|null}
 */
export function workCapsFor(cid) {
  const rows = decodeWorkCaps(Hud.getWorkCaps());
  if (!rows) return null;
  const c = cid | 0;
  for (const r of rows) if (r.cid === c) return r;
  return null;
}

/** Mount the Overview surface + subscribe to the shared HUD state. Call once from main.js. */
export function initOverview(opts) {
  _send = (opts && opts.send) || (() => {});
  _root = document.getElementById('overview-view');
  if (!_root) return;
  buildSkeleton();
  Hud.onShipUpdate(scheduleRepaint);
  // Optional injection point for the room-zoom lane.
  if (opts && typeof opts.onEnterRoom === 'function') _onEnterRoom = opts.onEnterRoom;
  // M1-L: the `onAddRoom` injection point is DELETED with the picker it opened.
  repaint();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Static skeleton: the islands are created once; their dynamic content is re-rendered on repaint.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function buildSkeleton() {
  _root.classList.add('ov');
  // Visibility is now the `body.overview-open` CSS switch, not the boot `hidden` attribute (which
  // only prevents a flash-of-unstyled-content before this module runs).
  _root.hidden = false;
  _root.innerHTML =
    '<div class="ov-space">' +
      '<div class="ov-neb ov-neb1"></div><div class="ov-neb ov-neb2"></div><div class="ov-neb ov-neb3"></div>' +
      // The drifting starfield: built ONCE here (not in the per-repaint scene) so its CSS drift is
      // never restarted by the scene's innerHTML rebuild. Sits above the nebula, below the stage.
      starLayerSvg() +
      '<div class="ov-stage" id="ov-stage"></div>' +
    '</div>' +
    '<div class="hud ov-topbar" id="ov-topbar"></div>' +
    '<div class="hud ov-deckrail" id="ov-deckrail"></div>' +
    '<aside class="hud ov-crewwatch" id="ov-crewwatch"></aside>' +
    '<aside class="hud ov-readout" id="ov-readout"></aside>' +
    '<div class="hud ov-lens" id="ov-lens"></div>' +
    '<div class="ov-cmd" id="ov-cmd"></div>' +
    '<div class="hud ov-sensor" id="ov-sensor"></div>' +
    // E0-8 LEDGER — the ship's matter census and its three rate members, sitting above the LENS
    // island in the bottom-left. It is on THE STANDARD SURFACE (CLAUDE.md), never on the deprecated
    // console shell: E0-4's WP-5 built a whole feature onto that shell and nobody noticed.
    '<div class="hud ov-ledger" id="ov-ledger"></div>' +
    '<div class="ov-toast" id="ov-toast" hidden></div>' +
    // ⭐ M3-5 — THE ENDING BAR. One line from the `ending` channel: the grace while the ship wakes
    // one more soul by itself, and the lose state when it has nobody left to wake. It is NOT a
    // toast — a toast expires, and neither of these two facts ever stops being true. It is NOT the
    // ending screen either: M5-1 owns THE ENDING (OD-M item 4 = A) and this must stay one line.
    '<div class="ov-ending" id="ov-ending" hidden></div>' +
    // ⭐⭐ D2 — THE ALERT BAR. One derived line, sitting directly UNDER the ending bar: a cryo
    // capsule is within about a sim-day of its next thaw-ladder band edge, and when it crosses,
    // waking that person costs more. Not a toast (a toast expires and this fact does not until the
    // player acts) and not a Chronicle entry (the M3 demo measured the Chronicle ring evicting real
    // events under brownout spam). It is the FIRST ROW of M5-2/T17's alert stack — grow it there.
    '<div class="ov-alert" id="ov-alert" hidden></div>' +
    // The paused-ship nudge (B6, ported off the console's `#s-nudge` at WP-8). It sits directly under
    // the top bar's HOLD/RESUME chip, because that chip is the fix for what it is complaining about.
    //
    // A BUTTON, not a div, and the wording leads with the click. The console's chip only ever said
    // "PRESS SPACE" — and on the path that raises it, SPACE DOES NOT WORK: Chrome focuses the button
    // the player just clicked to arm a tool, and `input/controls.js` yields SPACE to a focused
    // button's native activation. Measured over CDP with a real key event: arm MOVE on a held ship →
    // nudge up, press SPACE → still held. An affordance whose only instruction is a dead end is worse
    // than no affordance, so the chip now carries the resume itself (`releaseSpace` below hands the
    // key back too, but the click is the guarantee).
    '<button type="button" class="ov-nudge" id="ov-nudge" data-ov-nudge hidden ' +
      'title="The ship is on HOLD — click to resume">‖ HOLD — CLICK OR PRESS SPACE TO RUN THE SHIP</button>';
    // M1-L: the `#ov-picker` modal (the ＋ADD ROOM room-type chooser) is DELETED, along with its
    // backdrop-dismiss, its 13 choice buttons and its CANCEL. `overview-model.test.js`'s id census
    // is equality-pinned and drops `ov-picker` in the same commit.
  _stage = document.getElementById('ov-stage');
  _toast = document.getElementById('ov-toast');
  _nudge = makeNudge({ el: () => $('ov-nudge') });

  buildWorkIsland();
  buildIslands();

  // Map gestures: project + classify (IX-O-11..19). Only the scene surface routes here.
  //
  // POINTERUP, NOT `click` — see the ⚠️ BUG-B note above `_el`. `click` is precisely the event this
  // surface never receives when a repaint lands mid-press, and at 10 Hz that is most presses.
  _stage.addEventListener('pointerdown', onScenePointerDown);
  _stage.addEventListener('pointerup', onScenePointerUp);
  // …and a release ANYWHERE clears the press latch, so a press begun on the schematic and released
  // off it (a drag out onto a HUD island) cannot leave the latch armed for somebody else's gesture.
  //
  // ⛔ BUBBLE PHASE. DO NOT ADD A THIRD ARGUMENT TO THESE TWO CALLS. `_stage`'s own handler sits
  // below window on the same event, so it must read the latch first; passing `true` moves the clear
  // to CAPTURE, where it runs BEFORE `_stage` and empties `_downOnScene` every single time — the
  // whole room-entry gesture then dies SILENTLY, which is this package's own bug reintroduced by one
  // word. Found in review, when the mutation survived a green suite because the test harness could
  // not model event phase. It is guarded now, by name and by driving: `overview-model.test.js`,
  // "a press that ENDS off the schematic", whose `firePointer` dispatches window capture → target →
  // window bubble the way the browser does.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pointerup', clearScenePress);
    window.addEventListener('pointercancel', clearScenePress);
  }
  // HUD buttons: one delegated handler, ignoring the scene (which has its own above). It is still
  // bound to `click` and still needs its `.ov-stage` bail: the browser fires the trailing `click`
  // after our pointerup on every press that did NOT span a repaint, and it bubbles to `_root`.
  _root.addEventListener('click', onHudClick);
}

/** Build each HUD island's inner DOM ONCE and cache node references. From here on the paint helpers
 *  mutate these nodes in place; only keyed lists (crew watch, deck rail) create/remove children. */
function buildIslands() {
  // top status bar — fixed structure, only text/classes change.
  //  · LLM chip (which mind is voicing the crew) — hidden until the first llmstatus lands.
  //  · SPEED is now an interactive « value » stepper (was a dead read-only chip): the value IS the
  //    reflected state and the arrows change it (mirrors the +/- keys → Cmd.speed(±1)).
  //  · PAUSE toggles between a loud "▶ RESUME" (with a .paused state class) and "❚❚ HOLD" so a
  //    paused ship unmistakably reads as "click again to resume".
  //  · CAUTION is now a button — clicking it opens the MOSS diagnostics screen (VS-O jump-to-fault).
  $('ov-topbar').innerHTML =
    '<span class="ov-ship">MSV PERILUNE</span>' +
    '<span class="ov-deckctx"></span><span class="ov-clock"></span><span class="ov-spacer"></span>' +
    '<span class="ov-chip ov-stores" data-ov-stores hidden ' +
      'title="Loose regolith aboard — the build material that feeds wall/door work. Wall ghosts starve at 0."></span>' +
    '<span class="ov-chip ov-llm" data-ov-llm hidden ' +
      'title="The AI mind voicing the crew (talk backend). Offline-safe."></span>' +
    '<span class="ov-speedctl" title="Simulation speed — click « / » or press − / +">' +
      '<button class="ov-spdbtn" data-ov-speed-dn aria-label="Slower">«</button>' +
      '<span class="ov-speedval"></span>' +
      '<button class="ov-spdbtn" data-ov-speed-up aria-label="Faster">»</button>' +
    '</span>' +
    '<button class="ov-chip ov-pause" data-ov-pause title="Pause / resume the simulation (Space)"></button>' +
    '<button class="ov-chip ov-caution" data-ov-caution ' +
      'title="Ship status at a glance — click to open MOSS diagnostics"></button>';
  _el.tbDeck = _root.querySelector('.ov-deckctx');
  _el.tbClock = _root.querySelector('.ov-clock');
  _el.tbStores = _root.querySelector('.ov-stores');
  _el.tbLlm = _root.querySelector('.ov-llm');
  _el.tbSpeedCtl = _root.querySelector('.ov-speedctl');
  _el.tbSpeedVal = _root.querySelector('.ov-speedval');
  _el.tbPause = _root.querySelector('.ov-pause');
  _el.tbCaution = _root.querySelector('.ov-caution');
  _el.tbCautionLevel = '';

  // deck rail — a keyed pip list, reconciled directly (all children are pips).
  _el.deckrail = $('ov-deckrail');

  // crew watch — fixed header + empty line, then a display:contents list of reconciled rows.
  $('ov-crewwatch').innerHTML =
    '<div class="ov-hdr"></div><div class="ov-empty" hidden>No souls aboard.</div>' +
    '<div class="ov-crewlist"></div>';
  _el.cwHdr = _root.querySelector('.ov-crewwatch .ov-hdr');
  _el.cwEmpty = _root.querySelector('.ov-crewwatch .ov-empty');
  _el.crewlist = _root.querySelector('.ov-crewlist');

  // selected readout — every part present but toggled; the actions row is stable (never rebuilt).
  $('ov-readout').innerHTML =
    '<div class="ov-hdr">SELECTED</div>' +
    '<div class="ov-empty ov-ro-empty">NO CREW SELECTED</div>' +
    '<div class="ov-guide ov-ro-guide">Click a pawn or a CREW WATCH row.</div>' +
    '<div class="ov-selrow ov-ro-sel" hidden>' +
      '<span class="ov-selbust"><svg viewBox="0 0 16 20"></svg></span>' +
      '<span class="ov-selname"><span class="ov-selN"></span><span class="ov-selR"></span></span>' +
    '</div>' +
    '<div class="ov-traits ov-ro-traits" hidden></div>' +
    '<div class="ov-task ov-ro-task" hidden></div>' +
    // ⭐⭐ D5 OVERVIEW — the stuck order's own line, under the task line. The dock cell is 26
    // characters and the longest sentence this channel emits is 45; this box is 264 px and WRAPS
    // (⚠️ MEASURED ON THIS ELEMENT, not inherited from `.ov-task` and not derived from the island:
    // `.ov-readout` is 298 px in the stylesheet, `.ov-roblocked` is a zero-padding sibling inside it,
    // and `overview-dock-badge-shot.mjs` walks both at clientWidth 264 and asserts they agree — three
    // places in this package said 298 from the island's number until it did), so it is where the whole
    // sentence is readable without a hover. Its own element rather than more text in `.ov-task`, because the
    // two say different things: `.ov-task` is the host's answer to "what is she doing" and this is
    // the channel's answer to "why did what I asked for not happen".
    '<div class="ov-roblocked" hidden></div>' +
    '<div class="ov-atmos ov-ro-atmos" hidden>' +
      '<div class="ov-atmos-lbl"></div>' +
      '<div class="ov-atmos-row"><span>ATMOS</span><span class="ov-atmos-v good ov-ro-atmosA"></span></div>' +
      // ⭐ D4 — the label names what the row now SHOWS. `paintReadout` puts the pressure first
      // (`101.3 kPa · 20°C · ON`), so a row still labelled `TEMP · POWER` mislabels its own headline
      // number — the one that says a compartment is empty.
      // ⚠️ ABBREVIATED, AND THE ABBREVIATIONS ARE THE LENS RAIL'S OWN (`2 PRES · 5 TEMP · 6 PWR`),
      // because this row is 298px wide minus padding and it MUST stay one line: measured in Chrome,
      // the spelt-out `PRESSURE · TEMP · POWER` wraps BOTH spans (row height 15px → 30px) and drops
      // `ON` onto a second line under its own label. `PRES · TEMP · PWR` measures 15px, like the
      // ATMOS row above it.
      '<div class="ov-atmos-row"><span>PRES · TEMP · PWR</span><span class="ov-atmos-v amber ov-ro-atmosB"></span></div>' +
    '</div>' +
    '<div class="ov-actions">' +
      '<button class="ov-act ov-talk" data-ov-talk>[T] OPEN CHANNEL — TALK</button>' +
      '<div class="ov-act-row">' +
        '<button class="ov-act" data-ov-move>[M] MOVE</button>' +
        '<button class="ov-act" data-ov-bio>[B] BIO</button>' +
      '</div>' +
    '</div>';
  _el.roEmpty = _root.querySelector('.ov-ro-empty');
  _el.roGuide = _root.querySelector('.ov-ro-guide');
  _el.roSel = _root.querySelector('.ov-ro-sel');
  _el.roBust = _root.querySelector('.ov-ro-sel .ov-selbust svg');
  _el.roName = _root.querySelector('.ov-selN');
  _el.roRole = _root.querySelector('.ov-selR');
  _el.roTraits = _root.querySelector('.ov-ro-traits');
  _el.roTask = _root.querySelector('.ov-ro-task');
  _el.roBlocked = _root.querySelector('.ov-roblocked');
  _el.roAtmos = _root.querySelector('.ov-ro-atmos');
  _el.roAtmosLbl = _root.querySelector('.ov-ro-atmos .ov-atmos-lbl');
  _el.roAtmosA = _root.querySelector('.ov-ro-atmosA');
  _el.roAtmosB = _root.querySelector('.ov-ro-atmosB');
  _el.roTalk = _root.querySelector('[data-ov-talk]');
  _el.roMove = _root.querySelector('[data-ov-move]');
  _el.roBio = _root.querySelector('[data-ov-bio]');

  // lens — a FIXED button set (membership never changes); only `.on` toggles.
  $('ov-lens').innerHTML = '<div class="ov-hdr">LENS</div><div class="ov-lensrow">' +
    LENSES.map((name, i) => '<button class="ov-lensbtn" data-ov-lens="' + name + '">' +
      (i + 1) + ' ' + LENS_SHORT[i] + '</button>').join('') + '</div>';
  _el.lensBtns = Array.from(_root.querySelectorAll('.ov-lensbtn'));

  // command bar — the BUILD tab + a FIXED tab set. ORDERS THAT POINT AT AN EXISTING THING ARE
  // DECK-SCOPED; BUILDING AND STOCKPILE ARE ZOOM-ONLY (overview-model.js's header holds the rule and
  // its justification). So the BUILD tab carries no tile-BUILD tools — just a hint pointing the
  // player into a room — and beside it the ORDERS bar, whose two ORDER tools each aim at something
  // the ship already contains: DIG at debris, STRIP at a wall or a device. You point, and the tile
  // you pointed at is the whole decision, which is what makes a single click honest at this altitude.
  // STOCKPILE is not here: its extent IS the decision, and this surface has no drag gesture at all.
  // THIRD BUTTON, AND IT IS NOT AN ORDER: ERASE (M1-C) takes a painted order back off a tile. It
  // aims at something the ship contains too — the player's own earlier click — so it passes the same
  // altitude test, and having no extent it needs no drag.
  // (M1-L deleted ＋ADD ROOM: there are no hall slots left to open — every compartment is a room.)
  //
  // The buttons carry `data-ov-tool`, so they route through the EXISTING `onHudClick` branch and the
  // EXISTING `paintCommand` reflection — the ORDERS bar adds no second arming path, it fills the one
  // that was already wired and empty. Arming is `Hud.armTool`, the ONE mutually-exclusive slot, so
  // the bar, the console palette and the G/V keys cannot disagree about what is armed.
  $('ov-cmd').innerHTML =
    '<div class="hud ov-place" hidden><span class="ov-hdr">BUILD ▸</span>' +
      '<span class="ov-buildhint">CLICK A COMPARTMENT TO BUILD INSIDE IT</span></div>' +
    '<div class="hud ov-orders" hidden><span class="ov-hdr ov-ordershdr">ORDERS ▸</span>' +
      ORDER_TOOLS.map((tool) =>
        '<button class="ov-tool" data-ov-tool="' + tool + '">' + esc(ORDER_LABEL[tool]) + '</button>').join('') +
      // ERASE, beside the two verbs it undoes and rendered by the SAME markup — it carries
      // `data-ov-tool` too, so it routes through the existing `onHudClick` arming branch and the
      // existing `paintCommand` reflection, and adds no second arming path. It is appended rather
      // than folded into `ORDER_TOOLS` because it is not an order (overview-model.js `ERASE_TOOL`).
      '<button class="ov-tool" data-ov-tool="' + ERASE_TOOL + '">' + esc(ERASE_LABEL) + '</button>' +
      '<span class="ov-orderhint"></span></div>' +
    '<div class="hud ov-tabs">' + OV_TABS.map(([key, label]) =>
      '<button class="ov-tab" data-ov-tab="' + key + '">' + esc(label) + '</button>').join('') + '</div>';
  _el.place = _root.querySelector('.ov-place');
  _el.orders = _root.querySelector('.ov-orders');
  _el.ordersHdr = _root.querySelector('.ov-ordershdr');
  _el.orderHint = _root.querySelector('.ov-orderhint');
  _el.toolBtns = Array.from(_root.querySelectorAll('.ov-orders .ov-tool'));
  _el.tabBtns = Array.from(_root.querySelectorAll('.ov-tab'));

  // sensor log — a fixed header + 5 fixed line slots (each ts span + rest span), toggled/updated.
  let slots = '<div class="ov-hdr"></div>';
  for (let i = 0; i < 5; i++) slots += '<div class="ov-logline" hidden><span class="ov-ts"></span><span class="ov-rest"></span></div>';
  $('ov-sensor').innerHTML = slots;
  _el.sensorHdr = _root.querySelector('.ov-sensor .ov-hdr');
  _el.sensorLines = Array.from(_root.querySelectorAll('.ov-sensor .ov-logline')).map((line) => ({
    el: line, ts: line.querySelector('.ov-ts'), rest: line.querySelector('.ov-rest'),
  }));

  // LEDGER — a fixed header, one fixed row slot PER MODEL ROW, and one census line. FIXED SLOTS, not
  // a keyed reconcile: `ledgerRows` returns the same ids in the same order for every payload, so
  // there is nothing to key on and nothing to create per repaint.
  //
  // ⚠️ THE COUNT COMES FROM THE MODEL, NOT FROM A LITERAL. `paintLedger` walks the SLOTS and reads
  // `rows[i]`, so a row the model gained beyond a hard-coded 4 would never be painted — green model
  // tests, nothing on screen. E0-9's FOOD row is the fifth and would have been the first casualty.
  let ledger = '<div class="ov-hdr"></div>';
  for (let i = 0; i < LEDGER_ROW_IDS.length; i++) {
    ledger += '<div class="ov-ledrow" hidden>' +
      '<span class="ov-ledlabel"></span><span class="ov-ledval"></span><span class="ov-ledsub"></span></div>';
  }
  ledger += '<div class="ov-ledcensus ov-faint" hidden></div>' +
            // The one caveat that does NOT ride a row's hover title. See caveatLine().
            '<div class="ov-ledcaveat" hidden></div>' +
            '<div class="ov-ledempty ov-faint" hidden>— no ledger yet —</div>';
  $('ov-ledger').innerHTML = ledger;
  _el.ledgerHdr = _root.querySelector('.ov-ledger .ov-hdr');
  _el.ledgerRows = Array.from(_root.querySelectorAll('.ov-ledger .ov-ledrow')).map((row) => ({
    el: row,
    label: row.querySelector('.ov-ledlabel'),
    val: row.querySelector('.ov-ledval'),
    sub: row.querySelector('.ov-ledsub'),
    level: '',
  }));
  _el.ledgerCensus = _root.querySelector('.ov-ledcensus');
  _el.ledgerCaveat = _root.querySelector('.ov-ledcaveat');
  _el.ledgerEmpty = _root.querySelector('.ov-ledempty');

  // M3-5's ENDING bar — written into the skeleton string above, so it is bound by id here.
  _el.ending = $('ov-ending');
  // D2's ALERT bar, its sibling. Two bars and not one: the ending is about the RUN, this is about a
  // capsule, and a ship whose crew is dying is exactly the ship whose capsules are decaying
  // unattended — sharing a slot would have made the two facts mutually exclusive.
  _el.alert = $('ov-alert');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// M2-3 — THE WORK GRID (the WORK tab's island).
//
// ⭐ IT IS BUILT AS NODES AND `appendChild`-ED INTO `_root`, NOT WRITTEN INTO THE SKELETON STRING,
// AND THAT IS THE SURFACE PIN RATHER THAN A STYLE PREFERENCE. The one invariant this package can
// break catastrophically and silently is WHERE it mounts: E0-4's WP-5 built a whole feature onto the
// deprecated console `.app` shell, passed independent review and merged, and nobody noticed until
// the running game was opened. The negative form of the guard cannot bite — a tab mounted into an
// EXISTING body-level container (`#panels`) adds no new console-shell id, so
// `surface-boundary.test.js`'s id ceiling holds, and it creates no `hud.js` widget, so all four
// widget counts hold. That is WP-5's first draft verbatim.
//
// So the guard is POSITIVE and it is about PLACEMENT: `workTabMount()` below hands a test the very
// element the grid mounts into, and because every node from the cell up to the island is created and
// appended here rather than parsed out of an HTML string, `mount.parentNode === the Overview root`
// is a REAL fact in the node harness too (dom-lite parses no markup — an island written into
// `_root.innerHTML` would have no parent there and the assertion would be vacuous). Re-parent this
// island anywhere else and that chain breaks in one step.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Create an element with a class (and optional text), the way this island builds every node. */
function mkEl(tag, cls, text) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function buildWorkIsland() {
  _el.work = mkEl('div', 'hud ov-work');
  _el.work.hidden = true;                    // the WORK tab is not the boot tab
  _root.appendChild(_el.work);               // ⛔ the Overview root. Never document.body, never #panels.

  _el.workHdr = mkEl('div', 'ov-hdr', 'WORK');
  _el.work.appendChild(_el.workHdr);

  // The one line of instruction the grid needs, and it states the cycle rather than the meaning of
  // the numbers: under OD-H a player's first honest question is "how do I switch anything ON".
  _el.work.appendChild(mkEl('div', 'ov-workhint',
    'CLICK A CELL TO CYCLE  off → 1 → 2 → 3 → 4 → off.  1 IS THE HIGHEST PRIORITY.'));

  // ⭐ M3-12 — the second line, and it exists to make the ABSENCE legible. A missing box is a strong
  // statement drawn with nothing at all, so without this line the player's honest reading of a gap in
  // the grid is "the UI broke" rather than "she can never do that". RimWorld can afford to say
  // nothing here because its Bio tab carries an "Incapable Of" list; we have no such surface yet
  // (the Persona window is M4), so the grid must say it itself.
  _el.work.appendChild(mkEl('div', 'ov-workhint',
    'THE SMALL NUMBER IS HER SKILL, 0–20.  A WORK TYPE SHE CAN NEVER DO HAS NO CELL AT ALL.'));

  _el.workEmpty = mkEl('div', 'ov-empty', 'No souls aboard.');
  _el.workEmpty.hidden = true;
  _el.work.appendChild(_el.workEmpty);

  // Column header — built ONCE from WORK_COLUMNS, so the header and the cells cannot disagree about
  // which column is which work type (they are the same table, walked twice).
  const head = mkEl('div', 'ov-workrow ov-workhead');
  head.appendChild(mkEl('span', 'ov-workname', 'CREW'));
  for (const col of WORK_COLUMNS) {
    const h = mkEl('span', 'ov-workcolhdr', col.label);
    h.setAttribute('title', col.title);
    head.appendChild(h);
  }
  _el.work.appendChild(head);

  _el.workList = mkEl('div', 'ov-worklist');
  _el.work.appendChild(_el.workList);
}

/**
 * ⭐ THE POSITIVE SURFACE PIN's SEAM: the live element the WORK grid mounts into. Exported for the
 * placement guard in `overview-model.test.js`, which requires it to be a DESCENDANT OF THE OVERVIEW
 * ROOT — an id census is a guard against GROWTH, and re-parenting adds no id.
 * @returns {*} the island element, or null before `initOverview`
 */
export function workTabMount() { return _el.work || null; }

/**
 * Paint the grid: one row per rostered crew member, six cells per row, each read from the LIVE
 * `work` channel through `workPriorityFor`.
 *
 * ⚠️ THE CELL HOLDS NO STATE OF ITS OWN — not an optimistic value, not a "pending" mirror. Every
 * repaint re-reads the wire cache, so what is on screen is what the SIM holds; a click sends an
 * order and the cell changes when (and only when) the sim echoes it back on the next ~100 ms
 * snapshot. A local mirror would go quietly wrong the moment the sim refused an order — and
 * `HandleWorkPriority` is silent on refusal by design, so there would be nothing to correct it.
 *
 * ⭐ M3-12 ADDED TWO THINGS AND ONLY ONE OF THEM IS A NUMBER.
 *
 *   1. **The skill corner.** Each cell now carries her level in that work type beside the priority
 *      glyph, read from `workcaps` — the RimWorld arrangement (§1.7), the skill in the corner of the
 *      priority box. It is READ-ONLY: `onWorkCellClick` is unchanged, so a click anywhere in the
 *      cell (including on the number) still cycles the PRIORITY and nothing else. A skill is the
 *      sim's to write; the player's control over it is choosing who to thaw and who to assign.
 *   2. ⭐ **The absent cell, which is a STRUCTURE and not a style.** A work type in her
 *      `incapableMask` gets no `<button>` in this row at all — `workRowColumns` decides the set and
 *      the DOM is built from it. `rimworld-reference.md:335`: disabled renders blank, incapable
 *      renders as no cell. A struck-through or greyed box would still be a box, would still take the
 *      click, and would still say *your setting is off* rather than *there is no such setting*.
 *
 * ⚠️ THE GAP MUST STAY UNDER ITS OWN HEADER, and CSS does that, not this function: `.ov-workrow` is
 * a six-column grid and each cell is placed by `grid-column` keyed off its `data-ov-work-type`
 * attribute (`styles.css`). Without that, removing MINE would slide HAUL leftwards under the MINE
 * header and every remaining cell in the row would read as the wrong work type — the neighbouring
 * cells' click geometry, silently wrong. The addressing itself is unaffected (each button carries
 * its own cid+type), which is exactly why the failure would be invisible to a click test.
 *
 * ⚠️ THE ATTACH/DETACH RUNS ONLY WHEN THE DOM DISAGREES WITH THE MASK. Re-appending six nodes every
 * repaint would move the node under the player's pointer at ~10 Hz — BUG-A on this island, which the
 * reconcile above exists to avoid — and comparing against the DOM rather than against a remembered
 * signature is what makes a row that has lost a cell able to get it back.
 */
function paintWork(crew) {
  const show = Hud.getTab() === 'work';
  setHidden(_el.work, !show);
  if (!show) return;   // hidden → skip the per-cell decode entirely
  setHidden(_el.workEmpty, crew.length !== 0);
  reconcile(_el.workList, _workRows, crew, (e) => String(e.cid),
    (e) => {
      const row = mkEl('div', 'ov-workrow');
      const nameEl = mkEl('span', 'ov-workname');
      row.appendChild(nameEl);
      const cells = WORK_COLUMNS.map((col) => {
        const b = document.createElement('button');
        b.className = 'ov-workcell';
        // BOTH halves of the address ride the element the player clicks. The handler reads them
        // back rather than closing over `e` — a closure would capture the crew entry object from
        // the repaint that CREATED the row, and rows outlive repaints by construction.
        b.dataset.ovWorkCid = String(e.cid);
        b.dataset.ovWorkType = String(col.type);
        b.setAttribute('title', col.title);
        // The priority glyph and the skill corner are SEPARATE elements, deliberately: they are two
        // different facts on two different domains (`off`/`1..4` from the player, `0..20` from the
        // sim) and a cell whose text was their concatenation could not style, title or test either.
        const prioEl = mkEl('span', 'ov-workprio');
        const skillEl = mkEl('span', 'ov-workskill');
        b.appendChild(prioEl);
        b.appendChild(skillEl);
        // ⛔ NOT appended to the row here. The row's cell SET is a function of her incapability
        // mask and is applied below, so a row created before `workcaps` arrives converges the moment
        // it does — and a row created after a mask changes needs no special case either.
        return { el: b, type: col.type, prioEl, skillEl };
      });
      return { el: row, nameEl, cells };
    },
    (rec, e) => {
      setText(rec.nameEl, surnameOf(e.name));
      const caps = workCapsFor(e.cid);
      // ⭐ THE STRUCTURE, from the single authority. `workRowColumns` reads the mask bit through the
      // wire module's own `isIncapableOf`; nothing here infers a capability from a missing `work`
      // row (under OD-H every `work` row is missing at boot, so that inference would delete the
      // entire grid).
      let sig = 0;
      for (const col of workRowColumns(caps)) sig |= 1 << col.type;
      // ⚠️ THE COMPARISON IS AGAINST THE DOM, NOT AGAINST A REMEMBERED SIGNATURE — and this is a
      // ROBUSTNESS choice, stated as one, NOT a fix for a bug the game has. A `rec.sig` cache is
      // behaviourally IDENTICAL for every input the wire can produce, and the mutation that
      // reinstates it is a measured EQUIVALENT MUTANT: the whole suite stays green under it, and
      // that is reported rather than dressed up as a red. What the cache asserts is "I already
      // applied this set" — a claim about what this module DID rather than about what is on screen —
      // and the two diverge if anything ever detaches a cell from outside. Nothing does today; the
      // browser harness's own layout probe is the only thing that ever has. Six identity comparisons
      // and no DOM writes in the steady state is the whole cost of not depending on that staying
      // true, and it removes a piece of state rather than adding one.
      // ⛔ What IS pinned, and is a real difference: applying the set ONLY ONCE per row. That mutant
      // goes red on the converges-both-ways leg.
      let dirty = false;
      for (const cell of rec.cells) {
        if (((sig & (1 << cell.type)) !== 0) !== (cell.el.parentNode === rec.el)) { dirty = true; break; }
      }
      if (dirty) {
        for (const cell of rec.cells) if (cell.el.parentNode) cell.el.remove();
        // Re-attached in WORK_COLUMNS order, so the surviving cells keep OD-J's order; their column
        // POSITION is CSS's job (see the note above).
        for (const cell of rec.cells) if (sig & (1 << cell.type)) rec.el.appendChild(cell.el);
      }
      for (const cell of rec.cells) {
        if (!(sig & (1 << cell.type))) continue;   // no cell exists — nothing to paint
        const p = workPriorityFor(e.cid, cell.type);
        const { text, state } = workCellLabel(p);
        setText(cell.prioEl, text);
        setCls(cell.el, 'off', state === 'off');
        setCls(cell.el, 'set', state === 'set');
        setCls(cell.el, 'wait', state === 'wait');
        // `wait` is the ONE state that refuses the click, and it is the honest one: with no payload
        // we do not know what this cell currently is, so we cannot compute the next step of the
        // cycle without guessing. `work` is in the host's snapshot key list, so this lasts one
        // frame on a real connection.
        setDisabled(cell.el, state === 'wait');
        // The skill corner. `caps.skills` is indexed by WorkType VALUE, which is what `cell.type`
        // holds — never by the column's position in the array.
        const sk = workSkillLabel(caps ? caps.skills[cell.type] : null);
        setText(cell.skillEl, sk.text);
        setCls(cell.skillEl, 'untrained', sk.state === 'untrained');
        setCls(cell.skillEl, 'wait', sk.state === 'wait');
        setAttr(cell.skillEl, 'title', sk.title);
      }
    });
}

/**
 * A WORK cell was clicked. The next value comes from the LIVE cache, never from what the cell is
 * currently showing and never from a counter this module keeps: two clicks inside one 100 ms
 * snapshot then both compute from the same known-true value and the second simply overwrites the
 * first, which is what a whole-value order means.
 */
function onWorkCellClick(btn, d, e) {
  const cid = Number(d.ovWorkCid) | 0;
  const type = Number(d.ovWorkType) | 0;
  const current = workPriorityFor(cid, type);
  _send(Cmd.workPriority(cid, type, nextWorkPriority(current)));
  // A work priority is applied by `SetWorkPriorityCommand` at a TICK BOUNDARY, so on a held ship the
  // order sits in the queue and the cell does not move — the silent "dead button" this repo has paid
  // three owner reports for. The nudge is the same one an armed order raises, for the same reason.
  nudgeOnIntent();
  releaseSpace(btn, e);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Repaint (coalesced to one animation frame). Reads authoritative state from the HUD caches.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function scheduleRepaint() {
  if (_raf) return;
  const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
  _raf = raf(() => { _raf = 0; repaint(); });
}

/** Whether the sim is on HOLD right now, from the shared status cache (the only source of truth). */
function isPaused() {
  const s = Hud.getStatus();
  return !!(s && s.paused);
}

/** An order or an arm just happened: surface the paused nudge if the ship is not running (B6). Every
 *  call site is a player intent that CANNOT take effect while the sim is stopped — arming a tool,
 *  issuing a move, commissioning a room. View-only actions deliberately do not call this: they do
 *  work while paused, so nudging would be a lie in the other direction. */
function nudgeOnIntent() {
  if (_nudge) _nudge.trigger(isPaused());
}

/** A tool-toggle button was just activated. `Hud.armTool` is a TOGGLE, so the same click both arms
 *  and CANCELS — and only the arming half is an order the stopped ship is failing to carry out.
 *  Nudging on the cancel told the player "press space to run the ship" for withdrawing an order,
 *  which is the affordance firing at the exact moment it has nothing to say. */
function afterToolToggle(btn, e) {
  if (Hud.getArmedTool() != null) nudgeOnIntent();
  releaseSpace(btn, e);
}

/** Hand SPACE back to the game after a POINTER activation. Chrome focuses the button you click, and
 *  `input/controls.js` deliberately yields SPACE to a focused button's native activation (so a
 *  keyboard user activating a crew row does not pause the sim) — which leaves a player who clicked
 *  [M] MOVE and read "PRESS SPACE" pressing a key that re-clicks the button instead. Dropping focus
 *  fixes that, but ONLY for a mouse click: `e.detail === 0` is a keyboard activation, and stealing a
 *  keyboard user's place in the tab order to fix a mouse problem is not a trade worth making. */
function releaseSpace(btn, e) {
  if (!btn || typeof btn.blur !== 'function') return;
  if (e && e.detail === 0) return;
  btn.blur();
}

/** Whether the Overview should be the shown surface right now (IX-O-07 default-view switch). */
function shouldShow() {
  const decks = Hud.getDecks();
  const populated = !!(decks && Array.isArray(decks.decks) && decks.decks.length);
  return populated && SHIP_TABS.has(Hud.getTab()) && !Hud.isMossActive();
}

function repaint() {
  if (!_root) return;
  // The nudge's dismissal is tracked whether or not this surface is SHOWN: the player can arm on the
  // Overview, drop into the Room Zoom and resume there, and a stale "PRESS SPACE" would then be
  // waiting on the way back. Cheap — one cache read, no DOM unless the edge fires.
  const nowPaused = isPaused();
  if (_wasPaused && !nowPaused && _nudge) _nudge.unpause();
  _wasPaused = nowPaused;

  const show = shouldShow();
  document.body.classList.toggle('overview-open', show);
  if (!show) return; // hidden → skip the heavy scene rebuild until it matters again

  const frame = Hud.getFrame();
  const rosterMsg = Hud.getRoster();
  const crew = rosterMsg && Array.isArray(rosterMsg.crew) ? rosterMsg.crew : [];
  const activeDeck = frame ? (frame.deck | 0) : 0;
  const dView = decksView(decodeDecks(Hud.getDecks()), decodeRooms(Hud.getRooms()));
  const designsMsg = Hud.getDesigns();
  const lens = frame ? (frame.lens || 'none') : 'none';
  const selCid = selectedCrewCid(frame);

  // ⭐⭐ D5 OVERVIEW — the `blocked` channel, decoded ONCE per repaint and handed to both surfaces
  // that word it. The SAME cached message the Room Zoom's badge layer decodes (`Hud.getBlocked`), so
  // the dock line and the badge are two renderings of one row and cannot come to different answers.
  const blocked = decodeBlocked(Hud.getBlocked());

  paintScene(frame, dView, crew, designsMsg, activeDeck, lens, selCid);
  paintTopbar(activeDeck, dView);
  paintDeckRail(dView, activeDeck);
  paintCrewWatch(crew, selCid, blocked);
  paintWork(crew);
  paintReadout(frame, rosterMsg, dView, activeDeck, blocked);
  paintLens(lens);
  paintCommand(activeDeck);
  paintSensor();
  paintLedger();
  paintEnding();
  paintAlert();
}

/**
 * ⭐ M3-5 — THE ENDING BAR. The host owns the sentence (`WireFormat.EndingBanner`, derived from
 * `CryoSystem`'s saved bits); this function owns only whether it is on screen and which of the two
 * moments it is.
 *
 * ⚠️ `over` COMES OFF THE PAYLOAD, NEVER OFF THE PROSE. The grace and the ending are styled
 * differently and the client must not match on words to tell them apart — the `MossPods` rule this
 * repo already keeps (a code with no sentence is unrenderable; a sentence with no code is
 * unstylable). Reword either line and nothing here changes.
 */
function paintEnding() {
  const msg = Hud.getEnding();
  const text = msg && typeof msg.text === 'string' ? msg.text : '';
  setHidden(_el.ending, !text);
  setText(_el.ending, text);
  setCls(_el.ending, 'ov-endover', !!(msg && msg.over));
}

/**
 * ⭐⭐ D2 — THE ALERT BAR. The host owns the sentence (`WireFormat.DecayAlert`, derived per render
 * from `ThawGate.CapsuleNearestToRungCrossing`); this function owns only whether it is on screen.
 *
 * ⚠️ HIDDEN ON THE EMPTY STRING, exactly like the ending bar, and for the same reason: "the ship
 * has nothing to warn about" is a state the WIRE expresses. A client that instead hid the bar when
 * the channel stopped arriving could never tell all-quiet from a dropped socket.
 *
 * ⭐ M5-2/T17: this is the alert STACK's first row. When `text` becomes a list, replace the body of
 * this function and keep the slot, the cache (`Hud.getAlerts`) and the channel.
 */
function paintAlert() {
  const msg = Hud.getAlerts();
  const text = msg && typeof msg.text === 'string' ? msg.text : '';
  setHidden(_el.alert, !text);
  setText(_el.alert, text);
}

// ── bottom-left LEDGER (E0-8) ──

/**
 * The ship's ledger: matter census, PARTS/DAY, DAYS OF WATER, DAYS OF FOOD, O2 TREND.
 *
 * Every string here comes from `ledger-model.js`, which owns the SENTINELS — `window === 0` reads
 * MEASURING and a negative runway reads STEADY. This function must never substitute a zero for
 * either: a metric the player can read but cannot trust is the thing E0-8 exists to remove.
 *
 * The host's derivation note rides each row as its `title`. That is the DA-M3 rule (`ShipSystems`
 * ships the same prose beside the same kind of number): DAYS OF AIR is not an oxygen supply — this
 * ship has no air reserve at all — and a bare label would be read as one.
 */
function paintLedger() {
  const msg = Hud.getLedger();
  const rows = ledgerRows(msg);
  setText(_el.ledgerHdr, 'LEDGER');
  setHidden(_el.ledgerEmpty, rows.length > 0);
  const slots = _el.ledgerRows;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const r = rows[i];
    if (!r) { setHidden(s.el, true); continue; }
    setHidden(s.el, false);
    setText(s.label, r.label);
    setText(s.val, r.value);
    setText(s.sub, r.sub);
    if (s.level !== r.level) { // alarm ramp class: swap only when the level actually changes
      setCls(s.el, 'warn', r.level === 'warn');
      setCls(s.el, 'crit', r.level === 'crit');
      s.level = r.level;
    }
    if (r.note && s.el.title !== r.note) s.el.title = r.note;
  }
  const census = matterLine(msg);
  setHidden(_el.ledgerCensus, !census);
  setText(_el.ledgerCensus, census);
  // The caveat is ALWAYS VISIBLE, never a title: it is the one fact on this island a player who
  // never hovers must still be told.
  const caveat = caveatLine(msg);
  setHidden(_el.ledgerCaveat, !caveat);
  setText(_el.ledgerCaveat, caveat);
}

// ── the scene (schematic) + the lens wash overlay ──

function paintScene(frame, dView, crew, designsMsg, deck, lens, selCid) {
  const state = {
    deck, decksView: dView, frame, crew,
    designs: designsMsg && Array.isArray(designsMsg.cells) ? designsMsg.cells : [],
    terminals: terminalList(Hud.getTerminals()),
    // The mark layer comes off the `marks` channel, NOT off `frame`. The sentence this replaces was
    // never written down here, but it was the assumption: *"the marks ride the frame's `cell[1]`
    // byte"*. They did, and GlyphMapper passes 3/4/5 overwrote it — a crew member crossing a
    // designated tile blanked its mark on this very surface, where the grid crew cluster exactly on
    // top of the dig orders.
    marks: decodeMarks(Hud.getMarks()) || [],
    // Per-tile device WEAR, off the `devices` channel — the only place `Device.Condition` reaches
    // this client. Derived here beside `marks` and for the same reason: the projection's `cell[1]`
    // carries one bit of it at most (`GlyphColor.Broken`) and GlyphMapper passes 3/4/5 overwrite
    // that byte, so a machine with a crew member standing on it would flicker back to intact.
    deviceCond: deckDeviceConditions(decodeDevices(Hud.getDevices()), deck),
    selectedCid: selCid, lens,
  };
  let svg = overviewScene(state);
  const overlay = lensOverlaySvg(dView, deck, frame, lens);
  if (overlay) svg = svg.replace(/<\/svg>\s*$/, overlay + '</svg>');
  _stage.innerHTML = svg;

  // Cache the projection for click→tile (IX-O-19).
  const entry = (dView || []).find((d) => d.deck === deck);
  _ctx = { transform: makeTransform(entry ? entry.slots : [], frame), frame };
}

/** The lens wash: a translucent grade rect over each occupied room (IX-O-30). PURE-derived tint. */
function lensOverlaySvg(dView, deck, frame, lens) {
  if (!lens || lens === 'none') return '';
  const entry = (dView || []).find((d) => d.deck === deck);
  if (!entry) return '';
  const t = makeTransform(entry.slots, frame);
  let out = '';
  for (const s of entry.slots) {
    if (!s.occupied) continue;
    const tint = lensSlotTint(lens, s);
    if (!tint) continue;
    const r = t.rect(s.rect);
    out += `<rect x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}" width="${r.w.toFixed(2)}" height="${r.h.toFixed(2)}" rx="2" fill="${tint}"/>`;
  }
  return out ? `<g class="pl-lens" style="mix-blend-mode:hard-light" pointer-events="none">${out}</g>` : '';
}

// ── top status bar ──

function paintTopbar(activeDeck, dView) {
  const metrics = Hud.getMetrics();
  const status = Hud.getStatus();
  const total = Array.isArray(dView) ? dView.length : 0;
  const day = metrics ? metrics.day : '–';
  const clock = metrics ? clockHHMM(metrics.dayFrac || 0) : '--:--';
  const paused = status ? !!status.paused : false;
  const c = cautionState(metrics || {});
  const speed = status ? speedLabel(status.speed) : '1×';
  setText(_el.tbDeck, 'DECK ' + activeDeck + (total ? ' OF ' + total : ''));
  setText(_el.tbClock, 'DAY ' + day + ' · ' + clock);
  // (1) PAUSE — text AND a strong state class so a paused ship reads unmistakably as "resume me".
  setText(_el.tbPause, paused ? '▶  RESUME' : '❚❚  HOLD');
  setCls(_el.tbPause, 'paused', paused);
  // (2) SPEED — the value IS the state; keep the last running tier visible (dimmed) while paused.
  if (status && status.speed && status.speed !== 'paused') _lastSpeed = speed;
  setText(_el.tbSpeedVal, paused ? _lastSpeed : speed);
  setCls(_el.tbSpeedCtl, 'dim', paused);
  // (3) CAUTION — idle reads "SYSTEMS NOMINAL" (the bare word "NOMINAL" confused players); the
  //     title spells out the meaning and the chip is clickable → MOSS (see onHudClick).
  setText(_el.tbCaution, c.level === 'idle' ? 'SYSTEMS NOMINAL' : c.label);
  if (c.level !== _el.tbCautionLevel) { // caution ramp class: swap only when the level changes
    setClassName(_el.tbCaution, 'ov-chip ov-caution' + (c.level ? ' ' + c.level : ''));
    _el.tbCautionLevel = c.level;
  }
  // (4) LLM — which mind voices the crew; hidden until the first llmstatus lands.
  paintLlmChip();
  // STORES — loose regolith aboard; the currency that gates building. Empty reads as a live warning
  // (a starved wall ghost otherwise sits forever with nothing in the HUD saying why).
  paintStoresChip(metrics);
}

/** The STORES chip: loose build-material stock; hidden until metrics carries it, red/pulse at 0. */
function paintStoresChip(metrics) {
  const reg = metrics && typeof metrics.regolith === 'number' ? metrics.regolith : null;
  if (reg == null) { setHidden(_el.tbStores, true); return; }
  setText(_el.tbStores, '◆ REGOLITH ' + reg);
  setCls(_el.tbStores, 'empty', reg <= 0);
  setHidden(_el.tbStores, false);
}

/** The top-bar LLM chip: backend name (+ degraded flag + hourly cost), or hidden when unknown. */
function paintLlmChip() {
  const llm = Hud.getLlm();
  const backend = llm && llm.backend;
  if (!backend) { setHidden(_el.tbLlm, true); return; }
  const cost = (typeof llm.costPerHour === 'number' && isFinite(llm.costPerHour) && llm.costPerHour > 0)
    ? ' · $' + llm.costPerHour.toFixed(2) + '/h' : '';
  setText(_el.tbLlm, '◈ ' + String(backend).toUpperCase() + (llm.degraded ? ' ⚠ FALLBACK' : '') + cost);
  setCls(_el.tbLlm, 'degraded', !!llm.degraded);
  setHidden(_el.tbLlm, false);
}

// ── deck rail ──

function paintDeckRail(dView, activeDeck) {
  const pips = deckPips(dView, activeDeck);
  reconcile(_el.deckrail, _pips, pips, (p) => String(p.deck),
    (p) => {
      const b = document.createElement('button');
      b.className = 'ov-pip';
      b.dataset.ovDeck = String(p.deck);
      b.textContent = String(p.deck);
      return { el: b };
    },
    (rec, p) => setCls(rec.el, 'on', p.active));
}

// ── left CREW WATCH dock ──

function paintCrewWatch(crew, selCid, blocked) {
  setText(_el.cwHdr, 'CREW WATCH — ' + crew.length + ' SOUL' + (crew.length === 1 ? '' : 'S'));
  setHidden(_el.cwEmpty, crew.length !== 0);
  // Rows are created ONCE per cid and mutated in place — the portrait <svg> is never refetched and a
  // hovered/selected row survives the ~2/s roster rebroadcast. Membership change alone adds/removes.
  reconcile(_el.crewlist, _crew, crew, (e) => String(e.cid),
    (e) => {
      const b = document.createElement('button');
      b.className = 'ov-crew';
      b.dataset.ovCrew = String(e.cid);
      b.innerHTML =
        '<span class="ov-bust"><svg viewBox="0 0 16 20">' + pawnChip({ cid: e.cid, role: e.role }) + '</svg></span>' +
        '<span class="ov-crewcol">' +
          '<span class="ov-crewname"></span><span class="ov-crewrole"></span>' +
          '<span class="ov-crewtask"></span>' +
        '</span>';
      return {
        el: b,
        nameEl: b.querySelector('.ov-crewname'),
        roleEl: b.querySelector('.ov-crewrole'),
        taskEl: b.querySelector('.ov-crewtask'),
      };
    },
    (rec, e) => {
      setText(rec.nameEl, surnameOf(e.name));
      setText(rec.roleEl, e.role || '');
      // CREW WATCH task line (B5, ported off the console at WP-8). The SAME pure derivation the
      // console used, so the two surfaces cannot disagree: the host's own words, plus whether they
      // count as real work — and only the working rows read bright. A row that shows "Idle" in dim
      // grey is the honest answer and it is also the legibility mechanism: the eye reads the amber
      // rows as "work is happening", so a dock of grey rows is a TRUE signal that nothing is. On
      // `--ship grid` that will be most of the day (crew there do not auto-wander), and the choice
      // was deliberate — writing something like "AWAITING ORDERS" would imply the ship is waiting on
      // the player, when an idle crew member may simply have nothing reachable to do.
      //
      // ─────────────────────────────────────────────────────────────────────────────────────────
      // ⭐ THE PARAGRAPH ABOVE IS THE RECORD OF A DECISION AND IT IS KEPT WHERE IT WAS MADE. It
      // carries THREE separable claims and they have three different fates (M2-20, 2026-07-30):
      //
      //  1. ⛔ OVERTURNED — "AWAITING ORDERS would imply the ship is waiting on the player". Under
      //     OD-G (owner, 2026-07-29) THE SHIP IS WAITING ON THE PLAYER: the pawn boots idle, every
      //     work type boots off (OD-H), and the opening IS an order. The objection's premise is
      //     gone, so the conclusion goes with it — this row now says so out loud.
      //  2. ⛔ ALREADY FALSE WHEN IT WAS QUOTED — "crew there do not auto-wander". True when
      //     written; reversed on 2026-07-25 by the deck-confined-wander lane, which made grid crew
      //     `AutoWander = true` (`sim/Sim.Gen/AuthoredShips.cs:1126`, "the standard play ship should
      //     not be a still photograph"). The wreck's boot pawn is authored the same way
      //     (`AuthoredShips.cs:1993`). Nothing in this file ever depended on it; it is corrected
      //     because a stale clause travels forward inside a block that is quoted as a unit.
      //  3. ✅ STILL TRUE AND STILL THE MECHANISM — dim grey is honest, and the eye reading amber
      //     as "work is happening" is what makes a dock of dim rows a TRUE signal. It survives
      //     UNCHANGED and it is why *unassigned* did NOT become a bright row.
      //
      // ⇒ WHAT THE OLD POSITION GOT RIGHT IS THE HAZARD, NOT THE ANSWER: conflating "waiting for an
      // order" with "nothing reachable to do" is a lie. It was written for a world where only the
      // second state existed; OD-H made BOTH common, so the fix is TWO WORDS, not one word chosen
      // for either side. The host owns both (`GameSession.TaskLabel`) — ⛔ never re-derive them here
      // from the `work` channel. This row only classifies the sentence it was sent, for colour.
      // ─────────────────────────────────────────────────────────────────────────────────────────
      // ⭐ M2-6 fix-back — `t.what`, NOT `t.text`: this dock renders WHAT she is doing and stops at
      // the separator. It is 145 px = 26 characters (measured) and a clause-bearing label is 43–54, so the
      // full string does not truncate the explanation — it truncates the PAYLOAD, leaving
      // "Servicing door_d0_s0 — Re…". The WHY is carried by `.ov-task` below, which is 264 px and
      // wraps. ⛔ Do not "fix" this back to `t.text` without widening the dock, and see
      // `console-model.js` for why widening is the wrong trade (M2-20's precedent).
      // ⭐ D4 fix-back — AND THE BUDGET IS PASSED IN, MEASURED: 145 px ⇒ 26 characters (browser, not
      // arithmetic). Dropping the ranking clause stopped being enough when D4 gave the label a SECOND
      // clause that must SURVIVE — the middot air warning rides inside this half on purpose, and at 31
      // characters `text-overflow` was eating exactly the words that say she is dying. `dockTask`
      // shortens the device name instead. ⛔ It is this dock's OWN number, not the Room Zoom's (22):
      // clamping to the narrower dock would cost four characters of device name here for nothing.
      const t = watchTask(e, OV_DOCK_TASK_CHARS);
      // ⭐⭐ D5 OVERVIEW — AND WHEN THE ORDER SHE WAS GIVEN IS STUCK, THIS ROW SAYS SO INSTEAD.
      //
      // THE DEFECT THIS CLOSES, in the words HANDOVER filed it in: *"badge Room-Zoom-only (Overview
      // dock bare)"*. The D5 follow-on made the ship say why a direct repair order cannot land — on
      // the MACHINE'S TILE, in the Room Zoom. Here, on the screen a first-hour player actually
      // watches, the crew member the player had just ordered went back to reading "Awaiting orders"
      // and nothing pointed at the badge. Invisible feedback is functional breakage (binding).
      //
      // ⛔ IT REPLACES THE LABEL RATHER THAN APPENDING TO IT, AND THE REASON IS THE BOX, MEASURED.
      // The dock is 26 characters (`OV_DOCK_TASK_CHARS`, browser-walked). A middot clause in D4's
      // shape — "Awaiting orders · NO WAY TO WALK TO IT", 38 — would put `dockTask`'s budget at
      // 26-23-1 = 2 characters of base and ship "Aw… · NO WAY TO WALK TO IT". All three sentences a
      // REPAIR row can carry lead with their payload (`NO WAY TO WALK TO IT` 20, `NO WAY TO STAND
      // NEXT TO IT` 26, `NEEDS PARTS — …` names the item in its first two words), so a bare
      // replacement is fully visible where an appended clause is not, and CSS ellipsis on the long
      // one eats prose rather than payload — the exact inversion of the M2-6/D4 defects.
      // ⛔ AND IT IS NOT A THIRD WORD FOR "doing nothing": "Awaiting orders" is M2-20's honest word
      // for a crew member the player has given no work to, and this row is the state where that
      // sentence is FALSE — she was given an order and the ship could not run it.
      //
      // ⛔⛔ THE COST OF REPLACING RATHER THAN APPENDING, NAMED (found by independent review). The
      // argument above is made against the "Awaiting orders" BASE, and a replacement does not only
      // drop the base: it drops everything the label was carrying, including D4's ` · NO AIR`, whose
      // own constant says dropping the warning from the docks is "the one change this constant exists
      // to make impossible" (`console-model.js` AIR_WARNING_CLAUSE). MEASURED: a host label of
      // "Servicing fabricator_1 · NO AIR" renders here as "NO WAY TO WALK TO IT".
      // ⚠️ STRUCTURALLY POSSIBLE, NOT SHOWN REACHABLE — review probed the shipped wreck for 900 ticks
      // and measured the two states co-occurring ZERO times (the air clause is gated on `HeldByOrder`
      // and a stuck order is one the sim could not run). The hover below still carries `t.text` whole,
      // clause included. If the co-occurrence is ever driven, the fix is a composition rule here, not
      // a wider dock — M2-20's precedent.
      //
      // ⚠️ THE `title` STILL CARRIES THE HOST'S OWN TASK LABEL, whole. The reason is what the game
      // could not do; the label is what she is doing instead, and both are true at once.
      const bl = crewBlockedOrder(blocked, e.cid);
      setText(rec.taskEl, bl ? bl.sentence : t.what);
      // ⭐ D4 fix-back, the BONUS surface — the WHOLE sentence on hover, zero layout. It is not the
      // fix (a tooltip needs a gesture nobody knows to perform; the warning itself is in the row
      // above, always visible), it is the repair for what the fix COSTS: shortening the base puts the
      // full device name out of reach, and this dock's own readout is the only other place it lived.
      // ⚠️ A NEWLINE, NEVER `WHY_SEPARATOR`. The two halves are a fault and an activity, not a what
      // and a why, and spelling the ranking separator in a VIEW is the second implementation of the
      // host's parsing contract that `why-line.test.js` exists to refuse.
      setAttr(rec.taskEl, 'title', bl ? bl.sentence + '\n' + t.text : t.text);
      // ⭐ D5 OVERVIEW — `blocked` LAST, and the two work-state classes are turned OFF under it. The
      // dock's legibility mechanism is colour (amber = work is happening, dim = it is not), and a
      // stuck order is neither: it is a FAULT, and it takes the `blocked` channel's own fault red so
      // the eye finds it in a column of grey rows. Ordered after the other two for the reason M2-20
      // ordered `waiting` before `working` — the last class declared in `styles.css` wins.
      setCls(rec.taskEl, 'working', !bl && t.working);
      setCls(rec.taskEl, 'waiting', !bl && t.waiting);
      setCls(rec.taskEl, 'blocked', !!bl);
      // ⚠️ THERE IS NO MORALE BAR HERE, AND ITS ABSENCE IS THE FEATURE (M1-F, 2026-07-29). A
      // `.ov-morale` / `.ov-morale-fill` pair used to sit under the task line, its width and colour
      // driven by `e.morale` off the roster wire. That number is `Citizen.Morale`, and NO SYSTEM IN
      // `sim/` MOVES IT — its only assignments are the `= 1f` initialiser and the save-load restore
      // of that same 1f. So the bar was a CONSTANT painted to look like a reading, on the first
      // screen a new player sees. It is not "not wired yet"; there is nothing upstream to wire.
      // The wire still carries the field (removing it is a hashed-state pin move for
      // a cosmetic fix, and whether morale becomes real is an open M4-4 decision), so a future lane
      // that wants a bar back must first make the number move. ⛔ Do NOT re-add a bar off `e.morale`.
      // ⚠️ NOT to be confused with `ShipMetricsSnapshot.Morale`, which IS computed (mean crew Mood)
      // and IS load-bearing — it weights DirectorSystem tension. Different field, same word.
      setCls(rec.el, 'sel', selCid != null && e.cid === selCid);
    });
}

// ── right SELECTED readout ──

function paintReadout(frame, rosterMsg, dView, activeDeck, blocked) {
  const sel = selectedRosterEntry(frame, rosterMsg);
  // The empty↔selected states, the traits, task and atmos box are all pre-built and toggled — the
  // TALK/MOVE/BIO buttons are never rebuilt, so an armed/hovered action survives every repaint.
  const has = !!sel;
  setHidden(_el.roEmpty, has);
  setHidden(_el.roGuide, has);
  setHidden(_el.roSel, !has);
  setDisabled(_el.roTalk, !has);
  setDisabled(_el.roMove, !has);
  setDisabled(_el.roBio, !has);
  if (!has) {
    setHidden(_el.roTraits, true);
    setHidden(_el.roTask, true);
    setHidden(_el.roBlocked, true);
    setHidden(_el.roAtmos, true);
    _roBustCid = null; _roTraitsKey = '';
    return;
  }
  const tile = crewClickTarget(frame, sel);
  const entry = (dView || []).find((d) => d.deck === activeDeck);
  const room = (sel.deck === activeDeck && entry) ? currentRoom(tile, entry.slots) : null;
  const roomName = room ? room.displayName : '—';
  // bust portrait — replace the <svg> body only when the selected crew changes (no per-frame refetch)
  if (String(sel.cid) !== _roBustCid) {
    _el.roBust.innerHTML = pawnChip({ cid: sel.cid, role: sel.role });
    _roBustCid = String(sel.cid);
  }
  setText(_el.roName, sel.name || '');
  setText(_el.roRole, [sel.role, roomName].filter(Boolean).join(' · '));
  // traits — rebuilt only when the trait set changes (cheap and keeps the chips stable otherwise)
  const traits = Array.isArray(sel.traits) ? sel.traits : [];
  const tkey = traits.join('');
  if (tkey !== _roTraitsKey) {
    _el.roTraits.innerHTML = traits.map((t) => '<span class="ov-trait">' + esc(t) + '</span>').join('');
    _roTraitsKey = tkey;
  }
  setHidden(_el.roTraits, traits.length === 0);
  // ⭐ M2-6 fix-back — THIS IS WHERE THE `why` CLAUSE IS ACTUALLY READ, and it is the reason the
  // two crew docks are allowed to stop at the separator. The RAW wire field, whole: `.ov-task` is
  // 264 px and wraps (MEASURED `clientWidth`; this comment said 266 until D4 fix-back), so every
  // clause-bearing label fits in two lines. ⛔ It must NOT
  // be routed through `watchTask` — that derivation's `what` deliberately drops the clause for the
  // narrow docks, and putting this readout on it would delete the explanation from the one place
  // on either surface that can hold it.
  setText(_el.roTask, '> ' + (sel.task || ''));
  setHidden(_el.roTask, false);
  // ⭐⭐ D5 OVERVIEW — …and, under it, WHY THE ORDER THE PLAYER GAVE HER IS NOT HAPPENING. Same
  // `crewBlockedOrder` join as the dock row above, same decoded message, so the readout, the dock and
  // the Room Zoom badge are three renderings of ONE row. Hidden — not blanked — when nothing about
  // her is stuck, so the box does not keep an empty line where a fault used to be.
  const roBlocked = crewBlockedOrder(blocked, sel.cid);
  setText(_el.roBlocked, roBlocked ? 'ORDER STUCK — ' + roBlocked.sentence : '');
  setHidden(_el.roBlocked, !roBlocked);
  if (room && room.atmos) {
    const a = room.atmos;
    setText(_el.roAtmosLbl, 'CURRENT ROOM · ' + roomName);
    setText(_el.roAtmosA, fmtO2(a.o2) + ' O₂ · ' + fmtCo2(a.co2ppm) + ' CO₂');
    // ⭐ D4 — PRESSURE LEADS THIS ROW. A crew member standing in a sealed vacuum used to hide this
    // whole box (no `rooms` row ⇒ null atmos ⇒ the `else` branch below); now the box shows, and the
    // number that says WHY she is dying has to be in it. `0.0 kPa · -47°C · OFF`.
    setText(_el.roAtmosB, fmtPressure(a.pressureKPa) + ' · ' + fmtTemp(a.tempK) + ' · ' + powerLabel(room.active));
    setHidden(_el.roAtmos, false);
  } else {
    setHidden(_el.roAtmos, true);
  }
}

// ── bottom-left LENS ──

function paintLens(activeLens) {
  for (const b of _el.lensBtns) setCls(b, 'on', b.dataset.ovLens === activeLens);
}

// ── bottom-centre command bar (BUILD hint + ORDERS bar + tabs) ──

/** @param {number} activeDeck the deck currently on screen — the deck every order will land on. */
function paintCommand(activeDeck) {
  const tab = Hud.getTab();
  const armed = Hud.getArmedTool();
  setHidden(_el.place, tab !== 'build');  // the BUILD hint only exists on the BUILD tab
  setHidden(_el.orders, tab !== 'build'); // …and so does the ORDERS bar, beside it
  // The header names the deck as well as the hint line: the header is what a player reads when
  // NOTHING is armed and they are deciding whether to arm at all, which is the moment "which deck
  // is this?" actually matters. `armTool` forces the tab to BUILD, so the bar is on screen whenever
  // an order is armed, including when the G/V keys did the arming.
  setText(_el.ordersHdr, 'ORDERS ▸ DECK ' + (activeDeck | 0));
  setText(_el.orderHint, orderHintLine(armed, activeDeck));
  for (const b of _el.toolBtns) setCls(b, 'on', armed === b.dataset.ovTool);
  for (const b of _el.tabBtns) setCls(b, 'on', tab === b.dataset.ovTab);
}

// ── bottom-right SENSOR LOG ──

function paintSensor() {
  const tail = logTail(Hud.getLog(), 5);
  setText(_el.sensorHdr, 'SENSOR LOG — LAST ' + tail.length);
  const slots = _el.sensorLines;
  if (!tail.length) { // the honest empty state, reusing slot 0
    const s0 = slots[0];
    setHidden(s0.el, false);
    setCls(s0.el, 'ov-faint', true);
    setHidden(s0.ts, true);
    setText(s0.ts, '');
    setText(s0.rest, '— no events yet —');
    for (let i = 1; i < slots.length; i++) setHidden(slots[i].el, true);
    return;
  }
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (i >= tail.length) { setHidden(s.el, true); continue; }
    const p = logLineParts(tail[i]);
    setHidden(s.el, false);
    setCls(s.el, 'ov-faint', false);
    if (p.ts) {
      setHidden(s.ts, false);
      setText(s.ts, p.ts);
      setCls(s.ts, 'new', i === tail.length - 1); // the freshest line's stamp glows
      setText(s.rest, ' ' + p.rest); // the space the one-string form put between stamp and body
    } else {
      setHidden(s.ts, true);
      setText(s.ts, '');
      setText(s.rest, p.rest);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Input.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A primary press that STARTED on the schematic and has not yet been resolved. The gesture stays
 *  "press AND release both on the scene" — the shape `click` used to give us for free — so a release
 *  over the schematic after pressing a HUD button must not enter a room. */
let _downOnScene = false;

/** True for the primary button, and for an event carrying no `button` at all. A secondary button
 *  never produced a `click` here and must not produce a gesture now. */
function isPrimaryPointer(e) { return ((e && e.button) || 0) === 0; }

function onScenePointerDown(e) {
  if (!isPrimaryPointer(e)) return;
  _downOnScene = true;
}

function onScenePointerUp(e) {
  if (!isPrimaryPointer(e)) return;
  if (!_downOnScene) return;
  _downOnScene = false;
  onSceneGesture(e);
}

/** Any release or cancel, wherever it lands: the latch is one-shot and never survives its press. */
function clearScenePress() { _downOnScene = false; }

/**
 * Resolve one scene gesture. Called from `onScenePointerUp` and NOT from a `click` listener — the
 * whole point of BUG-B. Two consequences worth knowing, both deliberate:
 *
 *  · The hit is taken from the RELEASE target, so a repaint between press and release is harmless:
 *    the room rects are geometry, not state, and the live node under the pointer at release is the
 *    same room the player pressed. (If a `decks` frame genuinely re-slots the deck mid-press, the
 *    release resolves against what is on screen NOW, which is the more defensible of the two.)
 *  · A short drag from a hall into a room now enters that room, where `click` would have resolved
 *    to the common ancestor and done nothing. That is strictly more forgiving on a surface whose
 *    complaint was "it takes several clicks", and this surface has no drag gesture to confuse it.
 */
function onSceneGesture(e) {
  const svg = _stage.querySelector('svg.pl-overview');
  if (!svg) return;
  const armed = Hud.getArmedTool();
  const hit = hitTest(e.target);
  const action = overviewClickAction(armed, hit);
  switch (action.type) {
    // No 'build' case — building is zoom-only (walls/floors are placed in the Room Zoom). The
    // Overview never sends Cmd.build; overviewClickAction never returns 'build'.
    case 'move': {
      const t = pointToTile(svg, e);
      if (t) {
        _send(Cmd.cursor(t.x, t.y)); _send(Cmd.move()); Hud.toolUsed('move', t.x, t.y);
        nudgeOnIntent(); // an order placed on a stopped ship is the classic "nothing happened"
      }
      break;
    }
    // A DESIGNATION on the deck being shown (WP-5). It beats every hit below — see
    // `overviewClickAction`'s doc for the three measured holes that decided that.
    case 'order': {
      const t = pointToTile(svg, e);
      if (t) {
        for (const o of orderPayloads(action.tool, t.x, t.y)) _send(o);
        Hud.toolUsed(action.tool, t.x, t.y); // keeps the tool armed (only 'move' is one-shot)
        nudgeOnIntent(); // a designation nobody will come and act on while the ship is stopped
      }
      // EXACTLY ONE TOAST PER CLICK, and the suppression line WINS when it applies. The two say
      // different things — "your click did not open this room" versus "your order landed" — and the
      // refusal is the one the player did not expect, so it is the one worth the 2.6 s. Firing both
      // would race for the same element and the second would simply erase the first.
      if (!orderSuppressionToast(action.tool, hit) && t) {
        // `orderPlacedLine` returns '' for a tool this bar does not lower. `toast('')` would
        // UN-HIDE an empty box for 2.6 s, which reads as a glitch rather than as silence — so an
        // empty line stays silent. Unreachable today (the 'order' action only fires for
        // ORDER_TOOLS), and kept because the two functions' vocabularies could drift apart.
        const line = orderPlacedLine(action.tool, t.x, t.y, _ctx.frame ? _ctx.frame.deck : 0);
        if (line) toast(line);
      }
      break;
    }
    // UN-DESIGNATE (M1-C). Same tier as 'order' and the same shape, with one difference that is the
    // whole feature: WHICH command goes out is read off the tile, not off the tool. The mark list is
    // DECODED at click time from the same shared cache the surface draws from (`Hud.getMarks()`) —
    // ⚠️ not a fresher SOURCE, which the first version of this comment implied: the gap it closes is
    // one repaint, not one wire message, and the cache is identical either way.
    case 'erase': {
      const t = pointToTile(svg, e);
      if (t) {
        const deck = _ctx.frame ? _ctx.frame.deck : 0;
        const mark = markNameAt(decodeMarks(Hud.getMarks()), t.x, t.y, deck);
        // `zoned` is false: this surface does not read the `zones` channel (it draws no zone layer),
        // and `tileOrders`' header carries the argument for why that is honest — the host has already
        // ranked strip above stockpile on the `marks` channel, so a second click clears the zone.
        const target = eraseTarget(tileOrders(mark, false));
        for (const o of erasePayloads(target, t.x, t.y)) _send(o);
        Hud.toolUsed(ERASE_TOOL, t.x, t.y); // keeps the tool armed (only 'move' is one-shot)
        if (target) nudgeOnIntent(); // the crew must still be running to notice the order is gone
        // ⚠️ ERASE DOES NOT ROUTE THROUGH `orderSuppressionToast`, AND THAT IS A DECISION, NOT AN
        // OVERSIGHT — it was one until independent review drove it (2026-07-29). Suppression replaces
        // the verb's own line with "ERASE ARMED — ESC TO DISARM" on any room/＋ADD ROOM hit, and for
        // an ORDER that is right: the mark appearing IS the confirmation, so the only thing left to
        // explain is why the room did not open. ERASE HAS NO SUCH SECOND SIGNAL. Its miss sends no
        // command and changes no pixel, so inside a room — which is where every device a player wants
        // to un-condemn lives — suppression put the miss straight back into silence, which is the
        // exact failure this package exists to remove (`invisible-feedback-is-FUNCTIONAL`).
        //
        // So the erase line ALWAYS wins, and the refusal is APPENDED rather than dropped: one toast
        // carrying both facts. `orderClickSuppressed` is the same predicate the ORDER branch uses,
        // shared rather than restated so the two cannot come to disagree about which hits navigate.
        let line = erasePlacedLine(target, t.x, t.y, deck);
        if (orderClickSuppressed(hit)) line += ' · ESC TO DISARM';
        toast(line);
      }
      break;
    }
    case 'select': Hud.selectCrewByCid(action.cid); break;
    case 'terminal': Hud.selectTab('moss'); break; // clicking a console on the map opens MOSS (IX-M1)
    // M1-L: the `addroom` case is DELETED with the chip that produced it (`overviewClickAction` can
    // no longer return that type). Every compartment now falls to `enterRoom`.
    case 'enterRoom': _onEnterRoom(action.anchor); break;
    default: break; // space outside every compartment → no-op (IX-O-18)
  }
}

/**
 * THE ORDER BRANCH'S POINT-OF-FAILURE FEEDBACK. An armed order tool OWNS the click (`'order'` is
 * second only to `'move'` in `overviewClickAction`), so with DIG armed a click on a room designates
 * its tile and the room DOES NOT OPEN. That was silent: the ORDERS bar says `⛏ DIG ▸ CLICK DEBRIS ON
 * DECK 0` up in the command bar, and `#ov-toast` stayed empty and hidden at the moment of the click,
 * so nothing anywhere said why the room refused. Measured 2026-07-26 alongside BUG-B, and reported
 * as the same symptom by the owner — this is the SECOND silent way a room "will not open".
 *
 * DELIBERATELY NARROW: only the hit where the surface would otherwise have NAVIGATED — entering a
 * compartment. (It was TWO hits until M1-L deleted the ＋ADD ROOM picker; the rule is unchanged, the
 * set it ranges over got smaller.) It does NOT fire on a pawn or a terminal hit, and that
 * is measured rather than tidy: on `--ship grid` the crew stand exactly on the dig debris (HANDOVER
 * §4b limit 2), so a pawn-hit toast would fire on nearly every click of DIG's hot path and train the
 * player to ignore the toast. Designating OVER a pawn or a device is the intended use of the verb
 * (`overviewClickAction`'s precedence exists for exactly that); being refused a room is not.
 *
 * ⚠️ "NARROW" NOW MEANS NARROW IN WORDING, NOT IN SILENCE. When this function declines, the caller
 * writes `orderPlacedLine` instead, so a pawn hit is no longer mute — it CONFIRMS. That is the
 * Overview's half of the owner's report (HANDOVER §4g): arming STRIP and clicking a MedBed sent the
 * command and left `#ov-toast` empty and hidden, while the Room Zoom has toasted every committed
 * order since WP-2. The measured argument above survives intact and is what still keeps THIS
 * function narrow: a REFUSAL fired over every pawn would fire on nearly every click of DIG's hot
 * path, and a refusal is a claim that nothing happened — which, over a pawn, is false.
 *
 * RETURNS WHETHER IT FIRED, so the caller can fall through to the order-placed toast without the
 * two of them racing for `#ov-toast`. It is a boolean and not an implicit `undefined` because the
 * caller's choice is a real one — see the call site.
 */
function orderSuppressionToast(tool, hit) {
  if (!orderClickSuppressed(hit)) return false;
  toast(String(tool).toUpperCase() + ' ARMED — ESC TO DISARM');
  return true;
}

/**
 * THE PREDICATE ALONE: did this click land on something the surface would otherwise have NAVIGATED
 * to — a compartment? Extracted from `orderSuppressionToast` (M1-C review) because ERASE needs the
 * ANSWER without the toast: it appends the refusal to its own line instead of being replaced by it.
 * One predicate, two callers, so "which hits navigate" cannot come to mean two different things on
 * one surface. PURE (no DOM, no module state).
 *
 * ⛔ **M1-L GREW WHAT THIS COVERS, AND THE COMMENT THAT STOOD HERE SAID THE OPPOSITE.** It claimed
 * *"coverage did not shrink; one term absorbed the other"* — true of the `addRoomSlot` term and
 * false of the whole. `hitTest` had THREE tiers over a hall, not two:
 *
 *   | pre-M1-L click inside an untyped hall | old hit | suppressed? |
 *   |---|---|---|
 *   | on the 68×16 centred `＋ ADD ROOM` chip | `addRoomSlot` | YES |
 *   | **anywhere else in the hall rect** (`.pl-hall`) | **`hallSlot`** | **NO** |
 *
 * The chip's tier was absorbed. **The hall BODY's tier was not — it became `roomAnchor`, so it is
 * now suppressed where it never was.** Coverage grew, over the whole interior of five deck-0
 * compartments on the shipping ship.
 *
 * ⚠️ **AND IT GREW OVER EXACTLY THE TILES THE DIG VERB TARGETS. MEASURED, DRIVEN, NOT INFERRED**
 * (`--ship wreck`, live host, 20 ticks): **all 20 of deck 0's debris tiles sit inside
 * `hall_d0_s7`'s interior rect (34,11)-(43,16) — `ROOM B3` — and 0 sit anywhere else.** None of
 * them boots designated, so painting them is the player's opening job. *(That census is MEASURED,
 * dated, and deliberately NOT pinned by a test — it is a fact about `AuthoredShips.PeriluneWreck`'s
 * debris layout, which a content lane may legitimately move. Re-measure it; do not quote it.)*
 * ⇒ **DIG on the spine still
 * reads `⛏ DIG ORDERED ▸ 28,9 ON DECK 0`; DIG on any of the 20 debris tiles now reads
 * `DIG ARMED — ESC TO DISARM` instead. The placement confirmation is unreachable for every debris
 * tile on the deck the game opens on.**
 *
 * ⭐ **WHAT IS AND IS NOT LOST, because the difference matters and the review's phrasing ("replaced
 * by a refusal") overstates it in one direction.** The ORDER IS STILL SENT — `_send(orderPayloads…)`
 * runs unconditionally, above this call — and the amber mark still appears on the tile. What the
 * player loses is the *worded* confirmation, replaced by a line about a room that did not open.
 * `orderSuppressionToast`'s own doc argues a refusal on DIG's hot path would train the player to
 * ignore the toast; that argument now applies to the suppression line itself.
 *
 * ⛔ **FILED AS A KNOWN LIMIT, NOT FIXED HERE, AND THE FIX IS NAMED.** The candidate is the one this
 * file already uses ten lines down: ERASE **appends** `' · ESC TO DISARM'` to its own line instead
 * of being replaced by it (M1-C, for exactly this reason — an invisible refusal). Applying the same
 * shape to the ORDER branch would restore the confirmation and keep the navigation note. It is NOT
 * taken in this send-back because "exactly one toast per click, and suppression WINS" is a measured
 * player-facing decision from M1-C, and reversing it is the owner's call, not a review fix.
 */
function orderClickSuppressed(hit) {
  return !!hit && hit.roomAnchor != null;
}

/**
 * Lower an ORDER tool + tile to its wire payloads. THE ONE PLACE this surface turns a designation
 * into a message, and deliberately NOT `Cmd.build`: an order goes to the designation boards
 * (`DigJobSource` / `DeconstructSystem`), whereas `Cmd.build` goes to `BuildSystem`, which knows
 * nothing about designations and would silently swallow it.
 *
 * IT MUST STAY BYTE-IDENTICAL TO `paletteOrders` (`client/src/input/controls.js:69`). There are
 * THREE independent lowering paths for these verbs — the console's `paletteOrders`, the Room Zoom's
 * `orderPayloads`, and this one — and the day any two disagree is the day one surface starts sending
 * a message the host reads differently. `client/test/overview-model.test.js` pins that by IMPORTING
 * `paletteOrders` and comparing what came out of the injected `send`, so a drift on EITHER side
 * reddens. This function deliberately does NOT call `paletteOrders`: if it did, a drift there would
 * move both sides together and the comparison would stay green through it — the same reasoning
 * `room-model.test.js` records for the Room Zoom's copy.
 *
 * ⚠️ IT STILL RETURNS A LIST THOUGH EVERY BRANCH IS NOW LENGTH 1, and that is not vestigial. The
 * shape is `paletteOrders`' contract, this function is pinned against it by `deepEqual`, and a
 * stockpile paint — the one verb that lowers to TWO commands — is a `Cmd.stockpile` followed by a
 * `Cmd.filter`. That verb lives in the Room Zoom now (`roomzoom-view.js` `orderPayloads`, which
 * owns the pair and the mask); narrowing this to a single payload would make the two lowerings
 * different shapes for no gain and would have to be undone by anything that ever adds a
 * two-command order verb here.
 *
 * NO `stockpile` BRANCH, AND AN ARMED `stockpile` NEVER REACHES THIS FUNCTION: `isOrderTool` no
 * longer classes it (`overview-model.js`), so `overviewClickAction` never returns an `'order'`
 * action for it. A stray call would fall to the empty list — silence, not a wrong message.
 *
 * `on` is always true HERE, and that is now a statement about THIS FUNCTION rather than about the
 * client. It paints; `erasePayloads` below un-paints. The sentence this replaces was the gap M1-C
 * closed: *"this surface paints intent and never erases it. UN-DESIGNATING IS A KNOWN CLIENT GAP —
 * `Cmd.dig(x, y, false)` rides the wire and the TUI sends it (`GameLoop.cs:322`), but no surface in
 * `client/` does, the console included."* The console still does not, and never will.
 */
function orderPayloads(tool, x, y) {
  if (tool === 'dig') return [Cmd.dig(x, y, true)];
  if (tool === 'strip') return [Cmd.strip(x, y, true)];
  return [];
}

/**
 * Lower an ERASE target + tile to its wire payloads (M1-C) — the OFF half of `orderPayloads`, kept
 * as its own function because its input is not a tool but a TARGET (`room-model.js` `eraseTarget`):
 * which order this particular tile carries. A null target is an empty list, never a message.
 *
 * ⚠️ STOCKPILE OFF IS **ONE** COMMAND, NOT THE PAIR. Painting a zone always sends `Cmd.stockpile`
 * THEN `Cmd.filter` because a repaint must re-assert the whole truth — but
 * `DesignateStockpileCommand` with `on:false` clears the accept-filter itself
 * (`sim/Sim.Core/Commands/Commands.cs:186`), so a trailing `Cmd.filter` here would set a mask on a
 * tile that is no longer a zone: an orphan in the ZONE hash, which is exactly what the OFF path
 * exists to avoid. This asymmetry is the single most likely "tidy-up" regression in this file.
 *
 * NONE OF THE THREE OFF PATHS HAS A PRECONDITION. `DesignateDigCommand`'s legality check is
 * `if (_on && …)` (`:152`) and `DeconstructSystem.Cancel` is *"pure forgetting"* — no staged
 * material, no reservation — so erasing a tile that is not what the client thought it was is a
 * silent no-op sim-side, never a corruption.
 *
 * @param {'dig'|'strip'|'stockpile'|null} target  `eraseTarget` output
 * @param {number} x @param {number} y
 * @returns {object[]} 0..1 Cmd payloads
 */
function erasePayloads(target, x, y) {
  if (target === 'dig') return [Cmd.dig(x, y, false)];
  if (target === 'strip') return [Cmd.strip(x, y, false)];
  if (target === 'stockpile') return [Cmd.stockpile(x, y, false)];
  return [];
}

/** DOM hit → {pawnCid|terminalId|roomAnchor}, richest-first (IX-O-11/13/15). */
function hitTest(target) {
  if (!target || !target.closest) return {};
  const pawn = target.closest('.pl-pawn');
  if (pawn && pawn.dataset.cid != null) return { pawnCid: Number(pawn.dataset.cid) };
  // ⚠️ A TERMINAL OUTRANKS THE ROOM IT SITS INSIDE — RECORDED, NOT FIXED. `term_hydro` is a
  // ~15.5×13.5 px chip drawn INSIDE the hydroponics room's rect, so a press on that one spot opens
  // MOSS instead of entering the room. That is a THIRD way a room "does not open" (measured
  // 2026-07-26 alongside BUG-B and the armed-order suppression above), and it is deliberately left
  // alone: unlike the other two it is not silent — MOSS takes over the whole window, so the player
  // sees exactly what happened — the precedence is the documented richest-first rule
  // (IX-O-11/13/15), and demoting it would make the map's consoles unreachable at Level 1. Changing
  // it is a design decision about what a console chip is FOR, not a bug fix.
  const term = target.closest('.pl-terminal');
  if (term && term.dataset.tid != null) return { terminalId: term.dataset.tid };
  // M1-L: the `.pl-addroom` chip tier and the `.pl-hall` miss tier are DELETED — `overview-scene.js`
  // emits neither class any more, so both `closest` calls could only ever return null.
  const room = target.closest('.pl-room');
  if (room && room.dataset.anchor) return { roomAnchor: room.dataset.anchor };
  return {};
}

/** Map a DOM click to a sim tile via the SVG CTM + the cached deck transform, or null. */
function pointToTile(svg, e) {
  if (!svg.createSVGPoint || !svg.getScreenCTM) return null;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const v = pt.matrixTransform(ctm.inverse());
  return tileAt(_ctx.transform, v.x, v.y, _ctx.frame);
}

function onHudClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('.ov-stage')) return; // scene has its own handler
  // M1-L: the `#ov-picker` backdrop-dismiss and the `ovPick` / `ovPickCancel` button branches are
  // DELETED with the picker itself.
  const btn = t.closest('button');
  if (!btn || btn.disabled) return;
  const d = btn.dataset;
  if (d.ovDeck != null) { _send(Cmd.deck(deckDelta(Number(d.ovDeck), _ctx.frame ? _ctx.frame.deck : 0))); }
  else if (d.ovLens != null) { _send(Cmd.lens(d.ovLens)); }
  else if (d.ovTab != null) { if (!tabIsInert(d.ovTab)) Hud.selectTab(d.ovTab); } // CHRONICLE kept but inert
  else if (d.ovTool != null) { Hud.armTool(d.ovTool); afterToolToggle(btn, e); }
  else if (d.ovCrew != null) { Hud.selectCrewByCid(d.ovCrew); }
  // M2-3 — a WORK grid cell. Keyed on the CID half; both halves are read inside.
  else if (d.ovWorkCid != null) { onWorkCellClick(btn, d, e); }
  else if ('ovSpeedDn' in d) { _send(Cmd.speed(-1)); }
  else if ('ovSpeedUp' in d) { _send(Cmd.speed(1)); }
  else if ('ovCaution' in d) { Hud.selectTab('moss'); } // ship-status chip → MOSS diagnostics
  else if ('ovPause' in d) { _send(Cmd.pause()); }
  // The nudge IS its own fix: it complains that the ship is stopped, so clicking it starts it.
  else if ('ovNudge' in d) { _send(Cmd.pause()); }
  else if ('ovTalk' in d) { Hud.talkSelectedCrew(); }
  else if ('ovMove' in d) { Hud.armTool('move'); afterToolToggle(btn, e); }
  else if ('ovBio' in d) { Hud.openBioForSelected(); }
}

// ── transient toast (room-zoom stub) ──

function toast(msg) {
  if (!_toast) return;
  _toast.textContent = msg;
  _toast.hidden = false;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toast.hidden = true; }, 2600);
}

const $ = (id) => document.getElementById(id);
