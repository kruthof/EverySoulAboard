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
 * pipeline hasn't produced it) → the client resolves a procedural silhouette fallback.
 * @typedef {Object} CitizenMsg
 * @property {'citizen'} type
 * @property {*} cid @property {string} name @property {string} [role] @property {string} [mood]
 * @property {string[]} [traits] @property {string} [portrait]
 */

/**
 * MOSS terminal channel (P2). `diag` carries compile diagnostics as [line, col, sev, msg] tuples,
 * 1-based. Other `ev`s (source/audit/rterror) fill in with the terminal IDE package.
 * @typedef {Object} MossMsg
 * @property {'moss'} type
 * @property {'source'|'diag'|'audit'|'rterror'} ev
 * @property {[number,number,number,string][]} [diags]
 * @property {string} [text]
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

/** @typedef {FrameMsg|MetricsMsg|LinesMsg|StatusMsg|ChatMsg|CitizenMsg|MossMsg|LightMsg|DeviceMsg} WireMsg */

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
