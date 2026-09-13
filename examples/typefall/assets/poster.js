/* Typefall poster — a photograph of the board, not a drawing of it.
 * Every size comes from TUNE at phone scale (S = w/390): same alien
 * glyphs, same chip renderer (mono letters, same radii/borders), same
 * laser (same widths, ending at the chip's top border), same dart at
 * the same size, same sky geometry (nebulas at the game's own anchors),
 * same starfield parameters. The title is the poster's one overlay. */
import { C, TUNE, drawAlienGlyph, drawShipGlyph } from "../game.js";

export function drawPoster(ctx, w, h) {
  const t = 300;
  const S = w / 390; // phone scale — the board's own pixels
  const cx = w / 2;

  /* ── sky: the game's exact recipe (bg + nebulas at the board's anchors) ── */
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  const nebC = ctx.createRadialGradient(w * 0.12, h * 0.2, 0, w * 0.12, h * 0.2, w * 0.5);
  nebC.addColorStop(0, C.nebulaCyan);
  nebC.addColorStop(1, "rgba(31,182,201,0)");
  ctx.fillStyle = nebC;
  ctx.fillRect(0, 0, w, h);
  const nebI = ctx.createRadialGradient(w * 0.88, h * 0.82, 0, w * 0.88, h * 0.82, w * 0.55);
  nebI.addColorStop(0, C.nebulaIris);
  nebI.addColorStop(1, "rgba(123,77,219,0)");
  ctx.fillStyle = nebI;
  ctx.fillRect(0, 0, w, h);

  /* stars — the game's three layers, same counts/radii/alphas/colors */
  const drand = (seed, i, n) => {
    const x = Math.sin(seed + i * n) * 10000;
    return x - Math.floor(x);
  };
  const layers = [
    { color: C.starFar, list: Array.from({ length: 42 }, (_, i) => ({ fx: drand(1, i, 12.9), fy: drand(1, i, 4.1), r: 0.5 + drand(1, i, 7.7) * 0.6, a: 0.2 + drand(1, i, 3.3) * 0.3 })) },
    { color: C.starMid, list: Array.from({ length: 26 }, (_, i) => ({ fx: drand(2, i, 12.9), fy: drand(2, i, 4.1), r: 0.8 + drand(2, i, 7.7) * 0.8, a: 0.4 + drand(2, i, 3.3) * 0.4 })) },
    { color: "#ffffff", list: Array.from({ length: 12 }, (_, i) => ({ fx: drand(3, i, 12.9), fy: drand(3, i, 4.1), r: 1.3 + drand(3, i, 7.7) * 1.0, a: 0.7 + drand(3, i, 3.3) * 0.3 })) },
  ];
  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    for (const s of layer.list) {
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(s.fx * w, s.fy * h, s.r * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  /* ── the board's chip renderer, verbatim (sizes × S) ── */
  const chip = (px, py, word, typed, hot) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(15 * S)}px "Space Grotesk", system-ui, sans-serif`;
    const boxW = ctx.measureText(word.toUpperCase()).width + 24 * S;
    const boxH = 30 * S;
    ctx.fillStyle = C.chip;
    ctx.beginPath();
    ctx.roundRect(px - boxW / 2, py, boxW, boxH, 16 * S);
    ctx.fill();
    if (hot) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = C.flare;
      ctx.lineWidth = 3 * S;
      ctx.beginPath();
      ctx.roundRect(px - boxW / 2, py, boxW, boxH, 16 * S);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = hot ? C.flare : "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.roundRect(px - boxW / 2, py, boxW, boxH, 16 * S);
    ctx.stroke();
    ctx.font = `400 ${Math.round(13 * S)}px "Space Mono", ui-monospace, monospace`;
    const chars = word.toUpperCase().split("");
    const cw = ctx.measureText("M").width;
    const startX = px - ((chars.length - 1) * (cw + 2 * S)) / 2;
    chars.forEach((chr, i) => {
      ctx.fillStyle = i < typed ? C.flare : C.fg;
      ctx.fillText(chr, startX + i * (cw + 2 * S), py + boxH / 2 + 1 * S);
    });
    return py; // chip top = where the game's lasers stop
  };

  /* ── the board's burst ring, verbatim (3px stroke, r = 18·S) ── */
  const burst = (px, py, color) => {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3 * S;
    ctx.beginPath();
    ctx.arc(px, py, 18 * S * 1.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.9 * 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 18 * S * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  /* ── the moment: formation descending, hero locked, dart firing ──
   * positions in board pixels (390-wide phone), scaled by S */
  const gW = TUNE.glyphW * S;
  const gH = TUNE.glyphH * S;

  // wings — incoming, untouched: FULL glyph size, like every alien on the board
  drawAlienGlyph(ctx, 98 * S, 248 * S, gW, gH, 1, t + 900);
  chip(98 * S, (248 + TUNE.glyphH + 4) * S, "comet", 0, false);
  drawAlienGlyph(ctx, 292 * S, 286 * S, gW, gH, 0, t + 300);
  chip(292 * S, (286 + TUNE.glyphH + 4) * S, "meteor", 0, false);

  // hero — the locked target: burst + chip three letters in
  const heroY = 372 * S;
  const heroChipTop = (372 + TUNE.glyphH + 4) * S;
  burst(cx, heroY + gH * 0.55, C.accent);
  drawAlienGlyph(ctx, cx, heroY, gW, gH, 0, t);
  chip(cx, heroChipTop, "galaxy", 3, true);

  // the dart's shot — the game's laser: from ship nose to chip TOP border
  const shipY = 626 * S;
  const laser = ctx.createLinearGradient(0, (shipY - 20 * S), 0, heroChipTop);
  laser.addColorStop(0, C.flare);
  laser.addColorStop(1, "rgba(255,106,61,0.08)");
  ctx.strokeStyle = laser;
  ctx.lineWidth = 10 * S;
  ctx.beginPath();
  ctx.moveTo(cx, shipY - 20 * S);
  ctx.lineTo(cx, heroChipTop);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = Math.max(1, 1 * S);
  ctx.beginPath();
  ctx.moveTo(cx, shipY - 20 * S);
  ctx.lineTo(cx, heroChipTop);
  ctx.stroke();

  // the dart — TUNE's size, 18 board-px above the field floor
  drawShipGlyph(ctx, cx, shipY, TUNE.shipW * S, TUNE.shipH * S, t);

  /* ── title — a word mid-type. Two light temperatures, the game's own:
   * cyan = the world's glow (cool, ambient), flare = the typed/action
   * (warm, tight). White core with sticker depth keeps it print-solid.
   * Poster renders once, so blur passes are free here (never per-frame). */
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const titleY = h * 0.125;
  const titleFont = (px) => `700 ${Math.round(px)}px "Space Grotesk", system-ui, sans-serif`;
  // fit: word + caret together stay inside the margins
  let fs = w * 0.14;
  ctx.font = titleFont(fs);
  const caretW = () => fs * 0.055; // thin | bar — a block reads as the letter I
  while (ctx.measureText("TYPEFALL").width + caretW() + w * 0.03 > w * 0.86 && fs > w * 0.06) {
    fs -= w * 0.004;
    ctx.font = titleFont(fs);
  }
  const startX = cx - (ctx.measureText("TYPEFALL").width + w * 0.03 + caretW()) / 2;
  const baseX = startX + ctx.measureText("TYPEFALL").width;

  // 1. sticker — hard offset, the house print depth
  ctx.fillStyle = C.bgDeep;
  ctx.fillText("TYPEFALL", startX + w * 0.012, titleY + w * 0.012);
  // 2. ambient — one wide, faint cyan halo (the world's light)
  ctx.save();
  ctx.shadowColor = "rgba(40, 224, 232, 0.55)";
  ctx.shadowBlur = w * 0.045;
  ctx.fillStyle = "rgba(40, 224, 232, 0.22)";
  ctx.fillText("TYPEFALL", startX, titleY);
  ctx.fillText("TYPEFALL", startX, titleY); // double pass deepens the halo
  ctx.restore();
  // 3. core — crisp white with a tight cyan rim
  ctx.save();
  ctx.shadowColor = "rgba(40, 224, 232, 0.8)";
  ctx.shadowBlur = w * 0.012;
  ctx.fillStyle = C.fg;
  ctx.fillText("TYPEFALL", startX, titleY);
  ctx.restore();
  // 4. the typed lock — the verb "TYPE" already struck, in full flare
  //    with its warm glow (FALL still waiting in white)
  ctx.save();
  ctx.shadowColor = "rgba(255, 106, 61, 0.85)";
  ctx.shadowBlur = w * 0.02;
  ctx.fillStyle = C.flare;
  ctx.fillText("TYPE", startX, titleY);
  ctx.restore();
  // 5. the caret — terminal block, frozen mid-blink at the word's end
  ctx.save();
  ctx.shadowColor = "rgba(255, 106, 61, 0.8)";
  ctx.shadowBlur = w * 0.014;
  ctx.fillStyle = C.flare;
  ctx.fillRect(baseX + w * 0.028, titleY - fs * 0.78, caretW(), fs * 0.78);
  ctx.restore();

  /* tagline — the product's eyebrow voice: mono, tracked wide, uppercase */
  const tagFs = Math.round(w * 0.026);
  ctx.font = `700 ${tagFs}px "Space Mono", ui-monospace, monospace`;
  ctx.letterSpacing = `${Math.round(tagFs * 0.24)}px`;
  ctx.fillStyle = C.accent;
  ctx.textAlign = "center";
  ctx.fillText("TYPE THE WORD · SAVE THE LINE", cx + tagFs * 0.12, titleY + w * 0.075);
  ctx.letterSpacing = "0px";

  /* declare the lettering band for the bundler's collision check */
  ctx.__frogoeTitleBand = [w * 0.05, titleY - fs, w * 0.95, titleY + w * 0.085];
}
