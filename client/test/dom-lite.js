// A MINIMAL DOM for node tests. There is no jsdom in this repo (client/package.json carries only
// typescript + @types/node, and `./ci.sh` runs a bare `node --test`), so the DOM shells have always
// been exercised in the browser rather than in the test suite. That is fine for the SVG relations
// web, whose every decision is pure; it is not fine for the MOSS terminal, whose contract includes
// "the full takeover leaves no game chrome visible" and "a click selects, a double-click activates".
//
// So this is a deliberately small DOM: exactly the surface `src/ui/moss-screen.js` touches, and no
// more. It is NOT a browser — the live-pixel obligations (VS-M9 responsive floor, VS-M5 CRT skin,
// the takeover's computed styles) are proven in real Chrome by `client/tools/moss-shot.mjs`.

class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(...ns) { for (const n of ns) if (n) this.set.add(n); this._flush(); }
  remove(...ns) { for (const n of ns) this.set.delete(n); this._flush(); }
  contains(n) { return this.set.has(n); }
  toggle(n, force) {
    const want = force === undefined ? !this.set.has(n) : !!force;
    if (want) this.set.add(n); else this.set.delete(n);
    this._flush();
    return want;
  }
  _flush() { this.el._className = Array.from(this.set).join(' '); }
  _reset(str) {
    this.set = new Set(String(str || '').split(/\s+/).filter(Boolean));
  }
}

class Node {
  constructor(doc) {
    this.ownerDocument = doc;
    this.childNodes = [];
    this.parentNode = null;
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  /** ⚠️ ADDED AT M1-F (2026-07-29) so `panels.js` — the crew DOSSIER — can be mounted in node at
   *  all. `CitizenCard.render` does `head.appendChild(el('div','dsr-portrait')); head.firstChild
   *  .appendChild(portrait)`, and without this getter the whole card died on `Cannot read properties
   *  of undefined (reading 'appendChild')`. Same rule as `removeAttribute` below: if the harness
   *  cannot model what the guard needs to see, fix the harness (CLAUDE.md trap 4's corollary).
   *
   *  ⚠️ IT IS ALSO A FIDELITY FIX WITH REACH BEYOND ITS PACKAGE, recorded because a silent one is
   *  the thing this file's other comments were written about. `hud.js:731,733,770,772` each read
   *  `if (layer.firstChild) layer.replaceChildren();`. With no getter, `firstChild` was `undefined`
   *  on EVERY element, so all four clears were unreachable in node — always-falsy branches that a
   *  mutation could not have reddened. They can now run. Measured inert on this tree (the full node
   *  suite is green before and after), but "inert today" is a fact about a tree: a future guard that
   *  drives those paths will now see the real behaviour instead of a stub's accident. */
  get firstChild() { return this.childNodes[0] || null; }

  /**
   * ⚠️ ADDED AT M3-17 (2026-07-31) — WITHOUT IT THE HARNESS COULD NOT SEE THE OWNER'S DEFECT AT ALL.
   *
   * `moss-screen.js:_renderProgram` moved the persistent `programMount` into a freshly built parent
   * on every render, and in a real browser MOVING A NODE BLURS THE FOCUSED ELEMENT INSIDE IT. This
   * stub had no notion of connectedness, no blur, and an `appendChild` that did not even unlink the
   * node from its previous parent — so the node was simply in two `childNodes` arrays at once and
   * every focus assertion here would have passed on the BROKEN code. MEASURED in real Chrome over
   * CDP against the shipping screen (`client/tools/moss-preview.html?screen=program`):
   *
   *     textarea.focus(); textarea.setSelectionRange(2,5);  →  document.activeElement === textarea
   *     window.__moss.render()                              →  document.activeElement === BODY
   *     (and identically for a wire message: onSystems(...) → render → BLUR)
   *
   * and the two isolated legs that say WHICH operation does it — both blur, and neither un-blurs:
   *     detachedDiv.appendChild(mount)      (a MOVE out of the document) → blurred
   *     body.replaceChildren(sameOnlyChild) (remove + re-insert the SAME node) → blurred
   *
   * So the rule modelled below is Chrome's, not a convenience: ANY removal of a node from its
   * parent blurs a focused element inside it, whether or not it is re-inserted in the same task.
   * `CLAUDE.md` trap 4's corollary, which this file already records twice: if the harness cannot
   * model what the guard needs to see, fix the harness.
   */
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return !!(this.ownerDocument && n === this.ownerDocument.body);
  }
}

/**
 * Record the removal on the node itself. A test can then pin "this node was never detached" —
 * the STRUCTURAL half of the defect above, and strictly stronger than comparing `parentNode`
 * before and after: `parent.replaceChildren(sameNode)` puts the node back where it was, so the
 * parent is unchanged while the browser has still removed, re-inserted and BLURRED it.
 */
function countDetach(node) { node._detachCount = (node._detachCount | 0) + 1; }

/** Blur `node` and everything under it, the way removing a subtree does in a browser. */
function blurWithin(node) {
  const doc = node && node.ownerDocument;
  if (!doc || !doc.activeElement) return;
  let n = doc.activeElement;
  while (n) {
    if (n === node) { doc.activeElement.focused = false; doc.activeElement = null; return; }
    n = n.parentNode;
  }
}

class TextNode extends Node {
  constructor(doc, text) { super(doc); this.data = String(text); this.nodeType = 3; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}

class Element extends Node {
  constructor(doc, tag) {
    super(doc);
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this._className = '';
    this.classList = new ClassList(this);
    this.dataset = {};
    this.attributes = {};
    this.hidden = false;
    this.listeners = {};
    this.value = '';
    this.focused = false;
    this.style = {}; // just enough for absolutely-positioned markers (el.style.top = '18px')
  }
  get className() { return this._className; }
  set className(v) { this._className = String(v); this.classList._reset(v); }
  set textContent(v) {
    const old = this.childNodes;
    this.childNodes = [];
    for (const c of old) { c.parentNode = null; countDetach(c); blurWithin(c); }
    if (v != null && v !== '') this.appendChild(new TextNode(this.ownerDocument, v));
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  /** Insert `c`, MOVING it out of any previous parent (and blurring what was focused inside it —
   *  see the `isConnected` note above; a browser's `appendChild` of a connected node is a move). */
  appendChild(c) {
    if (c && c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i < 0) return c;
    this.childNodes.splice(i, 1);
    c.parentNode = null;
    countDetach(c);
    blurWithin(c);
    return c;
  }
  /** ParentNode.append — variadic, and it accepts BARE STRINGS as text, which `appendChild` does
   *  not. Added at M1-F for the same reason as `firstChild`: `panels.js` builds the dossier's
   *  section grid with `grid.append(needs, standing, …)`. Strings are wrapped rather than dropped,
   *  because a stub that silently swallowed them would make every `assert` on the card's text
   *  vacuous — the exact failure mode this file's other comments were written about. */
  append(...cs) {
    for (const c of cs) {
      this.appendChild(typeof c === 'string' || typeof c === 'number'
        ? new TextNode(this.ownerDocument, String(c)) : c);
    }
  }
  replaceChildren(...cs) {
    const old = this.childNodes;
    this.childNodes = [];
    // Every old child is REMOVED first — including one that is about to be re-inserted, which is
    // what `replaceChildren(sameNode)` does in Chrome (measured; it blurs).
    for (const c of old) { c.parentNode = null; countDetach(c); blurWithin(c); }
    for (const c of cs) this.appendChild(c);
  }
  /**
   * ⚠️ TOLERANT ON PURPOSE, AND THE SUITE CAUGHT ME. `remove()` must clear `parentNode` even when
   * the parent's `childNodes` no longer lists this node: `overview-model.test.js`'s `OvEl` models
   * `innerHTML = …` as `this.childNodes = []`, which leaves every former child pointing at a parent
   * that has forgotten it — and its BUG-B regression test then calls `pressed.remove()` and asserts
   * `parentNode === null` (with a non-vacuity message saying the mid-press rebuild is otherwise not
   * reproduced). Delegating to `removeChild` alone made that an early return and reddened two
   * overview tests. The delegation is kept for the blur/detach bookkeeping; the fallback is what
   * keeps the old total behaviour.
   */
  remove() {
    const p = this.parentNode;
    if (p && p.removeChild) p.removeChild(this);
    if (this.parentNode) { this.parentNode = null; countDetach(this); blurWithin(this); }
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  /**
   * ⚠️ ADDED BECAUSE ITS ABSENCE PRODUCED A FALSE RED IN A REVIEW, and this is a SHARED harness so
   * the next package would have met it too. The most realistic form of the "aria-pressed off" bug —
   * `if (on) setAttribute(…) else removeAttribute(…)` — could not be applied as a mutation at all:
   * it died on `TypeError: removeAttribute is not a function`, reddening 1 test while 31 others
   * never ran. That is `CLAUDE.md` trap 4 exactly: a mutation that leaves the module unloadable
   * proves nothing about the semantics it claims to pin, and a small plausible failure count is
   * precisely what a real semantic red looks like. A stub that cannot express the realistic mistake
   * cannot be used to rule it out.
   */
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener(t, fn) {
    const a = this.listeners[t];
    if (a) this.listeners[t] = a.filter((f) => f !== fn);
  }
  /**
   * ⚠️ A HIDDEN ELEMENT CANNOT TAKE FOCUS, and modelling that is the point. `focus()` used to
   * succeed unconditionally here, so `open()` calling `_focusPrompt()` BEFORE `applyTakeover` —
   * i.e. into a still-`hidden` `#moss-view` — would have looked identical to the working order.
   * MEASURED in Chrome: with MOSS closed (`#moss-view[hidden]`, `.moss` display:none),
   * `input.focus()` leaves `document.activeElement` on `<body>` and typing goes nowhere. That is
   * exactly the shape of the owner's "I cannot type anything", so the harness must be able to see
   * it. `hidden` is what `applyTakeover` flips; dom-lite has no computed style, so `hidden` on the
   * element or any ancestor is the whole test.
   */
  focus() {
    for (let n = this; n; n = n.parentNode) if (n.hidden) return;
    this.focused = true;
    if (this.ownerDocument) {
      if (this.ownerDocument.activeElement) this.ownerDocument.activeElement.focused = false;
      this.ownerDocument.activeElement = this;
    }
  }
  blur() {
    this.focused = false;
    if (this.ownerDocument && this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
  }
  /** Text-field selection, enough to assert a caret/selection survives a render. */
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  /** Depth-first descendants carrying `cls`. */
  byClass(cls) {
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 1) {
        if (n.classList.contains(cls)) out.push(n);
        for (const c of n.childNodes) walk(c);
      }
    };
    for (const c of this.childNodes) walk(c);
    return out;
  }
  /** First descendant carrying `cls`, or null. */
  oneClass(cls) { const a = this.byClass(cls); return a.length ? a[0] : null; }
}

class DocumentLite {
  constructor() {
    this.byId = new Map();
    this.body = new Element(this, 'body');
    this.activeElement = null;
  }
  createElement(tag) { return new Element(this, tag); }
  createTextNode(t) { return new TextNode(this, t); }
  getElementById(id) { return this.byId.get(id) || null; }
  /** Register an element under an id (index.html's ids are static, so tests place them by hand). */
  register(id, el) { this.byId.set(id, el); return el; }
}

/**
 * A window stand-in that records capture/bubble keydown listeners in registration order.
 *
 * ⚠️ `isCapture` IS NOT `!!useCapture`, AND THE DIFFERENCE WAS A LIVE HOLE. This stub used to file
 * listeners with a bare truthiness test — `(useCapture ? capture : bubble).push(fn)`. The DOM's
 * third argument has two spellings: the legacy boolean and the modern options object, and
 * `{ capture: false }` is an OBJECT, therefore TRUTHY, therefore filed as CAPTURE by that test —
 * while a real browser registers it in the BUBBLE phase. So the two spellings of one regression
 * behaved differently here:
 *
 *   MEASURED on `moss-screen.js:271` (`this.win.addEventListener('keydown', this._onKey, true)`):
 *     • drop the third argument entirely      ⇒ RED  (IX-M11 caught it)
 *     • rewrite it as `{ capture: false }`    ⇒ GREEN — the SAME regression, invisible
 *
 * That matters because MOSS's keydown handler must run in CAPTURE: `controls.js:225` binds
 * `keydown` on `window` with no third argument (bubble) AT BOOT, i.e. before MOSS ever opens, so a
 * bubble-phase MOSS handler runs SECOND and the game sees every keystroke while the terminal is up
 * — the exact regression IX-M11 exists to forbid, with the suite green.
 *
 * This is `CLAUDE.md`'s trap 4 ("record the argument at the seam — do not scan for it") biting the
 * RECORDING STUB rather than a text scan: recording is necessary and not sufficient, because the
 * recorder can still normalise the argument wrongly. The normalisation below is the one
 * `overview-model.test.js`'s window stub already uses; the two are now the same rule.
 * `client/test/moss-screen.test.js`'s "the MOSS key handler is registered in the CAPTURE phase"
 * asserts the phase BY NAME, so the guard no longer rests only on the indirect `gameSawIt` path.
 */
const isCapture = (opts) => opts === true || !!(opts && opts.capture === true);

export function makeWindow() {
  const capture = [];
  const bubble = [];
  // M3-4: the POD BAY polls. A FAKE clock, never a real one — a test that waited on wall time would
  // be slow and flaky, and a test that never advanced it could not tell a started timer from a
  // stopped one. `timers` records every live interval so a leak (a poll that outlives the screen) is
  // an assertable fact rather than a stray callback nobody sees.
  const timers = new Map();
  let nextTimer = 1;
  return {
    capture, bubble, timers,
    setInterval(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearInterval(id) { timers.delete(id); },
    /** Fire every live interval once — the test's hand on the clock. */
    tickTimers() { for (const t of [...timers.values()]) t.fn(); },
    addEventListener(t, fn, opts) {
      if (t !== 'keydown') return;
      (isCapture(opts) ? capture : bubble).push(fn);
    },
    removeEventListener(t, fn, opts) {
      if (t !== 'keydown') return;
      const a = isCapture(opts) ? capture : bubble;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
  };
}

/**
 * A keydown event object with the two flags the screen sets.
 *
 * `preventDefault` here RECORDS but cannot SIMULATE: a suppressed `Backspace` still leaves
 * `input.value` untouched in this stub, because nothing in dom-lite implements the browser's
 * default text-editing action. That gap let a real defect ship — the prompt could be typed into
 * but never corrected — so `editable()` below models the one default that matters, and the real
 * proof lives in `client/tools/moss-shot.mjs`, which drives trusted keys through Chrome over CDP.
 */
export function keyEvent(key, extra) {
  const e = {
    key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
    defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; },
    stopPropagation() { e.propagationStopped = true; },
    ...(extra || {}),
  };
  return e;
}

/**
 * Apply the browser's DEFAULT text-editing action for a keydown on an input, unless the handler
 * suppressed it. Only the keys a command prompt genuinely needs; enough to assert "the player can
 * fix a typo" in node rather than only in Chrome. Returns true when the value changed.
 * @param {{value:string}} input @param {{key:string, defaultPrevented:boolean}} e
 */
export function editable(input, e) {
  if (e.defaultPrevented) return false;
  const before = input.value;
  if (e.key === 'Backspace') input.value = before.slice(0, -1);
  else if (e.key === 'Delete') input.value = before;            // caret is at the end in this stub
  else if (typeof e.key === 'string' && e.key.length === 1) input.value = before + e.key;
  return input.value !== before;
}

/** Dispatch a keydown through capture listeners, then bubble listeners unless stopped. */
export function dispatchKey(win, e) {
  for (const fn of win.capture.slice()) fn(e);
  if (!e.propagationStopped) for (const fn of win.bubble.slice()) fn(e);
  return e;
}

/** Fire a DOM event on `el`, bubbling up parentNode with a shared `target`. */
export function fire(el, type, extra) {
  const e = {
    type, target: el, defaultPrevented: false, propagationStopped: false,
    preventDefault() { e.defaultPrevented = true; },
    stopPropagation() { e.propagationStopped = true; },
    ...(extra || {}),
  };
  let n = el;
  while (n) {
    for (const fn of ((n.listeners && n.listeners[type]) || []).slice()) {
      fn(e);
      if (e.propagationStopped) return e;
    }
    n = n.parentNode;
  }
  return e;
}

export { DocumentLite, Element, TextNode };
