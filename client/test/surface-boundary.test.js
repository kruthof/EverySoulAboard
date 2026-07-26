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
//     invisible to the ownership scan. Quantified rather than hand-waved: across all 51 client
//     sources there are 229 literal id lookups and 5 non-literal, and 4 of the 5 are the
//     `$`/`getElementById(id)` helper DEFINITIONS — exactly one real constructed call site exists,
//     inside an owner file. Disclosed, not fixed.
//   • THE RE-EXPORT BRIDGE — a function that TAKES an element id is invisible to a scan that only
//     sees id literals, and `hud.js` exports exactly such a hatch (`setChip(id, value)`, :44). This
//     was disclosed-and-left-open in an earlier round on the grounds that closing it needed
//     call-graph analysis. It did not: the reachable surface is small and countable, so it is now
//     CLOSED by pinning `SHIP_STATE_REACH` (both import forms) with `setChip` in `FORBIDDEN_REACH`.
//     What remains open is narrower — a module could import a *permitted* getter and do something
//     unexpected with it — and that genuinely is call-graph work.
//   • The scans run over CODE ONLY — `codeOnly` for JS, `htmlCodeOnly` for the page, both with their
//     own behaviour asserted below, and the C# half strips `client/src/main.js` the same way. A
//     comment naming `#stockfilter` is documentation, not a dependency; a test that fired on prose
//     would teach people to delete explanatory comments, which is the maintenance tax this file
//     must not create.
//   • Nothing here proves the modern surface WORKS. It proves that a verb which exists on the dying
//     surface also exists on the living one, and that nobody is quietly growing the dying one.
//     Playability is a human check (§7.6 of the plan).
//   • EVERY module symbol is resolved LATE, through `requireExport` — never by a static `import` at
//     the top of this file. That is not style. A static import turns any rename of `paletteOrders`
//     or `ROOM_TOOLS` into a load-time SyntaxError that takes down ALL of these tests with no
//     boundary message anywhere, and the natural fix for a hurried author is to edit this file's
//     import line, which is the one action every message below exists to discourage. Late resolution
//     costs one `await` and turns that into a single failure that says what the symbol was for.
//     Likewise every file read goes through `readOrNull`: each source parsed here is scheduled to be
//     deleted or renamed, and an unguarded read makes the guard CRASH at the finish line instead of
//     reporting a settled boundary — which happened, five times, before it was handled centrally.
//
// WHAT CATCHES THE CANONICAL FAILURE, and why there are so many layers. The E0-4 WP-5 filter SHIPPED
// with its own `#stockfilter-row`, so the id census catches it — but WP-5's own commit says the chips
// were FIRST built into the existing `#palette`, and that draft adds no id at all. Every attempt to
// catch it with one assertion was defeated by a plausible rewrite in a style already present in this
// file, so the layers exist one per evasion, each proven RED by a reconstruction of that evasion:
//   1. the `.app` id census .................. the draft that shipped
//   2. hud.js `createElement` sites .......... the first draft, chips into the existing `#palette`
//   3. hud.js innerHTML-family writes ........ the same draft via `insertAdjacentHTML` (hud.js's
//      other native idiom — 9 sites; counting only createElement made the catch a coin flip)
//   4. hud.js literal DOM-lookup sites ....... a widget needing a new handle
//   5. hud.js import specifiers .............. the builder LIFTED into a new console-only module
//   6. verb parity ........................... the verb itself, however it is drawn
//   7. `CONSOLE_BUILD_KINDS`, a PINNED literal  a 4th console verb hidden from (6) by a one-word
//      edit declaring it a build kind. The live `isBuildTool` is never trusted for classification.
//   8. `SHIP_STATE_REACH` .................... a module bridging into console DOM through a function
//      that takes an id (`setChip`), which no id-literal scan can see.
// Every numeric pin is EQUALITY, not `<=`: a ceiling silently banks the headroom a re-home frees, and
// WP-7 had already done that (46→43 ids under a ceiling of 46 = three free slots during the exact
// window the shell is supposed to be closed).
//
// HOW TO RESPOND WHEN ONE FAILS. Every message below names the boundary, why it exists, and the two
// legitimate exits. Read it before editing anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const SRC = join(CLIENT, 'src');
const read = (rel) => readFileSync(join(CLIENT, rel), 'utf8');

/**
 * Read a client file, or `null` if it does not exist.
 *
 * EVERY parser here reads a file that this programme is scheduled to DELETE OR RENAME (`hud.js`
 * becomes `ship-state.js` at WP-9; `console-model.js` gets pruned). An unguarded read turns the
 * finish line into a stack trace: the guard crashes instead of reporting a settled boundary, and the
 * crash lands on whoever completes the work rather than on whoever breaks it. Four separate branches
 * in this file were already gated on "the console is gone"; a fifth was reading `hud.js`
 * unconditionally and threw ENOENT. So the endgame is handled at the ONE place that touches the disk
 * rather than at each caller, which is the only version of this that stays true as the file grows.
 */
function readOrNull(rel) {
  try { return readFileSync(join(CLIENT, rel), 'utf8'); } catch { return null; }
}

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
  // EMPTY — and that is the ledger reaching its endgame, not a list nobody filled in. WP-4 paid off
  // `dig` and `strip` (Room Zoom); WP-5 paid off `stockpile` (the deck-scoped Overview ORDERS bar).
  // Every verb the player can reach on the dying console is now reachable on the standard surface.
  // From here the ratchet only has one direction left: a new key fails against KNOWN_GAPS_SEALED.
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

/**
 * Resolve one named export, reporting a MISSING EXPORT as a boundary failure rather than as a
 * module-resolution crash.
 *
 * WHY NOT A STATIC IMPORT. A static `import { paletteOrders } from …` at the top of this file makes
 * a rename of that symbol take down ALL of these tests at load time, with a SyntaxError and no
 * boundary message anywhere. The natural response to that — for a hurried author who just renamed a
 * function — is to edit this file's import line, which is the one action the forty lines of failure
 * messages below exist to discourage. So every symbol is resolved late and named in its own
 * assertion: a rename fails ONE test, and the message says what it was for.
 */
async function requireExport(spec, name) {
  let mod;
  try {
    mod = await import(spec);
  } catch (e) {
    assert.fail(
      `surface-boundary could not load ${spec} (${e.message}).\n` +
      'This guard resolves the client\'s modules by path. If the module MOVED, fix the path here in ' +
      'the same commit as the move. Do not delete the assertion that needed it.');
  }
  assert.ok(name in mod,
    `${spec} no longer exports '${name}', which this guard reads to enforce the surface boundary.\n` +
    '\n' +
    'If the symbol was RENAMED, update the name here in the same commit — that is a one-word edit ' +
    'and it keeps the boundary intact. If the symbol was REMOVED, the assertion that used it needs ' +
    'to be rewritten or retired deliberately, with the reason in the commit message. What must not ' +
    'happen is the boundary quietly losing a check because a symbol moved.');
  return mod[name];
}

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
 * forms. NOT handled: regex literals — a `/…/` containing a quote could confuse it. Disclosed rather
 * than fixed, and bounded: a '…'/"…" scan terminates at the newline, so the worst it can do is
 * damage its own line (asserted below).
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

/** The files allowed to drive console DOM. `ship-state.js` is listed AHEAD of its existence: WP-9
 *  renames hud.js to it, and without the entry this test would fire thirty-odd times on the renamed
 *  file advising "take its id out of CONSOLE_SHELL_IDS" — wrong advice, loudly, at the finish line. */
const CONSOLE_OWNERS = Object.freeze(['src/ui/hud.js', 'src/ui/ship-state.js', 'src/main.js']);


/** index.html with `<!-- … -->` removed. A commented-out element is not an element: it must not be
 *  counted in a census, and — the reason this is a function and not an afterthought — an HTML
 *  comment CONTAINING `<div` would corrupt `appBlock`'s depth tracker and silently mis-slice the
 *  shell. Strip once, structure-scan the remainder. */
function htmlCodeOnly(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * The `.app` console-shell block of index.html, or null once it is gone. Depth-tracked over `<div`
 * tokens only — every other tag inside it is balanced and cannot unbalance the count. Takes
 * COMMENT-STRIPPED html (see `htmlCodeOnly`). Returning null is the WP-9 endgame, and every
 * assertion below FLIPS ITSELF when that happens rather than needing an edit.
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

/** ids of divs opened at body depth 0 — i.e. the SURFACE ROOTS, one per full-window surface.
 *  Takes COMMENT-STRIPPED html. `<body …>` is matched as a TAG, not as the literal string `<body>`:
 *  the literal would return −1 the day the tag gains an attribute and we would silently parse from
 *  byte 5 of the file. */
function bodyRootIds(html, appSlice) {
  const open = /<body\b[^>]*>/.exec(html);
  const close = html.indexOf('</body>');
  assert.ok(open && close > open.index,
    'client/index.html has no parseable <body> … </body>. The surface-root census cannot run; fix ' +
    'bodyRootIds() rather than letting it scan garbage.');
  let body = html.slice(open.index + open[0].length, close);
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

/** Every LITERAL id lookup site in a file, duplicates included: `$('x')`, `getElementById('x')`,
 *  `'#x'`. Sites (not distinct ids) because the count is what pins a file closed to new work.
 *
 *  ⚠️ DISCLOSED HOLE — the re-export bridge. This matches the two call spellings and a CSS selector
 *  literal, nothing else. A three-line `console-bridge.js` exporting
 *  `export const grab = (id) => document.getElementById(id)` would let any modern view module reach
 *  console DOM completely invisibly to the ownership scan, and `hud.js` ALREADY EXPORTS such a hatch
 *  (`setChip(id, value)`). Closing it needs call-graph analysis, which is out of proportion here; the
 *  countermeasure is that creating the bridge is itself a conspicuous new file in a diff. Related and
 *  also disclosed: a CONSTRUCTED id (`$('tab-' + key)`) is invisible. Measured across all 51 client
 *  sources: 229 literal lookups vs 5 non-literal, and 4 of the 5 are the `$`/`getElementById(id)`
 *  helper DEFINITIONS — exactly one real constructed call site exists, inside an owner file. */
function domLookupSites(code) {
  const re = /(?:\$|getElementById)\(\s*(['"])([^'"\n]+)\1\s*\)|(['"])#([A-Za-z][-\w]*)\3/g;
  const out = [];
  let m;
  while ((m = re.exec(code)) !== null) out.push(m[2] ?? m[4]);
  return out;
}

/** Distinct ids a file looks up in the DOM. */
function domLookups(code) {
  return new Set(domLookupSites(code));
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
  if (appBlock(htmlCodeOnly(read('index.html'))) === null) {
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
  const roomTools = await requireExport('../src/ui/room-model.js', 'ROOM_TOOLS');
  for (const t of roomTools) {
    assert.ok(modern.has(t), `ROOM_TOOLS contains '${t}' but modernToolSet() does not — the ` +
      "room-model.js entry in MODERN_TOOL_TABLES is not resolving to the module's real export");
  }

  // The parses only have to exist while there is a console to parse. WP-9 removes the console
  // chrome from hud.js and may prune console-model.js, and this test must not be the thing that
  // goes red on the day the programme finishes — the endgame gate belongs on EVERY branch that
  // reads the dying surface, not just the two obvious ones.
  if (appBlock(htmlCodeOnly(read('index.html'))) === null) return;

  const parsedOrders = parseOrderKinds();
  // NON-EMPTY + SUPERSET, never exact equality. Adding a fourth order verb CORRECTLY (on both
  // surfaces) is legitimate work; an exact-match assertion would fail it with "fix parseOrderKinds()"
  // — sending an author to repair a parser that is working perfectly. That is how a guard earns a
  // reputation for crying wolf and gets suppressed. Growth is the parity test's business, not this
  // one's; this one only proves the parse still SEES something.
  assert.ok(parsedOrders.length > 0,
    'ORDER_KINDS could not be parsed out of client/src/ui/console-model.js. The parity test reads ' +
    'it; a failed parse would make that test vacuous. Fix parseOrderKinds().');
  for (const v of ['dig', 'stockpile', 'strip']) {
    assert.ok(parsedOrders.includes(v),
      `ORDER_KINDS no longer contains '${v}'. If the verb was genuinely retired, remove it here and ` +
      'from KNOWN_GAPS/KNOWN_GAPS_SEALED in the same commit; if the parse broke, fix parseOrderKinds().');
  }
  // Cross-check the text parse against the module's own exported predicates — the array literal and
  // the behaviour must agree, so neither one can drift without the other noticing.
  const isOrderTool = await requireExport('../src/ui/console-model.js', 'isOrderTool');
  const isBuildTool = await requireExport('../src/ui/console-model.js', 'isBuildTool');
  for (const v of parsedOrders) assert.ok(isOrderTool(v), `isOrderTool('${v}') disagrees with the parsed ORDER_KINDS`);
  assert.ok(!isOrderTool('wall') && isBuildTool('wall'), 'build/order classification inverted');

  const palette = parseConsolePaletteTools();
  for (const v of CONSOLE_BUILD_KINDS) {
    assert.ok(palette.includes(v),
      'the console TOOLS table in client/src/ui/hud.js could not be parsed (expected at least ' +
      `${JSON.stringify(CONSOLE_BUILD_KINDS)}; got ${JSON.stringify(palette)}). A failed parse makes ` +
      'the parity test vacuous.');
  }
  // THE BUILD_KINDS DODGE, closed. `legacyOrderVerbs()` classifies the console palette with the
  // PINNED literal below, not with the live `isBuildTool` — otherwise a fourth console verb could be
  // hidden from the parity test by a ONE-WORD edit adding it to BUILD_KINDS in console-model.js: no
  // ledger entry, no seal edit, nothing loud. Here we additionally pin that the live list has not
  // moved, so the dodge is named rather than merely neutralised.
  assert.deepEqual(parseBuildKinds(), [...CONSOLE_BUILD_KINDS],
    `BUILD_KINDS in client/src/ui/console-model.js is now ${JSON.stringify(parseBuildKinds())}, ` +
    `pinned as ${JSON.stringify(CONSOLE_BUILD_KINDS)}.\n` +
    '\n' +
    'THE BOUNDARY: the console is CLOSED TO NEW WORK, so its set of build kinds is finished. ' +
    'Widening it is also the cheapest way to smuggle a new verb past the surface-parity test — ' +
    'declaring a verb a "build kind" does not make it one, and the parity test deliberately does ' +
    'not trust this list.\n' +
    '\n' +
    'THE TWO LEGITIMATE EXITS: build the new verb on the standard surface (Overview / Room Zoom), ' +
    'where it needs nothing from this list — or, if a console build kind was genuinely RETIRED, ' +
    'shrink CONSOLE_BUILD_KINDS here in the same commit.');
});

// And a behavioural anchor: these are real verbs with real wire payloads, not palette labels. If a
// verb stopped lowering to anything, "port it to the modern surface" would be meaningless.
test('every legacy order verb lowers to a real wire payload through the one seam', async () => {
  const verbs = legacyOrderVerbs();
  if (verbs.length === 0) return;                       // WP-9: nothing left on the console to lower
  const paletteOrders = await requireExport('../src/input/controls.js', 'paletteOrders');
  for (const verb of verbs) {
    const orders = paletteOrders(verb, 3, 4);
    assert.ok(orders.length >= 1, `paletteOrders('${verb}') lowered to nothing — not a real verb`);
  }
});

/** The console's build kinds, PINNED as a literal rather than read from the live source. See the
 *  BUILD_KINDS-dodge note in the vacuity test for why this must not be `isBuildTool`. */
const CONSOLE_BUILD_KINDS = Object.freeze(['wall', 'door', 'cancel']);

/** A module-private `const NAME = ['a', 'b']` array, parsed out of a client source. `[]` when the
 *  FILE is gone — see `readOrNull`; every one of these sources is scheduled for deletion or rename. */
function parseStringArray(relPath, name) {
  const raw = readOrNull(relPath);
  if (raw === null) return [];
  const m = new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(codeOnly(raw));
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** ORDER_KINDS, parsed from console-model.js (it is module-private, so text is the only access). */
function parseOrderKinds() { return parseStringArray('src/ui/console-model.js', 'ORDER_KINDS'); }

/** BUILD_KINDS, likewise. Read only to PIN it — never to classify (see CONSOLE_BUILD_KINDS). */
function parseBuildKinds() { return parseStringArray('src/ui/console-model.js', 'BUILD_KINDS'); }

/** The console palette's tool keys, parsed from hud.js's `initConsole` TOOLS table. [] once gone —
 *  and "gone" includes the FILE being gone. WP-9 renames hud.js to ship-state.js, and an unguarded
 *  read here threw ENOENT and took SURFACE PARITY down with a stack trace instead of a boundary
 *  message, because `legacyOrderVerbs()` is evaluated BEFORE parity reaches its `.app` branch. That
 *  was the fifth instance of this class in this package; `readOrNull` is now the only way any of
 *  these parsers touches the disk. */
function parseConsolePaletteTools() {
  const raw = readOrNull('src/ui/hud.js');
  if (raw === null) return [];
  const m = /const\s+TOOLS\s*=\s*\[([\s\S]*?)\n\s*\];/.exec(codeOnly(raw));
  if (!m) return [];
  return [...m[1].matchAll(/\[\s*'([^']+)'/g)].map((x) => x[1]);
}

/** Order verbs reachable on the console: the union of both authorities, so neither alone can hide a
 *  new verb. The palette is classified against the PINNED CONSOLE_BUILD_KINDS, never against the
 *  live `isBuildTool` — a one-word edit to BUILD_KINDS would otherwise make a new console verb
 *  invisible to the parity test. Sorted for a stable failure order. */
function legacyOrderVerbs() {
  const paletteOrderTools = parseConsolePaletteTools().filter((t) => !CONSOLE_BUILD_KINDS.includes(t));
  return [...new Set([...parseOrderKinds(), ...paletteOrderTools])].filter((t) => t !== 'move').sort();
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE CONSOLE SHELL IS CLOSED TO NEW WORK — index.html id census
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** ⚠️ THE CENSUS SIZE, pinned by EQUALITY and not by a ceiling — see the note on ratchets below.
 *  43 as of the WP-7 merge (`relations-view`/`rel-svg`/`rel-title` left with RELATIONS). */
const CONSOLE_SHELL_ID_CEILING = 43;

/** The `.app` shell's complete element-id census. Sorted. The whole list goes in WP-9. */
const CONSOLE_SHELL_IDS = Object.freeze([
  'b-bio', 'b-deckdown', 'b-deckup', 'b-faster', 'b-move', 'b-pause', 'b-slower', 'b-talk', 'c',
  'crew-count', 'crew-more', 'crewlist', 'crewtable', 'hint', 'hotkeys', 'inspect', 'legend',
  'legendcard', 'lensbtns', 'log', 'metrics', 'palette', 'ro-body', 's-caution', 's-day', 's-deck',
  's-lens', 's-llm', 's-llmchip', 's-msg', 's-nudge', 's-pauselabel', 's-runstate', 's-speed',
  's-speedchip', 'stockfilter', 'stockfilter-row', 'tab-build', 'tab-chron', 'tab-crew', 'tab-moss',
  'tab-relations', 'tabs',
]);

// MUTATION: add `<div id="ov-newthing"></div>` inside .app — the shape of every "just one more chip
// on the console" change, WP-5 included ⇒ the census differs and the failure names the surface rule.
// AND: this test FLIPS ITSELF at WP-9. Once `.app` is deleted it becomes a denylist of zero
// occurrences — the mechanised proof the shell is GONE and not merely hidden (plan §7.6.2).
test('the deprecated console shell is CLOSED — its id census is frozen', () => {
  const html = htmlCodeOnly(read('index.html'));
  const app = appBlock(html);

  assert.equal(CONSOLE_SHELL_IDS.length, CONSOLE_SHELL_ID_CEILING,
    `CONSOLE_SHELL_IDS holds ${CONSOLE_SHELL_IDS.length} ids but the pinned size is ` +
    `${CONSOLE_SHELL_ID_CEILING}.\n` +
    '\n' +
    'RATCHET, NOT CEILING — and the difference is not pedantry. A `<=` ceiling looks safe and rots: ' +
    'when WP-7 removed three ids from the array, the ceiling stayed at 46 and silently left THREE ' +
    'FREE SLOTS for new console work, during exactly the WP-8/WP-9 window when the shell is supposed ' +
    'to be closed. So the size is pinned by EQUALITY, and it reads in both directions:\n' +
    '  • the array GREW ⇒ something was added to the deprecated console shell. Build it on the ' +
    'standard surface instead (client/src/ui/overview-view.js / roomzoom-view.js).\n' +
    '  • the array SHRANK ⇒ good, ids were re-homed or deleted. Lower this number in the SAME COMMIT, ' +
    'or the slots you just freed become silent headroom.\n' +
    '\n' +
    'This cannot false-fire: it only triggers on a commit that is already editing the array.');

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

/** The body-level surface roots — one per full-window surface, IN PAGE ORDER. `relations-view`
 *  joined at the WP-7 merge, lifted out of `.app`'s `.stage` where it used to drag the player back
 *  into the console. */
const SURFACE_ROOTS = Object.freeze([
  'overview-view', 'roomzoom-view', 'relations-view', 'disc', 'panels', 'moss-view',
]);

// MUTATION: add a sixth body-level `<div id="…">` ⇒ fails. Same trick moss-screen.test.js:115-117
// already uses (derive the covered set from the real page), pointed at surface OWNERSHIP instead of
// takeover coverage.
test('the set of body-level surface roots is pinned', () => {
  const html = htmlCodeOnly(read('index.html'));
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SIZE PIN — plan §3.1's "the count is pinned", and the assertion without which this whole
// guard is contingent on a CSS accident.
//
// The id census catches the WP-5 that SHIPPED, because seven ACCEPTS chips overflowed
// `.console-menu` in headless Chrome and had to be given their own `#stockfilter-row`. But WP-5's
// own commit message says the chips were FIRST built into the EXISTING `#palette` row — hud.js
// only, no new element id — and that draft sails past every id-based assertion here. So does any
// console widget styled by class instead of id. Detection of this repo's canonical failure must not
// depend on a layout accident.
//
// FOUR numbers close it, because there are four ways to add a widget and the guard has to be blind
// to none of them. Each was reconstructed as a real mutation and each one alone was GREEN before its
// metric existed:
//   • `createElement` sites ....... the first draft as WP-5 would plausibly have written it
//   • innerHTML-family writes ..... the SAME draft written with `insertAdjacentHTML`, which is not a
//     contrivance: hud.js has 27 createElement sites and 9 innerHTML-family sites, and the
//     list-building ones (renderLegend, renderInspect, the stage overlays, refreshSelection) are
//     exactly this shape. Counting only createElement made the catch a coin flip between two house
//     styles that both already live in this file.
//   • literal DOM-lookup sites .... a widget that needs a new handle
//   • IMPORT SPECIFIERS ........... the builder LIFTED OUT into a new console-only module
//     (`src/ui/prio-chips.js` taking `parent` as an argument). All three DOM counts stay put,
//     because the code left the file — but hud.js must still import it to run it.
//
// None of this is the churn risk that omitting it was justified with, because `hud.js` is CLOSED TO
// NEW WORK: on a file nobody may add to, every one of these can only go DOWN. Pinned by EQUALITY,
// not `<=`, for the reason spelled out in the census test — a ceiling silently banks the headroom
// that a re-home frees, and WP-7 had already done exactly that (46→43 ids under a ceiling of 46).
// Measured at the WP-7 merge: 38 lookup sites, 27 createElement, 9 html writes, 10 imports.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const HUD_DOM_LOOKUP_SITES = 38;
const HUD_CREATE_ELEMENT_SITES = 27;
const HUD_HTML_WRITE_SITES = 9;
const HUD_IMPORT_SPECIFIERS = 10;

/** innerHTML / outerHTML / insertAdjacentHTML — the OTHER way this file builds DOM. */
const HTML_WRITE = /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b/g;

// MUTATION A (WP-5's FIRST DRAFT): the seven ACCEPTS chips appended into the existing `#palette`,
// reusing the existing handle ⇒ createElement moves ⇒ RED. MUTATION B: the same draft written with
// `pal.insertAdjacentHTML(...)` ⇒ html writes move ⇒ RED. MUTATION C: a class-only widget ⇒ RED.
// MUTATION D: the builder lifted into a new console-only module ⇒ the import list moves ⇒ RED.
test('the console module is CLOSED — its DOM surface may only shrink', () => {
  const raw = readOrNull('src/ui/hud.js');
  if (raw === null) {
    // WP-9 split hud.js into ship-state.js. There is no console module left to pin; the census
    // test's denylist branch is the proof now. Same endgame gate as everywhere else.
    assert.equal(appBlock(htmlCodeOnly(read('index.html'))), null,
      'client/src/ui/hud.js is gone but the `.app` shell is still in client/index.html — the shell ' +
      'now has no module to drive it, which is a white page, not a deletion.');
    return;
  }

  const code = codeOnly(raw);
  const measured = {
    'literal DOM-lookup sites': [domLookupSites(code).length, HUD_DOM_LOOKUP_SITES],
    'createElement() sites': [(code.match(/\bcreateElement\(/g) || []).length, HUD_CREATE_ELEMENT_SITES],
    'innerHTML-family writes': [(code.match(HTML_WRITE) || []).length, HUD_HTML_WRITE_SITES],
    'import specifiers': [(code.match(/from\s*['"][^'"]+['"]/g) || []).length, HUD_IMPORT_SPECIFIERS],
  };

  for (const [what, [now, pinned]] of Object.entries(measured)) {
    assert.equal(now, pinned,
      `client/src/ui/hud.js has ${now} ${what}; the pinned number is ${pinned}.\n` +
      '\n' +
      'THE BOUNDARY: the console `.app` shell and its module are DEPRECATED and CLOSED TO NEW WORK. ' +
      'The standard surface is `--ship grid` = the Level-1 Overview (client/src/ui/overview-view.js) ' +
      '+ the Level-2 Room Zoom (client/src/ui/roomzoom-view.js).\n' +
      '\n' +
      'WHY FOUR NUMBERS AND NOT JUST THE ID CENSUS: E0-4 WP-5 built the stockpile ACCEPTS filter ' +
      'here. It got its own `#stockfilter-row` — and so was caught by the id census — only because ' +
      'seven chips overflowed the console menu in headless Chrome. Its FIRST draft appended them to ' +
      'the existing `#palette` and added no element id at all; write that draft with ' +
      '`insertAdjacentHTML` instead of `createElement`, or lift the builder into its own module, and ' +
      'three of these four counts do not move either. A guard that catches this repo\'s canonical ' +
      'failure by luck is not a guard.\n' +
      '\n' +
      'IT READS BOTH WAYS, deliberately:\n' +
      `  • ${what} WENT UP ⇒ something was added to the console. Build it on the standard surface ` +
      'instead. Nothing you need is in here: both modern surfaces already import hud.js for its wire ' +
      'cache and armed-tool state, which is the half that survives WP-9.\n' +
      `  • ${what} WENT DOWN ⇒ good, that is the programme working (WP-7 re-homed RELATIONS out of ` +
      'here; WP-9 splits the file). LOWER the number in client/test/surface-boundary.test.js in the ' +
      'SAME COMMIT — a `<=` ceiling would silently bank the slack as headroom for new console work, ' +
      'which is precisely what happened when WP-7 took the id census from 46 to 43 under a ceiling ' +
      'of 46.');
  }

  // Non-vacuity: if the scan or the stripper silently returned nothing, equality against a stale
  // pin would be the only thing standing, and a re-pin would then bake the blindness in.
  assert.ok(measured['literal DOM-lookup sites'][0] > 20 && measured['createElement() sites'][0] > 10,
    'the hud.js scan found implausibly little for the console module — the scan or codeOnly() is ' +
    'broken, and every number above is then being compared for the wrong reason.');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE RE-EXPORT BRIDGE, closed — and with it plan §1.5.4's crew-interaction census.
//
// The ownership scan sees `$('id')` / `getElementById('id')` / `'#id'` and nothing else, so a module
// that reaches console DOM through a FUNCTION is invisible to it. That is not hypothetical: hud.js
// exports `setChip(id, value)`, which is a write to an arbitrary element id, and any new
// `console-bridge.js` re-exporting `getElementById` would do the same job.
//
// The previous round disclosed this and left it open, arguing that closing it needed call-graph
// analysis. It does not. The real surface is small and countable: pin the set of hud.js symbols that
// non-owner modules may reach, and the hatch is shut without following a single call. `setChip` is
// not in the set and may not enter it.
//
// The same assertion delivers something the plan explicitly asked WP-0 for and the first draft of
// this package did not give — §1.5.4: "add `openPersonaForSelected` to its census as the ONLY
// sanctioned crew-interaction entry, so a later lane that scatters a second one fails a test." The
// owner has decided all crew interaction consolidates into ONE Persona window; CREW_INTERACTION
// below is the mechanised version of that line.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every hud.js symbol the three view modules + controls.js are allowed to reach. All state-layer
 *  verbs: caches, getters, the one armed-tool slot, the shared selection flow, the action seams.
 *  Measured at the WP-7 merge (24: 23 via `Hud.*`, plus `LENSES` as a named import in controls.js).
 *  WP-3 (the `zones` channel) added `getZones` — 25. It is pure ship state in the same sense as
 *  `getMaterials`: one more sparse view-only wire cache, read by the Room Zoom's zone overlay, with no
 *  DOM of its own, so it moves to ship-state.js with the rest of the cache at WP-9. */
const SHIP_STATE_REACH = Object.freeze([
  'LENSES', 'armTool', 'getArmedTool', 'getDecks', 'getDecor', 'getDesigns', 'getFrame', 'getLlm',
  'getLog', 'getMaterials', 'getMetrics', 'getRelations', 'getRooms', 'getRoster', 'getStatus',
  'getTab', 'getTerminals', 'getZones', 'isMossActive', 'onShipUpdate', 'openBioForSelected',
  'selectCrewByCid', 'selectTab', 'talkSelectedCrew', 'toolUsed',
]);

/** ⚠️ THE DOM HATCHES. Exported by hud.js, and reachable by nobody outside it. `setChip(id, value)`
 *  writes any element by id — a one-import bypass of the entire ownership scan. */
const FORBIDDEN_REACH = Object.freeze(['setChip', 'initConsole', 'paintStageOverlays', 'buildLensButtons']);

/** ⚠️ PLAN §1.5.4 — the crew-interaction census. Exactly the entries through which a player may be
 *  taken from the map to a person. The Persona window replaces these; it does not join them. */
const CREW_INTERACTION = Object.freeze(['openBioForSelected', 'talkSelectedCrew']); // sorted

/** Symbols a non-owner module reaches out of hud.js, by either import form: `import * as Hud` +
 *  `Hud.x`, or a named `import { x } from './hud.js'`. Both are counted, because pinning only the
 *  namespace form would leave `import { setChip }` as an open door. */
function shipStateReach() {
  const found = new Set();
  for (const abs of srcFiles()) {
    const path = rel(abs);
    if (CONSOLE_OWNERS.includes(path)) continue;
    const code = codeOnly(readFileSync(abs, 'utf8'));
    for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*hud\.js['"]/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) found.add(name);
      }
    }
    // The namespace alias is CAPTURED, not assumed to be `Hud`: `import * as Ship from './hud.js'`
    // would otherwise be a free bypass of this entire allowlist, and it is a one-word choice.
    const ns = /import\s*\*\s*as\s+([A-Za-z_]\w*)\s*from\s*['"][^'"]*hud\.js['"]/.exec(code);
    if (ns) {
      for (const m of code.matchAll(new RegExp(`\\b${ns[1]}\\.([A-Za-z_]\\w*)`, 'g'))) found.add(m[1]);
    }
  }
  return [...found].sort();
}

// MUTATION: `import { setChip } from './hud.js'` in overview-view.js and one `setChip('s-day', …)`
// ⇒ the ownership scan sees no id literal at all, and THIS fails. MUTATION 2: a second
// crew-interaction seam added beside talkSelectedCrew ⇒ the §1.5.4 census fails.
test('the ship-state reach is pinned — no module may bridge into console DOM', () => {
  const hudSource = readOrNull('src/ui/hud.js');
  if (hudSource === null) return; // WP-9: hud.js is ship-state.js; re-pin the reach then.
  const reach = shipStateReach();

  for (const name of FORBIDDEN_REACH) {
    assert.ok(!reach.includes(name),
      `a module outside the console reaches hud.js's '${name}'.\n` +
      '\n' +
      'THE BOUNDARY: hud.js is TWO THINGS FUSED — an authoritative wire cache + armed-tool/tab/' +
      'selection state machine that both modern surfaces legitimately share, and the console\'s DOM ' +
      `chrome, which is deprecated. '${name}' is on the chrome side. \`setChip(id, value)\` in ` +
      'particular writes ANY element by id, so importing it is a one-line bypass of the entire ' +
      'console-DOM ownership scan — the scan only sees id literals, not functions that take one.\n' +
      '\n' +
      'THE EXIT: read the state through the getters (that is what the Overview and Room Zoom do) and ' +
      'write your own surface\'s DOM yourself. There is no legitimate reason for a modern view to ' +
      'drive console chrome; if you believe there is, it belongs in a commit message, not an ' +
      'allowlist edit.');
  }

  assert.deepEqual(reach, [...SHIP_STATE_REACH],
    `the ship-state reach is now ${JSON.stringify(reach)},\npinned as ${JSON.stringify(SHIP_STATE_REACH)}.\n` +
    '\n' +
    'THE BOUNDARY: this is the exact list of hud.js symbols the standard surface depends on — the ' +
    'shared state layer that SURVIVES the console deletion. It is pinned for two reasons. (1) It is ' +
    'the specification for WP-9\'s split: everything on this list moves to ship-state.js, everything ' +
    'else is chrome and goes. A silent addition changes that plan without anyone deciding to. ' +
    '(2) A function that takes an element id (hud.js exports `setChip`) is invisible to the ' +
    'console-DOM ownership scan, so this list is what actually closes that door.\n' +
    '\n' +
    'THE EXIT: if a modern surface genuinely needs one more piece of SHIP STATE, add it here in the ' +
    'same commit and say why. If what you need is console CHROME, the answer is no — see ' +
    'FORBIDDEN_REACH above.');

  // Non-vacuity, twice over.
  // (a) A broken scan returns [] and the deepEqual above would be the only witness.
  assert.ok(reach.length >= 10, `the reach scan found only ${reach.length} symbols — it is broken`);
  // (b) A denylist of names that no longer exist is a denylist of nothing. `FORBIDDEN_REACH` names
  //     real hud.js exports today (all four); if every one of them were renamed away the test would
  //     keep passing while guarding air. Only ONE is required to still exist, so incremental chrome
  //     removal during WP-9 does not fire this — the point is to catch the list going wholly
  //     fictional, not to freeze the chrome's export names.
  const hudExports = [...codeOnly(hudSource).matchAll(/^export\s+(?:function|const|let)\s+([A-Za-z_]\w*)/gm)]
    .map((m) => m[1]);
  assert.ok(FORBIDDEN_REACH.some((n) => hudExports.includes(n)),
    `none of FORBIDDEN_REACH ${JSON.stringify(FORBIDDEN_REACH)} is still an export of ` +
    `client/src/ui/hud.js, so the denylist is guarding nothing. Either the DOM hatches were renamed ` +
    '(update the list in the same commit — `setChip`-shaped exports are what it exists to catch) or ' +
    'they are genuinely gone, in which case say so and retire the list deliberately.');

  // PLAN §1.5.4 — the crew-interaction census.
  const crew = reach.filter((n) => /^(talk|openPersona|openBio|converse|chat)/i.test(n));
  assert.deepEqual(crew, [...CREW_INTERACTION],
    `crew-interaction entries reachable from the map are ${JSON.stringify(crew)}, pinned as ` +
    `${JSON.stringify(CREW_INTERACTION)}.\n` +
    '\n' +
    'THE BOUNDARY (docs/design/perilune-console-retirement.plan.md §1.5.4, an OWNER DECISION): all ' +
    'crew interaction consolidates into ONE Persona window. Its design is deferred; what is decided ' +
    'is that there is exactly one door from the map to a person, so the Persona window replaces one ' +
    'function body instead of being threaded through five surfaces.\n' +
    '\n' +
    'THE TWO LEGITIMATE EXITS:\n' +
    '  (1) You are BUILDING the Persona seam: replace an entry here rather than adding beside it — ' +
    '`openPersonaForSelected` is meant to SUPERSEDE `talkSelectedCrew`/`openBioForSelected`, and the ' +
    'census shrinking to one is the whole point.\n' +
    '  (2) You are scattering a second crew-interaction affordance. Do not. That is the thing this ' +
    'assertion was requested to prevent.');
});

// MUTATION: add `$('stockfilter')` to overview-view.js — a modern view reaching into console DOM,
// the inverse of the WP-5 mistake and the way the two skins would fuse back together ⇒ fails.
test('only the console\'s own module may touch console DOM', () => {
  const shell = new Set(CONSOLE_SHELL_IDS);
  const files = srcFiles();
  assert.ok(files.length >= 40, `only ${files.length} client sources walked — the scan is broken`);
  for (const abs of files) {
    const path = rel(abs);
    if (CONSOLE_OWNERS.includes(path)) continue;
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

test('NEGATIVE CONTROL: an id in an HTML comment is not an element, and cannot corrupt the parse', () => {
  // Two failure modes in one. (a) A commented-out `<div id="x">` must not enter the census — a
  // census that counts prose punishes people for leaving a note about what used to be there.
  // (b) An HTML comment CONTAINING `<div` would otherwise unbalance appBlock's depth tracker and
  // silently mis-slice the shell, which is the quiet kind of wrong.
  const html = '<body>\n<div class="app">\n<!-- was: <div id="ghost"></div> — removed in WP-x -->\n' +
    '<div id="real"></div>\n</div>\n<div id="surface"></div>\n</body>';
  const stripped = htmlCodeOnly(html);
  const app = appBlock(stripped);
  assert.ok(app !== null, 'a comment containing `<div` unbalanced the depth tracker');
  assert.deepEqual([...app.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]), ['real'],
    'a commented-out element was counted in the shell census');
  assert.deepEqual(bodyRootIds(stripped, app), ['surface'],
    'the surface-root scan mis-parsed once a comment was involved');
  // …and <body> with attributes must still be found (the indexOf('<body>') trap: −1 + 6 = byte 5).
  assert.deepEqual(bodyRootIds(htmlCodeOnly('<body class="x">\n<div id="only"></div>\n</body>'), null), ['only'],
    '<body> with an attribute was not recognised, so the scan started from the middle of the file');
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
