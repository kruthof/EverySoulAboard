// MOSS terminal — the DOM/CRT face ("the phosphor ledger"). Contract:
// `docs/design/perilune-moss-terminal.spec.md` §3 (IX-M, interaction) and §4 (VS-M, the look).
//
// This file is GLUE. Every rendering DECISION — what a row says, which screen is up, what a key
// does in each prompt-buffer state — lives in the pure `moss-model.js`, which the `moss-model`
// lane owns and this file only consumes through the frozen §2 API. What lives here: the element
// tree, the monospace column geometry, the takeover, the key/click plumbing, and the translation
// of the model's `effects` into wire messages.
//
// THE TAKEOVER (IX-M1) is a real takeover, not an overlay: `body.moss-open` makes `.app` (top bar,
// CREW WATCH, stage, READOUT, bottom console), the floating `#panels` layer and the disconnect
// overlay `display:none`, and un-hides the full-window `#moss-view` root. Nothing of the game
// console shows through, and the ship canvas / composeScene / executors are never touched — MOSS
// simply is not drawing them. `styles.css` owns those rules; `applyTakeover` is the one switch.
//
// COLUMN ALIGNMENT (VS-M2/VS-M4) is by MONOSPACE GRID, not CSS table cells: every ledger line is
// built as ONE fixed-width string (space-padded to the COLS geometry below) and rendered in a
// `white-space:pre` element, so a `--` load or a missing fault shifts nothing. A row's
// `textContent` is therefore a well-formed fixed-width line, which is exactly what the node tests
// assert. The load bar is text (`[████▒▒▒▒]`), never a DOM widget.

import { Cmd } from '../wire/session.js';
import * as MODEL from './moss-model.js';
import { MossProgramEditor } from './moss-program-editor.js';

/** The monospace column geometry (character cells). Exported so the tests assert real offsets. */
export const COLS = {
  gutter: 2,   // '> ' on the selected row, two spaces otherwise — nothing shifts on move (VS-M3)
  label: 18,
  bar: 10,     // '[' + 8 cells + ']' (VS-M4 fixes the bar at 8 cells)
  gapBar: 2,
  load: 4,     // right-aligned: '100%' | ' 61%' | '  --'
  gapLoad: 3,
  state: 12,   // 'ATTEND ⚠' etc., left-aligned (the ⚠ is width-pinned to 1ch in CSS)
};
/** Character offset of each column's first cell. */
export const COL_AT = (() => {
  const label = COLS.gutter;
  const bar = label + COLS.label;
  const load = bar + COLS.bar + COLS.gapBar;
  const state = load + COLS.load + COLS.gapLoad;
  return { label, bar, load, state, fault: state + COLS.state };
})();

/** The ledger's column header line (VS-M6 sits it under the rule, above the rows). */
export const HEAD_LINE =
  ''.padEnd(COLS.gutter) +
  'SYSTEM'.padEnd(COLS.label) +
  'LOAD'.padEnd(COLS.bar + COLS.gapBar + COLS.load + COLS.gapLoad) +
  'STATE'.padEnd(COLS.state) +
  'LAST FAULT';

/** The DETAIL device-table geometry (same monospace rule as the ledger). */
export const DEV_COLS = { name: 20, kind: 14, cond: 6, power: 5, rate: 7, loc: 18 };

/** ⭐ M3-4 — the POD BAY geometry. `#` right-aligned so a two-digit bay stays in column; the
 *  reason column is deliberately LAST and unpadded, because it is the only one allowed to be long
 *  (`NEEDS 3 CONTROLLER MODULE — SHIP HAS 0`) and truncating it would delete the feature. */
export const POD_COLS = { gutter: 2, num: 4, occupant: 14, state: 12 };

/** The POD BAY's column header line. */
export const POD_HEAD_LINE =
  ''.padEnd(POD_COLS.gutter) +
  '#'.padStart(2).padEnd(POD_COLS.num) +
  'OCCUPANT'.padEnd(POD_COLS.occupant) +
  'STATE'.padEnd(POD_COLS.state) +
  'WHY / WHAT IT NEEDS';

/**
 * How often the POD BAY re-asks the ship for its census, in milliseconds.
 *
 * ⚠️ A POLL, AND IT HAS TO BE ONE. The bay is a REQUEST/REPLY op (`moss pods`), not a pushed
 * channel, and the badge on a cycling capsule counts DOWN — a screen that drew once would freeze
 * `4 min` on the wall while the capsule opened behind it. Re-asking on the pushed `systems`
 * message was tried and rejected: `GameSession.Send` drops a channel whose payload is byte-identical
 * to the last one, so a quiet ship stops delivering `systems` altogether and the bay would stall
 * exactly when nothing else is happening — which is most of a cycle.
 */
export const POD_REFRESH_MS = 1000;

/**
 * ⛔ WHAT THE BAY SAYS WHEN ITS POLL HAS GONE QUIET — see `refreshPods`. Rendered on the bay itself,
 * not on the transcript: the transcript is what this package is protecting, and a per-second status
 * note there would be the very defect wearing a politer sentence. It names the recovery verb because
 * `pods` is how the player restarts the poll, and *invisible feedback is functional*.
 */
export const POD_POLL_STALE = 'LIVE REFRESH PAUSED — MOSS DID NOT ANSWER · TYPE PODS TO RETRY';

/** IX-M13's headline. The MODEL is the authority (`ledgerView().notice`); this is the fallback for
 *  a model old enough not to carry one, and the constant this file's own tests read. */
export const NO_TELEMETRY = 'NO TELEMETRY — LINK DOWN';

/**
 * The ONLY keys this layer may swallow on its own account, and only away from the prompt: they
 * scroll the page, which would slide the ledger out from under the player while the model is busy
 * deciding it does not want the key.
 *
 * This is an ALLOWLIST because the obvious shortcut — "any key whose name is longer than one
 * character cannot type" — is false and shipped a real defect: it also matched `Backspace`,
 * `Delete`, `ArrowLeft/Right`, `Home`, `End` and `Tab`, so the command prompt could be typed into
 * but never CORRECTED. A player who mistyped `open reacotr` had no way back but ESC, which throws
 * the whole line away. It also silently overrode the model across the entire multi-character key
 * space, including `Tab`, which `KEY_ROUTE` leaves unbound ON PURPOSE so focus traversal keeps
 * working. Widening this list is almost always the wrong repair: if a key needs swallowing, the
 * model should be claiming it via `handled`.
 */
export const SCROLL_KEYS = ['PageUp', 'PageDown', ' ', 'Spacebar'];

/**
 * How far from the bottom of `.moss-console` still counts as "the player is at the bottom",
 * in CSS pixels.
 *
 * ⭐ SIZED AGAINST THE SHIPPED LINE BOX, MEASURED IN CHROME BY `moss-scroll-shot.mjs` (2026-08-04,
 * the wreck at 1280×800): the pane's `clientHeight` is 157 and `help`'s 14 lines make `scrollHeight`
 * 305 — a **21.79px** line box, so the pane holds ~7 lines. (Do not re-derive this from `22vh` and
 * `--moss-fs`; both were tried on paper and both came out wrong. The rig prints `lineBox` on every
 * run — take it from there.) So the slack is a little over ONE line box:
 *   · big enough that a FRACTIONAL scroll metric or a half-visible last line still reads as the
 *     bottom (Chrome reports `scrollTop`/`clientHeight` as fractions, and an exact
 *     `scrollHeight - clientHeight` comparison then flickers off by <1px);
 *   · far smaller than a deliberate scroll — one wheel notch in Chrome moves ~100px, nearly five
 *     line boxes, so a player who scrolled up to read history is never mistaken for one who did not.
 * It is deliberately not TIGHTER than a line: a reader who nudged the wheel a single trackpad detent
 * would be dragged back to the bottom on the next append, which is the defect wearing a smaller hat.
 */
export const TAIL_SLACK_PX = 24;

/**
 * ⭐ THE TERMINAL CONTRACT, AS ONE PURE DECISION (OD-P: the MOSS console is a real terminal).
 *
 * Given the console pane's scroll metrics **as they were BEFORE new output was appended**, should
 * the view follow the newest line? The standard "pinned to bottom" idiom, and the whole of the
 * package's behaviour lives here so it can be driven in node without a layout engine:
 *
 *   · at (or within `slack` of) the bottom  ⇒ TRUE  — output arrives, the view follows it.
 *   · scrolled up into the history          ⇒ FALSE — the player is reading; hold their place.
 *   · nothing overflows the box             ⇒ TRUE  — `scrollHeight <= clientHeight` means there is
 *     no history to be reading, so the next append must be followed. (This is also the FIRST-PAINT
 *     case: an empty `.moss-console` is `display:none`, so every metric reads 0.)
 *
 * ⛔ WHY THIS IS A "BEFORE" QUESTION AND NOT AN "AFTER" ONE — and the reason is the APPEND, not any
 * browser quirk. `_renderConsole` rebuilds the transcript from the model's whole line list, so after
 * the rebuild `scrollHeight` already includes the new lines. Ask the question then and a player who
 * WAS at the bottom measures as `height - client - top` = exactly the height of what just arrived,
 * i.e. "not at the bottom" — so the console would never follow anything again. That is not a
 * hypothesis: moving these three reads below `replaceChildren` is a named mutation, and it reds with
 * `scrollTop 0.0 of a possible 148.0`.
 *
 * ⚠️ AN EARLIER DRAFT OF THIS COMMENT BLAMED A CLAMP, AND THE CLAMP IS NOT REAL — corrected 2026-08-04
 * after review, MEASURED on the shipped pane in Chrome rather than reasoned about. Parked at
 * `scrollTop 357` of a 714 maximum, the exact `_renderConsole` call shape (one synchronous
 * `replaceChildren`, nothing read while the box is empty) leaves `scrollTop` at **357**; even forcing
 * a layout read while the box IS empty — `scrollHeight` really does read 0 and `scrollTop` really
 * does read 0 in that instant — ends at **357** once the children are back, because Chrome restores
 * the offset within the same task; and six real 1 Hz wire-driven rebuilds left a parked pane at 357
 * all six times. So nothing was resetting the pane. It sat at 0 because it had never been anywhere
 * else and every new line appended BELOW the fold: the FOLLOW arm is the whole of the fix.
 *
 * Metrics are coerced rather than trusted: a detached or `display:none` element reports 0, and the
 * node harness's elements report `undefined` until a test gives them a layout.
 *
 * @param {number} scrollTop     the pane's scroll offset before the append
 * @param {number} clientHeight  the pane's visible height before the append
 * @param {number} scrollHeight  the pane's content height before the append
 * @param {number} [slack]       px of overhang that still counts as the bottom (TAIL_SLACK_PX)
 * @returns {boolean}
 */
export function shouldFollowTail(scrollTop, clientHeight, scrollHeight, slack) {
  const top = px(scrollTop);
  const client = px(clientHeight);
  const height = px(scrollHeight);
  const give = typeof slack === 'number' && isFinite(slack) && slack >= 0 ? slack : TAIL_SLACK_PX;
  if (height <= client) return true;          // nothing overflows ⇒ there is no history to read
  return height - client - top <= give;       // ≤ slack from the bottom ⇒ still pinned
}

/** A layout metric as a finite number. Anything else (undefined, NaN, a string) is 0. */
function px(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

/**
 * How much of a transcript line may hang past the bottom edge of `.moss-console` and still count as
 * read. One pixel, the same tolerance `console-model.moreBelow` uses on the CREW table and the same
 * one `client/tools/moss-scroll-shot.mjs` uses (0.5) when it asks whether a row is inside the pane:
 * Chrome reports these rects as fractions, so an exact `>` comparison flickers a phantom "▾ 1 MORE"
 * on and off at the tail as the pane's own sub-pixel rounding moves.
 */
export const FOLD_SLACK_PX = 1;

/**
 * ⭐ THE SCROLL AFFORDANCE'S ONE DECISION: how many transcript lines sit below the visible fold of
 * `.moss-console`, for the "▾ N MORE" indicator. PURE — the caller hands it geometry it read off
 * the DOM, nothing here touches an element.
 *
 * ⛔ WHY THIS IS A SIBLING OF `console-model.moreBelow` AND NOT A CALL TO IT. The CREW-tab
 * affordance this package copies divides the overhang by ONE UNIFORM ROW STRIDE
 * (`hud.js:updateCrewMore` reads it off the first `.crew-trow`, and every crew row is the same
 * height by construction — a fixed grid of single-line cells). **MOSS transcript lines are not
 * uniform, and that is MEASURED, not argued.** `.moss-cline` is `white-space:pre-wrap` with a
 * hanging indent (`text-indent:-2ch`), and on the shipped wreck in Chrome at 1280×800 (2026-08-04,
 * every `.moss-cline`'s own `getBoundingClientRect().height`):
 *
 *     21.77  HELP                  this list          ← and all fourteen HELP columns
 *     21.77  > commission
 *     43.53  MOSS IS OFFLINE — NO SHIP TERMINAL IS IN SERVICE …   ⇐ EXACTLY TWO LINE BOXES
 *     21.77  NO POD BAY ON THIS LINK — TYPE PODS
 *     43.53  MOSS IS OFFLINE — …                                   ⇐ two again (the `doors` refusal)
 *
 * The gate sentences the 2026-08-04 lanes made deliberately explicit are the ones that wrap — and
 * they are exactly the lines a player scrolls back to re-read. A stride would therefore be a SECOND
 * AUTHORITY on the layout, and wrong on precisely the rows the count is about: read off the first
 * row it is 21.77, so a pane hiding four of those refusals would divide 8 line boxes by 21.77 and
 * announce "▾ 8 MORE" for 4 lines. (This is not a new finding — `moss-scroll-shot.mjs`'s `PANE`
 * expression already refuses a stride for the same reason and asks `getBoundingClientRect` per row.
 * This helper is that instrument's shape, made pure.) So the count is taken from EACH LINE'S OWN
 * BOX, and it means what it says: N more lines you have not fully read.
 *
 * A line counts as below the fold when its bottom edge falls past the pane's bottom edge — i.e. a
 * half-visible last line COUNTS, because half a sentence is not a line you have read. That is the
 * same predicate the browser rig calls `visible`.
 *
 * ⛔ THE DEGRADATION DIRECTION IS THE OPPOSITE OF `shouldFollowTail`'S, AND DELIBERATELY SO. An
 * unmeasurable pane (`foldBottom - foldTop <= 0`: detached, `display:none`, or a node harness with
 * no layout engine — and an EMPTY `.moss-console` really is `display:none`) returns 0, i.e. the
 * indicator hides. Following wrongly costs a moved view; counting wrongly PRINTS A NUMBER THAT IS A
 * LIE, and "▾ 12 MORE" over a pane with nothing below it is worse than the silence we shipped
 * before.
 *
 * @param {number[]} rowBottoms  each transcript line's bottom edge, in the same coordinate space as
 *                               the fold (viewport coordinates, i.e. `getBoundingClientRect`)
 * @param {number} foldTop       the pane's top edge
 * @param {number} foldBottom    the pane's bottom edge — the fold
 * @param {number} [slack]       px of overhang that still counts as read (FOLD_SLACK_PX)
 * @returns {number}
 */
export function linesBelowFold(rowBottoms, foldTop, foldBottom, slack) {
  const top = px(foldTop);
  const bottom = px(foldBottom);
  if (!(bottom - top > 0)) return 0;          // no laid-out pane ⇒ no honest count ⇒ no indicator
  const give = typeof slack === 'number' && isFinite(slack) && slack >= 0 ? slack : FOLD_SLACK_PX;
  const rows = Array.isArray(rowBottoms) ? rowBottoms : [];
  let n = 0;
  for (const b of rows) if (px(b) > bottom + give) n += 1;
  return n;
}

/** A live element's bottom/top edges as finite numbers. Anything without a rect reads {0,0}, which
 *  `linesBelowFold` treats as "unmeasurable" rather than as a real zero-height box. */
function edges(el) {
  const r = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
  return r ? { top: px(r.top), bottom: px(r.bottom) } : { top: 0, bottom: 0 };
}

/**
 * ⛔ THE SCROLLER'S OWN `padding-bottom`, AND THE REASON THIS FUNCTION EXISTS AT ALL — a REGRESSION
 * THIS PACKAGE SHIPPED AND REVIEW CAUGHT (2026-08-04, fix-back).
 *
 * `.moss-console-wrap.has-more .moss-console{padding-bottom:1.75em}` is the clearance that keeps the
 * last line out from under the sign. It is `padding` on the SCROLLER, so **the browser counts it in
 * `scrollHeight`** — measured on the shipped pane by toggling the class: `padding-bottom` 0 →
 * 23.52px, `scrollHeight` 326 → 350, `clientHeight` unchanged at 157.
 *
 * ⛔ AND `shouldFollowTail` IS ASKED IN `scrollHeight` UNITS, so feeding it the padded number
 * silently REDEFINED `TAIL_SLACK_PX`. The arithmetic, from those measured numbers: the sign turns on
 * once anything hangs >1px past the fold, and with it on the follow test becomes
 * `d + 23.52 <= 24`, i.e. **d ≤ 0.48px — an effective slack of about ONE pixel where IX-M15 pins
 * TWENTY-FOUR.** IX-M15's whole follow-within-slack arm was unreachable in the product whenever the
 * sign was up. DRIVEN A/B in one Chrome session, the reviewer's cells re-measured on the shipped
 * lane build: parked at d = 10.48 with `▾ 1 MORE` up, real output arrived and the view **HELD** at
 * `scrollTop 355 of 454`; with the clearance neutralised (`padding-bottom:0 !important`, i.e. main's
 * scroller geometry) the same gesture **FOLLOWED** to the tail.
 *
 * ⭐ SO THE CLEARANCE IS SUBTRACTED BEFORE THE QUESTION IS ASKED, and `shouldFollowTail`'s contract
 * is restored EXACTLY rather than re-specified (the autoscroll lane's pin is merged; it is not this
 * package's to move). The fix is here rather than in the stylesheet because it holds for ANY
 * clearance a later lane chooses — the follow question is about CONTENT, and padding is not content.
 *
 * Degrades to 0: no window, no `getComputedStyle`, a non-numeric value. That is the right direction —
 * 0 means "ask exactly what main asked", i.e. the pinned behaviour.
 *
 * @param {object} win  the window (`getComputedStyle` lives there; the node harness injects one)
 * @param {object} el   the scroller
 * @returns {number}    padding-bottom in CSS px, 0 when it cannot be read
 */
function padBottomPx(win, el) {
  if (!el || !win || typeof win.getComputedStyle !== 'function') return 0;
  let style = null;
  try { style = win.getComputedStyle(el); } catch { return 0; }
  // `parseFloat` is culture-free here BY THE SPEC, not by luck: a computed style is always a
  // CSS `<length>` serialised with a `.` decimal separator, whatever the machine's locale.
  return style ? px(parseFloat(style.paddingBottom)) : 0;
}

const SCREEN = MODEL.SCREEN;
const OFFLINE = MODEL.STATE.OFFLINE;

/**
 * IX-M11's guard, duck-typed exactly as `input/controls.js:isTextEntryTarget` — a node test asserts
 * the two agree on every case. It is a LOCAL copy rather than an import on purpose: importing
 * controls.js here would close a `hud → moss-screen → controls → hud` module cycle for a
 * four-line predicate, and cycles in the client's entry graph have already cost this project a
 * silent-failure debugging session.
 *
 * Why the guard runs BEFORE the model sees a key: the PROGRAM screen hosts the MOSS IDE's textarea,
 * where every keystroke belongs to the editor. The model's own routing takes only Escape on that
 * screen, but that is its half of the seam — refusing to route a key that came out of a text
 * surface at all is this layer's.
 */
export function isTextEntryTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable === true;
}

// ---- the takeover switch (IX-M1) ------------------------------------------------------------

/**
 * Hide/restore the ENTIRE game window. `body.moss-open` is the single hook styles.css keys the
 * takeover off; `#moss-view[hidden]` is the MOSS root's own visibility. Both flip together so
 * there is never a frame with two views up. PURE-ish: touches only these two nodes.
 * @param {Document} doc @param {boolean} open
 */
export function applyTakeover(doc, open) {
  if (!doc) return;
  const body = doc.body;
  if (body && body.classList) body.classList.toggle('moss-open', !!open);
  const view = doc.getElementById ? doc.getElementById('moss-view') : null;
  if (view) view.hidden = !open;
}

// ---- effects → wire (spec §2's effect table) --------------------------------------------------

/**
 * Translate ONE model effect into the wire message that fulfils it, or null when the effect is
 * not a wire request (`exit` is handled by the caller). The MOSS command family is keyed by
 * `"type"`, not `"cmd"` — see the spec §1.2 amendment and `hosts/web/GameSession.cs:956-986`,
 * where a `"cmd":"moss"` message falls through the cmd switch to `default` and is silently
 * dropped. PURE.
 * @param {{k:string, op?:string, tid?:string, text?:string}} e
 * @returns {object|null}
 */
export function wireForEffect(e) {
  if (!e || typeof e.k !== 'string') return null;
  if (e.k === 'chron') return Cmd.chron();
  if (e.k !== 'moss') return null;
  // §1.3: prompt execution addresses the pseudo-terminal `@console`, so the player's own commands
  // land in the same audit ring as the DSL's (IX-M41).
  const tid = e.tid != null && e.tid !== '' ? String(e.tid) : '@console';
  return Cmd.moss(String(e.op || ''), tid, e.text === undefined ? undefined : String(e.text));
}

// ---- small DOM helpers (no innerHTML anywhere in this file) -----------------------------------

function mk(doc, tag, cls, text) {
  const el = doc.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

/** `[TEXT]`-style bracket hints joined the way VS-M7 prints them. */
function joinHints(hints) {
  if (typeof hints === 'string') return hints;
  return Array.isArray(hints) ? hints.filter((h) => h != null && h !== '').join(' · ') : '';
}

/** Tolerant string read — the model lane fills these bodies in parallel, so every read of its
 *  output degrades to a blank rather than throwing mid-render. */
const S = (v) => (v == null ? '' : String(v));

// ---- the screen -------------------------------------------------------------------------------

export class MossScreen {
  /**
   * @param {{
   *   root: HTMLElement,                    the `#moss-view` element from index.html
   *   document?: Document,                  injectable for tests
   *   window?: Window,                      injectable for tests (the capture-phase key listener)
   *   model?: object,                       the moss-model module; injectable so the DOM lane's
   *                                         tests never depend on the model lane's bodies
   *   send?: (msg:object)=>void,            wire sender
   *   onExit?: ()=>void,                    leave MOSS, restore the ship view (effect `{k:'exit'}`)
   * }} opts
   */
  constructor(opts) {
    const o = opts || {};
    this.root = o.root;
    this.doc = o.document || (this.root && this.root.ownerDocument) ||
      (typeof document !== 'undefined' ? document : null);
    this.win = o.window || (typeof window !== 'undefined' ? window : null);
    this.M = o.model || MODEL;
    this.send = o.send || (() => {});
    this.onExit = o.onExit || (() => {});

    this.model = null;      // created by open() — `openMoss()` is a FRESH ledger every entry
    this.opened = false;
    this._systems = null;   // last `systems` message (replayed into a freshly opened model)
    this._chron = null;     // last `chron` message   (the FAULT LOG source)
    this._log = null;       // last `log` message tail
    this._terminals = [];   // the PROGRAM directory, from the `terminals` channel
    this._programTid = null;
    // The POD BAY's 1 Hz poll and its two-flag quiet rule (see `refreshPods`). Declared here so the
    // state a reader has to hold is in one place, and so `_reflectPodPoll`'s `!!this._podTimer`
    // reads a field rather than an absence.
    this._podTimer = null;
    this._podPollAwaiting = false;   // a poll went out and no `ev:pods` has come back since
    this._podPollQuiet = false;      // …and a whole period passed, so the poll has stood down
    this._onKey = (e) => this.handleKey(e);
    this._build();
    // The PROGRAM screen's embedded IDE (a VIEW of `model.program`). Constructed here so the
    // shipping client gets it with no hud.js change; `attachProgramEditor` stays public so tests can
    // swap in a spy. Its gestures route BACK through the pure moss-model (editProgramDraft /
    // beginProgramCompile) + the `moss set|audit` wire ops — it holds no editor state of its own.
    this.attachProgramEditor(new MossProgramEditor({
      document: this.doc,
      onEdit: (text) => this._programEdit(text),
      onInstall: () => this._programInstall(),
      onAudit: () => this._programAudit(),
    }));
  }

  // ---- element tree (built once) --------------------------------------------------------------

  _build() {
    const doc = this.doc;
    if (!doc || !this.root) return;
    const page = mk(doc, 'div', 'moss-page');

    this.headEl = mk(doc, 'div', 'moss-head');
    this.bodyEl = mk(doc, 'div', 'moss-body');
    this.advisoryEl = mk(doc, 'div', 'moss-advisory');
    this.consoleEl = mk(doc, 'div', 'moss-console');

    /**
     * ⭐ THE SCROLL AFFORDANCE (2026-08-04) — "▾ N MORE" over the transcript's bottom edge, the
     * CREW-tab affordance (`hud.js:updateCrewMore` + `.crew-more`) worn by the terminal.
     *
     * ⛔ THE GAP IT CLOSES, and it is what the autoscroll lane's fix left standing: the console now
     * FOLLOWS its newest line, but a reader who scrolled back — or one on a screen that overflows
     * on arrival, `HELP` being 14 lines in a ~7-line pane — has no signal at all that anything is
     * below the fold. `max-height:22vh; overflow-y:auto` renders no visible scrollbar on this
     * platform (`--hide-scrollbars` in the rigs, and macOS overlay scrollbars fade out at rest), so
     * "there is more" was a fact the pane knew and never said. `HELP`'s own footer mitigates one
     * screen; nothing mitigated a long `LOG`.
     *
     * ⛔ IT IS A SIGN, NOT A CONTROL — OD-P, binding. Every printable character belongs to the
     * prompt, so this may never become a thing to click or tab to: it is `pointer-events:none` in
     * the stylesheet, `aria-hidden`, carries no listener, and is not focusable. A player who wants
     * to reach the hidden lines uses the wheel or the scroll keys (`SCROLL_KEYS`) they already
     * have, and those keep exactly the semantics they had.
     *
     * The wrapper exists only so the sign can be positioned against the pane's own bottom edge
     * (`position:relative`), the same reason `#crew-more` lives inside `.crew-tab-wrap`. It adds no
     * height of its own: when the transcript is empty `.moss-console:empty` is `display:none` and
     * the sign is hidden, so the wrapper collapses to 0 exactly as the bare pane used to.
     */
    this.consoleWrapEl = mk(doc, 'div', 'moss-console-wrap');
    this.consoleMoreEl = mk(doc, 'div', 'moss-more', '');
    this.consoleMoreEl.hidden = true;
    this.consoleMoreEl.setAttribute('aria-hidden', 'true');
    this.consoleWrapEl.appendChild(this.consoleEl);
    this.consoleWrapEl.appendChild(this.consoleMoreEl);
    // The count is only true for the offset the pane is AT, so it is recomputed on every scroll as
    // well as on every render. (`_renderConsole` calls the same method after it has applied the
    // follow verdict — the affordance must describe the view the player ends up looking at.)
    if (this.consoleEl.addEventListener) {
      this.consoleEl.addEventListener('scroll', () => this._updateConsoleMore());
    }

    // The `>` prompt. The visible caret is a TEXT block cursor (VS-M10 makes it steady under
    // reduced motion); the real <input> sits transparent over the row so typing anywhere on the
    // LEDGER lands in the buffer without a click (IX-M8) and the browser still owns text editing.
    const prompt = mk(doc, 'div', 'moss-promptrow');
    prompt.appendChild(mk(doc, 'span', 'moss-gt', '>'));
    this.echoEl = mk(doc, 'span', 'moss-echo', '');
    this.cursorEl = mk(doc, 'span', 'moss-cursor', '█');
    this.inputEl = mk(doc, 'input', 'moss-input');
    this.inputEl.setAttribute('maxlength', '240');       // IX-M42 (the host caps independently)
    this.inputEl.setAttribute('spellcheck', 'false');
    this.inputEl.setAttribute('autocomplete', 'off');
    this.inputEl.setAttribute('aria-label', 'MOSS command');
    this.inputEl.addEventListener('input', () => this._onInput());
    prompt.appendChild(this.echoEl);
    prompt.appendChild(this.cursorEl);
    prompt.appendChild(this.inputEl);
    this.promptEl = prompt;

    this.footEl = mk(doc, 'div', 'moss-foot');

    page.appendChild(this.headEl);
    page.appendChild(mk(doc, 'div', 'moss-rule'));
    page.appendChild(this.bodyEl);
    page.appendChild(mk(doc, 'div', 'moss-rule'));
    page.appendChild(this.advisoryEl);
    page.appendChild(this.consoleWrapEl);
    page.appendChild(prompt);
    page.appendChild(this.footEl);

    // VS-M5: ONE overlay element carries the whole CRT treatment (scanlines, vignette),
    // pointer-events:none, never a per-character effect.
    const crt = mk(doc, 'div', 'moss-crt');
    crt.setAttribute('aria-hidden', 'true');

    this.root.replaceChildren(page, crt);
    // Clicking anywhere in the page returns focus to the prompt (IX-M8) — EXCEPT on a text-entry
    // surface the user meant to edit: the prompt input itself, or the PROGRAM editor's textarea.
    // Stealing focus back off the editor would make its textarea unclickable (the browser's own
    // focus-on-mousedown would be undone the same frame).
    page.addEventListener('mousedown', (e) => {
      if (e && (e.target === this.inputEl || isTextEntryTarget(e.target))) return;
      this._focusPrompt();
    });
  }

  // ---- lifecycle ------------------------------------------------------------------------------

  isOpen() { return this.opened; }

  /** Take the window (IX-M1). A FRESH model every entry, then the cached channels are replayed
   *  into it so the ledger is current the instant it appears — never a blank first frame. */
  open() {
    if (this.opened) return;
    this.model = this.M.openMoss();
    this._replayChannels();
    this.opened = true;
    applyTakeover(this.doc, true);
    if (this.win && this.win.addEventListener) {
      // CAPTURE phase: this listener runs before controls.js's window-level (bubble) game-shortcut
      // handler, so while MOSS holds the window no game shortcut can fire (IX-M11).
      this.win.addEventListener('keydown', this._onKey, true);
    }
    this.render();
    // FOCUS LAST, AND AFTER `applyTakeover` — ORDER IS LOAD-BEARING. A hidden element cannot take
    // focus: called while `#moss-view` is still `hidden` (the state MOSS sits in until the line
    // above), `input.focus()` is a silent no-op, `document.activeElement` stays on `<body>` and the
    // player's first keystroke goes nowhere. Verified in Chrome, and pinned by a node test that
    // reorders these two lines.
    this._focusPrompt();
  }

  /** Restore the ship view. Idempotent. */
  close() {
    if (!this.opened) return;
    this.opened = false;
    applyTakeover(this.doc, false);
    if (this.win && this.win.removeEventListener) {
      this.win.removeEventListener('keydown', this._onKey, true);
    }
    this._reflectPodPoll(null);   // the bay's poll must not outlive the window it drew in
    if (this._editor && this._mountedTid && this._editor.detach) this._editor.detach();
    this._mountedTid = null;
    this._mountedEditor = null;
    // A FRESH model every entry (open() calls openMoss(), whose `program` is terminal-less); the
    // remembered selection must reset with it, or a re-entered PROGRAM screen would mount an editor
    // for a tid whose source it never re-fetched.
    this._programTid = null;
  }

  _replayChannels() {
    if (this._systems) this.model = this.M.reduceSystems(this.model, this._systems);
    if (this._chron) this.model = this.M.reduceChron(this.model, this._chron);
    if (this._log) this.model = this.M.reduceLog(this.model, this._log);
  }

  // ---- wire in --------------------------------------------------------------------------------

  /** Fold a `systems` message. Cached even while closed so a later open() shows live telemetry. */
  onSystems(msg) {
    this._systems = msg;
    if (!this.opened) return;
    this.model = this.M.reduceSystems(this.model, msg);
    this.render();
  }

  /** Fold a `moss` event (sys | exec | source | diag | audit | rterror). A `sys` reply's §1.2
   *  `derivation` string is the MODEL's to keep — this layer just hands the message over. */
  onMossEvent(msg) {
    if (!this.opened) return;
    // ⭐ THE POLL'S ONE ANSWER, AND THE ONLY THING THAT CLEARS IT. `ev:'pods'` is the reply a `moss
    // pods` request earns when the ship is live AND commissioned; every other outcome — the
    // `IsServerLive` refusal, the NotCommissioned refusal — comes back as `ev:'exec' ok:false`,
    // which is INDISTINGUISHABLE on the wire from a refused TYPED command (both are
    // `WireFormat.MossExec`, and neither carries the op that produced it). So this seam does NOT
    // try to attribute a refusal; it watches for the ANSWER and lets `refreshPods` draw the
    // conclusion from its absence. Cleared for a reply that arrived LATE, too, which is what makes
    // a poll suspended by a slow link heal itself without the player doing anything.
    if (msg && msg.ev === 'pods') { this._podPollAwaiting = false; this._podPollQuiet = false; }
    this.model = this.M.reduceMossEvent(this.model, msg);
    this.render();
  }

  /** Fold a `chron` message — the FAULT LOG's source WHENEVER IT HAS LANDED (see `faultLogView`;
   *  until it does the live tail stands in). Arrives on the `{k:'chron'}` request this screen makes
   *  when the log opens, and again on every DAY ROLLOVER (`GameSession.cs:1988-1994`), so a log
   *  left open does refresh — once per sim-day. */
  onChron(msg) {
    this._chron = msg;
    if (!this.opened) return;
    this.model = this.M.reduceChron(this.model, msg);
    this.render();
  }

  /** Fold a `log` channel tail — the FAULT LOG's source UNTIL THE CHRONICLE LANDS, and no longer a
   *  second section beneath it (same ring; reading both printed these lines twice). */
  onLog(msg) {
    this._log = msg;
    if (!this.opened) return;
    this.model = this.M.reduceLog(this.model, msg);
    this.render();
  }

  /** The PROGRAM screen's directory, from the existing `terminals` channel (IX-M6). */
  setTerminals(list) {
    this._terminals = Array.isArray(list) ? list : [];
    if (this.opened) this.render();
  }

  // ---- input ----------------------------------------------------------------------------------

  /**
   * The window-level capture handler. Three rules, in order:
   *   0. **Escape is NOT ours to intercept.** IX-M2 makes the pure `escapeTarget` rung the single
   *      authority, and two rungs sit ABOVE MOSS: a still-armed move order (which survives a tab
   *      switch) and an open dialogue. So Escape is deliberately let through to controls.js →
   *      `Hud.handleEscape()`, which calls back into `escape()` only when MOSS wins the rung.
   *      Swallowing it here would silently bypass the rungs above us — the exact bug the pure
   *      decision function exists to prevent.
   *   1. **Guard first (IX-M11).** A key that came out of a text-entry surface other than our own
   *      prompt — above all the PROGRAM screen's IDE textarea — is not offered to the model at all
   *      and is not stopped, so the editor and controls.js's own guard both behave as they always
   *      have.
   *   2. Every OTHER key: while MOSS holds the window nothing downstream sees it — `stopPropagation`
   *      unconditionally, so game shortcuts cannot fire even when focus has left the prompt (a
   *      clicked row, a focused directory entry).
   *   3. Routing is the MODEL's decision, not the DOM's: every key is offered to `keyPress`, and
   *      the key is swallowed (`preventDefault`) only when the model reports `handled` — which is
   *      precisely IX-M8's buffer-state table without duplicating it here. Since OD-P that table
   *      holds NO printable character, so every letter routes `'pass'`, is not swallowed, and
   *      reaches the prompt (rule 5 makes sure of it even when focus had wandered).
   *   4. The ONLY exception to rule 3 is `SCROLL_KEYS`, and only when the event did NOT come out of
   *      the prompt. See the constant: it is an allowlist, never a "multi-character key" heuristic.
   *   5. **A DECLINED PRINTABLE KEY IS PUT IN THE PROMPT** (`_typeIntoPrompt`). Rules 2+3 together
   *      had a hole the owner fell straight into: rule 2 stops the key reaching controls.js, and
   *      rule 3 declines to swallow it so "the browser types it" — but the browser types it into
   *      the FOCUSED element, and if focus is not our input the character is inserted NOWHERE. The
   *      keystroke is eaten by MOSS and delivered to no one. That is *"the MOSS CLI does not work,
   *      i.e. I cannot type anything"*, and it needs no bug to reach: focus sits somewhere else
   *      after anything that blurs the prompt (the PROGRAM screen's editor, a focused button, a
   *      click on the page margin outside `.moss-page`). So the screen MAKES the invariant true
   *      instead of assuming it — see `_typeIntoPrompt` for why this is safe and where it stands
   *      down (IX-M8's table stays the sole authority on WHICH keys are hotkeys — and since OD-P
   *      it lists no printable character at all).
   */
  handleKey(e) {
    if (!this.opened || !e) return;
    const key = e.key;
    if (key === 'Escape') return; // rule 0 — the shared stack owns it
    if (isTextEntryTarget(e.target) && e.target !== this.inputEl) return; // rule 1
    if (e.stopPropagation) e.stopPropagation();
    if (key == null) return;
    const res = this._keyPress(key, {
      shift: !!e.shiftKey, ctrl: !!e.ctrlKey, alt: !!e.altKey, meta: !!e.metaKey,
    });
    // Rule 4. `res.handled` is the authority; this narrow allowlist only stops the PAGE from
    // scrolling under a key the model declined, and it stands down entirely for the prompt, whose
    // owner is the browser's text editing (Backspace, Delete, Home/End, arrows, Tab).
    const scrollGuard = e.target !== this.inputEl && SCROLL_KEYS.indexOf(key) >= 0 &&
      !(e.ctrlKey || e.metaKey || e.altKey);
    if (res.handled || scrollGuard) { if (e.preventDefault) e.preventDefault(); }
    if (!res.handled) {
      if (!scrollGuard) this._typeIntoPrompt(e);   // rule 5
      return;
    }
    this.model = res.model;
    this._runEffects(res.effects);
    if (this.opened) this.render();
  }

  /** Escape arriving from the shared stack (console-model `escapeTarget` → 'moss'). MOSS's inner
   *  stack (prompt → PROGRAM → DETAIL/FAULTLOG → LEDGER → ship) is the model's, so this is just
   *  `keyPress('Escape')`; a `{k:'exit'}` effect is what finally restores the ship. */
  escape() {
    if (!this.opened) return;
    const res = this._keyPress('Escape', {});
    this.model = res.model;
    this._runEffects(res.effects);
    if (this.opened) this.render();
  }

  /** `keyPress` with its additive `handled`/`route` fields normalized. `handled` is what decides
   *  whether the DOM swallows the key; a model that predates the field degrades to the old
   *  "did anything change?" heuristic rather than swallowing everything. */
  _keyPress(key, mods) {
    const res = this.M.keyPress(this.model, key, mods) || {};
    const model = res.model === undefined ? this.model : res.model;
    const effects = res.effects || [];
    const handled = typeof res.handled === 'boolean'
      ? res.handled
      : (model !== this.model || effects.length > 0);
    return { model, effects, handled, route: res.route || '' };
  }

  _onInput() {
    if (!this.opened) return;
    const text = S(this.inputEl.value).slice(0, 240);
    this.model = this.M.editPrompt(this.model, text);
    this._paintPrompt();
  }

  _runEffects(effects) {
    for (const e of (effects || [])) {
      if (!e || typeof e.k !== 'string') continue;
      if (e.k === 'exit') { this.close(); this.onExit(); continue; }
      const msg = wireForEffect(e);
      if (msg) this.send(msg);
    }
  }

  _focusPrompt() {
    if (this.inputEl && typeof this.inputEl.focus === 'function') this.inputEl.focus();
  }

  /**
   * Rule 5: a printable character the MODEL declined, arriving while focus is not on the prompt,
   * is delivered to the prompt by moving focus there DURING the keydown — the browser's default
   * action then inserts the character into the newly focused input. (MEASURED over CDP with
   * trusted keys: with the input blurred a typed character lands nowhere; with a capture-phase
   * `focus()` on the same keydown it lands in `input.value` and in `model.prompt`. This is the same
   * mechanism a "type anywhere to search" box uses.) NO `preventDefault` here, ever — suppressing
   * the default action is precisely what would stop the character being typed.
   *
   * WHERE IT STANDS DOWN, and each one is load-bearing:
   *   · `res.handled` — the caller only reaches this on a DECLINED key, so IX-M8's buffer-state
   *     table still decides what is a hotkey. Since OD-P no LETTER is in that table, so this path
   *     is the normal one for typing: `l` and `p` are declined and land in the prompt like any
   *     other character. The stand-down still matters for `PageUp`, `Home`, `Enter` and friends.
   *   · a key out of a text-entry surface never gets here at all (rule 1 returns first), so the
   *     PROGRAM IDE's textarea cannot have a keystroke stolen out of it.
   *   · `SCROLL_KEYS` (the caller's `scrollGuard`) — a key this layer is suppressing to stop the
   *     page scrolling must not also move focus.
   *   · any Ctrl/Alt/Meta chord — those belong to the browser and the OS, not the command line.
   *   · multi-character keys (`Tab`, `ArrowLeft`, `F5`…) — `Tab` is left unbound ON PURPOSE so
   *     focus traversal works, and stealing focus back would kill it.
   *
   * ⚠️ ALTGR IS NOT A CHORD, AND ON THIS PROJECT'S OWN KEYBOARD IT IS THE COMMON CASE. Chrome
   * reports AltGr as `ctrlKey && altKey` (there is no separate flag on a keydown), so the plain
   * "no Ctrl, no Alt" guard also refused `@ { [ ] } \ | ~` — every one of which is AltGr-typed on a
   * German layout, and `@`/`{`/`[` are exactly the characters a MOSS command or a program line
   * starts with. Measured: `key "@"` with `{ctrlKey:true, altKey:true}` left focus lost and the
   * character vanished, i.e. the de-DE half of the owner's defect survived the first fix. So BOTH
   * flags together are let through (the standard AltGr carve-out) while ctrl-only, alt-only and
   * any meta chord still stand down. `hasMod` in `moss-model.js` is a different question — it
   * decides ROUTING, and an AltGr key routing `'pass'` is exactly right.
   * @param {any} e the keydown
   */
  _typeIntoPrompt(e) {
    if (!e || e.metaKey) return;
    const altGraph = !!e.ctrlKey && !!e.altKey;          // Chrome's spelling of AltGr
    if ((e.ctrlKey || e.altKey) && !altGraph) return;
    const key = e.key;
    if (typeof key !== 'string' || Array.from(key).length !== 1) return;
    if (!this.inputEl || e.target === this.inputEl) return;
    if (this.doc && this.doc.activeElement === this.inputEl) return;
    this._focusPrompt();
  }

  /**
   * IX-M7 mouse selection, expressed with the FROZEN key API. The §2 model exposes no
   * `selectRow(model, id)` and this lane may not add one to `moss-model.js`; clamped ↑/↓
   * navigation (IX-M3) reaches any row exactly, and the row set is single digits, so walking the
   * cursor is both faithful and cheap.
   *
   * The walk runs on a PROMPT-NEUTRAL copy of the model, and this is load-bearing: IX-M8 routes
   * `↑`/`↓` to command HISTORY once the buffer has text, so walking the live model after the player
   * had typed something would rewrite their command line instead of moving the cursor. The buffer
   * is cleared, the walk runs, the buffer is restored. Effects from the intermediate presses are
   * dropped — a navigation key emits none, and a click must never fan out into a burst of wire
   * requests. *(A `selectRow(model, id)` reducer would make all of this one call; recorded in spec
   * §2.1 as a follow-up contract request rather than an edit to another lane's file mid-flight.)*
   */
  _selectIndex(target) {
    const saved = S(this.model && this.model.prompt);
    const live = this.model;
    if (saved) this.model = this.M.editPrompt(this.model, '');
    let idx = this._ledger().selectedIndex;
    const n = this._ledger().rows.length;
    for (let guard = 0; guard < n + 1 && idx !== target; guard++) {
      const res = this._keyPress(idx < target ? 'ArrowDown' : 'ArrowUp', {});
      if (!res.handled || res.model === this.model) break; // clamped — stop rather than spin
      this.model = res.model;
      const next = this._ledger().selectedIndex;
      if (next === idx) break;
      idx = next;
    }
    if (saved) {
      this.model = this.model === live ? live : this.M.editPrompt(this.model, saved);
    }
  }

  // ---- render ---------------------------------------------------------------------------------

  _ledger() {
    const v = this.M.ledgerView(this.model) || {};
    return {
      rows: Array.isArray(v.rows) ? v.rows : [],
      selectedIndex: typeof v.selectedIndex === 'number' ? v.selectedIndex : -1,
      advisory: S(v.advisory),
      // IX-M13 is the MODEL's verdict, not a shape the screen infers: `linked` is false until a
      // `systems` message has actually landed, which is NOT the same claim as "zero rows". Absent
      // the field entirely, "has rows" is the closest honest stand-in — never an assumed link.
      linked: typeof v.linked === 'boolean' ? v.linked : (Array.isArray(v.rows) && v.rows.length > 0),
      notice: S(v.notice),
    };
  }

  _screen() {
    const m = this.model;
    const s = m && m.screen;
    return s === SCREEN.DETAIL || s === SCREEN.FAULTLOG || s === SCREEN.PROGRAM ||
      s === SCREEN.PODBAY ? s : SCREEN.LEDGER;
  }

  /**
   * Start/stop the POD BAY poll so it runs exactly while the bay is on screen. Called from
   * `render()`, which is the one place that knows the screen changed for ANY reason — a typed
   * command, ESC, a reply that took the screen — so there is no second list of transitions to keep
   * in step. `close()` stops it too: MOSS can be left with the bay up.
   */
  _reflectPodPoll(screen) {
    const want = screen === SCREEN.PODBAY && this.opened;
    if (want === !!this._podTimer) return;
    if (!want) {
      if (this.win && this.win.clearInterval) this.win.clearInterval(this._podTimer);
      this._podTimer = null;
      return;
    }
    if (!this.win || typeof this.win.setInterval !== 'function') return;
    // A FRESH ENTRY GETS A FRESH POLL. Re-opening the bay is the player acting, and a bay that only
    // opens on an `ev:pods` reply has just been told the ship answers — so any stand-down from a
    // previous visit is spent.
    // ⚠️ DEFENCE-IN-DEPTH, AND MEASURED AS SUCH RATHER THAN ASSUMED (the same honesty the scroll
    // lane's `: wasTop` arm was held to). Delete these two lines and the suite stays GREEN: today
    // the ONLY route back to PODBAY is an `ev:pods` reply, and `onMossEvent` has already cleared
    // both flags by the time this runs. They are kept because that route is the model's rule, not
    // this class's, and a screen that ever reaches the bay another way must not inherit a stand-down
    // from a visit the player has left. Nothing here may be cited as pinned behaviour.
    this._podPollAwaiting = false;
    this._podPollQuiet = false;
    this._podTimer = this.win.setInterval(() => this.refreshPods(), POD_REFRESH_MS);
  }

  /**
   * Ask the ship for the bay again. Sends the wire op WITHOUT setting the model's `podsAsked`
   * handshake: a refresh must never be able to re-open a screen the player has already left.
   *
   * ⛔ THE DEFECT THIS CLOSES (found by review, 2026-08-03; measured against the shipped host). The
   * bay is on screen, and then MOSS stops being live — a brownout drops `Device.Powered`, or wear
   * takes the console under `MaintainBelow`. `GameSession.HandleMoss`'s `pods` arm now answers every
   * poll with `Refuse(...)` → `MossExec(ok:false, [(2, sentence)])`, `reduceMossEvent`'s `exec` arm
   * `pushConsole`s it, and the player gets ONE UNBIDDEN TRANSCRIPT LINE PER SECOND from a screen
   * they are only reading. `CONSOLE_CAP` is 200, so ~3.3 minutes of that erases everything they had
   * — on the exact screen the thaw arc is run from. The same holds for the NotCommissioned arm.
   *
   * ⭐ THE RULE, AND WHY IT IS ON THE SEND SIDE. The poll stands down after ONE unanswered period:
   *   · `_podPollAwaiting` is set when a poll goes out and cleared ONLY by an `ev:pods` reply;
   *   · the NEXT period finding it still set concludes the ship is not answering and goes quiet.
   * So the ship gets to say the refusal ONCE — the first line is the one that tells the player MOSS
   * is offline and names the terminal to repair — and then the transcript is theirs again.
   *
   * ⛔ IT DOES NOT FILTER THE TRANSCRIPT, AND THAT IS THE WHOLE POINT. Suppressing "poll refusals"
   * at the print site would need to tell a poll's `ev:exec` from a TYPED command's, and the wire
   * cannot: `MossExec` carries `tid`/`ok`/`lines` and never the op that produced it, so any such
   * filter would be a guess that eventually eats a sentence the player asked for. Nothing here
   * touches `pushConsole`, so **a typed `pods` refusal still prints, by construction rather than by
   * a predicate** — which is what the gate-sentences lane made valuable (it names the terminal).
   *
   * ⚠️ RESUME IS THE PLAYER'S ACT, DELIBERATELY — AND THE REASON IS ONE MISSING TERM, NOT TWO.
   * `MossGate.IsServerLive` is `Kind == Terminal && Powered && Condition >= MaintainBelow`.
   *   · `Condition` DOES reach this client, on the `devices` channel — `DeviceCell` carries a `Cond`
   *     byte per device and `Kind` with it, so a terminal's wear is readable here. (Measured on the
   *     shipped wreck at boot: two `Kind == Terminal` rows, `Cond` 36 and 8, i.e. 0.141 and 0.031
   *     against a `maint` of 0.20 — `machines.def:31`.)
   *   · `Powered` DOES NOT, and is refused BY NAME rather than merely absent: `WireFormat.Devices.cs`
   *     lists it in the deliberate omissions because `PowerSystem.Balance` re-stamps it on every
   *     drawing device once a second, which would make this dirty-gated payload differ on nearly
   *     every render. The tuple is ten elements and none of them is power.
   * ⛔ SO THE HALF THAT IS MISSING IS THE DECIDING HALF, AND THAT IS THE WHOLE ARGUMENT. A client
   * that resumed on `Cond >= 0.20` alone would call MOSS live on a REPAIRED terminal under a DARK
   * GRID — which is precisely the brownout this package exists for — and would resume polling
   * straight back into the refusals it just stopped. Guessing the gate would reinstate the spam.
   * So the poll restarts on the one unambiguous fact: an `ev:pods` reply landed (a typed `pods` that
   * succeeded, or a late answer to the poll itself), or the bay was entered afresh. The bay SAYS it
   * has stood down — `POD_POLL_STALE` — so a frozen census is never mistaken for a live one.
   */
  refreshPods() {
    if (!this.opened) return;
    if (this._screen() !== SCREEN.PODBAY) return;
    if (this._podPollQuiet) return;
    if (this._podPollAwaiting) {
      // A whole period with no `ev:pods`: stand down, and REPAINT so the bay says so.
      this._podPollQuiet = true;
      this.render();
      return;
    }
    // Set before the send so a SYNCHRONOUS reply can clear it. Ordering is not pinned: over a real
    // socket the reply is always a later task, and swapping these two lines leaves the suite green.
    this._podPollAwaiting = true;
    this.send(wireForEffect({ k: 'moss', op: 'pods' }));
  }

  render() {
    if (!this.opened || !this.doc) return;
    const doc = this.doc;
    const screen = this._screen();

    // header (VS-M6) — two lines, then the rule the page's markup already carries
    const head = this.M.headerLines(this.model);
    this.headEl.replaceChildren(
      ...(Array.isArray(head) ? head : [S(head)]).map((l) => mk(doc, 'div', 'moss-headline', S(l))));

    if (screen === SCREEN.LEDGER) this._renderLedger();
    else if (screen === SCREEN.DETAIL) this._renderDetail();
    else if (screen === SCREEN.FAULTLOG) this._renderFaultLog();
    else if (screen === SCREEN.PODBAY) this._renderPodBay();
    else this._renderProgram();
    this._reflectPodPoll(screen);

    this._renderConsole();
    this._paintPrompt();
    this.footEl.textContent = joinHints(this.M.footerHints(this.model));
    this.root.dataset.screen = screen;
  }

  /**
   * One fixed-width ledger line (VS-M2/M3/M4/M8). The row arrives from `ledgerView()` ALREADY
   * FORMATTED (`bar`, `loadText`, `stateText`, `warn`, `fault`) — this method only lays those
   * strings onto the monospace grid, which is exactly the division the model's contract asks for.
   */
  _ledgerLine(row, selected) {
    const warn = !!row.warn;
    const stateText = S(row.stateText) + (warn ? ' ⚠' : '');
    return {
      gutter: (selected ? '>' : ' ').padEnd(COLS.gutter),
      label: S(row.label).slice(0, COLS.label - 1).padEnd(COLS.label),
      bar: S(row.bar).padEnd(COLS.bar) + ''.padEnd(COLS.gapBar),
      load: S(row.loadText).padStart(COLS.load) + ''.padEnd(COLS.gapLoad),
      // The ⚠ is pinned to one cell in CSS, so the state column's printable width is stable.
      state: stateText.padEnd(COLS.state),
      fault: S(row.fault),
      stateHead: S(row.stateText),
      warn,
      offline: row.state === OFFLINE,
    };
  }

  _renderLedger() {
    const doc = this.doc;
    const view = this._ledger();
    const wrap = mk(doc, 'div', 'moss-table');
    // The column head is a label for rows; with no rows it labels nothing, and printing SYSTEM /
    // LOAD / STATE over a LINK DOWN notice implies a table is about to appear under it.
    if (view.linked && view.rows.length) wrap.appendChild(mk(doc, 'div', 'moss-thead', HEAD_LINE));

    if (!view.linked || !view.rows.length) {
      // IX-M13 — an empty table would read as "all systems nominal". Say the true thing instead.
      // The headline is the MODEL's `notice`; a linked line that genuinely has no rows is a
      // different, equally honest statement.
      const down = mk(doc, 'div', 'moss-nolink');
      down.appendChild(mk(doc, 'div', 'moss-nolink-head', view.notice || NO_TELEMETRY));
      down.appendChild(mk(doc, 'div', 'moss-nolink-sub', view.linked
        ? 'THE LINK IS UP AND REPORTS NO SYSTEMS. THAT IS THE READING, NOT A BLANK SCREEN.'
        : 'NO SYSTEMS TELEMETRY HAS ARRIVED ON THIS LINK. NOTHING BELOW IS A READING.'));
      wrap.appendChild(down);
      this.bodyEl.replaceChildren(wrap);
      this.advisoryEl.replaceChildren();
      return;
    }

    const rowsEl = mk(doc, 'div', 'moss-rows');
    view.rows.forEach((row, i) => {
      const selected = i === view.selectedIndex;
      const p = this._ledgerLine(row, selected);
      const el = mk(doc, 'div', 'moss-row' + (selected ? ' sel' : '') + (p.offline ? ' offline' : ''));
      el.dataset.id = S(row.id);
      el.dataset.index = String(i);
      el.appendChild(mk(doc, 'span', 'c-gutter', p.gutter));
      el.appendChild(mk(doc, 'span', 'c-label', p.label));
      el.appendChild(mk(doc, 'span', 'c-bar', p.bar));
      el.appendChild(mk(doc, 'span', 'c-load', p.load));
      const stateEl = mk(doc, 'span', 'c-state' + (p.warn ? ' warn' : ''));
      if (p.warn) {
        // Split so the ⚠ can be width-pinned without breaking the run of padding around it.
        const head = p.stateHead;
        stateEl.appendChild(doc.createTextNode(head + ' '));
        stateEl.appendChild(mk(doc, 'span', 'moss-warn', '⚠'));
        stateEl.appendChild(doc.createTextNode(p.state.slice(head.length + 2)));
      } else {
        stateEl.textContent = p.state;
      }
      el.appendChild(stateEl);
      el.appendChild(mk(doc, 'span', 'c-fault', p.fault));
      // IX-M7: a click selects without activating; a double-click activates (= ENTER).
      el.addEventListener('click', () => { this._selectIndex(i); this.render(); this._focusPrompt(); });
      el.addEventListener('dblclick', () => {
        this._selectIndex(i);
        const res = this._keyPress('Enter', {});
        this.model = res.model;
        this._runEffects(res.effects);
        if (this.opened) this.render();
        this._focusPrompt();
      });
      rowsEl.appendChild(el);
    });
    wrap.appendChild(rowsEl);
    this.bodyEl.replaceChildren(wrap);

    // The selected row's advisory sits under the rule (VS-M6/IX-M3). '' renders nothing.
    if (view.advisory) {
      this.advisoryEl.replaceChildren(mk(doc, 'div', 'moss-adv-line', '> ' + view.advisory));
    } else {
      this.advisoryEl.replaceChildren();
    }
  }

  _renderDetail() {
    const doc = this.doc;
    const v = this.M.detailView(this.model) || {};
    const wrap = mk(doc, 'div', 'moss-detail');
    wrap.appendChild(mk(doc, 'div', 'moss-subhead', S(v.title) || 'SYSTEM DETAIL'));

    if (v.loading) {
      // IX-M4 — an honest LOADING line, never a fabricated table and never a spinner.
      wrap.appendChild(mk(doc, 'div', 'moss-loading', 'LOADING…'));
    } else {
      const devices = Array.isArray(v.devices) ? v.devices : [];
      wrap.appendChild(mk(doc, 'div', 'moss-thead',
        'DEVICE'.padEnd(DEV_COLS.name) + 'KIND'.padEnd(DEV_COLS.kind) +
        'COND'.padStart(4).padEnd(DEV_COLS.cond) + 'PWR'.padEnd(DEV_COLS.power) +
        'RATE'.padStart(4).padEnd(DEV_COLS.rate) + 'LOCATION'.padEnd(DEV_COLS.loc) + 'NOTE'));
      if (!devices.length) {
        wrap.appendChild(mk(doc, 'div', 'moss-empty', 'NO DEVICES ANSWER FOR THIS SYSTEM.'));
      } else {
        const list = mk(doc, 'div', 'moss-rows');
        for (const d of devices) list.appendChild(mk(doc, 'div', 'moss-devrow', deviceLine(d)));
        wrap.appendChild(list);
      }
    }

    // IX-M22 / DA-M3 — the DERIVATION note is part of the feature, not a comment. It is entirely
    // the MODEL's: §1.2's `derivation` string comes off the `ev:sys` reply and the model carries it,
    // so the client is never a second authority on how the host computes a row. While `loading`
    // there are no notes at all — `LOADING…` is the whole render for that frame, and a notes block
    // drawn early would be the screen claiming an explanation it has not been given.
    const notes = v.loading ? []
      : (Array.isArray(v.notes) ? v.notes : (v.notes ? [S(v.notes)] : []));
    if (notes.length) {
      const nb = mk(doc, 'div', 'moss-notes');
      nb.appendChild(mk(doc, 'div', 'moss-notes-head', 'DERIVATION'));
      for (const n of notes) nb.appendChild(mk(doc, 'div', 'moss-note', S(n)));
      wrap.appendChild(nb);
    }
    this.bodyEl.replaceChildren(wrap);
    this.advisoryEl.replaceChildren();
  }

  _renderFaultLog() {
    const doc = this.doc;
    const v = this.M.faultLogView(this.model) || {};
    const wrap = mk(doc, 'div', 'moss-faultlog');
    // The model's title ALREADY names the filtered system (`FAULT LOG — LIFE SUPPORT`); appending
    // `filterId` here as well would print the system twice. `filterId` is string|null and is used
    // only to mark the pane.
    wrap.appendChild(mk(doc, 'div', 'moss-subhead', S(v.title) || 'FAULT LOG'));
    const entries = Array.isArray(v.entries) ? v.entries : [];
    if (!entries.length) {
      wrap.appendChild(mk(doc, 'div', 'moss-empty', v.filterId
        ? 'NO FAULT ON RECORD ATTRIBUTES TO THIS SYSTEM.'
        : 'NO ATTRIBUTABLE FAULTS ON RECORD.'));
    } else {
      const list = mk(doc, 'div', 'moss-rows');
      for (const en of entries) {
        const day = en && typeof en.day === 'number' && en.day >= 0 ? 'DAY ' + en.day : '—';
        const line = day.padEnd(9) + S(en && en.text);
        // `live` marks rows that came through the running sensor tail rather than the day-stamped
        // chronicle. It is uniform across the list by construction — the model reads ONE of the two
        // windows onto the history ring, never both (see `faultLogView`); reading both is what made
        // the newest 14 faults print twice.
        list.appendChild(mk(doc, 'div', 'moss-logrow' + (en && en.live ? ' live' : ''), line));
      }
      wrap.appendChild(list);
    }
    // §5.1 — say the weak join out loud rather than let the column imply a live diagnosis. The
    // wording is the MODEL's `FAULT_CAVEAT` where it exports one, so the log and the DETAIL screen
    // cannot drift into two different admissions of the same limitation.
    // ⭐ THE SECOND HALF OF THE FALLBACK WAS RETRACTED ON 2026-08-02 (defect D1). It read
    // "MAINTENANCE PUBLISHES NOTHING ON REPAIR, SO RECOVERIES CANNOT BE SHOWN", and
    // `MaintenanceSystem` now publishes `RepairCompletedEvent` — every completed service writes a
    // `[Repair]` line, so recoveries appear in this very list. The sentence was unreachable (both
    // the real model and the test fake export `FAULT_CAVEAT`, so `||` never fired) and it was still
    // wrong to leave standing: the next person to delete the export would have shipped the lie.
    // What is left is the one claim this screen can make about itself.
    wrap.appendChild(mk(doc, 'div', 'moss-note', S(this.M.FAULT_CAVEAT) ||
      'A FAULT LINE IS THE LAST THING THAT WENT WRONG, NOT THE CURRENT PROBLEM.'));
    this.bodyEl.replaceChildren(wrap);
    this.advisoryEl.replaceChildren();
  }

  /**
   * ⭐⭐ THE POD BAY (M3-4). Twelve capsules, four columns, and the fourth one is the feature.
   *
   * ⛔ EVERY STRING BELOW ARRIVED ON THE WIRE. This method reads `podBayView(model)` and lays its
   * already-decided values onto the monospace grid; it computes no state word, composes no reason,
   * and — decisively — decides no `[THAW]`. The affordance is drawn where `row.can` is true, and
   * `row.can` is `ThawGate.Evaluate`'s own verdict for that capsule. Clicking it calls the model's
   * `thawPod`, which is the SAME function ENTER and the typed `thaw` reach, so the button and the
   * command cannot come apart (RW §8.4 rung 3).
   *
   * The header line states which of OD-N's three MOSS states the terminal is in. On this screen it
   * always reads COMMISSIONED, because the other two never get here: the op refuses in words, on the
   * transcript, with the player still on the screen they were on. That is deliberate and it is the
   * OD-N amendment's own instruction — an empty POD BAY beside a refusal would be the M3-13 defect.
   */
  _renderPodBay() {
    const doc = this.doc;
    const v = this.M.podBayView(this.model) || {};
    const wrap = mk(doc, 'div', 'moss-podbay');
    // `POD BAY                                term_moss · COMMISSIONED`
    const head = mk(doc, 'div', 'moss-subhead-row');
    head.appendChild(mk(doc, 'span', 'moss-subhead', S(v.title) || 'POD BAY'));
    head.appendChild(mk(doc, 'span', 'moss-podterm',
      (S(v.term) || '—') + ' · ' + (S(v.moss) || 'UNKNOWN')));
    wrap.appendChild(head);

    const rows = Array.isArray(v.rows) ? v.rows : [];
    if (!rows.length) {
      // The honest empty, IX-M13's rule one screen over: an empty table under a POD BAY heading
      // reads as "everybody is out", which is the one thing it must never read as.
      wrap.appendChild(mk(doc, 'div', 'moss-empty', S(v.notice) || 'NO CAPSULES ABOARD'));
    } else {
      wrap.appendChild(mk(doc, 'div', 'moss-thead', POD_HEAD_LINE));
      const list = mk(doc, 'div', 'moss-rows');
      for (const r of rows) {
        const el = mk(doc, 'div', 'moss-row moss-podrow'
          + (r.selected ? ' sel' : '') + (r.dim ? ' dim' : '') + (r.pending ? ' pending' : ''));
        el.dataset.pod = S(r.pod);
        el.dataset.state = String(r.st);
        el.dataset.can = r.can ? '1' : '0';
        el.appendChild(mk(doc, 'span', 'c-gutter', (r.selected ? '>' : ' ').padEnd(POD_COLS.gutter)));
        el.appendChild(mk(doc, 'span', 'c-podnum', S(r.num).padStart(2).padEnd(POD_COLS.num)));
        el.appendChild(mk(doc, 'span', 'c-occupant',
          S(r.occupant).slice(0, POD_COLS.occupant - 1).padEnd(POD_COLS.occupant)));
        el.appendChild(mk(doc, 'span', 'c-podstate', S(r.state).padEnd(POD_COLS.state)));
        // ⭐ OD-L's column. Rendered VERBATIM and never truncated — the number in it is the hint.
        el.appendChild(mk(doc, 'span', 'c-podwhy', S(r.reason)));
        if (r.can) {
          const btn = mk(doc, 'span', 'moss-thaw', r.pending ? ' [WAIT]' : ' [THAW]');
          btn.dataset.thaw = S(r.pod);
          btn.addEventListener('click', (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            this.activatePod(S(r.pod));
          });
          el.appendChild(btn);
        }
        // IX-M7, unchanged in meaning: a click selects, a double-click activates.
        el.addEventListener('click', () => {
          if (this.M.selectPod) this.model = this.M.selectPod(this.model, S(r.pod));
          this.render();
          this._focusPrompt();
        });
        el.addEventListener('dblclick', () => this.activatePod(S(r.pod)));
        list.appendChild(el);
      }
      wrap.appendChild(list);
    }
    if (S(v.note)) wrap.appendChild(mk(doc, 'div', 'moss-note', S(v.note)));
    // ⛔ THE STAND-DOWN, SAID ON THE SCREEN THAT WENT STALE. The rows above are now a photograph:
    // without this line a frozen census and a live one are the same picture, which is the failure
    // mode `POD_REFRESH_MS`'s own comment exists to prevent. It is a SCREEN fact, not a model one —
    // the poll belongs to this class — so it is appended here rather than folded into `podBayView`.
    if (this._podPollQuiet) wrap.appendChild(mk(doc, 'div', 'moss-note moss-stale', POD_POLL_STALE));
    this.bodyEl.replaceChildren(wrap);
    this.advisoryEl.replaceChildren();
  }

  /** The click path into the model's ONE thaw rule. No predicate of its own — `thawPod` refuses a
   *  row the gate refuses, with the gate's own sentence, exactly as ENTER and `thaw <n>` do. */
  activatePod(podId) {
    if (!this.opened || !this.M.thawPod) return;
    if (this.M.selectPod) this.model = this.M.selectPod(this.model, podId);
    const res = this.M.thawPod(this.model, podId) || {};
    if (res.model) this.model = res.model;
    this._runEffects(res.effects);
    this.render();
    this._focusPrompt();
  }

  /**
   * PROGRAM (IX-M6) — the terminal directory on the left, the embedded MOSS IDE on the right. The
   * IDE is `moss-program-editor.js`, a VIEW of `model.program` (which `reduceMossEvent` keeps live).
   *
   * ── THE MOUNT/DETACH/SYNC CONTRACT (extended by the moss-programs lane) ───────────────────────
   * `this.programMount` is a `<div class="moss-prog-editor">` created ONCE and NEVER MOVED, so the
   * editor mounted into it keeps its DOM, its scroll and its focus while the directory beside it
   * re-renders.
   *
   * ⚠️ IT USED TO BE RE-PARENTED ON EVERY RENDER, AND THAT WAS THE OWNER'S BUG (2026-07-31, live
   * play): *"writing code in this frame is nearly impossible — only when I left click while writing
   * and only for a few seconds."* Every render built a fresh `wrap`/`split` and did
   * `split.appendChild(this.programMount)`, and in a browser MOVING A NODE BLURS THE FOCUSED
   * ELEMENT INSIDE IT — re-inserting it does not give the focus back. Renders arrive on every wire
   * message (`systems`/`log`/`chron` land every few seconds in live play) and on every handled key,
   * so the editor lost focus a second or two after each click. MEASURED in real Chrome over CDP
   * against this very file: focus the textarea, call `render()`, `document.activeElement` is
   * `<body>`. Two further legs pin WHICH operation does it — a move into a detached node blurs, and
   * `replaceChildren(sameNode)` (remove + re-insert of the SAME child) blurs as well. THAT SECOND
   * ONE IS WHY THIS SCREEN IS BUILT ONCE AND LEFT ALONE rather than re-attached each render: the
   * "obvious" cheap fix of handing `bodyEl.replaceChildren` the same persistent wrap blurs exactly
   * as hard as the move did.
   *
   * So: the PROGRAM subtree (`programWrap` → `moss-prog-split` → [`programDir`, `programMount`]) is
   * built on first use and thereafter only its DIRECTORY ROWS are rebuilt — they hold no text-entry
   * surface, so replacing them cannot blur anything. `this._programTid` is the tid the player
   * selected (null = none). The editor object implements:
   *     { mount(el, tid), detach(), sync(programState) }
   * `mount` is called ONLY when the selected tid (or the editor instance) changes — building the
   * textarea once; `detach` when the selection changes or MOSS closes; and `sync(model.program)` is
   * called after EVERY render, because source/diag/audit/rterror all reduce into `model.program`
   * WITHOUT changing the tid, so a same-tid wire event must repaint the editor in place. The editor
   * NEVER re-instantiates a terminal-model — `model.program` is the single source of truth.
   *
   * The source fetch is wired in `selectProgram`: it folds `M.selectProgram(model, tid)` (which
   * `openTerminal`s the tid into `model.program` so terminal-model's tid guard ACCEPTS the reply —
   * the gap this lane closed) and sends `{type:'moss',op:'open',tid}`, whose `moss ev:source` reply
   * reaches `model.program` through `onMossEvent`. Editor gestures come back as `_programEdit` /
   * `_programInstall` / `_programAudit`, which fold the pure reducers and emit `moss set|audit`.
   */
  _renderProgram() {
    const doc = this.doc;
    if (!this.programWrap) {
      // Built ONCE. Nothing below this line ever moves `programMount` or re-inserts `programWrap`.
      this.programWrap = mk(doc, 'div', 'moss-program');
      this.programWrap.appendChild(mk(doc, 'div', 'moss-subhead', 'PROGRAM — TERMINAL DIRECTORY'));
      const split = mk(doc, 'div', 'moss-prog-split');
      this.programDir = mk(doc, 'div', 'moss-prog-dir');
      if (!this.programMount) this.programMount = mk(doc, 'div', 'moss-prog-editor');
      split.appendChild(this.programDir);
      split.appendChild(this.programMount);
      this.programWrap.appendChild(split);
    }

    // Only the DIRECTORY is rebuilt per render. It contains no text-entry surface, so replacing it
    // cannot blur the IDE; the editor's own mount/sync contract lives in `_syncProgramEditor`.
    const rows = [];
    if (!this._terminals.length) {
      rows.push(mk(doc, 'div', 'moss-empty', 'NO MOSS TERMINALS ABOARD.'));
    } else {
      for (const t of this._terminals) {
        const tid = S(t && t.tid);
        const sel = tid !== '' && tid === this._programTid;
        const el = mk(doc, 'div', 'moss-row moss-prog-row' + (sel ? ' sel' : ''));
        el.dataset.id = tid;
        el.appendChild(mk(doc, 'span', 'c-gutter', (sel ? '>' : ' ').padEnd(COLS.gutter)));
        el.appendChild(mk(doc, 'span', 'c-label',
          tid.slice(0, COLS.label - 1).padEnd(COLS.label)));
        el.appendChild(mk(doc, 'span', 'c-deck', 'DECK ' + S(t && t.deck)));
        el.addEventListener('click', () => this.selectProgram(tid));
        rows.push(el);
      }
    }
    this.programDir.replaceChildren(...rows);
    this._syncProgramEditor();

    // Attach only when the body is not already showing this exact subtree — `replaceChildren` with
    // the same node still removes and re-inserts it, which blurs the editor (measured in Chrome).
    if (this.bodyEl.childNodes.length !== 1 || this.bodyEl.childNodes[0] !== this.programWrap) {
      this.bodyEl.replaceChildren(this.programWrap);
    }
    this.advisoryEl.replaceChildren();   // never holds a focusable node
  }

  /**
   * Mount/detach the PROGRAM editor for the current selection (once per tid/editor change), then
   * `sync` it EVERY render — a view of `model.program` must repaint when a same-tid source/diag/
   * audit/rterror lands. The placeholder path remains for a screen with no editor attached.
   */
  _syncProgramEditor() {
    if (this._mountedTid !== this._programTid || this._mountedEditor !== this._editor) {
      if (this._editor && this._mountedTid && this._editor.detach) this._editor.detach();
      this.programMount.replaceChildren();
      this._mountedTid = this._programTid;
      this._mountedEditor = this._editor;
      if (this._editor && this._programTid) {
        this._editor.mount(this.programMount, this._programTid);
      } else {
        this.programMount.appendChild(mk(this.doc, 'div', 'moss-empty', this._programTid
          ? 'PROGRAM ' + this._programTid + ' — NO EDITOR ATTACHED'
          : 'SELECT A TERMINAL TO LOAD ITS PROGRAM.'));
      }
    }
    if (this._editor && this._programTid && this._editor.sync) {
      this._editor.sync(this.model && this.model.program);
    }
  }

  /**
   * Select a terminal on the PROGRAM directory and request its source. Folds `M.selectProgram` so
   * `model.program.tid` is set BEFORE the `source` reply lands — otherwise terminal-model's tid
   * guard drops the reply as a no-op (the wiring gap this lane closed). The P-key `prog <terminal>`
   * path opens the terminal in the model itself; the directory-click path did not, until now.
   */
  selectProgram(tid) {
    this._programTid = tid || null;
    if (this.M.selectProgram) this.model = this.M.selectProgram(this.model, this._programTid);
    if (this._programTid) this.send(Cmd.moss('open', this._programTid));
    if (this.opened) this.render();
    this._focusPrompt();
  }

  /** Install the PROGRAM screen's editor. See `_renderProgram`'s contract note. */
  attachProgramEditor(editor) {
    this._editor = editor || null;
    if (this.opened) this.render();
  }

  /** The editor's textarea changed — fold the draft into `model.program` and repaint the editor in
   *  place (NOT a full render: the directory/header are unchanged, and a full render on every
   *  keystroke is wasteful; the targeted sync also runs the refill rule, which is a no-op here). */
  _programEdit(text) {
    if (!this.opened) return;
    if (this.M.editProgramDraft) this.model = this.M.editProgramDraft(this.model, text);
    if (this._editor && this._editor.sync) this._editor.sync(this.model && this.model.program);
  }

  /** Install pressed — mark the program compiling and send `moss set {tid, draft}`. */
  _programInstall() {
    if (!this.opened || !this._programTid) return;
    if (this.M.beginProgramCompile) this.model = this.M.beginProgramCompile(this.model);
    const draft = this.model && this.model.program ? S(this.model.program.draft) : '';
    this.send(Cmd.moss('set', this._programTid, draft));
    this.render();
  }

  /** Refresh pressed — ask the host for the audit ring. */
  _programAudit() {
    if (!this._programTid) return;
    this.send(Cmd.moss('audit', this._programTid));
  }

  /**
   * The `>` transcript, and — since 2026-08-04 — the TERMINAL SCROLL CONTRACT that makes it one.
   *
   * ⛔ THE DEFECT THIS CLOSES (measured at 1280×800 on the shipped wreck, 2026-08-03): typing `help`
   * printed 14 lines into a `max-height:22vh` box — `clientHeight 157 / scrollHeight 305 /
   * scrollTop 0`. Seven lines were visible and the hidden seven were the BOTTOM seven, which is
   * where COMMISSION, PODS and THAW live: the three verbs the whole thaw arc is reached through.
   * The player's own answer to their own question was off screen and nothing on the pane said so.
   *
   * ⭐ THE CAUSE IS PLAIN, AND AN EARLIER DRAFT OF THIS COMMENT GOT IT WRONG (corrected 2026-08-04
   * after review). It blamed `replaceChildren` for clamping `scrollTop` to 0 on every render. IT
   * DOES NOT — measured on this very pane in Chrome, three ways: parked at 357 of a 714 maximum, the
   * exact call shape below leaves it at 357; forcing a layout read while the box is empty (which
   * really does report `scrollHeight 0` / `scrollTop 0` for that instant) still ends at 357 once the
   * children are back; and six real 1 Hz wire-driven rebuilds left a parked pane at 357 every time.
   * ⛔ THE REAL CAUSE IS THE ABSENCE OF A FOLLOW, nothing more: the pane sat at `scrollTop 0` because
   * nobody had ever scrolled it anywhere, and each new line was appended BELOW the fold. **The FOLLOW
   * arm is the whole of the fix.** Do not re-derive a browser fact from this file; the measurement
   * lives in `shouldFollowTail`'s comment and in `client/tools/moss-scroll-shot.mjs`.
   *
   *   ⭐ WHAT APPENDS WITHOUT A KEYSTROKE — AND THE FIRST ANSWER TO THIS WAS ALSO WRONG. This comment
   *   used to claim "no transcript LINE appears unbidden today". ⛔ FALSE, and the counter-example is
   *   a live product hazard: `_reflectPodPoll` runs `refreshPods` on a 1 Hz timer while the POD BAY
   *   is on screen, which sends `moss pods` WITH NO KEYSTROKE; `GameSession.HandleMoss`'s `pods` arm
   *   refuses a ship whose MOSS is not live or not commissioned (`Refuse` → `MossExec(ok:false,
   *   [(2, sentence)])`), and `reduceMossEvent`'s `exec` arm `pushConsole`s that sentence. So a bay
   *   left open while the ship browns out wrote ONE TRANSCRIPT LINE PER SECOND, unbidden — with
   *   `CONSOLE_CAP` at 200 that erased the player's whole transcript in ~3.3 minutes. ⭐ CLOSED on
   *   the SEND side, 2026-08-04: `refreshPods` stands the poll down after one unanswered period, so
   *   the bound is ONE unbidden line per stand-down and the fix never touches this print path (read
   *   its comment for why filtering here is impossible). The bound is a bound, not a zero: that one
   *   line is the ship answering, and it is the sentence that names the terminal to repair.
   *   Every OTHER `pushConsole` is downstream of a client request: a submitted prompt line, or the
   *   `ev:exec`/`ev:thaw` reply to one.
   *   ⛔ AND RENDERS ARRIVE UNBIDDEN FAR MORE OFTEN THAN LINES DO: `onSystems` on every pushed
   *   `systems` message, `onChron` on every day rollover, `onLog` on every log tail, `setTerminals`,
   *   and that same 1 Hz poll. Each calls `render()` → this method. A naive "always jump to the
   *   bottom" would therefore yank a player who had scrolled back through a long `LOG` result down to
   *   the newest line roughly once a second, with no output to justify it — a new defect in place of
   *   the old one. That is why this is the pinned-to-bottom idiom and not a jump.
   *
   * The decision is `shouldFollowTail`, asked BEFORE the rebuild (see its comment: afterwards
   * `scrollHeight` already counts the new lines, so "was the player at the bottom?" answers no
   * whenever anything arrived, and the console would never follow again). This method holds no rule
   * of its own — it measures, rebuilds, applies the pure verdict.
   *
   * ⚠️ THE `: wasTop` ARM IS DEFENCE-IN-DEPTH, AND IT IS WORTH SAYING SO PLAINLY RATHER THAN LETTING
   * IT LOOK LOAD-BEARING. On Chrome, today, it is a no-op: the offset survives the rebuild on its
   * own (measured above), and where the transcript SHRINKS — `clear`, or `CONSOLE_CAP` evicting from
   * the top — assigning `wasTop` back is clamped to the new maximum, which is what the browser would
   * have done anyway. It is kept (integrator ruling, 2026-08-04) because it makes the intent explicit
   * at the seam — "a render we did not follow must not move the view" — and because it holds on an
   * engine that does not restore the offset, which is a guarantee no spec gives us. It is pinned by
   * one hold assertion at a NON-ZERO scroll position; every assertion parked at 0 is blind to it,
   * since restoring 0 and losing the position to 0 are the same picture.
   */
  _renderConsole() {
    const doc = this.doc;
    const lines = this.M.consoleLines(this.model);
    const list = Array.isArray(lines) ? lines : [];
    const el = this.consoleEl;
    // MEASURE FIRST — after the rebuild `scrollHeight` already counts the appended lines, so the
    // "was the player at the bottom?" question would answer no every time anything arrived.
    const wasTop = px(el.scrollTop);
    // ⛔ MINUS THE SIGN'S OWN CLEARANCE. `has-more` puts `padding-bottom` on THIS scroller, and the
    // browser counts padding in `scrollHeight` — so passing the raw number would hand
    // `shouldFollowTail` a distance inflated by 23.52px and cut the pinned 24px slack to ~1px. See
    // `padBottomPx` for the driven A/B; this is the regression review caught, and the subtraction is
    // the whole of the fix. (`scrollTop` below is still written with the PADDED height on purpose:
    // the follow must land at the true bottom WITH the clearance showing, which is what puts the
    // last line out from under the sign.)
    const clearance = padBottomPx(this.win, el);
    const follow = shouldFollowTail(el.scrollTop, el.clientHeight, px(el.scrollHeight) - clearance);
    el.replaceChildren(...list.map((l) => {
      // Tolerant of both the wire's [stream,text] shape and a bare string. The text is rendered
      // VERBATIM: the model already writes the `> ` on an echo line (stream 0), so prefixing one
      // here would print it twice.
      const stream = Array.isArray(l) ? (l[0] | 0) : (l && typeof l.stream === 'number' ? l.stream : 1);
      const text = Array.isArray(l) ? S(l[1]) : (typeof l === 'string' ? l : S(l && l.text));
      const cls = stream === 0 ? 'echo' : stream === 2 ? 'err' : 'out';
      return mk(doc, 'div', 'moss-cline ' + cls, text);
    }));
    // …then apply the verdict. `scrollHeight` is read AFTER the rebuild on purpose: it is the new
    // content height, which is what "the newest line" means. The `: wasTop` arm is the explicit
    // no-move (see the note above — defence-in-depth, not a repair of anything Chrome does).
    el.scrollTop = follow ? px(el.scrollHeight) : wasTop;
    // …and only NOW ask what is still below the fold. Order is load-bearing: asked before the
    // scroll write, the affordance would describe the view the player had a moment ago and would
    // read "▾ N MORE" on a pane that had just followed its own newest line.
    this._updateConsoleMore();
  }

  /**
   * Refresh the "▾ N MORE" sign from the pane's REAL geometry (pure `linesBelowFold`; this method
   * is thin glue and holds no rule).
   *
   * Every line's own box is measured rather than a stride multiplied out — see `linesBelowFold`'s
   * comment for why a stride is wrong here and right on the CREW table. The children are walked
   * directly instead of by selector because `.moss-console` contains nothing but `.moss-cline`
   * divs, this file built them, and the node harness has no `querySelectorAll`.
   *
   * Hidden at the tail, hidden on an empty or unlaid-out pane (`linesBelowFold` returns 0 for
   * both). The `has-more` class on the wrapper is the CREW precedent's trick for keeping the last
   * line clear of the sign that sits over it — a padding, not a layout of its own.
   *
   * ⚠️ `has-more` FEEDS BACK INTO THE PANE'S OWN METRICS. `.moss-console-wrap.has-more
   * .moss-console{padding-bottom:1.75em}` grows `scrollHeight` — MEASURED on the shipped wreck in
   * Chrome at 1280×800 (2026-08-04) by toggling the class on the live pane: `padding-bottom` 0px →
   * 23.52px (1.75em of the page's own 13.44px type), `scrollHeight` 326 → 350, `clientHeight`
   * unchanged at 157.
   *
   * ⛔ AN EARLIER VERSION OF THIS PARAGRAPH SAID THE LOOP WAS HARMLESS — "it cannot oscillate … the
   * one place it does move anything is at maximum scroll". **THE SECOND HALF WAS FALSE, AND IT HID A
   * REGRESSION THIS PACKAGE SHIPPED** (found by review, 2026-08-04; retracted here rather than
   * quietly deleted). The place it moved something was the FOLLOW DECISION: `_renderConsole` handed
   * the padded `scrollHeight` to `shouldFollowTail`, which is asked in exactly those units, so the
   * pinned 24px slack became ~1px whenever the sign was up. Driven A/B: parked at d = 10.48 with
   * `▾ 1 MORE` up, the shipped build HELD at `scrollTop 355 of 454`; with the clearance neutralised
   * it FOLLOWED. **Closed by subtracting the clearance at the seam** — see `padBottomPx` and the
   * call site above.
   *
   * ⭐ WHAT SURVIVES OF THE OLD CLAIM, because it is still true and still load-bearing: the loop
   * cannot oscillate the SIGN, since bottom padding MOVES NO ROW'S BOX — adding it leaves every
   * `getBoundingClientRect` where it was, so the count that turned it on cannot be changed by it. At
   * maximum scroll, dropping the padding re-clamps `scrollTop` by the same ~24px and the last line
   * lands flush with the fold — still 0 below, still stable. Driven: after a wheel back to the
   * bottom the pane settles at `scrollTop 365 / maxScroll 365`, `belowFold 0`, sign hidden, once.
   * (The sign's own box is 24.33px against a 21.77px line box, which is why the half-line it covers
   * reads as a fade and not as text showing through the label.)
   */
  _updateConsoleMore() {
    const el = this.consoleEl;
    const more = this.consoleMoreEl;
    if (!el || !more) return;
    const fold = edges(el);
    const bottoms = [];
    for (const child of el.childNodes || []) bottoms.push(edges(child).bottom);
    const n = linesBelowFold(bottoms, fold.top, fold.bottom);
    more.hidden = n <= 0;
    more.textContent = '▾ ' + n + ' MORE';
    if (this.consoleWrapEl && this.consoleWrapEl.classList) {
      this.consoleWrapEl.classList.toggle('has-more', n > 0);
    }
  }

  /** Mirror the model's prompt buffer into the visible echo + the transparent input. */
  _paintPrompt() {
    const text = S(this.model && this.model.prompt);
    if (this.inputEl.value !== text) this.inputEl.value = text;
    this.echoEl.textContent = text;
  }
}

/**
 * One fixed-width DETAIL device line. Every value is already formatted by `detailView()`
 * (`conditionText`, `poweredText`, `rateText`, `place`) — this only lays them on the grid. The
 * fallbacks exist because a `-1` sentinel must render `--`/`—` and never a fabricated number.
 */
function deviceLine(d) {
  const o = d || {};
  const pct = (text, raw) => (typeof text === 'string' && text ? text
    : (typeof raw === 'number' && isFinite(raw) && raw >= 0 ? Math.round(raw) + '%' : '--'));
  const place = S(o.place) || ('DECK ' + S(o.deck) + ' · ' + S(o.x) + ',' + S(o.y));
  return S(o.name).slice(0, DEV_COLS.name - 1).padEnd(DEV_COLS.name) +
    S(o.kind).slice(0, DEV_COLS.kind - 1).padEnd(DEV_COLS.kind) +
    pct(o.conditionText, o.condition).padStart(4).padEnd(DEV_COLS.cond) +
    (S(o.poweredText) || (o.powered ? 'PWR' : 'OFF')).padEnd(DEV_COLS.power) +
    pct(o.rateText, o.rate).padStart(4).padEnd(DEV_COLS.rate) +
    place.slice(0, DEV_COLS.loc - 1).padEnd(DEV_COLS.loc) +
    S(o.note);
}
