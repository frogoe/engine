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

## Boundaries

- `bundle` (externals dissolve) is specced but not implemented — do not
  promise single-file artifacts from this CLI version.
- check is deterministic/static; live output measures (rendered contrast)
  arrive with the sandbox layer. The declared-palette contrast check is the
  static floor.
