# Genres — verb + session recipes for non-arcade games

The contract is genre-blind on purpose; this page is the knowledge layer that
maps each genre family onto the two declarations the platform DOES understand:
the **verb** (which input ladder the sandbox plays) and the **session** (how the
gate treats "the run ends"). Pick the row, declare the pair, then follow its
pattern notes.

| Genre family | verb | session | The run ends when… |
| ------------ | ---- | ------- | ------------------ |
| Arcade / runner / hyper-casual | `tap` `hold` `steer` `aim` | `blitz` (default) | the player fails, in seconds |
| Match-3 | `swap` | `blitz` | move budget or timer runs out |
| Word / typing | `type` | `blitz` or `round` | the clock, or the puzzle solves |
| Board / chess / tactics | `place` | `round` | checkmate, resignation, clock |
| Cards / solitaire | `place` or `swap` | `round` | the deck resolves |
| Tower defense / waves | `place` | `round` | the last wave or the first leak |
| Idle / clicker | `idle` or `tap` | `toy` | never — the toy IS the loop |
| Drawing / sandbox toys | `draw` | `toy` | never |
| Physics toys | `aim` or `draw` | `toy` | never |

## What each session buys you at the gate

- `blitz` — death expected ≤45s; never-ends is a warning; death + retry verified.
- `round` — the gate waits an 8s grace (blind scripted input ending a chess game
  is a bonus, not the expectation); never-ends is silent; a death that happens
  anyway gets FULL verification (finish agreement, card, retry ×2).
- `toy` — no end wait at all; no game-over-card or retry requirements; boot,
  playability, FPS, throttle, and HUD gates still apply in full.

A toy must still ANSWER input (`live/not-playable` is an error in every
session) and a round game that never fires `finish()` skips its death coverage —
if you can make a round endable in ≤45s (timers, resign affordances), do: the
gate exercises more of your game.

## Pattern notes per family

- **Board / tactics (`place` + `round`)** — state machine, not event soup:
  `READY → PLAYER_TURN → RESOLVING(anim) → AI_TURN(sliced) → OVER`. Input maps
  to intents (`SELECT`, `PLACE`); illegal intents get cheap feedback (shake),
  never exceptions — the sandbox plays blind and must never crash the page.
  Run the AI inside `loop.update` as a time-sliced state (a few ms per frame),
  never one blocking burst. End runs legibly: a visible clock or resign beats
  a silent auto-loss. For rematch, the game-over-card's retry may call your own
  `reset()` instead of `location.reload()` — safe because toys/rounds persist
  best-score only, never mid-run state.
- **Match-3 (`swap` + `blitz`)** — the grid engine is pure functions over an
  Int grid (`findMatches`, `gravity`, `refill`); cascades resolve as tween
  states driven by `update(dt)`. Bind `combo-counter` tiers to cascade depth.
- **Word / typing (`type`)** — `input.on("key", ...)` for edges (submit on
  Enter, delete on Backspace) + the registry's `hud-keyboard` block for touch:
  its presses dispatch real KeyboardEvents, so ONE listener serves hardware
  keys and the on-screen keys alike. Declaring `type` requires
  `input.on("down")` + `input.on("key")`. Raw `addEventListener("keydown")` is
  an error (`input/raw-keyboard`) — no blur safety, no repeat suppression,
  invisible to the sandbox's type ladder.
- **Idle / toys (`idle`/`draw` + `toy`)** — no `finish()`, no card, no retry:
  the feed shows a living toy. Keep the canvas evolving (ambient drift, fading
  strokes) so playability and frozen-frame hold structurally. Glowdoodle
  (`examples/glowdoodle`) is the reference.
- **Tower defense (`place` + `round`)** — waves are the session's clock: cap
  the wave count so a run can end. Placement drag follows the anchor-relative
  contract (`x = grabX + p.dx`).

## Persistence (all genres)

There is no platform save API — by design. Wrap storage in try/catch
(`localStorage` throws inside sandboxed embeds); persist high scores and
settings only. Never persist mid-run state: the retry affordance is a reload,
and a half-restored run reads as a sick boot at the gate (`live/state-stuck`).
