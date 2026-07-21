// MOSS terminal IDE model — PURE. A reducer over the `moss` wire events (see wire/messages.js)
// plus the local editor actions, with no DOM and no mutation of its inputs. The DOM layer
// (terminal.js) renders the view-model this produces and turns user gestures (edit, install,
// refresh-audit) into the actions here + the wire ops (moss open/set/audit).
//
// The wire contract (WireFormat.Moss*, W3):
//   source  {tid, text, hash}                    the installed program source + its FNV-1a32 hash
//   diag    {tid, ok, diags:[[line,col,sev,msg]]} compile diagnostics (line/col 1-based; sev string)
//   audit   {tid, lines:[[tick,text]]}            the runtime audit ring
//   rterror {tid, text}                           a runtime error to surface as a banner
//
// State machine (`state` field): the editor draft moves through
//   viewing   — draft matches the installed source; nothing pending
//   dirty     — the draft has local edits not yet installed
//   compiling — an install (`set`) was sent; awaiting the diag reply
//   installed — the last compile succeeded (ok) and the draft became the installed source
//   error     — the last compile reported errors, OR a runtime error arrived
// A diag reply while compiling commits the draft to `installed` on success. Diagnostics are
// sort/merged (by line, col, severity, message; exact dups collapse). The audit is a bounded ring.

/** @typedef {{line:number, col:number, severity:'error'|'warning', message:string}} Diag */
/** @typedef {{tick:number, text:string}} AuditLine */
/**
 * @typedef {Object} TerminalState
 * @property {string|null} tid       the terminal this model is bound to (null = no terminal open)
 * @property {string} installed      the last known installed source
 * @property {number|null} hash      the installed source's FNV-1a32 hash (from the host)
 * @property {string} draft          the current editor contents
 * @property {'viewing'|'dirty'|'compiling'|'installed'|'error'} state
 * @property {Diag[]} diags          sort/merged compile diagnostics
 * @property {AuditLine[]} audit     bounded audit ring (oldest dropped)
 * @property {string|null} rterror   latest runtime-error banner text (null = none)
 * @property {boolean|null} ok       last compile result (null = never compiled)
 */

/** Default audit ring capacity — the host's audit is already bounded; we keep the tail. */
export const AUDIT_CAP = 200;

/** A fresh, terminal-less model. */
export function initTerminal() {
  return {
    tid: null, installed: '', hash: null, draft: '',
    state: 'viewing', diags: [], audit: [], rterror: null, ok: null,
  };
}

/** Open (or switch to) a terminal by id — a clean slate awaiting its `source`. */
export function openTerminal(tid) {
  return { ...initTerminal(), tid: tid == null ? null : String(tid) };
}

/** True when the model has an open terminal whose id matches this message's tid. Messages for a
 *  different/absent terminal are ignored by the reducers (unknown-tid safety). */
function matches(state, msg) {
  return !!state && state.tid != null && msg && String(msg.tid) === state.tid;
}

/**
 * Fold one decoded `moss` wire event into the model, returning a NEW state (never mutates inputs).
 * A message for a different tid — or any malformed event — is a no-op (the receive path never
 * throws). Unknown `ev` kinds are ignored forward-compatibly.
 * @param {TerminalState} state
 * @param {{ev?:string, tid?:*, [k:string]:*}} msg
 * @returns {TerminalState}
 */
export function reduceMoss(state, msg) {
  if (!state) state = initTerminal();
  if (!matches(state, msg) || typeof msg.ev !== 'string') return state;
  switch (msg.ev) {
    case 'source':   return applySource(state, msg);
    case 'diag':     return applyDiag(state, msg);
    case 'audit':    return applyAudit(state, msg);
    case 'rterror':  return applyRterror(state, msg);
    default:         return state;
  }
}

/** The installed program arrived: adopt it as installed + draft, back to a clean `viewing`. */
export function applySource(state, msg) {
  const text = str(msg.text);
  return {
    ...state,
    installed: text,
    hash: typeof msg.hash === 'number' ? msg.hash : null,
    draft: text,
    state: 'viewing',
    diags: [],
    rterror: null,
  };
}

/** A compile reply: store sort/merged diagnostics; success while compiling commits the draft. */
export function applyDiag(state, msg) {
  const diags = sortMergeDiags(normalizeDiags(msg.diags));
  const ok = msg.ok === true || (msg.ok == null && diags.every((d) => d.severity !== 'error'));
  let next = { ...state, diags, ok };
  if (ok) {
    // A successful install commits the compiled draft as the new installed source.
    if (state.state === 'compiling') { next.installed = state.draft; next.state = 'installed'; }
    else if (state.state !== 'dirty') next.state = 'viewing';
    // (a diag that arrives while the user has kept editing leaves them 'dirty')
  } else {
    next.state = 'error';
  }
  return next;
}

/** Append audit lines into the bounded ring (oldest dropped past the cap). */
export function applyAudit(state, msg, cap = AUDIT_CAP) {
  const incoming = Array.isArray(msg.lines)
    ? msg.lines.filter(Array.isArray).map(([tick, text]) => ({ tick: tick | 0, text: str(text) }))
    : [];
  if (!incoming.length) return state;
  const audit = state.audit.concat(incoming);
  return { ...state, audit: audit.length > cap ? audit.slice(audit.length - cap) : audit };
}

/** A runtime error: raise the banner and flip to `error` (the draft/diags are untouched). */
export function applyRterror(state, msg) {
  return { ...state, rterror: str(msg.text), state: 'error' };
}

// ---- local editor actions (driven by the DOM layer) ----

/** The user edited the textarea: draft ↔ installed decides viewing vs dirty. Editing always clears
 *  a stale compiling/error state back to dirty (or viewing if they reverted to the installed text). */
export function editDraft(state, text) {
  const draft = str(text);
  return { ...state, draft, state: draft === state.installed ? 'viewing' : 'dirty' };
}

/** The user pressed Install: mark compiling (the DOM sends `moss set {tid, draft}` alongside). */
export function beginCompile(state) {
  return { ...state, state: 'compiling', rterror: null };
}

// ---- diagnostics ----

/** Normalize wire diag tuples [line, col, sev, msg] → Diag objects; drop malformed rows. */
export function normalizeDiags(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 4) continue;
    out.push({
      line: Math.max(1, r[0] | 0),
      col: Math.max(1, r[1] | 0),
      severity: r[2] === 'error' ? 'error' : 'warning',
      message: str(r[3]),
    });
  }
  return out;
}

/** Sort by (line, col, severity: error<warning, message) and collapse exact duplicates. */
export function sortMergeDiags(diags) {
  const rank = (s) => (s === 'error' ? 0 : 1);
  const sorted = [...diags].sort((a, b) =>
    a.line - b.line || a.col - b.col || rank(a.severity) - rank(b.severity) ||
    (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
  const out = [];
  for (const d of sorted) {
    const p = out[out.length - 1];
    if (p && p.line === d.line && p.col === d.col && p.severity === d.severity && p.message === d.message) continue;
    out.push(d);
  }
  return out;
}

/**
 * Gutter-marker layout from 1-based (line, col). One marker per diagnostic: its pixel top from the
 * line and (optionally) left from the column, plus the severity to colour it. Pure geometry — the
 * DOM layer positions the dots absolutely from these numbers. 1-based coords map to 0-based offsets.
 * @param {Diag[]} diags
 * @param {{lineHeight:number, charWidth?:number, padTop?:number, padLeft?:number}} opts
 * @returns {{line:number, col:number, severity:string, top:number, left:number}[]}
 */
export function gutterMarkers(diags, opts) {
  const lh = opts.lineHeight, cw = opts.charWidth || 0;
  const pt = opts.padTop || 0, pl = opts.padLeft || 0;
  return (diags || []).map((d) => ({
    line: d.line,
    col: d.col,
    severity: d.severity,
    top: pt + Math.max(0, d.line - 1) * lh,
    left: pl + Math.max(0, d.col - 1) * cw,
  }));
}

/** The render-ready audit ring (most recent last), capped for the pane. */
export function auditView(state, limit = AUDIT_CAP) {
  const a = state.audit || [];
  return a.length > limit ? a.slice(a.length - limit) : a.slice();
}

/** Whether the Install button should be enabled: there are edits AND we're not mid-compile. */
export function canInstall(state) {
  return state.state === 'dirty' || (state.state === 'error' && state.draft !== state.installed);
}

function str(v) { return v == null ? '' : String(v); }
