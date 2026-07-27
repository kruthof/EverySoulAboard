// E0-8 — THE LEDGER MODEL + its island on THE STANDARD SURFACE.
//
// Two halves, and the second is the one this repo learned to insist on. (1) `ledger-model.js` is
// PURE, so it is DRIVEN: every assertion below feeds it a real payload and reads the strings it
// returns — nothing is scanned for and nothing is re-derived with the model's own expression.
// (2) A small set of scans over `overview-view.js` and `main.js`, because "the model is correct" and
// "the player can see it" are different claims, and E0-4's WP-5 shipped a whole feature that
// satisfied only the first (onto the wrong surface, at that). Every scan runs over CODE ONLY through
// the shared `codeOnly`, with a NEGATIVE CONTROL below proving a comment cannot satisfy it — and
// that control contains A LATER REAL COMMENT, without which the failure it exists to catch (a
// stripper that gives up at the first marker) could not occur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { codeOnly } from './code-only.js';
import {
  ledgerRows, matterLine, noteFor, rateText, runwayText, partsUnits, crewDaysOfO2, caveatLine,
  MEASURING, NOT_DEPLETING, RUNWAY_CRITICAL_DAYS, RUNWAY_WARN_DAYS,
} from '../src/ui/ledger-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

/** A payload shaped exactly like hosts/web/WireFormat.Ledger.cs emits. */
function payload(over = {}) {
  return Object.assign({
    type: 'ledger', tick: 864000, window: 36000, total: 731, stacks: 710, unknown: 0, crew: 8,
    matter: [['Corpse', 1], ['Potato', 699], ['Parts', 12], ['ControllerModule', 31]],
    partsPerDay: 0, matterPerDay: 9, daysOfWater: -1, o2TrendDays: -1,
    tankL: 1000, tankCapL: 1000, greyL: 20, o2mol: 18885.6, crewO2PerDay: 210.2,
    notes: [['matter', 'M NOTE'], ['parts_per_day', 'P NOTE'],
            ['days_of_water', 'W NOTE'], ['o2_trend', 'A NOTE'], ['caveat', 'C NOTE']],
  }, over);
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// The sentinels — the entire reason this module exists
// ═════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: `if (!(num(windowTicks) > 0)) return MEASURING;` → `return '+0.0/d'` ⇒ RED. That is the
// bug in its natural form: a confident zero about a ship the host has not looked at yet.
test('window === 0 means MEASURING on every rate, never a confident zero', () => {
  const rows = ledgerRows(payload({ window: 0, partsPerDay: 0, matterPerDay: 0 }));
  const subs = rows.map((r) => r.sub);
  assert.deepEqual(subs, [MEASURING, MEASURING, MEASURING, MEASURING]);
  for (const s of subs) assert.ok(!/0/.test(s), `a windowless rate must not render a digit, got "${s}"`);
});

// MUTATION: `if (n === null || n < 0) return { text: NOT_DEPLETING …}` → `n.toFixed(2) + ' d'` ⇒ the
// healthy ship renders "-1.00 d" ⇒ RED.
test('a negative runway is STEADY, not a missing value and not zero', () => {
  const rows = ledgerRows(payload({ daysOfWater: -1, o2TrendDays: -1 }));
  const water = rows.find((r) => r.id === 'days_of_water');
  const air = rows.find((r) => r.id === 'o2_trend');
  assert.equal(water.sub, NOT_DEPLETING);
  assert.equal(air.sub, NOT_DEPLETING);
  assert.equal(water.level, '', 'a ship that is not losing water is not in an alarm state');
  assert.equal(air.level, '');
});

// MUTATION: clamp `partsPerDay` with `Math.max(0, n)` in `rateText` ⇒ RED. PartsPerDay is signed and
// its zero is a REAL reading, which is why `window` and not `-1` is its "no value" signal.
test('partsPerDay is signed — a zero is a reading and a negative is a ship eating its own stock', () => {
  assert.equal(rateText(0, 36000), '+0.0/d');
  assert.equal(rateText(-12, 36000), '-12.0/d');
  assert.equal(rateText(20, 36000), '+20.0/d');
  assert.equal(rateText(20, 0), MEASURING, 'no window beats any value');
});

// MUTATION: swap `<` for `<=` on the critical threshold, or drop the `warn` rung ⇒ RED.
test('a runway alarms at the stated thresholds, and only there', () => {
  assert.equal(runwayText(0.5, 1).level, 'crit');
  assert.equal(runwayText(RUNWAY_CRITICAL_DAYS, 1).level, 'warn', 'exactly at the crit bound is a warn');
  assert.equal(runwayText(2.9, 1).level, 'warn');
  assert.equal(runwayText(RUNWAY_WARN_DAYS, 1).level, '', 'exactly at the warn bound is information');
  assert.equal(runwayText(40, 1).level, '');
  assert.equal(runwayText(1.5, 1).text, '1.50 d');
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// The matter census — the half that must survive a sibling lane adding an ItemKind
// ═════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: replace `matterLine`'s use of the payload's names with a client-side
// `KIND_NAMES[i]` table of length 7 ⇒ the new kind renders `undefined` ⇒ RED.
test('an ItemKind this client has never heard of still appears, by name, with its units', () => {
  // Exactly what E0-6 (`Seals`) and E0-7 (`Ice`) will put on this channel. There is no client-side
  // table to add them to, and that is the point.
  const line = matterLine(payload({ matter: [['Potato', 4], ['Seals', 12], ['Ice', 900]] }));
  assert.match(line, /Ice 900/);
  assert.match(line, /Seals 12/);
  assert.ok(!/undefined/.test(line), `an unknown kind rendered as undefined: "${line}"`);
  // Largest first, so a new bulk resource is not buried under a corpse.
  assert.ok(line.indexOf('Ice 900') < line.indexOf('Seals 12'));
  assert.ok(line.indexOf('Seals 12') < line.indexOf('Potato 4'));
});

// MUTATION: drop the `unknown` branch ⇒ RED. This bucket should be unreachable; it is surfaced
// rather than dropped because a ledger silently losing a resource is the defect E0-8 exists to end.
test('units under a kind the HOST could not name are surfaced, not swallowed', () => {
  const line = matterLine(payload({ matter: [['Potato', 4]], unknown: 17 }));
  assert.match(line, /\(unknown\) 17/);
});

// MUTATION: `.filter((e) => e.units !== 0)` removed ⇒ a zero row appears ⇒ RED.
test('a kind at zero is not news, and an empty ship renders nothing rather than zeroes', () => {
  assert.equal(matterLine(payload({ matter: [['Potato', 0], ['Scrap', 0]] })), '');
  assert.equal(matterLine(null), '');
  assert.deepEqual(ledgerRows(null), [], 'no payload ⇒ no rows, so the island shows its empty state');
});

// ⚠️ THE PRESENT CASE IS THE LOAD-BEARING HALF, AND IT WAS MISSING. This test used to check only
// the ABSENT case — which returns 0 whether `partsUnits` works or has been deleted entirely — so
// `partsUnits` → `() => 0` SURVIVED the whole suite while the PARTS row silently read 0 on every
// ship that had any. Found by mutation, not by reading.
//
// MUTATION: `partsUnits` → `() => 0` ⇒ the first two assertions fail.
// MUTATION 2: `partsUnits` returning `null` for an absent kind ⇒ the row renders "null" ⇒ fails.
test('Parts PRESENT is read out of the sparse list, and Parts absent means zero aboard', () => {
  // present — the case the row exists for
  assert.equal(partsUnits(payload()), 12);
  const live = ledgerRows(payload()).find((r) => r.id === 'parts_per_day');
  assert.equal(live.value, '12', 'the PARTS row shows the units actually aboard');

  // absent — a sparse list omits a zero kind; that means none, not unknown
  assert.equal(partsUnits(payload({ matter: [['Potato', 4]] })), 0);
  const empty = ledgerRows(payload({ matter: [['Potato', 4]] })).find((r) => r.id === 'parts_per_day');
  assert.equal(empty.value, '0');
});

// ── the O2 row: the rename and its reference point ──

// MUTATION: `value: crewDaysOfO2(msg)` → `(o2/1000).toFixed(1) + ' kmol'` (what shipped first) ⇒ the
// crew-days assertion fails. That number is uninterpretable: this sim has no air capacity, no target
// and no reserve, so there is nothing aboard to compare a mole count against.
test('the O2 row is labelled a TREND and its number carries a reference point', () => {
  const air = ledgerRows(payload()).find((r) => r.id === 'o2_trend');
  assert.equal(air.label, 'O₂ TREND',
    'a row called AIR states there is air aboard to run out of; this ship has no air reserve at all');
  // 18885.6 mol ÷ 210.2 mol/crew-day = 89.8 crew-days
  assert.equal(air.value, '89.8 crew-d');
  assert.equal(crewDaysOfO2(payload({ o2mol: 420.4, crewO2PerDay: 210.2 })), '2.0 crew-d');
});

// MUTATION: return `'0.0 crew-d'` instead of '–' when the denominator is missing or zero ⇒ RED.
// An empty ship has no crew-days; 0 and ∞ are both statements the data does not support.
test('with nobody aboard, or no denominator, the O2 row shows a dash rather than a number', () => {
  assert.equal(crewDaysOfO2(payload({ crewO2PerDay: 0 })), '–');
  assert.equal(crewDaysOfO2(payload({ crewO2PerDay: undefined })), '–');
  assert.equal(crewDaysOfO2(payload({ o2mol: undefined })), '–');
  assert.equal(crewDaysOfO2(null), '–');
});

// MUTATION: `caveatLine` → `() => ''` ⇒ RED. It is the ONE limit on this island a player who never
// hovers a row must still be told, so it is text on the surface and not a `title`.
test('the caveat is host text, always available, and never invented client-side', () => {
  assert.equal(caveatLine(payload()), 'C NOTE');
  assert.equal(caveatLine(payload({ notes: [] })), '',
    'no caveat from the host means no caveat — the client must not write one of its own');
  assert.equal(caveatLine(null), '');
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// The limits travel with the numbers (DA-M3)
// ═════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: return '' from `noteFor` ⇒ RED. A bare "DAYS OF AIR" is read as an oxygen supply this
// ship does not have — the note is the feature, not decoration.
test('each row carries the HOST derivation note, matched by id', () => {
  const rows = ledgerRows(payload());
  assert.deepEqual(rows.map((r) => r.note), ['M NOTE', 'P NOTE', 'W NOTE', 'A NOTE']);
  assert.equal(caveatLine(payload()), 'C NOTE', 'the always-visible caveat comes from the HOST too');
  assert.equal(noteFor(payload(), 'o2_trend'), 'A NOTE');
  assert.equal(noteFor(payload(), 'nope'), '', 'an unknown id is empty, never undefined');
  assert.deepEqual(ledgerRows(payload({ notes: undefined })).map((r) => r.note), ['', '', '', ''],
    'a payload without notes must not crash the island');
});

// A hostile payload must not throw: the wire is authoritative but a version skew is a real thing.
test('a malformed payload degrades to dashes instead of throwing', () => {
  const rows = ledgerRows({ type: 'ledger' });
  assert.equal(rows.length, 4);
  for (const r of rows) {
    assert.equal(typeof r.value, 'string');
    assert.ok(!/NaN|undefined|null/.test(r.value + r.sub), `"${r.value}" / "${r.sub}"`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════
// It is on THE STANDARD SURFACE, and the player can see it
// ═════════════════════════════════════════════════════════════════════════════════════════

// MUTATION: delete `case 'ledger':` from main.js ⇒ RED here AND in the C# half
// (SurfaceBoundaryTests.EveryWireChannelIsConsumedByTheStandardClient, whose allowlist is empty).
// MUTATION 2: build the island in hud.js's console shell instead ⇒ the `ov-ledger` scan fails.
test('the ledger channel is dispatched and drawn on the standard surface, not the console', () => {
  const main = codeOnly(read('src/main.js'));
  assert.match(main, /case 'ledger':/, 'client/src/main.js must dispatch the `ledger` channel');
  assert.match(main, /Hud\.renderLedger/);

  const overview = codeOnly(read('src/ui/overview-view.js'));
  assert.match(overview, /ov-ledger/, 'the LEDGER island belongs on the Level-1 Overview');
  assert.match(overview, /ledgerRows/, '…and it must paint from the pure model, not re-derive');

  // ⛔ AND NOT ON THE DEPRECATED SHELL. hud.js may CACHE the channel (that is the shared wire-state
  // layer both modern surfaces read and the half that survives WP-9); it may not DRAW it.
  const hud = codeOnly(read('src/ui/hud.js'));
  assert.match(hud, /export function renderLedger/, 'the cache seam lives in hud.js like every other channel');
  assert.ok(!/ov-ledger|ledgerRows|LEDGER/.test(hud),
    'hud.js is the deprecated console module and is CLOSED TO NEW WORK — it may cache the ledger, ' +
    'never render it. Build the island on overview-view.js / roomzoom-view.js. See THE STANDARD ' +
    'SURFACE in CLAUDE.md and client/test/surface-boundary.test.js.');
});

// NEGATIVE CONTROL for the scans above. Without it the guard fires on prose, which teaches people to
// delete explanatory comments — the maintenance tax this repo refuses to create.
//
// ⚠️ THE FIXTURE CARRIES A LATER REAL COMMENT ON PURPOSE. A stripper that gave up at the first
// marker would leave everything after it in place, and a control whose only comment is the last
// thing in the string could never catch that. This one would.
test('NEGATIVE CONTROL: a commented-out dispatch does not satisfy the scans', () => {
  const commented = "// case 'ledger': Hud.renderLedger(m); break;\nconst live = 1;\n// a later real comment\n";
  assert.ok(!/case 'ledger':/.test(codeOnly(commented)),
    'codeOnly left a commented-out dispatch in place — the cheapest way past this guard would then ' +
    'be to write the fix in a comment instead of doing it');
  assert.match(codeOnly(commented), /const live = 1/, 'and it must not eat the real code around it');
});

// POSITIVE CONTROL: the same text as real code DOES trip the scan, so the negative control above is
// not passing because the matcher is broken.
test('POSITIVE CONTROL: the same text in real code DOES trip the scans', () => {
  assert.match(codeOnly("case 'ledger': Hud.renderLedger(m); break;\n"), /case 'ledger':/);
});

// Non-vacuity: the scanned sources must be real files with real content.
test('the scanned sources are non-empty', () => {
  for (const rel of ['src/main.js', 'src/ui/overview-view.js', 'src/ui/hud.js', 'src/ui/ledger-model.js']) {
    assert.ok(codeOnly(read(rel)).length > 500, `${rel} is suspiciously small — the scans are reading nothing`);
  }
});
