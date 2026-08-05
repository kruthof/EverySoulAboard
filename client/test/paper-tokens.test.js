// THEME TOKEN TESTS — the paper/ink/oxblood layer (src/theme/paper-tokens.js + paper.css) AND the
// retired warm layer it re-exports. No DOM, no GPU, no jsdom.
//
// This file is `warm-tokens.test.js` renamed at the VR-A split (2026-08-04). Every warm assertion
// it carried is still here, TRANSLATED not weakened: they now import through `paper-tokens.js`, so
// they also prove the re-export surface is complete. Seventeen modules still read the warm tables
// and this wave restyles nothing — a hole in the re-export would be a blank floor on every ship.
//
// ⭐ THE NEW LEG IS THE MIRROR. `paper.css` and `paper-tokens.js` state the same values twice, once
// for the DOM and once for the SVG builders, and NOTHING PINNED THAT PAIRING FOR THE WARM LAYER —
// `warm.css` and `warm-tokens.js` were free to drift for a year and there was no instrument that
// would have said so. The mirror test below walks `CSS_VAR`, resolves each name out of the real
// stylesheets, and compares value-for-value; a token that reaches one file and not the other is a
// red, in both directions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  // the paper layer
  PAPER, PLATE_SHADOW, INK, LINK, ATTEND, DIALECT, DIALECT_FALLBACK, HATCH, HALO, GHOST,
  GAUGE, TYPE, STROKE, CSS_VAR, dialect, strokeWeight,
  // the retired warm layer, reached through the re-export
  VOID, VOID_GRADIENT, HULL, TRIM_LIGHT, AMBER, STATUS, WARM_INK,
  ROLE_HUE, ROLE_FALLBACK, MATERIAL, ROOM_MATERIAL, ROOM_MATERIAL_FALLBACK, ROOM_TYPE,
  HUD_TOKEN, roomMaterial, roleHue,
} from '../src/theme/paper-tokens.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');

const HEX = /^#[0-9a-f]{6}$/i;
const RGBA = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
const isHex = (s) => typeof s === 'string' && HEX.test(s);
const isColor = (s) => typeof s === 'string' && (HEX.test(s) || RGBA.test(s));
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

/** Parse the RoomType member names straight from the sim's C# enum (the authority for coverage). */
function roomTypeMembers() {
  const src = readFileSync(join(here, '../../sim/Sim.Core/Rooms/RoomType.cs'), 'utf8');
  const body = src.slice(src.indexOf('{', src.indexOf('enum')) + 1);
  const members = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\d+\s*,/);
    if (m) members.push(m[1]);
  }
  return members;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE PAPER LAYER — charter §1, exact
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('every paper table is a frozen object and every helper is a function', () => {
  for (const t of [PAPER, INK, LINK, DIALECT, HATCH, HALO, GHOST, GAUGE, TYPE, STROKE, CSS_VAR]) {
    assert.equal(typeof t, 'object');
    assert.ok(Object.isFrozen(t), 'paper tables must be frozen');
  }
  for (const row of Object.values(DIALECT)) assert.ok(Object.isFrozen(row), 'dialect rows must be frozen');
  assert.equal(typeof dialect, 'function');
  assert.equal(typeof strokeWeight, 'function');
  assert.ok(nonEmpty(PLATE_SHADOW));
});

test('the PAPER grounds carry the exact charter §1 hexes', () => {
  assert.equal(PAPER.ground, '#E7E0D2');
  assert.equal(PAPER.plate, '#EBE4D1');
  assert.equal(PAPER.border, '#C6BBA2');
  assert.equal(PAPER.hairline, '#CFC3A9');
  assert.equal(PAPER.inset1, '#DED6C2');
  assert.equal(PAPER.inset2, '#DCD3BE');
  assert.equal(PAPER.inset3, '#E1D9C5');
});

test('the INK ramp carries the exact charter §1 hexes', () => {
  assert.equal(INK.ink, '#14120F');
  assert.equal(INK.serif, '#2E2A23');
  assert.equal(INK.prose, '#4E463A');
  assert.equal(INK.annot, '#3A342A');
  assert.equal(INK.micro, '#6B6252');
  assert.equal(INK.section, '#8A7F6C');
  assert.equal(INK.faintest, '#A79C86');
  assert.equal(INK.offline, '#8A8272');
});

test('there is exactly ONE accent, and it is oxblood', () => {
  assert.equal(ATTEND, '#7B2C22');
  // The charter's rule is "ONE accent". Any OTHER saturated hue in the paper tables would be a
  // second one arriving by the back door, so every colour these tables carry is either the accent,
  // one of the two link ambers, or a near-neutral paper/ink value. Measured, not asserted: a colour
  // counts as neutral when its channels span less than a third of the range.
  const spread = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(...c) - Math.min(...c);
  };
  // control: the accent itself is emphatically NOT neutral, so the threshold is discriminating
  assert.ok(spread(ATTEND) > 85, 'the accent must fail the neutrality test the others pass');
  const allowed = new Set([ATTEND, LINK.base, LINK.hover]);
  for (const table of [PAPER, INK]) {
    for (const [k, v] of Object.entries(table)) {
      if (!isHex(v) || allowed.has(v)) continue;
      assert.ok(spread(v) <= 85, `${k} = ${v} has a channel spread of ${spread(v)} — that is a hue, `
        + 'and the paper idiom allows exactly one (oxblood)');
    }
  }
});

test('every paper colour is a well-formed colour, and none is empty', () => {
  for (const [k, v] of Object.entries(PAPER)) assert.ok(isHex(v), `PAPER.${k} = ${v}`);
  for (const [k, v] of Object.entries(INK)) assert.ok(isHex(v), `INK.${k} = ${v}`);
  for (const [k, v] of Object.entries(LINK)) assert.ok(isHex(v), `LINK.${k} = ${v}`);
  assert.ok(isHex(ATTEND));
  assert.ok(isHex(HATCH.ink) && isHex(HATCH.ground));
  assert.ok(isHex(HALO.stroke) && isHex(GHOST.knockout));
  assert.ok(isHex(GAUGE.filled) && isColor(GAUGE.emptyRing));
  for (const [k, v] of Object.entries(DIALECT)) assert.ok(isHex(v.stroke), `DIALECT.${k}.stroke`);
});

// ---------------- the dash dialect (ruling E3) ----------------

test('the DASH DIALECT states every rule the charter §1 spells out', () => {
  // colour alone no longer distinguishes order / fault / rubble — the STROKE PATTERN carries it
  assert.deepEqual({ ...DIALECT.order }, { stroke: '#7B2C22', dash: '8 5' });
  assert.deepEqual({ ...DIALECT.attention }, { stroke: '#7B2C22', dash: null });
  assert.deepEqual({ ...DIALECT.unbuilt }, { stroke: '#14120F', dash: '6 5' });
  assert.deepEqual({ ...DIALECT.offline }, { stroke: '#8A8272', dash: null });
  assert.deepEqual({ ...DIALECT.cut }, { stroke: '#14120F', dash: '7 5' });
  // the two accented states are told apart by the DASH, not the hue — the whole point of E3
  assert.equal(DIALECT.order.stroke, DIALECT.attention.stroke);
  assert.notEqual(DIALECT.order.dash, DIALECT.attention.dash);
  // …as are the two ink states
  assert.equal(DIALECT.unbuilt.stroke, DIALECT.cut.stroke);
  assert.notEqual(DIALECT.unbuilt.dash, DIALECT.cut.dash);
  // every dash is a distinct pattern: two states drawn in ink would otherwise read the same
  const dashes = Object.values(DIALECT).map((r) => r.dash).filter(Boolean);
  assert.equal(new Set(dashes).size, dashes.length, 'two dialect states share a dasharray');
  // OFFLINE is an absence and never an alarm: it may not borrow the accent
  assert.notEqual(DIALECT.offline.stroke, ATTEND);
});

test('dialect() resolves ids case-insensitively and falls back deterministically, never throws', () => {
  assert.equal(dialect('order'), DIALECT.order);
  assert.equal(dialect('  ORDER '), DIALECT.order);
  assert.equal(dialect('unbuilt'), DIALECT.unbuilt);
  for (const bad of [undefined, null, '', 'amber', 42, {}, [], 3.5]) {
    let out;
    assert.doesNotThrow(() => { out = dialect(bad); });
    assert.equal(out, DIALECT_FALLBACK, `fallback for ${JSON.stringify(bad)}`);
  }
  // ⚠️ THE PROTOTYPE CHAIN. A bare `DIALECT[key] || FALLBACK` returns something TRUTHY for each of
  // these — `constructor` resolves to `Object` — so the helper would hand a caller a function where
  // it promised a `{stroke, dash}` row, and every `row.stroke` downstream would be `undefined`,
  // which paints nothing and throws nowhere.
  for (const proto of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    assert.equal(dialect(proto), DIALECT_FALLBACK, `dialect('${proto}') escaped through the prototype`);
  }
  assert.equal(DIALECT_FALLBACK.dash, null);
  assert.equal(DIALECT_FALLBACK.stroke, INK.ink);
});

test('strokeWeight clamps into the §1 mass band and never throws', () => {
  assert.equal(strokeWeight(0), STROKE.min);
  assert.equal(strokeWeight(1), STROKE.max);
  assert.equal(strokeWeight(0.5), 1.55);
  assert.equal(strokeWeight(-4), STROKE.min);          // clamped, not extrapolated
  assert.equal(strokeWeight(9), STROKE.max);
  for (const bad of [undefined, null, NaN, Infinity, 'heavy', {}]) {
    let out;
    assert.doesNotThrow(() => { out = strokeWeight(bad); });
    assert.ok(out >= STROKE.min && out <= STROKE.max, `${String(bad)} → ${out} left the band`);
  }
});

test('the measured constants match the design markup they were read off', () => {
  // <pattern id="fh" width=7 height=7 patternTransform="rotate(45)"> … stroke-width .7 opacity .28
  assert.deepEqual({ ...HATCH },
    { period: 7, angle: 45, ground: '#EBE4D1', ink: '#14120F', width: 0.7, opacity: 0.28 });
  // stroke="#EBE4D1" stroke-width="3.4" paint-order="stroke"
  assert.deepEqual({ ...HALO }, { stroke: '#EBE4D1', width: 3.4, paintOrder: 'stroke' });
  // the knockout pass measured on the design's own pawn: 1.4→4.4, 1.35→4.3, 1.2→4.2, 1.0→4.0
  assert.equal(GHOST.widen, 3.0);
  assert.equal(GHOST.knockout, PAPER.plate);
  // 8 cells on a ship gauge, 10 on MOSS load
  assert.deepEqual({ ...GAUGE },
    { filled: '#14120F', emptyRing: 'rgba(20,18,15,.4)', shipCells: 8, mossCells: 10 });
  // ruling E9 — Inter is NOT shipped, so neither stack may name it
  assert.ok(!/inter/i.test(TYPE.serif + TYPE.mono), 'ruling E9: Inter is not shipped');
  assert.match(TYPE.serif, /Instrument Serif/);
  assert.match(TYPE.mono, /Space Mono/);
});

test('both Instrument Serif subsets are actually committed, and Inter is not', () => {
  const fonts = readFileSync(join(CLIENT, 'styles/base.css'), 'utf8');
  for (const f of ['instrument-serif-latin-400-normal.woff2', 'instrument-serif-latin-ext-400-normal.woff2',
    'space-mono-400.woff2', 'space-mono-700.woff2']) {
    assert.ok(fonts.includes(f), `base.css never loads ${f}`);
    // the URL is relative to client/styles/, so the file has to be one directory UP — a stale
    // `assets/…` here 404s SILENTLY and every width pin in the MOSS suite drifts
    assert.ok(fonts.includes(`url('../assets/fonts/${f}')`), `${f} is not loaded from ../assets/fonts/`);
    assert.doesNotThrow(() => readFileSync(join(CLIENT, 'assets/fonts', f)),
      `client/assets/fonts/${f} is referenced but not committed`);
  }
  assert.ok(!/inter[-.]/i.test(fonts), 'ruling E9: no Inter face may be declared');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. ⭐ THE MIRROR — paper.css ≡ paper-tokens.js, value for value
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Every `--name: value` declared by the theme cascade, last declaration winning (as CSS does). */
function declaredVars() {
  const out = new Map();
  // base.css declares --font-mono/--font-serif; paper.css declares the paper layer and pulls the
  // retired warm.css in behind it. Same order the page links them in.
  for (const rel of ['styles/base.css', 'src/theme/paper.css']) {
    let css = readFileSync(join(CLIENT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    css = css.replace(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;?/g, (_a, ref) =>
      readFileSync(join(CLIENT, 'src/theme', ref), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' '));
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
      out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
    }
  }
  return out;
}

/** Read a dotted path out of the token module's frozen tables. */
const TABLES = { PAPER, INK, LINK, DIALECT, HATCH, HALO, GAUGE, TYPE, PLATE_SHADOW, ATTEND };
function jsValue(path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), TABLES);
}

test('⭐ every CSS_VAR row agrees value-for-value between paper-tokens.js and the stylesheets', () => {
  const vars = declaredVars();
  const rows = Object.entries(CSS_VAR);
  // NON-VACUITY BY INCLUSION: a mirror that walks an empty map, or reads a stylesheet it failed to
  // parse, passes for free.
  assert.ok(rows.length >= 25, `only ${rows.length} CSS_VAR rows — the mirror is barely reading anything`);
  assert.ok(vars.size >= 60, `only ${vars.size} custom properties parsed out of the cascade — the `
    + 'declaration scan is reading nothing, and every comparison below would be skipped');
  const fails = [];
  for (const [path, name] of rows) {
    const js = jsValue(path);
    if (js === undefined) { fails.push(`${path} is a CSS_VAR row with no such token in the JS tables`); continue; }
    if (!vars.has(name)) { fails.push(`${path} → ${name} is declared nowhere in the theme cascade`); continue; }
    const css = vars.get(name);
    const same = typeof js === 'number'
      ? Number(css) === js
      : String(js).replace(/\s+/g, ' ').toLowerCase() === css.toLowerCase();
    if (!same) fails.push(`${path}: JS "${js}" vs CSS ${name}: "${css}"`);
  }
  assert.deepEqual(fails, [], fails.join('\n'));
});

test('⭐ no paper token reaches the CSS without a CSS_VAR row — the mirror has no blind spot', () => {
  // The direction the mirror above cannot see: a `--paper-…`/`--ink-…`/`--attend`/`--dash-…`
  // declaration added to paper.css and never mapped is a token the JS half does not know exists,
  // and the walk would still be green.
  const own = readFileSync(join(CLIENT, 'src/theme/paper.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/@import[^;]+;/g, ' ');
  const declared = [...own.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]);
  assert.ok(declared.length >= 25, `paper.css declares only ${declared.length} tokens — is it being read?`);
  const mapped = new Set(Object.values(CSS_VAR));
  const orphans = declared.filter((d) => !mapped.has(d));
  assert.deepEqual(orphans, [], `paper.css declares tokens no CSS_VAR row mentions: ${orphans.join(', ')}`);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE RETIRED WARM LAYER — reached through the re-export, every assertion translated not dropped
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('the warm re-export is COMPLETE — every table the old module exported is still reachable', () => {
  for (const t of [VOID, HULL, TRIM_LIGHT, AMBER, STATUS, WARM_INK, ROLE_HUE, ROLE_FALLBACK,
    MATERIAL, ROOM_MATERIAL, ROOM_TYPE, HUD_TOKEN]) {
    assert.equal(typeof t, 'object');
    assert.ok(Object.isFrozen(t), 'tables must be frozen');
  }
  assert.equal(typeof roomMaterial, 'function');
  assert.equal(typeof roleHue, 'function');
  assert.ok(nonEmpty(VOID_GRADIENT));
});

test('the two layers do not shadow each other — warm INK arrives as WARM_INK', () => {
  // `INK` is the ONE name both layers claim, and they mean opposite things: paper's ink is black on
  // paper, warm's is cream on navy. A silent shadow here would have every retint reading the wrong
  // ramp and every other test still green.
  assert.equal(INK.ink, '#14120F');
  assert.equal(WARM_INK.bright, '#e8dcc9');
  assert.notEqual(INK.ink, WARM_INK.bright);
  assert.equal(INK.bright, undefined, 'the paper INK must not carry warm keys');
  assert.equal(WARM_INK.ink, undefined, 'the warm INK must not carry paper keys');
});

test('ROOM_MATERIAL has a row for every RoomType enum member — no room left unfloored', () => {
  const members = roomTypeMembers();
  assert.equal(members.length, 17, 'expected 17 RoomType members (sanity on the parse)');
  for (const name of members) {
    assert.ok(name in ROOM_MATERIAL, `ROOM_MATERIAL is missing RoomType.${name}`);
    assert.ok(name in ROOM_TYPE, `ROOM_TYPE is missing RoomType.${name}`);
  }
  for (const key of Object.keys(ROOM_MATERIAL)) {
    assert.ok(members.includes(key), `ROOM_MATERIAL has a phantom room "${key}" not in the enum`);
  }
});

test('every ROOM_MATERIAL row is well-formed (valid material + non-empty colours)', () => {
  const cats = new Set(['wood', 'grow', 'cream', 'steel-tan']);
  for (const [name, row] of Object.entries(ROOM_MATERIAL)) {
    assert.ok(cats.has(row.material), `${name}: material "${row.material}" not one of the four`);
    assert.ok(isHex(row.floor), `${name}: floor "${row.floor}" not a hex`);
    assert.ok(isColor(row.line), `${name}: line "${row.line}" not a colour`);
    assert.ok(isColor(row.trim), `${name}: trim "${row.trim}" not a colour`);
    assert.ok(isColor(row.label), `${name}: label "${row.label}" not a colour`);
    for (const v of Object.values(row)) assert.ok(nonEmpty(v), `${name}: empty value`);
  }
});

test('every warm ramp hex is a well-formed 6-digit hex', () => {
  for (const [k, v] of Object.entries(VOID))   assert.ok(isHex(v), `VOID.${k}`);
  for (const [k, v] of Object.entries(HULL))   assert.ok(isHex(v), `HULL.${k}`);
  for (const [k, v] of Object.entries(AMBER))  assert.ok(isHex(v), `AMBER.${k}`);
  for (const [k, v] of Object.entries(STATUS)) assert.ok(isHex(v), `STATUS.${k}`);
  for (const [k, v] of Object.entries(WARM_INK)) assert.ok(isHex(v), `WARM_INK.${k}`);
  for (const [k, v] of Object.entries(MATERIAL)) assert.ok(isHex(v.floor), `MATERIAL.${k}.floor`);
});

test('the amber accent ramp carries the exact bible §2.3 hexes', () => {
  assert.equal(AMBER.deep, '#cf7a33');
  assert.equal(AMBER.base, '#e8934a');
  assert.equal(AMBER.light, '#f2b563');
  assert.equal(AMBER.rust, '#b5652a');
});

test('the warm UI ink ramp carries the exact bible §2.6 hexes', () => {
  assert.equal(WARM_INK.bright, '#e8dcc9');
  assert.equal(WARM_INK.body, '#b3aa9c');
  assert.equal(WARM_INK.mute, '#8c8377');
  assert.equal(WARM_INK.faint, '#57503f');
});

test('TRIM_LIGHT and HUD_TOKEN carry non-empty, well-formed rgba values', () => {
  for (const k of ['min', 'base', 'max']) assert.ok(RGBA.test(TRIM_LIGHT[k]), `TRIM_LIGHT.${k}`);
  assert.ok(RGBA.test(HUD_TOKEN.background), 'hud bg');
  assert.ok(RGBA.test(HUD_TOKEN.borderColor), 'hud border color');
  assert.equal(HUD_TOKEN.background, 'rgba(18,14,10,.62)');
  assert.equal(HUD_TOKEN.blur, '10px');
  assert.ok(nonEmpty(HUD_TOKEN.shadow) && nonEmpty(HUD_TOKEN.fontFamily));
});

test('ROLE_HUE covers the eight §8 roles with well-formed uniform+accent hexes', () => {
  const ids = ['life-support', 'hydroponics', 'reactor', 'damage-control',
    'medic', 'helm', 'stores', 'comms'];
  for (const id of ids) {
    assert.ok(id in ROLE_HUE, `ROLE_HUE missing ${id}`);
    const r = ROLE_HUE[id];
    assert.ok(isHex(r.uniform), `${id}.uniform`);
    assert.ok(isHex(r.accent), `${id}.accent`);
    assert.ok(nonEmpty(r.label), `${id}.label`);
  }
  assert.equal(ROLE_HUE['life-support'].uniform, '#e8934a');
  assert.equal(ROLE_HUE.reactor.uniform, '#c14a32');
  assert.equal(ROLE_HUE.medic.uniform, '#e8dcc9');
});

test('roomMaterial resolves by name and by numeric enum id', () => {
  assert.equal(roomMaterial('Hydro').material, 'grow');
  assert.equal(roomMaterial('Medbay').material, 'cream');
  assert.equal(roomMaterial('Corridor').material, 'steel-tan');
  assert.equal(roomMaterial('Commons').material, 'wood');
  assert.equal(roomMaterial(ROOM_TYPE.Hydro), ROOM_MATERIAL.Hydro);
  assert.equal(roomMaterial(7), ROOM_MATERIAL.Hydro);
  assert.equal(roomMaterial(0), ROOM_MATERIAL.None);
});

test('roomMaterial returns the deterministic fallback for unknown keys, never throws', () => {
  for (const bad of [undefined, null, '', 'Galley', 999, -1, 3.5, {}, []]) {
    let out;
    assert.doesNotThrow(() => { out = roomMaterial(bad); });
    assert.equal(out, ROOM_MATERIAL_FALLBACK, `fallback for ${JSON.stringify(bad)}`);
  }
  assert.equal(ROOM_MATERIAL_FALLBACK.material, 'steel-tan');
  assert.ok(isHex(ROOM_MATERIAL_FALLBACK.floor));
});

test('roleHue resolves stable ids AND free RoleNow phrases from AuthoredShips.cs', () => {
  assert.equal(roleHue('reactor'), ROLE_HUE.reactor);
  assert.equal(roleHue('REACTOR'), ROLE_HUE.reactor);
  assert.equal(roleHue('life-support lead'), ROLE_HUE['life-support']);
  assert.equal(roleHue('hydroponics apprentice'), ROLE_HUE.hydroponics);
  assert.equal(roleHue('reactor watch'), ROLE_HUE.reactor);
  assert.equal(roleHue('damage control'), ROLE_HUE['damage-control']);
  assert.equal(roleHue("ship's medic"), ROLE_HUE.medic);
  assert.equal(roleHue('helm watch'), ROLE_HUE.helm);
  assert.equal(roleHue('stores & logistics'), ROLE_HUE.stores);
  assert.equal(roleHue('comms & sensors'), ROLE_HUE.comms);
  assert.equal(roleHue('navigator'), ROLE_HUE.helm);
  assert.equal(roleHue('quartermaster'), ROLE_HUE.stores);
});

test('roleHue returns the deterministic fallback for unknown roles, never throws', () => {
  for (const bad of [undefined, null, '', 'wizard', 42, {}, []]) {
    let out;
    assert.doesNotThrow(() => { out = roleHue(bad); });
    assert.equal(out, ROLE_FALLBACK, `fallback for ${JSON.stringify(bad)}`);
  }
  assert.ok(isHex(ROLE_FALLBACK.uniform) && isHex(ROLE_FALLBACK.accent));
});

test('no exported colour value anywhere is empty', () => {
  const tables = { VOID, HULL, AMBER, STATUS, WARM_INK, TRIM_LIGHT, PAPER, INK, LINK };
  for (const [tname, t] of Object.entries(tables)) {
    for (const [k, v] of Object.entries(t)) assert.ok(nonEmpty(v), `${tname}.${k} empty`);
  }
  for (const [id, r] of Object.entries(ROLE_HUE)) {
    assert.ok(nonEmpty(r.uniform) && nonEmpty(r.accent), `ROLE_HUE.${id} empty`);
  }
});
