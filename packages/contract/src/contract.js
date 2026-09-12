/**
 * frogoe contract — the whole platform. ~180 lines. Zero taste.
 *
 * A game is one closure. The platform hands it four nouns:
 *   stage  — where: size, safe-area insets, capped play column, ctx
 *   input  — action: unified multi-touch pointer + keyboard, cancel/blur safe
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

  // input — unified pointer (multi-touch) + keyboard, cancel/blur safe.
  // Pointer dx/dy are anchor-relative (since touch-down): steer with
  // `x = grabX + p.dx` or track your own lastX. Never `x += p.dx`.
  // Handlers receive a per-touch snapshot {x, y, dx, dy, down, id};
  // `input.pointer` mirrors the FIRST simultaneous touch — single-pointer
  // games poll it and never see the second finger. Keyboard edges arrive
  // via `input.on("key")` with OS auto-repeat suppressed; held state lives
  // in `input.keys` (Set of physical codes — layout-independent, e.g.
  // "KeyW"). Hover with no button down is `input.on("move")`.
  const pointer = { down: false, dx: 0, dy: 0, x: 0, y: 0 };
  const handlers = { down: [], drag: [], key: [], move: [], up: [] };
  const input = {
    keys: new Set(),
    on(event, handler) {
      if (!handlers[event]) {
        throw new TypeError(
          `frogoe: unknown input event "${String(event)}" — valid: ${Object.keys(handlers).join(", ")}`,
        );
      }
      handlers[event].push(handler);
    },
    pointer,
  };
  const fire = (event, record) => {
    for (const handler of handlers[event] ?? []) {
      handler(record);
    }
  };
  const touches = new Map(); // pointerId → { ax, ay, x, y } — private anchors
  let primaryId = null; // the first simultaneous touch owns `pointer`
  const idOf = (event) => (Number.isFinite(event.pointerId) ? event.pointerId : 0);
  const mirror = (id) => {
    const t = touches.get(id);
    if (t) {
      pointer.down = true;
      pointer.dx = t.x - t.ax;
      pointer.dy = t.y - t.ay;
      pointer.x = t.x;
      pointer.y = t.y;
    }
  };
  const onDown = (event) => {
    event.preventDefault();
    const id = idOf(event);
    touches.set(id, { ax: event.clientX, ay: event.clientY, x: event.clientX, y: event.clientY });
    if (primaryId === null) {
      primaryId = id;
    }
    mirror(primaryId);
    const t = touches.get(id);
    fire("down", { down: true, dx: 0, dy: 0, id, x: t.x, y: t.y });
  };
  const onMove = (event) => {
    const id = idOf(event);
    const t = touches.get(id);
    if (!t) {
      hoverMove(event);
      return; // hover never preventDefaults — pages may still scroll
    }
    event.preventDefault();
    t.x = event.clientX;
    t.y = event.clientY;
    if (primaryId !== null) {
      mirror(primaryId);
    }
    fire("drag", { down: true, dx: t.x - t.ax, dy: t.y - t.ay, id, x: t.x, y: t.y });
  };
  const onUp = (event) => {
    const id = idOf(event);
    const t = touches.get(id);
    if (!t) {
      return; // stray release without a press — nothing to report
    }
    touches.delete(id);
    fire("up", { down: false, dx: t.x - t.ax, dy: t.y - t.ay, id, x: t.x, y: t.y });
    if (primaryId === id) {
      primaryId = null;
      pointer.down = false;
    }
  };
  let hoverX = 0;
  let hoverY = 0;
  let hovered = false;
  const hoverMove = (event) => {
    if (handlers.move.length === 0) {
      return;
    }
    const dx = hovered ? event.clientX - hoverX : 0;
    const dy = hovered ? event.clientY - hoverY : 0;
    hoverX = event.clientX;
    hoverY = event.clientY;
    hovered = true;
    fire("move", { dx, dy, x: event.clientX, y: event.clientY });
  };
  window.addEventListener("pointerdown", onDown, { passive: false });
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp, { passive: false });
  window.addEventListener("pointercancel", onUp, { passive: false });

  // keyboard — one edge per press (OS repeat suppressed); held state in
  // input.keys. The page IS the game: scroll keys are prevented, but
  // modifier chords (refresh, devtools) and editable targets (HUD inputs)
  // always keep native behavior.
  const keyLabels = new Map(); // code → display key, for blur-time synthetic ups
  const SCROLL_KEYS = new Set([
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "End",
    "Home",
    "PageDown",
    "PageUp",
    "Space",
  ]);
  const isEditable = (target) =>
    typeof target?.closest === "function"
      ? target.closest("input, textarea, [contenteditable]")
      : null;
  const onKey = (down) => (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return; // browser/OS chords are not game input
    }
    if (isEditable(event.target)) {
      return;
    }
    const code = event.code;
    if (!down && !input.keys.has(code)) {
      return; // the down was swallowed (chord/editable) — no orphan ups
    }
    // level state is first-class: input.keys tracks even with no edge
    // listener — poll-only games never register input.on("key")
    if (down && handlers.key.length > 0 && SCROLL_KEYS.has(code)) {
      event.preventDefault();
    }
    if (event.repeat) {
      return;
    }
    if (down) {
      input.keys.add(code);
      keyLabels.set(code, event.key);
    } else {
      input.keys.delete(code);
      keyLabels.delete(code);
    }
    if (handlers.key.length > 0) {
      fire("key", {
        code,
        dir: down ? "down" : "up",
        key: event.key,
        mods: {
          alt: Boolean(event.altKey),
          ctrl: Boolean(event.ctrlKey),
          meta: Boolean(event.metaKey),
          shift: Boolean(event.shiftKey),
        },
      });
    }
  };
  window.addEventListener("keydown", onKey(true));
  window.addEventListener("keyup", onKey(false));

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
    version: "0.2.0",
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
    // release everything the same way a real keyup/pointerup would —
    // held keys and touches can never outlive the page's focus
    const heldCodes = [...input.keys]; // snapshot: the loop mutates the set
    for (const code of heldCodes) {
      const key = keyLabels.get(code) ?? code;
      input.keys.delete(code);
      keyLabels.delete(code);
      fire("key", {
        code,
        dir: "up",
        key,
        mods: { alt: false, ctrl: false, meta: false, shift: false },
      });
    }
    const activeIds = [...touches.keys()];
    for (const id of activeIds) {
      onUp({ pointerId: id });
    }
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
