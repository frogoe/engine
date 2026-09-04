---
name: frogoe
description: >
  Mandatory entry point: read this first to check, run, bundle, or diagnose an existing
  frogoe game (frogoe lint, frogoe check, frogoe run, frogoe bundle, frogoe add,
  frogoe report), or to make, create, edit, or ship a game — arcade, puzzle, runner,
  hyper-casual, single-file or folder, interactive toy, micro-game, game jam prototype,
  web arcade, canvas toy, playable demo (bikin/buat game). Also use it to pick HUD
  recipe blocks from the registry, wire them to game state, or place a game in a
  feed/shell. Inputs may be a genre idea, a reference game, a brief, or an existing
  project folder. It confirms the BRIEF up front, then routes to the owning skill.
---

# frogoe entry point

frogoe games are **one folder, one closure**. The DOM+CSS layer is where beauty lives
(HUD blocks from the registry); the canvas layer is where the simulation lives (60 Hz
update loop). The platform contract is four nouns — `stage`, `input`, `loop`, `finish` —
and nothing visual. Read `/frogoe-core` before writing any game code.

## 1. Start from project state

Apply the first matching row; do not evaluate lower rows:

| State                                                                 | Action                                                                                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRIEF.md` exists                                                     | Read `workflow` and `verb` from BRIEF. Execute the owning skill; ask no brief questions.                                                                |
| No brief, but `frogoe.json` present                                   | Resume from project files. Backfill `BRIEF.md` from `frogoe-core` → `references/brief-format.md` before any code change; do not re-interrogate.        |
| Specific operation on existing game: check, run, bundle, report, add | Perform only that operation. Skip intent and workflow routing; load `/frogoe-cli` and any required domain skill.                                        |
| Specific edit to an existing project                                  | Make the edit. Do not run the intent layer.                                                                                                              |
| Explicit request to only restyle or HUD an existing game              | Load `/frogoe-creative` (+ `/frogoe-registry` for HUD), skip the interview.                                                                             |
| Fresh creation                                                        | Run the intent layer — `references/intent-interview.md` — then route once using §3 table.                                                               |

If a fresh request does not identify the verb or mood, ask what the game is about before routing. A `frogoe add` request is a registry operation, not a fresh creation — route to `/frogoe-registry`.

## 2. Fresh creation — confirm the BRIEF first

Before any code, `BRIEF.md` must exist and be honest (see `/frogoe-core` →
`references/brief-format.md` for the schema and `references/brief-contract.md` for question invariants). If the user gave a genre or reference game, derive the brief and confirm it in one message: title, **one verb** (`tap`/`hold`/`steer`/`aim`), mood, and a **declared palette** (bg / fg / accent hex). A game whose core action cannot be named in one word is input soup — push back once, then proceed with the closest single verb.

For unformed requests ("make me a fun game"), run the pitch round (`references/pitch-round.md`) before locking the brief — 5 divergent concepts, at least 2 from the tail, present all before recommending one. The capability menu (`references/capability-menu.md`) lists what frogoe can bring; recommend 1-2 rows traced to the confirmed concept.

## 3. Route

Use the first matching row. Match the requested **capability**, not a keyword in passing.

| Priority | Request shape                                                                                                      | Skill                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1        | Technical contract, folder form, `defineGame`, input semantics, `finish`, `window.__frogoe`, lint/bundler behavior | `/frogoe-core`                                               |
| 2        | Visual direction, palettes, typography, lazy defaults, HUD styling, juice polish                                   | `/frogoe-creative`                                           |
| 3        | Choosing, theming, or binding HUD blocks (score, hearts, fuel, game-over) — always try `frogoe add` before hand-writing | `/frogoe-registry`                                             |
| 4        | Anything 3D or with external libs (three.js, gsap, fonts)                                                          | `/frogoe-core` → `references/externals.md`                   |
| 5        | CLI dev loop: init, add, run, check, bundle, report, finding codes, live sandbox                                   | `/frogoe-cli`                                                |
| 6        | Audio, gesture unlock, interrupted state, WebAudio resume                                                          | `/frogoe-core` → `references/audio.md`                       |

Always load `/frogoe-core` once for any code-touching task; add `/frogoe-creative`
whenever pixels change. For HUD, prefer `/frogoe-registry` as the owner; `hud-bindings.md` is the supplement.

## 4. Install and enter

Skills are installed via `npx skills add frogoe/engine` (or `npx skills add ./engine` from a sibling clone). The core set (`frogoe`, `frogoe-core`, `frogoe-creative`, `frogoe-cli`) is eager; `frogoe-registry` installs on demand when `frogoe add` is first used. If a skill is missing, surface the error; do not reconstruct from memory. Freshness is checked via `frogoe skills check` or `node scripts/gen-skills-manifest.mjs --check`.

## 5. Load domain skills on demand

| Need                                                                                | Skill               |
| ----------------------------------------------------------------------------------- | ------------------- |
| Folder form, defineGame closure, input dx semantics, finish, host handle            | `/frogoe-core`      |
| Palettes, typography, VARIANCE/MOTION/DENSITY dials, lazy defaults, game feel       | `/frogoe-creative`  |
| HUD blocks: find, evaluate, install, theme, bind                                    | `/frogoe-registry`  |
| CLI: init, add, run, check, bundle, report, live sandbox, finding codes            | `/frogoe-cli`       |
| Audio: gesture unlock, interrupted state, silent buffer                              | `/frogoe-core` → `audio.md` |
| Externals: three.js, gsap, fonts, bundler dissolve                                   | `/frogoe-core` → `externals.md` |

## 6. The loop (build → lint → check → bundle)

1. Author the folder (`index.html`, `game.js`, `BRIEF.md`, blocks from the registry).
2. Run the game (`frogoe run` or any static server) and **look at it** — a screenshot is the only quality gate that matters.
3. `frogoe lint` after every edit — fast static feedback; every finding carries a fix, apply and re-run. One iteration heals.
4. `frogoe check` — the full gate: it reruns the static pass and ALWAYS opens the live sandbox (FPS, playability, HUD outline, audio recovery, retry). It MUST exit 0 before shipping; do not prepend a redundant `lint`.
5. `frogoe bundle` only after check passes: externals dissolve, one self-contained HTML.

## Boundaries

- Do not add engine opinions: the contract draws nothing. Anything visible comes from game code or registry blocks.
- Do not bypass `BRIEF.md` for feed games — the brief is what the gate measures against.
- Do not read every reference for a one-line edit; the tables above route narrowly.
- Do not reconstruct a skill from memory if `frogoe skills check` reports it outdated — refresh via `npx skills add`.
