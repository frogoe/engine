/** sawstorm semantics — physics-inline game, so this reference is Tier-2
 *  dominant: behavior observed through recorded draws. The carry test
 *  pins this month's third real bug (a grounded actor hovers when the
 *  window grows, buries off-canvas when it shrinks — gravity branches
 *  don't run while grounded). TUNE-derived invariants cover Tier 1. */
import { test, expect } from "bun:test";
import { bootForTest } from "frogoe";

import { TUNE } from "./game.js";

const boot = () => bootForTest(new URL("./game.js", import.meta.url));

/** every numeric arg in a recorded call — positions (and the odd radius);
 *  x args can never exceed the narrow column, so values above the canvas
 *  height are always Y coordinates escaping the viewport */
const allNumbers = (game) =>
  game.draws().flatMap((c) => c.args.filter((a) => typeof a === "number"));

test("boots and a tap starts the run (ready veil off)", async () => {
  const game = await boot();
  expect(game.state()).toBe("playing");
  game.tap();
  // sawstorm clears body[data-ready] when the run starts
  expect(game.element("<body>").hasAttribute("data-ready")).toBeFalse();
});

test("TUNE physics invariants: the jump clears a saw, not the ceiling", () => {
  const apex = (TUNE.jumpV * TUNE.jumpV) / (2 * TUNE.gravity);
  expect(apex).toBeGreaterThan(120); // well above the biggest saw radius
  expect(apex).toBeLessThan(280); // and under the arena's usable height
  expect(TUNE.runSpeed).toBeGreaterThan(0);
  expect(TUNE.sawCap).toBeGreaterThan(3);
});

test("resize SHRINK: the actor rides the rising floor (bury bug)", async () => {
  const game = await boot();
  game.tap();
  for (let i = 0; i < 90; i++) game.step(1 / 60); // 1.5s: grounded on 844-field
  game.resizeTo(390, 640); // floor rises ~204px
  for (let i = 0; i < 30; i++) game.step(1 / 60);
  // without the carry, the grounded actor keeps its stale y (~780) —
  // draws 140px+ beyond the new canvas bottom. With it, everything
  // clamps fresh; small overshoots (floor/puff drawing) are legal, the
  // bug class lives 100px+ further down — 50 keeps the moat wide.
  for (const n of allNumbers(game).slice(-400)) {
    expect(n).toBeLessThanOrEqual(640 + 50);
  }
});

test("resize GROW→SHRINK roundtrip: an actor that ignores the dropping floor is caught when it rises back past it", async () => {
  const game = await boot();
  game.tap();
  for (let i = 0; i < 90; i++) game.step(1 / 60); // grounded at ~744 on an 844 field
  game.resizeTo(390, 1200); // floor drops to ~1088
  for (let i = 0; i < 20; i++) game.step(1 / 60);
  for (const n of allNumbers(game).slice(-200)) {
    expect(n).toBeLessThanOrEqual(1200 + 20); // nothing escaped during the grow
  }
  game.resizeTo(390, 640); // floor rises past the OLD ground
  for (let i = 0; i < 20; i++) game.step(1 / 60);
  // an actor that hovered at the stale ~744 while the floor dropped is
  // now 100px+ beneath the new canvas bottom — only the carry explains
  // every recorded coordinate staying inside
  for (const n of allNumbers(game).slice(-200)) {
    expect(n).toBeLessThanOrEqual(640 + 50);
  }
});
