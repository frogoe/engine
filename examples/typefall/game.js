/* Typefall — words fall from a quiet galaxy; type to lock on, type to kill.
 * ZType-style lock-on typing arcade. The verb is `type`: every keystroke
 * flows through input.on("key") — hardware keys and the hud-keyboard block
 * arrive as the same events. Visual identity ported from the WordInvaders
 * space theme: same dome aliens, same finned ship, same violet nebula. */
import { defineGame } from "frogoe";

/* ---------- palette (from BRIEF.md) — exported: identity art renders with
 * these constants (assets/poster.js, assets/icon.js) — 1:1 by construction ---------- */
export const C = {
  bg: "#07060c", // void
  bgDeep: "#03040e",
  skyMid: "#080c20",
  fg: "#f5f2ff", // ink
  fgDim: "#9b96b8",
  fgFaint: "#6c6890",
  accent: "#28e0e8", // cyan — alien variant 0
  iris: "#8b5cf6", // alien variant 1
  flare: "#ff6a3d", // ship body, locked letters, lasers
  flareDeep: "#b83b14", // flame outer ember
  gold: "#ffc93c", // thruster, score popups
  rose: "#ff4d6d", // damage
  chip: "rgba(14,12,24,0.88)",
  outline: "#03040e",
  starFar: "#9fb4dc",
  starMid: "#c9d4f0",
  nebulaCyan: "rgba(31,182,201,0.12)",
  nebulaIris: "rgba(123,77,219,0.16)",
};

/* ---------- tuning (ported from the WordInvaders config — proven pacing) —
 * exported so identity art renders at TRUE game scale (1:1 by import) ---------- */
export const TUNE = {
  alienSpeedBase: 38, // px/s at wave 0
  alienSpeedGrowth: 0.7, // per kill
  alienSpeedMax: 92,
  spawnIntervalBase: 1.95, // s
  spawnIntervalShrink: 0.04, // per kill
  spawnIntervalMin: 0.85,
  maxAliens: 4,
  spawnMargin: 66,
  spawnMinDist: 142,
  scoreBase: 10,
  scorePerLetter: 2,
  maxLives: 3,
  burstLife: 340, // ms
  popupLife: 800,
  flashDuration: 180,
  laserLife: 220,
  glyphW: 42,
  glyphH: 40,
  shipW: 70,
  shipH: 64,
};

/* ---------- words: common English, 4–8 letters. The starter pool carries
 * short words (and the sandbox ladder's words — "glow", "game" — land as
 * honest early kills); later waves draw longer. "frogoe" is a rare guest. ---------- */
const STARTER = ["glow", "game", "star", "moon", "buzz", "jets", "wave", "orbit", "nova", "dust"];
const POOL = [
  "alien", "comet", "laser", "pilot", "radar", "rider", "solar", "void", "vortex", "rocket",
  "signal", "planet", "meteor", "cosmos", "quasar", "photon", "nebula", "galaxy", "zephyr", "astra",
  "drift", "pulse", "beacon", "voyage", "venture", "stella", "cluster", "eclipse", "gravity",
  "asteroid", "lightyear", "supernova", "constellation", "telemetry", "satellite", "corona",
  "aurora", "helios", "pulsar", "zenith",
];
const RARE = ["frogoe"]; // the house guest — long, worth seeing

const pickWord = (wave, rng) => {
  if (wave > 5 && rng() < 0.04) return RARE[Math.floor(rng() * RARE.length)];
  if (wave < 3 && rng() < 0.5) return STARTER[Math.floor(rng() * STARTER.length)];
  return POOL[Math.floor(rng() * POOL.length)];
};

/* ---------- tiny synth (WebAudio, unlocked inside gestures; mute follows __frogoe) ---------- */
const Sfx = {
  ctx: null,
  muted: false,
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext ?? window.webkitAudioContext)(); } catch { return; }
    }
    if (this.ctx && this.ctx.state !== "running") void this.ctx.resume();
  },
  tone(type, f0, f1, dur, vol = 0.15, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  tick() { this.tone("square", 880, 660, 0.03, 0.06); },
  wrong() { this.tone("square", 140, 90, 0.06, 0.08); },
  kill() { this.tone("square", 320, 40, 0.18, 0.18); this.tone("sawtooth", 640, 90, 0.1, 0.1); },
  hurt() { this.tone("sawtooth", 200, 55, 0.3, 0.22); this.tone("sine", 90, 40, 0.25, 0.2); },
  over() { this.tone("sawtooth", 420, 50, 0.55, 0.24); },
  combo(n) { this.tone("square", 660 + n * 60, 990 + n * 60, 0.05, 0.09); },
};
document.addEventListener("frogoe:mute", (e) => { Sfx.muted = !!e.detail?.muted; });

/* ---------- deterministic starfield — frac(sin(seed + i*n) * 10000), the
 * exact formula from the source theme, so the sky is the same sky ---------- */
const drand = (seed, i, n) => {
  const x = Math.sin(seed + i * n) * 10000;
  return x - Math.floor(x);
};
const makeStars = (count, rMin, rMax, oMin, oMax, seed) => {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      fx: drand(seed, i, 12.9), // fractions — resolved against live stage size
      fy: drand(seed, i, 4.1),
      r: rMin + drand(seed, i, 7.7) * (rMax - rMin),
      a: oMin + drand(seed, i, 3.3) * (oMax - oMin),
    });
  }
  return list;
};
const STARS = [
  { color: C.starFar, speed: 14, list: makeStars(42, 0.5, 1.1, 0.2, 0.5, 1) },
  { color: C.starMid, speed: 30, list: makeStars(26, 0.8, 1.6, 0.4, 0.8, 2) },
  { color: "#ffffff", speed: 52, list: makeStars(12, 1.3, 2.3, 0.7, 1.0, 3) },
];

/* ---------- sprites (exported for identity art) — viewBox geometry ported
 * 1:1 from the source theme: alien 100×96, ship 100×92 ---------- */
export function drawAlienGlyph(ctx, cx, cy, w, h, variant, t) {
  const color = variant === 1 ? C.iris : C.accent;
  const floatY = Math.sin(t / 450 + cx) * 3;
  ctx.save();
  ctx.translate(cx - w / 2, cy + floatY);

  // soft glow: radial sprite cached per color — no blur calls per frame,
  // no hard ellipse edge (the visible-circle complaint, fixed properly)
  const glowKey = "glow" + (variant === 1 ? "I" : "C");
  drawAlienGlyph[glowKey] ??= (() => {
    const c = document.createElement("canvas");
    const g = w * 2.1;
    c.width = g; c.height = g;
    const gc = c.getContext("2d");
    const rg = gc.createRadialGradient(g / 2, g / 2, 0, g / 2, g / 2, g / 2);
    rg.addColorStop(0, color + "cc");
    rg.addColorStop(1, color + "00");
    gc.fillStyle = rg;
    gc.fillRect(0, 0, g, g);
    return c;
  })();
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.drawImage(drawAlienGlyph[glowKey], w / 2 - w * 1.05, h / 2 - w * 1.05, w * 2.1, w * 2.1);
  ctx.restore();

  ctx.scale(w / 100, h / 96);
  ctx.lineCap = "round";
  // antennae
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(38, 24); ctx.quadraticCurveTo(34, 8, 30, 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(62, 24); ctx.quadraticCurveTo(66, 8, 70, 5); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(30, 5, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(70, 5, 4.2, 0, Math.PI * 2); ctx.fill();
  // dome body with legs
  ctx.beginPath();
  ctx.moveTo(16, 62);
  ctx.quadraticCurveTo(16, 26, 50, 26);
  ctx.quadraticCurveTo(84, 26, 84, 62);
  ctx.lineTo(74, 62); ctx.lineTo(74, 78); ctx.lineTo(60, 78);
  ctx.lineTo(60, 62); ctx.lineTo(40, 62); ctx.lineTo(40, 78);
  ctx.lineTo(26, 78); ctx.lineTo(26, 62);
  ctx.closePath();
  ctx.fill();
  // belly shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath(); ctx.moveTo(30, 62); ctx.quadraticCurveTo(50, 72, 70, 62); ctx.closePath(); ctx.fill();
  // eyes
  ctx.fillStyle = C.bgDeep;
  ctx.beginPath(); ctx.arc(38, 48, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(62, 48, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(40, 46, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(64, 46, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawShipGlyph(ctx, cx, cy, w, h, t) {
  ctx.save();
  ctx.translate(cx - w / 2, cy);
  ctx.scale(w / 100, h / 92);
  // body — a pure dart: triangle + spine flame + cockpit, nothing else.
  // The side fins are gone by design decision: the arrow reads cleaner.
  ctx.fillStyle = C.flare;
  ctx.beginPath();
  ctx.moveTo(50, 6); ctx.lineTo(72, 62);
  ctx.quadraticCurveTo(50, 52, 28, 62);
  ctx.closePath(); ctx.fill();  // thruster — one spine engine, made alive: length pulses (two detuned
  // sines so it never loops visibly) + a white-hot core inside the gold
  // flame. One tail reads right on this dart silhouette; twin flames
  // would float unsupported between the small fins.
  const pulse = 0.5 + Math.sin(t / 60) * 0.28 + Math.sin(t / 137) * 0.22;
  const flame = (scaleY, color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(41, 62);
    ctx.quadraticCurveTo(50, 62 + 22 * scaleY, 59, 62);
    ctx.closePath();
    ctx.fill();
  };
  flame(0.6 + pulse * 0.65, C.flareDeep, 0.85); // outer ember
  flame(0.45 + pulse * 0.5, C.gold, 0.9); // gold body
  flame(0.22 + pulse * 0.3, "#ffffff", 0.85); // white-hot core
  ctx.globalAlpha = 1;
  // cockpit
  ctx.fillStyle = C.accent;
  ctx.beginPath(); ctx.arc(50, 42, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath(); ctx.arc(50, 42, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ---------- game ---------- */
/* localStorage throws inside sandboxed embeds (opaque origin) — best-score
 * persistence must never be able to crash the boot. Same guard as sawstorm. */
const SafeStore = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};

defineGame(({ stage, input, loop, finish }) => {
  /* HUD bindings */
  const scoreEl = document.querySelector("[data-block-score]");
  const heartsEl = document.querySelector("[data-block-hearts]");
  const gateEl = document.querySelector("[data-block-gate]");
  const ctaEl = document.querySelector("[data-block-cta]");
  const overEl = document.querySelector("[data-block-gameover]");
  const finalEl = document.querySelector("[data-block-final]");
  const bestEl = document.querySelector("[data-block-best]");
  const retryEl = document.querySelector("[data-block-retry]");
  const keyboardEl = document.querySelector("[data-block-keyboard]");


  /* state */
  let phase = "ready"; // ready → playing → over
  let score = 0;
  let combo = 0;
  let lives = TUNE.maxLives;
  let kills = 0;
  let best = Number(SafeStore.get("typefall-best") ?? "0");
  const aliens = [];
  const bursts = [];
  const popups = [];
  const lasers = [];
  let target = null;
  let shakeUntil = 0;
  let flashUntil = 0;
  let spawnTimer = 0.8;
  const rng = { s: 1234 };
  const rand = () => {
    rng.s = (rng.s * 1664525 + 1013904223) >>> 0;
    return rng.s / 4294967296;
  };
  const now = () => performance.now();
  let shipX = 0;
  let t0 = now();
  /* last-seen play geometry — resize remaps the field (below) */
  let fieldLPrev = -1;
  let fieldWPrev = -1;

  /* the field bottom (keyboard up = smaller field). Lerp in update()
   * for the AnimatedSize feel of the source game. */
  let fieldBottom = 0;
  const layout = () => {
    const kb = keyboardEl?.offsetHeight ?? 0;
    const bottom = Math.max(kb, 64);
    return {
      loseY: fieldBottom - 100,
      shipY: fieldBottom - TUNE.shipH - 18,
      fieldW: stage.play.width,
      fieldL: stage.play.left,
    };
  };

  const setScore = () => {
    if (scoreEl) scoreEl.textContent = String(score);
  };
  const setHearts = () => {
    if (!heartsEl) return;
    heartsEl.dataset.value = String(lives);
    [...heartsEl.querySelectorAll(".block-hearts-row__heart")].forEach((h, i) => {
      if (i < lives) h.removeAttribute("aria-hidden");
      else h.setAttribute("aria-hidden", "true");
    });
  };

  const spawnAlien = () => {
    const word = pickWord(kills, rand);
    const { fieldW, fieldL } = layout();
    const span = Math.max(20, fieldW - TUNE.spawnMargin * 2);
    let x = fieldL + TUNE.spawnMargin + rand() * span;
    const tops = aliens.filter((a) => a.y < 130);
    for (let tries = 0; tries < 14; tries++) {
      if (tops.every((a) => Math.abs(a.x - x) > TUNE.spawnMinDist)) break;
      x = fieldL + TUNE.spawnMargin + rand() * span;
    }
    aliens.push({
      word,
      typed: 0,
      x,
      y: -84,
      variant: rand() < 0.5 ? 0 : 1,
      speed: Math.min(TUNE.alienSpeedMax, TUNE.alienSpeedBase + kills * TUNE.alienSpeedGrowth),
      born: now(),
      shakeUntil: 0,
    });
  };

  const killAlien = (a) => {
    const idx = aliens.indexOf(a);
    if (idx >= 0) aliens.splice(idx, 1);
    combo += 1;
    const gained = (TUNE.scoreBase + a.word.length * TUNE.scorePerLetter) * combo;
    score += gained;
    kills += 1;
    if (combo >= 2) Sfx.combo(Math.min(combo, 10));
    Sfx.kill();
    const burstY = a.y + TUNE.glyphH + 20;
    bursts.push({ x: a.x, y: burstY, born: now(), color: a.variant === 1 ? C.iris : C.accent });
    popups.push({ x: a.x, y: burstY, born: now(), text: `+${gained}${combo > 1 ? ` ×${combo}` : ""}` });
    lasers.push({ fromX: shipX, fromY: layout().shipY - 20, toX: a.x, toY: a.y + TUNE.glyphH + 4, born: now() });
    if (target === a) target = null;
    setScore();
    spawnTimer = Math.max(TUNE.spawnIntervalMin, TUNE.spawnIntervalBase - kills * TUNE.spawnIntervalShrink);
  };

  const loseLife = (a) => {
    if (phase !== "playing") return;
    const idx = aliens.indexOf(a);
    if (idx >= 0) aliens.splice(idx, 1);
    if (target === a) target = null;
    lives -= 1;
    combo = 0;
    Sfx.hurt();
    const t = now();
    shakeUntil = t + 100;
    flashUntil = t + TUNE.flashDuration;
    // the ship takes the hit — EXACTLY the alien's explosion effect
    // (one expanding ring), in the ship's own flare: same language, no red glow
    bursts.push({ x: shipX, y: L0().shipY + TUNE.shipH / 2, born: t, color: C.flare });
    setHearts();
    if (lives <= 0) {
      phase = "over";
      aliens.length = 0;
      target = null;
      Sfx.over();
      if (score > best) overEl?.toggleAttribute("data-new-best", true);
      best = Math.max(best, score);
      SafeStore.set("typefall-best", String(best));
      if (overEl) overEl.toggleAttribute("data-open", true);
      if (finalEl) finalEl.textContent = String(score);
      if (bestEl) bestEl.textContent = String(best);
      keyboardEl?.removeAttribute("data-open");
      finish(score);
    }
  };

  const startRun = () => {
    if (phase !== "ready") return;
    phase = "playing";
    gateEl?.setAttribute("data-hidden", "");
    setTimeout(() => gateEl?.style.setProperty("display", "none"), 300);
    document.body.removeAttribute("data-ready"); // HUD corners fade in
    keyboardEl?.toggleAttribute("data-open", true); // touch devices only (CSS)
  };

  /* the mechanic: keystrokes are the whole game. Lock-on = first letter
   * matches a falling word (closest to the line wins); letters lock in
   * flare; the finished word detonates. */
  input.on("key", (k) => {
    if (k.dir !== "down") return;
    Sfx.init();
    if (k.code === "Backspace") {
      if (target) target = null; // drop the lock, pick a new word freely
      return;
    }
    if (k.key.length !== 1) return;
    const ch = k.key.toLowerCase();
    if (ch < "a" || ch > "z") return;
    if (phase === "ready") startRun();
    if (phase !== "playing") return;

    if (!target) {
      const cands = aliens.filter((a) => a.word[0] === ch);
      if (cands.length === 0) {
        Sfx.wrong();
        return;
      }
      target = cands.reduce((low, a) => (a.y > low.y ? a : low)); // most urgent
    }
    if (target.word[target.typed] === ch) {
      target.typed += 1;
      Sfx.tick();
      if (target.typed >= target.word.length) killAlien(target);
    } else {
      Sfx.wrong();
      if (target) target.shakeUntil = now() + 140;
    }
  });

  ctaEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    Sfx.init();
    if (phase === "ready") {
      Sfx.combo(1);
      startRun();
    }
  });

  input.on("down", () => {
    Sfx.init();
    if (phase === "ready") startRun(); // taps start too — retry restarts are tap-only
  });

  /* retry — reload keeps best (localStorage) and rematerializes clean */
  retryEl?.addEventListener("click", () => {
    if (phase !== "over") return;
    location.reload();
  });

  const L0 = () => layout();
  loop.update = (dt) => {
    const t = now();
    if (fieldBottom === 0) fieldBottom = stage.height;
    /* the keyboard's TRUE top edge — the tray is not flush to the
     * viewport bottom (gap + safe-area live below it), so height-minus-
     * offsetHeight math buried the ship behind the top key row on
     * notch phones. Hidden keyboard → plain 64px floor margin. */
    const wantBottom =
      keyboardEl && keyboardEl.offsetHeight > 0
        ? keyboardEl.getBoundingClientRect().top
        : stage.height - 64;
    fieldBottom += (wantBottom - fieldBottom) * Math.min(1, dt * 8);
    const L = layout();
    if (shipX === 0) shipX = stage.play.center;

    /* viewport-resize remap: alien x is stored absolute, but stage
     * geometry is live (free-size desktop windows, rotation, the iOS
     * keyboard shifting the column) — when the play column moves,
     * re-derive every x from its normalized position so the field keeps
     * its spread instead of spilling outside the column */
    if (L.fieldL !== fieldLPrev || L.fieldW !== fieldWPrev) {
      if (fieldWPrev > 0) {
        const spanPrev = Math.max(20, fieldWPrev - TUNE.spawnMargin * 2);
        const spanNow = Math.max(20, L.fieldW - TUNE.spawnMargin * 2);
        for (const a of aliens) {
          const nx = Math.min(1, Math.max(0, (a.x - fieldLPrev - TUNE.spawnMargin) / spanPrev));
          a.x = L.fieldL + TUNE.spawnMargin + nx * spanNow;
        }
      }
      fieldLPrev = L.fieldL;
      fieldWPrev = L.fieldW;
    }

    if (phase === "playing") {
      spawnTimer -= dt;
      if (spawnTimer <= 0 && aliens.length < TUNE.maxAliens) {
        spawnAlien();
        spawnTimer = Math.max(TUNE.spawnIntervalMin, TUNE.spawnIntervalBase - kills * TUNE.spawnIntervalShrink);
      }
    }

    for (const a of aliens) {
      a.y += a.speed * dt;
      if (a.y + TUNE.glyphH >= L.loseY) loseLife(a);
    }

    // ship parks at the column center — the source never moves it;
    // only the lasers travel (fieldW/2 in the original)
    shipX += (stage.play.center - shipX) * Math.min(1, dt * 8);

    for (let i = bursts.length - 1; i >= 0; i--) if (t - bursts[i].born > TUNE.burstLife) bursts.splice(i, 1);
    for (let i = popups.length - 1; i >= 0; i--) if (t - popups[i].born > TUNE.popupLife) popups.splice(i, 1);
    for (let i = lasers.length - 1; i >= 0; i--) if (t - lasers[i].born > TUNE.laserLife) lasers.splice(i, 1);
  };

  loop.render = (ctx) => {
    const t = now() - t0;
    const W = stage.width;
    const H = stage.height;
    const L = layout();

    /* sky — vertical gradient + two nebulas (cached per resize via stage) */
    if (!loop.__sky || loop.__skyW !== W || loop.__skyH !== H) {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, C.bgDeep);
      sky.addColorStop(0.5, C.skyMid);
      sky.addColorStop(1, C.bgDeep);
      const nebC = ctx.createRadialGradient(W * 0.12, H * 0.2, 0, W * 0.12, H * 0.2, W * 0.5);
      nebC.addColorStop(0, C.nebulaCyan);
      nebC.addColorStop(1, "rgba(31,182,201,0)");
      const nebI = ctx.createRadialGradient(W * 0.88, H * 0.82, 0, W * 0.88, H * 0.82, W * 0.55);
      nebI.addColorStop(0, C.nebulaIris);
      nebI.addColorStop(1, "rgba(123,77,219,0)");
      loop.__sky = { sky, nebC, nebI };
      loop.__skyW = W;
      loop.__skyH = H;
    }
    ctx.fillStyle = loop.__sky.sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = loop.__sky.nebC;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = loop.__sky.nebI;
    ctx.fillRect(0, 0, W, H);

    /* focus field: the play column is the world; everything outside
     * dims and the hairline edges mark where gameplay lives */
    ctx.fillStyle = "rgba(3, 4, 14, 0.55)";
    ctx.fillRect(0, 0, stage.play.left, H);
    ctx.fillRect(stage.play.right, 0, W - stage.play.right, H);
    ctx.strokeStyle = "rgba(245, 242, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(stage.play.left + 0.5, 0);
    ctx.lineTo(stage.play.left + 0.5, H);
    ctx.moveTo(stage.play.right - 0.5, 0);
    ctx.lineTo(stage.play.right - 0.5, H);
    ctx.stroke();

    /* parallax stars — 3 layers, scrolling down, seamless wrap */
    for (const layer of STARS) {
      const off = ((t / 1000) * layer.speed) % H;
      ctx.fillStyle = layer.color;
      for (const s of layer.list) {
        const y = (s.fy * H + off) % H;
        ctx.globalAlpha = s.a;
        ctx.beginPath();
        ctx.arc(stage.play.left + s.fx * stage.play.width, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    /* screen shake on a lost life */
    const shake = t < shakeUntil - t0 ? Math.sin(now() / 22) * 4 : 0;
    ctx.save();
    if (shake !== 0) ctx.translate(shake, shake * 0.5);

    /* bursts (rings) */
    for (const b of bursts) {
      const age = now() - b.born;
      const scale = 1 + age / 90;
      const opacity = Math.max(0, 1 - age / TUNE.burstLife);
      const r = 18 * scale;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = opacity;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = opacity * 0.2;
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* aliens + word chips */
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const a of aliens) {
      drawAlienGlyph(ctx, a.x, a.y, TUNE.glyphW, TUNE.glyphH, a.variant, t + a.born);
      const chipY = a.y + TUNE.glyphH + 4;
      const isTarget = target === a;
      const shiver = now() < a.shakeUntil ? Math.sin(now() / 14) * 3 : 0;
      ctx.font = `700 15px "Space Grotesk", system-ui, sans-serif`;
      const wordW = ctx.measureText(a.word.toUpperCase()).width + 24;
      const chipH = 30;
      // chip
      ctx.fillStyle = C.chip;
      ctx.beginPath();
      ctx.roundRect(a.x - wordW / 2 + shiver, chipY, wordW, chipH, 16);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = isTarget ? C.flare : "rgba(255,255,255,0.15)";
      if (isTarget) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = C.flare;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(a.x - wordW / 2 + shiver, chipY, wordW, chipH, 16);
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = isTarget ? C.flare : "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(a.x - wordW / 2 + shiver, chipY, wordW, chipH, 16);
      ctx.stroke();
      // letters — typed lock in flare, rest in ink
      ctx.font = `400 13px "Space Mono", ui-monospace, monospace`;
      const chars = a.word.toUpperCase().split("");
      const cw = ctx.measureText("M").width;
      const startX = a.x - ((chars.length - 1) * (cw + 2)) / 2 + shiver;
      chars.forEach((chr, i) => {
        ctx.fillStyle = i < a.typed ? C.flare : C.fg;
        ctx.fillText(chr, startX + i * (cw + 2), chipY + chipH / 2 + 1);
      });
    }

    /* lasers — flare core with white-hot center */
    for (const s of lasers) {
      const age = now() - s.born;
      const opacity = Math.max(0, 1 - age / TUNE.laserLife);
      const dx = s.toX - s.fromX;
      const dy = s.toY - s.fromY;
      const angle = Math.atan2(dy, dx);
      const len = Math.hypot(dx, dy);
      ctx.save();
      ctx.translate(s.fromX, s.fromY);
      ctx.rotate(angle);
      ctx.globalAlpha = opacity * 0.45;
      ctx.fillStyle = C.flare;
      ctx.fillRect(0, -5, len, 10);
      ctx.globalAlpha = opacity * 0.8;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, -0.5, len, 1);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* ship */
    drawShipGlyph(ctx, shipX, L.shipY, TUNE.shipW, TUNE.shipH, now());

    /* score popups */
    ctx.font = `700 16px "Space Mono", ui-monospace, monospace`;
    for (const p of popups) {
      const age = now() - p.born;
      const opacity = Math.max(0, 1 - age / TUNE.popupLife);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = C.gold;
      ctx.fillText(p.text, p.x, p.y - 30 - age * 0.05);
      ctx.globalAlpha = 1;
    }
    ctx.restore(); // shake

    /* rose damage flash, full screen, subtle */
    if (now() < flashUntil) {
      const a = ((flashUntil - now()) / TUNE.flashDuration) * 0.1;
      ctx.fillStyle = C.rose;
      ctx.globalAlpha = a;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  };

  /* initial HUD state — keyboard stays closed: the source shows it only
   * while playing (startRun opens it; over/pause collapses it) */
  setScore();
  setHearts();
  stage.refresh();
  shipX = stage.play.center;
});
