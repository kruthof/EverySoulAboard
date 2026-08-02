// ⭐ THE `workcaps` CHANNEL (M3-7) — the client half.
//
// WHAT THIS FILE OWNS, in order of how badly it bites:
//   1. THE TUPLE CONTRACT. `[cid, s0..s5, incapableMask]` is positional and THERE IS NO COMPILER
//      ACROSS THIS SEAM. Eight elements, six of which are the same TYPE of number in a row — the
//      worst possible shape for a positional decoder, because a one-off in either direction reads a
//      plausible value out of the wrong column and nothing anywhere throws. The order is PARSED out
//      of `hosts/web/WireFormat.WorkCaps.cs` and out of `GameSession.BuildWorkCaps`'s fill, then
//      compared against what `decodeWorkCaps` actually reads.
//   2. INCAPABLE IS NOT "OFF". The mask is a fact about the PERSON; a missing `work` row is an ORDER
//      from the player. On the sparse `work` channel the two are indistinguishable BY CONSTRUCTION,
//      which is why this channel exists at all — a decoder that collapsed them would throw away the
//      only fact it was built to carry.
//   3. THE DECODER'S TOLERANCE, and why its answer for a SHORT ROW is the opposite of `decodeWork`'s.
//   4. THAT THE CHANNEL IS WIRED: `main.js` dispatches it and `hud.js` caches it behind a getter.
//
// NOTHING HERE DRAWS ANYTHING — this file pins the DATA PATH, which is what M3-7 ships. The WORK tab
// that draws it (and that renders an incapable cell as ABSENT rather than struck through, per
// rimworld-reference.md:335) is M3-12.
//
// EVERY SOURCE SCAN READS CODE, NOT PROSE — `codeOnly` is IMPORTED from the shared
// `client/test/code-only.js` (CLAUDE.md trap 1: a guard matching raw source text is satisfied by the
// thing it guards against, COMMENTED OUT). Both directions are controlled at the bottom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeWorkCaps, isIncapableOf, WORKCAPS_SKILL_SLOTS } from '../src/wire/messages.js';
import { codeOnly } from './code-only.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
const read = (abs) => readFileSync(abs, 'utf8');

const WIRE_CAPS_CS = codeOnly(read(join(REPO, 'hosts/web/WireFormat.WorkCaps.cs')));
const WIRE_WORK_CS = read(join(REPO, 'hosts/web/WireFormat.Work.cs'));
const GAME_SESSION_CS = codeOnly(read(join(REPO, 'hosts/web/GameSession.cs')));
const CITIZEN_CS = codeOnly(read(join(REPO, 'sim/Sim.Core/Entities/Citizen.cs')));
const MAIN = codeOnly(read(join(CLIENT, 'src/main.js')));
const HUD = codeOnly(read(join(CLIENT, 'src/ui/hud.js')));

/** Build a host-shaped `workcaps` message from `[cid, s0..s5, mask]` tuples. */
const msg = (cells) => ({ type: 'workcaps', cells });
const row = (cid, skills, mask) => [cid, ...skills, mask];

// ═══════════════════════════════════════════════════ the cross-language tuple contract

// MUTATION: move `.Append(c.IncapableMask…)` before the skill loop in WireFormat.WorkCaps.cs ⇒ this
// fails and names the file. MUTATION 2: reorder the `WorkCapsCell` constructor parameters ⇒ the
// BuildWorkCaps leg below fails. MUTATION 3: re-shape the tuple as [x, y, deck, cid, …] "for
// consistency with the six tile-keyed channels" ⇒ the width leg fails, which is the point — this
// channel is keyed by CITIZEN and a coordinate would have to be invented.
test('the wire tuple is [cid, six skills, incapableMask] on BOTH sides of the seam', () => {
  // (a) the emitter appends cid FIRST, then the skill loop, then the mask LAST.
  const cidAt = WIRE_CAPS_CS.indexOf('c.Cid.ToString(WorkCapsIc)');
  const skillAt = WIRE_CAPS_CS.indexOf('c.SkillAt(s).ToString(WorkCapsIc)');
  const maskAt = WIRE_CAPS_CS.indexOf('c.IncapableMask.ToString(WorkCapsIc)');
  assert.ok(cidAt >= 0 && skillAt >= 0 && maskAt >= 0,
    'the emitter no longer appends cid / the skill loop / the mask by those names — the parse below '
    + 'is guessing, so this whole file is guarding nothing');
  assert.ok(cidAt < skillAt, 'the cid must be the FIRST element');
  assert.ok(skillAt < maskAt, 'the incapability mask must be the LAST element, after the six skills');

  // (b) the widths are one number on both sides, and on the sim side too.
  assert.equal(WORKCAPS_SKILL_SLOTS, 6, 'the client decoder expects six skill slots');
  assert.match(WIRE_CAPS_CS, /WorkCapsSkillSlots = 6/,
    'the host and the client disagree about how many skill columns a row has — a positional decoder '
    + 'with the wrong width reads the MASK as a skill and nothing throws');
  assert.match(CITIZEN_CS, /WorkTypeCount = 6/,
    'the sim has stopped having six work types. Widen the wire, the decoder AND this test together — '
    + 'never one of them alone.');

  // (c) the decoder reads the same positions.
  const decoded = decodeWorkCaps(msg([row(11, [1, 2, 3, 4, 5, 6], 33)]));
  assert.deepEqual(decoded, [{ cid: 11, skills: [1, 2, 3, 4, 5, 6], incapableMask: 33 }]);
});

// MUTATION: reorder the `c.GetSkill(WorkType.X)` arguments in GameSession.BuildWorkCaps ⇒ this fails.
// It is the leg that catches a column SWAP, which no width check can see and which produces entirely
// plausible numbers on the wire.
test('BuildWorkCaps fills the skills in WorkType VALUE order', () => {
  // ⚠️ ANCHOR ON THE DEFINITION, not on the name: `BuildWorkCaps()` first occurs as a CALL inside
  // `SendWorkCaps`, which sits earlier in the file — a window opened there scans the delta gate and
  // finds no GetSkill calls at all, which is a green-for-the-wrong-reason waiting to happen. Measured:
  // the first draft of this leg read `[]` and blamed the host.
  const at = GAME_SESSION_CS.indexOf('List<WireFormat.WorkCapsCell> BuildWorkCaps()');
  assert.ok(at >= 0, 'GameSession.BuildWorkCaps is gone — this leg is scanning nothing');
  const body = GAME_SESSION_CS.slice(at, at + 1400);
  const filled = [...body.matchAll(/c\.GetSkill\(WorkType\.(\w+)\)/g)].map((m) => m[1]);
  assert.deepEqual(filled, ['Repair', 'Construct', 'Craft', 'Deconstruct', 'Mine', 'Haul'],
    'the host fills the skill columns in a different order from the enum\'s declaration. The wire '
    + 'order IS WorkType value order — and note it is NOT a display order: a work tab\'s columns come '
    + 'from WorkPriority.RankedOrder and agree with this only by OD-J\'s coincidence.');

  assert.match(body, /c\.WorkIncapable\)/,
    'BuildWorkCaps no longer sends `Citizen.WorkIncapable` itself. ⛔ SINGLE AUTHORITY: the sim owns '
    + 'what a person cannot do. A host-side re-derivation (from CanTakeWorkType, or from '
    + '"priority == Off") reports the OPPOSITE bit for a work type that is incapable AND switched on, '
    + 'a state Citizen.cs deliberately leaves reachable.');
  assert.ok(!/CanTakeWorkType|IsIncapableOf/.test(body),
    'BuildWorkCaps consults a capability PREDICATE. It must copy the mask byte, not re-derive it.');
});

// ═══════════════════════════════════════════════════ incapable is not "off"

// MUTATION: make `isIncapableOf` return `false` unconditionally, or read the mask as a count instead
// of a bitmask ⇒ this fails on the set bits.
test('the mask is read BIT-WISE, one bit per work type', () => {
  // Repair (0) and Deconstruct (3) incapable ⇒ 0b001001 = 9.
  const [r] = decodeWorkCaps(msg([row(4, [0, 0, 0, 0, 0, 0], 9)]));
  assert.equal(isIncapableOf(r, 0), true, 'Repair (bit 0) must read as incapable');
  assert.equal(isIncapableOf(r, 3), true, 'Deconstruct (bit 3) must read as incapable');
  for (const capable of [1, 2, 4, 5]) {
    assert.equal(isIncapableOf(r, capable), false,
      `work type ${capable} is NOT in the mask and must read as capable — an "any bit set" reader `
      + 'would make one incapability disable the whole crew member');
  }
  assert.equal(isIncapableOf(null, 0), false, 'a missing row is not a claim of incapability');
});

// ⭐ THE LEG THE WHOLE CHANNEL EXISTS FOR. A crew member with NOTHING switched on still arrives here
// with her mask — and `work` cannot express that, because a sparse off-only channel emits no row for
// her at all and a row that does not exist cannot carry a column.
//
// MUTATION: in GameSession.BuildWorkCaps, skip a citizen with no enabled work type ⇒ the host-side
// twin of this leg (WorkCapsChannelTests) goes red; here the CONTRACT that `[]` means "no crew" is
// what stops a client from papering over it.
test('a crew member with no work enabled is still a ROW — absent means DEAD, never "off"', () => {
  const decoded = decodeWorkCaps(msg([row(7, [0, 0, 0, 0, 0, 0], 4)]));
  assert.equal(decoded.length, 1,
    'an all-zero crew member must survive decoding. Under OD-H every work type boots OFF, so this is '
    + 'the state of EVERY crew member on EVERY ship until the player gives an order — the default '
    + 'fixture, not an edge case.');
  assert.equal(decoded[0].incapableMask, 4, 'and her mask came with her');

  assert.deepEqual(decodeWorkCaps(msg([])), [],
    'an empty payload decodes to an empty list — it means "no living crew", never "no data yet". A '
    + 'surface that fell back to something else on [] would be inventing a crew.');

  // The `work` channel's own contract, quoted from its source, is what makes the above necessary.
  assert.match(WIRE_WORK_CS, /an off work type has no row/,
    'WireFormat.Work.cs no longer documents the sparse off-only contract that forced workcaps to be a '
    + 'SECOND MESSAGE. If that contract really changed, re-read the design before touching this file.');
});

// ═══════════════════════════════════════════════════ decoder tolerance

test('a malformed message is null and a malformed ROW is dropped — the receive path never throws', () => {
  assert.equal(decodeWorkCaps(null), null);
  assert.equal(decodeWorkCaps({ type: 'work', cells: [] }), null, 'the wrong type is not this channel');
  assert.equal(decodeWorkCaps({ type: 'workcaps' }), null, 'no cells array at all');
  assert.deepEqual(decodeWorkCaps(msg([null, 'nope', row(1, [0, 0, 0, 0, 0, 0], 0)])),
    [{ cid: 1, skills: [0, 0, 0, 0, 0, 0], incapableMask: 0 }],
    'a malformed row is dropped and the good ones survive it');
});

// ⭐ THE DELIBERATE ASYMMETRY WITH `decodeWork`, which KEEPS a row whose workType it does not know.
// MUTATION: zero-fill a short row instead of dropping it ⇒ this fails, and it should: both values
// worth inventing ("untrained", "capable of everything") are the REASSURING answer, so a client that
// invented them would hide exactly the fact the channel carries.
test('a SHORT row is DROPPED, not zero-filled — the opposite of decodeWork, on purpose', () => {
  const short = [3, 1, 2, 3, 4, 5, 6];   // seven elements: the mask is missing
  assert.deepEqual(decodeWorkCaps(msg([short])), [],
    'a seven-element row was accepted. `decodeWork` keeps an unknown workType because the surviving '
    + '(cid, priority) pair is still TRUE; here a missing element would have to be INVENTED, and the '
    + 'invention would read as "no incapabilities" — a confident wrong answer about the one fact this '
    + 'channel exists to carry.');
  assert.equal(decodeWorkCaps(msg([[...short, 0]])).length, 1,
    'CONTROL: the same row with its eighth element present IS accepted, so the leg above is about the '
    + 'width and not about the row being rejected for some other reason');
});

test('the shared `decode` front door parses a workcaps line off the wire', () => {
  const m = decode('{"type":"workcaps","cells":[[2,0,0,0,0,0,0,1]]}');
  assert.equal(m.type, 'workcaps');
  assert.deepEqual(decodeWorkCaps(m), [{ cid: 2, skills: [0, 0, 0, 0, 0, 0], incapableMask: 1 }]);
});

// ═══════════════════════════════════════════════════ the channel is WIRED

// MUTATION: delete `case 'workcaps':` from main.js ⇒ this fails here AND in
// tests/Perilune.Tests/SurfaceBoundaryTests.EveryWireChannelIsConsumedByTheStandardClient, which
// globs the emitters off disk.
test('main.js dispatches the `workcaps` channel into the shared state layer', () => {
  assert.match(MAIN, /case 'workcaps':\s*Hud\.renderWorkCaps\(m\);/,
    'client/src/main.js does not dispatch the `workcaps` channel. `onMessage` is the standard '
    + 'client\'s ONLY dispatch point, so a channel with no case there is host work the player can '
    + 'never see.');
  assert.match(HUD, /export function renderWorkCaps\(m\)/, 'hud.js no longer caches the channel');
  assert.match(HUD, /export function getWorkCaps\(\)/,
    'hud.js no longer exposes getWorkCaps — the getter is what M3-12 will read, and what would put '
    + 'this cache on SHIP_STATE_REACH once a surface reaches it');
});

// STATE-LAYER ONLY. M3-7 ships DATA; M3-12 draws it. A render function that reached the DOM here
// would land in the four pinned console-DOM counts and would put UI in a package chartered not to.
test('the dispatch is state-layer only — it draws nothing and touches no DOM', () => {
  const at = HUD.indexOf('export function renderWorkCaps');
  const body = HUD.slice(at, HUD.indexOf('\n', HUD.indexOf('}', at)));
  for (const forbidden of ['document', 'innerHTML', 'createElement', 'setChip']) {
    assert.ok(!body.includes(forbidden),
      `renderWorkCaps reaches ${forbidden}. It is a wire cache, exactly like renderWork and `
      + 'renderLedger: no DOM, no element, no innerHTML. The WORK tab that DRAWS skills is M3-12.');
  }
  assert.ok(body.includes('notifyShip'),
    'renderWorkCaps does not notify the SVG surfaces, so a surface reading the cache would never '
    + 'repaint when it changed');
});

// ═══════════════════════════════════════════════════ the comment-stripper controls

// CLAUDE.md trap 1, both directions. Without these, every source scan above could be satisfied by the
// thing it guards against, COMMENTED OUT — and the second control is what proves the stripper is not
// simply deleting everything.
test('CONTROL: the stripper hides a commented-out match and keeps a real one', () => {
  const stripped = codeOnly(
    "// case 'workcaps': Hud.renderWorkCaps(m); break;\n"
    + "/* case 'workcaps': Hud.renderWorkCaps(m); break; */\n"
    + "const real = \"case 'workcaps'\";\n"
    + '// a later real comment, so the fixture is not one unterminated block\n');
  assert.equal((stripped.match(/case 'workcaps'/g) || []).length, 1,
    'the shared codeOnly stripper either leaks commented-out code (so every scan above can be '
    + 'satisfied by a comment) or eats real code (so every scan above passes vacuously)');
  assert.ok(MAIN.length > 1000 && HUD.length > 1000 && WIRE_CAPS_CS.length > 1000,
    'CONTROL: a stripped source is implausibly short — the scans above are reading almost nothing');
});
