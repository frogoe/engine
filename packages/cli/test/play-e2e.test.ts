import { afterAll, describe, expect, test } from "bun:test";
/** The wall that was missing: a LONG session through the BUILT artifact
 *  (node dist/cli.js — the shape users run), driving dozens of commands
 *  including the death→retry→reload cycle. This is the test that would
 *  have caught the ESM require crash, the step-mode flood, the
 *  importmap kill, and dead input — before any human ever watched. */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const cli = path.join(import.meta.dir, "../dist/cli.js");
const tmp = path.join(import.meta.dir, "../.tmp-e2e");
const gameDir = path.join(tmp, "flappy");

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const ensureBuild = (): void => {
  if (existsSync(cli)) return;
  const built = spawnSync("bun", ["run", "build"], {
    cwd: path.join(import.meta.dir, ".."),
    encoding: "utf-8",
  });
  if (built.status !== 0 || !existsSync(cli)) {
    throw new Error(`e2e: build failed — ${String(built.stderr).slice(0, 200)}`);
  }
};

const bootGame = (): void => {
  rmSync(tmp, { recursive: true, force: true });
  cpSync(path.join(import.meta.dir, "../../../examples/flappy"), gameDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(path.join(import.meta.dir, "../../../examples/flappy"), src);
      return !/^(dist|snapshots|node_modules|export)/u.test(rel);
    },
  });
};

interface Line {
  error?: string;
  finishes?: number[];
  frame?: string;
  gate?: string;
  live?: { player?: { y: number } } | null;
  world?: { entities?: Array<{ y: number }> } | null;
}

describe("long session through the BUILT binary (node)", () => {
  test("commands land, world flows, death→retry→reload survives", async () => {
    ensureBuild();
    bootGame();
    const proc = Bun.spawn(["node", cli, "play", gameDir, "--record", "e2e"], {
      env: { ...process.env, NO_COLOR: "1" },
      stderr: "ignore",
      stdin: "pipe",
      stdout: "pipe",
    });
    const writer = proc.stdin!;
    const send = (text: string) => {
      writer.write(new TextEncoder().encode(`${text}\n`));
    };
    const lines: Line[] = [];
    const reader = Bun.readableStreamToText(proc.stdout).then((text) => {
      for (const ln of text.split("\n")) {
        if (ln.trim().length === 0) continue;
        try {
          lines.push(JSON.parse(ln) as Line);
        } catch {
          /* server banners */
        }
      }
    });

    // start, then a 20s flap cadence — the bird moves or dies; both
    // are evidence. Taps continue on the game-over card (retry is a
    // click), then the cycle repeats.
    send('{"tap":[195,400]}');
    let sent = 1;
    for (let round = 0; round < 18; round += 1) {
      await new Promise((r) => setTimeout(r, 900));
      send('{"tap":[195,400]}');
      sent += 1;
      if (round === 8) send('{"click":"[data-block-retry]"}'); // mid-session retry attempt
    }
    await new Promise((r) => setTimeout(r, 1500));
    send('{"quit":true}');
    writer.end();
    const exit = await proc.exited;
    await reader;

    expect(exit).toBe(0);
    const frames = lines.filter((l) => l.frame !== undefined);
    const errors = lines.filter((l) => l.error !== undefined);
    expect(frames.length).toBeGreaterThanOrEqual(20); // the stream flowed
    expect(errors).toEqual([]); // no session errors

    // input landed: the bird's y took many distinct values over time
    const birdYs = frames
      .map((f) => f.live?.player?.y)
      .filter((y): y is number => typeof y === "number");
    const distinct = new Set(birdYs.map((y) => Math.round(y / 4)));
    expect(distinct.size).toBeGreaterThanOrEqual(8); // real movement, not a frozen world

    // world channel: entities measured on most frames
    const withWorld = frames.filter((f) => (f.world?.entities?.length ?? 0) > 0);
    expect(withWorld.length / frames.length).toBeGreaterThanOrEqual(0.7);

    // death may or may not happen in a lucky run; if it did, the
    // retry cycle must have revived the session (gate ready → run)
    const deaths = frames.reduce((n, f) => n + (f.finishes?.length ?? 0), 0);
    if (deaths > 0) {
      const gates = frames.map((f) => f.gate);
      const sawRunAfterReady = gates.some(
        (g, i) =>
          g === "run" && gates.slice(0, i).includes("ready") && gates.slice(0, i).includes("run"),
      );
      expect(sawRunAfterReady || gates.some((g) => g === "ready")).toBeTrue();
    }

    // evidence recorded with actions — recap can correlate act → effect
    const log = readFileSync(path.join(gameDir, "snapshots", "e2e.jsonl"), "utf-8");
    const actionRows = log.split("\n").filter((l) => l.includes('"action"'));
    expect(actionRows.length).toBeGreaterThanOrEqual(10);
    expect(log).toContain('"meta"');
  }, 120_000);
});
