# Play — the agent's eyes + hands

`frogoe play [dir]` boots the game in headless Chrome and speaks JSONL
over stdio: **frames OUT** (palette-aware ASCII, the same cartography as
`frogoe vision` — canvas + DOM HUD), **input commands IN** (the
contract's semantic verbs). An agent can genuinely PLAY its game.

```
frogoe play examples/flappy --cols 96 --record session
→ {"legend":"bg '#4EC0CA' → .  … ramp @%&*8=+~;:,-^`'","version":"0.2.0"}
→ {"frame":"…","state":"paused","reason":"boot","t":0}
← {"tap":[195,400]}
→ {"frame":"…","state":"paused","reason":"tap","t":0.17,"finishes":[]}
```

## Time: step mode is the point

Default `--mode step` **pauses the game between commands** via the
contract's own `window.__frogoe.pause()` — the world is FROZEN while you
think (seconds, minutes, an LLM inference — the game waits), and
`{"step":30}` advances exactly half a second. Fast games become chess:
read the gap, compute the flap, step to the moment, act. `state` reads
`"paused"` while frozen — that is honest, not broken.

`--mode realtime` never pauses: for scripts and heuristics, where dying
IS data (difficulty pacing), not failure.

## Commands

| Command | Effect |
| --- | --- |
| `{"tap":[x,y]}` / `{"press":"Space"}` / `{"type":"cat"}` / `{"drag":[x1,y1,x2,y2]}` | contract input — each settles ~10 frames (override `--settle`), then a frame comes out |
| `{"step":30}` | advance exactly N frames (paused between in step mode) |
| `{"resize":[960,640]}` | change the viewport (free-size window doctrine) |
| `{"quit":true}` or stdin EOF | clean exit |

Unknown commands and bad JSON are reported as `{"error":…}` lines — the
session never crashes.

## Evidence

`--record <name>` logs every frame + input to
`snapshots/<name>.jsonl` (each row carries its `reason`) — diffable
session evidence, the seed of `frogoe certify`. Frames are the same
ASCII the tests read; `game.test.js`'s `game.view()` is the offline twin
(vector replay, deterministic asserts — see frogoe-core → testable
seam). Frames from Chrome are the eyes; asserts belong in tests.

## What it proves (and doesn't)

Frozen-time play proves mechanics, scoreability, fairness — the L2
semantic floor. It does NOT prove human-feasible reflexes: pacing is
measured by realtime deaths and, ultimately, the test_pool crowd.
