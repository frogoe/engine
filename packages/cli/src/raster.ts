/** Art rasterizer — renders the authored identity scenes through the
 *  game's own code, hosted by the game's own page. The dev server
 *  serves index.html exactly as the browser sees it (import map, HUD
 *  blocks, font link — everything game.js expects at import time);
 *  once the contract boots (window.__frogoe), the scene module is
 *  dynamically imported and drawn onto an injected full-bleed canvas,
 *  captured as an element screenshot — pixel-exact and
 *  DPR-independent. Lettering uses the page's real webfont (loaded
 *  via the game's own stylesheet, awaited through document.fonts).
 *  Output: dist/assets/poster.png (1080×1920), dist/assets/icon.png
 *  (1024×1024). The CLI composes — it never draws. */
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { hexColorsOf, parseBrief } from "@frogoe/lint";

import type { EyePalette } from "./art-eyes.ts";
import { runtimeSource } from "./runtime-source.ts";

import {
  verifyIconFullbleed,
  verifyTitleReadability,
  type IconCornerReport,
  type TitleBandReport,
} from "./art-verify.ts";
import { runtimeFunctions } from "./runtime-source.ts";
import { launchBrowser } from "./browser/launch.ts";
import { legacyCacheDir } from "./browser/manager.ts";

export interface RasterizedFile {
  bytes: number;
  file: string;
}

export interface RasterReport {
  files: RasterizedFile[];
  warnings: string[];
}

const SCENES = [
  {
    draw: "drawPoster",
    height: 1920,
    out: path.join("dist", "assets", "poster.png"),
    size: "w, h",
    source: path.join("assets", "poster.js"),
    width: 1080,
  },
  {
    draw: "drawIcon",
    height: 1024,
    out: path.join("dist", "assets", "icon.png"),
    size: "size",
    source: path.join("assets", "icon.js"),
    width: 1024,
  },
] as const;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Injected into the game page after boot as a self-contained
 *  expression (values baked — evaluate-strings take no args): imports
 *  the scene module (its ../game.js import resolves — same page, same
 *  map), draws onto a fixed full-bleed canvas, runs the tier-2 pixel
 *  analyzer IN PAGE (the pure functions from art-verify.ts, injected
 *  via toString so the tested code IS the shipped code), and reports
 *  both the drawn flag and the analyzer's metrics. */
const rasterScriptFor = (scene: (typeof SCENES)[number], palette: EyePalette): string => {
  const sizeArg =
    scene.draw === "drawIcon"
      ? String(scene.width)
      : `${String(scene.width)}, ${String(scene.height)}`;
  const analyze = scene.draw === "drawIcon" ? "analyzeIconCorners" : "analyzeTitleBand";
  return `(async () => {
  ${runtimeSource()}
  const mod = await import("./assets/${path.basename(scene.source)}");
  const canvas = document.createElement("canvas");
  canvas.id = "__frogoe_raster";
  canvas.width = ${String(scene.width)};
  canvas.height = ${String(scene.height)};
  canvas.style.cssText =
    "position:fixed;left:0;top:0;width:${String(scene.width)}px;height:${String(scene.height)}px;z-index:2147483647;pointer-events:none;";
  document.body.append(canvas);
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    await document.fonts.ready;
    mod.${scene.draw}(ctx, ${sizeArg});
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    window.__frogoeArtReport = ${analyze}(pixels, canvas.width, canvas.height);
    try { window.__frogoeTitleBand = ctx.__frogoeTitleBand ?? null; } catch (e) { window.__frogoeTitleBand = null; }
    window.__frogoeArtMetrics = compositionMetrics(
      pixels, canvas.width, canvas.height,
      ${String(scene.draw === "drawIcon" ? 10 : 21)},
      ${JSON.stringify(palette)},
    );
    window.__frogoeRaster = true;
  } catch (error) {
    window.__frogoeRasterError = String(error);
  }
})()`;
};

export const rasterizeArt = async (options: { dir: string }): Promise<RasterReport> => {
  const dir = path.resolve(options.dir);
  const missing = SCENES.filter((scene) => !existsSync(path.join(dir, scene.source)));
  if (missing.length > 0) {
    throw new Error(
      `bundle/art-missing — author the identity scenes first (${missing.map((scene) => scene.source).join(", ")}); run \`frogoe check\` and see frogoe-creative → references/art.md`,
    );
  }

  const { startServer } = await import("./run.ts");
  const server = await startServer(dir);

  const browser = await launchBrowser({ legacyDirs: [legacyCacheDir(dir)] });
  try {
    const base = server.urls.local.replace(/\/$/u, "");
    const brief = parseBrief(readFileSync(path.join(dir, "BRIEF.md"), "utf-8"));
    const palette: EyePalette = {
      accent: brief?.accent ?? "#ff3b3b",
      bg: brief?.bg ?? "#101418",
      fg: brief?.fg ?? "#ffffff",
      ...(brief?.outline ? { outline: brief.outline } : {}),
    };
    const files: RasterizedFile[] = [];
    const warnings: string[] = [];
    for (const scene of SCENES) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ height: scene.height, width: scene.width });
        await page.goto(base, { timeout: 15_000, waitUntil: "domcontentloaded" });
        // the contract publishes window.__frogoe when it boots — the
        // scene may import game.js, so the game must be alive first
        await page.waitForFunction("window.__frogoe !== undefined", { timeout: 15_000 });
        await page.evaluate(rasterScriptFor(scene, palette));
        await page.waitForFunction("window.__frogoeRaster === true", { timeout: 20_000 });
        const failed = (await page.evaluate("window.__frogoeRasterError ?? null")) as string | null;
        if (failed !== null) {
          throw new Error(`bundle/art-crash — ${scene.source}: ${failed.slice(0, 160)}`);
        }
        // tier-2 gates — decide on the analyzer's report (pure, tested)
        const metrics = (await page.evaluate("window.__frogoeArtMetrics")) as {
          coverage: number;
          deadRows: number;
          rows: number;
        };
        if (scene.draw === "drawPoster") {
          const report = (await page.evaluate("window.__frogoeArtReport")) as TitleBandReport;
          const verdict = verifyTitleReadability(report, scene.width);
          if (verdict !== null) throw new Error(verdict);
          const band = (await page.evaluate("window.__frogoeTitleBand ?? null")) as
            | [number, number, number, number]
            | null;
          if (band !== null) {
            const dpr = scene.width / 540;
            const collision = runtimeFunctions().findTitleZoneCollision(
              (await page.evaluate(
                `(() => { const c = document.getElementById("__frogoe_raster"); return c.getContext("2d").getImageData(0, 0, c.width, c.height).data; })()`,
              )) as Uint8ClampedArray,
              scene.width,
              scene.height,
              [band[0] * dpr, band[1] * dpr, band[2] * dpr, band[3] * dpr],
            );
            if (collision !== null) warnings.push(collision);
          }
          // catastrophe floor only — night worlds breathe by design;
          // taste-level density lives in `frogoe vision`, not the gate
          if (metrics.deadRows / Math.max(1, metrics.rows) > 0.7) {
            warnings.push(
              `bundle/art-dead-bands — ${metrics.deadRows}/${metrics.rows} of the poster's upper-field rows are empty: compose a moment with density (storm column, flight line), see \`frogoe vision\` — frogoe-creative → references/art.md`,
            );
          }
        } else {
          const report = (await page.evaluate("window.__frogoeArtReport")) as IconCornerReport;
          const gameSource = readFileSync(path.join(dir, "game.js"), "utf-8");
          const verdict = verifyIconFullbleed(report, [...hexColorsOf(gameSource)]);
          if (verdict !== null) throw new Error(verdict);
          if (metrics.coverage < 0.08) {
            warnings.push(
              `bundle/art-icon-fill — the mark covers only ${(metrics.coverage * 100).toFixed(1)}% of the icon: let it nearly fill the plate (55-70%), see \`frogoe vision\` — frogoe-creative → references/art.md`,
            );
          }
        }
        await sleep(80); // let the compositor settle the injected canvas
        const canvas = await page.$("#__frogoe_raster");
        if (canvas === null) throw new Error(`bundle/art-crash — ${scene.source}: no canvas`);
        const outPath = path.join(dir, scene.out);
        mkdirSync(path.dirname(outPath), { recursive: true });
        await canvas.screenshot({ omitBackground: true, path: outPath, type: "png" });
        files.push({ bytes: statSync(outPath).size, file: scene.out });
      } finally {
        await page.close();
      }
    }
    return { files, warnings };
  } finally {
    await browser.close();
    server.stop();
  }
};
