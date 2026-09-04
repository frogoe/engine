---
name: frogoe-creative
description: >
  Creative direction for frogoe games — visual voice, palettes, typography, game feel,
  VARIANCE/MOTION/DENSITY dials and the lazy defaults to question. Use when choosing
  or changing how a game looks or feels: HUD styling, palette declaration, named
  palettes, font pairing, juice, menus, and death screens. For the technical contract
  and block bindings, use frogoe-core.
---

# frogoe creative

How the game looks and feels. The technical contract (frogoe-core) is deliberately
blind; this skill is where taste lives.

> **Read `references/house-style.md` FIRST for any new game.** It contains the
> lazy-defaults list — the patterns every LLM reaches for first — and the
> palette/type declarations that keep a game off the generic pile. Skipping it is
> the single biggest cause of "AI game" face.

## Workflow

1. BRIEF first (frogoe-core → brief-format.md): verb, mood, palette. If no palette
   was declared, pick one from `references/palettes.md` or derive from the mood —
   then declare it in the brief. No code before the palette exists.
2. Read `references/house-style.md` (dials, lazy defaults, locks) and set
   the three dials explicitly from the mood — they gate every later choice.
3. HUD = registry blocks, themed from the brief palette in ONE parent rule
   (frogoe-core → hud-bindings.md). Do not hand-draw HUD chrome.
4. Juice and feel → `references/game-feel.md`.

## Routing

| Topic                                                   | Read                        |
| ------------------------------------------------------- | --------------------------- |
| The three dials, lazy defaults, color/materiality locks | `references/house-style.md` |
| Voice selection, banned fonts, numerals, display scale  | `references/typography.md`  |
| Named palettes (arcade-neon, cozy-pastel, crt-amber, …) | `references/palettes.md`    |
| Motion, easing, feedback, death, retry feel             | `references/game-feel.md`   |

## Boundaries

- Do not override frogoe-core technical rules.
- Do not ship a start menu, logo splash, or settings gate — feed players skip
  anything that smells like a menu. Boot into a living world with one giant verb
  affordance.
- Do not add assets, fonts, or scenes the brief does not call for; expand the brief
  first if the game genuinely needs more.
