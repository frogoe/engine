/** Shared ASCII eyes for live pages — the extraction of frogoe vision's
 *  frame capture, reused by `frogoe play`. One source of truth: the
 *  palette-aware cartography (art-eyes) is serialized into the page.
 *
 *  CONTINUOUS STREAMS (play) read the canvas IN-PAGE — getImageData on
 *  the contract canvas, plus the DOM HUD flattened into one text line.
 *  No CDP screenshots at all: on a HEADED window every Page.captureScreenshot
 *  momentarily suspends the compositor — at stream cadence that reads as
 *  the screen blinking and "shrinking". The screenshot path stays as a
 *  FALLBACK for exotic canvases (webgl) and for vision's occasional
 *  full-page photos (a workbench, not a stream). */
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
  gate?: string;
  hud?: string;
  /** the game's live() coordinate snapshot — game-authored truth for
   *  agents that prefer numbers over glyphs (null when the game ships
   *  no live()). Schema convention: { player: {x,y}, entities: [...] }. */
  live?: unknown;
  score?: string | null;
  metrics: { coverage: number; deadRows: number; rows: number };
  plain: string;
  pretty?: string;
  rows: number;
}

/** Installs window.__frogoeFrame() (canvas grab + HUD text) AND
 *  window.__frogoeMapShot(b64) (screenshot fallback) in the page. */
export const mapShotInstaller = (palette: EyePalette, cols = 96): string => `(async () => {
  ${eyesHelpersScript()}
  const PAL = ${JSON.stringify(palette)};
  const useCols = ${String(cols)};
  const map = (d, w, h) => {
    const rws = Math.max(1, Math.round((useCols * (h / w)) / 2));
    return {
      cols: useCols, rows: rws,
      plain: mapToChars(d, w, h, useCols, rws, PAL),
      metrics: compositionMetrics(d, w, h, Math.max(4, Math.round(rws / 4)), PAL),
    };
  };
  let liveFn = null;
  const loadLive = async () => {
    // the module cache hands back the SAME instance the game runs —
    // live() reads closure state as it is right now
    try {
      const mod = await import("./game.js");
      if (typeof mod.live === "function") liveFn = mod.live;
    } catch {
      /* games without live() are fine — coordinates are an opt-in */
    }
  };
  void loadLive();
  window.__frogoeFrame = async () => {
    try {
      await loadLive();
      const live = typeof liveFn === "function" ? await liveFn() : null;
      const c = document.querySelector("#c");
      if (!c) return null;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      const hud = [];
      for (const el of document.querySelectorAll(".hud span, .hud b, .hud button")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.1) continue;
        const t = (el.textContent || "").trim();
        if (t && !hud.includes(t)) hud.push(t);
      }
      // ground truth for agents: gate state + the score span, read from
      // the DOM (ASCII heuristics about "is the title up" have lied)
      const ready = document.body.hasAttribute("data-ready");
      const score = document.querySelector("[data-block-score]");
      return {
        ...map(data, width, height),
        gate: ready ? "ready" : "run",
        hud: hud.slice(0, 6).join("  "),
        live: live ?? null,
        score: score?.textContent ?? null,
      };
    } catch {
      return null; // webgl or exotic canvas → screenshot fallback
    }
  };
  window.__frogoeMapShot = async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    return map(d, c.width, c.height);
  };
  void PAL;
})()`;

/** Capture one stream frame: in-page canvas grab (zero compositor
 *  interference) with the screenshot path as fallback. The HUD text
 *  rides as the frame's first line — agents read crisp text, not
 *  ASCII-of-text. */
export const captureFrame = async (page: Page): Promise<EyesFrame> => {
  const grabbed = (await page.evaluate("window.__frogoeFrame?.() ?? null")) as EyesFrame | null;
  if (grabbed !== null && typeof grabbed.plain === "string") {
    const hud = grabbed.hud && grabbed.hud.length > 0 ? `HUD ${grabbed.hud}` : "";
    return { ...grabbed, plain: `${hud}\n${grabbed.plain}` };
  }
  const b64 = (await page.screenshot({
    captureBeyondViewport: false,
    encoding: "base64",
    type: "png",
  })) as string;
  return (await page.evaluate(`__frogoeMapShot(${JSON.stringify(b64)})`)) as EyesFrame;
};
