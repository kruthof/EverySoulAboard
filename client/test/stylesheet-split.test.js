// THE STYLESHEET SPLIT — the pins that keep six files behaving like the one file they came from.
//
// `client/styles.css` was a single 1917-line stylesheet until VR-A (2026-08-04). It is now
// `client/styles/{base,console,moss,overview,roomzoom,relations}.css` plus the `src/theme/paper.css`
// token layer, moved VERBATIM by surface. A split is cheap to do and expensive to get wrong in ways
// nothing sees:
//
//   (1) THE CASCADE IS NOW A LINK ORDER. It used to be the source order of one file and could not
//       drift. Now a stylesheet can be written, saved, and simply never linked — the rules are gone
//       and every DOM test that scans TEXT still passes, because the text is still on disk.
//   (2) THE DEV PREVIEW CAN FALL BEHIND. `tools/moss-preview.html` renders the REAL MOSS screen
//       against the REAL stylesheets; if it links five of six, the preview lies about the skin.
//   (3) RELATIVE URLS MOVED. Every `url('assets/…')` in the old file resolved against `client/`;
//       the split files sit one directory deeper. A stale font URL 404s SILENTLY — the browser
//       falls back to a system mono, and every width pin in the MOSS suite drifts.
//   (4) THE `var(--x, fallback)` FALLBACKS WERE ALREADY LYING. Seven of them quoted a colour the
//       cascade does not resolve to (`var(--good,#9ccf6a)` where `--good` is `#5aa77f`;
//       `var(--amber-1,#ffdcb0)` where the live value is `#e8934a`). Harmless while the variable is
//       declared — and a silent restyle the moment a token layer is dropped or renamed, which is
//       exactly what the visual redesign is going to do to `warm.css`, surface by surface.
//
// Every one of the four is pinned below.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { CLIENT_DIR, INDEX_HTML, styleLinks, stylesSource } from './styles-source.js';

/** The surface files, in the cascade order the page must link them in.
 *  ⭐ `persona` is the SEVENTH (M4-2, 2026-08-05) and the first that was never part of the old single
 *  `styles.css`: the Persona window is a new surface, and this split's own rule — one surface, one
 *  stylesheet — is what `relations.css`'s header argues for the sixth. It sits after `relations` and
 *  before the token layer, which is where a new surface goes: it overrides nothing above it and
 *  declares no token. */
const SURFACES = ['base', 'console', 'moss', 'overview', 'roomzoom', 'relations', 'persona'];
const EXPECTED_LINKS = [...SURFACES.map((s) => `styles/${s}.css`), 'src/theme/paper.css'];
const PREVIEW = join(CLIENT_DIR, 'tools/moss-preview.html');

const codeOnly = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SET AND THE ORDER — every file is linked, in the right place, by every page that needs it
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('index.html links every split stylesheet, in cascade order, and nothing else', () => {
  assert.deepEqual(styleLinks(INDEX_HTML), EXPECTED_LINKS);
});

test('every .css file under client/styles/ is LINKED — an unlinked file is dead rules', () => {
  const onDisk = readdirSync(join(CLIENT_DIR, 'styles')).filter((f) => f.endsWith('.css')).sort();
  assert.deepEqual(onDisk, SURFACES.map((s) => `${s}.css`).sort(),
    'a file appeared in client/styles/ that index.html does not link (or vice versa)');
  // …and the reverse direction: every href actually exists. A typo'd link is a 404 the game shows
  // as "the Room Zoom lost its skin", never as an error.
  for (const href of styleLinks(INDEX_HTML)) {
    assert.ok(existsSync(join(CLIENT_DIR, href)), `index.html links ${href}, which is not on disk`);
  }
});

test('tools/moss-preview.html links the SAME cascade — the preview cannot lie about the skin', () => {
  assert.deepEqual(
    styleLinks(PREVIEW).map((h) => h.replace(/^\.\.\//, '')),
    EXPECTED_LINKS,
    'the MOSS design harness and the shipping page disagree about which stylesheets exist',
  );
});

test('warm.css is RETIRED BEHIND paper.css — no page links it directly any more', () => {
  for (const page of [INDEX_HTML, PREVIEW]) {
    for (const href of styleLinks(page)) {
      assert.ok(!/warm\.css$/.test(href), `${page} still links warm.css directly`);
    }
  }
  // it is retired, not deleted: paper.css pulls it in, and the paint it carries is still live
  const paper = readFileSync(join(CLIENT_DIR, 'src/theme/paper.css'), 'utf8');
  assert.match(paper, /@import\s+url\(\s*'warm\.css'\s*\)/,
    'paper.css no longer imports warm.css — every var(--ink-…)/var(--hud-…) in the split files just died');
  // and the helper really does expand it, so the scans below see the warm names
  assert.match(stylesSource(), /--hud-bg/, 'the @import expansion is not reaching warm.css');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. RELATIVE URLS — the split moved every file one directory deeper
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('every url() in a split stylesheet resolves to a file that exists', () => {
  let checked = 0;
  for (const s of SURFACES) {
    const file = join(CLIENT_DIR, 'styles', `${s}.css`);
    const css = codeOnly(readFileSync(file, 'utf8'));
    for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      const ref = m[1].trim();
      if (/^(data:|https?:|#)/i.test(ref)) continue;
      checked++;
      assert.ok(existsSync(join(dirname(file), ref)),
        `${s}.css references ${ref}, which does not exist relative to client/styles/ — `
        + 'this is the failure mode the split creates, and the browser reports it as silence');
    }
  }
  // NON-VACUITY BY INCLUSION: the four bundled font faces must be among what was checked.
  assert.ok(checked >= 4, `only ${checked} url() references resolved — the scan is reading nothing`);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. ⭐ NO SHADOW THEME — every var() fallback quotes the value the cascade resolves to
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** `--name` → the LAST value declared for it across the whole linked cascade (as CSS resolves). */
function declaredVars() {
  const out = new Map();
  for (const m of codeOnly(stylesSource()).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  }
  return out;
}

test('⭐ no var() fallback disagrees with the value the cascade actually resolves to', () => {
  const vars = declaredVars();
  assert.ok(vars.size >= 60, `only ${vars.size} custom properties parsed — the declaration scan is blind`);
  const fails = [];
  let checked = 0;
  for (const s of SURFACES) {
    const css = codeOnly(readFileSync(join(CLIENT_DIR, 'styles', `${s}.css`), 'utf8'));
    css.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)\s*,\s*([^)]+)\)/gi)) {
        const [, name, fb] = m;
        checked++;
        const live = vars.get(name);
        if (live === undefined) {
          // A fallback for a variable NOBODY declares is not a fallback — it IS the paint, wearing
          // a costume that says a token layer controls it. `--amber` was exactly that until VR-A
          // replaced it with its literal.
          fails.push(`${s}.css:${i + 1} var(${name}) is declared nowhere — the fallback ${fb.trim()} `
            + 'IS the paint. Write the literal, or declare the token.');
        } else if (live.toLowerCase() !== fb.trim().toLowerCase()) {
          fails.push(`${s}.css:${i + 1} var(${name}, ${fb.trim()}) — the cascade resolves ${name} to `
            + `${live}. The fallback is a second, disagreeing theme.`);
        }
      }
    });
  }
  // NON-VACUITY BY INCLUSION: the surface files really do carry these.
  //
  // ⚠️ THE FLOOR WAS 80, WAS RE-BASED TO 30 BY VR-P4, AND IS TIGHTENED TO 35 HERE — because this is
  // a SHARED file and a slack floor on a shared file protects nothing. VR-P4 rewrote `overview.css`
  // in the paper idiom and wrote every token reference as a BARE `var(--x)` with no fallback at all,
  // which is the state this test exists to push the stylesheet towards: a fallback is a second theme
  // nothing keeps in step, and the only fallback that cannot disagree with the cascade is the one
  // that is not written. So the population shrank because the defect class shrank.
  //
  // MEASURED ON THIS TREE, per file: base 0 · overview 0 · moss 0 · console 0 · roomzoom 23 ·
  // relations 16 ⇒ 39. The floor sits four under that, so losing EITHER of the two files that still
  // carry fallbacks fails loudly, while P3's roomzoom rewrite is free to remove its own 23 (it will
  // then re-base this line in ITS commit, with its own measurement).
  // ⛔ Do not raise the floor by adding fallbacks.
  assert.ok(checked >= 35, `only ${checked} var() fallbacks scanned — the scan is reading nothing`);
  assert.deepEqual(fails, [], fails.join('\n'));
});

test('the paper token names are DISJOINT from the warm ones — the new layer overrides nothing', () => {
  const own = (file, dropImports) => {
    let css = codeOnly(readFileSync(join(CLIENT_DIR, file), 'utf8'));
    if (dropImports) css = css.replace(/@import[^;]+;/g, ' ');
    return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  };
  const paper = own('src/theme/paper.css', true);
  const warm = own('src/theme/warm.css', false);
  const base = own('styles/base.css', false);
  assert.ok(paper.size >= 25 && warm.size >= 25 && base.size >= 20, 'a token scan came back empty');
  const clash = [...paper].filter((k) => warm.has(k) || base.has(k));
  assert.deepEqual(clash, [],
    `paper.css redeclares ${clash.join(', ')} — it is linked LAST, so it would silently restyle `
    + 'every surface that still reads the warm value. Rename the paper token.');
});

/** Every `--name: value` a single file declares, comments stripped, whitespace normalised. */
function fileVars(rel) {
  const css = codeOnly(readFileSync(join(CLIENT_DIR, rel), 'utf8')).replace(/@import[^;]+;/g, ' ');
  const out = new Map();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  }
  return out;
}

test('⭐ EVERY property declared in BOTH base.css and warm.css agrees value-for-value', () => {
  // ⛔ THIS TEST REPLACES A HARDCODED `--font-mono` CHECK, AND THE NARROWING IS WHY VR-A SHIPPED A
  // LIVE SHADOW THEME PAST ITS OWN GUARD. The first draft asserted that the ONE overlapping name
  // was `--font-mono` and compared only that. The claim was FALSE when it was written — FIVE names
  // are declared in both files — and the guard's scope excluded the very disagreement it existed to
  // catch: `--amber-1` read #cf7a33 in base.css and #e8934a in warm.css, warm.css wins, and all
  // twenty `var(--amber-1)` consumers had been painting the warm value while the file said
  // otherwise. A guard whose filter excludes the violation is the 4th trap shape, and a test that
  // ENUMERATES what it expects to find will always be one honest edit behind the file.
  //
  // So: no list. Take the intersection, whatever it happens to be, and require agreement across all
  // of it. The rule this encodes is the real one — base.css is linked FIRST and warm.css comes in
  // behind paper.css, so on every name they share, base.css is the LOSER and its value is read by
  // nobody but the next human. Two files may say a thing twice; they may not say it differently.
  const base = fileVars('styles/base.css');
  const warm = fileVars('src/theme/warm.css');
  const shared = [...base.keys()].filter((k) => warm.has(k));

  // NON-VACUITY BY INCLUSION, in both directions: an empty parse, or an empty intersection, would
  // make the loop below free. The intersection is a fact about the tree — five names as of VR-A —
  // and if it ever becomes empty that is a finding, not a pass.
  assert.ok(base.size >= 20 && warm.size >= 25,
    `parsed ${base.size} base / ${warm.size} warm properties — the declaration scan is reading nothing`);
  assert.ok(shared.length >= 4,
    `only ${shared.length} properties are declared in both files. That is either a real cleanup `
    + '(delete this floor and say so) or a broken parse — do not let it pass silently.');

  const fails = [];
  for (const name of shared) {
    if (base.get(name).toLowerCase() !== warm.get(name).toLowerCase()) {
      fails.push(`${name}: base.css says "${base.get(name)}", warm.css says "${warm.get(name)}". `
        + 'warm.css is linked LAST (through paper.css), so warm\'s value is what every consumer '
        + 'paints and base.css\'s is a shadow no pixel has ever seen. Reconcile them — set base.css '
        + 'to the value that WINS, which is a no-op, and never the other way round.');
    }
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE SPLIT IS A PARTITION — no rule was copied into two files
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('no selector block appears in two different split files — the move was a MOVE', () => {
  // A split done by copy-then-delete leaves duplicates that are invisible while the two copies
  // agree, and become a cascade puzzle the first time one of them is edited.
  const owner = new Map();
  const dupes = [];
  for (const s of SURFACES) {
    const css = codeOnly(readFileSync(join(CLIENT_DIR, 'styles', `${s}.css`), 'utf8'));
    // top-level rules only: skip anything inside an @media/@supports block, whose selectors
    // legitimately repeat a base rule.
    const flat = css.replace(/@(media|supports|keyframes)[^{]*\{(?:[^{}]*\{[^{}]*\}\s*)*\}/g, ' ');
    for (const m of flat.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const sel = m[1].trim().replace(/\s+/g, ' ');
      if (!sel || sel.startsWith('@')) continue;
      if (owner.has(sel) && owner.get(sel) !== s) dupes.push(`${sel} — in both ${owner.get(sel)}.css and ${s}.css`);
      else owner.set(sel, s);
    }
  }
  assert.ok(owner.size > 300, `only ${owner.size} top-level rules parsed across six files — the parse is blind`);
  assert.deepEqual(dupes, [], dupes.join('\n'));
});

test('each surface file carries the selectors it is named for, and not another surface\'s', () => {
  // The split is by SURFACE, so the prefixes are the check: `.ov-` belongs to the Overview, `.rz-`
  // to the Room Zoom, `.rl-` to Relations, `.moss`/`.c-` to MOSS. Getting this wrong is how P3 comes
  // to edit `overview.css` looking for a Room Zoom rule and conclude it does not exist.
  const read = (s) => codeOnly(readFileSync(join(CLIENT_DIR, 'styles', `${s}.css`), 'utf8'));
  const count = (css, re) => (css.match(re) || []).length;
  const ov = read('overview'); const rz = read('roomzoom'); const rl = read('relations'); const moss = read('moss');
  assert.ok(count(ov, /\.ov-/g) > 100, 'overview.css lost the Overview');
  assert.ok(count(rz, /\.rz-/g) > 100, 'roomzoom.css lost the Room Zoom');
  assert.ok(count(rl, /\.rl-/g) > 20, 'relations.css lost the Relations web');
  assert.ok(count(moss, /\.moss|\.c-/g) > 50, 'moss.css lost MOSS');
  // and no surface owns another's vocabulary
  assert.equal(count(rz, /\.ov-[a-z]/g), 0, 'roomzoom.css carries Overview rules');
  assert.equal(count(rl, /\.rz-[a-z]/g), 0, 'relations.css carries Room Zoom rules');
  assert.equal(count(moss, /\.ov-[a-z]|\.rz-[a-z]/g), 0, 'moss.css carries another surface\'s rules');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE TAKEOVER PRECEDENCE — the one thing the split could break without any test noticing
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the surface precedence MOSS > Room Zoom > Relations > Overview > console still resolves', () => {
  // These `display:none` rules are the whole surface-switching mechanism and they live in FOUR
  // different files now. Order matters only where two of them fight; they are pinned here as a set
  // so a future re-order of the <link> tags cannot quietly change which surface wins.
  const all = codeOnly(stylesSource()).replace(/\s+/g, '');
  for (const rule of [
    'body.moss-open.app{display:none!important}',
    'body.roomzoom-open.app{display:none!important}',
    'body.roomzoom-open#overview-view{display:none!important}',
    'body.relations-open.app{display:none!important}',
  ]) {
    assert.ok(all.includes(rule), `the cascade lost \`${rule}\` — a surface takeover is now partial`);
  }
});
