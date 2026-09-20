import { describe, expect, test } from "bun:test";
/** recap analysis — facts verdicts and EVERY anomaly detector, each with
 *  its trigger case and its no-false-positive case (legitimate gameplay
 *  shapes that must NOT fire). Pure fixtures only: no browser involved. */
import {
  analyzeFacts,
  detectAnomalies,
  verdictOf,
  type SessionRow,
} from "../src/recap-analysis.ts";

const frame = (over: Partial<SessionRow>): SessionRow => ({ plain: "…", ...over });
const live = (
  player: { x: number; y: number; r?: number },
  entities: SessionRow["live"] extends infer L
    ? L extends { entities?: infer E }
      ? E
      : never
    : never = [],
): unknown => ({
  entities,
  player,
});
const hazard = (
  x: number,
  y: number,
  r = 18,
): { kind: string; r: number; x: number; y: number } => ({
  kind: "hazard",
  r,
  x,
  y,
});
const codes = (rows: SessionRow[]): string[] => detectAnomalies(rows).map((a) => a.code);

describe("facts + verdicts", () => {
  test("full loop: start, act, die, retry, score trail", () => {
    const facts = analyzeFacts([
      frame({ gate: "ready", state: "playing", score: "0", t: 0 }),
      { action: { click: "x" }, t: 0.5 },
      frame({ gate: "run", state: "playing", score: "0", t: 1 }),
      frame({
        gate: "run",
        state: "playing",
        score: "1",
        t: 2,
        live: live({ x: 1, y: 2 }) as never,
      }),
      frame({ gate: "run", state: "over", finishes: [1], t: 3 }),
      { action: { click: "y" }, t: 3.5 },
      frame({ gate: "ready", state: "playing", score: "0", t: 4 }),
      frame({ gate: "run", state: "playing", score: "2", t: 5 }),
    ]);
    expect(facts.started).toBeTrue();
    expect(facts.actions).toBe(2);
    expect(facts.deaths).toBe(1);
    expect(facts.retriedAfterDeath).toBeTrue();
    expect(facts.scoreTrail).toEqual(["0", "1", "0", "2"]);
    expect(facts.liveChannel).toBeTrue();
    expect(verdictOf(facts, 0)).toContain("YES — started");
  });

  test("never started → NO; passive → UNKNOWN; errors surface; no evidence", () => {
    expect(verdictOf(analyzeFacts([frame({ gate: "ready", state: "paused", t: 0 })]), 0)).toContain(
      "NO —",
    );
    expect(
      verdictOf(
        analyzeFacts([
          frame({ gate: "run", state: "playing", t: 0 }),
          frame({ gate: "run", t: 3 }),
        ]),
        0,
      ),
    ).toContain("UNKNOWN");
    const errored = analyzeFacts([
      frame({ gate: "run", state: "playing", t: 0 }),
      { action: { tap: [1, 1] }, t: 1 },
      { error: "boom" },
      { error: "boom again" },
    ]);
    expect(verdictOf(errored, 0)).toContain("NO — 2 session error(s)");
    expect(verdictOf(analyzeFacts([]), 0)).toBe("NO-EVIDENCE");
  });

  test("endured forever with actions → YES (endured); verdict carries anomaly count", () => {
    const facts = analyzeFacts([
      frame({ gate: "run", state: "playing", t: 0 }),
      { action: { step: 30 }, t: 1 },
      frame({ gate: "run", state: "playing", t: 60 }),
    ]);
    expect(verdictOf(facts, 0)).toContain("YES (endured)");
    expect(verdictOf(facts, 2)).toContain("2 anomalies");
  });
});

describe("detector: hazard-overlap-no-death", () => {
  test("fires on a collision that never kills", () => {
    const rows = [
      frame({
        gate: "run",
        state: "playing",
        t: 1,
        live: live({ x: 100, y: 100 }, [hazard(105, 105)]) as never,
      }),
      frame({
        gate: "run",
        state: "playing",
        t: 1.5,
        live: live({ x: 106, y: 104 }, [hazard(105, 105)]) as never,
      }),
      frame({
        gate: "run",
        state: "playing",
        t: 2,
        live: live({ x: 107, y: 104 }, [hazard(105, 105)]) as never,
      }),
    ];
    expect(codes(rows)).toContain("hazard-overlap-no-death");
  });
  test("silent on single-frame pass-through and on death during overlap", () => {
    const passThrough = [
      frame({
        gate: "run",
        state: "playing",
        t: 1,
        live: live({ x: 100, y: 100 }, [hazard(105, 105)]) as never,
      }),
      frame({
        gate: "run",
        state: "playing",
        t: 1.5,
        live: live({ x: 300, y: 300 }, [hazard(105, 105)]) as never,
      }),
    ];
    expect(codes(passThrough)).not.toContain("hazard-overlap-no-death");
    const killed = [
      frame({
        gate: "run",
        state: "playing",
        t: 1,
        live: live({ x: 100, y: 100 }, [hazard(105, 105)]) as never,
      }),
      frame({
        gate: "run",
        state: "over",
        finishes: [0],
        t: 1.5,
        live: live({ x: 106, y: 104 }, [hazard(105, 105)]) as never,
      }),
    ];
    expect(codes(killed)).not.toContain("hazard-overlap-no-death");
  });
  test("silent when entities are not hazards (gaps, targets)", () => {
    const rows = [
      frame({
        gate: "run",
        state: "playing",
        t: 1,
        live: live({ x: 100, y: 100 }, [{ kind: "gap", x: 102, y: 102, r: 40 }]) as never,
      }),
      frame({
        gate: "run",
        state: "playing",
        t: 1.5,
        live: live({ x: 103, y: 101 }, [{ kind: "gap", x: 102, y: 102, r: 40 }]) as never,
      }),
      frame({
        gate: "run",
        state: "playing",
        t: 2,
        live: live({ x: 104, y: 101 }, [{ kind: "gap", x: 102, y: 102, r: 40 }]) as never,
      }),
    ];
    expect(codes(rows)).not.toContain("hazard-overlap-no-death");
  });
});

describe("detector: position-teleport", () => {
  test("fires on a >250px jump without excuse", () => {
    const rows = [
      frame({ gate: "run", state: "playing", t: 1, live: live({ x: 100, y: 700 }) as never }),
      frame({ gate: "run", state: "playing", t: 1.5, live: live({ x: 100, y: 20 }) as never }),
    ];
    expect(codes(rows)).toContain("position-teleport");
  });
  test("silent across gate transitions and deaths (legit resets)", () => {
    const rows = [
      frame({ gate: "ready", state: "playing", t: 1, live: live({ x: 100, y: 700 }) as never }),
      frame({ gate: "run", state: "playing", t: 1.5, live: live({ x: 100, y: 100 }) as never }),
      frame({
        gate: "run",
        state: "over",
        finishes: [3],
        t: 2,
        live: live({ x: 380, y: 90 }) as never,
      }),
    ];
    expect(codes(rows)).not.toContain("position-teleport");
  });
});

describe("detector: player-out-of-bounds", () => {
  test("fires beyond the viewport +40px margin (meta viewport honored)", () => {
    const rows = [
      { meta: { viewport: { h: 640, w: 400 } } },
      frame({ gate: "run", state: "playing", t: 1, live: live({ x: 460, y: 300 }) as never }),
    ];
    expect(codes(rows)).toContain("player-out-of-bounds");
  });
  test("silent at the edges inside the margin", () => {
    const rows = [
      { meta: { viewport: { h: 844, w: 390 } } },
      frame({ gate: "run", state: "playing", t: 1, live: live({ x: 389, y: 840 }) as never }),
      frame({ gate: "run", state: "playing", t: 2, live: live({ x: 1, y: 4 }) as never }),
    ];
    expect(codes(rows)).not.toContain("player-out-of-bounds");
  });
});

describe("detector: world-frozen-despite-input", () => {
  test("fires when playing, unmoved, unscored ≥4s while actions land", () => {
    const rows = [
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 1,
        live: live({ x: 195, y: 400 }) as never,
      }),
      { action: { tap: [195, 400] }, t: 2 },
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 3,
        live: live({ x: 195, y: 400 }) as never,
      }),
      { action: { press: "Space" }, t: 4 },
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 5.2,
        live: live({ x: 195, y: 401 }) as never,
      }),
    ];
    expect(codes(rows)).toContain("world-frozen-despite-input");
  });
  test("silent when the world moves between actions", () => {
    const rows = [
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 1,
        live: live({ x: 195, y: 400 }) as never,
      }),
      { action: { tap: [195, 400] }, t: 2 },
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 3,
        live: live({ x: 195, y: 320 }) as never,
      }),
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 5,
        live: live({ x: 195, y: 380 }) as never,
      }),
    ];
    expect(codes(rows)).not.toContain("world-frozen-despite-input");
  });
});

describe("detector: input-never-landed", () => {
  test("fires when many actions have zero observable effect", () => {
    const rows = [
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 1,
        live: live({ x: 195, y: 400 }) as never,
      }),
      { action: { tap: [1, 1] }, t: 1.5 },
      { action: { press: "Space" }, t: 2 },
      { action: { hold: ["ArrowLeft", 10] }, t: 2.5 },
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 3,
        live: live({ x: 195, y: 400 }) as never,
      }),
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 4,
        live: live({ x: 195, y: 400 }) as never,
      }),
    ];
    expect(codes(rows)).toContain("input-never-landed");
  });
  test("silent when anything ever moved or scored", () => {
    const rows = [
      frame({
        gate: "run",
        state: "playing",
        score: "0",
        t: 1,
        live: live({ x: 195, y: 400 }) as never,
      }),
      { action: { tap: [1, 1] }, t: 1.5 },
      { action: { press: "Space" }, t: 2 },
      { action: { hold: ["ArrowLeft", 10] }, t: 2.5 },
      frame({
        gate: "run",
        state: "playing",
        score: "3",
        t: 3,
        live: live({ x: 150, y: 400 }) as never,
      }),
    ];
    expect(codes(rows)).not.toContain("input-never-landed");
  });
});

describe("detector: score-regression", () => {
  test("fires when the displayed score decreases mid-run", () => {
    const rows = [
      frame({ gate: "run", state: "playing", score: "12", t: 1 }),
      frame({ gate: "run", state: "playing", score: "9", t: 2 }),
    ];
    expect(codes(rows)).toContain("score-regression");
  });
  test("silent on resets after death (score legitimately restarts)", () => {
    const rows = [
      frame({ gate: "run", state: "playing", score: "12", t: 1 }),
      frame({ gate: "run", state: "over", finishes: [12], t: 2, score: "12" }),
      frame({ gate: "ready", state: "playing", score: "0", t: 3 }),
      frame({ gate: "run", state: "playing", score: "2", t: 4 }),
    ];
    expect(codes(rows)).not.toContain("score-regression");
  });
});

describe("detector: game-over-without-finish", () => {
  test("fires when over is shown but finish never fired", () => {
    const rows = [frame({ gate: "run", state: "over", t: 2 })];
    expect(codes(rows)).toContain("game-over-without-finish");
  });
  test("silent when the wiring is honest", () => {
    const rows = [frame({ gate: "run", state: "over", finishes: [7], t: 2 })];
    expect(codes(rows)).not.toContain("game-over-without-finish");
  });
});

describe("detector: error-cluster", () => {
  test("fires on the same error ≥3 times, once", () => {
    const rows = [
      frame({ gate: "run", state: "playing", t: 1 }),
      { error: "click: no match for [data-block-retry]" },
      { error: "click: no match for [data-block-retry]" },
      { error: "click: no match for [data-block-retry]" },
    ];
    const found = detectAnomalies(rows).filter((a) => a.code === "error-cluster");
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toContain("×3");
  });
  test("silent on scattered distinct errors", () => {
    const rows = [frame({ gate: "run", state: "playing", t: 1 }), { error: "a" }, { error: "b" }];
    expect(codes(rows)).not.toContain("error-cluster");
  });
});
