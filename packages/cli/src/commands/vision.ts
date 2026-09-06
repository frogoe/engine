/** frogoe vision — the agent's eyes. One command, three windows:
 *  OBJECTS (each SPRITES entry rendered in isolation, mapped large),
 *  GAMEPLAY (the live world canvas at ready and after a tap), and
 *  IDENTITY (poster + icon scenes with the tier-2 verdicts). Plain
 *  ramp maps by default (agent-readable); --pretty renders truecolor
 *  half-blocks for humans — the ~99% thumbnail. A WORKBENCH, never a
 *  gate: per-window failures are reported, not thrown. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { defineCommand } from "citty";

import { parseBrief } from "@frogoe/lint";

import {
  charFor,
  compositionMetrics,
  mapToChars,
  mapToPretty,
  type EyePalette,
} from "../art-eyes.ts";
import {
  analyzeIconCorners,
  findTitleZoneCollision,
  analyzeTitleBand,
  contrastRatio,
  luminance,
  verifyIconFullbleed,
  verifyTitleReadability,
  type IconCornerReport,
  type TitleBandReport,
} from "../art-verify.ts";
import { ensureBrowser } from "../browser.ts";

/** The pure cartography + analyzers, serialized into the page in
 *  dependency order — the tested code IS the shipped code. */
const HELPERS = [
  luminance,
  contrastRatio,
  charFor,
  mapToChars,
  mapToPretty,
  compositionMetrics,
  analyzeTitleBand,
  analyzeIconCorners,
  findTitleZoneCollision,
]
  .map((fn) => `const ${fn.name} = ${String(fn)};`)
  .join("\n");

const PAGE_SCRIPT = (palette: EyePalette): string => `(async () => {
  ${HELPERS}
  const PAL = ${JSON.stringify(palette)};
  const map = (d, w, h, cols) => {
    const rows = Math.max(1, Math.round((cols * (h / w)) / 2));
    return {
      cols, rows,
      plain: mapToChars(d, w, h, cols, rows, PAL),
      pretty: mapToPretty(d, w, h, cols, rows),
      metrics: compositionMetrics(d, w, h, Math.max(4, Math.round(rows / 4)), PAL),
    };
  };
  const grab = (canvas) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return { d: ctx.getImageData(0, 0, canvas.width, canvas.height).data, w: canvas.width, h: canvas.height };
  };
  const render = (w, h, draw) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, w, h);
    draw(ctx, c);
    return grab(c);
  };
  const out = { objects: null, gameplay: [], identity: {} };
  // gameplay frames come from Node-side page.screenshot (full page:
  // canvas + DOM HUD — the HUD is half the composition); this maps them
  window.__frogoeMapShot = async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    return map(d, c.width, c.height, 96);
  };

  // ── OBJECTS — every SPRITES entry, isolated on the palette ground ─
  try {
    const game = await import("./game.js");
    if (game.SPRITES) {
      out.objects = [];
      for (const [name, sp] of Object.entries(game.SPRITES)) {
        try {
          const w = sp.w ?? 200, h = sp.h ?? 200;
          const { d } = render(w, h, (ctx) => sp.draw(ctx));
          out.objects.push({ name, ...map(d, w, h, 48), error: null });
        } catch (error) {
          out.objects.push({ name, error: String(error) });
        }
      }
    }
  } catch (_) { /* game import issues surface in GAMEPLAY */ }

  // ── IDENTITY — the authored scenes + tier-2 verdicts ─────────────
  try {
    const poster = await import("./assets/poster.js");
    const { d, w, h } = render(540, 960, (ctx) => poster.drawPoster(ctx, 540, 960));
    const titleReport = analyzeTitleBand(d, w, h);
    let band = null;
    try { band = ctx.__frogoeTitleBand ?? null; } catch (e) { band = null; }
    out.identity.poster = {
      ...map(d, w, h, 96),
      titleReport,
      titleCollision: findTitleZoneCollision(d, w, h, band),
      titleBandDeclared: band !== null,
    };
  } catch (error) {
    out.identity.poster = { error: String(error) };
  }
  try {
    const icon = await import("./assets/icon.js");
    const { d, w, h } = render(512, 512, (ctx) => icon.drawIcon(ctx, 512));
    out.identity.icon = { ...map(d, w, h, 32), cornerReport: analyzeIconCorners(d, w, h) };
  } catch (error) {
    out.identity.icon = { error: String(error) };
  }
  return out;
})()`;

interface MapView {
  cols: number;
  rows: number;
  plain: string;
  pretty: string;
  metrics: { coverage: number; deadRows: number; rows: number };
}

interface VisionReport {
  objects: Array<{ name: string; error: string | null } & Partial<MapView>> | null;
  gameplay: Array<{ label: string } & MapView>;
  identity: {
    poster?:
      | ({ titleReport: TitleBandReport; titleCollision: string | null } & MapView)
      | {
          error: string;
        };
    icon?: ({ cornerReport: IconCornerReport } & MapView) | { error: string };
  };
}

const show = (view: MapView, pretty: boolean): string => (pretty ? view.pretty : view.plain);

const metricLine = (view: MapView): string =>
  `coverage ${(view.metrics.coverage * 100).toFixed(0)}% · dead-rows ${view.metrics.deadRows}/${view.metrics.rows}`;

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    pretty: { type: "boolean", description: "truecolor half-block maps (human eyes)" },
  },
  async run({ args }) {
    const dir = path.resolve(args.dir ? String(args.dir) : process.cwd());
    const briefPath = path.join(dir, "BRIEF.md");
    if (!existsSync(briefPath)) {
      throw new Error(
        "frogoe vision: no BRIEF.md in this folder — run this from a game (frogoe init)",
      );
    }
    const brief = parseBrief(readFileSync(briefPath, "utf-8"));
    if (!brief) {
      throw new Error("frogoe vision: BRIEF.md is present but unparsable — fill the frontmatter");
    }
    const palette: EyePalette = {
      accent: brief.accent ?? "#ff3b3b",
      bg: brief.bg ?? "#101418",
      fg: brief.fg ?? "#ffffff",
      ...(brief.outline ? { outline: brief.outline } : {}),
    };
    const pretty = args.pretty === true;

    const { startServer } = await import("../run.ts");
    const server = await startServer(dir);
    const { default: puppeteer } = await import("puppeteer-core");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-gpu"],
      defaultViewport: { height: 844, width: 390 },
      executablePath: await ensureBrowser(),
      headless: true,
    });
    let report: VisionReport;
    try {
      const page = await browser.newPage();
      await page.goto(server.urls.local, { timeout: 15_000, waitUntil: "domcontentloaded" });
      await page.waitForFunction("window.__frogoe !== undefined", { timeout: 15_000 });
      report = (await page.evaluate(PAGE_SCRIPT(palette))) as VisionReport;

      // GAMEPLAY — full-page frames (canvas + DOM HUD): the HUD is half
      // the composition and canvas-only capture was blind to it
      const frame = async (label: string): Promise<void> => {
        const b64 = (await page.screenshot({ encoding: "base64", type: "png" })) as string;
        const view = (await page.evaluate(`__frogoeMapShot(${JSON.stringify(b64)})`)) as MapView;
        report.gameplay.push({ label, ...view });
      };
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await frame("ready");
      await page.evaluate(
        '(() => { const cx = innerWidth / 2, cy = innerHeight / 2; for (const t of ["pointerdown", "pointerup"]) window.dispatchEvent(new PointerEvent(t, { clientX: cx, clientY: cy, bubbles: true })); })()',
      );
      await new Promise((resolve) => setTimeout(resolve, 800));
      await frame("action");
    } finally {
      await browser.close();
      server.stop();
    }

    const legend = `bg '${palette.bg}' → .   fg '${palette.fg}' → O   accent '${palette.accent}' → X${
      palette.outline ? `   outline '${palette.outline}' → #` : ""
    }   ramp @%&*8=+~;:,-^\`' (dark→light)`;

    console.log(`frogoe vision — ${dir}`);
    console.log(`palette: ${legend}\n`);

    console.log("── OBJECTS (SPRITES) " + "─".repeat(28));
    if (report.objects === null) {
      console.log("  (none — export SPRITES from game.js to see each object)\n");
    } else {
      for (const obj of report.objects) {
        if (obj.error !== null && obj.error !== undefined) {
          console.log(`${obj.name}: ERROR ${obj.error.slice(0, 120)}`);
          continue;
        }
        console.log(`${obj.name} (${obj.cols}×${obj.rows} map) — ${metricLine(obj as MapView)}`);
        console.log(show(obj as MapView, pretty));
        console.log();
      }
    }

    console.log("── GAMEPLAY (full page: world + HUD) " + "─".repeat(16));
    for (const frame of report.gameplay) {
      console.log(`${frame.label} — ${metricLine(frame)}`);
      console.log(show(frame, pretty));
      console.log();
    }

    console.log("── IDENTITY " + "─".repeat(38));
    const poster = report.identity.poster;
    if (poster === undefined || "error" in poster) {
      console.log(
        `poster: MISSING (${String((poster as { error?: string })?.error ?? "assets/poster.js not found").slice(0, 90)})`,
      );
    } else {
      const verdict = verifyTitleReadability(poster.titleReport, 540);
      const share =
        poster.titleReport.inkTotal > 0
          ? poster.titleReport.inkCount / poster.titleReport.inkTotal
          : 0;
      console.log(
        `poster — ${metricLine(poster)} · title ${verdict === null ? "✓" : `✗ ${verdict.slice(0, 100)}`} · ink ${(share * 100).toFixed(1)}%`,
      );
      console.log(show(poster, pretty));
    }
    const icon = report.identity.icon;
    if (icon === undefined || "error" in icon) {
      console.log(
        `icon: MISSING (${String((icon as { error?: string })?.error ?? "assets/icon.js not found").slice(0, 90)})`,
      );
    } else {
      const hexes = [palette.bg, palette.fg, palette.accent, palette.outline ?? palette.bg];
      const verdict = verifyIconFullbleed(icon.cornerReport, hexes);
      console.log(
        `icon — ${metricLine(icon)} · fullbleed ${verdict === null ? "✓" : `✗ ${verdict.slice(0, 100)}`}`,
      );
      console.log(show(icon, pretty));
    }
    if (!existsSync(path.join(dir, "assets", "poster.js"))) {
      console.log("\n(note: run `frogoe check` first — vision only looks, it never gates)");
    }
  },
  meta: {
    description: "eyes for draw code: objects, gameplay frames, and identity art as ASCII maps",
  },
});
