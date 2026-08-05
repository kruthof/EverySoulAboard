// ⭐⭐ D4 — YOU CAN SEE THE VACUUM. The CLIENT half of the package, driven through the pure models
// the two standard surfaces actually call.
//
// WHAT WAS WRONG (M3 milestone demo, finding D4): a direct prioritise-repair order into a hall that
// was still depressurising was accepted — by design — and killed the pawn, with nothing on any
// surface saying the word AIR. The host half of the fix stops dropping airless rooms from the
// `rooms` channel; this file pins what that buys on screen, plus the two client-owned halves:
//
//   1. THE PRESSURE LENS PAINTS A VACUUM. `lensGrade(lens, null)` returns null — the SAME value it
//      returns for "no lens selected" — so before the host change an airless compartment was
//      indistinguishable from an unlensed one. With a row it grades `bad`.
//   2. NO ATMOS LENS GRADES A VACUUM FAVOURABLY. This is the lie the host change would otherwise
//      have INTRODUCED: `Room.CO2Ppm` returns 0 at zero moles, and 0 ppm lands in the `< 1000` GOOD
//      band. A hard vacuum painted green is worse than a hard vacuum painted nothing.
//   3. THE READOUT SHOWS THE PRESSURE. It carried O₂, CO₂, temperature and power and never the one
//      number that says the compartment is empty.
//   4. THE PRIORITISE OFFER NAMES THE HAZARD — and still offers the order (RimWorld's shape: the
//      menu states the reason, the player still gets to click).
//
// EVERY MULTI-LEG TEST IS BLINDED (TRAPS, fifth shape): `assert` throws, so a dead second leg looks
// exactly like a live one. Legs collect into an array and one assertion reports them all.

import test from 'node:test';
import assert from 'node:assert/strict';

import { lensGrade, lensSlotTint, GRADE_TINT, fmtPressure } from '../src/ui/overview-model.js';
import { decksView, deckSlotView, atmosByAnchor } from '../src/ui/decks-model.js';
import { decodeDecks, decodeRooms, decode } from '../src/wire/messages.js';
import { prioritiseOffer } from '../src/ui/prioritise-model.js';

// ─────────────────────────────────────────────────────────── 1 + 2: the lens

test('D4: an AIRLESS room grades `bad` under the pressure lens — it is no longer indistinguishable from no lens', () => {
  const vacuum = { o2: 0, co2ppm: 0, pressureKPa: 0, tempK: 293 };
  const fails = [];

  if (lensGrade('pressure', vacuum) !== 'bad') fails.push('pressure over 0 kPa is not `bad`');
  // THE CONTROL that makes the leg above mean something: the OLD value for the same compartment.
  // With no `rooms` row the slot's atmos is null and this is what the lens saw.
  if (lensGrade('pressure', null) !== null) fails.push('the null-atmos answer changed — the control is gone');
  // …and `null` is the SAME answer "no lens" gives, which is the whole reason the blank was
  // invisible rather than merely uninformative.
  if (lensGrade('none', vacuum) !== null) fails.push('`none` no longer answers null');

  // THE SURFACE ACTUALLY PAINTS IT. `lensSlotTint` is what `overview-scene.js` calls per slot.
  if (lensSlotTint('pressure', { atmos: vacuum }) !== GRADE_TINT.bad) fails.push('the vacuum slot takes no bad wash');
  if (lensSlotTint('pressure', { atmos: null }) !== null) fails.push('a slot with no row is tinted anyway');
  // NON-VACUITY, an INCLUSION test: a healthy room must still come out GOOD, or "everything is bad"
  // would pass every leg above.
  if (lensSlotTint('pressure', { atmos: { o2: 0.21, co2ppm: 500, pressureKPa: 101.3, tempK: 293 } })
      !== GRADE_TINT.good) fails.push('a pressurised room no longer grades good — the lens says `bad` about everything');

  assert.deepEqual(fails, [], fails.join('\n'));
});

test('D4: NO atmos lens grades a hard vacuum favourably — the lie the host change would have introduced', () => {
  // A vented compartment that has not cooled yet: 0 moles, still at room temperature. `Room.CO2Ppm`
  // and `Room.O2Fraction` both return 0 when `TotalMoles <= 0`, so the raw numbers are honest and
  // the BANDS are what would lie.
  const ventedWarm = { o2: 0, co2ppm: 0, pressureKPa: 0, tempK: 294 };
  const fails = [];
  for (const lens of ['oxygen', 'co2', 'temperature', 'pressure']) {
    const g = lensGrade(lens, ventedWarm);
    if (g !== 'bad') {
      fails.push(`the ${lens} lens grades a hard vacuum \`${g}\` — a compartment with nothing in it `
        + 'has no gas reading, and painting it green/blue is a worse lie than the blank D4 removes');
    }
  }
  // ⛔⛔ SEND-BACK CELLS, AND THEY ARE WHAT MAKES THIS AN INCLUSION TEST (TRAPS, 4th shape). The loop
  // above iterates ONLY the four atmos lenses, so it was structurally unable to see the first cut's
  // defect: that version ran the zero-pressure clause ABOVE the switch, so it answered for EVERY
  // lens — `lensGrade('water', {pressureKPa:0})` returned `bad` and the wreck washed 15 of 18
  // compartments red under a WATER label. The lenses the loop excludes are exactly where the
  // violation lived, so they are cells here. This module's header promises `water`/`power`/unknown
  // get NO fabricated reading; a vacuum does not change that.
  for (const lens of ['water', 'power', 'no-such-lens']) {
    const g = lensGrade(lens, ventedWarm);
    if (g !== null) {
      fails.push(`the ${lens} lens grades a vacuum \`${g}\` — this lens has no per-room reading on `
        + 'the `rooms` wire at all, so grading it is fabricating one (and on `water` the player sees '
        + 'the whole ship wash red under a WATER label)');
    }
  }
  // …and at the surface the caller actually paints through. `power` is excluded here on purpose: it
  // is derived from the slot's `active` flag by `lensSlotTint` itself and never reaches `lensGrade`.
  if (lensSlotTint('water', { atmos: ventedWarm }) !== null) fails.push('the WATER lens washes a vacuum on screen');
  if (lensSlotTint('no-such-lens', { atmos: ventedWarm }) !== null) fails.push('an unknown lens washes a vacuum on screen');
  // ⛔ AND THE CLAUSE MUST NOT FIRE ON A PARTIAL READING. `lensGrade('oxygen', {o2:.21})` is the
  // shape several callers and tests use; treating an ABSENT `pressureKPa` as zero pressure would
  // withdraw three lenses from every one of them.
  if (lensGrade('oxygen', { o2: 0.21 }) !== 'good') fails.push('an absent pressureKPa is being read as a vacuum');
  if (lensGrade('co2', { co2ppm: 400 }) !== 'good') fails.push('an absent pressureKPa is being read as a vacuum (co2)');
  // …and NaN is not a reading either.
  if (lensGrade('co2', { co2ppm: 400, pressureKPa: NaN }) !== 'bad') fails.push('a NaN pressure slipped past the guard');

  assert.deepEqual(fails, [], fails.join('\n'));
});

test('D4: an airless `rooms` row joins to its slot, so the compartment has an atmos at all', () => {
  // The host's own shape: a sealed hall at 0 kPa now ships a row. Before D4 there was none and
  // `deckSlotView` produced `atmos: null` — the same value it produces when the channel has not
  // arrived, which is why the two states were indistinguishable on screen.
  const rooms = decodeRooms(decode('{"type":"rooms","rooms":['
    + '["hall_d1_s0",1,0,0,0,271.4,60],'
    + '["cryobay",0,0.209,498,101.3,293,60]]}'));
  const decks = decodeDecks(decode('{"type":"decks","decks":['
    + '{"deck":1,"slots":[[0,1,1,4,4,"hall_d1_s0",0,true,false]]},'
    + '{"deck":0,"slots":[[0,1,1,4,4,"cryobay",3,true,true]]}]}'));
  const view = decksView(decks, rooms);
  const fails = [];

  const dead = view.find((d) => d.deck === 1).slots[0];
  if (!dead.atmos) fails.push('the airless slot still has a NULL atmos — the join dropped the row');
  else {
    if (dead.atmos.pressureKPa !== 0) fails.push('the airless slot reads ' + dead.atmos.pressureKPa + ' kPa');
    if (lensSlotTint('pressure', dead) !== GRADE_TINT.bad) fails.push('…and the lens still paints nothing over it');
  }
  const live = view.find((d) => d.deck === 0).slots[0];
  if (!live.atmos || live.atmos.pressureKPa !== 101.3) fails.push('the pressurised slot lost its atmos');

  // atmosByAnchor must not filter on gas either — it is the index the join reads.
  if (!atmosByAnchor(rooms).has('hall_d1_s0')) fails.push('atmosByAnchor dropped the airless anchor');
  // A slot whose anchor has no row is STILL null — `null` did not become impossible (a compartment
  // breached to space merges into the vacuum sink and the host still skips it, deliberately).
  if (deckSlotView({ anchorName: 'nowhere' }, atmosByAnchor(rooms)).atmos !== null) {
    fails.push('a slot with no matching row invented an atmosphere');
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ─────────────────────────────────────────────────────────── 3: the readout number

test('D4: fmtPressure prints one decimal, and prints it the same in every locale', () => {
  const fails = [];
  if (fmtPressure(0) !== '0.0 kPa') fails.push('0 kPa formatted as ' + fmtPressure(0));
  if (fmtPressure(101.34) !== '101.3 kPa') fails.push('101.34 formatted as ' + fmtPressure(101.34));
  // ONE DECIMAL is the point: a hall the crew have started filling is not the hall they vented, and
  // rounding to an integer erases the whole of that distinction.
  if (fmtPressure(0.4) === fmtPressure(0)) fails.push('0.4 kPa and 0.0 kPa print identically');
  // ⚠️ THE DEV MACHINE IS de-DE AND CULTURE BUGS ARE LIVE HERE. `toFixed` is specified to emit `.`
  // regardless of locale; `toLocaleString` is not. This asserts the property rather than the method.
  if (fmtPressure(101.3).includes(',')) fails.push('a locale decimal comma reached the readout');
  if (fmtPressure(undefined) !== '0.0 kPa' || fmtPressure(NaN) !== '0.0 kPa') fails.push('a missing reading throws or prints junk');
  assert.deepEqual(fails, [], fails.join('\n'));
});

// ─────────────────────────────────────────────────────────── 4: the offer names the hazard

test('D4: the PRIORITISE offer names the hazard and still offers the order', () => {
  const crew = [{ cid: 7 }];
  const fails = [];

  const lethal = prioritiseOffer({ dev: { kind: 8, serv: 1, air: 0 }, selCid: 7, crew });
  if (!lethal.ok) fails.push('the offer was WITHDRAWN. D4 is not a refusal and not a confirm dialog: '
    + 'rung 2 walks her in because the player said so, and rung 4 is why that means something');
  if (lethal.cid !== 7) fails.push('the hazard clause changed who the order goes to');
  if (!lethal.label.includes('NO AIR')) fails.push('the menu row does not say NO AIR: "' + lethal.label + '"');
  if (!lethal.label.includes('PRIORITISE: REPAIR')) fails.push('the hazard replaced the verb instead of annotating it');
  if (!lethal.hazard) fails.push('the hazard is not readable as its own field');

  const safe = prioritiseOffer({ dev: { kind: 8, serv: 1, air: 1 }, selCid: 7, crew });
  if (safe.hazard !== '') fails.push('a breathable worksite carries a hazard clause — a warning that is always on');
  if (safe.label.includes('NO AIR')) fails.push('…and it reached the label too');

  // ⛔ THE OLD-HOST CELL. An eight-element row decodes to `air: undefined`, which must mean "offer as
  // before" — a falsy test would stamp a death warning on every machine on the ship the moment a
  // host and a client fell out of step. Same rule `serv` states, with the stakes reversed.
  const oldHost = prioritiseOffer({ dev: { kind: 8, serv: 1 }, selCid: 7, crew });
  if (oldHost.hazard !== '' || !oldHost.ok) fails.push('an ABSENT air bit was read as a lethal worksite');

  // The M3-13 refusal still outranks it: a machine that is never serviced has no order to warn about.
  const neverServiced = prioritiseOffer({ dev: { kind: 8, serv: 0, air: 0 }, selCid: 7, crew });
  if (neverServiced.ok || neverServiced.label !== '') fails.push('a never-serviced machine now opens a menu');

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5 — ⭐ VR-P3: THE **ROOM ZOOM** SAYS IT TOO, and until the visual redesign it never did.
//
// ⚠️ THIS FILE HAD NO ROOM-ZOOM LEG AT ALL, and that is the gap being closed rather than a
// translation. Every section above is the LEVEL-1 surface: the pressure lens, the slot tint, the
// readout, the prioritise offer. D4's own finding was a direct order *into a hall that was still
// depressurising* — and the surface a player gives that order from, with the room filling the
// screen, had no vacuum treatment of any kind. A compartment with no air was drawn exactly like one
// with air, one altitude below the lens that was fixed.
//
// THE IDIOM IS INK, NOT A HUE (charter §1 ruling E3): the floor grid goes DASHED and the walls hold
// back, because a deck nobody can stand on is not really a room yet — and the stat line SAYS the
// words, because a treatment of the drawing alone is a cue the player has to be taught.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const { roomScene, roomCutawaySvg, roomStatLine } = await import('../src/ui/room-model.js');

test('D4 · VR-P3: the ROOM ZOOM draws an airless compartment differently — and says so', () => {
  const scene = roomScene({ deck: 0, rx: 0, ry: 0, rw: 8, rh: 5 });
  const fails = [];

  const air = roomCutawaySvg(scene, { vacuum: false });
  const vac = roomCutawaySvg(scene, { vacuum: true });
  if (vac === air) fails.push('the airless room is drawn IDENTICALLY to a pressurised one — this is '
    + 'D4 exactly, on the surface the order is given from');
  if (!/stroke-dasharray="3 4"/.test(vac)) fails.push('the airless floor grid is not dashed');
  // THE CONTROL that makes the leg above mean something: a PRESSURISED room must NOT wear it, or
  // "airless" is what every compartment on the ship looks like.
  if (/stroke-dasharray="3 4"/.test(air)) fails.push('a PRESSURISED room wears the airless grid');
  if (!/stroke-opacity/.test(vac)) fails.push('the airless walls are not held back');
  if (/stroke-opacity/.test(air)) fails.push('a pressurised room\'s walls are held back too');

  // AND THE WORDS. `fmtPressure` is the Overview's number; this surface has no readout (the M4
  // Persona gap), so the stat line is where the fact has to land.
  const said = roomStatLine({ areaM2: 40, placed: 0, pending: 0, here: 1, aboard: 3, vacuum: true });
  if (!/NO AIR/.test(said)) fails.push('the stat line does not say NO AIR');
  if (/NO AIR/.test(roomStatLine({ areaM2: 40, placed: 0, pending: 0, here: 1, aboard: 3 }))) {
    fails.push('EVERY room says NO AIR — the clause is unconditional and therefore says nothing');
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});
