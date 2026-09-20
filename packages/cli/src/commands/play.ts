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
import { executeCommand } from "../play-commands.ts";
import { createPuppeteerDriver, type LiveDriver } from "../live/driver.ts";

interface PlayOptions {
  cols: number;
  dir: string;
  fps: number;
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
    // evaluateOnNewDocument: retry buttons RELOAD the page (the scaffold
    // convention) — an in-page installer dies with the old document and
    // the agent goes blind right when it most needs eyes. This reinstalls
    // on every navigation, the same pattern the probe uses.
    await page.evaluateOnNewDocument(mapShotInstaller(palette, options.cols));
    await page.evaluate(mapShotInstaller(palette, options.cols));

    if (options.record !== null) {
      record = createRecord(options.dir, options.record);
      // session meta leads the evidence: detectors condition on it
      record.write({
        meta: { cols: options.cols, mode: options.mode, viewport: { h: 844, w: 390 } },
      });
    }

    let elapsed = 0;
    let finishesSeen = 0;
    const paused = options.mode === "step";
    if (paused) {
      await page.evaluate("window.__frogoe?.pause?.()");
    }

    let capturing = false;
    const emit = async (why: string): Promise<void> => {
      if (capturing) return; // one capture at a time — never queue them
      capturing = true;
      // self-contained: a tick racing browser.close() (quit during an
      // in-flight capture) must resolve, never reject the event loop
      try {
        const frame = await captureFrame(page);
        const state = (await driver.gameState()) as string;
        const finishes = await driver.finishEvents();
        const fresh = finishes.slice(finishesSeen);
        finishesSeen = finishes.length;
        const payload = {
          finishes: fresh.map((f) => f.score),
          frame: frame.plain,
          gate: frame.gate,
          live: frame.live ?? null,
          reason: why,
          score: frame.score,
          state,
          t: Math.round(elapsed * 100) / 100,
        };
        line(payload);
        record?.write({ ...payload, frame: undefined, plain: frame.plain });
      } catch {
        /* page closed mid-capture — the session is over anyway */
      } finally {
        capturing = false;
      }
    };

    line({
      legend:
        `bg '${palette.bg}' → .   fg '${palette.fg}' → O   accent '${palette.accent}' → X` +
        (palette.outline ? `   outline '${palette.outline}' → #` : "") +
        `   ramp @%&*8=+~;:,-^\`' (dark→light)   mode ${options.mode}`,
      version: (await driver.contractVersion()) as string,
    });
    await emit("boot");

    // SCREEN SHARE: frames flow at a steady cadence regardless of
    // commands — observation and action decoupled (the per-command
    // coupling deadlocked every time a command or its frame went
    // missing: agents waited for frames that only commands produce)
    const frameTimer = setInterval(
      () => {
        void emit("tick");
        elapsed += 1 / options.fps;
      },
      Math.max(100, Math.round(1000 / options.fps)),
    );

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
        const err = await executeCommand(cmd, {
          driver,
          page,
          paused,
          settle: options.settle,
          elapsed: () => elapsed,
          addElapsed: (sec) => {
            elapsed += sec;
          },
        });
        if (err === "__quit__") break;
        if (err !== null) line({ error: err });
        else {
          // actions belong to the evidence: recap correlates act → effect
          record?.write({ action: cmd, t: Math.round(elapsed * 100) / 100 });
        }
      } catch (error) {
        line({ error: String(error).slice(0, 160) });
      }
    }
    clearInterval(frameTimer);
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
    fps: {
      type: "string",
      description: "screen-share cadence, frames/second (default 2 in realtime mode)",
    },
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
      fps: mode === "realtime" ? numeric(args.fps, 2) : 0,
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
