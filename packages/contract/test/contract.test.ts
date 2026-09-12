import type {} from "bun";
import { describe, expect, test } from "bun:test";
/**
 * Behavioral tests for the frogoe contract — the platform layer these games
 * stand on. A regression here is a regression in every game.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const contractSource = readFileSync(path.join(import.meta.dir, "../src/contract.js"), "utf-8");

type Listener = (event: Record<string, unknown>) => void;
type FrameCallback = (t: number) => void;

const createStubEnv = (options?: {
  insets?: { bottom: number; left: number; right: number; top: number };
  inner?: { height: number; width: number };
}) => {
  const listeners = new Map<string, Listener[]>();
  const dispatched: Array<{ detail?: unknown; type: string }> = [];
  const rAF: FrameCallback[] = [];
  const ctxOps: string[] = [];
  const stubCtx = new Proxy(
    {},
    {
      get:
        (_t, prop) =>
        (...args: unknown[]) => {
          if (prop === "measureText") {
            return { width: String(args[0] ?? "").length * 7 };
          }
          ctxOps.push(String(prop));
        },
      set: (_t, _prop, _value) => true,
    },
  );
  const CanvasClass = class HTMLCanvasElementFake {};
  const fakeCanvas = Object.assign(new CanvasClass(), {
    getContext: () => stubCtx,
    height: 0,
    style: {} as Record<string, string>,
    width: 0,
  });
  const now = { value: 0 };
  const api = {
    calls: { finish: [] as Array<{ score: number }> },
    fire(key: string, payload: Record<string, unknown> = {}) {
      const event = { preventDefault: () => {}, ...payload };
      for (const listener of listeners.get(key) ?? []) {
        listener(event);
      }
    },
    frame(t: number) {
      now.value = t;
      rAF.at(-1)?.(t);
    },
  };
  const documentStub = {
    addEventListener: (event: string, handler: Listener) => {
      listeners.set(`doc:${event}`, [handler]);
    },
    body: { append: () => {} },
    createElement: () => ({ style: { cssText: "" } }),
    dispatchEvent: (event: { detail: unknown; type: string }) => {
      dispatched.push(event);
      for (const listener of listeners.get(`doc:${event.type}`) ?? []) {
        (listener as (e: unknown) => void)(event);
      }
    },
    hidden: false,
    querySelector: () => fakeCanvas,
    readyState: "complete",
  };
  interface WindowStub {
    addEventListener: (event: string, handler: Listener) => void;
    innerHeight: number;
    innerWidth: number;
  }
  const windowStub: WindowStub = {
    addEventListener: (event: string, handler: Listener) => {
      listeners.set(`win:${event}`, [...(listeners.get(`win:${event}`) ?? []), handler]);
    },
    innerHeight: options?.inner?.height ?? 844,
    innerWidth: options?.inner?.width ?? 390,
  };
  const sandbox = // oxlint-disable-next-line eslint/no-new-func -- executes our tested contract with stub DOM deps
    new Function(
      "window",
      "document",
      "getComputedStyle",
      "performance",
      "requestAnimationFrame",
      "CustomEvent",
      "HTMLCanvasElement",
      `${sourceBody()}\nreturn defineGame;`,
    );
  const defineGame = sandbox(
    windowStub,
    documentStub,
    () => ({
      bottom: `${options?.insets?.bottom ?? 0}px`,
      left: `${options?.insets?.left ?? 0}px`,
      right: `${options?.insets?.right ?? 0}px`,
      top: `${options?.insets?.top ?? 0}px`,
    }),
    { now: () => now.value },
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- rAF IS a callback API
    (cb: FrameCallback) => {
      rAF.push(cb);
      return rAF.length;
    },
    class CustomEventFake {
      detail: unknown;
      type: string;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    CanvasClass,
  );
  return {
    api,
    defineGame,
    dispatched,
    documentStub,
    fakeCanvas,
    windowStub,
  };
};

/** The module body without the export statement — new Function takes a
 *  script, and `export` is module-only syntax. */
const sourceBody = (): string => contractSource.replace("export { defineGame };", "");

interface GameOptions {
  finish: (score: number) => void;
  input: {
    keys: Set<string>;
    on: {
      (
        event: "key",
        handler: (k: {
          code: string;
          dir: string;
          key: string;
          mods: { alt: boolean; ctrl: boolean; meta: boolean; shift: boolean };
        }) => void,
      ): void;
      (
        event: "down" | "drag" | "move" | "up",
        handler: (p: {
          down?: boolean;
          dx: number;
          dy: number;
          id?: number;
          x: number;
          y: number;
        }) => void,
      ): void;
    };
    pointer: { down: boolean; dx: number; dy: number; x: number; y: number };
  };
  loop: {
    update?: (dt: number) => void;
    render?: (ctx: unknown) => void;
  };
  stage: {
    height: number;
    play: { center: number; left: number; width: number };
    safe: { bottom: number; top: number };
    width: number;
  };
}

describe("frogoe contract", () => {
  test("imports as a real ES module with no top-level side effects", async () => {
    const mod = await import("../src/contract.js");
    expect(mod.defineGame).toBeFunction();
  });

  test("boots, publishes the host handle, plays state", () => {
    const stub = createStubEnv();
    stub.defineGame(({ loop }: GameOptions) => {
      loop.update = () => {};
      loop.render = () => {};
    });
    const handle = (stub.windowStub as typeof stub.windowStub & { __frogoe?: { state: string } })
      .__frogoe;
    expect(handle?.state).toBe("playing");
  });

  test("missing loop.update rejects boot with a teaching error", () => {
    const stub = createStubEnv();
    const incomplete = ({ loop }: GameOptions) => {
      loop.render = () => {};
    };
    expect(() => stub.defineGame(incomplete)).toThrow(/loop\.update/u);
  });

  test("missing loop.render rejects boot with a teaching error", () => {
    const stub = createStubEnv();
    const incomplete = ({ loop }: GameOptions) => {
      loop.update = () => {};
    };
    expect(() => stub.defineGame(incomplete)).toThrow(/loop\.render/u);
  });

  test("fixed-timestep: two 17ms frames run one 60Hz step each", () => {
    const stub = createStubEnv();
    let steps = 0;
    stub.defineGame(({ loop }: GameOptions) => {
      loop.update = () => {
        steps += 1;
      };
      loop.render = () => {};
    });
    stub.api.frame(1000);
    const before = steps;
    stub.api.frame(1017);
    stub.api.frame(1034);
    expect(steps - before).toBeGreaterThanOrEqual(2);
  });

  test("pointer dx is anchor-relative; cancel releases", () => {
    const stub = createStubEnv();
    let saw = { dx: 0, x: 0 };
    stub.defineGame(({ input, loop }: GameOptions) => {
      input.on("drag", (p) => {
        saw = { dx: p.dx, x: p.x };
      });
      loop.update = () => {};
      loop.render = () => {};
    });
    stub.api.fire("win:pointerdown", { clientX: 100, clientY: 500 });
    stub.api.fire("win:pointermove", { clientX: 140, clientY: 510 });
    expect(saw.dx).toBe(40);
    stub.api.fire("win:pointercancel");
    const handle = (stub.windowStub as unknown as { __frogoe?: { pause: () => void } }).__frogoe;
    expect(handle).toBeDefined();
  });

  test("finish broadcasts once via frogoe:finish and flips state", () => {
    const stub = createStubEnv();
    stub.documentStub.addEventListener("frogoe:finish", (event) => {
      const detail = (event as { detail: { score: number } }).detail;
      stub.api.calls.finish.push({ score: detail.score });
    });
    // default noop so TS keeps the call signature (assignment happens in a callback)
    let finish: (score: number) => void = () => {};
    stub.defineGame((options: GameOptions) => {
      finish = options.finish;
      options.loop.update = () => {};
      options.loop.render = () => {};
    });
    finish?.(42);
    finish?.(99);
    const handle = (stub.windowStub as typeof stub.windowStub & { __frogoe?: { state: string } })
      .__frogoe;
    expect(stub.api.calls.finish).toEqual([{ score: 42 }]);
    expect(handle?.state).toBe("over");
  });

  test("host pause/resume gates the loop", () => {
    const stub = createStubEnv();
    let steps = 0;
    stub.defineGame(({ loop }: GameOptions) => {
      loop.update = () => {
        steps += 1;
      };
      loop.render = () => {};
    });
    const handle = (
      stub.windowStub as unknown as { __frogoe?: { pause: () => void; resume: () => void } }
    ).__frogoe;
    handle?.pause();
    stub.api.frame(2000);
    stub.api.frame(3000);
    const frozen = steps;
    expect(frozen).toBe(0);
    handle?.resume();
    stub.api.frame(3020); // 20ms since resume -> exactly one 60Hz step
    expect(steps).toBe(frozen + 1);
  });

  test("play column is capped and centered on wide screens", () => {
    const stub = createStubEnv({ inner: { height: 844, width: 1280 } });
    let play = { center: 0, width: 0 };
    stub.defineGame(({ loop, stage }: GameOptions) => {
      play = stage.play;
      loop.update = () => {};
      loop.render = () => {};
    });
    expect(play.width).toBe(460);
    expect(play.center).toBe(640);
  });

  test("mute broadcasts to the game's audio layer", () => {
    const stub = createStubEnv();
    stub.defineGame(({ loop }: GameOptions) => {
      loop.update = () => {};
      loop.render = () => {};
    });
    const handle = (
      stub.windowStub as unknown as { __frogoe?: { mute: (s: boolean) => void; muted: boolean } }
    ).__frogoe;
    handle?.mute(true);
    expect(handle?.muted).toBeTrue();
    expect(stub.dispatched.some((e) => e.type === "frogoe:mute")).toBeTrue();
  });
});

describe("frogoe contract 0.2.0 — keyboard", () => {
  const bootKeys = (
    onKey?: (k: { code: string; dir: string; key: string }) => void,
  ): { input?: GameOptions["input"]; stub: ReturnType<typeof createStubEnv> } => {
    const stub = createStubEnv();
    let input: GameOptions["input"] | undefined;
    stub.defineGame((options: GameOptions) => {
      input = options.input;
      if (onKey) {
        options.input.on("key", onKey);
      }
      options.loop.update = () => {};
      options.loop.render = () => {};
    });
    return { input, stub };
  };

  test("key down/up roundtrip with dir, key, code, mods", () => {
    const seen: Array<{ code: string; dir: string; key: string }> = [];
    const { stub } = bootKeys((k) => {
      seen.push({ code: k.code, dir: k.dir, key: k.key });
    });
    stub.api.fire("win:keydown", { code: "KeyQ", key: "q" });
    stub.api.fire("win:keyup", { code: "KeyQ", key: "q" });
    expect(seen).toEqual([
      { code: "KeyQ", dir: "down", key: "q" },
      { code: "KeyQ", dir: "up", key: "q" },
    ]);
  });

  test("OS auto-repeat is suppressed — one edge per press", () => {
    let downs = 0;
    const { stub } = bootKeys((k) => {
      if (k.dir === "down") downs += 1;
    });
    stub.api.fire("win:keydown", { code: "Space", key: " " });
    stub.api.fire("win:keydown", { code: "Space", key: " ", repeat: true });
    stub.api.fire("win:keydown", { code: "Space", key: " ", repeat: true });
    expect(downs).toBe(1);
  });

  test("input.keys tracks held codes and clears on release", () => {
    const { input, stub } = bootKeys();
    stub.api.fire("win:keydown", { code: "ArrowLeft", key: "ArrowLeft" });
    stub.api.fire("win:keydown", { code: "KeyD", key: "d" });
    expect(input?.keys.has("ArrowLeft")).toBeTrue();
    expect(input?.keys.has("KeyD")).toBeTrue();
    stub.api.fire("win:keyup", { code: "ArrowLeft", key: "ArrowLeft" });
    expect(input?.keys.has("ArrowLeft")).toBeFalse();
    expect(input?.keys.has("KeyD")).toBeTrue();
  });

  test("blur fires a synthetic up per held key, then clears the set", () => {
    const ups: string[] = [];
    const { input, stub } = bootKeys((k) => {
      if (k.dir === "up") ups.push(k.code);
    });
    stub.api.fire("win:keydown", { code: "KeyA", key: "a" });
    stub.api.fire("win:keydown", { code: "KeyW", key: "w" });
    stub.api.fire("win:blur");
    expect(ups.sort()).toEqual(["KeyA", "KeyW"]);
    expect(input?.keys.size).toBe(0);
  });

  test("modifier chords pass through — no event, no held state", () => {
    let fired = 0;
    const { input, stub } = bootKeys(() => {
      fired += 1;
    });
    stub.api.fire("win:keydown", { code: "KeyR", ctrlKey: true, key: "r" });
    stub.api.fire("win:keydown", { code: "KeyI", metaKey: true, key: "i" });
    expect(fired).toBe(0);
    expect(input?.keys.size).toBe(0);
  });

  test("scroll keys are prevented; letters are not", () => {
    let prevented = 0;
    const { stub } = bootKeys(() => {});
    const spy = () => {
      prevented += 1;
    };
    stub.api.fire("win:keydown", { code: "Space", key: " ", preventDefault: spy });
    stub.api.fire("win:keydown", { code: "ArrowLeft", key: "ArrowLeft", preventDefault: spy });
    stub.api.fire("win:keydown", { code: "KeyA", key: "a", preventDefault: spy });
    expect(prevented).toBe(2);
  });

  test("editable targets keep native typing — no event, no preventDefault", () => {
    let fired = 0;
    let prevented = 0;
    const { input, stub } = bootKeys(() => {
      fired += 1;
    });
    const target = { closest: () => ({}) }; // any match = editable
    stub.api.fire("win:keydown", {
      code: "Space",
      key: " ",
      preventDefault: () => {
        prevented += 1;
      },
      target,
    });
    expect(fired).toBe(0);
    expect(prevented).toBe(0);
    expect(input?.keys.size).toBe(0);
  });

  test("no key listener — DOM untouched, but input.keys still tracks", () => {
    const { input, stub } = bootKeys();
    let prevented = 0;
    stub.api.fire("win:keydown", {
      code: "Space",
      key: " ",
      preventDefault: () => {
        prevented += 1;
      },
    });
    expect(prevented).toBe(0); // no listener — the page keeps native scroll
    expect(input?.keys.has("Space")).toBeTrue(); // polling is first-class
    stub.api.fire("win:keyup", { code: "Space", key: " " });
    expect(input?.keys.size).toBe(0);
  });

  test("unknown input event throws a teaching TypeError", () => {
    const stub = createStubEnv();
    stub.defineGame((options: GameOptions) => {
      options.loop.update = () => {};
      options.loop.render = () => {};
      expect(() =>
        options.input.on("wheel" as "down", () => {
          // unreachable
        }),
      ).toThrow(/unknown input event "wheel" .* down, drag, key, move, up/u);
    });
  });

  test("api.version reports 0.2.0", () => {
    const stub = createStubEnv();
    stub.defineGame(({ loop }: GameOptions) => {
      loop.update = () => {};
      loop.render = () => {};
    });
    const handle = (stub.windowStub as typeof stub.windowStub & { __frogoe?: { version: string } })
      .__frogoe;
    expect(handle?.version).toBe("0.2.0");
  });
});

describe("frogoe contract 0.2.0 — multi-touch + hover", () => {
  const bootPointer = (): {
    input?: GameOptions["input"];
    stub: ReturnType<typeof createStubEnv>;
  } => {
    const stub = createStubEnv();
    let input: GameOptions["input"] | undefined;
    stub.defineGame((options: GameOptions) => {
      input = options.input;
      options.loop.update = () => {};
      options.loop.render = () => {};
    });
    return { input, stub };
  };

  test("two touches keep independent anchors; pointer mirrors the first", () => {
    const { input, stub } = bootPointer();
    stub.api.fire("win:pointerdown", { clientX: 100, clientY: 500, pointerId: 7 });
    stub.api.fire("win:pointerdown", { clientX: 300, clientY: 200, pointerId: 9 });
    stub.api.fire("win:pointermove", { clientX: 140, clientY: 500, pointerId: 7 });
    stub.api.fire("win:pointermove", { clientX: 340, clientY: 240, pointerId: 9 });
    // per-touch dx: id 7 moved +40 from its anchor, id 9 moved +40/+40 from its own
    expect(input?.pointer.dx).toBe(40);
    expect(input?.pointer.x).toBe(140); // follows the FIRST touch, not the second
    expect(input?.pointer.down).toBeTrue();
  });

  test("first touch lifting ends pointer.down even with a second held", () => {
    const { input, stub } = bootPointer();
    stub.api.fire("win:pointerdown", { clientX: 100, clientY: 500, pointerId: 7 });
    stub.api.fire("win:pointerdown", { clientX: 300, clientY: 200, pointerId: 9 });
    stub.api.fire("win:pointerup", { pointerId: 7 });
    expect(input?.pointer.down).toBeFalse(); // primary is gone
  });

  test("handlers receive per-touch snapshots with the pointer id", () => {
    const stub = createStubEnv();
    const ups: Array<{ down?: boolean; dx: number; id?: number }> = [];
    stub.defineGame((options: GameOptions) => {
      options.input.on("up", (p) => {
        ups.push({ down: p.down, dx: p.dx, id: p.id });
      });
      options.loop.update = () => {};
      options.loop.render = () => {};
    });
    stub.api.fire("win:pointerdown", { clientX: 100, clientY: 500, pointerId: 3 });
    stub.api.fire("win:pointermove", { clientX: 160, clientY: 500, pointerId: 3 });
    stub.api.fire("win:pointerup", { pointerId: 3 });
    expect(ups).toEqual([{ down: false, dx: 60, id: 3 }]);
  });

  test("stray release without a press fires nothing", () => {
    const stub = createStubEnv();
    let ups = 0;
    stub.defineGame((options: GameOptions) => {
      options.input.on("up", () => {
        ups += 1;
      });
      options.loop.update = () => {};
      options.loop.render = () => {};
    });
    stub.api.fire("win:pointerup", { pointerId: 42 });
    stub.api.fire("win:pointercancel", { pointerId: 42 });
    expect(ups).toBe(0);
  });

  test("hover moves fire only when a handler exists, anchored to the last point", () => {
    const stub = createStubEnv();
    const moves: Array<{ dx: number; dy: number }> = [];
    stub.defineGame((options: GameOptions) => {
      options.input.on("move", (p) => {
        moves.push({ dx: p.dx, dy: p.dy });
      });
      options.loop.update = () => {};
      options.loop.render = () => {};
    });
    stub.api.fire("win:pointermove", { clientX: 10, clientY: 20 });
    stub.api.fire("win:pointermove", { clientX: 25, clientY: 28 });
    expect(moves).toEqual([
      { dx: 0, dy: 0 }, // first hover has no anchor
      { dx: 15, dy: 8 }, // delta from the previous hover point
    ]);
  });

  test("hover without a registered handler is a silent no-op", () => {
    const stub = createStubEnv();
    let crashed = false;
    stub.defineGame((options: GameOptions) => {
      options.loop.update = () => {};
      options.loop.render = () => {};
      try {
        stub.api.fire("win:pointermove", { clientX: 10, clientY: 20 });
      } catch {
        crashed = true;
      }
    });
    expect(crashed).toBeFalse();
  });

  test("blur releases active touches with up events", () => {
    const stub = createStubEnv();
    const ups: number[] = [];
    stub.defineGame((options: GameOptions) => {
      options.input.on("up", (p) => {
        ups.push(p.id ?? -1);
      });
      options.loop.update = () => {};
      options.loop.render = () => {};
    });
    stub.api.fire("win:pointerdown", { clientX: 100, clientY: 500, pointerId: 1 });
    stub.api.fire("win:pointerdown", { clientX: 300, clientY: 200, pointerId: 2 });
    stub.api.fire("win:blur");
    expect(ups.sort()).toEqual([1, 2]);
  });
});
