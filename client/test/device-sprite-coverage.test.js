// THE GUARD: every glyph the sim can project is either skinned by a real item with a real builder,
// or named in a ledger that only ever shrinks.
//
// WHY IT EXISTS (HANDOVER §4l). Garvin, from a screenshot of the running game: dashed boxes with raw
// ASCII letters where furniture should be — `roomzoom-view.js`'s VS-Z-25 "unknown glyph" chip, a
// development stopgap, shipping to the player. Three `DeviceKind`s had no art on the standard
// surface: `GrowBed` (`"`), `Terminal` (`T`), `Telescope` (`x`) — hydroponics, i.e. the food loop,
// and the door into the entire MOSS CRT. **No test could see it**: the client was emitting *correct*
// text, honestly reporting that it had no art. Nothing threw, nothing was red; it read as wrong only
// when a person looked at the screen.
//
// ⚠️ THE CLAIM THIS FILE SHIPPED WITH WAS FALSE, AND IT IS QUOTED HERE RATHER THAN DELETED. It read:
// *"So the fix is not three sprites, it is this file… The next `DeviceKind` added without art fails
// here instead of shipping a placeholder"*, and the package's commit message said deriving the table
// **"removes the class of bug, not just the three instances"**. **IT DOES NOT.** Independent review
// photographed `--ship grid` deck 0, room STORAGE, *after* this package: **seven dashed unknown chips
// carrying raw ASCII — `,` six times and `f` once.** The owner's exact reported symptom, on the
// owner's ship, on the standard surface, one room away from the three that were fixed.
//
// They are GROUND ITEMS, not devices: `Glyphs.ForItem` (`Regolith ','`, `Potato 'f'`, and four more)
// lands in the *same* `roomCells` → `furnitureSvg` else-branch, and `NON_FURNITURE` filters only
// `'&'` of the seven. A guard that enumerated `ForDevice` alone could not see them **structurally**.
//
// So this file now enumerates **BOTH** switches. `ForDevice` is CLOSED — every kind resolves to art
// or is in `NO_FURNITURE_SPRITE`. `ForItem` is **OPEN AND MEASURED**: no ground item has art, all
// eight are in `NO_GROUND_ITEM_SPRITE`, and the count of kinds that visibly chip is pinned by
// equality. That ledger is the gap made mechanical instead of prose — a *new* `ItemKind` cannot join
// it silently, and the number can only be paid down. **Ground-item art is chartered separately and
// is deliberately NOT in this package.**
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

/**
 * `enum <Name> : byte { Door = 0, … }` → ['Door', 'AirVent', …] in declaration order.
 *
 * ⚠️ THE FIRST VERSION OF THIS FUNCTION HAD A SURVIVOR, and it is quoted because the hole was in the
 * exact case the guard exists for. It matched `/(\w+)\s*=\s*(\d+)\s*,/g` — a member was only seen if
 * it had **both** an explicit `= <digits>` **and** a trailing comma. Measured by independent review,
 * both with the whole suite green: a new `DeviceKind` added as `Ghost = 26` (no trailing comma — it
 * is the last member, so this is the *natural* way to add one) **survived**, and `Ghost,` (implicit
 * value, idiomatic C#) **survived**. Both had a `ForDevice` arm and no art. The same addition written
 * `Ghost = 26,` reddened four tests, which is what proved it a parser hole rather than a dead guard.
 *
 * Now: the value clause is OPTIONAL and not restricted to digits, and a member may be terminated by
 * a comma **or by the end of the enum body** (`blockAfter` returns the body without its closing
 * brace, so end-of-string *is* the closing brace).
 */
export function parseEnumMembers(csSrc, enumName) {
  const body = blockAfter(codeOnly(csSrc), 'enum ' + enumName);
  const out = [];
  const re = /(\w+)\s*(?:=\s*[^,\n}]+?)?\s*(?:,|$)/g;
  for (let m = re.exec(body); m; m = re.exec(body)) out.push(m[1]);
  return out;
}

/** `enum DeviceKind : byte { … }` → its member names. */
export const parseDeviceKinds = (csSrc) => parseEnumMembers(csSrc, 'DeviceKind');
/** `enum ItemKind : byte { … }` → its member names. */
export const parseItemKinds = (csSrc) => parseEnumMembers(csSrc, 'ItemKind');

/** `public const char Foo = 'x';` → { Foo: 'x' }. */
function parseCharConsts(code) {
  const out = Object.create(null);
  const re = /const\s+char\s+(\w+)\s*=\s*'((?:\\.|[^'])+)'\s*;/g;
  for (let m = re.exec(code); m; m = re.exec(code)) out[m[1]] = m[2];
  return out;
}

/**
 * A `Glyphs.For*` switch expression → { EnumMemberName: glyphChar }. Arms are either a char literal
 * (`DeviceKind.AirVent => '^',`) or a named `const char` (`DeviceKind.Door => DoorClosed,`), and the
 * named form is RESOLVED — three of the twenty-six `ForDevice` arms use it, so a parser that skipped
 * it would silently under-report Door, Conduit and Pipe: the exact three the allowlist excuses.
 */
function parseGlyphSwitch(csSrc, header, enumName) {
  const code = codeOnly(csSrc);
  const consts = parseCharConsts(code);
  const body = blockAfter(code, header);
  const out = Object.create(null);
  const re = new RegExp(enumName + '\\.(\\w+)\\s*=>\\s*(?:\'((?:\\\\.|[^\'])+)\'|(\\w+))\\s*(?:,|$)', 'g');
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const lit = m[2];
    const named = m[3];
    if (lit !== undefined) out[m[1]] = lit;
    else if (named !== undefined && consts[named] !== undefined) out[m[1]] = consts[named];
    else out[m[1]] = null; // an arm we could not resolve — reported, never silently dropped
  }
  return out;
}

/** `Glyphs.ForDevice` → { DeviceKindName: glyphChar }. */
export const parseForDevice = (csSrc) =>
  parseGlyphSwitch(csSrc, 'ForDevice(DeviceKind kind) => kind switch', 'DeviceKind');
/** `Glyphs.ForItem` → { ItemKindName: glyphChar } — the GROUND-ITEM half (the §4l-adjacent gap). */
export const parseForItem = (csSrc) =>
  parseGlyphSwitch(csSrc, 'ForItem(ItemKind kind) => kind switch', 'ItemKind');

const DEVICE_CS = read('sim/Sim.Core/Entities/Device.cs');
const ITEM_CS = read('sim/Sim.Core/Entities/ItemStack.cs');
const GLYPHS_CS = read('sim/Sim.Glyph/Glyphs.cs');
const DEVICE_KINDS = parseDeviceKinds(DEVICE_CS);
const ITEM_KINDS = parseItemKinds(ITEM_CS);
const FOR_DEVICE = parseForDevice(GLYPHS_CS);
const FOR_ITEM = parseForItem(GLYPHS_CS);

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
  // Doors ride glyphs '+' (closed) / '/' (open) / 'X' (locked) and are drawn by the Room Zoom's
  // STRUCTURE layer and the Overview's wall layer, from the frame's own wall/door codes. `ITEMS`
  // does carry door pieces (`blast-door`, `sliding-door`, `airlock`) and they stay at `glyph: null`
  // on purpose: routing a door through the furniture layer would draw it TWICE, once per layer.
  //
  // ⚠️ THE JUSTIFICATION ABOVE IS INCOMPLETE, and the shortfall is LATENT rather than live (found in
  // review). It holds fully on the Overview. On the Room Zoom the structure layer is fed by
  // `STRUCTURE_CODES` while the furniture layer is filtered by `NON_FURNITURE`, and those two sets
  // DISAGREE: `NON_FURNITURE` contains `'/'` (47) but **not `'+'` (43) and not `'X'` (88)**. So a
  // CLOSED or LOCKED door standing inside a room rect would reach `roomCells`, resolve to no item,
  // and draw the VS-Z-25 chip — the §4l symptom, from the one kind this list excuses. Measured on
  // `--ship grid` deck 0: **zero such tiles today** (the ship's doors sit on room boundaries, which
  // are outside every room rect), which is why it is latent and not a live bug. The real fix is to
  // make those two sets agree in `room-model.js`; deliberately out of scope here, and recorded so
  // that "Door is allowlisted" is not read as "Door is safe on both surfaces".
  Door: 'drawn by the structure/wall layer, not the furniture layer (Room Zoom: latent gap — '
    + "NON_FURNITURE omits '+' 43 and 'X' 88, so a closed/locked door inside a room rect would chip; "
    + '0 such tiles on --ship grid deck 0 today)',
  // Conduit and Pipe share the glyph '~' — an intentional, documented collision in Glyphs.cs (they
  // are the same service-tray line). They are UTILITY-LENS OVERLAYS, drawn only under a lens, never
  // as an object on a tile; `power-conduit` / `pipe-run` therefore stay at `glyph: null` too. A
  // single glyph could not disambiguate them even if the furniture layer wanted to.
  Conduit: 'utility-lens overlay line, shares glyph ~ with Pipe',
  Pipe: 'utility-lens overlay line, shares glyph ~ with Conduit',
});

/**
 * `ItemKind`s with NO ground-item sprite — THE OPEN GAP, made mechanical.
 *
 * ⚠️ THIS LEDGER IS NOT LIKE `NO_FURNITURE_SPRITE`. Every entry there is "another layer draws this".
 * Every entry HERE is **"the player sees a dashed box with a raw letter in it"**, six times out of
 * seven, right now, on `--ship grid`. It is written down because independent review photographed
 * room STORAGE on deck 0 after this package landed and counted **seven chips: `,` ×6 and `f` ×1**.
 * Ground-item art is chartered separately and is deliberately not in this package; what this ledger
 * buys is that the gap is COUNTED rather than described, and that a NEW `ItemKind` cannot join it
 * silently — it would have to be added here, by name, in a commit.
 *
 * `chips: true` means the tile draws the VS-Z-25 unknown chip in the Room Zoom today (and nothing at
 * all on the Overview, which `continue`s instead). The count of `chips: true` entries is pinned by
 * equality below, so this ledger only ever pays DOWN.
 */
const NO_GROUND_ITEM_SPRITE = Object.freeze({
  // The seven that visibly chip. All are ordinary loose stock lying on a floor tile; the warm 60-piece
  // set has no ground-pile, ore, crop, scrap, part or module piece to skin any of them with, and the
  // three generic containers it does have (`storage-crate`, `supply-barrel`, `fuel-drum`) are
  // COSMETIC decor pieces, not stack art — standing one in would say "a crate is here", which is a
  // different and wrong claim about the tile.
  Regolith: { glyph: ',', chips: true, why: 'loose spoil; no ground-pile piece in the warm set' },
  MetalOre: { glyph: 'o', chips: true, why: 'ore stack; no ore piece in the warm set' },
  Potato: { glyph: 'f', chips: true, why: 'raw food stack; no crop piece in the warm set' },
  Scrap: { glyph: 's', chips: true, why: 'salvage stack; no scrap piece in the warm set' },
  Parts: { glyph: 'p', chips: true, why: 'parts stack; no parts piece in the warm set' },
  ControllerModule: { glyph: 'c', chips: true, why: 'module stack; no module piece in the warm set' },
  // E0-6 added `Seals` (ItemKind 7). The question this ledger forces was answered NO: the warm
  // 60-piece set has no gasket/seal/consumable piece either, and ground-item art is chartered
  // separately, so it joins the ledger rather than pretending to art it does not have.
  Seals: { glyph: 'g', chips: true, why: 'seal/gasket stack; no consumable piece in the warm set' },
  // The one that does NOT chip, and it is the reason this ledger records `chips` per entry instead
  // of just listing names: `'&'` (38) is in `NON_FURNITURE` on BOTH surfaces, so a corpse reaches
  // neither furniture layer. It draws nothing at all here. (The frozen canvas skin has a real
  // `corpse` sprite role; the SVG surfaces never grew one.)
  Corpse: { glyph: '&', chips: false, why: "'&' is in NON_FURNITURE on both SVG surfaces — draws nothing" },
});

/**
 * The DeviceKinds this file holds to the art standard. Kinds in the allowlist are excused; kinds
 * whose `ForDevice` arm did not RESOLVE are excluded too, and that exclusion is deliberate — see the
 * test immediately below, which is what fails for them.
 *
 * ⚠️ WHY THE SECOND FILTER EXISTS (found in review, `CLAUDE.md` trap 4). Without it, a kind with no
 * arm left `FOR_DEVICE[k] === undefined` and three driven tests died on
 * `TypeError: Cannot read properties of undefined (reading 'charCodeAt')`. The named guard still
 * fired, so the guard bit — but three of the failures were CRASHES wearing the costume of semantic
 * REDs, which is precisely the failure mode a harness must not produce. A missing arm is now
 * reported by exactly one test, by name, and every driven test below stays a semantic assertion.
 */
const COVERED = DEVICE_KINDS.filter(
  (k) => !(k in NO_FURNITURE_SPRITE) && typeof FOR_DEVICE[k] === 'string' && FOR_DEVICE[k].length === 1,
);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. NON-VACUITY. Every assertion below is over a parsed set; a parser that silently returned
//    nothing would make the whole file pass while proving nothing. This runs first and by name.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ THESE THREE COUNTS ARE PINNED BY EQUALITY, NOT BY A `>=` FLOOR, and the change is the whole
// point of the fix. They shipped as `>= 26` / `>= 26` / `>= 23`, and a floor is satisfied by a
// CORRELATED parse failure: grow the enum to 27 and drop one kind *and* its arm together, and every
// floor still holds while the guard silently stops covering something. Independent review measured
// exactly that surviving. Both ledgers in this same file were already pinned by equality; the parse
// counts were not, and the inconsistency was the tell.
//
// A sim that legitimately adds a DeviceKind now fails here FIRST, with instructions. That is
// intended: adding a kind is the moment to decide whether it has art.
const EXPECT_DEVICE_KINDS = 26;
const EXPECT_FOR_DEVICE_ARMS = 26;
const EXPECT_COVERED = 23;    // 26 kinds − 3 allowlisted (Door, Conduit, Pipe)
const EXPECT_ITEM_KINDS = 8;   // E0-6 added Seals
const EXPECT_FOR_ITEM_ARMS = 8;   // E0-6 added Seals

const COUNT_MOVED = (what, n, expected) =>
  `${what.toUpperCase()} COUNT MOVED: parsed ${n}, expected exactly ${expected}.\n` +
  'This is an EQUALITY pin, deliberately — a `>=` floor is satisfied by a correlated parse failure\n' +
  '(enum grows by one, one kind silently stops being seen, floor still holds).\n' +
  'TWO CASES:\n' +
  '  (1) THE SIM REALLY GREW. Good — that is the moment to decide whether the new kind has art.\n' +
  '      Give it art (or a ledger entry with a reason), then raise this constant in the SAME commit.\n' +
  '  (2) THE PARSER BROKE. It has form: the first version of `parseEnumMembers` required BOTH an\n' +
  '      explicit `= <digits>` AND a trailing comma, so `Ghost = 26` (last member, no comma) and\n' +
  '      `Ghost,` (implicit value) were both invisible — with the whole suite green.';

test('the C# parse is non-vacuous and resolves the named-const arms', () => {
  assert.equal(DEVICE_KINDS.length, EXPECT_DEVICE_KINDS,
    COUNT_MOVED('DeviceKind', DEVICE_KINDS.length, EXPECT_DEVICE_KINDS));
  assert.ok(DEVICE_KINDS.includes('GrowBed') && DEVICE_KINDS.includes('Terminal')
    && DEVICE_KINDS.includes('Telescope'), 'the three §4l kinds are missing from the parse');

  const arms = Object.keys(FOR_DEVICE);
  assert.equal(arms.length, EXPECT_FOR_DEVICE_ARMS,
    COUNT_MOVED('ForDevice arm', arms.length, EXPECT_FOR_DEVICE_ARMS));

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
  assert.equal(COVERED.length, EXPECT_COVERED, COUNT_MOVED('covered kind', COVERED.length, EXPECT_COVERED));

  // …and the ITEM half, parsed the same way from the same file. `ForItem` has no named-const arms.
  assert.equal(ITEM_KINDS.length, EXPECT_ITEM_KINDS,
    COUNT_MOVED('ItemKind', ITEM_KINDS.length, EXPECT_ITEM_KINDS));
  const iArms = Object.keys(FOR_ITEM);
  assert.equal(iArms.length, EXPECT_FOR_ITEM_ARMS,
    COUNT_MOVED('ForItem arm', iArms.length, EXPECT_FOR_ITEM_ARMS));
  assert.equal(FOR_ITEM.Regolith, ',');
  assert.equal(FOR_ITEM.Potato, 'f');
  assert.equal(FOR_ITEM.Corpse, '&');
  for (const [k, g] of Object.entries(FOR_ITEM)) {
    assert.ok(typeof g === 'string' && g.length === 1, `ForItem arm ${k} did not resolve to a char`);
  }
});

test('no glyph means BOTH a device and a ground item', () => {
  // A frame cell carries ONE glyph, so a shared char would leave the client unable to say which of
  // the two a tile is. It holds today (device glyphs are upper-case where the item ones are lower:
  // 'S' Scrubber vs 's' Scrap, 'P' PlantPot vs 'p' Parts, 'C' MedCabinet vs 'c' ControllerModule,
  // 'F' Fabricator vs 'f' Potato, 'O' WaterTank vs 'o' MetalOre) — and it holds by CONVENTION, which
  // is exactly the kind of thing that stops holding without anyone deciding to break it.
  const dev = new Set(Object.values(FOR_DEVICE));
  const clash = Object.entries(FOR_ITEM).filter(([, g]) => dev.has(g));
  assert.deepEqual(clash, [],
    'GLYPH CLAIMED BY A DEVICE **AND** AN ITEM: ' + JSON.stringify(clash) + '\n' +
    'One frame cell carries one glyph. The client cannot tell the two apart, and whichever the\n' +
    'furniture layer skins will be wrong half the time.');
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
// 3b. THE GROUND-ITEM GAP — every ItemKind accounted for, and the damage COUNTED.
//     This half is OPEN by charter. What it must never be again is invisible.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('EVERY ItemKind is accounted for — skinned, or named in the ledger', () => {
  const unaccounted = ITEM_KINDS.filter((k) => !(k in NO_GROUND_ITEM_SPRITE) && !itemIdForGlyphChar(FOR_ITEM[k]));
  assert.deepEqual(unaccounted, [],
    'ITEM KIND WITH NO ART AND NO LEDGER ENTRY: ' + unaccounted.join(', ') + '\n\n' +
    'A ground item with no art draws the SAME VS-Z-25 dashed chip a device with no art draws — the\n' +
    'symptom the owner reported (HANDOVER §4l), from the other switch. `Glyphs.ForItem` is as much a\n' +
    'source of on-map glyphs as `Glyphs.ForDevice`.\n\n' +
    'TWO EXITS: give it art (a builder + an ITEMS row carrying the glyph), or add it to\n' +
    'NO_GROUND_ITEM_SPRITE in this file with a per-entry reason and whether it chips. The ledger is\n' +
    'pinned by equality, so adding an entry is a decision someone has to write down.');

  for (const [name, e] of Object.entries(NO_GROUND_ITEM_SPRITE)) {
    assert.ok(ITEM_KINDS.includes(name), `STALE GROUND-ITEM LEDGER ENTRY "${name}" — no such ItemKind.`);
    assert.equal(e.glyph, FOR_ITEM[name],
      `ledger says ${name} rides ${JSON.stringify(e.glyph)}, Glyphs.ForItem says ${JSON.stringify(FOR_ITEM[name])}`);
    assert.ok(typeof e.why === 'string' && e.why.length > 20, `ledger entry "${name}" has no real reason`);
    assert.equal(itemIdForGlyphChar(e.glyph), '',
      `LEDGER IS STALE: ${name} (${JSON.stringify(e.glyph)}) now HAS art (${itemIdForGlyphChar(e.glyph)}). ` +
      'Delete the line and lower the pinned counts — this ledger only shrinks.');
  }
  assert.equal(Object.keys(NO_GROUND_ITEM_SPRITE).length, EXPECT_ITEM_KINDS,
    'THE GROUND-ITEM LEDGER CHANGED SIZE. It only shrinks: an entry goes away when that kind gets\n' +
    'art. Every entry is a tile the player currently reads as a dashed box with a letter in it.');
});

// THE NUMBER, DRIVEN — not "some items are unskinned" but exactly how many chip, measured through
// the real Room Zoom model on a real tile per kind. Pinned by equality so it can only be paid down.
// This is the assertion that turns the reviewer's photograph into something the gate can hold.
const EXPECT_CHIPPING_ITEM_KINDS = 7;   // all but Corpse ('&' is in NON_FURNITURE on both surfaces)

test('THE OPEN GAP, MEASURED: exactly six ItemKinds still draw a raw-letter chip', () => {
  const chipping = [];
  for (const k of ITEM_KINDS) {
    const g = FOR_ITEM[k];
    // Driven through the SHIPPING Room Zoom model: a 1x1 room whose only cell is this glyph.
    const focus = { deck: 0, rx: 0, ry: 0, rw: 1, rh: 1 };
    const frame = { deck: 0, w: 1, h: 1, lens: 'none', cells: [[g.charCodeAt(0), 0, 0, 0]] };
    const cells = roomCells(frame, focus);
    // `roomCells` drops NON_FURNITURE codes entirely (no cell ⇒ no chip); an emitted cell with an
    // empty itemId is exactly what `furnitureSvg` turns into the dashed letter box.
    const chips = cells.length === 1 && !cells[0].itemId;
    if (chips) chipping.push(`${k} (${JSON.stringify(g)})`);
    assert.equal(chips, NO_GROUND_ITEM_SPRITE[k].chips,
      `the ledger says ${k} chips=${NO_GROUND_ITEM_SPRITE[k].chips}, the real Room Zoom model says ${chips}`);
  }
  assert.equal(chipping.length, EXPECT_CHIPPING_ITEM_KINDS,
    'THE NUMBER OF RAW-LETTER CHIPS MOVED: ' + chipping.join(', ') + '\n\n' +
    'Measured live by independent review on --ship grid deck 0, room STORAGE, after the device fix:\n' +
    "seven chips on one floor — ',' six times and 'f' once. If this number went UP, a new ItemKind\n" +
    'shipped without art. If it went DOWN, an item got art — lower this constant and delete its\n' +
    'ledger entry in the same commit. It only ever pays down.');
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

test('THE TWO SURVIVORS: an enum member with no trailing comma, and one with an implicit value', () => {
  // ⚠️ THIS TEST IS THE FIX FOR F1 AND IT EXISTS BECAUSE BOTH SHAPES SHIPPED PAST THE GUARD.
  // Independent review added a real `DeviceKind` in each of these two spellings, gave it a
  // `ForDevice` arm, gave it no art — and the whole 711-test suite stayed green, twice. Both are the
  // NATURAL way to write it: no trailing comma is what you get appending a last member, and an
  // implicit value is idiomatic C#. Neither is exotic.
  const noComma = `
    public enum DeviceKind : byte {
      Door = 0,
      Telescope = 25,
      Ghost = 26
    }`;
  assert.deepEqual(parseDeviceKinds(noComma), ['Door', 'Telescope', 'Ghost'],
    'SURVIVOR 1 IS BACK: a last enum member with no trailing comma is invisible to the parser');

  const implicitValue = `
    public enum DeviceKind : byte {
      Door = 0,
      Ghost,
      Telescope = 25,
    }`;
  assert.deepEqual(parseDeviceKinds(implicitValue), ['Door', 'Ghost', 'Telescope'],
    'SURVIVOR 2 IS BACK: an enum member with an implicit value is invisible to the parser');

  // Both at once, plus a non-digit value expression — none of these three is special-cased.
  const mixed = `
    public enum DeviceKind : byte {
      Door = 0,
      Shifted = 1 << 3,
      Ghost,
      Last
    }`;
  assert.deepEqual(parseDeviceKinds(mixed), ['Door', 'Shifted', 'Ghost', 'Last']);

  // …and the comment stripper still wins over all of it (the two must not trade off).
  const commented = `
    public enum DeviceKind : byte {
      Door = 0,
      // Ghost
      /* Phantom, */
      Last
    }`;
  assert.deepEqual(parseDeviceKinds(commented), ['Door', 'Last']);
});
