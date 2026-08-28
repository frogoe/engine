# frogoe engine

**Write a closure. Ship a game. Built for agents.**

frogoe is an open-source game framework with one standing rule: **the platform has
zero taste.** A game is one closure over four nouns — `stage`, `input`, `loop`,
`finish`. Everything visible comes from the game and from a registry of themeable
recipe blocks. Quality is taught by skills and measured on the output, never
imposed by an engine.

```
defineGame(({ stage, input, loop, finish }) => {
  // the whole game
});
```

## Quick start

```bash
git clone https://github.com/frogoe/engine && cd engine
bun install
bun test --filter '@frogoe/contract'   # 10 behavioral contracts, green
```

Play the reference game and every HUD block demo:

```bash
cd examples/flappy && bunx serve .     # or any static server; open on a phone
cd ../../registry/blocks/hud-score-card && bunx serve .   # each block has demo.html
```

## What is here

| Path                      | What                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| `packages/contract/`      | the whole platform: ~180 lines, zero taste, 10 behavioral tests        |
| `skills/frogoe`           | agent entry point (routing, brief, the build → check → eyeball loop)   |
| `skills/frogoe-core/`     | technical contract: folder form, BRIEF schema, HUD bindings, externals |
| `skills/frogoe-creative/` | house style, palettes, game feel — taste lives here, not in code       |
| `registry/blocks/`        | themeable HUD recipe blocks (score card, hearts, fuel, game-over)      |
| `examples/flappy/`        | reference game: contract + blocks + brief, end to end                  |
| `packages/cli/`           | **frogoe init / add / run / check** — live (21 tests). bundle next     |
| `docs/spec/`              | specs for the shipped CLI (bundler: LIVE)                              |

## The rules that matter

1. **The contract draws nothing.** HUD, fonts, colors, results screens — all game
   territory via blocks. A platform visual opinion is classified as a defect.
2. **Beauty lives in DOM+CSS** (the model's strength; the browser is the renderer);
   **the simulation lives in canvas** (60 Hz, fixed step, input unified).
3. **One artifact ships.** The bundler dissolves author-time externals (three.js,
   gsap, web fonts) into a single self-contained HTML: verified == played, zero
   runtime requests, no link rot.
4. **Quality is measured, not enforced by taste**: `check` measures the output
   (contrast against the declared palette, contract violations); screenshots are
   the gate that matters.

## Status

Pre-0.1 — contract and recipes are real and tested; CLI and bundler are specced
(`docs/spec/`) and next. Architecture modeled on what works for agent authoring
at scale; game-native where the domain demands it.

Apache-2.0. The repo lives at [github.com/frogoe/engine](https://github.com/frogoe/engine); the framework is called **frogoe** for short.
