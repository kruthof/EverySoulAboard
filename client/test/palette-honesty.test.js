// ⭐⭐ EVERY BUILD BUTTON ANSWERS HONESTLY — the four silences of the Level-2 palette, driven.
//
// THE REPORT THIS FILE EXISTS FOR (owner, live play 2026-08-03): *"I cannot build anything except
// the walls."* A driven audit the same night found four separate causes behind one symptom, and NOT
// ONE of them was a broken verb:
//
//   1. FURNITURE COSTS 3 PARTS AND THE SHIP HAS 1. `PlaceDeviceCommand` pays
//      `defs.Build.DevicePlaceCost` (`sim/Sim.Core/Commands/Commands.cs`, the `TryPay` line) out of
//      LOOSE ground stacks; `--ship wreck` boots holding ONE Parts unit against a price of THREE, so
//      the refusal is true from tick 0 — 1 < 3, with nothing else having to happen.
//      ⚠️ An earlier draft added "and `MaintenanceSystem` has spent it by ~tick 201", which is FALSE
//      of the state the player boots into (corrected 2026-08-04, measured twice by independent
//      agents): tick 201 is `MECHANICS.md` reporting an UNATTENDED day with the work grid granted,
//      and under OD-H every work type boots OFF, so `MaintenanceSystem` refuses at
//      `!citizen.CanTakeWorkType(WorkType.Repair)` (`MachineWearSystem.cs:534`) and the unit is not
//      spent until the player grants Repair. The defect is unchanged either way.
//      Every furniture click on the shipped ship was refused, and refused
//      SILENTLY — no toast, no status change (`GameSession.HandlePlace` writes `"place bunk"`
//      whether it worked or not), and no price or Parts balance anywhere in the Room Zoom.
//   2. FLOOR'S DEFAULT DRAG IS A GUARANTEED NO-OP. The picker pre-selects material byte 0
//      (`defaultMaterials`), byte 0 IS the authored floor, and `BuildSystem.CanDesignate` refuses an
//      identity re-floor. Driven: the default drag painted nothing; the same drag with WOOD painted
//      five tiles.
//   3. SHELF AND RUG REACHED NO SIM AT ALL. They wrote into a module-local `_decor` array and drew
//      it; the host's `BuildDecor()` returns a permanently empty static list. Fake art for furniture
//      the ship did not have — a button that LIES, which is worse than one that is dead.
//   4. Consequently nothing on the surface priced anything. `invisible-feedback-is-FUNCTIONAL`.
//
// WHAT IS ASSERTED HERE, AND HOW. The four answers are driven through the SHIPPED controller over
// `dom-lite` — real `initRoomZoom`, real `buildChrome` markup, real delegated click handler, real
// sweep gesture — and read back off rendered chrome (the toast's text, the cost row's text, the
// `#rz-layers` markup) or off the payloads that reach the injected `send`. Never off module state:
// "the palette shows its price" is a claim about what a player can SEE, and a state-inspection
// version of it would pass on `main`.
//
// EVERY MULTI-LEG TEST IS BLINDED (TRAPS, fifth shape): `assert` throws, so a dead second leg looks
// exactly like a live one. Legs collect into an array and one assertion reports them all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  U, deckSlots, ROOM_TOOLS, TOOL_LABEL, paletteCommand, roomScene, scenePlacement,
} from '../src/ui/room-model.js';
import {
  DEVICE_PLACE_COST_PARTS, PLACE_CURRENCY_WORD, DECOR_NOT_WIRED, DECOR_CHIP_TEXT,
  chipCostText, paletteCostRow, placeRefusalText, decorRefusalText,
  isPlaceTool, isDecorTool, toolPlaceCost, placeIsUnaffordable,
} from '../src/ui/build-cost-model.js';
import {
  defaultMaterials, materialLabel, allTilesAlreadyMaterial, FLOOR_MATERIALS,
} from '../src/ui/build-material-model.js';
import { codeOnly } from './code-only.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';
import { stylesSource } from './styles-source.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const repoSrc = (rel) => readFileSync(join(REPO, rel), 'utf8');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. WHERE THE PRICE COMES FROM — the cross-language pin.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ NO WIRE CHANNEL CARRIES `device_place_cost`. The `ledger` channel carries the matter census and
// `metrics` carries loose material units; no message on this socket carries a build def, and adding
// one to price a button would be a `WireFormat` spine change for a constant that has moved once in
// the project's life. So the client MIRRORS the value — and a mirror is only safe when it is pinned
// against its original.
//
// ⭐ THE PRECEDENT IS `BLOCKED_ORDER_NAMES` (`client/test/blocked-model.test.js`, the ⭐⭐ paragraph),
// and specifically the half of that story that MATTERS: the hand-written `deepEqual` half of that
// pin was green for four days while the client was missing an order name the host had been emitting
// since M2-9, because a literal is only ever as current as the hand that last widened it. The fix
// there was to DERIVE the expectation from the authority and require agreement. That is what these
// two legs do — the def FILE the game ships and the C# DEFAULT the sim boots from, read, parsed, and
// required to agree with each other and with the constant this client prints.
//
// MUTATION: `DEVICE_PLACE_COST_PARTS = 2` ⇒ RED on both legs.
// MUTATION: `device_place_cost = 4` in content/core/SimDefs/build.def ⇒ RED on the def-file leg
//           (and on P4/P5 in the dotnet gate, which is the point: the two move together or not).

test('the palette prices a placement at the DEF\'s number — derived from both authorities, not typed', () => {
  const fails = [];

  // (a) THE SHIPPED DEF FILE. Comments are stripped first: `build.def` discusses `device_place_cost`
  // in three comment lines before assigning it once, and a scan that reads a comment as an assignment
  // is CLAUDE.md trap 1 wearing an ini file.
  const defText = repoSrc('content/core/SimDefs/build.def')
    .split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');
  const defHits = [...defText.matchAll(/^\s*device_place_cost\s*=\s*(\d+)\s*$/gm)].map((m) => Number(m[1]));
  // NON-VACUITY BY INCLUSION (traps, 4th shape): a parse that matched nothing passes every
  // comparison below without making one.
  if (defHits.length !== 1) {
    fails.push(`content/core/SimDefs/build.def yields ${defHits.length} assignments of ` +
      '`device_place_cost` (expected exactly 1) — the parse below is reading nothing, or reading twice');
  } else if (defHits[0] !== DEVICE_PLACE_COST_PARTS) {
    fails.push(`build.def prices a placement at ${defHits[0]} PARTS and this client prints ` +
      `${DEVICE_PLACE_COST_PARTS}. A palette that quotes the wrong price is worse than one that ` +
      'quotes none: it sends the player to count out a cost the sim will not charge.');
  }

  // (b) THE SIM'S OWN DEFAULT. `SimDefs.CreateDefault` is what a host with no content pack boots
  // from, and it is the value folded into determinism pins P4/P5. Code-only, for trap 1's reason.
  const csText = codeOnly(repoSrc('sim/Sim.Core/Defs/SimDefs.cs'));
  const csHits = [...csText.matchAll(/DevicePlaceCost\s*=\s*(\d+)\s*,/g)].map((m) => Number(m[1]));
  if (csHits.length !== 1) {
    fails.push(`sim/Sim.Core/Defs/SimDefs.cs yields ${csHits.length} initialisers for ` +
      '`DevicePlaceCost` (expected exactly 1) — this leg is reading nothing');
  } else if (csHits[0] !== DEVICE_PLACE_COST_PARTS) {
    fails.push(`SimDefs.CreateDefault prices a placement at ${csHits[0]} and this client prints ` +
      `${DEVICE_PLACE_COST_PARTS}`);
  }

  // (c) AND THE TWO AUTHORITIES MUST AGREE WITH EACH OTHER. If the def file and the C# default ever
  // diverge, "which one is the price" stops having an answer and this client cannot mirror either.
  if (defHits.length === 1 && csHits.length === 1 && defHits[0] !== csHits[0]) {
    fails.push(`the shipped def says ${defHits[0]} and the sim's default says ${csHits[0]}`);
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ⛔ THE CURRENCY, PINNED FOR THE SAME REASON THE NUMBER IS. `PlaceDeviceCommand.Currency` is the
// ItemKind the price is charged in, and it is the word this palette prints beside the number. A lane
// that retunes placement to Seals and leaves this client saying PARTS produces a sentence that is
// precisely, confidently wrong — and the ledger row the player would go and check is a different one.
// MUTATION: `Currency = ItemKind.Seals` in Commands.cs ⇒ RED.
test('the price is quoted in the consumable the sim actually spends', () => {
  const cs = codeOnly(repoSrc('sim/Sim.Core/Commands/Commands.cs'));
  const m = /public\s+const\s+ItemKind\s+Currency\s*=\s*ItemKind\.(\w+)\s*;/.exec(cs);
  assert.ok(m, 'no `PlaceDeviceCommand.Currency` declaration found in Commands.cs — this leg is ' +
    'reading nothing, which is how it would pass over a currency change');
  assert.equal(m[1].toUpperCase(), PLACE_CURRENCY_WORD,
    `the sim charges placements in ${m[1]} and this palette prints "${PLACE_CURRENCY_WORD}"`);
});

// ⭐ THE ONE CONVENTION `allTilesAlreadyMaterial` INHERITS FROM THE HOST: a tile ABSENT from the
// sparse `materials` channel carries material 0. If the emitter ever started shipping every tile, or
// started omitting a different value, the floor no-op detector would answer about a plane nobody is
// projecting. Derived off the emitter's own predicate rather than restated.
// MUTATION: change `if (mat == 0) continue;` to `if (mat == 255) continue;` ⇒ RED.
test('the sparse `materials` channel omits exactly the DEFAULT byte — the client\'s fallback', () => {
  const cs = codeOnly(repoSrc('hosts/web/GameSession.cs'));
  const body = /private List<\(int, int, int, int, int\)> BuildMaterials\(\)([\s\S]*?)\n        \}/.exec(cs);
  assert.ok(body, 'BuildMaterials() was not found in GameSession.cs — this leg reads nothing');
  assert.match(body[1], /if\s*\(\s*mat\s*==\s*0\s*\)\s*continue\s*;/,
    'the `materials` emitter no longer skips exactly material 0. `allTilesAlreadyMaterial` treats a ' +
    'tile with no row as byte 0 — the same convention, stated on the other side of the wire. If the ' +
    'emitter\'s default moved, the FLOOR no-op sentence is now being decided against the wrong plane.');
});

// ⛔⭐ THE RULE THAT WAS SILENTLY DEAD FOR TWO MEASUREMENT RUNS, and this leg is its receipt rather
// than a hypothetical. The block comment introducing the chip's price rules was written in two
// edits and the second landed AFTER the closing `*/`, so a paragraph of prose sat in selector
// position. CSS error recovery then reads a selector up to the next `{` and DISCARDS the block it
// finds there — which was `.rz-tool.costed{…}`. Nothing went red: the stylesheet still parsed, the
// page still rendered, the price still appeared (the `display:block` rules below the casualty
// survived), and only a `getComputedStyle` read in real Chrome showed `padding: 8px 13px` — the
// BASE rule — where the new one should have been. Two full rig runs were measured against a tree
// where the rule under test did not exist.
//
// So: comment balance, and the RULE'S OWN PRESENCE in the parsed output. A structural check, because
// "is this rule alive" is exactly what a reader of the file cannot tell.
// MUTATION: delete the final `*/` of that block comment ⇒ RED on both legs.
test('the chip\'s price rules are actually PARSED — a stray comment cannot swallow them', () => {
  const css = stylesSource();
  const fails = [];

  // (a) balance, scanned as a stream so a stray closer is caught as well as a missing one.
  let depth = 0, i = 0, strays = 0;
  for (;;) {
    const o = css.indexOf('/*', i), c = css.indexOf('*/', i);
    if (o < 0 && c < 0) break;
    if (o >= 0 && (c < 0 || o < c)) { depth++; i = o + 2; } else { depth--; i = c + 2; if (depth < 0) { strays++; depth = 0; } }
  }
  if (depth !== 0) fails.push(`styles.css ends inside a comment (depth ${depth}) — every rule after the opener is dead`);
  if (strays) fails.push(`styles.css carries ${strays} stray \`*/\` — the prose after each one sits in selector position`);

  // (b) the rules exist as RULES. Comments are removed the way a parser removes them — PAIRED, so a
  // stray `*/` leaves its prose behind IN SELECTOR POSITION, which is precisely the bug: the rule's
  // name then reads as a suffix of a long nonsense selector and this lookup misses it.
  const rules = new Map();
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.set(m[1].trim().replace(/\s+/g, ' '), m[2]);
  }
  for (const sel of ['.rz-tool.costed', '.rz-tool-cost', '.rz-tool.cant .rz-tool-cost', '.rz-cost-line.fault']) {
    if (!rules.has(sel)) fails.push(`\`${sel}\` is not a parsed rule in styles.css — it was swallowed`);
  }
  // …and the one property whose absence is invisible on screen but changes the box.
  const costed = rules.get('.rz-tool.costed') || '';
  if (!/flex-direction\s*:\s*column/.test(costed)) {
    fails.push('`.rz-tool.costed` no longer stacks its two lines — the price would sit beside the label ' +
      'and widen an eighteen-tool wrapping row instead of adding one short line under it');
  }
  // NON-VACUITY BY INCLUSION: the parse must find the rules this file did NOT write, or it is
  // finding nothing and every membership test above is free.
  for (const sel of ['.rz-tool', '.rz-hint']) {
    if (!rules.has(sel)) fails.push(`the rule parse missed the pre-existing \`${sel}\` — it is reading nothing`);
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE FOUR SENTENCES — the pure model, driven at its boundaries.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('a furniture button states its price and the ship\'s stock', () => {
  const fails = [];

  if (chipCostText('bunk') !== '3 PARTS') fails.push('the BUNK chip reads "' + chipCostText('bunk') + '"');
  if (chipCostText('heater') !== '3 PARTS') fails.push('the HEATER chip reads "' + chipCostText('heater') + '"');
  // A tool that spends nothing says nothing — a price line on WALL or DIG would be an invented fact.
  for (const tool of ['wall', 'floor', 'door', 'dig', 'stockpile', 'strip', 'erase', 'move', 'demolish']) {
    if (chipCostText(tool) !== '') fails.push(`${tool.toUpperCase()} carries a cost line ("${chipCostText(tool)}") and spends nothing`);
  }

  const rich = paletteCostRow('bunk', 7);
  if (rich.text !== 'BUNK ▸ 3 PARTS · 7 ABOARD') fails.push('an affordable BUNK reads: "' + rich.text + '"');
  if (rich.level !== '') fails.push('an affordable BUNK is painted as a fault');

  // THE SHIPPED WRECK'S OWN NUMBER. This is the state the owner was in.
  const poor = paletteCostRow('bunk', 1);
  if (poor.text !== 'BUNK ▸ NEEDS 3 PARTS — SHIP HAS 1') fails.push('the wreck\'s BUNK reads: "' + poor.text + '"');
  if (poor.level !== 'fault') fails.push('an unaffordable BUNK is not painted as a fault');

  // NON-VACUITY BY INCLUSION: the stock number must actually come from the argument. Two different
  // balances that produced one sentence would mean the row is printing a constant.
  if (paletteCostRow('bunk', 7).text === paletteCostRow('bunk', 9).text) {
    fails.push('two different Parts balances produce the same sentence — the row is not reading stock');
  }
  // …and the TOOL must reach the sentence too.
  if (paletteCostRow('bunk', 7).text === paletteCostRow('desk', 7).text) {
    fails.push('BUNK and DESK produce the same sentence — the row is not reading the tool');
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});

// MUTATION: `placeIsUnaffordable` → `cost > 0 && units(partsAboard) <= cost` (an off-by-one that
//           refuses at exactly the price) ⇒ RED on the boundary leg.
// MUTATION: drop the `if (!placeIsUnaffordable(...)) return '';` guard so the sentence LATCHES ⇒ RED
//           on the clears-when-affordable leg.
test('a refusal says why, and it CLEARS the moment the ship can pay', () => {
  const fails = [];

  if (placeRefusalText('bunk', 0) !== 'BUNK ▸ NEEDS 3 PARTS — SHIP HAS 0') {
    fails.push('an empty ship reads: "' + placeRefusalText('bunk', 0) + '"');
  }
  if (placeRefusalText('bunk', 2) !== 'BUNK ▸ NEEDS 3 PARTS — SHIP HAS 2') {
    fails.push('one Part short reads: "' + placeRefusalText('bunk', 2) + '"');
  }
  // ⭐ THE BOUNDARY IS THE WHOLE OF THE SECOND HALF OF THE PLAYER SENTENCE. `TryPay` spends when
  // `Affordable >= cost`, so EXACTLY the price is affordable, and a palette that still refused there
  // would be telling the player they cannot do the thing they can.
  if (placeRefusalText('bunk', DEVICE_PLACE_COST_PARTS) !== '') {
    fails.push('a ship holding EXACTLY the price is still refused: "' +
      placeRefusalText('bunk', DEVICE_PLACE_COST_PARTS) + '"');
  }
  if (placeRefusalText('bunk', 99) !== '') fails.push('a rich ship is refused');

  // A refusal is never invented for a tool that spends nothing.
  for (const tool of ['wall', 'floor', 'dig', 'erase', 'move', 'demolish', 'shelf', 'rug']) {
    if (placeRefusalText(tool, 0) !== '') {
      fails.push(`${tool.toUpperCase()} produced a PARTS refusal ("${placeRefusalText(tool, 0)}") and spends no Parts`);
    }
  }

  // Defensive reads: a census that has not arrived is 0 aboard, never a crash and never a free build.
  for (const missing of [undefined, null, NaN, -4]) {
    if (!placeIsUnaffordable('bunk', missing)) fails.push(`a ${String(missing)} census reads as affordable`);
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});

// MUTATION: restore `_decor = addDecor(...)` in roomzoom-view's cosmetic branch ⇒ RED in §3's
//           driven leg (fake art returns), not here — this leg owns the WORDS.
test('SHELF and RUG say what they are, and no other tool borrows the sentence', () => {
  const fails = [];
  if (decorRefusalText('shelf') !== 'SHELF ▸ ' + DECOR_NOT_WIRED) fails.push('SHELF says: "' + decorRefusalText('shelf') + '"');
  if (decorRefusalText('rug') !== 'RUG ▸ ' + DECOR_NOT_WIRED) fails.push('RUG says: "' + decorRefusalText('rug') + '"');
  if (chipCostText('shelf') !== DECOR_CHIP_TEXT) fails.push('the SHELF chip reads "' + chipCostText('shelf') + '"');
  if (paletteCostRow('shelf', 999).level !== 'fault') fails.push('a rich ship makes SHELF look buildable');
  for (const tool of ROOM_TOOLS.filter((t) => !isDecorTool(t))) {
    if (decorRefusalText(tool) !== '') fails.push(`${tool.toUpperCase()} claims to be unwired decor`);
  }
  // The census is DERIVED from the palette's own table, so a lane that adds a third cosmetic tool
  // is caught here rather than shipping a third silent liar.
  const decor = ROOM_TOOLS.filter(isDecorTool);
  if (decor.join(',') !== 'shelf,rug') {
    fails.push(`the cosmetic class is now [${decor}] — a tool joined or left it. Every member must ` +
      'reach the sim or say that it does not; M4-6 owns the wire-or-remove ruling.');
  }
  const place = ROOM_TOOLS.filter(isPlaceTool);
  // ⭐ 7 → 10, 2026-08-04: GROWBED, MEDBED and TABLE joined the palette (`room-model.js`'s ROOM_TOOLS
  // pin carries the decision). They are here rather than in a list of their own BECAUSE this census
  // is derived — the whole point of the derivation is that a lane which adds a place tool without
  // pricing it is caught, and the loop two lines down is what does the catching. The three arrive
  // priced for free: `build-cost-model.js` asks `paletteCommand(tool).cls === 'functional'`, never a
  // table of names, so a `functional` row IS a priced row by construction.
  if (place.join(',') !== 'bunk,desk,chair,locker,lamp,plant,heater,growbed,medbed,table') {
    fails.push(`the priced class is now [${place}] — re-derive, and check the new member is priced`);
  }
  for (const t of place) if (toolPlaceCost(t) !== DEVICE_PLACE_COST_PARTS) fails.push(`${t} is priced at ${toolPlaceCost(t)}`);
  assert.deepEqual(fails, [], fails.join('\n'));
});

// MUTATION: `allTilesAlreadyMaterial` → `tiles.some(...)` instead of every-tile ⇒ RED on the mixed leg.
// MUTATION: default the empty tile list to `true` ⇒ RED on the empty leg.
test('the FLOOR no-op is detected all-or-nothing, over the sim\'s own material plane', () => {
  const fails = [];
  const T = (...xy) => xy.map(([x, y]) => ({ x, y }));
  const tiles = T([4, 4], [5, 4], [6, 4]);

  // An untouched deck ships an EMPTY sparse layer, so every tile is byte 0 — the default the picker
  // pre-selects. This is the wreck at boot and it is the owner's exact drag.
  if (!allTilesAlreadyMaterial(tiles, [], 1, 0)) fails.push('the default drag on an untouched deck is not detected as a no-op');
  // Pick WOOD over the same tiles and every one of them changes — nothing to say.
  if (allTilesAlreadyMaterial(tiles, [], 1, 1)) fails.push('a WOOD drag over steel-tan floor was called a no-op');
  // A MIXED sweep commits something and must stay quiet.
  const mixed = [{ deck: 1, x: 4, y: 4, mat: 1 }];
  if (allTilesAlreadyMaterial(tiles, mixed, 1, 0)) fails.push('a sweep with one wood tile in it was called a total no-op');
  // …and once the whole run is wood, a WOOD drag is the no-op.
  const allWood = tiles.map((t) => ({ deck: 1, x: t.x, y: t.y, mat: 1 }));
  if (!allTilesAlreadyMaterial(tiles, allWood, 1, 1)) fails.push('a WOOD drag over wood floor is not detected');
  // Rows on ANOTHER deck are not this deck's floor.
  const otherDeck = tiles.map((t) => ({ deck: 2, x: t.x, y: t.y, mat: 1 }));
  if (!allTilesAlreadyMaterial(tiles, otherDeck, 1, 0)) fails.push('a row from deck 2 was read as deck 1');
  // An empty sweep proves nothing.
  if (allTilesAlreadyMaterial([], [], 1, 0)) fails.push('an EMPTY sweep was reported as a no-op');

  // The named material has to be the one the picker shows, or "pick another material" points nowhere.
  if (materialLabel('floor', 0) !== 'STEEL-TAN') fails.push('floor byte 0 is named "' + materialLabel('floor', 0) + '"');
  if (materialLabel('floor', 1) !== 'WOOD') fails.push('floor byte 1 is named "' + materialLabel('floor', 1) + '"');
  if (defaultMaterials().floor !== FLOOR_MATERIALS[0].mat) fails.push('the picker no longer pre-selects the first floor material');

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. DRIVEN THROUGH THE SHIPPED SURFACE — real controller, real markup, real gestures.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE RIG IS `room-model.test.js`'s, kept to the minimum this package needs: `dom-lite` does not
// parse markup, so `RzEl` lifts every `<button>`/`<span>` START TAG out of an assigned `innerHTML`
// into a real element carrying its classes, dataset and attributes — flat, ignoring nesting. That is
// exactly enough to reach `_el.toolBtns`, the material chips and the cost row, and no more.
//
// ⚠️ THE SCANNER'S FLATNESS IS WHY THE COST LINE IS A `<span>` INSIDE THE BUTTON RATHER THAN A
// PSEUDO-ELEMENT. A `::after{content:"3 PARTS"}` would be invisible to every node harness in this
// repo AND to `textContent`, so the price would be unassertable anywhere but a screenshot.

const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures/overview-grid.json'), 'utf8'));
const fixView = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))), decodeRooms(decode(JSON.stringify(FIX.rooms))));
const wreck = FIX.frameDeck1;
const DECK1 = 1;

const TAG_RE = /<(button|span)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

class RzEl extends DomEl {
  constructor(doc, tag) {
    super(doc, tag);
    this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 }; this._scanned = [];
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v); this.childNodes = []; this._scanned = [];
    for (const m of this._html.matchAll(TAG_RE)) {
      const el = new RzEl(this.ownerDocument, m[1]);
      for (const a of m[2].matchAll(ATTR_RE)) {
        el.setAttribute(a[1], a[2]);
        if (a[1] === 'class') el.className = a[2];
        else if (a[1].startsWith('data-')) el.dataset[a[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
      }
      el.parentNode = this;
      this._scanned.push(el);
    }
  }
  querySelector(sel) { const a = this.querySelectorAll(sel); return a.length ? a[0] : null; }
  querySelectorAll(sel) {
    if (typeof sel !== 'string' || !sel.startsWith('.')) return [];
    const cls = sel.slice(1);
    return this._scanned.filter((e) => e.classList.contains(cls));
  }
  getBoundingClientRect() { return this._rect; }
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

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-cost', 'rz-minimap',
  'rz-hint', 'rz-ctx',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
  's-speed', 's-msg', 's-runstate', 's-pauselabel', 'b-pause', 's-speedchip',
];

function makeRzDoc() {
  const d = new RzDoc();
  for (const id of RZ_IDS) { const e = new RzEl(d, 'div'); e._id = id; d.register(id, e); }
  return d;
}
function makeRzWindow(bag) {
  return { addEventListener(t, fn) { (bag[t] = bag[t] || []).push(fn); }, removeEventListener() {} };
}

const doc = makeRzDoc();
globalThis.document = doc;
const winListeners = {};
globalThis.window = makeRzWindow(winListeners);
// `setTimeout` is real here; the toast clears itself after 2600 ms, well past any assertion.

const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const slot = deckSlots(fixView, DECK1).find((e) => e.anchorName === 'hold');
assert.ok(slot, 'deck-1 slot `hold` is missing from the fixture');
const HOLD = { deck: DECK1, rx: slot.rect.x, ry: slot.rect.y, rw: slot.rect.w, rh: slot.rect.h };

const sent = [];
const api = RoomZoom.initRoomZoom({ send: (o) => sent.push(o) });
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
Hud.renderFrame(wreck);
api.enter('hold');
// ⭐ VR-P3 — TILE → POINTER, THROUGH THE SHIPPED PROJECTION. The Level-2 surface is a cabinet-oblique
// cutaway now, so the plan view's `(tx - rx) * U + U/2` points at a tile several metres from the one
// it names. These two go through `roomScene`/`scenePlacement` — the same objects the layers are
// drawn with — so the point a test clicks IS the point the tile is drawn at. The rect is the scene's
// own viewBox at 1:1, which makes `sceneFit` the identity (the old rig's `s = 1` trick, restated).
const sceneRectFor = (focus) => {
  const vb = roomScene(focus).viewBox;
  return { left: 0, top: 0, width: vb.w, height: vb.h };
};
const scenePointFor = (focus, tx, ty) => {
  const [x, y] = scenePlacement(roomScene(focus), focus).foot(tx, ty);
  // ROUNDED, because a projected floor centre is fractional and several legs below compare a
  // pixel string the view wrote with `toFixed(0)` against arithmetic done on this point. Half a
  // pixel at the centre of a ~95-px tile cannot change which tile the inverse answers.
  return { clientX: Math.round(x), clientY: Math.round(y) };
};

doc.getElementById('rz-layers')._rect = sceneRectFor(HOLD);

const canvas = doc.getElementById('rz-canvas');
const root = doc.getElementById('roomzoom-view');
const palette = doc.getElementById('rz-palette');
const costRow = doc.getElementById('rz-cost');
const toastEl = doc.getElementById('rz-toast');
const layers = doc.getElementById('rz-layers');

// `makeRzDoc` registers every chrome node by id and parents NONE of them, so a click on a real
// palette button would die at the palette instead of reaching the delegated handler on the root.
// Parenting them is what the shipped DOM already does (`#rz-palette` and `#rz-matstrip` both live
// inside `.rz-palette-wrap` inside `#roomzoom-view`), and it is what lets these tests drive the
// SHIPPED buttons and swatches rather than stand-ins the rig built itself.
palette.parentNode = root;
doc.getElementById('rz-matstrip').parentNode = root;

/** Dispatch an event the way the controller's own listeners receive it — bubbling up the real
 *  parent chain, exactly as `room-model.test.js`'s sibling rig does. */
function fire(el, type, ev) {
  const e = {
    type, target: el, button: 0, clientX: 0, clientY: 0,
    preventDefault() {}, stopPropagation() { e.propagationStopped = true; }, ...ev,
  };
  let n = el;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) { fn(e); if (e.propagationStopped) return e; }
    n = n.parentNode;
  }
  return e;
}

/** ⭐ AN ORDINARY PRESS ON THE CANVAS — `pointerdown` then `pointerup`, the PAIR the Room Zoom
 *  resolves a single-press gesture on since BUG-B was closed at Level 2 (roomzoom-view.js, the ⛔⛔
 *  block above `_el`). ⛔ `fire(canvas, 'click', …)` no longer reaches ANY handler: the canvas has
 *  no `click` listener at all, because `click` is the event Chrome does not fire when a repaint
 *  lands between down and up — which on this surface is nearly every press (measured 2/30). */
function press(el, extra) {
  fire(el, 'pointerdown', { button: 0, ...extra });
  return fire(el, 'pointerup', { button: 0, ...extra });
}
/** ⚠️ `innerHTML`, NOT `textContent`. The scanner lifts START TAGS and ignores text, and the
 *  controller writes these rows with `innerHTML`, so `textContent` is '' for every one of them —
 *  a rig that read it would report every sentence as absent and every absence as proven. */
const stripTags = (html) => String(html || '').replace(/<[^>]*>/g, '').trim();
/** Canvas coordinates for a tile in the focused room. */
const at = (tx, ty) => scenePointFor(HOLD, tx, ty);
/** Arm a tool by clicking its SHIPPED palette button. */
function armViaButton(tool) {
  const b = palette.querySelectorAll('.rz-tool').find((x) => x.dataset.rztool === tool);
  assert.ok(b, `no ${tool} button in the shipped palette markup`);
  fire(b, 'click', { target: b });
  return b;
}
/**
 * Set the ship's Parts census the way the host does, then WAIT for the surface to repaint.
 *
 * ⚠️ THE AWAIT IS LOAD-BEARING AND IS NOT A SLEEP. `renderLedger` notifies the ship subscribers,
 * which `scheduleRepaint` coalesces onto a frame (`requestAnimationFrame`, or a 16 ms timer where
 * there is no browser). A rig that read the palette on the same turn would read the PREVIOUS
 * balance and would go green against a surface that never updates at all.
 */
/** Let the coalesced repaint run — the `decor` channel has no notifier of its own, so a frame
 *  dispatch is what a live client's next 10 Hz message would do anyway. */
async function repaintOnce() {
  Hud.renderFrame(wreck);
  await new Promise((r) => setTimeout(r, 40));
}
async function setParts(n) {
  Hud.renderLedger({ type: 'ledger', tick: 1, window: 600, matter: n > 0 ? [['Parts', n]] : [], crew: 1 });
  await new Promise((r) => setTimeout(r, 40));
}
/** Press-drag-release across a tile run — the sweep gesture, exactly as a player makes it. */
function sweep(a, b) {
  fire(canvas, 'mousedown', { target: canvas, ...at(a[0], a[1]) });
  fire(canvas, 'mousemove', { target: canvas, ...at(b[0], b[1]) });
  for (const fn of (winListeners.mouseup || [])) fn({ button: 0, ...at(b[0], b[1]) });
}
const toastText = () => toastEl.textContent;
const costText = () => (costRow.hidden ? '' : stripTags(costRow.innerHTML));
/** The first floor tile of the focused room, from the fixture's own frame. */
function floorTiles(n) {
  const out = [];
  for (let y = HOLD.ry; y < HOLD.ry + HOLD.rh && out.length < n; y++) {
    for (let x = HOLD.rx; x < HOLD.rx + HOLD.rw && out.length < n; x++) {
      const cell = wreck.cells[y * wreck.w + x];
      if (Array.isArray(cell) && (cell[0] | 0) === 46) out.push([x, y]);
    }
  }
  assert.equal(out.length, n, `the fixture room has fewer than ${n} plain floor tiles`);
  return out;
}

// ── the palette markup itself ────────────────────────────────────────────────────────────────

// MUTATION: drop the `<span class="rz-tool-cost">` from `buildChrome` ⇒ RED.
test('DRIVEN: the shipped palette markup carries a price on every priced tool', () => {
  const fails = [];
  const btns = palette.querySelectorAll('.rz-tool');
  if (btns.length !== ROOM_TOOLS.length) {
    fails.push(`the scanner found ${btns.length} tool buttons, not ${ROOM_TOOLS.length} — every leg below is vacuous`);
  }
  const costs = palette.querySelectorAll('.rz-tool-cost');
  const expected = ROOM_TOOLS.filter((t) => chipCostText(t) !== '').length;
  if (costs.length !== expected) fails.push(`${costs.length} cost lines in the markup, expected ${expected}`);
  // ⚠️ READ OFF THE BUILDER'S OWN STRING. The scanner lifts start tags and drops text, so the
  // spans' `textContent` is '' here whatever the palette says — an assertion on it would pass over
  // a palette that printed nothing at all.
  const texts = [...palette.innerHTML.matchAll(/<span class="rz-tool-cost">([^<]*)<\/span>/g)]
    .map((m) => m[1]).sort();
  const want = ROOM_TOOLS.map(chipCostText).filter(Boolean).sort();
  if (JSON.stringify(texts) !== JSON.stringify(want)) {
    fails.push(`the markup's cost lines are ${JSON.stringify(texts)}, expected ${JSON.stringify(want)}`);
  }
  // Every tool button is still a real button that starts unpressed — the second span must not have
  // displaced the attributes the palette-overflow package pinned.
  if ((palette.innerHTML.match(/<button type="button" class="rz-tool/g) || []).length !== ROOM_TOOLS.length) {
    fails.push('a tool is no longer a `<button type="button">` whose class STARTS with rz-tool');
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});

// ── answer 1: the price is on the surface, live ──────────────────────────────────────────────

// MUTATION: delete the `paintCostRow()` call from `arm()` ⇒ RED (the row never appears).
// MUTATION: `partsAboard()` → `() => 99` ⇒ RED (the wreck's own balance stops reaching the sentence).
test('DRIVEN: arming a furniture tool prices it against the ship the player is on', async () => {
  const fails = [];

  await setParts(1);                                   // the shipped wreck at boot
  armViaButton('bunk');
  if (costText() !== 'BUNK ▸ NEEDS 3 PARTS — SHIP HAS 1') fails.push('the armed cost row reads: "' + costText() + '"');
  const bunkBtn = palette.querySelectorAll('.rz-tool').find((b) => b.dataset.rztool === 'bunk');
  if (!bunkBtn.classList.contains('cant')) fails.push('the BUNK chip does not wear the cannot-pay state');
  if (bunkBtn.getAttribute('title') !== 'BUNK ▸ NEEDS 3 PARTS — SHIP HAS 1') {
    fails.push('the chip hover reads: "' + bunkBtn.getAttribute('title') + '"');
  }

  // THE SHIP FINDS SOME PARTS — the sentence must FOLLOW, not latch.
  await setParts(9);
  if (costText() !== 'BUNK ▸ 3 PARTS · 9 ABOARD') fails.push('after a resupply the row reads: "' + costText() + '"');
  if (bunkBtn.classList.contains('cant')) fails.push('the BUNK chip still reads as unaffordable at 9 Parts');

  // A tool that spends nothing hides the row entirely — no invented price anywhere on the palette.
  armViaButton('bunk');                          // disarm
  armViaButton('dig');
  if (costText() !== '') fails.push('DIG shows a cost row: "' + costText() + '"');
  if (!costRow.hidden) fails.push('the cost row is still on screen with an unpriced tool armed');
  armViaButton('dig');                           // disarm

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ── answer 2: a refused click says why ───────────────────────────────────────────────────────

// MUTATION: drop the `if (line) toast(line);` line in `onPlaceRefused` ⇒ RED (silent again).
// MUTATION: gate the send on affordability (`if (!refused) _send(...)`) ⇒ RED on the still-sends leg.
test('DRIVEN: a placement the ship cannot pay for SAYS SO — and the command still goes', async () => {
  const fails = [];
  const [tile] = floorTiles(1);

  await setParts(1);
  armViaButton('bunk');
  sent.length = 0;
  toastEl.textContent = '';
  press(canvas, { target: canvas, ...at(tile[0], tile[1]) });

  // ⭐⭐ THE PRESS ITSELF SAYS NOTHING NOW, AND THAT IS THE CHANGE. The client used to compose a
  // refusal from the `ledger` census — an UPPER BOUND on what `TryPay` can spend, right about one
  // refusal class out of six and blind to the other five. The SIM says why, on `placerefused`, and
  // this surface only relays it. So the first assertion is that the press is quiet…
  if (toastText() !== '') fails.push('the press composed its own refusal again: "' + toastText() + '"');
  // …and the second is that the SIM'S answer is what the player reads. This is the shipped host's
  // own payload shape (`WireFormat.PlaceRefused`), fed through the shipped relay.
  api.placeRefused({ x: tile[0], y: tile[1], deck: DECK1, kind: 5, reason: 6, price: 3, affordable: 1 });
  if (toastText() !== 'BUNK ▸ NEEDS 3 PARTS WITHIN REACH — ONLY 1 IS LOOSE ABOARD') {
    fails.push('the sim\'s refusal reached the player as: "' + toastText() + '"');
  }
  // ⛔ THE CLIENT NEVER GATES THE WIRE. The host is the only authority on whether a placement
  // happens; a census up to a second stale that withheld the command would refuse a LEGAL placement,
  // re-creating the silent no-op from the other side.
  const places = sent.filter((o) => o && o.cmd === 'place');
  if (places.length !== 1) fails.push(`${places.length} place commands were sent, expected exactly 1`);
  // ⭐ THE ARGUMENT AT THE SEAM, not the verb (CLAUDE.md trap 4, and this exact payload's own
  // history: `prioritise-menu.test.js` once asserted `cmd === 'place'` and never its `kind`, which
  // is how a LIVE, SHIPPED, TOTAL failure of this verb survived — M3-10 passed the sim enum member
  // where the host expects the wire string, and every furniture click did nothing, silently).
  else if (places[0].kind !== 'bunk') fails.push('the command carried kind "' + places[0].kind + '"');

  // AND IT CLEARS. Same tool, same tile, a ship that can pay: no refusal.
  await setParts(9);
  toastEl.textContent = '';
  sent.length = 0;
  press(canvas, { target: canvas, ...at(tile[0], tile[1]) });
  // No `placerefused` arrives for a placement the sim accepts — so the box stays as it was. The
  // sentence CANNOT appear on its own any more, which is the point: silence here is now the sim's
  // silence rather than the client's guess agreeing with it by luck.
  if (toastText().includes('NEEDS')) fails.push('an affordable placement is still refused: "' + toastText() + '"');
  if (!sent.some((o) => o && o.cmd === 'place')) fails.push('an affordable placement sent no command');

  armViaButton('bunk');                          // disarm
  assert.deepEqual(fails, [], fails.join('\n'));
});

// ⭐⭐ THE OUTCOME LEG FOR THE THREE TOOLS ADDED 2026-08-04 — GROWBED, MEDBED and TABLE, driven
// through the SHIPPED palette button on the SHIPPED controller, from arming to the wire.
//
// ⚠️ WHY IT IS NOT ENOUGH THAT `build-cost-model.js` ASKS THE CLASS. That is the DESIGN — a
// `functional` row is a priced row by construction, no table of names anywhere — and it is exactly
// the kind of claim that reads as obviously true and ships broken: the chip's price line is written
// ONCE by `buildChrome` and never repainted, the `.cant` state and the `title` are written by
// `paintPalette`, and the armed row by `paintCostRow` — three different code paths, none of which
// this package touched. A row that reached the palette table and none of those three would be a
// button that arms, prices nothing, and refuses silently: the owner's original complaint, wearing a
// new tool. So the affordances are MEASURED on the new rows rather than inherited on paper.
//
// ⚠️ AND THE PAYLOAD IS RECORDED AT THE SEAM (trap 4). The wire string is the one thing about these
// three rows that CANNOT be verified from inside the client — `prioritise-menu.test.js` derives the
// accepted vocabulary from `GameSession.TryFurnitureKind`'s own switch and pins every functional row
// against it; this leg's job is that the click actually EMITS the row's `kind`, unchanged, once.
//
// MUTATION: give any of the three `cls: 'cosmetic'` in room-model.js ⇒ RED (the chip reads NOT YET,
//           the click toasts the decor sentence, and no place command goes).
// MUTATION: hand-write `kind: 'GrowBed'` (the enum member) on the growbed row ⇒ RED here on the
//           payload leg, and RED in prioritise-menu.test.js's host derivation. That is M3-10's
//           shipped bug reproduced on a new tool.
// MUTATION: drop any of the three from ROOM_TOOLS ⇒ RED at `armViaButton` (no such button).
/**
 * The `.rz-tool-cost` text inside ONE tool's button, sliced out of the palette's own markup string,
 * or null when that button carries no cost line. See the ⚠️ at leg 1 for why the node cannot answer.
 */
function chipFragment(tool) {
  const html = palette.innerHTML;
  const i = html.indexOf(`data-rztool="${tool}"`);
  if (i < 0) return null;
  const end = html.indexOf('</button>', i);
  const m = /<span class="rz-tool-cost">([^<]*)<\/span>/.exec(html.slice(i, end < 0 ? undefined : end));
  return m ? m[1] : null;
}

// NON-VACUITY FOR THE SLICER, and it is not a formality: `chipFragment` returns null both when a
// button has no price AND when the slice missed the button entirely, and the leg above reports both
// as "ABSENT". An unpriced tool must read null and a priced one must read the price, or the leg is
// asserting that a lookup which finds nothing found nothing.
test('the palette-markup slicer attributes a price to the RIGHT chip', () => {
  assert.equal(chipFragment('bunk'), '3 PARTS', 'the slicer cannot find the price on a tool that has had one since the honesty package');
  assert.equal(chipFragment('dig'), null, 'DIG has no cost line and the slicer invented one — it is reading past the button');
  assert.equal(chipFragment('shelf'), DECOR_CHIP_TEXT, 'the slicer does not see the decor chip line');
  assert.equal(chipFragment('no-such-tool'), null);
});

test('DRIVEN: GROWBED, MEDBED and TABLE arm, price, refuse honestly, and send their own kind', async () => {
  const fails = [];
  const tiles = floorTiles(3);

  await setParts(1);                                   // the state the owner played
  for (const [i, tool] of ['growbed', 'medbed', 'table'].entries()) {
    const label = TOOL_LABEL[tool];
    const want = `${label} ▸ NEEDS 3 PARTS — SHIP HAS 1`;
    const btn = armViaButton(tool);

    // 1. the chip itself — the constant price line, built once by `buildChrome`.
    // ⚠️ READ OFF THE PALETTE'S OWN MARKUP STRING, NOT OFF THE BUTTON NODE. `dom-lite`'s scanner
    // lifts START TAGS and keeps no children, so `btn.innerHTML` is undefined for every one of the
    // twenty-one buttons — an assertion on it reports ABSENT against a palette that prints the price
    // correctly (measured: all three legs fired on the shipped tree). The sibling markup test above
    // regexes `palette.innerHTML` for the same reason; this slices ONE button's fragment out of it so
    // the price is attributed to the right chip rather than merely present somewhere on the bar.
    if (chipFragment(tool) !== '3 PARTS') {
      fails.push(`${label}: the chip's own cost line is ${chipFragment(tool) === null ? 'ABSENT' : '"' + chipFragment(tool) + '"'}, not "3 PARTS"`);
    }
    // 2. the live half — `paintPalette`'s `.cant` class and hover sentence
    if (!btn.classList.contains('cant')) fails.push(`${label}: the chip does not wear the cannot-pay state at 1 Part`);
    if (btn.getAttribute('title') !== want) fails.push(`${label}: the chip hover reads "${btn.getAttribute('title')}"`);
    // 3. the armed row — `paintCostRow`, the answer BEFORE the click
    if (costText() !== want) fails.push(`${label}: the armed cost row reads "${costText()}"`);

    // 4. the click: one command, carrying THIS row's wire kind, and a toast that names the tool
    const tile = tiles[i];
    sent.length = 0;
    toastEl.textContent = '';
    press(canvas, { target: canvas, ...at(tile[0], tile[1]) });
    // The PREVIEW (chip, hover, cost row) is still the client's own ledger reading — legs 1-3 above
    // assert exactly that, and it is legitimate BEFORE the gesture. The VERDICT is the sim's, and it
    // arrives on `placerefused`; the press itself is silent.
    if (toastText() !== '') fails.push(`${label}: the press composed its own refusal: "${toastText()}"`);
    api.placeRefused({ x: tile[0], y: tile[1], deck: DECK1, kind: 5, reason: 6, price: 3, affordable: 1 });
    if (toastText() !== `${label} ▸ NEEDS 3 PARTS WITHIN REACH — ONLY 1 IS LOOSE ABOARD`) {
      fails.push(`${label}: the sim's refusal reached the player as "${toastText()}"`);
    }
    const places = sent.filter((o) => o && o.cmd === 'place');
    if (places.length !== 1) fails.push(`${label}: ${places.length} place commands were sent, expected 1`);
    else if (places[0].kind !== paletteCommand(tool).kind) {
      fails.push(`${label}: the command carried kind "${places[0].kind}", not "${paletteCommand(tool).kind}"`);
    } else if (places[0].x !== tile[0] || places[0].y !== tile[1]) {
      fails.push(`${label}: the command landed at ${places[0].x},${places[0].y} not ${tile[0]},${tile[1]}`);
    }

    // 5. …and it FOLLOWS the ship's balance rather than latching
    await setParts(9);
    if (costText() !== `${label} ▸ 3 PARTS · 9 ABOARD`) {
      fails.push(`${label}: after a resupply the row reads "${costText()}"`);
    }
    if (btn.classList.contains('cant')) fails.push(`${label}: the chip still reads unaffordable at 9 Parts`);
    await setParts(1);
    armViaButton(tool);                                // disarm
  }

  // NON-VACUITY BY INCLUSION: the three sentences must actually DIFFER from one another. Three
  // identical strings would mean the row is printing a constant and every leg above is free.
  const rows = ['growbed', 'medbed', 'table'].map((t) => paletteCostRow(t, 1).text);
  if (new Set(rows).size !== 3) fails.push(`the three tools produce ${new Set(rows).size} distinct sentences: ${JSON.stringify(rows)}`);

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ── answer 3: the FLOOR default drag ─────────────────────────────────────────────────────────

// MUTATION: `const floorNoOp = false` ⇒ RED (the default drag goes silent again).
// MUTATION: make the toast unconditional (drop the `floorNoOp` branch's guard) ⇒ RED on the WOOD leg.
test('DRIVEN: the FLOOR default drag says why it painted nothing — and WOOD does not', () => {
  const fails = [];
  const run = floorTiles(3);

  Hud.renderMaterials({ type: 'materials', cells: [] });   // an untouched deck: every tile is byte 0
  armViaButton('floor');
  sent.length = 0;
  toastEl.textContent = '';
  sweep(run[0], run[run.length - 1]);

  if (toastText() !== 'FLOOR ▸ ALREADY STEEL-TAN — PICK ANOTHER MATERIAL') {
    fails.push('the default floor drag said: "' + toastText() + '"');
  }
  // ⚠️ THE COMMANDS STILL GO — the client says what the sim will do, it does not decide it.
  if (!sent.some((o) => o && o.cmd === 'build')) fails.push('the default drag sent no build commands at all');

  // PICK WOOD through the SHIPPED material chip, and the sweep reports what it built.
  const wood = doc.getElementById('rz-matstrip').querySelectorAll('.rz-mat-chip')
    .find((c) => c.getAttribute('data-rzmat') === '1');
  if (!wood) fails.push('no WOOD chip in the shipped material strip — the leg below is vacuous');
  else {
    fire(wood, 'click', { target: wood });
    toastEl.textContent = '';
    sent.length = 0;
    sweep(run[0], run[run.length - 1]);
    if (toastText().includes('ALREADY')) fails.push('a WOOD drag over steel-tan floor said: "' + toastText() + '"');
    if (!toastText().startsWith('FLOOR ▸ ')) fails.push('the WOOD drag reported: "' + toastText() + '"');
    if (!sent.some((o) => o && o.cmd === 'build')) fails.push('the WOOD drag sent no build commands');
    // NON-VACUITY: the two sweeps must produce DIFFERENT sentences, or the leg is comparing one
    // state with itself.
    if (toastText() === 'FLOOR ▸ ALREADY STEEL-TAN — PICK ANOTHER MATERIAL') {
      fails.push('the WOOD chip never took — both sweeps produced the same sentence');
    }
  }

  armViaButton('floor');                         // disarm
  assert.deepEqual(fails, [], fails.join('\n'));
});

/**
 * ⭐⭐ THE TOAST NAMES THE MATERIAL THE PLAYER IS HOLDING — not the one the picker booted with.
 *
 * ⛔ THIS LEG EXISTS BECAUSE A MUTATION SURVIVED BOTH INSTRUMENTS (review, 2026-08-04). Hard-code
 * `'ALREADY STEEL-TAN'` into `roomzoom-view.js`'s `floorNoOp` toast — sever the sentence from
 * `materialLabel(drag.tool, material)` entirely — and EVERY leg above stays green (they only ever
 * sweep byte 0, whose label IS `STEEL-TAN`), and the browser rig stays green too because its
 * assertion is `/^FLOOR ▸ ALREADY [A-Z- ]+ — PICK ANOTHER MATERIAL$/`, which a frozen literal
 * satisfies exactly as well as a derived one. Two instruments, one blind spot, and the shipped code
 * DOES derive the name — so nothing pinned the derivation. `materialLabel`'s own unit leg checks
 * that byte 1 is called `WOOD`; what was missing is that the SENTENCE asks it.
 *
 * ⚠️ THE SWEEP MUST STILL BE A PROVEN NO-OP, so the tiles are fed back through the `materials`
 * channel already carrying WOOD — the state a player reaches by flooring a room in wood and then
 * dragging wood over it again. Same code path, same all-or-nothing rule, a DIFFERENT material byte:
 * the only variable is the label, which is the whole point of the leg.
 *
 * MUTATION (physically applied, watched red, reverted): replace `materialLabel(drag.tool, material)`
 * with the literal `'STEEL-TAN'` in the `floorNoOp` toast ⇒ RED HERE ONLY, reading
 * `the WOOD-on-WOOD sweep said: "FLOOR ▸ ALREADY STEEL-TAN — PICK ANOTHER MATERIAL"` — the wrong
 * material named, which is the defect, not a crash.
 */
test('DRIVEN: the FLOOR no-op toast names the ARMED material, not the default one', () => {
  const fails = [];
  const run = floorTiles(3);

  armViaButton('floor');
  const wood = doc.getElementById('rz-matstrip').querySelectorAll('.rz-mat-chip')
    .find((c) => c.getAttribute('data-rzmat') === '1');
  if (!wood) {
    fails.push('no WOOD chip in the shipped material strip — this leg cannot arm a non-default material');
  } else {
    fire(wood, 'click', { target: wood });
    // The whole swept run ALREADY carries WOOD (mat byte 1). Wire order is `[x, y, deck, kind, mat]`
    // with kind 1 = floor, per `decodeMaterials` — the host emitter's own tuple, not a shape of ours.
    Hud.renderMaterials({ type: 'materials', cells: run.map(([x, y]) => [x, y, DECK1, 1, 1]) });
    toastEl.textContent = '';
    sent.length = 0;
    sweep(run[0], run[run.length - 1]);
    const said = toastText();

    if (said !== 'FLOOR ▸ ALREADY WOOD — PICK ANOTHER MATERIAL') {
      fails.push('the WOOD-on-WOOD sweep said: "' + said + '"');
    }
    // ⛔ SAID SEPARATELY AND OUT LOUD, because this is the mutation's exact signature: a frozen
    // literal produces a well-formed sentence naming a material the player is NOT holding, and
    // "pick another material" that points at the wrong swatch is worse than pointing at none.
    if (said.includes('STEEL-TAN')) {
      fails.push('the no-op toast named STEEL-TAN over a sweep armed with WOOD — the sentence is a ' +
        'literal, not the picker\'s label');
    }
    // NON-VACUITY: the detector really did fire (a silent sweep would fail the first leg with '',
    // but this names the other half — that the WOOD chip took and the run really is a no-op).
    if (!said.includes('ALREADY')) {
      fails.push('the WOOD-on-WOOD sweep was not detected as a no-op at all, so the naming leg above ' +
        'is comparing nothing: "' + said + '"');
    }
    // ⚠️ AND THE COMMANDS STILL GO. The client speaks beside the sim, never instead of it.
    if (!sent.some((o) => o && o.cmd === 'build')) fails.push('the WOOD-on-WOOD sweep sent no build commands');
  }

  Hud.renderMaterials({ type: 'materials', cells: [] });  // leave the channel as this file found it
  armViaButton('floor');                                 // disarm
  assert.deepEqual(fails, [], fails.join('\n'));
});

// ── answer 4: SHELF and RUG stop pretending ──────────────────────────────────────────────────

/**
 * ⛔ IS THERE A DECOR GROUP IN THIS MARKUP? — a CLASS-TOKEN match, never `innerHTML.includes`.
 *
 * ⚠️ THE SUBSTRING VERSION WAS THE 4TH-SHAPE TRAP IN MINIATURE (found in review, 2026-08-04):
 * `String.includes('rz-decor')` is satisfied by `class="rz-decorX"`, by `class="not-rz-decor"`, and
 * by the six letters appearing in a `data-` attribute or a comment — so the detector could not tell
 * the group it is looking for from a string that merely contains its name. The planted control one
 * screen below then "passed" on a plant that is not a decor group at all, and the ABSENCE the leg
 * above measures would have been confirmed by a rig that cannot distinguish the two.
 *
 * So: pull every double-quoted `class="…"` value out of the markup, split it on whitespace the way
 * a browser's `classList` does, and require `rz-decor` to be one of the WHOLE TOKENS. That is the
 * same predicate `querySelector('.rz-decor')` applies in the browser rig, which is the point — the
 * node suite and `palette-honesty-shot.mjs` must be asking the same question.
 */
const CLASS_ATTR_RE = /class\s*=\s*"([^"]*)"/g;
const hasDecorGroup = (html) => [...String(html || '').matchAll(CLASS_ATTR_RE)]
  .some((m) => m[1].trim().split(/\s+/).includes('rz-decor'));

// MUTATION: restore `_decor = addDecor(_decor, deck, tile.x, tile.y, pc.itemId)` in the cosmetic
//           branch ⇒ RED on the no-fake-art leg (an `rz-decor` group returns to the layer markup).
test('DRIVEN: a SHELF click draws NOTHING and says it is not buildable yet', async () => {
  const fails = [];
  const [tile] = floorTiles(1);

  armViaButton('shelf');
  if (costText() !== 'SHELF ▸ ' + DECOR_NOT_WIRED) fails.push('the armed SHELF row reads: "' + costText() + '"');

  sent.length = 0;
  toastEl.textContent = '';
  press(canvas, { target: canvas, ...at(tile[0], tile[1]) });

  if (toastText() !== 'SHELF ▸ ' + DECOR_NOT_WIRED) fails.push('the SHELF click said: "' + toastText() + '"');
  // ⛔ THE LIE ITSELF: a decor `<g>` in the rendered layer stack is art for furniture the ship does
  // not have and cannot save. Read off the RENDERED markup, never off `_decor`.
  if (hasDecorGroup(layers.innerHTML)) {
    fails.push('the SHELF click painted local decor art into the layer stack — the lie is back');
  }
  if (sent.length) fails.push(`a cosmetic click sent ${sent.length} wire command(s): ${JSON.stringify(sent)}`);

  // NON-VACUITY BY INCLUSION: this rig CAN see a decor group when one exists, so the absence above
  // is a measurement rather than a rig that never draws decor at all. Fed through the WIRE channel
  // — the layer's real source, and the one M4-6 would wire.
  // The tuple is the WIRE's own order — `[deck, x, y, itemId, yawDeg, variant]`, six elements, per
  // `decodeDecor` — so this control exercises the real decode path rather than a shape of its own.
  Hud.renderDecor({ type: 'decor', items: [[DECK1, tile[0], tile[1], 'rug', 0, 0]] });
  await repaintOnce();
  const sawWireDecor = hasDecorGroup(layers.innerHTML);
  Hud.renderDecor({ type: 'decor', items: [] });
  await repaintOnce();
  if (!sawWireDecor) {
    fails.push('this rig cannot render a decor group AT ALL, so "no fake art" above is vacuous — ' +
      'a search that finds nothing and a search that cannot find anything look identical');
  }
  if (hasDecorGroup(layers.innerHTML)) fails.push('the control decor did not clear');
  // ⭐ AND THE DETECTOR ITSELF IS PINNED, both ways — a predicate this leg's whole absence-claim
  // rests on cannot be taken on trust. The reviewer's plant is the first negative.
  if (hasDecorGroup('<g class="rz-decorX"></g>')) fails.push('`rz-decorX` reads as a decor group');
  if (hasDecorGroup('<g class="not-rz-decor"></g>')) fails.push('`not-rz-decor` reads as a decor group');
  if (hasDecorGroup('<g data-note="rz-decor"></g>')) fails.push('a data- attribute reads as a decor group');
  if (!hasDecorGroup('<g class="rz-decor" pointer-events="none"></g>')) fails.push('the SHIPPED decor group markup is not detected');
  if (!hasDecorGroup('<g class="rz-layer rz-decor"></g>')) fails.push('a decor group carrying a second class is not detected');

  armViaButton('shelf');                          // disarm
  assert.deepEqual(fails, [], fails.join('\n'));
});

// ── the palette's own vocabulary stays one vocabulary ────────────────────────────────────────

test('every sentence this package adds is spoken in the palette\'s existing grammar', () => {
  const fails = [];
  // `TOOL ▸ what happened` is the sweep toast's shape (`WALL ▸ 5 TILES`, `ERASE ▸ NOTHING TO ERASE
  // HERE`), and every new sentence joins it rather than inventing a second form.
  const sentences = [
    placeRefusalText('bunk', 1), decorRefusalText('shelf'), decorRefusalText('rug'),
    paletteCostRow('bunk', 9).text, paletteCostRow('heater', 0).text,
  ];
  for (const s of sentences) {
    if (!/^[A-Z⛏▦⚒↺➤⌫ ]+ ▸ /.test(s)) fails.push(`"${s}" does not open with a tool name and the ▸ separator`);
    if (s !== s.toUpperCase()) fails.push(`"${s}" is not in the surface's upper-case voice`);
    if (/\d\.\d/.test(s)) fails.push(`"${s}" carries a decimal — every number here is an integer count`);
  }
  // The tool name in each sentence is the palette's OWN label, so the toast and the button cannot
  // word one tool two ways.
  if (!placeRefusalText('heater', 0).startsWith(TOOL_LABEL.heater)) fails.push('the refusal renames HEATER');
  // And the priced class is exactly the `functional` palette class — no second list to drift.
  for (const t of ROOM_TOOLS) {
    if (isPlaceTool(t) !== (paletteCommand(t).cls === 'functional')) fails.push(`${t} is priced off a second table`);
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});
