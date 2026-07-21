// Procedural vector painters — the sprite-off fallback skin plus the always-vector overlays
// (hover cursor, selection reticle). Verbatim ports of the paint* helpers in
// hosts/web/Client.html. Each takes an explicit 2D context and tile size T; nothing here is
// stateful. Coordinates arrive already in the camera transform (tile (x,y) is at x*T,y*T).

import { C, FG } from './palette.js';

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function paintFloor(ctx, T, px, py) {
  ctx.fillStyle = '#242038'; ctx.fillRect(px, py, T, T);
  ctx.strokeStyle = 'rgba(180,160,255,.06)'; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
}

export function paintWall(ctx, T, px, py) {
  ctx.fillStyle = '#191527'; ctx.fillRect(px, py, T, T);
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(px, py, T, 2);       // top bevel
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(px, py + T - 2, T, 2);     // bottom shade
}

export function paintDebris(ctx, T, px, py) {
  ctx.fillStyle = '#282033'; ctx.fillRect(px, py, T, T);
  ctx.fillStyle = 'rgba(150,122,90,.55)';
  const seed = px * 13 + py * 7;
  for (let i = 0; i < 5; i++) {
    const rx = px + ((seed * (i + 3) * 7) % (T - 6)) + 2;
    const ry = py + ((seed * (i + 5) * 11) % (T - 6)) + 2;
    ctx.fillRect(rx, ry, 3, 3);
  }
}

export function paintCursor(ctx, T, px, py) {
  ctx.strokeStyle = FG[C.Crew]; ctx.lineWidth = 2;
  roundRect(ctx, px + 1.5, py + 1.5, T - 3, T - 3, 5); ctx.stroke();
  ctx.shadowColor = FG[C.Crew]; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
}

// Selected-crew reticle: a soft glowing floor disc + pulsing corner brackets. Pulse phase is
// wall-clock (timeSec) so it breathes even while the sim is paused.
export function paintSelection(ctx, T, px, py, timeSec) {
  const t = timeSec;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
  const cx = px + T / 2, cy = py + T / 2, col = FG[C.Accent];
  ctx.save();
  const rg = ctx.createRadialGradient(cx, cy, T * 0.1, cx, cy, T * 0.62);
  rg.addColorStop(0, 'rgba(45,226,255,' + (0.22 + 0.14 * pulse).toFixed(3) + ')');
  rg.addColorStop(1, 'rgba(45,226,255,0)');
  ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, T * 0.62, 0, 7); ctx.fill();
  const m = T * (0.10 - 0.03 * pulse), L = T * 0.26;
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, T * 0.055); ctx.lineCap = 'round';
  ctx.shadowColor = col; ctx.shadowBlur = T * 0.12;
  const cn = (ax, ay, bx, by, ccx, ccy) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ccx, ccy); ctx.lineTo(bx, by); ctx.stroke();
  };
  cn(px + m, py + m + L, px + m + L, py + m, px + m, py + m);
  cn(px + T - m - L, py + m, px + T - m, py + m + L, px + T - m, py + m);
  cn(px + m, py + T - m - L, px + m + L, py + T - m, px + m, py + T - m);
  cn(px + T - m, py + T - m - L, px + T - m - L, py + T - m, px + T - m, py + T - m);
  ctx.restore();
}

// ---- entity vector icons (procedural fallback) ----

export function paintPawn(ctx, cx, cy, r, col) {
  ctx.shadowColor = col; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = col; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#0d0a16'; ctx.beginPath(); ctx.arc(cx, cy - r * 0.35, r * 0.28, 0, 7); ctx.fill();
}

export function paintCorpse(ctx, cx, cy, r) {
  ctx.fillStyle = '#6e6884'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.2, r * 1.1, r * 0.6, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.stroke();
}

export function paintDoor(ctx, T, px, py, state, col) {
  const m = 3;
  ctx.strokeStyle = '#443d5e'; ctx.lineWidth = 2;
  ctx.strokeRect(px + m + 0.5, py + m + 0.5, T - 2 * m - 1, T - 2 * m - 1);
  ctx.fillStyle = state === 'locked' ? FG[C.Locked] : col;
  if (state === 'open') {
    ctx.globalAlpha = 0.55;
    ctx.fillRect(px + m, py + m, 3, T - 2 * m); ctx.fillRect(px + T - m - 3, py + m, 3, T - 2 * m);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillRect(px + m, py + m, T - 2 * m, T - 2 * m);
    if (state === 'locked') {
      ctx.fillStyle = '#0d0a16'; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 3.2, 0, 7); ctx.fill();
    }
  }
}

export function paintFan(ctx, cx, cy, r) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(a) * r * 0.4 - Math.sin(a) * r * 0.5,
      cy + Math.sin(a) * r * 0.4 + Math.cos(a) * r * 0.5,
      cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, 7); ctx.fill();
}

export function paintGrowBed(ctx, T, px, py) {
  ctx.fillStyle = '#2b2140'; ctx.fillRect(px + 3, py + T * 0.5, T - 6, T * 0.42);
  ctx.strokeStyle = FG[C.Growth]; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const x = px + 6 + i * (T - 12) / 2;
    ctx.beginPath(); ctx.moveTo(x, py + T * 0.9); ctx.quadraticCurveTo(x - 3, py + T * 0.55, x, py + T * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, py + T * 0.62); ctx.lineTo(x + 4, py + T * 0.5); ctx.stroke();
  }
}

export function paintTank(ctx, cx, cy, r) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, 7); ctx.clip();
  ctx.fillStyle = FG[C.Water]; ctx.globalAlpha = 0.8; ctx.fillRect(cx - r, cy + r * 0.1, 2 * r, r); ctx.restore();
}

export function paintRadiator(ctx, T, px, py, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(px + 3.5, py + 4.5, T - 7, T - 9);
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    const y = py + 4 + i * (T - 8) / 4;
    ctx.beginPath(); ctx.moveTo(px + 5, y); ctx.lineTo(px + T - 5, y); ctx.stroke();
  }
}

export function paintTerminal(ctx, T, px, py, col) {
  ctx.fillStyle = '#120d1e'; ctx.strokeStyle = col; ctx.lineWidth = 2;
  roundRect(ctx, px + 4, py + 4, T - 8, T - 11, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.globalAlpha = 0.6; ctx.fillRect(px + 6, py + 6, T - 12, 3); ctx.globalAlpha = 1;
  ctx.fillStyle = col; ctx.fillRect(px + T / 2 - 3, py + T - 6, 6, 2);
}

export function paintSolar(ctx, T, px, py, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  const gx = px + 4, gy = py + 5, gw = T - 8, gh = T - 10;
  ctx.strokeRect(gx + 0.5, gy + 0.5, gw, gh);
  ctx.beginPath(); ctx.moveTo(gx + gw / 2, gy); ctx.lineTo(gx + gw / 2, gy + gh);
  ctx.moveTo(gx, gy + gh / 2); ctx.lineTo(gx + gw, gy + gh / 2); ctx.stroke();
}

export function paintBattery(ctx, T, px, py, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 2; roundRect(ctx, px + 4, py + 6, T - 9, T - 12, 2); ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(px + T - 5, py + T / 2 - 3, 2.5, 6);
  ctx.fillRect(px + 7, py + 8, 3, T - 16); ctx.fillRect(px + 12, py + 8, 3, T - 16);
}

export function paintVent(ctx, cx, cy, r, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.moveTo(cx - r, cy + i * 5 + 3); ctx.lineTo(cx, cy + i * 5 - 2); ctx.lineTo(cx + r, cy + i * 5 + 3); ctx.stroke();
  }
}

export function paintLight(ctx, cx, cy, r) {
  ctx.fillStyle = FG[C.Locked]; ctx.shadowColor = FG[C.Locked]; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,176,46,.5)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const a = i * 1.571;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
    ctx.lineTo(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15); ctx.stroke();
  }
}

export function paintLadder(ctx, T, px, py, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px + 8, py + 3); ctx.lineTo(px + 8, py + T - 3);
  ctx.moveTo(px + T - 8, py + 3); ctx.lineTo(px + T - 8, py + T - 3); ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const y = py + 7 + i * (T - 12) / 2;
    ctx.beginPath(); ctx.moveTo(px + 8, y); ctx.lineTo(px + T - 8, y); ctx.stroke();
  }
}

export function paintConduit(ctx, T, px, py, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(px + 2, py + T / 2); ctx.lineTo(px + T - 2, py + T / 2); ctx.stroke(); ctx.globalAlpha = 1;
}

export function paintMachine(ctx, T, px, py, col, mark) {
  ctx.fillStyle = '#1c1730'; ctx.strokeStyle = col; ctx.lineWidth = 2;
  roundRect(ctx, px + 4, py + 4, T - 8, T - 8, 3); ctx.fill(); ctx.stroke();
  const cx = px + T / 2, cy = py + T / 2; ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  if (mark === 'gear') {
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 7); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
      ctx.lineTo(cx + Math.cos(a) * 6.5, cy + Math.sin(a) * 6.5); ctx.stroke();
    }
  } else if (mark === 'tools') {
    ctx.beginPath(); ctx.moveTo(cx - 5, cy + 5); ctx.lineTo(cx + 5, cy - 5);
    ctx.moveTo(cx + 5, cy + 5); ctx.lineTo(cx - 5, cy - 5); ctx.stroke();
  } else if (mark === 'recycle') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 - 1.57; const x = cx + Math.cos(a) * 5, y = cy + Math.sin(a) * 5;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  } else if (mark === 'drop') {
    ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.quadraticCurveTo(cx + 5, cy + 2, cx, cy + 5);
    ctx.quadraticCurveTo(cx - 5, cy + 2, cx, cy - 6); ctx.closePath(); ctx.fillStyle = FG[C.Water]; ctx.fill();
  }
}

export function paintItem(ctx, g, cx, cy, col) {
  ctx.fillStyle = col;
  const ch = String.fromCharCode(g);
  if (ch === ',') {
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(cx - 4 + (i % 2) * 8, cy - 3 + ((i >> 1) * 7), 1.8, 0, 7); ctx.fill(); }
  } else if (ch === 'o') { ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill(); }
  else if (ch === 'f') { ctx.beginPath(); ctx.ellipse(cx, cy, 4.5, 3.3, 0.4, 0, 7); ctx.fill(); }
  else if (ch === 's') { ctx.fillRect(cx - 4, cy - 2, 8, 4); }
  else if (ch === 'p') { ctx.fillRect(cx - 4, cy - 4, 8, 8); }
  else if (ch === 'c') { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(cx - 4, cy - 4, 8, 8); ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3); }
  else { ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill(); }
}
