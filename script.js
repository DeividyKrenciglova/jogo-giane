"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  score: document.getElementById("score"),
  time: document.getElementById("time"),
  combo: document.getElementById("combo"),
  co2: document.getElementById("co2"),
  mapName: document.getElementById("mapName"),
  overlay: document.getElementById("overlay"),
  title: document.getElementById("cardTitle"),
  text: document.getElementById("cardText"),
  legend: document.getElementById("legend"),
  keysHint: document.getElementById("keysHint"),
  results: document.getElementById("results"),
  startBtn: document.getElementById("startBtn"),
  restartBtn: document.getElementById("restartBtn"),
  sprintBtn: document.getElementById("sprintBtn"),
  staminaBar: document.getElementById("staminaBar"),
  staminaMeter: document.getElementById("staminaBar").closest(".meter"),
  sprintState: document.getElementById("sprintState"),
  milestoneText: document.getElementById("milestoneText"),
  milestoneBar: document.getElementById("milestoneBar"),
  milestoneMeter: document.getElementById("milestoneBar").closest(".meter"),
};

const W = canvas.width;
const H = canvas.height;
const TAU = Math.PI * 2;

const TYPES = {
  papel:    { label: "Papel",    color: "#3b82f6", light: "#93c5fd", deep: "#1d4f9c", co2: 0.9 },
  plastico: { label: "Plástico", color: "#ef4444", light: "#fca5a5", deep: "#9f1d1d", co2: 1.4 },
  metal:    { label: "Metal",    color: "#f5c518", light: "#fde68a", deep: "#a16207", co2: 2.3 },
  vidro:    { label: "Vidro",    color: "#22c55e", light: "#86efac", deep: "#166534", co2: 0.8 },
};

const CONFIG = {
  duration: 75,
  maxTime: 99,
  speed: 260,
  playerRadius: 20,
  itemRadius: 22,
  maxItems: 7,
  binWidth: 132,
  binHeight: 96,
  binY: 84,
  binGap: 52,
  dropRadius: 72,
  basePoints: 10,
  penalty: 8,
  sprintMultiplier: 1.8,
  staminaMax: 100,
  staminaDrain: 34,
  staminaPerItem: 10,
  sprintUnlockAt: 10,
  sprintResumeAt: 28,
  bonusFirst: 10,
  bonusLater: 15,
  mapEvery: 25,
};

const PLATFORM = { top: 44, bottom: 214 };
const MOVE_AREA = { left: 16, right: W - 16, top: PLATFORM.top + 20, bottom: H - 24 };
const SPAWN_AREA = { top: PLATFORM.bottom + 30, bottom: H - 34 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (min, max) => min + Math.random() * (max - min);

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rr(c, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + rad, y);
  c.arcTo(x + w, y, x + w, y + h, rad);
  c.arcTo(x + w, y + h, x, y + h, rad);
  c.arcTo(x, y + h, x, y, rad);
  c.arcTo(x, y, x + w, y, rad);
  c.closePath();
}

function shadow(c, x, y, rx, ry, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = "#000";
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fill();
  c.restore();
}

/* ---------------- mapas ---------------- */

const MAPS = [
  {
    name: "Praça Central",
    sky: ["#0a2a3a", "#134a3c"],
    wall: ["#20544a", "#17413a"],
    floor: ["#1b4f40", "#123a2f"],
    floorLine: "rgba(0,0,0,.16)",
    dark: true,
  },
  {
    name: "Parque Florestal",
    sky: ["#63c4f0", "#cdeeb6"],
    wall: ["#3f9e5e", "#2b7343"],
    floor: ["#63bd6a", "#3f9a55"],
    floorLine: "rgba(0,0,0,.13)",
    dark: false,
  },
  {
    name: "Praia Dourada",
    sky: ["#ff8f4d", "#ffd9a0"],
    wall: ["#b96a3d", "#8e4f2e"],
    floor: ["#e8cf9a", "#c9a86f"],
    floorLine: "rgba(120, 85, 40, .2)",
    dark: false,
  },
  {
    name: "Zona Industrial",
    sky: ["#6c7f92", "#b9c6cf"],
    wall: ["#4c5762", "#39424b"],
    floor: ["#5b646d", "#414951"],
    floorLine: "rgba(0,0,0,.25)",
    dark: false,
  },
  {
    name: "Campo Florido",
    sky: ["#8fd0ff", "#f0f7c4"],
    wall: ["#6cb64b", "#4c8c38"],
    floor: ["#8ecb5f", "#5fa544"],
    floorLine: "rgba(0,0,0,.12)",
    dark: false,
  },
];

function buildBins() {
  const keys = Object.keys(TYPES);
  const total = keys.length * CONFIG.binWidth + (keys.length - 1) * CONFIG.binGap;
  const startX = (W - total) / 2;
  return keys.map((type, i) => ({
    type,
    x: startX + i * (CONFIG.binWidth + CONFIG.binGap),
    y: CONFIG.binY,
    w: CONFIG.binWidth,
    h: CONFIG.binHeight,
    flash: 0,
    shakeT: 0,
  }));
}

const state = {
  running: false,
  over: false,
  score: 0,
  combo: 1,
  co2: 0,
  timeLeft: CONFIG.duration,
  collected: 0,
  correct: 0,
  wrong: 0,
  bins: buildBins(),
  items: [],
  particles: [],
  rings: [],
  floaters: [],
  sparkles: [],
  trail: [],
  player: null,
  spawnTimer: 0,
  shake: 0,
  flash: { a: 0, color: "#ffffff" },
  stamina: CONFIG.staminaMax,
  sinceFull: 0,
  sprintUnlocked: false,
  sprintBlocked: false,
  sprinting: false,
  mapIndex: 0,
  mapsUnlocked: 1,
  lastMilestone: 0,
};

const keys = new Set();
const pointer = { active: false, x: 0, y: 0 };
let sprintHeld = false;

/* ---------------- metas ---------------- */

function nextMilestone() {
  const last = state.lastMilestone;
  if (last < CONFIG.sprintUnlockAt) return CONFIG.sprintUnlockAt;
  if (last < CONFIG.mapEvery) return CONFIG.mapEvery;
  return last + CONFIG.mapEvery;
}

function prevMilestone() {
  return state.lastMilestone;
}

function changeMap() {
  state.mapIndex = (state.mapIndex + 1) % MAPS.length;
  state.mapsUnlocked = Math.max(state.mapsUnlocked, state.mapIndex + 1);
  state.trail = [];
  buildBackground();
  const map = MAPS[state.mapIndex];
  ui.mapName.textContent = map.name;
  return map;
}

function addTime(seconds) {
  state.timeLeft = Math.min(CONFIG.maxTime, state.timeLeft + seconds);
  return state.timeLeft;
}

function checkMilestones() {
  while (state.correct >= nextMilestone()) {
    const m = nextMilestone();
    state.lastMilestone = m;

    if (m === CONFIG.sprintUnlockAt) {
      state.sprintUnlocked = true;
      state.stamina = CONFIG.staminaMax;
      addTime(CONFIG.bonusFirst);
      floater(W / 2, 300, `+${CONFIG.bonusFirst}s`, "#a3e635", 34);
      floater(W / 2, 344, "SPRINT LIBERADO!", "#fde68a", 24);
      playSound("levelup");
      confetti(W / 2, 300, "#22c55e");
      state.flash = { a: 0.3, color: "#a3e635" };
    } else {
      addTime(CONFIG.bonusLater);
      const map = changeMap();
      floater(W / 2, 280, `+${CONFIG.bonusLater}s`, "#a3e635", 30);
      floater(W / 2, 322, "NOVO MAPA!", "#fde68a", 22);
      floater(W / 2, 356, map.name, "#ffffff", 20);
      playSound("levelup");
      confetti(W / 2, 300, "#f5c518");
      state.flash = { a: 0.34, color: "#f5c518" };
      state.shake = 0.7;
    }

    addRing(W / 2, 300, "#a3e635", 20, 320, 0.7);
    ui.staminaMeter.classList.remove("done");
    ui.milestoneMeter.classList.remove("done");
    void ui.milestoneMeter.offsetWidth;
    ui.milestoneMeter.classList.add("done");
  }
}

/* ---------------- entidades ---------------- */

function makePlayer() {
  return {
    x: W / 2,
    y: H - 86,
    r: CONFIG.playerRadius,
    speed: CONFIG.speed,
    carrying: null,
    step: 0,
    facing: 1,
    blink: 0,
    moving: false,
  };
}

function addRing(x, y, color, from, to, dur) {
  state.rings.push({ x, y, color, from, to, life: dur, max: dur });
}

function burst(x, y, color, count, power) {
  for (let i = 0; i < count; i++) {
    const a = rnd(0, TAU);
    const s = rnd(60, 220) * (power || 1);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 60,
      life: 0.7,
      max: 0.7,
      color,
      size: rnd(2.5, 6),
    });
  }
}

function floater(x, y, text, color, size) {
  state.floaters.push({ x, y, text, color, life: 1.4, size: size || 20 });
}

function spawnItem() {
  if (state.items.length >= CONFIG.maxItems) return;
  const type = Object.keys(TYPES)[Math.floor(Math.random() * 4)];

  for (let attempt = 0; attempt < 60; attempt++) {
    const x = rnd(MOVE_AREA.left + 46, MOVE_AREA.right - 46);
    const y = rnd(SPAWN_AREA.top, SPAWN_AREA.bottom);
    const farFromPlayer = Math.hypot(x - state.player.x, y - state.player.y) > 140;
    if (!farFromPlayer) continue;

    state.items.push({ type, x, y, r: CONFIG.itemRadius, phase: rnd(0, TAU), born: 0 });
    addRing(x, y, TYPES[type].light, 6, CONFIG.itemRadius + 16, 0.45);
    return;
  }
}

function spawnWave() {
  const n = Math.min(CONFIG.maxItems - state.items.length, 2);
  for (let i = 0; i < n; i++) spawnItem();
}

function overlapsItem(item) {
  const p = state.player;
  return Math.hypot(p.x - item.x, p.y - item.y) < p.r + item.r * 0.75;
}

function resolveBinCollisions(p) {
  for (const b of state.bins) {
    const cx = clamp(p.x, b.x, b.x + b.w);
    const cy = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < p.r) {
      const nx = dist > 0.001 ? dx / dist : 0;
      const ny = dist > 0.001 ? dy / dist : -1;
      p.x = cx + nx * p.r;
      p.y = cy + ny * p.r;
    }
  }
}

function tryCollect() {
  const p = state.player;
  if (p.carrying) return;
  const item = state.items.find(overlapsItem);
  if (!item) return;

  state.items = state.items.filter((i) => i !== item);
  p.carrying = item;
  playSound("pick");
  floater(item.x, item.y - 30, TYPES[item.type].label, TYPES[item.type].light, 15);
}

function tryDeposit() {
  const p = state.player;
  if (!p.carrying) return;

  const bin = state.bins.find((b) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return Math.hypot(p.x - cx, p.y - cy) < CONFIG.dropRadius;
  });
  if (!bin) return;

  const item = p.carrying;
  p.carrying = null;
  state.collected++;

  const t = TYPES[bin.type];
  const cx = bin.x + bin.w / 2;
  const cy = bin.y + bin.h / 2;
  bin.flash = 1;
  bin.shakeT = 1;

  if (bin.type === item.type) {
    state.correct++;
    state.combo = Math.min(state.combo + 1, 9);
    const gained = CONFIG.basePoints * state.combo;
    state.score += gained;
    state.co2 += TYPES[item.type].co2;
    regainStamina();

    addRing(cx, cy, t.light, 10, 90, 0.55);
    burst(cx, cy, t.light, 18, 1);
    floater(cx, bin.y - 18, `+${gained}`, t.light, 22);
    state.flash = { a: 0.16, color: t.light };
    playSound(state.combo >= 4 ? "perfect" : "good");

    if (state.combo > 1 && state.combo % 3 === 0) {
      confetti(cx, cy, t.color);
      floater(W / 2, cy - 60, `COMBO x${state.combo}!`, "#fde68a", 26);
    }

    checkMilestones();
  } else {
    state.wrong++;
    state.combo = 1;
    state.score = Math.max(0, state.score - CONFIG.penalty);
    burst(cx, bin.y + bin.h / 2, "#f87171", 12, 0.9);
    floater(cx, bin.y - 18, `-${CONFIG.penalty}`, "#fca5a5", 22);
    floater(cx, bin.y + 16, "lixeira errada!", "#fca5a5", 14);
    state.shake = 1;
    state.flash = { a: 0.2, color: "#ef4444" };
    playSound("bad");
  }
}

function regainStamina() {
  state.stamina = Math.min(CONFIG.staminaMax, state.stamina + CONFIG.staminaPerItem);
  state.sinceFull++;
  if (state.sinceFull >= 10) {
    state.sinceFull = 0;
    state.stamina = CONFIG.staminaMax;
    if (state.sprintUnlocked) {
      floater(state.player.x, state.player.y - 62, "FÔLEGO CHEIO!", "#a3e635", 18);
      addRing(state.player.x, state.player.y, "#a3e635", 12, 70, 0.5);
    }
  }
}

function confetti(x, y, color) {
  const colors = [color, TYPES.papel.light, TYPES.plastico.light, TYPES.metal.light, TYPES.vidro.light, "#ffffff"];
  for (let i = 0; i < 34; i++) {
    const a = rnd(-Math.PI, 0);
    const s = rnd(120, 340);
    state.sparkles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      rot: rnd(0, TAU),
      vr: rnd(-9, 9),
      life: 1.2,
      max: 1.2,
      w: rnd(4, 8),
      h: rnd(6, 11),
      color: colors[i % colors.length],
    });
  }
}

/* ---------------- update ---------------- */

function update(dt) {
  if (!state.running) {
    updateEffects(dt);
    return;
  }

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    updateEffects(dt);
    endGame();
    return;
  }

  const p = state.player;
  let vx = 0;
  let vy = 0;
  if (keys.has("ArrowLeft") || keys.has("a")) vx -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) vx += 1;
  if (keys.has("ArrowUp") || keys.has("w")) vy -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) vy += 1;

  if (vx === 0 && vy === 0 && pointer.active) {
    const dx = pointer.x - p.x;
    const dy = pointer.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 8) {
      vx = dx / dist;
      vy = dy / dist;
    }
  }

  const mag = Math.hypot(vx, vy);

  // fôlego e sprint
  const wantSprint = state.sprintUnlocked && !state.sprintBlocked && (keys.has("Shift") || sprintHeld);
  state.sprinting = mag > 0 && wantSprint && state.stamina > 0;

  if (state.sprinting) {
    state.stamina = Math.max(0, state.stamina - CONFIG.staminaDrain * dt);
    if (state.stamina <= 0) state.sprintBlocked = true;
  }
  // o fôlego só volta reciclando: destrava o sprint quando chega a 28
  if (state.sprintBlocked && state.stamina >= CONFIG.sprintResumeAt) state.sprintBlocked = false;

  const speed = p.speed * (state.sprinting ? CONFIG.sprintMultiplier : 1);

  if (mag > 0) {
    vx /= mag;
    vy /= mag;
    p.x += vx * speed * dt;
    p.y += vy * speed * dt;
    p.step += dt * (state.sprinting ? 16 : 11);
    if (vx !== 0) p.facing = vx > 0 ? 1 : -1;
  } else {
    p.step = lerp(p.step, Math.round(p.step / Math.PI) * Math.PI, 0.15);
  }

  if (state.sprinting) {
    state.trail.push({ x: p.x, y: p.y, a: 1, facing: p.facing });
    if (state.trail.length > 9) state.trail.shift();
  }
  for (const t of state.trail) t.a -= dt * 3.2;

  p.blink -= dt;
  if (p.blink < -0.12) p.blink = rnd(2.5, 6);

  p.x = clamp(p.x, MOVE_AREA.left + p.r, MOVE_AREA.right - p.r);
  p.y = clamp(p.y, MOVE_AREA.top, MOVE_AREA.bottom - p.r);
  resolveBinCollisions(p);
  p.moving = mag > 0;

  tryCollect();
  tryDeposit();

  const elapsed = CONFIG.duration - state.timeLeft;
  const target = Math.min(CONFIG.maxItems, 4 + Math.floor(elapsed / 8));

  for (const item of state.items) {
    item.phase += dt * 2.2;
    item.born += dt;
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.items.length < target) {
    spawnItem();
    state.spawnTimer = Math.max(0.5, 1.7 - elapsed / 55);
  }

  for (const b of state.bins) {
    b.flash = Math.max(0, b.flash - dt * 1.6);
    b.shakeT = Math.max(0, b.shakeT - dt * 4);
  }
  state.shake = Math.max(0, state.shake - dt * 3);

  updateEffects(dt);
  syncHud();
}

function updateEffects(dt) {
  for (const q of state.particles) {
    q.life -= dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy += 420 * dt;
  }
  state.particles = state.particles.filter((q) => q.life > 0);

  for (const r of state.rings) r.life -= dt;
  state.rings = state.rings.filter((r) => r.life > 0);

  for (const s of state.sparkles) {
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 520 * dt;
    s.rot += s.vr * dt;
    s.vx *= 0.99;
  }
  state.sparkles = state.sparkles.filter((s) => s.life > 0);

  for (const f of state.floaters) {
    f.life -= dt;
    f.y -= dt * 30;
  }
  state.floaters = state.floaters.filter((f) => f.life > 0);

  state.flash.a = Math.max(0, state.flash.a - dt * 1.1);
}

function syncHud() {
  ui.score.textContent = state.score;
  if (ui.score.dataset.v !== String(state.score)) {
    ui.score.dataset.v = String(state.score);
    ui.score.classList.remove("bump");
    void ui.score.offsetWidth;
    ui.score.classList.add("bump");
  }
  ui.time.textContent = Math.ceil(state.timeLeft);
  ui.time.classList.toggle("warn", state.timeLeft <= 10);
  ui.combo.textContent = "x" + state.combo;
  ui.combo.classList.toggle("hot", state.combo >= 3);
  ui.co2.textContent = state.co2.toFixed(1) + " kg";

  const pct = (state.stamina / CONFIG.staminaMax) * 100;
  ui.staminaBar.style.width = pct + "%";
  ui.sprintBtn.classList.toggle("locked", !state.sprintUnlocked);
  ui.sprintBtn.classList.toggle("empty", state.sprintUnlocked && state.stamina <= 1);
  ui.sprintBtn.classList.toggle("active", state.sprinting);
  ui.sprintState.textContent = !state.sprintUnlocked
    ? "\u{1F512} faça " + CONFIG.sprintUnlockAt + " acertos"
    : state.sprintBlocked
      ? "sem fôlego — recicle!"
      : state.sprinting
        ? "correndo!"
        : "Shift ou o botão";

  const next = nextMilestone();
  const prev = prevMilestone();
  const span = Math.max(1, next - prev);
  const done = clamp(state.correct - prev, 0, span);
  ui.milestoneBar.style.width = (done / span) * 100 + "%";
  ui.milestoneText.textContent = next + " acertos";
}

/* ---------------- arte dos resíduos ---------------- */

function strokeOutline(c, width) {
  c.strokeStyle = "rgba(4, 22, 17, .55)";
  c.lineWidth = width || 2.4;
  c.lineJoin = "round";
  c.stroke();
}

function drawPapel(c, t) {
  c.save();
  c.rotate(-0.22);
  c.fillStyle = "#cfe0f5";
  rr(c, -17, -19, 36, 34, 3);
  c.fill();
  strokeOutline(c, 2.2);

  c.fillStyle = "#f7fbff";
  rr(c, -21, -14, 40, 34, 3);
  c.fill();
  strokeOutline(c, 2.4);

  c.fillStyle = "rgba(29, 79, 156, .16)";
  c.beginPath();
  c.moveTo(19, -14);
  c.lineTo(19, -4);
  c.lineTo(9, -14);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(29, 79, 156, .5)";
  c.lineWidth = 1.6;
  c.stroke();

  c.strokeStyle = t.color;
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(-13, -4);
  c.lineTo(9, -4);
  c.stroke();

  c.strokeStyle = "rgba(31, 60, 100, .35)";
  c.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) {
    const y = 3 + i * 5;
    c.beginPath();
    c.moveTo(-13, y);
    c.lineTo(i === 2 ? 2 : 12, y);
    c.stroke();
  }
  c.restore();
}

function drawPlastico(c, t) {
  c.save();
  c.rotate(0.14);

  c.fillStyle = t.color;
  rr(c, -8, -26, 16, 8, 2.5);
  c.fill();
  strokeOutline(c, 2);

  c.beginPath();
  c.moveTo(-6, -19);
  c.lineTo(6, -19);
  c.lineTo(10, -11);
  c.lineTo(13, -7);
  c.lineTo(13, 20);
  c.lineTo(-13, 20);
  c.lineTo(-13, -7);
  c.lineTo(-10, -11);
  c.closePath();
  c.fillStyle = "rgba(226, 242, 255, .5)";
  c.fill();
  strokeOutline(c, 2.4);

  c.save();
  c.clip();
  c.fillStyle = t.color;
  c.fillRect(-13, -2, 26, 12);
  c.fillStyle = "rgba(255,255,255,.35)";
  c.fillRect(-13, 1.5, 26, 2);
  c.restore();
  c.strokeStyle = "rgba(4, 22, 17, .45)";
  c.lineWidth = 2;
  rr(c, -13, -2, 26, 12, 2);
  c.stroke();

  c.strokeStyle = "rgba(255,255,255,.85)";
  c.lineWidth = 3;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-8, -6);
  c.lineTo(-8, 17);
  c.stroke();

  c.strokeStyle = "rgba(120, 170, 200, .5)";
  c.lineWidth = 1.6;
  for (let i = 0; i < 2; i++) {
    c.beginPath();
    c.moveTo(12, -12 + i * 5);
    c.lineTo(6, -12 + i * 5);
    c.stroke();
  }
  c.lineCap = "butt";
  c.restore();
}

function drawMetal(c, t) {
  c.save();
  const grad = c.createLinearGradient(-15, 0, 15, 0);
  grad.addColorStop(0, "#8d99a3");
  grad.addColorStop(0.3, "#eef3f7");
  grad.addColorStop(0.55, "#c3ced6");
  grad.addColorStop(1, "#79858f");

  c.beginPath();
  c.moveTo(-14, -14);
  c.lineTo(14, -14);
  c.lineTo(14, 18);
  c.quadraticCurveTo(14, 22, 10, 22);
  c.lineTo(-10, 22);
  c.quadraticCurveTo(-14, 22, -14, 18);
  c.closePath();
  c.fillStyle = grad;
  c.fill();
  strokeOutline(c, 2.4);

  c.beginPath();
  c.ellipse(0, -14, 14, 4.6, 0, 0, TAU);
  c.fillStyle = "#d7e0e7";
  c.fill();
  strokeOutline(c, 2.2);
  c.fillStyle = "#9aa6b1";
  c.beginPath();
  c.ellipse(0, -14.5, 9, 2.8, 0, 0, TAU);
  c.fill();

  c.save();
  c.beginPath();
  c.moveTo(-14, -14);
  c.lineTo(14, -14);
  c.lineTo(14, 18);
  c.quadraticCurveTo(14, 22, 10, 22);
  c.lineTo(-10, 22);
  c.quadraticCurveTo(-14, 22, -14, 18);
  c.closePath();
  c.clip();
  c.fillStyle = t.color;
  c.fillRect(-14, -4, 28, 15);
  c.fillStyle = "rgba(255,255,255,.3)";
  c.fillRect(-14, 0, 28, 2.4);
  c.fillStyle = "rgba(90, 60, 10, .55)";
  for (let i = 0; i < 3; i++) c.fillRect(-10, 2 + i * 4, 20, 1.8);
  c.restore();

  c.strokeStyle = "rgba(255,255,255,.9)";
  c.lineWidth = 2.6;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-9, -10);
  c.lineTo(-9, 17);
  c.stroke();
  c.lineCap = "butt";
  c.restore();
}

function drawVidro(c, t) {
  c.save();

  c.fillStyle = "#a16207";
  rr(c, -6.5, -28, 13, 8, 2);
  c.fill();
  strokeOutline(c, 2);

  c.beginPath();
  c.moveTo(-5.5, -21);
  c.lineTo(5.5, -21);
  c.lineTo(5.5, -12);
  c.quadraticCurveTo(14, -8, 14, 2);
  c.lineTo(14, 18);
  c.quadraticCurveTo(14, 23, 9, 23);
  c.lineTo(-9, 23);
  c.quadraticCurveTo(-14, 23, -14, 18);
  c.lineTo(-14, 2);
  c.quadraticCurveTo(-14, -8, -5.5, -12);
  c.closePath();
  c.fillStyle = "rgba(134, 239, 172, .45)";
  c.fill();
  strokeOutline(c, 2.4);

  c.save();
  c.clip();
  c.fillStyle = "rgba(34, 197, 94, .38)";
  c.fillRect(-14, -2, 28, 26);
  c.fillStyle = t.color;
  c.fillRect(-14, 4, 28, 6);
  c.restore();
  c.strokeStyle = "rgba(4, 22, 17, .4)";
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(-14, 4);
  c.lineTo(14, 4);
  c.moveTo(-14, 10);
  c.lineTo(14, 10);
  c.stroke();

  c.strokeStyle = "rgba(255,255,255,.8)";
  c.lineWidth = 3;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-8, -8);
  c.lineTo(-8, 19);
  c.stroke();
  c.lineCap = "butt";
  c.restore();
}

const ITEM_ART = {
  papel: drawPapel,
  plastico: drawPlastico,
  metal: drawMetal,
  vidro: drawVidro,
};

function drawItem(item) {
  const t = TYPES[item.type];
  const float = Math.sin(item.phase) * 4;
  const pop = Math.min(1, item.born * 3.2);
  const scale = pop < 1 ? 1 + (1 - pop) * 0.35 : 1;

  shadow(ctx, item.x, item.y + 20 - float * 0.3, 20 * pop, 7 * pop, 0.3 * pop);

  ctx.save();
  ctx.translate(item.x, item.y + float);
  ctx.scale(scale, scale);

  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
  glow.addColorStop(0, t.light);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.32 + Math.sin(item.phase) * 0.06;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = t.color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 6]);
  ctx.lineDashOffset = -item.phase * 14;
  ctx.beginPath();
  ctx.arc(0, 0, CONFIG.itemRadius + 6, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ITEM_ART[item.type](ctx, t);
  ctx.restore();
}

/* ---------------- personagem ---------------- */

function drawPlayer(p) {
  const moving = p.moving;
  const swing = Math.sin(p.step);
  const bob = Math.abs(Math.cos(p.step)) * 2.2 * (moving ? 1 : 0.15);
  const legSwing = moving ? swing * 7 : 0;
  const armSwing = moving ? -swing * 6 : 0;
  const blink = p.blink < 0 ? 0.15 : 1;

  for (const t of state.trail) {
    if (t.a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = t.a * 0.22;
    ctx.fillStyle = "#7ef2b5";
    ctx.beginPath();
    ctx.ellipse(t.x, t.y - 8, 14, 20, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  shadow(ctx, p.x, p.y + 26, 20, 7, 0.32);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.facing, 1);

  ctx.save();
  ctx.translate(0, -bob);
  ctx.rotate(swing * 0.03 * (moving ? 1 : 0));

  drawLeg(ctx, -4, legSwing * -1, "#1b4d63");
  drawArm(ctx, -13, armSwing, "#e8b98c");

  ctx.fillStyle = "#1f9d68";
  rr(ctx, -14, -12, 28, 24, 7);
  ctx.fill();
  ctx.fillStyle = "#25c07d";
  rr(ctx, -14, -12, 28, 11, 7);
  ctx.fill();

  ctx.fillStyle = "#17834f";
  rr(ctx, -9, -13, 4.5, 12, 2);
  ctx.fill();
  rr(ctx, 4.5, -13, 4.5, 12, 2);
  ctx.fill();

  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(-6.5, -3.5, 1.7, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(6.5, -3.5, 1.7, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#f8fff9";
  rr(ctx, -4.5, 1, 9, 9, 2.5);
  ctx.fill();
  ctx.strokeStyle = "rgba(4, 40, 28, .35)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.save();
  ctx.translate(0, 5.5);
  ctx.strokeStyle = "#1f9d68";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 3.4, Math.sin(a) * 3.4);
    ctx.lineTo(Math.cos(a + 0.9) * 3.4, Math.sin(a + 0.9) * 3.4);
    ctx.stroke();
  }
  ctx.restore();

  drawLeg(ctx, 4, legSwing, "#215f7a");

  ctx.fillStyle = "#f2d3a8";
  ctx.beginPath();
  ctx.arc(0, -21, 13, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#4a3527";
  ctx.beginPath();
  ctx.arc(0, -23, 13, Math.PI * 1.02, Math.PI * 2.02);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-13, -23);
  ctx.quadraticCurveTo(-16, -18, -12, -15);
  ctx.quadraticCurveTo(-13, -19, -13, -23);
  ctx.fill();

  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.arc(0, -25, 13, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.moveTo(1, -25);
  ctx.quadraticCurveTo(20, -26, 20, -21);
  ctx.quadraticCurveTo(12, -18, 1, -19);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#bbf7d0";
  ctx.beginPath();
  ctx.ellipse(-5, -31, 5, 3, -0.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#16a34a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-9, -30);
  ctx.lineTo(-1, -32);
  ctx.stroke();

  ctx.fillStyle = "#22303a";
  if (blink > 0.5) {
    ctx.beginPath();
    ctx.ellipse(4, -21, 1.9, 2.4, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4.7, -22, 0.7, 0, TAU);
    ctx.fill();
  } else {
    ctx.strokeStyle = "#22303a";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(1.5, -21);
    ctx.lineTo(6.5, -21);
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  ctx.fillStyle = "rgba(240, 130, 130, .45)";
  ctx.beginPath();
  ctx.ellipse(8.5, -17, 3.4, 2.2, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "#22303a";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(3.5, -18.5, 4, 0.25, Math.PI * 0.72);
  ctx.stroke();
  ctx.lineCap = "butt";

  drawArm(ctx, 13, p.carrying ? -1.25 : armSwing, "#f2d3a8");

  ctx.restore();

  if (p.carrying) drawCarried(p.carrying.type);
  ctx.restore();
}

function drawLeg(c, x, swing, color) {
  c.save();
  c.translate(x, 12);
  c.rotate((swing / 7) * 0.35);
  c.fillStyle = color;
  rr(c, -4, -2, 8, 14, 3.5);
  c.fill();
  c.fillStyle = "#f8fafc";
  rr(c, -5.5, 9, 12, 6, 3);
  c.fill();
  c.strokeStyle = "rgba(4, 22, 17, .35)";
  c.lineWidth = 1.6;
  c.stroke();
  c.restore();
}

function drawArm(c, x, swing, color) {
  c.save();
  c.translate(x, -6);
  c.rotate((swing / 7) * 0.5);
  c.fillStyle = color;
  rr(c, -3.5, -1, 7, 14, 3.5);
  c.fill();
  c.strokeStyle = "rgba(4, 22, 17, .3)";
  c.lineWidth = 1.4;
  c.stroke();
  c.restore();
}

function drawCarried(type) {
  const t = TYPES[type];
  ctx.save();
  ctx.translate(0, -48);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
  glow.addColorStop(0, t.light);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.scale(0.78, 0.78);
  ITEM_ART[type](ctx, t);
  ctx.restore();
}

/* ---------------- cenário ---------------- */

const bg = document.createElement("canvas");
bg.width = W;
bg.height = H;
const bgCtx = bg.getContext("2d");

function buildBackground() {
  const map = MAPS[state.mapIndex];
  const rng = seeded(987654 + state.mapIndex * 7919);
  const c = bgCtx;

  const sky = c.createLinearGradient(0, 0, 0, PLATFORM.bottom);
  sky.addColorStop(0, map.sky[0]);
  sky.addColorStop(1, map.sky[1]);
  c.fillStyle = sky;
  c.fillRect(0, 0, W, PLATFORM.bottom);

  drawSky(c, map, rng);
  drawHorizon(c, map, rng);

  const wall = c.createLinearGradient(0, PLATFORM.top, 0, PLATFORM.bottom);
  wall.addColorStop(0, map.wall[0]);
  wall.addColorStop(1, map.wall[1]);
  c.fillStyle = wall;
  rr(c, 0, PLATFORM.top, W, PLATFORM.bottom - PLATFORM.top + 18, 14);
  c.fill();

  c.fillStyle = "rgba(255,255,255,.07)";
  for (let x = 20; x < W; x += 54) c.fillRect(x, PLATFORM.top + 8, 2, PLATFORM.bottom - PLATFORM.top - 6);

  for (let i = 0; i < 16; i++) {
    const x = 16 + i * 62 + rng() * 14;
    const y = PLATFORM.top + 16;
    c.fillStyle = i % 2 ? "#2f7d4f" : "#276b45";
    for (let b = 0; b < 3; b++) {
      c.beginPath();
      c.ellipse(x + b * 11, y + rng() * 4, 13, 11, 0, 0, TAU);
      c.fill();
    }
  }

  const floor = c.createLinearGradient(0, PLATFORM.bottom, 0, H);
  floor.addColorStop(0, map.floor[0]);
  floor.addColorStop(1, map.floor[1]);
  c.fillStyle = floor;
  c.fillRect(0, PLATFORM.bottom - 8, W, H - PLATFORM.bottom + 8);

  c.strokeStyle = map.floorLine;
  c.lineWidth = 2;
  for (let x = 0; x <= W; x += 64) {
    c.beginPath();
    c.moveTo(x, PLATFORM.bottom);
    c.lineTo(x, H);
    c.stroke();
  }
  for (let y = PLATFORM.bottom; y <= H; y += 56) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }

  const sh = c.createLinearGradient(0, PLATFORM.bottom, 0, PLATFORM.bottom + 26);
  sh.addColorStop(0, "rgba(0,0,0,.3)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = sh;
  c.fillRect(0, PLATFORM.bottom - 8, W, 30);

  drawFloorDetails(c, map, rng);
}

function drawSky(c, map, rng) {
  if (map.dark) {
    c.fillStyle = "rgba(255,255,255,.6)";
    for (let i = 0; i < 44; i++) {
      const x = rng() * W;
      const y = rng() * (PLATFORM.top + 46);
      c.globalAlpha = 0.15 + rng() * 0.55;
      c.fillRect(x, y, rng() * 1.8 + 0.4, rng() * 1.8 + 0.4);
    }
    c.globalAlpha = 1;
    c.fillStyle = "rgba(255, 244, 214, .9)";
    c.beginPath();
    c.arc(W - 108, 58, 18, 0, TAU);
    c.fill();
    c.fillStyle = map.sky[0];
    c.beginPath();
    c.arc(W - 117, 51, 16, 0, TAU);
    c.fill();
  } else {
    const sunX = 120;
    const sunY = 62;
    const glow = c.createRadialGradient(sunX, sunY, 6, sunX, sunY, 110);
    glow.addColorStop(0, "rgba(255, 246, 200, .95)");
    glow.addColorStop(1, "rgba(255, 246, 200, 0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(sunX, sunY, 110, 0, TAU);
    c.fill();
    c.fillStyle = "#fff6c8";
    c.beginPath();
    c.arc(sunX, sunY, 22, 0, TAU);
    c.fill();

    c.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 5; i++) {
      const x = 120 + rng() * (W - 240);
      const y = 40 + rng() * 90;
      const s = 0.6 + rng() * 0.7;
      c.beginPath();
      c.arc(x, y, 18 * s, 0, TAU);
      c.arc(x + 20 * s, y + 4 * s, 14 * s, 0, TAU);
      c.arc(x - 20 * s, y + 5 * s, 12 * s, 0, TAU);
      c.fill();
    }
  }
}

function drawHorizon(c, map, rng) {
  switch (state.mapIndex) {
    case 0: { // prédios à noite
      let bx = -20;
      while (bx < W + 20) {
        const bw = 46 + rng() * 54;
        const bh = 60 + rng() * 66;
        const top = PLATFORM.bottom - 20 - bh;
        c.fillStyle = "rgba(8, 38, 44, .85)";
        rr(c, bx, top, bw, bh + 24, 4);
        c.fill();
        c.fillStyle = "rgba(255, 226, 150, .22)";
        for (let wy = top + 12; wy < PLATFORM.bottom - 34; wy += 18) {
          for (let wx = bx + 8; wx < bx + bw - 12; wx += 15) {
            if (rng() > 0.45) c.fillRect(wx, wy, 7, 9);
          }
        }
        bx += bw + 6 + rng() * 12;
      }
      break;
    }
    case 1: { // colinas e pinheiros
      c.fillStyle = "#4e9a5f";
      c.beginPath();
      c.moveTo(0, PLATFORM.bottom);
      for (let x = 0; x <= W; x += 60) {
        c.quadraticCurveTo(x + 30, PLATFORM.bottom - 70 - rng() * 40, x + 60, PLATFORM.bottom - 10);
      }
      c.lineTo(W, PLATFORM.bottom);
      c.closePath();
      c.fill();
      c.fillStyle = "#3d7f4c";
      for (let i = 0; i < 12; i++) {
        const x = 20 + rng() * (W - 40);
        const h = 34 + rng() * 26;
        const base = PLATFORM.bottom - 18;
        c.beginPath();
        c.moveTo(x, base - h);
        c.lineTo(x + 14, base);
        c.lineTo(x - 14, base);
        c.closePath();
        c.fill();
      }
      break;
    }
    case 2: { // mar e sol poente
      const sea = c.createLinearGradient(0, PLATFORM.bottom - 92, 0, PLATFORM.bottom);
      sea.addColorStop(0, "#1f7fa8");
      sea.addColorStop(1, "#3aa6c4");
      c.fillStyle = sea;
      c.fillRect(0, PLATFORM.bottom - 92, W, 100);
      c.fillStyle = "rgba(255,255,255,.3)";
      for (let i = 0; i < 26; i++) {
        const y = PLATFORM.bottom - 88 + rng() * 84;
        const x = rng() * W;
        c.fillRect(x, y, 16 + rng() * 30, 2);
      }
      c.fillStyle = "rgba(255, 214, 140, .5)";
      c.beginPath();
      c.arc(W - 150, PLATFORM.bottom - 70, 30, 0, TAU);
      c.fill();
      break;
    }
    case 3: { // galpões e chaminés
      let bx = -10;
      while (bx < W + 20) {
        const bw = 70 + rng() * 70;
        const bh = 70 + rng() * 50;
        const top = PLATFORM.bottom - 14 - bh;
        c.fillStyle = "rgba(60, 70, 80, .9)";
        rr(c, bx, top, bw, bh + 20, 3);
        c.fill();
        c.fillStyle = "rgba(255,255,255,.08)";
        c.fillRect(bx, top, bw, 6);
        c.strokeStyle = "rgba(0,0,0,.3)";
        c.lineWidth = 2;
        for (let k = 1; k < 4; k++) {
          c.beginPath();
          c.moveTo(bx, top + (bh / 4) * k);
          c.lineTo(bx + bw, top + (bh / 4) * k);
          c.stroke();
        }
        if (rng() > 0.5) {
          const cx = bx + bw * 0.7;
          c.fillStyle = "#4a545e";
          c.fillRect(cx - 8, top - 40, 16, 42);
          c.fillStyle = "rgba(255,255,255,.25)";
          for (let s = 0; s < 3; s++) {
            c.beginPath();
            c.arc(cx + rng() * 14 - 7, top - 52 - s * 16, 10 + s * 5, 0, TAU);
            c.fill();
          }
        }
        bx += bw + 8;
      }
      break;
    }
    default: { // morros e moinho
      c.fillStyle = "#8fc45c";
      c.beginPath();
      c.moveTo(0, PLATFORM.bottom);
      c.quadraticCurveTo(W * 0.3, PLATFORM.bottom - 120, W * 0.55, PLATFORM.bottom - 30);
      c.quadraticCurveTo(W * 0.8, PLATFORM.bottom - 90, W, PLATFORM.bottom - 20);
      c.lineTo(W, PLATFORM.bottom);
      c.closePath();
      c.fill();
      drawWindmill(c, W - 130, PLATFORM.bottom - 18, 1);
      break;
    }
  }
}

function drawFloorDetails(c, map, rng) {
  if (state.mapIndex === 2) {
    c.fillStyle = "rgba(255,255,255,.28)";
    for (let i = 0; i < 26; i++) {
      const y = PLATFORM.bottom + 24 + rng() * (H - PLATFORM.bottom - 50);
      c.beginPath();
      c.ellipse(rng() * W, y, 26 + rng() * 30, 4, 0, 0, TAU);
      c.fill();
    }
    drawPalm(c, 70, H - 26, 1.1);
    drawPalm(c, W - 70, H - 40, 0.9);
    return;
  }

  if (state.mapIndex === 3) {
    c.fillStyle = "rgba(245, 197, 24, .5)";
    for (let x = 20; x < W; x += 90) {
      c.fillRect(x, H / 2 + 40, 48, 7);
    }
    c.strokeStyle = "rgba(255,255,255,.18)";
    c.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const x = rng() * W;
      const y = PLATFORM.bottom + rng() * (H - PLATFORM.bottom - 40);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 20 + rng() * 30, y + 12);
      c.stroke();
    }
    drawLamp(c, 108, PLATFORM.bottom + 6);
    drawLamp(c, W - 108, PLATFORM.bottom + 6);
    return;
  }

  const grass = state.mapIndex === 1 ? "rgba(34, 197, 94, .2)" : "rgba(126, 217, 87, .14)";
  for (let i = 0; i < 26; i++) {
    const x = rng() * W;
    const y = PLATFORM.bottom + 20 + rng() * (H - PLATFORM.bottom - 40);
    c.fillStyle = grass;
    c.beginPath();
    c.ellipse(x, y, 16 + rng() * 18, 6 + rng() * 4, 0, 0, TAU);
    c.fill();
  }

  const petals = state.mapIndex === 1
    ? ["#fde68a", "#fbcfe8", "#a7f3d0"]
    : ["#fde68a", "#fbcfe8", "#bfdbfe"];
  for (let i = 0; i < 20; i++) {
    const x = 20 + rng() * (W - 40);
    const y = PLATFORM.bottom + 26 + rng() * (H - PLATFORM.bottom - 50);
    c.fillStyle = petals[Math.floor(rng() * petals.length)];
    for (let p = 0; p < 4; p++) {
      const a = (p / 4) * TAU;
      c.beginPath();
      c.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.2, 0, TAU);
      c.fill();
    }
    c.fillStyle = "#fbbf24";
    c.beginPath();
    c.arc(x, y, 1.8, 0, TAU);
    c.fill();
  }

  drawTree(c, 66, H - 30, 1.15, rng);
  drawTree(c, W - 66, H - 40, 0.95, rng);
  drawLamp(c, 108, PLATFORM.bottom + 6);
  drawLamp(c, W - 108, PLATFORM.bottom + 6);
}

function drawTree(c, x, y, s, rng) {
  c.save();
  c.globalAlpha = 0.3;
  c.fillStyle = "#000";
  c.beginPath();
  c.ellipse(x, y + 4, 30 * s, 10 * s, 0, 0, TAU);
  c.fill();
  c.globalAlpha = 1;

  c.fillStyle = "#5b4025";
  rr(c, x - 6 * s, y - 46 * s, 12 * s, 46 * s, 4 * s);
  c.fill();
  c.fillStyle = "rgba(255,255,255,.1)";
  rr(c, x - 6 * s, y - 46 * s, 4 * s, 46 * s, 2 * s);
  c.fill();

  if (state.mapIndex === 1) {
    c.fillStyle = "#2f8f52";
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(x, y - (96 - i * 22) * s);
      c.lineTo(x + (22 - i * 3) * s, y - (54 - i * 22) * s);
      c.lineTo(x - (22 - i * 3) * s, y - (54 - i * 22) * s);
      c.closePath();
      c.fill();
    }
  } else {
    const blobs = [[-16, -62, 22], [16, -60, 20], [0, -80, 25], [-8, -52, 19], [12, -48, 17]];
    blobs.forEach((b, i) => {
      c.fillStyle = i % 2 ? "#2f8f52" : "#37a35f";
      c.beginPath();
      c.arc(x + b[0] * s, y + b[1] * s, b[2] * s, 0, TAU);
      c.fill();
    });
    c.fillStyle = "rgba(255,255,255,.14)";
    c.beginPath();
    c.arc(x - 10 * s, y - 82 * s, 9 * s, 0, TAU);
    c.fill();
  }

  if (rng() > 0.45) {
    c.fillStyle = "#ef4444";
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(x - 12 * s + i * 11 * s, y - 60 * s - (i % 2) * 10 * s, 3 * s, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}

function drawPalm(c, x, y, s) {
  c.save();
  c.globalAlpha = 0.26;
  c.fillStyle = "#000";
  c.beginPath();
  c.ellipse(x, y + 4, 26 * s, 9 * s, 0, 0, TAU);
  c.fill();
  c.globalAlpha = 1;

  c.strokeStyle = "#8a5a2b";
  c.lineWidth = 9 * s;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + 14 * s, y - 52 * s, x + 6 * s, y - 92 * s);
  c.stroke();

  c.fillStyle = "#2f8f52";
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * TAU;
    c.beginPath();
    c.ellipse(x + 6 * s + Math.cos(a) * 26 * s, y - 92 * s + Math.sin(a) * 20 * s, 30 * s, 11 * s, a, 0, TAU);
    c.fill();
  }
  c.fillStyle = "#a16207";
  c.beginPath();
  c.arc(x + 6 * s, y - 88 * s, 6 * s, 0, TAU);
  c.fill();
  c.restore();
}

function drawWindmill(c, x, y, s) {
  c.save();
  c.fillStyle = "#f5f0e1";
  c.beginPath();
  c.moveTo(x - 26 * s, y);
  c.lineTo(x - 12 * s, y - 66 * s);
  c.lineTo(x + 12 * s, y - 66 * s);
  c.lineTo(x + 26 * s, y);
  c.closePath();
  c.fill();
  c.fillStyle = "#c0392b";
  c.beginPath();
  c.moveTo(x - 15 * s, y - 66 * s);
  c.lineTo(x, y - 82 * s);
  c.lineTo(x + 15 * s, y - 66 * s);
  c.closePath();
  c.fill();
  c.strokeStyle = "#8a6b3a";
  c.lineWidth = 4 * s;
  c.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    c.beginPath();
    c.moveTo(x, y - 66 * s);
    c.lineTo(x + Math.cos(a) * 30 * s, y - 66 * s + Math.sin(a) * 30 * s);
    c.stroke();
  }
  c.restore();
}

function drawLamp(c, x, y) {
  c.save();
  c.globalAlpha = 0.28;
  c.fillStyle = "#000";
  c.beginPath();
  c.ellipse(x, y + 2, 14, 5, 0, 0, TAU);
  c.fill();
  c.globalAlpha = 1;

  c.strokeStyle = "#37474f";
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, y - 92);
  c.quadraticCurveTo(x, y - 102, x + 14, y - 102);
  c.stroke();

  const glow = c.createRadialGradient(x + 14, y - 100, 2, x + 14, y - 100, 46);
  glow.addColorStop(0, "rgba(255, 236, 170, .5)");
  glow.addColorStop(1, "rgba(255, 236, 170, 0)");
  c.fillStyle = glow;
  c.beginPath();
  c.arc(x + 14, y - 100, 46, 0, TAU);
  c.fill();

  c.fillStyle = "#ffeaa7";
  c.beginPath();
  c.ellipse(x + 14, y - 99, 8, 6, 0, 0, TAU);
  c.fill();
  c.restore();
}

buildBackground();

/* ---------------- lixeiras ---------------- */

function recycleGlyph(c, x, y, s, color) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.strokeStyle = color;
  c.lineWidth = 2.6;
  c.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    const x1 = Math.cos(a) * 7;
    const y1 = Math.sin(a) * 7;
    const x2 = Math.cos(a + 2.1) * 7;
    const y2 = Math.sin(a + 2.1) * 7;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    const ang = Math.atan2(y1 - y2, x1 - x2);
    c.beginPath();
    c.moveTo(x2 + Math.cos(ang - 0.6) * 5, y2 + Math.sin(ang - 0.6) * 5);
    c.lineTo(x2 + Math.cos(ang + 0.6) * 5, y2 + Math.sin(ang + 0.6) * 5);
    c.stroke();
  }
  c.restore();
}

function drawBin(bin) {
  const t = TYPES[bin.type];
  const cx = bin.x + bin.w / 2;
  const shake = bin.shakeT > 0 ? Math.sin(bin.shakeT * 40) * bin.shakeT * 3 : 0;
  const lift = bin.flash;

  ctx.save();
  ctx.translate(shake, 0);

  shadow(ctx, cx, bin.y + bin.h + 8, bin.w * 0.46, 11, 0.34);

  ctx.save();
  ctx.shadowColor = t.color;
  ctx.shadowBlur = 16 + lift * 30;
  const body = ctx.createLinearGradient(bin.x, 0, bin.x + bin.w, 0);
  body.addColorStop(0, t.deep);
  body.addColorStop(0.35, t.color);
  body.addColorStop(0.62, lift > 0.2 ? t.light : t.color);
  body.addColorStop(1, t.deep);
  ctx.fillStyle = body;
  rr(ctx, bin.x, bin.y, bin.w, bin.h, 12);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(4, 22, 17, .45)";
  ctx.lineWidth = 2.5;
  rr(ctx, bin.x, bin.y, bin.w, bin.h, 12);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = 4;
  for (let i = 1; i < 3; i++) {
    const y = bin.y + (bin.h / 3) * i;
    ctx.beginPath();
    ctx.moveTo(bin.x + 10, y);
    ctx.lineTo(bin.x + bin.w - 10, y);
    ctx.stroke();
  }

  ctx.fillStyle = lift > 0.2 ? t.light : t.deep;
  rr(ctx, bin.x - 5, bin.y - 12, bin.w + 10, 22, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(4, 22, 17, .45)";
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ctx.fillStyle = "rgba(4, 22, 17, .85)";
  rr(ctx, bin.x + 12, bin.y - 7, bin.w - 24, 11, 5);
  ctx.fill();

  recycleGlyph(ctx, cx, bin.y + 38, 1, "rgba(255,255,255,.92)");

  ctx.fillStyle = "rgba(255,255,255,.94)";
  rr(ctx, bin.x + 12, bin.y + 54, bin.w - 24, 26, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(4, 22, 17, .25)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = t.deep;
  ctx.font = "bold 14px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(t.label.toUpperCase(), cx, bin.y + 72);

  if (lift > 0) {
    ctx.save();
    ctx.globalAlpha = lift * 0.55;
    const gl = ctx.createLinearGradient(bin.x, bin.y, bin.x, bin.y + bin.h);
    gl.addColorStop(0, "#ffffff");
    gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl;
    rr(ctx, bin.x, bin.y, bin.w, bin.h, 12);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/* ---------------- render ---------------- */

function drawDropZones() {
  const p = state.player;
  if (!p || !p.carrying) return;
  const target = TYPES[p.carrying.type];

  for (const bin of state.bins) {
    const isTarget = bin.type === p.carrying.type;
    ctx.save();
    ctx.globalAlpha = isTarget ? 0.4 : 0.14;
    ctx.strokeStyle = isTarget ? target.light : "#ffffff";
    ctx.lineWidth = isTarget ? 3 : 2;
    ctx.setLineDash(isTarget ? [] : [6, 8]);
    ctx.beginPath();
    ctx.ellipse(
      bin.x + bin.w / 2,
      bin.y + bin.h / 2 + bin.h / 2 + CONFIG.dropRadius * 0.42,
      bin.w * 0.42,
      CONFIG.dropRadius * 0.34,
      0, 0, TAU
    );
    ctx.stroke();
    ctx.restore();
  }
}

function drawTimeBar() {
  const ratio = clamp(state.timeLeft / CONFIG.duration, 0, 1);
  const x = 28;
  const w = W - 56;

  ctx.save();
  ctx.fillStyle = "rgba(4, 20, 16, .55)";
  rr(ctx, x - 3, 17, w + 6, 14, 8);
  ctx.fill();

  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  if (ratio > 0.25) {
    g.addColorStop(0, "#22c55e");
    g.addColorStop(1, "#a3e635");
  } else {
    g.addColorStop(0, "#ef4444");
    g.addColorStop(1, "#f97316");
  }
  ctx.fillStyle = g;
  rr(ctx, x, 20, Math.max(12, w * ratio), 8, 4);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = "bold 11px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TEMPO", x + w / 2, 30);
  ctx.restore();
}

function drawHint() {
  const p = state.player;
  if (!p || !p.carrying) return;
  const target = state.bins.find((b) => b.type === p.carrying.type);
  if (!target) return;
  const t = TYPES[target.type];

  ctx.save();
  ctx.strokeStyle = t.light;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 9]);
  ctx.lineDashOffset = -performance.now() / 40;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 20);
  ctx.quadraticCurveTo(
    (p.x + target.x + target.w / 2) / 2,
    (p.y + target.y) / 2 + 30,
    target.x + target.w / 2,
    target.y + target.h + 6
  );
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.save();
  if (state.shake > 0) {
    const s = state.shake * 7;
    ctx.translate(rnd(-s, s), rnd(-s, s));
  }

  ctx.drawImage(bg, 0, 0);
  drawTimeBar();
  for (const bin of state.bins) drawBin(bin);
  drawDropZones();

  const items = [...state.items].sort((a, b) => a.y - b.y);
  for (const item of items) drawItem(item);

  const p = state.player;
  drawHint();
  if (p) drawPlayer(p);

  for (const r of state.rings) {
    const t = 1 - r.life / r.max;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, lerp(r.from, r.to, t), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  for (const q of state.particles) {
    const a = q.life / q.max;
    ctx.globalAlpha = a;
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.size * a, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const s of state.sparkles) {
    ctx.save();
    ctx.globalAlpha = clamp(s.life / s.max, 0, 1);
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.fillStyle = s.color;
    ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }

  ctx.textAlign = "center";
  for (const f of state.floaters) {
    const a = Math.min(1, f.life * 1.6);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `bold ${f.size}px 'Trebuchet MS', sans-serif`;
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(3, 18, 14, .75)";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
  ctx.textAlign = "left";

  if (state.flash.a > 0) {
    ctx.save();
    ctx.globalAlpha = state.flash.a;
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, state.flash.color);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  ctx.restore();
}

/* ---------------- áudio ---------------- */

let audioCtx = null;

function playSound(kind) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = {
      pick: [[440, 0.08]],
      good: [[523, 0.09], [784, 0.14]],
      perfect: [[523, 0.08], [784, 0.08], [1046, 0.18]],
      bad: [[196, 0.18], [131, 0.24]],
      levelup: [[523, 0.1], [659, 0.1], [784, 0.1], [1046, 0.28]],
    };
    const seq = notes[kind] || notes.pick;
    let t = audioCtx.currentTime;
    for (const [freq, dur] of seq) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = kind === "bad" ? "sawtooth" : "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur * 0.85;
    }
  } catch (e) {
    void e;
  }
}

/* ---------------- telas ---------------- */

function rating() {
  const acc = state.collected ? state.correct / state.collected : 0;
  if (state.correct >= 40) return ["\u{1F9F9}", "Lenda da reciclagem!"];
  if (state.correct >= 25) return ["\u{1F31F}", "Cruzador da reciclagem!"];
  if (state.correct >= 15) return ["\u{1F33F}", "Ótimo separador de resíduos!"];
  if (state.correct >= 8) return ["\u{1F4C3}", "Bom começo, recicle mais!"];
  return ["\u{1F4DA}", "Treine a separação e tente de novo"];
}

function endGame() {
  state.running = false;
  state.over = true;
  sprintHeld = false;
  playSound(state.wrong === 0 ? "perfect" : "good");

  const acc = state.collected ? Math.round((state.correct / state.collected) * 100) : 0;
  const [emoji, msg] = rating();

  ui.title.innerHTML = `${emoji} ${msg}`;
  ui.text.innerHTML =
    `Você separou corretamente <b>${state.correct}</b> de <b>${state.collected}</b> resíduos, ` +
    `visitou <b>${state.mapsUnlocked}</b> ${state.mapsUnlocked === 1 ? "mapa" : "mapas"} e desviou ` +
    `<b>${state.co2.toFixed(1)} kg</b> de CO₂ do aterro sanitário.`;
  ui.legend.hidden = true;
  ui.keysHint.hidden = true;
  ui.results.hidden = false;
  ui.results.innerHTML = `
    <div class="result"><span>Pontos</span><strong>${state.score}</strong></div>
    <div class="result"><span>Acertos</span><strong>${state.correct}</strong></div>
    <div class="result"><span>Erros</span><strong>${state.wrong}</strong></div>
    <div class="result"><span>Precisão</span><strong>${acc}%</strong></div>
    <div class="result"><span>Mapas</span><strong>${state.mapsUnlocked}</strong></div>
  `;
  ui.startBtn.textContent = "Jogar de novo";
  ui.overlay.classList.remove("hidden");
}

function startGame() {
  state.score = 0;
  state.combo = 1;
  state.co2 = 0;
  state.timeLeft = CONFIG.duration;
  state.collected = 0;
  state.correct = 0;
  state.wrong = 0;
  state.items = [];
  state.particles = [];
  state.rings = [];
  state.sparkles = [];
  state.floaters = [];
  state.trail = [];
  state.spawnTimer = 0;
  state.shake = 0;
  state.flash.a = 0;
  state.stamina = CONFIG.staminaMax;
  state.sinceFull = 0;
  state.sprintUnlocked = false;
  state.sprintBlocked = false;
  state.sprinting = false;
  state.mapIndex = 0;
  state.mapsUnlocked = 1;
  state.lastMilestone = 0;
  state.over = false;
  state.running = true;
  state.bins = buildBins();
  state.player = makePlayer();
  sprintHeld = false;

  ui.mapName.textContent = MAPS[0].name;
  ui.title.textContent = "Bem-vindo ao Ecoplays!";
  ui.text.innerHTML =
    "Você é o agente de reciclagem da cidade. Corra pela praça, pegue os resíduos " +
    "e leve cada um até a lixeira correta.";
  ui.legend.hidden = false;
  ui.keysHint.hidden = false;
  ui.results.hidden = true;
  ui.results.innerHTML = "";
  ui.startBtn.textContent = "Começar a jogar";
  ui.overlay.classList.add("hidden");
  ui.staminaMeter.classList.remove("done");
  ui.milestoneMeter.classList.remove("done");

  buildBackground();
  spawnWave();
  spawnWave();
  syncHud();
}

/* ---------------- entrada ---------------- */

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (state.running && e.key === " ") {
    tryCollect();
    tryDeposit();
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
});

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  pointer.x = ((src.clientX - rect.left) / rect.width) * W;
  pointer.y = ((src.clientY - rect.top) / rect.height) * H;
}

canvas.addEventListener("mousedown", (e) => {
  if (!state.running) return;
  pointer.active = true;
  toCanvasCoords(e);
});

canvas.addEventListener("touchstart", (e) => {
  if (!state.running) return;
  pointer.active = true;
  toCanvasCoords(e);
}, { passive: true });

canvas.addEventListener("touchmove", (e) => {
  if (!state.running) return;
  pointer.active = true;
  toCanvasCoords(e);
}, { passive: true });

canvas.addEventListener("touchend", () => { pointer.active = false; });
window.addEventListener("mouseup", () => { pointer.active = false; });
window.addEventListener("blur", () => {
  keys.clear();
  pointer.active = false;
  sprintHeld = false;
});

function setSprint(on) {
  sprintHeld = on && state.sprintUnlocked;
}

ui.sprintBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (!state.sprintUnlocked) return;
  sprintHeld = true;
  ui.sprintBtn.setPointerCapture(e.pointerId);
});

["pointerup", "pointercancel", "pointerleave"].forEach((ev) => {
  ui.sprintBtn.addEventListener(ev, () => setSprint(false));
});

ui.sprintBtn.addEventListener("contextmenu", (e) => e.preventDefault());
ui.startBtn.addEventListener("click", startGame);
ui.restartBtn.addEventListener("click", startGame);

let last = performance.now();

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

state.player = makePlayer();
syncHud();
requestAnimationFrame(loop);
