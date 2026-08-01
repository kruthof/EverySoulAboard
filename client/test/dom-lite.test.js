// dom-lite's OWN pins. This file exists because of a measured hole, not for completeness.
//
// `moss-screen.test.js`'s M3-17 focus tests can only see the owner's keyboard defect because this
// harness models four browser rules — and MEASURED (the M3-17 review): making ANY ONE of the four
// inert leaves the whole client suite GREEN except for the M3-17 tests that happen to lean on it,
// and one of them (`focus()` refusing a hidden ancestor) is a SINGLE LINE whose deletion makes the
// `open()`-ordering pin silently vacuous with nothing else red. A harness rule that nothing pins is
// a harness rule that will be "tidied away".
//
// Each rule below was checked against real Chrome over CDP before it was written here (the receipts
// are in `dom-lite.js`'s own comments and in the M3-17 commit message). This is deliberately NOT a
// DOM test suite: it pins the four rules the focus instruments rest on, plus the one tolerance
// contract another test file depends on. Nothing else belongs here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DocumentLite } from './dom-lite.js';

/** doc → body → host → child(input) — the shape every rule below is asserted on. */
function tree() {
  const doc = new DocumentLite();
  const host = doc.createElement('div');
  const input = doc.createElement('input');
  host.appendChild(input);
  doc.body.appendChild(host);
  return { doc, host, input };
}

test('dom-lite rule 1: replaceChildren(sameNode) BLURS — remove + re-insert, not a no-op', () => {
  // Chrome: `body.replaceChildren(body.firstChild)` leaves activeElement on <body>. This is the rule
  // that makes "keep a persistent wrap and re-attach it every render" a NON-fix for M3-17/A.
  const { doc, host, input } = tree();
  input.focus();
  assert.equal(doc.activeElement, input, 'precondition');
  doc.body.replaceChildren(host);
  assert.equal(doc.activeElement, null, 'the focused input survived a replaceChildren of its ancestor');
  assert.equal(input.focused, false, 'and the element still thinks it is focused');
  assert.equal(host.parentNode, doc.body, 'while the node itself is back in place');
});

test('dom-lite rule 2: appendChild MOVES a connected node, and the move blurs', () => {
  // The stub used to leave the node in TWO childNodes arrays, so a re-parent was invisible.
  const { doc, host, input } = tree();
  const elsewhere = doc.createElement('div');
  doc.body.appendChild(elsewhere);
  input.focus();
  elsewhere.appendChild(host);
  assert.equal(doc.activeElement, null, 'moving a subtree must blur what is focused inside it');
  assert.equal(host.parentNode, elsewhere, 'the node moved');
  assert.equal(doc.body.childNodes.includes(host), false,
    'and it is no longer under its old parent — a node cannot be in two places');
});

test('dom-lite rule 3: removing an ANCESTOR blurs the focused descendant', () => {
  const { doc, host, input } = tree();
  input.focus();
  host.remove();
  assert.equal(doc.activeElement, null);
  assert.equal(input.isConnected, false, 'and the subtree is off the document');
  // ...and a removal that does NOT contain the focused element leaves it alone.
  const other = doc.createElement('div');
  doc.body.appendChild(other);
  doc.body.appendChild(host);
  input.focus();
  other.remove();
  assert.equal(doc.activeElement, input, 'an unrelated removal must not blur');
});

test('dom-lite rule 4: focus() is refused under a hidden ancestor (the takeover rule)', () => {
  // Chrome: with `#moss-view[hidden]` (`.moss` display:none) `input.focus()` is a silent no-op and
  // activeElement stays on <body>. This ONE line is what makes M3-17/B's "takeover first, then
  // focus" pin able to fail at all.
  const { doc, host, input } = tree();
  host.hidden = true;
  input.focus();
  assert.equal(doc.activeElement, null, 'a hidden subtree must not be focusable');
  assert.equal(input.focused, false);
  host.hidden = false;
  input.focus();
  assert.equal(doc.activeElement, input, 'and it becomes focusable the moment it is shown');
  // the element's own `hidden` counts too, not only an ancestor's
  const solo = doc.createElement('input');
  solo.hidden = true;
  doc.body.appendChild(solo);
  solo.focus();
  assert.equal(doc.activeElement, input, 'focus moved onto a hidden element');
});

test('dom-lite: remove() is TOLERANT of a parent that already forgot the node', () => {
  // The contract `overview-model.test.js` depends on: its `OvEl` models `innerHTML = …` as
  // `childNodes = []`, which leaves former children pointing at a parent that no longer lists them,
  // and its BUG-B regression asserts `remove()` still clears `parentNode`. Delegating to
  // `removeChild` alone made that an early return and reddened two overview tests.
  const { doc, host, input } = tree();
  host.childNodes = [];                       // the innerHTML stand-in, verbatim
  assert.equal(input.parentNode, host, 'precondition: the dangling state this contract is about');
  input.remove();
  assert.equal(input.parentNode, null, 'remove() must be total, listed by the parent or not');
  assert.equal(doc.activeElement, null);
});
