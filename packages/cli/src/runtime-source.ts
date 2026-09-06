/** The pixel analyzers — single source of truth, evaluated identically
 *  in Node (for tests and CLI decisions) and in browser pages (for the
 *  raster/vision injection). The file is a plain script (no exports,
 *  no TypeScript, never bundled) shipped verbatim to dist/.
 *
 *  WHY: the old pattern injected functions via toString(), which broke
 *  under esbuild — bun inlines module consts (self-contained source)
 *  while esbuild renames cross-references (contrastRatio→contrastRatio2),
 *  making the npm CLI ship code that crashed in every browser page.
 *  This file is the fix: one source string, two evaluators, zero
 *  bundler interference. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The raw source — read once, memoized. */
let cached: string | null = null;
export const runtimeSource = (): string => {
  if (cached !== null) return cached;
  const candidates = [
    path.join(here, "injected-runtime.js"), // source mode (src/ dir)
    path.join(here, "dist", "injected-runtime.js"), // dist mode
    path.join(here, "..", "dist", "injected-runtime.js"), // dist/cli.js sibling
  ];
  for (const p of candidates) {
    try {
      cached = readFileSync(p, "utf-8");
      return cached;
    } catch {
      /* try next */
    }
  }
  throw new Error("injected-runtime.js not found (looked in src/, dist/) — run `bun run build`");
};

export interface RuntimeFunctions {
  luminance: (r: number, g: number, b: number) => number;
  contrastRatio: (a: number, b: number) => number;
  compositionMetrics: (
    data: Uint8ClampedArray | number[],
    width: number,
    height: number,
    rows: number,
    palette: { bg: string },
  ) => { coverage: number; deadRows: number; rows: number };
  analyzeTitleBand: (
    data: Uint8ClampedArray | number[],
    width: number,
    height: number,
  ) => {
    bandHeight: number;
    ground: [number, number, number];
    inkBBox: [number, number, number, number] | null;
    inkCount: number;
    inkTotal: number;
    textBottom: number;
  };
  analyzeIconCorners: (
    data: Uint8ClampedArray | number[],
    width: number,
    height?: number,
  ) => { corners: Array<[number, number, number, number]> };
  findTitleZoneCollision: (
    data: Uint8ClampedArray | number[],
    width: number,
    height: number,
    band: [number, number, number, number] | null,
  ) => string | null;
}

/** Evaluate the runtime source in Node — the SAME string that ships to
 *  pages. This is the "tested code IS the shipped code" guarantee. */
let functions: RuntimeFunctions | null = null;
export const runtimeFunctions = (): RuntimeFunctions => {
  if (functions !== null) return functions;
  const src = runtimeSource();
  const factory = new Function(
    `${src}\nreturn { luminance, contrastRatio, compositionMetrics, analyzeTitleBand, analyzeIconCorners, findTitleZoneCollision };`,
  ) as () => RuntimeFunctions;
  functions = factory();
  return functions;
};
