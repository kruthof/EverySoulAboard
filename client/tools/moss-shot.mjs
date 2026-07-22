#!/usr/bin/env node
// MOSS terminal — the LIVE-PIXEL check (spec §6, `moss-screen` row: "a live-pixel check that the
// ledger reads correctly at 1024px and at full width", VS-M9).
//
// Node tests can pin the monospace grid and the takeover's hooks; they cannot prove that the
// phosphor ledger READS correctly, that the CRT skin stays legible, or that no game chrome is
// visibly showing through. So this drives headless Chrome over client/tools/moss-preview.html —
// the REAL screen, the REAL stylesheet, inside the REAL index.html chrome — screenshots each
// framing, and scrapes the page's own `[moss-check]` assertion (computed from getComputedStyle)
// out of Chrome's stderr. It EXITS NON-ZERO when any game chrome is visible, when the ledger is
// empty where it should not be, or when the page can scroll horizontally.
//
// It ALSO drives the command prompt with TRUSTED key events over CDP (`--keys`, on by default).
// That exists because a real defect shipped past every node test: the DOM swallowed `Backspace`,
// `Delete`, the arrows and `Tab`, so the prompt could be typed into but never corrected. No node
// harness can see that class — a stub `preventDefault` records the call but cannot suppress a
// default action that the stub never performs. Only a real browser with real key defaults can.
//
// It is NOT wired into ./ci.sh: it needs a browser and a static server, exactly like
// art/screenshot-test/slice-shot.mjs, and the gate must stay browser-free.
//
// Usage: node client/tools/moss-shot.mjs [--port 8342] [--out DIR] [--no-keys]
// Env:   CHROME=/path/to/Chrome

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));      // <wt>/client/tools
const CLIENT = resolve(HERE, '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d;
};
const PORT = +arg('port', '8342');
const OUT = resolve(arg('out', join(HERE, 'moss-frames')));

// Framings: the two VS-M9 rails plus every screen at the design width.
const SHOTS = [
  { name: 'ledger-2560.png', w: 2560, h: 1440, q: '' },
  { name: 'ledger-1440.png', w: 1440, h: 900, q: '' },
  { name: 'ledger-1024.png', w: 1024, h: 768, q: '' },
  { name: 'ledger-selected.png', w: 1440, h: 900, q: '?sel=1' },
  { name: 'detail.png', w: 1440, h: 900, q: '?screen=detail&sel=1' },
  { name: 'faultlog.png', w: 1440, h: 900, q: '?screen=faultlog' },
  { name: 'program.png', w: 1440, h: 900, q: '?screen=program' },
  { name: 'nolink.png', w: 1440, h: 900, q: '?nolink=1' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch { /* not up */ }
    await sleep(200);
  }
  return false;
}

function shot(url, out, w, h) {
  const userDir = mkdtempSync(join(tmpdir(), 'perilune-moss-'));
  try {
    return execFileSync(CHROME, [
      '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`,
      '--virtual-time-budget=4000', '--enable-logging=stderr', '--v=1',
      '--user-data-dir=' + userDir, '--screenshot=' + out, url,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 40000, killSignal: 'SIGKILL' }) || '';
  } catch (e) {
    return (e.stderr || '') + (e.stdout || '');
  } finally {
    rmSync(userDir, { recursive: true, force: true });
  }
}

function scrape(log) {
  const m = [...log.matchAll(/\[moss-check\]\s+([A-Za-z0-9+/=]+)/g)];
  if (!m.length) return null;
  try { return JSON.parse(Buffer.from(m[m.length - 1][1], 'base64').toString('utf8')); }
  catch { return null; }
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`Chrome not found at:\n  ${CHROME}\nSet CHROME=/path/to/Chrome and re-run.`);
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  const server = spawn('python3', [join(CLIENT, 'serve.py'), String(PORT)], { stdio: 'ignore' });
  const stop = () => { try { server.kill('SIGTERM'); } catch { /**/ } };
  server.unref();                       // the child handle must not hold the event loop open
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });

  if (!await waitHttp(`http://localhost:${PORT}/`)) {
    console.error(`client server never answered on :${PORT}`);
    process.exit(1);
  }

  let fail = 0;
  for (const s of SHOTS) {
    const url = `http://localhost:${PORT}/tools/moss-preview.html${s.q}`;
    const out = join(OUT, s.name);
    const log = shot(url, out, s.w, s.h);
    const r = scrape(log);
    if (!r) { console.log(`${s.name.padEnd(22)} — NO [moss-check] scraped (check the PNG)`); fail++; continue; }
    const problems = [];
    if (r.leaks.length) problems.push('GAME CHROME VISIBLE: ' + r.leaks.join(','));
    if (!r.mossVisible) problems.push('MOSS NOT VISIBLE');
    if (!r.noHorizontalScroll) problems.push(`H-SCROLL ${r.docScrollW}>${r.docClientW}`);
    if (!s.q.includes('nolink') && s.q.includes('screen=') === false && r.rows !== 8) {
      problems.push('LEDGER ROWS ' + r.rows + ' (expected 8)');
    }
    if (s.q.includes('nolink') && r.rows !== 0) problems.push('nolink still rendered rows');
    const verdict = problems.length ? 'FAIL — ' + problems.join(' · ') : 'ok';
    if (problems.length) fail++;
    console.log(
      `${s.name.padEnd(22)} ${String(r.width).padStart(5)}px  screen=${String(r.screen).padEnd(9)}` +
      ` rows=${String(r.rows).padStart(2)} font=${r.fontPx}px fault=${r.faultShown ? 'shown' : 'dropped'}` +
      `  ${verdict}`);
  }
  console.log(`\nframes → ${OUT}`);

  if (process.argv.indexOf('--no-keys') < 0) {
    console.log('\n=== trusted-key prompt check (CDP) ===');
    try {
      fail += await keyCheck(`http://localhost:${PORT}/tools/moss-preview.html`);
    } catch (e) {
      console.error('trusted-key check FAILED to run: ' + e.message);
      fail++;
    }
  }

  stop();
  if (fail) { console.error(`\n${fail} check(s) FAILED.`); process.exit(1); }
  console.log('\nlive-pixel check: PASS (no game chrome visible at any framing, no horizontal scroll)');
  process.exit(0);
}

// ---- trusted keys over CDP -------------------------------------------------------------------
// `Input.dispatchKeyEvent` produces events Chrome treats as user input, so `preventDefault` really
// suppresses the default action. A synthetic `new KeyboardEvent(...)` would NOT: it is untrusted,
// its default action never runs, and a screen that swallows Backspace looks identical to one that
// does not. That difference is the entire reason this check exists.

/** Minimal CDP client over the DevTools WebSocket (node 21+ has a global WebSocket). */
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP connect failed')); });
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  return {
    send: (method, params) => new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params: params || {} }));
    }),
    close: () => { try { ws.close(); } catch { /**/ } },
  };
}

const KEY_META = {
  Backspace: { keyCode: 8, code: 'Backspace' },
  Delete: { keyCode: 46, code: 'Delete' },
  ArrowLeft: { keyCode: 37, code: 'ArrowLeft' },
  ArrowRight: { keyCode: 39, code: 'ArrowRight' },
  Tab: { keyCode: 9, code: 'Tab' },
  Home: { keyCode: 36, code: 'Home' },
  End: { keyCode: 35, code: 'End' },
};

async function keyCheck(url) {
  const userDir = mkdtempSync(join(tmpdir(), 'perilune-keys-'));
  const dbg = PORT + 1000;
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + dbg, '--user-data-dir=' + userDir, '--window-size=1440,900', url,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  // The endpoint Chrome prints on stderr is BROWSER-scoped and has no `Page`/`Input` domain; the
  // page target's own socket does. `/json/list` is the supported way to find it.
  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) { try { chrome.kill('SIGKILL'); } catch { /**/ } throw new Error('no CDP page target appeared'); }

  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { /**/ } rmSync(userDir, { recursive: true, force: true }); };
  let problems = [];
  try {
    const c = await cdp(wsUrl);
    await c.send('Runtime.enable');
    await sleep(2000); // the page was opened by the launch argv; let its modules boot

    const evaluate = async (expression) => {
      const r = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return r.result && r.result.value;
    };
    // A printable key is ONE `keyDown` carrying `text` — Chrome derives the character from it.
    // Adding a separate `char` event on top inserts the character twice (which this harness did on
    // its first run, and which is why the expected values below are asserted, not eyeballed).
    const key = async (k, text) => {
      const meta = KEY_META[k] || {};
      const base = { key: k, code: meta.code || ('Key' + k.toUpperCase()),
        windowsVirtualKeyCode: meta.keyCode, nativeVirtualKeyCode: meta.keyCode };
      await c.send('Input.dispatchKeyEvent', text ? { type: 'keyDown', text, ...base }
        : { type: 'rawKeyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(40);
    };

    const ready = await evaluate('!!document.querySelector(".moss-input")');
    if (!ready) throw new Error('the MOSS prompt never rendered');
    await evaluate('document.querySelector(".moss-input").focus()');

    for (const ch of 'abcd') await key(ch, ch);
    const typed = await evaluate('({v: document.querySelector(".moss-input").value, m: window.__moss.model.prompt})');
    if (typed.v !== 'abcd' || typed.m !== 'abcd') {
      problems.push(`typing: input "${typed.v}" model "${typed.m}" (expected abcd/abcd)`);
    }

    await key('Backspace');
    await key('Backspace');
    const bk = await evaluate('({v: document.querySelector(".moss-input").value, m: window.__moss.model.prompt})');
    if (bk.v !== 'ab' || bk.m !== 'ab') {
      problems.push(`BACKSPACE IS DEAD: input "${bk.v}" model "${bk.m}" (expected ab/ab)`);
    }

    await key('ArrowLeft');
    const caret = await evaluate('document.querySelector(".moss-input").selectionStart');
    if (caret !== 1) problems.push(`ArrowLeft did not move the caret (selectionStart ${caret}, expected 1)`);

    await key('Delete');
    const del = await evaluate('document.querySelector(".moss-input").value');
    if (del !== 'a') problems.push(`Delete is dead: input "${del}" (expected "a")`);

    // Tab must not be swallowed — KEY_ROUTE leaves it unbound so focus traversal keeps working.
    // Record into a global from a CAPTURE listener, then read it AFTER dispatching. This check was
    // dead two independent ways before (gate finding), and both traps are easy to fall back into:
    //   1. `evaluate` passes awaitPromise:true, so `await evaluate('new Promise(...)')` blocks until
    //      the promise settles — which only happened via its own timeout, 1.5 s BEFORE the Tab key
    //      was dispatched. The verdict was fixed before the key was ever sent.
    //   2. The listener was registered in the BUBBLE phase, and the MOSS handler stopPropagation()s
    //      every non-Escape key, so it could never have fired (measured: bubble 0, capture 1).
    // Capture listeners on the same node still run after stopPropagation, and MOSS registers first,
    // so this reads the POST-handler defaultPrevented — which is the thing under test.
    await evaluate('window.__tabSeen = "no-event";'
      + ' window.addEventListener("keydown", function (e) {'
      + '   if (e.key === "Tab") window.__tabSeen = e.defaultPrevented; }, true); true');
    await key('Tab');
    const tabRes = await evaluate('window.__tabSeen');
    if (tabRes === 'no-event') problems.push('the Tab check is BLIND: no keydown reached the probe');
    else if (tabRes === true) problems.push('Tab is swallowed — focus traversal is dead inside MOSS');

    // and the screen still works: ESC clears the line, not the app
    await evaluate('window.__moss.escape()');
    const cleared = await evaluate('window.__moss.model.prompt');
    if (cleared !== '') problems.push(`ESC did not clear the prompt (got "${cleared}")`);

    c.close();
  } finally {
    cleanup();
  }

  if (problems.length) {
    for (const p of problems) console.log('  FAIL  ' + p);
    return 1;
  }
  console.log('  ok    type / Backspace / Delete / ArrowLeft / Tab / ESC all behave with trusted keys');
  return 0;
}

main().catch((e) => { console.error('[moss-shot] FAILED:', e.message); process.exit(1); });
