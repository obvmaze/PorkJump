'use strict';

/* =========================================================
   PORK JUMP – Doodle-Jump-artiges Hochkant-Spiel
   Alles wird auf ein <canvas> gezeichnet. Die Spielwelt ist
   immer 400 Einheiten breit, die Höhe passt sich dem Handy an.
   ========================================================= */

// ---------- Spiel-Konstanten (hier kann man am Gameplay drehen) ----------
const W = 400;                 // logische Breite der Welt
const G = 1800;                // Schwerkraft (Einheiten/s²)
const JUMP_V = 900;            // Absprung-Geschwindigkeit
const JUMP_H = JUMP_V * JUMP_V / (2 * G); // max. Sprunghöhe (225)
const MAX_VX = 420;            // max. Seitwärts-Tempo
const ACCEL = 2600;            // wie schnell man seitlich beschleunigt
const FRICTION = 7;            // wie schnell man seitlich abbremst
const MAX_FALL = 1400;
const PX_PER_M = 25;           // 25 Einheiten = 1 Meter
const THEME_LEN = 300;         // alle 300 m eine neue Welt
const TRAMP_MUL = 1.9;         // Trampolin: Absprung x1.9 (~3.6x so hoch)
const SHOE_MUL = Math.SQRT2;   // Federschuhe: doppelte Sprunghöhe
const SHOE_TIME = 15;
const BEE_TIME = 8;
const BEE_V = 700;             // Biene trägt einen mit diesem Tempo hoch
const STEP = 1 / 120;          // feste Physik-Schrittweite

// ---------- Canvas & Größe ----------
const wrapEl = document.getElementById('wrap');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let H = 700;        // logische Höhe (abhängig vom Bildschirm)
let scale = 1;      // logisch -> echte Pixel

function resize() {
  const r = wrapEl.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  scale = canvas.width / W;
  H = canvas.height / scale;
  bgCache.clear();
  if (state === 'menu') initDemo();
}

// ---------- Hilfsfunktionen ----------
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapMod = (v, m) => ((v % m) + m) % m;

// Zufallsgenerator mit festem Startwert (damit Hintergründe immer gleich aussehen)
function rng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  return gr;
}

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function glow(g, x, y, r, color) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function cloud(g, x, y, s) {
  circle(g, x, y, 18 * s);
  circle(g, x + 22 * s, y - 10 * s, 24 * s);
  circle(g, x + 48 * s, y - 2 * s, 19 * s);
  circle(g, x + 66 * s, y + 4 * s, 13 * s);
  rr(g, x - 6 * s, y, 80 * s, 18 * s, 9 * s);
  g.fill();
}

// Welliger Hügel-Streifen
function hills(g, w, h, baseY, amp, color, seed, freq) {
  const r = rng(seed);
  const p1 = r() * 6, p2 = r() * 6;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) {
    const y = baseY - amp * (0.55 * Math.sin(x * freq + p1) + 0.45 * Math.sin(x * freq * 2.3 + p2));
    g.lineTo(x, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
}

// Bergkette mit Schneekappen
function peaks(g, w, h, baseY, height, color, snow, seed, count) {
  const r = rng(seed);
  const pts = [[-40, baseY]];
  const step = (w + 80) / count;
  for (let i = 0; i < count; i++) {
    const px = -40 + step * (i + 0.5) + (r() - 0.5) * step * 0.4;
    pts.push([px, baseY - height * (0.6 + r() * 0.4)]);
    pts.push([-40 + step * (i + 1), baseY - height * (0.1 + r() * 0.25)]);
  }
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-40, h);
  pts.forEach(p => g.lineTo(p[0], p[1]));
  g.lineTo(w + 40, h);
  g.closePath();
  g.fill();
  if (!snow) return;
  g.fillStyle = snow;
  for (let i = 1; i < pts.length - 1; i += 2) {
    const [px, py] = pts[i], [lx, ly] = pts[i - 1], [qx, qy] = pts[i + 1];
    const L = [lerp(px, lx, 0.32), lerp(py, ly, 0.32)];
    const R = [lerp(px, qx, 0.32), lerp(py, qy, 0.32)];
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(R[0], R[1]);
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      g.lineTo(lerp(R[0], L[0], t), lerp(R[1], L[1], t) + (k % 2 ? -6 : 4));
    }
    g.lineTo(L[0], L[1]);
    g.closePath();
    g.fill();
  }
}

function pine(g, x, y, s, color, snow) {
  g.fillStyle = '#4a2f1d';
  g.fillRect(x - 3 * s, y - 10 * s, 6 * s, 10 * s);
  for (let i = 0; i < 3; i++) {
    const ty = y - 8 * s - i * 14 * s;
    const tw = (22 - i * 5) * s;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x - tw, ty);
    g.lineTo(x, ty - 22 * s);
    g.lineTo(x + tw, ty);
    g.closePath();
    g.fill();
    if (snow) {
      g.fillStyle = snow;
      g.beginPath();
      g.moveTo(x - tw * 0.35, ty - 14 * s);
      g.lineTo(x, ty - 22 * s);
      g.lineTo(x + tw * 0.35, ty - 14 * s);
      g.closePath();
      g.fill();
    }
  }
}

function palm(g, x, y, s, flip) {
  const d = flip ? -1 : 1;
  g.strokeStyle = '#6b3f1f';
  g.lineWidth = 9 * s;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + d * 10 * s, y - 70 * s, x + d * 34 * s, y - 130 * s);
  g.stroke();
  const tx = x + d * 34 * s, ty = y - 130 * s;
  g.fillStyle = '#1f7a4a';
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55;
    g.save();
    g.translate(tx, ty);
    g.rotate(a);
    g.beginPath();
    g.ellipse(32 * s, 0, 34 * s, 8 * s, 0.25, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#5a3a1a';
  circle(g, tx - 4 * s, ty + 6 * s, 5 * s);
  circle(g, tx + 5 * s, ty + 7 * s, 5 * s);
}

function roundTree(g, x, y, s, trunk, leaf) {
  g.fillStyle = trunk;
  g.fillRect(x - 4 * s, y - 30 * s, 8 * s, 30 * s);
  g.fillStyle = leaf;
  circle(g, x, y - 44 * s, 22 * s);
  circle(g, x - 16 * s, y - 32 * s, 15 * s);
  circle(g, x + 16 * s, y - 32 * s, 15 * s);
}

function treeRow(g, w, h, baseY, color, seed, size) {
  const r = rng(seed);
  g.fillStyle = color;
  g.fillRect(0, baseY, w, h - baseY);
  let x = -10;
  while (x < w + 30) {
    const s = size * (0.7 + r() * 0.6);
    if (r() < 0.5) roundTree(g, x, baseY + 4, s, color, color);
    else pine(g, x, baseY + 4, s * 1.2, color, null);
    x += 26 * size + r() * 20 * size;
  }
}

function mushroom(g, x, y, s, cap) {
  g.fillStyle = '#f5ead7';
  rr(g, x - 4 * s, y - 14 * s, 8 * s, 14 * s, 3 * s);
  g.fill();
  glow(g, x, y - 16 * s, 26 * s, cap === '#ff4d6d' ? 'rgba(255,90,120,0.35)' : 'rgba(120,220,255,0.4)');
  g.fillStyle = cap;
  g.beginPath();
  g.ellipse(x, y - 14 * s, 13 * s, 10 * s, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = '#fff';
  circle(g, x - 5 * s, y - 19 * s, 2 * s);
  circle(g, x + 4 * s, y - 21 * s, 2.4 * s);
  circle(g, x + 8 * s, y - 16 * s, 1.6 * s);
}

function stars(g, w, h, n, seed, maxY) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = 0.4 + r() * 0.6;
    g.fillStyle = `rgba(255,255,255,${a})`;
    circle(g, r() * w, r() * h * maxY, r() * 1.4 + 0.3);
  }
}

/* =========================================================
   WELTEN / HINTERGRÜNDE
   draw()  = fester Hintergrund (wird einmal gemalt und gecached)
   amb     = bewegte Deko (Wolken, Glühwürmchen, Schnee …)
   plat    = Farben der Plattformen in dieser Welt
   ========================================================= */
const THEMES = [
  {
    name: 'Sonnenaufgang-Strand', amb: 'beach',
    plat: { base: '#c07a3f', top: '#f6d48e', line: '#5e3517' },
    draw(g, w, h) {
      g.fillStyle = vgrad(g, 0, h * 0.72, ['#3b1e6e', '#a83f8a', '#ff7a6b', '#ffb36b', '#ffe2a8']);
      g.fillRect(0, 0, w, h);
      const sy = h * 0.72;
      glow(g, w * 0.5, sy, 220, 'rgba(255,230,150,0.75)');
      g.fillStyle = '#fff1a8';
      circle(g, w * 0.5, sy, 62);
      g.fillStyle = 'rgba(255,190,205,0.8)';
      cloud(g, 30, h * 0.2, 1.1);
      cloud(g, 250, h * 0.33, 0.8);
      cloud(g, 120, h * 0.48, 0.6);
      g.fillStyle = vgrad(g, sy, h * 0.88, ['#ff9e7a', '#4a78c9', '#2b4f9a']);
      g.fillRect(0, sy, w, h * 0.88 - sy);
      g.fillStyle = 'rgba(255,240,170,0.75)';
      for (let i = 0; i < 7; i++) {
        const ww = 110 - i * 13;
        rr(g, w * 0.5 - ww / 2, sy + 8 + i * 11, ww, 4, 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 2;
      const r = rng(7);
      for (let i = 0; i < 14; i++) {
        const x = r() * w, y = sy + 15 + r() * (h * 0.14);
        g.beginPath();
        g.arc(x, y, 8, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
      g.fillStyle = '#f7d59c';
      g.beginPath();
      g.moveTo(0, h * 0.85);
      g.quadraticCurveTo(w * 0.5, h * 0.82, w, h * 0.87);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.closePath();
      g.fill();
      g.fillStyle = '#e8bd7c';
      for (let i = 0; i < 40; i++) circle(g, r() * w, h * 0.88 + r() * h * 0.12, 1.5);
      palm(g, w * 0.1, h * 0.97, 1.1, false);
      palm(g, w * 0.93, h * 0.95, 0.8, true);
    }
  },
  {
    name: 'Verwunschener Wald', amb: 'forest',
    plat: { base: '#6b4a2b', top: '#62d36f', line: '#24160b' },
    draw(g, w, h) {
      g.fillStyle = vgrad(g, 0, h, ['#140a33', '#2e1a66', '#3b5e8c', '#3fa38a']);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.76, h * 0.14, 110, 'rgba(255,250,220,0.5)');
      g.fillStyle = '#fdf6d8';
      circle(g, w * 0.76, h * 0.14, 32);
      g.fillStyle = 'rgba(46,26,102,0.25)';
      circle(g, w * 0.76 + 9, h * 0.14 - 6, 7);
      circle(g, w * 0.76 - 10, h * 0.14 + 8, 5);
      stars(g, w, h, 50, 3, 0.4);
      g.fillStyle = 'rgba(255,255,230,0.07)';
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(w * 0.55 + i * 30, 0);
        g.lineTo(w * 0.62 + i * 30, 0);
        g.lineTo(w * 0.2 + i * 50, h);
        g.lineTo(w * 0.05 + i * 50, h);
        g.closePath();
        g.fill();
      }
      treeRow(g, w, h, h * 0.6, '#2d5a78', 11, 1.1);
      treeRow(g, w, h, h * 0.72, '#1e4256', 12, 1.3);
      treeRow(g, w, h, h * 0.84, '#11283a', 13, 1.5);
      mushroom(g, w * 0.18, h * 0.93, 1.3, '#ff4d6d');
      mushroom(g, w * 0.27, h * 0.95, 0.8, '#5ad1ff');
      mushroom(g, w * 0.8, h * 0.92, 1.1, '#5ad1ff');
      mushroom(g, w * 0.88, h * 0.96, 1.4, '#ff4d6d');
    }
  },
  {
    name: 'Schneeberge', amb: 'snow',
    plat: { base: '#7fb3e0', top: '#ffffff', line: '#2d4f73' },
    draw(g, w, h) {
      g.fillStyle = vgrad(g, 0, h, ['#3d8fe8', '#8fd0ff', '#e6f7ff']);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.2, h * 0.12, 120, 'rgba(255,255,220,0.8)');
      g.fillStyle = '#fffbe0';
      circle(g, w * 0.2, h * 0.12, 26);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      cloud(g, 220, h * 0.18, 0.9);
      cloud(g, 60, h * 0.32, 0.6);
      peaks(g, w, h, h * 0.68, h * 0.36, '#a9c4e8', '#ffffff', 21, 4);
      peaks(g, w, h, h * 0.8, h * 0.3, '#6f8fc0', '#f4fbff', 22, 3);
      hills(g, w, h, h * 0.87, 10, '#ffffff', 23, 0.02);
      const r = rng(24);
      for (let i = 0; i < 9; i++) pine(g, r() * w, h * 0.88 + r() * h * 0.1, 0.8 + r() * 0.5, '#2f5d50', '#ffffff');
    }
  },
  {
    name: 'Canyon im Abendrot', amb: 'desert',
    plat: { base: '#b5552f', top: '#f0a35c', line: '#5a2414' },
    draw(g, w, h) {
      g.fillStyle = vgrad(g, 0, h * 0.75, ['#2d1b4e', '#8e2f6b', '#e8505b', '#ff9f43', '#ffd08a']);
      g.fillRect(0, 0, w, h);
      stars(g, w, h, 25, 31, 0.25);
      glow(g, w * 0.62, h * 0.62, 200, 'rgba(255,220,130,0.7)');
      g.fillStyle = '#ffe08a';
      circle(g, w * 0.62, h * 0.62, 66);
      const mesa = (x, top, wid, col, base) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x - 20, base);
        g.lineTo(x, top + 12);
        g.lineTo(x + 8, top);
        g.lineTo(x + wid - 8, top);
        g.lineTo(x + wid, top + 12);
        g.lineTo(x + wid + 20, base);
        g.closePath();
        g.fill();
      };
      mesa(-30, h * 0.55, 140, '#c2553b', h * 0.8);
      mesa(250, h * 0.6, 120, '#c2553b', h * 0.8);
      mesa(120, h * 0.68, 90, '#9e3f2c', h * 0.85);
      g.fillStyle = 'rgba(255,200,150,0.2)';
      g.fillRect(0, h * 0.62, w, 3);
      g.fillStyle = vgrad(g, h * 0.8, h, ['#d9824b', '#b8643a']);
      g.fillRect(0, h * 0.8, w, h * 0.2);
      const cactus = (x, y, s) => {
        g.fillStyle = '#2f6b3a';
        rr(g, x - 6 * s, y - 60 * s, 12 * s, 60 * s, 6 * s); g.fill();
        rr(g, x - 22 * s, y - 42 * s, 9 * s, 24 * s, 4.5 * s); g.fill();
        rr(g, x - 22 * s, y - 24 * s, 20 * s, 8 * s, 4 * s); g.fill();
        rr(g, x + 13 * s, y - 50 * s, 9 * s, 24 * s, 4.5 * s); g.fill();
        rr(g, x + 2 * s, y - 32 * s, 20 * s, 8 * s, 4 * s); g.fill();
      };
      cactus(w * 0.15, h * 0.95, 1.1);
      cactus(w * 0.85, h * 0.92, 0.8);
      cactus(w * 0.55, h * 0.98, 0.6);
    }
  },
  {
    name: 'Zuckerland', amb: 'candy',
    plat: { base: '#ff6fae', top: '#fff3fb', line: '#8a1f55', sprinkles: true },
    draw(g, w, h) {
      g.fillStyle = vgrad(g, 0, h, ['#ff9ad5', '#ffc6e8', '#c9b6ff', '#9fe3ff']);
      g.fillRect(0, 0, w, h);
      const cols = ['#ff5a5a', '#ffa64d', '#ffe14d', '#6be36b', '#4dc3ff', '#9b6bff'];
      g.lineWidth = 12;
      cols.forEach((c, i) => {
        g.strokeStyle = c;
        g.globalAlpha = 0.6;
        g.beginPath();
        g.arc(w * 0.5, h * 0.78, 190 - i * 12, Math.PI, 0);
        g.stroke();
      });
      g.globalAlpha = 1;
      g.fillStyle = '#ffd6ef';
      cloud(g, 20, h * 0.18, 1.1);
      g.fillStyle = '#d6f2ff';
      cloud(g, 240, h * 0.3, 0.9);
      g.fillStyle = '#ffe9f6';
      cloud(g, 100, h * 0.44, 0.7);
      hills(g, w, h, h * 0.78, 22, '#ffb3d9', 41, 0.018);
      const lolli = (x, y, s, c) => {
        g.fillStyle = '#fff';
        g.fillRect(x - 2.5 * s, y - 70 * s, 5 * s, 70 * s);
        g.fillStyle = c;
        circle(g, x, y - 82 * s, 20 * s);
        g.strokeStyle = '#fff';
        g.lineWidth = 3.5 * s;
        g.beginPath();
        for (let a = 0; a < Math.PI * 6; a += 0.2) {
          const rad = a * 1 * s;
          g.lineTo(x + Math.cos(a) * rad, y - 82 * s + Math.sin(a) * rad);
        }
        g.stroke();
      };
      lolli(w * 0.12, h * 0.86, 1, '#ff5a8a');
      lolli(w * 0.86, h * 0.84, 0.8, '#7b6bff');
      hills(g, w, h, h * 0.88, 14, '#ff7eb9', 42, 0.025);
      g.fillStyle = '#fff';
      for (let x = 0; x < w; x += 22) circle(g, x + 11, h * 0.88 - 4 + Math.sin(x) * 4, 7);
      const cane = (x, y, s) => {
        g.lineCap = 'round';
        g.lineWidth = 9 * s;
        g.strokeStyle = '#fff';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y - 50 * s);
        g.arc(x + 12 * s, y - 50 * s, 12 * s, Math.PI, 0);
        g.stroke();
        g.strokeStyle = '#ff3b5c';
        g.lineWidth = 9 * s;
        g.setLineDash([6 * s, 6 * s]);
        g.stroke();
        g.setLineDash([]);
      };
      cane(w * 0.42, h * 0.98, 1);
      cane(w * 0.66, h * 0.97, 0.7);
    }
  },
  {
    name: 'Wolkenkönigreich', amb: 'sky',
    plat: { base: '#e9f6ff', top: '#ffffff', line: '#5b8fbf' },
    draw(g, w, h) {
      g.fillStyle = vgrad(g, 0, h, ['#2f7fff', '#79c2ff', '#cdeeff']);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.85, h * 0.08, 140, 'rgba(255,255,230,0.8)');
      const island = (x, y, s, castle) => {
        g.fillStyle = '#8a5a3b';
        g.beginPath();
        g.moveTo(x - 50 * s, y);
        g.lineTo(x + 50 * s, y);
        g.lineTo(x + 10 * s, y + 55 * s);
        g.lineTo(x - 5 * s, y + 70 * s);
        g.closePath();
        g.fill();
        g.fillStyle = '#5fcf5f';
        g.beginPath();
        g.ellipse(x, y, 54 * s, 11 * s, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(190,235,255,0.8)';
        g.fillRect(x + 22 * s, y + 4 * s, 7 * s, 80 * s);
        if (castle) {
          g.fillStyle = '#f2ecff';
          g.fillRect(x - 24 * s, y - 40 * s, 48 * s, 36 * s);
          g.fillRect(x - 34 * s, y - 56 * s, 14 * s, 52 * s);
          g.fillRect(x + 20 * s, y - 56 * s, 14 * s, 52 * s);
          g.fillStyle = '#9b6bff';
          const roof = (rx) => {
            g.beginPath();
            g.moveTo(rx - 10 * s, y - 56 * s);
            g.lineTo(rx, y - 76 * s);
            g.lineTo(rx + 10 * s, y - 56 * s);
            g.closePath();
            g.fill();
          };
          roof(x - 27 * s);
          roof(x + 27 * s);
          g.fillStyle = '#6b4bbf';
          rr(g, x - 6 * s, y - 22 * s, 12 * s, 18 * s, 6 * s);
          g.fill();
        }
      };
      island(w * 0.7, h * 0.3, 1.1, true);
      island(w * 0.2, h * 0.52, 0.7, false);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 7; i++) cloud(g, -20 + i * 62, h * 0.86 + (i % 2) * 14, 1.1);
      g.fillStyle = '#ffffff';
      g.fillRect(0, h * 0.9, w, h * 0.1);
    }
  },
  {
    name: 'Polarlicht-Nacht', amb: 'aurora',
    plat: { base: '#3b5f8a', top: '#c9f3ff', line: '#132a46' },
    draw(g, w, h) {
      g.fillStyle = vgrad(g, 0, h, ['#01011a', '#071a3d', '#0d3b5c', '#1b5a6e']);
      g.fillRect(0, 0, w, h);
      stars(g, w, h, 140, 61, 0.8);
      g.globalCompositeOperation = 'lighter';
      const band = (y0, amp, c1, ph) => {
        for (let x = 0; x < w; x += 3) {
          const y = y0 + Math.sin(x * 0.015 + ph) * amp + Math.sin(x * 0.04 + ph * 2) * amp * 0.3;
          const gr = g.createLinearGradient(0, y - 90, 0, y);
          gr.addColorStop(0, 'rgba(0,0,0,0)');
          gr.addColorStop(1, c1);
          g.fillStyle = gr;
          g.fillRect(x, y - 90, 3, 92);
        }
      };
      band(h * 0.3, 30, 'rgba(80,255,170,0.35)', 0.5);
      band(h * 0.4, 24, 'rgba(170,90,255,0.3)', 2.1);
      band(h * 0.22, 18, 'rgba(90,220,255,0.25)', 4);
      g.globalCompositeOperation = 'source-over';
      peaks(g, w, h, h * 0.8, h * 0.18, '#1d3557', '#cfe8ff', 62, 4);
      hills(g, w, h, h * 0.88, 8, '#e8f6ff', 63, 0.02);
      // Iglu
      const ix = w * 0.72, iy = h * 0.9;
      g.fillStyle = '#f4fbff';
      g.beginPath();
      g.arc(ix, iy, 34, Math.PI, 0);
      g.fill();
      g.strokeStyle = '#a8c8e0';
      g.lineWidth = 1.5;
      for (let k = 1; k < 3; k++) {
        g.beginPath();
        g.arc(ix, iy, 34, Math.PI + k * 0.3, -k * 0.3);
        g.stroke();
      }
      g.fillStyle = '#20324a';
      g.beginPath();
      g.arc(ix + 14, iy, 11, Math.PI, 0);
      g.fill();
      glow(g, ix + 14, iy - 4, 30, 'rgba(255,200,100,0.5)');
    }
  },
  {
    name: 'Weltall', amb: 'space',
    plat: { base: '#5a5f73', top: '#a7b0cc', line: '#14161f', lights: true },
    draw(g, w, h) {
      g.fillStyle = vgrad(g, 0, h, ['#000005', '#0a0630', '#1d0b45']);
      g.fillRect(0, 0, w, h);
      glow(g, w * 0.25, h * 0.3, 180, 'rgba(160,60,255,0.25)');
      glow(g, w * 0.8, h * 0.6, 160, 'rgba(40,120,255,0.22)');
      glow(g, w * 0.5, h * 0.15, 120, 'rgba(255,80,160,0.15)');
      stars(g, w, h, 220, 71, 1);
      // Ringplanet
      const px = w * 0.72, py = h * 0.27;
      g.strokeStyle = 'rgba(255,220,170,0.75)';
      g.lineWidth = 5;
      g.beginPath();
      g.ellipse(px, py, 78, 18, -0.35, Math.PI, Math.PI * 2);
      g.stroke();
      const pg = g.createRadialGradient(px - 15, py - 15, 5, px, py, 46);
      pg.addColorStop(0, '#ffd59a');
      pg.addColorStop(1, '#d9662f');
      g.fillStyle = pg;
      circle(g, px, py, 44);
      g.beginPath();
      g.ellipse(px, py, 78, 18, -0.35, 0, Math.PI);
      g.stroke();
      // kleiner Mond
      g.fillStyle = '#c8c8d8';
      circle(g, w * 0.18, h * 0.12, 16);
      g.fillStyle = '#a0a0b8';
      circle(g, w * 0.18 - 5, h * 0.12 - 3, 4);
      // Erde unten
      const eg = g.createRadialGradient(w * 0.5, h * 1.3, h * 0.2, w * 0.5, h * 1.3, h * 0.5);
      eg.addColorStop(0, '#2d7dd2');
      eg.addColorStop(0.9, '#1b4fa0');
      eg.addColorStop(1, '#7fc8ff');
      g.fillStyle = eg;
      circle(g, w * 0.5, h * 1.3, h * 0.5);
      g.fillStyle = '#3fae5a';
      g.beginPath();
      g.ellipse(w * 0.35, h * 0.88, 50, 16, 0.2, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(w * 0.7, h * 0.92, 40, 14, -0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
];

// Hintergründe werden einmal in ein unsichtbares Canvas gemalt (spart Leistung)
const bgCache = new Map();
function getBg(i) {
  if (bgCache.has(i)) return bgCache.get(i);
  const bs = Math.min(scale, 2.5);
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * bs);
  c.height = Math.ceil(H * bs);
  const g = c.getContext('2d');
  g.scale(bs, bs);
  THEMES[i].draw(g, W, H);
  bgCache.set(i, c);
  if (bgCache.size > 3) bgCache.delete(bgCache.keys().next().value);
  return c;
}

// Feste Zufallspositionen für bewegte Deko
const ambR = rng(99);
const AMB = Array.from({ length: 70 }, () => ({ x: ambR(), y: ambR(), s: ambR(), p: ambR() * 6.28 }));

function drawAmbient(type, t, cam) {
  const up = -cam;
  ctx.save();
  switch (type) {
    case 'beach':
    case 'sky': {
      ctx.fillStyle = type === 'beach' ? 'rgba(255,215,225,0.75)' : 'rgba(255,255,255,0.85)';
      const n = type === 'beach' ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const a = AMB[i];
        const x = wrapMod(a.x * W + t * (8 + a.s * 14), W + 180) - 120;
        const y = wrapMod(a.y * H + up * (0.15 + a.s * 0.2), H + 120) - 60;
        cloud(ctx, x, y, 0.5 + a.s * 0.6);
      }
      if (type === 'beach') {
        ctx.strokeStyle = 'rgba(60,30,60,0.7)';
        ctx.lineWidth = 2;
        for (let i = 10; i < 14; i++) {
          const a = AMB[i];
          const x = wrapMod(a.x * W + t * 30, W + 40) - 20;
          const y = wrapMod(a.y * H * 0.6 + up * 0.3, H);
          const f = Math.sin(t * 6 + a.p) * 3;
          ctx.beginPath();
          ctx.moveTo(x - 7, y - f);
          ctx.quadraticCurveTo(x - 3, y - 4, x, y);
          ctx.quadraticCurveTo(x + 3, y - 4, x + 7, y - f);
          ctx.stroke();
        }
      }
      break;
    }
    case 'forest': {
      for (let i = 0; i < 30; i++) {
        const a = AMB[i];
        const x = wrapMod(a.x * W + Math.sin(t * 0.6 + a.p) * 22, W);
        const y = wrapMod(a.y * H + up * (0.2 + a.s * 0.4) + Math.cos(t * 0.8 + a.p) * 16, H);
        const fl = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + a.p));
        glow(ctx, x, y, 9, `rgba(255,240,120,${0.45 * fl})`);
        ctx.fillStyle = `rgba(255,255,190,${fl})`;
        circle(ctx, x, y, 1.8);
      }
      break;
    }
    case 'snow': {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 60; i++) {
        const a = AMB[i];
        const x = wrapMod(a.x * W + Math.sin(t + a.p) * 12, W);
        const y = wrapMod(a.y * H + t * (25 + a.s * 45) + up * (0.3 + a.s * 0.4), H);
        circle(ctx, x, y, 1.2 + a.s * 2);
      }
      break;
    }
    case 'desert': {
      ctx.fillStyle = 'rgba(255,220,170,0.5)';
      for (let i = 0; i < 35; i++) {
        const a = AMB[i];
        const x = wrapMod(a.x * W + t * (20 + a.s * 40), W);
        const y = wrapMod(a.y * H + up * (0.2 + a.s * 0.3) + Math.sin(t + a.p) * 6, H);
        circle(ctx, x, y, 1 + a.s * 1.3);
      }
      break;
    }
    case 'candy': {
      const cols = ['#ff5a8a', '#ffd23f', '#6be3c8', '#9b6bff', '#4dc3ff'];
      ctx.lineWidth = 2;
      for (let i = 0; i < 20; i++) {
        const a = AMB[i];
        const x = wrapMod(a.x * W + Math.sin(t * 0.8 + a.p) * 14, W);
        const y = wrapMod(a.y * H - t * (15 + a.s * 25) + up * 0.35, H + 40) - 20;
        ctx.strokeStyle = cols[i % cols.length];
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(x, y, 4 + a.s * 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        circle(ctx, x - 2 - a.s * 2, y - 2 - a.s * 2, 1.5);
      }
      break;
    }
    case 'aurora':
    case 'space': {
      for (let i = 0; i < 40; i++) {
        const a = AMB[i];
        const x = a.x * W;
        const y = wrapMod(a.y * H + up * (0.05 + a.s * 0.15), H);
        const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * (1 + a.s * 2) + a.p));
        ctx.fillStyle = `rgba(255,255,255,${tw})`;
        circle(ctx, x, y, 0.8 + a.s * 1.4);
      }
      // Sternschnuppe
      const cyc = t % 6;
      if (cyc < 0.8) {
        const k = cyc / 0.8;
        const sx = lerp(W * 0.9, W * 0.2, k), sy = lerp(H * 0.05, H * 0.3, k);
        const gr = ctx.createLinearGradient(sx, sy, sx + 60, sy - 20);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = gr;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 60, sy - 20);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

// ---------- Speicher (lokal im Browser) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } }
};
let best = store.get('porkjump_best', 0);
let soundOn = store.get('porkjump_sound', true);

/* =========================================================
   SOUND – alles live erzeugt, keine Sounddateien nötig
   ========================================================= */
const Sound = {
  ac: null,
  buzzNodes: null,
  init() {
    if (!this.ac) {
      try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (this.ac.state === 'suspended') this.ac.resume();
  },
  tone(f0, f1, dur, type, vol, delay = 0) {
    if (!soundOn || !this.ac) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator();
    const gn = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn).connect(this.ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  jump() { this.tone(330, 700, 0.13, 'square', 0.06); },
  boing() { this.tone(140, 900, 0.45, 'triangle', 0.22); this.tone(280, 1400, 0.3, 'sine', 0.08, 0.05); },
  pickup() { [660, 880, 1320].forEach((f, i) => this.tone(f, f * 1.01, 0.12, 'square', 0.05, i * 0.07)); },
  expire() { this.tone(600, 200, 0.25, 'triangle', 0.1); },
  death() { this.tone(520, 70, 0.9, 'sawtooth', 0.09); },
  click() { this.tone(900, 700, 0.05, 'square', 0.04); },
  startBuzz() {
    if (!soundOn || !this.ac || this.buzzNodes) return;
    const o = this.ac.createOscillator();
    const lfo = this.ac.createOscillator();
    const lg = this.ac.createGain();
    const gn = this.ac.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 190;
    lfo.frequency.value = 28;
    lg.gain.value = 25;
    gn.gain.value = 0.035;
    lfo.connect(lg).connect(o.frequency);
    o.connect(gn).connect(this.ac.destination);
    o.start();
    lfo.start();
    this.buzzNodes = [o, lfo];
  },
  stopBuzz() {
    if (!this.buzzNodes) return;
    this.buzzNodes.forEach(n => { try { n.stop(); } catch (e) { /* schon gestoppt */ } });
    this.buzzNodes = null;
  }
};

/* =========================================================
   SPIELZUSTAND
   ========================================================= */
let state = 'menu';          // 'menu' | 'playing' | 'paused' | 'over'
let platforms = [];
let particles = [];
let popups = [];
let player = null;
let camY = 0;                // Welt-Y der oberen Bildschirmkante
let startY = 0;              // Welt-Y der Startplattform
let topY = 0;                // höchste erzeugte Plattform
let itemCooldown = 0;
let gameT = 0;               // Spielzeit (steht bei Pause)
let menuT = 0;
let meters = 0;
const input = { left: false, right: false };

function newPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, facing: 1,
    minY: y, squash: 0, spin: 0, spinV: 0,
    shoes: 0, bee: 0
  };
}

const altAt = y => (startY - y) / PX_PER_M;            // Welt-Y -> Meter
const themeAt = m => Math.floor(Math.max(0, m) / THEME_LEN) % THEMES.length;

function addPlatform(x, y, w, d, allowItem) {
  const p = { x, y, w, h: 14, vx: 0, theme: themeAt(altAt(y)), item: null };
  if (Math.random() < lerp(0, 0.38, d) && altAt(y) > 40) {
    p.vx = rand(40, lerp(60, 130, d)) * (Math.random() < 0.5 ? -1 : 1);
  }
  if (allowItem && itemCooldown <= 0 && altAt(y) > 15) {
    const r = Math.random();
    let type = null;
    if (r < 0.055) type = 'tramp';
    else if (r < 0.08) type = 'shoes';
    else if (r < 0.095) type = 'bee';
    if (type) {
      p.item = { type, ox: type === 'tramp' ? rand(18, w - 18) : w / 2, squish: 0 };
      itemCooldown = 4;
    }
  }
  itemCooldown--;
  platforms.push(p);
  return p;
}

// Neue Plattformen oberhalb des Bildschirms erzeugen
function genPlatforms() {
  while (topY > camY - 250) {
    const d = clamp(altAt(topY) / 1800, 0, 1);         // Schwierigkeit 0..1
    const minGap = lerp(45, 90, d);
    const maxGap = lerp(115, JUMP_H * 0.86, d);
    let r = Math.random();
    if (Math.random() < 0.18) r *= 0.3;                // ab und zu eine leichte Stelle
    const gap = minGap + Math.pow(r, lerp(1.5, 0.7, d)) * (maxGap - minGap);
    topY -= gap;
    const w = lerp(86, 58, d) + rand(-6, 6);
    addPlatform(rand(4, W - w - 4), topY, w, d, true);
    // In leichten Phasen gibt's manchmal eine Bonus-Plattform daneben
    if (Math.random() < lerp(0.3, 0.08, d)) {
      const y2 = topY + rand(-20, 20);
      addPlatform(rand(4, W - w - 4), y2, w, d, false);
    }
  }
  platforms = platforms.filter(p => p.y < camY + H + 80);
}

/* ---------- Physik für die Spielfigur ---------- */
function stepPlayer(p, dt, useInput) {
  const dir = useInput ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
  if (dir) {
    p.vx = clamp(p.vx + dir * ACCEL * dt, -MAX_VX, MAX_VX);
    p.facing = dir;
  } else {
    p.vx -= p.vx * Math.min(1, FRICTION * dt);
  }
  p.x += p.vx * dt;
  if (p.x < 0) p.x += W;           // links raus = rechts rein
  if (p.x > W) p.x -= W;

  const prevY = p.y;
  if (p.bee > 0) {
    p.vy = -BEE_V;
    p.bee -= dt;
    if (p.bee <= 0) {
      p.bee = 0;
      p.vy = -JUMP_V * 0.8;
      Sound.stopBuzz();
      Sound.expire();
    }
  } else {
    p.vy = Math.min(p.vy + G * dt, MAX_FALL);
  }
  p.y += p.vy * dt;

  if (p.shoes > 0) {
    p.shoes -= dt;
    if (p.shoes <= 0) {
      p.shoes = 0;
      Sound.expire();
      puff(p.x, p.y, '#cfd8e3', 10);
    }
  }

  p.squash = Math.max(0, p.squash - dt * 5);
  if (p.spinV) {
    p.spin += p.spinV * dt;
    if (p.spin >= Math.PI * 2) { p.spin = 0; p.spinV = 0; }
  }

  // Landen (nur beim Fallen, nur von oben)
  if (p.bee <= 0 && p.vy > 0) {
    for (const pl of platforms) {
      if (prevY <= pl.y && p.y >= pl.y && p.x + 13 > pl.x && p.x - 13 < pl.x + pl.w) {
        land(p, pl);
        break;
      }
    }
  }
}

function land(p, pl) {
  p.y = pl.y;
  let v = JUMP_V * (p.shoes > 0 ? SHOE_MUL : 1);
  const it = pl.item;
  if (it && it.type === 'tramp' && Math.abs(p.x - (pl.x + it.ox)) < 24) {
    v *= TRAMP_MUL;
    it.squish = 1;
    p.spinV = Math.PI * 2 / 0.9;
    p.spin = 0.0001;
    Sound.boing();
    popup(p.x, p.y - 70, 'BOING!', '#ffd23f');
  } else {
    Sound.jump();
  }
  p.vy = -v;
  p.squash = 1;
  puff(p.x, p.y, 'rgba(255,255,255,0.9)', 5);
}

function checkPickups(p) {
  for (const pl of platforms) {
    const it = pl.item;
    if (!it || it.type === 'tramp') continue;
    const ix = pl.x + it.ox, iy = pl.y - 18;
    if (Math.abs(p.x - ix) < 26 && iy > p.y - 62 && iy < p.y + 10) {
      pl.item = null;
      Sound.pickup();
      sparkle(ix, iy);
      if (it.type === 'shoes') {
        p.shoes = SHOE_TIME;
        popup(ix, iy - 30, 'Federschuhe!', '#6ee7ff');
      } else {
        p.bee = BEE_TIME;
        p.spin = 0; p.spinV = 0;
        Sound.startBuzz();
        popup(ix, iy - 30, 'Bienen-Taxi!', '#ffd23f');
      }
    }
  }
}

/* ---------- Partikel & Text-Popups ---------- */
function puff(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    particles.push({ x: x + rand(-10, 10), y, vx: rand(-70, 70), vy: rand(-60, -10), life: 0.4, max: 0.4, r: rand(2, 4), color });
  }
}
function sparkle(x, y) {
  const cols = ['#ffd23f', '#ff8fb1', '#6ee7ff', '#ffffff'];
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(60, 180);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, r: rand(2, 4), color: cols[i % 4] });
  }
}
function popup(x, y, text, color) {
  popups.push({ x: clamp(x, 70, W - 70), y, text, color, life: 1 });
}
function updateFx(dt) {
  for (const q of particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; q.life -= dt; }
  particles = particles.filter(q => q.life > 0);
  for (const q of popups) { q.y -= 40 * dt; q.life -= dt; }
  popups = popups.filter(q => q.life > 0);
}

/* ---------- Haupt-Update während der Runde ---------- */
function update(dt) {
  gameT += dt;
  for (const pl of platforms) {
    if (pl.vx) {
      pl.x += pl.vx * dt;
      if (pl.x < 2) { pl.x = 2; pl.vx *= -1; }
      if (pl.x + pl.w > W - 2) { pl.x = W - 2 - pl.w; pl.vx *= -1; }
    }
    if (pl.item && pl.item.squish > 0) pl.item.squish = Math.max(0, pl.item.squish - dt * 4);
  }
  stepPlayer(player, dt, true);
  checkPickups(player);
  updateFx(dt);

  // Kamera klettert nur nach oben mit
  const target = player.y - H * 0.45;
  if (target < camY) camY = target;
  genPlatforms();

  player.minY = Math.min(player.minY, player.y);
  meters = Math.max(0, Math.floor((startY - player.minY) / PX_PER_M));

  if (player.y - camY > H + 70) gameOver();
}

/* =========================================================
   ZEICHNEN
   ========================================================= */
function drawPlatform(pl) {
  const th = THEMES[pl.theme].plat;
  const { x, y, w, h } = pl;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = th.line;
  ctx.fillStyle = th.base;
  rr(ctx, x, y, w, h, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = th.top;
  rr(ctx, x + 1.5, y + 1, w - 3, 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  rr(ctx, x + 6, y + 2.5, Math.min(18, w * 0.25), 2, 1);
  ctx.fill();
  if (th.sprinkles) {
    const cols = ['#ff5a5a', '#4dc3ff', '#ffe14d', '#6be36b'];
    for (let i = 0; i < w / 10; i++) {
      ctx.fillStyle = cols[i % 4];
      ctx.fillRect(x + 6 + i * 10, y + 3 + (i % 2) * 2, 4, 1.6);
    }
  }
  if (th.lights) {
    for (let i = 0; i < w / 14; i++) {
      ctx.fillStyle = (Math.floor(gameT * 4 + i) % 2) ? '#5dff9a' : '#2a6b4a';
      circle(ctx, x + 8 + i * 14, y + 10, 1.8);
    }
  }
  if (pl.vx) {
    ctx.strokeStyle = th.line;
    ctx.lineWidth = 2;
    const cy = y + 10;
    ctx.beginPath();
    ctx.moveTo(x + 9, cy - 3); ctx.lineTo(x + 5, cy); ctx.lineTo(x + 9, cy + 3);
    ctx.moveTo(x + w - 9, cy - 3); ctx.lineTo(x + w - 5, cy); ctx.lineTo(x + w - 9, cy + 3);
    ctx.stroke();
  }
  if (pl.item) drawItem(pl);
}

function drawItem(pl) {
  const it = pl.item;
  const x = pl.x + it.ox, y = pl.y;
  const OL = '#2a1520';
  ctx.lineWidth = 2;
  ctx.strokeStyle = OL;
  if (it.type === 'tramp') {
    const sq = it.squish * 5;
    ctx.fillStyle = '#e63946';
    ctx.fillRect(x - 17, y - 4, 4, 4);
    ctx.fillRect(x + 13, y - 4, 4, 4);
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      ctx.moveTo(x - 10 + k * 7, y - 2);
      ctx.lineTo(x - 7 + k * 7, y - 9 + sq);
    }
    ctx.stroke();
    ctx.strokeStyle = OL;
    ctx.fillStyle = '#e63946';
    rr(ctx, x - 19, y - 12 + sq, 38, 5, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1d1d2b';
    ctx.beginPath();
    ctx.ellipse(x, y - 12 + sq + (sq ? 2 : 0), 14, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (it.type === 'shoes') {
    const by = y - 14 + Math.sin(gameT * 4 + pl.x) * 3;
    glow(ctx, x, by, 26, 'rgba(110,231,255,0.45)');
    for (const dx of [-8, 7]) {
      ctx.strokeStyle = '#9aa5b5';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k <= 4; k++) ctx.lineTo(x + dx + (k % 2 ? 3 : -3), by + 2 + k * 2);
      ctx.stroke();
      ctx.strokeStyle = OL;
      ctx.lineWidth = 2;
      ctx.fillStyle = '#ff3b5c';
      rr(ctx, x + dx - 6, by - 6, 13, 8, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + dx - 5, by, 11, 2);
    }
  } else if (it.type === 'bee') {
    const by = y - 24 + Math.sin(gameT * 3 + pl.x) * 4;
    drawBee(x + Math.sin(gameT * 1.7) * 6, by, 0.8, 1);
  }
}

function drawBee(x, y, s, facing) {
  const OL = '#2a1520';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * facing, s);
  const flap = Math.sin(gameT * 50 + menuT * 50) * 0.5;
  ctx.fillStyle = 'rgba(220,245,255,0.8)';
  ctx.strokeStyle = 'rgba(42,21,32,0.6)';
  ctx.lineWidth = 1.5;
  for (const dx of [-5, 5]) {
    ctx.save();
    ctx.translate(dx, -10);
    ctx.rotate((dx < 0 ? -0.4 : 0.4) + (dx < 0 ? -flap : flap));
    ctx.beginPath();
    ctx.ellipse(0, -9, 7, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = OL;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#2a1520';
  ctx.fillRect(-7, -14, 5, 28);
  ctx.fillRect(3, -14, 5, 28);
  ctx.restore();
  ctx.stroke();
  ctx.fillStyle = OL;
  ctx.beginPath();
  ctx.moveTo(-17, -2); ctx.lineTo(-24, 0); ctx.lineTo(-17, 3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  circle(ctx, 11, -3, 4);
  ctx.fillStyle = OL;
  circle(ctx, 12.5, -3, 2);
  ctx.beginPath();
  ctx.moveTo(10, -11); ctx.quadraticCurveTo(14, -20, 18, -18);
  ctx.stroke();
  ctx.restore();
}

// John Pork: Schweinekopf auf Menschenkörper, Comic-Style
function drawPork(p, x) {
  const OL = '#3b1d2a';
  const SKIN = '#f7b3c2';
  const f = p.facing;
  const armsUp = p.bee > 0 || p.vy < -250;
  ctx.save();
  ctx.translate(x, p.y);
  const sq = p.squash;
  ctx.scale(1 + 0.16 * sq, 1 - 0.16 * sq);
  if (p.spin) {
    ctx.translate(0, -32);
    ctx.rotate(p.spin * f);
    ctx.translate(0, 32);
  }
  const lift = p.shoes > 0 ? 9 : 0;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Federn unter den Schuhen
  if (lift) {
    ctx.strokeStyle = '#9aa5b5';
    ctx.lineWidth = 2;
    for (const dx of [-6, 6]) {
      ctx.beginPath();
      for (let k = 0; k <= 5; k++) ctx.lineTo(dx + (k % 2 ? 3.5 : -3.5), -lift + k * (lift / 5));
      ctx.stroke();
    }
  }
  ctx.translate(0, -lift);
  ctx.strokeStyle = OL;
  ctx.lineWidth = 2.5;
  // Beine (Jeans)
  ctx.fillStyle = '#3d6db5';
  rr(ctx, -10, -15, 8, 12, 3); ctx.fill(); ctx.stroke();
  rr(ctx, 2, -15, 8, 12, 3); ctx.fill(); ctx.stroke();
  // Schuhe
  ctx.fillStyle = lift ? '#ff3b5c' : '#f2f2f2';
  for (const dx of [-6, 6]) {
    ctx.beginPath();
    ctx.ellipse(dx + f * 1.5, -2.5, 6.5, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Arme (erst Outline, dann Haut)
  const arms = armsUp
    ? [[-10, -28, -17, -46], [10, -28, 17, -46]]
    : [[-10, -28, -18, -17], [10, -28, 18, -17]];
  for (const [ax, ay, bx, by] of arms) {
    ctx.strokeStyle = OL;
    ctx.lineWidth = 7.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = SKIN;
    ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.strokeStyle = OL;
  ctx.lineWidth = 2.5;
  // T-Shirt
  ctx.fillStyle = '#ffffff';
  rr(ctx, -12, -33, 24, 21, 7);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#d9d0d5';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -33, 5, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.strokeStyle = OL;
  ctx.lineWidth = 2.5;
  // Ohren
  const ear = (ex, dir) => {
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.moveTo(ex - 7 * dir, -56);
    ctx.lineTo(ex + 5 * dir, -70);
    ctx.lineTo(ex + 8 * dir, -52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8869e';
    ctx.beginPath();
    ctx.moveTo(ex - 2 * dir, -56);
    ctx.lineTo(ex + 4 * dir, -65);
    ctx.lineTo(ex + 6 * dir, -55);
    ctx.closePath();
    ctx.fill();
  };
  ear(-11, -1);
  ear(11, 1);
  // Kopf
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.ellipse(0, -48, 18, 16.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Bäckchen
  ctx.fillStyle = 'rgba(242,120,150,0.45)';
  circle(ctx, -11 + f * 3, -42, 3.5);
  circle(ctx, 11 + f * 3, -42, 3.5);
  // Augen
  for (const ex of [-6, 5]) {
    const cx = ex + f * 3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx, -52, 4.2, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = '#1a0d14';
    circle(ctx, cx + f * 1.3, -51.5, 2.1);
    ctx.fillStyle = '#fff';
    circle(ctx, cx + f * 1.3 - 0.8, -52.5, 0.7);
  }
  // Augenbrauen (leicht smug)
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-10 + f * 3, -59); ctx.lineTo(-3 + f * 3, -58);
  ctx.moveTo(2 + f * 3, -58); ctx.lineTo(9 + f * 3, -60);
  ctx.stroke();
  // Rüssel
  ctx.lineWidth = 2.3;
  ctx.fillStyle = '#f590a8';
  ctx.beginPath();
  ctx.ellipse(f * 7, -43, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#8a3350';
  ctx.beginPath();
  ctx.ellipse(f * 7 - 3, -43, 1.5, 2.4, 0, 0, Math.PI * 2);
  ctx.ellipse(f * 7 + 3, -43, 1.5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mund
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(f * 5, -36, 4, 0.25, Math.PI - 0.6);
  ctx.stroke();
  ctx.restore();

  // Biene trägt ihn
  if (p.bee > 0) {
    const by = p.y - 82 + Math.sin(gameT * 12) * 2;
    ctx.strokeStyle = '#2a1520';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 17, p.y - 47); ctx.lineTo(x - 4, by + 10);
    ctx.moveTo(x + 17, p.y - 47); ctx.lineTo(x + 4, by + 10);
    ctx.stroke();
    drawBee(x, by, 1.3, f);
  }
}

function drawPlayerWrapped(p) {
  drawPork(p, p.x);
  if (p.x < 30) drawPork(p, p.x + W);
  if (p.x > W - 30) drawPork(p, p.x - W);
}

function drawBackground(t) {
  // Welt hängt davon ab, wie hoch die Kamera ist; Übergang über 40 m
  const m = Math.max(0, altAt(camY + H * 0.5));
  const seg = Math.floor(m / THEME_LEN);
  const i = seg % THEMES.length;
  const j = (seg + 1) % THEMES.length;
  const frac = (m % THEME_LEN) - (THEME_LEN - 40);
  ctx.drawImage(getBg(i), 0, 0, W, H);
  drawAmbient(THEMES[i].amb, t, camY);
  if (frac > 0) {
    const a = frac / 40;
    ctx.globalAlpha = a;
    ctx.drawImage(getBg(j), 0, 0, W, H);
    drawAmbient(THEMES[j].amb, t, camY);
    ctx.globalAlpha = 1;
  } else if (state === 'playing' && m % THEME_LEN > THEME_LEN - 120) {
    getBg(j); // nächste Welt schon mal vorbereiten
  }
}

function drawBestLine() {
  if (best <= 0) return;
  const y = startY - best * PX_PER_M;
  if (y < camY - 20 || y > camY + H + 20) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,210,63,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '16px "Luckiest Guy", sans-serif';
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#3b1d2a';
  ctx.lineWidth = 3;
  ctx.textAlign = 'right';
  ctx.strokeText(`Rekord ${best} m`, W - 10, y - 6);
  ctx.fillText(`Rekord ${best} m`, W - 10, y - 6);
  ctx.restore();
}

function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const t = state === 'menu' ? menuT : gameT;
  drawBackground(t);

  ctx.save();
  ctx.translate(0, -camY);
  if (state !== 'menu') drawBestLine();
  for (const pl of platforms) drawPlatform(pl);
  for (const q of particles) {
    ctx.globalAlpha = q.life / q.max;
    ctx.fillStyle = q.color;
    circle(ctx, q.x, q.y, q.r);
  }
  ctx.globalAlpha = 1;
  if (player) drawPlayerWrapped(player);
  ctx.textAlign = 'center';
  ctx.font = '22px "Luckiest Guy", sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#3b1d2a';
  for (const q of popups) {
    ctx.globalAlpha = Math.min(1, q.life * 2);
    ctx.fillStyle = q.color;
    ctx.strokeText(q.text, q.x, q.y);
    ctx.fillText(q.text, q.x, q.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* =========================================================
   MENÜ-DEMO: Pork hüpft im Hauptmenü
   ========================================================= */
function initDemo() {
  camY = 0;
  startY = H;
  platforms = [{ x: 28, y: H * 0.84, w: 84, h: 14, vx: 0, theme: 0, item: null }];
  particles = [];
  popups = [];
  player = newPlayer(70, H * 0.84);
  player.vy = -JUMP_V * 0.8;
}
function updateDemo(dt) {
  menuT += dt;
  gameT += dt;
  const p = player;
  const prevY = p.y;
  p.vy += G * dt;
  p.y += p.vy * dt;
  p.squash = Math.max(0, p.squash - dt * 5);
  const pl = platforms[0];
  if (prevY <= pl.y && p.y >= pl.y) {
    p.y = pl.y;
    p.vy = -JUMP_V * 0.8;
    p.squash = 1;
    if (Math.random() < 0.3) p.facing *= -1;
  }
}

/* =========================================================
   ABLAUF: Start, Pause, Game Over
   ========================================================= */
const $ = id => document.getElementById(id);
const el = {
  menu: $('menu'), hud: $('hud'), meters: $('meters'),
  pause: $('pause'), over: $('over'), settings: $('settings'),
  btnPause: $('btnPause'), left: $('btnLeft'), right: $('btnRight'),
  bestVal: $('bestVal'), overScore: $('overScore'), overBest: $('overBest'),
  puShoes: $('puShoes'), puBee: $('puBee')
};
const show = (e, on) => e.classList.toggle('hidden', !on);

function setPlayUi(on) {
  show(el.hud, on);
  show(el.btnPause, on);
  show(el.left, on);
  show(el.right, on);
}

function startGame() {
  Sound.stopBuzz();
  platforms = [];
  particles = [];
  popups = [];
  camY = 0;
  gameT = 0;
  meters = 0;
  itemCooldown = 3;
  startY = H - 70;
  platforms.push({ x: W / 2 - 70, y: startY, w: 140, h: 14, vx: 0, theme: 0, item: null });
  topY = startY;
  genPlatforms();
  player = newPlayer(W / 2, startY);
  player.vy = -JUMP_V;
  input.left = input.right = false;
  state = 'playing';
  acc = 0;
  show(el.menu, false);
  show(el.over, false);
  show(el.pause, false);
  show(el.settings, false);
  el.btnPause.classList.remove('active');
  setPlayUi(true);
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  Sound.stopBuzz();
  show(el.pause, true);
  el.btnPause.classList.add('active');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  last = null;
  input.left = input.right = false;
  show(el.pause, false);
  el.btnPause.classList.remove('active');
  if (player.bee > 0) Sound.startBuzz();
}

function gameOver() {
  state = 'over';
  Sound.stopBuzz();
  Sound.death();
  const isRecord = meters > best;
  if (isRecord) {
    best = meters;
    store.set('porkjump_best', best);
  }
  setPlayUi(false);
  el.overScore.textContent = `${meters} m`;
  el.overBest.textContent = isRecord ? 'Neuer Rekord!' : `Rekord: ${best} m`;
  el.overBest.classList.toggle('record', isRecord);
  setTimeout(() => { if (state === 'over') show(el.over, true); }, 450);
}

function toMenu() {
  Sound.stopBuzz();
  state = 'menu';
  setPlayUi(false);
  show(el.pause, false);
  show(el.over, false);
  show(el.menu, true);
  el.bestVal.textContent = `${best} m`;
  initDemo();
}

function updateHud() {
  if (state !== 'playing' && state !== 'paused') return;
  const txt = `${meters} m`;
  if (el.meters.textContent !== txt) el.meters.textContent = txt;
  const pu = (e, v, max) => {
    show(e, v > 0);
    if (v > 0) {
      e.querySelector('i').style.width = `${(v / max) * 100}%`;
      e.classList.toggle('blink', v < 3);
    }
  };
  pu(el.puShoes, player.shoes, SHOE_TIME);
  pu(el.puBee, player.bee, BEE_TIME);
}

function refreshSoundButtons() {
  document.querySelectorAll('.soundToggle').forEach(b => {
    b.textContent = `Sound: ${soundOn ? 'An' : 'Aus'}`;
    b.classList.toggle('off', !soundOn);
  });
}

/* ---------- Eingaben ---------- */
function tap(id, fn) {
  $(id).addEventListener('click', e => { e.preventDefault(); Sound.init(); Sound.click(); fn(); });
}
tap('btnStart', startGame);
tap('btnRetry', startGame);
tap('btnOverMenu', toMenu);
tap('btnToMenu', toMenu);
tap('btnResume', resumeGame);
tap('btnGear', () => show(el.settings, true));
tap('btnCloseSettings', () => show(el.settings, false));
el.btnPause.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sound.init();
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
});
document.querySelectorAll('.soundToggle').forEach(b => b.addEventListener('click', e => {
  e.preventDefault();
  soundOn = !soundOn;
  store.set('porkjump_sound', soundOn);
  refreshSoundButtons();
  Sound.init();
  Sound.click();
}));

// Links/Rechts-Buttons: gedrückt halten = bewegen (Multitouch-fähig)
function holdButton(btn, key) {
  const ids = new Set();
  const upd = () => { input[key] = ids.size > 0; btn.classList.toggle('pressed', ids.size > 0); };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sound.init();
    ids.add(e.pointerId);
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    upd();
  });
  const end = e => { ids.delete(e.pointerId); upd(); };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('lostpointercapture', end);
  btn.addEventListener('contextmenu', e => e.preventDefault());
}
holdButton(el.left, 'left');
holdButton(el.right, 'right');

// Tastatur (für den PC)
const keyMap = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
window.addEventListener('keydown', e => {
  if (keyMap[e.key]) { input[keyMap[e.key]] = true; e.preventDefault(); }
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame();
  }
  if ((e.key === 'Enter' || e.key === ' ') && (state === 'menu' || state === 'over')) {
    Sound.init();
    startGame();
  }
});
window.addEventListener('keyup', e => { if (keyMap[e.key]) input[keyMap[e.key]] = false; });

// App in den Hintergrund -> automatisch Pause
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
window.addEventListener('resize', resize);

/* ---------- Game Loop ---------- */
let last = null;
let acc = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (last === null) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (state === 'playing') {
    acc += dt;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
      if (state !== 'playing') { acc = 0; break; }
    }
  } else if (state === 'menu') {
    updateDemo(dt);
  } else if (state === 'over') {
    updateFx(dt);
  }
  render();
  updateHud();
}

resize();
el.bestVal.textContent = `${best} m`;
refreshSoundButtons();
initDemo();
requestAnimationFrame(frame);
// Wenn die Comic-Schrift geladen ist, einmal neu zeichnen lassen
if (document.fonts) document.fonts.ready.then(() => bgCache.clear());
