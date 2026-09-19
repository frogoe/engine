---
name: frogoe-core
description: >
  The frogoe technical contract — how one game is built. Use for the folder form
  (index.html / game.js / BRIEF.md / frogoe.json / .frogoe/), the defineGame closure
  and its four nouns (stage, input, loop, finish), pointer dx semantics, the
  window.__frogoe host handle, HUD block bindings, external libraries (three.js,
  gsap, fonts) and the bundler that dissolves them, plus check rules and teaching
  errors. Read before writing or editing any game code.
---

# frogoe core

A game is **one closure**. The platform hands it four nouns; everything visible is the
game's own (DOM+CSS for HUD, canvas for the world). The contract ships zero taste —
if it ever draws something, that is a defect.

```js
// game.js — the whole game
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
    ctx.fillStyle = "#8fe9ff";
    ctx.fillRect(stage.play.center - 12, y, 24, 24);
  };
});
```

## References

| File                         | Read it to…                                                        |
| ---------------------------- | ------------------------------------------------------------------ |
| `references/folder-form.md`  | lay out or extend a game folder (index.html, .frogoe/, assets/)    |
| `references/brief-format.md` | author BRIEF.md (frontmatter schema: verb, mood, palette)          |
| `references/contract.md`     | every platform guarantee and teaching error in one table           |
| `references/assets.md`       | author assets/poster.js + assets/icon.js and how they publish    |
| `references/hud-bindings.md` | place, theme, and bind registry HUD blocks to game state           |
| `references/externals.md`    | use three.js / gsap / web fonts and how the bundler dissolves them |
| `references/audio.md`        | make sound that survives phones (gesture unlock, interrupted state, no selection UI — iOS + Android) |

## Non-negotiable rules (silent bugs the eye misses)

- **Pointer dx/dy are anchor-relative** — measured since touch-down, not per event.
  Steer with `x = grabX + p.dx` or track your own `lastX`. Never `x += p.dx` inside a
  drag handler: every pointermove re-applies the cumulative offset and the actor
  rockets into a wall. This bug shipped once; `check` rejects it on sight.
- **All HUD text lives in the DOM layer**, not canvas: crisp on every DPR, themeable,
  accessible. Canvas `fillText` HUD is allowed only inside the play field (combo
  popups at world positions).
- **Gameplay coordinates use `stage.play`** (capped centered column), never raw
  `window.innerWidth` — parity between phone and desktop.
- **Stage geometry is LIVE — read it fresh, never cache it**. Desktop windows are
  free-size (the native shell opens 960×640 and resizes/maximizes freely); the iOS
  keyboard shifts the viewport mid-run. `const { width } = stage.play` freezes the
  boot-time geometry and everything derived from it goes stale after a resize
  (`stage/cached-metrics` error). Reading fresh is only half — ENTITY STATE
  anchored to absolute boot pixels goes stale the same way. Three reference
  patterns (all in the examples): a `layout()` helper called per tick;
  entities store NORMALIZED coords (`nx` in 0..1) remapped to `stage.play`
  on change (typefall's field); and when an anchor MOVES — floor, arena
  center — CARRY entities by the delta, so height-above-floor and
  position-in-arena survive (sawstorm's ground-carry; without it a grounded
  actor hovers when the window grows and buries off-canvas when it shrinks —
  gravity branches don't run while grounded). Per-frame clamps against
  fresh bounds absorb width changes. The sandbox resizes the viewport
  mid-run in BOTH directions and fails the check on stale geometry
  (`live/resize`).
- **Overlay centering is structural, never tuned** — `inset: 0; display: grid;
  place-items: center` (the registry overlay pattern). A `top: 44%` that looks
  centered on the phone it was tuned on drifts on every other geometry
  (`hud/magic-anchor` warning). The letterbox model makes it honest: window owns
  the desktop, the play column owns the gameplay, the world (bg, particles)
  extends to fill — at any size.
- **Fixed furniture respects `stage.safe`** — notches cover fixed y=34 text.
- **One page, zero runtime requests** after bundling: everything the game needs is
  inline. Author-time externals are fine; the bundler dissolves them.
- **`finish(score)` ends the run** — report once; the game-over CARD is a registry
  block you show yourself, never something the platform draws.
- **WebAudio unlocks only inside a user gesture** — `input.on("down"/"up")`
  both qualify (the contract fires them inside the native pointer events).
  Resume when state is not "running" (iOS has an extra "interrupted" state),
  play a 1-sample silent buffer to hard-unlock, and never check only
  "suspended" — that ships the "sound randomly goes quiet" bug. Full
  recipe: `references/audio.md`.

## The testable seam — game.test.js (two tiers)

The blind sandbox proves a game RUNS; only author-owned tests prove it is
RIGHT. Verb `type`/`swap`/place` and `session: round` carry real logic and
MUST ship `game.test.js` beside game.js (`test/logic-untested` gates it);
tap/hold physics toys may skip it. `frogoe check` runs the file under bun
whenever it exists — a red test is a failed check (`test/failed`).

**Tier 1 — pure functions (Arcane-style precision).** Export non-trivial
mechanics (collision, resolution, scoring math, ramps) from game.js and
test them directly — games already export sprites for identity art; the
seam exists.

**Tier 2 — whole-closure behavior.** `bootForTest` from `"frogoe"` boots
the REAL game.js headless (fake DOM, recording canvas, deterministic dt)
and returns a drive API. Closure state stays private — assert on BEHAVIOR:
`finishes()`, recorded `draws()` (positions live in the args), DOM element
bindings. The reference: `examples/typefall/game.test.js` pins this
month's two real bugs (keyboard-bounded floor, resize remap).

```js
import { test, expect } from "bun:test";
import { bootForTest } from "frogoe";

test("the field follows the keyboard's true top", async () => {
  const game = await bootForTest(new URL("./game.js", import.meta.url));
  game.element("[data-block-keyboard]").rect = { top: 400, height: 200, left: 0, width: 390 };
  game.tap();
  for (let i = 0; i < 650; i++) game.step(1 / 60);
  expect(Number(game.element("[data-block-hearts]").dataset.value ?? "3")).toBeLessThan(3);
});
```

Mechanics under the hood: `frogoe check` materializes `node_modules/frogoe`
(the test stub) plus a private `package.json` (the game becomes its own
package root — inside workspaces, bun would otherwise hoist the CLI
package over the stub) and gitignores both. The browser and bundler never
see them: the import map still resolves the pinned contract, byte-identical
artifact (enforced by test). Games with externals (three.js …) can still
test their pure Tier-1 exports — Tier 2 is for contract-pure games.

## Editing existing games

Read `BRIEF.md` first; its palette and verb are the game's identity. Keep block
`--block-*` theming on a single parent element. Never edit `.frogoe/` — it is
regenerated from `frogoe.json`.
