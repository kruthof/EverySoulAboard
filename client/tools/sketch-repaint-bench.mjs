#!/usr/bin/env node
// sketch-repaint-bench.mjs — WHAT THE TREATMENT COSTS, MEASURED (ruling E10's open item).
//
// ⛔ WHAT THIS TOOL CAN AND CANNOT SEE, SAID FIRST, because a benchmark that overclaims is worse
// than none. It measures the cost of BUILDING the SVG — the item builders plus `sketch()` — for a
// Room Zoom plate, in node, against the same plate untreated. It does NOT measure the browser's
// rasterisation of the resulting elements, which is the other half of a repaint and needs a live
// page. What it CAN say about that half is the element count, which is what rasterisation scales
// with, and it reports it.
//
// THE CADENCE IT MEASURES AGAINST. `roomzoom-view` rebuilds its plate on a wire frame, and the sim
// runs at 10 Hz — so the frame budget for a full plate rebuild is 100 ms, and the interactive budget
// people actually feel is 16 ms. Both are printed beside the number.
//
// ⭐ AND THE MEMOISATION QUESTION IS ANSWERED HERE RATHER THAN ASSUMED. `item()` is a pure function
// of (itemId, w, h, state) once the treatment is seeded by the PIECE and not by the placement — so
// its output IS cacheable, and the only thing that varies per placement is the `idPrefix` inside
// `id="…"` / `url(#…)`. The bench measures the win a cache would buy before anyone builds one.
//
// USAGE
//   node client/tools/sketch-repaint-bench.mjs [--reps 40]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  roomScene, scenePlacement, roomCutawaySvg, roomHatchDef, roomTitleSvg, roomDimensionsSvg,
  roomDoorsSvg, roomTileRect, M_PER_TILE,
} from '../src/ui/room-model.js';
import { standItem, pawnParts } from '../src/ui/roomzoom-view.js';
import { ROOM_SCALE } from '../src/ui/room-model.js';
import { buildTileItem } from '../src/items/wear.js';
import { roomBox } from '../src/items/fittings.js';
import { decksView } from '../src/ui/decks-model.js';
import { decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { SKETCH_LEVEL } from '../src/items/helpers.js';
import { GROUND_CLASS, DOUBLE_CLASS } from '../src/render/sketch.js';

// ⛔ `pawnSvg` IS GONE (main, 2026-08-05, the client-side tween): the figures moved into a persistent
// overlay `<svg>` so a repaint cannot destroy an in-flight animation, and `pawnParts` now returns
// FOOT-RELATIVE parts plus the foot point instead of one placed string. A still image has no overlay
// and no tween, so it places them itself — the same `translate` the live layer writes.
const pawnsSvg = (list, focus, sel, place) => pawnParts(list, focus, sel, place)
  .map((p) => `<g transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})">${p.html}</g>`).join('');


const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? +process.argv[i + 1] : d; };
const REPS = arg('reps', 40);

const FIX = JSON.parse(readFileSync(join(here, '../test/fixtures/decks-wreck.json'), 'utf8'));
const view = decksView(decodeDecks(FIX.decks), decodeRooms(FIX.rooms));
const FOCUS = roomTileRect(view, 'cryobay');

/** A furnished room — the shot tool's own set, so the two instruments describe one scene. */
const FITTINGS = [
  ['dining-table', 4, 4], ['bunk-bed', 1, 1], ['locker', 10, 6],
  ['capsule-sealed', 7, 2], ['cell-sound', 2, 6], ['chair', 6, 5], ['stool', 3, 4],
];
const CREW = [
  { cid: 627, role: 'damage control', name: 'Ada Ozawa', task: 'Hauling parts', x: FOCUS.rx + 5, y: FOCUS.ry + 2 },
  { cid: 913, role: 'hydroponics', name: 'Jun Okonjo', task: '', x: FOCUS.rx + 8, y: FOCUS.ry + 4 },
];

function plate(sketched) {
  const scene = roomScene(FOCUS);
  const TILE_PX = scene.s * 100 * M_PER_TILE;
  const place = scenePlacement(scene, FOCUS, TILE_PX);
  const inRoom = (dx, dy) => dx < FOCUS.rw && dy < FOCUS.rh;
  const doors = [
    { tx: FOCUS.rx, ty: FOCUS.ry + Math.min(3, FOCUS.rh - 1), side: 'left', label: '‹ 12 · ENGINEERING SPACES' },
    { tx: FOCUS.rx + FOCUS.rw - 1, ty: FOCUS.ry + Math.min(4, FOCUS.rh - 1), side: 'right', label: '2 · ROOM A1 ›' },
  ];
  const crew = CREW.filter((c) => inRoom(c.x - FOCUS.rx, c.y - FOCUS.ry));
  // `standItem` forwards its opts to the builder; `sketch: false` is the raw-fragment door.
  // ⛔ THE OPTS BAG IS THE **8th** ARGUMENT, BEHIND `facing`, AND GETTING THAT WRONG IS SILENT.
  // `lane/pawn-tween` put `facing` 7th; passing `{ sketch: false }` there hands an object where a
  // 0..3 is read, the opts bag never reaches the builder, and the "raw" column below is quietly the
  // TREATED plate measured against itself — a bench that reports ×1.00 and no cost. `assertRawIsRaw`
  // at the bottom is the byte check that says it did not happen this run.
  const art = FITTINGS.filter(([, dx, dy]) => inRoom(dx, dy)).map(([id, dx, dy]) => standItem(
    id, FOCUS.rx + dx, FOCUS.ry + dy, place, `rm-${id}-${dx}-${dy}`, undefined, 0, { sketch: sketched },
  )).join('');
  return roomHatchDef()
    + roomTitleSvg(scene, {
      slotIndex: FOCUS.slotIndex, roomName: FOCUS.displayName, areaM2: scene.areaM2,
      placed: FITTINGS.length, pending: 0, here: crew.length, aboard: 3,
    })
    + roomCutawaySvg(scene, {}) + roomDoorsSvg(scene, FOCUS, doors) + art
    + pawnsSvg(crew, FOCUS, 627, place) + roomDimensionsSvg(scene);
}

function timed(fn, reps) {
  fn(); fn();                                    // warm the JIT; a first call measures the compiler
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i += 1) fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / reps;
}

const treated = plate(true);
const raw = plate(false);
const els = (s) => (s.match(/<(path|rect|ellipse|circle|line|text)\b/g) || []).length;

// ⛔ THE RAW COLUMN IS VERIFIED IN BYTES BEFORE ANY NUMBER IS PRINTED. Every number this tool
// reports is a RATIO against `raw`, so a `raw` that is secretly treated turns the whole page into
// "the treatment costs nothing" — the loudest wrong answer available here, and it reads exactly like
// a green run. Two marks only the treatment writes are the witness, checked in both directions so a
// scan that finds nothing and a scan that cannot find anything do not look alike.
function assertRawIsRaw() {
  const g = (s) => (s.match(new RegExp(GROUND_CLASS, 'g')) || []).length;
  const d = (s) => (s.match(new RegExp(DOUBLE_CLASS, 'g')) || []).length;
  if (g(raw) !== 0 || d(raw) !== 0) {
    throw new Error(`the RAW plate carries ${g(raw)} ground rules and ${d(raw)} doubled passes — it `
      + 'is the TREATED plate. `{ sketch: false }` is not reaching the builder: check that the opts '
      + 'bag is `standItem`\'s 8th argument, behind `facing`.');
  }
  if (g(treated) === 0 || d(treated) === 0) {
    throw new Error('the TREATED plate carries no ground rule and no doubled pass — the treatment is '
      + 'not applied, so the check above passes vacuously and every ratio below is 1.00.');
  }
}
assertRawIsRaw();

const tTreated = timed(() => plate(true), REPS);
const tRaw = timed(() => plate(false), REPS);
const scene0 = roomScene(FOCUS);
const place0 = scenePlacement(scene0, FOCUS, scene0.s * 100 * M_PER_TILE);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MEMO, MEASURED RATHER THAN PROPOSED
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// `item()` is a pure function of (itemId, w, h, state) — the treatment is seeded by the PIECE, not
// by the placement — so a fragment is cacheable. The one thing that varies per placement is the
// `idPrefix` baked into every `id="…"` and `url(#…)`, so a cache hit is one string substitution.
// This measures that, including the substitution, so nobody adopts a cache on a hunch.
//
// ⚠️ AND THE KEY CARRIES THE **FACING**, WHICH IS THE MERGE'S OWN ADDITION AND NOT DECORATION. Since
// `lane/pawn-tween`, a fitting's drawing is a function of its facing as well — `roomBox` and the
// builder both turn on it — so a cache keyed on `(itemId, side)` alone would serve a turned bench
// its unturned drawing, at the unturned SIZE, with nothing to see but a picture that is wrong. If
// this memo is ever promoted out of this tool, that third term comes with it.
const memo = new Map();
const CANON = 'MEMO';
function memoItem(id, side, idPrefix, facing) {
  const k = `${id}|${side}|${facing}`;
  let hit = memo.get(k);
  if (hit === undefined) {
    hit = buildTileItem(id, { w: side, h: side, idPrefix: CANON, facing }, undefined);
    memo.set(k, hit);
  }
  return hit.split(CANON).join(idPrefix);
}

function memoPlate() {
  const scene = roomScene(FOCUS);
  const TILE_PX = scene.s * 100 * M_PER_TILE;
  const place = scenePlacement(scene, FOCUS, TILE_PX);
  const art = FITTINGS.map(([id, dx, dy]) => {
    const rb = roomBox(id, ROOM_SCALE, 0);
    const side = rb ? rb.side : ROOM_SCALE * 100 * M_PER_TILE * 1.15;
    const [px, py] = place.front(FOCUS.rx + dx, FOCUS.ry + dy);
    const g = memoItem(id, side, `rm-${id}-${dx}-${dy}`, 0);
    const ox = rb ? px + rb.dx : px;
    const oy = rb ? py + rb.dy : py;
    return `<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)})">${g}</g>`;
  }).join('');
  return art;
}

const tArtTreated = timed(() => FITTINGS.map(([id, dx, dy]) => standItem(
  id, FOCUS.rx + dx, FOCUS.ry + dy, place0, `rm-${id}-${dx}-${dy}`, undefined, 0,
)).join(''), REPS);
memoPlate();
const tArtMemo = timed(memoPlate, REPS);

process.stdout.write([
  `level                 ${SKETCH_LEVEL}`,
  `plate                 wreck cryo bay, ${FITTINGS.length} fittings + ${CREW.length} crew`,
  `elements  raw         ${els(raw)}`,
  `elements  treated     ${els(treated)}   (×${(els(treated) / els(raw)).toFixed(2)})`,
  `bytes     raw         ${raw.length}`,
  `bytes     treated     ${treated.length}   (×${(treated.length / raw.length).toFixed(2)})`,
  `build ms  raw         ${tRaw.toFixed(3)}`,
  `build ms  treated     ${tTreated.toFixed(3)}   (×${(tTreated / tRaw).toFixed(2)}, +${(tTreated - tRaw).toFixed(3)} ms)`,
  `budget                16 ms interactive / 100 ms per 10 Hz wire frame`,
  `verdict               ${tTreated < 16 ? 'inside the interactive budget' : 'OVER the interactive budget'}`,
  '',
  `furniture ms treated  ${tArtTreated.toFixed(3)}   (the ${FITTINGS.length} fittings alone)`,
  `furniture ms memoised ${tArtMemo.toFixed(3)}   (×${(tArtMemo / tArtTreated).toFixed(2)} — a cache keyed`
  + ' on (itemId, side), one string substitution per hit)',
  '',
].join('\n'));
