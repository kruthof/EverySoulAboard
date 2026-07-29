// UI view-model tests — the PURE cores behind the dialogue/citizen/terminal panels: the chat
// stream reassembler (chat.js) and the portrait resolver (portraits.js). No DOM, no jsdom; the
// panels.js / hud.js DOM shells are exercised in the browser, not here. Also replays the
// hand-written wire fixtures (test/fixtures/*.jsonl) to prove end-to-end transcript correctness.
//
// ⚠️ THAT SENTENCE IS THE HOUSE POSITION AND IT NOW HAS ONE EXCEPTION (M1-F, 2026-07-29). It is
// quoted verbatim as a justification by `surface-boundary.test.js:22` and
// `console-carryover.test.js:14`, so it is deliberately left standing rather than reworded — but
// `client/test/dossier-honesty.test.js` DOES drive `panels.js`'s crew DOSSIER in node, against the
// stub DOM in `dom-lite.js`. The position holds for `hud.js` (undrivable: it wants the whole `.app`
// shell) and for the dialogue/terminal drawers. It no longer holds for the citizen card.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  initChatState, reduceChat, reduceChatAll, getSession, streamingText, sessionModel,
  chatPanelAction, citizenLog, PLAYER_WHO,
} from '../src/ui/chat.js';
import { resolvePortrait, fallbackPortrait, hueFromCid, initialsOf } from '../src/ui/portraits.js';
import { decode } from '../src/wire/messages.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures');

/** Load a JSONL fixture → array of decoded wire messages (using the real client decoder). */
function loadJsonl(name) {
  return readFileSync(join(FIX, name), 'utf8')
    .split('\n')
    .filter((l) => l.trim().length)
    .map((l) => decode(l))
    .filter((m) => m != null);
}

const chat = (sid, ev, extra = {}) => ({ type: 'chat', sid, ev, ...extra });

// ---------------- B2: closed conversations must never resurrect ----------------

test('chatPanelAction: only a `start` (re)opens; trailing events update only an open panel, else skip', () => {
  assert.equal(chatPanelAction('start', false), 'create'); // fresh talk / reconnect always opens
  assert.equal(chatPanelAction('start', true), 'create');
  for (const ev of ['delta', 'line', 'effect', 'end']) {
    assert.equal(chatPanelAction(ev, true), 'update', ev + ' updates an open window');
    assert.equal(chatPanelAction(ev, false), 'skip', ev + ' must NOT recreate a closed panel');
  }
});

test('a user-closed session still folds trailing events into state (B3 history) while the panel stays closed', () => {
  // The reducer is DOM-agnostic: even though chatPanelAction says `skip`, the store keeps folding —
  // this is what lets the biography conversation log stay complete after the window is closed.
  let s = initChatState();
  s = reduceChat(s, chat(5, 'start', { cid: 1, name: 'Ada' }));
  assert.equal(chatPanelAction('line', false), 'skip'); // window closed by the user
  s = reduceChat(s, chat(5, 'line', { who: 'crew', text: 'A late reply.' }));
  s = reduceChat(s, chat(5, 'end', { reason: 'done' }));
  const m = sessionModel(getSession(s, 5));
  assert.deepEqual(m.entries, [{ kind: 'line', who: 'crew', text: 'A late reply.' }]);
  assert.equal(m.ended, true);
});

// ---------------- B1/B3: player-speaker marker + citizen conversation log ----------------

test('citizenLog: normalizes [who,text] pairs, flags the player, tolerates missing/garbage', () => {
  assert.equal(PLAYER_WHO, 'you');
  assert.deepEqual(citizenLog(null), []);
  assert.deepEqual(citizenLog({}), []);
  assert.deepEqual(citizenLog({ log: 'nope' }), []);
  assert.deepEqual(citizenLog({ log: [['you', 'hi'], ['crew', 'hello'], 'bad', ['x']] }), [
    { who: 'you', text: 'hi', mine: true },
    { who: 'crew', text: 'hello', mine: false },
  ]);
});

// ---------------- chat reducer ----------------

test('a client that dropped every delta still renders a correct transcript from lines alone', () => {
  // Feed ONLY line + effect + end events (no deltas at all) — the authoritative path.
  let s = initChatState();
  s = reduceChat(s, chat('x', 'start', { cid: 'a', name: 'Ada' }));
  s = reduceChat(s, chat('x', 'line', { who: 'Ada', text: 'First.' }));
  s = reduceChat(s, chat('x', 'effect', { text: 'noted' }));
  s = reduceChat(s, chat('x', 'line', { who: 'Ada', text: 'Second.' }));
  s = reduceChat(s, chat('x', 'end', { reason: 'complete' }));
  const m = sessionModel(getSession(s, 'x'));
  assert.deepEqual(m.entries, [
    { kind: 'line', who: 'Ada', text: 'First.' },
    { kind: 'effect', text: 'noted' },
    { kind: 'line', who: 'Ada', text: 'Second.' },
  ]);
  assert.equal(m.streaming, null);
  assert.equal(m.ended, true);
  assert.equal(m.endReason, 'complete');
});

test('deltas reorder by seq; a line overrides the accumulated deltas byte-exact', () => {
  let s = initChatState();
  s = reduceChat(s, chat('x', 'start', { cid: 'a', name: 'Ada' }));
  // out-of-order delivery:
  s = reduceChat(s, chat('x', 'delta', { seq: 2, text: 'C' }));
  s = reduceChat(s, chat('x', 'delta', { seq: 0, text: 'A' }));
  s = reduceChat(s, chat('x', 'delta', { seq: 1, text: 'B' }));
  assert.equal(streamingText(getSession(s, 'x')), 'ABC'); // sorted by seq
  // the authoritative line is DIFFERENT text; it must win exactly:
  s = reduceChat(s, chat('x', 'line', { who: 'Ada', text: 'Actually, D.' }));
  const m = sessionModel(getSession(s, 'x'));
  assert.deepEqual(m.entries, [{ kind: 'line', who: 'Ada', text: 'Actually, D.' }]);
  assert.equal(m.streaming, null, 'delta preview cleared once the line lands');
});

test('duplicate seq is ignored (first wins); a dropped seq leaves a tolerated gap', () => {
  let s = initChatState();
  s = reduceChat(s, chat('x', 'start'));
  s = reduceChat(s, chat('x', 'delta', { seq: 0, text: 'keep' }));
  s = reduceChat(s, chat('x', 'delta', { seq: 0, text: 'DROP-ME' })); // duplicate seq
  s = reduceChat(s, chat('x', 'delta', { seq: 2, text: '-tail' }));   // seq 1 never arrives
  assert.equal(streamingText(getSession(s, 'x')), 'keep-tail');
});

test('end without a line: transcript stays empty, session marked ended, preview dropped', () => {
  let s = initChatState();
  s = reduceChat(s, chat('x', 'start', { cid: 'a', name: 'Ada' }));
  s = reduceChat(s, chat('x', 'delta', { seq: 0, text: 'half a thought' }));
  s = reduceChat(s, chat('x', 'end', { reason: 'interrupted' }));
  const m = sessionModel(getSession(s, 'x'));
  assert.deepEqual(m.entries, []);
  assert.equal(m.streaming, null);
  assert.equal(m.ended, true);
  assert.equal(m.endReason, 'interrupted');
});

test('zero-delta conversation (start → line → end)', () => {
  let s = initChatState();
  s = reduceChat(s, chat('x', 'start', { cid: 'a', name: 'Ada' }));
  s = reduceChat(s, chat('x', 'line', { who: 'Ada', text: 'Done.' }));
  s = reduceChat(s, chat('x', 'end', { reason: 'complete' }));
  const m = sessionModel(getSession(s, 'x'));
  assert.deepEqual(m.entries, [{ kind: 'line', who: 'Ada', text: 'Done.' }]);
  assert.equal(m.ended, true);
});

test('two interleaved sids stay independent', () => {
  let s = initChatState();
  s = reduceChat(s, chat('A', 'start', { cid: 'a', name: 'Ada' }));
  s = reduceChat(s, chat('B', 'start', { cid: 'b', name: 'Bo' }));
  s = reduceChat(s, chat('A', 'delta', { seq: 0, text: 'a0' }));
  s = reduceChat(s, chat('B', 'delta', { seq: 0, text: 'b0' }));
  s = reduceChat(s, chat('A', 'line', { who: 'Ada', text: 'A says.' }));
  s = reduceChat(s, chat('B', 'delta', { seq: 1, text: 'b1' }));
  assert.deepEqual(sessionModel(getSession(s, 'A')).entries, [{ kind: 'line', who: 'Ada', text: 'A says.' }]);
  assert.equal(streamingText(getSession(s, 'A')), '');    // A's line cleared A's stream
  assert.equal(streamingText(getSession(s, 'B')), 'b0b1'); // B untouched
  assert.deepEqual(sessionModel(getSession(s, 'B')).entries, []);
});

test('post-end deltas are ignored; malformed and unknown events are no-ops', () => {
  let s = initChatState();
  s = reduceChat(s, chat('x', 'start'));
  s = reduceChat(s, chat('x', 'end', { reason: 'complete' }));
  const afterEnd = reduceChat(s, chat('x', 'delta', { seq: 0, text: 'late' }));
  assert.equal(streamingText(getSession(afterEnd, 'x')), '');
  // malformed / unknown: reducer returns state unchanged, never throws
  assert.equal(reduceChat(s, null), s);
  assert.equal(reduceChat(s, { type: 'chat' }), s);              // no sid/ev
  assert.equal(reduceChat(s, chat('x', 'nonsense')), s);         // unknown ev kind
  assert.equal(reduceChat(s, chat('x', 'delta', { text: 'no-seq' })), s); // delta without seq
});

test('reduceChat does not mutate the prior state', () => {
  const s0 = initChatState();
  const s1 = reduceChat(s0, chat('x', 'start', { name: 'Ada' }));
  const s2 = reduceChat(s1, chat('x', 'line', { who: 'Ada', text: 'Hi.' }));
  assert.deepEqual(s0, { sessions: {} });                  // s0 untouched
  assert.deepEqual(getSession(s1, 'x').transcript, []);    // s1 untouched by the line append
  assert.equal(getSession(s2, 'x').transcript.length, 1);
});

// ---------------- portraits ----------------

test('a known portrait key with an asset resolves to an image; anything else falls back', () => {
  const registry = { kort_v1: 'data:image/png;base64,AAAA' };
  assert.deepEqual(
    resolvePortrait({ cid: 'kort', name: 'Kort Vael', portrait: 'kort_v1' }, registry),
    { kind: 'image', key: 'kort_v1', src: 'data:image/png;base64,AAAA' },
  );
  // unknown key → silhouette (never an image, never a throw):
  const unk = resolvePortrait({ cid: 'deng', name: 'Deng Ruo', portrait: 'missing' }, registry);
  assert.equal(unk.kind, 'silhouette');
  // key present in registry but empty src → still fall back:
  assert.equal(resolvePortrait({ cid: 'x', portrait: 'empty' }, { empty: '' }).kind, 'silhouette');
});

test('fallback hue is deterministic per cid and initials degrade safely', () => {
  assert.equal(hueFromCid('kort'), hueFromCid('kort'));       // same cid → same hue
  assert.notEqual(hueFromCid('kort'), hueFromCid('mira'));    // (distinct here) different people differ
  const p = fallbackPortrait('kort', 'Kort Vael');
  assert.equal(p.initials, 'KV');
  assert.ok(p.hue >= 0 && p.hue < 360);
  assert.equal(initialsOf('Mira', null), 'MI');              // one word → first two letters
  assert.equal(initialsOf('', 'deng'), 'DE');               // no name → cid
  assert.equal(initialsOf(null, null), '?');                // nothing → '?'
});

test('resolvePortrait never throws on degenerate input', () => {
  assert.doesNotThrow(() => resolvePortrait(null));
  assert.doesNotThrow(() => resolvePortrait({}));
  assert.doesNotThrow(() => resolvePortrait({ cid: 42, portrait: {} }, null));
  assert.equal(resolvePortrait({}).kind, 'silhouette');
});

// ---------------- fixture replay ----------------

test('fixture replay: conversation.jsonl yields the expected transcript', () => {
  const events = loadJsonl('conversation.jsonl').filter((m) => m.type === 'chat');
  const s = reduceChatAll(initChatState(), events);
  const m = sessionModel(getSession(s, 'conv-1'));
  assert.equal(m.name, 'Kort Vael');
  assert.deepEqual(m.entries, [
    { kind: 'line', who: 'Kort Vael', text: "The airlock seal held. We're not venting anymore." },
    { kind: 'effect', text: 'Kort remembers the airlock repair (trust +1)' },
    { kind: 'line', who: 'Kort Vael', text: "Barely. We lost the aft vent doing it, and I'm out of sealant." },
  ]);
  assert.equal(m.streaming, null);
  assert.equal(m.ended, true);
  assert.equal(m.endReason, 'complete');
});

test('fixture replay: interleaved.jsonl keys two sessions, reorders, dedups, ends-without-line', () => {
  const events = loadJsonl('interleaved.jsonl').filter((m) => m.type === 'chat');
  const s = reduceChatAll(initChatState(), events);
  const A = sessionModel(getSession(s, 'A'));
  const B = sessionModel(getSession(s, 'B'));
  // A: out-of-order deltas were superseded by the authoritative line; duplicate seq ignored.
  assert.deepEqual(A.entries, [{ kind: 'line', who: 'Mira Sol', text: 'Hello there, world.' }]);
  assert.equal(A.streaming, null);
  assert.equal(A.ended, true);
  // B: ended with no line — empty transcript, dangling preview dropped.
  assert.deepEqual(B.entries, []);
  assert.equal(B.streaming, null);
  assert.equal(B.ended, true);
  assert.equal(B.endReason, 'interrupted');
});

test('fixture replay: citizens.jsonl portraits resolve (known → silhouette fallback, deterministic)', () => {
  const cits = loadJsonl('citizens.jsonl').filter((m) => m.type === 'citizen');
  assert.equal(cits.length, 4);
  const registry = {}; // no portrait assets exist yet → everything must fall back
  for (const c of cits) {
    const p = resolvePortrait(c, registry);
    assert.equal(p.kind, 'silhouette', `${c.cid} should fall back`);
    // deterministic: resolving the same citizen twice is identical
    assert.deepEqual(p, resolvePortrait(c, registry));
  }
  // distinct cids generally get distinct hues (all four differ here)
  const hues = new Set(cits.map((c) => hueFromCid(c.cid)));
  assert.equal(hues.size, 4);
});
