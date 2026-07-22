// RELATIONS view-model tests — the PURE derivations behind the RELATIONS web (relations-model.js):
// ring layout determinism, mutual-tier classification (incl. boundary values + missing direction),
// directed→undirected dedup + the draw gate, focused-line filtering, tag fallback, the two directed
// readout sections (ordering + secret propagation), and the signed formatter. No DOM, no wire.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  edgeObj, ringLayout, mutualTier, tierWord, drawnEdges, focusedLines, focusTag,
  regardRows, signed, TIER_CLOSE, TIER_WARM, TIER_HOSTILE, DRAW_MIN,
} from '../src/ui/relations-model.js';

// ---------------- edgeObj ----------------

test('edgeObj: normalizes a wire tuple and defaults', () => {
  assert.deepEqual(edgeObj([1, 2, 40, 1, 'note', true]),
    { from: 1, to: 2, opinion: 40, tier: 1, note: 'note', secret: true });
  // sparse tuple → opinion 0, note '', secret false
  assert.deepEqual(edgeObj([3, 4]),
    { from: 3, to: 4, opinion: 0, tier: 0, note: '', secret: false });
  // an object passes through
  const o = { from: 5, to: 6, opinion: -10, tier: 3, note: '', secret: false };
  assert.equal(edgeObj(o), o);
});

// ---------------- ring layout (determinism) ----------------

test('ringLayout: node 0 at the top, deterministic, clockwise', () => {
  const p = ringLayout(4, { cx: 50, cy: 50, rx: 40, ry: 40 });
  assert.equal(p.length, 4);
  // node 0 at top: x == cx, y == cy - ry
  assert.ok(Math.abs(p[0].x - 50) < 1e-9);
  assert.ok(Math.abs(p[0].y - 10) < 1e-9);
  // node 1 to the right (clockwise): x == cx + rx, y == cy
  assert.ok(Math.abs(p[1].x - 90) < 1e-9);
  assert.ok(Math.abs(p[1].y - 50) < 1e-9);
  // node 2 at bottom
  assert.ok(Math.abs(p[2].x - 50) < 1e-9);
  assert.ok(Math.abs(p[2].y - 90) < 1e-9);
  // deterministic: same inputs → same outputs
  assert.deepEqual(ringLayout(4, { cx: 50, cy: 50, rx: 40, ry: 40 }), p);
});

test('ringLayout: edge counts (0, 1, 2) and non-positive n', () => {
  assert.deepEqual(ringLayout(0, {}), []);
  assert.deepEqual(ringLayout(-3, {}), []);
  const one = ringLayout(1, { cx: 0, cy: 0, rx: 10, ry: 10 });
  assert.equal(one.length, 1);
  assert.ok(Math.abs(one[0].y + 10) < 1e-9); // single node at top
  const two = ringLayout(2, { cx: 0, cy: 0, rx: 10, ry: 10 });
  assert.ok(Math.abs(two[0].y + 10) < 1e-9); // top
  assert.ok(Math.abs(two[1].y - 10) < 1e-9); // bottom
});

// ---------------- mutual tier (boundaries + missing direction) ----------------

test('mutualTier: bands and exact boundaries', () => {
  assert.equal(mutualTier(65, 65), 'close');
  assert.equal(mutualTier(40, 62), 'close');           // avg 51 → close (Amara↔Priya)
  assert.equal(mutualTier(TIER_CLOSE, TIER_CLOSE), 'close');   // avg 45 inclusive
  assert.equal(mutualTier(44, 44), 'warm');            // just below close
  assert.equal(mutualTier(TIER_WARM, TIER_WARM), 'warm');     // avg 15 inclusive
  assert.equal(mutualTier(14, 14), 'neutral');         // just below warm
  assert.equal(mutualTier(0, 0), 'neutral');
  assert.equal(mutualTier(TIER_HOSTILE, TIER_HOSTILE), 'hostile'); // avg -15 inclusive
  assert.equal(mutualTier(-14, -14), 'neutral');       // just above hostile
  assert.equal(mutualTier(-40, -40), 'hostile');       // the reactor feud
});

test('mutualTier: a missing direction counts as 0', () => {
  assert.equal(mutualTier(40, undefined), 'warm');     // avg 20 → warm
  assert.equal(mutualTier(undefined, 40), 'warm');
  assert.equal(mutualTier(30, undefined), 'warm');     // avg 15 → warm (boundary)
  assert.equal(mutualTier(29, undefined), 'neutral');  // avg 14.5 → neutral
  assert.equal(mutualTier(28, undefined), 'neutral');  // avg 14 → neutral
  assert.equal(mutualTier(undefined, undefined), 'neutral');
});

test('tierWord: passthrough + fallback', () => {
  assert.equal(tierWord('close'), 'close');
  assert.equal(tierWord('hostile'), 'hostile');
  assert.equal(tierWord('bogus'), 'neutral');
});

// ---------------- dedup + draw gate ----------------

test('drawnEdges: two directed edges collapse to one line with both opinions', () => {
  const lines = drawnEdges([[1, 2, 25, 1, 'owes her', false], [2, 1, 32, 1, 'fond of him', false]]);
  assert.equal(lines.length, 1);
  const l = lines[0];
  assert.equal(l.a, 1); assert.equal(l.b, 2);      // keyed a<b
  assert.equal(l.aToB, 25); assert.equal(l.bToA, 32);
  assert.equal(l.noteAB, 'owes her'); assert.equal(l.noteBA, 'fond of him');
  assert.equal(l.tier, 'warm');                    // avg 28.5
  assert.equal(l.draw, true);
});

test('drawnEdges: secret is the OR of both directions', () => {
  const a = drawnEdges([[1, 2, 25, 1, '', true], [2, 1, 32, 1, '', false]]);
  assert.equal(a[0].secret, true);
  const b = drawnEdges([[1, 2, 25, 1, '', false], [2, 1, 32, 1, '', false]]);
  assert.equal(b[0].secret, false);
});

test('drawnEdges: draw gate — note OR |opinion|>=DRAW_MIN either way; pure-neutral stays hidden', () => {
  // a weak one-directional edge below the threshold, no note → draw false
  const weak = drawnEdges([[1, 2, DRAW_MIN - 1, 0, '', false]]);
  assert.equal(weak[0].draw, false);
  // exactly at the threshold → draw true
  const atRail = drawnEdges([[1, 2, DRAW_MIN, 0, '', false]]);
  assert.equal(atRail[0].draw, true);
  // a note forces draw even at opinion 0
  const noted = drawnEdges([[1, 2, 0, 0, 'a bond', false]]);
  assert.equal(noted[0].draw, true);
  // the reverse direction crossing the rail forces draw
  const rev = drawnEdges([[1, 2, 0, 0, '', false], [2, 1, -DRAW_MIN, 0, '', false]]);
  assert.equal(rev[0].draw, true);
});

test('drawnEdges: self-loops and null endpoints are dropped', () => {
  assert.deepEqual(drawnEdges([[1, 1, 50, 2, '', false]]), []);
  assert.deepEqual(drawnEdges([[null, 2, 50, 2, '', false]]), []);
  assert.deepEqual(drawnEdges(null), []);
});

// ---------------- focus + tag fallback ----------------

test('focusedLines + focusTag: prefers outgoing note, then incoming, then tier word', () => {
  const lines = drawnEdges([
    [1, 2, 40, 1, 'trusts them', false],
    [2, 1, 40, 1, 'stands beside', false],
    [1, 3, 12, 0, '', false],            // note-less, weak → tier fallback
    [3, 1, 12, 0, '', false],
  ]);
  const f1 = focusedLines(lines, 1);
  assert.equal(f1.length, 2);
  // focused on cid 1: line 1↔2 → its OUTGOING note ('trusts them')
  const l12 = f1.find((l) => (l.a === 1 && l.b === 2) || (l.a === 2 && l.b === 1));
  assert.equal(focusTag(l12, 1), 'TRUSTS THEM');
  // focused on cid 2 for the same line → the other direction's note
  assert.equal(focusTag(l12, 2), 'STANDS BESIDE');
  // note-less line 1↔3 → tier word fallback (avg 12 → neutral)
  const l13 = f1.find((l) => (l.a === 1 && l.b === 3) || (l.a === 3 && l.b === 1));
  assert.equal(focusTag(l13, 1), 'NEUTRAL');
});

test('focusTag: incoming-only note is used when outgoing is empty', () => {
  const lines = drawnEdges([[1, 2, 20, 1, '', false], [2, 1, 20, 1, 'looks up to them', false]]);
  const l = lines[0];
  assert.equal(focusTag(l, 1), 'LOOKS UP TO THEM'); // cid 1 has no outgoing note; incoming used
});

// ---------------- readout regard rows ----------------

test('regardRows: splits directions, sorts by |opinion| desc, carries notes', () => {
  const edges = [
    [1, 2, 40, 1, 'a', false],
    [1, 3, -50, 3, 'b', false],
    [1, 4, 10, 0, '', false],
    [5, 1, 47, 2, 'c', false],   // incoming
    [6, 1, -20, 3, '', false],   // incoming
  ];
  const { outgoing, incoming } = regardRows(edges, 1);
  assert.deepEqual(outgoing.map((r) => r.cid), [3, 2, 4]); // |−50|,|40|,|10|
  assert.deepEqual(outgoing.map((r) => r.opinion), [-50, 40, 10]);
  assert.equal(outgoing[0].note, 'b');
  assert.deepEqual(incoming.map((r) => r.cid), [5, 6]);    // |47|,|−20|
  assert.deepEqual(incoming.map((r) => r.opinion), [47, -20]);
});

test('regardRows: stable tie-break by cid asc on equal magnitude', () => {
  const edges = [[1, 9, 30, 1, '', false], [1, 4, 30, 1, '', false], [1, 7, -30, 3, '', false]];
  const { outgoing } = regardRows(edges, 1);
  assert.deepEqual(outgoing.map((r) => r.cid), [4, 7, 9]); // all |30|, then cid asc
});

// ---------------- signed ----------------

test('signed: explicit plus, minus passes through, zero has no sign', () => {
  assert.equal(signed(40), '+40');
  assert.equal(signed(-40), '-40');
  assert.equal(signed(0), '0');
  assert.equal(signed(undefined), '0');
});
