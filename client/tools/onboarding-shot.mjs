#!/usr/bin/env node
// onboarding-shot.mjs — PHOTOGRAPH THE FIRST SCREEN, and then DRIVE every key it documents.
//
// ⚠️ WHY THIS EXISTS, and why it is not just a screenshot tool.
//
// The onboarding card shipped for months telling players that `B` opens a crew member's dossier.
// It does not, and never did (`client/src/input/controls.js` arms the BUILD tool on `B`;
// `openBioForSelected` has no key at all). No assertion could see it, because the card was prose.
// `client/test/onboarding.test.js` closes that by joining every documented key to its branch — but
// a branch existing does NOT mean the key does anything a player can see. Two keys on the old card
// were bound AND DEAD on the standard surface, and only a browser could tell:
//
//   • `WASD` pans the console canvas, which measures **0×0 px** under the Overview.
//   • `M` sends `Cmd.move()` at the inspection cursor, which nothing on this surface updates.
//
// Both were deleted from the card on this tool's evidence. So this tool does two jobs: it takes the
// two pictures (first boot, and reopened via the `?` button), and it PRESSES every key the card
// names and prints what changed. A key that changes nothing is a line of the card that is lying.
//
// USAGE
//   1. ./play.sh --host-port 8432 --client-port 8433 --no-open
//   2. node client/tools/onboarding-shot.mjs --out docs/design/shots [--host-port 8432] [--client-port 8433]
//
// Exits non-zero if the card is absent at first boot, if the `?` button will not bring it back, or
// if any documented key produces no observable change — a green run with no pictures, or with a
// dead key, is the failure this tool exists to prevent.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const HOST_PORT = +arg('host-port', '8432');
const CLIENT_PORT = +arg('client-port', '8433');
const OUT = resolve(arg('out', '.'));
const PREFIX = arg('prefix', 'onboarding-');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = +arg('cdp-port', '9436');
// ⚠️ THE VIEWPORT IS A PARAMETER BECAUSE THE CARD IS SCROLLABLE (`.onb-card{max-height:92vh;
// overflow:auto}`) AND ITS PRIMARY ACTION IS AT THE BOTTOM. That is the palette-overflow shape:
// a control that is present, focusable and off the screen. This tool measures BEGIN's containment
// at whatever height you give it and fails when it is out of view. Run it at more than one height.
const [WIN_W, WIN_H] = arg('window', '1600x1000').split('x').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
mkdirSync(OUT, { recursive: true });

// The card's own data — imported from the SHIPPED module, never re-typed here, so this tool cannot
// drift from what the player is being told.
const { CONTROL_GROUPS, ORDER_VERBS } = await import('../src/ui/onboarding.js');
const documented = CONTROL_GROUPS.flatMap((g) => g.rows).map((r) => r.key);
log('the card documents:', documented.join(' · '));
log('order verbs:', ORDER_VERBS.join(' · '));

const userDir = mkdtempSync(join(tmpdir(), 'onboarding-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${WIN_W},${WIN_H}`,
  '--enable-unsafe-swiftshader', '--user-data-dir=' + userDir,
  '--remote-debugging-port=' + CDP_PORT, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
    const p = list.find((t) => t.type === 'page');
    if (p) wsUrl = p.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) { console.error('FAIL: Chrome never opened a DevTools endpoint'); chrome.kill('SIGKILL'); process.exit(5); }

let id = 0; const pending = new Map();
const cdp = new WebSocket(wsUrl);
await new Promise((res) => { cdp.onopen = res; });
cdp.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (m, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); cdp.send(JSON.stringify({ id: i, method: m, params })); });
const ev = async (x) => (await call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
async function png(name, clip) {
  const r = await call('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: +arg('crop-scale', '2') } } : { format: 'png' });
  const d = r.result?.data;
  if (!d) { console.error('FAIL: captureScreenshot returned nothing for ' + name); process.exit(6); }
  const p = join(OUT, PREFIX + name); writeFileSync(p, Buffer.from(d, 'base64')); log('  wrote', p); return p;
}
async function clickAt(x, y) {
  for (const type of ['mousePressed', 'mouseReleased'])
    await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
async function key(k, mods = 0) {
  const code = k === ' ' ? 'Space' : (k === '?' ? 'Slash' : (/^[a-z]$/i.test(k) ? 'Key' + k.toUpperCase() : (/^[0-9]$/.test(k) ? 'Digit' + k : k)));
  const vk = k.length === 1 ? (k === ' ' ? 32 : (k === '?' ? 191 : k.toUpperCase().charCodeAt(0))) : 27;
  for (const type of ['keyDown', 'keyUp'])
    await call('Input.dispatchKeyEvent', { type, key: k, code, modifiers: mods, text: type === 'keyDown' && k.length === 1 ? k : undefined, windowsVirtualKeyCode: vk });
  await sleep(800);
}
const centre = async (sel) => {
  const s = await ev(`JSON.stringify((()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})())`);
  return (s && s !== 'null') ? JSON.parse(s) : null;
};
const txt = async (sel) => await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});return e?e.textContent.trim():'(absent)';})()`);
const cardBox = async () => {
  const s = await ev(`JSON.stringify((()=>{const e=document.querySelector('.onb-card');if(!e)return null;const r=e.getBoundingClientRect();const pad=14;return {x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2};})())`);
  return (s && s !== 'null') ? JSON.parse(s) : null;
};

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures += 1; console.error('  FAIL: ' + msg); } else log('  ok: ' + msg); };

await call('Page.enable'); await call('Runtime.enable');
await call('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/?port=${HOST_PORT}` });
await sleep(7000);

// ── 1. FIRST BOOT: the card as a player meets it ──
log('\n[1] FIRST BOOT');
check(await ev(`!!document.querySelector('.onb-card')`), 'the card is up on first boot');
await png('01-first-boot.png');
// BEGIN CONTAINMENT — the palette-overflow lesson, applied. The card scrolls, so a card that has
// grown too tall does not visibly break: it just puts its own primary action below the fold, where
// a new player who does not think to scroll a modal never finds it.
const fit = JSON.parse(await ev(`JSON.stringify((()=>{const c=document.querySelector('.onb-card'),b=document.querySelector('.onb-begin');if(!c||!b)return null;const cr=c.getBoundingClientRect(),br=b.getBoundingClientRect();return {cardH:Math.round(cr.height),scrollH:Math.round(c.scrollHeight),vh:innerHeight,beginBottom:Math.round(br.bottom),inView:br.bottom<=innerHeight&&br.bottom<=cr.bottom+1};})())`) || 'null');
log(`  card ${fit.cardH}px (content ${fit.scrollH}px) in a ${WIN_W}x${fit.vh} viewport; BEGIN bottom at ${fit.beginBottom}px`);
check(fit.inView, `BEGIN is on screen at ${WIN_W}x${WIN_H}`);
check(fit.scrollH <= fit.cardH + 1, 'the card does not need scrolling to reach its own bottom');
const box = await cardBox();
if (box) await png('02-first-boot-card.png', box);
const cardText = await txt('.onb-card');
for (const v of ORDER_VERBS) check(cardText.includes(v), `the card names ${v}`);
check(!/TALK/.test(await ev(`(()=>{const h=document.querySelector('.onb-verb-h');return h?h.textContent:''})()`)),
  'the FIRST headline verb is not TALK');

// ── 2. dismiss, then drive every documented key ──
log('\n[2] DRIVE THE DOCUMENTED KEYS');
const begin = await centre('[data-onb-begin]');
check(!!begin, 'the BEGIN button exists');
if (begin) { await clickAt(begin.x, begin.y); await sleep(2000); }
check(!await ev(`!!document.querySelector('.onb-card')`), 'BEGIN dismisses the card');

const deck0 = await txt('.ov-deckctx');
await key('r'); const deckR = await txt('.ov-deckctx');
check(deck0 !== deckR, `[R] changes deck (${deck0} -> ${deckR})`);
await key('f'); const deckF = await txt('.ov-deckctx');
check(deckF === deck0, `[F] changes it back (${deckR} -> ${deckF})`);

const pause0 = await txt('.ov-pause');
await key(' '); const pause1 = await txt('.ov-pause');
check(pause0 !== pause1, `[Space] pauses (${pause0} -> ${pause1})`);
await key(' ');
check(await txt('.ov-pause') === pause0, '[Space] resumes');

// ⚠️ THE LENS IS HOST-SESSION STATE, NOT PAGE STATE — a fresh Chrome profile does NOT reset it, and
// the first draft of this check pressed a hard-coded `3` against a host another run had already left
// on 3, then reported "the lens does not switch". A no-op that looks like a finding: press a digit
// that is demonstrably NOT the active one, chosen at run time.
const lensOn = async () => await ev(`(()=>{const b=document.querySelector('.ov-lensbtn.on');return b?b.textContent.trim():'(none)';})()`);
const lensIdx = async () => await ev(`Array.from(document.querySelectorAll('.ov-lensbtn')).findIndex(b=>b.className.includes('on'))`);
const lens0 = await lensOn();
const target = String(((await lensIdx()) + 3) % 7 + 1);   // any of 1..7 that is not the active one
await key(target); const lens1 = await lensOn();
check(lens0 !== lens1, `[1-7] switches the atmosphere lens (pressed ${target}: ${lens0} -> ${lens1})`);
await key('1');

const talkPanels = async () => await ev(`(()=>{const p=document.getElementById('panels');return p?p.children.length:-1;})()`);
const row = await centre('.ov-crewlist button, .ov-crewlist [data-ov-crew]');
check(!!row, 'a CREW WATCH row exists to select from');
if (row) { await clickAt(row.x, row.y); await sleep(1500); }
const panels0 = await talkPanels();
await key('t'); await sleep(3000);
check(await talkPanels() > panels0, `[T] opens a channel (panels ${panels0} -> ${await talkPanels()})`);
await key('Escape'); await sleep(800);

// ── 3. the room: Click, then the FIVE tool keys the card documents, then Esc ──
//
// ⛔ THE `O` LEG WAS DELETED HERE ON 2026-08-04, AND IT HAD BEEN FAILING SINCE M3-15 (2026-07-31).
// That package deleted the OPERATE verb outright — ring, plate, `O` key, click branch, palette row,
// the onboarding row — because doors and vents are actuated from MOSS now (OD-N). This loop kept
// pressing `o` and requiring `operate` to arm, so the tool has exited NON-ZERO on the shipping game
// for four days. Nothing gates `client/tools/*.mjs`, so nothing said so.
// ⚠️ THAT IS WORSE THAN A DEAD LEG AND IS WHY IT IS FIXED IN A PACKAGE ABOUT COPY: this file's own
// header tells authors to run it before they commit, and `ui/onboarding.js`'s LEDE comment names it
// as THE instrument for the card's height budget. A tool that is known-red is a tool whose next red
// gets waved through — a real BEGIN-below-the-fold would have read exactly like this one.
// The five that remain are exactly the keys the card's INSIDE A ROOM group documents (`G / Z / V`
// and `B / X`); `roomzoom-view.js` has no `o` branch at all. Nothing else moved.
log('\n[3] INSIDE A ROOM');
const anchors = JSON.parse(await ev(`JSON.stringify(Array.from(document.querySelectorAll('.pl-room[data-anchor]')).map(e=>e.dataset.anchor))`) || '[]');
check(anchors.length > 0, `the Overview offers rooms to click (${anchors.join(', ') || 'NONE'})`);
if (anchors.length) {
  const rc = await centre(`.pl-room[data-anchor="${anchors[0]}"]`);
  await clickAt(rc.x, rc.y); await sleep(3500);
  check(/roomzoom-open/.test(await ev(`document.body.className`)), `[Click] a room steps inside it (${anchors[0]})`);
  const armed = async () => await ev(`(()=>{const a=document.querySelector('[data-rztool].on');return a?a.dataset.rztool:'(none)';})()`);
  for (const [k, want] of [['g', 'dig'], ['z', 'stockpile'], ['v', 'strip'], ['b', 'wall'], ['x', 'demolish']]) {
    await key(k);
    const got = await armed();
    check(got === want, `[${k.toUpperCase()}] arms ${want} (got ${got})`);
  }
  await png('03-roomzoom-palette.png');
  await key('Escape'); await sleep(700);
  check(await ev(`!document.querySelector('[data-rztool].on')`), '[Esc] puts the tool down');
  await key('Escape'); await sleep(2000);
  check(!/roomzoom-open/.test(await ev(`document.body.className`)), '[Esc] again leaves the room');
}

// ── 4. reopened through the `?` KEY and the `?` BUTTON — the foot promises the KEY ──
//
// ⚠️ THE KEY LEG IS THE ONE THAT WAS MISSING. The card's last line reads "Press [?] any time to
// reopen this", and every earlier run of this tool tested only the BUTTON (`.onb-help`). Those are
// two different bindings — a click handler and a window keydown listener (`onboarding.js:207` vs
// `:209`) — so the sentence the player actually reads was the one nothing drove. That is the exact
// shape of the `B`-row defect this whole package exists for, sitting in the package's own tool.
log('\n[4] REOPEN VIA THE ? KEY, THEN THE ? BUTTON');
check(!await ev(`!!document.querySelector('.onb-card')`), 'the card is down before we reopen it');
await key('?');
check(await ev(`!!document.querySelector('.onb-card')`), 'the ? KEY brings the card back (the foot\'s promise)');
// …and it toggles, which is what the shipped handler does — press it again and the card goes away.
await key('?');
check(!await ev(`!!document.querySelector('.onb-card')`), 'the ? KEY closes it again (it toggles)');

const help = await centre('.onb-help');
check(!!help, 'the persistent ? button is on screen');
if (help) { await clickAt(help.x, help.y); await sleep(1800); }
check(await ev(`!!document.querySelector('.onb-card')`), 'the ? button brings the card back');
await png('04-reopened.png');
const box2 = await cardBox();
if (box2) await png('05-reopened-card.png', box2);

try { cdp.close(); } catch { /* already gone */ }
chrome.kill('SIGKILL');
rmSync(userDir, { recursive: true, force: true });
log(failures ? `\nFAILED — ${failures} check(s)` : '\nOK');
process.exit(failures ? 1 : 0);
