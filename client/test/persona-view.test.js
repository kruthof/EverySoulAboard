// ⭐⭐ M4-2 — THE PERSONA WINDOW, DRIVEN.
//
// The milestone's exit gate (`docs/ROADMAP.md:25`) is a sentence about a WINDOW, so this file mounts
// the real module against the real `hud.js` caches and asserts what the window PAINTS — not what its
// source says. Every fixture below is fed in through the shipped `render*` seams (`renderRoster`,
// `renderWorkCaps`, `renderBlocked`, `renderRelations`, `renderDecks`, `renderRooms`), i.e. the same
// entry points the wire uses, so nothing here can be true of a window that stopped reading the wire.
//
// ⚠️ WHAT THIS RIG CANNOT SEE, stated rather than implied (`dossier-honesty.test.js`'s own note, and
// for the same reason): `dom-lite` computes no styles and lays nothing out. "The window is VISIBLE
// over the Room Zoom" is a LIVE-PIXEL question, and it is the charter's mutation 4 — *"a CSS
// `display:none` is invisible to every DOM-presence test"*. It is answered TWICE below by other
// means: a CASCADE assertion over the real stylesheet text with a planted-hide-rule control, and, in
// Chrome, by `client/tools/persona-shot.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DocumentLite, Element, fire } from './dom-lite.js';
import { codeOnly } from './code-only.js';
import { stylesSource } from './styles-source.js';

// ── the harness ──────────────────────────────────────────────────────────────────────────────
// `document` must exist before persona-view.js / hud.js are imported: both resolve DOM at load.
// ⚠️ `dom-lite`'s Element has no `querySelector`. `hud.js`'s CREW WATCH renderer calls it on the
// console chrome this rig does not model, so the two lookups are stubbed to their honest empty
// answers — this file asserts on the Persona window's own nodes, which are built with
// `createElement`/`appendChild` precisely so they CAN be walked. The same shape `zoom-pawn.test.js`
// uses, for the same reason.
class PvEl extends Element {
  querySelector() { return null; }
  querySelectorAll() { return []; }
  insertBefore(el) { return this.appendChild(el); }
  get firstElementChild() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
}
class PvDoc extends DocumentLite {
  constructor() { super(); this.body = new PvEl(this, 'body'); }
  createElement(tag) { return new PvEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

const doc = new PvDoc();
// The console ids `hud.js`'s roster/frame dispatch writes through. Registered for the same reason
// the sibling rigs register them (`zoom-pawn.test.js`, `overview-*.test.js`): `renderRoster` and
// `renderFrame` ARE the real receive path, and this rig drives the window through the wire rather
// than by hand. They are console CHROME and nothing here asserts on them.
for (const id of ['persona', 'crew-count', 'crewlist', 'crewtable', 'crew-more', 's-deck', 's-lens',
  'legendcard', 'ro-body', 'b-talk', 'b-move', 'b-bio', 'inspect', 'hint']) {
  doc.register(id, doc.body.appendChild(new PvEl(doc, 'div')));
}
globalThis.document = doc;
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const Hud = await import('../src/ui/hud.js');
const Persona = await import('../src/ui/persona-view.js');

const root = doc.getElementById('persona');

// One deck with one bound room, so "where she is" has something true to say. The tuples are the
// SHIPPED wire shapes (`decodeSlot`: [slotIndex,x,y,w,h,anchorName,roomType,occupied,active];
// `decodeRoom`: [anchorName,deck,o2,co2ppm,kPa,K,tiles]) — a hand-built object would let this rig
// pass against a window that had stopped reading the real channel.
const DECKS = { type: 'decks', decks: [{ deck: 0, slots: [[0, 4, 4, 8, 6, 'quarters', 5, true, true]] }] };
const ROOMS = { type: 'rooms', rooms: [['quarters', 0, 0.2, 400, 101.3, 293, 48]] };

// ⭐ THE TASK LABEL IS THE REAL SHAPE AND THE REASON IS MEASURED: `hosts/web/GameSession.TaskLabel`
// composes verb + object + tile + `· NO AIR` + M2-6's ranking clause, and BOTH crew docks clip it
// (`.ov-crewtask` 26 chars / `.rz-crewtask` 22 chars, MECHANICS.md:3151). This one is 96 characters —
// four times the Room Zoom dock's budget — which is what makes the equality assertion below mean
// something.
const LONG_TASK = 'Repairing conduit at (17,3) · NO AIR — chosen over hauling because it is closer to her';

const RELL = {
  cid: 7, name: 'Rell Okonkwo', role: 'ENGINEER', mood: '', morale: 1,
  task: LONG_TASK, portrait: '', deck: 0, x: 6, y: 6, traits: ['stoic', 'unbending'],
};
const OZAWA = {
  cid: 9, name: 'Kenji Ozawa', role: 'MEDIC', mood: '', morale: 1,
  task: 'idle', portrait: '', deck: 0, x: 20, y: 2, traits: [],
};

/** WorkType order is REPAIR, BUILD, CRAFT, STRIP, MINE, HAUL (overview-model.js WORK_COLUMNS). */
const CAP_ROW = (cid, skills, mask) => [cid, ...skills, mask];

function feed(over) {
  Hud.renderDecks(DECKS);
  Hud.renderRooms(ROOMS);
  Hud.renderRoster({ type: 'roster', crew: (over && over.crew) || [RELL, OZAWA] });
  Hud.renderWorkCaps({
    type: 'workcaps',
    cells: (over && over.caps) || [CAP_ROW(7, [4, 0, 0, 0, 0, 2], 0), CAP_ROW(9, [0, 0, 0, 0, 0, 0], 1 << 1)],
  });
  Hud.renderBlocked({ type: 'blocked', cells: (over && over.blocked) || [] });
  Hud.renderRelations({ type: 'relations', edges: (over && over.edges) || [] });
}

let mounted = null;
function open(cid, over) {
  if (!mounted) mounted = Persona.initPersona();
  feed(over);
  mounted.open(cid);
  return root;
}

/** Depth-first text of every element carrying `cls`, in document order. */
function textsOf(node, cls) {
  const out = [];
  const walk = (n) => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains(cls)) out.push(n.textContent);
    for (const c of n.childNodes) walk(c);
  };
  walk(node);
  return out;
}
/** Elements carrying `cls` that are not hidden, and whose ancestors are not hidden either. */
function shownOf(node, cls) {
  const out = [];
  const walk = (n, hid) => {
    if (n.nodeType !== 1) return;
    const h = hid || !!n.hidden;
    if (!h && n.classList.contains(cls)) out.push(n);
    for (const c of n.childNodes) walk(c, h);
  };
  walk(node, false);
  return out;
}
/** Everything the window painted, as one comparable value (tag, class, hidden, text, inline style). */
function snapshot(n) {
  const walk = (x) => (x.nodeType === 3
    ? { text: x.data }
    : {
      tag: x.tagName, cls: x.className, hidden: !!x.hidden, style: { ...x.style },
      kids: x.childNodes.map(walk),
    });
  return JSON.stringify(walk(n));
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE BANDS — the exit gate's four questions, in the exit gate's own order
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⛔ FOUR, NOT FIVE, AND PINNED BY EQUALITY IN BOTH DIRECTIONS.
//   · A band ADDED here is a surface growing without a decision.
//   · A band REMOVED is a clause of the gate sentence going unanswered.
//   · And the ABSENT one is the point: `HOW SHE IS` ships with, or after, the first mental break
//     (M4-1 DESIGN QUESTION (e); OD-S answered §10 item 1 = A, so that is package M4-9 at merge-order
//     position 4b, AFTER this one). Shipping the band early would be an adjective that changes no
//     decision — `TARGET.md:65`'s cosmetic-operator rule and OD-R's own amendment. ⭐ AND THE FIRST
//     CLAUSE IS NOT BUILDABLE EITHER, MEASURED: `Fatigue`/`Hunger`/`Thirst` reach NO client surface
//     (`grep -ri "hunger\|thirst\|fatigue" client/src` is empty), so "Exhausted and hungry" would
//     need a wire channel that does not exist — and M4-2's charter says STOP when that happens.
test('M4-2: the window paints FOUR bands, in the exit gate\'s own order, and HOW SHE IS is not one', () => {
  const w = open(7);
  assert.deepEqual(textsOf(w, 'pv-bandhd'),
    ['IDENTITY', 'DOING & WHY', 'CAN & CANNOT', 'TIES & HISTORY'],
    'the Persona window\'s band census moved. It is pinned by EQUALITY because the band ORDER is the '
    + 'exit-gate sentence\'s order ("who she is, what she\'s doing, why, how she is") and a reviewer '
    + 'checking the gate reads top to bottom. If you are adding HOW SHE IS, you are M4-9 and you must '
    + 'bring the behaviour it describes with you.');
  // Non-vacuity by INCLUSION: the scan is reading a live window, not an empty container.
  assert.equal(textsOf(w, 'pv-name')[0], 'Rell Okonkwo');
});

test('M4-2: IDENTITY says who she is — name, role, where she is, and her REAL traits', () => {
  const w = open(7);
  assert.equal(textsOf(w, 'pv-name')[0], 'Rell Okonkwo');
  assert.equal(textsOf(w, 'pv-role')[0], 'ENGINEER');
  // "where she is" is the SAME room join the Room Zoom's dock uses (`crewRoomSlot`), never a second
  // derivation — two surfaces that computed a room independently is the drift M2-6 already paid for.
  assert.equal(textsOf(w, 'pv-where')[0], 'DECK 0 · QUARTERS');
  assert.deepEqual(textsOf(w, 'pv-trait'), ['stoic', 'unbending']);
  // …and a crew member standing in a HALL says so rather than inventing a room.
  const w2 = open(9);
  assert.equal(textsOf(w2, 'pv-where')[0], 'DECK 0 · NO ROOM');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. ⭐ THE CHARTER'S MUTATION 7 — the task sentence is WHOLE
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// MUTATION: truncate the task in `paint` (a `slice`, an ellipsis, a `watchTask(...).what`) ⇒ RED.
// This is the reason the band exists: the label is composed with a verb, an object, a tile, a
// `· NO AIR` clause and M2-6's ranking clause, and it is CLIPPED on both crew docks. The window is
// the one surface where the whole sentence always fits, so the assertion is EQUALITY with the wire
// field — not "contains", not "starts with".
test('M4-2: DOING & WHY carries the WHOLE task sentence, byte-for-byte off the wire', () => {
  const w = open(7);
  const task = textsOf(w, 'pv-task')[0];
  assert.equal(task, LONG_TASK,
    'the Persona window is not showing the roster\'s `task` field verbatim. Both crew docks clip '
    + 'this label (26 and 22 characters, MECHANICS.md:3151) and the Overview readout only holds it '
    + 'by wrapping in 264 px; this window exists so the sentence — including M2-6\'s ranking clause, '
    + 'which is the answer to "why" — is readable in full somewhere.');
  // Non-vacuity: the fixture really is longer than the widest dock, so the equality is a claim.
  assert.ok(LONG_TASK.length > 26 * 2, 'the fixture label is too short to catch a truncation');
});

// MUTATION: drop the `crewBlockedOrder` join ⇒ RED. MUTATION: join on the WRONG cid ⇒ RED (Ozawa's
// window would show Rell's stuck order). The `blocked` channel is the ONLY route to this fact —
// `CanStageWorkerAt` is a live predicate the sim asks and discards, leaving no trace on any tile.
test('M4-2: DOING & WHY says WHY the order is stuck — for HER, and only for her', () => {
  // [x, y, deck, order, reason, detail, cid] — the shipped `blocked` tuple.
  const blocked = [[17, 3, 0, 0, 3, 0, 7]];
  const w = open(7, { blocked });
  const stuck = shownOf(w, 'pv-stuck').map((n) => n.textContent);
  assert.equal(stuck.length, 1, 'the stuck-order line is not shown for a crew member whose order IS stuck');
  assert.match(stuck[0], /^ORDER STUCK — /);

  // The same channel, the OTHER crew member: her window must say nothing, and the line must be
  // HIDDEN rather than blanked, so the band does not keep an empty row where a fault used to be.
  const w2 = open(9, { blocked });
  assert.deepEqual(shownOf(w2, 'pv-stuck'), [],
    'a crew member with no stuck order is being shown one — the join is not on the cid');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. CAN & CANNOT — RW§1.6 + §6.1's own surface, and the structure IS the statement
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⛔ `rimworld-reference.md:335`: a DISABLED work type renders BLANK; an INCAPABLE one renders as NO
// CELL AT ALL. So the assertion is a CENSUS OF THE CELLS, not a class or a style: an incapable type
// must be ABSENT from CAN and PRESENT in CANNOT. A greyed cell would satisfy any "is it marked?"
// test and would still be saying the wrong sentence — *the player's setting is off* instead of
// *there is no such setting for this person*.
//
// MUTATION: build the CAN row from `WORK_COLUMNS` instead of `workRowColumns(caps)` ⇒ RED (BUILD
// re-appears for Ozawa). MUTATION: drop the CANNOT list ⇒ RED.
test('M4-2: CAN & CANNOT — an incapable work type has NO cell, and is named under CANNOT', () => {
  // Rell: capable of all six (an empty mask — charter §12.15: she boots with the fleet-wide default).
  const wr = open(7);
  assert.deepEqual(textsOf(wr, 'pv-skill-lbl'), ['REPAIR', 'BUILD', 'CRAFT', 'STRIP', 'MINE', 'HAUL']);
  assert.deepEqual(textsOf(wr, 'pv-skill-lvl'), ['4', '0', '0', '0', '0', '2'],
    'the skill corners are not the wire\'s levels. `0` renders as `0` VISIBLY and deliberately — '
    + 'nobody aboard is trained at anything and the zero is the finding (overview-model.js).');
  assert.deepEqual(shownOf(wr, 'pv-cannot-row'), [],
    'a crew member with an EMPTY incapability mask is being told she cannot do something');

  // Ozawa: `1 << 1` = BUILD. RimWorld's own rendering is ABSENCE.
  const wo = open(9);
  assert.deepEqual(textsOf(wo, 'pv-skill-lbl'), ['REPAIR', 'CRAFT', 'STRIP', 'MINE', 'HAUL'],
    'BUILD still has a cell for a crew member the sim says can NEVER build. `incapableMask` is a '
    + 'fact about the PERSON, not a priority the player set — RimWorld draws no box at all, and a '
    + 'greyed box would still offer the click and still say the other sentence.');
  assert.deepEqual(textsOf(wo, 'pv-cannot-row'), ['BUILD']);
});

// ⚠️ `null` IS "WE HAVE NOT BEEN TOLD", NOT LEVEL 0 AND NOT "INCAPABLE OF NOTHING". Deleting a cell
// on a missing message would state a permanent fact about a person on the strength of silence.
test('M4-2: with NO workcaps payload every cell survives and the level reads `·`', () => {
  const w = open(7, { caps: [] });
  assert.deepEqual(textsOf(w, 'pv-skill-lbl'), ['REPAIR', 'BUILD', 'CRAFT', 'STRIP', 'MINE', 'HAUL']);
  assert.deepEqual(textsOf(w, 'pv-skill-lvl'), ['·', '·', '·', '·', '·', '·']);
  assert.deepEqual(shownOf(w, 'pv-cannot-row'), [],
    'a missing `workcaps` payload is being rendered as "she cannot do anything"');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. TIES & HISTORY — and the honest empties
// ═════════════════════════════════════════════════════════════════════════════════════════════

// ⛔ AN EMPTY BAND SAYS IT IS EMPTY (`invisible feedback is FUNCTIONAL`, binding 2026-07-26). The
// empty state is the SHIPPING state: the seven authored sleepers' `Relationships` are deliberately
// empty (MECHANICS.md:5818-5824) because a HOST must not write hashed SOCL state at runtime, and the
// chronicle half has no cid on the wire until M4-7 carries `SubjectA`/`SubjectB` out (charter
// coupling 8: *"Not a stub — an honest empty state"*).
test('M4-2: the four honest empties are WRITTEN, not hidden', () => {
  const w = open(7);
  // ⚠️ `shownOf`, NOT `textsOf`: the assertion is about what the player READS. A note that is in the
  // tree but `hidden` is not an honest empty state, it is an invisible one. (Rell can do all six
  // work types, so the CANNOT half's own "why is not on the wire" note is correctly absent here —
  // its empty state is the complete CAN list above it.)
  const notes = shownOf(w, 'pv-empty').map((n) => n.textContent);
  assert.deepEqual(notes, [
    'Nothing is written about her yet.',        // the one-line written identity — M4-3
    'No one aboard knows her yet.',             // the live bond graph — DESIGN QUESTION (d) option 1
    'No chronicle entries name her yet.',       // her own lines — M4-7 (coupling 8)
  ], 'an empty section of the Persona window is being HIDDEN instead of saying it is empty, or a '
    + 'stub sentence has been invented for data that does not exist. Both are the failure the '
    + '"invisible feedback is FUNCTIONAL" rule names; the second is also a ◇ SAMPLE, in the one '
    + 'window whose exit gate says "no ◇ SAMPLE anywhere".');
});

// MUTATION: read the edges without filtering by cid ⇒ RED. MUTATION: leave the empty note shown
// beside real bonds ⇒ RED on the second leg.
test('M4-2: TIES shows the live directed bonds, and the empty note steps aside when there are any', () => {
  // [fromCid, toCid, opinion, tier, note, secret]
  const edges = [[7, 9, 40, 2, 'shared a watch', false], [9, 7, -12, 1, '', false]];
  const w = open(7, { edges });
  assert.deepEqual(textsOf(w, 'pv-tie-name'), ['OZAWA', 'OZAWA'],
    'the bond rows do not name the OTHER crew member — names resolve through the cid-keyed roster');
  assert.deepEqual(textsOf(w, 'pv-tie-op'), ['+40', '-12']);
  assert.deepEqual(shownOf(w, 'pv-empty').map((n) => n.textContent).filter((t) => /knows her/.test(t)), [],
    'the "no one aboard knows her yet" note is still shown beside real bonds');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4b. ⛔⭐ THE FABRICATION GUARD — an EQUALITY census of everything the window paints, per band
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS IS THE CARD'S OWN GUARD, RE-POINTED, AND ITS ABSENCE WAS A SEND-BACK. `panels.js`'s
// dossier pins its identity band's CHILD CENSUS by EQUALITY (`dossier-honesty.test.js:143-150`)
// precisely so that a row APPEARING is a red test rather than a design change nobody voted for; the
// M4 charter's coupling 12 requires that shape to move with the surface. Without it the window was
// measured accepting, GREEN at 1706/1706: a static `MORALE` label + bar reading nothing, and three
// fabricated constant rows (`AFFINITY 82%` · `TRUST HIGH` · `ARCHETYPE STOIC`). Every one of those is
// a ◇ SAMPLE in the one window whose exit gate is *"no ◇ SAMPLE anywhere"* — and `Health`, `Morale`
// and `Archetype` are exactly the three fields M4-4 is deciding real-or-delete, so a lane that
// "helpfully" surfaced them would be shipping a fabrication about an open owner question.
//
// ⛔ WHY A RECURSIVE CLASS CENSUS AND NOT A LIST OF FORBIDDEN NAMES. A denylist ("no `.pv-meter`")
// is satisfied by the same lie under another name — the M1-F argument verbatim. The census is
// EQUALITY over every element class the band paints, in document order, so ANY appearing element is
// a red test and the author has to say what it is for in a diff.
//
// ⚠️ WHAT IT CANNOT SEE, stated in the meter guard's own style: it is blind to a fabricated STRING
// written into an existing slot (`role` set to a constant, say). That is covered from the other side
// — the band tests above assert those slots EQUAL the wire's fields — and by `dossier-honesty`'s
// morale render-pair. Neither instrument is sufficient alone.

/** Every element class inside `node`, in document order. Blank classes are kept as '' so an
 *  unclassed wrapper cannot be slipped in unseen. */
function classCensus(node) {
  const out = [];
  const walk = (n) => {
    if (n.nodeType !== 1) return;
    out.push(n.className || '');
    for (const c of n.childNodes) walk(c);
  };
  for (const c of node.childNodes) walk(c);
  return out;
}
/** The `.pv-bandbody` of the band whose header reads `title`. */
function bandBody(title) {
  const heads = [];
  const walk = (n) => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains('pv-band')) heads.push(n);
    for (const c of n.childNodes) walk(c);
  };
  walk(root);
  const band = heads.find((b) => b.childNodes[0] && b.childNodes[0].textContent === title);
  assert.ok(band, `no band titled ${title} — the census below would be measuring nothing`);
  return band.childNodes[1];
}

test('M4-2: the window\'s painted census is EQUALITY-pinned per band — a row cannot APPEAR', () => {
  // The standard fixture: Rell, capable of all six, no bonds, nothing stuck. This is the state the
  // shipped wreck boots into, so it is the state a fabricated row would be added against.
  open(7);

  assert.deepEqual(classCensus(bandBody('IDENTITY')), [
    // ⚠️ NO `svg` ENTRY: the bust is written with `innerHTML` (it IS markup — an inline SVG from the
    // shared registry) and `dom-lite` does not parse markup into nodes. In Chrome the `<svg>` is a
    // real child; here it is a string on the span. Named so a reader does not "fix" the census by
    // adding an element this harness cannot see. The bust's presence is asserted by the persona-shot
    // tool, which runs in a browser.
    'pv-idrow', 'pv-bust', 'pv-idcol', 'pv-name', 'pv-role', 'pv-where',
    'pv-traits', 'pv-trait', 'pv-trait',
    'pv-prose pv-empty',
  ], 'the IDENTITY band grew or lost an element. EQUALITY, not a denylist: `AFFINITY 82%` or a '
    + '`MORALE` bar re-added under any other name is the same lie — the sim writes none of those '
    + '(M1-F; `Citizen.Health`/`Morale`/`Archetype` are M4-4\'s open real-or-delete question).');

  assert.deepEqual(classCensus(bandBody('DOING & WHY')), ['pv-task', 'pv-stuck'],
    'the DOING & WHY band grew or lost an element');

  // ⭐ THE SKILL STATE IS PART OF THE CENSUS AND THAT IS FREE PRECISION: the fixture gives Rell
  // REPAIR 4 and HAUL 2, so those two cells read `trained` and the other four `untrained`. A cell
  // that started reporting a level the wire did not send would move this list as surely as a new row
  // would. (The three CANNOT elements are present-but-HIDDEN here — Rell's mask is empty. The census
  // walks hidden nodes deliberately: a row that appears hidden is still a row that appeared.)
  const skillRow = (state) => ['pv-skill', 'pv-skill-lbl', 'pv-skill-lvl ' + state];
  assert.deepEqual(classCensus(bandBody('CAN & CANNOT')), [
    'pv-skills',
    ...skillRow('trained'), ...skillRow('untrained'), ...skillRow('untrained'),
    ...skillRow('untrained'), ...skillRow('untrained'), ...skillRow('trained'),
    'pv-subhd', 'pv-cannot', 'pv-note pv-empty',
  ], 'the CAN & CANNOT band grew or lost an element');

  assert.deepEqual(classCensus(bandBody('TIES & HISTORY')), [
    'pv-ties', 'pv-note pv-empty', 'pv-subhd', 'pv-note pv-empty',
  ], 'the TIES & HISTORY band grew or lost an element');

  // Non-vacuity by INCLUSION: the census really is reading a populated window, not four empty boxes.
  assert.equal(textsOf(root, 'pv-name')[0], 'Rell Okonkwo');
  assert.equal(textsOf(root, 'pv-skill-lbl').length, 6);
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 5. ⛔ THE CHARTER'S MUTATION 6 — NO METER, AND THE RIG IS PROVABLY ALIVE
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `TARGET.md:66-69`: *"No misery meters … never a bar the player feeds."* `Citizen.Morale` is a
// measured CONSTANT (M1-F; no system in `sim/` writes it), and the dossier's meter was removed and
// equality-pinned gone. The Persona window is where a meter would come back, so the same render-pair
// argument is made here: two renders differing ONLY in `morale` must be byte-identical.
test('M4-2: morale moves NOTHING on the Persona window — and the same fixture proves the rig is live', () => {
  const low = snapshot(open(7, { crew: [{ ...RELL, morale: 0.02 }, OZAWA] }));
  const high = snapshot(open(7, { crew: [{ ...RELL, morale: 0.99 }, OZAWA] }));
  assert.equal(high, low,
    'a morale change repainted the Persona window. `Citizen.Morale` is a CONSTANT — anything here '
    + 'that moves with it is a gauge for a number the sim does not compute (M1-F), and TARGET.md:66 '
    + 'forbids the shape outright.');

  // ⭐ THE PAIRED POSITIVE CONTROL, SAME FIXTURE, SAME TEST. Without it the assertion above is a
  // BARE NEGATIVE satisfied by every broken thing — an exception swallowed on render, an empty body,
  // a window that has stopped painting. `task` is REAL: the host recomputes it every roster build.
  const moved = snapshot(open(7, { crew: [{ ...RELL, morale: 0.99, task: 'Hauling scrap to hold' }], caps: [] }));
  assert.notEqual(moved, high,
    'THE INSTRUMENT IS DEAD. Changing a REAL field (`task`) repainted nothing, so the morale '
    + 'assertion above proves nothing either.');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 6. ⛔ THE CHARTER'S MUTATION 4 — THE MOUNT. The window must be visible over the ROOM ZOOM.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS IS A CASCADE ASSERTION AND IT IS DELIBERATELY NOT A DOM ONE. The charter's own words:
// *"driven, not scanned … a CSS `display:none` is invisible to every DOM-presence test"*. Mounting
// into `#panels` — or copying its hide rules onto `#persona` — would leave every assertion above
// green and the window unreachable from the one surface that needs it most. `dom-lite` computes no
// styles, so the honest instrument here is the CASCADE ITSELF, read as the browser reads it
// (`styles-source.js` follows index.html's links in order), plus the Chrome witness in
// `client/tools/persona-shot.mjs`.
test('M4-2: the cascade hides #persona under MOSS and NOWHERE ELSE — least of all the Room Zoom', () => {
  const css = stylesSource().replace(/\/\*[\s\S]*?\*\//g, ' ');
  const hides = [...css.matchAll(/body\.([a-z-]+)\s+#persona\s*\{[^}]*display\s*:\s*none/g)].map((m) => m[1]);
  assert.deepEqual(hides, ['moss-open'],
    'the Persona window is hidden by a body class other than `moss-open` (or by none at all).\n'
    + '\n'
    + 'THE BOUNDARY: `#panels` — where the deleted [B] BIO card opened — is display:none under BOTH '
    + '`body.roomzoom-open` and `body.moss-open`, and the Room Zoom crew dock is precisely the '
    + 'surface with NO readout (docs/ROADMAP.md:55). A window that inherits the roomzoom hide rule '
    + 'cannot answer where the question is asked, and NO DOM TEST CAN SEE THAT — the element is '
    + 'built, populated and correct, and simply not on screen.');

  // Non-vacuity, in the direction that matters: the scan really can find such a rule, and it really
  // does find the ones on `#panels`. A regex that matched nothing would satisfy the deepEqual above
  // only if `hides` were empty — so BOTH halves are asserted.
  const panels = [...css.matchAll(/body\.([a-z-]+)\s+#panels\s*\{[^}]*display\s*:\s*none/g)].map((m) => m[1]);
  assert.deepEqual(panels.sort(), ['moss-open', 'roomzoom-open'],
    'the scan cannot see the hide rules it exists to forbid — it found none on `#panels`, which '
    + 'demonstrably has two, so the assertion above is guarding air');

  // …and the window must actually TURN ON with its own body class, or it is display:none forever.
  assert.match(css, /body\.persona-open\s+#persona\s*\{[^}]*display\s*:\s*flex/,
    'nothing in the cascade shows #persona — the default is `display:none` and no rule lifts it');
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7. OPEN / CLOSE — the body switch, and the way out
// ═════════════════════════════════════════════════════════════════════════════════════════════

test('M4-2: opening sets the body switch and pins the cid; closing takes it away', () => {
  const w = open(7);
  assert.ok(doc.body.classList.contains('persona-open'), 'the window opened without its body class '
    + '— the cascade shows it on that class, so the DOM is populated and invisible');
  assert.equal(mounted.isOpen(), true);
  assert.equal(textsOf(w, 'pv-title')[0], 'PERSONA · Rell Okonkwo');

  mounted.close();
  assert.equal(doc.body.classList.contains('persona-open'), false);
  assert.equal(mounted.isOpen(), false);

  // ⭐ THE WINDOW PINS THE PERSON IT WAS OPENED FOR — it does not follow the selection. A repaint
  // driven by an unrelated wire update must not swap the subject under the player.
  open(9);
  Hud.renderRoster({ type: 'roster', crew: [RELL, { ...OZAWA, task: 'Hauling' }] });
  assert.equal(textsOf(root, 'pv-title')[0], 'PERSONA · Kenji Ozawa');
  assert.equal(textsOf(root, 'pv-task')[0], 'Hauling',
    'the open window did not repaint from a live wire update — its data must move while it is up '
    + '(the task sentence changes as she works), even though its subject does not');
  mounted.close();
});

test('M4-2: the close control dismisses the window', () => {
  open(7);
  const btn = root.childNodes[0].childNodes[0].childNodes[2]; // .pv-sheet > .pv-head > .pv-close
  assert.equal(btn.className, 'pv-close', 'the close control moved — this leg is clicking the wrong node');
  fire(btn, 'click');
  assert.equal(mounted.isOpen(), false, 'the close button did not close the window');
});

// ⛔ A CREW MEMBER WHO DIES WITH HER WINDOW OPEN. The window must not vanish (a window that
// disappeared is indistinguishable from a click that missed) and must not keep asserting a task she
// is no longer doing.
test('M4-2: a subject who leaves the roster is SAID to be gone, not silently closed', () => {
  open(7);
  Hud.renderRoster({ type: 'roster', crew: [OZAWA] });
  assert.equal(mounted.isOpen(), true, 'the window closed itself — the player is left wondering '
    + 'whether the click worked');
  assert.equal(textsOf(root, 'pv-where')[0], 'NO LONGER ABOARD');
  assert.equal(shownOf(root, 'pv-stuck').length, 0);
  // ⭐ AND NOTHING ABOUT HER IS LEFT STANDING. The write guards (`_traitsKey`, `_bustCid`, `_canKey`,
  // `_tiesKey`) SKIP a write when the key is unchanged, so a branch that only rewrote the text slots
  // preserved exactly the rows it meant to clear — measured on the first draft: her trait chips, her
  // bust and her skill rows all survived their subject. Every band is asserted, not just the two the
  // branch happens to touch.
  // ⚠️ LENGTHS, NOT `deepEqual` ON NODES — the same correction as the idle-repaint leg above: a
  // failing `deepEqual` over DOM nodes tries to diff two circular trees and the run takes minutes
  // and prints nothing. Measured here too, on this very leg.
  assert.equal(shownOf(root, 'pv-trait').length, 0, 'her trait chips outlived her');
  assert.equal(shownOf(root, 'pv-skill').length, 0, 'her skill rows outlived her');
  assert.equal(shownOf(root, 'pv-tie').length, 0, 'her bonds outlived her');
  assert.equal(shownOf(root, 'pv-empty').length, 0, 'a written-identity line outlived its subject');

  // ⭐⭐ THE DISCRIMINATING LEG, AND IT IS THE ONE THAT PINS THE **GUARD RESET** RATHER THAN THE HIDE.
  // Hiding the chips satisfies every assertion above on its own — measured, by deleting the
  // `_traitsKey = ''` line and watching this test stay GREEN. The reset is load-bearing for the NEXT
  // open: the write guards skip a rebuild when the key is UNCHANGED, so a window re-opened for
  // someone whose traits happen to match the cleared subject's would come back with the band
  // permanently EMPTY — a person silently missing her chips, for as long as the tab lives.
  Hud.renderRoster({ type: 'roster', crew: [RELL, OZAWA] });
  mounted.open(7);
  assert.deepEqual(textsOf(root, 'pv-trait'), ['stoic', 'unbending'],
    're-opening the window after its subject left painted no trait chips. The clear emptied the '
    + 'nodes but left `_traitsKey` holding the old signature, so the guard skipped the rebuild.');
  assert.equal(shownOf(root, 'pv-skill').length, 6, 'the CAN rows did not come back either');
  assert.ok(String(_bustHtml()).length > 0, 'the bust did not come back');
  mounted.close();
});

/** The bust span's markup. `dom-lite` does not parse `innerHTML`, so this reads the string the
 *  window wrote — which is exactly what the `_bustCid` guard decides whether to write. */
function _bustHtml() {
  const el = root.childNodes[0] && shownOfAll(root, 'pv-bust')[0];
  return el ? (el.innerHTML || '') : '';
}
/** Every element carrying `cls`, hidden or not. */
function shownOfAll(node, cls) {
  const out = [];
  const walk = (n) => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains(cls)) out.push(n);
    for (const c of n.childNodes) walk(c);
  };
  walk(node);
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 7b. ⭐ AN IDLE REPAINT MUTATES NOTHING — the write guards, pinned by NODE IDENTITY
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `Hud.onShipUpdate` fires on every ship-surface wire dispatch — ~5–8/s on `--ship wreck` while a
// crew member walks (`roomzoom-view.js`'s `paintCrewDock` header carries the measurements) — and the
// window repaints on each one because its DATA must stay live. So the lists must be REBUILT only
// when they change. This is pinned by node IDENTITY rather than by markup: a rebuild that produces
// identical HTML is still a teardown, it still drops a `title` tooltip mid-hover, and it is the churn
// the Room Zoom's dock was rewritten to stop.
//
// MUTATION: drop the `key !== _canKey` guard in `paintCaps` ⇒ RED on the first leg (fresh nodes).
// MUTATION: make the key a constant ⇒ RED on the POSITIVE control (a real change stops landing).
// ⚠️ IDENTITY IS COMPARED WITH `===` PER INDEX AND NEVER WITH `deepEqual`, AND THAT IS A MEASURED
// CORRECTION rather than a style note. The first draft asserted `deepEqual(nodesAfter, nodesBefore)`;
// when the mutation below was applied, `assert` tried to DIFF two circular DOM trees and the run took
// **250 seconds** and printed nothing usable. A guard whose red is a hang is a guard nobody will
// read — and a crash-shaped red is `CLAUDE.md` trap 3's own shape.
const sameNodes = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);

test('M4-2: an idle repaint replaces no node — and a real change still does', () => {
  open(7);
  const canBefore = shownOf(root, 'pv-skill');
  const tiesBefore = shownOf(root, 'pv-tie');
  assert.equal(canBefore.length, 6, 'the fixture is not painting the CAN rows this leg reads');

  // The SAME wire state again — the shape of every idle repaint.
  feed();
  assert.ok(sameNodes(shownOf(root, 'pv-skill'), canBefore),
    'an idle repaint REBUILT the CAN rows. The window repaints ~5-8x/s while it is open; a list '
    + 'torn down and recreated on every one of those loses hover, tooltips and any focus in it.');
  assert.ok(sameNodes(shownOf(root, 'pv-tie'), tiesBefore), 'an idle repaint rebuilt the TIES rows');

  // ⭐ THE POSITIVE CONTROL, SAME TEST. Without it the assertion above is satisfied by a paint that
  // has stopped updating anything at all — including a real skill change, which is the whole point
  // of keeping the window live.
  feed({ caps: [CAP_ROW(7, [9, 0, 0, 0, 0, 2], 0), CAP_ROW(9, [0, 0, 0, 0, 0, 0], 1 << 1)] });
  assert.equal(sameNodes(shownOf(root, 'pv-skill'), canBefore), false,
    'THE INSTRUMENT IS DEAD: a REAL skill change did not repaint the CAN rows, so "an idle repaint '
    + 'changes nothing" above proves nothing either — a window that never repaints passes it.');
  assert.deepEqual(textsOf(root, 'pv-skill-lvl'), ['9', '0', '0', '0', '0', '2']);
  mounted.close();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 8. ⛔ THE MOUNT'S OTHER HALF — the module is imported AND the controller is registered
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// `surface-boundary.test.js`'s orphan-surface test proves `main.js` can REACH this module by import.
// That is not the same claim as "the window is wired up", and the gap is exactly the failure that
// test's own message names: *"a re-home that lands the module but not the mount is silent — the old
// path stops working and the new one never starts."* Here it would be silent in the worst way:
// `initPersona()` runs, `#persona` is built and correct, and `Hud.openPersonaForSelected` — the ONE
// door from the map to a person — returns at its first line because `_persona` is null. Every band
// test above still passes, because they call the controller directly.
//
// MUTATION: delete `Hud.setPersonaWindow(...)` from main.js (leaving the import) ⇒ RED here and
// nowhere else in the node suite. (`persona-shot.mjs` would also catch it, in Chrome.)
test('M4-2: main.js REGISTERS the window with the HUD, not merely imports it', () => {
  const main = codeOnly(readFileSync(
    fileURLToPath(new URL('../src/main.js', import.meta.url)), 'utf8'));
  assert.match(main, /Hud\.setPersonaWindow\(\s*initPersona\(\s*\)\s*\)/,
    'main.js does not register the Persona window controller with hud.js.\n'
    + '\n'
    + 'THE BOUNDARY: `hud.js` cannot import `persona-view.js` — `HUD_IMPORT_SPECIFIERS` is pinned by '
    + 'EQUALITY at 10 on a file CLOSED TO NEW WORK — so the seam is a registration, exactly like '
    + '`onDialogueSend`. Without it `openPersonaForSelected` returns at its first line and the one '
    + 'door from the map to a person is dead, with the window built, correct, and unreachable.');
  // Non-vacuity: the reader really can see a call of this shape, and really does not see a
  // commented-out one (trap 1, both halves).
  assert.match('Hud.setPersonaWindow(initPersona());', /Hud\.setPersonaWindow\(\s*initPersona\(\s*\)\s*\)/);
  assert.doesNotMatch(
    codeOnly('// Hud.setPersonaWindow(initPersona());\n/* a later real comment */ x();'),
    /Hud\.setPersonaWindow\(/,
    'a commented-out registration satisfies this scan — the stripper is not stripping');
});
