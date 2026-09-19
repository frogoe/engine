/** flappy semantics — the tap-verb reference: tests are OPTIONAL for tap
 *  games (the blind sandbox proves they play), but scoring/collision
 *  semantics earn their keep when they exist. Deterministic windows: the
 *  bird bobs frozen until the first tap (pipes wait too), a single flap
 *  with no follow-up loses to the ground before the first pipe arrives. */
import { test, expect } from "bun:test";
import { bootForTest } from "frogoe";

const boot = () => bootForTest(new URL("./game.js", import.meta.url));

/** the bird's absolute position — drawBird translate(x, y) is the only
 *  translate anchored at the play column (pipes sit x ≥ 415 until well
 *  after these test windows) */
const birdYs = (game) =>
  game
    .draws()
    .filter(
      (c) =>
        c.name === "translate" &&
        typeof c.args[0] === "number" &&
        Math.abs(c.args[0] - game.stage.play.center) <= 40,
    )
    .map((c) => c.args[1]);

test("ready bob: alive, dancing in place, nothing dies", async () => {
  const game = await boot();
  for (let i = 0; i < 60; i++) game.step(1 / 60); // 1s pre-tap
  expect(game.state()).toBe("playing");
  expect(game.finishes()).toEqual([]);
  // the bob stays within ±6 of start (height * 0.4 = 337.6)
  const ys = birdYs(game);
  expect(ys.length).toBeGreaterThan(0);
  for (const y of ys.slice(-80)) {
    expect(y).toBeGreaterThan(325);
    expect(y).toBeLessThan(370);
  }
});

test("the flap impulse lifts the bird out of the bob band", async () => {
  const game = await boot();
  for (let i = 0; i < 60; i++) game.step(1 / 60); // settled bob
  game.tap(); // vy = -380
  for (let i = 0; i < 6; i++) game.step(1 / 60); // ~100ms post-flap
  // bob floor ≈ 349, post-flap frames reach ≤ 339 — 345 splits the band
  const lift = birdYs(game).slice(-20).filter((y) => y < 345);
  expect(lift.length).toBeGreaterThan(0); // rose past the bob band
});

test("one flap, no follow-up: the ground wins the race (death, score 0)", async () => {
  const game = await boot();
  game.tap();
  // fall: ~0.27s rise + ~0.95s to the ground line ≈ 75 frames; the first
  // pipe needs 1.57s to even reach the bird — the ground is deterministic
  for (let i = 0; i < 150; i++) game.step(1 / 60);
  expect(game.state()).toBe("over");
  expect(game.finishes()).toHaveLength(1);
  expect(game.finishes()[0]?.score).toBe(0);
  // the card opens on a real 300ms setTimeout after death — give it wall
  // time, then it must be open with the final score inside
  await new Promise((resolve) => setTimeout(resolve, 400));
  const card = game.element("[data-block-gameover]");
  expect(card.hasAttribute("data-open")).toBeTrue();
  // nested lookup: the game writes through card.querySelector — the
  // stub keys nested fakes by their composite path
  expect(game.element("[data-block-gameover] > [data-block-final]").textContent).toBe("0");
});
