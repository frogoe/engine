// frogoe contract v0.1.0 (materialized by frogoe init — do not edit)
/**
 * Materialized contract for this example (frogoe.json pins 0.1.0).
 * Normally frogoe init regenerates .frogoe/ — committed here so the
 * example runs standalone before the CLI exists. Do not edit.
 */

/**
 * frogoe contract — the whole platform. ~180 lines. Zero taste.
 *
 * A game is one closure. The platform hands it four nouns:
 *   stage  — where: size, safe-area insets, capped play column, ctx
 *   input  — action: unified pointer (touch+mouse), cancel/blur safe
 *   loop   — life: fill loop.update(dt) and loop.render(ctx)
 *   finish — end: report the run's score to the host
 *
 * Everything visible (HUD, menus, art) lives in the game + recipe blocks.
 * The platform publishes window.__frogoe so a host (feed/shell) can
 * pause/resume/mute the game without the game's cooperation.
 */

const BOOT_ERRORS = {
  canvas: 'frogoe: missing <canvas id="c"> — the contract boots on that exact element',
  update:
    "frogoe: game has no loop.update — fill it inside the closure you pass to defineGame: loop.update = (dt) => {...}  (60 Hz steps, dt in seconds)",
  render:
    "frogoe: game has no loop.render — fill it inside the closure you pass to defineGame: loop.render = (ctx) => {...}",
};

const cssLength = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const defineGame = (game) => {
  const boot = () => {
    const canvas = document.querySelector("#c");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError(BOOT_ERRORS.canvas);
    }
    const runtime = createRuntime(game, canvas);
    runtime.start();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
};

const createRuntime = (game, canvas) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(BOOT_ERRORS.canvas);
  }

  // stage — measured truth: viewport, notch insets, capped play column
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);" +
    "left:env(safe-area-inset-left);right:env(safe-area-inset-right);" +
    "visibility:hidden;pointer-events:none;";
  document.body.append(probe);
  const safe = { bottom: 0, left: 0, right: 0, top: 0 };
  const readInsets = () => {
    const cs = getComputedStyle(probe);
    safe.top = cssLength(cs.top);
    safe.bottom = cssLength(cs.bottom);
    safe.left = cssLength(cs.left);
    safe.right = cssLength(cs.right);
  };
  const play = { center: 0, left: 0, right: 0, width: 0 };
  const stage = {
    ctx,
    height: 0,
    play,
    refresh: () => {
      readInsets();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      stage.width = window.innerWidth;
      stage.height = window.innerHeight;
      canvas.width = Math.round(stage.width * dpr);
      canvas.height = Math.round(stage.height * dpr);
      canvas.style.width = `${stage.width}px`;
      canvas.style.height = `${stage.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = Math.min(stage.width, 460);
      play.center = stage.width / 2;
      play.left = (stage.width - width) / 2;
      play.right = (stage.width + width) / 2;
      play.width = width;
    },
    safe,
    width: 0,
  };

  // input — unified pointer. dx/dy are anchor-relative (since touch-down):
  // steer with `x = grabX + p.dx` or track your own lastX. Never `x += p.dx`.
  const pointer = { down: false, dx: 0, dy: 0, x: 0, y: 0 };
  const handlers = { down: [], drag: [], up: [] };
  let anchorX = 0;
  let anchorY = 0;
  const input = {
    on(event, handler) {
      if (handlers[event]) {
        handlers[event].push(handler);
      }
    },
    pointer,
  };
  const fire = (event) => {
    for (const handler of handlers[event] ?? []) {
      handler(pointer);
    }
  };
  const setPointer = (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.dx = pointer.x - anchorX;
    pointer.dy = pointer.y - anchorY;
  };
  const onDown = (event) => {
    event.preventDefault();
    pointer.down = true;
    anchorX = event.clientX;
    anchorY = event.clientY;
    setPointer(event);
    fire("down");
  };
  const onMove = (event) => {
    if (!pointer.down) {
      return;
    }
    event.preventDefault();
    setPointer(event);
    fire("drag");
  };
  const onUp = () => {
    pointer.down = false;
    fire("up");
  };
  window.addEventListener("pointerdown", onDown, { passive: false });
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp, { passive: false });
  window.addEventListener("pointercancel", onUp, { passive: false });

  // loop — fixed 60 Hz steps, clamped; render every rAF; pauses on hide/blur
  const loop = {};
  let paused = false;
  let accumulator = 0;
  let last = performance.now();
  const STEP = 1000 / 60;
  const frame = (now) => {
    if (!paused) {
      accumulator += Math.min(now - last, STEP * 4);
      last = now;
      while (accumulator >= STEP) {
        loop.update?.(STEP / 1000);
        accumulator -= STEP;
      }
      loop.render?.(ctx);
    } else {
      last = now;
    }
    requestAnimationFrame(frame);
  };

  // finish — tell any host the run ended. Reporting only: the game-over
  // SCREEN is a recipe block (hud-game-over-card), never drawn here. Hosts
  // listen through the standard DOM event — each host brings its own adapter
  // (RN WebView, iframe parent, feed shell); the contract stays host-blind.
  let finished = false;
  const finish = (score) => {
    if (finished) {
      return;
    }
    finished = true;
    api.state = "over";
    document.dispatchEvent(
      new CustomEvent("frogoe:finish", {
        detail: { score: Number(score) || 0 },
      }),
    );
  };

  // __frogoe — the host's handle. Published by the platform, guaranteed
  // by construction; game code never touches it. Mute is a broadcast event
  // ("frogoe:mute") so the game's audio layer can follow without polling.
  const api = {
    mute(state) {
      api.muted = state === true;
      document.dispatchEvent(new CustomEvent("frogoe:mute", { detail: { muted: api.muted } }));
    },
    muted: false,
    pause() {
      paused = true;
      api.state = "paused";
    },
    resume() {
      paused = false;
      last = performance.now();
      api.state = "playing";
    },
    state: "loading",
    version: "0.1.0",
  };
  window.__frogoe = api;
  let autoPaused = false;
  const autoPause = () => {
    if (document.hidden && !paused) {
      autoPaused = true;
      api.pause();
    } else if (!document.hidden && autoPaused) {
      autoPaused = false;
      api.resume();
    }
  };
  document.addEventListener("visibilitychange", autoPause);
  window.addEventListener("blur", () => {
    onUp();
    autoPause();
  });

  return {
    start: () => {
      stage.refresh();
      window.addEventListener("resize", stage.refresh);
      game({ finish, input, loop, stage });
      if (!loop.update) {
        throw new TypeError(BOOT_ERRORS.update);
      }
      if (!loop.render) {
        throw new TypeError(BOOT_ERRORS.render);
      }
      api.state = "playing";
      paused = false;
      last = performance.now();
      requestAnimationFrame(frame);
    },
  };
};

export { defineGame };
