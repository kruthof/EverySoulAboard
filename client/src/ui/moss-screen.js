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

/** IX-M13's headline. The MODEL is the authority (`ledgerView().notice`); this is the fallback for
 *  a model old enough not to carry one, and the constant this file's own tests read. */
export const NO_TELEMETRY = 'NO TELEMETRY — LINK DOWN';

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
    this._derivations = new Map(); // system id → the host's DERIVATION prose (§1.2), when it ships
    this._onKey = (e) => this.handleKey(e);
    this._build();
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
    page.appendChild(this.consoleEl);
    page.appendChild(prompt);
    page.appendChild(this.footEl);

    // VS-M5: ONE overlay element carries the whole CRT treatment (scanlines, vignette),
    // pointer-events:none, never a per-character effect.
    const crt = mk(doc, 'div', 'moss-crt');
    crt.setAttribute('aria-hidden', 'true');

    this.root.replaceChildren(page, crt);
    // Clicking anywhere in the page returns focus to the prompt (IX-M8).
    page.addEventListener('mousedown', (e) => {
      if (e && e.target === this.inputEl) return;
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
    if (this._editor && this._mountedTid && this._editor.detach) this._editor.detach();
    this._mountedTid = null;
    this._mountedEditor = null;
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

  /** Fold a `moss` event (sys | exec | source | diag | audit | rterror). A `sys` reply may carry
   *  the host's own DERIVATION prose (§1.2); it is cached per system id and rendered in place of
   *  the model's fallback text — see `_renderDetail`. */
  onMossEvent(msg) {
    if (msg && msg.ev === 'sys' && msg.tid != null && typeof msg.derivation === 'string' && msg.derivation) {
      this._derivations.set(String(msg.tid), msg.derivation);
    }
    if (!this.opened) return;
    this.model = this.M.reduceMossEvent(this.model, msg);
    this.render();
  }

  /** Fold a `chron` message — the FAULT LOG's source. */
  onChron(msg) {
    this._chron = msg;
    if (!this.opened) return;
    this.model = this.M.reduceChron(this.model, msg);
    this.render();
  }

  /** Fold a `log` channel tail — the FAULT LOG's live section. */
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
   *      precisely IX-M8's buffer-state table without duplicating it here. So `L` on an empty
   *      buffer opens the FAULT LOG and is not typed; `L` mid-command routes `'pass'` and reaches
   *      the input as an ordinary letter.
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
    // Keys that can never produce a character must not also scroll the page or submit anything,
    // whether or not the model had something to say about them.
    const structural = typeof key === 'string' && key.length > 1 &&
      !(e.ctrlKey || e.metaKey || e.altKey);
    if (res.handled || structural) { if (e.preventDefault) e.preventDefault(); }
    if (!res.handled) return;
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
    return s === SCREEN.DETAIL || s === SCREEN.FAULTLOG || s === SCREEN.PROGRAM ? s : SCREEN.LEDGER;
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
    else this._renderProgram();

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
    wrap.appendChild(mk(doc, 'div', 'moss-thead', HEAD_LINE));

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

    // IX-M22 / DA-M3 — the DERIVATION note is part of the feature, not a comment.
    //
    // The HOST is the authority on how it computes a row: §1.2 carries a `derivation` string on the
    // `ev:sys` reply, and when one has arrived it REPLACES the model's built-in prose (which is a
    // pre-load fallback, not a second source of truth — a client that explained the host's maths
    // from its own hardcoded table is exactly the drift MECHANICS.md §13 exists to catalogue). The
    // trailing §5.1 fault caveat is the model's and always stays.
    let notes = Array.isArray(v.notes) ? v.notes : (v.notes ? [S(v.notes)] : []);
    const wire = this._derivations.get(this._detailTid());
    if (wire) notes = [wire].concat(notes.length ? [notes[notes.length - 1]] : []);
    if (notes.length) {
      const nb = mk(doc, 'div', 'moss-notes');
      nb.appendChild(mk(doc, 'div', 'moss-notes-head', 'DERIVATION'));
      for (const n of notes) nb.appendChild(mk(doc, 'div', 'moss-note', S(n)));
      wrap.appendChild(nb);
    }
    this.bodyEl.replaceChildren(wrap);
    this.advisoryEl.replaceChildren();
  }

  /** The system id DETAIL is currently showing, or '' . */
  _detailTid() {
    const d = this.model && this.model.detail;
    return d && d.tid != null ? String(d.tid) : '';
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
        // `live` marks the running sensor tail apart from the day-stamped chronicle.
        list.appendChild(mk(doc, 'div', 'moss-logrow' + (en && en.live ? ' live' : ''), line));
      }
      wrap.appendChild(list);
    }
    // §5.1 — say the weak join out loud rather than let the column imply a live diagnosis. The
    // wording is the MODEL's `FAULT_CAVEAT` where it exports one, so the log and the DETAIL screen
    // cannot drift into two different admissions of the same limitation.
    wrap.appendChild(mk(doc, 'div', 'moss-note', S(this.M.FAULT_CAVEAT) ||
      'A FAULT LINE IS THE LAST THING THAT WENT WRONG, NOT THE CURRENT PROBLEM: ' +
      'MAINTENANCE PUBLISHES NOTHING ON REPAIR, SO RECOVERIES CANNOT BE SHOWN.'));
    this.bodyEl.replaceChildren(wrap);
    this.advisoryEl.replaceChildren();
  }

  /**
   * PROGRAM (IX-M6) — the shell + the terminal directory ship here; the MOSS IDE that fills the
   * right half is the `moss-programs` follow-up lane.
   *
   * ── THE SEAM FOR THAT LANE ────────────────────────────────────────────────────────────────
   * `this.programMount` is a `<div class="moss-prog-editor">` created ONCE and re-parented on each
   * render — deliberately NOT rebuilt, so an editor mounted into it keeps its DOM, its scroll and
   * its focus while the directory beside it re-renders. `this._programTid` is the tid the player
   * selected (null = none). To fold the IDE in:
   *     mossScreen.attachProgramEditor({ mount(el, tid) {…}, detach() {…} })
   * `mount` is called ONLY when the selected tid changes (and once on attach); `detach` when the
   * selection changes or MOSS closes. The source fetch is already wired: selecting a row sends
   * `{type:'moss',op:'open',tid}`, whose `moss ev:source` reply reaches the model through
   * `onMossEvent`. Nothing else in this file needs to change — do NOT re-plumb the wire, the key
   * routing or the takeover.
   */
  _renderProgram() {
    const doc = this.doc;
    const wrap = mk(doc, 'div', 'moss-program');
    wrap.appendChild(mk(doc, 'div', 'moss-subhead', 'PROGRAM — TERMINAL DIRECTORY'));
    const split = mk(doc, 'div', 'moss-prog-split');

    const dir = mk(doc, 'div', 'moss-prog-dir');
    if (!this._terminals.length) {
      dir.appendChild(mk(doc, 'div', 'moss-empty', 'NO MOSS TERMINALS ABOARD.'));
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
        dir.appendChild(el);
      }
    }
    split.appendChild(dir);
    if (!this.programMount) this.programMount = mk(doc, 'div', 'moss-prog-editor');
    split.appendChild(this.programMount);
    this._syncProgramEditor();

    wrap.appendChild(split);
    this.bodyEl.replaceChildren(wrap);
    this.advisoryEl.replaceChildren();
  }

  /** Mount/unmount the PROGRAM editor for the current selection, once per tid change. */
  _syncProgramEditor() {
    if (this._mountedTid === this._programTid && this._mountedEditor === this._editor) return;
    if (this._editor && this._mountedTid) { if (this._editor.detach) this._editor.detach(); }
    this.programMount.replaceChildren();
    this._mountedTid = this._programTid;
    this._mountedEditor = this._editor;
    if (this._editor && this._programTid) { this._editor.mount(this.programMount, this._programTid); return; }
    this.programMount.appendChild(mk(this.doc, 'div', 'moss-empty', this._programTid
      ? 'PROGRAM ' + this._programTid + ' — EDITOR NOT INSTALLED (moss-programs lane)'
      : 'SELECT A TERMINAL TO LOAD ITS PROGRAM.'));
  }

  /** Select a terminal on the PROGRAM screen and request its source (the `moss-programs` seam). */
  selectProgram(tid) {
    this._programTid = tid || null;
    if (this._programTid) this.send(Cmd.moss('open', this._programTid));
    if (this.opened) this.render();
    this._focusPrompt();
  }

  /** Install the PROGRAM screen's editor half. See `_renderProgram`'s seam note. */
  attachProgramEditor(editor) {
    this._editor = editor || null;
    if (this.opened) this.render();
  }

  _renderConsole() {
    const doc = this.doc;
    const lines = this.M.consoleLines(this.model);
    const list = Array.isArray(lines) ? lines : [];
    this.consoleEl.replaceChildren(...list.map((l) => {
      // Tolerant of both the wire's [stream,text] shape and a bare string. The text is rendered
      // VERBATIM: the model already writes the `> ` on an echo line (stream 0), so prefixing one
      // here would print it twice.
      const stream = Array.isArray(l) ? (l[0] | 0) : (l && typeof l.stream === 'number' ? l.stream : 1);
      const text = Array.isArray(l) ? S(l[1]) : (typeof l === 'string' ? l : S(l && l.text));
      const cls = stream === 0 ? 'echo' : stream === 2 ? 'err' : 'out';
      return mk(doc, 'div', 'moss-cline ' + cls, text);
    }));
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
