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

/** @typedef {FrameMsg|MetricsMsg|LinesMsg|StatusMsg|ChatMsg|CitizenMsg|MossMsg|LightMsg|DeviceMsg|LlmStatusMsg} WireMsg */

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
