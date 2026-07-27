// THE `marks` CHANNEL — the client half, and the acceptance for the whole package.
//
// WHAT THIS FILE OWNS, in order of how badly it bites:
//   1. THE ACCEPTANCE, ON A LIVE CAPTURE. `client/test/fixtures/marks-grid.json` is a coherent
//      one-session capture from a running `--ship grid` host whose write predicate REQUIRES an
//      OCCLUDED mark — a tile the `marks` channel reports and whose `cell[1]` foreground byte does
//      NOT carry that mark's projection colour, because GlyphMapper pass 3 (a ground item), pass 4
//      (a device) or pass 5 (a standing crew member) painted over it. Every such tile is a mark the
//      RETIRED fg-byte path would have failed to draw, and every one of them is drawn now. That is
//      the package, measured on real data rather than argued about.
//   2. THE CROSS-LANGUAGE KIND ENUM. `WireFormat.MarkDebris`/`MarkDig`/`MarkStockpile`/`MarkStrip`
//      and `MARK_KIND_NAMES` are one contract with no compiler across it. Disagree, and a dig order
//      draws as rubble or a condemned wall draws as a zone — silently, on the standard surface.
//   3. THE TUPLE ORDER. `[x, y, deck, kind]` is positional; a host that swapped two elements would
//      put every mark on the wrong tile or the wrong deck.
//   4. THE DECODER'S TOLERANCE, including what it does with a kind from a NEWER host.
//   5. THAT BOTH SURFACES ACTUALLY DRAW IT, and that `main.js` dispatches the channel at all.
//
// EVERY SOURCE SCAN HERE READS CODE, NOT PROSE — `codeOnly` is IMPORTED from the shared
// `client/test/code-only.js` (CLAUDE.md traps §1: a guard matching raw source text is satisfied by
// the thing it guards against, COMMENTED OUT; that shipped four times in one day). Both directions
// are controlled at the bottom of this file: comments must not trip the scans, and real code must.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  decode, decodeDecks, decodeRooms, decodeMarks, markKindName, MARK_KIND_NAMES,
  MARK_KIND_DEBRIS, MARK_KIND_DIG, MARK_KIND_STOCKPILE, MARK_KIND_STRIP,
} from '../src/wire/messages.js';
import { decksView } from '../src/ui/decks-model.js';
import { roomMarkTiles, markLayerSvg, deckSlots } from '../src/ui/room-model.js';
import { overviewScene } from '../src/ui/overview-scene.js';
import { codeOnly } from './code-only.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
const read = (abs) => readFileSync(abs, 'utf8');

const WIRE_MARKS_CS = codeOnly(read(join(REPO, 'hosts/web/WireFormat.Marks.cs')));
const MAIN = codeOnly(read(join(CLIENT, 'src/main.js')));
const OVERVIEW_VIEW = codeOnly(read(join(CLIENT, 'src/ui/overview-view.js')));
const MARK_OVERLAY = codeOnly(read(join(CLIENT, 'src/ui/mark-overlay.js')));

const FIX = JSON.parse(read(join(here, 'fixtures/marks-grid.json')));
const CAP_DECK = FIX.deck | 0;
const capFrame = FIX.frame;
const capMarks = decodeMarks(FIX.marks);
const capView = decksView(decodeDecks(decode(JSON.stringify(FIX.decks))),
  decodeRooms(decode(JSON.stringify(FIX.rooms))));

/** Every `<g class="mk mk-KIND">…</g>` in an SVG string, as `{kind, body}`. */
const marks = (svg) =>
  [...svg.matchAll(/<g class="mk mk-([a-z]+)">([\s\S]*?)<\/g>/g)].map((m) => ({ kind: m[1], body: m[2] }));

// ════════════════════════════════════════════════════════════ the cross-language kind enum

// MUTATION: change `MarkStrip = 3` to `= 4` in hosts/web/WireFormat.Marks.cs ⇒ this fails and names
// both files. MUTATION 2: reorder MARK_KIND_NAMES in messages.js ⇒ same.
test('the wire kind enum matches the host constants it mirrors, name for name', () => {
  const hostKinds = {};
  for (const m of WIRE_MARKS_CS.matchAll(/const\s+int\s+Mark(\w+)\s*=\s*(\d+)\s*;/g)) {
    hostKinds[m[1].toLowerCase()] = Number(m[2]);
  }
  assert.deepEqual(hostKinds, { debris: 0, dig: 1, stockpile: 2, strip: 3 },
    'the Mark* constants in hosts/web/WireFormat.Marks.cs are no longer the four this client knows. '
    + 'Either a kind was added (append it to MARK_KIND_NAMES in client/src/wire/messages.js in the '
    + 'SAME commit) or this parse has rotted, in which case every assertion resting on it is vacuous.');

  // The client's own table, compared by NAME against the host's own constant names — not by index
  // against a copied literal, which could not notice a rename.
  for (const [name, value] of Object.entries(hostKinds)) {
    assert.equal(MARK_KIND_NAMES[value], name,
      `the host calls kind ${value} '${name}' and the client draws '${MARK_KIND_NAMES[value]}'. `
      + 'These are one contract with no compiler across it: disagree and a dig order draws as rubble '
      + 'or a condemned wall draws as a stockpile zone, silently, on the standard surface.');
    assert.equal(markKindName(value), name);
  }
  // …and the exported single constants agree with the table, so a caller may use either.
  assert.equal(MARK_KIND_NAMES[MARK_KIND_DEBRIS], 'debris');
  assert.equal(MARK_KIND_NAMES[MARK_KIND_DIG], 'dig');
  assert.equal(MARK_KIND_NAMES[MARK_KIND_STOCKPILE], 'stockpile');
  assert.equal(MARK_KIND_NAMES[MARK_KIND_STRIP], 'strip');
  // Non-vacuity: an empty parse would satisfy the loop above without checking anything.
  assert.equal(Object.keys(hostKinds).length, 4);
});

// MUTATION: emit the tuple as [x,y,kind,deck] in WireFormat.Marks.cs ⇒ this fails.
test('the host writes the marks tuple in the order the decoder reads it', () => {
  const body = WIRE_MARKS_CS.slice(WIRE_MARKS_CS.indexOf('public static string Marks('));
  const fields = [...body.matchAll(/c\.(X|Y|Deck|Kind)\.ToString/g)].map((h) => h[1]);
  assert.deepEqual(fields, ['X', 'Y', 'Deck', 'Kind'],
    'the `marks` tuple is [x, y, deck, kind] and decodeMarks indexes it positionally; the emitter '
    + `now writes ${JSON.stringify(fields)}. Swap deck and kind and every mark lands on the wrong `
    + 'deck wearing the wrong shape.');
});

// ════════════════════════════════════════════════════════════════════════════ the decoder

test('decodeMarks mirrors the encoder, preserves order, and never throws', () => {
  const msg = { type: 'marks', cells: [[3, 4, 0, 0], [58, 15, 1, 3], [7, 2, 1, 2]] };
  assert.deepEqual(decodeMarks(msg), [
    { x: 3, y: 4, deck: 0, kind: 0, mark: 'debris' },
    { x: 58, y: 15, deck: 1, kind: 3, mark: 'strip' },
    { x: 7, y: 2, deck: 1, kind: 2, mark: 'stockpile' },
  ]);
  // ORDER IS THE WIRE CONTRACT: the host emits canonical z,y,x and a client sort would be a second,
  // divergent authority. The input above is deliberately NOT sorted.
  assert.deepEqual(decodeMarks(msg).map((m) => m.x), [3, 58, 7]);

  // tolerance
  assert.equal(decodeMarks(null), null);
  assert.equal(decodeMarks({ type: 'zones', cells: [] }), null);
  assert.equal(decodeMarks({ type: 'marks' }), null);
  assert.deepEqual(decodeMarks({ type: 'marks', cells: [] }), []);
  assert.deepEqual(decodeMarks({ type: 'marks', cells: [null, 5, [1, 2, 3], [1, 2, 3, 1]] }),
    [{ x: 1, y: 2, deck: 3, kind: 1, mark: 'dig' }], 'a malformed row is dropped, not thrown on');
});

// MUTATION: keep the unknown-kind row with `mark: ''` ⇒ this fails, and so does the "exactly four
// kinds draw" sweep in room-model.test.js.
test('a kind from a NEWER host is dropped, not carried as a nameless census entry', () => {
  assert.deepEqual(decodeMarks({ type: 'marks', cells: [[1, 1, 0, 4], [2, 2, 0, 99], [3, 3, 0, 0]] }),
    [{ x: 3, y: 3, deck: 0, kind: 0, mark: 'debris' }],
    'an unknown kind must be DROPPED. The enum is append-only, so an unknown kind means a newer '
    + 'host: this client cannot draw it and cannot reason about it. Carrying it with an empty name '
    + 'would put a row into roomMarkTiles\' census that every downstream `mark === \'dig\'` test '
    + 'silently answers "no" to — a lie wearing the shape of data.');
  assert.equal(markKindName(4), '');
  assert.equal(markKindName(-1), '');
});

// ════════════════════════════════════════════ THE ACCEPTANCE, on the live capture

/**
 * ⚠️ THE RETIRED PATH, RECONSTRUCTED HERE ON PURPOSE. `MARK_FOR_FG` / `markForFg` are gone from
 * `mark-overlay.js`; this is the table they held, kept in the TEST so the two sources can be
 * compared on real captured data. It is not importable production code and must never become any:
 * the point of the comparison is that this path LOSES marks.
 */
const RETIRED_FG_TO_MARK = { 4: 'debris', 15: 'dig', 16: 'stockpile', 26: 'strip' };
function retiredMarksFromFrame(frame) {
  const out = new Map();
  for (let ty = 0; ty < frame.h; ty += 1) {
    for (let tx = 0; tx < frame.w; tx += 1) {
      const cell = frame.cells[ty * frame.w + tx];
      if (!Array.isArray(cell)) continue;
      const mark = RETIRED_FG_TO_MARK[cell[1] | 0];
      if (mark) out.set(tx + ',' + ty, mark);
    }
  }
  return out;
}

test('the live capture can DRIVE the acceptance (the anti-vacuity tripwire)', () => {
  assert.ok(Array.isArray(capMarks) && capMarks.length > 0, 'the captured `marks` payload is empty');
  const kinds = new Set(capMarks.filter((m) => m.deck === CAP_DECK).map((m) => m.mark));
  assert.deepEqual([...kinds].sort(), ['debris', 'dig', 'stockpile', 'strip'],
    'the capture no longer carries all four mark kinds on its deck, so the per-kind assertions below '
    + 'are claims about the empty set. Regenerate with `node client/tools/capture-marks.mjs` against '
    + 'a live `--ship grid` host — it is predicate-gated on exactly this and writes nothing otherwise.');

  // The fixture's own recorded occlusions, and the fact that they are REAL: re-derive them here from
  // the frame + marks rather than trusting the `occluded` array the capture wrote.
  const retired = retiredMarksFromFrame(capFrame);
  const lost = capMarks.filter((m) => m.deck === CAP_DECK && retired.get(m.x + ',' + m.y) !== m.mark);
  assert.ok(lost.length > 0,
    'NOT ONE captured mark is occluded in the paired frame, so the retired fg-byte path would have '
    + 'drawn every mark correctly and this whole file proves nothing. The capture script refuses to '
    + 'write a fixture like this; if you see it, the fixture was hand-edited.');
  assert.equal(lost.length, FIX.occluded.length,
    'the re-derived occlusion count disagrees with the one the capture recorded — the fixture\'s '
    + '`frame` and `marks` are no longer the coherent pair the capture wrote.');
  // Measured at capture, pinned so a recapture that changes the shape of the evidence says so.
  assert.equal(lost.length, 34);
  assert.deepEqual([...new Set(lost.map((m) => m.mark))], ['stockpile']);
});

// THE ACCEPTANCE. MUTATION: point `markLayer` back at `cell[1]` in overview-scene.js ⇒ every occluded
// mark disappears from the emitted SVG and this fails, naming them.
test('ACCEPTANCE: every mark the projection LOST is drawn by the Overview from the channel', () => {
  const svg = overviewScene({
    deck: CAP_DECK, decksView: capView, frame: capFrame, crew: [], marks: capMarks,
  });
  const drawn = marks(svg);
  const onDeck = capMarks.filter((m) => m.deck === CAP_DECK);
  assert.equal(drawn.length, onDeck.length,
    'the Overview drew a different number of marks than the channel carries — it is not drawing the '
    + 'channel, or it is drawing something else as well');

  // The counts per kind agree with the channel, kind by kind. (A layer that drew every mark as
  // `debris` would satisfy a bare total.)
  for (const name of MARK_KIND_NAMES) {
    assert.equal(drawn.filter((d) => d.kind === name).length,
      onDeck.filter((m) => m.mark === name).length, `kind '${name}'`);
  }

  // …and specifically the OCCLUDED ones, which is the half no fg byte could deliver. Each is located
  // in the emitted SVG by its own projected box, so this reads the string rather than recomputing a
  // transform in the test (the WP-2 review's worst surviving mutation was exactly that).
  const retired = retiredMarksFromFrame(capFrame);
  const lost = onDeck.filter((m) => retired.get(m.x + ',' + m.y) !== m.mark);
  assert.ok(lost.length > 0, 'no occluded marks in the capture — this assertion would be vacuous');
  const solo = (m) => marks(overviewScene({
    deck: CAP_DECK, decksView: capView, frame: capFrame, crew: [], marks: [m],
  }));
  for (const m of lost) {
    const one = solo(m);
    assert.equal(one.length, 1,
      `the occluded ${m.mark} mark at ${m.x},${m.y} drew ${one.length} marks, not 1 — under the `
      + 'retired fg-byte path it drew NOTHING, because a device / an item / a crew member is '
      + 'standing on it (GlyphMapper passes 3/4/5). This is the defect the channel removes.');
    assert.equal(one[0].kind, m.mark);
  }
});

// The same evidence through the OTHER surface's real pure layer, so a fix on one surface cannot pass
// for both. MUTATION: drop the deck gate in roomMarkTiles ⇒ off-deck marks leak in and this fails.
test('ACCEPTANCE: the Room Zoom draws the occluded marks too, clamped to the room', () => {
  const retired = retiredMarksFromFrame(capFrame);
  const lost = capMarks.filter((m) => m.deck === CAP_DECK && retired.get(m.x + ',' + m.y) !== m.mark);
  assert.ok(lost.length > 0, 'no occluded marks in the capture — this assertion would be vacuous');

  // Find a room on the capture deck that actually contains one of the lost marks, from the fixture's
  // own geometry — never a hand-written rect.
  const slots = deckSlots(capView, CAP_DECK);
  assert.ok(slots.length > 0, 'the capture carries no slots for its deck — the clamp leg is vacuous');
  let focus = null, target = null;
  for (const s of slots) {
    const f = { deck: CAP_DECK, rx: s.rect.x, ry: s.rect.y, rw: s.rect.w, rh: s.rect.h };
    const hit = lost.find((m) => m.x >= f.rx && m.x < f.rx + f.rw && m.y >= f.ry && m.y < f.ry + f.rh);
    if (hit) { focus = f; target = hit; break; }
  }
  assert.ok(focus, 'no room on the capture deck contains an occluded mark — cannot drive the clamp');

  const tiles = roomMarkTiles(capMarks, focus);
  assert.ok(tiles.some((t) => t.tx === target.x && t.ty === target.y && t.mark === target.mark),
    `the Room Zoom's model dropped the occluded ${target.mark} mark at ${target.x},${target.y}`);
  // clamped: nothing outside the room, nothing off the deck
  for (const t of tiles) {
    assert.ok(t.tx >= focus.rx && t.tx < focus.rx + focus.rw && t.ty >= focus.ry && t.ty < focus.ry + focus.rh,
      `roomMarkTiles reported ${t.tx},${t.ty}, outside the room rect it was given`);
  }
  assert.deepEqual(roomMarkTiles(capMarks, { ...focus, deck: CAP_DECK + 100 }), [],
    'roomMarkTiles ignored the deck gate');

  // …and the layer actually draws it (stockpile is skipped by design — zoneLayerSvg owns that tile —
  // so the drawn set is the non-stockpile subset, asserted rather than assumed).
  const svg = markLayerSvg(tiles, focus);
  const expect = tiles.filter((t) => t.mark !== 'stockpile');
  assert.equal(marks(svg).length, expect.length);
});

// ════════════════════════════════════════════════════════════════════ the wiring

// MUTATION: delete `case 'marks':` from main.js ⇒ this fails, AND so does the C#-side
// SurfaceBoundaryTests.EveryWireChannelIsConsumedByTheStandardClient (from the other direction).
test('main.js dispatches the marks channel into the shared state layer', () => {
  assert.match(MAIN, /case 'marks':\s*Hud\.renderMarks\(/,
    'client/src/main.js must dispatch `marks`. `onMessage` is the standard client\'s ONLY dispatch '
    + 'point: a channel with no `case` there is host work the player can never see.');
});

// MUTATION: have overview-view.js pass `frame` to the scene's `marks` slot instead of the decoded
// channel ⇒ this fails. It is NOT the only catcher — the acceptance tests above are — but it is the
// one that names the file.
test('overview-view.js feeds the scene from the marks channel, not from the frame', () => {
  assert.match(OVERVIEW_VIEW, /marks:\s*decodeMarks\(\s*Hud\.getMarks\(\)\s*\)/,
    'client/src/ui/overview-view.js must hand the SCENE the decoded `marks` channel. Reading the '
    + 'mark layer back off `frame` is the defect the channel exists to remove.');
});

// MUTATION: re-export `markForFg` from mark-overlay.js ⇒ this fails. The table is retired, and a
// surviving export is an open invitation to a second, lossy source for the same layer.
test('the retired fg-byte table is GONE from mark-overlay.js, not merely unused', () => {
  assert.doesNotMatch(MARK_OVERLAY, /export\s+(?:const|function)\s+(?:MARK_FOR_FG|markForFg)\b/,
    'client/src/ui/mark-overlay.js still EXPORTS the retired fg→mark table. `cell[1]` is a lossy '
    + 'mark source — GlyphMapper passes 3/4/5 overwrite it — so leaving the table exported for "one '
    + 'more caller" is how the mark layer gets a second source again. The retirement is quoted and '
    + 'negated in that file\'s header; keep it that way.');
  // Non-vacuity in two directions: the file must still be the mark vocabulary (so this is not a
  // scan of the wrong file), and the retraction prose must still be there (so a future reader who
  // greps the old wording lands on the correction rather than on nothing).
  assert.match(MARK_OVERLAY, /export\s+function\s+markCellSvg\b/,
    'mark-overlay.js no longer exports markCellSvg — this scan is looking at the wrong thing');
  assert.match(read(join(CLIENT, 'src/ui/mark-overlay.js')), /MARK_FOR_FG/,
    'the retraction note naming MARK_FOR_FG was deleted from mark-overlay.js. It is kept quoted so '
    + 'a grep for the old table lands on why it went; deleting it recreates the pointer rot this '
    + 'repo has already paid for twice.');
});

// ═══════════════════════════════════════════════════════════ the stripper's own controls

test('NEGATIVE CONTROL: the scans do not fire on commented-out code', () => {
  assert.doesNotMatch(codeOnly("// case 'marks': Hud.renderMarks(m); break;\nconst live = 1;\n"),
    /case 'marks':\s*Hud\.renderMarks\(/,
    'a COMMENTED-OUT dispatch satisfied the wiring scan — the guard would then be green with the '
    + 'channel unread, which is precisely the defect this repo has shipped four times in one day');
  assert.doesNotMatch(codeOnly('/* marks: decodeMarks(Hud.getMarks()), */\nconst live = 1;\n'),
    /marks:\s*decodeMarks\(\s*Hud\.getMarks\(\)\s*\)/,
    'a COMMENTED-OUT block satisfied the overview-view scan');
  assert.doesNotMatch(codeOnly('// export function markForFg(fg) { return 1; }\n'),
    /export\s+function\s+markForFg\b/,
    'a COMMENTED-OUT export tripped the retirement scan — the guard would fire on the retraction '
    + 'prose itself, which teaches people to delete explanatory comments to appease a test');
});

test('POSITIVE CONTROL: the scans do fire on real code, and codeOnly is quote-aware', () => {
  assert.match(codeOnly("    case 'marks': Hud.renderMarks(m); break;\n"), /case 'marks':\s*Hud\.renderMarks\(/,
    'the wiring scan missed a real dispatch — it is vacuous');
  assert.match(codeOnly('    marks: decodeMarks(Hud.getMarks()) || [],\n'),
    /marks:\s*decodeMarks\(\s*Hud\.getMarks\(\)\s*\)/, 'the overview-view scan missed a real call');
  assert.match(codeOnly('export function markForFg(fg) { return 1; }\n'),
    /export\s+function\s+markForFg\b/, 'the retirement scan cannot see a real export — it is vacuous');
  // a quoted `//` must not blind the stripper to end of file
  assert.match(codeOnly("const u = \"http://x//y\";\ncase 'marks': Hud.renderMarks(m); break;\n"),
    /case 'marks':/, 'a quoted "//" blinded the stripper; every scan using it then passes vacuously');
  // …and the C# source really parsed, or the enum pin above is comparing two empty objects
  assert.ok(WIRE_MARKS_CS.includes('public static string Marks('),
    'hosts/web/WireFormat.Marks.cs did not parse — the cross-language pin is vacuous');
});
