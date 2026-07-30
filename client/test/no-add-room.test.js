// M1-L — EVERY COMPARTMENT IS A ROOM; ＋ADD ROOM IS DELETED.
//
// Owner ruling, 2026-07-29, binding and verbatim: *"we do not need 'add room' that makes no sense on
// a ship where rooms are already existing."*
//
// RimWorld analogue, cited rather than remembered — `docs/design/rimworld-reference.md` §7 item 10
// ("Rooms are derived, not authored"; cited as bare "§10" before Part II claimed that number for the
// food chain): *"RimWorld computes rooms from walls for stats (beauty, cleanliness,
// impressiveness, temperature) — the player never names or allocates one."* That sentence supports
// BOTH halves of this package: occupancy moves onto geometry (walls decide), and the player is never
// asked to pick a purpose. §7 item 10 carries no `⚠️ UNVERIFIED` marker.
//
// ⚠️ AND ONE THING THE VERIFIED TIER DOES **NOT** SAY, flagged rather than built on. RimWorld also
// infers a room's ROLE from its contents (a room with a bed is a bedroom), and it is tempting to
// mirror that by naming a compartment after the machinery inside it. **Part I documents no such
// mechanism.** ⚠️ THE SWEEP SENTENCE THAT STOOD HERE WAS WRONG IN ONE TERM AND IS CORRECTED
// (review, 2026-07-29): it said a sweep for `bedroom` / `room role` / `infer` "returns nothing".
// RE-MEASURED then on the Part-I-only doc: `bedroom` **0** ✅, `room role` **0** ✅, **`infer` 4** —
// and NOT ONE of them was about room roles. (2026-07-29 late: Part II [model] §16 now DOES describe
// role-tiered mood thoughts — bedroom/dining/rec — at the UNVERIFIED tier; the sweep counts above
// are true of Part I, and the standing directive still bars building on an unverified tier.)
// **The judgement is unchanged and stands: the verified tier does not document role inference.**
// Only the evidence sentence was overstated, which is the same shape as the false absolute negative
// review found in `decks-model.js` — a reader told a term returns nothing
// does not go and look. So under the standing directive (*"cite it, do not re-derive from memory"*)
// this package does not build on it. The naming rule is deliberately the smaller one: derived,
// total, neutral.
// See `decks-model.js`'s `compartmentName` header.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE THREE GUARD SHAPES IN THIS FILE
//   1. THE DRIVEN LEG — the package's whole claim, on a LIVE `--ship wreck` capture: a compartment
//      that could not be entered before is now named and enterable, for the slots that hold
//      `recycler_1` / `machineshop_1` / `fabricator_1`.
//   2. THE TOTALITY LEG — the naming rule has no hole, over every shipped ship's slots plus a
//      hostile-input sweep. A rule with a hole shows an unnamed box, which is the defect removed.
//   3. THE CENSUS — an EQUALITY-pinned sweep proving no ＋ADD ROOM affordance survives anywhere:
//      chip, hit test, action, picker, choices, wire sender. Comment-stripped quote-aware with the
//      SHIPPED `codeOnly` (imported, never re-derived — `CLAUDE.md` trap 1), with a negative control
//      whose fixture carries A LATER REAL COMMENT (a control without one is vacuous).
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { codeOnly } from './code-only.js';
import { decode } from '../src/wire/messages.js';
import { decodeDecks, decodeRooms } from '../src/wire/messages.js';
import {
  decksView, deckSlotView, compartmentName, compartmentDesignation, roomLabel, ROOM_LABEL_BY_ID,
  SLOT_COLS,
} from '../src/ui/decks-model.js';
import { roomTileRect, crewRoomSlot } from '../src/ui/room-model.js';
import { overviewClickAction, lensSlotTint, GRADE_TINT, currentRoom } from '../src/ui/overview-model.js';
import { overviewScene } from '../src/ui/overview-scene.js';

const src = (p) => readFileSync(fileURLToPath(new URL('../src/' + p, import.meta.url)), 'utf8');
const fixture = (p) => JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/' + p, import.meta.url)), 'utf8'));

// ═════════════════════════════════════════════════════════════════ 1. THE DRIVEN LEG (--ship wreck)

// A LIVE capture from `--ship wreck` taken THROUGH the real host after the `ResolveSlot` change —
// `client/tools/capture-wreck-decks.mjs`, committed, with its own refuse-to-write predicate. Not a
// hand-built tuple: the defect this pins was invisible in one, because the host is the half that
// changed and a hand-built tuple would simply assert the answer.
const WRECK = fixture('decks-wreck.json');
const WVIEW = decksView(decodeDecks(decode(JSON.stringify(WRECK.decks))),
  decodeRooms(decode(JSON.stringify(WRECK.rooms))));
const WDECK0 = WVIEW.find((d) => (d.deck | 0) === 0);

// The owner's own case. `AuthoredShips.PeriluneWreck`'s "frontier" block puts `recycler_1` +
// `machineshop_1` + `light_d0_s1` in `hall_d0_s1` and `fabricator_1` + `light_d0_s2` in
// `hall_d0_s2`. Both were UNTYPED, and therefore blank ＋ADD ROOM boxes, before this package.
const MACHINERY = ['hall_d0_s1', 'hall_d0_s2'];

test('M1-L instrument check: the wreck capture really contains the compartments under test', () => {
  // ⚠️ CHECK THE INSTRUMENT AGAINST A KNOWN-TRUE FACT BEFORE BELIEVING ANY RESULT — two rigs in the
  // previous run published conclusions from silently broken ones. Everything below is a claim about
  // these eight slots, so if the fixture is the wrong ship or the wrong deck, THIS fails first and
  // names the reason, instead of the real tests passing vacuously over an empty list.
  assert.ok(WDECK0, 'the wreck capture has no deck 0 at all');
  assert.equal(WDECK0.slots.length, 8, 'the wreck deck 0 is a 2x4 slot grid — 8 compartments');
  for (const a of MACHINERY) {
    const s = WDECK0.slots.find((x) => x.anchorName === a);
    assert.ok(s, `${a} is not in the capture — wrong ship, wrong deck, or a stale channel`);
    assert.equal(s.roomType, 0,
      `${a} is TYPED in this capture. It is authored untyped, so either the ship changed or the `
      + 'capture is stale — and every "was unenterable, now enterable" claim below would be vacuous.');
  }
});

test('⭐ M1-L DRIVEN: a compartment holding wrecked machinery is now NAMED and ENTERABLE (--ship wreck)', () => {
  for (const anchor of MACHINERY) {
    const slot = WDECK0.slots.find((s) => s.anchorName === anchor);

    // (a) THE HOST HALF. `occupied` is now geometry, and the anchor is no longer blank. Both were
    //     false before: `ResolveSlot` skipped every `RoomType.None` anchor, so this slot reported
    //     `occupied:false` with `anchorName:''`.
    assert.equal(slot.occupied, true, `${anchor} still reads unoccupied — the ResolveSlot gate is back`);
    assert.equal(slot.anchorName, anchor, `${anchor} carries no live anchor name`);

    // (b) NAMED. Non-blank, uppercase, and NOT the internal id — the WP-1 leak.
    assert.equal(slot.displayName, 'ROOM ' + compartmentDesignation(slot.slotIndex));
    assert.ok(slot.displayName, `${anchor} draws an UNNAMED box — the defect this package removes`);
    assert.equal(slot.displayName, slot.displayName.toUpperCase());
    assert.ok(!/^hall_d\d+_s\d+$/.test(slot.displayName),
      `${anchor} shows its internal id "${slot.displayName}" to the player`);

    // (c) ⭐ ENTERABLE. This is the decisive one and it is NOT implied by (a) or (b). The Room Zoom
    //     resolves its focus through `roomTileRect`, which looks a room up BY ANCHOR NAME and
    //     returns null for a blank one — so a blank anchor was, by construction, a compartment the
    //     player could not open. Resolving with a real tile-rect is what "enterable" means here.
    const rect = roomTileRect(WVIEW, anchor);
    assert.ok(rect, `${anchor} does not resolve to a room rect — the Room Zoom cannot focus it`);
    assert.equal(rect.deck, 0);
    assert.ok(rect.rw > 0 && rect.rh > 0, `${anchor} resolved to an empty rect ${rect.rw}x${rect.rh}`);
    assert.equal(rect.displayName, slot.displayName, 'the Room Zoom caption and the Overview label disagree');

    // (d) …and a click on it CLASSIFIES as room entry, with no tool armed. `enterRoom` is the last
    //     hit tier now that `addroom` is gone, so this is the rung that inherited the click.
    assert.deepEqual(overviewClickAction(null, { roomAnchor: anchor }), { type: 'enterRoom', anchor });
  }
});

test('M1-L DRIVEN: the wreck Overview draws EIGHT named compartments on deck 0 and NO ＋ADD ROOM box', () => {
  const svg = overviewScene({ deck: 0, decksView: WVIEW, frame: null, crew: [], marks: [] });
  assert.equal((svg.match(/class="pl-room"/g) || []).length, 8, 'deck 0 no longer draws 8 compartments');
  assert.equal((svg.match(/class="pl-hall"/g) || []).length, 0);
  assert.equal((svg.match(/class="pl-addroom"/g) || []).length, 0);
  assert.ok(!svg.includes('ADD ROOM'), 'the scene still paints an ADD ROOM affordance');

  // The FIVE that used to be blank boxes are all labelled — measured off the capture, not typed:
  // every untyped deck-0 compartment must appear by name in the drawn SVG.
  const untyped = WDECK0.slots.filter((s) => s.roomType === 0);
  assert.equal(untyped.length, 5, 'the wreck deck 0 has five untyped compartments (the owner\'s "5 of 8")');
  for (const s of untyped) {
    assert.ok(svg.includes(s.displayName), `${s.anchorName} draws no label ("${s.displayName}")`);
    assert.ok(svg.includes(`data-anchor="${s.anchorName}"`),
      `${s.anchorName} draws no data-anchor, so a click on it cannot hit-test to a room`);
  }
  // …and the three AUTHORED purposes still win over the neutral name — the rule's first branch.
  for (const [anchor, label] of [['cryobay', 'CRYO BAY'], ['reactor', 'REACTOR'], ['lifesupport', 'LIFE SUPPORT']]) {
    assert.ok(svg.includes(label), `${anchor} lost its authored name "${label}" to the neutral one`);
  }
});

// ═══════════════════════════════════════════════════════════ 2. THE TOTALITY LEG (no hole anywhere)

test('M1-L TOTALITY: every compartment on every captured ship gets a non-empty UPPERCASE name', () => {
  // Both captures: the post-M1-L wreck AND `overview-grid.json`, which is a PRE-M1-L capture whose
  // untyped slots still carry the old `occupied:false` / blank-anchor wire shape. Keeping the old
  // one in scope is deliberate — it is the tolerance case (an old or odd host talking to a new
  // client), and the rule has to be total over it too.
  const grid = fixture('overview-grid.json');
  const views = [
    ['wreck (post-M1-L capture)', WVIEW],
    ['grid (PRE-M1-L capture — the tolerance case)',
      decksView(decodeDecks(decode(JSON.stringify(grid.decks))), decodeRooms(decode(JSON.stringify(grid.rooms))))],
  ];
  let counted = 0;
  for (const [what, view] of views) {
    for (const d of view) {
      for (const s of d.slots) {
        counted++;
        assert.ok(s.displayName, `${what} deck ${d.deck} slot ${s.slotIndex} has NO NAME`);
        assert.equal(s.displayName, s.displayName.toUpperCase(),
          `${what} deck ${d.deck} slot ${s.slotIndex} name "${s.displayName}" is not UPPERCASE`);
        assert.ok(!/^hall_d\d+_s\d+$/.test(s.displayName),
          `${what} deck ${d.deck} slot ${s.slotIndex} leaks the internal id "${s.displayName}"`);
      }
    }
  }
  // NON-VACUITY: the sweep really visited both ships' slots rather than an empty list.
  assert.ok(counted >= 16 + 64, `the totality sweep only saw ${counted} slots — it is not covering both ships`);
});

test('M1-L: the DESIGNATION itself is total — asserted directly, not through the ROOM prefix', () => {
  // ⚠️ WHY THIS EXISTS AS ITS OWN TEST (review, 2026-07-29). The hostile sweep below asserts
  // `compartmentName(...).length > 0`, and `compartmentName` prefixes `'ROOM '`. So mutating
  // `compartmentDesignation` to return `''` on non-finite input SURVIVED the whole 1036-test suite:
  // the hole yields the string `"ROOM "`, which is non-empty, UPPERCASE, and passes every assertion
  // — **while all four bottom-row slots of a deck would read identically as `ROOM `**, which is the
  // EXACT failure the `ROOM`-vs-`COMPARTMENT` measurement in `decks-model.js` exists to prevent. A
  // guard whose subject is wrapped in a non-empty prefix cannot see emptiness in the subject.
  //
  // Two independent legs, because either alone is defeatable: totality of the designation, and
  // pairwise-distinctness of the eight names a real deck actually shows.
  for (const idx of [undefined, null, NaN, Infinity, -Infinity, -1, -0, 0, 3, 7, 8, 103, 104, 1e6, 2.7, '5', '', {}, []]) {
    const d = compartmentDesignation(idx);
    assert.equal(typeof d, 'string', `compartmentDesignation(${String(idx)}) is not a string`);
    assert.ok(d.length > 0, `compartmentDesignation(${String(idx)}) returned '' — see this test's header`);
    assert.equal(d, d.toUpperCase(), `compartmentDesignation(${String(idx)}) is not UPPERCASE`);
  }
  // THE DECISIVE LEG, and the one that would have caught the hole through `compartmentName` too:
  // the eight names ONE DECK shows must be pairwise distinct. `"ROOM "` eight times is not.
  const deckNames = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => compartmentName(0, i));
  assert.equal(new Set(deckNames).size, 8,
    `a deck shows duplicate compartment names: ${JSON.stringify(deckNames)} — two boxes the player `
    + 'cannot tell apart is the defect the neutral designation exists to remove');
});

test('M1-L: an anchor id can no longer become a caption — the three fallbacks are gone', () => {
  // ⚠️ REVIEW FINDING, 2026-07-29. `decks-model.js` asserted *"there is no longer any path from an
  // anchor id to a label"* — an ABSOLUTE NEGATIVE, and false: THREE `|| anchorName` fallbacks were
  // still standing in shipped client code. They were unreachable only because `compartmentName` is
  // total, i.e. closed by a RETURN VALUE rather than by construction, and `wire-decks.test.js`'s
  // WP-1 tripwire ranges over `deckSlotView` only, so it could see none of them.
  //
  // The three are deleted. This pins the deletion where it can actually bite: hand each consumer a
  // slot the host cannot currently produce — blank `displayName`, live `anchorName` — and require
  // the internal id NOT to come back out. Each leg carries its own fixture and its own assertion, so
  // no leg can be silently dead behind an earlier one (`assert` throws; the fifth trap shape).
  const ID = 'hall_d1_s6';
  const slot = {
    slotIndex: 6, rect: { x: 0, y: 0, w: 6, h: 5 }, roomType: 0, occupied: true, active: true,
    anchorName: ID, displayName: '', atmos: null,
  };
  const dView = [{ deck: 1, slots: [slot] }];

  // 1. THE ROOM-ZOOM CAPTION / BREADCRUMB.
  const rr = roomTileRect(dView, ID, 6);
  assert.ok(rr, 'the fixture does not resolve at all — this leg would pass vacuously');
  assert.equal(rr.displayName, '',
    `roomTileRect fell back to the anchor id ("${rr.displayName}") — the Room Zoom captions itself `
    + 'with an internal id');
  assert.equal(rr.anchor, ID, 'the anchor itself must SURVIVE — it is the wire key, not the caption');

  // 2. THE CREW DOCK.
  const cs = crewRoomSlot(dView, { deck: 1, x: 2, y: 2 });
  assert.ok(cs, 'the fixture does not resolve at all — this leg would pass vacuously');
  assert.equal(cs.displayName, '',
    `crewRoomSlot fell back to the anchor id ("${cs.displayName}") — a dock row labelled with one`);
  assert.equal(cs.anchor, ID, 'the anchor itself must SURVIVE — it is the navigation target');

  // 3. THE OVERVIEW READOUT'S `CURRENT ROOM` LINE — the one a player reads without clicking.
  const cr = currentRoom({ x: 2, y: 2 }, dView[0].slots);
  assert.ok(cr, 'the fixture does not resolve at all — this leg would pass vacuously');
  assert.equal(cr.displayName, '',
    `currentRoom fell back to the anchor id ("${cr.displayName}") — the readout prints it at the player`);
  assert.equal(cr.anchorName, ID, 'the anchor itself must SURVIVE');
});

test('M1-L TOTALITY: the naming rule is total over hostile input, and the designation never collides', () => {
  // `compartmentName` must never return '' for ANY argument pair. These are the shapes a decoder can
  // actually produce from a short/garbage tuple (`slotIndex` is `t[0] | 0`, so NaN is reachable via a
  // hand-built object, and a newer host can send an unknown roomType byte).
  for (const rt of [undefined, null, NaN, -1, 0, 42, 999, '', 'Nope', {}, [], 16]) {
    for (const idx of [undefined, null, NaN, -1, 0, 3, 7, 8, 103, 104, 1e6, 2.7, '5']) {
      const name = compartmentName(rt, idx);
      assert.equal(typeof name, 'string');
      assert.ok(name.length > 0, `compartmentName(${String(rt)}, ${String(idx)}) returned ''`);
      assert.equal(name, name.toUpperCase(), `compartmentName(${String(rt)}, ${String(idx)}) is not UPPERCASE`);
    }
  }
  // The neutral designation is INJECTIVE over the whole slot range, which is what stops two
  // compartments on one deck sharing a caption. The old private `slotDesignation` was `idx < 4 ?
  // 'A' : 'B'`, which collided the moment an index went past 7 — this one does not.
  const seen = new Map();
  for (let i = 0; i < 600; i++) {
    const d = compartmentDesignation(i);
    assert.ok(!seen.has(d), `designation "${d}" is shared by slot ${seen.get(d)} and slot ${i}`);
    seen.set(d, i);
  }
  // …and it agrees EXACTLY with the retired A0..B3 scheme over the real 8-slot grid, so nothing
  // visible moved for the ships that ship.
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(compartmentDesignation),
    ['A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3']);
  assert.equal(SLOT_COLS, 4);
});

test('M1-L: the authored purpose still wins, and the anchor id is no longer a naming source at all', () => {
  // Branch 1 of the rule, over every member of the enum the host can send.
  for (const [id, label] of Object.entries(ROOM_LABEL_BY_ID)) {
    if (!label) continue;
    assert.equal(compartmentName(Number(id), 3), label);
    assert.equal(roomLabel(Number(id)), label);
  }
  // Branch 2, and the DECISIVE control: a slot whose anchorName would once have become the caption.
  // The old rule was `roomLabel(roomType) || anchorName || ''`. This is the mutation that would
  // restore it, asserted dead: the anchor is present, distinctive, and must not appear.
  const v = deckSlotView({ slotIndex: 6, x: 0, y: 0, w: 4, h: 4, anchorName: 'hall_d1_s6', roomType: 0, occupied: true }, new Map());
  assert.equal(v.displayName, 'ROOM B2');
  assert.ok(!v.displayName.includes('hall'), 'the anchor-name fallback is back — an internal id reaches the player');
  assert.equal(v.anchorName, 'hall_d1_s6', 'the anchor itself must SURVIVE — it is the wire key the Room Zoom looks up');
});

// ══════════════════════════════════════════════════ 3. THE CENSUS — no ＋ADD ROOM affordance survives

// EQUALITY-PINNED, not "greater than zero": a census that only forbids growth cannot notice that one
// of the six sites came back. Every count here is 0 by intent, and the file list is pinned too, so
// deleting a file from the sweep is as visible as a match inside one.
//
// ⚠️ EVERY SCAN IS COMMENT-STRIPPED with the SHIPPED `codeOnly` (imported from `./code-only.js`,
// never re-derived — `CLAUDE.md` trap 1's stated countermeasure). This matters more than usual here:
// the deletion sites are DELIBERATELY commented, and those comments say `＋ADD ROOM` and
// `Cmd.addRoom` out loud. Without stripping, this census would fail on its own documentation — and
// the "fix" would be to delete the explanations, which is the failure mode trap 1 warns about.
const CENSUS_FILES = [
  'ui/overview-scene.js',
  'ui/overview-view.js',
  'ui/overview-model.js',
  'ui/decks-model.js',
  'wire/session.js',
  'main.js',
];

/** Every affordance the ＋ADD ROOM gesture was made of, as a source token that must not appear. */
const RETIRED_TOKENS = [
  'pl-addroom',          // the chip's SVG class (the drawn affordance)
  'pl-hall',             // the hall group it lived in
  'hallCompartment',     // the painter
  'addRoomSlot',         // the hit-test result
  'ROOM_TYPE_CHOICES',   // the picker's 13 types
  'showRoomPicker',      // the picker
  'submitRoomPick',      // the picker's commit
  'closeRoomPicker',     // the picker's dismiss
  'ov-picker',           // the modal's element id
  'onAddRoom',           // the injection point
  'addRoom',             // the wire sender (`Cmd.addRoom`) — a substring of `onAddRoom`, checked too
  'addroom',             // the wire verb string and the click-action type
];

test('M1-L CENSUS: no ＋ADD ROOM affordance survives anywhere on the standard surface', () => {
  const hits = [];
  for (const f of CENSUS_FILES) {
    const code = codeOnly(src(f));
    for (const tok of RETIRED_TOKENS) {
      const n = code.split(tok).length - 1;
      if (n) hits.push(`${f}: ${n}x "${tok}"`);
    }
  }
  assert.deepEqual(hits, [], 'a ＋ADD ROOM affordance is still live in shipped client code');

  // NON-VACUITY BY INCLUSION, not by population count (`CLAUDE.md`, the fourth trap shape: a count
  // proves the matcher matched SOMETHING, never that it would match THE THING). Plant each retired
  // token into each file's real source and require the sweep to catch it.
  for (const f of CENSUS_FILES) {
    const real = src(f);
    for (const tok of RETIRED_TOKENS) {
      const planted = codeOnly(real + '\nconst probe = ' + tok + ';\n');
      assert.ok(planted.includes(tok),
        `the sweep cannot see "${tok}" planted in ${f} — the census over that pair is vacuous`);
    }
  }
});

test('M1-L CENSUS: the census files are pinned by EQUALITY and all exist', () => {
  // A file silently dropped from `CENSUS_FILES` would make its share of the sweep disappear without
  // any assertion changing. Pin the list, and prove each entry is a file that really reads.
  assert.deepEqual(CENSUS_FILES, [
    'ui/overview-scene.js', 'ui/overview-view.js', 'ui/overview-model.js',
    'ui/decks-model.js', 'wire/session.js', 'main.js',
  ]);
  assert.equal(RETIRED_TOKENS.length, 12);
  for (const f of CENSUS_FILES) assert.ok(src(f).length > 100, `${f} did not read as real source`);
});

test('M1-L CENSUS: `overview-scene.js` does not read `occupied`, and the comments say so', () => {
  // ⚠️ THIS PINS ONE OF MY OWN ABSOLUTE NEGATIVES (review, 2026-07-29). Three places in and around
  // `overview-scene.js` claimed `occupied` "drives the glow pool" / was "still read, one layer
  // down". Measured with the shipped `codeOnly`: it occurs ZERO times in that module's code. The
  // corrections say so — and a sentence saying a thing does not exist is exactly the shape that
  // rots silently, so it is asserted rather than trusted. If a future lane gives the scene a
  // legitimate reason to read `occupied` again, this reddens and the comments get corrected WITH
  // the code instead of after it.
  const scene = codeOnly(src('ui/overview-scene.js'));
  assert.equal(scene.split('.occupied').length - 1, 0,
    '`overview-scene.js` reads `.occupied` again — three comments in that file and one in '
    + '`overview-scene.test.js` assert it does not. Correct them in the same commit.');
  assert.ok(scene.includes('slot.roomType'), 'the glow gate is gone — this assertion is vacuous');

  // ⭐ AND THE CONVERSE, so this is not read as "`occupied` is dead everywhere": it has exactly ONE
  // live reader left on the Overview, and that reader is the reason KNOWN LIMIT 2 exists.
  const viewCode = codeOnly(src('ui/overview-view.js'));
  assert.ok(viewCode.includes('if (!s.occupied) continue;'),
    '`lensOverlaySvg` stopped gating on `occupied` — the lens wash coverage changed again, so '
    + 'KNOWN LIMIT 2 (3 washes → 8 per deck) must be re-derived, not carried forward');
});

test('M1-L CENSUS: the comment stripper does NOT trip the census on its own documentation', () => {
  // THE NEGATIVE CONTROL, in both directions.
  //
  // (a) The deletion sites are documented in comments naming the very tokens above. Prove the
  //     stripper removes them — otherwise the census fires on prose and the "fix" is to delete the
  //     explanations, which is exactly the behaviour trap 1 warns against.
  for (const f of CENSUS_FILES) {
    const raw = src(f), code = codeOnly(raw);
    const rawHits = RETIRED_TOKENS.filter((t) => raw.includes(t));
    const codeHits = RETIRED_TOKENS.filter((t) => code.includes(t));
    assert.deepEqual(codeHits, [], `${f}: ${codeHits} survived stripping`);
    if (f === 'ui/overview-view.js' || f === 'wire/session.js') {
      assert.ok(rawHits.length > 0,
        `${f} carries NO retired token even in its raw text, so this control is vacuous there — the `
        + 'dormancy comments this package promised are missing from that file.');
    }
  }

  // (b) ⚠️ THE FIXTURE MUST CONTAIN A LATER REAL COMMENT. A control asserting "a quoted /* does not
  //     blind the stripper" whose fixture has no closing `*/` is VACUOUS — the naive
  //     `replace(/\/\*[\s\S]*?\*\//g,'')` finds no match, returns the input unchanged, and passes
  //     whether the stripper is correct or broken (`CLAUDE.md`, the 2026-07-27 trap, landed twice in
  //     one day). So: a quoted comment opener, THEN a real comment that closes, THEN live code.
  const tricky = [
    'const opener = "/* not a comment */";',   // a quoted opener AND closer, inside a string
    'const line = "// also not a comment";',
    '/* a LATER REAL comment mentioning showRoomPicker and pl-addroom */',
    'const live = ROOM_TYPE_CHOICES;',          // must SURVIVE — it is code
    '// a trailing real line comment naming addRoomSlot',
  ].join('\n');
  const out = codeOnly(tricky);
  assert.ok(out.includes('ROOM_TYPE_CHOICES'), 'the stripper ate live code — a quoted /* blinded it');
  assert.ok(out.includes('"/* not a comment */"'), 'the stripper stripped inside a string literal');
  assert.ok(!out.includes('a LATER REAL comment'), 'the later real block comment was NOT stripped');
  assert.ok(!out.includes('trailing real line comment'), 'the trailing real line comment was NOT stripped');
  // …and the tokens named ONLY in those real comments are gone, which is the property the census needs.
  assert.ok(!out.includes('showRoomPicker') && !out.includes('pl-addroom') && !out.includes('addRoomSlot'));
});

test('M1-L: the click classifier can no longer PRODUCE an addroom action, under any input', () => {
  // The census above is a source scan; this is the behavioural half, and it is the one that would
  // catch a rebuild of the action under a different spelling. Sweep every armed tool against every
  // hit shape — including the two RETIRED keys — and require `addroom` never to appear.
  const types = new Set();
  for (const tool of [null, 'move', 'dig', 'strip', 'erase', 'wall', 'floor', 'door', 'cancel', 'stockpile']) {
    for (const hit of [undefined, null, {}, { pawnCid: 1 }, { terminalId: 't' }, { roomAnchor: 'hall_d0_s1' },
      { addRoomSlot: 0 }, { addRoomSlot: 3 }, { hallSlot: 2 },
      { pawnCid: 1, terminalId: 't', roomAnchor: 'r', addRoomSlot: 5, hallSlot: 5 }]) {
      types.add(overviewClickAction(tool, hit).type);
    }
  }
  assert.ok(!types.has('addroom'), 'the classifier still produces an `addroom` action');
  // NON-VACUITY: the sweep really produced actions, so "no addroom" is not "no output".
  for (const t of ['move', 'order', 'erase', 'select', 'terminal', 'enterRoom', 'none']) {
    assert.ok(types.has(t), `the sweep never produced '${t}' — it is not exercising the classifier`);
  }
});

// ═════════════════════════════════════════════ 4. THE NAME MUST FIT THE SPACE IT IS DRAWN IN

test('M1-L: the neutral compartment name FITS its label slot — the clip budget is 11 characters', () => {
  // ⚠️ MEASURED, NOT CHOSEN. `overview-scene.js` draws the room group BELOW the furniture layer, and
  // on every BOTTOM-ROW compartment the spine door sits on the TOP wall exactly where the label
  // runs. Measured over CDP on a live `--ship wreck` (`client/tools/no-add-room-shot.mjs` prints the
  // census): top-row labels 107 px of 107 visible, bottom-row labels 88 px of 107. At 8.5 px Space
  // Mono with letter-spacing 1 that is ~7.64 px/char, so the readable budget is ~11 characters.
  //
  // THE FIRST DRAFT OF THIS PACKAGE SHIPPED `COMPARTMENT B0` (14) AND IT RENDERED AS `COMPARTMENT`.
  // The hidden tail was the DESIGNATION — the only part that distinguishes one compartment from
  // another — so all four bottom-row slots read identically and the naming rule was total in code
  // and holed on screen. This guard is the tripwire for that, and it is a REAL bound rather than a
  // round number: `LIFE SUPPORT` is 12 and would clip, which is why it is asserted as a known limit
  // below instead of being quietly included.
  const BUDGET = 11;
  for (let i = 0; i < 8; i++) {
    const name = compartmentName(0, i);
    assert.ok(name.length <= BUDGET,
      `the neutral name "${name}" is ${name.length} chars; the bottom-row door clips past ${BUDGET}, `
      + 'and the part it clips is the designation that makes the name unique');
  }
  assert.equal(compartmentName(0, 4), 'ROOM B0');

  // ⚠️ THE KNOWN LIMIT, ASSERTED SO IT CANNOT BE FORGOTTEN RATHER THAN FIXED HERE: an AUTHORED room
  // name longer than the budget is still clipped on a bottom-row slot. `LIFE SUPPORT` is the live
  // example. No shipped ship puts it on a bottom-row slot (the wreck has it at slot 3, top row), so
  // the hazard is real and latent. Fixing it means re-layering the scene, which was built, measured
  // and reverted in this package — see `compartmentName`'s header.
  const overBudget = Object.values(ROOM_LABEL_BY_ID).filter((l) => l && l.length > BUDGET);
  assert.deepEqual(overBudget, ['LIFE SUPPORT'],
    'the set of authored room names that would clip on a bottom-row slot has CHANGED. That is not '
    + 'necessarily wrong, but it is the known limit this package filed, so update it deliberately.');
});

// ═════════════════ 5. WIDENING `occupied` MUST NOT SILENTLY REPURPOSE A PLAYER-FACING SIGNAL

// ⚠️ BOTH TESTS BELOW EXIST BECAUSE THE FIRST DRAFT OF THIS PACKAGE SHIPPED BOTH REGRESSIONS, and
// the whole suite was green. `occupied` used to mean "an anchor with a RoomType resolves here" and
// now means "this slot's walls enclose a real room" — which is TRUE FOR EVERY SLOT ON EVERY SHIPPED
// SHIP. Every reader of the flag therefore became a constant. That is the M1-F failure (a gauge that
// is never anything but a constant) arriving as a SIDE EFFECT rather than as a feature, and nothing
// in the suite could see it because nothing pinned what the flag was worth.

test('M1-L: the glow pools keep the EXACT set they had — a widened flag must not light the dead deck', () => {
  // MEASURED on `--ship wreck` with the glow still reading `occupied`: pools go 3 → 8 on deck 0 and
  // 0 → 8 on DECK 1, which is unpowered, airless, sealed, and dead by owner decision (OD-E).
  for (const d of WVIEW) {
    const svg = overviewScene({ deck: d.deck, decksView: WVIEW, frame: null, crew: [], marks: [] });
    const glows = (svg.match(/id="ov-glow-\d+"/g) || []).length;
    const purposed = d.slots.filter((s) => s.roomType !== 0).length;
    assert.equal(glows, purposed,
      `deck ${d.deck} draws ${glows} glow pools for ${purposed} purposed compartments. The glow is a `
      + 'claim about the ship\'s state, not about its floor plan.');
  }
  // The two decisive numbers, written out so a future edit cannot drift them quietly.
  const deck1 = WVIEW.find((d) => (d.deck | 0) === 1);
  assert.equal(deck1.slots.filter((s) => s.roomType !== 0).length, 0, 'the wreck\'s dead deck gained a purposed room');
  const svg1 = overviewScene({ deck: 1, decksView: WVIEW, frame: null, crew: [], marks: [] });
  assert.equal((svg1.match(/id="ov-glow-\d+"/g) || []).length, 0,
    'the DEAD DECK is lit by eight amber pools — `occupied` is back in the glow predicate');
  // NON-VACUITY: deck 0 really does glow, so "0 on deck 1" is not "the layer is switched off".
  const svg0 = overviewScene({ deck: 0, decksView: WVIEW, frame: null, crew: [], marks: [] });
  assert.equal((svg0.match(/id="ov-glow-\d+"/g) || []).length, 3,
    'deck 0 lost its glow pools too — this test is measuring a dead layer, not a correct predicate');
});

test('M1-L: `active` still means "this deck is alive" — the POWER lens must not green the dead deck', () => {
  // `lensSlotTint(\'power\', slot)` returns the GOOD tint whenever `slot.active` is set
  // (`overview-model.js`), and `active` is host-derived. With it still keyed to `occupied` the POWER
  // lens painted all eight DECK-1 compartments green on `--ship wreck` — a deck with no conduit tray,
  // whose machinery is off-network and neither draws nor runs.
  const byDeck = new Map(WVIEW.map((d) => [d.deck | 0, d]));
  const live = byDeck.get(0).slots.filter((s) => s.active).length;
  const dead = byDeck.get(1).slots.filter((s) => s.active).length;
  assert.equal(dead, 0,
    'every compartment on the wreck\'s DEAD deck reports `active`, so the POWER lens tints it GOOD. '
    + 'The host is deriving `active` from the widened `occupied` again (GameSession.BuildDecks).');
  assert.equal(live, 8, 'deck 0 is not active at all — the flag is now a different constant, not a fact');
  // ⚠️ THE ASSERTION THAT MATTERS IS *GOOD vs BAD*, NOT *TINT vs NO TINT* — and the first draft of
  // this test got that wrong and failed for the wrong reason. `lensSlotTint('power', …)` returns
  // `GRADE_TINT.bad` (red) for an inactive slot, never null, so "no tint on the dead deck" was never
  // the property. RED on the dead deck is CORRECT INFORMATION: the deck is unpowered and now says so.
  for (const s of byDeck.get(1).slots) {
    assert.equal(lensSlotTint('power', s), GRADE_TINT.bad,
      `${s.anchorName} on the dead deck is not tinted BAD under the POWER lens`);
    assert.notEqual(lensSlotTint('power', s), GRADE_TINT.good,
      `${s.anchorName} on the DEAD deck is tinted GOOD — the lens is claiming an off-network, `
      + 'unpowered compartment is powered');
  }
  // NON-VACUITY: the same call on a LIVE deck must produce the OTHER tint, or "bad everywhere" would
  // only prove the lens returns one constant.
  assert.equal(lensSlotTint('power', byDeck.get(0).slots[0]), GRADE_TINT.good,
    'the POWER lens reads BAD on the live deck too — it is a constant, so this test sees nothing');

  // ⛔ ⭐ KNOWN LIMIT 2 — THE POWER LENS IS NOW EIGHT IDENTICAL BOXES PER DECK. The first version of
  // this note disclosed HALF the change and review measured the other half live. Both halves:
  //
  //   deck 1 (dead) : 0 washes → 8 RED    ← was disclosed
  //   deck 0 (live) : 3 washes → 8 GREEN  ← was NOT disclosed, and it is the worse half
  //
  // `lensOverlaySvg` (`overview-view.js:599`) skips `!s.occupied`, so before M1-L only the THREE
  // authored deck-0 rooms — cryobay, lifesupport, reactor — were lensed at all. Now every
  // compartment is occupied, so **five new GREEN washes land on the live deck, including `ROOM B3`
  // (`hall_d0_s7`) — collapsed, empty, and holding all 20 of the deck's debris tiles — claiming
  // "powered"**.
  //
  // ⇒ The deeper property, and the reason this is a LIMIT and not just a widening: `active` is
  // stamped DECK-UNIFORMLY by the host (`GameSession.BuildDecks`' second pass sets it for every slot
  // on a deck at once, pinned by `EveryCompartmentIsARoomTests.ActiveIsDerivedFromGas…`). So the
  // POWER lens can now only ever paint a deck ALL GREEN or ALL RED. Before M1-L that constancy was
  // partly hidden by the untyped slots being skipped; it is fully visible now. **That is the M1-F
  // failure — "a gauge that is never anything but a constant" — seen from the other side, and this
  // package's own commit invokes M1-F as the reason for the `active` fix.** The reading is TRUE (a
  // deck really is powered or not); it is simply not per-compartment, and the lens's box-per-room
  // presentation implies it is. Filed, not fixed: making POWER per-compartment needs a per-slot
  // power fact the host does not compute, which is lens-design work under OD-A/B.
  assert.equal(byDeck.get(1).slots.filter((s) => s.occupied).length, 8,
    'the dead deck is not fully occupied, so it would not be lensed at all');
  // Both halves of the limit, asserted so neither can be quietly lost.
  const lensed = (d) => byDeck.get(d).slots.filter((s) => s.occupied && lensSlotTint('power', s));
  assert.equal(lensed(1).length, 8, 'the dead deck no longer takes 8 washes — KNOWN LIMIT 2 moved');
  assert.equal(lensed(0).length, 8, 'the LIVE deck no longer takes 8 washes — KNOWN LIMIT 2 moved');
  assert.equal(new Set(byDeck.get(0).slots.map((s) => lensSlotTint('power', s))).size, 1,
    'the POWER lens is no longer deck-uniform on deck 0 — KNOWN LIMIT 2 has been fixed or broken; '
    + 'either way this note and the host-side `active` guard must be re-derived');
});
