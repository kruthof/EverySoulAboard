#!/usr/bin/env node
// draw-reveal-bench.mjs — WHAT THE DRAW-IN COSTS, MEASURED IN BOTH HALVES.
//
// ⛔ WHAT EACH HALF CAN AND CANNOT SEE, SAID FIRST, because `sketch-repaint-bench.mjs` had to say the
// same thing and for the same reason: a benchmark that overclaims is worse than none.
//
//   NODE HALF (always runs) — the cost of BUILDING the annotated fragment: `standItem` (which the
//   furniture layer already pays on every repaint, so it is the BASELINE, not a new cost) plus
//   `revealFragment` (which is this package's whole build-time addition). It reports the element
//   count, which is what the other half scales with. It cannot see rasterisation or compositing.
//
//   CHROME HALF (`--chrome`) — the cost the PLAYER feels: how long the overlay takes to mount and
//   lay out, and what the frame timeline looks like WHILE 300–600 CSS animations are running. It is
//   measured against a CONTROL — the same piece mounted with the annotation stripped, so no
//   animation runs at all — because an absolute frame time on one box says nothing; the difference
//   between the two on the same box is the number this package is responsible for.
//
// ⭐ THE PIECES ARE THE WORST CASES, RE-DERIVED RATHER THAN REMEMBERED. `--pieces` overrides; the
// default list is the largest fittings in the catalogue by emitted element count, so nobody has to
// trust a number in a comment (CLAUDE.md's "a count you did not measure yourself is not evidence").
//
// USAGE
//   node client/tools/draw-reveal-bench.mjs               # the node half
//   node client/tools/draw-reveal-bench.mjs --chrome      # …plus real Chrome
//   node client/tools/draw-reveal-bench.mjs --pieces book-case,reactor-plant --reps 60

import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITEMS, buildItem } from '../src/items/index.js';
import { roomScene, scenePlacement, roomTileRect, roomCutawaySvg, roomHatchDef, M_PER_TILE } from '../src/ui/room-model.js';
import { standItem } from '../src/ui/roomzoom-view.js';
import { revealFragment, revealTiming } from '../src/ui/reveal-model.js';
import { decksView } from '../src/ui/decks-model.js';
import { decodeDecks, decodeRooms } from '../src/wire/messages.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const REPS = +arg('reps', '80');
const CHROME_BIN = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9411');

const FIX = JSON.parse(readFileSync(join(here, '../test/fixtures/decks-wreck.json'), 'utf8'));
const view = decksView(decodeDecks(FIX.decks), decodeRooms(FIX.rooms));
const FOCUS = roomTileRect(view, 'cryobay');
const SCENE = roomScene(FOCUS);
const PLACE = scenePlacement(SCENE, FOCUS, SCENE.s * 100 * M_PER_TILE);

const els = (s) => (s.match(/<(path|rect|ellipse|circle|line|text|polyline|polygon)\b/g) || []).length;

/** The catalogue's own top of the range, re-derived on THIS tree. */
function biggestPieces(n) {
  const rows = [];
  for (const id of Object.keys(ITEMS)) {
    try { rows.push([els(buildItem(id, { w: 200, h: 200, idPrefix: 'b' })), id]); } catch { /* no art */ }
  }
  rows.sort((a, b) => b[0] - a[0]);
  return rows.slice(0, n).map((r) => r[1]);
}
const PIECES = (arg('pieces', '') || '').trim()
  ? arg('pieces', '').split(',').map((s) => s.trim()).filter(Boolean)
  : biggestPieces(4).concat(['capsule-sealed', 'dining-table']);

function timed(fn, reps) {
  fn(); fn();                                     // warm the JIT
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i += 1) fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / reps;
}

// ───────────────────────────────────────────────────────────── the node half
console.log('DRAW-IN BUILD COST — node, median of ' + REPS + ' (the room-zoom cryo bay placement)');
console.log('piece'.padEnd(20) + 'els'.padStart(6) + 'anim'.padStart(6)
  + 'standItem'.padStart(11) + 'annotate'.padStart(10) + 'total'.padStart(8) + '   envelope');
const built = new Map();
for (const id of PIECES) {
  let piece;
  try { piece = standItem(id, FOCUS.rx + 2, FOCUS.ry + 2, PLACE, 'bench-' + id, undefined, 0); } catch { continue; }
  const ann = revealFragment(piece);
  built.set(id, { piece, ann });
  const tBuild = timed(() => standItem(id, FOCUS.rx + 2, FOCUS.ry + 2, PLACE, 'bench-' + id, undefined, 0), REPS);
  const tAnn = timed(() => revealFragment(piece), REPS);
  console.log(id.padEnd(20)
    + String(els(piece)).padStart(6)
    + String(ann.count).padStart(6)
    + tBuild.toFixed(3).padStart(11)
    + tAnn.toFixed(3).padStart(10)
    + (tBuild + tAnn).toFixed(3).padStart(8)
    + '   ' + ann.timing.total + ' ms');
}
console.log('\nBudgets: a full plate rebuild happens on a wire frame (10 Hz ⇒ 100 ms); the interactive');
console.log('budget people feel is 16 ms. A reveal is built ONCE per completion, not per frame.');
console.log('Schedule at 600 elements: ' + JSON.stringify(revealTiming(600)));

if (!has('chrome')) {
  console.log('\n(node half only — pass --chrome for the raster/animation half)');
  process.exit(0);
}

// ───────────────────────────────────────────────────────────── the Chrome half
//
// ⛔ THE CONTROL IS THE POINT. `annotated` mounts the shipped fragment (every stroke carrying
// `pathLength`, a class and its own delay ⇒ N running CSS animations); `plain` mounts the SAME
// fragment with the class attributes stripped, so the identical element count is rasterised with NO
// animation at all. The difference between the two frame timelines is what this package costs.

const CSS = readFileSync(join(here, '../styles/roomzoom.css'), 'utf8');
const PLATE = roomHatchDef() + roomCutawaySvg(SCENE, {});

const cases = {};
for (const [id, { piece, ann }] of built) {
  cases[id] = {
    n: ann.count,
    total: ann.timing.total,
    annotated: ann.html,
    // strip ONLY the two reveal classes, so the element count, the geometry and every other
    // attribute are byte-identical between the two columns.
    plain: ann.html.replace(/\s?rz-rv-(ink|fill)/g, '').replace(/\sstyle="animation-[^"]*"/g, ''),
  };
}

const page = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#EBE4D1}
.rz-canvas{position:relative;width:1200px;height:760px}
${CSS.split('\n').filter((l) => !l.startsWith('@import')).join('\n')}
</style>
<div class="rz-canvas" id="rz-canvas">
  <svg class="rz-layers" id="rz-layers" viewBox="${SCENE.viewBoxAttr}" preserveAspectRatio="xMidYMid meet">${PLATE}</svg>
  <svg class="rz-revealer" id="rz-reveal" viewBox="${SCENE.viewBoxAttr}" preserveAspectRatio="xMidYMid meet"></svg>
</div>
<script>
const CASES = ${JSON.stringify(cases)};
const lay = document.getElementById('rz-reveal');
window.__bench = async (id, mode) => {
  const c = CASES[id];
  lay.innerHTML = '';
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // MOUNT + LAYOUT. The read is what forces the layout the write scheduled; timing the write alone
  // would report the cost of a string assignment.
  const t0 = performance.now();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.innerHTML = c[mode];
  lay.appendChild(g);
  void lay.getBoundingClientRect().width;
  void g.getBoundingClientRect().width;
  const mount = performance.now() - t0;
  // ⛔⛔ THE NON-VACUITY WITNESS, AND WITHOUT IT THIS WHOLE TABLE IS A FALSE GREEN. If the stylesheet
  // does not reach these elements — a class renamed, the keyframes block lost at a merge, the CSS
  // not loaded — then NOTHING ANIMATES, the 'annotated' column costs exactly what the control costs,
  // and the bench reports "the animation is free" in the loudest possible way. So the mean COMPUTED
  // \`stroke-dashoffset\` is sampled at the start and again a third of the way through, and the caller
  // fails the run if it has not fallen.
  const inks = [...g.querySelectorAll('.rz-rv-ink')];
  const meanOffset = () => (inks.length
    ? inks.reduce((a, el) => a + (parseFloat(getComputedStyle(el).strokeDashoffset) || 0), 0) / inks.length
    : -1);
  const off0 = meanOffset();
  // THE FRAME TIMELINE while it runs.
  const deltas = [];
  let last = performance.now();
  const until = last + c.total + 120;
  let offMid = -1;
  const mid = last + c.total * 0.55;
  await new Promise((done) => {
    const step = (t) => {
      deltas.push(t - last); last = t;
      if (offMid < 0 && t >= mid) offMid = meanOffset();
      if (t < until) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  const offEnd = meanOffset();
  lay.innerHTML = '';
  deltas.shift();
  const s = deltas.slice().sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { id, mode, n: c.n, frames: s.length, mount: +mount.toFixed(2),
    p50: +q(0.5).toFixed(2), p90: +q(0.9).toFixed(2), max: +s[s.length - 1].toFixed(2),
    over17: s.filter((d) => d > 17).length,
    off0: +off0.toFixed(3), offMid: +offMid.toFixed(3), offEnd: +offEnd.toFixed(3) };
};
</script>`;

const dir = mkdtempSync(join(tmpdir(), 'rvbench-'));
const file = join(dir, 'bench.html');
writeFileSync(file, page);

const chrome = spawn(CHROME_BIN, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--window-size=1400,900', '--force-device-scale-factor=1',
  '--user-data-dir=' + join(dir, 'profile'),
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: 'ignore' });
const bail = (code, msg) => { console.error(msg); try { chrome.kill('SIGKILL'); } catch { /* gone */ } process.exit(code); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const p = list.find((t) => t.type === 'page');
    if (p) wsUrl = p.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) bail(5, 'Chrome never opened a DevTools endpoint');

const cdp = new WebSocket(wsUrl);
await new Promise((r, j) => { cdp.onopen = r; cdp.onerror = j; });
let nextId = 1; const pending = new Map();
cdp.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const call = (method, params) => new Promise((r) => {
  const id = nextId++; pending.set(id, r); cdp.send(JSON.stringify({ id, method, params: params || {} }));
});
const evaluate = async (expr) => (await call('Runtime.evaluate',
  { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await call('Page.enable');
await call('Page.navigate', { url: 'file://' + file });
await sleep(1200);
const ready = await evaluate('typeof window.__bench');
if (ready !== 'function') bail(6, 'the bench page never loaded (window.__bench is ' + ready + ')');

console.log('\nDRAW-IN RASTER + ANIMATION COST — headless Chrome 1400×900, one plate + one piece');
console.log('piece'.padEnd(20) + 'anim'.padStart(6) + 'mode'.padStart(11)
  + 'mount ms'.padStart(10) + 'p50'.padStart(7) + 'p90'.padStart(7) + 'max'.padStart(8) + '  >17ms');
for (const id of Object.keys(cases)) {
  for (const mode of ['plain', 'annotated']) {
    // twice, report the second — the first mount of a piece pays for its own font/pattern setup
    await evaluate(`window.__bench(${JSON.stringify(id)}, ${JSON.stringify(mode)})`);
    const r = await evaluate(
      `window.__bench(${JSON.stringify(id)}, ${JSON.stringify(mode)}).then((o) => JSON.stringify(o))`);
    const o = JSON.parse(r);
    console.log(id.padEnd(20) + String(o.n).padStart(6) + mode.padStart(11)
      + o.mount.toFixed(2).padStart(10) + o.p50.toFixed(2).padStart(7)
      + o.p90.toFixed(2).padStart(7) + o.max.toFixed(2).padStart(8)
      + String(o.over17 + '/' + o.frames).padStart(9)
      + '   dashoffset ' + o.off0 + ' → ' + o.offMid + ' → ' + o.offEnd);
    if (mode !== 'annotated') continue;
    if (!(o.off0 > 0.9 && o.offMid < o.off0 && o.offEnd < 0.02)) {
      bail(7, `\nTHE ANIMATION IS NOT RUNNING on ${id}: mean stroke-dashoffset went `
        + `${o.off0} → ${o.offMid} → ${o.offEnd}, where it must start at 1, fall, and reach 0.\n`
        + 'Every number in this table is then a measurement of static SVG and the "annotated" column '
        + 'is reporting that the animation is free. Check that `roomzoom.css` still carries the '
        + '`rz-rv-draw` keyframes and that the classes in `reveal-model.js` still match it.');
    }
  }
}
console.log('\nREAD IT AS A DIFFERENCE: `annotated` − `plain` on the same row is what the animation');
console.log('costs; both columns hold the identical element count, so the rest is rasterisation the');
console.log('furniture layer already pays for every repaint.');
try { chrome.kill('SIGKILL'); } catch { /* gone */ }
process.exit(0);
