/** frogoe play — the agent's hands. Boots the game in headless Chrome and
 *  speaks JSONL over stdio: frames OUT (ASCII eyes, palette-aware — the
 *  same cartography as `frogoe vision`), input commands IN (tap / press /
 *  type / drag / step / resize / quit — the contract's semantic verbs).
 *
 *  Time model: `step` mode (default) PAUSES the game between commands via
 *  the contract's own window.__frogoe.pause() — the world is frozen while
 *  the agent thinks, `{"step":30}` advances exactly half a second. An LLM
 *  can beat flappy like chess. `realtime` never pauses: for scripts and
 *  heuristics, where dying is difficulty data, not failure.
 *
 *  `--record` logs every frame + input to snapshots/play-session.jsonl —
 *  diffable evidence, the seed of `frogoe certify`. */
import { mkdirSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

import { defineCommand } from "citty";

import { parseBrief } from "@frogoe/lint";

import { launchBrowser } from "../browser/launch.ts";
import { legacyCacheDir } from "../browser/manager.ts";
import { captureFrame, mapShotInstaller } from "../eyes-frame.ts";
import { createPuppeteerDriver, type LiveDriver } from "../live/driver.ts";

interface PlayOptions {
  cols: number;
  dir: string;
  headed: boolean;
  mode: "realtime" | "step";
  record: string | null;
  settle: number;
}

const line = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const runSession = async (options: PlayOptions): Promise<void> => {
  const { startServer } = await import("../run.ts");
  const server = await startServer(options.dir);
  const brief = parseBrief(readFileSync(path.join(options.dir, "BRIEF.md"), "utf-8"));
  const palette = {
    accent: brief?.accent ?? "#ff3b3b",
    bg: brief?.bg ?? "#101418",
    fg: brief?.fg ?? "#ffffff",
    ...(brief?.outline ? { outline: brief.outline } : {}),
  };

  const browser = await launchBrowser({
    headless: !options.headed,
    legacyDirs: [legacyCacheDir(options.dir)],
  });
  let record: ReturnType<typeof createRecord> | null = null;
  try {
    const page = await browser.newPage();
    await page.setViewport({ height: 844, width: 390 });
    if (options.headed) {
      // bring the window forward — a demo hidden behind other windows
      // is a demo nobody watched (twice)
      const { spawn } = await import("node:child_process");
      spawn("open", ["-a", "Google Chrome"], { stdio: "ignore" }).on("error", () => {});
    }
    const driver: LiveDriver = createPuppeteerDriver({
      page,
      size: { height: 844, width: 390 },
    });
    // wait for the dev server before navigating (cold start)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await fetch(server.urls.local, { method: "HEAD" });
        break;
      } catch {
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
      }
    }
    await page.goto(server.urls.local, { timeout: 15_000, waitUntil: "domcontentloaded" });
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
    await page.evaluate(mapShotInstaller(palette, options.cols));

    if (options.record !== null) {
      record = createRecord(options.dir, options.record);
    }

    let elapsed = 0;
    let finishesSeen = 0;
    const paused = options.mode === "step";
    if (paused) {
      await page.evaluate("window.__frogoe?.pause?.()");
    }

    const emit = async (why: string): Promise<void> => {
      const frame = await captureFrame(page);
      const state = (await driver.gameState()) as string;
      const finishes = await driver.finishEvents();
      const fresh = finishes.slice(finishesSeen);
      finishesSeen = finishes.length;
      const payload = {
        finishes: fresh.map((f) => f.score),
        frame: frame.plain,
        reason: why,
        state,
        t: Math.round(elapsed * 100) / 100,
      };
      line(payload);
      record?.write({ ...payload, frame: undefined, plain: frame.plain });
    };

    line({
      legend:
        `bg '${palette.bg}' → .   fg '${palette.fg}' → O   accent '${palette.accent}' → X` +
        (palette.outline ? `   outline '${palette.outline}' → #` : "") +
        `   ramp @%&*8=+~;:,-^\`' (dark→light)   mode ${options.mode}`,
      version: (await driver.contractVersion()) as string,
    });
    await emit("boot");

    const settle = async (): Promise<void> => {
      // unpause for exactly `settle` frames (~16.7ms each), then freeze
      if (paused) {
        await page.evaluate("window.__frogoe?.resume?.()");
      }
      await new Promise((resolve) => {
        setTimeout(resolve, (options.settle * 1000) / 60);
      });
      if (paused) {
        await page.evaluate("window.__frogoe?.pause?.()");
      }
      elapsed += options.settle / 60;
    };

    const commands = createInterface({ input: process.stdin });
    const done = new Promise<void>((resolve) => {
      commands.once("close", resolve);
    });
    for await (const raw of commands) {
      const text = raw.trim();
      if (text.length === 0) continue;
      let cmd: Record<string, unknown>;
      try {
        cmd = JSON.parse(text) as Record<string, unknown>;
      } catch {
        line({ error: `not JSON: ${text.slice(0, 80)}` });
        continue;
      }
      if (cmd.quit === true) break;
      try {
        if (typeof cmd.step === "number" || Array.isArray(cmd.step)) {
          const n = Math.max(
            1,
            Math.min(600, Number(Array.isArray(cmd.step) ? cmd.step[0] : cmd.step) || 1),
          );
          options.settle = n;
          await settle();
          options.settle = 10;
        } else if (Array.isArray(cmd.tap)) {
          await settle();
          await driver.tap(Number(cmd.tap[0]), Number(cmd.tap[1]));
        } else if (typeof cmd.press === "string") {
          await settle();
          await driver.press(cmd.press);
        } else if (Array.isArray(cmd.hold)) {
          // {"hold":["ArrowLeft",30]} — steer: key down, N frames, key up
          const [code, frames] = [String(cmd.hold[0] ?? ""), Number(cmd.hold[1] ?? 20)];
          if (paused) {
            await page.evaluate("window.__frogoe?.resume?.()");
          }
          await driver.holdKey(code, frames);
          elapsed += frames / 60;
          if (paused) {
            await page.evaluate("window.__frogoe?.pause?.()");
          }
        } else if (typeof cmd.type === "string") {
          await settle();
          await driver.type(cmd.type);
        } else if (Array.isArray(cmd.drag) && cmd.drag.length === 4) {
          await settle();
          await driver.drag(
            Number(cmd.drag[0]),
            Number(cmd.drag[1]),
            Number(cmd.drag[2]),
            Number(cmd.drag[3]),
          );
        } else if (Array.isArray(cmd.resize) && cmd.resize.length === 2) {
          await page.setViewport({
            height: Number(cmd.resize[1]),
            width: Number(cmd.resize[0]),
          });
        } else {
          line({ error: "unknown command — tap|press|type|drag|step|resize|quit" });
          continue;
        }
        if (
          typeof cmd.step !== "number" &&
          !Array.isArray(cmd.step) &&
          !Array.isArray(cmd.resize)
        ) {
          await new Promise((resolve) => {
            setTimeout(resolve, 120);
          });
          if (paused) {
            await page.evaluate("window.__frogoe?.pause?.()");
          }
        }
        await emit(String(Object.keys(cmd)[0] ?? "?"));
      } catch (error) {
        line({ error: String(error).slice(0, 160) });
      }
    }
    commands.close(); // quit must EXIT: a held-open stdin keeps node alive
    await done;
  } finally {
    await browser.close();
    server.stop();
    record?.close();
  }
};

const createRecord = (dir: string, name: string) => {
  const file = path.join(dir, "snapshots", name.endsWith(".jsonl") ? name : `${name}.jsonl`);
  mkdirSync(path.dirname(file), { recursive: true });
  const { appendFileSync } = require("node:fs") as typeof import("node:fs");
  return {
    close() {
      /* append-per-write: nothing to flush */
    },
    write(entry: unknown) {
      appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf-8");
    },
  };
};

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    headed: {
      type: "boolean",
      description: "open a REAL visible Chrome window — watch the agent play",
    },
    cols: { type: "string", description: "frame width in characters (default 96)" },
    mode: { type: "string", description: "step (default: paused between commands) | realtime" },
    record: { type: "string", description: "session log name (snapshots/<name>.jsonl)" },
    settle: { type: "string", description: "frames advanced per input (default 10)" },
  },
  async run({ args }) {
    const dir = args.dir ? path.resolve(String(args.dir)) : process.cwd();
    const mode = args.mode === "realtime" ? "realtime" : "step";
    const numeric = (value: unknown, fallback: number): number => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    await runSession({
      cols: numeric(args.cols, 96),
      dir,
      headed: args.headed === true,
      mode,
      record: typeof args.record === "string" ? args.record : null,
      settle: numeric(args.settle, 10),
    });
  },
  meta: {
    description:
      "agent eyes + hands: JSONL frames out, contract input in — step mode freezes the world between commands",
  },
});
