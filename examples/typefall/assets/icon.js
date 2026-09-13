/* Typefall icon — the dart, dead center, no stars. 1:1 with gameplay:
 * the same drawShipGlyph the board calls, at the game's display ratio
 * (TUNE.shipW : TUNE.shipH), over the field's own sky. */
import { C, TUNE, drawShipGlyph } from "../game.js";

export function drawIcon(ctx, size) {
  const t = 300;

  /* the field's sky — radial depth + the two nebulas, nothing else */
  const sky = ctx.createRadialGradient(size * 0.5, size * 0.44, 0, size * 0.5, size * 0.5, size * 0.62);
  sky.addColorStop(0, C.skyMid);
  sky.addColorStop(1, C.bgDeep);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);

  const nebC = ctx.createRadialGradient(size * 0.12, size * 0.2, 0, size * 0.12, size * 0.2, size * 0.5);
  nebC.addColorStop(0, C.nebulaCyan);
  nebC.addColorStop(1, "rgba(31,182,201,0)");
  ctx.fillStyle = nebC;
  ctx.fillRect(0, 0, size, size);
  const nebI = ctx.createRadialGradient(size * 0.88, size * 0.82, 0, size * 0.88, size * 0.82, size * 0.55);
  nebI.addColorStop(0, C.nebulaIris);
  nebI.addColorStop(1, "rgba(123,77,219,0)");
  ctx.fillStyle = nebI;
  ctx.fillRect(0, 0, size, size);

  /* the dart — TUNE's exact ratio, centered on both axes */
  const shipW = size * 0.7;
  const shipH = shipW * (TUNE.shipH / TUNE.shipW);
  drawShipGlyph(ctx, size * 0.5, size * 0.5 - shipH / 2, shipW, shipH, t);
}
