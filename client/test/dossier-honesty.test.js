// M1-F — THE CREW DOSSIER DRAWS NO MORALE METER, and its own REAL/SAMPLE ledger says so.
//
// NO SYSTEM IN `sim/` EVER CHANGES `Citizen.Morale`. Verified by grep rather than inherited from
// the charter — and the SCOPE of that sentence is load-bearing, because two earlier drafts of it
// were refuted by references it did not count:
//   · in `sim/`, EXACTLY FOUR: the `= 1f` initialiser (`Entities/Citizen.cs:34`), the hash fold
//     (`Simulation.cs:420`), the save write (`SaveWriter.cs:265`), the save read
//     (`SaveReader.cs:268`, restoring that same 1f). None is a system computing a value.
//   · outside `sim/`, FOUR MORE, none of which move it either — ONE in `hosts/`:
//     `hosts/web/GameSession.cs:1705`, which copies it onto the roster wire (this is why the client
//     sees it at all); and THREE in `tests/`: `StateHashHonestyTests.cs:176,234,645`, which assign
//     it to prove it is HASHED — `:234` being `Case("Citizen.Morale", …)`, the equivalence case that
//     is the actual evidence for this package's decision NOT to delete the field (deleting it is a
//     determinism pin move).
// EIGHT in total: 4 + 1 + 3, zero of them a system.
// ⚠️ `hosts/web/WireFormat.cs:272` is NOT one of the eight and its exclusion is deliberate: it
//    serialises `RosterEntry.Morale`, the DTO copy — a different field with the same word, exactly
//    like `ShipMetricsSnapshot.Morale` below. Named so a reader can tell "excluded" from "missed".
// ⚠️ THIS PARAGRAPH HAS NOW BEEN WRONG THREE TIMES, each time in its QUANTIFIER and never in its
//    substance: "never written outside its initialiser" (refuted by `SaveReader.cs:268`), "exactly
//    four references" (refuted by the four outside `sim/`), and a draft of THIS list that folded
//    `WireFormat.cs:272` in and made 8 read as 9. The load-bearing claim is the narrow one — **no
//    system moves it** — and it has been true throughout. If you are tempted to restate the census,
//    re-measure it; do not copy this list. The roster wire
// carries the number, `hud.enrichCitizen` joins it onto the `citizen` payload, and the dossier used
// to paint it as a `MORALE 100%` meter directly under the crew member's name. A constant wearing a
// gauge's clothes, on the game's first-class character screen.
//
// ⚠️ NOT `ShipMetricsSnapshot.Morale`. That one is real, computed from mean crew Mood, and
// load-bearing: `DirectorSystem.cs:82` weights tension by `WeightMoraleDeficit * (1f - m.Morale)`,
// which moves `_wearPressure`, which `MachineWearSystem` reads. Two different fields sharing one
// word. This file touches neither — it only pins what the DOSSIER draws.
//
// ⚠️ THIS FILE MOUNTS `panels.js` IN NODE, WHICH ITS OWN HEADER SAYS NEVER HAPPENS ("Browser-only —
// never imported by the node tests"). That statement was true when written and this package makes it
// false, on purpose: a source scan cannot tell a removed meter from a renamed one, and the charter's
// decisive mutation is "change the input and require the RENDERED OUTPUT not to move". Two DOM
// methods were added to the shared `dom-lite.js` to make the mount possible (`firstChild`,
// `append`); both are real DOM APIs the card genuinely calls, and the reason is `CLAUDE.md` trap 4's
// corollary — if the harness cannot model what the guard needs to see, fix the harness.
//
// ⚠️ WHAT THIS RIG CANNOT SEE, stated rather than implied: `dom-lite` computes no styles and lays
// nothing out, so "the identity band does not leave a gap where the meter was" is a LIVE-PIXEL
// question that must be answered in Chrome. ✅ IT WAS, in M1-F's independent review: the band
// measures 49 px = 20 (name) + 15 (role) + 0 (chips) + 14 px of ordinary flex gaps — the meter's row
// is gone, not hidden, and nothing reserves its height. Recorded here because the next person to
// read this paragraph should not re-open a question that has an answer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DocumentLite, Element as DomEl } from './dom-lite.js';
import { codeOnly } from './code-only.js';

const PANELS_SRC = readFileSync(
  fileURLToPath(new URL('../src/ui/panels.js', import.meta.url)), 'utf8');

// ── the harness ──────────────────────────────────────────────────────────────────────────────
//
// `dom-lite` + the two extras the panel chrome touches: `innerHTML` as a STRING (no markup parser)
// and a memoised `querySelector` stand-in, exactly the shape `overview-model.test.js` uses. The
// dossier itself builds a REAL tree with `appendChild` / `replaceChildren`, so every assertion below
// reads `childNodes` — the actual rendered output — and never a stand-in.

class PEl extends DomEl {
  constructor(doc, tag) { super(doc, tag); this._html = ''; this._qs = new Map(); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  querySelector(sel) {
    if (!this._qs.has(sel)) this._qs.set(sel, new PEl(this.ownerDocument, 'div'));
    return this._qs.get(sel);
  }
  querySelectorAll(sel) { return [this.querySelector('all:' + sel)]; }
  get firstElementChild() { return this.childNodes.find((c) => c.nodeType === 1) || null; }
  closest() { return null; }
}
class PDoc extends DocumentLite {
  constructor() { super(); this.body = new PEl(this, 'body'); }
  createElement(tag) { return new PEl(this, tag); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

globalThis.document = new PDoc();
globalThis.window = {
  innerWidth: 1440, innerHeight: 900,
  addEventListener() {}, removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };

// Resolved AFTER the globals above — panel-base.js touches `window` at module init.
const { PanelManager } = await import('../src/ui/panels.js');
const pm = new PanelManager();

/** One crew member as the wire + `hud.enrichCitizen` hand her to the card. */
const RELL = Object.freeze({
  cid: 41, name: 'Rell Okonkwo', role: 'ENGINEER', mood: 'wary', task: 'Idle',
  morale: 1, portrait: '', traits: ['stoic', 'unbending'], log: [], relations: [],
});

/** Render the dossier for `over` and hand back the card's BODY (a real, walkable tree). */
function dossier(over) {
  const p = pm.citizen({ ...RELL, ...over }, {});
  return p.body;
}

/** Everything the card actually painted, as one comparable value. Walks the real tree — tag, class,
 *  text, and the inline styles the meters write their width and colour into. */
function snapshot(node) {
  const walk = (n) => (n.nodeType === 3
    ? { text: n.data }
    : {
      tag: n.tagName, cls: n.className, style: { ...n.style },
      kids: n.childNodes.map(walk),
    });
  return JSON.stringify(walk(node));
}

/** Depth-first text of every element carrying `cls`, in document order. */
function textsOf(root, cls) {
  const out = [];
  const walk = (n) => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains(cls)) out.push(n.textContent);
    for (const c of n.childNodes) walk(c);
  };
  walk(root);
  return out;
}

// ── 1. the meter census, pinned by EQUALITY ──────────────────────────────────────────────────

test('M1-F: the dossier\'s meter census is EQUALITY-pinned and names no MORALE', () => {
  const body = dossier({});
  const labels = textsOf(body, 'dsr-meter-lbl');
  assert.deepEqual(labels, ['Health', 'Food', 'Water', 'Rest', 'Affinity', 'Trust'],
    'the dossier\'s meter census moved. It is pinned by EQUALITY, not by "no MORALE label", ' +
    'because a meter re-added under any other name drawn off `cit.morale` is the same lie: the ' +
    'sim writes that field once, in its initialiser, and never again (M1-F). Every meter here is ' +
    'either a ◇ SAMPLE need or a ◇ SAMPLE standing value, and both wear the badge.');

  // Non-vacuity by INCLUSION, not by count: the identity band really is the place the meter stood,
  // and it is still built — so the census above is reading a live card, not an empty one.
  const ident = body.childNodes[0].childNodes[1];   // .dsr-head > .dsr-ident
  assert.equal(ident.className, 'dsr-ident');
  assert.deepEqual(ident.childNodes.map((c) => c.className), ['dsr-name', 'dsr-role', 'dsr-chips'],
    'the identity band\'s own child census. The MORALE meter sat between `.dsr-role` and ' +
    '`.dsr-chips`; this is the equality that notices it coming back.');
  assert.equal(textsOf(body, 'dsr-name')[0], 'Rell Okonkwo');
});

// ── 2. the render pair: morale is invisible, and the rig is provably alive ────────────────────

test('M1-F: morale moves NOTHING on the dossier — and the same fixture proves the rig is live', () => {
  // ── the negative half: two renders differing ONLY in morale ──
  const low = snapshot(dossier({ morale: 0.02 }));
  const high = snapshot(dossier({ morale: 0.99 }));
  assert.equal(high, low,
    'a morale change repainted the dossier. `Citizen.Morale` is a CONSTANT — anything on this card ' +
    'that moves with it is a gauge for a number the sim does not compute (M1-F).');

  // ⭐ THE PAIRED POSITIVE CONTROL, SAME FIXTURE, SAME TEST.
  //
  // Without it the assertion above is a BARE NEGATIVE and is satisfied by every broken thing: an
  // exception swallowed on render, an empty body, a stubbed `replaceChildren`, a card that draws
  // nothing at all. `assert.equal` on two identical empty snapshots is green.
  //
  // ⚠️ THE CHARTER NAMED `Citizen.Hunger` FOR THIS LEG. IT CANNOT BE USED, AND THAT IS A FINDING,
  // NOT A SHORTCUT: hunger reaches no client surface. `BuildRoster` (hosts/web/GameSession.cs)
  // emits cid/name/role/mood/task/portrait/morale/deck/x/y/traits; the `citizen` message carries
  // role/mood/traits/portrait/log; `grep -ri "hunger\|thirst\|fatigue" client/src` is EMPTY. The
  // dossier's NEEDS meters — Health/Food/Water/Rest — are ◇ SAMPLE, seeded from the cid, and say so
  // on the card. So the substitute is `mood`, which IS real: the host reads it from
  // `mind.ActiveEmotion(tick)` every roster rebuild, and the card paints it as the `.dsr-emo` chip.
  const moved = snapshot(dossier({ morale: 0.99, mood: 'furious' }));
  assert.notEqual(moved, high,
    'THE INSTRUMENT IS DEAD. Changing a REAL field (`mood`) repainted nothing, so the morale ' +
    'assertion above proves nothing either — a card that has stopped drawing passes it. Fix the ' +
    'harness before trusting the negative.');
  assert.deepEqual(textsOf(dossier({ mood: 'furious' }), 'dsr-emo'), ['furious'],
    'the positive control fired on SOMETHING but not on the emotion chip it names — read the ' +
    'snapshot diff before believing this leg');

  // A SECOND live field, because one control can itself be the thing that breaks. `task` is the
  // host's `TaskLabel(c)`, recomputed from live sim state every tick, and the card joins it into
  // the role line.
  assert.deepEqual(textsOf(dossier({ task: 'digging' }), 'dsr-role'), ['ENGINEER  › digging']);
});

// ── 3. the ledger and the drawing must agree ─────────────────────────────────────────────────
//
// `panels.js`'s header ledger splits the card's fields into REAL (on the wire) and ◇ SAMPLE
// (placeholder). It listed `morale` as REAL. The word is doing two jobs there and only one of them
// is true — the number is CARRIED, it is not COMPUTED — and a ledger that miscategorises its own
// subject is precisely how the next lane re-adds the meter in good faith, with a citation.

/** The REAL enumeration, read from the RAW source: the ledger IS a comment, so `codeOnly` — which
 *  is right for the drawing side below — would delete the very thing being read. Bounded by two
 *  fixed literals from the sentence itself rather than by "the rest of the comment block", so the
 *  explanatory note that follows it cannot leak in. */
function realLedgerSpan(src) {
  const a = src.indexOf('carried by the wire today:');
  const b = src.indexOf('conversation log.', a);
  assert.ok(a >= 0 && b > a,
    'the REAL/SAMPLE ledger in panels.js no longer has the shape this guard reads ' +
    '("carried by the wire today: … conversation log."). Re-anchor it — do not delete the guard.');
  return src.slice(a, b);
}
const namesMoraleReal = (src) => /\bmorale\b/i.test(realLedgerSpan(src));

/** Does the card's CODE (comments stripped, quote-aware, via the shipped stripper) read the field? */
const drawsMorale = (src) => /\bcit\.morale\b/.test(codeOnly(src));

test('M1-F: the REAL ledger and the card\'s drawing agree about morale', () => {
  const real = namesMoraleReal(PANELS_SRC);
  const drawn = drawsMorale(PANELS_SRC);
  assert.equal(real, drawn,
    `panels.js's REAL ledger ${real ? 'names' : 'does not name'} morale while the card ` +
    `${drawn ? 'draws' : 'does not draw'} it. The two must say the same thing: a ledger that ` +
    'miscategorises its own subject is how a removed gauge comes back with a citation. If you are ' +
    'adding morale back, make the sim WRITE Citizen.Morale first (M4-4) — the field is not ' +
    'unwired, it is unmoved.');
  // …and the agreed state is FALSE/FALSE, not TRUE/TRUE. Its own test below, because `assert`
  // throws and a second leg here would be unreportable whenever the first one fires.
});

test('M1-F: the agreed state is that morale is neither listed REAL nor drawn', () => {
  assert.equal(namesMoraleReal(PANELS_SRC), false,
    'the REAL enumeration names morale again. It is carried by the wire and never computed — ' +
    'being on the wire is not what REAL means in this ledger.');
  assert.equal(drawsMorale(PANELS_SRC), false, 'the dossier reads `cit.morale` again');
});

// ── the two readers' own non-vacuity, by INCLUSION ────────────────────────────────────────────

test('M1-F: the ledger reader would CATCH morale being re-listed (planted violation)', () => {
  // A count of what the span contains proves a matcher matched something; only planting the
  // violation proves it would match THE thing (CLAUDE.md, the fourth trap shape).
  const planted = PANELS_SRC.replace('carried by the wire today: portrait',
    'carried by the wire today: portrait, morale');
  assert.notEqual(planted, PANELS_SRC, 'the plant did not apply — the reader below is unproven');
  assert.equal(namesMoraleReal(planted), true, 'the reader cannot see a re-listed morale');
  // …and it reads the right span: the fields that ARE honestly real must be inside it.
  const span = realLedgerSpan(PANELS_SRC);
  for (const f of ['portrait', 'name', 'role', 'current emotion', 'traits']) {
    assert.ok(span.includes(f), `the REAL span does not contain "${f}" — the anchors are wrong`);
  }
  // …and it must NOT run on past its terminator into the explanatory note, which mentions morale.
  assert.ok(!span.includes('USED TO BE LISTED'),
    'the span ran past `conversation log.` and swallowed the note that explains the removal. That ' +
    'note names morale, so the reader would report the field as REAL forever — green, and wrong.');
});

test('M1-F: the drawing reader would CATCH the meter coming back (planted violation)', () => {
  const planted = PANELS_SRC.replace('const emoWrap = ',
    'ident.appendChild(meter(\'MORALE\', cit.morale, \'\', \'\'));\n    const emoWrap = ');
  assert.notEqual(planted, PANELS_SRC, 'the plant did not apply — the reader below is unproven');
  assert.equal(drawsMorale(planted), true, 'the reader cannot see a re-added morale meter');
});

test('M1-F: the drawing reader is not tripped by PROSE about morale (negative control)', () => {
  // CLAUDE.md trap 1, the half that punishes explanation: a guard that fires on a comment teaches
  // people to delete the comment. `panels.js` now carries several paragraphs about morale, and the
  // shipped `codeOnly` is what keeps them harmless.
  //
  // ⚠️ THE FIXTURE CARRIES A LATER REAL COMMENT ON PURPOSE. A control whose only `/*` is never
  // closed is VACUOUS: the naive `replace(/\/\*[\s\S]*?\*\//g,'')` finds no match, returns the input
  // unchanged, and passes whether the stripper works or not. With a genuine comment further down,
  // the naive stripper deletes everything between the quoted token and that comment's `*/` — which
  // is exactly how it blinds itself on the real file.
  const fixture = [
    'const s = "a string holding /* an unclosed comment opener and a // slash";',
    '// the dossier no longer reads cit.morale — see M1-F',
    '/* nor does it draw cit.morale here */',
    'const kept = cit.mood;',
    '/* a LATER REAL COMMENT, without which this control proves nothing */',
    'const alsoKept = cit.task;',
  ].join('\n');
  assert.equal(drawsMorale(fixture), false,
    'prose mentioning cit.morale was read as code — the guard fires on comments, which is trap 1');
  const stripped = codeOnly(fixture);
  assert.ok(stripped.includes('cit.mood') && stripped.includes('cit.task'),
    'the stripper swallowed real code after the quoted comment opener — that is the blinding this ' +
    'control exists to detect, and it would make the assertion above pass for the wrong reason');
});
