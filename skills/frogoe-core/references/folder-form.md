# Folder form

A game is a folder. Authoring is many files; shipping is one (see bundler).

```
my-game/
  BRIEF.md      intent: title, verb, mood, palette (frontmatter — schema'd)
  index.html    entry shell: <canvas id="c"> + import map + HUD layer div
  game.js       defineGame(...) — the whole simulation
  hud/          registry blocks copied here (markup + their <style>)
  assets/       sprites, audio, fonts (referenced by relative path)
  frogoe.json   { "contract": "0.1.0" } — the ONE version source of truth
  .frogoe/      tool-owned, gitignored, never edited (contract + import map)
  dist/         bundler output (gitignored)
```

## index.html — the shell (thin, ~15 lines)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>My Game</title>
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&display=swap"
    />
  </head>
  <body>
    <canvas id="c"></canvas>
    <div class="hud"><!-- registry blocks live here, absolutely positioned --></div>
    <script type="module" src="game.js"></script>
  </body>
</html>
```

## The import map (tool-managed)

`frogoe init` writes `.frogoe/importmap.json` and the shell loads it. The single
mapping that matters: `"frogoe"` → the pinned contract inside `.frogoe/`. Games
always `import { defineGame } from "frogoe"` — never a relative path, never a CDN.

## Why contract.js lives in .frogoe/

It is a function of `frogoe.json` (regenerable, hash-checked by `frogoe check`).
Visible read-only files are a DX smell: if the tool owns it, the tool hides it.

## Minimal form

A game with no assets and no HUD may skip `assets/` and `hud/`. Never skip
`BRIEF.md`, `index.html`, `game.js`, `frogoe.json`.
