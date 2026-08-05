#!/usr/bin/env node
// roomzoom-sheet.mjs — RENDER THE LEVEL-2 ROOM CUTAWAY ONTO ONE PAGE, so it can be looked at.
//
// ⚠️ WHY THIS EXISTS, and why a green node suite is not a substitute. Every assertion in
// `room-model.test.js` reads a STRING: that a matrix has the oblique's two ratios, that a ghost
// carries `stroke-dasharray="8 5"`, that the inverse round-trips. None of that is a picture. A
// scene can satisfy all of it and still draw a room whose walls do not meet, whose fittings float,
// whose labels land on top of each other, or whose ink is too fine to survive being fitted into a
// canvas — and the emitted text is byte-identical to the working case. `marks-shot.mjs`'s header
// records that failure in this repo's own history: "a perfectly formed SVG string paints nothing if
// its box is empty or its text is scaled to nothing".
//
// NO HOST, NO CDP, NO MODULE LOADING IN THE PAGE — `fittings-sheet.mjs`'s rule, for its reasons:
// `file://` refuses ES-module imports, and a tool that needs a running game to draw a room is a tool
// nobody runs twice. The SVG is generated HERE, in node, by the SHIPPED builders, over the COMMITTED
// `--ship wreck` decks capture plus a synthetic frame, and inlined.
//
// ⛔ WHAT IT IS NOT. It does not drive the palette, the crew dock, the minimap or any gesture: those
// are DOM chrome and they are covered by the driven node rigs and by `palette-shot.mjs` in a real
// browser. This page is about the DRAWING — the thing that changed.
//
// USAGE
//   node client/tools/roomzoom-sheet.mjs --out client/tools/shots-roomzoom
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/roomzoom-sheet.png --window-size=1600,2600 <out>/roomzoom-sheet.html

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  roomScene, scenePlacement, roomCutawaySvg, roomHatchDef, roomTitleSvg, roomDimensionsSvg,
  roomDoorsSvg, roomTileRect, markLayerSvg, itemStackSvg, U,
} from '../src/ui/room-model.js';
import { blockedLayerSvg } from '../src/ui/blocked-overlay.js';
import { zoneLayerSvg } from '../src/ui/zone-overlay.js';
import { decksView } from '../src/ui/decks-model.js';
import { decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { roomBox } from '../src/items/fittings.js';
import { buildItem } from '../src/items/index.js';
import { pawnSprite } from '../src/render/pawn-svg.js';
import { box as obliqueBox, fhRef, haloText, INK, PAPER, ATTEND } from '../src/render/oblique.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-roomzoom'));
mkdirSync(OUT, { recursive: true });

const FIX = JSON.parse(readFileSync(join(here, '../test/fixtures/decks-wreck.json'), 'utf8'));
const view = decksView(decodeDecks(FIX.decks), decodeRooms(FIX.rooms));
const FOCUS = roomTileRect(view, 'cryobay');

const scene = roomScene(FOCUS);
const TILE_PX = scene.s * 100;
const place = scenePlacement(scene, FOCUS, TILE_PX);
const S = scene.s;

/** A fitting at TRUE SIZE on a tile, through the shipped placement + the shipped size derivation. */
function fittingAt(id, tx, ty) {
  const rb = roomBox(id, S);
  const [px, py] = place.front(tx, ty);
  if (!rb) return '';
  return `<g transform="translate(${(px + rb.dx).toFixed(2)} ${(py + rb.dy).toFixed(2)})">`
    + buildItem(id, { w: rb.side, h: rb.side, idPrefix: `sheet-${id}-${tx}-${ty}` }) + '</g>';
}

/** A pawn standing on a tile — the P5 figure at the room's own centimetre rule. */
function pawnAt(cid, role, tx, ty) {
  const H = 1.66 * 100 * S, sc = H / 24;
  const [fx, fy] = place.foot(tx, ty);
  return `<g transform="translate(${(fx - 8 * sc).toFixed(1)} ${(fy - 23 * sc).toFixed(1)}) `
    + `scale(${sc.toFixed(3)})">${pawnSprite({ cid, role }, { idPrefix: `sheet-pw-${cid}` })}</g>`;
}

/** The queued-order ghost, in the dash dialect, with its leader and its price. */
function ghostAt(tx, ty, label) {
  const [px, py] = place.front(tx, ty);
  const [cx, cy] = place.foot(tx, ty);
  const lx = cx - 120, ly = cy + 46;
  return `<g>${obliqueBox(px, py, 100, 240, 100, S, {
    stroke: ATTEND, strokeWidth: 1.5, dash: '8 5', sideFill: 'hatch', hatch: fhRef('rz'), opacity: 0.92,
  })}<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} L${lx.toFixed(1)} ${ly.toFixed(1)}" fill="none" `
    + `stroke="${ATTEND}" stroke-width="0.8" opacity="0.65"/>`
    + haloText(label, lx, ly + 10, { size: 8.5, font: 'mono', tracking: 1.3, fill: ATTEND, anchor: 'start' })
    + '</g>';
}

const rx = FOCUS.rx, ry = FOCUS.ry;
const doors = [
  { tx: rx, ty: ry + 3, side: 'left', label: '‹ 2 · ROOM A1' },
  { tx: rx + FOCUS.rw - 1, ty: ry + 4, side: 'right', label: '2 · ROOM A1 ›' },
  { tx: rx + 5, ty: ry + FOCUS.rh - 1, side: 'back', label: 'AFT BULKHEAD' },
];
const marks = [
  { tx: rx + 8, ty: ry + 1, mark: 'debris' }, { tx: rx + 9, ty: ry + 1, mark: 'debris' },
  { tx: rx + 8, ty: ry + 2, mark: 'dig' }, { tx: rx + 9, ty: ry + 2, mark: 'dig' },
  { tx: rx + 10, ty: ry + 3, mark: 'strip' },
];
const zones = [
  { tx: rx + 1, ty: ry + 5, restricted: false, backedOff: false, label: 'STOCKPILE · ALL' },
  { tx: rx + 2, ty: ry + 5, restricted: true, backedOff: false, label: 'STOCKPILE · PARTS' },
  { tx: rx + 3, ty: ry + 5, restricted: false, backedOff: true, label: 'STOCKPILE · BACKED OFF' },
];
const blocked = [{
  tx: rx + 6, ty: ry + 6, reasonName: 'no_route', reasonText: 'NO WAY TO WALK TO IT',
  label: 'DIG BLOCKED — NO WAY TO WALK TO IT',
}];
const items = [{ tx: rx + 4, ty: ry + 2, stacks: [{ kind: 0, count: 40 }] }];

const body = roomHatchDef()
  + roomTitleSvg(scene, {
    slotIndex: FOCUS.slotIndex, roomName: FOCUS.displayName, areaM2: scene.areaM2,
    placed: 5, pending: 4, here: 2, aboard: 3, vacuum: false,
  })
  + roomCutawaySvg(scene, { vacuum: false })
  + roomDoorsSvg(scene, FOCUS, doors)
  + zoneLayerSvg(zones, FOCUS, place, TILE_PX)
  // the catalogue, at true dimensions, along the room
  + fittingAt('bench', rx + 1, ry + 1)
  + fittingAt('dining-table', rx + 4, ry + 4)
  + fittingAt('cooker', rx + 7, ry + 5)
  + fittingAt('shelf-rack', rx + 2, ry + 7)
  + fittingAt('locker', rx + 10, ry + 6)
  + fittingAt('stool', rx + 5, ry + 3)
  + fittingAt('chair', rx + 6, ry + 3)
  + markLayerSvg(marks, FOCUS, TILE_PX, place)
  + itemStackSvg(items, FOCUS, TILE_PX, place)
  + blockedLayerSvg(blocked, FOCUS, TILE_PX, place)
  + pawnAt(627, 'engineer', rx + 5, ry + 2)
  + pawnAt(913, 'grower', rx + 8, ry + 4)
  + ghostAt(rx + 3, ry + 3, 'WALL · 3 PARTS')
  + roomDimensionsSvg(scene);

const svg = `<svg width="${scene.viewBox.w}" height="${scene.viewBox.h}" `
  + `viewBox="${scene.viewBoxAttr}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="../../src/theme/paper.css">
<link rel="stylesheet" href="../../styles/base.css">
<style>
  body{margin:0;background:#E7E0D2;padding:40px;font-family:'Space Mono',monospace}
  h1{font-family:'Instrument Serif',serif;font-size:34px;color:#14120F;margin:0 0 4px}
  .lead{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#8A7F6C;margin-bottom:22px}
  .plate{background:#EBE4D1;border:1px solid #C6BBA2;box-shadow:0 18px 40px -28px rgba(28,26,23,.55);
    padding:22px;width:max-content}
  svg{display:block;max-width:100%;height:auto}
</style>
<h1>Level-2 · the room cutaway</h1>
<div class="lead">${FOCUS.displayName} · ${scene.wM} × ${scene.dM} × ${scene.hM} M · s=${S} px/cm</div>
<div class="plate">${svg}</div>
`;

writeFileSync(join(OUT, 'roomzoom-sheet.html'), html);
writeFileSync(join(OUT, 'roomzoom-sheet.svg'), svg);
process.stdout.write(`wrote ${join(OUT, 'roomzoom-sheet.html')} (${scene.viewBox.w}×${scene.viewBox.h})\n`);
