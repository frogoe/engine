<p align="center"><b>frogoe</b></p>

<p align="center">
  <a href="https://github.com/frogoe/engine"><img src="https://img.shields.io/badge/repo-frogoe/engine-blue" alt="repo"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node.js"></a>
</p>

<p align="center"><b>Write a closure. Ship a game. Built for agents.</b></p>

<p align="center">
  <a href="#quick-start">Quick Start</a> |
  <a href="#skills">Skills</a> |
  <a href="#what-you-can-build">What You Can Build</a> |
  <a href="#how-it-works">How It Works</a> |
  <a href="#catalog">Catalog</a>
</p>

frogoe is an open-source game framework with one standing rule: **the platform has zero taste.** A game is one closure over four nouns — `stage`, `input`, `loop`, `finish`. Everything visible comes from the game and from a registry of themeable blocks. Quality is taught by skills and measured on the output, never imposed by an engine.

## Quick Start

### With an AI coding agent

Install the frogoe skills, then describe the game you want:

```bash
npx skills add frogoe/engine
```

Try a prompt like:

> Using `/frogoe`, make a game where you hold to charge a jump and hop between platforms as lava rises.

The skills teach agents the frogoe production loop: confirm the BRIEF (verb, mood, palette), scaffold with `frogoe init`, write the game closure, install HUD blocks, run `frogoe check`, and ship a single-file artifact. They work with Claude Code, Codex, Cursor, OpenCode, and other coding agents that support skills.

### Manually with the CLI

```bash
frogoe init my-game
cd my-game
frogoe run             # serve with live reload + phone QR
frogoe check           # static contract lint
frogoe check --live    # + headless Chrome: FPS, playability, HUD outline
frogoe bundle          # one self-contained HTML (zero runtime requests)
```

**Requirements:** bun or Node.js 22+

### From this repo

```bash
git clone https://github.com/frogoe/engine && cd engine
bun install
bun run verify          # full gauntlet: format + lint + types + tests + knip + registry
```

Play the reference game and every block demo:

```bash
cd examples/flappy && bunx serve .
cd ../../registry/blocks/score-card && bunx serve .   # each block has demo.html
```

## Skills

frogoe ships 5 skills agents load on demand. Read `/frogoe` first — it's the router and capability map; it confirms the BRIEF up front and routes to the domain skills below.

| Skill              | Use when                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/frogoe`          | **Read first** for any request to make / create / edit / ship a game. Confirms the BRIEF (verb, mood, palette), routes to domain skills.      |
| `/frogoe-core`     | The technical contract — folder form, `defineGame` closure, four nouns, HUD bindings, external libraries and the bundler that dissolves them. |
| `/frogoe-creative` | House style — three dials (VARIANCE / MOTION / DENSITY), lazy defaults to question, typography, named palettes, game feel.                    |
| `/frogoe-cli`      | CLI dev loop — `init`, `add`, `run`, `check` (static + live sandbox), `bundle`. Finding codes table for self-healing.                         |
| `/frogoe-registry` | Install and wire registry blocks via `frogoe add`. Authoring a new block to contribute upstream.                                              |

## What You Can Build

- Arcade games: Flappy-style tappers, runners, dodgers, climbers
- Puzzle games with objectives, moves counters, timers
- Casual games with lives, fuel, combo streaks, leaderboards
- Hold-to-charge, drag-to-steer, aim-and-release mechanics
- Games with CDN dependencies (three.js, GSAP, web fonts) bundled into one file

## How It Works

Define a game as one closure. The platform gives four nouns — everything else is yours:

```js
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

| Noun     | Gives                                                                | Guarantees                                                         |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `stage`  | `width/height`, `safe` (notch insets), `play` (capped column), `ctx` | DPR-capped canvas, notch-proof, identical challenge on every width |
| `input`  | `on("down"\|"drag"\|"up")`, `pointer {x,y,dx,dy,down}`               | Unified touch+mouse, full cancel path, dx/dy anchor-relative       |
| `loop`   | you fill `loop.update(dt)` + `loop.render(ctx)`                      | Fixed 60 Hz, dt clamped, pauses when hidden                        |
| `finish` | report the run's score                                               | Fires once, flips `__frogoe.state` to `over`                       |

The platform draws nothing. Everything visible is your code plus HUD blocks from the registry. The DOM+CSS layer is where beauty lives (agents write CSS well; the browser renders it); the canvas layer is where the simulation lives (60 Hz, fixed step, input unified).

## Catalog

Install ready-to-use HUD blocks:

```bash
frogoe add score-card       # big number with bump animation
frogoe add hearts-row       # lives with pop on damage
frogoe add fuel-gauge       # resource bar with danger state
frogoe add game-over-card   # end-of-run results + retry button
frogoe add ready-hint       # verb affordance (replaces start menus)
frogoe add ready-gate       # tap-to-start overlay — the audio-unlock tap
frogoe add timer-ring       # circular countdown
```

Each block is themeable via `--block-*` custom properties from your BRIEF palette, ships a working `demo.html`, and is validated against the registry schema. `frogoe add` auto-injects styles + markup into `index.html` (idempotent — re-add replaces).

## The One Rule

**The platform (`packages/contract`) has zero visual opinion.** If a change makes it draw, style, or sound like anything, that change is wrong — move it to the registry (a themeable block) or to skills (knowledge). This rule is load-bearing.

## Why frogoe?

- **Agent-native:** agents already write HTML and JS; the CLI is non-interactive by default; skills teach the patterns generic docs miss.
- **Zero taste:** the contract draws nothing, sounds nothing, styles nothing. Your game owns the look; the registry owns the building blocks.
- **Measured quality:** `frogoe check --live` runs your game in headless Chrome — runtime errors, FPS, playability, HUD outline. Screenshots are the gate that matters.
- **One artifact:** `frogoe bundle` dissolves CDN dependencies into a single self-contained HTML — zero runtime requests, no link rot, verified == played.
- **Open source:** Apache 2.0, no per-game fees.

## Packages

| Package            | Description                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `@frogoe/contract` | The whole platform (~190 lines, zero taste): defineGame, four nouns, `__frogoe` host handle |
| `@frogoe/lint`     | Pure static contract checks, zero browser deps — importable by server/pipeline              |
| `@frogoe/cli`      | `init`, `add`, `run`, `check` (static + live sandbox), `bundle`                             |
| `skills/`          | 5 AI agent skills (router, core, creative, cli, registry)                                   |
| `registry/blocks/` | 10 themeable HUD blocks with demos                                                          |
| `examples/flappy/` | Reference game: Flappy Chick at Flappy Bird quality                                         |

## Development

```bash
bun install             # Install dependencies (NOT pnpm)
bun run verify          # Full gauntlet: format + lint + types + tests + knip + registry
bun test                # 40 tests across lint + contract + CLI
```

Uses **oxlint** and **oxfmt** (not eslint, not prettier). Commits are conventional (`feat:`, `fix:`, `docs:`, `chore:`) via lefthook + commitlint.

## License

[Apache 2.0](LICENSE)
