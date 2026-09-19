/** One launch site for every Chrome session the CLI opens (live sandbox,
 *  art rasterizer, vision, embed e2e): explicit, env-tunable budgets.
 *  puppeteer's silent 30 s launch default is exactly the timeout users
 *  hit on cold or loaded machines — 120 s launch / 300 s protocol are
 *  the hyperframes production defaults, overridable via
 *  FROGOE_LAUNCH_TIMEOUT_MS / FROGOE_PROTOCOL_TIMEOUT_MS (positive
 *  integers only: 0 means "forever" to puppeteer and is rejected).
 *  Launch failures are wrapped in teaching errors that name the knob
 *  instead of dumping a stack trace. */
import type { Browser, LaunchOptions } from "puppeteer-core";

import { existsSync } from "node:fs";

import { ensureBrowser, positiveIntEnv, wrapLaunchFailure } from "./manager.ts";

const LAUNCH_TIMEOUT_ENV = "FROGOE_LAUNCH_TIMEOUT_MS";
const PROTOCOL_TIMEOUT_ENV = "FROGOE_PROTOCOL_TIMEOUT_MS";
const DEFAULT_LAUNCH_TIMEOUT_MS = 120_000;
const DEFAULT_PROTOCOL_TIMEOUT_MS = 300_000;

export interface LaunchBudgets {
  launchMs: number;
  protocolMs: number;
}

export const launchBudgets = (env: NodeJS.ProcessEnv = process.env): LaunchBudgets => ({
  launchMs: positiveIntEnv(LAUNCH_TIMEOUT_ENV, env[LAUNCH_TIMEOUT_ENV], DEFAULT_LAUNCH_TIMEOUT_MS),
  protocolMs: positiveIntEnv(
    PROTOCOL_TIMEOUT_ENV,
    env[PROTOCOL_TIMEOUT_ENV],
    DEFAULT_PROTOCOL_TIMEOUT_MS,
  ),
});

export interface LaunchBrowserOptions {
  /** null (default) lets the page size itself; vision passes a viewport */
  defaultViewport?: LaunchOptions["defaultViewport"];
  /** legacy per-project caches to migrate from / prune */
  legacyDirs?: readonly string[];
  /** false opens a REAL, visible Chrome window (frogoe play --headed —
   *  watch the agent play). The managed cache is headless-shell only, so
   *  headed resolves the system Chrome install. */
  headless?: boolean;
}

const SYSTEM_CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export const launchBrowser = async (options?: LaunchBrowserOptions): Promise<Browser> => {
  const { default: puppeteer } = await import("puppeteer-core");
  const budgets = launchBudgets();
  const headed = options?.headless === false;
  let executablePath = await ensureBrowser({ legacyDirs: options?.legacyDirs });
  if (headed) {
    const system = SYSTEM_CHROME.find((candidate) => existsSync(candidate));
    if (system === undefined) {
      throw new Error(
        "frogoe: --headed needs a system Chrome (the managed cache is headless-only) — install Google Chrome, then re-run",
      );
    }
    executablePath = system;
  }
  try {
    return await puppeteer.launch({
      args: ["--no-sandbox", "--disable-gpu"],
      defaultViewport: options?.defaultViewport === undefined ? null : options.defaultViewport,
      executablePath,
      headless: !headed,
      protocolTimeout: budgets.protocolMs,
      timeout: budgets.launchMs,
    });
  } catch (error) {
    throw wrapLaunchFailure(error, budgets.launchMs);
  }
};
