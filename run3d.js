'use strict';

/* =========================================================
   PORK JUMP – 3D RUN
   Dritter Spielmodus: echter 3D-Endless-Runner (Three.js).
   - Three.js wird erst geladen, wenn man "3D Run" startet
     (Classic und Run bleiben davon völlig unberührt).
   - Eigenes WebGL-Canvas, hängt sich aber in die vorhandene
     Hauptschleife, Pause, Game Over, Sound und Spielstand.
   - Strecke = Mittellinie mit Kurven/Steigungen, drei Spuren
     laufen immer quer zur Strecke (auch in Kurven).
   - Strecke, Deko, Handys und Hindernisse werden in Stücken
     gebaut und hinter Pork wieder abgebaut bzw. wiederverwendet.
   ========================================================= */

const THREE_URL = 'vendor/three.min.js';

// ---------- Werte zum Drehen ----------
const R3 = {
  LANE_W: 2.4,          // Abstand der Spuren
  ROAD_HALF: 4.2,       // halbe Wegbreite
  SPEED0: 11,           // Start-Tempo (m/s)
  SPEED_MAX: 23,
  SPEED_RAMP: 1900,     // nach so vielen Metern ist ~63 % des Tempo-Zuwachses erreicht
  G: 34,
  JUMP_V: 10.8,         // Sprung ≈ 1,7 m hoch
  SHOE_JUMP_V: 17,      // mit Federschuhen ≈ 4,2 m hoch
  SLIDE_T: 0.72,
  LANE_RATE: 14,        // wie schnell der Spurwechsel ist
  HEARTS: 3,
  INVULN: 1.6,
  SHOES_T: 10,
  BEE_T: 10.5,          // Bienenflug: 3x so schnell und ca. 5x so weit wie früher (6 s bei normalem Tempo)
  BEE_SPEED: 3,
  BEE_H: 4.6,           // Flughöhe mit der Biene
  VIEW: 210,            // so weit voraus wird gebaut
  CHUNK: 30,
  ACTIVATE: 105,        // ab dieser Entfernung laufen Gegner los
  STAND_H: 1.7,
  SLIDE_H: 0.8,
  HALF_W: 0.42
};
const SEA_Y = 0;

let E = null;     // Engine (einmal gebaut, wird wiederverwendet)
let r3 = null;    // Zustand des laufenden Runs
let threeLoading = null;

function loadThree() {
  if (window.THREE) return Promise.resolve();
  if (!threeLoading) {
    threeLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = THREE_URL;
      s.onload = () => (window.THREE ? res() : rej(new Error('three')));
      s.onerror = () => { threeLoading = null; rej(new Error('three')); };
      document.head.appendChild(s);
    });
  }
  return threeLoading;
}

/* ---------- Sounds für 3D Run (nutzen das vorhandene Sound-System) ---------- */
Object.assign(Sound, {
  r3Phone(step) {
    const f = 880 * Math.pow(2, Math.min(step, 10) / 12);
    this.tone(f, f, 0.06, 'square', 0.035);
    this.tone(f * 1.5, f * 1.5, 0.08, 'square', 0.03, 0.05);
  },
  r3Land() { this.tone(160, 70, 0.1, 'triangle', 0.09); },
  r3Slide() { this.tone(300, 120, 0.22, 'sawtooth', 0.03); },
  r3Lane() { this.tone(520, 680, 0.05, 'triangle', 0.035); },
  r3Bump() { this.tone(200, 120, 0.12, 'square', 0.08); },
  r3Crash() { this.tone(240, 40, 0.6, 'sawtooth', 0.13); this.tone(90, 40, 0.5, 'square', 0.1, 0.05); },
  r3Shoes() { this.tone(200, 1000, 0.35, 'triangle', 0.16); this.tone(400, 1600, 0.25, 'sine', 0.06, 0.08); },
  r3Beep(hi) { this.tone(hi ? 1320 : 880, hi ? 1320 : 880, hi ? 0.25 : 0.1, 'square', 0.05); }
});

/* =========================================================
   KLEINE HELFER
   ========================================================= */
const r3lerp = (a, b, t) => a + (b - a) * t;
const r3clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = t => t * t * (3 - 2 * t);
const damp = (k, dt) => 1 - Math.exp(-k * dt);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// Mehrere Teile (mit eigener Farbe) zu EINER Geometrie verschmelzen -> wenig Draw-Calls
function mergeParts(parts) {
  const prepared = [];
  let total = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.m) g.applyMatrix4(p.m);
    prepared.push([g, p.c]);
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const cc = new THREE.Color();
  let o = 0;
  for (const [g, c] of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    const pa = g.attributes.position.array;
    for (let i = 0; i < n; i++) {
      if (typeof c === 'function') cc.set(c(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2], i));
      else cc.set(c);
      col[(o + i) * 3] = cc.r;
      col[(o + i) * 3 + 1] = cc.g;
      col[(o + i) * 3 + 2] = cc.b;
    }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

function mtx(x, y, z, ry = 0, s = 1, rx = 0, rz = 0, sy) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, sy === undefined ? s : sy, s));
  return m;
}

// Alle festen Kinder-Meshes einer Gruppe mit gleichem Material zu einem Mesh verschmelzen
function mergeStatic(group) {
  const buckets = new Map();
  for (const ch of group.children.slice()) {
    if (!ch.isMesh || ch.userData.keep) continue;
    const key = ch.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: ch.material, list: [] });
    buckets.get(key).list.push(ch);
  }
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const geos = b.list.map(m => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      return g;
    });
    const names = ['position', 'normal', 'uv', 'color'].filter(n => geos.every(g => g.attributes[n]));
    const out = new THREE.BufferGeometry();
    for (const n of names) {
      const size = geos[0].attributes[n].itemSize;
      const tot = geos.reduce((a, g) => a + g.attributes[n].array.length, 0);
      const arr = new Float32Array(tot);
      let o = 0;
      for (const g of geos) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    }
    out.computeBoundingSphere();
    const mesh = new THREE.Mesh(out, b.mat);
    mesh.castShadow = b.list.some(m => m.castShadow);
    mesh.receiveShadow = b.list.some(m => m.receiveShadow);
    for (const m of b.list) { group.remove(m); m.geometry.dispose(); }
    for (const g of geos) g.dispose();
    group.add(mesh);
  }
}

// Pool für viele gleiche Deko-Objekte: EIN InstancedMesh pro Teil
class IPool {
  constructor(geo, mat, cap, shadow) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !!shadow;
    this.mesh.receiveShadow = false;
    this.free = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = cap - 1; i >= 0; i--) { this.mesh.setMatrixAt(i, zero); this.free.push(i); }
    this.zero = zero;
    this.dirty = true;
    this.shadowWanted = !!shadow;
  }
  add(m, color) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    this.mesh.setMatrixAt(i, m);
    if (color !== undefined) this.mesh.setColorAt(i, color);
    this.dirty = true;
    return i;
  }
  remove(i) {
    if (i < 0) return;
    this.mesh.setMatrixAt(i, this.zero);
    this.free.push(i);
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
}

/* =========================================================
   TEXTUREN (alle selbst gemalt, keine fremden Assets)
   ========================================================= */
function makeTextures() {
  const T = {};
  // Holz-Promenade: Querbretter, dunkle Fugen, Spurmarkierungen aus Seil/Messing
  T.planks = canvasTex(512, 512, (g, w, h) => {
    const r = rng(5);
    for (let y = 0; y < h; y += 32) {
      const base = 150 + r() * 40;
      g.fillStyle = `rgb(${base + 20},${base - 30},${base - 85})`;
      g.fillRect(0, y, w, 32);
      g.strokeStyle = 'rgba(70,35,15,0.25)';
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        const yy = y + 4 + r() * 24;
        g.moveTo(0, yy);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, yy + Math.sin(x * 0.03 + k) * 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,20,8,0.75)';
      g.fillRect(0, y + 30, w, 2);
    }
    // Längsbalken am Rand
    g.fillStyle = 'rgba(90,50,25,0.85)';
    g.fillRect(0, 0, 14, h);
    g.fillRect(w - 14, 0, 14, h);
    // Spurgrenzen: dunkle Linie mit Nagelköpfen
    for (const u of [0.357, 0.643]) {
      const x = u * w;
      g.fillStyle = 'rgba(60,30,12,0.55)';
      g.fillRect(x - 3, 0, 6, h);
      g.fillStyle = 'rgba(220,200,160,0.9)';
      for (let y = 8; y < h; y += 32) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
    }
  }, true);
  T.sand = canvasTex(256, 256, (g, w, h) => {
    const r = rng(9);
    g.fillStyle = '#f2d3a0';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? 'rgba(170,120,70,0.18)' : 'rgba(255,245,220,0.25)';
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    g.strokeStyle = 'rgba(180,130,80,0.12)';
    g.lineWidth = 3;
    for (let y = 10; y < h; y += 22) {
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 4);
      g.stroke();
    }
  }, true);
  // Büffelkaro (rot/schwarz) wie auf dem Charakterbogen
  T.plaid = canvasTex(128, 128, (g, w, h) => {
    const r = rng(11);
    g.fillStyle = '#c2262f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(16,8,10,0.58)';
    for (let k = 0; k < w; k += 32) { g.fillRect(k, 0, 16, h); g.fillRect(0, k, w, 16); }
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,170,170,0.08)'; g.fillRect(r() * w, r() * h, 1, 1); }
  }, true);
  T.plaid.repeat.set(2, 2);
  T.plaidBody = T.plaid.clone();
  T.plaidBody.needsUpdate = true;
  T.plaidBody.repeat.set(7, 3);
  // grau melierter Stoff (T-Shirt) und dunkle Cargo-Hose
  T.tee = canvasTex(64, 64, (g, w, h) => {
    const r = rng(5);
    g.fillStyle = '#585b62';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(40,42,48,0.18)' : 'rgba(200,204,212,0.16)'; g.fillRect(r() * w, r() * h, 1, 1); }
  }, true);
  T.tee.repeat.set(4, 4);
  T.cargo = canvasTex(64, 64, (g, w, h) => {
    const r = rng(3);
    g.fillStyle = '#3a3a3f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(10,10,14,0.25)' : 'rgba(120,120,130,0.14)'; g.fillRect(r() * w, r() * h, 1, 2); }
  }, true);
  T.cargo.repeat.set(3, 3);
  T.stripes = canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8262e';
    for (let x = -h; x < w + h; x += 32) {
      g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.lineTo(x + h + 16, 0); g.lineTo(x + 16, h); g.closePath(); g.fill();
    }
  }, true);
  T.stripesOrange = canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff7a10';
    for (let x = -h; x < w + h; x += 32) {
      g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.lineTo(x + h + 16, 0); g.lineTo(x + 16, h); g.closePath(); g.fill();
    }
  }, true);
  T.wood = canvasTex(128, 128, (g, w, h) => {
    const r = rng(11);
    g.fillStyle = '#b5814a';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = `rgba(${90 + r() * 40},50,20,0.25)`;
      g.fillRect(0, y, w, 32);
      g.fillStyle = 'rgba(60,30,10,0.6)';
      g.fillRect(0, y + 30, w, 2);
    }
    g.strokeStyle = 'rgba(60,30,10,0.75)';
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke();
  });
  T.gateSign = canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d1d24';
    for (let x = -h; x < w; x += 40) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 14, h); g.lineTo(x + 14 + 12, h - 12); g.lineTo(x + 12, h - 12); g.fill(); }
    // Warndreieck mit Ausrufezeichen
    g.fillStyle = '#e8262e';
    g.lineJoin = 'round';
    g.beginPath(); g.moveTo(62, 10); g.lineTo(96, 74); g.lineTo(28, 74); g.closePath(); g.fill();
    g.strokeStyle = '#e8262e'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#ffd23f';
    g.fillRect(58, 30, 8, 26);
    g.fillRect(58, 61, 8, 7);
    g.font = 'bold 40px "Luckiest Guy", Arial Black, sans-serif';
    g.fillStyle = '#e8262e';
    g.textBaseline = 'middle';
    g.fillText('DANGER!', 104, 44, 144);
  });
  T.kioskSign = canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#ff5fa2';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.font = 'bold 54px "Luckiest Guy", Arial Black, sans-serif';
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('EIS', w / 2, h / 2 + 3);
  });
  // Kiosk-Vorderseite: helles Fenster mit Eis-Theke
  T.kioskFront = canvasTex(256, 144, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#d8f6ff');
    bg.addColorStop(1, '#9fe0f2');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // Preistafel
    g.fillStyle = '#ff5fa2';
    g.fillRect(70, 12, 116, 30);
    g.font = 'bold 22px "Luckiest Guy", Arial Black, sans-serif';
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('1 KUGEL 1€', 128, 28, 108);
    // zwei große Waffeln links und rechts
    for (const [x, c] of [[34, '#ff9ac8'], [222, '#9be8b0']]) {
      g.fillStyle = '#d99a52';
      g.beginPath(); g.moveTo(x - 16, 52); g.lineTo(x + 16, 52); g.lineTo(x, 96); g.closePath(); g.fill();
      g.fillStyle = c;
      g.beginPath(); g.arc(x, 48, 18, 0, Math.PI * 2); g.fill();
    }
    // Eis-Wannen in der Theke
    g.fillStyle = '#ffffff';
    g.fillRect(14, 100, w - 28, 34);
    const cols = ['#ff9ac8', '#9be8b0', '#ffe066', '#8a5a3c', '#8fd3ff', '#ff6b6b'];
    cols.forEach((c, i) => {
      const x = 32 + i * 38.5;
      g.fillStyle = c;
      g.beginPath(); g.arc(x, 112, 15, Math.PI, 0); g.fill();
      g.fillRect(x - 15, 112, 30, 16);
    });
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
  });
  T.beachSign = canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#2b6cb0';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.font = 'bold 40px "Luckiest Guy", Arial Black, sans-serif';
    g.fillStyle = '#ffd1dc';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PORK BEACH', w / 2, h / 2 + 2);
  });
  T.screen = canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ff9ad5');
    gr.addColorStop(1, '#6a4cff');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b24';
    g.fillRect(w / 2 - 18, 6, 36, 8);
    g.fillStyle = '#f2c3c8';
    g.beginPath(); g.arc(w / 2, 86, 34, 0, 7); g.fill();
    g.fillStyle = '#e8a7b1';
    g.beginPath(); g.ellipse(w / 2, 96, 15, 11, 0, 0, 7); g.fill();
    g.fillStyle = '#4a2630';
    g.beginPath(); g.ellipse(w / 2 - 5, 96, 3, 4, 0, 0, 7); g.ellipse(w / 2 + 5, 96, 3, 4, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 15px Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('John Pork', w / 2, 146);
    g.fillStyle = '#ff4d4d';
    g.beginPath(); g.arc(w / 2 - 28, 212, 16, 0, 7); g.fill();
    g.fillStyle = '#26d07c';
    g.beginPath(); g.arc(w / 2 + 28, 212, 16, 0, 7); g.fill();
  });
  T.glow = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  // Lichtsäule über Items (unten hell, oben durchsichtig)
  T.beam = canvasTex(16, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  // rotes Warnzeichen über Gegnern
  T.warn = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#ff2a3a';
    g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(28, 13, 8, 26);
    g.fillRect(28, 44, 8, 8);
  });
  T.foam = canvasTex(64, 256, (g, w, h) => {
    const r = rng(17);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.5})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 3 + r() * 8, 2 + r() * 5, 0, 0, 7);
      g.fill();
    }
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, true);
  T.cloud = canvasTex(256, 128, (g, w, h) => {
    const r = rng(23);
    for (let i = 0; i < 26; i++) {
      const x = 30 + r() * (w - 60), y = 50 + r() * 40, rad = 18 + r() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
  return T;
}

/* =========================================================
   HIMMEL, MEER, HORIZONT
   ========================================================= */
// Sonne steht links vorne tief über dem Meer (Pork läuft ungefähr in +z)
const SUN_DIR_ARR = [0.2, 0.075, 0.98];

const SKY_GLSL = `
  uniform vec3 sunDir;
  vec3 skyColor(vec3 d) {
    float h = d.y;
    vec3 zen = vec3(0.17, 0.08, 0.38);
    vec3 mid = vec3(0.63, 0.27, 0.56);
    vec3 hor = vec3(1.0, 0.56, 0.42);
    vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
    col = mix(col, zen, smoothstep(0.2, 0.75, h));
    float s = max(dot(d, sunDir), 0.0);
    col += vec3(1.0, 0.5, 0.22) * pow(s, 6.0) * 0.6;
    col += vec3(1.0, 0.78, 0.45) * pow(s, 48.0) * 0.7;
    col = mix(col, vec3(1.0, 0.95, 0.75), smoothstep(0.9978, 0.9992, s));
    return col;
  }`;

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: E.sunDir } },
    vertexShader: `varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: SKY_GLSL + `
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(vec3(d.x, max(d.y, 0.0), d.z));
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

function makeSea() {
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { sunDir: { value: E.sunDir }, time: { value: 0 } },
    vertexShader: `varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: SKY_GLSL + `
      uniform float time;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        vec2 g = vec2(0.0);
        // Summe von Wellen -> Neigung der Oberfläche
        g += 0.22 * vec2(0.7, 0.71) * cos(dot(p, vec2(0.7, 0.71)) * 0.35 + time * 1.3);
        g += 0.16 * vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 0.55 + time * 1.7);
        g += 0.10 * vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 1.1 + time * 2.3);
        g += 0.05 * vec2(0.2, 0.98) * cos(dot(p, vec2(0.2, 0.98)) * 2.3 + time * 3.1);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float dist = length(vWorld.xz - cameraPosition.xz);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 deep = vec3(0.09, 0.17, 0.36);
        vec3 shallow = vec3(0.2, 0.38, 0.6);
        vec3 col = mix(deep, shallow, 0.5 + 0.5 * n.x);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        col = mix(col, skyColor(normalize(r)), 0.25 + fres * 0.6);
        float sp = max(dot(r, sunDir), 0.0);
        col += vec3(1.0, 0.72, 0.42) * pow(sp, 220.0) * 3.0;
        col += vec3(1.0, 0.5, 0.25) * pow(sp, 24.0) * 0.35;
        vec3 hd = normalize(vec3(vWorld.x - cameraPosition.x, 0.0, vWorld.z - cameraPosition.z));
        col = mix(col, skyColor(vec3(hd.x, 0.0, hd.z)), smoothstep(160.0, 640.0, dist));
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 1, 1), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  sea.frustumCulled = false;
  return sea;
}

// Ferne Kulisse: Inseln, Hügel, Leuchtturm, Segelboote, Wolken – wandert mit der Kamera mit
function makeFarRing() {
  const ring = new THREE.Group();
  const toward = (deg, dist) => {
    const a = (deg * Math.PI) / 180;
    return [Math.sin(a) * dist, Math.cos(a) * dist];
  };
  const hillMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const hill = (deg, dist, rad, hgt, top, bottom) => {
    const geo = new THREE.ConeGeometry(rad, hgt, 9, 3);
    const c1 = new THREE.Color(top), c2 = new THREE.Color(bottom);
    const pa = geo.attributes.position, cols = [];
    for (let i = 0; i < pa.count; i++) {
      const t = (pa.getY(i) + hgt / 2) / hgt;
      const c = c2.clone().lerp(c1, t);
      cols.push(c.r, c.g, c.b);
      pa.setX(i, pa.getX(i) * (1 + Math.sin(i * 1.7) * 0.08));
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, hillMat);
    const [x, z] = toward(deg, dist);
    m.position.set(x, hgt / 2 - 6, z);
    m.scale.y = 0.55;
    ring.add(m);
    return m;
  };
  // Gegenlicht-Inseln bei der Sonne (dunkel, lila)
  hill(4, 640, 60, 70, '#5b2a5e', '#c9667a');
  hill(17, 680, 110, 120, '#4e2556', '#c05f78');
  hill(30, 600, 50, 60, '#6a3366', '#d9727f');
  hill(-8, 700, 45, 40, '#6a3366', '#d9727f');
  // Küste rechts (von der Sonne angestrahlt)
  for (let i = 0; i < 9; i++) {
    hill(-50 - i * 24, 560 + (i % 3) * 60, 90 + (i % 4) * 30, 70 + (i % 3) * 40, '#b0685f', '#e29a86');
  }
  hill(160, 650, 120, 80, '#9a5a66', '#e0927f');
  hill(200, 640, 100, 70, '#8e5068', '#dc8a80');
  // Leuchtturm auf der Insel
  const lh = new THREE.Group();
  const lhMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const tower = new THREE.CylinderGeometry(3.5, 5, 34, 12, 6);
  const tc = [], tpa = tower.attributes.position;
  for (let i = 0; i < tpa.count; i++) {
    const band = Math.floor((tpa.getY(i) + 17) / 6.8) % 2;
    const c = new THREE.Color(band ? '#e8476a' : '#f5e6ea').multiplyScalar(0.75);
    tc.push(c.r, c.g, c.b);
  }
  tower.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  lh.add(new THREE.Mesh(tower, lhMat));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff3b0', fog: false }));
  lamp.position.y = 19;
  lh.add(lamp);
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(14, 160, 16, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.x = 80;
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 19;
  beamPivot.add(beam);
  lh.add(beamPivot);
  const [lx, lz] = toward(19, 660);
  lh.position.set(lx, 34, lz);
  ring.add(lh);
  E.beamPivot = beamPivot;
  // Segelboote (Silhouetten im Gegenlicht)
  E.boats = [];
  const boatMat = new THREE.MeshBasicMaterial({ color: '#3d2048', fog: false, side: THREE.DoubleSide });
  const sailMat = new THREE.MeshBasicMaterial({ color: '#ffe0d0', fog: false, side: THREE.DoubleSide });
  for (const [deg, dist] of [[6, 330], [16, 420], [32, 300], [-12, 460]]) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 2.6), boatMat);
    b.add(hull);
    const sail = new THREE.Shape();
    sail.moveTo(0, 0); sail.lineTo(0, 11); sail.lineTo(5.5, 0); sail.closePath();
    const sm = new THREE.Mesh(new THREE.ShapeGeometry(sail), sailMat);
    sm.position.set(-1, 0.8, 0);
    b.add(sm);
    const [x, z] = toward(deg, dist);
    b.position.set(x, 0.6, z);
    b.rotation.y = deg;
    b.userData.ph = deg;
    ring.add(b);
    E.boats.push(b);
  }
  // Wolken (rosa angestrahlt)
  const cloudMat = new THREE.SpriteMaterial({ map: E.tex.cloud, color: '#ff9fb0', transparent: true, opacity: 0.5, fog: false, depthWrite: false });
  const r = rng(31);
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(cloudMat);
    const deg = -70 + r() * 160;
    const [x, z] = toward(deg, 820);
    s.position.set(x, 150 + r() * 260, z);
    s.scale.set(260 + r() * 220, 38 + r() * 30, 1);
    ring.add(s);
  }
  return ring;
}

/* =========================================================
   MATERIALIEN
   ========================================================= */
function makeMaterials() {
  const M = {};
  const std = (color, rough = 0.7, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra));
  // John Pork (Charakterbogen): pfirsichfarbene Haut, rosa Rüssel
  M.skin = std('#e6ac8f', 0.55, { emissive: '#4a1e10', emissiveIntensity: 0.1 });
  M.snout = std('#ec9a96', 0.45, { emissive: '#4a1414', emissiveIntensity: 0.1 });
  M.ear = std('#dfa486', 0.6, { emissive: '#4a1e10', emissiveIntensity: 0.08 });
  M.brow = std('#cf9579', 0.75);
  M.nostril = std('#5a2428', 0.6);
  M.mouth = std('#4a1a20', 0.6);
  M.teeth = std('#fbf6ee', 0.35);
  M.tongue = std('#e0707e', 0.4);
  M.dark = std('#2a1a20', 0.4);
  M.eye = std('#120c0c', 0.12, { metalness: 0.2 });
  M.white = std('#ffffff', 0.4);
  M.plaid = std('#ffffff', 0.85, { map: E.tex.plaid });
  M.plaidBody = std('#ffffff', 0.85, { map: E.tex.plaidBody, side: THREE.DoubleSide });
  M.shirt = std('#ffffff', 0.92, { map: E.tex.tee });
  M.pants = std('#ffffff', 0.9, { map: E.tex.cargo });
  M.pantsDark = std('#2b2b30', 0.9);
  M.button = std('#c9b89a', 0.5);
  M.shoe = std('#2c3242', 0.55);
  M.sole = std('#f2efe8', 0.7);
  M.lace = std('#f6f3ee', 0.6);
  M.metal = std('#c9d3df', 0.25, { metalness: 0.85 });
  M.planks = std('#ffffff', 0.85, { map: E.tex.planks });
  M.sand = new THREE.MeshStandardMaterial({ color: '#ffffff', map: E.tex.sand, roughness: 0.95, metalness: 0, vertexColors: true });
  M.foam = new THREE.MeshBasicMaterial({ map: E.tex.foam, transparent: true, depthWrite: false, vertexColors: true, opacity: 0.85 });
  M.deco = std('#ffffff', 0.75, { vertexColors: true });
  M.decoShiny = std('#ffffff', 0.35, { vertexColors: true });
  M.bulb = new THREE.MeshStandardMaterial({ color: '#fff0c0', emissive: '#ffcf70', emissiveIntensity: 1.6, roughness: 0.4 });
  // Wiegende Palmblätter/Dünengras: kleine Shader-Erweiterung, kostet fast nichts
  M.sway = std('#ffffff', 0.8, { vertexColors: true, side: THREE.DoubleSide });
  M.sway.onBeforeCompile = sh => {
    sh.uniforms.uTime = E.timeU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
      #else
        float ph = 0.0;
      #endif
      float reach = clamp(length(position.xz) / 2.6, 0.0, 1.0);
      float sw = sin(uTime * 1.7 + ph) * 0.16 + sin(uTime * 3.1 + ph * 2.0) * 0.05;
      transformed.y += sw * reach * 1.2;
      transformed.x += sw * reach * 0.5;`);
  };
  M.stripes = std('#ffffff', 0.5, { map: E.tex.stripes });
  M.stripesOrange = std('#ffffff', 0.5, { map: E.tex.stripesOrange });
  M.plastic = std('#f4f4f4', 0.45);
  M.wood = std('#ffffff', 0.8, { map: E.tex.wood });
  M.lamp = new THREE.MeshStandardMaterial({ color: '#ffb020', emissive: '#ff8a00', emissiveIntensity: 1.4, roughness: 0.4 });
  M.gateSign = std('#ffffff', 0.6, { map: E.tex.gateSign });
  M.kioskFront = std('#ffffff', 0.4, { map: E.tex.kioskFront, emissive: '#ffffff', emissiveMap: E.tex.kioskFront, emissiveIntensity: 0.35 });
  M.kioskSign = std('#ffffff', 0.6, { map: E.tex.kioskSign, emissive: '#ffffff', emissiveMap: E.tex.kioskSign, emissiveIntensity: 0.25 });
  M.beachSign = std('#ffffff', 0.6, { map: E.tex.beachSign });
  M.phoneBody = new THREE.MeshStandardMaterial({ color: '#f29ab8', roughness: 0.3, metalness: 0.75, emissive: '#5a1838', emissiveIntensity: 0.35 });
  M.phoneScreen = new THREE.MeshStandardMaterial({ color: '#ffffff', map: E.tex.screen, emissive: '#ffffff', emissiveMap: E.tex.screen, emissiveIntensity: 0.9, roughness: 0.15 });
  M.red = std('#e23a3a', 0.45);
  M.crab = std('#ef5532', 0.45, { emissive: '#5a1400', emissiveIntensity: 0.25 });
  M.gull = std('#f7f7f7', 0.6);
  M.gullWing = std('#9aa6b2', 0.6, { side: THREE.DoubleSide });
  M.orange = std('#ff9f1a', 0.5);
  M.buggy = std('#2bb3a6', 0.35, { metalness: 0.3 });
  M.tire = std('#1b1b1f', 0.9);
  M.headlight = new THREE.MeshStandardMaterial({ color: '#fff7c8', emissive: '#fff2a0', emissiveIntensity: 1.5 });
  M.canopy = std('#ffffff', 0.6, { map: E.tex.stripes, side: THREE.DoubleSide });
  M.beeYellow = std('#ffffff', 0.5, { vertexColors: true });
  M.wing = new THREE.MeshStandardMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.55, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  M.shoesRed = std('#ff3b5c', 0.45);
  M.star = new THREE.MeshBasicMaterial({ color: '#ffe14d' });
  return M;
}

/* =========================================================
   JOHN PORK 3D
   Nach dem Charakterbogen: kleiner, rundlicher Kerl mit großem,
   kahlem Kopf, pfirsichfarbener Haut, langen Schlappohren, die an
   den Kopfseiten herunterhängen, vorstehendem rosa Rüssel, kleinen
   dunklen Augen und breitem Grinsen mit Zähnen. Offenes rot-schwarzes
   Büffelkaro-Hemd mit hochgekrempelten Ärmeln über grauem Shirt,
   dunkle Cargohose, dunkle Sneaker mit weißer Sohle und Schnürsenkeln.
   ========================================================= */
const PORK_HIP = 0.8;      // Hüfthöhe im Stand
function buildPork() {
  const M = E.mat;
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    parent.add(m);
    return m;
  };
  const keep = m => { m.userData.keep = true; return m; };
  const P = {};
  P.root = new THREE.Group();          // steht auf dem Boden, dreht mit der Strecke
  P.body = new THREE.Group();          // Hüfte: Neigen, Rollen, Bob
  P.body.position.y = PORK_HIP;
  P.root.add(P.body);

  // Becken (Cargohose)
  const pelvis = add(P.body, new THREE.SphereGeometry(0.31, 24, 16), M.pants, 0, 0.0, 0);
  pelvis.scale.set(1.04, 0.62, 0.86);

  // Oberkörper: runder Bauch im grauen Shirt, offenes Karohemd darüber
  P.torso = new THREE.Group();
  P.torso.position.y = 0.06;
  P.body.add(P.torso);
  const prof = [[0.29, -0.13], [0.33, -0.02], [0.36, 0.12], [0.358, 0.26], [0.335, 0.4], [0.29, 0.51], [0.21, 0.59], [0.13, 0.635], [0.001, 0.65]];
  const tee = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  tee.scale(1, 1, 0.84);
  add(P.torso, tee, M.shirt);
  const shellPts = [[0.352, -0.15], [0.36, -0.08], [0.38, 0.12], [0.376, 0.26], [0.352, 0.4], [0.305, 0.515], [0.225, 0.6]];
  const shell = new THREE.LatheGeometry(shellPts.map(([r, y]) => new THREE.Vector2(r, y)), 32, 0.3, Math.PI * 2 - 0.6);
  shell.scale(1, 1, 0.84);
  add(P.torso, shell, M.plaidBody);
  // Knopfleisten an der Hemdöffnung
  for (const d of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const y = -0.15 + i * 0.135;
      const r = y < 0.12 ? 0.36 + (y + 0.1) * 0.09 : 0.38 - (y - 0.12) * 0.22;
      const b = add(P.torso, new THREE.BoxGeometry(0.035, 0.135, 0.02), M.plaid, d * Math.sin(0.3) * r, y + 0.065, Math.cos(0.3) * r * 0.84 + 0.004, false);
      b.rotation.y = d * 0.3;
    }
  }
  // Brusttasche (Porks linke Seite = +x)
  const pocket = add(P.torso, new THREE.BoxGeometry(0.12, 0.13, 0.02), M.plaid, 0.2, 0.33, 0.235, false);
  pocket.rotation.y = 0.62;
  // Kragen: Band im Nacken + zwei Spitzen vorne
  const band = add(P.torso, new THREE.TorusGeometry(0.17, 0.035, 8, 24, Math.PI * 1.3), M.plaid, 0, 0.6, -0.01);
  band.rotation.set(Math.PI / 2, 0, Math.PI * 1.35 - Math.PI);
  band.scale.set(1, 0.85, 1);
  for (const d of [-1, 1]) {
    const col = add(P.torso, new THREE.BoxGeometry(0.13, 0.15, 0.025), M.plaid, d * 0.13, 0.55, 0.17);
    col.rotation.set(-0.55, d * 0.45, d * 0.6);
  }
  // dicker Hals
  add(P.torso, new THREE.CylinderGeometry(0.15, 0.17, 0.16, 18), M.skin, 0, 0.62, 0.0);

  // Kopf
  P.head = new THREE.Group();
  P.head.position.y = 0.64;
  P.torso.add(P.head);
  const HC = 0.34;   // Kopfmitte über dem Halsgelenk
  const headGeo = new THREE.SphereGeometry(0.34, 44, 32);
  {
    const pa = headGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const ny = y / 0.34;
      // unten breiter (Pausbacken, Doppelkinn), oben rund, Gesicht etwas flacher
      const jowl = ny < 0.1 ? (0.1 - ny) / 1.1 : 0;
      x *= (1 + jowl * 0.16) * (ny > 0.3 ? 1 - (ny - 0.3) * 0.05 : 1) * 0.97;
      z *= (z > 0 ? 0.98 + jowl * 0.12 : 0.95);
      y *= 1.08;
      // Backen neben dem Mund
      const cx = Math.abs(x) - 0.19, cy = ny + 0.35;
      if (z > 0) {
        const b = Math.exp(-(cx * cx) / 0.006 - (cy * cy) / 0.06);
        z += b * 0.03; x += Math.sign(x) * b * 0.012;
      }
      pa.setXYZ(i, x, y + HC, z);
    }
    headGeo.computeVertexNormals();
  }
  const headMesh = add(P.head, headGeo, M.skin);
  // Hilfe: Punkte/Formen auf die Gesichtsoberfläche legen
  const ray = new THREE.Raycaster();
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(0, 0, -1);
  headMesh.updateMatrixWorld(true);
  const surfZ = (x, y) => {
    ray.set(_o.set(x, y, 2), _d);
    const hit = ray.intersectObject(headMesh, false)[0];
    return hit ? hit.point.z : 0.3;
  };
  const conform = (geo, off) => {
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, surfZ(pa.getX(i), pa.getY(i)) + off + pa.getZ(i));
    geo.computeVertexNormals();
    return geo;
  };
  const shapeMesh = (shape, mat, off) => keep(add(P.head, conform(new THREE.ShapeGeometry(shape, 14), off), mat, 0, 0, 0, false));
  const surfTube = (pts2, r, mat, off = 0.004) => {
    const pts = pts2.map(([x, y]) => new THREE.Vector3(x, y, surfZ(x, y) + off));
    return keep(add(P.head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 6, false), mat, 0, 0, 0, false));
  };

  // Rüssel: steht deutlich vor, leicht nach oben gekippt
  const SY = HC - 0.03, SZ = surfZ(0, HC - 0.03);
  const snout = new THREE.Group();
  snout.position.set(0, SY, SZ - 0.05);
  snout.rotation.x = -0.12;
  P.head.add(snout);
  const tube = add(snout, new THREE.CylinderGeometry(0.108, 0.12, 0.15, 30), M.snout, 0, 0, 0.075);
  tube.rotation.x = Math.PI / 2;
  tube.scale.set(1, 1, 0.76);
  const front = add(snout, new THREE.SphereGeometry(0.108, 28, 14), M.snout, 0, 0, 0.15);
  front.scale.set(1, 0.76, 0.34);
  for (const d of [-1, 1]) {
    const n = add(snout, new THREE.SphereGeometry(0.022, 12, 10), M.nostril, d * 0.045, 0.002, 0.18, false);
    n.scale.set(0.85, 1.35, 0.4);
  }

  // Augen: klein, dunkel, mit Glanzpunkt (Gruppen, damit sie blinzeln können)
  const EY = HC + 0.075, EX = 0.112;
  P.face = { eyes: [], shut: [], brows: [], mouths: {} };
  for (const d of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(d * EX, EY, surfZ(d * EX, EY) - 0.012);
    P.head.add(g);
    const ball = keep(add(g, new THREE.SphereGeometry(0.033, 16, 12), M.eye, 0, 0, 0, false));
    ball.scale.set(1, 1.18, 0.7);
    keep(add(g, new THREE.SphereGeometry(0.009, 8, 6), M.white, 0.011, 0.014, 0.022, false));
    g.userData.d = d;
    P.face.eyes.push(g);
    // geschlossenes, fröhliches Auge (Bogen)
    P.face.shut.push(surfTube([[d * EX - 0.036, EY - 0.008], [d * EX, EY + 0.014], [d * EX + 0.036, EY - 0.008]], 0.008, M.mouth));
    // Augenbrauen (dezent, wie auf dem Bogen)
    const bg = new THREE.Group();
    const bx = d * (EX + 0.005), by = EY + 0.07;
    bg.position.set(bx, by, surfZ(bx, by) + 0.002);
    bg.rotation.y = d * 0.32;
    P.head.add(bg);
    const brow = keep(add(bg, new THREE.CapsuleGeometry(0.008, 0.05, 4, 8), M.brow, 0, 0, 0, false));
    brow.scale.z = 0.5;
    brow.rotation.z = Math.PI / 2;
    bg.userData.d = d; bg.userData.y = by;
    P.face.brows.push(bg);
  }

  // Münder für die Gesichtsausdrücke
  const MY = HC - 0.165;
  const mk = () => new THREE.Shape();
  { // ruhiges Grinsen mit oberen Zähnen (Standard)
    const s = mk(); s.moveTo(-0.145, MY + 0.03); s.quadraticCurveTo(0, MY - 0.02, 0.145, MY + 0.03); s.quadraticCurveTo(0, MY - 0.078, -0.145, MY + 0.03);
    const t = mk(); t.moveTo(-0.098, MY + 0.011); t.quadraticCurveTo(0, MY - 0.026, 0.098, MY + 0.011); t.quadraticCurveTo(0, MY - 0.044, -0.098, MY + 0.011);
    const g = new THREE.Group(); P.head.add(g);
    g.add(shapeMesh(s, M.mouth, 0.003)); g.add(shapeMesh(t, M.teeth, 0.005));
    P.face.mouths.smile = g;
  }
  { // breites, offenes Lachen
    const s = mk(); s.moveTo(-0.15, MY + 0.035); s.quadraticCurveTo(0, MY + 0.0, 0.15, MY + 0.035); s.bezierCurveTo(0.12, MY - 0.1, -0.12, MY - 0.1, -0.15, MY + 0.035);
    const t = mk(); t.moveTo(-0.112, MY + 0.02); t.quadraticCurveTo(0, MY - 0.006, 0.112, MY + 0.02); t.lineTo(0.104, MY - 0.004); t.quadraticCurveTo(0, MY - 0.03, -0.104, MY - 0.004); t.closePath();
    const tg = mk(); tg.absellipse(0, MY - 0.052, 0.058, 0.022, 0, Math.PI * 2);
    const g = new THREE.Group(); P.head.add(g);
    g.add(shapeMesh(s, M.mouth, 0.003)); g.add(shapeMesh(t, M.teeth, 0.005)); g.add(shapeMesh(tg, M.tongue, 0.005));
    P.face.mouths.grin = g;
  }
  { // "Oh!" (Schreck)
    const s = mk(); s.absellipse(0, MY - 0.02, 0.036, 0.046, 0, Math.PI * 2);
    const g = new THREE.Group(); P.head.add(g);
    g.add(shapeMesh(s, M.mouth, 0.003));
    P.face.mouths.oh = g;
  }
  { // Zunge raus (Game Over)
    const s = mk(); s.moveTo(-0.13, MY + 0.025); s.quadraticCurveTo(0, MY - 0.015, 0.13, MY + 0.025); s.quadraticCurveTo(0, MY - 0.06, -0.13, MY + 0.025);
    const g = new THREE.Group(); P.head.add(g);
    g.add(shapeMesh(s, M.mouth, 0.003));
    const tz = surfZ(0.02, MY - 0.03);
    const tongue = keep(add(g, new THREE.SphereGeometry(0.05, 16, 12), M.tongue, 0.025, MY - 0.045, tz + 0.012, false));
    tongue.scale.set(0.95, 1.25, 0.42);
    tongue.rotation.set(-0.5, 0, -0.2);
    P.face.mouths.tongue = g;
  }
  { // entschlossen (Rutschen)
    const g = new THREE.Group(); P.head.add(g);
    g.add(surfTube([[-0.09, MY - 0.004], [-0.03, MY + 0.006], [0.03, MY + 0.006], [0.09, MY - 0.004]], 0.009, M.mouth));
    P.face.mouths.flat = g;
  }

  // Schlappohren: oben seitlich angesetzt, hängen am Kopf herunter
  P.ears = [];
  const earGeo = new THREE.SphereGeometry(1, 24, 18);
  {
    const pa = earGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const wide = 0.62 + 0.42 * (1 - (y + 1) / 2);          // unten breiter
      pa.setXYZ(i, x * 0.045 + (y * y) * 0.03 - 0.015, y * 0.3 - 0.25, z * 0.15 * wide + 0.03 * (1 - y));
    }
    earGeo.computeVertexNormals();
  }
  for (const d of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(d * 0.25, HC + 0.25, 0.0);
    P.head.add(ear);
    const m = add(ear, earGeo, M.ear, 0, 0, 0);
    m.scale.x = d;                    // spiegeln
    m.rotation.y = -d * 0.5;          // breite Seite etwas nach vorne
    if (d < 0) { m.geometry = earGeo.clone(); const pa = m.geometry.attributes.position; for (let i = 0; i < pa.count; i++) pa.setX(i, -pa.getX(i)); m.geometry.computeVertexNormals(); m.scale.x = 1; }
    ear.userData.d = d;
    P.ears.push(ear);
  }

  // Arme: Karo-Ärmel, hochgekrempelt, kräftige Unterarme
  const arm = d => {
    const sh = new THREE.Group();
    sh.position.set(d * 0.37, 0.5, -0.01);
    P.torso.add(sh);
    add(sh, new THREE.SphereGeometry(0.105, 16, 12), M.plaid, 0, -0.01, 0);
    add(sh, new THREE.CapsuleGeometry(0.1, 0.16, 6, 14), M.plaid, 0, -0.15, 0);
    const el = new THREE.Group();
    el.position.y = -0.29;
    sh.add(el);
    add(el, new THREE.CylinderGeometry(0.1, 0.098, 0.1, 16), M.plaid, 0, -0.04, 0);              // Umschlag
    add(el, new THREE.TorusGeometry(0.096, 0.016, 6, 18), M.plaid, 0, -0.088, 0).rotation.x = Math.PI / 2;
    add(el, new THREE.CapsuleGeometry(0.074, 0.12, 6, 12), M.skin, 0, -0.16, 0.005);
    const hand = add(el, new THREE.SphereGeometry(0.085, 16, 12), M.skin, 0, -0.29, 0.012);
    hand.scale.set(0.82, 1.12, 0.95);
    add(el, new THREE.SphereGeometry(0.036, 10, 8), M.skin, d * -0.045, -0.26, 0.06);           // Daumen
    return { sh, el };
  };
  P.armL = arm(1);   // +x = Porks linke Seite
  P.armR = arm(-1);

  // Beine: weite Cargohose mit Seitentaschen, dunkle Sneaker
  const leg = d => {
    const hip = new THREE.Group();
    hip.position.set(d * 0.15, 0, 0);
    P.body.add(hip);
    add(hip, new THREE.CapsuleGeometry(0.138, 0.2, 6, 14), M.pants, 0, -0.19, 0);
    // Cargotasche mit Klappe und Knopf
    add(hip, new THREE.BoxGeometry(0.03, 0.14, 0.1), M.pants, d * 0.128, -0.27, 0, false);
    add(hip, new THREE.BoxGeometry(0.036, 0.04, 0.11), M.pantsDark, d * 0.13, -0.205, 0, false);
    add(hip, new THREE.SphereGeometry(0.011, 6, 5), M.button, d * 0.15, -0.21, 0, false);
    const knee = new THREE.Group();
    knee.position.y = -0.36;
    hip.add(knee);
    add(knee, new THREE.CapsuleGeometry(0.128, 0.16, 6, 14), M.pants, 0, -0.15, 0);
    add(knee, new THREE.CylinderGeometry(0.128, 0.134, 0.06, 16), M.pants, 0, -0.28, 0.005);   // Hosenbund unten
    const foot = new THREE.Group();
    foot.position.y = -0.34;
    knee.add(foot);
    const shoe = add(foot, new THREE.CapsuleGeometry(0.095, 0.16, 6, 14), M.shoe, 0, -0.025, 0.06);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1.1, 1, 0.95);
    add(foot, new THREE.CylinderGeometry(0.085, 0.1, 0.08, 14), M.shoe, 0, 0.04, -0.02);   // Knöchelkragen
    const sole = add(foot, new THREE.CapsuleGeometry(0.1, 0.19, 4, 14), M.sole, 0, -0.08, 0.065);
    sole.rotation.x = Math.PI / 2;
    sole.scale.set(1.08, 1, 0.26);
    for (let i = 0; i < 3; i++) {   // Schnürsenkel
      const l = add(foot, new THREE.BoxGeometry(0.1, 0.014, 0.018), M.lace, 0, 0.058 - i * 0.016, 0.03 + i * 0.045, false);
      l.rotation.x = -0.35;
    }
    for (const sd of [-1, 1]) {      // weißer Seitenstreifen
      const st = add(foot, new THREE.BoxGeometry(0.012, 0.022, 0.13), M.lace, sd * 0.1, -0.03, 0.06, false);
      st.rotation.x = 0.45;
    }
    // Feder unter dem Schuh
    const pts = [];
    for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 8; pts.push(new THREE.Vector3(Math.cos(a) * 0.07, -i / 60 * 0.22, Math.sin(a) * 0.07)); }
    const spring = add(foot, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.014, 6, false), M.metal, 0, -0.1, 0.06);
    spring.visible = false;
    spring.userData.keep = true;
    return { hip, knee, foot, spring };
  };
  P.legL = leg(1);
  P.legR = leg(-1);
  // Sterne über dem Kopf (Game Over)
  P.stars = new THREE.Group();
  P.stars.position.y = 1.85;
  const starGeo = new THREE.OctahedronGeometry(0.07, 0);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(starGeo, M.star);
    s.userData.a = i * Math.PI / 2;
    P.stars.add(s);
  }
  P.stars.visible = false;
  P.root.add(P.stars);
  // getragene Biene (Flug)
  P.bee = buildBee(1.6);
  P.bee.position.set(0, 2.62, 0);
  P.bee.visible = false;
  P.root.add(P.bee);
  for (const g of [P.body, P.torso, P.head, snout, ...P.ears, P.armL.sh, P.armL.el, P.armR.sh, P.armR.el,
    P.legL.hip, P.legL.knee, P.legL.foot, P.legR.hip, P.legR.knee, P.legR.foot]) mergeStatic(g);
  P.expr = '';
  setPorkExpr(P, 'smile');
  return P;
}

// Gesichtsausdrücke (wie auf dem Bogen): smile, grin, happy, wink, oh, angry, dizzy
const EXPR = {
  smile: { mouth: 'smile', eyes: [1, 1], brow: 0 },
  grin:  { mouth: 'grin',  eyes: [1, 1], brow: 0.3 },
  happy: { mouth: 'grin',  eyes: [0, 0], brow: 0.4 },
  wink:  { mouth: 'grin',  eyes: [1, 0], brow: 0.3 },
  oh:    { mouth: 'oh',    eyes: [1, 1], brow: 1 },
  angry: { mouth: 'flat',  eyes: [1, 1], brow: -1 },
  dizzy: { mouth: 'tongue', eyes: [0, 0], brow: 0.2 }
};
function setPorkExpr(D, name) {
  if (D.expr === name) return;
  D.expr = name;
  const e = EXPR[name];
  for (const k in D.face.mouths) D.face.mouths[k].visible = k === e.mouth;
  D.face.eyes.forEach((g, i) => { g.visible = !!e.eyes[i]; });
  D.face.shut.forEach((m, i) => { m.visible = !e.eyes[i]; });
  for (const b of D.face.brows) {
    const d = b.userData.d;
    b.position.y = b.userData.y + e.brow * 0.018 - (e.brow < 0 ? 0.012 : 0);
    b.rotation.z = e.brow < 0 ? -d * 0.38 : d * 0.08 * e.brow;
  }
}

function buildBee(scale) {
  const M = E.mat;
  const bee = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(0.3, 24, 16);
  bodyGeo.scale(0.78, 0.7, 1.05);
  const cols = [];
  const pa = bodyGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const band = Math.floor((pa.getZ(i) + 0.32) / 0.11) % 2;
    const c = new THREE.Color(band ? '#1d1712' : '#ffcc1f');
    cols.push(c.r, c.g, c.b);
  }
  bodyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const body = new THREE.Mesh(bodyGeo, M.beeYellow);
  body.castShadow = true;
  bee.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), M.dark);
  head.position.set(0, 0.03, 0.34);
  bee.add(head);
  for (const d of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), M.white);
    eye.position.set(d * 0.08, 0.08, 0.45);
    bee.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M.eye);
    pupil.position.set(d * 0.08, 0.08, 0.5);
    bee.add(pupil);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), M.dark);
    ant.position.set(d * 0.06, 0.24, 0.42);
    ant.rotation.set(0.5, 0, d * -0.4);
    bee.add(ant);
  }
  const sting = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), M.dark);
  sting.rotation.x = -Math.PI / 2;
  sting.position.z = -0.36;
  bee.add(sting);
  bee.userData.wings = [];
  for (const d of [-1, 1]) {
    const wg = new THREE.Group();
    wg.position.set(d * 0.1, 0.18, 0.02);
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), M.wing);
    w.scale.set(0.6, 1, 1);
    w.rotation.x = -Math.PI / 2;
    w.position.x = d * 0.16;
    wg.add(w);
    bee.add(wg);
    bee.userData.wings.push(wg);
  }
  bee.scale.setScalar(scale);
  return bee;
}

/* ---------- Pose & Animation ---------- */
// ear = Ohren abspreizen (+ = nach außen/oben), earB = Ohren nach hinten wehen
const POSE_KEYS = ['hipsY', 'pitch', 'roll', 'yaw', 'thL', 'knL', 'thR', 'knR', 'ftL', 'ftR', 'shL', 'shLz', 'elL', 'shR', 'shRz', 'elR', 'headP', 'headR', 'ear', 'earB', 'belly'];
function zeroPose() { const p = {}; for (const k of POSE_KEYS) p[k] = 0; p.hipsY = PORK_HIP; return p; }

function porkTargetPose(p, t, out) {
  const P = r3.pl;
  for (const k of POSE_KEYS) out[k] = 0;
  out.hipsY = PORK_HIP;
  const spd = r3.speed;
  if (P.dead) {
    const k = Math.min(1, P.deadT / 0.45);
    out.pitch = -1.45 * smooth01(k);
    out.hipsY = r3lerp(PORK_HIP, 0.36, smooth01(k));
    out.thL = 1.0; out.thR = 0.6; out.knL = 0.3; out.knR = 0.5;
    out.shL = -1.6; out.shR = -1.4; out.shLz = 0.9; out.shRz = 0.9; out.elL = 0.4; out.elR = 0.4;
    out.headP = 0.3; out.headR = 0.25;
    out.ear = 0.9;
    return out;
  }
  if (P.beeT > 0) {   // hängt an der Biene: Arme hoch, kurze Beine strampeln
    out.shL = -2.95; out.shR = -2.95; out.shLz = -0.12; out.shRz = -0.12;
    out.elL = 0.15; out.elR = 0.15;
    out.thL = Math.sin(t * 5) * 0.55; out.thR = -Math.sin(t * 5) * 0.55;
    out.knL = 0.6 + Math.sin(t * 5 + 1) * 0.4; out.knR = 0.6 - Math.sin(t * 5 + 1) * 0.4;
    out.pitch = 0.08;
    out.roll = Math.sin(t * 1.9) * 0.12;
    out.headP = -0.2;
    out.ear = 0.7 + Math.sin(t * 9) * 0.25; out.earB = 0.5;
    return out;
  }
  if (P.slideT > 0 && P.onGround) {   // Rutschen: nach hinten gelehnt, Beine vorne, Bauch voraus
    out.pitch = -1.05;
    out.hipsY = 0.36;
    out.thL = 1.45; out.thR = 1.2; out.knL = 0.15; out.knR = 0.55;
    out.shL = 0.9; out.shR = 0.7; out.shLz = 0.6; out.shRz = 0.6; out.elL = -0.3; out.elR = -0.3;
    out.headP = 0.8;
    out.ear = 0.35; out.earB = 1.1;
    out.belly = -0.03;
    return out;
  }
  if (!P.onGround) {
    const up = P.vy > 1.5;
    if (up) {   // Absprung: Knie hoch, ein Arm nach oben
      out.thL = 1.15; out.knL = 1.6; out.thR = -0.3; out.knR = 0.75;
      out.shL = -2.3; out.shR = -0.5; out.shLz = 0.45; out.shRz = 0.55; out.elL = 0.5; out.elR = 1.0;
      out.pitch = 0.06;
      out.ear = 0.05; out.earB = 0.2;
      out.belly = 0.035;
    } else {    // Fallen: Arme raus wie Flügel, Ohren flattern hoch
      out.thL = 0.45; out.knL = 0.6; out.thR = 0.2; out.knR = 0.45;
      out.shL = -0.9; out.shR = -0.8; out.shLz = 1.05; out.shRz = 1.05; out.elL = 0.4; out.elR = 0.4;
      out.pitch = 0.0;
      out.ear = 1.35 + Math.sin(t * 16) * 0.12; out.earB = 0.1;
      out.belly = -0.03;
    }
    out.headP = -0.1;
  } else {
    // Laufzyklus: kurze Beine, schnelle Schritte, leichtes Watscheln
    const ph = P.phase;
    const s1 = Math.sin(ph), s2 = Math.sin(ph + Math.PI);
    const amp = r3clamp(0.62 + spd * 0.012, 0.62, 0.88);
    out.thL = s1 * amp; out.thR = s2 * amp;
    out.knL = 0.3 + Math.max(0, Math.sin(ph + 1.7)) * 1.35;
    out.knR = 0.3 + Math.max(0, Math.sin(ph + Math.PI + 1.7)) * 1.35;
    out.ftL = -0.2 + Math.max(0, -s1) * 0.4; out.ftR = -0.2 + Math.max(0, -s2) * 0.4;
    out.shL = -s2 * 0.85; out.shR = -s1 * 0.85;
    out.shLz = 0.1; out.shRz = 0.1;
    out.elL = 1.25 + s2 * 0.2; out.elR = 1.25 + s1 * 0.2;
    const bob = Math.abs(Math.cos(ph));
    out.hipsY = PORK_HIP - 0.05 + bob * 0.07 + (P.shoesT > 0 ? bob * 0.08 : 0);
    out.pitch = 0.14;
    out.roll = Math.sin(ph) * 0.07;          // Watscheln
    out.yaw = Math.sin(ph) * 0.1;
    out.headP = -0.12 + Math.sin(ph * 2 + 0.6) * 0.035;
    out.headR = -Math.sin(ph) * 0.05;
    out.belly = Math.cos(ph * 2) * 0.022;    // Bauch wippt mit
    out.ear = 0.08; out.earB = 0.25 + spd * 0.02;
  }
  if (P.landT > 0) {          // Landung: kräftig einfedern
    const k = P.landT / 0.16;
    out.hipsY -= 0.2 * k;
    out.knL += 0.7 * k; out.knR += 0.7 * k;
    out.thL += 0.35 * k; out.thR += 0.35 * k;
    out.belly -= 0.06 * k;
  }
  // Spurwechsel: in die Richtung lehnen
  out.roll += r3clamp(P.latVel * 0.035, -0.32, 0.32);
  out.yaw += r3clamp(-P.latVel * 0.02, -0.2, 0.2);
  if (P.hitT > 0) {           // Stolpern
    const k = P.hitT / 0.55;
    out.pitch += -0.6 * Math.sin(k * Math.PI);
    out.shL = -2.4 * k; out.shR = -2.0 * k; out.shLz = 1.0 * k; out.shRz = 1.0 * k;
    out.headR = Math.sin(P.hitT * 30) * 0.25 * k;
    out.ear += 0.6 * k;
  }
  return out;
}

// Welcher Gesichtsausdruck passt gerade?
function porkExprFor(P, t) {
  if (P.forceExpr) return P.forceExpr;
  if (P.dead) return 'dizzy';
  if (P.hitT > 0) return 'oh';
  if (P.happyT > 0) return P.happyT > 0.35 ? 'happy' : 'grin';
  if (P.beeT > 0 || P.flipT > 0) return 'grin';
  if (P.slideT > 0) return 'angry';
  if (!P.onGround && P.vy > 1.5) return 'wink';
  return 'smile';
}

const _pose = {};
function animatePork(dt, t) {
  const P = r3.pl, D = E.pork;
  porkTargetPose(P, t, _pose);
  const k = damp(P.dead ? 8 : 20, dt);
  for (const key of POSE_KEYS) P.pose[key] += (_pose[key] - P.pose[key]) * k;
  const p = P.pose;
  D.body.position.y = p.hipsY;
  // Saltos (Federschuhe) und Power-up-Dreher werden obendrauf gesetzt
  let flip = 0, spin = 0;
  if (P.flipT > 0) flip = (1 - P.flipT / P.flipDur) * Math.PI * 2;
  if (P.spinT > 0) spin = (1 - P.spinT / 0.6) * Math.PI * 2;
  D.body.rotation.set(p.pitch + flip, p.yaw + spin, p.roll, 'YXZ');
  D.torso.scale.set(1 + p.belly, 1 - p.belly, 1 + p.belly * 1.4);
  D.legL.hip.rotation.x = -p.thL;
  D.legR.hip.rotation.x = -p.thR;
  D.legL.knee.rotation.x = p.knL;
  D.legR.knee.rotation.x = p.knR;
  D.legL.foot.rotation.x = p.ftL;
  D.legR.foot.rotation.x = p.ftR;
  // Arme stehen wegen des Bauchs immer etwas ab
  D.armL.sh.rotation.set(-p.shL, 0, p.shLz + 0.14);
  D.armR.sh.rotation.set(-p.shR, 0, -p.shRz - 0.14);
  D.armL.el.rotation.x = -p.elL;
  D.armR.el.rotation.x = -p.elR;
  D.head.rotation.set(p.headP - P.nod * 0.25, 0, p.headR);
  // Schlappohren: gedämpfte Feder, reagiert auf Absprung, Landung und Schritte
  const S = P.earSim || (P.earSim = { a: 0.2, va: 0, b: 0, vb: 0, lastVy: 0, lastY: p.hipsY, lastYV: 0, lat: 0, vlat: 0, lastLat: 0 });
  if (dt > 0) {
    const vy = (P.onGround ? 0 : P.vy) + (p.hipsY - S.lastY) / dt;
    const kick = r3clamp(vy - S.lastVy, -14, 14);     // Geschwindigkeitssprung = Stoß
    S.lastVy = vy; S.lastY = p.hipsY;
    S.va += -kick * 0.28 + (90 * (0.22 + p.ear - S.a) - 6.5 * S.va) * dt;
    S.a = r3clamp(S.a + S.va * dt, 0.12, 2.3);
    S.vb += (70 * (p.earB - S.b) - 6 * S.vb) * dt;
    S.b = r3clamp(S.b + S.vb * dt, -0.4, 1.5);
    const lk = r3clamp(P.latVel - S.lastLat, -6, 6); S.lastLat = P.latVel;
    S.vlat += lk * 0.25 + (80 * -S.lat - 6 * S.vlat) * dt;
    S.lat = r3clamp(S.lat + S.vlat * dt, -0.6, 0.6);
  }
  for (const ear of D.ears) {
    const d = ear.userData.d;
    const kick = P.earKick * 0.35 * Math.sin(t * 38);
    ear.rotation.set(S.b + kick * 0.5, 0, d * Math.max(0.12, S.a + kick + d * S.lat));
  }
  // Mimik + Blinzeln
  setPorkExpr(D, porkExprFor(P, t));
  const blink = !P.dead && (t % 3.7) < 0.12 ? 0.12 : 1;
  for (const g of D.face.eyes) g.scale.y = blink;
  // Federn
  const springs = P.shoesT > 0;
  D.legL.spring.visible = springs;
  D.legR.spring.visible = springs;
  // Biene
  D.bee.visible = P.beeT > 0;
  if (D.bee.visible) {
    const w = D.bee.userData.wings;
    w[0].rotation.z = Math.sin(t * 60) * 0.7;
    w[1].rotation.z = -Math.sin(t * 60) * 0.7;
  }
  D.stars.visible = P.dead;
  if (P.dead) {
    D.stars.rotation.y += dt * 4;
    for (const s of D.stars.children) {
      const a = s.userData.a;
      s.position.set(Math.cos(a) * 0.35, 0.05 * Math.sin(t * 6 + a), Math.sin(a) * 0.35);
      s.rotation.y += dt * 6;
    }
    D.stars.position.set(0, 0.55, -1.0);
  }
  // Blinken bei Unverwundbarkeit
  D.root.visible = !(P.invuln > 0 && !P.dead && Math.floor(t * 14) % 2 === 0);
}

/* =========================================================
   STRECKE: Mittellinie mit Kurven, Steigungen und Abschnitten
   ========================================================= */
// Abschnitts-Typen: promenade (Holzweg mit Laternen, Hütten),
// beach (Strand mit Palmen, Kurven), pier (Steg übers Wasser),
// construction (Baustelle mit Hütchen)
function newTrack() {
  return {
    pts: [], base: 0,
    x: 0, y: 1.2, z: 0, yaw: 0, k: 0, slope: 0, land: 1,
    seg: null, segLeft: 0, segCount: 0, yawRef: 0
  };
}

function nextSegment(T) {
  T.segCount++;
  let type;
  if (T.segCount === 1) type = 'promenade';
  else {
    const r = Math.random();
    const prev = T.seg ? T.seg.type : '';
    if (r < 0.32) type = 'beach';
    else if (r < 0.58) type = 'promenade';
    else if (r < 0.8) type = 'pier';
    else type = 'construction';
    if (type === prev && Math.random() < 0.6) type = type === 'beach' ? 'promenade' : 'beach';
  }
  const len = T.segCount === 1 ? 140 : 70 + Math.random() * 70;
  // Kurve: Richtung so wählen, dass die Strecke grob Richtung Sonnenuntergang bleibt
  let k = 0;
  if (T.segCount > 1 && Math.random() < 0.68) {
    const mag = [0.007, 0.012, 0.018, 0.024][Math.floor(Math.random() * (type === 'pier' ? 2 : 4))];
    let sign = Math.random() < 0.5 ? -1 : 1;
    const drift = T.yaw - T.yawRef;
    if (Math.abs(drift) > 0.6) sign = drift > 0 ? -1 : 1;
    k = mag * sign;
  }
  let slope = 0;
  if (type !== 'pier' && T.segCount > 1 && Math.random() < 0.55) {
    slope = (Math.random() < 0.5 ? -1 : 1) * (0.025 + Math.random() * 0.04);
    if (T.y > 3.8) slope = -Math.abs(slope);
    if (T.y < 1.6) slope = Math.abs(slope);
  }
  T.seg = { type, len, k, slope, land: type === 'pier' ? 0 : 1 };
  T.segLeft = len;
}

function extendTrack(T, upTo) {
  while (T.base + T.pts.length < upTo) {
    if (T.segLeft <= 0) nextSegment(T);
    const sg = T.seg;
    T.segLeft--;
    // weiche Übergänge: Krümmung, Steigung und Land/Wasser gleiten
    T.k += (sg.k - T.k) * 0.055;
    let slopeT = sg.slope;
    if (T.segLeft < 18) slopeT = 0;           // am Abschnittsende wieder eben
    T.slope += (slopeT - T.slope) * 0.07;
    T.land += (sg.land - T.land) * 0.075;
    T.yaw += T.k;
    T.x += Math.sin(T.yaw);
    T.z += Math.cos(T.yaw);
    T.y = r3clamp(T.y + T.slope, 1.0, 5.2);
    if (sg.type === 'pier' && T.y < 1.3) T.y += 0.02;
    T.pts.push({ x: T.x, y: T.y, z: T.z, yaw: T.yaw, k: T.k, land: T.land, type: sg.type });
  }
}

function trimTrack(T, keepFrom) {
  const cut = Math.floor(keepFrom - T.base) - 2;
  if (cut > 80) { T.pts.splice(0, cut); T.base += cut; }
}

// Punkt auf der Strecke (interpoliert)
function trackAt(s, out) {
  const T = r3.track;
  let f = s - T.base;
  if (f < 0) f = 0;
  let i = Math.floor(f);
  if (i >= T.pts.length - 1) i = T.pts.length - 2;
  const t = f - i;
  const a = T.pts[i], b = T.pts[i + 1];
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.yaw = a.yaw + (b.yaw - a.yaw) * t;
  out.k = a.k;
  out.land = a.land + (b.land - a.land) * t;
  out.type = a.type;
  out.s = s;
  return out;
}

// Weltposition: Strecke bei s, seitlich d (positiv = rechts), Höhe h über dem Weg
function worldAt(s, d, h, outV, tp) {
  const p = trackAt(s, tp || _tp0);
  const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
  outV.set(p.x - c * d, p.y + h, p.z + sn * d);
  return p;
}
const _tp0 = {}, _tp1 = {}, _tp2 = {};

// Sandhöhe neben dem Weg: links fällt der Strand zum Meer ab, rechts Dünen
function sandH(p, d) {
  const ad = Math.abs(d);
  const base = p.y - 0.2;
  let h;
  if (d < 0) {
    const t = Math.min(1, (ad - R3.ROAD_HALF) / 34);
    h = base + (-1.7 - base) * Math.pow(t, 0.8);
  } else {
    const t = Math.min(1, (ad - R3.ROAD_HALF) / 14);
    const dune = 0.7 + 0.6 * Math.sin(p.s * 0.045 + ad * 0.23) * Math.sin(ad * 0.11 + p.s * 0.017) + 0.35 * Math.sin(ad * 0.4 + p.s * 0.09);
    h = base + t * Math.max(0.15, dune);
    if (ad > 46) h -= (ad - 46) * 0.2;
  }
  return r3lerp(-3.5, h, p.land);
}

/* =========================================================
   STRECKEN-STÜCKE (Weg, Sand, Brandung, Deko)
   ========================================================= */
const SAND_L = [-4.2, -4.6, -5.5, -7, -9.5, -13, -17, -22, -28, -35, -44];
const SAND_R = [4.2, 4.6, 5.5, 7, 9.5, 13, 17, 22, 28, 36, 46, 58, 72];
const ROAD_COLS = [[-4.32, -0.55, 0], [-4.2, 0, 0.012], [4.2, 0, 0.988], [4.32, -0.55, 1]];

function ribbon(s0, s1, cols, heightFn, opts) {
  const rows = Math.round(s1 - s0) + 1;
  const nc = cols.length;
  const pos = new Float32Array(rows * nc * 3), uv = new Float32Array(rows * nc * 2);
  const col = opts.colors ? new Float32Array(rows * nc * (opts.alpha ? 4 : 3)) : null;
  const idx = [];
  const p = {};
  const cc = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    const s = s0 + r;
    trackAt(s, p);
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    for (let j = 0; j < nc; j++) {
      const cd = cols[j];
      const d = Array.isArray(cd) ? cd[0] : cd;
      const h = heightFn(p, cd, j);
      const o = (r * nc + j);
      pos[o * 3] = p.x - c * d;
      pos[o * 3 + 1] = h;
      pos[o * 3 + 2] = p.z + sn * d;
      uv[o * 2] = opts.u(d, cd, j);
      uv[o * 2 + 1] = s / opts.vScale;
      if (col) {
        const a = opts.colors(p, d, h, cc);
        if (opts.alpha) { col[o * 4] = cc.r; col[o * 4 + 1] = cc.g; col[o * 4 + 2] = cc.b; col[o * 4 + 3] = a; }
        else { col[o * 3] = cc.r; col[o * 3 + 1] = cc.g; col[o * 3 + 2] = cc.b; }
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let j = 0; j < nc - 1; j++) {
      const a = r * nc + j, b = a + 1, c2 = a + nc, d2 = c2 + 1;
      if (opts.flip) idx.push(a, b, c2, b, d2, c2);
      else idx.push(a, c2, b, b, c2, d2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, opts.alpha ? 4 : 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Hilfsobjekte erst anlegen, wenn Three.js geladen ist (siehe initScratch)
let SAND_DRY, SAND_WET, SAND_DUNE;

function buildChunk(ci) {
  const s0 = ci * R3.CHUNK, s1 = s0 + R3.CHUNK;
  const ch = { ci, s0, s1, meshes: [], decor: [] };
  const M = E.mat;
  // Weg (Holzpromenade bzw. Steg)
  const road = new THREE.Mesh(ribbon(s0, s1, ROAD_COLS, (p, cd) => p.y + cd[1], { u: (d, cd) => cd[2], vScale: 8.4, flip: true }), M.planks);
  road.receiveShadow = true;
  ch.meshes.push(road);
  // Sand links/rechts
  const sandColor = (p, d, h, cc) => {
    if (h < 0.35) cc.copy(SAND_WET).lerp(SAND_DRY, r3clamp((h + 0.2) / 0.55, 0, 1));
    else cc.copy(SAND_DRY).lerp(SAND_DUNE, r3clamp(Math.abs(d) / 40, 0, 1));
    const n = Math.sin(p.s * 0.37 + d * 0.71) * 0.03;
    cc.offsetHSL(0, 0, n);
    return 1;
  };
  for (const cols of [SAND_L, SAND_R]) {
    const m = new THREE.Mesh(ribbon(s0, s1, cols, (p, d) => sandH(p, d), { u: d => d / 5, vScale: 5, colors: sandColor, flip: cols === SAND_R }), M.sand);
    m.receiveShadow = true;
    ch.meshes.push(m);
  }
  // Brandung: Schaumstreifen dort, wo der Strand ins Wasser geht
  const foam = ribbon(s0, s1, [0, 1, 2, 3], (p, j, jj) => {
    let lo = -R3.ROAD_HALF, hi = -44;
    for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (sandH(p, mid) > 0.03) lo = mid; else hi = mid; }
    p._foamD = lo;
    return 0.035 + (jj === 1 || jj === 2 ? 0.02 : 0);
  }, {
    u: (d, cd, j) => j / 3, vScale: 6,
    colors: (p, d, h, cc) => { cc.setRGB(1, 1, 1); return p.land > 0.6 ? 1 : 0; }, alpha: true
  });
  { // Spaltenpositionen an die Wasserlinie verschieben
    const pa = foam.attributes.position;
    const p = {};
    for (let r = 0; r <= R3.CHUNK; r++) {
      trackAt(s0 + r, p);
      let lo = -R3.ROAD_HALF, hi = -44;
      for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (sandH(p, mid) > 0.03) lo = mid; else hi = mid; }
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      const ds = [lo + 0.9, lo - 0.3, lo - 1.4, lo - 2.6];
      for (let j = 0; j < 4; j++) {
        const o = r * 4 + j;
        pa.setXYZ(o, p.x - c * ds[j], pa.getY(o), p.z + sn * ds[j]);
      }
    }
    pa.needsUpdate = true;
    foam.computeBoundingSphere();
  }
  const foamMesh = new THREE.Mesh(foam, M.foam);
  foamMesh.renderOrder = 1;
  ch.meshes.push(foamMesh);
  for (const m of ch.meshes) E.scene.add(m);
  placeDecor(ch);
  return ch;
}

function destroyChunk(ch) {
  for (const m of ch.meshes) { E.scene.remove(m); m.geometry.dispose(); }
  for (const [pool, i] of ch.decor) pool.remove(i);
  ch.meshes.length = 0;
  ch.decor.length = 0;
}

/* =========================================================
   DEKO (InstancedMesh-Pools: wenige Draw-Calls, kein Speicherwachstum)
   ========================================================= */
function buildDecorKinds() {
  const K = {};
  const M = E.mat;
  const pool = (geo, mat, cap, shadow) => { const p = new IPool(geo, mat, cap, shadow); E.scene.add(p.mesh); E.pools.push(p); return p; };
  // Palme: Stamm (mit Ringen + Kokosnüssen) und wiegende Blätter
  const trunkCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.25, 2, 0), new THREE.Vector3(0.8, 4, 0), new THREE.Vector3(1.4, 5.6, 0)]);
  const trunk = new THREE.TubeGeometry(trunkCurve, 10, 0.19, 7, false);
  const coco = new THREE.SphereGeometry(0.17, 8, 6);
  const trunkGeo = mergeParts([
    { geo: trunk, c: (x, y) => (Math.floor(y / 0.32) % 2 ? '#8a5a34' : '#6e4426') },
    { geo: coco, m: mtx(1.5, 5.35, 0.15), c: '#5a3a1a' },
    { geo: coco, m: mtx(1.25, 5.3, -0.12), c: '#5a3a1a' },
    { geo: coco, m: mtx(1.42, 5.25, -0.25), c: '#4e3216' }
  ]);
  // Palmwedel: gefaltete, nach unten hängende Streifen
  const frond = (len, droop) => {
    const pos = [], col = [], idx = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const w = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) + 0.02;
      const x = t * len, y = -t * t * droop;
      pos.push(x, y, -w, x, y + 0.12 * (1 - t), 0, x, y, w);
      const c1 = new THREE.Color('#2f7d3a').lerp(new THREE.Color('#7fc24a'), t * 0.7);
      const c2 = new THREE.Color('#1f5e2b');
      col.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b, c1.r, c1.g, c1.b);
      if (i < N) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const fronds = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
    const g = frond(2.5 + (i % 3) * 0.4, 1.4 + (i % 2) * 0.5);
    g.applyMatrix4(mtx(0, 0, 0, a, 1, 0, -0.25 + (i % 3) * 0.12));
    fronds.push(g);
  }
  const leafGeo = (() => {   // eigene Verschmelzung, weil die Farben schon im Wedel stecken
    const out = { pos: [], col: [], idx: [] };
    let off = 0;
    for (const g of fronds) {
      const pa = g.attributes.position.array, ca = g.attributes.color.array, ia = g.index.array;
      for (let i = 0; i < pa.length; i++) out.pos.push(pa[i]);
      for (let i = 0; i < ca.length; i++) out.col.push(ca[i]);
      for (let i = 0; i < ia.length; i++) out.idx.push(ia[i] + off);
      off += pa.length / 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    g.setIndex(out.idx);
    g.computeVertexNormals();
    g.translate(1.4, 5.6, 0);
    return g;
  })();
  K.palm = [pool(trunkGeo, M.deco, 55, true), pool(leafGeo, M.sway, 55, true)];
  // Sonnenschirme (zwei Farbvarianten) + Liegen
  const parasol = (c1, c2) => {
    const cone = new THREE.ConeGeometry(1.5, 0.55, 12, 1, true).toNonIndexed();
    const pa = cone.attributes.position;
    const cols = [];
    for (let i = 0; i < pa.count; i += 3) {
      const ang = Math.atan2(pa.getZ(i) + pa.getZ(i + 1) + pa.getZ(i + 2), pa.getX(i) + pa.getX(i + 1) + pa.getX(i + 2));
      const c = new THREE.Color(Math.floor((ang + Math.PI) / (Math.PI * 2) * 12) % 2 ? c1 : c2);
      for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
    }
    cone.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const pole = new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6);
    const g = mergeParts([
      { geo: pole, m: mtx(0, 1.2, 0), c: '#f5f5f5' },
      { geo: new THREE.SphereGeometry(0.07, 6, 4), m: mtx(0, 2.62, 0), c: '#f5f5f5' }
    ]);
    // Kegel mit eigenen Farben an die Stange hängen
    const all = [g, (() => { cone.translate(0, 2.35, 0); cone.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(cone.attributes.position.count * 2), 2)); return cone; })()];
    const merged = new THREE.BufferGeometry();
    const attrs = ['position', 'normal', 'color', 'uv'];
    for (const a of attrs) {
      const arrs = all.map(x => x.attributes[a].array);
      const tot = arrs.reduce((n, x) => n + x.length, 0);
      const out = new Float32Array(tot);
      let o = 0;
      for (const x of arrs) { out.set(x, o); o += x.length; }
      merged.setAttribute(a, new THREE.BufferAttribute(out, a === 'uv' ? 2 : 3));
    }
    merged.computeBoundingSphere();
    return merged;
  };
  K.parasolA = [pool(parasol('#ff5a6e', '#ffffff'), M.deco, 50, true)];
  K.parasolB = [pool(parasol('#2fa8e0', '#ffe14d'), M.deco, 50, true)];
  const lounger = cushion => mergeParts([
    { geo: new THREE.BoxGeometry(0.7, 0.08, 1.9), m: mtx(0, 0.35, 0), c: '#f4f4f4' },
    { geo: new THREE.BoxGeometry(0.66, 0.07, 1.2), m: mtx(0, 0.42, -0.3), c: cushion },
    { geo: new THREE.BoxGeometry(0.66, 0.07, 0.7), m: mtx(0, 0.62, 0.62, 0, 1, -0.7), c: cushion },
    { geo: new THREE.BoxGeometry(0.06, 0.35, 0.06), m: mtx(-0.3, 0.17, -0.85), c: '#dddddd' },
    { geo: new THREE.BoxGeometry(0.06, 0.35, 0.06), m: mtx(0.3, 0.17, -0.85), c: '#dddddd' },
    { geo: new THREE.BoxGeometry(0.06, 0.35, 0.06), m: mtx(-0.3, 0.17, 0.85), c: '#dddddd' },
    { geo: new THREE.BoxGeometry(0.06, 0.35, 0.06), m: mtx(0.3, 0.17, 0.85), c: '#dddddd' }
  ]);
  K.loungerA = [pool(lounger('#3a8ee0'), M.deco, 60, true)];
  K.loungerB = [pool(lounger('#ff7aa8'), M.deco, 60, true)];
  // Strandkorb
  const korb = mergeParts([
    { geo: new THREE.BoxGeometry(1.3, 1.0, 0.9), m: mtx(0, 0.5, 0), c: '#d6b07a' },
    { geo: new THREE.CylinderGeometry(0.65, 0.65, 0.9, 12, 1, false, 0, Math.PI), m: mtx(0, 1.0, 0, 0, 1, Math.PI / 2, Math.PI / 2), c: '#c9a06a' },
    { geo: new THREE.BoxGeometry(1.15, 0.85, 0.08), m: mtx(0, 1.0, 0.42), c: (x, y) => (Math.floor((x + 0.6) / 0.19) % 2 ? '#2f6fd0' : '#ffffff') },
    { geo: new THREE.BoxGeometry(1.15, 0.12, 0.6), m: mtx(0, 0.62, 0.25), c: '#2f6fd0' },
    { geo: new THREE.BoxGeometry(1.36, 0.08, 0.95), m: mtx(0, 0.05, 0), c: '#a8814f' }
  ]);
  K.korb = [pool(korb, M.deco, 50, true)];
  // Strandhütten (Farbe pro Hütte)
  const hut = mergeParts([
    { geo: new THREE.BoxGeometry(2.2, 2.3, 2.2), m: mtx(0, 1.15, 0), c: (x) => (Math.floor((x + 1.1) / 0.275) % 2 ? '#ffffff' : '#e8e8e8') },
    { geo: new THREE.ConeGeometry(1.75, 1.0, 4, 1), m: mtx(0, 2.8, 0, Math.PI / 4), c: '#d0d0d0' },
    { geo: new THREE.BoxGeometry(0.8, 1.5, 0.05), m: mtx(0, 0.85, 1.11), c: '#7a5a48' },
    { geo: new THREE.BoxGeometry(2.4, 0.15, 2.4), m: mtx(0, 0.05, 0), c: '#a07850' }
  ]);
  K.hut = [pool(hut, M.deco, 40, true)];
  // Rettungsturm
  const tower = mergeParts([
    ...[[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].map(([x, z]) => ({ geo: new THREE.BoxGeometry(0.12, 2.6, 0.12), m: mtx(x, 1.3, z), c: '#f4f4f4' })),
    { geo: new THREE.BoxGeometry(2.0, 0.12, 2.0), m: mtx(0, 2.6, 0), c: '#e8e8e8' },
    { geo: new THREE.BoxGeometry(1.7, 1.2, 1.7), m: mtx(0, 3.25, 0), c: '#e8423c' },
    { geo: new THREE.BoxGeometry(1.0, 0.5, 0.05), m: mtx(0, 3.35, 0.86), c: '#4aa8e0' },
    { geo: new THREE.ConeGeometry(1.5, 0.7, 4), m: mtx(0, 4.2, 0, Math.PI / 4), c: '#f4f4f4' },
    { geo: new THREE.BoxGeometry(0.6, 0.06, 1.9), m: mtx(0, 1.3, 1.6, 0, 1, -0.9), c: '#c9a06a' }
  ]);
  K.tower = [pool(tower, M.deco, 10, true)];
  // Laterne (Licht leuchtet im Sonnenuntergang)
  const lampGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.06, 0.09, 3.6, 8), m: mtx(0, 1.8, 0), c: '#2b3138' },
    { geo: new THREE.BoxGeometry(0.06, 0.06, 0.7), m: mtx(0, 3.55, 0.3), c: '#2b3138' },
    { geo: new THREE.ConeGeometry(0.22, 0.25, 8, 1, true), m: mtx(0, 3.5, 0.62), c: '#2b3138' },
    { geo: new THREE.CylinderGeometry(0.16, 0.2, 0.15, 8), m: mtx(0, 0.07, 0), c: '#2b3138' }
  ]);
  K.lamp = [pool(lampGeo, M.decoShiny, 70, true), pool(new THREE.SphereGeometry(0.13, 10, 8).translate(0, 3.38, 0.62), M.bulb, 70, false)];
  // Verkehrshütchen
  const cone = mergeParts([
    { geo: new THREE.ConeGeometry(0.22, 0.7, 12), m: mtx(0, 0.38, 0), c: (x, y) => (y > 0.32 && y < 0.48 ? '#ffffff' : '#ff6a14') },
    { geo: new THREE.BoxGeometry(0.5, 0.05, 0.5), m: mtx(0, 0.025, 0), c: '#ff6a14' }
  ]);
  K.cone = [pool(cone, M.decoShiny, 120, true)];
  // Sandburg, Wasserball, Surfbrett, Felsen, Dünengras, Boje
  K.castle = [pool(mergeParts([
    { geo: new THREE.CylinderGeometry(0.6, 0.75, 0.5, 10), m: mtx(0, 0.25, 0), c: '#e8c38a' },
    { geo: new THREE.CylinderGeometry(0.22, 0.25, 0.6, 8), m: mtx(-0.35, 0.75, 0), c: '#e8c38a' },
    { geo: new THREE.CylinderGeometry(0.22, 0.25, 0.6, 8), m: mtx(0.35, 0.75, 0), c: '#e8c38a' },
    { geo: new THREE.ConeGeometry(0.26, 0.35, 8), m: mtx(-0.35, 1.22, 0), c: '#e0b77c' },
    { geo: new THREE.ConeGeometry(0.26, 0.35, 8), m: mtx(0.35, 1.22, 0), c: '#e0b77c' },
    { geo: new THREE.BoxGeometry(0.02, 0.5, 0.02), m: mtx(0.35, 1.6, 0), c: '#555555' },
    { geo: new THREE.BoxGeometry(0.25, 0.15, 0.01), m: mtx(0.47, 1.75, 0), c: '#ff4d6d' }
  ]), M.deco, 20, true)];
  const ball = new THREE.SphereGeometry(0.35, 16, 10).toNonIndexed();
  {
    const pa = ball.attributes.position, cols = [];
    const pal = ['#ff4d4d', '#ffffff', '#2fa8e0', '#ffffff', '#ffd23f', '#ffffff'];
    for (let i = 0; i < pa.count; i += 3) {
      const a = Math.atan2(pa.getZ(i), pa.getX(i));
      const c = new THREE.Color(pal[Math.floor((a + Math.PI) / (Math.PI * 2) * 6) % 6]);
      for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
    }
    ball.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    ball.translate(0, 0.33, 0);
  }
  K.ball = [pool(ball, M.decoShiny, 20, true)];
  const surf = new THREE.SphereGeometry(0.5, 16, 10);
  surf.scale(0.55, 2.2, 0.09);
  surf.translate(0, 0.9, 0);
  K.surf = [pool(mergeParts([{ geo: surf, c: (x, y) => (Math.abs(x) < 0.05 ? '#222222' : '#ffffff') }]), M.decoShiny, 30, true)];
  const rock = new THREE.DodecahedronGeometry(0.8, 0);
  rock.scale(1.3, 0.6, 1);
  K.rock = [pool(mergeParts([{ geo: rock, c: '#8a7a6e' }]), M.deco, 70, true)];
  const grassParts = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    grassParts.push({ geo: new THREE.ConeGeometry(0.05, 0.9 + (i % 3) * 0.25, 4), m: mtx(Math.cos(a) * 0.18, 0.45, Math.sin(a) * 0.18, 0, 1, Math.sin(a) * 0.3, -Math.cos(a) * 0.3), c: i % 2 ? '#7a9a3a' : '#a8b85a' });
  }
  K.grass = [pool(mergeParts(grassParts), M.sway, 110, false)];
  K.buoy = [pool(mergeParts([
    { geo: new THREE.SphereGeometry(0.4, 10, 8), m: mtx(0, 0.15, 0), c: (x, y) => (y > 0.15 ? '#ff4d4d' : '#ffffff') },
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), m: mtx(0, 0.75, 0), c: '#ffffff' }
  ]), M.decoShiny, 40, false)];
  // Steg: Pfosten und Geländer
  K.post = [pool(mergeParts([{ geo: new THREE.CylinderGeometry(0.16, 0.18, 6, 8), m: mtx(0, -3, 0), c: '#6e4a2c' }]), M.deco, 200, false)];
  K.rail = [pool(mergeParts([
    { geo: new THREE.BoxGeometry(0.1, 1.0, 0.1), m: mtx(0, 0.5, 0), c: '#8a5e36' },
    { geo: new THREE.BoxGeometry(0.08, 0.08, 3.0), m: mtx(0, 0.95, 1.5), c: '#a87446' },
    { geo: new THREE.BoxGeometry(0.06, 0.06, 3.0), m: mtx(0, 0.55, 1.5), c: '#a87446' }
  ]), M.deco, 160, true)];
  // Seilzaun an der Promenade
  K.fence = [pool(mergeParts([
    { geo: new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), m: mtx(0, 0.4, 0), c: '#7a5534' },
    { geo: new THREE.CylinderGeometry(0.025, 0.025, 4.0, 4), m: mtx(0, 0.65, 2.0, 0, 1, Math.PI / 2), c: '#e8d8b0' }
  ]), M.deco, 120, false)];
  // Schild "PORK BEACH" (normale Meshes, selten)
  E.signGeo = new THREE.PlaneGeometry(3.2, 1.2);
  E.signPostGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6);
  return K;
}

function decoAdd(ch, kind, x, y, z, ry, s = 1, color) {
  const m = mtx(x, y, z, ry, s);
  for (const pool of E.kinds[kind]) {
    const i = pool.add(m, color);
    if (i >= 0) ch.decor.push([pool, i]);
  }
}

function placeDecor(ch) {
  const rnd = rng(ch.ci * 7919 + 13);
  const v = new THREE.Vector3();
  const p = {};
  const put = (kind, s, d, ry = 0, sc = 1, color, yOff = 0) => {
    trackAt(s, p);
    const h = (Math.abs(d) <= R3.ROAD_HALF + 0.3 || p.land < 0.55) ? p.y : sandH(p, d);
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    decoAdd(ch, kind, p.x - c * d, h + yOff, p.z + sn * d, p.yaw + ry, sc, color);
  };
  const tint = new THREE.Color();
  for (let s = ch.s0; s < ch.s1; s += 1) {
    trackAt(s, p);
    const land = p.land > 0.55;
    const type = p.type;
    const si = Math.round(s);
    if (land) {
      // Weg-Rand: Laternen (Promenade) bzw. Hütchen (Baustelle) bzw. Seilzaun
      if (type === 'promenade' && si % 16 === 0) { put('lamp', s, -4.75, 0); put('lamp', s + 8, 4.75, Math.PI); }
      if (type === 'construction' && si % 5 === 0) { put('cone', s, -4.7, rnd() * 3); put('cone', s + 2.5, 4.7, rnd() * 3); }
      if (type === 'beach' && si % 4 === 0) { put('fence', s, -4.9, 0); put('fence', s, 4.9, 0); }
      // Seeseite (links): Schirme, Liegen, Strandkörbe, Felsen, Surfbretter
      if (si % 9 === 0 && rnd() < 0.8) {
        const d = -(8 + rnd() * 9);
        const kindP = rnd() < 0.5 ? 'parasolA' : 'parasolB';
        put(kindP, s, d, rnd() * 3);
        put(rnd() < 0.5 ? 'loungerA' : 'loungerB', s + 1.2, d - 1.2, Math.PI / 2 + 0.2);
        if (rnd() < 0.6) put(rnd() < 0.5 ? 'loungerA' : 'loungerB', s - 1.2, d - 1.0, Math.PI / 2 - 0.2);
      }
      if (si % 13 === 5 && rnd() < 0.7) { const d = -(6.5 + rnd() * 4); put('korb', s, d, Math.PI * 0.5 + (rnd() - 0.5) * 0.4); put('korb', s + 1.6, d - 0.3, Math.PI * 0.5 + (rnd() - 0.5) * 0.4); }
      if (si % 7 === 3 && rnd() < 0.6) put('rock', s, -(22 + rnd() * 12), rnd() * 6, 0.6 + rnd() * 1.1);
      if (si % 17 === 2 && rnd() < 0.6) put('surf', s, -(10 + rnd() * 6), rnd() * 0.6, 1, tint.setHSL(rnd(), 0.75, 0.6), -0.3);
      if (si % 19 === 7 && rnd() < 0.5) put('castle', s, -(14 + rnd() * 6), rnd() * 6);
      if (si % 23 === 11 && rnd() < 0.5) put('ball', s, -(6.5 + rnd() * 6), rnd() * 6);
      if (si % 11 === 4 && rnd() < 0.7) put('buoy', s, -(48 + rnd() * 30), 0, 1, undefined, 0);
      // Landseite (rechts): Palmen, Hütten, Dünengras, Rettungsturm
      if (si % (type === 'beach' ? 6 : 10) === 0 && rnd() < 0.85) put('palm', s, 6.5 + rnd() * 7, rnd() * 6, 0.85 + rnd() * 0.35);
      if (type === 'beach' && si % 8 === 4 && rnd() < 0.7) put('palm', s, -(6 + rnd() * 4), rnd() * 6, 0.8 + rnd() * 0.3);
      if (type === 'promenade' && si % 4 === 0) put('hut', s, 17, -Math.PI / 2, 1, tint.setHSL(rnd(), 0.55, 0.72));
      if (si % 3 === 0 && rnd() < 0.55) put('grass', s, 10 + rnd() * 30, rnd() * 6, 0.7 + rnd() * 0.6);
      if (si % 61 === 30) put('tower', s, -(12 + rnd() * 4), Math.PI / 2);
      if (si % 97 === 48) addSign(ch, s, 5.6);
    } else {
      // Steg über dem Wasser: Pfosten, Geländer, Laternen, Bojen
      if (si % 3 === 0) { put('post', s, -4.0, 0, 1, undefined, 0); put('post', s, 4.0, 0, 1, undefined, 0); put('rail', s, -4.1, 0); put('rail', s, 4.1, 0); }
      if (si % 18 === 0) { put('lamp', s, -4.4, 0, 0.8); put('lamp', s + 9, 4.4, Math.PI, 0.8); }
      if (si % 7 === 0 && rnd() < 0.6) { trackAt(s, p); const d = (rnd() < 0.5 ? -1 : 1) * (9 + rnd() * 30); const c = Math.cos(p.yaw), sn = Math.sin(p.yaw); decoAdd(ch, 'buoy', p.x - c * d, SEA_Y, p.z + sn * d, 0, 1); }
    }
  }
}

function addSign(ch, s, d) {
  const p = trackAt(s, {});
  const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
  const x = p.x - c * d, z = p.z + sn * d, y = sandH(p, d);
  const board = new THREE.Mesh(E.signGeo, E.mat.beachSign);
  board.position.set(x, y + 2.7, z);
  board.rotation.y = p.yaw + Math.PI + 0.5;
  const post = new THREE.Mesh(E.signPostGeo, E.mat.deco);
  post.position.set(x, y + 1.6, z);
  E.scene.add(board, post);
  ch.meshes.push(board, post);
  board.geometry = E.signGeo.clone();     // eigene Kopie, damit das Aufräumen sicher ist
  post.geometry = E.signPostGeo.clone();
}

/* =========================================================
   HINDERNISSE & GEGNER (3D-Modelle, wiederverwendet)
   Wie man sie schafft:
   - barrier (Baustellen-Absperrung)  -> springen      (Treffer: -1 Herz)
   - crates  (Kistenstapel, niedrig)  -> springen      (Treffer: -1 Herz)
   - gate    (Balken "DANGER!")        -> sliden        (Treffer: -1 Herz)
   - kiosk / container (groß)         -> Spur wechseln (Aufprall: Lauf vorbei)
   - crab    (Krabbe, kommt entgegen) -> springen/ausweichen (-1 Herz)
   - gull    (Möwe, fliegt entgegen)  -> sliden/ausweichen  (-1 Herz)
   - buggy   (Strandbuggy, fährt entgegen) -> ausweichen (Aufprall: Lauf vorbei)
   ========================================================= */
const OBS = {
  barrier: { hw: 0.95, hd: 0.22, bottom: 0, top: 0.88, lethal: false },   // Trefferzone etwas kleiner als das Modell
  crates: { hw: 0.95, hd: 0.5, bottom: 0, top: 0.92, lethal: false },
  gate: { hw: 1.15, hd: 0.25, bottom: 1.12, top: 9, lethal: false },
  kiosk: { hw: 1.05, hd: 1.1, bottom: 0, top: 2.1, lethal: true },        // mit Federschuhen überspringbar
  container: { hw: 1.05, hd: 1.1, bottom: 0, top: 2.3, lethal: true },
  crab: { hw: 0.85, hd: 0.6, bottom: 0, top: 0.9, lethal: false, speed: 4.5 },
  gull: { hw: 0.7, hd: 0.45, bottom: 1.05, top: 1.75, lethal: false, speed: 6 },
  buggy: { hw: 1.0, hd: 1.4, bottom: 0, top: 2.4, lethal: true, speed: 8 }
};
const BLOCKS = new Set(['kiosk', 'container', 'buggy']);

function buildObstacle(kind) {
  const M = E.mat;
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (kind === 'barrier') {
    for (const d of [-0.85, 0.85]) {     // A-Böcke
      add(new THREE.BoxGeometry(0.08, 1.0, 0.08), M.plastic, d, 0.48, 0.18, -0.28);
      add(new THREE.BoxGeometry(0.08, 1.0, 0.08), M.plastic, d, 0.48, -0.18, 0.28);
      add(new THREE.BoxGeometry(0.1, 0.06, 0.5), M.plastic, d, 0.03, 0);
    }
    const b1 = add(new THREE.BoxGeometry(2.1, 0.3, 0.07), M.stripes, 0, 0.78, 0);
    b1.material = M.stripes;
    add(new THREE.BoxGeometry(2.1, 0.22, 0.06), M.stripes, 0, 0.42, 0);
    const lamp = add(new THREE.SphereGeometry(0.09, 10, 8), M.lamp, 0.85, 1.0, 0);
    lamp.castShadow = false;
  } else if (kind === 'crates') {
    add(new THREE.BoxGeometry(0.95, 0.95, 0.95), M.wood, -0.5, 0.475, 0, 0, 0.08);
    add(new THREE.BoxGeometry(0.95, 0.95, 0.95), M.wood, 0.5, 0.475, 0.05, 0, -0.05);
    add(new THREE.BoxGeometry(0.5, 0.5, 0.5), M.wood, 0.2, 1.2, 0, 0, 0.3);
    add(new THREE.ConeGeometry(0.16, 0.5, 10), M.stripesOrange, -0.6, 1.2, 0);
  } else if (kind === 'gate') {
    for (const d of [-1.1, 1.1]) {
      add(new THREE.CylinderGeometry(0.09, 0.11, 3.4, 10), M.stripes, d, 1.7, 0);
      add(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 10), M.plastic, d, 0.06, 0);
    }
    add(new THREE.BoxGeometry(2.3, 0.32, 0.18), M.stripes, 0, 1.32, 0);
    add(new THREE.BoxGeometry(2.3, 0.78, 0.08), M.gateSign, 0, 2.75, 0.02);
    const l1 = add(new THREE.SphereGeometry(0.08, 8, 6), M.lamp, -1.1, 3.45, 0);
    const l2 = add(new THREE.SphereGeometry(0.08, 8, 6), M.lamp, 1.1, 3.45, 0);
    l1.castShadow = l2.castShadow = false;
  } else if (kind === 'kiosk') {
    add(new THREE.BoxGeometry(2.1, 2.1, 2.1), M.plastic, 0, 1.05, 0);
    const stripe = new THREE.MeshStandardMaterial({ color: '#7fd3e8', roughness: 0.5 });
    add(new THREE.BoxGeometry(2.12, 0.35, 2.12), stripe, 0, 0.5, 0);
    add(new THREE.PlaneGeometry(1.7, 0.96), M.kioskFront, 0, 1.43, -1.062, 0, Math.PI);   // Fenster mit Eis-Theke
    add(new THREE.BoxGeometry(2.0, 0.1, 0.4), M.wood, 0, 0.92, -1.22);                   // Verkaufstresen
    add(new THREE.BoxGeometry(2.4, 0.08, 1.0), M.canopy, 0, 2.05, -1.4, -0.35);
    add(new THREE.BoxGeometry(2.0, 0.6, 0.1), M.kioskSign, 0, 2.5, -1.0);
    // großes Eis auf dem Dach
    add(new THREE.ConeGeometry(0.42, 1.1, 14), new THREE.MeshStandardMaterial({ color: '#d99a52', roughness: 0.7 }), 0, 2.75, 0, Math.PI);
    add(new THREE.SphereGeometry(0.46, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff9ac8', roughness: 0.5 }), 0, 3.45, 0);
    add(new THREE.SphereGeometry(0.36, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 0.5 }), 0, 3.85, 0);
    add(new THREE.SphereGeometry(0.1, 10, 8), M.red, 0, 4.2, 0);
  } else if (kind === 'container') {
    add(new THREE.BoxGeometry(2.1, 1.1, 2.0), M.wood, 0, 0.55, 0);
    add(new THREE.BoxGeometry(2.0, 1.1, 1.9), M.wood, 0.03, 1.65, 0, 0, 0.05);
    add(new THREE.BoxGeometry(2.2, 0.08, 2.1), new THREE.MeshStandardMaterial({ color: '#2f7fd8', roughness: 0.8 }), 0, 2.25, 0);
    add(new THREE.BoxGeometry(2.15, 0.35, 0.05), M.stripesOrange, 0, 1.1, -1.03);
    add(new THREE.BoxGeometry(2.15, 0.35, 0.05), M.stripesOrange, 0, 2.0, -1.0);
  } else if (kind === 'crab') {
    const body = add(new THREE.SphereGeometry(0.5, 20, 14), M.crab, 0, 0.45, 0);
    body.scale.set(1.1, 0.5, 0.8);
    g.userData.legs = [];
    for (const d of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Group();
        leg.position.set(d * 0.45, 0.4, -0.2 + i * 0.2);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.55, 6), M.crab);
        seg.position.set(d * 0.22, -0.15, 0);
        seg.rotation.z = d * 1.0;
        seg.castShadow = true;
        leg.add(seg);
        g.add(leg);
        g.userData.legs.push(leg);
      }
      const claw = new THREE.Group();
      claw.position.set(d * 0.55, 0.55, -0.45);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.35, 6), M.crab);
      arm.rotation.x = Math.PI / 2;
      arm.position.z = -0.15;
      claw.add(arm);
      const pincer = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), M.crab);
      pincer.scale.set(0.8, 0.7, 1.2);
      pincer.position.z = -0.38;
      claw.add(pincer);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), M.crab);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(0, 0.07, -0.55);
      claw.add(tip);
      g.add(claw);
      (g.userData.claws = g.userData.claws || []).push(tip);
      const stalk = add(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 6), M.crab, d * 0.16, 0.75, -0.25);
      stalk.castShadow = false;
      add(new THREE.SphereGeometry(0.075, 10, 8), M.white, d * 0.16, 0.9, -0.27);
      add(new THREE.SphereGeometry(0.04, 8, 6), M.eye, d * 0.16, 0.9, -0.33);
      const brow = add(new THREE.BoxGeometry(0.14, 0.03, 0.03), M.dark, d * 0.16, 0.99, -0.3, 0, 0, d * 0.4);
      brow.castShadow = false;
    }
  } else if (kind === 'gull') {
    const body = add(new THREE.CapsuleGeometry(0.2, 0.45, 6, 12), M.gull, 0, 1.4, 0, Math.PI / 2);
    body.scale.set(1, 1, 1);
    add(new THREE.SphereGeometry(0.17, 14, 10), M.gull, 0, 1.52, -0.38);
    add(new THREE.ConeGeometry(0.06, 0.25, 8), M.orange, 0, 1.47, -0.6, -Math.PI / 2);
    for (const d of [-1, 1]) {
      add(new THREE.SphereGeometry(0.035, 8, 6), M.eye, d * 0.08, 1.57, -0.5);
      const brow = add(new THREE.BoxGeometry(0.09, 0.025, 0.02), M.dark, d * 0.08, 1.62, -0.5, 0, 0, d * 0.5);
      brow.castShadow = false;
    }
    g.userData.wings = [];
    for (const d of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(d * 0.15, 1.48, 0);
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.4), M.gullWing);
      w.position.x = d * 0.45;
      w.castShadow = true;
      wg.add(w);
      g.add(wg);
      g.userData.wings.push(wg);
    }
    add(new THREE.ConeGeometry(0.14, 0.3, 6), M.gullWing, 0, 1.4, 0.45, Math.PI / 2);
  } else if (kind === 'buggy') {
    add(new THREE.BoxGeometry(1.8, 0.6, 2.6), M.buggy, 0, 0.7, 0);
    add(new THREE.BoxGeometry(1.6, 0.5, 0.9), M.buggy, 0, 1.15, -0.85);
    add(new THREE.BoxGeometry(1.5, 0.5, 0.1), M.dark, 0, 1.3, -0.4, -0.3);
    for (const [x, z] of [[-0.8, -0.95], [0.8, -0.95], [-0.8, 0.95], [0.8, 0.95]]) {
      add(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), M.metal, x, 1.65, z);
      const wh = add(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16), M.tire, x * 1.1, 0.36, z, 0, 0, Math.PI / 2);
      wh.userData.keep = true;
      (g.userData.wheels = g.userData.wheels || []).push(wh);
    }
    add(new THREE.BoxGeometry(2.0, 0.08, 2.4), M.canopy, 0, 2.35, 0);
    for (const x of [-0.6, 0.6]) {
      const hl = add(new THREE.SphereGeometry(0.13, 12, 8), M.headlight, x, 0.8, -1.32);
      hl.castShadow = false;
    }
    add(new THREE.BoxGeometry(1.9, 0.18, 0.2), M.metal, 0, 0.45, -1.36);
  }
  g.userData.kind = kind;
  mergeStatic(g);
  if (OBS[kind].speed) {
    // Warnzeichen + roter Schein, damit man Gegner früh kommen sieht
    const fx = { depthWrite: false, transparent: true };
    const glow = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map: E.tex.glow, color: '#ff3040', opacity: 0.85, blending: THREE.AdditiveBlending }, fx)));
    glow.scale.set(2.6, 2.6, 1);
    glow.position.y = OBS[kind].top * 0.5 + 0.2;
    const warn = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map: E.tex.warn }, fx)));
    warn.scale.set(0.8, 0.8, 1);
    warn.position.y = warn.userData.y0 = (kind === 'buggy' ? 2.4 : OBS[kind].top) + 0.9;
    g.add(glow, warn);
    g.userData.warn = warn;
    g.userData.wglow = glow;
  }
  if (kind === 'crab') g.scale.setScalar(1.3);
  return g;
}

function spawnObstacle(kind, s, lane) {
  const pool = E.obsPool[kind] || (E.obsPool[kind] = []);
  const mesh = pool.pop() || buildObstacle(kind);
  E.scene.add(mesh);
  const def = OBS[kind];
  const o = { kind, s, lane, x: lane * R3.LANE_W, mesh, def, active: !def.speed, hit: false, t: Math.random() * 6, gone: false };
  placeObstacle(o);
  r3.obs.push(o);
  return o;
}
let _vObs;
function placeObstacle(o) {
  const p = worldAt(o.s, o.x, 0, _vObs, _tp1);
  o.mesh.position.copy(_vObs);
  o.mesh.rotation.set(0, p.yaw, 0);   // Vorderseite (lokal -z) zum Spieler
}
function releaseObstacle(o) {
  E.scene.remove(o.mesh);
  o.mesh.visible = true;
  o.mesh.rotation.set(0, 0, 0);
  E.obsPool[o.kind].push(o.mesh);
}

/* =========================================================
   HANDYS (Instanced) + Glanz + Partikel
   ========================================================= */
function buildPhones() {
  const shape = new THREE.Shape();
  const w = 0.5, h = 0.92, r = 0.09;
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1, curveSegments: 3 });
  body.translate(0, 0, -0.035);
  const screen = new THREE.PlaneGeometry(0.44, 0.84);
  screen.translate(0, 0, 0.065);
  const back = new THREE.CircleGeometry(0.06, 12);
  back.rotateY(Math.PI);
  back.translate(-0.13, 0.33, -0.065);
  const CAP = 140;
  E.phoneBody = new IPool(body, E.mat.phoneBody, CAP, false);
  E.phoneScreen = new IPool(screen, E.mat.phoneScreen, CAP, false);
  E.scene.add(E.phoneBody.mesh, E.phoneScreen.mesh);
  // Glanz hinter jedem Handy: ein Points-Objekt für alle (1 Draw-Call)
  const gp = new Float32Array(CAP * 3).fill(-9999);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  E.phoneGlow = new THREE.Points(gg, new THREE.PointsMaterial({ map: E.tex.glow, color: '#ffd0f0', size: 2.4, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  E.phoneGlow.frustumCulled = false;
  E.scene.add(E.phoneGlow);
  E.phoneCap = CAP;
}

function buildParticles() {
  const N = 260;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3).fill(-9999), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: E.tex.glow, size: 0.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  E.scene.add(pts);
  E.parts = { pts, N, list: Array.from({ length: N }, () => ({ life: 0 })), next: 0 };
}

function burst(pos, color, n, speed, life = 0.5, up = 2) {
  const P = E.parts;
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const q = P.list[P.next];
    P.next = (P.next + 1) % P.N;
    q.life = q.max = life * (0.6 + Math.random() * 0.6);
    q.x = pos.x; q.y = pos.y; q.z = pos.z;
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
    q.vx = Math.cos(a) * Math.cos(b) * speed;
    q.vy = Math.abs(Math.sin(b)) * speed + up;
    q.vz = Math.sin(a) * Math.cos(b) * speed;
    q.r = c.r; q.g = c.g; q.b = c.b;
  }
}

function updateParticles(dt) {
  const P = E.parts;
  const pa = P.pts.geometry.attributes.position.array, ca = P.pts.geometry.attributes.color.array;
  for (let i = 0; i < P.N; i++) {
    const q = P.list[i];
    if (q.life <= 0) { pa[i * 3 + 1] = -9999; continue; }
    q.life -= dt;
    q.vy -= 9 * dt;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    pa[i * 3] = q.x; pa[i * 3 + 1] = q.y; pa[i * 3 + 2] = q.z;
    const k = Math.max(0, q.life / q.max);
    ca[i * 3] = q.r * k; ca[i * 3 + 1] = q.g * k; ca[i * 3 + 2] = q.b * k;
  }
  P.pts.geometry.attributes.position.needsUpdate = true;
  P.pts.geometry.attributes.color.needsUpdate = true;
}

function spawnPhone(s, x, h) {
  const slot = E.phoneBody.free.length ? E.phoneBody.free[E.phoneBody.free.length - 1] : -1;
  if (slot < 0) return null;
  E.phoneBody.free.pop();
  const si = E.phoneScreen.free.indexOf(slot);
  if (si >= 0) E.phoneScreen.free.splice(si, 1);
  const ph = { s, x, h, slot, taken: false, anim: 0, t: Math.random() * 6 };
  r3.phones.push(ph);
  return ph;
}
function releasePhone(ph) {
  E.phoneBody.remove(ph.slot);
  E.phoneScreen.remove(ph.slot);
  const ga = E.phoneGlow.geometry.attributes.position.array;
  ga[ph.slot * 3 + 1] = -9999;
}

/* ---------- Power-up-Sammelobjekte ---------- */
function buildShoesPickup() {
  const g = new THREE.Group();
  const M = E.mat;
  for (const d of [-1, 1]) {
    const s = new THREE.Group();
    s.position.x = d * 0.22;
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.25, 6, 12), M.shoesRed);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1, 1, 0.8);
    shoe.position.y = 0.32;
    s.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.48), M.white);
    sole.position.y = 0.2;
    s.add(sole);
    const pts = [];
    for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 8; pts.push(new THREE.Vector3(Math.cos(a) * 0.1, 0.18 - i / 60 * 0.3, Math.sin(a) * 0.1)); }
    s.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.018, 6, false), M.metal));
    g.add(s);
  }
  return g;
}
// Items sollen schon von weitem auffallen: Lichtsäule, Schein, Ringe, Funken
function pickupHalo(color) {
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const g = new THREE.Group();
  const s = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map: E.tex.glow, color, opacity: 1 }, add)));
  s.scale.set(3.4, 3.4, 1);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 16, 16, 1, true),
    new THREE.MeshBasicMaterial(Object.assign({ map: E.tex.beam, color, opacity: 0.8, side: THREE.DoubleSide }, add)));
  beam.position.y = -0.95 + 8;
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.045, 8, 36), ringMat);
  ring.rotation.x = Math.PI / 2;
  const floor = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.06, 8, 40), ringMat);
  floor.rotation.x = Math.PI / 2;
  floor.position.y = -0.85;
  const sparks = [];
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map: E.tex.glow, color: '#ffffff', opacity: 1 }, add)));
    sp.scale.set(0.45, 0.45, 1);
    sp.userData.a = i * Math.PI / 2;
    sparks.push(sp);
    g.add(sp);
  }
  g.add(s, beam, ring, floor);
  g.userData.fx = { glow: s, beam, ring, floor, sparks };
  return g;
}

// Tempo-Faktor der Biene nach t Sekunden Flug: sanft auf 3x und am Ende zurück
function beeBoost(t) {
  const k = Math.min(r3clamp(t / 0.8, 0, 1), r3clamp((R3.BEE_T - t) / 0.9, 0, 1));
  return 1 + (R3.BEE_SPEED - 1) * smooth01(k);
}

/* ---------- Power-ups (Liste – neue lassen sich leicht ergänzen) ---------- */
const POWERUPS = {
  shoes: {
    label: 'Federschuhe', dur: () => R3.SHOES_T, color: '#6ee7ff',
    model: () => buildShoesPickup(),
    start(P) {
      P.shoesT = R3.SHOES_T;
      Sound.r3Shoes();
      showR3Msg('FEDERSCHUHE!', 1.0);
      // Belohnung: hohe Handy-Bögen, die man nur mit den Schuhen erreicht
      const v = r3.speed;
      for (let k = 0; k < 3; k++) {
        const lane = Math.floor(Math.random() * 3) - 1;
        phoneArc(P.s + v * (1.6 + k * 2.6), lane, R3.SHOE_JUMP_V, 7);
      }
    },
    end() {}
  },
  bee: {
    label: 'Biene', dur: () => R3.BEE_T, color: '#ffd23f',
    model: () => { const b = buildBee(1.2); b.position.y = 0.9; return b; },
    start(P) {
      P.beeT = R3.BEE_T;
      P.vy = 0;
      P.slideT = 0;
      Sound.startBuzz();
      showR3Msg('BIENEN-FLUG!', 1.0);
      // Handy-Spur in der Luft entlang der (schnellen) Flugbahn
      let lane = P.lane, ds = 0, next = 14;
      const s0 = P.s;
      for (let t = 0; t < R3.BEE_T - 0.6; t += 0.05) {
        ds += speedAt(s0 + ds) * beeBoost(t) * 0.05;
        if (ds < next) continue;
        next += 8;
        if (Math.random() < 0.12) lane = r3clamp(lane + (Math.random() < 0.5 ? -1 : 1), -1, 1);
        spawnPhone(s0 + ds, lane * R3.LANE_W, R3.BEE_H + 0.95);
      }
      extendTrack(r3.track, s0 + ds + R3.VIEW);
    },
    end(P) {
      Sound.stopBuzz();
      P.invuln = Math.max(P.invuln, 1.3);
    }
  }
};

function spawnPickup(type, s, lane) {
  const pool = E.pickPool[type] || (E.pickPool[type] = []);
  let mesh = pool.pop();
  if (!mesh) {
    mesh = new THREE.Group();
    const model = POWERUPS[type].model();
    model.userData.spin = true;
    mesh.add(model);
    const halo = pickupHalo(POWERUPS[type].color);
    halo.position.y = 0.95;
    mesh.add(halo);
    mesh.userData.model = model;
    mesh.userData.fx = halo.userData.fx;
  }
  E.scene.add(mesh);
  const it = { type, s, lane, x: lane * R3.LANE_W, mesh, taken: false, t: 0 };
  r3.items.push(it);
  return it;
}
function releasePickup(it) {
  E.scene.remove(it.mesh);
  E.pickPool[it.type].push(it.mesh);
}

/* =========================================================
   STRECKEN-INHALT: Muster aus Hindernissen, Gegnern, Handys
   Jede Reihe lässt immer mindestens eine Spur frei bzw.
   überwindbar; Abstände wachsen mit dem Tempo.
   ========================================================= */
function speedAt(s) { return R3.SPEED0 + (R3.SPEED_MAX - R3.SPEED0) * (1 - Math.exp(-Math.max(0, s) / R3.SPEED_RAMP)); }
const lanes3 = [-1, 0, 1];
const pickR = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function phoneLine(s0, lane, n, gap = 2.6, h = 0.95) {
  for (let i = 0; i < n; i++) spawnPhone(s0 + i * gap, lane * R3.LANE_W, h);
}
// Handys auf der Bahn eines Sprungs über einem Hindernis bei sCenter
function phoneArc(sCenter, lane, jv, n = 5) {
  const v = speedAt(sCenter);
  const T = 2 * jv / R3.G;
  for (let i = 0; i < n; i++) {
    const t = T * (0.12 + 0.76 * (i / (n - 1)));
    const h = jv * t - 0.5 * R3.G * t * t;
    spawnPhone(sCenter - v * T / 2 + v * t, lane * R3.LANE_W, h + 0.95);
  }
}
function phoneSwitch(s0, fromLane, toLane, n = 8) {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = r3lerp(fromLane, toLane, smooth01(r3clamp((t - 0.25) / 0.5, 0, 1))) * R3.LANE_W;
    spawnPhone(s0 + i * 2.6, x, 0.95);
  }
}

function blockKind(s) {
  const t = trackAt(s, _tp2).type;
  return t === 'promenade' || t === 'beach' ? 'kiosk' : 'container';
}

function genContent(upTo) {
  const C = r3.gen;
  while (C.s < upTo) {
    const s = C.s;
    const v = speedAt(s);
    const d = r3clamp((s - 170) / 2600, 0, 1);
    if (C.tutorial < 3) { tutorialStep(C, v); continue; }
    const type = trackAt(s, _tp2).type;
    const gapT = r3lerp(1.75, 1.0, d) * (0.9 + Math.random() * 0.25);
    // Muster wählen
    const opts = [['single', 3], ['jumpRow', 1.3], ['slideRow', 1.3], ['phones', 1.6 - d], ['twoBlocks', 1 + 2 * d]];
    if (d > 0.12) opts.push(['mixed', 2.2 * d + 0.4]);
    if (d > 0.25) opts.push(['slalom', 2 * d]);
    if (d > 0.18) opts.push(['jumpSlide', 1.6 * d]);
    if (s > 260) opts.push(['enemy', 1.4 + d]);
    if (s - C.lastPower > 170 && r3.pl.shoesT <= 0 && r3.pl.beeT <= 0) opts.push(['power', 5]);
    let tot = 0;
    for (const o of opts) tot += o[1];
    let r = Math.random() * tot, pat = 'single';
    for (const o of opts) { if ((r -= o[1]) < 0) { pat = o[0]; break; } }
    const used = runPattern(pat, s, v, d, type);
    C.s = s + Math.max(used, v * gapT);
  }
}

function tutorialStep(C, v) {
  const s = C.s;
  if (C.tutorial === 0) {
    for (const l of lanes3) spawnObstacle('barrier', s + 40, l);
    phoneArc(s + 40, 0, R3.JUMP_V, 5);
    r3.hints.push({ s: s + 40, text: 'Nach OBEN wischen: Springen!' });
    C.s = s + 40 + v * 1.4;
  } else if (C.tutorial === 1) {
    for (const l of lanes3) spawnObstacle('gate', s + 10, l);
    phoneLine(s + 6, 0, 4, 2.4, 0.5);
    r3.hints.push({ s: s + 10, text: 'Nach UNTEN wischen: Sliden!' });
    C.s = s + 10 + v * 1.5;
  } else {
    const k = blockKind(s + 10);
    spawnObstacle(k, s + 10, 0);
    spawnObstacle(k, s + 10, 1);
    phoneSwitch(s - 6, 0, -1, 7);
    r3.hints.push({ s: s + 10, text: 'Zur SEITE wischen: Spur wechseln!' });
    C.s = s + 10 + v * 1.4;
  }
  C.tutorial++;
}

function runPattern(pat, s, v, d, type) {
  const free = () => pickR(lanes3);
  switch (pat) {
    case 'single': {
      const lane = free();
      const kinds = ['barrier', 'crates', 'gate', 'block'];
      let k = pickR(kinds);
      if (k === 'block') k = blockKind(s);
      spawnObstacle(k, s, lane);
      const other = pickR(lanes3.filter(l => l !== lane));
      if (Math.random() < 0.7) phoneLine(s - 8, other, 6);
      else if (k === 'barrier' || k === 'crates') phoneArc(s, lane, R3.JUMP_V, 5);
      return v * 1.0;
    }
    case 'jumpRow': {
      for (const l of lanes3) spawnObstacle(Math.random() < 0.5 ? 'barrier' : 'crates', s, l);
      phoneArc(s, free(), R3.JUMP_V, 5);
      return v * 1.1;
    }
    case 'slideRow': {
      for (const l of lanes3) spawnObstacle('gate', s, l);
      phoneLine(s - 4, free(), 4, 2.4, 0.5);
      return v * 1.1;
    }
    case 'phones': {
      if (Math.random() < 0.5) phoneSwitch(s, free(), free(), 9);
      else phoneLine(s, free(), 8);
      return v * 1.2;
    }
    case 'twoBlocks': {
      const open = free();
      const k = blockKind(s);
      for (const l of lanes3) if (l !== open) spawnObstacle(k, s, l);
      phoneLine(s - 6, open, 5);
      return v * 1.15;
    }
    case 'mixed': {
      // eine Spur Block, eine springen, eine sliden – alle drei haben eine Lösung
      const order = shuffle(['block', 'jump', 'slide']);
      lanes3.forEach((l, i) => {
        const o = order[i];
        if (o === 'block') spawnObstacle(blockKind(s), s, l);
        else if (o === 'jump') spawnObstacle(Math.random() < 0.5 ? 'barrier' : 'crates', s, l);
        else spawnObstacle('gate', s, l);
      });
      return v * 1.1;
    }
    case 'slalom': {
      // zwei Reihen mit je zwei Blöcken, freie Spur wechselt
      const a = free();
      const b = pickR(lanes3.filter(l => Math.abs(l - a) === 1));   // nächste freie Spur immer direkt daneben
      const k = blockKind(s);
      for (const l of lanes3) if (l !== a) spawnObstacle(k, s, l);
      const s2 = s + v * r3lerp(1.25, 0.95, d);
      for (const l of lanes3) if (l !== b) spawnObstacle(blockKind(s2), s2, l);
      phoneSwitch(s - 4, a, b, 8);
      return (s2 - s) + v * 1.1;
    }
    case 'jumpSlide': {
      const lane = free();
      spawnObstacle('barrier', s, lane);
      const s2 = s + v * r3lerp(0.95, 0.75, d);
      spawnObstacle('gate', s2, lane);
      phoneArc(s, lane, R3.JUMP_V, 5);
      if (Math.random() < 0.6) {
        const side = pickR(lanes3.filter(l => l !== lane));
        spawnObstacle(blockKind(s), s, side);
      }
      return (s2 - s) + v * 1.0;
    }
    case 'enemy': {
      // Gegner kommt entgegen; seine Spur bleibt sonst frei
      let kind = pickR(['crab', 'gull', 'buggy']);
      if (kind === 'buggy' && type !== 'promenade' && type !== 'beach') kind = 'crab';
      const lane = free();
      const e = OBS[kind].speed;
      const travel = R3.ACTIVATE * e / (v + e);       // so weit fährt er, bis man ihn trifft
      const sE = s + travel;
      spawnObstacle(kind, sE, lane);
      const other = pickR(lanes3.filter(l => l !== lane));
      phoneLine(s - 6, other, 6);
      if (d > 0.4 && Math.random() < 0.5) {
        const third = lanes3.find(l => l !== lane && l !== other);
        spawnObstacle(Math.random() < 0.5 ? 'barrier' : 'gate', s, third);
      }
      return travel + v * 1.1;
    }
    case 'power': {
      r3.gen.lastPower = s;
      const lane = free();
      const type2 = Math.random() < 0.3 ? 'bee' : 'shoes';   // Biene 40 % seltener als früher (50 % → 30 %)
      phoneLine(s - 18, lane, 6);
      spawnPickup(type2, s, lane);
      return v * 1.2;
    }
  }
  return v;
}

/* =========================================================
   START / ENDE / SCHLEIFE
   ========================================================= */
function initScratch() {
  SAND_DRY = new THREE.Color('#f6dcae'); SAND_WET = new THREE.Color('#b98e62'); SAND_DUNE = new THREE.Color('#f0cf98');
  _vObs = new THREE.Vector3();
  _pv = new THREE.Vector3(); _cv = new THREE.Vector3(); _lv = new THREE.Vector3(); _tv = new THREE.Vector3();
  _phM = new THREE.Matrix4(); _phQ = new THREE.Quaternion(); _phS = new THREE.Vector3(); _phE = new THREE.Euler();
}

function initEngine() {
  THREE.ColorManagement.legacyMode = false;   // Farben korrekt (sRGB) statt verwaschen
  initScratch();
  const canvas3d = document.getElementById('game3d');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: !coarse || (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  E = { renderer, coarse, pools: [], obsPool: {}, pickPool: {}, quality: coarse ? 1 : 2, frameTimes: [] };
  E.sunDir = new THREE.Vector3(...SUN_DIR_ARR).normalize();
  E.timeU = { value: 0 };
  E.scene = new THREE.Scene();
  E.scene.fog = new THREE.Fog('#e89a8c', 70, 245);
  E.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  E.tex = makeTextures();
  E.mat = makeMaterials();
  // Licht: tiefe, warme Sonne von der Seite + Himmelslicht
  E.hemi = new THREE.HemisphereLight('#ffb8b0', '#a0705a', 0.85);
  E.scene.add(E.hemi);
  E.sun = new THREE.DirectionalLight('#ffb27a', 2.3);
  E.sun.castShadow = true;
  E.sun.shadow.bias = -0.0006;
  E.sun.shadow.normalBias = 0.03;
  const sc = E.sun.shadow.camera;
  sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 160;
  E.scene.add(E.sun, E.sun.target);
  E.fill = new THREE.DirectionalLight('#ffd0e0', 0.75);   // kühles Gegenlicht für Konturen
  E.scene.add(E.fill, E.fill.target);
  E.sky = makeSky();
  E.scene.add(E.sky);
  E.sea = makeSea();
  E.scene.add(E.sea);
  E.ring = makeFarRing();
  mergeStatic(E.ring);
  E.scene.add(E.ring);
  E.kinds = buildDecorKinds();
  buildPhones();
  buildParticles();
  E.pork = buildPork();
  E.scene.add(E.pork.root);
  E.pork.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  applyQuality();
  r3Resize();
  canvas3d.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    if (mode === 'run3d' && state === 'playing') pauseGame();
  });
}

function applyQuality() {
  const q = E.quality;
  const dpr = window.devicePixelRatio || 1;
  E.renderer.setPixelRatio(Math.min(dpr, q === 2 ? 2 : q === 1 ? 1.5 : 1));
  E.renderer.shadowMap.enabled = q > 0;
  E.sun.castShadow = q > 0;
  E.sun.shadow.mapSize.set(q === 2 ? 2048 : 1024, q === 2 ? 2048 : 1024);
  if (E.sun.shadow.map) { E.sun.shadow.map.dispose(); E.sun.shadow.map = null; }
  for (const p of E.pools) p.mesh.castShadow = p.shadowWanted && q === 2;
  E.scene.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); } });
  r3Resize();
}

function r3Resize() {
  if (!E) return;
  const w = wrapEl.clientWidth, h = wrapEl.clientHeight;
  E.renderer.setSize(w, h, false);
  E.camera.aspect = w / h;
  E.camera.updateProjectionMatrix();
}
window.addEventListener('resize', r3Resize);

function r3ClearWorld() {
  if (!r3) return;
  for (const ch of r3.chunks) destroyChunk(ch);
  for (const o of r3.obs) releaseObstacle(o);
  for (const ph of r3.phones) releasePhone(ph);
  for (const it of r3.items) releasePickup(it);
  for (const p of E.pools) p.flush();
  E.phoneBody.flush();
  E.phoneScreen.flush();
  for (const q of E.parts.list) q.life = 0;
  updateParticles(0);
  r3 = null;
}

async function startRun3d() {
  const loading = document.getElementById('r3Loading');
  if (!window.THREE) {
    show(loading, true);
    show(el.modeSelect, false);
    try { await loadThree(); } catch (e) {
      show(loading, false);
      document.getElementById('r3LoadMsg').textContent = '3D konnte nicht geladen werden. Bitte Internet prüfen.';
      show(el.modeSelect, true);
      return;
    }
  }
  if (!E) {
    show(loading, true);
    await new Promise(r => setTimeout(r, 30));
    try { initEngine(); } catch (e) {
      show(loading, false);
      document.getElementById('r3LoadMsg').textContent = '3D wird von diesem Gerät nicht unterstützt.';
      show(el.modeSelect, true);
      return;
    }
  }
  show(loading, false);
  r3ClearWorld();
  setMode('run3d');
  Sound.stopLoops();
  meters = 0;
  gameT = 0;
  r3 = {
    track: newTrack(), chunks: [], obs: [], phones: [], items: [], hints: [],
    gen: { s: 20, tutorial: 0, lastPower: 120 },
    t: 0, speed: 0, baseSpeed: 0, phonesN: 0, combo: 0, lastPhoneT: -9, shake: 0, overT: 0,
    hud: {}, intro: 1.1
  };
  r3.pl = {
    s: 0, lane: 0, prevLane: 0, x: 0, xPrev: 0, latVel: 0, y: 0, vy: 0, onGround: true,
    slideT: 0, slideQueued: false, landT: 0, hitT: 0, invuln: 0, hearts: R3.HEARTS,
    shoesT: 0, beeT: 0, beeLift: 0, flipT: 0, flipDur: 1, spinT: 0, earKick: 0, nod: 0, happyT: 0,
    phase: 0, dead: false, deadT: 0, pose: zeroPose()
  };
  extendTrack(r3.track, R3.VIEW + 160);
  genContent(R3.VIEW);
  syncChunks();
  E.camera.position.set(0, 2.2, 6);
  r3.camLook = new THREE.Vector3(0, 1.4, 0);
  state = 'playing';
  last = null;
  show(el.menu, false);
  show(el.over, false);
  show(el.pause, false);
  show(el.settings, false);
  show(el.modeSelect, false);
  el.btnPause.classList.remove('active');
  setPlayUi(true);
  r3.hud = {};
  r3Hud(true);
  showR3Msg('LOS!', 0.9);
  Sound.r3Beep(true);
}

function r3Exit() {
  Sound.stopBuzz();
  r3ClearWorld();
  show(document.getElementById('game3d'), false);
  show(document.getElementById('r3Msg'), false);
}

function r3Resume() {
  if (r3 && r3.pl.beeT > 0) Sound.startBuzz();
}

function syncChunks() {
  const P = r3.pl;
  const want0 = Math.max(0, Math.floor((P.s - 40) / R3.CHUNK));
  const want1 = Math.floor((P.s + R3.VIEW) / R3.CHUNK);
  // alte abbauen
  for (let i = r3.chunks.length - 1; i >= 0; i--) {
    const ch = r3.chunks[i];
    if (ch.ci < want0) { destroyChunk(ch); r3.chunks.splice(i, 1); }
  }
  const have = new Set(r3.chunks.map(c => c.ci));
  for (let ci = want0; ci <= want1; ci++) if (!have.has(ci)) r3.chunks.push(buildChunk(ci));
  trimTrack(r3.track, P.s - 60);
}

/* ---------- Eingaben ---------- */
function r3Input(a) {
  if (!r3 || state !== 'playing') return;
  const P = r3.pl;
  if (P.dead) return;
  if (a === 'left' || a === 'right') {
    const nl = r3clamp(P.lane + (a === 'right' ? 1 : -1), -1, 1);
    if (nl === P.lane) { r3.shake = Math.max(r3.shake, 0.12); Sound.r3Bump(); return; }
    P.prevLane = P.lane;
    P.lane = nl;
    Sound.r3Lane();
  } else if (a === 'up') {
    if (P.beeT > 0) return;
    if (P.onGround) {
      P.vy = P.shoesT > 0 ? R3.SHOE_JUMP_V : R3.JUMP_V;
      P.onGround = false;
      P.slideT = 0;
      if (P.shoesT > 0) { P.flipT = P.flipDur = 2 * R3.SHOE_JUMP_V / R3.G * 0.9; Sound.boing(); }
      else Sound.jump();
    }
  } else if (a === 'down') {
    if (P.beeT > 0) return;
    if (P.onGround) { P.slideT = R3.SLIDE_T; Sound.r3Slide(); }
    else { P.vy = Math.min(P.vy, -24); P.slideQueued = true; P.flipT = 0; }
  }
}

// Wischen überall auf dem Spielfeld
const swipe = { id: null, x0: 0, y0: 0, t0: 0, done: true };
wrapEl.addEventListener('pointerdown', e => {
  if (mode !== 'run3d' || state !== 'playing') return;
  if (e.target.closest && e.target.closest('button')) return;
  swipe.id = e.pointerId;
  swipe.x0 = e.clientX;
  swipe.y0 = e.clientY;
  swipe.t0 = performance.now();
  swipe.done = false;
  Sound.init();
});
wrapEl.addEventListener('pointermove', e => {
  if (e.pointerId !== swipe.id || swipe.done) return;
  const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
  const th = Math.max(18, wrapEl.clientWidth * 0.05);
  if (Math.abs(dx) < th && Math.abs(dy) < th) return;
  swipe.done = true;                                    // eine Geste = genau eine Aktion
  if (performance.now() - swipe.t0 > 650) return;       // zu langsam: kein Wisch
  if (Math.abs(dx) > Math.abs(dy) * 1.15) r3Input(dx > 0 ? 'right' : 'left');
  else if (Math.abs(dy) > Math.abs(dx) * 1.15) r3Input(dy < 0 ? 'up' : 'down');
});
const swipeEnd = e => { if (e.pointerId === swipe.id) { swipe.id = null; swipe.done = true; } };
wrapEl.addEventListener('pointerup', swipeEnd);
wrapEl.addEventListener('pointercancel', swipeEnd);

const R3KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ' ': 'up', ArrowDown: 'down', s: 'down', S: 'down' };
function r3Key(e) {
  const a = R3KEYS[e.key];
  if (!a) return false;
  if (!e.repeat) r3Input(a);
  return true;
}

/* ---------- Spiel-Update ---------- */
let _pv, _cv, _lv, _tv;

function r3Update(dt) {
  const P = r3.pl;
  r3.t += dt;
  gameT += dt;
  E.timeU.value += dt;
  if (P.dead) { P.deadT += dt; return; }
  // Tempo (am Anfang kurz anlaufen)
  const target = speedAt(P.s);
  r3.baseSpeed = r3.intro > 0 ? target * (1 - r3.intro / 1.1 * 0.6) : target;
  r3.speed = r3.baseSpeed * (P.beeT > 0 ? beeBoost(R3.BEE_T - P.beeT) : 1);
  if (r3.intro > 0) r3.intro -= dt;
  P.s += r3.speed * dt;
  P.phase += dt * Math.PI * 2 * (1.55 + r3.speed * 0.055);
  // Spurwechsel (weich, nicht teleportiert)
  P.xPrev = P.x;
  const tx = P.lane * R3.LANE_W;
  P.x += (tx - P.x) * damp(R3.LANE_RATE, dt);
  if (Math.abs(tx - P.x) < 0.01) P.x = tx;
  P.latVel = dt > 0 ? (P.x - P.xPrev) / dt : 0;
  // Biene: hoch, fliegen, sanft landen
  if (P.beeT > 0) {
    P.beeT -= dt;
    const T0 = R3.BEE_T;
    const up = r3clamp((T0 - P.beeT) / 0.6, 0, 1), down = r3clamp(P.beeT / 0.7, 0, 1);
    P.y = R3.BEE_H * smooth01(Math.min(up, down));
    P.vy = 0;
    P.onGround = false;
    if (P.beeT <= 0) { P.beeT = 0; P.y = 0; P.onGround = true; POWERUPS.bee.end(P); P.landT = 0.16; Sound.r3Land(); }
  } else {
    // Sprung-Physik
    if (!P.onGround) {
      P.vy -= R3.G * dt;
      P.y += P.vy * dt;
      if (P.y <= 0) {
        P.y = 0;
        P.vy = 0;
        P.onGround = true;
        P.landT = 0.16;
        P.flipT = 0;
        Sound.r3Land();
        _pv.set(0, 0, 0);
        worldAt(P.s, P.x, 0.05, _pv);
        burst(_pv, '#f3d7a6', 8, 2.2, 0.4, 0.5);
        if (P.slideQueued) { P.slideQueued = false; P.slideT = R3.SLIDE_T; Sound.r3Slide(); }
      }
    }
  }
  if (P.slideT > 0) {
    P.slideT -= dt;
    if (Math.random() < dt * 30) { worldAt(P.s - 0.3, P.x, 0.1, _pv); burst(_pv, '#f3d7a6', 1, 1.5, 0.35, 0.6); }
  }
  P.landT = Math.max(0, P.landT - dt);
  P.hitT = Math.max(0, P.hitT - dt);
  P.invuln = Math.max(0, P.invuln - dt);
  P.flipT = Math.max(0, P.flipT - dt);
  P.spinT = Math.max(0, P.spinT - dt);
  P.earKick = Math.max(0, P.earKick - dt * 3);
  P.nod = Math.max(0, P.nod - dt * 5);
  P.happyT = Math.max(0, P.happyT - dt);
  if (P.shoesT > 0) {
    P.shoesT -= dt;
    if (Math.random() < dt * 12) { worldAt(P.s, P.x, 0.2, _pv); burst(_pv, '#6ee7ff', 1, 1, 0.4, 0.5); }
    if (P.shoesT <= 0) { P.shoesT = 0; POWERUPS.shoes.end(P); Sound.expire(); }
  }
  r3.shake = Math.max(0, r3.shake - dt * 2.5);
  // Gegner bewegen, Kollisionen
  const feet = P.y, head = P.y + (P.slideT > 0 && P.onGround ? R3.SLIDE_H : R3.STAND_H);
  for (const o of r3.obs) {
    const def = o.def;
    o.t += dt;
    if (def.speed && !o.active && o.s - P.s < R3.ACTIVATE) o.active = true;
    if (def.speed && o.active && !o.hit) { o.s -= def.speed * dt; placeObstacle(o); }
    if (o.hit) continue;
    const ds = o.s - P.s;
    if (ds > def.hd + 0.45 || ds < -def.hd - 0.45) continue;
    if (Math.abs(P.x - o.x) >= def.hw + R3.HALF_W) continue;
    if (feet >= def.top || head <= def.bottom) continue;
    if (P.beeT > 0 || P.invuln > 0) continue;
    // seitlich reingelaufen? -> zurückprallen statt Unfall
    if (Math.abs(P.xPrev - o.x) >= def.hw + R3.HALF_W - 0.05 && ds > -def.hd + 0.3) {
      P.lane = P.prevLane;
      r3.shake = Math.max(r3.shake, 0.25);
      Sound.r3Bump();
      continue;
    }
    hitObstacle(o);
    if (P.dead) return;
  }
  // Handys
  for (const ph of r3.phones) {
    if (ph.taken) { ph.anim += dt; continue; }
    const ds = ph.s - P.s;
    if (ds > 0.9 || ds < -0.9) continue;
    if (Math.abs(ph.x - P.x) > 1.0) continue;
    if (ph.h < feet - 0.35 || ph.h > head + 0.45) continue;
    ph.taken = true;
    ph.anim = 0;
    r3.phonesN++;
    r3.combo = r3.t - r3.lastPhoneT < 0.45 ? r3.combo + 1 : 0;
    r3.lastPhoneT = r3.t;
    Sound.r3Phone(r3.combo);
    P.earKick = 1;
    P.nod = 1;
    P.happyT = 0.6;
    worldAt(ph.s, ph.x, ph.h, _pv);
    burst(_pv, '#ffb3e6', 7, 3, 0.4, 1.5);
  }
  // Power-ups
  for (const it of r3.items) {
    if (it.taken) continue;
    const ds = it.s - P.s;
    if (Math.abs(ds) > 1.0 || Math.abs(it.x - P.x) > 1.1 || feet > 2.4) continue;
    it.taken = true;
    Sound.pickup();
    P.spinT = 0.6;
    P.happyT = 1.2;
    worldAt(it.s, it.x, 1, _pv);
    burst(_pv, POWERUPS[it.type].color, 22, 4, 0.7, 2);
    POWERUPS[it.type].start(P);
    E.scene.remove(it.mesh);
  }
  // Hinweise (Tutorial)
  for (const h of r3.hints) {
    if (!h.shown && h.s - P.s < 34) { h.shown = true; showR3Msg(h.text, 1.6, true); }
  }
  meters = Math.floor(P.s);
}

function hitObstacle(o) {
  const P = r3.pl;
  o.hit = true;
  if (o.def.lethal) { P.deathBlock = BLOCKS.has(o.kind); die(); return; }
  P.hearts--;
  P.hitT = 0.55;
  P.invuln = R3.INVULN;
  r3.shake = 0.5;
  Sound.hurt();
  worldAt(o.s, o.x, 0.8, _pv);
  burst(_pv, '#ffffff', 14, 4, 0.5, 2);
  // kleines Hindernis fliegt weg
  o.fly = { vy: 5, vx: (Math.random() - 0.5) * 6, rot: (Math.random() - 0.5) * 8 };
  if (P.hearts <= 0) die();
}

function die() {
  const P = r3.pl;
  if (P.dead) return;
  P.dead = true;
  P.deadT = 0;
  P.slideT = 0;
  P.beeT = 0;
  Sound.stopBuzz();
  Sound.r3Crash();
  r3.shake = 0.8;
  worldAt(P.s, P.x, 1.2, _pv);
  burst(_pv, '#ffffff', 26, 5, 0.6, 2);
  meters = Math.floor(P.s);
  gameOver();
}

/* ---------- Kamera ---------- */
// Kamera: hoch genug, damit man weit nach vorne sieht, was kommt
const CAM_BACK = 6.8, CAM_UP = 4.3, CAM_AHEAD = 14, CAM_LOOK_H = 0.5;
function updateCamera(dt) {
  const P = r3.pl, cam = E.camera;
  const bee = P.beeT > 0 ? 1 : 0;
  // hinter und über Pork, schaut ein Stück voraus – folgt Kurven und Höhen
  // beim schnellen Bienenflug hinkt die weiche Kamera sonst weit hinterher
  const lag = r3.baseSpeed > 0 ? (r3.speed - r3.baseSpeed) / 9 : 0;
  const back = CAM_BACK + bee * 0.8 - lag, up = CAM_UP + P.y * 0.8 + bee * 0.4;
  worldAt(P.s - back, P.x * 0.6, up, _cv);
  worldAt(P.s + CAM_AHEAD, P.x * 0.75, CAM_LOOK_H + P.y * 0.65, _lv);
  if (P.dead) {
    // Game Over: Kamera schwenkt nach vorne, damit man Pork sieht
    const k = smooth01(Math.min(1, P.deadT / 1.4));
    const p = trackAt(P.s, _tp1);
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    // vor einem Kiosk/Container nur seitlich herum, sonst landet die Kamera darin
    const ang = k * (P.deathBlock ? 1.45 : 2.4) * (P.x > 0 ? -1 : 1);
    const px = p.x - c * P.x, pz = p.z + sn * P.x;
    _cv.set(px - Math.sin(p.yaw + ang) * 4.6, p.y + 3.4 + k * (P.deathBlock ? 1.8 : 0.8), pz - Math.cos(p.yaw + ang) * 4.6);
    _lv.set(px, p.y + 0.4, pz);
  }
  if (r3.intro > 0 && !P.dead) {
    // Start: Kamera kommt von vorne herum hinter Pork
    const k = smooth01(1 - r3.intro / 1.1);
    const p = trackAt(P.s, _tp1);
    const a = (1 - k) * Math.PI;
    const dist = r3lerp(4.0, CAM_BACK, k);
    _cv.set(p.x - Math.sin(p.yaw + a) * dist, p.y + r3lerp(1.6, CAM_UP, k), p.z - Math.cos(p.yaw + a) * dist);
    _lv.set(p.x, p.y + r3lerp(1.2, 0.9, k), p.z);
  }
  const kp = r3.intro > 0 ? 1 : damp(P.dead ? 3 : 9, dt);
  cam.position.lerp(_cv, kp);
  r3.camLook.lerp(_lv, r3.intro > 0 ? 1 : damp(12, dt));
  cam.lookAt(r3.camLook);
  // Neigung in Kurven + beim Spurwechsel, Wackeln bei Treffern
  const p = trackAt(P.s + 6, _tp2);
  cam.rotateZ(r3clamp(-p.k * 9, -0.12, 0.12) - r3clamp(P.latVel * 0.004, -0.04, 0.04));
  if (r3.shake > 0) {
    cam.position.x += (Math.random() - 0.5) * r3.shake * 0.5;
    cam.position.y += (Math.random() - 0.5) * r3.shake * 0.5;
  }
  const fov = 60 + (r3.baseSpeed - R3.SPEED0) * 0.45 + bee * 6 + (r3.speed / r3.baseSpeed - 1) * 5;
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * damp(3, dt); cam.updateProjectionMatrix(); }
}

/* ---------- Welt pro Bild aktualisieren ---------- */
let _phM, _phQ, _phS, _phE;
function updateWorld(dt) {
  const P = r3.pl;
  // Pork platzieren
  const p = worldAt(P.s, P.x, P.y + (P.shoesT > 0 && P.onGround ? 0.2 : 0), _pv, _tp1);
  E.pork.root.position.copy(_pv);
  E.pork.root.rotation.y = p.yaw;
  animatePork(dt, r3.t);
  // Hindernisse: Animationen, wegfliegende Teile, aufräumen
  const lampOn = Math.floor(r3.t * 3) % 2 === 0;
  E.mat.lamp.emissiveIntensity = lampOn ? 2.2 : 0.3;
  for (let i = r3.obs.length - 1; i >= 0; i--) {
    const o = r3.obs[i];
    if (o.s < P.s - 18 || o.gone) { releaseObstacle(o); r3.obs.splice(i, 1); continue; }
    o.mesh.visible = P.dead || o.s > P.s - 1.6 || !!o.fly;
    const u = o.mesh.userData;
    if (u.warn) {   // Warnzeichen blinkt, solange der Gegner kommt
      const on = !o.hit && o.s > P.s + 2;
      u.warn.visible = u.wglow.visible = on;
      const pz = 1 + Math.abs(Math.sin(r3.t * 6)) * 0.3;
      u.warn.scale.set(0.8 * pz, 0.8 * pz, 1);
      u.wglow.material.opacity = 0.55 + Math.abs(Math.sin(r3.t * 6)) * 0.4;
      u.warn.position.y = u.warn.userData.y0 + Math.sin(r3.t * 3) * 0.12;
    }
    if (o.kind === 'crab') {
      const k = o.active ? 14 : 3;
      u.legs.forEach((lg, j) => { lg.rotation.x = Math.sin(o.t * k + j) * 0.5; });
      for (const c of u.claws) c.rotation.z = Math.sin(o.t * 8) * 0.4;
    } else if (o.kind === 'gull') {
      const fl = Math.sin(o.t * (o.active ? 16 : 4)) * (o.active ? 0.7 : 0.15);
      u.wings[0].rotation.z = -fl;
      u.wings[1].rotation.z = fl;
      o.mesh.position.y += Math.sin(o.t * 3) * 0.08;
    } else if (o.kind === 'buggy' && o.active) {
      for (const w of u.wheels) w.rotation.x += dt * 16;
      o.mesh.position.y += Math.abs(Math.sin(o.t * 18)) * 0.04;
    }
    if (o.fly) {
      o.fly.vy -= 18 * dt;
      o.mesh.position.y += o.fly.vy * dt;
      o.mesh.rotation.z += o.fly.rot * dt;
      o.mesh.position.addScaledVector(_tv.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)), o.fly.vx * dt);
      if (o.mesh.position.y < -10) o.gone = true;
    }
  }
  // Power-up-Objekte drehen/schweben, aufräumen
  for (let i = r3.items.length - 1; i >= 0; i--) {
    const it = r3.items[i];
    if (it.s < P.s - 10 || it.taken) { if (!it.taken) E.scene.remove(it.mesh); E.pickPool[it.type].push(it.mesh); r3.items.splice(i, 1); continue; }
    it.t += dt;
    const q = worldAt(it.s, it.x, 0.15 + Math.sin(it.t * 3) * 0.12, _tv);
    it.mesh.position.copy(_tv);
    it.mesh.userData.model.rotation.y = it.t * 2;
    it.mesh.rotation.y = q.yaw;
    const fx = it.mesh.userData.fx, pulse = 1 + Math.sin(it.t * 7) * 0.18;
    fx.glow.scale.set(3.4 * pulse, 3.4 * pulse, 1);
    fx.beam.material.opacity = 0.55 + Math.sin(it.t * 5) * 0.25;
    fx.ring.rotation.z = it.t * 1.5;
    fx.ring.position.y = Math.sin(it.t * 2.4) * 0.35;
    fx.floor.scale.setScalar(1 + (it.t * 0.8 % 1) * 0.5);
    for (const sp of fx.sparks) {
      const a = sp.userData.a + it.t * 2.6;
      sp.position.set(Math.cos(a) * 1.0, Math.sin(it.t * 3 + sp.userData.a) * 0.5, Math.sin(a) * 1.0);
    }
  }
  // Handys: drehen, schweben, Sammel-Animation
  const ga = E.phoneGlow.geometry.attributes.position.array;
  for (let i = r3.phones.length - 1; i >= 0; i--) {
    const ph = r3.phones[i];
    if (ph.s < P.s - 6 || (ph.taken && ph.anim > 0.35)) { releasePhone(ph); r3.phones.splice(i, 1); continue; }
    ph.t += dt;
    let sc = 1, h = ph.h + Math.sin(ph.t * 3) * 0.08, ps = ph.s, px = ph.x;
    if (ph.taken) {
      // Einsammeln: fliegt mit Pork mit über seinen Kopf und schrumpft dort weg
      // (nicht stehen bleiben, sonst klebt es von hinten gesehen auf seinem Rücken)
      const k = Math.min(1, ph.anim / 0.35), e = 1 - (1 - k) * (1 - k);
      ps = r3lerp(ph.s, P.s + 0.4, e);
      px = r3lerp(ph.x, P.x, e);
      h = r3lerp(ph.h, P.y + 2.9, e);
      sc = k < 0.25 ? 1 + k * 1.6 : 1.4 * (1 - (k - 0.25) / 0.75);
    }
    const q = worldAt(ps, px, h, _tv);
    _phE.set(0.15, q.yaw + Math.PI + Math.sin(ph.t * 2.2) * 0.45, Math.sin(ph.t * 1.7) * 0.12);   // Bildschirm zu Pork, leicht wippend
    _phQ.setFromEuler(_phE);
    _phM.compose(_tv, _phQ, _phS.set(sc, sc, sc));
    E.phoneBody.mesh.setMatrixAt(ph.slot, _phM);
    E.phoneScreen.mesh.setMatrixAt(ph.slot, _phM);
    ga[ph.slot * 3] = _tv.x; ga[ph.slot * 3 + 1] = ph.taken ? -9999 : _tv.y; ga[ph.slot * 3 + 2] = _tv.z;
  }
  E.phoneBody.mesh.instanceMatrix.needsUpdate = true;
  E.phoneScreen.mesh.instanceMatrix.needsUpdate = true;
  E.phoneGlow.geometry.attributes.position.needsUpdate = true;
  updateParticles(dt);
  // Strecke nachbauen / abbauen, Inhalt erzeugen
  if (!P.dead) {
    extendTrack(r3.track, P.s + R3.VIEW + 160);
    genContent(P.s + R3.VIEW);
    syncChunks();
  }
  for (const pool of E.pools) pool.flush();
  // Himmel, Meer, Kulisse und Sonne wandern mit
  const cam = E.camera.position;
  E.sky.position.copy(cam);
  E.sea.position.set(Math.round(cam.x / 20) * 20, SEA_Y, Math.round(cam.z / 20) * 20);
  E.sea.material.uniforms.time.value = r3.t;
  E.ring.position.set(cam.x, 0, cam.z);
  E.beamPivot.rotation.y = r3.t * 0.6;
  for (const b of E.boats) { b.rotation.z = Math.sin(r3.t * 0.8 + b.userData.ph) * 0.05; b.position.y = 0.6 + Math.sin(r3.t * 0.9 + b.userData.ph) * 0.25; }
  E.sun.position.copy(_pv).addScaledVector(E.sunDir, 80);
  E.sun.target.position.copy(_pv);
  E.fill.position.copy(_pv).add(_tv.set(-E.sunDir.x * 40, 30, -E.sunDir.z * 40));
  E.fill.target.position.copy(_pv);
  E.tex.foam.offset.x = Math.sin(r3.t * 0.8) * 0.12;
  E.tex.foam.offset.y = r3.t * 0.05;
}

/* ---------- HUD ---------- */
function r3Hud(force) {
  const P = r3.pl, H3 = r3.hud;
  const m = `${Math.floor(P.s)} m`;
  if (force || H3.m !== m) { H3.m = m; document.getElementById('r3Meters').textContent = m; }
  if (force || H3.p !== r3.phonesN) {
    H3.p = r3.phonesN;
    const elp = document.getElementById('r3Phones');
    elp.textContent = r3.phonesN;
    elp.parentElement.classList.remove('pop');
    void elp.parentElement.offsetWidth;
    elp.parentElement.classList.add('pop');
  }
  if (force || H3.h !== P.hearts) {
    H3.h = P.hearts;
    let html = '';
    for (let i = 0; i < R3.HEARTS; i++) html += HEART_SVG(i < P.hearts);
    document.getElementById('r3Hearts').innerHTML = html;
  }
  const pu = (id, v, max) => {
    const e = document.getElementById(id);
    show(e, v > 0);
    if (v > 0) {
      e.querySelector('i').style.width = `${Math.min(1, v / max) * 100}%`;
      e.classList.toggle('blink', v < Math.min(2.5, max * 0.3));
    }
  };
  pu('r3PuShoes', P.shoesT, R3.SHOES_T);
  pu('r3PuBee', P.beeT, R3.BEE_T);
}

let r3MsgTimer = 0;
function showR3Msg(text, dur, hint) {
  const m = document.getElementById('r3Msg');
  m.textContent = text;
  m.classList.toggle('hint', !!hint);
  show(m, true);
  m.classList.remove('pop');
  void m.offsetWidth;
  m.classList.add('pop');
  r3MsgTimer = dur;
}

/* ---------- Leistung: Qualität automatisch anpassen ---------- */
function watchPerformance(dt) {
  if (r3.intro > 0) return;
  const F = E.frameTimes;
  F.push(dt);
  if (F.length < 150) return;
  const avg = F.reduce((a, b) => a + b, 0) / F.length;
  F.length = 0;
  if (avg > 0.026 && E.quality > 0) { E.quality--; applyQuality(); }
}

/* ---------- Ein Bild (wird aus der Haupt-Schleife in game.js aufgerufen) ---------- */
function r3Frame(dt) {
  if (!r3 || !E) return;
  if (!(dt > 0)) return;                    // erstes Bild ohne Zeit: nichts tun (sonst Division durch 0)
  if (state === 'paused') return;           // Pause: nichts rechnen, nichts zeichnen
  if (state === 'playing') {
    const n = Math.max(1, Math.ceil(dt / (1 / 120) - 1e-6));
    const h = dt / n;
    for (let i = 0; i < n && state === 'playing' && !r3.pl.dead; i++) r3Update(h);
    watchPerformance(dt);
  } else if (state === 'over') {
    r3.overT += dt;
    if (r3.overT > 3) return;               // Game-Over-Animation fertig: nichts mehr zeichnen
    r3.pl.deadT += dt;
    r3.t += dt;
  }
  updateWorld(dt);
  updateCamera(dt);
  E.renderer.render(E.scene, E.camera);
  if (state === 'playing') r3Hud(false);
  if (r3MsgTimer > 0) {
    r3MsgTimer -= dt;
    if (r3MsgTimer <= 0) show(document.getElementById('r3Msg'), false);
  }
}
