#!/usr/bin/env node
// Parity harness — screenshots BOTH render backends at pinned camera/zoom and diffs them.
//
// It boots the sim host (hosts/web) and a static client server (serve.py), then drives headless
// Chrome (the run.py stage_shot pattern: `chrome --headless --screenshot`) against a frozen scene:
//   ?exec=canvas2d|webgl2  select the backend
//   ?ws=…                  point the client at this run's host
//   ?cx=&cy=&zoom=         pin the camera (same framing for both backends)
//   ?t=0                   freeze the reticle pulse → deterministic, byte-stable frames
// Two zooms × two executors = four PNGs; then client/tools/imgdiff.py reports the channel-tolerance
// diff per zoom (canvas2d as the reference). Parity is NOT pixel-perfect (GL mipmaps + premultiplied
// rounding + AA differ) — see client/README.md for the tolerance rationale.
//
// Usage: node client/tools/shot.mjs [--out DIR] [--host-port N] [--client-port N]
//                                   [--cx N --cy N] [--zoom "36,90"] [--keep]
// Env:   CHROME=/path/to/Chrome   DOTNET=~/.dotnet/dotnet   (both have sensible macOS defaults)

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));      // <wt>/client/tools
const REPO = resolve(HERE, '..', '..');                    // <wt>
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DOTNET = process.env.DOTNET || join(process.env.HOME, '.dotnet', 'dotnet');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const OUT = resolve(arg('out', join(REPO, 'client', 'tools', '.shots')));
const HOST_PORT = +arg('host-port', '8332');
const CLIENT_PORT = +arg('client-port', '8333');
const CX = arg('cx', '28');
const CY = arg('cy', '9');
const ZOOMS = arg('zoom', '36,90').split(',').map((z) => z.trim());
const KEEP = process.argv.includes('--keep');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: 'GET' });
      if (r.ok || r.status === 404) return true; // 404 still means the server answered
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

/** Screenshot one URL to `out`, returning the backend Chrome's console reported (if captured). */
function shot(url, out) {
  const userDir = mkdtempSync(join(tmpdir(), 'perilune-chrome-'));
  try {
    // NOTE: the client holds a live WebSocket, which keeps headless Chrome's virtual-time budget
    // from ever completing — so Chrome writes the PNG at the budget deadline but then LINGERS. We
    // hard-cap the invocation with a `timeout` (SIGKILL); the screenshot is already on disk by
    // then. execFileSync throws on the kill, which we swallow below.
    const res = execFileSync(CHROME, [
      '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,1000',
      '--enable-unsafe-swiftshader',            // software WebGL2 when there's no GPU
      '--virtual-time-budget=6000',             // let the WS connect, sprites decode, frames draw
      '--enable-logging=stderr', '--v=1',
      '--user-data-dir=' + userDir,
      '--screenshot=' + out, url,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, killSignal: 'SIGKILL' });
    return res || '';
  } catch (e) {
    // Chrome exits non-zero on benign GPU warnings AND on our SIGKILL cap; either way the PNG is
    // written. Surface whatever it logged so the caller can grep the active backend.
    return (e.stderr || '') + (e.stdout || '');
  } finally {
    rmSync(userDir, { recursive: true, force: true });
  }
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`Chrome not found at:\n  ${CHROME}\nSet CHROME=/path/to/Chrome and re-run.`);
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });

  console.log(`[shot] host  : ${DOTNET} run --project hosts/web -- --port ${HOST_PORT}`);
  const host = spawn(DOTNET, ['run', '--project', join(REPO, 'hosts', 'web'), '--', '--port', String(HOST_PORT)],
    { stdio: 'ignore', cwd: REPO });
  console.log(`[shot] client: python3 client/serve.py ${CLIENT_PORT}`);
  const client = spawn('python3', [join(REPO, 'client', 'serve.py'), String(CLIENT_PORT)],
    { stdio: 'ignore', cwd: REPO });

  const cleanup = () => { for (const p of [host, client]) { try { p.kill('SIGTERM'); } catch { /**/ } } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  try {
    console.log('[shot] waiting for host + client to come up…');
    const hostUp = await waitHttp(`http://localhost:${HOST_PORT}/`);
    const clientUp = await waitHttp(`http://localhost:${CLIENT_PORT}/`);
    if (!hostUp) throw new Error(`sim host never answered on :${HOST_PORT}`);
    if (!clientUp) throw new Error(`client server never answered on :${CLIENT_PORT}`);
    await sleep(1500); // a beat for the first sim frames to broadcast

    const pngs = {};
    for (const exec of ['canvas2d', 'webgl2']) {
      for (const zoom of ZOOMS) {
        const url = `http://localhost:${CLIENT_PORT}/?ws=ws://localhost:${HOST_PORT}/ws`
          + `&exec=${exec}&cx=${CX}&cy=${CY}&zoom=${zoom}&t=0`;
        const out = join(OUT, `${exec}_z${zoom}.png`);
        console.log(`[shot] ${exec} @ zoom ${zoom} → ${out}`);
        const log = shot(url, out);
        const m = log.match(/\[perilune\] backend=(\w+)[^\n]*/);
        if (m) console.log(`        active backend: ${m[0].replace(/\s+/g, ' ').trim()}`);
        else console.log('        (backend log line not captured — see PNG to confirm)');
        pngs[`${exec}_${zoom}`] = out;
      }
    }

    console.log('\n[shot] === parity diff (canvas2d = reference) ===');
    const imgdiff = join(REPO, 'client', 'tools', 'imgdiff.py');
    for (const zoom of ZOOMS) {
      const a = pngs[`canvas2d_${zoom}`], b = pngs[`webgl2_${zoom}`];
      console.log(`\n--- zoom ${zoom} ---`);
      try {
        const out = execFileSync('python3', [imgdiff, a, b], { encoding: 'utf8' });
        process.stdout.write(out);
      } catch (e) {
        process.stdout.write((e.stdout || '') + (e.stderr || ''));
      }
    }
    console.log(`\n[shot] PNGs in ${OUT}`);
  } finally {
    cleanup();
    if (!KEEP) { /* PNGs are kept by default for inspection; --keep is a no-op reserved flag */ }
  }
}

main().catch((e) => { console.error('[shot] FAILED:', e.message); process.exit(1); });
