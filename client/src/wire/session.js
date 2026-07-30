// WebSocket session — the single connection to the host. Broadcasts are global (the host is
// single-session by design: deck/lens/speed/cursor/selection are shared across tabs), so this
// just decodes inbound lines to typed messages and marshals outbound commands. Auto-reconnects
// like Client.html. Command shapes mirror hosts/web/GameSession.cs WebCommand.Parse.

import { decode } from './messages.js';
// The one accept-all constant, derived from the ItemKind mirror rather than re-typed as 0x7F here
// (stock-filter-model.js is a pure table with no DOM and no wire dependency of its own, so this
// import adds no cycle and no coupling beyond the number itself).
import { ACCEPT_ALL } from '../ui/stock-filter-model.js';

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
  // E0-5 strip verb: mark (on=true) a wall/device at a tile on the current deck for deconstruct.
  // Same explicit-on contract as dig/stockpile. The host infers wall-vs-device from the tile and
  // the sim re-validates (hull walls and doors refused); an illegal order is a silent no-op.
  strip: (x, y, on = true) => ({ cmd: 'strip', x, y, on: on ? 1 : 0 }),
  // E0-4 filter verb: set the COMPLETE accept-set of the stockpile tile at (x,y) on the current
  // deck — bit k set ⇒ accept ItemKind k. Never a per-kind toggle and never a delta: the same
  // explicit-whole-value contract dig/stockpile/strip chose, so a drag-sweep is idempotent AND a
  // repaint always re-asserts the full truth (a partial message would leave a tile the player just
  // repainted with an invisible stale restriction, and nothing in the UI could tell them).
  // `mask` is REQUIRED — paletteOrders is the only producer and supplies ACCEPT_ALL when the caller
  // has no filter; `Cmd.filter(x,y)` on its own would coerce to 0, which means ACCEPT NOTHING.
  // `& ACCEPT_ALL` guarantees a defined, non-negative wire value: the host's JSON int reader has a
  // sign branch, and a negative widened host-side to a ulong is EVERY bit set — accept-everything,
  // the silent inverse of a restrictive filter. The host refuses a negative outright; this makes
  // sure the client can never produce one in the first place.
  filter: (x, y, mask) => ({ cmd: 'filter', x, y, mask: (mask | 0) & ACCEPT_ALL }),
  // Room Zoom decorate palette: place a functional furniture device (kind is the palette tool
  // string bunk/desk/chair/locker/plant/lamp/growbed/medbed/table) or remove a placed one at a
  // tile on the given deck. Legality is decided sim-side at the tick boundary — the client never
  // ghosts an outcome; the item appears only when the sim confirms it in the next frame.
  place: (kind, x, y, deck) => ({ cmd: 'place', kind, x, y, deck }),
  remove: (x, y, deck) => ({ cmd: 'remove', x, y, deck }),
  // Room Zoom OPERATE: toggle the door/vent on a tile OPEN⇄SHUT. Same {x,y,deck} shape as
  // place/remove, and DELIBERATELY NO `on` flag — unlike dig/stockpile/strip, which carry an explicit
  // state so a drag-sweep stays idempotent, this is one click on one device the player is looking at.
  // The host resolves the device, decides the target from its CURRENT state and answers on the
  // `operate` reply channel (ok / target state / a reason in words). The client never ghosts the
  // outcome and never guesses the reason: an unpowered, inoperative, unfixably-wrecked or locked
  // device is exactly the case a silent toggle makes indistinguishable from a broken verb.
  operate: (x, y, deck) => ({ cmd: 'operate', x, y, deck }),
  // ⭐ M2-10 — THE DIRECT REPAIR ORDER: send ONE named crew member to repair the machine on ONE tile.
  // RimWorld's right-click *"Prioritize repairing X"*, and the same {x,y,deck} tile addressing
  // `operate`/`place`/`remove` use, plus the `cid` `workPriority` speaks — this is the first verb that
  // is BOTH about a tile and about a person, so it carries both and invents no third convention.
  //
  // ⚠️ THE TILE IS THE TARGET, AND THE REASON GIVEN HERE FIRST WAS TOO BROAD — quoted and narrowed to
  // its true half, because a comment that overstates what the wire lacks is how a client stops asking.
  // It read: *"THERE IS NO DEVICE ID, because there is nothing to send one FROM … the `devices`
  // channel's tuple is `[x,y,deck,kind,cond,oper,open]` … so a name-addressed order could not be
  // composed by any client that exists."* **`kind` is in that tuple**, it survives `decodeDevices`,
  // and it is the sim's own `DeviceKind` — a TYPE identity the client has had all along, and now uses
  // to NAME the menu row (`ui/prioritise-model.js`). What is genuinely absent is the AUTHORED INSTANCE
  // name — `wing_c`, `battery_2`, written in `sim/Sim.Gen/AuthoredShips.cs` as `Device.Name` and
  // carried by no channel. THAT is the half that needs a host change, and it is the only half.
  //
  // The tile stays the address regardless, because a type byte does not identify WHICH scrubber. The
  // host resolves the tile through `_deviceGrid` — the one-device-per-tile index `devices` itself is
  // built from — and refuses a tile with none. The client's job is therefore NOT to duplicate that
  // verdict but to never OFFER the order where it must fail: `ui/prioritise-model.js` gates the menu
  // on the tile having a `devices` row at all, the same fog-gated population the host resolves through.
  //
  // ⚠️ `cid` IS REQUIRED AND IT IS NOT OPTIONAL PADDING. `MoveCitizenCommand`'s cousin problem —
  // `GameSession._selected` — is the reason: a direct order taken from the HOST's selection would be
  // given to whoever the player last clicked ANYWHERE, including on another surface, and the Room
  // Zoom has its own answer to "who" (the selection, or the one soul aboard). Naming the person in
  // the payload makes the order say who it is for, so the two can never drift.
  //
  // `| 0` on all four keeps the payload integral (the host reads JSON ints) and is NOT a guard
  // against `undefined` — `undefined | 0` IS 0, and cid 0 is the host's own NOBODY sentinel. The
  // caller is the guard: `prioritiseCrew` refuses to answer with a non-finite cid at all.
  prioritise: (cid, x, y, deck) => ({
    cmd: 'prioritise', cid: cid | 0, x: x | 0, y: y | 0, deck: deck | 0,
  }),
  // ⭐ M2-3 — THE WORK-PRIORITY ORDER, the write half of the WORK tab: set ONE crew member's manual
  // priority for ONE work type. `work` is a `WorkType` index (0..5 in OD-J's order
  // Repair·Construct·Craft·Deconstruct·Mine·Haul) and `priority` is 0 = off or 1..4 with **1 the
  // HIGHEST** (the sim's convention, which reads backwards against intuition).
  //
  // WHOLE-VALUE, NEVER A DELTA — the same contract dig/stockpile/strip/filter chose, and for the
  // sharper version of their reason: the cell's cycle is computed from the LIVE `work` cache at
  // click time, so a "+1" message would be re-interpreted against whatever the sim held when it
  // arrived, and two clicks landing in one tick would compound instead of overwriting. The client
  // never ghosts the outcome either: the cell repaints from the `work` channel when the sim echoes
  // it back, so what is on screen is always what the sim holds.
  //
  // `| 0` on all three keeps the payload integral (the host reads JSON ints; fractions would be
  // digit-scanned to something else). It is NOT a guard against `undefined` — `undefined | 0` IS 0,
  // which is a real order in both fields (`work` 0 = Repair, `priority` 0 = off). The callers are
  // the guard: every call site passes dataset ints. The host's own absent-key sentinel is -1
  // (`GameSession.WebCommand.Parse`), which this function can never produce — deliberately, since
  // it only ever speaks whole orders. (Reviewer-corrected 2026-07-30: the earlier text claimed
  // `| 0` stopped `undefined` from reading as an order, which is exactly backwards.)
  workPriority: (cid, work, priority) => ({
    cmd: 'workPriority', cid: cid | 0, work: work | 0, priority: priority | 0,
  }),
  // ⭐ M1-L: `addRoom` — the `{cmd:'addroom'}` sender — is DELETED. It was the client's ONLY route to
  // `CmdKind.AddRoom`, and `GameSession` no longer parses the verb or routes it. ⭐ M1-L-b then
  // deleted the enum member and the sim's `AddRoomCommand` as well, so nothing named "add room"
  // exists anywhere in the stack. Owner ruling 2026-07-29 (OD-K): *"we do not need 'add room' that
  // makes no sense on a ship where rooms are already existing."* A stale browser tab can still send
  // `{cmd:'addroom'}`; it decodes as `Unknown` and is dropped (pinned by
  // `EveryCompartmentIsARoomTests.TheAddRoomVerb_NoLongerParses_AndAStaleClientIsIgnored`).
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
