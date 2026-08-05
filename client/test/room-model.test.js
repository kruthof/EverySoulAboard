// Tests for the PURE Room-Zoom view-model (client/src/ui/room-model.js) + the shared deck-minimap
// (client/src/ui/deck-minimap.js). Proves: the focused-room tile-rect lookup, the
// fit transform + responsive click hit-testing (incl. letterbox-margin + out-of-room rejection),
// the in-room channel clamps (cells → items, crew, designs, decor), the palette tool → command-class
// map (exhaustive over all eighteen tools), the demolish classifier + its precedence over every layer,
// the armed-tool reducer, the local decor transforms, and the ESC rung.
//
// ⚠️ THE LAST SECTION IS DIFFERENT, and the "no DOM" line that used to open this file is no longer
// true of the whole of it. Console-retirement WP-4 put the two ORDER verbs (DIG / STRIP) on this
// surface, and the thing that can go wrong there is a LOWERING — which payload leaves the client —
// so that section instantiates the real `roomzoom-view.js` controller over `client/test/dom-lite.js`
// and asserts on the commands it sends. It sets `globalThis.document` / `globalThis.window` at the
// point of use, after every pure test above has been declared. Everything before it is unchanged and
// still pins no DOM id or class.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
// VR-P3 — the ONE derivation of how a centimetre-specified fitting lands on a surface at that
// surface's centimetre rule. Imported rather than re-derived: a second copy of the drawing scale is
// the defect `fittings.frameFor` exists to prevent.
import { roomBox } from '../src/items/fittings.js';
import {
  U, ROOM_TOOLS, TOOL_LABEL, paletteCommand, isStructuralTool, isOrderTool, isEraseTool, isSweepTool,
  roomDragMode, ERASE_PRECEDENCE, tileOrders, eraseTarget, roomMarkNameAt, roomTileZoned,
  roomMaterialTiles, nextRoomTool, roomTileRect, deckSlots, sceneFit, tileFromCanvasXY,
  roomScene, scenePlacement, tileFromScenePoint, tileClientBox, M_PER_TILE, ROOM_HEIGHT_M,
  roomStatLine, roomCutawaySvg, roomDoorsSvg,
  // VR-P3 REVISION — the assembly seam's own parity sources: the surface's id namespace, its
  // drawing scale, its margins, the title builder and the ground-stack layer.
  RZ_ID, ROOM_SCALE, SCENE_PAD, roomTitleSvg, itemStackSvg,
  clampTileToRoom, roomCells, roomCrew, roomDesigns, roomDecor, itemForGlyph, demolishTarget,
  addDecor, removeDecor, escStackRung, roomMarkTiles, markLayerSvg, STRUCTURE_CODE_LIST,
  zoomChrome, ZOOM_HINT_IDLE, ZOOM_HINT_ARMED,
} from '../src/ui/room-model.js';
import { ITEMS, isDeviceItem } from '../src/items/index.js';
import { GLYPH_SUBSTITUTE, GLYPH_TO_ITEM } from '../src/items/glyph-map.js';
import { dragModeForTool } from '../src/ui/build-drag-model.js';
import { ACCEPT_ALL, defaultStockFilter, STOCK_KINDS } from '../src/ui/stock-filter-model.js';
import { acceptsLabel, zoneMaskMismatch } from '../src/ui/zone-model.js';
import { APPLIES_NEXT_LABEL, mismatchLabel } from '../src/ui/accepts-row.js';
import {
  ZONE_FLAG_BACKED_OFF, MARK_KIND_NAMES, markKindName, decodeMarks,
  // VR-P3 REVISION — the ONE reason→sentence table, so the blocked-badge leg asserts the words the
  // WIRE produces rather than a copy of them (MAJOR 2).
  blockedReasonSentence,
} from '../src/wire/messages.js';
// VR-P3 REVISION — the kit's own id namespacing + its mono metric, imported so the assembly legs
// compare the mounted scene against the SHIPPED derivation and never against a literal.
import { fhId, monoTextWidth } from '../src/render/oblique.js';
// The design footprint every piece's art is normalised against (`helpers.render` scales by
// `min(w,h)/TILE`) — how the true-size leg recovers the box side the surface asked for.
import { TILE } from '../src/items/helpers.js';
import { codeOnly } from './code-only.js';
import { Cmd } from '../src/wire/session.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';
import { markVariant, markCellSvg } from '../src/ui/mark-overlay.js';
import { zoneLayerSvg } from '../src/ui/zone-overlay.js';
import { overviewScene } from '../src/ui/overview-scene.js';
import { deckPlanSvg, yahDotPos, deckMinimap } from '../src/ui/deck-minimap.js';

// A two-deck grid: deck 1 has a wood QUARTERS at slot 0 (tiles 4,6 12×8) + an empty hall; deck 2 has
// a HYDRO at slot 3. Byte-for-byte the host's `decks`/`rooms` shape (WireFormat.cs).
const DECKS_JSON =
  '{"type":"decks","decks":[' +
  '{"deck":1,"slots":[[0,4,6,12,8,"quarters",5,true,true],[1,34,6,12,8,"",0,false,true]]},' +
  '{"deck":2,"slots":[[3,10,4,10,6,"hydro",7,true,true]]}]}';
const ROOMS_JSON =
  '{"type":"rooms","rooms":[["quarters",1,0.209,512,101.3,293,96],["hydro",2,0.188,900,58.1,288.4,60]]}';

const view = decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON)));

// ---- roomTileRect / deckSlots ----

test('roomTileRect finds a room by anchor and reports its geometry + client-derived name', () => {
  const f = roomTileRect(view, 'quarters');
  assert.deepEqual(
    { anchor: f.anchor, deck: f.deck, slotIndex: f.slotIndex, rx: f.rx, ry: f.ry, rw: f.rw, rh: f.rh, name: f.displayName },
    { anchor: 'quarters', deck: 1, slotIndex: 0, rx: 4, ry: 6, rw: 12, rh: 8, name: 'QUARTERS' },
  );
  const h = roomTileRect(view, 'hydro');
  assert.equal(h.deck, 2);
  assert.equal(h.displayName, 'HYDROPONICS');
});

test('roomTileRect returns null for a vanished / blank / hall anchor (IX-Z-51)', () => {
  assert.equal(roomTileRect(view, 'gone'), null);
  assert.equal(roomTileRect(view, ''), null);
  assert.equal(roomTileRect(null, 'quarters'), null);
});

test('deckSlots returns a deck\'s slots (for the minimap) or []', () => {
  assert.equal(deckSlots(view, 1).length, 2);
  assert.equal(deckSlots(view, 2).length, 1);
  assert.deepEqual(deckSlots(view, 9), []);
});

// ---- THE CUTAWAY: the scene, the fit and the INVERSE that resolves a click ----
//
// ⚠️ EVERY NUMBER IN THIS SECTION MOVED AT VR-P3, AND NONE OF THEM WAS LOOSENED. The surface used to
// be a PLAN — a `rw*U × rh*U` box fitted into the canvas — so a click inverted ONE transform and the
// pins were `s=2, offY=128`. It is the design's cabinet-oblique CUTAWAY now, so a click inverts TWO
// (the viewBox fit, then the oblique on the floor plane) and the pins are the projection's own. They
// are DERIVED here rather than copied: a literal `{x:10,y:10}` would pass just as happily against a
// broken inverse, so every leg below goes through the FORWARD projection and asks the inverse to
// come back — which is the property that matters and the only one that cannot be faked.

const room = { rx: 4, ry: 6, rw: 12, rh: 8, deck: 1 }; // 12×8 tiles → 12.0 × 8.0 m of floor

test('the metre mapping is ONE TILE = ONE METRE, and the ceiling is the design\'s 2.4 m', () => {
  assert.equal(M_PER_TILE, 1, 'the tile→metre mapping moved; every fitting in every room is now '
    + 'drawn at the wrong size against its own centimetre spec');
  assert.equal(ROOM_HEIGHT_M, 2.4);
  const scene = roomScene(room);
  assert.equal(scene.wM, 12);
  assert.equal(scene.dM, 8);
  assert.equal(scene.hM, 2.4);
  assert.equal(scene.areaM2, 96, 'the stat line\'s area clause is derived from this');
  // The scene is BIGGER than the room it holds — margins for the title band, the dimension arrows
  // and their halo labels. A viewBox equal to the room's own extent clips all three away.
  assert.ok(scene.viewBox.w > scene.s * scene.wM * 100, 'the viewBox has no horizontal margin');
  assert.ok(scene.viewBox.h > scene.s * scene.hM * 100, 'the viewBox has no vertical margin');
});

test('sceneFit is `xMidYMid meet` — ONE scale, centred on both axes', () => {
  const scene = roomScene(room);
  const vb = scene.viewBox;
  // A viewport twice the viewBox's width and four times its height is HEIGHT-bound at neither: meet
  // takes the SMALLER scale, so it is width-bound at 2 and letterboxes vertically.
  const fit = sceneFit(scene, vb.w * 2, vb.h * 4);
  assert.equal(fit.s, 2);
  assert.equal(fit.offX, 0);
  assert.equal(fit.offY, (vb.h * 4 - vb.h * 2) / 2);
  // …and a degenerate box answers a zero scale rather than an Infinity that poisons every coordinate.
  assert.equal(sceneFit(scene, 0, 0).s, 0);
});

test('THE INVERSE ROUND-TRIPS: every tile\'s own floor centre resolves back to that tile', () => {
  const scene = roomScene(room);
  const place = scenePlacement(scene, room);
  const bad = [];
  for (let ty = room.ry; ty < room.ry + room.rh; ty += 1) {
    for (let tx = room.rx; tx < room.rx + room.rw; tx += 1) {
      const [px, py] = place.foot(tx, ty);
      const back = tileFromScenePoint(px, py, scene, room);
      if (!back || back.x !== tx || back.y !== ty) {
        bad.push(`${tx},${ty} → ${back ? back.x + ',' + back.y : 'null'}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'the projection and its inverse disagree about these tiles:\n  '
    + bad.join('\n  '));
  // NON-VACUITY, an INCLUSION test: the sweep must actually distinguish tiles rather than answering
  // the same one 96 times.
  const seen = new Set();
  for (let ty = room.ry; ty < room.ry + room.rh; ty += 1) {
    for (let tx = room.rx; tx < room.rx + room.rw; tx += 1) {
      const [px, py] = place.foot(tx, ty);
      const b = tileFromScenePoint(px, py, scene, room);
      seen.add(b.x + ',' + b.y);
    }
  }
  assert.equal(seen.size, room.rw * room.rh, 'the inverse collapses distinct tiles onto one another');
});

test('THE INVERSE IS THE **OBLIQUE**, not a plan: depth SHEARS the answer', () => {
  const scene = roomScene(room);
  const place = scenePlacement(scene, room);
  // Two tiles in the same COLUMN, one metre apart in depth. In a plan view they share an x; in the
  // cabinet oblique the deeper one is displaced right by 0.4·s·100 and up by 0.6·s·100.
  const near = place.foot(room.rx, room.ry);
  const far = place.foot(room.rx, room.ry + 1);
  assert.ok(Math.abs((far[0] - near[0]) - 0.4 * scene.s * 100) < 0.02,
    'the depth step does not carry the oblique\'s +0.4 x term — this is a plan view wearing a '
    + 'cutaway\'s name');
  assert.ok(Math.abs((far[1] - near[1]) + 0.6 * scene.s * 100) < 0.02,
    'the depth step does not carry the oblique\'s −0.6 y term');
  // …and the inverse un-shears it: the FAR tile's centre must not resolve to the near one.
  assert.deepEqual(tileFromScenePoint(far[0], far[1], scene, room), { x: room.rx, y: room.ry + 1 });
  // MUTATION: drop the `0.4·s·y` term from `tileFromScenePoint` ⇒ this leg goes red, because the
  // shear is exactly what an un-projected click would ignore.
  const unprojected = (sx, sy) => {
    // what a plan-view inverse would answer for the same point: x straight off the scale
    const xCm = (sx - scene.frame.x0) / scene.s;
    return Math.floor(xCm / 100) + room.rx;
  };
  assert.notEqual(unprojected(far[0], far[1]), room.rx,
    'a plan-view inverse happens to agree here, so this test could not tell the two apart');
});

test('tileFromCanvasXY inverts BOTH transforms — the viewBox fit and the oblique', () => {
  const scene = roomScene(room);
  const place = scenePlacement(scene, room);
  const vb = scene.viewBox;
  const rect = { left: 17, top: 23, width: vb.w * 2, height: vb.h * 4 }; // s=2, letterboxed, offset
  const fit = sceneFit(scene, rect.width, rect.height);
  const client = (tx, ty) => {
    const [px, py] = place.foot(tx, ty);
    return [rect.left + fit.offX + px * fit.s, rect.top + fit.offY + py * fit.s];
  };
  assert.deepEqual(tileFromCanvasXY(...client(room.rx, room.ry), rect, room), { x: 4, y: 6 });
  assert.deepEqual(tileFromCanvasXY(...client(room.rx + 6, room.ry + 4), rect, room), { x: 10, y: 10 });
  assert.deepEqual(tileFromCanvasXY(...client(room.rx + 11, room.ry + 7), rect, room), { x: 15, y: 13 });
});

test('tileFromCanvasXY rejects the margin and everything outside the room (IX-Z-11)', () => {
  const scene = roomScene(room);
  const vb = scene.viewBox;
  const rect = { left: 0, top: 0, width: vb.w, height: vb.h }; // s=1, no letterbox
  // The four scene margins: the title band above, the dimension arrow below, and both sides.
  assert.equal(tileFromCanvasXY(vb.w / 2, 4, rect, room), null);         // the title band
  assert.equal(tileFromCanvasXY(vb.w / 2, vb.h - 4, rect, room), null);  // under the floor edge
  assert.equal(tileFromCanvasXY(2, vb.h / 2, rect, room), null);         // left of the left wall
  assert.equal(tileFromCanvasXY(vb.w - 2, vb.h / 2, rect, room), null);  // right of the cut edge
  assert.equal(tileFromCanvasXY(10, 10, { left: 0, top: 0, width: 0, height: 0 }, room), null);
  assert.equal(tileFromCanvasXY(10, 10, rect, null), null);
});

test('tileClientBox brackets a tile\'s projected quad, in the SAME fit the click inverts', () => {
  const scene = roomScene(room);
  const place = scenePlacement(scene, room);
  const vb = scene.viewBox;
  const rect = { left: 0, top: 0, width: vb.w, height: vb.h };
  const box = tileClientBox(room.rx + 3, room.ry + 3, rect, room);
  assert.ok(box && box.width > 0 && box.height > 0);
  const c = place.corners(room.rx + 3, room.ry + 3);
  for (const pt of [c.nearLeft, c.nearRight, c.farLeft, c.farRight]) {
    assert.ok(pt[0] >= box.left - 0.01 && pt[0] <= box.left + box.width + 0.01
      && pt[1] >= box.top - 0.01 && pt[1] <= box.top + box.height + 0.01,
    'a corner of the tile\'s parallelogram falls outside the pulse box that is supposed to bracket it');
  }
  // A parallelogram is WIDER than one tile's front edge: the box is the bracket, not the quad.
  assert.ok(box.width > scene.s * 100 * 0.99, 'the pulse box is narrower than the tile itself');
  assert.equal(tileClientBox(room.rx, room.ry, { left: 0, top: 0, width: 0, height: 0 }, room), null);
});

test('scenePlacement: floor paint is SHEARED into the plane, a standing thing is UPRIGHT', () => {
  const scene = roomScene(room);
  const place = scenePlacement(scene, room, 32);
  const m = place.cell(room.rx, room.ry);
  assert.match(m, /^matrix\(/, 'the floor-plane placement is not a matrix — a translate cannot '
    + 'shear a cell onto a projected parallelogram');
  const [a, b, c, d] = m.slice(7, -1).split(' ').map(Number);
  // The unit cell's X axis maps to the tile's near edge: pure horizontal, one tile wide.
  assert.ok(Math.abs(a * 32 - scene.s * 100) < 0.5 && Math.abs(b) < 0.5,
    'the cell\'s x axis is not the tile\'s front edge');
  // …and its Y axis maps to the DEPTH direction, which has BOTH components — that is the shear.
  assert.ok(Math.abs(c * 32 - 0.4 * scene.s * 100) < 0.5 && Math.abs(d * 32 + 0.6 * scene.s * 100) < 0.5,
    'the cell\'s y axis is not the oblique\'s depth vector — the layer is being laid out flat');
  // A STANDING thing gets a plain translate: sheared, mirrored type is unreadable, which is the one
  // failure mode a count badge and a name plate cannot have.
  assert.match(place.stand(room.rx, room.ry), /^translate\(/);
});

test('clampTileToRoom is the half-open rect test', () => {
  assert.equal(clampTileToRoom(4, 6, room), true);
  assert.equal(clampTileToRoom(15, 13, room), true);  // last in-room tile (4+12-1, 6+8-1)
  assert.equal(clampTileToRoom(16, 6, room), false);  // one past the right edge
  assert.equal(clampTileToRoom(3, 6, room), false);
});

// ---- palette command map (exhaustive) ----

test('paletteCommand maps every one of the twenty-one tools to a class + verb', () => {
  const byTool = Object.fromEntries(ROOM_TOOLS.map((t) => [t, paletteCommand(t)]));
  // 15 → 16 with the OPERATE verb (2026-07-28): the door/vent OPEN⇄SHUT toggle, which existed in the
  // sim since M1 and was reachable ONLY through the deprecated console's invisible inspection cursor.
  // 16 → 17 with ERASE (M1-C, 2026-07-28): the UN-designate verb. `on:false` has ridden the wire and
  // the TUI has sent it since E0-5; no surface in `client/` did, so one STRIP drag across the cryo
  // bay condemned eight capsules with no gesture anywhere to take it back.
  // 17 → 18 with MOVE (M1-K, 2026-07-29): the "go here" order for the SELECTED crew member, and the
  // FIRST tool on this palette whose subject is a person rather than a tile. The owner's report was
  // *"in zoom mode we have no control over the pawn"* — `MoveCitizenCommand` was issuable from the
  // Overview and from the deprecated console, and from nowhere inside a room.
  // ⛔ ⭐ 18 → 17 with OPERATE DELETED (M3-15 / OD-N, 2026-07-31), and it is THE FIRST TIME THIS
  // NUMBER HAS GONE DOWN. The owner's ruling is that doors and vents are opened through MOSS and MOSS
  // alone, once a MOSS server has been repaired — so the one-click toggle is not moved, re-worded or
  // gated on this surface, it is REMOVED, and the ring + OPEN/SHUT plate that advertised it with it.
  //
  // ⚠️ THIS NUMBER IS PINNED BY EQUALITY AND MOVING IT IS A SURFACE DECISION, not a chore: the
  // palette is the whole vocabulary of what a player may do inside a room, and a tool arriving
  // without anyone deciding is exactly what the equality pin is here to stop. Move it in the same
  // commit as the tool, with the reason in the commit message.
  // ⭐ 17 → 18, M3-10: HEATER. The decision, stated here because the pin above demands it be stated
  // somewhere a reader will find: the palette gains its first piece of SHIP PLANT (every other
  // `place` row is crew furniture or a lamp), because a heater the player cannot place is a def row
  // and the compartment the ship freezes stays unworkable forever. It is the ONE tool this package
  // adds; nothing was removed and nothing moved position.
  // ⭐⭐ 18 → 21, 2026-08-04: GROWBED, MEDBED and TABLE. The decision, stated here because the pin
  // demands it be stated somewhere a reader will find — and this one is a decision about a GAP
  // rather than about a new mechanic. `GameSession.TryFurnitureKind` has switched on all three
  // strings, and `PlaceDeviceCommand.IsPlaceableFurniture` has whitelisted all three DeviceKinds,
  // since before HEATER existed; the host's own comment beside those cases says they are "wire-
  // reachable but have no palette button", which is the same sentence as "the player does not have
  // this verb". The registry has drawn all three since the warm set (`hydroponics`, `med-bed`,
  // `dining-table`). So nothing below the client was built for this package: it is three rows.
  // ⚠️ THE COUNT IS THE LAYOUT RISK, not the vocabulary risk. The palette WRAPS, and this is its
  // largest single widening. `client/tools/palette-shot.mjs` measured 21/21 reachable, 0 clipped, at
  // all six widths 1600→900 — that measurement, not this pin, is the evidence (no node test can see
  // a layout engine; the file header of `palette-layout.test.js` argues why at length).
  assert.equal(ROOM_TOOLS.length, 21);
  for (const t of ['growbed', 'medbed', 'table'])
    assert.ok(ROOM_TOOLS.includes(t),
      `ROOM_TOOLS lost ${t.toUpperCase()}. The sim accepts it (IsPlaceableFurniture) and the host ` +
      'parses it (TryFurnitureKind), so removing the button does not remove the verb — it only ' +
      'takes it back off the player and returns it to the wire, which is where it was stuck.');
  assert.ok(ROOM_TOOLS.includes('heater'),
    'ROOM_TOOLS lost HEATER. It is the only way a player can place the one device in the game that '
    + 'raises a compartment above needs.def hypothermia_c — without it M3-10 ships authoring-only.');
  assert.ok(!ROOM_TOOLS.includes('operate'),
    'ROOM_TOOLS still carries `operate`. OD-N removed the palette verb entirely — see ' +
    'client/test/surface-boundary.test.js for the anti-resurrection guard.');
  assert.deepEqual(byTool.wall, { cls: 'structural', verb: 'build', kind: 'wall' });
  assert.deepEqual(byTool.floor, { cls: 'structural', verb: 'build', kind: 'floor' });
  assert.deepEqual(byTool.door, { cls: 'structural', verb: 'build', kind: 'door' });
  for (const [t, dk] of [['bunk', 'Bed'], ['desk', 'Desk'], ['chair', 'Chair'], ['locker', 'Locker'], ['plant', 'PlantPot'], ['lamp', 'Light'], ['heater', 'Heater'], ['growbed', 'GrowBed'], ['medbed', 'MedBed'], ['table', 'Table']]) {
    assert.equal(byTool[t].cls, 'functional');
    assert.equal(byTool[t].verb, 'place');
    assert.equal(byTool[t].deviceKind, dk);
  }
  assert.deepEqual(byTool.rug, { cls: 'cosmetic', verb: 'decor', itemId: 'rug' });
  assert.deepEqual(byTool.shelf, { cls: 'cosmetic', verb: 'decor', itemId: 'bookshelf' });
  assert.deepEqual(byTool.demolish, { cls: 'demolish', verb: null });
  // The THREE ORDER verbs. `verb` is the WIRE verb name, not 'build': an order is a designation, and
  // routing it through Cmd.build would hand it to BuildSystem (controls.js:52-58). STOCKPILE joined
  // dig/strip when the altitude rule was corrected — its extent IS its capacity (one stack per zoned
  // tile), and this is the only surface that can drag an extent.
  assert.deepEqual(byTool.dig, { cls: 'order', verb: 'dig' });
  assert.deepEqual(byTool.stockpile, { cls: 'order', verb: 'stockpile' });
  assert.deepEqual(byTool.strip, { cls: 'order', verb: 'strip' });
  // ⛔ OPERATE had its OWN class and is gone (M3-15 / OD-N). `paletteCommand` must now answer the
  // no-such-tool row for it — the same answer it gives 'nope' — because a surviving row would be a
  // tool the palette does not render but every other consumer still believes in.
  assert.deepEqual(paletteCommand('operate'), { cls: 'none', verb: null });
  // ERASE is its OWN class too, and its `verb` is NULL — the one row in the table that names no wire
  // verb, because which verb an erase click sends is a property of the TILE (`eraseTarget`) and not
  // of the tool. A reviewer reading `verb: null` should read it as "ask the tile", not as "unwired".
  assert.deepEqual(byTool.erase, { cls: 'erase', verb: null });
  // MOVE is its OWN class too (M1-K). Not `order` — it paints no designation and reaches no job
  // board; not the (now deleted) `operate` — that verb targeted a device standing on the tile and
  // refused an empty one, where MOVE wants an empty one; and NOT SWEPT, which the `isSweepTool` false-list below pins,
  // because a drag would emit one move order per tile of which only the last could survive. It is
  // the only row whose precondition lives outside the room: the SELECTION, which is host state.
  assert.deepEqual(byTool.move, { cls: 'move', verb: 'move' });
  assert.ok(ROOM_TOOLS.includes('stockpile'),
    'ROOM_TOOLS lost STOCKPILE. It is not on the Overview either (overview-model.js ORDER_TOOLS), ' +
    'so the verb would be unreachable on the whole standard surface — surface-boundary.test.js ' +
    'would then need a KNOWN_GAPS entry, and the ledger is asserted EMPTY.');
  assert.deepEqual(paletteCommand('nope'), { cls: 'none', verb: null });
  // isStructuralTool: wall/floor/door drag-build; everything else false — INCLUDING the two order
  // tools, which sweep but carry no material and never reach the material strip.
  for (const t of ['wall', 'floor', 'door']) assert.equal(isStructuralTool(t), true);
  for (const t of ['bunk', 'rug', 'demolish', 'dig', 'stockpile', 'strip', 'erase', 'operate', 'move', null, 'nope']) assert.equal(isStructuralTool(t), false);
  // isOrderTool / isEraseTool / isSweepTool: the sibling sets the three gesture sites gate on.
  // ERASE IS NOT AN ORDER AND IS A SWEEP, and both halves are asserted: classing it `order` would
  // route it through `orderPayloads` (whose contract is byte-identity with `paletteOrders`), and
  // dropping it from `isSweepTool` would make it click-only — mutation 4's subject.
  for (const t of ['dig', 'stockpile', 'strip']) assert.equal(isOrderTool(t), true);
  for (const t of ['wall', 'floor', 'door', 'bunk', 'rug', 'demolish', 'erase', 'operate', 'move', null, 'nope']) assert.equal(isOrderTool(t), false);
  assert.equal(isEraseTool('erase'), true);
  for (const t of ['wall', 'floor', 'door', 'bunk', 'rug', 'demolish', 'dig', 'stockpile', 'strip', 'operate', 'move', null, 'nope']) assert.equal(isEraseTool(t), false);
  for (const t of ['wall', 'floor', 'door', 'dig', 'stockpile', 'strip', 'erase']) assert.equal(isSweepTool(t), true);
  for (const t of ['bunk', 'desk', 'chair', 'locker', 'shelf', 'lamp', 'rug', 'plant', 'heater',
    'growbed', 'medbed', 'table', 'demolish', 'operate', 'move', null, 'nope']) {
    assert.equal(isSweepTool(t), false);
  }
  // Every tool the palette renders has a label — a missing one paints an empty button.
  for (const t of ROOM_TOOLS) assert.ok(TOOL_LABEL[t], `no TOOL_LABEL for '${t}'`);
});

// MUTATION: `roomDragMode` returning `dragModeForTool(tool)` unconditionally ⇒ dig/strip sweep
// 'single' and a drag across a wreck designates ONE tile ⇒ the driven sweep tests below go red too.
test('WP-4: roomDragMode sweeps an ORDER tool as a FILLED region, and defers otherwise', () => {
  assert.equal(roomDragMode('dig'), 'fill');
  assert.equal(roomDragMode('strip'), 'fill');
  // For STOCKPILE `fill` is the MECHANIC, not a taste: `JobWork.IsFreeStockpileTile` is one stack per
  // zoned tile, so a 3×3 drag is 9 stacks and a `perimeter` sweep would silently deliver 8.
  assert.equal(roomDragMode('stockpile'), 'fill');
  // ERASE sweeps FILLED for the same reason DIG does — a player taking back a region of intent drags
  // over the region, not around it — and `dragModeForTool` knows nothing about it, so this is a real
  // divergence and not a pass-through. (Mutation: drop the `isEraseTool` half of `roomDragMode` ⇒
  // erase falls to `dragModeForTool('erase')` = 'single' and a drag clears ONE tile.)
  assert.equal(roomDragMode('erase'), 'fill');
  assert.notEqual(dragModeForTool('erase'), 'fill',
    'dragModeForTool now returns fill for erase on its own, so the assertion above no longer ' +
    'distinguishes roomDragMode from its delegate — re-point it');
  // Every non-order, non-erase tool is passed through to build-drag-model UNCHANGED — asserted
  // against the real function, not against re-typed literals, so a change to either side reddens.
  for (const t of [...ROOM_TOOLS.filter((x) => !isOrderTool(x) && !isEraseTool(x)), null, 'nope', 'move']) {
    assert.equal(roomDragMode(t), dragModeForTool(t), `roomDragMode drifted from dragModeForTool for '${t}'`);
  }
  assert.equal(roomDragMode('wall'), 'perimeter');   // and the pass-through really is non-trivial
  assert.equal(roomDragMode('floor'), 'fill');
  assert.equal(roomDragMode('door'), 'single');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// M1-C — THE ERASE MODEL. The precedence, the tile-facts derivation, and the two lookups.
//
// ⚠️ TWO THIRDS OF THE PRECEDENCE IS UNFIXTURABLE ON A REAL SHIP, AND THAT IS NOT A GAP IN THESE
// TESTS. The three orders have mutually exclusive preconditions in the sim: DIG needs
// `TileDefs.Debris`, STRIP needs a wall or a device, STOCKPILE needs `TileFlags.Walkable` and an
// empty tile. dig+strip and dig+stockpile therefore cannot coexist on one tile of any ship the game
// can produce; STRIP(device) + STOCKPILE can, and it is exactly the pair the ranking has to settle
// (the host ranks strip above stockpile for the SAME tile shape — `GameSession.cs` `BuildMarks`).
// These pure tests still drive all three, because `eraseTarget` is a total function over its input
// and a reviewer must be able to see the whole table; the DRIVEN precedence leg below uses the one
// pair a ship can actually present.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: reorder ERASE_PRECEDENCE to ['stockpile','strip','dig'] ⇒ RED here AND on the driven
//           precedence leg below.
test('M1-C: the erase precedence is dig ▸ strip ▸ stockpile — an ORDER outranks a ZONE', () => {
  assert.deepEqual([...ERASE_PRECEDENCE], ['dig', 'strip', 'stockpile'],
    'the erase precedence moved. It is not a preference: it is `BuildMarks`\' own ranking in ' +
    'hosts/web/GameSession.cs ("AN ORDER OUTRANKS A ZONE, AND THAT IS THE WHOLE RULE"), minus ' +
    '`debris`, which is terrain. A client that peeled in a different order would take a mark off a ' +
    'tile the player is not looking at.');
  // DEBRIS IS ABSENT ON PURPOSE — asserted, because a reader could take its absence for an omission.
  assert.ok(!ERASE_PRECEDENCE.includes('debris'),
    'debris is terrain, not an order: nothing the player did put it there, so nothing they can do ' +
    'takes it back. Erasing a debris tile must send NOTHING.');

  // ── BOTH FAILURE SHAPES, and the second is the one that can bite. ──
  // (1) ONE order on the tile: every kind resolves to itself, so a broken lookup shows up.
  assert.equal(eraseTarget({ dig: true }), 'dig');
  assert.equal(eraseTarget({ strip: true }), 'strip');
  assert.equal(eraseTarget({ stockpile: true }), 'stockpile');
  // (2) TWO orders on the tile: only here does the ORDER of the list matter at all. A fixture
  //     carrying only shape (1) would leave a reordered precedence completely invisible.
  assert.equal(eraseTarget({ strip: true, stockpile: true }), 'strip',
    'a condemned device inside a stockpile zone must give up its STRIP order first — the zone is ' +
    'the thing the player did not just ask to cancel');
  assert.equal(eraseTarget({ dig: true, stockpile: true }), 'dig');
  assert.equal(eraseTarget({ dig: true, strip: true }), 'dig');
  assert.equal(eraseTarget({ dig: true, strip: true, stockpile: true }), 'dig');
  // …and nothing at all is null, never a verb. An erase click on a bare tile must send NO command.
  assert.equal(eraseTarget({ dig: false, strip: false, stockpile: false }), null);
  assert.equal(eraseTarget({}), null);
  assert.equal(eraseTarget(null), null);
  assert.equal(eraseTarget(undefined), null);
});

// MUTATION: make `tileOrders` ignore its `zoned` argument ⇒ RED on the zoned-only legs (and on the
//           driven Room-Zoom precedence leg, whose zone comes from the `zones` channel).
// MUTATION: let `tileOrders` treat 'debris' as an order ⇒ RED on the debris leg.
test('M1-C: tileOrders reads a tile from its mark kind and its zone, and debris is NOT an order', () => {
  const none = { dig: false, strip: false, stockpile: false };
  assert.deepEqual(tileOrders('dig', false), { ...none, dig: true });
  assert.deepEqual(tileOrders('strip', false), { ...none, strip: true });
  assert.deepEqual(tileOrders('stockpile', false), { ...none, stockpile: true });
  // DEBRIS: terrain. It is a real mark kind on the wire (`MARK_KIND_NAMES[0]`), which is why it has
  // to be named here rather than falling through with the junk below.
  assert.deepEqual(tileOrders('debris', false), none);
  assert.equal(eraseTarget(tileOrders('debris', false)), null,
    'an erase click on plain rubble must send nothing — the player never ordered it there');
  // …and the mark vocabulary this reads is the wire\'s own, not a private list.
  assert.deepEqual([...MARK_KIND_NAMES].filter((n) => n !== 'debris').sort(),
    [...ERASE_PRECEDENCE].sort(),
    'the erasable kinds are no longer exactly the wire mark kinds minus debris — one side grew a ' +
    'kind the other does not know about');
  // ABSENT / MALFORMED: never an order.
  for (const m of ['', null, undefined, 'nope']) assert.deepEqual(tileOrders(m, false), none);
  // THE `zones` HALF. A zoned tile is a stockpile whatever its mark says, which is what lets the
  // Room Zoom see BOTH layers it draws; and `zoned` is strictly additive — it can never remove one.
  assert.deepEqual(tileOrders('', true), { ...none, stockpile: true });
  assert.deepEqual(tileOrders('strip', true), { ...none, strip: true, stockpile: true });
  assert.deepEqual(tileOrders('debris', true), { ...none, stockpile: true });
  // Only a strict `true` counts — a truthy row object arriving where a boolean was meant must not
  // silently zone the tile.
  for (const z of [false, undefined, null, 0, 1, 'yes', {}]) {
    assert.equal(tileOrders('', z).stockpile, z === true, `zoned=${JSON.stringify(z)} misread`);
  }
});

// MUTATION: make either lookup ignore one coordinate (return the first row) ⇒ RED.
test('M1-C: the two tile lookups are exact, per-coordinate, and empty-safe', () => {
  const marks = [{ tx: 4, ty: 6, mark: 'dig' }, { tx: 5, ty: 6, mark: 'strip' }, { tx: 4, ty: 7, mark: 'stockpile' }];
  assert.equal(roomMarkNameAt(marks, 4, 6), 'dig');
  assert.equal(roomMarkNameAt(marks, 5, 6), 'strip');   // same y, different x
  assert.equal(roomMarkNameAt(marks, 4, 7), 'stockpile'); // same x, different y
  assert.equal(roomMarkNameAt(marks, 9, 9), '');
  for (const junk of [null, undefined, 'nope', 42]) assert.equal(roomMarkNameAt(junk, 4, 6), '');

  const zones = [{ tx: 4, ty: 6 }, { tx: 7, ty: 2 }];
  assert.equal(roomTileZoned(zones, 4, 6), true);
  assert.equal(roomTileZoned(zones, 7, 2), true);
  assert.equal(roomTileZoned(zones, 4, 2), false);      // the x of one, the y of the other
  assert.equal(roomTileZoned(zones, 7, 6), false);
  for (const junk of [null, undefined, 'nope', 42]) assert.equal(roomTileZoned(junk, 4, 6), false);
});

test('the armed-tool reducer arms and disarms the three order tools like any other', () => {
  assert.equal(nextRoomTool(null, { t: 'toggle', tool: 'dig' }), 'dig');
  assert.equal(nextRoomTool('dig', { t: 'toggle', tool: 'dig' }), null);
  assert.equal(nextRoomTool(null, { t: 'toggle', tool: 'stockpile' }), 'stockpile');
  assert.equal(nextRoomTool('stockpile', { t: 'toggle', tool: 'stockpile' }), null);
  assert.equal(nextRoomTool('dig', { t: 'toggle', tool: 'stockpile' }), 'stockpile');
  assert.equal(nextRoomTool('dig', { t: 'toggle', tool: 'strip' }), 'strip');
  assert.equal(nextRoomTool('strip', { t: 'toggle', tool: 'wall' }), 'wall');
  assert.equal(nextRoomTool('strip', { t: 'clear' }), null);
});

// ---- armed-tool reducer ----

test('nextRoomTool arms, toggles off, replaces, and clears (single slot)', () => {
  assert.equal(nextRoomTool(null, { t: 'toggle', tool: 'wall' }), 'wall');
  assert.equal(nextRoomTool('wall', { t: 'toggle', tool: 'wall' }), null); // re-arm disarms
  assert.equal(nextRoomTool('wall', { t: 'toggle', tool: 'door' }), 'door'); // replace
  assert.equal(nextRoomTool('door', { t: 'clear' }), null);
  assert.equal(nextRoomTool('door', { t: 'toggle', tool: 'bogus' }), 'door'); // unknown ignored
});

// ---- channel clamps ----

function frameWith(placements, w = 24, h = 20, deck = 1) {
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i++) cells[i] = [46, 0, 0, 0]; // '.' floor
  for (const [x, y, ch] of placements) cells[y * w + x] = [ch.charCodeAt(0), 0, 0, 0];
  return { type: 'frame', deck, w, h, cells };
}

test('roomCells clamps to the room rect + deck and skins glyphs to items / unknown chips', () => {
  const frame = frameWith([[5, 7, 'b'], [6, 7, 'z'], [4, 6, '#'], [1, 1, 'b']]); // bed, unknown, wall, out-of-room bed
  const cells = roomCells(frame, room);
  const bed = cells.find((c) => c.tx === 5 && c.ty === 7);
  assert.equal(bed.itemId, 'bunk-bed');
  const unknown = cells.find((c) => c.tx === 6 && c.ty === 7);
  assert.equal(unknown.itemId, ''); // 'z' has no mapping → the dashed chip
  assert.ok(!cells.some((c) => c.tx === 4 && c.ty === 6)); // '#' is structure, not furniture
  assert.ok(!cells.some((c) => c.tx === 1 && c.ty === 1)); // outside the room rect
  // Wrong-deck frame yields nothing.
  assert.deepEqual(roomCells({ ...frame, deck: 9 }, room), []);
});

test('itemForGlyph maps device glyphs, skips floor/wall, and is empty for the unmapped', () => {
  assert.equal(itemForGlyph('D'.charCodeAt(0)), 'desk');
  assert.equal(itemForGlyph('P'.charCodeAt(0)), 'potted-plant');
  assert.equal(itemForGlyph('.'.charCodeAt(0)), '');
  assert.equal(itemForGlyph('#'.charCodeAt(0)), '');
  assert.equal(itemForGlyph('z'.charCodeAt(0)), '');
});

test('roomCrew keeps only crew on the room deck inside the rect', () => {
  const crew = [
    { cid: 1, x: 6, y: 7, deck: 1 }, // in
    { cid: 2, x: 1, y: 1, deck: 1 }, // out of rect
    { cid: 3, x: 6, y: 7, deck: 2 }, // wrong deck
  ];
  const inRoom = roomCrew(crew, room);
  assert.deepEqual(inRoom.map((c) => c.cid), [1]);
});

test('roomDesigns clamps design cells to the room + deck and decodes the ledger', () => {
  // element 6 = material (append-only); the 3rd design carries it, the others omit it → 0.
  const designs = { cells: [[5, 7, 1, 0, 0, 3, 2], [6, 8, 1, 1, 2, 2], [1, 1, 1, 0, 0, 1], [5, 7, 2, 0, 0, 1]] };
  const g = roomDesigns(designs, room);
  assert.equal(g.length, 2); // the out-of-rect and wrong-deck cells drop
  assert.deepEqual(g[0], { x: 5, y: 7, kind: 0, delivered: 0, required: 3, material: 2 });
  assert.deepEqual(g[1], { x: 6, y: 8, kind: 1, delivered: 2, required: 2, material: 0 });
});

test('roomMaterialTiles skins every in-room wall + only non-default floors', () => {
  // two walls inside the room (5,7)+(6,8), one wall out of the room (1,1); floor materials on (7,7).
  const frame = frameWith([[5, 7, '#'], [6, 8, '#'], [1, 1, '#']]);
  const materials = [
    { x: 5, y: 7, deck: 1, kind: 0, mat: 2 }, // wall gets material 2
    { x: 7, y: 7, deck: 1, kind: 1, mat: 4 }, // floor gets material 4
    { x: 9, y: 9, deck: 2, kind: 1, mat: 1 }, // wrong deck → ignored
  ];
  const tiles = roomMaterialTiles(frame, room, materials);
  const walls = tiles.filter((t) => t.kind === 'wall');
  const floors = tiles.filter((t) => t.kind === 'floor');
  assert.equal(walls.length, 2);                                     // both in-room walls, out-of-room dropped
  assert.deepEqual(walls.find((t) => t.tx === 5 && t.ty === 7), { tx: 5, ty: 7, kind: 'wall', mat: 2 });
  assert.deepEqual(walls.find((t) => t.tx === 6 && t.ty === 8), { tx: 6, ty: 8, kind: 'wall', mat: 0 }); // no channel entry → default
  assert.deepEqual(floors, [{ tx: 7, ty: 7, kind: 'floor', mat: 4 }]); // only the materialed floor
  assert.deepEqual(roomMaterialTiles(frame, { ...room, deck: 9 }, materials), []); // wrong deck → empty
});

test('roomDecor clamps decor to the room + deck', () => {
  const decor = [{ deck: 1, x: 6, y: 7, itemId: 'rug' }, { deck: 1, x: 0, y: 0, itemId: 'rug' }, { deck: 2, x: 6, y: 7, itemId: 'rug' }];
  assert.deepEqual(roomDecor(decor, room).map((d) => d.x), [6]);
});

// ---- demolish classifier + precedence ----

test('demolishTarget classifies each layer and its verb', () => {
  const frame = frameWith([[5, 7, 'b'], [4, 6, '#']]);
  const designs = [[8, 8, 1, 0, 0, 2]];
  const decor = [{ deck: 1, x: 9, y: 9, itemId: 'rug' }];
  assert.deepEqual(demolishTarget(8, 8, designs, decor, frame), { kind: 'pending', verb: 'cancel' });
  assert.deepEqual(demolishTarget(5, 7, designs, decor, frame), { kind: 'device', verb: 'remove' });
  assert.deepEqual(demolishTarget(9, 9, designs, decor, frame), { kind: 'decor', verb: 'decor-remove' });
  assert.deepEqual(demolishTarget(4, 6, designs, decor, frame), { kind: 'built-wall', verb: null });
  assert.deepEqual(demolishTarget(2, 2, designs, decor, frame), { kind: 'empty', verb: null });
});

// The device branch is a COMPLEMENT ("resolves to a piece that is not a `resource`"), so it has TWO
// halves and this pins the other one. Found as a live survivor while mutation-testing the repair:
// dropping the `_id &&` half left 799/799 green, and an UNMAPPED glyph — `''` is not a resource id —
// would then classify as a device and send `Cmd.remove` at whatever the projection happened to draw.
// MUTATION (physically applied, RED): delete `_id &&` from the predicate in room-model.js.
test('demolishTarget: a glyph NOTHING skins is empty — the complement has two halves', () => {
  const frame = frameWith([[5, 7, 'z'], [6, 7, 'b']]);
  assert.equal(itemForGlyph('z'.charCodeAt(0)), '', "'z' gained a piece — pick another unmapped glyph");
  assert.deepEqual(demolishTarget(6, 7, [], [], frame), { kind: 'device', verb: 'remove' },
    'the control device tile stopped classifying — the assertion below proves nothing');
  assert.deepEqual(demolishTarget(5, 7, [], [], frame), { kind: 'empty', verb: null },
    'a glyph no registry piece skins classified as a DEVICE. The Room Zoom would send Cmd.remove at '
    + 'a tile whose contents this client cannot even name.');
});

test('demolishTarget precedence: pending > device > decor > built (IX-Z-25)', () => {
  const frame = frameWith([[7, 7, 'b']]);                 // a device
  const designs = [[7, 7, 1, 0, 0, 1]];                   // a pending ghost on the same tile
  const decor = [{ deck: 1, x: 7, y: 7, itemId: 'rug' }]; // a rug on the same tile
  assert.equal(demolishTarget(7, 7, designs, decor, frame).kind, 'pending'); // pending wins
  assert.equal(demolishTarget(7, 7, [], decor, frame).kind, 'device');       // then device
  assert.equal(demolishTarget(7, 7, [], decor, frameWith([])).kind, 'decor'); // then decor
});

// ⚠️ A GROUND STACK IS NOT A DEVICE, and this test exists because giving ground items art nearly
// made it one. The device branch used to be `itemForGlyph(code)` truthy — a correct proxy for "a
// device stands here" only while the ONLY glyphs resolving to a piece were `Glyphs.ForDevice` ones.
// The moment `,` (Regolith) and `&` (Corpse) resolved, DEMOLISH on a spoil pile would have classified
// `device` and sent `Cmd.remove` at a tile with no device on it. The fix asks the REGISTRY what the
// piece is NOT: a `resource` row is a pile, and nothing else in the glyph table is.
//
// MUTATION (physically applied, RED): drop `!isResourceItem(_id)` back to a bare truthiness check in
// room-model.js ⇒ all three ground legs below report `device`.
test('demolishTarget: a ground stack is EMPTY, not a device — art did not make piles removable', () => {
  const piles = frameWith([[5, 7, ','], [6, 7, '&'], [7, 7, 'i'], [8, 7, 'b']]);
  // NON-VACUITY FIRST: the very same frame's DEVICE tile still classifies as one, so a blanket
  // "everything is empty" regression cannot satisfy the three legs below.
  assert.deepEqual(demolishTarget(8, 7, [], [], piles), { kind: 'device', verb: 'remove' },
    'the control device tile stopped classifying — the assertions below prove nothing');
  for (const [tx, what] of [[5, 'Regolith'], [6, 'Corpse'], [7, 'Ice']]) {
    assert.deepEqual(demolishTarget(tx, 7, [], [], piles), { kind: 'empty', verb: null },
      `DEMOLISH on a ${what} pile classified as a device and would send Cmd.remove at a tile with `
      + 'no device on it. A pile is hauled, never removed.');
  }
});

// ⚠️ THE OTHER HALF, AND IT SHIPPED BROKEN FOR ONE COMMIT: A DEVICE WEARING BORROWED ART IS STILL A
// DEVICE. The first guard against the pile-is-a-device hazard above asked `isDeviceItem(...)` — "is
// the piece skinning this glyph a `functional` registry row?" — which is a question about the ART,
// not about the tile. `GLYPH_SUBSTITUTE` exists precisely so a device can wear ANOTHER piece's art,
// and one of its six entries points at a COSMETIC row: `'*'` (DeviceKind.Light) → `wall-lamp`, because
// the warm set has no functional luminaire. So DEMOLISH on a Light classified `empty`,
// `roomzoom-view.js`'s switch hit `default: break`, and the click was dropped with no command, no
// toast and no pulse. `RoomOutfitter.Light` puts one at the centre of EVERY room on `--ship grid` and
// `Light` is a placeable furniture kind with its own palette tool — so it was "the player builds a
// lamp and then cannot remove it", live, on the one standard surface.
//
// NOTHING PINNED EITHER BEHAVIOUR: the regression AND its fix were both invisible to a 796-green
// suite. This is that pin, and it is written over the WHOLE ledger rather than the one glyph, so the
// next substitution chosen from the cosmetic shelf is covered by existing.
//
// MUTATIONS (all physically applied, all semantic REDs, none a crash — the `isDeviceItem` ones
// restore the import in the same edit, or they would die on a ReferenceError and prove nothing):
//   • `!isResourceItem(_id)` → `isDeviceItem(_id)` (the shipped defect) ⇒ RED here.
//   • `!isResourceItem(_id)` → bare `_id` (`main`'s predicate) ⇒ RED on the pile test above.
//   • the same, plus a SECOND cosmetic substitution (`C: 'wall-lamp'`) ⇒ RED here.
// AND EACH LEG WAS BLINDED AND REQUIRED TO FIRE ALONE (`assert` throws, so only the first leg of a
// test ever reports): with the named `'*'` leg replaced by a no-op the LEDGER LOOP fires by itself,
// and with the loop replaced by a no-op the `'*'` leg fires by itself. Adding the second cosmetic
// substitution on its own — without the bad predicate — is GREEN, which is the control saying the
// loop pins the PREDICATE and is not merely re-asserting `'*'` under another name.
test('demolishTarget: a device wearing BORROWED art is still a device (the Light regression)', () => {
  // THE NAMED CASE. Both premises are asserted first: if the substitution moves or `wall-lamp` stops
  // being cosmetic, this test is naming a trap that no longer exists and must say so out loud rather
  // than pass quietly.
  assert.equal(GLYPH_TO_ITEM['*'], 'wall-lamp',
    "'*' (DeviceKind.Light) no longer resolves to wall-lamp — re-point this test at whatever the "
    + 'cosmetic-substituted glyph is now, or drop it if there is none.');
  assert.equal(ITEMS['wall-lamp'].kind, 'cosmetic',
    'wall-lamp is no longer a cosmetic row, so the case below no longer exercises the trap it names');
  assert.deepEqual(demolishTarget(5, 7, [], [], frameWith([[5, 7, '*']])), { kind: 'device', verb: 'remove' },
    'DEMOLISH on a LIGHT classified as something other than a device. A Light is placeable furniture '
    + 'with its own palette tool and RoomOutfitter puts one in every room on --ship grid: this is a '
    + 'lamp the player can build and can never remove, and the click is dropped in silence.');

  // THE WHOLE LEDGER. Every key of GLYPH_SUBSTITUTE is a glyph a DEVICE puts on a tile — the
  // substitution is about the ART, never about what stands there — so every one of them must
  // classify as a device no matter what kind of row it borrows from.
  //
  // ⚠️ ONE EXCEPTION, AND IT IS NOT A WEAKENING: a glyph in `STRUCTURE_CODE_LIST` classifies
  // `built-wall` BEFORE the device branch is reached, on purpose. The door package added
  // `'X'` (DoorLocked → blast-door), and a door is exactly the thing that is a device wearing art
  // AND built structure DEMOLISH must not send `Cmd.remove` at — because that lowers to
  // `RemoveDeviceCommand`, which gates on `IsPlaceableFurniture` (`Commands.cs:566`) and excludes
  // `Door`, so the click would be a silent sim no-op. (An earlier draft of this comment said "STRIP
  // does that". It does NOT: `DeconstructSystem.cs:345` refuses doors outright. See the retraction
  // in `room-model.js` beside `STRUCTURE_CODE_LIST`.) The exception is read out of the SHIPPED set
  // rather than written down here, so widening `STRUCTURE_CODES` cannot silently excuse a glyph.
  const STRUCTURE = new Set(STRUCTURE_CODE_LIST.map((c) => String.fromCharCode(c)));
  const subs = Object.keys(GLYPH_SUBSTITUTE);
  assert.ok(subs.length >= 6, `GLYPH_SUBSTITUTE parsed as ${subs.length} entries — the loop below is vacuous`);
  let checkedDevices = 0;
  for (const g of subs) {
    const got = demolishTarget(5, 7, [], [], frameWith([[5, 7, g]]));
    if (STRUCTURE.has(g)) {
      assert.deepEqual(got, { kind: 'built-wall', verb: null },
        `the substituted STRUCTURE glyph '${g}' classified as ${got.kind}. A door is furniture the `
        + 'surfaces draw and structure DEMOLISH must not send Cmd.remove at; losing the second half '
        + 'sends a command RemoveDeviceCommand drops in silence (IsPlaceableFurniture, '
        + 'Commands.cs:566, excludes Door).');
      continue;
    }
    checkedDevices += 1;
    assert.deepEqual(got, { kind: 'device', verb: 'remove' },
      `the substituted glyph '${g}' (art: ${GLYPH_SUBSTITUTE[g]}, a `
      + `${ITEMS[GLYPH_SUBSTITUTE[g]].kind} row) does not classify as a device. A substitution means `
      + "a device wearing another piece's art; the borrowed piece's registry kind says nothing about "
      + 'the tile.');
  }
  // …and the exception did not eat the loop. Without this, moving every substitute into
  // STRUCTURE_CODES would leave the whole ledger unchecked and this test green.
  assert.ok(checkedDevices >= 5,
    `only ${checkedDevices} substituted glyphs were held to the device rule — the STRUCTURE `
    + 'exception has swallowed the loop this test exists to run.');
});

// The predicate above is a COMPLEMENT — "resolves to a piece that is not a `resource`" — so every
// future registry kind that reaches the glyph table is silently treated as a device. That is correct
// today for a reason worth pinning rather than assuming: `deriveGlyphToItem` admits only `functional`
// and `resource` rows, and the only way anything else gets in is `GLYPH_SUBSTITUTE`, which by
// construction means a device. This is the tripwire on that argument.
//
// MUTATION (physically applied, RED): let `deriveGlyphToItem` admit `cosmetic` rows and give `cos()`
// a glyph in items/index.js ⇒ this fails by name.
// ⚠️ THE PARTITION IS THREE-WAY SINCE THE DOOR PACKAGE (2026-07-27) — device · pile · STRUCTURE —
// and the title's "no third thing" is kept because the test still does that job: the third thing is
// now named and pinned rather than assumed away. `'+'` and `'X'` resolve to real door art AND are in
// `STRUCTURE_CODE_LIST`, which `demolishTarget` consults before its device branch, so they classify
// `built-wall`. That is deliberate: `Cmd.remove` lowers to `RemoveDeviceCommand`, which gates on
// `IsPlaceableFurniture` (`Commands.cs:566`) and excludes `Door`, so sending it would be a silent
// sim no-op. (An earlier draft said "a door is taken apart with STRIP" — it is NOT;
// `DeconstructSystem.cs:345` refuses doors. See the retraction beside `STRUCTURE_CODE_LIST`, and
// the "DOOR-NO-REMOVAL" open defect recorded at `roomzoom-view.js`'s `built-wall` arm.)
test('every glyph the table resolves is a device, a pile or built structure — nothing else', () => {
  const STRUCTURE = new Set(STRUCTURE_CODE_LIST.map((c) => String.fromCharCode(c)));
  const subs = new Set(Object.values(GLYPH_SUBSTITUTE));
  const glyphs = Object.keys(GLYPH_TO_ITEM);
  assert.ok(glyphs.length >= 32, `GLYPH_TO_ITEM parsed as ${glyphs.length} glyphs — this test is vacuous`);
  let devices = 0, piles = 0, structure = 0;
  for (const g of glyphs) {
    const id = GLYPH_TO_ITEM[g], kind = ITEMS[id].kind;
    const got = demolishTarget(5, 7, [], [], frameWith([[5, 7, g]]));
    if (kind === 'resource') { piles += 1; assert.equal(got.kind, 'empty', `pile glyph '${g}' is demolishable`); continue; }
    assert.ok(kind === 'functional' || subs.has(id),
      `glyph '${g}' resolves to '${id}', a ${kind} row that is NOT a substitution. DEMOLISH will `
      + 'treat it as a device because the predicate asks "not a resource". Decide what it is: give '
      + 'it a GLYPH_SUBSTITUTE entry if a device wears it, or widen the predicate.');
    if (STRUCTURE.has(g)) {
      structure += 1;
      assert.equal(got.kind, 'built-wall',
        `structure glyph '${g}' classified as ${got.kind}. It resolves to real art AND is in `
        + 'STRUCTURE_CODES; the second fact must win, or DEMOLISH sends Cmd.remove at a door.');
      continue;
    }
    devices += 1;
    assert.equal(got.kind, 'device', `device glyph '${g}' stopped being demolishable`);
  }
  assert.ok(devices > 0 && piles > 0 && structure > 0,
    `partition is one-sided (${devices} devices, ${piles} piles, ${structure} structure). All three `
    + 'must be populated or one arm of this test is unexercised.');
});

// ---- local decor transforms ----

test('addDecor / removeDecor are pure and one-per-tile', () => {
  let d = addDecor([], 1, 6, 7, 'rug');
  assert.equal(d.length, 1);
  d = addDecor(d, 1, 6, 7, 'bookshelf'); // same tile replaces
  assert.equal(d.length, 1);
  assert.equal(d[0].itemId, 'bookshelf');
  d = addDecor(d, 1, 8, 9, 'rug');
  assert.equal(d.length, 2);
  const removed = removeDecor(d, 1, 6, 7);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].x, 8);
});

// ---- ESC rung ----

test('escStackRung: armed disarms; else an open room exits; else pass', () => {
  assert.equal(escStackRung({ armed: true, roomOpen: true }), 'disarm');
  assert.equal(escStackRung({ armed: false, dialogueOpen: true, roomOpen: true }), 'dialogue');
  assert.equal(escStackRung({ armed: false, roomOpen: true }), 'exit');
  assert.equal(escStackRung({ armed: false, roomOpen: false }), 'pass');
});

// ---- shared deck minimap ----

test('deckPlanSvg renders one slot per present room, ringing the focused one', () => {
  const slots = deckSlots(view, 1);
  const svg = deckPlanSvg(slots, 0);
  assert.match(svg, /data-anchor="quarters"/);
  assert.match(svg, /data-slot="0"/);
  assert.match(svg, /fill="#e8863c"/);   // focused slot is amber
  assert.match(svg, /stroke="#f2b563"/); // focused slot is ringed
  assert.ok(!/data-slot="7"/.test(svg)); // no empty placeholders for absent slots
});

test('yahDotPos centres the you-are-here dot over the focused slot, or null past the grid', () => {
  const p = yahDotPos(0);
  assert.ok(p && typeof p.left === 'number' && typeof p.top === 'number');
  assert.equal(yahDotPos(9), null);
  assert.match(deckMinimap(deckSlots(view, 1), 0), /class="rz-yah"/);
});

test('U is the 32-unit tile the mock grid is drawn against', () => {
  assert.equal(U, 32);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WP-2 — DEBRIS + DESIGNATION MARKS in the Level-2 Room Zoom (console-retirement plan §4.1 ii).
//
// The acceptance — "a designated tile renders differently from an undesignated one, asserted on the
// fg byte, driven from the real fixture" — is driven here from `frameDeck1` of the live capture
// client/test/fixtures/overview-grid.json: the mid-dig wreck, the only frame carrying fg 4 (Debris,
// undesignated) and fg 15 (Designate) together. All 33 of those cells share glyph code 37 (`'%'`),
// which is in this module's own `NON_FURNITURE` set — so before this package both kinds rendered as
// nothing, and `cell[1]` is the ONLY thing that can tell them apart. The tripwire below pins that.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures/overview-grid.json'), 'utf8'));
const fixView = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))), decodeRooms(decode(JSON.stringify(FIX.rooms))));
const wreck = FIX.frameDeck1;               // deck 1, 45×18, mid-dig
const DECK1 = 1;

/** A focus rect for a deck-1 slot, taken from the fixture's own geometry (never hand-written). */
function slotFocus(anchorOrIndex) {
  const s = deckSlots(fixView, DECK1).find((e) => (typeof anchorOrIndex === 'string'
    ? e.anchorName === anchorOrIndex : e.slotIndex === anchorOrIndex));
  assert.ok(s, `deck-1 slot ${anchorOrIndex} is missing from the fixture`);
  return { deck: DECK1, rx: s.rect.x, ry: s.rect.y, rw: s.rect.w, rh: s.rect.h };
}
/** The whole deck as one focus rect — for the census tests, where clamping is not the subject. */
const WHOLE_DECK1 = { deck: DECK1, rx: 0, ry: 0, rw: wreck.w, rh: wreck.h };

/**
 * ⚠️ THE FIXTURE ADAPTER — read this before scoring anything below as evidence about the channel.
 *
 * `overview-grid.json` predates the `marks` channel: it carries a captured FRAME and no `marks`
 * message. Rather than throw away the WP-2 acceptance — which is about the wreck's REAL geometry, 30
 * debris and 3 dig cells at real coordinates inside real rooms — this rebuilds a `marks`-shaped
 * input from that frame's fg bytes, using the table `mark-overlay.js` used to export.
 *
 * WHAT IT IS: a way to keep driving the pure mark model (clamping, layer geometry, vocabulary) from
 * real captured wreck geometry.
 * WHAT IT IS NOT: evidence about the `marks` channel. It CANNOT be — it is derived from `cell[1]`,
 * the lossy byte the channel replaces, so every mark the projection erased is missing from it too.
 * The channel's own evidence is `client/test/fixtures/marks-grid.json`, a LIVE capture whose write
 * predicate REQUIRES at least one occluded mark, driven in `client/test/marks-model.test.js`.
 */
const FG_TO_KIND = { 4: 0, 15: 1, 16: 2, 26: 3 };
function marksFromFrame(frame) {
  const out = [];
  if (!frame || !Array.isArray(frame.cells)) return out;
  for (let ty = 0; ty < frame.h; ty += 1) {
    for (let tx = 0; tx < frame.w; tx += 1) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const kind = FG_TO_KIND[cell[1] | 0];
      if (kind === undefined) continue;
      out.push({ x: tx, y: ty, deck: frame.deck | 0, kind, mark: MARK_KIND_NAMES[kind] });
    }
  }
  return out;
}
const wreckMarks = marksFromFrame(wreck);
/** The same adapted marks as a WIRE MESSAGE, for the driven rigs (which read `Hud.getMarks()`). */
const WRECK_MARKS_MSG = { type: 'marks', cells: wreckMarks.map((m) => [m.x, m.y, m.deck, m.kind]) };

/** Every `<g class="mk mk-KIND">…</g>` in an SVG string, as `{kind, body}`. */
function marks(svg) {
  return [...svg.matchAll(/<g class="mk mk-([a-z]+)">([\s\S]*?)<\/g>/g)].map((m) => ({ kind: m[1], body: m[2] }));
}

test('WP-2: the fixture can actually DRIVE the designation acceptance (the anti-vacuity tripwire)', () => {
  // Read straight off the wire cells — independent of the code under test.
  const cens = new Map();
  for (const c of wreck.cells) {
    if (!Array.isArray(c)) continue;
    const e = cens.get(c[1]) || { count: 0, glyphs: new Set() };
    e.count += 1; e.glyphs.add(c[0]); cens.set(c[1], e);
  }
  assert.ok(cens.get(4) && cens.get(4).count >= 1,
    'frameDeck1 carries NO fg-4 (Debris) cell — every "undesignated tile" assertion below would then '
    + 'be a claim about the empty set. The frame must be re-captured from a live `--ship grid` host '
    + 'mid-dig, gated on the predicate "frameDeck1 carries fg 4 AND fg 15" (the fixture\'s own `note` '
    + 'describes the capture; note it names a scratchpad script that is NOT in the repo).');
  assert.ok(cens.get(15) && cens.get(15).count >= 1,
    'frameDeck1 carries NO fg-15 (Designate) cell, so "renders differently" is unfalsifiable here.');
  assert.equal(cens.get(4).count, 30);   // the measured census, pinned so a recapture fails LOUDLY
  assert.equal(cens.get(15).count, 3);
  // THE LOAD-BEARING FACT: identical glyph, different fg. `cell[0]` cannot separate these tiles.
  assert.deepEqual([...cens.get(4).glyphs], [37]);
  assert.deepEqual([...cens.get(15).glyphs], [37]);
  // …and 37 really is skipped by the furniture path, which is why a NEW layer was needed.
  assert.deepEqual(roomCells(wreck, WHOLE_DECK1).filter((c) => c.code === 37), []);
});

// ⚠️ RENAMED, and the old title is quoted because it named the SOURCE and the source moved:
// *"WP-2: roomMarkTiles reads cell[1] and reports every marked tile on the deck"*. It reads the
// decoded `marks` channel now; `fg` and `code` left the output with the frame they came from.
test('roomMarkTiles reports every marked tile on the deck, from the marks channel', () => {
  const all = roomMarkTiles(wreckMarks, WHOLE_DECK1);
  assert.equal(all.length, 33);
  assert.equal(all.filter((m) => m.mark === 'debris').length, 30);
  assert.equal(all.filter((m) => m.mark === 'dig').length, 3);
  // every reported tile carries the kind it claims, at the coordinates it claims, and the kind and
  // its name agree — a row whose numeric kind and name disagreed would draw one thing and be
  // censused as another.
  const byXy = new Map(wreckMarks.map((m) => [m.x + ',' + m.y, m]));
  for (const m of all) {
    const src = byXy.get(m.tx + ',' + m.ty);
    assert.ok(src, `roomMarkTiles invented a tile at ${m.tx},${m.ty} that is not on the channel`);
    assert.equal(src.mark, m.mark);
    assert.equal(markKindName(m.kind), m.mark);
  }
  // and nothing unmarked leaked in
  assert.equal(all.filter((m) => !MARK_KIND_NAMES.includes(m.mark)).length, 0);
  // NON-VACUITY: the adapter must actually have found the wreck, or every count above is a claim
  // about the empty set dressed as a census.
  assert.equal(wreckMarks.length, 33);
});

test('WP-2: marks are clamped to the focused room and its deck, like every other channel', () => {
  // The 3 designated tiles sit in the authored 'hold' (deck 1 slot 6, the live wreck room); the
  // debris lies in the halls either side of it. Both rects come from the fixture's own `decks`.
  const hold = roomMarkTiles(wreckMarks, slotFocus('hold'));
  assert.equal(hold.length, 3);
  assert.ok(hold.every((m) => m.mark === 'dig'));

  const halls = deckSlots(fixView, DECK1)
    .filter((s) => !s.anchorName)
    .map((s) => roomMarkTiles(wreckMarks, { deck: DECK1, rx: s.rect.x, ry: s.rect.y, rw: s.rect.w, rh: s.rect.h }));
  const withDebris = halls.filter((h) => h.length);
  assert.equal(withDebris.length, 2, 'the wreck fills exactly two deck-1 halls in this capture');
  assert.deepEqual(withDebris.map((h) => h.length).sort((a, b) => a - b), [14, 16]);
  assert.ok(withDebris.every((h) => h.every((m) => m.mark === 'debris')));

  // off-deck frame → nothing (the deck gate), and a room off the wreck → nothing
  assert.deepEqual(roomMarkTiles(wreckMarks, { ...slotFocus('hold'), deck: 0 }), []);
  assert.deepEqual(roomMarkTiles(wreckMarks, slotFocus('command')), []);
  assert.deepEqual(roomMarkTiles(null, WHOLE_DECK1), []);
});

test('WP-2: a DESIGNATED tile renders differently from an UNDESIGNATED one in the Room Zoom', () => {
  const holdFocus = slotFocus('hold');
  const hallFocus = slotFocus(5); // the hall the wreck's debris fills
  const digSvg = markLayerSvg(roomMarkTiles(wreckMarks, holdFocus), holdFocus);
  const debSvg = markLayerSvg(roomMarkTiles(wreckMarks, hallFocus), hallFocus);

  const dig = marks(digSvg);
  const deb = marks(debSvg);
  assert.equal(dig.length, 3);
  assert.equal(deb.length, 16);
  assert.ok(dig.every((k) => k.kind === 'dig'));
  assert.ok(deb.every((k) => k.kind === 'debris'));

  // THE ACCEPTANCE, as a set difference over position-independent shapes (two rubble piles at
  // different tiles differ for a boring reason; a designated tile must differ for the real one).
  const shape = (k) => k.body.replace(/[-\d.]+/g, '#');
  const debShapes = new Set(deb.map(shape));
  for (const k of dig) {
    assert.ok(!debShapes.has(shape(k)),
      'a DESIGNATED tile emitted the same shape as an UNDESIGNATED one — the fg byte reached the '
      + 'layer and changed nothing, which is the whole of WP-2');
  }
  assert.ok(dig.every((k) => k.body.includes('mk-order-ring')));
  assert.ok(deb.every((k) => !k.body.includes('mk-order-ring')));
  // the rubble is still there under the order — a dig mark queues work, it does not clear the tile
  assert.ok(dig.every((k) => k.body.includes('<path d="M')));

  assert.match(digSvg, /^<g class="rz-marks" pointer-events="none">/);
  assert.ok(digSvg.endsWith('</g>'));
  // deterministic + empty-safe
  assert.equal(markLayerSvg(roomMarkTiles(wreckMarks, holdFocus), holdFocus), digSvg);
  assert.equal(markLayerSvg([], holdFocus), '');
  assert.equal(markLayerSvg(roomMarkTiles(wreckMarks, slotFocus('command')), slotFocus('command')), '');
});

// The geometry pin, READ OUT OF THE EMITTED STRING — the `zone-overlay.test.js:106-111` shape, and
// the assertion this file shipped WITHOUT on its first draft. What stood here instead recomputed the
// transform inside the test and never looked at `digSvg` at all, so it re-asserted `roomMarkTiles`'
// clamping (already covered three tests above) and left the layer's own placement math untested.
// THREE mutations survived the whole suite green, and the first of them is not cosmetic:
//   • drop the `- rx` / `- ry` room-local conversion  ⇒ marks land at 800–1024 in a 384-unit
//     viewBox, i.e. THE ROOM ZOOM'S MARK LAYER IS ENTIRELY INVISIBLE IN THE RUNNING GAME;
//   • emit every mark at a constant (0,0)            ⇒ all marks stacked in the top-left corner;
//   • halve the default `unit`                       ⇒ half-size marks at the wrong pitch.
// All three are now covered, `unit` included, because the expected numbers are DERIVED from U and
// from the fixture's own tile coordinates rather than copied out of the current output.
test('WP-2: the Room Zoom places each mark in ROOM-LOCAL space, one U per tile', () => {
  const holdFocus = slotFocus('hold');
  const tiles = roomMarkTiles(wreckMarks, holdFocus);
  const svg = markLayerSvg(tiles, holdFocus);
  assert.equal(tiles.length, 3);

  // Two independent rects per dig mark: the rubble bed (inset 12% of the tile, 76% wide) and the
  // order ring (inset 1). `<rect x=` only matches the bed — the ring carries `class` first.
  const beds = [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
    .map((m) => [+m[1], +m[2], +m[3], +m[4]]);
  const rings = [...svg.matchAll(/<rect class="mk-order-ring" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
    .map((m) => [+m[1], +m[2], +m[3], +m[4]]);

  assert.deepEqual(beds, tiles.map((m) => [
    (m.tx - holdFocus.rx) * U + U * 0.12, (m.ty - holdFocus.ry) * U + U * 0.12, U * 0.76, U * 0.76,
  ]), 'a mark\'s rubble bed is not at its tile\'s room-local origin, at one U per tile');
  assert.deepEqual(rings, tiles.map((m) => [
    (m.tx - holdFocus.rx) * U + 1, (m.ty - holdFocus.ry) * U + 1, U - 2, U - 2,
  ]), 'the order ring is not on its own tile');

  // …and every emitted rect lies inside the room's logical viewBox, which is the property the
  // dropped-transform mutation actually violates (the layer would draw off-canvas).
  for (const [x, y, w, h] of beds.concat(rings)) {
    assert.ok(x >= 0 && y >= 0 && x + w <= holdFocus.rw * U && y + h <= holdFocus.rh * U,
      `a mark rect (${x},${y},${w},${h}) falls outside the ${holdFocus.rw * U}×${holdFocus.rh * U} `
      + 'room viewBox — the Room Zoom would draw the whole layer off-screen');
  }

  // `unit` is honoured rather than hard-coded: half the pitch halves every number.
  const half = [...markLayerSvg(tiles, holdFocus, U / 2)
    .matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => [+m[1], +m[2]]);
  assert.deepEqual(half, tiles.map((m) => [
    (m.tx - holdFocus.rx) * (U / 2) + (U / 2) * 0.12, (m.ty - holdFocus.ry) * (U / 2) + (U / 2) * 0.12,
  ]));
});

// THE VARIANT ARGUMENT, the Room Zoom's half. See the long note in `overview-scene.test.js` for the
// measurement behind it: `markVariant(tx,ty) = (tx*7 + ty*13) % 3` and 7 ≡ 13 ≡ 1 (mod 3), so it is
// COMMUTATIVE and an argument-order swap is a true equivalent mutant that no test can kill. What is
// killable — and is killed here — is passing the wrong tile's coordinates at all. The Room Zoom's box
// is exact (`(tx-rx)*U, (ty-ry)*U, U, U`), so this is a byte-for-byte comparison against the shared
// builder with no geometry reconstructed in the test.
//
// MUTATION: `markVariant(m.tx, m.ty)` -> `markVariant(0, 0)` in room-model.js ⇒ RED.
test('the Room Zoom draws each mark with ITS OWN tile\'s variant', () => {
  const hallFocus = slotFocus(5);                   // the hall the wreck's debris fills
  const tiles = roomMarkTiles(wreckMarks, hallFocus);
  assert.ok(tiles.length >= 10, `only ${tiles.length} marks in the hall — the pin is thin`);
  const drawn = marks(markLayerSvg(tiles, hallFocus));
  const shown = tiles.filter((t) => t.mark !== 'stockpile');
  assert.equal(drawn.length, shown.length);

  const rx = hallFocus.rx | 0, ry = hallFocus.ry | 0;
  for (let i = 0; i < shown.length; i += 1) {
    const m = shown[i];
    const expect = markCellSvg(m.mark, (m.tx - rx) * U, (m.ty - ry) * U, U, U, markVariant(m.tx, m.ty));
    assert.equal('<g class="mk mk-' + drawn[i].kind + '">' + drawn[i].body + '</g>', expect,
      `the mark at ${m.tx},${m.ty} was not drawn by markCellSvg with its own tile's variant`);
  }
  // …and the variants really vary here, or a constant-variant mutation would pass the comparison.
  assert.equal(new Set(shown.map((m) => markVariant(m.tx, m.ty))).size, 3,
    'this room no longer spans all three rubble arrangements, so `markVariant(...) -> 0` would '
    + 'survive the comparison above');
});

// The mark colours, pinned. `zone-overlay.test.js` pins its equivalent, and without this the dialect
// the whole rendering argument rests on — AMBER DASHED MEANS "an order is queued on this tile",
// borrowed from the build ghosts — is unasserted: repainting the order ring rubble-grey survived the
// entire suite. The stockpile swatch is checked against the string `zone-overlay.js` actually emits,
// so "reused verbatim from WP-3" is a measured claim rather than a comment.
test('VR-P3: the QUEUED-ORDER DASH means an order; rubble does not; the zone swatch is WP-3\'s own', () => {
  // ⚠️ THIS TEST WAS `amber means an order` AND ITS SUBJECT MOVED RATHER THAN WEAKENED. Under the
  // redesign's ruling E3 colour alone distinguishes nothing: there is ONE accent, oxblood `#7B2C22`,
  // and the DASH is what separates a queued order (`8 5`) from a fault (solid) from something
  // unbuilt (ink `6 5`). So the property asserted is no longer "the ring is #f2b563" but the pair —
  // the accent AND the queued-order dash, on the ring and on the condemn ✕, and NEITHER on plain
  // rubble. Repainting the ring rubble-ink, or spelling it solid (which is the FAULT spelling), both
  // redden here; that is strictly more than the old hue pin could see.
  const ATTEND = '#7B2C22';
  const ORDER_DASH = '8 5';
  const dig = markCellSvg('dig', 0, 0, 32, 32);
  const debris = markCellSvg('debris', 0, 0, 32, 32);
  const strip = markCellSvg('strip', 0, 0, 32, 32);

  assert.match(dig, new RegExp(`class="mk-order-ring"[^/]*stroke="${ATTEND}"`),
    'the dig order ring does not wear the ONE ACCENT — the "an order is queued here" dialect it '
    + 'shares with the build ghosts is what makes a designated tile legible as an ORDER rather than '
    + 'as more rubble');
  assert.match(dig, new RegExp(`class="mk-order-ring"[^/]*stroke-dasharray="${ORDER_DASH}"`),
    'the dig ring is not in the charter\'s QUEUED ORDER spelling (`8 5`). Solid oxblood is '
    + 'ATTENTION/FAULT and ink `6 5` is UNBUILT — either would say something the tile does not mean');
  assert.match(strip, new RegExp(`class="mk-condemn"[^/]*stroke="${ATTEND}"`));
  assert.ok(!debris.includes(ATTEND),
    'an UNDESIGNATED debris tile carries the order accent — a player would read a queued order that '
    + 'does not exist');
  assert.ok(!debris.includes('stroke-dasharray'),
    'plain rubble is dashed — the dash is the dialect\'s verb for "an order", and rubble is a noun');
  // the rubble itself is ink on paper, on both the plain and the designated tile
  assert.ok(debris.includes('fill="#EBE4D1"') && dig.includes('fill="#EBE4D1"'));
  assert.ok(debris.includes('stroke="#14120F"') && dig.includes('stroke="#14120F"'));

  // The stockpile swatch, compared against zoneLayerSvg's real output rather than a copied literal.
  const zoneSvg = zoneLayerSvg([{ tx: 0, ty: 0, restricted: false, backedOff: false, label: 'x' }],
    { rx: 0, ry: 0 });
  const attrs = (str) => (/fill="(rgba\([^"]+\))" stroke="(rgba\([^"]+\))"/.exec(str) || []).slice(1, 3);
  assert.deepEqual(attrs(markCellSvg('stockpile', 0, 0, 32, 32)), attrs(zoneSvg));
  assert.equal(attrs(zoneSvg).length, 2, 'the zone-overlay parse rotted — the comparison is vacuous');
});

// ── SYNTHETIC-CELL COVERAGE (clearly separated from the fixture-driven acceptance above) ──
// `Stockpile` (16) and `Deconstruct` (26) appear NOWHERE in the capture — no authored ship zones a
// stockpile (CLAUDE.md: a zone is the player's decision) and nothing in it is condemned. Their
// behaviour is therefore covered by hand-built single cells, and it is labelled as such: these tests
// prove the table and the builder, NOT that the shipped ship draws them.

// ⚠️ REPLACES *"WP-2 (synthetic): all four GlyphColor bytes map to their mark, and no other byte
// does"*, which asserted `MARK_FOR_FG`. That table is retired: a projected fg byte no longer names a
// mark anywhere in the client. The property that survives is the WIRE kind → name table, and it is
// pinned against the C# constants themselves in `client/test/marks-model.test.js`.
test('(synthetic): the four wire kinds map to their mark, and no other kind does', () => {
  assert.deepEqual([...MARK_KIND_NAMES], ['debris', 'dig', 'stockpile', 'strip']);
  for (let kind = -3; kind <= 40; kind += 1) {
    assert.equal(markKindName(kind), MARK_KIND_NAMES[kind] || '', `kind ${kind}`);
  }
  // an unknown mark name draws nothing rather than throwing
  assert.equal(markCellSvg('nonsense', 0, 0, 32, 32), '');
  assert.equal(markCellSvg('debris', 0, 0, 0, 32), ''); // a degenerate box draws nothing
});

test('the Room Zoom REPORTS a stockpile tile but leaves the drawing to WP-3', () => {
  const focus = { deck: 0, rx: 0, ry: 0, rw: 2, rh: 1 };
  const chan = [{ x: 0, y: 0, deck: 0, kind: 2, mark: 'stockpile' },
    { x: 1, y: 0, deck: 0, kind: 3, mark: 'strip' }];
  const tiles = roomMarkTiles(chan, focus);
  assert.deepEqual(tiles.map((t) => t.mark), ['stockpile', 'strip']);
  const svg = markLayerSvg(tiles, focus);
  // The strip mark draws; the stockpile one does not — zoneLayerSvg already paints that tile from
  // the `zones` channel, one line above this layer in roomzoom-view.js, and stacking two slate tints
  // on one tile is a visible artefact. Semantics are unchanged: a stockpile kind still means
  // "stockpile zone"; only the layer that draws it differs.
  assert.deepEqual(marks(svg).map((k) => k.kind), ['strip']);
  assert.ok(svg.includes('mk-condemn'), 'a condemned wall must carry the strip mark');
  // and a stockpile-only room emits no layer at all rather than an empty group
  assert.equal(markLayerSvg([{ tx: 0, ty: 0, mark: 'stockpile' }], focus), '');
});

// ⚠️ RETITLED from *"the two surfaces speak ONE vocabulary — same fg byte, same mark"*: the sweep is
// over WIRE KINDS now, not fg bytes. The property is unchanged and is the reason `mark-overlay.js`
// exists — one kind must not draw two different things on the two surfaces.
test('the two surfaces speak ONE vocabulary — same wire kind, same mark', () => {
  // Drives BOTH real composers over the same single-cell marks payload, kind by kind, so the two
  // surfaces cannot drift apart. The Overview draws all four kinds; the Room Zoom draws three by
  // design (above).
  const focus = { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 };
  const frame = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[46, 2, 0, 0]] };
  let sawMark = 0;
  for (let kind = -2; kind <= 30; kind += 1) {
    const chan = decodeMarks({ type: 'marks', cells: [[0, 0, 0, kind]] });
    const ovKinds = marks(overviewScene({ deck: 0, decksView: fixView, frame, crew: [], marks: chan })).map((k) => k.kind);
    const rzKinds = roomMarkTiles(chan, focus).map((t) => t.mark);
    assert.deepEqual(ovKinds, rzKinds, `kind ${kind}: the Overview and the Room Zoom disagree about `
      + 'what this kind means. They share mark-overlay.js precisely so they cannot.');
    if (rzKinds.length) {
      sawMark += 1;
      // …and the drawn cell is byte-identical for the same box, so "different surface" can never
      // become "different meaning".
      assert.equal(markCellSvg(rzKinds[0], 0, 0, 10, 10, markVariant(0, 0)),
        markCellSvg(ovKinds[0], 0, 0, 10, 10, markVariant(0, 0)));
    }
  }
  assert.equal(sawMark, 4,
    'exactly four wire kinds carry a mark; the sweep found a different number. An out-of-range kind '
    + 'must be DROPPED by decodeMarks, not drawn as a blank.');
});

test('WP-2 (synthetic): markVariant is deterministic, in range, and actually varies', () => {
  const seen = new Set();
  for (let tx = 0; tx < 8; tx += 1) {
    for (let ty = 0; ty < 8; ty += 1) {
      const v = markVariant(tx, ty);
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 2);
      assert.equal(v, markVariant(tx, ty));
      seen.add(v);
    }
  }
  assert.equal(seen.size, 3, 'a single arrangement tiles a debris field into obvious wallpaper');
  assert.ok(markVariant(-1, -1) >= 0, 'a negative tile coordinate must not fall off the table');
  // …and all THREE really draw differently. Comparing only 0 vs 1 left `RUBBLE_SETS[2] :=
  // RUBBLE_SETS[0]` surviving the whole suite, i.e. the wallpaper property was unasserted for a
  // third of every debris field — the exact tiles the property exists to break up.
  assert.equal(new Set([0, 1, 2].map((v) => markCellSvg('debris', 0, 0, 32, 32, v))).size, 3,
    'two of the three rubble arrangements draw the same pile, so a debris field still tiles into '
    + 'visible wallpaper across a third of its tiles');
});

// ── THE WIRING SCAN, and why it is a source scan at all ──
// `roomzoom-view.js` is DOM glue with no DOM in this suite, so nothing above can prove the Room Zoom
// actually concatenates the layer: `markLayerSvg` could be perfect and never called, and every
// assertion here would stay green (exactly the hole `zone-overlay.js`'s header records WP-3 falling
// into). The scan therefore runs over COMMENT-STRIPPED source — `codeOnly` is IMPORTED from the
// shared `client/test/code-only.js` rather than re-derived, because a stripper that is not
// string-literal aware is blinded by a quoted `//` and silently passes everything after it. The two
// controls below test the shared stripper instead of trusting it.

/** ⚠️ THE LOCAL COPY OF `codeOnly` IS GONE FROM THIS FILE (2026-07-26). It carried a note saying
 *  "new consumers must IMPORT the shared module, not copy this", kept local "only to leave the WP-4
 *  test file's diff alone" — and a later package became a new consumer. Keeping one copy for the old
 *  scans and importing the shared one for the new is the exact shape CLAUDE.md trap 1 warns about: two
 *  strippers, one of which can silently rot. Both now come from `client/test/code-only.js`, whose
 *  behaviour is pinned in `surface-boundary.test.js` AND by the two controls immediately below,
 *  which are unchanged and now exercise the shared function.
 */

test('WP-2: the Room Zoom actually CONCATENATES the mark layer into its SVG body', () => {
  const src = codeOnly(readFileSync(join(HERE, '../src/ui/roomzoom-view.js'), 'utf8'));
  // ⚠️ THE SCANNED SHAPE CHANGED WITH THE SOURCE. The old single expression
  // `body += markLayerSvg(roomMarkTiles(frame, _focus), _focus)` is now two statements — the marks
  // are decoded off the wire in `repaint()` into `_markTiles`, beside the zone tiles, and the layer
  // consumes that. BOTH halves are scanned: a derivation nobody consumes and a consumer of a value
  // nobody derives are two different ways to draw nothing.
  assert.match(src, /_markTiles\s*=\s*roomMarkTiles\(\s*decodeMarks\(/,
    'client/src/ui/roomzoom-view.js must derive its mark tiles from the decoded `marks` channel. '
    + 'Reading them back off `frame` is the defect the channel exists to remove: GlyphMapper passes '
    + '3/4/5 overwrite `cell[1]` for an item, a device and a standing crew member.');
  assert.match(src, /body\s*\+=\s*markLayerSvg\(\s*_markTiles/,
    'client/src/ui/roomzoom-view.js must concatenate markLayerSvg(_markTiles, …) into the layer '
    + 'body. A perfect builder nobody calls satisfies every other assertion in this file and draws '
    + 'nothing on screen — the exact failure zone-overlay.js was extracted to stop.');
  // ORDER: above the material layer (which paints an OPAQUE swatch over every built wall, so a strip
  // mark beneath it would be invisible) and above the zone layer whose tiles this one skips.
  const iMat = src.indexOf('materialLayerSvg(');
  const iZone = src.indexOf('zoneLayerSvg(');
  const iMark = src.indexOf('markLayerSvg(');
  const iPawn = src.indexOf('body += pawnSvg(');
  const iFurn = src.indexOf('body += furnitureSvg(');
  assert.ok(iMat > 0 && iZone > 0 && iMark > iMat && iMark > iZone, 'the mark layer must draw last of the floor layers');
  assert.ok(iPawn > iMark, 'the mark layer must draw UNDER the pawns');
  // …and ABOVE the furniture, since the device-strip fix landed: a condemned DESK now carries fg 26,
  // and beneath its own opaque sprite the amber ✕ is invisible — the owner's exact reported symptom,
  // with the byte present and correct. Inert for debris/dig (glyph 37 is in NON_FURNITURE, so the
  // two layers never share a tile); the disjointness is MEASURED on the real capture further down.
  assert.ok(iFurn > 0, 'the furniture layer call is gone — this ordering assertion is vacuous');
  assert.ok(iMark > iFurn, 'the mark layer must draw OVER the furniture it condemns');
});

test('NEGATIVE CONTROL: the wiring scan does not fire on a commented-out call', () => {
  const prose = [
    '// body += markLayerSvg(_markTiles, _focus);  // reverted, see WP-6',
    '/* an older draft called _markTiles = roomMarkTiles(decodeMarks(m), r); here */',
    'const real = 1;',
  ].join('\n');
  assert.doesNotMatch(codeOnly(prose), /body\s*\+=\s*markLayerSvg\(\s*_markTiles/,
    'a COMMENTED-OUT call satisfied the wiring scan — the guard would then be green with the layer '
    + 'switched off, which is precisely the defect this repo has shipped four times in one day');
  assert.doesNotMatch(codeOnly(prose), /_markTiles\s*=\s*roomMarkTiles\(\s*decodeMarks\(/,
    'a COMMENTED-OUT derivation satisfied the other half of the wiring scan');
});

test('POSITIVE CONTROL: the wiring scan does fire on the real call, and codeOnly is quote-aware', () => {
  assert.match(codeOnly('  body += markLayerSvg(_markTiles, _focus);\n'),
    /body\s*\+=\s*markLayerSvg\(\s*_markTiles/, 'the scan missed a real call — it is vacuous');
  assert.match(codeOnly('  _markTiles = roomMarkTiles(decodeMarks(Hud.getMarks()), _focus);\n'),
    /_markTiles\s*=\s*roomMarkTiles\(\s*decodeMarks\(/, 'the scan missed a real derivation');
  // a quoted `//` must not swallow the rest of the file (the blinding failure mode)
  const src = 'const u = "http://x//y";\nbody += markLayerSvg(_markTiles, r);\n';
  assert.match(codeOnly(src), /body\s*\+=\s*markLayerSvg\(/,
    'a quoted "//" blinded the stripper, so every scan using it passes for the wrong reason');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WP-4 — DIG + STRIP on the Level-2 Room Zoom, DRIVEN through the real controller
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY THESE ARE DRIVEN AND NOT SCANNED. The whole risk of this package is in the LOWERING: the Room
// Zoom does NOT use `paletteOrders` (that function is the console/canvas path, called only from
// `client/src/input/controls.js:172` and `:275`), so there are now TWO independent paths that must
// emit the same wire payload for the same verb. Nothing about that is visible to a source scan, and
// the two failure modes that matter — an order routed through `Cmd.build` (which reaches
// `BuildSystem`, a system that knows nothing about designations) and a sweep that escapes the room —
// are both behaviours, not tokens. So `roomzoom-view.js` is instantiated over `dom-lite` and the
// assertions read the payloads that come out of the injected `send`.
//
// PARITY IS PINNED BY IMPORT, NOT BY LITERAL. Every expectation below is compared against what
// `paletteOrders(verb, x, y)` ACTUALLY returns, imported from `controls.js` — so a drift on EITHER
// side reddens. A copied literal `{cmd:'dig',…}` could not do that, and the console's own lowering
// is the thing this package must not diverge from. One absolute wire-shape pin is kept alongside it
// (a `Cmd.dig` change moves BOTH paths together, so equality alone would stay green through it).
//
// THE DOM IS A STUB, and the limits are the same as `relations-view.test.js`'s: `dom-lite` does not
// parse markup, so the chrome nodes are registered by hand. ⚠️ ONE HALF OF THAT SENTENCE IS NOW
// FALSE AND IS QUOTED HERE RATHER THAN DELETED: it used to end *"and `querySelectorAll` returns
// nothing — which means `_el.toolBtns` is empty and the visual `.on` toggle is NOT proven here."*
// The palette-overflow package added a START-TAG SCANNER to `RzEl` (see its comment below), so
// `_el.toolBtns` now holds the seventeen buttons `buildChrome` really wrote and `paintPalette`'s body
// executes. What is STILL not proven here is anything about LAYOUT — whether those buttons are on
// the screen is a question only a layout engine can answer, and `client/tools/palette-shot.mjs` is
// where it is answered.

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-minimap',
  // ⭐ THE HINT LINE, registered here because the neutral-first-screen package gave it two texts
  // and therefore a node reference. It is a `<div>`, so the start-tag scanner below (which lifts
  // `button|span` only) cannot resolve it and `_el.hint` would be null — every hint assertion in
  // this file would then read the seeded markup rather than what `paintChrome` wrote, which is
  // exactly the "guard that cannot bite" shape. Trap 4's corollary: fix the harness.
  'rz-hint',
  // hud.js writes these unconditionally on a roster/status dispatch (see relations-view.test.js).
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
  // ⚠️ ADDED FOR THE PAUSED-NUDGE LEG (M1-C review, 2026-07-29), and it is trap 4's corollary again:
  // *"if a harness cannot model the thing your guard needs to see, fix the harness."* The Room Zoom's
  // `isPaused()` reads `Hud.getStatus()`, whose ONLY writer is `renderStatus` — which paints six
  // console-shell ids on its way past (`hud.js:246-262`) and threw `Cannot set properties of null`
  // here. Without these the erase branch's paused-nudge guard is unreachable in node, and it was:
  // deleting the condition left the whole suite green. These are console chrome, so they are inert
  // scenery for every other test in this file and go with the shell at WP-9.
  's-speed', 's-msg', 's-runstate', 's-pauselabel', 'b-pause', 's-speedchip',
];

/**
 * ⚠️ THE ELEMENT SCANNER — a harness upgrade, and it is the reason the paragraph above no longer
 * ends at *"`_el.toolBtns` is empty and the visual `.on` toggle is NOT proven here"*.
 *
 * `querySelectorAll` returning `[]` meant `paintPalette`'s whole body was UNREACHABLE in node: the
 * loop that lights the armed tool and (since the palette-overflow package) announces it with
 * `aria-pressed` ran zero times, so any mutation to it was invisible to this suite. That is
 * `CLAUDE.md` trap 1's cousin — not a guard satisfied by a comment, a guard that never executes the
 * line it names — and trap 4's corollary is the remedy: **if a harness cannot model the thing your
 * guard needs to see, fix the harness.**
 *
 * It is a TAG SCANNER, not an HTML parser, and the difference is deliberate. It lifts every
 * `<button …>`/`<span …>` START TAG out of an assigned `innerHTML` into a real element carrying that
 * tag's class list, `data-*` dataset and attributes — flat, ignoring nesting, ignoring text. That is
 * exactly enough for `_el.toolBtns` / `_el.placeLabel` / `_el.capName` and no more; anything it
 * cannot model (attribute selectors like `[data-rz="deck"]`) still resolves to `null`, which is what
 * it resolved to before, so the breadcrumb handles keep their existing null-guarded path.
 *
 * IT DOES NOT TOUCH `childNodes`. The scanned nodes live in a separate `_scanned` list, so
 * `textContent` — which every toast assertion in this file reads — keeps the exact behaviour it had
 * before this existed. A parser that populated `childNodes` would have quietly changed the meaning
 * of assertions written years apart from it.
 */
const TAG_RE = /<(button|span)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

/** dom-lite + the four extras roomzoom-view.js needs: innerHTML, querySelector(All), closest,
 *  getBoundingClientRect. Subclassed here so the shared helper keeps its narrow contract. */
class RzEl extends DomEl {
  constructor(doc, tag) {
    super(doc, tag);
    this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 };
    this._scanned = [];
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v); this.childNodes = [];
    this._scanned = [];
    for (const m of this._html.matchAll(TAG_RE)) {
      const el = new RzEl(this.ownerDocument, m[1]);
      for (const a of m[2].matchAll(ATTR_RE)) {
        el.setAttribute(a[1], a[2]);
        if (a[1] === 'class') el.className = a[2];
        else if (a[1].startsWith('data-')) el.dataset[a[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
      }
      el.parentNode = this;   // so a click on a scanned button bubbles the way the real one does
      this._scanned.push(el);
    }
  }
  /** Class selectors only, over the scanned start tags. Anything else → null/[] , as before. */
  querySelector(sel) { const a = this.querySelectorAll(sel); return a.length ? a[0] : null; }
  querySelectorAll(sel) {
    if (typeof sel !== 'string' || !sel.startsWith('.')) return [];
    const cls = sel.slice(1);
    return this._scanned.filter((e) => e.classList.contains(cls));
  }
  getBoundingClientRect() { return this._rect; }
  /** ⭐ ADDED FOR THE CAPTION'S CREW-COUNT LEG (the neutral-first-screen package), and it is trap 4's
   *  corollary once more: `hud.js`'s `reconcileRows` — the CONSOLE CREW WATCH's row reconciler,
   *  reached by `renderRoster` — calls it, so this rig could not dispatch a roster AT ALL and the
   *  header above says so. Without it there is no way to drive "how many souls are in this room"
   *  through the shipping path, and `_capHere` could be hard-zero forever with every test green.
   *  Order-insensitive (append, never insert), exactly as `zoom-pawn.test.js`'s sibling rig spells
   *  it: nothing here asserts row ORDER — that is the sibling's subject, driven on its own rig. */
  insertBefore(el) { return this.appendChild(el); }
  closest(sel) {
    let n = this;
    while (n && n.nodeType === 1) {
      if (/^\[data-/.test(sel)) {
        const key = sel.replace(/^\[data-|\]$/g, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (n.dataset && n.dataset[key] !== undefined) return n;
      } else if (sel.startsWith('#')) {
        if (n._id === sel.slice(1)) return n;
      } else if (n.classList.contains(sel.replace(/^\./, ''))) return n;
      n = n.parentNode;
    }
    return null;
  }
}
class RzDoc extends DomDocument {
  constructor() { super(); this.body = new RzEl(this, 'body'); }
  createElement(tag) { return new RzEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

/** A fresh document carrying every id the controller looks up. */
function makeRzDoc() {
  const d = new RzDoc();
  for (const id of RZ_IDS) { const e = new RzEl(d, 'div'); e._id = id; d.register(id, e); }
  return d;
}
/** A window stub that RECORDS its listeners — `mouseup` (a release that ends off-canvas still
 *  commits) and `keydown` are bound there, so a shared no-op stub would make half this section
 *  undrivable. Each mount gets its OWN bag: `initRoomZoom` adds listeners every call, and a second
 *  mount sharing one bag would double-fire every release and toggle every hotkey twice. */
function makeRzWindow(bag) {
  return { addEventListener(t, fn) { (bag[t] = bag[t] || []).push(fn); }, removeEventListener() {} };
}

const rzDoc = makeRzDoc();
globalThis.document = rzDoc;
const rzWinListeners = {};
globalThis.window = makeRzWindow(rzWinListeners);

// Resolved AFTER the globals above are in place — these modules touch `document` at init.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');
const { paletteOrders } = await import('../src/input/controls.js');

/** THE ROOM UNDER TEST is the fixture's own live wreck: deck-1 slot 6, anchor 'hold' (roomType 14),
 *  the room the capture's note calls "the LIVE WRECK". Its rect is read from the fixture, never
 *  hand-written, so a recapture that moves the room moves these tests with it. Derived BEFORE any
 *  mount because it is pure fixture geometry — the probe below needs it too. */
const HOLD = slotFocus('hold');

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PROBE FIRST, on a THROWAWAY document + window: what mask does a STOCKPILE sweep paint with when
// the player never touches a chip? WP-6 removed the injected getter — the palette owns `_stockFilter`
// and the chips are its only writer — so this is now the FRESH-MOUNT default rather than the
// un-injected one, and it is the leg that pins `let _stockFilter = defaultStockFilter()`. The
// mutation it hides is unchanged: default → 0, i.e. ACCEPT-NOTHING, a zone that silently refuses
// every item and looks precisely like one nothing has been hauled to yet. That exact hole survived a
// fully green suite on the Overview until WP-5's review found it.
//
// ⚠️ IT IS HALF OF A PAIR AND MUST NEVER BE READ ALONE (CLAUDE.md's "starts-in-the-asserted-state"
// trap). Deleting this whole package — chips, row, handler — leaves a palette that still paints
// ACCEPT-ALL, so this test passes just as well against no WP-6 at all. The leg that catches THAT is
// `the ACCEPTS chips CHANGE the mask the next sweep paints with`, below: it drives a chip and watches
// the emitted `Cmd.filter` move off the default.
//
// IT MUST BE ITS OWN DOCUMENT **AND** ITS OWN WINDOW. `initRoomZoom` binds mousedown/mousemove/click
// on the canvas, `mouseup` + capture-phase `keydown` on the window, and a delegated click on the
// root — every call, unconditionally. A second mount over the same nodes would double-commit every
// sweep and make every hotkey a no-op (arm twice = disarm). Nothing is dispatched to the probe's DOM
// after this block, and the real mount overwrites every module-level handle. The one residue is a
// second `Hud.onShipUpdate` subscription — the same closure body twice over the same module state,
// so a notification schedules one already-coalesced repaint. Idempotent, and worth naming.
const probeDoc = makeRzDoc();
const probeWinListeners = {};
// ⭐ VR-P3 — THE DRIVEN RIG'S TILE→POINTER HELPER, RE-DERIVED THROUGH THE PROJECTION.
//
// It used to be `(tx - rx) * U + U/2` — the plan view's own arithmetic, restated in the test. That
// worked because the surface WAS a plan; on the cutaway the same expression points at a tile several
// metres away, so every driven click below would land somewhere the test never named and the whole
// section would pass or fail for the wrong reason (TRAPS 3: a red for the wrong reason is worse than
// a green). It goes through `scenePlacement` — the SHIPPED placement object, the one the layers are
// drawn with — so the point a test clicks is by construction the point the tile is drawn at.
//
// The rect is the scene's own viewBox at 1:1, so `sceneFit` is the identity and a scene coordinate
// IS a client coordinate; that is the same trick the old rig used (`s = 1`), stated against the new
// space.
const sceneRectFor = (focus) => {
  const vb = roomScene(focus).viewBox;
  return { left: 0, top: 0, width: vb.w, height: vb.h };
};
const scenePointFor = (focus, tx, ty) => {
  const pl = scenePlacement(roomScene(focus), focus);
  const [x, y] = pl.foot(tx, ty);
  // ROUNDED — see the sibling rigs: a projected floor centre is fractional, and half a pixel at the
  // centre of a ~95-px tile cannot change which tile the inverse answers.
  return { clientX: Math.round(x), clientY: Math.round(y) };
};

globalThis.document = probeDoc;
globalThis.window = makeRzWindow(probeWinListeners);
const probeSent = [];
const probeApi = RoomZoom.initRoomZoom({ send: (o) => probeSent.push(o) });   // chips never touched
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
Hud.renderFrame(wreck);
Hud.renderMarks(WRECK_MARKS_MSG);   // the mark layer is wire-fed now, not derived from the frame
probeApi.enter('hold');
probeDoc.getElementById('rz-layers')._rect = sceneRectFor(HOLD);
{
  const probeCanvas = probeDoc.getElementById('rz-canvas');
  const probeRoot = probeDoc.getElementById('roomzoom-view');
  const at = (tx, ty) => scenePointFor(HOLD, tx, ty);
  const btn = new RzEl(probeDoc, 'button');
  btn.dataset.rztool = 'stockpile';
  btn.setAttribute('data-rztool', 'stockpile');
  probeRoot.appendChild(btn);
  rzFire(btn, 'click', {});                                   // arm STOCKPILE the way a player does
  probeSent.length = 0;
  rzFire(probeCanvas, 'mousedown', { button: 0, ...at(24, 11) });
  rzFire(probeCanvas, 'mousemove', { button: 0, ...at(24, 11) });
  for (const fn of (probeWinListeners.mouseup || []).slice()) fn({ button: 0 });
}
/** What one un-injected STOCKPILE tile emitted (cursor chatter dropped). */
const PROBE_DEFAULT = probeSent.filter((o) => o.cmd !== 'cursor');

// ── the real harness ──
globalThis.document = rzDoc;
globalThis.window = makeRzWindow(rzWinListeners);
const rzSent = [];
// ⚠️ NO `getStockFilter` INJECTION ANY MORE (WP-6), and the note that stood here is quoted and
// negated: *"ONE INDIRECTION, and it is load-bearing rather than tidy … Routing through a swappable
// function lets one test install a getter whose value CHANGES on every call, which is the only way to
// make the per-tile mutation bite."* True, and it bought a mask NO PLAYER COULD SET: main.js wired
// that getter to `Hud.getStockFilter()`, whose only writer anywhere in the client is the `onclick` on
// the DEPRECATED console shell's chips. The palette owns the mask now and the chips on it are the
// only writer, so every test below drives the mask the way a player does — by clicking a chip — and
// what replaced the changing-getter trick is written out at that test.
const rzApi = RoomZoom.initRoomZoom({ send: (o) => rzSent.push(o) });
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
// The SAME capture the pure assertions above run on — so the driven half sees the real wreck
// (`demolishTarget` and every SVG layer read the frame back out of the shared HUD cache, not out of
// a local). NO roster is dispatched: `renderRoster` builds the CONSOLE's CREW WATCH rows, which
// dom-lite cannot host, and the crew layer is not what this package changed.
Hud.renderFrame(wreck);
// …and the mark layer's own channel, which is NOT part of the frame. A rig that dispatched only the
// frame would draw no marks at all now, and every mark assertion below would pass vacuously if it
// were phrased as an absence.
Hud.renderMarks(WRECK_MARKS_MSG);

rzApi.enter('hold');                       // the Overview's own entry point, by anchorName
const rzLayers = rzDoc.getElementById('rz-layers');
const rzCanvas = rzDoc.getElementById('rz-canvas');
const rzRoot = rzDoc.getElementById('roomzoom-view');
const rzPalette = rzDoc.getElementById('rz-palette');
// The scene's own viewBox at 1:1 (fit scale s = 1), so a scene coordinate IS a client coordinate.
rzLayers._rect = sceneRectFor(HOLD);
// `makeRzDoc` registers every chrome node by id and parents NONE of them, so a click on a real
// palette button would die at the palette instead of reaching the delegated handler on the root.
// Parenting it is what the shipped DOM already does (`#rz-palette` lives inside `.rz-palette-wrap`
// inside `#roomzoom-view`), and it is what lets the aria test below drive the SHIPPED button rather
// than a stand-in it built itself.
rzPalette.parentNode = rzRoot;

/** The client-space point at the FLOOR CENTRE of tile (tx,ty), under the rect above — through the
 *  shipped projection, never through a restatement of it. */
const atTile = (tx, ty) => scenePointFor(HOLD, tx, ty);

function rzFire(el, type, extra) {
  const e = {
    type, target: el, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
    ...(extra || {}),
  };
  let n = el;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) { fn(e); if (e.propagationStopped) return e; }
    n = n.parentNode;
  }
  return e;
}
/** `mouseup` is bound on WINDOW (a release that ends off-canvas still commits), so it is dispatched
 *  through the window stub rather than through the element tree. */
function rzMouseUp(button = 0) { for (const fn of (rzWinListeners.mouseup || []).slice()) fn({ button }); }
function rzKey(key) {
  const e = {
    key, target: undefined, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
  };
  for (const fn of (rzWinListeners.keydown || []).slice()) fn(e);
  return e;
}

/**
 * PER-TEST RESET, in a hook rather than inline at the end of each test.
 *
 * Every driven test below both arms and disarms, which is fine until one of them FAILS: the assert
 * throws, the trailing `rzArm` never runs, and the next test starts with a tool still armed and a
 * drag possibly still open. An independent reviewer hit exactly that — a preview failure cascaded
 * into the following test — which makes the failure COUNT in this section untrustworthy even though
 * each individual assertion is sound. One defect must produce one red test.
 *
 * The reset is AUTHORITATIVE rather than a mirror of what the tests think they armed: `exitRoom()`
 * clears `_armed`, `_drag` and `_focus` outright and `enterRoom()` re-resolves the room with
 * `_armed = null`, so it lands on a known state even when the controller is mid-gesture or when a
 * mutation has broken arming itself. `rzMouseUp()` first, so a drag left open by a failed test is
 * ended against the OLD room rather than the freshly re-entered one.
 */
afterEach(() => {
  if (!rzApi) return;                 // the driven section has not been reached yet
  rzMouseUp();
  rzApi.exit();
  rzApi.enter('hold');
  // The accept-mask is module state with NO setter — the chips are its only writer, which is the
  // whole point of the package — so the reset drives them, arming STOCKPILE first because the row is
  // hidden (and therefore unclickable) otherwise. `rzSetMask` reads the row back rather than
  // mirroring what it thinks it toggled, so a broken toggle shows up here as a hang-free failure in
  // the NEXT test rather than as a silently wrong starting mask.
  rzArm('stockpile');
  rzSetMask(ACCEPT_ALL);
  rzArm('stockpile');
  rzSent.length = 0;
});

/** Arm a tool the way a player does — a click on a palette button carrying `data-rztool`, dispatched
 *  through the surface root's real delegated handler. Clicking the armed tool again disarms it. */
const rzToolBtns = new Map();
function rzArm(tool) {
  let b = rzToolBtns.get(tool);
  if (!b) {
    b = new RzEl(rzDoc, 'button');
    b.dataset.rztool = tool;
    b.setAttribute('data-rztool', tool);
    rzRoot.appendChild(b);
    rzToolBtns.set(tool, b);
  }
  rzFire(b, 'click', {});
}

// ── the three chrome sentences, read back off the LIVE nodes ───────────────────────────────────
// ⚠️ THE HINT IS READ FROM ITS NODE, NOT FROM `rzRoot.innerHTML`, and the change is not cosmetic.
// The root markup carries the SEEDED text only (`ZOOM_HINT_IDLE`, written once by `buildChrome`);
// what the player reads is whatever `paintChrome` last wrote into `#rz-hint`. Asserting the markup
// string could never see a hint that stopped being repainted — the assertion would pass on a
// surface whose hint was frozen at boot, which is the precise defect this instrument now guards.
const rzHint = () => rzDoc.getElementById('rz-hint').textContent;
const rzLabel = () => rzPalette.querySelector('.rz-place-label').textContent;
// The caption is its TWO spans joined (VS-Z-12 colours the count separately). Read off the scanned
// start tags rather than the container's `textContent`: the scanner deliberately keeps its nodes
// out of `childNodes`, so the container reads '' here and an assertion against it would be vacuous.
const rzCaption = () => {
  const cap = rzDoc.getElementById('rz-caption');
  const part = (cls) => (cap.querySelector(cls) || { textContent: '' }).textContent;
  return part('.rz-cap-lead') + part('.rz-placed');
};

// ── WP-6: driving the ACCEPTS chips ────────────────────────────────────────────────────────────
// `dom-lite` parses no markup, so `_el.accepts`'s real chips (written as one `innerHTML` string) are
// not clickable nodes here — exactly as `_el.toolBtns` is empty and `rzArm` builds its own
// `data-rztool` node. The chips are resolved by the SAME delegated `closest('[data-rzaccept]')`
// handler the real ones go through, so what is driven is the shipped resolution path. That the row
// really EMITS those nodes is asserted separately, off the innerHTML string the builder wrote.

/** Click one ItemKind chip the way a player does, through the surface root's delegated handler. */
const rzAccChips = new Map();
function rzAccept(kind) {
  let b = rzAccChips.get(kind);
  if (!b) {
    b = new RzEl(rzDoc, 'button');
    b.dataset.rzaccept = String(kind);
    b.setAttribute('data-rzaccept', String(kind));
    rzRoot.appendChild(b);
    rzAccChips.set(kind, b);
  }
  rzFire(b, 'click', {});
}

/** The mask the ACCEPTS row is currently SHOWING, read back out of the markup it emitted.
 *  OBSERVATION, NOT A MIRROR: the test never tracks what it believes it toggled, so a toggle that
 *  flips the wrong bit cannot be hidden by a bookkeeping variable that flips the same wrong bit. */
function rzShownMask() {
  const html = rzDoc.getElementById('rz-accepts').innerHTML;
  let m = 0;
  for (const mt of html.matchAll(/data-rzaccept="(\d+)"[^>]*aria-pressed="(true|false)"/g)) {
    if (mt[2] === 'true') m |= 1 << Number(mt[1]);
  }
  return m;
}

/** Drive the chips until the row shows exactly `target`, and return what it then shows. STOCKPILE
 *  must be armed (the row is hidden otherwise) — which is how a player reaches them too. */
function rzSetMask(target) {
  for (const { kind } of STOCK_KINDS) {
    const want = ((target | 0) & (1 << kind)) !== 0;
    if (want !== ((rzShownMask() & (1 << kind)) !== 0)) rzAccept(kind);
  }
  return rzShownMask();
}

/** Press at `from`, drag to `to`, release. Returns everything `send` received, oldest first. */
function rzSweep(from, to) {
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(from.x, from.y) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(to.x, to.y) });
  rzMouseUp();
  return rzSent.slice();
}
/** Only the tool payloads — `Cmd.cursor` chatter from the drag is not the subject. */
const rzOrders = (sent) => sent.filter((o) => o.cmd !== 'cursor');
const xy = (o) => [o.x, o.y];

// The fixture's three ALREADY-DESIGNATED dig tiles (fg 15) — read out of the capture, not typed.
const FIX_DIG = roomMarkTiles(wreckMarks, { ...HOLD, deck: DECK1 }).filter((m) => m.mark === 'dig');

test('WP-4 fixture check: the room under test is the live wreck, with real designations in it', () => {
  assert.equal(HOLD.rw * HOLD.rh, 96, 'the hold should be the fixture\'s 12×8 slot');
  assert.equal(FIX_DIG.length, 3,
    'the fixture no longer carries exactly three fg-15 dig designations inside the hold; the sweep '
    + 'tests below are anchored on them, so re-derive their coordinates before adjusting anything');
  assert.deepEqual(FIX_DIG.map((m) => [m.tx, m.ty]), [[28, 16], [29, 16], [30, 16]]);
});

// ⚠️ THE LIGHT REGRESSION, COUNTED ON THE REAL SHIP RATHER THAN ARGUED FROM THE REGISTRY. The pure
// test up in the demolish section builds its own one-tile frame; this one reads the COMMITTED
// `--ship grid` deck-1 capture and finds the lamps in it. `RoomOutfitter.Light` puts one at the
// centre of every room, so "a player can place a lamp and then never remove it" was a live, everyday
// gesture on the one standard surface — not a corner case reachable only from a synthetic frame.
// MUTATION (physically applied, RED): `!isResourceItem(_id)` → `isDeviceItem(_id)` in room-model.js.
test('the Light regression is REAL on the captured grid ship — every lamp tile is demolishable', () => {
  const lamps = [];
  for (let ty = 0; ty < wreck.h; ty += 1) {
    for (let tx = 0; tx < wreck.w; tx += 1) {
      const c = wreck.cells[ty * wreck.w + tx];
      if (Array.isArray(c) && c[0] === '*'.charCodeAt(0)) lamps.push([tx, ty]);
    }
  }
  assert.equal(lamps.length, 5, `the capture carries ${lamps.length} Light glyphs, not 5 — re-count `
    + 'before adjusting, because this number is the size of the regression');
  for (const [tx, ty] of lamps) {
    assert.deepEqual(demolishTarget(tx, ty, null, null, wreck), { kind: 'device', verb: 'remove' },
      `the lamp at (${tx},${ty}) on the SHIPPED grid ship does not classify as a device. `
      + "roomzoom-view.js's switch has no arm for anything else here, so the click is dropped with "
      + 'no command, no toast and no pulse — the player sees the tool do nothing at all.');
  }
  // …and they are where the player can actually click them: inside a room rect, which is the only
  // thing the Room Zoom draws. A lamp in the corridor gap between decks proves nothing.
  const rects = deckSlots(fixView, DECK1).map((s) => s.rect);
  const inRoom = lamps.filter(([tx, ty]) => rects.some(
    (r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h));
  assert.equal(inRoom.length, 4, `${inRoom.length} of the ${lamps.length} lamps sit inside a deck-1 `
    + 'room rect (the fifth is on the corridor row between the two room bands). If this drops to 0 '
    + 'the assertions above stop describing anything a player can reach.');
});

// The palette BAR itself, read out of the markup `buildChrome` actually wrote. Without this, every
// assertion below could be satisfied by a tool the player has no button for: the tests arm through a
// `data-rztool` node they construct themselves, so they would pass against an unrendered palette.
// (This reads the innerHTML string the builder wrote, not the scanned nodes — deliberately kept as
// a string assertion, because it is the MARKUP contract, and it predates the tag scanner.)
test('WP-4: the palette actually PAINTS a DIG and a STRIP button, labelled and armable', () => {
  const html = rzDoc.getElementById('rz-palette').innerHTML;
  assert.ok(html.length > 0, 'the palette painted nothing — this assertion would be vacuous');
  for (const [tool, label] of [['dig', '⛏ DIG'], ['strip', '⚒ STRIP'], ['wall', 'WALL']]) {
    assert.ok(html.includes('data-rztool="' + tool + '"'), `no palette button for '${tool}'`);
    assert.ok(html.includes('>' + label + '<'), `the '${tool}' button is missing its label '${label}'`);
  }
  // And the hint line names the two new hotkeys. ⚠️ AMENDED BY THE NEUTRAL-FIRST-SCREEN PACKAGE:
  // the hint has TWO texts now, and the crib sheet is the ARMED one — with nothing armed the line
  // says what a disarmed room offers instead (select a pawn, right-click to prioritise). So the
  // tool is armed first, and the read is off the live node. The hotkeys themselves are also taught
  // by the onboarding card's "CONTROLS · INSIDE A ROOM" block (`onboarding.js`), which is joined to
  // these same `arm(...)` call sites — so this is no longer the surface's only naming of them.
  rzArm('dig');
  assert.match(rzHint(), /DIG \[G\]/);
  assert.match(rzHint(), /STRIP \[V\]/);
  rzArm('dig');
});

test('WP-4: DIG arms and disarms through the palette, and so does STRIP (one exclusive slot)', () => {
  rzArm('dig');
  assert.equal(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }).length, 1, 'DIG armed → a click designates');
  rzArm('dig');                                    // same button again → disarm
  assert.deepEqual(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }), [], 'disarmed → nothing is sent');
  rzArm('strip');
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'strip');
  rzArm('dig');                                    // a different tool REPLACES, never stacks
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'dig');
  rzArm('dig');
  assert.deepEqual(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }), []);
});

// MUTATION: drop the `g`/`G` branch from onKey ⇒ the sweep after it sends nothing ⇒ RED.
test('WP-4: G arms DIG and V arms STRIP, the console\'s own two bindings (controls.js:262/267)', () => {
  const g = rzKey('G');
  assert.ok(g.defaultPrevented && g.propagationStopped, 'the Room Zoom must swallow its own hotkey');
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'dig');
  rzKey('v');                                       // lowercase too — 'h' was silently dead once
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'strip');
  rzKey('V');                                       // toggles back off
  assert.deepEqual(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }), []);
});

// MUTATIONS this one catches: `Cmd.build` in the order branch; `on: false`; a wrong verb; a
// `paletteOrders` drift on the controls.js side; `roomDragMode → 'single'` OR `→ 'perimeter'`.
//
// ⚠️ THE DRAG IS 3×3 AND THAT IS LOAD-BEARING. An earlier draft swept 3×2, where every tile is on
// the border — so `fill` and `perimeter` COINCIDE and this test could not tell them apart, while its
// own message claimed it was pinning the fill. Reverting `roomDragMode` to perimeter left it green.
// 3×3 is the smallest rectangle with an interior: fill = 9, perimeter = 8.
test('WP-4: a DIG sweep emits one Cmd.dig per tile — byte-identical to paletteOrders\' payload', () => {
  rzArm('dig');
  // Drag across the fixture's own three designated tiles plus the two rows above them.
  const sent = rzOrders(rzSweep({ x: 28, y: 14 }, { x: 30, y: 16 }));
  assert.deepEqual(sent.map(xy), [
    [28, 14], [29, 14], [30, 14],
    [28, 15], [29, 15], [30, 15],
    [28, 16], [29, 16], [30, 16]],
    'a DIG drag must sweep the FILLED rectangle in row-major order (roomDragMode → fill). The '
    + 'centre tile (29,15) is the one a `perimeter` sweep would drop, and it is why this drag is 3×3.');
  assert.ok(sent.some((o) => o.x === 29 && o.y === 15),
    'the INTERIOR tile is missing — the sweep traced an outline, not a region');
  // (a) PARITY BY IMPORT — the console's lowering is the contract, and it is asked, not restated.
  assert.deepEqual(sent, sent.map((o) => paletteOrders('dig', o.x, o.y)[0]),
    'the Room Zoom emitted a different payload than paletteOrders() does for the same verb + tile. '
    + 'Two independent lowering paths now exist for DIG; they must not drift.');
  // (b) THE ABSOLUTE WIRE SHAPE — a change to Cmd.dig itself moves BOTH paths together, so (a) would
  // stay green through it. This is the pin that catches that, and it is the host's own contract
  // (hosts/web/GameSession.cs WebCommand.Parse; client/src/wire/session.js:72).
  assert.deepEqual(sent[0], { cmd: 'dig', x: 28, y: 14, on: 1 });
  rzArm('dig');
});

// The SAME 3×3 drag the WALL control below uses, deliberately: one gesture, two classes, and the
// counts differ — 9 for an ORDER (fill) against 8 for WALL (perimeter). That contrast is the
// cheapest available proof that `roomDragMode` really does branch, in the running controller.
test('WP-4: a STRIP sweep does the same for the deconstruct verb', () => {
  rzArm('strip');
  const sent = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 }));
  assert.deepEqual(sent.map(xy), [
    [24, 11], [25, 11], [26, 11],
    [24, 12], [25, 12], [26, 12],
    [24, 13], [25, 13], [26, 13]]);
  assert.ok(sent.some((o) => o.x === 25 && o.y === 12), 'the interior tile of a STRIP region is missing');
  assert.deepEqual(sent, sent.map((o) => paletteOrders('strip', o.x, o.y)[0]));
  assert.deepEqual(sent[0], { cmd: 'strip', x: 24, y: 11, on: 1 });
  rzArm('strip');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// M1-C — ERASE, DRIVEN. The player can take an order back.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Every leg below drives the SHIPPED controller and asserts on what came out of the injected `send`
// — the repo's fourth countermeasure (record the argument at the seam) rather than a source scan,
// which is defeated by a comment, by whitespace and by an equivalent spelling.
//
// ⚠️ THE ONE THING THESE CANNOT DO is prove the SIM forgot the order: the client suite has no host.
// What they pin is the message, at the wire's own contract (`{cmd,x,y,on:0}`), which is the whole of
// this package's scope — the OFF paths existed and shipped with E0-5. The end-to-end proof is the
// browser run recorded in the package report, not an assertion here.

/** Re-dispatch the mark + zone channels and force the SYNCHRONOUS re-derive `_markTiles`/`_zoneTiles`
 *  ride on. `enter()` repaints inline (`enterRoom` calls `repaint()`, not `scheduleRepaint()`), which
 *  is what lets a test set a tile up and act on it in the same tick. */
function rzSetLayers({ marks, zones }) {
  Hud.renderMarks(marks === undefined ? WRECK_MARKS_MSG : marks);
  Hud.renderZones(zones === undefined ? null : zones);
  // Declared HERE, not at the call sites, so a leg cannot dirty the shared channels without arming
  // the reset. Setting it on the restore call too is harmless — the hook clears it before running.
  _layersDirty = true;
  rzApi.exit();
  rzApi.enter('hold');
}
/** A `marks` wire message from `[x,y,kindName]` triples on the hold's deck. */
const rzMarksMsg = (rows) => ({
  type: 'marks',
  cells: rows.map(([x, y, kind]) => [x, y, DECK1, MARK_KIND_NAMES.indexOf(kind)]),
});
/** A `zones` wire message from `[x,y]` pairs on the hold's deck, all ACCEPT-ALL and not backed off. */
const rzZonesMsg = (rows) => ({ type: 'zones', cells: rows.map(([x, y]) => [x, y, DECK1, ACCEPT_ALL, 0]) });
const rzToast = () => rzDoc.getElementById('rz-toast').textContent;

// The layers are shared module state on `hud.js`, so every erase leg restores them. Registered ONCE,
// beside the helpers, rather than repeated in each test — a leg that throws mid-way must not leave
// the next test looking at a hand-built zone.
//
// ⚠️ IT IS GATED ON `_layersDirty`, ADDED IN REVIEW (2026-07-29). `afterEach` in node:test is
// FILE-WIDE, so the first version of this hook re-dispatched both channels and exited-and-re-entered
// the Room Zoom after ALL 103 tests in this file, not just the five erase legs — a fixture reset
// silently imposed on every unrelated test, and the kind of thing that turns one lane's cleanup into
// another lane's mysterious flake. The flag is set by `rzSetLayers` itself, so a leg cannot forget to
// declare that it dirtied them.
let _layersDirty = false;
afterEach(() => { if (rzApi && _layersDirty) { _layersDirty = false; rzSetLayers({}); } });

// MUTATION 1 (RESTATED — the charter phrased it as a round trip this suite cannot run): hard-code
//   `true` in `erasePayloads`, i.e. `Cmd.dig(x, y, true)` ⇒ the recorded payload reads `on:1` ⇒ RED.
//   The charter's "the tile must still carry the designation" needs a host; `on` is what rides the
//   wire and is what the client is responsible for.
// MUTATION: delete the `pc.cls === 'erase'` branch from `onCanvasUp` ⇒ an erase sweep falls through
//   to the `else` and sends `Cmd.build('undefined', …)` ⇒ RED on the `cmd` assertion.
test('M1-C: ERASE on a designated tile sends the OFF command for the verb that painted it', () => {
  const dig = FIX_DIG[0];
  rzArm('erase');
  const sent = rzOrders(rzSweep({ x: dig.tx, y: dig.ty }, { x: dig.tx, y: dig.ty }));
  assert.equal(sent.length, 1, `an erase on a dig tile sent ${sent.length} commands, not one`);
  assert.deepEqual(sent[0], { cmd: 'dig', x: dig.tx, y: dig.ty, on: 0 },
    'the OFF payload is not the wire contract. `on:0` is the whole feature — `DesignateDigCommand` ' +
    'clears TileFlags.Designated only on the OFF path, and its legality check is `if (_on && …)` so ' +
    'the OFF path is deliberately precondition-free (sim/Sim.Core/Commands/Commands.cs:138-158).');
  assert.match(rzToast(), /TAKEN BACK/, 'an erase that cleared something said nothing about it');
  rzArm('erase');
});

// MUTATION: make `eraseTargetAt` return a verb for an unmarked tile (e.g. default to 'dig') ⇒ RED.
// MUTATION: drop the `if (target)` guard around `erased++` ⇒ RED on the toast leg.
test('M1-C: ERASE on a tile carrying NO order sends nothing — and SAYS so', () => {
  // A tile inside the hold that the fixture's marks do not touch, chosen by asking the fixture.
  const marked = new Set(roomMarkTiles(wreckMarks, { ...HOLD, deck: DECK1 }).map((m) => m.tx + ',' + m.ty));
  let bare = null;
  for (let y = HOLD.ry; y < HOLD.ry + HOLD.rh && !bare; y++) {
    for (let x = HOLD.rx; x < HOLD.rx + HOLD.rw; x++) {
      if (!marked.has(x + ',' + y)) { bare = { x, y }; break; }
    }
  }
  assert.ok(bare, 'every tile in the hold carries a mark — this test would be vacuous');
  rzArm('erase');
  assert.deepEqual(rzOrders(rzSweep(bare, bare)), [],
    'erasing an unordered tile sent a command. The sim would no-op it, which is exactly why the ' +
    'client must not send it: a verb that fires blindly cannot be told from one that fires wrongly.');
  assert.match(rzToast(), /NOTHING TO ERASE/,
    'a sweep that cleared nothing sent nothing and said nothing — indistinguishable from a broken ' +
    'tool (the invisible-feedback rule, HANDOVER §4g)');
  rzArm('erase');
});

// MUTATION 4: drop the sweep path — give `erase` a non-swept class, or remove it from `isSweepTool`
//   ⇒ `onCanvasDown` returns early, no drag is opened, `onCanvasUp` commits nothing ⇒ RED (0 sent).
//   The 3×3 rectangle is load-bearing for the same reason DIG's is: a 3×2 sweep has no interior, so
//   `fill` and `perimeter` coincide and a fill cannot be distinguished from an outline.
test('M1-C: an ERASE DRAG clears every ordered tile under the FILLED rectangle, and only those', () => {
  // A 3×3 block: the centre carries a strip order, the four corners carry dig, the rest is bare.
  const bx = HOLD.rx + 2, by = HOLD.ry + 2;
  rzSetLayers({
    marks: rzMarksMsg([
      [bx, by, 'dig'], [bx + 2, by, 'dig'], [bx, by + 2, 'dig'], [bx + 2, by + 2, 'dig'],
      [bx + 1, by + 1, 'strip'],
    ]),
  });
  rzArm('erase');
  const sent = rzOrders(rzSweep({ x: bx, y: by }, { x: bx + 2, y: by + 2 }));
  assert.equal(sent.length, 5,
    `the drag emitted ${sent.length} commands, not 5 — a 3×3 sweep covers 9 tiles of which 5 carry ` +
    'an order, so this pins BOTH halves: that the drag swept (not clicked) and that it skipped the ' +
    'four bare tiles');
  assert.deepEqual(sent.filter((o) => o.cmd === 'dig').map(xy),
    [[bx, by], [bx + 2, by], [bx, by + 2], [bx + 2, by + 2]],
    'the four dig corners were not all cleared, in row-major sweep order');
  assert.deepEqual(sent.filter((o) => o.cmd === 'strip').map(xy), [[bx + 1, by + 1]],
    'the INTERIOR tile is missing — the sweep traced an outline, not a region (roomDragMode → fill)');
  for (const o of sent) assert.equal(o.on, 0, `${o.cmd} at ${o.x},${o.y} rode with on:${o.on}`);
  assert.match(rzToast(), /5 ORDERS TAKEN BACK/, 'the toast must report the ORDERS cleared, not the 9 tiles dragged over');
  rzArm('erase');
});

// MUTATION 3: reorder ERASE_PRECEDENCE so stockpile beats strip ⇒ RED — the tile emits `stockpile`.
// MUTATION: make `eraseTargetAt` read only `_markTiles` (drop the `roomTileZoned` half) ⇒ RED on the
//   FOGGED-ZONE leg below.
//
// ⚠️ THE FIXTURE CARRIES BOTH FAILURE SHAPES, which is what makes the precedence visible: a tile with
// ONE order and a tile with TWO (strip + zone). With only the one-order shape a reordered precedence
// resolves each tile to itself and the leg is green either way.
//
// ⚠️ WHAT THE TWO-ORDER LEG IS ACTUALLY PROVING — RELABELLED IN REVIEW (2026-07-29). It is NOT that
// the client must choose between two visible layers; on an explored tile a zone reaches `marks` too
// (`roomMarkTiles` reports the stockpile kind even though `markLayerSvg` declines to draw it), so
// `zoned` cannot change the answer there. What it proves is that the precedence makes `zoned`
// HARMLESS: {strip, stockpile} must resolve to the same verb the Overview's singleton {strip} does,
// or the two surfaces would peel a shared tile in different orders.
//
// ⚠️ AND THE THIRD LEG IS A FOGGED ZONE, NOT A "ZONE-ONLY TILE". A zone with no mark row is
// impossible on an EXPLORED tile and ordinary on an unexplored one: `BuildZones` has no fog gate
// (`GameSession.cs:1974-1999`), `BuildMarks` does (`:2053`), and `DesignateStockpileCommand` requires
// only `Walkable` (`Commands.cs:173`). So this leg is the one case the `zones` read exists for — and
// it is also the recorded limit, because the Overview reads no `zones` and can never clear it.
//
// ⚠️ dig+strip and dig+stockpile are excluded by the sim's own preconditions (debris vs. a
// wall/device vs. a walkable empty tile), so they are covered in the PURE test above and cannot be
// driven here. Stated rather than left as a hole.
test('M1-C: on a tile carrying BOTH a strip order and a zone, ERASE takes the ORDER first', () => {
  const bx = HOLD.rx + 4, by = HOLD.ry + 4;
  const both = [bx, by];        // strip order INSIDE a stockpile zone — the two-order shape
  const stripOnly = [bx + 1, by];
  const zoneOnly = [bx + 2, by]; // a zone with NO mark row: the FOGGED zone (see the note above)
  rzSetLayers({
    marks: rzMarksMsg([[both[0], both[1], 'strip'], [stripOnly[0], stripOnly[1], 'strip']]),
    zones: rzZonesMsg([both, zoneOnly]),
  });
  rzArm('erase');
  const at = (t) => rzOrders(rzSweep({ x: t[0], y: t[1] }, { x: t[0], y: t[1] }));

  assert.deepEqual(at(both), [{ cmd: 'strip', x: both[0], y: both[1], on: 0 }],
    'a condemned device inside a stockpile zone gave up its ZONE instead of its STRIP order. An ' +
    'order outranks a zone (hosts/web/GameSession.cs BuildMarks) — cancelling a strip must not ' +
    'silently delete the storage the player painted around it.');
  assert.deepEqual(at(stripOnly), [{ cmd: 'strip', x: stripOnly[0], y: stripOnly[1], on: 0 }]);
  assert.deepEqual(at(zoneOnly), [{ cmd: 'stockpile', x: zoneOnly[0], y: zoneOnly[1], on: 0 }],
    'a FOGGED zone — a `zones` row with no `marks` row — was not erased at all. That state is real: ' +
    '`BuildZones` has no fog gate and `BuildMarks` does, and a stockpile can be painted on an ' +
    'unexplored tile. Dropping the `roomTileZoned` half of the lookup makes such a zone un-erasable ' +
    'on BOTH surfaces while every other leg here stays green.');

  // ⚠️ STOCKPILE OFF IS **ONE** COMMAND. The paint path always sends `Cmd.stockpile` THEN
  // `Cmd.filter`; the OFF path must not, because `DesignateStockpileCommand` clears the filter itself
  // and a trailing mask would orphan one on a tile that is no longer a zone.
  assert.equal(at(zoneOnly).length, 1,
    'the erase sent a Cmd.filter after clearing the zone — an orphan mask in the ZONE hash');
  rzArm('erase');
});

// ⚠️ THE NUDGE CONDITION, PINNED — ADOPTED IN REVIEW (2026-07-29). `onCanvasUp` guards the paused
// nudge with `pc.cls !== 'erase' || erased`, and it carries a paragraph explaining why: a command
// only reaches the sim on a TICK, so on a paused ship the mark the player just cancelled stays on the
// floor — but an erase that found nothing sent nothing, so it has nothing to nag about. The condition
// SURVIVED DELETION with the whole suite green, i.e. the paragraph was justifying an untested line.
// Pin the flip or drop the paragraph; this pins the flip.
//
// The reset is a MANUAL `hidden = true` between the arm and the gesture, because arming is itself an
// intent and nudges (`arm()` line ~892). `paint()` writes only when the derived visibility differs
// from the element, and nothing else on this surface repaints the nudge, so a manual hide is a clean
// zero without reaching into the controller's private state.
//
// MUTATION: `if (true) nudgeOnIntent();` ⇒ RED on the "nothing erased" leg.
// MUTATION: `if (false) nudgeOnIntent();` (or delete the call) ⇒ RED on the "something erased" leg.
test('M1-C: a paused ship is nudged when an erase LANDS, and not when it clears nothing', () => {
  const dig = FIX_DIG[0];
  const nudge = rzDoc.getElementById('rz-nudge');
  assert.ok(nudge, 'no #rz-nudge in the rig — every assertion below would be vacuous');
  Hud.renderStatus({ type: 'status', paused: true });
  try {
    rzArm('erase');
    // (a) an erase that CLEARS something nudges: the sim is stopped, so the mark is still on the floor.
    nudge.hidden = true;
    const sent = rzOrders(rzSweep({ x: dig.tx, y: dig.ty }, { x: dig.tx, y: dig.ty }));
    assert.equal(sent.length, 1, 'the fixture tile carries no order — this leg would be vacuous');
    assert.equal(nudge.hidden, false,
      'a designation was cancelled on a STOPPED ship and nothing said so. The command only reaches ' +
      'the sim on a tick, so the mark the player just took back is still on the floor.');

    // (b) an erase that clears NOTHING must not nudge — it sent no command, so nothing is waiting
    //     on the sim and "press space to run the ship" would be the affordance firing with nothing
    //     to say. This is the leg the guard exists for.
    nudge.hidden = true;
    let bare = null;
    const marked = new Set(roomMarkTiles(wreckMarks, { ...HOLD, deck: DECK1 }).map((m) => m.tx + ',' + m.ty));
    for (let y = HOLD.ry; y < HOLD.ry + HOLD.rh && !bare; y++) {
      for (let x = HOLD.rx; x < HOLD.rx + HOLD.rw; x++) if (!marked.has(x + ',' + y)) { bare = { x, y }; break; }
    }
    assert.ok(bare, 'every tile in the hold carries a mark — this leg would be vacuous');
    assert.deepEqual(rzOrders(rzSweep(bare, bare)), [], 'the "bare" tile was not bare');
    assert.equal(nudge.hidden, true,
      'an erase that cleared NOTHING still nudged about the pause. It sent no command, so there is ' +
      'nothing for the sim to do and nothing for the nudge to be about.');

    // (c) CONTROL: the non-erase path is untouched — a DIG sweep on the same stopped ship nudges.
    rzArm('erase'); rzArm('dig');
    nudge.hidden = true;
    rzSweep({ x: dig.tx, y: dig.ty }, { x: dig.tx, y: dig.ty });
    assert.equal(nudge.hidden, false, 'the guard leaked out of the erase branch and silenced DIG too');
    rzArm('dig');
  } finally {
    Hud.renderStatus({ type: 'status', paused: false });
    nudge.hidden = true;
  }
});

// MUTATION: drop the `c`/`C` branch from `onKey` ⇒ the sweep after it sends nothing ⇒ RED.
test('M1-C: C arms ERASE on the Room Zoom, both cases, and swallows the key', () => {
  const dig = FIX_DIG[0];
  const c = rzKey('C');
  assert.ok(c.defaultPrevented && c.propagationStopped, 'the Room Zoom must swallow its own hotkey');
  assert.equal(rzOrders(rzSweep({ x: dig.tx, y: dig.ty }, { x: dig.tx, y: dig.ty }))[0].on, 0);
  rzKey('c');   // lowercase too — 'h' was silently dead once (controls.js:262)
  assert.deepEqual(rzSweep({ x: dig.tx, y: dig.ty }, { x: dig.tx, y: dig.ty }), [],
    'the second C did not disarm');
  // …and it is the ONE exclusive slot, shared with the other tool hotkeys.
  rzKey('c');
  rzKey('G');
  assert.equal(rzOrders(rzSweep({ x: dig.tx, y: dig.ty }, { x: dig.tx, y: dig.ty }))[0].on, 1,
    'G did not replace ERASE — the palette has one exclusive slot');
  rzKey('g');
});

// MUTATION: remove 'erase' from ROOM_TOOLS ⇒ no button is painted ⇒ RED (and the census + the three
//   derived button counts go red too — that is mutation 2, and it is deliberately spread).
test('M1-C: the palette PAINTS an ERASE button, labelled, and the hint names its hotkey', () => {
  const html = rzDoc.getElementById('rz-palette').innerHTML;
  assert.ok(html.length > 0, 'the palette painted nothing — this assertion would be vacuous');
  assert.ok(html.includes('data-rztool="erase"'), 'no palette button for erase');
  assert.ok(html.includes('>' + TOOL_LABEL.erase + '<'),
    `the erase button is missing its label '${TOOL_LABEL.erase}'`);
  rzArm('erase');                                 // the crib sheet is the ARMED hint (see rzHint)
  assert.match(rzHint(), /ERASE \[C\]/,
    'the armed palette hint does not name the C hotkey');
  rzArm('erase');
  // ERASE AND DEMOLISH MUST NOT WEAR THE SAME ICON. They are the most confusable pair on the bar
  // (one takes an ORDER off a tile, the other takes a THING off the floor) and colour alone does not
  // separate them for a player scanning seventeen labels.
  assert.notEqual(TOOL_LABEL.erase.charAt(0), TOOL_LABEL.demolish.charAt(0),
    'ERASE and DEMOLISH now open with the same glyph');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// STOCKPILE ON THE ROOM ZOOM PALETTE — the verb that came down from the Overview
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY IT MOVED, in one line, because it is the only justification for the two tests below being
// different in shape from DIG's: `JobWork.IsFreeStockpileTile` is "Stockpile + Walkable + empty",
// ONE STACK PER TILE, so a zone's AREA is its CAPACITY. The extent is not incidental to the verb, it
// is the verb — and the Overview has no drag gesture at all (zero mousedown/mousemove/pointerdown in
// `overview-view.js`), so painting a 5×8 zone there was forty clicks.
//
// THE DRAG IS 3×3 AND THAT IS LOAD-BEARING, exactly as it is for DIG (WP-4's send-back): a 3×2 sweep
// has every tile on the border, so `fill` and `perimeter` COINCIDE and a test claiming to pin a fill
// cannot see it. 3×3 is the smallest rectangle with an interior — fill = 9, perimeter = 8 — and the
// interior tile is asserted by name.
//
// MUTATIONS this one catches: `roomDragMode → 'single'` or `→ 'perimeter'` for stockpile; the
// `Cmd.filter` half dropped from `orderPayloads`; the pair emitted in the WRONG ORDER; `Cmd.build`
// in the order branch; a mask read per-tile instead of once per sweep.
test('a STOCKPILE sweep zones the FILLED rectangle, and emits BOTH commands per tile', () => {
  rzArm('stockpile');
  const FOOD = 1 << 3;
  assert.equal(rzSetMask(FOOD), FOOD,               // FOOD only — NOT the accept-all default
    'the chips did not settle on FOOD-only; every mask assertion below would then be checking the ' +
    'wrong number against itself');
  const sent = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 }));
  assert.equal(sent.length, 18, 'a 3×3 stockpile sweep is NINE tiles × TWO commands. Anything else ' +
    'is a dropped filter, a perimeter sweep, or a single-tile click.');
  const zones = sent.filter((o) => o.cmd === 'stockpile');
  const filters = sent.filter((o) => o.cmd === 'filter');
  assert.deepEqual(zones.map(xy), [
    [24, 11], [25, 11], [26, 11],
    [24, 12], [25, 12], [26, 12],
    [24, 13], [25, 13], [26, 13]],
    'the zone must sweep the FILLED rectangle in row-major order (roomDragMode → fill). The centre ' +
    'tile (25,12) is the one a `perimeter` sweep drops — and dropping it means the zone the player ' +
    'painted holds 8 stacks instead of 9.');
  assert.ok(zones.some((o) => o.x === 25 && o.y === 12),
    'the INTERIOR tile is missing — the sweep traced an outline, so the zone is hollow');
  assert.deepEqual(filters.map(xy), zones.map(xy), 'a filter is missing (or misplaced) for some tile');
  // ORDER, PER TILE, not merely in aggregate: `DesignateStockpileCommand` OFF *clears* the filter, so
  // an interleaving that put `filter` first would break the day an OFF path is added.
  for (let i = 0; i < sent.length; i += 2) {
    assert.equal(sent[i].cmd, 'stockpile', `payload ${i} is not the zone — the pair is out of order`);
    assert.equal(sent[i + 1].cmd, 'filter', `payload ${i + 1} is not the filter`);
    assert.deepEqual([sent[i].x, sent[i].y], [sent[i + 1].x, sent[i + 1].y],
      'a zone and the filter beside it name different tiles');
  }
  // (a) PARITY BY IMPORT — the console's lowering is the contract, and it is asked, not restated.
  assert.deepEqual(sent, zones.flatMap((o) => paletteOrders('stockpile', o.x, o.y, FOOD)),
    'the Room Zoom emitted a different payload than paletteOrders() does for the same verb, tile '
    + 'and mask. Three independent lowering paths exist for these verbs; they must not drift.');
  // (b) THE ABSOLUTE WIRE SHAPE — a change to Cmd.stockpile/Cmd.filter moves BOTH paths together, so
  // (a) would stay green through it.
  assert.deepEqual(sent.slice(0, 2), [
    { cmd: 'stockpile', x: 24, y: 11, on: 1 },
    { cmd: 'filter', x: 24, y: 11, mask: 1 << 3 },
  ]);
  // The mask is genuinely READ, not defaulted: a non-default mask must survive to every tile.
  for (const f of filters) assert.notEqual(f.mask, ACCEPT_ALL, `tile (${f.x},${f.y}) lost the mask`);
  assert.equal(new Set(filters.map((f) => f.mask)).size, 1,
    'one sweep painted two different masks');
  rzArm('stockpile');
});

// ⚠️ THE MUTATION THIS TEST USED TO NAME IS GONE, AND SO IS THE HAZARD IT NAMED. Its predecessor
// installed a getter whose value CHANGED on every call, because a per-tile read and a per-sweep read
// of a CONSTANT getter are indistinguishable. WP-6 removed the getter: the mask is module state whose
// only writer is a DOM click handler, and `onCanvasUp`'s commit loop is synchronous, so no value can
// change between tile 1 and tile 9 and a per-tile read could not be observed to differ. That is
// stated in `roomzoom-view.js` beside the read, NOT tested, because there is no longer a mechanism by
// which it could fail. Pretending otherwise would be a test whose named mutation cannot bite.
//
// WHAT REPLACES IT IS A DIFFERENT AND STILL-REACHABLE PROPERTY: the mask is read at COMMIT, not at
// PRESS. A player who starts a drag, changes their mind about FOOD and releases gets the rectangle
// the chips are showing when they let go. MUTATION (applied, RED): stash the mask on `_drag` in
// `onCanvasDown` and read `drag.mask` in `onCanvasUp` — the plausible refactor — and all nine tiles
// come out wearing the pre-toggle filter.
test('the mask is read at COMMIT, not at press — a chip flipped mid-drag lands on the whole sweep', () => {
  rzArm('stockpile');
  const FOOD = 1 << 3;
  assert.equal(rzSetMask(FOOD), FOOD);
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(24, 11) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(26, 13) });
  // …mid-drag, the player also wants PARTS in this zone.
  rzAccept(5);
  const WANT = FOOD | (1 << 5);
  assert.equal(rzShownMask(), WANT, 'the chip click did not reach the row — the rest is vacuous');
  rzMouseUp();

  const filters = rzOrders(rzSent).filter((o) => o.cmd === 'filter');
  assert.equal(filters.length, 9, 'the sweep did not commit nine filters — this test would be vacuous');
  assert.equal(new Set(filters.map((f) => f.mask)).size, 1,
    'one dragged rectangle came out wearing several different filters');
  assert.equal(filters[0].mask, WANT,
    `the sweep painted ${filters[0].mask}, not ${WANT}. The accept-mask is being captured when the ` +
    'drag STARTS rather than when it is committed, so the rectangle wears a filter the chips stopped ' +
    'showing before the player released.');
  assert.notEqual(WANT, FOOD);            // non-vacuity: the two masks really differ
  assert.notEqual(WANT, ACCEPT_ALL);      // …and neither is the default
  rzArm('stockpile');
});

// MUTATION: `let _getStockFilter = () => 0;` (ACCEPT-NOTHING) ⇒ RED here and NOWHERE ELSE — that is
// the whole reason the probe mount exists, and the identical hole survived a green suite on the
// Overview until WP-5's review found it. Also caught: dropping the `Number.isFinite` fallback (the
// dangerous version of which is returning `[Cmd.stockpile(…)]` alone — silence, which lets a tile
// keep an earlier restrictive filter the player has just repainted as accept-all).
test('an UN-INJECTED palette zones ACCEPT-ALL — never silence, never accept-nothing', () => {
  // Captured at module scope from a throwaway mount with no `getStockFilter` (see the probe above).
  assert.deepEqual(PROBE_DEFAULT, paletteOrders('stockpile', 24, 11, defaultStockFilter()),
    'with nobody injecting a mask the Room Zoom no longer falls back to the SHARED ' +
    '`defaultStockFilter()`. Accept-nothing is the dangerous direction — a zone that silently ' +
    'refuses every item looks exactly like one nothing has been hauled to yet.');
  assert.equal(PROBE_DEFAULT.length, 2, 'the un-injected default sent no filter at all');
  assert.equal(PROBE_DEFAULT[1].mask, ACCEPT_ALL);
  assert.equal(defaultStockFilter(), ACCEPT_ALL);          // …and the shared default IS accept-all
  // Non-vacuity: the probe must have exercised the real lowering, not an empty array.
  assert.equal(PROBE_DEFAULT[0].cmd, 'stockpile');
  assert.deepEqual([PROBE_DEFAULT[0].x, PROBE_DEFAULT[0].y], [24, 11]);
});

// A JUNK CHIP CANNOT POISON THE MASK. The predecessor of this test fed garbage through the injected
// getter (`undefined`, `NaN`, `'nonsense'`) to prove `orderPayloads`' `Number.isFinite` fallback. With
// the getter gone, `_stockFilter` can only ever be what `toggleStockKind` returned, so that fallback
// is now UNREACHABLE FROM THE UI — kept as defence-in-depth (the wire contract still says a stockpile
// paint must assert a filter and never fall silent), and honestly no longer driven from here.
//
// The reachable hazard moved to the chip's own attribute, and it BIT THIS PACKAGE'S FIRST DRAFT.
// `onAcceptChip` parsed with `parseInt(raw, 10)`; `parseInt('nonsense', 10)` is `NaN`, `NaN | 0` is
// `0`, and `0` is a perfectly valid ItemKind — so a chip with a missing, blanked or corrupted
// attribute silently toggled REGOLITH on every click, a filter change the player never asked for and
// could not see the cause of. MUTATION: restore `parseInt` ⇒ RED on the first two rows below.
test('a chip with a junk kind attribute changes nothing — NaN must not read as REGOLITH', () => {
  rzArm('stockpile');
  // '10' is the first index PAST the last ItemKind: 7 (Seals, E0-6), 8 (Ice, E0-7) and 9 (Swarf,
  // the wreck start) each became real in turn and moved out of this list into the real-kind case
  // below. A literal here goes stale every time a kind lands — which is exactly what happened.
  for (const junk of ['nonsense', '', '-1', '10', '32', '3.5']) {
    const before = rzShownMask();
    const b = new RzEl(rzDoc, 'button');
    b.dataset.rzaccept = junk;
    b.setAttribute('data-rzaccept', junk);
    rzRoot.appendChild(b);
    rzFire(b, 'click', {});
    b.remove();
    assert.equal(rzShownMask(), before,
      `a chip carrying data-rzaccept="${junk}" moved the mask from ${before} to ${rzShownMask()}`);
  }
  // Non-vacuity: the same machinery DOES move the mask for a real kind, so the six no-ops above are
  // not merely a handler that never runs.
  rzAccept(3);
  assert.notEqual(rzShownMask(), ACCEPT_ALL, 'a REAL chip click did not move the mask either');
  rzArm('stockpile');
});

// Silence is still the failure that matters — a zone repainted as accept-all that sends no filter
// keeps its old restriction — so the PAIR is pinned directly, at both ends of the mask range.
test('every zoned tile asserts a filter, accept-all and accept-nothing alike — never silence', () => {
  rzArm('stockpile');
  for (const target of [ACCEPT_ALL, 0, 1 << 6]) {
    assert.equal(rzSetMask(target), target, `the chips could not be driven to ${target}`);
    const sent = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 }));
    assert.equal(sent.length, 2, `mask=${target} sent ${sent.length} commands, not the pair — a ` +
      'stockpile paint that says nothing about its filter leaves the tile wearing the last one');
    assert.equal(sent[1].cmd, 'filter');
    assert.equal(sent[1].mask, target, `mask=${target} painted ${sent[1].mask} instead`);
  }
  rzArm('stockpile');
});

// The palette BAR itself, read out of the markup `buildChrome` actually wrote — the same reasoning as
// WP-4's palette test: every test above arms through a `data-rztool` node it constructs itself, so
// they would all pass against a palette the player has no STOCKPILE button on.
test('the palette PAINTS a STOCKPILE button, labelled, and the hint names its hotkey', () => {
  const html = rzDoc.getElementById('rz-palette').innerHTML;
  assert.ok(html.length > 0, 'the palette painted nothing — this assertion would be vacuous');
  assert.ok(html.includes('data-rztool="stockpile"'), 'no palette button for stockpile');
  assert.ok(html.includes('>' + TOOL_LABEL.stockpile + '<'),
    `the stockpile button is missing its label '${TOOL_LABEL.stockpile}'`);
  rzArm('stockpile');                             // the crib sheet is the ARMED hint (see rzHint)
  assert.match(rzHint(), /STOCKPILE \[Z\]/,
    'the armed palette hint does not name the Z hotkey');
  rzArm('stockpile');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE PALETTE-OVERFLOW PACKAGE — the armed tool, said in words.
//
// The package's subject is a LAYOUT defect (three tools clipped off the right edge below ~1250px,
// with the scrollbar deliberately hidden), and no assertion in node can see layout — that is what
// `client/tools/palette-shot.mjs` is for, and this file must not pretend otherwise. What IS testable
// here, and belongs to the same complaint from a different cause, is that the palette used to
// announce its armed tool with a COLOUR AND NOTHING ELSE: fifteen buttons at the time (seventeen
// today), no `aria-pressed`, so a
// screen reader could read every label and not one word about which one is holding the cursor. The
// ACCEPTS chips three pixels above them have carried `aria-pressed` since WP-6 (§4j).
//
// These are driven through the SHIPPED buttons — `_el.toolBtns`, the nodes `buildChrome` wrote —
// and through the SHIPPED delegated click handler, not through a stand-in with the right dataset.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The scanned palette button for `tool`, or undefined. */
const rzToolBtn = (tool) => rzPalette.querySelectorAll('.rz-tool').find((b) => b.dataset.rztool === tool);
/** Every tool button's `aria-pressed`, keyed by tool — `null` where the attribute is absent. */
const rzPressed = () => Object.fromEntries(
  rzPalette.querySelectorAll('.rz-tool').map((b) => [b.dataset.rztool, b.getAttribute('aria-pressed')]));

// MUTATION: emit `type="submit"` (or drop the attribute) ⇒ RED on the type leg.
// MUTATION: drop `aria-pressed="false"` from the `buildChrome` markup ⇒ RED on the MARKUP leg.
//
// ⚠️ THE MARKUP LEG WAS ADDED BECAUSE THE NODE-VALUE LEG COULD NOT SEE THAT MUTATION — found by
// physically applying it and watching the suite stay green, not by reading the test. Dropping the
// attribute from the builder is invisible to a reader of the live nodes, because `paintPalette` runs
// on entry and writes `'false'` onto all seventeen before any assertion gets to look. The two legs are
// therefore about two different things and BOTH are needed: `html` is the string `buildChrome`
// wrote (this stub never re-serialises it from attributes, so it stays the BUILDER's output), and
// `rzPressed()` is what the PAINTER left on the nodes.
test('every palette tool is a real <button type="button"> that starts UNPRESSED', () => {
  const btns = rzPalette.querySelectorAll('.rz-tool');
  assert.equal(btns.length, ROOM_TOOLS.length,
    `the tag scanner found ${btns.length} tool buttons, not ${ROOM_TOOLS.length} — every assertion ` +
    'below would be vacuous, so this is checked first');
  const html = rzPalette.innerHTML;
  assert.equal((html.match(/<button type="button" class="rz-tool/g) || []).length, ROOM_TOOLS.length,
    'a palette tool is not a `<button type="button">`. Inside a form the default type is `submit`, ' +
    'and the ACCEPTS chips beside these already spell it out — one palette, one button vocabulary');
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, ROOM_TOOLS.length,
    'the palette MARKUP no longer declares `aria-pressed="false"` on every tool. The painter would ' +
    'still write it on entry, so nothing on screen changes — but a toggle button that is born ' +
    'without the attribute is a plain button until the first repaint, and the attribute is the ' +
    'builder\'s statement about what kind of control this is.');
  for (const [tool, v] of Object.entries(rzPressed()))
    assert.equal(v, 'false', `'${tool}' does not start at aria-pressed="false" (it reads ${v})`);
});

// MUTATION: delete the `setAttr(b, 'aria-pressed', …)` line from `paintPalette` ⇒ RED (nothing moves
//           off 'false' when a tool is armed).
// MUTATION: write `'true'` unconditionally ⇒ RED (seventeen pressed buttons, not one).
// MUTATION: write `on ? 'true' : null` — the realistic "just remove it when off" mistake ⇒ RED on
//           the disarm leg, which is why the disarm leg asserts 'false' rather than "not true".
test('arming a tool through its own button moves aria-pressed, and only ever onto ONE button', () => {
  const dig = rzToolBtn('dig');
  assert.ok(dig, 'no scanned DIG button — the rest of this test would be vacuous');

  rzFire(dig, 'click', {});                       // the real node, the real delegated handler
  const armed = rzPressed();
  assert.equal(armed.dig, 'true', 'DIG was clicked and does not say it is pressed');
  assert.equal(Object.values(armed).filter((v) => v === 'true').length, 1,
    'more than one tool claims aria-pressed="true" — the palette has ONE exclusive slot');
  // …and the attribute is not decoration: the same click really armed the verb.
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'dig',
    'the button that says it is pressed did not arm DIG — the aria state is lying');

  rzFire(rzToolBtn('strip'), 'click', {});        // a DIFFERENT tool replaces, never stacks
  const moved = rzPressed();
  assert.equal(moved.strip, 'true');
  assert.equal(moved.dig, 'false', 'the previously armed tool still claims to be pressed');
  assert.equal(Object.values(moved).filter((v) => v === 'true').length, 1);

  rzFire(rzToolBtn('strip'), 'click', {});        // same button again → disarm
  const off = rzPressed();
  assert.equal(off.strip, 'false', 'a disarmed tool must read "false", not lose the attribute — an ' +
    'absent aria-pressed turns a toggle back into a plain button');
  assert.equal(Object.values(off).filter((v) => v === 'true').length, 0);
  assert.deepEqual(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }), [],
    'disarmed by its own button, yet a click still designated');
});

/**
 * THE `.on` CLASS — the seam the ARMED LOOK hangs off, driven end to end.
 *
 * ⚠️ WHY THIS IS SEPARATE FROM THE `aria-pressed` TEST ABOVE, which drives the same click. They are
 * read by different consumers and only one of them is on the screen: `aria-pressed` is what a screen
 * reader announces, `.on` is the ONLY hook `styles.css` has for painting the armed button. The
 * owner's 2026-08-03 live-play complaint was that the button "never changes state" — and the cause
 * was in the stylesheet, not here (see the block comment over `.rz-tool` in `styles.css`). That fix
 * is worth nothing the moment this class stops tracking `_armed`, and until now NOTHING asserted it:
 * `paintPalette`'s `setCls(b, 'on', on)` could be deleted outright and every test in this file stayed
 * green, because the aria test reads the attribute and the chrome tests read the label.
 *
 * Driven through the SHIPPED buttons and the SHIPPED delegated handler, and disarmed through the
 * REAL ESC rung (`escStackRung` → 'disarm') rather than a second click — ESC is the path the owner's
 * sentence names ("returns to rest on ESC"), and it reaches `paintPalette` by a different route.
 *
 * ⚠️ THE LEGS ARE BLINDED (trap shape 5): each check appends to `bad` instead of throwing, so a
 * failure reports EVERY state that is wrong rather than only the first. A one-assert version of this
 * test would have said "arming did not light the button" and never mentioned that ESC also left it
 * lit — two different defects with one symptom each.
 *
 * MUTATION: delete `setCls(b, 'on', on)` from `paintPalette` ⇒ RED (nothing ever lights).
 * MUTATION: `setCls(b, 'on', true)` ⇒ RED (all EIGHTEEN light, and rest/ESC never go dark).
 * MUTATION: drop the `paintPalette()` call from `arm()` ⇒ RED (the class never moves at all).
 */
test('the ARMED LOOK tracks the armed tool: `.on` lands on one button and leaves it on ESC', () => {
  const lit = () => rzPalette.querySelectorAll('.rz-tool')
    .filter((b) => b.classList.contains('on')).map((b) => b.dataset.rztool);
  const bad = [];
  const expect = (where, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want))
      bad.push(`${where}: .on is on [${got}], expected [${want}]`);
  };

  // Non-vacuity FIRST: an "exactly these buttons are lit" assertion over an empty scan is free.
  assert.equal(rzPalette.querySelectorAll('.rz-tool').length, ROOM_TOOLS.length,
    'the scanner found no palette buttons — every leg below would pass against nothing');

  expect('at rest', lit(), []);

  const wall = rzToolBtn('wall');
  assert.ok(wall, 'no scanned WALL button — the rest of this test would be vacuous');
  rzFire(wall, 'click', {});
  expect('after arming WALL', lit(), ['wall']);

  rzFire(rzToolBtn('demolish'), 'click', {});   // a different tool REPLACES, never stacks
  expect('after switching to DEMOLISH', lit(), ['demolish']);

  const esc = rzKey('Escape');                  // the real disarm rung, not a second click
  if (!esc.defaultPrevented) bad.push('the Room Zoom did not swallow ESC — the rung never ran');
  expect('after ESC', lit(), []);

  assert.deepEqual(bad, [], 'the armed button does not look armed:\n  ' + bad.join('\n  '));
});

// ── the same seam on the TWO OPTION ROWS under the palette ──────────────────────────────────────
// A `data-rzmat` driver, built exactly like `rzAccept` above and for the same reason: `dom-lite`
// parses no markup, so the chips `paintMatStrip` writes as one `innerHTML` string are not clickable
// nodes here. The click goes through the SHIPPED delegated `closest('[data-rzmat]')` handler, so what
// is driven is the real resolution path; that the strip really EMITS those nodes is read back off the
// markup the painter wrote.
const rzMatChips = new Map();
function rzMat(mat) {
  let b = rzMatChips.get(mat);
  if (!b) {
    b = new RzEl(rzDoc, 'button');
    b.dataset.rzmat = String(mat);
    b.setAttribute('data-rzmat', String(mat));
    rzRoot.appendChild(b);
    rzMatChips.set(mat, b);
  }
  rzFire(b, 'click', {});
}

/**
 * Which chips in `containerId` are wearing `.on`, and which exist at all — read out of the markup the
 * painter emitted. OBSERVATION, NOT A MIRROR, for `rzShownMask`'s reason: the test never records what
 * it believes it selected, so a click that lights the WRONG chip cannot be hidden by a bookkeeping
 * variable that moved the same wrong way.
 */
function rzChipState(containerId, cls, attr) {
  const html = rzDoc.getElementById(containerId).innerHTML;
  const all = [], lit = [];
  for (const m of html.matchAll(new RegExp(`class="${cls}([^"]*)"[^>]*data-${attr}="([^"]*)"`, 'g'))) {
    all.push(m[2]);
    if (/(?:^|\s)on(?:\s|$)/.test(m[1])) lit.push(m[2]);
  }
  return { all, lit };
}

/**
 * THE `.on` CLASS ON THE OPTION ROWS — the seam the chips' armed look hangs off, driven end to end.
 *
 * ⭐ THE SAME TEST AS ITS SIBLING ABOVE, EXTENDED TO THE CLASS RATHER THAN WRITTEN FOR ONE MEMBER.
 * The palette lane pinned `.on` on `.rz-tool` and fixed the colour collision there; its reviewer then
 * found the identical collision one row down, on chips whose `.on` seam NOTHING drove. The CSS fix
 * for `.rz-mat-chip` and `.rz-acc-chip` is worth exactly nothing the moment the class stops tracking
 * the state the player is choosing, and this is the half a browserless gate can keep.
 *
 * ⚠️ NO NEW STATE WAS ADDED FOR THE ARMED LOOK, AND THAT IS THE PROPERTY DRIVEN HERE. Both rows
 * already wrote `.on` off the SAME state that drives the selection — `activeMaterial(_materials,
 * tool)` for the swatches (roomzoom-view.js:1125), `stockKindAccepted(mask, kind)` for the ACCEPTS
 * chips (accepts-row.js:95) — so the fix is CSS only. The two rows differ in ARITY and both shapes
 * are checked: the swatches are a RADIO group (exactly one lit, always), the ACCEPTS chips are TEN
 * independent toggles (all lit at rest, since an untouched stockpile accepts everything). ⚠️ TEN
 * MEASURED TWICE TODAY — `STOCK_KINDS.length` is 10 and `palette-shot.mjs` printed `10 chips, 10 lit
 * at boot` off the live DOM. An earlier draft of both this sentence and the one below said "seven",
 * which is stale by three ItemKinds; the leg itself never read a literal (it compares against
 * `STOCK_KINDS.length`), so the prose was wrong while the test was right. The same stale "seven"
 * survives in `accepts-row.js:28`, `accepts-row.test.js:39`/`:141` and `surface-boundary.test.js`
 * :679/:715/:748 — pre-existing, FILED rather than swept from here.
 *
 * ⚠️ THE LEGS ARE BLINDED (trap shape 5): every check appends to `bad`, so a failure names each row
 * that has drifted instead of only the first.
 *
 * MUTATION: emit the material chips without the `(m.mat === active ? ' on' : '')` clause ⇒ RED
 *           (nothing in the strip ever lights, at any selection).
 * MUTATION: emit them with a constant `' on'` ⇒ RED (all six light; the radio-arity leg names it).
 * MUTATION: drop `paintMatStrip()` from `arm()` ⇒ RED (the strip never appears).
 * MUTATION: invert `accepts-row.js`'s `(on ? ' on' : '')` ⇒ RED (the chips the player kept OUT are
 *           the lit ones — a defect `aria-pressed` alone cannot see, because that stays correct).
 */
test('the ARMED LOOK tracks the option rows too: `.on` follows the material and the accept-mask', () => {
  const bad = [];
  const expect = (where, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want))
      bad.push(`${where}: .on is on [${got}], expected [${want}]`);
  };

  // ── the material swatches: a RADIO group, exactly one lit ──────────────────────────────────
  rzArm('wall');                                   // the strip is populated on arm, not before
  const mats = rzChipState('rz-matstrip', 'rz-mat-chip', 'rzmat');
  // Non-vacuity FIRST, and it is the whole risk: "exactly these chips are lit" is free over an
  // empty scan, and this row is emitted as an innerHTML string that could be '' without a word.
  assert.ok(mats.all.length >= 2, `the material strip painted ${mats.all.length} chips — every leg ` +
    'below would pass against nothing');
  expect('the armed WALL strip', mats.lit.length, 1);
  const other = mats.all.find((m) => m !== mats.lit[0]);
  assert.ok(other !== undefined, 'every material chip carries the same `data-rzmat` — the switch leg ' +
    'below could not tell a moved selection from a stuck one');
  rzMat(other);                                    // the player picks a different material
  expect('after picking another material', rzChipState('rz-matstrip', 'rz-mat-chip', 'rzmat').lit,
    [other]);                                      // it MOVED — a radio group never stacks
  rzMat(mats.lit[0]);                              // put it back, so the surface is left as found
  expect('after picking the first one back', rzChipState('rz-matstrip', 'rz-mat-chip', 'rzmat').lit,
    [mats.lit[0]]);
  rzArm('wall');                                   // disarm — afterEach normalises, but not silently

  // ── the ACCEPTS chips: TEN INDEPENDENT toggles, all lit at rest (count from STOCK_KINDS, never
  //    a literal — see the header; "seven" was three ItemKinds stale) ─────────────────────────
  rzArm('stockpile');
  const acc = rzChipState('rz-accepts', 'rz-acc-chip', 'rzaccept');
  assert.equal(acc.all.length, STOCK_KINDS.length,
    `the ACCEPTS row painted ${acc.all.length} chips, not ${STOCK_KINDS.length} — the legs below ` +
    'would be reading a row that is not there');
  expect('an untouched stockpile', acc.lit.length, acc.all.length);
  const kind = String(STOCK_KINDS[1].kind);
  rzAccept(kind);                                  // keep ONE kind out
  const off = rzChipState('rz-accepts', 'rz-acc-chip', 'rzaccept');
  expect('after keeping one kind out', off.lit.length, acc.all.length - 1);
  if (off.lit.includes(kind))
    bad.push(`kind ${kind} was toggled OUT and its chip is still lit — the armed look is painting ` +
      'the opposite of the filter, which every `aria-pressed` assertion in this file would miss');
  rzAccept(kind);                                  // and back, so the mask is left as found
  expect('after letting it back in', rzChipState('rz-accepts', 'rz-acc-chip', 'rzaccept').lit.length,
    acc.all.length);
  rzArm('stockpile');

  assert.deepEqual(bad, [], 'the option rows do not look armed:\n  ' + bad.join('\n  '));
});

// D2 — THE SHARED HARNESS CAPABILITY ITSELF, and it is not navel-gazing. `removeAttribute` exists in
// `dom-lite.js` for exactly one reason: so that `if (on) setAttribute(…) else removeAttribute(…)` —
// the realistic form of the aria-pressed mistake — can be APPLIED as a mutation instead of dying on
// a `TypeError` and reddening the wrong thing. Replacing it with a no-op left the whole suite green,
// which is precisely how a shared stub silently stops working and turns the NEXT reviewer's mutation
// into a false green: the failure mode the method was added to prevent, reproduced by its absence of
// coverage. One assertion, in the file that uses the stub hardest.
//
// MUTATION: make `dom-lite`'s `removeAttribute` a no-op ⇒ RED.
test('the shared dom-lite stub can really REMOVE an attribute — the mutation depends on it', () => {
  const el = new RzEl(rzDoc, 'button');
  el.setAttribute('aria-pressed', 'true');
  assert.equal(el.getAttribute('aria-pressed'), 'true', 'setAttribute did not take — vacuous below');
  el.removeAttribute('aria-pressed');
  assert.equal(el.getAttribute('aria-pressed'), null,
    'dom-lite.removeAttribute did not remove the attribute. Every "the tool loses its aria-pressed" ' +
    'mutation now passes silently: the stub keeps reporting the old value, so the harness reports ' +
    'GREEN for a change that would strip the armed state in a real browser.');
  el.removeAttribute('never-set');   // total: removing an absent attribute is not an error
  assert.equal(el.getAttribute('never-set'), null);
});

// ⚠️ THE `<span>` HALF OF THE TAG SCANNER, added in review because NOTHING COVERED IT: narrowing
// `TAG_RE` to `button` alone reddened not one test, even though four chrome handles resolve through
// it and all four are written by shipping code on every repaint. That is the "cannot bite" shape
// pointed at the harness instead of at the subject — the scanner would have been free to rot back
// into the `querySelector() { return null }` stub it replaced, and the driven aria tests above would
// have gone on passing while `paintCaption`/`paintBreadcrumb`/`paintPalette` wrote into nulls.
//
// It is deliberately phrased against the TEXT THE PAINTERS WROTE rather than against the handles
// themselves: `setText` is null-guarded, so a null handle is silent, and the observable difference
// between "resolved and written" and "never resolved" is exactly this text.
//
// MUTATION: narrow `TAG_RE` to `/<(button)\b([^>]*)>/g` ⇒ RED (all four read '').
// MUTATION: drop the `.rz-place-label` span from `buildChrome`'s palette markup ⇒ RED.
// MUTATION: stop passing `class` through to `className` in the scanner ⇒ RED (nothing resolves).
test('the chrome SPANS resolve and the painters write through them — caption, crumb, palette label', () => {
  // Read out of the fixture through the SAME lookup the controller uses, never typed here — `HOLD`
  // is the test's own trimmed rect and deliberately carries no name.
  const name = roomTileRect(fixView, 'hold').displayName;
  assert.ok(name, 'the fixture room has no display name — every assertion below would be vacuous');
  const label = rzPalette.querySelector('.rz-place-label');
  assert.ok(label, 'the palette has no `.rz-place-label` handle');
  // ⚠️ AMENDED BY THE NEUTRAL-FIRST-SCREEN PACKAGE: this span is written by `paintChrome` now, and
  // its wording keys on whether a tool is armed. Both cells are asserted, because a handle that
  // resolved once and then stopped being repainted would satisfy either one alone.
  assert.equal(label.textContent, 'TOOLS ▸ ' + name,
    'the palette\'s DISARMED room label is not what `paintChrome` writes — either the span did not ' +
    'resolve (so `setText` no-opped on null) or the wording moved');
  rzArm('wall');
  assert.equal(label.textContent, 'BUILD ▸ ' + name, 'the ARMED label is not the BUILD wording');
  rzArm('wall');

  const cap = rzDoc.getElementById('rz-caption');
  assert.match(cap.querySelector('.rz-cap-lead').textContent, new RegExp('^' + name + ' · '),
    'the caption\'s room name did not arrive — `_el.capLead` resolved to null');
  assert.match(cap.querySelector('.rz-placed').textContent, /^\d+ PLACED$/,
    'the caption\'s placed-count did not arrive — `_el.capPlaced` resolved to null');

  const bc = rzDoc.getElementById('rz-breadcrumb');
  assert.equal(bc.querySelector('.rz-crumb-leaf').textContent, name,
    'the breadcrumb leaf did not arrive — `_el.crumbLeaf` resolved to null');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FIRST SCREEN IN A ROOM IS THE ROOM (carried playtest item, 2026-08-03).
//
//   *"Opening a room shows the room and its people — not a build palette demanding a tool."*
//
// THE FILED COMPLAINT SAID "the Room Zoom opens with BUILD armed" AND THE STATE WAS ALREADY RIGHT:
// `enterRoom` sets `_armed = null` (IX-Z-01), and so do `exitRoom`, the minimap room swap and the
// crew-row jump. The defect was PRESENTATION — three simultaneous announcements of a mode that was
// not on, on the first frame of every room:
//     BUILD ▸ HOLD  /  PICK A TOOL · WALL/FLOOR: …  /  HOLD · BUILD DETAIL · n PLACED
// and not one word about what the disarmed surface actually does. That last half is why this is a
// package and not a string edit: the two verbs a player has with nothing armed — a click selects
// the pawn under it (IX-Z-30, pinned by `zoom-pawn.test.js`'s BASELINE) and a right-click opens
// PRIORITISE (M2-10, pinned by `prioritise-menu.test.js`) — were UNADVERTISED ANYWHERE.
//
// ⚠️ WHAT THESE TESTS CANNOT SEE, said before the assertions rather than after: NOTHING HERE IS A
// PIXEL. Whether the longer neutral hint fits its box at the shipped Space Mono size, and whether
// the palette still reads as de-emphasised next to it, are questions only a layout engine answers —
// `client/tools/roomzoom-neutral-shot.mjs` is where they are answered, in real Chrome, and its
// overflow probe is the acceptance instrument for this package.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: `label: 'BUILD ▸ ' + room` unconditionally ⇒ RED (leg 1).
// MUTATION: `hint: ZOOM_HINT_ARMED` unconditionally ⇒ RED (leg 1).
// MUTATION: `capLead: room + ' · BUILD DETAIL · '` unconditionally ⇒ RED (leg 1).
test('zoomChrome: with NOTHING armed not one of the three surfaces says BUILD', () => {
  const idle = zoomChrome({ armed: null, roomName: 'HOLD', placed: 3, crewHere: 2 });
  assert.equal(idle.armed, false);
  // The whole point, asserted as an ABSENCE over the two MODE surfaces at once — a per-string
  // equality would pass if a fourth BUILD sentence were added tomorrow.
  for (const [what, s] of Object.entries(
    { label: idle.label, capLead: idle.capLead, capPlaced: idle.capPlaced })) {
    assert.doesNotMatch(s, /BUILD/,
      `the DISARMED ${what} still announces BUILD ('${s}') — the surface is claiming a mode that ` +
      'is not on, which is the whole defect');
  }
  // ⚠️ THE HINT IS EXEMPT FROM THAT SWEEP ON PURPOSE, AND THE EXEMPTION IS ITSELF PINNED. The hint's
  // job is to OFFER the verbs, building included ("PICK A TOOL ABOVE TO BUILD") — a hint that never
  // said the word would leave eighteen buttons unexplained, which is the opposite defect. What it
  // must not do is lead with it: the room and its people come FIRST, the palette last.
  assert.ok(idle.hint.indexOf('SELECT') < idle.hint.indexOf('BUILD'),
    `the neutral hint offers BUILD before it offers SELECT ('${idle.hint}') — the first screen in a `
    + 'room is the room and its people, so the build offer is the tail of this line, not its head');
  assert.doesNotMatch(idle.hint, /^PICK A TOOL/,
    'the neutral hint still OPENS with the imperative that shipped — that is the complaint verbatim');
  // …and it says where you are, who is with you, and what you can do instead.
  assert.equal(idle.label, 'TOOLS ▸ HOLD');
  assert.equal(idle.capLead, 'HOLD · 2 CREW HERE · ');
  assert.equal(idle.capPlaced, '3 PLACED');
  assert.equal(idle.hint, ZOOM_HINT_IDLE);
  assert.match(idle.hint, /SELECT/, 'the neutral hint does not name the select verb (IX-Z-30)');
  assert.match(idle.hint, /PRIORITISE/, 'the neutral hint does not name the right-click verb (M2-10)');
  // ⭐ AND IT MUST PROMISE THE GESTURE THAT ANSWERS. `prioritiseOffer` refuses a tile with no
  // `devices` row SILENTLY and by design (pinned twice in `prioritise-menu.test.js`), and most of
  // the shipped cryo bay is bare floor — so "RIGHT-CLICK A TILE", which is what the first draft of
  // this line said, advertises the one gesture that returns nothing. An invitation to silence is
  // the same defect as an unadvertised verb, wearing the opposite sign.
  assert.match(idle.hint, /RIGHT-CLICK A MACHINE/,
    `the neutral hint reads ${JSON.stringify(idle.hint)} — it must aim the right-click at a MACHINE. `
    + 'A tile with no devices row opens no menu and sends no command, on purpose.');
  assert.doesNotMatch(idle.hint, /RIGHT-CLICK A TILE/, 'the hint invites a right-click on bare floor');
  assert.match(idle.hint, /TOOL/, 'the neutral hint does not say how to start building');
});

// MUTATION: `armed = false` in zoomChrome ⇒ RED. MUTATION: return the idle strings when armed ⇒ RED.
test('zoomChrome: arming a tool brings the BUILD presentation back, on all three at once', () => {
  const armed = zoomChrome({ armed: 'wall', roomName: 'HOLD', placed: 3, crewHere: 2 });
  assert.equal(armed.armed, true);
  assert.equal(armed.label, 'BUILD ▸ HOLD');
  assert.equal(armed.capLead, 'HOLD · BUILD DETAIL · ');
  assert.equal(armed.hint, ZOOM_HINT_ARMED);
  // The armed crib sheet lost its stale leading imperative and gained the rung ESC actually does.
  assert.doesNotMatch(armed.hint, /^PICK A TOOL/,
    'the armed hint still opens with PICK A TOOL — a tool IS picked, so the line was stale the ' +
    'moment it could be read');
  assert.match(armed.hint, /ESC DISARMS/, '`escStackRung` disarms on this rung and nothing says so');
  // ONE INPUT drives all three. A per-surface flag could let the label and the caption disagree.
  for (const tool of ROOM_TOOLS) {
    const c = zoomChrome({ armed: tool, roomName: 'HOLD', placed: 0, crewHere: 0 });
    assert.equal(c.label, 'BUILD ▸ HOLD', `the label is not the armed wording for '${tool}'`);
    assert.equal(c.capLead, 'HOLD · BUILD DETAIL · ', `the caption disagrees with the label for '${tool}'`);
    assert.equal(c.hint, ZOOM_HINT_ARMED, `the hint disagrees with the label for '${tool}'`);
  }
});

// The company clause, at each of the three shapes a room comes in. `''` is included because
// `_armed` is the empty string for no tool nowhere in this codebase — but `zoomChrome` is a public
// export and a caller passing `''` must not be told a tool is armed.
test('zoomChrome: the caption counts the souls in the room, and 0 is a sentence not a zero', () => {
  const at = (n) => zoomChrome({ armed: null, roomName: 'HOLD', placed: 0, crewHere: n }).capLead;
  assert.equal(at(0), 'HOLD · NO CREW HERE · ');
  assert.equal(at(1), 'HOLD · 1 CREW HERE · ');
  assert.equal(at(4), 'HOLD · 4 CREW HERE · ');
  assert.equal(zoomChrome({ armed: '', roomName: 'HOLD' }).label, 'TOOLS ▸ HOLD',
    'an empty-string tool was read as armed');
  // Missing fields must not print `undefined` at a player.
  const bare = zoomChrome({ armed: null, roomName: 'HOLD' });
  assert.equal(bare.capLead, 'HOLD · NO CREW HERE · ');
  assert.equal(bare.capPlaced, '0 PLACED');
  assert.equal(zoomChrome().label, 'TOOLS ▸ ', 'zoomChrome() with no argument threw or printed junk');
});

/**
 * ⭐ THE OUTCOME, DRIVEN THROUGH THE SHIPPING CONTROLLER — because every assertion above would pass
 * on a tree where `paintChrome` is never called. The room is entered through `enterRoom` (the
 * Overview's own hook), the tool is armed by CLICKING the shipped palette button, and it is
 * disarmed with the real ESC handler.
 *
 * ⚠️ THE THREE NODES ARE BLANKED BEFORE THE ENTRY, AND THAT LINE IS THE TEST. Without it the
 * assertions below were satisfied by the afterEach hook's own `rzArm('stockpile')` pair — which
 * calls `paintChrome` on its way past — so dropping `paintChrome()` from `repaint()` entirely left
 * this test GREEN (measured, not feared: fail=1, and the one red was the crew-count leg below).
 * "Entering a room paints the room" cannot be asserted on a surface something else just painted.
 *
 * MUTATION: revert `paintChrome` to `setText(_el.placeLabel, 'BUILD ▸ ' + _focus.displayName)`
 *           ⇒ RED on the first label leg.
 * MUTATION: drop `paintChrome()` from `arm()`   ⇒ RED on the armed legs (no frame arrives here, so
 *           nothing else repaints — which is exactly the paused-ship case the call is there for).
 * MUTATION: drop `paintChrome()` from `repaint()` ⇒ RED on the first leg (entry paints nothing).
 * MUTATION: `_el.hint = null`                    ⇒ RED (the seeded markup is not what is read).
 * MUTATION: `_capPlaced = 0`                     ⇒ RED (the count is a fact about the room).
 */
test('DRIVEN: entering a room paints the NEUTRAL sentences; arming restores BUILD; ESC restores neutral', () => {
  const name = roomTileRect(fixView, 'hold').displayName;
  assert.ok(name, 'the fixture room has no display name — every assertion below would be vacuous');

  // Blank every surface this test reads, then enter through the Overview's own hook. See above.
  for (const sel of ['.rz-cap-lead', '.rz-placed']) rzDoc.getElementById('rz-caption').querySelector(sel).textContent = '';
  rzPalette.querySelector('.rz-place-label').textContent = '';
  rzDoc.getElementById('rz-hint').textContent = '';
  rzApi.exit();
  rzApi.enter('hold');

  // ── the first screen, straight off the real entry path
  assert.equal(rzLabel(), 'TOOLS ▸ ' + name,
    'the palette label still announces BUILD on a surface that armed nothing');
  assert.equal(rzHint(), ZOOM_HINT_IDLE,
    'the hint line is not the neutral text. If it is the ARMED crib sheet, `paintChrome` keyed on ' +
    'the wrong thing; if it is empty, `_el.hint` resolved to null and the player reads the seeded ' +
    'markup forever.');
  assert.doesNotMatch(rzCaption(), /BUILD/, 'the canvas caption still says BUILD DETAIL');
  assert.match(rzCaption(), new RegExp('^' + name + ' · '), 'the caption does not name the room');
  // ⚠️ AN ABSOLUTE FLOOR, NOT A SHAPE. The pin that stood in the chrome-SPANS test was
  // `/^\d+ PLACED$/`, which `0 PLACED` satisfies — so `_capPlaced = 0` survived GREEN when it was
  // physically applied (fail=0). A count that is allowed to be zero is not pinned at all (trap 7's
  // shape: only an absolute floor sees a broken magnitude). The fixture hold really holds ten.
  assert.match(rzCaption(), / 10 PLACED$/,
    `the caption reads '${rzCaption()}' — the fixture hold carries ten placed devices + pending `
    + 'designations. If this number moved, re-derive it from the capture before editing the literal.');

  // ── arm WALL by clicking the shipped palette button: all three flip together
  rzArm('wall');
  assert.equal(rzLabel(), 'BUILD ▸ ' + name, 'arming did not bring the BUILD label back');
  assert.equal(rzHint(), ZOOM_HINT_ARMED, 'arming did not bring the tool crib sheet back');
  assert.match(rzCaption(), /BUILD DETAIL/, 'arming did not bring the BUILD caption back');

  // ── ESC — the real rung (`escStackRung` → 'disarm'), not a second click
  const esc = rzKey('Escape');
  assert.ok(esc.defaultPrevented, 'the Room Zoom did not swallow ESC');
  assert.equal(rzLabel(), 'TOOLS ▸ ' + name, 'ESC disarmed the tool and left the BUILD label up');
  assert.equal(rzHint(), ZOOM_HINT_IDLE, 'ESC disarmed the tool and left the crib sheet up');
  assert.doesNotMatch(rzCaption(), /BUILD/, 'ESC disarmed the tool and left the BUILD caption up');
});

/**
 * The caption's company clause, driven — the ONE leg that proves `_capHere` is wired to the roster
 * at all. Without it `roomCrew(crew, _focus).length` could be `0` forever and every assertion above
 * would stay green, because this rig dispatches no roster by default.
 *
 * The roster is dispatched HERE and cleared again at the end: it is shared HUD state that the
 * afterEach hook does not reset, and a crew member left standing in the hold would start drawing
 * pawns into `#rz-layers` for every later test in this file.
 *
 * MUTATION: `_capHere = 0` in `repaint` ⇒ RED. MUTATION: count the SHIP's crew rather than the
 * room's (`crew.length`) ⇒ RED — VANE stands outside the hold for exactly that reason.
 */
test('DRIVEN: the caption counts the souls standing in THIS room, not the ship\'s roster', () => {
  const inside = { cid: 101, name: 'Ada Vale', role: 'engineer', deck: HOLD.deck, x: HOLD.rx + 1, y: HOLD.ry + 1, task: 'Idle' };
  const outside = { cid: 103, name: 'Bo Vane', role: 'medic', deck: HOLD.deck, x: HOLD.rx + HOLD.rw + 3, y: HOLD.ry, task: 'Idle' };
  // NON-VACUITY: the two probes must really be in and out of the room, or this leg passes by
  // missing the rect — the same hole `crewRoomSlot`'s three fixtures were added to close.
  assert.equal(roomCrew([inside, outside], HOLD).length, 1,
    'the fixture crew are not one-in / one-out of the hold — re-derive their tiles');
  try {
    Hud.renderRoster({ type: 'roster', crew: [inside, outside] });
    Hud.renderFrame(wreck);                       // a frame is what schedules the paint
    rzApi.exit(); rzApi.enter('hold');            // …and enterRoom repaints inline
    assert.match(rzCaption(), /· 1 CREW HERE ·/,
      `the caption reads '${rzCaption()}' — it should count the ONE soul in the hold`);
  } finally {
    Hud.renderRoster({ type: 'roster', crew: [] });
    Hud.renderFrame(wreck);
  }
});

// ⚠️ ONE TEXT, ONE HOME. The hint used to be a `const HINT` literal inside `roomzoom-view.js`; it is
// two exported constants in the pure model now, and a copy left behind in the view is how the line
// the player reads and the line the tests assert would come to differ. Comment-stripped (trap 1),
// with an inclusion control so a scan that can find nothing looks different from a scan that found
// nothing.
test('the hint line has exactly ONE home — no copy left behind in the view', () => {
  const view = codeOnly(readFileSync(join(HERE, '../src/ui/roomzoom-view.js'), 'utf8'));
  assert.ok(view.includes('ZOOM_HINT_IDLE'),
    'the control failed: the view does not mention ZOOM_HINT_IDLE at all, so the scan below is '
    + 'searching a string it cannot understand');
  for (const fragment of ['PICK A TOOL', 'DRAG TO SWEEP A RUN', 'DEMOLISH REMOVES A GHOST']) {
    assert.ok(!view.includes(fragment),
      `roomzoom-view.js still carries the hint fragment '${fragment}'. The hint's two texts live in `
      + 'room-model.js (`ZOOM_HINT_IDLE` / `ZOOM_HINT_ARMED`); a second copy here drifts.');
  }
});

// The material swatches get `type="button"` for the same reason the tool buttons do — one palette,
// one button vocabulary — and DELIBERATELY NOT `aria-pressed`: `activeMaterial` guarantees exactly
// one is lit, which is a radio group (`role="radio"`/`aria-checked` + roving focus), not six
// independent toggles. Asserting the ABSENCE as well as the presence is what stops a later package
// reaching for the nearest attribute instead of the right one.
//
// MUTATION: emit the chips without `type="button"` ⇒ RED.
// MUTATION: add `aria-pressed` to a material chip ⇒ RED on the second leg.
test('the material swatches are typed buttons, and are NOT dressed as independent toggles', () => {
  rzArm('wall');                                  // the strip is populated on arm, not before
  const html = rzDoc.getElementById('rz-matstrip').innerHTML;
  const chips = (html.match(/class="rz-mat-chip/g) || []).length;
  assert.ok(chips >= 2, `the material strip painted ${chips} chips — this assertion would be vacuous`);
  assert.equal((html.match(/<button type="button" class="rz-mat-chip/g) || []).length, chips,
    'a material swatch is not a `<button type="button">` — inside a form its default type is ' +
    '`submit`, and the tool buttons and ACCEPTS chips on this same palette both spell it out');
  assert.doesNotMatch(html, /aria-pressed/,
    'a material swatch claims `aria-pressed`. Exactly one swatch is ever lit (`activeMaterial`), ' +
    'so these are a RADIO GROUP: the honest spelling is role="radio" + aria-checked inside a ' +
    'radiogroup with roving tab focus, which is a keyboard-interaction change and not an ' +
    'attribute. Announcing six independent toggles where the player has one choice is worse than ' +
    'announcing nothing.');
  rzArm('wall');                                  // disarm — afterEach normalises, but not silently
});

// MUTATION: drop the `z`/`Z` branch from onKey ⇒ the sweep after it sends nothing ⇒ RED.
test('Z arms STOCKPILE, the console\'s own binding, and swallows the key', () => {
  const z = rzKey('Z');
  assert.ok(z.defaultPrevented && z.propagationStopped, 'the Room Zoom must swallow its own hotkey');
  assert.equal(rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 }))[0].cmd, 'stockpile');
  rzKey('z');                                       // lowercase too — 'h' was silently dead once
  assert.deepEqual(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 }), [], 'the second Z did not disarm');
  // …and it is the ONE exclusive slot, shared with the other two order hotkeys.
  rzKey('z');
  rzKey('G');
  assert.equal(rzOrders(rzSweep({ x: 28, y: 16 }, { x: 28, y: 16 }))[0].cmd, 'dig',
    'G did not replace the armed STOCKPILE — the slot is not exclusive');
  rzKey('G');
});

// THE SINGLE WORST THING THIS PACKAGE COULD DO (charter's "wrong if"): an order that reaches
// BuildSystem. MUTATION: `_send(Cmd.build(pc.kind, …))` for the order branch ⇒ RED here, and the
// WALL half below is what stops the assertion from being satisfiable by sending nothing at all.
test('WP-4: an ORDER never routes through Cmd.build — and WALL still does', () => {
  rzArm('dig');
  const dig = rzOrders(rzSweep({ x: 28, y: 14 }, { x: 30, y: 16 }));
  assert.ok(dig.length > 0, 'the order sweep sent nothing — this assertion would pass vacuously');
  assert.deepEqual(dig.filter((o) => o.cmd === 'build'), [],
    'a DIG order was lowered to `build`. Cmd.build reaches BuildSystem, which knows nothing about '
    + 'designations, so the order would be silently swallowed (client/src/input/controls.js:52-58).');
  assert.deepEqual([...new Set(dig.map((o) => o.cmd))], ['dig']);
  rzArm('dig');

  rzArm('strip');
  const strip = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 }));
  assert.deepEqual([...new Set(strip.map((o) => o.cmd))], ['strip']);
  rzArm('strip');

  // CONTROL: the structural branch is untouched — WALL still emits Cmd.build carrying its material,
  // and it still sweeps the PERIMETER. Without this half, deleting the whole commit path would pass.
  rzArm('wall');
  const wall = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 26, y: 13 }));   // THE IDENTICAL 3×3 DRAG
  assert.deepEqual([...new Set(wall.map((o) => o.cmd))], ['build']);
  assert.deepEqual(wall[0], { cmd: 'build', kind: 'wall', x: 24, y: 11, material: 0 });
  assert.equal(wall.length, 8, 'a 3×3 wall drag is the 8-tile perimeter, not the 9-tile fill');
  rzArm('wall');

  // THE CONTRAST, stated once: one and the same gesture over one and the same tiles, and the two
  // classes commit different SETS. This is what proves `roomDragMode` branches in the live
  // controller rather than only in its unit test.
  assert.equal(strip.length, 9);
  assert.ok(strip.length > wall.length,
    'an ORDER sweep must cover the region a WALL sweep only outlines — if these are equal, every '
    + 'assertion about `fill` above is being satisfied by a `perimeter` sweep');
  assert.ok(!wall.some((o) => o.x === 25 && o.y === 12), 'the wall perimeter must leave its interior open');
});

// THE WP-2 LESSON, APPLIED TO THIS PACKAGE: a sweep that commits correctly but shows the player
// nothing while they drag is a defect the wire assertions above cannot see. So this reads the SVG
// `previewSvg` ACTUALLY emitted mid-drag, and pins the emitted numbers rather than recomputing the
// transform in the test. An order tool carries no material, so the preview is the bare amber dashed
// ring — `materialItemId('dig', …)` is '' — which is exactly right for a designation.
// MUTATION: `previewSvg` returning '' for an order tool ⇒ RED, and no wire assertion would notice.
test('WP-4: an order sweep PREVIEWS in the FLOOR PLANE, while the button is still down', async () => {
  rzArm('dig');
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(28, 15) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(30, 16) });
  await new Promise((r) => setTimeout(r, 40));            // the coalesced repaint
  const svg = rzLayers.innerHTML;
  assert.match(svg, /class="rz-preview"/, 'nothing was drawn for a sweep in progress');
  const preview = svg.slice(svg.indexOf('class="rz-preview"'));
  // ⭐ VR-P3 — A PREVIEWED TILE IS A **QUAD**, NOT A RECT, and that is the assertion moving rather
  // than loosening: on the cutaway a tile is a projected parallelogram, so a `<rect>` here would mean
  // the preview had gone back to being drawn in a plan the surface no longer has.
  // Bounded to the DASHED cells: the dimension arrows further down the document are `<path … Z>`
  // too (their barbs), and an unbounded scan would count them as previewed tiles.
  const quads = [...preview.matchAll(/<path d="(M[^"]+Z)"[^>]*stroke-dasharray/g)].map((m) => m[1]);
  assert.equal(quads.length, 6, 'one preview quad per swept tile (the 3×2 fill)');
  // The quads are the SHIPPED placement's own, tile for tile — derived, never transcribed.
  const pl = scenePlacement(roomScene(HOLD), HOLD);
  assert.equal(quads[0], pl.quad(28, 15), 'the first previewed quad is not tile (28,15)\'s floor');
  assert.equal(quads[5], pl.quad(30, 16), 'the last previewed quad is not tile (30,16)\'s floor');
  // …and a quad really is sheared: its four corners do not share two x values, which is what would
  // make this leg pass against an axis-aligned box wearing a `<path>`.
  const xs = new Set(quads[0].match(/[-\d.]+(?= )/g));
  assert.ok(xs.size > 2, 'the previewed quad is axis-aligned — it is not in the floor plane');
  // THE DIALECT: a preview is PLANNED, not queued. Ink `6 5`, never the queued order's oxblood `8 5`.
  assert.match(preview, /stroke="#14120F"[^/]*stroke-dasharray="6 5"/,
    'the build preview is not in the charter\'s UNBUILT/PLANNED spelling (ink, dash `6 5`)');
  assert.ok(!/#7B2C22/.test(preview),
    'the preview wears the ONE ACCENT — oxblood is for orders that have been GIVEN, and a sweep in '
    + 'progress has ordered nothing yet');
  assert.match(preview, /3×2 · 6 TILES/, 'the run caption must count the tiles the sweep will order');
  rzMouseUp();
  rzArm('dig');
});

// ⚠️ READ THIS BEFORE TRUSTING THE MUTATION THIS TEST USED TO NAME. An earlier version of this
// comment claimed that "replacing `isSweepTool` with `isStructuralTool` at the onCanvasClick bail
// ⇒ the trailing click double-fires ⇒ RED". It was applied exactly as written by an independent
// reviewer and the whole suite stayed GREEN. **That named mutation cannot bite, and the claim is
// withdrawn.** The mechanism, verified: past the bail, `onCanvasClick`'s tail is an if/else-if chain
// over `pc.cls` that handles ONLY `functional`, `cosmetic` and `demolish` (roomzoom-view.js:657-667).
// There is no `order` branch — and no `structural` branch either. With DIG armed, `pc.cls === 'order'`
// falls off the end of the chain and sends nothing, so THE BAIL CANNOT PREVENT A DOUBLE-FIRE BECAUSE
// THERE IS NO SECOND FIRE TO PREVENT. The bail is a DEFENSIVE SECOND guard; the first and effective
// guard is the absent branch. Both surfaces of that were confirmed against the real host: a drag
// emitted exactly the swept set and nothing extra.
//
// So what this test actually pins is narrower and still worth having: A RELEASE COMMITS THE SWEPT SET
// EXACTLY ONCE, trailing click included. The mutation that DOES bite it takes TWO edits, because it
// takes two to create the hazard — add an `order` branch to `onCanvasClick`'s chain AND drop the
// bail. Applied together: 18 payloads instead of 9, RED. That pair is in the package's mutation log.
test('WP-4: a release commits the swept set exactly once, trailing click included', () => {
  rzArm('dig');
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(28, 14) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(30, 16) });
  rzMouseUp();
  rzFire(rzCanvas, 'click', { button: 0, ...atTile(30, 16) });  // the browser's trailing click
  assert.equal(rzOrders(rzSent).length, 9, 'the release committed 9 tiles; the trailing click added more');
  rzArm('dig');
});

// The room is the whole canvas at Level 2, so a pointer outside it cannot even NAME a tile
// (`tileFromCanvasXY` returns null on the letterbox / out-of-rect). The fixture makes this concrete:
// there is REAL undesignated debris at x34-40 y15-16, outside the hold, and a player sweeping toward
// it must not designate any of it.
//
// ⚠️ WHAT THIS DOES *NOT* PROVE: it is not a test of the `roomBounds()` clip. Measured — dropping
// that argument leaves this test GREEN, because the hit test has already refused the tile. The clip
// is the second guard and its only reachable failure case is the shrink test further down. Do not
// read a pass here as evidence the clip is wired.
test('WP-4: a sweep dragged at out-of-room debris designates none of it', () => {
  const debrisOutside = [];
  for (let y = 0; y < wreck.h; y++) {
    for (let x = 0; x < wreck.w; x++) {
      const c = wreck.cells[y * wreck.w + x];
      if (Array.isArray(c) && (c[1] | 0) === 4 && !clampTileToRoom(x, y, HOLD)) debrisOutside.push([x, y]);
    }
  }
  assert.ok(debrisOutside.length >= 10,
    'the fixture no longer has out-of-room debris to drag at — this test would be vacuous');
  const [tx, ty] = debrisOutside[debrisOutside.length - 1]; // the far-right stretch at x40
  rzArm('dig');
  const sent = rzOrders(rzSweep({ x: 30, y: 16 }, { x: tx, y: ty }));
  for (const o of sent) {
    assert.ok(clampTileToRoom(o.x, o.y, HOLD), `designated (${o.x},${o.y}) OUTSIDE the focused room`);
  }
  assert.deepEqual(sent.map(xy), [[30, 16]], 'the drag should not have grown past the room edge');
  rzArm('dig');
});

// MUTATION: drop the `roomBounds()` argument from `buildDragTiles` in onCanvasUp ⇒ 42 payloads
// instead of 12, twelve of them outside the room ⇒ RED.
//
// AND THIS IS THE ONLY TEST THAT MUTATION REDDENS — measured, and it is worth knowing why. The clip
// is UNREACHABLE from ordinary mouse input: `tileFromCanvasXY` already refuses any point outside the
// room, so both drag endpoints are always in-room and the bounding rectangle of two in-room tiles is
// in-room too. The out-of-room-debris test above therefore exercises the HIT TEST, not the clip, and
// stays green without it. What the clip is genuinely for is the case below: `repaint()` re-resolves
// the room rect on every frame ("a resized rect stays correct"), so the room can shrink under a
// sweep that is already in progress, and only then does the recorded start tile fall outside.
test('WP-4: a room that SHRINKS mid-sweep clips the committed order to its new rect', async () => {
  rzArm('dig');
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(24, 11) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(30, 16) });   // a 7×6 = 42-tile sweep

  // try/finally, not a trailing restore: this test is the one piece of SHARED state in the section
  // (the HUD's decks cache), and a failed assertion must not leave the hold shrunk for the rest of
  // the file. The afterEach hook re-enters the room and would re-enter the shrunk one.
  try {
    const shrunk = JSON.parse(JSON.stringify(FIX.decks));
    const deck1 = shrunk.decks.find((d) => d.deck === 1);
    const slot = deck1.slots.find((s) => s[5] === 'hold');
    slot[3] = 6; slot[4] = 4;                                        // 12×8 → 6×4 (x22-27, y10-13)
    Hud.renderDecks(shrunk);
    await new Promise((r) => setTimeout(r, 40));                     // let the coalesced repaint land

    rzMouseUp();
    const sent = rzOrders(rzSent);
    assert.equal(sent.length, 12, 'the sweep must be clipped to the room\'s CURRENT rect, not its old one');
    for (const o of sent) {
      assert.ok(o.x >= 22 && o.x < 28 && o.y >= 10 && o.y < 14, `designated (${o.x},${o.y}) outside the shrunk room`);
    }
  } finally {
    Hud.renderDecks(FIX.decks);
    await new Promise((r) => setTimeout(r, 40));
  }
});

// The ACCEPTS caption. Its original justification — "the chips are still on the deprecated console,
// so the toast is the ONLY place on the standard surface that says which filter the sweep painted" —
// is SPENT as of WP-6, and the test is kept for the better reason: the chips state INTENT and the
// toast states what was COMMITTED, and a zone that silently refuses every item looks exactly like one
// nothing has been hauled to yet.
//
// MUTATION: drop the `accepts` concatenation ⇒ RED. It is worded through the SHARED `acceptsLabel`
// (zone-model.js), which is also what the zone key says, so the two cannot spell one mask two ways —
// asserted by calling that function rather than by re-typing 'FOOD' here.
test('a STOCKPILE sweep says which filter it painted, in the zone key\'s own words', () => {
  const FOOD = 1 << 3;
  rzArm('stockpile');
  assert.equal(rzSetMask(FOOD), FOOD);
  rzSweep({ x: 24, y: 11 }, { x: 25, y: 12 });
  const msg = rzDoc.getElementById('rz-toast').textContent;
  assert.match(msg, /STOCKPILE/, 'the toast does not name the verb');
  assert.ok(msg.endsWith(acceptsLabel(FOOD)),
    `the sweep toast (${JSON.stringify(msg)}) does not end with the shared accept-set wording ` +
    `${JSON.stringify(acceptsLabel(FOOD))}. Nothing else on this surface can tell the player which ` +
    'filter they just painted — the ACCEPTS chips are still on the console.');
  assert.notEqual(acceptsLabel(FOOD), acceptsLabel(ACCEPT_ALL));   // non-vacuity: the label varies
  rzArm('stockpile');

  // CONTROL: DIG carries no mask, so its toast must NOT claim an accept-set. Without this leg the
  // assertion above is satisfiable by appending the label to every sweep.
  rzArm('dig');
  rzSweep({ x: 28, y: 14 }, { x: 29, y: 15 });
  assert.ok(!/ACCEPTS/.test(rzDoc.getElementById('rz-toast').textContent),
    'a DIG sweep claims an accept-set it does not carry');
  rzArm('dig');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WP-6 — THE ACCEPTS CHIPS, on the palette that paints the zone
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ A SOURCE-SCAN GUARD WAS DELETED HERE, DELIBERATELY, and the reason is worth reading before
// anyone puts it back. It asserted that `main.js` hands `initRoomZoom` a
// `getStockFilter: () => Hud.getStockFilter()`, with the message *"main.js no longer hands the Room
// Zoom the shared stockpile accept-mask, so every zone painted from the palette falls back to
// ACCEPT-ALL … (WP-6 replaces this getter with chips on this palette; it must not simply be
// removed.)"* WP-6 replaced it, as instructed. The hole it guarded — the composition root forgetting
// to wire the mask — no longer exists, because there is no wiring: the palette owns the mask and the
// chips beside it are its only writer. A structural scan for a line that must not exist would be a
// guard over air. What replaces it is strictly stronger and DRIVEN: click a chip, watch the emitted
// `Cmd.filter` move.
//
// (The mirror assertion in `overview-model.test.js` — "the Overview is handed NO mask" — survives,
// with its non-vacuity leg re-pointed at the two `installInput` blocks, which still carry the getter
// for the console's own canvas path.)

// THE TEST THIS WHOLE PACKAGE EXISTS FOR. Before it, the mask was per-tile in the sim, correct on the
// wire, and UNREACHABLE: the only writer of a stockpile accept-mask anywhere in the client was the
// `onclick` at `hud.js:312`, on the deprecated console shell. Every zone a player painted on the
// standard surface accepted everything, for ever.
//
// It is also the leg that makes the PROBE above mean something (CLAUDE.md's
// "starts-in-the-asserted-state" trap): "an untouched palette paints ACCEPT-ALL" is equally true of a
// client with no chips at all, so the pair is "…and a touched one does not".
//
// MUTATION: `onAcceptChip` returning early / never bound in `onHudClick` ⇒ RED here and green
// everywhere else in this file.
test('WP-6: the ACCEPTS chips CHANGE the mask the next sweep paints with', () => {
  rzArm('stockpile');
  // Baseline through the SAME path, so the contrast is between two driven sweeps and not between a
  // driven sweep and a remembered constant.
  const before = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 })).filter((o) => o.cmd === 'filter');
  assert.deepEqual(before.map((f) => f.mask), [ACCEPT_ALL], 'the untouched palette is not accept-all');

  rzAccept(3);                                       // the player does not want FOOD in this zone
  const want = ACCEPT_ALL & ~(1 << 3);
  assert.equal(rzShownMask(), want, 'the chip row does not show the kind as excluded');
  const after = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 })).filter((o) => o.cmd === 'filter');
  assert.deepEqual(after.map((f) => f.mask), [want],
    `the sweep still painted ${after.map((f) => f.mask)} after a chip was toggled. The ACCEPTS chips ` +
    'do not reach the brush, which is the exact defect this package exists to fix: a filter UI that ' +
    'is present, clickable, and inert.');

  // …and toggling back restores it, so the chip is a TOGGLE and not a one-way switch.
  rzAccept(3);
  const back = rzOrders(rzSweep({ x: 24, y: 11 }, { x: 24, y: 11 })).filter((o) => o.cmd === 'filter');
  assert.deepEqual(back.map((f) => f.mask), [ACCEPT_ALL]);
  rzArm('stockpile');
});

// The chips the PLAYER can actually click, read out of the markup `paintAccepts` wrote — the same
// reasoning as the palette-button test above. Every driven test in this section clicks a
// `data-rzaccept` node it constructs itself, so all of them would pass against a row that renders
// nothing at all. MUTATION: `acceptsRowHtml` returning '' ⇒ RED here and NOWHERE ELSE.
test('WP-6: the palette PAINTS one real, labelled, keyboard-reachable chip per ItemKind', () => {
  rzArm('stockpile');
  const html = rzDoc.getElementById('rz-accepts').innerHTML;
  assert.ok(html.length > 0, 'the ACCEPTS row painted nothing');
  for (const { kind, label } of STOCK_KINDS) {
    assert.ok(html.includes('data-rzaccept="' + kind + '"'), `no chip for ItemKind ${kind} (${label})`);
    assert.ok(html.includes('>' + label + '<'), `the chip for kind ${kind} is missing its label '${label}'`);
  }
  // Real <button>s, so they land in the tab order and Enter/Space activate them natively — the same
  // decision (and the same stated reason) as the console's own chips at hud.js:300-304. Bettered
  // here with an explicit type and a state a screen reader can read: `.on` is a CSS class, which is
  // invisible to assistive tech. MUTATION: drop `type="button"` or `aria-pressed` ⇒ RED.
  assert.equal((html.match(/<button type="button"/g) || []).length, STOCK_KINDS.length,
    'every chip must be an explicit type="button" — an implicit one SUBMITS inside a form');
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, STOCK_KINDS.length,
    'an untouched palette accepts every kind, so every chip must read as pressed');
  rzAccept(3);
  const off = rzDoc.getElementById('rz-accepts').innerHTML;
  assert.equal((off.match(/aria-pressed="false"/g) || []).length, 1,
    'toggling one kind off must flip exactly one chip\'s aria-pressed AND its class');
  assert.equal((off.match(/class="rz-acc-chip"/g) || []).length, 1,
    'exactly one chip must lose the `on` class');
  rzArm('stockpile');
});

// PLAN §5 GAP 2 — "chips affect only future paints, with nothing saying so". The wording is the fix;
// the COUNT is the honest part, because the sentence is a rule and the count is the player's actual
// situation. MUTATION: drop the `mismatch` argument from `acceptsRowHtml` (so it always renders the
// bare rule) ⇒ RED on the count legs; drop the whole `.rz-acc-note` ⇒ RED on the first.
test('WP-6: the row SAYS the chips apply to tiles painted next, and counts the ones that differ', async () => {
  const accepts = () => rzDoc.getElementById('rz-accepts').innerHTML;
  const settle = () => new Promise((r) => setTimeout(r, 40));   // the coalesced repaint
  rzArm('stockpile');
  assert.ok(accepts().includes(APPLIES_NEXT_LABEL),
    'the ACCEPTS row does not say that the chips apply to tiles painted NEXT — which is the whole ' +
    'of plan §5 gap 2, and was previously said only in a title= attribute nobody hovers');

  // ABSENT when nothing differs. Without this leg the count assertion below is satisfiable by always
  // rendering a count, including a wrong one.
  Hud.renderZones({ type: 'zones', cells: [] });
  await settle();
  assert.ok(!/KEEP A DIFFERENT FILTER/.test(accepts()),
    'the row claims already-painted tiles disagree when the room has no zones at all');

  // …and PRESENT, with the right number, when they do. Three zoned tiles in the hold: two carrying
  // FOOD-only, one carrying accept-all. With the chips at accept-all, exactly two differ.
  Hud.renderZones({ type: 'zones', cells: [
    [24, 11, DECK1, 1 << 3, 0], [25, 11, DECK1, 1 << 3, 0], [26, 11, DECK1, ACCEPT_ALL, 0],
    [4, 6, DECK1, 1 << 3, 0],   // OUTSIDE the focused room, same deck — must not be counted
  ] });
  await settle();
  const html = accepts();
  assert.ok(html.includes(mismatchLabel(2)),
    `the row does not carry ${JSON.stringify(mismatchLabel(2))}. It said ${JSON.stringify(html)}`);
  assert.match(mismatchLabel(2), /^2 ZONED TILES IN THIS ROOM/, 'the wording drifted');
  // The count is ROOM-scoped and the words say so: the fourth row above is a zoned tile on the same
  // deck outside the focused rect, and counting it would make the sentence a lie.
  assert.ok(!html.includes(mismatchLabel(3)), 'a zoned tile outside the focused room was counted');
  // …and it tracks the chips, not just the map: excluding FOOD makes the two FOOD tiles agree and
  // the accept-all one the odd tile out. It also moves WITHOUT a repaint, because a chip click is
  // the one thing on this surface that changes the answer with no wire traffic behind it.
  // MUTATION: recompute the count against a constant mask ⇒ RED.
  rzAccept(3);
  assert.ok(accepts().includes(mismatchLabel(3)),
    'the count did not move when the chips did — it is being computed against the wrong mask');
  Hud.renderZones({ type: 'zones', cells: [] });
  await settle();
  rzArm('stockpile');
});

// PLAN §5 GAPS 1 + 3 — the per-tile indicators. `zone-overlay.test.js` pins the BUILDER to the
// character; nothing anywhere pinned that its output reaches this surface's SVG, which is precisely
// the hole WP-3's own header records (a builder returning '' left 546/546 green). So this reads the
// layer the running controller actually mounted.
//
// MUTATION: drop `body += zoneLayerSvg(_zoneTiles, _focus);` from paintLayers ⇒ RED.
test('WP-6: a restricted tile and a backed-off tile are VISIBLY marked in the mounted layer', async () => {
  Hud.renderZones({ type: 'zones', cells: [
    [24, 11, DECK1, ACCEPT_ALL, 0],                       // plain zone
    [25, 11, DECK1, 1 << 3, 0],                           // RESTRICTED
    [26, 11, DECK1, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF],    // BACKED OFF
  ] });
  await new Promise((r) => setTimeout(r, 40));            // the coalesced repaint
  const svg = rzLayers.innerHTML;
  assert.match(svg, /class="rz-zones"/, 'the zone layer never reached the mounted SVG');
  assert.equal((svg.match(/class="rz-zone-wedge"/g) || []).length, 1,
    'exactly one tile is filtered, so exactly one corner badge must be drawn');
  assert.equal((svg.match(/class="rz-zone-hatch"/g) || []).length, 1, 'one hatched tile');
  // The DIM half of plan §5's "dim + hatch + a one-line reason" — WP-3 shipped the other two.
  assert.equal((svg.match(/class="rz-zone-dim"/g) || []).length, 1,
    'a backed-off tile must be DIMMED as well as hatched (plan §5 gap 3)');
  // THE ONE-LINE REASON, and it must be the HONEST wording. `_tileRetryAt` is a retry stamp wiped on
  // any tile-board rebuild (HaulJobSource.cs:453), so "UNREACHABLE" would be a claim the data cannot
  // support. MUTATION: strengthen BACKED_OFF_LABEL to 'UNREACHABLE' ⇒ RED.
  assert.match(svg, /NO HAULER REACHED THIS RECENTLY/,
    'the back-off reason is missing from the mounted layer');
  assert.ok(!/UNREACHABLE/.test(svg),
    'the back-off bit is being labelled as proof of permanent unreachability. It is a RETRY STAMP: ' +
    '`_tileRetryAt` is cleared wholesale on any tile-board rebuild and per-tile on proof of ' +
    'reachability, so the strongest honest wording is "no hauler has reached this recently".');
  // …and the key beside the floor says the same words without needing a hover.
  assert.match(rzDoc.getElementById('rz-zonekey').innerHTML, /NO HAULER REACHED THIS RECENTLY/);
  Hud.renderZones({ type: 'zones', cells: [] });
  await new Promise((r) => setTimeout(r, 40));
});

// The row is the ARMED TOOL's options, exactly like the material strip — so it must not be on screen
// while the player is building a wall. MUTATION: drop the `_armed !== 'stockpile'` branch ⇒ RED.
test('WP-6: the ACCEPTS row belongs to STOCKPILE — hidden for every other tool, and on disarm', () => {
  const row = rzDoc.getElementById('rz-accepts');
  assert.equal(row.hidden, true, 'the row is showing with nothing armed');
  rzArm('stockpile');
  assert.equal(row.hidden, false, 'arming STOCKPILE did not reveal the ACCEPTS row');
  rzArm('wall');                       // a different tool REPLACES the armed slot
  assert.equal(row.hidden, true, 'the ACCEPTS row survived arming WALL');
  assert.equal(row.innerHTML, '', 'a hidden row must also be emptied, or its buttons stay tabbable');
  rzArm('wall');
  rzArm('stockpile');
  assert.equal(row.hidden, false);
  rzArm('stockpile');                  // same button again → disarm
  assert.equal(row.hidden, true, 'disarming did not hide the ACCEPTS row');
  // …and the material strip is the mutually-exclusive sibling this row was placed beside, which is
  // what makes reveal-on-arm cost no net height.
  rzArm('stockpile');
  assert.equal(rzDoc.getElementById('rz-matstrip').hidden, true,
    'the material strip is showing for STOCKPILE — the two rows would then stack');
  rzArm('stockpile');
});

// MUTATION: leave the demolish toast at its pre-WP-4 wording ⇒ RED. A built wall used to be a dead
// end on this surface; STRIP is the verb that ends it, so the message has to name it.
test('WP-4: the built-wall dead end now points at STRIP', () => {
  const wallTile = { x: HOLD.rx, y: HOLD.ry };
  assert.equal(demolishTarget(wallTile.x, wallTile.y, null, null, wreck).kind, 'built-wall',
    'the hold\'s top-left tile is no longer a built wall in the fixture — pick another');
  rzArm('demolish');
  rzFire(rzCanvas, 'click', { button: 0, ...atTile(wallTile.x, wallTile.y) });
  assert.match(rzDoc.getElementById('rz-toast').textContent, /STRIP/,
    'DEMOLISH on a built wall must name the verb that CAN take it apart, now that STRIP exists here');
  rzArm('demolish');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE LIVE BUG (2026-07-26, reported by the owner three times): a condemned DEVICE was invisible.
//
// *"I can see the button, I can see the square when I hover over the furniture, but after clicking,
// the square disappears."* The square is the tool's hover preview, which correctly clears on
// release; what should replace it is the persistent condemned mark, and for a DEVICE that mark
// never reached the client at all — `GlyphMapper` pass 4 repainted the device's own colour over
// `GlyphColor.Deconstruct` (fixed in `sim/Sim.Glyph/GlyphMapper.cs`; pinned by
// `tests/Perilune.Tests/StripVerbTests.cs`).
//
// THE CLIENT HALF, which is what these two tests own. The mark layer draws ABOVE `furnitureSvg`; it
// used to be concatenated below it, so the condemned mark would have drawn its amber ✕ underneath
// the desk's own opaque sprite — the player condemns a desk, the sim agrees, the mark arrives, and
// he still sees nothing.
//
// ⚠️ THE SENTENCE THAT USED TO OPEN THIS PARAGRAPH IS FALSE AND IS QUOTED: *"Once fg 26 arrives on a
// FURNITURE tile the byte→mark table already handles it — `roomMarkTiles` keys on `cell[1]` and has
// never looked at the glyph."* There is no byte→mark table any more, and it is the DEVICE case that
// makes the point: pass 4 was patched in `GlyphMapper` to re-apply the strip colour over a condemned
// device, and that patch is the ONLY reason fg 26 ever reached a furniture tile. The `marks` channel
// needs no such patch — and the test below now drives the case that patch could never reach, a crew
// member STANDING on the condemned tile (pass 5), which no fg byte can survive.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('THE LIVE BUG (driven): a condemned DEVICE tile renders its strip mark in the real Room Zoom', () => {
  // A glyph code the Room Zoom actually skins as furniture — DERIVED from the shipped table, so this
  // cannot rot into a code that stopped being furniture (and the assert makes the scan non-vacuous).
  let code = 0;
  for (let c = 33; c < 127 && !code; c += 1) if (itemForGlyph(c)) code = c;
  assert.ok(code, 'no glyph code maps to a furniture item — the derivation found nothing to test with');

  // A tile INSIDE the hold carrying FURNITURE in the frame and a STRIP mark on the channel — the two
  // now travel separately, which is the point. THE FRAME CELL IS DELIBERATELY LEFT AS AN ORDINARY
  // DEVICE (fg 8): under the old fg-byte path that is precisely the "invisible condemned device" the
  // owner reported three times, so if anything here still read `cell[1]` this test would go red.
  const tx = HOLD.rx + 1, ty = HOLD.ry + 1;
  const cells = wreck.cells.slice();
  cells[ty * wreck.w + tx] = [code, 8, 0, 0];
  const condemned = {
    type: 'marks',
    cells: WRECK_MARKS_MSG.cells.concat([[tx, ty, DECK1, 3]]),
  };

  try {
    // PRECONDITION, and it is the non-vacuity control for the whole test: with the SAME frame and
    // the SAME furniture but NO strip on the channel, no strip mark is drawn. Without this leg a
    // `rz-marks` group produced by some unrelated tile of the wreck would satisfy the assertion
    // below and prove nothing.
    Hud.renderFrame({ ...wreck, cells });
    Hud.renderMarks(WRECK_MARKS_MSG);
    rzApi.exit(); rzApi.enter('hold');
    assert.ok(!rzLayers.innerHTML.includes('mk-strip'),
      'precondition: an UNCONDEMNED furniture tile draws no strip mark');

    Hud.renderMarks(condemned);
    rzApi.exit(); rzApi.enter('hold');
    const html = rzLayers.innerHTML;

    assert.ok(html.includes('class="rz-marks"'), 'the mark layer must reach the DOM');
    assert.ok(html.includes('mk mk-strip'),
      'a condemned DEVICE must draw the strip mark. This is the owner-reported bug: the order '
      + 'registered and was serviced, and the player was never told.');
    assert.ok(html.includes('mk-condemn'), 'the strip mark must carry its ✕, not just the order ring');

    // AND IT MUST NOT BE BURIED. The furniture sprite for THIS tile carries `rz-f-<tx>-<ty>` in its
    // generated ids, so the two layers can be located independently and their order asserted rather
    // than assumed. Painted under the desk the mark is present in the DOM and invisible on screen —
    // which would reproduce the reported symptom exactly while every assertion above stayed green.
    const iFurn = html.indexOf('rz-f-' + tx + '-' + ty);
    const iMark = html.indexOf('mk mk-strip');
    assert.ok(iFurn > 0, 'the furniture sprite for the condemned tile is not in the DOM — '
      + 'the ordering assertion below would be vacuous');
    assert.ok(iMark > iFurn,
      'the strip mark is drawn BEFORE (i.e. underneath) the furniture sprite it condemns, so the '
      + 'player sees the desk and not the ✕ — the reported symptom, with the byte present');
  } finally {
    Hud.renderFrame(wreck);   // never leave a doctored frame in the shared HUD cache
    Hud.renderMarks(WRECK_MARKS_MSG);
    rzApi.exit(); rzApi.enter('hold');
  }
});

// ⚠️ ADDED AFTER A MUTATION SURVIVED. `renderMarks(m) { _marks = m; }` — the cache written, the
// surfaces never told — passed the whole suite green. It is not a theoretical hole: `marks` is
// deduped by `GameSession.Send`, so on a quiet ship it is sent ONCE, and a designation the player
// just placed would sit in the cache until some other channel happened to move. The test therefore
// dispatches ONLY the marks channel and lets the coalesced repaint land.
//
// MUTATION: drop `notifyShip()` from `renderMarks` in hud.js ⇒ RED.
test('a marks dispatch ALONE repaints the surfaces — the cache is not enough', async () => {
  const tx = HOLD.rx + 3, ty = HOLD.ry + 3;
  const condemned = { type: 'marks', cells: WRECK_MARKS_MSG.cells.concat([[tx, ty, DECK1, 3]]) };
  try {
    rzApi.exit(); rzApi.enter('hold');
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(!rzLayers.innerHTML.includes('mk-strip'), 'precondition: nothing is condemned yet');

    // NOTHING ELSE IS DISPATCHED. No frame, no decks, no rooms — only the channel under test.
    Hud.renderMarks(condemned);
    await new Promise((r) => setTimeout(r, 40));            // the coalesced repaint
    assert.ok(rzLayers.innerHTML.includes('mk mk-strip'),
      'a `marks` message reached the cache and the Room Zoom never repainted. The channel is '
      + 'deduped by GameSession.Send, so on a quiet ship it is sent ONCE — a designation the player '
      + 'just placed would then sit invisible until some unrelated channel moved.');
  } finally {
    Hud.renderMarks(WRECK_MARKS_MSG);
    await new Promise((r) => setTimeout(r, 40));
  }
});

// THE CASE THE PASS-4 PATCH COULD NEVER REACH, driven through the same real controller: a CREW
// MEMBER STANDING ON THE CONDEMNED TILE. `GlyphMapper` pass 5 paints the citizen's own colour over
// `cell[1]` unconditionally, so under the old source this tile's mark was gone for as long as anyone
// stood on it — and on `--ship grid` the crew cluster in the hold at x25-32 y15-16, exactly where the
// designations are, so it blinked out and back as people crossed. The channel does not ride the
// projection, so it cannot be overwritten.
//
// MUTATION: point `_markTiles` back at `roomMarkTiles(frame, _focus)` ⇒ this goes red (the frame
// cell says fg 5 = Crew, which was never a mark).
test('THE LIVE BUG, generalised (driven): a mark SURVIVES a crew member standing on the tile', () => {
  const tx = HOLD.rx + 2, ty = HOLD.ry + 2;
  const cells = wreck.cells.slice();
  // '@' at GlyphColor.Crew (5) — byte-for-byte what pass 5 writes over whatever was there.
  cells[ty * wreck.w + tx] = [64, 5, 0, 0];
  const condemned = { type: 'marks', cells: WRECK_MARKS_MSG.cells.concat([[tx, ty, DECK1, 3]]) };
  try {
    // NON-VACUITY: the doctored cell really does carry no mark byte, so a client still reading
    // `cell[1]` genuinely could not draw this mark. Without this the test proves nothing about the
    // source — it would just be "a mark on the channel draws".
    assert.equal(FG_TO_KIND[cells[ty * wreck.w + tx][1]], undefined,
      'the planted crew cell carries a mark fg byte after all — the old path would have drawn it '
      + 'too, so this test no longer distinguishes the two sources');

    Hud.renderFrame({ ...wreck, cells });
    Hud.renderMarks(condemned);
    rzApi.exit(); rzApi.enter('hold');
    assert.ok(rzLayers.innerHTML.includes('mk mk-strip'),
      'a condemned tile with a crew member standing on it drew NO mark — the mark layer is reading '
      + 'the projection again, and the designation blinks out whenever anyone walks over it');
  } finally {
    Hud.renderFrame(wreck);
    Hud.renderMarks(WRECK_MARKS_MSG);
    rzApi.exit(); rzApi.enter('hold');
  }
});

test('THE LIVE BUG (synthetic): both surfaces mark a condemned FURNITURE tile, and mark ABOVE it', () => {
  // A code BOTH surfaces skin as furniture, derived against BOTH rather than assumed shared — the
  // existence assert is what stops this test degrading into a vacuous pass if they ever diverge.
  // ⚠️ THE REASON WEAKENED 2026-07-26 and the old wording is quoted so the change is visible: *"The
  // two keep independent glyph→item tables (`itemForGlyph` here, `SPRITE_FOR_GLYPH`/`ROLE_TO_ITEM`
  // in overview-scene.js)"*. They no longer do — both call `itemIdForGlyphChar` off the one `ITEMS`
  // derivation (`client/src/items/glyph-map.js`), which is the whole of that package. Deriving
  // against both is now belt-and-braces rather than load-bearing, and it is kept precisely because a
  // future surface could stop reading the shared table without this test noticing otherwise.
  const focus = { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 };
  let code = 0;
  for (let c = 33; c < 127 && !code; c += 1) {
    if (!itemForGlyph(c)) continue;
    const probe = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[c, 8, 0, 0]] };
    if (overviewScene({ deck: 0, decksView: fixView, frame: probe, crew: [], marks: [] }).includes('pl-furniture')) code = c;
  }
  assert.ok(code, 'no glyph code is furniture on BOTH surfaces — the ordering assertion would be vacuous');

  // The frame carries the FURNITURE at an ordinary device colour; the condemnation travels on the
  // `marks` channel beside it. (It used to be `[[code, 26, 0, 0]]` — one cell carrying both — and
  // that cell only existed because pass 4 was patched to produce it.)
  const frame = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[code, 8, 0, 0]] };
  const chan = decodeMarks({ type: 'marks', cells: [[0, 0, 0, 3]] });

  // The Room Zoom's pure model reports it and its pure layer draws it…
  assert.deepEqual(roomMarkTiles(chan, focus).map((t) => t.mark), ['strip']);
  assert.ok(markLayerSvg(roomMarkTiles(chan, focus), focus).includes('mk-strip'));

  // …and the Overview's real composer agrees, byte for byte, on the same tile. The two surfaces
  // share `mark-overlay.js` precisely so a condemned desk cannot read one way in the schematic and
  // another in the room.
  const ov = overviewScene({ deck: 0, decksView: fixView, frame, crew: [], marks: chan });
  assert.deepEqual(marks(ov).map((k) => k.kind), ['strip']);

  // ORDER on the Overview, driven rather than scanned, and now unconditional.
  const iFurn = ov.indexOf('<g class="pl-furniture"');
  const iMark = ov.indexOf('mk mk-strip');
  assert.ok(iFurn > 0, 'the Overview drew no furniture for the condemned tile');
  assert.ok(iMark > iFurn,
    'the Overview draws the condemned mark UNDER its own furniture layer — same defect, other surface');
});

// MOVING THE MARK LAYER ABOVE THE FURNITURE LAYER IS INERT FOR EVERY PRE-EXISTING MARK, and this is
// the measurement rather than the argument. Debris (fg 4) and dig (fg 15) only ever ride glyph code
// 37 (`'%'`), which is in both surfaces' `NON_FURNITURE`, so no tile in the shipped capture carries
// a mark AND a furniture sprite — the two layers were disjoint and their order could not matter. If
// a future frame ever breaks that, this test says so instead of a screenshot doing it later.
test('THE LIVE BUG: the layer reorder changes NOTHING on the real capture (measured disjointness)', () => {
  let marked = 0, furnished = 0, both = 0;
  const markedXy = new Set(wreckMarks.map((m) => m.x + ',' + m.y));
  for (let ty = 0; ty < wreck.h; ty += 1) {
    for (let tx = 0; tx < wreck.w; tx += 1) {
      const cell = wreck.cells[ty * wreck.w + tx];
      if (!Array.isArray(cell)) continue;
      const isMark = markedXy.has(tx + ',' + ty);
      const isFurn = !!itemForGlyph(cell[0] | 0);
      if (isMark) marked += 1;
      if (isFurn) furnished += 1;
      if (isMark && isFurn) both += 1;
    }
  }
  assert.ok(marked > 0, 'the capture carries no marks at all — the disjointness claim is vacuous');
  assert.ok(furnished > 0, 'the capture carries no furniture at all — the disjointness claim is vacuous');
  assert.equal(both, 0,
    'a tile in the shipped capture carries BOTH a mark byte and a furniture glyph, so moving the '
    + 'mark layer above the furniture layer is NOT the inert reorder it was justified as');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE `items` CHANNEL, DRIVEN THROUGH THE REAL CONTROLLER.
//
// The pure model lives in `items-model.test.js`. What can only be shown HERE is that the layer
// reaches the DOM of the real `roomzoom-view.js` — and, specifically, the two things the projected
// glyph could not deliver:
//
//   • A COUNT AND A NAME instead of one raw ASCII letter in a dashed box. The letter chip is what
//     independent review photographed on `--ship grid` deck 0, room STORAGE: seven of them, `,` ×6
//     and `f` ×1, in the shipping game.
//   • A STACK ON A DEVICE'S TILE AT ALL. `GlyphMapper` pass 4 writes the device glyph over pass 3's
//     item unconditionally, so that stack reached the client nowhere. Drawing the plate UNDER the
//     device sprite would reproduce the erasure in the client after removing it from the wire, so
//     the layer order is asserted rather than assumed — the same trap the `marks` package hit.
//
// Every leg is a PAIR: the precondition half proves the fixture really is in the state being
// measured, so none of these can pass against a controller that draws nothing at all.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** An `items` payload from `[x, y, kind, count]` on deck 1 (the wreck's deck). */
const itemsMsg = (rows) => ({ type: 'items', cells: rows.map((r) => [r[0], r[1], DECK1, r[2], r[3]]) });
/** The empty payload — the state a room with nothing on its floor is really in. */
const NO_ITEMS = { type: 'items', cells: [] };

/**
 * The VS-Z-25 unknown chip's letter at ONE tile, or null when that tile draws no chip.
 *
 * ⚠️ PER-TILE, AND THE FIRST DRAFT WAS NOT — it asserted `!html.includes('>,</text>')` and went RED
 * on its own correct implementation, because the real wreck carries OTHER `,` tiles inside the hold
 * that are not the tile under test. A whole-document `includes` cannot say WHICH tile drew a chip,
 * which is the only thing these tests are about. The chip branch is the one place `furnitureSvg`
 * emits an INTEGER translate (every art branch uses `toFixed(1)`, so it carries a decimal point), and
 * `fill="#57503f" text-anchor` is unique to the chip's text node.
 */
function chipAt(html, tx, ty) {
  // ⭐ VR-P3 — THE CHIP STANDS ON ITS TILE NOW, so it is located by the SHIPPED placement's own
  // translate rather than by `(tx-rx)*U`. Its ink is the charter's UNBUILT/PLANNED spelling — an
  // ink `6 5` dashed plate — which is the honest thing to say about a glyph with no art and is
  // emphatically not the oxblood a queued order wears; the reader keys on the dashed plate's own
  // text node, which nothing else in this layer emits.
  const pl = scenePlacement(roomScene(HOLD), HOLD);
  const [cx, cy] = pl.foot(tx, ty);
  const side = 0.95 * 100 * 0.7;
  const key = '<g transform="translate(' + (cx - side / 2).toFixed(2) + ' ' + (cy - side).toFixed(2) + ')">';
  const i = html.indexOf(key);
  if (i < 0) return null;
  const m = /fill="#14120F" text-anchor="middle"[^>]*>([^<]*)</.exec(html.slice(i, i + 700));
  return m ? m[1] : null;
}

/** The `idPrefix` the ITEM layer builds a stack's piece with, per tile and slot — so a test can say
 *  WHICH layer drew a piece on a tile. The furniture layer's is `rz-f-<tx>-<ty>`. */
const stackId = (tx, ty, slot = 0) => 'rz-it-' + tx + '-' + ty + '-' + slot;
const furnId = (tx, ty) => 'rz-f-' + tx + '-' + ty;
/** The badge/chip texts the item layer drew, in emission order (anchored on the badge text colour). */
// ⭐ VR-P3 — the badge's ink moved to the paper dialect: the count plate is PAPER with an INK
// hairline and INK digits, and it spends NO accent (charter §1's "no accent = nothing to see" — a
// pile of regolith is a thing with nothing to decide about). The reader is anchored on the badge's
// own `text-anchor="middle"` + ink fill, which is unique to it in this layer.
const badges = (html) => [...html.matchAll(/fill="#14120F" text-anchor="middle"[^>]*>([^<]*)</g)].map((m) => m[1]);

// ⚠️ THIS TEST WAS CALLED "THE LETTER BOX IS REPLACED" AND ITS PRECONDITION HAS EXPIRED, which is
// worth stating rather than quietly rewriting: it asserted that a `,` tile with no `items` data drew
// the VS-Z-25 dashed chip carrying a raw `,`. It does not any more, and NOT because of this channel —
// the ground-item ART landed, so `itemForGlyph(44)` resolves and the FRAME alone now draws a pile.
// The letter box is gone from ground items entirely (`device-sprite-coverage.test.js` pins that only
// MetalOre still chips).
//
// WHAT IS LEFT TO PROVE IS BETTER, and it is the thing the art created: the same pile can now be
// drawn from TWO sources — the frame (no count, topmost stack only, erased by any device) and the
// `items` channel (all of it) — and only one of them may win.
test('THE PILE IS DRAWN ONCE, FROM THE CHANNEL (driven): count present, frame duplicate gone', () => {
  const tx = HOLD.rx + 1, ty = HOLD.ry + 1;
  const other = { x: HOLD.rx + 4, y: HOLD.ry + 1 };   // a second spoil tile the channel says NOTHING about
  const cells = wreck.cells.slice();
  cells[ty * wreck.w + tx] = [44, 6, 0, 0];                       // ',' at GlyphColor.Item
  cells[other.y * wreck.w + other.x] = [44, 6, 0, 0];             // …and its neighbour
  try {
    // PRECONDITION / NON-VACUITY: with the frame alone, the surface really does draw a pile on BOTH
    // tiles — from the projection, which has no count. Without this leg every assertion below would
    // be satisfied by a controller that had simply stopped drawing these tiles.
    Hud.renderFrame({ ...wreck, cells });
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
    const before = rzLayers.innerHTML;
    assert.ok(before.includes(furnId(tx, ty)), 'precondition: the FRAME draws no pile on this tile');
    assert.ok(before.includes(furnId(other.x, other.y)), 'precondition: nor on its neighbour');
    assert.equal(chipAt(before, tx, ty), null,
      'precondition: the tile still draws the raw-letter chip, so the ground-item art is not wired');
    assert.deepEqual(badges(before), [],
      'precondition: a count appeared with no items channel — it could only be invented');

    Hud.renderItems(itemsMsg([[tx, ty, 0, 40]]));
    rzApi.exit(); rzApi.enter('hold');
    const after = rzLayers.innerHTML;

    assert.ok(after.includes('class="rz-items"'), 'the item layer must reach the DOM');
    assert.ok(after.includes(stackId(tx, ty)),
      'the ITEM layer drew no piece on the stocked tile — the count has nothing to sit beside');
    assert.deepEqual(badges(after), ['40'],
      'the COUNT is the fact no projection byte could ever carry: a stack of 1 and a stack of 40 '
      + 'write the identical cell. Art that dropped it would discard the whole channel.');
    assert.ok(!after.includes(furnId(tx, ty)),
      'THE PILE IS DRAWN TWICE. The frame-derived copy is still on this tile underneath the '
      + 'authoritative one — same art, no count, topmost stack only, and erased by any device. Two '
      + 'piles on one tile, one of them lying.');
    // …and the suppression is SURGICAL. Without this leg, "suppress the frame everywhere" would pass
    // — and that would blank every pile the channel happens not to mention.
    assert.ok(after.includes(furnId(other.x, other.y)),
      'the neighbouring spoil tile lost its frame-derived pile too. Only the tiles the channel '
      + 'covers may lose theirs; the frame is still the honest source everywhere else.');
  } finally {
    Hud.renderFrame(wreck);
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
  }
});

test('LOSS 2 (driven): two kinds on one tile are BOTH drawn — the projection could show only one', () => {
  const tx = HOLD.rx + 2, ty = HOLD.ry + 1;
  const cells = wreck.cells.slice();
  // The frame can only carry the LAST stack: pass 3 assigns the cell per item. Here that is Potato.
  cells[ty * wreck.w + tx] = [102, 6, 0, 0];   // 'f' = Glyphs.ForItem(Potato)
  try {
    Hud.renderFrame({ ...wreck, cells });
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
    const before = rzLayers.innerHTML;
    assert.ok(before.includes(furnId(tx, ty)),
      'precondition: the frame draws nothing here, so "one kind became two" is unmeasurable');
    assert.deepEqual(badges(before), [],
      'precondition: the frame carries ONE letter and no number — that is the loss under test');

    Hud.renderItems(itemsMsg([[tx, ty, 0, 7], [tx, ty, 3, 2]]));
    rzApi.exit(); rzApi.enter('hold');
    const html = rzLayers.innerHTML;
    assert.ok(html.includes(stackId(tx, ty, 0)), 'the stack the projection DROPPED must be drawn');
    assert.ok(html.includes(stackId(tx, ty, 1)), 'and so must the one it kept');
    assert.deepEqual(badges(html), ['7', '2'], 'with a count each — two piles, two numbers');
    assert.ok(html.includes('data-kind="0"') && html.includes('data-kind="3"'),
      'both KINDS must be named, or the two slots could be two drawings of the same pile');
  } finally {
    Hud.renderFrame(wreck);
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
  }
});

test('LOSS 3 (driven): a stack on a DEVICE tile is drawn, and drawn ABOVE the device', () => {
  // A glyph code the Room Zoom skins as a DEVICE — derived from the shipped registry rather than
  // written down, and `isDeviceItem` is what keeps the derivation honest now that ground items have
  // art too: without it this loop would happily pick `,` and the whole test would be a pile on a pile.
  let code = 0;
  for (let c = 33; c < 127 && !code; c += 1) if (isDeviceItem(itemForGlyph(c))) code = c;
  assert.ok(code, 'no glyph code maps to a DEVICE item — the derivation found nothing to test with');

  const tx = HOLD.rx + 1, ty = HOLD.ry + 2;
  const cells = wreck.cells.slice();
  cells[ty * wreck.w + tx] = [code, 8, 0, 0];   // an ordinary powered device — what pass 4 writes
  try {
    Hud.renderFrame({ ...wreck, cells });
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
    const before = rzLayers.innerHTML;
    assert.ok(before.includes(furnId(tx, ty)),
      'precondition: the device sprite is not on this tile, so the burial test below is vacuous');
    assert.deepEqual(badges(before), [], 'precondition: no stock before the channel arrives');

    Hud.renderItems(itemsMsg([[tx, ty, 5, 12]]));
    rzApi.exit(); rzApi.enter('hold');
    const html = rzLayers.innerHTML;

    assert.ok(html.includes(stackId(tx, ty)),
      'a stack stored on a device tile drew nothing. Under the projection it reached the client '
      + 'nowhere at all — pass 4 painted the device glyph over it — and that is loss 3.');
    assert.deepEqual(badges(html), ['12'], 'and it must carry its count');
    assert.ok(html.includes(furnId(tx, ty)),
      'THE DEVICE SPRITE WAS SUPPRESSED. Only the frame\'s rendering of the PILE (and the unknown-'
      + 'letter chip) may be dropped on a stocked tile: real furniture art says what is installed '
      + 'there, the stack says what is lying there, and both are true.');

    assert.ok(html.indexOf(stackId(tx, ty)) > html.indexOf(furnId(tx, ty)),
      'the stack is drawn BEFORE (i.e. underneath) the device sprite, so the player sees the machine '
      + 'and not the stock — the wire loss removed and the same loss reintroduced in the client');
  } finally {
    Hud.renderFrame(wreck);
    Hud.renderItems(NO_ITEMS);
    rzApi.exit(); rzApi.enter('hold');
  }
});

// ⚠️ THE SAME MUTATION THAT SURVIVED ON `marks`. `renderItems(m) { _items = m; }` — the cache
// written, the surfaces never told — would pass every other test in this file, because they all
// re-enter the room (which repaints unconditionally). `items` is deduped by `GameSession.Send`, so on
// a quiet ship it is sent once; a haul that just landed would sit invisible until some unrelated
// channel moved. This test dispatches ONLY the items channel and lets the coalesced repaint land.
//
// MUTATION: drop `notifyShip()` from `renderItems` in hud.js ⇒ RED.
test('an items dispatch ALONE repaints the surfaces — the cache is not enough', async () => {
  const tx = HOLD.rx + 3, ty = HOLD.ry + 2;
  try {
    rzApi.exit(); rzApi.enter('hold');
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(!rzLayers.innerHTML.includes(stackId(tx, ty)), 'precondition: nothing is stocked yet');

    // NOTHING ELSE IS DISPATCHED. No frame, no decks, no rooms — only the channel under test.
    Hud.renderItems(itemsMsg([[tx, ty, 8, 9]]));
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(rzLayers.innerHTML.includes(stackId(tx, ty)),
      'an `items` message reached the cache and the Room Zoom never repainted. The channel is '
      + 'deduped by GameSession.Send, so on a quiet ship it is sent ONCE — a haul that just landed '
      + 'would then sit invisible until some unrelated channel moved.');
  } finally {
    Hud.renderItems(NO_ITEMS);
    await new Promise((r) => setTimeout(r, 40));
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE DOOR — a closed door inside a room rect drew a dashed box with a `+` in it (door package,
// 2026-07-27). Everything here is DRIVEN through the shipping controller or the shipping composer.
//
// WHAT WAS ACTUALLY WRONG, measured rather than inherited. `docs/HANDOVER.md` says the fix is "to
// make the two `NON_FURNITURE` sets agree". THERE IS ONLY ONE SET — `NON_FURNITURE_CODES` in
// `room-model.js`, imported by `overview-scene.js` — since the ground-item art package unified them.
// The disagreement that remained was between that set and `STRUCTURE_CODES`, and forcing THOSE to
// agree would have made a closed door draw NOTHING, which is worse than the chip and is the failure
// this package exists to end. `device-sprite-coverage.test.js`'s allowlist excused `Door` from the
// art guard entirely, on two claims that are both false:
//   • "drawn by the Room Zoom's STRUCTURE layer and the Overview's wall layer" — there is no such
//     layer on either surface (`roomMaterialTiles` emits glyph 35 and 46 and nothing else; the
//     Overview's compartments come from the `decks` slot rects). Nothing drew a door at all.
//   • "zero such tiles on --ship grid deck 0 today (the ship's doors sit on room boundaries, which
//     are outside every room rect)" — refuted by the census immediately below, over the committed
//     capture, on both decks.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Every door tile on a captured deck: `[tx, ty, char, insideARoomRect]`. */
function doorCensus(frame) {
  const rects = deckSlots(fixView, frame.deck).map((s) => s.rect);
  const out = [];
  for (let ty = 0; ty < frame.h; ty += 1) {
    for (let tx = 0; tx < frame.w; tx += 1) {
      const c = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(c)) continue;
      const ch = String.fromCharCode(c[0] | 0);
      if (ch !== '+' && ch !== '/' && ch !== 'X') continue;
      out.push([tx, ty, ch, rects.some((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h)]);
    }
  }
  return out;
}

// ⚠️ THE RETRACTION, MEASURED. The allowlist entry this package deleted said the ship's doors sit
// OUTSIDE every room rect and that there were therefore zero exposed door tiles. Both decks of the
// committed capture say otherwise, and they say it about EVERY door: the door sits on the room's own
// rect edge, so it is in-rect by construction on a ship whose rooms are all built the same way.
// MUTATION: `deckSlots(fixView, frame.deck)` → `[]` (a rect list that finds nothing) ⇒ RED.
test('THE RETRACTION: every door tile on the captured grid ship is INSIDE a room rect', () => {
  for (const [name, fr] of [['deck 0', FIX.frame], ['deck 1', wreck]]) {
    const doors = doorCensus(fr);
    assert.equal(doors.length, 8,
      `${name} carries ${doors.length} door tiles, not 8 — re-derive before adjusting, because this `
      + 'number is the size of the surface the allowlist claimed was empty');
    const outside = doors.filter((d) => !d[3]);
    assert.deepEqual(outside, [],
      `${name}: the allowlist claimed the ship's doors "sit on room boundaries, which are outside `
      + 'every room rect". These are inside one: ' + JSON.stringify(outside));
  }
  // …and the closed ones are real, not hypothetical: the state the projection picks is
  // `GlyphMapper.DeviceGlyph`, which returns '+' whenever the door is shut.
  //
  // ⚠️ "INSIDE A ROOM RECT" IS NOT "IN A ROOM THE PLAYER CAN ENTER", and the two must not be
  // conflated when this number is quoted. `deckSlots` yields every slot on the deck INCLUDING
  // unoccupied halls, whose `anchorName` is blank — and `roomTileRect` refuses a blank anchor, so
  // the Room Zoom cannot be opened on one. All three CLOSED doors below sit in blank-anchor slots,
  // so at boot the number of closed doors in an ENTERABLE room is **zero**; the enterable case is
  // reached by a player gesture (shutting a door, or building one — `BuildSystem.cs:226`). What the
  // census refutes is the allowlist's geometric premise — "doors sit on room boundaries, which are
  // outside every room rect" — and that premise is false for all 16 doors on both decks.
  const closed = doorCensus(wreck).filter((d) => d[2] === '+');
  assert.equal(closed.length, 3,
    'deck 1 of the capture no longer carries exactly three CLOSED door tiles. It carried three when '
    + 'the door package measured it, and each one drew a dashed box with a raw `+` in it.');
});

/** The client-space point at the centre of (tx,ty) for an arbitrary focus rect. */
const atTileIn = (focus, tx, ty) => scenePointFor(focus, tx, ty);
/** Enter `anchor`, size the layer rect to it, and return the focus. */
function rzEnter(anchor) {
  const f = slotFocus(anchor);
  rzApi.exit();
  rzApi.enter(anchor);
  rzLayers._rect = sceneRectFor(f);
  return f;
}

// ═══════════════════════════════ ⭐⭐ VR-P3-a — THE PRESS LANDS ON THE PIECE, NOT THE FLOOR BEHIND IT
//
// THE DEFECT, MEASURED IN THE RUNNING GAME BEFORE THE FIX (headless Chrome, the wreck's cryo bay,
// STRIP armed, the `strip` command read straight off the page's own WebSocket): of the 18 fittings
// that room draws, SIXTEEN designated a tile one to three rows BEHIND the one they are drawn on and
// TWO designated NO TILE AT ALL — their ink projects clean out of the room, so the press was simply
// swallowed. `tileFromScenePoint` inverts the cabinet oblique on the FLOOR PLANE only, and a fitting
// STANDS UP off its floor point, so its top and front faces hang over the tiles behind it. That is
// the whole of the owner's "not all squares work", and it is worst on exactly the pieces STRIP and
// PRIORITISE are aimed at.
//
// THE FIX IS TWO HALVES AND BOTH ARE DRIVEN HERE, because either alone is INERT:
//   (1) the BUILDER emits `data-tile` + `pointer-events="visiblePainted"` on every standing piece;
//   (2) the HANDLER's `tileAt` reads the element under the pointer FIRST and falls through to the
//       closed-form inverse only on bare floor.
// A handler reading an attribute nothing emits is `verb parity is NOT sufficient` exactly; a builder
// emitting an attribute nothing reads is the same failure from the other side. Neither half alone
// moves a pixel for the player, so neither half alone is allowed to be the test.
//
// ⛔ THE CONTROL IS HALF THE TEST. Every leg fires the SAME coordinates twice — once with a piece as
// `e.target` and once with the bare canvas — and the two must answer DIFFERENT tiles. Without it,
// "the press designates the piece's tile" is satisfied just as well by a tier that swallowed the
// floor map whole, and every bare-floor sweep in this file would then be quietly wrong.
//
// EACH LEG IS ITS OWN `test()` (CLAUDE.md trap 5 — `assert` throws, so a multi-leg test reports only
// its first failing leg and a dead later leg is indistinguishable from a live one).
//
// MUTATIONS (physically applied, watched RED for the right reason, reverted):
//   · delete the `data-tile` tier from `roomzoom-view.js`'s `tileAt`  ⇒ legs 2/3/4 RED
//   · drop `data-tile=` from `furnitureSvg`'s `fit()` wrapper         ⇒ leg 1 RED
//   · drop `pointer-events="visiblePainted"` from that wrapper        ⇒ leg 1 RED
//   · delete the room-bounds check in `tileAt`                        ⇒ leg 5 RED
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A standing piece as `e.target`: the node the browser hands a handler when a press lands on drawn
 *  ink. `dataset` AND the attribute are set the way the innerHTML scanner sets them for a real one —
 *  the controller reads `dataset.tile`, `closest('[data-tile]')` walks `dataset`. */
function rzFitNode(tx, ty) {
  const el = new RzEl(rzDoc, 'g');
  el.setAttribute('data-tile', tx + ',' + ty);
  el.dataset.tile = tx + ',' + ty;
  el.parentNode = rzCanvas;   // a press on a piece bubbles to the canvas handler, as in the document
  return el;
}
/** The tile a fitting is planted on, and a SECOND tile whose scene point the presses below use. The
 *  two are different on both axes, so a leg cannot pass by accident on one of them. */
const VR_FIT = { x: HOLD.rx + 5, y: HOLD.ry + 3 };
const VR_FLOOR = { x: HOLD.rx + 4, y: HOLD.ry + 6 };

test('VR-P3-a leg 1: every standing piece is EMITTED with the tile it was drawn for, and its own '
  + 'ink is the pressable part', () => {
  const cells = wreck.cells.slice();
  try {
    // A LOCKER — the tall case, and the one the cryo-bay measurement was worst on.
    cells[VR_FIT.y * wreck.w + VR_FIT.x] = ['L'.charCodeAt(0), 8, 0, 0];
    Hud.renderFrame({ ...wreck, cells });
    rzEnter('hold');
    const html = rzLayers.innerHTML;
    assert.ok(html.includes(furnId(VR_FIT.x, VR_FIT.y)),
      'precondition: the locker did not draw at all, so nothing below is about this package');
    assert.ok(html.includes('<g class="rz-fit" data-tile="' + VR_FIT.x + ',' + VR_FIT.y
      + '" pointer-events="visiblePainted">'),
      'the piece carries no `data-tile`/`pointer-events` wrapper, so the surface has nothing to '
      + 'resolve a press against and every press on it falls back to the FLOOR-PLANE inverse — which '
      + 'is the defect, measured at 16 of 18 fittings designating the wrong tile.');
    // …and the GROUP stays `none`, which is what makes the two tiers agree instead of fight: the
    // unpainted paper inside a piece's box (between a chair's legs) is not a target.
    assert.ok(html.includes('<g class="rz-furniture" pointer-events="none">'),
      'the furniture GROUP became hit-testable. Then a piece\'s whole bounding box swallows presses '
      + 'aimed at the floor showing through it, which trades this defect for its mirror image.');
  } finally { Hud.renderFrame(wreck); rzEnter('hold'); }
});

test('VR-P3-a leg 2: a STRIP sweep pressed on a piece marks the PIECE\'S tile, and the same '
  + 'coordinates on bare floor still mark the floor tile', () => {
  rzArm('strip');
  // CONTROL — bare canvas: the floor-plane inverse answers, exactly as it always did.
  rzSent.length = 0;
  rzFire(rzCanvas, 'mousedown', { button: 0, ...atTile(VR_FLOOR.x, VR_FLOOR.y) });
  rzMouseUp();
  assert.deepEqual(rzOrders(rzSent.slice()).map(xy), [[VR_FLOOR.x, VR_FLOOR.y]],
    'the bare-floor tier stopped working — tier one is swallowing the whole canvas');
  // …and with a piece under the pointer the piece wins, at the SAME coordinates.
  rzSent.length = 0;
  rzFire(rzFitNode(VR_FIT.x, VR_FIT.y), 'mousedown', { button: 0, ...atTile(VR_FLOOR.x, VR_FLOOR.y) });
  rzMouseUp();
  assert.deepEqual(rzOrders(rzSent.slice()).map(xy), [[VR_FIT.x, VR_FIT.y]],
    'STRIP pressed ON a fitting condemned the floor tile the fitting is drawn OVER. That is the '
    + 'reported defect: the mark lands behind the thing the player pointed at.');
  rzArm('strip');
});

test('VR-P3-a leg 3: a single-click PLACE on a piece targets the piece\'s tile', () => {
  rzArm('lamp');   // `cls: functional` — exactly one click and exactly one `Cmd.place`
  rzSent.length = 0;
  rzFire(rzCanvas, 'click', { button: 0, ...atTile(VR_FLOOR.x, VR_FLOOR.y) });
  const floor = rzOrders(rzSent.slice()).filter((o) => o.cmd === 'place');
  assert.deepEqual(floor.map(xy), [[VR_FLOOR.x, VR_FLOOR.y]], 'control: the floor tier answers');
  rzSent.length = 0;
  rzFire(rzFitNode(VR_FIT.x, VR_FIT.y), 'click', { button: 0, ...atTile(VR_FLOOR.x, VR_FLOOR.y) });
  const onPiece = rzOrders(rzSent.slice()).filter((o) => o.cmd === 'place');
  assert.deepEqual(onPiece.map(xy), [[VR_FIT.x, VR_FIT.y]],
    'a PLACE click on a drawn piece landed on the floor tile behind it — `onCanvasClick` is still '
    + 'reaching for the floor-plane inverse directly instead of going through `tileAt`.');
  rzArm('lamp');
});

test('VR-P3-a leg 4: both ENDPOINTS of a sweep take the element tier', () => {
  rzArm('strip');
  rzSent.length = 0;
  // press on a piece at (fit), drag to bare floor at (floor) — the rectangle must span BOTH answers.
  rzFire(rzFitNode(VR_FIT.x, VR_FIT.y), 'mousedown', { button: 0, ...atTile(VR_FLOOR.x, VR_FLOOR.y) });
  rzFire(rzCanvas, 'mousemove', { button: 0, ...atTile(VR_FLOOR.x, VR_FLOOR.y) });
  rzMouseUp();
  const tiles = rzOrders(rzSent.slice()).map(xy).sort();
  const lo = { x: Math.min(VR_FIT.x, VR_FLOOR.x), y: Math.min(VR_FIT.y, VR_FLOOR.y) };
  const hi = { x: Math.max(VR_FIT.x, VR_FLOOR.x), y: Math.max(VR_FIT.y, VR_FLOOR.y) };
  const want = [];
  for (let y = lo.y; y <= hi.y; y += 1) for (let x = lo.x; x <= hi.x; x += 1) want.push([x, y]);
  assert.deepEqual(tiles, want.slice().sort(),
    'the sweep did not span the PIECE tile and the FLOOR tile. A press resolved one way and a '
    + 'release resolved another is a rectangle the player never drew.');
  rzArm('strip');
});

test('VR-P3-a leg 5: a `data-tile` OUTSIDE the focused room is refused and the floor tier answers', () => {
  rzArm('strip');
  const stray = rzFitNode(HOLD.rx + HOLD.rw + 3, HOLD.ry + 1);   // a tile in the next compartment
  rzSent.length = 0;
  rzFire(stray, 'mousedown', { button: 0, ...atTile(VR_FLOOR.x, VR_FLOOR.y) });
  rzMouseUp();
  assert.deepEqual(rzOrders(rzSent.slice()).map(xy), [[VR_FLOOR.x, VR_FLOOR.y]],
    'an attribute naming a tile in ANOTHER compartment lowered an order there. Tier two returns null '
    + 'outside the room by construction; tier one is a string off an attribute and must be checked, '
    + 'not trusted.');
  rzArm('strip');
});

// THE BUG, DRIVEN THROUGH THE SHIPPING CONTROLLER, on a tile a player reaches by pressing DOOR.
// `sim/Sim.Core/Systems/BuildSystem.cs:226` says in its own comment "the door starts closed", and
// the DOOR tool is on this palette — so a closed door inside a room is one gesture away, not a
// fixture curiosity.
//
// ⚠️ THE NON-VACUITY CONTROL IS FIRST AND IS HALF THE TEST: an unskinned glyph on the SAME tile must
// still chip. Without it, "no `+` chip" is satisfied just as well by a Room Zoom that lost its
// furniture layer, or by a tile the room rect does not contain.
// MUTATION: `dev('Door', '+')` → `dev('Door', null)` in items/index.js ⇒ RED.
test('THE DOOR BUG (driven): a CLOSED door in a room rect draws a door, not a dashed `+`', () => {
  const f = slotFocus('hold');
  const tx = f.rx + 5, ty = f.ry + 3;
  const cells = wreck.cells.slice();
  try {
    // control — a glyph nothing skins, on the tile under test
    cells[ty * wreck.w + tx] = ['z'.charCodeAt(0), 8, 0, 0];
    Hud.renderFrame({ ...wreck, cells });
    rzEnter('hold');
    const control = rzLayers.innerHTML;
    assert.equal(chipAt(control, tx, ty), 'z',
      'the VS-Z-25 unknown chip did not render for an unskinned glyph on this tile — the rig cannot '
      + 'see the bug, so nothing below means anything');

    cells[ty * wreck.w + tx] = ['+'.charCodeAt(0), 8, 0, 0];   // Glyphs.DoorClosed
    Hud.renderFrame({ ...wreck, cells });
    rzEnter('hold');
    const html = rzLayers.innerHTML;

    assert.equal(chipAt(html, tx, ty), null,
      'A CLOSED DOOR STILL DRAWS THE DASHED BOX WITH A RAW `+` IN IT. That is HANDOVER §4l, on the '
      + 'kind the art guard used to excuse, reachable by pressing DOOR inside a room.');
    assert.ok(html.includes(furnId(tx, ty)),
      'the door tile drew NOTHING. That is the other half of the defect and it is worse than the '
      + 'chip: "make the NON_FURNITURE sets agree" would have shipped exactly this.');
    assert.equal(itemForGlyph('+'.charCodeAt(0)), 'sliding-door',
      "the closed-door glyph must resolve to the set's own door leaf, not to some other piece");
  } finally {
    Hud.renderFrame(wreck);
    rzEnter('hold');
  }
});

// The LOCKED state is a SEPARATE decision and a separate piece, because the SVG furniture layer
// reads `cell[0]` only — `GlyphColor.Locked` (GlyphMapper.cs:243) reaches neither surface, so the
// art is the one channel left that can say "locked" rather than merely "shut".
// MUTATION: delete the `X: 'blast-door'` entry from GLYPH_SUBSTITUTE ⇒ RED.
test('a LOCKED door draws a DIFFERENT door — the only channel left that can say locked', () => {
  const f = slotFocus('hold');
  const tx = f.rx + 5, ty = f.ry + 3;
  const cells = wreck.cells.slice();
  try {
    cells[ty * wreck.w + tx] = ['X'.charCodeAt(0), 8, 0, 0];   // Glyphs.DoorLocked
    Hud.renderFrame({ ...wreck, cells });
    rzEnter('hold');
    assert.equal(chipAt(rzLayers.innerHTML, tx, ty), null,
      'a LOCKED door drew the dashed box with a raw `X` in it');
    assert.ok(rzLayers.innerHTML.includes(furnId(tx, ty)), 'a locked door drew nothing at all');
    assert.equal(itemForGlyph('X'.charCodeAt(0)), 'blast-door');
    assert.notEqual(itemForGlyph('X'.charCodeAt(0)), itemForGlyph('+'.charCodeAt(0)),
      'LOCKED and CLOSED collapsed onto one piece. `cell[1]` never reaches this layer, so a player '
      + 'would then have no way at all to tell a sealed door from a shut one.');
  } finally {
    Hud.renderFrame(wreck);
    rzEnter('hold');
  }
});

// THE DELIBERATE ASYMMETRY — and it is asserted because it is the half a reviewer will read as an
// oversight. An OPEN doorway is a GAP: `'/'` stays in NON_FURNITURE, the wall run shows a hole, and
// the player can therefore see at a glance which doors are shut. Ledgered as `NO_DEVICE_GLYPH_ART`.
// MUTATION: remove 47 from NON_FURNITURE_CODES ⇒ RED (the open tile starts drawing).
test('an OPEN door still draws NOTHING, and that is the decision — with a control that proves it', () => {
  const f = slotFocus('hold');
  const tx = f.rx + 5, ty = f.ry + 3;
  const cells = wreck.cells.slice();
  try {
    cells[ty * wreck.w + tx] = ['/'.charCodeAt(0), 8, 0, 0];   // Glyphs.DoorOpen
    Hud.renderFrame({ ...wreck, cells });
    rzEnter('hold');
    const open = rzLayers.innerHTML;
    assert.equal(chipAt(open, tx, ty), null, 'an open doorway drew the dashed chip');
    assert.ok(!open.includes(furnId(tx, ty)),
      'an OPEN doorway drew a door leaf. That asserts the door is shut, on the one tile a crew '
      + 'member walks through.');
    // THE CONTROL, on the same tile in the same room: closed DOES draw. Without it this test passes
    // against a surface that draws no doors in any state, which is the bug it sits next to.
    cells[ty * wreck.w + tx] = ['+'.charCodeAt(0), 8, 0, 0];
    Hud.renderFrame({ ...wreck, cells });
    rzEnter('hold');
    assert.ok(rzLayers.innerHTML.includes(furnId(tx, ty)),
      'the CLOSED state draws nothing either — "open draws nothing" is then vacuous');
  } finally {
    Hud.renderFrame(wreck);
    rzEnter('hold');
  }
});

// THE DOUBLY-LATENT HARM the `items` channel layered on top, closed by the art rather than by
// narrowing the suppression. `furnitureSvg` drops a cell on a stocked tile when it is `!itemId` OR a
// RESOURCE piece; a door is a `functional` piece, so it survives. Both halves are driven here,
// because "the door survives" is only meaningful beside "a pile does not".
// MUTATION: `(!c.itemId || isResourceItem(c.itemId))` → `true` in roomzoom-view.js ⇒ RED.
test('a ground stack on a door tile does NOT erase the door (and still erases a pile)', () => {
  const f = slotFocus('hold');
  const door = { x: f.rx + 5, y: f.ry + 3 };
  const pile = { x: f.rx + 6, y: f.ry + 3 };
  const cells = wreck.cells.slice();
  try {
    cells[door.y * wreck.w + door.x] = ['+'.charCodeAt(0), 8, 0, 0];
    cells[pile.y * wreck.w + pile.x] = [44, 6, 0, 0];             // ',' Regolith, a RESOURCE piece
    Hud.renderFrame({ ...wreck, cells });
    Hud.renderItems(NO_ITEMS);
    rzEnter('hold');
    const before = rzLayers.innerHTML;
    assert.ok(before.includes(furnId(door.x, door.y)), 'precondition: the door is not drawn unstocked');
    assert.ok(before.includes(furnId(pile.x, pile.y)), 'precondition: the frame-derived pile is absent');

    Hud.renderItems(itemsMsg([[door.x, door.y, 0, 12], [pile.x, pile.y, 0, 12]]));
    rzEnter('hold');
    const after = rzLayers.innerHTML;
    assert.ok(after.includes(furnId(door.x, door.y)),
      'THE DOOR WAS ERASED BY A GROUND STACK. The `items` channel suppresses the frame-derived '
      + 'drawing on a stocked tile, and before the door had art its cell was `itemId:""` — so a door '
      + 'with stock on it drew NOTHING, not even the wrong letter. Real furniture must survive: the '
      + 'stack says what is LYING there, the door says what is INSTALLED there.');
    assert.ok(!after.includes(furnId(pile.x, pile.y)),
      'the suppression stopped working for a RESOURCE piece — the pile is now drawn twice, once '
      + 'from the countless projection and once from the channel');
  } finally {
    Hud.renderFrame(wreck);
    Hud.renderItems(NO_ITEMS);
    rzEnter('hold');
  }
});

// THE OTHER SURFACE. The Overview `continue`s on `!itemId`, so an unskinned glyph there is not a
// chip — it is silently absent, which is worse to find. Same fix, different failure mode.
// MUTATION: `dev('Door', '+')` → `dev('Door', null)` in items/index.js ⇒ RED.
test('the OVERVIEW composer draws a closed door too — it was silently absent, not chipped', () => {
  const probe = (ch) => overviewScene({
    deck: DECK1, decksView: fixView, crew: [], marks: [],
    frame: { deck: DECK1, w: 1, h: 1, lens: 'none', cells: [[ch.charCodeAt(0), 8, 0, 0]] },
  });
  assert.ok(!probe('z').includes('class="pl-furniture"'),
    'control: an unskinned glyph drew a furniture layer on the Overview — the probe proves nothing');
  assert.ok(probe('+').includes('class="pl-furniture"'),
    'THE OVERVIEW DREW NOTHING for a closed door. `furnitureLayer` does `if (!itemId) continue`, so '
    + 'the tile is not a chip here, it is absent from the schematic entirely.');
  assert.ok(probe('X').includes('class="pl-furniture"'), 'nor for a locked one');
  assert.ok(!probe('/').includes('class="pl-furniture"'),
    'an OPEN doorway drew a leaf on the Overview — see NO_DEVICE_GLYPH_ART for why it must not');
});

// ART MUST NOT MAKE A DOOR REMOVABLE. `demolishTarget`'s device branch excludes `STRUCTURE_CODES`,
// and this is the assertion that keeps the two sets deliberately unequal: a door is now furniture
// the surfaces DRAW and structure DEMOLISH cannot take apart, and both are true at once.
// MUTATION: delete 43 and 88 from STRUCTURE_CODES ⇒ RED (they classify as `device`).
test('a door is still BUILT STRUCTURE for DEMOLISH — the art did not make it Cmd.remove-able', () => {
  const at = (ch) => {
    const cells = wreck.cells.slice();
    cells[(HOLD.ry + 3) * wreck.w + (HOLD.rx + 5)] = [ch.charCodeAt(0), 8, 0, 0];
    return demolishTarget(HOLD.rx + 5, HOLD.ry + 3, [], [], { ...wreck, cells });
  };
  for (const ch of ['+', '/', 'X']) {
    assert.deepEqual(at(ch), { kind: 'built-wall', verb: null },
      `DEMOLISH on a ${JSON.stringify(ch)} door no longer classifies as built structure. Giving the `
      + 'door glyphs art made `itemForGlyph` truthy for them, and `STRUCTURE_CODES` is the only '
      + 'thing standing between that and a `Cmd.remove` at a door — which `RemoveDeviceCommand` '
      + 'would silently drop (`IsPlaceableFurniture`, Commands.cs:566, excludes Door).');
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// DEMOLISH → `Cmd.remove`, DRIVEN. Until now NOTHING anywhere pinned that a device DEMOLISH emits a
// command at all: `roomzoom-view.js:875`'s `case 'device'` arm was unreached by any test, and every
// assertion about the Light regression stopped at `demolishTarget`'s RETURN VALUE.
//
// ⚠️ WHY THE GAP MATTERS RATHER THAN BEING A TIDINESS ITEM. `demolishTarget` returning
// `{kind:'device'}` and the player actually removing a device are two different claims, and the
// second one broke: for one commit DEMOLISH was dead on every lamp on `--ship grid` — the switch hit
// `default: break`, so no command, no toast and no pulse — and the suite was 796-GREEN BEFORE AND
// AFTER THE FIX. A classifier assertion cannot see a dropped `case`, a renamed verb, a `Cmd.remove`
// that stopped existing, or a payload with the wrong deck on it.
//
// RECORDED AT THE SEAM, NOT SCANNED (`CLAUDE.md` trap 4): the assertions read what came out of the
// injected `send`, so they catch every spelling of the mistake and no comment stripper is involved.
// PARITY IS BY IMPORT: expectations are compared against what `Cmd.remove(...)` actually returns, so
// a drift on either side reddens — with one absolute wire-shape pin beside it, because equality
// alone stays green through a change that moves both.
//
// EACH LEG IS ITS OWN `test()` (`CLAUDE.md` trap 5 — `assert` throws, so a multi-leg test reports
// only its first failing leg and a dead second leg is indistinguishable from a live one).
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Everything the controller sent, cursor chatter dropped. */
const sentOrders = () => rzSent.filter((o) => o && o.cmd !== 'cursor');

// THE SUBSTITUTED-ART CASE, ON THE REAL SHIP — the exact tile the regression shipped broken. Not a
// synthetic frame: the committed `--ship grid` deck-1 capture puts a Light at (5,13), inside the
// FABRICATION room rect, and `RoomOutfitter` puts one at the centre of every room. `'*'` resolves
// through `GLYPH_SUBSTITUTE` to `wall-lamp`, a COSMETIC row, which is what made a predicate over the
// borrowed art's registry `kind` classify a real placeable device as `empty`.
//
// MUTATIONS (physically applied, semantic REDs, module left loadable):
//   • `!isResourceItem(_id)` → `isDeviceItem(_id)` in room-model.js ⇒ RED (the shipped defect).
//   • delete `case 'device':` from `doDemolish`'s switch in roomzoom-view.js ⇒ RED (the arm that
//     no test reached before this one).
test('DEMOLISH on a real LAMP on the captured grid ship SENDS Cmd.remove (the seam, driven)', () => {
  const f = rzEnter('fabrication');
  const tile = { x: 5, y: 13 };
  assert.equal(wreck.cells[tile.y * wreck.w + tile.x][0], '*'.charCodeAt(0),
    'the captured ship no longer has a Light at (5,13) — re-derive the tile, do not delete the test');
  assert.ok(clampTileToRoom(tile.x, tile.y, f), 'that lamp is not inside the FABRICATION rect');

  // CONTROL FIRST: the same click with NO tool armed must send nothing. Without it, "a remove was
  // sent" is satisfied by a canvas that emits one on every click.
  rzSent.length = 0;
  rzFire(rzCanvas, 'click', { button: 0, ...atTileIn(f, tile.x, tile.y) });
  assert.deepEqual(sentOrders(), [], 'an UNARMED click on the lamp sent a command');

  rzArm('demolish');
  rzSent.length = 0;
  rzFire(rzCanvas, 'click', { button: 0, ...atTileIn(f, tile.x, tile.y) });
  const orders = sentOrders();
  rzArm('demolish');

  assert.equal(orders.length, 1,
    'DEMOLISH on a LIGHT emitted ' + orders.length + ' commands, not 1: ' + JSON.stringify(orders)
    + '\nZERO is the regression that shipped — `roomzoom-view.js`\'s switch hit `default: break` and '
    + 'the click was dropped with no command, no toast and no pulse, on a device the player can '
    + 'build from this very palette.');
  assert.deepEqual(orders[0], Cmd.remove(tile.x, tile.y, f.deck),
    'the payload is not what `Cmd.remove` lowers to. Compared against the shipped lowering by '
    + 'IMPORT, so a drift on either side reddens.');
  // …and one ABSOLUTE pin beside it, because equality-by-import stays green through a change that
  // moves both sides together — the deck in particular is invisible to it.
  assert.deepEqual(orders[0], { cmd: 'remove', x: 5, y: 13, deck: 1 },
    'THE WIRE SHAPE MOVED. `RemoveDeviceCommand` reads {cmd,x,y,deck}; a wrong deck removes a device '
    + 'on another floor, which no equality-by-import assertion can see.');
});

// The same arm, reached by a device that wears its OWN art — so "DEMOLISH removes devices" is not a
// claim about substitutions only. Driven on a synthetic tile because the hold has no device in it.
// MUTATION: delete `case 'device':` from `doDemolish` ⇒ RED.
test('DEMOLISH on a device wearing its OWN art sends Cmd.remove too', () => {
  const f = slotFocus('hold');
  const tile = { x: f.rx + 5, y: f.ry + 3 };
  const cells = wreck.cells.slice();
  cells[tile.y * wreck.w + tile.x] = ['S'.charCodeAt(0), 8, 0, 0];   // Scrubber — a plain functional row
  try {
    assert.equal(ITEMS[itemForGlyph('S'.charCodeAt(0))].kind, 'functional',
      "'S' no longer resolves to a functional row, so this test no longer contrasts with the lamp");
    Hud.renderFrame({ ...wreck, cells });
    rzEnter('hold');
    rzArm('demolish');
    rzSent.length = 0;
    rzFire(rzCanvas, 'click', { button: 0, ...atTileIn(f, tile.x, tile.y) });
    const orders = sentOrders();
    rzArm('demolish');
    assert.deepEqual(orders, [Cmd.remove(tile.x, tile.y, f.deck)],
      'DEMOLISH on an ordinary device did not lower to Cmd.remove: ' + JSON.stringify(orders));
  } finally {
    Hud.renderFrame(wreck);
    rzEnter('hold');
  }
});

// THE COMPLEMENT, and it is what stops the two tests above being satisfied by "always send remove".
// A ground pile classifies `empty`, the switch hits `default: break`, and NOTHING is sent — which is
// correct, because there is no device on the tile and `RemoveDeviceCommand` would have nothing to
// act on. This is the leg the ground-item art created the need for.
// MUTATION: `!isResourceItem(_id)` → bare `_id` in room-model.js ⇒ RED.
test('DEMOLISH on a ground PILE sends nothing — the art did not make spoil removable', () => {
  const f = slotFocus('hold');
  const tile = { x: f.rx + 5, y: f.ry + 3 };
  const cells = wreck.cells.slice();
  cells[tile.y * wreck.w + tile.x] = [44, 6, 0, 0];   // ',' Regolith — a RESOURCE row with real art
  try {
    assert.ok(itemForGlyph(44), "precondition: ',' resolves to nothing, so this pins nothing");
    Hud.renderFrame({ ...wreck, cells });
    rzEnter('hold');
    rzArm('demolish');
    rzSent.length = 0;
    rzFire(rzCanvas, 'click', { button: 0, ...atTileIn(f, tile.x, tile.y) });
    const orders = sentOrders();
    rzArm('demolish');
    assert.deepEqual(orders, [],
      'DEMOLISH on a SPOIL PILE sent ' + JSON.stringify(orders) + '. `Cmd.remove` lowers to '
      + 'RemoveDeviceCommand and there is no device on that tile; the pile only resolves to art '
      + 'because the ground-item package gave resource rows glyphs.');
  } finally {
    Hud.renderFrame(wreck);
    rzEnter('hold');
  }
});

// A DOOR is the case the door package created and it belongs in this section rather than only in the
// classifier tests, because what a reviewer needs to know is what LEAVES THE CLIENT. A door now
// resolves to real art, so the only thing keeping it out of the `device` arm is `STRUCTURE_CODES` —
// and if that ever slips the player gets a `Cmd.remove` at a door, which `RemoveDeviceCommand`
// silently drops (`IsPlaceableFurniture`, `Commands.cs:566`, excludes `Door`).
//
// ⚠️ OPEN DEFECT, DELIBERATELY NOT ASSERTED HERE — "DOOR-NO-REMOVAL". This test used to end
// `assert.match(toast, /STRIP/)` with the message *"the player must be told which verb DOES take a
// door apart"*, which **named a verb that refuses doors**: `DeconstructSystem.cs:345` is
// `return device.Kind != DeviceKind.Door;`, and driving a live host, a closed door answers
// `"cannot strip door"`. So the shipped toast — `CANNOT DEMOLISH BUILT STRUCTURE … USE ⚒ STRIP [V]`
// (`roomzoom-view.js`, the `built-wall` arm) — MISDIRECTS on a door, and asserting it would have
// PINNED the misdirection into the gate.
//
// The toast is therefore left unasserted for doors. It is NOT left unrecorded:
//   • A BUILT DOOR HAS NO REMOVAL VERB AT ALL, on any surface. DEMOLISH refuses it, STRIP refuses
//     it, and build-cancel only revokes a *pending* order — after `BuildSystem.Complete` spawns the
//     device there is nothing to cancel. The DOOR tool is on this palette, so a player can build a
//     door and then never remove it. That is a gap in the SIM's verb set.
//   • The toast's copy cannot honestly be fixed without deciding what to put there, and the honest
//     text ("this door cannot be removed") advertises the gap above. That is an owner call.
// ⚠️ THE PRE-EXISTING `/STRIP/` ASSERTION ON A **WALL** (test 'WP-4: the built-wall dead end now
// points at STRIP') IS CORRECT AND MUST STAY — STRIP really does take a wall apart. The bug is the
// one message serving two tile kinds, only one of which the named verb accepts.
// MUTATION: delete 43 from STRUCTURE_CODE_LIST in room-model.js ⇒ RED.
test('DEMOLISH on a CLOSED DOOR sends NOTHING — art did not make it removable', () => {
  const f = slotFocus('hold');
  const tile = { x: f.rx + 5, y: f.ry + 3 };
  const cells = wreck.cells.slice();
  cells[tile.y * wreck.w + tile.x] = ['+'.charCodeAt(0), 8, 0, 0];
  try {
    assert.ok(itemForGlyph('+'.charCodeAt(0)),
      'precondition: the closed door resolves to no art, so this test is not guarding the new risk');
    Hud.renderFrame({ ...wreck, cells });
    rzEnter('hold');
    rzArm('demolish');
    rzSent.length = 0;
    rzFire(rzCanvas, 'click', { button: 0, ...atTileIn(f, tile.x, tile.y) });
    const orders = sentOrders();
    rzArm('demolish');
    assert.deepEqual(orders, [],
      'DEMOLISH on a DOOR sent ' + JSON.stringify(orders) + '. Giving the door glyphs art made '
      + '`itemForGlyph` truthy for them; STRUCTURE_CODES is the only thing that keeps them out of '
      + 'the device arm, and RemoveDeviceCommand would drop the command in silence anyway.');
  } finally {
    Hud.renderFrame(wreck);
    rzEnter('hold');
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// VR-P3 — THE CUTAWAY'S OWN CONTRACTS: the dash dialect on a queued order, the honest stat line,
// the airless idiom, and a fitting placed at TRUE SIZE through the projection.
//
// Every one of these is a property nothing else in the suite can see. The dialect legs assert the
// PAIR (accent + dash) rather than a hue, because ruling E3 is that colour alone distinguishes
// nothing; the stat-line leg asserts what the surface may NOT say, which is the half ruling E11
// exists for; and the fitting leg asserts a CENTIMETRE, because "true dimensions" is the whole
// argument for the metre mapping and a size fitted to a tile would satisfy every other test here.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const VRP3_FOCUS = { deck: 0, rx: 0, ry: 0, rw: 10, rh: 6, slotIndex: 5, displayName: 'GALLEY' };

// MUTATION: `roomStatLine` emitting the design's literal `SEATS 5 OF 3 ABOARD` ⇒ RED on the honesty
// leg. MUTATION: dropping the FITTINGS clause ⇒ RED on the derivation leg.
test('VR-P3: the stat line states only what the wire carries — no invented sentence (E11)', () => {
  const line = roomStatLine({ areaM2: 60, placed: 5, pending: 4, here: 2, aboard: 3 });
  assert.equal(line, '60.0 M² · 5 OF 9 FITTINGS BUILT · 2 OF 3 ABOARD, HERE');
  // ⛔ THE DESIGN'S OWN THIRD CLAUSE IS `SEATS 5 OF 3 ABOARD` AND IT IS NOT AVAILABLE. No channel
  // carries a seat count, and ruling E11 forbids a UI lane writing the sentence itself. This is the
  // assertion that keeps it out: a later lane reaching for the doc's words has to add the data first.
  assert.ok(!/SEAT/i.test(line),
    'the stat line claims a SEAT count. Nothing on the wire carries one — that clause is the design '
    + 'document\'s prose, and inventing it client-side is exactly what ruling E11 forbids.');
  // The FITTINGS clause is DERIVED, both halves: built, and built-plus-pending.
  assert.match(roomStatLine({ areaM2: 1, placed: 0, pending: 0, here: 0, aboard: 0 }),
    /0 OF 0 FITTINGS BUILT/, 'an empty room must still state the clause rather than hide it');
  assert.match(roomStatLine({ areaM2: 1, placed: 3, pending: 0, here: 1, aboard: 1 }),
    /3 OF 3 FITTINGS BUILT/, 'a fully-built room reads N OF N — the denominator is built + pending');
});

// MUTATION: drop the `vacuum` branch from `roomCutawaySvg` ⇒ RED. MUTATION: drop `NO AIR` from
// `roomStatLine` ⇒ RED on the second half. The two are asserted separately because a room can lose
// either one and still look plausible.
test('VR-P3: an AIRLESS compartment reads as airless — the drawing AND the words', () => {
  const scene = roomScene(VRP3_FOCUS);
  const air = roomCutawaySvg(scene, { vacuum: false });
  const vac = roomCutawaySvg(scene, { vacuum: true });
  assert.notEqual(vac, air, 'a vacuum draws the identical room — the compartment is indistinguishable '
    + 'from a pressurised one, which is the D4 defect one altitude down');
  assert.match(vac, /stroke-width="0.5"[^/]*stroke-dasharray="3 4"/,
    'the airless floor grid is not DASHED — the deck a player cannot stand on looks like one they can');
  assert.ok(/stroke-opacity="0.62"/.test(vac) && !/stroke-opacity/.test(air),
    'the airless room\'s walls are not held back — and a pressurised one must NOT be, or "airless" '
    + 'is what every room looks like');
  // …and the WORDS, because a treatment of the drawing alone is a cue a player has to learn.
  const words = roomStatLine({ areaM2: 60, placed: 1, pending: 0, here: 0, aboard: 3, vacuum: true });
  assert.match(words, /NO AIR/, 'the stat line does not SAY the compartment is airless');
  assert.ok(!/NO AIR/.test(roomStatLine({ areaM2: 60, placed: 1, pending: 0, here: 0, aboard: 3 })),
    'every room says NO AIR — the clause is unconditional and therefore says nothing');
});

// MUTATION: `roomBox` sized to the tile instead of to the piece ⇒ RED. MUTATION: drop the `dx/dy`
// origin offsets ⇒ RED on the anchor leg.
test('VR-P3: a fitting is placed at TRUE CENTIMETRES, not fitted to its tile', () => {
  const scene = roomScene(VRP3_FOCUS);
  const s = scene.s;
  const bench = roomBox('bench', s);      // 260 cm across
  const stool = roomBox('stool', s);      // ∅34 cm
  assert.ok(bench && stool, 'the room-placement derivation is gone from fittings.js');
  const fails = [];   // BLINDED (TRAPS 5th shape): `assert` throws, so a hard leg hides its siblings

  // ⚠️ THE DRAWN WIDTH IS RECOVERED FROM `roomBox`'S OWN OUTPUT, not recomputed beside it. The first
  // draft wrote `s * (wCm + 0.4·dCm)` from the SPEC — the right number, reading nothing the function
  // returned, so a `roomBox` that sized every piece to a tile passed. `dx = -side/2 + s·ex/2`, so
  // `s·ex = 2·dx + side`.
  const drawnW = (rb) => 2 * rb.dx + rb.side;
  const tilePx = s * 100;

  // 1 — THE METRE MAPPING. A 260 cm bench covers 2.6 tiles of a 1 m grid; a 34 cm stool a third of
  // one. That is what "furnished at true dimensions" means and it is the whole argument for
  // `M_PER_TILE`. (⚠️ THIS PAIR IS INVARIANT UNDER A BROKEN *SIZER* — see leg 2, which is not.)
  if (!(drawnW(bench) / tilePx > 2.5)) fails.push('the bench does not span two and a half tiles');
  if (!(drawnW(stool) / tilePx < 0.6)) fails.push('the stool fills more than half a tile');

  // 2 — THE SIZER ITSELF, and this leg exists because the one above SURVIVED the mutation it was
  // written for. `side` must be `TILE·s/k` where `k` fits the catalogue's `BOX` to the piece's
  // LARGER extent — so `side / max(drawnWidth, drawnHeight)` is the CONSTANT `TILE/BOX` for every
  // piece in the set. A sizer that hands every piece one tile makes that ratio a function of the
  // piece's own proportions, which is the defect exactly.
  // (⚠️ The first draft of this leg divided by the WIDTH alone and went red on correct code: for a
  // tall piece the box is fitted to its HEIGHT. Measured, not reasoned — both pieces here have no
  // `z0`, so `s·ey = −2·dy − side` recovers the vertical the same algebraic way `dx` recovers the
  // horizontal.)
  const drawnH = (rb) => -2 * rb.dy - rb.side;
  const ratio = (rb) => rb.side / Math.max(drawnW(rb), drawnH(rb));
  if (Math.abs(ratio(bench) - ratio(stool)) > 0.001) {
    fails.push(`the box ratio differs between pieces (${ratio(bench).toFixed(3)} vs `
      + `${ratio(stool).toFixed(3)}) — the sizer is normalising each piece to its own box instead of `
      + 'putting every piece on ONE centimetre rule, so the catalogue\'s dimensions stop meaning '
      + 'anything the moment two pieces stand side by side');
  }

  // 3 — THE ANCHOR: the piece is pinned by its own cm ORIGIN, so it stands where the tile is rather
  // than being centred on it.
  if (!(bench.dx < 0 && bench.dy < 0)) {
    fails.push('the placement offsets do not pull the box back onto its own origin — a fitting would '
      + 'sit half a box away from the tile it belongs to');
  }

  if (roomBox('not-a-fitting', s) !== undefined) {
    fails.push('a piece with no centimetre spec must answer UNDEFINED so the caller can fall back '
      + 'honestly, never a guessed footprint');
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});

// MUTATION: draw the door plate on the RIGHT wall ⇒ RED. MUTATION: drop the halo ⇒ RED.
test('VR-P3: door plates go on the walls the cutaway KEEPS; the cut side gets a label only', () => {
  const scene = roomScene(VRP3_FOCUS);
  const left = roomDoorsSvg(scene, VRP3_FOCUS, [{ tx: 0, ty: 2, side: 'left', label: '‹ 5 · CORRIDOR' }]);
  const right = roomDoorsSvg(scene, VRP3_FOCUS, [{ tx: 9, ty: 2, side: 'right', label: '7 · HOLD ›' }]);
  const back = roomDoorsSvg(scene, VRP3_FOCUS, [{ tx: 4, ty: 5, side: 'back', label: 'AFT BULKHEAD' }]);
  // TRANSLATED, NOT WEAKENED (VR-P3 review): the plate carries `class="rz-door-plate"` now, so this
  // counts THE PLATE rather than "any paper-filled ink-stroked path", which the old shape did — and
  // which would have counted a fitting's front face on a room that had one.
  const plates = (svg) => (svg.match(/<path class="rz-door-plate" d="M[^"]+" fill="#EBE4D1" stroke="#14120F"/g) || []).length;
  assert.equal(plates(left), 1, 'the left wall is DRAWN in the cutaway and its door must be too');
  assert.equal(plates(back), 1, 'the back wall is drawn and its door must be too');
  assert.equal(plates(right), 0,
    'a plate was drawn on the RIGHT wall — the wall the cutaway has cut away, which is what its two '
    + 'dashed edges say. A solid door hanging in that empty space contradicts them.');
  assert.match(right, />7 · HOLD ›</, 'the cut-side door is not SAID at all — it is a way out of the '
    + 'room and the player has to know it is there');
  for (const svg of [left, right, back]) {
    assert.match(svg, /paint-order="stroke"/,
      'a door label carries no halo, so it is unreadable the moment it crosses the wall hatch');
  }
  // …and the NEAR wall is cut away too, so it takes the same treatment as the right: said, not
  // plated. A door the drawing simply omits is a way out of the room the player is never told about.
  const front = roomDoorsSvg(scene, VRP3_FOCUS, [{ tx: 4, ty: 0, side: 'front', label: '3 · HALL' }]);
  assert.equal(plates(front), 0, 'a plate was drawn on the NEAR wall — the other one the cutaway cuts');
  assert.match(front, />3 · HALL</, 'the near-wall door is not said at all');
  assert.equal(roomDoorsSvg(scene, VRP3_FOCUS, []), '', 'a room with no doors draws no group at all');
});

// ⭐⭐ THE DASH DIALECT ON A QUEUED ORDER — driven through the SHIPPING controller, because the ghost
// builder is private and the property is about what reaches the layer.
//
// MUTATION: spell the queued ghost SOLID oxblood (the FAULT spelling) ⇒ RED. MUTATION: spell it with
// the ink `6 5` (the UNBUILT spelling) ⇒ RED. MUTATION: drop the leader ⇒ RED. MUTATION: drop the
// PARTS price ⇒ RED.
test('VR-P3 (driven): a queued order is OXBLOOD `8 5` with a leader and its PRICE', () => {
  const f = HOLD;   // the driven rig's own room, from the fixture's geometry
  Hud.renderDesigns({
    type: 'designs',
    // [x, y, deck, kind, delivered, required] — a queued WALL, a STARVED one, and a READY one.
    cells: [
      [f.rx + 1, f.ry + 1, f.deck, 0, 2, 3],
      [f.rx + 3, f.ry + 1, f.deck, 0, 0, 3],
      [f.rx + 5, f.ry + 1, f.deck, 0, 3, 3],
    ],
  });
  try {
    rzEnter('hold');
    const svg = rzLayers.innerHTML;
    const ghosts = svg.slice(svg.indexOf('class="rz-ghost"'));
    assert.ok(svg.includes('class="rz-ghosts"'), 'no ghost layer was drawn at all');
    // THE QUEUED ONE: the charter's queued-order spelling, and nothing else.
    assert.match(ghosts, /stroke="#7B2C22"[^>]*stroke-dasharray="8 5"/,
      'a queued build ghost is not oxblood `8 5` — that pair IS the charter\'s QUEUED ORDER, and it '
      + 'is what tells a player the difference between an order and a fault');
    // THE STARVED ONE: SOLID oxblood — the ATTENTION/FAULT spelling, because nothing has arrived.
    // Asserted as an absence of the dash on at least one oxblood ghost rather than by hunting a
    // colour, so a mutation that spells every state `8 5` reddens.
    const solid = (ghosts.match(/stroke="#7B2C22" stroke-width="1.5"(?![^>]*dasharray)/g) || []).length;
    assert.ok(solid >= 1, 'no ghost is drawn SOLID oxblood — a STARVED order (nothing delivered) is a '
      + 'FAULT, and spelling it like a healthy queued one hides the one the player has to act on');
    // THE READY ONE: ink `6 5` — UNBUILT/PLANNED. It is paid for; it is simply not built.
    assert.match(ghosts, /stroke="#14120F"[^>]*stroke-dasharray="6 5"/,
      'a fully-delivered ghost is not in the UNBUILT/PLANNED spelling — it still shouts for parts it '
      + 'already has');
    // THE LEADER AND THE PRICE — the design's own annotation idiom, carrying WIRE data.
    assert.match(ghosts, /stroke-width="0.8" opacity="0.65"/,
      'the ghost has no leader line — the label floats over the room with nothing tying it to a tile');
    assert.match(ghosts, /WALL · 3 PARTS|WALL · 2\/3 PARTS/,
      'the ghost does not NAME its price. `required` is on the `designs` channel; a ghost that will '
      + 'not say what it costs is the silence `palette-honesty` exists to end, one layer in.');
  } finally {
    Hud.renderDesigns({ type: 'designs', cells: [] });
    rzEnter('hold');
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// VR-P3 REVISION — THE ASSEMBLY SEAM (review MAJOR 1/2/3, MINOR 4/8/9)
//
// ⛔⛔ WHY THIS SECTION EXISTS, IN ONE SENTENCE: an independent review applied TWELVE mutations to
// the shipped assembly and every one of them was GREEN. The title and stat line not concatenated;
// the CUTAWAY ITSELF not concatenated; the door plates dropped; `roomDimensionsSvg` dropped (that
// function was imported by no test at all); `focusIsVacuum()` hard-`false`; `roomBox` → null, so
// every fitting in every room is fitted to one tile; the blocked and zone layers laid out FLAT with
// the shear dropped; the interior-wall hull filter removed, so thirty dark slabs stand back up
// inside the drawing; the floor grid unhooked from the build grid; the hatch namespace collided; the
// click pulse frozen at the plan view's 32 px. Each of those is a picture the player would see
// change, and the whole suite stayed green — because every VR-P3 leg above tests a BUILDER in
// isolation, and nothing tested that the builders are ASSEMBLED.
//
// THE SHAPE IS `WP-2: the Room Zoom actually CONCATENATES the mark layer into its SVG body`,
// generalised from one layer to the whole scene, and it is DRIVEN rather than scanned: the census
// reads the markup the SHIPPING controller mounted into `#rz-layers` for a real fixture room, so a
// call that is present in the source and produces nothing cannot satisfy it.
//
// PARITY BY IMPORT, NEVER BY LITERAL. Every geometric expectation below is compared against the
// SHIPPED derivation (`scenePlacement`, `roomBox`, `tileClientBox`, `buildTileItem`), which is the
// `paletteOrders` rule this file already runs the WP-4 section on: a copied number could not tell
// the mounted scene and the model apart, and the model is what the mutations move.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The room every leg below drives: the rig's own live wreck hold, 12 × 8 on deck 1. */
const VR = HOLD;
/** A door on the BACK wall — one of the two walls the cutaway KEEPS, so it earns a plate. */
const VR_BACK_DOOR = { x: VR.rx + 5, y: VR.ry + VR.rh - 1 };
/** …and a door INSIDE the room: a partition, which the cutaway never drew and which therefore keeps
 *  its own furniture sprite. The two together are the HOLE-vs-LIMIT pair for MINOR 4. */
const VR_IN_DOOR = { x: VR.rx + 3, y: VR.ry + 2 };
/** An INTERIOR partition wall — the one thing the material layer may still stand a slab on. */
const VR_WALL = { x: VR.rx + 2, y: VR.ry + 4 };
/** Two tiles in ONE COLUMN, one metre apart in DEPTH — the shear pair every floor layer is read on. */
const VR_NEAR = { x: VR.rx + 7, y: VR.ry + 2 };
const VR_FAR = { x: VR.rx + 7, y: VR.ry + 3 };
const VR_ZONE_A = { x: VR.rx + 9, y: VR.ry + 2 };
const VR_ZONE_B = { x: VR.rx + 9, y: VR.ry + 3 };
const VR_BLOCK_A = { x: VR.rx + 6, y: VR.ry + 5 };
const VR_BLOCK_B = { x: VR.rx + 6, y: VR.ry + 6 };
const VR_ITEM = { x: VR.rx + 4, y: VR.ry + 1 };
const VR_GHOST = { x: VR.rx + 10, y: VR.ry + 5 };
/** A 260 cm bench and a 34 cm stool, on the floor of the same room — the true-size pair. */
const VR_BENCH = { x: VR.rx + 1, y: VR.ry + 6 };
const VR_STOOL = { x: VR.rx + 8, y: VR.ry + 6 };
const VR_CID = 90210;
const VR_REASON_NO_ROUTE = 5;   // BLOCKED_REASON_NAMES index for `no_route`

/** The wreck frame with the two doors and the one interior partition planted in the hold. */
function vrFrame() {
  const cells = wreck.cells.slice();
  const put = (t, ch) => { cells[t.y * wreck.w + t.x] = [ch.charCodeAt(0), 0, 0, 0]; };
  put(VR_BACK_DOOR, '+');
  put(VR_IN_DOOR, '+');
  put(VR_WALL, '#');
  return { ...wreck, cells };
}

/** Put every channel this section drives back the way the rig left it. Called from a `finally`, so a
 *  failing leg cannot leak a doctored frame or an airless room into the next test. */
function vrRestore() {
  Hud.renderZones({ type: 'zones', cells: [] });
  Hud.renderBlocked({ type: 'blocked', cells: [] });
  Hud.renderItems(NO_ITEMS);
  Hud.renderDesigns({ type: 'designs', cells: [] });
  Hud.renderDecor({ type: 'decor', items: [] });
  Hud.renderRoster({ type: 'roster', crew: [] });
  Hud.renderRooms(FIX.rooms);
  Hud.renderFrame(wreck);
  Hud.renderMarks(WRECK_MARKS_MSG);
  rzEnter('hold');
}

/**
 * DRIVE THE WHOLE SCENE and hand back the markup the controller mounted.
 *
 * Every channel the cutaway consumes is dispatched through the SHIPPING `Hud.render*` entry points —
 * the same functions the socket calls — and the room is entered through `rzApi.enter`, so what comes
 * back is the assembled `#rz-layers` innerHTML and not a string this test built.
 */
function vrMount({ vacuum = false } = {}) {
  Hud.renderFrame(vrFrame());
  Hud.renderMarks({ type: 'marks', cells: [
    [VR_NEAR.x, VR_NEAR.y, DECK1, 1], [VR_FAR.x, VR_FAR.y, DECK1, 1],
  ] });
  Hud.renderZones({ type: 'zones', cells: [
    [VR_ZONE_A.x, VR_ZONE_A.y, DECK1, ACCEPT_ALL, 0],
    [VR_ZONE_B.x, VR_ZONE_B.y, DECK1, ACCEPT_ALL, ZONE_FLAG_BACKED_OFF],
  ] });
  Hud.renderBlocked({ type: 'blocked', cells: [
    [VR_BLOCK_A.x, VR_BLOCK_A.y, DECK1, 0, VR_REASON_NO_ROUTE],
    [VR_BLOCK_B.x, VR_BLOCK_B.y, DECK1, 0, VR_REASON_NO_ROUTE],
  ] });
  Hud.renderItems({ type: 'items', cells: [[VR_ITEM.x, VR_ITEM.y, DECK1, 0, 40]] });
  Hud.renderDesigns({ type: 'designs', cells: [[VR_GHOST.x, VR_GHOST.y, DECK1, 0, 2, 3]] });
  Hud.renderDecor({ type: 'decor', items: [
    [DECK1, VR_BENCH.x, VR_BENCH.y, 'bench', 0, 0],
    [DECK1, VR_STOOL.x, VR_STOOL.y, 'stool', 0, 0],
  ] });
  Hud.renderRoster({ type: 'roster', crew: [
    { cid: VR_CID, name: 'Ada Ozawa', role: 'engineer', deck: DECK1, x: VR.rx + 5, y: VR.ry + 3, task: '' },
  ] });
  Hud.renderRooms(vacuum
    ? { type: 'rooms', rooms: FIX.rooms.rooms.concat([['hold', DECK1, 0, 0, 0, 293, 96]]) }
    : FIX.rooms);
  rzEnter('hold');
  return rzLayers.innerHTML;
}

/** The scene + placement the controller itself derives for the hold — the parity source. */
const vrScene = () => roomScene(VR);
const vrPlace = () => scenePlacement(vrScene(), VR, vrScene().s * 100 * M_PER_TILE);
/** One tile's width on the cutaway, in scene px. */
const vrTilePx = () => vrScene().s * 100 * M_PER_TILE;

/** Parse `matrix(a b c d e f)` out of a transform attribute. */
const mat = (s) => s.slice(s.indexOf('matrix(') + 7, s.indexOf(')', s.indexOf('matrix('))).split(' ').map(Number);

/**
 * ⭐⭐ THE CENSUS — every piece of the cutaway, present in the ASSEMBLED markup, by a marker that
 * only that piece can produce.
 *
 * BLINDED (TRAPS, fifth shape): every row is collected and ONE assertion reports them all, because
 * `assert` throws and a dozen legs behind a dead first one look exactly like a dozen live ones.
 *
 * MUTATIONS, ALL TWELVE OF WHICH WERE GREEN BEFORE THIS TEST EXISTED: drop `body += roomTitleSvg(…)`
 * ⇒ RED; drop `body += roomCutawaySvg(…)` ⇒ RED; drop `roomDoorsSvg` ⇒ RED; drop
 * `roomDimensionsSvg(scene)` ⇒ RED; and one row each for the eight tile-addressed layers.
 */
test('VR-P3 (assembled): every piece of the cutaway is CONCATENATED into the mounted scene', () => {
  try {
    const svg = vrMount();
    // ⭐ THE FLOOR QUAD'S MARKER IS THE QUAD ITSELF, derived from the scene rather than named by a
    // class: `oblique.room` gives the drawing no class hooks, and "some path exists" would be
    // satisfied by any layer in the stack. This is the one row that is parity-by-import.
    const c = vrScene().frame.corners;
    const floorQuad = 'd="M' + c.frontLeft.join(' ') + ' L' + c.frontRight.join(' ')
      + ' L' + c.backRight.join(' ') + ' L' + c.backLeft.join(' ') + ' Z"';
    const rows = [
      ['the shared hatch def', (s) => s.includes('<pattern id="rz-fh"')],
      ['the in-SVG title + stat line', (s) => s.includes('<g class="rz-title">')],
      ['the room title in words', (s) => s.includes('>Compartment 7 · STORAGE<')],
      ['the stat line', (s) => s.includes('96.0 M²')],
      ['the cutaway floor quad', (s) => s.includes(floorQuad)],
      ['the door plates', (s) => s.includes('<path class="rz-door-plate"')],
      ['the door labels', (s) => s.includes('<g class="rz-doors">')],
      ['the dimension arrows', (s) => s.includes('<g class="rz-dims">')],
      ['the interior-wall material layer', (s) => s.includes('class="rz-walls"')],
      ['the zone layer', (s) => s.includes('class="rz-zones"')],
      ['the decor (fittings at true size)', (s) => s.includes('class="rz-decor"')],
      ['the furniture layer', (s) => s.includes('class="rz-furniture"')],
      ['the mark layer', (s) => s.includes('class="rz-marks"')],
      ['the ground-item layer', (s) => s.includes('class="rz-items"')],
      ['the blocked layer', (s) => s.includes('class="rz-blockeds"')],
      ['the blocked reason SENTENCE', (s) => s.includes('NO WAY TO WALK TO IT')],
      ['the pawn layer', (s) => s.includes('class="rz-pawns"')],
      ['the queued-order ghost layer', (s) => s.includes('class="rz-ghosts"')],
    ];
    const missing = rows.filter(([, hit]) => !hit(svg)).map(([name]) => name);
    assert.deepEqual(missing, [],
      'these pieces of the Level-2 cutaway never reached the mounted SVG:\n  ' + missing.join('\n  ')
      + '\nA builder that is perfect and never concatenated draws NOTHING on screen and satisfies '
      + 'every isolated leg above it — the exact hole `zone-overlay.js` was extracted to close, and '
      + 'the hole twelve VR-P3 mutations walked through.');
    // NON-VACUITY, an INCLUSION test: the census must be able to MISS. A marker no scene can produce
    // has to come back missing, or a regex that matched anything would report a full house.
    assert.ok(!/class="rz-there-is-no-such-layer"/.test(svg),
      'the census is matching markup that is not there — every row above is then vacuous');
  } finally { vrRestore(); }
});

/**
 * THE DRAWING ITSELF, geometrically: the floor quad in the mounted scene IS the quad `roomScene`
 * describes, and the floor grid IS the build grid.
 *
 * MUTATION: `body += roomCutawaySvg(scene, { vacuum })` deleted ⇒ RED (the quad is gone).
 * MUTATION: `gridCm: M_PER_TILE * 100` → 60 ⇒ RED (19 verticals instead of 11).
 * MUTATION: `depthDivs: scene.rh` → 5 ⇒ RED (4 depth bands instead of 7).
 */
test('VR-P3 (assembled): the floor quad is the SCENE\'s, and the floor grid IS the build grid', () => {
  try {
    const svg = vrMount();
    const scene = vrScene(), place = vrPlace();
    const c = scene.frame.corners;
    const quad = 'M' + c.frontLeft.join(' ') + ' L' + c.frontRight.join(' ')
      + ' L' + c.backRight.join(' ') + ' L' + c.backLeft.join(' ') + ' Z';
    assert.ok(svg.includes('d="' + quad + '"'),
      'the mounted scene does not contain the floor quad `roomScene` describes. Every layer below is '
      + 'painted on a floor that is not being drawn:\n  wanted ' + quad);

    // THE GRID. One line per METRE across and one band per TILE back — which is the claim
    // `roomCutawaySvg`'s header makes, and the reason it overrides `oblique.room`'s drawing defaults.
    const grid = /<g fill="none" stroke="#14120F" stroke-width="0\.5"[^>]*><path d="([^"]+)"/.exec(svg);
    assert.ok(grid, 'the cutaway drew no floor grid at all — the surface a player designates on');
    const segs = grid[1].split(' M').length;
    assert.equal(segs, (VR.rw - 1) + (VR.rh - 1),
      'the floor grid does not have one line per TILE. It is the BUILD grid, not a drawing '
      + 'convention: a 60 cm grid over a 1 m tile puts a line where no tile boundary is, and a '
      + 'player aiming a wall at it misses.');
    // …and the lines LAND on the tile boundaries, which counting alone cannot see.
    const first = /^M([-\d.]+) ([-\d.]+)/.exec(grid[1]);
    const want = place.front(VR.rx + 1, VR.ry);
    assert.ok(Math.abs(Number(first[1]) - want[0]) < 0.02 && Math.abs(Number(first[2]) - want[1]) < 0.02,
      `the first grid line is at ${first[1]},${first[2]} and the first tile boundary is at ${want}`);
  } finally { vrRestore(); }
});

/**
 * THE DOOR PLATES, AND MINOR 4's DE-DUPLICATION: a boundary door is drawn ONCE.
 *
 * MUTATION: `body += roomDoorsSvg(…)` deleted ⇒ RED on the plate leg.
 * MUTATION: drop the `plated` filter in `furnitureSvg` ⇒ RED on the de-duplication leg (the door
 * gets a plate AND a warm sprite in the same opening — live on `hall_d0_s1`).
 */
test('VR-P3 (assembled): a boundary door gets ONE plate and NO second sprite; an interior door keeps its own', () => {
  try {
    const svg = vrMount();
    const plates = (svg.match(/<path class="rz-door-plate"/g) || []).length;
    assert.equal(plates, 1, 'the hold has exactly one door on a wall the cutaway KEEPS (the back '
      + 'wall), so it must draw exactly one plate');
    // ⛔ AND NOT TWICE. `rz-f-<tx>-<ty>` is the id prefix `furnitureSvg` gives a piece on that tile,
    // so the two layers are locatable independently and the absence is about THIS door, not about
    // the furniture layer being missing (which the census above already refuses).
    assert.ok(!svg.includes('rz-f-' + VR_BACK_DOOR.x + '-' + VR_BACK_DOOR.y),
      'the boundary door is ALSO stood up as a furniture sprite. The cutaway has just drawn that '
      + 'door in the wall plane; a second, warm, upright door half a metre in front of it is the '
      + 'smear the owner sees on hall_d0_s1.');
    // THE INCLUSION HALF — without it, "no sprite" is satisfied by a furniture layer that draws
    // nothing at all, or by a filter that swallows every door in the room.
    assert.ok(svg.includes('rz-f-' + VR_IN_DOOR.x + '-' + VR_IN_DOOR.y),
      'an INTERIOR partition door lost its sprite too. The cutaway never drew that one — it is not '
      + 'in a wall the drawing renders — so filtering it deletes a door from the room.');
  } finally { vrRestore(); }
});

/**
 * THE DIMENSION ARROWS. `roomDimensionsSvg` was imported by NO test in the suite when VR-P3 landed:
 * deleting the call left the drawing silent about its own size and nothing anywhere noticed.
 *
 * MUTATION: `body += roomDimensionsSvg(scene)` deleted ⇒ RED.
 * MUTATION: any of the three labels derived from a constant instead of from the scene ⇒ RED.
 */
test('VR-P3 (assembled): the drawing STATES its own metres — all three dimension arrows', () => {
  try {
    const svg = vrMount();
    assert.match(svg, /<g class="rz-dims">/, 'the dimension arrows never reached the mounted scene');
    const dims = svg.slice(svg.indexOf('<g class="rz-dims">'));
    for (const [what, want] of [['width', VR.rw], ['depth', VR.rh], ['height', ROOM_HEIGHT_M]]) {
      assert.ok(dims.includes('>' + want.toFixed(1) + ' M<'),
        `the ${what} arrow does not read ${want.toFixed(1)} M. Every number on this drawing comes `
        + 'from `roomScene`, so a room that is ' + VR.rw + ' tiles across cannot say anything else.');
    }
  } finally { vrRestore(); }
});

/**
 * ⭐⭐ THE AIRLESS COMPARTMENT, DRIVEN THROUGH THE REAL `rooms` CHANNEL rather than by calling the
 * branch. `focusIsVacuum() { return false; }` was GREEN across the whole suite: `vacuum-visible.test.js`
 * proves the MODEL grades a vacuum, and nothing proved the treatment reached this surface's SVG.
 *
 * MUTATION: `focusIsVacuum` → `false` ⇒ RED. MUTATION: pass `{ vacuum: false }` to `roomCutawaySvg`
 * while keeping it in the stat line ⇒ RED on the drawing leg alone (they are asserted separately
 * because a room can lose either one and still look plausible).
 */
test('VR-P3 (assembled): a 0 kPa compartment reads AIRLESS in the mounted scene — drawing and words', () => {
  try {
    const air = vrMount({ vacuum: false });
    assert.ok(!/NO AIR/.test(air), 'the PRESSURISED control already says NO AIR — every room does, so '
      + 'the clause says nothing');
    assert.ok(!/stroke-dasharray="3 4"/.test(air), 'the pressurised control already draws the airless '
      + 'dashed grid');

    const vac = vrMount({ vacuum: true });
    assert.match(vac, /NO AIR/, 'a compartment the `rooms` channel reports at 0 kPa does not SAY it is '
      + 'airless. This is D4 one altitude up: the order that killed a pawn was accepted with nothing '
      + 'anywhere on this surface using the word AIR.');
    assert.match(vac, /stroke-dasharray="3 4"/,
      'the airless floor grid is not dashed in the MOUNTED scene — the treatment exists in the '
      + 'builder and never reaches the room');
    assert.match(vac, /stroke-opacity="0\.62"/, 'the airless walls are not held back in the mounted scene');
  } finally { vrRestore(); }
});

/**
 * ⭐⭐ MAJOR 4 — THE ONE ACCENT IS SPENT ON ONE CLAUSE. `roomTitleSvg` set `fill` on the whole
 * `<text>`, so an airless room printed its AREA and its CREW COUNT in oxblood as well as its `NO AIR`
 * — while both of the nearby comments claimed only the trailing clause took it.
 *
 * MUTATION: put `OB_ATTEND` back on the whole `<text>` ⇒ RED. MUTATION: drop the tspan's own fill
 * ⇒ RED (nothing is accented at all).
 */
test('VR-P3 (assembled): only the NO AIR clause takes the accent — the rest stays micro-ink', () => {
  try {
    const vac = vrMount({ vacuum: true });
    const stat = /<text [^>]*font-size="[\d.]+"[^>]*>((?:(?!<\/text>).)*NO AIR(?:(?!<\/text>).)*)<\/text>/.exec(vac);
    assert.ok(stat, 'the stat line carrying NO AIR is not one `<text>` in the mounted scene');
    const open = vac.slice(vac.lastIndexOf('<text', vac.indexOf(stat[1])), vac.indexOf(stat[1]));
    assert.ok(open.includes('fill="#6B6252"'),
      'the stat line\'s BASE ink is not the charter\'s micro-label grey. It said: ' + open);
    assert.ok(!open.includes('fill="#7B2C22"'),
      'the WHOLE stat line is tinted oxblood on an airless room. Charter §1 allows ONE accent and '
      + 'spends it on attention; a line that prints the floor area in the attention colour says the '
      + 'area is an emergency, and it is the exact defect this file\'s own comments denied.');
    assert.match(stat[1], /<tspan fill="#7B2C22">NO AIR<\/tspan>/,
      'the NO AIR clause is not the one carrying the accent');
    // …and the clauses either side of it are OUTSIDE the tspan, i.e. really do keep the base ink.
    assert.ok(/96\.0 M²/.test(stat[1].split('<tspan')[0]),
      'the area clause has been swept inside the accented run');
    // The PRESSURISED room spends no accent on this line at all.
    const air = vrMount({ vacuum: false });
    const title = air.slice(air.indexOf('<g class="rz-title">'), air.indexOf('</g>', air.indexOf('<g class="rz-title">')));
    assert.ok(!title.includes('#7B2C22'),
      'a pressurised compartment\'s title band spends the accent — on nothing at all');
  } finally { vrRestore(); }
});

/**
 * ⭐⭐ MAJOR 1 / N10 — A FITTING IS DRAWN AT ITS OWN CENTIMETRES IN THE ASSEMBLED SCENE.
 *
 * `const rb = roomBox(itemId, ROOM_SCALE)` → `null` makes every fitting in every room fall to the
 * one-tile fallback: a 260 cm bench and a 34 cm stool come out the SAME SIZE, which is the plan view
 * the cutaway replaced. It was GREEN — `roomBox` itself is pinned, and nothing pinned that the
 * SURFACE consumes it.
 *
 * PARITY BY IMPORT on the ratio, ABSOLUTE FLOOR on the scale (TRAPS, 7th shape: a ratio suite cannot
 * see a 2× scale error, so the ratio leg alone would pass on a room drawn at half size).
 */
test('VR-P3 (assembled): a 260 cm bench spans 2.6 tiles of floor and a 34 cm stool a third of one', () => {
  try {
    const svg = vrMount();
    const decor = svg.slice(svg.indexOf('<g class="rz-decor"'), svg.indexOf('<g class="rz-furniture"'));
    // `helpers.render` wraps each piece in `translate(w/2 h/2) scale(min(w,h)/TILE)`, so the box side
    // the surface asked for is recoverable from the mounted markup: `scale × TILE`. TILE is IMPORTED.
    const sides = [...decor.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]) * TILE);
    assert.equal(sides.length, 2, 'the two decor fittings did not both reach the scene — the legs '
      + 'below would be vacuous');
    const [bench, stool] = sides;
    const want = (id) => roomBox(id, ROOM_SCALE).side;

    // 1 — THE RATIO, against the SHIPPED sizer. A fallback draws both at one tile, i.e. ratio 1.
    assert.ok(Math.abs(bench / stool - want('bench') / want('stool')) < 0.01,
      `a bench and a stool are drawn at ${(bench / stool).toFixed(2)}× each other and their own `
      + `centimetre specs differ by ${(want('bench') / want('stool')).toFixed(2)}×. The room is a `
      + 'diagram of nothing if a 260 cm bench and a 34 cm stool are the same object.');
    // 2 — THE ABSOLUTE FLOOR. A 260 cm bench needs 2.6 m of floor and cannot be drawn in less; the
    // one-tile fallback gives it 1.15. This is the leg a ratio cannot supply.
    assert.ok(bench / vrTilePx() >= 2.6,
      `the bench's drawn box is ${(bench / vrTilePx()).toFixed(2)} tiles across. It is 260 cm of `
      + 'bench — 2.6 tiles at one tile per metre — so anything less is a piece scaled to its cell.');
    assert.ok(stool / vrTilePx() < 1,
      'the stool is drawn WIDER than its tile. It is 34 cm; a third of a tile is the whole point of '
      + 'putting the catalogue in centimetres.');
    // 3 — and the ANCHOR: each piece is pulled back onto its own cm origin, not centred on the tile.
    const place = vrPlace();
    const [bx, by] = place.front(VR_BENCH.x, VR_BENCH.y);
    const rb = roomBox('bench', ROOM_SCALE);
    assert.ok(decor.includes('translate(' + (bx + rb.dx).toFixed(2) + ' ' + (by + rb.dy).toFixed(2) + ')'),
      'the bench is not anchored on its own projected cm origin — it sits half a box away from the '
      + 'tile it belongs to');
  } finally { vrRestore(); }
});

/**
 * ⭐⭐ MAJOR 1 / N5 + N7 + MINOR 9 — EVERY FLOOR LAYER IS SHEARED INTO THE FLOOR PLANE.
 *
 * A designation, a zone and a refused-order outline are PAINT ON THE FLOOR. Laid out flat they are
 * axis-aligned rectangles floating over a cabinet-oblique room — the plan view showing through the
 * cutaway — and the marks land on tiles other than the ones they describe. All three mutations
 * (`place` dropped from the blocked layer, from the zone layer, and — the raw-text-only case the
 * review filed as MINOR 9 — from the mark layer) were GREEN.
 *
 * THE PROPERTY IS MEASURED, NOT NAMED: two tiles that differ ONLY in `ty` must be placed a DEPTH STEP
 * apart, and the depth step is the projection's own `(+0.4·s·100, −0.6·s·100)`. A flat layer places
 * them one tile straight DOWN, which fails both components.
 */
test('VR-P3 (assembled): the mark, zone and blocked layers are SHEARED into the floor plane', () => {
  try {
    const svg = vrMount();
    const scene = vrScene();
    const dx = 0.4 * scene.s * 100, dy = -0.6 * scene.s * 100;
    const fails = [];
    const pair = (label, matrices) => {
      if (matrices.length !== 2) { fails.push(`${label}: found ${matrices.length} placed cells, not 2 — this leg is vacuous`); return; }
      const [a, b] = matrices;
      // The LINEAR part must carry the oblique's depth vector: a flat layout has c = 0, d = 1.
      if (Math.abs(a[2] * vrTilePx() - dx) > 0.5 || Math.abs(a[3] * vrTilePx() - dy) > 0.5) {
        fails.push(`${label}: the cell's y axis is (${a[2]}, ${a[3]}) — not the oblique's depth vector, `
          + 'so the layer is laid out FLAT over a projected room');
      }
      // …and the two tiles are one DEPTH STEP apart, which is what "same column, one metre back" means.
      if (Math.abs((b[4] - a[4]) - dx) > 0.5 || Math.abs((b[5] - a[5]) - dy) > 0.5) {
        fails.push(`${label}: two tiles differing only in ty are placed (${(b[4] - a[4]).toFixed(1)}, `
          + `${(b[5] - a[5]).toFixed(1)}) apart; the projection's depth step is (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
      }
    };
    const marksLayer = svg.slice(svg.indexOf('<g class="rz-marks"'), svg.indexOf('<g class="rz-items"'));
    pair('the MARK layer', [...marksLayer.matchAll(/<g transform="(matrix\([^)]*\))"><g class="mk /g)].map((m) => mat(m[1])));
    const zoneLayer = svg.slice(svg.indexOf('<g class="rz-zones"'), svg.indexOf('<g class="rz-decor"'));
    pair('the ZONE layer', [...zoneLayer.matchAll(/<g class="rz-zone[^"]*" transform="(matrix\([^)]*\))"/g)].map((m) => mat(m[1])));
    const blockedLayer = svg.slice(svg.indexOf('<g class="rz-blockeds"'), svg.indexOf('<g class="rz-pawns"'));
    pair('the BLOCKED layer', [...blockedLayer.matchAll(/<g transform="(matrix\([^)]*\))"><g class="rz-blocked /g)].map((m) => mat(m[1])));
    assert.deepEqual(fails, [], fails.join('\n'));
  } finally { vrRestore(); }
});

/**
 * ⭐ MAJOR 2 — THE REFUSED ORDER'S SENTENCE REACHES THE SCENE, threaded from the wire.
 *
 * `blockedLayerSvg` passing `say = ''` to `blockedBadgeSvg` was GREEN: the badge still draws, the
 * scrim still draws, the outline still draws, and the WORDS — which are the whole of D5, the thing
 * the channel was built to say — silently vanish. The leg drives a real `blocked` row with a real
 * reason code and asserts the SENTENCE the wire's own table produces, imported rather than typed.
 */
test('VR-P3 (assembled): a blocked tile carries its reason SENTENCE, from the wire\'s own table', () => {
  try {
    const svg = vrMount();
    const want = blockedReasonSentence('no_route');
    assert.ok(want, 'the wire no longer has a sentence for `no_route` — this leg is vacuous');
    assert.match(svg, /class="rz-blocked-say"/,
      'the blocked layer drew no reason text at all. The badge and the outline say "stuck"; the '
      + 'SENTENCE is what says what to do about it, and it is the entire product of the D5 package.');
    assert.ok(svg.includes('>' + want + '<'),
      `the blocked badge does not carry ${JSON.stringify(want)} — the sentence the wire produced for `
      + 'this row. A layer that renders the badge with an empty label reproduces the silence exactly.');
    // ONE sentence for two tiles sharing a reason (the layer's own de-duplication rule), and it must
    // still be ONE and not ZERO — the count is what separates "de-duplicated" from "dropped".
    assert.equal((svg.match(/class="rz-blocked-say"/g) || []).length, 1,
      'two tiles stuck for the same reason must produce ONE leader sentence, not none and not two');
    assert.equal((svg.match(/class="rz-blocked-ring"/g) || []).length, 2,
      'every stuck tile keeps its own outline — the de-duplication is of the WORDS, not of the marks');
  } finally { vrRestore(); }
});

/**
 * ⭐⭐ MAJOR 1 / N11 — THE HULL FILTER: a boundary `#` is the compartment's own wall and the cutaway
 * has already drawn it.
 *
 * Dropping the filter stands THIRTY-FIVE 2.4 m slabs back up in a stepped ring around this room —
 * the first live render of the cryo bay, where the room was unreadable behind them — and on the near
 * and right edges it puts a solid wall exactly where the drawing has cut the room open. GREEN before
 * this leg: nothing counted the slabs.
 *
 * HOLE-vs-LIMIT: the room's 35 boundary walls draw NOTHING, and the one INTERIOR partition draws
 * exactly one slab. Either half alone is satisfiable by a layer that draws nothing ever.
 */
test('VR-P3 (assembled): boundary walls draw no slab; an INTERIOR partition draws exactly one', () => {
  try {
    const svg = vrMount();
    // NON-VACUITY, from the shipped model: the room really is ringed with wall glyphs, so "no slab"
    // is a decision this layer made rather than an absence of input.
    const tiles = roomMaterialTiles(vrFrame(), VR, null).filter((t) => t.kind === 'wall');
    const x1 = VR.rx + VR.rw - 1, y1 = VR.ry + VR.rh - 1;
    const onHull = tiles.filter((t) => t.tx === VR.rx || t.tx === x1 || t.ty === VR.ry || t.ty === y1);
    assert.ok(onHull.length >= 30,
      `the fixture room is no longer ringed with wall glyphs (${onHull.length}) — this leg cannot see `
      + 'the thirty-slab regression it exists for');
    assert.equal(tiles.length - onHull.length, 1, 'the planted interior partition is missing');

    assert.equal((svg.match(/<g class="rz-wall">/g) || []).length, 1,
      'the material layer stood a slab on every tile of the room\'s own hull. The cutaway has ALREADY '
      + 'drawn those walls — as the back wall and the hatched left wall — so this is a second, '
      + 'contradictory wall inside the first, and on the cut edges it is a solid slab standing where '
      + 'the drawing says the room is open.');
  } finally { vrRestore(); }
});

/**
 * ⭐ MAJOR 1 / N15 — ONE ID NAMESPACE FOR THE WHOLE SURFACE.
 *
 * `RZ_ID` may be anything at all today and no test notices; the Room Zoom is a body-level sibling of
 * the Overview, so both scenes live in ONE document and an id that is not namespaced to this surface
 * is a collision waiting for the next `<defs>`. The pin is the invariant rather than the literal:
 * EVERY id the assembled scene emits begins with this surface's own `rz-` prefix.
 *
 * MUTATION: `RZ_ID = 'rz'` → `'fh'` ⇒ RED (`id="fh-fh"`). MUTATION: take the kit default ⇒ RED
 * (`id="ob-fh"`, which is the id `overview-scene.js`'s own boxes reference).
 */
test('VR-P3 (assembled): every id the scene emits is in the ROOM ZOOM\'s own namespace', () => {
  try {
    const svg = vrMount();
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(ids.length >= 3, `only ${ids.length} ids in the whole scene — this census is vacuous`);
    const stray = [...new Set(ids.filter((id) => !id.startsWith('rz-')))];
    assert.deepEqual(stray, [],
      'these ids are not in the Room Zoom\'s `rz-` namespace: ' + stray.join(', ')
      + '\nThe Overview and the Room Zoom are body-level siblings in ONE document, so an id outside '
      + 'this surface\'s prefix is a collision with whatever the other surface defines — and a '
      + 'colliding <defs> resolves silently to the wrong paint, never to an error.');
    // …and the hatch really is the surface's, not the kit's default (the id every early P2 fitting
    // would have taken by accident).
    assert.ok(svg.includes('id="' + fhId(RZ_ID) + '"'), 'the surface hatch def is missing');
    assert.notEqual(fhId(RZ_ID), fhId(),
      'the Room Zoom emits the KIT DEFAULT hatch id. Every surface that takes the default writes the '
      + 'same id into the same document.');
    // ONE def, emitted once per surface root — the rule `roomHatchDef`'s own comment states.
    assert.equal((svg.match(new RegExp('<pattern id="' + fhId(RZ_ID) + '"', 'g')) || []).length, 1,
      'the shared hatch def is emitted more than once in one document');
    // NO DANGLING REFERENCE: every `url(#…)` this scene paints with resolves to a def IN this scene.
    const refs = [...new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))];
    const dangling = refs.filter((r) => !ids.includes(r));
    assert.deepEqual(dangling, [], 'these paints reference ids nothing in the scene defines: '
      + dangling.join(', ') + ' — an unresolved pattern renders as NOTHING, silently');
  } finally { vrRestore(); }
});

/**
 * ⭐ MAJOR 3(a) — THE COUNT BADGE SCALES WITH THE TILE, and this leg exists because a mutation
 * SURVIVED. `const k = unit / U` → `1` in `chipSvg` draws the badge and its digits at the plan view's
 * 32-unit size inside a ~95 px cutaway tile: a third of the size it should be, unreadable, and the
 * defect the code's own comment says it fixes. Green across 1412 tests.
 *
 * Ratio through the SHIPPED builder at two units, plus an absolute floor read out of the ASSEMBLED
 * scene (TRAPS, 7th shape).
 */
test('VR-P3: the ground-stack count badge scales with the tile — measured, because `k = 1` survived', () => {
  const rows = [{ tx: VR_ITEM.x, ty: VR_ITEM.y, stacks: [{ kind: 0, count: 40 }] }];
  const heightOf = (svg) => Number(/<rect class="rz-chip"[^>]*height="([\d.]+)"/.exec(svg)[1]);
  const small = heightOf(itemStackSvg(rows, VR, U));
  const big = heightOf(itemStackSvg(rows, VR, U * 3));
  assert.ok(Math.abs(big / small - 3) < 0.01,
    `the badge is ${(big / small).toFixed(2)}× taller in a 3× tile. A badge whose height is fixed at `
    + 'the plan view\'s 32-unit cell renders a third of the size it should on the cutaway and the '
    + 'count is unreadable — measured on the first render, and re-measured here because a mutation '
    + 'back to `k = 1` was green.');
  try {
    const svg = vrMount();
    const mounted = heightOf(svg.slice(svg.indexOf('<g class="rz-items"')));
    assert.ok(mounted >= small * 2,
      `the badge in the MOUNTED scene is ${mounted.toFixed(1)} px against ${small.toFixed(1)} px at `
      + 'the plan unit — the surface is drawing its counts at the old grid\'s size');
  } finally { vrRestore(); }
});

/**
 * ⭐ INTEGRATOR (P3 re-review residual) — THE GROUND-ITEM LAYER STANDS AT ITS TILE, and this leg
 * exists because a mutation SURVIVED the whole revision: `itemStackSvg(_itemTiles, _focus, unit,
 * place)` → `…, null)` was green across 1432 tests while the 40-Regolith pile moved from its tile's
 * floor centre to ~3 tiles away (measured: scene (1027, 339.5) → (791.8, 541.8)). `scenePlacement`
 * documents three idioms; `cell` and `foot`/`front` are pinned, `stand` was not, and `itemStackSvg`
 * is its only consumer.
 *
 * The pin is PARITY WITH THE SHIPPED PLACEMENT, not a remembered coordinate: the mounted `.rz-item`
 * group's transform must be byte-equal to `place.stand(tx, ty)` for the fixture's item tile, so the
 * leg catches both the dropped `place` argument and a drifted `stand` derivation.
 */
test('VR-P3 (assembled): a ground-item pile STANDS at its own tile through the shipped placement', () => {
  try {
    const svg = vrMount();
    const items = svg.slice(svg.indexOf('<g class="rz-items"'));
    // ⚠️ THE READER SKIPS WHATEVER ATTRIBUTES SIT BETWEEN THE CLASS AND THE TRANSFORM, and it has to:
    // VR-P3-a added `data-tile` + `pointer-events` to this same tag (a pile stands up off its floor
    // point too, so a press on it used to resolve one tile back). Anchoring on the literal
    // `class="rz-item" transform=` made this leg red for a reason that has nothing to do with the
    // placement it is about — a FALSE RED in TRAPS-3's family.
    const m = /<g class="rz-item"[^>]*\stransform="([^"]+)"/.exec(items);
    assert.ok(m, 'the mounted item layer carries no transform at all — `place` is not being '
      + 'threaded, so every pile draws at the layer origin instead of its tile');
    assert.equal(m[1], vrPlace().stand(VR_ITEM.x, VR_ITEM.y),
      'the pile\'s transform is not the shipped `place.stand` for its tile — the pile is drawn '
      + 'tiles away from the floor cell its stacks are on, over other tiles\' contents');
  } finally { vrRestore(); }
});

/**
 * ⭐ MAJOR 3(b) — A CREW MEMBER IS A PERSON-SIZED FIGURE, and this leg exists because a mutation
 * SURVIVED. `PAWN_M 1.66 → 1.0` drew every soul at 60 % of their height — a room of children,
 * standing in a compartment whose every other dimension is stated in metres on the drawing itself —
 * and the whole suite stayed green.
 *
 * The pin is a BAND ON METRES read back out of the assembled scene, so it needs no copy of the
 * constant and catches the derivation as well as the value.
 */
test('VR-P3 (assembled): a crew member is drawn between 1.5 m and 1.9 m tall', () => {
  try {
    const svg = vrMount();
    const pawns = svg.slice(svg.indexOf('<g class="rz-pawns"'));
    const m = /<g class="rz-pawn" transform="translate\([-\d.]+ [-\d.]+\) scale\(([\d.]+)\)">/.exec(pawns);
    assert.ok(m, 'no pawn was drawn in the mounted scene — this leg is vacuous');
    // The sprite's own viewBox is 24 units tall (`render/pawn-svg.js`'s feet contract), so the drawn
    // height in scene px is `scale × 24`, and the surface's rule is `ROOM_SCALE` px per centimetre.
    const metres = (Number(m[1]) * 24) / (100 * ROOM_SCALE);
    assert.ok(metres > 1.5 && metres < 1.9,
      `a crew member is drawn ${metres.toFixed(2)} m tall. The room states its own width, depth and `
      + '2.4 m ceiling in metres on three arrows; a person drawn at 1.0 m in it is a child, and it '
      + 'is the ONE size on this surface a player can check against their own intuition.');
    // …and they are taller than a tile is wide, which is the same fact a player reads at a glance.
    assert.ok(Number(m[1]) * 24 > vrTilePx(),
      'a person is drawn shorter than one metre of floor is wide');
  } finally { vrRestore(); }
});

/**
 * ⭐ MAJOR 1 / N16 — THE CLICK PULSE BRACKETS THE PROJECTED TILE.
 *
 * The transient lives OUTSIDE the SVG (it must survive `innerHTML =` being replaced under it), so it
 * is the one place a plan-view box could be left behind: a fixed 32-px square flashes at the top-left
 * of a ~133 px projected parallelogram, i.e. beside the tile the command went to. GREEN before this.
 *
 * Parity by import against `tileClientBox`, which the click math and the pulse share.
 */
test('VR-P3 (driven): the click pulse is the PROJECTED tile\'s box, not a 32-px plan square', () => {
  const tile = { x: VR.rx + 4, y: VR.ry + 4 };
  const pulseLayer = rzDoc.getElementById('rz-pulse');
  try {
    rzEnter('hold');
    pulseLayer.childNodes = [];
    rzArm('dig');
    rzSweep(tile, tile);
    const d = pulseLayer.childNodes[pulseLayer.childNodes.length - 1];
    assert.ok(d && String(d.className).includes('rz-pulse-tile'),
      'a DIG that landed produced no pulse at all — the one transient that tells the player the '
      + 'click was received');
    const want = tileClientBox(tile.x, tile.y, rzLayers._rect, VR);
    const got = { left: parseFloat(d.style.left), top: parseFloat(d.style.top), width: parseFloat(d.style.width), height: parseFloat(d.style.height) };
    for (const k of ['left', 'top', 'width', 'height']) {
      assert.ok(Math.abs(got[k] - want[k]) < 0.15,
        `the pulse's ${k} is ${got[k]} and the tile's projected box is ${want[k].toFixed(1)}. The `
        + 'flash and the command must land on the same tile, or the player is told their click went '
        + 'somewhere it did not.');
    }
    // ABSOLUTE, so a 32-unit plan box cannot pass by being "close enough" on a small room.
    assert.ok(got.width > vrTilePx(),
      `the pulse is ${got.width} px wide against a ${vrTilePx()} px tile — a projected tile's `
      + 'bounding box is WIDER than the tile itself, because it brackets a parallelogram');
  } finally {
    rzArm('dig');
    pulseLayer.childNodes = [];
    vrRestore();
  }
});

/**
 * ⭐ MINOR 2 — A DOOR LABEL STAYS INSIDE THE PICTURE.
 *
 * `SCENE_PAD.left` is 58 px and a left-hand door's label is anchored at its END, so it runs LEFT: a
 * `‹ 12 · ENGINEERING` on the front row of the wreck's 12 × 8 hold was set at x ≈ −60 and the player
 * read the tail of a sentence with no beginning. Worst case is a 1 × 1 compartment, which loses the
 * `‹ N ·` prefix that says WHICH compartment the door opens onto.
 *
 * MUTATION: drop the `clampLabelX` call ⇒ RED on both legs.
 */
test('VR-P3: no door label is clipped out of the scene — including the 1×1 worst case', () => {
  const long = '‹ 12 · ENGINEERING SPACES';
  const fails = [];
  for (const focus of [{ deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 }, { deck: 0, rx: 0, ry: 0, rw: 12, rh: 8 }]) {
    const scene = roomScene(focus);
    const doors = [
      { tx: 0, ty: 0, side: 'left', label: long },
      { tx: focus.rw - 1, ty: focus.rh - 1, side: 'right', label: '7 · HOLD AND WORKSHOP ›' },
      { tx: 0, ty: 0, side: 'front', label: '3 · THE LONG HALL FORWARD' },
      { tx: 0, ty: focus.rh - 1, side: 'back', label: '9 · AFT BULKHEAD PASSAGE' },
    ];
    const svg = roomDoorsSvg(scene, focus, doors);
    for (const m of svg.matchAll(/<text x="([-\d.]+)" y="[-\d.]+" text-anchor="([a-z]+)"[^>]*>([^<]+)</g)) {
      const x = Number(m[1]), anchor = m[2], text = m[3];
      const w = monoTextWidth(text, 8.5, 1.3);
      const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
      if (left < 0) {
        fails.push(`${focus.rw}×${focus.rh}: "${text}" starts at x=${left.toFixed(1)}, outside the `
          + 'viewBox — the player reads the tail of a label with no beginning');
      }
      if (left + w > scene.viewBox.w) {
        fails.push(`${focus.rw}×${focus.rh}: "${text}" ends at x=${(left + w).toFixed(1)} past the `
          + `viewBox's ${scene.viewBox.w}`);
      }
    }
  }
  assert.deepEqual(fails, [], fails.join('\n'));
  // NON-VACUITY, an INCLUSION test: the parse really finds the labels, and the worst case really is
  // one the UNCLAMPED geometry would have failed.
  const scene1 = roomScene({ deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 });
  const svg1 = roomDoorsSvg(scene1, { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 },
    [{ tx: 0, ty: 0, side: 'left', label: long }]);
  assert.ok(svg1.includes('>' + long + '<'), 'the label is not in the markup — the sweep found nothing');
  assert.ok(monoTextWidth(long, 8.5, 1.3) > SCENE_PAD.left,
    'the worst-case label now fits inside the left pad on its own, so this test proves nothing about '
    + 'clipping. Lengthen it.');
});

/**
 * ⭐ MINOR 3 — THE STAT LINE FITS THE SCENE IT IS WRITTEN IN.
 *
 * At the design's fixed 9 px the line is ~366 px of type and a 1 × 1 compartment's whole viewBox is
 * 295 px, so the sentence ran off the right edge: the player read `… 1 OF 3 A`. It is FITTED rather
 * than truncated because every clause is a fact about the room and the last one is the airless
 * warning.
 *
 * MUTATION: drop the `k` scale (fix the size at 9) ⇒ RED on the narrow room. MUTATION: scale it
 * UNCONDITIONALLY (drop the `full > avail` guard) ⇒ RED on the wide room, where the type would grow.
 */
test('VR-P3: the stat line is scaled to fit its own scene, and never grown past the design\'s 9 px', () => {
  const read = (focus) => {
    const scene = roomScene(focus);
    const svg = roomTitleSvg(scene, { slotIndex: 0, roomName: 'STORAGE', areaM2: focus.rw * focus.rh, placed: 1, pending: 2, here: 1, aboard: 3, vacuum: true });
    const t = /<text x="9"[^>]*font-size="([\d.]+)"[^>]*letter-spacing="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/.exec(svg);
    assert.ok(t, 'the stat line is not in the title group at all');
    return { size: Number(t[1]), track: Number(t[2]), text: t[3].replace(/<[^>]+>/g, ''), vb: scene.viewBox.w };
  };
  const fails = [];
  for (const focus of [{ deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 }, { deck: 0, rx: 0, ry: 0, rw: 12, rh: 8 }, { deck: 0, rx: 0, ry: 0, rw: 3, rh: 3 }]) {
    const r = read(focus);
    if (r.size > 9) fails.push(`${focus.rw}×${focus.rh}: the stat line is set at ${r.size} px, past the design's 9`);
    if (9 + monoTextWidth(r.text, r.size, r.track) > r.vb) {
      fails.push(`${focus.rw}×${focus.rh}: the stat line runs to `
        + `${(9 + monoTextWidth(r.text, r.size, r.track)).toFixed(1)} px in a ${r.vb} px scene — the `
        + 'player reads a sentence with its end cut off');
    }
    if (!/NO AIR$/.test(r.text)) fails.push(`${focus.rw}×${focus.rh}: the airless clause was truncated away`);
  }
  assert.deepEqual(fails, [], fails.join('\n'));
  // The WIDE room is the control: it has room for the design's own size, so it must keep it.
  assert.equal(read({ deck: 0, rx: 0, ry: 0, rw: 12, rh: 8 }).size, 9,
    'a room with room to spare is shrinking its stat line anyway — the fit is unconditional');
  // …and the NARROW room really is the case that needs the fit, or the leg above is vacuous.
  assert.ok(read({ deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 }).size < 9,
    'a 1×1 compartment fits the full stat line at 9 px on its own — this test proves nothing');
});
