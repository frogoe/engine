/** frogoe check — live entry. Owns the environment (dev server, headless
 *  chrome, snapshot dir) and wires viewports to the phase runner:
 *  desktop gets boot + FPS, mobile gets the full lifecycle
 *  (boot → play → end → retry → stability). */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createPuppeteerDriver } from "./driver.ts";
import { runDesktopPass, runLifecycle, sleep } from "./phases.ts";
import type { LiveFinding, LiveMetrics, LiveOptions, LiveResult } from "./types.ts";

export type { LiveResult, LiveOptions } from "./types.ts";
export type { LiveDriver } from "./driver.ts";

const VIEWPORTS = [
  { height: 844, name: "mobile", width: 390 },
  { height: 800, name: "desktop", width: 1280 },
];

let browserPath: string | undefined;

const ensureBrowser = async (): Promise<string> => {
  if (browserPath) {
    return browserPath;
  }
  const { Browser, getInstalledBrowsers, install } = await import("@puppeteer/browsers");
  const cacheDir = path.resolve(process.cwd(), "node_modules/.frogoe-browser");
  const installed = await getInstalledBrowsers({ cacheDir });
  const existing = installed.find((b) => b.browser === Browser.CHROMEHEADLESSSHELL);
  browserPath =
    existing?.executablePath ??
    (
      await install({
        browser: Browser.CHROMEHEADLESSSHELL,
        buildId: "131.0.6778.204",
        cacheDir,
        unpack: true,
      })
    ).executablePath;
  return browserPath;
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

  const { default: puppeteer } = await import("puppeteer-core");
  const executablePath = await ensureBrowser();
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-gpu"],
    defaultViewport: null,
    executablePath,
    headless: true,
  });

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
            settleMs: settle,
            shot,
            viewport,
          });
          findings.push(...outcome.findings);
          metrics.playability = outcome.playability;
          metrics.lifecycle = outcome.lifecycle;
          if (outcome.mobileFps !== undefined) {
            metrics.mobileFps = outcome.mobileFps;
          }
        } else {
          const outcome = await runDesktopPass(driver, { shot, viewport });
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
