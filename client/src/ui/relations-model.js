// RELATIONS view-model — PURE. Every derivation the RELATIONS web needs beyond a straight DOM/SVG
// write lives here, node-tested, with no DOM and no wire access: the deterministic ring layout, the
// mutual-tier classifier from two DIRECTED opinions, the directed→undirected edge dedup + draw gate,
// the focused-edge tag selection, and the two directed readout sections (regard both ways).
//
// Invariants honored: nothing here fabricates data the wire doesn't carry; everything is
// deterministic; no locale APIs. The wire ships DIRECTED edges [from,to,opinion,tier,note,secret];
// MUTUAL regard does not exist sim-side, so it is derived here from the two directions.

/** Numeric guard: a finite number, else 0 (a missing opinion direction counts as neutral). */
function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

/**
 * The directed edge list carried by a `relations` wire message, or `[]` for a missing/malformed one.
 * Every consumer of the cached message goes through this — the RELATIONS surface and the DOSSIER
 * card's `enrichCitizen` both used to keep their own private copy of the same three-way guard.
 * @param {*} msg the cached `relations` message (or null before the first one arrives)
 * @returns {Array} the raw directed edge tuples/objects, never null
 */
export function edgesOf(msg) {
  return msg && Array.isArray(msg.edges) ? msg.edges : [];
}

/** Stable id comparator (cids are numbers, but compare structurally so it never NaNs). */
function cmpId(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

/**
 * Normalize one wire edge tuple [from,to,opinion,tier,note,secret] to an object. Passes an
 * already-object edge through unchanged.
 * @param {*} t
 * @returns {{from:*,to:*,opinion:number,tier:number,note:string,secret:boolean}}
 */
export function edgeObj(t) {
  if (Array.isArray(t)) {
    return { from: t[0], to: t[1], opinion: num(t[2]), tier: t[3] | 0, note: t[4] || '', secret: !!t[5] };
  }
  return t || { from: null, to: null, opinion: 0, tier: 0, note: '', secret: false };
}

// ---- ring layout (deterministic; node 0 at the top, clockwise) ----

/**
 * Positions for n nodes evenly spaced on an ellipse. Node 0 sits at the top (angle −90°) and the
 * ring proceeds clockwise (roster order). Deterministic — a pure function of n and the ellipse.
 * @param {number} n
 * @param {{cx?:number,cy?:number,rx?:number,ry?:number}} [opts]
 * @returns {{x:number,y:number,angle:number}[]}
 */
export function ringLayout(n, opts = {}) {
  const cx = num(opts.cx), cy = num(opts.cy);
  const rx = opts.rx == null ? 1 : num(opts.rx), ry = opts.ry == null ? 1 : num(opts.ry);
  const out = [];
  const count = typeof n === 'number' && isFinite(n) && n > 0 ? Math.floor(n) : 0;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), angle: a });
  }
  return out;
}

// ---- mutual-tier classifier (documented rails) ----
// Averages the two DIRECTED opinions (a missing direction counts as 0) and bands the result:
//   close   avg >= 45     warm    avg >= 15     hostile avg <= -15     neutral otherwise
// Rails chosen so the authored slice reads well: the Amara hub lands CLOSE (Amara↔Nadia 65,
// Amara↔Priya avg 51), the reactor feud lands HOSTILE (Dmitri↔Salif -40), the rest WARM.
export const TIER_CLOSE = 45;
export const TIER_WARM = 15;
export const TIER_HOSTILE = -15;

/**
 * Classify the MUTUAL tier from two directed opinions. Either may be undefined/null (a
 * one-directional edge) → that side counts as 0.
 * @param {number} [aToB] @param {number} [bToA]
 * @returns {'close'|'warm'|'neutral'|'hostile'}
 */
export function mutualTier(aToB, bToA) {
  const avg = (num(aToB) + num(bToA)) / 2;
  if (avg >= TIER_CLOSE) return 'close';
  if (avg >= TIER_WARM) return 'warm';
  if (avg <= TIER_HOSTILE) return 'hostile';
  return 'neutral';
}

/** The tier word (for a tag fallback when a pair has no authored note). */
export function tierWord(t) {
  return t === 'close' || t === 'warm' || t === 'hostile' ? t : 'neutral';
}

// ---- directed → undirected dedup + draw gate ----
// A pair draws a line when EITHER direction has a note OR |opinion| >= DRAW_MIN; pure-neutral
// strangers stay invisible (8 crew = 28 pairs — don't render noise). Focused mode overrides the
// gate: ALL of the focused crew's edges highlight, even weak ones.
export const DRAW_MIN = 10;

/**
 * Collapse the directed edge list to one line per unordered pair (keyed a<b by cid). Each line
 * carries both directed opinions/notes, the derived mutual tier, a secret flag (OR of the two
 * directions), and a `draw` gate (note or |opinion|>=DRAW_MIN either way).
 * @param {Array} edges  raw wire tuples or edge objects
 * @returns {{a:*,b:*,aToB:(number|undefined),bToA:(number|undefined),tier:string,secret:boolean,noteAB:string,noteBA:string,draw:boolean}[]}
 */
export function drawnEdges(edges) {
  const dir = new Map(); // "from|to" → edge object
  const src = Array.isArray(edges) ? edges : [];
  for (const raw of src) {
    const e = edgeObj(raw);
    if (e.from == null || e.to == null || e.from === e.to) continue;
    dir.set(e.from + '|' + e.to, e);
  }
  const seen = new Set();
  const lines = [];
  for (const raw of src) {
    const e = edgeObj(raw);
    if (e.from == null || e.to == null || e.from === e.to) continue;
    const forward = e.from < e.to;
    const a = forward ? e.from : e.to;
    const b = forward ? e.to : e.from;
    const key = a + '|' + b;
    if (seen.has(key)) continue;
    seen.add(key);
    const ab = dir.get(a + '|' + b);
    const ba = dir.get(b + '|' + a);
    const aToB = ab ? ab.opinion : undefined;
    const bToA = ba ? ba.opinion : undefined;
    const noteAB = ab ? ab.note : '';
    const noteBA = ba ? ba.note : '';
    const secret = !!((ab && ab.secret) || (ba && ba.secret));
    const draw = !!(noteAB || noteBA || Math.abs(num(aToB)) >= DRAW_MIN || Math.abs(num(bToA)) >= DRAW_MIN);
    lines.push({ a, b, aToB, bToA, tier: mutualTier(aToB, bToA), secret, noteAB, noteBA, draw });
  }
  return lines;
}

/** The deduped lines touching a focused cid (both endpoints considered). */
export function focusedLines(lines, cid) {
  return (Array.isArray(lines) ? lines : []).filter((l) => l.a === cid || l.b === cid);
}

/**
 * The tag label for a focused line: prefer the focused crew's OUTGOING note toward the other, then
 * the incoming note, else the mutual-tier word. Always uppercased ('' only when the line is
 * degenerate). Emergent (note-less) edges therefore fall back to the tier word, never a hole.
 * @param {{a:*,b:*,tier:string,noteAB:string,noteBA:string}} line @param {*} cid
 * @returns {string}
 */
export function focusTag(line, cid) {
  if (!line) return '';
  let outNote = '', inNote = '';
  if (cid === line.a) { outNote = line.noteAB; inNote = line.noteBA; }
  else if (cid === line.b) { outNote = line.noteBA; inNote = line.noteAB; }
  const note = outNote || inNote;
  return (note || tierWord(line.tier)).toUpperCase();
}

// ---- readout: the two directed regard sections ----

/**
 * The focused crew's two directed regard lists from the raw directed edges:
 *   outgoing — their regard for others (from === cid): rows "→ OTHER  +N"
 *   incoming — how others see them   (to   === cid): rows "OTHER →  +N"
 * Each row {cid, opinion, note}. Sorted by |opinion| desc, then cid asc (stable, deterministic).
 * @param {Array} edges @param {*} cid
 * @returns {{outgoing:{cid:*,opinion:number,note:string}[], incoming:{cid:*,opinion:number,note:string}[]}}
 */
export function regardRows(edges, cid) {
  const outgoing = [], incoming = [];
  for (const raw of (Array.isArray(edges) ? edges : [])) {
    const e = edgeObj(raw);
    if (e.from == null || e.to == null || e.from === e.to) continue;
    if (e.from === cid) outgoing.push({ cid: e.to, opinion: num(e.opinion), note: e.note || '' });
    else if (e.to === cid) incoming.push({ cid: e.from, opinion: num(e.opinion), note: e.note || '' });
  }
  const bySort = (x, y) => (Math.abs(y.opinion) - Math.abs(x.opinion)) || cmpId(x.cid, y.cid);
  outgoing.sort(bySort);
  incoming.sort(bySort);
  return { outgoing, incoming };
}

/** A signed value string for a regard row: "+40" / "-40" / "0". */
export function signed(v) {
  const n = num(v);
  return (n > 0 ? '+' : '') + n;
}
