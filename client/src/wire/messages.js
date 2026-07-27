// Wire message shapes + decode. The host (hosts/web/WireFormat.cs) emits one-line JSON per
// channel; the client owns every pixel, so these carry SEMANTIC ids only. Types documented
// here mirror WireFormat.cs exactly. Parsing is intentionally tolerant: a malformed line is
// dropped, never thrown (the host is the only producer, but the receive path must not crash).

/**
 * A frame cell: [glyphCode, fgColorId, bgColorId, attrBits]. glyphCode = char code point;
 * fg/bg = GlyphColor enum bytes; attr = GlyphAttr bits (1=inverse cursor, 2=dim).
 * @typedef {[number, number, number, number]} Cell
 */

/**
 * @typedef {Object} FrameMsg
 * @property {'frame'} type
 * @property {number} deck
 * @property {string} lens        lowercase lens label ('none'|'pressure'|…)
 * @property {number} w
 * @property {number} h
 * @property {Cell[]} cells        flat row-major, length w*h
 * @property {[number,number]} [sel]         selected crew tile on this deck (client draws reticle)
 * @property {[number,number,number][]} [crew] visible crew as [x, y, variant]
 */

/**
 * @typedef {Object} MetricsMsg
 * @property {'metrics'} type
 * @property {number} day
 * @property {number} [dayFrac]
 * @property {number} power @property {number} oxygen @property {number} co2ppm
 * @property {number} water @property {number} food @property {number} heat
 * @property {number} structural @property {number} morale
 * @property {number} [regolith] loose build-material stock in whole units (view-only STORES chip)
 */

/** @typedef {{type:'log'|'legend'|'inspect', lines:string[]}} LinesMsg */
/** @typedef {{type:'status', text:string, speed:string, paused:boolean}} StatusMsg */

/**
 * Conversation stream (P2). One session is keyed by `sid`; `ev` selects the payload:
 *   start  {cid, name}           begins/reopens the session (speaker identity)
 *   delta  {seq, text}           COSMETIC token stream for the turn being spoken now
 *   line   {who, text}           AUTHORITATIVE accumulated turn — the transcript source of truth
 *   effect {text}                an authoritative side-note (a memory formed, a promise kept)
 *   end    {reason}              the conversation is over
 * A client that dropped every `delta` must still render a correct transcript from `line`s alone;
 * `line` supersedes the delta preview for its turn. See ui/chat.js (pure reassembler).
 * @typedef {Object} ChatMsg
 * @property {'chat'} type
 * @property {string|number} sid
 * @property {'start'|'delta'|'line'|'effect'|'end'} ev
 * @property {*} [cid] @property {string} [name]
 * @property {number} [seq] @property {string} [text]
 * @property {string} [who] @property {string} [reason]
 */

/**
 * A citizen inspector payload (P2). `portrait` is a string key that MAY be unknown (the art
 * pipeline hasn't produced it) → the client resolves a procedural silhouette fallback. `log` is the
 * durable-within-run conversation log (B3, append-only trailing field): [who, text] pairs oldest
 * first, who = "you" (player) | "crew"; absent on an older host → the card shows the empty state.
 * @typedef {Object} CitizenMsg
 * @property {'citizen'} type
 * @property {*} cid @property {string} name @property {string} [role] @property {string} [mood]
 * @property {string[]} [traits] @property {string} [portrait]
 * @property {[string,string][]} [log]
 */

/**
 * MOSS terminal channel (P2/W3). Server → client events (WireFormat.Moss*):
 *   source  {tid, text, hash}                    the installed program's source + its FNV-1a32 hash
 *   diag    {tid, ok, diags:[[line,col,sev,msg]]} compile diagnostics (line/col 1-based; sev string)
 *   audit   {tid, lines:[[tick,text]]}            the runtime audit ring
 *   rterror {tid, text}                           a runtime error to surface as a banner
 * @typedef {Object} MossMsg
 * @property {'moss'} type
 * @property {'source'|'diag'|'audit'|'rterror'} ev
 * @property {string} [tid] @property {boolean} [ok] @property {number} [hash]
 * @property {[number,number,string,string][]} [diags]
 * @property {[number,string][]} [lines]
 * @property {string} [text]
 */

/**
 * LLM backend status chip (P2). Forward-compat with L6's dispatcher surface (DispatcherStatus +
 * CostMeter): the active backend name, whether the breaker has tripped (degraded → fallback), and
 * the rolling cost-per-hour estimate in USD. Rendered as a small strip chip; absent → no chip.
 * @typedef {Object} LlmStatusMsg
 * @property {'llmstatus'} type
 * @property {string} [backend] @property {boolean} [degraded] @property {number} [costPerHour]
 */

/**
 * Per-deck lighting plane (W2). The host RLE-compresses one deck's LightState grid row-major as
 * [state, count] pairs (WireFormat.Light); the client expands to a flat w*h byte plane. States are
 * the append-only LightState bytes (0 Unknown/fog · 1 Dead · 2 Emergency · 3 Brownout · 4 Powered).
 * @typedef {Object} LightMsg
 * @property {'light'} type
 * @property {number} deck @property {number} w @property {number} h
 * @property {[number,number][]} rle   run-length pairs [state, count], row-major
 */

/**
 * A `device` selection payload (W3): the interactable the player clicked. v0 carries the
 * MOSS-addressable terminal id so the client can open its program panel (C6).
 * @typedef {Object} DeviceMsg
 * @property {'device'} type @property {string} kind @property {string} [tid]
 */

/**
 * One living-crew roster entry (P2.1 console). NOT fog-gated; snapshot-cached host-side, so it
 * arrives on connect. x/y are tile coords in the same space as frame/click coords; deck is the
 * crew's current deck. task is one of the host's fixed labels (digging/hauling/…/idle);
 * portrait is a "pk_xxxxxxxx" key or "".
 * @typedef {Object} RosterEntry
 * @property {*} cid @property {string} name @property {string} role @property {string} mood
 * @property {number} morale 0..1 @property {string} task @property {string} portrait
 * @property {number} deck @property {number} x @property {number} y
 * @property {string[]} [traits]  persona traits (APPEND-ONLY trailing field; CREW-tab TRAITS column)
 */
/** @typedef {{type:'roster', crew:RosterEntry[]}} RosterMsg */

/**
 * Pending build designations (BUILD ghosts) — walls/doors the sim has NOT yet built. The client
 * renders a persistent dashed ghost on the matching deck until a designation resolves (built or
 * cancelled), whereupon it drops off this authoritative channel. Each cell is
 * [x, y, deck, kind, delivered, required] — kind 0 wall / 1 door; delivered/required are the
 * site's material ledger and are APPEND-ONLY trailing elements (IX-39), so a reader that knows
 * only the first four is unaffected and an older host that sends four still parses.
 * NOT fog-gated (own-ship build knowledge, like roster); snapshot-cached.
 * @typedef {[number,number,number,number,number?,number?]} DesignCell
 * @typedef {{type:'designs', cells:DesignCell[]}} DesignsMsg
 */

/**
 * The ship's MOSS terminal directory — one entry per terminal device, [tid, deck, x, y]. The MOSS
 * tab lists these so a terminal's IDE can be opened without hunting the deck for a console tile.
 * NOT fog-gated; snapshot-cached like roster.
 * @typedef {[string,number,number,number]} TerminalTuple
 * @typedef {{type:'terminals', list:TerminalTuple[]}} TerminalsMsg
 */

/**
 * The ship's chronicle (P2.1 console) — sent on a {"type":"chron"} request and on day rollover.
 * @typedef {{type:'chron', days:{day:number, headline:string, lines:string[]}[]}} ChronMsg
 */

/**
 * The directed relationship graph (RELATIONS web). One DIRECTED edge per tuple:
 * [fromCid, toCid, opinion(-100..100, int), tier(RelationType byte), note(string,""), secret(bool)].
 * Names resolve client-side via the cid-keyed roster; MUTUAL regard is derived client-side from the
 * two directions (relations-model.js). NOT fog-gated (same rule as roster). The `secret` flag ships
 * deliberately (the player is the ship's omniscient eye) — personal secrets stay off the wire.
 * @typedef {[number,number,number,number,string,boolean]} RelationEdgeTuple
 * @typedef {{type:'relations', edges:RelationEdgeTuple[]}} RelationsMsg
 */

/**
 * The ship-systems ledger — the MOSS terminal's pushed channel (moss-terminal spec §1.1). A cached
 * state channel like roster/designs/terminals/relations: rebuilt each render, deduped, snapshot-
 * replayed on connect, NOT fog-gated (a ship's own telemetry is fixed crew knowledge).
 *
 * Each row is [id, label, load, state, faultDay, faultText, advisory]:
 *   id        stable snake_case key (`reactor`, `life_support`, … ) — addresses `moss sys`/`open`
 *   label     display text, already uppercase
 *   load      0..100, or -1 = "no meaningful load" (renders an empty bar and `--`)
 *   state     0 NOMINAL · 1 ATTEND · 2 DEGRADED · 3 OFFLINE (append-only ladder)
 *   faultDay  day of the newest attributable fault, or -1 for none
 *   faultText fault summary, uppercase, NO day prefix (the client composes `DAY {n} · {text}`)
 *   advisory  host-derived deterministic prose for the selected row ("" renders nothing)
 * `uptime` is the RAW tick count — the host never ships a preformatted duration (culture bug), the
 * client formats it. Row order is a host decision, never a client sort (same rule as the relations
 * ring).
 * @typedef {[string,string,number,number,number,string,string]} SystemRowTuple
 * @typedef {{type:'systems', hull:string, day:number, uptime:number, rows:SystemRowTuple[]}} SystemsMsg
 */

/**
 * The per-deck compartment grid (warm-SVG Overview / Room-Zoom, wire-channels spec §1). A cached
 * state channel like roster: rebuilt each render, deduped, snapshot-replayed, NOT fog-gated. Each
 * deck ships a fixed set of slot tuples in a host-decided order (row-major over the 2×4 grid) —
 * the client renders slots by `slotIndex`, never re-sorted.
 *
 * SlotTuple = [slotIndex, x, y, w, h, anchorName, roomType, occupied, active]:
 *   slotIndex  0..7 grid position     x,y,w,h  tile rect in frame/click space
 *   anchorName the LIVE-occupying room's anchor (""=empty hall), joins to a `rooms` row
 *   roomType   RoomType byte (0 None … 15 LifeSupport; stable, from the authoring grid)
 *   occupied   bool — a real (non-vacuum) room fills the slot (host-derived, never client-guessed)
 *   active     bool — the deck holds ≥1 non-vacuum room (host-derived)
 * Append-only: a future field is a trailing element; a reader that knows nine is unaffected.
 * @typedef {[number,number,number,number,number,string,number,boolean,boolean]} SlotTuple
 * @typedef {{deck:number, slots:SlotTuple[]}} DeckEntryTuple
 * @typedef {{type:'decks', decks:DeckEntryTuple[]}} DecksMsg
 */

/**
 * Per-room atmosphere (warm-SVG LENS overlays + atmos box, spec §2). RAW `Room` derived values —
 * all display formatting (%, °C, rounding) is the client's job. One row per real room; the vacuum
 * sink and empty (airless) halls are omitted. Keyed by `anchorName` (joins a `decks` slot).
 * RoomTuple = [anchorName, deck, o2(0..1), co2ppm, pressureKPa, tempK, tileCount]. Append-only.
 * @typedef {[string,number,number,number,number,number,number]} RoomTuple
 * @typedef {{type:'rooms', rooms:RoomTuple[]}} RoomsMsg
 */

/**
 * The cosmetic, view-only decor layer (spec §3) — furniture the sim does not model. NEVER hashed;
 * the sim never reads it. Typically empty until an authored decor set exists.
 * DecorTuple = [deck, x, y, itemId, yawDeg, variant]. Append-only.
 * @typedef {[number,number,number,string,number,number]} DecorTuple
 * @typedef {{type:'decor', items:DecorTuple[]}} DecorMsg
 */

/**
 * The sparse STOCKPILE-ZONE layer (console-retirement WP-3) — one entry per tile carrying the sim's
 * `TileFlags.Stockpile`, in the host's canonical z,y,x order (never re-sorted client-side).
 * ZoneTuple = [x, y, deck, mask, flags]. Append-only.
 *
 *   mask   the EFFECTIVE accept mask: bit k ⇒ the tile accepts ItemKind k. A tile with no filter
 *          entry ships accept-all (127 today), never 0 — "restricted" is `mask !== ACCEPT_ALL`, and
 *          there is deliberately no absence sentinel to special-case.
 *   flags  bitfield; bit 0 (`ZONE_FLAG_BACKED_OFF`) = a live haul back-off sits on the tile.
 *
 * This channel exists because two facts could NOT ride `cell[1]`: stockpile PRESENCE already does
 * (GlyphColor.Stockpile = 16), but a colour byte cannot carry a 7-bit mask or a diagnostic bit.
 * NOT fog-gated (own-ship logistics knowledge, same rule as roster/designs); snapshot-cached.
 * @typedef {[number,number,number,number,number]} ZoneTuple
 * @typedef {{type:'zones', cells:ZoneTuple[]}} ZonesMsg
 */

/**
 * `flags` bit 0 of a `zones` tuple: a LIVE haul back-off sits on this stockpile tile — no hauler has
 * managed to path to it recently.
 *
 * ⚠️ READ IT AS "RECENTLY, NOBODY GOT HERE", NEVER AS "UNREACHABLE". The sim-side map is a rate
 * limiter with three lifts (a ≤5 s expiry, removal on the first successful path, a wholesale clear on
 * any tile-board change), so the bit can vanish the tick after a door opens. Any surface wording
 * stronger than "no hauler has reached this recently" over-claims.
 *
 * Mirrors `WireFormat.ZoneFlagBackedOff` in hosts/web/WireFormat.Zones.cs; the two are pinned equal
 * by client/test/zone-model.test.js, which parses that file (the tripwire palette.test.js runs
 * against GlyphColor.cs, and stock-filter-model.test.js against ItemStack.cs).
 */
export const ZONE_FLAG_BACKED_OFF = 1;

/**
 * Decode the sparse `zones` channel. Mirrors WireFormat.Zones: {type:'zones',cells:[[x,y,deck,mask,
 * flags],..]}. Tolerant: a malformed message → null, a malformed row is dropped, never throws (the
 * receive-path contract at the top of this file). ORDER IS PRESERVED — the host emits z,y,x and that
 * order is the wire contract; a client sort would be a second, silently divergent authority.
 *
 * `mask` is coerced with `num`, NOT `| 0`: `| 0` is a 32-bit operation, so it would silently zero
 * every bit at index 32 and above the day ItemKind grows past 32 members — a filter that quietly
 * accepts nothing. (The host's own ceiling is 53, JavaScript's exact-integer limit; it pins that in
 * ZonesChannelTests.) Every other field is a small tile coordinate and `| 0` is correct for those.
 * @param {{type:string, cells?:Array}|null} msg
 * @returns {{x:number,y:number,deck:number,mask:number,flags:number}[]|null}
 */
export function decodeZones(msg) {
  if (!msg || msg.type !== 'zones' || !Array.isArray(msg.cells)) return null;
  const out = [];
  for (const t of msg.cells) {
    if (!Array.isArray(t) || t.length < 5) continue;
    out.push({ x: t[0] | 0, y: t[1] | 0, deck: t[2] | 0, mask: num(t[3]), flags: t[4] | 0 });
  }
  return out;
}

/**
 * The sparse MARK layer — debris, dig orders, stockpile zones and strip orders, one entry per marked
 * tile, in the host's canonical z,y,x order (never re-sorted client-side).
 * MarkTuple = [x, y, deck, kind]. Append-only.
 *
 * ⚠️ THIS IS THE CHANNEL `docs/HANDOVER.md` §4g/§4i/§4j CALL "the `designations` channel". It is
 * named `marks` because DEBRIS IS TERRAIN, not an order — "designations" would be a lie for a
 * quarter of the payload — and it carries all four kinds because splitting debris off would leave
 * the mark layer with two sources forever, which is the defect this channel removes.
 * `hosts/web/WireFormat.Marks.cs` carries the full argument.
 *
 * WHY IT EXISTS. Both SVG surfaces used to derive their mark layer from the projected `cell[1]`
 * foreground byte, and `GlyphMapper` writes that byte in pass 1 and then OVERWRITES it in pass 3
 * (ground items), pass 4 (devices) and pass 5 (citizens). So on `--ship grid`: a crew member
 * crossing a condemned tile made its ✕ blink out and back; an item stored on a stockpile tile
 * erased the tint — the normal state of a WORKING stockpile; and a device on a dig or stockpile
 * tile hid the mark. This channel is read from the sim's own registries and no projection pass can
 * reach it.
 *
 * EXACTLY ONE kind per tile: the host resolves precedence (dig ▸ stockpile ▸ strip ▸ debris,
 * `GlyphMapper` pass 1's own order), so a tile never appears twice and no surface arbitrates.
 * FOG-GATED host-side (unlike `zones`) — debris is terrain, and an unexplored tile emits nothing.
 * Snapshot-cached, so a reconnect replays the layer.
 * @typedef {[number,number,number,number]} MarkTuple
 * @typedef {{type:'marks', cells:MarkTuple[]}} MarksMsg
 */

/** Mark kinds, mirroring `WireFormat.MarkDebris`/`MarkDig`/`MarkStockpile`/`MarkStrip` in
 *  hosts/web/WireFormat.Marks.cs. Pinned equal to the host by client/test/marks-model.test.js,
 *  which parses that file — there is no compiler across this seam. */
export const MARK_KIND_DEBRIS = 0;
export const MARK_KIND_DIG = 1;
export const MARK_KIND_STOCKPILE = 2;
export const MARK_KIND_STRIP = 3;

/** Wire kind → the mark-vocabulary name `mark-overlay.js` draws. Index IS the wire value, so this
 *  array is APPEND-ONLY exactly as the C# constants are. */
export const MARK_KIND_NAMES = Object.freeze(['debris', 'dig', 'stockpile', 'strip']);

/** The vocabulary name for a wire kind, or '' when this client has never heard of it. PURE. */
export function markKindName(kind) {
  return MARK_KIND_NAMES[kind | 0] || '';
}

/**
 * Decode the sparse `marks` channel. Mirrors WireFormat.Marks:
 * {type:'marks',cells:[[x,y,deck,kind],..]}. Tolerant: a malformed message → null, a malformed row
 * is dropped, never throws (the receive-path contract at the top of this file). ORDER IS PRESERVED —
 * the host emits z,y,x and that order is the wire contract; a client sort would be a second,
 * silently divergent authority.
 *
 * A ROW WHOSE KIND THIS CLIENT DOES NOT KNOW IS DROPPED, and that is a decision worth stating
 * because the alternative looks kinder and is not. The kind enum is append-only, so an unknown kind
 * means a NEWER host: this client cannot draw it and cannot reason about it. Keeping the row with an
 * empty name would put a cell into `roomMarkTiles`' census that every downstream `mark === 'dig'`
 * test silently answers "no" to — a lie wearing the shape of data. Dropping it means such a tile is
 * simply absent, which is what "we do not know about this" honestly looks like. Nothing in the tree
 * emits a kind above 3 today; this is the contract for the day something does.
 * @param {{type:string, cells?:Array}|null} msg
 * @returns {{x:number,y:number,deck:number,kind:number,mark:string}[]|null}
 */
export function decodeMarks(msg) {
  if (!msg || msg.type !== 'marks' || !Array.isArray(msg.cells)) return null;
  const out = [];
  for (const t of msg.cells) {
    if (!Array.isArray(t) || t.length < 4) continue;
    const kind = t[3] | 0;
    const mark = markKindName(kind);
    if (!mark) continue; // a kind from a newer host — see above
    out.push({ x: t[0] | 0, y: t[1] | 0, deck: t[2] | 0, kind, mark });
  }
  return out;
}

/** @typedef {FrameMsg|MetricsMsg|LinesMsg|StatusMsg|ChatMsg|CitizenMsg|MossMsg|LightMsg|DeviceMsg|LlmStatusMsg|RosterMsg|ChronMsg|RelationsMsg|DesignsMsg|TerminalsMsg|SystemsMsg|DecksMsg|RoomsMsg|DecorMsg|ZonesMsg|MarksMsg} WireMsg */

// NOTE — there is deliberately NO `systems` row decoder in this file. `moss-model.js:rowObj` is
// the ONE authority for turning a `systems` tuple into a row, and it is where the DA-M1 sentinel
// rules live: a missing state is `-1`/UNKNOWN, never `0`/NOMINAL, because the screen may not
// invent a healthy reading for a row it cannot read. A second decoder lived here briefly and had
// ALREADY drifted on exactly that default — it returned NOMINAL, and a green test pinned it that
// way. If another channel ever needs these rows, import `rowObj`; do not re-derive them.

/**
 * The cid of the crew member on the selected tile (frame.sel), or null when nothing crew-like is
 * selected. The crew tuple is [x, y, pv, cid] (append-only; cid is the 4th element) — a frame from
 * an older host without the cid element yields null (can't address them), never a throw. PURE.
 * @param {{sel?:number[], crew?:number[][]}|null} frame
 * @returns {number|null}
 */
export function selectedCrewCid(frame) {
  if (!frame || !Array.isArray(frame.sel) || !Array.isArray(frame.crew)) return null;
  const sx = frame.sel[0], sy = frame.sel[1];
  for (const c of frame.crew) {
    if (Array.isArray(c) && c[0] === sx && c[1] === sy) return c.length > 3 ? c[3] : null;
  }
  return null;
}

/**
 * Expand a decoded `light` message's RLE runs into a flat row-major LightState plane of length
 * w*h. Tolerant: a short/over-long run list is clamped to w*h, and a null/garbage message yields
 * null (the caller then composes with no lighting). Never throws.
 * @param {LightMsg|null} msg
 * @returns {Uint8Array|null}
 */
export function decodeLightPlane(msg) {
  if (!msg || msg.type !== 'light' || !Array.isArray(msg.rle)) return null;
  const total = (msg.w | 0) * (msg.h | 0);
  if (total <= 0) return new Uint8Array(0);
  const plane = new Uint8Array(total); // defaults to 0 (Unknown) for any tiles the runs don't cover
  let i = 0;
  for (const run of msg.rle) {
    if (!Array.isArray(run) || run.length < 2) continue;
    const state = run[0] & 0xff;
    let count = run[1] | 0;
    if (count < 0) count = 0;
    for (let k = 0; k < count && i < total; k++) plane[i++] = state;
    if (i >= total) break;
  }
  return plane;
}

/**
 * Decode one `decks` slot tuple to an object, or null if malformed (too short / not an array).
 * Tolerant: numeric fields are coerced, anchorName defaults to "", flags to booleans. Never throws.
 * @param {*} t
 * @returns {{slotIndex:number,x:number,y:number,w:number,h:number,anchorName:string,roomType:number,occupied:boolean,active:boolean}|null}
 */
export function decodeSlot(t) {
  if (!Array.isArray(t) || t.length < 9) return null;
  return {
    slotIndex: t[0] | 0, x: t[1] | 0, y: t[2] | 0, w: t[3] | 0, h: t[4] | 0,
    anchorName: typeof t[5] === 'string' ? t[5] : '',
    roomType: t[6] | 0, occupied: !!t[7], active: !!t[8],
  };
}

/**
 * Decode a `decks` message to a per-deck array of decoded slots. A malformed message → null; a
 * malformed slot or deck entry is dropped (never thrown), mirroring decodeLightPlane's tolerance.
 * @param {DecksMsg|null} msg
 * @returns {{deck:number, slots:ReturnType<typeof decodeSlot>[]}[]|null}
 */
export function decodeDecks(msg) {
  if (!msg || msg.type !== 'decks' || !Array.isArray(msg.decks)) return null;
  const out = [];
  for (const d of msg.decks) {
    if (!d || typeof d.deck !== 'number' || !Array.isArray(d.slots)) continue;
    const slots = [];
    for (const t of d.slots) { const s = decodeSlot(t); if (s) slots.push(s); }
    out.push({ deck: d.deck | 0, slots });
  }
  return out;
}

/**
 * Decode one `rooms` tuple to an object, or null if malformed. Numeric atmos fields are coerced to
 * finite numbers (a garbage value → 0). Never throws.
 * @param {*} t
 * @returns {{anchorName:string,deck:number,o2:number,co2ppm:number,pressureKPa:number,tempK:number,tileCount:number}|null}
 */
function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
export function decodeRoom(t) {
  if (!Array.isArray(t) || t.length < 7) return null;
  if (typeof t[0] !== 'string') return null;
  return {
    anchorName: t[0], deck: t[1] | 0,
    o2: num(t[2]), co2ppm: num(t[3]), pressureKPa: num(t[4]), tempK: num(t[5]), tileCount: t[6] | 0,
  };
}

/**
 * Decode a `rooms` message to an array of decoded rooms. Malformed message → null; malformed row
 * dropped. Never throws.
 * @param {RoomsMsg|null} msg
 * @returns {ReturnType<typeof decodeRoom>[]|null}
 */
export function decodeRooms(msg) {
  if (!msg || msg.type !== 'rooms' || !Array.isArray(msg.rooms)) return null;
  const out = [];
  for (const t of msg.rooms) { const r = decodeRoom(t); if (r) out.push(r); }
  return out;
}

/**
 * Decode a `decor` message to an array of placement objects. Malformed message → null; malformed
 * item dropped. Never throws.
 * @param {DecorMsg|null} msg
 * @returns {{deck:number,x:number,y:number,itemId:string,yawDeg:number,variant:number}[]|null}
 */
export function decodeDecor(msg) {
  if (!msg || msg.type !== 'decor' || !Array.isArray(msg.items)) return null;
  const out = [];
  for (const t of msg.items) {
    if (!Array.isArray(t) || t.length < 6 || typeof t[3] !== 'string') continue;
    out.push({ deck: t[0] | 0, x: t[1] | 0, y: t[2] | 0, itemId: t[3], yawDeg: t[4] | 0, variant: t[5] | 0 });
  }
  return out;
}

/**
 * Decode the sparse `materials` channel — the non-default wall/floor material variants, so built
 * tiles render their material skin. Mirrors WireFormat.Materials: {type:'materials',cells:[[x,y,
 * deck,kind,mat],..]} where kind 0 = wall, 1 = floor and mat is the WallMaterial/FloorMaterial byte.
 * Tolerant: malformed rows dropped. Returns [{x,y,deck,kind,mat}] or null.
 * @param {{type:string, cells?:Array}} msg
 */
export function decodeMaterials(msg) {
  if (!msg || msg.type !== 'materials' || !Array.isArray(msg.cells)) return null;
  const out = [];
  for (const t of msg.cells) {
    if (!Array.isArray(t) || t.length < 5) continue;
    out.push({ x: t[0] | 0, y: t[1] | 0, deck: t[2] | 0, kind: t[3] | 0, mat: t[4] | 0 });
  }
  return out;
}

/**
 * Decode one wire line. Returns the parsed message or null on garbage.
 * @param {string} data
 * @returns {WireMsg|null}
 */
export function decode(data) {
  let m;
  try { m = JSON.parse(data); } catch { return null; }
  if (!m || typeof m.type !== 'string') return null;
  return m;
}
