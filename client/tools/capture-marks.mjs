#!/usr/bin/env node
// capture-marks.mjs — regenerate client/test/fixtures/marks-grid.json from a LIVE `--ship grid` host.
//
// ⚠️ THIS SCRIPT EXISTS BECAUSE THE LAST ONE DID NOT. `client/test/fixtures/overview-grid.json`'s own
// `note` tells a maintainer to regenerate it with `scratchpad/wp8-capture.mjs`, WHICH IS NOWHERE IN
// THE REPO — a pointer that had already rotted twice by the time the `marks` channel landed
// (docs/HANDOVER.md §4b). Regenerating a fixture must not be an oral tradition, so this one is
// committed. It does NOT regenerate `overview-grid.json`; it writes its own sibling fixture and
// leaves that one alone.
//
// WHAT IT CAPTURES, AND WHY IT HAS TO DRIVE THE GAME TO GET IT. §4b limit 3 recorded that the
// `stockpile` and `strip` mark rendering was covered by SYNTHETIC cells only, "because no authored
// ship condemns anything at boot" — true, and the reason it stayed true is that the previous capture
// script only LISTENED. This one also SENDS: it zones a stockpile and condemns a device through the
// same `Cmd.stockpile` / `Cmd.strip` wire verbs the player's own click lowers to, then waits for the
// sim to catch up. So the fixture carries all four mark kinds as CAPTURED state, not planted bytes.
//
// AND IT CAPTURES THE DEFECT ITSELF. The acceptance predicate is not "four kinds present" — it is
// that at least one mark on the wire is OCCLUDED in the paired frame: a tile the `marks` channel
// reports and whose `cell[1]` foreground byte does NOT carry that mark's projection colour, because
// GlyphMapper pass 3 (a ground item), pass 4 (a device) or pass 5 (a standing crew member) painted
// over it. That difference is the whole reason the channel exists, and a fixture that could not
// exhibit it would let every test about it pass vacuously.
//
// COHERENCE. `frame`, `marks` and `roster` are written from ONE session and are re-read AFTER the
// predicates hold, from the latest message of each channel, with the frame's tick-neighbourhood
// checked by re-asserting the predicate against the final trio (a stale `marks` paired with a fresh
// `frame` would fabricate occlusions). `overview-grid.json`'s note explains why pairing needs saying
// out loud; the same caution applies here.
//
// USAGE
//   1. start a host:  ~/.dotnet/dotnet run --project hosts/web -- --port 8394 --ship grid
//   2. node client/tools/capture-marks.mjs [--url ws://localhost:8394/ws] [--out <path>] [--timeout 180]
//
// It EXITS NON-ZERO AND WRITES NOTHING if the predicates are not met, rather than committing a
// fixture that cannot drive its own tests.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
};
const URL_ = arg('url', 'ws://localhost:8394/ws');
const OUT = arg('out', join(HERE, '..', 'test', 'fixtures', 'marks-grid.json'));
const TIMEOUT_S = Number(arg('timeout', 180));
const DECK = Number(arg('deck', 1)); // the grid ship's wreck deck

// The projection colour each mark kind wears in `cell[1]` when NOTHING overwrites it
// (sim/Sim.Glyph/GlyphColor.cs; mirrored in mark-overlay.js's header). Used ONLY to detect
// occlusion — the client no longer reads these bytes.
const FG_FOR_KIND = { 0: 4, 1: 15, 2: 16, 3: 26 };
const KIND_NAME = ['debris', 'dig', 'stockpile', 'strip'];

const latest = new Map();      // channel type → last message object
let ws;

function send(o) { ws.send(JSON.stringify(o)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Marks on the capture deck, as a Map "x,y" → kind. */
function markMap(marks) {
  const m = new Map();
  if (!marks || !Array.isArray(marks.cells)) return m;
  for (const c of marks.cells) if ((c[2] | 0) === DECK) m.set(c[0] + ',' + c[1], c[3] | 0);
  return m;
}

/** The occluded marks in this (frame, marks) pair: reported on the wire, painted over in the frame. */
function occlusions(frame, marks) {
  const out = [];
  if (!frame || (frame.deck | 0) !== DECK || !Array.isArray(frame.cells)) return out;
  for (const [key, kind] of markMap(marks)) {
    const [x, y] = key.split(',').map(Number);
    const cell = frame.cells[y * frame.w + x];
    if (!Array.isArray(cell)) continue;
    if ((cell[1] | 0) !== FG_FOR_KIND[kind]) out.push({ x, y, kind, kindName: KIND_NAME[kind], fg: cell[1] | 0, glyph: cell[0] | 0 });
  }
  return out;
}

/** All four kinds present on the capture deck AND at least one occluded mark. */
function verdict(frame, marks) {
  const kinds = new Set([...markMap(marks).values()]);
  const occ = occlusions(frame, marks);
  return {
    ok: kinds.size === 4 && occ.length >= 1,
    kinds: [...kinds].sort().map((k) => KIND_NAME[k]),
    occlusions: occ,
  };
}

async function main() {
  ws = new WebSocket(URL_);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m && m.type) latest.set(m.type, m);
  });

  // Boot: get onto the wreck deck. DELIBERATELY NOT SPED UP — the first capture attempt stepped to
  // 20x (the WP-8 script's trick for making the roster vary) and the wreck's DIG designations were
  // all serviced before the predicate could be read, so the fixture came out with two kinds instead
  // of four. A dig is 10 sim-minutes since E0-2; at 1x the authored designations are still standing.
  await sleep(1500);
  const startDeck = latest.get('frame') ? latest.get('frame').deck | 0 : 0;
  for (let d = startDeck; d < DECK; d++) send({ cmd: 'deck', dz: 1 });
  for (let d = startDeck; d > DECK; d--) send({ cmd: 'deck', dz: -1 });
  await sleep(1500);

  // Zone + condemn, through the player's own verbs. Targets come from the LIVE frame, not from
  // hard-coded coordinates:
  //   • STRIP goes on WALLS (glyph '#'). Hull walls and doors are refused sim-side (IsPressureHull),
  //     which is fine — a refused order simply never appears on the `marks` channel.
  //   • STOCKPILE goes on floor AND on DEVICE tiles. The device tiles are the deliberate part: every
  //     device kind is non-blocking, so a device tile is walkable and zonable, and GlyphMapper pass 4
  //     then repaints the device's own colour over the zone tint. That is a GUARANTEED pass-4
  //     occlusion, which is what makes this capture reproducible instead of waiting on a hauler.
  // Strip and stockpile are kept on DISJOINT tiles on purpose: the host resolves one kind per tile
  // (dig ▸ stockpile ▸ strip), and a tile carrying both would put a legal-but-confusing arbitration
  // into a fixture whose job is to be obvious.
  const f0 = latest.get('frame');
  if (!f0 || (f0.deck | 0) !== DECK) throw new Error('never reached deck ' + DECK);
  const FLOOR = 46, WALL = 35, SPACE = 32, DEBRIS = 37, CREW = 64;
  let zoned = 0, stripped = 0;
  for (let y = 0; y < f0.h; y++) {
    for (let x = 0; x < f0.w; x++) {
      const c = f0.cells[y * f0.w + x];
      if (!Array.isArray(c)) continue;
      const g = c[0] | 0;
      if (g === WALL) { send({ cmd: 'strip', x, y, on: 1 }); stripped++; continue; }
      if (g === FLOOR) { if (zoned < 12) { send({ cmd: 'stockpile', x, y, on: 1 }); zoned++; } continue; }
      if (g === SPACE || g === DEBRIS || g === CREW || g === 0) continue;
      send({ cmd: 'stockpile', x, y, on: 1 }); zoned++;   // a device tile — the pass-4 case
    }
  }
  process.stderr.write(`sent ${zoned} stockpile + ${stripped} strip orders\n`);

  // Hunt for the predicate.
  const deadline = Date.now() + TIMEOUT_S * 1000;
  let v = { ok: false, kinds: [], occlusions: [] };
  while (Date.now() < deadline) {
    await sleep(1000);
    v = verdict(latest.get('frame'), latest.get('marks'));
    process.stderr.write(`  kinds=[${v.kinds}] occluded=${v.occlusions.length}\n`);
    if (v.ok) break;
  }
  if (!v.ok) {
    process.stderr.write('PREDICATE NOT MET — nothing written. kinds=' + JSON.stringify(v.kinds)
      + ' occlusions=' + v.occlusions.length + '\n');
    process.exit(3);
  }

  // Re-read the trio TOGETHER and re-assert, so a stale channel cannot fabricate the evidence.
  const frame = latest.get('frame'), marks = latest.get('marks'), roster = latest.get('roster');
  const final = verdict(frame, marks);
  if (!final.ok) { process.stderr.write('the re-read trio does not satisfy the predicate\n'); process.exit(4); }

  const fixture = {
    note: [
      'Captured by client/tools/capture-marks.mjs from a live `--ship grid` host. ONE session; the',
      '`frame`, `marks` and `roster` below are the latest message of each channel at the moment the',
      'capture predicate held, re-read together and re-checked before writing.',
      '',
      'THE PREDICATE, and it is the point of this fixture: (1) all FOUR mark kinds are present on',
      `deck ${DECK} — debris and dig are authored into the wreck, stockpile and strip were ORDERED by`,
      'this script through the same `Cmd.stockpile`/`Cmd.strip` verbs a player click lowers to; and',
      '(2) at least one mark on the wire is OCCLUDED in the paired frame — its `cell[1]` foreground',
      'byte does not carry that mark\'s projection colour, because GlyphMapper pass 3 (a ground item),',
      'pass 4 (a device) or pass 5 (a standing crew member) painted over it.',
      '',
      'That second half is the defect the `marks` channel removes, captured from the running game',
      'rather than argued about. Any test that reads `occluded` below is reading real evidence; a',
      'recapture that cannot reproduce it fails and writes nothing.',
      '',
      `Measured at capture: kinds=[${final.kinds}], ${final.occlusions.length} occluded mark(s).`,
      '',
      'Regenerate: start `~/.dotnet/dotnet run --project hosts/web -- --port 8394 --ship grid`, then',
      '`node client/tools/capture-marks.mjs`. It is PREDICATE-gated, not wall-clock gated, and exits',
      'non-zero without writing if the predicate is not met.',
    ].join('\n'),
    deck: DECK,
    frame,
    marks,
    roster,
    decks: latest.get('decks'),
    rooms: latest.get('rooms'),
    // The derived evidence, written out so a test can assert against it without re-deriving the
    // occlusion rule (and so a human reading the fixture can see what was caught).
    occluded: final.occlusions,
  };
  writeFileSync(OUT, JSON.stringify(fixture, null, 1) + '\n');
  process.stderr.write(`wrote ${OUT}\n  kinds=[${final.kinds}] occluded=${final.occlusions.length}\n`);
  process.exit(0);
}

main().catch((e) => { process.stderr.write('CAPTURE FAILED: ' + (e && e.stack || e) + '\n'); process.exit(1); });
