// THE `work` CHANNEL (M2-4) — the client half.
//
// WHAT THIS FILE OWNS, in order of how badly it bites:
//   1. THE TUPLE CONTRACT. `[cid, workType, priority]` is positional and there is NO COMPILER across
//      this seam. It is also THE ONE SPARSE CHANNEL THAT DOES NOT LEAD WITH `x, y, deck` — keyed by
//      CITIZEN, not by tile — so the tempting "fix" is to make it look like its six siblings, which
//      would silently read a work type as a coordinate. The order is PARSED out of
//      `hosts/web/WireFormat.Work.cs` (both from the `WorkCell` constructor and from the emitter's
//      own append chain) and from `GameSession.BuildWork`'s fill, then compared against what
//      `decodeWork` actually reads, driven.
//   2. THE DECODER'S TOLERANCE, and the two places its answers are deliberately not the obvious ones:
//      an unknown `workType` is KEPT (following `decodeItems`, not `decodeMarks`), and priority 0
//      never arrives at all — ABSENT = OFF.
//   3. THAT THE CHANNEL IS WIRED: `main.js` dispatches it, `hud.js` caches it behind `getWork`, and a
//      non-console surface actually reaches that getter (which is what puts `getWork` on
//      `SHIP_STATE_REACH`).
//
// NOTHING HERE DRAWS ANYTHING — this file pins the DATA PATH, which is what M2-4 shipped. ⭐ M2-3 has
// since built the surface that draws it (`client/test/overview-model.test.js`, the WORK TAB
// section), and added the one cross-language leg below that only this file could carry: the column
// order against the sim's own ranking.
//
// EVERY SOURCE SCAN READS CODE, NOT PROSE — `codeOnly` is IMPORTED from the shared
// `client/test/code-only.js` (CLAUDE.md trap 1: a guard matching raw source text is satisfied by the
// thing it guards against, COMMENTED OUT). Both directions are controlled at the bottom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeWork } from '../src/wire/messages.js';
import { codeOnly } from './code-only.js';
import { WORK_COLUMNS } from '../src/ui/overview-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
const read = (abs) => readFileSync(abs, 'utf8');

const WIRE_WORK_CS = codeOnly(read(join(REPO, 'hosts/web/WireFormat.Work.cs')));
const GAME_SESSION_CS = codeOnly(read(join(REPO, 'hosts/web/GameSession.cs')));
const CITIZEN_CS = codeOnly(read(join(REPO, 'sim/Sim.Core/Entities/Citizen.cs')));
const MAIN = codeOnly(read(join(CLIENT, 'src/main.js')));
const HUD = codeOnly(read(join(CLIENT, 'src/ui/hud.js')));
const OVERVIEW = codeOnly(read(join(CLIENT, 'src/ui/overview-view.js')));

/** Build a host-shaped `work` message from `[cid, workType, priority]` tuples. */
const msg = (cells) => ({ type: 'work', cells });

// ════════════════════════════════════════════════════════════ the cross-language tuple contract

// MUTATION: swap `.Append(c.WorkType…)` and `.Append(c.Priority…)` in WireFormat.Work.cs ⇒ this fails
// and names the file. MUTATION 2: reorder the `WorkCell` constructor parameters ⇒ same. MUTATION 3:
// re-shape the tuple as [x, y, deck, cid, …] "for consistency" ⇒ the width leg fails, which is the
// point: fix the width AND the parser together, never the width alone.
test('the wire tuple order is [cid, workType, priority] on BOTH sides of the seam', () => {
  // (a) the emitter's own append chain, in source order.
  const emitted = [...WIRE_WORK_CS.matchAll(/\.Append\(c\.(\w+)\.ToString\(WorkIc\)\)/g)].map((m) => m[1]);
  assert.deepEqual(emitted, ['Cid', 'WorkType', 'Priority'],
    'hosts/web/WireFormat.Work.cs no longer appends the tuple in the order this client reads it. The '
    + 'tuple is POSITIONAL — a swap reports a work type as a priority, i.e. "Repair at priority 0" '
    + 'for "work type 0 at priority 1" — and there is no compiler across this seam.');

  // (b) the struct constructor, which is what `GameSession.BuildWork` fills.
  const ctor = /WorkCell\(int (\w+), int (\w+), int (\w+)\)/.exec(WIRE_WORK_CS);
  assert.ok(ctor, 'the WorkCell constructor was not found — this parse has rotted and (a) alone '
    + 'cannot see a caller that fills the fields in the wrong order');
  assert.deepEqual(ctor.slice(1, 4), ['cid', 'workType', 'priority']);

  // (c) …and the host really does fill it from the CITIZEN's id, the work-type index and the stored
  // priority, in that order. The two above pin the wire SHAPE; this pins what is put into it.
  // ⚠️ `(int)c.Id` AND NOT `i`: the key is the citizen's ENTITY id, never its store index — after any
  // death those are different people. (That claim is DRIVEN, not scanned, by
  // tests/Perilune.Tests/WorkChannelTests.The_Order_Applies_By_Citizen_Id_Not_By_Store_Index; what is
  // pinned here is only the cross-language FILL ORDER, which no driven test can see.)
  assert.match(GAME_SESSION_CS, /new WireFormat\.WorkCell\(\(int\)c\.Id, t, p\)/,
    'GameSession.BuildWork no longer fills WorkCell from (c.Id, t, p) — the citizen ENTITY id, the '
    + 'work-type index and the stored priority byte.');
});

// The client's `1 = highest` reading is not a convention this file invented — it is the sim's, and it
// reads backwards against intuition, which is exactly why it is pinned across the seam rather than
// remembered. MUTATION: change `Highest = 1` / `Lowest = 4` in Citizen.cs ⇒ this fails and names the
// client docs that would then be lying.
test('the priority domain is the SIM\'s: 0 = off, 1..4 with 1 the HIGHEST', () => {
  assert.match(CITIZEN_CS, /public const byte Off = 0;/,
    'WorkPriority.Off is no longer 0. The `work` channel omits a row to mean OFF — "absent = off" is '
    + 'the sim\'s own semantics, not a wire compression — so the client\'s reading of a missing row '
    + 'depends on this constant.');
  assert.match(CITIZEN_CS, /public const byte Highest = 1;/,
    'WorkPriority.Highest is no longer 1. Every doc comment on this channel tells the reader that a '
    + 'SMALLER number is more urgent; if the sim flips, they are all wrong at once.');
  assert.match(CITIZEN_CS, /public const byte Lowest = 4;/, 'WorkPriority.Lowest is no longer 4');
  assert.match(CITIZEN_CS, /public const int WorkTypeCount = 6;/,
    'there are no longer six work types. The channel emits one row per switched-ON type and the host '
    + 'loop is bounded by this constant; a seventh type needs no client change, but a client that '
    + 'hard-codes six columns would silently hide it.');
});

// ⭐ M2-3 — THE COLUMN ORDER IS OD-J's, AND IT IS A CROSS-LANGUAGE FACT WITH NO COMPILER. The client
// carries the column table as a literal (`WORK_COLUMNS`, `overview-model.js`) because a column order
// is a display decision, and the sim carries the ranking it must agree with as
// `WorkPriority.NaturalPriority`. Those two are the SAME owner decision — OD-J, *Repair · Construct ·
// Craft · Deconstruct · Mine · Haul* — expressed twice, and nothing but this test relates them.
//
// The tab's own tests pin the client half by literal (`overview-model.test.js`); what only this seam
// can see is a DRIFT, i.e. the sim re-ranking arbitration while the tab keeps displaying the old
// order. The player would then read a grid whose left-to-right reading — the one RimWorld teaches,
// reference §1.3 — is simply false about what their crew will do first.
//
// MUTATION: swap two rows of `BuildNaturalPriorities` in Citizen.cs (e.g. give Haul 900 and Repair
// 100) ⇒ this fails and names both files. MUTATION 2: reorder `WORK_COLUMNS` ⇒ same.
test('the WORK tab\'s column order is the SIM\'s ranking — OD-J, on both sides of the seam', () => {
  const rows = [...CITIZEN_CS.matchAll(/table\[\(int\)WorkType\.(\w+)\]\s*=\s*(\d+);/g)]
    .map((m) => ({ name: m[1], natural: Number.parseInt(m[2], 10) }));
  assert.equal(rows.length, 6,
    'the natural-priority table in sim/Sim.Core/Entities/Citizen.cs no longer parses as six rows — '
    + 'this comparison has rotted and would pass vacuously');
  // NaturalPriority DESCENDING is what `WorkPriority.RankedOrder` derives and what a work tab's
  // columns are supposed to be derived from (the sim says so in RankedOrder's own summary).
  const simOrder = rows.slice().sort((a, b) => b.natural - a.natural).map((r) => r.name);
  assert.deepEqual(simOrder, ['Repair', 'Construct', 'Craft', 'Deconstruct', 'Mine', 'Haul'],
    'the sim\'s natural-priority ranking is no longer OD-J\'s order');
  // The client addresses each column by its WorkType INDEX, so the two orders are compared through
  // the enum values rather than through the display labels (which are the tab's own wording).
  const enumIndex = Object.fromEntries(
    [...CITIZEN_CS.matchAll(/^\s*(Repair|Construct|Craft|Deconstruct|Mine|Haul)\s*=\s*(\d+),/gm)]
      .map((m) => [m[1], Number.parseInt(m[2], 10)]));
  assert.deepEqual(WORK_COLUMNS.map((c) => c.type), simOrder.map((n) => enumIndex[n]),
    'the WORK tab\'s columns (client/src/ui/overview-model.js WORK_COLUMNS) are no longer in the '
    + 'sim\'s natural-priority order. RimWorld\'s players read a work grid left-to-right as "what '
    + 'gets done first" (reference §1.3: "left is first" is a correct PREDICTION only because the '
    + 'tab is displayed in naturalPriority order), so a drift here makes the grid lie about '
    + 'arbitration without changing a single number on screen.');
});

// ════════════════════════════════════════════════════════════════════════ the decoder

test('decodeWork reads the tuple positionally and preserves the host\'s order', () => {
  const rows = decodeWork(msg([[7, 0, 1], [7, 5, 4], [9, 2, 3]]));
  assert.deepEqual(rows, [
    { cid: 7, workType: 0, priority: 1 },
    { cid: 7, workType: 5, priority: 4 },
    { cid: 9, workType: 2, priority: 3 },
  ]);
  // ORDER IS THE HOST'S: it emits citizen-store order, then enum-value order, and a client sort would
  // be a second authority. (It is NOT a column order — that is ranked by the sim's NaturalPriority.)
  assert.deepEqual(rows.map((r) => [r.cid, r.workType]), [[7, 0], [7, 5], [9, 2]]);
});

test('an EMPTY payload is a valid answer and means "nothing is enabled"', () => {
  // ⚠️ THIS IS THE NORMAL BOOT STATE, not a broken channel: OD-H makes work opt-in, so every work
  // type is off for every crew member until the player says otherwise. A reader that treated `[]` as
  // "no data yet" and substituted something else would invent priorities nobody set.
  assert.deepEqual(decodeWork(msg([])), []);
  // …and it is distinguishable from "no message at all", which is `null`.
  assert.equal(decodeWork(null), null);
  assert.equal(decodeWork({ type: 'items', cells: [] }), null);
  assert.equal(decodeWork({ type: 'work' }), null);
});

test('a malformed row is dropped and never throws — the receive-path contract', () => {
  const rows = decodeWork(msg([[7, 0, 1], null, [1, 2], 'nope', [9, 1, 2, 'extra']]));
  assert.deepEqual(rows, [
    { cid: 7, workType: 0, priority: 1 },
    // A LONGER row is KEPT and its trailing element ignored — the append-only contract: a NEWER host
    // adding a fourth element must not make this client drop every work priority on the floor.
    { cid: 9, workType: 1, priority: 2 },
  ]);
});

test('a row whose workType this client does not know is KEPT, not dropped', () => {
  // Following `decodeItems` and NOT `decodeMarks`, and the reasoning is not transferable: on `marks`
  // the kind IS the payload, so an unknown one carries no fact. Here the pair (cid, priority) is
  // still true — "this crew member has SOMETHING switched on at priority 1" — and under OD-H, where
  // an enabled work type is the exception, hiding one shows a pawn as idler than they are.
  const rows = decodeWork(msg([[7, 99, 1]]));
  assert.deepEqual(rows, [{ cid: 7, workType: 99, priority: 1 }]);
});

test('decode() then decodeWork() — the real receive path, from a host-shaped line', () => {
  // The exact bytes WireFormat.Work emits (one line, no whitespace, InvariantCulture integers).
  const rows = decodeWork(decode('{"type":"work","cells":[[3,0,1],[3,5,4]]}'));
  assert.deepEqual(rows, [
    { cid: 3, workType: 0, priority: 1 },
    { cid: 3, workType: 5, priority: 4 },
  ]);
});

// ════════════════════════════════════════════════════════════════════ the channel is WIRED

// MUTATION: delete `case 'work':` from main.js ⇒ this fails here AND in
// tests/Perilune.Tests/SurfaceBoundaryTests.EveryWireChannelIsConsumedByTheStandardClient, which
// globs the emitters off disk.
test('main.js dispatches the `work` channel into the shared state layer', () => {
  assert.match(MAIN, /case 'work':\s*Hud\.renderWork\(m\);/,
    'client/src/main.js no longer dispatches the `work` channel. `onMessage` is the standard client\'s '
    + 'ONLY dispatch point, so a channel with no case there is host work the player can never see.');
  assert.match(HUD, /export function renderWork\(m\)/, 'hud.js no longer caches the work channel');
  assert.match(HUD, /export function getWork\(\)/,
    'hud.js no longer exposes getWork — the getter is what SHIP_STATE_REACH pins and what M2-3 reads');
});

// MUTATION: delete the `Hud.getWork()` call from overview-view.js ⇒ the reach census in
// surface-boundary.test.js fails (getWork is pinned there but no longer reached), and this fails too.
test('a non-console surface actually READS the cache — the getter is not orphaned', () => {
  assert.match(OVERVIEW, /Hud\.getWork\(\)/,
    'no standard surface reaches Hud.getWork(). A cache nothing can read is not a channel the player '
    + 'will ever benefit from — and `getWork` is on SHIP_STATE_REACH, which is computed from actual '
    + 'reaches, so this would also make that census wrong.');
  assert.match(OVERVIEW, /export function workPriorityFor\(cid, workType\)/,
    'the `work` reader seam is gone from overview-view.js. It shipped caller-less at M2-4 — the '
    + '`deviceConditionAt` shape — and ⭐ M2-3 gave it its first real callers: the WORK grid reads '
    + 'every cell through it and the click handler reads the cell\'s current value through it to '
    + 'compute the next step of the cycle.');
});

// ═════════════════════════════════════════════════════════════════ the scans' own controls

test('NEGATIVE CONTROL: the scans read code, not comments', () => {
  assert.ok(!codeOnly("// case 'work': Hud.renderWork(m);\nconst live = 1;").includes('renderWork'),
    'a line comment survived codeOnly — the dispatch scan above could then be satisfied by a TODO');
  assert.ok(!codeOnly('/* .Append(c.Priority.ToString(WorkIc)) */ const live = 1;')
    .includes('Priority'),
    'a block comment survived codeOnly — the tuple-order scan could then be satisfied by commented-out '
    + 'code, which is CLAUDE.md trap 1 in its exact shape');
});

test('POSITIVE CONTROL: the same text in real code DOES trip the scans', () => {
  assert.match(codeOnly("case 'work': Hud.renderWork(m); break;"), /case 'work':\s*Hud\.renderWork\(m\);/,
    'codeOnly mangled real code — every scan above is then vacuous');
});

test('the scanned sources are non-empty', () => {
  for (const [name, src] of Object.entries({ WIRE_WORK_CS, GAME_SESSION_CS, CITIZEN_CS, MAIN, HUD, OVERVIEW })) {
    assert.ok(src.length > 200, name + ' stripped to nothing — every scan over it is vacuous');
  }
});
