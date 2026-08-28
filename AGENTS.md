# frogoe engine

Open-source game framework built for agents: write a closure, ship a game.

## The one rule

The platform (`packages/contract`) has **zero visual opinion**. If a change makes
it draw, style, or sound like anything, that change is wrong — move it to the
registry (a themeable block) or to skills (knowledge). This rule is load-bearing.

## Skills

Read `skills/frogoe/SKILL.md` before authoring or editing any game — it routes to
`frogoe-core` (technical contract) and `frogoe-creative` (house style). The skills
are the quality engine; the code is deliberately small.

## Build & verify (the full gauntlet — all must be green)

```bash
bun install
bun run format:check    # oxfmt
bun run lint            # oxlint
bun run check-types     # tsc --noEmit (strict)
bun test                # contract behavioral tests
bun run knip            # dead code / unused exports
```

Commits are conventional (commitlint via lefthook): `feat:`, `fix:`, `docs:`,
`refactor:`, `test:`, `chore:`. CI runs the same gauntlet on every push.

Registry entries validate against `registry/schema/*.schema.json` — every block
dir carries `registry-item.json` + markup + `demo.html` (a demo is how a block is
judged; ship one or the block is not done).

## Conventions

- `packages/*` — code, tested, versioned through the workspace
- `skills/*` — knowledge: SKILL.md + `references/`, routed narrowly, never "read everything"
- `registry/blocks/*` — complete, themeable (`--hud-*`), reduced-motion safe, demoed
- `examples/*` — full games on the stack; the reference an agent copies

## When adding a HUD block

Copy an existing block dir as the template. Requirements: custom-property theming
with sane defaults, `data-hud-*` bindings documented inline, a working `demo.html`,
`prefers-reduced-motion` rules, and a registry-item.json. No icon fonts, no
external requests, no JS dependencies.
