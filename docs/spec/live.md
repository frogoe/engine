# Live Check v0.2 — Lifecycle Sandbox

**Status: DESIGN → implementation.**
Supersedes the single-shot live pass in `packages/cli/src/live.ts` (v0.1).

## Problem

v0.1 answers "does the game boot and react once?" It cannot answer the
question that matters for a feed of replayable games:

> Does the full loop work — boot → play → die → retry → play again?

It also has two known weaknesses:

1. **One-shot sampling** — a single FPS window and a single before/after
   canvas hash. Timing jitter produces false confidence or false alarms.
2. **No end-state verification** — a game that never calls `finish()`,
   or shows no retry affordance, passes today.

## Research basis (HyperFrames patterns, adapted)

HyperFrames' check seeks a deterministic timeline and asserts universal
invariants at sample times. Games are not seekable, but the frogoe
contract gives an equivalent universal surface:

- `window.__frogoe.state` — `loading → playing ⇄ paused`, `playing → over`
  (terminal; `finish()` is one-shot).
- `frogoe:finish` DOM event with `detail.score`.
- The retry convention: `[data-block-gameover]` overlay + `[data-block-retry]`
  button wired to `location.reload()` (host-blind; in the feed the host
  reloads the iframe).

Borrowed patterns: held-failure demotion (single dip = warning, sustained =
error), evidence snapshots, finding codes with fix hints, lint
short-circuit before browser launch (already present).

## Product decisions (approved in discussion)

1. **Retry model: reload-as-retry.** Highest reliability floor regardless
   of game-code quality; the single-file bundle makes reload ~cache-cheap;
   the feed host reloads the iframe. No contract change, no `__frogoe.reset()`.
2. **Never-ends: warning, not error.** The floor's job is platform health,
   not game design. Endless/sandbox games are legitimate; feed analytics
   and the human/reviewer layers judge pacing. (Constant `END_BUDGET_MS`.)
3. **Pointer-only input ladder.** Every frogoe game receives pointer events
   through the contract; keyboard ladders add surface without coverage.
   The ladder exercises all three pointer verbs: jittered taps, one
   ~400ms hold (press-release), and one horizontal drag sweep
   (press-move-release) for drag/steer-only games.

## Architecture

`packages/cli/src/live/` — six modules, one purpose each:

| Module | Responsibility |
|---|---|
| `types.ts` | `LiveFinding` (lint `Finding` + `phase`), phase names, `LiveResult` |
| `decisions.ts` | **All** pure decision functions — every finding's shaping. Unit-tested, no browser |
| `sampler.ts` | Injected page probe strings (finish-event capture, per-second FPS buckets, canvas hash) |
| `driver.ts` | `LiveDriver` interface + puppeteer-core implementation |
| `phases.ts` | Lifecycle orchestration against a `LiveDriver` — no puppeteer imports |
| `index.ts` | `collectLive`: server + browser + viewport wiring; re-exports public API |

`LiveDriver` is the reuse seam: tests drive `FakeDriver`, production drives
puppeteer. Phases depend on the interface, never the implementation.

The probe is installed via `evaluateOnNewDocument`, so it survives the
retry reload automatically (fresh probe each navigation; the orchestrator
re-reads state after navigation).

## Phases

**BOOT** (both viewports) — existing checks plus:
- state must reach `"playing"`; stuck `"loading"` → error `live/state-stuck`
- state already `"over"` → error `live/early-death` — the game dies on
  its own ready screen before any input (found in the reference game
  during implementation; physics must be gated behind the first input)
- `console.error` capture → warning `live/console-error` (promised by
  skill docs since v0.1, never implemented — closing that gap)

**PLAY** (mobile only) — ~6s of scripted input, ~850ms cadence:
- ladder: taps with jitter across the play column + one ~400ms hold
- state sampled each step: `playing` normal, `over` early → jump to END,
  `paused` → warning `live/paused`, anything else → error `live/state-corrupt`
- canvas hash sampled each step: ≥1 change across the window = alive;
  3 consecutive equal hashes while `playing` → warning `live/frozen-frame`
- FPS: per-second buckets from the probe. Mean < floor → warning
  `live/fps` (unchanged code/severity); any 3-consecutive-second window
  averaging < floor → **error** `live/fps-sustained` (the held-failure upgrade)

**END** (mobile, continues from PLAY):
- passive only (no input): doing nothing is the universal death for
  action games; puzzles legitimately time out
- budget 45s (`END_BUDGET_MS`): `over` + `frogoe:finish` observed → pass;
  budget exceeded → warning `live/never-ends`
- state `over` but no finish event → error `live/finish-event-missing`
  (catches manual `__frogoe.state` mutation — the no-cheat guard)
- finish event but state not `over` → error `live/finish-event-missing`
- no `[data-block-gameover]` overlay → warning `live/no-gameover-card`
- no `[data-block-retry]` in the DOM at all → error `live/no-retry`
  (player is hard-stuck)

**RETRY** (mobile):
- wait for `[data-block-retry]` to be genuinely interactable (visible,
  non-zero box, owns the hit-test at its center) within a 3s grace —
  game-over cards animate in AFTER the state flips, and clicking a
  closed overlay proves nothing
- real `click()` on it; navigation (reload) must occur within 8s → else
  error `live/retry-dead`
- post-reload: fresh BOOT assertions must pass again (state `playing`
  via `live/early-death`/`live/state-stuck`, canvas painted). Page-error
  listeners persist across navigation.

**STABILITY** (mobile):
- END → RETRY runs **twice**; one-shot bugs (works first death only)
  surface on the second cycle. Each cycle gets its own END budget, and
  a 3-tap restart burst precedes the second death wait — correctly
  gated games need input to START dying.

**Dev-server watcher** (`frogoe run`): writes under `snapshots/` and
`.frogoe/` no longer broadcast SSE reloads. Tool output is not game
source; a screenshot write racing a real button-driven reload produced
false retry verdicts before this fix (found during implementation).

Not measured (deliberate): memory (`performance.memory` is non-standard /
being removed — unreliable gates are worse than none), fun/difficulty/
solvability (reviewer + human + feed analytics — the live pass is the
floor, not the ceiling).

## Finding codes (complete v0.2 table)

| Code | Severity | Meaning |
|---|---|---|
| `live/page-error` | error | uncaught page exception (accumulates across reloads) |
| `live/console-error` | warning | console.error output in page |
| `live/canvas-missing` | error | no `<canvas id="c">` |
| `live/canvas-unpainted` | error | loop.render never drew |
| `live/contract-missing` | error | `window.__frogoe` absent |
| `live/state-stuck` | error | state never left `loading` |
| `live/early-death` | error | `over` before any input — ready-screen suicide |
| `live/hud-outline` | error | HUD text without outline (unchanged) |
| `live/layout-collapse` | error | HUD element collapsed (unchanged) |
| `live/fps` | warning | mean FPS below floor (unchanged) |
| `live/fps-sustained` | error | sustained low FPS — held failure |
| `live/frozen-frame` | warning | canvas static while `playing` |
| `live/paused` | warning | state `paused` during play (auto-pause misfire) |
| `live/state-corrupt` | error | state outside the legal set |
| `live/never-ends` | warning | no `over` within END budget |
| `live/finish-event-missing` | error | `over` without the event, or event without `over` |
| `live/no-gameover-card` | warning | game-over overlay absent |
| `live/no-retry` | error | no retry affordance in DOM |
| `live/retry-dead` | error | retry click produced no reload |
| `live/no-input` / `live/not-playable` | error | unchanged semantics |
| `live/runtime-failure` | error | the sandbox itself crashed on a viewport |

## Metrics

`LiveResult.metrics` keeps `desktopFps` / `mobileFps` / `playability` and
adds `lifecycle`: `{ ends: boolean; retryReloads: number }`. Screenshot
list gains phase shots (`live-mobile-over.png`, `live-mobile-retry.png`)
alongside the per-viewport boots, still under `snapshots/` (gitignored by
the init template).

## Anti-cheat audit

| Cheat | Caught by |
|---|---|
| fake `over` via direct `__frogoe.state` write | `finish-event-missing` |
| `finish()` at boot to look compliant | BOOT requires `playing` first |
| input listener with no visible effect | repeated hash sampling (`not-playable`) |
| retry button that does nothing | `retry-dead` (navigation wait) |
| crash only on second run | STABILITY + persistent page-error listener |

Adversarial games that fingerprint headless Chrome are out of scope
(open ecosystem; the gate protects against bugs, not attackers).

## Testing

1. **Pure decisions** (`test/live.test.ts`, extended): every new shaping
   function, including sustained-FPS windows and frozen-frame streaks.
2. **Fake-driver lifecycle** (`test/live-phases.test.ts`, new): a scripted
   `FakeDriver` simulating healthy / never-ending / stuck-loading /
   dead-retry / no-finish-event / frozen-canvas / low-FPS games — full
   orchestration tested without a browser.
3. **Integration**: `frogoe check` against `examples/flappy`
   (healthy path, real Chrome) run manually before completion.

## Docs lockstep (per AGENTS.md)

`skills/frogoe-cli/SKILL.md` codes table and this spec updated in the
same change; `README` untouched unless it lists live codes (it does not).
