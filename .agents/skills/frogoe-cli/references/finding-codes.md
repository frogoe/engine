# Finding codes — static (stable — never renumber)

Pure static checks via `packages/lint`. Zero browser deps. Every finding carries `{code, file, line, severity, fix, recipe}` — read the fix, apply, re-run. One iteration heals.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| brief/missing, brief/frontmatter, brief/todo, brief/contrast | error | intent undeclared or incomplete |
| folder/index-missing, folder/canvas, folder/viewport-fit, folder/touch-select, folder/importmap, folder/game-missing, folder/contract-pin | error | shell/pin broken (touch-select: phone long-press summons text selection — iOS + Android) |
| input/incremental-drag | error | the shipped wall-rocket bug (incremental dx) |
| input/absolute-steering, layout/innerwidth-spawn | warning | thumb-ghosting / parity risks |
| audio/suspended-only | warning | resume gated on suspended only — iOS interrupted contexts stay silent (frogoe-core → audio.md) |
| game/loop-update, game/loop-render | warning | runtime will teach, fix first |
| blocks/binding-orphan | warning | selector targets nothing (block not pasted?) |
