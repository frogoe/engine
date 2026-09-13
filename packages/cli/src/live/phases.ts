/** Lifecycle orchestration. Boot → play → end → retry → stability, all
 *  against the LiveDriver seam — no puppeteer imports here, so tests
 *  drive the exact same code with a FakeDriver. All finding SHAPES live
 *  in decisions.ts; this module only observes and decides WHEN. */
import type { LiveDriver } from "./driver.ts";
import {
  audioLockedFinding,
  canvasMissingFinding,
  canvasUnpaintedFinding,
  collapseFinding,
  consoleErrorFinding,
  contractMissingFinding,
  earlyDeathFinding,
  endBudgetMs,
  END_BUDGET_MS,
  finishEventFinding,
  fpsFinding,
  fpsSustainedFinding,
  fpsThrottledFinding,
  frozenFrameFinding,
  neverEndsFinding,
  noGameoverCardFinding,
  noRetryFinding,
  outlineFinding,
  pageErrorFinding,
  pausedFinding,
  playabilityFinding,
  rebootFinding,
  retryDeadFinding,
  stateCorruptFinding,
  stateStuckFinding,
  THROTTLE_RATE,
  warnsWhenItNeverEnds,
} from "./decisions.ts";
import type { LifecycleMetrics, LiveFinding, Playability } from "./types.ts";

/** Retry click must produce a reload within this window. */
export const RETRY_NAV_MS = 8_000;
/** Scripted play: input cadence and count. */
export const PLAY_STEPS = 7;
export const PLAY_STEP_MS = 850;
export const HOLD_STEP_INDEX = 3;
export const DRAG_STEP_INDEX = 5;
export const DRAG_SPAN = 90;
export const HOLD_MS = 400;
/** Both thumbs down, briefly — the dual-touch step's dwell. */
export const DUAL_MS = 300;
/** END-phase state polling cadence. */
export const POLL_MS = 400;
/** Grace before declaring the finish event missing (dispatch is
 *  synchronous, but the read may race the state flip). */
export const GRACE_MS = 150;
/** Full death→retry cycles exercised (catches works-once bugs). */
export const STABILITY_CYCLES = 2;
/** Taps after a retry reload — a correctly gated game needs input to
 *  START dying; passive waiting alone would never end the second run. */
export const START_BURST_TAPS = 3;
/** Desktop boot FPS mean window (mobile gets the play-window buckets). */
export const DESKTOP_FPS_MS = 2_000;

export type SleepFn = (ms: number) => Promise<void>;

export const sleep: SleepFn = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface PhaseContext {
  /** Saves a named screenshot (owner decides where). */
  shot?: (name: string) => Promise<void>;
  /** Post-navigation settle; overridable alongside sleep for tests. */
  settleMs?: number;
  sleep?: SleepFn;
  viewport: { name: string; width: number; height: number };
  /** declared BRIEF core verb — selects the scripted input ladder */
  verb?: string;
  /** declared BRIEF session (blitz|round|toy) — end-of-run policy */
  session?: string;
}

/** Deterministic tap jitter — the ladder must not hammer one pixel:
 *  wide games put hazards center-column, and a single point can sit
 *  inside a dead zone (a pause button). Pure function of the step. */
export const jitterX = (step: number): number => ((step * 37) % 121) - 60;
export const jitterY = (step: number): number => ((step * 53) % 181) - 90;

// ── the input ladder — pure step programs per declared verb ─────────────────
//
// The ladder is how the sandbox plays the game BLIND. Every verb gets a
// deterministic program that speaks ITS gesture dialect: adjacent tap
// pairs for swap, select→place sequences, keyboard text for type,
// multi-stroke sweeps for draw. Data, not code — the runner and the
// throttle replay execute the same steps, and tests count them.

export type LadderStep =
  | { kind: "tap"; x: number; y: number }
  | { kind: "hold"; ms: number; x: number; y: number }
  | { kind: "drag"; x1: number; x2: number; y1: number; y2: number }
  | { kind: "dual"; x1: number; x2: number; y1: number; y2: number }
  | { kind: "type"; text: string };

export const ladderFor = (
  verb: string,
  viewport: { height: number; width: number },
): LadderStep[] => {
  const cx = Math.round(viewport.width / 2);
  const cy = Math.round(viewport.height / 2);
  const tap = (step: number): { kind: "tap"; x: number; y: number } => ({
    kind: "tap",
    x: Math.round(cx + jitterX(step)),
    y: Math.round(cy + jitterY(step)),
  });
  const sweep = (
    step: number,
  ): { kind: "drag"; x1: number; x2: number; y1: number; y2: number } => {
    const x = Math.round(cx + jitterX(step));
    const y = Math.round(cy + jitterY(step));
    return { kind: "drag", x1: x - DRAG_SPAN, x2: x + DRAG_SPAN, y1: y, y2: y };
  };

  // tap/steer/aim/idle: the original seven-step ladder, unchanged —
  // jittered taps, one hold (step 3), one horizontal sweep (step 5)
  const base = (): LadderStep[] =>
    Array.from({ length: PLAY_STEPS }, (_, step): LadderStep => {
      if (step === HOLD_STEP_INDEX) {
        return { kind: "hold", ms: HOLD_MS, x: tap(step).x, y: tap(step).y };
      }
      if (step === DRAG_STEP_INDEX) return sweep(step);
      return tap(step);
    });

  switch (verb) {
    case "hold": {
      // pads and charge buttons are the hold habitat — and pads are
      // where two thumbs land at once. The dual step presses both
      // sides simultaneously: per-touch routing must survive it
      return [
        ...base(),
        {
          kind: "dual",
          x1: Math.round(viewport.width * 0.25),
          x2: Math.round(viewport.width * 0.75),
          y1: Math.round(viewport.height * 0.7),
          y2: Math.round(viewport.height * 0.7),
        },
      ];
    }
    case "swap": {
      // match-3 dialect: adjacent tap PAIRS (tap a, tap the neighbor —
      // the tap-tap swap) plus both sweep directions (drag-swap)
      const gap = 34;
      return [
        { kind: "tap", x: cx - gap, y: Math.round(cy + jitterY(0)) },
        { kind: "tap", x: cx + gap, y: Math.round(cy + jitterY(0)) },
        { kind: "tap", x: Math.round(cx + jitterX(2)), y: cy - gap },
        { kind: "tap", x: Math.round(cx + jitterX(2)), y: cy + gap },
        { kind: "tap", x: cx - gap, y: Math.round(cy + jitterY(4)) },
        { kind: "tap", x: cx + gap, y: Math.round(cy + jitterY(4)) },
        sweep(0),
        { kind: "drag", x1: cx, x2: cx, y1: cy + DRAG_SPAN, y2: cy - DRAG_SPAN },
      ];
    }
    case "place": {
      // board/tower-defense dialect: select at one point, place at
      // another — three pairs at spread positions plus one sweep
      return [
        { kind: "tap", x: cx - 80, y: cy - 60 },
        { kind: "tap", x: cx + 40, y: cy + 20 },
        { kind: "tap", x: cx + 80, y: cy - 40 },
        { kind: "tap", x: cx - 30, y: cy + 70 },
        { kind: "tap", x: Math.round(cx + jitterX(4)), y: cy },
        { kind: "tap", x: cx - 70, y: cy + 80 },
        { kind: "drag", x1: cx - 60, x2: cx + 60, y1: cy, y2: cy },
      ];
    }
    case "type": {
      // word-game dialect: real keyboard text between taps — taps cover
      // the touch-first surface (on-screen keys), typing covers the
      // desktop path; the hold and sweep keep those affordances alive
      return [
        { kind: "type", text: "frogoe" },
        tap(0),
        { kind: "type", text: "glow" },
        tap(2),
        { kind: "hold", ms: HOLD_MS, x: tap(3).x, y: tap(3).y },
        sweep(5),
        { kind: "type", text: "game" },
        tap(6),
      ];
    }
    case "draw": {
      // drawing dialect: long multi-direction strokes between marks —
      // a scribble, not a tap pattern
      return [
        { kind: "drag", x1: cx - 90, x2: cx + 90, y1: cy - 50, y2: cy + 30 },
        { kind: "tap", x: cx + 60, y: cy - 60 },
        { kind: "drag", x1: cx + 80, x2: cx - 70, y1: cy - 20, y2: cy + 70 },
        { kind: "hold", ms: HOLD_MS, x: cx, y: cy },
        { kind: "drag", x1: cx - 40, x2: cx + 70, y1: cy + 90, y2: cy - 90 },
        { kind: "tap", x: cx - 60, y: cy + 20 },
      ];
    }
    default:
      return base();
  }
};

const execStep = async (driver: LiveDriver, step: LadderStep): Promise<void> => {
  switch (step.kind) {
    case "tap":
      await driver.tap(step.x, step.y);
      break;
    case "hold":
      await driver.hold(step.x, step.y, step.ms);
      break;
    case "drag":
      await driver.drag(step.x1, step.y1, step.x2, step.y2);
      break;
    case "dual":
      await driver.dualTouch(step.x1, step.y1, step.x2, step.y2, DUAL_MS);
      break;
    case "type":
      await driver.type(step.text);
      break;
  }
};

const hasError = (findings: LiveFinding[]): boolean => findings.some((f) => f.severity === "error");

// ── boot ────────────────────────────────────────────────────────────────────

/** Boot checks run on every viewport (and again after each retry
 *  reload, where the fresh-boot pieces are re-asserted). */
export const runBootChecks = async (
  driver: LiveDriver,
  ctx: PhaseContext,
): Promise<LiveFinding[]> => {
  const findings: LiveFinding[] = [];
  const name = ctx.viewport.name;

  const pageErr = pageErrorFinding(driver.errors(), name);
  if (pageErr) {
    findings.push(pageErr);
  }
  const conErr = consoleErrorFinding(driver.consoleErrors(), driver.errors(), name);
  if (conErr) {
    findings.push(conErr);
  }

  const probe = await driver.domProbe();
  if (!probe.canvasPresent) {
    findings.push(canvasMissingFinding(name));
  } else if (!(await driver.canvasPainted())) {
    findings.push(canvasUnpaintedFinding(name));
  }
  if (probe.state === "(missing)") {
    findings.push(contractMissingFinding(name));
  } else if (probe.state === "over") {
    findings.push(earlyDeathFinding(name));
  } else {
    const stuck = stateStuckFinding(probe.state, name);
    if (stuck) {
      findings.push(stuck);
    }
  }
  if (probe.hudPresent) {
    const measures = await driver.hudMeasures();
    const outline = outlineFinding(measures);
    if (outline) {
      findings.push(outline);
    }
    const collapse = collapseFinding(measures);
    if (collapse) {
      findings.push(collapse);
    }
  }
  return findings;
};

// ── desktop (no lifecycle — the product target is the phone) ────────────────

export interface DesktopOutcome {
  findings: LiveFinding[];
  fps?: number;
}

export const runDesktopPass = async (
  driver: LiveDriver,
  ctx: PhaseContext,
): Promise<DesktopOutcome> => {
  const doSleep = ctx.sleep ?? sleep;
  const findings = await runBootChecks(driver, ctx);
  if (hasError(findings)) {
    return { findings };
  }
  const mark = await driver.fpsMark();
  await doSleep(DESKTOP_FPS_MS);
  const buckets = await driver.fpsSince(mark);
  if (buckets.length === 0) {
    return { findings };
  }
  const mean = buckets.reduce((a, b) => a + b, 0) / buckets.length;
  const warn = fpsFinding(mean, ctx.viewport.name);
  if (warn) {
    findings.push(warn);
  }
  await ctx.shot?.("live-desktop.png");
  return { findings, fps: Math.round(mean) };
};

// ── mobile lifecycle ────────────────────────────────────────────────────────

export interface LifecycleOutcome {
  findings: LiveFinding[];
  lifecycle: LifecycleMetrics;
  mobileFps?: number;
  playability: Playability;
}

const overShotName = (cycle: number): string =>
  cycle === 0 ? "live-mobile-over.png" : `live-mobile-over-${cycle + 1}.png`;
const retryShotName = (cycle: number): string =>
  cycle === 0 ? "live-mobile-retry.png" : `live-mobile-retry-${cycle + 1}.png`;

const waitForOver = async (
  driver: LiveDriver,
  doSleep: SleepFn,
  budgetMs: number,
): Promise<boolean> => {
  for (let waited = 0; waited < budgetMs; waited += POLL_MS) {
    await doSleep(POLL_MS);
    if ((await driver.gameState()) === "over") {
      return true;
    }
  }
  return false;
};

/** A short input burst to (re)start a run — the ready screen of a
 *  correctly gated game waits for input before physics begin. */
const runStartBurst = async (driver: LiveDriver, ctx: PhaseContext): Promise<void> => {
  const doSleep = ctx.sleep ?? sleep;
  for (let step = 0; step < START_BURST_TAPS; step++) {
    const x = Math.round(ctx.viewport.width / 2 + jitterX(step));
    const y = Math.round(ctx.viewport.height / 2 + jitterY(step));
    await driver.tap(x, y);
    await doSleep(PLAY_STEP_MS);
  }
};

/** Death agreement: state "over" ⇄ frogoe:finish event, plus the retry
 *  affordances. Returns whether a retry button exists to click. */
const verifyDeath = async (
  driver: LiveDriver,
  ctx: PhaseContext,
  findings: LiveFinding[],
  cycle: number,
): Promise<boolean> => {
  const doSleep = ctx.sleep ?? sleep;
  let events = await driver.finishEvents();
  if (events.length === 0) {
    await doSleep(GRACE_MS);
    events = await driver.finishEvents();
  }
  const mismatch = finishEventFinding(true, events.length);
  if (mismatch) {
    findings.push(mismatch);
  }
  const presence = await driver.retryPresence();
  if (!presence.gameover) {
    findings.push(noGameoverCardFinding());
  }
  if (!presence.retry) {
    findings.push(noRetryFinding());
  }
  await ctx.shot?.(overShotName(cycle));
  return presence.retry;
};

export const runLifecycle = async (
  driver: LiveDriver,
  ctx: PhaseContext,
): Promise<LifecycleOutcome> => {
  const doSleep = ctx.sleep ?? sleep;
  const settle = ctx.settleMs ?? 2000;
  const name = ctx.viewport.name;
  const findings: LiveFinding[] = [];

  // BOOT — fatal boot errors make everything downstream noise
  const boot = await runBootChecks(driver, ctx);
  findings.push(...boot);
  await ctx.shot?.("live-mobile.png");
  if (hasError(boot)) {
    return { findings, lifecycle: { ends: false, retryReloads: 0 }, playability: "no-input" };
  }

  // PLAY — the verb's scripted ladder with deterministic jitter; one
  // hold exercises press-and-release verbs, taps cover the rest
  const ladder = ladderFor(ctx.verb ?? "tap", ctx.viewport);
  const mark = await driver.fpsMark();
  const hashes: number[] = [];
  let streak = 0;
  let maxStreak = 0;
  let sawOver = false;
  let sawPaused = false;
  let sawStuck = false;
  let corrupt: string | null = null;
  for (const step of ladder) {
    await execStep(driver, step);
    await doSleep(PLAY_STEP_MS);
    const state = await driver.gameState();
    if (state === "over") {
      sawOver = true;
      break;
    }
    if (state === "paused") {
      sawPaused = true;
    } else if (state === "loading") {
      sawStuck = true;
    } else if (state !== "playing" && state !== "(missing)") {
      corrupt ??= state;
    }
    // a frozen frame only counts while playing — paused and pre-boot
    // stills are legitimate
    const hash = await driver.canvasHash();
    if (hash !== null) {
      if (hashes.length > 0 && hash === hashes[hashes.length - 1] && state === "playing") {
        streak += 1;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
      hashes.push(hash);
    }
  }
  const buckets = await driver.fpsSince(mark);
  const mean = buckets.length > 0 ? buckets.reduce((a, b) => a + b, 0) / buckets.length : undefined;

  if (corrupt !== null) {
    findings.push(stateCorruptFinding(corrupt));
  }
  if (sawStuck) {
    const stuck = stateStuckFinding("loading", name, "play");
    if (stuck) {
      findings.push(stuck);
    }
  }
  if (sawPaused) {
    findings.push(pausedFinding());
  }
  const frozen = frozenFrameFinding(maxStreak);
  if (frozen) {
    findings.push(frozen);
  }
  const sustained = fpsSustainedFinding(buckets, name);
  if (sustained) {
    findings.push(sustained.finding);
  } else {
    const warn = fpsFinding(mean, name);
    if (warn) {
      findings.push(warn);
    }
  }

  // playability — the canvas moved OR the run ended: either is a
  // response; total stillness across every sample is not
  const responded = new Set(hashes).size > 1 || sawOver;
  const playability: Playability = responded ? "pass" : "fail";
  const play = playabilityFinding(playability);
  if (play) {
    findings.push(play);
  }

  // audio recovery — inject the interruption (the iOS "interrupted"
  // shape), give the game real input, then require its own wiring to
  // have recovered: gesture-scoped resume is the contract for phones
  const audioBefore = await driver.audioStates();
  if (audioBefore.count > 0) {
    await driver.interruptAudio();
    await runStartBurst(driver, ctx); // taps = recovery attempts
    await doSleep(600); // resume() is async
    const audioFinding = audioLockedFinding(await driver.audioStates());
    if (audioFinding) {
      findings.push(audioFinding);
    }
  }

  // END → RETRY → STABILITY — session-aware: blitz waits the full
  // budget and warns; round waits a grace; toy does not wait. A death
  // that happens in ANY session gets the full verification below.
  const session = ctx.session ?? "blitz";
  const budget = endBudgetMs(session);
  let ends = false;
  let retryReloads = 0;
  if (!sawOver && budget > 0) {
    sawOver = await waitForOver(driver, doSleep, budget);
  }
  if (!sawOver) {
    if (warnsWhenItNeverEnds(session)) {
      findings.push(neverEndsFinding(END_BUDGET_MS));
    }
  } else {
    ends = true;
    let canRetry = await verifyDeath(driver, ctx, findings, 0);
    for (let cycle = 0; cycle < STABILITY_CYCLES && canRetry; cycle++) {
      const reloaded = await driver.clickRetryAwaitReload(RETRY_NAV_MS);
      if (!reloaded) {
        findings.push(retryDeadFinding());
        break;
      }
      retryReloads += 1;
      await doSleep(settle);
      const rebootState = await driver.gameState();
      if (rebootState === "over") {
        // the fresh run died on its ready screen before any input
        findings.push(earlyDeathFinding(name, "retry"));
      } else {
        const reboot = rebootFinding(rebootState);
        if (reboot) {
          findings.push(reboot);
        }
      }
      if (!(await driver.canvasPainted())) {
        findings.push(canvasUnpaintedFinding(name, "retry"));
      }
      await ctx.shot?.(retryShotName(cycle));
      if (cycle < STABILITY_CYCLES - 1) {
        // restart the run (input-gated ready screens need a tap), then
        // die again: one-shot bugs only surface on the second run
        await runStartBurst(driver, ctx);
        const overAgain = await waitForOver(driver, doSleep, END_BUDGET_MS);
        if (!overAgain) {
          findings.push(neverEndsFinding(END_BUDGET_MS));
          break;
        }
        canRetry = await verifyDeath(driver, ctx, findings, cycle + 1);
      }
    }
  }

  // PHONE-CLASS THROTTLE — the dev machine lies about hardware: replay
  // the ladder under 4x cpu throttle (the Lighthouse mobile anchor) and
  // require gameplay to still clear half the floor
  const throttleMark = await driver.fpsMark();
  await driver.setCpuThrottling(THROTTLE_RATE);
  await runStartBurst(driver, ctx);
  for (const step of ladder) {
    await execStep(driver, step);
    await doSleep(PLAY_STEP_MS);
  }
  const throttledBuckets = await driver.fpsSince(throttleMark);
  await driver.setCpuThrottling(1);
  const throttled = fpsThrottledFinding(throttledBuckets, name);
  if (throttled) {
    findings.push(throttled);
  }

  return {
    findings,
    lifecycle: { ends, retryReloads },
    mobileFps: mean !== undefined ? Math.round(mean) : undefined,
    playability,
  };
};
