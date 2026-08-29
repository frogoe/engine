/** Scaffold templates — every file `frogoe init` writes, in one place.
 *  Zero taste in the shell; the stub game is explicitly marked replaceable. */

export const CONTRACT_VERSION = "0.1.0";

export const contractHeader = (version: string): string =>
  [
    `// frogoe contract v${version} (materialized by frogoe init — do not edit)`,
    "// frogoe check verifies this marker against frogoe.json; upgrade with: frogoe init --force",
    "",
  ].join("\n");

export const briefTemplate = `---
title: My Game
verb: tap        # tap | hold | steer | aim — ONE word, the core action
mood: TODO — one phrase: "dawn uplift", "arcade cabinet at midnight"...
palette:
  bg: "#101418"  # TODO
  fg: "#fffdf7"  # TODO
  accent: "#ffd166" # TODO
fonts:            # optional display voice; omit for a quiet system stack
---

TODO — two lines: what the player does, and what ends the run.
`;

export const frogoeJsonTemplate = (version: string): string =>
  `${JSON.stringify({ contract: version }, null, 2)}\n`;

export const indexTemplate = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>My Game</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; touch-action: none;
      background: var(--game-bg, #101418); }
    #c { display: block; width: 100vw; height: 100vh; }

    /* HUD layer + safe-area-aware placement (frogoe-core → hud-bindings) */
    .hud { position: absolute; inset: 0; pointer-events: none; }
    .hud > * { position: absolute; }
    .hud [data-pos="top-left"]      { top: calc(env(safe-area-inset-top) + 12px); left: calc(env(safe-area-inset-left) + 12px); }
    .hud [data-pos="top-center"]    { top: calc(env(safe-area-inset-top) + 12px); left: 50%; translate: -50% 0; }
    .hud [data-pos="top-right"]     { top: calc(env(safe-area-inset-top) + 12px); right: calc(env(safe-area-inset-right) + 12px); }
    .hud [data-pos="bottom-left"]   { bottom: calc(env(safe-area-inset-bottom) + 12px); left: calc(env(safe-area-inset-left) + 12px); }
    .hud [data-pos="bottom-center"] { bottom: calc(env(safe-area-inset-bottom) + 12px); left: 50%; translate: -50% 0; }

    /* theme every block from the BRIEF palette — one parent rule */
    .hud {
      --hud-accent: #ffd166;
      --hud-fg: #fffdf7;
      --hud-outline: #0a0e18;
    }
  </style>
  <script type="importmap">
  {
    "imports": {
      "frogoe": "./.frogoe/contract.js"
    }
  }
  </script>
</head>
<body>
  <canvas id="c"></canvas>
  <div class="hud">
    <!-- registry blocks land here (frogoe add hud-score-card) -->
  </div>
  <script type="module" src="game.js"></script>
</body>
</html>
`;

export const gameTemplate = `/** My Game — the whole simulation in one closure. Replace everything
 *  below with your game; the four nouns are the entire platform. */
import { defineGame } from "frogoe";

defineGame(({ stage, input, loop, finish }) => {
  let t = 0;
  let x = stage.play.center;

  input.on("down", () => {
    finish(0); // stub: replace with your real run end
  });

  loop.update = (dt) => {
    t += dt;
    x = stage.play.center + Math.sin(t * 2) * (stage.play.width * 0.3);
  };

  loop.render = (ctx) => {
    ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.fillStyle = "#fffdf7";
    ctx.beginPath();
    ctx.arc(x, stage.height / 2, 14 + Math.sin(t * 3) * 3, 0, 7);
    ctx.fill();
  };
});
`;

export const gitignoreTemplate = `.frogoe/
dist/
snapshots/
node_modules/
`;
