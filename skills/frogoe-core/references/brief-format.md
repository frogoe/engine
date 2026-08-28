# BRIEF.md format

Frontmatter is normative (machine-validated by `frogoe check`); prose below it is
context. Written BEFORE code — it is the game's identity card and the gate's
measuring stick.

```markdown
---
title: Ember Climb
verb: hold # tap | hold | steer | aim  — ONE word, the core action
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
- `verb` — required, enum `tap|hold|steer|aim`. If you cannot pick one, the design
  is input soup; fix the design, not the enum.
- `mood` — required, free text, one phrase. Drives palette and sound choices.
- `palette` — required: `bg`, `fg`, `accent` hex. The HUD layer inherits these via
  `--hud-*` custom properties; contrast is measured against them.
- `fonts` — optional display font name; the bundler inlines it at build.

## What the gate does with it

- verb vs code: declared `tap` but only drag handlers wired → finding.
- palette vs output: rendered HUD contrast measured against declared fg/bg → finding.
- Missing brief on a feed game → hard reject.
