# frogoe game

## Skills — USE THESE FIRST

**Always read the relevant skill before writing or modifying game code.** Skills encode the frogoe contract and creative direction that generic docs don't cover. Skipping them produces broken games.

**Doing anything with frogoe?** Start at the `/frogoe` skill — it confirms the BRIEF (verb, mood, palette) up front and routes every request. The domain skills it routes to:

- `/frogoe-core` — the technical contract: folder form, `defineGame` closure, four nouns, HUD bindings, external libraries. Read before writing any game code.
- `/frogoe-creative` — house style: three dials (VARIANCE/MOTION/DENSITY), lazy defaults, typography, palettes, game feel. Read when choosing how a game looks.
- `/frogoe-cli` — CLI dev loop: init, add, run, check, bundle, report. Finding codes split into `finding-codes.md` / `live-sandbox.md` / `bundle.md` for self-healing.
- `/frogoe-registry` — HUD block catalog: find, evaluate, install, author new blocks.

Skills live at `.claude/skills/` and `.agents/skills/` (install via `npx skills add frogoe/engine`; both mirrors stay byte-identical). Missing or stale? Re-run the install and restart the agent session. Check freshness: `frogoe skills check`.

## The contract

A game is **one closure**. The platform gives four nouns — everything else is yours:

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

| Noun     | What it gives                                                        | Guarantees                                                                |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `stage`  | `width/height`, `safe` (notch insets), `play` (capped column), `ctx` | DPR-capped canvas, notch-proof, identical challenge on every screen width |
| `input`  | `on("down"\|"drag"\|"up")`, `pointer {x,y,dx,dy,down}`               | Unified touch+mouse, full cancel path, dx/dy anchor-relative              |
| `loop`   | you fill `loop.update(dt)` + `loop.render(ctx)`                      | Fixed 60 Hz, dt clamped, pauses when hidden                               |
| `finish` | report the run's score                                               | fires once, flips `__frogoe.state` to `over`                              |

The platform draws NOTHING. Everything visible is your code + HUD blocks from the registry.

## Commands

```bash
frogoe run                  # serve with live reload + phone QR (safe-area only exists on real devices)
frogoe run --tunnel         # + public URL — phone works on any network (cloudflared, auto-downloaded once)
frogoe add <block>          # copy a HUD block into blocks/ (score, hearts, fuel, game-over, etc.)
frogoe lint                 # fast static contract lint (stable finding codes; --json for CI)
frogoe check                # full gate: lint + headless Chrome — FPS, playability, HUD outline, screenshots
frogoe bundle               # one self-contained HTML (externals dissolved) — only after check passes
```

> **Agents must run `frogoe check` after ANY code change** and fix all errors before
> presenting the result. `frogoe lint` is the fast static half for iteration; `frogoe
check` is the full gate (static + live sandbox) and MUST exit 0 before `frogoe
bundle`. Use `--json` for machine-readable findings that can be fixed programmatically.

## Project structure

- `index.html` — entry shell: `<canvas id="c">` + import map + `.hud` layer (HUD blocks land here)
- `game.js` — the whole simulation: `defineGame(({stage, input, loop, finish}) => {...})`
- `BRIEF.md` — the game's identity: verb, mood, palette (validated by `frogoe check`)
- `frogoe.json` — contract version pin
- `.frogoe/` — tool-owned, gitignored (the contract runtime — never edit)
- `blocks/` — HUD blocks copied from the registry (themed via `.hud` CSS custom properties)
- `dist/` — `frogoe bundle` output (single self-contained HTML)

## Check — ALWAYS RUN AFTER CHANGES

After creating or editing any file, **always** run:

```bash
frogoe lint              # fast static: BRIEF validation, folder structure, input patterns
frogoe check             # full gate: + browser — runtime errors, canvas painted, FPS, playability
```

Fix all errors before presenting the result. Common findings:

| Code                     | Meaning                                                 | Fix                                                                                          |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `brief/todo`             | BRIEF.md still has TODO markers                         | Fill in verb, mood, palette                                                                  |
| `input/incremental-drag` | `x += p.dx` (wall-rocket bug)                           | Use `x = grabX + p.dx` or track lastX                                                        |
| `folder/touch-select`    | Phone long-press summons text selection (iOS + Android) | Add `-webkit-user-select: none; user-select: none; -webkit-touch-callout: none` on html/body |
| `audio/suspended-only`   | Resume gated on `=== "suspended"` (iOS silent bug)      | Resume when `state !== "running"` — see frogoe-core `references/audio.md`                    |
| `live/hud-outline`       | HUD text missing text-shadow/stroke                     | Add `text-shadow: 0 2px 0 <dark>`                                                            |
| `live/fps`               | Below 30fps                                             | Cache gradients, reduce shadowBlur, cut particles                                            |
| `live/not-playable`      | Scripted taps changed nothing                           | Wire `input.on("down")` to actual game logic                                                 |

## Key rules

1. **pointer.dx is anchor-relative** (measured since touch-down, not per-event). Steer with `x = grabX + p.dx` or track your own `lastX`. NEVER `x += p.dx` inside a drag handler — every pointermove re-applies the cumulative offset and the actor rockets into a wall.
2. **All HUD text lives in the DOM layer** (`.hud` div) with a `text-shadow` or `-webkit-text-stroke`. The outline IS the readability mechanism — game backgrounds change every frame, so pixel-contrast against them is meaningless.
3. **Gameplay uses `stage.play`** (capped centered column: `left/right/center/width`), never raw `window.innerWidth` — identical challenge on every screen width.
4. **Fixed furniture respects `stage.safe`** — notches cover screen edges. Score at fixed y=34 sits under the Dynamic Island on modern phones.
5. **One page, zero runtime requests** after bundling. Author-time CDN dependencies are fine — `frogoe bundle` dissolves them (allowlist + pin + hash + inline).
6. **`finish(score)`** ends the run. The results card is a HUD block (`game-over-card`), never something the platform draws.
