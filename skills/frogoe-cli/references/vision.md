# Vision — the agent's eyes

`frogoe vision [dir]` renders what you drew and prints it as ASCII you
can READ, in seconds, without the check→bundle cycle. `--pretty` for
truecolor half-blocks (human eyes).

```
frogoe vision examples/flappy
├─ OBJECTS    every SPRITES entry, isolated on the palette ground,
│             mapped large (48 cols — 4px/glyph: curves, bill-eye
│             relationships, part anchors all visible)
├─ GAMEPLAY   full-page frames (canvas + DOM HUD — the HUD is half
│             the composition): ready + action (a real tap at the
│             play center), 96 cols + coverage/dead-row metrics
└─ IDENTITY   poster + icon scenes with the tier-2 verdicts
              (title readability, fullbleed) and density metrics
```

Palette-aware glyphs: bg '.' · fg 'O' · accent 'X' · outline '#' ·
everything else rides the 16-step ramp `@%&*8=+~;:,-^\`'` (dark→light).

**SPRITES registry** (game.js) — one entry per drawable; w/h frame the
preview box; the draw call uses real sprite parameters:

```js
export const SPRITES = {
  blade: { w: 200, h: 200, draw: (ctx) => drawSaw(ctx, { x: 100, y: 100, r: 80, rot: 0.3 }) },
};
```

The poster verdict includes the safe-zone check: declare the block in
the scene (`ctx.__frogoeTitleBand = [x0, y0, x1, y1]` from the layout
variables) and vision reports `zone ✓/✗ TABRAKAN` (undeclared bands
get a nag line).

The failure dictionary for reading maps lives in
frogoe-creative → `references/art.md` ("Design with vision"). Vision
never gates anything — it is the workbench; the bundle-time
catastrophe floors (`bundle/art-dead-bands`, `bundle/art-icon-fill`)
are warnings that point back here.
