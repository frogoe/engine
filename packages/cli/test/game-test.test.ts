import { afterAll, describe, expect, test } from "bun:test";
/** game.test.js pipeline: the materialized node_modules/frogoe stub, the
 *  bootForTest drive API, and the check runner's finding shapes — all
 *  proven against real fixture games executed by a real nested bun test
 *  run (exactly what `frogoe check` does). */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ensureTestStub } from "../src/game-test/materialize.ts";
import { runGameTests } from "../src/game-test/runner.ts";

const tmp = path.join(import.meta.dir, "../.tmp-game-test");
const gameDir = path.join(tmp, "game");

const writeGame = (gameJs: string, testJs: string | null): void => {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(gameDir, { recursive: true });
  writeFileSync(
    path.join(gameDir, "BRIEF.md"),
    '---\ntitle: T\nverb: tap\nmood: m\npalette:\n  bg: "#101418"\n  fg: "#fff"\n  accent: "#ffd"\n---\nx\n',
  );
  writeFileSync(path.join(gameDir, "frogoe.json"), JSON.stringify({ contract: "0.2.0" }));
  writeFileSync(path.join(gameDir, "game.js"), gameJs);
  if (testJs !== null) writeFileSync(path.join(gameDir, "game.test.js"), testJs);
};

const FIXTURE_GAME = `import { defineGame } from "frogoe";
export const TUNE = { speed: 120 };
defineGame(({ stage, input, loop, finish }) => {
  let y = 100, score = 0, dead = false;
  const kb = document.querySelector("[data-kb]");
  input.on("down", () => { score += 1; });
  input.on("key", (k) => { if (k.key === "x") score += 10; });
  loop.update = (dt) => {
    y += TUNE.speed * dt;
    const floor = kb && kb.offsetHeight > 0 ? kb.getBoundingClientRect().top : stage.height - 64;
    if (y >= floor && !dead) { dead = true; finish(score); }
  };
  loop.render = (ctx) => { ctx.fillStyle = "#fff"; ctx.fillRect(stage.play.center - 5, y, 10, 10); };
});
`;

const FIXTURE_TEST = `import { test, expect } from "bun:test";
import { bootForTest } from "frogoe";

test("boots, plays, dies on the keyboard top, scores along the way", async () => {
  const game = await bootForTest(new URL("./game.js", import.meta.url));
  expect(game.state()).toBe("playing");
  game.tap();
  game.type("x"); // +10 through the key verb
  game.element("[data-kb]").rect = { height: 208, left: 0, top: 626, width: 390 };
  for (let i = 0; i < 300; i++) game.step(1 / 60);
  expect(game.state()).toBe("over");
  expect(game.finishes()).toHaveLength(1);
  expect(game.finishes()[0]?.score).toBe(11);
  expect(game.drew((c) => c.name === "fillRect" && c.args[1] < 626)).toBeTrue();
});

test("resize keeps draws inside the capped play column", async () => {
  const game = await bootForTest(new URL("./game.js", import.meta.url));
  game.resizeTo(780, 844);
  for (let i = 0; i < 5; i++) game.step(1 / 60);
  const fills = game.draws().filter((c) => c.name === "fillRect");
  expect(fills.length).toBeGreaterThan(0);
  for (const c of fills) {
    expect(c.args[0]).toBeGreaterThanOrEqual(game.stage.play.left - 5);
    expect(c.args[0]).toBeLessThanOrEqual(game.stage.play.right + 5);
  }
});
`;

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("game-test materialization", () => {
  test("writes node_modules/frogoe once, idempotently, with gitignore", () => {
    writeGame(FIXTURE_GAME, FIXTURE_TEST);
    const first = ensureTestStub(gameDir);
    expect("ok" in first).toBeTrue();
    const pkg = readFileSync(path.join(gameDir, "node_modules", "frogoe", "package.json"), "utf-8");
    expect(JSON.parse(pkg).name).toBe("frogoe");
    const second = ensureTestStub(gameDir);
    expect("ok" in second).toBeTrue();
    expect(readFileSync(path.join(gameDir, ".gitignore"), "utf-8")).toContain("node_modules/");
  });

  test("fast-check import wires the dependency (installed, pinned, gitignored)", () => {
    writeGame(
      FIXTURE_GAME,
      `import { test, expect } from "bun:test";
import fc from "fast-check";
test("prop", () => { fc.assert(fc.property(fc.integer(), (n) => n === n)); });`,
    );
    const result = runGameTests(gameDir);
    expect(result.findings).toEqual([]);
    const pkg = JSON.parse(readFileSync(path.join(gameDir, "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["fast-check"]).toBeDefined();
    expect(readFileSync(path.join(gameDir, ".gitignore"), "utf-8")).toContain("bun.lock");
    // idempotent: a second pass adds nothing, breaks nothing
    const again = runGameTests(gameDir);
    expect(again.findings).toEqual([]);
  }, 120_000);

  test("a foreign frogoe package is never clobbered — teaching error", () => {
    writeGame(FIXTURE_GAME, FIXTURE_TEST);
    const foreign = path.join(gameDir, "node_modules", "frogoe");
    mkdirSync(foreign, { recursive: true });
    writeFileSync(path.join(foreign, "package.json"), '{"name":"frogoe","main":"evil.js"}');
    const result = ensureTestStub(gameDir);
    expect("error" in result).toBeTrue();
    expect(readFileSync(path.join(foreign, "package.json"), "utf-8")).toContain("evil.js");
  });
});

describe("game-test runner (real nested bun test runs)", () => {
  test("no game.test.js → no findings, ran=false", () => {
    writeGame(FIXTURE_GAME, null);
    const result = runGameTests(gameDir);
    expect(result.ran).toBeFalse();
    expect(result.findings).toEqual([]);
  });

  test("passing suite → zero findings", () => {
    writeGame(FIXTURE_GAME, FIXTURE_TEST);
    const result = runGameTests(gameDir);

    expect(result.ran).toBeTrue();
    expect(result.findings).toEqual([]);
  }, 60_000);

  test("failing suite → test/failed with the failing names", () => {
    writeGame(
      FIXTURE_GAME,
      `import { test, expect } from "bun:test";
test("scoring math", () => { expect(1 + 1).toBe(3); });`,
    );
    const result = runGameTests(gameDir);
    const failed = result.findings.find((f) => f.code === "test/failed");
    expect(failed?.severity).toBe("error");
    expect(failed?.fix).toContain("scoring math");
  }, 60_000);

  test("crashed suite (syntax) → test/crash", () => {
    writeGame(FIXTURE_GAME, `this is not ) valid javascript`);
    const result = runGameTests(gameDir);
    expect(result.findings.some((f) => f.code === "test/crash")).toBeTrue();
  }, 60_000);

  test("hanging suite → test/timeout", () => {
    writeGame(
      FIXTURE_GAME,
      `import { test } from "bun:test";
test("forever", () => { while (true) {} });`,
    );
    const result = runGameTests(gameDir, { timeoutMs: 3_000 });
    expect(result.findings.some((f) => f.code === "test/timeout")).toBeTrue();
  }, 60_000);
});
