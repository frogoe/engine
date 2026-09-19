# Finding codes — static (stable — never renumber)

Pure static checks via `packages/lint`. Zero browser deps. Every finding carries `{code, file, line, severity, fix, recipe}` — read the fix, apply, re-run. One iteration heals.

| Code | Severity | Meaning |
| ---- | -------- | ------- |
| brief/missing, brief/frontmatter, brief/todo, brief/contrast | error | intent undeclared or incomplete |
| brief/verb, brief/session | error | unknown verb / session value — the enums live in frogoe-core → brief-format.md |
| input/verb-mismatch | error | the declared verb requires input wiring the game never wrote (verb → handler table in frogoe-core → brief-format.md) |
| input/raw-keyboard | error | raw `addEventListener("keydown")` bypasses the contract — use `input.on("key")` + poll `input.keys` (blur-safe, repeat-suppressed, sandbox-verified) |
| art/missing | error | identity scenes absent — author assets/poster.js + assets/icon.js (frogoe-creative → art.md) |
| art/scene-export, art/scene-source, art/color-drift, art/text-font, art/empty | error | authored art breaks the 1:1 contract (missing draw entry, no ../game.js import, a color the game never draws, lettering outside the BRIEF font, placeholder scene) |
| art/title-presence | warning | poster has no canvas lettering — Steam's logotype law, taught not banned (shape-lettering is legal) |
| art/title-band | warning | poster declares no ctx.__frogoeTitleBand — bundle's collision check stays off; declare from layout variables |
| folder/index-missing, folder/canvas, folder/viewport-fit, folder/touch-select, folder/importmap, folder/game-missing, folder/contract-pin | error | shell/pin broken (touch-select: phone long-press summons text selection — iOS + Android) |
| folder/contract-stale | warning | pinned contract predates the current one — bump frogoe.json and run `frogoe init --force` (the upgrade path preserves game code and BRIEF) |
| input/incremental-drag | error | the shipped wall-rocket bug (incremental dx) |
| input/absolute-steering, layout/innerwidth-spawn | warning | thumb-ghosting / parity risks |
| stage/cached-metrics | error | stage geometry destructured into a const — frozen at boot, stale after any resize (read stage.play fresh per tick; normalized coords remap on change) |
| hud/magic-anchor | warning | data-pos wrapper with an inline tuned offset — center structurally (inset:0 + grid), tuned % drifts per geometry |
| audio/suspended-only | warning | resume gated on suspended only — iOS interrupted contexts stay silent (frogoe-core → audio.md) |
| game/loop-update, game/loop-render | warning | runtime will teach, fix first |
| blocks/binding-orphan | warning | selector targets nothing (block not pasted?) |
| test/logic-untested | error | logic verb (type/swap/place) or round session with no game.test.js — semantics unverified (frogoe-core → testable seam) |
| test/failed · test/timeout · test/crash · test/stub-conflict | error | game.test.js is red / hung >30s / crashed before reporting / a foreign node_modules/frogoe blocks the stub |

## Bundle-time art gates (rendered — tier 2, thrown by `frogoe bundle`)

| Code | Meaning |
| ---- | ------- |
| bundle/art-missing | identity scenes absent (check catches earlier as art/missing) |
| bundle/art-crash | a scene threw while drawing |
| bundle/art-title-readability | no readable identity layer in the poster's upper field (a logotype-WIDE ink run ≥3:1 vs its row ground, bbox ≥8px from edges — wherever the author put it) — outline or scrim, any mechanism passes the same numbers |
| bundle/art-icon-fullbleed | icon corners are non-opaque (pre-rounded — Apple rejects alpha) or not a game palette color |
| bundle/art-dead-bands (warning) | >70% of the poster's upper-field rows are empty — compose a moment with density; see `frogoe vision` |
| bundle/art-icon-fill (warning) | the mark covers <8% of the icon — let it nearly fill the plate; see `frogoe vision` |
| bundle/art-title-collision (warning) | a free-floating blob parks in the clearance margin under the declared lettering block (ctx.__frogoeTitleBand) — relocate below by ~its radius; ceiling-hung world is exempt |
