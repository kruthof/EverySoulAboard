// Tests for the LEVEL-1 OVERVIEW SVG SCENE (client/src/ui/overview-scene.js). Pure — no DOM, no
// GPU. Driven by the captured wire snapshot client/test/fixtures/overview-grid.json so the scene
// is testable offline and deterministically. Proves: the scene builds from the fixture without
// throwing; it is deterministic (same state → byte-identical SVG); every OCCUPIED slot gets a glow
// and empty halls do NOT; on-deck crew are placed as pawns; furniture maps from frame glyphs; ids
// are collision-free; and unknown glyph / roomType degrade gracefully.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { decode, decodeDecks, decodeRooms, MARK_KIND_NAMES } from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import {
  overviewScene, makeShipTransform, starfield, starLayerSvg, BAY,
  layoutPawnLabels, LABEL_MAX_ROWS, pawnLayerParts,
} from '../src/ui/overview-scene.js';
import {
  bandLayout, deckPlane, slotSpans, floorPoint, floorSolve, V_SPINE, MIN_BAND_H,
} from '../src/ui/ship-elevation.js';
import { decodeDevices, decodeItems } from '../src/wire/messages.js';
import { makePawnLayer } from '../src/ui/pawn-layer.js';
import { stylesSource } from './styles-source.js';
import { taskTag } from '../src/ui/console-model.js';
import { markCellSvg, markVariant } from '../src/ui/mark-overlay.js';
// The two marks ONLY `sketch()` writes — the witnesses for the plate-scale RAW ruling at the bottom
// of this file. Imported from the treatment itself so a rename cannot leave the guards scanning for
// a string nothing emits any more.
import { GROUND_CLASS, DOUBLE_CLASS } from '../src/render/sketch.js';
import { buildTileItem } from '../src/items/wear.js';
// The hull-skin projection the outboard layer mounts on (owner ruling, 2026-08-06).
import { hullSkinY, HULL_SKIN } from '../src/ui/ship-elevation.js';

const FIX = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/overview-grid.json', import.meta.url)), 'utf8'),
);

// Re-derive the view exactly as the client would from the wire snapshot.
const decks = decodeDecks(decode(JSON.stringify(FIX.decks)));
const rooms = decodeRooms(decode(JSON.stringify(FIX.rooms)));
const view = decksView(decks, rooms);
const crew = FIX.roster.crew;
const frame = FIX.frame;

// ⚠️ THE PAIRING. `FIX.roster` is the BOOT roster: every crew member reads deck 0 / task "Idle". The
// WORK-MARKER tests below must NOT be driven from it — see the fixture's own `note`, and the
// "the fixture can actually drive it" test, which fails if this pairing is ever undone.
const frameDeck1 = FIX.frameDeck1;
const crewDeck1 = FIX.rosterDeck1.crew;

// ⭐⭐ THE FITTING SOURCE. The side elevation draws EVERY deck, so it cannot read `frame` (which
// carries one) — it reads `devices` + `items`, which carry the whole ship. See
// `ship-fittings.js`'s header for the tile-for-tile measurement, and the fixture's own `note` (3)
// for which of this file's two frames these channels are COHERENT with: the boot `frame`, not
// `frameDeck1`.
const devices = decodeDevices(decode(JSON.stringify(FIX.devices)));
const items = decodeItems(decode(JSON.stringify(FIX.items)));

function baseState(over = {}) {
  return {
    deck: 0, decksView: view, frame, crew, devices, items,
    designs: FIX.designs.cells, marks: [], ...over,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE PAWNS LEFT THE SCENE STRING (2026-08-05, the client-side tween), AND THIS IS HOW THEY
// ARE READ BACK.
//
// `overviewScene` no longer emits figures at all: `paintScene` assigns the whole plate to
// `_stage.innerHTML` ~10×/s, so a `<g>` inside it is destroyed before it could be moved twice, and a
// tween needs a node that outlives the message that moved it. The art is built by the pure
// `pawnLayerParts` (FOOT-RELATIVE — every figure drawn around (0,0)) and mounted into a persistent
// overlay `<svg>` by `pawn-layer.js`, which puts the person's screen position on the group's own
// `transform`.
//
// ⛔ SO THE HELPER DRIVES THE REAL LAYER RATHER THAN RE-IMPLEMENTING IT. A hand-written
// `'<g class="pl-pawn" …>' + part.html` here would be a SECOND copy of the mount contract — the exact
// shape that lets a change to `makePawnLayer` (a different attribute, a different wrapper) leave this
// file green while the surface draws nothing. `mountPawns` runs `sync` + `place` against a minimal
// recording container and serializes what really landed, so every geometric assertion below is still
// measured on EMITTED, ON-SCREEN coordinates — which is what made them worth writing.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The smallest element the layer can mount into: attributes, innerHTML, a parent that keeps order. */
function recEl() {
  const e = {
    attributes: {}, dataset: {}, innerHTML: '', children: [],
    ownerDocument: null,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
  };
  e.ownerDocument = { createElementNS: () => recEl() };
  return e;
}

/** What the Overview MOUNTS for `state`'s crew, serialized: `<g class="pl-pawn" data-cid="…"
 *  transform="translate(x y)">…</g>` per drawn figure, placed at the newest sample (i.e. settled —
 *  exactly where the plate drew them before the tween existed). */
function mountPawns(st) {
  const state = { deck: 0, ...st };
  // ⭐ ONE TRANSFORM FOR THE WHOLE SHIP, and `pawnLayerParts` takes no `deck`: the elevation draws
  // every band, so each crew member is placed on HER OWN (`c.deck`). The `deck` field on the state
  // now says which band is ACTIVE, not which one is drawn.
  const t = makeShipTransform(state.decksView || [], state.frame);
  const parts = pawnLayerParts(state.crew, t, state.selectedCid, state.idPrefix || 'ov');
  const host = recEl();
  const layer = makePawnLayer(host, { groupClass: 'pl-pawn' });
  layer.sync(parts);
  layer.place(new Map(parts.map((p) => [String(p.cid), { x: p.x, y: p.y }])));
  return host.children.map((g) => '<g class="' + g.attributes.class + '" data-cid="'
    + g.attributes['data-cid'] + '" transform="' + (g.attributes.transform || '') + '">'
    + g.innerHTML + '</g>').join('');
}

/** The `translate(x y)` a mounted group carries, as a pair. */
function groupXY(chunkOrSvg) {
  const m = /transform="translate\(([-\d.]+) ([-\d.]+)\)"/.exec(chunkOrSvg);
  return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
}

/**
 * ⚠️ THE FIXTURE ADAPTER — the same one `room-model.test.js` carries, and the same caveat.
 * `overview-grid.json` predates the `marks` channel and carries no `marks` message, so this rebuilds
 * a decoded-marks array from `frameDeck1`'s fg bytes in order to keep driving the mark layer from the
 * wreck's REAL geometry (30 debris + 3 dig at real coordinates).
 * IT IS NOT EVIDENCE ABOUT THE CHANNEL. It is derived from `cell[1]`, the lossy byte the channel
 * replaces, so anything the projection erased is missing here too. The channel's own evidence is the
 * live capture `client/test/fixtures/marks-grid.json`, driven in `client/test/marks-model.test.js`.
 */
const FG_TO_KIND = { 4: 0, 15: 1, 16: 2, 26: 3 };
function marksFromFrame(f) {
  const out = [];
  if (!f || !Array.isArray(f.cells)) return out;
  for (let ty = 0; ty < f.h; ty += 1) {
    for (let tx = 0; tx < f.w; tx += 1) {
      const cell = f.cells[ty * f.w + tx];
      if (!Array.isArray(cell)) continue;
      const kind = FG_TO_KIND[cell[1] | 0];
      if (kind === undefined) continue;
      out.push({ x: tx, y: ty, deck: f.deck | 0, kind, mark: MARK_KIND_NAMES[kind] });
    }
  }
  return out;
}
const marksDeck1 = marksFromFrame(frameDeck1);

/** The working state of a deck-1 fixture roster, read from the task STRINGS rather than from the
 *  classifier the code under test uses — so the fixture's own content is checked independently. */
const DECK1_WORKING = crewDeck1.filter((c) => /^(Digging|Crafting|Hauling|Fetching|Building|Stripping|Servicing|Eating|Drinking)\b/.test(c.task));
const DECK1_IDLE = crewDeck1.filter((c) => /^(Idle|Holding|Walking|Heading)\b/.test(c.task));

/**
 * Every pawn's rendered label, by cid: `{ text, work, crowded, rect, leaderX }`.
 * `text` is the pill's visible string (tspans flattened), `work` whether the label was marked as
 * carrying a task tag, `crowded` whether the de-clutter sweep gave up and hid it, and `rect` is the
 * pill's EMITTED box `{x,y,w,h}` — read out of the SVG rather than recomputed, because the whole
 * point of the overlap assertion below is that the sweep's model and the emitted geometry agree.
 */
function pawnLabels(svg) {
  const out = new Map();
  for (const chunk of svg.split('<g class="pl-pawn" data-cid="').slice(1)) {
    const cid = chunk.slice(0, chunk.indexOf('"'));
    const m = /<g class="(pl-tag[^"]*)">([\s\S]*?)<\/g>/.exec(chunk);
    if (!m) continue;
    const r = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/.exec(m[2]);
    const ln = /<line x1="([-\d.]+)"/.exec(m[2]);
    // ⭐ THE ON-SCREEN RECT IS THE GROUP'S TRANSLATE PLUS THE LOCAL BOX, and this addition is the
    // whole reason the helper above mounts through the real layer. The pill is emitted FOOT-RELATIVE
    // now, so two pawns twenty tiles apart carry byte-identical local rects — an overlap sweep read
    // off the local numbers would report every pair as overlapping and prove nothing. The sum is the
    // same screen geometry the old absolute emission produced, arrived at the way the browser does.
    const at = groupXY(chunk.slice(0, chunk.indexOf('>')));
    out.set(cid, {
      text: m[2].replace(/<[^>]*>/g, ''),
      work: m[1].includes('pl-tag-work'),
      crowded: m[1].includes('pl-tag-crowded'),
      leader: m[2].includes('<line '),
      rect: r ? { x: +r[1] + at.x, y: +r[2] + at.y, w: +r[3], h: +r[4] } : null,
      leaderX: ln ? +ln[1] + at.x : null,
    });
  }
  return out;
}

/** Every pair of VISIBLE pills that overlaps in BOTH axes, as `"A × B (w × h px)"` strings.
 *  Crowded pills are excluded because CSS renders them at `opacity:0` — an overlap you cannot see is
 *  not a legibility defect, and counting them would make the assertion unsatisfiable by design. */
function overlappingPairs(labels) {
  const vis = [...labels.values()].filter((l) => !l.crowded && l.rect);
  const bad = [];
  for (let i = 0; i < vis.length; i += 1) {
    for (let j = i + 1; j < vis.length; j += 1) {
      const a = vis[i].rect, b = vis[j].rect;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) {
        bad.push(`${vis[i].text} × ${vis[j].text} (${ox.toFixed(1)} × ${oy.toFixed(1)} px)`);
      }
    }
  }
  return bad;
}

// ⭐⭐ EVERY COUNT ON THIS PLATE IS PER-DECK NOW, AND THAT IS THE SINGLE BIGGEST CHANGE TO THIS FILE.
// The side elevation draws EVERY deck in one document — on this 8-deck `--ship grid` fixture that is
// 64 compartments in one string — so a bare `class="pl-room"` count answers a question about the
// SHIP where every assertion below means a question about a DECK. `data-deck` is emitted on every
// compartment group and every fitting precisely so a census can say which one it means; these two
// helpers are the only place that parse is written down, so the tests cannot drift apart from it.
/** How many compartment groups are drawn on `deck`. */
const roomsOn = (svg, deck) =>
  (svg.match(new RegExp(`data-anchor="[^"]*" data-deck="${deck}"`, 'g')) || []).length;
/** How many compartments on `deck` carry the PURPOSE mark (`roomType != 0`). */
const purposeOn = (svg, deck) =>
  (svg.match(new RegExp(`data-deck="${deck}" data-purpose="1"`, 'g')) || []).length;
/** How many carry `data-state="unbuilt"` on `deck`. */
const unbuiltOn = (svg, deck) =>
  (svg.match(new RegExp(`data-deck="${deck}" data-purpose="0" data-state="unbuilt"`, 'g')) || []).length;

// Count distinct id="…" attributes and total id occurrences (for collision-freedom).
function idStats(svg) {
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  return { ids, unique: new Set(ids).size, total: ids.length };
}

test('the fixture carries the channels the scene needs', () => {
  assert.ok(FIX.frame && FIX.decks && FIX.rooms && FIX.roster && FIX.designs);
  assert.equal(view.length, 8);              // 8 decks
  assert.equal(view[0].slots.length, 8);     // 2×4 grid
  assert.equal(view[0].slots.filter((s) => s.occupied).length, 8); // deck 0 fully commissioned
});

test('the scene builds from the fixture without throwing and is ONE document with N tile svgs', () => {
  const svg = overviewScene(baseState());
  // ⚠️ THE VIEWBOX IS THE OWNER'S OWN, SCALED: `Perilune Ship - Drawn.html` is
  // `viewBox="4 18 1058 334"` and this module scales it UNIFORMLY to 1300 wide, so the height is
  // `334 × 1300/1058 = 410`. VR-P4's 405 came from the old hull box's 320 × 1.2646 and has no
  // meaning here; changing it is what keeps the ship from being stretched.
  assert.match(svg, /^<svg class="pl-overview" viewBox="0 0 1300 410"/);
  assert.ok(svg.endsWith('</svg>'));
  // ⚠️⚠️ THE OLD ASSERTION COUNTED NESTED `<svg>` ELEMENTS — one per compartment, each carrying the
  // design's `viewBox="-10 -10 992 428"` — because VR-P4 drew every compartment as its OWN little
  // document scaled into a grid cell. **THERE IS NO NESTED `<svg>` LEFT.** The elevation draws every
  // compartment on ONE deck floor plane in ONE coordinate system, which is what deleted the
  // scene-vs-mini space split and made `invert` exact without a per-cell `meet` fit. So the claim
  // becomes: exactly ONE document, no nesting at all, and EVERY DECK DRAWN — which is stronger than
  // the old count, because a nested viewBox was a second place the projection could be wrong.
  assert.equal((svg.match(/<svg /g) || []).length, 1,
    'a nested <svg> appeared in the plate — that is a second coordinate space, and the whole point '
    + 'of the elevation is that there is one');
  assert.equal((svg.match(/class="pl-deck"/g) || []).length, view.length,
    'the plate does not draw one band per deck');
  for (const d of view) {
    assert.equal(roomsOn(svg, d.deck), d.slots.length, `deck ${d.deck} drew the wrong compartment count`);
  }
  assert.ok(view.length >= 2 && view[0].slots.length >= 8,
    'the fixture has fewer than 2 decks or 8 compartments — these assertions read nothing');
});

test('the scene is deterministic — same state yields a byte-identical SVG', () => {
  assert.equal(overviewScene(baseState()), overviewScene(baseState()));
  // and a fresh re-derivation of the view produces the same bytes
  const view2 = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))), rooms);
  assert.equal(overviewScene(baseState({ decksView: view2 })), overviewScene(baseState()));
});

test('the starfield is the seeded 220 stars, deterministic across calls', () => {
  const a = starfield();
  const b = starfield();
  assert.equal(a.length, 220);
  assert.deepEqual(a, b);
  // sizes only ever 1/2/3 px, x/y in [0,100]
  for (const s of a) {
    assert.ok(s.s === 1 || s.s === 2 || s.s === 3);
    assert.ok(s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ VR-P4 — THE PURPOSE SIGNAL, TRANSLATED. The warm surface said "this compartment has an authored
// PURPOSE" with an amber radial GLOW POOL (`id="ov-glow-N"`, one `<radialGradient>` per lit room).
// The paper dialect has no glow and no second colour, so the SAME PREDICATE (`slot.roomType`) now
// picks the tile's own SHELL TREATMENT — solid ink for a purposed compartment, the dash dialect's
// UNBUILT stroke for one with no purpose — and the tile emits `data-purpose` so the predicate can be
// read off the string instead of counting gradients that no longer exist.
//
// ⛔ EVERY LEG BELOW IS THE OLD LEG WITH ONE TOKEN CHANGED. Nothing was relaxed: the counts, the
// synthetic three-flag deck, the dead-deck case and the non-vacuity checks are all as they were.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** How many tiles carry the PURPOSE mark (`roomType != 0`) — the glow pool's successor. */
const purposeTiles = (svg) => (svg.match(/data-purpose="1"/g) || []).length;

test('every PURPOSED slot is marked as such, and EVERY slot draws as a compartment (M1-L)', () => {
  // Deck 0: all 8 typed → 8 purposed tiles, 8 compartments.
  const svg0 = overviewScene(baseState({ deck: 0 }));
  assert.equal(purposeOn(svg0, 0), 8);
  assert.equal(roomsOn(svg0, 0), 8);

  // Deck 1 MIXES typed and untyped slots, and that is what makes it the decisive deck: PURPOSE and
  // DRAWING come apart here. The mark tracks the authored PURPOSE (`roomType`); DRAWING no longer
  // tracks anything — M1-L deleted `hallCompartment`, so all 8 draw as compartments.
  const d1 = view.find((d) => d.deck === 1);
  const typed1 = d1.slots.filter((s) => s.roomType).length;
  const untyped1 = d1.slots.filter((s) => !s.roomType).length;
  assert.ok(typed1 >= 1 && untyped1 >= 1, 'deck 1 must mix typed and untyped to separate the two');
  const svg1 = overviewScene(baseState({ deck: 1, frame: null }));
  assert.equal(purposeOn(svg1, 1), typed1);            // one mark per PURPOSED slot
  assert.equal(roomsOn(svg1, 1), d1.slots.length);     // ALL draw as compartments
  // …and the mark really does change the drawing: an unpurposed compartment takes the dash dialect's
  // UNBUILT stroke, so the two states are distinguishable in ink and not merely in an attribute.
  assert.equal(unbuiltOn(svg1, 1), untyped1);
  assert.match(svg1, /stroke-dasharray="6 5"/);
});

test('the purpose mark is `roomType`, never `active` and — since M1-L — never `occupied` either', () => {
  // ⚠️ THIS TEST WAS RETARGETED IN REVIEW (2026-07-29) AND ITS OLD NAME WAS A FALSE CLAIM ABOUT THE
  // MODULE. It read "glow is `occupied`, never `active`" and its comment called itself "the ONLY
  // thing pinning `occupied` as a live input to the scene". MEASURED with the shipped `codeOnly`
  // stripper: **`.occupied` occurs ZERO times in `overview-scene.js`.** The second commit moved
  // `glowPools` onto `roomType`; the test kept passing only because on `overview-grid.json` — a
  // PRE-M1-L capture — `occupied` and `roomType != 0` happen to coincide on every slot. A test that
  // passes because two inputs agree on one fixture pins NEITHER of them.
  //
  // So the property is asserted where the fixture CANNOT decide it: a synthetic deck that drives all
  // three flags apart. This is the inclusion form — plant the shape the guard must catch.
  const d1 = view.find((d) => d.deck === 1);
  assert.ok(d1.slots.every((s) => (!!s.occupied) === (!!s.roomType)),
    'the fixture no longer conflates occupied and roomType — this test\'s premise has changed');

  const mk = (slotIndex, roomType, occupied, active) => ({
    ...d1.slots[0], slotIndex, roomType, occupied, active,
    rect: { x: slotIndex * 8, y: 0, w: 6, h: 5 },
  });
  const split = [{
    deck: 3,
    slots: [
      mk(0, 5, true, true),    // typed   + occupied + active  → GLOWS
      mk(1, 5, false, false),  // typed   + UNoccupied         → still glows (roomType decides)
      mk(2, 0, true, true),    // UNtyped + occupied + active  → NO glow (the M1-L regression)
      mk(3, 0, false, true),   // UNtyped + active             → NO glow (the Phase-2b bug)
    ],
  }];
  const svg = overviewScene(baseState({ deck: 3, decksView: split, frame: null, crew: [] }));
  const marked = [...svg.matchAll(/data-slot="(\d+)" data-anchor="[^"]*" data-deck="3" data-purpose="1"/g)].map((m) => m[1]);
  assert.deepEqual(marked, ['0', '1'],
    'the purpose mark is not following `roomType`: slot 2 (occupied, untyped) or slot 3 (active, '
    + 'untyped) was marked, or slot 1 (typed but unoccupied) lost its mark');
  // …and all four still DRAW, which is the package: purpose decides ink, geometry decides sight.
  assert.equal(roomsOn(svg, 3), 4);

  // And a fully-empty, inactive deck marks nothing — but still draws 8 compartments, which is the
  // whole point of the package: a deck with no live rooms is still a deck you can look into.
  const svg7 = overviewScene(baseState({ deck: 7, frame: null }));
  assert.equal(purposeOn(svg7, 7), 0);
  assert.equal(roomsOn(svg7, 7), 8);
  // ⚠️ THE NEUTRAL NAME MOVED OFF THE DRAWING AND INTO THE `compartments` COLUMN, and that is the
  // design's own arrangement (Screen 01 labels no tile — the prose column names every room). At
  // ~190 × 70 px a tile cannot hold an 11-character label without covering its own interior, which
  // is the clip `no-add-room.test.js` measured from the other side. The names are still emitted, by
  // `compartmentLines`, and `overview-model.test.js` pins that they are all eight and all distinct.
  assert.equal(roomsOn(svg7, 7), 8);
});

test('EVERY crew member is placed as a pawn, on HER OWN band', () => {
  // ⚠️⚠️ THE OLD TITLE WAS "on-deck crew are placed as pawns; off-deck crew are not", AND ITS SECOND
  // HALF IS DELETED WITH THE FILTER IT PINNED. VR-P4's plate drew ONE deck and `pawnLayerParts`
  // dropped everyone else; the elevation draws every deck, so a crew member on the other band is
  // standing in a compartment the player can SEE. Omitting her would make the ship report N souls
  // aboard and draw fewer — `invisible-feedback-is-FUNCTIONAL`, on the surface whose whole job is to
  // show where everyone is.
  //
  // What replaces "off-deck crew are not drawn" is TWO stronger claims: everyone is drawn ONCE, and
  // each is drawn on the band her own `deck` selects.
  const svg = mountPawns(baseState({ deck: 0 }));
  assert.ok(crew.length >= 1);
  assert.equal((svg.match(/class="pl-pawn"/g) || []).length, crew.length,
    'the plate draws a number of figures that is not the roster — someone is filtered out, or drawn twice');
  for (const c of crew) assert.ok(svg.includes(`data-cid="${c.cid}"`));
  // surname tags render (uppercased last token)
  assert.match(svg, /HALLORAN|VEGA|SATO/);

  // ⭐ EACH ON HER OWN BAND, driven against the transform. A synthetic pair on two decks, because
  // the boot roster is all on deck 0 and a same-deck fixture cannot tell the two apart.
  const t = makeShipTransform(view, frame);
  const pair = [{ ...crew[0], cid: 9001, deck: 0 }, { ...crew[0], cid: 9002, deck: 3 }];
  const parts = pawnLayerParts(pair, t, null, 'ov');
  assert.deepEqual(parts.map((pp) => pp.deck), [0, 3], 'a part lost or borrowed a deck');
  for (const pp of parts) {
    const b = t.deckInfo(pp.deck).band;
    assert.ok(pp.y >= b.y && pp.y <= b.y + b.h,
      `cid ${pp.cid} (deck ${pp.deck}) drew at y=${pp.y}, outside her band ${b.y}..${b.y + b.h}`);
  }

  // A crew member on a deck the plate does NOT draw still renders nothing — the bound that replaces
  // the deck filter. (A ship whose `decks` channel has not landed yet is the real case.)
  assert.equal(pawnLayerParts([{ ...crew[0], cid: 9003, deck: 99 }], t, null, 'ov').length, 0);
  // …and an EMPTY roster still draws nobody, which keeps the count assertion above non-vacuous.
  assert.equal(mountPawns(baseState({ crew: [] })).match(/class="pl-pawn"/g), null);
});

// ⛔⛔ AND THE SCENE ITSELF DRAWS NOBODY — the guard against re-homing the figures (2026-08-05).
//
// A pawn layer concatenated back into `overviewScene` would look harmless and be two separate
// defects: every crew member drawn TWICE (once animated in the overlay, once frozen in the scene,
// a tile apart mid-walk), and the scene copy is the one that reads as "the glide is broken again".
// The old layer-order property this replaces ("pawns above marks, ghosts and terminals") did not
// weaken — it became STRUCTURAL, and its two halves are pinned right here: the scene has no figures,
// and the stylesheet stacks the overlay above the stage.
//
// MUTATION: re-add `+ pawnLayerParts(...)` joined into `overviewScene`'s body ⇒ RED on leg 1.
// MUTATION: `.ov-pawnlay{…z-index:1}` ⇒ RED on leg 3.
test('the SCENE draws no figures — they live in the overlay, stacked above it', () => {
  const svg = overviewScene(baseState({ deck: 0 }));
  assert.equal(svg.indexOf('pl-pawn'), -1,
    'the plate string carries a pawn again. It is assigned to `_stage.innerHTML` ~10x/s, so a figure '
    + 'there cannot be tweened AND is drawn a second time under the overlay copy.');
  // NON-VACUITY: the same state really does produce figures — through the overlay.
  assert.ok(mountPawns(baseState({ deck: 0 })).includes('class="pl-pawn"'),
    'nobody is drawn at all, so leg 1 is satisfied by an empty ship rather than by the re-home rule');
  // …and the overlay is stacked ABOVE the scene mount, which is what carries "a mark never hides a
  // person" now that it is not a concatenation order.
  const css = stylesSource();
  const zOf = (sel) => {
    const m = new RegExp(sel.replace('.', '\\.') + '\\{[^}]*z-index:(\\d+)').exec(css);
    return m ? Number(m[1]) : null;
  };
  assert.ok(zOf('.ov-stage') != null && zOf('.ov-pawnlay') != null,
    'one of the two mounts has no z-index — the stacking is then document order, which this scan '
    + 'cannot see, so the assertion below would be vacuous');
  assert.ok(zOf('.ov-pawnlay') > zOf('.ov-stage'),
    'the pawn overlay is stacked UNDER the plate: every mark, ghost, wash and terminal chip would '
    + 'draw over the crew standing on it.');
});

// ⛔⛔ THE POINTER RULE ON THE OVERLAY IS TWO DECLARATIONS AND BOTH ARE LOAD-BEARING — and until this
// test neither was measured. Since the figures left `#ov-stage`, a crew click is resolved by
// `hitTest`'s `target.closest('.pl-pawn')` on a node in a SIBLING element, so:
//   · the SHEET must be `pointer-events:none`, or the overlay covers the whole plate and every press
//     on empty paper stops there instead of reaching the scene's room/tile hit test; and
//   · the FIGURES must take it back with `pointer-events:auto`, or a press on a crew member falls
//     through to the room behind her and selection silently stops working.
// ⛔ THE RECEIPT, SPLIT BY WHO MEASURED WHAT (the repo's rule: a count you did not measure yourself
// is not evidence). INDEPENDENT REVIEW measured the live consequence — with both deleted, clicking a
// crew member on the plate went 8/8 → 0/8 in a running game while the node suite stayed 1523/1523
// GREEN. THIS LANE measured the enforcement: with both deleted, exactly TWO legs in the whole
// 1527-test suite go red — this one and `overview-model.test.js`'s pawn-overlay leg — and nothing
// else in the suite notices at all.
// A stylesheet fact needs a stylesheet assertion; the DRIVEN half — that the press reaches the
// overlay's own listeners at all — is `overview-model.test.js`'s pawn-overlay leg.
//
// MUTATION: drop `.ov-pawnlay .pl-pawn{pointer-events:auto}` ⇒ RED on leg 2.
// MUTATION: `.ov-pawnlay{…pointer-events:auto}` ⇒ RED on leg 1.
test('the pawn overlay is transparent to the pointer, and the FIGURES are not', () => {
  const css = stylesSource();
  const peOf = (sel) => {
    const m = new RegExp(sel.replace(/\./g, '\\.') + '\\{[^}]*pointer-events:(\\w+)').exec(css);
    return m ? m[1] : null;
  };
  assert.equal(peOf('.ov-pawnlay'), 'none',
    'the pawn overlay sheet takes the pointer. It is `inset:0` over the whole plate, so every press '
    + 'on empty paper would stop at it and the compartment/tile hit test would never run — rooms '
    + 'would stop opening and armed orders would stop landing.');
  assert.equal(peOf('.ov-pawnlay .pl-pawn'), 'auto',
    'the FIGURES do not take the pointer back. `hitTest` resolves a crew click through '
    + '`target.closest(".pl-pawn")`, so with the sheet transparent and the figures transparent too, '
    + 'a press on a crew member lands on the room behind her: clicking a pawn silently stops '
    + 'selecting anybody, which is the affordance the owner reported by name on 2026-07-29.');
  // NON-VACUITY: the reader really can tell the two apart, and really can come back empty.
  assert.equal(peOf('.ov-nosuchclass'), null, 'the scan matches a selector that is not in the sheet');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WP-8 — the on-map WORK MARKERS (console-retirement plan §1(b) B4, ported off `hud.js`).
//
// READ THIS BEFORE CHANGING WHICH FIXTURE KEYS THESE USE. The acceptance is "a working pawn is
// tagged with its task; an idle one is not", and the fixture used to be incapable of driving it: its
// `roster` is a BOOT capture in which all 8 crew read deck 0 and task "Idle", while `frameDeck1` is
// deck 1 from later in the session. Driven from that pair, every assertion below would have PASSED
// while proving nothing — no crew on the drawn deck, no task but "Idle", so "no idle pawn is tagged"
// is trivially true of an empty set. `rosterDeck1` (added by WP-8: the most recent roster at the
// moment `frameDeck1` arrived, so the same sim state to within ≤1 render pass — NOT "the same
// Render() pass", which is the fixture note's retracted claim, since GameSession.cs sends `frame`
// at :1053 BEFORE `roster` at :1069) is what makes them bite. The first test here is the tripwire
// that keeps it so, and it VERIFIES the pairing by position agreement rather than assuming it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('WP-8: the fixture can actually DRIVE the work-marker acceptance (the anti-vacuity tripwire)', () => {
  // (a) the working/idle mix, read from the task strings, not from the code under test
  assert.ok(DECK1_WORKING.length >= 2,
    `rosterDeck1 has ${DECK1_WORKING.length} working crew; with fewer than 2 "a working pawn is tagged" `
    + 'is a claim about almost nothing');
  assert.ok(DECK1_IDLE.length >= 1,
    'rosterDeck1 has NO non-working crew, so "an idle pawn is NOT tagged" is vacuously true and the '
    + 'negative half of the acceptance cannot fail. Recapture with scratchpad/wp8-capture.mjs.');
  assert.equal(DECK1_WORKING.length + DECK1_IDLE.length, crewDeck1.length,
    'a rosterDeck1 task matched neither the working nor the idle pattern — this test no longer knows '
    + 'what the fixture contains, so every count below is being read for the wrong reason');
  // (b) the tag TEXT varies, so the assertions test content and not merely presence
  const tags = new Set(DECK1_WORKING.map((c) => taskTag(c.task)));
  assert.ok(tags.size >= 2, `rosterDeck1's working crew yield only ${[...tags]} — one tag proves the `
    + 'marker appears but never that it says the right thing');
  // (c) the pairing itself: the roster's crew are on the deck the frame draws
  assert.equal(frameDeck1.deck, 1);
  assert.ok(crewDeck1.every((c) => c.deck === 1),
    'rosterDeck1 has crew off deck 1 — it is not the roster of frameDeck1\'s tick');
  // (c2) THE PAIRING IS VERIFIED, NOT ASSUMED. Send order proves nothing here — the host emits
  // `frame` before `roster` in the same pass, so a capture pairs a frame with the PREVIOUS pass's
  // roster. What licenses the pairing is that they agree: every cid the frame draws stands on the
  // exact tile the roster reports. If a recapture ever lands a stale roster against a frame, the
  // crew will have moved and this is what says so.
  const frameAt = new Map((frameDeck1.crew || []).map((t) => [t[3], [t[0], t[1]]]));
  assert.equal(frameAt.size, crewDeck1.length,
    `frameDeck1 draws ${frameAt.size} crew but rosterDeck1 lists ${crewDeck1.length}`);
  for (const c of crewDeck1) {
    assert.deepEqual(frameAt.get(c.cid), [c.x, c.y],
      `cid ${c.cid} (${c.name}) stands at ${JSON.stringify(frameAt.get(c.cid))} in frameDeck1 but `
      + `rosterDeck1 puts it at [${c.x},${c.y}] — the two halves are from different ticks, so every `
      + 'on-map assertion below is comparing a label against the wrong pawn');
  }
  // (d) and the BOOT roster is still boot, which is exactly why it must never be paired with frameDeck1
  assert.ok(FIX.roster.crew.every((c) => c.deck === 0 && c.task === 'Idle'),
    'FIX.roster is no longer the all-idle boot capture the fixture note describes');
});

test('WP-8: a WORKING pawn is tagged with its task; an idle one is NOT', () => {
  const svg = mountPawns(baseState({ deck: 1, frame: frameDeck1, crew: crewDeck1, marks: marksDeck1 }));
  const labels = pawnLabels(svg);
  assert.equal(labels.size, crewDeck1.length, 'every on-deck crew member must carry a label');

  for (const c of DECK1_WORKING) {
    const l = labels.get(String(c.cid));
    const tag = taskTag(c.task);
    assert.ok(l, `no label for working crew ${c.cid}`);
    assert.ok(l.work, `${c.name} is "${c.task}" but its label is not marked as work`);
    assert.ok(l.text.includes(tag),
      `${c.name} is "${c.task}" but its on-map label reads "${l.text}" — no ${tag} tag. The map cannot `
      + 'answer "is this person actually working?", which is the whole point of the marker (B4).');
    assert.ok(l.text.includes(c.name.toUpperCase()), 'the label still carries the identity');
  }

  for (const c of DECK1_IDLE) {
    const l = labels.get(String(c.cid));
    assert.ok(l, `no label for idle crew ${c.cid}`);
    assert.equal(l.work, false, `${c.name} is "${c.task}" but its label is marked as work — the ABSENCE `
      + 'of a tag is the information, so tagging idle crew destroys the affordance');
    assert.equal(l.text, c.name.toUpperCase(),
      `${c.name} is "${c.task}" and must show a bare surname, but reads "${l.text}"`);
  }

  // The tag is the SHARED classifier, so both surfaces agree about who is working.
  assert.ok([...labels.values()].filter((l) => l.work).length === DECK1_WORKING.length);
});

test('WP-8: en-route and walking crew get NO tag — only work AT A PLACE counts', () => {
  // The host says "Heading to dig out …" for a crew member with a job who is still walking to it. A
  // tag floating over a walking pawn is the "claimed to be fixing X while doing nothing visible"
  // complaint the markers exist to answer, so `taskTag` returns null and the label stays bare.
  const synthetic = [
    { cid: 90, name: 'Ada Ross', role: 'crew', deck: 1, x: 5, y: 5, task: 'Heading to dig out 6,6' },
    { cid: 91, name: 'Bo Vance', role: 'crew', deck: 1, x: 20, y: 5, task: 'Walking to 7,11 (no task)' },
    { cid: 92, name: 'Cy Idris', role: 'crew', deck: 1, x: 35, y: 5, task: 'Servicing scrubber_ls' },
  ];
  const labels = pawnLabels(mountPawns(baseState({ deck: 1, frame: frameDeck1, crew: synthetic })));
  assert.equal(labels.get('90').text, 'ROSS');
  assert.equal(labels.get('90').work, false);
  assert.equal(labels.get('91').text, 'VANCE');
  assert.equal(labels.get('91').work, false);
  assert.equal(labels.get('92').text, 'IDRIS · SVC');
  assert.equal(labels.get('92').work, true);
});

test('WP-8: labels DE-CLUTTER — same-row pills never overlap, and a lifted one gets a leader', () => {
  // Eight pawns crowd the grid ship's hold, which is what made the pre-existing surname tags read as
  // `HALL(VE OKO NOV KAUR / SAT ITO YEMI`. Rows are the fix; this asserts the invariant directly.
  const cluster = [];
  for (let i = 0; i < 6; i++) {
    cluster.push({ cid: 200 + i, name: `Crew Halloran${i}`, role: 'crew', deck: 1, x: 24 + i, y: 14, task: 'Digging out 1,1' });
  }
  const lay = layoutPawnLabels(cluster.map((c) => ({ cid: c.cid, cx: 100 + (c.x - 24) * 14.7, w: 78, working: true })));
  const byRow = new Map();
  for (const c of cluster) {
    const r = lay.get(String(c.cid)).row;
    byRow.set(r, (byRow.get(r) || 0) + 1);
  }
  assert.ok(byRow.size >= 5, `6 labels 78 wide at a 14.7px pitch landed on only ${byRow.size} rows — `
    + 'they are still on top of each other');

  // Spans on the same row must be disjoint, for every row, by construction.
  const spans = new Map();
  for (const c of cluster) {
    const l = lay.get(String(c.cid));
    const cx = 100 + (c.x - 24) * 14.7;
    const span = [cx - 39, cx + 39];
    for (const s of (spans.get(l.row) || [])) {
      assert.ok(span[0] >= s[1] || span[1] <= s[0], `two labels overlap on row ${l.row}`);
    }
    spans.set(l.row, [...(spans.get(l.row) || []), span]);
  }

  // And in the real SVG a lifted label draws a leader line back to its pawn (an unattached pill
  // floating over a crowd is worse than no pill).
  const labels = pawnLabels(mountPawns(baseState({ deck: 1, frame: frameDeck1, crew: cluster })));
  const lifted = [...cluster].filter((c) => lay.get(String(c.cid)).row > 0);
  assert.ok(lifted.length >= 1);
  for (const c of lifted) {
    // the scene's own row assignment is recomputed there, so only assert that SOME label has a leader
    assert.ok([...labels.values()].some((l) => l.leader), 'no lifted label drew a leader line');
    break;
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE OVERLAP ACCEPTANCE, MEASURED OFF THE EMITTED RECTS — and why the test above is not enough.
//
// The sweep's job is "no two visible pills overlap". Its first version proved a strictly weaker
// thing: that same-ROW spans are horizontally disjoint. Those are not the same claim, because each
// pill hangs off its OWN pawn's feet (`baseY = fy - 24*S - 4`), so a pawn one tile lower sits ~15
// design px lower while a row step is 12 — "same row" therefore neither implies nor is implied by
// "same height". Driven from the package's own shipped fixture the weaker test passed while the
// scene emitted a real, visible collision: `OKONJO · DIG` × `NOVAK · DIG`, 18.5 × 10 px, about 91 %
// of a pill's height. Eight crew on alternating tile rows produced four such pairs.
//
// So this reads the `<rect>`s the scene ACTUALLY WROTE and intersects them in both axes. It is the
// acceptance; the row-level test above is kept because it pins the mechanism (rows, leaders).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Same 8 cids, re-placed and re-tasked — the vertical spread is the whole point of each case. */
const respread = (fn) => crewDeck1.map((c, i) => ({ ...c, ...fn(c, i) }));

const OVERLAP_CASES = [
  // The shipped fixture itself: the hold at x25-32, crew on tile rows y=15 AND y=16. This is the
  // case the package captured and called the label-overlap case, and it is where the row-only sweep
  // certified one overlapping pair.
  ['the shipped rosterDeck1 fixture (crew on tile rows 15 AND 16)', crewDeck1],
  // All eight on one tile row — the only arrangement the original Chrome measurement covered, and
  // the one arrangement in which "same row ⇒ same height" happens to be true.
  ['8 digging on a single tile row', respread((c, i) => ({ y: 15, x: 25 + i, task: 'Digging out 1,1' }))],
  // Alternating rows: the adversarial case for a row-index-only sweep.
  ['8 servicing on alternating tile rows', respread((c, i) => ({ y: 15 + (i % 2), x: 25 + i, task: 'Servicing scrubber_ls' }))],
];

test('WP-8: NO two visible pills overlap — measured on the EMITTED rects, in both axes', () => {
  for (const [name, crew] of OVERLAP_CASES) {
    const labels = pawnLabels(mountPawns(baseState({ deck: 1, frame: frameDeck1, crew })));
    // Non-vacuity: an empty or rect-less parse would make "0 overlaps" true of nothing.
    assert.equal(labels.size, crew.length, `${name}: parsed ${labels.size} labels for ${crew.length} crew`);
    for (const [cid, l] of labels) {
      assert.ok(l.rect && l.rect.w > 0 && l.rect.h > 0,
        `${name}: no pill rect parsed for cid ${cid} — this assertion is reading nothing`);
    }
    const bad = overlappingPairs(labels);
    assert.deepEqual(bad, [], `${name}: ${bad.length} overlapping label pair(s) — ${bad.join('; ')}.\n`
      + 'Pills collide vertically as well as horizontally, because each hangs off its own pawn\'s '
      + 'feet. The de-clutter sweep must compare whole rects (layoutPawnLabels + `baseY`), not spans '
      + 'within a row index.');
  }
});

test('WP-8: the two properties that must survive de-cluttering — a work tag is never hidden, and a '
  + 'leader line points at its OWN pawn', () => {
  for (const [name, crew] of OVERLAP_CASES) {
    const labels = pawnLabels(mountPawns(baseState({ deck: 1, frame: frameDeck1, crew })));
    let leaders = 0;
    for (const [cid, l] of labels) {
      assert.ok(!(l.work && l.crowded),
        `${name}: the work tag for cid ${cid} was marked crowded, i.e. rendered at opacity 0. A tag `
        + 'that vanishes when the room gets busy says "nobody here is working" at exactly the moment '
        + 'everybody is — that is the lie B4 exists to prevent. It may stack or overlap; never hide.');
      if (l.leaderX != null) {
        leaders += 1;
        // The pill is centred on its pawn's feet, so the leader must start at the pill's own centre;
        // any other x is a line pointing at somebody else's pawn.
        assert.ok(Math.abs(l.leaderX - (l.rect.x + l.rect.w / 2)) < 0.02,
          `${name}: cid ${cid}'s leader line starts at x=${l.leaderX} but its pill is centred at `
          + `${l.rect.x + l.rect.w / 2} — the line points at the wrong pawn, which is worse than no line`);
      }
    }
    // Non-vacuity for the leader half: at least one case must actually lift a label.
    if (name.startsWith('8 digging')) {
      assert.ok(leaders > 0, `${name}: nothing was lifted, so the leader-line assertion never ran`);
    }
  }
});

test('WP-8: when the rows run out an IDLE name may hide, but a WORK tag never does', () => {
  // The asymmetry is the honesty rule. Overlapping tags are ugly; a work tag that disappears when the
  // room gets busy says "nobody here is working" at exactly the moment everybody is.
  const many = [];
  for (let i = 0; i < LABEL_MAX_ROWS + 4; i++) many.push({ cid: 300 + i, cx: 500, w: 60, working: false });
  const idleLay = layoutPawnLabels(many);
  assert.ok([...idleLay.values()].some((l) => l.crowded),
    'more idle labels than rows and none was marked crowded — the last-resort case is unreachable');

  const manyWorking = many.map((l) => ({ ...l, working: true }));
  const workLay = layoutPawnLabels(manyWorking);
  assert.ok([...workLay.values()].every((l) => !l.crowded),
    'a WORK tag was marked crowded (i.e. hidden). It must stack or overlap, never vanish.');

  // Priority: working labels take the low, legible rows even when idle ones were listed first.
  const mixed = [
    { cid: 'i1', cx: 500, w: 60, working: false },
    { cid: 'i2', cx: 500, w: 60, working: false },
    { cid: 'w1', cx: 500, w: 60, working: true },
  ];
  assert.equal(layoutPawnLabels(mixed).get('w1').row, 0, 'the work tag did not get the closest row');
});

test('WP-8: layoutPawnLabels is deterministic and machine-independent (no locale sort)', () => {
  const labels = [
    { cid: 10, cx: 100, w: 40, working: false },
    { cid: 9, cx: 110, w: 40, working: false },
    { cid: 'ä', cx: 120, w: 40, working: false },
    { cid: 'z', cx: 130, w: 40, working: false },
  ];
  const a = layoutPawnLabels(labels);
  const b = layoutPawnLabels(labels.slice().reverse());
  for (const k of a.keys()) assert.deepEqual(a.get(k), b.get(k), `row for ${k} depends on input order`);
  assert.doesNotThrow(() => layoutPawnLabels(null));
  assert.equal(layoutPawnLabels(null).size, 0);
});

test('WP-8: the work-marker scene is still byte-deterministic', () => {
  const s = () => overviewScene(baseState({ deck: 1, frame: frameDeck1, crew: crewDeck1, marks: marksDeck1 }));
  assert.equal(s(), s());
});

test('the selected crew is marked, and exactly one of them is', () => {
  // ⭐ VR-P4 — SELECTION IS A RULE, NOT A GLOW. The warm surface drew a radial amber gradient under
  // the selected pawn, i.e. a `<defs>` + `<radialGradient>` with an `id` per repaint; the paper
  // dialect draws a solid ink underline through her feet, which needs no def at all — one fewer id
  // in a document whose collision-freedom is pinned two tests below. The property is unchanged:
  // exactly the selected pawn is marked, and no selection marks nobody.
  const cid = crew[0].cid;
  const svg = mountPawns(baseState({ deck: 0, selectedCid: cid }));
  // ⚠️ THE GROUP CARRIES A `transform` NOW (the mount places the figure), so the underline is no
  // longer the byte immediately after `data-cid="…">`. Anchoring on the literal would be a FALSE RED
  // about a package that did not touch the selection rule.
  const sel = /<g class="pl-pawn" data-cid="([^"]+)"[^>]*><path d="M[^"]*" stroke="#14120F"/g;
  const marked = [...svg.matchAll(sel)].map((m) => m[1]);
  assert.deepEqual(marked, [String(cid)], 'the selection rule is under the wrong pawn, or under none');
  // no selection → nothing marked at all
  const svgNone = mountPawns(baseState({ deck: 0 }));
  assert.equal([...svgNone.matchAll(sel)].length, 0);
  // …and the plate's OTHER selection cue: the compartment she is in takes the design's 2.2 px border.
  const anchor = view[0].slots[0].anchorName;
  const svgRoom = overviewScene(baseState({ deck: 0, selectedAnchor: anchor }));
  // ⚠️ THE OUTLINE IS A `<path>` AND THERE IS NO BORDER ON AN ORDINARY COMPARTMENT AT ALL — both
  // changes are the elevation's, and the second is the owner's complaint fixed at the root. VR-P4
  // gave every compartment a 1.4 px `<rect>` border, which is exactly what made the plate read as
  // "rooms weirdly separated in boxes"; the elevation draws SHARED PARTITION WALLS instead, so the
  // only outline that survives is the selection's own. The count of "every other tile keeps its
  // 1.4 px border" therefore has no subject and is DELETED rather than weakened — its replacement is
  // the assertion that exactly one compartment is outlined and the other seven are not.
  const selTile = /<g class="pl-room pl-room-sel"[^>]*>[\s\S]{0,900}?<path[^>]*stroke="#14120F"[^>]*stroke-width="2.2"/g;
  assert.equal((svgRoom.match(selTile) || []).length, 1,
    'exactly one compartment must carry the SELECTED 2.2px outline');
  assert.equal((svgRoom.match(/class="pl-room pl-room-sel"/g) || []).length, 1);
  // EXCLUSIVE, counted per COMPARTMENT GROUP rather than on the whole document.
  // ⚠️ A BARE `stroke-width="2.2"` COUNT DOES NOT WORK AND THE REASON IS WORTH A LINE: the
  // architecture is drawn through `sketch('strong')`, whose pressure ramp emits 2.2 as an ordinary
  // width — 153 times on this fixture. A token that the treatment can produce by accident cannot pin
  // a state. The group's own class is the fact, so the sweep splits on the compartment groups and
  // asks each one.
  // ⚠️ `pl-rooms` (the per-deck CONTAINER) shares the prefix with `pl-room` (a compartment), so the
  // split drops the containers explicitly rather than by luck — 72 chunks for 64 compartments was
  // the first reading, and a sweep that silently included eight wrappers would have reported the
  // wrong thing about the right property.
  const groups = svgRoom.split('<g class="pl-room').slice(1).filter((g) => !g.startsWith('s"'));
  assert.equal(groups.length, view.reduce((a, d) => a + d.slots.length, 0),
    'the group split did not find every compartment — this sweep is reading the wrong thing');
  const outlined = groups.filter((g) => /^ pl-room-sel"/.test(g));
  assert.equal(outlined.length, 1, 'more than one compartment carries the SELECTED class');
  for (const g of groups) {
    const body = g.slice(0, g.indexOf('</g>') + 1);
    const hasSel = /<path[^>]*stroke="#14120F"[^>]*stroke-width="2\.2"/.test(body);
    assert.equal(hasSel, /^ pl-room-sel"/.test(g),
      'a compartment draws the selection outline without the selected class, or the other way round');
  }
  assert.equal((overviewScene(baseState({ deck: 0 })).match(selTile) || []).length, 0);
});

test('terminals on the shown deck render as clickable pl-terminal markers; other decks / none do not', () => {
  const terminals = [
    { tid: 'con-1', deck: 0, x: 3, y: 2 },
    { tid: 'con-2', deck: 0, x: 6, y: 4 },
    { tid: 'con-off', deck: 1, x: 1, y: 1 }, // ANOTHER DECK — and it renders now, see below
    { tid: 'con-gone', deck: 99, x: 1, y: 1 }, // a deck the plate does not draw — must not render
  ];
  const svg = overviewScene(baseState({ deck: 0, terminals }));
  // ⚠️⚠️ THE DECK GATE IS GONE AND ITS REMOVAL IS THE FEATURE, so the old assertion is quoted rather
  // than edited: it read *"only the two on deck 0"* and `assert.ok(!svg.includes('con-off'))`. The
  // plate draws every deck, so a console on the other band is a console the player can SEE and press
  // — hiding it would be the "invisible feedback is FUNCTIONAL" defect, and it would hide the one on
  // the wreck's dead deck (`term_nav`, deck 1 — measured on the live wire), which is the only MOSS
  // terminal down there. What replaces the gate is the DRAWN-DECK bound: a terminal on a deck the
  // plate does not draw at all still renders nothing.
  assert.equal((svg.match(/class="pl-terminal"/g) || []).length, 3);
  assert.ok(svg.includes('data-tid="con-1"'));
  assert.ok(svg.includes('data-tid="con-2"'));
  assert.ok(svg.includes('data-tid="con-off"'), 'a console on another BAND is not drawn — the '
    + 'player can see that compartment, so hiding its console makes MOSS unreachable there');
  assert.match(svg, /data-tid="con-off" data-deck="1"/, 'the chip does not say which deck it is on');
  assert.ok(!svg.includes('data-tid="con-gone"'),
    'a terminal on a deck the plate does not draw was rendered — at what coordinates?');
  // no terminals channel → no terminal markers (graceful; unchanged scene)
  const svgNone = overviewScene(baseState({ deck: 0 }));
  assert.equal((svgNone.match(/class="pl-terminal"/g) || []).length, 0);
  // deterministic: same terminals → byte-identical
  assert.equal(overviewScene(baseState({ deck: 0, terminals })), svg);
});

test('furniture maps from the devices + items CHANNELS via the shared registry derivations', () => {
  // ⚠️⚠️ THE SOURCE CHANGED AND THE OLD ASSERTIONS WOULD HAVE BEEN VACUOUS, SO THEY ARE REPLACED
  // RATHER THAN EDITED. This test used to read:
  //   · "furniture only renders when the frame is for THIS deck"  → `frame: null` ⇒ no furniture
  //   · "a frame for a DIFFERENT deck contributes no furniture"   → `deck: 1` + deck-0 frame ⇒ none
  // Both were statements about a ONE-DECK source. The elevation draws every deck and takes its
  // fittings from `devices`/`items`, which carry every deck — so "the frame is for another deck" is
  // no longer a thing that can be true of the fitting layer, and asserting it would assert nothing.
  //
  // What replaces them is the property that is now load-bearing: THE PLATE FURNISHES EVERY DRAWN
  // DECK, and it furnishes NOTHING without the channels.
  const svg = overviewScene(baseState({ deck: 0 }));
  assert.match(svg, /class="pl-furniture"/);
  assert.ok((svg.match(/class="pl-item"/g) || []).length >= 5);

  // NO CHANNELS ⇒ NO FITTINGS, whatever the frame says. (The frame is still handed in, so a build
  // that quietly re-read glyphs would fail here rather than pass.)
  const svgNoChan = overviewScene(baseState({ deck: 0, devices: null, items: null }));
  assert.equal((svgNoChan.match(/class="pl-furniture"/g) || []).length, 0,
    'the plate drew fittings with no devices and no items on the wire — something is reading the '
    + 'frame\'s glyphs again, which can only ever furnish the ONE deck the host is projecting');

  // ⭐ AND MORE THAN ONE DECK IS FURNISHED AT ONCE — the whole point of the source change. Counted
  // per band off `data-deck`, so a single furnished deck cannot pass by being counted twice.
  const furnished = new Set(
    [...svg.matchAll(/<g class="pl-fit" data-tile="\d+,\d+" data-deck="(\d+)"/g)].map((m) => m[1]),
  );
  assert.ok(furnished.size >= 2,
    `only deck(s) ${[...furnished].join(',')} carry fittings — the plate draws every deck but`
    + ' furnishes one, which is the exact asymmetry `ship-fittings.js` exists to remove');
});

test('⭐⭐ EVERY COMPARTMENT FITTING SAYS WHICH ROOM IT STANDS IN — the join the layer split broke', () => {
  // ⛔ THE DEFECT THIS PACKAGE CREATED AND CLOSES. VR-P4 drew a compartment's fittings INSIDE its
  // own `<g class="pl-room">`, so `target.closest('.pl-room')` found the room from any pixel of any
  // piece. The elevation draws ONE fitting layer per BAND, above the compartments, because the
  // pieces must sort back-to-front across the whole deck floor for the oblique to read — which made
  // every fitting a SIBLING of the rooms and `closest` return null.
  //
  // MEASURED IN THE RUNNING GAME before the fix (`--ship wreck`, `elementFromPoint`):
  //   50 % of a compartment's height → a fitting path, closest('.pl-room') = null
  //   75 %                          → a fitting path, closest('.pl-room') = null
  //   90 % (bare floor)             → the compartment
  // i.e. a press on a compartment's CONTENTS did not open it and a hover over them did not wash it,
  // over most of its area. `data-anchor` on the piece restores the join without moving the drawing.
  const svg = overviewScene(baseState({ deck: 0 }));
  const pieces = [...svg.matchAll(/<g class="pl-fit" data-tile="(\d+),(\d+)" data-deck="(\d+)"([^>]*)>/g)]
    .map((m) => ({ tx: +m[1], ty: +m[2], deck: +m[3], attrs: m[4] }));
  assert.ok(pieces.length >= 20, `only ${pieces.length} fittings parsed — this reads nothing`);

  // Every piece inside a compartment names THAT compartment, and no other.
  const bad = [];
  let inRoom = 0, onWalk = 0;
  for (const p of pieces) {
    const slots = (view.find((d) => d.deck === p.deck) || { slots: [] }).slots;
    const own = slots.find((sl) => p.tx >= sl.rect.x && p.tx < sl.rect.x + sl.rect.w
      && p.ty >= sl.rect.y && p.ty < sl.rect.y + sl.rect.h);
    const m = /data-anchor="([^"]*)"/.exec(p.attrs);
    if (own) {
      inRoom += 1;
      if (!m) bad.push(`d${p.deck} ${p.tx},${p.ty} in ${own.anchorName} carries NO anchor`);
      else if (m[1] !== own.anchorName) bad.push(`d${p.deck} ${p.tx},${p.ty} names ${m[1]}, not ${own.anchorName}`);
    } else {
      onWalk += 1;
      // ⚠️ A WALKWAY PIECE CARRIES NO ANCHOR AT ALL — omitted, not emitted empty, so a reader
      // cannot mistake '' for a room called ''. There is no room to enter from the spine.
      if (m) bad.push(`d${p.deck} ${p.tx},${p.ty} is on the walkway and claims room ${m[1]}`);
    }
  }
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} fitting(s) misreport their compartment`);
  assert.ok(inRoom >= 15, `only ${inRoom} in-compartment fittings — the positive leg reads nothing`);
  assert.ok(onWalk >= 1, `no walkway fittings — the "no anchor off the spine" leg is vacuous`);
});

test('⛔ EVERY FITTING STROKE IS NON-SCALING — the 0.11 px hole a narrowed probe found', () => {
  // ⛔ MEASURED, NOT PREFERRED. `buildTileItem(id, {w: size, h: size})` emits its geometry under
  // `scale(size/128)`; at the plate's ~20.8 px piece that is `scale(0.163)`, and the builders'
  // authored widths of 0.7–1.8 land at **0.11–0.29 px on screen** — a stroke the browser
  // antialiases into a grey suggestion. `nonScaling` injects the attribute into the builder's own
  // output (the builders may not carry it: they are shared with the Room Zoom and the catalogue
  // sheets, where the pieces are drawn full size and must NOT have it).
  //
  // ⚠️⚠️ AND IT WAS ALREADY BROKEN ON VR-P4's PLATE, INVISIBLY, WHICH IS THE REASON THIS TEST IS
  // HERE RATHER THAN ONLY IN THE RIG. That rig probed `.ov-mini path` and passed if ANY of them
  // resolved to `non-scaling-stroke`; the compartment SHELL's paths carried it and the FITTINGS'
  // never did, so a guard whose scope included both was satisfied by the half that was fine —
  // CLAUDE.md's 4th shape, a guard whose scope filter excludes the violation. The live rig now
  // probes `.pl-fit path` alone; this is the same claim where node can see it.
  const svg = overviewScene(baseState({ deck: 0 }));
  const fits = [...svg.matchAll(/<g class="pl-fit"[^>]*>([\s\S]*?)<\/g><\/g>/g)].map((m) => m[1]);
  assert.ok(fits.length >= 10, `only ${fits.length} fittings parsed — this assertion reads nothing`);
  const bare = [];
  for (const body of fits) {
    for (const el of body.matchAll(/<(path|rect|circle|ellipse|line|polygon|polyline)\b([^>]*)>/g)) {
      if (!/stroke=/.test(el[2])) continue;                 // a fill-only face needs no stroke rule
      if (!/vector-effect="non-scaling-stroke"/.test(el[2])) bare.push(el[1] + el[2].slice(0, 60));
    }
  }
  assert.deepEqual(bare.slice(0, 5), [],
    `${bare.length} stroked element(s) inside a fitting carry no vector-effect. At the plate's `
    + 'scale(0.163) their strokes render at ~0.1 px and every compartment fades to blank paper.');
  // NON-VACUITY: the sweep really does see stroked elements, so an empty `bare` is not an empty scan.
  const stroked = fits.join('').match(/stroke="#/g) || [];
  assert.ok(stroked.length >= 20, `only ${stroked.length} strokes seen — the sweep is reading nothing`);
});

test('all element ids are collision-free across the single SVG document', () => {
  const svg = overviewScene(baseState({ deck: 0, selectedCid: crew[0].cid }));
  const { unique, total } = idStats(svg);
  assert.equal(unique, total, 'duplicate id in the SVG doc — a namespacing collision');
  // two scenes with distinct idPrefix never share an id
  const a = idStats(overviewScene(baseState({ deck: 0, idPrefix: 'A' }))).ids;
  const b = idStats(overviewScene(baseState({ deck: 0, idPrefix: 'B' }))).ids;
  assert.equal(a.filter((x) => b.includes(x)).length, 0);
});

test('unknown roomType and unknown glyphs degrade gracefully (no throw, no furniture)', () => {
  // Slot with an out-of-range roomType → neutral material, blank label falls back to anchor.
  const weird = {
    deck: 3,
    slots: [{
      slotIndex: 0, rect: { x: 0, y: 0, w: 12, h: 8 }, roomType: 99, anchorName: 'weird',
      material: 'steel-tan', floor: '#9c8763', line: 'rgba(0,0,0,.16)', labelColor: 'rgba(43,36,28,.72)',
      trim: 'rgba(232,147,74,.5)', displayName: 'weird', occupied: true, active: true, atmos: null,
    }],
  };
  const svg = overviewScene({ deck: 3, decksView: [weird], frame: null, crew: [] });
  assert.match(svg, /weird/);
  assert.equal((svg.match(/data-purpose="1"/g) || []).length, 1); // still marked as purposed

  // A frame full of glyphs NOTHING skins yields no furniture, no throw.
  //
  // ⚠️ THIS FIXTURE HAS NOW ROTTED TWICE, IN THE SAME WAY, AND BOTH ROTS ARE QUOTED — because a
  // "nothing skins these" fixture decays every single time the art set grows, and it decays SILENTLY
  // INTO ITS OPPOSITE: an assertion that the Overview draws no furniture for glyphs that now have
  // some. 2026-07-26 it read *"glyphs NOT in SPRITE_FOR_GLYPH (e.g. '\"','T','f')"* with cells
  // `[[34,…],[84,…]]` — `"` (GrowBed) and `T` (Terminal) — and those became hydroponics and the
  // research console (HANDOVER §4l). 2026-07-27 the replacement's `f` (102) became a POTATO: the
  // ground-item art skinned all eight `Glyphs.ForItem` glyphs, so this test was asserting that the
  // Overview draws no food. Now `q` (113) and `z` (122), which NO switch in the sim projects at all —
  // and `device-sprite-coverage.test.js` is what keeps this from silently becoming "the surface lost
  // its furniture layer": it fails if any DeviceKind OR ItemKind lands here.
  // ⚠️ RE-AIMED AT THE CHANNELS, because that is what the plate reads now. The GLYPH fixture below is
  // kept — a frame full of unskinnable glyphs must still produce nothing — but it can no longer
  // FAIL, so an unskinnable DEVICE KIND and an unskinnable ITEM KIND are driven beside it. Those two
  // are the ones that can now rot into their opposite as the art set grows, and
  // `device-sprite-coverage.test.js` is what keeps them honest: it fails if any real DeviceKind or
  // ItemKind lands here.
  const junkFrame = { deck: 0, w: 2, h: 1, lens: 'none', cells: [[113, 0, 0, 0], [122, 0, 0, 0]] };
  const svg2 = overviewScene({ deck: 0, decksView: view, frame: junkFrame });
  assert.equal((svg2.match(/class="pl-furniture"/g) || []).length, 0);
  const r0 = view[0].slots[0].rect;
  const svg3 = overviewScene({
    deck: 0, decksView: view, frame,
    devices: [{ x: r0.x, y: r0.y, deck: 0, kind: 250, cond: 255, oper: 1, open: 0 }],
    items: [{ x: r0.x + 1, y: r0.y, deck: 0, kind: 250, count: 1 }],
  });
  assert.equal((svg3.match(/class="pl-furniture"/g) || []).length, 0,
    'an unknown DeviceKind or ItemKind drew a piece — the plate is inventing art for a byte from a '
    + 'newer host');
});

test('the scene tolerates missing / empty state without throwing', () => {
  assert.doesNotThrow(() => overviewScene(undefined));
  assert.doesNotThrow(() => overviewScene({}));
  assert.doesNotThrow(() => overviewScene({ deck: 0, decksView: [] }));
  const svg = overviewScene({ deck: 0, decksView: [] });
  assert.match(svg, /class="pl-overview"/); // still a valid empty-deck scene (hull + space only)
});

test('the coordinate transform is the shared contract: project ∘ invert is identity', () => {
  const slots = view[0].slots;
  const t = makeShipTransform(view, frame);
  // a slot rect projects into its own band
  const band = t.deckInfo(0).band;
  const r = t.rect(slots[0].rect, 0);
  assert.ok(r.x >= BAY.x - 1 && r.x <= BAY.x + BAY.w + 1);
  assert.ok(r.y >= band.y - 1 && r.y <= band.y + band.h + 1);
  // round-trip a handful of tile coords through project → invert, on EVERY drawn deck
  for (const deck of t.deckOrder) {
    for (const [tx, ty] of [[0, 0], [8, 8], [22.5, 4.5], [44, 17]]) {
      const [sx, sy] = t.project(tx, ty, deck);
      const [bx, by, bd] = t.invert(sx, sy);
      assert.ok(Math.abs(bx - tx) < 1e-6 && Math.abs(by - ty) < 1e-6 && bd === deck,
        `deck ${deck} tile ${tx},${ty} round-tripped to ${bx},${by} on deck ${bd}`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WP-2 — DEBRIS + DESIGNATION MARKS on the Level-1 Overview (console-retirement plan §4.1 ii).
//
// THE ACCEPTANCE: "a designated tile renders differently from an undesignated one, asserted on the
// fg byte, driven from the real fixture". It is driven from `frameDeck1` — the WORKING capture, the
// only frame in this file that carries fg 4 (Debris, undesignated) and fg 15 (Designate) TOGETHER;
// at boot every live-wreck tile is designated, so a boot deck-1 frame has 15 and no 4 (fixture note).
//
// WHY THE fg BYTE IS THE WHOLE STORY HERE, and not a detail: all 33 of those cells carry the SAME
// glyph code, 37 (`'%'`). `cell[0]` cannot tell them apart, and 37 is in `NON_FURNITURE`, so before
// this package BOTH kinds of tile rendered as literally nothing. The census test below is the
// tripwire that keeps that true of the fixture — a recapture that loses the designations must fail
// loudly here rather than leave every assertion under it passing over an empty set.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every `<g class="mk mk-KIND">…</g>` in an SVG, as `{kind, body}`. Read out of the emitted string
 *  rather than recomputed, so what is asserted is what a browser would receive. */
function marks(svg) {
  const out = [];
  for (const m of svg.matchAll(/<g class="mk mk-([a-z]+)">([\s\S]*?)<\/g>/g)) {
    out.push({ kind: m[1], body: m[2] });
  }
  return out;
}

/** The fg-byte census of a frame: Map<fgByte, {count, glyphs:Set}>. Independent of the code under
 *  test — it reads the wire cells directly. */
function fgCensus(f) {
  const out = new Map();
  for (const c of f.cells) {
    if (!Array.isArray(c)) continue;
    const e = out.get(c[1]) || { count: 0, glyphs: new Set() };
    e.count += 1; e.glyphs.add(c[0]);
    out.set(c[1], e);
  }
  return out;
}

test('WP-2: the fixture can actually DRIVE the designation acceptance (the anti-vacuity tripwire)', () => {
  const census = fgCensus(frameDeck1);
  const debris = census.get(4);
  const desig = census.get(15);
  assert.ok(debris && debris.count >= 1,
    'frameDeck1 carries NO fg-4 (Debris) cell. Every "an undesignated tile renders as rubble" '
    + 'assertion below is then a claim about the empty set. The frame must be re-captured from a live '
    + '`--ship grid` host mid-dig, gated on "frameDeck1 carries fg 4 AND fg 15". (The fixture\'s own '
    + '`note` names a scratchpad capture script; it is NOT in the repo — do not go looking for it.)');
  assert.ok(desig && desig.count >= 1,
    'frameDeck1 carries NO fg-15 (Designate) cell, so "a designated tile renders differently" is '
    + 'unfalsifiable here. The capture script is predicate-gated on exactly this — see the fixture note.');
  // The measured census, pinned so a recapture that changes the wreck fails loudly instead of quietly.
  assert.equal(debris.count, 30);
  assert.equal(desig.count, 3);
  // THE LOAD-BEARING FACT: both kinds ride the SAME glyph, so `cell[0]` cannot distinguish them and
  // only `cell[1]` can. If this ever splits, the acceptance below stops testing what it claims to.
  assert.deepEqual([...debris.glyphs], [37]);
  assert.deepEqual([...desig.glyphs], [37]);
});

test('WP-2: a DESIGNATED tile renders differently from an UNDESIGNATED one on the Overview', () => {
  const svg = overviewScene(baseState({ deck: 1, frame: frameDeck1, crew: crewDeck1, marks: marksDeck1 }));
  const m = marks(svg);
  const debris = m.filter((k) => k.kind === 'debris');
  const dig = m.filter((k) => k.kind === 'dig');

  // one mark per marked cell, matching the fixture's own census — nothing dropped, nothing invented
  assert.equal(debris.length, 30);
  assert.equal(dig.length, 3);
  assert.equal(m.length, 33, 'the layer drew a mark for a byte that carries none');

  // THE ACCEPTANCE: the two are not the same drawing. Stated as a set difference rather than
  // "they are unequal", because two rubble piles at different tiles are unequal for a boring reason.
  const digShapes = new Set(dig.map((k) => k.body.replace(/[-\d.]+/g, '#')));
  const debShapes = new Set(debris.map((k) => k.body.replace(/[-\d.]+/g, '#')));
  for (const s of digShapes) {
    assert.ok(!debShapes.has(s),
      'a DESIGNATED tile emitted the same shape as an UNDESIGNATED one — the fg byte reached the '
      + 'layer but changed nothing, which is the whole of WP-2');
  }
  // …and specifically: the order ring is the difference, and only the designated tiles have it.
  assert.ok(dig.every((k) => k.body.includes('mk-order-ring')));
  assert.ok(debris.every((k) => !k.body.includes('mk-order-ring')));
  // both still carry rubble — a dig order does not replace the debris, it queues work on it
  assert.ok(dig.every((k) => k.body.includes('<path d="M')));
  assert.ok(debris.every((k) => k.body.includes('<path d="M')));
});

// ⚠️ THE FURNITURE HALF OF THIS PIN WAS DELIBERATELY REVERSED (2026-07-26, `lane/strip-visible`).
// It read `iFurn > iMarks` — "marks must draw UNDER the furniture" — on the stated grounds that *"a
// mark is a fact about the FLOOR, so a machine or a crew member standing on it must not be hidden
// behind it."*
//
// THAT PREMISE WAS TRUE ONLY BECAUSE OF A BUG. A mark could only ever be a floor fact here because a
// DEVICE tile could not carry a mark byte at all: `GlyphMapper` pass 4 repainted the device's own
// colour over `GlyphColor.Deconstruct`, so a condemned desk shipped fg 8 and the two layers were
// disjoint by construction. That is the owner-reported bug (HANDOVER §4g), reported three times, and
// it is now fixed in the mapper — so a mark CAN now be a fact about the device it sits on, and
// "under the furniture" would mean the amber ✕ is drawn behind the very desk it condemns: the byte
// present, correct, and invisible. Exactly the reported symptom, one layer lower.
//
// THE PAWN HALF IS UNCHANGED AND STILL LOAD-BEARING — a crew member must never be hidden by a mark.
// The two halves had one justification and now have two; splitting them is the point of this note.
test('WP-2: marks are placed on their own tiles, OVER the furniture and under the pawns', () => {
  const svg = overviewScene(baseState({ deck: 1, frame: frameDeck1, crew: crewDeck1, marks: marksDeck1 }));
  assert.match(svg, /<g class="pl-marks" pointer-events="none">/);
  // Layer order: floors → furniture → marks → … → pawns.
  const iRooms = svg.indexOf('<g class="pl-rooms">');
  const iMarks = svg.indexOf('<g class="pl-marks"');
  const iFurn = svg.indexOf('<g class="pl-furniture"');
  assert.ok(iRooms >= 0 && iMarks > iRooms, 'marks must draw over the room floors');
  assert.ok(iFurn >= 0 && iMarks > iFurn,
    'marks must draw OVER the furniture — a condemned DEVICE now carries fg 26, and beneath its own '
    + 'sprite its ✕ is invisible (the owner-reported symptom, one layer lower)');
  // ⭐ "UNDER THE PAWNS" IS NOT AN OFFSET IN THIS STRING ANY MORE (2026-08-05, the client-side
  // tween): the figures are in a persistent overlay stacked above the whole plate, so no layer built
  // here can cover one — which is strictly stronger than being concatenated first. The two halves
  // that now carry it are pinned by their own test above ('the SCENE draws no figures'); what stays
  // here is the half THIS fixture can see, namely that the scene really did stop drawing them.
  assert.equal(svg.indexOf('pl-pawn'), -1,
    'a figure is back in the plate string, under the mark layer this test is about');

  // Geometry: each mark lands inside the projected box of a cell that really carries its byte.
  const t = makeShipTransform(view, frameDeck1);
  const boxes = marksDeck1.map((mk) => t.rect({ x: mk.x, y: mk.y, w: 1, h: 1 }, 1));
  assert.equal(boxes.length, 33);
  for (const k of marks(svg)) {
    // Points: every `M x y` / `L x y` in a path, plus every rect's own origin.
    const pts = [...k.body.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map((mm) => [+mm[1], +mm[2]]);
    for (const rr of k.body.matchAll(/<rect[^>]*\sx="([-\d.]+)" y="([-\d.]+)"/g)) pts.push([+rr[1], +rr[2]]);
    assert.ok(pts.length > 0, 'a mark emitted no coordinates at all');
    const hit = boxes.some((b) => pts.every(([x, y]) => x >= b.x - 1 && x <= b.x + b.w + 1
      && y >= b.y - 1 && y <= b.y + b.h + 1));
    assert.ok(hit, 'a mark was drawn outside every marked tile\'s projected box');
  }
});

test('WP-2: a deck with no marked cell draws no mark layer at all', () => {
  // Deck 0's boot frame carries no fg 4/15/16/26 — asserted from the census, not assumed.
  const census = fgCensus(frame);
  for (const b of [4, 15, 16, 26]) assert.ok(!census.has(b), `frame (deck 0) unexpectedly carries fg ${b}`);
  const svg = overviewScene(baseState({ deck: 0 }));
  assert.equal((svg.match(/class="pl-marks"/g) || []).length, 0);
  assert.equal(marks(svg).length, 0);
  // …and marks for another deck are not borrowed. NOTE the deck gate now lives on the MARKS, not on
  // the frame: `marksDeck1` is handed in whole and every cell of it carries deck 1, so a scene drawn
  // for deck 7 must draw none of them. (It used to be phrased as "a frame for another deck is not
  // borrowed"; the frame no longer feeds this layer.)
  // ⚠️⚠️ THE DECK GATE MOVED FROM "the shown deck" TO "a deck the plate DRAWS", and that is the
  // elevation's doing. The old leg drew the scene for deck 7 and required deck 1's marks to be
  // ignored; the plate now draws deck 1 too, so a designation down there IS visible — which is the
  // point, because a designation the player cannot see is a designation they will re-place. The
  // bound that survives is the one that still means something: marks for a deck this ship does not
  // have are dropped, at what would otherwise be invented coordinates.
  const shown = overviewScene(baseState({ deck: 7, frame: frameDeck1, marks: marksDeck1 }));
  assert.equal(marks(shown).length, marksDeck1.length,
    'deck 1\'s designations vanished from a plate that DRAWS deck 1 — the player would re-place them');
  const offShip = marksDeck1.map((m) => ({ ...m, deck: 99 }));
  assert.equal(marks(overviewScene(baseState({ deck: 0, marks: offShip }))).length, 0,
    'a mark for a deck the plate does not draw was rendered — at what coordinates?');
  assert.equal(marksDeck1.length, 33, 'the adapter found no marks — the legs above are vacuous');
});

test('WP-2: the mark layer keeps the scene deterministic and adds no ids', () => {
  const st = () => baseState({ deck: 1, frame: frameDeck1, crew: crewDeck1, marks: marksDeck1 });
  assert.equal(overviewScene(st()), overviewScene(st()));
  // No <defs>/gradient/pattern ⇒ no new id namespace to collide (the id-collision test above still
  // counts only ov-* ids). Measured rather than asserted by construction:
  const svg = overviewScene(st());
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((mm) => mm[1]);
  assert.equal(new Set(ids).size, ids.length, 'the mark layer introduced a duplicate id');
  // THE CLAIM, made to bite: the layer itself emits no id at all, so it can never collide with the
  // `ov-*` namespace however many marks a deck carries. (The first draft compared id COUNTS against
  // a `frame: null` scene — which has no furniture ids either, so the comparison was vacuous: adding
  // 33 ids to the mark layer would still have passed it.)
  // The slice runs from the mark layer's open tag to the layer that follows it. The extraction is
  // anchored on the FOLLOWING layer rather than on a fixed count of `</g>` so that it fails loudly
  // if the order shifts instead of silently slicing the wrong bytes. ⚠️ The neighbour used to be
  // `pl-glow`; the glow layer is deleted with the warm skin, and the mark layer's successor on the
  // plate is whichever of ghosts/terminals/pawns this fixture produces — so the anchor is the NEXT
  // top-level `pl-` layer, and the assertion below proves the slice really is the mark layer.
  // ⚠️ …OR THE END OF THE DOCUMENT. The pawn layer was the last of those successors and it has left
  // the string entirely (the overlay), so on a fixture whose deck authors no ghost and no terminal
  // the mark layer is now the final layer — an anchor that REQUIRES a successor would fail for a
  // reason that has nothing to do with the ids this test is about (TRAPS-3's FALSE RED family).
  const layer = /<g class="pl-marks"[^>]*>([\s\S]*?)<\/g>(?:<g class="pl-|<\/svg>)/.exec(svg);
  assert.ok(layer, 'the mark layer was not found where the layer order puts it — this pin has rotted');
  assert.ok(layer[1].includes('class="mk mk-'), 'the extracted slice is not the mark layer');
  assert.equal((layer[1].match(/\bid="/g) || []).length, 0,
    'the mark layer emitted an id. It draws once per marked tile, so an id inside it is an id per '
    + 'tile — a <defs>/gradient/pattern here would collide across marks and across scenes.');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE VARIANT ARGUMENT — which of the three rubble arrangements a tile gets, and from WHOSE
// coordinates. `mark-overlay.js` exists so the two surfaces cannot disagree about the same tile, and
// the variant is the one input a call site can get wrong silently: a wrong arrangement is still a
// valid-looking rubble pile.
//
// ⚠️ AN ARGUMENT-ORDER SWAP CANNOT BE KILLED, AND THAT IS ARITHMETIC, NOT A HOLE. An independent
// review reported `markVariant(m.x, m.y)` -> `(m.y, m.x)` surviving all 692 node tests. MEASURED why:
// `markVariant(tx,ty) = (tx*7 + ty*13) % 3`, and 7 ≡ 13 ≡ 1 (mod 3), so it reduces to `(tx+ty) % 3` —
// COMMUTATIVE. The swap is a true equivalent mutant and no test can distinguish it. The commutativity
// is asserted below so that the day someone retunes those coefficients, this note stops being true
// LOUDLY rather than silently.
//
// What IS killable, and is killed here: passing the wrong tile's coordinates at all (a constant, the
// same coordinate twice, a neighbour). Both surfaces are pinned the same way — the emitted mark group
// is compared, byte for byte, against the shared builder invoked with THIS tile's variant.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('the Overview draws each mark with ITS OWN tile\'s variant', () => {
  const t = makeShipTransform(view, frameDeck1);
  const svg = overviewScene(baseState({ deck: 1, frame: frameDeck1, crew: crewDeck1, marks: marksDeck1 }));
  const drawn = marks(svg);
  assert.equal(drawn.length, marksDeck1.length, 'one drawn mark per channel cell');

  // The emitted groups are in the channel's own order (the layer walks the list), so they pair up
  // positionally. Compare each against the SHARED builder called with this tile's box and variant.
  let checked = 0;
  for (let i = 0; i < marksDeck1.length; i += 1) {
    const mk = marksDeck1[i];
    const r = t.rect({ x: mk.x, y: mk.y, w: 1, h: 1 }, mk.deck);
    const expect = markCellSvg(mk.mark, r.x, r.y, r.w, r.h, markVariant(mk.x, mk.y));
    assert.equal('<g class="mk mk-' + drawn[i].kind + '">' + drawn[i].body + '</g>', expect,
      `the mark at ${mk.x},${mk.y} was not drawn by markCellSvg with its own tile's variant`);
    checked += 1;
  }
  assert.ok(checked >= 30, `only ${checked} marks compared — the pin is thin`);

  // The variants actually VARY across this fixture, or a constant-variant mutation would pass.
  const vs = new Set(marksDeck1.map((mk) => markVariant(mk.x, mk.y)));
  assert.equal(vs.size, 3,
    'the wreck no longer spans all three rubble arrangements, so `markVariant(...) -> 0` would ' +
    'survive the comparison above');

  // …and the swap that cannot be killed, documented as arithmetic rather than as a coverage gap.
  for (let a = 0; a < 12; a += 1) {
    for (let b = 0; b < 12; b += 1) {
      assert.equal(markVariant(a, b), markVariant(b, a),
        'markVariant is no longer commutative, so an argument-order swap at either call site is now ' +
        'a REAL defect that nothing catches. Add an asymmetric assertion to both surfaces\' variant ' +
        'tests in the same commit as whatever retuned its coefficients.');
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ VR-P4 — THE SHIP PLATE. The four properties the redesign added, each pinned where it can bite.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('THE DECK STACK is DERIVED from the ship, and it degrades legibly rather than silently', () => {
  // ⚠️⚠️ THIS REPLACES VR-P4's TWO `E6` GRID TESTS, WHICH ASSERTED A THING THAT NO LONGER EXISTS.
  // They pinned `gridLayout(n) → {cols, rows, cells}` — the 4 × 2 COMPARTMENT GRID on ONE deck, and
  // `MIN_TILE`, its legibility floor. The side elevation has no grid: a deck is ONE continuous
  // floor, its compartments TILE it contiguously, and the thing that is derived is the DECK STACK.
  // Every structural claim those two tests made survives in a new subject, and they are listed so
  // the translation is visible rather than assumed:
  //     "derived from the census, not fixed"   → the band count is the DECK count.
  //     "extra rows shrink INSIDE the box"     → extra decks shrink the BAND HEIGHT inside `BAY`.
  //     "a positive floor, or it goes negative"→ `MIN_BAND_H`, same arithmetic, same hazard.
  //     "overflows says so"                    → unchanged, same field, same meaning.
  //     "the unfilled cell draws a dashed box" → GONE, and it is a DELETION with a reason: there is
  //         no cell to leave unfilled. Compartments tile the band by their own tile spans, so a
  //         census of three lays three compartments across the whole band and there is no fourth
  //         slot to draw dashed. The claim it protected — "a partly-built deck must not read as a
  //         full one" — is carried by the UNPURPOSED treatment instead (`data-purpose="0"` draws the
  //         floor in the UNBUILT dash), which is pinned by its own test above and by `no-add-room`.
  assert.deepEqual(
    [1, 2, 3, 8].map((n) => bandLayout(Array.from({ length: n }, (_, i) => i)).bands.length),
    [1, 2, 3, 8], 'the stack no longer draws one band per deck');

  // ⭐ THE ORDER IS `deckPips`' ORDER — HIGHEST DECK ON TOP — so the rail and the drawing agree.
  assert.deepEqual(bandLayout([0, 1, 2]).bands.map((b) => b.deck), [2, 1, 0]);
  assert.deepEqual(bandLayout([1, 0, 1]).bands.map((b) => b.deck), [1, 0], 'duplicates are not bands');

  // ⛔ THE BAND HEIGHT HAS A POSITIVE FLOOR, AND THE SAMPLE GOES PAST WHERE IT WOULD GO NEGATIVE.
  for (const n of [1, 2, 4, 8, 12, 20, 60]) {
    const l = bandLayout(Array.from({ length: n }, (_, i) => i));
    assert.ok(l.h >= MIN_BAND_H, `${n} decks produced a ${l.h} band — below the floor, possibly negative`);
    assert.ok(l.gap >= 0 && Number.isFinite(l.gap));
    const stack = n * l.h + (n - 1) * l.gap;
    assert.equal(stack <= BAY.h + 0.01, !l.overflows,
      `${n} decks: \`overflows\` says ${l.overflows} but the stack ${stack} ${stack <= BAY.h ? 'does' : 'does not'} fit ${BAY.h}`);
    // …and every band is a real, non-inverted box.
    for (const b of l.bands) assert.ok(b.h > 0 && Number.isFinite(b.y));
  }

  // THE CROSSING, NAMED AND MEASURED so a future edit to the floor, the gap or the bay cannot move
  // it quietly. Two decks (the wreck) fit; the shipped fixture's eight (`--ship grid`) do not.
  assert.equal(bandLayout([0, 1]).overflows, false, 'the wreck\'s two decks no longer fit the bay');
  assert.equal(bandLayout([0, 1, 2, 3, 4, 5, 6, 7]).overflows, true,
    'eight decks now fit the bay — the floor is unreachable and the degradation is untested');

  // …and hostile input does not throw or produce a NaN stack.
  for (const bad of [null, undefined, NaN, -3, 'x', {}]) {
    const l = bandLayout(/** @type {any} */ (bad));
    assert.ok(l.bands.length >= 1 && Number.isFinite(l.h) && l.h > 0);
  }

  // ⚠️ AND THE REALITY CHECK: the SHIPPED ship is the wreck, which has two decks; this fixture is
  // `--ship grid`, an economy fixture never offered to a player (CLAUDE.md), and its eight decks are
  // exactly why the degradation above is real, stated, and reachable in a test.
  assert.equal(view.length, 8, 'the captured ship no longer has 8 decks — the overflow leg is vacuous');
});

test('THE COMPARTMENT SPANS ARE PROPORTIONAL TO THEIR TILE SPANS — dimensional honesty, driven', () => {
  // ⭐ THE OWNER'S STANDING CAVEAT, and it is satisfied BY CONSTRUCTION rather than by arrangement:
  // `slotSpans` hands each slot a share of the band's u axis equal to its share of the deck's total
  // tile-x span. Asserted as a RATIO so it cannot be satisfied by every compartment being equal on a
  // fixture where every rect happens to be equal.
  const spans = slotSpans(view[0].slots);
  assert.equal(spans.length, view[0].slots.length, 'a slot lost its span');
  const total = view[0].slots.reduce((a, sl) => a + sl.rect.w, 0);
  for (const sp of spans) {
    assert.ok(Math.abs((sp.u1 - sp.u0) - sp.rect.w / total) < 1e-9,
      `${sp.slot.anchorName} takes ${(sp.u1 - sp.u0).toFixed(4)} of the band for ${sp.rect.w} of ${total} tiles`);
  }
  // CONTIGUOUS AND COMPLETE: no gap, no overlap, and the whole band is spent.
  assert.equal(spans[0].u0, 0);
  assert.ok(Math.abs(spans[spans.length - 1].u1 - 1) < 1e-9);
  for (let i = 1; i < spans.length; i += 1) assert.equal(spans[i].u0, spans[i - 1].u1);

  // NON-VACUITY, DRIVEN: a deck whose compartments have DIFFERENT tile spans must get different
  // band shares, in the same ratio. Without this the loop above passes on any equal-width fixture.
  const mk = (i, w) => ({ ...view[0].slots[0], slotIndex: i, anchorName: 'a' + i, rect: { x: i * 20, y: 0, w, h: 8 } });
  const uneven = slotSpans([mk(0, 6), mk(1, 12), mk(2, 18)]);
  assert.deepEqual(uneven.map((sp) => +(sp.u1 - sp.u0).toFixed(6)), [0.166667, 0.333333, 0.5],
    'a 6/12/18-tile deck did not lay its compartments 1:2:3 — the widths are eyeballed, not derived');
  // A slot the wire gave no geometry gets NO span and no drawn compartment: inventing a width for it
  // would put a pressable room on the plate that the ship does not have.
  assert.equal(slotSpans([mk(0, 6), { ...mk(1, 0), rect: { x: 0, y: 0, w: 0, h: 0 } }]).length, 1);
});

test('THE ELEVATION TRANSFORM: project ∘ invert is identity for EVERY TILE OF EVERY DECK, and the '
  + 'walkway is not a special case', () => {
  const t = makeShipTransform(view, frame);

  // ⭐⭐ (a) THE FULL CENSUS, not a sample. This is the property the order verbs' click→tile path
  //     (BUG-B's `getScreenCTM().inverse()` route) actually needs, and the elevation makes it cheap
  //     enough to assert exhaustively: every tile of every drawn deck, both regions.
  let checked = 0;
  const bad = [];
  for (const deck of t.deckOrder) {
    for (let ty = 0; ty < frame.h; ty += 1) {
      for (let tx = 0; tx < frame.w; tx += 1) {
        const [sx, sy] = t.project(tx + 0.5, ty + 0.5, deck);
        const [bx, by, bd] = t.invert(sx, sy);
        checked += 1;
        if (Math.floor(bx) !== tx || Math.floor(by) !== ty || bd !== deck) {
          bad.push(`d${deck} ${tx},${ty} → ${bx.toFixed(3)},${by.toFixed(3)} d${bd}`);
        }
      }
    }
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} of ${checked} tiles did not round-trip`);
  assert.ok(checked >= 6000, `only ${checked} tiles swept — the census is reading nothing`);

  // (b) EACH COMPARTMENT'S OWN TILES LAND IN ITS OWN DRAWN REGION. A single map over the whole deck
  //     would put compartment 7's tiles in compartment 3's place and the drawing would be a lie.
  // ⚠️ THE SAMPLE IS THE RECT'S CENTRE, NOT ITS ORIGIN, and that is a fact about the SHIP rather
  // than a convenience: adjacent compartments SHARE a wall column on this fixture (`quarters` runs
  // x 0..11 and `mess` x 11..22), so the tile at a rect's origin is covered by two slots and the
  // transform resolves it to the first — which is the only answer an ordered map can give, and is
  // why `hitTest`'s DOM tier, not this arithmetic, decides which room a click enters.
  const slots = view[0].slots;
  const shared = slots.filter((sl) => slots.some((o) => o !== sl
    && sl.rect.x >= o.rect.x && sl.rect.x < o.rect.x + o.rect.w
    && sl.rect.y >= o.rect.y && sl.rect.y < o.rect.y + o.rect.h));
  assert.ok(shared.length >= 1, 'no compartment shares a wall column — the caveat above has rotted');
  for (const sl of slots) {
    const box = t.cellOf(sl, 0);
    assert.ok(box, `${sl.anchorName} has no drawn region`);
    const [sx, sy] = t.project(sl.rect.x + sl.rect.w / 2, sl.rect.y + sl.rect.h / 2, 0);
    assert.ok(sx >= box.x - 0.01 && sx <= box.x + box.w + 0.01
      && sy >= box.y - 0.01 && sy <= box.y + box.h + 0.01,
    `${sl.anchorName}'s own centre tile projected outside its own drawn region`);
  }

  // (c) EVERY PIXEL OF A BAND ADDRESSES A TILE ON THAT DECK. A band's BOX is bigger than the floor
  //     PARALLELOGRAM drawn on it — the back wall, the ceiling cut and the margin are all band and
  //     none of them are floor — so this is the property the `(u,v)` clamp in `invert` exists for:
  //     without it a press in the back-wall third solves off the floor, `tileAt` returns null and an
  //     armed DIG silently does nothing over a third of the drawing.
  const band0 = t.deckInfo(0).band;
  let sampled = 0;
  for (let i = 0; i <= 24; i += 1) {
    for (let j = 0; j <= 10; j += 1) {
      const px = BAY.x + (BAY.w * i) / 24, py = band0.y + (band0.h * j) / 10;
      assert.ok(t.hits(px, py), 'a point inside the band box is reported as off-plate');
      const [tx, ty, td] = t.invert(px, py);
      sampled += 1;
      assert.equal(td, 0, `a press inside deck 0's band resolved to deck ${td}`);
      assert.ok(tx >= 0 && tx <= frame.w && ty >= 0 && ty <= frame.h,
        `a press at ${px},${py} resolved to ${tx},${ty} — off the deck entirely`);
    }
  }
  assert.ok(sampled >= 200, `only ${sampled} in-band points sampled — the leg is reading nothing`);

  // (d) THE WALKWAY IS THE SAME MAP, NOT A SECOND ONE — which is the structural difference from
  //     VR-P4's plate. There the spine had its own linear map into a reserved row gap (a piecewise
  //     fallback with its own header and its own stated resolution limit); here it is simply the
  //     front `V_SPINE` of the deck's own floor plane, so its round trip is the census above.
  const covers = (tx, ty) => slots.some((sl) => tx >= sl.rect.x && tx < sl.rect.x + sl.rect.w
    && ty >= sl.rect.y && ty < sl.rect.y + sl.rect.h);
  const outside = [];
  for (let ty = 0; ty < frame.h && outside.length < 6; ty += 1) {
    for (let tx = 0; tx < frame.w && outside.length < 6; tx += 1) if (!covers(tx, ty)) outside.push([tx, ty]);
  }
  assert.ok(outside.length >= 4, 'this deck has no out-of-compartment tile — leg (d) is vacuous');
  for (const [tx, ty] of outside) {
    const uv = t.tileUV(tx + 0.5, ty + 0.5, 0);
    assert.ok(uv[1] < V_SPINE,
      `the spine tile ${tx},${ty} solved to v=${uv[1]}, which is compartment depth, not walkway`);
  }
  // …and a COMPARTMENT tile is on the other side of the same line, so the split is real.
  const inUv = t.tileUV(slots[0].rect.x + 0.5, slots[0].rect.y + 0.5, 0);
  assert.ok(inUv[1] >= V_SPINE, 'a compartment tile landed on the walkway — the regions have merged');
});

test('THE FLOOR PLANE IS THE OBLIQUE KIT\'S, and its inverse is exact', () => {
  // ⛔ THE BASIS IS READ OFF `roomFrame`, NEVER RE-TYPED — the discipline VR-P4's send-back
  // established after review measured 57 of 59 drawn fittings clicking a different tile than the one
  // they were drawn on. This asserts the two halves are exact inverses in the PLANE's own terms, so
  // a drift in `DEPTH_RATIO` moves both together or fails here.
  const plane = deckPlane(bandLayout([0, 1]).bands[0]);
  assert.ok(plane.det !== 0, 'the floor basis is degenerate — nothing can be inverted');
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.137, 0.921]]) {
    const [px, py] = floorPoint(plane, u, v);
    const [bu, bv] = floorSolve(plane, px, py);
    assert.ok(Math.abs(bu - u) < 1e-9 && Math.abs(bv - v) < 1e-9,
      `(${u},${v}) → (${px},${py}) → (${bu},${bv})`);
  }
  // THE OBLIQUE IS REAL: going BACK moves right and UP, which is what makes the band read as a
  // cutaway rather than a strip. A degenerate plane (BV = 0) would invert fine and draw a flat rail.
  assert.ok(plane.BV[0] > 0, 'depth no longer displaces to the right — the oblique is gone');
  assert.ok(plane.BV[1] < 0, 'depth no longer rises — the oblique is gone');
  assert.ok(plane.wall > 0, 'the deck has no height, so no partition can stand on it');
});

test('⭐⭐ D5 RE-HOUSED: a compartment that needs attention takes the OXBLOOD DASHED border, and '
  + 'nothing else on the plate does', () => {
  const anchor = view[0].slots[2].anchorName;
  const svg = overviewScene(baseState({ deck: 0, attentionAnchors: [anchor] }));
  // The tile is marked as a group AND drawn in the dialect — a class alone would be a state nothing
  // renders, which is `invisible-feedback-is-FUNCTIONAL` in its cheapest form.
  assert.equal((svg.match(/class="pl-room pl-room-attend"/g) || []).length, 1);
  // ⚠️ THE OUTLINE IS A `<path>` NOW, NOT A `<rect>`, and the change is geometric rather than
  // cosmetic: a compartment is no longer an axis-aligned box on a grid — it is a region of an
  // OBLIQUE deck floor plus the wall standing behind it, so its outline is the six-point polygon
  // `spanBox`/`compartment` trace. The DIALECT is untouched: oxblood `#7B2C22`, dash `8 5`.
  const tile = /<g class="pl-room pl-room-attend"[^>]*data-anchor="([^"]+)"[^>]*>[\s\S]{0,900}?<path[^>]*stroke="#7B2C22"[^>]*stroke-dasharray="8 5"/.exec(svg);
  assert.ok(tile, 'the attention compartment is not drawn in oxblood + the queued-order dash (charter §1)');
  assert.equal(tile[1], anchor, 'the oxblood outline landed on the wrong compartment');
  // NON-VACUITY / NEGATIVE CONTROL: with nothing stuck, no compartment is in the accent at all.
  const calm = overviewScene(baseState({ deck: 0 }));
  assert.equal((calm.match(/pl-room-attend/g) || []).length, 0);
  assert.equal((calm.match(/<g class="pl-room[^"]*"[^>]*>[\s\S]{0,900}?<path[^>]*stroke="#7B2C22"[^>]*stroke-dasharray="8 5"/g) || []).length, 0,
    'a compartment is drawn in the accent with nothing wrong — the one accent has been spent on nothing');
  // …and a CONDEMNED tile puts its own compartment in the accent too, from the marks channel alone.
  const s0 = view[0].slots[0];
  const condemned = overviewScene(baseState({
    deck: 0, marks: [{ x: s0.rect.x, y: s0.rect.y, deck: 0, kind: 3, mark: 'condemn' }],
  }));
  assert.match(condemned, /class="pl-room pl-room-attend"[^>]*data-anchor="[^"]*"/);
});

test('the two ATTENTION arms have different deck scopes, and both are deliberate', () => {
  // ⚠️ WITH BOTH DECKS DRAWN THIS ASYMMETRY IS VISIBLE, so it is pinned as a decision rather than
  // left to look like a bug. See `attentionAnchors`' header for the full argument.
  //   · CONDEMN is ALL-DECK: the ✕ is drawn on whichever band it is on, so the outline points at
  //     something the player can already see.
  //   · STUCK ORDERS follow the ORDER DECK, because the outline and the oxblood sentence in the
  //     `compartments` column are ONE derivation (ruling E4). A warning nothing explains is D5's own
  //     defect inverted.
  const other = view.find((d) => d.deck === 1);
  const s0 = other.slots[0];

  // 1 — a condemn mark on the NON-active deck accents THAT deck's compartment.
  const svg = overviewScene(baseState({
    deck: 0, marks: [{ x: s0.rect.x, y: s0.rect.y, deck: 1, kind: 3, mark: 'condemn' }],
  }));
  assert.match(svg, new RegExp(`pl-room-attend"[^>]*data-anchor="${s0.anchorName}" data-deck="1"`),
    'a condemned tile on the band that is not the order deck did not accent its own compartment — '
    + 'its ✕ is drawn there and nothing says why');
  assert.equal((svg.match(/pl-room-attend/g) || []).length, 1, 'the accent spread beyond its own room');

  // 2 — …and it lands on the RIGHT deck, not on a same-coordinates compartment of the active one.
  const sameXy = view.find((d) => d.deck === 0).slots
    .find((sl) => sl.rect.x === s0.rect.x && sl.rect.y === s0.rect.y);
  if (sameXy) {
    assert.ok(!new RegExp(`pl-room-attend"[^>]*data-anchor="${sameXy.anchorName}"`).test(svg),
      'the condemn accent landed on the same TILE COORDINATES of the ACTIVE deck — the mark\'s own '
      + '`deck` is being ignored, which is the whole hazard of drawing two decks at once');
  }

  // 3 — the STUCK-ORDER arm takes whatever the caller hands it, and the caller scopes it to the
  //     order deck. Asserted here as the CONTRACT (an anchor in, that anchor accented) so that a
  //     later lane widening the column can widen this without touching the composer.
  const a0 = view[0].slots[2].anchorName;
  const stuck = overviewScene(baseState({ deck: 0, attentionAnchors: [a0] }));
  assert.match(stuck, new RegExp(`pl-room-attend"[^>]*data-anchor="${a0}" data-deck="0"`));
  assert.equal((stuck.match(/pl-room-attend/g) || []).length, 1);
});

test('the STARFIELD is the persistent skeleton layer and is NEVER in the repainted scene string', () => {
  // ⛔ THE WHOLE POINT OF THE SPLIT. The scene is `innerHTML`-swapped on every 10 Hz wire frame; a
  // CSS-animated field written into that string restarts its drift ten times a second, which reads
  // as a static field with a stutter. So `starLayerSvg` is injected ONCE into `.ov-space` and the
  // scene must contain none of it.
  const field = starLayerSvg();
  assert.match(field, /class="ov-stars"/);
  assert.equal((field.match(/ov-stars-drift/g) || []).length, 3, 'the three parallax layers are the design\'s');
  assert.match(field, /fill="#14120F"/, 'the field is INK ON PAPER now — no cream stars in this dialect');
  assert.equal((field.match(/opacity="0.5"|opacity="0.34"|opacity="0.2"/g) || []).length, 3,
    'the measured parallax opacities (.5/.34/.2) moved');
  const svg = overviewScene(baseState({ deck: 0 }));
  for (const token of ['ov-stars', 'pl-stars', 'ov-stars-drift']) {
    assert.ok(!svg.includes(token),
      `the scene string carries "${token}" — the drifting field is back inside the repaint and its `
      + 'animation now restarts at the wire\'s render rate');
  }
});

test('⭐⭐ THE DRAWING AND THE CLICK MAP ARE ONE: a point inside a fitting\'s own drawn footprint '
  + 'designates the tile that fitting is drawn on', () => {
  // ⛔ THIS IS THE ACCEPTANCE FOR THE TWO-COORDINATE-SYSTEMS DEFECT. Review measured it in the
  // running game at VR-P4: with the fittings placed through the oblique and the click map reading an
  // axis-aligned cell box, 57 of 59 drawn pieces on the wreck's deck 0 clicked a DIFFERENT tile
  // (dy up to +7) and 49 had NOT ONE PIXEL of their own ink that clicked their own tile. A surface
  // that shows you one thing and orders another is the worst failure this repo has a name for.
  //
  // ⭐ IT IS SIMPLER TO STATE NOW AND THAT IS THE STRUCTURAL WIN: the plate has ONE coordinate
  // system, so a piece's drawn base point is already in the space `invert` takes. VR-P4's version had
  // to carry each sample mini → scene through `miniToScene` because every compartment had its own
  // nested `<svg>`; there is no nested viewBox left, so there is no second space to get wrong.
  const svg = overviewScene(baseState({ deck: 0 }));
  const t = makeShipTransform(view, frame);

  // Each drawn fitting says which TILE and which DECK it was drawn for, beside the translate that
  // places it. ⚠️ THE FIRST VERSION OF THIS PARSE (at VR-P4) INFERRED THE TILE FROM THE PIECE'S
  // `<defs>` ID and was WRONG: a builder that emits no def has no id, so the non-greedy scan walked
  // on and paired that piece's translate with the NEXT piece's tile — 20 false failures. The emitted
  // attributes remove the inference entirely.
  const pieces = [...svg.matchAll(
    /<g class="pl-fit" data-tile="(\d+),(\d+)" data-deck="(\d+)"[^>]*? transform="translate\(([-\d.]+) ([-\d.]+)\)"/g,
  )].map((m) => ({ tx: +m[1], ty: +m[2], deck: +m[3], x: +m[4], y: +m[5] }));
  assert.ok(pieces.length >= 20,
    `only ${pieces.length} fittings parsed out of the plate — this assertion is reading nothing`);
  assert.ok(new Set(pieces.map((p) => p.deck)).size >= 2,
    'every parsed fitting is on one deck — the sweep cannot see a cross-deck mix-up');

  // The emitted translate puts the piece's box top-left at (x, y); it STANDS on the floor, so its own
  // floor point is the bottom-CENTRE of that box — the point `fittingLayer` projected.
  const size = Math.max(10, t.tileSize * 2.2);
  const bad = [];
  for (const p of pieces) {
    const info = t.deckInfo(p.deck);
    const sp = info.spans.find((c) => p.tx >= c.rect.x && p.tx < c.rect.x + c.rect.w
      && p.ty >= c.rect.y && p.ty < c.rect.y + c.rect.h);
    const baseX = p.x + size / 2, baseY = p.y + size;
    // Sample the piece's own footprint: its base, and a quarter of a tile out in each direction —
    // measured in PLATE px off this deck's real basis, so the sample is a fact about the drawing.
    // ⚠️ THE SAMPLE STEP IS THE PIECE'S OWN REGION'S TILE SIZE, and a WALKWAY piece's is not a
    // compartment's. A spine tile occupies `V_SPINE` of the band's depth spread over the deck's WHOLE
    // `ty` extent — on this fixture ~0.3 × 26 px over 18 tiles, i.e. ~0.44 px, against a
    // compartment's ~2.3 px. Stepping a compartment's quarter-tile from a walkway piece's base walks
    // clean off the walkway and lands in the compartment behind it: 32 false failures, all on spine
    // tiles, which is what caught this.
    const dx = (sp ? (sp.u1 - sp.u0) * info.plane.across / sp.rect.w
      : info.plane.across / (frame.w || 1)) / 4;
    const dy = (sp ? (1 - V_SPINE) * info.plane.depthY / sp.rect.h
      : V_SPINE * info.plane.depthY / (frame.h || 1)) / 4;
    for (const [ox, oy] of [[0, 0], [dx, 0], [-dx, 0], [0, dy], [0, -dy]]) {
      const [tx, ty, td] = t.invert(baseX + ox, baseY + oy);
      if (Math.floor(tx) !== p.tx || Math.floor(ty) !== p.ty || td !== p.deck) {
        bad.push(`d${p.deck} piece at tile ${p.tx},${p.ty} — a press on its footprint `
          + `(${ox.toFixed(1)},${oy.toFixed(1)} from its base) designates ${Math.floor(tx)},${Math.floor(ty)} on d${td}`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 8), [],
    `${bad.length} of ${pieces.length * 5} sampled footprint points designate the WRONG tile. The `
    + 'drawing and the click map have come apart again: `fittingLayer` places through `floorPoint` '
    + 'and `makeShipTransform.invert` must undo exactly that.');
});

test('THE WALKWAY IS DRAWN: a tile inside no compartment still reaches the plate', () => {
  // ⛔ WHAT THIS PINS, AND WHY IT IS NOT A DETAIL. Review measured at VR-P4 that 83 deck-0 floor
  // tiles, two ground items and the HATCH LADDER at (22,8) — the visible deck-to-deck route on the
  // shipped wreck — lie inside no slot rect, and with a compartment grid alone they were on NO
  // SURFACE at Level 1 at all. A plate that draws every room and none of the corridor between them
  // is a floor plan with the doors painted out.
  //
  // ⚠️ THE FIX IS STRUCTURALLY DIFFERENT NOW AND THE TEST SAYS SO. VR-P4 reserved the grid's own row
  // gap as a CORRIDOR STRIP with its own linear map, its own layer (`pl-corridor`) and its own
  // stated resolution limit. The elevation has no strip and no second map: the walkway is the front
  // `V_SPINE` of the deck's own floor plane, its items are drawn by the ORDINARY fitting layer, and
  // its round trip is part of the full census above. So the assertion moved from "there is a
  // corridor layer and the ladder is in it" to "the ladder is DRAWN, on the WALKWAY, and a press on
  // it designates it".
  const slot = {
    ...view[0].slots[0], slotIndex: 0, roomType: 5, anchorName: 'a0', displayName: 'A0',
    rect: { x: 0, y: 0, w: 4, h: 4 },
  };
  const w = 8, h = 8;
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];      // '.' floor
  const LADDER = 3;   // DeviceKind.Ladder — `itemForDeviceRow` skins it as the deck hatch
  const BED = 17;     // DeviceKind.Bed
  const st = {
    deck: 2, decksView: [{ deck: 2, slots: [slot] }], marks: [],
    frame: { deck: 2, w, h, lens: 'none', cells },
    devices: [
      { x: 1, y: 1, deck: 2, kind: BED, cond: 255, oper: 1, open: 0 },     // INSIDE the room
      { x: 6, y: 6, deck: 2, kind: LADDER, cond: 255, oper: 1, open: 0 },  // in the SPINE
    ],
  };
  const svg = overviewScene(st);
  const t = makeShipTransform(st.decksView, st.frame);

  // BOTH are drawn, and each says which tile it is for.
  assert.match(svg, /<g class="pl-fit" data-tile="6,6" data-deck="2"/,
    'the ladder at 6,6 — inside no compartment — is not drawn. The deck-to-deck route is invisible '
    + 'at Level 1, which is the defect the walkway exists to close.');
  assert.match(svg, /<g class="pl-fit" data-tile="1,1" data-deck="2"/, 'the in-room bed vanished');

  // …and the ladder really is ON THE WALKWAY while the bed is in the compartment — the split that
  // makes the round trip exact. Without this the test passes on a build that drew both in one place.
  assert.ok(t.tileUV(6.5, 6.5, 2)[1] < V_SPINE, 'the spine tile is not on the walkway');
  assert.ok(t.tileUV(1.5, 1.5, 2)[1] >= V_SPINE, 'the in-room tile is on the walkway');

  // A PRESS ON THE LADDER DESIGNATES THE LADDER'S TILE — the property the whole strip existed for.
  const [lx, ly] = t.project(6.5, 6.5, 2);
  const band = t.deckInfo(2).band;
  assert.ok(ly >= band.y - 0.01 && ly <= band.y + band.h + 0.01,
    `the spine tile projected to y=${ly}, outside its own band ${band.y}..${band.y + band.h}`);
  assert.ok(lx >= BAY.x - 0.01 && lx <= BAY.x + BAY.w + 0.01);
  const [bx, by, bd] = t.invert(lx, ly);
  assert.deepEqual([Math.floor(bx), Math.floor(by), bd], [6, 6, 2],
    'a press on the drawn ladder does not designate the ladder\'s tile');

  // ⛔ AND THE LAYER THAT USED TO CARRY THE SPINE IS GONE, ASSERTED SO A HALF-REVERT IS LOUD: a
  // build that re-introduced `pl-corridor` beside the walkway would draw the ladder TWICE and give
  // it two different click answers.
  assert.ok(!svg.includes('pl-corridor'),
    'the plate emits a `pl-corridor` layer again — the walkway and the strip are two maps for the '
    + 'same tiles, which is the two-coordinate-systems defect returning by addition');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE PLATE'S MINIATURES ARE RAW — the sketch-adoption seam, and BOTH halves of the ruling.
//
// ⛔⛔ WHY THIS IS PINNED RATHER THAN LEFT TO THE SEAM'S COMMENT. `lane/sketch-adoption` applies the
// `strong` treatment at `helpers.item()`, which every builder goes through — so this surface got the
// treatment by INHERITANCE, without anyone choosing it for a 20.82 px box. Measured A/B on the
// running wreck (86 fittings across two bands; the numbers live at `fittingLayer`'s seam): the
// treated plate is ×4.67 in elements and ~102 ms per repaint against a 100 ms wire frame, versus
// ~19 ms raw. The adoption's own §4 says only WEIGHT survives at 22 px, and this box is under it.
//
// ⛔ AND A "RAW" CLAIM MUST BE ASKED IN BOTH DIRECTIONS or a scan that finds nothing and a scan that
// cannot find anything look identical (TRAPS, 4th shape). The witnesses are the two marks ONLY the
// treatment writes, and the second leg requires them PRESENT on the architecture — because the point
// of the ruling is that the plate stays sketchy where it reads and stops where it is sub-pixel.
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('⭐⭐ plate MINIATURES carry no catalogue treatment — and the ARCHITECTURE still does', () => {
  const svg = overviewScene(baseState());

  // NON-VACUITY FIRST: this plate really is drawing fittings. Without it, "no ground rules" is
  // satisfied by a plate with nothing on it.
  const fits = (svg.match(/class="pl-fit"/g) || []).length;
  assert.ok(fits >= 8, `the plate drew ${fits} fittings — the legs below would be vacuous`);

  // 1 — THE FITTING LAYER IS RAW. `GROUND_CLASS` is the pawns' sixth tell, appended by `sketch()`
  //     and by nothing else; a catalogue piece that reached this plate treated would carry it.
  const furniture = svg.slice(svg.indexOf('class="pl-furniture"'));
  assert.ok(furniture.length > 0, 'no furniture layer at all');
  assert.equal((furniture.match(new RegExp(GROUND_CLASS, 'g')) || []).length, 0,
    'a plate miniature carries the treatment\'s GROUND RULE, so `sketch: false` is not reaching '
    + '`buildTileItem`. At 20.82 px that costs ×4.67 elements and puts the repaint over its own '
    + '10 Hz wire frame (~102 ms vs ~19 ms) for wobble nobody can resolve — see `fittingLayer`.');

  // 2 — …AND THE ARCHITECTURE IS NOT. The composer sketches the hull, the floor planes and the
  //     partition walls itself, with the same `strong` preset. If this leg ever goes green with 0,
  //     the plate has stopped being a DRAWING and leg 1 above is measuring a dead surface.
  //     ⛔ SCOPED TO THE DECK BANDS, NOT THE DOCUMENT (review, re-verify pass): `hullLayer()` draws
  //     from the module-scope `SHIP_INK` constant, which no edit to the deck-drawing code can touch —
  //     unscoped, the count read 11 hull passes + 2 band passes, so deleting the composer's own
  //     `sketch(deckArchitecture(...))` call stayed GREEN (the 4th shape, dominated 11:2). Sliced
  //     from the first deck band, the fixture reads 8 and the composer mutation reads 0.
  const deckArt = svg.slice(svg.indexOf('class="pl-deck"'));
  assert.ok(deckArt.length > 0, 'no deck band at all — leg 2 has nothing to measure');
  assert.ok((deckArt.match(new RegExp(DOUBLE_CLASS, 'g')) || []).length > 0,
    'the DECK BANDS carry no doubled silhouette pass — the composer\'s own `sketch()` call on '
    + '`deckArchitecture` is gone, so "the miniatures are raw" is no longer a decision about scale, '
    + 'the interior architecture has gone flat (the hull\'s own SHIP_INK cannot stand in for it).');
});

test('the ground-rule knob is UNREACHABLE at plate scale — the materials exception cannot apply here', () => {
  // ⭐ THE POINT: `helpers.item()` is `if (!cfg.sketched || opts.sketch === false) return frag;`, so
  // with `sketch: false` the fragment returns BEFORE `sketch()` is called and `cfg.ground` is never
  // read. The ground question therefore has no answer to get wrong at 20.82 px — which is WHY the
  // seam does not carry a `ground:` argument. Asserted through the builder rather than by reading
  // the source, so a refactor that starts honouring `ground` despite `sketch: false` reddens.
  const raw = buildTileItem('locker', { w: 21, h: 21, idPrefix: 'p', facing: 0, sketch: false }, undefined);
  const treated = buildTileItem('locker', { w: 21, h: 21, idPrefix: 'p', facing: 0 }, undefined);
  assert.equal((raw.match(new RegExp(GROUND_CLASS, 'g')) || []).length, 0,
    '`sketch: false` still produced a ground rule — the early return is gone');
  assert.ok((treated.match(new RegExp(GROUND_CLASS, 'g')) || []).length > 0,
    'non-vacuity: the TREATED locker carries no ground rule either, so the leg above proves nothing '
    + 'about the flag — it would pass against a catalogue that never grounds anything');
  assert.notEqual(raw, treated, 'the flag changed no bytes at all');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE OUTBOARD PLANT — owner ruling, 2026-08-06: *"Solars inside a ship make not a lot of sense."*
//
// A `SolarWing` is bolted to the hull. The sim's tile is its ADDRESS — the feed its cable comes in
// through — so the plate draws TWO things for one device: the FEED on the tile, and the PANEL on the
// plating outside the ship. These pin the second one, and the first one is already pinned by
// `device-sprite-coverage.test.js`'s "every glyph the registry skins is drawn by BOTH surfaces".
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A two-deck plate with `n` SolarWings on the given deck, and one non-outboard device as a control.
 *  Built from hand slots rather than the grid fixture because the fixture's ship has no wings. */
function outboardScene({ wings, deck = 0, extra = [] }) {
  const slots = (bank) => [0, 1, 2, 3].map((i) => ({ anchorName: `${bank}${i}`, rect: { x: 1 + i * 11, y: 1, w: 11, h: 8 } }))
    .concat([0, 1, 2, 3].map((i) => ({ anchorName: `${bank}${i + 4}`, rect: { x: 1 + i * 11, y: 10, w: 11, h: 8 } })));
  const dv = [{ deck: 1, slots: slots('u') }, { deck: 0, slots: slots('l') }];
  const devices = wings.map(([x, y, cond]) => ({ x, y, deck, kind: 5, cond })).concat(extra);
  return { svg: overviewScene({ deck: 0, decksView: dv, devices, items: [] }), decksView: dv };
}

/** Every `<g class="pl-fit pl-outboard">` on the plate, with its tile, anchor, pylon and piece box. */
function outboardPieces(svg) {
  return [...svg.matchAll(
    /<g class="pl-fit pl-outboard" data-tile="(\d+),(\d+)" data-deck="(\d+)"([^>]*)>\s*<path d="M([-\d.]+) ([-\d.]+) L([-\d.]+) ([-\d.]+)"[^>]*\/>\s*<g transform="translate\(([-\d.]+) ([-\d.]+)\)"/g,
  )].map((m) => ({
    tx: +m[1], ty: +m[2], deck: +m[3], attrs: m[4],
    pylon: { x: +m[5], y0: +m[6], y1: +m[8] },
    box: { x: +m[9], y: +m[10] },
  }));
}

test('THE WING IS OUTBOARD: it is drawn OUTSIDE the interior bay, on the hull skin', () => {
  // ⛔ THE ONE MUTATION THIS FILE EXISTS FOR: draw the wing through `project` (the in-room floor
  // point) instead of `outboardPoint`, and every piece lands inside `BAY` — which is what the owner
  // asked us to stop doing. This assertion is that difference, expressed as a rectangle.
  const { svg } = outboardScene({ wings: [[2, 12, 79], [4, 12, 46], [6, 12, 15]] });
  const pieces = outboardPieces(svg);
  assert.equal(pieces.length, 3, 'three authored SolarWings did not produce three outboard pieces');

  const inside = pieces.filter((p) => p.pylon.y > BAY.y && p.pylon.y < BAY.y + BAY.h);
  assert.deepEqual(inside, [],
    'a wing is mounted INSIDE the interior bay (BAY.y '
    + `${BAY.y.toFixed(1)}..${(BAY.y + BAY.h).toFixed(1)}), i.e. inside the ship. That is the exact `
    + 'thing the 2026-08-06 ruling removed: "solars inside a ship make not a lot of sense".');

  // Deck 0 is the LOWER band on a two-deck ship, so its wings hang BELOW the hull and the pylon runs
  // downward. Direction, not just position — a piece mounted on the wrong skin would still be
  // outside the bay.
  for (const p of pieces) {
    assert.ok(p.pylon.y0 > BAY.y + BAY.h,
      `a deck-0 wing's mount (${p.pylon.y0.toFixed(1)}) is not below the bay's lower edge`);
    assert.ok(p.pylon.y1 > p.pylon.y0,
      'a deck-0 wing\'s pylon does not run DOWNWARD off the plating — it is mounted on the wrong side');
  }
});

test('THE SKIN IS CHOSEN BY THE BAND: an upper-deck wing mounts ABOVE the hull', () => {
  // The complement, so "outboard" cannot be satisfied by always drawing below. Without it a
  // hard-coded lower skin passes every assertion in the test above.
  const { svg } = outboardScene({ wings: [[5, 3, 230]], deck: 1 });
  const [p] = outboardPieces(svg);
  assert.ok(p, 'a deck-1 SolarWing produced no outboard piece at all');
  assert.ok(p.pylon.y0 < BAY.y,
    `a deck-1 wing mounts at ${p.pylon.y0.toFixed(1)}, not above the bay's top edge ${BAY.y.toFixed(1)}`);
  assert.ok(p.pylon.y1 < p.pylon.y0, 'a deck-1 wing\'s pylon does not run UPWARD off the plating');
  // …and its BOX sits above its mount, so the panel hangs up rather than down through the hull.
  assert.ok(p.box.y < p.pylon.y0, 'the deck-1 panel is drawn below its own mounting point');
});

test('AN OUTBOARD WING IS STILL ITS TILE: it carries data-tile, data-anchor and its own ink', () => {
  // ⛔ WHY THIS MATTERS MORE THAN IT LOOKS. The plate's live press census
  // (`client/tools/overview-plate-shot.mjs`) is exhaustive over every `.pl-fit`, and
  // `overview-view.js`'s `pointToTile` reads `data-tile` first / `roomAnchorOf` reads `data-anchor`.
  // A wing that carried neither would be a piece of the ship a player can see and cannot press.
  const { svg } = outboardScene({ wings: [[2, 12, 79]] });
  const [p] = outboardPieces(svg);
  assert.equal(p.tx, 2); assert.equal(p.ty, 12); assert.equal(p.deck, 0);
  assert.match(p.attrs, /data-anchor="l4"/,
    'the outboard wing does not name the compartment it is wired to, so a press on it cannot enter '
    + 'the room — the defect `fittingLayer` closed for in-room pieces');
  assert.match(p.attrs, /pointer-events="visiblePainted"/,
    'the wing is not pressable on its own ink');
});

test('THE U POSITION IS THE TILE\'S OWN: three wings two tiles apart draw in tile order, apart', () => {
  // ⭐ The honesty claim: the wing hangs over the compartment it belongs to, at that compartment's
  // own position along the ship. Asserted as ORDER + a positive minimum SEPARATION rather than as
  // three literals, because a literal cannot tell "the projection is right" from "the numbers were
  // copied off a run".
  const { svg } = outboardScene({ wings: [[2, 12, 79], [4, 12, 46], [6, 12, 15]] });
  const xs = outboardPieces(svg).sort((a, b) => a.tx - b.tx).map((p) => p.pylon.x);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2],
    `wings at tiles x 2 < 4 < 6 draw at ${xs.map((v) => v.toFixed(1)).join(' / ')} — out of order`);
  const gaps = [xs[1] - xs[0], xs[2] - xs[1]];
  assert.ok(Math.min(...gaps) > 8,
    `two wings two tiles apart are only ${Math.min(...gaps).toFixed(2)} px apart on the plate — at a `
    + `${Math.max(10, makeShipTransform(outboardScene({ wings: [] }).decksView, null).tileSize * 2.2).toFixed(1)} px `
    + 'piece box they would overlap into one silhouette and three panels would read as one.');
});

test('AN UNSURVEYED COMPARTMENT HANGS NO WING: the hatch is not contradicted from outside', () => {
  // ⚠️ THE HALF THE FIRST DRAFT MISSED. `overviewScene` sweeps unsurveyed slots out of the fitting
  // map; sweeping only `fittings` and not `outboard` would have left the plate announcing the ship's
  // generators on the hull outside a compartment whose interior is drawn as unknown.
  const slots = [0, 1, 2, 3].map((i) => ({ anchorName: `l${i}`, rect: { x: 1 + i * 11, y: 1, w: 11, h: 8 } }))
    .concat([0, 1, 2, 3].map((i) => ({ anchorName: `l${i + 4}`, rect: { x: 1 + i * 11, y: 10, w: 11, h: 8 } })));
  const dv = [{ deck: 0, slots }];
  const devices = [{ x: 2, y: 12, deck: 0, kind: 5, cond: 79 }];
  // A frame whose cells are all FOG — every slot unsurveyed.
  const blindFrame = { deck: 0, w: 45, h: 18, cells: [] };
  const svg = overviewScene({ deck: 0, decksView: dv, devices, items: [], frame: blindFrame });
  assert.equal(outboardPieces(svg).length, 0,
    'a wing was hung on the hull outside a compartment nobody has entered. The plate would be '
    + 'telling the player what the ship generates through a hatch that says the room is unknown.');
  // NON-VACUITY: the same scene WITHOUT the blind frame draws the wing, so the leg above is
  // measuring the fog sweep and not a broken fixture.
  assert.equal(outboardPieces(overviewScene({ deck: 0, decksView: dv, devices, items: [] })).length, 1,
    'the control scene draws no wing either — this test proves nothing about fog');
});

test('THE HULL SKIN IS INTERPOLATED, not a constant — a wing sits ON the plating', () => {
  // The hull tapers 4 design px over its 816 px length. A constant edge leaves a visible gap between
  // the pylon and the plating at one end of the ship; this is that claim, in arithmetic.
  const bow = hullSkinY(HULL_SKIN.bottom.x1, false);
  const stern = hullSkinY(HULL_SKIN.bottom.x0, false);
  assert.notEqual(bow, stern, 'the lower skin is level — `hullSkinY` has stopped interpolating');
  const mid = hullSkinY((HULL_SKIN.bottom.x0 + HULL_SKIN.bottom.x1) / 2, false);
  assert.ok(Math.abs(mid - (bow + stern) / 2) < 1e-9, 'the interpolation is not linear');
  // CLAMPED at both ends, so a bay wider than the parallel-sided run still lands on plating.
  assert.equal(hullSkinY(HULL_SKIN.bottom.x0 - 500, false), stern, 'the skin extrapolates off the stern');
  assert.equal(hullSkinY(HULL_SKIN.bottom.x1 + 500, false), bow, 'the skin extrapolates off the bow');
  // The two skins are on opposite sides of the bay — the guard that "above" really means above.
  assert.ok(hullSkinY(HULL_SKIN.top.x0, true) < BAY.y, 'the upper skin is not above the interior bay');
  assert.ok(stern > BAY.y + BAY.h, 'the lower skin is not below the interior bay');
});

test('THE WING WEARS ITS WEAR: a wrecked wing draws its post-raid twin, outboard', () => {
  // The join that must NOT have been broken by moving the drawing: `items/wear.js` picks the twin
  // from the CONDITION byte, and the outboard layer goes through the same `buildTileItem` as every
  // in-room piece. `--ship wreck` authors 0.31 / 0.18 / 0.06 against a 0.25 threshold, so the plate
  // really does draw one sound wing and two wrecked ones.
  // ⚠️ `cond` IS THE WIRE'S BYTE, 0..255 — NOT a 0..1 Condition, and the first draft of this test
  // passed 0.9 and 0.06 and compared two IDENTICAL wrecked wings. `wear.js` compares against
  // `WRECK_COND_BYTE` = round(0.25 × 255) = 64, so both floats were far below it and the test was
  // green-by-accident against a join it never exercised. The wreck's own three wings are 0.31 / 0.18
  // / 0.06 ⇒ bytes 79 / 46 / 15: one sound, two wrecked.
  const sound = outboardScene({ wings: [[2, 12, 79]] }).svg;
  const wrecked = outboardScene({ wings: [[2, 12, 15]] }).svg;
  const cut = (s) => s.slice(s.indexOf('pl-outboard'));
  assert.notEqual(cut(sound), cut(wrecked),
    'a sound wing and a wrecked one draw byte-identical outboard art — the wear join does not reach '
    + 'this layer, and every wing on the plate lies about its condition');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE ALIGNMENT — the leg `ship-elevation.js`'s `outboardPoint` header CITED BEFORE IT EXISTED.
//
// ⛔⛔ THE PACKAGE'S THIRD FABRICATED CITATION, and it is recorded here rather than quietly fixed
// because the shape is this wave's recurring failure. The header said, verbatim:
// *"Pinned by `THE WING HANGS OVER ITS OWN FEED` in `overview-scene.test.js`."* **NO SUCH TEST
// EXISTED ANYWHERE IN THE TREE.** Independent review proved the gap by reverting `outboardPoint`'s
// x back to the pre-fix `O + u·BU` (i.e. dropping `v`) and running the whole node suite: **1904/1904
// GREEN**, with the defect fully restored.
//
// ⛔ WHY THE EIGHT OUTBOARD TESTS ABOVE COULD NOT SEE IT, stated so a later lane does not assume
// coverage from their count. They ask WHERE the piece is relative to the HULL (outside `BAY`, on the
// right skin, on interpolated plating) and, at *"THE U POSITION IS THE TILE'S OWN"*, that three
// wings draw in tile ORDER more than 8 px apart. **A CONSTANT OFFSET SURVIVES EVERY ONE OF THEM** —
// it moves all three wings by the same amount, so the order holds, the gaps hold, and the pieces are
// still outboard. Nothing compared a wing's x to its FEED's x, which is the whole claim.
//
// THE TWO LEGS BELOW ARE THAT COMPARISON, at the two places it can be wrong:
//   · through the DRAWN SVG — the panel's own box against the feed's own box, both read off the
//     emitted string, so the pin covers the composer as well as the transform; and
//   · through the TRANSFORM — `outboardPoint(...).x` against `project(...)[0]`, unrounded floats.
// Both are EXACT equality, and the SVG one can be: `overview-scene.js` emits both boxes as
// `n(X - size/2)` with the SAME `size`, so identical inputs round to identical strings and the
// difference of the two parsed numbers is exactly 0. (Comparing the pylon x to the feed's box
// instead would have needed a `size / 2` term added back after rounding, which is quantised at
// 0.01 — the reason this pair was chosen.)
//
// ⭐ THE MUTATION, RE-DRIVEN HERE PHYSICALLY RATHER THAN QUOTED. `outboardPoint`'s x reverted to
// `d.plane.O[0] + uv[0] * d.plane.BU[0]`, whole node suite run, expression restored:
//     mutated   1906 tests, 1904 pass, 2 fail  — and the 2 are exactly these legs, each naming a
//               per-wing delta: SVG −9.070000 px, floats −9.067750 px, on all three wings
//     restored  1906 tests, 1906 pass, 0 fail
// RED FOR THE RIGHT REASON (TRAPS-3): a named nonzero offset per wing, not a crash and not a parse
// failure. The 1904 that stay green under the mutation ARE the suite review found blind.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The LIVE `--ship wreck` deck geometry — `client/tools/capture-wreck-decks.mjs`'s committed
 *  capture, the same one `no-add-room.test.js` drives its M1-L claims from, with its own
 *  refuse-to-write predicate. The hand `outboardScene` fixture above mirrors these spans; this leg
 *  uses the capture itself so the alignment is asserted on the ship `./play.sh` boots. */
const WRECK_CAP = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/decks-wreck.json', import.meta.url)), 'utf8'),
);
const WRECK_VIEW = decksView(
  decodeDecks(decode(JSON.stringify(WRECK_CAP.decks))),
  decodeRooms(decode(JSON.stringify(WRECK_CAP.rooms))),
);

/** `--ship wreck`'s own three `SolarWing`s: `[tileX, tileY, conditionByte]`, deck 0.
 *  ⚠️ NOT DERIVED FROM THE SHIP — read off a LIVE `--ship wreck` host's `devices` channel
 *  (2026-08-06: `(2,12) cond 79 · (4,12) cond 46 · (6,12) cond 15`, the wire's own bytes for
 *  `wing_a/b/c`'s 0.31 / 0.18 / 0.06). Written out by hand on this file's own precedent, so moving
 *  the wings in `AuthoredShips.cs` fails the instrument check below instead of silently retargeting
 *  the pin. */
const WRECK_WINGS = [[2, 12, 79], [4, 12, 46], [6, 12, 15]];

/** Every IN-ROOM `.pl-fit` (never `.pl-outboard`, whose class attribute differs), keyed
 *  `"tx,ty|deck"` → the x of its emitted translate. The feed side of the comparison. */
function feedBoxX(svg) {
  const out = new Map();
  for (const m of svg.matchAll(
    /<g class="pl-fit" data-tile="(\d+),(\d+)" data-deck="(\d+)"[^>]*? transform="translate\(([-\d.]+) ([-\d.]+)\)"/g,
  )) out.set(`${m[1]},${m[2]}|${m[3]}`, +m[4]);
  return out;
}

test('THE WING HANGS OVER ITS OWN FEED', () => {
  // The wreck's three wings on the wreck's own captured deck geometry.
  const devices = WRECK_WINGS.map(([x, y, cond]) => ({ x, y, deck: 0, kind: 5, cond }));
  const svg = overviewScene({ deck: 0, decksView: WRECK_VIEW, devices, items: [] });
  const wings = outboardPieces(svg);
  const feeds = feedBoxX(svg);

  // ⛔ NON-VACUITY FIRST, AS AN INCLUSION TEST (CLAUDE.md's 4th shape). An empty selection — the
  // wrong fixture, a swept-away compartment, a renamed class — must FAIL here, never pass the loop
  // below by having nothing to compare. Both halves are named: the panels AND the feeds, because
  // the outboard split is a COPY and a regression to a MOVE would leave `feeds` empty with three
  // perfectly aligned panels to compare against nothing.
  assert.equal(wings.length, 3,
    `${wings.length} outboard pieces on the wreck's plate, not the 3 SolarWings --ship wreck authors`
    + ' — this test is reading the wrong ship or the wrong layer, and every comparison below would'
    + ' be vacuous.');
  for (const [tx, ty] of WRECK_WINGS) {
    assert.ok(feeds.has(`${tx},${ty}|0`),
      `no IN-ROOM fitting was drawn on tile ${tx},${ty} — the wing's FEED is missing, so the plate `
      + 'has gone back to MOVING the device onto the hull instead of copying it (the defect '
      + "`device-sprite-coverage.test.js`'s \"a piece with real art is filtered out\" leg named).");
  }

  // ⭐ THE CLAIM. Both boxes are `n(X - size/2)` with the same `size`, so this is exact.
  const bad = [];
  for (const p of wings) {
    const feed = feeds.get(`${p.tx},${p.ty}|${p.deck}`);
    const delta = p.box.x - feed;
    if (delta !== 0) {
      bad.push(`tile ${p.tx},${p.ty} deck ${p.deck}: the PANEL's box starts at x ${p.box.x} and its `
        + `FEED's at x ${feed} — the wing hangs ${delta.toFixed(6)} px `
        + `${delta < 0 ? 'STERNWARD' : 'BOWWARD'} of the compartment it is wired to.`);
    }
  }
  assert.deepEqual(bad, [], 'A WING IS NOT OVER ITS OWN FEED:\n  ' + bad.join('\n  ')
    + '\n  This is the 2026-08-06 defect: `outboardPoint` dropped `v` from the x, and on an oblique'
    + ' floor `BV = [depthX, -depthY]` — a tile at `v` draws `v·depthX` to starboard of the same tile'
    + ' at v = 0. Keep `floorPoint(u, v)`; the band front edge is not the tile\'s x.');
});

test('THE WING HANGS OVER ITS OWN FEED: `outboardPoint`\'s x IS `project`\'s x, unrounded', () => {
  // The same claim one layer down, where there is no 2-decimal serialisation to hide behind — and
  // where a composer that stopped drawing feeds entirely could not make it pass vacuously.
  const t = makeShipTransform(WRECK_VIEW, null);
  assert.ok(t.deckInfo(0), 'the wreck capture draws no deck 0 — nothing below is measuring anything');
  const bad = [];
  for (const [tx, ty] of WRECK_WINGS) {
    const mount = t.outboardPoint(tx + 0.5, ty + 0.5, 0);
    const floor = t.project(tx + 0.5, ty + 0.5, 0);
    if (!mount) { bad.push(`tile ${tx},${ty}: outboardPoint answered null on a drawn deck`); continue; }
    if (mount.x - floor[0] !== 0) {
      bad.push(`tile ${tx},${ty}: outboardPoint x ${mount.x} vs project x ${floor[0]} — delta `
        + `${(mount.x - floor[0]).toFixed(6)} px`);
    }
  }
  assert.deepEqual(bad, [],
    'THE HULL MOUNT AND THE FLOOR POINT HAVE PARTED COMPANY:\n  ' + bad.join('\n  ')
    + '\n  `outboardPoint` must be `floorPoint(u, v)`\'s x and nothing else — the identical function'
    + ' the click map inverts. Any second derivation of position here is the misalignment returning.');
});
