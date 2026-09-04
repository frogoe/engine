# House style — when no design direction exists

Starting points, override anything that does not serve THIS game. When
BRIEF.md exists, its palette and mood win; house style fills the gaps.

## Before writing code

1. **Interpret the brief.** A lava game has real embers; a fishing game has
   real water. Generate content, not placeholders.
2. **Declare the palette** (bg / fg / accent) in BRIEF.md before any pixel.
3. **Read the dials, set them from the mood, and let them gate every
   decision below.**

## The three dials (set explicitly from the brief, never silently)

```
VARIANCE 1–10   1 = strict symmetric grid · 10 = asymmetric chaos
MOTION   1–10   1 = board-game still · 10 = everything breathes
DENSITY  1–10   1 = three elements, huge air · 10 = cockpit telemetry
```

| Brief says                    | VARIANCE | MOTION | DENSITY |
| ----------------------------- | -------- | ------ | ------- |
| zen puzzle, word game         | 3–4      | 2–3    | 2–3     |
| cozy casual, bakery, garden   | 5–6      | 4–5    | 3–4     |
| arcade, platformer, runner    | 6–8      | 7–9    | 4–5     |
| cockpit, radar, tactics       | 4–5      | 3–4    | 7–9     |
| party, chaos, 4-player energy | 8–10     | 8–10   | 6–7     |

DENSITY gates HUD type: **8+ = tabular/mono numerals, 1px separators, no
card chrome** — data breathes in plain layout. DENSITY ≤ 3 = one number,
centered, enormous.

## Lazy defaults to question (AI game tells)

Pause before each: deliberate choice for THIS game, or a default?

- White text on dark, always centered
- `system-ui` as the identity voice everywhere
- `#00e5ff` cyan + purple gradients (the AI-purple family)
- Pure `#000000` / `#ffffff` — pure values kill depth; tint toward the accent
- The same HUD layout every game (score center-top, all in a column)
- Emoji as icons or actors
- Linear motion everywhere; instant state changes with no interpolation
- Plain-text-on-dim-rectangle game-over screens
- Fake-perfect numbers: round-number leaderboards, `99.99%`, `1234567` —
  seed data should be organic (`47.2%`, `1,283`)
- Decorative `LEVEL 1/10` splash labels — if the player can count, they do
  not need the label
- Version/beta footers, "EARLY ACCESS" stamps, meta-labels ("STAGE 01")
- Em-dash (`—`) as a design element — the signature LLM crutch; use a
  hyphen or restructure

Intentionality, not avoidance: cyan on an arcade cabinet is a choice;
cyan because the hand reached for it is the tell.

## Typography

- ONE display voice. Pick per mood — chunky for comedy, mono/arcade for
  cabinets and cockpits, a quiet system stack beats a wrong display font.
- **Weight and color build hierarchy, not raw scale** — a score that just
  screams bigger is lazy; weight + accent + placement wins.
- Numbers: **tabular figures** everywhere state is displayed; mono at
  DENSITY 7+.
- Emphasis inside a display line: same family, bold or italic — never inject
  a second family mid-line.
- Big combo moments may go viewport-large (`clamp(3rem, 14vmin, 6rem)`) —
  for ONE beat, then settle. Permanent oversized type is a layout bug.

## Color

- Max ONE accent. It marks what matters (danger, pickup, the CTA) and locks
  for the whole game — a rose-accented game does not grow a teal badge in
  the results screen.
- One palette per game; no warm-gray/cool-gray mixing.
- Tint neutrals toward the accent; tint shadows toward the background hue —
  no pure-black drop shadows on light backgrounds.
- Pure values banned (`#000`, `#fff`) — off-black, off-white, tinted.
- Theme lock: the game is one theme. Light section inside a dark game is a
  different website. Section-level tints within the family are fine.
- Palette rotation across games: do not ship the same family twice in a row
  in a feed.

## Materiality & shape

- Cards/panels only when elevation communicates real hierarchy (the
  game-over card). Otherwise group with spacing and 1px rules.
- **Shape consistency lock**: ONE radius system per game — all-sharp
  (tactical), all-soft (cozy), or all-pill (party). Round buttons in a
  square game is broken design; document the rule and follow it.
- Sticker depth (HUD text/badges): hard offset shadow, no blur — tinted to
  the background hue, not pure black.
- Diegetic beats skeuomorphic decoration: crosshair reticles, scanlines,
  phosphor glow are FUNCTIONAL in a cockpit game (they are the fiction);
  they are tells on a cozy puzzle.

## Motion

- **Motivated or deleted.** Every animation answers "what does this
  communicate?" — hierarchy, feedback, state. "It looked cool" is not an
  answer.
- Nothing linear. Arrivals ease-out; the house curve is
  `cubic-bezier(0.16, 1, 0.3, 1)`; overshoot springs reserved for moments
  that matter (score bump, catch).
- Animate `transform` and `opacity` only — never top/left/width/height;
  canvas games keep 60 Hz by moving sprites, not re-styling DOM.
- Ambient loops (drift, bob, pulse) at MOTION 5+: the ready world breathes.
  Not every element loops — informational stays still. Max ONE perpetual
  marquee-style loop per screen.
- `prefers-reduced-motion` is non-negotiable for anything above MOTION 3:
  loops collapse to static, feedback stays (color/state), transitions go
  instant. Registry blocks ship their own rules — never strip them while
  theming.

## Interactive states — full cycles, not just success

- Ready state is designed, not empty (living world + verb affordance).
- Buttons: hover shift AND an active push (`translateY(1–4px)` + shadow
  collapse) — tactile, every time. Contrast checked (WCAG AA; 4.5:1 body,
  3:1 large) — invisible button text is an automatic fail.
- Death/loading/error are composed states, never a black rectangle.

## The carve-outs (game-specific, licensed here)

- Health/fuel/XP bars with tracks are REAL state, not the banned
  decorative comparison bar — the ban covers marketing bars, not gauges.
- Status dots, reticles, ammo counters, cursors hidden for canvas play:
  semantic/diegetic, allowed. Decoration versions stay banned.
