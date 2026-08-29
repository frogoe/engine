/** Pure decision functions for the live sandbox. No browser, no fs, no
 *  timers — every finding's shape lives here so the lifecycle orchestration
 *  stays dumb and the decisions stay unit-testable.
 *
 *  Two severities, one rule (the HyperFrames held-failure pattern):
 *  a defect OBSERVED ONCE is a warning (could be timing jitter); a defect
 *  HELD across a window is an error (it is real). */
import {
  finding,
  type CollapseMeasure,
  type LiveFinding,
  type LivePhase,
  type OutlineMeasure,
  type Playability,
} from "./types.ts";

/** Below this the game is unplayable on low-end phones. */
export const FPS_FLOOR = 30;

/** Consecutive one-second buckets that must average below the floor
 *  before low FPS is an error rather than a warning. */
export const FPS_SUSTAINED_WINDOW = 3;

/** Consecutive identical canvas hashes (while playing) before the frame
 *  is considered frozen. At the ~850ms sampling cadence this is ~2.5s. */
export const FROZEN_STREAK = 3;

// ── boot ────────────────────────────────────────────────────────────────────

/**
 * HUD readability — the GAME convention: outline/stroke/shadow on text.
 * Video measures text-vs-background contrast; games can't (backgrounds
 * change every frame). The outline IS the readability mechanism.
 */
export const outlineFinding = (measures: OutlineMeasure[]): LiveFinding | null => {
  const bare = measures.filter((m) => !m.hasOutline);
  if (bare.length === 0 || !bare[0]) {
    return null;
  }
  return finding({
    code: "live/hud-outline",
    file: "index.html",
    fix: `"${bare[0].label}" has no text-shadow or -webkit-text-stroke — game HUD text needs an outline to read on ANY background (registry blocks ship one; custom HUD must add it)`,
    message: `${bare.length} HUD text element(s) have no outline`,
    phase: "boot",
    recipe: "frogoe-registry → block authoring (sticker depth pattern)",
    severity: "error",
  });
};

export const collapseFinding = (measures: CollapseMeasure[]): LiveFinding | null => {
  const collapsed = measures.filter((m) => m.width < 4 || m.height < 4);
  if (collapsed.length === 0 || !collapsed[0]) {
    return null;
  }
  const first = collapsed[0];
  return finding({
    code: "live/layout-collapse",
    file: "index.html",
    fix: `"${first.label}" has content but renders ${Math.round(first.width)}×${Math.round(first.height)} — an element collapsed to zero (missing display, zero-size font, or an ancestor hiding it)`,
    message: `${collapsed.length} HUD element(s) collapsed to zero size`,
    phase: "boot",
    severity: "error",
  });
};

export const pageErrorFinding = (errors: string[], viewport: string): LiveFinding | null => {
  const first = errors[0];
  if (first === undefined) {
    return null;
  }
  return finding({
    code: "live/page-error",
    file: "game.js",
    fix: `uncaught: ${first.slice(0, 140)}`,
    message: `${errors.length} uncaught page error(s) [${viewport}]`,
    phase: "boot",
    severity: "error",
  });
};

/** console.error is a warning, not an error: games legitimately log
 *  recoverable failures. Only uncaught exceptions gate. Page errors that
 *  surface again as console output are de-duplicated here. */
export const consoleErrorFinding = (
  entries: string[],
  pageErrors: string[],
  viewport: string,
): LiveFinding | null => {
  const unique = entries.filter((entry) => !pageErrors.some((e) => e.includes(entry.slice(0, 60))));
  const first = unique[0];
  if (first === undefined) {
    return null;
  }
  return finding({
    code: "live/console-error",
    file: "game.js",
    fix: `console.error: ${first.slice(0, 140)} — recoverable failures should be handled, not logged`,
    message: `${unique.length} console.error(s) [${viewport}]`,
    phase: "boot",
    severity: "warning",
  });
};

export const canvasMissingFinding = (viewport: string): LiveFinding =>
  finding({
    code: "live/canvas-missing",
    file: "index.html",
    fix: 'the contract boots on <canvas id="c">',
    message: `canvas missing [${viewport}]`,
    phase: "boot",
    severity: "error",
  });

export const canvasUnpaintedFinding = (viewport: string, phase: LivePhase = "boot"): LiveFinding =>
  finding({
    code: "live/canvas-unpainted",
    file: "game.js",
    fix: "loop.render never drew — fill loop.render = (ctx) => {...}",
    message: `canvas stayed blank [${viewport}]`,
    phase,
    severity: "error",
  });

export const contractMissingFinding = (viewport: string): LiveFinding =>
  finding({
    code: "live/contract-missing",
    file: "index.html",
    fix: 'import { defineGame } from "frogoe" — the runtime publishes window.__frogoe at boot',
    message: `window.__frogoe absent [${viewport}]`,
    phase: "boot",
    severity: "error",
  });

/** The contract sets state to "playing" the moment the closure boots.
 *  Anything still "loading" after settle means the boot path threw or
 *  never ran start(). */
export const stateStuckFinding = (
  state: string,
  viewport: string,
  phase: LivePhase = "boot",
): LiveFinding | null => {
  if (state !== "loading") {
    return null;
  }
  return finding({
    code: "live/state-stuck",
    file: "game.js",
    fix: 'state never left "loading" — defineGame() threw before start() or start() was never called',
    message: `state stuck in "loading" [${viewport}]`,
    phase,
    severity: "error",
  });
};

/** A game that reaches "over" before any input died on its own ready
 *  screen — the player (and the retry loop) never got a run. The
 *  contract guarantees "playing" at boot; only game logic can forge an
 *  early exit. */
export const earlyDeathFinding = (viewport: string, phase: LivePhase = "boot"): LiveFinding =>
  finding({
    code: "live/early-death",
    file: "game.js",
    fix: 'state reached "over" before any input — the game kills itself on the ready screen; gate death (and the physics that cause it) behind the first input.on("down")',
    message: `game ended before the first input [${viewport}]`,
    phase,
    severity: "error",
  });

// ── play ────────────────────────────────────────────────────────────────────

/** Mean FPS below the floor — occasional dips. Teaching warning. */
export const fpsFinding = (fps: number | undefined, viewport: string): LiveFinding | null => {
  if (fps === undefined || fps >= FPS_FLOOR) {
    return null;
  }
  return finding({
    code: "live/fps",
    file: "game.js",
    fix: `${fps.toFixed(0)} fps on ${viewport} (floor ${FPS_FLOOR}) — heavy per-frame work: cache gradients, cut particle counts, avoid shadowBlur on big shapes`,
    message: `frame rate below the playability floor [${viewport}]`,
    phase: "play",
    recipe: "frogoe-creative → game-feel (motion rules)",
    severity: "warning",
  });
};

/** Sustained low FPS — any FPS_SUSTAINED_WINDOW consecutive one-second
 *  buckets averaging below the floor. Held failure: error grade. */
export const fpsSustainedFinding = (
  buckets: number[],
  viewport: string,
): { finding: LiveFinding; mean: number } | null => {
  if (buckets.length < FPS_SUSTAINED_WINDOW) {
    return null;
  }
  let worst = Number.POSITIVE_INFINITY;
  for (let i = 0; i + FPS_SUSTAINED_WINDOW <= buckets.length; i++) {
    const window = buckets.slice(i, i + FPS_SUSTAINED_WINDOW);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    if (avg < worst) {
      worst = avg;
    }
  }
  if (worst >= FPS_FLOOR) {
    return null;
  }
  const mean = buckets.reduce((a, b) => a + b, 0) / buckets.length;
  return {
    finding: finding({
      code: "live/fps-sustained",
      file: "game.js",
      fix: `${worst.toFixed(0)} fps held for ${FPS_SUSTAINED_WINDOW}s+ on ${viewport} (floor ${FPS_FLOOR}) — the game is consistently slow, not jittering: cut per-frame allocations, shrink offscreen canvases, reduce draw calls`,
      message: `sustained low frame rate [${viewport}]`,
      phase: "play",
      recipe: "frogoe-creative → game-feel (motion rules)",
      severity: "error",
    }),
    mean,
  };
};

/** Static canvas while state is "playing" — loop.render either draws the
 *  same frame or is not running. Warning: some games legitimately hold
 *  still (thinky puzzles); three consecutive samples is the held bar. */
export const frozenFrameFinding = (streak: number): LiveFinding | null => {
  if (streak < FROZEN_STREAK) {
    return null;
  }
  return finding({
    code: "live/frozen-frame",
    file: "game.js",
    fix: `canvas held the same frame for ${streak} samples while playing — loop.render may have stopped or draws a static scene`,
    message: "canvas froze during play",
    phase: "play",
    severity: "warning",
  });
};

export const pausedFinding = (): LiveFinding =>
  finding({
    code: "live/paused",
    file: "game.js",
    fix: 'state read "paused" during scripted play — pause() ran without a matching resume(); check document.hidden handling and blur listeners',
    message: "game paused itself during play",
    phase: "play",
    severity: "warning",
  });

export const stateCorruptFinding = (state: string): LiveFinding =>
  finding({
    code: "live/state-corrupt",
    file: "game.js",
    fix: `state read "${state}" — outside the contract's set (loading/playing/paused/over); game code is mutating window.__frogoe directly`,
    message: `state left the contract's state machine ("${state}")`,
    phase: "play",
    severity: "error",
  });

export const playabilityFinding = (result: Playability): LiveFinding | null => {
  if (result === "pass") {
    return null;
  }
  if (result === "no-input") {
    return finding({
      code: "live/no-input",
      file: "game.js",
      fix: 'the game never registered input.on("down", ...) — wire the core verb before shipping',
      message: "game has no input handler",
      phase: "play",
      severity: "error",
    });
  }
  return finding({
    code: "live/not-playable",
    file: "game.js",
    fix: "scripted taps produced no canvas change — loop.update/loop.render may be wired but the game logic never runs",
    message: "game did not respond to scripted input",
    phase: "play",
    severity: "error",
  });
};

// ── end ─────────────────────────────────────────────────────────────────────

/** The one-shot death report: state "over" and the frogoe:finish event
 *  must agree. A state write without the event means game code forged
 *  the state machine; an event without the state means the contract was
 *  bypassed. Both are errors. */
export const finishEventFinding = (stateOver: boolean, finishCount: number): LiveFinding | null => {
  if (stateOver === finishCount > 0) {
    return null;
  }
  return finding({
    code: "live/finish-event-missing",
    file: "game.js",
    fix: stateOver
      ? 'state reached "over" but frogoe:finish never fired — call finish(score) on death, never write __frogoe.state directly'
      : 'frogoe:finish fired but state is not "over" — the event was dispatched outside finish()',
    message: "state/event mismatch at game over",
    phase: "end",
    severity: "error",
  });
};

export const neverEndsFinding = (budgetMs: number): LiveFinding =>
  finding({
    code: "live/never-ends",
    file: "game.js",
    fix: `no death within ${Math.round(budgetMs / 1000)}s of passive play — fine for endless/sandbox games, but feed games are short replayable loops; most deaths should arrive in seconds`,
    message: "game never reached the over state",
    phase: "end",
    severity: "warning",
  });

export const noGameoverCardFinding = (): LiveFinding =>
  finding({
    code: "live/no-gameover-card",
    file: "index.html",
    fix: "no [data-block-gameover] overlay when the game ended — install the game-over-card block so death has a screen",
    message: "game over has no overlay",
    phase: "end",
    recipe: "frogoe-registry → game-over-card",
    severity: "warning",
  });

export const noRetryFinding = (): LiveFinding =>
  finding({
    code: "live/no-retry",
    file: "index.html",
    fix: "no [data-block-retry] button anywhere — the player is hard-stuck after death; the retry affordance is the loop's exit",
    message: "no retry affordance after game over",
    phase: "end",
    recipe: "frogoe-registry → game-over-card",
    severity: "error",
  });

// ── retry ───────────────────────────────────────────────────────────────────

export const retryDeadFinding = (): LiveFinding =>
  finding({
    code: "live/retry-dead",
    file: "game.js",
    fix: 'clicking retry produced no reload — wire it: retry.addEventListener("click", () => location.reload())',
    message: "retry button did not reload the page",
    phase: "retry",
    severity: "error",
  });

/** After the retry reload the contract must boot to "playing" again. */
export const rebootFinding = (state: string): LiveFinding | null => {
  if (state === "playing") {
    return null;
  }
  return finding({
    code: "live/state-stuck",
    file: "game.js",
    fix: `after retry reloaded the page the state read "${state}" — the second boot is not healthy (check localStorage parsing and one-time init paths)`,
    message: `retry boot stuck in "${state}"`,
    phase: "retry",
    severity: "error",
  });
};
