// RELATIONS re-home tests (console-retirement WP-7).
//
// THE REGRESSION THESE GUARD. RELATIONS used to be an overlay INSIDE the console's `.stage`,
// un-hidden by hud.js whenever the RELATIONS tab was active. On the standard ship (`--ship grid`)
// the modern Level-1 Overview is the surface, and it shows itself with `body.overview-open`, whose
// switch requires a SHIP tab (`overview-view.js` SHIP_TABS = build|crew). Selecting RELATIONS
// therefore dropped `overview-open`, `styles.css`'s `body.overview-open .app{display:none}` stopped
// applying, and the ENTIRE deprecated console shell came back on screen over the modern game.
// Measured in headless Chrome on 2026-07-25 against `--ship grid`: `body.className` `""`, `.app`
// `display:grid` at 1440×813, `.topbar`/`.crewwatch`/`.console` all painting real boxes.
//
// Group A is the CSS/DOM/wiring contract, read out of the real `index.html` / `styles.css` /
// sources — a structural guard, declared as such. Group B drives the REAL hud.js +
// relations-view.js against `dom-lite` and asserts the behaviour: the shared tab state toggles the
// body switch, the surface renders the web and both directed regard sections, Escape leaves, and
// MOSS displaces it.
//
// WHAT THE CSS ASSERTIONS DO AND DO NOT PROVE — read this before trusting them. `hides()` parses
// the stylesheet as TEXT. It is honest about two defeats found in review:
//   * comments — the raw-regex version was satisfied by a commented-out rule, and this very file's
//     prose quotes `body.overview-open .app{display:none}`, so the pattern was already matchable by
//     a comment. Comments are now stripped before matching.
//   * later overrides — appending `body.relations-open .app{display:grid !important}` left the
//     first version green while the game was re-broken. `hides()` now models the ONE cascade rule
//     that covers the realistic accident: for a given selector, the LAST declaration in the file
//     wins, so it checks the last matching block rather than any of them.
// It still does NOT model the full cascade (a higher-specificity or inline override elsewhere is
// invisible to it), and it cannot produce a computed style at all. The computed proof is the
// browser harness: all 16 combinations of the four body switches, measured in Chrome.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DocumentLite, Element, fire } from './dom-lite.js';
import { edgesOf } from '../src/ui/relations-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const src = (rel) => readFileSync(join(CLIENT, rel), 'utf8');

/**
 * JS source with comments removed, quote-aware so `'ws://…'` and `"a // b"` survive intact.
 *
 * Not cosmetic: the first version of the wiring guard below was satisfied by
 * `// initRelations({ … });`, i.e. by the very mutation it exists to catch. Every source assertion
 * in this file reads code, never prose — including this file's own prose, which quotes the code it
 * guards and would otherwise match it.
 */
function stripJsComments(s) {
  let out = '', i = 0, q = null;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (q) {
      if (c === '\\') { out += c + (d || ''); i += 2; continue; }
      if (c === q) q = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}
const js = (rel) => stripJsComments(src(rel));

const HTML = src('index.html');
const HUD = js('src/ui/hud.js');
const MAIN = js('src/main.js');
const RVIEW = js('src/ui/relations-view.js');
const OVIEW = js('src/ui/overview-view.js');
const OMODEL = js('src/ui/overview-model.js');

/** The stylesheet with `/* … *\/` stripped, for the same reason. */
const CSS = src('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The value `prop` ends up with for exactly this selector, or null if never declared.
 *
 * Scans EVERY block whose selector list contains the compound and keeps the LAST declaration —
 * same-selector last-declaration-wins, which is the cascade rule a later accidental override trips.
 * See the header for what this deliberately does not model.
 * @param {string} selector e.g. `body.relations-open .app` (whitespace-normalised)
 * @param {string} prop e.g. `display`
 */
function lastDeclaration(selector, prop) {
  const want = selector.replace(/\s+/g, ' ').trim();
  const re = new RegExp(prop + '\\s*:\\s*([a-z-]+)', 'g');
  let value = null;
  for (const block of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = block[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (!selectors.includes(want)) continue;
    for (const d of block[2].matchAll(re)) value = d[1];
  }
  return value;
}

/** Does `body.<switch> <selector>` end up at `display:none`? Deleted AND overridden both fail. */
function hides(switchClass, selector) {
  return lastDeclaration('body.' + switchClass + ' ' + selector, 'display') === 'none';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Group A — the contract (structural: reads the real files)
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('A1: #relations-view is a BODY-LEVEL sibling, not a child of the console shell', () => {
  const body = HTML.slice(HTML.indexOf('<body>') + 6, HTML.indexOf('</body>'));
  const app = body.slice(body.indexOf('<div class="app">'), body.indexOf('\n</div>\n') + 8);
  assert.ok(app.includes('class="topbar"'), 'the slice really is the .app shell');
  assert.ok(!app.includes('relations-view'),
    'the RELATIONS root must not live inside .app — that is what tied it to the console shell');
  // and it is declared exactly once, at the top level, beside the other takeovers
  assert.equal(body.split('id="relations-view"').length - 1, 1);
  const ids = topLevelBodyRootIds(HTML);
  assert.ok(ids.includes('relations-view'),
    '#relations-view must be a TOP-LEVEL body root like #moss-view; top-level roots are ' + ids.join(','));
  for (const sibling of ['moss-view', 'overview-view', 'roomzoom-view']) {
    assert.ok(ids.includes(sibling), 'sanity: the scanner finds the known takeovers (' + sibling + ')');
  }
});

/** Top-level body roots' ids (same scan moss-screen.test.js uses for the IX-M1 covered set). */
function topLevelBodyRootIds(html) {
  const VOID = new Set(['br', 'hr', 'img', 'input', 'link', 'meta', 'source']);
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
    .replace(/<!--[\s\S]*?-->/g, '');
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
  const out = [];
  let depth = 0, m;
  while ((m = re.exec(body)) !== null) {
    const closing = m[1] === '/', tag = m[2].toLowerCase(), attrs = m[3], selfClosed = m[4] === '/';
    if (closing) { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) out.push((/id="([^"]+)"/.exec(attrs) || [, ''])[1]);
    if (!VOID.has(tag) && !selfClosed) depth++;
  }
  return out.filter(Boolean);
}

// A CSS switch only fires if something mounts the surface, and NOTHING covered that until review
// found it: commenting out `initRelations({…})` in main.js left the whole node suite green while
// the browser reproduced the original regression verbatim (`body=""`, `.app` painting at 1440×813,
// the console back on screen). `main.js` is exactly the seam WP-9 edits, so the wiring needs a
// guard of its own — the same shape as `input.test.js`'s "both installInput blocks are wired".
//
// The rule, derived rather than hand-listed: a top-level body root whose id matches a
// `src/ui/<id>.js` SURFACE CONTROLLER (the `*-view.js` naming convention) is mounted from main.js,
// so main.js must import that module and call the `init*` function it exports. Roots with no such
// module (`#moss-view` → moss-screen.js, `#panels` → panels.js, both mounted lazily by hud.js) are
// out of scope by construction, not by exception list.
//
// MUTATION: comment out the `initRelations(...)` call in main.js ⇒ red.
// MUTATION: drop the `relations-view.js` import from main.js ⇒ red.
// MUTATION: add a `foo-view.js` surface + `#foo-view` root and forget to mount it ⇒ red.
test('A0: every *-view surface root declared in index.html is actually mounted by main.js', () => {
  const roots = topLevelBodyRootIds(HTML).filter((id) => id.endsWith('-view')
    && existsSync(join(CLIENT, 'src/ui/' + id + '.js')));
  assert.ok(roots.includes('relations-view'), 'the RELATIONS surface is in scope of this guard');
  assert.ok(roots.length >= 3, 'the loop is not vacuous — surfaces found: ' + roots.join(','));
  for (const id of roots) {
    const mod = src('src/ui/' + id + '.js');
    const initFn = (/export function (init[A-Za-z]*)\s*\(/.exec(mod) || [])[1];
    assert.ok(initFn, `src/ui/${id}.js exports no init* — a surface nobody can mount`);
    assert.ok(MAIN.includes("from './ui/" + id + ".js'"),
      `main.js does not import ./ui/${id}.js`);
    assert.ok(new RegExp('(^|[^./\\w])' + initFn + '\\s*\\(', 'm').test(MAIN),
      `main.js never calls ${initFn}() — the #${id} surface is declared, styled and dead. ` +
      'This is the seam whose absence reproduced the original console regression.');
  }
});

// THE anti-recurrence guard, and the one that fails if the fix is reverted.
//
// The rule it mechanises: the Overview's command bar offers tabs that are NOT ship tabs. Selecting
// one drops `body.overview-open`, so the ONLY thing then keeping the deprecated console off screen
// is that tab's own body switch. Every such tab must have one. Conventionally tab `x` owns
// `body.x-open` (moss → moss-open, relations → relations-open).
//
// MUTATION: delete `body.relations-open .app{display:none !important}` from styles.css ⇒ red.
// MUTATION: add a sixth non-inert Overview tab with no switch of its own ⇒ red (the point: a future
// lane cannot repeat this by accident).
test('A2: every non-ship, non-inert Overview tab hides the console shell with its OWN body switch', () => {
  const ovTabs = Array.from((/const OV_TABS = \[([\s\S]*?)\];/.exec(OVIEW) || [, ''])[1]
    .matchAll(/\['([a-z]+)'/g)).map((m) => m[1]);
  const shipTabs = Array.from((/const SHIP_TABS = new Set\(\[([^\]]*)\]/.exec(OVIEW) || [, ''])[1]
    .matchAll(/'([a-z]+)'/g)).map((m) => m[1]);
  const inert = Array.from((/INERT_TABS = Object\.freeze\(\[([^\]]*)\]/.exec(OMODEL) || [, ''])[1]
    .matchAll(/'([a-z]+)'/g)).map((m) => m[1]);
  assert.ok(ovTabs.length >= 5, 'parsed the Overview tab set, got ' + ovTabs.join(','));
  assert.ok(shipTabs.length >= 1 && inert.length >= 1, 'parsed SHIP_TABS + INERT_TABS');

  const needSwitch = ovTabs.filter((t) => !shipTabs.includes(t) && !inert.includes(t));
  assert.ok(needSwitch.length,
    'the loop below must not be vacuous — some Overview tab leaves for a surface of its own');
  for (const tab of needSwitch) {
    assert.ok(hides(tab + '-open', '.app'),
      `selecting ${tab.toUpperCase()} drops body.overview-open, so body.${tab}-open MUST hide .app ` +
      '— without it the whole deprecated console reappears over the modern game');
  }
});

// The concrete pin, asserted UNCONDITIONALLY so it survives any future edit to SHIP_TABS: this one
// rule is the difference between the measured regression and the fix. (Putting `relations` back into
// SHIP_TABS would NOT re-break the game now — both switches hide `.app` — which is why the generic
// guard above must not be pinned to the current tab split.)
test('A2b: body.relations-open hides the console shell — THE rule the regression was missing', () => {
  assert.ok(hides('relations-open', '.app'));
});

test('A3: the RELATIONS root is display:none by default and shown only by its own switch', () => {
  assert.equal(lastDeclaration('#relations-view', 'display'), 'none',
    'default-hidden, so a session that never opens RELATIONS shows nothing');
  assert.equal(lastDeclaration('body.relations-open #relations-view', 'display'), 'block',
    'and its own switch is the only thing that shows it');
});

test('A4: under the RELATIONS takeover the Overview is display:none too (not merely covered)', () => {
  assert.ok(hides('relations-open', '#overview-view'));
});

test('A5: precedence — MOSS and the Room Zoom beat RELATIONS; #panels deliberately does not', () => {
  assert.ok(hides('moss-open', '#relations-view'), 'MOSS beats everything (IX-M1)');
  assert.ok(hides('roomzoom-open', '#relations-view'), 'a Level-2 zoom beats a Level-1 surface');
  assert.ok(!hides('relations-open', '#panels'),
    'the dossier must still open over RELATIONS — it is the escape rung ABOVE it (escapeTarget)');
});

test('A6: hud.js keeps the STATE seam and none of the RELATIONS DOM, and there is no import cycle', () => {
  for (const needle of ['rel-svg', 'rel-node', "$('relations-view')", 'rr-section',
    'renderRelationsWeb', 'regardSectionsHtml', 'reflectRelationsView']) {
    assert.equal(HUD.split(needle).length - 1, 0,
      `hud.js still mentions ${needle} — the surface owns its own DOM now`);
  }
  assert.match(HUD, /export function getRelations\(\)/, 'the cache is still exposed as a getter');
  assert.ok(!/from '\.\/relations-view\.js'/.test(HUD),
    'hud.js must not import the surface: the subscription runs view→hud only, so there is no cycle');
  assert.match(RVIEW, /import \* as Hud from '\.\/hud\.js'/);
});

test('A7: the surface invents no second selection path — it lowers to the ONE shared flow', () => {
  assert.equal(RVIEW.split('Hud.selectCrewByCid(').length - 1, 2,
    'exactly two lowerings: a web node and a crew row');
  assert.equal(RVIEW.split('Cmd.').length - 1, 0,
    'the surface sends no command of its own; selection goes through the hud seam');
  assert.match(RVIEW, /Hud\.onShipUpdate\(/, 'it repaints off the shared ship-update notification');
  assert.match(RVIEW, /Hud\.getTab\(\) === 'relations'/,
    'visibility is derived from the shared tab state, never a private open/closed flag');
});

test('A8: edgesOf is the one guard both consumers use for a possibly-missing relations message', () => {
  assert.deepEqual(edgesOf(null), []);
  assert.deepEqual(edgesOf({}), []);
  assert.deepEqual(edgesOf({ edges: 'nope' }), []);
  const e = [[1, 2, 40, 0, 'ally', false]];
  assert.equal(edgesOf({ edges: e }), e, 'a real list is passed through, not copied');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Group B — behaviour, through the real modules
// ─────────────────────────────────────────────────────────────────────────────────────────────

// A slightly larger dom-lite: `innerHTML`, sibling walking and `closest`, which the two surfaces
// use and moss-screen.js does not. Subclassed here rather than added to dom-lite.js so the shared
// helper keeps its "exactly the surface moss-screen touches" contract.
class El extends Element {
  constructor(doc, tag) { super(doc, tag); this._html = ''; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  get firstElementChild() { return this.childNodes.find((c) => c.nodeType === 1) || null; }
  get nextElementSibling() {
    if (!this.parentNode) return null;
    const sibs = this.parentNode.childNodes.filter((c) => c.nodeType === 1);
    return sibs[sibs.indexOf(this) + 1] || null;
  }
  get firstChild() { return this.childNodes[0] || null; }
  insertBefore(node, ref) {
    node.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i >= 0) this.childNodes.splice(i, 0, node); else this.childNodes.push(node);
    return node;
  }
  querySelector(sel) {
    const cls = String(sel).replace(/^:scope\s*>\s*/, '').replace(/^\./, '');
    return this.oneClass(cls);
  }
  closest(sel) {
    const want = String(sel).replace(/^\./, '').replace(/^\[data-([a-z-]+)\]$/, '$1');
    let n = this;
    while (n && n.nodeType === 1) {
      if (n.classList.contains(want)) return n;
      if (/^\[data-/.test(sel)) {
        const key = sel.replace(/^\[data-|\]$/g, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (n.dataset && n.dataset[key] !== undefined) return n;
      }
      n = n.parentNode;
    }
    return null;
  }
}

class Doc extends DocumentLite {
  constructor() { super(); this.body = new El(this, 'body'); }
  createElement(tag) { return new El(this, tag); }
  querySelector() { return null; }          // no console shell in this fixture
  querySelectorAll() { return []; }
}

const doc = new Doc();
const put = (id) => doc.register(id, new El(doc, 'div'));
// The ids the two modules address. #relations-view is the surface root; the rest are the skeleton
// nodes relations-view.js looks up after writing its innerHTML (this fixture registers them by hand
// because dom-lite does not parse markup). `crew-count`/`crewlist` are the console CREW WATCH nodes
// hud.js's roster dispatch writes to unconditionally.
const rlRoot = put('relations-view');
const rlTitle = put('rl-title');
const rlCrewHdr = put('rl-crewhdr');
const rlCrewList = put('rl-crewlist');
const relSvg = put('rel-svg');
const rlReadout = put('rl-readout');
put('crew-count');
put('crewlist');
put('s-deck');
put('s-lens');
put('legendcard');

globalThis.document = doc;

const Hud = await import('../src/ui/hud.js');
const RelationsView = await import('../src/ui/relations-view.js');

/** relations-view coalesces repaints onto a frame; node has no rAF, so it falls back to a timer. */
const settle = () => new Promise((r) => setTimeout(r, 40));

const CREW = [
  { cid: 1, name: 'Amara Osei', role: 'BOTANIST', deck: 0, x: 3, y: 3, morale: 0.8, task: 'Idle' },
  { cid: 2, name: 'Dmitri Volkov', role: 'ENGINEER', deck: 0, x: 5, y: 3, morale: 0.5, task: 'Idle' },
  { cid: 3, name: 'Salif Traore', role: 'ENGINEER', deck: 0, x: 7, y: 3, morale: 0.5, task: 'Idle' },
];
// DIRECTED tuples [from,to,opinion,tier,note,secret] — the wire's own shape.
const EDGES = [
  [1, 2, 65, 0, 'confidante', false],
  [2, 1, 65, 0, '', false],
  [2, 3, -40, 0, 'reactor feud', false],
  [3, 2, -40, 0, '', false],
];
// frame.crew rows are [x,y,glyph,cid]; frame.sel is the selected tile.
const FRAME = { type: 'frame', deck: 0, lens: 'none', sel: [5, 3], crew: [[3, 3, 0, 1], [5, 3, 0, 2], [7, 3, 0, 3]] };

let exits = 0; // how many times the surface asked to be left (the CLOSE button's seam)

test('B0: mounting the surface leaves it CLOSED (a session that never opens it shows nothing)', () => {
  RelationsView.initRelations({ onExit: () => { exits++; Hud.selectTab('build'); } });
  assert.equal(rlRoot.hidden, false, 'the boot `hidden` attribute is handed over to the CSS switch');
  assert.equal(doc.body.classList.contains('relations-open'), false);
  assert.equal(rlRoot.listeners.click.length, 1, 'one delegated click owner');
  RelationsView.initRelations({});      // main.js calls this once, but a second call must be inert
  assert.equal(rlRoot.listeners.click.length, 1, 'a re-mount must not double-bind the handler');
});

// MUTATION: delete the `document.body.classList.toggle('relations-open', show)` line in
// relations-view.js `repaint`, or make `shouldShow()` read a private flag nothing sets ⇒ red.
test('B1: selecting the RELATIONS tab opens the takeover; any ship tab closes it', async () => {
  Hud.selectTab('relations');
  await settle();
  assert.equal(doc.body.classList.contains('relations-open'), true,
    'the tab state is the one truth and it must reach the body switch');
  Hud.selectTab('build');
  await settle();
  assert.equal(doc.body.classList.contains('relations-open'), false);
});

// MUTATION: drop `regardSectionsHtml(sel)` from `paintReadout` ⇒ red (the regard rows are the half
// of IX-R7 that used to live in the console READOUT and would otherwise be silently lost).
// MUTATION: drop the `paintWeb` call ⇒ red on the node count.
test('B2: the open surface renders the web, the crew list and BOTH directed regard sections', async () => {
  Hud.renderRoster({ type: 'roster', crew: CREW });
  Hud.renderRelations({ type: 'relations', edges: EDGES });
  Hud.renderFrame(FRAME);            // selects Dmitri (cid 2) — the hub of both bonds
  Hud.selectTab('relations');
  await settle();

  assert.equal(rlTitle.textContent, 'RELATIONS — 3 SOULS · CLICK A NAME TO FOCUS');
  assert.equal(rlCrewHdr.textContent, 'CREW — 3');
  assert.equal(rlCrewList.childNodes.length, 3, 'one clickable row per soul');
  assert.equal(rlCrewList.childNodes.filter((r) => r.classList.contains('sel')).length, 1,
    'exactly the focused crew member is marked');
  assert.equal(rlCrewList.childNodes.find((r) => r.classList.contains('sel')).dataset.rlCrew, '2');

  assert.equal(relSvg.innerHTML.split('class="rel-node').length - 1, 3, 'a node per soul');
  assert.equal(relSvg.innerHTML.split('rel-edge').length - 1, 2, 'two drawn pairs (1↔2, 2↔3)');
  assert.ok(relSvg.innerHTML.includes('tier-close') && relSvg.innerHTML.includes('tier-hostile'),
    'the mutual tiers reach the SVG (Amara↔Dmitri close, Dmitri↔Salif hostile)');
  assert.equal(relSvg.innerHTML.split('rel-tag').length - 1, 2, 'both focused edges carry a tag');

  const ro = rlReadout.innerHTML;
  assert.ok(ro.includes('Dmitri Volkov'), 'the readout names the focused crew member');
  assert.ok(ro.includes('THEIR REGARD FOR OTHERS'), 'IX-R7 outgoing section');
  assert.ok(ro.includes('HOW OTHERS SEE VOLKOV'), 'IX-R7 incoming section, by surname');
  assert.ok(ro.includes('+65') && ro.includes('-40'), 'signed values both ways');
  assert.ok(ro.includes('REACTOR FEUD'), "the outgoing note, uppercased");
  assert.ok(!ro.includes('zone-label') && !ro.includes('ro-guide'),
    'the lifted markup no longer borrows console-only classes, so the console can be deleted');
});

// MUTATION: remove `data-rl-close` handling, or route the node click anywhere but the shared flow ⇒
// the click throws or does nothing. (The selection ITSELF is host-authoritative — it lands on the
// next `frame` — so what is asserted here is that the gesture is wired and reaches hud.js.)
test('B3: a web-node click and a crew-row click are both routed, and CLOSE leaves the surface', async () => {
  const before = exits;
  Hud.selectTab('relations');
  await settle();
  assert.equal(doc.body.classList.contains('relations-open'), true, 'precondition: the surface is up');

  const node = new El(doc, 'g');
  node.className = 'rel-node';
  node.dataset.cid = '3';
  rlRoot.appendChild(node);
  assert.doesNotThrow(() => fire(node, 'click'), 'a node click reaches the delegated handler');

  const row = rlCrewList.childNodes[0];
  row.parentNode = rlRoot; // the fixture registers the list by id, so re-parent for bubbling
  assert.doesNotThrow(() => fire(row, 'click'));

  const close = new El(doc, 'button');
  close.dataset.rlClose = '';
  rlRoot.appendChild(close);
  fire(close, 'click');
  await settle();
  assert.equal(exits, before + 1, 'CLOSE fired the exit seam exactly once');
  assert.equal(doc.body.classList.contains('relations-open'), false, 'CLOSE returns to the ship');
});

// MUTATION: revert `escapeTarget`'s relations rung, or stop routing it to `setTab` ⇒ red. Escape is
// a live convention (relations-spec IX-R10) and the takeover must not trap the player.
test('B4: Escape leaves RELATIONS, and MOSS displaces it rather than stacking on it', async () => {
  Hud.selectTab('relations');
  await settle();
  assert.equal(doc.body.classList.contains('relations-open'), true);
  Hud.handleEscape();
  await settle();
  assert.equal(doc.body.classList.contains('relations-open'), false, 'Escape rung 5 → back to BUILD');

  Hud.selectTab('relations');
  await settle();
  Hud.selectTab('moss');
  await settle();
  assert.equal(doc.body.classList.contains('relations-open'), false,
    'one surface at a time: the tab moved on, so RELATIONS closed');
  Hud.selectTab('build');
  await settle();
});
