// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⭐⭐ THE BUILD TRAY — the DOM half. A breadcrumb, two rails and a row of cards, over
// `build-tray-model.js`'s pure taxonomy.
//
// ⛔ IT IS A SECTION, NOT A SURFACE. It owns no wire state, no clock and no keyboard: it is handed a
// state object (`{armed, materials, parts, tray, escRung}`) and it paints; every gesture is reported
// through `roomzoom-view.js`'s ONE delegated `onHudClick` chain by data attributes, exactly as the
// flat palette's chips were. That keeps the surface's single press/latch discipline intact — a
// second click listener on this element would be a second answer to "what did the player press".
//
// ⛔⛔ THE THREE PAINT RULES ARE THE FLAT PALETTE'S, INHERITED WHOLE, AND EACH IS A SHIPPED DEFECT.
//   1. NOTHING UNDER THE POINTER IS EVER REBUILT ON AN IDLE REPAINT. This surface repaints at the
//      wire's 10 Hz; a node torn down between `mousedown` and `mouseup` eats the click outright
//      (HANDOVER §4h — a chip you have to press twice). So the head and the two rails are built ONCE
//      and the CARD ROW is rebuilt only when its own signature (the leaf, and the cards that leaf
//      yields) changes. The live half — armed / cannot-pay / title — is a class toggle and an
//      attribute write, never a re-render.
//   2. THE ARMED STATE IS SAID IN WORDS AS WELL AS IN COLOUR, on every card and every rail row,
//      because a screen reader reading twenty-one labels and nothing about which one is held is the
//      same defect as a button that does not change colour. ⚠️ IN **TWO** VOCABULARIES, NOT ONE —
//      see `cardHtml`'s ⛔⛔ block: a one-shot tool card is a TOGGLE (`aria-pressed`) and a material
//      card is one of six MUTUALLY EXCLUSIVE choices (`role="radio"`/`aria-checked`).
//   3. EVERY CONTROL IS A REAL `<button type="button">` — Tab reaches it, Enter/Space press it, and
//      inside a form the default type is `submit`. One button vocabulary on one menu.
//
// ⚠️ THE CARD ROW SCROLLS AND THE RAILS DO NOT, AND THAT SPLIT IS THE LAYOUT CONTRACT. See
// `client/styles/roomzoom.css`'s tray block and `palette-layout.test.js`'s restated rule: the
// clipping bug this repo shipped once was `overflow-x:auto` **plus a HIDDEN scrollbar**, so the
// tools were gone with nothing on screen to say so. A scrolling row whose scrollbar is visible is a
// control the player can reach; the hidden-scrollbar idiom stays forbidden everywhere.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import {
  CATEGORY_LABEL, LEAF_LABEL, categoriesWithTools, leavesInCategory, trayCards, trayCrumbs,
  trayEscText, trayEmptyText,
} from './build-tray-model.js';
import { buildItem } from '../items/index.js';
import { chipTitleText, paletteCostRow } from './build-cost-model.js';
import { activeMaterial } from './build-material-model.js';

/** The card's art box, in px. Card scale on purpose: `art-style.md` §4's own rule is that at 22 px
 *  only WEIGHT survives, so a 22 px thumbnail would show the sketch treatment as noise. At 62 px the
 *  overshoot, the doubled silhouette and the paper knockout all read, which is what makes the card
 *  "the piece's own drawing" rather than an icon of it. */
const ART = 62;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Toggle a class without touching the node when it is already right (the palette's rule: a write
 *  that changes nothing still invalidates style on some engines, and this runs at 10 Hz). */
function setCls(el, cls, on) {
  if (!el || !el.classList) return;
  if (on) { if (!el.classList.contains(cls)) el.classList.add(cls); }
  else if (el.classList.contains(cls)) el.classList.remove(cls);
}

function setAttr(el, name, value) {
  if (!el) return;
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function setText(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

/**
 * Build the tray inside `host` and return its painter.
 *
 * The returned object is deliberately tiny: `paint(state)` and nothing else. Everything the tray
 * knows about the game arrives in `state`; everything it wants to DO leaves as a data attribute the
 * surface's own click chain reads.
 *
 * @param {Element} host the `#rz-tray` element
 * @returns {{paint:(s:object)=>void, labelEl:Element|null}}
 */
export function makeBuildTray(host) {
  if (!host) return { paint() {}, labelEl: null };

  // ── the fixed skeleton, built ONCE ───────────────────────────────────────────────────────────
  // The head carries THREE things and they are three nodes rather than one string, because two of
  // them are written by different owners: `.rz-place-label` is `zoomChrome`'s sentence (the surface's
  // own mode + the room's name — `paintChrome` writes it and this file never touches it), the crumbs
  // are the tray's, and the ESC line is the tray's too but is driven off the SURFACE's rung.
  // ⚠️ EVERY HANDLE IS A **CLASS**, NOT AN ATTRIBUTE OR AN id, AND THAT IS A HARNESS FACT RATHER
  // THAN A STYLE PREFERENCE. Three of this repo's node rigs model `innerHTML` as a flat start-tag
  // scan and implement `querySelectorAll` for `.class` selectors and nothing else (see
  // `build-feel.test.js`'s `RzEl`). A tray addressed by `[data-rztray=…]` would resolve to NOTHING
  // in every one of them — the painter would write into null, the cards would never exist, and the
  // driven legs would pass over an empty menu. `.rz-place-label` has been reached this way since the
  // palette shipped; the tray's five handles follow it.
  host.innerHTML =
    '<div class="rz-tray-head">' +
      '<span class="rz-place-label"></span>' +
      '<span class="rz-tray-crumbs"></span>' +
      '<span class="rz-tray-esc"></span>' +
    '</div>' +
    '<div class="rz-tray-body">' +
      '<div class="rz-tray-rail rz-tray-cats"></div>' +
      '<div class="rz-tray-rail rz-tray-subs"></div>' +
      '<div class="rz-tray-cards"></div>' +
    '</div>';

  const q = (cls) => host.querySelector('.' + cls);
  const el = {
    label: q('rz-place-label'),
    crumbs: q('rz-tray-crumbs'),
    esc: q('rz-tray-esc'),
    cats: q('rz-tray-cats'),
    subs: q('rz-tray-subs'),
    cards: q('rz-tray-cards'),
  };
  // ⛔ A MISSING HANDLE IS REPORTED, NOT ABSORBED. A tray that silently paints nothing is exactly the
  // "invisible feedback is FUNCTIONAL" defect this surface has shipped twice; the writes below are
  // guarded so a partial DOM cannot throw mid-frame, and `build-tray.test.js` asserts the card count
  // is non-zero before every driven leg so a no-op painter can never make one vacuous.

  // The CATEGORY rail is FIXED — its membership is a fact about the taxonomy, not about the game, so
  // it is built once and only ever re-classed. (The SUB rail's membership depends on the chosen
  // category, so it is rebuilt on a category change and on nothing else.)
  if (el.cats) el.cats.innerHTML = categoriesWithTools().map((c) =>
    '<button type="button" class="rz-tray-cat" data-rzcat="' + esc(c) + '" aria-pressed="false">' +
    esc(CATEGORY_LABEL[c] || c) + '</button>').join('');
  const catBtns = el.cats ? Array.from(el.cats.querySelectorAll('.rz-tray-cat')) : [];

  let subSig = null;
  let cardSig = null;
  let crumbSig = null;
  let cardBtns = [];

  /** One card's markup. The ART is the REAL registry drawing at card scale — `buildItem` is the same
   *  door the built piece, the ghost and the blueprint all go through, so a player recognises on the
   *  floor the thing they pressed. A card with no art (the six order verbs place no THING) simply
   *  omits the box rather than drawing a placeholder that would read as a piece. */
  function cardHtml(card) {
    const art = card.artId
      ? '<span class="rz-card-art">' +
        '<svg viewBox="0 0 ' + ART + ' ' + ART + '" width="' + ART + '" height="' + ART + '" ' +
        'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        buildItem(card.artId, { w: ART, h: ART, idPrefix: 'rz-tc-' + card.key.replace(/[^\w-]/g, '-') }) +
        '</svg></span>'
      : '<span class="rz-card-art rz-card-noart" aria-hidden="true"></span>';
    // ⚠️ BORN UNARMED AND UNPRICED-BY-STATE, ALWAYS. The `.on` / `.cant` classes, the pressed/checked
    // value and the hover `title` are the LIVE half and are written in place by the loop at the end
    // of `paint` — which runs on the same pass, so nothing is ever on screen in the wrong state. The
    // markup declaring the attribute `false` is a separate claim from the painter writing it, and
    // both are pinned (`build-tray.test.js`, the two-leg note): a toggle born without the attribute
    // is a plain button until the first repaint.
    //
    // ⛔⛔ TWO CONTROL VOCABULARIES, AND THE DISTINCTION IS A DECISION THIS REPO ALREADY MADE AND
    // THIS PACKAGE FIRST DRAFT SILENTLY INVERTED (review MAJOR 5). The deleted `paintMatStrip`
    // carried it in full, and its words are worth keeping:
    //
    //     *"`type="button"` and DELIBERATELY NOT `aria-pressed`. … The pressed state is a different
    //     question and is left open on purpose: `activeMaterial` guarantees exactly ONE swatch is
    //     `on`, which is a radio group, not six independent toggles. The right spelling is
    //     `role="radio"`/`aria-checked` inside a `radiogroup` … guessing `aria-pressed` here would
    //     announce six toggles where the player has one choice."*
    //
    // The first tray draft wrote `aria-pressed` on EVERY card, which is exactly the announcement that
    // note refused, and the refusal's reasoning went out with the strip. Restored — and this time
    // SPELLED rather than deferred, because the tray changed the fact the note was reasoning about:
    // on the flat palette the six swatches sat BESIDE a WALL tool button that carried `aria-pressed`,
    // so the armed state was announced SOMEWHERE. On the tray the six material cards are the ONLY
    // wall controls there are, so refusing here would leave "this tool is in your hand" unsaid
    // altogether — a regression the strip did not have.
    //
    //   · A TOOL CARD is a one-shot toggle: press to arm, press again to put down, nothing else on
    //     the row is affected. `aria-pressed`.
    //   · A MATERIAL CARD is one of six mutually exclusive skins for ONE tool: picking a second
    //     moves the choice rather than adding one (`activeMaterial`). `role="radio"` +
    //     `aria-checked`, in a `role="radiogroup"` (set on the row below, and only when every card
    //     in it is a material — a mixed row has no single group to name).
    //
    // ⚠️ ONE DEVIATION FROM THE WAI-ARIA RADIOGROUP PATTERN, NAMED RATHER THAN HIDDEN: that pattern
    // asks for ROVING TAB FOCUS (one tabbable radio, arrows moving the selection). This keeps EVERY
    // card tabbable. Roving focus without arrow-key handling would make five of the six materials
    // unreachable from the keyboard, which deletes ruling E4's "keyboard reachability" affordance
    // outright; and arrow-key navigation is a keyboard-interaction change to a surface that already
    // binds every letter on the palette — a package, not an attribute. What ships is therefore the
    // honest half: the RELATIONSHIP is announced correctly (one-of-six, which one is chosen), and Tab
    // + Enter/Space still reach and press all six. FILED for the M4 accessibility pass.
    const state = card.kind === 'mat'
      ? ' role="radio" aria-checked="false"'
      : ' aria-pressed="false"';
    return '<button type="button" class="rz-card' +
      '" data-rztool="' + esc(card.tool) + '"' +
      (card.kind === 'mat' ? ' data-rzmat="' + (card.mat | 0) + '"' : '') +
      ' data-rzcard="' + esc(card.key) + '"' + state + '>' +
      art +
      '<span class="rz-card-name">' + esc(card.label) + '</span>' +
      '<span class="rz-card-price">' + esc(card.price) + '</span>' +
      '<span class="rz-card-stat">' + esc(card.stat) + '</span>' +
      '</button>';
  }

  /**
   * @param {{armed:string|null, materials:object, parts:number,
   *          tray:{cat:string,leaf:string}, escRung:string}} s
   */
  function paint(s) {
    const st = s || {};
    const tray = st.tray || { cat: '', leaf: '' };
    const armed = st.armed == null ? null : st.armed;
    const parts = st.parts | 0;

    // ── head: the crumbs and the ESC sentence ──────────────────────────────────────────────────
    const crumbs = trayCrumbs(tray);
    const cSig = crumbs.map((c) => c.label).join('');
    if (cSig !== crumbSig && el.crumbs) {
      el.crumbs.innerHTML = crumbs.map((c) =>
        '<span class="rz-tray-sep">›</span>' +
        '<button type="button" class="rz-tray-crumb" data-rzcrumb="' + esc(c.leaf || c.cat) + '">' +
        esc(c.label) + '</button>').join('');
      crumbSig = cSig;
    }
    // The ESC line is written from the SURFACE'S OWN RUNG, so it can never advertise "back a level"
    // on a rung that exits the room or puts a tool down (`trayEscText`'s note).
    setText(el.esc, trayEscText(st.escRung));

    // ── the category rail ──────────────────────────────────────────────────────────────────────
    for (const b of catBtns) {
      const on = b.getAttribute('data-rzcat') === tray.cat;
      setCls(b, 'on', on);
      setAttr(b, 'aria-pressed', on ? 'true' : 'false');
    }

    // ── the leaf rail: membership changes with the category, so it is rebuilt on that and nothing
    //    else. A category with ONE leaf shows no rail at all — `trayNav` drops straight into it, so
    //    a rail of one row would be a control with nothing to choose.
    const leaves = tray.cat ? leavesInCategory(tray.cat) : [];
    const sSig = tray.cat + '|' + leaves.join(',');
    if (sSig !== subSig && el.subs) {
      el.subs.innerHTML = (leaves.length > 1 ? leaves : []).map((l) =>
        '<button type="button" class="rz-tray-sub" data-rzsub="' + esc(l) + '" aria-pressed="false">' +
        esc(LEAF_LABEL[l] || l) + '</button>').join('');
      subSig = sSig;
    }
    for (const b of (el.subs ? Array.from(el.subs.querySelectorAll('.rz-tray-sub')) : [])) {
      const on = b.getAttribute('data-rzsub') === tray.leaf;
      setCls(b, 'on', on);
      setAttr(b, 'aria-pressed', on ? 'true' : 'false');
    }

    // ── the cards ──────────────────────────────────────────────────────────────────────────────
    const cards = tray.leaf ? trayCards(tray.leaf) : [];
    // ⚠️ THE EMPTY SENTENCE IS IN THE SIGNATURE, AND ITS ABSENCE WAS A MEASURED BUG — caught by the
    // rig's own screenshot, not by a node assertion. At depth 0 AND depth 1 the leaf is '' and the
    // card list is empty, so `leaf + cards` is the identical string for both: walking back from a
    // category to the root left `PICK A GROUP` on screen under a corner that already read
    // `ESC · BACK TO THE SHIP`. Two states, one signature, one stale sentence.
    const kSig = tray.leaf + '|' + trayEmptyText(tray) + '|'
      + cards.map((c) => c.key + ':' + c.price + ':' + c.stat).join(',');
    if (kSig !== cardSig && el.cards) {
      // An empty row names the rail beside it rather than sitting blank — the band is reserved, so
      // there IS space here at the root and at a category (`trayEmptyText`'s note).
      el.cards.innerHTML = cards.length
        ? cards.map((c) => cardHtml(c)).join('')
        : '<span class="rz-tray-empty">' + esc(trayEmptyText(tray)) + '</span>';
      cardBtns = Array.from(el.cards.querySelectorAll('.rz-card'));
      // ⭐ THE GROUP, named only when there IS one. A leaf whose cards are ALL material cards is a
      // single one-of-N choice and the row is that choice's `radiogroup`; any other row (tool cards,
      // or a future mixed one) gets no role at all, because a radiogroup wrapping things that are
      // not radios is a worse announcement than none. Homogeneity is a fact about `trayCards`, not
      // an assumption — `build-tray.test.js` sweeps every leaf for it.
      const allMat = cards.length > 0 && cards.every((c) => c.kind === 'mat');
      if (allMat) {
        setAttr(el.cards, 'role', 'radiogroup');
        setAttr(el.cards, 'aria-label', (LEAF_LABEL[tray.leaf] || tray.leaf) + ' MATERIAL');
      } else if (el.cards.removeAttribute) {
        if (el.cards.getAttribute('role') != null) el.cards.removeAttribute('role');
        if (el.cards.getAttribute('aria-label') != null) el.cards.removeAttribute('aria-label');
      }
      cardSig = kSig;
    }
    // The LIVE half, in place: which card is held, and whether the ship can pay for it. `.cant` is
    // paint-only and deliberately NOT `disabled` — the button still arms, still sends, and the sim
    // still answers (`build-cost-model.js`'s own rule; the client never gates the wire).
    for (const b of cardBtns) {
      const tool = b.getAttribute('data-rztool');
      const matAttr = b.getAttribute('data-rzmat');
      const on = armed === tool && (matAttr == null
        || (activeMaterial(st.materials, tool) | 0) === (parseInt(matAttr, 10) | 0));
      setCls(b, 'on', on);
      const row = paletteCostRow(tool, parts);
      setCls(b, 'cant', !!(row && row.level === 'fault'));
      // …in the SAME vocabulary the markup was born in (see `cardHtml`'s ⛔⛔ block). One fact — is
      // this card the one in the player's hand — written to whichever attribute this card's control
      // TYPE uses. ⚠️ `aria-checked` follows `.on` exactly, so with the tool put DOWN nothing in the
      // group is checked: that is true, not a gap. No wall is being placed.
      setAttr(b, matAttr == null ? 'aria-pressed' : 'aria-checked', on ? 'true' : 'false');
      const title = chipTitleText(tool, parts);
      if (title) setAttr(b, 'title', title);
      else if (b.getAttribute('title') != null) b.removeAttribute('title');
    }
  }

  return { paint, labelEl: el.label };
}
