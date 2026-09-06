/** The pixel analyzers — shared between Node (unit tests, CLI decisions)
 *  and browser pages (raster/vision injection). This file is shipped
 *  VERBATIM (never bundled — esbuild renames cross-references and breaks
 *  toString() injection; see the bun-vs-esbuild divergence incident).
 *  In the page it is injected as-is; in Node it is imported as-is. */

// ── luminance / contrast (WCAG) ──────────────────────────────────────────
const luminance = (r, g, b) => {
  const ch = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

const contrastRatio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// ── composition metrics (coverage + dead rows) ───────────────────────────
const compositionMetrics = (data, width, height, rows, palette) => {
  const hex = (palette && palette.bg) || "#000000";
  const pr = parseInt(hex.slice(1, 3), 16);
  const pg = parseInt(hex.slice(3, 5), 16);
  const pb = parseInt(hex.slice(5, 7), 16);
  let ink = 0,
    total = 0,
    deadRows = 0;
  for (let gy = 0; gy < rows; gy++) {
    let rowInk = 0,
      rowTotal = 0;
    const y0 = Math.floor((gy * height) / rows);
    const y1 = Math.floor(((gy + 1) * height) / rows);
    for (let y = y0; y < y1; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const at = (y * width + x) * 4;
        const isBg =
          Math.abs((data[at] || 0) - pr) +
            Math.abs((data[at + 1] || 0) - pg) +
            Math.abs((data[at + 2] || 0) - pb) <
          60;
        rowTotal++;
        rowInk += isBg ? 0 : 1;
      }
    }
    if (rowTotal > 0 && rowInk / rowTotal < 0.08) deadRows++;
    ink += rowInk;
    total += rowTotal;
  }
  return { coverage: total > 0 ? ink / total : 0, deadRows: deadRows, rows: rows };
};

// ── title-band analyzer (upper field, logotype-scale ink) ────────────────
const analyzeTitleBand = (data, width, height) => {
  const fieldHeight = Math.floor(height * 0.65);
  const fieldBuckets = new Map();
  for (let y = 0; y < fieldHeight; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const at = (y * width + x) * 4;
      const key =
        (((data[at] || 0) >> 4) << 8) |
        (((data[at + 1] || 0) >> 4) << 4) |
        ((data[at + 2] || 0) >> 4);
      fieldBuckets.set(key, (fieldBuckets.get(key) || 0) + 1);
    }
  }
  let groundKey = 0,
    groundHits = -1;
  for (const [key, hits] of fieldBuckets) {
    if (hits > groundHits) {
      groundHits = hits;
      groundKey = key;
    }
  }
  const ground = [
    ((groundKey >> 8) & 15) * 17,
    ((groundKey >> 4) & 15) * 17,
    (groundKey & 15) * 17,
  ];
  const groundLum = luminance(ground[0], ground[1], ground[2]);
  const isInk = (x, y) => {
    const at = (y * width + x) * 4;
    return (
      contrastRatio(luminance(data[at] || 0, data[at + 1] || 0, data[at + 2] || 0), groundLum) >= 3
    );
  };
  const rowInkMin = Math.ceil((width / 2) * 0.15);
  const wideRowMin = Math.ceil((width / 2) * 0.4);
  let inkCount = 0,
    inkTotal = 0,
    textBottom = -1;
  let bbox = null;
  for (let y = 0; y < fieldHeight; y += 2) {
    let rowInk = 0;
    for (let x = 0; x < width; x += 2) {
      if (isInk(x, y)) rowInk++;
    }
    inkTotal += Math.ceil(width / 2);
    if (rowInk >= wideRowMin) textBottom = y;
    if (rowInk >= rowInkMin) {
      inkCount += Math.ceil(width / 2);
      if (bbox === null) bbox = [width, y, 0, y];
      bbox = [bbox[0], bbox[1], bbox[2], y];
    }
  }
  if (bbox !== null) {
    const bins = new Map();
    for (let y = bbox[1]; y <= bbox[3]; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (isInk(x, y)) {
          const bin = x >> 2;
          bins.set(bin, (bins.get(bin) || 0) + 1);
        }
      }
    }
    const sorted = [...bins.keys()].sort((a, b) => a - b);
    const GAP_BINS = 6;
    let best = null,
      runFrom = -1,
      runTo = -1,
      runInk = 0;
    for (let i = 0; i <= sorted.length; i++) {
      const bin = sorted[i] !== undefined ? sorted[i] : Number.MAX_SAFE_INTEGER;
      const prev = sorted[i - 1] !== undefined ? sorted[i - 1] : bin;
      const starts = i === 0 || bin - prev > GAP_BINS;
      if (starts && runFrom !== -1) {
        if (best === null || runInk > best[2]) best = [runFrom, runTo, runInk];
        runFrom = -1;
        runInk = 0;
      }
      if (i === sorted.length) break;
      if (runFrom === -1) runFrom = bin;
      runTo = bin;
      runInk += bins.get(bin) || 0;
    }
    if (best !== null) bbox = [best[0] * 4, bbox[1], best[1] * 4 + 2, bbox[3]];
    else bbox = null;
  }
  return {
    bandHeight: fieldHeight,
    ground: ground,
    inkBBox: bbox,
    inkCount: inkCount,
    inkTotal: inkTotal,
    textBottom: textBottom,
  };
};

// ── icon corner analyzer ──────────────────────────────────────────────────
const analyzeIconCorners = (data, width, _height) => {
  const read = (x, y) => {
    let r = 0,
      g = 0,
      b = 0,
      a = 0;
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const at = ((y + dy) * width + (x + dx)) * 4;
        r += data[at] || 0;
        g += data[at + 1] || 0;
        b += data[at + 2] || 0;
        a += data[at + 3] || 0;
      }
    }
    return [Math.round(r / 16), Math.round(g / 16), Math.round(b / 16), Math.round(a / 16)];
  };
  const last = width - 4;
  return { corners: [read(0, 0), read(last, 0), read(0, last), read(last, last)] };
};

// ── safe-zone collision (declared band clearance) ─────────────────────────
const findTitleZoneCollision = (data, width, height, band) => {
  if (band === null || band === undefined) return null;
  const x0 = Math.max(0, Math.round(band[0]));
  const y0 = Math.max(0, Math.round(band[1]));
  const x1 = Math.min(width - 1, Math.round(band[2]));
  const y1 = Math.min(height - 1, Math.round(band[3]));
  const lumOf = (x, y) => {
    const at = (y * width + x) * 4;
    return luminance(data[at] || 0, data[at + 1] || 0, data[at + 2] || 0);
  };
  const buckets = new Map();
  for (let y = y0; y <= y1; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const at = (y * width + x) * 4;
      const key =
        (((data[at] || 0) >> 4) << 8) |
        (((data[at + 1] || 0) >> 4) << 4) |
        ((data[at + 2] || 0) >> 4);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }
  let gk = 0,
    gh = -1;
  for (const [k, h] of buckets) {
    if (h > gh) {
      gh = h;
      gk = k;
    }
  }
  const groundLum = luminance(((gk >> 8) & 15) * 17, ((gk >> 4) & 15) * 17, (gk & 15) * 17);
  const isLnk = (x, y) => contrastRatio(lumOf(x, y), groundLum) >= 3;
  const ceiling = [];
  for (let x = 0; x < width; x += 4) {
    for (let y = 0; y < 6; y += 2) {
      if (isLnk(x, y)) {
        ceiling.push(x);
        break;
      }
    }
  }
  const nearCeiling = (x) => {
    for (const c of ceiling) {
      if (Math.abs(x - c) <= 8) return true;
    }
    return false;
  };
  const unit = width / 540;
  const margin = Math.round(24 * unit);
  const blobMin = Math.round(12 * unit);
  const countMin = Math.round(30 * (unit / 2));
  let floaters = 0,
    widest = 0;
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
    return (
      "bundle/art-title-collision — a free-floating blob (" +
      widest +
      "px wide) parks in the clearance margin under the lettering block (rows " +
      (y1 + 2) +
      ".." +
      windowBottom +
      "): free world must clear the block by ~its own radius — relocate below or compose around it (ceiling-hung world is the one legal crosser) — frogoe-creative → references/art.md"
    );
  }
  return null;
};
