// The 80 WRECKED builders — the POST-RAID twin of every piece the five PAPER catalogues draw.
// Pure `(opts) -> string` SVG-`<g>`-fragment builders; see helpers.js for the coordinate model.
//
// ⭐ EVERY TWIN IS BUILT ONE WAY, AND SINCE 2026-08-06 THERE IS NO SECOND WAY. A twin RE-RUNS ITS
// OWN PRISTINE PAINTER (`paintFitting` / `paintMachine` / `paintPaperFixture` / `paintResource` /
// `paintMaterial`) on the same frame, with the same `idPrefix`, and then adds INK DAMAGE on top of
// it. That is not a shortcut: it is the only construction under which "the twin is the same object,
// damaged" survives a redraw OF the object, and it is what keeps the wreck premise —
// *"each keeps one identifying feature so it still reads as the same object"* — true by force rather
// than by care. It is pinned as a PREFIX: a twin's emitted element list must begin with its pristine
// piece's, in order (`client/test/wrecked.test.js`). The one named exception, with its reason, is
// `cell-sound`, whose twin is the owner's own drawing of a spent cell (catalogue 34).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⛔ THE WARM MOCK TRANSCRIPTION IS GONE — lane/warm-purge, 2026-08-06, on the owner's ruling.
//
// This file used to open *"The 70 WRECKED builders — the POST-RAID twin of every static piece in the
// warm item set (docs/design/perilune-item-set.dc.html, section 'Wrecked — post-raid state',
// imported 2026-07-28)"*, and roughly six hundred lines of it were a hand transcription of that
// document: a CSS-div layer primitive (`L`/`box`/`ring`/`shadeFill`), a paint vocabulary
// (`grad`/`rgrad`/`stripes`/`grid`/`dots`/`bars`/`STL`/`WOOD`) and seven warm damage marks
// (`scorch`/`crack`/`spark`/`wire`/`rust`/`hole`/`dead`), all in steel-grey and amber. Beside it
// stood a long argument, restated at five places in `client/src/items/index.js`, that the warm rows
// those twins belonged to could not be retired:
//
//   *"⛔ RETIRING THEM WAS CONSIDERED AND REFUSED, with the cost measured rather than guessed: their
//   twins are N of the SEVENTY the mock ships, and `client/test/wrecked.test.js` walks
//   `docs/design/perilune-item-set.dc.html`'s `brokenD` array POSITIONALLY against `MOCK_TWIN_IDS`
//   as a bijection — that walk is the whole of the evidence that the other rows are transcribed
//   correctly. Deleting them would force a third ledger to be invented so the bijection could be
//   relaxed."*
//
// ⇒ THE OWNER RULED THE OTHER WAY ON 2026-08-06. That paragraph is kept, quoted, because it was
// TRUE while it stood and because it names exactly what was given up. What replaces the bijection is
// stronger on the question that survives, and the argument is in the same commit's
// `client/test/wrecked.test.js` header: after the redraw NO TWIN IS A TRANSCRIPTION OF ANYTHING, so
// there is no second document for a label to disagree with — a bijection over an empty population is
// a guard kept green forever. The prefix rule above answers the question the label walk was standing
// in for ("does this twin draw ITS OWN row's object?"), mechanically, over all eighty rows.
//
// `docs/design/perilune-item-set.dc.html` STAYS IN THE REPO AS HISTORY. It is where the wreck
// premise is stated and it is the source of the damage vocabulary every ink mark below is a
// translation of. NOTHING in `client/` reads it any more, and `wrecked.test.js` no longer opens it.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ NOT WIRED TO EITHER SURFACE — SUPERSEDED, AND QUOTED BECAUSE IT NAMES THE ORIGINAL SCOPE.
// It read: *"Nothing on the wire tells a surface how damaged a device is … This module therefore
// ships the ART and the JOIN and stops there."* The `devices` channel carries `Condition` now and
// `client/src/items/wear.js` makes the threshold decision once, against `wear.wreck_threshold`.
// ⇒ THE INVARIANT THAT REPLACED IT IS "ONE DOOR": `wear.js` is the only module that may name this
// set, and every surface goes through it. The dependency still runs ONE WAY — `wrecked.js` imports
// `ITEMS`, never the reverse — so the whole set reverts by deleting this file and its test.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ THE JOIN IS BY itemId, NOT BY `kind`, AND THAT IS THE POINT (CLAUDE.md trap 6). The sixth trap
// shape is a predicate over "what a glyph resolves to", defeated by `GLYPH_SUBSTITUTE` — a device
// wearing ANOTHER piece's art, so the borrowed row's `kind` is not a fact about the tile. It shipped
// DEMOLISH dead on every lamp with the suite green before AND after the fix. A wrecked twin is
// therefore addressed by the PRISTINE itemId and nothing else: `WRECKED` is keyed by it, and its key
// set is asserted to be exactly `ITEM_IDS` minus `NO_WRECKED_TWIN`, in order, with no reference to
// `kind` anywhere in the lookup path. A future substitution that makes a Light wear `lamp-sconce`'s
// art still resolves to `lamp-sconce`'s twin, which is the correct answer for "the art on this tile,
// wrecked".
//
// PURITY. Same contract as every other builder: "no DOM, no clock, no randomness — same input ⇒
// byte-identical output" (helpers.js:1-7). ⚠️ THAT MATTERS MORE HERE THAN ANYWHERE ELSE IN THE SET.
// Damage LOOKS like scatter, and a builder that derived its scorch marks or crack angles from
// `Math.random` would not present as an obvious bug — it would present as a golden-frame flake, a
// screenshot that differs from itself, blamed on the renderer for as long as it took to find. Every
// coordinate below is AUTHORED and there is no scatter term anywhere in this file for anything to
// reach into. The one deliberate wobble is the sketch treatment's, and it is seeded by the piece id.

import { item, r3, INK } from './helpers.js';
import { ITEMS, ITEM_IDS, placeholderItem } from './index.js';
import {
  paintFitting, line as fLine, disc as fDisc, curve as fCurve, FITTING_IDS, W,
} from './fittings.js';
// — lane/warm-purge — the twelve material twins live in the block just before the registry.
import { paintMaterial, MATERIAL_IDS } from './paper-materials.js';
// — lane/paper-resources — the eight redrawn ground stacks re-run their own pristine painter, the
// same way the nine fittings twins re-run theirs. One import, one direction.
import { paintResource, PAPER_RESOURCE_IDS } from './paper-resources.js';
// — lane/paper-fixtures —
import { paintPaperFixture, FIXTURE_IDS } from './paper-fixtures.js';
// — lane/paper-machines — the thirteen machine twins live in the block at the end of this file.
import { paintMachine, MACHINE_IDS } from './machines.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE NINE FITTINGS (VR-P2) — post-raid twins for the rows the mock never had
//
// ⛔ THIS HEADER ARGUED FROM THE MOCK BIJECTION UNTIL 2026-08-06, AND THE ARGUMENT IS GONE RATHER
// THAN WRONG. It read, and it was true when written: *"Every twin above is a transcription of a
// drawing in `docs/design/perilune-item-set.dc.html`, checked against that spec's own `brokenD`
// array label-for-label and badge-for-badge — that bijection is what proves the seventy are right.
// … They are repo-authored, ledgered as such in `NON_MOCK_TWIN` below, and excluded from the mock
// join so that it still measures exactly seventy."* The owner ruled on 2026-08-06 — *"we should
// replace all old items with our new ones"* — and lane/warm-purge retired the warm set. There is no
// "every twin above" any more: ALL EIGHTY re-run their own pristine painter. So `mockLabel` has no
// referent, the bijection is over an empty set, `NON_MOCK_TWIN` no longer exists, and nothing in
// `client/` opens that document. ⇒ A READER FOLLOWING THE OLD SENTENCE FINDS NOTHING, which is why
// it is quoted here as history instead of left standing.
//
// ⇒ WHAT IS TRUE NOW, and where to check it (`client/test/wrecked.test.js`, whose header carries the
// full restructure argument):
//   · THE PROVENANCE LEDGER IS TOTAL. `NON_MOCK_TWIN` — an EXCEPTION list, 47 of 117 rows — became
//     `TWIN_SOURCE`, 80 of 80, a total function. These nine are no longer a special case that has to
//     be excluded from a join; they are nine ordinary rows in it. Where the old ledger could hide a
//     row by ADDING it, a total map cannot: adding changes nothing and OMITTING fails.
//   · THE REGISTRY IS EXACTLY THE FIVE PAPER CATALOGUES — fittings, paper-fixtures, paper-materials,
//     paper-resources, machines — and that equality is itself pinned. There is no sixth, warm one.
//   · THE PREFIX RULE IS WHAT PROVES THE DRAWING NOW, in place of the label-and-badge walk: a twin's
//     emitted element list must BEGIN with its pristine piece's, in order. That makes "the twin is
//     the same object, damaged" true BY FORCE rather than by care or by transcription — including
//     for these nine, which the bijection could never say anything about at all.
//   · `docs/design/perilune-item-set.dc.html` STAYS IN THE REPO AS HISTORY. It is where the wreck
//     premise is stated (*"each keeps one identifying feature so it still reads as the same
//     object"*) and that premise is now ENFORCED by the prefix rule rather than quoted at.
//
// `design-import/Perilune Fittings.dc.html` ships THIRTY pristine fittings and ZERO wrecked ones, so
// these nine were repo-authored from the start — which is now the ordinary case rather than the
// exception it was described as above.
//
// ⚠️ AND THEY ARE DRAWN IN THE PAPER IDIOM. ⛔ THE SENTENCE HERE SAID *"NOT THIS FILE'S WARM ONE"*,
// and that contrast is now empty: there is no warm idiom left in this file for them to differ from.
// The reason they are paper is unchanged and is about their own pieces — their PRISTINE pieces are:
// a `#EBE4D1`/`#14120F` bench under a steel-grey scorch bloom would read as two objects. Each
// twin RE-RUNS its own pristine painter through `fittings.paintFitting` and then adds ink damage on
// the same frame, in the same centimetres. That is not a shortcut — it is the only construction under
// which "the twin is the same object, damaged" survives a redraw of the object, and since 2026-08-06
// it is not these nine's local habit but the construction ALL EIGHTY are built by and held to.
//
// ⛔ THE TWENTY-ONE REPLACED ROWS KEPT THEIR WARM TWINS UNTIL P2b, WHICH IS THE BLOCK BELOW. That
// was a known, filed inconsistency — `chair`, `locker`, `cooker` and eighteen more drew a paper-ink
// pristine piece and a steel-grey wreck, so a wrecked galley mixed two palettes on screen. Closed
// 2026-08-06 by lane/warm-purge: see "THE TWENTY-ONE RESTYLED TWINS (P2b)" below, which re-authors
// all twenty-one by exactly the construction the nine here use.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** INK DAMAGE — the damage vocabulary of this file, in a fitting's own centimetres.
 *  ⛔ THIS SAID "the paper half of the vocabulary above" until 2026-08-06, when it had a warm half to
 *  be a half OF: a steel-and-soot mark set sat above it and these five were the paper counterparts.
 *  lane/warm-purge deleted the warm set on the owner's ruling, so there is no other half — these are
 *  simply THE marks, and every one of the eighty twins is drawn with them.
 *  `crack`/`hole`/`scorch`/`wire`/`dead` are the mock's five marks; these are the same five ideas
 *  drawn as ink line rather than as steel and soot, because that is the register the pieces are in. */
const inkCrack = (s, F, pts) => fLine(s, F, pts, { sw: 1.7 });
const inkTear = (s, F, pts) => fLine(s, F, pts, { sw: 1.1, dash: '2 2', opacity: 0.85 });
const inkHole = (s, F, x, y, z, r) => fDisc(s, F, x, y, z, r, { fill: INK, sw: 1.4 });
// ⚠️ A SOOT BLOOM IS A FILL, NOT A RING, and the first draft got it the other way round — a wide
// low-opacity STROKE draws a grey hoop round clean paper, which on a barrel or a locker reads as a
// second hoop rather than as a burn. Seen, not reasoned out: `node client/tools/fittings-sheet.mjs`
// writes `fittings-twins.html`, every twin beside its pristine piece — re-run it and look. The shots
// themselves are NOT committed, so a path to one would be a citation nobody can follow.
const inkScorch = (s, F, x, y, z, r) => fDisc(s, F, x, y, z, r, { fill: INK, sw: 0.9, opacity: 0.16 });
const inkWire = (s, F, a, c, b) => fCurve(s, F, a, c, b, { sw: 1.3, opacity: 0.9 });
const inkDead = (s, F, pts) => fLine(s, F, pts, { close: true, fill: INK, sw: 1.1, opacity: 0.85 });

const bench = (s) => paintFitting(s, 'bench', (_s, { F }) => {
  inkCrack(s, F, [[62, 4, 45], [96, 30, 45]]);
  inkHole(s, F, 150, 17, 45, 7);
  inkScorch(s, F, 200, 12, 45, 17);
  inkCrack(s, F, [[236.5, 7, 26], [251, 7, 5]]);          // the near-right leg, kicked out
});

const stool = (s) => paintFitting(s, 'stool', (_s, { F }) => {
  inkCrack(s, F, [[6, 14, 45], [26, 21, 45]]);
  inkScorch(s, F, 17, 17, 45, 9);
  inkCrack(s, F, [[17, 3, 20], [24, 1, 2]]);              // the snapped front leg
});

const cot = (s) => paintFitting(s, 'cot', (_s, { F }) => {
  inkTear(s, F, [[52, 10, 40], [88, 46, 40], [124, 22, 40]]);
  inkHole(s, F, 150, 34, 40, 9);
  inkScorch(s, F, 30, 26, 40, 16);
  inkWire(s, F, [186, 6, 36], [192, 4, 24], [180, 2, 12]);
});

const footlocker = (s) => paintFitting(s, 'footlocker', (_s, { F }) => {
  inkCrack(s, F, [[14, 2, 45], [50, 26, 45]]);
  inkHole(s, F, 66, 2, 20, 7);
  inkScorch(s, F, 24, 2, 14, 14);
  inkTear(s, F, [[18, 0, 41], [18, 0, 34]]);              // the sprung latch
});

const sink = (s) => paintFitting(s, 'sink', (_s, { F }) => {
  inkCrack(s, F, [[80, 47, 112], [92, 30, 100]]);         // the tap, snapped at the collar
  inkHole(s, F, 49, 27, 96, 6);                           // …and the drain, gone
  inkScorch(s, F, 30, 0, 40, 18);
  inkDead(s, F, [[78, 0, 20], [92, 0, 20], [92, 0, 40], [78, 0, 40]]);
});

const compostBin = (s) => paintFitting(s, 'compost-bin', (_s, { F }) => {
  inkCrack(s, F, [[8, 0, 84], [34, 0, 62], [22, 0, 30]]);
  inkHole(s, F, 42, 0, 44, 7);
  inkScorch(s, F, 20, 0, 20, 15);
  inkCrack(s, F, [[64, 30, 52], [72, 30, 60]]);           // the crank, bent off its shaft
});

const vicePost = (s) => paintFitting(s, 'vice-post', (_s, { F }) => {
  inkCrack(s, F, [[13, 20, 8], [27, 20, 22]]);            // the post, split at the plinth
  inkHole(s, F, 29, 16, 114, 6);                          // the far jaw, punched out
  inkScorch(s, F, 20, 20, 3, 16);
  inkTear(s, F, [[38, 14, 113], [50, 14, 106]]);
});

const curtainRail = (s) => paintFitting(s, 'curtain-rail', (_s, { F }) => {
  inkTear(s, F, [[52, 14, 186], [58, 14, 140], [46, 14, 104]]);
  inkTear(s, F, [[92, 14, 180], [86, 14, 132]]);
  inkCrack(s, F, [[5, 12, 206], [14, 12, 196]]);          // the near bracket, torn from the deckhead
  inkScorch(s, F, 110, 14, 172, 14);
});

// ── THE TWO CAPSULES (2026-08-05) — post-raid twins for catalogue 31 and 32 ──
// Same construction as the nine above: re-run the pristine painter, then ink damage on its own frame.
// The marks are chosen to say what a raid does to a life-support box rather than to a chair — the
// sealed one is holed THROUGH ITS GLASS (the one part of it that cannot be holed and leave an
// occupant alive), the open one is torn along the lid it was already showing.
const capsuleSealed = (s) => paintFitting(s, 'capsule-sealed', (_s, { F }) => {
  inkCrack(s, F, [[96, 0, 44], [132, 0, 18]]);            // across the pane
  inkHole(s, F, 60, 0, 30, 8);                            // through it, over the sleeper
  inkScorch(s, F, 168, 12, 56, 20);                       // the lid, beside the port
  inkCrack(s, F, [[195, 10, 4], [204, 10, 0]]);           // the far foot, kicked out
});

const capsuleOpen = (s) => paintFitting(s, 'capsule-open', (_s, { F }) => {
  // ⚠️ EVERY MARK ON THE LID IS ON THE LID'S OWN PLANE, and the first draft's was not. The raised lid
  // runs from (y 70, z 56) to (y 31, z 123.5), so a point on it satisfies y = 70 − 0.5778·(z − 56);
  // a hole authored at (150, 40, 116) sat 5 cm off that plane and rendered as a black disc floating
  // beside the lid — visible in a 420 px probe, invisible to every string assertion in the suite.
  inkTear(s, F, [[46, 56.9, 78.8], [98, 47.6, 94.9], [146, 40.7, 106.9]]);   // across the raised lid
  inkHole(s, F, 150, 35.3, 116, 7);                       // punched through it
  inkScorch(s, F, 100, 30, 56, 22);                       // into the empty tub
  inkWire(s, F, [54, 34, 56], [40, 46, 40], [24, 60, 30]);  // a strap, torn loose and hanging
});

// ⭐ THE ONE TWIN THAT IS A DRAWING RATHER THAN A DAMAGE PASS — see its row in `WRECKED` for why.
// It is named `cellSound` and not `cellSpent` ON PURPOSE: the painter-name guard in
// `client/test/wrecked.test.js` asks that `WRECKED[id].paint.name === camelCase(id)`, i.e. that a
// painter is named after the ROW IT SERVES. This one serves `cell-sound` (a Battery, wrecked) and
// paints card 34. Naming it after what it draws would read better in one line and would defeat the
// only guard in this repo that can see a twin pointing at another row's picture.
const cellSound = (s) => paintFitting(s, 'cell-spent');

const shrineShelf = (s) => paintFitting(s, 'shrine-shelf', (_s, { F }) => {
  inkCrack(s, F, [[14, 12, 166], [26, 12, 146]]);         // across the frame
  inkHole(s, F, 46, 16, 150, 5);                          // the cup, holed
  inkScorch(s, F, 34, 28, 128, 15);
  // ⚠️ THIS MARK MOVED WITH THE PART IT IS ABOUT. It used to run (14,6,139) → (14,20,131), which was
  // the near bracket's own line when the bracket was flat and hidden inside the shelf plate; both
  // were invisible, so the twin lost a mark and nothing said so. The bracket now falls from the
  // plate's front-bottom edge to the wall, and the crack crosses it just under the shelf.
  inkCrack(s, F, [[11, 8, 133], [18, 10, 133]]);          // the near bracket, cracked at the mount
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// — lane/warm-purge —
// THE TWENTY-ONE RESTYLED TWINS (P2b) — the rows that drew a PAPER piece and a WARM wreck
//
// ⛔ THIS CLOSES THE INCONSISTENCY THE BLOCK ABOVE FILED, and it is worth saying what the defect
// actually was rather than "a palette mismatch": twenty-one registry rows drew a `#EBE4D1`/`#14120F`
// pristine fitting and, for the same tile, a steel-grey mock transcription in `#33281b`/`#3a2c1e`.
// So a wrecked galley put two idioms on one screen — and the owner's `strong` sketch ruling made it
// worse, because `SKETCHED_TWINS` (below) can only treat a twin whose own painting is paper: the
// pristine piece became conspicuously hand-drawn beside a twin that could not be. Each of the
// twenty-one now RE-RUNS its own pristine painter through `fittings.paintFitting` and adds ink
// damage on the same frame, in the same centimetres — the construction the nine above already use,
// and the only one under which "the twin is the same object, damaged" survives a redraw of the
// object. Their warm builders are deleted; nothing else in this file's warm half moves.
//
// ⚠️ THE DAMAGE IS THE MOCK TWIN'S OWN, PIECE BY PIECE, NOT A SHARED PASS. Each warm builder was read
// before it was deleted and its marks carried over: the mock's vocabulary is `crack` · `hole` ·
// `scorch` · `rust` · `wire` · `dead` · `spark`, and it maps
//   crack → `inkCrack` · hole → `inkHole` · scorch → `inkScorch` · wire → `inkWire` · dead → `inkDead`
// with two exceptions and one addition, each made once, here:
//
//  • `rust` IS A STAIN, AND IT IS DRAWN AS `inkScorch`. A soot bloom and a rust bloom are the same
//    mark in a two-colour dialect — a low-opacity ink fill over the part that has gone — and every
//    such mark below carries a comment saying which of the two it came from. Inventing a second
//    bloom to keep the mock's two words apart would put a mark on screen that no reader could tell
//    from the first.
//  • `spark` IS DROPPED, ON EVERY PIECE. Six of the twenty-one carried one (battery-bank, cooker,
//    desk, standing-lamp, research-console, space-heater). A live arc is a claim about a POWERED
//    circuit; these twins are the post-raid ship, where `state` is not even read (see `buildWrecked`)
//    and the mock's own premise is "every system dead". The warm set could tell that lie in colour;
//    the paper dialect has one accent and it is reserved for attention, so a spark here would have to
//    be drawn in ink and would read as one more crack. Said once so no later piece re-adds it.
//  • The mock's `pool` — a soft radial puddle under a leaking piece — is dropped for a different
//    reason: it lies on the DECK, not on the object, and every mark in this block is anchored ON the
//    piece it damages (`paper-resources.test.js`'s "damage lands ON the piece" rule). The dashed
//    containment ring `inkArea` is the one mark that means "the deck around this", and it belongs to
//    matter that has spilled, not to a fitting that has stopped working.
//  • `inkTear` — a DASHED run — is used where the mock's own crack falls on something soft that
//    parts rather than splits: the bunk's berth deck, the rug's border, a plant's stem. Three pieces,
//    named in their own comments.
//
// ⛔ NO OXBLOOD IN ANY OF THE TWENTY-ONE. The accent is attention, faults and queued orders
// (`docs/design/perilune-art-style.md` §1) and a wreck is none of those — it is a fact about the
// object. The one accent on screen here is `battery-bank`'s hazard plate, which its PRISTINE painter
// draws and this twin does not touch.
//
// ⭐ EVERY ANCHOR WAS MEASURED, NOT PLACED. `paper-resources.test.js`'s ⭐⭐ anchoring guard is the
// instrument: a mark floating in clean paper INSIDE the piece's box is valid SVG, passes every box
// rule, and is simply not on the object. Runs (`inkCrack`/`inkTear`/`inkWire`) are anchored at EVERY
// vertex and a curve at every flattened sample, so a wire is only as good as its whole arc.
// ⚠️ AND THE INSTRUMENT HAS A KNOWN BLIND SIDE ON ROUND PIECES, WHICH IS WHY THREE OF THESE ARE
// ANCHORED WHERE THEY ARE: `sketch-geom.flatten` stops at an `A` command, so a `cyl()` body
// contributes only its LEFT wall and a `hoop()` only its left end point. The flanks of `fuel-drum`,
// `supply-barrel` and `standing-lamp`'s column are therefore invisible to it — their marks ride the
// wall line, the lid, the head and the sight gauge, which are the parts it can see AND the parts a
// reader can. ⛔ It is the INSTRUMENT that is narrow here, not the pieces (CLAUDE.md's 9th shape),
// and the two ROUND twins that shipped before this package carry anchors the same blind spot
// rejects — `stool` one, `vice-post` two, re-measured here rather than remembered, and both on
// `cyl()` bodies. They are left exactly as they are: this package does not
// touch the nine, and a mark moved to satisfy a guard that cannot see its own subject would be a
// worse drawing bought with no evidence.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const batteryBank = (s) => paintFitting(s, 'battery-bank', (_s, { F }) => {
  inkCrack(s, F, [[10, 6, 30], [28, 6, 52]]);             // a cell case, split down its face
  inkScorch(s, F, 50, 6, 40, 14);                         // the middle cell, burnt out
  inkScorch(s, F, 82, 6, 86, 12);                         // …and the mock's RUST, the same bloom
  inkWire(s, F, [20, 6, 104], [26, 6, 92], [16, 6, 76]);  // a lead off the bus bar, hanging
});

const o2Scrubber = (s) => paintFitting(s, 'o2-scrubber', (_s, { F }) => {
  inkHole(s, F, 35, 0, 96, 7);                            // the vent, punched through at its hub
  inkDead(s, F, [[14, 0, 126], [56, 0, 126], [56, 0, 140], [14, 0, 140]]);   // the readout, out
  inkCrack(s, F, [[12, 0, 38], [38, 0, 54]]);             // across the filter drawer
  inkScorch(s, F, 20, 0, 20, 14);                         // the mock's rust, at the plinth
  inkWire(s, F, [29, 0, 55], [24, 0, 44], [30, 0, 34]);   // the drawer's own harness, torn out
});

const hydroponics = (s) => paintFitting(s, 'hydroponics', (_s, { F }) => {
  inkCrack(s, F, [[20, 0, 39], [60, 0, 39]]);             // the bottom lamp bar, split end to end
  inkHole(s, F, 60, 2, 88, 6);                            // the second tray, holed
  inkScorch(s, F, 30, 2, 133, 14);                        // the third tray, burnt
  inkScorch(s, F, 78, 2, 45, 10);                         // the mock's rust, on the bottom tray
});

const cooker = (s) => paintFitting(s, 'cooker', (_s, { F }) => {
  // ⚠️ BOTH RUNS ARE LONGER THAN THEY FIRST WERE, AND THE REASON IS MEASURED, NOT TASTE.
  // `sketch-adoption.test.js`'s tellable-apart leg reads DRAWN LENGTH out of `d` attributes, and an
  // `inkScorch` is an `<ellipse>` with no `d` at all — so a twin whose damage is mostly bloom scores
  // as if it had almost none. At three marks, one of them a bloom, this piece came out at 113 units
  // against a floor of 120: legible on screen, under the bar that says a player can tell a broken
  // cooker from a working one. The crack now crosses the whole hob plate and the loom hangs the
  // height of the oven door, which is also the better drawing.
  inkCrack(s, F, [[10, 10, 96], [80, 46, 96]]);           // the hob plate, split right across
  inkScorch(s, F, 26, 0, 26, 14);                         // the oven door, scorched at the sill
  inkWire(s, F, [12, 0, 60], [6, 0, 40], [14, 0, 18]);    // the supply loom, torn out and hanging
});

const cooler = (s) => paintFitting(s, 'cooler', (_s, { F }) => {
  inkHole(s, F, 46, 0, 156, 5);                           // straight through the dial
  inkCrack(s, F, [[12, 0, 120], [40, 0, 96]]);            // across the door
  inkScorch(s, F, 20, 0, 40, 16);
  inkScorch(s, F, 66, 0, 150, 10);                        // the mock's rust, beside the dial
});

const diningTable = (s) => paintFitting(s, 'dining-table', (_s, { F }) => {
  inkCrack(s, F, [[30, 10, 75], [92, 40, 75]]);           // the top, split across
  inkCrack(s, F, [[110, 60, 75], [150, 30, 75]]);         // …and again, the mock's second crack
  inkScorch(s, F, 60, 45, 75, 18);
  inkScorch(s, F, 40, 70, 75, 10);                        // the mock's rust, at the back edge
});

const bunkBed = (s) => paintFitting(s, 'bunk-bed', (_s, { F }) => {
  // ⚠️ `inkTear` AND NOT `inkCrack`: the mock cracks the upper berth, and a berth deck is canvas over
  // a frame — it parts, it does not split. Same mark, drawn in the dash the soft half of this
  // vocabulary uses.
  inkTear(s, F, [[40, 10, 125], [90, 40, 125], [130, 20, 125]]);   // the upper berth, opened up
  inkHole(s, F, 70, 35, 45, 8);                           // through the lower deck
  inkScorch(s, F, 150, 30, 45, 16);
  inkCrack(s, F, [[190, 1, 112], [175, 1, 82]]);          // the ladder, rungs torn off the stiles
});

const desk = (s) => paintFitting(s, 'desk', (_s, { F }) => {
  inkDead(s, F, [[92, 0, 30], [138, 0, 30], [138, 0, 62], [92, 0, 62]]);   // the open bay, dark
  inkCrack(s, F, [[20, 30, 90], [80, 20, 90]]);           // the worktop, split
  inkCrack(s, F, [[100, 50, 90], [140, 25, 90]]);         // …the mock's second crack
  inkScorch(s, F, 30, 0, 40, 14);                         // over the drawers
  inkWire(s, F, [30, 0, 38], [22, 0, 28], [30, 0, 20]);   // a loom, pulled out of the pedestal
});

const chair = (s) => paintFitting(s, 'chair', (_s, { F }) => {
  inkCrack(s, F, [[10, 16, 43], [34, 30, 43]]);           // the seat, split across
  inkScorch(s, F, 32, 26, 43, 10);
  inkScorch(s, F, 14, 18, 3, 8);                          // the mock's rust, on the base puck
});

const locker = (s) => paintFitting(s, 'locker', (_s, { F }) => {
  inkCrack(s, F, [[10, 0, 150], [38, 0, 120]]);           // the near door, split
  inkHole(s, F, 68, 0, 60, 7);                            // the far door, punched
  inkScorch(s, F, 20, 0, 40, 16);                         // over the vent bank
  inkScorch(s, F, 76, 0, 150, 10);                        // the mock's rust, at the far shoulder
});

const rug = (s) => paintFitting(s, 'rug', (_s, { F }) => {
  inkHole(s, F, 40, 30, 0, 8);
  inkHole(s, F, 90, 60, 0, 6);                            // the mock burns TWO holes in this one
  inkScorch(s, F, 70, 20, 0, 18);
  // ⚠️ `inkTear`: the mock lays a second stripe band over the mat. A woven mat does not crack — its
  // border rule is where the weave lets go, so the run is dashed and follows the rule it is parting.
  inkTear(s, F, [[12, 9, 0], [12, 45, 0], [12, 77, 0]]);  // the border rule, unravelled
});

const standingLamp = (s) => paintFitting(s, 'standing-lamp', (_s, { F }) => {
  // ⚠️ THREE LONG RUNS ON PURPOSE — same measurement as the cooker's. This piece is 44 cm wide and
  // 178 tall, so its whole drawing is a thin column of ink; three short marks scored 44 units against
  // the 120-unit floor in `sketch-adoption.test.js`'s tellable-apart leg. Each run now spans the part
  // it damages end to end rather than nicking it.
  inkCrack(s, F, [[2, 22, 178], [42, 22, 178]]);          // the shade, split right across its rim
  inkCrack(s, F, [[17, 22, 142], [14, 22, 26]]);          // the column, buckled — the mock's offset pole
  inkWire(s, F, [17, 22, 146], [11, 22, 104], [17, 22, 62]);   // the flex, pulled out of the column
});

const researchConsole = (s) => paintFitting(s, 'research-console', (_s, { F }) => {
  inkDead(s, F, [[13, 4, 104], [47, 4, 104], [47, 4, 124], [13, 4, 124]]);  // the screen, dark
  inkCrack(s, F, [[14, 4, 120], [42, 4, 106]]);           // across it
  inkHole(s, F, 30, 4, 112, 5);
  inkWire(s, F, [30, 12, 20], [36, 12, 14], [30, 12, 8]); // the trunk, torn out under the column
});

const workbench = (s) => paintFitting(s, 'workbench', (_s, { F }) => {
  inkCrack(s, F, [[24, 10, 92], [96, 40, 92]]);           // the worktop, split along its length
  inkHole(s, F, 140, 70, 120, 7);                         // the pegboard, punched
  inkScorch(s, F, 40, 70, 140, 18);
  inkWire(s, F, [100, 70, 100], [108, 70, 110], [100, 70, 122]);  // a lead, hanging off the board
});

const storageCrate = (s) => paintFitting(s, 'storage-crate', (_s, { F }) => {
  inkCrack(s, F, [[8, 0, 36], [34, 0, 22]]);              // across a brace
  inkHole(s, F, 46, 0, 12, 6);
  inkScorch(s, F, 14, 0, 10, 10);
  inkScorch(s, F, 10, 0, 40, 7);                          // the mock's rust, at the upper corner
});

const fuelDrum = (s) => paintFitting(s, 'fuel-drum', (_s, { F }) => {
  inkHole(s, F, 3, 27.5, 50, 7);                          // holed through the flank, between hoops
  inkCrack(s, F, [[0, 27.5, 68], [2, 27.5, 46]]);         // the wall, split down the seam
  inkScorch(s, F, 30, 30, 85, 12);                        // the head, burnt round the bung
});

const pipeRun = (s) => paintFitting(s, 'pipe-run', (_s, { F }) => {
  inkCrack(s, F, [[60, 0, 158], [130, 0, 172]]);          // along the duct's face
  inkScorch(s, F, 200, 0, 164, 16);
  inkScorch(s, F, 40, 0, 154, 12);                        // the mock's rust, at the near end
});

const spaceHeater = (s) => paintFitting(s, 'space-heater', (_s, { F }) => {
  inkCrack(s, F, [[18, 0, 100], [42, 0, 72]]);            // across the fin bank
  inkScorch(s, F, 30, 0, 52, 12);
  inkWire(s, F, [60, 0, 50], [66, 0, 58], [60, 0, 66]);   // the element's lead, out of the knob boss
});

const shelfRack = (s) => paintFitting(s, 'shelf-rack', (_s, { F }) => {
  inkCrack(s, F, [[24, 10, 76], [70, 30, 76]]);           // a shelf, split across
  inkHole(s, F, 80, 20, 118, 6);                          // the shelf above it, holed
  inkScorch(s, F, 36, 20, 160, 14);
  inkScorch(s, F, 5, 0, 150, 8);                          // the mock's rust, up the near upright
});

const supplyBarrel = (s) => paintFitting(s, 'supply-barrel', (_s, { F }) => {
  inkHole(s, F, 30, 35, 118, 6);                          // the lid, punched
  inkCrack(s, F, [[51, 6, 80], [51, 6, 50]]);             // the sight gauge, split down its run
  inkScorch(s, F, 44, 38, 118, 12);                       // the lid, burnt beside the hole
});

const herbPlanter = (s) => paintFitting(s, 'herb-planter', (_s, { F }) => {
  inkCrack(s, F, [[10, 0, 30], [42, 0, 16]]);             // the trough, split at the near corner
  // ⚠️ `inkTear`: the mock draws its foliage as two drooping strokes rather than a standing plant.
  // A stem gives way in fibres, so the run is dashed and lies along the stem it follows down.
  inkTear(s, F, [[58, 22, 72], [61, 22, 58], [59, 22, 44]]);   // the tallest stem, broken over
  inkScorch(s, F, 90, 20, 38, 12);                        // the soil, spoiled at the third plant
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// — lane/paper-resources —
// THE EIGHT PAPER GROUND STACKS — damaged twins for the redrawn resources
//
// ⚠️ SAME CONSTRUCTION AS THE NINE FITTINGS ABOVE, AND FOR THE SAME REASON: each twin RE-RUNS its
// own pristine painter (`paperResources.paintResource`) and then adds ink damage on the same frame,
// in the same centimetres. That is the only construction under which "the twin is the same pile,
// spoiled" survives a redraw of the pile — and since 2026-08-06 it is the construction ALL EIGHTY
// twins are built by, not a local habit of this block and the nine fittings.
//
// ⛔ THE PROVENANCE SENTENCE HERE IS HISTORY, NOT CURRENT. It read: *"they are repo-authored and
// ledgered as such in `NON_MOCK_TWIN`, which is what keeps the mock join measuring exactly
// seventy."* True when written; there is no mock join now. The owner ruled on 2026-08-06 (*"we
// should replace all old items with our new ones"*) and lane/warm-purge retired the warm set, so
// `NON_MOCK_TWIN` — 47 of 117 rows, an EXCEPTION list — became `TWIN_SOURCE`, 80 of 80, TOTAL.
// These eight are not excluded from anything any more; they are eight ordinary rows in a ledger that
// names every twin's source. `design-import/Perilune Fittings.dc.html` still has no card for any of
// them, so they remain repo-authored — which is now the ordinary case rather than the exception.
// What proves the drawing is the PREFIX RULE (a twin's element list must BEGIN with its pristine
// piece's, in order), not a label-and-badge walk against a second document.
//
// ⚠️ THE STATES ARE THE MOCK'S OWN EIGHT, KEPT DELIBERATELY. The warm resources' twins are labelled
// CONTAMINATED · SPOILED · SLAGGED · SEIZED · FRIED · PERISHED · MELTED · UNSHROUDED, and those are
// facts about what happens to matter rather than about a drawing. Each twin below expresses ITS OWN
// state and no other — a spoiled crate is not a scorched one — so the eight remain eight different
// answers instead of one damage pass applied eight times.
//
// ⛔ AND NO OXBLOOD, IN ANY OF THEM, which is `paper-resources.js`'s header rule extended to the
// damage. A pile that has gone bad is not an alert either; the accent belongs to the marks that are
// ABOUT a tile (a queued order, a fault), never to the matter on it. The body bag's twin is the one
// that could most easily have argued for it, and it is the one that most clearly must not.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** A DASHED LEVEL RING on the deck — "this area is affected", in the room cutaway's own cut-edge
 *  dialect. A 16-gon rather than an ellipse because the shared `disc` carries no dash term, and a
 *  16-gon at this scale is under a pixel of chord error. PURE: every point goes through `F.project`. */
function inkArea(s, F, x, y, r) {
  const pts = [];
  for (let i = 0; i <= 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    pts.push([x + r * Math.cos(a), y + r * Math.sin(a), 0]);
  }
  fLine(s, F, pts, { sw: 1.0, dash: '3 3', opacity: 0.75 });
}

const spoilHeap = (s) => paintResource(s, 'spoil-heap', (_s, { F }) => {
  inkArea(s, F, 40, 40, 46);                              // CONTAMINATED: the deck around it, marked off
  inkHole(s, F, 36, 40, 30, 4);                           // a core sample taken out of the crown
  inkScorch(s, F, 24, 40, 12, 12);
  inkCrack(s, F, [[52, 40, 14], [60, 40, 6]]);            // the flank, slumped
});

const tuberCrate = (s) => paintResource(s, 'tuber-crate', (_s, { F }) => {
  inkTear(s, F, [[20, 0, 10], [34, 0, 6], [48, 0, 11]]);  // SPOILED: the near slat, sprung
  inkCrack(s, F, [[17, 0, 20], [17, 0, 8]]);              // …and the corner post it hung on
  inkScorch(s, F, 26, 12, 25, 8);                         // the blotches, on two tubers
  inkScorch(s, F, 40, 9, 27, 9);
  inkDead(s, F, [[45, 14, 25], [57, 14, 25], [56, 14, 21], [46, 14, 21]]);   // one collapsed entirely
});

const plateOffcut = (s) => paintResource(s, 'plate-offcut', (_s, { F }) => {
  inkHole(s, F, 40, 26, 8.5, 6);                          // SLAGGED: burnt clean through the top plate
  inkScorch(s, F, 20, 12, 2, 16);
  inkWire(s, F, [54, 16, 2], [60, 22, 6], [64, 30, 2]);   // an edge run soft and drawn out
  inkCrack(s, F, [[10, 38, 24], [20, 36, 14]]);           // the standing sheet, split from the top
});

const gearSet = (s) => paintResource(s, 'gear-set', (_s, { F }) => {
  inkCrack(s, F, [[32, 1, 21], [32, 1, 14]]);             // SEIZED: two teeth off the standing gear
  inkCrack(s, F, [[41, 12, 13], [35, 12, 12]]);
  inkCrack(s, F, [[6, 20, 0], [17, 20, 0], [24, 26, 0]]); // and the flat one, cracked through its hub
  inkScorch(s, F, 17, 20, 0, 11);
  inkTear(s, F, [[9, 3, 0.5], [20, 5, 3], [34, 4, 0.5]]); // the spanner, bent
});

const controlCard = (s) => paintResource(s, 'control-card', (_s, { F }) => {
  inkHole(s, F, 20, 10, 11, 4);                           // FRIED: the chip, blown out
  inkScorch(s, F, 20, 11, 8, 9);
  inkCrack(s, F, [[6, 20, 8], [18, 12, 8], [32, 14, 8]]); // the board, cracked across
  inkTear(s, F, [[9.6, 0, 8], [10.6, 5, 9.5]]);           // two pins, bent out of the comb
  inkTear(s, F, [[24, 0, 8], [23, 5, 9.5]]);
});

const sealSet = (s) => paintResource(s, 'seal-set', (_s, { F }) => {
  inkCrack(s, F, [[6, 20, 0], [16, 14, 0], [24, 6, 0]]);  // PERISHED: the big ring, split across
  inkCrack(s, F, [[25, 30, 0], [31, 25, 0], [38, 22, 0]]); // and the small one
  inkScorch(s, F, 16, 14, 0, 10);
  // ⚠️ RE-ANCHORED 2026-08-06 — THE TEAR RAN TO x = 23 AND THE CARD ENDS AT x = 17. The
  // designer-polish pass narrowed the gasket card (`paper-resources.js drawSealSet`: it leans on the
  // NEAR ring only now, quad x-span 3…17), and this twin's damage was authored in ABSOLUTE cm
  // against the OLD, wider geometry — so the far end of the tear hung in clean paper with nothing
  // under it. Filed as a residual by the paper-resources commit (98d2b3e) because `wrecked.js` was
  // another lane's file at the time; closed here.
  // The three points now lie ON the card, interpolated inside its own quad
  // A(3,29,0) B(15,30,0) C(17,34,12) D(5,33,13) at v ≈ 0.85 of the way to the top edge — so the tear
  // runs along the edge it is described as curling off, and moves with the card if the card moves.
  inkTear(s, F, [[6.5, 32.6, 10.9], [10.7, 32.9, 10.6], [14.9, 33.3, 10.3]]);  // the card, curled off its edge
});

const iceBlock = (s) => paintResource(s, 'ice-block', (_s, { F }) => {
  inkArea(s, F, 24, 18, 22);                              // MELTED: the meltwater, spreading
  // ⭐ THE ONE ARC PERMITTED IN THIS PIECE, and it is permitted for exactly the reason the pristine
  // drawing bans them: melting is what turns a facet into a curve. It is the whole difference
  // between the two states, so it is the mark that carries the state.
  inkWire(s, F, [12, 13, 15], [26, 11, 22], [38, 9, 21]); // the top edge, run round
  inkWire(s, F, [33, 8, 0], [36, 8.5, 11], [38, 9, 21]);  // the near arris, gone soft
  inkTear(s, F, [[20, 11, 8], [20, 11, 0]]);              // a run down the face
  inkScorch(s, F, 24, 12, 4, 9);
});

// ⭐ THE ONE THE OWNER WILL LOOK AT. UNSHROUDED, and NOTHING IS UNCOVERED: the bag is opened along
// its own seam and the mark stops there. There is no body in this drawing and there will not be one
// — the state the mock names is a fact about the BAG, and the bag is the whole of what this package
// is willing to draw. No oxblood, for the pristine piece's reason: death is not an alert.
const bodyBag = (s) => paintResource(s, 'body-bag', (_s, { F }) => {
  // ⚠️ THE FIRST DRAFT OF THIS TWIN WAS INVISIBLE, and it was found by looking at the sheet rather
  // than by any assertion: four dashed hairlines at 0.85 opacity, laid over a hatched face, are the
  // hatch. A state that cannot be seen is not a state. The seam is now an OPEN SLIT — a filled ink
  // sliver, the mock's own `dead()` mark — with the tear line above it.
  inkDead(s, F, [[44, 0, 25], [78, 0, 21], [116, 0, 23], [148, 0, 18],
    [116, 0, 20], [78, 0, 18], [44, 0, 22]]);             // the seam, opened
  inkCrack(s, F, [[44, 0, 25], [78, 0, 21], [116, 0, 23], [148, 0, 18]]);
  inkCrack(s, F, [[52, 0, 29], [52, 0, 18]]);             // the near strap, cut
  inkWire(s, F, [52, 0, 18], [46, 0, 10], [44, 0, 0]);    // …and hanging
  inkCrack(s, F, [[152, 0, 17], [150, 0, 6], [166, 0, 4]]);  // the tag, off its lanyard
});

// — lane/paper-fixtures —
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE FOURTEEN PAPER FIXTURES — post-raid twins for the ship's redrawn architecture
//
// Same construction as the nine fittings twins above and for the same stated reason: each re-runs
// its PRISTINE painter (`paper-fixtures.paintPaperFixture`) and then adds ink damage on the same
// frame, in the same centimetres. That is the only construction under which "the twin is the same
// object, damaged" survives a redraw of the object — and it is what keeps the wreck premise ("each
// keeps one identifying feature so it still reads as the same object") true here by force rather
// than by care. Since 2026-08-06 it is how ALL EIGHTY twins are built, not this block's own habit.
//
// ⛔ THE LEDGER SENTENCE IS HISTORY. It read: *"all fourteen are REPO-AUTHORED and ledgered in
// `NON_MOCK_TWIN` below"*, and the premise above was attributed to *"the mock's own premise for its
// seventy"*. Both were true when written. The owner ruled on 2026-08-06 — *"we should replace all
// old items with our new ones"* — and lane/warm-purge retired the warm set: there is no seventy, no
// mock join, and `NON_MOCK_TWIN` (47 of 117, an EXCEPTION list) is now `TWIN_SOURCE` (80 of 80,
// TOTAL). The premise is still the mock document's words, but it is now ENFORCED by the prefix rule
// — a twin's element list must BEGIN with its pristine piece's, in order — rather than quoted at,
// and `docs/design/perilune-item-set.dc.html` stays in the repo only as history for the wreck
// premise. `design-import/Perilune Fittings.dc.html` has no card for any of these fourteen and no
// wrecked drawing for them either, so all fourteen remain REPO-AUTHORED — the ordinary case now.
//
// ⚠️ THE IDENTIFYING FEATURE IS NAMED IN EACH PAINTER'S MARKS AND IS DELIBERATELY LEFT WHOLE: the
// sliding door's meeting seam, the airlock's undogging wheel, the blast door's two hazard bands, the
// deck hatch's ring, the conduit's three nodes, the grille's louvres, the fan's impeller, the port's
// ink glass, the rack's three arms, the sign's arrow, and each luminaire's own outline. A wrecked
// piece that no longer reads as the same object is the one failure `wrecked.test.js` cannot see — its
// join is by itemId, and a wrong drawing keyed correctly is still a wrong drawing. That is what
// `client/tools/paper-fixtures-sheet.mjs` renders side by side.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const doorSliding = (s) => paintPaperFixture(s, 'door-sliding', (_s, { F }) => {
  inkTear(s, F, [[24, 6, 150], [48, 6, 120], [36, 6, 86]]);   // the near leaf, buckled
  inkHole(s, F, 88, 6, 140, 8);                               // the far leaf, punched
  inkScorch(s, F, 60, 6, 60, 20);
  inkCrack(s, F, [[116, 0, 216], [128, 0, 230]]);             // the head, split at the jamb
});

const doorAirlock = (s) => paintPaperFixture(s, 'door-airlock', (_s, { F }) => {
  inkCrack(s, F, [[40, 5, 120], [70, 5, 96]]);                // across the leaf, past the wheel
  inkHole(s, F, 86, 5, 70, 7);
  inkScorch(s, F, 40, 6, 66, 16);
  inkCrack(s, F, [[24, 4, 20], [14, 4, 26]]);                 // the sill, kicked off its lip
});

const doorBlast = (s) => paintPaperFixture(s, 'door-blast', (_s, { F }) => {
  inkTear(s, F, [[30, 6, 120], [70, 6, 150], [110, 6, 124]]);
  inkHole(s, F, 60, 6, 100, 9);
  inkScorch(s, F, 100, 6, 70, 22);
  inkCrack(s, F, [[45, 4, 220], [38, 4, 232]]);               // a roller, torn off the track
});

const deckHatch = (s) => paintPaperFixture(s, 'deck-hatch', (_s, { F }) => {
  inkCrack(s, F, [[20, 59, 4], [44, 59, 14]]);                // the coaming, split
  inkHole(s, F, 75, 59, 14, 7);
  inkScorch(s, F, 40, 59, 14, 16);
  inkCrack(s, F, [[78, 112, 40], [86, 112, 26]]);             // a stanchion, bent out
  inkWire(s, F, [43, 88, -20], [30, 80, -30], [24, 70, -44]); // a cable down the well
});

const conduitRun = (s) => paintPaperFixture(s, 'conduit-run', (_s, { F }) => {
  inkWire(s, F, [132, 0, 228], [120, 0, 212], [104, 0, 208]);  // a cable, torn out of the tray
  inkHole(s, F, 176, 0, 228, 5);
  inkScorch(s, F, 44, 0, 228, 12);
  inkCrack(s, F, [[224, 14, 234], [232, 20, 240]]);            // a bracket, pulled off the wall
});

const ventGrille = (s) => paintPaperFixture(s, 'vent-grille', (_s, { F }) => {
  inkCrack(s, F, [[10, 4, 240], [30, 4, 222]]);
  inkHole(s, F, 40, 4, 216, 6);
  inkScorch(s, F, 20, 4, 208, 12);
  inkTear(s, F, [[7, 0, 236], [20, 0, 232]]);                 // a blade, sprung out of the frame
});

const extractorFan = (s) => paintPaperFixture(s, 'extractor-fan', (_s, { F }) => {
  inkCrack(s, F, [[16, 8, 246], [34, 8, 232]]);
  inkHole(s, F, 52, 8, 212, 7);
  inkScorch(s, F, 24, 8, 206, 14);
  inkWire(s, F, [38, 5, 226], [28, 4, 206], [20, 4, 196]);    // the motor lead, hanging
});

// ⭐ THE ONE TWIN WHOSE MARKS ARE PLACED BY WHAT THE PRISTINE PIECE IS *FILLED* WITH, and the first
// draft got it wrong in a way no assertion in this repo can see. The porthole's glass is the set's
// only INK-FILLED area; an `inkCrack` and an `inkHole` authored across it are black on black and
// contribute nothing — invisible damage on the one piece whose identity is that black disc. Seen on
// `client/tools/shots-paper-fixtures/paper-fixtures-twins.png`, not reasoned out. Every mark now
// lands on PAPER: the frame's annulus (r 29–39 from the port's centre) and the hull around it, so the
// glass stays whole — which is also the better story, since a porthole that has cracked its frame and
// held is exactly what a post-raid deck looks like.
const hullPort = (s) => paintPaperFixture(s, 'hull-port', (_s, { F }) => {
  inkCrack(s, F, [[8, 3, 132], [20, 3, 142]]);                // out of the hull, across the frame
  inkHole(s, F, 78, 4, 178, 6);                               // punched through the frame's far side
  inkScorch(s, F, 86, 6, 132, 11);                            // on the hull, clear of the glass
  inkCrack(s, F, [[16, 2, 113], [6, 2, 120]]);                // the drip rail, torn
});

const bulkheadScreen = (s) => paintPaperFixture(s, 'bulkhead-screen', (_s, { F }) => {
  inkCrack(s, F, [[16, 4, 176], [50, 4, 150], [92, 4, 160]]);
  inkCrack(s, F, [[50, 4, 150], [44, 4, 134]]);
  inkHole(s, F, 64, 4, 168, 7);
  inkScorch(s, F, 26, 4, 142, 14);
  inkWire(s, F, [20, 6, 126], [10, 6, 118], [8, 4, 114]);     // the feed, torn out of the bezel
});

const armsRack = (s) => paintPaperFixture(s, 'arms-rack', (_s, { F }) => {
  inkCrack(s, F, [[3, 4, 106], [40, 4, 114]]);                // the retaining rail, bent
  inkHole(s, F, 52, 10, 64, 7);
  inkScorch(s, F, 84, 12, 92, 16);
  inkTear(s, F, [[81, 12, 78], [88, 12, 112]]);               // the short arm, out of its rest
});

const deckMarker = (s) => paintPaperFixture(s, 'deck-marker', (_s, { F }) => {
  inkCrack(s, F, [[8, 4, 214], [30, 4, 200]]);
  inkHole(s, F, 20, 4, 206, 5);
  inkScorch(s, F, 60, 4, 200, 10);
  inkCrack(s, F, [[60, 4, 196], [68, 4, 192]]);               // the far stud, out of the wall
});

// ⛔ RE-ANCHORED 2026-08-06, WITH THE PIECE IT DAMAGES. `drawLampSconce` was redrawn on the owner's
// ruling ("i have no clue what lamp-sconce does show") and every mark below was authored in ABSOLUTE
// centimetres against the drawing it replaced — the cone that ran z 190…204 narrow-side-up, and the
// 24 × 24 plate at z 208…232. Left alone they would have hung in clean paper inside the box, which is
// exactly the defect `paper-resources.test.js`'s anchoring guard is named for, one catalogue over.
// The four marks below were re-derived against the shipped geometry: the shade is now the tapered
// `cone(23, 6, 206, 220, 9, 12)` at y = 6, the bulb is a ∅11 face circle at (23, 6, 199), and the
// backplate is `bx(16, 17, 222, 14, 18, 5)`.
// ⛔ AND THE RE-ANCHORING IS A JUDGED REDRAW, NOT A VERIFIED ONE. The claim that stood here named
// `paper-resources.test.js`'s anchoring instrument as the check; that instrument CANNOT tell the two
// apart. Driven from a scratch probe pointed at this twin: the marks below read `4 marks / 17 anchors
// / 0 off-piece` — and the four PRE-redraw marks, authored against a drawing that no longer exists,
// put on this same painter read `4 marks / 17 anchors / 0 off-piece` too. Identical, both green.
// The cause is measured rather than guessed: `drawLampSconce`'s hatched `wallStub` is itself a drawn
// AREA spanning x 0…46 × z 182…240, so every anchor EITHER set lands in is "on the piece". Deleting
// the stub does separate them (stale 8 off-piece anchors, shipped 4) but is not an instrument
// either — with the wall gone the flex, which correctly hangs onto it, reads off-piece as well.
// ⭐ SO STATE WHAT IS ACTUALLY COVERED: gross detachment only — a mark clear of the piece AND of its
// wall stub. A check that could speak to RE-ANCHORING has to tie each mark to the feature it names,
// and that is the package this commit filed (extending the guard to the fourteen fixtures), not a
// line in this header. Until it exists, the four coordinate sets below are the designer's judgement.
const lampSconce = (s) => paintPaperFixture(s, 'lamp-sconce', (_s, { F }) => {
  inkCrack(s, F, [[15, 6, 210], [28, 6, 216]]);               // the shade, split along a rib
  // ⚠️ ON THE CONE AND NOT ON THE BULB: the bulb is an INK disc, so a hole drawn over it merges with
  // the light and reads as a bigger lamp rather than as damage — the same ink-on-ink trap the
  // porthole's twin above records, in its milder form. (Before the redraw the INK was the mouth; the
  // rule is the same and its subject moved.)
  inkHole(s, F, 18, 6, 209, 3);
  inkScorch(s, F, 23, 17, 230, 8);                            // the backplate, burned
  inkWire(s, F, [17, 17, 223], [13, 12, 212], [9, 6, 200]);   // the flex, hanging out of the plate
});

const growLamp = (s) => paintPaperFixture(s, 'grow-lamp', (_s, { F }) => {
  inkCrack(s, F, [[10, 4, 205], [40, 4, 196]]);
  inkHole(s, F, 66, 4, 200, 6);
  inkScorch(s, F, 24, 4, 198, 12);
  inkTear(s, F, [[14, 8, 224], [18, 8, 212]]);                // a suspension rod, parted
});

const floodLamp = (s) => paintPaperFixture(s, 'flood-lamp', (_s, { F }) => {
  inkCrack(s, F, [[10, 4, 262], [30, 4, 248]]);
  inkHole(s, F, 34, 4, 254, 6);
  inkScorch(s, F, 20, 4, 246, 12);
  inkCrack(s, F, [[46, 30, 272], [52, 33, 268]]);             // the knuckle, sheared
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// — lane/paper-machines — THE THIRTEEN MACHINE TWINS (2026-08-05)
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Same construction as the nine fittings twins above, on the other module's frame: re-run the
// PRISTINE painter (`machines.paintMachine`), then ink damage in the piece's own centimetres. The
// five marks are the same five ideas — crack, tear, hole, scorch, wire — because a raid does the same
// things to a reactor that it does to a chair; what changes is WHERE, and each mark below is placed
// on a part the piece actually has, named in its comment.
//
// ⚠️ THE MOCK'S OWN PREMISE IS THE RULE HERE TOO: *"each keeps one identifying feature so it still
// reads as the same object."* Nothing below removes the thing a piece is recognised by. The reactor
// keeps its containment ring and its lamp bank; the wing keeps its grid; the bottles keep their yoke;
// the cot keeps its cross. The damage is over the top of that, never instead of it.
const reactorPlant = (s) => paintMachine(s, 'reactor-plant', (_s, { F }) => {
  inkCrack(s, F, [[60, 0, 140], [96, 0, 104]]);           // across the inspection door
  inkHole(s, F, 130, 0, 110, 9);                          // …and through it
  inkScorch(s, F, 20, 24, 120, 22);                       // up the near coolant stack
  inkCrack(s, F, [[80, 32, 180], [96, 32, 166]]);         // the drum, struck beside the hazard plate
  inkWire(s, F, [176, 24, 90], [192, 24, 70], [172, 24, 48]);  // a loom, torn off the far stack
});

const solarWing = (s) => paintMachine(s, 'solar-wing', (_s, { F }) => {
  // ⚠️ EVERY MARK ON THE PANEL IS ON THE PANEL'S OWN PLANE, which runs (y 12, z 36) → (y 80, z 170),
  // i.e. `z = 36 + (y − 12)·134/68`. A mark authored off that plane renders as a stroke floating
  // beside the wing — visible in a render, invisible to every string assertion in the suite.
  inkTear(s, F, [[60, 25.6, 62.8], [110, 46, 103], [150, 66.4, 143.2]]);   // a crack up the cells
  inkHole(s, F, 180, 46, 103, 10);                        // …and a cell punched out
  inkScorch(s, F, 50, 66.4, 143.2, 20);
  inkCrack(s, F, [[206, 80, 0], [212, 72, 30]]);          // the far mast, bent at the deck
});

const bottleRack = (s) => paintMachine(s, 'bottle-rack', (_s, { F }) => {
  inkHole(s, F, 47, 6, 90, 8);                            // the far bottle, holed through its label
  inkCrack(s, F, [[17, 6, 110], [27, 6, 80]]);
  inkScorch(s, F, 30, 4, 20, 16);
  inkWire(s, F, [30, 18, 96], [38, 14, 84], [30, 10, 70]);   // the upper strap, hanging
});

const reclaimerStack = (s) => paintMachine(s, 'reclaimer-stack', (_s, { F }) => {
  inkCrack(s, F, [[30, 0, 126], [54, 0, 96], [46, 0, 70]]);  // across the sight glass
  inkHole(s, F, 70, 0, 110, 8);
  inkScorch(s, F, 20, 0, 36, 18);
  inkCrack(s, F, [[92, 0, 40], [100, 0, 28]]);            // the clean-water spigot, snapped off
});

const pasteColumn = (s) => paintMachine(s, 'paste-column', (_s, { F }) => {
  inkDead(s, F, [[12, 0, 112], [58, 0, 112], [58, 0, 140], [12, 0, 140]]);  // the screen, dark
  inkCrack(s, F, [[35, 18, 90], [44, 14, 78]]);           // the spout, off its collar
  inkHole(s, F, 20, 0, 60, 7);
  inkScorch(s, F, 50, 0, 30, 16);
});

const medCot = (s) => paintMachine(s, 'med-cot', (_s, { F }) => {
  inkTear(s, F, [[100, 20, 64], [140, 50, 64], [180, 30, 64]]);   // the blanket, across the cross
  inkHole(s, F, 60, 40, 64, 9);
  inkScorch(s, F, 30, 30, 64, 18);
  inkWire(s, F, [6, 80, 104], [18, 84, 92], [6, 86, 74]);  // the monitor's loom, hanging
  inkCrack(s, F, [[186, 12, 40], [194, 12, 12]]);         // the far-right leg, kicked out
});

const fabCell = (s) => paintMachine(s, 'fab-cell', (_s, { F }) => {
  inkCrack(s, F, [[30, 0, 132], [70, 0, 100], [60, 0, 72]]);      // across the chamber window
  inkHole(s, F, 110, 0, 100, 9);
  inkScorch(s, F, 40, 0, 34, 18);
  inkTear(s, F, [[22, 0, 128], [62, 0, 122]]);            // the gantry rail, sagging off true
  inkCrack(s, F, [[128, 45, 168], [136, 45, 156]]);       // the extract, bent
});

const ringArray = (s) => paintMachine(s, 'ring-array', (_s, { F }) => {
  inkCrack(s, F, [[30, 125, 110], [52, 116, 110]]);       // the outer ring, parted on the spoke plane
  inkHole(s, F, 70, 70, 110, 10);                         // the hub, punched
  inkScorch(s, F, 110, 40, 110, 20);
  inkWire(s, F, [70, 70, 110], [88, 60, 88], [94, 50, 62]);  // a spoke, torn loose and hanging
});

const dishMast = (s) => paintMachine(s, 'dish-mast', (_s, { F }) => {
  inkTear(s, F, [[20, 34, 180], [50, 34, 158], [80, 34, 136]]);   // across the bowl
  inkHole(s, F, 60, 34, 150, 8);
  inkScorch(s, F, 30, 34, 170, 18);
  inkCrack(s, F, [[48.5, 34, 166], [40, 34, 148]]);       // the feed horn, off its struts
});

const plantPot = (s) => paintMachine(s, 'plant-pot', (_s, { F }) => {
  inkCrack(s, F, [[16, 28, 10], [24, 28, 34]]);           // the pot, split up one side
  inkScorch(s, F, 28, 28, 43, 14);                        // the soil, burnt
  inkTear(s, F, [[28, 8, 110], [24, 12, 94]]);            // the tallest leaf, broken over
  inkHole(s, F, 38, 28, 20, 5);
});

const bookCase = (s) => paintMachine(s, 'book-case', (_s, { F }) => {
  inkCrack(s, F, [[10, 4, 150], [40, 4, 120]]);
  inkHole(s, F, 60, 4, 100, 8);
  inkScorch(s, F, 30, 4, 40, 20);
  inkTear(s, F, [[8, 4, 52], [44, 4, 47]]);               // a shelf, sagging under its books
  inkCrack(s, F, [[91, 0, 20], [96, 0, 4]]);              // the far side panel, split at the plinth
});

const deckTurret = (s) => paintMachine(s, 'deck-turret', (_s, { F }) => {
  inkCrack(s, F, [[80, 44, 108], [92, 44, 124]]);         // the barrel, split
  inkHole(s, F, 44, 44, 50, 9);                           // the head, punched through
  inkScorch(s, F, 20, 30, 30, 18);
  inkWire(s, F, [22, 40, 50], [32, 36, 36], [20, 32, 20]);   // the belt, out of the feed box
});

const sleeperPod = (s) => paintMachine(s, 'sleeper-pod', (_s, { F }) => {
  inkCrack(s, F, [[26, 10, 140], [46, 10, 100], [38, 10, 64]]);   // the pane, cracked end to end
  inkHole(s, F, 52, 10, 110, 8);
  inkScorch(s, F, 42, 6, 30, 20);
  inkCrack(s, F, [[42, 42, 182], [54, 42, 172]]);         // the hood, stove in
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// — lane/warm-purge —
// THE TWELVE PAPER MATERIALS — post-raid twins for the six wall and six floor skins
//
// ⚠️ SAME CONSTRUCTION AS THE NINE FITTINGS, THE EIGHT GROUND STACKS, THE FOURTEEN FIXTURES AND THE
// THIRTEEN MACHINES ABOVE, AND FOR THE SAME REASON: each twin RE-RUNS its own pristine painter
// (`paper-materials.paintMaterial`) and then adds ink damage on the same frame. That is the only
// construction under which "the twin is the same wall, breached" survives a redraw of the wall.
//
// ⭐ AND ONE THING IS DIFFERENT HERE, WHICH IS WHY THIS BLOCK CARRIES ITS OWN VOCABULARY. A fitting,
// a fixture, a machine and a ground stack are all OBJECTS: each has a `SPECS` row, so its frame is a
// fact about the piece and `inkCrack(s, F, [[x, y, z]…])` can be authored in absolute centimetres.
// A MATERIAL IS A TILING FIELD WITH NO INTRINSIC EXTENT — the caller's box aspect is the statement of
// how many metres it wants (`paper-materials.js`'s header), so the SAME skin is 100 × 100 cm on a
// floor tile, 100 × 240 cm on a wall slab and a 100 × 100 cm CROP on a palette chip. A mark authored
// at "38 cm up" would sit at mid-height on the chip, a sixth of the way up the slab, and in a third
// place again on the floor. So every mark below is authored in NORMALISED coordinates of the frame —
// a fraction across `g.wCm` and a fraction down `g.hCm` — and converted through `g` at draw time. The
// damage then lies on the same part of the material at every one of the three call sites.
//
// ⛔ NO OXBLOOD, IN ANY OF THEM. `paper-materials.js`'s own header states it for the pristine skins
// and it extends unchanged to the damage: `ATTEND` is attention, faults and queued orders, and a
// breached wall is a fact about the ship, not an alert about it. Ink, paper and the flat side tone
// are the whole palette; `paper-materials.test.js` closes over it on both the raw and treated twin.
//
// ⚠️ EACH TWIN CARRIES ITS OWN PIECE'S DAMAGE, TRANSCRIBED FROM THE WARM TWIN IT REPLACES
// (`docs/design/perilune-item-set.dc.html`, the "Wrecked — post-raid state" section, and the warm
// builders that stood in this file's `── WALLS ──` / `── FLOORS ──` blocks until 2026-08-06). A
// cracked glass partition is not a rusted grating: the mock's own marks, in the mock's own places,
// re-expressed on a 106 × 94 card mapped to `u = 0.5 + x/106`, `v = 0.5 + y/94`.
//
// ⚠️ WHAT THE INK DIALECT CANNOT SAY, SAID OUT LOUD: THERE IS NO OXIDE MARK. The warm twins carry
// `rust()`, an oxblood-brown ellipse, on seven of the twelve — and brown is not in this palette, so
// it cannot be transcribed as itself. It is carried as a WIDER, FAINTER `matScorch` bloom (0.10
// against a burn's 0.16, and half again the radius): the same stain in the same place, distinguished
// from a burn by size and weight rather than by hue. That is a LOSS and it is named rather than
// hidden — a reader comparing the two sets will find seven blooms where the mock had a burn and a
// stain, and this note is the reason.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE MATERIAL TWINS' INK VOCABULARY — the four marks, in the SKIN'S OWN NORMALISED FRAME.
 *
 * ⛔ NOT `fittings.line`/`disc`: those project through a fitting's `roomFrame` (x across, y BACK, z
 * up) and there is no such frame here — a skin is a flat field, and `g` maps `x/y/z/u` in
 * centimetres of its own extent. Handing them `g` would be handing a projector a frame it was not
 * built for. These four are the same four IDEAS (`inkCrack`/`inkTear`/`inkHole`/`inkScorch`) drawn
 * against `g` instead, and nothing here is new ink: the weights are `fittings.W`'s five rungs, which
 * is the ramp every one of the twelve skins is already drawn on.
 *
 * `u` runs 0 → 1 LEFT to RIGHT across `g.wCm`; `v` runs 0 → 1 TOP to BOTTOM down `g.hCm`.
 * A RADIUS is a fraction of the frame's SHORTER side, so a hole is round on a 1 : 2.4 wall slab and
 * round on a square floor tile, rather than an ellipse on one of them.
 */
const mx = (g, u) => g.x(u * g.wCm);
const my = (g, v) => g.y(v * g.hCm);
const mr = (g, f) => g.u(f * Math.min(g.wCm, g.hCm));
const mPts = (g, pts) => pts.map(([u, v], i) => `${i ? 'L' : 'M'}${mx(g, u)} ${my(g, v)}`).join(' ');

/** A SPLIT — the mock's `crack()`, as a kinked polyline. Heavier than any rule the skins draw except
 *  `hull-plating`'s strake, so damage reads OVER the field rather than joining it. */
const matCrack = (s, g, pts) => s.path(mPts(g, pts), { fill: 'none', stroke: INK, sw: W.heavy });

/** A TEAR — a sprung slat, a lifted bar, a spall flake, a frayed edge. Dashed, in centimetres of the
 *  skin's own frame, so the dash pitch is the same length of material at every call size. */
const matTear = (s, g, pts) =>
  s.path(mPts(g, pts), {
    fill: 'none', stroke: INK, sw: W.fine, opacity: 0.85, dash: `${g.u(3)} ${g.u(2)}`,
  });

/**
 * A BREACH — a hole THROUGH the surface.
 *
 * ⚠️ AN EIGHT-GON, NOT A DISC, AND NOT FULLY FILLED — both halves are the mock's own decisions read
 * forward. The warm `hole()` carries `border-radius:52% 42% 56% 44%`, whose whole purpose is that a
 * breach is not a circle; the eight authored radius multipliers below are that asymmetry, and they
 * are LITERALS because this file has no scatter term anywhere in it (see the header: damage looks
 * like randomness, and a builder that reached for `Math.random` would present as a golden-frame
 * flake rather than as a bug).
 *
 * ⛔ AND THE FILL IS 0.55, NOT SOLID, BECAUSE OF `paper-materials.js`'s NO-LARGE-SOLID-FILLS RULE.
 * The largest breach in the set is `hull-plating`'s at f = 0.22, i.e. ~12.5 % of the tile; solid it
 * would be a mean darkening of 12.5 %, against the darkest thing in the pristine set (the grating's
 * open slots, 32 % at 0.30 ≈ 9.6 % mean). At 0.55 it is ~6.9 % — the darkest mark on a damaged tile,
 * which is right, and still inside the ceiling the skins hold themselves to. The rim is `W.mass`, so
 * the breach reads by its EDGE at tile size, where any interior tone is one grey pixel.
 */
const HOLE_LOBES = [1, 0.86, 1.04, 0.9, 0.98, 0.84, 1.06, 0.92];
const matHole = (s, g, u, v, f) => {
  const cx = mx(g, u);
  const cy = my(g, v);
  const r = mr(g, f);
  const d = HOLE_LOBES
    .map((k, i) => {
      const a = (i / HOLE_LOBES.length) * Math.PI * 2;
      return `${i ? 'L' : 'M'}${r3(cx + r * k * Math.cos(a))} ${r3(cy + r * k * Math.sin(a))}`;
    })
    .join(' ') + ' Z';
  s.path(d, { fill: INK, opacity: 0.55 });
  s.path(d, { fill: 'none', stroke: INK, sw: W.mass });
};

/** A BURN — the mock's `scorch()`, as a soft ink bloom. The default 0.16 is `wrecked.js`'s own
 *  `inkScorch` opacity; the OXIDE blooms that stand in for `rust()` pass 0.10 and a wider radius
 *  (see the block header for why there is no second mark for them). */
const matScorch = (s, g, u, v, f, opacity = 0.16) =>
  s.circle({ cx: mx(g, u), cy: my(g, v), r: mr(g, f), fill: INK, opacity });

// ── WALLS ────────────────────────────────────────────────────────────────────────────────────

// STEEL BULKHEAD · 8% — the mock: one breach left of centre, two splits (one steep, one shallow
// across the top-left), a burn low-right and an oxide stain low-left. The RIVETED PLATE is left
// whole: it is this wall's identifying feature and the reason it is not `hull-plating`.
const steelBulkhead = (s, env) => paintMaterial(s, 'steel-bulkhead', env, (_s, g) => {
  matCrack(s, g, [[0.635, 0.131], [0.707, 0.357], [0.855, 0.528]]);   // the steep split, plate to plate
  matCrack(s, g, [[0.088, 0.31], [0.204, 0.213], [0.346, 0.18]]);     // …and the shallow one above it
  matHole(s, g, 0.368, 0.564, 0.2);                                   // punched through, between the courses
  matScorch(s, g, 0.783, 0.755, 0.18);
  matScorch(s, g, 0.179, 0.819, 0.18, 0.1);                           // the oxide stain, low on the plate
});

// TIMBER-LINED WALL · 17% — the mock: a breach right of centre, ONE long split running with the
// grain, a burn high on the boarding and a stain low-right. The BOARD COURSES survive, which is the
// piece's whole identity ("horizontal warm-wood planks").
const timberLinedWall = (s, env) => paintMaterial(s, 'timber-lined-wall', env, (_s, g) => {
  matCrack(s, g, [[0.222, 0.168], [0.234, 0.385], [0.326, 0.577]]);   // split down four board courses
  matHole(s, g, 0.613, 0.606, 0.17);                                  // a board stove in
  matScorch(s, g, 0.443, 0.181, 0.2);                                 // charring, high on the boarding
  matScorch(s, g, 0.821, 0.819, 0.165, 0.1);                          // damp stain at the skirting end
});

// BLAST WALL · 12% — the mock: a breach left of centre, a steep split right, a burn low-right, a
// stain low-left. ⚠️ THE HAZARD BAND IS NOT MARKED AND THAT IS DELIBERATE: it is the one thing that
// says this slab is not `steel-bulkhead`, and the mock's own premise for its seventy is that each
// twin keeps one identifying feature so it still reads as the same object.
const blastWall = (s, env) => paintMaterial(s, 'blast-wall', env, (_s, g) => {
  matCrack(s, g, [[0.676, 0.227], [0.728, 0.437], [0.853, 0.603]]);   // through the armour, past the band
  matHole(s, g, 0.406, 0.628, 0.15);                                  // punched below the hazard bar
  matScorch(s, g, 0.783, 0.798, 0.15);
  matScorch(s, g, 0.179, 0.84, 0.15, 0.1);                            // oxide, at the bolted stile
});

// GLASS PARTITION · 2% — THE MOST DAMAGED PIECE IN THE SET AND THE ONE WHOSE CHARACTER IS ENTIRELY
// ITS OWN: the mock gives it FIVE cracks and TWO spall flakes and no oxide at all, because glass does
// not rust — it stars, and then it drops flakes. Three of the five cracks run corner to corner across
// the glazing rather than stopping at a mullion, which is what says the whole sheet went at once.
const glassPartition = (s, env) => paintMaterial(s, 'glass-partition', env, (_s, g) => {
  matCrack(s, g, [[0.044, 0.328], [0.418, 0.556], [0.842, 0.586]]);   // the long star, right across
  matCrack(s, g, [[0.422, 0.814], [0.587, 0.533], [0.842, 0.356]]);   // the second, rising
  matCrack(s, g, [[0.135, 0.475], [0.212, 0.721], [0.375, 0.908]]);   // …and the third, into the sill
  matHole(s, g, 0.726, 0.309, 0.12);                                  // a light gone entirely
  matHole(s, g, 0.33, 0.777, 0.09);                                   // and a smaller one, low
  matTear(s, g, [[0.055, 0.814], [0.265, 0.91]]);                     // a spall flake, on the sill
  matTear(s, g, [[0.701, 0.864], [0.865, 0.817]]);                    // and its pair
});

// INSULATED WALL · 21% — the mock's tell is that the breach EXPOSES THE BATT: it draws a tan panel
// inside the hole, the one twin in the walls block with a second layer in its wound. Here the batt
// shows as a tear laid ACROSS the breach, which is the sewn panel opened rather than a colour.
const insulatedWall = (s, env) => paintMaterial(s, 'insulated-wall', env, (_s, g) => {
  matCrack(s, g, [[0.199, 0.144], [0.233, 0.369], [0.348, 0.558]]);   // down the stud line
  matHole(s, g, 0.651, 0.585, 0.16);                                  // the facing, punched
  matTear(s, g, [[0.547, 0.585], [0.755, 0.585]]);                    // …the batt behind it, opened
  matScorch(s, g, 0.425, 0.181, 0.16);
  matScorch(s, g, 0.821, 0.84, 0.15, 0.1);                            // oxide, at the bottom rail
});

// HULL PLATING · 7% — the mock's ONE mark nothing else in the set carries: a COLD BLOOM in the
// breach (`shade:[14,'rgba(90,140,180,.35)']`), which is vacuum showing through the ship. It is the
// biggest hole in the twelve and it is the only one drawn inside a second, wider, fainter ring — the
// cold reaching out of the hole into the plating around it. The WELDED STRAKES survive.
const hullPlating = (s, env) => paintMaterial(s, 'hull-plating', env, (_s, g) => {
  matScorch(s, g, 0.443, 0.521, 0.31, 0.09);                          // the cold bloom, around the breach
  matHole(s, g, 0.443, 0.521, 0.22);                                  // …and the breach itself, to vacuum
  matCrack(s, g, [[0.678, 0.102], [0.751, 0.292], [0.888, 0.429]]);   // a strake, split off its lap
  matScorch(s, g, 0.764, 0.777, 0.16);
  matScorch(s, g, 0.179, 0.84, 0.165, 0.1);                           // oxide, low on the plate
});

// ── FLOORS ───────────────────────────────────────────────────────────────────────────────────

// STEEL-TAN FLOOR · 35% — the LEAST damaged piece in the set, and the mock draws it that way: no
// oxide, no tear, just a breach and two splits crossing the deck plate with one burn. It is the
// authored deck, so its twin has to stay the quietest damage in the twelve for the same reason the
// pristine skin is the quietest drawing.
const steelTanFloor = (s, env) => paintMaterial(s, 'steel-tan-floor', env, (_s, g) => {
  matCrack(s, g, [[0.479, 0.255], [0.67, 0.403], [0.899, 0.447]]);    // across the plate
  matCrack(s, g, [[0.31, 0.878], [0.424, 0.744], [0.576, 0.675]]);    // …and back the other way
  matHole(s, g, 0.33, 0.649, 0.16);                                   // through, beside a screw
  matScorch(s, g, 0.745, 0.734, 0.17);
});

// WOOD PLANK FLOOR · 29% — the mock's tell is a LIFTED PLANK: a board-shaped sliver lying at 14° to
// the courses, which is a thing only a plank floor can do. Carried as a tear along that same axis,
// so it still crosses the boards rather than lying along one.
const woodPlankFloor = (s, env) => paintMaterial(s, 'wood-plank-floor', env, (_s, g) => {
  matCrack(s, g, [[0.089, 0.579], [0.283, 0.678], [0.495, 0.676]]);   // a board, split end to end
  matHole(s, g, 0.651, 0.394, 0.15);                                  // burnt through two courses
  matTear(s, g, [[0.627, 0.733], [0.939, 0.82]]);                     // …and one sprung off its nails
  matScorch(s, g, 0.425, 0.819, 0.18);
});

// GROW MATTING · 5% — the mock gives this one NO CRACK AT ALL, and that is the honest difference
// between a woven mat and a slab: matting does not split, it burns, stains and TEARS. A torn strap
// lying across the weave at 18° is its whole character.
const growMatting = (s, env) => paintMaterial(s, 'grow-matting', env, (_s, g) => {
  matHole(s, g, 0.349, 0.394, 0.15);                                  // burnt clean through the lattice
  matTear(s, g, [[0.112, 0.739], [0.435, 0.857]]);                    // a strap, torn out of the weave
  matScorch(s, g, 0.689, 0.649, 0.2);
  matScorch(s, g, 0.783, 0.245, 0.165, 0.1);                          // the wet stain a grow deck gets
});

// CREAM TILE FLOOR · 33% — the mock: TWO long splits crossing at a shallow angle and a small breach
// in a corner, with one burn. That is what a tiled floor does — it cracks along its grout runs rather
// than holing — and it is why the two splits here are the longest marks on any floor in the set.
const creamTileFloor = (s, env) => paintMaterial(s, 'cream-tile-floor', env, (_s, g) => {
  matCrack(s, g, [[0.136, 0.338], [0.386, 0.503], [0.675, 0.535]]);   // across four tiles
  matCrack(s, g, [[0.506, 0.798], [0.649, 0.651], [0.833, 0.585]]);   // …crossing the first
  matHole(s, g, 0.255, 0.755, 0.12);                                  // one tile gone entirely
  matScorch(s, g, 0.764, 0.266, 0.15);
});

// METAL GRATING · 26% — the mock's tell is a LIFTED BEARING BAR: a long thin sliver at 16°, the one
// mark that says this floor is made of separate bars you can prise up. The OPEN SLOTS survive — they
// are the piece's identity and the reason a dropped part is gone.
const metalGrating = (s, env) => paintMaterial(s, 'metal-grating', env, (_s, g) => {
  matCrack(s, g, [[0.092, 0.271], [0.262, 0.375], [0.455, 0.388]]);   // a cross rod, snapped
  matHole(s, g, 0.67, 0.606, 0.17);                                   // bars gone, a hole in the walkway
  matTear(s, g, [[0.168, 0.761], [0.53, 0.878]]);                     // …and one bar prised up
  matScorch(s, g, 0.217, 0.755, 0.14);
  matScorch(s, g, 0.802, 0.223, 0.15, 0.1);                           // oxide, where the rod sheared
});

// CARPET FLOOR · 15% — the mock gives this one TWO breaches and NO crack: carpet does not split, it
// burns holes. Its second tell is a FRAYED BAND running the full width low on the tile, which is the
// piece's own border going. The border is what separates carpet from `grow-matting`, so the fray is
// drawn ON it rather than anywhere else.
const carpetFloor = (s, env) => paintMaterial(s, 'carpet-floor', env, (_s, g) => {
  matHole(s, g, 0.311, 0.585, 0.15);                                  // burnt through the pile
  matHole(s, g, 0.726, 0.33, 0.11);                                   // and again, smaller
  matTear(s, g, [[0.028, 0.862], [0.972, 0.862]]);                    // the border, frayed right across
  matScorch(s, g, 0.689, 0.755, 0.18);
});

// ── the registry ─────────────────────────────────────────────────────────────────────────────

/**
 * `WRECKED[pristineItemId] = { paint, state }`.
 *
 *  paint      the pure painter — never called directly; `buildWrecked()` wraps it in the harness
 *  state      the remaining-condition badge: `'0%'`–`'35%'`, or `'—'` for the 8 loose ground
 *             stacks, which cannot be repaired at all, only written off
 *
 * ⚠️ `mockLabel` IS GONE, AND THE FIELD'S DELETION IS THE PACKAGE (lane/warm-purge, 2026-08-06).
 * It carried the label the mock's WRECKED section used, and it existed so that a HAND TRANSCRIPTION
 * of seventy drawings could be checked row-for-row against the document it came from. No twin in this
 * file is a transcription of anything any more: every one of the eighty re-runs its OWN pristine
 * painter and adds ink damage, so there is no second document for a label to disagree with. Where the
 * drawing came from is now a fact about the twin's SOURCE MODULE, and it lives once, in `TWIN_SOURCE`.
 *
 * Key order is `ITEM_IDS` order MINUS `NO_WRECKED_TWIN` (below), and the test asserts that by strict
 * deep-equality: a registry row added without a twin AND without a ledger entry, or a twin for a row
 * that does not exist, fails.
 */
export const WRECKED = Object.freeze({
  // ── THE TWENTY-ONE RESTYLED FITTINGS (P2b) — the mock's own furniture, re-authored on paper ──
  // Each one WAS a mock transcription in `#33281b` and carried a real `mockLabel`; lane/warm-purge
  // re-drew all twenty-one by the construction the nine below already used (re-run the pristine
  // painter, add ink damage). The warm rows they used to sit beside are gone from `index.js` in the
  // same commit, which is why this block leads the table now.
  'battery-bank':     { paint: batteryBank,    state: '0%' },
  'o2-scrubber':      { paint: o2Scrubber,     state: '17%' },
  'hydroponics':      { paint: hydroponics,    state: '9%' },
  'cooker':           { paint: cooker,         state: '15%' },
  'cooler':           { paint: cooler,         state: '8%' },
  'dining-table':     { paint: diningTable,    state: '22%' },
  'bunk-bed':         { paint: bunkBed,        state: '25%' },
  'desk':             { paint: desk,           state: '28%' },
  'chair':            { paint: chair,          state: '31%' },
  'locker':           { paint: locker,         state: '20%' },
  'rug':              { paint: rug,            state: '12%' },
  'standing-lamp':    { paint: standingLamp,   state: '5%' },
  'research-console': { paint: researchConsole, state: '7%' },
  'workbench':        { paint: workbench,      state: '26%' },
  'storage-crate':    { paint: storageCrate,   state: '30%' },
  'fuel-drum':        { paint: fuelDrum,       state: '21%' },

  // ── THE TWELVE MATERIALS (2026-08-06) — six walls, six floors ──
  // ⭐ THE ONE POPULATION WHOSE DAMAGE IS AUTHORED IN NORMALISED COORDINATES rather than in absolute
  // centimetres: a skin is a tiling FIELD with no intrinsic extent, so the same mark has to land on
  // the same part of the material on a 1 m floor tile, a 2.4 m wall slab and a 26 px palette chip.
  // See the block header above `matCrack` for the whole argument.
  'steel-bulkhead':   { paint: steelBulkhead,  state: '8%' },
  'timber-lined-wall': { paint: timberLinedWall, state: '17%' },
  'blast-wall':       { paint: blastWall,      state: '12%' },
  'glass-partition':  { paint: glassPartition, state: '2%' },
  'insulated-wall':   { paint: insulatedWall,  state: '21%' },
  'hull-plating':     { paint: hullPlating,    state: '7%' },
  'steel-tan-floor':  { paint: steelTanFloor,  state: '35%' },
  'wood-plank-floor': { paint: woodPlankFloor, state: '29%' },
  'grow-matting':     { paint: growMatting,    state: '5%' },
  'cream-tile-floor': { paint: creamTileFloor, state: '33%' },
  'metal-grating':    { paint: metalGrating,   state: '26%' },
  'carpet-floor':     { paint: carpetFloor,    state: '15%' },

  // ── THE FIVE FITTINGS THAT SIT IN THE MOCK'S OLD "FIXTURES" RUN ──
  'pipe-run':         { paint: pipeRun,        state: '10%' },
  'space-heater':     { paint: spaceHeater,    state: '3%' },
  'shelf-rack':       { paint: shelfRack,      state: '24%' },
  'supply-barrel':    { paint: supplyBarrel,   state: '18%' },
  'herb-planter':     { paint: herbPlanter,    state: '4%' },

  // ── FITTINGS (9, VR-P2) — the catalogue rows the mock never had ──
  // Their `state` badges are AUTHORED (the catalogue publishes no condition figures) and are spread
  // across the same 2–31% band the mock used, so nothing on screen can tell a repo-authored badge
  // from a transcribed one — which is correct: a badge is a fact about a device, not about a document.
  'bench':            { paint: bench,        state: '19%' },
  'stool':            { paint: stool,        state: '6%' },
  'cot':              { paint: cot,          state: '23%' },
  'footlocker':       { paint: footlocker,   state: '12%' },
  'sink':             { paint: sink,         state: '8%' },
  'compost-bin':      { paint: compostBin,   state: '27%' },
  'vice-post':        { paint: vicePost,     state: '15%' },
  'curtain-rail':     { paint: curtainRail,  state: '2%' },
  'shrine-shelf':     { paint: shrineShelf,  state: '31%' },

  // ── CAPSULES AND CELLS (3, 2026-08-05) — FROM THE CATALOGUE ──
  //
  // ⭐ `cell-sound`'s TWIN IS NOT INK DAMAGE ON THE PRISTINE PIECE, AND IT IS THE ONLY ONE IN THIS
  // FILE THAT IS NOT. It is catalogue 34, CELL SPENT — a drawing the OWNER made of exactly this
  // state: one terminal sunk, one band of four, both walls bowed, a crack and a weep, the whole thing
  // in the accent. Every other twin re-runs its pristine painter because "the twin is the same
  // object, damaged" has no other author; here it has one, and inventing a second set of ink marks
  // over the sound cell would put a repo-authored wreck on screen while the design's own went
  // unreachable. ⇒ THE STANDING RULE IS UNCHANGED AND WORTH RESTATING: re-run the pristine painter
  // UNLESS the design ships the damaged drawing itself, which so far it has done exactly once.
  // ⚠️ IT IS THEREFORE THE ONE NAMED EXCEPTION to the prefix guard in `client/test/wrecked.test.js`
  // ("a twin IS its pristine piece plus damage"), by id and with this reason quoted beside it.
  //
  // ⚠️ `cell-spent` HAS NO ROW HERE OF ITS OWN — it is in `NO_WRECKED_TWIN` below, for `turnings`'
  // reason. And `wreckedInfo` takes a twin's `size` from its PRISTINE row, so the spent cell reports
  // `cell-sound`'s footprint (73 × 112) rather than its own (94 × 112, the swell). That is the
  // existing contract, not a defect: `size` is a placement HINT nothing lays out on today, and a twin
  // claiming a different footprint from the thing it replaces is the drift the shared field prevents.
  'capsule-sealed':   { paint: capsuleSealed, state: '5%' },
  'capsule-open':     { paint: capsuleOpen,   state: '17%' },
  'cell-sound':       { paint: cellSound,     state: '0%' },

  // ── PAPER GROUND STACKS (8) — lane/paper-resources ──────────────────────────────────────────
  //
  // ⚠️ `state: '—'` ON ALL EIGHT: the em-dash means "cannot be repaired, only written off", which is
  // true of matter and false of machinery. A percentage here would promise a repair verb that does
  // not exist for a pile. ⇒ The state census in `wrecked.test.js` therefore moves on the DASH side
  // and not on the percentage side, which is the tell that a package added resources, not devices.
  'spoil-heap':       { paint: spoilHeap,    state: '—' },
  'tuber-crate':      { paint: tuberCrate,   state: '—' },
  'plate-offcut':     { paint: plateOffcut,  state: '—' },
  'gear-set':         { paint: gearSet,      state: '—' },
  'control-card':     { paint: controlCard,  state: '—' },
  'seal-set':         { paint: sealSet,      state: '—' },
  'ice-block':        { paint: iceBlock,     state: '—' },
  'body-bag':         { paint: bodyBag,      state: '—' },

  // ── THE PAPER FIXTURES (14, 2026-08-05) — the ship's architecture, redrawn ──
  'door-sliding':     { paint: doorSliding,    state: '21%' },
  'door-airlock':     { paint: doorAirlock,    state: '3%' },
  'door-blast':       { paint: doorBlast,      state: '13%' },
  'deck-hatch':       { paint: deckHatch,      state: '26%' },
  'conduit-run':      { paint: conduitRun,     state: '7%' },
  'vent-grille':      { paint: ventGrille,     state: '30%' },
  'extractor-fan':    { paint: extractorFan,   state: '9%' },
  'hull-port':        { paint: hullPort,       state: '5%' },
  'bulkhead-screen':  { paint: bulkheadScreen, state: '0%' },
  'arms-rack':        { paint: armsRack,       state: '17%' },
  'deck-marker':      { paint: deckMarker,     state: '24%' },
  'lamp-sconce':      { paint: lampSconce,     state: '4%' },
  'grow-lamp':        { paint: growLamp,       state: '11%' },
  'flood-lamp':       { paint: floodLamp,      state: '6%' },

  // ── MACHINES (13, 2026-08-05) — the ship's own plant, which no design document draws ──
  'reactor-plant':    { paint: reactorPlant,   state: '3%' },
  'solar-wing':       { paint: solarWing,      state: '12%' },
  'bottle-rack':      { paint: bottleRack,     state: '7%' },
  'reclaimer-stack':  { paint: reclaimerStack, state: '14%' },
  'paste-column':     { paint: pasteColumn,    state: '20%' },
  'med-cot':          { paint: medCot,         state: '26%' },
  'fab-cell':         { paint: fabCell,        state: '10%' },
  'ring-array':       { paint: ringArray,      state: '5%' },
  'dish-mast':        { paint: dishMast,       state: '18%' },
  'plant-pot':        { paint: plantPot,       state: '29%' },
  'book-case':        { paint: bookCase,       state: '33%' },
  'deck-turret':      { paint: deckTurret,     state: '8%' },
  'sleeper-pod':      { paint: sleeperPod,     state: '16%' },
});

/**
 * REGISTRY ROWS THAT DELIBERATELY HAVE NO WRECKED TWIN — the same ledger idiom this repo keeps for
 * `NO_GROUND_ITEM_SPRITE` and `NO_DEVICE_GLYPH_ART`: a named entry with a reason, pinned by equality
 * in `client/test/wrecked.test.js`, so an omission has to be argued in a commit message rather than
 * accumulate as a default.
 *
 * ⚠️ IT WENT 3 → 2 ON 2026-08-06 AND THE ENTRY THAT LEFT WAS NOT A DECISION REVERSED. `swarf`'s
 * registry row was retired with the rest of the warm set, so its line went with it — which its own
 * entry, and `turnings`' below, both said in advance would happen.
 */
export const NO_WRECKED_TWIN = Object.freeze({
  'cell-spent':
    'A SPENT CELL IS ALREADY THE WRECKED STATE. Catalogue 34 is the drawing of a Battery below '
    + '`wear.WRECK_THRESHOLD`, and it is reached as `WRECKED[\'cell-sound\']` rather than by any '
    + 'glyph: `DeviceKind.Battery` has one `ForDevice` arm (`\'B\'`) and condition rides the '
    + '`devices` channel as a byte. So "a wrecked spent cell" names no state the sim can be in, and '
    + 'a twin for it would be a second wreck drawing behind a door with no key. The catalogue ships '
    + 'no fifth cell card either.',

  // — lane/paper-resources —
  turnings:
    'TURNINGS IS WHAT A MACHINE BECOMES when it is stripped below the Parts floor '
    + '(`deconstruct.device_swarf`), so "damaged turnings" names nothing the sim can reach — there '
    + 'is no second condition for a nest of cuttings to be in. ⚠️ THIS ENTRY USED TO END *"the '
    + 'moment `swarf` retires so does its line above"*, naming the warm `swarf` row that carried the '
    + 'SAME reason on the SAME material. That moment came on 2026-08-06: `swarf` is gone from the '
    + 'registry and its ledger line went with it, so this is now the only home the argument has. '
    + 'Drawing a twin here to make the eight into nine would be inventing a state the game does not '
    + 'have.',
});

/**
 * ⭐ WHERE EVERY TWIN'S DRAWING CAME FROM — a TOTAL ledger, one entry per row of `WRECKED`.
 *
 * ⛔ THIS REPLACED `NON_MOCK_TWIN`, AND IT IS A CHANGE OF KIND RATHER THAN OF CONTENTS. That ledger
 * was an EXCEPTION list (47 of 117 rows): "these twins are NOT the mock's". Two different facts were
 * riding on one map — where a drawing came from, and whether a row joins the mock bijection — and the
 * conflation was MEASURED, not theorised: the twelve materials genuinely ARE rows in
 * `docs/design/perilune-item-set.dc.html`'s `brokenD` array, so re-authoring them on paper made both
 * answers true at once and reddened three legs that could not both be satisfied. A total map has no
 * such tension: it answers only the first question, for every row, and there is no second question
 * left to ask because the bijection is gone (see the file header).
 *
 * ⇒ AND IT FAILS IN THE DIRECTION THE OLD ONE COULD NOT. `NON_MOCK_TWIN` could hide a row by ADDING
 * it — a row quietly moved into the exception list left the bijection green over a smaller set, which
 * is the fifth trap shape. Adding a row to a TOTAL map changes nothing at all, and OMITTING one fails
 * by name.
 *
 * THE VALUE'S SHAPE NAMES THE POPULATION, and each is checked against the shape ITS OWN source
 * implies (an inclusion test, `client/test/wrecked.test.js`) rather than against one pattern relaxed
 * enough for all five:
 *
 *   `NN NAME`              a card in `design-import/Perilune Fittings.dc.html` — a page a reader can
 *                          turn to. The name is the DOCUMENT's, the id is ours (`04` is `Table`).
 *   `MNN NAME`             a sheet entry in `client/tools/machines-sheet.mjs`. The `M` prefix is NOT
 *                          cosmetic: bare `01`…`13` would put two documents' numbering in one column.
 *   `PAPER FIXTURES · X`   a SECTION of `client/src/items/paper-fixtures.js` — there is no card.
 *   `PAPER RESOURCE · X`   a piece in `client/src/items/paper-resources.js` — there is no card.
 *   `PAPER MATERIAL · X`   a skin in `client/src/items/paper-materials.js` — there is no card.
 */
export const TWIN_SOURCE = Object.freeze({
  // — the twenty-one restyled fittings (P2b, 2026-08-06). Read off each card's own header.
  'battery-bank': '27 CELL RACK', 'o2-scrubber': '16 SCRUBBER', 'hydroponics': '20 GROW RACK',
  'cooker': '10 STOVE', 'cooler': '12 COLD LOCKER', 'dining-table': '04 TABLE',
  'bunk-bed': '08 BUNK STACK', 'desk': '13 WORKTOP', 'chair': '02 CHAIR', 'locker': '03 LOCKER',
  'rug': '28 MAT', 'standing-lamp': '25 DECK LAMP', 'research-console': '24 TERMINAL',
  'workbench': '22 WORKBENCH', 'storage-crate': '14 CRATE', 'fuel-drum': '18 DRUM',
  'pipe-run': '17 DUCT RUN', 'space-heater': '26 HEATER', 'shelf-rack': '06 LARDER',
  'supply-barrel': '15 WATER BUTT', 'herb-planter': '19 PLANTER',

  // — the twelve materials (2026-08-06). No card exists for a wall or floor skin, so the value names
  //   the module, in the shape the ground stacks and the paper fixtures already use.
  'steel-bulkhead': 'PAPER MATERIAL · STEEL BULKHEAD',
  'timber-lined-wall': 'PAPER MATERIAL · TIMBER-LINED WALL',
  'blast-wall': 'PAPER MATERIAL · BLAST WALL',
  'glass-partition': 'PAPER MATERIAL · GLASS PARTITION',
  'insulated-wall': 'PAPER MATERIAL · INSULATED WALL',
  'hull-plating': 'PAPER MATERIAL · HULL PLATING',
  'steel-tan-floor': 'PAPER MATERIAL · STEEL-TAN FLOOR',
  'wood-plank-floor': 'PAPER MATERIAL · WOOD PLANK FLOOR',
  'grow-matting': 'PAPER MATERIAL · GROW MATTING',
  'cream-tile-floor': 'PAPER MATERIAL · CREAM TILE FLOOR',
  'metal-grating': 'PAPER MATERIAL · METAL GRATING',
  'carpet-floor': 'PAPER MATERIAL · CARPET FLOOR',

  // — the nine catalogue rows the mock never had (VR-P2)
  bench: '01 BENCH', stool: '05 STOOL', cot: '07 COT', footlocker: '09 FOOTLOCKER', sink: '11 SINK',
  'compost-bin': '21 COMPOST BIN', 'vice-post': '23 VICE POST', 'curtain-rail': '29 CURTAIN RAIL',
  'shrine-shelf': '30 SHRINE SHELF',

  // — the capsules and cells. `cell-sound`'s entry names 34 rather than 33 ON PURPOSE: this ledger's
  //   value is the entry the TWIN's drawing comes from, and that twin IS card 34.
  'capsule-sealed': '31 CAPSULE, SEALED', 'capsule-open': '32 CAPSULE, OPEN',
  'cell-sound': '34 CELL, SPENT',

  // — the eight redrawn ground stacks
  'spoil-heap': 'PAPER RESOURCE · SPOIL HEAP',
  'tuber-crate': 'PAPER RESOURCE · TUBER CRATE',
  'plate-offcut': 'PAPER RESOURCE · PLATE OFFCUT',
  'gear-set': 'PAPER RESOURCE · GEAR SET',
  'control-card': 'PAPER RESOURCE · CONTROL CARD',
  'seal-set': 'PAPER RESOURCE · SEAL SET',
  'ice-block': 'PAPER RESOURCE · ICE BLOCK',
  'body-bag': 'PAPER RESOURCE · BODY BAG',

  // — the fourteen paper fixtures; the value names the SECTION of their module
  'door-sliding': 'PAPER FIXTURES · WAYS THROUGH',
  'door-airlock': 'PAPER FIXTURES · WAYS THROUGH',
  'door-blast': 'PAPER FIXTURES · WAYS THROUGH',
  'deck-hatch': 'PAPER FIXTURES · WAYS THROUGH',
  'conduit-run': 'PAPER FIXTURES · SERVICES',
  'vent-grille': 'PAPER FIXTURES · SERVICES',
  'extractor-fan': 'PAPER FIXTURES · SERVICES',
  'hull-port': 'PAPER FIXTURES · WALL FURNITURE',
  'bulkhead-screen': 'PAPER FIXTURES · WALL FURNITURE',
  'arms-rack': 'PAPER FIXTURES · WALL FURNITURE',
  'deck-marker': 'PAPER FIXTURES · WALL FURNITURE',
  'lamp-sconce': 'PAPER FIXTURES · LIGHT',
  'grow-lamp': 'PAPER FIXTURES · LIGHT',
  'flood-lamp': 'PAPER FIXTURES · LIGHT',

  // — the thirteen machines
  'reactor-plant': 'M01 REACTOR PLANT', 'solar-wing': 'M02 SOLAR WING',
  'bottle-rack': 'M03 BOTTLE RACK', 'reclaimer-stack': 'M04 RECLAIMER STACK',
  'paste-column': 'M05 PASTE COLUMN', 'med-cot': 'M06 MED COT', 'fab-cell': 'M07 FAB CELL',
  'ring-array': 'M08 RING ARRAY', 'dish-mast': 'M09 DISH MAST', 'plant-pot': 'M10 PLANT POT',
  'book-case': 'M11 BOOK CASE', 'deck-turret': 'M12 DECK TURRET', 'sleeper-pod': 'M13 SLEEPER POD',
});

/** The pristine itemIds that have a wrecked twin, in registry order. */
export const WRECKED_IDS = Object.freeze(Object.keys(WRECKED));

/** The id prefix that namespaces a wrecked piece away from its pristine twin. */
export const WRECKED_PREFIX = 'wrecked:';

/**
 * The wrecked itemId for a pristine one — DERIVED, so there is no second table to fall out of step.
 * Returns `undefined` for anything with no twin, which is every non-registry string.
 */
export function wreckedItemId(pristineId) {
  return typeof pristineId === 'string' && WRECKED[pristineId] ? WRECKED_PREFIX + pristineId : undefined;
}

/** The inverse: `'wrecked:reactor'` → `'reactor'`, or `undefined`. PURE, tolerant. */
export function pristineItemId(wreckedId) {
  if (typeof wreckedId !== 'string' || !wreckedId.startsWith(WRECKED_PREFIX)) return undefined;
  const id = wreckedId.slice(WRECKED_PREFIX.length);
  return WRECKED[id] ? id : undefined;
}

/** True when `id` names a wrecked piece. PURE, tolerant. */
export function isWreckedItemId(id) {
  return pristineItemId(id) !== undefined;
}

/**
 * Build the WRECKED twin of a pristine itemId. Same contract as `buildItem`: pure, deterministic,
 * never throws, unknown id → the neutral placeholder.
 *
 * ⚠️ Keyed on the itemId ALONE. It never consults `ITEMS[id].kind`, and that is the trap-6
 * countermeasure spelled out in this file's header, not an accident of implementation.
 *
 * ⚠️ `state` IS NOT IN THIS LIST, AND ITS ABSENCE IS A FACT ABOUT THE ART, NOT AN OVERSIGHT. An
 * earlier draft of this line advertised `{ w, h, idPrefix, index, state }`, copied from `buildItem`.
 * The harness does forward `state` — and it is forwarded on, because a painter that wanted it could
 * read it. No twin does: a wrecked piece is dead by construction, so there is no lit variant to ask
 * for. ⚠️ THE MEASUREMENT THAT USED TO STAND HERE IS HISTORY AND IS QUOTED RATHER THAN DELETED —
 * *"0 of the 70 twins read it … 17 of the 70 PRISTINE rows do respond (`reactor`, `o2-scrubber`,
 * `water-recycler`, `cooker`, `standing-lamp`, `workbench`, `fabricator`, `turret`, `sliding-door`,
 * `airlock`, `power-conduit`, `wall-lamp`, `space-heater`, `sun-lamp`, `floodlight`,
 * `controller-module`, `cryo-capsule-occupied`)"*. Eleven of those seventeen ids no longer exist
 * (lane/warm-purge retired the warm registry rows on 2026-08-06), so the CONTRAST it drew cannot be
 * re-measured as written — re-measure it, do not quote it. Deliberately NOT pinned by a test: "no
 * twin responds to state" is a property of today's paintings, not a rule, and a future twin with a
 * flickering emergency strip would be a correct change that a pin would call a regression.
 *
 * @param {string} pristineId
 * @param {object} [opts] forwarded to the harness: `{ w, h, idPrefix, index }`
 * @returns {string} an SVG `<g>…</g>` fragment
 */
/**
 * The pristine ids drawn by one of the FIVE paper catalogues — the set that wears the treatment.
 * ⚠️ `MATERIAL_IDS` JOINED ON 2026-08-06 (lane/warm-purge) and it is the one member of this union
 * whose twins need a knob threaded for them; see `buildWrecked` below.
 */
const PAPER_CATALOGUE_IDS = new Set([
  ...FITTING_IDS, ...MACHINE_IDS, ...FIXTURE_IDS, ...PAPER_RESOURCE_IDS, ...MATERIAL_IDS,
]);

/**
 * THE TWINS THAT WEAR THE SKETCH TREATMENT — 2026-08-05, the owner's `strong` ruling.
 *
 * A twin is treated IF AND ONLY IF ITS OWN PAINTING IS IN THE PAPER IDIOM, and since 2026-08-06 that
 * is ONE fact rather than two: *has a twin, and is drawn by a paper catalogue*.
 *
 * ⛔ IT USED TO TAKE TWO, AND THE SECOND ONE WAS NOT A TECHNICALITY — IT WAS THE DEFECT THIS SET WAS
 * BUILT AROUND, NOW CLOSED. Twenty-one of the thirty-four fittings had a WARM MOCK twin:
 * `dining-table`'s pristine drawing was the paper fitting and its twin was the 2026-07-28 mock
 * transcription, painted in `#33281b`. Treating those would have put a freehand hand on warm art and
 * broken the palette closure (`#3a2c1e` on the chair's twin — measured, which is how it was found),
 * so the condition also required `mockLabel === null`. lane/warm-purge re-authored all twenty-one on
 * paper AND retired every warm registry row, so there is no longer any twin that a paper catalogue
 * draws and the mock painted: the second clause became `true` for all eighty, and a clause that can
 * no longer be false is the fifth trap shape. It is DELETED rather than kept green.
 *
 * ⇒ WHAT REPLACES IT AS THE GUARD is `sketch-adoption.test.js`'s membership leg, which walks the
 * whole of `WRECKED` and requires the treated set to be exactly this one — so a twin drawn in some
 * third idiom still has to be argued rather than defaulting in.
 */
const SKETCHED_TWINS = new Set(
  [...PAPER_CATALOGUE_IDS].filter((id) => WRECKED[id] !== undefined),
);

export function buildWrecked(pristineId, opts = {}) {
  const entry = typeof pristineId === 'string' ? WRECKED[pristineId] : undefined;
  if (!entry) return placeholderItem(opts);
  // `wrecked-<id>`, NOT `wrecked:<id>`: this string only seeds the DEFAULT `idPrefix`, and that
  // prefix ends up inside every `id="…"` / `url(#…)` in the fragment. A `:` is legal in an XML name
  // but reserved for namespace prefixes, and it is a combinator-adjacent character in CSS — cheap to
  // avoid, expensive to debug. The PUBLIC id keeps the colon (`wreckedItemId`), where nothing parses
  // it as markup.
  //
  // ⭐ THE SKETCH SEED IS THE PRISTINE ID, NOT `wrecked-<id>`, AND THAT IS A MEASUREMENT DECISION AS
  // MUCH AS A VISUAL ONE. A twin re-runs its own pristine painter and then adds damage, so the two
  // fragments share an element PREFIX; seeded identically, the treatment draws that prefix with the
  // identical hand and the whole difference between `sketch(pristine)` and `sketch(twin)` is the
  // damage. Seeded differently, every stroke of both pieces would differ and the distinguishability
  // guard in `sketch-adoption.test.js` would be measuring the seed instead of the damage.
  //
  // ⭐ `env` IS THREADED TO THE PAINTER (2026-08-06), AND ONE POPULATION NEEDS IT. `item()` hands its
  // painter the RESOLVED box — `{ w, h, facing, state, powered }` — and a MATERIAL twin cannot be
  // painted without it: a skin has no `SPECS` row, so how many metres it draws is a function of the
  // caller's box aspect alone (`paper-materials.frameForSkin`). Every other painter here takes one
  // argument and ignores a second, which was measured across all 68 pre-existing twins before this
  // line changed: byte-identical output either way.
  //
  // ⛔ `ground: false` FOR THE MATERIALS ONLY — `art-style.md` §4's GROUND EXCEPTION, and it has to be
  // threaded BY HAND. `paper-materials.js` passes it at ITS OWN `item()` seam; `buildWrecked` calls
  // `item()` itself, so a twin inherits nothing from the skin's harness. Un-threaded, a 12 × 8 room
  // floor of damaged deck would draw ninety-six of the pawns' ground rules across it at the tiling
  // pitch — the exact picture the ruling was taken from. A material is not a standing thing; it IS
  // the deck, so the pawns' sixth tell has nothing to meet. `undefined` on every other row leaves
  // `sketch()`'s own default alone rather than restating it here.
  return item(`wrecked-${pristineId}`, opts, (s, env) => entry.paint(s, env), {
    sketched: SKETCHED_TWINS.has(pristineId),
    seed: pristineId,
    ground: MATERIAL_IDS.includes(pristineId) ? false : undefined,
  });
}

/** The remaining-condition badge for a twin (`'12%'` / `'—'`), or `undefined`. */
export function wreckedState(pristineId) {
  const e = typeof pristineId === 'string' ? WRECKED[pristineId] : undefined;
  return e ? e.state : undefined;
}

/**
 * The registry row a wrecked twin belongs to — footprint and classification come from the PRISTINE
 * entry, never re-transcribed here. A twin is the same object; only its condition differs.
 */
export function wreckedInfo(pristineId) {
  const e = typeof pristineId === 'string' ? WRECKED[pristineId] : undefined;
  if (!e) return undefined;
  const base = ITEMS[pristineId];
  return {
    pristineId,
    wreckedId: WRECKED_PREFIX + pristineId,
    state: e.state,
    // ⚠️ `mockLabel` STOOD HERE UNTIL 2026-08-06 and is REPLACED rather than dropped: a caller asking
    // this function about a twin was asking, among other things, where its drawing came from. That
    // answer now lives in `TWIN_SOURCE`, and it is read from there rather than copied onto the row —
    // one home, so the two cannot disagree.
    source: TWIN_SOURCE[pristineId],
    size: base ? base.size : undefined,
    kind: base ? base.kind : undefined,
  };
}

/**
 * Every registry row that is MISSING a wrecked twin. `Object.keys(NO_WRECKED_TWIN)` is the invariant
 * — NOT `[]`, since the `cell-spent` and `turnings` rows — and the test pins the two lists equal, so
 * an UNLEDGERED omission still fails and a ledgered one names its reason.
 */
export function itemsWithoutWreckedTwin() {
  return ITEM_IDS.filter((id) => !WRECKED[id]);
}

/** Every wrecked twin with no registry row behind it. Empty is the invariant. */
export function orphanWreckedTwins() {
  return WRECKED_IDS.filter((id) => ITEMS[id] === undefined);
}
