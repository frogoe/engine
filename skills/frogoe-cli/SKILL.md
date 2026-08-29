---
name: frogoe-cli
description: >
  The frogoe CLI development loop: init, add, run, check. Use for scaffolding
  a new game, copying registry HUD blocks, serving with live reload and phone
  QR, and running contract lint with stable finding codes (--json for the
  self-heal loop). Also use when diagnosing scaffold or check failures.
---

# frogoe CLI

Run commands as `bun packages/cli/src/bin.ts <cmd>` from the repo (published:
`npx frogoe <cmd>`). Requires bun.

## Development loop

1. **Scaffold:** `frogoe init my-game` — boots a runnable folder (living
   stub game, BRIEF stub, pinned .frogoe/). `cd my-game`.
2. **Find the part:** before hand-writing HUD, look in the registry —
   `frogoe add hud-fuel-gauge` copies a themeable block into hud/ and prints
   its bindings + placement snippet. Hand-write only once nothing fits.
3. **Iterate:** `frogoe run` — live reload on every save, QR for the phone
   (safe-area only exists on real devices; test there before shipping).
4. **Gate:** `frogoe check` — exit 1 on errors. In agent loops use
   `frogoe check --json`; every finding carries {code, file, line, severity,
   fix, recipe} — read the fix, apply, re-run. One iteration heals.

## Finding codes (stable — never renumber)

| Code                                                                                                                 | Severity | Meaning                                      |
| -------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------- |
| brief/missing, brief/frontmatter, brief/todo, brief/contrast                                                         | error    | intent undeclared or incomplete              |
| folder/index-missing, folder/canvas, folder/viewport-fit, folder/importmap, folder/game-missing, folder/contract-pin | error    | shell/pin broken                             |
| input/incremental-drag                                                                                               | error    | the shipped wall-rocket bug (+= p.dx)        |
| input/absolute-steering, layout/innerwidth-spawn                                                                     | warning  | thumb-ghosting / parity risks                |
| game/loop-update, game/loop-render                                                                                   | warning  | runtime will teach, fix first                |
| hud/binding-orphan                                                                                                   | warning  | selector targets nothing (block not pasted?) |

## check --live — the sandbox pass

`frogoe check --live` adds a headless-browser pass (chrome-headless-shell,
auto-downloaded + cached, pinned build): loads the real game on the run
server, both viewports (mobile 390×844 + desktop 1280×800), and measures —

| Code                                        | Severity | Meaning                                                                                                                          |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| live/page-error                             | error    | uncaught exceptions in the page                                                                                                  |
| live/console-error                          | warning  | console.error output                                                                                                             |
| live/canvas-missing / live/canvas-unpainted | error    | no canvas / loop.render never drew                                                                                               |
| live/contract-missing                       | error    | window.__frogoe absent — the contract never booted                                                                               |
| live/hud-outline                            | error    | HUD text without outline/stroke — the GAME readability convention (backgrounds change every frame; the outline is the guarantee) |
| live/layout-collapse                        | error    | HUD element with text but zero box (CSS collapse)                                                                                |
| live/fps                                    | warning  | below 30 fps — heavy per-frame work (cache gradients, cut shadowBlur)                                                            |
| live/no-input / live/not-playable           | error    | game never wired input / scripted taps changed nothing                                                                           |

Snapshots land in `snapshots/live-{mobile,desktop}.png` — the human-eye
evidence. Pure pixel/color math is unit-tested; the browser path runs real
Chrome (no mocks — quality is measured, not simulated).

## bundle — externals dissolve

`frogoe bundle` turns the folder into ONE self-contained HTML in dist/:
import-map modules bundled (contract inlined), fonts fetched + embedded as
base64 @font-face, local media as data URIs, provenance banner with sha256.
Author-time externals are allowlisted (jsdelivr, esm.sh, unpkg, Google
Fonts) and must be version-pinned — `@latest` and bare tags fail the bundle
with `bundle/unpinned`; unknown hosts fail with `bundle/blocked-origin`.
The artifact self-scans: if any remote URL survives, `bundle/leaked-remote`
fails the build — nothing ships half-dissolved.

## Boundaries

- check is deterministic/static; live output measures (rendered contrast)
  arrive with the sandbox layer. The declared-palette contrast check is the
  static floor.
- bundle requires network for CDN assets (allowlist + pin + sha256); offline
  games with only local assets bundle with zero fetches.
