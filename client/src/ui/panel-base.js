// Shared floating-panel chrome — the base class + the tiny DOM helper both the panel framework
// (panels.js) and the MOSS terminal drawer (terminal.js) build on. Kept in its own module so the
// two can share it without a circular import (panels.js ⇄ terminal.js). DOM-only; browser-only.

let zTop = 40; // rising z-index handed out on focus (panels float above the .app chrome)

/** Create an element with an optional class + text. */
export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** A floating panel: a titled bar with a close button over a body. Subclasses fill the body. */
export class Panel {
  /** @param {string} title @param {string} cls @param {() => void} onClose */
  constructor(title, cls, onClose) {
    this.el = el('div', 'panel ' + cls);
    const bar = el('div', 'panel-bar');
    this.titleEl = el('span', 'panel-title', title);
    const x = el('button', 'panel-x', '×');
    x.title = 'Close';
    x.addEventListener('click', (e) => { e.stopPropagation(); onClose(); });
    bar.appendChild(this.titleEl);
    bar.appendChild(x);
    this.body = el('div', 'panel-body');
    this.el.appendChild(bar);
    this.el.appendChild(this.body);
  }

  focus() { this.el.style.zIndex = String(++zTop); }
  setTitle(t) { this.titleEl.textContent = t; }
}
