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
import { analyzeDraws, type WorldEntity, type WorldSnap } from "./drawn-world.ts";

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
  /** engine-measured entity geometry, derived from the REAL draw calls
   *  of the REAL game (never fabricated; oracle-tested vs live()) */
  world?: WorldSnap;
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
    // live() reads closure state as it is right now.
    // NEVER called eagerly at document-start: a module load before the
    // page's importmap is parsed KILLS the importmap for the whole
    // document (spec: late maps are ignored) — the game's own
    // from-frogoe import then fails and the contract never boots. Lazy
    // only: the first __frogoeFrame call runs well after load.
    try {
      const mod = await import("./game.js");
      if (typeof mod.live === "function") liveFn = mod.live;
    } catch {
      /* games without live() are fine — coordinates are an opt-in */
    }
  };
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
        cw: c.clientWidth || Math.round(width / 2),
        ch: c.clientHeight || Math.round(height / 2),
        draws: typeof window.__frogoeTakeDraws === "function" ? window.__frogoeTakeDraws() : [],
        gate: ready ? "ready" : "run",
        hud: hud.slice(0, 6).join("  "),
        live: live ?? null,
        score: score?.textContent ?? null,
      };
    } catch {
      return null; // webgl or exotic canvas → screenshot fallback
    }
  };
  // ── the draw tap: measure what the game ACTUALLY draws on #c ──────
  // records are raw (post-transform bbox + color); analysis stays in
  // Node (drawn-world.ts) so the pure module is the single source
  window.__frogoeDraws = [];
  window.__frogoeTakeDraws = () => {
    const d = window.__frogoeDraws;
    window.__frogoeDraws = [];
    return d;
  };
  try {
    const proto = CanvasRenderingContext2D.prototype;
    const orig = new Map();
    const keep = (n) => {
      if (!orig.has(n)) orig.set(n, proto[n]);
      return orig.get(n);
    };
    const ident = [1, 0, 0, 1, 0, 0];
    const stacks = new WeakMap();
    const stackOf = (c) => {
      let s = stacks.get(c);
      if (!s) {
        s = [ident.slice()];
        stacks.set(c, s);
      }
      return s;
    };
    const cur = (c) => stackOf(c)[stackOf(c).length - 1] || ident;
    const mul = (m, n) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
    // cache the main canvas once — querySelector per commit is too hot
    // for 60fps sprite storms (the tap must never cost the game frames)
    let mainCv = null;
    const mainOf = () => {
      if (mainCv === null || !mainCv.isConnected) mainCv = document.querySelector("#c");
      return mainCv;
    };
    const pending = new WeakMap(); // per-context path bbox accumulator
    const commitPath = (c) => {
      const p = pending.get(c);
      pending.delete(c);
      if (!p || mainOf() === null || c.canvas !== mainOf()) return;
      if (window.__frogoeDraws.length > 4000) return;
      window.__frogoeDraws.push({
        color: String(c.fillStyle || ""), h: p.h, w: p.w, x: p.x, y: p.y,
      });
    };
    const extendPath = (c, x0, y0, x1, y1) => {
      const m = cur(c);
      const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [
        m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5],
      ]);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const box = {
        h: Math.max(...ys) - Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        x: (Math.max(...xs) + Math.min(...xs)) / 2,
        y: (Math.max(...ys) + Math.min(...ys)) / 2,
      };
      const p = pending.get(c);
      if (!p) {
        pending.set(c, box);
        return;
      }
      const X0 = Math.min(p.x - p.w / 2, box.x - box.w / 2);
      const X1 = Math.max(p.x + p.w / 2, box.x + box.w / 2);
      const Y0 = Math.min(p.y - p.h / 2, box.y - box.h / 2);
      const Y1 = Math.max(p.y + p.h / 2, box.y + box.h / 2);
      pending.set(c, { h: Y1 - Y0, w: X1 - X0, x: (X0 + X1) / 2, y: (Y0 + Y1) / 2 });
    };
    const wrap = (name, before) => {
      const o = keep(name);
      proto[name] = function (...args) {
        try {
          if (before) before(this, args);
        } catch (e) { /* measurement must never break the game */ }
        return o.apply(this, args);
      };
    };
    const vec = (a) => [a[0], a[1], a[2], a[3], a[4], a[5]];
    wrap("save", (c) => { stackOf(c).push(cur(c).slice()); });
    wrap("restore", (c) => { stackOf(c).pop(); });
    wrap("translate", (c, a) => {
      const s = stackOf(c);
      s[s.length - 1] = mul(cur(c), [1, 0, 0, 1, a[0] || 0, a[1] || 0]);
    });
    wrap("scale", (c, a) => {
      const s = stackOf(c);
      s[s.length - 1] = mul(cur(c), [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]);
    });
    wrap("rotate", (c, a) => {
      const th = a[0] || 0;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const s = stackOf(c);
      s[s.length - 1] = mul(cur(c), [cos, sin, -sin, cos, 0, 0]);
    });
    wrap("setTransform", (c, a) => {
      const s = stackOf(c);
      s[s.length - 1] = a.length >= 6 ? vec(a) : ident.slice();
    });
    wrap("resetTransform", (c) => {
      const s = stackOf(c);
      s[s.length - 1] = ident.slice();
    });
    wrap("beginPath", (c) => { pending.delete(c); });
    wrap("moveTo", (c, a) => extendPath(c, a[0], a[1], a[0], a[1]));
    wrap("lineTo", (c, a) => extendPath(c, a[0], a[1], a[0], a[1]));
    wrap("rect", (c, a) => extendPath(c, a[0], a[1], (a[0] || 0) + (a[2] || 0), (a[1] || 0) + (a[3] || 0)));
    wrap("roundRect", (c, a) => extendPath(c, a[0], a[1], (a[0] || 0) + (a[2] || 0), (a[1] || 0) + (a[3] || 0)));
    wrap("arc", (c, a) => extendPath(c, (a[0] || 0) - (a[2] || 0), (a[1] || 0) - (a[2] || 0), (a[0] || 0) + (a[2] || 0), (a[1] || 0) + (a[2] || 0)));
    wrap("ellipse", (c, a) => extendPath(c, (a[0] || 0) - (a[2] || 0), (a[1] || 0) - (a[3] || 0), (a[0] || 0) + (a[2] || 0), (a[1] || 0) + (a[3] || 0)));
    wrap("fill", (c) => commitPath(c));
    wrap("stroke", (c) => commitPath(c));
    // fillRect/strokeRect draw IMMEDIATELY — accumulate then commit now
    // (they never trigger fill()/stroke(); leaving them pending lost
    // every rect the game ever drew)
    wrap("fillRect", (c, a) => {
      extendPath(c, a[0], a[1], (a[0] || 0) + (a[2] || 0), (a[1] || 0) + (a[3] || 0));
      commitPath(c);
    });
    wrap("strokeRect", (c, a) => {
      extendPath(c, a[0], a[1], (a[0] || 0) + (a[2] || 0), (a[1] || 0) + (a[3] || 0));
      commitPath(c);
    });
    wrap("clearRect", (c) => { pending.delete(c); });
    wrap("drawImage", (c, a) => {
      if (a.length >= 5) extendPath(c, a[a.length - 4], a[a.length - 3], (a[a.length - 4] || 0) + (a[a.length - 2] || 0), (a[a.length - 3] || 0) + (a[a.length - 1] || 0));
      else if (a.length >= 3) extendPath(c, a[1], a[2], (a[1] || 0) + (a[0]?.width || 0), (a[2] || 0) + (a[0]?.height || 0));
      commitPath(c); // drawImage blits immediately
    });
    wrap("fillText", (c, a) => {
      const text = String(a[0] ?? "");
      let w = text.length * 8;
      try { w = c.measureText(text).width; } catch (e) {}
      const fs = parseFloat(String(c.font || "16px").match(/([0-9.]+)px/)?.[1] ?? "16");
      extendPath(c, (a[1] || 0) - w / 2, (a[2] || 0) - fs, (a[1] || 0) + w / 2, (a[2] || 0) + fs);
      commitPath(c);
    });
  } catch (e) { /* tap failure must never kill the game */ }

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
/** per-page tracking state for the world analysis (motion/age) */
const worldPrev = new WeakMap<Page, WorldEntity[]>();

export const captureFrame = async (page: Page): Promise<EyesFrame> => {
  const grabbed = (await page.evaluate("window.__frogoeFrame?.() ?? null")) as
    | (EyesFrame & {
        ch?: number;
        cw?: number;
        draws?: Array<{ color: string; h: number; w: number; x: number; y: number }>;
      })
    | null;
  if (grabbed !== null && typeof grabbed.plain === "string") {
    const hud = grabbed.hud && grabbed.hud.length > 0 ? `HUD ${grabbed.hud}` : "";
    const { draws, ...frame } = grabbed;
    let world: WorldSnap | undefined;
    if (Array.isArray(draws) && draws.length > 0 && frame.cw && frame.ch) {
      const prev = worldPrev.get(page) ?? [];
      world = analyzeDraws(draws, prev, { h: frame.ch, w: frame.cw });
      worldPrev.set(page, world.entities);
    }
    return { ...frame, plain: `${hud}\n${frame.plain}`, world };
  }
  const b64 = (await page.screenshot({
    captureBeyondViewport: false,
    encoding: "base64",
    type: "png",
  })) as string;
  return (await page.evaluate(`__frogoeMapShot(${JSON.stringify(b64)})`)) as EyesFrame;
};
