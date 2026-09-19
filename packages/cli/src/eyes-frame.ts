/** Shared ASCII eyes for live pages — the extraction of frogoe vision's
 *  frame capture, reused by `frogoe play`. One source of truth: the
 *  palette-aware cartography (art-eyes) is serialized into the page,
 *  __frogoeMapShot decodes a full-page screenshot (canvas + DOM HUD —
 *  the HUD is half the composition) and maps it to characters. */
import type { Page } from "puppeteer-core";

import {
  charFor,
  compositionMetrics,
  mapToChars,
  mapToPretty,
  type EyePalette,
} from "./art-eyes.ts";
import { contrastRatio, luminance } from "./art-verify.ts";

/** The pure cartography, serialized into the page in dependency order —
 *  the tested code IS the shipped code (toString injection rules). */
export const eyesHelpersScript = (): string =>
  [luminance, contrastRatio, charFor, mapToChars, mapToPretty, compositionMetrics]
    .map((fn) => `const ${fn.name} = ${String(fn)};`)
    .join("\n");

export interface EyesFrame {
  cols: number;
  metrics: { coverage: number; deadRows: number; rows: number };
  plain: string;
  pretty: string;
  rows: number;
}

/** Installs window.__frogoeMapShot(b64png) → EyesFrame in the page. */
export const mapShotInstaller = (palette: EyePalette, cols = 96): string => `(async () => {
  ${eyesHelpersScript()}
  const PAL = ${JSON.stringify(palette)};
  window.__frogoeMapShot = async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const useCols = ${String(cols)};
    const rws = Math.max(1, Math.round((useCols * (c.height / c.width)) / 2));
    return {
      cols: useCols, rows: rws,
      plain: mapToChars(d, c.width, c.height, useCols, rws, PAL),
      pretty: mapToPretty(d, c.width, c.height, useCols, rws),
      metrics: compositionMetrics(d, c.width, c.height, Math.max(4, Math.round(rws / 4)), PAL),
    };
  };
  void PAL;
})()`;

/** Capture one frame: full-page screenshot → in-page map. */
export const captureFrame = async (page: Page): Promise<EyesFrame> => {
  const b64 = (await page.screenshot({ encoding: "base64", type: "png" })) as string;
  return (await page.evaluate(`__frogoeMapShot(${JSON.stringify(b64)})`)) as EyesFrame;
};
