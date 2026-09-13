/* Typefall poster — authored scene, 1:1 with gameplay: the same space,
 * the same aliens, the same ship (drawn by game.js exports). */
import { C, drawAlienGlyph, drawShipGlyph } from "../game.js";

export function drawPoster(ctx, w, h) {
  const t = 300;

  /* sky — exact BRIEF bg with inset nebulas (they fade to nothing before
   * the frame edges: edge-tinted pixels poison the title zone poll) */
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  const nebC = ctx.createRadialGradient(w * 0.24, h * 0.22, 0, w * 0.24, h * 0.22, w * 0.3);
  nebC.addColorStop(0, C.nebulaCyan);
  nebC.addColorStop(1, "rgba(31,182,201,0)");
  ctx.fillStyle = nebC;
  ctx.fillRect(0, 0, w, h);
  const nebI = ctx.createRadialGradient(w * 0.76, h * 0.72, 0, w * 0.76, h * 0.72, w * 0.32);
  nebI.addColorStop(0, C.nebulaIris);
  nebI.addColorStop(1, "rgba(123,77,219,0)");
  ctx.fillStyle = nebI;
  ctx.fillRect(0, 0, w, h);

  /* stars — deterministic sprinkle, same three tones */
  const star = (x, y, r, a, color) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let i = 0; i < 90; i++) {
    const fx = (Math.sin(1 + i * 12.9) * 10000) % 1;
    const fy = (Math.sin(1 + i * 4.1) * 10000) % 1;
    const x = Math.abs(fx) * w;
    const y = Math.abs(fy) * h;
    const layer = i % 3;
    const r = [1.6, 2.4, 3.4][layer] * (w / 1080);
    star(x, y, r, [0.35, 0.6, 0.9][layer], [C.starFar, C.starMid, "#ffffff"][layer]);
  }
  ctx.globalAlpha = 1;

  /* word chips with aliens — the game's core image, larger than life */
  const chip = (cx, cy, word, typed, hot, scale = 1) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(w * 0.028 * scale)}px "IBM Plex Mono", ui-monospace, monospace`;
    const chars = word.toUpperCase().split("");
    const cw = ctx.measureText("M").width;
    const gap = w * 0.006 * scale;
    const boxW = ((chars.length - 1) * (cw + gap)) + w * 0.09 * scale;
    const boxH = w * 0.075 * scale;
    ctx.fillStyle = C.chip;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy, boxW, boxH, boxH / 2);
    ctx.fill();
    ctx.lineWidth = hot ? w * 0.006 : 1.5;
    ctx.strokeStyle = hot ? C.flare : "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy, boxW, boxH, boxH / 2);
    ctx.stroke();
    const startX = cx - ((chars.length - 1) * (cw + gap)) / 2;
    chars.forEach((chr, i) => {
      ctx.fillStyle = i < typed ? C.flare : C.fg;
      ctx.fillText(chr, startX + i * (cw + gap), cy + boxH / 2 + 1);
    });
  };

  /* word rain — the game's image: faint chips drifting down the field */
  ctx.globalAlpha = 0.5;
  const rain = [
    { x: 0.16, y: 0.24, word: "void", s: 0.7 },
    { x: 0.78, y: 0.2, word: "pulse", s: 0.62 },
    { x: 0.3, y: 0.56, word: "comet", s: 0.55 },
    { x: 0.72, y: 0.6, word: "quasar", s: 0.6 },
    { x: 0.2, y: 0.76, word: "aurora", s: 0.66 },
    { x: 0.82, y: 0.78, word: "zenith", s: 0.58 },
  ];
  for (const r of rain) chip(w * r.x, h * r.y, r.word, 0, false, r.s);
  ctx.globalAlpha = 1;

  const aw = w * 0.17;
  const ah = aw * 0.96;
  // hero alien — locked target, mid-burst
  drawAlienGlyph(ctx, w * 0.5, h * 0.44, aw, ah, 0, t);
  chip(w * 0.5, h * 0.44 + ah * 0.62, "galaxy", 3, true, 1);
  // supporting aliens
  drawAlienGlyph(ctx, w * 0.19, h * 0.33, aw * 0.78, ah * 0.78, 1, t + 900);
  chip(w * 0.19, h * 0.33 + ah * 0.56, "comet", 0, false, 0.78);
  drawAlienGlyph(ctx, w * 0.83, h * 0.36, aw * 0.78, ah * 0.78, 0, t + 300);
  chip(w * 0.83, h * 0.36 + ah * 0.56, "meteor", 0, false, 0.78);

  /* burst ring on the hero kill */
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = w * 0.012;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.5 + ah * 0.6, w * 0.14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  /* ship firing at the hero */
  const shipY = h * 0.82;
  drawShipGlyph(ctx, w * 0.5, shipY, w * 0.19, w * 0.175, t);
  const laser = ctx.createLinearGradient(w * 0.5, shipY, w * 0.5, h * 0.56);
  laser.addColorStop(0, C.flare);
  laser.addColorStop(1, "rgba(255,106,61,0)");
  ctx.strokeStyle = laser;
  ctx.lineWidth = w * 0.02;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, shipY - w * 0.02);
  ctx.lineTo(w * 0.5, h * 0.56);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = w * 0.006;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, shipY - w * 0.02);
  ctx.lineTo(w * 0.5, h * 0.56);
  ctx.stroke();

  /* title — chunky lettering with sticker depth, measured to fit the band */
  const titleY = h * 0.135;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let fs = w * 0.14;
  ctx.font = `700 ${Math.round(fs)}px "Baloo 2", system-ui, sans-serif`;
  while (ctx.measureText("TYPEFALL").width > w * 0.86 && fs > w * 0.06) {
    fs -= w * 0.004;
    ctx.font = `700 ${Math.round(fs)}px "Baloo 2", system-ui, sans-serif`;
  }
  ctx.fillStyle = C.bgDeep;
  ctx.fillText("TYPEFALL", w * 0.501, titleY + w * 0.009);
  ctx.fillStyle = C.fg;
  ctx.fillText("TYPEFALL", w * 0.5, titleY);

  /* tagline */
  ctx.font = `600 ${Math.round(w * 0.036)}px "Baloo 2", system-ui, sans-serif`;
  ctx.fillStyle = C.accent;
  ctx.fillText("type the word · save the line", w * 0.5, titleY + w * 0.075);

  /* declare the lettering band for the bundler's collision check */
  ctx.__frogoeTitleBand = [w * 0.05, titleY - fs, w * 0.95, titleY + w * 0.09];
}
