// ⭐⭐ THE ORDER NAMES ITS PRICE — the CLIENT half, driven through the pure model the Room Zoom's
// right-click menu actually calls.
//
// WHAT WAS WRONG (T13 run, 2026-08-02): `--ship wreck` THEN booted with EXACTLY ONE `Parts` unit aboard,
// the player's first repair order eats it, and no surface says so. The commissioning chain that
// needed that Part is then quietly unwinnable and the player has no way to know which order did it.
// `invisible-feedback-is-FUNCTIONAL`. The sim answers a new question, the host puts a bare int on the
// `devices` channel, and this file pins the prose the client composes from it.
//
// EVERY MULTI-LEG TEST IS BLINDED (TRAPS, fifth shape): `assert` throws, so a dead second leg looks
// exactly like a live one. Legs collect into an array and one assertion reports them all.

import test from 'node:test';
import assert from 'node:assert/strict';

import { prioritiseOffer, spendClause } from '../src/ui/prioritise-model.js';
import { decodeDevices, SPEND_UNKNOWN, SPEND_NOTHING, ITEM_WORDS } from '../src/wire/messages.js';
import { roomDeviceConditions } from '../src/ui/room-model.js';

/** `ItemKind` bytes, from `sim/Sim.Core/Entities/ItemStack.cs`. */
const PARTS = 5, SEALS = 7, SWARF = 9;

const CREW = [{ cid: 7 }];
/** A serviceable Scrubber (`DeviceKind.Scrubber` = 2) in breathable air, priced as the caller says. */
const SCRUBBER = 2;
const dev = (spend) => ({ kind: SCRUBBER, serv: 1, air: 1, spend });

// ───────────────────────────────────────────────────── 1: the headline, and the tier-0 lie it kills

test('the offer names the consumable the order will spend — PARTS, then SEALS when the Parts are gone', () => {
  const fails = [];

  const parts = prioritiseOffer({ dev: dev(PARTS), selCid: 7, crew: CREW });
  if (!parts.ok) fails.push('the price clause WITHDREW the order. It is a clause, never a refusal.');
  if (parts.cid !== 7) fails.push('the price clause changed who the order goes to');
  if (parts.label !== 'PRIORITISE: REPAIR SCRUBBER · SPENDS 1 PARTS') {
    fails.push('the menu row reads: "' + parts.label + '"');
  }
  if (parts.spend !== 'SPENDS 1 PARTS') fails.push('the price is not readable as its own field');

  // ⛔ THE LEG THAT KILLS `WantedRepairConsumable`, WHICH IS TIER 0 UNCONDITIONALLY. On a Seals-only
  // ship the sim's fetch eats a SEAL and that property still answers PARTS. If this surface ever
  // read the badge's property instead of the wire's `spend`, this leg is the one that reddens.
  const seals = prioritiseOffer({ dev: dev(SEALS), selCid: 7, crew: CREW });
  if (seals.spend !== 'SPENDS 1 SEALS') fails.push('a Seals-only ship is priced as "' + seals.spend + '"');
  if (!seals.label.includes('SPENDS 1 SEALS')) fails.push('…and the clause did not reach the label');

  // ⭐ SWARF IS THE RUNG THIS CLIENT COULD NOT SPELL UNTIL THIS COMMIT. `ITEM_WORDS` had no entry for
  // 9, so `itemWords(9)` answered '' and the clause vanished silently on exactly the ship where the
  // price matters most — a salvage-only wreck with one service left in it.
  const swarf = prioritiseOffer({ dev: dev(SWARF), selCid: 7, crew: CREW });
  if (swarf.spend !== 'SPENDS 1 SWARF') fails.push('the salvage rung is priced as "' + swarf.spend + '"');

  // NON-VACUITY / INCLUSION CONTROL: the three legs above are three DIFFERENT sentences, so a
  // clause hard-wired to any one of them cannot pass all three.
  if (new Set([parts.spend, seals.spend, swarf.spend]).size !== 3) {
    fails.push('two of the three rungs produced the same sentence — the clause is not reading `spend`');
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ───────────────────────────────────────────────────── 2: the two silences, and the free repair

test('a FREE repair says so, and a price this client cannot name says NOTHING', () => {
  const fails = [];

  // The empty-handed jury-rig. Worth a sentence rather than a blank: "this one is free" is the
  // reason a player picks THIS machine first when the ship is down to its last unit.
  const free = prioritiseOffer({ dev: dev(SPEND_NOTHING), selCid: 7, crew: CREW });
  if (free.spend !== 'SPENDS NOTHING') fails.push('the free jury-rig is priced as "' + free.spend + '"');
  if (!free.label.includes('SPENDS NOTHING')) fails.push('…and it did not reach the label');
  if (free.label.includes('SPENDS 1')) fails.push('a free repair is advertised as costing a unit');

  // ⛔ THE SENTINEL IS A SILENCE, NOT A PRICE. It is what an older host's nine-element row decodes
  // to AND what the sim answers for a machine it would refuse a service to outright.
  const unknown = prioritiseOffer({ dev: dev(SPEND_UNKNOWN), selCid: 7, crew: CREW });
  if (unknown.spend !== '') fails.push('the sentinel produced a price: "' + unknown.spend + '"');
  if (unknown.label !== 'PRIORITISE: REPAIR SCRUBBER') {
    fails.push('the sentinel left something on the label: "' + unknown.label + '"');
  }
  if (!unknown.ok) fails.push('an unpriceable machine lost its order — silence is not a refusal');

  // ⛔ AND AN ABSENT FIELD IS THE SAME SILENCE — override-never-source (D4's own send-back lesson).
  // An older host that sends nine elements must mean "as before", and before this element existed
  // the offer named no price. A default of PARTS would have every short row confidently name the one
  // item the shipped wreck has exactly ONE of.
  const oldHost = prioritiseOffer({ dev: { kind: SCRUBBER, serv: 1, air: 1 }, selCid: 7, crew: CREW });
  if (oldHost.spend !== '' || !oldHost.ok) fails.push('an ABSENT spend element was read as a price');
  if (oldHost.label !== 'PRIORITISE: REPAIR SCRUBBER') {
    fails.push('an old host\'s row changed the menu row: "' + oldHost.label + '"');
  }

  // An `ItemKind` from a NEWER host that this client has never heard of: still a silence, never
  // `SPENDS 1 undefined`. `itemWords` answers '' for an unnameable byte and this must honour it.
  if (spendClause(3) !== '') fails.push('an unnameable ItemKind (Potato) produced a clause');
  if (spendClause(undefined) !== '' || spendClause(null) !== '' || spendClause(NaN) !== '') {
    fails.push('spendClause is not total over junk input');
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ───────────────────────────────────────────────────── 3: BOTH clauses, and their order

test('price AND hazard together: both are said, and the hazard keeps the end of the line', () => {
  const fails = [];

  // The T13 wreck's worst cell: the machine is in vacuum AND the order eats the ship's last Part.
  const both = prioritiseOffer({ dev: { kind: SCRUBBER, serv: 1, air: 0, spend: PARTS }, selCid: 7, crew: CREW });
  if (both.label !== 'PRIORITISE: REPAIR SCRUBBER · SPENDS 1 PARTS · NO AIR AT THE WORKSITE — SHE MAY DIE') {
    fails.push('the two-clause row reads: "' + both.label + '"');
  }
  if (both.spend !== 'SPENDS 1 PARTS' || !both.hazard) fails.push('one of the two clauses lost its own field');
  if (!both.ok || both.cid !== 7) fails.push('two clauses withdrew the order — neither is a refusal');

  // ⭐ THE ORDER IS A DECISION, NOT AN ACCIDENT: the hazard is life-and-death and the price is
  // arithmetic, so `SHE MAY DIE` keeps the position a reader's eye lands on last — the position it
  // held alone before this clause existed.
  if (both.label.indexOf('SPENDS') > both.label.indexOf('NO AIR')) {
    fails.push('the price was inserted AFTER the hazard, pushing SHE MAY DIE into the middle of a '
      + 'sentence about inventory');
  }

  // Each clause alone, so neither is only reachable in the pair.
  const priceOnly = prioritiseOffer({ dev: dev(PARTS), selCid: 7, crew: CREW });
  const hazardOnly = prioritiseOffer({ dev: { kind: SCRUBBER, serv: 1, air: 0, spend: SPEND_UNKNOWN }, selCid: 7, crew: CREW });
  if (priceOnly.label.includes('NO AIR')) fails.push('a breathable worksite got a hazard clause');
  if (hazardOnly.label.includes('SPENDS')) fails.push('an unpriceable machine got a price clause');
  if (hazardOnly.label !== 'PRIORITISE: REPAIR SCRUBBER · NO AIR AT THE WORKSITE — SHE MAY DIE') {
    fails.push('the hazard-only row is no longer what D4 shipped: "' + hazardOnly.label + '"');
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ───────────────────────────────────────────────────── 4: the refusals still outrank the price

test('a machine that is NEVER serviced is still refused, with no price on the refusal', () => {
  const fails = [];

  // M3-13's refusal ranks above everything: "there is nothing to order here" is the wrong place to
  // print what an order would cost.
  const capsule = prioritiseOffer({ dev: { kind: 27, serv: 0, air: 1, spend: PARTS }, selCid: 7, crew: CREW });
  if (capsule.ok) fails.push('a never-serviced machine now opens a menu');
  if (capsule.spend !== '' || capsule.label !== '') fails.push('the refusal carries a price');
  if (!capsule.reason.includes('NEVER SERVICED')) fails.push('the refusal lost its sentence');

  // …and so does "nobody to order". Same rule, the other refusal.
  const nobody = prioritiseOffer({ dev: dev(PARTS), selCid: null, crew: [{ cid: 1 }, { cid: 2 }] });
  if (nobody.ok || nobody.spend !== '') fails.push('the no-crew refusal carries a price');

  // A tile that is not a target at all stays SILENT, price or no price.
  const bare = prioritiseOffer({ dev: null, selCid: 7, crew: CREW });
  if (!bare.silent || bare.spend !== '') fails.push('bare floor is no longer silent');

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ───────────────────────────────────────────────────── 5: the wire carries it end to end

test('the price survives decodeDevices and roomDeviceConditions into the offer, driven', () => {
  const fails = [];
  const ROOM = { deck: 0, rx: 0, ry: 0, rw: 8, rh: 8 };

  // Two rows on one deck with DIFFERENT prices, so nothing constant can satisfy both — and the
  // second is the wreck-floor cell (Swarf), which is the only state in which the host's two
  // precomputed answers differ at all.
  const rows = decodeDevices({
    type: 'devices',
    cells: [[1, 1, 0, SCRUBBER, 200, 1, 0, 1, 1, PARTS],
            [2, 1, 0, SCRUBBER, 10, 0, 0, 1, 1, SWARF]],
  });
  if (rows[0].spend !== PARTS || rows[1].spend !== SWARF) fails.push('decodeDevices dropped the tenth element');

  const map = roomDeviceConditions(rows, ROOM);
  if (map.get('1,1').spend !== PARTS) fails.push('roomDeviceConditions dropped the price');
  if (map.get('2,1').spend !== SWARF) fails.push('…or hard-wired it to the first row\'s value');

  const offerA = prioritiseOffer({ dev: map.get('1,1'), selCid: 7, crew: CREW });
  const offerB = prioritiseOffer({ dev: map.get('2,1'), selCid: 7, crew: CREW });
  if (!offerA.label.includes('SPENDS 1 PARTS')) fails.push('row 1 priced as "' + offerA.spend + '"');
  if (!offerB.label.includes('SPENDS 1 SWARF')) fails.push('row 2 priced as "' + offerB.spend + '"');

  // A NINE-element row from an older host still decodes, and its price is the SILENCE.
  const [older] = decodeDevices({ type: 'devices', cells: [[1, 1, 0, SCRUBBER, 200, 1, 0, 1, 1]] });
  if (older.spend !== SPEND_UNKNOWN) fails.push('a nine-element row decoded to ' + older.spend);
  if (roomDeviceConditions([older], ROOM).get('1,1').spend !== SPEND_UNKNOWN) {
    fails.push('the fold invented a price for a short row');
  }

  assert.deepEqual(fails, [], fails.join('\n'));
});

// ───────────────────────────────────────────────────── 6: the vocabulary covers the whole ladder

test('every rung of the repair ladder has words on this side — Parts, Seals AND Swarf', () => {
  const fails = [];
  // The rungs are `MaintenanceSystem.RepairConsumableTier`: Parts ▸ Seals ▸ Swarf. `ITEM_WORDS` is
  // pinned EQUAL to `ThawGate.ItemWords` by `blocked-model.test.js` (which parses the C#), so this
  // leg is about COVERAGE — a rung missing from the table makes the clause vanish, silently.
  for (const [name, byte] of [['Parts', PARTS], ['Seals', SEALS], ['Swarf', SWARF]]) {
    if (!ITEM_WORDS[byte]) fails.push('ItemKind.' + name + ' (' + byte + ') has no words on this side');
    if (!spendClause(byte).startsWith('SPENDS 1 ')) fails.push('ItemKind.' + name + ' produces no clause');
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});
