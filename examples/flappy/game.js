/** Ember Glide — frogoe reference game (verb: tap).
 *  Flappy Bird-quality: pixel-accurate palette (#543847 universal outline,
 *  #4EC0CA sky, stepped pipe gradients, diagonal grass), velocity rotation,
 *  continuous wing flap, death sequence, WebAudio SFX. */
import { defineGame } from "frogoe";

// ── canonical Flappy Bird palette (pixel-extracted) ────────────────────────

const C = {
  // universal outline — warm plum, not black, wraps EVERY foreground sprite
  outline: "#543847",
  // bird
  birdBody: "#F8B733",
  birdHighlight: "#FAD78C",
  birdBelly: "#E0802C",
  birdWing: "#FAFAFA",
  birdWingShade: "#D7E6CC",
  beak: "#FC3800",
  // pipes — stepped cylinder ramp (~10 tints, not flat bands)
  pipeRamp: [
    "#E4FD8B",
    "#DFF887",
    "#D2EC7D",
    "#C3E173",
    "#B5D468",
    "#98BA52",
    "#82A844",
    "#6F9736",
    "#5A8425",
  ],
  pipeShadow: "#558022",
  pipeRimLight: "#C0DD71",
  // ground
  grassLight: "#9CE659",
  grassMid: "#73BF2E",
  grassShadow: "#558022",
  dirtHighlight: "#E4FD8B",
  dirtLine: "#D7A84C",
  dirt: "#DED895",
  // background — flat colors, atmospheric perspective, NO outlines
  sky: "#4EC0CA",
  cloud: "#E9FCD9",
  city: "#D5F0C6",
  bush: "#5EE270",
  // score
  scoreFill: "#FFFFFF",
  scoreOutline: "#14181C",
};

// ── WebAudio synth ─────────────────────────────────────────────────────────

const Sfx = {
  ctx: null,
  init() {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* optional */
    }
  },
  tone(freq, dur, vol, type = "sine", slide = 0) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t0 = this.ctx.currentTime;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide > 0) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      else if (slide < 0) osc.frequency.exponentialRampToValueAtTime(Math.abs(slide), t0 + dur);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      /* silence */
    }
  },
  flap() {
    this.tone(350, 0.06, 0.15, "triangle", 600);
  },
  score(streak) {
    const base = 660 * 2 ** (Math.min(streak, 10) / 14);
    this.tone(base, 0.08, 0.22, "sine");
    setTimeout(() => this.tone(base * 1.3, 0.1, 0.18, "sine"), 50);
  },
  smack() {
    this.tone(180, 0.08, 0.4, "square", 60);
  },
  die() {
    this.tone(300, 0.4, 0.3, "sawtooth", 50);
    setTimeout(() => this.tone(200, 0.3, 0.2, "square", 30), 100);
  },
};

// ── game ───────────────────────────────────────────────────────────────────

defineGame(({ stage, input, loop, finish }) => {
  const T = {
    flap: -380,
    gap: 200,
    gravity: 1400,
    groundH: 80,
    maxFall: 600,
    pipeW: 52,
    r: 13,
    spacing: 230,
    speed: 150,
  };

  const P = { rot: 0, vy: 0, y: 0 };
  const pipes = [];
  const parts = [];
  let score = 0;
  let alive = true;
  let dying = false;
  let t = 0;
  let wingT = 0;
  let groundOff = 0;
  let shakeT = 0;

  // HUD bindings
  const scoreEl = document.querySelector("[data-block-score]");
  const card = document.querySelector("[data-block-gameover]");
  const subtitleEl = card.querySelector("[data-block-subtitle]");
  const finalEl = card.querySelector("[data-block-final]");
  const bestEl = card.querySelector("[data-block-best]");
  const retry = card.querySelector("[data-block-retry]");

  const BEST_KEY = "frogoe:best:flappy-chick";
  let best = 0;
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {}
  bestEl.textContent = String(best);

  const setScore = (n) => {
    score = n;
    scoreEl.textContent = String(n);
    scoreEl.setAttribute("data-bump", "");
    void scoreEl.offsetWidth;
  };

  P.y = stage.height * 0.4;

  const spawnPipe = (x) => {
    const minTop = stage.safe.top + 80;
    const maxTop = stage.height - T.groundH - T.gap - 100;
    pipes.push({
      gapY: minTop + Math.random() * Math.max(40, maxTop - minTop),
      passed: false,
      x,
    });
  };
  for (let i = 0; i < 4; i++) spawnPipe(stage.width + 40 + i * T.spacing);

  const burst = (x, y, col, n, pow = 1) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const v = (60 + Math.random() * 120) * pow;
      parts.push({
        age: 0,
        col,
        life: 0.3 + Math.random() * 0.3,
        r: 2 + Math.random() * 3,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        x,
        y,
      });
    }
  };

  const startDeath = () => {
    if (dying || !alive) return;
    dying = true;
    Sfx.smack();
    shakeT = 0.3;
    burst(stage.play.center, P.y, C.birdBody, 16);
    burst(stage.play.center, P.y, C.beak, 8);
    setTimeout(() => Sfx.die(), 150);
  };

  const endRun = () => {
    alive = false;
    finish(score);
    const isNew = score > best;
    if (isNew) {
      best = score;
      try {
        localStorage.setItem(BEST_KEY, String(best));
      } catch {}
    }
    finalEl.textContent = String(score);
    bestEl.textContent = String(best);
    subtitleEl.textContent = isNew ? "New Best!" : "Score";
    card.toggleAttribute("data-new-best", isNew);
    setTimeout(() => card.toggleAttribute("data-open", true), 300);
  };

  input.on("down", () => {
    Sfx.init();
    if (!alive || dying) return;
    P.vy = T.flap;
    wingT = 1;
    Sfx.flap();
  });
  retry.addEventListener("click", () => location.reload());

  const GROUND_Y = () => stage.height - T.groundH;

  loop.update = (dt) => {
    t += dt;
    wingT = Math.max(0, wingT - dt * 5);
    shakeT = Math.max(0, shakeT - dt);

    if (!alive) {
      stepParts(parts, dt);
      return;
    }
    if (!dying) groundOff = (groundOff + T.speed * dt) % 24;

    if (dying) {
      P.vy = Math.min(P.vy + 1200 * dt, 700);
      P.y += P.vy * dt;
      P.rot = Math.min(P.rot + 300 * dt, 90);
      stepParts(parts, dt);
      if (P.y >= GROUND_Y() - T.r) {
        P.y = GROUND_Y() - T.r;
        burst(stage.play.center, P.y + T.r, C.dirt, 8, 0.5);
        endRun();
      }
      return;
    }

    P.vy = Math.min(P.vy + T.gravity * dt, T.maxFall);
    P.y += P.vy * dt;

    const targetRot = P.vy < 0 ? -25 : Math.min(90, (P.vy / T.maxFall) * 95);
    P.rot += (targetRot - P.rot) * Math.min(1, 8 * dt);

    if (P.y < stage.safe.top + T.r) {
      P.y = stage.safe.top + T.r;
      P.vy = Math.max(P.vy, 0);
    }
    if (P.y > GROUND_Y() - T.r) {
      P.y = GROUND_Y() - T.r;
      startDeath();
      return;
    }

    for (const w of pipes) {
      w.x -= T.speed * dt;
      if (!w.passed && w.x + T.pipeW < stage.play.center - T.r) {
        w.passed = true;
        setScore(score + 1);
        Sfx.score(score);
      }
      if (
        Math.abs(stage.play.center - (w.x + T.pipeW / 2)) < T.pipeW / 2 + T.r &&
        (P.y - T.r < w.gapY || P.y + T.r > w.gapY + T.gap)
      ) {
        startDeath();
        return;
      }
    }
    // recycle: when first pipe exits left, respawn at last pipe + spacing
    // (ensures continuous coverage — no pop-in gaps)
    while (pipes.length > 0 && pipes[0].x < -T.pipeW - 10) {
      pipes.shift();
      const lastX = pipes.at(-1)?.x ?? stage.width;
      spawnPipe(lastX + T.spacing);
    }
    // top-up: if the rightmost pipe isn't far enough right, add more
    const rightmost = pipes.at(-1)?.x ?? 0;
    if (rightmost < stage.width + T.spacing) {
      spawnPipe(rightmost + T.spacing);
    }

    stepParts(parts, dt);
  };

  const stepParts = (parts, dt) => {
    for (const p of parts) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].age > parts[i].life) parts.splice(i, 1);
    }
  };

  // ── rendering: pixel-art faithful ────────────────────────────────────────

  const drawBackground = (ctx) => {
    // flat sky (one color, no gradient — Flappy Bird's sky IS flat)
    ctx.fillStyle = C.sky;
    ctx.fillRect(-4, -4, stage.width + 8, stage.height + 8);

    // cloud band: scalloped puffs, no outline (atmospheric perspective)
    const cloudY = stage.height - T.groundH - 140;
    ctx.fillStyle = C.cloud;
    ctx.beginPath();
    ctx.moveTo(0, cloudY + 30);
    for (let x = 0; x <= stage.width + 60; x += 60) {
      ctx.arc(x + 30, cloudY + 16, 22, Math.PI, 0);
      ctx.arc(x + 52, cloudY + 18, 16, Math.PI, 0);
      ctx.arc(x + 8, cloudY + 18, 14, Math.PI, 0);
    }
    ctx.lineTo(stage.width, cloudY + 30);
    ctx.closePath();
    ctx.fill();

    // city skyline: flat pale buildings, no outline
    ctx.fillStyle = C.city;
    const cityY = cloudY + 24;
    for (let x = 0; x <= stage.width; x += 40) {
      const h = 14 + ((x * 7) % 20);
      ctx.fillRect(x, cityY - h, 36, h + 40);
      // window dots
      ctx.fillStyle = "rgba(180,220,190,0.6)";
      ctx.fillRect(x + 8, cityY - h + 4, 3, 3);
      ctx.fillRect(x + 20, cityY - h + 4, 3, 3);
      ctx.fillRect(x + 14, cityY - h + 12, 3, 3);
      ctx.fillStyle = C.city;
    }

    // bush band: scalloped green bumps, no outline
    const bushY = cityY + 30;
    ctx.fillStyle = C.bush;
    ctx.beginPath();
    ctx.moveTo(0, bushY + 30);
    for (let x = 0; x <= stage.width + 40; x += 32) {
      ctx.arc(x + 16, bushY + 12, 14, Math.PI, 0);
    }
    ctx.lineTo(stage.width, bushY + 30);
    ctx.closePath();
    ctx.fill();
  };

  const drawPipe = (ctx, x, gapY) => {
    const w = T.pipeW;
    const capH = 22;
    const capOverhang = 3;
    const capW = w + capOverhang * 2;
    const cx = x - capOverhang;
    const gy = GROUND_Y();

    // stepped cylinder gradient (one shared fn for shaft + cap)
    const fillGradient = (fx, fw, fy, fh) => {
      const cols = C.pipeRamp;
      const steps = 14; // smooth ramp, not visible steps
      const peak = 0.35; // highlight peak position from left
      for (let i = 0; i < steps; i++) {
        const p = i / steps;
        let col;
        if (p < peak) {
          // highlight side: bright → mid
          const t = p / peak;
          col = cols[Math.floor(t * 2)];
        } else {
          // shadow side: mid → dark
          const t = (p - peak) / (1 - peak);
          col = cols[2 + Math.floor(t * (cols.length - 3))];
        }
        ctx.fillStyle = col;
        ctx.fillRect(fx + p * fw, fy, Math.ceil(fw / steps) + 1, fh);
      }
      // flat shadow (right ~20%)
      ctx.fillStyle = C.pipeShadow;
      ctx.fillRect(fx + fw * 0.82, fy, fw * 0.18, fh);
      // rim light (left inner edge — the signature glow line)
      ctx.fillStyle = C.pipeRimLight;
      ctx.fillRect(fx + 2, fy, 2, fh);
    };

    // ── top pipe (ceiling → gapY) ───────────────────────────────────
    // shaft
    fillGradient(x + 1, w - 2, 0, gapY - capH);
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, gapY - capH);
    ctx.moveTo(x + w, 0);
    ctx.lineTo(x + w, gapY - capH);
    ctx.stroke();
    // cap (drawn OVER shaft end — seamless join)
    fillGradient(cx + 1, capW - 2, gapY - capH, capH);
    ctx.strokeRect(cx, gapY - capH, capW, capH);
    // cap top rim (facing the gap — this is the "lip" the bird sees)
    ctx.fillStyle = C.pipeRimLight;
    ctx.fillRect(cx + 2, gapY - capH + 1, capW - 4, 2);

    // ── bottom pipe (gapY + gap → ground) ───────────────────────────
    // cap first (drawn over shaft start — seamless)
    fillGradient(cx + 1, capW - 2, gapY + T.gap, capH);
    ctx.strokeRect(cx, gapY + T.gap, capW, capH);
    // cap bottom rim
    ctx.fillStyle = C.pipeRimLight;
    ctx.fillRect(cx + 2, gapY + T.gap + capH - 3, capW - 4, 2);
    // shaft from below cap to ground
    fillGradient(x + 1, w - 2, gapY + T.gap + capH, gy - (gapY + T.gap + capH));
    ctx.beginPath();
    ctx.moveTo(x, gapY + T.gap + capH);
    ctx.lineTo(x, gy);
    ctx.moveTo(x + w, gapY + T.gap + capH);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  };

  const drawGround = (ctx) => {
    const gy = GROUND_Y();

    // outline line
    ctx.fillStyle = C.outline;
    ctx.fillRect(0, gy - 1, stage.width, 2);

    // grass: highlight line + diagonal striped body
    ctx.fillStyle = C.dirtHighlight;
    ctx.fillRect(0, gy + 1, stage.width, 2);

    // diagonal grass stripes (the Mario grass motif — 45° alternating)
    const grassH = 12;
    for (let x = -groundOff - 24; x < stage.width + 24; x += 12) {
      // alternate colors, shift for diagonal effect
      const isLight = Math.floor((x + groundOff) / 12) % 2 === 0;
      ctx.fillStyle = isLight ? C.grassLight : C.grassMid;
      // draw diagonal stripe
      ctx.beginPath();
      ctx.moveTo(x, gy + 3);
      ctx.lineTo(x + 12, gy + 3);
      ctx.lineTo(x + 12 - 4, gy + 3 + grassH);
      ctx.lineTo(x - 4, gy + 3 + grassH);
      ctx.closePath();
      ctx.fill();
    }

    // grass shadow line
    ctx.fillStyle = C.grassShadow;
    ctx.fillRect(0, gy + 3 + grassH, stage.width, 2);

    // dirt highlight line
    ctx.fillStyle = C.dirtLine;
    ctx.fillRect(0, gy + 5 + grassH, stage.width, 2);

    // dirt body (flat, no texture — Flappy Bird's dirt IS flat)
    ctx.fillStyle = C.dirt;
    ctx.fillRect(0, gy + 7 + grassH, stage.width, T.groundH - 7 - grassH);
  };

  const drawBird = (ctx) => {
    ctx.save();
    ctx.translate(stage.play.center, P.y);
    ctx.rotate((P.rot * Math.PI) / 180);
    const r = T.r;
    const o = C.outline;
    const lw = (2 * r) / 13;
    const wingPhase = dying ? 0 : wingT;

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = lw;

    const body = () => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.05 * r, 0.94 * r, 0, 0, 7);
    };
    const wing = () => {
      ctx.beginPath();
      ctx.moveTo(0.04 * r, 0.02 * r);
      ctx.bezierCurveTo(-0.4 * r, 0.08 * r, -0.46 * r, 0.48 * r, -0.08 * r, 0.74 * r);
      ctx.quadraticCurveTo(0.06 * r, 0.82 * r, 0.16 * r, 0.66 * r);
      ctx.bezierCurveTo(0.36 * r, 0.4 * r, 0.32 * r, 0.1 * r, 0.04 * r, 0.02 * r);
      ctx.closePath();
    };

    // body fill
    body();
    ctx.fillStyle = C.birdBody;
    ctx.fill();

    // interior shading (clipped)
    ctx.save();
    body();
    ctx.clip();
    // forehead highlight: crescent upper-left
    ctx.fillStyle = C.birdHighlight;
    ctx.beginPath();
    ctx.ellipse(-0.4 * r, -0.52 * r, 0.36 * r, 0.2 * r, -0.65, 0, 7);
    ctx.fill();
    // crown spot
    ctx.beginPath();
    ctx.ellipse(-0.02 * r, -0.78 * r, 0.1 * r, 0.06 * r, -0.3, 0, 7);
    ctx.fill();
    // belly: warm tan bottom
    ctx.fillStyle = C.birdBelly;
    ctx.beginPath();
    ctx.ellipse(0.12 * r, 0.72 * r, 0.74 * r, 0.52 * r, 0, 0, 7);
    ctx.fill();
    ctx.restore();

    // body outline
    ctx.strokeStyle = o;
    body();
    ctx.stroke();

    // wing (pivots at shoulder, swings up on flap)
    ctx.save();
    ctx.translate(-0.2 * r, -0.3 * r);
    ctx.rotate(dying ? 0.55 : 0.45 + 1.75 * wingPhase);
    wing();
    ctx.fillStyle = C.birdWing;
    ctx.fill();
    ctx.save();
    wing();
    ctx.clip();
    ctx.fillStyle = C.birdWingShade;
    ctx.beginPath();
    ctx.ellipse(-0.06 * r, 0.5 * r, 0.3 * r, 0.26 * r, 0.35, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = o;
    wing();
    ctx.stroke();
    ctx.restore();

    // beak: tiny chick cheep — short pointed triangles, bases tucked inside body
    ctx.fillStyle = C.beak;
    ctx.strokeStyle = o;
    // upper
    ctx.beginPath();
    ctx.moveTo(0.84 * r, -0.16 * r);
    ctx.lineTo(1.26 * r, -0.05 * r);
    ctx.lineTo(0.84 * r, 0.04 * r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // lower (gap = 0.09r)
    ctx.beginPath();
    ctx.moveTo(0.84 * r, 0.13 * r);
    ctx.lineTo(1.16 * r, 0.22 * r);
    ctx.lineTo(0.84 * r, 0.29 * r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // eye: big, expressive, upper-right
    ctx.beginPath();
    ctx.ellipse(0.44 * r, -0.34 * r, 0.32 * r, 0.36 * r, 0, 0, 7);
    ctx.fillStyle = "#FAFAFA";
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.stroke();

    if (dying) {
      // X eyes when dead
      const h = 0.12 * r;
      ctx.beginPath();
      ctx.moveTo(0.44 * r - h, -0.34 * r - h);
      ctx.lineTo(0.44 * r + h, -0.34 * r + h);
      ctx.moveTo(0.44 * r + h, -0.34 * r - h);
      ctx.lineTo(0.44 * r - h, -0.34 * r + h);
      ctx.stroke();
    } else {
      // pupil pushed toward beak + white glint
      ctx.beginPath();
      ctx.arc(0.55 * r, -0.33 * r, 0.15 * r, 0, 7);
      ctx.fillStyle = o;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.61 * r, -0.4 * r, 0.05 * r, 0, 7);
      ctx.fillStyle = "#FAFAFA";
      ctx.fill();
    }

    ctx.restore();
  };

  loop.render = (ctx) => {
    ctx.save();
    if (shakeT > 0) {
      const s = shakeT * 20;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    drawBackground(ctx);

    for (const w of pipes) drawPipe(ctx, w.x, w.gapY);

    drawGround(ctx);
    drawBird(ctx);

    // particles
    for (const p of parts) {
      const fade = 1 - p.age / p.life;
      const pr = p.r * (1 - (p.age / p.life) ** 2);
      if (pr < 0.3) continue;
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  };
});
