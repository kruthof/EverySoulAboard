// Typing isolation (playtest finding): keys typed into the dialogue say box or the
// MOSS terminal textarea must never trigger game shortcuts — and must not be
// preventDefault'ed away from the field. The guard is the pure, duck-typed
// isTextEntryTarget; the window keydown handler bails (except Escape) when it's true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTextEntryTarget } from '../src/input/controls.js';

test('text-entry elements are recognized', () => {
  assert.equal(isTextEntryTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }), true);
});

test('game surfaces are not text entry', () => {
  assert.equal(isTextEntryTarget({ tagName: 'CANVAS' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'DIV' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: false }), false);
  assert.equal(isTextEntryTarget(null), false);
  assert.equal(isTextEntryTarget(undefined), false);
  assert.equal(isTextEntryTarget({}), false);
});
