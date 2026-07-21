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

/** @typedef {FrameMsg|MetricsMsg|LinesMsg|StatusMsg|ChatMsg|CitizenMsg|MossMsg} WireMsg */

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
