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
| `references/live-sandbox.md` | understand the live headless-browser lifecycle and held-failure rule |
| `references/bundle.md` | how externals dissolve into one HTML and the allowlist |

## Development loop

1. **Scaffold:** `frogoe init my-game` — boots a runnable folder (living stub game, BRIEF stub, pinned `.frogoe/`). `cd my-game`.
2. **Find the part:** before hand-writing HUD, look in the registry — `frogoe add fuel-gauge` copies a themeable block into `blocks/` and prints its bindings plus placement snippet. Hand-write only once nothing fits. This rule lives in `/frogoe-registry` too.
3. **Iterate:** `frogoe run` — live reload on every save, QR for the phone (safe-area only exists on real devices; test there before shipping). Phone on another network? `frogoe run --tunnel` serves a public cloudflared URL (auto-downloaded once, cached; reload survives SSE-less proxies via a version poll — ≤2s). Playtests are telemetered: fps dips, page errors and lock-screens print live in the terminal and persist to `.frogoe/sessions/*.jsonl` (local only — nothing leaves the machine). After a session: `frogoe report` — duration, fps mean, dips below 30 with their wall-clock moment, errors, hidden periods.
4. **Fast feedback:** `frogoe lint` — static only. Cheatsheet (details: `references/finding-codes.md`):
   - errors: `brief/*`, `folder/*`, `input/incremental-drag` (never `x += p.dx`)
   - warnings: `input/absolute-steering`, `layout/innerwidth-spawn`, `audio/suspended-only`, `game/loop-*`, `blocks/binding-orphan`

   In agent loops use `frogoe lint --json`; every finding carries `{code, file, line, severity, fix, recipe}` — read the fix, apply, re-run. One iteration heals.
5. **Gate:** `frogoe check` — the full gate: it reruns the static pass, then ALWAYS opens the live sandbox (boot → play → end → retry, twice; see `references/live-sandbox.md`). Exit 1 on errors. Do not prepend a redundant `lint` before it; do not ship without it passing.
6. **Ship:** `frogoe bundle` only after check passes — externals dissolve, one self-contained HTML.

## Boundaries

- `lint` is the fast static half; `check` is the full gate and always includes the browser pass. The declared-palette contrast check is the static floor — rendered contrast arrives with the sandbox.
- `bundle` requires network for CDN assets (allowlist plus pin plus sha256); offline games bundle with zero fetches.
