'use strict';

/* =========================================================
   PORK JUMP – Doodle-Jump-artiges Hochkant-Spiel
   Alles wird auf ein <canvas> gezeichnet. Die Spielwelt ist
   immer 400 Einheiten breit, die Höhe passt sich dem Handy an.
   ========================================================= */

// ---------- Spiel-Konstanten (hier kann man am Gameplay drehen) ----------
const VERSION = '2.0';
const W = 400;               // logische Breite der Welt
const G = 1800;                // Schwerkraft (Einheiten/s²)
const JUMP_V = 900;            // Absprung-Geschwindigkeit
const JUMP_H = JUMP_V * JUMP_V / (2 * G); // max. Sprunghöhe (225)
const MAX_VX = 420;            // max. Seitwärts-Tempo
const ACCEL = 2600;            // wie schnell man seitlich beschleunigt
const FRICTION = 7;            // wie schnell man seitlich abbremst
const MAX_FALL = 1400;
const PX_PER_M = 25;           // 25 Einheiten = 1 Meter
const THEME_LEN = 400;         // alle 400 m eine neue Welt
const TRAMP_MUL = 1.9;         // Trampolin: Absprung x1.9 (~3.6x so hoch)
const SHOE_MUL = Math.SQRT2;   // Federschuhe: doppelte Sprunghöhe
const SHOE_TIME = 15;
const BEE_TIME = 3;
const BEE_V = 700;             // Biene trägt einen mit diesem Tempo hoch
const CALL_DIST = 5 * BEE_V * BEE_TIME; // Handy-Heli: 5x so weit wie die Biene (420 m)
const CALL_SPEED = 2800;       // Höchsttempo am Heli-Seil
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
  bgJob = null;
  if (state === 'menu') initDemo();
}

// ---------- Hilfsfunktionen ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
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
    name: 'Strand bei Sonnenaufgang', amb: 'beach',
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
    name: 'Zauberwald', amb: 'forest',
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
    name: 'Verschneite Berge', amb: 'snow',
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
    name: 'Canyon bei Sonnenuntergang', amb: 'desert',
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
    name: 'Land der Süßigkeiten', amb: 'candy',
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
    name: 'Polarlichter bei Nacht', amb: 'aurora',
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

/* ---------- Neue Welten (v1.1) ---------- */

function pagoda(g, x, y, s) {
  let base = y;
  for (let i = 0; i < 3; i++) {
    const bw = (30 - i * 6) * s, bh = 20 * s;
    g.fillStyle = '#c0152f';
    g.fillRect(x - bw, base - bh, bw * 2, bh);
    g.fillStyle = '#7a0d1e';
    for (let k = -1; k <= 1; k += 2) g.fillRect(x + k * bw * 0.85 - 2 * s, base - bh, 4 * s, bh);
    g.fillStyle = '#ffcf6b';
    for (let k = -1; k <= 1; k++) g.fillRect(x + k * bw * 0.45 - 3 * s, base - bh * 0.75, 6 * s, bh * 0.45);
    const rw = bw + 12 * s, ty = base - bh;
    g.fillStyle = '#1f4f4a';
    g.beginPath();
    g.moveTo(x - rw - 8 * s, ty - 9 * s);
    g.quadraticCurveTo(x - rw, ty + 2 * s, x - rw * 0.55, ty);
    g.lineTo(x + rw * 0.55, ty);
    g.quadraticCurveTo(x + rw, ty + 2 * s, x + rw + 8 * s, ty - 9 * s);
    g.lineTo(x + rw * 0.35, ty - 16 * s);
    g.lineTo(x - rw * 0.35, ty - 16 * s);
    g.closePath();
    g.fill();
    g.strokeStyle = '#f2c14e';
    g.lineWidth = 2 * s;
    g.beginPath();
    g.moveTo(x - rw - 8 * s, ty - 9 * s);
    g.quadraticCurveTo(x - rw, ty + 2 * s, x - rw * 0.55, ty);
    g.lineTo(x + rw * 0.55, ty);
    g.quadraticCurveTo(x + rw, ty + 2 * s, x + rw + 8 * s, ty - 9 * s);
    g.stroke();
    base = ty - 16 * s;
  }
  g.strokeStyle = '#f2c14e';
  g.lineWidth = 3 * s;
  g.beginPath();
  g.moveTo(x, base);
  g.lineTo(x, base - 22 * s);
  g.stroke();
  g.fillStyle = '#f2c14e';
  circle(g, x, base - 10 * s, 4 * s);
  circle(g, x, base - 18 * s, 3 * s);
}

function lantern(g, x, y, s) {
  glow(g, x, y + 8 * s, 24 * s, 'rgba(255,120,60,0.45)');
  g.strokeStyle = '#3d0610';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y - 6 * s);
  g.lineTo(x, y);
  g.stroke();
  g.fillStyle = '#e8213b';
  g.beginPath();
  g.ellipse(x, y + 8 * s, 8 * s, 9 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f2c14e';
  g.fillRect(x - 4 * s, y, 8 * s, 2 * s);
  g.fillRect(x - 4 * s, y + 15 * s, 8 * s, 2 * s);
  g.strokeStyle = 'rgba(255,220,120,0.6)';
  g.beginPath();
  g.moveTo(x, y + 2 * s);
  g.lineTo(x, y + 15 * s);
  g.stroke();
  g.strokeStyle = '#f2c14e';
  g.beginPath();
  g.moveTo(x, y + 17 * s);
  g.lineTo(x, y + 24 * s);
  g.stroke();
}

// Goldener chinesischer Drache, schlängelt sich durch den Himmel
function dragon(g, w, h) {
  const pts = [];
  for (let i = 0; i <= 70; i++) {
    const t = i / 70;
    pts.push([lerp(w * 1.08, w * 0.16, t), h * 0.34 + Math.sin(t * Math.PI * 2.6) * h * 0.055 - t * h * 0.07]);
  }
  const path = () => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) g.lineTo(p[0], p[1]);
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Rückenstacheln
  g.fillStyle = '#d6332a';
  for (let i = 2; i < 66; i += 3) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0) || 1;
    const tx = (x1 - x0) / L, ty = (y1 - y0) / L;
    let nx = ty, ny = -tx;
    if (ny > 0) { nx = -nx; ny = -ny; }
    g.beginPath();
    g.moveTo(x0 + nx * 7 - tx * 4, y0 + ny * 7 - ty * 4);
    g.lineTo(x0 + nx * 16, y0 + ny * 16);
    g.lineTo(x0 + nx * 7 + tx * 4, y0 + ny * 7 + ty * 4);
    g.closePath();
    g.fill();
  }
  // Beine mit Krallen
  g.strokeStyle = '#c28a12';
  g.lineWidth = 4;
  for (const i of [16, 44]) {
    const [x, y] = pts[i];
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 6, y + 18);
    g.lineTo(x - 13, y + 20);
    g.moveTo(x - 6, y + 18);
    g.lineTo(x - 4, y + 25);
    g.stroke();
  }
  path();
  g.strokeStyle = '#5a3a00';
  g.lineWidth = 21;
  g.stroke();
  const gold = g.createLinearGradient(0, h * 0.25, 0, h * 0.42);
  gold.addColorStop(0, '#ffe27a');
  gold.addColorStop(1, '#d99a16');
  path();
  g.strokeStyle = gold;
  g.lineWidth = 16;
  g.stroke();
  g.save();
  g.translate(0, 4);
  path();
  g.strokeStyle = 'rgba(255,245,200,0.75)';
  g.lineWidth = 5;
  g.stroke();
  g.restore();
  // Schuppen
  g.strokeStyle = 'rgba(140,80,0,0.55)';
  g.lineWidth = 1;
  for (let i = 1; i < 68; i += 2) {
    g.beginPath();
    g.arc(pts[i][0], pts[i][1] - 3, 4, 0.2, Math.PI - 0.2);
    g.stroke();
  }
  // Schwanzquaste
  const [tx0, ty0] = pts[0];
  g.fillStyle = '#e8213b';
  g.beginPath();
  g.moveTo(tx0, ty0);
  g.quadraticCurveTo(tx0 + 18, ty0 - 22, tx0 + 6, ty0 - 34);
  g.quadraticCurveTo(tx0 + 2, ty0 - 16, tx0 - 10, ty0 - 8);
  g.closePath();
  g.fill();
  // Kopf
  const [hx, hy] = pts[70];
  g.fillStyle = '#e8213b';
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.moveTo(hx + 4, hy - 8 + k * 5);
    g.quadraticCurveTo(hx + 22, hy - 14 + k * 8, hx + 26, hy - 4 + k * 7);
    g.lineTo(hx + 6, hy + k * 4);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = '#5a3a00';
  g.lineWidth = 2.5;
  g.fillStyle = '#f7c948';
  g.beginPath();
  g.ellipse(hx - 4, hy, 16, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.ellipse(hx - 20, hy + 4, 11, 7, 0.1, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#c0152f';
  g.beginPath();
  g.moveTo(hx - 28, hy + 8);
  g.lineTo(hx - 12, hy + 10);
  g.lineTo(hx - 26, hy + 14);
  g.closePath();
  g.fill();
  g.strokeStyle = '#fff3c4';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(hx, hy - 9);
  g.quadraticCurveTo(hx + 10, hy - 22, hx + 22, hy - 24);
  g.moveTo(hx + 5, hy - 7);
  g.quadraticCurveTo(hx + 16, hy - 16, hx + 26, hy - 15);
  g.stroke();
  g.strokeStyle = '#f7c948';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(hx - 28, hy + 2);
  g.bezierCurveTo(hx - 40, hy - 10, hx - 46, hy + 14, hx - 58, hy + 2);
  g.moveTo(hx - 26, hy + 6);
  g.bezierCurveTo(hx - 36, hy + 20, hx - 48, hy + 10, hx - 54, hy + 24);
  g.stroke();
  g.fillStyle = '#fff';
  circle(g, hx - 9, hy - 4, 4);
  g.fillStyle = '#c0152f';
  circle(g, hx - 10, hy - 4, 2);
}

const TEMPLE = {
  name: 'Chinesisches Neujahr', amb: 'fireworks',
  plat: { base: '#b3122e', top: '#f2c14e', line: '#3d0610', ornate: true },
  draw(g, w, h) {
    g.fillStyle = vgrad(g, 0, h, ['#1a0b2e', '#4a1240', '#a3283c', '#f07a3a', '#ffc36b']);
    g.fillRect(0, 0, w, h);
    stars(g, w, h, 40, 81, 0.35);
    glow(g, w * 0.2, h * 0.14, 90, 'rgba(255,230,180,0.5)');
    g.fillStyle = '#ffe9c2';
    circle(g, w * 0.2, h * 0.14, 28);
    peaks(g, w, h, h * 0.66, h * 0.25, 'rgba(90,30,70,0.85)', null, 82, 5);
    peaks(g, w, h, h * 0.76, h * 0.2, 'rgba(60,15,45,0.95)', null, 83, 4);
    dragon(g, w, h);
    pagoda(g, w * 0.74, h * 0.9, 1.2);
    pagoda(g, w * 0.18, h * 0.92, 0.8);
    g.fillStyle = '#3a0d16';
    g.fillRect(0, h * 0.9, w, h * 0.1);
    g.fillStyle = '#5c1622';
    for (let x = 0; x < w; x += 24) g.fillRect(x, h * 0.9 - 6, 14, 6);
    g.fillStyle = '#f2c14e';
    g.fillRect(0, h * 0.9, w, 2);
    g.strokeStyle = 'rgba(40,10,10,0.8)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, h * 0.56);
    g.quadraticCurveTo(w * 0.5, h * 0.64, w, h * 0.57);
    g.stroke();
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const y = (1 - t) * (1 - t) * h * 0.56 + 2 * (1 - t) * t * h * 0.64 + t * t * h * 0.57;
      lantern(g, w * t, y, 1);
    }
  }
};

function brokenPillar(g, x, y, s, seed) {
  const r = rng(seed);
  const pw = 26 * s, ph = (70 + r() * 50) * s;
  g.fillStyle = '#2c363e';
  g.fillRect(x - pw / 2 - 6 * s, y - 8 * s, pw + 12 * s, 8 * s);
  g.fillStyle = '#3c4852';
  g.beginPath();
  g.moveTo(x - pw / 2, y - 8 * s);
  g.lineTo(x - pw / 2, y - ph);
  for (let k = 0; k <= 5; k++) g.lineTo(x - pw / 2 + (pw * k) / 5, y - ph - (r() * 14 - 4) * s);
  g.lineTo(x + pw / 2, y - 8 * s);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let k = 0; k < 3; k++) g.fillRect(x - pw / 2 + 4 * s + k * 8 * s, y - ph + 6 * s, 2.5 * s, ph - 16 * s);
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x - 4 * s, y - ph * 0.8);
  g.lineTo(x + 3 * s, y - ph * 0.6);
  g.lineTo(x - 2 * s, y - ph * 0.45);
  g.stroke();
  // Ranken drum herum
  g.strokeStyle = '#2f6b3a';
  g.lineWidth = 2.5 * s;
  g.beginPath();
  for (let yy = y - ph; yy < y - 8 * s; yy += 3) {
    g.lineTo(x + Math.sin(yy * 0.12) * pw * 0.55, yy);
  }
  g.stroke();
  g.fillStyle = '#4caf50';
  for (let yy = y - ph + 6; yy < y - 10 * s; yy += 11 * s) {
    g.beginPath();
    g.ellipse(x + Math.sin(yy * 0.12) * pw * 0.55 + 3, yy, 3.5 * s, 2 * s, 0.6, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#3d7a3a';
  circle(g, x - 6 * s, y - ph + 2 * s, 7 * s);
  circle(g, x + 5 * s, y - ph + 1 * s, 6 * s);
}

const PUDDLES = [[0.2, 0.95, 46], [0.62, 0.93, 58], [0.92, 0.97, 30]];

const GROTTO = {
  name: 'Dunkle Grotte', amb: 'cave',
  plat: { base: '#4b5561', top: '#5e9a4c', line: '#12171c' },
  draw(g, w, h) {
    g.fillStyle = vgrad(g, 0, h, ['#05080c', '#0c1a20', '#11313a', '#0a1a20']);
    g.fillRect(0, 0, w, h);
    glow(g, w * 0.55, h * 0.35, 210, 'rgba(80,200,190,0.18)');
    const r = rng(91);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.2})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 10 + r() * 30, 6 + r() * 16, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Felswände links und rechts
    const wall = (side) => {
      g.fillStyle = '#0a1116';
      g.beginPath();
      g.moveTo(side ? w : 0, 0);
      for (let y = 0; y <= h; y += 30) {
        const d = 20 + r() * 45;
        g.lineTo(side ? w - d : d, y);
      }
      g.lineTo(side ? w : 0, h);
      g.closePath();
      g.fill();
    };
    wall(0);
    wall(1);
    // Tropfsteine
    g.fillStyle = '#141f26';
    for (let i = 0; i < 12; i++) {
      const x = r() * w, len = 20 + r() * 70, bw = 6 + r() * 10;
      g.beginPath();
      g.moveTo(x - bw, 0);
      g.lineTo(x, len);
      g.lineTo(x + bw, 0);
      g.closePath();
      g.fill();
    }
    // Leuchtkristalle
    for (const [cx, cy, s] of [[0.1, 0.55, 1], [0.88, 0.42, 0.8], [0.45, 0.86, 0.7]]) {
      glow(g, cx * w, cy * h, 40 * s, 'rgba(90,230,255,0.4)');
      g.fillStyle = '#7ff0ff';
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(cx * w + k * 7 * s - 4 * s, cy * h);
        g.lineTo(cx * w + k * 9 * s, cy * h - (18 - Math.abs(k) * 6) * s);
        g.lineTo(cx * w + k * 7 * s + 4 * s, cy * h);
        g.closePath();
        g.fill();
      }
    }
    brokenPillar(g, w * 0.3, h * 0.9, 1, 92);
    brokenPillar(g, w * 0.76, h * 0.9, 0.8, 93);
    // Boden mit Stalagmiten
    g.fillStyle = '#0d1519';
    g.fillRect(0, h * 0.9, w, h * 0.1);
    g.fillStyle = '#121d23';
    for (let i = 0; i < 7; i++) {
      const x = r() * w, len = 15 + r() * 30;
      g.beginPath();
      g.moveTo(x - 8, h * 0.9);
      g.lineTo(x, h * 0.9 - len);
      g.lineTo(x + 8, h * 0.9);
      g.closePath();
      g.fill();
    }
    // Pfützen
    for (const [px, py, pw] of PUDDLES) {
      const gr = g.createLinearGradient(0, py * h - 6, 0, py * h + 6);
      gr.addColorStop(0, '#2a7f8c');
      gr.addColorStop(1, '#0e2f38');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(px * w, py * h, pw, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(160,240,255,0.35)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(px * w - pw * 0.5, py * h - 2);
      g.lineTo(px * w + pw * 0.2, py * h - 2);
      g.stroke();
    }
    // Hängende Ranken
    for (let i = 0; i < 6; i++) {
      const x = 30 + r() * (w - 60), len = 80 + r() * 160;
      g.strokeStyle = '#24502c';
      g.lineWidth = 2.2;
      g.beginPath();
      for (let y = 0; y < len; y += 4) g.lineTo(x + Math.sin(y * 0.05 + i) * 8, y);
      g.stroke();
      g.fillStyle = '#3f8f47';
      for (let y = 10; y < len; y += 14) {
        g.beginPath();
        g.ellipse(x + Math.sin(y * 0.05 + i) * 8 + (y % 28 ? 4 : -4), y, 4, 2.2, y % 28 ? 0.5 : -0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
};

// Positionen im Labor (relativ), damit die Animation genau in den Glaskolben passt
const LAB = { tank: [0.07, 0.42, 0.3, 0.78], flask: [0.72, 0.775], burner: [0.72, 0.86] };

function erlenmeyer(g, x, y, s, liquid) {
  g.strokeStyle = 'rgba(220,255,240,0.8)';
  g.lineWidth = 1.6;
  g.fillStyle = liquid;
  g.beginPath();
  g.moveTo(x - 4 * s, y - 26 * s);
  g.lineTo(x - 4 * s, y - 16 * s);
  g.lineTo(x - 12 * s, y);
  g.lineTo(x + 12 * s, y);
  g.lineTo(x + 4 * s, y - 16 * s);
  g.lineTo(x + 4 * s, y - 26 * s);
  g.stroke();
  g.beginPath();
  g.moveTo(x - 8 * s, y - 8 * s);
  g.lineTo(x - 12 * s, y);
  g.lineTo(x + 12 * s, y);
  g.lineTo(x + 8 * s, y - 8 * s);
  g.closePath();
  g.fill();
}

function pipe(g, pts, glass) {
  const line = () => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) g.lineTo(p[0], p[1]);
  };
  g.lineJoin = 'round';
  line();
  g.strokeStyle = '#11181c';
  g.lineWidth = 17;
  g.stroke();
  line();
  g.strokeStyle = glass ? 'rgba(150,220,170,0.18)' : '#46525b';
  g.lineWidth = 13;
  g.stroke();
  if (glass) {
    line();
    g.strokeStyle = '#2f9e50';
    g.lineWidth = 7;
    g.stroke();
    line();
    g.strokeStyle = 'rgba(200,255,210,0.6)';
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.fillStyle = '#3e4a52';
  for (const [x, y] of pts) circle(g, x, y, 10);
  g.fillStyle = '#2b343b';
  for (const [x, y] of pts) circle(g, x, y, 2.5);
}

const LABWORLD = {
  name: 'Giftlabor', amb: 'lab',
  plat: { base: '#66737f', top: '#b9c6d1', line: '#161d24', toxic: true },
  draw(g, w, h) {
    g.fillStyle = vgrad(g, 0, h, ['#0e1a1c', '#16292b', '#1d3633']);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,255,140,0.06)';
    g.lineWidth = 1;
    for (let x = 0; x < w; x += 28) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    glow(g, w * 0.2, h * 0.6, 160, 'rgba(60,255,100,0.1)');
    pipe(g, [[-10, h * 0.1], [w * 0.38, h * 0.1], [w * 0.38, h * 0.26], [w + 10, h * 0.26]], true);
    pipe(g, [[w * 0.9, -10], [w * 0.9, h * 0.5], [w * 0.55, h * 0.5]], false);
    pipe(g, [[w * 0.185, h * 0.26], [w * 0.185, h * LAB.tank[1] - 8]], true);
    // Großer Tank mit Giftbrühe
    const [tx0, ty0, tx1, ty1] = LAB.tank;
    const X0 = tx0 * w, Y0 = ty0 * h, X1 = tx1 * w, Y1 = ty1 * h;
    g.fillStyle = 'rgba(180,255,220,0.08)';
    g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    const lg = g.createLinearGradient(0, Y0, 0, Y1);
    lg.addColorStop(0, '#46b85a');
    lg.addColorStop(1, '#16552a');
    g.fillStyle = lg;
    g.fillRect(X0, Y0 + (Y1 - Y0) * 0.25, X1 - X0, (Y1 - Y0) * 0.75);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(X0 + 6, Y0 + 4, 5, Y1 - Y0 - 8);
    g.fillStyle = '#4f5c66';
    rr(g, X0 - 6, Y0 - 10, X1 - X0 + 12, 12, 4);
    g.fill();
    rr(g, X0 - 6, Y1, X1 - X0 + 12, 14, 4);
    g.fill();
    g.strokeStyle = '#9fb0bc';
    g.lineWidth = 2;
    g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    // Regal mit Kolben (weit oben und blass, damit es Hintergrund bleibt)
    g.globalAlpha = 0.55;
    g.fillStyle = '#4a3a2c';
    g.fillRect(w * 0.48, h * 0.42, w * 0.46, 6);
    erlenmeyer(g, w * 0.55, h * 0.42, 1, '#8a4dbf');
    erlenmeyer(g, w * 0.7, h * 0.42, 0.8, '#2f9e50');
    erlenmeyer(g, w * 0.85, h * 0.42, 1.1, '#3a8fbf');
    g.globalAlpha = 1;
    // Labortisch
    g.fillStyle = '#26323a';
    g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = '#3c4a52';
    g.fillRect(0, h * 0.86, w, 7);
    // Bunsenbrenner + Stativ + Rundkolben
    const [bx, by] = LAB.burner, BX = bx * w, BY = by * h;
    g.fillStyle = '#5b6873';
    rr(g, BX - 14, BY - 5, 28, 5, 2);
    g.fill();
    g.fillStyle = '#8a99a6';
    g.fillRect(BX - 3.5, BY - 26, 7, 21);
    g.strokeStyle = '#3c4a52';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(BX - 22, BY);
    g.lineTo(BX - 22, BY - 62);
    g.moveTo(BX + 22, BY);
    g.lineTo(BX + 22, BY - 62);
    g.moveTo(BX - 24, BY - 44);
    g.lineTo(BX + 24, BY - 44);
    g.stroke();
    const [fx, fy] = LAB.flask, FX = fx * w, FY = fy * h;
    g.fillStyle = '#39ff6a';
    g.beginPath();
    g.arc(FX, FY, 15, 0.1 * Math.PI, 0.9 * Math.PI + Math.PI * 0.2);
    g.fill();
    g.strokeStyle = 'rgba(220,255,240,0.85)';
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(FX, FY, 15, -Math.PI * 0.38, Math.PI * 1.38);
    g.moveTo(FX - 5, FY - 14);
    g.lineTo(FX - 5, FY - 34);
    g.moveTo(FX + 5, FY - 14);
    g.lineTo(FX + 5, FY - 34);
    g.stroke();
    // Reagenzglas-Ständer
    g.fillStyle = '#6b4a2b';
    g.fillRect(w * 0.08, h * 0.86 - 10, 70, 10);
    ['#ff4d6d', '#39ff6a', '#ffd23f', '#4dc3ff'].forEach((c, i) => {
      const x = w * 0.08 + 9 + i * 16;
      g.strokeStyle = 'rgba(220,255,240,0.8)';
      g.lineWidth = 1.4;
      rr(g, x, h * 0.86 - 34, 8, 30, 4);
      g.stroke();
      g.fillStyle = c;
      rr(g, x + 1, h * 0.86 - 18, 6, 13, 3);
      g.fill();
    });
    // Giftpfütze
    g.fillStyle = '#39ff6a';
    g.beginPath();
    g.ellipse(w * 0.45, h * 0.95, 34, 5, 0, 0, Math.PI * 2);
    g.fill();
    glow(g, w * 0.45, h * 0.95, 40, 'rgba(60,255,100,0.3)');
    // Nebel-Schleier: drückt alles in den Hintergrund
    g.fillStyle = 'rgba(12,22,24,0.35)';
    g.fillRect(0, 0, w, h);
  }
};

// Strand bleibt Index 0 (Hauptmenü-Hintergrund), die neuen Welten werden einsortiert
THEMES.splice(3, 0, TEMPLE);
THEMES.splice(5, 0, GROTTO);
THEMES.splice(7, 0, LABWORLD);

// Hintergründe werden einmal in ein unsichtbares Canvas gemalt (spart Leistung)
// Der nächste Hintergrund wird vorab in Streifen gemalt (ein Streifen pro Bild),
// damit es beim Weltwechsel keinen Hänger gibt.
const bgCache = new Map();
const BG_STRIPS = 6;
let bgJob = null;
function newBgCanvas() {
  const bs = Math.min(scale, 2.5);
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * bs);
  c.height = Math.ceil(H * bs);
  const g = c.getContext('2d');
  g.scale(bs, bs);
  return { c, g };
}
function cacheBg(i, c) {
  bgCache.delete(i);
  bgCache.set(i, c);                       // zuletzt benutzt = hinten
  while (bgCache.size > 3) bgCache.delete(bgCache.keys().next().value);
}
function getBg(i) {
  if (bgCache.has(i)) { const c = bgCache.get(i); cacheBg(i, c); return c; }
  if (bgJob && bgJob.i === i) bgJob = null;
  const { c, g } = newBgCanvas();
  THEMES[i].draw(g, W, H);
  cacheBg(i, c);
  return c;
}
function prepareBg(i) {
  if (bgCache.has(i) || (bgJob && bgJob.i === i)) return;
  const { c, g } = newBgCanvas();
  bgJob = { i, c, g, strip: 0 };
}
function workBg() {
  const j = bgJob;
  if (!j) return;
  const sh = H / BG_STRIPS;
  j.g.save();
  j.g.beginPath();
  j.g.rect(0, j.strip * sh - 1, W, sh + 2);
  j.g.clip();
  THEMES[j.i].draw(j.g, W, H);
  j.g.restore();
  if (++j.strip >= BG_STRIPS) {
    bgJob = null;
    bgCache.set(j.i, j.c);
    while (bgCache.size > 3) bgCache.delete(bgCache.keys().next().value);
  }
}

// Feste Zufallspositionen für bewegte Deko
const ambR = rng(99);
const AMB = Array.from({ length: 70 }, () => ({ x: ambR(), y: ambR(), s: ambR(), p: ambR() * 6.28 }));

function drawAmbient(type, t, cam) {
  const up = -cam;
  const baseA = ctx.globalAlpha; // wichtig für die Überblendung zwischen Welten
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
        ctx.globalAlpha = baseA * 0.7;
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
    case 'fireworks': {
      const cols = ['#ffd23f', '#ff4d6d', '#6ee7ff', '#b388ff', '#7dff8a', '#ff9f43'];
      for (let k = 0; k < 3; k++) {
        const period = 2.4, ph = t + k * 0.8;
        const cyc = Math.floor(ph / period), u = (ph % period) / period;
        const r = rng(cyc * 7 + k * 131);
        const cx = (0.12 + r() * 0.76) * W, cy = (0.06 + r() * 0.36) * H;
        const col = cols[Math.floor(r() * cols.length)];
        ctx.fillStyle = col;
        if (u < 0.22) {
          const e = u / 0.22;
          const y = lerp(H * 0.85, cy, 1 - (1 - e) * (1 - e));
          ctx.globalAlpha = baseA * 0.9;
          circle(ctx, cx, y, 2);
          ctx.globalAlpha = baseA * 0.4;
          circle(ctx, cx, y + 8, 1.5);
          circle(ctx, cx, y + 15, 1);
        } else {
          const e = (u - 0.22) / 0.78;
          const rad = 60 * Math.sqrt(e);
          ctx.globalAlpha = baseA * Math.max(0, 1 - e);
          if (e < 0.15) glow(ctx, cx, cy, 50, 'rgba(255,240,200,0.6)');
          ctx.fillStyle = col;
          for (let s = 0; s < 26; s++) {
            const a = (s / 26) * Math.PI * 2;
            circle(ctx, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad + e * e * 25, 1.9);
            circle(ctx, cx + Math.cos(a) * rad * 0.6, cy + Math.sin(a) * rad * 0.6 + e * e * 20, 1.1);
          }
        }
      }
      break;
    }
    case 'cave': {
      // Wassertropfen fallen in die Pfützen, Ringe breiten sich aus
      for (let k = 0; k < PUDDLES.length; k++) {
        const [px, py, pw] = PUDDLES[k];
        const period = 1.8 + k * 0.5;
        const u = ((t + k * 0.7) % period) / period;
        const X = px * W + (k - 1) * 8, Y = py * H;
        ctx.fillStyle = 'rgba(170,240,255,0.85)';
        if (u < 0.5) {
          const e = u / 0.5;
          circle(ctx, X, lerp(0, Y, e * e), 2);
        } else {
          const e = (u - 0.5) / 0.5;
          ctx.strokeStyle = `rgba(170,240,255,${0.8 * (1 - e)})`;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.ellipse(X, Y, Math.min(pw, 4 + e * pw * 0.7), 1 + e * 3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // schwebende Leuchtsporen
      for (let i = 0; i < 18; i++) {
        const a = AMB[i];
        const x = wrapMod(a.x * W + Math.sin(t * 0.5 + a.p) * 18, W);
        const y = wrapMod(a.y * H - t * (6 + a.s * 10) + up * 0.3, H);
        const fl = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + a.p));
        glow(ctx, x, y, 7, `rgba(110,240,255,${0.4 * fl})`);
        ctx.fillStyle = `rgba(200,255,255,${fl})`;
        circle(ctx, x, y, 1.3);
      }
      break;
    }
    case 'lab': {
      // Blasen im Tank
      const [tx0, ty0, tx1, ty1] = LAB.tank;
      const X0 = tx0 * W, X1 = tx1 * W, top = ty0 * H + (ty1 - ty0) * H * 0.25, bot = ty1 * H;
      ctx.fillStyle = 'rgba(220,255,210,0.7)';
      for (let i = 0; i < 14; i++) {
        const a = AMB[i];
        const x = lerp(X0 + 8, X1 - 8, a.x) + Math.sin(t * 3 + a.p) * 3;
        const y = bot - wrapMod(a.y * (bot - top) + t * (20 + a.s * 40), bot - top);
        circle(ctx, x, y, 1.5 + a.s * 3);
      }
      // Bunsenbrenner-Flamme
      const BX = LAB.burner[0] * W, BY = LAB.burner[1] * H - 26;
      const fh = 18 + Math.sin(t * 20) * 2 + Math.sin(t * 33) * 1.5;
      glow(ctx, BX, BY - 8, 22, 'rgba(90,150,255,0.5)');
      ctx.fillStyle = 'rgba(70,130,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(BX - 4, BY);
      ctx.quadraticCurveTo(BX - 4, BY - fh * 0.6, BX, BY - fh);
      ctx.quadraticCurveTo(BX + 4, BY - fh * 0.6, BX + 4, BY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(190,230,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(BX - 2, BY);
      ctx.quadraticCurveTo(BX - 2, BY - fh * 0.3, BX, BY - fh * 0.5);
      ctx.quadraticCurveTo(BX + 2, BY - fh * 0.3, BX + 2, BY);
      ctx.closePath();
      ctx.fill();
      // Blubbern im Rundkolben + giftiger Dampf
      const FX = LAB.flask[0] * W, FY = LAB.flask[1] * H;
      for (let i = 0; i < 6; i++) {
        const a = AMB[20 + i];
        const u = (t * (0.8 + a.s) + a.p) % 1;
        ctx.fillStyle = `rgba(200,255,200,${0.8 * (1 - u)})`;
        circle(ctx, FX + (a.x - 0.5) * 12, FY + 6 - u * 14, 1.5 + a.s * 1.5);
        ctx.fillStyle = `rgba(90,255,120,${0.35 * (1 - u)})`;
        circle(ctx, FX + (a.x - 0.5) * 10 + Math.sin(t + i) * 6, FY - 36 - u * 60, 3 + u * 6);
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
/* ---------- SPIELSTAND ----------
   WICHTIG für alle künftigen Updates: Diese Speicher-Schlüssel nie umbenennen
   oder löschen, nur neue dazu. Der Spielstand liegt doppelt:
   1. im Browser (localStorage) – geht auch ohne Anmeldung, aber nur auf diesem Gerät,
   2. im dauerhaften Server-Speicher des Spiel-Links (pro Person, übersteht jedes Update).
   Beim Start werden beide zusammengeführt, und zwar so, dass nie etwas verloren geht:
   Zahlen nehmen immer den höheren Wert, Listen (gekaufte Skins) werden vereinigt.
   Die Währung (Handys) wird deshalb als "verdient" und "ausgegeben" getrennt
   gezählt (beide wachsen nur). 2D und 3D haben getrennte Konten und Shops:
   2D-Konto = earned (Run + alte Trüffel) − spent,
   3D-Konto = phones (3D Jump 'n' Run) − spent3d. */
const save = {
  best: store.get('porkjump_best', 0),
  bestRun: store.get('porkjump_best_run', 0),
  earned: Math.max(store.get('porkjump_truffles_earned', 0), store.get('porkjump_truffles', 0)),
  spent: store.get('porkjump_truffles_spent', 0),
  owned: store.get('porkjump_owned', []),         // gekaufte Skins/Sachen (für den Shop)
  best3d: store.get('porkjump_best_3d', 0),       // 3D Run: weiteste Strecke
  phones: store.get('porkjump_phones_total', 0),  // 3D Run: alle gesammelten Handys
  bestPhones: store.get('porkjump_best_phones', 0),
  spent3d: store.get('porkjump_spent_3d', 0),      // 3D-Shop: ausgegebene Handys
  owned3d: store.get('porkjump_owned_3d', [])      // 3D-Shop: gekaufte Skins
};
let best = save.best;
let bestRun = save.bestRun;
const walletNow = () => save.earned - save.spent;            // 2D-Konto (Classic + Run)
const wallet3dNow = () => save.phones - save.spent3d;         // 3D-Konto
let truffleBank = walletNow();
let soundOn = store.get('porkjump_sound', true);

function mergeSave(other) {
  if (!other) return;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  save.best = Math.max(save.best, best, num(other.best));
  save.bestRun = Math.max(save.bestRun, bestRun, num(other.bestRun));
  save.earned = Math.max(save.earned, num(other.earned));
  save.spent = Math.max(save.spent, num(other.spent));
  if (Array.isArray(other.owned)) for (const k of other.owned) if (!save.owned.includes(k)) save.owned.push(k);
  save.best3d = Math.max(save.best3d, num(other.best3d));
  save.phones = Math.max(save.phones, num(other.phones));
  save.bestPhones = Math.max(save.bestPhones, num(other.bestPhones));
  save.spent3d = Math.max(save.spent3d, num(other.spent3d));
  if (Array.isArray(other.owned3d)) for (const k of other.owned3d) if (!save.owned3d.includes(k)) save.owned3d.push(k);
  best = save.best;
  bestRun = save.bestRun;
  truffleBank = walletNow();
}

function saveLocal() {
  store.set('porkjump_best', save.best);
  store.set('porkjump_best_run', save.bestRun);
  store.set('porkjump_truffles_earned', save.earned);
  store.set('porkjump_truffles_spent', save.spent);
  store.set('porkjump_truffles', save.earned - save.spent);   // alter Schlüssel, für ältere Versionen
  store.set('porkjump_owned', save.owned);
  store.set('porkjump_best_3d', save.best3d);
  store.set('porkjump_phones_total', save.phones);
  store.set('porkjump_best_phones', save.bestPhones);
  store.set('porkjump_spent_3d', save.spent3d);
  store.set('porkjump_owned_3d', save.owned3d);
}

// Server-Speicher (nur im Spiel-Link vorhanden; lokal geöffnet läuft alles nur über den Browser)
const cloudSave = { ref: null, busy: false, dirty: false };
async function pushCloud() {
  if (!cloudSave.ref) return;
  if (cloudSave.busy) { cloudSave.dirty = true; return; }   // immer nur ein Schreibvorgang gleichzeitig
  cloudSave.busy = true;
  try {
    await cloudSave.ref.set({ best: save.best, bestRun: save.bestRun, earned: save.earned, spent: save.spent, owned: save.owned,
      best3d: save.best3d, phones: save.phones, bestPhones: save.bestPhones, spent3d: save.spent3d, owned3d: save.owned3d, v: 1 });
  } catch (e) {
    if (e && e.code === 'invalid_argument') cloudSave.ref = null;   // diese Person darf hier nicht speichern
  }
  cloudSave.busy = false;
  if (cloudSave.dirty) { cloudSave.dirty = false; pushCloud(); }
}
function saveProgress() {
  save.best = Math.max(save.best, best);
  save.bestRun = Math.max(save.bestRun, bestRun);
  saveLocal();
  pushCloud();
}
async function initCloudSave() {
  // Browser bitten, die Spieldaten nie automatisch zu löschen (wo unterstützt)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* egal */ }
  try {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    const ref = db.doc('data/users/' + id + '/save');
    const snap = await ref.get();
    const remote = snap.exists ? snap.data() : null;
    mergeSave(remote);
    saveLocal();
    refreshBests();
    cloudSave.ref = ref;
    const same = remote && remote.best === save.best && remote.bestRun === save.bestRun && remote.earned === save.earned &&
      remote.spent === save.spent && Array.isArray(remote.owned) && remote.owned.length === save.owned.length &&
      remote.best3d === save.best3d && remote.phones === save.phones && remote.bestPhones === save.bestPhones &&
      remote.spent3d === save.spent3d && Array.isArray(remote.owned3d) && remote.owned3d.length === save.owned3d.length;
    if (!same) pushCloud();
  } catch (e) { /* kein Server-Speicher: Browser-Speicher reicht */ }
}

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
  noiseBuf: null,
  heliNodes: null,
  noise() {
    if (!this.noiseBuf) {
      const len = this.ac.sampleRate;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  },
  // Handy wählt (Tastentöne), dann Freizeichen
  dial() {
    if (!soundOn || !this.ac) return;
    const rows = [697, 770, 852, 941], cols = [1209, 1336, 1477];
    for (let i = 0; i < 7; i++) {
      const d = i * 0.13;
      const r = rows[Math.floor(Math.random() * 4)], c = cols[Math.floor(Math.random() * 3)];
      this.tone(r, r, 0.09, 'sine', 0.06, d);
      this.tone(c, c, 0.09, 'sine', 0.06, d);
    }
    for (const d of [1.05, 1.95]) {
      this.tone(440, 440, 0.7, 'sine', 0.06, d);
      this.tone(480, 480, 0.7, 'sine', 0.06, d);
    }
  },
  whoosh() {
    if (!soundOn || !this.ac) return;
    const t = this.ac.currentTime;
    const src = this.noise();
    const bp = this.ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(bp).connect(g).connect(this.ac.destination);
    src.start(t);
    src.stop(t + 0.65);
  },
  // Rotor-Knattern: gefiltertes Rauschen + tiefes Wummern, im Rotortakt gepulst
  startHeli() {
    if (!soundOn || !this.ac || this.heliNodes) return;
    const ac = this.ac, t = ac.currentTime;
    const src = this.noise();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const thump = ac.createOscillator();
    thump.type = 'sine';
    thump.frequency.value = 55;
    const chop = ac.createGain();
    chop.gain.value = 0.5;
    const lfo = ac.createOscillator(), lfoG = ac.createGain();
    lfo.type = 'square';
    lfo.frequency.value = 13;
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(chop.gain);
    const tg = ac.createGain();
    tg.gain.value = 0.6;
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.22, t + 0.6);
    src.connect(lp).connect(chop);
    thump.connect(tg).connect(chop);
    chop.connect(out).connect(ac.destination);
    const nodes = [src, thump, lfo];
    nodes.forEach(n => n.start(t));
    this.heliNodes = { nodes, out };
  },
  stopHeli() {
    if (!this.heliNodes) return;
    const { nodes, out } = this.heliNodes;
    const t = this.ac.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    nodes.forEach(n => { try { n.stop(t + 0.55); } catch (e) { /* schon gestoppt */ } });
    this.heliNodes = null;
  },
  stopLoops() {
    this.stopBuzz();
    this.stopHeli();
  },
  // Tiefes, weiches Bienen-Summen: zwei tiefe Töne, gefiltert, mit Flügelschlag-Pulsieren
  startBuzz() {
    if (!soundOn || !this.ac || this.buzzNodes) return;
    const ac = this.ac, t = ac.currentTime;
    const o1 = ac.createOscillator(), o2 = ac.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 112;
    o2.type = 'triangle';
    o2.frequency.value = 56;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    lp.Q.value = 1.5;
    const wing = ac.createGain();
    wing.gain.value = 0.75;
    const lfo = ac.createOscillator(), lfoG = ac.createGain();
    lfo.frequency.value = 22;
    lfoG.gain.value = 0.25;
    lfo.connect(lfoG).connect(wing.gain);
    const vib = ac.createOscillator(), vibG = ac.createGain();
    vib.frequency.value = 4.5;
    vibG.gain.value = 3;
    vib.connect(vibG).connect(o1.frequency);
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(wing).connect(out).connect(ac.destination);
    const osc = [o1, o2, lfo, vib];
    osc.forEach(n => n.start(t));
    this.buzzNodes = { osc, out };
  },
  stopBuzz() {
    if (!this.buzzNodes) return;
    const { osc, out } = this.buzzNodes;
    const t = this.ac.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.forEach(n => { try { n.stop(t + 0.2); } catch (e) { /* schon gestoppt */ } });
    this.buzzNodes = null;
  }
};

/* =========================================================
   SPIELZUSTAND
   ========================================================= */
let mode = 'classic';         // 'classic' | 'run'
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
const input = { left: false, right: false, rightPress: 0 }; // rightPress zählt Drücker (Sprung im Run-Modus)

function newPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, facing: 1,
    minY: y, squash: 0, spin: 0, spinV: 0, spinDir: 1,
    shoes: 0, bee: 0, shoeJumps: 0, nextFlip: 3
  };
}

const altAt = y => (startY - y) / PX_PER_M;            // Welt-Y -> Meter

// Reihenfolge der Welten: jede Runde (auch die erste) zufällig gemischt.
// Alle Welten kommen dran, nie zweimal hintereinander dieselbe.
let themeSeq = [];
function themeForSeg(seg) {
  const n = THEMES.length;
  while (themeSeq.length <= seg + 1) {
    const prev = themeSeq.slice(-n);
    let order;
    do {
      order = [...Array(n).keys()];
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    } while (order[0] === prev[n - 1] || order.every((v, i) => v === prev[i]));
    themeSeq.push(...order);
  }
  return themeSeq[seg];
}
const themeAt = m => themeForSeg(Math.floor(Math.max(0, m) / THEME_LEN));

// Ist an dieser Stelle Platz? (verhindert, dass Plattformen sich überlappen/kreuzen)
function spotFree(x, y, w, moving) {
  for (const o of platforms) {
    if (Math.abs(o.y - y) >= 34) continue;
    if (moving || o.vx) return false;
    if (x < o.x + o.w + 14 && x + w + 14 > o.x) return false;
  }
  return true;
}
function findX(y, w) {
  for (let k = 0; k < 12; k++) {
    const x = rand(4, W - w - 4);
    if (spotFree(x, y, w, false)) return x;
  }
  return null;
}

function addPlatform(x, y, w, d, allowItem) {
  const p = { x, y, w, h: 14, vx: 0, theme: themeAt(altAt(y)), item: null };
  // Item auf einer Plattform direkt darunter wäre verdeckt -> weg damit (passiert oberhalb des Bildes)
  for (const o of platforms) {
    if (!o.item || o.y <= y || o.y - y > 70) continue;
    const ix = o.x + o.item.ox;
    if (ix > x - 14 && ix < x + w + 14) o.item = null;
  }
  if (Math.random() < lerp(0, 0.38, d) && altAt(y) > 40 && spotFree(x, y, w, true)) {
    p.vx = rand(40, lerp(60, 130, d)) * (Math.random() < 0.5 ? -1 : 1);
  }
  if (allowItem && itemCooldown <= 0 && altAt(y) > 15) {
    const r = Math.random();
    let type = null;
    if (r < 0.0385) type = 'tramp';
    else if (r < 0.056) type = 'shoes';
    else if (r < 0.0665) type = 'bee';
    else if (r < 0.0715 && altAt(y) > 60) type = 'phone';
    if (type) {
      // phase: fester Schwebe-Takt pro Item (nicht an die Position gekoppelt, sonst zappelt es auf beweglichen Plattformen)
      p.item = { type, ox: type === 'tramp' ? rand(18, w - 18) : w / 2, squish: 0, phase: Math.random() * Math.PI * 2 };
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
    let x = findX(topY, w);
    if (x === null) { topY -= 30; x = findX(topY, w); }   // kein Platz: etwas höher versuchen
    addPlatform(x === null ? rand(4, W - w - 4) : x, topY, w, d, true);
    // In leichten Phasen gibt's manchmal eine Bonus-Plattform daneben (nur wenn Platz ist)
    if (Math.random() < lerp(0.3, 0.08, d)) {
      const y2 = topY + rand(-20, 20);
      const x2 = findX(y2, w);
      if (x2 !== null) addPlatform(x2, y2, w, d, false);
    }
  }
  compact(platforms, p => p.y < camY + H + 80);
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

function startSpin(p, dur) {
  p.spin = 0.0001;
  p.spinV = Math.PI * 2 / dur;
  p.spinDir = p.facing;
}

function land(p, pl) {
  p.y = pl.y;
  let v = JUMP_V * (p.shoes > 0 ? SHOE_MUL : 1);
  const it = pl.item;
  if (it && it.type === 'tramp' && Math.abs(p.x - (pl.x + it.ox)) < 24) {
    v *= TRAMP_MUL;
    it.squish = 1;
    startSpin(p, 0.9);
    Sound.boing();
    popup(p.x, p.y - 70, 'BOING!', '#ffd23f');
  } else {
    Sound.jump();
    // Federschuhe: nach jedem 2.–5. Sprung ein Salto
    if (p.shoes > 0 && ++p.shoeJumps >= p.nextFlip) {
      p.shoeJumps = 0;
      p.nextFlip = randInt(2, 5);
      startSpin(p, 0.75);
    }
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
        p.shoeJumps = 0;
        p.nextFlip = randInt(2, 5);
        popup(ix, iy - 30, 'Federschuhe!', '#6ee7ff');
      } else if (it.type === 'phone') {
        startCall(p);
        return;
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
// Abgelaufene Einträge an Ort und Stelle entfernen (keine neuen Listen = weniger Speicher-Müll, weniger Ruckler)
function compact(arr, alive) {
  let n = 0;
  for (let i = 0; i < arr.length; i++) if (alive(arr[i])) arr[n++] = arr[i];
  arr.length = n;
}
const isAlive = q => q.life > 0;
function updateFx(dt) {
  for (const q of particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 200 * dt; q.life -= dt; }
  compact(particles, isAlive);
  for (const q of popups) { q.y -= 40 * dt; q.life -= dt; }
  compact(popups, isAlive);
}

/* ---------- Handy-Anruf: Einfrieren -> Wählen -> Heli -> Seil -> Abflug ---------- */
// Phasen: 'dial' (alles steht, Pork telefoniert), 'heli' (Heli kommt, Seil runter),
// 'fly' (am Seil nach oben), danach fliegt der Heli alleine weg (heliLeave)
let heliLeave = null;
let flash = 0;

function startCall(p) {
  p.bee = 0;
  p.spin = 0;
  p.spinV = 0;
  p.vx = 0;
  p.vy = 0;
  Sound.stopBuzz();
  Sound.dial();
  p.call = { phase: 'dial', t: 0, hx: W + 120, hy: camY + 115, rope: 0, dist: 0, nextFlash: 0 };
}

function heliHook(p) {
  return p.call.hy + 22; // Seil hängt unten am Heli
}

function updateCall(p, dt) {
  const c = p.call;
  c.t += dt;
  if (c.phase === 'dial') {
    if (c.t > 2.6) {
      c.phase = 'heli';
      c.t = 0;
      Sound.startHeli();
    }
  } else if (c.phase === 'heli') {
    const k = Math.min(1, c.t / 1.2);
    const e = 1 - (1 - k) * (1 - k);
    c.hx = lerp(W + 120, p.x + 6, e);
    c.hy = camY + 115 + Math.sin(gameT * 3) * 3;
    const full = p.y - 50 - heliHook(p);
    c.rope = full * clamp((c.t - 1.2) / 0.55, 0, 1);
    if (c.t > 1.85) {
      c.phase = 'fly';
      c.t = 0;
      c.rope = full;
      flash = 1;
      Sound.whoosh();
      sparkle(p.x, p.y - 50);
      popup(p.x, p.y - 90, 'JOHN PORK EXPRESS!', '#ff5fa2');
    }
  } else if (c.phase === 'fly') {
    const v = Math.min(CALL_SPEED, 500 + c.t * 3500);
    const step = Math.min(v * dt, CALL_DIST - c.dist);
    p.y -= step;
    c.dist += step;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) p.facing = dir;
    p.x = wrapMod(p.x + dir * 260 * dt, W);
    c.rope = lerp(c.rope, 105, Math.min(1, dt * 3));     // Seil wird hochgezogen
    c.hx = lerp(c.hx, p.x + 6, Math.min(1, dt * 8));
    c.hy = p.y - 50 - c.rope - 22;
    if (c.t > c.nextFlash) {                               // Blitze unterwegs
      flash = Math.max(flash, rand(0.35, 0.6));
      c.nextFlash = c.t + rand(0.35, 0.7);
    }
    if (Math.random() < dt * 30) {
      particles.push({ x: p.x + rand(-14, 14), y: p.y - rand(0, 50), vx: rand(-40, 40), vy: rand(300, 600),
        life: 0.5, max: 0.5, r: rand(2, 4), color: `hsl(${(gameT * 600 + rand(0, 120)) % 360},100%,65%)` });
    }
    if (c.dist >= CALL_DIST) {
      heliLeave = { x: c.hx, y: c.hy, t: 0 };
      p.call = null;
      // Sichere Landeplattform unter Pork, damit man nach dem Flug nicht sofort abstürzt
      const ly = p.y + 160, lw = 110, lx = clamp(p.x - lw / 2, 4, W - lw - 4);
      platforms = platforms.filter(o => Math.abs(o.y - ly) >= 34);
      platforms.push({ x: lx, y: ly, w: lw, h: 14, vx: 0, theme: themeAt(altAt(ly)), item: null });
      p.vy = -JUMP_V * 1.1;
      startSpin(p, 0.8);
      flash = 0.8;
      Sound.stopHeli();
      Sound.whoosh();
    }
  }
}

/* ---------- Haupt-Update während der Runde ---------- */
function update(dt) {
  gameT += dt;
  flash = Math.max(0, flash - dt * 2.5);
  if (heliLeave) {
    heliLeave.t += dt;
    heliLeave.x -= 260 * dt;
    heliLeave.y -= 420 * dt;
    if (heliLeave.t > 2.5) heliLeave = null;
  }
  if (player.call) {
    // Während des Anrufs steht die Welt still, nur der Heli-Ablauf läuft
    updateCall(player, dt);
    updateFx(dt);
    const target = player.y - H * 0.45;
    if (target < camY) camY = target;
    genPlatforms();
    player.minY = Math.min(player.minY, player.y);
    meters = Math.max(0, Math.floor((startY - player.minY) / PX_PER_M));
    return;
  }
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
  if (th.ornate) {
    ctx.fillStyle = '#f2c14e';
    for (let i = 0; i < (w - 12) / 12; i++) circle(ctx, x + 10 + i * 12, y + 10, 1.6);
  }
  if (th.toxic) {
    ctx.fillStyle = '#39ff6a';
    rr(ctx, x + 4, y + 8, w - 8, 2.5, 1);
    ctx.fill();
    for (const f of [0.3, 0.72]) {
      const dx = x + w * f, len = 4 + ((pl.w * f * 7) % 6);
      rr(ctx, dx - 2, y + h - 1, 4, len, 2);
      ctx.fill();
      circle(ctx, dx, y + h + len + 2 + (gameT * 8 + f * 10) % 4, 1.8);
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
    const by = y - 14 + Math.sin(gameT * 4 + (it.phase || 0)) * 3;
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
  } else if (it.type === 'phone') {
    const by = y - 22 + Math.sin(gameT * 3 + (it.phase || 0)) * 3;
    const ring = (gameT % 1.2) < 0.6;
    const jx = ring ? Math.sin(gameT * 80) * 1.2 : 0;
    drawPhone(x + jx, by, 1, ring ? Math.sin(gameT * 60) * 0.12 : 0);
    if (ring) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      for (let k = 1; k <= 2; k++) {
        ctx.beginPath();
        ctx.arc(x, by, 12 + k * 5, -0.6, 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, by, 12 + k * 5, Math.PI - 0.6, Math.PI + 0.6);
        ctx.stroke();
      }
    }
  } else if (it.type === 'bee') {
    const by = y - 24 + Math.sin(gameT * 3 + (it.phase || 0)) * 4;
    drawBee(x + Math.sin(gameT * 1.7) * 6, by, 0.8, 1);
  }
}

function drawPhone(x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  glow(ctx, 0, 0, 30, 'rgba(120,255,160,0.45)');
  ctx.fillStyle = '#1b1b24';
  ctx.strokeStyle = '#2a1520';
  ctx.lineWidth = 2;
  rr(ctx, -7, -12, 14, 24, 3.5);
  ctx.fill();
  ctx.stroke();
  const sg = ctx.createLinearGradient(0, -10, 0, 10);
  sg.addColorStop(0, '#ffb3c6');
  sg.addColorStop(1, '#7a6bff');
  ctx.fillStyle = sg;
  rr(ctx, -5.5, -9.5, 11, 18, 2);
  ctx.fill();
  ctx.fillStyle = '#f2c3c8';
  circle(ctx, 0, -4, 2.6);
  ctx.fillStyle = '#26d07c';
  circle(ctx, 2.8, 5, 2);
  ctx.fillStyle = '#ff4d4d';
  circle(ctx, -2.8, 5, 2);
  ctx.restore();
}

// Pinker John-Pork-Helikopter (dir: -1 = schaut nach links)
function drawHeli(x, y, dir) {
  const OL = '#2a1520';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = OL;
  ctx.lineWidth = 2.5;
  // Kufen
  ctx.beginPath();
  ctx.moveTo(-20, 12); ctx.lineTo(-16, 20);
  ctx.moveTo(10, 12); ctx.lineTo(8, 20);
  ctx.moveTo(-30, 20); ctx.lineTo(18, 20); ctx.quadraticCurveTo(24, 20, 25, 16);
  ctx.stroke();
  // Heckausleger + Heckrotor
  ctx.fillStyle = '#ff5fa2';
  ctx.beginPath();
  ctx.moveTo(12, -6);
  ctx.lineTo(52, -4);
  ctx.lineTo(52, 2);
  ctx.lineTo(12, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c93d7c';
  ctx.beginPath();
  ctx.moveTo(48, -4); ctx.lineTo(56, -16); ctx.lineTo(58, 2); ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const tr = Math.sin(gameT * 70) * 9;
  ctx.strokeStyle = 'rgba(40,20,30,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(55, -4 - tr); ctx.lineTo(55, -4 + tr);
  ctx.stroke();
  // Rumpf
  ctx.strokeStyle = OL;
  ctx.lineWidth = 2.5;
  const bg = ctx.createLinearGradient(0, -16, 0, 14);
  bg.addColorStop(0, '#ff9cc8');
  bg.addColorStop(1, '#e8458c');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(-4, 0, 26, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Cockpitscheibe
  ctx.fillStyle = '#9fe3ff';
  ctx.beginPath();
  ctx.moveTo(-28, -1);
  ctx.quadraticCurveTo(-26, -13, -12, -13);
  ctx.lineTo(-10, -1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(-22, -10, 3, 6);
  // Schweinchen-Logo
  ctx.fillStyle = '#f2c3c8';
  circle(ctx, 4, 1, 6);
  ctx.fillStyle = '#e8a7b1';
  ctx.beginPath();
  ctx.ellipse(4, 2.5, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = OL;
  circle(ctx, 3, 2.5, 0.7);
  circle(ctx, 5, 2.5, 0.7);
  // Rotormast + Hauptrotor (Drehung als flackernde Ellipse)
  ctx.fillStyle = '#5b6873';
  ctx.fillRect(-6, -21, 4, 7);
  const rw = 42 + Math.sin(gameT * 50) * 8;
  ctx.fillStyle = 'rgba(60,60,80,0.25)';
  ctx.beginPath();
  ctx.ellipse(-4, -21, rw, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,40,0.85)';
  ctx.lineWidth = 2.5;
  const a = gameT * 40;
  ctx.beginPath();
  ctx.moveTo(-4 - Math.cos(a) * rw, -21);
  ctx.lineTo(-4 + Math.cos(a) * rw, -21);
  ctx.stroke();
  ctx.restore();
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

// John Pork: glatter rosa Schweinekopf, graues Shirt, offenes rot kariertes Flanellhemd
function drawPork(p, x) {
  const OL = '#3b1d2a';
  const SKIN = '#f2c3c8';
  const FLANNEL = '#a3243a';
  const f = p.facing;
  const armsUp = p.bee > 0 || p.vy < -250 || (p.call && p.call.phase === 'fly');
  ctx.save();
  ctx.translate(x, p.y);
  const sq = p.squash;
  ctx.scale(1 + 0.16 * sq, 1 - 0.16 * sq);
  if (p.spin) {
    ctx.translate(0, -32);
    ctx.rotate(p.spin * p.spinDir);
    ctx.translate(0, 32);
  }
  if (p.sliding) {               // Run-Modus: nach hinten gelehnt rutschen
    ctx.translate(16 * f, -1);
    ctx.rotate(-1.35 * f);
  }
  const lift = p.shoes > 0 ? 9 : 0;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Federn unter den Schuhen
  if (lift) {
    for (const dx of [-6, 6]) {
      ctx.strokeStyle = '#4d5866';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k <= 5; k++) ctx.lineTo(dx + (k % 2 ? 3.5 : -3.5), -lift + k * (lift / 5));
      ctx.stroke();
      ctx.strokeStyle = '#c9d3df';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  ctx.translate(0, -lift);

  // Beine (Jeans) – im Run-Modus mit Laufanimation (runPhase)
  const rp = p.runPhase;
  const leg = d => {
    if (rp === undefined) return [0, 0];
    const ph = rp + (d < 0 ? 0 : Math.PI);
    return [Math.sin(ph) * 4.5 * f, Math.min(0, -Math.cos(ph) * 4)];
  };
  const legs = [[-6, ...leg(-1)], [6, ...leg(1)]];
  ctx.strokeStyle = OL;
  ctx.lineWidth = 2.2;
  ctx.fillStyle = '#3e6aad';
  for (const [dx, ox, oy] of legs) {
    rr(ctx, dx - 4.5 + ox, -18, 9, 15 + oy, 3);
    ctx.fill();
    ctx.stroke();
  }

  // Schuhe
  for (const [dx, ox, oy] of legs) {
    ctx.save();
    ctx.translate(0, oy);
    const sx = dx + f * 1.8 + ox;
    ctx.fillStyle = lift ? '#ff3b5c' : '#f4f4f4';
    ctx.strokeStyle = OL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - 6.5 * f, -1);
    ctx.lineTo(sx - 6.5 * f, -5.5);
    ctx.quadraticCurveTo(sx - 2 * f, -8, sx + 2 * f, -6);
    ctx.quadraticCurveTo(sx + 7.5 * f, -5, sx + 7.5 * f, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#cfc8cc';
    rr(ctx, sx - 7, -2, 14.5, 2.2, 1.1);
    ctx.fill();
    ctx.restore();
  }

  // Arme in Flanell-Ärmeln
  // Arme als Punktlisten [Schulter, (Ellbogen), Hand]
  const onPhone = p.call && p.call.phase !== 'fly';
  const arms = [-1, 1].map(d => {
    if (onPhone && d === f) return [[d * 10, -30], [d * 21, -34], [d * 19, -45]]; // Handy am Ohr
    const swing = rp === undefined ? 0 : Math.sin(rp + (d < 0 ? Math.PI : 0)) * 5 * f;
    return armsUp ? [[d * 10, -30], [d * 18, -48]] : [[d * 10, -30], [d * 18 + swing, -18]];
  });
  const armPath = pts => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts) ctx.lineTo(px, py);
  };
  for (const pts of arms) {
    ctx.strokeStyle = OL;
    ctx.lineWidth = 8.5;
    armPath(pts);
    ctx.stroke();
    ctx.strokeStyle = FLANNEL;
    ctx.lineWidth = 5.5;
    armPath(pts);
    ctx.stroke();
    const [bx, by] = pts[pts.length - 1];
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = OL;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(bx, by, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Oberkörper: graues Shirt in der Mitte, offenes Karohemd außen
  const torso = () => {
    ctx.beginPath();
    ctx.moveTo(-11.5, -17);
    ctx.lineTo(-13, -31);
    ctx.quadraticCurveTo(-12.5, -36, -6, -36.5);
    ctx.lineTo(6, -36.5);
    ctx.quadraticCurveTo(12.5, -36, 13, -31);
    ctx.lineTo(11.5, -17);
    ctx.closePath();
  };
  torso();
  ctx.fillStyle = FLANNEL;
  ctx.fill();
  ctx.save();
  torso();
  ctx.clip();
  ctx.fillStyle = 'rgba(60,8,20,0.45)';
  for (let k = -14; k < 14; k += 6) ctx.fillRect(k, -38, 2.5, 22);
  for (let k = -36; k < -16; k += 6) ctx.fillRect(-14, k, 28, 2.5);
  ctx.fillStyle = 'rgba(255,190,190,0.25)';
  for (let k = -12; k < 14; k += 6) ctx.fillRect(k, -38, 0.8, 22);
  // graues Shirt
  ctx.fillStyle = '#8e9299';
  ctx.beginPath();
  ctx.moveTo(-5, -36.5);
  ctx.lineTo(-4.5, -17);
  ctx.lineTo(4.5, -17);
  ctx.lineTo(5, -36.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = OL;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-5, -36); ctx.lineTo(-4.5, -17.5);
  ctx.moveTo(5, -36); ctx.lineTo(4.5, -17.5);
  ctx.stroke();
  ctx.lineWidth = 2.4;
  torso();
  ctx.stroke();
  // Hemdkragen
  ctx.fillStyle = '#8a1c30';
  ctx.lineWidth = 1.6;
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * 4, -37);
    ctx.lineTo(d * 10, -36);
    ctx.lineTo(d * 5.5, -31);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Schlappohren (stehen seitlich ab)
  for (const d of [-1, 1]) {
    ctx.fillStyle = '#e3a9b1';
    ctx.strokeStyle = OL;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(d * 10, -63);
    ctx.quadraticCurveTo(d * 24, -66, d * 24, -54);
    ctx.quadraticCurveTo(d * 23, -48, d * 18, -50);
    ctx.quadraticCurveTo(d * 16, -56, d * 14, -58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c98892';
    ctx.beginPath();
    ctx.moveTo(d * 13, -61.5);
    ctx.quadraticCurveTo(d * 21.5, -63, d * 21.5, -55);
    ctx.quadraticCurveTo(d * 19, -55, d * 15.5, -58.5);
    ctx.closePath();
    ctx.fill();
  }

  // Kopf: glatt und rund, leicht breitere Backen
  const hg = ctx.createRadialGradient(-4 + f * 3, -57, 2, f * 2, -48, 23);
  hg.addColorStop(0, '#fde6e8');
  hg.addColorStop(0.6, SKIN);
  hg.addColorStop(1, '#e2a3ad');
  ctx.fillStyle = hg;
  ctx.strokeStyle = OL;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -66);
  ctx.bezierCurveTo(12, -66, 18, -58, 18, -50);
  ctx.bezierCurveTo(18.5, -38, 11, -32, 0, -32);
  ctx.bezierCurveTo(-11, -32, -18.5, -38, -18, -50);
  ctx.bezierCurveTo(-18, -58, -12, -66, 0, -66);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Augen: klein, dunkel, ruhig
  for (const ex of [-6.5, 6.5]) {
    const cx = ex + f * 2.5, cy = -54;
    ctx.fillStyle = '#2a1a20';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 2.3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    circle(ctx, cx - 0.7, cy - 0.6, 0.6);
    ctx.strokeStyle = 'rgba(120,60,75,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 3.2, cy - 2);
    ctx.quadraticCurveTo(cx, cy - 3.6, cx + 3.2, cy - 2);
    ctx.stroke();
  }

  // Rüssel: groß und rund
  const sx = f * 3.5, sy = -45.5;
  const sg = ctx.createRadialGradient(sx - 2, sy - 3, 1, sx, sy, 10);
  sg.addColorStop(0, '#fbd9dd');
  sg.addColorStop(1, '#e8a7b1');
  ctx.fillStyle = sg;
  ctx.strokeStyle = OL;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 9.5, 6.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a2630';
  ctx.beginPath();
  ctx.ellipse(sx - 3.4, sy + 0.4, 1.5, 2.3, -0.15, 0, Math.PI * 2);
  ctx.ellipse(sx + 3.4, sy + 0.4, 1.5, 2.3, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Breites, entspanntes Grinsen
  ctx.strokeStyle = OL;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(f * 3.5 - 9, -37);
  ctx.quadraticCurveTo(f * 3.5, -33.2, f * 3.5 + 9, -37);
  ctx.stroke();
  // Handy am Ohr während des Anrufs
  if (p.call && p.call.phase !== 'fly') {
    drawPhone(f * 19, -52, 0.75, f * 0.3);
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = OL;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(f * 19, -45, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // Heli-Seil
  if (p.call && p.call.phase !== 'dial' && p.call.rope > 0) {
    const c = p.call;
    const hx = c.hx + (x - p.x), hy = heliHook(p);
    const endY = hy + c.rope;
    ctx.strokeStyle = '#3b2a1e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(c.phase === 'fly' ? x : hx, endY);
    ctx.stroke();
    ctx.strokeStyle = '#c9a36b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#8a99a6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(c.phase === 'fly' ? x : hx, endY + 3, 4, 0, Math.PI);
    ctx.stroke();
  }

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

function drawBackground(t, mOverride) {
  // Welt hängt davon ab, wie weit man ist (Classic: Höhe, Run: Strecke); Übergang über 40 m
  const m = mOverride !== undefined ? mOverride : Math.max(0, altAt(camY + H * 0.5));
  const seg = Math.floor(m / THEME_LEN);
  const i = state === 'menu' ? 0 : themeForSeg(seg);   // Hauptmenü immer am Strand
  const j = state === 'menu' ? 0 : themeForSeg(seg + 1);
  const frac = (m % THEME_LEN) - (THEME_LEN - 40);
  ctx.drawImage(getBg(i), 0, 0, W, H);
  drawAmbient(THEMES[i].amb, t, camY);
  if (frac > 0) {
    const a = frac / 40;
    ctx.globalAlpha = a;
    ctx.drawImage(getBg(j), 0, 0, W, H);
    drawAmbient(THEMES[j].amb, t, camY);
    ctx.globalAlpha = 1;
  } else if (state === 'playing') {
    prepareBg(j); // nächste Welt schon mal (in Streifen) vorbereiten
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
  if (mode === 'run' && state !== 'menu') { runRender(); return; }
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
  if (player && player.call && player.call.phase !== 'dial') drawHeli(player.call.hx, player.call.hy, -1);
  if (heliLeave) drawHeli(heliLeave.x, heliLeave.y, -1);
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
  drawCallFx();
}

// Bildschirm-Effekte rund um den Handy-Anruf
function drawCallFx() {
  const c = player && player.call;
  if (c && c.phase === 'fly') {
    // Regenbogen-Schleier
    const hue = (gameT * 300) % 360;
    const gr = ctx.createLinearGradient(0, 0, W, H);
    for (let k = 0; k <= 4; k++) gr.addColorStop(k / 4, `hsla(${(hue + k * 72) % 360},100%,60%,0.42)`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    // Speed-Linien
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = AMB[i];
      const yy = wrapMod(a.y * H + gameT * (1400 + a.s * 900), H + 120) - 60;
      ctx.beginPath();
      ctx.moveTo(a.x * W, yy);
      ctx.lineTo(a.x * W, yy + 40 + a.s * 50);
      ctx.stroke();
    }
  }
  if (c && c.phase !== 'fly') {
    // Abgedunkelt + "John Pork ruft an..."
    const k = c.phase === 'dial' ? Math.min(1, c.t * 3) : Math.max(0, 1 - c.t * 1.5);
    ctx.fillStyle = `rgba(15,5,25,${0.45 * k})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#3b1d2a';
    ctx.fillStyle = '#ffd1dc';
    ctx.font = '34px "Luckiest Guy", sans-serif';
    const pulse = 1 + Math.sin(gameT * 8) * 0.04;
    ctx.save();
    ctx.translate(W / 2, H * 0.2);
    ctx.scale(pulse, pulse);
    ctx.strokeText('John Pork', 0, 0);
    ctx.fillText('John Pork', 0, 0);
    ctx.font = '20px "Luckiest Guy", sans-serif';
    ctx.fillStyle = '#ffffff';
    const dots = '.'.repeat(1 + Math.floor(gameT * 3) % 3);
    ctx.strokeText('ruft an' + dots, 0, 30);
    ctx.fillText('ruft an' + dots, 0, 30);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, flash)})`;
    ctx.fillRect(0, 0, W, H);
  }
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
  puShoes: $('puShoes'), puBee: $('puBee'), puHeli: $('puHeli'),
  overExtra: $('overExtra'), modeSelect: $('modeSelect'), runStats: $('runStats')
};
const show = (e, on) => e.classList.toggle('hidden', !on);

function setPlayUi(on) {
  const is3d = mode === 'run3d';         // 3D Run: eigenes HUD, Wischen statt Buttons
  show(el.hud, on && !is3d);
  show($('hud3d'), on && is3d);
  show(el.btnPause, on);
  show(el.left, on && !is3d);
  show(el.right, on && !is3d);
}

const CTRL_ICONS = {
  classic: ['M15 4 L7 12 L15 20', 'M9 4 L17 12 L9 20'],
  run: ['M4 8 L12 16 L20 8', 'M4 16 L12 8 L20 16'],  // links: sliden (runter), rechts: springen (hoch)
  run3d: ['M15 4 L7 12 L15 20', 'M9 4 L17 12 L9 20']  // im 3D Run nicht sichtbar (Wischsteuerung)
};
function setMode(m) {
  mode = m;
  show(canvas, m !== 'run3d');
  show($('game3d'), m === 'run3d');
  el.left.querySelector('path').setAttribute('d', CTRL_ICONS[m][0]);
  el.right.querySelector('path').setAttribute('d', CTRL_ICONS[m][1]);
  el.left.setAttribute('aria-label', m === 'run' ? 'Sliden' : 'Links');
  el.right.setAttribute('aria-label', m === 'run' ? 'Springen' : 'Rechts');
  show(el.runStats, m === 'run');
  for (const id of ['puShoes', 'puBee', 'puHeli', 'puMagnet', 'puShield', 'puTurbo']) show($(id), false);
}

// Gesammelte Handys des laufenden Runs aufs Konto buchen (nur was noch nicht gebucht ist)
function bankTruffles() {
  if (mode !== 'run' || !run) return;
  const add = run.truffles - (run.banked || 0);
  if (add <= 0) return;
  run.banked = run.truffles;
  save.earned += add;
  truffleBank = walletNow();
  saveProgress();
}

// 3D Run: Handys schon während der Runde sichern (auch bei Abbruch übers Menü)
function bankPhones3d() {
  if (mode !== 'run3d' || !r3) return;
  const add = r3.phonesN - (r3.banked || 0);
  if (add <= 0) return;
  r3.banked = r3.phonesN;
  save.phones += add;
  saveProgress();
}

function refreshBests() {
  $('walletVal').textContent = truffleBank;
  $('shopWallet').textContent = truffleBank;
  $('bestClassic').textContent = `Classic ${best} m`;
  $('bestRun').textContent = `Run ${bestRun} m`;
  $('wallet3dVal').textContent = wallet3dNow();
  $('shop3dWallet').textContent = wallet3dNow();
  $('best3d').textContent = `3D Jump 'n' Run ${save.best3d} m`;
}

function startGame() {
  setMode('classic');
  Sound.stopLoops();
  heliLeave = null;
  flash = 0;
  platforms = [];
  particles = [];
  popups = [];
  camY = 0;
  gameT = 0;
  meters = 0;
  itemCooldown = 3;
  startY = H - 70;
  themeSeq = [];
  platforms.push({ x: W / 2 - 70, y: startY, w: 140, h: 14, vx: 0, theme: themeAt(0), item: null });
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
  show(el.modeSelect, false);
  el.btnPause.classList.remove('active');
  setPlayUi(true);
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  Sound.stopLoops();
  if (mode === 'run3d') Sound.click();
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
  if (mode === 'run3d') { Sound.click(); r3Resume(); return; }
  if (player.bee > 0) Sound.startBuzz();
  if (player.call && player.call.phase !== 'dial') Sound.startHeli();
}

function gameOver() {
  state = 'over';
  Sound.stopLoops();
  Sound.death();
  const isRun = mode === 'run';
  if (mode === 'run3d') { gameOver3d(); return; }
  bankTruffles();
  const isRecord = meters > (isRun ? bestRun : best);
  if (isRecord && isRun) {
    bestRun = meters;
    saveProgress();
  } else if (isRecord) {
    best = meters;
    saveProgress();
  }
  setPlayUi(false);
  el.overScore.textContent = `${meters} m`;
  show(el.overExtra, isRun);
  if (isRun) el.overExtra.textContent = `+${run.truffles} Handys (gesamt ${truffleBank})`;
  el.overBest.textContent = isRecord ? 'Neuer Rekord!' : `Rekord: ${isRun ? bestRun : best} m`;
  el.overBest.classList.toggle('record', isRecord);
  setTimeout(() => { if (state === 'over') show(el.over, true); }, 450);
}

// 3D Run: eigene Bestleistung und Handy-Statistik (eigene Speicher-Schlüssel)
function gameOver3d() {
  const phones = r3 ? r3.phonesN : 0;
  const isRecord = meters > save.best3d;
  if (isRecord) save.best3d = meters;
  bankPhones3d();
  save.bestPhones = Math.max(save.bestPhones, phones);
  saveProgress();
  setPlayUi(false);
  el.overScore.textContent = `${meters} m`;
  show(el.overExtra, true);
  el.overExtra.textContent = `+${phones} Handys (gesamt ${wallet3dNow()})`;
  el.overBest.textContent = isRecord ? 'Neuer Rekord!' : `Rekord: ${save.best3d} m`;
  el.overBest.classList.toggle('record', isRecord);
  setTimeout(() => { if (state === 'over') show(el.over, true); }, 1300);
}

function toMenu() {
  if (mode === 'run3d') { bankPhones3d(); r3Exit(); setMode('classic'); }
  bankTruffles();
  Sound.stopLoops();
  heliLeave = null;
  flash = 0;
  state = 'menu';
  setPlayUi(false);
  show(el.pause, false);
  show(el.over, false);
  refreshBests();
  showMenuSide();
}

/* ---------- Zwei Menü-Seiten: 2D (Classic + Run) und 3D (3D Jump 'n' Run) ----------
   Jede Seite hat ihr eigenes Handy-Konto und ihren eigenen Shop. */
let menuSide = store.get('porkjump_menu_side', '2d') === '3d' ? '3d' : '2d';
function showMenuSide() {
  const is3d = menuSide === '3d' && typeof E !== 'undefined' && E;
  show(el.menu, !is3d);
  show($('menu3d'), !!is3d);
  show(canvas, !is3d);
  show($('game3d'), !!is3d);
  if (is3d) menu3dEnter(); else initDemo();
}
async function goMenu3d() {
  if (!(await ensure3d())) return;
  if (state !== 'menu') return;
  menuSide = '3d';
  store.set('porkjump_menu_side', '3d');
  refreshBests();
  showMenuSide();
}
function goMenu2d() {
  menuSide = '2d';
  store.set('porkjump_menu_side', '2d');
  if (typeof E !== 'undefined' && E) menu3dLeave();
  showMenuSide();
}
function openModes() {
  const is3d = menuSide === '3d';
  show($('btnClassic'), !is3d);
  show($('btnRun'), !is3d);
  show($('btnRun3d'), is3d);
  show(el.modeSelect, true);
}

function updateHud() {
  if (state !== 'playing' && state !== 'paused') return;
  if (mode === 'run') { runHud(); return; }
  const txt = `${meters} m`;
  if (el.meters.textContent !== txt) el.meters.textContent = txt;
  const pu = (e, v, max) => {
    show(e, v > 0);
    if (v > 0) {
      e.querySelector('i').style.width = `${(v / max) * 100}%`;
      e.classList.toggle('blink', v < Math.min(3, max * 0.35));
    }
  };
  pu(el.puShoes, player.shoes, SHOE_TIME);
  pu(el.puBee, player.bee, BEE_TIME);
  const c = player.call;
  pu(el.puHeli, c && c.phase === 'fly' ? CALL_DIST - c.dist : 0, CALL_DIST);
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
const retry = () => (mode === 'run3d' ? startRun3d() : mode === 'run' ? startRun() : startGame());
tap('btnStart', openModes);
tap('btnStart3d', openModes);
tap('btnGo3d', goMenu3d);
tap('btnGo2d', goMenu2d);
tap('btnClassic', startGame);
tap('btnRun', () => startRun());
tap('btnRun3d', () => startRun3d());
tap('btnModeBack', () => show(el.modeSelect, false));
tap('btnShop', openShop);
tap('btnShopBack', () => show($('shop'), false));
tap('btnShop3d', openShop3d);
tap('btnShop3dBack', () => show($('shop3d'), false));

/* ---------- Shop (Vorschau): Skins als schwarze Umrisse ---------- */
// Pork wird auf das Spiel-Canvas gemalt, ausgeschnitten und komplett schwarz gefärbt.
// Jede Variante bekommt ein anderes Accessoire, damit die Umrisse neugierig machen.
function makeSilhouette(variant) {
  const s = 4, pw = 64, ph = 86;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw * s, ph * s);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const p = newPlayer(pw / 2, ph - 4);
  drawPork(p, pw / 2);
  ctx.fillStyle = '#000';
  const hx = pw / 2, hy = ph - 4 - 66;           // Oberkante des Kopfes
  if (variant === 0) {                            // Cap
    ctx.beginPath(); ctx.ellipse(hx, hy + 6, 15, 9, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(hx, hy + 3, 22, 4);
  } else if (variant === 1) {                     // Krone
    ctx.beginPath();
    ctx.moveTo(hx - 13, hy + 4); ctx.lineTo(hx - 13, hy - 10); ctx.lineTo(hx - 6, hy - 3); ctx.lineTo(hx, hy - 13);
    ctx.lineTo(hx + 6, hy - 3); ctx.lineTo(hx + 13, hy - 10); ctx.lineTo(hx + 13, hy + 4);
    ctx.closePath(); ctx.fill();
  } else {                                        // Kopfhörer
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(hx, hy + 18, 21, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(hx - 20, hy + 20, 5, 8, 0, 0, Math.PI * 2); ctx.ellipse(hx + 20, hy + 20, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
  }
  const tmp = document.createElement('canvas');
  tmp.width = pw * s;
  tmp.height = ph * s;
  const g = tmp.getContext('2d');
  g.drawImage(canvas, 0, 0, pw * s, ph * s, 0, 0, pw * s, ph * s);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#1a1018';
  g.fillRect(0, 0, tmp.width, tmp.height);
  return tmp.toDataURL();
}
function openShop() {
  refreshBests();
  document.querySelectorAll('#shop .skin-pic img').forEach(img => {
    if (!img.src) img.src = makeSilhouette(+img.dataset.variant);
  });
  show($('shop'), true);
}
function openShop3d() {
  refreshBests();
  document.querySelectorAll('#shop3d .skin-pic img').forEach(img => {
    if (!img.src) { try { img.src = make3dSilhouette(+img.dataset.variant3d); } catch (e) { /* ohne Bild */ } }
  });
  show($('shop3d'), true);
}
tap('btnRetry', retry);
tap('btnOverMenu', toMenu);
tap('btnToMenu', toMenu);
tap('btnGear', () => show(el.settings, true));
tap('btnGear3d', () => show(el.settings, true));
tap('btnCloseSettings', () => show(el.settings, false));

/* ---------- Spielstand-Code (Gerätewechsel) ---------- */
// Code = Spielstand als Text + Prüfsumme. Laden führt zusammen (höherer Wert gewinnt), es geht nie etwas verloren.
function checksum(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function exportSave() {
  const body = JSON.stringify({ b: save.best, r: save.bestRun, e: save.earned, s: save.spent, o: save.owned, b3: save.best3d, ph: save.phones, bp: save.bestPhones, s3: save.spent3d, o3: save.owned3d });
  return 'PJ1-' + btoa(unescape(encodeURIComponent(body))) + '-' + checksum(body);
}
function importSave(code) {
  const m = /^PJ1-([A-Za-z0-9+/=]+)-([a-z0-9]+)$/.exec(code.trim().replace(/\s+/g, ''));
  if (!m) return false;
  let body;
  try { body = decodeURIComponent(escape(atob(m[1]))); } catch (e) { return false; }
  if (checksum(body) !== m[2]) return false;
  let d;
  try { d = JSON.parse(body); } catch (e) { return false; }
  mergeSave({ best: d.b, bestRun: d.r, earned: d.e, spent: d.s, owned: d.o, best3d: d.b3, phones: d.ph, bestPhones: d.bp, spent3d: d.s3, owned3d: d.o3 });
  saveProgress();
  refreshBests();
  return true;
}
const saveMsg = t => { $('saveMsg').textContent = t; };
tap('btnSaveExport', () => {
  const box = $('saveCode');
  box.value = exportSave();
  box.focus();
  box.select();
  const done = () => saveMsg('Code kopiert. Auf dem neuen Gerät einfügen und „Code laden“ drücken.');
  try {
    navigator.clipboard.writeText(box.value).then(done, () => saveMsg('Code markiert, bitte kopieren.'));
  } catch (e) { saveMsg('Code markiert, bitte kopieren.'); }
});
tap('btnSaveImport', () => {
  saveMsg(importSave($('saveCode').value) ? `Geladen! Du hast jetzt ${truffleBank} Handys (2D) und ${wallet3dNow()} Handys (3D).` : 'Der Code stimmt nicht. Bitte komplett kopieren.');
});
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
    if (key === 'right' && ids.size === 0) input.rightPress++;
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
// Run-Modus: zusätzlich Hoch/Leertaste = springen, Runter = sliden
const runKeyMap = { ArrowUp: 'right', w: 'right', W: 'right', ' ': 'right', ArrowDown: 'left', s: 'left', S: 'left' };
const keyFor = e => keyMap[e.key] || (mode === 'run' && state === 'playing' ? runKeyMap[e.key] : undefined);
const typing = e => e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');
window.addEventListener('keydown', e => {
  if (typing(e)) return;          // im Textfeld (Spielstand-Code) normal tippen lassen
  if (mode === 'run3d' && state === 'playing' && r3Key(e)) { e.preventDefault(); return; }
  const k = keyFor(e);
  if (k) {
    if (k === 'right' && !e.repeat && !input.right) input.rightPress++;
    input[k] = true;
    e.preventDefault();
  }
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame();
  }
  if ((e.key === 'Enter' || e.key === ' ') && (state === 'menu' || state === 'over')) {
    Sound.init();
    if (state === 'menu' && menuSide === '3d') startRun3d(); else retry();
  }
});
window.addEventListener('keyup', e => {
  if (typing(e)) return;
  const k = keyMap[e.key] || runKeyMap[e.key];
  if (k) input[k] = false;
});

// App in den Hintergrund -> automatisch Pause
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); bankTruffles(); bankPhones3d(); } });
window.addEventListener('pagehide', () => { bankTruffles(); bankPhones3d(); });
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
  if (state === 'menu' && menuSide === '3d') { menu3dFrame(dt); return; }
  if (mode === 'run3d' && state !== 'menu') { r3Frame(dt); return; }
  if (state === 'playing') {
    // Bildzeit in gleich große Physik-Schritte (max. STEP) teilen: kein Ruckeln durch 1/2/3 Schritte pro Bild
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    const h = dt / n;
    for (let i = 0; i < n && state === 'playing'; i++) {
      if (mode === 'run') runUpdate(h); else update(h);
    }
    workBg();
  } else if (state === 'menu') {
    updateDemo(dt);
  } else if (state === 'over') {
    updateFx(dt);
  }
  render();
  updateHud();
}

resize();
refreshBests();
initCloudSave();
$('version').textContent = `Version ${VERSION}`;
refreshSoundButtons();
initDemo();
requestAnimationFrame(frame);
// zuletzt im 3D-Menü gewesen: erst wechseln, wenn auch run3d.js geladen ist
if (menuSide === '3d') {
  menuSide = '2d';
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', goMenu3d);
  else setTimeout(goMenu3d, 0);
}
// Wenn die Comic-Schrift geladen ist, einmal neu zeichnen lassen
if (document.fonts) document.fonts.ready.then(() => bgCache.clear());
