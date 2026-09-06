# frogoe

**Write a closure. Ship a game.** A tiny game framework built for agents — one
`defineGame` closure with four nouns, and a CLI that scaffolds, serves, gates,
and bundles feed-ready games as single self-contained HTML files.

## Install

```bash
npx frogoe init my-game
cd my-game
```

Or install globally:

```bash
npm install -g frogoe
```

## The 60-second loop

```bash
frogoe init my-game      # runnable folder: stub game, BRIEF, identity-art
                         # scenes, SPRITES registry, pinned contract
cd my-game
frogoe run               # live reload + phone QR (try --tunnel: works on any network)
frogoe add score-card    # themeable HUD block, injected + idempotent
frogoe lint              # fast static contract lint (stable finding codes, --json)
frogoe check             # full gate: lint + headless Chrome — full lifecycle, fps,
                         # audio recovery, 4x phone-class throttle, screenshots
frogoe report            # last playtest: fps dips, errors, wall-clock
frogoe vision            # EYES for draw code: your sprites, gameplay frames,
                         # and identity art as ASCII maps you can READ (--pretty: color)
frogoe bundle            # ONE self-contained HTML — externals dissolved, zero
                         # runtime requests + identity art rendered to dist/assets/
                         # behind gates (only after check passes)
frogoe embed             # the card: poster loading state → sandboxed game,
                         # dist/manifest.json (palette, fonts, sha256 integrity)
frogoe skills check      # skill freshness (hash = per-bundle SHA16)
```

## Built for agents

The real docs are [agent skills](https://github.com/frogoe/engine/tree/main/skills) —
the contract, creative direction, CLI loop, and HUD registry, written for the
AI that writes the game:

```bash
npx skills add frogoe/engine
```

Playtests under `frogoe run` are telemetered: fps dips, page errors and
lock-screens print live in your terminal and persist to
`.frogoe/sessions/*.jsonl`. `frogoe report` replays the last session — dips
below 30fps with their wall-clock moments.

## The contract

A game is one closure. The platform gives four nouns — everything visible is
yours:

```js
import { defineGame } from "frogoe";

defineGame(({ stage, input, loop, finish }) => {
  let y = stage.height / 2;
  let vy = 0;

  input.on("down", () => {
    vy = -300;
  });

  loop.update = (dt) => {
    vy += 900 * dt;
    y += vy * dt;
  };
  loop.render = (ctx) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(stage.play.center - 12, y, 24, 24);
  };
});
```

The platform draws nothing — zero taste by construction. Games run from a
single pinned runtime (`frogoe.json` → `.frogoe/contract.js`), so every game
is an immutable artifact of exactly the contract it was built on.

## The game's face is authored, never captured

Every game ships `assets/poster.js` + `assets/icon.js` — canvas scenes that
import the game's **own sprite functions**, so key art is 1:1 with gameplay
by construction. `frogoe bundle` renders them at store sizes (1080×1920
poster, 1024 icon) behind **rendered gates**: title readability, safe-zone
collisions, full-bleed icons. `frogoe vision` maps them (and your gameplay
frames) to ASCII you can read — agents that draw blind ship blobs. And
`frogoe embed` wraps it all: a sandboxed card (`allow-scripts` only, opaque
origin) with the poster as loading state and `dist/manifest.json` for feeds.

## License

Apache-2.0
