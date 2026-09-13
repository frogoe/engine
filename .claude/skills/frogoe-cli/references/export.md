# Export — native app projects from the verified artifact

**Status: LIVE (`frogoe export desktop|ios|android`; `frogoe run desktop|ios|android`).**

`frogoe export [desktop|ios|android]` turns the game into a buildable native app
project in `export/` — one Tauri 2 shell with the artifact embedded
(`web/index.html`); `ios`/`android` ATTACH native targets to it
(`src-tauri/gen/apple|android`) without template changes. The mobile entry
point was declared from day one.

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
frogoe export ios       # attach gen/apple (Xcode project; simulator needs no signing)
frogoe export android  # attach gen/android (Gradle; needs Android SDK + Java)
frogoe run ios          # dev server + simulator — hot reload in the iOS shell
frogoe run android     # dev server + emulator/device (devUrl per target: 10.0.2.2 vs LAN)
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

## Mobile specifics

- `tauri ios/android init` runs only when `gen/apple|android` is MISSING —
  your plist/entitlement/gradle edits survive re-exports; `--force` regenerates
- icons: after attach, one `tauri icon` pass fills the iOS AppIcon (19 sizes)
  and the Android launcher set from `assets/icon.js`'s 1024 render
- `frogoe run ios` boots the picked simulator itself (tauri won't); the
  simulator reaches the dev server via localhost
- `frogoe run android` picks the devUrl per target (emulator → `10.0.2.2`,
  device → LAN) and requires `adb devices` to list one
- signing/store: per-target generated READMEs (`export/README-ios.md`,
  `export/README-android.md`) — agent-completes, credentials via env/config
  files that never live in the repo

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

`export/frogoe-export.json` carries the artifact's sha256 — `shasum -a 256 web/index.html` must match `artifactSha`. The shell has zero plugins,
zero invoke commands, one `core:default` capability, and the embed doctrine's
CSP: the game cannot cross into Rust, and nothing loads off-disk.

## Why webview performance is fine here

frogoe games are fixed-step canvas games — the surface a webview must provide
is a composited canvas, which WKWebView/WebView2/WebKitGTK hardware-accelerate.
The perf ceiling was already measured: `frogoe check` gates FPS under 4× CPU
throttle in a real browser. verified == played holds inside the shell.
