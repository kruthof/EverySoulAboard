// First-run onboarding — the one-time intro card and, through the persistent `?` button, the game's
// ONLY help surface. DOM-only, browser-only, mounts over everything. It owns no wire/sim state — it
// is pure presentation and a single localStorage flag.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ EVERY SENTENCE ON THIS CARD IS A CLAIM ABOUT CODE SOMEBODY ELSE OWNS. CHECK IT, DON'T GUESS.
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The card shipped from `d5d574b` (2026-07-23) saying `['B', 'open their dossier']`.
// `B` has never done that: `client/src/input/controls.js:257` arms the BUILD tool, and
// `Hud.openBioForSelected` has NO keyboard binding anywhere. The Overview's own READOUT button is
// labelled `[T] OPEN CHANNEL`, `[M] MOVE`, `[B] BIO` — the `[B]` in THAT label is the same lie, and
// it is where this one was copied from (`ui/overview-view.js:1035`; a click handler, not a key).
// Nobody had driven it. That is the whole defect, and it is why the rows below carry a `bind`: a
// machine-checkable join from what the card SAYS to the branch that implements it. See
// `client/test/onboarding.test.js`.
//
// The other three faults corrected in the same pass (M1-b):
//   • it LED WITH TALK. The owner's binding decision is *ship playable WITHOUT chat, market as
//     LLM-ready* — leading the first screen with a conversation verb was the most misleading thing
//     in the product. TALK is demoted to one control row. It is NOT removed: it works (driven —
//     `T` opens a dialogue panel for the selected crew).
//   • it named ZERO order verbs. DIG / STOCKPILE / STRIP / OPERATE are the player's primary input
//     — "we define tasks" — and five console-retirement work packages exist to put them on this
//     surface. The card mentioned none of them.
//   • its fiction was the pre-wreck one ("a drifting ship, a skeleton crew"). `hosts/web` boots
//     `--ship wreck` (`hosts/web/Program.cs:61`).
//
// ⚠️ WHAT THE CARD DELIBERATELY DOES *NOT* PROMISE. The premise ends "…and the rest thaw one at a
// time through MOSS". THE PODS DO NOTHING TODAY — there is no CryoSystem, no thaw command, no MOSS
// thaw op (`sim/Sim.Gen/AuthoredShips.cs`, the PeriluneWreck header, and W5 in
// `docs/design/perilune-wreck-start.plan.md`). So the card states the seven sleepers as a FACT and
// never as a verb. When W5 lands, that is the sentence to add.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ THE SEND-BACK: THE PASS THAT DELETED FALSE SENTENCES SHIPPED TWO NEW ONES. Recorded in full,
// because both were written the same way the `B` row was — from a PLAN, not from the shipped thing.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//   • "Beyond the bay the ship is airless" was FALSE. It copied the CHARTER's one-compartment
//     premise; the shipped ship authors **THREE** pressurised anchors —
//     `AuthoredShips.cs:1893-1896` adds `WreckCryoAnchor`, `"wreck_spine_0"` and
//     `WreckReactorAnchor`, `AuthoredShips.cs:1341` says so in capitals, and
//     `WreckShipTests.ExactlyThreeSpacesBootBreathable_AndTheRestIsVacuum` asserts that exact set.
//     ⇒ WHEN THE CARD AND THE CHARTER DISAGREE, THE SHIP WINS. The charter is a plan; the card is
//     a claim about a running program.
//   • the BUILD block was wrong three ways, and the third one MISDIRECTS INTO A SILENT FAILURE:
//       – "Pick a material" — `toolHasMaterial` is wall/floor ONLY (`build-material-model.js:38`);
//         DOOR carries none.
//       – "drag to sweep a run" — `isSweepTool` is structural + order (`room-model.js:142`).
//         FURNITURE IS A PLAIN CLICK; it never sweeps.
//       – "Building spends REGOLITH" — true for structure (`BuildSystem.cs:57 Material =
//         ItemKind.Regolith`) and FALSE for furniture, which is `PlaceDeviceCommand` and charges
//         `Currency = ItemKind.Parts` (`Commands/Commands.cs:332`), `DevicePlaceCost = 3`
//         (`SimDefs.cs:884`).
//
// ⛔ FOUND DEFECT, REPORTED NOT FIXED — "FURNITURE-SILENT-BROKE" (out of this package's scope).
// The wreck boots with **1** Parts (`AuthoredShips.cs:1888`, `Count = 1`) against a cost of **3**.
// `PlaceDeviceCommand.Execute` charges LAST and simply `return`s when it cannot pay, and its own
// header calls a refusal "the same silent no-op every other rejection is". So every bunk, locker
// and lamp a new player places on the shipping game **does nothing, silently, forever** — no toast,
// no ghost, no reason. The card previously pointed them straight at it by naming the one resource
// the top bar shows plenty of. It now names PARTS, which at least makes the scarcity legible, but
// THE VERB IS STILL MUTE. This is `MECHANICS.md` §13.17's expensive-and-visible → CHEAP-AND-INVISIBLE
// shape, live on the standard surface.
//
// ⚠️ DISCLOSED, NOT FIXED — ARMING AN ORDER ON THE SHIP MAP BLOCKS ROOM ENTRY. `G`/`Z`/`V` are
// GLOBAL (`controls.js:262` → `Hud.armFromKey`), and `overviewClickAction` returns `{type:'order'}`
// before it ever reaches `roomAnchor` (`overview-model.js:246` vs `:249`), so after pressing `G` on
// the map a room click does not open the room. ONE ROW OF THIS CARD DISARMS ANOTHER
// ("Click a room — step inside it").
// ⚠️ AND THE SEND-BACK'S OWN DESCRIPTION OF THIS WAS HALF WRONG — it read "does nothing and says
// nothing". DRIVEN in Chrome on `--ship wreck` (`sb-m1b-gprobe`, 2026-07-29): the room does not
// open (CONFIRMED) but the surface is **NOT silent** — `#ov-toast` reads
// `DIG ARMED — ESC TO DISARM` (`overview-view.js:889` → `orderSuppressionToast`, `:934`). So this
// is a legible refusal with a stated remedy, NOT the invisible-feedback class, and it is deliberately
// left alone rather than "fixed" on that mistaken description. THAT CORRECTION IS THE POINT: a
// send-back is a claim about code too, and it gets driven like any other.
//
// EVERY CONTROL BELOW WAS DRIVEN IN REAL CHROME on `--ship wreck` before it was written down, and
// two documented keys were DELETED because driving them showed they do nothing on this surface:
//   • `WASD` — pans the console canvas, which on the standard surface measures 0×0 px. Dead.
//   • `M`   — `controls.js:255` sends `Cmd.move()` at the INSPECTION CURSOR, and the cursor is only
//             moved by canvas mousemove (dead canvas) or the arrow keys. The Overview's `[M] MOVE`
//             button is a different thing entirely (`Hud.armTool('move')`). Pressing `M` produced
//             no visible change. Left off rather than half-explained.
//
// A third row, `1–7` (atmosphere lenses), was dropped for a DIFFERENT reason and it is worth
// separating: that key WORKS (driven — the `on` class moves between `.ov-lensbtn`s). It came off
// because the Overview's lens buttons render their own numbers (`1 ∅  2 PRES  3 O₂ …`), so the row
// documented something already on screen, and the card needed the height. See below.
//
// ⚠️ THE CARD'S HEIGHT IS A CORRECTNESS PROPERTY, not taste. `.onb-card` is
// `max-height:92vh;overflow:auto`, so a card that outgrows the viewport does not break visibly — it
// quietly puts **BEGIN**, its own primary action, below the fold. The first draft of this rewrite
// did exactly that: 785px of content against 656px of card at 1280×800, BEGIN off screen. That is
// the palette-overflow defect (`client/test/palette-layout.test.js`) in a different component.
// This card is **653px, byte-for-byte the footprint of the one it replaces**, measured in Chrome at
// 1600×1000 / 1440×900 / 1280×800 by `client/tools/onboarding-shot.mjs`, which fails when BEGIN is
// out of view. Anything added here must be measured, not eyeballed.
//
// ⚠️ AND THE SEND-BACK'S CORRECTIONS COST 68px THE FIRST TIME THEY WERE WRITTEN — 721px, BEGIN
// clipped at 1280×800, exactly the defect above, caused by the pass that was fixing the copy. It was
// bought back to 653px by MEASUREMENT, not by taste, and the three cuts are worth knowing because
// each is a wrap boundary rather than a word count:
//   • the `T` row's text WRAPPED the two-column key grid, and a wrapped cell makes BOTH cells in
//     that grid row taller — 12px for four extra words. Key-row text has to fit one line (~28 chars).
//   • the BUILD body lost "wall and floor take a material". THE MATERIAL PICKER IS NOW UNMENTIONED,
//     which is a deliberate trade: the old copy's "Pick a material" was FALSE (it is wall/floor
//     only), and silence is not a lie — the picker appears on screen the moment you arm WALL.
//   • the LEDE: 251+ chars wraps to five lines, 250 fits in four. See its own note below.
//
// ⚠️ `＋ADD ROOM` AND THE ROOM-TYPE PICKER ARE STILL NOT ON THE CARD, and that is now a MEASURED
// decision rather than an oversight. The ship-map group holds four rows in two grid rows; a fifth
// row costs a third grid row (~22px + gap) and the budget above has 2px in it. The verb is a
// labelled button sitting on the map, so it is discoverable in a way a keystroke is not — whereas
// every row that IS here documents something invisible. If the card ever gets more height, this is
// the first thing to add back.

const SEEN_KEY = 'perilune.introSeen.v1';
let _seenThisSession = false; // fallback when localStorage is unavailable (private mode)

function hasSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return _seenThisSession; }
}
function markSeen() {
  _seenThisSession = true;
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode — session flag covers it */ }
}

/** The four ORDER verbs — the player's task-definition vocabulary, and the reason this card exists.
 *  Named here rather than spelled into the prose so the guard can require every one of them to
 *  reach the rendered card, and so adding a fifth is one edit. Kept in the palette's own order
 *  (`ui/room-model.js` ROOM_TOOLS). */
export const ORDER_VERBS = Object.freeze(['DIG', 'STOCKPILE', 'STRIP', 'OPERATE']);

/**
 * The two headline verbs, in the order the card teaches them.
 *
 * ⚠️ ORDER IS LOAD-BEARING AND IS PINNED: `VERBS[0]` is what a new player reads first, and TALK
 * being there is the exact defect this rewrite removes. The guard asserts no verb HEAD mentions
 * TALK at all, which is stricter than "not first" and is deliberate — a second headline TALK block
 * is the same mistake sitting one column to the right.
 */
// ⚠️ THE HEADING GLYPHS ARE `◈` AND `▣` — the card's own two, kept deliberately. The palette's
// `⛏`/`⚒`/`⇄` are NOT in Space Mono and fall back to a different face at a different weight; `⛏`
// photographed as a small angular mark that does not read as a pickaxe at 12px. Checked in Chrome,
// not assumed.
export const VERBS = Object.freeze([
  {
    head: '◈ ORDER',
    body: 'Step into a room, take <b>DIG</b>, <b>STOCKPILE</b> or <b>STRIP</b> and drag over the ' +
      'tiles you mean. <b>OPERATE</b> toggles a door or vent.',
  },
  {
    head: '▣ BUILD',
    body: 'Same palette, other end. <b>WALL</b>, <b>FLOOR</b>, <b>DOOR</b> sweep a run and spend ' +
      '<b>REGOLITH</b>. Furniture is one click, spends <b>PARTS</b>.',
  },
]);

/**
 * The controls, grouped by the surface they work on — because they are NOT interchangeable and the
 * old flat list is what let a Room-Zoom-only key masquerade as a global one.
 *
 * `bind` is the machine-checkable half: a LIST of `{ file, cond, call }`, each saying "the branch
 * whose condition contains `cond` runs `call`, in `client/src/<file>`".
 * `client/test/onboarding.test.js` joins every one of them to the real, comment-stripped branch.
 * A list, because a row legitimately documents several keys at once (`G / Z / V` is three different
 * calls) and one shared `call` field would have quietly checked only the first.
 *
 * A row may instead carry `bind: null` — but then it MUST carry `why`, and the guard requires it:
 * an unexplained `null` is how a future row silences this join without anyone noticing.
 */
const CTL = 'input/controls.js';
const RZ = 'ui/roomzoom-view.js';

export const CONTROL_GROUPS = Object.freeze([
  {
    title: 'CONTROLS · THE SHIP MAP',
    rows: [
      { key: 'Click', text: 'a room — step inside it',
        bind: null, why: 'a pointer gesture on .pl-room, not a key (ui/overview-view.js onScenePointerUp)' },
      { key: 'R / F', text: 'up / down a deck', bind: [
        { file: CTL, cond: "k === 'r'", call: 'Cmd.deck' },
        { file: CTL, cond: "k === 'f'", call: 'Cmd.deck' }] },
      { key: 'Space', text: 'pause / resume', bind: [
        { file: CTL, cond: "k === ' '", call: 'Cmd.pause' }] },
      // ⚠️ THE TEXT NAMES **CREW WATCH** BECAUSE THIS ROW IS THE ONLY ONE WITH A PREREQUISITE THE
      // CARD OTHERWISE NEVER TEACHES. `talkSelectedCrew` is a no-op with nobody selected, and the
      // only way to select on this surface is clicking a CREW WATCH row (driven — the rig's own
      // `[T]` leg has to click one first or the panel never opens). "the selected crew" quietly
      // assumed a verb the player had not been given.
      { key: 'T', text: 'talk to a name in CREW WATCH', bind: [
        { file: CTL, cond: "k === 't'", call: 'talkSelected' }] },
    ],
  },
  {
    title: 'CONTROLS · INSIDE A ROOM',
    rows: [
      { key: 'G / Z / V', text: 'dig · stockpile · strip', bind: [
        { file: RZ, cond: "k === 'g'", call: "arm('dig')" },
        { file: RZ, cond: "k === 'z'", call: "arm('stockpile')" },
        { file: RZ, cond: "k === 'v'", call: "arm('strip')" }] },
      { key: 'O', text: 'operate a door or vent', bind: [
        { file: RZ, cond: "k === 'o'", call: "arm('operate')" }] },
      { key: 'B / X', text: 'build a wall · demolish', bind: [
        { file: RZ, cond: "k === 'b'", call: "arm('wall')" },
        { file: RZ, cond: "k === 'x'", call: "arm('demolish')" }] },
      { key: 'Esc', text: 'put the tool down, then leave',
        bind: null, why: 'an Esc STACK (escStackRung: disarm, then exit) — a rung, not one call' },
    ],
  },
]);

export const EYEBROW = 'MSV PERILUNE · BOARDED AND STRIPPED · ONE CREW AWAKE';
export const TITLE = 'One capsule opened.';
/**
 * ⚠️ EVERY CLAUSE HERE IS CHECKED, AND THE AIR CLAUSE IS THE ONE THAT SHIPPED FALSE.
 * "Beyond the bay the ship is airless" was the CHARTER's premise, not the ship's: `--ship wreck`
 * authors THREE pressurised anchors (cryo bay, `wreck_spine_0`, reactor — `AuthoredShips.cs:1894`,
 * asserted by `WreckShipTests.ExactlyThreeSpacesBootBreathable_AndTheRestIsVacuum`), and the boot
 * census prints `deck 0: 9 anchored spaces, 3 breathable`. Joined to the C# in `onboarding.test.js`.
 *
 * ⚠️ IT IS ALSO 250 CHARACTERS BECAUSE OF THE HEIGHT BUDGET, NOT BECAUSE OF TASTE. Measured in
 * Chrome at 1280×800: 251+ chars wraps to FIVE lines (108px) and 250 fits in FOUR (86px), and those
 * 22px are the difference between BEGIN being reachable and the card silently scrolling. "cryo",
 * "still" and "whole" were cut for exactly that reason — every FACT survives ("everyone awake is
 * dead or gone" was kept over "cryo" deliberately: it is why the player is alone). If you add a
 * word here, re-run `client/tools/onboarding-shot.mjs` at 1280×800 before you commit it.
 */
export const LEDE =
  'Raiders took this ship; everyone awake is dead or gone. Of twelve capsules four are cracked, ' +
  'seven under, one opened — that person is your crew. Only the bay, spine and reactor hold air; ' +
  'the rest is vacuum, and nobody works where they cannot breathe.';

/** The card's markup. Exported because the guards assert on the RENDERED STRING: a claim sitting in
 *  a comment cannot reach it, which is `CLAUDE.md` trap 1 removed rather than hardened against. */
export function overlayHtml() {
  const verbs = VERBS.map((v) =>
    '<div class="onb-verb"><div class="onb-verb-h">' + v.head + '</div>' +
      '<div class="onb-verb-b">' + v.body + '</div></div>').join('');
  // ⚠️ ONE `.onb-controls` WRAPPER FOR BOTH GROUPS, not one each. `.onb-controls` carries
  // `margin-top:20px` + a border + `padding-top:16px` — ~37px of chrome — and paying that twice
  // pushed BEGIN below the fold at 1280×800 (measured; see the module header). The second group's
  // heading gets its own top margin inline rather than a new class: this is a height fix, not a new
  // layout, and `styles.css` is shared with other lanes.
  const groups = '<div class="onb-controls">' + CONTROL_GROUPS.map((g, i) => {
    const rows = g.rows.map((r) =>
      '<div class="onb-krow"><kbd class="onb-key">' + r.key + '</kbd><span>' + r.text + '</span></div>').join('');
    return '<div class="onb-controls-h"' + (i ? ' style="margin-top:11px"' : '') + '>' + g.title + '</div>' +
      '<div class="onb-kgrid">' + rows + '</div>';
  }).join('') + '</div>';
  return '' +
    '<div class="onb-card" role="dialog" aria-modal="true" aria-label="Welcome to Perilune">' +
      '<div class="onb-eyebrow">' + EYEBROW + '</div>' +
      '<h1 class="onb-title">' + TITLE + '</h1>' +
      '<p class="onb-lede">' + LEDE + '</p>' +
      '<div class="onb-verbs">' + verbs + '</div>' +
      groups +
      '<button class="onb-begin" data-onb-begin>BEGIN</button>' +
      '<div class="onb-foot">Press <kbd class="onb-key">?</kbd> any time to reopen this.</div>' +
    '</div>';
}

/** Mount the onboarding layer: shows the intro once, installs a persistent `?` reopener + hotkey. */
export function initOnboarding() {
  if (typeof document === 'undefined') return;
  const layer = document.createElement('div');
  layer.id = 'onboarding';
  layer.className = 'onb-layer';
  layer.hidden = true;
  document.body.appendChild(layer);

  const help = document.createElement('button');
  help.className = 'onb-help';
  help.type = 'button';
  help.title = 'Help & controls (?)';
  help.textContent = '?';
  document.body.appendChild(help);

  const open = () => { layer.innerHTML = overlayHtml(); layer.hidden = false; };
  const close = () => { layer.hidden = true; layer.innerHTML = ''; markSeen(); };

  layer.addEventListener('click', (e) => {
    const t = e.target;
    if (t === layer) { close(); return; }               // click the backdrop → dismiss
    if (t && t.closest && t.closest('[data-onb-begin]')) close();
  });
  help.addEventListener('click', open);
  // `?` reopens; Escape closes — but only ours, and only when open (never steal the ship's Esc).
  window.addEventListener('keydown', (e) => {
    const typing = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName || '');
    if (!layer.hidden && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (!typing && e.key === '?') { e.preventDefault(); layer.hidden ? open() : close(); }
  }, true); // capture: our Escape close beats the game's Esc stack while the card is up

  if (!hasSeen()) open();
}
