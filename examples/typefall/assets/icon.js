/* Typefall icon — the alien glyph with its word chip, 1:1 sprites. */
import { C, drawAlienGlyph } from "../game.js";

export function drawIcon(ctx, size) {
  const t = 300;

  /* deep space disc */
  const sky = ctx.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.5, size * 0.62);
  sky.addColorStop(0, C.skyMid);
  sky.addColorStop(1, C.bgDeep);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);

  /* nebula washes, same two tones */
  const nebC = ctx.createRadialGradient(size * 0.2, size * 0.25, 0, size * 0.2, size * 0.25, size * 0.5);
  nebC.addColorStop(0, "rgba(31,182,201,0.2)");
  nebC.addColorStop(1, "rgba(31,182,201,0)");
  ctx.fillStyle = nebC;
  ctx.fillRect(0, 0, size, size);
  const nebI = ctx.createRadialGradient(size * 0.8, size * 0.8, 0, size * 0.8, size * 0.8, size * 0.55);
  nebI.addColorStop(0, "rgba(123,77,219,0.24)");
  nebI.addColorStop(1, "rgba(123,77,219,0)");
  ctx.fillStyle = nebI;
  ctx.fillRect(0, 0, size, size);

  /* stars */
  for (let i = 0; i < 26; i++) {
    const x = Math.abs((Math.sin(2 + i * 12.9) * 10000) % 1) * size;
    const y = Math.abs((Math.sin(2 + i * 4.1) * 10000) % 1) * size;
    ctx.globalAlpha = 0.3 + (i % 3) * 0.25;
    ctx.fillStyle = [C.starFar, C.starMid, "#ffffff"][i % 3];
    ctx.beginPath();
    ctx.arc(x, y, size * 0.006 * (1 + (i % 3)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* the alien — cyan hero, centered, large */
  drawAlienGlyph(ctx, size * 0.5, size * 0.42, size * 0.44, size * 0.42, 0, t);

  /* word chip, mid-type — the mechanic in one glance */
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fs = Math.round(size * 0.085);
  ctx.font = `700 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  const chars = "TYPE".split("");
  const cw = ctx.measureText("M").width;
  const gap = size * 0.012;
  const boxW = ((chars.length - 1) * (cw + gap)) + size * 0.14;
  const boxH = size * 0.14;
  const cy = size * 0.72;
  ctx.fillStyle = C.chip;
  ctx.beginPath();
  ctx.roundRect(size * 0.5 - boxW / 2, cy, boxW, boxH, boxH / 2);
  ctx.fill();
  ctx.strokeStyle = C.flare;
  ctx.lineWidth = size * 0.008;
  ctx.beginPath();
  ctx.roundRect(size * 0.5 - boxW / 2, cy, boxW, boxH, boxH / 2);
  ctx.stroke();
  const startX = size * 0.5 - ((chars.length - 1) * (cw + gap)) / 2;
  chars.forEach((chr, i) => {
    ctx.fillStyle = i < 2 ? C.flare : C.fg; // T-Y locked, P-E waiting
    ctx.fillText(chr, startX + i * (cw + gap), cy + boxH / 2 + 1);
  });
}
