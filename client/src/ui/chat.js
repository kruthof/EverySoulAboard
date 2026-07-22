// Chat stream reassembly — PURE. A reducer over the `chat` wire events (see wire/messages.js)
// that rebuilds a correct conversation transcript on the client, keyed by session id (sid), with
// no DOM and no mutation of its inputs. The panel layer renders the view-model this produces.
//
// The wire contract (host lands later; we build against fixtures):
//   start  {sid, cid, name}          begins/reopens a conversation session
//   delta  {sid, seq, text}          COSMETIC token stream for the turn being spoken now
//   line   {sid, who, text}          AUTHORITATIVE accumulated turn — the source of truth
//   effect {sid, text}               an authoritative side-note (a memory formed, a promise kept)
//   end    {sid, reason}             the conversation is over
//
// The load-bearing rule: the TRANSCRIPT is built ONLY from `line` + `effect` events. Deltas are a
// live preview of the turn currently being streamed and never enter the transcript, so **a client
// that dropped every delta still renders a byte-correct transcript from lines alone**. When a
// `line` lands it supersedes the delta preview for that turn (the preview is cleared). Deltas are
// ordered by `seq`; duplicates are ignored (first-wins) and gaps (dropped seqs) are tolerated —
// the preview is cosmetic and the authoritative `line` corrects it regardless.

/** @typedef {{kind:'line', who:(string|null), text:string} | {kind:'effect', text:string}} Entry */
/** @typedef {{sid:*, cid:*, name:*, transcript:Entry[], deltas:Object<string,string>, ended:boolean, endReason:*}} Session */
/** @typedef {{sessions:Object<string,Session>}} ChatState */

/** The wire marker for the player's own turns (B1): the crew's line uses "crew", the player's
 *  echoed utterance uses this. One place so the host echo, the live panel, and the biography
 *  conversation log all agree on a single player-speaker id. */
export const PLAYER_WHO = 'you';

/** Fresh, empty chat store. */
export function initChatState() {
  return { sessions: {} };
}

/**
 * Decide what a `chat` event should do to the dialogue panel DOM (B2 — a closed conversation must
 * NEVER resurrect). A `start` always (re)opens the window (a fresh talk / a reconnect); every other
 * event only UPDATES an already-open window and is otherwise ignored at the DOM layer. The reducer
 * still folds every event regardless, so the transcript (and the B3 history it feeds) stays complete
 * even while the panel stays closed. PURE.
 * @param {string} ev  the chat event kind ('start'|'delta'|'line'|'effect'|'end')
 * @param {boolean} isOpen  whether a dialogue panel is currently mounted for this sid
 * @returns {'create'|'update'|'skip'}
 */
export function chatPanelAction(ev, isOpen) {
  if (ev === 'start') return 'create';
  return isOpen ? 'update' : 'skip';
}

/**
 * Normalize a citizen card's conversation log (B3) into render entries, oldest first. Each wire
 * entry is a [who, text] pair (who is PLAYER_WHO for the player, else "crew"); tolerant of a
 * missing/garbage `log` (→ []) and of malformed rows (skipped). PURE.
 * @param {{log?:*}|null} cit
 * @returns {{who:string, text:string, mine:boolean}[]}
 */
export function citizenLog(cit) {
  const raw = cit && Array.isArray(cit.log) ? cit.log : [];
  const out = [];
  for (const e of raw) {
    if (!Array.isArray(e) || e.length < 2) continue;
    const who = e[0] == null ? '' : String(e[0]);
    out.push({ who, text: e[1] == null ? '' : String(e[1]), mine: who === PLAYER_WHO });
  }
  return out;
}

function emptySession(sid) {
  return { sid, cid: null, name: null, transcript: [], deltas: {}, ended: false, endReason: null };
}

/**
 * Fold one chat event into the store, returning a NEW state (never mutates `state` or `ev`).
 * Malformed events and events for an unknown `ev.ev` are no-ops (the receive path must not throw).
 * @param {ChatState} state
 * @param {{sid:*, ev:string, [k:string]:*}} ev  a decoded `chat` wire message
 * @returns {ChatState}
 */
export function reduceChat(state, ev) {
  if (!state) state = initChatState();
  if (!ev || typeof ev !== 'object' || ev.sid == null || typeof ev.ev !== 'string') return state;

  const sid = ev.sid;
  const prev = state.sessions[sid] || emptySession(sid);
  let next;

  switch (ev.ev) {
    case 'start':
      // Begin (or restart) the session; carries the speaker identity.
      next = { ...emptySession(sid), cid: ev.cid == null ? null : ev.cid, name: ev.name == null ? null : ev.name };
      break;

    case 'delta': {
      if (prev.ended) return state;                                   // conversation is over
      if (ev.seq == null) return state;                               // a delta needs its order key
      const key = String(ev.seq);
      if (Object.prototype.hasOwnProperty.call(prev.deltas, key)) return state; // duplicate: first wins
      next = { ...prev, deltas: { ...prev.deltas, [key]: str(ev.text) } };
      break;
    }

    case 'line':
      // Authoritative turn: append it and clear the (now superseded) delta preview.
      next = {
        ...prev,
        transcript: [...prev.transcript, { kind: 'line', who: ev.who == null ? null : ev.who, text: str(ev.text) }],
        deltas: {},
      };
      break;

    case 'effect':
      // Authoritative side-note; keeps its place in the transcript, does not touch the stream.
      next = { ...prev, transcript: [...prev.transcript, { kind: 'effect', text: str(ev.text) }] };
      break;

    case 'end':
      next = { ...prev, ended: true, endReason: ev.reason == null ? null : ev.reason, deltas: {} };
      break;

    default:
      return state; // unknown event kind — ignore, forward-compatibly
  }

  return { ...state, sessions: { ...state.sessions, [sid]: next } };
}

/** Fold a whole event list (fixture replay). */
export function reduceChatAll(state, events) {
  return (events || []).reduce((s, e) => reduceChat(s, e), state || initChatState());
}

/** The session for a sid, or null. */
export function getSession(state, sid) {
  return state && state.sessions ? (state.sessions[sid] || null) : null;
}

/** The live delta preview for a session's current turn: deltas concatenated in ascending seq. */
export function streamingText(session) {
  if (!session || !session.deltas) return '';
  return Object.keys(session.deltas)
    .map(Number)
    .sort((a, b) => a - b)
    .map((q) => session.deltas[String(q)])
    .join('');
}

/**
 * The render-ready view-model for a session: identity header, the authoritative transcript, the
 * cosmetic streaming preview (or null when there's nothing streaming), and end state.
 * @param {Session|null} session
 */
export function sessionModel(session) {
  if (!session) return null;
  const streaming = streamingText(session);
  return {
    sid: session.sid,
    cid: session.cid,
    name: session.name,
    entries: session.transcript,
    streaming: streaming.length ? streaming : null,
    ended: session.ended,
    endReason: session.endReason,
  };
}

function str(v) {
  return v == null ? '' : String(v);
}
