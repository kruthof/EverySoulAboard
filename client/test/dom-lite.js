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
    this.childNodes = [];
    if (v != null && v !== '') this.appendChild(new TextNode(this.ownerDocument, v));
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
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
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    for (const c of cs) this.appendChild(c);
  }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.childNodes.indexOf(this);
    if (i >= 0) this.parentNode.childNodes.splice(i, 1);
    this.parentNode = null;
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
  focus() { this.focused = true; if (this.ownerDocument) this.ownerDocument.activeElement = this; }
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
  return {
    capture, bubble,
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
