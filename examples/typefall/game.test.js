/** typefall semantics — the logic the blind sandbox cannot judge:
 *  lifecycle (die with zero input), the keyboard-bounded field (the ship
 *  bug: height-minus-offsetHeight math buried it behind the tray), and
 *  the resize remap (aliens keep their spread inside the play column).
 *  Deterministic by construction: seeded rng, fixed-dt steps. */
import { test, expect } from "bun:test";
import { bootForTest } from "frogoe";

const boot = () => bootForTest(new URL("./game.js", import.meta.url));

test("boots, a tap opens the run (keyboard tray docks)", async () => {
  const game = await boot();
  expect(game.state()).toBe("playing");
  game.tap();
  expect(game.element("[data-block-keyboard]").hasAttribute("data-open")).toBeTrue();
});

test("an untouched field drains three lives and finishes once, score 0", async () => {
  const game = await boot();
  game.tap();
  // first alien reaches the lose line ~19s in at 38 px/s, the stack
  // follows ~2s apart — 1500 fixed steps (25 s) covers three lives
  for (let i = 0; i < 1500; i++) game.step(1 / 60);
  expect(game.state()).toBe("over");
  expect(game.finishes()).toHaveLength(1);
  expect(game.finishes()[0]?.score).toBe(0);
});

test("the play floor follows the keyboard's true top edge, not flush-bottom math", async () => {
  const game = await boot();
  // a decisively non-flush tray: top at 400 (bottom 600) in an 844 field.
  // correct fieldBottom → lose line at 300 → first life lost ≈ 9 s.
  // the old height-minus-offsetHeight math put the line at 544 ≈ 15.5 s —
  // 650 steps (10.8 s) separates the two with a wide margin
  game.element("[data-block-keyboard]").rect = { height: 200, left: 0, top: 400, width: 390 };
  game.tap();
  for (let i = 0; i < 650; i++) game.step(1 / 60);
  const hearts = game.element("[data-block-hearts]");
  expect(Number(hearts.dataset.value ?? "3")).toBeLessThan(3);
});

test("resize remaps the field — alien chips follow the moving column", async () => {
  const game = await boot();
  game.tap();
  for (let i = 0; i < 240; i++) game.step(1 / 60); // ~4s: aliens on screen
  // widen to 780: the play column SHIFTS RIGHT (play.left 0 → 160).
  // aliens spawned under the 390 field sit at x ∈ [66, 324] — without a
  // remap they stay left of the new column; with it, the whole spread
  // rides into [226, 548]. Chips carry the alien x (word letters).
  game.resizeTo(780, 844);
  for (let i = 0; i < 20; i++) game.step(1 / 60);
  const chips = game
    .draws()
    .filter(
      (c) =>
        c.name === "fillText" &&
        typeof c.args[0] === "string" &&
        c.args[0].length === 1 &&
        typeof c.args[1] === "number",
    )
    .map((c) => c.args[1]);
  expect(chips.length).toBeGreaterThan(0);
  const { left, right } = game.stage.play;
  expect(left).toBe(160); // the harness mirrors the contract cap (460)
  for (const x of chips.slice(-60)) {
    // word chips may overhang the alien x by half a word — 70px covers
    // the longest words; the no-remap failure mode sits ~130px further left
    expect(x).toBeGreaterThanOrEqual(left - 70);
    expect(x).toBeLessThanOrEqual(right + 70);
  }
});
