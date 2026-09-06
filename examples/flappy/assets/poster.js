/** Flappy Chick — key art. THE design system (frogoe-creative →
 *  art.md): the poster IS a perfect frame of the game.
 *
 *  · Native canvas — the game's own stage (540×960, ×2 into the
 *    1080×1920 raster, like dpr). ZERO zoom: every sprite is called
 *    with its literal in-game numbers (bird r 13, pipeW 52, gap 200,
 *    spacing 230, ground 80). Nothing is resized, ever.
 *
 *  · THE FLIGHT LINE — one structural truth: the bird's lane IS the
 *    frame's center (play.center), so the gate it passes through
 *    always stands behind a top title. Don't fight it — make it the
 *    AXIS: logotype → pass-gate shaft → bird in the gap → ground, a
 *    single vertical line the eye rides. Flanking gates sit outside
 *    the title's x-range with varied, spawn-legal heights (a real
 *    mid-run lane at true 230 spacing), and a clean sky band
 *    (270..318) separates the letter block from the gate's cap.
 *
 *  · The pass — AABB-centered: bird at (270, 440) = dead center of
 *    gap 340..540 (gapY 340 is mid-spawn-range), 87 units of
 *    clearance on both sides. A frame the game itself produces. */
import { C, HERO_POSE, drawBackground, drawBird, drawGround, drawPipe } from "../game.js";

const fitText = (ctx, text, font, targetPx, maxW) => {
  ctx.font = font(targetPx);
  const width = ctx.measureText(text).width;
  return width <= maxW ? targetPx : Math.floor(targetPx * (maxW / width));
};

const CAP = 0.72; // Fredoka cap-height ratio (baseline → cap top)

export function drawPoster(ctx, w, h) {
  const STAGE_W = 540;
  const STAGE_H = 960;
  const DPR = w / STAGE_W; // ×2 — the raster IS the stage at dpr 2
  ctx.save();
  ctx.scale(DPR, DPR);

  const groundY = STAGE_H - 80; // T.groundH — the game's ground line
  const pipeW = 52; // tuning verbatim
  const gap = 200;

  drawBackground(ctx, STAGE_W, STAGE_H, 80);

  // a real lane at true 230 spacing: the PASS gate on the bird's lane
  // (gapY 340 — mid spawn range), flankers varied and outside the
  // title's x-range (title spans 75..465)
  drawPipe(ctx, 14, 560, groundY, pipeW, gap); // left — low gate (≤ maxTop 580)
  drawPipe(ctx, 244, 340, groundY, pipeW, gap); // THE PASS — on the axis
  drawPipe(ctx, 474, 160, groundY, pipeW, gap); // right — high gate

  drawGround(ctx, STAGE_W, groundY, 80, 0);

  // the bird: AABB-centered in the pass (270 = gap's x-center, 440 =
  // gap's y-center) — the iconic mid-pass frame, r 13, game size
  drawBird(ctx, 270, 440, 13, HERO_POSE);

  // identity layer — top zone, on the flight line
  const cx = STAGE_W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";

  ctx.letterSpacing = "6px";
  const size1 = fitText(ctx, "FLAPPY", (px) => `700 ${px}px Fredoka`, 112, STAGE_W * 0.72);
  const y1 = 82 + size1 * CAP;
  ctx.font = `700 ${size1}px Fredoka`;
  ctx.lineWidth = size1 * 0.12;
  ctx.strokeStyle = C.outline;
  ctx.strokeText("FLAPPY", cx, y1);
  ctx.fillStyle = C.birdWing;
  ctx.fillText("FLAPPY", cx, y1);

  ctx.letterSpacing = "14px";
  const size2 = fitText(ctx, "CHICK", (px) => `700 ${px}px Fredoka`, 58, STAGE_W * 0.4);
  const y2 = y1 + size1 * 0.16 + size2 * CAP;
  ctx.font = `700 ${size2}px Fredoka`;
  ctx.lineWidth = size2 * 0.12;
  ctx.strokeText("CHICK", cx, y2);
  ctx.fillStyle = C.birdBody;
  ctx.fillText("CHICK", cx, y2);

  ctx.letterSpacing = "8px";
  const size3 = fitText(ctx, "TAP TO FLY", (px) => `600 ${px}px Fredoka`, 21, STAGE_W * 0.38);
  const y3 = y2 + size2 * 0.4 + size3 * CAP;
  ctx.font = `600 ${size3}px Fredoka`;
  ctx.lineWidth = size3 * 0.14;
  ctx.strokeText("TAP TO FLY", cx, y3);
  ctx.fillStyle = C.birdWing;
  ctx.fillText("TAP TO FLY", cx, y3);
  ctx.letterSpacing = "0px";

  // the declared lettering block (stage units) — the safe-zone contract
  // `frogoe bundle` verifies its clearance margin against world blobs
  ctx.__frogoeTitleBand = [75, 78, 465, Math.ceil(y3) + 4];

  ctx.restore();
}
