#!/usr/bin/env node
// WS-ART X1 — the REPEATABLE slice-frame protocol. Boots the AUTHORED 8-crew slice host, drives
// it to a fixed view with LIGHTING VARIETY (a lit region beside a dead/dark region), freezes
// animation, and screenshots the WebGL2 backend at two zooms → candidate.png + candidate_far.png.
// Then scrapes window.__renderStats off the headless-Chrome console into renderstats.json and runs
// the advisory gates (art/spritegen/metrics.py) + the A/B sheet builder (sheet.py).
//
// ── THE LIGHTING RECIPE (why it is what it is) ──────────────────────────────────────────────
// The original brief asked to "force a dead/brownout region via a MOSS or door/vent command." An
// investigation of the sim proved that is IMPOSSIBLE: the slice is ONE ship-wide power network
// (AuthoredShips.AddConduits lays a tray under every tile), no ISimCommand or MOSS verb sets a
// Light's Powered / cuts a conduit / reduces generation (Commands.cs mutates only IsOpen/Rate;
// DeviceAdapters bind no Light/Conduit/Battery), and 35 kWh of battery makes a demand-driven
// brownout un-reachable in a screenshot timeframe — and it would be shipwide, not one wing.
//
// So the recipe uses the DETERMINISTIC BOOT STATE instead, which is strictly more repeatable (no
// command, no timing): the four crew CABINS on deck 1 (x42-60, y1-4) have NO Light device, so the
// LightMapper projects them as Dead(1) → the client paints a near-black overlay (palette LIGHT[1]);
// the quarters HALL one row south has light_quarters (51,6,1) → Powered(4) → bright. One deck-switch
// command puts both in frame. That IS a scripted wire command driving the lighting variety — just a
// `deck` command, since no power command exists. Sealed bridge/observatory/aft add dark fog (hull).
//
// ── REPEATABILITY / DRIFT CAVEAT (inherited from C2) ─────────────────────────────────────────
// The sim keeps ticking while the host is up, so two runs are NOT byte-identical: crew wander, the
// HUD clock advances, needs drift. `?t=0` freezes the RETICLE/animation (deterministic overlay),
// and the map/lighting/cabins are boot-static, but pawn POSITIONS differ by a few tiles between
// runs. Treat frames as parity-comparable (imgdiff ~>=0.9), never hash-identical. See PROTOCOL.md.
//
// Usage: node art/screenshot-test/slice-shot.mjs [--host-port 8341] [--client-port 8342]
//                                                [--out DIR] [--deck 1] [--settle-ms 2500]
// Env:   CHROME=/path/to/Chrome   DOTNET=~/.dotnet/dotnet

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));          // <wt>/art/screenshot-test
const REPO = resolve(HERE, '..', '..');                        // <wt>
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DOTNET = process.env.DOTNET || join(process.env.HOME, '.dotnet', 'dotnet');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const OUT = resolve(arg('out', HERE));
const HOST_PORT = +arg('host-port', '8341');
const CLIENT_PORT = +arg('client-port', '8342');
const DECK = +arg('deck', '1');               // deck 1 holds the lit hall + dead cabins
const SETTLE = +arg('settle-ms', '2500');

// Two framings on deck 1 (both include lit + dead tiles):
//   near : the quarters — lit hall (y6) directly under the four Dead cabins (y1-4)
//   far  : the whole deck as an establishing shot (lit spine + dead cabins + fogged wings)
const SHOTS = [
  { name: 'candidate.png',     cx: 51, cy: 4, zoom: 72 },
  { name: 'candidate_far.png', cx: 34, cy: 8, zoom: 32 },
];
const WINDOW = '2560,1440';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: 'GET' });
      if (r.ok || r.status === 404) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

/** Switch the global session to `deck` by sending `dz` steps over the wire (deck state is
 * server-side + global, so this reframes the screenshot browser too). Node 21+ has global WebSocket. */
async function switchDeck(hostPort, deck) {
  if (deck === 0) return true;
  return await new Promise((res) => {
    let done = false;
    const ws = new WebSocket(`ws://localhost:${hostPort}/ws`);
    const finish = (ok) => { if (!done) { done = true; try { ws.close(); } catch { /**/ } res(ok); } };
    ws.onopen = () => {
      for (let i = 0; i < Math.abs(deck); i++) ws.send(JSON.stringify({ cmd: 'deck', dz: Math.sign(deck) }));
      setTimeout(() => finish(true), 600);   // let the host apply + start broadcasting the new deck
    };
    ws.onerror = () => finish(false);
    setTimeout(() => finish(false), 5000);
  });
}

/** Screenshot one URL; return Chrome's stderr (we scrape the [perilune-stats] line from it). */
function shot(url, out) {
  const userDir = mkdtempSync(join(tmpdir(), 'perilune-shot-'));
  try {
    const res = execFileSync(CHROME, [
      '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${WINDOW}`,
      '--enable-unsafe-swiftshader',            // software WebGL2 when there's no GPU
      '--virtual-time-budget=7000',
      '--enable-logging=stderr', '--v=1',
      '--user-data-dir=' + userDir,
      '--screenshot=' + out, url,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 40000, killSignal: 'SIGKILL' });
    return res || '';
  } catch (e) {
    return (e.stderr || '') + (e.stdout || '');
  } finally {
    rmSync(userDir, { recursive: true, force: true });
  }
}

/** Last `[perilune-stats] <base64-json>` line the webgl2 executor logged, decoded + parsed.
 * The payload is base64 (no quotes/braces) so headless-Chrome's console-line escaping can't
 * corrupt it. */
function scrapeStats(log) {
  const matches = [...log.matchAll(/\[perilune-stats\]\s+([A-Za-z0-9+/=]+)/g)];
  if (!matches.length) return null;
  try { return JSON.parse(Buffer.from(matches[matches.length - 1][1], 'base64').toString('utf8')); }
  catch { return null; }
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`Chrome not found at:\n  ${CHROME}\nSet CHROME=/path/to/Chrome and re-run.`);
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });

  console.log(`[slice-shot] host  : ${DOTNET} run --project hosts/web -- --port ${HOST_PORT} --ship slice`);
  const host = spawn(DOTNET, ['run', '--project', join(REPO, 'hosts', 'web'), '--',
    '--port', String(HOST_PORT), '--ship', 'slice'], { stdio: 'ignore', cwd: REPO });
  console.log(`[slice-shot] client: python3 client/serve.py ${CLIENT_PORT}`);
  const client = spawn('python3', [join(REPO, 'client', 'serve.py'), String(CLIENT_PORT)],
    { stdio: 'ignore', cwd: REPO });

  const cleanup = () => { for (const p of [host, client]) { try { p.kill('SIGTERM'); } catch { /**/ } } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  let stats = null;
  try {
    console.log('[slice-shot] waiting for host + client…');
    const hostUp = await waitHttp(`http://localhost:${HOST_PORT}/`);
    const clientUp = await waitHttp(`http://localhost:${CLIENT_PORT}/`);
    if (!hostUp) throw new Error(`slice host never answered on :${HOST_PORT}`);
    if (!clientUp) throw new Error(`client server never answered on :${CLIENT_PORT}`);
    await sleep(SETTLE); // let the sim broadcast its first frames

    console.log(`[slice-shot] switching to deck ${DECK} over the wire…`);
    const deckOk = await switchDeck(HOST_PORT, DECK);
    if (!deckOk) console.warn('[slice-shot] WARN: deck switch failed — frames may show deck 0');
    await sleep(800);

    for (const sh of SHOTS) {
      const url = `http://localhost:${CLIENT_PORT}/?ws=ws://localhost:${HOST_PORT}/ws`
        + `&exec=webgl2&cx=${sh.cx}&cy=${sh.cy}&zoom=${sh.zoom}&t=0`;
      const out = join(OUT, sh.name);
      console.log(`[slice-shot] webgl2 cx=${sh.cx} cy=${sh.cy} zoom=${sh.zoom} → ${out}`);
      const log = shot(url, out);
      const b = log.match(/\[perilune\] backend=(\w+)/);
      console.log(`        backend: ${b ? b[1] : '(not captured — check the PNG)'}`);
      const s = scrapeStats(log);
      if (s) stats = s; // keep the last non-null (both framings render the same crew)
    }

    if (stats) {
      writeFileSync(join(OUT, 'renderstats.json'), JSON.stringify(stats, null, 2));
      console.log(`[slice-shot] renderstats → ${join(OUT, 'renderstats.json')}`);
    } else {
      console.warn('[slice-shot] WARN: no [perilune-stats] scraped — coverage gate will report n/a');
    }
  } finally {
    cleanup();
  }

  // Advisory gates + A/B sheet (never fail this harness on a WARN).
  // The GATE frame is the ESTABLISHING (far/zoom-32) shot: it shows the whole deck's lighting
  // range at once and is map-dominated, so its palette (style-lock) is stable run-to-run — the
  // near hero shot is pawn-dominated and drifts. accepted.png is committed from the gate frame.
  const near = join(OUT, 'candidate.png');
  const gate = join(OUT, 'candidate_far.png');
  const metrics = join(REPO, 'art', 'spritegen', 'metrics.py');
  const accepted = join(OUT, 'accepted.png');
  const rs = join(OUT, 'renderstats.json');
  const runMetrics = (frame, label) => {
    if (!existsSync(frame)) return;
    console.log(`\n[slice-shot] === advisory metrics: ${label} (${frame.split('/').pop()}) ===`);
    const a = [metrics, frame];
    if (existsSync(accepted)) a.push('--accepted', accepted);
    if (existsSync(rs)) a.push('--renderstats', rs);
    try { process.stdout.write(execFileSync('python3', a, { encoding: 'utf8' })); }
    catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); }
  };

  if (existsSync(gate)) runMetrics(gate, 'GATE / establishing');
  if (existsSync(near)) runMetrics(near, 'near hero (secondary)');
  if (!existsSync(near) && !existsSync(gate)) {
    console.error('[slice-shot] no candidate PNG was written — see host/Chrome output above.');
    process.exit(1);
  }

  console.log('\n[slice-shot] === A/B sheet ===');
  try { process.stdout.write(execFileSync('python3', [join(HERE, 'sheet.py')], { encoding: 'utf8' })); }
  catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); }

  console.log(`\n[slice-shot] artifacts in ${OUT}`);
}

main().catch((e) => { console.error('[slice-shot] FAILED:', e.message); process.exit(1); });
