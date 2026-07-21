// MOSS terminal IDE — DOM. The drawer that opens when a `device {kind:"terminal"}` message
// arrives: a source textarea with a synced line-number gutter + diagnostic markers, a diagnostics
// list, an audit pane, an Install button, and a runtime-error banner. All the LOGIC is the pure
// terminal-model.js (state machine, diag sort/merge, gutter geometry, audit ring); this file only
// builds/updates the DOM and turns gestures into wire ops (moss open/set/audit) via callbacks.

import { Panel, el } from './panel-base.js';
import {
  openTerminal, reduceMoss, editDraft, beginCompile, gutterMarkers, auditView, canInstall,
} from './terminal-model.js';

const LINE_HEIGHT = 18; // px per editor row — kept in sync with .term-code line-height in styles.css

export class TerminalDrawer extends Panel {
  /**
   * @param {string} tid the terminal id this drawer edits
   * @param {() => void} onClose
   * @param {(op:string, tid:string, text?:string) => void} onMoss  send a moss wire op
   */
  constructor(tid, onClose, onMoss) {
    super('MOSS Terminal', 'panel-terminal', onClose);
    this.tid = String(tid);
    this.onMoss = onMoss || (() => {});
    this.model = openTerminal(this.tid);

    // --- runtime-error banner (hidden until an rterror arrives) ---
    this.banner = el('div', 'term-banner');
    this.banner.style.display = 'none';

    // --- editor: a line-number gutter (with diagnostic markers) beside the source textarea ---
    const editor = el('div', 'term-editor');
    this.gutter = el('div', 'term-gutter');
    this.markers = el('div', 'term-markers'); // absolutely-positioned diagnostic dots over the gutter
    this.gutter.appendChild(this.markers);
    this.code = el('textarea', 'term-code');
    this.code.spellcheck = false;
    this.code.addEventListener('input', () => { this.model = editDraft(this.model, this.code.value); this._sync(); });
    this.code.addEventListener('scroll', () => { this.gutter.scrollTop = this.code.scrollTop; });
    editor.appendChild(this.gutter);
    editor.appendChild(this.code);

    // --- action row: state chip + Install ---
    const actions = el('div', 'term-actions');
    this.stateChip = el('span', 'term-state');
    this.install = el('button', 'term-install', 'Install');
    this.install.addEventListener('click', () => {
      if (!canInstall(this.model)) return;
      this.model = beginCompile(this.model);
      this.onMoss('set', this.tid, this.model.draft);
      this._sync();
    });
    actions.appendChild(this.stateChip);
    actions.appendChild(this.install);

    // --- diagnostics list ---
    this.diagsEl = el('div', 'term-diags');

    // --- audit pane (with a refresh) ---
    const auditHead = el('div', 'term-audit-head');
    auditHead.appendChild(el('span', 'term-audit-title', 'Audit'));
    const refresh = el('button', 'term-audit-refresh', '⟳');
    refresh.title = 'Refresh audit';
    refresh.addEventListener('click', () => this.onMoss('audit', this.tid));
    auditHead.appendChild(refresh);
    this.auditEl = el('div', 'term-audit');

    this.body.appendChild(this.banner);
    this.body.appendChild(editor);
    this.body.appendChild(actions);
    this.body.appendChild(this.diagsEl);
    this.body.appendChild(auditHead);
    this.body.appendChild(this.auditEl);

    this.setTitle('MOSS · ' + this.tid);
    this._sync();
  }

  /** Rebind to a different terminal id (the drawer is single-instance). */
  switchTo(tid) {
    this.tid = String(tid);
    this.model = openTerminal(this.tid);
    this.setTitle('MOSS · ' + this.tid);
    this.code.value = '';
    this._sync();
  }

  /** Fold a decoded `moss` wire message into the model + re-render. Messages for another tid are
   *  ignored by the pure reducer, so a stray channel event can't corrupt this drawer. */
  applyMoss(msg) {
    const before = this.model;
    this.model = reduceMoss(this.model, msg);
    if (this.model === before) return; // not ours / no-op
    // A fresh source (re)fills the editor; local edits are only overwritten by an authoritative source.
    if (msg.ev === 'source') this.code.value = this.model.draft;
    this._sync();
  }

  // ---- render the current model into the DOM ----
  _sync() {
    const m = this.model;
    // gutter line numbers (one per source row, min 1) — written into a dedicated text node so the
    // absolutely-positioned marker layer overlays them without either clobbering the other.
    const rows = Math.max(1, this.code.value.split('\n').length);
    let nums = '';
    for (let i = 1; i <= rows; i++) nums += i + '\n';
    this._setGutterNums(nums);

    // diagnostic markers in the gutter
    const marks = gutterMarkers(m.diags, { lineHeight: LINE_HEIGHT, padTop: 2 });
    this.markers.replaceChildren(...marks.map((mk) => {
      const dot = el('div', 'term-marker sev-' + mk.severity);
      dot.style.top = mk.top + 'px';
      dot.title = `${mk.line}:${mk.col}`;
      return dot;
    }));

    // diagnostics list
    this.diagsEl.replaceChildren(...m.diags.map((d) => {
      const r = el('div', 'term-diag sev-' + d.severity);
      r.textContent = `${d.line}:${d.col}  ${d.severity}  ${d.message}`;
      return r;
    }));

    // audit ring
    this.auditEl.replaceChildren(...auditView(m).map((a) => el('div', 'term-audit-line', `t${a.tick}  ${a.text}`)));

    // state chip + install enablement
    this.stateChip.textContent = m.state;
    this.stateChip.className = 'term-state st-' + m.state;
    this.install.disabled = !canInstall(m);

    // runtime-error banner
    if (m.rterror) { this.banner.textContent = m.rterror; this.banner.style.display = ''; }
    else { this.banner.textContent = ''; this.banner.style.display = 'none'; }
  }

  _setGutterNums(nums) {
    // The gutter shows line numbers as text with the markers layer overlaid; write the numbers into
    // a dedicated text node so replaceChildren on markers never clobbers them.
    if (!this._nums) { this._nums = el('pre', 'term-gutter-nums'); this.gutter.insertBefore(this._nums, this.markers); }
    this._nums.textContent = nums;
  }
}
