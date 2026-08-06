// THE WEAR JOIN (client/src/items/wear.js) — the one place a device's CONDITION chooses its art.
//
// WHAT THIS FILE IS FOR, in one sentence: to make it impossible for the 80 post-raid twins to be
// wired to the wrong tiles, at the wrong threshold, or by more than one rule.
//
// The three things it pins, and why each needed pinning rather than reading:
//
// 1. THE THRESHOLD IS THE SIM'S OWN NUMBER, read out of `content/core/SimDefs/wear.def` at test time
//    rather than transcribed. `wear.wreck_threshold` is where the RULES change — below it a machine
//    is refused a free jury-rig at recruitment and pays `Swarf` instead of `Parts` — so it is where
//    the PICTURE has to change, or the player learns something false. A hand-copied `0.25` in the
//    client would go stale the first time the def moved, silently, in the only direction that
//    matters (art that lies about a mechanic).
//
// 2. THE PIECE ON A WRECKED TILE IS THAT TILE'S OWN TWIN. `wrecked.test.js` proves each ROW carries
//    the painter named after it; that says nothing about which row the JOIN reaches for. A join that
//    returned a fixed twin, or the NEXT row's twin, renders 70 real paintings on the wrong objects
//    and every existing assertion stays green — so the leg here is per-id and compares against the
//    twin BUILT WITH THE SAME OPTS, byte for byte.
//
// 3. THE JOIN NEVER ASKS WHAT A GLYPH RESOLVES TO. CLAUDE.md's sixth trap: `GLYPH_SUBSTITUTE` lets a
//    device wear another piece's art, so the borrowed row's `kind` is not a fact about the tile. It
//    shipped DEMOLISH dead on every lamp with the suite green before AND after the fix. The controls
//    below plant the shape rather than assert the intent.
//
// PURE throughout: `buildTileItem`, `overviewScene` and the two model functions are all functions of
// their arguments, so nothing here needs a DOM. The DRIVEN Room Zoom half lives in
// `devices-model.test.js`, beside the rig that was built for the seam it reads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ITEMS, ITEM_IDS, buildItem } from '../src/items/index.js';
import { ATTEND } from '../src/items/helpers.js';
import { WRECKED, buildWrecked, wreckedState, NO_WRECKED_TWIN } from '../src/items/wrecked.js';
import { GLYPH_SUBSTITUTE, GLYPH_TO_ITEM, itemIdForGlyphChar } from '../src/items/glyph-map.js';
import {
  WRECK_THRESHOLD,
  WRECK_COND_BYTE,
  isWreckedCond,
  hasWreckedTwin,
  buildTileItem,
  deviceKindsWithSeveralPieces,
} from '../src/items/wear.js';
import { deckDeviceConditions, roomDeviceConditions, itemForDeviceRow } from '../src/ui/room-model.js';
import { codeOnly } from './code-only.js';
import { overviewScene } from '../src/ui/overview-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEAR_DEF = readFileSync(join(HERE, '..', '..', 'content', 'core', 'SimDefs', 'wear.def'), 'utf8');

// ═════════════════════════════════════════════════════════ 1. THE THRESHOLD

test('the threshold IS wear.wreck_threshold, read from the def and not transcribed', () => {
  // The def is `key = value  # comment`. Bounded to the assignment so a mention of the key inside a
  // comment (there are two in this very file) cannot be read as the value.
  const m = WEAR_DEF.match(/^\s*wreck_threshold\s*=\s*([0-9.]+)/m);
  assert.ok(m, 'wreck_threshold is gone from content/core/SimDefs/wear.def — this reader is broken,\n'
    + 'or the def field was renamed and the client must follow it');
  const fromDef = Number(m[1]);
  assert.ok(Number.isFinite(fromDef) && fromDef > 0 && fromDef < 1, `parsed a nonsense value: ${m[1]}`);
  assert.equal(WRECK_THRESHOLD, fromDef,
    'THE ART AND THE RULE DISAGREE. `wear.wreck_threshold` is where the sim stops offering a free\n'
    + 'jury-rig and starts paying Swarf; if the picture changes anywhere else, a player who learns\n'
    + 'to read the art has learnt something false. Move WRECK_THRESHOLD to match the def.');
});

test('the wire byte is DERIVED from the threshold, and its rounding is stated honestly', () => {
  // ⚠️ THE OBVIOUS ASSERTION HERE IS A NO-OP AND IT IS WRITTEN DOWN RATHER THAN LEFT IN.
  // `assert.equal(WRECK_COND_BYTE, Math.round(WRECK_THRESHOLD * 255))` is TRUE for a hand-written
  // `64` as well, because 64 IS that product today — it is `Is.EqualTo(the field under test)`, the
  // self-derivation shape this repo has already shipped once (`swarf_service_condition` moved with
  // zero behavioural tests seeing it). MEASURED: replacing the derivation with the literal `64`
  // left the whole suite green. So the derivation is pinned where it actually lives — in the SOURCE
  // — and the arithmetic below is kept only as a statement of what the number means.
  assert.equal(WRECK_COND_BYTE, Math.round(WRECK_THRESHOLD * 255),
    'the byte and the threshold disagree about the same cliff');
  const wearSrc = codeOnly(readFileSync(join(HERE, '..', 'src', 'items', 'wear.js'), 'utf8'));
  assert.match(wearSrc, /WRECK_COND_BYTE\s*=\s*Math\.round\(WRECK_THRESHOLD\s*\*\s*255\)/,
    'WRECK_COND_BYTE is no longer DERIVED from WRECK_THRESHOLD. A literal is right until the day\n'
    + 'the def moves, and then it is wrong in the direction nothing can see: the art keeps the old\n'
    + 'cliff while the rules use the new one.');
  // …and the scan must read CODE, not prose, or the way to satisfy it is to write it in a comment.
  assert.ok(!codeOnly('// WRECK_COND_BYTE = Math.round(WRECK_THRESHOLD * 255)\nconst live = 1;\n')
    .includes('WRECK_COND_BYTE'),
    'a line comment survived codeOnly — the derivation scan is satisfiable by a commented-out line');
  assert.ok(!codeOnly('const s = "/*";\n/* WRECK_COND_BYTE = Math.round(WRECK_THRESHOLD * 255) */\nconst live = 1;\n')
    .includes('WRECK_COND_BYTE'),
    'a quoted block-comment opener blinded codeOnly, or the REAL later comment survived it');

  // ⛔ WHAT STOOD HERE WAS JS-AGAINST-JS AND PROVED NOTHING ABOUT THE HOST. It defined
  // `const condByte = (c) => Math.trunc(c*255 + 0.5)` marked "Mirrored here", then asserted
  // `condByte(WRECK_THRESHOLD) === WRECK_COND_BYTE` — both sides a JS restatement of the same
  // arithmetic, with `WireFormat.ConditionByte` nowhere in the loop. That is the SEVENTH trap's
  // self-derivation shape, and it is the more embarrassing for sitting next to a threshold check
  // that goes to real trouble to read `wear.def` off disk. **The cross-language half now lives in
  // `tests/Perilune.Tests/DevicesDeltaTests.The_Wreck_Floor_Quantises_To_The_Byte_The_Client_Compares`,
  // which runs the DEF value through the HOST'S OWN `ConditionByte` and through THIS FILE'S OWN
  // derivation, parsed out of `wear.js`.** Change the encoding and that reddens; nothing here can.
  //
  // What is left here is the half a JS test CAN own honestly: the exact arithmetic consequences of
  // the encoding as it stands, published as numbers instead of as adjectives — because the previous
  // adjectives ("roughly", "about 0.2 %") were WRONG BY A WHOLE BYTE and nothing pinned them.
  const LO = 63.5 / 255;                 // the exact pre-image floor of byte 64 under half-up
  assert.equal(WRECK_COND_BYTE, 64, 'the wreck floor no longer quantises to byte 64');
  assert.ok(Math.abs(LO - 0.2490196078) < 1e-9, 'arithmetic control: 63.5/255');
  // `cond < 64` is exactly `Condition < 63.5/255`. Asserted as a MEMBERSHIP TABLE either side of the
  // real boundary — a bisection would agree with any monotone predicate, including a wrong one.
  for (const [c, wrecked, why] of [
    [0.2400, true, 'well below'],
    [0.2480, true, 'the value the OLD comment said was drawn intact — it is drawn WRECKED'],
    [0.2490, true, 'one ulp-ish below the real cliff'],
    [0.2491, false, 'just above the real cliff — 63.5/255, not 63/255'],
    [0.2500, false, 'AT the def: the def says "below", so this is intact'],
    [0.2529, false, 'still inside byte 64'],
    [0.2530, false, 'byte 65'],
  ]) {
    // Reproduce the HOST's encoder shape locally ONLY to name the byte in the message; the assertion
    // itself is about `isWreckedCond`, the shipped predicate.
    const byte = c <= 0 ? 0 : c >= 1 ? 255 : Math.trunc(c * 255 + 0.5);
    assert.equal(isWreckedCond(byte), wrecked,
      `Condition ${c} (byte ${byte}) — ${why}. Expected wrecked=${wrecked}.`);
  }
  // THE DISAGREEMENT BAND with the sim, as a number rather than as "under one byte": the client is
  // LATE on exactly [63.5/255, 0.25), width 0.00098 = 0.098 % of a machine's life.
  const band = WRECK_THRESHOLD - LO;
  assert.ok(Math.abs(band - 0.0009803922) < 1e-9,
    `the client/sim disagreement band is ${band}, not 0.00098. Either the threshold moved or the\n`
    + 'encoding did. It is published in `wear.js` and in docs/design/shots/README.md; correct all\n'
    + 'three together, and do NOT compute the band from the gap between two byte values — that is\n'
    + 'the mistake this assertion exists to stop repeating.');
});

test('the threshold sits INSIDE the band the paintings actually depict', () => {
  // Every twin carries the mock's own remaining-condition badge; `wrecked.test.js` proves those
  // against the committed spec, so reading them here is reading evidence rather than a memory.
  const pct = [];
  for (const id of Object.keys(WRECKED)) {
    const st = wreckedState(id);
    if (st === '—') continue;             // the 8 loose resources carry no percentage
    const n = Number(st.replace('%', ''));
    assert.ok(Number.isFinite(n), `${id}: unparseable state badge ${JSON.stringify(st)}`);
    pct.push(n);
  }
  assert.ok(pct.length >= 50, `only ${pct.length} badged twins — the band below is measured on air`);
  const hi = Math.max(...pct) / 100;
  const lo = Math.min(...pct) / 100;
  assert.ok(WRECK_THRESHOLD <= hi && WRECK_THRESHOLD > lo,
    `the wreck threshold (${WRECK_THRESHOLD}) is outside the art's own band [${lo}, ${hi}].\n`
    + 'ABOVE the band means ruined art on machines the sim still repairs for free; AT OR BELOW its\n'
    + 'floor means a third of the paintings are unreachable. If the band moved (a re-import), this\n'
    + 'is the moment to ask whether the threshold should follow it.');
});

// ═════════════════════════════════════════════════════════ 2. THE PREDICATE

test('isWreckedCond: the boundary is exact, and "I do not know" means INTACT', () => {
  assert.equal(isWreckedCond(WRECK_COND_BYTE - 1), true, 'one byte below the floor is wrecked');
  assert.equal(isWreckedCond(WRECK_COND_BYTE), false, 'the floor itself is not below the floor');
  assert.equal(isWreckedCond(0), true, 'a dead machine is wrecked');
  assert.equal(isWreckedCond(255), false, 'a pristine machine is not');
  // ⚠️ THE TOLERANT CASES ARE THE POINT, not defensive noise. `null` is what `deviceConditionAt`
  // answers for a tile with no device; `undefined` is what a surface passes before the channel has
  // arrived (first frames, a reconnect, an older host). Drawing a ship as wrecked because a message
  // is late is a lie the player cannot tell apart from a raid.
  for (const junk of [null, undefined, NaN, '0', '', {}, [], true, false, Infinity, -Infinity]) {
    assert.equal(isWreckedCond(/** @type {any} */ (junk)), false,
      `${JSON.stringify(junk)} must read as "not known to be wrecked", i.e. draw the intact piece`);
  }
});

test('hasWreckedTwin follows the registry, including the ledgered row with no twin', () => {
  for (const id of ITEM_IDS) {
    assert.equal(hasWreckedTwin(id), !(id in NO_WRECKED_TWIN), `${id}`);
  }
  // ⚠️ `swarf` STOOD HERE UNTIL 2026-08-06 (`assert.equal(hasWreckedTwin('swarf'), false)`), and its
  // registry row was retired with the warm set. `turnings` is the same argument on the paper redraw —
  // a nest of cuttings has no second condition to be in — and it is the row that carries the ledger
  // line now. The loop above already covers it; this names it, because a ledgered omission that is
  // only covered by a sweep is one someone deletes without noticing.
  assert.equal(hasWreckedTwin('turnings'), false, 'turnings IS the wrecked state — it has no twin');
  assert.equal(hasWreckedTwin('swarf'), false, 'a retired id has no twin either — buildTileItem is tolerant');
  for (const junk of ['', 'nope', null, undefined, 42, {}]) {
    assert.equal(hasWreckedTwin(/** @type {any} */ (junk)), false);
  }
});

// ═════════════════════════════════════════════════════════ 3. THE JOIN ITSELF

test('buildTileItem draws THIS row\'s own twin below the floor, and the piece at or above it', () => {
  // Per id, and BYTE-FOR-BYTE against the twin built with the same opts. A join that returned a
  // FIXED twin, or the next row's, would still render 70 real paintings — on the wrong objects.
  for (const id of ITEM_IDS) {
    const opts = { idPrefix: 'j-' + id };
    const wrecked = buildTileItem(id, opts, 0);
    const intact = buildTileItem(id, opts, 255);
    assert.equal(intact, buildItem(id, opts), `${id}: a pristine tile must draw the ordinary piece`);
    if (hasWreckedTwin(id)) {
      assert.equal(wrecked, buildWrecked(id, opts), `${id}: a wrecked tile must draw ITS OWN twin`);
      assert.notEqual(wrecked, intact, `${id}: the two states render identically`);
    } else {
      assert.equal(wrecked, buildItem(id, opts),
        `${id} has no twin, so it must fall back to the piece — never to the "?" placeholder`);
    }
  }
});

test('the join is a step at the floor and nowhere else — swept across the whole byte range', () => {
  // A sweep rather than two probes: an off-by-one, an inverted comparison and a mid-range second
  // branch all survive a two-point test and all change the position or the count of the steps.
  const id = 'o2-scrubber';
  const opts = { idPrefix: 'sweep' };
  const wreckedArt = buildWrecked(id, opts);
  const intactArt = buildItem(id, opts);
  assert.notEqual(wreckedArt, intactArt, 'non-vacuity: the two states of this piece differ');
  const flips = [];
  let prev = buildTileItem(id, opts, 0);
  for (let b = 1; b <= 255; b += 1) {
    const now = buildTileItem(id, opts, b);
    assert.ok(now === wreckedArt || now === intactArt, `cond ${b} drew a third thing`);
    if (now !== prev) flips.push(b);
    prev = now;
  }
  assert.deepEqual(flips, [WRECK_COND_BYTE],
    'the art changes at bytes ' + JSON.stringify(flips) + ' — it must change exactly once, at the\n'
    + 'wreck floor. Two flips means a second branch; zero means the join is inert; a different\n'
    + 'byte means an off-by-one at the one boundary the player can see.');
});

// ⚠️ CLAUDE.md TRAP 6, PLANTED RATHER THAN ASSERTED. `GLYPH_SUBSTITUTE` is the mechanism that
// defeats a `kind`-keyed predicate: a device wearing ANOTHER piece's art. Its `'*'` (Light) entry
// points at `wall-lamp`, a COSMETIC row, while the other five point at `functional` ones — and that
// heterogeneity is the precondition for the bug, so the control checks it still holds.
test('the join survives GLYPH_SUBSTITUTE: a borrowed piece still gets its OWN twin', () => {
  const targets = [...new Set(Object.values(GLYPH_SUBSTITUTE))];
  assert.ok(targets.length >= 5, 'non-vacuity: GLYPH_SUBSTITUTE has targets to test');
  const kinds = new Set(targets.map((id) => ITEMS[id].kind));
  assert.ok(kinds.size >= 2,
    'GLYPH_SUBSTITUTE became homogeneous in registry kind — the exact condition under which a\n'
    + 'kind-keyed join LOOKS correct. This control no longer proves anything; find another.');
  for (const g of Object.keys(GLYPH_SUBSTITUTE)) {
    // Resolve exactly as a surface does: glyph → itemId → art. The point is that the answer is the
    // BORROWED row's twin, and that no `kind` was consulted to get there.
    const id = itemIdForGlyphChar(g);
    assert.equal(id, GLYPH_SUBSTITUTE[g], `glyph ${JSON.stringify(g)} no longer resolves to its substitute`);
    const opts = { idPrefix: 'sub' };
    assert.equal(buildTileItem(id, opts, 0), buildWrecked(id, opts),
      `${JSON.stringify(g)} → ${id}: a substituted device lost its twin. The join consulted the\n`
      + "borrowed row's kind — which is not a fact about the tile.");
  }
});

// ⚠️ THE ROAD NOT TAKEN, MEASURED. `WireFormat.Devices.cs` carries the raw `DeviceKind` byte and its
// header suggests deriving `kind → art` from `ITEMS`. That derivation is NOT A FUNCTION, and this
// test is the evidence rather than the claim: if the registry ever became one-piece-per-kind the
// argument in `wear.js` would be false and would fail here instead of rotting in a comment.
test('DeviceKind → art is NOT a function, which is why the join keys on the itemId', () => {
  const multi = deviceKindsWithSeveralPieces();
  const names = Object.keys(multi).sort();
  assert.ok(names.length > 0,
    'every DeviceKind now has exactly one piece, so `wear.js`\'s stated reason for not keying on the\n'
    + 'wire\'s `kind` byte is no longer true. Re-read that paragraph before believing it.');
  // The two that matter by name — a door's three states and a capsule's two are the whole reason.
  // ⚠️ THE THREE DOOR ROWS ARE `door-sliding` / `door-airlock` / `door-blast` SINCE lane/paper-fixtures
  // (2026-08-05); the warm `sliding-door` / `airlock` / `blast-door` this line used to name were
  // retired on 2026-08-06. The CLAIM did not change — a door's three states are the whole reason the
  // join cannot key on the kind byte — only the rows carrying it.
  assert.ok(names.includes('Door'), 'Door is claimed by door-sliding / door-airlock / door-blast');
  assert.ok(names.includes('CryoPod'),
    'CryoPod is claimed by BOTH capsule pieces. They are the pieces this package exists to put on\n'
    + 'screen, and a kind-keyed join could not tell them apart — it would fail on its headline case.');
  // ⚠️ AND `Battery` JOINED THE MAP ON 2026-08-05, WHICH IS THE ARGUMENT'S THIRD AND SHARPEST CASE.
  // The other two kinds are multi-piece because they have several STATE GLYPHS. Battery has exactly
  // one arm (`'B'`) and three rows — `cell-sound` (which claims it), `cell-spent` and the older
  // `battery-bank`, both `glyph: null`. So a kind-keyed join would have to choose between three
  // pieces with no state to choose BY, which is a stronger statement of the same defect.
  assert.ok(names.includes('Battery'),
    'Battery is claimed by cell-sound / cell-spent / battery-bank. If it is no longer multi-piece '
    + 'the capsules-and-cells wiring has been undone.');
  for (const k of names) assert.ok(multi[k].length > 1, `${k} is in the multi map with one piece`);
  // …and what separates the two capsules really is the glyph, i.e. the device's STATE.
  // ⚠️ THE TWO IDS MOVED ON 2026-08-05 (`cryo-capsule-*` → `capsule-*`) and the ASSERTION DID NOT
  // CHANGE SHAPE, which is the point of pinning ids rather than "some two different pieces": the
  // owner's paper drawings took the two glyphs over from the warm rows, and that hand-over is a
  // decision this line has to be edited to make.
  assert.equal(itemIdForGlyphChar('K'), 'capsule-sealed');
  assert.equal(itemIdForGlyphChar('k'), 'capsule-open');
  assert.notEqual(itemIdForGlyphChar('K'), itemIdForGlyphChar('k'));
  // ⛔ AND THE ROWS THEY DISPLACED RESOLVE FROM NOTHING NOW. Asserted, not assumed: a `glyph: null`
  // demotion that was only half-made would leave the OLD row winning `deriveGlyphToItem`'s
  // first-wins rule (it is declared earlier), and every capsule on the wreck would still be warm
  // with this file green above.
  //
  // ⭐ AND THE LIST SPLIT IN TWO ON 2026-08-06, WHICH IS THE STRONGER STATEMENT OF THE SAME THING.
  // It was `['cryo-capsule-occupied', 'cryo-capsule-open', 'battery-bank']` — three rows held to a
  // COMPLETED demotion. `battery-bank` is still registered and still held to it. The two capsules
  // were RETIRED, so for them the demotion is closed the only way that cannot be half-made: the row
  // is not there, and `buildItem` (which is tolerant) draws the placeholder for the id.
  assert.equal(ITEMS['battery-bank'].glyph, null, 'battery-bank still claims a glyph');
  assert.ok(!Object.values(GLYPH_TO_ITEM).includes('battery-bank'),
    'battery-bank is still reachable from a glyph — the hand-over to cell-sound is half-made');
  for (const gone of ['cryo-capsule-occupied', 'cryo-capsule-open']) {
    assert.equal(ITEMS[gone], undefined,
      `${gone} is back in the registry. It was declared ABOVE the paper capsule it was replaced by,\n`
      + 'so a re-added row wins `deriveGlyphToItem`\'s first-wins rule and every capsule on the wreck\n'
      + 'draws warm art again.');
    assert.ok(!Object.values(GLYPH_TO_ITEM).includes(gone), `${gone} is reachable from a glyph`);
  }
  // …and the Battery's own char lands on the sound cell, whose WRECKED twin is the spent one.
  assert.equal(itemIdForGlyphChar('B'), 'cell-sound');
});

// ═════════════════════════════════════════════════════════ 4. THE TWO SURFACES, THROUGH THE MODELS

// ⭐ THE BATTERY'S TWO PICTURES, DRIVEN THROUGH THE JOIN THE SURFACES ACTUALLY CALL. Everything
// above is about tables; this is about what a tile draws. `buildTileItem` is the ONE door both SVG
// surfaces use, so a Battery that stopped switching art would be invisible to every other assertion
// in this file and perfectly visible to a player.
//
// MUTATION: point `WRECKED['cell-sound'].paint` at `cellSound`'s pristine painter ⇒ RED on leg 3.
// MUTATION: raise `WRECK_THRESHOLD` above 1 ⇒ RED on leg 1.
test('a Battery draws the SOUND cell healthy and the SPENT cell wrecked — driven', () => {
  const opts = { idPrefix: 'batt' };
  const fails = [];   // BLINDED (TRAPS 5th shape)
  const healthy = buildTileItem('cell-sound', opts, 255);
  const wrecked = buildTileItem('cell-sound', opts, 10);

  // 1 — THE PICTURES DIFFER AT ALL. A join that ignored `cond` hands back one drawing for both.
  if (healthy === wrecked) {
    fails.push('a pristine Battery and a wrecked one draw the identical picture — the wear join is '
      + 'not consulted for this row at all');
  }
  // 2 — THE HEALTHY ONE IS THE SOUND CELL, and it carries no accent (a working machine says nothing).
  if (healthy !== buildItem('cell-sound', opts)) fails.push('a healthy Battery is not card 33');
  if (healthy.includes(ATTEND)) fails.push('a healthy Battery draws in the fault colour');
  // 3 — THE WRECKED ONE IS THE OWNER'S OWN CARD 34, not ink damage over 33. Compared against the
  // SPENT PIECE's own fragment, re-drawn at the twin's id prefix so only the drawing is in question.
  if (!wrecked.includes(ATTEND)) fails.push('a wrecked Battery draws no oxblood — it is not card 34');
  const spentShapes = (s2) => (s2.match(/<(path|ellipse)\b/g) || []).length;
  if (spentShapes(wrecked) !== spentShapes(buildItem('cell-spent', opts))) {
    fails.push('the wrecked Battery is not the spent cell shape-for-shape — the twin has been '
      + 'redrawn as a damage pass and the design\'s own card 34 has gone unreachable');
  }
  // …and the two capsules do NOT switch on condition, because a pod's state is a GLYPH. A wrecked
  // pod is a wrecked pod, not an open one — the two axes must stay independent.
  if (buildTileItem('capsule-sealed', opts, 10) === buildItem('capsule-open', opts)) {
    fails.push('a wrecked SEALED capsule renders as the OPEN one — condition has been wired to the '
      + 'state axis, and a damaged pod would read as an empty pod');
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});

test('deckDeviceConditions keeps this deck only, and keys by tile like its room-scoped sibling', () => {
  // ⚠️ `open` ARRIVED AT THE MERGE with the OPERATE verb (the seventh tuple element) and is carried
  // here DELIBERATELY rather than defaulted: this fixture predates the field, and a row that simply
  // omitted it would let the model emit `open: 0` for everything while the test went on passing. The
  // deck-1 row is OPEN and both wrong-deck/other rows are SHUT, so the blinded deck-filter leg below
  // now bites on two fields instead of one.
  // ⭐ AND `face` IS CARRIED THE SAME WAY AND FOR THE SAME REASON (2026-08-05). The deck-1 row is
  // TURNED and both the other rows are not, so the blinded deck-filter leg below bites on a third
  // field — and, more to the point, a `face` that this model silently dropped would let the Overview
  // draw every device unturned while the Room Zoom turned it, which is precisely the two-contracts
  // divergence this shape-parity test was written to catch on `open`.
  const rows = [
    { x: 3, y: 4, deck: 1, kind: 8, cond: 10, oper: 0, open: 1, serv: 1, face: 2 },
    { x: 5, y: 4, deck: 1, kind: 13, cond: 250, oper: 1, open: 0, serv: 0, face: 0 },
    { x: 3, y: 4, deck: 2, kind: 8, cond: 200, oper: 1, open: 0, serv: 0, face: 0 },   // same TILE, other deck
  ];
  const d1 = deckDeviceConditions(rows, 1);
  assert.equal(d1.size, 2, 'two devices on deck 1');
  assert.deepEqual(d1.get('3,4'),
    { tx: 3, ty: 4, kind: 8, cond: 10, oper: 0, open: 1, serv: 1, air: 1, spend: -1, face: 2 });
  assert.equal(deckDeviceConditions(rows, 2).size, 1, 'the other deck carries its own one row');
  assert.equal(deckDeviceConditions(rows, 9).size, 0, 'an empty deck is empty, not everything');
  // ⚠️ THE DECK FILTER, BLINDED — CLAUDE.md's fifth trap in miniature. The wrong-deck row above sits
  // on the SAME TILE as a deck-1 row, so a missing filter would FOLD into the existing key and move
  // only the value; `size` would not budge. Assert the value, not the count.
  assert.equal(d1.get('3,4').cond, 10,
    'the deck-2 row overwrote the deck-1 one — the deck filter is gone and every surface would draw\n'
    + 'another deck\'s wear on this one');
  assert.equal(d1.get('3,4').face, 2,
    'the deck-2 row overwrote the deck-1 one — third witness, on the facing.');
  assert.equal(d1.get('3,4').open, 1,
    'the deck-2 row overwrote the deck-1 one — same failure as the line above, caught on `open`\n'
    + 'instead of `cond`. Kept as a SECOND witness because the two fields come from different lanes\n'
    + 'and a future change is unlikely to break both the same way.');
  for (const junk of [null, undefined, 'x', 42, {}]) {
    assert.equal(deckDeviceConditions(/** @type {any} */ (junk), 1).size, 0);
  }
  // The two models must agree in SHAPE, or `wear.js` would see two contracts.
  const room = roomDeviceConditions(rows, { deck: 1, rx: 0, ry: 0, rw: 8, rh: 8 });
  assert.deepEqual([...room.keys()].sort(), [...d1.keys()].sort(),
    'the two models key their tiles differently — `wear.js` would then see two contracts');
  assert.deepEqual(room.get('3,4'), d1.get('3,4'),
    'the room-scoped and deck-scoped models disagree about the same device on the same tile');
});

// THE OVERVIEW, DRIVEN through the real `overviewScene` composer — which is pure, so this needs no
// DOM. A frame carrying one Scrubber glyph, rendered twice: once with the tile pristine on the
// `devices` channel and once wrecked. The twin's own bytes must appear in the second and not in the
// first. Compared against art built with the SURFACE'S OWN idPrefix, so this is what the player gets.
test('the Level-1 Overview paints a wrecked machine as its twin — driven, not scanned', () => {
  const W = 6, H = 5, DECK = 1, TX = 2, TY = 2;
  const cells = new Array(W * H);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];   // '.' floor
  cells[TY * W + TX] = ['S'.charCodeAt(0), 0, 0, 0];                    // Glyphs.ForDevice(Scrubber)
  const frame = { deck: DECK, w: W, h: H, lens: 'none', cells };
  const decksView = [{ deck: DECK, slots: [{ slotIndex: 0, anchorName: 'hold', roomType: 14, rect: { x: 0, y: 0, w: W, h: H }, occupied: true, displayName: 'HOLD' }] }];
  const base = { deck: DECK, decksView, frame, idPrefix: 'ov' };

  // ⚠️ THE ROWS GO IN RAW NOW, not through `deckDeviceConditions`. The plate takes the `devices`
  // channel directly (`ship-fittings.js`) because it draws EVERY deck and that adapter reshapes ONE.
  // The wear join itself is untouched: each row's `cond` still reaches `buildTileItem`, which is
  // still the only door to the 80 post-raid twins. The glyph on the frame is now irrelevant to which
  // piece is drawn — it is left in the fixture deliberately, so that if a later lane re-introduces a
  // frame read this test keeps working rather than going vacuous.
  // ⚠️ KIND 2, NOT KIND 3, AND THE CHANGE IS THE POINT. The old fixture used kind 3 and drew a
  // SCRUBBER anyway, because the picture came from the frame's `'S'` glyph and `kind` was read only
  // for the wear byte — so the fixture was internally inconsistent and nothing could see it. Now the
  // KIND chooses the piece, so it has to be the scrubber's: `DeviceKind 3` is the deck hatch.
  const row = (cond) => [{ x: TX, y: TY, deck: DECK, kind: 2, cond, oper: cond > 25 ? 1 : 0 }];
  const intact = overviewScene({ ...base, devices: row(255) });
  const wrecked = overviewScene({ ...base, devices: row(0) });

  assert.notEqual(intact, wrecked,
    'the Overview renders identically whether the machine is pristine or destroyed — the wear join\n'
    + 'never reached this surface, or `st.deviceCond` is not being threaded into furnitureLayer');

  // NON-VACUITY: the scrubber is really on the frame and really drawn. Without this both scenes
  // could be furniture-free and the inequality above could come from anywhere.
  assert.ok(intact.includes('pl-furniture'), 'the Overview drew no furniture layer at all');
  // The DEVICE-KIND route is what the plate uses now; the glyph equality is kept beside it because
  // `itemForDeviceRow` resolves THROUGH a glyph internally and the two must not drift.
  assert.equal(itemIdForGlyphChar('S'), 'o2-scrubber', 'the fixture glyph no longer resolves');
  assert.equal(itemForDeviceRow({ kind: 2, open: 0 }), 'o2-scrubber',
    'DeviceKind 2 no longer resolves to the scrubber — the fixture is measuring the wrong machine');

  // …and it is the RIGHT twin, byte-identical to what `buildWrecked` gives for that id with the
  // surface's own idPrefix. `notEqual` alone would pass for ANY difference, including a bug.
  // ⭐ THE ID NAMESPACE IS `ov-d<deck>-f<x>-<y>` NOW, not VR-P4's `ov-s<slot>-f<x>-<y>`. The reason
  // the slot segment existed was that each compartment drew into its own nested `<svg>` with its own
  // local viewBox, so two compartments could legitimately carry the same tile coordinates. The
  // elevation draws every compartment on ONE deck plane in ONE coordinate system, so a tile
  // coordinate is unique within a deck and the DECK is what has to be named — the plate now draws
  // two decks at once and tile (2,2) exists on both.
  const opts = { w: 0, h: 0, idPrefix: `ov-d${DECK}-f${TX}-${TY}` };
  const side = /translate\([^)]*\)">(<g class="pl-item">)/.test(wrecked);
  assert.ok(side, 'the furniture layer no longer wraps its pieces the way this test reads them');
  // The side length is a function of the transform, so rebuild with the scene's own by extracting
  // the piece fragment and comparing the DEFS/BODY shape through a size-free probe: both builders
  // are pure in `w`/`h`, so equality of the ID NAMESPACE plus the twin's distinguishing marks is the
  // strongest size-independent statement available here.
  assert.ok(wrecked.includes(`id="ov-d${DECK}-f${TX}-${TY}__0"`),
    'the piece on the device tile is not namespaced by this surface — the fixture missed the tile');
  // ⛔ THE HANDLE IS NO LONGER A COLOUR, AND `sketch: false` IS PART OF THE HANDLE (2026-08-06,
  // lane/warm-purge). This used to take the twin's own FILL VALUES: a warm mock twin was steel over a
  // paper piece, so a fill the pristine drawing never emitted was a size-independent way to say "this
  // surface drew the TWIN". P2b re-authored the twenty-one paper twins in the SAME four colours as
  // their pristine pieces — a twin is that piece's own painter re-run with ink damage added — and the
  // fill diff went EMPTY, so the non-vacuity leg tripped rather than the assertions passing silently.
  // The handle widens to the styling attributes the DAMAGE MARKS carry and the piece's vocabulary
  // does not (`stroke-width="1.7"` is `inkCrack`'s, in no catalogue ramp; `opacity="0.16"` is
  // `inkScorch`'s bloom); all are written pre-transform, so they stay size-independent, which is the
  // property the fill scan was chosen for.
  // ⚠️ AND `sketch: false` IS NOT A DETAIL: `overview-scene.js`'s `fittingLayer` builds plate
  // miniatures RAW (art-style §4's plate exception), and the treatment RE-WRITES stroke widths. Built
  // treated, the marks below are real marks of a real twin that this surface's HTML cannot contain,
  // and the test would fail for a reason that has nothing to do with the join.
  const markOpts = { ...opts, sketch: false };
  const STYLE_ATTR = /(?:fill|stroke-width|stroke-dasharray|opacity)="[^"]+"/g;
  const pieceMarks = buildItem('o2-scrubber', markOpts).match(STYLE_ATTR) || [];
  const only = [...new Set((buildWrecked('o2-scrubber', markOpts).match(STYLE_ATTR) || [])
    .filter((f) => !pieceMarks.includes(f)))];
  assert.ok(only.length > 0,
    'non-vacuity: the twin emits no styling attribute the pristine piece does not — the two loops\n'
    + 'below would then be asserting nothing about which picture this surface drew');
  // ⚠️ AND A MARK THE PRISTINE PLATE ALREADY DRAWS FOR ITS OWN REASONS CANNOT DISCRIMINATE. One
  // does: `opacity="0.85"` is `inkDead`/`inkTear`'s AND the plate architecture's. It is dropped BY
  // MEASUREMENT — the filter is "absent from the intact scene", never a name — so a later mark that
  // collides moves this on its own. ⛔ THE FLOOR IS WHAT KEEPS THE FILTER HONEST: an exclusion that
  // emptied the set would turn the loop below into an assertion about nothing, which is precisely the
  // shape (CLAUDE.md's 4th trap) a scope filter creates when it quietly swallows its own subject.
  const discriminating = only.filter((f) => !intact.includes(f));
  assert.ok(discriminating.length >= 3,
    `only ${discriminating.length} of the twin's ${only.length} own marks are absent from the PRISTINE\n`
    + 'plate, so almost nothing here separates the two pictures. Either the plate started drawing the\n'
    + 'twin always, or the twin stopped adding marks of its own.');
  for (const f of discriminating.slice(0, 3)) {
    assert.ok(wrecked.includes(f),
      `the wrecked scene is missing the twin's own ${f} — the join did not reach this surface`);
  }
});

// ═════════════════════════════════════════════════════════ 5. ONE HOME FOR THE THRESHOLD
//
// ⚠️ THIS TEST EXISTS BECAUSE THE REFERENCE CENSUS IN `devices-model.test.js` CANNOT SEE THIS SHAPE,
// and that was MEASURED, not guessed: planting `if (row && row.cond < 64) { … }` into the shipping
// `furnitureSvg` — a second, independent answer to "which picture" sitting right beside the real
// one — moved no counted identifier and left the whole suite green. A census counts NAMES; a bare
// numeric comparison has none. So the second guard is a scan for the comparison itself.
//
// The rule: OUTSIDE `items/wear.js`, no client module may compare a device condition to a number.
// Reading `row.cond` and handing it to `buildTileItem` is the whole permitted vocabulary.
const SURFACES = ['ui/roomzoom-view.js', 'ui/overview-scene.js', 'ui/overview-view.js', 'ui/room-model.js'];
const THRESHOLD_SHAPE = /\bcond\b\s*(?:[<>]=?|===|!==|==|!=)\s*-?\d|-?\d\s*(?:[<>]=?|===|!==|==|!=)\s*[\w.]*\bcond\b/;

test('the wreck threshold has exactly ONE home — no surface compares a condition to a number', () => {
  // INCLUSION FLOOR FIRST, as a planted violation rather than a population count (CLAUDE.md trap 4).
  // Every spelling below is a real way to write a second threshold, and the matcher must catch each
  // one on its own — otherwise "found nothing" is indistinguishable from "cannot look".
  for (const plant of [
    'if (row && row.cond < 64) draw();',
    'if (row.cond <= 63) draw();',
    'const bad = d.cond >= 64 ? a : b;',
    'if (64 > row.cond) draw();',
    'if (cond === 0) draw();',
  ]) {
    assert.match(plant, THRESHOLD_SHAPE, `the matcher misses this second threshold: ${plant}`);
  }
  // …and it must NOT fire on the permitted vocabulary, or the only way to pass is to stop using the
  // channel at all.
  for (const ok of [
    'buildTileItem(c.itemId, opts, row ? row.cond : undefined);',
    "out.set(tx + ',' + ty, { cond: d.cond | 0 });",
    'const row = cond.get(key);',
  ]) {
    assert.doesNotMatch(ok, THRESHOLD_SHAPE, `the matcher fires on legitimate code: ${ok}`);
  }

  for (const rel of SURFACES) {
    const src = codeOnly(readFileSync(join(HERE, '..', 'src', rel), 'utf8'));
    assert.ok(src.length > 200, `client/src/${rel} stripped to nothing — this scan is vacuous`);
    assert.doesNotMatch(src, THRESHOLD_SHAPE,
      `client/src/${rel} compares a device condition to a NUMBER. That is a second answer to "below\n`
      + 'what condition does a tile wear its twin?", and two answers is how the two SVG surfaces come\n'
      + 'to disagree about the same machine with every test green — the hand-mirror defect that\n'
      + 'shipped the device-sprite bug. Ask `client/src/items/wear.js`; it is the only home.');
  }

  // And the one place that IS allowed to hold it must really hold it — otherwise this whole test is
  // satisfied by a codebase in which nothing anywhere knows the threshold.
  // ⚠️ NOT `THRESHOLD_SHAPE` — and the difference is the point rather than an exemption. The home
  // compares `cond` to the NAMED constant, never to a digit, so the very matcher that catches a
  // second threshold does not match the first one. Asserting the named comparison is the stronger
  // statement anyway: it fails if the join is dismantled AND if the constant is inlined.
  const wear = codeOnly(readFileSync(join(HERE, '..', 'src', 'items', 'wear.js'), 'utf8'));
  assert.match(wear, /\bcond\s*<\s*WRECK_COND_BYTE\b/,
    'items/wear.js no longer compares a condition to WRECK_COND_BYTE. Either the join is gone — in\n'
    + 'which case nothing draws the twins and this whole test passes vacuously — or the constant was\n'
    + 'inlined as a digit, which would make the home indistinguishable from the violations above.');
});

// ⚠️ THIS LEG IS A SOURCE SCAN AND NOT A DRIVEN TEST, WHICH IS A WEAKER THING — said out loud
// because the gap was MEASURED, not suspected. Deleting the `deviceCond:` line from
// `overview-view.js` kills the wear join on the Level-1 Overview outright, and the ENTIRE node suite
// stayed green (924 pass / 0 fail): the driven Overview test above hands `overviewScene` a map
// directly, so it exercises the COMPOSER and can say nothing about the VIEW that feeds it. That is
// "verb parity is NOT sufficient" in its exact shape — the composer is present and correct, and its
// presence was all anything checked.
//
// `overview-view.js` has no test rig in this repo (it touches `document` at import time and owns a
// large DOM skeleton), so building one is a package of its own. The `marks` channel met the same wall
// and answered it the same way (`marks-model.test.js`, "overview-view.js feeds the scene from the
// marks channel, not from the frame"); this follows that precedent rather than inventing a second
// pattern. It is comment-stripped and carries its own negative control, so it cannot be satisfied by
// a commented-out line — but it CANNOT tell a correct wiring from a wiring that merely looks right.
test('overview-view.js feeds the scene from the devices CHANNEL, not from the frame', () => {
  const src = codeOnly(readFileSync(join(HERE, '..', 'src', 'ui', 'overview-view.js'), 'utf8'));
  assert.ok(src.length > 200, 'overview-view.js stripped to nothing — this scan is vacuous');
  // ⚠️ THE SCANNED EXPRESSION CHANGED WITH THE PLATE'S FITTING SOURCE, and the claim under it did
  // NOT. It used to be `deviceCond: deckDeviceConditions(decodeDevices(Hud.getDevices()), deck)` — a
  // PER-DECK reshaping of the `devices` channel, which could only ever describe one deck. The side
  // elevation draws every deck, so the view now hands the scene the RAW decoded rows and
  // `ship-fittings.js` selects per deck (carrying each row's own `cond` into `buildTileItem`, which
  // is still the one wear join). What must not be lost is the WIRING: without `devices` reaching the
  // scene, every machine on the plate draws intact no matter how wrecked it is — silently, and with
  // every other assertion in this file still green.
  assert.match(src, /devices:\s*decodeDevices\(Hud\.getDevices\(\)\)/,
    'client/src/ui/overview-view.js must hand the SCENE the decoded `devices` channel. Without it\n'
    + '`st.devices` is undefined, `deckFittings` returns an empty Map, and the plate draws NO\n'
    + 'machines at all — and, before that, no wear.');
  // NEGATIVE CONTROL, both comment forms, each with a LATER REAL COMMENT so a stripper that gives up
  // at the first marker is caught rather than flattered (CLAUDE.md's stripper trap).
  assert.doesNotMatch(
    codeOnly('// devices: decodeDevices(Hud.getDevices()),\nconst live = 1;\n'),
    /devices:\s*decodeDevices/,
    'a line comment survived codeOnly — this scan is satisfiable by a commented-out wiring');
  assert.doesNotMatch(
    codeOnly('const s = "/*";\n/* devices: decodeDevices(Hud.getDevices()), */\nconst live = 1;\n'),
    /devices:\s*decodeDevices/,
    'a quoted block-comment opener blinded codeOnly, or the REAL later comment survived it');
});

// ⭐⭐ THE OWNER'S 2026-08-05 DEFECT ON THE *OTHER* SURFACE — AND ITS WHOLE CLASS IS NOW GONE FROM
// THE PLATE, WHICH IS A STRONGER RESULT AND A WEAKER TEST, SO SAY BOTH OUT LOUD.
//
// WHAT THIS TEST USED TO DRIVE. The plate's `miniContents` read `NON_FURNITURE` off the same
// one-glyph-per-tile FRAME the Room Zoom did, so `GlyphMapper` pass 5 writing `Glyphs.Citizen` over a
// device glyph deleted the machine under a standing pawn — on both surfaces. The plate carried a
// REPAIR for it: a `CITIZEN_GLYPH_CODE` arm that reached into the `devices` channel for exactly the
// occluded tile. Leg 2 below drove that arm.
//
// WHAT IS TRUE NOW. The side elevation does not read frame glyphs for fittings at ALL — it takes
// `devices` + `items` directly (`ship-fittings.js`, whose header carries the tile-for-tile
// measurement that made the substitution safe, and the fog argument that kept it honest). So there is
// no glyph to be overwritten and no repair to drive: the pawn cannot occlude anything, whatever the
// frame says. The legs are therefore re-aimed at the property that still has to hold — THE PLATE'S
// FITTINGS COME FROM THE CHANNEL AND CARRY ITS STATE — and leg 2 is re-stated as a HOSTILE FRAME:
// the frame says `Citizen` on the tile and the plate must draw the machine anyway.
//
// ⚠️ AND THE HONEST LOSS IS NAMED: this file no longer instruments a `CITIZEN_GLYPH_CODE` arm,
// because `overview-scene.js` no longer has one. The Room Zoom's copy of that arm is STILL LIVE and
// is still instrumented — by `devices-model.test.js` and by `room-model.test.js`'s `roomCells`
// legs — so the repair has not become untested; it has become untested HERE, on the surface that
// stopped needing it.
//
// MUTATION: make `deckFittings` skip device rows ⇒ RED on legs 1 and 2.
// MUTATION: make `itemForDeviceRow` ignore `open` ⇒ RED on leg 3.
// MUTATION: make `deckFittings` emit a row for a tile with no channel entry ⇒ RED on leg 4.
test('THE PLATE\'S FITTINGS ARE THE CHANNEL\'S (driven): a hostile frame cannot delete a machine', () => {
  const W = 6, H = 5, DECK = 1, TX = 2, TY = 2;
  const floor = () => {
    const cells = new Array(W * H);
    for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];
    return cells;
  };
  const decksView = [{ deck: DECK, slots: [{ slotIndex: 0, anchorName: 'hold', roomType: 14, rect: { x: 0, y: 0, w: W, h: H }, occupied: true, displayName: 'HOLD' }] }];
  const scene = (cells, rows) => overviewScene({
    deck: DECK, decksView, frame: { deck: DECK, w: W, h: H, lens: 'none', cells }, idPrefix: 'ov',
    devices: rows,
  });
  const POD = (open) => [{ x: TX, y: TY, deck: DECK, kind: 27, cond: 255, oper: 1, open }];
  const ID = `id="ov-d${DECK}-f${TX}-${TY}__0"`;
  const fails = [];

  // 1 — PRECONDITION: an ordinary floor frame + a pod on the channel ⇒ the plate draws the pod.
  const plain = floor();
  const alone = scene(plain, POD(0));
  if (!alone.includes(ID)) {
    fails.push('precondition: the plate draws no piece on the pod tile at all — this leg is vacuous');
  }

  // 2 — THE HOSTILE FRAME: `Glyphs.Citizen` (64) at `GlyphColor.Crew` (5), byte for byte what pass 5
  //     writes over a device. The plate must be indifferent to it.
  const pawned = floor(); pawned[TY * W + TX] = [64, 5, 0, 0];
  const occupied = scene(pawned, POD(0));
  if (!occupied.includes(ID)) {
    fails.push('THE PLATE LOST THE MACHINE UNDER A PAWN GLYPH. The elevation must not read frame '
      + 'glyphs for fittings at all — see ship-fittings.js.');
  }
  if (occupied !== alone) {
    fails.push('the plate draws DIFFERENTLY for a hostile frame and a plain one — some part of the '
      + 'fitting layer is still reading `frame.cells`, which is the defect this source change removes');
  }

  // 3 — AND THE STATE IS THE CHANNEL'S, not a default. An `open` pod must not draw shut.
  if (scene(plain, POD(1)) === alone) {
    fails.push('an OPEN and a SHUT pod render identically — the source ignores the `open` bit the '
      + 'wire carries, and every cycled capsule on the plate would read as sealed');
  }

  // 4 — NO GHOST: no device row, no piece, whatever the frame says.
  if (scene(pawned, []).includes(ID)) {
    fails.push('the plate draws a machine that is not on the channel — the source is a cache');
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});
