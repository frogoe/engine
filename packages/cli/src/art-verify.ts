/** Rendered-art verification — the tier-2 gates, run where the
 *  artifact exists (bundle time, the hyperframes pattern). Pixel
 *  analyzers are PURE and self-contained (no imports, no closures) so
 *  the same function is unit-tested here AND injected into the raster
 *  page via Function.toString() — the browser does the pixel walking
 *  (getImageData), the CLI owns the decision. Outcome-based by design:
 *  outline or scrim, any lettering mechanism passes the same numbers.
 *
 *  Gates (throw at bundle, stable codes):
 *    bundle/art-title-readability — the poster's upper field (top 65%,
 *      a logotype may sit mid-frame) must carry logotype-scale ink:
 *      rows whose high-contrast share ≥15% of samples (outlined hollow
 *      letters never form one run — density, not runs), the ink bbox
 *      from the DOMINANT cluster (narrow world columns excluded),
 *      ≥8 px from every canvas edge.
 *    bundle/art-icon-fullbleed — all four corners opaque and each
 *      corner's color within arm's reach of a game palette color
 *      (pre-rounding ships alpha corners — Apple rejects them). */

/** WCAG relative luminance. PURE — injected into the raster page. */
export const luminance = (r: number, g: number, b: number): number => {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const contrastRatio = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export interface TitleBandReport {
  bandHeight: number;
  ground: [number, number, number];
  inkCount: number;
  inkTotal: number;
  inkBBox: [number, number, number, number] | null;
  /** last row of the WIDE text mass (ink width ≥ 40% of canvas) — the
   *  lettering block's floor; floaters below it inside the title
   *  x-range are safe-zone collisions */
  textBottom: number;
}

/** Walk the poster's upper field and find logotype-scale ink. PURE —
 *  injected into the raster page. */
export const analyzeTitleBand = (
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
): TitleBandReport => {
  const fieldHeight = Math.floor(height * 0.65);
  // ground = the FIELD's mode color, computed once. Per-row modes
  // backfire: on title rows the title itself is 80% of the row and
  // would become the "ground", making the sky the ink.
  const fieldBuckets = new Map<number, number>();
  for (let y = 0; y < fieldHeight; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const at = (y * width + x) * 4;
      const key =
        (((data[at] ?? 0) >> 4) << 8) |
        (((data[at + 1] ?? 0) >> 4) << 4) |
        ((data[at + 2] ?? 0) >> 4);
      fieldBuckets.set(key, (fieldBuckets.get(key) ?? 0) + 1);
    }
  }
  let groundKey = 0;
  let groundHits = -1;
  for (const [key, hits] of fieldBuckets) {
    if (hits > groundHits) {
      groundHits = hits;
      groundKey = key;
    }
  }
  const ground: [number, number, number] = [
    ((groundKey >> 8) & 15) * 17,
    ((groundKey >> 4) & 15) * 17,
    (groundKey & 15) * 17,
  ];
  const groundLum = luminance(ground[0], ground[1], ground[2]);
  const isInk = (x: number, y: number): boolean => {
    const at = (y * width + x) * 4;
    return (
      contrastRatio(luminance(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0), groundLum) >= 3
    );
  };

  // a title ROW = ink density ≥15% of the row's samples — outlined
  // (hollow) letters never form one run; narrow columns sit ~4%
  const rowInkMin = Math.ceil((width / 2) * 0.15);
  const wideRowMin = Math.ceil((width / 2) * 0.4);
  let inkCount = 0;
  let inkTotal = 0;
  let textBottom = -1;
  let bbox: [number, number, number, number] | null = null;
  for (let y = 0; y < fieldHeight; y += 2) {
    let rowInk = 0;
    for (let x = 0; x < width; x += 2) {
      if (isInk(x, y)) {
        rowInk++;
      }
    }
    inkTotal += Math.ceil(width / 2);
    if (rowInk >= wideRowMin) {
      textBottom = y; // lettering rows are WIDE (title/subtitle slabs)
    }
    if (rowInk >= rowInkMin) {
      inkCount += Math.ceil(width / 2);
      if (bbox === null) {
        bbox = [width, y, 0, y];
      }
      bbox = [bbox[0], bbox[1], bbox[2], y];
    }
  }

  // real x-extents: the DOMINANT ink cluster over the title rows.
  // Naive min/max would swallow unrelated edge elements (a ceiling-
  // hung gate's shaft is sub-contrast ramp but its dark outline is
  // ink); clusters split at 24px gaps and the heaviest one is the
  // logotype.
  if (bbox !== null) {
    const bins = new Map<number, number>();
    for (let y = bbox[1]; y <= bbox[3]; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (isInk(x, y)) {
          const bin = x >> 2;
          bins.set(bin, (bins.get(bin) ?? 0) + 1);
        }
      }
    }
    const sorted = [...bins.keys()].sort((a, b) => a - b);
    const GAP_BINS = 6; // 24px between 4px bins
    let best: [number, number, number] | null = null; // [from, to, ink]
    let runFrom = -1;
    let runTo = -1;
    let runInk = 0;
    for (let i = 0; i <= sorted.length; i++) {
      const bin = sorted[i] ?? Number.MAX_SAFE_INTEGER;
      const prev = sorted[i - 1] ?? bin;
      const starts = i === 0 || bin - prev > GAP_BINS;
      if (starts && runFrom !== -1) {
        if (best === null || runInk > best[2]) {
          best = [runFrom, runTo, runInk];
        }
        runFrom = -1;
        runInk = 0;
      }
      if (i === sorted.length) break;
      if (runFrom === -1) {
        runFrom = bin;
      }
      runTo = bin;
      runInk += bins.get(bin) ?? 0;
    }
    if (best !== null) {
      bbox = [best[0] * 4, bbox[1], best[1] * 4 + 2, bbox[3]];
    } else {
      bbox = null;
    }
  }

  return { bandHeight: fieldHeight, ground, inkBBox: bbox, inkCount, inkTotal, textBottom };
};

export interface IconCornerReport {
  corners: Array<[number, number, number, number]>;
}

/** Read the icon's four corners (getImageData payload). PURE. */
export const analyzeIconCorners = (
  data: Uint8ClampedArray | number[],
  width: number,
  // corners sit on both axes at width−4 (square icons); the injected
  // call shape stays uniform — the parameter is intentionally unused
  _height?: number,
): IconCornerReport => {
  const read = (x: number, y: number): [number, number, number, number] => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const at = ((y + dy) * width + (x + dx)) * 4;
        r += data[at] ?? 0;
        g += data[at + 1] ?? 0;
        b += data[at + 2] ?? 0;
        a += data[at + 3] ?? 0;
      }
    }
    return [Math.round(r / 16), Math.round(g / 16), Math.round(b / 16), Math.round(a / 16)];
  };
  const last = width - 4;
  return {
    corners: [read(0, 0), read(last, 0), read(0, last), read(last, last)],
  };
};

// ── decisions (CLI-side) ─────────────────────────────────────────────────────

const MIN_INK_SHARE = 0.008;
const EDGE_MARGIN = 8;

export const verifyTitleReadability = (report: TitleBandReport, width: number): string | null => {
  const share = report.inkTotal > 0 ? report.inkCount / report.inkTotal : 0;
  if (share < MIN_INK_SHARE) {
    return `bundle/art-title-readability — the poster's upper field carries almost no readable ink (${(share * 100).toFixed(2)}% ≥3:1 pixels): draw the logotype there (BRIEF font, strokeText outline), or add the stepped scrim if the world is busy — frogoe-creative → references/art.md`;
  }
  const box = report.inkBBox;
  if (box === null) {
    return "bundle/art-title-readability — no ink bbox";
  }
  const [x0, , x1] = box;
  if (x0 < EDGE_MARGIN || x1 > width - 1 - EDGE_MARGIN) {
    return `bundle/art-title-readability — the logotype runs to the canvas edge (bbox ${x0}..${x1} of ${width}): measure-fit the line to ≤86% of the stage width — frogoe-creative → references/art.md`;
  }
  return null;
};

/** Safe-zone verifier — the "blade over the subtitle" rule. Scenes
 *  DECLARE their lettering block (ctx.__frogoeTitleBand = [x0, y0, x1,
 *  y1], stage units — the scene knows its layout; pixels cannot know
 *  layer identity). This checks the DECLARED rect's clearance margin
 *  (48px under the block): a free-floating blob ≥24px wide parked
 *  there is a collision; ceiling-hung world (pipes from the sky) is
 *  the doctrine's one legal crosser, exempt by column. PURE —
 *  injected with the analyzers. */
export const findTitleZoneCollision = (
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  band: [number, number, number, number] | null,
): string | null => {
  if (band === null) return null;
  const x0 = Math.max(0, Math.round(band[0]));
  const y0 = Math.max(0, Math.round(band[1]));
  const x1 = Math.min(width - 1, Math.round(band[2]));
  const y1 = Math.min(height - 1, Math.round(band[3]));
  const lumOf = (x: number, y: number): number => {
    const at = (y * width + x) * 4;
    return luminance(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0);
  };
  // ground = mode of the lettering band itself (the text sits on it)
  const buckets = new Map<number, number>();
  for (let y = y0; y <= y1; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const at = (y * width + x) * 4;
      const key =
        (((data[at] ?? 0) >> 4) << 8) |
        (((data[at + 1] ?? 0) >> 4) << 4) |
        ((data[at + 2] ?? 0) >> 4);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }
  let gk = 0;
  let gh = -1;
  for (const [k, h] of buckets) {
    if (h > gh) {
      gh = h;
      gk = k;
    }
  }
  const groundLum = luminance(((gk >> 8) & 15) * 17, ((gk >> 4) & 15) * 17, (gk & 15) * 17);
  const isLnk = (x: number, y: number): boolean => contrastRatio(lumOf(x, y), groundLum) >= 3;
  const ceiling: number[] = [];
  for (let x = 0; x < width; x += 4) {
    for (let y = 0; y < 6; y += 2) {
      if (isLnk(x, y)) {
        ceiling.push(x);
        break;
      }
    }
  }
  const nearCeiling = (x: number): boolean => {
    for (const c of ceiling) {
      if (Math.abs(x - c) <= 8) return true;
    }
    return false;
  };
  // clearance margin: 24 stage units under the declared block, scaled
  // to the render (vision renders 540-wide, bundle 1080 — the rule is
  // stage-true, not pixel-true). Blob floor: 12 stage units wide.
  const unit = width / 540;
  const margin = Math.round(24 * unit);
  const blobMin = Math.round(12 * unit);
  const countMin = Math.round(30 * (unit / 2));
  let floaters = 0;
  let widest = 0;
  const windowBottom = Math.min(height - 1, y1 + margin);
  for (let y = y1 + 2; y <= windowBottom; y += 2) {
    let run = 0;
    for (let x = x0; x <= x1 + 2; x += 2) {
      if (x <= x1 && isLnk(x, y) && !nearCeiling(x)) {
        run += 2;
        floaters++;
      } else {
        if (run > widest) widest = run;
        run = 0;
      }
    }
  }
  if (floaters >= countMin && widest >= blobMin) {
    return `bundle/art-title-collision — a free-floating blob (${String(widest)}px wide) parks in the clearance margin under the lettering block (rows ${String(y1 + 2)}..${String(windowBottom)}): free world must clear the block by ~its own radius — relocate below or compose around it (ceiling-hung world is the one legal crosser) — frogoe-creative → references/art.md`;
  }
  return null;
};

const CORNER_DISTANCE = 60;

export const verifyIconFullbleed = (
  report: IconCornerReport,
  gameColors: string[],
): string | null => {
  const palette = gameColors.map((hex) => [
    Number.parseInt(hex.slice(1, 3) ?? "0", 16),
    Number.parseInt(hex.slice(3, 5) ?? "0", 16),
    Number.parseInt(hex.slice(5, 7) ?? "0", 16),
  ]);
  for (const [r, g, b, a] of report.corners) {
    if (a < 255) {
      return "bundle/art-icon-fullbleed — the icon has non-opaque corners: fill the whole square with the plate color (stores mask corners themselves; pre-rounding ships the alpha Apple rejects)";
    }
    const near = palette.some(
      ([pr, pg, pb]) =>
        Math.abs(r - (pr ?? 0)) + Math.abs(g - (pg ?? 0)) + Math.abs(b - (pb ?? 0)) <=
        CORNER_DISTANCE,
    );
    if (!near) {
      return `bundle/art-icon-fullbleed — corner color rgb(${r},${g},${b}) is not a game palette color: draw the plate as a full-bleed rect of a game color before the mark`;
    }
  }
  return null;
};
