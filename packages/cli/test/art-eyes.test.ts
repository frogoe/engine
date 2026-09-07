import { describe, expect, test } from "bun:test";
/** art-eyes — the vision cartography. Pure functions vs synthetic
 *  pixel buffers: palette glyph hits, the 16-step ramp, 2×2 area
 *  sampling (thin lines survive), half-block pretty mode, and the
 *  dead-row composition metric. */
import {
  charFor,
  compositionMetrics,
  mapToChars,
  mapToPretty,
  type EyePalette,
} from "../src/art-eyes.ts";

const PAL: EyePalette = {
  accent: "#ff3b3b",
  bg: "#1a1424",
  fg: "#f2ecff",
  outline: "#120d1a",
};

const px = (
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number],
): number[] => {
  const data: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data.push(...paint(x, y), 255);
    }
  }
  return data;
};

describe("charFor — palette hits + the 16-step ramp", () => {
  test("exact palette colors get their identity glyphs", () => {
    expect(charFor(0x1a, 0x14, 0x24, PAL)).toBe("."); // bg
    expect(charFor(0xf2, 0xec, 0xff, PAL)).toBe("O"); // fg
    expect(charFor(0xff, 0x3b, 0x3b, PAL)).toBe("X"); // accent
    expect(charFor(0x12, 0x0d, 0x1a, PAL)).toBe("#"); // outline
  });
  test("non-palette colors ride the ramp: dark dense, light sparse", () => {
    // grays NEAR a palette color legitimately snap to it (nearest wins) —
    // probe the off-palette mid-range only
    expect(charFor(0, 0, 200, PAL)).toBe("%"); // deep blue → dense ramp
    expect(charFor(200, 200, 200, PAL)).toBe("^"); // light gray → sparse ramp
    // ramp excludes the reserved glyphs across the off-palette range
    const seen = new Set<string>();
    for (let v = 70; v <= 180; v += 10) {
      seen.add(charFor(v, v, v, PAL));
    }
    for (const reserved of [".", "O", "X", "#"]) {
      expect(seen.has(reserved)).toBeFalse();
    }
  });
});

describe("mapToChars — dimensions + area sampling", () => {
  test("map shape is cols × rows", () => {
    const data = px(100, 60, () => [26, 20, 36]);
    const map = mapToChars(data, 100, 60, 40, 12, PAL);
    const lines = map.split("\n");
    expect(lines.length).toBe(12);
    expect(lines[0]?.length).toBe(40);
  });
  test("a 1px vertical line survives downsampling (area sampling)", () => {
    // white line at mid-cell x=27 on dark bg, mapped to 20 cols (5px/cell)
    const data = px(100, 20, (x) => (x === 27 ? [242, 236, 255] : [26, 20, 36]));
    const map = mapToChars(data, 100, 20, 20, 5, PAL);
    const lines = map.split("\n");
    // the line lands in cell 5 (x 25..29) — every row shows non-bg ink there
    const hasInk = lines.every((line) => {
      const cell = line.slice(4, 7);
      return /[^.]/u.test(cell.replaceAll(" ", "."));
    });
    expect(hasInk).toBeTrue();
  });
});

describe("mapToPretty — half-block truecolor", () => {
  test("carries ▀ cells and ANSI resets per line", () => {
    const data = px(10, 10, () => [200, 100, 50]);
    const pretty = mapToPretty(data, 10, 10, 5, 5);
    const lines = pretty.split("\n");
    expect(lines.length).toBe(5);
    expect(lines[0]).toContain("\u2580");
    expect(lines[0]).toContain("\x1b[38;2;200;100;50m");
    expect(lines[0]?.endsWith("\x1b[0m")).toBeTrue();
  });
});

describe("compositionMetrics — coverage + dead rows", () => {
  test("empty sky rows count dead; full rows don't", () => {
    // 100×80: rows 0..39 pure bg, rows 40..79 full ink
    const data = px(100, 80, (_x, y) => (y < 40 ? [26, 20, 36] : [242, 236, 255]));
    const m = compositionMetrics(data, 100, 80, 10, PAL);
    expect(m.deadRows).toBe(5); // top half of the 10 grid rows
    expect(m.coverage).toBeGreaterThan(0.45);
    expect(m.coverage).toBeLessThan(0.55);
  });
  test("near-bg floor (Δ<60) reads as background, not ink", () => {
    const data = px(100, 20, () => [36, 27, 51]); // sawstorm floor vs bg dist 38
    const m = compositionMetrics(data, 100, 20, 5, PAL);
    expect(m.coverage).toBe(0);
  });
});
