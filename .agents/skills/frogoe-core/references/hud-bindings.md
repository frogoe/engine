# HUD bindings — placing, theming, and driving registry blocks

> Owner: `frogoe-registry` is the source of truth for finding, evaluating, installing, and authoring blocks. This file covers placement, theming, and binding **after** a block has been copied into `blocks/`.

## Placement

The shell has one HUD layer; blocks are absolutely positioned inside it and offset
through safe-area-aware insets:

```css
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.hud > * {
  position: absolute;
}
.hud [data-pos="top-left"] {
  top: calc(env(safe-area-inset-top) + 12px);
  left: calc(env(safe-area-inset-left) + 12px);
}
.hud [data-pos="top-center"] {
  top: calc(env(safe-area-inset-top) + 12px);
  left: 50%;
  translate: -50% 0;
}
.hud [data-pos="top-right"] {
  top: calc(env(safe-area-inset-top) + 12px);
  right: calc(env(safe-area-inset-right) + 12px);
}
.hud [data-pos="bottom-left"] {
  bottom: calc(env(safe-area-inset-bottom) + 12px);
  left: calc(env(safe-area-inset-left) + 12px);
}
.hud [data-pos="bottom-center"] {
  bottom: calc(env(safe-area-inset-bottom) + 12px);
  left: 50%;
  translate: -50% 0;
}
```

## Theming — one parent, three variables

Blocks read `--block-*` custom properties with sane defaults. Theme ALL of them from
the BRIEF palette in one place:

```css
.hud {
  --block-accent: #ff7a3d; /* BRIEF palette.accent */
  --block-fg: #ffe9d4; /* BRIEF palette.fg */
  --block-outline: #241005; /* a very dark tint of bg — sticker depth */
}
```

Blocks that need more (fonts, danger color) document their extra variables inline.

## Binding — vanilla, one line per state change

| Block          | Drive it with                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------- |
| score-card     | `scoreEl.textContent = n; scoreEl.setAttribute("data-bump","")` (restart the pop by reflow)    |
| hearts-row     | set `data-value`; toggle each heart's `aria-hidden` (six-line binder — see the demo)           |
| fuel-gauge     | `fill.style.setProperty("--block-fill", pct+"%")`, `gauge.toggleAttribute("data-low", pct < 25)` |
| game-over-card | fill final/best, toggle `data-open` / `data-new-best`, wire `[data-block-retry]`                 |

No binding helper ships on purpose: querySelector + dataset is the whole API —
transparent to read, impossible to version-skip.

## Rules

- Blocks are copied into `blocks/`, never linked cross-origin — the bundled game must
  be one file with zero runtime requests.
- Canvas HUD text is for world-anchored popups only (combo at the actor's position).
- Reduced-motion is the blocks' job (they all ship `prefers-reduced-motion` rules) —
  do not remove those rules when theming.
