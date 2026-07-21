// Panel framework — the floating UI shells that sit over the canvas: the dialogue window, the
// citizen card, and the MOSS terminal drawer. DOM-ONLY: this owns element creation, open/close, and
// z-order focus; all the CONTENT logic is pure and lives elsewhere (chat.js reassembles transcripts,
// portraits.js resolves faces, terminal-model.js runs the IDE state machine). Browser-only — never
// imported by the node tests. Nothing here touches the sim or the wire directly (callbacks only:
// onSend→say, onBye→bye, onMoss→moss open/set/audit).

import { portraitElement, resolvePortrait } from './portraits.js';
import { Panel, el } from './panel-base.js';
import { TerminalDrawer } from './terminal.js';

export class PanelManager {
  constructor() {
    /** @type {Map<string, Panel>} */
    this.panels = new Map();
    this._root = null;
    /** @type {(sid:string, text:string)=>void} the dialogue input box → `say {sid,text}`. */
    this.onSend = () => {};
    /** @type {(sid:string)=>void} a dialogue closing (× or Esc) → `bye {sid}`. */
    this.onBye = () => {};
    /** @type {(op:string, tid:string, text?:string)=>void} a terminal gesture → a `moss` wire op. */
    this.onMoss = () => {};
    /** The sid of the most-recently focused/opened dialogue — Esc closes this one. */
    this.activeDialogueSid = null;
  }

  root() {
    if (this._root) return this._root;
    let r = document.getElementById('panels');
    if (!r) {
      r = el('div');
      r.id = 'panels';
      document.body.appendChild(r);
    }
    return (this._root = r);
  }

  _panel(key, factory) {
    let p = this.panels.get(key);
    if (!p) {
      p = factory();
      this.panels.set(key, p);
      p.el.addEventListener('mousedown', () => p.focus());
      this.root().appendChild(p.el);
    }
    p.focus();
    return p;
  }

  close(key) {
    const p = this.panels.get(key);
    if (p) { p.el.remove(); this.panels.delete(key); }
  }

  /** Open or update the dialogue window for a chat session (keyed by sid). Closing it (× or Esc)
   *  fires onBye(sid) so the wire sends `bye`, then removes the panel. */
  dialogue(model) {
    if (!model) return;
    const key = 'chat:' + model.sid;
    const closeAndBye = () => { this.closeDialogue(model.sid); };
    const p = this._panel(key, () => new DialoguePanel(model.sid, closeAndBye, this.onSend));
    this.activeDialogueSid = model.sid;
    p.render(model);
    return p;
  }

  /** Close a dialogue by sid, firing the bye hook. Safe if the panel is already gone. */
  closeDialogue(sid) {
    const key = 'chat:' + sid;
    if (!this.panels.has(key)) return;
    this.close(key);
    if (this.activeDialogueSid === sid) this.activeDialogueSid = null;
    this.onBye(sid);
  }

  /** Close the most-recently active dialogue (Esc). No-op when none is open. */
  closeActiveDialogue() {
    if (this.activeDialogueSid != null) this.closeDialogue(this.activeDialogueSid);
  }

  /** Open or update a citizen inspector card (keyed by cid). */
  citizen(cit, registry) {
    if (!cit || cit.cid == null) return;
    const key = 'cit:' + cit.cid;
    const p = this._panel(key, () => new CitizenCard(cit.cid, () => this.close(key)));
    p.render(cit, registry || {});
    return p;
  }

  /** Open the MOSS terminal drawer for a device's terminal id (single instance). Switches the
   *  bound tid when a different terminal is selected; fires a `moss open` so the host sends source. */
  openTerminal(tid) {
    if (tid == null) return;
    const id = String(tid);
    const existed = this.panels.has('terminal');
    const p = this._panel('terminal', () => new TerminalDrawer(id, () => this.close('terminal'), this.onMoss));
    if (existed && p.tid !== id) p.switchTo(id);
    this.onMoss('open', id);
    return p;
  }

  /** Route a decoded `moss` wire message to the open terminal drawer (ignored if none / other tid). */
  mossEvent(moss) {
    const p = this.panels.get('terminal');
    if (p) p.applyMoss(moss);
  }
}

// The base Panel chrome + `el` live in panel-base.js (shared with terminal.js, no import cycle).

// ---- dialogue window: transcript + streaming preview + input box ----

class DialoguePanel extends Panel {
  constructor(sid, onClose, onSend) {
    super('Conversation', 'panel-dialogue', onClose);
    this.sid = sid;
    this.onSend = onSend || (() => {});

    this.transcript = el('div', 'chat-transcript');
    this.stream = el('div', 'chat-stream');           // live delta preview (a "typing" bubble)
    this.body.appendChild(this.transcript);
    this.body.appendChild(this.stream);

    const foot = el('div', 'chat-input');
    this.indicator = el('span', 'chat-indicator');    // streaming/ended dot
    this.input = el('input', 'chat-text');
    this.input.type = 'text';
    this.input.placeholder = 'Say something…';
    const send = el('button', 'chat-send', 'Send');
    const fire = () => {
      const v = this.input.value.trim();
      if (v) { this.onSend(this.sid, v); this.input.value = ''; }
    };
    send.addEventListener('click', fire);
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
    foot.appendChild(this.indicator);
    foot.appendChild(this.input);
    foot.appendChild(send);
    this.body.appendChild(foot);
  }

  render(model) {
    if (model.name) this.setTitle(model.name);
    this.transcript.replaceChildren(...model.entries.map((entry) => {
      if (entry.kind === 'effect') return el('div', 'chat-effect', entry.text);
      const row = el('div', 'chat-line');
      row.appendChild(el('span', 'chat-who', (entry.who || '') + ''));
      row.appendChild(el('span', 'chat-said', entry.text));
      return row;
    }));
    // cosmetic streaming preview (cleared the moment its authoritative line lands)
    if (model.streaming) {
      this.stream.textContent = model.streaming;
      this.stream.style.display = '';
    } else {
      this.stream.textContent = '';
      this.stream.style.display = 'none';
    }
    this.indicator.className = 'chat-indicator ' +
      (model.ended ? 'ended' : model.streaming ? 'streaming' : 'idle');
    this.indicator.title = model.ended ? ('ended: ' + (model.endReason || '')) :
      model.streaming ? 'speaking…' : 'idle';
    this.input.disabled = !!model.ended;
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }
}

// ---- citizen card: portrait + identity + traits ----

class CitizenCard extends Panel {
  constructor(cid, onClose) {
    super('Citizen', 'panel-citizen', onClose);
    this.cid = cid;
  }

  render(cit, registry) {
    this.setTitle(cit.name || String(cit.cid));
    const portrait = portraitElement(resolvePortrait(cit, registry));
    const ident = el('div', 'cit-ident');
    ident.appendChild(el('div', 'cit-name', cit.name || String(cit.cid)));
    ident.appendChild(el('div', 'cit-role', [cit.role, cit.mood].filter(Boolean).join(' · ')));
    const traits = el('div', 'cit-traits');
    for (const t of (cit.traits || [])) traits.appendChild(el('span', 'cit-trait', t));
    ident.appendChild(traits);

    const head = el('div', 'cit-head');
    head.appendChild(portrait);
    head.appendChild(ident);
    this.body.replaceChildren(head);
  }
}

// The MOSS terminal drawer is the real IDE now (ui/terminal.js), imported at the top.
