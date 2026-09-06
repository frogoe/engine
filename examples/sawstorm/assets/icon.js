/** Sawstorm — mark. One metaphor: the sawblade exactly as drawSaw
 *  renders it (8 teeth, dark-red hub, black bolt), no words. Same
 *  blade rotation as the poster's hero blade — one pose, every
 *  surface — with the poster's CRT scanline whisper (2026 tactility). */
import { C, drawSaw } from "../game.js";

const HERO_BLADE_ROT = 0.3;

export function drawIcon(ctx, size) {
  // full-bleed square — stores/hosts apply their own rounded mask;
  // pre-rounding double-rounds and ships alpha corners (Apple rejects)
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size, size);

  drawSaw(ctx, { x: size / 2, y: size / 2, r: size * 0.31, rot: HERO_BLADE_ROT });

  ctx.globalAlpha = 0.06;
  ctx.fillStyle = C.fg;
  for (let y = 0; y < size; y += 3) {
    ctx.fillRect(0, y, size, 1);
  }
  ctx.globalAlpha = 1;
}
