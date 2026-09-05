/** Sawstorm — a boxed arena. Jump over sawblades to blow them up for score.
 *  Loop modeled on "A Slight Chance of Sawblades" (Classic mode). */
import { defineGame } from "frogoe";

/* ---------- palette (from BRIEF.md) ---------- */
const C = {
  bg: "#1a1424",
  bgDeep: "#130e1d",
  bgDanger: "#2a0f16",
  fg: "#f2ecff",
  fgDim: "#c9bfe8",
  accent: "#ff3b3b",
  accentDark: "#a31717",
  ground: "#241b33",
  groundEdge: "#31234a",
  outline: "#120d1a",
  cloud: "#221936",
  cloudFar: "#1e162c",
};

/* ---------- tuning ---------- */
const TUNE = {
  runSpeed: 340,
  jumpV: -880,
  flipV: -800,
  gravity: 2500,
  sawCap: 14,      // pre-sudden-death arena cap
  saturateSecs: 5, // arena at cap this long without a clear → SUDDEN DEATH
  wallW: 10,
};

/* ---------- audio (frogoe-core audio.md recipe) ---------- */
const Sfx = {
  ctx: null,
  muted: false,
  deadSince: 0, // when we first saw the context stuck not-running
  init() {
    try {
      // iOS zombie context: resume() ignored forever after a bad first gesture.
      // If it has refused to run for >2s across gestures, kill it and build a
      // fresh one inside THIS gesture (Howler/Phaser ship the same escape hatch).
      if (this.ctx && this.ctx.state !== "running") {
        this.deadSince ||= performance.now();
        if (performance.now() - this.deadSince > 2000) {
          const old = this.ctx;
          this.ctx = null;
          this.deadSince = 0;
          old.close?.().catch(() => {});
        }
      } else {
        this.deadSince = 0;
      }
      this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "running") return;
      void this.ctx.resume(); // suspended + iOS "interrupted" — anything not "running"
      const src = this.ctx.createBufferSource(); // silent-buffer hard unlock
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {}
  },
  tone(type, f0, f1, dur, vol = 0.18, delay = 0) {
    if (this.muted) return;
    // a tone requested while not running is a repair attempt, not a drop
    if (!this.ctx || this.ctx.state !== "running") this.init();
    if (!this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + 0.08 + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch {}
  },
  jump() { this.tone("square", 220, 480, 0.09); },
  flip() { this.tone("square", 330, 720, 0.11); },
  land() { this.tone("sine", 130, 60, 0.07, 0.12); },
  death() { this.tone("sawtooth", 420, 50, 0.55, 0.24); },
  thud() { this.tone("sine", 90, 40, 0.12, 0.2); },
  explode() { this.tone("square", 200, 40, 0.16, 0.2); this.tone("sawtooth", 640, 80, 0.12, 0.1); },
  collect() { this.tone("square", 660, 660, 0.06, 0.16); this.tone("square", 990, 990, 0.08, 0.16, 0.07); }, // reserved: pickups if a mode needs them
  alarm() { this.tone("square", 110, 220, 0.3, 0.22); this.tone("square", 110, 220, 0.3, 0.22, 0.35); },
  bounce() { this.tone("square", 150, 90, 0.07, 0.12); },
  click() { this.tone("square", 1150, 950, 0.04, 0.09); },
};
document.addEventListener("frogoe:mute", (e) => { Sfx.muted = !!e.detail?.muted; });
for (const type of ["touchstart", "pointerup", "touchend", "click", "keydown"]) {
  document.addEventListener(type, () => Sfx.init(), { capture: true, passive: true });
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !Sfx.ctx) return;
  setTimeout(() => {
    try { void Sfx.ctx?.suspend(); void Sfx.ctx?.resume(); } catch {}
  }, 100);
});

/* ---------- helpers ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* localStorage throws inside sandboxed embeds (opaque origin) — best-score
 * persistence is a bonus, never a boot requirement */
const safeStore = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};

defineGame(({ stage, input, loop, finish }) => {
  /* ---------- HUD bindings ---------- */
  const scoreEl = document.querySelector("[data-block-score]");
  const readyEl = document.querySelector("[data-block-ready]");
  const overEl = document.querySelector("[data-block-gameover]");
  const finalEl = document.querySelector("[data-block-final]");
  const bestEl = document.querySelector("[data-block-best]");
  const retryEl = document.querySelector("[data-block-retry]");
  const suddenEl = document.querySelector("[data-block-sudden]");
  let best = +(safeStore.get("sawstorm.best") || 0);
  bestEl.textContent = best;

  /* ---------- state ---------- */
  let phase = "ready"; // ready | playing | dying | over
  let score = 0;
  let suddenDeath = false;
  let satT = 0; // seconds the arena has stayed saturated at the cap
  let t = 0; // elapsed

  const player = {
    x: 0, y: 0, vx: 0, vy: 0, w: 30, h: 44,
    grounded: true, flips: 0, spin: 0, squash: 1, face: 1, sidePrev: 0,
  };

  let saws = [];   // {x,y,vx,vy,r,rot,spin,cleared,sidePrev}
  let parts = [];
  let clouds = [], bgSaws = [];
  let shake = 0, shakeT = 0, flashT = 0, freezeT = 0;
  let rainT = 0;


  const groundY = () => stage.height - Math.max(stage.safe.bottom, 16) - 96;

  // boot pose: the actor must stand in the arena on the ready screen
  player.x = stage.play.center;
  player.y = groundY();
  const arenaL = () => stage.play.left + TUNE.wallW;
  const arenaR = () => stage.play.right - TUNE.wallW;

  function reset() {
    score = 0; suddenDeath = false; satT = 0; t = 0;
    player.x = stage.play.center;
    player.y = groundY();
    player.vx = 0; player.vy = 0; player.grounded = true;
    player.flips = 0; player.spin = 0; player.squash = 1; player.sidePrev = 0;
    saws = []; parts = [];
    shake = 0; flashT = 0; freezeT = 0;
    rainT = 0.8;
    scoreEl.textContent = "0";
    readyEl.toggleAttribute("data-hidden", true);
    overEl.toggleAttribute("data-open", false);
    suddenEl.toggleAttribute("data-on", false);
  }

  /* ambient world seeds */
  for (let i = 0; i < 6; i++) {
    clouds.push({ x: rand(0, 1), y: rand(0.04, 0.34), s: rand(0.6, 1.6), v: rand(0.006, 0.02) });
  }
  for (let i = 0; i < 10; i++) {
    bgSaws.push({ x: rand(0, 1), y: rand(0, 1), r: rand(3, 7), v: rand(0.05, 0.16), rot: rand(0, 7) });
  }

  /* ---------- verbs ---------- */
  function jump() {
    if (player.grounded) {
      player.vy = TUNE.jumpV; player.grounded = false; player.flips = 0;
      player.squash = 1.35; Sfx.jump(); puff(player.x, groundY(), 5, C.fgDim);
    } else if (player.flips < 1) {
      player.vy = TUNE.flipV; player.flips = 1; player.spin = 0;
      player.squash = 1.3; Sfx.flip(); puff(player.x, player.y + player.h / 2, 6, C.fgDim);
    }
  }

  function startIfReady() {
    if (phase === "ready") {
      reset(); phase = "playing";
      document.body.removeAttribute("data-ready"); // veil off, score + pad fade in
      return true;
    }
    return phase === "playing";
  }

  /* taps outside the pad do NOTHING by design — only the JUMP button / keyboard jump,
   * so an accidental screen touch can never move the character */
  input.on("down", () => { Sfx.init(); });
  input.on("up", () => Sfx.init());

  /* on-screen pad: hold to run, JUMP to jump.
   * Each button tracks its own pointerId AND clears on global up/cancel/blur —
   * a finger sliding off or a system interruption can never leave a stuck key. */
  const held = { l: false, r: false };
  function bindPress(btn, onDown, onUp) {
    let pid = null;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation(); // never leak into the canvas verb
      Sfx.init();
      pid = e.pointerId;
      try { btn.setPointerCapture(pid); } catch {}
      btn.toggleAttribute("data-held", true);
      onDown?.();
    };
    const up = (e) => {
      if (pid !== null && e && e.pointerId !== undefined && e.pointerId !== pid) return;
      pid = null;
      btn.toggleAttribute("data-held", false);
      onUp?.();
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", () => up());
    document.addEventListener("visibilitychange", () => { if (document.hidden) up(); });
    // iOS: kill the long-press loupe / selection callout at the source
    btn.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  const btnL = document.getElementById("btnL");
  const btnR = document.getElementById("btnR");
  const btnJ = document.getElementById("btnJ");
  bindPress(btnL, () => { Sfx.click(); held.l = true; startIfReady(); }, () => { held.l = false; });
  bindPress(btnR, () => { Sfx.click(); held.r = true; startIfReady(); }, () => { held.r = false; });
  bindPress(btnJ, () => { Sfx.click(); if (startIfReady()) jump(); });

  /* ready screen: the chunky PLAY button starts the run */
  document.querySelector("[data-block-play]")?.addEventListener("click", (e) => {
    e.stopPropagation();
    Sfx.init();
    if (startIfReady()) Sfx.jump();
  });

  /* keyboard: arrows/AD run, space/W/up jump */
  const keys = { l: false, r: false };
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    Sfx.init();
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.l = true;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.r = true;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (startIfReady()) jump();
    }
    if (phase === "ready" && (keys.l || keys.r)) startIfReady();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") keys.l = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") keys.r = false;
  });

  retryEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (phase !== "over") return;
    location.reload(); // best score survives in localStorage
  });

  /* ---------- spawning: saws drop with NO warning, then FLOAT in straight
   *  constant-speed diagonals, reflecting off every edge — no gravity, no decay ---------- */
  function spawnRainSaw() {
    if (!suddenDeath && saws.length >= 14) return; // arena breathes before chaos
    const r = 24; // uniform size — every saw reads the same
    const speed = rand(260, 400) * (suddenDeath ? 1.6 : 1); // floaty, not fast
    const ang = rand(Math.PI * 0.22, Math.PI * 0.78); // aimed downward from the sky
    saws.push({
      x: rand(arenaL() + r, arenaR() - r),
      y: -r,
      vx: Math.cos(ang) * speed,
      vy: Math.abs(Math.sin(ang)) * speed,
      r, rot: 0, spin: rand(8, 14), cleared: false, sidePrev: 0,
    });
  }
  const rainEvery = () => suddenDeath ? rand(0.22, 0.4)
    : Math.max(0.6, 1.5 - score * 0.03) * rand(0.75, 1.15);

  function puff(x, y, n, color = C.fg) {
    for (let i = 0; i < n; i++) {
      parts.push({
        x, y,
        vx: rand(-170, 170), vy: rand(-240, -40),
        life: rand(0.25, 0.55), age: 0,
        s: rand(2, 5), c: color,
      });
    }
  }

  function explodeSaw(s) {
    puff(s.x, s.y, 10, C.accent);
    puff(s.x, s.y, 6, C.fg);
    shake = Math.max(shake, 3); shakeT = 0.16;
    Sfx.explode();
    score++;
    scoreEl.textContent = score;
    scoreEl.removeAttribute("data-bump");
    void scoreEl.offsetWidth; // restart the bump animation
    scoreEl.setAttribute("data-bump", "");
  }

  function enterSuddenDeath() {
    suddenDeath = true;
    Sfx.alarm();
    flashT = 0.3;
    suddenEl.toggleAttribute("data-on", true);
    setTimeout(() => suddenEl.toggleAttribute("data-on", false), 2200);
  }

  function die() {
    phase = "dying";
    freezeT = 0.06;
    flashT = 0.22;
    shake = 8; shakeT = 0.3;
    Sfx.death();
    puff(player.x, player.y - player.h / 2, 18, C.accent);
    puff(player.x, player.y - player.h / 2, 8, C.fg);
    finish(score);
    setTimeout(() => {
      phase = "over";
      const isNew = score > best;
      if (isNew) { best = score; safeStore.set("sawstorm.best", best); }
      finalEl.textContent = score;
      bestEl.textContent = best;
      overEl.toggleAttribute("data-new-best", isNew);
      overEl.toggleAttribute("data-open", true);
    }, 550);
  }

  /* ---------- update ---------- */
  loop.update = (dt) => {
    if (freezeT > 0) { freezeT -= dt; return; }

    for (const c of clouds) { c.x += c.v * dt * (suddenDeath ? 3 : 1); if (c.x > 1.2) c.x = -0.2; }
    for (const s of bgSaws) {
      s.y += s.v * dt * (suddenDeath ? 3 : 1); s.rot += dt * 2;
      if (s.y > 1.05) { s.y = -0.05; s.x = rand(0, 1); }
    }

    if (phase === "playing") {
      t += dt;

      /* no timer: passivity itself summons the storm — if the arena stays
         saturated at the cap without a clear, the sky overflows */
      if (!suddenDeath) {
        if (saws.length >= TUNE.sawCap) {
          satT += dt;
          if (satT >= TUNE.saturateSecs) enterSuddenDeath();
        } else {
          satT = Math.max(0, satT - dt * 2); // clearing saws bleeds the pressure off
        }
      }

      rainT -= dt;
      if (rainT <= 0) { spawnRainSaw(); rainT = rainEvery(); }

      /* run: pad buttons + keyboard */
      const dir = (held.l || keys.l ? -1 : 0) + (held.r || keys.r ? 1 : 0);
      const target = dir * TUNE.runSpeed;
      player.vx += (target - player.vx) * Math.min(1, dt * 14);
      if (Math.abs(player.vx) < 4) player.vx = 0;
      else player.face = Math.sign(player.vx);
      const lo = arenaL() + player.w / 2, hi = arenaR() - player.w / 2;
      player.x += player.vx * dt;
      if (player.x <= lo || player.x >= hi) {
        player.x = clamp(player.x, lo, hi);
        if (!player.grounded && Math.abs(player.vx) > 120) {
          player.vx = -player.vx * 0.55; // wall bounce mid-air
          Sfx.bounce();
          puff(player.x, player.y - player.h / 2, 5, C.fgDim);
        } else {
          player.vx = 0;
        }
      }

      /* physics */
      if (!player.grounded) {
        player.vy += TUNE.gravity * dt;
        player.y += player.vy * dt;
        if (player.flips === 1) player.spin = Math.min(1, player.spin + dt * 2.4);
        if (player.y >= groundY()) {
          player.y = groundY();
          player.grounded = true; player.vy = 0; player.spin = 0;
          player.squash = 0.68;
          Sfx.land(); puff(player.x, groundY(), 4, C.fgDim);
        }
      }
      player.squash += (1 - player.squash) * Math.min(1, dt * 12);
    }

    /* saws: float in straight lines at constant speed, reflect off every edge */
    for (let i = saws.length - 1; i >= 0; i--) {
      const s = saws[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;

      /* walls: angle in = angle out, speed unchanged */
      if (s.x <= arenaL() + s.r) { s.x = arenaL() + s.r; s.vx = Math.abs(s.vx); s.spin = 11; }
      else if (s.x >= arenaR() - s.r) { s.x = arenaR() - s.r; s.vx = -Math.abs(s.vx); s.spin = -11; }

      /* floor */
      if (s.y >= groundY() - s.r) {
        s.y = groundY() - s.r;
        s.vy = -Math.abs(s.vy);
        if (Math.abs(s.vy) > 120) puff(s.x, groundY(), 4, C.cloud);
        // tiny jitter so paths never lock into a perfect loop
        s.vx += rand(-18, 18);
        if (Math.abs(s.vx) < 60) s.vx = 80 * (Math.random() < 0.5 ? -1 : 1);
      }

      /* ceiling */
      const topPad = Math.max(stage.safe.top, 16) + s.r;
      if (s.y < topPad) { s.y = topPad; s.vy = Math.abs(s.vy); }

      /* jump-over detection: player center crossed the saw center from
         either side while airborne and clear of it vertically */
      if (phase === "playing" && !s.cleared) {
        const side = Math.sign(player.x - s.x);
        if (s.sidePrev !== 0 && side !== 0 && side !== s.sidePrev
            && !player.grounded
            && player.y < s.y) { // feet above the saw's center at the crossing
          s.cleared = true;
          explodeSaw(s);
          saws.splice(i, 1);
          continue;
        }
        s.sidePrev = side;
      }

      /* sanity bounds (bounces should make this unreachable) */
      if (s.x < stage.play.left - 80 || s.x > stage.play.right + 80) saws.splice(i, 1);
    }

    /* collisions (forgiving inset) */
    if (phase === "playing") {
      const px = player.x - player.w / 2 + 5;
      const py = player.y - player.h + 4;
      const pw = player.w - 10, ph = player.h - 6;
      for (const s of saws) {
        const cx = clamp(s.x, px, px + pw);
        const cy = clamp(s.y, py, py + ph);
        const dx = s.x - cx, dy = s.y - cy;
        if (dx * dx + dy * dy < (s.r - 4) * (s.r - 4)) { die(); break; }
      }
    }

    /* particles */
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age > p.life) { parts.splice(i, 1); continue; }
      p.vy += 900 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }

    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shake = 0; }
    if (flashT > 0) flashT -= dt;
  };

  /* ---------- render ---------- */
  function drawSaw(ctx, s, silhouette = false) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    const r = s.r;
    ctx.fillStyle = silhouette ? C.cloud : C.accent;
    const teeth = 8;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
      const a2 = ((i + 1) / teeth) * Math.PI * 2;
      const R = r, r0 = r * 0.72;
      ctx.lineTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
      ctx.lineTo(Math.cos(a2) * r0, Math.sin(a2) * r0);
    }
    ctx.closePath();
    ctx.fill();
    if (!silhouette) {
      ctx.fillStyle = C.accentDark;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, 7);
      ctx.fill();
      ctx.fillStyle = C.outline;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.16, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(ctx) {
    const { x, y, w, h } = player;
    const sq = player.squash;
    const bw = w / sq, bh = h * sq;
    ctx.save();
    ctx.translate(x, y); // feet
    if (player.flips === 1 && !player.grounded) ctx.rotate(player.spin * Math.PI * 2 * player.face);
    ctx.translate(0, -bh / 2);
    ctx.fillStyle = C.fg;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = C.fgDim;
    ctx.fillRect(-bw / 2, bh / 2 - 4, bw, 4);
    ctx.fillStyle = C.outline;
    const ey = -bh / 2 + bh * 0.28;
    ctx.fillRect(-bw / 2 + 5 + player.face * 2, ey, 5, 7);
    ctx.fillRect(bw / 2 - 10 + player.face * 2, ey, 5, 7);
    if (player.grounded) {
      ctx.fillStyle = C.fg;
      ctx.fillRect(-bw / 2 + 2, bh / 2, 7, 4);
      ctx.fillRect(bw / 2 - 9, bh / 2, 7, 4);
    }
    ctx.restore();
  }

  loop.render = (ctx) => {
    /* outside the arena: same as the arena bg — the walls mark the box */
    ctx.fillStyle = suddenDeath ? C.bgDanger : C.bg;
    ctx.fillRect(0, 0, stage.width, stage.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(stage.play.left, 0, stage.play.width, stage.height);
    ctx.clip();

    ctx.fillStyle = suddenDeath ? C.bgDanger : C.bg;
    ctx.fillRect(stage.play.left, 0, stage.play.width, stage.height);
    ctx.fillStyle = C.bgDeep;
    ctx.fillRect(stage.play.left, 0, stage.play.width, stage.height * 0.18);

    for (const s of bgSaws) {
      drawSaw(ctx, { x: stage.play.left + s.x * stage.play.width, y: s.y * stage.height, r: s.r, rot: s.rot, spin: 0 }, true);
    }
    for (const c of clouds) {
      ctx.fillStyle = suddenDeath && c.s > 1.1 ? "#33121c" : (c.s > 1.1 ? C.cloud : C.cloudFar);
      const cx = stage.play.left + c.x * stage.play.width, cy = c.y * stage.height, s = c.s * 46;
      ctx.fillRect(cx - s, cy, s * 2, s * 0.42);
      ctx.fillRect(cx - s * 0.55, cy - s * 0.28, s * 1.1, s * 0.3);
    }

    ctx.save();
    if (shake > 0 && shakeT > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    const gy = groundY();

    /* arena ground */
    ctx.fillStyle = C.ground;
    ctx.fillRect(stage.play.left, gy, stage.play.width, stage.height - gy);
    ctx.fillStyle = C.groundEdge;
    ctx.fillRect(stage.play.left, gy, stage.play.width, 4);
    ctx.fillStyle = C.bgDeep;
    for (let gx = stage.play.left + 8; gx < stage.play.right; gx += 26) {
      ctx.fillRect(gx, gy + 12 + (gx % 3) * 8, 12, 4);
    }
    /* arena walls */
    ctx.fillStyle = C.ground;
    ctx.fillRect(stage.play.left, 0, TUNE.wallW, stage.height);
    ctx.fillRect(stage.play.right - TUNE.wallW, 0, TUNE.wallW, stage.height);
    ctx.fillStyle = C.groundEdge;
    ctx.fillRect(stage.play.left + TUNE.wallW - 4, 0, 4, stage.height);
    ctx.fillRect(stage.play.right - TUNE.wallW, 0, 4, stage.height);

    for (const s of saws) drawSaw(ctx, s);
    if (phase !== "over" && phase !== "dying") drawPlayer(ctx);
    if (phase === "dying") {
      ctx.globalAlpha = 0.6;
      drawPlayer(ctx);
      ctx.globalAlpha = 1;
    }

    for (const p of parts) {
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;

    ctx.restore(); // shake
    ctx.restore(); // arena clip — overlays below span the full screen

    if (flashT > 0) {
      ctx.globalAlpha = Math.min(0.5, flashT * 2.2);
      ctx.fillStyle = C.accent;
      ctx.fillRect(0, 0, stage.width, stage.height);
      ctx.globalAlpha = 1;
    }
    if (suddenDeath && phase === "playing") {
      ctx.globalAlpha = 0.06 + Math.sin(t * 6) * 0.03;
      ctx.fillStyle = C.accent;
      ctx.fillRect(0, 0, stage.width, stage.height);
      ctx.globalAlpha = 1;
    }
  };
});
