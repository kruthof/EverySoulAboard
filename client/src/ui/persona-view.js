// ⭐⭐ THE PERSONA WINDOW (M4-2) — ONE CLICK, ONE WINDOW, ONE DOOR FROM THE MAP TO A PERSON.
//
// The milestone's own sentence (`docs/ROADMAP.md:25`): *"One click → one Persona window: who she is,
// what she's doing, why, how she is — no ◇ SAMPLE anywhere; Chronicle reachable."* This module is
// that window. Its layout is the M4-1 charter's LAYOUT RULING — bands, in the gate sentence's own
// order, one scrolling column (DESIGN QUESTION (a) option 1) — and its mount is DESIGN QUESTION (c)
// option 1: a BODY-LEVEL SIBLING (`#persona`), never `#panels`.
//
// ⛔ WHY NOT `#panels`, MEASURED RATHER THAN PREFERRED. `#panels` is `display:none` under
// `body.roomzoom-open` (`client/styles/roomzoom.css:32`) and under `body.moss-open`
// (`client/styles/moss.css:465`) — and the Room Zoom's crew dock is precisely the surface with no
// readout at all (`docs/ROADMAP.md:55`; `MECHANICS.md:3151` measures `.rz-crewtask` at 118 px ≈ 22
// characters against the Overview's 264 px `.ov-task`). A window that cannot open where the readout
// is missing does not close that filing. `#persona` therefore inherits NEITHER hide rule from
// `roomzoom-open` — it is visible over BOTH standard surfaces — and it is outside `.app`, so M4-8's
// console deletion cannot take it with the shell.
//
// ⛔ FOUR BANDS, NOT FIVE, AND THE MISSING ONE IS A CHARTER RULE RATHER THAN AN OMISSION.
// M4-1 DESIGN QUESTION (e) ends: *"THE RULE: the HOW SHE IS band ships with, or after, the first
// break behaviour … a state line that stops after the adjective is a COSMETIC OPERATOR"*
// (`TARGET.md:65`, `:69`; OD-R's amendment). OD-S answered §10 item 1 = **A**, so the first break is
// package **M4-9** at merge-order position **4b** — AFTER this package at position 2. The band
// therefore cannot ship here, and the exit gate's *how she is* clause is **PARTIAL until M4-9**,
// reported rather than quietly filled.
// ⭐ AND THE SECOND HALF IS MEASURED, NOT ARGUED: its FIRST clause is not buildable today either.
// `dossier-honesty.test.js:113-118` records the census — `BuildRoster` emits
// cid/name/role/mood/task/portrait/morale/deck/x/y/traits, the `citizen` message carries
// role/mood/traits/portrait/log, and `grep -ri "hunger\|thirst\|fatigue" client/src` is EMPTY. Re-run
// on this tree: still empty. So "Exhausted and hungry" would need a wire channel that does not
// exist — and M4-2's charter says in terms: *"If this package finds it needs a sim read that does
// not exist, STOP — that is a different package and a pin question."*
//
// ⛔ NO ORDERS IN THIS WINDOW (§11, from the analogue). RimWorld's Bio tab hosts none; orders are the
// map's right-click and the Work tab, both of which Perilune already ships. A second arbitration
// entry point is *priority-cannot-live-in-the-dispatcher* in UI clothing. The layout leaves the
// footer free so char-sim §12.5's assignment verb could land later without a re-layout.
//
// ⛔ NO TRANSCRIPT (§11). `TARGET.md:46-47` (ship playable fully offline) + the vocabulary discipline
// (`console-retirement.plan.md:253-255`): *"'LLM ready', 'opt-in integration', 'character
// simulation'. Never 'LLM-powered', never 'talk to your crew' as a shipped promise."* `chat.js` stays
// retained-unwired as the substrate if an opted-in transcript is ever chartered.
//
// ⛔ NO METER, EVER (§11 + mutation 6). `TARGET.md:66-69` — *"No misery meters … never a bar the
// player feeds"* — and `dossier-honesty.test.js` now scans THIS FILE as well as `panels.js` for the
// meter shape, with a planted-violation control, because a pin deleted with the file it pinned is a
// pin deleted (M4 charter coupling 12).
//
// ── WHERE EVERY LINE COMES FROM, SO NOTHING ON THIS WINDOW IS INVENTED ───────────────────────────
//   name · role · deck · traits · task   `roster`   (`Hud.getRoster()`)
//   which room she is standing in        `decks`+`rooms` → `crewRoomSlot` (the Room Zoom's own join)
//   ORDER STUCK — <reason>               `blocked`  (`crewBlockedOrder`, the SAME join the Overview
//                                        readout and the Room Zoom badge use — three renderings of
//                                        ONE row, never three derivations)
//   skills 0..20 + what she can NEVER do `workcaps` (`workRowColumns`/`workSkillLabel`/`isIncapableOf`)
//   who knows her                        `relations` (`edgesOf`/`regardRows`)
// ⛔ AND THE FOUR HONEST EMPTIES, each written rather than hidden (`invisible feedback is
// FUNCTIONAL`, binding 2026-07-26; the charter's own copy where it gave copy):
//   the written identity   — `PersonaSheet` is host-owned and on no wire. **M4-3** brings it.
//   the prose bonds        — same sheet, same package.
//   the live bond graph    — *"No one aboard knows her yet."* (DESIGN QUESTION (d) option 1)
//   her chronicle lines    — *"No chronicle entries name her yet."* (coupling 8: **M4-7** carries
//                            `SubjectA`/`SubjectB` out on the `chron` wire FOR THIS BAND, and M4-2
//                            merges first. ⛔ Not a stub — an honest empty state.)
// ⚠️ A CLIENT-SIDE TEXT-NAME JOIN IS REFUSED, not merely unimplemented (DESIGN QUESTION (f) option 1:
// `MECHANICS.md` §13.43.3 records the regression class, and `surnameOf` collides by construction on a
// crew with shared surnames). *A join on prose is a bug with a schedule.*
//
// ⚠️ THE WINDOW PINS THE CID IT WAS OPENED WITH. It does not follow the frame's selection: it is
// opened by a click on a PERSON and shows that person until it is dismissed. (RimWorld's inspector
// follows selection because it is a persistent dock; ours is a modal takeover, and the *verb parity
// is NOT sufficient* rule — binding 2026-07-26 — says porting the behaviour without the persistence
// ports the cost and not the benefit.) Its DATA is live: every `onShipUpdate` repaints the open
// window, so the task sentence and the stuck-order line move while it is up.

import * as Hud from './hud.js';
import { pawnChip } from '../render/pawn-svg.js';
import { crewBlockedOrder, surnameOf } from './console-model.js';
import { decodeBlocked, decodeWorkCaps, decodeDecks, decodeRooms, isIncapableOf } from '../wire/messages.js';
import { decksView } from './decks-model.js';
import { crewRoomSlot } from './room-model.js';
import { WORK_COLUMNS, workRowColumns, workSkillLabel } from './overview-model.js';
import { edgesOf, regardRows } from './relations-model.js';

let _root = null;         // #persona, the body-level container
let _open = false;
let _cid = null;          // the crew member this window was opened for (pinned; see the header)
let _bustCid = null;      // the cid the bust SVG was last written for (it never changes for a cid)
// ⚠️ THE FOUR WRITE GUARDS. `onShipUpdate` fires on every ship-surface wire dispatch — measured at
// ~5–8/s on `--ship wreck` while a crew member walks (`roomzoom-view.js`'s `paintCrewDock` header
// carries the numbers) — so a window that rebuilt its lists on every repaint would tear down and
// re-create ~15 nodes several times a second for the whole time it is open. That is the churn the
// Room Zoom's dock was rewritten to stop, and here it would also drop a `title` tooltip mid-hover.
// Each list is rebuilt only when its own signature changes; everything else is a guarded text write.
let _traitsKey = '';      // the trait set the chips were last built for
let _canKey = '';         // the CAN/CANNOT signature (columns + levels + mask)
let _tiesKey = '';        // the bond-row signature (direction + cid + opinion + note)
const _el = {};           // built-once node references — every paint is a guarded in-place write

const mk = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
/** Guarded text write — an idle repaint mutates nothing (the Room Zoom dock's rule, same reason). */
function setText(node, v) { if (node && node.textContent !== v) node.textContent = v; }
/** Guarded hide — `hidden` is the switch; nothing here is styled away. */
function setHidden(node, on) { if (node && node.hidden !== !!on) node.hidden = !!on; }

/**
 * Mount the Persona window. Call once from main.js, which also registers the returned controller
 * with `Hud.setPersonaWindow` — the seam `openPersonaForSelected` lowers to.
 *
 * ⚠️ THE REGISTRATION IS WHY THIS MODULE IS NOT IMPORTED BY `hud.js`, and it is a MEASURED
 * constraint, not a style preference: `surface-boundary.test.js`'s `HUD_IMPORT_SPECIFIERS = 10` is
 * pinned by EQUALITY on a file that is CLOSED TO NEW WORK, so an eleventh import in `hud.js` is red
 * by construction. `Hud.onDialogueSend`/`onShipUpdate` are the shipped precedent for the shape.
 * @returns {{open:(cid:number)=>void, close:()=>void, isOpen:()=>boolean}}
 */
export function initPersona() {
  _root = document.getElementById('persona');
  if (!_root) return { open: () => {}, close: () => {}, isOpen: () => false };
  buildSkeleton();
  Hud.onShipUpdate(() => { if (_open) paint(); });
  return { open: openFor, close, isOpen: () => _open };
}

/** The window's DOM, built ONCE. Every later paint mutates text in place (no rebuild, no innerHTML
 *  churn) — the same rule the Room Zoom's crew dock states: a node torn down between mousedown and
 *  mouseup fires no `click` in Chrome at all. */
function buildSkeleton() {
  _root.hidden = false; // the `body.persona-open` CSS switch drives visibility from here on

  const sheet = mk('div', 'pv-sheet');

  // ── the head: the window's own name, and the way out ──
  const head = mk('div', 'pv-head');
  _el.title = head.appendChild(mk('div', 'pv-title', 'PERSONA'));
  head.appendChild(mk('div', 'pv-spacer'));
  const close = mk('button', 'pv-close', '[ESC] CLOSE');
  close.setAttribute('type', 'button');
  close.setAttribute('data-pv-close', '');
  _el.close = head.appendChild(close);
  sheet.appendChild(head);

  const scroll = mk('div', 'pv-scroll');

  // ── band 1 — IDENTITY: "who she is" ──
  const b1 = band('IDENTITY');
  const idrow = mk('div', 'pv-idrow');
  const bust = mk('span', 'pv-bust');
  bust.innerHTML = '<svg viewBox="0 0 16 20"></svg>';
  _el.bust = bust.childNodes[0] || bust;
  idrow.appendChild(bust);
  const idcol = mk('span', 'pv-idcol');
  _el.name = idcol.appendChild(mk('span', 'pv-name'));
  _el.role = idcol.appendChild(mk('span', 'pv-role'));
  _el.where = idcol.appendChild(mk('span', 'pv-where'));
  idrow.appendChild(idcol);
  b1.body.appendChild(idrow);
  _el.traits = b1.body.appendChild(mk('div', 'pv-traits'));
  // The one-line written identity. EMPTY AND HONEST until M4-3 puts `PersonaSheet` on the wire.
  _el.written = b1.body.appendChild(mk('div', 'pv-prose pv-empty',
    'Nothing is written about her yet.'));
  scroll.appendChild(b1.el);

  // ── band 2 — DOING & WHY: "what she's doing" + "why" ──
  // ⭐ THE WHOLE SENTENCE, NEVER TRUNCATED — that is what this band is FOR. `MECHANICS.md:3151`
  // measures the two docks clipping it (145 px / 118 px); the Overview readout holds it at 264 px by
  // wrapping. Here it has a whole window. ⛔ The text is the roster's `task` field VERBATIM: no
  // prefix, no `watchTask` derivation (whose `what` deliberately drops M2-6's ranking clause for the
  // narrow docks), no ellipsis. `persona-view.test.js` asserts EQUALITY with the wire field.
  const b2 = band('DOING & WHY');
  _el.task = b2.body.appendChild(mk('div', 'pv-task'));
  // …and, under it, WHY THE ORDER THE PLAYER GAVE HER IS NOT HAPPENING (D5). The SAME
  // `crewBlockedOrder` join as the Overview readout and the Room Zoom badge — one row, three
  // renderings. Hidden, not blanked, when nothing about her is stuck.
  _el.stuck = b2.body.appendChild(mk('div', 'pv-stuck'));
  scroll.appendChild(b2.el);

  // ── band 3 — CAN & CANNOT: RW§1.6 + §6.1's own surface ──
  // `MECHANICS.md:5771`, quoted: *"RimWorld puts that in the pawn's Bio tab ('Incapable Of', with the
  // source on hover). We have no such surface — the Persona window is M4."* This is that surface.
  // ⛔ THE STRUCTURE IS THE STATEMENT (`rimworld-reference.md:335`): a work type she can NEVER do is
  // not a greyed cell — it is NO CELL, listed instead under CANNOT. `workRowColumns` decides the set
  // and this DOM is built from its answer, exactly as the WORK tab's rows are.
  const b3 = band('CAN & CANNOT');
  _el.can = b3.body.appendChild(mk('div', 'pv-skills'));
  _el.cannotHd = b3.body.appendChild(mk('div', 'pv-subhd', 'CANNOT — EVER'));
  _el.cannot = b3.body.appendChild(mk('div', 'pv-cannot'));
  // ⚠️ THE SOURCE IS NOT ON THE WIRE AND THE WINDOW SAYS SO. RimWorld names WHICH backstory or trait
  // disables the work type; `workcaps` carries the mask BYTE and nothing else
  // (`hosts/web/WireFormat.WorkCaps.cs`), and `SleeperAptitudes` is host-side. Inventing a source
  // would be a ◇ SAMPLE in the one band the exit gate names by name.
  _el.cannotWhy = b3.body.appendChild(mk('div', 'pv-note pv-empty',
    'Why is not recorded on the wire yet.'));
  scroll.appendChild(b3.el);

  // ── band 4 — TIES & HISTORY: the payload VISION names ──
  const b4 = band('TIES & HISTORY');
  _el.ties = b4.body.appendChild(mk('div', 'pv-ties'));
  _el.tiesEmpty = b4.body.appendChild(mk('div', 'pv-note pv-empty', 'No one aboard knows her yet.'));
  b4.body.appendChild(mk('div', 'pv-subhd', 'HER LINES IN THE CHRONICLE'));
  _el.history = b4.body.appendChild(mk('div', 'pv-note pv-empty',
    'No chronicle entries name her yet.'));
  scroll.appendChild(b4.el);

  sheet.appendChild(scroll);
  _root.appendChild(sheet);

  // Clicks: the close button, and the backdrop (the sheet's own clicks must not escape it).
  _root.addEventListener('click', onClick);
}

/** One band: a header rule plus a body the caller fills. */
function band(title) {
  const el = mk('section', 'pv-band');
  el.appendChild(mk('div', 'pv-bandhd', title));
  const body = el.appendChild(mk('div', 'pv-bandbody'));
  return { el, body };
}

function onClick(e) {
  const t = e && e.target;
  if (!t) return;
  if (t === _root) { close(); return; }                       // the backdrop dismisses
  if (t.getAttribute && t.getAttribute('data-pv-close') != null) { close(); return; }
  if (t.parentNode && t.parentNode.getAttribute &&
      t.parentNode.getAttribute('data-pv-close') != null) close();
}

/** Open the window for one crew member. Called ONLY through `Hud.openPersonaForSelected` — the one
 *  sanctioned crew-interaction seam (`surface-boundary.test.js`'s CREW_INTERACTION census). */
function openFor(cid) {
  const id = Number(cid);
  if (!Number.isFinite(id)) return;
  _cid = id;
  _open = true;
  if (document.body && document.body.classList) document.body.classList.add('persona-open');
  paint();
}

function close() {
  if (!_open) return;
  _open = false;
  _cid = null;
  if (document.body && document.body.classList) document.body.classList.remove('persona-open');
}

// ⚠️ NO `isPersonaOpen` EXPORT HERE, DELIBERATELY. `hud.js` owns that read for the whole client
// (`Hud.isPersonaOpen`, on `SHIP_STATE_REACH`), and it answers it through the registered controller's
// `isOpen()`. A second exported spelling of one fact is the drift M2-6 already paid for; the first
// draft shipped one and nothing referenced it.

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE PAINT
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The roster row for the pinned cid, or null (a crew member who died while her window was open). */
function entryOf(cid) {
  const roster = Hud.getRoster();
  const crew = roster && Array.isArray(roster.crew) ? roster.crew : [];
  for (const e of crew) if (e && Number(e.cid) === Number(cid)) return e;
  return null;
}

function paint() {
  if (!_root || !_open || _cid == null) return;
  const sel = entryOf(_cid);
  if (!sel) {
    // ⚠️ NOT SILENTLY CLOSED. A window that vanished would be indistinguishable from a click that
    // missed. The gate sentence's four questions have one honest answer left about someone who is
    // no longer on the roster, and this is it.
    setText(_el.title, 'PERSONA');
    setText(_el.name, '—');
    setText(_el.role, '');
    setText(_el.where, 'NO LONGER ABOARD');
    setText(_el.task, '');
    setHidden(_el.stuck, true);
    // ⚠️ THE IDENTITY HALF IS EMPTIED TOO, AND THE FIRST DRAFT DID NOT DO IT — the comment above
    // claimed the window stops asserting things about her and the trait chips, the bust and the
    // written-identity line all stayed standing, because `_traitsKey`/`_bustCid` are write guards
    // and an unchanged key skips the write. A guard is not a state machine: when the subject leaves,
    // the keys have to be invalidated or the guard preserves exactly what it was meant to update.
    if (_traitsKey !== '') { _el.traits.replaceChildren(); _traitsKey = ''; }
    setHidden(_el.traits, true);
    if (_bustCid !== null) { _el.bust.innerHTML = ''; _bustCid = null; }
    setHidden(_el.written, true);
    // ⚠️ THE BAND FRAMES STAY — the four headers and the section labels are the WINDOW, not claims
    // about a person. What goes is every sentence that asserted something about HER: the chips, the
    // bust, the skill rows, the bonds, and all four honest empties (an empty state is a statement
    // about a subject, and the subject is gone).
    // …and the bands that described HER are emptied rather than left standing. A skill row or a bond
    // that outlived its subject is the same lie as a fabricated one.
    if (_canKey !== '') { _el.can.replaceChildren(); _el.cannot.replaceChildren(); _canKey = ''; }
    setHidden(_el.cannotHd, true); setHidden(_el.cannot, true); setHidden(_el.cannotWhy, true);
    if (_tiesKey !== '') { _el.ties.replaceChildren(); _tiesKey = ''; }
    setHidden(_el.ties, true); setHidden(_el.tiesEmpty, true); setHidden(_el.history, true);
    return;
  }

  // ── IDENTITY ──
  setText(_el.title, 'PERSONA · ' + (sel.name || String(_cid)));
  if (String(_cid) !== _bustCid) {
    _el.bust.innerHTML = pawnChip({ cid: sel.cid, role: sel.role }, { idPrefix: 'pv' + _cid });
    _bustCid = String(_cid);
  }
  setText(_el.name, sel.name || String(_cid));
  setText(_el.role, String(sel.role || '').toUpperCase());
  const room = crewRoomSlot(decksView(decodeDecks(Hud.getDecks()), decodeRooms(Hud.getRooms())), sel);
  setText(_el.where, 'DECK ' + (sel.deck | 0) + ' · ' + (room && room.displayName ? room.displayName : 'NO ROOM'));

  const traits = Array.isArray(sel.traits) ? sel.traits : [];
  const tkey = traits.join('|');
  if (tkey !== _traitsKey) {
    _el.traits.replaceChildren(...traits.map((t) => mk('span', 'pv-trait', String(t))));
    _traitsKey = tkey;
  }
  setHidden(_el.traits, traits.length === 0);

  // ── DOING & WHY ──
  setText(_el.task, String(sel.task || ''));
  const stuck = crewBlockedOrder(decodeBlocked(Hud.getBlocked()), Number(sel.cid));
  setText(_el.stuck, stuck ? 'ORDER STUCK — ' + stuck.sentence : '');
  setHidden(_el.stuck, !stuck);

  // ── CAN & CANNOT ──
  paintCaps(Number(sel.cid));

  // ── TIES & HISTORY ──
  paintTies(sel);
}

/**
 * The capability band. `caps === null` is *we have not been told yet* and is NOT level 0 and NOT
 * "incapable of nothing" — `workRowColumns` keeps every column and `workSkillLabel` renders `·`,
 * which is the seam's own stated contract (`overview-view.js`'s `workCapsFor` header).
 */
function paintCaps(cid) {
  const rows = decodeWorkCaps(Hud.getWorkCaps());
  let caps = null;
  if (rows) for (const r of rows) if (r.cid === (cid | 0)) { caps = r; break; }
  const columns = workRowColumns(caps);
  const cannot = WORK_COLUMNS.filter((c) => isIncapableOf(caps, c.type));
  const key = cid + '|' + columns.map((c) => c.type).join(',') + '|'
    + columns.map((c) => (caps && caps.skills ? caps.skills[c.type] : 'x')).join(',');
  if (key !== _canKey) {
    _canKey = key;
    _el.can.replaceChildren(...columns.map((c) => {
      const skill = workSkillLabel(caps && caps.skills ? caps.skills[c.type] : null);
      const row = mk('div', 'pv-skill');
      row.setAttribute('title', c.title);
      row.appendChild(mk('span', 'pv-skill-lbl', c.label));
      row.appendChild(mk('span', 'pv-skill-lvl ' + skill.state, skill.text));
      return row;
    }));
    _el.cannot.replaceChildren(...cannot.map((c) => mk('div', 'pv-cannot-row', c.label)));
  }
  // The whole CANNOT half disappears when there is nothing to say — including its "why" note. That
  // is not hiding an empty state: the empty state here is *she can do all six*, and the CAN list
  // above says so completely. (⚠️ On the wreck at boot that is RELL, and only Rell: charter §12.15 —
  // `SleeperAptitudes` gives every one of the seven thawed sleepers at least one incapability, and
  // Rell boots with the fleet-wide default and an EMPTY mask.)
  setHidden(_el.cannotHd, cannot.length === 0);
  setHidden(_el.cannot, cannot.length === 0);
  setHidden(_el.cannotWhy, cannot.length === 0);
}

/** The bond band: live directed SOCL edges, named through the cid-keyed roster. */
function paintTies(sel) {
  const roster = Hud.getRoster();
  const crew = roster && Array.isArray(roster.crew) ? roster.crew : [];
  const nameByCid = (id) => {
    for (const e of crew) if (e && Number(e.cid) === Number(id)) return e.name || ('#' + id);
    return '#' + id;
  };
  const { outgoing, incoming } = regardRows(edgesOf(Hud.getRelations()), Number(sel.cid));
  const rows = [
    ...outgoing.map((r) => ({ dir: '→', cid: r.cid, opinion: r.opinion, note: r.note })),
    ...incoming.map((r) => ({ dir: '←', cid: r.cid, opinion: r.opinion, note: r.note })),
  ];
  const key = sel.cid + '|' + rows.map((r) => r.dir + r.cid + ':' + r.opinion + ':' + r.note).join('|');
  if (key !== _tiesKey) {
    _tiesKey = key;
    _el.ties.replaceChildren(...rows.map((r) => {
      const row = mk('div', 'pv-tie');
      row.appendChild(mk('span', 'pv-tie-dir', r.dir));
      row.appendChild(mk('span', 'pv-tie-name', surnameOf(nameByCid(r.cid)) || nameByCid(r.cid)));
      row.appendChild(mk('span', 'pv-tie-op', (r.opinion > 0 ? '+' : '') + r.opinion));
      if (r.note) row.appendChild(mk('span', 'pv-tie-note', String(r.note)));
      return row;
    }));
  }
  setHidden(_el.ties, rows.length === 0);
  setHidden(_el.tiesEmpty, rows.length > 0);
}
