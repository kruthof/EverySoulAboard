// MOSS PROGRAM editor — the in-terminal IDE embedded in the phosphor ledger's PROGRAM screen
// (spec §6.1, IX-M6). It is a VIEW of `model.program`, NOT a second state machine: the single
// source of truth is the moss-model's `program` field, which `reduceMossEvent` keeps live by
// delegating every `source|diag|audit|rterror` event to terminal-model. This module owns no editor
// state of its own — it builds the DOM once and renders whatever `program` state it is handed.
//
// This is the SECOND presentation of the same model. `terminal.js` (TerminalDrawer) is the
// standalone floating drawer that opens from a deck console; it owns its own terminal-model instance
// because it is standalone. This editor must NOT — two terminal-model states for one terminal would
// drift, the exact anti-pattern the gates reject. So gestures route BACK through the pure moss-model
// (editProgramDraft / beginProgramCompile) via callbacks, and the screen hands the fresh
// `program` state to `sync()` after each render.
//
// THE MOUNT/DETACH/SYNC CONTRACT (extends the seam in moss-screen `_renderProgram`):
//   mount(el, tid)   build the editor DOM ONCE into `el` (the re-parented `programMount` div) and
//                    bind gestures. Called only on a tid change / first attach — NEVER per render,
//                    so the textarea keeps its DOM, scroll and focus while the directory re-renders.
//   detach()         tear the DOM down (selection changed or MOSS closed).
//   sync(program)    UPDATE IN PLACE from a `model.program` state — called after EVERY render, since
//                    source/diag/audit/rterror all reduce into `program` WITHOUT changing tid. Never
//                    rebuilds the textarea. Applies the refill rule (below).
//
// THE REFILL RULE (where editors corrupt input): the textarea is the user's live buffer.
// `editProgramDraft` keeps `program.draft` equal to the textarea on every keystroke, so the only
// time they diverge is when a wire `source` event resets `draft` to the installed text. So on sync
// we set `textarea.value = program.draft` — always from DRAFT, never `installed` (refilling from the
// installed source would discard a live edit). That is the load-bearing rule, and it is node-pinned
// both directions (moss-program-editor.test.js: refill from a source, and a triggered refill in a
// dirty state that adopts the draft rather than the installed text).
//
// The `!==` guard on that assignment is a redundant-write SKIP, not a correctness gate: because
// `draft` is byte-identical to the textarea during typing, an unconditional `value = draft` would
// write the same string and not move Chrome's caret either. So do not read the guard as "what keeps
// the caret" — it just avoids a pointless identical write. (Mirrors terminal.js: "local edits are
// only overwritten by an authoritative source.")

import { gutterMarkers, auditView, canInstall } from './terminal-model.js';

// px per editor row — MUST equal .moss-prog-code line-height in styles.css (LOAD-BEARING: the
// absolutely-positioned diagnostic markers are placed at `padTop + (line-1) * LINE_HEIGHT`).
export const LINE_HEIGHT = 18;
const PAD_TOP = 2; // matches terminal.js; the marker's own CSS margin centres it in the row

function mk(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** A terminal-less fallback so `sync(undefined)` (a model that predates `program`) renders blank
 *  rather than throwing — the receive path never throws. */
function emptyProgram() {
  return { tid: null, installed: '', hash: null, draft: '', state: 'viewing', diags: [], audit: [], rterror: null, ok: null };
}

export class MossProgramEditor {
  /**
   * @param {{
   *   document: Document,               the injected doc (dom-lite in tests, real DOM in the client)
   *   onEdit?: (text:string)=>void,     the textarea changed → editProgramDraft in the screen
   *   onInstall?: ()=>void,             Install pressed → beginProgramCompile + `moss set`
   *   onAudit?: ()=>void,               refresh pressed → `moss audit`
   * }} opts
   */
  constructor(opts) {
    const o = opts || {};
    this.doc = o.document || (typeof document !== 'undefined' ? document : null);
    this.onEdit = o.onEdit || (() => {});
    this.onInstall = o.onInstall || (() => {});
    this.onAudit = o.onAudit || (() => {});
    this.tid = null;
    this.mounted = false;
  }

  /** Build the editor DOM once into `el`. See the mount/detach/sync contract above. */
  mount(el, tid) {
    const doc = this.doc;
    if (!doc || !el) return;
    this.el = el;
    this.tid = tid == null ? null : String(tid);

    // runtime-error banner (hidden until an rterror arrives)
    this.banner = mk(doc, 'div', 'moss-prog-banner');
    this.banner.hidden = true;

    // editor: a line-number gutter (with diagnostic markers overlaid) beside the source textarea
    const editor = mk(doc, 'div', 'moss-prog-edit');
    this.gutter = mk(doc, 'div', 'moss-prog-gutter');
    this.nums = mk(doc, 'pre', 'moss-prog-nums');       // line numbers as a dedicated text node
    this.markers = mk(doc, 'div', 'moss-prog-markers'); // absolutely-positioned diagnostic dots
    this.gutter.appendChild(this.nums);
    this.gutter.appendChild(this.markers);
    this.code = mk(doc, 'textarea', 'moss-prog-code');   // a REAL <textarea> — covered by isTextEntryTarget
    this.code.spellcheck = false;
    this.code.setAttribute('spellcheck', 'false');
    this.code.setAttribute('aria-label', 'MOSS program source');
    this.code.addEventListener('input', () => this.onEdit(this.code.value));
    this.code.addEventListener('scroll', () => { this.gutter.scrollTop = this.code.scrollTop; });
    editor.appendChild(this.gutter);
    editor.appendChild(this.code);

    // action row: the state chip + Install
    const actions = mk(doc, 'div', 'moss-prog-actions');
    this.stateChip = mk(doc, 'span', 'moss-prog-state');
    this.install = mk(doc, 'button', 'moss-prog-install', 'INSTALL');
    this.install.setAttribute('type', 'button');
    this.install.addEventListener('click', () => {
      // A real browser suppresses a disabled button's click; dom-lite does not, so guard here too.
      if (this.install.disabled) return;
      this.onInstall();
    });
    actions.appendChild(this.stateChip);
    actions.appendChild(this.install);

    // diagnostics list
    this.diagsEl = mk(doc, 'div', 'moss-prog-diags');

    // audit pane (with a refresh)
    const auditHead = mk(doc, 'div', 'moss-prog-audit-head');
    auditHead.appendChild(mk(doc, 'span', 'moss-prog-audit-title', 'AUDIT'));
    this.refresh = mk(doc, 'button', 'moss-prog-refresh', '⟳');
    this.refresh.setAttribute('type', 'button');
    this.refresh.setAttribute('title', 'Refresh audit');
    this.refresh.addEventListener('click', () => this.onAudit());
    auditHead.appendChild(this.refresh);
    this.auditEl = mk(doc, 'div', 'moss-prog-audit');

    el.replaceChildren(this.banner, editor, actions, this.diagsEl, auditHead, this.auditEl);
    this.mounted = true;
  }

  /** Tear down (selection changed or MOSS closed). */
  detach() {
    if (this.el && this.el.replaceChildren) this.el.replaceChildren();
    this.mounted = false;
    this.el = null;
    this.code = null;
  }

  /** Render one `model.program` state into the DOM in place. Called after every render. */
  sync(program) {
    if (!this.mounted || !this.code) return;
    const p = program || emptyProgram();

    // THE REFILL RULE — refill from DRAFT (never `installed`; see header). The `!==` is a
    // redundant-write skip, not caret protection: during typing draft === value already.
    if (this.code.value !== p.draft) this.code.value = p.draft;

    // gutter line numbers (one per source row, min 1) — computed from the textarea AFTER a refill,
    // so a fresh source's line count is right.
    const rows = Math.max(1, String(this.code.value).split('\n').length);
    let nums = '';
    for (let i = 1; i <= rows; i++) nums += i + '\n';
    this.nums.textContent = nums;

    // diagnostic markers in the gutter (pure geometry from terminal-model)
    const marks = gutterMarkers(p.diags, { lineHeight: LINE_HEIGHT, padTop: PAD_TOP });
    this.markers.replaceChildren(...marks.map((m) => {
      const dot = mk(this.doc, 'div', 'moss-prog-marker sev-' + m.severity);
      dot.style.top = m.top + 'px';
      dot.setAttribute('title', m.line + ':' + m.col);
      return dot;
    }));

    // diagnostics list
    this.diagsEl.replaceChildren(...(p.diags || []).map((d) =>
      mk(this.doc, 'div', 'moss-prog-diag sev-' + d.severity, d.line + ':' + d.col + '  ' + d.severity + '  ' + d.message)));

    // audit ring
    this.auditEl.replaceChildren(...auditView(p).map((a) =>
      mk(this.doc, 'div', 'moss-prog-audit-line', 't' + a.tick + '  ' + a.text)));

    // state chip + install enablement
    this.stateChip.textContent = p.state;
    this.stateChip.className = 'moss-prog-state st-' + p.state;
    this.install.disabled = !canInstall(p);

    // runtime-error banner
    if (p.rterror) { this.banner.textContent = p.rterror; this.banner.hidden = false; }
    else { this.banner.textContent = ''; this.banner.hidden = true; }
  }
}
