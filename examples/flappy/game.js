/**
 * Ember Glide — frogoe reference game (verb: tap).
 *
 * Demonstrates the whole stack in one file: the four-noun contract, DOM HUD
 * blocks bound to sim state, canvas world with palette from BRIEF.md, death
 * flow (freeze → burst → card → finish → retry).
 */
import { defineGame } from "frogoe";

const C = {
  bgTop: "#2b1b3d",
  bgBottom: "#160d24",
  pillar: "#4a3264",
  pillarLit: "#6d4b90",
  spark: "#ffedd8",
  ember: "#ff9e5e",
};

defineGame(({ stage, input, loop, finish }) => {
  // --- state (the closure IS the game — retry re-runs this whole file) ---
  const T = { flap: -430, gap: 205, gravity: 1500, r: 11, spacing: 250, speed: 165 };
  const P = { vy: 0, y: stage.height * 0.6 };
  const pillars = [];
  const parts = [];
  let score = 0;
  let alive = true;
  let t = 0;
  let shake = 0;
  let hitstopUntil = 0;

  // --- HUD bindings (vanilla — frogoe-core → hud-bindings) ---
  const scoreEl = document.querySelector("[data-hud-score]");
  const card = document.querySelector("[data-hud-gameover]");
  const subtitle = card.querySelector("[data-hud-subtitle]");
  const finalEl = card.querySelector("[data-hud-final]");
  const bestEl = card.querySelector("[data-hud-best]");
  const retry = card.querySelector("[data-hud-retry]");

  const BEST_KEY = "frogoe:best:ember-glide";
  const loadBest = () => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  };
  let best = loadBest();
  bestEl.textContent = String(best);

  const setScore = (n) => {
    score = n;
    scoreEl.textContent = String(n);
    scoreEl.setAttribute("data-bump", "");
    void scoreEl.offsetWidth; // restart the pop
  };

  const burst = (x, y, color, n) => {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * 6.28;
      const v = 60 + Math.random() * 140;
      parts.push({
        color,
        life: 0.5 + Math.random() * 0.3,
        t: 0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        x,
        y,
      });
    }
  };

  const spawnPillar = (x) => {
    const minTop = stage.safe.top + 90;
    const maxTop = stage.height - T.gap - stage.safe.bottom - 120;
    pillars.push({
      gapY: minTop + Math.random() * Math.max(40, maxTop - minTop),
      passed: false,
      x,
    });
  };
  for (let i = 0; i < 3; i += 1) {
    spawnPillar(stage.width + 60 + i * T.spacing);
  }

  const die = () => {
    alive = false;
    hitstopUntil = performance.now() + 60; // freeze-frame: impact reads
    shake = 8;
    burst(stage.play.center, P.y, C.ember, 26);
    finish(score);
    const isNewBest = score > best;
    if (isNewBest) {
      best = score;
      try {
        localStorage.setItem(BEST_KEY, String(best));
      } catch {
        // storage blocked — best lives for this session
      }
    }
    finalEl.textContent = String(score);
    bestEl.textContent = String(best);
    subtitle.textContent = isNewBest ? "New Best!" : "Score";
    card.toggleAttribute("data-new-best", isNewBest);
    setTimeout(() => {
      card.toggleAttribute("data-open", true); // arm the card after the freeze
    }, 400);
  };

  input.on("down", () => {
    if (!alive) {
      return; // the card's retry button owns taps after death
    }
    P.vy = T.flap;
    burst(stage.play.center - 8, P.y + 10, C.spark, 5);
  });
  retry.addEventListener("click", () => {
    location.reload(); // the closure re-runs: state reborn
  });

  // --- sim ---
  loop.update = (dt) => {
    t += dt;
    if (!alive) {
      for (const p of parts) {
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 400 * dt;
      }
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        if (parts[i].t > parts[i].life) {
          parts.splice(i, 1);
        }
      }
      shake = Math.max(0, shake - dt * 26);
      return;
    }

    P.vy = Math.min(P.vy + T.gravity * dt, 700);
    P.y += P.vy * dt;
    if (P.y < stage.safe.top + T.r || P.y > stage.height - T.r) {
      die();
      return;
    }

    for (const w of pillars) {
      w.x -= T.speed * dt;
      if (!w.passed && w.x + 30 < stage.play.center - T.r) {
        w.passed = true;
        setScore(score + 1);
      }
      if (
        Math.abs(stage.play.center - (w.x + 15)) < 15 + T.r &&
        (P.y - T.r < w.gapY || P.y + T.r > w.gapY + T.gap)
      ) {
        die();
        return;
      }
    }
    while (pillars.length > 0 && pillars[0].x < -60) {
      pillars.shift();
      spawnPillar((pillars.at(-1)?.x ?? stage.width) + T.spacing);
    }
  };

  // --- world (canvas: sim layer only — HUD lives in the DOM) ---
  loop.render = (ctx) => {
    const frozen = performance.now() < hitstopUntil;
    ctx.save();
    if (shake > 0 && !frozen) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    const g = ctx.createLinearGradient(0, 0, 0, stage.height);
    g.addColorStop(0, C.bgTop);
    g.addColorStop(1, C.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, stage.width + 20, stage.height + 20);

    // dawn haze — the world breathes even before the first tap
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 1.4);
    ctx.fillStyle = C.ember;
    ctx.beginPath();
    ctx.arc(stage.width * 0.5, stage.height * 1.15, stage.width * 0.75, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;

    for (const w of pillars) {
      ctx.fillStyle = C.pillar;
      ctx.fillRect(w.x, 0, 30, w.gapY);
      ctx.fillRect(w.x, w.gapY + T.gap, 30, stage.height - w.gapY - T.gap);
      ctx.fillStyle = C.pillarLit;
      ctx.fillRect(w.x, w.gapY - 8, 30, 8);
      ctx.fillRect(w.x, w.gapY + T.gap, 30, 8);
    }

    // ember trail
    ctx.fillStyle = "rgba(255,158,94,0.25)";
    for (let i = 1; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.arc(stage.play.center - P.vy * 0.012 * i, P.y + 2 * i, T.r - i * 2.5, 0, 7);
      ctx.fill();
    }

    // the spark
    ctx.shadowColor = C.ember;
    ctx.shadowBlur = 16;
    ctx.fillStyle = alive ? C.spark : "#8d8398";
    ctx.beginPath();
    ctx.arc(stage.play.center, P.y, T.r, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    for (const p of parts) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };
});
