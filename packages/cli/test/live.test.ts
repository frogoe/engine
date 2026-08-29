import { describe, expect, test } from "bun:test";
/** Pure decision logic for the game-native live pass. Browser path runs
 *  real Chrome (no mocks); these tests cover the decisions. */
import {
  collapseFinding,
  consoleErrorFinding,
  earlyDeathFinding,
  finishEventFinding,
  FPS_FLOOR,
  fpsFinding,
  fpsSustainedFinding,
  frozenFrameFinding,
  FROZEN_STREAK,
  neverEndsFinding,
  noGameoverCardFinding,
  noRetryFinding,
  outlineFinding,
  pausedFinding,
  playabilityFinding,
  rebootFinding,
  retryDeadFinding,
  stateCorruptFinding,
  stateStuckFinding,
} from "../src/live/decisions.ts";
import type { CollapseMeasure, OutlineMeasure } from "../src/live/types.ts";

describe("live: HUD outline (the game readability convention)", () => {
  const el = (over: Partial<OutlineMeasure>): OutlineMeasure => ({
    hasOutline: true,
    label: "score",
    ...over,
  });

  test("all outlined → no finding", () => {
    expect(outlineFinding([el({}), el({ label: "combo" })])).toBeNull();
  });

  test("bare text is flagged with the convention as the fix", () => {
    const finding = outlineFinding([el({}), el({ hasOutline: false, label: "fuel" })]);
    expect(finding?.code).toBe("live/hud-outline");
    expect(finding?.fix).toContain("fuel");
    expect(finding?.fix).toContain("text-shadow or -webkit-text-stroke");
    expect(finding?.recipe).toContain("frogoe-registry");
  });
});

describe("live: layout collapse", () => {
  const el = (over: Partial<CollapseMeasure>): CollapseMeasure => ({
    height: 24,
    label: "score",
    width: 80,
    ...over,
  });

  test("healthy boxes pass", () => {
    expect(collapseFinding([el({}), el({ label: "combo", width: 12 })])).toBeNull();
  });

  test("zero-box text collapses", () => {
    const finding = collapseFinding([
      el({}),
      el({ label: "fuel", width: 0 }),
      el({ label: "moves", height: 2 }),
    ]);
    expect(finding?.code).toBe("live/layout-collapse");
    expect(finding?.fix).toContain("0×24");
  });
});

describe("live: FPS gate", () => {
  test("floor is 30 (low-end phone reality)", () => {
    expect(FPS_FLOOR).toBe(30);
  });

  test("above floor passes; below produces a teaching warning", () => {
    expect(fpsFinding(58, "mobile")).toBeNull();
    expect(fpsFinding(undefined, "mobile")).toBeNull();
    const finding = fpsFinding(22, "mobile");
    expect(finding?.code).toBe("live/fps");
    expect(finding?.severity).toBe("warning");
    expect(finding?.fix).toContain("22 fps");
    expect(finding?.fix).toContain("shadowBlur");
  });
});

describe("live: playability", () => {
  test("pass produces nothing", () => {
    expect(playabilityFinding("pass")).toBeNull();
  });

  test("no-input teaches the verb wiring", () => {
    const finding = playabilityFinding("no-input");
    expect(finding?.code).toBe("live/no-input");
    expect(finding?.fix).toContain('input.on("down"');
  });

  test("fail means taps changed nothing", () => {
    const finding = playabilityFinding("fail");
    expect(finding?.code).toBe("live/not-playable");
    expect(finding?.severity).toBe("error");
  });
});

describe("live: console errors (warning-grade, de-duplicated)", () => {
  test("quiet page stays quiet", () => {
    expect(consoleErrorFinding([], [], "mobile")).toBeNull();
  });

  test("console.error becomes a warning", () => {
    const finding = consoleErrorFinding(["boom"], [], "mobile");
    expect(finding?.code).toBe("live/console-error");
    expect(finding?.severity).toBe("warning");
    expect(finding?.fix).toContain("boom");
  });

  test("a console echo of an uncaught error is not double-reported", () => {
    expect(
      consoleErrorFinding(
        ["Uncaught TypeError: x is undefined"],
        ["Uncaught TypeError: x is undefined"],
        "mobile",
      ),
    ).toBeNull();
  });
});

describe("live: boot state machine", () => {
  test("playing is healthy", () => {
    expect(stateStuckFinding("playing", "mobile")).toBeNull();
  });

  test("still loading means the boot path never finished", () => {
    const finding = stateStuckFinding("loading", "mobile");
    expect(finding?.code).toBe("live/state-stuck");
    expect(finding?.severity).toBe("error");
  });

  test("dying before any input is an early death, not a healthy boot", () => {
    const finding = earlyDeathFinding("mobile");
    expect(finding?.code).toBe("live/early-death");
    expect(finding?.severity).toBe("error");
    expect(finding?.fix).toContain("ready screen");
  });
});

describe("live: sustained FPS (the held-failure upgrade)", () => {
  test("healthy buckets pass", () => {
    expect(fpsSustainedFinding([60, 58, 61, 59, 60], "mobile")).toBeNull();
  });

  test("too few buckets say nothing", () => {
    expect(fpsSustainedFinding([10, 10], "mobile")).toBeNull();
  });

  test("a single dip stays a warning, not a held failure", () => {
    expect(fpsSustainedFinding([60, 22, 60, 59, 60], "mobile")).toBeNull();
  });

  test("three low seconds in a row is an error", () => {
    const result = fpsSustainedFinding([60, 24, 22, 25, 60], "mobile");
    expect(result?.finding.code).toBe("live/fps-sustained");
    expect(result?.finding.severity).toBe("error");
    expect(result?.finding.fix).toContain("consistently slow");
    expect(result?.mean).toBeCloseTo(38.2, 1);
  });
});

describe("live: frozen frame", () => {
  test("short stills are fine (game can hold a beat)", () => {
    expect(frozenFrameFinding(FROZEN_STREAK - 1)).toBeNull();
  });

  test("a held still while playing warns", () => {
    const finding = frozenFrameFinding(FROZEN_STREAK);
    expect(finding?.code).toBe("live/frozen-frame");
    expect(finding?.severity).toBe("warning");
  });
});

describe("live: death agreement (no-cheat guard)", () => {
  test("state and event in agreement pass", () => {
    expect(finishEventFinding(true, 1)).toBeNull();
    expect(finishEventFinding(false, 0)).toBeNull();
  });

  test("forged over-state without the event is an error", () => {
    const finding = finishEventFinding(true, 0);
    expect(finding?.code).toBe("live/finish-event-missing");
    expect(finding?.fix).toContain("never write __frogoe.state directly");
  });

  test("event without the state is an error too", () => {
    const finding = finishEventFinding(false, 1);
    expect(finding?.code).toBe("live/finish-event-missing");
    expect(finding?.fix).toContain("outside finish()");
  });
});

describe("live: end + retry affordances", () => {
  test("never-ends is a warning, not a judgment of the game", () => {
    const finding = neverEndsFinding(45_000);
    expect(finding?.code).toBe("live/never-ends");
    expect(finding?.severity).toBe("warning");
    expect(finding?.fix).toContain("45s");
  });

  test("missing card warns; missing retry button errors", () => {
    expect(noGameoverCardFinding()?.severity).toBe("warning");
    expect(noRetryFinding()?.severity).toBe("error");
  });

  test("retry that reloads nothing is dead", () => {
    expect(retryDeadFinding()?.code).toBe("live/retry-dead");
  });

  test("retry reboot must land on playing", () => {
    expect(rebootFinding("playing")).toBeNull();
    const finding = rebootFinding("loading");
    expect(finding?.code).toBe("live/state-stuck");
    expect(finding?.phase).toBe("retry");
  });

  test("out-of-contract states corrupt the machine", () => {
    const finding = stateCorruptFinding("vibes");
    expect(finding?.code).toBe("live/state-corrupt");
    expect(finding?.fix).toContain("vibes");
    expect(pausedFinding()?.severity).toBe("warning");
  });
});
