// Palette ↔ wire-enum contract. The frame ships RAW GlyphColor bytes (see palette.js header), so
// the client's `C` index map MUST match Perilune.Glyph.GlyphColor member-for-member, in order — a
// mismatch silently mis-tints every tile of the affected id. This parses the C# enum straight from
// source (the authority), so it self-updates when the enum grows and CATCHES A REORDER rather than
// re-asserting a hand-copied literal (the round-3 tautology trap: never recompute the subject).
//
// It also pins the E0-5 addition specifically: GlyphColor.Deconstruct must exist, sit at the same
// index in both, and carry a well-formed FG colour distinct from the sibling order-tool tints.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { C, FG } from '../src/render/palette.js';

const here = dirname(fileURLToPath(import.meta.url));

/** GlyphColor member names in enum order, straight from the sim's C# source. */
function glyphColorMembers() {
  const src = readFileSync(join(here, '../../sim/Sim.Glyph/GlyphColor.cs'), 'utf8');
  const body = src.slice(src.indexOf('{', src.indexOf('enum GlyphColor')) + 1);
  const members = [];
  let idx = 0;
  for (const line of body.split('\n')) {
    if (line.includes('}')) break; // end of the enum body
    // Match `Name` or `Name = 5`, optionally followed by a comment. Skip comment-only / blank lines.
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*(\d+))?\s*,/);
    if (!m) continue;
    if (m[2] !== undefined) idx = Number(m[2]); // an explicit `= N` re-anchors the running index
    members.push([m[1], idx]);
    idx += 1;
  }
  return members;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

test('palette C mirrors the GlyphColor enum member-for-member, in order', () => {
  const members = glyphColorMembers();
  // Sanity on the parse: the enum runs Unknown(0)..Deconstruct(26), so 27 members.
  assert.equal(members.length, 27, `parsed ${members.length} GlyphColor members, expected 27`);
  for (const [name, index] of members) {
    assert.ok(name in C, `palette C is missing GlyphColor.${name} (wire byte ${index})`);
    assert.equal(C[name], index, `palette C.${name} = ${C[name]} but the enum has it at ${index}`);
  }
  // No phantom ids beyond the enum — a stray C entry would shift nothing but signals drift.
  const names = new Set(members.map(([n]) => n));
  for (const key of Object.keys(C)) {
    assert.ok(names.has(key), `palette C has a phantom colour "${key}" absent from GlyphColor`);
  }
});

test('GlyphColor.Deconstruct (E0-5) exists with a well-formed FG distinct from dig/stockpile', () => {
  const members = glyphColorMembers();
  const decon = members.find(([n]) => n === 'Deconstruct');
  assert.ok(decon, 'GlyphColor.Deconstruct must exist in the sim enum');
  assert.equal(C.Deconstruct, decon[1], 'palette index must match the enum index');
  assert.ok(HEX.test(FG[C.Deconstruct]), `FG[Deconstruct] "${FG[C.Deconstruct]}" is not a #rrggbb hex`);
  // A condemned tile must not read as a dig or stockpile order — the three order tints are distinct.
  assert.notEqual(FG[C.Deconstruct], FG[C.Designate], 'strip must not share dig colour');
  assert.notEqual(FG[C.Deconstruct], FG[C.Stockpile], 'strip must not share stockpile colour');
});
