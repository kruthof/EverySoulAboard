#!/usr/bin/env node
// capture-wreck-decks.mjs — regenerate client/test/fixtures/decks-wreck.json from a LIVE
// `--ship wreck` host. M1-L ("every compartment IS a room; ＋ADD ROOM is deleted").
//
// ⚠️ WHY A NEW FIXTURE RATHER THAN A REGENERATED `overview-grid.json`. That fixture is a PRE-M1-L
// capture and eight test files read it. Its untyped slots carry the OLD wire shape —
// `occupied:false` with a BLANK anchorName — which is precisely the shape this package stops the
// host producing. Two consequences, and the second is the one that matters:
//   • it cannot exercise the new path at all (a blank anchor never hit-tests, never resolves through
//     `roomTileRect`, and so can never be shown to be enterable); and
//   • it is still VALUABLE exactly as it is — it is the tolerance case, an old/odd host talking to a
//     new client, and the naming rule has to keep working over it.
// So this script leaves it alone and writes its own sibling, the way `capture-marks.mjs` does.
//
// WHAT IT CAPTURES. The `decks` and `rooms` channels from `--ship wreck`, which together are the
// entire input to `decksView` — the client's per-deck view-model, and the thing every claim in
// `client/test/no-add-room.test.js` is made against.
//
// THE PREDICATE, and it is the point. The capture is REFUSED (exit non-zero, nothing written)
// unless the payload can actually carry the package's claim:
//   1. every deck-0 slot reports `occupied:true` with a NON-BLANK anchorName — the host change;
//   2. at least four deck-0 slots are UNTYPED (`roomType === 0`) — the compartments that used to
//      draw a blank ＋ADD ROOM box, i.e. the fixture is not silently capturing an all-typed ship;
//   3. `hall_d0_s1` and `hall_d0_s2` are among them — the two that hold `recycler_1` /
//      `machineshop_1` / `fabricator_1`, so the tests are anchored to the owner's own case rather
//      than to whichever slot happened to be untyped.
// A fixture that cannot exhibit those is one whose tests would pass vacuously.
//
// ⚠️ CHECK THE INSTRUMENT AGAINST A KNOWN-TRUE FACT. Predicate 3 is that check: `hall_d0_s1` and
// `hall_d0_s2` are named in `AuthoredShips.PeriluneWreck` (`sim/Sim.Gen/AuthoredShips.cs`, the
// "frontier" block), so if the capture is reading the wrong ship, the wrong deck, or a stale
// channel, that assertion fails rather than the script writing a confident, wrong fixture.
//
// USAGE
//   1. start a host:  ~/.dotnet/dotnet run --project hosts/web -- --port 8395 --ship wreck
//   2. node client/tools/capture-wreck-decks.mjs [--url ws://localhost:8395/ws] [--out <path>]

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
};
const URL_ = arg('url', 'ws://localhost:8395/ws');
const OUT = arg('out', join(HERE, '..', 'test', 'fixtures', 'decks-wreck.json'));
const TIMEOUT_S = Number(arg('timeout', 60));

// The two compartments the owner's report is about — see the instrument note above.
const MACHINERY_ANCHORS = ['hall_d0_s1', 'hall_d0_s2'];

const latest = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Slot tuple → named fields. POSITIONAL, matching WireFormat's contract, so a reorder is visible. */
function slotOf(t) {
  return { slotIndex: t[0] | 0, anchorName: String(t[5] ?? ''), roomType: t[6] | 0, occupied: !!t[7] };
}

function verdict(decks) {
  const d0 = decks && Array.isArray(decks.decks) ? decks.decks.find((d) => (d.deck | 0) === 0) : null;
  if (!d0 || !Array.isArray(d0.slots) || d0.slots.length === 0) {
    return { ok: false, why: 'no deck 0 with slots on the `decks` channel' };
  }
  const slots = d0.slots.map(slotOf);
  const unnamed = slots.filter((s) => !s.occupied || !s.anchorName);
  const untyped = slots.filter((s) => s.roomType === 0);
  const missing = MACHINERY_ANCHORS.filter((a) => !untyped.some((s) => s.anchorName === a));
  return {
    ok: unnamed.length === 0 && untyped.length >= 4 && missing.length === 0,
    why: unnamed.length ? `${unnamed.length} deck-0 slot(s) still unoccupied or unnamed`
      : untyped.length < 4 ? `only ${untyped.length} untyped deck-0 slots — expected >= 4`
        : missing.length ? `not untyped on this capture: ${missing.join(', ')} — WRONG SHIP OR STALE CHANNEL`
          : 'ok',
    slots,
    untyped: untyped.map((s) => s.anchorName),
  };
}

async function main() {
  const ws = new WebSocket(URL_);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m && m.type) latest.set(m.type, m);
  });

  const deadline = Date.now() + TIMEOUT_S * 1000;
  let v = { ok: false, why: 'no `decks` message yet' };
  while (Date.now() < deadline) {
    await sleep(1000);
    v = verdict(latest.get('decks'));
    process.stderr.write(`  ${v.ok ? 'OK' : 'waiting'}: ${v.why}\n`);
    if (v.ok) break;
  }
  if (!v.ok) {
    process.stderr.write('PREDICATE NOT MET — nothing written: ' + v.why + '\n');
    process.exit(3);
  }

  // Re-read the pair TOGETHER and re-assert, so a stale channel cannot fabricate the evidence
  // (`capture-marks.mjs` carries the same caution for the same reason).
  const decks = latest.get('decks'), rooms = latest.get('rooms');
  const final = verdict(decks);
  if (!final.ok) { process.stderr.write('the re-read pair does not satisfy the predicate\n'); process.exit(4); }

  writeFileSync(OUT, JSON.stringify({
    note: [
      'Captured by client/tools/capture-wreck-decks.mjs from a live `--ship wreck` host, AFTER M1-L',
      'removed the RoomType gate from GameSession.ResolveSlot. ONE session; `decks` and `rooms` are',
      'the latest message of each channel at the moment the capture predicate held, re-read together',
      'and re-checked before writing.',
      '',
      'THE PREDICATE: (1) every deck-0 slot reports occupied:true with a non-blank anchorName;',
      '(2) at least four deck-0 slots are UNTYPED (roomType 0) — the compartments that drew a blank',
      '＋ADD ROOM box before this package; and (3) hall_d0_s1 and hall_d0_s2 are among them, because',
      'those are the two holding recycler_1 / machineshop_1 / fabricator_1 (AuthoredShips, the',
      '"frontier" block). Predicate 3 is the INSTRUMENT CHECK: it fails loudly if the capture read',
      'the wrong ship, the wrong deck or a stale channel.',
      '',
      'DO NOT hand-edit. Re-capture with the tool above.',
    ],
    untypedDeck0: final.untyped,
    decks,
    rooms: rooms || null,
  }, null, 1) + '\n');
  process.stderr.write(`wrote ${OUT}\n  untyped deck-0 compartments: ${final.untyped.join(', ')}\n`);
  // EXPLICIT exit: `ws.close()` alone leaves the socket handle keeping the loop alive, and the first
  // run of this tool appeared to hang AFTER it had already written a correct fixture. A capture tool
  // that looks failed while having succeeded is its own small trap.
  ws.close();
  process.exit(0);
}

main().catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
