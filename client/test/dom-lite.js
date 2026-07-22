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
  }
  get className() { return this._className; }
  set className(v) { this._className = String(v); this.classList._reset(v); }
  set textContent(v) {
    this.childNodes = [];
    if (v != null && v !== '') this.appendChild(new TextNode(this.ownerDocument, v));
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
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

/** A window stand-in that records capture/bubble keydown listeners in registration order. */
export function makeWindow() {
  const capture = [];
  const bubble = [];
  return {
    capture, bubble,
    addEventListener(t, fn, useCapture) {
      if (t !== 'keydown') return;
      (useCapture ? capture : bubble).push(fn);
    },
    removeEventListener(t, fn, useCapture) {
      if (t !== 'keydown') return;
      const a = useCapture ? capture : bubble;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
  };
}

/** A keydown event object with the two flags the screen sets. */
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
