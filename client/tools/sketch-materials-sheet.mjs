#!/usr/bin/env node
// sketch-materials-sheet.mjs — THE TWELVE SKINS, BEFORE AND AFTER, IN ALL THREE PLACES THEY LIVE.
//
// ⛔ WHY THIS SHEET EXISTS AND WHY THE OWNER HAS TO SEE IT BEFORE MERGE. The sketch experiment
// photographed FURNITURE. Nobody has ever seen a wall or floor skin under the treatment, and a skin
// is a different animal: it is a repeating FIELD across a full-bleed surface, not an object with a
// silhouette, and the two things a field can lose are exactly the two things a hand adds. A grating
// whose 6.25 cm slots close up is a grey block. Glass mullions that wobble at room scale stop
// reading as glazing. Neither failure is visible in any string, and neither is visible on a flat
// card — a floor is SHEARED into the tile parallelogram before a player ever sees it.
//
// ⭐ SO EVERY SKIN IS DRAWN THREE TIMES, IN THE PLACES THE SHIPPING SURFACE DRAWS IT:
//   1. FLAT, at its call size — the palette chip's view and the honest look at the field;
//   2. THROUGH `place.cell` (floors) or on the SLAB'S FRONT FACE (walls) — the room's own placement,
//      taken from `roomzoom-view.materialLayerSvg` itself rather than re-derived here, so the page
//      cannot be right while the game draws something else (VR-P3 MINOR 6's rule);
//   3. AT THE PALETTE CHIP'S 26 px, where a field either reads or turns to mud.
// …each beside its untreated self, because "is this better" is a comparison and a page that shows
// only the new thing cannot answer it.
//
// ⚠️ AND THE ORDER QUESTION IS ANSWERED BY THIS PAGE, NOT BY AN ARGUMENT. The treatment runs inside
// `helpers.item()`, so a floor's jitter is authored in the SKIN'S OWN SPACE and the shear carries it
// along with the rest of the drawing. Applied after the shear it would be drawn in SCREEN space —
// the wobble would run at one angle everywhere in the room and would not foreshorten with depth.
// Row 2 is where that is either true or obviously false.
//
// NO HOST, NO CDP (docs/TRAPS.md #5).
//
// USAGE
//   node client/tools/sketch-materials-sheet.mjs --out client/tools/shots-sketch-adoption
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/sketch-materials.png --window-size=1500,3000 <out>/sketch-materials.html

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MATERIAL_IDS, SPECS } from '../src/items/paper-materials.js';
import { buildItem } from '../src/items/index.js';
import { INK, PAPER, SKETCH_LEVEL } from '../src/items/helpers.js';
import {
  roomScene, scenePlacement, roomTileRect, M_PER_TILE, ROOM_SCALE, ROOM_HEIGHT_M,
} from '../src/ui/room-model.js';
import { materialLayerSvg } from '../src/ui/roomzoom-view.js';
import { decksView } from '../src/ui/decks-model.js';
import { decodeDecks, decodeRooms } from '../src/wire/messages.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-sketch-adoption'));
mkdirSync(OUT, { recursive: true });

const CM = 100;
const WALL_BOX = { w: ROOM_SCALE * CM, h: ROOM_SCALE * ROOM_HEIGHT_M * CM };
const FLOOR_BOX = { w: ROOM_SCALE * CM, h: ROOM_SCALE * CM };
const boxFor = (id) => (SPECS[id].surface === 'wall' ? WALL_BOX : FLOOR_BOX);

/** A `<g>` fragment is not a document — wrap it or it draws nothing. */
const doc = (frag, w, h) => `<svg width="${w.toFixed(0)}" height="${h.toFixed(0)}" `
  + `viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}">${frag}</svg>`;

const flat = (id, sketched) => {
  const b = boxFor(id);
  return doc(buildItem(id, { ...b, idPrefix: `f-${id}`, sketch: sketched }), b.w, b.h);
};
const chip = (id, sketched) => doc(
  buildItem(id, { w: 26, h: 26, idPrefix: `c-${id}`, sketch: sketched }), 26, 26,
);

// ── row 2: the SHIPPED placement, through `materialLayerSvg` ─────────────────────────────────
const FIX = JSON.parse(readFileSync(join(here, '../test/fixtures/decks-wreck.json'), 'utf8'));
const view = decksView(decodeDecks(FIX.decks), decodeRooms(FIX.rooms));
const FOCUS = roomTileRect(view, 'cryobay');
const scene = roomScene(FOCUS);
const place = scenePlacement(scene, FOCUS, scene.s * 100 * M_PER_TILE);

// `materialItemId(kind, mat)` maps a wire byte to an itemId. To photograph a NAMED skin the sheet
// needs the inverse, which the shipping model exposes as its own ordered lists.
const { WALL_MATERIALS, FLOOR_MATERIALS } = await import('../src/ui/build-material-model.js');
const byteOf = (id) => {
  const w = WALL_MATERIALS.find((m) => m.id === id);
  if (w) return { kind: 'wall', mat: w.mat };
  const f = FLOOR_MATERIALS.find((m) => m.id === id);
  return f ? { kind: 'floor', mat: f.mat } : null;
};

function placed(id) {
  const b = byteOf(id);
  if (!b) return '<i>no wire byte</i>';
  const tiles = [];
  for (let dx = 0; dx < 2; dx += 1) {
    for (let dy = 0; dy < 2; dy += 1) {
      tiles.push({ tx: FOCUS.rx + 3 + dx, ty: FOCUS.ry + 2 + dy, kind: b.kind, mat: b.mat });
    }
  }
  // ⛔ THE SHIPPED LAYER FUNCTION, NOT A COPY OF IT, and that is why this row is TREATED ONLY.
  // `materialLayerSvg` calls `buildItem` with no opts door, so there is no untreated variant to be
  // had without either editing a surface file this package must not touch (`lane/build-feel` is in
  // `roomzoom-view.js` concurrently) or re-deriving the placement here — and a sheet that
  // re-derives the placement is a second authority on the exact thing it exists to check. The
  // before/after comparison is the flat and chip rows above; THIS row exists to answer the other
  // question, which nothing flat can: does the hand lie on the FLOOR PLANE and foreshorten with it,
  // or is it drawn in screen space?
  const svg = materialLayerSvg(tiles, place);
  // ⚠️ THE CROP IS COMPUTED FROM `place`, NOT SCRAPED OUT OF THE EMITTED STRING. The first draft
  // read the first `translate(x y)` it found — which is the WALL path's own offset and does not
  // exist at all on the floor path (a floor tile is placed by `place.cell`, a matrix), so every
  // floor row rendered an empty box. Asking the placer where the patch is, is the same recorded
  // argument at the seam the rest of this package uses.
  const pts = [];
  for (const t of tiles) {
    pts.push(place.front(t.tx, t.ty));
    pts.push(place.front(t.tx + 1, t.ty + 1));
    if (place.foot) pts.push(place.foot(t.tx, t.ty));
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 40;
  const ox = Math.min(...xs) - pad;
  const oy = Math.min(...ys) - (b.kind === 'wall' ? ROOM_SCALE * ROOM_HEIGHT_M * 100 + pad : pad);
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - oy + pad;
  return `<svg width="${Math.min(560, w * 1.4).toFixed(0)}" height="${Math.min(420, h * 1.4).toFixed(0)}" `
    + `viewBox="${ox.toFixed(1)} ${oy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}">${svg}</svg>`;
}

const rows = MATERIAL_IDS.map((id) => `<section class="row">
  <h2>${id}<span>${SPECS[id].surface} · ${SPECS[id].w} × ${SPECS[id].h} cm</span></h2>
  <div class="cells">
    <figure class="cell"><header>flat — raw</header>${flat(id, false)}</figure>
    <figure class="cell"><header>flat — ${SKETCH_LEVEL}</header>${flat(id, undefined)}</figure>
    <figure class="cell chips"><header>palette chip, 26 px — raw / ${SKETCH_LEVEL}</header>
      ${chip(id, false)}${chip(id, undefined)}</figure>
  </div>
  <div class="cells">
    <figure class="cell wide"><header>laid in the room — the SHIPPED placer, ${SKETCH_LEVEL} (treated only: see the tool header)</header>
      ${placed(id)}</figure>
  </div>
</section>`).join('\n');

const CSS = `
  body{margin:0;background:#E7E0D2;font-family:'Space Mono',ui-monospace,monospace;color:${INK};padding:38px}
  h1{font-family:'Instrument Serif',ui-serif,Georgia,serif;font-size:36px;margin:0 0 2px}
  .lead{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#8A7F6C;margin:0 0 26px;max-width:1180px;line-height:2}
  .row{margin:0 0 26px;border-bottom:1px solid #D6CCB6;padding-bottom:18px}
  .row h2{font-family:'Instrument Serif',ui-serif,Georgia,serif;font-size:20px;font-weight:400;margin:0 0 8px;display:flex;gap:14px;align-items:baseline}
  .row h2 span{font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.16em;color:#8A7F6C}
  .cells{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap}
  .cell{margin:0;background:${PAPER};border:1px solid #C6BBA2;padding:10px 12px 12px}
  .cell header{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:#8A7F6C;margin-bottom:4px}
  .cell svg{display:block;background:${PAPER}}
  .chips svg{display:inline-block;margin-right:8px}
  .note{background:${PAPER};border-left:3px solid #7B2C22;padding:14px 18px;font-size:11px;line-height:1.9;max-width:1180px;margin:0 0 30px}
`;

writeFileSync(join(OUT, 'sketch-materials.html'), `<!doctype html><html><head><meta charset="utf-8">
<title>the twelve skins at ${SKETCH_LEVEL}</title><style>${CSS}</style></head><body>
<h1>The twelve skins, before and after</h1>
<p class="lead">six walls, six floors · flat at their call size, at the palette chip's 26 px, and
laid in the room by the SHIPPED placer · ${SKETCH_LEVEL}</p>
<div class="note"><b>What to look for, and what to name if it fails.</b>
A skin is a repeating FIELD, not an object, and the two things a hand can take from a field are its
<b>gaps</b> and its <b>direction</b>. Look at the <b>metal grating</b>'s 6.25&nbsp;cm slots and the
<b>glass partition</b>'s mullions in particular — if the slots close up or the mullions wobble into
noise at room scale, the skin has stopped saying what it is. The laid row is the one that decides:
a floor is sheared into the tile parallelogram before a player ever sees it, and the treatment is
applied BEFORE that shear (in the skin's own space), so the hand lies on the floor plane and
foreshortens with it. If a skin fails, the proposal is a per-skin exemption named here — not a
quieter preset for everything.</div>
${rows}
</body></html>`);

process.stdout.write(`wrote ${join(OUT, 'sketch-materials.html')} — ${MATERIAL_IDS.length} skins × `
  + `(flat raw/treated + chip raw/treated + laid) at ${SKETCH_LEVEL}\n`);
