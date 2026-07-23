// Tests for the parametric SVG PAWN generator (src/render/pawn-svg.js). No DOM, no GPU, no jsdom —
// the builders are pure string functions of crew data. Proves: both forms build non-empty SVG for
// every role; the look is deterministic per (cid,role) and distinct across the eight mock crew;
// unknown roles fall back without throwing; idPrefix keeps two pawns collision-free; and the
// non-negotiable amber rim-light + ground shadow are present.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pawnSprite, pawnChip, resolvePawnLook,
  SKIN_TONES, HAIR_TONES, MOCK_CREW,
} from '../src/render/pawn-svg.js';
import { ROLE_HUE, ROLE_FALLBACK, roleHue } from '../src/theme/warm-tokens.js';

const HEX = /^#[0-9a-f]{6}$/i;

/** Every `id="…"` in a fragment (the collision surface). */
function idsIn(svg) {
  return [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
}

// ---------------- both forms build non-empty SVG for every role ----------------

test('pawnSprite + pawnChip build non-empty SVG for every ROLE_HUE role', () => {
  for (const role of Object.keys(ROLE_HUE)) {
    for (const build of [pawnSprite, pawnChip]) {
      const svg = build({ role, cid: role });
      assert.equal(typeof svg, 'string');
      assert.ok(svg.startsWith('<g'), `${build.name}(${role}) is a <g> fragment`);
      assert.ok(svg.trimEnd().endsWith('</g>'), `${build.name}(${role}) closes its <g>`);
      // real anatomy, not an empty shell
      assert.ok((svg.match(/<rect/g) || []).length >= 8, `${build.name}(${role}) has body rects`);
      // the role's uniform hue actually reaches the fragment
      assert.ok(svg.includes(ROLE_HUE[role].uniform), `${build.name}(${role}) carries the role uniform`);
      assert.ok(svg.includes(ROLE_HUE[role].accent), `${build.name}(${role}) carries the role accent`);
    }
  }
});

test('the two forms carry the mock viewBox anatomy signatures', () => {
  const p = pawnSprite(MOCK_CREW[0]);
  // pawn is the tall in-world figure: shadow ellipse + boots + soles
  assert.ok(p.includes('<ellipse cx="8" cy="23"'), 'pawn ground-shadow ellipse');
  assert.ok(p.includes('fill="#2b2018"'), 'pawn boots');
  assert.ok(p.includes('fill="#16100b"'), 'pawn soles');

  const c = pawnChip(MOCK_CREW[0]);
  // chip is the bust in a well: two gradients, no ground-shadow ellipse, no boots
  assert.ok(c.includes('<radialGradient'), 'chip well/underglow gradients');
  assert.ok(!c.includes('<ellipse'), 'chip has no ground shadow (it is a bust)');
  assert.ok(!c.includes('#2b2018'), 'chip has no boots');
});

// ---------------- deterministic per (cid,role), distinct across the crew ----------------

test('resolvePawnLook is deterministic per (cid, role)', () => {
  for (const c of MOCK_CREW) {
    const a = resolvePawnLook(c);
    const b = resolvePawnLook({ cid: c.cid, role: c.role });
    assert.deepEqual(a, b, `${c.cid} resolves identically across calls`);
    // and the whole rendered fragment is byte-identical for the same soul
    assert.equal(pawnSprite(c), pawnSprite({ cid: c.cid, role: c.role }));
  }
});

test('resolvePawnLook fills every slot with a well-formed colour', () => {
  for (const c of MOCK_CREW) {
    const look = resolvePawnLook(c);
    for (const key of ['uniform', 'accent', 'hair', 'skin']) {
      assert.ok(HEX.test(look[key]), `${c.cid}.${key} = ${look[key]} is a hex`);
    }
    // hair/skin come from the warm palettes
    assert.ok(SKIN_TONES.includes(look.skin), `${c.cid} skin from the palette`);
    assert.ok(HAIR_TONES.includes(look.hair), `${c.cid} hair from the palette`);
  }
});

test('uniform + accent are the role hue; hair + skin are per-cid', () => {
  for (const c of MOCK_CREW) {
    const look = resolvePawnLook(c);
    const hue = roleHue(c.role);
    assert.equal(look.uniform, hue.uniform, `${c.cid} uniform = role hue`);
    assert.equal(look.accent, hue.accent, `${c.cid} accent = role accent`);
  }
});

test('the eight mock crew resolve to eight distinct looks', () => {
  const looks = MOCK_CREW.map((c) => JSON.stringify(resolvePawnLook(c)));
  assert.equal(new Set(looks).size, MOCK_CREW.length, 'all eight souls read distinct');
  // the rendered pawns are distinct too
  const pawns = new Set(MOCK_CREW.map((c) => pawnSprite(c)));
  assert.equal(pawns.size, MOCK_CREW.length, 'all eight in-world pawns render distinct');
});

test('explicit desc fields override the resolved look', () => {
  const look = resolvePawnLook({ role: 'reactor', cid: 'volkov',
    uniform: '#123456', accent: '#654321', hair: '#abcdef', skin: '#fedcba' });
  assert.equal(look.uniform, '#123456');
  assert.equal(look.accent, '#654321');
  assert.equal(look.hair, '#abcdef');
  assert.equal(look.skin, '#fedcba');
  // and the override reaches the SVG
  assert.ok(pawnSprite({ role: 'reactor', cid: 'volkov', uniform: '#123456' }).includes('#123456'));
});

// ---------------- unknown role falls back without throwing ----------------

test('an unknown role falls back to the neutral warm-grey, never throws', () => {
  for (const bad of [undefined, null, '', 'wizard', 42, {}, []]) {
    let look;
    assert.doesNotThrow(() => { look = resolvePawnLook({ role: bad, cid: 'x' }); });
    assert.equal(look.uniform, ROLE_FALLBACK.uniform, `fallback uniform for ${JSON.stringify(bad)}`);
    assert.equal(look.accent, ROLE_FALLBACK.accent, `fallback accent for ${JSON.stringify(bad)}`);
    assert.doesNotThrow(() => pawnSprite({ role: bad, cid: 'x' }));
    assert.doesNotThrow(() => pawnChip({ role: bad, cid: 'x' }));
  }
});

test('a wholly empty / absent descriptor never throws', () => {
  for (const bad of [undefined, null, {}]) {
    assert.doesNotThrow(() => pawnSprite(bad));
    assert.doesNotThrow(() => pawnChip(bad));
    assert.doesNotThrow(() => resolvePawnLook(bad));
  }
});

// ---------------- idPrefix keeps two pawns collision-free ----------------

test('two chips for different souls have disjoint gradient ids', () => {
  const a = pawnChip(MOCK_CREW[0]);
  const b = pawnChip(MOCK_CREW[1]);
  const ai = idsIn(a), bi = idsIn(b);
  assert.ok(ai.length >= 2 && bi.length >= 2, 'each chip declares its two gradients');
  for (const id of ai) assert.ok(!bi.includes(id), `id ${id} must not collide across souls`);
});

test('idPrefix namespaces the gradient ids explicitly', () => {
  const a = pawnChip({ role: 'reactor', cid: 'shared' }, { idPrefix: 'A1' });
  const b = pawnChip({ role: 'reactor', cid: 'shared' }, { idPrefix: 'B2' });
  // same soul, but the caller-supplied prefix keeps them collision-free on one canvas
  assert.ok(a.includes('id="A1-well"') && a.includes('url(#A1-well)'), 'prefix A1 applied + referenced');
  assert.ok(b.includes('id="B2-well"') && b.includes('url(#B2-well)'), 'prefix B2 applied + referenced');
  for (const id of idsIn(a)) assert.ok(!idsIn(b).includes(id), 'prefixed ids are disjoint');
});

test('pawnSprite declares no ids (trivially collision-free)', () => {
  assert.equal(idsIn(pawnSprite(MOCK_CREW[0])).length, 0);
});

// ---------------- the non-negotiable rim-light + ground shadow are present ----------------

test('the amber rim-light is present in both forms (WA-17, non-negotiable)', () => {
  assert.ok(pawnSprite(MOCK_CREW[0]).includes('fill="rgba(242,181,99,.4)"'), 'pawn rim-light');
  assert.ok(pawnChip(MOCK_CREW[0]).includes('fill="rgba(242,181,99,.4)"'), 'chip rim-light');
});

test('the in-world pawn carries the ground-shadow ellipse', () => {
  const p = pawnSprite(MOCK_CREW[0]);
  assert.ok(p.includes('<ellipse'), 'ground-shadow ellipse element');
  assert.ok(p.includes('fill="rgba(0,0,0,.35)"'), 'ground-shadow fill');
});

// ---------------- non-mutation ----------------

test('the builders never mutate their descriptor argument', () => {
  const desc = { role: 'helm', cid: 'ferreira' };
  const before = JSON.stringify(desc);
  pawnSprite(desc); pawnChip(desc); resolvePawnLook(desc);
  assert.equal(JSON.stringify(desc), before, 'descriptor is untouched');
});
