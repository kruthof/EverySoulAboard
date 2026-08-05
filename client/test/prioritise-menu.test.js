// ⭐ M2-10 — *PRIORITISE: REPAIR X* ON THE STANDARD SURFACE, driven end to end through the shipping
// Room Zoom controller.
//
// WHAT THE PLAYER COULD NOT DO BEFORE THIS FILE'S SUBJECT EXISTED: reach a machine with an order.
// Every verb on this surface was a PAINTED DESIGNATION (dig/stockpile/strip) or a TOOL-ARMED CLICK
// (build/place/operate/move); none of them says *"you, go fix that"*. RimWorld's answer is a
// right-click on the thing, and so is this one.
//
// ⚠️ THE HOST HALF IS A CONCURRENT LANE (M2-9) AND NOTHING HERE TOUCHES IT. The wire contract is
// FIXED by the integrator — `{cmd:'prioritise', cid, x, y, deck}` — and it is asserted BY RECORDING
// WHAT ARRIVES AT THE SEAM (`CLAUDE.md` trap 4: never a text scan for the identifier). Until M2-9
// merges the order goes nowhere; that is a sequencing fact, not a defect, and the milestone demo
// (packages.md:3029-3052) runs post-merge.
//
// ⚠️ THE PHASE OF THE `contextmenu` REGISTRATION IS PINNED BY NAME, and it is BUG-B's exact shape.
// `overview-model.test.js` measured what happened the last time a listener on this codebase moved to
// capture: it ran ahead of the handler below it, killed the whole gesture, and the suite stayed
// GREEN. A text scan cannot close that — the third argument has a boolean spelling, an options-object
// spelling (`{capture:true}`, which a naive truthiness recorder ALSO mis-files, see `dom-lite.js`'s
// own header), and both are defeated by a comment. So the phase is RECORDED AT REGISTRATION by the
// element stub and asserted as a value, with a negative control below proving the recorder itself
// normalises all three spellings correctly.
//
// EVERY LEG BELOW IS ITS OWN `test()`. `assert` throws, so a multi-leg test reports only its first
// failure and a dead later leg is indistinguishable from a live one (the fifth trap).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode, decodeDecks, decodeRooms } from '../src/wire/messages.js';
import { Cmd } from '../src/wire/session.js';
import {
  roomTileRect, U, DEVICE_KIND_NAMES, deviceKindName, itemForGlyph,
  ROOM_TOOLS, paletteCommand, roomScene, scenePlacement,
} from '../src/ui/room-model.js';
import { decksView } from '../src/ui/decks-model.js';
import { deviceDisplayName, prioritiseCrew, prioritiseOffer } from '../src/ui/prioritise-model.js';
import { ITEMS } from '../src/items/index.js';
import { GLYPH_SUBSTITUTE } from '../src/items/glyph-map.js';
import { codeOnly } from './code-only.js';
import { DocumentLite, Element } from './dom-lite.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
const DEVICE_CS = readFileSync(join(REPO, 'sim/Sim.Core/Entities/Device.cs'), 'utf8');

// ═══════════════════════════════════════════════ 0. THE NAME COMES FROM THE SIM'S ENUM, NOT THE ART

/** Every `Name = N,` member of the `DeviceKind` enum in the sim's own source, in declared order. */
function parseDeviceKinds(src) {
  const body = /enum DeviceKind : byte\s*\{([\s\S]*?)\n\s*\}/.exec(codeOnly(src));
  assert.ok(body, 'the DeviceKind enum could not be parsed out of sim/Sim.Core/Entities/Device.cs — '
    + 'this guard has rotted and every assertion below it is vacuous. FIX THE PARSE, do not delete '
    + 'the test: it is the only thing standing between the client\'s kind table and a silent renumber.');
  return [...body[1].matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*(\d+)\s*,/gm)].map((m) => [m[1], Number(m[2])]);
}

test('the DeviceKind parse is NON-VACUOUS — it finds the whole enum, not a fragment', () => {
  const members = parseDeviceKinds(DEVICE_CS);
  assert.ok(members.length >= 20,
    `parsed only ${members.length} DeviceKind members — the regex is matching a fragment`);
  assert.deepEqual(members[0], ['Door', 0]);
  // ⚠️ THE TAIL MEMBER, AND IT MUST BE THE ACTUAL TAIL. This read `CryoPod` until M3-10 appended
  // `Heater = 28`, at which point it would still have passed while measuring nothing about the new
  // last member — the exact shape of a guard that stops seeing the thing it was written to see.
  assert.ok(members.some(([n]) => n === 'Heater'), 'the parse must reach the appended tail');
  assert.deepEqual(members[members.length - 1], ['Heater', 28],
    'the LAST member parsed must be the last member declared — this is what makes the check above '
    + 'a statement about the tail rather than about some member that happens to exist');
});

// ⭐ THE ONE TABLE, PINNED BY DERIVATION. `DEVICE_KIND_NAMES` is a hand mirror of a C# enum, which is
// the defect that shipped `ROLE_TO_ITEM`; this reads the enum and requires agreement member for
// member, BY NAME AND BY INDEX.
// MUTATION: swap two entries, drop one, or append a member to Device.cs ⇒ this fails and names it.
test('DEVICE_KIND_NAMES equals the sim DeviceKind enum, in order, by name AND index', () => {
  const members = parseDeviceKinds(DEVICE_CS);
  assert.equal(DEVICE_KIND_NAMES.length, members.length,
    `the client's kind table has ${DEVICE_KIND_NAMES.length} members and Device.cs has `
    + `${members.length}. A device the sim knows about would be named MACHINE, or worse, named as `
    + 'its neighbour.');
  for (const [name, byte] of members) {
    assert.equal(DEVICE_KIND_NAMES[byte], name,
      `DeviceKind ${byte} is \`${name}\` in the sim and \`${DEVICE_KIND_NAMES[byte]}\` in the client`);
    assert.equal(deviceKindName(byte), name);
  }
});

// ⛔ THE `OPERABLE_KINDS` DERIVATION TEST IS DELETED WITH ITS SUBJECT (M3-15 / OD-N, 2026-07-31).
// `OPERABLE_KINDS`, `isOperableKind` and the OPERATE chip layer they served are gone from
// `room-model.js`; `DEVICE_KIND_NAMES` is now the client's ONLY mirror of `DeviceKind`, and the
// enum-by-index pin directly above is what holds it against `Device.cs`. ⚠️ Stated rather than
// silently dropped: the derivation this deleted test measured (`indexOf` answering -1 when a member
// falls out of the array) is still measured by that pin, on the array itself.

test('deviceDisplayName speaks the enum member as words, upper-cased', () => {
  assert.equal(deviceDisplayName(5), 'SOLAR WING');
  assert.equal(deviceDisplayName(6), 'BATTERY');
  assert.equal(deviceDisplayName(2), 'SCRUBBER');
  assert.equal(deviceDisplayName(15), 'SALVAGE RECYCLER');
  assert.equal(deviceDisplayName(26), 'ICE MELTER');
});

test('an absent or unknown kind byte answers MACHINE, never a confident guess', () => {
  assert.equal(deviceDisplayName(undefined), 'MACHINE');
  assert.equal(deviceDisplayName(null), 'MACHINE');
  assert.equal(deviceDisplayName(NaN), 'MACHINE');
  assert.equal(deviceDisplayName(250), 'MACHINE');
  // ⚠️ AND `0` MUST NOT BE SWALLOWED. `DeviceKind.Door` IS 0, so a truthiness guard anywhere on this
  // path would answer MACHINE for a real door — the near-miss the deleted `isOperableKind` recorded,
  // kept here because the hazard is the enum's zero member, not the function that once tripped on it.
  assert.equal(deviceDisplayName(0), 'DOOR');
});

// ⭐ THE SIXTH TRAP, ASKED AS "WHAT IS THIS THING **NOT**" — REBUILT AFTER REVIEW, because the version
// that stood here was the FOURTH trap shape: it drove RESOURCE and COSMETIC pieces, while FIVE of the
// six live substitutions are FUNCTIONAL→FUNCTIONAL — so the population it was written for was excluded
// by its own fixture and it passed while `WaterTank` read "OXYGEN TANK" in the shipping game. (The
// sixth borrow, `Light` → `wall-lamp`, IS cosmetic and was the one case the old filter could see. That
// is measured below, not assumed: the first draft of THIS guard asserted all six were functional and
// went red on `wall-lamp` — the ledger's shape is not the guard's population.)
//
// This version is derived from `GLYPH_SUBSTITUTE` itself, so it cannot go stale: for every borrowed
// row, the name the kind gives must differ from the name the ART would give.
// MUTATION: name from the picture (`ITEMS[itemForGlyph(code)].deviceKind`) ⇒ every row below fails.
const SUBSTITUTED = Object.freeze([
  // [glyph, DeviceKind byte the sim projects it from, the piece it BORROWS]
  ['O', 10, 'oxygen-tank'],      // WaterTank
  ['=', 16, 'space-heater'],     // Radiator
  ['Y', 15, 'water-recycler'],   // SalvageRecycler
  ['C', 21, 'locker'],           // MedCabinet
  ['*', 8, 'wall-lamp'],         // Light
  ['I', 26, 'cooker'],           // IceMelter
]);

test('the substitution fixture is REAL — every row is a live borrow in the shipped tables', () => {
  // NON-VACUITY, and it is an INCLUSION test: without it the rows below could be naming glyphs that
  // no longer substitute anything, and the guard would agree with everything.
  assert.ok(SUBSTITUTED.length >= 6, 'the borrowed-art ledger shrank below the measured six');
  for (const [glyph, byte, borrowed] of SUBSTITUTED) {
    assert.equal(GLYPH_SUBSTITUTE[glyph], borrowed,
      `glyph '${glyph}' no longer borrows '${borrowed}' — items/glyph-map.js's ledger moved`);
    assert.equal(itemForGlyph(glyph.charCodeAt(0)), borrowed,
      `the glyph→item join no longer resolves '${glyph}' to '${borrowed}'`);
    assert.ok(DEVICE_KIND_NAMES[byte], `DeviceKind ${byte} is not in the client's table`);
  }
  // ⭐ THE INCLUSION FLOOR THAT MATTERS, and it is narrower than the first draft's — CORRECTED by
  // running it. That draft asserted every borrowed piece is FUNCTIONAL and went red on `wall-lamp`,
  // which is COSMETIC. The correction is worth stating because it re-scopes the whole finding: `Light`
  // is the ONE kind the old `functional`-only guard could catch, so the old code named it the honest
  // "MACHINE". The other FIVE are functional-wearing-functional, sailed straight through, and are the
  // confidently-wrong names review measured. This floor pins that five-strong population by size, so
  // a fixture that quietly shrank back to the cosmetic case cannot pass.
  const fnFn = SUBSTITUTED.filter(([, , id]) => ITEMS[id].kind === 'functional');
  assert.ok(fnFn.length >= 5,
    `only ${fnFn.length} of the borrows are FUNCTIONAL→FUNCTIONAL. That is the population the first `
    + 'draft\'s resource/cosmetic fixture structurally excluded, and the one this guard exists for.');
  assert.equal(ITEMS['wall-lamp'].kind, 'cosmetic',
    'the one COSMETIC borrow moved. It is named here because it is the exception that makes the '
    + 'count above meaningful, not because anything depends on it.');
});

test('a device WEARING ANOTHER PIECE\'S ART is named for what it IS, not what it looks like', () => {
  for (const [glyph, byte, borrowed] of SUBSTITUTED) {
    const fromKind = deviceDisplayName(byte);
    const fromArt = String(ITEMS[borrowed].deviceKind || borrowed)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/-/g, ' ').toUpperCase();
    assert.equal(fromKind, DEVICE_KIND_NAMES[byte].replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase());
    assert.notEqual(fromKind, fromArt,
      `a ${DEVICE_KIND_NAMES[byte]} would be named "${fromArt}" if the row were derived from the `
      + `picture on its tile (glyph '${glyph}' borrows '${borrowed}'). The name must come from the `
      + '`devices` channel\'s own `kind` byte — the sim\'s identity for the machine.');
  }
});

test('prioritiseCrew: the SELECTION wins whenever there is one', () => {
  assert.deepEqual(prioritiseCrew(13, [{ cid: 7 }, { cid: 13 }]), { cid: 13, reason: '' });
  assert.deepEqual(prioritiseCrew(7, [{ cid: 7 }]), { cid: 7, reason: '' });
});

// ⭐ THE ONE-CREW INTERIM (integrator, 2026-07-30) — flagged for the owner in the report, not settled
// here. `--ship wreck` is a one-pawn ship and the opening beat is "order a repair, the lights come
// back"; a selection ritual in front of the game's first order is the movie-not-a-game shape.
test('prioritiseCrew: nothing selected + exactly ONE soul aboard ⇒ she is the one', () => {
  assert.deepEqual(prioritiseCrew(null, [{ cid: 9 }]), { cid: 9, reason: '' });
});

// MUTATION: answer `list[0].cid` when nothing is selected ⇒ this goes red. A silent wrong-pawn order
// is precisely the defect `zoom-pawn.test.js`'s RYN fixture exists to catch on the other path.
test('prioritiseCrew: nothing selected + SEVERAL aboard ⇒ NO cid, and a reason in words', () => {
  const r = prioritiseCrew(null, [{ cid: 7 }, { cid: 13 }]);
  assert.equal(r.cid, null, 'with several crew and no selection the client must not guess a pawn');
  assert.match(r.reason, /NO CREW SELECTED/);
});

test('prioritiseCrew: a row with no usable cid is not counted toward "exactly one"', () => {
  // `undefined | 0` is 0, and cid 0 is the host's own NOBODY sentinel — a malformed row counted as
  // the single soul aboard would send an order addressed to nobody and look accepted.
  assert.equal(prioritiseCrew(null, [{ name: 'ghost' }]).cid, null);
  assert.deepEqual(prioritiseCrew(null, [{ name: 'ghost' }, { cid: 4 }]), { cid: 4, reason: '' });
  assert.equal(prioritiseCrew(null, []).cid, null);
  assert.equal(prioritiseCrew(null, null).cid, null);
});

test('prioritiseOffer: a tile with NO devices row is refused, and refused SILENTLY', () => {
  const r = prioritiseOffer({ dev: null, selCid: 7, crew: [{ cid: 7 }] });
  assert.equal(r.ok, false);
  assert.equal(r.silent, true, 'a stray right-click on bare floor is not an intent aimed at '
    + 'anything; a toast on every one of them trains the player to ignore the toast that matters');
});

test('prioritiseOffer: a REAL target with nobody to order is refused OUT LOUD', () => {
  const r = prioritiseOffer({ dev: { kind: 5, cond: 40 }, selCid: null,
    crew: [{ cid: 7 }, { cid: 13 }] });
  assert.equal(r.ok, false);
  assert.equal(r.silent, false, 'this is the `doMove` shape: the host\'s own refusal for a missing '
    + 'selection lands in `_status`, which this surface renders nowhere, so a silent refusal here is '
    + 'indistinguishable from a broken verb');
  assert.match(r.reason, /NO CREW SELECTED/);
});

// ⭐⭐ M3-13 / D1 — THE PRECEDENCE BETWEEN THE TWO SPEAKING REFUSALS, PINNED. `prioritiseOffer` asks
// "is there anything to order here?" BEFORE "who would I give it to?", and until this test that
// ordering was a stated design decision with NOTHING holding it.
//
// ⛔ IT WAS UNOBSERVABLE IN EVERY OTHER M3-13 LEG, WHICH IS EXACTLY WHY IT NEEDED ITS OWN.
// The driven rig and the capsule legs all run a ONE-CREW ship (`--ship wreck` today), and with one
// crew member `prioritiseCrew` always resolves — so the two questions never compete and either
// order gives the same answer. The competition needs TWO crew AND no selection, which is the state
// the POD BAY creates the moment it thaws a second sleeper. This test is that state.
//
// THE DIFFERENCE IT PROTECTS, in words: on a capsule, "NO CREW SELECTED — CLICK A PAWN" is a
// sentence about a problem the player can SOLVE, offered for an order that can NEVER be given. It
// sends them to select a pawn, right-click again, and get the same box. "Nobody to order" is the
// wrong answer about a machine that has nothing to order.
//
// MUTATION (the reviewer's, re-applied and re-run): move the `if (o.dev.serv === 0)` block BELOW
// the `prioritiseCrew` resolution in `prioritise-model.js` ⇒ RED here, and green everywhere else in
// the suite — which is the point.
// ⭐⭐ M3-13 / D2 — `=== 0`, NOT FALSY, ASSERTED AT THE MODEL BOUNDARY.
// `undefined` is what a row from a host older than the eighth element yields, and it MUST mean
// "offer the menu as before" — never "this machine is never serviced". The difference is a total,
// silent loss of M2-10's verb on every machine aboard.
//
// ⛔ IT HAS TO BE ASSERTED HERE AND NOT IN THE DRIVEN RIG. `decodeDevices` and
// `roomDeviceConditions` both normalise an absent `serv` to 1, so no row that has been through
// either can carry `undefined` — the driven control is true by normalisation and cannot see this
// at all. This is the model's own boundary, which is the only place the two spellings differ.
// MUTATION: weaken the gate to `if (!o.dev.serv)` ⇒ RED on the first leg here.
test('M3-13: an ABSENT serv is not the same as serv 0 — the append-only contract, at the model', () => {
  const older = prioritiseOffer({ dev: { kind: 5, cond: 40 }, selCid: 7, crew: [{ cid: 7 }] });
  assert.equal(older.ok, true,
    'A ROW WITH NO EIGHTH ELEMENT WAS TREATED AS NEVER-SERVICEABLE. That is what an older host '
    + 'emits, and what a dropped field looks like: the Prioritise verb would vanish from every '
    + 'machine on the ship, silently, with no message and nothing to click.');
  assert.equal(older.label, 'PRIORITISE: REPAIR SOLAR WING');

  // …and the explicit 0 still refuses, so the leg above is not satisfied by a gate that is simply off.
  const declared = prioritiseOffer({ dev: { kind: 27, cond: 255, serv: 0 }, selCid: 7, crew: [{ cid: 7 }] });
  assert.equal(declared.ok, false, 'CONTROL: an explicit serv = 0 must still refuse');
  assert.match(declared.reason, /NEVER SERVICED/);
});

test('M3-13: on a capsule the NEVER-SERVICED refusal outranks the no-crew-selected one', () => {
  const r = prioritiseOffer({
    dev: { kind: 27, cond: 255, serv: 0 },        // a CryoPod, never serviceable
    selCid: null,                                  // …and nothing selected…
    crew: [{ cid: 7 }, { cid: 13 }],               // …on a TWO-crew ship, so the crew question BINDS
  });
  assert.equal(r.ok, false);
  assert.equal(r.silent, false, 'a capsule is a target the player aimed at — it must speak');
  assert.match(r.reason, /NEVER SERVICED/,
    'THE PLAYER WAS SENT TO SOLVE THE WRONG PROBLEM. On a machine that can never be repaired the '
    + 'menu answered "no crew selected", which reads as "pick a pawn and try again" — for an order '
    + 'that will never exist. The serviceability question must be asked FIRST.');
  assert.ok(!/NO CREW SELECTED/.test(r.reason),
    'and the crew sentence must not be appended beside it: a refusal that names two problems ranks '
    + 'neither');

  // ⛔ THE NON-VACUITY CONTROL: on the SAME two-crew, no-selection state, a SERVICEABLE machine
  // really does produce the crew sentence. Without this the leg above is also satisfied by a model
  // that has forgotten how to say "NO CREW SELECTED" at all.
  const control = prioritiseOffer({
    dev: { kind: 5, cond: 40, serv: 1 }, selCid: null, crew: [{ cid: 7 }, { cid: 13 }],
  });
  assert.equal(control.ok, false);
  assert.match(control.reason, /NO CREW SELECTED/,
    'CONTROL: the crew question must still bind on a serviceable machine, or the assertion above is '
    + 'about a model that never asks it');
});

test('prioritiseOffer: an accepted offer carries the cid and the labelled row', () => {
  const r = prioritiseOffer({ dev: { kind: 6, cond: 40 }, selCid: null, crew: [{ cid: 9 }] });
  assert.equal(r.ok, true);
  assert.equal(r.cid, 9);
  assert.equal(r.label, 'PRIORITISE: REPAIR BATTERY');
});

// ═════════════════════════════════════════════════════════════════ 1. THE WIRE CONTRACT

// The integrator's FIXED contract for the concurrent M2-9 lane. Asserted as a whole-object equality
// so an EXTRA key is a failure too: the host's `WebCommand.Parse` reads named ints, and a stray field
// is a payload two lanes would then have to agree about after the fact.
test('Cmd.prioritise carries cmd + cid + x + y + deck, and nothing else', () => {
  assert.deepEqual(Cmd.prioritise(7, 34, 6, 0), { cmd: 'prioritise', cid: 7, x: 34, y: 6, deck: 0 });
  assert.deepEqual(Cmd.prioritise(13, 2, 3, 1), { cmd: 'prioritise', cid: 13, x: 2, y: 3, deck: 1 });
});

test('Cmd.prioritise keeps every field integral — the host reads JSON ints', () => {
  assert.deepEqual(Cmd.prioritise(7.9, 34.2, 6.7, 0.5),
    { cmd: 'prioritise', cid: 7, x: 34, y: 6, deck: 0 });
});

// ═════════════════════════════════════════════════════════════════ 2. THE DRIVEN RIG
//
// dom-lite plus the four extras `roomzoom-view.js` needs (innerHTML, querySelector(All), closest,
// getBoundingClientRect) — AND an `addEventListener` that RECORDS THE PHASE ARGUMENT. Rebuilt here
// rather than imported from a sibling test module: two lanes editing one test module is the merge
// shape that has already broken this repo once.

/** Selector matching over exactly the forms this surface's handlers use. */
function matchesSel(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  const attr = /^\[([-\w]+)\]$/.exec(sel);
  if (attr) return el.getAttribute(attr[1]) !== null;
  return false;
}

/** ⚠️ THE PHASE NORMALISER, WRITTEN ONCE. Not `!!opts`: `{capture:false}` is an OBJECT, therefore
 *  TRUTHY, and a bare truthiness test files a BUBBLE registration as CAPTURE — the live hole
 *  `dom-lite.js`'s header records having found. The recorder can be wrong in both directions, so it
 *  gets its own negative control below. */
const isCapture = (opts) => opts === true || !!(opts && opts.capture === true);

class RzEl extends Element {
  constructor(doc, tag) {
    super(doc, tag);
    this.id = '';
    this._html = '';
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
    /** type → [{fn, capture}] in registration order. The ONLY record of the third argument. */
    this.phases = {};
  }
  addEventListener(t, fn, opts) {
    (this.phases[t] = this.phases[t] || []).push({ fn, capture: isCapture(opts) });
    super.addEventListener(t, fn);
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return this._rect; }
  // The two `hud.js` reaches for while reconciling the CONSOLE's crew-watch rows off the same
  // `renderRoster` this rig drives (`reconcileRows`). Same pair `zoom-pawn.test.js` carries.
  get firstElementChild() { return null; }
  insertBefore(el) { return this.appendChild(el); }
  closest(sel) {
    let n = this;
    while (n && n.nodeType === 1) {
      if (matchesSel(n, sel)) return n;
      n = n.parentNode;
    }
    return null;
  }
}
class RzDoc extends DocumentLite {
  constructor() { super(); this.body = new RzEl(this, 'body'); }
  createElement(tag) { return new RzEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

// MUTATION (on the RECORDER, not on the subject): weaken `isCapture` to `!!opts` ⇒ the third leg
// fails. Without this control the phase assertion rests on a stub nobody has checked, which is
// exactly how the same defect hid in `dom-lite.js` until it was measured.
test('the phase recorder itself normalises all three spellings of the third argument', () => {
  const probe = new RzEl(new RzDoc(), 'div');
  const noop = () => {};
  probe.addEventListener('contextmenu', noop);
  probe.addEventListener('contextmenu', noop, true);
  probe.addEventListener('contextmenu', noop, { capture: true });
  probe.addEventListener('contextmenu', noop, { capture: false });
  assert.deepEqual(probe.phases.contextmenu.map((r) => r.capture), [false, true, true, false],
    'the recorder mis-files a spelling. `{capture:false}` is a truthy OBJECT, so a bare `!!opts` '
    + 'test reports a BUBBLE registration as CAPTURE — and then the guard below is asserting a fact '
    + 'about the stub instead of a fact about the surface.');
});

const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-minimap',
  'rz-crewdock', 'rz-ctx',
  // console ids `hud.js`'s frame/roster dispatch writes through — the same set the sibling rigs
  // register, for the same reason: `renderFrame`/`renderRoster` are the real receive path.
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
];
const doc = new RzDoc();
for (const id of RZ_IDS) { const e = new RzEl(doc, 'div'); e.id = id; doc.register(id, e); }
globalThis.document = doc;
// The Room Zoom binds `keydown` on window in CAPTURE (its own stack pre-empts the console's while a
// room is open). Recorded WITH phase — the same normaliser the element stub uses — so the ESC leg can
// dispatch through the real listener instead of calling a private function.
const winKeys = { capture: [], bubble: [] };
globalThis.window = {
  addEventListener(t, fn, opts) { if (t === 'keydown') (isCapture(opts) ? winKeys.capture : winKeys.bubble).push(fn); },
  removeEventListener() {},
};

// Resolved AFTER the globals — both modules touch `document` at import time.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const DECKS_JSON =
  '{"type":"decks","decks":[{"deck":0,"slots":[[0,4,6,12,8,"quarters",5,true,true]]}]}';
const ROOMS_JSON = '{"type":"rooms","rooms":[["quarters",1,0.209,512,101.3,293,96]]}';
const RECT = roomTileRect(decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON))),
                          'quarters');

// ⭐ THE TWO-MACHINE FIXTURE (charter mutation 2). WING and CELL are DIFFERENT tiles carrying
// DIFFERENT pieces, so "send the machine at the wrong tile" — the first device, the focus origin, the
// room's corner — cannot survive both driven legs.
const WING = [RECT.rx + 1, RECT.ry + 1];   // SolarWing, worn, ON the devices channel
const CELL = [RECT.rx + 5, RECT.ry + 3];   // Battery, worn, ON the devices channel — the SECOND one
const BARE = [RECT.rx + 3, RECT.ry + 1];   // bare floor: no glyph, no row  (charter mutation 4)
// ⭐ THE FOG TILE (charter mutation 5). A machine the FRAME draws with no `devices` row behind it.
// It is a real shape, not a contrivance: `SendDevices` is dirty-version gated, so a frame can arrive
// ahead of the channel, and `BuildDevices` is fog-gated on `TileFlags.Explored` besides. The host
// resolves a prioritise order through the same population, so a menu here is a button that looks
// live and cannot work.
const FOG = [RECT.rx + 7, RECT.ry + 1];
// ⭐ THE SUBSTITUTION TILE (send-back). A `WaterTank` (DeviceKind 10) standing on a tile whose glyph
// the projection draws as `oxygen-tank` — a LIVE `GLYPH_SUBSTITUTE` borrow, and FUNCTIONAL→FUNCTIONAL,
// which is the population the first draft's resource/cosmetic fixture structurally excluded. Named
// from the picture it reads "OXYGEN TANK"; named from the channel it reads "WATER TANK".
const TANK = [RECT.rx + 9, RECT.ry + 5];
// ⭐⭐ M3-13 — THE NEVER-SERVICEABLE TILE. A `CryoPod` (DeviceKind 27) on the `devices` channel with
// `serv = 0`, which is what the host emits for every kind whose `maint` is 0.00 in the defs. It is
// the OPEN DEFECT this package closes, carried in HANDOVER since M2-10: the menu offered
// `PRIORITISE: REPAIR` here, the click fired a toast, `PrioritiseJobCommand` returned at
// `device.Condition >= MaintainBelow`, and NOTHING reached any surface. M3 makes the cryo bay the
// main screen, so this stopped being a filed nuisance the day the ship's first hour ran through it.
const POD = [RECT.rx + 9, RECT.ry + 3];

const ADA = { cid: 7, name: 'Ada Vale', role: 'engineer', deck: 0, x: RECT.rx + 2, y: RECT.ry + 4 };
const RYN = { cid: 13, name: 'Ryn Coe', role: 'hauler', deck: 0, x: RECT.rx + 6, y: RECT.ry + 5 };

/** The frame the host would send: floor, three machine glyphs, the given crew, and `sel` on one. */
function frameMsg(crew, selCid) {
  const w = 24, h = 20;
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];
  const put = (t, code) => { cells[t[1] * w + t[0]] = [code, 0, 0, 0]; };
  put(WING, 'G'.charCodeAt(0));   // → 'solar-panel'
  put(CELL, 'B'.charCodeAt(0));   // → 'battery-bank'
  put(FOG, 'S'.charCodeAt(0));    // → 'o2-scrubber', drawn but NOT on the devices channel
  put(TANK, 'O'.charCodeAt(0));   // → 'oxygen-tank' ART over a WaterTank ROW (the borrow)
  put(POD, 'K'.charCodeAt(0));    // → 'cryo-capsule-occupied' (M3-13)
  const who = crew.find((c) => c.cid === selCid) || null;
  return {
    type: 'frame', deck: RECT.deck, w, h, lens: 'none', cells,
    crew: crew.map((c) => [c.x, c.y, 0, c.cid]),
    sel: who ? [who.x, who.y] : [-1, -1],
  };
}

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

const sent = [];
let primed = false;
/** Mount once, then re-drive into a known state per test. Returns nothing; every test re-primes. */
function prime(crew, selCid) {
  if (!primed) {
    primed = true;
    RoomZoom.initRoomZoom({ send: (o) => sent.push(o) });
    const root = doc.getElementById('roomzoom-view');
    // The parent chain the delegated `onHudClick` walks, and the geometry `tileFromCanvasXY` needs.
    for (const id of ['rz-canvas', 'rz-palette', 'rz-toast', 'rz-ctx']) {
      doc.getElementById(id).parentNode = root;
    }
    doc.getElementById('rz-layers').parentNode = doc.getElementById('rz-canvas');
    doc.getElementById('rz-layers')._rect = sceneRectFor(RECT);
    Hud.renderDecks(decode(DECKS_JSON));
    Hud.renderRooms(decode(ROOMS_JSON));
    // The `devices` channel — WING and CELL only. FOG and BARE are deliberately absent.
    Hud.renderDevices(decode(JSON.stringify({
      type: 'devices',
      cells: [
        [WING[0], WING[1], RECT.deck, 5, 40, 0, 0],   // SolarWing (DeviceKind 5), worn, inoperative
        [CELL[0], CELL[1], RECT.deck, 6, 90, 1, 0],   // Battery   (DeviceKind 6), worn, operational
        [TANK[0], TANK[1], RECT.deck, 10, 60, 1, 0],  // WaterTank (DeviceKind 10) wearing OXYGEN TANK art
        // ⭐ M3-13: a CryoPod, sealed and healthy, and the ONLY row here carrying the eighth element.
        // ⚠️ THE OTHER FOUR ROWS ARE DELIBERATELY LEFT SEVEN-ELEMENT — they are the append-only
        // control, and they are what makes every "the menu still opens" leg in this file a live
        // assertion that an ABSENT `serv` means "offer as before" rather than "withdraw the verb".
        [POD[0], POD[1], RECT.deck, 27, 255, 1, 0, 0],
      ],
    })));
  }
  Hud.renderFrame(frameMsg(crew, selCid));
  Hud.renderRoster({ type: 'roster', crew });
  sent.length = 0;
  RoomZoom.exitRoom();
  RoomZoom.enterRoom('quarters');   // synchronous repaint (this rig has no rAF)
}

/** Fire an event through the element's parent chain with one shared event object. */
function fire(target, type, extra) {
  const e = {
    type, target, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; },
    stopPropagation() { e.propagationStopped = true; },
    button: 0, detail: 1, ...(extra || {}),
  };
  let n = target;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) {
      fn(e);
      if (e.propagationStopped) return e;
    }
    n = n.parentNode;
  }
  return e;
}

const canvas = () => doc.getElementById('rz-canvas');
const menu = () => doc.getElementById('rz-ctx');
const toastText = () => doc.getElementById('rz-toast').textContent;
const atTile = (t) => scenePointFor(RECT, t[0], t[1]);
/** The player's gesture: right-click the canvas over an absolute sim tile. */
const rightClick = (t) => fire(canvas(), 'contextmenu', atTile(t));
/** The menu's ONE row — found through the real DOM the controller built, never fabricated. */
const menuRow = () => menu().childNodes.find((c) => c.getAttribute
  && c.getAttribute('data-rzctx') === 'prioritise');
/** Click that row the way a player does — through the surface root's delegated handler. */
const clickRow = () => fire(menuRow(), 'click', {});
/** Everything that reached the wire except the hover cursor chatter. */
const orders = () => sent.filter((o) => o.cmd !== 'cursor');
/** Dispatch a keydown through the surface's real window listener, capture then bubble. */
function key(k) {
  const e = { key: k, target: null, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; } };
  for (const fn of winKeys.capture.slice()) { fn(e); if (e.propagationStopped) return e; }
  for (const fn of winKeys.bubble.slice()) fn(e);
  return e;
}
/** Arm a palette tool the way a player does — a click on a `data-rztool` node through the root's own
 *  delegated handler (the rig models `innerHTML` as a string, so the REAL palette buttons are not
 *  reachable as nodes; this is `operate-model.test.js`'s idiom). */
const toolBtns = new Map();
function arm(tool) {
  let b = toolBtns.get(tool);
  if (!b) {
    b = new RzEl(doc, 'button');
    b.setAttribute('data-rztool', tool);
    doc.getElementById('roomzoom-view').appendChild(b);
    toolBtns.set(tool, b);
  }
  fire(b, 'click', {});
}
/** Is a tool still armed? Observed through BEHAVIOUR, not through module state: with LAMP armed a
 *  left click sends `Cmd.place`, and with nothing armed a click on the same tile sends nothing (it
 *  falls through to the pawn-select branch, which finds no crew there).
 *
 *  ⭐ RE-POINTED FROM `operate` TO `lamp` BY M3-15 (OD-N), which deleted the OPERATE verb. The probe
 *  needs a tool whose SINGLE CLICK emits a command — a swept tool (dig/stockpile/strip/wall) commits
 *  on the press-drag-release gesture and sends nothing on a bare click, and MOVE needs a host-side
 *  selection this rig does not prime. `lamp` is `cls: 'functional'`, which is exactly one click and
 *  one `Cmd.place`. ⚠️ Re-pointed and not deleted: the ESC-stack rung it measures (the menu closes
 *  FIRST, the armed tool survives) has no other instrument. */
function armedNow() {
  sent.length = 0;
  fire(canvas(), 'click', atTile(WING));
  const yes = orders().some((o) => o.cmd === 'place');
  sent.length = 0;
  return yes;
}

// ═══════════════════════════════════════════ ⛔⭐ THE PLACE PAYLOAD, PINNED AT THE SEAM (M3-10)
//
// WHY THIS EXISTS, and it is not hypothetical. `roomzoom-view.js` sent `Cmd.place(pc.deviceKind, …)`
// — the SIM ENUM MEMBER (`Bed`, `Heater`) — where `GameSession.TryFurnitureKind` switches on the
// WIRE TOOL STRING (`bunk`, `heater`). `TryFurnitureKind` fell to `default`, `HandlePlace` returned,
// and because a refused placement is a SILENT no-op by design, EVERY furniture placement on the
// standard surface did nothing and said nothing. MEASURED in the running game with the shipped
// `bunk` tool: two clicks on clear floor of the wreck's reactor bay, device census byte-identical.
//
// ⚠️ THE OLD COVERAGE WAS `o.cmd === 'place'` AND NOTHING ELSE — the verb was present, wired, tested
// and INERT. CLAUDE.md trap 4 says pin HOW an api was called by recording the ARGUMENT at the seam;
// `armedNow()` above is the surviving example of the weaker form, kept because its job is only "did
// anything go out at all".
//
// ⚠️ IT IS A DERIVATION, NOT A TRANSCRIPTION. The accepted vocabulary is parsed out of
// `GameSession.TryFurnitureKind`'s own switch, so a host that renames a tool string reddens this
// instead of silently disabling a palette button. Comment-stripped with the shared `codeOnly`
// (trap 1) and carrying its own non-vacuity floor.
const GAMESESSION_CS = readFileSync(join(REPO, 'hosts/web/GameSession.cs'), 'utf8');

/** The `case "<tool>": kind = DeviceKind.X;` labels of `TryFurnitureKind`, as {tool: EnumMember}. */
function parseFurnitureKinds(src) {
  const code = codeOnly(src);
  // ⚠️ THE DEFINITION, NOT THE CALL SITE. `indexOf('TryFurnitureKind')` finds `HandlePlace`'s call
  // first and the switch is 300 lines further down; the first draft of this parse did exactly that
  // and answered ZERO tools — which the non-vacuity floor below caught, doing its job.
  const i = code.indexOf('bool TryFurnitureKind');
  assert.ok(i > 0, 'TryFurnitureKind is gone from hosts/web/GameSession.cs — this guard has rotted');
  const body = code.slice(i, i + 2000);
  const out = {};
  for (const m of body.matchAll(/case\s+"([a-z]+)"\s*:\s*kind\s*=\s*DeviceKind\.(\w+)\s*;/g)) out[m[1]] = m[2];
  return out;
}

test('the TryFurnitureKind parse is NON-VACUOUS — it finds the whole switch', () => {
  const k = parseFurnitureKinds(GAMESESSION_CS);
  assert.ok(Object.keys(k).length >= 9,
    `parsed only ${Object.keys(k).length} furniture tool strings — the regex is matching a fragment`);
  assert.equal(k.bunk, 'Bed', 'the oldest row must still parse');
  assert.equal(k.heater, 'Heater', 'and the newest (M3-10) must too');
  // The three that were host-side-only until 2026-08-04, named explicitly because the palette rows
  // added that day mirror these exact strings and a silent rename here is what would un-wire them.
  assert.equal(k.growbed, 'GrowBed');
  assert.equal(k.medbed, 'MedBed');
  assert.equal(k.table, 'Table');
});

test('every FUNCTIONAL palette row sends a `kind` the host actually switches on', () => {
  const accepted = parseFurnitureKinds(GAMESESSION_CS);
  const functional = ROOM_TOOLS.map((t) => [t, paletteCommand(t)]).filter(([, pc]) => pc.cls === 'functional');
  assert.ok(functional.length >= 7, `only ${functional.length} functional palette rows — fixture shrank`);
  for (const [tool, pc] of functional) {
    assert.ok(Object.prototype.hasOwnProperty.call(accepted, pc.kind),
      `the ${tool.toUpperCase()} tool sends kind="${pc.kind}", which GameSession.TryFurnitureKind does `
      + `NOT accept (it takes ${JSON.stringify(Object.keys(accepted))}). HandlePlace would return and `
      + 'the click would do nothing, silently — the exact defect M3-10 measured in the running game.');
    assert.equal(accepted[pc.kind], pc.deviceKind,
      `the ${tool.toUpperCase()} tool's wire string "${pc.kind}" maps host-side to DeviceKind.`
      + `${accepted[pc.kind]}, but the palette row calls it "${pc.deviceKind}". The two vocabularies `
      + 'have drifted; a click would place the WRONG device.');
  }
});

// MUTATION: send `pc.deviceKind` instead of `pc.kind` in `roomzoom-view.js`'s functional branch ⇒
// this fails and names the tool. That is the shipped bug, reproduced.
test('a click with a FUNCTIONAL tool armed sends the palette tool string, not the enum name', () => {
  prime([ADA], null);
  const accepted = parseFurnitureKinds(GAMESESSION_CS);
  // ⭐ GROWBED / MEDBED / TABLE joined the list on 2026-08-04 — the three kinds `TryFurnitureKind`
  // has accepted since before HEATER existed and no palette button could ask for. They are driven
  // HERE, through the shipped controller, rather than only asserted in the table sweep above,
  // because "the row exists" and "a click on the canvas emits it" are different facts and this
  // package's whole subject is the second one.
  for (const tool of ['lamp', 'bunk', 'heater', 'growbed', 'medbed', 'table']) {
    arm(tool);
    sent.length = 0;
    fire(canvas(), 'click', atTile(WING));
    const place = orders().find((o) => o.cmd === 'place');
    assert.ok(place, `${tool.toUpperCase()} armed: no place command went out at all`);
    assert.equal(place.kind, paletteCommand(tool).kind,
      `${tool.toUpperCase()} sent kind="${place.kind}"`);
    assert.ok(Object.prototype.hasOwnProperty.call(accepted, place.kind),
      `${tool.toUpperCase()} sent kind="${place.kind}", which the host does not accept — the click `
      + 'is a silent no-op in the shipping game');
    arm(tool); // disarm
  }
});

test('the rig really drives the surface (non-vacuity floor for every leg below)', () => {
  prime([ADA], null);
  assert.ok(RECT && RECT.deck === 0, 'the room fixture did not resolve');
  assert.ok(doc.getElementById('rz-layers').innerHTML.length > 0,
    'the Room Zoom drew nothing — enter() did not repaint, so no driven leg is measuring anything');
  assert.ok(RoomZoom.deviceConditionAt(WING[0], WING[1]),
    'the devices channel did not reach the surface — every driven leg below is vacuous');
  assert.ok(RoomZoom.deviceConditionAt(CELL[0], CELL[1]), 'the SECOND machine is not on the channel');
  assert.equal(RoomZoom.deviceConditionAt(FOG[0], FOG[1]), null,
    'the FOG tile has a devices row, so the fog leg is testing nothing');
  assert.ok(menuRow(), 'the menu row was never built — the click leg cannot be driven');
  // ⭐ M3-13 — the capsule really is on the channel and really does carry `serv = 0`. Without this
  // the never-serviceable legs below would pass against a tile the surface simply cannot see, which
  // is the same false green the FOG leg above is guarded from.
  const pod = RoomZoom.deviceConditionAt(POD[0], POD[1]);
  assert.ok(pod, 'the CryoPod is not on the channel — the never-serviceable legs are vacuous');
  assert.equal(pod.serv, 0, 'the capsule row reached the surface with serv != 0 — nothing is tested');
  assert.equal(RoomZoom.deviceConditionAt(WING[0], WING[1]).serv, 1,
    'the CONTROL machine must read serviceable, or "the menu opens" proves nothing about `serv`');
});

// ═════════════════════════════════════════════════════════════════ 3. THE FIVE CHARTER MUTATIONS

// ⭐ MUTATION 1 — "right-click sends no command". RECORDED AT THE SEAM: the exact JSON that reached
// the injected `send`, not a source scan for `Cmd.prioritise`.
// APPLY: delete the `_send(Cmd.prioritise(...))` line in `doPrioritise` ⇒ this reddens on an empty
// `orders()`; replace it with a `toast(...)` ⇒ same.
test('right-click a machine ▸ click the row ▸ ONE prioritise order, in the fixed wire shape', () => {
  prime([ADA], null);
  rightClick(WING);
  assert.equal(menu().hidden, false, 'the menu did not open over a machine on the devices channel');
  clickRow();
  assert.deepEqual(orders(), [{ cmd: 'prioritise', cid: ADA.cid, x: WING[0], y: WING[1], deck: RECT.deck }],
    'the order that reached the wire is not the integrator-fixed contract '
    + '{cmd:"prioritise", cid, x, y, deck}. M2-9 parses exactly these keys.');
});

// ⭐⭐ VR-P3-a — THE RIGHT-CLICK TAKES THE PIECE UNDER THE POINTER, NOT THE FLOOR BEHIND IT.
//
// PRIORITISE is the gesture this defect hurt most: the player points at a MACHINE, and a machine is
// exactly a piece that STANDS UP off its floor point, so its ink hangs over the tiles behind it. With
// the floor-plane inverse as the only tier, a right-click on the drawn machine resolved to an empty
// tile — `prioritiseOffer` found no `devices` row there and the menu SILENTLY did not open, which is
// the worst shape a miss can take (a stray right-click is deliberately silent, so the two are
// indistinguishable to a player). Measured before the fix in the running game: 16 of 18 fittings in
// the wreck's cryo bay resolved 1–3 tiles back, 2 resolved outside the room entirely.
//
// The leg drives the SAME coordinates twice. The control is the existing floor behaviour (right-click
// at the SECOND machine's scene point ⇒ that machine); the subject is the same coordinates with the
// FIRST machine's drawn piece as `e.target` ⇒ the first machine. If tier one were missing the two
// would be identical, and if tier one swallowed the canvas the control would break.
// MUTATION: delete the `data-tile` tier from `roomzoom-view.js`'s `tileAt` ⇒ this reddens.
test('VR-P3-a: right-clicking a drawn MACHINE offers that machine, not the tile behind it', () => {
  prime([ADA], null);
  // CONTROL — bare canvas at CELL's scene point: the floor inverse answers, as it always has.
  rightClick(CELL);
  assert.equal(menu().hidden, false, 'control: the menu did not open over the second machine');
  assert.equal(menuRow().textContent, 'PRIORITISE: REPAIR BATTERY');
  // …and with WING's drawn piece under the pointer at those SAME coordinates, WING is offered.
  prime([ADA], null);
  const piece = new RzEl(doc, 'g');
  piece.setAttribute('data-tile', WING[0] + ',' + WING[1]);
  piece.dataset.tile = WING[0] + ',' + WING[1];
  piece.parentNode = canvas();
  fire(piece, 'contextmenu', atTile(CELL));
  assert.equal(menu().hidden, false,
    'the menu did not open at all. A right-click on a drawn machine resolving to empty floor is a '
    + 'SILENT refusal — the exact failure mode this tier removes.');
  assert.equal(menuRow().textContent, 'PRIORITISE: REPAIR SOLAR WING',
    'the menu offered the machine the FLOOR point landed on, not the one the player pointed at');
  clickRow();
  assert.deepEqual(orders(),
    [{ cmd: 'prioritise', cid: ADA.cid, x: WING[0], y: WING[1], deck: RECT.deck }],
    'the order names the tile the floor inverse chose rather than the piece that was pressed');
});

// ⭐ MUTATION 2 — "send the machine at the wrong tile". The two-machine fixture: the SECOND device,
// at a different x AND a different y from the first, so sending the first machine's tile, the focus
// origin, or the room's corner all fail here while passing the leg above.
test('right-clicking the SECOND machine orders THAT tile — not the first one on the channel', () => {
  prime([ADA], null);
  rightClick(CELL);
  clickRow();
  assert.deepEqual(orders(), [{ cmd: 'prioritise', cid: ADA.cid, x: CELL[0], y: CELL[1], deck: RECT.deck }],
    'the order names a tile the player did not right-click');
});

test('and the row NAMES the machine it is about — the two fixtures read differently', () => {
  prime([ADA], null);
  rightClick(WING);
  assert.equal(menuRow().textContent, 'PRIORITISE: REPAIR SOLAR WING');
  prime([ADA], null);
  rightClick(CELL);
  assert.equal(menuRow().textContent, 'PRIORITISE: REPAIR BATTERY',
    'the row shows the same label for two different machines — the name is not derived per tile');
});

// ⭐ THE SUBSTITUTION, DRIVEN END TO END THROUGH THE SHIPPING SURFACE — the send-back's own case, and
// the one the pure legs above cannot make: this one goes through the real frame, the real `devices`
// channel and the real repaint, so it fails if ANY step on the path reaches for the picture.
// MUTATION: re-introduce the deleted `tileItemId` helper and name the row from
// `ITEMS[itemForGlyph(cell[0])].deviceKind` ⇒ the row reads "OXYGEN TANK" and this reddens.
test('a WaterTank wearing OXYGEN TANK art is offered as WATER TANK', () => {
  prime([ADA], null);
  assert.equal(itemForGlyph('O'.charCodeAt(0)), 'oxygen-tank',
    'fixture check: the tile\'s glyph must really resolve to the BORROWED piece, or this leg is '
    + 'asserting nothing about substitution at all');
  rightClick(TANK);
  assert.equal(menu().hidden, false, 'the menu did not open over the tank');
  assert.equal(menuRow().textContent, 'PRIORITISE: REPAIR WATER TANK',
    'the row is named from the ART on the tile instead of from the `devices` channel\'s `kind` byte. '
    + '`GLYPH_SUBSTITUTE` makes six kinds wear another piece\'s picture, so the picture is not '
    + 'evidence about what is installed — this one would offer to repair an "OXYGEN TANK", a device '
    + 'kind that does not exist in the sim at all.');
});

test('and the order it sends still names the TANK\'s own tile', () => {
  prime([ADA], null);
  rightClick(TANK);
  clickRow();
  assert.deepEqual(orders(),
    [{ cmd: 'prioritise', cid: ADA.cid, x: TANK[0], y: TANK[1], deck: RECT.deck }]);
});

// ⭐ MUTATION 3 — "register the context handler with {capture:true}". BUG-B's exact shape.
// APPLY: change `_canvas.addEventListener('contextmenu', onCanvasContext)` to
// `..., onCanvasContext, {capture:true})` (or `, true`) ⇒ this leg reddens and names the phase.
test('the contextmenu handler is registered on the canvas in the BUBBLE phase', () => {
  const regs = canvas().phases.contextmenu || [];
  assert.equal(regs.length, 1,
    'the Room Zoom registers ' + regs.length + ' contextmenu listeners on `.rz-canvas`, not 1');
  assert.equal(regs[0].capture, false,
    'the right-click handler is registered in CAPTURE phase. That is BUG-B\'s exact shape: '
    + '`overview-model.test.js` measured a capture registration on this codebase running ahead of '
    + 'the handler below it, killing the gesture SILENTLY with the whole suite green. It also '
    + 'diverges from the four sibling canvas gestures (mousedown/mousemove/click, all bubble), so '
    + 'the surface would have two registration idioms and no stated reason for either. The phase is '
    + 'read off the third argument recorded AT REGISTRATION — not scanned for in the source, which '
    + 'a comment, whitespace, or the `{capture:true}` options spelling all defeat.');
});

// ⭐ MUTATION 4 — "offer the menu on a tile with no device". APPLY: delete the `if (!o.dev)` early
// return in `prioritiseOffer` ⇒ the menu opens on bare floor and this reddens.
test('right-clicking BARE FLOOR opens nothing and sends nothing', () => {
  prime([ADA], null);
  rightClick(BARE);
  assert.equal(menu().hidden, true, 'the menu opened on a tile with no machine on it');
  clickRow();   // …and the row, if it were somehow live, must still have no target
  assert.deepEqual(orders(), [], 'a right-click on bare floor reached the wire');
});

// ⭐ MUTATION 5 — "offer it on a device whose deviceConditionAt is null". APPLY: in
// `onCanvasContext`, fall back to the frame — read `Hud.getFrame().cells[...]` and hand
// `prioritiseOffer` a stand-in row when the glyph is not bare floor ⇒ the menu opens over a machine
// the host will refuse and this reddens (measured: 36 of 37 still pass, so it isolates cleanly). It
// is the leg that separates "no device" from "device not on the channel": BARE has no glyph either,
// so mutation 4's fixture alone cannot catch a frame fallback.
// ⚠️ THE HELPER THAT MADE THAT MUTATION A ONE-WORD EDIT IS GONE — `tileItemId` was deleted at the
// fix-back, because naming from the art was itself the second defect. The mutation is still the right
// one to name: it is the shape someone re-introduces the day they want a name for a fogged tile.
test('a machine the FRAME draws but the devices channel does not carry is NOT offered', () => {
  prime([ADA], null);
  assert.equal(RoomZoom.deviceConditionAt(FOG[0], FOG[1]), null, 'fixture check: no row for FOG');
  rightClick(FOG);
  assert.equal(menu().hidden, true,
    'the menu was offered on a machine that is not on the `devices` channel. The host resolves a '
    + 'prioritise order through the same fog-gated population, so this is a button that looks live '
    + 'and cannot work — and the client would be promising an order the sim cannot take.');
  assert.deepEqual(orders(), []);
});

// ══════════════════════════════════════════ 3b. M3-14 RUNG 3 — THE MENU AND THE JOB AGREE ABOUT AIR
//
// ⭐⭐ RimWorld §8.4 rung 3: `FloatMenuMakerMap.makingFor == p` ALSO returns `Danger.Deadly`, so
// *"the right-click menu is built with the ceiling already raised, and the menu offers exactly what
// the forced job will accept. One rule, not two."*
//
// ⚠️ THE CLIENT NEEDED NO CHANGE TO GET THERE, AND THAT IS THE FINDING RATHER THAN AN OMISSION.
// This menu never asked the air question: `prioritise-model.js` gates on ONE thing — whether the
// tile carries a `devices` row — precisely because `wire/session.js` forbids the client to
// duplicate the host's verdict (*"the client's job is NOT to duplicate that verdict but to never
// OFFER the order where it must fail"*). The disagreement rung 3 names lived entirely on the sim
// and host side, and M3-14 closed it THERE (`PrioritiseJobCommand`, `MachineWearSystem`,
// `GameSession.BlockedReason`). What is left for this file is the leg that keeps it closed.
//
// ⛔ THE MUTATION THIS LEG EXISTS FOR — and it is the natural, well-meant edit, not a contrivance:
// gate the offer on the tile's `blocked` state (`roomBlockedTiles` is already imported by
// `roomzoom-view.js` and `_blockedTiles` is already in scope beside the handler), e.g. refuse to
// open the menu over a tile carrying `ReasonAir` ⇒ RED here. That edit would put the menu back to
// refusing exactly the orders the sim now accepts — the SAME disagreement, with the sign flipped,
// and the player would be unable to order the one repair the ladder was built to allow.
test('M3-14 rung 3: the menu still opens on a machine the `blocked` layer marks AIRLESS', () => {
  prime([ADA], null);
  // The host's own vocabulary: [x, y, deck, order, reason]; order 0 = dig, reason 0 = air. A dig
  // order is used deliberately — a repair row would beg the question, and what is asserted is that
  // NO blocked row of any kind withholds the order.
  Hud.renderBlocked(decode(JSON.stringify({
    type: 'blocked', cells: [[WING[0], WING[1], RECT.deck, 0, 0]],
  })));
  RoomZoom.exitRoom();
  RoomZoom.enterRoom('quarters');
  sent.length = 0;

  // ⚠️ try/FINALLY, and it is not tidiness. `assert` throws, and the `blocked` cache is MODULE
  // state that `prime()` does not reset — so a failure here would leave every later leg in this
  // file running against a populated channel. Measured: without the finally, the rung-3 mutation
  // reddened this leg AND SEVEN SIBLINGS, which is exactly the false-red that makes a mutation
  // table unreadable (TRAPS 3).
  try {
    rightClick(WING);
    assert.equal(menu().hidden, false,
      'THE MENU WAS WITHHELD OVER AN AIRLESS TILE. The sim now ACCEPTS a direct order there '
      + '(rung 2 — she walks into vacuum because the player said so), so a client that refuses to '
      + 'offer it has re-created the menu/job disagreement §8.4 rung 3 exists to prevent, with the '
      + 'sign flipped: the one order the ladder was built to allow is the one the player cannot give.');
    clickRow();
    assert.deepEqual(orders(),
      [{ cmd: 'prioritise', cid: ADA.cid, x: WING[0], y: WING[1], deck: RECT.deck }],
      'the order over an airless tile must reach the wire unchanged — the client sends it and the '
      + 'sim decides, which is the single-authority rule this surface has kept since M2-10.');
  } finally {
    Hud.renderBlocked(decode(JSON.stringify({ type: 'blocked', cells: [] })));
    RoomZoom.exitRoom();
    RoomZoom.enterRoom('quarters');
  }
});

// ═══════════════════════════════ 3c. M3-13 — THE MENU DOES NOT OFFER A REPAIR THE SIM NEVER TAKES
//
// ⭐⭐ THE OPEN DEFECT THIS PACKAGE CLOSES, carried in HANDOVER since M2-10 and quoted in the M3-13
// charter: *"The Prioritise menu is offered on never-serviceable machines (CryoPod `maint = 0`):
// click → toast fires → sim refuses silently, nothing on `blocked`. The cryo bay is full of these."*
// `PrioritiseJobCommand` returns at `device.Condition >= Machines[kind].MaintainBelow`, and
// `Condition` is clamped at or above 0, so a kind with `maint = 0.00` can never satisfy it on any
// ship, forever. `CryoPod`'s 0.00 is DELIBERATE (MECHANICS §13.22c — at 0.30 the lone pawn spent the
// ship's whole consumable stock nursing corpses), so the def is not the thing to change; the MENU is.
//
// ⭐ RimWorld §2.2 decides the shape: *"if no menu appears, that colonist can do nothing with that
// target"*, and *"the context menu greys the entry and states the reason … it does not accept the
// order and then fail silently."* This surface's menu is a SINGLE ROW, so a greyed row is an empty
// box; the reachable equivalent of "greys the entry and states the reason" is the model's existing
// says-so-in-words refusal, which is why the leg below asserts BOTH halves.

// ⭐ MUTATION 5 (the charter's) — "offer Prioritise on a `maint == 0` device". APPLY: delete the
// `if (o.dev.serv === 0)` block in `prioritiseOffer` ⇒ the menu opens over the capsule and this
// reddens.
//
// ⛔ APPLY 2 — WEAKEN THE TEST TO `if (!o.dev.serv)`. ⚠️ THE FIRST VERSION OF THIS LEDGER SAID THAT
// REDDENS "the CONTROL test below". IT DOES NOT — MEASURED, AND THE CORRECTION IS THE INTERESTING
// PART. Both the decoder and the room model NORMALISE an absent `serv` to 1 before the model ever
// sees a row (`decodeDevices`: `t.length > 7 ? … : 1`; `roomDeviceConditions`: `d.serv === undefined
// ? 1 : …`), so by the time the DRIVEN control asks, `serv` is the number 1 and `!1` and `1 !== 0`
// agree. The control's assertion is true BY NORMALISATION UPSTREAM, not by the gate's spelling —
// which is precisely the fourth trap shape: a guard whose scope excludes the violation.
//   THE ACTUAL KILLERS, named rather than numbered (numbering moves):
//     · `prioritiseOffer: a REAL target with nobody to order is refused OUT LOUD`
//     · `prioritiseOffer: an accepted offer carries the cid and the labelled row`
//   — two PRE-EXISTING M2-10 tests, which feed `prioritiseOffer` bare literals (`{kind, cond}`)
//   with no `serv` at all, i.e. the one population the normalisation never touches.
//   ⇒ Because relying on two tests that predate the field is relying on an accident, the leg
//   `M3-13: an ABSENT serv is not the same as serv 0` below asserts the distinction BY NAME, at the
//   model boundary where it actually lives. Re-measured after adding it: the mutation reddens 3.
test('M3-13: right-clicking a CRYO CAPSULE offers NO repair — and says why out loud', () => {
  prime([ADA], null);
  rightClick(POD);
  assert.equal(menu().hidden, true,
    'THE MENU WAS OFFERED ON A MACHINE THE SIM WILL NEVER TAKE AN ORDER FOR. `CryoPod` is '
    + '`maint = 0.00`, so PrioritiseJobCommand returns before it does anything: the player clicks, '
    + 'a toast promises the order went, and NOTHING happens on any surface, ever. That is the '
    + 'invisible-feedback failure with the menu\'s own promise standing in front of it.');
  assert.match(toastText(), /NEVER SERVICED/,
    'the refusal was SILENT. A capsule is a target the player deliberately aimed at — the silent '
    + 'outcome is reserved for bare floor, where a right-click is not an intent aimed at anything. '
    + 'RimWorld §2.2: the menu states the reason at the point of the click.');
  assert.match(toastText(), /CRYO POD/,
    'the sentence must NAME the machine, from the `devices` row\'s own kind byte — a bare "never '
    + 'serviced" over a bay of twelve capsules does not tell the player what they clicked');
  assert.deepEqual(orders(), [],
    'a right-click on a never-serviceable machine reached the wire');
});

// ⛔ THE NON-VACUOUS CONTROL THE CHARTER ASKS FOR BY NAME, and it is TWO controls, because the
// never-serviceable gate can be wrong in two directions and only one of them is loud.
//   (a) a SERVICEABLE machine still opens the menu and still orders — otherwise the leg above is
//       also satisfied by a `prioritiseOffer` that refuses everything;
//   (b) a row with NO eighth element still opens the menu — the append-only contract, and the
//       failure it guards is total: an older host, or a channel row that lost the field, would
//       withdraw M2-10's verb from every machine on the ship with nothing said.
// (b) is the same fixture as (a) — WING is deliberately seven-element in this rig — so it is
// asserted here explicitly rather than left as an accident of the fixture.
test('M3-13 CONTROL: a serviceable machine still offers the repair, and so does a SHORT row', () => {
  prime([ADA], null);
  assert.equal(RoomZoom.deviceConditionAt(WING[0], WING[1]).serv, 1,
    'fixture: WING\'s row has no eighth element, so `serv` must have defaulted to 1 (serviceable)');
  rightClick(WING);
  assert.equal(menu().hidden, false,
    'the menu was withheld from a SERVICEABLE machine — the never-serviceable gate refuses '
    + 'everything, and M2-10\'s whole verb is gone with the suite otherwise green');
  clickRow();
  assert.deepEqual(orders(), [{ cmd: 'prioritise', cid: ADA.cid, x: WING[0], y: WING[1], deck: RECT.deck }]);
});

// ═════════════════════════════════════════════════════════════════ 4. WHICH PAWN, DRIVEN

test('with a pawn SELECTED the order goes to her, not to the roster\'s first row', () => {
  prime([ADA, RYN], RYN.cid);   // RYN is never crew[0] — the wrong-pawn mutation cannot hide
  rightClick(WING);
  clickRow();
  assert.deepEqual(orders(),
    [{ cmd: 'prioritise', cid: RYN.cid, x: WING[0], y: WING[1], deck: RECT.deck }]);
});

test('with NO selection and SEVERAL aboard the menu is withheld and says why', () => {
  prime([ADA, RYN], null);
  rightClick(WING);
  assert.equal(menu().hidden, true, 'the client guessed a pawn rather than asking for one');
  assert.deepEqual(orders(), []);
  assert.match(toastText(), /NO CREW SELECTED/,
    'a withheld menu with no words is indistinguishable from a broken gesture');
});

// ═════════════════════════════════════════════════════════════════ 5. THE BOX BEHAVES LIKE A MENU

test('the right-click suppresses the browser\'s own context menu — on a machine AND on floor', () => {
  prime([ADA], null);
  assert.equal(rightClick(WING).defaultPrevented, true);
  prime([ADA], null);
  assert.equal(rightClick(BARE).defaultPrevented, true,
    'the native menu is suppressed only where the game answers, so the right button behaves '
    + 'differently depending on what is under it — which is how a player learns not to trust it');
});

test('the box lands under the pointer', () => {
  prime([ADA], null);
  const at = atTile(CELL);
  rightClick(CELL);
  assert.equal(menu().style.left, String(Math.round(at.clientX)) + 'px');
  assert.equal(menu().style.top, String(Math.round(at.clientY)) + 'px');
});

// ⭐ THE EDGE CLAMP. A row naming a machine is ~220 px wide, so a right-click near the right or
// bottom edge of the viewport would put the menu's ONLY control partly off-screen — an order the
// player can see and cannot click, which is `invisible-feedback-is-FUNCTIONAL` in its most literal
// form. The clamp is inert in this rig by default (`getBoundingClientRect` returns zeros, the window
// stub has no `innerWidth`), so this leg SUPPLIES both, which is also the non-vacuity floor: without
// a measurable box and a viewport there is nothing to clamp against.
// MUTATION: delete both `if (box && …)` lines in `openCtx` ⇒ this reddens with the raw pointer x.
test('a menu that would overflow the viewport is pulled back on screen', () => {
  prime([ADA], null);
  const box = menu();
  box._rect = { left: 0, top: 0, width: 220, height: 34 };
  globalThis.window.innerWidth = 300;
  globalThis.window.innerHeight = 300;
  try {
    const at = atTile(CELL);
    assert.ok(at.clientX + 220 > 300,
      'the fixture does not overflow, so this leg would pass with no clamp at all');
    rightClick(CELL);
    assert.equal(box.style.left, '80px', 'the menu was not pulled back inside the viewport');
  } finally {
    delete globalThis.window.innerWidth;
    delete globalThis.window.innerHeight;
    box._rect = { left: 0, top: 0, width: 0, height: 0 };
  }
});

// ⭐ THE GLOBAL-CHROME CLAMP — the send-back's other defect, and the fix that REPLACES a z-index that
// could not work. `.onb-help` (the `?` circle) is appended to `document.body`, while `#roomzoom-view`
// is `position:fixed; z-index:20`, i.e. its own STACKING CONTEXT — so no z-index on this box can
// outrank the circle, and independent review measured that the shipped 130 still lost the hit-test in
// a ~240×24 px strip at the top-right. The remedy is the one `.ov-nudge` already chose for the same
// collision: MOVE, don't out-stack.
//
// The rig's `querySelector` returns null by default, so this leg SUPPLIES the circle — which is also
// its non-vacuity floor: with no `.onb-help` in the document there is nothing to dodge.
// MUTATION: delete the `if (avoid && …)` block in `openCtx` ⇒ this reddens with the raw pointer x.
/** Install a fake `.onb-help` at a rect of our choosing and return a restore function. The rig's
 *  `querySelector` returns null by default, so supplying the circle IS the non-vacuity floor: with no
 *  `.onb-help` in the document there is nothing to dodge and the clamp is inert. */
function withHelpCircle(rect, boxW, boxH) {
  const box = menu();
  const help = new RzEl(doc, 'button');
  help.className = 'onb-help';
  help._rect = rect;
  box._rect = { left: 0, top: 0, width: boxW, height: boxH };
  doc.querySelector = (sel) => (sel === '.onb-help' ? help : null);
  globalThis.window.innerWidth = 2000;
  globalThis.window.innerHeight = 2000;
  return () => {
    doc.querySelector = () => null;
    delete globalThis.window.innerWidth;
    delete globalThis.window.innerHeight;
    box._rect = { left: 0, top: 0, width: 0, height: 0 };
  };
}

test('the menu never opens under the `?` help circle — it STEPS ASIDE, as .ov-nudge does', () => {
  prime([ADA], null);
  const at = atTile(WING);
  const W = 100, H = 34;
  // The circle straddles the box's right half, with room to the left of it.
  const rect = { left: at.clientX + 70, top: at.clientY - 8, right: at.clientX + 102,
                 bottom: at.clientY + 24, width: 32, height: 32 };
  const restore = withHelpCircle(rect, W, H);
  try {
    assert.ok(at.clientX < rect.right + 6 && at.clientX + W > rect.left - 6
              && at.clientY < rect.bottom + 6 && at.clientY + H > rect.top - 6,
      'the fixture does not overlap the circle, so this leg would pass with no clamp at all');
    assert.ok(rect.left - 6 - W >= 0, 'the fixture must leave room to the LEFT, or it is testing the '
      + 'fallback branch instead of the sideways one');
    rightClick(WING);
    assert.equal(menu().style.left, String(rect.left - 6 - W) + 'px',
      'the menu still opens across the help circle. A click in the overlap opens the onboarding card '
      + 'instead of ordering the repair, and NO z-index on this box can change that: `.onb-help` is '
      + 'appended to document.body while `#roomzoom-view` is `position:fixed; z-index:20`, its own '
      + 'stacking context. Geometry crosses stacking contexts; z-index does not.');
  } finally { restore(); }
});

// ⭐ THE OTHER BRANCH, pinned separately because a two-branch clamp with one leg is a half-tested
// clamp: when the circle leaves no room to its left, the box drops BELOW it.
// MUTATION: delete the `else top = avoid.bottom + CTX_GAP;` line ⇒ this reddens.
test('…and when there is no room to the left, it drops BELOW the circle instead', () => {
  prime([ADA], null);
  const at = atTile(WING);
  // ⚠️ THE BOX WIDTH IS DERIVED FROM THE POINTER, not a literal 220. The fixture's whole job is "no
  // room to the LEFT", i.e. `rect.left - CTX_GAP - W < 0`, and at VR-P3 the same tile projects
  // further right in the scene than it sat in the plan — so a fixed 220 quietly stopped exercising
  // the branch it names and the guard below caught it. Derived, it cannot drift again.
  const W = at.clientX + 40, H = 34;
  const rect = { left: at.clientX + 10, top: at.clientY - 4, right: at.clientX + 42,
                 bottom: at.clientY + 28, width: 32, height: 32 };
  const restore = withHelpCircle(rect, W, H);
  try {
    assert.ok(rect.left - 6 - W < 0,
      'the fixture leaves room to the left, so it exercises the sideways branch, not this one');
    rightClick(WING);
    assert.equal(menu().style.top, String(rect.bottom + 6) + 'px',
      'with no room to its left the menu must drop below the circle; it is still overlapping');
  } finally { restore(); }
});

// ⭐ ESC — the one close path that had no test (review, non-blocking). It is a rung ABOVE the armed
// tool: the box goes and the palette selection survives.
test('ESC closes the menu FIRST and leaves the armed tool alone', () => {
  prime([ADA], null);
  arm('lamp');
  rightClick(WING);
  assert.equal(menu().hidden, false);
  key('Escape');
  assert.equal(menu().hidden, true, 'ESC did not take the menu down');
  assert.ok(armedNow(), 'ESC disarmed the tool as well — the menu must be its own rung');
  key('Escape');
  assert.ok(!armedNow(), 'a SECOND ESC must fall through to the ordinary disarm rung');
});

test('a LEFT click on the floor dismisses an open menu', () => {
  prime([ADA], null);
  rightClick(WING);
  assert.equal(menu().hidden, false);
  fire(canvas(), 'click', atTile(BARE));
  assert.equal(menu().hidden, true);
});

test('leaving the room takes the menu down with it', () => {
  prime([ADA], null);
  rightClick(WING);
  RoomZoom.exitRoom();
  assert.equal(menu().hidden, true,
    'the menu survived room exit — its target tile belongs to a room that is no longer on screen');
});

test('the row is spent on click: a second click sends nothing more', () => {
  prime([ADA], null);
  rightClick(WING);
  clickRow();
  assert.equal(orders().length, 1);
  clickRow();
  assert.equal(orders().length, 1,
    'clicking the closed menu\'s row sent a SECOND order. `doPrioritise` must clear its target.');
});
