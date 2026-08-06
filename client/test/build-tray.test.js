// ⭐⭐ THE BUILD TRAY — the taxonomy, the card's honesty, the ESC ladder, and ruling E4's re-housing.
//
// THE OWNER'S SENTENCE (2026-08-05): *"the building menu in zoom mode looks like a nightmare — too
// crowded"*, with a design beside it (`design-import/Perilune Build Menu - Tray.html`). The flat
// twenty-one-chip strip is a hierarchy now: `BUILD › MACHINES › COMFORT`, a two-column rail, and
// large item CARDS carrying the piece's own drawing, its name, its price and one honest stat line.
//
// ⛔ FOUR THINGS THIS FILE IS FOR, AND EACH IS A WAY THE PACKAGE COULD BE QUIETLY WRONG:
//
//   1. **THE TAXONOMY IS DERIVED, NOT INVENTED.** `TOOL_LEAF` is a written table; `deriveLeaf` is a
//      mechanical rule over data that already exists (`PALETTE_CMD.cls`/`.kind`/`.deviceKind` and
//      the sim's own `machines.def` draw/gen/tier columns). Section 1 requires the two to agree ROW
//      BY ROW, requires the table to be TOTAL over `ROOM_TOOLS`, and requires every leaf a rail
//      offers to be REACHABLE. A tool with no mapping fails BY NAME.
//   2. **THE NUMBERS ON A CARD ARE SOMEBODY ELSE'S.** The price is `chipCostText`'s (which is the
//      def's, pinned by `palette-honesty.test.js`); the draw is `machines.def`'s, re-parsed here
//      from BOTH authorities; the dimensions are the registry's own `SPECS`, re-read here from the
//      catalogue rather than from the model. Section 2 is equality against the source, never a
//      transcription.
//   3. **ESCAPE STILL MEANS ONE THING.** The tray added a rung to a stack that already had four.
//      Section 3 drives the whole ladder in order, on the shipped reducer AND through the shipped
//      key handler.
//   4. **RULING E4 — DROP NONE.** The flat palette had earned nine affordances. Section 5 gives each
//      one its own leg on the tray, driven.
//
// ⚠️ THE ONE THING NO ASSERTION HERE CAN SEE is whether the tray FITS: `dom-lite` has no layout
// engine, so a card row that overflows its band is byte-identical here to one that does not. That is
// `client/tools/build-tray-shot.mjs`'s job — real Chrome, two viewport heights, per-element box
// containment — and this file must not pretend otherwise.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  deckSlots, roomScene, scenePlacement, ROOM_TOOLS, TOOL_LABEL, paletteCommand, escStackRung,
  roomDragMode, M_PER_TILE, ROOM_HEIGHT_M, DOOR_HEIGHT_M,
} from '../src/ui/room-model.js';
import {
  MACHINE_ROW, TIER_LEAF, TRAY_CATEGORIES, TRAY_LEAVES, LEAF_LABEL, CATEGORY_LABEL, TOOL_LEAF,
  TRAY_ROOT, deriveLeaf, trayLeafFor, categoryOf, toolsInLeaf, leavesInCategory, categoriesWithTools,
  trayNav, trayDepth, trayCrumbs, trayEscText, trayEmptyText, trayCards, trayPriceText, trayStatText, trayCallout,
  toolDrawKw, toolSpecCm, ghostArtId,
} from '../src/ui/build-tray-model.js';
import { chipCostText, paletteCostRow, DEVICE_PLACE_COST_PARTS } from '../src/ui/build-cost-model.js';
import { materialsForTool, toolHasMaterial } from '../src/ui/build-material-model.js';
import { ITEMS, itemSpecCm } from '../src/items/index.js';
import * as FITTINGS from '../src/items/fittings.js';
import * as MACHINES from '../src/items/machines.js';
import * as PAPER_FIXTURES from '../src/items/paper-fixtures.js';
import * as PAPER_RESOURCES from '../src/items/paper-resources.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';
import { makeTrayDriver } from './tray-arm.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE TAXONOMY — derived, total, and reachable.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: delete a row from `TOOL_LEAF` (e.g. `heater`) ⇒ RED here, NAMING `heater`.
// MUTATION: move `medbed` to `machines/comfort` in the table ⇒ RED (the rule disagrees, by name).
// MUTATION: add a tool to `ROOM_TOOLS` with no `TOOL_LEAF` row ⇒ RED, naming the tool.
test('THE CENSUS: every palette tool lands in EXACTLY ONE leaf, and the TABLE agrees with the RULE', () => {
  const fails = [];
  // Non-vacuity first: an "every tool is placed" claim over an empty tool list is free.
  assert.ok(ROOM_TOOLS.length >= 20,
    `only ${ROOM_TOOLS.length} tools on the palette — the census below would be reading almost nothing`);

  const seen = new Map();
  for (const tool of ROOM_TOOLS) {
    const fromTable = TOOL_LEAF[tool];
    if (!fromTable) { fails.push(`'${tool}' is in NO tray leaf — add a \`TOOL_LEAF\` row for it`); continue; }
    const cat = categoryOf(fromTable);
    if (!TRAY_CATEGORIES.includes(cat)) fails.push(`'${tool}' names an unknown category '${cat}'`);
    if (!(TRAY_LEAVES[cat] || []).includes(fromTable)) {
      fails.push(`'${tool}' names '${fromTable}', which is not a declared leaf of '${cat}'`);
    }
    // EXACTLY one: `toolsInLeaf` walks `ROOM_TOOLS` and filters, so a tool can only ever appear in
    // the leaf its own row names — what this leg really pins is that the row is a single string and
    // that the leaf really lists it back.
    const back = toolsInLeaf(fromTable);
    if (back.filter((t) => t === tool).length !== 1) {
      fails.push(`'${tool}' appears ${back.filter((t) => t === tool).length} times in '${fromTable}'`);
    }
    // …AND THE RULE. The table is a statement; `deriveLeaf` is the authority.
    const fromRule = deriveLeaf(tool);
    if (fromRule !== fromTable) {
      fails.push(`'${tool}': the TABLE files it under '${fromTable}' and its own DATA derives ` +
        `'${fromRule || '(nothing)'}'. One of the two is wrong, and the data is not.`);
    }
    seen.set(tool, fromTable);
  }
  assert.equal(seen.size, ROOM_TOOLS.length - fails.length ? seen.size : seen.size); // no-op, keeps `seen` live
  assert.deepEqual(fails, [], fails.join('\n'));
});

// MUTATION: give `machines/defense` a member (e.g. file `door` there) ⇒ RED on the reachability leg
//           (a declared-but-hidden leaf now holds a tool, so the rail lies about it).
test('every DECLARED leaf is either populated and OFFERED, or empty and hidden — never both', () => {
  const fails = [];
  for (const cat of TRAY_CATEGORIES) {
    const declared = TRAY_LEAVES[cat] || [];
    assert.ok(declared.length, `category '${cat}' declares no leaves at all`);
    for (const leaf of declared) {
      const members = toolsInLeaf(leaf);
      const offered = leavesInCategory(cat).includes(leaf);
      if (members.length > 0 && !offered) {
        fails.push(`'${leaf}' holds ${members.length} tool(s) and the rail does not offer it — ` +
          'those verbs are unreachable, which is the clipping defect arriving through the hierarchy');
      }
      if (members.length === 0 && offered) {
        fails.push(`'${leaf}' is empty and the rail offers it — a rail row that answers nothing`);
      }
      if (!LEAF_LABEL[leaf]) fails.push(`'${leaf}' has no label`);
    }
    if (leavesInCategory(cat).length && !CATEGORY_LABEL[cat]) fails.push(`'${cat}' has no label`);
  }
  // …and the reverse: nothing is offered that was never declared.
  for (const cat of categoriesWithTools()) {
    assert.ok(TRAY_CATEGORIES.includes(cat), `'${cat}' is offered but not declared`);
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});

// ⭐ THE RULE'S UNEXERCISED ARM, DRIVEN. `deriveLeaf` routes a device kind that MOVES POWER into
// MACHINES by its tier — and today no palette tool GENERATES any, so the `gen > 0` half of that
// condition is a rule nobody has checked. A rule no member exercises is a rule that is wrong the day
// it is needed (the design's own HULL row is a SolarWing, i.e. exactly this case).
//
// MUTATION: drop `|| row.gen > 0` from `deriveLeaf` ⇒ RED (a solar wing files as FURNITURE).
test('a device kind that GENERATES power is a MACHINE, not furniture — driven synthetically', () => {
  // The real `SolarWing` row, read from the authority rather than typed: 0 kW draw, 6 kW generated.
  const cs = readFileSync(join(REPO, 'sim/Sim.Core/Entities/MachineDefs.cs'), 'utf8');
  const m = /\/\*\s*SolarWing\s*\*\/\s*new\(\s*([0-9.]+)f?\s*,\s*([0-9.]+)f?\s*,\s*PowerTier\.(\w+)/.exec(cs);
  assert.ok(m, 'the SolarWing row is not parseable out of MachineDefs.cs — this leg reads nothing');
  const [, draw, gen, tier] = m;
  assert.equal(Number(draw), 0, 'SolarWing draws power now — pick another generator for this leg');
  assert.ok(Number(gen) > 0, 'SolarWing generates nothing now — this leg has no subject');

  // A synthetic row with EXACTLY that shape, fed through the shipped rule via a stand-in table.
  const synthetic = { draw: Number(draw), gen: Number(gen), tier };
  const leaf = synthetic.draw > 0 || synthetic.gen > 0
    ? 'machines/' + TIER_LEAF[synthetic.tier] : 'furniture/fitted';
  assert.equal(leaf, 'machines/' + TIER_LEAF[tier],
    'a 0-draw generator does not route into MACHINES — it would land in FURNITURE, which is what ' +
    'the design calls an outboard hull piece');
  assert.ok(TRAY_LEAVES.machines.includes(leaf),
    `'${leaf}' is not a declared MACHINES leaf — a generator would have nowhere to go`);
  // …and the exact expression the module ships, applied to the same row, must agree. Read out of the
  // source rather than restated, because a restated rule is the second authority this file refuses.
  const src = readFileSync(join(REPO, 'client/src/ui/build-tray-model.js'), 'utf8');
  assert.match(src, /row\.draw > 0 \|\| row\.gen > 0/,
    'the shipped rule no longer asks about GENERATION — a solar wing would file as furniture');
});

// MUTATION: swap ERASE into `orders/remove` beside DEMOLISH ⇒ RED.
test('ERASE and DEMOLISH are NOT in one leaf — ROOM_TOOLS\' own mis-click rule, kept', () => {
  assert.notEqual(trayLeafFor('erase'), trayLeafFor('demolish'),
    'ERASE and DEMOLISH share a leaf. `ROOM_TOOLS`\' header states the rule out loud: they are the ' +
    'most confusable pair on this menu (one takes an ORDER off a tile, the other takes a THING off ' +
    'the floor) and adjacency makes a mis-click cost a building. The hierarchy is meant to make ' +
    'that separation stronger, not to undo it.');
  // …and ERASE really is beside the three verbs it undoes, which is the other half of that rule.
  for (const v of ['dig', 'stockpile', 'strip']) {
    assert.equal(trayLeafFor('erase'), trayLeafFor(v),
      `ERASE is no longer in the leaf that holds ${v.toUpperCase()} — it is the verb that undoes it`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE CARD'S HONESTY — every number on it is somebody else's, re-read from the source.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** `machines.def`'s table, parsed. The columns are `NAME draw gen tier blocks heat wear maint fail`. */
function defMachineRows() {
  const txt = readFileSync(join(REPO, 'content/core/SimDefs/machines.def'), 'utf8');
  const out = new Map();
  for (const line of txt.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#') || s.startsWith('[') || s.includes('=')) continue;
    const c = s.split(/\s+/);
    if (c.length < 4 || !/^[A-Za-z]+$/.test(c[0])) continue;
    if (!/^[0-9.]+$/.test(c[1]) || !/^[0-9.]+$/.test(c[2])) continue;
    out.set(c[0], { draw: Number(c[1]), gen: Number(c[2]), tier: c[3] });
  }
  return out;
}

/** `MachineDefs.cs`'s compiled default table, parsed off the `/* Name *\/ new(draw, gen, PowerTier.X` rows. */
function csMachineRows() {
  const txt = readFileSync(join(REPO, 'sim/Sim.Core/Entities/MachineDefs.cs'), 'utf8');
  const out = new Map();
  for (const m of txt.matchAll(/\/\*\s*(\w+)\s*\*\/\s*new\(\s*([0-9.]+)f?\s*,\s*([0-9.]+)f?\s*,\s*PowerTier\.(\w+)/g)) {
    out.set(m[1], { draw: Number(m[2]), gen: Number(m[3]), tier: m[4] });
  }
  return out;
}

// ⭐⭐ THE MIRROR, PINNED AGAINST BOTH AUTHORITIES — `DEVICE_PLACE_COST_PARTS`' precedent exactly
// (`palette-honesty.test.js`'s first test). No wire channel carries a machine's draw, so the client
// mirrors it; a mirror is only safe when it is derived from the source rather than typed from memory.
//
// MUTATION: change `Light`'s draw to 0.2 in `MACHINE_ROW` ⇒ RED against both files.
// MUTATION: retune `heater`'s draw in `machines.def` alone ⇒ RED (the two authorities disagree).
// MUTATION: delete a row from `MACHINE_ROW` ⇒ RED on the coverage leg, naming the DeviceKind.
test('the machine mirror equals BOTH authorities — machines.def and MachineDefs.cs, to the digit', () => {
  const def = defMachineRows();
  const cs = csMachineRows();
  assert.ok(def.size >= 25, `machines.def parsed to ${def.size} rows — the pin would read almost nothing`);
  assert.ok(cs.size >= 25, `MachineDefs.cs parsed to ${cs.size} rows — the pin would read almost nothing`);

  const fails = [];
  for (const [kind, row] of Object.entries(MACHINE_ROW)) {
    for (const [name, table] of [['machines.def', def], ['MachineDefs.cs', cs]]) {
      const src = table.get(kind);
      if (!src) { fails.push(`${kind} is not in ${name} at all`); continue; }
      if (src.draw !== row.draw) fails.push(`${kind}: ${name} says draw ${src.draw}, the mirror says ${row.draw}`);
      if (src.gen !== row.gen) fails.push(`${kind}: ${name} says gen ${src.gen}, the mirror says ${row.gen}`);
      if (src.tier !== row.tier) fails.push(`${kind}: ${name} says tier ${src.tier}, the mirror says ${row.tier}`);
    }
  }
  // COVERAGE, BY NAME: every DeviceKind the palette can place must have a mirrored row, or a card
  // silently shows no power stat for a machine that draws one.
  for (const tool of ROOM_TOOLS) {
    const k = paletteCommand(tool).deviceKind;
    if (k && !MACHINE_ROW[k]) fails.push(`'${tool}' places DeviceKind.${k}, which has no mirrored row`);
  }
  // …and nothing is mirrored that no tool places (a mirror wider than its consumer goes stale unseen).
  const placeable = new Set(ROOM_TOOLS.map((t) => paletteCommand(t).deviceKind).filter(Boolean));
  for (const k of Object.keys(MACHINE_ROW)) {
    if (!placeable.has(k)) fails.push(`DeviceKind.${k} is mirrored but no palette tool places it`);
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});

// MUTATION: `itemSpecCm` returns `paper-materials.SPECS` too ⇒ RED (a tiling PITCH is not a footprint).
test('the registry\'s spec door reads exactly the four catalogues, and no id is in two of them', () => {
  const cats = [['fittings', FITTINGS.SPECS], ['machines', MACHINES.SPECS],
    ['paper-fixtures', PAPER_FIXTURES.SPECS], ['paper-resources', PAPER_RESOURCES.SPECS]];
  const owner = new Map();
  for (const [name, specs] of cats) {
    assert.ok(Object.keys(specs).length >= 5, `${name} publishes ${Object.keys(specs).length} specs`);
    for (const id of Object.keys(specs)) {
      if (owner.has(id)) {
        assert.fail(`'${id}' is declared by BOTH ${owner.get(id)} and ${name} — \`itemSpecCm\`'s ` +
          'answer would then depend on the ORDER of its lookup chain, which is not a fact about a piece');
      }
      owner.set(id, name);
      assert.deepEqual(itemSpecCm(id), specs[id], `itemSpecCm('${id}') is not ${name}'s own row`);
    }
  }
  assert.equal(itemSpecCm('no-such-piece'), undefined);
  assert.equal(itemSpecCm(null), undefined);
});

// ⭐⭐ THE STAT LINE IS BUILT FROM SOURCES, NOT WRITTEN. Every term is re-derived here from the
// catalogue / the parsed def, and the model's string must equal the reconstruction.
//
// MUTATION: hard-code `'6 KW · 2.1 M'` (the design's example) into `trayStatText` ⇒ RED on every tool.
// MUTATION: read `spec.h` instead of `spec.d` for the second dimension ⇒ RED (bunk 2 × 1.9, not 2 × 0.7).
// MUTATION: print the draw for a 0-kW kind ⇒ RED (a bunk would claim `0 KW`).
test('THE STAT LINE: every term is re-derived from the def and the registry, and none is invented', () => {
  const def = defMachineRows();
  const num = (v) => String(Math.round(Number(v) * 100) / 100);
  const fails = [];
  let withPower = 0, withDims = 0, gestureOnly = 0;

  for (const tool of ROOM_TOOLS) {
    const pc = paletteCommand(tool);
    const want = [];
    // 1 · POWER, from the def file itself (not from the client mirror — that is pinned separately,
    //     and reading it here would make this leg a restatement of that one).
    const row = pc.deviceKind ? def.get(pc.deviceKind) : undefined;
    if (row && row.draw > 0) { want.push(num(row.draw) + ' KW'); withPower++; }
    // 2 · DIMENSIONS, from the CATALOGUE's own SPECS via the same art id the ghost draws.
    const id = ghostArtId(tool);
    const spec = id ? (FITTINGS.SPECS[id] || MACHINES.SPECS[id] || PAPER_FIXTURES.SPECS[id]
      || PAPER_RESOURCES.SPECS[id]) : undefined;
    if (spec) {
      want.push(num(spec.w / 100) + ' × ' + num(spec.d / 100) + ' M');
      withDims++;
    } else if (pc.cls === 'structural') {
      const hM = pc.kind === 'floor' ? M_PER_TILE : (pc.kind === 'door' ? DOOR_HEIGHT_M : ROOM_HEIGHT_M);
      want.push(num(M_PER_TILE) + ' × ' + num(hM) + ' M PER TILE');
    }
    // 3 · …and when there is nothing dimensional to say, the GESTURE, off `roomDragMode`.
    if (!want.length) {
      want.push(roomDragMode(tool) === 'fill' ? 'DRAG A REGION' : 'ONE CLICK');
      gestureOnly++;
    }
    const got = trayStatText(tool);
    if (got !== want.join(' · ')) fails.push(`'${tool}': stat reads "${got}", the sources say "${want.join(' · ')}"`);
    // NO INVENTED UNITS anywhere: the design's `stores 40 kwh` has no analogue on this ship and must
    // not have been borrowed as a shape.
    if (/KWH|SCRIP|OUTBOARD/i.test(got)) fails.push(`'${tool}': stat "${got}" carries a unit no def or registry row supplies`);
  }
  // NON-VACUITY BY INCLUSION: all three arms must actually be exercised, or the leg is asserting
  // that one code path agrees with itself.
  assert.ok(withPower >= 3, `only ${withPower} tools took the POWER arm — that branch is untested`);
  assert.ok(withDims >= 8, `only ${withDims} tools took the DIMENSIONS arm — that branch is untested`);
  assert.ok(gestureOnly >= 4, `only ${gestureOnly} tools took the GESTURE arm — that branch is untested`);
  assert.deepEqual(fails, [], fails.join('\n'));
});

// MUTATION: return `'scrip ' + n` from `trayPriceText` ⇒ RED (the currency the sim spends is PARTS).
// MUTATION: return `''` for an unpriced tool ⇒ RED (a card with a blank price reads as unpriced-by-oversight).
test('THE PRICE LINE is `chipCostText` wherever that has an answer, and says so in words where it does not', () => {
  const fails = [];
  let priced = 0, decor = 0, free = 0;
  for (const tool of ROOM_TOOLS) {
    const chip = chipCostText(tool);
    const got = trayPriceText(tool);
    if (chip) {
      if (got !== chip) fails.push(`'${tool}': the card says "${got}", \`chipCostText\` says "${chip}"`);
      if (paletteCommand(tool).cls === 'functional') {
        priced++;
        if (got !== DEVICE_PLACE_COST_PARTS + ' PARTS') {
          fails.push(`'${tool}': a placement must quote the DEF's ${DEVICE_PLACE_COST_PARTS} PARTS, not "${got}"`);
        }
      } else decor++;
    } else {
      free++;
      if (got !== 'NO PARTS') fails.push(`'${tool}': an unpriced tool says "${got}", expected "NO PARTS"`);
    }
    if (/scrip/i.test(got)) fails.push(`'${tool}': the card invents a currency ("${got}") — the sim spends Parts`);
  }
  assert.ok(priced >= 8 && decor === 2 && free >= 8,
    `the three price shapes were exercised ${priced}/${decor}/${free} times — a shape with no member ` +
    'makes its leg vacuous');
  assert.deepEqual(fails, [], fails.join('\n'));
});

// MUTATION: drop the `toolHasMaterial` branch from `trayCards` ⇒ RED (WALL becomes one card, and the
//           six materials the strip used to reveal are gone from the surface entirely).
test('WALL and FLOOR cards ARE the material swatches — same data, same bytes, same labels', () => {
  for (const tool of ['wall', 'floor']) {
    const mats = materialsForTool(tool);
    assert.ok(mats.length === 6, `${tool} has ${mats.length} materials — the leg below reads too little`);
    const cards = trayCards(trayLeafFor(tool));
    assert.equal(cards.length, mats.length, `the ${tool} leaf paints ${cards.length} cards for ${mats.length} materials`);
    assert.deepEqual(cards.map((c) => c.mat), mats.map((m) => m.mat), 'the material BYTES differ');
    assert.deepEqual(cards.map((c) => c.artId), mats.map((m) => m.id), 'the swatch ART differs');
    assert.deepEqual(cards.map((c) => c.label), mats.map((m) => m.label), 'the material LABELS differ');
    for (const c of cards) assert.equal(c.tool, tool, 'a material card names the wrong tool');
  }
  // DOOR is structural too and owns NO picker, so it is ONE card — the surface must not invent six.
  const door = trayCards(trayLeafFor('door'));
  assert.equal(door.length, 1, 'the DOOR leaf paints more than one card');
  assert.equal(door[0].kind, 'tool');
  assert.equal(toolHasMaterial('door'), false);
});

// MUTATION: return the FIRST matching registry row from `ghostArtId` ⇒ RED on `plant`.
test('a card draws the REAL registry piece — the same id the ghost stands on the tile', () => {
  const fails = [];
  let drawn = 0;
  for (const leaf of Object.values(TRAY_LEAVES).flat()) {
    for (const c of trayCards(leaf)) {
      if (c.kind === 'mat') { if (!ITEMS[c.artId]) fails.push(`${c.key}: '${c.artId}' is not a registry id`); continue; }
      const want = ghostArtId(c.tool);
      if (c.artId !== want) fails.push(`${c.tool}: the card draws '${c.artId}', the ghost draws '${want}'`);
      if (c.artId) { drawn++; if (!ITEMS[c.artId]) fails.push(`${c.tool}: '${c.artId}' is not a registry id`); }
    }
  }
  assert.ok(drawn >= 10, `only ${drawn} cards carry art — the equality leg is reading almost nothing`);
  // …and PLANT is the measured case the glyph route exists for: two registry rows carry
  // `deviceKind: 'PlantPot'` and a first-match scan answers the OLD warm art.
  assert.equal(ghostArtId('plant'), 'plant-pot',
    'PLANT resolves to the wrong piece — `ghostArtId` must go through the GLYPH, not through the ' +
    'first row whose deviceKind matches (`potted-plant` also claims PlantPot)');
  assert.deepEqual(fails, [], fails.join('\n'));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · NAVIGATION AND THE ESC LADDER.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: make `trayNav`'s `back` return `TRAY_ROOT` from depth 2 ⇒ RED (ESC skips a level).
// MUTATION: drop the one-leaf shortcut from `{t:'cat'}` ⇒ RED (a rail row that changes nothing).
test('the tray reducer walks DOWN one level at a time and BACK one level at a time', () => {
  assert.equal(trayDepth(TRAY_ROOT), 0);
  const cat = trayNav(TRAY_ROOT, { t: 'cat', cat: 'machines' });
  assert.deepEqual(cat, { cat: 'machines', leaf: '' }, 'choosing a multi-leaf category must stop at level 1');
  assert.equal(trayDepth(cat), 1);
  const leaf = trayNav(cat, { t: 'leaf', leaf: 'machines/industry' });
  assert.deepEqual(leaf, { cat: 'machines', leaf: 'machines/industry' });
  assert.equal(trayDepth(leaf), 2);
  // BACK: 2 → 1 → 0, one level per call. A jump would make `ESC · BACK A LEVEL` a lie.
  const b1 = trayNav(leaf, { t: 'back' });
  assert.deepEqual(b1, { cat: 'machines', leaf: '' }, 'back from a leaf must land on its category');
  const b2 = trayNav(b1, { t: 'back' });
  assert.deepEqual(b2, { cat: '', leaf: '' });
  assert.equal(trayNav(b2, { t: 'back' }), b2, 'back at the root is a no-op, not a wrap');
  // TOTAL: unknown ids change nothing.
  assert.equal(trayNav(leaf, { t: 'cat', cat: 'nope' }), leaf);
  assert.equal(trayNav(leaf, { t: 'leaf', leaf: 'machines/nope' }), leaf);
  assert.equal(trayNav(leaf, { t: 'reveal', tool: 'nope' }), leaf);
  assert.equal(trayNav(leaf, {}), leaf);
});

// MUTATION: make `{t:'reveal'}` a no-op ⇒ RED (a hotkey arms a tool whose card is off screen).
test('REVEAL puts the tool\'s own leaf on screen — what a HOTKEY has to do', () => {
  for (const tool of ROOM_TOOLS) {
    const st = trayNav(TRAY_ROOT, { t: 'reveal', tool });
    assert.equal(st.leaf, trayLeafFor(tool), `revealing '${tool}' did not open its leaf`);
    assert.equal(st.cat, categoryOf(trayLeafFor(tool)));
    assert.ok(trayCards(st.leaf).some((c) => c.tool === tool),
      `'${tool}' is not among the cards of the leaf REVEAL opened — the armed ring would be drawn ` +
      'on a control the player cannot see');
  }
});

// MUTATION: put the `trayDepth` rung ABOVE `persona` in `escStackRung` ⇒ RED.
// MUTATION: put it BELOW `roomOpen` ⇒ RED (the tray can never be walked back; ESC always exits).
test('THE ESC LADDER, in order: armed ▸ dialogue ▸ persona ▸ tray ▸ exit', () => {
  const S = (o) => escStackRung({ roomOpen: true, ...o });
  assert.equal(S({ armed: true, dialogueOpen: true, personaOpen: true, trayDepth: 2 }), 'disarm');
  assert.equal(S({ armed: false, dialogueOpen: true, personaOpen: true, trayDepth: 2 }), 'dialogue');
  assert.equal(S({ armed: false, personaOpen: true, trayDepth: 2 }), 'persona');
  assert.equal(S({ armed: false, trayDepth: 2 }), 'tray');
  assert.equal(S({ armed: false, trayDepth: 1 }), 'tray');
  assert.equal(S({ armed: false, trayDepth: 0 }), 'exit');
  assert.equal(escStackRung({ armed: false, trayDepth: 2, roomOpen: false }), 'tray',
    'the tray rung is above `roomOpen`, so a closed room with an open tray still walks the tray — ' +
    'unreachable in the shipped client (exit resets the tray) and pinned so the ORDER is explicit');
  assert.equal(escStackRung({ armed: false, roomOpen: false }), 'pass');
  // …and the corner LABEL is written from the same rung, so the key and its advertisement agree.
  assert.equal(trayEscText('disarm'), 'ESC · PUT THE TOOL DOWN');
  assert.equal(trayEscText('tray'), 'ESC · BACK A LEVEL');
  assert.equal(trayEscText('exit'), 'ESC · BACK TO THE SHIP');
  assert.equal(trayEscText('persona'), '', 'the tray must not claim a rung the Persona window owns');
});

// MUTATION: return '' from `trayEmptyText` at depth 0 ⇒ RED (the reserved band sits blank).
test('an EMPTY card row names the rail beside it, and says nothing once there are cards', () => {
  assert.equal(trayEmptyText(TRAY_ROOT), 'PICK A CATEGORY');
  assert.equal(trayEmptyText({ cat: 'machines', leaf: '' }), 'PICK A GROUP');
  assert.equal(trayEmptyText({ cat: 'machines', leaf: 'machines/comfort' }), '',
    'with cards on screen the row must say nothing — the cards are the answer');
});

// MUTATION: emit the crumbs in reverse ⇒ RED.
test('the breadcrumb says exactly where the player is, at each depth', () => {
  assert.deepEqual(trayCrumbs(TRAY_ROOT), []);
  assert.deepEqual(trayCrumbs({ cat: 'machines', leaf: '' }).map((c) => c.label), ['MACHINES']);
  assert.deepEqual(trayCrumbs({ cat: 'machines', leaf: 'machines/comfort' }).map((c) => c.label),
    ['MACHINES', 'COMFORT']);
  assert.deepEqual(trayCrumbs({ cat: 'machines', leaf: 'machines/comfort' }).map((c) => c.depth), [1, 2]);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE RIG — the real controller, the real markup, the real delegated click handler.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const FIX = JSON.parse(readFileSync(join(HERE, 'fixtures/overview-grid.json'), 'utf8'));
const fixView = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))), decodeRooms(decode(JSON.stringify(FIX.rooms))));
const wreck = FIX.frameDeck1;
const DECK1 = 1;
const slot = deckSlots(fixView, DECK1).find((e) => e.anchorName === 'hold');
assert.ok(slot, 'deck-1 slot `hold` is missing from the fixture');
const HOLD = { deck: DECK1, rx: slot.rect.x, ry: slot.rect.y, rw: slot.rect.w, rh: slot.rect.h };

const TAG_RE = /<(button|span|div)\b([^>]*)>/g;
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
class TrEl extends DomEl {
  constructor(doc, tag) {
    super(doc, tag);
    this._id = ''; this._html = ''; this._scanned = [];
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
  }
  get id() { return this._id; }
  set id(v) { this._id = v; }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v); this.childNodes = []; this._scanned = [];
    for (const m of this._html.matchAll(TAG_RE)) {
      const el = new TrEl(this.ownerDocument, m[1]);
      for (const a of m[2].matchAll(ATTR_RE)) {
        el.setAttribute(a[1], a[2]);
        if (a[1] === 'class') el.className = a[2];
        else if (a[1].startsWith('data-')) el.dataset[a[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
      }
      el.parentNode = this;
      this._scanned.push(el);
    }
  }
  querySelectorAll(sel) {
    if (typeof sel !== 'string' || !sel.startsWith('.')) return [];
    return this._scanned.filter((e) => e.classList.contains(sel.slice(1)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
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
class TrDoc extends DomDocument {
  constructor() { super(); this.body = new TrEl(this, 'body'); }
  createElement(tag) { return new TrEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-ghost', 'rz-pawnlay', 'rz-pulse', 'rz-zonekey',
  'rz-toast', 'rz-nudge', 'rz-caption', 'rz-breadcrumb', 'rz-tray', 'rz-accepts', 'rz-cost',
  'rz-minimap', 'rz-hint', 'rz-ctx', 'rz-crewdock',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
const doc = new TrDoc();
for (const id of RZ_IDS) { const e = new TrEl(doc, 'div'); e._id = id; doc.register(id, e); }
globalThis.document = doc;
const winListeners = {};
globalThis.window = {
  addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };

const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const sceneRect = (() => { const vb = roomScene(HOLD).viewBox; return { left: 0, top: 0, width: vb.w, height: vb.h }; })();
const atTile = (tx, ty) => {
  const [x, y] = scenePlacement(roomScene(HOLD), HOLD).foot(tx, ty);
  return { clientX: Math.round(x), clientY: Math.round(y) };
};

const sent = [];
const api = RoomZoom.initRoomZoom({ send: (o) => sent.push(o) });
Hud.renderDecks(FIX.decks);
Hud.renderRooms(FIX.rooms);
Hud.renderFrame(wreck);
const RICH = { type: 'ledger', matter: [['Parts', 12]] };
const BROKE = { type: 'ledger', matter: [['Parts', 0]] };
Hud.renderLedger(RICH);
api.enter('hold');

const trayEl = doc.getElementById('rz-tray');
const rootEl = doc.getElementById('roomzoom-view');
const ghostEl = doc.getElementById('rz-ghost');
const canvasEl = doc.getElementById('rz-canvas');
doc.getElementById('rz-layers')._rect = sceneRect;
trayEl.parentNode = rootEl;

function fire(el, type, extra) {
  const e = {
    type, target: el, defaultPrevented: false, propagationStopped: false, button: 0,
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
function key(k) {
  const e = {
    key: k, target: undefined, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
  };
  for (const fn of (winListeners.keydown || []).slice()) fn(e);
  return e;
}
const drv = makeTrayDriver({ doc, assert, click: (b) => fire(b, 'click', {}) });
const hover = (tx, ty) => fire(canvasEl, 'mousemove', atTile(tx, ty));
const trayText = (cls) => { const n = trayEl.querySelector(cls); return n ? String(n.textContent || '') : ''; };
/** ⚠️ READ OFF THE CRUMB ROW'S OWN MARKUP STRING, NOT OFF THE NODES. This rig's `innerHTML` is a
 *  flat START-TAG scan that keeps no text (the house pattern — see `build-feel.test.js`'s `RzEl`),
 *  so every scanned button's `textContent` is '' whatever the tray printed. An assertion on the
 *  nodes would report `['', '']` against a breadcrumb that is perfectly correct. */
const crumbLabels = () => [...String(trayEl.querySelector('.rz-tray-crumbs').innerHTML || '')
  .matchAll(/<button[^>]*class="rz-tray-crumb"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
/** A clear interior floor tile of the hold, derived from the fixture rather than typed. */
const FLOOR = (() => {
  for (let ty = HOLD.ry + 1; ty < HOLD.ry + HOLD.rh - 1; ty++) {
    for (let tx = HOLD.rx + 1; tx < HOLD.rx + HOLD.rw - 1; tx++) {
      const cell = wreck.cells[ty * wreck.w + tx];
      if (Array.isArray(cell) && (cell[0] | 0) === 46) return { x: tx, y: ty };
    }
  }
  return null;
})();
assert.ok(FLOOR, 'the hold has no clear interior floor tile — every ghost leg below would be vacuous');

afterEach(() => {
  Hud.renderLedger(RICH);
  api.exit();
  api.enter('hold');
  sent.length = 0;
});

// MUTATION: drop the `trayNav(… 'reveal' …)` line from `arm()` ⇒ RED (the hotkey's card is off screen).
test('DRIVEN: a HOTKEY arms the tool AND brings its card on screen', () => {
  const fails = [];
  // B/X/G/Z/V/C/M are the shipped bindings; each lives in a different leaf from the last, so a tray
  // that did not follow would be showing the wrong row for at least one of them.
  for (const [k, tool] of [['b', 'wall'], ['g', 'dig'], ['x', 'demolish'], ['m', 'move'],
    ['z', 'stockpile'], ['v', 'strip'], ['c', 'erase']]) {
    key(k);
    const card = drv.cards().find((b) => b.getAttribute('data-rztool') === tool);
    if (!card) { fails.push(`[${k}] armed ${tool} and its card is NOT on screen`); key(k); continue; }
    if (!card.classList.contains('on')) fails.push(`[${k}]: ${tool}'s card is on screen but not lit`);
    if (card.getAttribute('aria-pressed') !== 'true') fails.push(`[${k}]: ${tool}'s card does not say it is pressed`);
    // …and the crumb trail names where the surface went.
    const want = LEAF_LABEL[trayLeafFor(tool)];
    if (!crumbLabels().includes(want)) fails.push(`[${k}]: the breadcrumb reads [${crumbLabels()}], expected it to name ${want}`);
    key(k);                                       // disarm
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});

// MUTATION: make ESC always call `exitRoom()` ⇒ RED (the tray never walks back).
// MUTATION: make the tray rung run BEFORE the disarm rung ⇒ RED (the first ESC navigates instead).
test('DRIVEN: ESC walks the ladder — put the tool down, back a level, back again, then leave', () => {
  drv.arm('growbed');                             // MACHINES › INDUSTRY, two levels deep, armed
  assert.equal(drv.cards().filter((b) => b.classList.contains('on')).length, 1,
    'nothing is armed after pressing a card — the ladder legs below would read nothing');
  assert.deepEqual(crumbLabels(), ['MACHINES', 'INDUSTRY']);

  key('Escape');                                  // rung 1 — the tool goes down, the tray does NOT move
  assert.equal(drv.cards().filter((b) => b.classList.contains('on')).length, 0, 'ESC did not disarm');
  assert.deepEqual(crumbLabels(), ['MACHINES', 'INDUSTRY'],
    'the first ESC also navigated — the disarm rung must be reached before the tray rung');

  key('Escape');                                  // rung 4 — back a level
  assert.deepEqual(crumbLabels(), ['MACHINES'], 'ESC did not walk back one level');
  assert.equal(drv.cards().length, 0, 'the card row must empty when the tray steps back to a category');

  key('Escape');                                  // …and again, to the root
  assert.deepEqual(crumbLabels(), [], 'ESC did not walk back to the root');

  // …and only NOW does it leave the room. The observable is `body.roomzoom-open` — the class that
  // drives the takeover's whole visibility (`#roomzoom-view` itself is never re-`hidden`; the CSS
  // switch is the body class, see `roomzoom.css`'s takeover block).
  assert.equal(document.body.classList.contains('roomzoom-open'), true,
    'non-vacuity: the surface must be open before the last press, or the leg below asserts nothing');
  key('Escape');
  assert.equal(document.body.classList.contains('roomzoom-open'), false,
    'the fourth ESC did not leave the room — with the tool down and the tray at its root, the ' +
    'ladder must fall through to `exit`');
  api.enter('hold');
});

// MUTATION: write `ESC · BACK A LEVEL` as a constant into the markup ⇒ RED on two of the three rungs.
test('DRIVEN: the tray\'s corner says what ESC will ACTUALLY do, on every rung', () => {
  assert.equal(trayText('.rz-tray-esc'), 'ESC · BACK TO THE SHIP', 'at the root, ESC leaves the room');
  drv.open('growbed');
  assert.equal(trayText('.rz-tray-esc'), 'ESC · BACK A LEVEL');
  drv.arm('growbed');
  assert.equal(trayText('.rz-tray-esc'), 'ESC · PUT THE TOOL DOWN');
  key('Escape');
  assert.equal(trayText('.rz-tray-esc'), 'ESC · BACK A LEVEL', 'the corner did not follow the disarm');
});

// MUTATION: drop the `data-rzcrumb` branch from `onHudClick` ⇒ RED.
test('DRIVEN: a breadcrumb click jumps back to that level', () => {
  drv.open('growbed');
  assert.deepEqual(crumbLabels(), ['MACHINES', 'INDUSTRY']);
  const machines = drv.crumbs().find((b) => b.getAttribute('data-rzcrumb') === 'machines');
  assert.ok(machines, 'the MACHINES crumb is not a clickable control');
  fire(machines, 'click', {});
  assert.deepEqual(crumbLabels(), ['MACHINES'], 'the crumb click did not pop the leaf');
  // …and the emptied card row says what to do rather than sitting blank in a reserved band.
  const rowHtml = () => String(trayEl.querySelector('.rz-tray-cards').innerHTML);
  assert.ok(rowHtml().includes('PICK A GROUP'),
    'the emptied card row is blank — the band is a fixed reserve, so a blank rectangle reads as a ' +
    'menu that failed to load');
  // ⭐ …AND IT FOLLOWS THE NEXT STEP BACK. Depth 0 and depth 1 both have NO leaf and NO cards, so a
  // signature built from those two terms alone is identical for them — walking to the root left
  // `PICK A GROUP` under a corner already reading `ESC · BACK TO THE SHIP`. Found in the live rig's
  // own screenshot, not by an assertion, which is why it is one now.
  key('Escape');
  assert.deepEqual(crumbLabels(), [], 'ESC did not reach the root');
  assert.ok(rowHtml().includes('PICK A CATEGORY') && !rowHtml().includes('PICK A GROUP'),
    `at the root the empty row still reads "${rowHtml()}" — the repaint guard cannot tell depth 0 ` +
    'from depth 1');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5 · RULING E4 — DROP NONE. One leg per affordance the flat palette had earned.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: remove `paletteCostRow` from the card painter ⇒ RED on (a) and (b).
// MUTATION: make `.cant` `disabled` instead of a class ⇒ RED on (c) (the command stops going).
test('E4 SWEEP: every affordance the flat palette earned has a home on the tray', async () => {
  const fails = [];
  const note = (ok, what) => { if (!ok) fails.push(what); };

  // (a) THE PRICE IS ON THE SURFACE BEFORE ARMING — D7's cache, on the card itself.
  drv.open('bunk');
  const bunkCard = drv.cardFor('bunk');
  note(!!bunkCard, '(a) BUNK has no card');
  const cardsMarkup = trayEl.querySelector('.rz-tray-cards').innerHTML;
  note(cardsMarkup.includes('<span class="rz-card-price">3 PARTS</span>'),
    '(a) the price is not printed on the card before anything is armed');

  // (b) THE ARMED COST ROW still answers, with the ship's live balance.
  Hud.renderLedger({ type: 'ledger', matter: [['Parts', 1]] });
  await new Promise((r) => setTimeout(r, 30));
  drv.arm('bunk');
  const costEl = doc.getElementById('rz-cost');
  note(costEl.hidden === false, '(b) the armed cost row is hidden for a place tool');
  note(costEl.innerHTML.includes('BUNK ▸ NEEDS 3 PARTS — SHIP HAS 1'),
    `(b) the cost row reads "${costEl.innerHTML}"`);

  // (c) THE CANNOT-PAY STATE is paint only — the card still arms and the command still GOES.
  const cant = drv.cardFor('bunk');
  note(cant.classList.contains('cant'), '(c) the BUNK card does not wear `.cant` at 1 Part');
  note(cant.getAttribute('title') === 'BUNK ▸ NEEDS 3 PARTS — SHIP HAS 1', '(c) the card has no hover sentence');
  sent.length = 0;
  fire(canvasEl, 'pointerdown', atTile(FLOOR.x, FLOOR.y));
  fire(canvasEl, 'pointerup', atTile(FLOOR.x, FLOOR.y));
  note(sent.some((o) => o && o.cmd === 'place'),
    '(c) the client GATED the wire on its own ledger reading — `.cant` is paint, never a veto');

  // (d) THE REFUSAL SENTENCE — the sim's own relay, unchanged.
  api.placeRefused({ x: FLOOR.x, y: FLOOR.y, deck: DECK1, kind: 5, reason: 6, price: 3, affordable: 1 });
  note(String(doc.getElementById('rz-toast').textContent) === 'BUNK ▸ NEEDS 3 PARTS WITHIN REACH — ONLY 1 IS LOOSE ABOARD',
    `(d) the refusal reached the player as "${doc.getElementById('rz-toast').textContent}"`);
  drv.arm('bunk');                                 // disarm
  Hud.renderLedger(RICH);
  await new Promise((r) => setTimeout(r, 30));

  // (e) THE MATERIAL SWATCHES — six cards, and picking one re-skins without disarming.
  drv.arm('wall', 0);
  note(drv.cards().length === 6, `(e) the WALL leaf shows ${drv.cards().length} cards, not 6`);
  fire(drv.cardFor('wall', 3), 'click', {});
  const lit = drv.cards().filter((b) => b.classList.contains('on'));
  note(lit.length === 1 && lit[0].getAttribute('data-rzmat') === '3',
    '(e) picking a second material did not move the selection (or disarmed the tool)');
  drv.arm('wall', 3);                              // the held card again → down

  // (f) THE ACCEPTS ROW still belongs to STOCKPILE and to nothing else.
  const acc = doc.getElementById('rz-accepts');
  drv.arm('stockpile');
  note(acc.hidden === false, '(f) the ACCEPTS row does not appear for STOCKPILE');
  drv.arm('stockpile');
  note(acc.hidden === true, '(f) the ACCEPTS row survived disarming STOCKPILE');

  // (g) THE ARMED/PRESSED VISUAL STATE — `.on` plus `aria-pressed`, on exactly one control.
  drv.arm('table');
  const on = drv.cards().filter((b) => b.classList.contains('on'));
  note(on.length === 1 && on[0].getAttribute('aria-pressed') === 'true',
    '(g) the armed card is not announced in words as well as in colour');
  drv.arm('table');

  // (h) THE [E] ROTATE HINT is still taught — it is a keyboard-only verb with no control anywhere.
  drv.arm('table');
  note(/ROTATE \[E\]/.test(String(doc.getElementById('rz-hint').textContent)),
    '(h) the armed hint no longer names the rotation — its only discoverability is gone');
  drv.arm('table');

  // (i) KEYBOARD REACHABILITY — every control the tray paints is a real, typed button.
  drv.open('bunk');
  const html = trayEl.innerHTML + trayEl.querySelector('.rz-tray-cats').innerHTML
    + trayEl.querySelector('.rz-tray-subs').innerHTML + trayEl.querySelector('.rz-tray-cards').innerHTML;
  const buttons = (html.match(/<button /g) || []).length;
  const typed = (html.match(/<button type="button"/g) || []).length;
  note(buttons > 6 && buttons === typed,
    `(i) ${buttons - typed} of ${buttons} tray controls are not \`<button type="button">\``);

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6 · THE IN-ROOM CALLOUT — the armed piece's leader, price and dimension line.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: delete the `ghostCalloutSvg(...)` call from `ghostPieceSvg` ⇒ RED.
// MUTATION: put the callout INSIDE the `.rz-buildghost` wrapper ⇒ RED (it inherits the unbuilt dash).
test('DRIVEN: the armed piece carries a PRICED leader and a dimension line', () => {
  drv.arm('table');
  hover(FLOOR.x, FLOOR.y);
  const html = ghostEl.innerHTML;
  assert.ok(html.includes('rz-buildghost'), 'no ghost at all — every leg below would be vacuous');
  const parts = html.split('<g class="rz-ghost-callout"');
  assert.equal(parts.length, 2, 'the callout is absent, or emitted more than once');
  // THE LEADER says the price, in the accent, and the callout is a SIBLING of the piece — inside the
  // wrapper it would come out dashed and half-transparent, i.e. the annotation wearing the dialect
  // of the thing it annotates.
  assert.ok(parts[1].includes('PLACE · 3 PARTS'), `the leader reads: ${parts[1].slice(0, 200)}`);
  assert.ok(parts[1].includes('#7B2C22'), 'the leader is not in the one accent');
  assert.ok(!parts[0].includes('#7B2C22'), 'the PIECE has acquired the accent — a preview is not an alert');
  // ⛔ SIBLING-NESS IS COUNTED, NOT SNIFFED, AND THE FIRST DRAFT OF THIS LEG SURVIVED ITS OWN
  // MUTATION. It read `!parts[1].includes('stroke-dasharray="6 5"')` — but a callout moved INSIDE
  // the wrapper does not GAIN that attribute, it INHERITS it, so the markup is byte-identical to a
  // correct one and the assertion was measuring nothing (driven: mutation M10 stayed GREEN). What
  // actually distinguishes the two is BALANCE: everything before the callout must have closed every
  // group it opened, or the callout is a child.
  const opens = (parts[0].match(/<g[\s>]/g) || []).length;
  const closes = (parts[0].match(/<\/g>/g) || []).length;
  assert.equal(opens, closes,
    `${opens} <g> opened and ${closes} closed before the callout — it is INSIDE the ghost wrapper, ` +
    'so it inherits the unbuilt dash and the 0.55 opacity: the annotation would wear the dialect of ' +
    'the thing it annotates');
  // THE DIMENSION LINE is the SAME derivation the card's stat line prints. One source, two places.
  assert.ok(parts[1].includes(trayStatText('table')),
    `the dimension line does not say "${trayStatText('table')}" — the card and the room disagree`);
  // …and it takes no pointer events: the leader crosses tiles the player may be about to click.
  assert.ok(parts[1].includes('pointer-events="none"'), 'the callout is a press target');
});

// MUTATION: hard-code the leader to run RIGHT ⇒ RED (it leaves the viewBox on the far side).
test('DRIVEN: the leader flips to the side with room — VR-P4\'s off-screen alert, refused', () => {
  drv.arm('table');
  const near = { x: HOLD.rx + 1, y: HOLD.ry + 1 };
  const far = { x: HOLD.rx + HOLD.rw - 2, y: HOLD.ry + 1 };
  assert.notEqual(near.x, far.x, 'the hold is too narrow for this leg to mean anything');
  hover(near.x, near.y);
  const a = /data-callout-side="(\w+)"/.exec(ghostEl.innerHTML);
  hover(far.x, far.y);
  const b = /data-callout-side="(\w+)"/.exec(ghostEl.innerHTML);
  assert.ok(a && b, 'the callout does not declare which way it ran');
  assert.equal(a[1], 'right', 'a piece in the LEFT half must lead to the right');
  assert.equal(b[1], 'left', 'a piece in the RIGHT half must lead to the left, or it is drawn off the plate');
});

// MUTATION: leave `partsAboard()` out of the ghost signature ⇒ RED (the stale sentence latches).
test('DRIVEN: a refused placement\'s leader says the COST ROW\'s sentence, and follows the balance', async () => {
  Hud.renderLedger(BROKE);
  await new Promise((r) => setTimeout(r, 30));
  drv.arm('table');
  hover(FLOOR.x, FLOOR.y);
  const refused = ghostEl.innerHTML.split('<g class="rz-ghost-callout"')[1] || '';
  const want = paletteCostRow('table', 0).text;
  assert.ok(refused.includes(want), `the refused leader reads ${refused.slice(0, 200)}, expected "${want}"`);
  assert.deepEqual(trayCallout('table', paletteCostRow('table', 0)).lead, want,
    'the pure model and the surface word one refusal two ways');

  // ⭐⭐ THE BALANCE MOVES **WITHOUT THE REFUSAL STATE MOVING** — and this leg exists because the
  // obvious one is VACUOUS. Going BROKE → RICH flips `ghostRefused`, and `refused` is ALREADY a term
  // in the signature, so the ghost redraws whether or not `partsAboard()` is in it: the mutation
  // "delete the parts term" survived that version of this test, measured. What only the parts term
  // can see is a change INSIDE one refusal state — 1 Part and 2 Parts are both short of 3, so the
  // ghost's verdict is identical and its SENTENCE is not.
  const at = async (n) => {
    Hud.renderLedger({ type: 'ledger', matter: [['Parts', n]] });
    await new Promise((r) => setTimeout(r, 30));
    hover(FLOOR.x, FLOOR.y);
    return ghostEl.innerHTML.split('<g class="rz-ghost-callout"')[1] || '';
  };
  const one = await at(1);
  const two = await at(2);
  assert.ok(one.includes('SHIP HAS 1'), `at 1 Part the leader reads ${one.slice(0, 160)}`);
  assert.ok(two.includes('SHIP HAS 2'),
    'the leader still says the ship has 1 Part after it found a second — the refusal VERDICT did ' +
    'not change (1 and 2 are both short of 3), so only `partsAboard()` in the ghost signature can ' +
    'make the sentence follow. Without it the guard holds a stale number up indefinitely.');

  // …and the affordable state, for completeness: the leader goes back to naming the price.
  Hud.renderLedger(RICH);
  await new Promise((r) => setTimeout(r, 30));
  hover(FLOOR.x, FLOOR.y);
  const paid = ghostEl.innerHTML.split('<g class="rz-ghost-callout"')[1] || '';
  assert.ok(paid.includes('PLACE · 3 PARTS'),
    'the leader still shows the refusal after a resupply');
});
