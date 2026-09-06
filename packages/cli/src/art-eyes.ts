/** art-eyes — the pixel→character cartography behind `frogoe vision`.
 *  An agent writing draw code is blind: metrics hide what a map shows
 *  (a blob where a face should be, a part floating off its anchor, a
 *  dead band eating a third of the frame). These functions turn raw
 *  canvas pixels into high-fidelity ASCII maps (palette-aware glyph
 *  hits + a 16-step luminance ramp + 2×2 area sampling so thin
 *  outlines survive) and composition metrics. PURE and self-contained
 *  (no imports, no closures) so the same code is unit-tested here AND
 *  injected into the browser page via Function.toString(). */

export interface EyePalette {
  bg: string;
  fg: string;
  accent: string;
  outline?: string;
}

/** 16-step density ramp, dark→light. Palette-reserved glyphs are
 *  excluded ('.', 'O', 'X', '#') so identity colors never blur into
 *  the tonal ramp. The literal lives INSIDE charFor: this function is
 *  injected into browser pages via toString(), so it must be
 *  self-contained (bun inlines module consts, esbuild does not — the
 *  divergence shipped a broken npm CLI once). */

export const charFor = (r: number, g: number, b: number, palette: EyePalette): string => {
  // nearest palette entry wins — palettes carry near-twins (bg vs
  // outline darks) and first-hit matching would smear them together
  const entries: Array<[string, string]> = [
    [palette.bg ?? "", "."],
    [palette.fg ?? "", "O"],
    [palette.accent ?? "", "X"],
    [palette.outline ?? "", "#"],
  ];
  let bestGlyph = "";
  let bestDist = 90; // palette proximity floor
  for (const [hex, glyph] of entries) {
    if (hex.length !== 7) continue;
    const pr = Number.parseInt(hex.slice(1, 3) ?? "0", 16);
    const pg = Number.parseInt(hex.slice(3, 5) ?? "0", 16);
    const pb = Number.parseInt(hex.slice(5, 7) ?? "0", 16);
    const dist = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
    if (dist < bestDist) {
      bestDist = dist;
      bestGlyph = glyph;
    }
  }
  if (bestGlyph !== "") return bestGlyph;
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return "@%&*8=+~;:,-^`' "[Math.min(15, Math.max(0, Math.round((lum / 255) * 15)))] ?? " ";
};

/** Map a full RGBA buffer to ASCII. 2×2 area sampling per cell (the
 *  four quadrant points averaged) — anti-aliased edges and thin
 *  outlines survive downsampling. Terminal glyphs are ~2:1 tall, so
 *  callers pick cols and derive rows ≈ cols·(h/w)/2. PURE — injected. */
export const mapToChars = (
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  cols: number,
  rows: number,
  palette: EyePalette,
): string => {
  // self-contained: this fn is injected into pages via toString()
  const lines: string[] = [];
  for (let gy = 0; gy < rows; gy++) {
    let line = "";
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor((gx * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / cols));
      const y0 = Math.floor((gy * height) / rows);
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / rows));
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) {
          const at = (y * width + x) * 4;
          ar += data[at] ?? 0;
          ag += data[at + 1] ?? 0;
          ab += data[at + 2] ?? 0;
          n++;
        }
      }
      line += charFor(Math.round(ar / n), Math.round(ag / n), Math.round(ab / n), palette);
    }
    lines.push(line);
  }
  return lines.join("\n");
};

/** Truecolor half-block rendering (the ~99% mode): every terminal cell
 *  carries TWO image rows — the upper pixel as glyph foreground, the
 *  lower pixel as glyph background, on a '▀'. On any ANSI-truecolor
 *  terminal the map reads as a color thumbnail of the actual render.
 *  PURE — injected. */
export const mapToPretty = (
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  cols: number,
  rows: number,
): string => {
  const lines: string[] = [];
  for (let gy = 0; gy < rows; gy++) {
    let line = "";
    for (let gx = 0; gx < cols; gx++) {
      const px = (fy: number): [number, number, number] => {
        const x = Math.min(width - 1, Math.floor(((gx + 0.5) * width) / cols));
        const y = Math.min(height - 1, Math.floor(((gy + fy) * height) / rows));
        const at = (y * width + x) * 4;
        return [data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0];
      };
      const [tr, tg, tb] = px(0.25);
      const [br, bg, bb] = px(0.75);
      line += `\x1b[38;2;${String(tr)};${String(tg)};${String(tb)}m\x1b[48;2;${String(br)};${String(bg)};${String(bb)}m\u2580`;
    }
    lines.push(`${line}\x1b[0m`);
  }
  return lines.join("\n");
};

export interface CompositionMetrics {
  coverage: number;
  deadRows: number;
  rows: number;
}

/** Coverage (non-bg share, bg tolerance 60) and dead rows — a grid row
 *  whose non-bg share is under 8% is an empty band: the "cheap poster"
 *  smell metrics hide. Pass a cropped height to measure a region (the
 *  tier-2 gate measures the upper field, where dead bands hurt). PURE. */
export const compositionMetrics = (
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  rows: number,
  palette: EyePalette,
): CompositionMetrics => {
  const hex = palette.bg ?? "#000000";
  const pr = Number.parseInt(hex.slice(1, 3) ?? "0", 16);
  const pg = Number.parseInt(hex.slice(3, 5) ?? "0", 16);
  const pb = Number.parseInt(hex.slice(5, 7) ?? "0", 16);
  let ink = 0;
  let total = 0;
  let deadRows = 0;
  for (let gy = 0; gy < rows; gy++) {
    let rowInk = 0;
    let rowTotal = 0;
    const y0 = Math.floor((gy * height) / rows);
    const y1 = Math.floor(((gy + 1) * height) / rows);
    for (let y = y0; y < y1; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const at = (y * width + x) * 4;
        const isBg =
          Math.abs((data[at] ?? 0) - pr) +
            Math.abs((data[at + 1] ?? 0) - pg) +
            Math.abs((data[at + 2] ?? 0) - pb) <
          60;
        rowTotal++;
        rowInk += isBg ? 0 : 1;
      }
    }
    if (rowTotal > 0 && rowInk / rowTotal < 0.08) deadRows++;
    ink += rowInk;
    total += rowTotal;
  }
  return { coverage: total > 0 ? ink / total : 0, deadRows, rows };
};
