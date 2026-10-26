'use strict';

/* =========================================================
   PORK JUMP – RUN-MODUS
   Pork läuft automatisch nach rechts. Rechts-Button = springen
   (halten = höher, in der Luft nochmal = Doppelsprung),
   Links-Button = sliden (in der Luft: schnell runter).
   Nutzt Welten, Sound, Partikel und drawPork aus game.js.
   ========================================================= */

// ---------- Werte zum Drehen ----------
const R = {
  G: 2500,            // Schwerkraft
  JUMP_V: 640,        // Absprung (kurz tippen ≈ 80 hoch)
  JUMP2_V: 600,       // Doppelsprung
  HOLD_G: 0.35,       // Schwerkraft-Faktor solange man hält …
  HOLD_T: 0.25,       // … maximal so lange (voll gehalten ≈ 170 hoch)
  MAX_FALL: 1600,
  SPEED0: 290,        // Start-Tempo
  SPEED_MAX: 520,     // Endtempo (wird langsam erreicht)
  HEARTS: 3,
  INVULN: 1.4,        // Sekunden unverwundbar nach Treffer
  MAGNET_T: 8,
  TURBO_T: 5,
  TURBO_MUL: 1.6,
  STAND_H: 56,        // Hitbox-Höhe stehend
  SLIDE_H: 26,        // Hitbox-Höhe beim Sliden
  START_X: 0
};

let run = null;

const runSpeedAt = m => R.SPEED0 + (R.SPEED_MAX - R.SPEED0) * (1 - Math.exp(-m / 900));
const xToM = x => Math.max(0, x / PX_PER_M);
const themeKey = i => THEMES[i].amb;

const rEl = {
  hearts: document.getElementById('hearts'),
  truffles: document.querySelector('#truffleCount span'),
  puMagnet: document.getElementById('puMagnet'),
  puShield: document.getElementById('puShield'),
  puTurbo: document.getElementById('puTurbo')
};

/* ---------- Extra-Sounds für den Run-Modus ---------- */
Object.assign(Sound, {
  jump2() { this.tone(520, 1150, 0.12, 'square', 0.05); },
  truffle() { this.tone(1250, 1750, 0.07, 'square', 0.03); },
  hurt() { this.tone(320, 90, 0.35, 'sawtooth', 0.11); this.tone(160, 60, 0.3, 'square', 0.06); },
  pop() { this.tone(900, 180, 0.22, 'triangle', 0.13); },
  smash() { this.tone(180, 50, 0.2, 'square', 0.1); },
  heal() { [523, 659, 784].forEach((f, i) => this.tone(f, f, 0.14, 'triangle', 0.08, i * 0.08)); },
  turbo() { [0, 1, 2, 3].forEach(i => this.tone(300 + i * 150, 600 + i * 300, 0.12, 'square', 0.05, i * 0.06)); },
  slide() { this.tone(260, 140, 0.15, 'triangle', 0.05); }
});

/* =========================================================
   START
   ========================================================= */
function startRun() {
  setMode('run');
  Sound.stopLoops();
  heliLeave = null;
  flash = 0;
  particles = [];
  popups = [];
  platforms = [];
  camY = 0;
  gameT = 0;
  meters = 0;
  themeSeq = [];
  const gy = Math.round(H * 0.78);
  run = {
    gy, camX: 0, genX: 0, speed: R.SPEED0,
    ground: [{ x0: -W, x1: 0 }],
    plats: [], obs: [], trufs: [], items: [],
    hearts: R.HEARTS, invuln: 0, shield: false, magnet: 0, turbo: 0,
    truffles: 0, lastPress: input.rightPress, buffer: 0, coyote: 0, jumps: 0, hold: 0,
    itemCool: 3, shake: 0, hurtFlash: 0, dying: false, heartsShown: -1, trufShown: -1
  };
  rgFlat(520); // sicherer Anlauf
  runGen();
  player = newPlayer(R.START_X, gy);
  player.runPhase = 0;
  player.onGround = true;
  player.sliding = false;
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

/* =========================================================
   STRECKEN-GENERATOR
   Die Strecke besteht aus Boden-Stücken (mit Lücken = Abgründe),
   schwebenden Plattformen, Hindernissen, Trüffeln und Items.
   ========================================================= */
function rgFlat(len) {
  run.genX += len;
  run.ground[run.ground.length - 1].x1 = run.genX;
}
function rgGap(w) {
  run.genX += w;
  run.ground.push({ x0: run.genX, x1: run.genX });
}

// Hindernis-Typen: low (drüber), tall (hoch drüber), bar (Stachelbalken: drunter sliden),
// wall (Stachel-Mauer mit Durchschlupf: ganze Länge durchsliden),
// flier (fliegt entgegen), roller (rollt entgegen)
const OBS_SIZE = { low: [32, 30], tall: [34, 88], bar: [56, 0], wall: [120, 0], flier: [34, 26], roller: [30, 30] };
const SLIDE_GAP = 36;            // Unterkante von Balken/Mauer über dem Boden
const ANCHOR_UP = 330;           // so hoch hängt der Stahlträger (höher als jeder Sprung)

function rgObstacle(kind, x, baseY, wOverride) {
  const gy = baseY === undefined ? run.gy : baseY;
  const [w0, h] = OBS_SIZE[kind];
  const w = wOverride || w0;
  const o = { kind, x, w, h, theme: themeAt(xToM(x)), dead: false, active: false, rot: 0, vx: 0, vy: 0, t: Math.random() * 6 };
  if (kind === 'bar' || kind === 'wall') { o.y = -400; o.h = gy - SLIDE_GAP + 400; }
  else if (kind === 'flier') { o.base = gy - 64; o.y = o.base; o.vx = -80; }
  else if (kind === 'roller') { o.y = gy - h; o.vx = -150; }
  else o.y = gy - h;
  run.obs.push(o);
  return o;
}

function rgTruffle(x, y) {
  run.trufs.push({ x, y, taken: false, phase: x * 0.05 });
}
// Simuliert einen Sprung (holdT = wie lange gehalten) und liefert die Flugbahn
const pathCache = new Map();
function jumpPath(sp, holdT) {
  const key = Math.round(sp / 10) + '|' + holdT;
  if (pathCache.has(key)) return pathCache.get(key);
  const pts = [];
  let y = 0, vy = -R.JUMP_V, t = 0;
  while (t < 2) {
    const g = vy < 0 && t < holdT ? R.G * R.HOLD_G : R.G;
    vy += g * STEP;
    y += vy * STEP;
    t += STEP;
    if (y >= 0) break;
    pts.push([sp * t, y]);
  }
  pathCache.set(key, pts);
  return pts;
}
// Trüffel genau dort, wo Porks Körper beim passenden Sprung entlangfliegt
function rgJumpArc(xTakeoff, sp, holdT, n) {
  const path = jumpPath(sp, holdT);
  for (let i = 0; i < n; i++) {
    const k = Math.round((path.length - 1) * (0.22 + 0.56 * (n === 1 ? 0.5 : i / (n - 1))));
    const [dx, dy] = path[k];
    rgTruffle(xTakeoff + dx, run.gy - 28 + dy);
  }
}
// Bogen, dessen höchster Punkt über cx liegt
function rgArcOver(cx, sp, holdT, n) {
  const path = jumpPath(sp, holdT);
  let apex = 0;
  for (let i = 1; i < path.length; i++) if (path[i][1] < path[apex][1]) apex = i;
  rgJumpArc(cx - path[apex][0], sp, holdT, n);
}

function rgLine(x0, x1, y, step) {
  for (let x = x0; x <= x1; x += step) rgTruffle(x, y);
}

function rgPlatform(x, y, w) {
  const p = { x, y, w, h: 14, vx: 0, theme: themeAt(xToM(x)), item: null };
  run.plats.push(p);
  return p;
}

function rgItem(x, y) {
  let type;
  const r = Math.random();
  if (r < 0.35) type = 'magnet';
  else if (r < 0.65) type = 'shield';
  else if (r < 0.85) type = 'turbo';
  else type = 'heart';
  run.items.push({ type, x, y, taken: false });
}
function maybeItem(x, y) {
  run.itemCool--;
  if (run.itemCool <= 0 && Math.random() < 0.3) {
    rgItem(x, y);
    run.itemCool = 5;
    return true;
  }
  return false;
}

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function runGen() {
  while (run.genX < run.camX + W * 3) rgPattern();
  // Alte Sachen hinter der Kamera wegräumen
  const gone = run.camX - 150;
  run.obs = run.obs.filter(o => o.x + o.w > gone && o.y < H + 200 && !o.vanish);
  run.plats = run.plats.filter(p => p.x + p.w > gone);
  run.trufs = run.trufs.filter(t => t.x > gone && !t.taken);
  run.items = run.items.filter(t => t.x > gone && !t.taken);
  while (run.ground.length > 2 && run.ground[0].x1 < gone) run.ground.shift();
}

function rgPattern() {
  const m = xToM(run.genX);
  const d = clamp(m / 1500, 0, 1);         // Schwierigkeit 0..1
  const sp = runSpeedAt(m);
  // Verschnaufpause zwischen zwei Mustern
  rgFlat(sp * rand(0.5, 0.85) * (1.15 - d * 0.35));

  const options = [['single', 30], ['pit', 18], ['trufline', 5]];
  if (m > 60) options.push(['double', 10 + 12 * d]);
  if (m > 45) options.push(['upper', 11]);
  if (m > 80) options.push(['bridge', 12 + 6 * d]);
  let total = options.reduce((a, o) => a + o[1], 0);
  let r = Math.random() * total;
  let kind = options[0][0];
  for (const [k, wgt] of options) { if ((r -= wgt) < 0) { kind = k; break; } }

  const kinds = ['low'];
  if (m > 35) kinds.push('roller');
  if (m > 60) kinds.push('bar');
  if (m > 100) kinds.push('flier');
  if (m > 140) kinds.push('tall');
  if (m > 90) kinds.push('wall');

  switch (kind) {
    case 'single': {
      const k = pick(kinds);
      if (k === 'roller' || k === 'flier') rgFlat(150);  // Platz, weil sie entgegenkommen
      const x = run.genX + 20;
      const o = rgObstacle(k, x, undefined, k === 'wall' ? rand(100, 190) : undefined);
      if (k === 'bar' || k === 'wall') rgLine(x + 6, x + o.w - 6, run.gy - 14, 36);
      else if (k === 'low') rgArcOver(x + o.w / 2, sp, 0, 3);
      else if (k === 'tall') rgArcOver(x + o.w / 2, sp, R.HOLD_T, 3);
      rgFlat(o.w + 60);
      break;
    }
    case 'double': {
      const combos = [['low', 'bar'], ['bar', 'low'], ['low', 'low'], ['bar', 'bar']];
      if (m > 140) combos.push(['low', 'tall'], ['tall', 'bar'], ['low', 'wall'], ['wall', 'low']);
      const [a, b] = pick(combos);
      const x1 = run.genX + 20;
      const o1 = rgObstacle(a, x1, undefined, a === 'wall' ? rand(90, 150) : undefined);
      const gap = a === 'bar' && b === 'bar' ? rand(50, 90) : sp * rand(0.7, 0.9) + 40;
      const x2 = x1 + o1.w + gap;
      const o2 = rgObstacle(b, x2, undefined, b === 'wall' ? rand(90, 150) : undefined);
      for (const o of [o1, o2]) {
        if (o.kind === 'bar' || o.kind === 'wall') rgLine(o.x + 6, o.x + o.w - 6, run.gy - 14, 36);
        else rgArcOver(o.x + o.w / 2, sp, o.kind === 'tall' ? R.HOLD_T : 0, o.kind === 'tall' ? 3 : 2);
      }
      run.genX = x2;
      rgFlat(o2.w + 60);
      break;
    }
    case 'pit': {
      const w = rand(60, Math.min(sp * 0.55, 80 + d * 150));
      rgJumpArc(run.genX - 25, sp, R.HOLD_T, 3);   // Bahn eines gehaltenen Sprungs kurz vor der Kante
      rgGap(w);
      rgFlat(60);
      break;
    }
    case 'bridge': {
      // Langer Abgrund, drüber schwebende Plattformen
      const n = randInt(2, 3);
      let x = run.genX + rand(40, sp * 0.3);
      let y = run.gy - pick([90, 110]);
      const pitStart = run.genX;
      let last = null;
      for (let i = 0; i < n; i++) {
        const w = rand(110, 180);
        last = rgPlatform(x, y, w);
        rgLine(x + 25, x + w - 25, y - 28, 44);
        if (d > 0.35 && w > 150 && Math.random() < 0.35) rgObstacle('low', x + w * 0.55, y);
        else if (i === n - 1) maybeItem(x + w * 0.5, y - 90);
        x += w + rand(50, sp * 0.38);
        y = clamp(y + pick([-60, -30, 0, 30, 50]), run.gy - 170, run.gy - 70);
      }
      const end = last.x + last.w + rand(30, sp * 0.24);
      rgGap(end - pitStart);
      run.genX = end;
      rgFlat(60);
      break;
    }
    case 'upper': {
      // Unten Hindernisse, oben ein Bonus-Weg mit vielen Trüffeln
      const len = rand(420, 680);
      const x0 = run.genX;
      const px = x0 + 110;
      const pw = len - 160;
      const py = run.gy - 135;
      rgPlatform(px, py, pw);
      rgLine(px + 25, px + pw - 25, py - 28, 40);
      maybeItem(px + pw * 0.6, py - 80);
      const nObs = randInt(1, 2);
      for (let i = 0; i < nObs; i++) rgObstacle('low', x0 + 170 + i * (len - 260));
      rgFlat(len);
      break;
    }
    case 'trufline': {
      const len = rand(220, 340);
      for (let x = run.genX + 20; x < run.genX + len; x += 40) {
        rgTruffle(x, run.gy - 28 - Math.max(0, Math.sin((x - run.genX) * 0.02)) * 50);
      }
      maybeItem(run.genX + len * 0.5, run.gy - 110);
      rgFlat(len);
      break;
    }
  }
}

/* =========================================================
   UPDATE
   ========================================================= */
function groundUnder(x) {
  for (const g of run.ground) if (x + 8 > g.x0 && x - 8 < g.x1) return true;
  return false;
}

function runHitbox(p) {
  return p.sliding
    ? { x0: p.x - 20, x1: p.x + 18, y0: p.y - R.SLIDE_H, y1: p.y }
    : { x0: p.x - 11, x1: p.x + 11, y0: p.y - R.STAND_H, y1: p.y };
}

function runPopup(x, y, text, color) {
  popups.push({ x, y, text, color, life: 1 });
}

function smash(o) {
  if (o.kind === 'bar') { o.y = run.gy - 82; o.h = 46; }  // nur der Stachelbalken fliegt weg
  if (o.kind === 'wall') {                                   // Mauer zerbröselt
    o.vanish = true;
    for (let i = 0; i < 26; i++) {
      particles.push({ x: o.x + rand(0, o.w), y: run.gy - rand(40, 200), vx: rand(-80, 260), vy: rand(-300, 0),
        life: 0.7, max: 0.7, r: rand(3, 6), color: i % 2 ? THEMES[o.theme].plat.base : THEMES[o.theme].plat.top });
    }
  }
  o.dead = true;
  o.vx = rand(250, 400);
  o.vy = rand(-500, -350);
  o.spin = rand(8, 14);
  Sound.smash();
  for (let i = 0; i < 10; i++) {
    particles.push({ x: o.x + o.w / 2, y: Math.max(o.y, run.gy - 60) + 10, vx: rand(-150, 150), vy: rand(-250, -50),
      life: 0.5, max: 0.5, r: rand(2, 4), color: THEMES[o.theme].plat.top });
  }
}

function hurt() {
  const p = player;
  if (run.shield) {
    run.shield = false;
    run.invuln = 0.8;
    Sound.pop();
    sparkle(p.x, p.y - 30);
    runPopup(p.x, p.y - 70, 'Schild weg!', '#6ee7ff');
    return;
  }
  run.hearts--;
  run.invuln = R.INVULN;
  run.shake = 0.3;
  run.hurtFlash = 0.5;
  Sound.hurt();
  if (run.hearts <= 0) {
    run.dying = true;
    p.vy = -650;
    p.sliding = false;
    startSpin(p, 0.7);
  }
}

function runUpdate(dt) {
  const p = player;
  gameT += dt;
  flash = Math.max(0, flash - dt * 2.5);
  run.shake = Math.max(0, run.shake - dt);
  run.hurtFlash = Math.max(0, run.hurtFlash - dt);
  run.invuln = Math.max(0, run.invuln - dt);
  run.magnet = Math.max(0, run.magnet - dt);
  if (run.turbo > 0) {
    // Turbo endet erst, wenn wieder Boden unter den Füßen ist
    run.turbo -= dt;
    if (run.turbo <= 0 && !groundUnder(p.x)) run.turbo = 0.01;
    if (run.turbo <= 0) { run.turbo = 0; run.invuln = Math.max(run.invuln, 0.6); }
  }

  const m = xToM(p.x);
  run.speed = runSpeedAt(m) * (run.turbo > 0 ? R.TURBO_MUL : 1);
  const falling = p.y > run.gy + 40;
  let vx = run.speed;
  if (run.dying) vx = 60;
  else if (falling) vx *= 0.5;
  p.x += vx * dt;

  // ---- Springen / Sliden ----
  if (input.rightPress !== run.lastPress) {
    run.lastPress = input.rightPress;
    run.buffer = 0.12;
  }
  run.buffer -= dt;
  if (!run.dying && !falling && run.buffer > 0) {
    if (p.onGround || run.coyote > 0) {
      p.vy = -R.JUMP_V;
      run.hold = R.HOLD_T;
      run.jumps = 1;
      p.onGround = false;
      run.coyote = 0;
      run.buffer = 0;
      Sound.jump();
      puff(p.x, p.y, 'rgba(255,255,255,0.8)', 4);
    } else if (run.jumps < 2) {
      p.vy = -R.JUMP2_V;
      run.hold = R.HOLD_T * 0.8;
      run.jumps = 2;
      run.buffer = 0;
      Sound.jump2();
      startSpin(p, 0.45);
      puff(p.x, p.y, 'rgba(255,255,255,0.8)', 6);
    }
  }
  let g = R.G;
  if (p.vy < 0 && input.right && run.hold > 0) g *= R.HOLD_G;
  run.hold = input.right ? run.hold - dt : 0;
  if (input.left && !p.onGround && !run.dying) g *= 2.6;   // schnell runter
  p.vy = Math.min(p.vy + g * dt, R.MAX_FALL);
  const prevY = p.y;
  p.y += p.vy * dt;
  const wasGround = p.onGround;
  p.onGround = false;
  if (p.vy >= 0 && !run.dying) {
    for (const pl of run.plats) {
      if (prevY <= pl.y && p.y >= pl.y && p.x + 8 > pl.x && p.x - 8 < pl.x + pl.w) {
        p.y = pl.y;
        p.onGround = true;
        break;
      }
    }
    // Kanten-Gnade: wer knapp unter die Kante rutscht, wird noch hochgezogen
    if (!p.onGround && prevY <= run.gy + 16 && p.y >= run.gy && (groundUnder(p.x) || run.turbo > 0)) {
      p.y = run.gy;
      p.onGround = true;
    }
    if (p.onGround) {
      if (!wasGround && p.vy > 350) { p.squash = 0.8; puff(p.x, p.y, 'rgba(255,255,255,0.8)', 5); }
      p.vy = 0;
    }
  }
  if (p.onGround) { run.jumps = 0; run.coyote = 0.09; } else run.coyote -= dt;
  const wasSliding = p.sliding;
  p.sliding = input.left && p.onGround && !run.dying;
  if (p.sliding && !wasSliding) Sound.slide();
  if (p.sliding && Math.random() < dt * 25) {
    particles.push({ x: p.x + 10, y: p.y - 2, vx: rand(-120, -60), vy: rand(-60, -20), life: 0.3, max: 0.3, r: rand(1.5, 3),
      color: THEMES[themeAt(m)].plat.top });
  }
  p.squash = Math.max(0, p.squash - dt * 5);
  if (p.spinV) {
    p.spin += p.spinV * dt;
    if (p.spin >= Math.PI * 2) { p.spin = 0; p.spinV = 0; }
  }
  if (p.onGround && !p.sliding) p.runPhase += dt * run.speed / 22;

  // ---- Hindernisse ----
  const view = run.camX + W + 60;
  const hb = runHitbox(p);
  for (const o of run.obs) {
    if (o.dead) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.vy += R.G * dt;
      o.rot += o.spin * dt;
      continue;
    }
    o.t += dt;
    if (!o.active && o.x < view) o.active = true;
    if (o.active && o.kind === 'flier') {
      o.x += o.vx * dt;
      o.y = o.base + Math.sin(o.t * 4) * 4;
    } else if (o.active && o.kind === 'roller') {
      o.x += o.vx * dt;
      o.rot += (o.vx / 15) * dt;
      const cx = o.x + o.w / 2;
      let solid = false;
      for (const gr of run.ground) if (cx > gr.x0 && cx < gr.x1) solid = true;
      if (!solid || o.vy > 0) { o.vy += R.G * dt; o.y += o.vy * dt; }
    }
    if (run.dying) continue;
    const s = 4;
    const ox0 = o.x + s, ox1 = o.x + o.w - s, oy0 = o.y + s, oy1 = o.y + o.h - (o.kind === 'bar' ? 0 : s);
    if (hb.x1 > ox0 && hb.x0 < ox1 && hb.y1 > oy0 && hb.y0 < oy1) {
      if (run.turbo > 0) smash(o);
      else if (run.invuln <= 0) {
        if (run.shield) smash(o);
        hurt();
      }
    }
  }

  // ---- Trüffel (mit Magnet) ----
  const pcx = p.x, pcy = p.y - (p.sliding ? 14 : 28);
  for (const t of run.trufs) {
    if (t.taken) continue;
    const dx = pcx - t.x, dy = pcy - t.y;
    const dist = Math.hypot(dx, dy);
    if (run.magnet > 0 && dist < 190) {
      const k = Math.min(1, (900 * dt) / (dist || 1));
      t.x += dx * k;
      t.y += dy * k;
    }
    if (dist < 24) {
      t.taken = true;
      run.truffles++;
      Sound.truffle();
      particles.push({ x: t.x, y: t.y, vx: 0, vy: -80, life: 0.35, max: 0.35, r: 3, color: '#ffd23f' });
    }
  }

  // ---- Items ----
  for (const it of run.items) {
    if (it.taken) continue;
    if (Math.abs(pcx - it.x) < 28 && Math.abs(pcy - it.y) < 34) {
      it.taken = true;
      sparkle(it.x, it.y);
      Sound.pickup();
      if (it.type === 'magnet') { run.magnet = R.MAGNET_T; runPopup(it.x, it.y - 30, 'Trüffel-Magnet!', '#ff6b6b'); }
      else if (it.type === 'shield') { run.shield = true; runPopup(it.x, it.y - 30, 'Schutzschild!', '#6ee7ff'); }
      else if (it.type === 'turbo') {
        run.turbo = R.TURBO_T;
        flash = 0.6;
        Sound.turbo();
        runPopup(it.x, it.y - 30, 'SAU-TURBO!', '#ffd23f');
      } else if (it.type === 'heart') {
        if (run.hearts < R.HEARTS) { run.hearts++; Sound.heal(); runPopup(it.x, it.y - 30, '+1 Herz', '#ff4d6d'); }
        else { run.truffles += 10; runPopup(it.x, it.y - 30, '+10 Trüffel', '#ffd23f'); }
      }
    }
  }
  if (run.turbo > 0 && Math.random() < dt * 40) {
    particles.push({ x: p.x - 12, y: p.y - rand(5, 45), vx: rand(-260, -160), vy: rand(-20, 20), life: 0.4, max: 0.4, r: rand(2, 4),
      color: `hsl(${(gameT * 600 + rand(0, 80)) % 360},100%,62%)` });
  }

  updateFx(dt);
  run.camX = p.x - W * 0.2;
  runGen();
  meters = Math.max(meters, Math.floor(xToM(p.x - R.START_X)));

  if (p.y > H + 80) gameOver();
}

/* =========================================================
   ZEICHNEN
   ========================================================= */

// Schleier über dem Hintergrund: Je näher am Boden, desto mehr tritt die Kulisse zurück,
// damit Hindernisse und Pork klar davor stehen
const HAZE = {
  beach: [255, 214, 175], forest: [18, 14, 48], snow: [228, 242, 255], fireworks: [44, 10, 32],
  desert: [255, 196, 150], cave: [5, 12, 16], candy: [255, 224, 242], lab: [8, 18, 20],
  sky: [228, 244, 255], aurora: [5, 14, 34], space: [6, 4, 20]
};
function drawRunHaze(th) {
  const [r, g, b] = HAZE[themeKey(th)];
  const gr = ctx.createLinearGradient(0, 0, 0, run.gy);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.1)`);
  gr.addColorStop(0.6, `rgba(${r},${g},${b},0.42)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0.66)`);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);   // bis ganz unten: in Abgründen sieht man den (gedämpften) Hintergrund
}

// Parallax-Hügel, damit man das Tempo spürt
function drawRunParallax(th) {
  const col = THEMES[th].plat.line;
  const layers = [[0.12, 0.22, 30, run.gy - 50, 0.011], [0.3, 0.3, 20, run.gy - 14, 0.019]];
  for (const [f, a, amp, base, fr] of layers) {
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let sx = 0; sx <= W + 8; sx += 8) {
      const wx = sx + run.camX * f;
      ctx.lineTo(sx, base - amp * (0.6 + 0.4 * Math.sin(wx * fr)) - amp * 0.4 * Math.sin(wx * fr * 2.7 + 1));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRunGround(seg) {
  const gy = run.gy;
  const a = Math.max(seg.x0, run.camX - 30), b = Math.min(seg.x1, run.camX + W + 30);
  if (b <= a) return;
  for (let x = Math.floor(a / 40) * 40; x < b; x += 40) {
    const t0 = Math.max(x, seg.x0), t1 = Math.min(x + 40, seg.x1);
    if (t1 <= t0) continue;
    const th = THEMES[themeAt(xToM(x))].plat;
    ctx.fillStyle = th.base;
    ctx.fillRect(t0, gy, t1 - t0, H - gy);
    ctx.fillStyle = th.top;
    ctx.fillRect(t0, gy, t1 - t0, 9);
    if (x + 20 > seg.x0 + 6 && x + 20 < seg.x1 - 6) {
      ctx.beginPath();
      ctx.arc(x + 20, gy + 9, 5, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(t0, gy + 2, t1 - t0, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    if ((x / 40) % 2 === 0) ctx.fillRect(x + 8, gy + 30, 6, 4);
    else ctx.fillRect(x + 22, gy + 52, 8, 4);
  }
  const shade = ctx.createLinearGradient(0, gy + 10, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = shade;
  ctx.fillRect(a, gy + 10, b - a, H - gy);
  const line = THEMES[themeAt(xToM(seg.x0))].plat.line;
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (seg.x0 > run.camX - 30) { ctx.moveTo(seg.x0, H); ctx.lineTo(seg.x0, gy); } else ctx.moveTo(a, gy);
  ctx.lineTo(b, gy);
  if (seg.x1 < run.camX + W + 30) ctx.lineTo(seg.x1, H);
  ctx.stroke();
}

function drawTruffle(x, y, phase) {
  const bob = Math.sin(gameT * 4 + phase) * 2;
  y += bob;
  glow(ctx, x, y, 14, 'rgba(255,215,120,0.35)');
  ctx.fillStyle = '#4a2c18';
  ctx.strokeStyle = '#2a1810';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x - 2.5, y + 1, 5, 0, Math.PI * 2);
  ctx.arc(x + 2.5, y, 5.5, 0, Math.PI * 2);
  ctx.arc(x, y - 3, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5232';
  circle(ctx, x - 1.5, y - 3, 1.6);
  circle(ctx, x + 3, y + 1, 1.2);
  ctx.fillStyle = 'rgba(255,240,200,0.8)';
  const tw = Math.abs(Math.sin(gameT * 3 + x));
  circle(ctx, x - 3, y - 4, 0.9 + tw);
}

function drawRunItem(it) {
  const y = it.y + Math.sin(gameT * 3 + it.x) * 4;
  const x = it.x;
  const col = { magnet: [255, 70, 70], shield: [60, 210, 255], turbo: [255, 190, 20], heart: [255, 60, 140] }[it.type];
  const pulse = 1 + Math.sin(gameT * 6) * 0.08;
  glow(ctx, x, y, 54 * pulse, `rgba(${col},0.75)`);
  glow(ctx, x, y, 28, 'rgba(255,255,255,0.7)');
  // Funkel-Sterne drumherum
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 4; k++) {
    const a = gameT * 2 + k * Math.PI / 2;
    const sx = x + Math.cos(a) * 27, sy = y + Math.sin(a) * 27, s = 2.5 + Math.sin(gameT * 9 + k) * 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - s * 1.8); ctx.lineTo(sx + s * 0.5, sy - s * 0.5); ctx.lineTo(sx + s * 1.8, sy);
    ctx.lineTo(sx + s * 0.5, sy + s * 0.5); ctx.lineTo(sx, sy + s * 1.8); ctx.lineTo(sx - s * 0.5, sy + s * 0.5);
    ctx.lineTo(sx - s * 1.8, sy); ctx.lineTo(sx - s * 0.5, sy - s * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = `rgb(${col})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 17 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const OL = '#2a1520';
  if (it.type === 'magnet') {
    ctx.strokeStyle = OL;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(x, y - 1, 7, Math.PI, 0, true);
    ctx.moveTo(x - 7, y - 1); ctx.lineTo(x - 7, y - 8);
    ctx.moveTo(x + 7, y - 1); ctx.lineTo(x + 7, y - 8);
    ctx.stroke();
    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = 5.5;
    ctx.stroke();
    ctx.fillStyle = '#e8eef3';
    ctx.fillRect(x - 9.7, y - 11, 5.4, 4);
    ctx.fillRect(x + 4.3, y - 11, 5.4, 4);
  } else if (it.type === 'shield') {
    ctx.fillStyle = '#2bb8f0';
    ctx.strokeStyle = OL;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x + 9, y - 7);
    ctx.quadraticCurveTo(x + 9, y + 6, x, y + 11);
    ctx.quadraticCurveTo(x - 9, y + 6, x - 9, y - 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 1.5, y - 6, 3, 11);
    ctx.fillRect(x - 5, y - 2, 10, 3);
  } else if (it.type === 'turbo') {
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = OL;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 12);
    ctx.lineTo(x - 7, y + 2);
    ctx.lineTo(x - 0.5, y + 2);
    ctx.lineTo(x - 3, y + 12);
    ctx.lineTo(x + 7, y - 2);
    ctx.lineTo(x + 0.5, y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (it.type === 'heart') {
    drawHeartShape(x, y, 1, '#ff4d6d');
  }
}

function drawHeartShape(x, y, s, col) {
  ctx.fillStyle = col;
  ctx.strokeStyle = '#2a1520';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 9 * s);
  ctx.bezierCurveTo(x - 13 * s, y, x - 9 * s, y - 11 * s, x, y - 4 * s);
  ctx.bezierCurveTo(x + 9 * s, y - 11 * s, x + 13 * s, y, x, y + 9 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  circle(ctx, x - 4 * s, y - 3 * s, 1.8 * s);
}

/* ---------- Hindernis-Skins je Welt ---------- */
const OL2 = '#2a1520';

function bird(c, body, wing, beak, head) {
  const fl = Math.sin(c.t * 14) * 8;
  ctx.fillStyle = body;
  ctx.strokeStyle = OL2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(18, 15, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = head || body;
  circle(ctx, 8, 11, 6);
  ctx.beginPath();
  ctx.arc(8, 11, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = beak;
  ctx.beginPath();
  ctx.moveTo(3, 10); ctx.lineTo(-4, 12.5); ctx.lineTo(3, 13.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = OL2;
  circle(ctx, 7, 10, 1.4);
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(14, 13); ctx.lineTo(26, 13); ctx.lineTo(22, 13 - fl - 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(29, 13); ctx.lineTo(36, 10); ctx.lineTo(36, 18);
  ctx.closePath();
  ctx.fill();
}

function owl(c, body, belly) {
  const fl = Math.sin(c.t * 12) * 6;
  ctx.strokeStyle = OL2;
  ctx.lineWidth = 2;
  ctx.fillStyle = body;
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(17 + d * 14, 13 + fl * 0.3, 8, 4, d * (0.4 + fl * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(17, 14, 11, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(17, 18, 6.5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(8, 4); ctx.lineTo(9, -2); ctx.lineTo(13, 3);
  ctx.moveTo(26, 4); ctx.lineTo(25, -2); ctx.lineTo(21, 3);
  ctx.fill();
  for (const ex of [12.5, 21.5]) {
    ctx.fillStyle = '#fff6c4';
    circle(ctx, ex, 9, 4.2);
    ctx.fillStyle = OL2;
    circle(ctx, ex - 0.8, 9, 2);
  }
  ctx.fillStyle = '#f2a33a';
  ctx.beginPath();
  ctx.moveTo(15.5, 12); ctx.lineTo(18.5, 12); ctx.lineTo(17, 15.5);
  ctx.closePath();
  ctx.fill();
}

const LOW_SKINS = {
  beach(w, h) {   // Sandburg
    ctx.fillStyle = '#e8c27a';
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 2;
    rr(ctx, 0, h - 14, w, 14, 3); ctx.fill(); ctx.stroke();
    for (const tx of [1, w - 11]) {
      ctx.fillRect(tx, h - 25, 10, 12);
      ctx.strokeRect(tx, h - 25, 10, 12);
      ctx.fillRect(tx, h - 28, 3, 3);
      ctx.fillRect(tx + 7, h - 28, 3, 3);
    }
    ctx.fillRect(w / 2 - 5, h - 30, 10, 17);
    ctx.strokeRect(w / 2 - 5, h - 30, 10, 17);
    ctx.strokeStyle = '#5e3517';
    ctx.beginPath();
    ctx.moveTo(w / 2, h - 30); ctx.lineTo(w / 2, h - 40);
    ctx.stroke();
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.moveTo(w / 2, h - 40); ctx.lineTo(w / 2 + 8, h - 37); ctx.lineTo(w / 2, h - 34);
    ctx.fill();
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(w / 2 - 2, h - 8, 4, 8);
  },
  forest(w, h) {  // Fliegenpilze
    mushroom(ctx, w * 0.36, h, 1.15, '#ff4d6d');
    mushroom(ctx, w * 0.8, h, 0.8, '#ff4d6d');
  },
  snow(w, h) {    // Schneemann
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#6f8fc0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w / 2, h - 10, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, h - 25, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = OL2;
    circle(ctx, w / 2 - 2.5, h - 27, 1.2);
    circle(ctx, w / 2 + 2, h - 27, 1.2);
    circle(ctx, w / 2, h - 12, 1.2);
    circle(ctx, w / 2, h - 7, 1.2);
    ctx.fillStyle = '#ff8c1a';
    ctx.beginPath(); ctx.moveTo(w / 2 - 1, h - 25); ctx.lineTo(w / 2 - 8, h - 24); ctx.lineTo(w / 2 - 1, h - 23); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(w / 2 - 5, h - 37, 10, 6);
    ctx.fillRect(w / 2 - 7, h - 32, 14, 2);
  },
  fireworks(w, h) {  // Böller-Kiste mit brennender Lunte
    ctx.fillStyle = '#c0152f';
    ctx.strokeStyle = '#3d0610';
    ctx.lineWidth = 2;
    rr(ctx, 2, h - 22, w - 4, 22, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(2, h - 16, w - 4, 3);
    ctx.fillRect(2, h - 8, w - 4, 3);
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('福', w / 2, h - 10.5);
    ctx.strokeStyle = '#5a3a20';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(w / 2, h - 22); ctx.quadraticCurveTo(w / 2 + 6, h - 28, w / 2 + 3, h - 32); ctx.stroke();
    const sp = 2 + Math.abs(Math.sin(gameT * 25)) * 3;
    glow(ctx, w / 2 + 3, h - 32, 10, 'rgba(255,200,80,0.8)');
    ctx.fillStyle = '#fff3a0';
    circle(ctx, w / 2 + 3, h - 32, sp);
  },
  desert(w, h) {  // Kaktus
    ctx.fillStyle = '#2f8a46';
    ctx.strokeStyle = '#174a24';
    ctx.lineWidth = 2;
    rr(ctx, w / 2 - 5, h - 34, 10, 34, 5); ctx.fill(); ctx.stroke();
    rr(ctx, w / 2 - 15, h - 26, 7, 14, 3.5); ctx.fill(); ctx.stroke();
    rr(ctx, w / 2 - 14, h - 15, 10, 6, 3); ctx.fill();
    rr(ctx, w / 2 + 8, h - 30, 7, 14, 3.5); ctx.fill(); ctx.stroke();
    rr(ctx, w / 2 + 4, h - 19, 10, 6, 3); ctx.fill();
    ctx.fillStyle = '#ff6fae';
    circle(ctx, w / 2, h - 35, 3);
  },
  cave(w, h) {    // Stalagmiten
    ctx.strokeStyle = '#151d22';
    ctx.lineWidth = 2;
    for (const [cx, hh, ww, col] of [[w * 0.3, h + 4, 10, '#56636e'], [w * 0.68, h * 0.75, 8, '#4a5560'], [w * 0.9, h * 0.5, 6, '#56636e']]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx - ww, h); ctx.lineTo(cx - 1, h - hh); ctx.lineTo(cx + 1, h - hh); ctx.lineTo(cx + ww, h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    glow(ctx, w * 0.3, h - 8, 14, 'rgba(110,240,255,0.35)');
  },
  candy(w, h) {   // Cupcake
    ctx.strokeStyle = OL2;
    ctx.lineWidth = 2;
    ctx.fillStyle = '#7ad3ff';
    ctx.beginPath();
    ctx.moveTo(3, h - 16); ctx.lineTo(w - 3, h - 16); ctx.lineTo(w - 7, h); ctx.lineTo(7, h);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    for (let x = 9; x < w - 6; x += 5) { ctx.beginPath(); ctx.moveTo(x, h - 15); ctx.lineTo(x + 0.5, h - 1); ctx.stroke(); }
    ctx.strokeStyle = OL2;
    ctx.fillStyle = '#ff8fc7';
    ctx.beginPath();
    ctx.arc(w * 0.3, h - 19, 7, Math.PI, 0);
    ctx.arc(w * 0.7, h - 19, 7, Math.PI, 0);
    ctx.arc(w * 0.5, h - 24, 8, Math.PI, 0);
    ctx.lineTo(w - 2, h - 16); ctx.lineTo(2, h - 16);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e63946';
    circle(ctx, w / 2, h - 33, 3.5);
  },
  lab(w, h) {     // Giftfass
    ctx.fillStyle = '#3d7a4a';
    ctx.strokeStyle = '#11231a';
    ctx.lineWidth = 2;
    rr(ctx, 4, 2, w - 8, h - 2, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b5a36';
    ctx.fillRect(4, 9, w - 8, 3);
    ctx.fillRect(4, h - 9, w - 8, 3);
    ctx.fillStyle = '#ffd23f';
    circle(ctx, w / 2, h / 2 + 1, 5.5);
    ctx.fillStyle = OL2;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + k * (Math.PI * 2 / 3);
      ctx.moveTo(w / 2, h / 2 + 1);
      ctx.arc(w / 2, h / 2 + 1, 4.5, a - 0.45, a + 0.45);
    }
    ctx.fill();
    ctx.fillStyle = '#5dff7a';
    ctx.beginPath(); ctx.ellipse(w / 2, 3, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    rr(ctx, w * 0.62, 2, 4, 9 + Math.sin(gameT * 3) * 2, 2); ctx.fill();
  },
  sky(w, h) {     // Grummelige Gewitterwolke
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(w / 2 + 2, h - 12); ctx.lineTo(w / 2 - 5, h - 2); ctx.lineTo(w / 2, h - 3); ctx.lineTo(w / 2 - 3, h + 2);
    ctx.lineTo(w / 2 + 6, h - 6); ctx.lineTo(w / 2 + 1, h - 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5d6b82';
    ctx.strokeStyle = '#2a3242';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(9, h - 16, 8, 0, Math.PI * 2);
    ctx.arc(18, h - 22, 10, 0, Math.PI * 2);
    ctx.arc(26, h - 15, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    circle(ctx, 14, h - 21, 2.8);
    circle(ctx, 22, h - 21, 2.8);
    ctx.fillStyle = OL2;
    circle(ctx, 13.5, h - 20.5, 1.3);
    circle(ctx, 21.5, h - 20.5, 1.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(11, h - 25); ctx.lineTo(16, h - 23.5); ctx.moveTo(25, h - 25); ctx.lineTo(20, h - 23.5); ctx.stroke();
  },
  aurora(w, h) {  // Eisblock
    ctx.fillStyle = 'rgba(190,240,255,0.85)';
    ctx.strokeStyle = '#3a7ca5';
    ctx.lineWidth = 2;
    rr(ctx, 1, 1, w - 2, h - 1, 4); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(6, 7); ctx.lineTo(14, 7); ctx.moveTo(6, 7); ctx.lineTo(6, 15); ctx.stroke();
    ctx.strokeStyle = 'rgba(58,124,165,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w - 8, 6); ctx.lineTo(w - 14, 16); ctx.lineTo(w - 10, 22); ctx.stroke();
  },
  space(w, h) {   // Meteoritenbrocken
    ctx.fillStyle = '#9696aa';
    ctx.strokeStyle = '#25252f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h); ctx.lineTo(3, h - 16); ctx.lineTo(12, h - 28); ctx.lineTo(24, h - 26); ctx.lineTo(w, h - 12); ctx.lineTo(w - 2, h);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#55556a';
    circle(ctx, 12, h - 16, 4);
    circle(ctx, 23, h - 10, 3);
    ctx.strokeStyle = `rgba(255,140,40,${0.6 + Math.sin(gameT * 5) * 0.3})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(6, h - 6); ctx.lineTo(14, h - 9); ctx.lineTo(18, h - 20); ctx.stroke();
  }
};

const FLIER_SKINS = {
  beach(c) { bird(c, '#ffffff', '#b8c4d0', '#ff9f1a'); },           // Möwe
  forest(c) { owl(c, '#c48a55', '#f2dcb8'); },                       // Eule
  snow(c) { owl(c, '#f4f8ff', '#dfe8f5'); },                         // Schneeeule
  desert(c) { bird(c, '#9a6a44', '#74482a', '#f2cf86', '#f2a8b6'); },// Geier
  sky(c) { bird(c, '#4dabf7', '#1c7ed6', '#ffd23f'); },              // Blauvogel
  fireworks(c) {   // Rakete
    ctx.fillStyle = `rgba(255,${150 + Math.random() * 80},60,0.9)`;
    ctx.beginPath(); ctx.moveTo(30, 9); ctx.lineTo(42 + Math.random() * 6, 13); ctx.lineTo(30, 17); ctx.fill();
    ctx.fillStyle = '#e8213b';
    ctx.strokeStyle = OL2;
    ctx.lineWidth = 2;
    rr(ctx, 8, 7, 23, 12, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath(); ctx.moveTo(8, 7); ctx.lineTo(0, 13); ctx.lineTo(8, 19); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(16, 7, 3, 12);
    ctx.fillRect(24, 7, 3, 12);
  },
  cave(c) {        // Fledermaus
    const fl = Math.sin(c.t * 16) * 7;
    glow(ctx, 17, 13, 26, 'rgba(180,140,255,0.35)');
    ctx.fillStyle = '#7a58b0';
    ctx.strokeStyle = OL2;
    ctx.lineWidth = 1.8;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(17, 13);
      ctx.lineTo(17 + d * 18, 6 - fl);
      ctx.lineTo(17 + d * 13, 14 - fl * 0.3);
      ctx.lineTo(17 + d * 8, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(17, 14, 6, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13, 9); ctx.lineTo(13.5, 3); ctx.lineTo(16, 8); ctx.moveTo(21, 9); ctx.lineTo(20.5, 3); ctx.lineTo(18, 8); ctx.fill();
    ctx.fillStyle = '#ff4d6d';
    circle(ctx, 15, 12, 1.5);
    circle(ctx, 19, 12, 1.5);
  },
  candy(c) {       // Fliegendes Bonbon
    ctx.save();
    ctx.translate(17, 13);
    ctx.rotate(Math.sin(c.t * 5) * 0.3);
    const fl = Math.sin(c.t * 18) * 4;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(-3, -9 - fl * 0.5, 4, 7, -0.5, 0, Math.PI * 2); ctx.ellipse(3, -9 - fl * 0.5, 4, 7, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5fa2';
    ctx.strokeStyle = OL2;
    ctx.lineWidth = 2;
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(d * 8, 0); ctx.lineTo(d * 16, -6); ctx.lineTo(d * 16, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(1, 7); ctx.moveTo(1, -7); ctx.lineTo(6, 5); ctx.stroke();
    ctx.restore();
  },
  lab(c) {         // Drohne
    ctx.strokeStyle = OL2;
    ctx.lineWidth = 2;
    ctx.fillStyle = '#7b8a96';
    rr(ctx, 5, 8, 24, 12, 5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(5, 3); ctx.moveTo(26, 8); ctx.lineTo(29, 3); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,40,50,0.7)';
    const pr = Math.abs(Math.sin(c.t * 60)) * 8 + 2;
    ctx.beginPath(); ctx.moveTo(5 - pr, 3); ctx.lineTo(5 + pr, 3); ctx.moveTo(29 - pr, 3); ctx.lineTo(29 + pr, 3); ctx.stroke();
    glow(ctx, 9, 14, 9, 'rgba(255,40,40,0.6)');
    ctx.fillStyle = '#ff3030';
    circle(ctx, 9, 14, 3);
    ctx.fillStyle = '#5dff7a';
    ctx.fillRect(16, 18, 8, 2);
  },
  aurora(c) {      // Eiskristall
    ctx.save();
    ctx.translate(17, 13);
    ctx.rotate(c.t * 2);
    glow(ctx, 0, 0, 18, 'rgba(150,240,255,0.5)');
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 2.4;
    for (let k = 0; k < 6; k++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -12);
      ctx.moveTo(0, -7); ctx.lineTo(-3.5, -10); ctx.moveTo(0, -7); ctx.lineTo(3.5, -10);
      ctx.stroke();
    }
    ctx.restore();
  },
  space(c) {       // UFO
    ctx.fillStyle = 'rgba(160,240,255,0.85)';
    ctx.strokeStyle = OL2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(17, 10, 8, 7, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7dff8a';
    circle(ctx, 17, 8, 2.5);
    ctx.fillStyle = '#9aa3bd';
    ctx.beginPath(); ctx.ellipse(17, 13, 17, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const cols = ['#ff4d6d', '#ffd23f', '#6ee7ff'];
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = cols[(k + Math.floor(c.t * 6)) % 3];
      circle(ctx, 6 + k * 7.3, 14, 1.8);
    }
  }
};

function drawRoller(o) {
  const key = themeKey(o.theme);
  const r = 15;
  ctx.save();
  ctx.translate(o.x + r, o.y + r);
  ctx.rotate(o.rot);
  ctx.strokeStyle = OL2;
  ctx.lineWidth = 2;
  const ball = (col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  switch (key) {
    case 'beach':   // Kokosnuss
      ball('#9a6434');
      ctx.strokeStyle = '#8a5f3a';
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.arc(0, 0, r - 3, k * 0.8, k * 0.8 + 0.4); ctx.stroke(); }
      ctx.fillStyle = '#2a1810';
      circle(ctx, -4, -3, 2); circle(ctx, 4, -3, 2); circle(ctx, 0, 3, 2);
      break;
    case 'forest':  // Igel
      ctx.fillStyle = '#9a6a44';
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * (k % 2 ? r : r + 6), Math.sin(a) * (k % 2 ? r : r + 6));
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c9956a';
      circle(ctx, 0, 0, 8);
      ctx.fillStyle = OL2;
      circle(ctx, -3, -2, 1.5); circle(ctx, 3, -2, 1.5); circle(ctx, 0, 3, 2);
      break;
    case 'snow':    // Schneeball
    case 'aurora':
      ball('#f4fbff');
      ctx.fillStyle = '#bcd7f0';
      circle(ctx, -5, 4, 3); circle(ctx, 6, -3, 2.4); circle(ctx, 1, -8, 1.8);
      if (key === 'aurora') {   // Pinguin, der als Kugel rollt
        ctx.fillStyle = '#1d2433';
        ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.75, Math.PI * 2.25); ctx.fill();
        ctx.fillStyle = '#fff';
        circle(ctx, -4, -6, 3); circle(ctx, 4, -6, 3);
        ctx.fillStyle = OL2;
        circle(ctx, -4, -6, 1.4); circle(ctx, 4, -6, 1.4);
        ctx.fillStyle = '#ff9f1a';
        ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(3, -2); ctx.lineTo(0, 2); ctx.fill();
      }
      break;
    case 'fireworks': // Glücksmünze
      ball('#f2c14e');
      ctx.strokeStyle = '#a07010';
      ctx.beginPath(); ctx.arc(0, 0, r - 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#7a1020';
      ctx.fillRect(-4, -4, 8, 8);
      break;
    case 'desert':  // Steppenläufer
      ctx.strokeStyle = '#a07a46';
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 9; k++) {
        ctx.beginPath();
        ctx.arc(Math.cos(k) * 4, Math.sin(k * 1.7) * 4, r - 4, k, k + 2.4);
        ctx.stroke();
      }
      break;
    case 'cave':    // Felsbrocken
      ball('#9aa3ad');
      ctx.fillStyle = '#7a838c';
      circle(ctx, -5, -4, 4); circle(ctx, 6, 5, 3);
      ctx.fillStyle = '#3d7a3a';
      circle(ctx, 3, -10, 3);
      break;
    case 'candy': { // Donut
      ctx.fillStyle = '#d9a06a';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.arc(0, 0, 5, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.stroke();
      ctx.fillStyle = '#ff8fc7';
      ctx.beginPath(); ctx.arc(0, 0, r - 3, 0, Math.PI * 2); ctx.arc(0, 0, 6, 0, Math.PI * 2, true); ctx.fill('evenodd');
      const cols = ['#ffe14d', '#6be3c8', '#9b6bff', '#fff'];
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = cols[k % 4];
        const a = k * 0.8;
        ctx.fillRect(Math.cos(a) * 9 - 1.5, Math.sin(a) * 9 - 0.8, 3, 1.6);
      }
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'lab':     // Schleimkugel
      ball('#5dff7a');
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      circle(ctx, -5, -6, 3.5);
      ctx.fillStyle = '#2e9a46';
      circle(ctx, 5, 5, 3); circle(ctx, -3, 7, 2);
      break;
    case 'sky':     // Wirbelwind
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.2) ctx.lineTo(Math.cos(a) * a * 0.95, Math.sin(a) * a * 0.95);
      ctx.stroke();
      break;
    default:        // Asteroid
      ball('#b39a7e');
      ctx.fillStyle = '#8a7560';
      circle(ctx, -5, -3, 4); circle(ctx, 6, 4, 3); circle(ctx, 2, -9, 2);
  }
  ctx.restore();
  if (key === 'lab') {   // Schleim-Augen drehen nicht mit
    ctx.fillStyle = '#fff';
    circle(ctx, o.x + 10, o.y + 12, 3.2);
    circle(ctx, o.x + 19, o.y + 12, 3.2);
    ctx.fillStyle = OL2;
    circle(ctx, o.x + 9.5, o.y + 12.5, 1.5);
    circle(ctx, o.x + 18.5, o.y + 12.5, 1.5);
  }
}

function drawChain(x, y0, y1) {
  for (let y = y0, k = 0; y < y1; y += 10, k++) {
    if (k % 2 === 0) {
      ctx.strokeStyle = '#15181c';
      ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.ellipse(x, y + 5, 4, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#9aa4b0';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.strokeStyle = '#e8edf2';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(x, y + 5, 4, 6.5, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    } else {
      ctx.fillStyle = '#15181c';
      ctx.fillRect(x - 2.4, y - 1, 4.8, 12);
      ctx.fillStyle = '#9aa4b0';
      ctx.fillRect(x - 1.1, y, 2.2, 10);
    }
  }
}

// Stahlträger oben, an dem Balken/Mauer hängen
function drawGirder(x, w, y) {
  ctx.fillStyle = '#5a636e';
  ctx.strokeStyle = '#15181c';
  ctx.lineWidth = 2.5;
  rr(ctx, x, y - 20, w, 20, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x + 2, y - 18, w - 4, 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = x + 4; k < x + w - 14; k += 18) { ctx.moveTo(k, y - 3); ctx.lineTo(k + 14, y - 17); }
  ctx.stroke();
  ctx.fillStyle = '#9aa3ad';
  for (let k = x + 6; k < x + w - 2; k += 14) { circle(ctx, k, y - 16, 1.6); circle(ctx, k, y - 4, 1.6); }
}

function drawSpikes(x0, x1, y, dir, size) {
  ctx.fillStyle = '#e4e8ee';
  ctx.strokeStyle = '#1d2026';
  ctx.lineWidth = 2;
  const n = Math.max(2, Math.round((x1 - x0) / (size * 0.9)));
  const sw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * sw;
    ctx.beginPath();
    ctx.moveTo(a, y);
    ctx.lineTo(a + sw / 2, y + dir * size);
    ctx.lineTo(a + sw, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < n; i++) circle(ctx, x0 + i * sw + sw * 0.4, y + dir * size * 0.35, 1);
}

// Stachelbalken: Körper liegt bei by..by+24, Stacheln oben und unten
function drawSpikeBeam(o, by) {
  const th = THEMES[o.theme].plat;
  drawSpikes(o.x - 6, o.x + o.w + 6, by, -1, 11);
  drawSpikes(o.x - 4, o.x + o.w + 4, by + 24, 1, 12);
  ctx.fillStyle = th.base;
  ctx.strokeStyle = '#15181c';
  ctx.lineWidth = 3;
  rr(ctx, o.x - 10, by, o.w + 20, 24, 6); ctx.fill(); ctx.stroke();
  ctx.save();
  rr(ctx, o.x - 10, by, o.w + 20, 24, 6);
  ctx.clip();
  ctx.fillStyle = '#2a2e35';
  for (let x = o.x - 10; x < o.x + o.w + 20; x += 18) {
    ctx.beginPath(); ctx.moveTo(x, by + 24); ctx.lineTo(x + 9, by); ctx.lineTo(x + 15, by); ctx.lineTo(x + 6, by + 24); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(o.x - 10, by + 3, o.w + 20, 3);
  ctx.restore();
  ctx.fillStyle = '#9aa3ad';
  for (const bx of [o.x + 8, o.x + o.w - 8]) {
    ctx.strokeStyle = '#15181c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by + 12, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

function drawHanging(o) {
  const gy = run.gy;
  const ay = gy - ANCHOR_UP;
  if (o.kind === 'bar') {
    const by = gy - SLIDE_GAP - 12 - 24;
    drawGirder(o.x - 22, o.w + 44, ay);
    drawChain(o.x + 8, ay, by - 6);
    drawChain(o.x + o.w - 8, ay, by - 6);
    drawSpikeBeam(o, by);
    return;
  }
  // Mauer mit Durchschlupf
  const th = THEMES[o.theme].plat;
  const bot = gy - SLIDE_GAP - 12;     // Unterkante der Mauer (darunter Stacheln)
  ctx.fillStyle = th.base;
  ctx.strokeStyle = th.line;
  ctx.lineWidth = 3;
  ctx.fillRect(o.x, ay, o.w, bot - ay);
  ctx.save();
  ctx.beginPath(); ctx.rect(o.x, ay, o.w, bot - ay); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  for (let y = ay, r = 0; y < bot; y += 18, r++) {
    ctx.beginPath(); ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); ctx.stroke();
    for (let x = o.x + (r % 2 ? 0 : 17); x < o.x + o.w; x += 34) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 18); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(o.x, ay, 6, bot - ay);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(o.x + o.w - 8, ay, 8, bot - ay);
  ctx.restore();
  ctx.strokeStyle = th.line;
  ctx.strokeRect(o.x, ay, o.w, bot - ay);
  // Warnstreifen + Stacheln an der Unterkante
  ctx.save();
  ctx.beginPath(); ctx.rect(o.x, bot - 10, o.w, 10); ctx.clip();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(o.x, bot - 10, o.w, 10);
  ctx.fillStyle = '#1d2026';
  for (let x = o.x - 10; x < o.x + o.w; x += 16) {
    ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x + 10, bot - 10); ctx.lineTo(x + 16, bot - 10); ctx.lineTo(x + 6, bot); ctx.fill();
  }
  ctx.restore();
  drawSpikes(o.x + 2, o.x + o.w - 2, bot, 1, 12);
  drawGirder(o.x - 14, o.w + 28, ay);
}

const DARK_THEMES = new Set(['forest', 'fireworks', 'cave', 'lab', 'aurora', 'space']);

function drawObstacle(o) {
  if (o.vanish) return;
  if (!o.dead && (o.kind === 'bar' || o.kind === 'wall')) { drawHanging(o); return; }
  const dark = DARK_THEMES.has(themeKey(o.theme));
  if (!o.dead) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (o.kind === 'flier' || o.kind === 'roller') {   // rote Gefahren-Aura
      glow(ctx, cx, cy, 34, `rgba(255,60,60,${0.32 + Math.sin(gameT * 8) * 0.1})`);
    }
    if (dark) glow(ctx, cx, cy, Math.max(o.w, o.h) * 0.8 + 14, 'rgba(255,255,255,0.22)');
  }
  if (o.kind === 'roller') { drawRoller(o); return; }
  const key = themeKey(o.theme);
  const th = THEMES[o.theme].plat;
  ctx.save();
  if (o.dead) {
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    ctx.rotate(o.rot);
    ctx.translate(-o.w / 2, -o.h / 2);
  } else ctx.translate(o.x, o.y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (o.kind) {
    case 'low': LOW_SKINS[key](o.w, o.h); break;
    case 'flier':
      ctx.translate(17, 13);
      ctx.scale(1.2, 1.2);          // etwas größer gezeichnet als die Hitbox, besser erkennbar
      ctx.translate(-17, -13);
      FLIER_SKINS[key](o);
      break;
    case 'tall': {
      for (let k = 0; k < 2; k++) {
        const y = k * 44;
        ctx.fillStyle = th.base;
        ctx.strokeStyle = th.line;
        ctx.lineWidth = 2.5;
        rr(ctx, 0, y, o.w, 44, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = th.top;
        ctx.fillRect(2, y + 2, o.w - 4, 5);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(5, y + 10); ctx.lineTo(o.w - 5, y + 40); ctx.moveTo(o.w - 5, y + 10); ctx.lineTo(5, y + 40); ctx.stroke();
      }
      break;
    }
    case 'bar': {
      ctx.translate(-o.x, 11);
      drawSpikeBeam(o, 0);
      break;
    }
  }
  ctx.restore();
}

function drawRunBestFlag() {
  if (bestRun <= 0) return;
  const x = R.START_X + bestRun * PX_PER_M;
  if (x < run.camX - 20 || x > run.camX + W + 20) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,210,63,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, run.gy); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '16px "Luckiest Guy", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#3b1d2a';
  ctx.lineWidth = 3;
  ctx.strokeText(`Rekord ${bestRun} m`, x, 34);
  ctx.fillText(`Rekord ${bestRun} m`, x, 34);
  ctx.restore();
}

function runRender() {
  const p = player;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const m = xToM(Math.max(0, run.camX + W * 0.2));
  drawBackground(gameT, m);
  drawRunHaze(themeAt(m));
  drawRunParallax(themeAt(m));

  ctx.save();
  if (run.shake > 0) ctx.translate(rand(-4, 4) * run.shake * 3, rand(-4, 4) * run.shake * 3);
  ctx.translate(-run.camX, 0);
  for (const g of run.ground) drawRunGround(g);
  drawRunBestFlag();
  for (const pl of run.plats) if (pl.x < run.camX + W + 40) drawPlatform(pl);
  for (const t of run.trufs) if (!t.taken && t.x < run.camX + W + 20) drawTruffle(t.x, t.y, t.phase);
  for (const it of run.items) if (!it.taken && it.x < run.camX + W + 40) drawRunItem(it);
  for (const o of run.obs) if (o.x < run.camX + W + 60) drawObstacle(o);
  for (const q of particles) {
    ctx.globalAlpha = q.life / q.max;
    ctx.fillStyle = q.color;
    circle(ctx, q.x, q.y, q.r);
  }
  ctx.globalAlpha = 1;

  // Turbo: Regenbogen-Brücke über Abgründe
  if (run.turbo > 0 && !groundUnder(p.x) && Math.abs(p.y - run.gy) < 2) {
    const cols = ['#ff4d4d', '#ffa64d', '#ffe14d', '#6be36b', '#4dc3ff', '#9b6bff'];
    cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(p.x - 70, run.gy + i * 3, 95, 3); });
  }
  // Pork (blinkt, wenn unverwundbar)
  const blink = run.invuln > 0 && !run.dying && Math.floor(gameT * 14) % 2 === 0;
  if (!blink) {
    if (run.turbo > 0) glow(ctx, p.x, p.y - 28, 45, `hsla(${(gameT * 500) % 360},100%,60%,0.55)`);
    else if (DARK_THEMES.has(themeKey(themeAt(xToM(p.x))))) glow(ctx, p.x, p.y - 30, 48, 'rgba(255,235,240,0.2)');
    drawPork(p, p.x);
  }
  if (run.shield) {
    ctx.strokeStyle = 'rgba(110,231,255,0.9)';
    ctx.fillStyle = 'rgba(110,231,255,0.18)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y - (p.sliding ? 14 : 30), p.sliding ? 28 : 38 + Math.sin(gameT * 6) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (run.magnet > 0) {
    ctx.save();
    ctx.translate(p.x + 14, p.y - (p.sliding ? 30 : 76));
    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 5, Math.PI, 0, true); ctx.moveTo(-5, 0); ctx.lineTo(-5, -5); ctx.moveTo(5, 0); ctx.lineTo(5, -5); ctx.stroke();
    ctx.restore();
  }
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

  // Bildschirm-Effekte
  if (run.turbo > 0) {
    const hue = (gameT * 300) % 360;
    const gr = ctx.createLinearGradient(0, 0, W, 0);
    for (let k = 0; k <= 3; k++) gr.addColorStop(k / 3, `hsla(${(hue + k * 90) % 360},100%,60%,0.2)`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = AMB[i];
      const xx = W - wrapMod(a.x * W + gameT * (1500 + a.s * 800), W + 120);
      ctx.beginPath(); ctx.moveTo(xx, a.y * run.gy); ctx.lineTo(xx + 40 + a.s * 40, a.y * run.gy); ctx.stroke();
    }
  }
  // "!" am rechten Rand: gleich kommt etwas entgegen
  for (const o of run.obs) {
    if (o.dead || o.active || (o.kind !== 'flier' && o.kind !== 'roller')) continue;
    if (o.x > run.camX + W + 340) continue;
    const wy = clamp(o.y + o.h / 2, 90, run.gy - 14);
    const pr = 13 + Math.sin(gameT * 14) * 2;
    glow(ctx, W - 22, wy, 30, 'rgba(255,60,60,0.6)');
    ctx.fillStyle = '#ff3b4f';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(W - 22, wy, pr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '18px "Luckiest Guy", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', W - 22, wy + 7);
  }
  // Steuerungs-Hinweise am Anfang jedes Runs
  if (gameT < 5) {
    const a = Math.min(1, (5 - gameT) / 1.2);
    const wr = wrapEl.getBoundingClientRect();
    const k = W / wr.width;
    ctx.globalAlpha = a;
    ctx.font = '15px "Luckiest Guy", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#3b1d2a';
    ctx.fillStyle = '#ffffff';
    for (const [btn, lines] of [[el.left, ['Sliden', '(in der Luft: runter)']], [el.right, ['Springen', 'halten = höher', '2x = Doppelsprung']]]) {
      const b = btn.getBoundingClientRect();
      const cx = (b.left + b.width / 2 - wr.left) * k;
      let ty = (b.top - wr.top) * k - 10 - (lines.length - 1) * 17;
      for (const line of lines) {
        const half = ctx.measureText(line).width / 2;
        const lx = clamp(cx, half + 6, W - half - 6);   // nicht über den Rand hinaus
        ctx.strokeText(line, lx, ty);
        ctx.fillText(line, lx, ty);
        ty += 17;
      }
    }
    ctx.globalAlpha = 1;
  }
  if (run.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255,40,60,${run.hurtFlash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, flash)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---------- HUD ---------- */
const HEART_SVG = (full) => `<svg viewBox="0 0 24 22"><path d="M12 21C4 15 1 11 1 7a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 4-3 8-11 14z" fill="${full ? '#ff4d6d' : 'rgba(255,255,255,0.25)'}" stroke="#3b1d2a" stroke-width="2"/></svg>`;

function runHud() {
  const txt = `${meters} m`;
  if (el.meters.textContent !== txt) el.meters.textContent = txt;
  if (run.heartsShown !== run.hearts) {
    run.heartsShown = run.hearts;
    let html = '';
    for (let i = 0; i < R.HEARTS; i++) html += HEART_SVG(i < run.hearts);
    rEl.hearts.innerHTML = html;
  }
  if (run.trufShown !== run.truffles) {
    run.trufShown = run.truffles;
    rEl.truffles.textContent = run.truffles;
  }
  const pu = (e, v, max) => {
    show(e, v > 0);
    if (v > 0) {
      e.querySelector('i').style.width = `${Math.min(1, v / max) * 100}%`;
      e.classList.toggle('blink', v < Math.min(3, max * 0.35));
    }
  };
  pu(rEl.puMagnet, run.magnet, R.MAGNET_T);
  pu(rEl.puShield, run.shield ? 1 : 0, 1);
  pu(rEl.puTurbo, run.turbo, R.TURBO_T);
}
