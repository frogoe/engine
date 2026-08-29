import { describe, expect, test } from "bun:test";
/** Pure decision logic for the game-native live pass. Browser path runs
 *  real Chrome (no mocks); these tests cover the decisions. */
import {
  collapseFinding,
  FPS_FLOOR,
  fpsFinding,
  outlineFinding,
  playabilityFinding,
  type CollapseMeasure,
  type OutlineMeasure,
} from "../src/live.ts";

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
