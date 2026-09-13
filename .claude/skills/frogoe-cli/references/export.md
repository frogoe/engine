# Export — native app projects from the verified artifact

**Status: LIVE (`frogoe export desktop`; `frogoe run desktop`).**

`frogoe export [desktop]` turns the game into a buildable native app project in
`export/` — a Tauri 2 shell with the artifact embedded (`src-tauri/web/index.html`).
Desktop (macOS/Windows/Linux) ships now; iOS/Android attach to the SAME project
(`tauri ios/android init`) without template changes — the mobile entry point is
declared from day one.

## The division of labor (load-bearing)

The CLI does everything deterministic: bundles the freshest verified artifact,
fills the shell templates, injects the artifact, generates every platform icon
from `assets/icon.js`'s 1024 render (one `bun tauri icon` pass), records
integrity hashes. What remains needs the CREATOR's credentials — signing,
store submission — and lives in the generated `export/README.md`. An agent
(opencode, Claude Code, …) completes those steps by following that README.
The CLI never touches credentials.

## Commands

```bash
frogoe export desktop   # bundle → fill → payload → icons → export/ (+ README next steps)
frogoe export --force   # overwrite creator-edited tool files (they are otherwise KEPT, listed)
frogoe export --no-bundle  # payload refresh from dist/ as-is
frogoe run desktop      # dev server + bun tauri dev — game.js edits hot-reload in the native shell
```

## Prerequisites (the teaching errors point here)

- **Rust** via [rustup](https://rustup.rs) — required on every OS (`frogoe run desktop` checks first)
- macOS: Xcode Command Line Tools
- Windows: WebView2 (preinstalled on Win 11)
- Linux: webkit2gtk-4.1 dev packages (Tauri prerequisites doc)

## Ownership inside export/

Tool-owned (`frogoe-export.json` records sha256 of every file): `package.json`,
`README.md`, `src-tauri/**`, `frogoe-export.json`. Re-export refreshes them —
**except files whose hash drifted** (creator edits): those are skipped and
listed; `--force` overwrites. Creator-added files are never touched. The
dev loop (`frogoe run desktop`) restores whatever conf bytes were on disk
when it exits — creator edits survive it.

## appId (required)

`frogoe.json` gains `"appId": "com.yourname.yourgame"` — reverse-DNS, at least
two lowercase segments. It becomes the bundle identifier on every platform.
`"version"` is optional (default `"1.0.0"`).

## Finishing (agent-completes — from the generated README)

```bash
cd export
bun install
bun tauri build          # outputs in src-tauri/target/release/bundle/
```

macOS distribution: `export APPLE_SIGNING_IDENTITY="Developer ID Application: …"`
before build; `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` enable notarization.
All via environment — nothing is stored in the project.

## Integrity (no-cheat)

`export/frogoe-export.json` carries the artifact's sha256 — `shasum -a 256
src-tauri/web/index.html` must match `artifactSha`. The shell has zero plugins,
zero invoke commands, one `core:default` capability, and the embed doctrine's
CSP: the game cannot cross into Rust, and nothing loads off-disk.

## Why webview performance is fine here

frogoe games are fixed-step canvas games — the surface a webview must provide
is a composited canvas, which WKWebView/WebView2/WebKitGTK hardware-accelerate.
The perf ceiling was already measured: `frogoe check` gates FPS under 4× CPU
throttle in a real browser. verified == played holds inside the shell.
