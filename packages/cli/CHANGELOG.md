# Changelog

## [0.2.2](https://github.com/frogoe/engine/compare/v0.2.1...v0.2.2) (2026-08-30)


### Bug Fixes

* **cli:** --version reads package.json — inlined at build time ([4127ecd](https://github.com/frogoe/engine/commit/4127ecdd56ca39e4437992a32c4659c65d654b6b))

## [0.2.1](https://github.com/frogoe/engine/compare/v0.2.0...v0.2.1) (2026-08-30)


### Bug Fixes

* **cli:** package metadata for provenance — repository, bugs, homepage ([9c4c307](https://github.com/frogoe/engine/commit/9c4c3076a4cd524e9d11d43842222715887f8b4c))

## [0.2.0](https://github.com/frogoe/engine/compare/v0.1.0...v0.2.0) (2026-08-30)


### Features

* agent integration and unified docs ([6ebb871](https://github.com/frogoe/engine/commit/6ebb8717f896ec720c8b8878bfe0cdc18ac7061c))
* **cli:** bundle — externals dissolve into one self-contained html ([ec7f3b0](https://github.com/frogoe/engine/commit/ec7f3b045feda343ad6b4956831b841957d0c2bb))
* **cli:** live check v0.2 — full lifecycle sandbox (boot → play → end → retry ×2) ([7e84ea3](https://github.com/frogoe/engine/commit/7e84ea3266a7bd586ba67a6537329123285f26fc))
* **cli:** live/audio-locked — the sandbox injects an interruption and measures recovery ([0291001](https://github.com/frogoe/engine/commit/0291001a1832f0b9eae9d4df90b38d9584790665))
* **cli:** live/fps-throttled — the ladder replays under phone-class cpu ([74a5d30](https://github.com/frogoe/engine/commit/74a5d30178ee8543616dad8469edc9c4e0c1883c))
* **cli:** node-ready publish architecture — bin guard, tsup dist, hono node-server ([a737707](https://github.com/frogoe/engine/commit/a73770789c199f459a250930335c1c9d6fc29220))
* **cli:** phone-anywhere dev loop — adaptive reload + owned cloudflared tunnel ([048c16a](https://github.com/frogoe/engine/commit/048c16ac930ef262c1f018df4b1d3fc2056da750))
* **cli:** playtest telemetry — fps dips, errors and lock-screens, live + reportable ([178a3f7](https://github.com/frogoe/engine/commit/178a3f70e4059d8b634c004af9900076e0b598b5))
* **cli:** smart add — auto-inject block CSS+markup into index.html ([6ede10e](https://github.com/frogoe/engine/commit/6ede10e687630445efaf1cee12df7a3c0b58b11f))
* **examples,audio:** the phone-audio recipe, researched + measured ([39ad25d](https://github.com/frogoe/engine/commit/39ad25d9465ac37787f78802fd79e484a6c666b1))
* game-native live check + flappy chick at flappy-bird quality ([1a239e5](https://github.com/frogoe/engine/commit/1a239e5d1c64e9e986c15347f12333b9d5fd024b))
* **lint:** extract @frogoe/lint — pure static checks, zero browser deps ([1abb33a](https://github.com/frogoe/engine/commit/1abb33a7f61b100102a3c706531cb617657caa35))
* **lint:** folder/touch-select + audio/suspended-only — phone-first shell checks ([5a1a7a4](https://github.com/frogoe/engine/commit/5a1a7a4ecb4c366ae08650c3e477d405cf9c39ec))
* npm publish readiness — single 'frogoe' package + stale refs fixed ([fc90ca1](https://github.com/frogoe/engine/commit/fc90ca133cdb1f349bb7d193d56fe458c241139f))


### Bug Fixes

* **cli:** bin path without ./ prefix — npm pack dropped the entry as invalid ([d125935](https://github.com/frogoe/engine/commit/d125935e8947de6178762ff4efbd834d46deb72d))
* **cli:** dev server ignores tool output — snapshot writes no longer trigger SSE reloads ([8fc3758](https://github.com/frogoe/engine/commit/8fc37581149aefeaef5e40ed8f34574a5f6563db))
* **cli:** hud → blocks — add writes blocks/, check reads blocks/ only ([1058787](https://github.com/frogoe/engine/commit/1058787f0e19893ccc69d31968cf6309c85be6c0))
* **cli:** init --force never overwrites game.js or index.html; center-sampling for canvas check ([a84db08](https://github.com/frogoe/engine/commit/a84db0866fad53a67dfa844c5540e716736aad8d))
