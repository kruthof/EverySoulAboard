// THE SURFACE BOUNDARY, MECHANISED — which UI surface is the current one, turned into a test.
//
// THE STANDARD SURFACE (decided 2026-07-25, binding): the game's ONE standard UI is `--ship grid`
// wearing the **Level-1 Overview** (`client/src/ui/overview-view.js`) plus the **Level-2 Room Zoom**
// (`client/src/ui/roomzoom-view.js`). The console `.app` shell in `client/index.html` is the OLD
// path: deprecated, slated for deletion, and closed to new work. `--ship slice` is the headless
// measurement fixture for the economy programme and needs no face at all.
//
// WHY THIS FILE EXISTS. E0-4's WP-5 built an entire stockpile ACCEPTS filter UI onto the deprecated
// console — `client/index.html` `#stockfilter-row`, `client/src/ui/hud.js` `initConsole` +
// `reflectArmed` — and it was implemented, independently reviewed and merged to `main` before anyone
// noticed the surface was wrong. Nothing was broken; the work was simply spent on a surface that is
// being deleted. The failure mode was not ignorance. It was that "which surface is current?" lived
// only in prose a lane author had to go looking for. `tests/Perilune.Tests/ArchitectureBoundaryTests.cs`
// is this repo's own proof that a mechanised boundary catches drift in hours rather than months, and
// this file copies its philosophy verbatim: none of these facts is sacred, they are *measured facts
// we chose to keep*, and crossing one deliberately means editing a list IN THIS FILE in the SAME
// COMMIT as the crossing. That edit is the point — it puts a surface decision in a diff instead of
// in a merge.
//
// WHY SOURCE SCANNING, and what it cannot see. There is no DOM here (`client/test/ui.test.js:2-3`:
// "the panels.js / hud.js DOM shells are exercised in the browser, not here"), so the shell itself
// cannot be driven. Text scanning is the mechanism available, and it is house style in this suite
// already: `input.test.js:205-219` counts occurrences in `controls.js`/`main.js`, `palette.test.js:21`
// parses `sim/Sim.Glyph/GlyphColor.cs`, `stock-filter-model.test.js:23,130` parses two C# files.
// The honest limits:
//   • A regex is not a parser. An element reached by a CONSTRUCTED id (`$('tab-' + key)`) is
//     invisible to the ownership scan. Disclosed, not fixed.
//   • The scans run over CODE ONLY (see `codeOnly`, whose own behaviour is asserted below). A
//     comment naming `#stockfilter` is documentation, not a dependency — a test that fired on prose
//     would teach people to delete explanatory comments, which is the maintenance tax this file
//     must not create.
//   • Nothing here proves the modern surface WORKS. It proves that a verb which exists on the dying
//     surface also exists on the living one, and that nobody is quietly growing the dying one.
//     Playability is a human check (§7.6 of the plan).
//
// HOW TO RESPOND WHEN ONE FAILS. Every message below names the boundary, why it exists, and the two
// legitimate exits. Read it before editing anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { ROOM_TOOLS } from '../src/ui/room-model.js';
import { isOrderTool, isBuildTool } from '../src/ui/console-model.js';
import { paletteOrders } from '../src/input/controls.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const SRC = join(CLIENT, 'src');
const read = (rel) => readFileSync(join(CLIENT, rel), 'utf8');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE PORTING LEDGER — KNOWN_GAPS and its seal
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Verb parity (below) is the assertion that would have caught WP-5: a verb the player can reach on
// the console must also be reachable on the standard surface. On the day this guard was written
// that was true of NONE of the three economy verbs, so a strict assertion would have landed RED —
// and a red test in the tree teaches people to ignore tests. So the gap is written down instead.
//
// KNOWN_GAPS is a LEDGER THAT ONLY PAYS DOWN. It ratchets in one direction, by construction:
//
//   • Each porting package DELETES ITS OWN LINE from KNOWN_GAPS as it lands. That is a one-line
//     diff and the whole visible cost of the ratchet. The guard shrinks toward zero on its own and
//     cannot be forgotten, because a ported verb with its entry left behind FAILS as stale.
//   • It may shrink freely but NEVER GROW SILENTLY. Every key must be a member of
//     KNOWN_GAPS_SEALED, the census taken at WP-0. A new key means someone just built a verb on the
//     surface we are deleting — the exact WP-5 mistake — so it fails, and the only way past is to
//     edit the SEALED list, which is a deliberate, reviewable, argued act.
//   • When the console is gone (WP-9) there are no legacy verbs left to port, so KNOWN_GAPS must be
//     empty. That is asserted too; the endgame is self-checking.
//
// The two lists are deliberately redundant. One is the live debt; the other is the high-water mark
// that makes growth impossible to sneak through. Do not merge them.

/** The verbs that exist on the console and NOT YET on the standard surface. Value = the package
 *  that removes the entry. DELETE YOUR LINE when you land it — do not weaken the assertion. */
const KNOWN_GAPS = Object.freeze({
  dig: 'WP-4 — Room Zoom gains DIG (order-class ROOM_TOOL, drag-swept, clipped to the room)',
  stockpile: 'WP-5 — Overview ORDERS bar (deck-scoped: a zone is a ship-level logistics decision)',
  strip: 'WP-4 — Room Zoom gains STRIP (order-class ROOM_TOOL, the precise instrument for a partition)',
});

/** ⚠️ THE SEAL. The WP-0 census of unported verbs — the high-water mark, not the live debt.
 *  KNOWN_GAPS must always be a SUBSET of this. Adding a name here is not a chore, it is a decision:
 *  it says "a new player-facing verb was built on the surface we are deleting, and we are choosing
 *  to accept that debt." Bring an argument, or port the verb instead. */
const KNOWN_GAPS_SEALED = Object.freeze(['dig', 'stockpile', 'strip']);

/**
 * Where the STANDARD SURFACE declares its tool tables: [module specifier, export name]. A registry
 * rather than a hard-coded pair so a porting package can land its table without editing this test's
 * logic — only its list. An ABSENT export is skipped, not an error: `ORDER_TOOLS` does not exist
 * yet, it is the seam WP-5 fills. If a package names its table something else, changing the string
 * here is the intended one-line edit.
 */
const MODERN_TOOL_TABLES = Object.freeze([
  ['../src/ui/room-model.js', 'ROOM_TOOLS'],     // Level-2 Room Zoom palette (exists today)
  ['../src/ui/overview-model.js', 'ORDER_TOOLS'], // Level-1 Overview ORDERS bar (WP-5 seam)
]);

/** Every verb the standard surface can arm, unioned across the registry. */
async function modernToolSet() {
  const out = new Set();
  for (const [spec, name] of MODERN_TOOL_TABLES) {
    let mod;
    try { mod = await import(spec); } catch { continue; } // module not created yet
    const table = mod[name];
    if (!Array.isArray(table)) continue;               // export not created yet
    for (const t of table) if (typeof t === 'string') out.add(t);
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// Source helpers
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Strip JS comments, STRING-LITERAL AWARE, leaving everything else byte-for-byte. The scans below
 * must not fire on prose (a comment mentioning `#stockfilter` is documentation), and they must not
 * be BLINDED by a quoted comment marker (`'//'` inside a string must not swallow the rest of the
 * file — the exact hole an earlier hand-verified version of the C# equivalent shipped with,
 * ArchitectureBoundaryTests.cs `CodeOnly_IsStringLiteralAware…`).
 *
 * Handles '…', "…", `…` (including `${}` only insofar as it stays inside the template — good enough,
 * since an id in a template is a CONSTRUCTED id and already disclosed as invisible) and both comment
 * forms. NOT handled: regex literals — a `/…/` containing `//` or an unbalanced quote could confuse
 * it. Disclosed rather than fixed; `codeOnly` is asserted below against the real client sources
 * staying parseable, so a future regex that breaks it fails loudly here rather than silently
 * blinding a scan.
 */
function codeOnly(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1;          // drop to EOL, keep the \n
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i += 1; }
      i += 2;
    } else if (c === '\'' || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        const done = src[i] === q || (q !== '`' && src[i] === '\n');
        i += 1;
        if (done) break;
      }
    } else {
      out += c; i += 1;
    }
  }
  return out;
}

/** Every .js file under client/src, repo-relative-ish (relative to client/). */
function srcFiles(dir = SRC, out = []) {
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) srcFiles(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const rel = (abs) => relative(CLIENT, abs).replace(/\\/g, '/');

/**
 * The `.app` console-shell block of index.html, or null once it is gone. Depth-tracked over `<div`
 * tokens only — every other tag inside it is balanced and cannot unbalance the count. Returning
 * null is the WP-9 endgame, and every assertion below FLIPS ITSELF when that happens rather than
 * needing an edit.
 */
function appBlock(html) {
  const start = html.indexOf('<div class="app">');
  if (start < 0) return null;
  const re = /<div\b|<\/div\s*>/g;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith('</')) { depth -= 1; if (depth === 0) return html.slice(start, re.lastIndex); }
    else depth += 1;
  }
  return null;
}

/** ids of divs opened at body depth 0 — i.e. the SURFACE ROOTS, one per full-window surface. */
function bodyRootIds(html, appSlice) {
  let body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'));
  if (appSlice) body = body.replace(appSlice, '');
  const re = /<div\b[^>]*>|<\/div\s*>/g;
  const roots = [];
  let depth = 0;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[0].startsWith('</')) { depth -= 1; continue; }
    if (depth === 0) {
      const id = /\bid="([^"]+)"/.exec(m[0]);
      roots.push(id ? id[1] : '(anonymous)');
    }
    depth += 1;
  }
  return roots;
}

/** Element ids a file looks up in the DOM: `$('x')`, `getElementById('x')`, `'#x'`. */
function domLookups(code) {
  const out = new Set();
  const re = /(?:\$|getElementById)\(\s*(['"])([^'"\n]+)\1\s*\)|(['"])#([A-Za-z][-\w]*)\3/g;
  let m;
  while ((m = re.exec(code)) !== null) out.add(m[2] ?? m[4]);
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. VERB PARITY — the WP-5 tripwire. If this file only ever holds one test, it is this one.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: add a fourth verb to `ORDER_KINDS` in console-model.js and to the console `TOOLS` table
// in hud.js, the way E0-3/E0-4/E0-5 each added theirs ⇒ it is on the console, absent from
// ROOM_TOOLS, and not in KNOWN_GAPS_SEALED ⇒ this fails and says so by name.
test('SURFACE PARITY: every console order verb exists on the standard surface, or is a KNOWN GAP', async () => {
  const legacy = legacyOrderVerbs();
  const modern = await modernToolSet();

  // THE AUTOMATIC FLIP TO STRICT. Once the console `.app` shell is deleted (WP-9) there is no
  // deprecated surface left for a verb to hide on, so the ledger must be settled — and with
  // KNOWN_GAPS empty the loop below becomes the strict assertion this guard was always aiming at.
  // No edit is needed to make that happen; deleting the shell does it.
  if (appBlock(read('index.html')) === null) {
    assert.deepEqual(Object.keys(KNOWN_GAPS), [],
      'The console `.app` shell is GONE from client/index.html, so no verb can still be waiting to ' +
      `be ported off it — yet KNOWN_GAPS still lists ${JSON.stringify(Object.keys(KNOWN_GAPS))}.\n` +
      '\n' +
      'Either those verbs were ported and the ledger lines were never deleted (delete them — a ' +
      'one-line diff each), or the shell was deleted while a player-facing verb still had no home ' +
      'on the standard surface, which means the game just lost a verb. The console-retirement plan ' +
      'sequences the deletion LAST for exactly this reason (§6 "WP-9 last").');
  }

  for (const verb of legacy) {
    if (modern.has(verb)) continue;
    assert.ok(Object.prototype.hasOwnProperty.call(KNOWN_GAPS, verb),
      `SURFACE BOUNDARY CROSSED — the verb '${verb}' is reachable on the DEPRECATED console shell ` +
      '(client/index.html .app + client/src/ui/hud.js) and NOWHERE on the standard surface.\n' +
      '\n' +
      'THE BOUNDARY: the one standard UI is `--ship grid` = the Level-1 Overview ' +
      '(client/src/ui/overview-view.js) + the Level-2 Room Zoom (client/src/ui/roomzoom-view.js). ' +
      'The console `.app` shell is deprecated and will be deleted. `--ship slice` is the headless ' +
      'economy measurement fixture and has no UI at all.\n' +
      '\n' +
      'WHY IT EXISTS: E0-4 WP-5 built the whole stockpile ACCEPTS filter onto the console. It was ' +
      'implemented, independently reviewed and merged before anyone noticed the surface was wrong. ' +
      'A player on the standard surface could not reach any of it. This test is the mechanised ' +
      'version of the lesson.\n' +
      '\n' +
      'THE TWO LEGITIMATE EXITS:\n' +
      `  (1) PORT IT — add '${verb}' to a table in MODERN_TOOL_TABLES (today: ROOM_TOOLS in ` +
      'client/src/ui/room-model.js for room-scoped verbs, ORDER_TOOLS in ' +
      'client/src/ui/overview-model.js for deck-scoped ones). This is the expected exit.\n' +
      `  (2) ACCEPT THE DEBT — add '${verb}' to KNOWN_GAPS_SEALED **and** KNOWN_GAPS in this file, ` +
      'in the same commit, with the reason in the commit message. This one needs an argument: it ' +
      'means shipping player-facing work on a surface scheduled for deletion.\n' +
      '\n' +
      'What you must NOT do is delete this test or widen it. See docs/design/perilune-console-retirement.plan.md §3.');
  }
});

// MUTATION: add `haul: 'someday'` to KNOWN_GAPS ⇒ not in the seal ⇒ fails.
test('the KNOWN_GAPS ledger can only pay down — every entry is drawn from the WP-0 seal', () => {
  for (const verb of Object.keys(KNOWN_GAPS)) {
    assert.ok(KNOWN_GAPS_SEALED.includes(verb),
      `KNOWN_GAPS GREW. '${verb}' is not in KNOWN_GAPS_SEALED, the census taken when this guard was ` +
      'written.\n' +
      '\n' +
      'A NEW ENTRY MEANS SOMEONE JUST BUILT A PLAYER-FACING VERB ON THE DEPRECATED CONSOLE — which ' +
      'is precisely the E0-4 WP-5 mistake this file exists to prevent. The ledger is designed to ' +
      'shrink: each porting package deletes its own line, and nothing adds one by accident.\n' +
      '\n' +
      'THE TWO LEGITIMATE EXITS:\n' +
      `  (1) PORT '${verb}' to the standard surface instead (Overview / Room Zoom) and add no entry.\n` +
      `  (2) If the debt is genuinely being accepted, add '${verb}' to KNOWN_GAPS_SEALED in the SAME ` +
      'COMMIT and say why in the commit message. Editing the seal is meant to be the loud part.');
  }
  assert.ok(KNOWN_GAPS_SEALED.length <= 3,
    'KNOWN_GAPS_SEALED itself grew past its WP-0 size of 3. That is a surface decision, not a ' +
    'cleanup — it belongs in a commit message and in docs/design/perilune-console-retirement.plan.md.');
});

// MUTATION: add 'wall' (which IS on the standard surface, in ROOM_TOOLS) to KNOWN_GAPS ⇒ fails as
// stale. This is what stops the ledger from rotting: a porting package that forgets to delete its
// line is caught by the very test it was supposed to satisfy.
test('the KNOWN_GAPS ledger cannot rot — a ported verb may not keep its entry', async () => {
  const modern = await modernToolSet();
  for (const [verb, owner] of Object.entries(KNOWN_GAPS)) {
    assert.ok(!modern.has(verb),
      `STALE LEDGER ENTRY. '${verb}' IS now on the standard surface, so its KNOWN_GAPS entry ` +
      `(“${owner}”) is a lie and the guard is weaker than it looks — the parity test above is now ` +
      `excusing a verb that needs no excuse.\n` +
      '\n' +
      'THE EXIT (there is only one, and it is a one-line diff): delete the ' +
      `'${verb}' line from KNOWN_GAPS in client/test/surface-boundary.test.js, in the same commit ` +
      'as the port. Leave KNOWN_GAPS_SEALED alone — it is the high-water mark, not the live debt.');
  }
});

// Bite-proofing the two parses this whole section rests on. Without these, renaming `ORDER_KINDS`
// or the console `TOOLS` table would make `legacyOrderVerbs()` return [] and every assertion above
// would pass VACUOUSLY — the single most common review defect in this repo (six instances in E0-4).
test('the legacy-verb parse is not vacuous — both of its sources are still there', async () => {
  // THE REGISTRY FIRST. modernToolSet() swallows a missing module or a missing export on purpose
  // (ORDER_TOOLS does not exist yet), which means a TYPO in a MODERN_TOOL_TABLES specifier would
  // make it return the empty set — and then BOTH the parity test and the rot test would pass while
  // checking nothing at all. So pin that at least one registry entry really resolves.
  const modern = await modernToolSet();
  assert.ok(modern.size > 0,
    'MODERN_TOOL_TABLES resolved to NO tools. Every entry is optional-by-design, so a typo in a ' +
    'module specifier or export name degrades silently — and the surface-parity and stale-ledger ' +
    'tests would then pass vacuously. Fix the registry.');
  for (const t of ROOM_TOOLS) {
    assert.ok(modern.has(t), `ROOM_TOOLS contains '${t}' but modernToolSet() does not — the ` +
      "room-model.js entry in MODERN_TOOL_TABLES is not resolving to the module's real export");
  }

  const parsedOrders = parseOrderKinds();
  assert.deepEqual(parsedOrders, ['dig', 'stockpile', 'strip'],
    'ORDER_KINDS could not be parsed out of client/src/ui/console-model.js, or it changed. The ' +
    'parity test reads it; a failed parse would make that test vacuous. Fix parseOrderKinds().');
  // Cross-check the text parse against the module's own exported predicate — the array literal and
  // the behaviour must agree, so neither one can drift without the other noticing.
  for (const v of parsedOrders) assert.ok(isOrderTool(v), `isOrderTool('${v}') disagrees with the parsed ORDER_KINDS`);
  assert.ok(!isOrderTool('wall') && isBuildTool('wall'), 'build/order classification inverted');

  const palette = parseConsolePaletteTools();
  assert.ok(palette.includes('wall') && palette.includes('door') && palette.includes('cancel'),
    'the console TOOLS table in client/src/ui/hud.js could not be parsed (expected at least ' +
    `wall/door/cancel; got ${JSON.stringify(palette)}). A failed parse makes the parity test vacuous.`);
});

// And a behavioural anchor: these are real verbs with real wire payloads, not palette labels. If a
// verb stopped lowering to anything, "port it to the modern surface" would be meaningless.
test('every legacy order verb lowers to a real wire payload through the one seam', () => {
  for (const verb of legacyOrderVerbs()) {
    const orders = paletteOrders(verb, 3, 4);
    assert.ok(orders.length >= 1, `paletteOrders('${verb}') lowered to nothing — not a real verb`);
  }
});

/** ORDER_KINDS, parsed from console-model.js (it is module-private, so text is the only access). */
function parseOrderKinds() {
  const code = codeOnly(read('src/ui/console-model.js'));
  const m = /const\s+ORDER_KINDS\s*=\s*\[([^\]]*)\]/.exec(code);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** The console palette's tool keys, parsed from hud.js's `initConsole` TOOLS table. [] once gone. */
function parseConsolePaletteTools() {
  const code = codeOnly(read('src/ui/hud.js'));
  const m = /const\s+TOOLS\s*=\s*\[([\s\S]*?)\n\s*\];/.exec(code);
  if (!m) return [];
  return [...m[1].matchAll(/\[\s*'([^']+)'/g)].map((x) => x[1]);
}

/** Order verbs reachable on the console: the union of both authorities, so neither alone can hide
 *  a new verb. Sorted for a stable failure order. */
function legacyOrderVerbs() {
  const paletteOrderTools = parseConsolePaletteTools().filter((t) => !isBuildTool(t));
  return [...new Set([...parseOrderKinds(), ...paletteOrderTools])].filter((t) => t !== 'move').sort();
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE CONSOLE SHELL IS CLOSED TO NEW WORK — index.html id census
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The `.app` shell's complete element-id census, frozen at WP-0 (46 ids, index.html:11-128).
 *  Sorted. `relations-view`/`rel-svg`/`rel-title` leave in WP-7; the whole list goes in WP-9. */
const CONSOLE_SHELL_IDS = Object.freeze([
  'b-bio', 'b-deckdown', 'b-deckup', 'b-faster', 'b-move', 'b-pause', 'b-slower', 'b-talk', 'c',
  'crew-count', 'crew-more', 'crewlist', 'crewtable', 'hint', 'hotkeys', 'inspect', 'legend',
  'legendcard', 'lensbtns', 'log', 'metrics', 'palette', 'rel-svg', 'rel-title', 'relations-view',
  'ro-body', 's-caution', 's-day', 's-deck', 's-lens', 's-llm', 's-llmchip', 's-msg', 's-nudge',
  's-pauselabel', 's-runstate', 's-speed', 's-speedchip', 'stockfilter', 'stockfilter-row',
  'tab-build', 'tab-chron', 'tab-crew', 'tab-moss', 'tab-relations', 'tabs',
]);

// MUTATION: add `<div id="ov-newthing"></div>` inside .app — the shape of every "just one more chip
// on the console" change, WP-5 included ⇒ the census differs and the failure names the surface rule.
// AND: this test FLIPS ITSELF at WP-9. Once `.app` is deleted it becomes a denylist of zero
// occurrences — the mechanised proof the shell is GONE and not merely hidden (plan §7.6.2).
test('the deprecated console shell is CLOSED — its id census is frozen', () => {
  const html = read('index.html');
  const app = appBlock(html);

  if (app === null) {
    // WP-9 has landed. Flip to the denylist: none of the shell's ids may survive anywhere in the page.
    for (const id of CONSOLE_SHELL_IDS) {
      assert.ok(!html.includes(`id="${id}"`),
        `The console \`.app\` shell is gone from client/index.html, but the shell id '${id}' is ` +
        'still in the page. Either it was re-homed onto a surviving surface — in which case move it ' +
        'out of CONSOLE_SHELL_IDS in this file, in the same commit — or the deletion was incomplete.');
    }
    return;
  }

  const ids = [...app.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids, [...CONSOLE_SHELL_IDS],
    'THE CONSOLE SHELL\'S ID CENSUS MOVED.\n' +
    '\n' +
    'THE BOUNDARY: `<div class="app">` in client/index.html is the DEPRECATED console shell. The ' +
    'standard surface is `--ship grid` = the Level-1 Overview + the Level-2 Room Zoom. The console ' +
    'is closed to new work and scheduled for deletion (docs/design/perilune-console-retirement.plan.md §7).\n' +
    '\n' +
    'WHY IT EXISTS: E0-4 WP-5 added `#stockfilter-row` to this block and shipped a whole feature ' +
    'the standard surface could not reach. A new id in here is the fingerprint of that mistake.\n' +
    '\n' +
    'THE TWO LEGITIMATE EXITS:\n' +
    '  (1) BUILD IT ON THE STANDARD SURFACE instead — client/src/ui/overview-view.js (deck scope) ' +
    'or client/src/ui/roomzoom-view.js (room scope). Their roots are body-level siblings; you need ' +
    'nothing from this block. This is the expected exit.\n' +
    '  (2) If ids genuinely LEFT this block (a re-home, e.g. WP-7 lifting RELATIONS to a body-level ' +
    'sibling, or WP-9 deleting the block outright), update CONSOLE_SHELL_IDS and — if a surface root ' +
    'moved — SURFACE_ROOTS below, in the SAME COMMIT. Shrinking this list is progress; growing it is a decision.');
});

/** The body-level surface roots — one per full-window surface. WP-7 adds `relations-view`. */
const SURFACE_ROOTS = Object.freeze(['overview-view', 'roomzoom-view', 'disc', 'panels', 'moss-view']);

// MUTATION: add a sixth body-level `<div id="…">` ⇒ fails. Same trick moss-screen.test.js:115-117
// already uses (derive the covered set from the real page), pointed at surface OWNERSHIP instead of
// takeover coverage.
test('the set of body-level surface roots is pinned', () => {
  const html = read('index.html');
  const roots = bodyRootIds(html, appBlock(html));
  assert.deepEqual(roots, [...SURFACE_ROOTS],
    `body-level surface roots are ${JSON.stringify(roots)}, pinned as ${JSON.stringify(SURFACE_ROOTS)}.\n` +
    '\n' +
    'A body-level root IS a full-window surface — that is what makes MOSS work identically from ' +
    'either skin while RELATIONS (a child of `.stage` inside `.app`) drops the player back into the ' +
    'console. So this set is the surface inventory, and it should change only when a surface is ' +
    'genuinely added, re-homed or deleted.\n' +
    '\n' +
    'THE EXIT: if that is what you did, update SURFACE_ROOTS here in the same commit and say which ' +
    'surface and why. If it is not, you probably meant to add a panel INSIDE an existing surface.');
});

// MUTATION: add `$('stockfilter')` to overview-view.js — a modern view reaching into console DOM,
// the inverse of the WP-5 mistake and the way the two skins would fuse back together ⇒ fails.
test('only the console\'s own module may touch console DOM', () => {
  const OWNERS = ['src/ui/hud.js', 'src/main.js'];
  const shell = new Set(CONSOLE_SHELL_IDS);
  for (const abs of srcFiles()) {
    const path = rel(abs);
    if (OWNERS.includes(path)) continue;
    for (const id of domLookups(codeOnly(readFileSync(abs, 'utf8')))) {
      assert.ok(!shell.has(id),
        `${path} looks up the console-shell element '#${id}'.\n` +
        '\n' +
        'THE BOUNDARY: the `.app` console shell belongs to client/src/ui/hud.js (and the few topbar ' +
        'bindings in client/src/main.js). Nothing else may reach into it. A modern surface module ' +
        'that pokes console DOM re-fuses the two skins and turns the console deletion (WP-9) from a ' +
        'file removal into an archaeology exercise — and it will white-page the moment `.app` goes, ' +
        'because hud.js\'s $() helpers have no null guard.\n' +
        '\n' +
        'THE TWO LEGITIMATE EXITS:\n' +
        '  (1) Read the state through hud.js\'s getters instead of its DOM. That is what the ' +
        'Overview and Room Zoom already do — hud.js is two things fused, an authoritative wire ' +
        'cache AND the console chrome, and only the cache is shared.\n' +
        '  (2) If this element is being deliberately re-homed onto the standard surface, take its ' +
        'id out of CONSOLE_SHELL_IDS in the same commit — it is no longer console shell.');
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. NO ORPHAN SURFACES — every view module is actually mounted
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: drop the `initRoomZoom` import from main.js (or add a new `*-view.js` and forget to
// mount it — the shape of the WP-7 risk) ⇒ fails.
test('every client/src/ui/*-view.js is reachable by import from main.js', () => {
  const reached = new Set();
  const queue = [join(SRC, 'main.js')];
  while (queue.length) {
    const file = queue.pop();
    if (reached.has(file)) continue;
    reached.add(file);
    const code = codeOnly(readFileSync(file, 'utf8'));
    for (const m of code.matchAll(/(?:^|[\s;])(?:import|export)[\s\S]*?from\s*['"](\.[^'"]+)['"]/g)) {
      const target = join(dirname(file), m[1]);
      try { if (statSync(target).isFile()) queue.push(target); } catch { /* not a local file */ }
    }
  }
  const views = srcFiles(join(SRC, 'ui')).filter((f) => f.endsWith('-view.js'));
  assert.ok(views.length >= 2, `expected at least the Overview + Room Zoom views, found ${views.length}`);
  for (const v of views) {
    assert.ok(reached.has(v),
      `${rel(v)} is a UI SURFACE that nothing reaches from client/src/main.js — it is dead code the ` +
      'player cannot see.\n' +
      '\n' +
      'THE BOUNDARY: main.js is the only entry point (client/index.html loads it and nothing else). ' +
      'A `*-view.js` that main.js cannot reach is a surface that never mounts. The console-retirement ' +
      'programme re-homes surfaces (WP-7 lifts RELATIONS out of `.app` into its own view module), and ' +
      'a re-home that lands the module but not the mount is silent: the old path stops working and ' +
      'the new one never starts.\n' +
      '\n' +
      'THE TWO LEGITIMATE EXITS: import and initialise it from main.js (or from something main.js ' +
      'already reaches) — or, if it is genuinely not a surface, do not name it `*-view.js`.');
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. NEGATIVE CONTROLS — the scanner must not fire on prose
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// A source scan that trips on a comment is a tripwire people disable. Worse, a comment stripper
// with a hole silently BLINDS every scan above it and everything passes for the wrong reason. Both
// directions are asserted, on synthetic input, so the scanner is tested rather than trusted.

test('NEGATIVE CONTROL: console ids in comments do not trip the ownership scan', () => {
  const prose = [
    "// The console's $('stockfilter') row is built in hud.js; we deliberately do not touch it.",
    '/* Historically getElementById(\'palette\') lived here. See #stockfilter-row in index.html. */',
    '/** @see $(\'crewlist\') — the console CREW WATCH, superseded by ov-crewwatch. */',
    'const real = 1;',
  ].join('\n');
  assert.deepEqual([...domLookups(codeOnly(prose))], [],
    'a console id mentioned in a COMMENT tripped the ownership scan — the scan would then punish ' +
    'people for writing explanatory comments, and they would delete the comments');
});

test('POSITIVE CONTROL: the same ids in real code DO trip the ownership scan', () => {
  const code = "const a = $('stockfilter'); const b = document.getElementById('palette'); const c = root.querySelector('#crewlist');";
  assert.deepEqual([...domLookups(codeOnly(code))].sort(), ['crewlist', 'palette', 'stockfilter'],
    'the ownership scan missed a real DOM lookup — every assertion resting on it is then vacuous');
});

test('NEGATIVE CONTROL: a legacy verb named only in a comment is not a console verb', () => {
  const parsed = /const\s+ORDER_KINDS\s*=\s*\[([^\]]*)\]/.exec(codeOnly(
    "// ORDER_KINDS = ['haul', 'mine'] was the old plan; do not resurrect it.\n" +
    "const ORDER_KINDS = ['dig'];\n",
  ));
  assert.deepEqual([...parsed[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), ['dig'],
    'the verb parse read a commented-out list — a stale comment would then invent phantom debt');
});

test('codeOnly is STRING-LITERAL AWARE, so a quoted comment marker cannot blind the scans', () => {
  // The failure mode this pins: a naive stripper sees the `//` inside a string and drops the rest
  // of the FILE, after which every scan above passes because it can no longer see anything.
  const src = 'const url = "http://x//y"; const q = \'/* not a comment */\';\nconst live = $(\'palette\');';
  const out = codeOnly(src);
  assert.ok(out.includes('$(\'palette\')'), 'a quoted "//" swallowed the rest of the source');
  assert.ok(out.includes("'/* not a comment */'"), 'a quoted block-comment marker was stripped');
  // …and it still strips the real thing, including a comment that follows a string.
  assert.ok(!codeOnly('const s = "a"; // $(\'palette\')\n').includes('palette'),
    'a real trailing comment survived the stripper');
  assert.ok(!codeOnly("/* $('palette') */ const x = 1;").includes('palette'),
    'a real block comment survived the stripper');
  // Line/column drift would make any future line-numbered message wrong: newlines are preserved.
  assert.equal(codeOnly('a\n/* x\ny */\nb\n').split('\n').length, 'a\n/* x\ny */\nb\n'.split('\n').length,
    'codeOnly changed the line count');
});

// The property that makes an over-the-real-sources canary unnecessary, so it is asserted directly
// instead of decoratively. A '…' or "…" scan TERMINATES AT THE NEWLINE, so the worst an unbalanced
// quote (say, inside a regex literal — the one construct this stripper does not understand) can do
// is damage its own line. It cannot run to end of file and blind every scan above it.
//
// A real-file canary WAS written and then deleted rather than shipped: most client sources end in
// `}` or `});`, so `codeOnly(src).endsWith(tail)` is trivially true even on truncated output, and
// the only unbounded branch left (an unterminated real `/* …`) preserves the line count anyway.
// It could not have failed. See the package report's "what I did not assert".
test('an unbalanced quote can damage at most its own line — the scans cannot be blinded', () => {
  const src = "const rx = /['\"]/g;\nconst live = $('palette');\nconst also = $('crewlist');\n";
  const out = codeOnly(src);
  assert.ok(out.includes("$('palette')") && out.includes("$('crewlist')"),
    'an unbalanced quote on line 1 swallowed later lines — the string scan must stop at the newline');
  assert.deepEqual([...domLookups(out)].sort(), ['crewlist', 'palette']);
});
