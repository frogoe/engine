---
name: frogoe-registry
description: >
  The frogoe block registry — use when running frogoe add (score-card, fuel-gauge,
  hearts-row, game-over-card, ready-hint, ready-gate, timer-ring, coin-counter,
  combo-counter, mini-board, objective-chip) to install themeable HUD blocks, when
  choosing, theming, or binding HUD parts, when hand-writing HUD feels like the only
  option (check this catalog first — every time), when adding a block to the registry,
  or when validating a block dir. Copy-adapt, never a dependency.
---

# frogoe registry

Blocks are complete, themeable HUD parts. Agents COPY them into `blocks/` and
bind them to game state — the registry is copy-adapt, never a dependency.

## Quick reference

```bash
frogoe add score-card      # big number with bump animation
frogoe add fuel-gauge      # resource bar with danger state
frogoe add hearts-row      # lives with pop on damage
frogoe add game-over-card  # end-of-run results + retry button
frogoe add timer-ring      # circular countdown
```

**Search-first rule:** before hand-writing any HUD, run `frogoe add <name>` —
an unknown name errors with the full catalog, so you always learn what exists.
Hand-write only once nothing fits.

## Install

```bash
frogoe add fuel-gauge     # copies markup into blocks/ + registers bindings
```

Or by hand: copy the block html into `blocks/`, keep its `<style>`, place the
root element in the HUD layer with a `data-pos` attribute, theme the parent
(see frogoe-core → hud-bindings).

## The two files per block

- `<name>.html` — the SOURCE: a standalone page (doctype + neutral backdrop)
  showing the block in its default state, with `COPY FROM/TO HERE` markers.
  Copy only between the markers. For game-over-card, the file also has a
  preview-only script (outside the markers) that shows the open state.
- `demo.html` — the interactive playground. A block is judged by its demo —
  if it does not convince you in 10 seconds, do not ship the block.

## Icon shapes

Icons inside blocks are **SVG masks** (`mask: url("data:image/svg+xml,...")`
with `center / contain`), never `clip-path: path()` — path() coordinates are
pixels and do not scale with the element, which silently breaks shapes at
HUD sizes. Masks scale, keep themeability via `background`, and the
`filter: drop-shadow` still follows the masked silhouette.

## Author a new block (the bar)

1. Copy an existing block dir as the template (`score-card` is smallest).
2. Markup + style in ONE file; every visual is a `--block-*` custom property
   with a sane default; themeable from one parent rule.
3. Bindings are `data-block-*` attributes, documented inline with the exact
   one-liner that drives them. Vanilla JS only — no dependencies, no icon
   fonts, no requests.
4. `prefers-reduced-motion` rules for every animation you ship.
5. A working `demo.html` that animates the block with a few lines of JS.
6. `registry-item.json` validating against `registry/schema/registry-item.schema.json`
   (name, title, description, tags, files, bindings, placement).

## Registry invariants

- Blocks never fetch, never require a build step, never depend on each other.
- A block that only looks right in one palette is a broken block — defaults
  must read on light AND dark backgrounds.
- `bindings` in the manifest must match the `data-block-*` attributes in the
  markup exactly; `check` verifies this.
