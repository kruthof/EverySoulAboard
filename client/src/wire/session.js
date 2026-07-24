// WebSocket session — the single connection to the host. Broadcasts are global (the host is
// single-session by design: deck/lens/speed/cursor/selection are shared across tabs), so this
// just decodes inbound lines to typed messages and marshals outbound commands. Auto-reconnects
// like Client.html. Command shapes mirror hosts/web/GameSession.cs WebCommand.Parse.

import { decode } from './messages.js';

// The structured client is served separately from the host (a static server / file://), so it
// cannot rely on location.host for the WebSocket. Resolution order:
//   ?ws=ws://host:port/ws   explicit full URL, else
//   ?port=NNNN              host port on the current hostname, else
//   default: ws://<hostname|localhost>:8330/ws   (the documented dev-loop port)
function resolveWsUrl() {
  const q = new URLSearchParams(location.search);
  if (q.get('ws')) return q.get('ws');
  const port = q.get('port') || '8330';
  const host = location.hostname || 'localhost';
  return `ws://${host}:${port}/ws`;
}

export class WireSession {
  /**
   * @param {(msg: import('./messages.js').WireMsg) => void} onMessage
   * @param {(connected: boolean) => void} [onConnChange]
   */
  constructor(onMessage, onConnChange) {
    this._onMessage = onMessage;
    this._onConnChange = onConnChange || (() => {});
    this._ws = null;
    this._url = resolveWsUrl();
  }

  connect() {
    this._ws = new WebSocket(this._url);
    this._ws.onopen = () => this._onConnChange(true);
    this._ws.onclose = () => { this._onConnChange(false); setTimeout(() => this.connect(), 900); };
    this._ws.onmessage = (e) => { const m = decode(e.data); if (m) this._onMessage(m); };
  }

  /** Send a command object, e.g. {cmd:'cursor',x,y}, {cmd:'lens',name}, {cmd:'speed',delta}. */
  send(obj) {
    if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify(obj));
  }
}

// --- command constructors (the full protocol GameSession understands) ---
// Two families share the wire (WebCommand.Parse): the original VIEW commands keyed by "cmd", and
// the P2 conversation/MOSS commands keyed by "type" (talk/say/bye/moss). The key difference is
// deliberate — the host reader dispatches on whichever is present.
export const Cmd = {
  cursor: (x, y) => ({ cmd: 'cursor', x, y }),
  click: (x, y) => ({ cmd: 'click', x, y }),
  move: () => ({ cmd: 'move' }),
  deck: (dz) => ({ cmd: 'deck', dz }),
  lens: (name) => ({ cmd: 'lens', name }),
  speed: (delta) => ({ cmd: 'speed', delta }),
  pause: () => ({ cmd: 'pause' }),
  // P2.1 build palette: designate wall/door/floor or cancel a queued order at a tile on the current
  // deck. `material` is the wall/floor material variant byte (0 = default; ignored for door/cancel);
  // the host records it on the built tile. Legality is decided sim-side at the tick boundary — the
  // client never ghosts an outcome. Existing 3-arg callers get material 0.
  build: (kind, x, y, material = 0) => ({ cmd: 'build', kind, x, y, material: material | 0 }),
  // E0-3 order verbs: mark (on=true) or clear (on=false) a dig target / stockpile zone at a tile on
  // the current deck. `on` is explicit rather than a toggle so a drag-sweep is idempotent and the
  // client never has to guess the tile's current flag. Legality is the sim's call at the tick
  // boundary (dig marks Debris walls only; stockpile zones walkable tiles only) — an illegal order
  // is a silent no-op, and the player sees it land when the tile recolours in the next frame.
  dig: (x, y, on = true) => ({ cmd: 'dig', x, y, on: on ? 1 : 0 }),
  stockpile: (x, y, on = true) => ({ cmd: 'stockpile', x, y, on: on ? 1 : 0 }),
  // Room Zoom decorate palette: place a functional furniture device (kind is the palette tool
  // string bunk/desk/chair/locker/plant/lamp/growbed/medbed/table) or remove a placed one at a
  // tile on the given deck. Legality is decided sim-side at the tick boundary — the client never
  // ghosts an outcome; the item appears only when the sim confirms it in the next frame.
  place: (kind, x, y, deck) => ({ cmd: 'place', kind, x, y, deck }),
  remove: (x, y, deck) => ({ cmd: 'remove', x, y, deck }),
  // Overview ＋ADD ROOM: commission an empty hall (deck + slot index) into a live typed room.
  // roomType is the picker's lowercase type string (quarters/mess/medbay/…); the host validates
  // it and the commission (must be a sealed, airless hall) at the tick boundary — the client never
  // ghosts the outcome; the slot flips occupied+typed only when the next `decks` frame confirms it.
  addRoom: (deck, slotIndex, roomType) => ({ cmd: 'addroom', deck, slot: slotIndex, type: roomType }),
  // P2.1 chronicle: request the chron message (also pushed on day rollover).
  chron: () => ({ type: 'chron' }),
  // P2 conversation: open a talk with a crew member (by cid), stream a player line, or close.
  talk: (cid) => ({ type: 'talk', cid }),
  say: (sid, text) => ({ type: 'say', sid, text }),
  bye: (sid) => ({ type: 'bye', sid }),
  // P2 biography: re-request a crew member's citizen card (with the CURRENT conversation log) so the
  // READOUT BIOGRAPHY button always opens fresh after new chats.
  bio: (cid) => ({ type: 'bio', cid }),
  // P2 MOSS terminal ops (C6): open/set/audit a program by terminal id.
  moss: (op, tid, text) => (text === undefined ? { type: 'moss', op, tid } : { type: 'moss', op, tid, text }),
};
