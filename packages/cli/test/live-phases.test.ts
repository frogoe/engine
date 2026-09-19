import { describe, expect, test } from "bun:test";
/** Full lifecycle orchestration against a scripted FakeDriver — the
 *  same runLifecycle code the real chrome run executes, no browser. */
import type { LiveDriver, RetryPresence, DomProbe } from "../src/live/driver.ts";
import { ladderFor, runLifecycle } from "../src/live/phases.ts";
import type { FinishEvent, LiveFinding } from "../src/live/types.ts";

/** Scriptable game world. Defaults model a healthy arcade game: canvas
 *  animates, dies after N state reads, fires finish, retries reload. */
export interface FakeWorld {
  /** audio-context lifecycle the probe would report. */
  audio: { count: number; everRan: boolean; running: number };
  /** the game's wiring recovers audio after the injected interruption. */
  audioRecovers: boolean;
  /** console.error output on the page. */
  consoleErrs: string[];
  /** canvas present (domProbe). */
  canvas: boolean;
  /** loop.render draws (canvasPainted). */
  painted: boolean;
  /** gameState() reads after which the run dies (0 = never dies). */
  dieAfterCalls: number;
  /** uncaught page exceptions. */
  errs: string[];
  /** frogoe:finish dispatches on death (the no-cheat inverse). */
  finishAtDeath: boolean;
  /** per-second fps buckets surfaced by fpsSince. */
  fpsBuckets: number[];
  /** buckets while cpu-throttled (defaults to fpsBuckets). */
  fpsThrottled?: number[];
  /** canvas hash per canvasHash() call — change = alive canvas. */
  hash: () => number;
  /** [data-block-gameover] overlay present. */
  hasGameover: boolean;
  /** [data-block-retry] button present. */
  hasRetry: boolean;
  /** .hud layer present. */
  hud: boolean;
  /** retry click actually reloads. */
  retryReloads: boolean;
  /** state after a retry reload ("playing" = healthy reboot). */
  rebootState: string;
  /** initial contract state. */
  state: string;
}

export const healthyWorld = (overrides: Partial<FakeWorld> = {}): FakeWorld => ({
  audio: { count: 0, everRan: false, running: 0 },
  audioRecovers: true,
  canvas: true,
  consoleErrs: [],
  dieAfterCalls: 20,
  errs: [],
  finishAtDeath: true,
  fpsBuckets: [60, 60, 60, 60, 60, 60, 60],
  hash: (() => {
    let n = 0;
    return () => ++n;
  })(),
  hasGameover: true,
  hasRetry: true,
  hud: true,
  painted: true,
  retryReloads: true,
  rebootState: "playing",
  state: "playing",
  ...overrides,
});

export class FakeDriver implements LiveDriver {
  private calls = 0;
  private deaths = 0;
  private finishEvents_: FinishEvent[] = [];
  private interrupted = false;
  throttleRates: number[] = [];
  taps = 0;
  holds = 0;
  drags = 0;
  duals = 0;
  types: string[] = [];
  shots: string[] = [];

  constructor(public world: FakeWorld) {}

  private dieIfDue(): void {
    const { dieAfterCalls } = this.world;
    if (dieAfterCalls > 0 && this.calls >= dieAfterCalls && this.world.state !== "over") {
      this.world.state = "over";
      this.deaths += 1;
      if (this.world.finishAtDeath) {
        this.finishEvents_.push({ at: this.calls * 400, score: 42 });
      }
    }
  }

  errors(): string[] {
    return this.world.errs;
  }

  consoleErrors(): string[] {
    return this.world.consoleErrs;
  }

  async audioStates(): Promise<{ count: number; everRan: boolean; running: number }> {
    if (this.interrupted) {
      // after the injected interruption, only the game's own wiring
      // (simulated by taps when audioRecovers) brings contexts back
      return {
        count: this.world.audio.count,
        everRan: true,
        running: this.world.audioRecovers ? this.world.audio.count : 0,
      };
    }
    return { ...this.world.audio };
  }

  async interruptAudio(): Promise<void> {
    this.interrupted = true;
  }

  async domProbe(): Promise<DomProbe> {
    return {
      canvasPresent: this.world.canvas,
      hudPresent: this.world.hud,
      state: this.world.state,
    };
  }

  async canvasPainted(): Promise<boolean> {
    return this.world.painted;
  }

  async canvasHash(): Promise<number | null> {
    return this.world.canvas ? this.world.hash() : null;
  }

  async gameState(): Promise<string> {
    this.calls += 1;
    this.dieIfDue();
    return this.world.state;
  }

  async finishEvents(): Promise<FinishEvent[]> {
    return [...this.finishEvents_];
  }

  async fpsMark(): Promise<number> {
    return 0;
  }

  async fpsSince(): Promise<number[]> {
    const last = this.throttleRates[this.throttleRates.length - 1] ?? 1;
    return last > 1 ? (this.world.fpsThrottled ?? this.world.fpsBuckets) : this.world.fpsBuckets;
  }

  async setCpuThrottling(rate: number): Promise<void> {
    this.throttleRates.push(rate);
  }

  async hudMeasures(): Promise<
    Array<{ hasOutline: boolean; height: number; label: string; width: number }>
  > {
    return [{ hasOutline: true, height: 24, label: "score", width: 80 }];
  }

  async retryPresence(): Promise<RetryPresence> {
    return { gameover: this.world.hasGameover, retry: this.world.hasRetry };
  }

  misanchored: string[] = [];

  overlaps: string[] = [];

  /** resize doctrine — scripted by tests: what the page looks like
   *  after the mid-session geometry change. Two hops: desktop grow,
   *  then phone shrink-back (both carry directions) */
  resizes: Array<{ height: number; width: number }> = [];
  resizeBreaks = false;
  resizeState = "playing";
  escapees: string[] = [];

  async blockAnchors(): Promise<string[]> {
    return this.misanchored;
  }

  async hudOverlaps(): Promise<string[]> {
    return this.overlaps;
  }

  async resize(width: number, height: number): Promise<void> {
    this.resizes.push({ height, width });
    if (this.resizeBreaks) {
      this.world.state = "error";
    } else {
      this.world.state = this.resizeState;
    }
  }

  async hudOutOfBounds(): Promise<string[]> {
    return this.escapees;
  }

  async tap(): Promise<void> {
    this.taps += 1;
  }

  async hold(): Promise<void> {
    this.holds += 1;
  }

  async drag(): Promise<void> {
    this.drags += 1;
  }

  async dualTouch(): Promise<void> {
    this.duals += 1;
  }

  async type(text: string): Promise<void> {
    this.types.push(text);
  }

  async contractVersion(): Promise<string> {
    return "0.2.0";
  }

  async clickRetryAwaitReload(): Promise<boolean> {
    if (!this.world.hasRetry || !this.world.retryReloads) {
      return false;
    }
    // simulate the reload: fresh document, fresh probe, fresh boot
    this.calls = 0;
    this.world.state = this.world.rebootState;
    this.finishEvents_ = [];
    return true;
  }

  async screenshot(): Promise<Uint8Array> {
    return new Uint8Array([1]);
  }

  viewport(): { height: number; width: number } {
    return { height: 844, width: 390 };
  }
}

const immediate = (): Promise<void> => Promise.resolve();

const run = async (world: FakeWorld, ctx: Record<string, unknown> = {}, driver?: FakeDriver) => {
  const d = driver ?? new FakeDriver(world);
  const outcome = await runLifecycle(d, {
    settleMs: 0,
    shot: async (name) => {
      d.shots.push(name);
    },
    sleep: immediate,
    viewport: { height: 844, name: "mobile", width: 390 },
    ...ctx,
  });
  return { driver: d, outcome };
};

const codes = (findings: LiveFinding[]): string[] => findings.map((f) => f.code);

describe("live lifecycle: healthy game", () => {
  test("full loop is clean: play, die, retry twice, zero findings", async () => {
    const { driver, outcome } = await run(healthyWorld());
    expect(outcome.findings).toEqual([]);
    expect(outcome.playability).toBe("pass");
    expect(outcome.lifecycle).toEqual({ ends: true, retryReloads: 2 });
    expect(outcome.mobileFps).toBe(60);
    // input ladder ran: 7 steps (one hold, one drag sweep) + a 3-tap
    // restart burst after the first retry + the SAME ladder again under
    // cpu throttle (phone-class replay, with its own 3-tap burst)
    expect(driver.taps).toBe(16);
    expect(driver.holds).toBe(2);
    expect(driver.drags).toBe(2);
    // throttle engaged and restored around the phone-class replay
    expect(driver.throttleRates).toEqual([4, 1]);
    // evidence: boot, over, retry, over-2, retry-2 — then the resize
    // pass snapshots the desktop geometry
    expect(driver.shots).toEqual([
      "live-mobile.png",
      "live-mobile-over.png",
      "live-mobile-retry.png",
      "live-mobile-over-2.png",
      "live-mobile-retry-2.png",
      "live-resize.png",
    ]);
  });

  test("death during play short-circuits straight to verification", async () => {
    const { outcome } = await run(healthyWorld({ dieAfterCalls: 3 }));
    expect(outcome.findings).toEqual([]);
    expect(outcome.playability).toBe("pass");
    expect(outcome.lifecycle.ends).toBe(true);
  });
});

describe("live lifecycle: broken games", () => {
  test("fatal boot skips play entirely", async () => {
    const { outcome } = await run(healthyWorld({ state: "loading" }));
    expect(codes(outcome.findings)).toEqual(["live/state-stuck"]);
    expect(outcome.playability).toBe("no-input");
    expect(outcome.lifecycle).toEqual({ ends: false, retryReloads: 0 });
  });

  test("game that dies on its ready screen never gives the player a run", async () => {
    const { outcome } = await run(healthyWorld({ state: "over" }));
    expect(codes(outcome.findings)).toEqual(["live/early-death"]);
    expect(outcome.lifecycle).toEqual({ ends: false, retryReloads: 0 });
  });

  test("page error at boot gates without a playability double-report", async () => {
    const { outcome } = await run(healthyWorld({ errs: ["boom"] }));
    expect(codes(outcome.findings)).toEqual(["live/page-error"]);
  });

  test("never-ends stays a warning and skips retry", async () => {
    const { outcome } = await run(healthyWorld({ dieAfterCalls: 0 }));
    expect(codes(outcome.findings)).toEqual(["live/never-ends"]);
    expect(outcome.lifecycle).toEqual({ ends: false, retryReloads: 0 });
  });

  test("static canvas through play is not playable", async () => {
    const { outcome } = await run(
      healthyWorld({
        hash: () => 7,
      }),
    );
    expect(codes(outcome.findings)).toContain("live/not-playable");
    expect(codes(outcome.findings)).toContain("live/frozen-frame");
    expect(outcome.playability).toBe("fail");
  });

  test("forged over-state (no finish event) errors on every death, retry still verified", async () => {
    const { outcome } = await run(healthyWorld({ finishAtDeath: false }));
    expect(outcome.findings.filter((f) => f.code === "live/finish-event-missing").length).toBe(2);
    expect(outcome.lifecycle).toEqual({ ends: true, retryReloads: 2 });
  });

  test("missing retry button hard-sticks the player", async () => {
    const { outcome } = await run(healthyWorld({ hasRetry: false }));
    expect(codes(outcome.findings)).toEqual(["live/no-retry"]);
    expect(outcome.lifecycle).toEqual({ ends: true, retryReloads: 0 });
  });

  test("missing game-over card is only a warning", async () => {
    const { outcome } = await run(healthyWorld({ hasGameover: false }));
    expect(outcome.findings.filter((f) => f.code === "live/no-gameover-card").length).toBe(2);
    expect(outcome.lifecycle.retryReloads).toBe(2);
  });

  test("retry that does not reload is dead", async () => {
    const { outcome } = await run(healthyWorld({ retryReloads: false }));
    expect(codes(outcome.findings)).toEqual(["live/retry-dead"]);
    expect(outcome.lifecycle.retryReloads).toBe(0);
  });

  test("sick reboot after retry is caught", async () => {
    const { outcome } = await run(healthyWorld({ rebootState: "loading" }));
    expect(codes(outcome.findings)).toContain("live/state-stuck");
    const stuck = outcome.findings.find((f) => f.code === "live/state-stuck");
    expect(stuck?.phase).toBe("retry");
    // first cycle's boot failure does not stop the second death… the loop
    // continues because the reload DID happen
    expect(outcome.lifecycle.retryReloads).toBe(2);
  });

  test("reboot that instantly dies is an early death on retry", async () => {
    const { outcome } = await run(healthyWorld({ rebootState: "over" }));
    const early = outcome.findings.filter((f) => f.code === "live/early-death");
    expect(early.length).toBe(2);
    expect(early[0]?.phase).toBe("retry");
  });

  test("sustained low fps is an error, not the mean warning", async () => {
    const { outcome } = await run(healthyWorld({ fpsBuckets: [60, 24, 22, 25, 60, 59, 58] }));
    expect(codes(outcome.findings)).toEqual(["live/fps-sustained"]);
    expect(outcome.mobileFps).toBe(44);
  });

  test("mean-below-floor without a held window stays warning-grade", async () => {
    // every 3-second window averages exactly 30 (not below), but the
    // run mean is 22 — occasional recovery, sustained gate stays quiet
    const { outcome } = await run(healthyWorld({ fpsBuckets: [10, 10, 70, 10, 10] }));
    expect(codes(outcome.findings)).toEqual(["live/fps"]);
    expect(outcome.findings[0]?.severity).toBe("warning");
  });

  test("paused during play warns; stills while paused are not frozen", async () => {
    const { outcome } = await run(
      healthyWorld({
        hash: () => 7,
        state: "paused",
      }),
    );
    expect(codes(outcome.findings)).toContain("live/paused");
    expect(codes(outcome.findings)).not.toContain("live/frozen-frame");
  });

  test("corrupt state during play errors", async () => {
    const { outcome } = await run(healthyWorld({ state: "vibes" }));
    expect(codes(outcome.findings)).toContain("live/state-corrupt");
  });

  test("audio that never recovers after the injected interruption errors", async () => {
    const { outcome } = await run(
      healthyWorld({ audio: { count: 1, everRan: true, running: 1 }, audioRecovers: false }),
    );
    expect(codes(outcome.findings)).toContain("live/audio-locked");
  });

  test("audio recovered by the game's wiring stays clean", async () => {
    const { outcome } = await run(healthyWorld({ audio: { count: 1, everRan: true, running: 1 } }));
    expect(codes(outcome.findings)).not.toContain("live/audio-locked");
  });

  test("cpu-bound collapse under phone-class throttle warns", async () => {
    const { outcome } = await run(healthyWorld({ fpsThrottled: [9, 10, 8, 10, 9, 10, 8] }));
    expect(codes(outcome.findings)).toContain("live/fps-throttled");
  });

  test("healthy fps under throttle stays clean", async () => {
    const { outcome } = await run(healthyWorld({ fpsThrottled: [55, 58, 56, 57, 55, 58, 56] }));
    expect(codes(outcome.findings)).not.toContain("live/fps-throttled");
  });
});

describe("input ladders per declared verb", () => {
  const viewport = { height: 844, name: "mobile", width: 390 };
  const counts = (steps: ReturnType<typeof ladderFor>) => ({
    drags: steps.filter((s) => s.kind === "drag").length,
    holds: steps.filter((s) => s.kind === "hold").length,
    taps: steps.filter((s) => s.kind === "tap").length,
    types: steps.filter((s) => s.kind === "type").length,
  });

  test("every verb yields a non-empty, deterministic ladder", () => {
    for (const verb of ["tap", "hold", "steer", "aim", "swap", "place", "type", "draw", "idle"]) {
      const first = ladderFor(verb, viewport);
      const second = ladderFor(verb, viewport);
      expect(first.length).toBeGreaterThan(0);
      expect(first).toEqual(second);
    }
  });

  test("the classic verbs keep the original seven-step ladder byte-for-byte", () => {
    for (const verb of ["tap", "steer", "aim", "idle"]) {
      expect(ladderFor(verb, viewport)).toEqual(ladderFor("tap", viewport));
      expect(counts(ladderFor(verb, viewport))).toEqual({
        drags: 1,
        holds: 1,
        taps: 5,
        types: 0,
      });
    }
  });

  test("hold speaks pads: the seven-step ladder plus one dual-touch step", () => {
    const steps = ladderFor("hold", viewport);
    expect(steps.filter((s) => s.kind === "dual")).toHaveLength(1);
    // the classic prefix survives unchanged before the dual step lands
    expect(steps.slice(0, 7)).toEqual(ladderFor("tap", viewport));
  });

  test("swap speaks match-3: adjacent tap pairs plus both sweep directions", () => {
    const c = counts(ladderFor("swap", viewport));
    expect(c).toEqual({ drags: 2, holds: 0, taps: 6, types: 0 });
  });

  test("place speaks select-then-drop sequences", () => {
    const c = counts(ladderFor("place", viewport));
    expect(c).toEqual({ drags: 1, holds: 0, taps: 6, types: 0 });
  });

  test("type interleaves real keyboard text with taps", () => {
    const steps = ladderFor("type", viewport);
    expect(counts(steps)).toEqual({ drags: 1, holds: 1, taps: 3, types: 3 });
    expect(steps.flatMap((s) => (s.kind === "type" ? [s.text] : []))).toEqual([
      "frogoe",
      "glow",
      "game",
    ]);
  });

  test("draw is a scribble: strokes dominate, taps are punctuation", () => {
    const c = counts(ladderFor("draw", viewport));
    expect(c).toEqual({ drags: 3, holds: 1, taps: 2, types: 0 });
  });

  test("the lifecycle executes the declared verb's ladder", async () => {
    const { driver } = await run(healthyWorld(), { verb: "draw" });
    // draw ladder once + throttle replay once (start bursts are taps)
    expect(driver.drags).toBe(6);
    expect(driver.types).toEqual([]);
  });

  test("the hold ladder's dual-touch step reaches the driver", async () => {
    const { driver } = await run(healthyWorld(), { verb: "hold" });
    // ladder once + throttle replay once = two dual presses
    expect(driver.duals).toBe(2);
  });

  test("the type ladder reaches the page as keyboard text", async () => {
    const { driver } = await run(healthyWorld(), { verb: "type" });
    // the ladder runs twice: scripted play + the cpu-throttle replay
    expect(driver.types).toEqual(["frogoe", "glow", "game", "frogoe", "glow", "game"]);
  });
});

describe("session policies (BRIEF session: blitz | round | toy)", () => {
  test("round: a game that never ends under blind input is NOT a finding", async () => {
    const { outcome } = await run(healthyWorld({ dieAfterCalls: 0 }), { session: "round" });
    expect(outcome.findings).toEqual([]);
    expect(outcome.lifecycle).toEqual({ ends: false, retryReloads: 0 });
    expect(outcome.playability).toBe("pass");
  });

  test("round: a death that happens anyway gets full verification", async () => {
    const { outcome } = await run(healthyWorld({ dieAfterCalls: 12 }), { session: "round" });
    expect(outcome.findings).toEqual([]);
    expect(outcome.lifecycle).toEqual({ ends: true, retryReloads: 2 });
  });

  test("toy: no end wait, no warning — and a canvas that answers is enough", async () => {
    const { outcome } = await run(healthyWorld({ dieAfterCalls: 0 }), { session: "toy" });
    expect(outcome.findings).toEqual([]);
    expect(outcome.lifecycle).toEqual({ ends: false, retryReloads: 0 });
  });

  test("toy: a misdeclared toy that dies anyway is still verified honestly", async () => {
    const { outcome } = await run(healthyWorld({ dieAfterCalls: 5 }), { session: "toy" });
    expect(outcome.findings).toEqual([]);
    expect(outcome.lifecycle).toEqual({ ends: true, retryReloads: 2 });
  });

  test("blitz (default): never-ending still warns — the arcade contract holds", async () => {
    const noSession = await run(healthyWorld({ dieAfterCalls: 0 }));
    expect(noSession.outcome.findings.map((f) => f.code)).toEqual(["live/never-ends"]);
    const explicit = await run(healthyWorld({ dieAfterCalls: 0 }), { session: "blitz" });
    expect(explicit.outcome.findings.map((f) => f.code)).toEqual(["live/never-ends"]);
  });

  test("round: broken death wiring is still gated when a death happens", async () => {
    const { outcome } = await run(healthyWorld({ dieAfterCalls: 10, finishAtDeath: false }), {
      session: "round",
    });
    expect(outcome.findings.filter((f) => f.code === "live/finish-event-missing").length).toBe(2);
  });
});

describe("block placement gates (the shipped-twice bug class)", () => {
  test("self-positioning block wrapped in a div → live/block-anchor error", async () => {
    const driver = new FakeDriver(healthyWorld());
    driver.misanchored = ["data-block-gameover"];
    const { outcome } = await run(
      driver.world,
      { blockBindings: { "data-block-gameover": "overlay-fullscreen" } },
      driver,
    );
    const anchor = outcome.findings.find((f) => f.code === "live/block-anchor");
    expect(anchor?.severity).toBe("error");
    expect(anchor?.fix).toContain("DIRECT child");
  });

  test("overlapping visible HUD wrappers → live/hud-overlap warning", async () => {
    const driver = new FakeDriver(healthyWorld());
    driver.overlaps = ["top-left+top-left"];
    const { outcome } = await run(driver.world, {}, driver);
    const overlap = outcome.findings.find((f) => f.code === "live/hud-overlap");
    expect(overlap?.severity).toBe("warning");
    expect(overlap?.message).toContain("1 HUD overlap");
  });

  test("clean anchors and no overlaps → neither finding", async () => {
    const driver = new FakeDriver(healthyWorld());
    const { outcome } = await run(
      driver.world,
      { blockBindings: { "data-block-gameover": "overlay-fullscreen" } },
      driver,
    );
    expect(codes(outcome.findings)).not.toContain("live/block-anchor");
    expect(codes(outcome.findings)).not.toContain("live/hud-overlap");
  });
});

describe("live lifecycle: resize doctrine", () => {
  test("mid-run resize to the desktop geometry stays clean", async () => {
    const { driver, outcome } = await run(healthyWorld());
    expect(outcome.findings).toEqual([]);
    expect(driver.resizes).toEqual([
      { height: 640, width: 960 },
      { height: 896, width: 390 },
    ]);
    expect(driver.shots).toContain("live-resize.png");
  });

  test("state corrupted by the resize is live/resize", async () => {
    const driver = new FakeDriver(healthyWorld());
    driver.resizeBreaks = true;
    const outcome = await runLifecycle(driver, {
      settleMs: 0,
      sleep: immediate,
      viewport: { height: 844, name: "mobile", width: 390 },
    });
    const finding = outcome.findings.find((f) => f.code === "live/resize");
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toContain('state read "error"');
  });

  test("HUD furniture escaping the viewport after resize is live/resize", async () => {
    const driver = new FakeDriver(healthyWorld());
    driver.escapees = ["block-ready @420,40 96x24"];
    const outcome = await runLifecycle(driver, {
      settleMs: 0,
      sleep: immediate,
      viewport: { height: 844, name: "mobile", width: 390 },
    });
    const finding = outcome.findings.find((f) => f.code === "live/resize");
    expect(finding?.message).toContain("HUD escaped the viewport");
  });

  test("frozen frames while playing after resize is live/resize", async () => {
    const driver = new FakeDriver(healthyWorld({ hash: () => 777 }));
    const outcome = await runLifecycle(driver, {
      settleMs: 0,
      sleep: immediate,
      viewport: { height: 844, name: "mobile", width: 390 },
    });
    // the static-hash world also trips not-playable earlier; the resize
    // finding must fire independently for the frozen-frame reason
    const finding = outcome.findings.find((f) => f.code === "live/resize");
    expect(finding?.message).toContain("frames froze");
  });

  test("a run that ended before the resize is not judged for frozen frames", async () => {
    const driver = new FakeDriver(healthyWorld({ hash: () => 777 }));
    driver.resizeState = "over";
    const outcome = await runLifecycle(driver, {
      settleMs: 0,
      sleep: immediate,
      viewport: { height: 844, name: "mobile", width: 390 },
    });
    const finding = outcome.findings.find((f) => f.code === "live/resize");
    expect(finding).toBeUndefined();
  });
});
