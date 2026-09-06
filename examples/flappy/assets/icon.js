/** Flappy Chick — mark. The hero close-up (the poster keeps the world
 *  at game scale; the icon extracts the hero and lets it fill the
 *  plate — Steam: "your logo should nearly fill"). Same drawBird, SAME
 *  HERO_POSE as the poster — one pose, every surface. A sliver of the
 *  game's own ground anchors the world. */
import { C, HERO_POSE, drawBird, drawGround } from "../game.js";

export function drawIcon(ctx, size) {
  // full-bleed square — stores/hosts apply their own rounded mask;
  // pre-rounding double-rounds and ships alpha corners (Apple rejects)
  ctx.fillStyle = C.sky;
  ctx.fillRect(0, 0, size, size);

  // ground sliver — the game's own striped ground, world identity
  drawGround(ctx, size, size * 0.893, size * 0.107, 0);

  drawBird(ctx, size * 0.49, size * 0.47, size * 0.25, HERO_POSE);
}
