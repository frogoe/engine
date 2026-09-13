# Exported frogoe game — finishing guide

This directory is a complete, buildable [Tauri 2](https://v2.tauri.app) project
with your game bundled inside (`src-tauri/web/index.html`, injected by
`frogoe export`). Everything deterministic is already done. What remains
needs YOUR credentials — that part is yours (or your agent's).

## Toolchain (once per machine)

- [Rust](https://rustup.rs) (`rustup`, stable) — required on every OS
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Windows: [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on Win 11) + MSVC build tools via `rustup` default host
- Linux: `libwebkit2gtk-4.1-dev` etc. — see Tauri prerequisites docs

## Build

```bash
bun install        # once — installs @tauri-apps/cli
bun tauri build    # compiles Rust + bundles your OS installers
```

Outputs land in `src-tauri/target/release/bundle/`:

- macOS: `macos/<App Name>.app` and `dmg/<App Name>_<version>_aarch64.dmg`
- Windows: `msi/`, `nsis/`
- Linux: `deb/`, `rpm/`, `appimage/`

Unsigned macOS apps run on the building machine only. To distribute:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
bun tauri build
```

(`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` enable notarization —
Tauri reads them from the environment; nothing is stored in this project.)

## Development loop

`frogoe run desktop` (from the game folder) regenerates this project's dev
config to point at the live dev server and runs `bun tauri dev` — edits to
`game.js` hot-reload inside the desktop shell.

## Tool-owned files

`tauri.conf.json`, `Cargo.toml`, `src/**`, `capabilities/**`, `web/**`,
`icons/**`, `package.json`, and `frogoe-export.json` are managed by
`frogoe export`. Re-running export refreshes them — EXCEPT files you have
edited, which are skipped (listed in the export output) unless you pass
`--force`. Anything you add yourself is yours.

## Verifying the artifact

`frogoe-export.json` records the sha256 of the bundled artifact. If you
want to confirm the app carries exactly what `frogoe bundle` produced:

```bash
shasum -a 256 web/index.html   # compare against artifactSha
```
