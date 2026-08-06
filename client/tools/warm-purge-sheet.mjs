// THE WARM PURGE — the owner's two sheets for lane/warm-purge.
//
//   1. `warm-purge-twins.html`      every twin beside its own pristine piece, all of them.
//   2. `warm-purge-before-after.html` the re-authored twins beside the WARM mock twins they replace.
//
// ⛔ THE SECOND SHEET CANNOT BE BUILT FROM THIS TREE, and saying why is the point. The warm art is
// DELETED by this package — `objects.js`, `fixtures.js`, `resources.js` and `cryo.js` are gone and
// the seventy mock twin builders with them — so `buildItem('chair')`'s warm drawing no longer
// exists anywhere in `client/`. `buildItem` is TOLERANT, so asking it for a deleted row returns the
// neutral `?` placeholder rather than throwing: a before/after sheet built naively against this tree
// would render a column of question marks and look like a rendering bug rather than a missing input.
//
// ⇒ THE "BEFORE" COLUMN IS THEREFORE A CAPTURE, taken from the tree this lane branched from and
// passed in by path. Produce it once, before the deletion, with `--capture` against a checkout of
// the parent commit:
//
//     git worktree add /tmp/wp-base --detach <parent>
//     node /tmp/wp-base/client/tools/warm-purge-sheet.mjs --capture /tmp/warm-before.json
//     node client/tools/warm-purge-sheet.mjs --before /tmp/warm-before.json
//
// The capture is NOT committed: it is 4 MB of SVG for art that this commit's whole purpose is to
// remove, and a committed copy would be exactly the "invitation to draw the old art back" that
// `index.js`'s materials note names as the reason a replaced module is deleted rather than orphaned.
// Without `--before` the second sheet is SKIPPED and the tool says so — it never draws placeholders
// and calls them a comparison.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// ⚠️ `client/tools/shots-warm-purge/`, NOT a `shots/` at the repo root. Every other sheet tool in
// this directory writes to `client/tools/shots-<name>/` and every one of those paths is in
// `.gitignore`; a root `shots/` is not, so the first run would have staged 1.4 MB of generated HTML
// for art review into the commit. The sheets are regenerated on demand — that is the whole habit.
const OUT = join(HERE, 'shots-warm-purge');
const CELL = 240;

const args = process.argv.slice(2);
const argOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const { ITEMS, ITEM_IDS, buildItem } = await import('../src/items/index.js');
const { WRECKED, WRECKED_IDS, buildWrecked, TWIN_SOURCE } = await import('../src/items/wrecked.js');

// ── the capture arm: run this from the PARENT checkout, before the deletion ───────────────────
const capturePath = argOf('--capture');
if (capturePath) {
  const out = { pristine: {}, twin: {}, meta: {} };
  for (const id of ITEM_IDS) out.pristine[id] = buildItem(id, { w: CELL, h: CELL, idPrefix: `p-${id}` });
  for (const id of WRECKED_IDS) {
    out.twin[id] = buildWrecked(id, { w: CELL, h: CELL, idPrefix: `w-${id}` });
    out.meta[id] = { state: WRECKED[id].state, kind: ITEMS[id].kind };
  }
  writeFileSync(capturePath, JSON.stringify(out));
  console.log(`captured ${Object.keys(out.pristine).length} pristine and ${Object.keys(out.twin).length} twins → ${capturePath}`);
  process.exit(0);
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const CSS = `
  :root { color-scheme: light; }
  body { margin: 0; padding: 28px; background: #EBE4D1; color: #14120F;
         font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
  h1 { font-size: 15px; letter-spacing: .14em; text-transform: uppercase; margin: 0 0 6px; }
  p.lede { margin: 0 0 22px; max-width: 62em; opacity: .78; }
  main { display: flex; flex-wrap: wrap; gap: 14px; }
  figure { margin: 0; padding: 10px; border: 1px solid rgba(20,18,15,.28); background: #EBE4D1; }
  header { display: flex; gap: 8px; align-items: baseline; margin-bottom: 6px;
           font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  .name { font-weight: 700; }
  .badge { margin-left: auto; color: #7B2C22; }
  .src { opacity: .6; font-size: 10px; }
  .pair { display: flex; gap: 8px; }
  svg { display: block; background: #EBE4D1; }
  .col { text-align: center; font-size: 10px; opacity: .55; letter-spacing: .08em; }
`;

const card = (id, cols) => `<figure>
  <header><span class="name">${id}</span><span class="badge">${WRECKED[id].state}</span></header>
  <div class="pair">${cols.map(([label, svg]) => `<div><svg width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${svg}</svg><div class="col">${label}</div></div>`).join('')}</div>
  <div class="src">${(TWIN_SOURCE && TWIN_SOURCE[id]) || ''}</div>
</figure>`;

const page = (title, lede, body) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head>`
  + `<body><h1>${title}</h1><p class="lede">${lede}</p><main>${body}</main></body></html>`;

// ── sheet 1 — every twin beside its own pristine piece ────────────────────────────────────────
const twins = WRECKED_IDS.map((id) => card(id, [
  ['pristine', buildItem(id, { w: CELL, h: CELL, idPrefix: `p-${id}` })],
  ['wrecked', buildWrecked(id, { w: CELL, h: CELL, idPrefix: `w-${id}` })],
])).join('\n');
writeFileSync(join(OUT, 'warm-purge-twins.html'), page(
  `the ${WRECKED_IDS.length} twins, each beside its own piece`,
  'Every registry row that has a post-raid twin. A twin re-runs its own pristine painter and adds '
  + 'ink damage, so the difference between the two columns is the damage and nothing else. No twin '
  + 'in this sheet is a transcription of the 2026-07-28 mock any more.',
  twins,
));
console.log('wrote', join(OUT, 'warm-purge-twins.html'), `(${WRECKED_IDS.length} cards)`);

// ── sheet 2 — the re-authored twins beside the warm ones they replace ─────────────────────────
const beforePath = argOf('--before');
if (!beforePath) {
  console.log('SKIPPED warm-purge-before-after.html — pass `--before <capture.json>`; see this '
    + 'file\'s header for why the warm column cannot come from this tree.');
  process.exit(0);
}
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const REDRAWN = WRECKED_IDS.filter((id) => before.twin[id] !== undefined
  && before.twin[id] !== buildWrecked(id, { w: CELL, h: CELL, idPrefix: `w-${id}` }));
const rows = REDRAWN.map((id) => card(id, [
  ['warm twin (was)', before.twin[id]],
  ['paper twin (is)', buildWrecked(id, { w: CELL, h: CELL, idPrefix: `w-${id}` })],
  ['its pristine piece', buildItem(id, { w: CELL, h: CELL, idPrefix: `p-${id}` })],
])).join('\n');
writeFileSync(join(OUT, 'warm-purge-before-after.html'), page(
  `${REDRAWN.length} twins re-authored: warm → paper`,
  'Left: the 2026-07-28 mock transcription this package deletes. Middle: the twin as it ships — the '
  + 'same object\'s own paper drawing with ink damage on it. Right: the pristine piece, so the '
  + '"same object, damaged" claim can be read rather than taken on trust.',
  rows,
));
console.log('wrote', join(OUT, 'warm-purge-before-after.html'), `(${REDRAWN.length} cards)`);
