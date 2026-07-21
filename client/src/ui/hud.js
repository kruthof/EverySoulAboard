// HTML chrome — the sidebar/status/log DOM. Pure DOM writes from decoded wire messages; the
// canvas owns the world, this owns the panels. Verbatim port of the render* HUD helpers in
// hosts/web/Client.html.

const METRIC_DEFS = [
  ['power', 'Power'], ['oxygen', 'Oxygen'], ['water', 'Water'], ['food', 'Food'],
  ['heat', 'Heat'], ['structural', 'Structure'], ['morale', 'Morale'],
];

const $ = (id) => document.getElementById(id);
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
export function setChip(id, v) { $(id).textContent = v; }

function barColor(v) { return v >= 0.66 ? 'var(--good)' : v >= 0.33 ? 'var(--warn)' : 'var(--bad)'; }

/** @param {import('../wire/messages.js').MetricsMsg} m */
export function renderMetrics(m) {
  const el = $('metrics'); let html = '';
  for (const [k, label] of METRIC_DEFS) {
    const v = Math.max(0, Math.min(1, m[k] || 0)); const pct = Math.round(v * 100);
    html += `<div class="metric"><div class="row"><span>${label}</span><span>${pct}%</span></div>` +
      `<div class="track"><div class="fill" style="width:${pct}%;background:${barColor(v)}"></div></div></div>`;
  }
  const co2 = Math.round(m.co2ppm || 0);
  html += `<div class="metric"><div class="row"><span>CO₂ worst</span><span>${co2} ppm</span></div>` +
    `<div class="track"><div class="fill" style="width:${Math.min(100, co2 / 20)}%;background:${co2 > 2000 ? 'var(--bad)' : co2 > 1000 ? 'var(--warn)' : 'var(--good)'}"></div></div></div>`;
  el.innerHTML = html;
  setChip('s-day', m.day + (m.dayFrac !== undefined ? ('.' + String(Math.floor(m.dayFrac * 100)).padStart(2, '0')) : ''));
}

export function renderLog(lines) {
  lines = lines || [];
  const el = $('log');
  el.innerHTML = lines.length
    ? lines.map((l) => `<div class="line">${esc(l)}</div>`).join('')
    : '<div class="line" style="color:var(--faint)">— no events yet · unpause or speed up to run the ship —</div>';
  el.scrollTop = el.scrollHeight;
}

export function renderLegend(lines) {
  lines = lines || [];
  $('legend').innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
}

export function renderInspect(lines) {
  lines = lines || [];
  $('inspect').innerHTML = lines.map((l, i) => `<div class="l${i === 0 ? 0 : 1}">${esc(l)}</div>`).join('');
}

/** @param {import('../wire/messages.js').StatusMsg} m */
export function renderStatus(m) {
  $('s-speed').textContent = m.speed;
  $('s-msg').textContent = m.text || '';
  const dot = $('s-runstate');
  dot.className = m.paused ? 'paused-dot' : 'run-dot';
  $('b-pause').classList.toggle('on', m.paused);
}

/** Reflect the active lens on the legend card + lens buttons when a frame lands. */
export function reflectLens(lens) {
  $('legendcard').style.display = lens === 'none' ? 'none' : 'block';
  document.querySelectorAll('#lensbtns button').forEach((b) =>
    b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.lens === lens));
}

export const LENSES = ['none', 'pressure', 'oxygen', 'co2', 'temperature', 'power', 'water'];

/** Build the lens buttons; onLens(name) is called on click. */
export function buildLensButtons(onLens) {
  const wrap = $('lensbtns');
  LENSES.forEach((name, i) => {
    const b = document.createElement('button');
    b.textContent = (i === 0 ? '∅ none' : `${i} ${name.slice(0, 4)}`);
    b.onclick = () => onLens(name);
    b.dataset.lens = name; wrap.appendChild(b);
  });
}
