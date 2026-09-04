# frogoe engine

Open-source game framework built for agents: write a closure, ship a game.

## The one rule (load-bearing)

The platform (`packages/contract`) has **zero visual opinion**. If a change makes it draw, style, or sound like anything, that change is wrong — move it to the registry (a themeable block) or to skills (knowledge). This rule is paid for.

## Skills

This repo ships AI agent skills via [vercel-labs/skills](https://github.com/vercel-labs/skills). Install them before writing games — they encode the contract, creative direction, and CLI dev loop that generic docs don't cover.

```bash
npx skills add frogoe/engine    # install all 5 skills
# or link locally:
npx skills add ./engine         # from a sibling clone
```

**`/frogoe` is the entry skill — read it first.** It's the router that confirms the BRIEF (verb, mood, palette) up front, then routes to the domain skills. `skills/` is distributable (via `npx skills add`); `.claude/skills` + `.agents/skills` are byte-identical mirrors for local dev (checked by `check:skill-mirror`). Native plugin manifests `.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/` expose the same 5 skills to each store (Claude/Cursor/Codex) without `npx`.

### Domain skills

- `/frogoe-core` — the technical contract: folder form, `defineGame` closure, four nouns (`stage/input/loop/finish`), `window.__frogoe` host handle, HUD bindings, external libraries and the bundler that dissolves them. Read before writing game code.
- `/frogoe-creative` — house style: three dials (VARIANCE/MOTION/DENSITY), lazy defaults to question, typography (banned fonts, voice-to-mood table), named palettes, game feel (motion, feedback, death). Read when choosing how a game looks.
- `/frogoe-cli` — CLI dev loop: `frogoe lint` (fast static), `frogoe check` (full gate: static + live sandbox), bundle, report, skills. Finding codes split into `finding-codes.md` / `live-sandbox.md` / `bundle.md`.
- `/frogoe-registry` — HUD block catalog: `frogoe add` (score-card, fuel-gauge, hearts-row, game-over-card) before hand-writing; how to author new blocks.

### Skill catalog maintenance

When adding or renaming a skill, update in lockstep: the list above, the `## Skills` section in `README.md`, `skills-manifest.json` (via `node scripts/gen-skills-manifest.mjs --write`), and the mirrors `.claude/skills` + `.agents/skills` (via `cp -r skills/. .claude/skills/`). Native plugin manifests `.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/` expose the same 5 skills to each store (Claude/Cursor/Codex) without `npx`. Out-of-date entries or stale hashes silently kill discovery.

## Build & verify

```bash
bun install        # Install dependencies (NOT pnpm — do not create pnpm-lock.yaml)
bun run verify     # Full gauntlet: format + lint + types + tests + knip + registry + game lint + skill freshness (lint:skills + skill-mirror + packed-manifests)
bun test           # 138 tests across lint + contract + CLI
```

### Linting & formatting

Uses **oxlint** and **oxfmt** (not eslint, not prettier, not biome).

```bash
bun x oxlint .            # Lint
bun x oxfmt .             # Format
bun x oxfmt --check .     # Check formatting (CI / pre-commit)
```

Always lint and format changed files before committing. Lefthook pre-commit hooks enforce this automatically.

### Game validation — ALWAYS RUN AFTER CHANGES

> **Agents must run `frogoe check` after ANY game code change and fix all errors before
> presenting the result.** `frogoe lint` is the fast static half; `frogoe check` is the
> full gate (static + live sandbox) and MUST exit 0 before `frogoe bundle`.

```bash
frogoe lint               # fast static contract lint (stable finding codes; --json)
frogoe check              # full gate: + headless Chrome — FPS, playability, HUD outline
frogoe bundle             # one self-contained HTML (externals dissolved) — only after check
```

Common findings: `brief/todo` (fill verb/mood/palette) · `input/incremental-drag` (use
`x = grabX + p.dx`, never `x += p.dx`) · `folder/touch-select` (user-select none on
html/body) · `audio/suspended-only` (resume when state is not "running") ·
`live/hud-outline` (text-shadow on HUD text) · `live/fps` (cache gradients, cut
shadowBlur) · `live/not-playable` (wire `input.on("down")` to real logic).

## Project structure

```
packages/
  contract/             → The whole platform (~190 lines, zero taste):
                          defineGame, stage/input/loop/finish, __frogoe handle
  lint/                 → Pure static checks, zero browser deps
                          (importable by server, pipeline, studio)
  cli/                  → frogoe CLI: init, add, run, check, bundle
registry/
  blocks/               → Installable HUD blocks (11, themeable, with demos)
skills/                 → AI agent skill definitions (5, mirrored to .claude/skills + .agents/skills; plugins .claude-plugin/.cursor-plugin/.codex-plugin)
examples/
  flappy/               → Reference game: Flappy Chick at full quality
docs/
  spec/                 → Bundler + CLI specifications
```

## Key conventions

- **Package manager**: bun (not pnpm, not npm for workspace operations)
- **Commit format**: Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
- **TypeScript**: strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Avoid `any` and `as T` assertions. Prefer type guards and narrowing.
- **Games are folders**: `index.html` + `game.js` + `BRIEF.md` + `.frogoe/` (tool-owned, gitignored)
- **Game code is plain browser JS**: no TypeScript in game.js (the browser runs it directly)
- **The contract is four nouns**: `stage`, `input`, `loop`, `finish`. Nothing else. If the platform needs a fifth noun, that's a design conversation, not a PR.
- **HUD lives in the DOM layer** (`.hud` div): canvas HUD is only for world-anchored popups
- **Readability via outline**: game HUD text uses `text-shadow` or `-webkit-text-stroke`, not pixel-contrast against changing backgrounds
- **Externals dissolve at build**: allowlisted CDN dependencies are fetched, pinned, hashed, and inlined by `frogoe bundle` — the artifact has zero runtime requests
- **pointer.dx is anchor-relative** (since touch-down): steer with `x = grabX + p.dx` or track lastX. NEVER `x += p.dx`
- **Gameplay uses `stage.play`** (capped centered column), never raw innerWidth
- **One artifact, one fetch**: `frogoe bundle` output is a single self-contained HTML file — verified == played

## Documentation

- Skills: `skills/frogoe/SKILL.md` (the router — start here)
- Contract: `packages/contract/src/contract.js` (~190 lines, heavily commented)
- Registry: `registry/registry.json` + `registry/blocks/*/demo.html`
- Specs: `docs/spec/bundler.md` + `docs/spec/cli.md`
