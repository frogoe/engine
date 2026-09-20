import { describe, expect, test } from "bun:test";
/** drawn-world — the engine's coordinate measurement, unit-tested with
 *  synthetic draw streams (trigger AND no-false-positive per behavior).
 *  Production data is real intercepted draws; these fixtures test the
 *  ANALYSIS, then oracle tests validate the analysis against real games. */
import { analyzeDraws, type DrawRecord, type WorldEntity } from "../src/drawn-world.ts";

const VP = { h: 844, w: 390 };
const rect = (x: number, y: number, w: number, h: number, color = "#fff"): DrawRecord => ({
  color,
  h,
  w,
  x,
  y,
});

describe("drawn-world analysis", () => {
  test("flappy-shaped frame: background filtered, two entities, correct geometry", () => {
    const recs = [
      rect(195, 422, 390, 844, "#4EC0CA"), // sky — >50% viewport → filtered
      rect(233, 180, 52, 280, "#543847"), // top pipe body
      rect(233, 610, 52, 300, "#543847"), // bottom pipe body — same x band, LINKs? gap 150px apart vertically
      rect(195, 350, 26, 26, "#FAFAFA"), // bird
    ];
    const snap = analyzeDraws(recs, [], VP);
    // two pipe segments sit 460-580 apart (180+140=320 → y 320..460 top ends 320? top spans 40..320, bottom 460..760 → gap 140 > LINK_DIST) → two pipe clusters + bird = 3
    expect(snap.entities.length).toBe(3);
    const bird = snap.entities.find((e) => e.color === "#FAFAFA");
    expect(bird).toBeDefined();
    expect(bird!.x).toBeCloseTo(195, 0);
    expect(bird!.y).toBeCloseTo(350, 0);
  });

  test("nearby shapes merge into one entity (the actor's sprite parts)", () => {
    const recs = [
      rect(195, 400, 24, 24, "#fff"),
      rect(210, 405, 10, 10, "#f8b733"), // wing, 15px away → LINKs
      rect(186, 392, 8, 8, "#fa8072"), // tuft, within 32px → LINKs
    ];
    const snap = analyzeDraws(recs, [], VP);
    expect(snap.entities).toHaveLength(1);
    const e = snap.entities[0]!;
    expect(e.x).toBeGreaterThan(185);
    expect(e.x).toBeLessThan(215);
  });

  test("background is filtered by area share — a full-canvas fill never surfaces", () => {
    const recs = [rect(195, 422, 390, 844, "#1a1424"), rect(100, 100, 40, 40, "#f00")];
    const snap = analyzeDraws(recs, [], VP);
    expect(snap.entities).toHaveLength(1);
    expect(snap.entities[0]!.color).toBe("#f00");
  });

  test("specks below MIN_AREA are dropped", () => {
    const recs = [rect(100, 100, 4, 4, "#fff"), rect(200, 200, 40, 40, "#fff")];
    const snap = analyzeDraws(recs, [], VP);
    expect(snap.entities).toHaveLength(1);
  });

  test("tracking: same entity moved carries motion and age; new ones start at 0", () => {
    const prev: WorldEntity[] = [
      { age: 3, color: "#fff", dx: 0, dy: 2, h: 26, w: 26, x: 195, y: 350 },
      { age: 5, color: "#543847", dx: -150, dy: 0, h: 280, w: 52, x: 300, y: 180 },
    ];
    const snap = analyzeDraws(
      [rect(195, 380, 26, 26, "#fff"), rect(250, 180, 52, 280, "#543847")],
      prev,
      VP,
    );
    const bird = snap.entities.find((e) => e.w === 26)!;
    expect(bird.dy).toBeCloseTo(30, 0);
    expect(bird.age).toBe(4);
    const pipe = snap.entities.find((e) => e.w === 52)!;
    expect(pipe.dx).toBeCloseTo(-50, 0);
    expect(pipe.age).toBe(6);
  });

  test("player hint: smallest persistent cluster in the lower 2/3, age ≥ 2", () => {
    // realistic geometry: the wall occupies the upper band, the bird
    // flies BELOW it (an actor drawn inside a wall's bounds merges into
    // it — correct clustering, wrong test geometry)
    // three frames: appear (age 0), persist (1), persist again (2) —
    // the hint demands two consecutive survivals
    const f1 = analyzeDraws(
      [rect(195, 500, 26, 26, "#fff"), rect(195, 150, 300, 300, "#333")],
      [],
      VP,
    );
    const f2 = analyzeDraws(
      [rect(195, 501, 26, 26, "#fff"), rect(195, 150, 300, 300, "#333")],
      f1.entities,
      VP,
    );
    const snap = analyzeDraws(
      [rect(195, 502, 26, 26, "#fff"), rect(195, 150, 300, 300, "#333")],
      f2.entities,
      VP,
    );
    const hinted = snap.entities[snap.playerHint ?? -1];
    expect(hinted?.w).toBe(26); // the bird, not the wall
    expect(hinted?.age).toBeGreaterThanOrEqual(2);
  });

  test("hint stays null when nothing is persistent yet (first frame)", () => {
    const snap = analyzeDraws([rect(195, 500, 26, 26, "#fff")], [], VP);
    expect(snap.playerHint).toBeNull();
  });
});
