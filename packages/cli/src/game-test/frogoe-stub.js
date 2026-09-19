/** frogoe test stub — the node_modules/frogoe package materialized beside
 *  games that ship game.test.js. Copied VERBATIM (like injected-runtime):
 *  consumed by `bun test` inside the game folder, self-contained by
 *  construction, never imported by the CLI itself.
 *
 *  Two exports:
 *  - defineGame: the RECORDING contract stub. game.js's bare
 *    `import { defineGame } from "frogoe"` resolves here under bun (the
 *    browser keeps using the import map → the real pinned contract; the
 *    bundler resolves through its import-map plugin — this file is
 *    invisible to both, enforced by test).
 *  - bootForTest(path): loads game.js fresh (cache-busted), with the
 *    minimal headless surface installed (fake DOM, recording canvas,
 *    storage, permissive audio), and returns the drive API.
 *
 *  The game is never rewritten or patched — tests run against the exact
 *  binary the browser runs. Closure state stays private: tests observe
 *  BEHAVIOR (draw calls, finish events, DOM bindings). */

// ── environment (installed once, before the first game import) ─────────────

const fakeElements = new Map();

const fakeElement = (selector) => {
  if (fakeElements.has(selector)) return fakeElements.get(selector);
  const listeners = {};
  const attributes = new Set();
  const el = {
    // configurable geometry — tests set .rect; offsetHeight/Width follow
    rect: { height: 0, left: 0, top: 0, width: 0 },
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    textContent: "",
    get offsetHeight() {
      return el.rect.height;
    },
    get offsetWidth() {
      return el.rect.width;
    },
    getBoundingClientRect() {
      return { ...el.rect };
    },
    addEventListener(type, fn) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener() {},
    dispatch(type, payload) {
      for (const fn of listeners[type] ?? []) fn(payload);
    },
    click() {
      el.dispatch("click", { target: el });
    },
    setAttribute(name) {
      attributes.add(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    toggleAttribute(name, force) {
      const on = force === undefined ? !attributes.has(name) : force;
      if (on) attributes.add(name);
      else attributes.delete(name);
      return on;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    classList: {
      add() {},
      contains() {
        return false;
      },
      remove() {},
      toggle() {},
    },
    appendChild() {
      return el;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    focus() {},
    blur() {},
    // offscreen sprite canvases (createElement("canvas").getContext("2d"))
    // draw into their own recorder — position data survives for asserts
    getContext() {
      return makeRecordingCtx();
    },
  };
  fakeElements.set(selector, el);
  return el;
};

const storageData = new Map();

const anyNode = new Proxy(function anyNode() {}, {
  get(target, prop) {
    if (prop === "state") return "running";
    if (prop === "then") return undefined; // stay non-thenable
    if (prop === Symbol.toPrimitive) return () => 0; // audio math → 0
    if (typeof prop === "symbol") return undefined;
    return anyNode; // every property is callable and infinitely deep
  },
  apply() {
    return anyNode;
  },
});

const installEnvironment = () => {
  const g = globalThis;
  if (!g.window) {
    g.window = {
      AudioContext: function AudioContextStub() {
        return anyNode;
      },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 390,
      innerHeight: 844,
      devicePixelRatio: 2,
      requestAnimationFrame() {
        return 0; // the contract owns the loop — tests drive step() instead
      },
    };
  }
  if (!g.localStorage) {
    g.localStorage = {
      getItem: (k) => (storageData.has(String(k)) ? storageData.get(String(k)) : null),
      setItem: (k, v) => storageData.set(String(k), String(v)),
      removeItem: (k) => storageData.delete(String(k)),
    };
  }
  if (!g.location) {
    g.location = { reload() {} };
  }
  if (!g.document) {
    g.document = {
      body: fakeElement("<body>"),
      documentElement: fakeElement("<html>"),
      querySelector: (sel) => fakeElement(sel),
      querySelectorAll: () => [],
      getElementById: (id) => fakeElement(`#${id}`),
      createElement: () => fakeElement(`<created-${fakeElements.size}>`),
      addEventListener() {},
      removeEventListener() {},
    };
  }
};

// ── the recording canvas ────────────────────────────────────────────────────

const makeRecordingCtx = () => {
  const calls = [];
  const gradient = () => ({ addColorStop() {} });
  const self = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === "__frogoeCalls") return calls;
        if (prop === "canvas") return { height: 844, width: 390 };
        if (prop === "measureText") {
          return (text) => ({ width: String(text).length * 8 });
        }
        if (prop === "createLinearGradient" || prop === "createRadialGradient") {
          return gradient;
        }
        if (prop === "getImageData") {
          return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
        }
        if (prop === "isPointInPath") {
          return () => false;
        }
        if (typeof prop === "symbol") return undefined;
        if (prop in target) return target[prop];
        return (...args) => {
          calls.push({ args, name: String(prop) });
        };
      },
      set(target, prop, value) {
        calls.push({ args: [value], name: String(prop), set: true });
        target[prop] = value;
        return true;
      },
    },
  );
  return self;
};

// ── the contract stub: captures the closure, exposes the four nouns ────────

let captured = null;

const resetCaptured = () => {
  const ctx = makeRecordingCtx();
  const stage = {
    ctx,
    height: 844,
    safe: { bottom: 0, left: 0, right: 0, top: 0 },
    width: 390,
    play: { center: 0, left: 0, right: 0, width: 0 },
    refresh() {
      // mirrors the real contract: capped centered column, min(width, 460)
      const width = Math.min(stage.width, 460);
      stage.play.center = stage.width / 2;
      stage.play.left = (stage.width - width) / 2;
      stage.play.right = (stage.width + width) / 2;
      stage.play.width = width;
    },
  };
  stage.refresh();
  const handlers = new Map();
  const input = {
    keys: new Set(),
    pointer: { down: false, dx: 0, dy: 0, id: 0, x: 0, y: 0 },
    on(type, fn) {
      if (typeof fn !== "function") {
        throw new TypeError(`test stub: input.on("${String(type)}") needs a function handler`);
      }
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    },
    __emit(type, payload) {
      for (const fn of handlers.get(type) ?? []) fn(payload);
    },
  };
  const loop = { update: null, render: null };
  const api = { state: "playing" };
  const finishes = [];
  const finish = (score) => {
    if (api.state === "over") return; // fires once, like the contract
    finishes.push({ at: finishes.length, score: typeof score === "number" ? score : null });
    api.state = "over";
  };
  captured = { api, ctx, finish, finishes, handlers, input, loop, stage };
  return captured;
};

export const defineGame = (game) => {
  if (typeof game !== "function") {
    throw new TypeError("test stub: defineGame(gameFn) — pass the closure");
  }
  const nouns = resetCaptured();
  game({ finish: nouns.finish, input: nouns.input, loop: nouns.loop, stage: nouns.stage });
  return nouns.api;
};

// ── bootForTest: load a game fresh and return the drive API ────────────────

// install at stub load: a static `import { TUNE } from "./game.js"` in a
// test file evaluates game.js BEFORE bootForTest runs — module-level DOM
// access (document.addEventListener for audio unlock) must already work
installEnvironment();

export const bootForTest = async (moduleUrl) => {
  fakeElements.clear();
  resetCaptured();
  // fresh module per boot: bun IGNORES query strings on dynamic file
  // imports (the module cache swallowed re-boots whole), so we copy the
  // game VERBATIM to a unique path under .frogoe/ (tool-owned) and import
  // the copy — distinct path, fresh module scope, identical bytes. The
  // bare `import "frogoe"` inside it still resolves: the node_modules
  // walk from .frogoe/boot-* climbs to the game root.
  const source = moduleUrl instanceof URL ? moduleUrl : new URL(`file://${String(moduleUrl)}`);
  const sourcePath = decodeURIComponent(source.pathname);
  const fs = await import("node:fs");
  const gameDir = sourcePath.slice(0, sourcePath.lastIndexOf("/"));
  const bootDir = `${gameDir}/.frogoe`;
  fs.mkdirSync(bootDir, { recursive: true });
  const bootCount = (globalThis.__frogoeBootCount ?? 0) + 1;
  globalThis.__frogoeBootCount = bootCount;
  const bootPath = `${bootDir}/boot-${Date.now()}-${bootCount}.js`;
  fs.copyFileSync(sourcePath, bootPath);
  try {
    await import(bootPath);
  } finally {
    fs.rmSync(bootPath, { force: true });
  }
  if (!captured) {
    throw new Error(
      "test stub: game.js loaded but never called defineGame — is this a frogoe game?",
    );
  }
  const { api, ctx, finish, finishes, input, loop, stage } = captured;

  return {
    /** the live stage — mutate width/height, then resizeTo() refreshes play */
    stage,
    /** change geometry like a window resize would (refresh included) */
    resizeTo(width, height) {
      stage.width = width;
      stage.height = height;
      globalThis.window.innerWidth = width;
      globalThis.window.innerHeight = height;
      stage.refresh();
    },
    /** deterministic frame: update(dt) then render(recording ctx) */
    step(dt = 1 / 60) {
      if (typeof loop.update === "function") loop.update(dt);
      if (typeof loop.render === "function") loop.render(ctx);
    },
    /** fire the input verbs through the contract surface */
    tap(x = stage.width / 2, y = stage.height / 2) {
      input.pointer.down = true;
      input.pointer.x = x;
      input.pointer.y = y;
      input.__emit("down", { x, y });
      input.__emit("up", { x, y });
      input.pointer.down = false;
    },
    key(code) {
      input.keys.add(code);
      input.__emit("key", { code, key: code, repeat: false });
      input.keys.delete(code);
    },
    type(text) {
      for (const ch of String(text)) this.key(ch);
    },
    holdKey(code, frames = 1) {
      input.keys.add(code);
      input.__emit("key", { code, key: code, repeat: false });
      for (let i = 0; i < frames; i += 1) this.step();
      input.keys.delete(code);
    },
    /** finish events so far: [{ at, score }] */
    finishes() {
      return finishes.map((f) => ({ ...f }));
    },
    /** every recorded draw call: [{ name, args, set? }] */
    draws() {
      return ctx.__frogoeCalls.slice();
    },
    /** true when any recorded call satisfies the matcher ({name, args}) */
    drew(matcher) {
      return ctx.__frogoeCalls.some(matcher);
    },
    /** the fake DOM element a selector resolves to (same instance the game
     *  holds) — set .rect to give it geometry, .click()/dispatch() to drive */
    element(selector) {
      return fakeElement(selector);
    },
    /** contract state: "playing" until finish() fires (once) */
    state() {
      return api.state;
    },
    /** the finish noun, for direct lifecycle assertions (rare) */
    __finish: finish,
  };
};
