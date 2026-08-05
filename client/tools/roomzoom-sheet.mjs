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
  roomDoorsSvg, roomTileRect, markLayerSvg, itemStackSvg, ROOM_SCALE, M_PER_TILE,
} from '../src/ui/room-model.js';
// ⛔⛔ THE THREE PRIVATE COPIES ARE GONE (VR-P3 review, MINOR 6). This file used to carry its own
// `fittingAt` / `pawnAt` / `ghostAt` — a verbatim re-derivation of the placement, the figure height
// and the dash dialect. That is a SECOND AUTHORITY on the exact thing the page exists to photograph:
// the sheet could be pixel-perfect while the shipping surface drew something else, which is the
// failure mode this tool was written to catch and would have been blind to. The builders are
// EXPORTED from the surface now and consumed here.
//
// ⚠️ IMPORTING THE VIEW IN NODE IS SAFE AND IS CHECKED: `roomzoom-view.js` touches no DOM at module
// scope (it resolves its nodes inside `initRoomZoom`, which this file never calls), and all three
// builders take every input as an argument. If that ever stops being true this tool throws on import
// rather than drawing something stale.
import { standItem, ghostSvg, pawnSvg } from '../src/ui/roomzoom-view.js';
import { blockedLayerSvg } from '../src/ui/blocked-overlay.js';
import { zoneLayerSvg } from '../src/ui/zone-overlay.js';
import { decksView } from '../src/ui/decks-model.js';
import { decodeDecks, decodeRooms } from '../src/wire/messages.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-roomzoom'));
mkdirSync(OUT, { recursive: true });

const FIX = JSON.parse(readFileSync(join(here, '../test/fixtures/decks-wreck.json'), 'utf8'));
const view = decksView(decodeDecks(FIX.decks), decodeRooms(FIX.rooms));

/**
 * ONE PLATE: a room, drawn with the SHIPPING builders and nothing else.
 *
 * ⭐ TWO SHAPES ARE RENDERED, NOT ONE (VR-P3 review, MINOR 6). A single 12 × 8 compartment cannot
 * show what a NARROW room does to the title band, the stat line or the door labels — and both of
 * those clipped in the shipped draft, invisibly, because every leg in the suite drove one wide room.
 */
function plate(focus, opts = {}) {
  const scene = roomScene(focus);
  const TILE_PX = scene.s * 100 * M_PER_TILE;
  const place = scenePlacement(scene, focus, TILE_PX);
  const rx = focus.rx, ry = focus.ry;
  const at = (dx, dy) => ({ x: rx + dx, y: ry + dy });
  const inRoom = (dx, dy) => dx < focus.rw && dy < focus.rh;

  const doors = [
    { tx: rx, ty: ry + Math.min(3, focus.rh - 1), side: 'left', label: '‹ 12 · ENGINEERING SPACES' },
    { tx: rx + focus.rw - 1, ty: ry + Math.min(4, focus.rh - 1), side: 'right', label: '2 · ROOM A1 ›' },
    { tx: rx + Math.min(5, focus.rw - 1), ty: ry + focus.rh - 1, side: 'back', label: 'AFT BULKHEAD' },
  ];
  const marks = [
    [8, 1, 'debris'], [9, 1, 'debris'], [8, 2, 'dig'], [9, 2, 'dig'], [10, 3, 'strip'],
  ].filter(([dx, dy]) => inRoom(dx, dy)).map(([dx, dy, mark]) => ({ tx: rx + dx, ty: ry + dy, mark }));
  const zones = [
    [1, 5, false, false, 'STOCKPILE · ALL'],
    [2, 5, true, false, 'STOCKPILE · PARTS'],
    [3, 5, false, true, 'STOCKPILE · BACKED OFF'],
  ].filter(([dx, dy]) => inRoom(dx, dy))
    .map(([dx, dy, restricted, backedOff, label]) => ({ tx: rx + dx, ty: ry + dy, restricted, backedOff, label }));
  const blocked = inRoom(6, 6) ? [{
    tx: rx + 6, ty: ry + 6, reasonName: 'no_route', reasonText: 'NO WAY TO WALK TO IT',
    label: 'DIG BLOCKED — NO WAY TO WALK TO IT',
  }] : [];
  const items = inRoom(4, 2) ? [{ tx: rx + 4, ty: ry + 2, stacks: [{ kind: 0, count: 40 }] }] : [];
  // the catalogue, at true dimensions, along the room — through the SHIPPED placer
  const fittings = [
    ['bench', 1, 1], ['dining-table', 4, 4], ['cooker', 7, 5], ['shelf-rack', 2, 7],
    ['locker', 10, 6], ['stool', 5, 3], ['chair', 6, 3],
  ].filter(([, dx, dy]) => inRoom(dx, dy));
  const crew = [
    { cid: 627, role: 'engineer', name: 'Ada Ozawa', task: 'Hauling parts', ...at(5, 2) },
    { cid: 913, role: 'grower', name: 'Jun Okonjo', task: '', ...at(8, 4) },
  ].filter((c) => inRoom(c.x - rx, c.y - ry));
  const ghosts = inRoom(3, 3)
    ? [{ x: rx + 3, y: ry + 3, kind: 0, delivered: 2, required: 3 }] : [];

  const body = roomHatchDef()
    + roomTitleSvg(scene, {
      slotIndex: focus.slotIndex, roomName: focus.displayName, areaM2: scene.areaM2,
      placed: 5, pending: 4, here: crew.length, aboard: 3, vacuum: !!opts.vacuum,
    })
    + roomCutawaySvg(scene, { vacuum: !!opts.vacuum })
    + roomDoorsSvg(scene, focus, doors)
    + zoneLayerSvg(zones, focus, place, TILE_PX)
    + fittings.map(([id, dx, dy]) =>
      standItem(id, rx + dx, ry + dy, place, `sheet-${id}-${dx}-${dy}`, undefined)).join('')
    + markLayerSvg(marks, focus, TILE_PX, place)
    + itemStackSvg(items, focus, TILE_PX, place)
    + blockedLayerSvg(blocked, focus, TILE_PX, place)
    + pawnSvg(crew, focus, 627, place)
    + ghostSvg(ghosts, scene, place)
    + roomDimensionsSvg(scene);

  const svg = `<svg width="${scene.viewBox.w}" height="${scene.viewBox.h}" `
    + `viewBox="${scene.viewBoxAttr}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  return { scene, svg };
}

const WIDE = roomTileRect(view, 'cryobay');
/** A 3 × 3 compartment carved out of the same room — the NARROW shape, where the title band, the
 *  stat line and the left door label all have to survive a viewBox barely wider than the room. */
const NARROW = { ...WIDE, rw: 3, rh: 3, slotIndex: WIDE.slotIndex, displayName: 'LOCKER FLAT' };

const plates = [
  ['the wreck cryo bay', plate(WIDE)],
  ['the same drawing, AIRLESS', plate(WIDE, { vacuum: true })],
  ['a 3 × 3 compartment — the narrow shape', plate(NARROW, { vacuum: true })],
];

const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="../../src/theme/paper.css">
<link rel="stylesheet" href="../../styles/base.css">
<style>
  body{margin:0;background:#E7E0D2;padding:40px;font-family:'Space Mono',monospace}
  h1{font-family:'Instrument Serif',serif;font-size:34px;color:#14120F;margin:0 0 4px}
  .lead{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#8A7F6C;margin-bottom:22px}
  .plate{background:#EBE4D1;border:1px solid #C6BBA2;box-shadow:0 18px 40px -28px rgba(28,26,23,.55);
    padding:22px;width:max-content;margin-bottom:34px}
  svg{display:block;max-width:100%;height:auto}
</style>
<h1>Level-2 · the room cutaway</h1>
${plates.map(([caption, p]) => `<div class="lead">${caption} · ${p.scene.wM} × ${p.scene.dM} × ${p.scene.hM} M `
  + `· s=${p.scene.s} px/cm · viewBox ${p.scene.viewBox.w}×${p.scene.viewBox.h}</div>`
  + `<div class="plate">${p.svg}</div>`).join('\n')}
`;

writeFileSync(join(OUT, 'roomzoom-sheet.html'), html);
writeFileSync(join(OUT, 'roomzoom-sheet.svg'), plates[0][1].svg);
process.stdout.write(`wrote ${join(OUT, 'roomzoom-sheet.html')} — ${plates.length} plates, `
  + `drawn with the SHIPPED standItem/ghostSvg/pawnSvg (ROOM_SCALE=${ROOM_SCALE})\n`);
