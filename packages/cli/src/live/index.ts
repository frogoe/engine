/** frogoe check — live entry. Owns the environment (dev server, headless
 *  chrome, snapshot dir) and wires viewports to the phase runner:
 *  desktop gets boot + FPS, mobile gets the full lifecycle
 *  (boot → play → end → retry → stability). The BRIEF's declared verb
 *  selects the scripted input ladder; its session shapes the end-of-run
 *  policy (see decisions.ts). */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseBrief, SESSIONS, VERBS } from "@frogoe/lint";

import { launchBrowser } from "../browser/launch.ts";
import { legacyCacheDir } from "../browser/manager.ts";
import { registryRoot } from "../init.ts";
import { createPuppeteerDriver } from "./driver.ts";
import { runDesktopPass, runLifecycle, sleep } from "./phases.ts";
import type { LiveFinding, LiveMetrics, LiveOptions, LiveResult } from "./types.ts";

export type { LiveResult, LiveOptions } from "./types.ts";
export type { LiveDriver } from "./driver.ts";

const VIEWPORTS = [
  { height: 844, name: "mobile", width: 390 },
  { height: 800, name: "desktop", width: 1280 },
];

/** Declared intent from BRIEF.md, defensive: the static pass already
 *  flags a bad verb/session — the sandbox just needs sane defaults. */
const declaredIntent = (dir: string): { session: string; verb: string } => {
  try {
    const brief = parseBrief(readFileSync(path.join(dir, "BRIEF.md"), "utf-8"));
    return {
      session:
        brief?.session !== undefined && SESSIONS.includes(brief.session as never)
          ? brief.session
          : "blitz",
      verb: brief?.verb !== undefined && VERBS.includes(brief.verb as never) ? brief.verb : "tap",
    };
  } catch {
    return { session: "blitz", verb: "tap" };
  }
};

/** Registry block bindings → placement, for the anchor gate. bindings[0]
 *  is the block's ROOT element (registry convention — the inner bindings
 *  like data-block-retry live INSIDE the root and must not be checked).
 *  The registry is the single source of which blocks self-position;
 *  unknown blocks are simply not checked (no false positives). */
const loadBlockBindings = (): Record<string, string> => {
  const map: Record<string, string> = {};
  try {
    const root = registryRoot();
    const items = JSON.parse(readFileSync(path.join(root, "registry.json"), "utf-8")) as {
      items: Array<{ name: string }>;
    };
    for (const entry of items.items) {
      try {
        const item = JSON.parse(
          readFileSync(path.join(root, "blocks", entry.name, "registry-item.json"), "utf-8"),
        ) as { bindings?: string[]; placement?: string };
        const rootBinding = item.bindings?.[0];
        if (rootBinding !== undefined) {
          map[rootBinding] = item.placement ?? "overlay";
        }
      } catch {
        // unreadable item — the registry validator owns that failure
      }
    }
  } catch {
    // no registry resolvable (unusual layouts) — the gate no-ops
  }
  return map;
};

const waitForServer = async (url: string): Promise<void> => {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) {
        return;
      }
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
};

export const collectLive = async (options: LiveOptions): Promise<LiveResult> => {
  const dir = path.resolve(options.dir);
  const settle = options.settleMs ?? 2000;
  const findings: LiveFinding[] = [];
  const screenshots: string[] = [];
  const metrics: LiveMetrics = {
    lifecycle: { ends: false, retryReloads: 0 },
    playability: "no-input",
  };

  const { startServer } = await import("../run.ts");
  const server = await startServer(dir);
  const snapshotDir = path.join(dir, "snapshots");
  mkdirSync(snapshotDir, { recursive: true });
  const intent = declaredIntent(dir);
  const bindings = loadBlockBindings();

  const browser = await launchBrowser({ legacyDirs: [legacyCacheDir(dir)] });

  try {
    let serverReady = false;
    for (const viewport of VIEWPORTS) {
      const runViewport = async (viewport: (typeof VIEWPORTS)[number]): Promise<void> => {
        const page = await browser.newPage();
        await page.setViewport({ height: viewport.height, width: viewport.width });
        // driver BEFORE goto: the probe installs via evaluateOnNewDocument
        // and must be registered before the first navigation
        const driver = createPuppeteerDriver({
          page,
          size: { height: viewport.height, width: viewport.width },
        });
        const shot = async (name: string): Promise<void> => {
          writeFileSync(path.join(snapshotDir, name), await driver.screenshot());
          screenshots.push(path.join("snapshots", name));
        };

        if (!serverReady) {
          // wait for the dev server to answer before navigating (cold start)
          await waitForServer(server.urls.local);
          serverReady = true;
        }
        // domcontentloaded: the reload EventSource is a live connection and
        // slow dev-time CDN fonts must not block the sandbox
        // timeout: slow CDN fonts or cold browser start must not hang the sandbox
        await page.goto(server.urls.local, { timeout: 15_000, waitUntil: "domcontentloaded" });
        await sleep(settle);

        if (viewport.name === "mobile") {
          const outcome = await runLifecycle(driver, {
            blockBindings: bindings,
            settleMs: settle,
            shot,
            verb: intent.verb,
            session: intent.session,
            viewport,
          });
          findings.push(...outcome.findings);
          metrics.playability = outcome.playability;
          metrics.lifecycle = outcome.lifecycle;
          if (outcome.mobileFps !== undefined) {
            metrics.mobileFps = outcome.mobileFps;
          }
        } else {
          const outcome = await runDesktopPass(driver, {
            blockBindings: bindings,
            shot,
            viewport,
          });
          findings.push(...outcome.findings);
          if (outcome.fps !== undefined) {
            metrics.desktopFps = outcome.fps;
          }
        }
        await page.close();
      };

      try {
        await runViewport(viewport);
      } catch (error) {
        // a sandbox crash is a finding, not a dead CLI (HyperFrames
        // runtimeFindings pattern) — the static pass still reports
        findings.push({
          code: "live/runtime-failure",
          file: "game.js",
          fix: `the live sandbox crashed on ${viewport.name}: ${String(error).slice(0, 140)}`,
          message: `live sandbox failure [${viewport.name}]`,
          phase: "boot",
          severity: "error",
        });
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }

  return { findings, metrics, screenshots };
};
