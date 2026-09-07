import { describe, expect, test } from "bun:test";
/** Tier-2 art gates — pure analyzers and validators against synthetic
 *  pixel data (no chrome in unit tests; the raster e2e covers the
 *  in-page path, where these same functions ship via toString). */
import {
  analyzeIconCorners,
  analyzeTitleBand,
  contrastRatio,
  findTitleZoneCollision,
  luminance,
  verifyIconFullbleed,
  verifyTitleReadability,
} from "../src/art-verify.ts";

const px = (
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number, number],
): number[] => {
  const data: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data.push(...paint(x, y));
    }
  }
  return data;
};

describe("luminance / contrast", () => {
  test("white vs black is 21:1; teal vs white is low", () => {
    expect(Math.round(contrastRatio(luminance(255, 255, 255), luminance(0, 0, 0)))).toBe(21);
    // flappy sky #4EC0CA vs chick white — below 3:1 (why the outline law exists)
    expect(contrastRatio(luminance(250, 250, 250), luminance(78, 192, 202))).toBeLessThan(3);
  });
});

describe("bundle/art-title-readability", () => {
  const W = 1080;
  const H = 1920;
  test("teal sky + a big outlined title passes (the outline carries contrast)", () => {
    // sky band with a title slab — the dark OUTLINE is the contrast
    // carrier (white-on-teal is only 2.1:1; flappy's title passes on
    // its #543847 outline, exactly the HUD readability law)
    const data = px(W, H, (x, y) => {
      if (x > 100 && x < 980 && y > 100 && y < 260) return [84, 56, 71, 255];
      return [78, 192, 202, 255];
    });
    const report = analyzeTitleBand(data, W, H);
    expect(verifyTitleReadability(report, W)).toBeNull();
  });

  test("a MID-FRAME title passes (sky-pocket compositions)", () => {
    const data = px(W, H, (x, y) => {
      if (x > 160 && x < 920 && y > 728 && y < 1060) return [84, 56, 71, 255];
      return [78, 192, 202, 255];
    });
    expect(verifyTitleReadability(analyzeTitleBand(data, W, H), W)).toBeNull();
  });

  test("narrow world columns (pipes) are not logotypes", () => {
    // a 104px ink column, ceiling-hung — high contrast, never run-wide
    const data = px(W, H, (x, y) => {
      if (x > 480 && x < 584 && y < 900) return [84, 56, 71, 255];
      return [78, 192, 202, 255];
    });
    const verdict = verifyTitleReadability(analyzeTitleBand(data, W, H), W);
    expect(verdict).toContain("art-title-readability");
  });
  test("an empty band fails with the teaching error", () => {
    const data = px(W, H, () => [78, 192, 202, 255]);
    const report = analyzeTitleBand(data, W, H);
    const verdict = verifyTitleReadability(report, W);
    expect(verdict).toContain("bundle/art-title-readability");
    expect(verdict).toContain("frogoe-creative");
  });
  test("a title touching the edge fails the overflow guard", () => {
    const data = px(W, H, (x, y) => {
      if (y < 260 && y > 100) return [84, 56, 71, 255]; // runs x 0..W
      return [78, 192, 202, 255];
    });
    const report = analyzeTitleBand(data, W, H);
    const verdict = verifyTitleReadability(report, W);
    expect(verdict).toContain("measure-fit");
  });
  test("sub-3:1 ink (white on pale sky) counts as ground — fails", () => {
    const data = px(W, H, (x, y) => {
      if (y < 260 && y > 100 && x > 100 && x < 980) return [244, 216, 216, 255];
      return [242, 236, 255, 255]; // pale night-ish ground
    });
    const report = analyzeTitleBand(data, W, H);
    expect(verifyTitleReadability(report, W)).toContain("art-title-readability");
  });
});

describe("bundle/art-title-collision (the declared safe-zone rule)", () => {
  const W = 1080;
  const H = 1920;
  const INK: [number, number, number, number] = [84, 56, 71, 255];
  const SKY: [number, number, number, number] = [78, 192, 202, 255];
  const BAND: [number, number, number, number] = [200, 200, 880, 400];
  const paint = (lettering: boolean, world: ((x: number, y: number) => boolean) | null): number[] =>
    px(W, H, (x, y) => {
      if (lettering && x > 200 && x < 880 && ((y > 210 && y < 260) || (y > 340 && y < 390))) {
        return INK;
      }
      if (world !== null && world(x, y)) return INK;
      return SKY;
    });

  test("clean: nothing in the clearance margin", () => {
    const data = paint(true, null);
    expect(findTitleZoneCollision(data, W, H, BAND)).toBeNull();
  });

  test("a blade-scale blob parked in the margin → collision", () => {
    const data = paint(true, (x, y) => x > 480 && x < 620 && y > 410 && y < 470);
    const verdict = findTitleZoneCollision(data, W, H, BAND);
    expect(verdict).toContain("bundle/art-title-collision");
    expect(verdict).toContain("frogoe-creative");
  });

  test("ceiling-hung world in the margin is the legal crosser (exempt)", () => {
    const data = paint(true, (x, y) => x > 480 && x < 620 && y < 900);
    expect(findTitleZoneCollision(data, W, H, BAND)).toBeNull();
  });

  test("tiny ambience (dust-scale, <24px wide) grazes freely", () => {
    const data = paint(true, (x, y) => x > 480 && x < 500 && y > 420 && y < 450);
    expect(findTitleZoneCollision(data, W, H, BAND)).toBeNull();
  });

  test("a legal element BELOW the margin (clear by its radius) passes", () => {
    const data = paint(true, (x, y) => x > 480 && x < 620 && y > 452 && y < 520);
    expect(findTitleZoneCollision(data, W, H, BAND)).toBeNull();
  });

  test("undeclared band → no check (vision reports 'undeclared')", () => {
    const data = paint(true, (x, y) => x > 480 && x < 620 && y > 410 && y < 470);
    expect(findTitleZoneCollision(data, W, H, null)).toBeNull();
  });
});

describe("bundle/art-icon-fullbleed", () => {
  const S = 64;
  test("opaque full-bleed plate in a game color passes", () => {
    const data = px(S, S, () => [26, 20, 36, 255]);
    const report = analyzeIconCorners(data, S, S);
    expect(verifyIconFullbleed(report, ["#1a1424", "#f2ecff"])).toBeNull();
  });
  test("scanline-tinted corners still match the palette (≤60 distance)", () => {
    // bg #1a1424 + 6% fg #f2ecff → rgb(39,33,49)
    const data = px(S, S, () => [39, 33, 49, 255]);
    expect(verifyIconFullbleed(analyzeIconCorners(data, S, S), ["#1a1424"])).toBeNull();
  });
  test("alpha corners (pre-rounded regression) fail", () => {
    const data = px(S, S, (x, y) => (x < 4 && y < 4 ? [26, 20, 36, 0] : [26, 20, 36, 255]));
    const verdict = verifyIconFullbleed(analyzeIconCorners(data, S, S), ["#1a1424"]);
    expect(verdict).toContain("alpha");
  });
  test("off-palette corners fail with the plate teaching", () => {
    const data = px(S, S, () => [0, 255, 0, 255]);
    const verdict = verifyIconFullbleed(analyzeIconCorners(data, S, S), ["#1a1424"]);
    expect(verdict).toContain("full-bleed");
  });
});
