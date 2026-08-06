#!/usr/bin/env node
// sketch-room-shot.mjs — THE TREATMENT IN A REAL ROOM, BESIDE REAL PAWNS.
//
// ⚠️ SHIPPED SINCE 2026-08-05, NOT AN EXPERIMENT ANY MORE. The owner adopted `strong` catalogue-wide,
// so `standItem` now returns a TREATED fragment by default and this tool asks it for the RAW one
// (`{ sketch: false }`) and applies each level itself. Without that change the `original` column
// would have been `strong` and every comparison on this page would have been against the wrong
// baseline — the exact failure `sketch.test.js`'s "unknown level is a pass-through" leg exists for.
//
// ⛔ WHY THE CATALOGUE SHEET IS NOT ENOUGH, and this is the whole reason this second tool exists. A
// card shows a fitting ALONE on bare paper at a size nothing in the game uses. The owner's complaint
// is about a SCENE — furniture and people in the same picture, drawn by two different hands — and the
// only place that complaint can be answered is a room. Three things only appear here:
//   · the piece is drawn at the ROOM's px-per-cm (0.95), not at whatever fills a 168-px card, so the
//     treatment's amplitudes land at their real on-screen size for the first time;
//   · it stands on a HATCHED WALL and a RULED FLOOR GRID, which is what a knockout pass is for and
//     the only place its cost and its benefit are both visible;
//   · a pawn is IN the drawing rather than beside it, at the scale the shipping surface uses.
//
// NO HOST, NO CDP. `roomzoom-sheet.mjs`'s rule and its machinery: the scene is built here in node by
// the SHIPPED builders over the COMMITTED `--ship wreck` decks capture. Nothing is spawned, nothing
// is killed, no port is taken — which on a contended box is worth more than a live screenshot of the
// same drawing (docs/TRAPS.md #5: a leaked headless Chrome OOM-kills somebody else's gate).
//
// ⭐ THE FITTINGS GO THROUGH THE SHIPPED `standItem`, AND THE TREATMENT IS APPLIED TO ITS OUTPUT.
// That is deliberate: a room shot that placed the pieces its own way could be beautiful while the
// game drew something else, which is exactly the second-authority failure `roomzoom-sheet.mjs`'s
// header records. The ONLY thing this tool changes is the ink.
//
// USAGE
//   node client/tools/sketch-room-shot.mjs --out client/tools/shots-sketch
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
//     --screenshot=<out>/sketch-room.png --window-size=1420,3000 <out>/sketch-room.html

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  roomScene, scenePlacement, roomCutawaySvg, roomHatchDef, roomTitleSvg, roomDimensionsSvg,
  roomDoorsSvg, roomTileRect, M_PER_TILE,
} from '../src/ui/room-model.js';
import { standItem, pawnParts } from '../src/ui/roomzoom-view.js';
import { decksView } from '../src/ui/decks-model.js';
import { decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { sketch, LEVELS } from '../src/render/sketch.js';

// ⛔ `pawnSvg` IS GONE (main, 2026-08-05, the client-side tween): the figures moved into a persistent
// overlay `<svg>` so a repaint cannot destroy an in-flight animation, and `pawnParts` now returns
// FOOT-RELATIVE parts plus the foot point instead of one placed string. A still image has no overlay
// and no tween, so it places them itself — the same `translate` the live layer writes.
const pawnsSvg = (list, focus, sel, place) => pawnParts(list, focus, sel, place)
  .map((p) => `<g transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})">${p.html}</g>`).join('');


const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', 'client/tools/shots-sketch'));
mkdirSync(OUT, { recursive: true });

const FIX = JSON.parse(readFileSync(join(here, '../test/fixtures/decks-wreck.json'), 'utf8'));
const view = decksView(decodeDecks(FIX.decks), decodeRooms(FIX.rooms));
const FOCUS = roomTileRect(view, 'cryobay');

/** The furniture in the shot — spread across the depth so the far pieces are half-occluded, which is
 *  where a knockout pass either earns its keep or eats a leg. */
const FITTINGS = [
  ['dining-table', 4, 4], ['bunk-bed', 1, 1], ['locker', 10, 6],
  ['capsule-sealed', 7, 2], ['cell-sound', 2, 6], ['chair', 6, 5], ['stool', 3, 4],
];

/** Two crew, standing among the furniture rather than politely to one side. */
const CREW = [
  { cid: 627, role: 'damage control', name: 'Ada Ozawa', task: 'Hauling parts' },
  { cid: 913, role: 'hydroponics', name: 'Jun Okonjo', task: '' },
];

function plate(level) {
  const scene = roomScene(FOCUS);
  const TILE_PX = scene.s * 100 * M_PER_TILE;
  const place = scenePlacement(scene, FOCUS, TILE_PX);
  const rx = FOCUS.rx, ry = FOCUS.ry;
  const inRoom = (dx, dy) => dx < FOCUS.rw && dy < FOCUS.rh;

  const doors = [
    { tx: rx, ty: ry + Math.min(3, FOCUS.rh - 1), side: 'left', label: '‹ 12 · ENGINEERING SPACES' },
    { tx: rx + FOCUS.rw - 1, ty: ry + Math.min(4, FOCUS.rh - 1), side: 'right', label: '2 · ROOM A1 ›' },
  ];
  const crew = [
    { ...CREW[0], x: rx + 5, y: ry + 2 },
    { ...CREW[1], x: rx + 8, y: ry + 4 },
  ].filter((c) => inRoom(c.x - rx, c.y - ry));

  // ⚠️ THE SEED HERE IS THE PIECE ID PLUS ITS TILE — AND THE SHIPPED SEAM SEEDS BY THE PIECE ALONE.
  // The difference is deliberate and it is an OPEN VISUAL QUESTION this page exists to show, not a
  // disagreement: per-tile is what this tool's own first render argued for (below), and per-piece is
  // what `helpers.item()` does, because it is the seed that makes a treated fragment CACHEABLE — the
  // repaint bench measures a 39× win from a cache keyed on (itemId, side), and a per-placement seed
  // gives that up. The plates here are therefore the per-tile look; the game draws the per-piece one.
  //
  // ⚠️ THE ORIGINAL ARGUMENT, KEPT: two lockers on one deck should
  // be the SAME OBJECT drawn by the same hand, but a hand does not trace the same wobble twice — and
  // with a bare id they came out bit-identical, which reads as a stamp rather than as a drawing. The
  // tile is the cheapest stable per-instance key the room already has, and it is stable across frames
  // (a fitting does not move), so the piece is the same drawing every tick and a different drawing
  // from its twin. THAT is what the determinism rule is protecting — not sameness, REPEATABILITY.
  const art = FITTINGS.filter(([, dx, dy]) => inRoom(dx, dy)).map(([id, dx, dy]) => {
    // ⛔ `facing` IS 7th AND THE OPTS BAG IS 8th (the merge with `lane/pawn-tween`). Passing the bag
    // 7th is SILENT: `{ sketch: false }` is read as a facing, never reaches the builder, and the
    // "original" column becomes the treated art compared against itself.
    const raw = standItem(id, rx + dx, ry + dy, place, `rm-${level}-${id}-${dx}-${dy}`, undefined, 0,
      { sketch: false });
    return level === 'original' ? raw : sketch(raw, { level, seed: `${id}@${dx},${dy}` });
  }).join('');

  const body = roomHatchDef()
    + roomTitleSvg(scene, {
      slotIndex: FOCUS.slotIndex, roomName: `${FOCUS.displayName} · ${level.toUpperCase()}`,
      areaM2: scene.areaM2, placed: FITTINGS.length, pending: 0, here: crew.length, aboard: 3,
    })
    + roomCutawaySvg(scene, {})
    + roomDoorsSvg(scene, FOCUS, doors)
    + art
    + pawnsSvg(crew, FOCUS, 627, place)
    + roomDimensionsSvg(scene);

  return { scene, svg: `<svg width="${scene.viewBox.w}" height="${scene.viewBox.h}" `
    + `viewBox="${scene.viewBoxAttr}" xmlns="http://www.w3.org/2000/svg">${body}</svg>` };
}

const LEVELS_SHOWN = ['original', 'subtle', 'hand', 'medium', 'strong'];
const plates = LEVELS_SHOWN.map((lv) => [lv, plate(lv)]);

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>the sketch treatment — in a real wreck room</title><style>
  body{margin:0;background:#E7E0D2;padding:34px;font-family:'Space Mono',ui-monospace,monospace;color:#14120F}
  h1{font-family:'Instrument Serif',ui-serif,Georgia,serif;font-size:34px;margin:0 0 2px}
  .lead{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#8A7F6C;margin:0 0 22px;line-height:2}
  .cap{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8A7F6C;margin:0 0 6px}
  .cap b{color:#7B2C22;letter-spacing:.14em}
  .plate{background:#EBE4D1;border:1px solid #C6BBA2;padding:16px;width:max-content;margin:0 0 26px}
  svg{display:block;max-width:100%;height:auto}
</style></head><body>
<h1>The same room, five hands</h1>
<p class="lead">the wreck cryo bay · the SHIPPED room cutaway, the SHIPPED placer, the SHIPPED pawns ·
the only thing that changes between plates is the ink on the furniture · seeded per piece PER TILE,
so two of a kind are the same object drawn twice rather than stamped twice</p>
${plates.map(([lv, p]) => `<p class="cap"><b>${lv}</b> · ${p.scene.wM} × ${p.scene.dM} × ${p.scene.hM} m `
  + `· s=${p.scene.s} px/cm</p><div class="plate">${p.svg}</div>`).join('\n')}
</body></html>`;

writeFileSync(join(OUT, 'sketch-room.html'), html);
for (const [lv, p] of plates) writeFileSync(join(OUT, `sketch-room-${lv}.svg`), p.svg);

// determinism, in the room too — a per-tile seed is still a PURE function of the tile
const a = plate('hand').svg, b = plate('hand').svg;
process.stdout.write(`wrote ${join(OUT, 'sketch-room.html')} — ${plates.length} plates, `
  + `${FITTINGS.length} fittings, ${CREW.length} crew · room re-render identical: ${a === b}\n`);
if (a !== b) process.exit(3);
