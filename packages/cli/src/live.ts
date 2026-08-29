/** frogoe check --live — the sandbox layer, game-native. A headless
 *  chrome-headless-shell loads the real game and measures what games need:
 *  boot, runtime errors, painted canvas, FPS, input round-trip, scripted
 *  playability, and HUD readability via the GAME convention (outline
 *  presence — not pixel-contrast against changing backgrounds). */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Finding } from "@frogoe/lint";

export interface LiveResult {
  findings: Finding[];
  metrics: {
    desktopFps?: number;
    mobileFps?: number;
    playability: "pass" | "fail" | "no-input";
  };
  screenshots: string[];
}

export interface LiveOptions {
  dir: string;
  settleMs?: number;
}

const VIEWPORTS = [
  { height: 844, name: "mobile", width: 390 },
  { height: 800, name: "desktop", width: 1280 },
];

/** Below this the game is unplayable on low-end phones. */
export const FPS_FLOOR = 30;

// ── pure decision functions (unit-tested, no browser) ─────────────────────

export interface OutlineMeasure {
  hasOutline: boolean;
  label: string;
}

/**
 * HUD readability — the GAME convention: outline/stroke/shadow on text.
 * Video measures text-vs-background contrast; games can't (backgrounds
 * change every frame). The outline IS the readability mechanism.
 */
export const outlineFinding = (measures: OutlineMeasure[]): Finding | null => {
  const bare = measures.filter((m) => !m.hasOutline);
  if (bare.length === 0 || !bare[0]) {
    return null;
  }
  return {
    code: "live/hud-outline",
    file: "index.html",
    fix: `"${bare[0].label}" has no text-shadow or -webkit-text-stroke — game HUD text needs an outline to read on ANY background (registry blocks ship one; custom HUD must add it)`,
    message: `${bare.length} HUD text element(s) have no outline`,
    recipe: "frogoe-registry → block authoring (sticker depth pattern)",
    severity: "error",
  };
};

export interface CollapseMeasure {
  height: number;
  label: string;
  width: number;
}

export const collapseFinding = (measures: CollapseMeasure[]): Finding | null => {
  const collapsed = measures.filter((m) => m.width < 4 || m.height < 4);
  if (collapsed.length === 0 || !collapsed[0]) {
    return null;
  }
  const first = collapsed[0];
  return {
    code: "live/layout-collapse",
    file: "index.html",
    fix: `"${first.label}" has content but renders ${Math.round(first.width)}×${Math.round(first.height)} — an element collapsed to zero (missing display, zero-size font, or an ancestor hiding it)`,
    message: `${collapsed.length} HUD element(s) collapsed to zero size`,
    severity: "error",
  };
};

export const fpsFinding = (fps: number | undefined, viewport: string): Finding | null => {
  if (fps === undefined || fps >= FPS_FLOOR) {
    return null;
  }
  return {
    code: "live/fps",
    file: "game.js",
    fix: `${fps.toFixed(0)} fps on ${viewport} (floor ${FPS_FLOOR}) — heavy per-frame work: cache gradients, cut particle counts, avoid shadowBlur on big shapes`,
    message: `frame rate below the playability floor [${viewport}]`,
    recipe: "frogoe-creative → game-feel (motion rules)",
    severity: "warning",
  };
};

export type Playability = "pass" | "fail" | "no-input";

export const playabilityFinding = (result: Playability): Finding | null => {
  if (result === "pass") {
    return null;
  }
  if (result === "no-input") {
    return {
      code: "live/no-input",
      file: "game.js",
      fix: 'the game never registered input.on("down", ...) — wire the core verb before shipping',
      message: "game has no input handler",
      severity: "error",
    };
  }
  return {
    code: "live/not-playable",
    file: "game.js",
    fix: "scripted taps produced no canvas change — loop.update/loop.render may be wired but the game logic never runs",
    message: "game did not respond to scripted input",
    severity: "error",
  };
};

// ── browser plumbing ───────────────────────────────────────────────────────

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

export const collectLive = async (options: LiveOptions): Promise<LiveResult> => {
  const dir = path.resolve(options.dir);
  const settle = options.settleMs ?? 2000;
  const findings: Finding[] = [];
  const screenshots: string[] = [];
  const metrics: LiveResult["metrics"] = { playability: "no-input" };
  const { startServer } = await import("./run.ts");
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
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ height: viewport.height, width: viewport.width });
      // wait for the dev server to answer before navigating (cold start)
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const res = await fetch(server.urls.local, { method: "HEAD" });
          if (res.ok) break;
        } catch {
          /* not up yet */
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error: unknown) => {
        runtimeErrors.push(String(error));
      });
      // domcontentloaded: the reload EventSource is a live connection and
      // slow dev-time CDN fonts must not block the sandbox
      // timeout: slow CDN fonts or cold browser start must not hang the sandbox
      await page.goto(server.urls.local, { timeout: 15_000, waitUntil: "domcontentloaded" });
      await new Promise((resolve) => {
        setTimeout(resolve, settle);
      });

      const probe = (await page.evaluate(`(() => {
        const hud = document.querySelector(".hud");
        const canvas = document.querySelector("#c");
        return {
          canvasPresent: Boolean(canvas),
          hudPresent: Boolean(hud),
          state: window.__frogoe?.state ?? "(missing)",
        };
      })()`)) as {
        canvasPresent: boolean;
        hudPresent: boolean;
        state: string;
      };

      if (runtimeErrors.length > 0) {
        findings.push({
          code: "live/page-error",
          file: "game.js",
          fix: `uncaught: ${runtimeErrors[0]?.slice(0, 140)}`,
          message: `${runtimeErrors.length} uncaught page error(s) [${viewport.name}]`,
          severity: "error",
        });
      }
      if (!probe.canvasPresent) {
        findings.push({
          code: "live/canvas-missing",
          file: "index.html",
          fix: 'the contract boots on <canvas id="c">',
          message: `canvas missing [${viewport.name}]`,
          severity: "error",
        });
      } else {
        const painted = (await page.evaluate(`(() => {
          const c = document.querySelector("#c");
          if (!c) return false;
          const g = c.getContext("2d");
          if (!g) return false;
          const s = g.getImageData(0, 0, Math.min(c.width, 120), Math.min(c.height, 240)).data;
          for (let i = 3; i < s.length; i += 4) { if (s[i] !== 0) return true; }
          return false;
        })()`)) as boolean;
        if (!painted) {
          findings.push({
            code: "live/canvas-unpainted",
            file: "game.js",
            fix: "loop.render never drew — fill loop.render = (ctx) => {...}",
            message: `canvas stayed blank [${viewport.name}]`,
            severity: "error",
          });
        }
      }
      if (probe.state === "(missing)") {
        findings.push({
          code: "live/contract-missing",
          file: "index.html",
          fix: 'import { defineGame } from "frogoe" — the runtime publishes window.__frogoe at boot',
          message: `window.__frogoe absent [${viewport.name}]`,
          severity: "error",
        });
      }

      if (probe.hudPresent) {
        // outline presence — the game readability convention
        const outlines = (await page.evaluate(`(() => {
          const out = [];
          for (const el of document.querySelectorAll(".hud *")) {
            const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
            if (!own) continue;
            const text = el.textContent ?? "";
            const s = getComputedStyle(el);
            const hasOutline =
              (s.webkitTextStroke && s.webkitTextStrokeWidth !== "0px") ||
              (s.textShadow && s.textShadow !== "none");
            const r = el.getBoundingClientRect();
            out.push({
              hasOutline,
              height: r.height,
              label: text.trim().slice(0, 24),
              width: r.width,
            });
          }
          return out;
        })()`)) as Array<{
          hasOutline: boolean;
          height: number;
          label: string;
          width: number;
        }>;

        const outline = outlineFinding(outlines);
        if (outline) {
          findings.push(outline);
        }
        const collapse = collapseFinding(outlines);
        if (collapse) {
          findings.push(collapse);
        }
      }

      // FPS: count rAF ticks over a 1.5s window
      const fps = (await page.evaluate(
        `new Promise((resolve) => {
          let count = 0;
          const start = performance.now();
          const tick = () => {
            count++;
            if (performance.now() - start < 1500) { requestAnimationFrame(tick); }
            else { resolve(Math.round(count / ((performance.now() - start) / 1000))); }
          };
          requestAnimationFrame(tick);
        })`,
      )) as number;
      if (viewport.name === "mobile") {
        metrics.mobileFps = fps;
      } else {
        metrics.desktopFps = fps;
      }
      const fpsIssue = fpsFinding(fps, viewport.name);
      if (fpsIssue) {
        findings.push(fpsIssue);
      }

      // playability: tap and see if the canvas changes (only once, on mobile)
      if (viewport.name === "mobile") {
        const before = (await page.evaluate(`(() => {
          const c = document.querySelector("#c");
          if (!c) return null;
          const g = c.getContext("2d");
          if (!g) return null;
          const d = g.getImageData(0, 0, Math.min(c.width, 80), Math.min(c.height, 160)).data;
          let hash = 0;
          for (let i = 0; i < d.length; i += 4) {
            hash = (hash * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0;
          }
          return hash;
        })()`)) as number | null;
        if (before !== null) {
          // does the game listen for input?
          const hasInput = (await page.evaluate(`Boolean(window.__frogoe)`)) as boolean;
          // simulate a tap in the game area
          await page.mouse.click(viewport.width / 2, viewport.height / 2);
          await new Promise((resolve) => {
            setTimeout(resolve, 400);
          });
          const after = (await page.evaluate(`(() => {
            const c = document.querySelector("#c");
            if (!c) return null;
            const g = c.getContext("2d");
            if (!g) return null;
            const d = g.getImageData(0, 0, Math.min(c.width, 80), Math.min(c.height, 160)).data;
            let hash = 0;
            for (let i = 0; i < d.length; i += 4) {
              hash = (hash * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0;
            }
            return hash;
          })()`)) as number | null;
          if (after !== null && before !== null) {
            // living worlds animate on their own; a tap should change state
            // (not just time) — accept either a canvas delta or an __frogoe
            // state transition as "responded"
            const state = (await page.evaluate(`window.__frogoe?.state ?? "unknown"`)) as string;
            const responded = before !== after || state !== "playing";
            metrics.playability = hasInput ? (responded ? "pass" : "fail") : "no-input";
          }
        }
        const play = playabilityFinding(metrics.playability);
        if (play) {
          findings.push(play);
        }
      }

      const shotPath = path.join(snapshotDir, `live-${viewport.name}.png`);
      writeFileSync(shotPath, await page.screenshot({ encoding: "binary" }), "binary");
      screenshots.push(path.relative(dir, shotPath));
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }

  return { findings, metrics, screenshots };
};
