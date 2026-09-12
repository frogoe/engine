---
name: frogoe-cli
description: >
  The frogoe CLI development loop: frogoe init, frogoe add, frogoe run, frogoe lint,
  frogoe check, frogoe bundle, frogoe report, frogoe skills. `frogoe lint` is the fast
  static contract lint (stable finding codes, --json for the self-heal loop); `frogoe
  check` is the full gate — lint plus the headless Chrome sandbox (FPS, playability,
  HUD outline, audio recovery, phone-class throttle, screenshots). Also use when
  diagnosing scaffold, check, or bundle failures, or serving with live reload, phone
  QR, or a cloudflared tunnel.
---

# frogoe CLI

Run commands as `bun packages/cli/src/bin.ts <cmd>` from the repo (published:
`npx frogoe <cmd>`). Requires bun.

## References

| File | Read it to… |
| ---- | ----------- |
| `references/finding-codes.md` | look up every static finding code (stable, never renumbered) |
| `references/live-sandbox.md` | understand the live headless-browser lifecycle, held-failure rule, and the browser cache knobs (FROGOE_BROWSER_PATH, launch/protocol timeouts) |
| `references/bundle.md` | how externals dissolve into one HTML and the allowlist |
| `references/embed.md` | the card, the frogoe-card protocol, and dist/manifest.json |
| `references/vision.md` | `frogoe vision` — ASCII eyes for draw code (objects, frames, art) |

## Development loop

1. **Scaffold:** `frogoe init my-game` — boots a runnable folder (living stub game, BRIEF stub, pinned `.frogoe/`). `cd my-game`.
2. **Find the part:** before hand-writing HUD, look in the registry — `frogoe add fuel-gauge` copies a themeable block into `blocks/` and prints its bindings plus placement snippet. Hand-write only once nothing fits. This rule lives in `/frogoe-registry` too.
3. **See:** `frogoe vision` — your draw code as ASCII maps (SPRITES objects, gameplay frames, identity art). Agents that draw blind ship blobs; iterate on what you SEE (`references/vision.md`).
4. **Iterate:** `frogoe run` — live reload on every save, QR for the phone (safe-area only exists on real devices; test there before shipping). Phone on another network? `frogoe run --tunnel` serves a public cloudflared URL (auto-downloaded once, cached; reload survives SSE-less proxies via a version poll — ≤2s). Playtests are telemetered: fps dips, page errors and lock-screens print live in the terminal and persist to `.frogoe/sessions/*.jsonl` (local only — nothing leaves the machine). After a session: `frogoe report` — duration, fps mean, dips below 30 with their wall-clock moment, errors, hidden periods.
4. **Fast feedback:** `frogoe lint` — static only. Cheatsheet (details: `references/finding-codes.md`):
   - errors: `brief/*`, `folder/*`, `input/incremental-drag` (never `x += p.dx`)
   - warnings: `input/absolute-steering`, `layout/innerwidth-spawn`, `audio/suspended-only`, `game/loop-*`, `blocks/binding-orphan`

   In agent loops use `frogoe lint --json`; every finding carries `{code, file, line, severity, fix, recipe}` — read the fix, apply, re-run. One iteration heals.
6. **Gate:** `frogoe check` — the full gate: it reruns the static pass (incl. the authored `art/*` contract), then ALWAYS opens the live sandbox (boot → play → end → retry, twice; see `references/live-sandbox.md`). Exit 1 on errors. Do not prepend a redundant `lint` before it; do not ship without it passing.
7. **Ship:** `frogoe bundle` only after check passes — externals dissolve into one self-contained HTML, and the authored identity scenes render into `dist/assets/` (poster 1080×1920, icon 1024).
9. **Embed:** `frogoe embed` after bundle — the card (`dist/embed.html`: poster loading state + sandboxed game) and `dist/manifest.json`. Order is law: check → bundle → embed.

## Boundaries

- `lint` is the fast static half; `check` is the full gate and always includes the browser pass. The declared-palette contrast check is the static floor — rendered contrast arrives with the sandbox layer.
- `bundle` requires network for CDN assets (allowlist plus pin plus sha256); offline games bundle with zero fetches.
- **Never read the installed package's `dist/` directory** — it is bundled/minified code that wastes 50K+ tokens and teaches nothing. If you need to understand how the CLI works, the source is open at `github.com/frogoe/engine` under `packages/cli/src/`. If you need examples of game art, they are in `skills/frogoe-creative/references/art.md` (inline skeletons) — not in the binary.
- **Do not run `frogoe run` inside an agent loop** — it starts a dev server and blocks. Use `frogoe lint` / `frogoe check --fast` for iteration, `frogoe check` for the gate, and tell the human to run `frogoe run` on their phone for real-device testing.
