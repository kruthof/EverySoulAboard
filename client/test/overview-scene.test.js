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
  overviewScene, makeTransform, starfield, DECK, layoutPawnLabels, LABEL_MAX_ROWS,
} from '../src/ui/overview-scene.js';
import { taskTag } from '../src/ui/console-model.js';

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

test('the scene builds from the fixture without throwing and is a single <svg> document', () => {
  const svg = overviewScene(baseState());
  assert.match(svg, /^<svg class="pl-overview" viewBox="0 0 1300 561"/);
  assert.ok(svg.endsWith('</svg>'));
  assert.equal((svg.match(/<svg/g) || []).length, 1);
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

test('every OCCUPIED slot gets a glow pool and empty halls do NOT (driven by `occupied`)', () => {
  // Deck 0: all 8 occupied → 8 glow gradients, 0 halls.
  const svg0 = overviewScene(baseState({ deck: 0 }));
  assert.equal((svg0.match(/id="ov-glow-\d+"/g) || []).length, 8);
  assert.equal((svg0.match(/class="pl-hall"/g) || []).length, 0);

  // Deck 1: 4 occupied rooms + 3 halls (and 1 spine-less grid: 8 slots, 5 occupied? verify live).
  const d1 = view.find((d) => d.deck === 1);
  const occ1 = d1.slots.filter((s) => s.occupied).length;
  const halls1 = d1.slots.filter((s) => !s.occupied).length;
  assert.ok(occ1 >= 1 && halls1 >= 1, 'deck 1 must mix rooms and halls to exercise both paths');
  const svg1 = overviewScene(baseState({ deck: 1, frame: null }));
  assert.equal((svg1.match(/id="ov-glow-\d+"/g) || []).length, occ1); // one glow per OCCUPIED slot
  assert.equal((svg1.match(/class="pl-hall"/g) || []).length, halls1); // halls render as halls
  assert.match(svg1, /＋ ADD ROOM/);                                    // hall build affordance
  // The glow layer carries mix-blend screen so it reads as light, not paint (VS-O-31).
  assert.match(svg1, /mix-blend-mode:screen/);
});

test('active-but-unoccupied halls draw NO glow — glow is `occupied`, never `active` (Phase-2b note)', () => {
  // Deck 1 is the decisive case: halls whose deck-level `active` flag is TRUE. If the glow read
  // `active` (the shipped-review bug) they would each light; because it reads `occupied`, none do.
  // THREE since WP-1, not four: deck 1 slot 6 is now the grid ship's live wreck, an authored
  // Storage room ('hold') rather than an empty hall, so it is occupied and correctly DOES glow.
  const d1 = view.find((d) => d.deck === 1);
  const activeHalls = d1.slots.filter((s) => !s.occupied && s.active);
  assert.equal(activeHalls.length, 3);
  const svg1 = overviewScene(baseState({ deck: 1, frame: null }));
  assert.equal((svg1.match(/id="ov-glow-\d+"/g) || []).length, d1.slots.filter((s) => s.occupied).length);

  // And a fully-empty, inactive deck draws no glow and 8 halls.
  const svg7 = overviewScene(baseState({ deck: 7, frame: null, crew: [] }));
  assert.equal((svg7.match(/id="ov-glow-\d+"/g) || []).length, 0);
  assert.equal((svg7.match(/class="pl-hall"/g) || []).length, 8);
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

test('the selected crew gets a selection glow + amber tag; others do not', () => {
  const cid = crew[0].cid;
  const svg = overviewScene(baseState({ deck: 0, selectedCid: cid }));
  assert.ok(svg.includes(`id="ov-sel-${cid}"`));               // selection glow gradient present
  assert.equal((svg.match(/id="ov-sel-/g) || []).length, 1);   // exactly the one selected
  // no selection → no selection glow at all
  const svgNone = overviewScene(baseState({ deck: 0 }));
  assert.equal((svgNone.match(/id="ov-sel-/g) || []).length, 0);
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

test('furniture maps from frame glyphs via SPRITE_FOR_GLYPH → item builder', () => {
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
  assert.equal((svg.match(/id="ov-glow-0"/g) || []).length, 1); // still gets its glow

  // A frame full of glyphs NOT in SPRITE_FOR_GLYPH (e.g. '"','T','f') yields no furniture, no throw.
  const junkFrame = { deck: 0, w: 2, h: 1, lens: 'none', cells: [[34, 0, 0, 0], [84, 0, 0, 0]] };
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
  // The slice runs from the mark layer's open tag to the layer that follows it. That neighbour is
  // `pl-glow` since the mark layer moved ABOVE `pl-furniture` (see the note on the layer-order test
  // above); the extraction is anchored on the FOLLOWING layer rather than on a fixed count of `</g>`
  // so that it fails loudly if the order shifts again instead of silently slicing the wrong bytes.
  const layer = /<g class="pl-marks"[^>]*>([\s\S]*?)<\/g><g class="pl-glow"/.exec(svg);
  assert.ok(layer, 'the mark layer was not found where the layer order puts it — this pin has rotted');
  assert.ok(layer[1].includes('class="mk mk-'), 'the extracted slice is not the mark layer');
  assert.equal((layer[1].match(/\bid="/g) || []).length, 0,
    'the mark layer emitted an id. It draws once per marked tile, so an id inside it is an id per '
    + 'tile — a <defs>/gradient/pattern here would collide across marks and across scenes.');
});
