# Assets — the authored identity art

A game folder carries its own face. Two authored canvas scenes live
beside the code:

```
<game>/
  index.html
  game.js            exports the palette + sprite functions
  BRIEF.md
  frogoe.json
  assets/
    poster.js        export function drawPoster(ctx, w, h)   — 9:16 key art
    icon.js          export function drawIcon(ctx, size)     — square mark
```

Both are **required** (`art/missing` is an error — a game without a
face is not shippable). Both are **authored** and **1:1 by
construction**: they import the sprites/palette from `../game.js` and
render with the game's own code (see frogoe-creative → `art.md` for
composition). Static rules live in `packages/lint` (`art/*`):

| Code | Rule |
| ---- | ---- |
| `art/missing` | either scene file absent |
| `art/scene-export` | scene does not export `drawPoster` / `drawIcon` |
| `art/scene-source` | scene does not import from `../game.js` |
| `art/color-drift` | a hex literal the game never draws |
| `art/text-font` | canvas font is not the BRIEF font, or the font isn't linked in index.html |
| `art/empty` | the scene barely draws anything |

## Pipeline (check → bundle → embed)

1. **`frogoe check`** validates both scenes statically (fast, no browser).
2. **`frogoe bundle`** rasterizes on the game's own page: the dev
   server serves index.html (import map, HUD, font link — everything
   `game.js` expects), the rasterizer waits for the contract to boot
   (`window.__frogoe`), dynamically imports the scene, draws onto an
   injected canvas, and element-screenshots it:
   - `assets/poster.js` → `dist/assets/poster.png` — 1080×1920
   - `assets/icon.js` → `dist/assets/icon.png` — 1024×1024
3. **`frogoe embed`** composes `dist/embed.html` (the card: poster as
   the loading state, fading when the game reports running; icon as
   favicon) and `dist/manifest.json`.

The scenes never ship as files — `dist/` is the liftable artifact set.
Because scenes run on the real game page, lettering uses the real
webfont (awaited via `document.fonts`), and sprite imports resolve the
same way they do in gameplay.
