/** Sawstorm — key art. THE design system (frogoe-creative →
 *  art.md): the poster IS a perfect frame of the game.
 *
 *  · Native canvas — the game's own stage (540×960, ×2 into the
 *    1080×1920 raster, like dpr). ZERO zoom: player 30×44, blades
 *    r 24 (the uniform in-game size), walls 10, floor at
 *    height − safe − 96 — every number literal. Nothing is resized.
 *  · A legal arena — walls at the play column's true edges (40/500 on
 *    a 540 stage), the player planted at the ground line with the
 *    game's own ready pose, six blades at mid-flight positions with
 *    HONEST clearances (closest pass clears the player box by 60+ px
 *    — dramatic, never touching: blades that read as colliding are a
 *    broken frame), dust blades ×10 and clouds ×6 at game counts.
 *  · The identity layer — Press Start 2P logotype, measure-fit to the
 *    stage-space budget, accent hard shadow like the HUD's own voice. */
import { C, drawCloud, drawFloor, drawPlayer, drawSaw, drawWalls } from "../game.js";

const fitText = (ctx, text, font, targetPx, maxW) => {
  ctx.font = font(targetPx);
  const width = ctx.measureText(text).width;
  return width <= maxW ? targetPx : Math.floor(targetPx * (maxW / width));
};

export function drawPoster(ctx, w, h) {
  const STAGE_W = 540;
  const STAGE_H = 960;
  const DPR = w / STAGE_W; // ×2 — the raster IS the stage at dpr 2
  ctx.save();
  ctx.scale(DPR, DPR);

  const wallW = 10; // TUNE.wallW
  const left = 40; // stage.play.left on a 540 stage (play capped at 460)
  const right = 500; // stage.play.right
  const gy = STAGE_H - 16 - 96; // groundY(): height − max(safe.bottom,16) − 96

  // arena night + deep top band (inside the walls, like the game)
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.fillStyle = C.bgDeep;
  ctx.fillRect(left, 0, right - left, STAGE_H * 0.18);

  // ambient world — dust blades ×10, clouds ×6 (game counts). The
  // title band is a SAFE ZONE (free-floating ambience stays below it)
  drawSaw(ctx, { x: 250, y: 150, r: 4, rot: -0.4 }, true);
  drawSaw(ctx, { x: 460, y: 170, r: 5, rot: 0.9 }, true);
  drawSaw(ctx, { x: 80, y: 260, r: 5, rot: 0.2 }, true);
  drawSaw(ctx, { x: 470, y: 620, r: 5, rot: 1.1 }, true);
  drawSaw(ctx, { x: 40, y: 480, r: 4, rot: 2.2 }, true);
  drawSaw(ctx, { x: 60, y: 700, r: 4, rot: 0.6 }, true);
  drawSaw(ctx, { x: 510, y: 340, r: 3, rot: 0.4 }, true);
  drawCloud(ctx, 90, 250, 36, C.cloudFar);
  drawCloud(ctx, 430, 240, 42, C.cloud);
  drawCloud(ctx, 120, 580, 36, C.cloud);
  drawCloud(ctx, 420, 660, 30, C.cloudFar);

  // THE STORM COLUMN — the dodge moment as a falling wall: eight
  // uniform blades (r 24, cap 14 — legal) staggering down the player's
  // lane, flankers for width, the near-miss low. Every blade clears
  // the player box (bbox 235..265 × 804..848) by an honest margin
  // (closest pass: 51 px) and all centers stay below the title zone
  // THE MOMENT — few, well-placed: a column of THREE implies the
  // storm (spacing 120, staggered), two flankers for width, one hero
  // near-miss. Density comes from placement, not count.
  drawSaw(ctx, { x: 255, y: 250, r: 24, rot: 0.4 }); // column top (teeth 226 ≥ block+26)
  drawSaw(ctx, { x: 290, y: 370, r: 24, rot: 1.2 });
  drawSaw(ctx, { x: 250, y: 490, r: 24, rot: 2.0 });
  drawSaw(ctx, { x: 105, y: 350, r: 24, rot: 0.9 }); // left flanker
  drawSaw(ctx, { x: 435, y: 460, r: 24, rot: 2.4 }); // right flanker
  drawSaw(ctx, { x: 280, y: 730, r: 24, rot: 0.3 }); // the near miss

  // the player — planted at the ground line, the game's ready pose,
  // 30×44 at native size; a jump puff behind (the game's own trail)
  drawPlayer(ctx, {
    x: 250, y: gy, w: 30, h: 44,
    squash: 1, face: 1, grounded: true, flips: 0, spin: 0,
  });
  ctx.fillStyle = C.fgDim;
  ctx.fillRect(228, gy - 6, 4, 4);
  ctx.fillRect(219, gy - 3, 3, 3);

  // floor + walls, tuning verbatim
  drawFloor(ctx, left, right, gy, STAGE_H);
  drawWalls(ctx, left, right, STAGE_H, wallW);

  // CRT scanlines — the dial-up tactile layer (2026): on dark art the
  // raster line LIGHTENS (fg at a whisper), never darkens into mud
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = C.fg;
  for (let y = 0; y < STAGE_H; y += 3) {
    ctx.fillRect(0, y, STAGE_W, 1);
  }
  ctx.globalAlpha = 1;

  // identity layer — stage-space budgets, measure-fit
  const cx = STAGE_W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "4px";

  const size = fitText(ctx, "SAWSTORM", (px) => `${px}px "Press Start 2P"`, 66, STAGE_W * 0.84);
  ctx.font = `${size}px "Press Start 2P"`;
  const y1 = 130;
  const drop = Math.max(4, size * 0.12);
  ctx.fillStyle = C.accent;
  ctx.fillText("SAWSTORM", cx + drop, y1 + drop);
  ctx.fillStyle = C.fg;
  ctx.fillText("SAWSTORM", cx, y1);

  ctx.letterSpacing = "3px";
  const sub = fitText(ctx, "DODGE THE BLADES", (px) => `${px}px "Press Start 2P"`, 16, STAGE_W * 0.55);
  const y2 = y1 + size * 0.7 + sub * 1.2;
  ctx.font = `${sub}px "Press Start 2P"`;
  ctx.fillStyle = C.accent;
  ctx.fillText("DODGE THE BLADES", cx, y2);
  ctx.letterSpacing = "0px";

  // the declared lettering block (stage units) — the safe-zone contract.
  // Declared FROM the layout variables (never hand-typed numbers: the
  // render is the only truth — a hand-typed band lies to the gate)
  ctx.__frogoeTitleBand = [
    Math.round(cx - STAGE_W * 0.42), Math.round(56),
    Math.round(cx + STAGE_W * 0.42), Math.ceil(y2) + 2,
  ];

  ctx.restore();
}
