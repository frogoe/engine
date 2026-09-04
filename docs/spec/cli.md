# CLI spec — the agent's hands

**Status: LIVE (init/add/run/lint/check/bundle — check is the full gate: static + live sandbox).**

`frogoe <command>` — outcome-named, JSON-capable, zero config.

| Command       | Does                                                                                                                 | Machine output                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `init [name]` | scaffold the folder: BRIEF stub, index.html, game.js, .frogoe/ (from frogoe.json pin)                                | `--json` { path }                                    |
| `run`         | static server + QR for phone + reload on change; `--tunnel` adds a public cloudflared URL (phone on any network; reload survives SSE-less proxies via a version poll). Playtest telemetry: fps dips, errors, lock-screens print live + persist to `.frogoe/sessions/` | —                                                    |
| `check`       | contract lint + output measures (contrast vs BRIEF palette, verb-vs-handlers, canvas painted, zero runtime requests) | `--json` [{code, file, line, severity, fix, recipe}] |
| `report`      | last playtest session on one screen: duration, fps mean, dips below 30 with wall-clock moments, errors, hidden periods | —                                                    |
| `bundle`      | externals dissolve → dist/index.html (see bundler spec)                                                              | `--json` { artifact, bytes, hashes }                 |
| `add <block>` | copy a registry block into blocks/ + register bindings                                                                  | `--json` { files }                                   |

## Finding codes are stable and teach

Every finding: stable `code`, exact `file:line`, one-line `fix` shape, and a
`recipe` pointer. Agents self-heal in one iteration; humans heal while reading.
Exit code gates on `severity: error` only.

## DX acceptance test

A fresh agent, no context, `init` + one reference game → playable game in
< 5 minutes with ≤ 1 mistake, recovered from the error message alone. This test
gates 0.1.
