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
 *   pods    {tid, term, moss, note, rows:[[n,pod,occupant,state,stateWord,why,reason,can]]}
 *                                                 M3-4 — the POD BAY census (spec §1.4). `term` is
 *                                                 the console the SIM resolved; `moss` is which of
 *                                                 OD-N's three states it is in; `can` is the gate's
 *                                                 own verdict, never a thing a client derives.
 *   thaw    {tid, ok, pod, why, reason}           M3-3 — the answer to one thaw ask
 * @typedef {Object} MossMsg
 * @property {'moss'} type
 * @property {'source'|'diag'|'audit'|'rterror'|'pods'|'thaw'} ev
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
 *
 * ⚠️ `morale` IS EMITTED AND DELIBERATELY UNDRAWN ON BOTH MODERN SURFACES (M1-F, 2026-07-29).
 * No system in `sim/` ever changes `Citizen.Morale` — its only assignments are the `= 1f`
 * initialiser and the save-load restore of that same 1f — so the number that arrives here is a
 * constant, and the CREW WATCH bar + dossier meter that drew it were removed. The FIELD
 * stays on the wire on purpose: it is saved and hashed sim state, so deleting it is a determinism
 * pin move for a cosmetic fix, and whether morale becomes real is an open M4-4 decision. The
 * deprecated console shell still draws it (`hud.js`) until that surface dies at M4-8/WP-9.
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
 *          entry ships accept-all (1023 today; 511 before the wreck start added Swarf, 255 before
 *          E0-7 added Ice, 127 before E0-6 added Seals), never 0 — "restricted" is `mask !== ACCEPT_ALL`, and
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

/**
 * The sparse GROUND ITEM layer — one entry per `ItemStack` lying on a tile, in the host's store
 * order (never re-sorted client-side). ItemTuple = [x, y, deck, kind, count]. Append-only.
 *
 * WHY IT EXISTS. A ground stack reached both SVG surfaces as ONE CHARACTER — `GlyphMapper` pass 3
 * writes `Glyphs.ForItem(kind)` into the tile's glyph byte — and that byte loses three separate
 * things: the COUNT (never written at all, so a stack of 1 and a stack of 40 are the identical
 * cell); EVERY STACK BUT THE LAST (pass 3 assigns per item, and the sim never merges stacks); and
 * ANYTHING SHARING A TILE WITH A DEVICE (pass 4 overwrites the cell unconditionally, afterwards).
 * `hosts/web/WireFormat.Items.cs` carries the full argument.
 *
 * `kind` IS THE SIM'S OWN `ItemKind` BYTE, not a wire vocabulary of its own — which is why there is
 * no `ITEM_KIND_NAMES` table here beside `MARK_KIND_NAMES`. The client already mirrors that enum
 * exactly ONCE, in `ui/stock-filter-model.js` (`STOCK_KINDS`), pinned member-for-member against
 * `sim/Sim.Core/Entities/ItemStack.cs` by `stock-filter-model.test.js`. A second table here would
 * be a hand mirror of a hand mirror.
 *
 * CARRIED STACKS ARE ABSENT (host-side): their `Pos` mirrors the CARRIER, so they are a fact about
 * a person, not about a tile. FOG-GATED host-side, like `marks`. Snapshot-cached, so a reconnect
 * replays the layer.
 * @typedef {[number,number,number,number,number]} ItemTuple
 * @typedef {{type:'items', cells:ItemTuple[]}} ItemsMsg
 */

/**
 * Decode the sparse `items` channel. Mirrors WireFormat.Items:
 * {type:'items',cells:[[x,y,deck,kind,count],..]}. Tolerant: a malformed message → null, a malformed
 * row is dropped, never throws (the receive-path contract at the top of this file). ORDER IS
 * PRESERVED — the host emits entity-store order and that order is the wire contract; a client sort
 * would be a second, silently divergent authority.
 *
 * ⚠️ A ROW WHOSE KIND THIS CLIENT DOES NOT KNOW IS **KEPT**, and that is the OPPOSITE of what
 * `decodeMarks` does one screen up. The divergence is deliberate and the reasoning is not
 * transferable:
 *   • On `marks`, the kind IS the payload. A cell whose kind is unknown carries no other fact, and
 *     keeping it would put a row into `roomMarkTiles`' census that every `mark === 'dig'` test
 *     silently answers "no" to — a lie wearing the shape of data.
 *   • On `items`, the kind is ONE of five facts. A stack of an unknown kind is still a real, located,
 *     counted pile: "40 of something on this tile" is true and useful, and DROPPING it would draw an
 *     empty tile over a full one — the exact class of invisibility this channel exists to remove.
 * So an unknown kind is rendered as unnamed rather than as absent; the naming decision belongs to
 * the layer that draws (`room-model.js`).
 * @param {{type:string, cells?:Array}|null} msg
 * @returns {{x:number,y:number,deck:number,kind:number,count:number}[]|null}
 */
export function decodeItems(msg) {
  if (!msg || msg.type !== 'items' || !Array.isArray(msg.cells)) return null;
  const out = [];
  for (const t of msg.cells) {
    if (!Array.isArray(t) || t.length < 5) continue;
    out.push({ x: t[0] | 0, y: t[1] | 0, deck: t[2] | 0, kind: t[3] | 0, count: t[4] | 0 });
  }
  return out;
}

/**
 * The sparse `devices` channel (PLURAL) — per-device WEAR STATE, one row per tile-resident device,
 * read host-side from `sim.Devices` and never from the projection.
 *
 * ⚠️ NOT `DeviceMsg`. `{type:'device'}` (SINGULAR) is the one-shot reply that opens a MOSS terminal
 * and is dispatched separately in main.js. These are two different messages and the near-miss is
 * deliberate: every other sparse channel is a plural noun naming what the payload is a list of.
 *
 * `cond` is `Device.Condition` quantised to a byte, `0 = wrecked … 255 = pristine`. `oper` is the
 * sim's own `IsOperational` — 1/0 — and is NOT derivable here: the failure threshold is per-kind and
 * lives in `content/core/SimDefs/machines.def`, which this client has no copy of. Comparing `cond`
 * to a threshold of our own would be a second authority on "is this machine dead?".
 *
 * UTILITY OVERLAYS (Conduit, Pipe) ARE ABSENT, host-side: they are not tile-resident, no surface
 * draws them, they are wear-free in the defs, and they are 88% of the device store. FOG-GATED
 * host-side, like `marks` and `items`. Snapshot-cached, so a reconnect replays the layer.
 * `open` is `Device.IsOpen` — 1/0 — and it is the SEVENTH element, appended with the OPERATE verb
 * (2026-07-28) and OUTLIVING it: M3-15 (OD-N) deleted that verb from the client, so nothing in
 * `client/src/` reads element 7 today. It stays because the channel reports what a device IS, and
 * nothing else carries a device's open/shut state at all: `Glyphs.ForDevice` returns `'^'` for a vent
 * whether it is open or shut, and the DOOR glyph that does carry state is erased by `GlyphMapper`
 * pass 5 the moment a crew member stands on the tile. `Powered` is still absent, deliberately —
 * `PowerSystem` rewrites it once a second on every drawing device, so it would make this payload
 * differ on nearly every render.
 *
 * ⭐ `serv` IS THE EIGHTH ELEMENT (M3-13): 1 when this KIND of machine can EVER be serviced, 0 when
 * it never can — the sim's `MaintenanceSystem.IsEverServiceable`, i.e. the def's `maint` opt-out.
 * `CryoPod` is `maint = 0.00` deliberately, so every capsule reads `serv = 0` and the Room Zoom's
 * right-click menu stops promising a repair the sim will never take (`prioritise-model.js`).
 * ⚠️ IT IS A PER-KIND FACT, so it is constant for the life of a session — which is exactly why it
 * must be READ and not guessed: a client-side list of never-serviceable kinds is a hand mirror of a
 * DEF, and it drifts silently the day content moves.
 *
 * ⭐⭐ `spend` IS THE TENTH ELEMENT — WHICH CONSUMABLE A SERVICE AT THIS MACHINE WOULD EAT, right now.
 * A raw `ItemKind` byte, or `SPEND_NOTHING` (the free empty-handed jury-rig), or `SPEND_UNKNOWN`
 * (nothing to say). It is `MaintenanceSystem.WhatARepairWouldSpend` asked with `forced: true` — the
 * dispatcher's OWN fetch funnel, not `WantedRepairConsumable`, which is tier 0 unconditionally and
 * would say PARTS on a Seals-only ship. ⚠️ IT IS A HINT, NOT A PROMISE: a repair is 9 000 ticks of
 * fetch-and-service and the funnel re-runs at the fetch, so stock can move underneath it. Nothing is
 * reserved.
 * @typedef {[number,number,number,number,number,number,number,number,number,number]} DeviceTuple
 * @typedef {{type:'devices', cells:DeviceTuple[]}} DevicesMsg
 */

/**
 * ⛔ THE `spend` ELEMENT'S "NOTHING TO SAY", mirroring `WireFormat.SpendUnknown`. An older host's
 * short row decodes to this, and so does a machine the sim would refuse a service to outright
 * (`RepairSpend.NoService`). Both mean the surface says NOTHING about a price — D4's own send-back
 * lesson, override-never-source: an absent field must never become a fabricated value, and a
 * fabricated PARTS is how a player spends the ship's last one believing it was something else.
 */
export const SPEND_UNKNOWN = -1;

/**
 * ⛔ THE `spend` ELEMENT'S "THIS SERVICE IS FREE", mirroring `WireFormat.SpendNothing` — the
 * empty-handed jury-rig. DISTINCT FROM `SPEND_UNKNOWN` on purpose: "the ship pays nothing for this
 * repair" is a fact worth telling the player and "this client does not know" is a silence, and one
 * sentinel for both would turn every unknown into a cheerful, false *SPENDS NOTHING*.
 */
export const SPEND_NOTHING = -2;

/**
 * Decode the sparse `devices` channel. Mirrors WireFormat.Devices:
 * {type:'devices',cells:[[x,y,deck,kind,cond,oper],..]}. Tolerant: a malformed message → null, a
 * malformed row is dropped, never throws (the receive-path contract at the top of this file). ORDER
 * IS PRESERVED — the host emits entity-store order and that order is the wire contract.
 *
 * A ROW WHOSE KIND THIS CLIENT DOES NOT KNOW IS **KEPT**, following `decodeItems` and not
 * `decodeMarks`, and for the same reason `decodeItems` gives: on this channel the kind is one of six
 * facts, and "something on this tile is at condition 26 and inoperative" is true and useful even
 * when the kind byte comes from a newer host. Dropping it would hide a wreck.
 * ⚠️ THE ROW LENGTH GATE STAYS AT `< 6`, NOT `< 7`, and that is the append-only contract being
 * honoured rather than an oversight. A six-element row is what an OLDER host emits; raising the gate
 * would drop every device on the floor mid-upgrade and take the wear layer with it, to avoid a
 * missing bit that `t[6] | 0` already reads as 0 (= SHUT). A shut-by-default door is the same thing
 * the surface drew before this element existed.
 *
 * ⭐ `serv` (element 8, M3-13) DEFAULTS TO 1 — "serviceable" — WHEN THE ROW IS SHORT, and that
 * asymmetry with `open`'s 0-default is the whole decision. An older host emits seven elements; a
 * missing bit read as 0 would mean "never serviceable", i.e. this client would silently WITHDRAW the
 * Prioritise menu from every machine on the ship and the player would have no verb and no message.
 * Read as 1 the menu behaves exactly as it did before the element existed. ⇒ THE ABSENT VALUE IS THE
 * OLD BEHAVIOUR, on all three elements; that, and not a preferred constant, is the rule.
 *
 * ⭐ `air` (element 9, D4) IS THE THIRD ONE AND IT DEFAULTS TO 1 FOR THE SAME REASON, with the
 * stakes reversed: a missing bit read as 0 would paint `NO AIR AT THE WORKSITE — SHE MAY DIE` over
 * every machine on the ship the moment a host and a client fell out of step. A hazard warning that is
 * always on is a hazard warning nobody reads.
 *
 * ⭐⭐ `spend` (element 10) IS THE FOURTH AND IT BREAKS THE PATTERN — its absent value is
 * `SPEND_UNKNOWN`, WHICH IS NOT A PRICE. The rule is unchanged and this IS the rule: the absent value
 * must reproduce the behaviour that shipped before the element existed, and before it existed the
 * offer said nothing about a price at all. Here that means a SENTINEL rather than a default kind —
 * defaulting to `ItemKind.Parts` (5) would have every short row confidently name the one item the
 * shipped wreck has exactly ONE of. Absent means SAY NOTHING, never GUESS.
 * @param {{type:string, cells?:Array}|null} msg
 * @returns {{x:number,y:number,deck:number,kind:number,cond:number,oper:number,open:number,serv:number,air:number,spend:number}[]|null}
 */
export function decodeDevices(msg) {
  if (!msg || msg.type !== 'devices' || !Array.isArray(msg.cells)) return null;
  const out = [];
  for (const t of msg.cells) {
    if (!Array.isArray(t) || t.length < 6) continue;
    out.push({
      x: t[0] | 0, y: t[1] | 0, deck: t[2] | 0, kind: t[3] | 0, cond: t[4] | 0, oper: t[5] | 0,
      open: t[6] | 0, serv: t.length > 7 ? (t[7] | 0) : 1,
      // ⭐ D4 — `air` (1 = a servicer could stand at this machine on her own; 0 = the only way in is
      // the player's order waiving the air rule). ⚠️ THE FALLBACK IS 1, for the same reason `serv`'s
      // is: an older host that sends eight elements must mean "as before", never "every machine
      // aboard is lethal", which would put a death warning on the whole ship from a missing field.
      air: t.length > 8 ? (t[8] | 0) : 1,
      // ⭐⭐ `spend` — which consumable a service here would eat. ⚠️ THE FALLBACK IS THE SENTINEL, NOT
      // A KIND: an older host that sends nine elements means "as before", and before this element
      // existed the offer named no price. A default of 5 (`Parts`) would be a fabricated answer on
      // every short row.
      spend: t.length > 9 ? (t[9] | 0) : SPEND_UNKNOWN,
    });
  }
  return out;
}

/**
 * The sparse `blocked` channel — WHY AN ORDER THE PLAYER PAINTED IS DOING NOTHING. One row per
 * queued site (dig / strip / build) that the sim's worksite staging rule refuses.
 * BlockedTuple = [x, y, deck, order, reason, detail]. Append-only.
 *
 * WHY IT EXISTS. `WorksiteSafety.CanStageWorkerAt` will not park a worker on a tile whose air would
 * pull it off the job. That closed a real livelock, and its own header records what it cost: the
 * failure went from expensive-and-visible to CHEAP-AND-INVISIBLE — a designation painted in an
 * airless compartment simply never progresses, silently, with nothing on any surface saying why.
 * This repo has already paid three owner reports for the general rule that a designation the player
 * cannot understand is indistinguishable from a broken verb.
 *
 * THE REASON SET IS SMALLER THAN IT LOOKS AND THAT IS DELIBERATE. `AtmosphereSafety.IsBreathable`
 * has four branches — vacuum, thin air, CO₂, thermal — behind ONE bool, and there is no way to ask
 * which one fired. Splitting `air` into four client-side would mean re-deriving the sim's
 * breathability rule out of room numbers, i.e. a second authority that drifts the day a def moves.
 * So `air` is worded to be true of all four, including the one people forget: a room at full
 * pressure with perfect O₂ that is merely FREEZING refuses all work. `hosts/web/WireFormat.Blocked.cs`
 * carries the full argument and the one-line remedy for a future sim lane.
 *
 * WHAT IS NOT HERE: a stockpile that no crew can reach — already on `zones` as the back-off bit and
 * already drawn (`zone-overlay.js`); an unreachable-but-breathable site — the sim keeps that answer
 * private to its job sources; automatic maintenance — the player never painted it.
 *
 * FOG-GATED host-side, like `marks`/`items`/`devices`. Snapshot-cached, so a reconnect replays it —
 * which matters more here than on most channels: this payload can sit unchanged for hours.
 * @typedef {[number,number,number,number,number]} BlockedTuple
 * @typedef {{type:'blocked', cells:BlockedTuple[]}} BlockedMsg
 */

/** Blocked ORDER kinds, mirroring `WireFormat.OrderDig`/`OrderStrip`/`OrderBuild` in
 *  hosts/web/WireFormat.Blocked.cs. Pinned equal to the host by client/test/blocked-model.test.js,
 *  which parses that file — there is no compiler across this seam. */
export const BLOCKED_ORDER_DIG = 0;
export const BLOCKED_ORDER_STRIP = 1;
export const BLOCKED_ORDER_BUILD = 2;
/** ⭐ `repair` — a DIRECT ORDER the player gave a named crew member at a named machine (M2-9).
 *  ⛔ IT WAS MISSING FROM `BLOCKED_ORDER_NAMES` FROM M2-9 UNTIL 2026-08-03, which is the only reason
 *  it needs a comment of its own: the host emitted `3`, the names array had three entries, so
 *  `blockedOrderName` answered `''`, `roomBlockedTiles` fell back to its literal `'ORDER'`, and every
 *  repair badge in the game read `ORDER BLOCKED — …` where it meant `REPAIR BLOCKED — …`. A hole in
 *  an index-is-the-value table is invisible by construction; the derivation test in
 *  `client/test/blocked-model.test.js` now reads the host's `Order*` constants and requires a name
 *  for every one of them, so a fourth verb cannot ship nameless again. */
export const BLOCKED_ORDER_REPAIR = 3;

/** Blocked REASON codes, mirroring `WireFormat.ReasonAir`/`ReasonNoApproach`/`ReasonNoConsumable`.
 *  `no_consumable` is RESERVED: the host declares it so two lanes cannot both claim the value, and
 *  deliberately never emits it — the predicate behind it (`IsUnfixableWreck`) lands with a different
 *  package. It is named here so that package is a one-line host change. */
export const BLOCKED_REASON_AIR = 0;
export const BLOCKED_REASON_NO_APPROACH = 1;
export const BLOCKED_REASON_NO_CONSUMABLE = 2;
/** `unreachable` — the job board itself has failed to get anybody started on this site. ⚠️ IT IS
 *  WEAKER THAN ITS NAME. The host reads `JobSystem.IsBackedOff`, which means "a claim was attempted
 *  here and it failed", not "the world is impassable" — and one of its five carriers
 *  (`BuildJobSource._matRetryAt`) fires when the crew cannot reach the MATERIAL rather than the site.
 *  It also UNDER-claims: a site nobody has tried yet carries no stamp at all. The sentence below is
 *  worded to be true of every one of those cases; see `hosts/web/WireFormat.Blocked.cs`. */
export const BLOCKED_REASON_UNREACHABLE = 3;
/** ⭐ `work_type_off` — NOBODY ABOARD IS ASSIGNED THAT WORK (M2-18). Not one living crew member can
 *  take the work type this order belongs to: every one of them has it switched off in the WORK tab,
 *  or is incapable of it. ⚠️ UNDER OD-H THIS IS THE MOST-EMITTED REASON IN THE GAME ON DAY ONE —
 *  every work type boots OFF, so the first order a new player paints carries exactly this code, and
 *  without it the opening reads "paint an order, nothing happens, forever, silently".
 *  It is ALL crew, not any: one pawn who has it off while a shipmate has it on is a queue, not a
 *  block. The player's next action is the WORK tab, which is why it is a different sentence from
 *  `air` (vent it) and `unreachable` (open the door). */
export const BLOCKED_REASON_WORK_TYPE_OFF = 4;
/** ⭐⭐ `no_route` — THE CREW MEMBER THE PLAYER ORDERED CANNOT WALK TO THE MACHINE (D5). Emitted for
 *  REPAIR rows only, and only for a machine somebody directly ordered.
 *
 *  ⚠️ IT IS THE STRONG ANSWER, and that is exactly why it is not `unreachable`. `unreachable` is a
 *  LATCHED RECORD OF A PAST ATTEMPT ("a claim was attempted here and it failed") and hedges about
 *  the material; this one means the host ran the pathfinder, from her tile, to the tile the sim will
 *  send her to, and it said no. Two answers, two codes — see `hosts/web/WireFormat.Blocked.cs`.
 *
 *  THE DEFECT IT CLOSES: right-click ▸ PRIORITISE: REPAIR on a machine behind a shut door, the order
 *  is ACCEPTED, the dock reads "Heading to service X", and ~17 sim-seconds later it reads "Awaiting
 *  orders" with nothing anywhere saying why. The player's next action is a ROUTE — a door, a dig —
 *  which is why it is a different sentence from `no_approach` (there is nowhere to stand at all). */
export const BLOCKED_REASON_NO_ROUTE = 5;

/** Wire order → vocabulary name. Index IS the wire value, so APPEND-ONLY exactly as the C# is.
 *  ⚠️ A HOLE IN THIS TABLE IS SILENT: `blockedOrderName` answers `''` for a value the host really
 *  emits, and the badge falls back to the generic word. `repair` (3) sat in that hole from M2-9
 *  until 2026-08-03. Pinned member-for-member against the host's `Order*` constants — never
 *  hand-checked — by `client/test/blocked-model.test.js`. */
export const BLOCKED_ORDER_NAMES = Object.freeze(['dig', 'strip', 'build', 'repair']);

/** Wire reason → vocabulary name. Index IS the wire value; APPEND-ONLY. */
export const BLOCKED_REASON_NAMES = Object.freeze([
  'air', 'no_approach', 'no_consumable', 'unreachable', 'work_type_off', 'no_route',
]);

/** Reason → the SHORT sentence a surface shows the player. Deliberately phrased as what is wrong
 *  with the WORLD, not as what the dispatcher did: "the crew cannot breathe where they would have to
 *  stand" is actionable (vent it, heat it); "no adjacent staging tile satisfied the predicate" is
 *  not. `air` covers all four branches of the sim's breathability test on purpose — see the channel
 *  header above; claiming "vacuum" when the room is merely freezing would be a confident lie. */
export const BLOCKED_REASON_TEXT = Object.freeze({
  air: 'NO BREATHABLE AIR WHERE THE CREW MUST STAND',
  no_approach: 'NO WAY TO STAND NEXT TO IT',
  no_consumable: 'NO PARTS OR SEALS ABOARD',
  // ⚠️ SAYS THE WEAKER, TRUE THING. The host's answer is "the last attempt failed", not "this tile
  // is unreachable" — so the sentence is about the CREW's record, not about the world's geometry.
  // "OR THE MATERIAL FOR IT" is not padding: `BuildJobSource._matRetryAt` is one of the five
  // carriers and it fires on sites whose own approach is perfectly fine.
  unreachable: 'NO CREW HAS REACHED IT, OR THE MATERIAL FOR IT',
  // ⭐ THE WORDS ARE M2-20's, AND THIS IS THE TILE HALF OF THEM. That package owns the vocabulary
  // for "this pawn is doing nothing" and says `Awaiting orders` on the PERSON; this says the same
  // confusion's other half on the TILE. No third word is invented here, and the sentence names the
  // SHIP's state ("nobody aboard"), never a named pawn's — the crew dock already does that.
  // It points at the fix, like every other row: air → vent it, no_approach → dig to it,
  // work_type_off → open the WORK tab.
  work_type_off: 'NOBODY ABOARD IS ASSIGNED THAT WORK',
  // ⭐⭐ D5. PAIRED WITH `no_approach` ON PURPOSE AND THE PAIR IS THE WHOLE VOCABULARY: "no way to
  // STAND next to it" (there is nowhere to put a body) versus "no way to WALK to it" (there is, and
  // she cannot get there). Two different fixes — dig it out, versus open the route — so two
  // sentences. Names the WORLD, never the dispatcher, like every other row; and it says nothing
  // about WHICH door, because this host cannot know that without a second authority on connectivity.
  no_route: 'NO WAY TO WALK TO IT',
});

/** ⭐ M3-13 — the wire's "this reason has nothing to add", mirroring `WireFormat.DetailNone`.
 *  −1 and not 0: `0` is a real `ItemKind` (Regolith), so a zero sentinel could not be told from a
 *  payload. Same rule as `moss-model.js`'s −1/UNKNOWN row state. */
export const BLOCKED_DETAIL_NONE = -1;

/** ⭐⭐ D5 OVERVIEW — the wire's "this row belongs to no named crew member", mirroring
 *  `WireFormat.CidNone`. Every dig/strip/build row carries it (a designation belongs to the SHIP);
 *  only the two REPAIR walks name an owner, because only a direct order is one person told one thing.
 *  −1 and not 0 for `BLOCKED_DETAIL_NONE`'s reason: `0` is not a reserved citizen id. */
export const BLOCKED_CID_NONE = -1;

/**
 * ⭐⭐ M3-13 — THE REFUSAL-SENTENCE ITEM VOCABULARY, MIRRORING `ThawGate.ItemWords` IN
 * `sim/Sim.Core/ThawGate.cs`. Index IS the `ItemKind` byte; a hole is a kind no refusal has yet had
 * to name.
 *
 * ⚠️ IT IS NOT THIS CLIENT'S ONLY WORD FOR AN `ItemKind`, and that is deliberate rather than a
 * duplication: `stock-filter-model.js:29` says `CTRL MOD` on the stockpile FILTER CHIPS (pinned
 * equal to the TUI's own table, `hosts/tui/Ui/StockFilterModel.cs:89`). A chip has a column to fit
 * in; a refusal has a line of prose. Two vocabularies for two jobs is fine — two for ONE job is the
 * defect this table exists to prevent.
 *
 * ⛔ IT IS A HAND MIRROR OF A C# SWITCH AND IT IS PINNED BY DERIVATION, not by this comment:
 * `client/test/blocked-model.test.js` PARSES `sim/Sim.Core/ThawGate.cs` and requires every case in
 * `ItemWords` to appear here at the right index, with the same words. Re-word `CONTROLLER MODULE`
 * on either side and that test reddens — the same technique `stock-filter-model.test.js` uses on
 * `ItemStack.cs` and `palette.test.js` on `GlyphColor.cs`. There is no compiler across this seam.
 *
 * ⚠️ WHY THE CLIENT SPELLS THE ITEM AT ALL, when the MOSS POD BAY gets its sentence from the host
 * ready-made. The `blocked` channel is a TILE-STATE channel of BARE INTS — six of them — and it has
 * carried no string since it shipped. Putting one on it for this row would make the channel's
 * payload depend on which reason it is, and would put the host in the business of composing a
 * sentence for a surface that already composes four. So: the SIM owns the words, the wire carries
 * the byte, and this table is the one place the byte becomes those words on this side. The two
 * surfaces therefore agree BY DERIVATION FROM ONE SWITCH rather than by two authors being careful
 * — M2-18's rule ("one player confusion, two surfaces, neither invents a second vocabulary").
 */
export const ITEM_WORDS = Object.freeze({
  5: 'PARTS',
  6: 'CONTROLLER MODULE',
  7: 'SEALS',
  // ⭐ SWARF (9) — added with the `spend` element, which put a SECOND consumer on this table: the
  // PRIORITISE offer's price clause names whichever rung of `RepairConsumableTier` the service would
  // actually eat, and the bottom rung is Swarf. Without this entry `itemWords(9)` answers `''` and
  // the clause silently vanishes on exactly the ship where the price matters most — a salvage-only
  // wreck. ⛔ ITS TWIN IN `ThawGate.ItemWords` LANDED IN THE SAME COMMIT: the pin below is over
  // EXPLICIT case arms, and `ItemWords`' `default:` arm already returned "SWARF" by
  // `ToString().ToUpperInvariant()`, so the C# half is behaviourally a no-op and exists to keep the
  // two tables provably one vocabulary.
  9: 'SWARF',
});

/** The player's words for an `ItemKind` byte, or '' when this client has never heard of it. PURE. */
export function itemWords(kind) {
  return ITEM_WORDS[kind | 0] || '';
}

/**
 * ⭐ M3-13 — reasons whose sentence INTERPOLATES their row's `detail`, keyed by vocabulary name.
 * A function per reason rather than a template string with a `%s`: the sentence is prose, the
 * placement of the item in it is a wording decision, and a format-string table would push that
 * decision into whoever writes the next entry.
 *
 * ⚠️ EVERY FUNCTION HERE MUST TOLERATE AN UNNAMEABLE `detail` BY RETURNING A FALSY VALUE, because
 * that is how `blockedReasonSentence` knows to fall back to the generic sentence. Returning a
 * string with `undefined` spliced into it is the failure this contract exists to make impossible —
 * a badge reading "NEEDS UNDEFINED" is worse than the generic sentence it replaced.
 */
const BLOCKED_REASON_DETAIL_TEXT = Object.freeze({
  // ⭐ "NOTHING ABOARD TO REPAIR IT WITH" IS NOT PADDING AND MUST NOT BE TRIMMED TO "— NONE ABOARD".
  // The host emits this row only when the ship holds none of the repair ladder's THREE tiers, so
  // any of Parts/Seals/Swarf would clear it; `detail` names the TOP tier because that is what a
  // servicer would actually pick up. Naming only that item with no second clause would read as
  // "Parts is the only key", which is false about the ship.
  no_consumable: (detail) => {
    const words = itemWords(detail);
    return words && 'NEEDS ' + words + ' — NOTHING ABOARD TO REPAIR IT WITH';
  },
});

/**
 * ⭐⭐ M3-13 — THE SENTENCE A `blocked` ROW SHOWS THE PLAYER: the reason's own words, or the
 * DETAILED wording when the row carries a `detail` this client can name.
 *
 * THE ONE ENTRY POINT. Every surface that words a blocked row calls this rather than indexing
 * `BLOCKED_REASON_TEXT` itself, so "the tile badge names the item" cannot be true on one surface
 * and false on the next.
 *
 * DEGRADES, IN TWO STEPS, AND NEITHER STEP IS EVER `undefined`:
 *   1. a `detail` this client cannot name (a newer host's `ItemKind`, or `BLOCKED_DETAIL_NONE`)
 *      ⇒ the reason's own generic sentence — still true, just less specific;
 *   2. a REASON this client cannot name ⇒ '' , and the caller says "stuck, reason unknown".
 * Step 1 is the forward-compat path `decodeBlocked`'s header commits the whole channel to: the
 * payload of a blocked row is THIS TILE IS STUCK, and that survives a newer host's vocabulary.
 *
 * PURE. @param {string} reasonName @param {number} [detail] @returns {string} '' when unnameable
 */
export function blockedReasonSentence(reasonName, detail) {
  const name = reasonName || '';
  // ⚠️ `hasOwnProperty`, NOT a bare index, and it is not pedantry on a function that CALLS what it
  // finds. A frozen object literal still inherits `Object.prototype`, so `BLOCKED_REASON_DETAIL_TEXT
  // ['constructor']` is `Object` — a function — and calling it with a number returns a truthy Number
  // wrapper that would go straight to the badge. Today `blockedReasonName` can only produce the five
  // declared names or '', so nothing reaches it; this function is EXPORTED, and the guard is what
  // keeps that true for the next caller rather than by luck.
  const own = Object.prototype.hasOwnProperty;
  if (own.call(BLOCKED_REASON_DETAIL_TEXT, name)) {
    const text = BLOCKED_REASON_DETAIL_TEXT[name](typeof detail === 'number' ? detail : BLOCKED_DETAIL_NONE);
    if (text) return text;
  }
  return (own.call(BLOCKED_REASON_TEXT, name) && BLOCKED_REASON_TEXT[name]) || '';
}

/** The vocabulary name for a wire order, or '' when this client has never heard of it. PURE. */
export function blockedOrderName(order) {
  return BLOCKED_ORDER_NAMES[order | 0] || '';
}

/** The vocabulary name for a wire reason, or '' when this client has never heard of it. PURE. */
export function blockedReasonName(reason) {
  return BLOCKED_REASON_NAMES[reason | 0] || '';
}

/**
 * Decode the sparse `blocked` channel. Mirrors WireFormat.Blocked:
 * {type:'blocked',cells:[[x,y,deck,order,reason],..]}. Tolerant: a malformed message → null, a
 * malformed row is dropped, never throws (the receive-path contract at the top of this file). ORDER
 * IS PRESERVED — the host emits digs on a z,y,x walk then strips then builds, and that order is the
 * wire contract; a client sort would be a second, silently divergent authority.
 *
 * ⚠️ A ROW WITH AN UNKNOWN REASON IS **KEPT**; A ROW WITH AN UNKNOWN ORDER IS **KEPT** TOO. This
 * client follows `decodeItems`, not `decodeMarks`, and the reason is specific to what the row MEANS:
 * the payload of a blocked row is "THIS TILE IS STUCK", and that fact survives intact even when the
 * why or the what comes from a newer host. Dropping such a row would draw a clear tile over a stuck
 * one — silence, which is the exact failure this channel exists to remove, arriving through the
 * decoder instead of through the sim. The names come back as '' and the layer that draws decides how
 * to say "stuck, reason unknown"; that is a display decision and it is made where display lives.
 *
 * ⭐⭐ M3-13 — `detail` IS THE SIXTH ELEMENT, and this decoder is THE ONE PLACE IN `client/src/`
 * THAT READS THIS TUPLE BY INDEX. That is what makes an appended element safe here, and it is a
 * fact that was censused rather than assumed: the three screenshot rigs under `client/tools/` also
 * index the raw tuple (`c[2]`, `c[3]`, `c[4]` for their census lines) and are unaffected by an
 * APPEND, which is exactly the property the struct's own doc comment claims for the shape.
 *
 * ⚠️ THE ROW-LENGTH GATE STAYS AT `< 5`, and the missing element reads as `BLOCKED_DETAIL_NONE`
 * rather than as `0`. Both halves matter. Raising the gate to 6 would DROP every row an older host
 * emits — silence, on the channel that exists to remove silence. Defaulting to `0` would claim the
 * order wants Regolith, because `0` is a real `ItemKind`; `-1` claims nothing and the sentence
 * falls back to the reason's own generic words.
 * ⭐⭐ D5 OVERVIEW — `cid` IS THE SEVENTH ELEMENT, decoded the same way and for the same reasons: the
 * gate stays at `< 5` (raising it would DROP every row an older host emits — silence, on the channel
 * that exists to remove silence) and a missing element reads as `BLOCKED_CID_NONE`, never as `0`,
 * which is not a reserved citizen id. It is what lets the Overview's CREW-keyed dock join this
 * TILE-keyed channel without inventing a second answer to "whose order is stuck".
 * @param {{type:string, cells?:Array}|null} msg
 * @returns {{x:number,y:number,deck:number,order:number,reason:number,detail:number,cid:number,orderName:string,reasonName:string}[]|null}
 */
export function decodeBlocked(msg) {
  if (!msg || msg.type !== 'blocked' || !Array.isArray(msg.cells)) return null;
  const out = [];
  for (const t of msg.cells) {
    if (!Array.isArray(t) || t.length < 5) continue;
    const order = t[3] | 0, reason = t[4] | 0;
    out.push({
      x: t[0] | 0, y: t[1] | 0, deck: t[2] | 0, order, reason,
      detail: t.length > 5 ? (t[5] | 0) : BLOCKED_DETAIL_NONE,
      cid: t.length > 6 ? (t[6] | 0) : BLOCKED_CID_NONE,
      orderName: blockedOrderName(order), reasonName: blockedReasonName(reason),
    });
  }
  return out;
}

/**
 * The sparse `work` channel (M2-4) — each crew member's MANUAL WORK PRIORITIES, read host-side off
 * `sim.Citizens` and never off a projection, because a work priority is a fact about a PERSON and
 * reaches no tile at all. `hosts/web/WireFormat.Work.cs` carries the full argument.
 *
 * ⚠️ **THIS TUPLE DOES NOT LEAD WITH `x, y, deck`** and it is the only sparse channel that does not.
 * `WorkTuple = [cid, workType, priority]`, append-only. The other six sparse channels are keyed by
 * TILE; this one is keyed by CITIZEN, and `cid` is the same entity id the frame's crew tuple carries
 * as its 4th element. One decoder shape per KEYING — do not "fix" it into the tile shape.
 *
 * `priority` IS 1..4 WITH **1 THE HIGHEST** (RimWorld's convention, which reads backwards against the
 * intuition that a bigger number matters more), and `0` NEVER APPEARS: an OFF work type has no row at
 * all. That is the sim's own semantics rather than a compression — `WorkPriority.Off` is documented as
 * *"the ABSENCE of a priority, not a fifth priority value"* — so **absent = off** and a reader must
 * treat a missing (cid, workType) pair as switched off rather than as unknown.
 *
 * ⚠️ **AN EMPTY PAYLOAD IS THE NORMAL BOOT STATE, NOT A BROKEN CHANNEL.** Owner decision OD-H makes
 * work opt-in: every work type boots OFF for every crew member on every ship, so `cells` is `[]` until
 * the player gives an order. A surface that treats `[]` as "no data yet" and falls back to something
 * else would be inventing priorities nobody set.
 *
 * DEAD CREW ARE ABSENT host-side. NOT fog-gated, unlike every tile-keyed channel: this is the player's
 * own order about their own crew, and gating it on the tile a pawn stands on would make the grid blink
 * out when someone walked into an unexplored hall. Snapshot-cached, so a reconnect replays the layer.
 * @typedef {[number,number,number]} WorkTuple
 * @typedef {{type:'work', cells:WorkTuple[]}} WorkMsg
 */

/**
 * Decode the sparse `work` channel. Mirrors WireFormat.Work:
 * {type:'work',cells:[[cid,workType,priority],..]}. Tolerant: a malformed message → null, a malformed
 * row is dropped, never throws (the receive-path contract at the top of this file). ORDER IS
 * PRESERVED — the host emits citizen-store order and that order is the wire contract.
 *
 * ⚠️ THE ROW ORDER IS **NOT** A COLUMN ORDER. The host emits work types in enum-VALUE order, while a
 * work tab's columns are ranked by the sim's `NaturalPriority` table; those two agree today only
 * because OD-J's ranking happens to match the declaration order, and the sim is explicit that
 * reordering the enum must not silently re-rank arbitration. A surface that wants columns must carry
 * the ranking, not infer it from the sequence rows arrive in.
 *
 * A ROW WHOSE `workType` THIS CLIENT DOES NOT KNOW IS **KEPT**, following `decodeItems` and not
 * `decodeMarks`: the pair (cid, priority) is still true and locating, and a client that dropped it
 * would silently show a crew member as idler than they are — under OD-H, where an enabled work type is
 * the exception, hiding one is the more misleading error. Naming belongs to the layer that draws.
 * @param {{type:string, cells?:Array}|null} msg
 * @returns {{cid:number,workType:number,priority:number}[]|null}
 */
export function decodeWork(msg) {
  if (!msg || msg.type !== 'work' || !Array.isArray(msg.cells)) return null;
  const out = [];
  for (const t of msg.cells) {
    if (!Array.isArray(t) || t.length < 3) continue;
    out.push({ cid: t[0] | 0, workType: t[1] | 0, priority: t[2] | 0 });
  }
  return out;
}

/**
 * ⭐ THE `workcaps` CHANNEL (M3-7) — WHAT EACH CREW MEMBER IS GOOD AT, AND WHAT SHE CANNOT DO AT ALL.
 * One row per LIVING crew member: `[cid, s0, s1, s2, s3, s4, s5, incapableMask]`, where the six skill
 * levels are in `WorkType` VALUE order (Repair, Construct, Craft, Deconstruct, Mine, Haul), each
 * `0..20` with 0 meaning UNTRAINED — never "unable".
 *
 * ⚠️ **WHY THIS IS NOT TWO MORE COLUMNS ON `work`.** That channel is SPARSE and off-only — it emits a
 * row per switched-ON pair and nothing else — and an incapable work type is by definition never on, so
 * it has no row, and a row that does not exist cannot carry a column. Under OD-H `work` is EMPTY at
 * boot, i.e. exactly when the player first looks at a crew member.
 *
 * ⚠️ **THIS CHANNEL IS DENSE WHERE `work` IS SPARSE, AND THAT IS THE POINT.** A crew member with
 * nothing switched on STILL HAS A ROW here. An empty `cells` array means "no living crew", never "no
 * data yet" — a surface that fell back to something else on `[]` would be inventing a crew.
 *
 * ⛔ **`incapableMask` IS NOT "priority 0".** Bit `1 << workType` set = this PERSON can never do it, a
 * fact about her; a missing `work` row is an ORDER from the player. Different provenance, different
 * lifetime, different rendering — RimWorld draws a disabled cell BLANK and an incapable one as **no
 * cell at all**. On the sparse `work` channel the two are indistinguishable by construction, which is
 * the whole reason this message exists. A reader that treats them as one has thrown away the fact.
 *
 * DEAD CREW ARE ABSENT host-side. NOT fog-gated: this is the player's own crew, not a place.
 * Snapshot-cached, so a reconnect replays the layer — load-bearing here, because nothing in the sim
 * writes a skill yet and the payload can be constant for a whole run.
 * @typedef {[number,number,number,number,number,number,number,number]} WorkCapsTuple
 * @typedef {{type:'workcaps', cells:WorkCapsTuple[]}} WorkCapsMsg
 */

/** Number of skill slots in a `workcaps` tuple — one per work type. Mirrors
 *  `WireFormat.WorkCapsSkillSlots` and `WorkPriority.WorkTypeCount`. */
export const WORKCAPS_SKILL_SLOTS = 6;

/**
 * Decode the `workcaps` channel. Mirrors WireFormat.WorkCaps:
 * {type:'workcaps',cells:[[cid,s0..s5,incapable],..]}. Tolerant: a malformed message → null, a
 * malformed row is dropped, never throws (the receive-path contract at the top of this file). ORDER IS
 * PRESERVED — the host emits citizen-store order and that order is the wire contract.
 *
 * ⚠️ A SHORT ROW IS DROPPED rather than zero-filled, and that is the opposite of `decodeWork`'s
 * keep-the-unknown-workType rule for a reason: there, the surviving pair `(cid, priority)` was still
 * TRUE. Here a missing element would have to be invented, and the two values worth inventing —
 * "untrained" and "capable of everything" — are both the reassuring answer. A row that claimed a crew
 * member had no incapabilities because the host sent seven elements instead of eight would hide
 * exactly the fact the channel exists to carry.
 * @param {{type:string, cells?:Array}|null} msg
 * @returns {{cid:number, skills:number[], incapableMask:number}[]|null}
 */
export function decodeWorkCaps(msg) {
  if (!msg || msg.type !== 'workcaps' || !Array.isArray(msg.cells)) return null;
  const width = WORKCAPS_SKILL_SLOTS + 2; // cid + six skills + the mask
  const out = [];
  for (const t of msg.cells) {
    if (!Array.isArray(t) || t.length < width) continue;
    const skills = [];
    for (let s = 0; s < WORKCAPS_SKILL_SLOTS; s++) skills.push(t[1 + s] | 0);
    out.push({ cid: t[0] | 0, skills, incapableMask: t[width - 1] | 0 });
  }
  return out;
}

/**
 * Is this crew member permanently unable to do `workType`? Reads the mask BIT — the sim's own
 * representation — rather than inferring anything from a `work` row's absence.
 * @param {{incapableMask:number}|null|undefined} row a decoded `workcaps` row
 * @param {number} workType
 * @returns {boolean}
 */
export function isIncapableOf(row, workType) {
  if (!row || typeof row.incapableMask !== 'number') return false;
  return (row.incapableMask & (1 << (workType | 0))) !== 0;
}

/** @typedef {FrameMsg|MetricsMsg|LinesMsg|StatusMsg|ChatMsg|CitizenMsg|MossMsg|LightMsg|DeviceMsg|LlmStatusMsg|RosterMsg|ChronMsg|RelationsMsg|DesignsMsg|TerminalsMsg|SystemsMsg|DecksMsg|RoomsMsg|DecorMsg|ZonesMsg|MarksMsg|ItemsMsg|DevicesMsg|BlockedMsg|WorkMsg|WorkCapsMsg} WireMsg */

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
