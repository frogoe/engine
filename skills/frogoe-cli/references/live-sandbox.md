# The live sandbox — the browser half of `frogoe check`

`frogoe check` always runs this pass after the static one (chrome-headless-shell, auto-downloaded and cached, pinned build): loads the real game on the run server, both viewports (mobile 390×844 + desktop 1280×800). Mobile runs the FULL LIFECYCLE — boot → play (input ladder: jittered taps + one hold + one drag sweep) → end (passive death within 45s) → retry (click `[data-block-retry]`, expect reload, healthy reboot) → stability (the death→retry cycle runs twice; works-once bugs surface on round two). Severity follows the held-failure rule: a defect seen once is a warning; held across a window it is an error.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| live/page-error | error | uncaught exceptions in the page (persists across retries) |
| live/console-error | warning | console.error output (de-duplicated against page errors) |
| live/canvas-missing / live/canvas-unpainted | error | no canvas / loop.render never drew (re-checked after each retry reload) |
| live/contract-missing | error | window.__frogoe absent — the contract never booted |
| live/state-stuck | error | state never left "loading" — also fires when a retry reboot lands sick |
| live/early-death | error | state "over" before any input — the game kills itself on its ready screen; gate physics behind the first input.on("down") |
| live/hud-outline | error | HUD text without outline/stroke — the GAME readability convention (backgrounds change every frame; the outline is the guarantee) |
| live/layout-collapse | error | HUD element with text but zero box (CSS collapse) |
| live/fps | warning | mean fps below 30 — heavy per-frame work (cache gradients, cut shadowBlur) |
| live/fps-sustained | error | low fps held 3s+ — consistently slow, not jittering (cut allocations, shrink offscreen canvases) |
| live/fps-throttled | warning | collapse under 4x cpu throttle (the Lighthouse mobile anchor) — mid-range phones will feel it; cut per-frame work |
| live/frozen-frame | warning | canvas held the same frame 3 samples while playing — loop.render stopped or draws a static scene |
| live/paused | warning | state read "paused" during scripted play — pause() without resume() |
| live/state-corrupt | error | state outside the contract's set — game code mutating window.__frogoe directly |
| live/no-input / live/not-playable | error | game never wired input / scripted taps changed nothing |
| live/audio-locked | error | audio stayed suspended after an INJECTED interruption plus real input — the game lacks gesture-scoped resume wiring (frogoe-core → references/audio.md) |
| live/never-ends | warning | no death within 45s of passive play — fine for endless games; feed games are short loops |
| live/finish-event-missing | error | "over" without frogoe:finish, or the event without "over" — forged state machine |
| live/no-gameover-card | warning | ended without a [data-block-gameover] overlay — install game-over-card |
| live/no-retry | error | no [data-block-retry] button — the player is hard-stuck after death |
| live/retry-dead | error | clicking retry produced no reload — wire it to location.reload() |
| live/runtime-failure | error | the sandbox itself crashed on a viewport — report the output |

Snapshots land in `snapshots/` — `live-{mobile,desktop}.png` at boot, `live-mobile-over{,-2}.png` and `live-mobile-retry{,-2}.png` at each death/retry — the human-eye evidence. Pure decisions and the full lifecycle are unit-tested against a scripted driver; the browser path runs real Chrome (no mocks — quality is measured, not simulated).
