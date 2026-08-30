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
  finishEventFinding,
  fpsFinding,
  fpsSustainedFinding,
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
} from "./decisions.ts";
import type { LifecycleMetrics, LiveFinding, Playability } from "./types.ts";

/** No death after this much passive play → live/never-ends (warning). */
export const END_BUDGET_MS = 45_000;
/** Retry click must produce a reload within this window. */
export const RETRY_NAV_MS = 8_000;
/** Scripted play: input cadence and count. */
export const PLAY_STEPS = 7;
export const PLAY_STEP_MS = 850;
export const HOLD_STEP_INDEX = 3;
export const DRAG_STEP_INDEX = 5;
export const DRAG_SPAN = 90;
export const HOLD_MS = 400;
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
}

/** Deterministic tap jitter — the ladder must not hammer one pixel:
 *  wide games put hazards center-column, and a single point can sit
 *  inside a dead zone (a pause button). Pure function of the step. */
export const jitterX = (step: number): number => ((step * 37) % 121) - 60;
export const jitterY = (step: number): number => ((step * 53) % 181) - 90;

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

const waitForOver = async (driver: LiveDriver, doSleep: SleepFn): Promise<boolean> => {
  for (let waited = 0; waited < END_BUDGET_MS; waited += POLL_MS) {
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

  // PLAY — input ladder with deterministic jitter; one hold exercises
  // press-and-release verbs, taps cover the rest
  const mark = await driver.fpsMark();
  const hashes: number[] = [];
  let streak = 0;
  let maxStreak = 0;
  let sawOver = false;
  let sawPaused = false;
  let sawStuck = false;
  let corrupt: string | null = null;
  for (let step = 0; step < PLAY_STEPS; step++) {
    const x = Math.round(ctx.viewport.width / 2 + jitterX(step));
    const y = Math.round(ctx.viewport.height / 2 + jitterY(step));
    if (step === HOLD_STEP_INDEX) {
      await driver.hold(x, y, HOLD_MS);
    } else if (step === DRAG_STEP_INDEX) {
      // horizontal sweep across the play column — exercises the
      // drag/steer handlers (movement while pressed)
      await driver.drag(x - DRAG_SPAN, y, x + DRAG_SPAN, y);
    } else {
      await driver.tap(x, y);
    }
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

  // END → RETRY → STABILITY
  let ends = false;
  let retryReloads = 0;
  if (!sawOver) {
    sawOver = await waitForOver(driver, doSleep);
  }
  if (!sawOver) {
    findings.push(neverEndsFinding(END_BUDGET_MS));
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
        const overAgain = await waitForOver(driver, doSleep);
        if (!overAgain) {
          findings.push(neverEndsFinding(END_BUDGET_MS));
          break;
        }
        canRetry = await verifyDeath(driver, ctx, findings, cycle + 1);
      }
    }
  }

  return {
    findings,
    lifecycle: { ends, retryReloads },
    mobileFps: mean !== undefined ? Math.round(mean) : undefined,
    playability,
  };
};
