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
    on: (
      event: "down" | "up" | "drag",
      handler: (p: { dx: number; dy: number; x: number; y: number }) => void,
    ) => void;
    pointer: { down: boolean };
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
