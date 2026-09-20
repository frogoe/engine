import { describe, expect, test } from "bun:test";
/** frogoe recap — pure analysis over recorded session rows: facts and
 *  verdicts are machine-checked, fixtures cover the honest spectrum
 *  (never started, passive agent, full loop, errors, no evidence). */
import { analyzeSession, verdictOf, type Facts } from "../src/commands/recap.ts";

const row = (over: Partial<Record<string, unknown>>): Record<string, unknown> => over;

describe("recap analysis", () => {
  test("full loop: start, act, die, retry, score trail", () => {
    const facts = analyzeSession([
      row({ plain: "…", gate: "ready", state: "playing", score: "0", t: 0 }),
      row({ action: { click: "[data-block-play]" }, t: 0.5 }),
      row({ plain: "…", gate: "run", state: "playing", score: "0", t: 1 }),
      row({
        plain: "…",
        gate: "run",
        state: "playing",
        score: "1",
        t: 2,
        live: { player: { x: 1, y: 2 } },
      }),
      row({ plain: "…", gate: "run", state: "over", finishes: [1], t: 3 }),
      row({ action: { click: "[data-block-retry]" }, t: 3.5 }),
      row({ plain: "…", gate: "ready", state: "playing", score: "0", t: 4 }),
      row({ plain: "…", gate: "run", state: "playing", score: "2", t: 5 }),
    ]);
    expect(facts.started).toBeTrue();
    expect(facts.actions).toBe(2);
    expect(facts.deaths).toBe(1);
    expect(facts.retriedAfterDeath).toBeTrue();
    expect(facts.scoreTrail).toEqual(["0", "1", "0", "2"]);
    expect(facts.liveChannel).toBeTrue();
    expect(verdictOf(facts)).toContain("YA — mulai");
  });

  test("never started → TIDAK", () => {
    const facts = analyzeSession([
      row({ plain: "…", gate: "ready", state: "paused", score: "0", t: 0 }),
      row({ plain: "…", gate: "ready", state: "paused", score: "0", t: 2 }),
    ]);
    expect(facts.started).toBeFalse();
    expect(verdictOf(facts)).toContain("TIDAK");
  });

  test("passive agent → UNKNOWN; errors surface", () => {
    const passive = analyzeSession([
      row({ plain: "…", gate: "run", state: "playing", t: 0 }),
      row({ plain: "…", gate: "run", state: "playing", t: 3 }),
    ]);
    expect(verdictOf(passive)).toContain("UNKNOWN");
    const errored = analyzeSession([
      row({ plain: "…", gate: "run", state: "playing", t: 0 }),
      row({ action: { tap: [1, 1] }, t: 1 }),
      row({ error: "boom" }),
      row({ error: "boom again" }),
    ]);
    expect(errored.errors).toHaveLength(2);
    expect(verdictOf(errored)).toContain("TIDAK — 2 error");
  });

  test("no evidence → NO-EVIDENCE; deaths accumulate across frames", () => {
    expect(verdictOf(analyzeSession([]))).toBe("NO-EVIDENCE");
    const two = analyzeSession([
      row({ plain: "…", gate: "run", finishes: [5], t: 1 }),
      row({ plain: "…", gate: "run", finishes: [3], t: 9 }),
    ]);
    expect(two.deaths).toBe(2);
  });

  test("lived forever with actions → YA (hidup terus)", () => {
    const facts: Facts = analyzeSession([
      row({ plain: "…", gate: "run", state: "playing", t: 0 }),
      row({ action: { step: 30 }, t: 1 }),
      row({ plain: "…", gate: "run", state: "playing", t: 60 }),
    ]);
    expect(verdictOf(facts)).toContain("YA (hidup terus)");
  });
});
