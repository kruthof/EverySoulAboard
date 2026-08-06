#!/usr/bin/env node
// sketch-ground-ruling-shot.mjs — THE MATERIALS GROUND-RULE RULING, AS A CONTROLLED A/B.
//
// ⛔ WHY THIS TOOL EXISTS AND WHY THE FIRST ATTEMPT DID NOT COUNT (review, 2026-08-05). The ruling
// that material skins pass `ground: false` is an ORCHESTRATOR ruling, overridable by the owner —
// which means the owner has to be able to veto it FROM A PICTURE. The first set of pictures was
// taken with `material-under-pawn-shot.mjs`, and it is the wrong instrument for this question: it
// WALKS a pawn between the two frames (that is its own subject), so the figure moved and gained a
// selection ellipse between "before" and "after", the closeup existed only for the after, and the
// single strongest piece of evidence — ninety-six ground rules on one floor — had no picture at all.
// Two frames that differ in three things are not a control.
//
// ⭐ SO: ONE VARIABLE, AND IT IS THE KNOB. Same scene, same camera, same tiles, same material, same
// pawn at the same fixed foot position with the same selection state. The ONLY difference between
// the two columns is `sketch()`'s `ground` argument. Everything else is byte-shared by construction,
// because both columns are built by the same loop from the same fragments.
//
// ⛔ AND IT IS PINNED TO THE SHIPPING PATH RATHER THAN BEING A SECOND AUTHORITY. A sheet that
// re-derives the placement is a second opinion about the exact thing the sheet exists to check
// (VR-P3's MINOR 6). So the AFTER column is asserted BYTE-IDENTICAL to what
// `roomzoom-view.materialLayerSvg` — the shipping surface — emits for the same tiles, and the tool
// throws if it is not. The BEFORE column is that same fragment with one argument flipped.
//
// THE THREE PICTURES, which are the three the ruling is actually made of:
//   1. `ground-ruling-floor-before.png`  the whole 12 × 8 floor with the rule ON — the ninety-six.
//   2. `ground-ruling-floor-after.png`   the same floor, shipped.
//   3. `ground-ruling-closeup.png`       both, side by side, at 3× on the same four tiles.
//
// USAGE
//   node client/tools/sketch-ground-ruling-shot.mjs --out client/tools/shots-sketch-adoption
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/ground-ruling-floor-before.png --window-size=1400,900 \
//     <out>/ground-ruling-floor-before.html            (…and the same for -after and -closeup)

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  roomScene, scenePlacement, roomCutawaySvg, roomHatchDef, roomTitleSvg, roomTileRect, M_PER_TILE,
} from '../src/ui/room-model.js';
import { materialLayerSvg, pawnParts, FLOOR_MAT_PX } from '../src/ui/roomzoom-view.js';
import { materialItemId } from '../src/ui/build-material-model.js';
import { decksView } from '../src/ui/decks-model.js';
import { decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { buildItem } from '../src/items/index.js';
import { sketch, GROUND_CLASS } from '../src/render/sketch.js';
import { SKETCH_LEVEL, PAPER } from '../src/items/helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-sketch-adoption'));
mkdirSync(OUT, { recursive: true });

const FIX = JSON.parse(readFileSync(join(here, '../test/fixtures/decks-wreck.json'), 'utf8'));
const view = decksView(decodeDecks(FIX.decks), decodeRooms(FIX.rooms));
const FOCUS = roomTileRect(view, 'cryobay');

// ⛔ THE SKIN CHOICE IS ITSELF A FINDING, AND THE FIRST ONE WAS WRONG. `metal-grating` looked like
// the right subject — the finest field in the set — and on it the ruling is nearly INVISIBLE: the
// appended rule lands on the tile's own bottom edge, which the grating already draws, so 96 rules and
// 0 rules photograph the same. That is worth the owner knowing rather than worth hiding, so the
// closeup sheet now shows ALL SIX floor skins, and the whole-floor pair uses the one where the
// difference actually reads. A picture that cannot show the change is not evidence for it.
const FLOOR_BYTES = [1, 2, 3, 4, 5, 6];
/** The whole-floor pair's skin: a plain field, where a stray rule has nothing to hide behind. */
const MAT_BYTE = 6;
const MAT_ID = materialItemId('floor', MAT_BYTE);
/** ONE pawn, at ONE fixed tile, in BOTH columns, unselected in both. */
const PAWN = { cid: 627, role: 'damage control', name: 'Ada Ozawa', task: 'Hauling parts' };

const scene = roomScene(FOCUS);
const TILE_PX = scene.s * 100 * M_PER_TILE;
const place = scenePlacement(scene, FOCUS, TILE_PX);

/** Every floor tile of the room — the twelve-by-eight the ninety-six was counted on. */
const TILES = [];
for (let dy = 0; dy < FOCUS.rh; dy += 1) {
  for (let dx = 0; dx < FOCUS.rw; dx += 1) {
    TILES.push({ kind: 'floor', mat: MAT_BYTE, tx: FOCUS.rx + dx, ty: FOCUS.ry + dy });
  }
}

/** One floor tile's fragment, with the ground knob as the ONLY argument that moves. */
function tile(t, groundOn, matId) {
  const idp = 'rz-mt-' + t.tx + '-' + t.ty;
  const opts = { w: FLOOR_MAT_PX, h: FLOOR_MAT_PX, idPrefix: idp };
  if (!groundOn) return buildItem(matId, opts);
  return sketch(buildItem(matId, { ...opts, sketch: false }),
    { level: SKETCH_LEVEL, seed: matId, ground: true });
}

const floorLayer = (groundOn, matId = MAT_ID) => '<g class="rz-floor-mat" pointer-events="none">'
  + TILES.map((t) => '<g transform="' + place.cell(t.tx, t.ty) + '">'
    + tile(t, groundOn, matId) + '</g>').join('')
  + '</g>';

// ⛔ THE AFTER COLUMN IS THE SHIPPING SURFACE, VERIFIED IN BYTES — not a lookalike. If this throws,
// this tool has drifted from `materialLayerSvg` and every picture below is about a page nobody sees.
const shipped = materialLayerSvg(TILES, place);
const mine = floorLayer(false);
const marks = (s) => (s.match(new RegExp('class="' + GROUND_CLASS + '"', 'g')) || []).length;
if (shipped !== mine) {
  throw new Error('this tool\'s AFTER column is not byte-identical to `materialLayerSvg` for the same '
    + 'tiles — it has become a second authority on the thing it exists to photograph.');
}
// …and both directions of the claim the pictures are about, so a blank page cannot look like a fix.
if (marks(floorLayer(true)) !== TILES.length) {
  throw new Error('the BEFORE column does not draw one ground rule per tile — the control is broken');
}
if (marks(mine) !== 0) throw new Error('the AFTER column still draws ground rules');
for (const b of FLOOR_BYTES) {
  const id = materialItemId('floor', b);
  if (marks(floorLayer(true, id)) !== TILES.length || marks(floorLayer(false, id)) !== 0) {
    throw new Error(id + ': the six-skin control does not go 96 → 0');
  }
}

const crew = [{ ...PAWN, x: FOCUS.rx + 6, y: FOCUS.ry + 4 }];
const pawns = pawnParts(crew, FOCUS, null, place)   // selCid null in BOTH columns — no ellipse, ever
  .map((p) => '<g transform="translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ')">' + p.html + '</g>')
  .join('');

function plate(groundOn, label) {
  return roomHatchDef()
    + roomTitleSvg(scene, {
      slotIndex: FOCUS.slotIndex, roomName: FOCUS.displayName + ' · ' + label,
      areaM2: scene.areaM2, placed: 0, pending: 0, here: 1, aboard: 1,
    })
    + roomCutawaySvg(scene, {}) + floorLayer(groundOn) + pawns;
}

const page = (title, sub, body, w) => '<!doctype html><meta charset="utf-8"><title>' + title + '</title>'
  + '<style>html,body{margin:0;background:' + PAPER + ';font-family:ui-serif,Georgia,serif}'
  + '.h{padding:14px 20px 0}h1{font-size:19px;margin:0}p{font-size:12px;margin:4px 0 0;opacity:.75;'
  + 'font-family:ui-monospace,Menlo,monospace;letter-spacing:.04em}.w{padding:8px 20px 20px}'
  + '.col{display:flex;gap:18px;align-items:flex-start}.cap{font-family:ui-monospace,Menlo,monospace;'
  + 'font-size:11px;letter-spacing:.08em;opacity:.7;padding:6px 0}</style>'
  + '<div class="h"><h1>' + title + '</h1><p>' + sub + '</p></div><div class="w">' + body + '</div>';

const svg = (body) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + scene.viewBoxAttr
  + '" width="' + w0 + '">' + body + '</svg>';
const w0 = 1340;

writeFileSync(join(OUT, 'ground-ruling-floor-before.html'),
  page('BEFORE — the ground rule ON, one per floor tile',
    TILES.length + ' floor tiles · ' + marks(floorLayer(true)) + ' ground rules · ' + MAT_ID
    + ' · one at each tile\'s lower edge, so the lattice reads DOUBLED. Compare with -after at the '
    + 'same crop; the closeup sheet is where it reads clearest, and it shows all six skins because '
    + 'this does not read equally on all of them.',
    svg(plate(true, 'GROUND RULE ON'))));

writeFileSync(join(OUT, 'ground-ruling-floor-after.html'),
  page('AFTER — shipped (`ground: false` at the materials seam)',
    TILES.length + ' floor tiles · ' + marks(mine) + ' ground rules · ' + MAT_ID
    + ' · identical to `materialLayerSvg`, verified in bytes',
    svg(plate(false, 'SHIPPED'))));

// THE CLOSEUP — the same four tiles, both columns, same crop. `viewBox` does the zoom, so the two
// crops are the same rectangle of the same scene by construction rather than by hand.
//
// ⚠️ THE CROP CENTRE COMES FROM `place.foot()`, WHICH RETURNS NUMBERS. The first draft scraped them
// out of `place.cell()`'s string — and `cell()` returns a full `matrix(1 0 0.4 -0.6 647 577)`, so
// stripping non-numerics yielded `1, 0` as the centre and the crop landed off the scene: a page that
// rendered, captioned itself correctly, and was BLANK. Caught by looking at it, which is the whole
// standing rule about pictures.
const [cx, cy] = place.foot(FOCUS.rx + 5, FOCUS.ry + 4);
const CW = TILE_PX * 3.4, CH = TILE_PX * 2.6;
const VB = (cx - CW / 2).toFixed(1) + ' ' + (cy - CH * 0.62).toFixed(1) + ' '
  + CW.toFixed(1) + ' ' + CH.toFixed(1);
const crop = (body, tag) => '<div><div class="cap">' + tag + '</div>'
  + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + VB + '" width="560" '
  + 'style="background:' + PAPER + '">' + roomHatchDef() + body + '</svg></div>';

writeFileSync(join(OUT, 'ground-ruling-closeup.html'),
  page('CLOSEUP — all six floor skins, the same crop, one variable',
    'left: ground rule ON · right: shipped · same scene, same camera, same pawn, unselected in both. '
    + 'ALL SIX are here because the ruling does not read equally on all of them — on `metal-grating` '
    + 'the rule lands on the tile edge the skin already draws and the two are near-identical.',
    FLOOR_BYTES.map((b) => {
      const id = materialItemId('floor', b);
      return '<div class="cap" style="font-size:13px;opacity:1;padding-top:14px">' + id + '</div>'
        + '<div class="col">'
        + crop(floorLayer(true, id) + pawns, 'BEFORE · GROUND RULE ON · 96 rules')
        + crop(floorLayer(false, id) + pawns, 'AFTER · SHIPPED · 0 rules')
        + '</div>';
    }).join('')));

process.stdout.write([
  'material            ' + MAT_ID,
  'floor tiles         ' + TILES.length + ' (' + FOCUS.rw + ' x ' + FOCUS.rh + ')',
  'ground rules BEFORE ' + marks(floorLayer(true)),
  'ground rules AFTER  ' + marks(mine) + '   (byte-identical to materialLayerSvg)',
  'wrote               ' + OUT + '/ground-ruling-floor-{before,after}.html, ground-ruling-closeup.html',
  '',
].join('\n'));
