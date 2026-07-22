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
// It is NOT wired into ./ci.sh: it needs a browser and a static server, exactly like
// art/screenshot-test/slice-shot.mjs, and the gate must stay browser-free.
//
// Usage: node client/tools/moss-shot.mjs [--port 8342] [--out DIR]
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
  stop();
  if (fail) { console.error(`\n${fail} framing(s) FAILED the live-pixel check.`); process.exit(1); }
  console.log('live-pixel check: PASS (no game chrome visible at any framing, no horizontal scroll)');
  process.exit(0);
}

main().catch((e) => { console.error('[moss-shot] FAILED:', e.message); process.exit(1); });
