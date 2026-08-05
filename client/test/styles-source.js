// THE CLIENT'S STYLESHEET SOURCE, AS THE BROWSER SEES IT.
//
// `client/styles.css` was one 1917-line file until the VR-A split (2026-08-04). It is now six files
// under `client/styles/` plus the `src/theme/paper.css` token layer, and a dozen suites that used to
// read the single file need the whole cascade instead.
//
// THIS HELPER DOES NOT KEEP ITS OWN LIST. It reads `client/index.html` — the shipping page — takes
// the `<link rel="stylesheet">` hrefs IN ORDER, and follows each file's `@import url(...)` the way
// the browser would. So the text these tests scan is, by construction, the text the game loads, in
// the order it loads it. A file added to the page and forgotten here is impossible; a file in
// `client/styles/` that the page never links shows up as a MISSING file rather than as silence
// (`stylesheet-split.test.js` pins that direction).
//
// Pure, no caching: every call re-reads from disk, because `console-carryover.test.js` mutates the
// returned string to blind a leg and a shared cached copy would leak between tests.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));      // <wt>/client/test
export const CLIENT_DIR = join(here, '..');                // <wt>/client
export const INDEX_HTML = join(CLIENT_DIR, 'index.html');

const LINK = /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi;
const HREF = /\bhref=["']([^"']+)["']/i;
const IMPORT = /@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;?/gi;

/**
 * Every stylesheet href `client/index.html` links, in cascade order. Relative to `client/`.
 * @param {string} [page] absolute path to an HTML page (defaults to the shipping index.html)
 */
export function styleLinks(page = INDEX_HTML) {
  const html = readFileSync(page, 'utf8');
  const out = [];
  for (const tag of html.match(LINK) || []) {
    const m = tag.match(HREF);
    if (m && !/^https?:/i.test(m[1])) out.push(m[1]);
  }
  return out;
}

/** Read one stylesheet with its `@import`s expanded in place (recursively, depth-first). */
export function readStylesheet(abs, seen = new Set()) {
  const key = resolve(abs);
  if (seen.has(key)) return '';                            // an import cycle reads as empty, never a hang
  seen.add(key);
  const text = readFileSync(key, 'utf8');
  return text.replace(IMPORT, (_all, ref) =>
    (/^https?:/i.test(ref) ? '' : readStylesheet(join(dirname(key), ref), seen)));
}

/**
 * The FULL cascade the client loads, concatenated in link order with `@import`s expanded.
 * This is the drop-in replacement for the old `readFileSync('client/styles.css')`.
 */
export function stylesSource(page = INDEX_HTML) {
  return styleLinks(page)
    .map((href) => readStylesheet(join(CLIENT_DIR, href)))
    .join('\n');
}

/** One split file by name, e.g. `styleFile('overview')` → `client/styles/overview.css`. */
export function styleFile(name) {
  return readFileSync(join(CLIENT_DIR, 'styles', `${name}.css`), 'utf8');
}
