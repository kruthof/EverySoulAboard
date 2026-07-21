// WebSocket session — the single connection to the host. Broadcasts are global (the host is
// single-session by design: deck/lens/speed/cursor/selection are shared across tabs), so this
// just decodes inbound lines to typed messages and marshals outbound commands. Auto-reconnects
// like Client.html. Command shapes mirror hosts/web/GameSession.cs WebCommand.Parse.

import { decode } from './messages.js';

// The structured client is served separately from the host (a static server / file://), so it
// cannot rely on location.host for the WebSocket. Resolution order:
//   ?ws=ws://host:port/ws   explicit full URL, else
//   ?port=NNNN              host port on the current hostname, else
//   default: ws://<hostname|localhost>:8330/ws   (the documented dev-loop port)
function resolveWsUrl() {
  const q = new URLSearchParams(location.search);
  if (q.get('ws')) return q.get('ws');
  const port = q.get('port') || '8330';
  const host = location.hostname || 'localhost';
  return `ws://${host}:${port}/ws`;
}

export class WireSession {
  /**
   * @param {(msg: import('./messages.js').WireMsg) => void} onMessage
   * @param {(connected: boolean) => void} [onConnChange]
   */
  constructor(onMessage, onConnChange) {
    this._onMessage = onMessage;
    this._onConnChange = onConnChange || (() => {});
    this._ws = null;
    this._url = resolveWsUrl();
  }

  connect() {
    this._ws = new WebSocket(this._url);
    this._ws.onopen = () => this._onConnChange(true);
    this._ws.onclose = () => { this._onConnChange(false); setTimeout(() => this.connect(), 900); };
    this._ws.onmessage = (e) => { const m = decode(e.data); if (m) this._onMessage(m); };
  }

  /** Send a command object, e.g. {cmd:'cursor',x,y}, {cmd:'lens',name}, {cmd:'speed',delta}. */
  send(obj) {
    if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify(obj));
  }
}

// --- command constructors (the full protocol GameSession understands) ---
export const Cmd = {
  cursor: (x, y) => ({ cmd: 'cursor', x, y }),
  click: (x, y) => ({ cmd: 'click', x, y }),
  move: () => ({ cmd: 'move' }),
  deck: (dz) => ({ cmd: 'deck', dz }),
  lens: (name) => ({ cmd: 'lens', name }),
  speed: (delta) => ({ cmd: 'speed', delta }),
  pause: () => ({ cmd: 'pause' }),
};
