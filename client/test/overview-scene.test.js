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
  overviewScene, makeTransform, starfield, starLayerSvg, DECK, gridLayout, MIN_TILE,
  miniToScene, sceneToMini, floorToMini, miniToFloor,
  layoutPawnLabels, LABEL_MAX_ROWS,
} from '../src/ui/overview-scene.js';
import { taskTag } from '../src/ui/console-model.js';
import { markCellSvg, markVariant } from '../src/ui/mark-overlay.js';

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

function baseState(over = {}) {
  return { deck: 0, decksView: view, frame, crew, designs: FIX.designs.cells, marks: [], ...over };
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
    out.set(cid, {
      text: m[2].replace(/<[^>]*>/g, ''),
      work: m[1].includes('pl-tag-work'),
      crowded: m[1].includes('pl-tag-crowded'),
      leader: m[2].includes('<line '),
      rect: r ? { x: +r[1], y: +r[2], w: +r[3], h: +r[4] } : null,
      leaderX: ln ? +ln[1] : null,
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
  assert.match(svg, /^<svg class="pl-overview" viewBox="0 0 1300 405"/);
  assert.ok(svg.endsWith('</svg>'));
  // ⚠️ THE OLD ASSERTION WAS `exactly one <svg`, AND IT IS TRANSLATED RATHER THAN DROPPED. The plate
  // draws each compartment as a NESTED `<svg>` carrying the design's own `viewBox="-10 -10 992 428"`
  // + `preserveAspectRatio="xMidYMid meet"` — that is what makes a Level-2 cutaway scale into a
  // ~190 px cell without any arithmetic in this module. So the claim becomes: exactly ONE ROOT
  // document, and exactly one nested svg PER COMPARTMENT — which is strictly more than the old
  // count could see (it could not tell a tile from a stray def wrapper).
  assert.equal((svg.match(/^<svg class="pl-overview"/g) || []).length, 1);
  const rooms = (svg.match(/class="pl-room[" ]/g) || []).length;
  assert.equal((svg.match(/<svg /g) || []).length, rooms + 1,
    'a nested <svg> that is not a compartment miniature appeared in the plate (or one went missing)');
  assert.ok(rooms >= 8, 'the fixture deck has 8 compartments — this assertion is reading nothing');
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
  assert.equal(purposeTiles(svg0), 8);
  assert.equal((svg0.match(/class="pl-room"/g) || []).length, 8);

  // Deck 1 MIXES typed and untyped slots, and that is what makes it the decisive deck: PURPOSE and
  // DRAWING come apart here. The mark tracks the authored PURPOSE (`roomType`); DRAWING no longer
  // tracks anything — M1-L deleted `hallCompartment`, so all 8 draw as compartments.
  const d1 = view.find((d) => d.deck === 1);
  const typed1 = d1.slots.filter((s) => s.roomType).length;
  const untyped1 = d1.slots.filter((s) => !s.roomType).length;
  assert.ok(typed1 >= 1 && untyped1 >= 1, 'deck 1 must mix typed and untyped to separate the two');
  const svg1 = overviewScene(baseState({ deck: 1, frame: null }));
  assert.equal(purposeTiles(svg1), typed1);                                   // one mark per PURPOSED slot
  assert.equal((svg1.match(/class="pl-room"/g) || []).length, d1.slots.length); // ALL draw as rooms
  // …and the mark really does change the drawing: an unpurposed tile takes the dash dialect's
  // UNBUILT stroke, so the two states are distinguishable in ink and not merely in an attribute.
  assert.equal((svg1.match(/data-state="unbuilt"/g) || []).length, untyped1);
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
  const marked = [...svg.matchAll(/data-slot="(\d+)" data-anchor="[^"]*" data-purpose="1"/g)].map((m) => m[1]);
  assert.deepEqual(marked, ['0', '1'],
    'the purpose mark is not following `roomType`: slot 2 (occupied, untyped) or slot 3 (active, '
    + 'untyped) was marked, or slot 1 (typed but unoccupied) lost its mark');
  // …and all four still DRAW, which is the package: purpose decides ink, geometry decides sight.
  assert.equal((svg.match(/class="pl-room"/g) || []).length, 4);

  // And a fully-empty, inactive deck marks nothing — but still draws 8 compartments, which is the
  // whole point of the package: a deck with no live rooms is still a deck you can look into.
  const svg7 = overviewScene(baseState({ deck: 7, frame: null, crew: [] }));
  assert.equal(purposeTiles(svg7), 0);
  assert.equal((svg7.match(/class="pl-room"/g) || []).length, 8);
  // ⚠️ THE NEUTRAL NAME MOVED OFF THE DRAWING AND INTO THE `compartments` COLUMN, and that is the
  // design's own arrangement (Screen 01 labels no tile — the prose column names every room). At
  // ~190 × 70 px a tile cannot hold an 11-character label without covering its own interior, which
  // is the clip `no-add-room.test.js` measured from the other side. The names are still emitted, by
  // `compartmentLines`, and `overview-model.test.js` pins that they are all eight and all distinct.
  assert.equal((svg7.match(/data-anchor="/g) || []).length, 8);
});

test('on-deck crew are placed as pawns; off-deck crew are not', () => {
  const svg = overviewScene(baseState({ deck: 0 }));
  const onDeck = crew.filter((c) => c.deck === 0);
  assert.ok(onDeck.length >= 1);
  assert.equal((svg.match(/class="pl-pawn"/g) || []).length, onDeck.length);
  for (const c of onDeck) assert.ok(svg.includes(`data-cid="${c.cid}"`));
  // surname tags render (uppercased last token)
  assert.match(svg, /HALLORAN|VEGA|SATO/);
  // a deck with no crew on it → no pawns
  const svg7 = overviewScene(baseState({ deck: 7, frame: null }));
  assert.equal((svg7.match(/class="pl-pawn"/g) || []).length, 0);
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
  const svg = overviewScene(baseState({ deck: 1, frame: frameDeck1, crew: crewDeck1, marks: marksDeck1 }));
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
  const labels = pawnLabels(overviewScene(baseState({ deck: 1, frame: frameDeck1, crew: synthetic })));
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
  const labels = pawnLabels(overviewScene(baseState({ deck: 1, frame: frameDeck1, crew: cluster })));
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
    const labels = pawnLabels(overviewScene(baseState({ deck: 1, frame: frameDeck1, crew })));
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
    const labels = pawnLabels(overviewScene(baseState({ deck: 1, frame: frameDeck1, crew })));
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
  const svg = overviewScene(baseState({ deck: 0, selectedCid: cid }));
  const sel = /<g class="pl-pawn" data-cid="([^"]+)"><path d="M[^"]*" stroke="#14120F"/g;
  const marked = [...svg.matchAll(sel)].map((m) => m[1]);
  assert.deepEqual(marked, [String(cid)], 'the selection rule is under the wrong pawn, or under none');
  // no selection → nothing marked at all
  const svgNone = overviewScene(baseState({ deck: 0 }));
  assert.equal([...svgNone.matchAll(sel)].length, 0);
  // …and the plate's OTHER selection cue: the compartment she is in takes the design's 2.2 px border.
  const anchor = view[0].slots[0].anchorName;
  const svgRoom = overviewScene(baseState({ deck: 0, selectedAnchor: anchor }));
  const selTile = /<g class="pl-room pl-room-sel"[^>]*><rect[^>]*stroke-width="2.2"/g;
  assert.equal((svgRoom.match(selTile) || []).length, 1,
    'exactly one compartment tile must carry the SELECTED 2.2px border');
  assert.equal((svgRoom.match(/<g class="pl-room"[^>]*><rect[^>]*stroke-width="1.4"/g) || []).length, 7,
    'every OTHER tile must keep the ordinary 1.4px border');
  assert.equal((overviewScene(baseState({ deck: 0 })).match(selTile) || []).length, 0);
});

test('terminals on the shown deck render as clickable pl-terminal markers; other decks / none do not', () => {
  const terminals = [
    { tid: 'con-1', deck: 0, x: 3, y: 2 },
    { tid: 'con-2', deck: 0, x: 6, y: 4 },
    { tid: 'con-off', deck: 1, x: 1, y: 1 }, // a different deck — must not render here
  ];
  const svg = overviewScene(baseState({ deck: 0, terminals }));
  assert.equal((svg.match(/class="pl-terminal"/g) || []).length, 2); // only the two on deck 0
  assert.ok(svg.includes('data-tid="con-1"'));
  assert.ok(svg.includes('data-tid="con-2"'));
  assert.ok(!svg.includes('data-tid="con-off"'));
  // no terminals channel → no terminal markers (graceful; unchanged scene)
  const svgNone = overviewScene(baseState({ deck: 0 }));
  assert.equal((svgNone.match(/class="pl-terminal"/g) || []).length, 0);
  // deterministic: same terminals → byte-identical
  assert.equal(overviewScene(baseState({ deck: 0, terminals })), svg);
});

test('furniture maps from frame glyphs via itemIdForGlyphChar → item builder', () => {
  const svg = overviewScene(baseState({ deck: 0 }));
  assert.match(svg, /class="pl-furniture"/);
  // the grid deck's frame has scrubbers/beds/tables/etc — several pl-item groups must appear
  assert.ok((svg.match(/class="pl-item"/g) || []).length >= 5);
  // furniture only renders when the frame is for THIS deck
  const svgNoFrame = overviewScene(baseState({ deck: 0, frame: null }));
  assert.equal((svgNoFrame.match(/class="pl-furniture"/g) || []).length, 0);
  // a frame for a DIFFERENT deck than the one being drawn contributes no furniture
  const svgMismatch = overviewScene(baseState({ deck: 1, frame }));
  assert.equal((svgMismatch.match(/class="pl-furniture"/g) || []).length, 0);
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
  const junkFrame = { deck: 0, w: 2, h: 1, lens: 'none', cells: [[113, 0, 0, 0], [122, 0, 0, 0]] };
  const svg2 = overviewScene({ deck: 0, decksView: view, frame: junkFrame, crew: [] });
  assert.equal((svg2.match(/class="pl-furniture"/g) || []).length, 0);
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
  const t = makeTransform(slots, frame);
  // a slot rect projects into the deck-floor envelope
  const r = t.rect(slots[0].rect);
  assert.ok(r.x >= DECK.x - 1 && r.x <= DECK.x + DECK.w);
  assert.ok(r.y >= DECK.y - 1 && r.y <= DECK.y + DECK.h);
  // round-trip a handful of tile coords through project → invert
  for (const [tx, ty] of [[0, 0], [8, 8], [22.5, 4.5], [44, 17]]) {
    const [sx, sy] = t.project(tx, ty);
    const [bx, by] = t.invert(sx, sy);
    assert.ok(Math.abs(bx - tx) < 1e-6 && Math.abs(by - ty) < 1e-6);
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
  const iPawns = svg.indexOf('<g class="pl-pawns">');
  assert.ok(iRooms >= 0 && iMarks > iRooms, 'marks must draw over the room floors');
  assert.ok(iFurn >= 0 && iMarks > iFurn,
    'marks must draw OVER the furniture — a condemned DEVICE now carries fg 26, and beneath its own '
    + 'sprite its ✕ is invisible (the owner-reported symptom, one layer lower)');
  assert.ok(iPawns > iMarks, 'marks must draw UNDER the pawns');

  // Geometry: each mark lands inside the projected box of a cell that really carries its byte.
  const t = makeTransform(view.find((d) => d.deck === 1).slots, frameDeck1);
  const boxes = marksDeck1.map((mk) => t.rect({ x: mk.x, y: mk.y, w: 1, h: 1 }));
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
  const svg7 = overviewScene(baseState({ deck: 7, frame: frameDeck1, crew: [], marks: marksDeck1 }));
  assert.equal(marks(svg7).length, 0);
  assert.equal(marksDeck1.length, 33, 'the adapter found no marks — the deck-gate leg above is vacuous');
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
  const layer = /<g class="pl-marks"[^>]*>([\s\S]*?)<\/g><g class="pl-/.exec(svg);
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
  const t = makeTransform(view.find((d) => d.deck === 1).slots, frameDeck1);
  const svg = overviewScene(baseState({ deck: 1, frame: frameDeck1, crew: crewDeck1, marks: marksDeck1 }));
  const drawn = marks(svg);
  assert.equal(drawn.length, marksDeck1.length, 'one drawn mark per channel cell');

  // The emitted groups are in the channel's own order (the layer walks the list), so they pair up
  // positionally. Compare each against the SHARED builder called with this tile's box and variant.
  let checked = 0;
  for (let i = 0; i < marksDeck1.length; i += 1) {
    const mk = marksDeck1[i];
    const r = t.rect({ x: mk.x, y: mk.y, w: 1, h: 1 });
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

test('E6: the compartment grid is DERIVED from the room census, never a fixed four-by-two', () => {
  // The design draws ONE authored ship as 4 × 2 and the charter files that it "does not generalise
  // as drawn". The rule is `cols = clamp(ceil(n/2), 1, 6)`, `rows = ceil(n/cols)` — which reproduces
  // the design exactly at the shipped n = 8 and stays legible as n grows.
  assert.deepEqual(
    [1, 2, 3, 4, 8, 9, 12, 13, 20].map((n) => {
      const g = gridLayout(n);
      return [n, g.cols, g.rows, g.cells];
    }),
    [
      [1, 1, 1, 1], [2, 1, 2, 2], [3, 2, 2, 4], [4, 2, 2, 4],
      [8, 4, 2, 8],                       // ← the design's own shape, and the shipped one
      [9, 5, 2, 10], [12, 6, 2, 12],
      [13, 6, 3, 18], [20, 6, 4, 24],     // ← the cap holds; extra rows shrink INSIDE the box
    ],
    'the grid derivation moved — the design shape at n=8 and the column cap are both load-bearing');

  // ⛔ THE TILE IS NEVER DEGENERATE, AND THE SAMPLE GOES PAST WHERE IT USED TO GO NEGATIVE. The
  // first version stopped at n=20 and asserted containment — which a NEGATIVE height satisfies
  // trivially. Review measured the real behaviour: with the box height fixed, `tileH` crosses zero
  // at rows ≥ 9 (n ≥ 49). `MIN_TILE` is the clamp, and past it the grid is TALLER than the box and
  // SAYS SO through `overflows`, rather than silently inverting.
  for (const n of [1, 2, 8, 13, 20, 25, 48, 49, 60, 120, 400]) {
    const g = gridLayout(n);
    assert.ok(g.tileW >= MIN_TILE.w && g.tileH >= MIN_TILE.h,
      `n=${n} produced a ${g.tileW}×${g.tileH} tile — below the legibility floor, possibly negative`);
    assert.ok(g.cells >= n, `n=${n} laid ${g.cells} cells for ${n} compartments — one has no tile`);
    const boxed = g.rows * g.tileH + (g.rows - 1) * 22.8 <= DECK.h + 0.01;
    assert.equal(boxed, !g.overflows,
      `n=${n}: \`overflows\` says ${g.overflows} but the rows ${boxed ? 'do' : 'do not'} fit the box`);
    assert.ok(g.cols * g.tileW + (g.cols - 1) * 12.6 <= DECK.w + 0.01,
      `n=${n} lays ${g.cols} columns outside the grid box`);
  }
  // THE CROSSING, NAMED AND MEASURED: with `MIN_TILE.h` = 18 the box holds FOUR rows (n ≤ 24) and
  // the clamp starts binding at five (n ≥ 25). Written out so a future edit to the floor, the gaps
  // or the box height cannot move it quietly.
  assert.equal(gridLayout(24).overflows, false, 'four rows no longer fit the box — re-derive the floor');
  assert.equal(gridLayout(25).overflows, true, 'five rows now fit the box — the clamp is unreachable');
  // …and hostile input does not throw or produce a NaN grid.
  for (const bad of [null, undefined, NaN, -3, 'x', {}]) {
    const g = gridLayout(/** @type {any} */ (bad));
    assert.ok(g.cols >= 1 && g.rows >= 1 && Number.isFinite(g.tileW));
  }
  // ⚠️ AND THE REALITY CHECK: every authored ship in this repo lays EIGHT compartments per deck, so
  // the shape the player actually sees is the design's own 4 × 2. The degradation above is real,
  // stated, and unreached by the shipping game.
  assert.deepEqual([gridLayout(8).cols, gridLayout(8).rows], [4, 2]);
  assert.equal(view[0].slots.length, 8, 'the captured ship no longer lays 8 compartments a deck');
});

test('E6: a census that does not fill its last row leaves DASHED EMPTY cells, not blank paper', () => {
  // 3 compartments ⇒ 2 × 2 ⇒ one empty cell. An empty grid slot must SAY it is empty (the design's
  // dashed third tile); leaving it blank makes a partly-built deck look like a fully-built one.
  const mk = (i) => ({
    ...view[0].slots[0], slotIndex: i, roomType: 5, anchorName: 'a' + i, displayName: 'A' + i,
    rect: { x: i * 8, y: 0, w: 6, h: 5 },
  });
  const svg = overviewScene(baseState({
    deck: 4, decksView: [{ deck: 4, slots: [mk(0), mk(1), mk(2)] }], frame: null, crew: [],
  }));
  assert.equal((svg.match(/class="pl-room"/g) || []).length, 3);
  assert.equal((svg.match(/class="pl-room-empty"/g) || []).length, 1,
    'the unfilled grid cell drew nothing at all — a partly-built deck reads as a full one');
  // …and a census that fills its grid exactly leaves none.
  const full = overviewScene(baseState({
    deck: 4, decksView: [{ deck: 4, slots: [mk(0), mk(1), mk(2), mk(3)] }], frame: null, crew: [],
  }));
  assert.equal((full.match(/class="pl-room-empty"/g) || []).length, 0);
});

test('the PIECEWISE transform: project ∘ invert is identity INSIDE a compartment, and the tile that '
  + 'is inside none is the KNOWN LIMIT', () => {
  const slots = view[0].slots;
  const t = makeTransform(slots, frame);

  // (a) IDENTITY, for a tile in every compartment — the property the order verbs' click→tile path
  //     (BUG-B's `getScreenCTM().inverse()` route) actually needs.
  let checked = 0;
  for (const s of slots) {
    for (const [dx, dy] of [[0.5, 0.5], [1.5, 2.5], [s.rect.w - 0.5, s.rect.h - 0.5]]) {
      const tx = s.rect.x + dx, ty = s.rect.y + dy;
      const [sx, sy] = t.project(tx, ty);
      const [bx, by] = t.invert(sx, sy);
      assert.ok(Math.abs(bx - tx) < 1e-6 && Math.abs(by - ty) < 1e-6,
        `tile ${tx},${ty} in ${s.anchorName} did not round-trip (got ${bx},${by})`);
      checked += 1;
    }
  }
  assert.ok(checked >= 24, `only ${checked} tiles round-tripped — this assertion is reading nothing`);

  // (b) …and each of those points really lands in ITS OWN compartment's cell, which is the whole
  //     reason the transform is piecewise: a single affine map would put compartment 7's tiles in
  //     compartment 3's box and the drawing would be a lie.
  // ⚠️ THE SAMPLE IS THE RECT'S CENTRE, NOT ITS ORIGIN, and that is a fact about the SHIP rather
  // than a convenience: adjacent compartments SHARE a wall column on this fixture (`quarters` runs
  // x 0..11 and `mess` x 11..22), so the tile at a rect's origin is covered by two slots and the
  // transform resolves it to the first — which is the only answer a piecewise map can give and is
  // why `hitTest`'s DOM tier, not this arithmetic, decides which room a click enters.
  const shared = slots.filter((s) => slots.some((o) => o !== s
    && s.rect.x >= o.rect.x && s.rect.x < o.rect.x + o.rect.w
    && s.rect.y >= o.rect.y && s.rect.y < o.rect.y + o.rect.h));
  assert.ok(shared.length >= 1, 'no compartment shares a wall column — the caveat above has rotted');
  for (const s of slots) {
    const cell = t.cellOf(s);
    const [sx, sy] = t.project(s.rect.x + s.rect.w / 2, s.rect.y + s.rect.h / 2);
    assert.ok(sx >= cell.x && sx <= cell.x + cell.w && sy >= cell.y && sy <= cell.y + cell.h,
      `${s.anchorName}'s own centre tile projected outside its own grid cell`);
  }

  // (c) EVERY PIXEL OF A COMPARTMENT TILE ADDRESSES A TILE IN THAT COMPARTMENT. A cell's BOX is
  //     bigger than the floor PARALLELOGRAM drawn in it, so this is the property the (u,v) clamp in
  //     `invert` exists for: without it a press in the back-wall third of a tile solves off the
  //     floor, `tileAt` clamps it to null, and an armed DIG silently does nothing there.
  const covers = (tx, ty) => slots.some((s) => tx >= s.rect.x && tx < s.rect.x + s.rect.w
    && ty >= s.rect.y && ty < s.rect.y + s.rect.h);
  let sampled = 0;
  for (let i = 0; i <= 20; i += 1) {
    for (let j = 0; j <= 8; j += 1) {
      const px = DECK.x + (DECK.w * i) / 20, py = DECK.y + (DECK.h * j) / 8;
      const cell = t.cells.find((c) => px >= c.cell.x && px <= c.cell.x + c.cell.w
        && py >= c.cell.y && py <= c.cell.y + c.cell.h);
      if (!cell) continue;               // the gaps between cells are the corridor's, tested below
      sampled += 1;
      const [tx, ty] = t.invert(px, py);
      assert.ok(covers(Math.floor(tx), Math.floor(ty)),
        `a click at ${px},${py} inside ${cell.slot.anchorName}'s cell resolved to ${tx},${ty}, `
        + 'which no compartment contains — the floor clamp is gone');
      const own = cell.slot.rect;
      assert.ok(tx >= own.x && tx <= own.x + own.w && ty >= own.y && ty <= own.y + own.h,
        `a click inside ${cell.slot.anchorName}'s cell resolved to ${tx},${ty}, outside ITS OWN rect`);
    }
  }
  assert.ok(sampled >= 40, `only ${sampled} in-cell points sampled — the leg is reading nothing`);

  // (d) THE CORRIDOR ROUND-TRIPS TOO. A tile inside no compartment used to have no place on the
  //     plate at all — 83 deck-0 floor tiles, two items and the HATCH LADDER, the visible
  //     deck-to-deck route, drawn on no surface. It is drawn in the corridor strip now, through the
  //     SAME projection, so its round trip is exact and a press on it designates it.
  const outside = [];
  for (let ty = 0; ty < 20 && outside.length < 6; ty += 1) {
    for (let tx = 0; tx < 45 && outside.length < 6; tx += 1) {
      if (!covers(tx, ty)) outside.push([tx + 0.5, ty + 0.5]);
    }
  }
  assert.ok(outside.length >= 4, 'this deck has no out-of-compartment tile — leg (d) is vacuous');
  for (const [tx, ty] of outside) {
    const [sx, sy] = t.project(tx, ty);
    assert.ok(sy >= t.band.y - 0.01 && sy <= t.band.y + t.band.h + 0.01,
      `the corridor tile ${tx},${ty} was not drawn in the corridor strip (y=${sy})`);
    const [bx, by] = t.invert(sx, sy);
    assert.ok(Math.abs(bx - tx) < 1e-6 && Math.abs(by - ty) < 1e-6,
      `corridor tile ${tx},${ty} did not round-trip (got ${bx},${by})`);
  }
});

test('⭐⭐ D5 RE-HOUSED: a compartment that needs attention takes the OXBLOOD DASHED border, and '
  + 'nothing else on the plate does', () => {
  const anchor = view[0].slots[2].anchorName;
  const svg = overviewScene(baseState({ deck: 0, attentionAnchors: [anchor] }));
  // The tile is marked as a group AND drawn in the dialect — a class alone would be a state nothing
  // renders, which is `invisible-feedback-is-FUNCTIONAL` in its cheapest form.
  assert.equal((svg.match(/class="pl-room pl-room-attend"/g) || []).length, 1);
  const tile = /<g class="pl-room pl-room-attend"[^>]*data-anchor="([^"]+)"[^>]*><rect[^>]*stroke="#7B2C22"[^>]*stroke-dasharray="8 5"/.exec(svg);
  assert.ok(tile, 'the attention tile is not drawn in oxblood + the queued-order dash (charter §1)');
  assert.equal(tile[1], anchor, 'the oxblood border landed on the wrong compartment');
  // NON-VACUITY / NEGATIVE CONTROL: with nothing stuck, no tile is in the accent at all.
  const calm = overviewScene(baseState({ deck: 0 }));
  assert.equal((calm.match(/pl-room-attend/g) || []).length, 0);
  assert.equal((calm.match(/<g class="pl-room[^"]*"[^>]*><rect[^>]*stroke="#7B2C22"/g) || []).length, 0,
    'a tile is drawn in the accent with nothing wrong — the one accent has been spent on nothing');
  // …and a CONDEMNED tile puts its own compartment in the accent too, from the marks channel alone.
  const s0 = view[0].slots[0];
  const condemned = overviewScene(baseState({
    deck: 0, marks: [{ x: s0.rect.x, y: s0.rect.y, deck: 0, kind: 3, mark: 'condemn' }],
  }));
  assert.match(condemned, /class="pl-room pl-room-attend"[^>]*data-anchor="[^"]*"/);
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
  // running game: with the fittings placed through the oblique and the click map reading an
  // axis-aligned cell box, 57 of 59 drawn pieces on the wreck's deck 0 clicked a DIFFERENT tile
  // (dy up to +7) and 49 had NOT ONE PIXEL of their own ink that clicked their own tile. A surface
  // that shows you one thing and orders another is the worst failure this repo has a name for.
  //
  // It is driven off the EMITTED STRING, not off the functions: every piece is found by the id
  // namespace the scene gave it (`ov-s<slot>-f<x>-<y>`), its drawn base point is read out of the
  // `translate(...)` beside it, and that point is carried mini → scene → invert with the SAME
  // helpers the browser's nested-`<svg>` fit and the click path use.
  const svg = overviewScene(baseState({ deck: 0 }));
  const t = makeTransform(view[0].slots, frame);

  // Each drawn fitting says which TILE it was drawn for (`data-tile`) beside the translate that
  // places it. ⚠️ THE FIRST VERSION OF THIS PARSE INFERRED THE TILE FROM THE PIECE'S `<defs>` ID and
  // was WRONG: a builder that emits no def has no id, so the non-greedy scan walked on and paired
  // that piece's translate with the NEXT piece's tile. It reported 20 false failures. The emitted
  // attribute removes the inference.
  const slotOf = [...svg.matchAll(/data-slot="(\d+)"|data-tile="(\d+),(\d+)"/g)];
  const pieces = [];
  let curSlot = -1;
  for (const m of slotOf) {
    if (m[1] !== undefined) { curSlot = +m[1]; continue; }
    pieces.push({ slot: curSlot, tx: +m[2], ty: +m[3] });
  }
  const xy = [...svg.matchAll(/<g class="pl-fit" data-tile="\d+,\d+"[^>]*? transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)];
  assert.equal(xy.length, pieces.length, 'the piece parse and the translate parse disagree');
  pieces.forEach((p, i) => { p.x = +xy[i][1]; p.y = +xy[i][2]; });
  assert.ok(pieces.length >= 20,
    `only ${pieces.length} fittings parsed out of the plate — this assertion is reading nothing`);

  const ITEM = 128;                       // MINI_ITEM: the box a fitting is normalised into
  const bad = [];
  for (const p of pieces) {
    const cell = t.cells[p.slot].cell;
    const rect = t.cells[p.slot].rect;
    // The emitted translate puts the piece's box top-left at (x, y); it STANDS on the floor, so its
    // own floor point is the bottom-centre of that box — the point `floorToMini` produced.
    const baseX = p.x + ITEM / 2, baseY = p.y + ITEM;
    // A tile is `BU.x / rect.w` across and `-BV.y / rect.h` back, in mini units. Sample the piece's
    // footprint: its own base, and a quarter of a tile out from it in each direction.
    const dx = 860 / rect.w / 4, dy = 168 / rect.h / 4;
    for (const [ox, oy] of [[0, 0], [dx, 0], [-dx, 0], [0, dy], [0, -dy]]) {
      const [sx, sy] = miniToScene(cell, baseX + ox, baseY + oy);
      const [tx, ty] = t.invert(sx, sy);
      if (Math.floor(tx) !== p.tx || Math.floor(ty) !== p.ty) {
        bad.push(`s${p.slot} piece at tile ${p.tx},${p.ty} — a press on its footprint `
          + `(${ox.toFixed(1)},${oy.toFixed(1)} from its base) designates ${Math.floor(tx)},${Math.floor(ty)}`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 8), [],
    `${bad.length} of ${pieces.length * 5} sampled footprint points designate the WRONG tile. The `
    + 'drawing and the click map have come apart again: `miniContents` places through `floorToMini` '
    + 'and `makeTransform.invert` must undo exactly that, through `sceneToMini` + `miniToFloor`.');
});

test('THE SPINE IS DRAWN: a tile inside no compartment still reaches the plate', () => {
  // ⛔ WHAT THIS PINS, AND WHY IT IS NOT A DETAIL. Review measured that 83 deck-0 floor tiles, two
  // ground items and the HATCH LADDER at (22,8) — the visible deck-to-deck route on the shipped
  // wreck — lie inside no slot rect, and with the compartment grid alone they were on NO SURFACE at
  // Level 1 at all. A plate that draws every room and none of the corridor between them is a floor
  // plan with the doors painted out. The strip is the grid's own row gap, so the corridor is drawn
  // where a player expects it: between the two banks of compartments.
  const slot = {
    ...view[0].slots[0], slotIndex: 0, roomType: 5, anchorName: 'a0', displayName: 'A0',
    rect: { x: 0, y: 0, w: 4, h: 4 },
  };
  const w = 8, h = 8;
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];      // '.' floor
  cells[1 * w + 1] = ['b'.charCodeAt(0), 0, 0, 0];                        // a bed, INSIDE the room
  cells[6 * w + 6] = ['H'.charCodeAt(0), 0, 0, 0];                        // a LADDER, in the spine
  const st = {
    deck: 2, decksView: [{ deck: 2, slots: [slot] }], crew: [], marks: [],
    frame: { deck: 2, w, h, lens: 'none', cells },
  };
  const svg = overviewScene(st);

  assert.match(svg, /<g class="pl-corridor"/, 'the plate draws no corridor strip at all');
  // The slice runs from the corridor's open tag to the next TOP-LEVEL layer, or to the end of the
  // document when — as here — nothing follows it. Anchoring on the following layer alone made the
  // extraction fail on a fixture with no crew, no marks and no ghosts, which is a property of the
  // fixture rather than of the layer.
  const tail = svg.slice(svg.indexOf('<g class="pl-corridor"'));
  const nextLayer = tail.indexOf('</g><g class="pl-');
  const strip = [null, nextLayer >= 0 ? tail.slice(0, nextLayer) : tail];
  assert.ok(strip[1].includes('class="pl-corridor"'),
    'the corridor layer was not found where the layer order puts it');
  assert.ok(strip[1].includes('class="pl-item"'),
    'the ladder at 6,6 — inside no compartment — is not drawn. The deck-to-deck route is invisible '
    + 'at Level 1, which is the defect the corridor strip exists to close.');

  // …and it lands IN THE STRIP, not somewhere in the letterbox.
  const t = makeTransform([slot], st.frame);
  const [lx, ly] = t.project(6.5, 6.5);
  assert.ok(ly >= t.band.y - 0.01 && ly <= t.band.y + t.band.h + 0.01,
    `the spine tile projected to y=${ly}, outside the corridor strip ${t.band.y}..${t.band.y + t.band.h}`);
  assert.ok(lx >= DECK.x - 0.01 && lx <= DECK.x + DECK.w + 0.01);

  // NON-VACUITY: the bed INSIDE the room is NOT in the strip — it is in its compartment's miniature,
  // or this test would pass on a build that put every item in the corridor.
  assert.equal((strip[1].match(/class="pl-item"/g) || []).length, 1,
    'the corridor drew more than the one spine item — a compartment\'s own fittings leaked into it');
  assert.match(svg, /class="pl-furniture"/, 'the in-room bed vanished — the two layers are confused');
});
