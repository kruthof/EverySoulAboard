// First-run onboarding — the one thing the shipped UI never did: tell a new player what this is and
// what to do. A one-time intro card (gated by localStorage) states the premise and the two verbs
// (TALK, BUILD), plus a compact controls reference; a persistent `?` button reopens it any time, so
// it doubles as the game's only help surface. DOM-only, browser-only, mounts over everything. It
// owns no wire/sim state — it is pure presentation and a single localStorage flag.

const SEEN_KEY = 'perilune.introSeen.v1';
let _seenThisSession = false; // fallback when localStorage is unavailable (private mode)

function hasSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return _seenThisSession; }
}
function markSeen() {
  _seenThisSession = true;
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode — session flag covers it */ }
}

const CONTROLS = [
  ['Click', 'select a crew member or a room'],
  ['T', 'talk to the selected crew'],
  ['B', 'open their dossier'],
  ['M', 'order them to move'],
  ['Space', 'pause / resume'],
  ['1–7', 'atmosphere lenses'],
  ['R / F', 'change deck'],
  ['WASD', 'pan the view'],
];

function overlayHtml() {
  const rows = CONTROLS.map(([k, v]) =>
    '<div class="onb-krow"><kbd class="onb-key">' + k + '</kbd><span>' + v + '</span></div>').join('');
  return '' +
    '<div class="onb-card" role="dialog" aria-modal="true" aria-label="Welcome to Perilune">' +
      '<div class="onb-eyebrow">MSV PERILUNE · DERELICT-CLASS SURVEY SHIP</div>' +
      '<h1 class="onb-title">Your crew are people.</h1>' +
      '<p class="onb-lede">A drifting ship, a skeleton crew, and no course home. Every soul aboard is a ' +
        'living mind with a history and opinions — including one about you. Keep them alive, and build ' +
        'the ship out around them.</p>' +
      '<div class="onb-verbs">' +
        '<div class="onb-verb"><div class="onb-verb-h">◈ TALK</div>' +
          '<div class="onb-verb-b">Click a crew member, then press <kbd class="onb-key">T</kbd> to open a ' +
          'channel. They remember what you say.</div></div>' +
        '<div class="onb-verb"><div class="onb-verb-h">▣ BUILD</div>' +
          '<div class="onb-verb-b">Open <b>BUILD</b> to place walls &amp; doors, or click an empty hall to ' +
          'commission a new room. Watch the <b>REGOLITH</b> stores — building needs matter.</div></div>' +
      '</div>' +
      '<div class="onb-controls"><div class="onb-controls-h">CONTROLS</div>' +
        '<div class="onb-kgrid">' + rows + '</div></div>' +
      '<button class="onb-begin" data-onb-begin>BEGIN</button>' +
      '<div class="onb-foot">Press <kbd class="onb-key">?</kbd> any time to reopen this.</div>' +
    '</div>';
}

/** Mount the onboarding layer: shows the intro once, installs a persistent `?` reopener + hotkey. */
export function initOnboarding() {
  if (typeof document === 'undefined') return;
  const layer = document.createElement('div');
  layer.id = 'onboarding';
  layer.className = 'onb-layer';
  layer.hidden = true;
  document.body.appendChild(layer);

  const help = document.createElement('button');
  help.className = 'onb-help';
  help.type = 'button';
  help.title = 'Help & controls (?)';
  help.textContent = '?';
  document.body.appendChild(help);

  const open = () => { layer.innerHTML = overlayHtml(); layer.hidden = false; };
  const close = () => { layer.hidden = true; layer.innerHTML = ''; markSeen(); };

  layer.addEventListener('click', (e) => {
    const t = e.target;
    if (t === layer) { close(); return; }               // click the backdrop → dismiss
    if (t && t.closest && t.closest('[data-onb-begin]')) close();
  });
  help.addEventListener('click', open);
  // `?` reopens; Escape closes — but only ours, and only when open (never steal the ship's Esc).
  window.addEventListener('keydown', (e) => {
    const typing = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName || '');
    if (!layer.hidden && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (!typing && e.key === '?') { e.preventDefault(); layer.hidden ? open() : close(); }
  }, true); // capture: our Escape close beats the game's Esc stack while the card is up

  if (!hasSeen()) open();
}
