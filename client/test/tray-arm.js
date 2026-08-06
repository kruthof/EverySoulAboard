// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE BUILD TRAY, DRIVEN — the one helper every node rig uses to pick up a tool.
//
// ⚠️ THIS IS A SHARED TEST MODULE AND THE HOUSE RULE SAYS THAT IS A MERGE HAZARD
// (`prioritise-menu.test.js`: *"two lanes editing one test module is the merge shape that has
// already broken this repo once"*). It is shared anyway, and the reason is the OTHER half of that
// rule: the hazard is two lanes EDITING one module, and what would be duplicated here is not a
// three-line assertion but a THREE-STEP GESTURE — walk to the category, walk to the leaf, press the
// card. Six copies of a navigation sequence is six places that go stale on the day the taxonomy
// changes, and five of them would go stale SILENTLY (a rig that cannot find a card asserts nothing).
// The module is NEW, owned by one lane, and every rig that imports it asserts on its own DOM.
//
// ⛔ IT DRIVES THE SHIPPED CONTROLS AND NOTHING ELSE. It never calls `arm()`, never touches
// `_trayNav`, never reaches into the module's state: it finds a real `<button>` in the real markup
// and clicks it through the rig's own event dispatcher. A helper that shortcut the gesture would
// make every "the player can reach this" leg a statement about the helper.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { trayLeafFor, categoryOf } from '../src/ui/build-tray-model.js';
import { toolHasMaterial } from '../src/ui/build-material-model.js';

/**
 * @param {{doc:object, click:(el:object)=>void, assert:object, id?:string}} rig
 *   `doc` resolves `#rz-tray`; `click` is the rig's own dispatcher (it must reach
 *   `roomzoom-view`'s delegated `#roomzoom-view` click handler, i.e. the tray's `parentNode` must
 *   be wired to the root — every rig does that for the palette already).
 */
export function makeTrayDriver({ doc, click, assert, id = 'rz-tray' }) {
  const tray = () => doc.getElementById(id);
  /** A section of the tray by CLASS — recursive in a browser, and the flat-scan rigs keep each
   *  section's own children on the section element, which is why every lookup goes through here. */
  const part = (cls) => { const t = tray(); return t ? t.querySelector('.' + cls) : null; };
  const btns = (sectionCls, btnCls) => {
    const h = part(sectionCls);
    return h ? Array.from(h.querySelectorAll('.' + btnCls)) : [];
  };
  const cats = () => btns('rz-tray-cats', 'rz-tray-cat');
  const subs = () => btns('rz-tray-subs', 'rz-tray-sub');
  const cards = () => btns('rz-tray-cards', 'rz-card');
  const crumbs = () => btns('rz-tray-crumbs', 'rz-tray-crumb');

  /** Walk to the leaf that holds `tool`, pressing the real rail rows. Returns the leaf id. */
  function open(tool) {
    const leaf = trayLeafFor(tool);
    assert.ok(leaf, `\`${tool}\` is in no tray leaf — the taxonomy census should have said so first`);
    const cat = categoryOf(leaf);
    const catBtn = cats().find((b) => b.getAttribute('data-rzcat') === cat);
    assert.ok(catBtn, `no \`${cat}\` row in the tray's category rail`);
    click(catBtn);
    // A one-leaf category is entered in ONE press (`trayNav`), so the leaf rail is empty for it —
    // absence here is correct rather than a miss, and asserting presence would redden that design.
    const subBtn = subs().find((b) => b.getAttribute('data-rzsub') === leaf);
    if (subBtn) click(subBtn);
    return leaf;
  }

  /** The card for `(tool, mat)` in the CURRENTLY OPEN leaf, or undefined. */
  function cardFor(tool, mat) {
    const want = mat == null && toolHasMaterial(tool) ? 0 : mat;
    return cards().find((b) => b.getAttribute('data-rztool') === tool
      && (want == null
        ? b.getAttribute('data-rzmat') == null
        : String(b.getAttribute('data-rzmat')) === String(want)));
  }

  /** Navigate to `tool`'s leaf and press its card — the whole player gesture. Returns the card. */
  function arm(tool, mat) {
    open(tool);
    const card = cardFor(tool, mat);
    assert.ok(card, `no \`${tool}\`${mat == null ? '' : ' / mat ' + mat} card in the shipped tray`);
    click(card);
    return card;
  }

  return { tray, part, cats, subs, cards, crumbs, open, cardFor, arm };
}
