// Shared floating-panel chrome — the base class + the tiny DOM helper both the panel framework
// (panels.js) and the MOSS terminal drawer (terminal.js) build on. Kept in its own module so the
// two can share it without a circular import (panels.js ⇄ terminal.js). DOM-only; browser-only.
//
// P2.1: panels are draggable by their title bar (pointer events, IX-60..65). Drag starts only
// past a 4px Manhattan threshold (below it a press is just a focus click); the position is
// clamped so the bar stays reachable; dragged positions stick per panel key for the session
// (module Map — deliberately NOT localStorage: stored coordinates go stale across layouts).

let zTop = 40; // rising z-index handed out on focus (panels float above the .app chrome)

/** Session-only remembered positions, keyed by panel key ('chat:<sid>', 'cit:<cid>', 'terminal'). */
const savedPos = new Map();

/** Clamp a prospective panel position: the bar stays fully reachable vertically, and at least
 *  64px of it stays on-screen horizontally (deliberate mostly-tucked-away parking is allowed). */
function clampPos(panelEl, left, top) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const bar = panelEl.querySelector('.panel-bar');
  const barH = (bar && bar.offsetHeight) || 32;
  const w = panelEl.offsetWidth || 280;
  return {
    left: Math.max(64 - w, Math.min(vw - 64, left)),
    top: Math.max(0, Math.min(vh - barH, top)),
  };
}

// Re-clamp every dragged-open panel when the window shrinks (IX-63). One module-level listener.
let resizeBound = false;
function bindResize() {
  if (resizeBound || typeof window === 'undefined') return;
  resizeBound = true;
  window.addEventListener('resize', () => {
    document.querySelectorAll('.panel').forEach((p) => {
      if (!p.style.left && !p.style.top) return; // CSS-default position: nothing to clamp
      const c = clampPos(p, parseFloat(p.style.left) || 0, parseFloat(p.style.top) || 0);
      p.style.left = c.left + 'px'; p.style.top = c.top + 'px';
    });
  });
}

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
    // A press on × can never start a drag and always closes (IX-62).
    x.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.appendChild(this.titleEl);
    bar.appendChild(x);
    this.body = el('div', 'panel-body');
    this.el.appendChild(bar);
    this.el.appendChild(this.body);
    this._posKey = null;
    this._installDrag(bar);
  }

  focus() { this.el.style.zIndex = String(++zTop); }
  setTitle(t) { this.titleEl.textContent = t; }

  /** Bind this panel to a persistence key; reapplies the session's last dragged position
   *  (re-clamped) when one is stored. Called by the panel manager after mounting. */
  setPosKey(key) {
    this._posKey = key;
    const p = savedPos.get(key);
    if (p) {
      this.el.style.right = 'auto'; this.el.style.bottom = 'auto';
      const c = clampPos(this.el, p.left, p.top);
      this.el.style.left = c.left + 'px'; this.el.style.top = c.top + 'px';
    }
  }

  /** Title-bar drag (IX-60/61): pointer capture, 4px threshold, inline left/top override the
   *  CSS-class default, clamped to the viewport. Dragging never sends wire traffic. */
  _installDrag(bar) {
    let start = null; // {px,py,left,top,id,dragging}
    bar.addEventListener('pointerdown', (e) => {
      if (typeof e.button === 'number' && e.button !== 0) return;
      this.focus();
      const r = this.el.getBoundingClientRect();
      start = { px: e.clientX, py: e.clientY, left: r.left, top: r.top, id: e.pointerId, dragging: false };
      try { bar.setPointerCapture(e.pointerId); } catch { /* older engines */ }
    });
    bar.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.px, dy = e.clientY - start.py;
      if (!start.dragging) {
        if (Math.abs(dx) + Math.abs(dy) <= 4) return; // below the canvas-pan threshold: a click
        start.dragging = true;
        // Inline position must beat the CSS default (which may anchor via right/bottom).
        this.el.style.right = 'auto'; this.el.style.bottom = 'auto';
      }
      const c = clampPos(this.el, start.left + dx, start.top + dy);
      this.el.style.left = c.left + 'px'; this.el.style.top = c.top + 'px';
    });
    const end = () => {
      if (!start) return;
      if (start.dragging && this._posKey) {
        savedPos.set(this._posKey, {
          left: parseFloat(this.el.style.left) || 0,
          top: parseFloat(this.el.style.top) || 0,
        });
      }
      start = null;
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    bindResize();
  }
}
