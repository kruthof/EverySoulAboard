// Warm-theme token tests — the PURE warm palette + material/role tables (src/theme/warm-tokens.js).
// No DOM, no GPU, no jsdom. Proves: the module imports cleanly; ROOM_MATERIAL covers EVERY member
// of the sim's RoomType enum (parsed live from the C# source, so it self-updates if the enum grows);
// every hex is well-formed and every colour non-empty; and the helpers return a deterministic
// fallback for unknown keys instead of throwing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  VOID, VOID_GRADIENT, HULL, TRIM_LIGHT, AMBER, STATUS, INK,
  ROLE_HUE, ROLE_FALLBACK, MATERIAL, ROOM_MATERIAL, ROOM_MATERIAL_FALLBACK, ROOM_TYPE,
  HUD_TOKEN, roomMaterial, roleHue,
} from '../src/theme/warm-tokens.js';

const here = dirname(fileURLToPath(import.meta.url));

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

// ---------------- module imports cleanly ----------------

test('the module imports and every table is a frozen object', () => {
  for (const t of [VOID, HULL, TRIM_LIGHT, AMBER, STATUS, INK, ROLE_HUE, ROLE_FALLBACK,
    MATERIAL, ROOM_MATERIAL, ROOM_TYPE, HUD_TOKEN]) {
    assert.equal(typeof t, 'object');
    assert.ok(Object.isFrozen(t), 'tables must be frozen');
  }
  assert.equal(typeof roomMaterial, 'function');
  assert.equal(typeof roleHue, 'function');
  assert.ok(nonEmpty(VOID_GRADIENT));
});

// ---------------- ROOM_MATERIAL covers EVERY RoomType member ----------------

test('ROOM_MATERIAL has a row for every RoomType enum member — no room left unfloored', () => {
  const members = roomTypeMembers();
  assert.equal(members.length, 17, 'expected 17 RoomType members (sanity on the parse)');
  for (const name of members) {
    assert.ok(name in ROOM_MATERIAL, `ROOM_MATERIAL is missing RoomType.${name}`);
    assert.ok(name in ROOM_TYPE, `ROOM_TYPE is missing RoomType.${name}`);
  }
  // and no phantom rows beyond the enum
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

// ---------------- all hexes well-formed / no empty colour ----------------

test('every ramp hex is a well-formed 6-digit hex', () => {
  for (const [k, v] of Object.entries(VOID))   assert.ok(isHex(v), `VOID.${k}`);
  for (const [k, v] of Object.entries(HULL))   assert.ok(isHex(v), `HULL.${k}`);
  for (const [k, v] of Object.entries(AMBER))  assert.ok(isHex(v), `AMBER.${k}`);
  for (const [k, v] of Object.entries(STATUS)) assert.ok(isHex(v), `STATUS.${k}`);
  for (const [k, v] of Object.entries(INK))    assert.ok(isHex(v), `INK.${k}`);
  for (const [k, v] of Object.entries(MATERIAL)) assert.ok(isHex(v.floor), `MATERIAL.${k}.floor`);
});

test('the amber accent ramp carries the exact bible §2.3 hexes', () => {
  assert.equal(AMBER.deep, '#cf7a33');
  assert.equal(AMBER.base, '#e8934a');
  assert.equal(AMBER.light, '#f2b563');
  assert.equal(AMBER.rust, '#b5652a');
});

test('the UI ink ramp carries the exact bible §2.6 hexes', () => {
  assert.equal(INK.bright, '#e8dcc9');
  assert.equal(INK.body, '#b3aa9c');
  assert.equal(INK.mute, '#8c8377');
  assert.equal(INK.faint, '#57503f');
});

test('TRIM_LIGHT and HUD_TOKEN carry non-empty, well-formed rgba values', () => {
  for (const k of ['min', 'base', 'max']) assert.ok(RGBA.test(TRIM_LIGHT[k]), `TRIM_LIGHT.${k}`);
  assert.ok(RGBA.test(HUD_TOKEN.background), 'hud bg');
  assert.ok(RGBA.test(HUD_TOKEN.borderColor), 'hud border color');
  assert.equal(HUD_TOKEN.background, 'rgba(18,14,10,.62)');
  assert.equal(HUD_TOKEN.blur, '10px');
  assert.ok(nonEmpty(HUD_TOKEN.shadow) && nonEmpty(HUD_TOKEN.fontFamily));
});

// ---------------- ROLE_HUE well-formed + covers the eight roles ----------------

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
  // exact anchors from the §8 table
  assert.equal(ROLE_HUE['life-support'].uniform, '#e8934a');
  assert.equal(ROLE_HUE.reactor.uniform, '#c14a32');
  assert.equal(ROLE_HUE.medic.uniform, '#e8dcc9');
});

// ---------------- helpers: deterministic fallback, never throw ----------------

test('roomMaterial resolves by name and by numeric enum id', () => {
  assert.equal(roomMaterial('Hydro').material, 'grow');
  assert.equal(roomMaterial('Medbay').material, 'cream');
  assert.equal(roomMaterial('Corridor').material, 'steel-tan');
  assert.equal(roomMaterial('Commons').material, 'wood');
  // numeric enum bytes (ROOM_TYPE) resolve to the same rows
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
  // fallback is a real, non-empty steel-tan row
  assert.equal(ROOM_MATERIAL_FALLBACK.material, 'steel-tan');
  assert.ok(isHex(ROOM_MATERIAL_FALLBACK.floor));
});

test('roleHue resolves stable ids AND free RoleNow phrases from AuthoredShips.cs', () => {
  assert.equal(roleHue('reactor'), ROLE_HUE.reactor);           // exact id
  assert.equal(roleHue('REACTOR'), ROLE_HUE.reactor);           // case-insensitive
  // the authored RoleNow phrases (sim/Sim.Gen/AuthoredShips.cs)
  assert.equal(roleHue('life-support lead'), ROLE_HUE['life-support']);
  assert.equal(roleHue('hydroponics apprentice'), ROLE_HUE.hydroponics);
  assert.equal(roleHue('reactor watch'), ROLE_HUE.reactor);
  assert.equal(roleHue('damage control'), ROLE_HUE['damage-control']);
  assert.equal(roleHue("ship's medic"), ROLE_HUE.medic);
  assert.equal(roleHue('helm watch'), ROLE_HUE.helm);
  assert.equal(roleHue('stores & logistics'), ROLE_HUE.stores);
  assert.equal(roleHue('comms & sensors'), ROLE_HUE.comms);
  // pre-raid phrasings still land sensibly
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
  const tables = { VOID, HULL, AMBER, STATUS, INK, TRIM_LIGHT };
  for (const [tname, t] of Object.entries(tables)) {
    for (const [k, v] of Object.entries(t)) assert.ok(nonEmpty(v), `${tname}.${k} empty`);
  }
  for (const [id, r] of Object.entries(ROLE_HUE)) {
    assert.ok(nonEmpty(r.uniform) && nonEmpty(r.accent), `ROLE_HUE.${id} empty`);
  }
});
