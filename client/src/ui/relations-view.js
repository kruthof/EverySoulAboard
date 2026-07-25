// THE RELATIONS SURFACE CONTROLLER — the crew relationship web, re-homed as a body-level sibling
// takeover (`#relations-view` + `body.relations-open`), exactly like `#moss-view` / `#overview-view`
// / `#roomzoom-view`.
//
// WHY THIS FILE EXISTS — a live regression, not a refactor. RELATIONS used to be an overlay *inside*
// the console's `.stage`, un-hidden by hud.js whenever the RELATIONS tab was active. On the standard
// ship (`--ship grid`) the modern Level-1 Overview is the surface, and it shows itself through
// `body.overview-open`, whose switch requires a SHIP tab (`overview-view.js` SHIP_TABS =
// build|crew). Selecting RELATIONS therefore dropped `overview-open`, `styles.css`'s
// `body.overview-open .app{display:none}` stopped applying, and the ENTIRE deprecated console shell
// — top bar, CREW WATCH, READOUT, bottom console — reappeared over the modern game. Measured
// 2026-07-25 on `--ship grid`: `body.className` became `""`, `.app` `display:grid` at 1440×813, with
// `.topbar`/`.crewwatch`/`.console` all painting real boxes.
//
// THE FIX is MOSS's pattern, not a new one: a top-level root with its OWN body class, so the surface
// it replaces is hidden by a rule that does not depend on any other surface's switch.
// `body.relations-open` hides `.app` and `#overview-view` outright; `body.moss-open` and
// `body.roomzoom-open` hide THIS root. Precedence is fixed in CSS at
// MOSS > Room Zoom > RELATIONS > Overview > console.
//
// Because the takeover now owns the whole window, it carries the two companions the console used to
// lend it: the crew list IX-R2 lets you click a name in, and the READOUT's two DIRECTED regard
// sections (IX-R7). Those are the same derivation (`relations-model.regardRows`) rendered with the
// same `.rr-*` markup — the relations-spec content contract is unchanged, only its home moved.
//
// It owns NO wire state and NO second selection model: like `overview-view.js` it reads the
// authoritative caches back through the hud getters, derives its own visibility from the shared tab
// state, and lowers a click to `Hud.selectCrewByCid` (the ONE shared selection flow). hud.js does
// NOT import this module — the subscription runs view→hud only, so there is no import cycle.
// Every non-trivial derivation is the PURE relations-model.js; this file is DOM/SVG glue.

import * as Hud from './hud.js';
import { surnameOf, crewInitials, crewHue, selectedRosterEntry } from './console-model.js';
import { pawnChip } from '../render/pawn-svg.js';
import {
  edgesOf, ringLayout, drawnEdges, focusTag, regardRows, signed,
} from './relations-model.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const LEGEND = [['close', 'CLOSE'], ['warm', 'WARM'], ['neutral', 'NEUTRAL'], ['hostile', 'HOSTILE'], ['secret', 'SECRET']];

let _root = null;           // #relations-view
let _onExit = () => {};     // how to leave (injected by main.js: back to the ship surface)
let _raf = 0;               // coalesce many wire messages into one repaint
const _el = {};             // cached skeleton refs
const _rows = new Map();    // cid → the crew-list row element
let _crewSig = '';          // last-rendered roster membership signature (rows rebuild only on change)

/**
 * Mount the RELATIONS surface + subscribe to the shared HUD state. Call once from main.js.
 * @param {{onExit?:() => void}} [opts] `onExit` leaves the surface (the CLOSE button). Escape is
 *   NOT bound here: it is rung 5 of the hud's own escape stack (`escapeTarget` → `setTab('build')`),
 *   and a second listener would give one gesture two owners.
 */
export function initRelations(opts) {
  const root = document.getElementById('relations-view');
  if (!root) return;
  if (opts && typeof opts.onExit === 'function') _onExit = opts.onExit;
  if (_root === root) { repaint(); return; } // mounted already: never a second listener/subscription
  _root = root;
  buildSkeleton();
  // Delegated on the ROOT, not per node: node clicks and crew-row clicks are the same gesture
  // (IX-R2), and re-rendered children then need no re-binding.
  _root.addEventListener('click', onClick);
  Hud.onShipUpdate(scheduleRepaint);
  repaint();
}

function buildSkeleton() {
  _root.classList.add('rl');
  // Visibility is the `body.relations-open` CSS switch from here on; the boot `hidden` attribute
  // only prevents a flash before this module runs (same contract as #overview-view).
  _root.hidden = false;
  _root.innerHTML =
    '<div class="rl-space"></div>' +
    '<div class="hud rl-topbar">' +
      '<span class="rl-ship">MSV PERILUNE</span>' +
      '<span class="rl-title" id="rl-title">RELATIONS</span>' +
      '<span class="rl-spacer"></span>' +
      '<button class="rl-close" data-rl-close>[ESC] CLOSE</button>' +
    '</div>' +
    '<aside class="hud rl-crew"><div class="rl-hdr" id="rl-crewhdr">CREW</div>' +
      '<div class="rl-crewlist" id="rl-crewlist"></div></aside>' +
    '<div class="rl-stage">' +
      '<svg id="rel-svg" class="rel-svg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>' +
    '</div>' +
    '<aside class="hud rl-readout" id="rl-readout"></aside>' +
    '<div class="hud rl-legend">' +
      LEGEND.map(([k, label]) => '<span class="rel-key"><i class="sw ' + k + '"></i>' + label + '</span>').join('') +
    '</div>';
  _el.title = document.getElementById('rl-title');
  _el.crewHdr = document.getElementById('rl-crewhdr');
  _el.crewList = document.getElementById('rl-crewlist');
  _el.svg = document.getElementById('rel-svg');
  _el.readout = document.getElementById('rl-readout');
}

function scheduleRepaint() {
  if (_raf) return;
  const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
  _raf = raf(() => { _raf = 0; repaint(); });
}

/** Whether RELATIONS should be the shown surface right now. Derived from the SHARED tab state (the
 *  one truth, exactly as MOSS's takeover is `_tab === 'moss'`) — never a private open/closed flag
 *  that could drift from it. */
function shouldShow() { return Hud.getTab() === 'relations'; }

/** Repaint the surface, toggling the ONE body switch styles.css keys every RELATIONS rule off. */
export function repaint() {
  if (!_root) return;
  const show = shouldShow();
  if (document.body && document.body.classList) document.body.classList.toggle('relations-open', show);
  if (!show) return; // hidden → skip the rebuild until it matters again

  const list = crewList();
  const sel = selectedRosterEntry(Hud.getFrame(), Hud.getRoster());
  const focusCid = sel ? sel.cid : null;
  paintTitle(list);
  paintCrewList(list, focusCid);
  paintWeb(list, focusCid);
  paintReadout(sel);
}

function crewList() {
  const m = Hud.getRoster();
  return m && Array.isArray(m.crew) ? m.crew : [];
}

function relEdges() { return edgesOf(Hud.getRelations()); }

function paintTitle(list) {
  const t = 'RELATIONS — ' + list.length + ' SOUL' + (list.length === 1 ? '' : 'S') + ' · CLICK A NAME TO FOCUS';
  if (_el.title && _el.title.textContent !== t) _el.title.textContent = t;
  const h = 'CREW — ' + list.length;
  if (_el.crewHdr && _el.crewHdr.textContent !== h) _el.crewHdr.textContent = h;
}

/** The crew list (the console CREW WATCH's job on this surface). Rows are rebuilt only when the
 *  roster MEMBERSHIP changes: this surface repaints on every ship update (~1 Hz), and a wholesale
 *  rebuild at that rate is what tore the Overview's islands out from under the pointer (BUG-A). */
function paintCrewList(list, focusCid) {
  if (!_el.crewList) return;
  const sig = list.map((e) => e.cid + ':' + (e.name || '') + ':' + (e.role || '')).join('|');
  if (sig !== _crewSig) {
    _crewSig = sig;
    _rows.clear();
    _el.crewList.innerHTML = list.length ? '' : '<div class="rl-guide">No souls aboard.</div>';
    for (const e of list) {
      const b = document.createElement('button');
      b.className = 'rl-crewrow';
      b.dataset.rlCrew = String(e.cid);
      b.innerHTML =
        '<span class="rl-bust"><svg viewBox="0 0 16 20">' + pawnChip({ cid: e.cid, role: e.role }) + '</svg></span>' +
        '<span class="rl-crewcol"><span class="rl-crewname">' + esc(surnameOf(e.name)) + '</span>' +
        '<span class="rl-crewrole">' + esc(e.role || '') + '</span></span>';
      _el.crewList.appendChild(b);
      _rows.set(e.cid, b);
    }
  }
  for (const [cid, el] of _rows) {
    const on = focusCid != null && cid === focusCid;
    if (el.classList.contains('sel') !== on) el.classList.toggle('sel', on);
  }
}

/** Build the SVG crew-web from the directed graph + roster order (IX-R4..R8). Nodes ring in roster
 *  order; edges are the deduped mutual lines (color = mutual tier, dashed = secret); the focused
 *  crew's edges brighten/thicken with boxed tags; other edges recede. Pure derivations live in
 *  relations-model.js — this is SVG glue. Lifted from hud.js's renderRelationsWeb. */
function paintWeb(list, focusCid) {
  const svg = _el.svg;
  if (!svg) return;
  // viewBox is 1000×640 (see buildSkeleton); the ellipse leaves room for surname labels + tags.
  const pos = ringLayout(list.length, { cx: 500, cy: 300, rx: 372, ry: 232 });
  const idxByCid = new Map(list.map((e, i) => [e.cid, i]));
  const lines = drawnEdges(relEdges());
  svg.classList.toggle('has-focus', focusCid != null);

  let edgesSvg = '', tagsSvg = '', nodesSvg = '';
  for (const ln of lines) {
    const ai = idxByCid.get(ln.a), bi = idxByCid.get(ln.b);
    if (ai == null || bi == null) continue; // an endpoint not on the current roster — skip
    const focused = focusCid != null && (ln.a === focusCid || ln.b === focusCid);
    if (!focused && !ln.draw) continue;      // unfocused noise stays invisible (IX-R6)
    const pa = pos[ai], pb = pos[bi];
    const cls = 'rel-edge tier-' + ln.tier + (ln.secret ? ' secret' : '') + (focused ? ' focus' : '');
    edgesSvg += `<line class="${cls}" x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" ` +
      `x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}"/>`;
    if (focused) {
      const tag = focusTag(ln, focusCid);
      if (tag) {
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
        const w = Math.max(48, tag.length * 7.4 + 14);
        tagsSvg += `<g class="rel-tag" transform="translate(${mx.toFixed(1)},${my.toFixed(1)})">` +
          `<rect x="${(-w / 2).toFixed(1)}" y="-10" width="${w.toFixed(1)}" height="20" rx="2"/>` +
          `<text x="0" y="4">${esc(tag)}</text></g>`;
      }
    }
  }
  for (let i = 0; i < list.length; i++) {
    const e = list[i], p = pos[i];
    const focused = e.cid === focusCid;
    nodesSvg += `<g class="rel-node${focused ? ' focus' : ''}" data-cid="${esc(e.cid)}" ` +
      `transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">` +
      `<circle class="rel-badge" r="24" style="fill:${crewHue(e.cid)}"/>` +
      (focused ? '<circle class="rel-ring" r="29"/>' : '') +
      `<text class="rel-initials" y="6">${esc(crewInitials(e.name))}</text>` +
      `<text class="rel-surname" y="46">${esc(surnameOf(e.name))}</text></g>`;
  }
  svg.innerHTML = edgesSvg + tagsSvg + nodesSvg; // edges behind, tags mid, nodes on top
}

/** The readout: who is focused, plus the two directed regard sections (IX-R7). */
function paintReadout(sel) {
  if (!_el.readout) return;
  const html = sel
    ? '<div class="rl-selname">' + esc(sel.name || '') + '</div>' +
      '<div class="rl-selrole">' + esc([sel.role, sel.mood].filter(Boolean).join(' · ')) + '</div>' +
      regardSectionsHtml(sel)
    : '<div class="rl-empty">NO CREW FOCUSED</div>' +
      '<div class="rl-guide">Click a name — in the web or the CREW list — to see their bonds both ways.</div>';
  if (_el.readout.innerHTML !== html) _el.readout.innerHTML = html;
}

/** The two directed regard sections for the focused crew (IX-R7): THEIR REGARD FOR OTHERS
 *  (outgoing "→ NAME  +N") and HOW OTHERS SEE {SURNAME} (incoming "NAME →  +N"), each with the
 *  relationship note beneath. Signed values: positive green, negative rust (VS-R). Lifted from
 *  hud.js's regardSectionsHtml; the two console-only classes it borrowed (`.zone-label`,
 *  `.ro-guide`) are now this surface's own `.rl-hdr` / `.rl-guide`, so the block survives the
 *  console's deletion. */
function regardSectionsHtml(sel) {
  const { outgoing, incoming } = regardRows(relEdges(), sel.cid);
  const byCid = new Map(crewList().map((e) => [e.cid, e]));
  const rowHtml = (r, arrowBefore) => {
    const other = byCid.get(r.cid);
    const label = other ? surnameOf(other.name) : ('#' + r.cid);
    const vcls = r.opinion > 0 ? 'pos' : r.opinion < 0 ? 'neg' : 'zero';
    const head = arrowBefore ? `→ ${esc(label)}` : `${esc(label)} →`;
    return `<div class="rr-row"><div class="rr-line"><span class="rr-name">${head}</span>` +
      `<span class="rr-val ${vcls}">${esc(signed(r.opinion))}</span></div>` +
      (r.note ? `<div class="rr-note">${esc(r.note.toUpperCase())}</div>` : '') + '</div>';
  };
  let h = '<div class="rr-section"><div class="rl-hdr">THEIR REGARD FOR OTHERS</div>';
  h += outgoing.length ? outgoing.map((r) => rowHtml(r, true)).join('')
    : '<div class="rl-guide">No recorded regard.</div>';
  h += '</div><div class="rr-section"><div class="rl-hdr">HOW OTHERS SEE ' +
    esc(surnameOf(sel.name)) + '</div>';
  h += incoming.length ? incoming.map((r) => rowHtml(r, false)).join('')
    : '<div class="rl-guide">No one has recorded regard.</div>';
  return h + '</div>';
}

// ── input ──

function onClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('[data-rl-close]')) { _onExit(); return; }
  // IX-R2: a node click OR a crew-row click selects that crew through the ONE shared selection flow,
  // so the web, the list and the readout stay in lockstep (and cross-deck resolution is identical to
  // a CREW WATCH row click).
  const node = t.closest('.rel-node');
  if (node && node.dataset.cid != null) { Hud.selectCrewByCid(Number(node.dataset.cid)); return; }
  const row = t.closest('[data-rl-crew]');
  if (row && row.dataset.rlCrew != null) Hud.selectCrewByCid(Number(row.dataset.rlCrew));
}
