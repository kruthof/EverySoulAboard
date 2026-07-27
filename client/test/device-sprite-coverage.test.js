// THE GUARD: every DeviceKind the sim can project resolves to a real item with a real builder.
//
// WHY IT EXISTS (HANDOVER §4l). Garvin, from a screenshot of the running game: dashed boxes with raw
// ASCII letters where furniture should be — `roomzoom-view.js`'s VS-Z-25 "unknown glyph" chip, a
// development stopgap, shipping to the player. Three `DeviceKind`s had no art on the standard
// surface: `GrowBed` (`"`), `Terminal` (`T`), `Telescope` (`x`) — hydroponics, i.e. the food loop,
// and the door into the entire MOSS CRT. **No test could see it**: the client was emitting *correct*
// text, honestly reporting that it had no art. Nothing threw, nothing was red; it read as wrong only
// when a person looked at the screen.
//
// So the fix is not three sprites, it is this file. It enumerates `Glyphs.ForDevice` MECHANICALLY
// out of the C# source, and for every kind it drives the real builders and the real composers. The
// next `DeviceKind` added without art fails here instead of shipping a placeholder.
//
// ⚠️ IT IS DRIVEN, NOT SCANNED, wherever it can be. `assert(TABLE has key)` is the weak form of this
// guard — it passes for an entry pointing at a builder that does not exist. Every coverage assertion
// below ends in a real `buildItem()` call whose output is compared BYTE-FOR-BYTE against the
// placeholder that `buildItem` returns for an unknown id, so a bad entry fails exactly as loudly as
// a missing one. The C# parse is the one thing that must be a scan (the sim is not importable from
// node), and it is comment-stripped with the SHARED `codeOnly` and carries its own negative controls
// at the bottom of this file — CLAUDE.md trap 1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { codeOnly } from './code-only.js';
import { ITEMS, buildItem } from '../src/items/index.js';
import { GLYPH_SUBSTITUTE, GLYPH_TO_ITEM, itemIdForGlyphChar } from '../src/items/glyph-map.js';
import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { itemForGlyph, roomCells, roomTileRect } from '../src/ui/room-model.js';
import { overviewScene } from '../src/ui/overview-scene.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SIM SIDE, parsed. `sim/Sim.Glyph/Glyphs.cs` is THE authority on which letter stands for
//    which device — its own header says so — and `sim/Sim.Core/Entities/Device.cs` is the authority
//    on which kinds exist. Both are parsed rather than transcribed: a transcription is a fourth hand
//    mirror, which is the defect this package removes.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Brace-matched body of the first `needle … {` block in `src` (comments already stripped). */
function blockAfter(src, needle) {
  const i = src.indexOf(needle);
  if (i < 0) return '';
  const from = src.indexOf('{', i);
  if (from < 0) return '';
  let depth = 0;
  for (let j = from; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(from + 1, j); }
  }
  return '';
}

/** `enum DeviceKind : byte { Door = 0, … }` → ['Door', 'AirVent', …] in declaration order. */
export function parseDeviceKinds(csSrc) {
  const body = blockAfter(codeOnly(csSrc), 'enum DeviceKind');
  const out = [];
  const re = /(\w+)\s*=\s*(\d+)\s*,/g;
  for (let m = re.exec(body); m; m = re.exec(body)) out.push(m[1]);
  return out;
}

/** `public const char Foo = 'x';` → { Foo: 'x' }. */
function parseCharConsts(code) {
  const out = Object.create(null);
  const re = /const\s+char\s+(\w+)\s*=\s*'((?:\\.|[^'])+)'\s*;/g;
  for (let m = re.exec(code); m; m = re.exec(code)) out[m[1]] = m[2];
  return out;
}

/**
 * `Glyphs.ForDevice` → { DeviceKindName: glyphChar }. Arms are either a char literal
 * (`DeviceKind.AirVent => '^',`) or a named `const char` (`DeviceKind.Door => DoorClosed,`), and the
 * named form is RESOLVED — three of the twenty-six arms use it, so a parser that skipped it would
 * silently under-report Door, Conduit and Pipe: the exact three kinds the allowlist below excuses.
 */
export function parseForDevice(csSrc) {
  const code = codeOnly(csSrc);
  const consts = parseCharConsts(code);
  const body = blockAfter(code, 'ForDevice(DeviceKind kind) => kind switch');
  const out = Object.create(null);
  const re = /DeviceKind\.(\w+)\s*=>\s*(?:'((?:\\.|[^'])+)'|(\w+))\s*,/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const lit = m[2];
    const named = m[3];
    if (lit !== undefined) out[m[1]] = lit;
    else if (named !== undefined && consts[named] !== undefined) out[m[1]] = consts[named];
    else out[m[1]] = null; // an arm we could not resolve — reported, never silently dropped
  }
  return out;
}

const DEVICE_CS = read('sim/Sim.Core/Entities/Device.cs');
const GLYPHS_CS = read('sim/Sim.Glyph/Glyphs.cs');
const DEVICE_KINDS = parseDeviceKinds(DEVICE_CS);
const FOR_DEVICE = parseForDevice(GLYPHS_CS);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE ALLOWLIST — kinds with NO furniture sprite, and why. IT ONLY EVER SHRINKS.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * `DeviceKind`s the SVG surfaces are allowed not to skin as furniture, each with the layer that
 * draws it instead. Three entries, all structural: they are not objects standing in a room, they are
 * parts of the room. Nothing here is "we have not got round to it".
 *
 * ⚠️ ADDING A NAME IS A DECISION, NOT A CHORE — it says "this device is drawn by another layer", and
 * it belongs in a commit message. If the honest reason is "no art yet", the fix is the art (or a
 * named stand-in in `GLYPH_SUBSTITUTE`), because an unlisted kind is what the player sees as a
 * dashed box with a letter in it. The size is pinned by equality below so the list cannot grow
 * quietly; removing an entry means that kind grew a real piece.
 */
const NO_FURNITURE_SPRITE = Object.freeze({
  // Doors ride glyphs '+' / '/' / 'X' and are drawn by the Room Zoom's STRUCTURE layer and the
  // Overview's wall layer, from the frame's own wall/door codes. `ITEMS` does carry door pieces
  // (`blast-door`, `sliding-door`, `airlock`) and they stay at `glyph: null` on purpose: routing a
  // door through the furniture layer would draw it TWICE, once per layer.
  Door: 'drawn by the structure/wall layer, not the furniture layer',
  // Conduit and Pipe share the glyph '~' — an intentional, documented collision in Glyphs.cs (they
  // are the same service-tray line). They are UTILITY-LENS OVERLAYS, drawn only under a lens, never
  // as an object on a tile; `power-conduit` / `pipe-run` therefore stay at `glyph: null` too. A
  // single glyph could not disambiguate them even if the furniture layer wanted to.
  Conduit: 'utility-lens overlay line, shares glyph ~ with Pipe',
  Pipe: 'utility-lens overlay line, shares glyph ~ with Conduit',
});

const COVERED = DEVICE_KINDS.filter((k) => !(k in NO_FURNITURE_SPRITE));

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. NON-VACUITY. Every assertion below is over a parsed set; a parser that silently returned
//    nothing would make the whole file pass while proving nothing. This runs first and by name.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the C# parse is non-vacuous and resolves the named-const arms', () => {
  assert.ok(DEVICE_KINDS.length >= 26,
    `parsed only ${DEVICE_KINDS.length} DeviceKinds from Device.cs — the parser is broken, not the sim`);
  assert.ok(DEVICE_KINDS.includes('GrowBed') && DEVICE_KINDS.includes('Terminal')
    && DEVICE_KINDS.includes('Telescope'), 'the three §4l kinds are missing from the parse');

  const arms = Object.keys(FOR_DEVICE);
  assert.ok(arms.length >= 26, `parsed only ${arms.length} ForDevice arms — the parser is broken`);

  // The three NAMED-const arms, resolved through `const char` declarations elsewhere in the file. A
  // parser that dropped them would leave Door/Conduit/Pipe unresolved and the allowlist would then
  // be excusing kinds that were never even measured.
  assert.equal(FOR_DEVICE.Door, '+', 'DeviceKind.Door => DoorClosed did not resolve');
  assert.equal(FOR_DEVICE.Conduit, '~', 'DeviceKind.Conduit => Conduit did not resolve');
  assert.equal(FOR_DEVICE.Pipe, '~', 'DeviceKind.Pipe => Pipe did not resolve');

  // Spot-checks against the sim's own literals, including the one that is a double-quote inside a
  // C# char literal — the char that broke every naive comment stripper this repo has written.
  assert.equal(FOR_DEVICE.GrowBed, '"');
  assert.equal(FOR_DEVICE.Terminal, 'T');
  assert.equal(FOR_DEVICE.Telescope, 'x');
  assert.equal(FOR_DEVICE.Scrubber, 'S');

  for (const [k, g] of Object.entries(FOR_DEVICE)) {
    assert.ok(typeof g === 'string' && g.length === 1, `ForDevice arm ${k} did not resolve to a char`);
  }
  assert.ok(COVERED.length >= 23, 'the covered set is suspiciously small — check the allowlist');
});

test('every DeviceKind has a ForDevice arm — none falls through to the "?" fallback', () => {
  const missing = DEVICE_KINDS.filter((k) => !(k in FOR_DEVICE));
  assert.deepEqual(missing, [],
    'DEVICE KIND WITH NO GLYPH: ' + missing.join(', ') + '\n' +
    'Glyphs.ForDevice ends in `_ => \'?\'`, so a kind with no switch arm projects a literal question\n' +
    'mark onto the map and the client can only draw it as an unknown chip. Give it an arm in\n' +
    'sim/Sim.Glyph/Glyphs.cs (and art, or an entry in the allowlist in this file).');
});

test('the allowlist is real, justified, and pinned to its size', () => {
  for (const [name, why] of Object.entries(NO_FURNITURE_SPRITE)) {
    assert.ok(DEVICE_KINDS.includes(name),
      `STALE ALLOWLIST ENTRY "${name}" — no such DeviceKind. Delete the line.`);
    assert.ok(typeof why === 'string' && why.length > 20,
      `allowlist entry "${name}" has no real justification — say which layer draws it`);
  }
  // PINNED BY EQUALITY so the ledger cannot grow quietly (the house pattern: KNOWN_GAPS in
  // surface-boundary.test.js, ClientlessChannelAllowlist in SurfaceBoundaryTests.cs).
  assert.equal(Object.keys(NO_FURNITURE_SPRITE).length, 3,
    'THE NO-FURNITURE ALLOWLIST CHANGED SIZE.\n' +
    'It only ever shrinks. If you removed an entry because that kind grew a real piece — lower this\n' +
    'number in the same commit. If you ADDED one, stop: the two legitimate exits are (1) give the\n' +
    'kind art (a builder in client/src/items/objects.js + a glyph on its ITEMS row), or (2) name a\n' +
    'stand-in in GLYPH_SUBSTITUTE (client/src/items/glyph-map.js). An unlisted, unskinned kind is\n' +
    'what the player sees as a dashed box with a raw letter in it — HANDOVER §4l.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE COVERAGE ASSERTION — driven end to end, one leg per DeviceKind.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const OPTS = { w: 64, h: 64, idPrefix: 'cov' };
/** Byte-for-byte what `buildItem` returns for an id that is not in the registry. */
const PLACEHOLDER = buildItem('__no_such_item__', OPTS);

test('EVERY DeviceKind the sim projects builds REAL art (driven through buildItem)', () => {
  const broken = [];
  for (const kind of COVERED) {
    const glyph = FOR_DEVICE[kind];
    const itemId = itemIdForGlyphChar(glyph);
    if (!itemId) { broken.push(`${kind} (glyph ${JSON.stringify(glyph)}): no item claims this glyph`); continue; }
    const entry = ITEMS[itemId];
    if (!entry) { broken.push(`${kind} → "${itemId}": no such entry in ITEMS`); continue; }
    if (typeof entry.build !== 'function') { broken.push(`${kind} → "${itemId}": entry.build is not a function`); continue; }
    // THE DRIVEN PART. Not "the table has a key" — call the real builder and check what came back
    // is not the neutral "?" placeholder `buildItem` hands out for an unknown id.
    const svg = buildItem(itemId, OPTS);
    if (svg === PLACEHOLDER) { broken.push(`${kind} → "${itemId}": buildItem returned the PLACEHOLDER`); continue; }
    if (!svg.includes('<g class="pl-item">') || svg.length < 80) {
      broken.push(`${kind} → "${itemId}": buildItem returned no real fragment (${svg.length} chars)`);
    }
  }
  assert.deepEqual(broken, [],
    'DEVICE KIND(S) WITH NO ART ON THE STANDARD SURFACE:\n  ' + broken.join('\n  ') + '\n\n' +
    'The sim gives every device a glyph (sim/Sim.Glyph/Glyphs.cs, Glyphs.ForDevice) and the two SVG\n' +
    'surfaces skin glyphs from the ITEMS registry (client/src/items/glyph-map.js). A kind that\n' +
    'resolves to nothing draws the VS-Z-25 dashed "unknown" chip in the Room Zoom — a raw ASCII\n' +
    'letter in a dashed box, in the shipping game — and draws NOTHING AT ALL on the Overview.\n' +
    'That is exactly what the owner photographed on 2026-07-26 (HANDOVER §4l).\n\n' +
    'THE THREE EXITS:\n' +
    '  (1) THE ART ALREADY EXISTS — find the piece in client/src/items/index.js and put the glyph\n' +
    '      char in its `dev(...)` call. Three of the sixty pieces shipped with `glyph: null` while\n' +
    '      their builders sat there fully drawn; that is how §4l happened.\n' +
    '  (2) DRAW IT — a builder in client/src/items/objects.js + a new ITEMS row carrying the glyph.\n' +
    '  (3) STAND IT IN — add the glyph to GLYPH_SUBSTITUTE in client/src/items/glyph-map.js with a\n' +
    '      per-entry reason. That ledger only shrinks, so this is a decision, not a shortcut.');
});

test('THE THREE FROM §4l, by name: hydroponics, the MOSS terminal and the sensor array', () => {
  // A regression pin with the kinds spelled out, so a future refactor that re-nulls one of them
  // fails with the owner's own bug report in the message rather than as an anonymous count.
  assert.equal(itemIdForGlyphChar(FOR_DEVICE.GrowBed), 'hydroponics');
  assert.equal(itemIdForGlyphChar(FOR_DEVICE.Terminal), 'research-console');
  assert.equal(itemIdForGlyphChar(FOR_DEVICE.Telescope), 'sensor-array');
  for (const id of ['hydroponics', 'research-console', 'sensor-array']) {
    assert.notEqual(buildItem(id, OPTS), PLACEHOLDER, `${id} builds the placeholder`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE REGISTRY IS THE SINGLE SOURCE OF TRUTH — the invariants that keep it one.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The functional ITEMS rows that claim a glyph: [itemId, glyph]. */
const FUNCTIONAL_GLYPHS = Object.keys(ITEMS)
  .filter((id) => ITEMS[id].kind === 'functional' && typeof ITEMS[id].glyph === 'string')
  .map((id) => [id, ITEMS[id].glyph]);

test('no two functional ITEMS rows claim the same glyph', () => {
  assert.ok(FUNCTIONAL_GLYPHS.length >= 18, 'the functional-glyph scan found almost nothing');
  const seen = new Map();
  const clashes = [];
  for (const [id, g] of FUNCTIONAL_GLYPHS) {
    if (seen.has(g)) clashes.push(`${JSON.stringify(g)}: ${seen.get(g)} vs ${id}`);
    else seen.set(g, id);
  }
  assert.deepEqual(clashes, [],
    'TWO ITEMS CLAIM ONE GLYPH: ' + clashes.join('; ') + '\n' +
    'glyph-map.js resolves first-wins, so one of these pieces would silently never render.');
});

test('every glyph an ITEMS row claims is a glyph the sim actually projects', () => {
  // The other direction, and it is the one that catches a TYPO. A row that claims `\`` instead of
  // `"` would leave GrowBed unskinned again while every count above stayed the same.
  const orphans = FUNCTIONAL_GLYPHS
    .filter(([, g]) => !Object.values(FOR_DEVICE).includes(g))
    .map(([id, g]) => `${id} claims ${JSON.stringify(g)}`);
  assert.deepEqual(orphans, [],
    'ITEMS ROW CLAIMS A GLYPH NO DeviceKind PROJECTS: ' + orphans.join('; ') + '\n' +
    'Either the char is a typo, or the sim arm it mirrors was changed without this row.');
});

test('every ITEMS row that claims a glyph names the DeviceKind that projects it', () => {
  // The registry carries `deviceKind` beside `glyph`. If the two disagree the registry is lying
  // about what the piece is, and the lie is invisible because only `glyph` is read at runtime.
  const wrong = [];
  for (const [id, g] of FUNCTIONAL_GLYPHS) {
    const kind = ITEMS[id].deviceKind;
    if (!kind) { wrong.push(`${id} claims ${JSON.stringify(g)} with no deviceKind`); continue; }
    if (!(kind in FOR_DEVICE)) continue;       // a NEW kind not yet in the sim — deviceStatus:'new'
    if (FOR_DEVICE[kind] !== g) wrong.push(`${id}: deviceKind ${kind} projects ${JSON.stringify(FOR_DEVICE[kind])}, row says ${JSON.stringify(g)}`);
  }
  assert.deepEqual(wrong, [], 'ITEMS row disagrees with Glyphs.ForDevice: ' + wrong.join('; '));
});

test('GLYPH_SUBSTITUTE is real, non-shadowing, and pinned to its size', () => {
  const realGlyphs = new Set(FUNCTIONAL_GLYPHS.map(([, g]) => g));
  for (const [g, id] of Object.entries(GLYPH_SUBSTITUTE)) {
    assert.ok(Object.values(FOR_DEVICE).includes(g),
      `STALE SUBSTITUTE ${JSON.stringify(g)}: no DeviceKind projects that glyph. Delete the line.`);
    assert.ok(!realGlyphs.has(g),
      `SHADOWED SUBSTITUTE ${JSON.stringify(g)}: a real ITEMS row now claims it (${GLYPH_TO_ITEM[g]}).\n` +
      'The substitution is dead code and the ledger has grown stale — delete the line.');
    assert.ok(ITEMS[id], `SUBSTITUTE ${JSON.stringify(g)} → "${id}": no such item`);
    assert.equal(typeof ITEMS[id].build, 'function', `SUBSTITUTE "${id}" has no builder`);
    assert.notEqual(buildItem(id, OPTS), PLACEHOLDER, `SUBSTITUTE "${id}" builds the placeholder`);
    assert.equal(GLYPH_TO_ITEM[g], id, 'the derivation did not pick the substitute up');
  }
  // ONLY SHRINKS. Each entry is a device wearing another device's art, visible to the player.
  assert.equal(Object.keys(GLYPH_SUBSTITUTE).length, 5,
    'GLYPH_SUBSTITUTE CHANGED SIZE. It only shrinks — an entry goes away when the warm set grows a\n' +
    'real piece for that kind. Adding one means a device now wears art that is not its own, on the\n' +
    'one standard surface; that is a decision for a commit message, not a default.');
});

test('the derived table is a function of ITEMS — not of a hand mirror', () => {
  // The bug class this package removed: two view files each carrying their own copy. If the
  // derivation ever stops reading the registry, this goes red — every glyph is checked back against
  // its own ITEMS row rather than against a transcribed expectation.
  for (const [id, g] of FUNCTIONAL_GLYPHS) {
    assert.equal(GLYPH_TO_ITEM[g], id, `ITEMS["${id}"].glyph is ${JSON.stringify(g)} but the table says ${GLYPH_TO_ITEM[g]}`);
  }
  assert.equal(Object.keys(GLYPH_TO_ITEM).length, FUNCTIONAL_GLYPHS.length + Object.keys(GLYPH_SUBSTITUTE).length);
  // Non-glyph inputs are '' rather than a throw or an `undefined` leaking into an SVG string.
  for (const junk of ['', 'ab', null, undefined, 42, {}]) assert.equal(itemIdForGlyphChar(junk), '');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. BOTH SURFACES, DRIVEN — the real Overview composer and the real Room Zoom controller.
//    A shared table proves nothing if a surface stops reading it.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const DECKS_JSON =
  '{"type":"decks","decks":[{"deck":1,"slots":[[0,4,6,12,8,"quarters",5,true,true]]}]}';
const ROOMS_JSON = '{"type":"rooms","rooms":[["quarters",1,0.209,512,101.3,293,96]]}';
const VIEW = decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON)));
const QUARTERS = roomTileRect(VIEW, 'quarters');

/** A frame for deck `d` whose (x,y) cells carry the given glyph chars, everything else floor. */
function frameWith(placements, deck = 1, w = 24, h = 20) {
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];
  for (const [x, y, ch] of placements) cells[y * w + x] = [ch.charCodeAt(0), 8, 0, 0];
  return { type: 'frame', deck, w, h, lens: 'none', cells };
}

test('the Room Zoom MODEL skins every covered kind — no unknown chip (roomCells, driven)', () => {
  // One tile per covered DeviceKind, laid out inside the room rect and read back through the real
  // `roomCells`. `itemId === ''` is precisely what makes `furnitureSvg` draw the dashed chip.
  const placements = COVERED.map((k, i) => [QUARTERS.rx + (i % 10), QUARTERS.ry + Math.floor(i / 10), FOR_DEVICE[k]]);
  assert.ok(placements.length >= 23, 'nothing to place — the covered set is empty');
  const cells = roomCells(frameWith(placements, QUARTERS.deck), QUARTERS);
  assert.equal(cells.length, placements.length, 'roomCells dropped tiles — the fixture is off-rect');
  const chipped = cells.filter((c) => !c.itemId).map((c) => JSON.stringify(String.fromCharCode(c.code)));
  assert.deepEqual(chipped, [],
    'THE ROOM ZOOM WOULD DRAW THE VS-Z-25 UNKNOWN CHIP for glyph(s): ' + chipped.join(', '));
  // and the model agrees with the shared derivation, per kind
  for (const k of COVERED) assert.equal(itemForGlyph(FOR_DEVICE[k].charCodeAt(0)), itemIdForGlyphChar(FOR_DEVICE[k]), k);
});

test('the Overview COMPOSER draws furniture for every covered kind (overviewScene, driven)', () => {
  const missing = [];
  for (const k of COVERED) {
    const probe = { deck: 1, w: 1, h: 1, lens: 'none', cells: [[FOR_DEVICE[k].charCodeAt(0), 8, 0, 0]] };
    const svg = overviewScene({ deck: 1, decksView: VIEW, frame: probe, crew: [], marks: [] });
    if (!svg.includes('class="pl-furniture"')) missing.push(`${k} (${JSON.stringify(FOR_DEVICE[k])})`);
  }
  assert.deepEqual(missing, [],
    'THE OVERVIEW DREW NOTHING for: ' + missing.join(', ') + '\n' +
    'furnitureLayer does `if (!itemId) continue`, so on the Overview an unskinned device is not a\n' +
    'chip — it is silently absent from the schematic, which is worse to find.');
});

// ── the REAL Room Zoom controller, over dom-lite ──────────────────────────────────────────────
// The two tests above drive the pure model and the pure composer. This one drives the SHIPPING
// controller: `initRoomZoom` + `enter()` + the real repaint, and reads the SVG it actually wrote
// into `#rz-layers`. It is the only leg that can see the chip markup itself.

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-minimap',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
class RzEl extends DomEl {
  constructor(doc, tag) { super(doc, tag); this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 }; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return this._rect; }
  closest() { return null; }
}
class RzDoc extends DomDocument {
  constructor() { super(); this.body = new RzEl(this, 'body'); }
  createElement(tag) { return new RzEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const rzDoc = new RzDoc();
for (const id of RZ_IDS) { const e = new RzEl(rzDoc, 'div'); e._id = id; rzDoc.register(id, e); }
globalThis.document = rzDoc;
globalThis.window = { addEventListener() {}, removeEventListener() {} };

// Resolved AFTER the globals — both modules touch `document` at import time.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

test('THE OWNER\'S BUG, driven through the SHIPPING Room Zoom: no dashed letter box remains', () => {
  const api = RoomZoom.initRoomZoom({ send: () => {} });
  Hud.renderDecks(decode(DECKS_JSON));
  Hud.renderRooms(decode(ROOMS_JSON));

  // NON-VACUITY CONTROL FIRST, and it is the half that makes the rest mean anything: a glyph
  // NOTHING skins ('z') must still produce the chip. Without this the assertion below passes just as
  // well against a Room Zoom that lost its furniture layer entirely.
  Hud.renderFrame(frameWith([[QUARTERS.rx, QUARTERS.ry, 'z']], QUARTERS.deck));
  api.exit(); api.enter('quarters');
  const control = rzDoc.getElementById('rz-layers').innerHTML;
  assert.ok(control.includes('stroke-dasharray="3 2"') && control.includes('>z</text>'),
    'the VS-Z-25 unknown chip did not render for an unskinned glyph — this rig cannot see the bug');

  // …and now the three the owner photographed, plus every other covered kind, on real tiles.
  const placements = COVERED.map((k, i) => [QUARTERS.rx + (i % 10), QUARTERS.ry + Math.floor(i / 10), FOR_DEVICE[k]]);
  Hud.renderFrame(frameWith(placements, QUARTERS.deck));
  api.exit(); api.enter('quarters');
  const html = rzDoc.getElementById('rz-layers').innerHTML;

  assert.ok(html.includes('class="rz-furniture"'), 'the Room Zoom drew no furniture layer at all');
  for (const k of COVERED) {
    const g = FOR_DEVICE[k];
    const chip = '>' + (g === '"' ? '&quot;' : g) + '</text>';
    assert.ok(!html.includes(chip),
      `THE §4l BUG IS BACK for ${k}: the Room Zoom rendered the unknown chip carrying ${JSON.stringify(g)}.\n` +
      'That is the dashed box with a raw ASCII letter in it that Garvin photographed on 2026-07-26.');
  }
  // A count, so "no chip" cannot be satisfied by "no tiles". Every covered kind drew a real piece.
  const pieces = (html.match(/<g class="pl-item">/g) || []).length;
  assert.ok(pieces >= COVERED.length, `only ${pieces} item groups for ${COVERED.length} devices`);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. NEGATIVE CONTROLS for the C# scan (CLAUDE.md trap 1). A guard that matches raw source text is
//    satisfied by the thing it guards against, COMMENTED OUT — and, in the mirror direction, fires
//    on prose, which teaches people to delete explanatory comments to appease a test. Both halves
//    are required, and both are asserted here against SYNTHETIC sources so the controls cannot be
//    invalidated by an edit to the real ones.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('NEGATIVE CONTROL: a commented-out ForDevice arm is NOT parsed as coverage', () => {
  const src = `
    public static class Glyphs {
      public const char Conduit = '~';
      public static char ForDevice(DeviceKind kind) => kind switch
      {
          DeviceKind.Scrubber => 'S',
          // DeviceKind.Ghost => 'q',
          /* DeviceKind.Phantom => 'w', */
          DeviceKind.Conduit => Conduit,
          _ => '?',
      };
    }`;
  const parsed = parseForDevice(src);
  assert.deepEqual(Object.keys(parsed).sort(), ['Conduit', 'Scrubber'],
    'a COMMENTED-OUT arm was counted as real coverage — the comment stripper is not being used');
  assert.equal(parsed.Conduit, '~', 'the live named-const arm stopped resolving (the control is over-strict)');
});

test('NEGATIVE CONTROL: a commented-out enum member is NOT counted as a DeviceKind', () => {
  const src = `
    public enum DeviceKind : byte {
      Door = 0,
      // Ghost = 98,
      /* Phantom = 99, */
      Telescope = 25,
    }`;
  assert.deepEqual(parseDeviceKinds(src), ['Door', 'Telescope'],
    'a COMMENTED-OUT enum member was counted — the comment stripper is not being used');
});

test('NEGATIVE CONTROL: prose mentioning a kind does not create coverage, and a quote does not blind the scan', () => {
  // The mirror direction. A comment that TALKS about DeviceKind.Ghost must not register it…
  const prose = `
    // See DeviceKind.Ghost => 'q', which we deliberately do not ship.
    public static char ForDevice(DeviceKind kind) => kind switch
    { DeviceKind.GrowBed => '"', _ => '?', };`;
  assert.deepEqual(Object.keys(parseForDevice(prose)), ['GrowBed']);
  // …and the '"' char literal must not swallow the rest of the file, which is the exact hole that
  // has shipped in this repo before. If it did, the arm AFTER it would vanish.
  const afterQuote = `
    public static char ForDevice(DeviceKind kind) => kind switch
    { DeviceKind.GrowBed => '"', DeviceKind.Terminal => 'T', _ => '?', };`;
  assert.deepEqual({ ...parseForDevice(afterQuote) }, { GrowBed: '"', Terminal: 'T' });
});

test('POSITIVE CONTROL: the uncommented forms ARE parsed (the controls are not vacuous)', () => {
  const live = `
    public enum DeviceKind : byte { Door = 0, Ghost = 98, }
    public static char ForDevice(DeviceKind kind) => kind switch
    { DeviceKind.Ghost => 'q', _ => '?', };`;
  assert.deepEqual(parseDeviceKinds(live), ['Door', 'Ghost']);
  assert.deepEqual({ ...parseForDevice(live) }, { Ghost: 'q' });
});
