// Panel framework — the floating UI shells that sit over the canvas: the dialogue window, the
// citizen card, and the MOSS terminal drawer. DOM-ONLY: this owns element creation, open/close, and
// z-order focus; all the CONTENT logic is pure and lives elsewhere (chat.js reassembles transcripts,
// portraits.js resolves faces, terminal-model.js runs the IDE state machine). Browser-only — never
// imported by the node tests. Nothing here touches the sim or the wire directly (callbacks only:
// onSend→say, onBye→bye, onMoss→moss open/set/audit).

import { portraitElement, resolvePortrait } from './portraits.js';
import { Panel, el } from './panel-base.js';
import { TerminalDrawer } from './terminal.js';
import { PLAYER_WHO, citizenLog } from './chat.js';

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
    /** @type {(key:string)=>void} fired after any panel closes (the MOSS tab's live line
     *  watches for 'terminal' so it never claims an IDE is open when the drawer is gone). */
    this.onClosed = () => {};
    /** The sid of the most-recently focused/opened dialogue — Esc closes this one. */
    this.activeDialogueSid = null;
    /** The cid of the most-recently opened crew DOSSIER (BIO) card — Esc closes this one. */
    this.activeCitizenCid = null;
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
      // Drag persistence (IX-64): the panel remembers this session's last dragged position by key.
      if (typeof p.setPosKey === 'function') p.setPosKey(key);
    }
    p.focus();
    return p;
  }

  close(key) {
    const p = this.panels.get(key);
    if (p) { p.el.remove(); this.panels.delete(key); this.onClosed(key); }
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

  /** Whether a dialogue window is currently mounted for a sid (B2: renderChat consults this so a
   *  closed conversation's trailing events never recreate the panel). */
  hasDialogue(sid) { return this.panels.has('chat:' + sid); }

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
    const p = this._panel(key, () => new CitizenCard(cit.cid, () => this.closeCitizen(cit.cid)));
    this.activeCitizenCid = cit.cid;
    p.render(cit, registry || {});
    return p;
  }

  /** Close a crew dossier by cid, clearing the Esc tracker. Safe if already gone. */
  closeCitizen(cid) {
    const key = 'cit:' + cid;
    if (this.panels.has(key)) this.close(key);
    if (this.activeCitizenCid === cid) this.activeCitizenCid = null;
  }

  /** Close the most-recently opened dossier card (Esc). No-op when none is open. */
  closeActiveCitizen() {
    if (this.activeCitizenCid != null) this.closeCitizen(this.activeCitizenCid);
  }

  /** Whether a crew dossier card is currently mounted (the Esc `dossier` rung reads this). */
  hasOpenCitizen() {
    return this.activeCitizenCid != null && this.panels.has('cit:' + this.activeCitizenCid);
  }

  /** Live-refresh a citizen card ONLY if it is already open (IX-54: the `citizen` wire message
   *  no longer auto-opens the card — BIOGRAPHY does). No-op when the card isn't open. */
  citizenIfOpen(cit, registry) {
    if (!cit || cit.cid == null) return;
    const p = this.panels.get('cit:' + cit.cid);
    if (p) p.render(cit, registry || {});
  }

  /** The open MOSS terminal's tid, or null (the MOSS tab's live line reads this). */
  openTerminalTid() {
    const p = this.panels.get('terminal');
    return p ? p.tid : null;
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
      // B1: the player's own lines (who === PLAYER_WHO) read as a muted echo; the crew's voice
      // stays bright — a clear two-sided distinction within the warm console palette.
      const mine = entry.who === PLAYER_WHO;
      const row = el('div', 'chat-line ' + (mine ? 'chat-line-you' : 'chat-line-crew'));
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

// ---- crew DOSSIER: the person-detail surface ----
//
// A first-class character screen — the game's promise is "every crew member is a person", so the
// inspector is large and legible. Fields fall into two honestly-separated classes:
//   · REAL   — carried by the wire today: portrait, name, role, current emotion, traits,
//              directed relationships (joined in by hud.enrichCitizen via regardRows), and the
//              conversation log.
//              ⚠️ `morale` USED TO BE LISTED HERE AND IT WAS WRONG (M1-F, 2026-07-29). The roster
//              wire does carry a `morale` number, but NO SYSTEM IN `sim/` EVER CHANGES
//              `Citizen.Morale` — its only assignments are the `= 1f` initialiser and the save-load
//              restore of that same 1f — so it is CARRIED, not COMPUTED: a constant. The MORALE
//              meter that stood in the identity band below is gone, and this line is corrected in
//              the same commit because a ledger that miscategorises its own subject is exactly how
//              the next lane re-adds the meter in good faith. Do not add a field to this REAL list
//              on the strength of it being on the wire; ask whether the sim moves it.
//   · SAMPLE — the sim MODELS these (needs, affinity/trust, values/fears, backstory, episodic
//              memory — see sim/Sim.Core/Citizens/*) but they are not on the wire yet. We show the
//              intended surface with placeholder values, deterministically seeded per-cid so a given
//              crew member reads consistently, and every such section wears a ◇ SAMPLE badge so the
//              player knows it is not yet the live simulation. Widening the `citizen` wire message to
//              carry the real values is the follow-up (see HANDOVER).
//
// Nothing here fabricates a system that does NOT exist in the sim: there is deliberately no skill
// grid and no body-part injury model (the sim has neither), so the dossier never invents them.

// deterministic 0..1 from (cid, salt) — stable per crew so SAMPLE data doesn't flicker on refresh.
function seeded(cid, salt) {
  let h = ((cid | 0) * 2654435761 + (salt | 0) * 40503) >>> 0;
  h ^= h >>> 13; h = (h * 1274126177) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function pick(arr, cid, salt) { return arr[Math.floor(seeded(cid, salt) * arr.length) % arr.length]; }
function pickN(arr, cid, salt, n) {
  const out = [], used = new Set();
  for (let i = 0; out.length < n && i < arr.length * 3; i++) {
    const idx = Math.floor(seeded(cid, salt + i * 7) * arr.length) % arr.length;
    if (!used.has(idx)) { used.add(idx); out.push(arr[idx]); }
  }
  return out;
}

const SAMPLE_VALUES = ['LOYALTY', 'CURIOSITY', 'ORDER', 'FREEDOM', 'CRAFT', 'KINSHIP', 'DUTY', 'SURVIVAL'];
const SAMPLE_FEARS = ['ABANDONMENT', 'THE DARK', 'FAILURE', 'CONFINEMENT', 'DROWNING', 'BETRAYAL', 'THE VOID'];
const SAMPLE_SPEECH = ['terse, dry', 'warm, wandering', 'clipped and formal', 'soft-spoken', 'blunt', 'wry, deflecting'];
const SAMPLE_BACKSTORY = [
  'Signed aboard the Perilune to outrun a debt that was never really about money.',
  'Grew up dockside on a hauler — the black is the only home that ever quite fit.',
  'Left a research berth after the Lien raid, and talks about it only sideways.',
  'The last of a colony that isn’t on the charts anymore.',
  'Came for the pay, stayed because someone here needed the help.',
];
const SAMPLE_MEMORY = [
  ['tended a burn in the medbay', 3],
  ['argued with the quartermaster over rations', 2],
  ['watched the reactor gauges a beat too long', 1],
  ['shared a drink after the alarm cleared', 2],
  ['fixed the scrubber no one else would touch', 3],
  ['dreamt of a planet with weather', 1],
  ['logged a fault, and told no one', 2],
];

/** A small section shell: title + optional ◇ SAMPLE badge, then the caller's rows. */
function section(title, sample, rows) {
  const s = el('div', 'dsr-sec' + (sample ? ' dsr-sample' : ''));
  const h = el('div', 'dsr-sec-hd');
  h.appendChild(el('span', 'dsr-sec-title', title));
  if (sample) h.appendChild(el('span', 'dsr-badge', '◇ SAMPLE'));
  s.appendChild(h);
  for (const r of rows) if (r) s.appendChild(r);
  return s;
}

/** A labelled meter row: LABEL … [bar] value. `frac` 0..1, `color` a CSS value. */
function meter(label, frac, valueText, color) {
  const f = Math.max(0, Math.min(1, frac));
  const row = el('div', 'dsr-meter');
  row.appendChild(el('span', 'dsr-meter-lbl', label));
  const track = el('div', 'dsr-bar');
  const fill = el('div', 'dsr-bar-fill');
  fill.style.width = Math.round(f * 100) + '%';
  if (color) fill.style.background = color;
  track.appendChild(fill);
  row.appendChild(track);
  row.appendChild(el('span', 'dsr-meter-val', valueText));
  return row;
}

function needColor(f) { return f >= 0.66 ? 'var(--good)' : f >= 0.33 ? 'var(--warn)' : 'var(--bad)'; }
function regardColor(op) { return op > 15 ? 'var(--good)' : op < -15 ? 'var(--bad)' : 'var(--warn)'; }

class CitizenCard extends Panel {
  constructor(cid, onClose) {
    super('Dossier', 'panel-citizen', onClose);
    this.cid = cid;
  }

  render(cit, registry) {
    const cid = cit.cid;
    this.setTitle('DOSSIER · ' + (cit.name || String(cid)));

    // ── identity band: big portrait, name, role · activity, current emotion ──
    // (No MORALE meter — M1-F. See the REAL/SAMPLE ledger above: the number is a constant.)
    const portrait = portraitElement(resolvePortrait(cit, registry));
    const ident = el('div', 'dsr-ident');
    ident.appendChild(el('div', 'dsr-name', cit.name || String(cid)));
    const sub = [cit.role, cit.task ? ('› ' + cit.task) : ''].filter(Boolean).join('  ');
    ident.appendChild(el('div', 'dsr-role', sub || '—'));
    const emoWrap = el('div', 'dsr-chips');
    if (cit.mood) emoWrap.appendChild(el('span', 'dsr-emo', cit.mood)); // hide when the emotion is stale ('')
    ident.appendChild(emoWrap);
    const head = el('div', 'dsr-head');
    head.appendChild(el('div', 'dsr-portrait', undefined));
    head.firstChild.appendChild(portrait);
    head.appendChild(ident);

    const legend = el('div', 'dsr-legend',
      '◇ SAMPLE sections use placeholder data — the crew are simulated underneath; the live wiring lands next.');

    // ── NEEDS (SAMPLE) ──
    const nH = 0.72 + 0.28 * seeded(cid, 1), nF = 0.30 + 0.60 * seeded(cid, 2);
    const nW = 0.50 + 0.45 * seeded(cid, 3), nR = 0.25 + 0.62 * seeded(cid, 4);
    const needs = section('NEEDS', true, [
      meter('Health', nH, Math.round(nH * 100) + '%', needColor(nH)),
      meter('Food', nF, Math.round(nF * 100) + '%', needColor(nF)),
      meter('Water', nW, Math.round(nW * 100) + '%', needColor(nW)),
      meter('Rest', nR, Math.round(nR * 100) + '%', needColor(nR)),
    ]);

    // ── YOUR STANDING (SAMPLE) — affinity/trust toward the player, -100..+100 ──
    const aff = Math.round(-20 + 90 * seeded(cid, 5));
    const tru = Math.round(-10 + 60 * seeded(cid, 6));
    const standing = section('YOUR STANDING', true, [
      meter('Affinity', (aff + 100) / 200, (aff > 0 ? '+' : '') + aff, regardColor(aff)),
      meter('Trust', (tru + 100) / 200, (tru > 0 ? '+' : '') + tru, regardColor(tru)),
      el('div', 'dsr-hint', tru > 30 ? 'Seems close to telling you something.'
        : 'Talk to them to build trust.'),
    ]);

    // ── PERSONALITY — traits REAL, values/fears/speech SAMPLE ──
    const persona = el('div', 'dsr-sec dsr-sample');
    const pH = el('div', 'dsr-sec-hd');
    pH.appendChild(el('span', 'dsr-sec-title', 'PERSONALITY'));
    pH.appendChild(el('span', 'dsr-badge', '◇ SAMPLE'));
    persona.appendChild(pH);
    if ((cit.traits || []).length) {
      const tr = el('div', 'dsr-tags');
      tr.appendChild(el('span', 'dsr-tag-lbl', 'TRAITS'));
      for (const t of cit.traits) tr.appendChild(el('span', 'dsr-tag real', t)); // traits ARE real
      persona.appendChild(tr);
    }
    const vals = el('div', 'dsr-tags');
    vals.appendChild(el('span', 'dsr-tag-lbl', 'VALUES'));
    for (const v of pickN(SAMPLE_VALUES, cid, 10, 2)) vals.appendChild(el('span', 'dsr-tag', v));
    persona.appendChild(vals);
    const fears = el('div', 'dsr-tags');
    fears.appendChild(el('span', 'dsr-tag-lbl', 'FEARS'));
    for (const v of pickN(SAMPLE_FEARS, cid, 20, 2)) fears.appendChild(el('span', 'dsr-tag', v));
    persona.appendChild(fears);
    persona.appendChild(el('div', 'dsr-hint', 'Speech: ' + pick(SAMPLE_SPEECH, cid, 30)));

    // ── RELATIONSHIPS — REAL when the relations graph carries this crew, else a note ──
    const rel = Array.isArray(cit.relations) ? cit.relations : [];
    let relations;
    if (rel.length) {
      const rows = rel.slice(0, 8).map((r) => {
        const row = el('div', 'dsr-rel');
        row.appendChild(el('span', 'dsr-rel-dir', r.dir === 'out' ? '→' : '←'));
        row.appendChild(el('span', 'dsr-rel-name', r.name || ('#' + r.cid)));
        const op = el('span', 'dsr-rel-op', (r.opinion > 0 ? '+' : '') + r.opinion);
        op.style.color = regardColor(r.opinion);
        row.appendChild(op);
        if (r.note) row.appendChild(el('span', 'dsr-rel-note', r.note));
        return row;
      });
      relations = section('RELATIONSHIPS', false, rows);
    } else {
      relations = section('RELATIONSHIPS', false, [el('div', 'dsr-hint', 'No strong bonds recorded yet.')]);
    }

    // ── BACKSTORY (SAMPLE) ──
    const backstory = section('BACKSTORY', true, [
      el('div', 'dsr-prose', pick(SAMPLE_BACKSTORY, cid, 40)),
    ]);

    // ── RECENT MEMORIES (SAMPLE) ──
    const mems = pickN(SAMPLE_MEMORY, cid, 50, 3).map((m, i) => {
      const row = el('div', 'dsr-mem');
      row.appendChild(el('span', 'dsr-mem-dots', '●'.repeat(m[1]) + '○'.repeat(3 - m[1])));
      row.appendChild(el('span', 'dsr-mem-text', m[0]));
      return row;
    });
    const memories = section('RECENT MEMORIES', true, mems);

    // ── CONVERSATION LOG (REAL) ──
    const log = el('div', 'dsr-sec');
    log.appendChild(el('div', 'dsr-sec-hd')).appendChild(el('span', 'dsr-sec-title', 'CONVERSATION LOG'));
    const entries = citizenLog(cit);
    if (!entries.length) {
      log.appendChild(el('div', 'cit-log-empty', 'No conversations yet — press [T] to open a channel.'));
    } else {
      const scroll = el('div', 'cit-log-scroll');
      for (const e of entries) {
        const row = el('div', 'cit-log-line ' + (e.mine ? 'cit-log-you' : 'cit-log-crew'));
        row.appendChild(el('span', 'cit-log-who', e.mine ? 'YOU' : 'CREW'));
        row.appendChild(el('span', 'cit-log-text', e.text));
        scroll.appendChild(row);
      }
      log.appendChild(scroll);
    }

    const grid = el('div', 'dsr-grid');
    grid.append(needs, standing, persona, relations);

    this.body.replaceChildren(head, legend, grid, backstory, memories, log);
    const sc = this.body.querySelector('.cit-log-scroll');
    if (sc) sc.scrollTop = sc.scrollHeight; // keep the newest exchange in view
  }
}

// The MOSS terminal drawer is the real IDE now (ui/terminal.js), imported at the top.
