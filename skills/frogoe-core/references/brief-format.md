# BRIEF.md format

Frontmatter is normative (machine-validated by `frogoe check`); prose below it is
context. Written BEFORE code — it's the game's identity card and the gate's
measuring stick.

```markdown
---
title: Ember Climb
verb: hold # tap | hold | steer | aim | swap | place | type | draw | idle
session: blitz # blitz (default) | round | toy — how the run ends
mood: urgent warmth — volcano at dusk
palette:
  bg: "#1a0f0d"
  fg: "#ffe9d4"
  accent: "#ff7a3d"
fonts: Fredoka # display voice; fallback is the system stack
---

Player holds to charge, releases to leap up crumbling rock as lava rises.
Combo heat when landing streaks. One life, best score is the loop.
```

## Field rules

- `title` — required, 2–40 chars.
- `verb` — required, enum `tap|hold|steer|aim|swap|place|type|draw|idle`. ONE
  word, the core action. If you cannot pick one, the design is input soup; fix
  the design, not the enum. Non-arcade pairs live in `genres.md`.
- `session` — optional, enum `blitz|round|toy` (absent = `blitz`). blitz is the
  short arcade loop; round is turn-based (the gate waits an 8s grace and never
  warns); toy never ends (no game-over-card or retry requirements).
- `mood` — required, free text, one phrase. Drives palette and sound choices.
- `palette` — required: `bg`, `fg`, `accent` hex; optional `outline` (the HUD
  readability partner — when present, contrast is measured fg-vs-outline
  instead of fg-vs-bg). The HUD layer inherits these via `--block-*` custom
  properties.
- `fonts` — optional display font name; the bundler inlines it at build.

## What the gate does with it

- verb vs code: the declared verb REQUIRES its input wiring — missing handlers
  are an `input/verb-mismatch` error. The enforced table:

  | verb | requires in game.js |
  | ---- | -------------------- |
  | `tap` `swap` `place` `type` `idle` | `input.on("down"` |
  | `hold` | `input.on("down"` + `input.on("up"` |
  | `steer` `aim` | `input.on("down"` + `input.on("drag"` |
  | `draw` | `input.on("down"` + `input.on("drag"` + `input.on("up"` |

  (`type` demands no keyboard — mobile word games draw their own keys; the
  sandbox ladder still sends real keyboard text to exercise the desktop path.)
- session vs sandbox: the live pass scripts its input ladder per verb and
  shapes its end-of-run policy per session — see frogoe-cli →
  `references/live-sandbox.md`.
- palette vs output: rendered HUD contrast measured against declared fg/bg → finding.
- Missing brief on a feed game → hard reject.
