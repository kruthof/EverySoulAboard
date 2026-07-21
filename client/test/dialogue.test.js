// C5 dialogue-live tests — the PURE surface the live conversation flow is built on: the wire
// command constructors (talk/say/bye/moss), the selected-crew cid resolver that the T key uses,
// the chat reducer bound to a full live session (fixture replay), a mid-session reconnect that
// must not wedge, and interleaved sessions. The DOM wiring (say/bye send, the llmstatus chip,
// the citizen card) is browser-only glue in hud.js/panels.js — exercised in the browser, not node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Cmd } from '../src/wire/session.js';
import { decode, selectedCrewCid } from '../src/wire/messages.js';
import {
  initChatState, reduceChat, reduceChatAll, getSession, sessionModel, streamingText,
} from '../src/ui/chat.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures');
function loadJsonl(name) {
  return readFileSync(join(FIX, name), 'utf8')
    .split('\n').filter((l) => l.trim().length).map((l) => decode(l)).filter((m) => m != null);
}
const chat = (sid, ev, extra = {}) => ({ type: 'chat', sid, ev, ...extra });

// ---------------- command constructors ----------------

test('talk/say/bye are keyed by `type` (the P2 command family), moss omits empty text', () => {
  assert.deepEqual(Cmd.talk(7), { type: 'talk', cid: 7 });
  assert.deepEqual(Cmd.say(3, 'hello'), { type: 'say', sid: 3, text: 'hello' });
  assert.deepEqual(Cmd.bye(3), { type: 'bye', sid: 3 });
  // moss with text carries it; without text the key is absent (open/audit take no text).
  assert.deepEqual(Cmd.moss('set', 't1', 'src'), { type: 'moss', op: 'set', tid: 't1', text: 'src' });
  assert.deepEqual(Cmd.moss('open', 't1'), { type: 'moss', op: 'open', tid: 't1' });
  // The view commands stay keyed by `cmd` — the two families are distinct on the wire.
  assert.equal(Cmd.click(1, 2).cmd, 'click');
  assert.equal(Cmd.talk(1).cmd, undefined);
});

// ---------------- selected-crew cid (the T key's resolver) ----------------

test('selectedCrewCid reads the cid (4th element) of the crew on the selected tile', () => {
  // crew tuple is [x, y, pv, cid]; sel points at (5,5) → cid 42.
  const frame = { sel: [5, 5], crew: [[1, 1, 0, 7], [5, 5, 2, 42]] };
  assert.equal(selectedCrewCid(frame), 42);
});

test('selectedCrewCid is null when nothing crew-like is selected or the frame is degenerate', () => {
  assert.equal(selectedCrewCid({ sel: [5, 5], crew: [[1, 1, 0, 7]] }), null); // sel not on a crew
  assert.equal(selectedCrewCid({ crew: [[5, 5, 2, 42]] }), null);             // no selection
  assert.equal(selectedCrewCid({ sel: [5, 5] }), null);                       // no crew list
  assert.equal(selectedCrewCid(null), null);
  // An older host frame with a 3-element crew tuple (no cid) → null, never a throw.
  assert.equal(selectedCrewCid({ sel: [5, 5], crew: [[5, 5, 2]] }), null);
});

// ---------------- full live flow (fixture replay) ----------------

test('fixture replay: session_live.jsonl yields the full transcript, streaming clears, ends', () => {
  const events = loadJsonl('session_live.jsonl');
  // The citizen + llmstatus messages ride the same stream; the chat reducer only folds `chat`s.
  assert.ok(events.some((m) => m.type === 'citizen'), 'flow carries a citizen card');
  const status = events.filter((m) => m.type === 'llmstatus');
  assert.equal(status.length, 2);
  assert.deepEqual(status[1], { type: 'llmstatus', backend: 'anthropic', degraded: true, costPerHour: 1.42 });

  const s = reduceChatAll(initChatState(), events.filter((m) => m.type === 'chat'));
  const m = sessionModel(getSession(s, 3));
  assert.equal(m.name, 'Kort Vael');
  assert.deepEqual(m.entries, [
    { kind: 'line', who: 'Kort Vael', text: 'The pumps are holding. For now.' },
    { kind: 'effect', text: 'Kort notes your concern (trust +1)' },
    { kind: 'line', who: 'Kort Vael', text: "I'll keep watch. Go rest." },
  ]);
  assert.equal(m.streaming, null, 'the final line cleared the delta preview');
  assert.equal(m.ended, true);
  assert.equal(m.endReason, 'complete');
});

// ---------------- reconnect mid-session must not wedge ----------------

test('a reconnect (fresh start for a live sid) resets that session cleanly and keeps working', () => {
  let s = initChatState();
  s = reduceChat(s, chat(3, 'start', { cid: 7, name: 'Kort Vael' }));
  s = reduceChat(s, chat(3, 'delta', { seq: 0, text: 'half a thou' }));
  s = reduceChat(s, chat(3, 'line', { who: 'Kort Vael', text: 'First line.' }));
  // --- socket drops here; on reconnect the host re-opens the session with a fresh `start` ---
  s = reduceChat(s, chat(3, 'start', { cid: 7, name: 'Kort Vael' }));
  const afterReconnect = sessionModel(getSession(s, 3));
  assert.deepEqual(afterReconnect.entries, [], 'reconnect start resets the transcript');
  assert.equal(afterReconnect.streaming, null, 'stale delta preview cleared');
  assert.equal(afterReconnect.ended, false, 'session is live again, not wedged');
  // …and the reopened session keeps folding new events correctly.
  s = reduceChat(s, chat(3, 'line', { who: 'Kort Vael', text: 'Post-reconnect line.' }));
  assert.deepEqual(sessionModel(getSession(s, 3)).entries,
    [{ kind: 'line', who: 'Kort Vael', text: 'Post-reconnect line.' }]);
});

test('garbage / out-of-order arrivals during a flaky link never throw or wedge the store', () => {
  let s = initChatState();
  s = reduceChat(s, chat(3, 'start', { cid: 7, name: 'Kort' }));
  // duplicate, gap, post-nothing, malformed — all tolerated; store stays usable.
  s = reduceChat(s, chat(3, 'delta', { seq: 5, text: 'e' }));
  s = reduceChat(s, chat(3, 'delta', { seq: 5, text: 'DUP' }));
  s = reduceChat(s, chat(3, 'delta', { seq: 2, text: 'c' }));
  s = reduceChat(s, null);
  s = reduceChat(s, { type: 'chat' });
  assert.equal(streamingText(getSession(s, 3)), 'ce'); // seq-sorted, dup ignored, gap tolerated
  assert.doesNotThrow(() => reduceChat(s, chat(3, 'line', { who: 'Kort', text: 'ok' })));
});

// ---------------- interleaved live sessions ----------------

test('two interleaved live sessions stay independent through the full flow', () => {
  let s = initChatState();
  s = reduceChat(s, chat('A', 'start', { cid: 1, name: 'Ada' }));
  s = reduceChat(s, chat('B', 'start', { cid: 2, name: 'Bo' }));
  s = reduceChat(s, chat('A', 'delta', { seq: 0, text: 'a…' }));
  s = reduceChat(s, chat('B', 'line', { who: 'Bo', text: 'Bo done.' }));
  s = reduceChat(s, chat('A', 'line', { who: 'Ada', text: 'Ada done.' }));
  s = reduceChat(s, chat('B', 'end', { reason: 'complete' }));
  const A = sessionModel(getSession(s, 'A')), B = sessionModel(getSession(s, 'B'));
  assert.deepEqual(A.entries, [{ kind: 'line', who: 'Ada', text: 'Ada done.' }]);
  assert.equal(A.ended, false);
  assert.deepEqual(B.entries, [{ kind: 'line', who: 'Bo', text: 'Bo done.' }]);
  assert.equal(B.ended, true);
});
