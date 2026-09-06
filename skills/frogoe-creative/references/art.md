# Identity art — poster and icon scenes

The game's face is **authored, and drawn by the game's own code**.
`assets/poster.js` and `assets/icon.js` are canvas scenes that import
the sprites and palette from `../game.js` and compose the key-art
moment — one renderer, so the art is **1:1 with the shipped game by
construction**: same colors, same sprite anatomy, same typography.
The system never draws, captures, or generates; it renders YOUR scene.

The composition rules below are the store-front standards, distilled:

- **Steam** (graphical asset rules): capsule content is "game artwork,
  the game name, and any official subtitle" — nothing else; the
  logotype must be "readable"; at small sizes "your logo should
  nearly fill".
- **Apple HIG** (app icons): "find a concept or element that captures
  the essence… express it in a simple, unique way with a minimal
  number of shapes"; icons are the game's own art, never screenshots
  of UI chrome; no text in icons.
- **Microsoft** (icon design): one metaphor, one focal point; no
  typography; silhouette legible at small sizes; ≥3:1 contrast.

---

## The 2026 antislop doctrine

The house style is antislop by birth — flat shapes, locked palettes,
hard outlines, characterful type. Named tells to refuse (Wix / Envato
2026 trend reports): generic sans wordmarks, muted greige "non-color"
palettes, soft-shadow depth (neumorphism), sterile over-digitized
minimalism, rainbow gradients, directionless "tasteful" cleanness.
Tools to reach for instead:

- **One hero hue** — a single dominant color from the game's palette
  carries the frame (teal sky, red night); instant recognition.
- **Characterful display type** — the game's own font (bitmap faces
  like Press Start 2P are explicitly on-trend), never a generic sans.
- **Hard offset shadows** for the logotype (the HUD's rule) — never
  soft glows or blurs.
- **Exaggerated hierarchy** — one oversized anchor + one tiny caption
  ("visual rhythm of extremes", Wix 2026): FLAPPY big, TAP TO FLY tiny.
- **Print tactility** — stepped color ramps, dither bands, halftone
  dots, or a whisper of CRT scanlines keep flat art tactile "rather
  than purely digital" (Envato 2026). Palette colors only: on dark art
  the raster line LIGHTENS (fg at ~6% alpha — darkening dark mud is
  invisible), on bright art it darkens (outline). Period 3 px, 1 px
  lines, drawn after the world, before the logotype.
- **Anchored chaos** — the moment may run wild; the logotype block
  stays immaculate and consistently placed.
- **Readability is GATED at render** — `frogoe bundle` measures the
  poster's title band (ink ≥3:1 vs ground, ≥0.8% coverage, ≥8px from
  edges). Outline first (the HUD's own law — white-on-teal is only
  ~2.1:1; the dark outline carries the contrast). For busy/bright
  worlds, the OPTIONAL stepped scrim (palette bg in 2–3 flat steps
  over the top ~25%, never a smooth gradient) buys the rest:

  ```js
  // stepped scrim — flat steps, palette colors only
  const steps = [[0, 0.62], [0.1, 0.34], [0.18, 0.16]]; // [until, alpha]
  for (const [until, alpha] of steps) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h * until);
  }
  ctx.globalAlpha = 1;
  ```
- **Contrast is a hard rule** — logotype ≥3:1 against whatever sits
  behind it; the mark ≥3:1 on its plate.

## Poster — key art, 1080×1920 (9:16)

`export function drawPoster(ctx, w, h)` — the rasterizer renders it on
the game's own page (import map, HUD, fonts all live), at exactly
1080×1920. The system: **the poster IS the game, captured.**

1. **A native capture frame.** The poster IS a perfect frame of the
   game: draw on the game's own stage (540×960, ×2 into the 1080×1920
   raster — exactly like dpr) and call every sprite with its LITERAL
   in-game numbers (bird r 13, pipeW 52, blades r 24, player 30×44,
   walls 10, ground 80). Zero zoom, zero resizing — the author's only
   liberty is CHOOSING THE MOMENT: where the pipes sit, where the
   blades float, which pose the hero holds. "As if you were playing
   the game and captured the perfect frame."
2. **Legality (AABB).** Every placement obeys the game's own rules:
   pipes hang ceiling→cap and rise cap→ground at the true spawn
   spacing (never floating); gate heights stay inside the spawn range;
   the hero sits where the game could sit it (flappy: centered in a
   real gap, clearance on all sides); every hazard clears the hero's
   box by an honest, visible margin — a blade that reads as touching
   is a broken frame. Verify clearances numerically before shipping.
3. **The identity layer + its SAFE ZONE.** The logotype is identity,
   not a world sprite — the one layer exempt from world scale. Draw it
   like the HUD draws (outlined, over the world), sized by
   `measureText` to a stage-space budget (≤84% of stage width for the
   title, ~50% for a second line; set `letterSpacing` BEFORE
   measuring). Two planned lines beat one overflowing line. The title
   band (top ~25% of the stage) is a SAFE ZONE — two mechanisms:
   **relocate** free-floating world (blades, clouds, ambience) out of
   the band; where the world CANNOT move out (flappy's pipes keep
   spacing 230 continuously — no frame skips one), **compose the world
   around the band**: consecutive minimum gates (gapY at the spawn
   floor) align their gaps into a continuous sky CORRIDOR the logotype
   lives inside — safe zone by composition, not by paint (flappy's
   poster). The stepped scrim is the last resort when the world is
   truly fixed (narrow arenas); flat steps only, palette color. A
   blade behind a same-color drop shadow, a ramp under an outlined
   glyph, visible scrim bands across a pipe — all read as accidents.
   Letter stack: cap-to-baseline rhythm (≈0.12em between lines) — a
   half-em gap is a paragraph break, not a title.
   THE DECLARED BAND (enforced): scenes end with
   `ctx.__frogoeTitleBand = [x0, y0, x1, y1]` — computed FROM the
   layout variables, never hand-typed (the render is the only truth; a
   hand-typed band lies to the gate). `frogoe bundle` then verifies the
   clearance margin (24 stage units under the block): a free-floating
   blob ≥12 units wide there is `bundle/art-title-collision` — relocate
   it below (block bottom + its own radius); ceiling-hung world is the
   one legal crosser. `frogoe vision` shows the verdict and nags when
   the band is undeclared.
4. **One pose, every surface.** Export the hero pose from game.js
   (`HERO_POSE`) and use it in the poster AND the icon.
5. **Density with truth.** Fill the frame with elements at game
   counts (clouds, dust), never with invented props — but a MOMENT is
   few and placed, never many: sawstorm's storm is a column of THREE
   blades (staggered, spacing ~120) plus two flankers and ONE hero
   near-miss. Ten blades reads as confetti, not threat — placement
   carries density, not count. No dead bands: probe a 6×10 grid of the
   render — every row carries content (night-on-night floors count;
   empty sky doesn't).

**Checklist**

- [ ] Drawn on the 540×960 native stage (one ×2 scale, nothing else)
- [ ] Every world number literal from game.js tuning — open it and copy
- [ ] Every placement legal (pipes grounded, gates in spawn range,
      hazards clear the hero box by an honest margin) — verified
- [ ] Logotype measured to fit its stage-space budget
- [ ] Hero pose shared with the icon via the exported constant
- [ ] No dead bands (6×10 probe) — the frame reads like a live game
- [ ] Squint test: the title is the second thing you read, after the moment

## Icon — the mark, 1024×1024 (1:1)

`export function drawIcon(ctx, size)` — the icon architecture, ONE
system for every game:

1. **The mark = the game's most recognizable sprite.** Hero character
   first (flappy's chick — character games brand on their character);
   else the signature object/hazard (sawstorm's blade — the game is
   NAMED after it). Drawn by the game's own sprite function, in the
   SAME pose/rotation the poster holds. No text, no numbers.
2. **Plate = the game's bg color, full-bleed square** — NEVER
   pre-rounded: stores and hosts apply their own rounded mask, and a
   pre-rounded plate double-rounds inside it (and ships the alpha
   corners Apple rejects). Flat, quiet — the plate is background,
   not content.
3. **Fill 55–70%** of the plate width (HIG "minimal shapes", Steam
   "logo should nearly fill") — verify by masking the render.
4. **Optically centered** — radially symmetric marks at geometric
   center; directional heroes (a beaked bird) shifted a touch against
   their direction so they read balanced.
5. **ONE accent max** — a single world-context cue in the game's own
   draw code: flappy's ground sliver, sawstorm's scanline whisper.
   One, never two — the rest of the plate stays quiet.
6. **Contrast via the sprite's own outline** (flat-art separation) —
   dark outline on bright plates, bright/outline marks on dark ones;
   ≥3:1 at the mark's edge.

Examples: `examples/{flappy,sawstorm}/assets/icon.js`.

## Character craft — the Box Chick (frogoe's mascot construction)

The reference character (examples/flappy drawBird) speaks in SQUARES —
a total geometric language, no borrowed anatomy:

- **THE body is a rounded square** (roundRect, corner ≈ 20% of side) —
  flat and confident; volume from ONE quiet belly band clipped inside,
  never from shading blocks (a big pale blob drowns the face).
- **Every part is a block**: one tail block out the back, ONE tuft
  tooth on the crown (two reads as noise), a bill of TWO stacked
  rounded blocks (mandibles) with a lip gap.
- **The wing is one rotating bar**, rounded, shoulder-pivoted — reads
  across the whole flap arc; a shade block inside gives it thickness.
- **Exactly one soft element: the round eye** — big, high, forward,
  pupil + glint. One circle against the grid IS the cute; a square eye
  reads robot, more circles read mush.
- **Bill on the face-line, drawn OVER the body outline** — its base
  block sits plainly on the face; the seam is part of the language.
- **Optical outline** — pixel-true at game sizes (2px at r 13),
  logo-weight when rendered big; linear scaling paints 48px blobs.

Design with eyes: render, downsample to ASCII, and LOOK at the grid —
the map shows what metrics hide (a highlight blob, a floating part, a
bill at the eye's height). Iterate on what you SEE.

## Craft notes (the difference between authored and slop)

- **Silhouette first.** Squint until colors die: does the focal point
  still read? If it melts into the ground, rebuild the shape.
- **One light logic.** Pick where light comes from; every step obeys.
- **Palette steps, not gradients.** Depth = a mid step between bg and
  the object's fill (ratio constant across the piece).
- **Negative space is composition.** Leave one clean region.
- **Lettering is a shape.** Plan the two-line break yourself.

## Design with vision — the eyes protocol

`frogoe vision [dir]` is the workbench that closed the loop this
doctrine was built on: agents that draw blind ship blobs; agents that
LOOK iterate to craft. Three windows: OBJECTS (every SPRITES entry,
isolated, mapped large — 4px per glyph, curves and part-relations
readable), GAMEPLAY (the live world canvas at ready + action), IDENTITY
(poster + icon with the tier-2 verdicts). `--pretty` renders truecolor
half-blocks for human eyes — the ~99% thumbnail.

**The SPRITES registry** (game.js): one entry per drawable —

```js
export const SPRITES = {
  chick: { w: 200, h: 200, draw: (ctx) => drawBird(ctx, 90, 105, 80, HERO_POSE) },
  pipe:  { w: 130, h: 330, draw: (ctx) => drawPipe(ctx, 34, 100, 326, 52, 200) },
};
```

**The protocol:** write → `frogoe vision` → READ the map → fix →
repeat (seconds per loop; the heavy check→bundle gates come last).

**Reading the map — the failure dictionary (every pattern below was a
real bug the metrics called green):**

| You see | It means | Fix |
| --- | --- | --- |
| A pale blob where a face should be | shading block bigger than its feature | shrink/delete the block; two quiet shapes max |
| A part floating off its anchor | coordinates from different drafts | re-anchor to the construction (bill at the head line) |
| Two clusters side by side at the same height | eye and bill colliding | raise the eye; bill at the equator, ~0.2r of face between |
| Long runs of pure bg mid-frame | dead band — the "cheap poster" | fill with game-count ambience or compose a moment column |
| One glyph-scale smudge in a frame corner | clutter outside the safe zone | relocate free elements below the title band |
| Letters rendered as speckle, not strokes | lettering too small for its stage | measure-fit to the stage-space budget |
| Many same-shape blobs scattered evenly | confetti — count doing placement's job | cut to a column of three + flankers + ONE hero near-miss |

**Reading ramp maps:** palette glyphs are exact (bg '.' fg 'O' accent
'X' outline '#'); everything else rides @%&*8=+~;:,-^\`' (dark→light).
Night worlds read sparse BY NATURE (near-bg ambience maps as ground) —
judge density against the game's mood, not a universal number; the
bundle gate only catches catastrophe (>70% dead).

**Legends:** `bundle/art-dead-bands` and `bundle/art-icon-fill`
(warnings) are the catastrophe floors; taste-level density lives HERE,
in the vision loop, not in the gate.
