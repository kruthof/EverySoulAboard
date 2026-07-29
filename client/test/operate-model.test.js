// THE OPERATE VERB — the door/vent OPEN⇄SHUT toggle on the Level-2 Room Zoom.
//
// WHAT WAS WRONG. `SetDeviceStateCommand`'s `IsOpen` toggle and `SetDoorStateCommand` have existed in
// the sim since M1, and the ONLY route to either from a browser was `GameSession.ContextAction`,
// reached by `Cmd.click` from the DEPRECATED console's invisible inspection cursor — a global
// `window` keydown that happens to survive the Overview takeover. Neither standard surface could
// target a door or a vent at all. `KNOWN_GAPS_SEALED` is `['dig','stockpile','strip']`, so the
// console-retirement guard never censused this verb and structurally cannot see that it is missing.
// On `--ship wreck` it is the premise's missing FIRST MOVE.
//
// ⚠️ THE SHAPE OF THIS FILE.
//   • The verb is DRIVEN through the shipping controller — mount, enter, arm, click — and asserted on
//     the commands it sends and the toast it shows. "Verb parity is NOT sufficient" is binding here
//     for the third time: an armed tool that sends nothing, or a reply that shows nothing, passes
//     every scan for the identifier.
//   • The C# ↔ JS enum mirror is PINNED BY DERIVATION, not by a comment: `sim/Sim.Core/Entities/
//     Device.cs` is parsed and `OPERABLE_KINDS` must agree with it BY NAME. That is the technique
//     `stock-filter-model.test.js` uses on `ItemStack.cs` and `palette.test.js` on `GlyphColor.cs`,
//     and it is the countermeasure for the hand-mirror defect that produced `ROLE_TO_ITEM`.
//   • Every source scan runs over `codeOnly` output (trap 1) with a negative control below.
//   • Each rejection leg runs in its own `test()` — `assert` throws, so a multi-leg test reports only
//     its first failing leg and a dead second leg is indistinguishable from a live one.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decode } from '../src/wire/messages.js';
import { decodeDecks, decodeRooms, decodeDevices, decodeOperate } from '../src/wire/messages.js';
import { Cmd } from '../src/wire/session.js';
import {
  U, ROOM_TOOLS, TOOL_LABEL, paletteCommand, isSweepTool,
  roomTileRect, roomDeviceConditions, roomOperableTiles, operateLayerSvg,
  OPERABLE_KINDS, isOperableKind,
} from '../src/ui/room-model.js';
import { decksView } from '../src/ui/decks-model.js';
import { codeOnly } from './code-only.js';
import { DocumentLite as DomDocument, Element as DomEl } from './dom-lite.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(here, '..');
const REPO = join(CLIENT, '..');
const read = (abs) => readFileSync(abs, 'utf8');

const DEVICE_CS = read(join(REPO, 'sim/Sim.Core/Entities/Device.cs'));
const GAME_SESSION_CS = codeOnly(read(join(REPO, 'hosts/web/GameSession.cs')));
const MAIN = codeOnly(read(join(CLIENT, 'src/main.js')));

// ═════════════════════════════════════════════ 1. THE C# ↔ JS ENUM MIRROR, DERIVED NOT TRANSCRIBED

/** Every `Name = N,` member of the `DeviceKind` enum in the sim's own source. */
function parseDeviceKinds(src) {
  const body = /enum DeviceKind : byte\s*\{([\s\S]*?)\n\s*\}/.exec(codeOnly(src));
  assert.ok(body, 'the DeviceKind enum could not be parsed out of sim/Sim.Core/Entities/Device.cs — '
    + 'this guard has rotted and every assertion below it is vacuous. FIX THE PARSE, do not delete '
    + 'the test: it is the only thing standing between the client\'s kind table and a silent renumber.');
  const out = {};
  for (const m of body[1].matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*(\d+)\s*,/gm)) out[m[1]] = Number(m[2]);
  return out;
}

test('the DeviceKind parse is NON-VACUOUS — it finds the whole enum, not a fragment', () => {
  const kinds = parseDeviceKinds(DEVICE_CS);
  // An INCLUSION floor, not a population count (trap 4): a matcher that found 3 members would
  // satisfy a `>= 2` and then agree with anything.
  assert.ok(Object.keys(kinds).length >= 20,
    `parsed only ${Object.keys(kinds).length} DeviceKind members — the regex is matching a fragment`);
  assert.equal(kinds.Door, 0, 'Door is the first member of DeviceKind');
  assert.equal(kinds.AirVent, 1);
  assert.equal(kinds.Scrubber, 2, 'a third member, so the parse is not just reading the first two');
  assert.ok('CryoPod' in kinds, 'the wreck start appended CryoPod — the parse must reach the tail');
});

// MUTATION: change `AirVent: 1` to `AirVent: 2` in room-model.js ⇒ this fails and names the member.
// MUTATION 2: insert a member above AirVent in Device.cs ⇒ same, from the other side.
test('OPERABLE_KINDS agrees with the sim enum BY NAME — a renumber cannot pass silently', () => {
  const kinds = parseDeviceKinds(DEVICE_CS);
  for (const [name, byte] of Object.entries(OPERABLE_KINDS)) {
    assert.ok(name in kinds,
      `room-model.js's OPERABLE_KINDS names '${name}', which is not a DeviceKind at all.`);
    assert.equal(byte, kinds[name],
      `OPERABLE_KINDS says ${name} = ${byte}; sim/Sim.Core/Entities/Device.cs says ${kinds[name]}.\n`
      + 'This table drives which tiles the OPERATE affordance chips. It is a HAND MIRROR of a C# '
      + 'enum, which is the defect that produced ROLE_TO_ITEM and MARK_FOR_FG — so it is pinned '
      + 'here rather than trusted. Fix the table; do not relax the assertion.');
  }
  assert.deepEqual(Object.keys(OPERABLE_KINDS).sort(), ['AirVent', 'Door'],
    'the operable set changed. It is derived from what the SIM reads Device.IsOpen for — nothing '
    + 'else reads the bit, so on any other kind SetDeviceStateCommand sets a flag that is never '
    + 'read. ⛔ CryoPod in particular must NOT be here: opening a pod is a THAW, gated on '
    + 'life-support headroom and priced in Parts through MOSS (wreck-start plan W5).');
});

// MUTATION: add `|| kind == DeviceKind.Scrubber` to GameSession.IsOperableKind ⇒ this fails.
test('the HOST and the CLIENT name the same operable kinds — the two halves of one decision', () => {
  const body = /internal static bool IsOperableKind\(DeviceKind kind\)\s*=>([^;]*);/.exec(GAME_SESSION_CS);
  assert.ok(body, 'GameSession.IsOperableKind could not be parsed. The HOST is the authority on '
    + 'whether a toggle is legal; the client table only decides which tiles get a chip. If they '
    + 'disagree, a chipped tile refuses and an unchipped one works.');
  const named = [...body[1].matchAll(/DeviceKind\.(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(named, Object.keys(OPERABLE_KINDS).sort(),
    `the host operates {${named}} and the client chips {${Object.keys(OPERABLE_KINDS).sort()}}`);
});

test('isOperableKind: the two members, and nothing else — inclusion floor first', () => {
  assert.equal(isOperableKind(0), true, 'inclusion floor: Door');
  assert.equal(isOperableKind(1), true, 'inclusion floor: AirVent');
  for (const k of [2, 8, 13, 16, 25, 26, 27, 99, -1, null, undefined, NaN]) {
    assert.equal(isOperableKind(k), false, `kind ${k} must not be operable`);
  }
});

// ═════════════════════════════════════════════════════════ 2. THE PALETTE ENTRY (pure)

test('OPERATE is on the palette, has a label, and is NOT a swept tool', () => {
  assert.ok(ROOM_TOOLS.includes('operate'),
    'ROOM_TOOLS lost OPERATE. It is not on the Overview either (that surface is deck-level and its '
    + 'click enters a room), so the verb would be unreachable on the whole standard surface — and '
    + 'surface-boundary.test.js asserts KNOWN_GAPS is EMPTY, so it cannot be ledgered as a gap.');
  assert.ok(TOOL_LABEL.operate, 'a tool with no label paints an empty button');
  assert.deepEqual(paletteCommand('operate'), { cls: 'operate', verb: 'operate' });
  assert.equal(isSweepTool('operate'), false,
    'OPERATE became a SWEPT tool. A drag across a compartment would then toggle every door in the '
    + 'rectangle — and toggle one twice wherever the rectangle overlapped itself.');
});

// ═════════════════════════════════════════════════════════ 3. THE ROOM FOLD + THE LAYER (pure)

const ROOM = { deck: 1, rx: 4, ry: 2, rw: 6, rh: 4 };
const devMsg = (cells) => ({ type: 'devices', cells });
const foldRoom = (cells) => roomDeviceConditions(decodeDevices(devMsg(cells)), ROOM);

test('roomOperableTiles keeps ONLY doors and vents, and carries their state', () => {
  const rows = roomOperableTiles(foldRoom([
    [4, 2, 1, 0, 255, 1, 0],   // Door, shut
    [5, 2, 1, 1, 38, 1, 1],    // AirVent, open
    [6, 2, 1, 13, 255, 1, 1],  // Fabricator — NOT operable, and its `open` bit is set
    [7, 2, 1, 27, 255, 1, 0],  // CryoPod — the one that must never become clickable here
  ]));
  assert.equal(rows.length, 2, 'exactly the door and the vent are operable');
  assert.deepEqual(rows.map((r) => r.name).sort(), ['AirVent', 'Door']);
  assert.equal(rows.find((r) => r.name === 'Door').open, 0);
  assert.equal(rows.find((r) => r.name === 'AirVent').open, 1);
});

test('roomOperableTiles is empty for an empty map, never a throw', () => {
  assert.deepEqual(roomOperableTiles(new Map()), []);
  assert.deepEqual(roomOperableTiles(null), []);
  assert.deepEqual(roomOperableTiles(undefined), []);
});

// MUTATION: make `operateLayerSvg` label everything 'OPEN' ⇒ the SHUT leg reddens.
test('operateLayerSvg labels each target with the state it is IN', () => {
  const svg = operateLayerSvg(roomOperableTiles(foldRoom([
    [4, 2, 1, 0, 255, 1, 0],
    [5, 2, 1, 1, 38, 1, 1],
  ])), ROOM, U);
  assert.ok(svg.includes('>SHUT<'), 'the shut door has no SHUT plate');
  assert.ok(svg.includes('>OPEN<'), 'the open vent has no OPEN plate');
  assert.equal((svg.match(/rz-operable/g) || []).length, 2, 'one group per target');
});

// MUTATION: drop the `dead` branch (always use the blue stroke) ⇒ this reddens.
test('operateLayerSvg tints an INOPERATIVE target red — the sim\'s own oper bit, not a threshold', () => {
  const live = operateLayerSvg(roomOperableTiles(foldRoom([[5, 2, 1, 1, 38, 1, 1]])), ROOM, U);
  const dead = operateLayerSvg(roomOperableTiles(foldRoom([[5, 2, 1, 1, 38, 0, 1]])), ROOM, U);
  assert.ok(live.includes('#7fb2e0'), 'a working target must not read as broken');
  assert.ok(!live.includes('#c25a3f'));
  assert.ok(dead.includes('#c25a3f'), 'an inoperative target must be visibly different');
  assert.ok(!dead.includes('#7fb2e0'));
});

test('operateLayerSvg draws NOTHING when the room holds no door or vent', () => {
  assert.equal(operateLayerSvg([], ROOM, U), '');
  assert.equal(operateLayerSvg(roomOperableTiles(foldRoom([[6, 2, 1, 13, 255, 1, 1]])), ROOM, U), '');
});

// ═════════════════════════════════════════════════════════ 4. THE WIRE COMMAND + THE REPLY (pure)

test('Cmd.operate carries x, y and deck — and no `on` flag', () => {
  assert.deepEqual(Cmd.operate(9, 4, 1), { cmd: 'operate', x: 9, y: 4, deck: 1 });
  assert.ok(!('on' in Cmd.operate(1, 1, 0)),
    'an explicit target state would let a stale client re-assert a state the crew or MOSS has since '
    + 'changed; the host reads the device\'s CURRENT state and decides.');
});

test('decodeOperate is tolerant and never throws', () => {
  assert.equal(decodeOperate(null), null);
  assert.equal(decodeOperate({ type: 'devices' }), null, 'the wrong message must not decode');
  assert.deepEqual(decodeOperate({ type: 'operate' }),
    { x: 0, y: 0, deck: 0, ok: false, state: '-', reason: '' },
    'a field-less reply must degrade to the inert shape, not to undefined fields');
  assert.deepEqual(
    decodeOperate({ type: 'operate', x: 3, y: 4, deck: 1, ok: 1, state: 'OPEN', reason: 'OPEN AIRVENT' }),
    { x: 3, y: 4, deck: 1, ok: true, state: 'OPEN', reason: 'OPEN AIRVENT' });
});

// MUTATION: delete the `case 'operate':` line from main.js ⇒ this fails, and
// tests/Perilune.Tests/SurfaceBoundaryTests.cs fails independently (every WireFormat channel must
// have a consumer in main.js, and its allowlist is empty).
test('main.js dispatches the `operate` reply, and straight to the Room Zoom', () => {
  assert.match(MAIN, /case 'operate':\s*roomZoom\.onOperateReply\(m\);/,
    'the operate reply has no consumer in main.js. It is routed to the Room Zoom rather than through '
    + 'hud.js on purpose: it has no state to cache, only that surface can send an `operate`, and a '
    + '`renderOperate`/`getOperate` pair would have to be added to SHIP_STATE_REACH — the pinned '
    + 'specification for WP-9\'s ship-state split.');
});

// ═════════════════════════════════════════════════════════ 5. THE VERB, DRIVEN

// The rig: dom-lite plus the four extras roomzoom-view.js needs (innerHTML, querySelector(All),
// closest, getBoundingClientRect). REBUILT here rather than imported from room-model.test.js, which
// is the house rule in this suite — two lanes editing one test module is the merge shape that has
// already broken this repo once.
const RZ_IDS = [
  'roomzoom-view', 'rz-canvas', 'rz-layers', 'rz-pulse', 'rz-zonekey', 'rz-toast', 'rz-nudge',
  'rz-caption', 'rz-breadcrumb', 'rz-palette', 'rz-matstrip', 'rz-accepts', 'rz-minimap',
  'crew-count', 'crewlist', 's-deck', 's-lens', 'legendcard',
  // `Hud.renderStatus` writes these console-shell nodes unconditionally — the paused-ship leg below
  // drives the REAL status dispatch (the only writer of `Hud.getStatus`, which `isPaused()` reads),
  // and without them the dispatch throws before it reaches the state this test is about.
  's-speed', 's-msg', 's-runstate', 's-pauselabel', 'b-pause', 's-speedchip', 's-nudge',
];
class RzEl extends DomEl {
  constructor(doc, tag) {
    super(doc, tag);
    this._html = ''; this._rect = { left: 0, top: 0, width: 0, height: 0 };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return this._rect; }
  closest(sel) {
    let n = this;
    while (n && n.nodeType === 1) {
      if (/^\[data-/.test(sel)) {
        const key = sel.replace(/^\[data-|\]$/g, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (n.dataset && n.dataset[key] !== undefined) return n;
      } else if (sel.startsWith('#')) {
        if (n._id === sel.slice(1)) return n;
      } else if (n.classList.contains(sel.replace(/^\./, ''))) return n;
      n = n.parentNode;
    }
    return null;
  }
}
class RzDoc extends DomDocument {
  constructor() { super(); this.body = new RzEl(this, 'body'); }
  createElement(tag) { return new RzEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

const opDoc = new RzDoc();
for (const id of RZ_IDS) { const e = new RzEl(opDoc, 'div'); e._id = id; opDoc.register(id, e); }
globalThis.document = opDoc;
const opWin = {};
globalThis.window = { addEventListener(t, fn) { (opWin[t] = opWin[t] || []).push(fn); }, removeEventListener() {} };

// Resolved AFTER the globals — both modules touch `document` at import time.
const Hud = await import('../src/ui/hud.js');
const RoomZoom = await import('../src/ui/roomzoom-view.js');

const DECKS_JSON =
  '{"type":"decks","decks":[{"deck":1,"slots":[[0,4,6,12,8,"quarters",5,true,true]]}]}';
const ROOMS_JSON = '{"type":"rooms","rooms":[["quarters",1,0.209,512,101.3,293,96]]}';
const RECT = roomTileRect(decksView(decodeDecks(decode(DECKS_JSON)), decodeRooms(decode(ROOMS_JSON))), 'quarters');

function floorFrame(deck, w = 24, h = 20) {
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [46, 0, 0, 0];
  return { type: 'frame', deck, w, h, lens: 'none', cells };
}

const opSent = [];
const opApi = RoomZoom.initRoomZoom({ send: (o) => opSent.push(o) });
Hud.renderDecks(decode(DECKS_JSON));
Hud.renderRooms(decode(ROOMS_JSON));
Hud.renderFrame(floorFrame(RECT.deck));

const VENT = [RECT.rx + 1, RECT.ry + 1];    // an AirVent, shut, healthy
const DOOR = [RECT.rx + 2, RECT.ry + 1];    // a Door, open
const BARE = [RECT.rx + 3, RECT.ry + 1];    // no device at all
const POD  = [RECT.rx + 4, RECT.ry + 1];    // a CryoPod — a device, and NOT operable

/** Push a `devices` payload through the REAL receive path, then force a synchronous repaint by
 *  re-entering the room (`scheduleRepaint` is rAF-coalesced and this rig has no rAF). */
function driveDevices(cells) {
  Hud.renderDevices(decode(JSON.stringify({ type: 'devices', cells })));
  opApi.exit();
  opApi.enter('quarters');
}

const opRoot = opDoc.getElementById('roomzoom-view');
const opCanvas = opDoc.getElementById('rz-canvas');
const opLayers = opDoc.getElementById('rz-layers');
const opToast = opDoc.getElementById('rz-toast');
opDoc.getElementById('rz-palette').parentNode = opRoot;
opLayers._rect = { left: 0, top: 0, width: RECT.rw * U, height: RECT.rh * U };

function fire(el, type, extra) {
  const e = {
    type, target: el, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
    ...(extra || {}),
  };
  let n = el;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) { fn(e); if (e.propagationStopped) return e; }
    n = n.parentNode;
  }
  return e;
}
const toolBtns = new Map();
/** Arm a tool the way a player does — a click on a `data-rztool` node, through the surface root's
 *  real delegated handler. Clicking the armed tool again disarms it. */
function arm(tool) {
  let b = toolBtns.get(tool);
  if (!b) {
    b = new RzEl(opDoc, 'button');
    b.dataset.rztool = tool;
    b.setAttribute('data-rztool', tool);
    opRoot.appendChild(b);
    toolBtns.set(tool, b);
  }
  fire(b, 'click', {});
}
const atTile = (tx, ty) => ({ clientX: (tx - RECT.rx) * U + U / 2, clientY: (ty - RECT.ry) * U + U / 2 });
function clickTile(tx, ty) { fire(opCanvas, 'click', atTile(tx, ty)); }

/** PER-TEST RESET — authoritative rather than a mirror of what a test thinks it armed. A failing
 *  assert throws before any trailing disarm, so without this one defect produces a cascade. */
afterEach(() => {
  opApi.exit();
  opApi.enter('quarters');
  opSent.length = 0;
});

driveDevices([
  [VENT[0], VENT[1], RECT.deck, 1, 200, 1, 0],   // AirVent, healthy, SHUT
  [DOOR[0], DOOR[1], RECT.deck, 0, 255, 1, 1],   // Door, pristine, OPEN
  [POD[0], POD[1], RECT.deck, 27, 255, 1, 0],    // CryoPod — present, and never operable
]);

test('the rig really drives the surface (non-vacuity floor for everything below)', () => {
  assert.ok(RECT && RECT.deck === 1, 'the room fixture did not resolve');
  assert.ok(opLayers.innerHTML.length > 0, 'the Room Zoom drew nothing — enter() did not repaint');
  assert.ok(RoomZoom.deviceConditionAt(VENT[0], VENT[1]),
    'the devices channel did not reach the surface — every driven leg below is vacuous');
});

// MUTATION: replace `_send(Cmd.operate(...))` in `doOperate` with `toast(...)` ⇒ this reddens.
// MUTATION 2: route the `operate` palette class through `orderPayloads` ⇒ a `dig` goes out instead.
test('clicking a VENT with OPERATE armed sends Cmd.operate for that tile and deck', () => {
  arm('operate');
  opSent.length = 0;
  clickTile(VENT[0], VENT[1]);
  const sent = opSent.filter((o) => o.cmd !== 'cursor');
  assert.deepEqual(sent, [{ cmd: 'operate', x: VENT[0], y: VENT[1], deck: RECT.deck }]);
});

test('clicking a DOOR with OPERATE armed sends Cmd.operate too — the same verb, both kinds', () => {
  arm('operate');
  opSent.length = 0;
  clickTile(DOOR[0], DOOR[1]);
  const sent = opSent.filter((o) => o.cmd !== 'cursor');
  assert.deepEqual(sent, [{ cmd: 'operate', x: DOOR[0], y: DOOR[1], deck: RECT.deck }]);
});

// MUTATION: delete the `if (!dev)` guard ⇒ a bare tile sends a command and the toast leg reddens.
test('clicking a BARE tile sends NOTHING and says so in words', () => {
  arm('operate');
  opSent.length = 0;
  clickTile(BARE[0], BARE[1]);
  assert.deepEqual(opSent.filter((o) => o.cmd !== 'cursor'), [],
    'a click with no device under it must not reach the wire');
  assert.match(opToast.textContent, /NOTHING KNOWN HERE TO OPEN OR SHUT/,
    'silence is exactly the failure this verb exists to remove — a click that does nothing and says '
    + 'nothing is indistinguishable from a broken button');
});

// ⚠️ THE WORD "KNOWN" IS LOAD-BEARING AND IT IS A SEND-BACK CORRECTION. This branch is reached by an
// EMPTY tile and by a FOGGED one — `GameSession.BuildDevices` gates the `devices` channel on
// `TileFlags.Explored`, so a device the player has not seen produces no row here either. The first
// draft said "NOTHING TO OPEN OR SHUT HERE", which is a confident lie on the second case, and it was
// LIVE: `vent_ls` (35,6,0) on `--ship wreck` is unexplored at tick 0, tick 600 and tick 36000, so
// this surface asserted the tile was empty while `HandleOperate` — then unfogged — would have opened
// the vent standing on it.
//
// MUTATION: restore the word-free spelling ⇒ this reddens.
test('the empty/fogged message speaks about KNOWLEDGE, not about emptiness', () => {
  arm('operate');
  clickTile(BARE[0], BARE[1]);
  assert.ok(!/NOTHING TO OPEN OR SHUT HERE/.test(opToast.textContent),
    'the message asserts the tile is EMPTY. It is also shown for a tile whose device is merely '
    + 'FOGGED, where that is false — the same confident-wrong-reason defect the CryoPod branch above '
    + 'exists to remove, pointing the other way.');
  assert.match(opToast.textContent, /KNOWN/);
});

// ⚠️ THIS LEG WAS WRITTEN BY A BROWSER RUN, and it is the opposite of what the first draft asserted.
// `doOperate` originally short-circuited on `isOperableKind` as well, so clicking one of the wreck's
// twelve CRYO CAPSULES answered "NOTHING TO OPEN OR SHUT HERE" — on a tile holding a two-metre coffin
// with a person in it. The refusal was right; the sentence was a lie, and the honest one
// ("CRYOPOD HAS NO OPEN/SHUT CONTROL") already existed on the host and could never reach a player.
// A non-operable DEVICE therefore goes to the wire and is named there.
//
// MUTATION: restore `|| !isOperableKind(dev.kind)` to the guard ⇒ nothing is sent and this reddens.
test('clicking a NON-OPERABLE device DOES reach the wire, so the host can name the kind', () => {
  arm('operate');
  opSent.length = 0;
  clickTile(POD[0], POD[1]);
  assert.deepEqual(opSent.filter((o) => o.cmd !== 'cursor'),
    [{ cmd: 'operate', x: POD[0], y: POD[1], deck: RECT.deck }],
    'a CryoPod click was answered locally. The host refuses it either way — the thaw gate is intact '
    + '— but only the host knows the kind NAME, so answering here costs the player the one useful '
    + 'sentence and creates a second authority on which kinds are operable.');
});

// MUTATION: `if (_armed === 'operate')` → `if (true)` in paintLayers ⇒ the disarmed leg reddens.
// MUTATION 2: drop the `wasOperate !== …` crossing check in `arm()` ⇒ the chips do not appear until
// the next wire repaint, and the ARMED leg reddens (this rig has no rAF and no wire traffic).
test('the OPEN/SHUT chips appear only while OPERATE is armed', () => {
  assert.ok(!opLayers.innerHTML.includes('rz-operate-layer'),
    'the chips are drawn with no tool armed — a text plate on every door in the game, permanently');
  arm('operate');
  assert.ok(opLayers.innerHTML.includes('rz-operate-layer'), 'arming OPERATE drew no chips');
  assert.ok(opLayers.innerHTML.includes('>SHUT<'), 'the shut vent has no SHUT plate');
  assert.ok(opLayers.innerHTML.includes('>OPEN<'), 'the open door has no OPEN plate');
  arm('operate');   // toggle off
  assert.ok(!opLayers.innerHTML.includes('rz-operate-layer'),
    'disarming left the chips on screen — a tool that is no longer armed still advertising targets');
});

// MUTATION: bind the hotkey to a different key ⇒ this reddens. It is a NEW binding and O is free in
// `client/src/input/controls.js` (which binds B/X/G/Z/V, P, M, WASD, Q/E and space).
test('[O] arms and disarms OPERATE, in the Room Zoom\'s own capture-phase listener', () => {
  const key = (k) => {
    const e = {
      key: k, target: undefined, defaultPrevented: false, propagationStopped: false,
      preventDefault() { e.defaultPrevented = true; }, stopPropagation() { e.propagationStopped = true; },
    };
    for (const fn of (opWin.keydown || []).slice()) fn(e);
    return e;
  };
  const e = key('o');
  assert.ok(e.propagationStopped && e.defaultPrevented,
    'the key must not fall through to the deprecated console, which is display:none behind us');
  assert.ok(opLayers.innerHTML.includes('rz-operate-layer'), '[O] did not arm OPERATE');
  key('O');   // upper case toggles the same slot
  assert.ok(!opLayers.innerHTML.includes('rz-operate-layer'), 'shift-O did not disarm');
});

// MUTATION: make `onOperateReply` toast a fixed string ⇒ the two legs disagree and this reddens.
// MUTATION 2: drop the `r.ok ? '⇄ ' : '⛔ '` prefix ⇒ the refusal leg reddens.
test('the host\'s verdict reaches the player VERBATIM — accepted and refused read differently', () => {
  opApi.onOperateReply({
    type: 'operate', x: 1, y: 1, deck: 1, ok: 1, state: 'OPEN',
    reason: 'OPEN AIRVENT · WRECKED (3%) — IT WILL DO NOTHING UNTIL IT IS REPAIRED',
  });
  assert.match(opToast.textContent, /WRECKED \(3%\)/,
    'the advisory did not reach the player. The four things that make a toggle look broken — LOCKED, '
    + 'INOPERATIVE, UNFIXABLE, UNPOWERED — are read host-side at the instant of the click; this '
    + 'surface has none of them and must not synthesise its own.');
  assert.ok(opToast.textContent.startsWith('⇄'), 'an ACCEPTED order must not read as a refusal');

  opApi.onOperateReply({ type: 'operate', x: 1, y: 1, deck: 1, ok: 0, state: '-', reason: 'DOOR IS LOCKED' });
  assert.match(opToast.textContent, /DOOR IS LOCKED/);
  assert.ok(opToast.textContent.startsWith('⛔'),
    'a REFUSAL must be legible as one at a glance — otherwise it reads as a successful toggle whose '
    + 'device simply did not move');
});

test('a malformed reply changes nothing rather than clearing the toast or throwing', () => {
  opApi.onOperateReply({ type: 'operate', x: 1, y: 1, deck: 1, ok: 1, state: 'OPEN', reason: 'FIRST' });
  const before = opToast.textContent;
  opApi.onOperateReply(null);
  opApi.onOperateReply({ type: 'devices', cells: [] });
  assert.equal(opToast.textContent, before);
});

// ═════════════════════════════════════════════════════════ 6. the scanners' own honesty

// The negative control for `codeOnly` (trap 1): a scan satisfied by a COMMENT is a scan that teaches
// people to delete explanatory comments. The fixture carries a LATER REAL COMMENT, which is the half
// this repo has shipped wrong twice — without it the naive stripper finds no match, returns its input
// unchanged, and the control passes whether the stripper works or not.
test('CONTROL: the source scans run over CODE ONLY, and a quoted token does not blind the stripper', () => {
  const line = codeOnly('const s = "// x";\n// dead\ncase \'operate\':');
  assert.ok(line.includes("case 'operate'"), "a quoted '//' blinded codeOnly to end of file");
  assert.ok(!line.includes('dead'), 'and the REAL comment after it must still be stripped');
  assert.ok(!codeOnly("// case 'operate': roomZoom.onOperateReply(m);\nconst a = 1;").includes('operate'),
    'a commented-out dispatch must NOT satisfy the main.js consumer scan');
});

test('the scanned sources are non-empty', () => {
  for (const [name, src] of Object.entries({ DEVICE_CS, GAME_SESSION_CS, MAIN })) {
    assert.ok(src.length > 200, name + ' stripped to nothing — every scan over it is vacuous');
  }
});

// ═════════════════════════════════════════════════════════ 7. THE PAUSED SHIP (send-back R3)

// ⚠️ WHY THIS EXISTS. `doOperate` originally SKIPPED `nudgeOnIntent()`, and its stated reason was
// false: *"an operate order is applied by the command drain itself … so it does land while the ship
// is on HOLD."* That conflates two drains. `GameSession.DrainCommands` — where `HandleOperate` runs —
// only ENQUEUES an `ISimCommand`; `Simulation.Tick` is the ONLY drain of `Simulation._inbox`, and at
// `tps == 0` the host never calls it. MEASURED on `--ship wreck`: a paused operate replies
// `⇄ SHUT DOOR`, and the door does not move.
//
// ⇒ OPERATE is not the exception to the nudge, it is the WORST case for it — the only verb on this
// palette that reports a confident SUCCESS while doing nothing.
//
// MUTATION: delete `nudgeOnIntent();` from `doOperate` ⇒ this reddens.
test('a paused operate raises the paused-ship nudge — it reports success and does nothing', () => {
  Hud.renderStatus(decode('{"type":"status","speed":0,"paused":true,"text":""}'));
  const nudge = opDoc.getElementById('rz-nudge');
  // ⚠️ ARM FIRST, THEN CLEAR, THEN CLICK — and the order is the whole test. `arm()` ALSO calls
  // `nudgeOnIntent()` (arming is an intent), so clearing before arming leaves the nudge raised by the
  // ARM and the CLICK's contribution invisible. Measured: with the clear before the arm, deleting
  // `nudgeOnIntent()` from `doOperate` was a SURVIVOR at 933/933 — a guard that could not bite,
  // hiding inside the very fix it was written for.
  arm('operate');
  nudge.hidden = true;
  clickTile(VENT[0], VENT[1]);
  assert.equal(nudge.hidden, false,
    'the ship is on HOLD, the verb answered "OPEN AIRVENT", and NOTHING WILL MOVE until it runs. '
    + 'Every other intent on this surface raises the nudge for a weaker reason — a queued order at '
    + 'least stays queued. This one lies.');
});

test('CONTROL: a RUNNING ship raises no nudge — the trigger is the pause, not the click', () => {
  Hud.renderStatus(decode('{"type":"status","speed":1,"paused":false,"text":""}'));
  const nudge = opDoc.getElementById('rz-nudge');
  arm('operate');
  nudge.hidden = true;
  clickTile(VENT[0], VENT[1]);
  assert.equal(nudge.hidden, true,
    'the nudge fired on a running ship — it would then be permanent chrome rather than an answer to '
    + '"I did something and nothing happened"');
});
