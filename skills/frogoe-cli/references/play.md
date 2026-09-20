# Play — the agent's eyes + hands

`frogoe play [dir]` boots the game in headless Chrome and speaks JSONL
over stdio: **frames OUT** on a steady screen-share cadence, **input
commands IN** (the contract's semantic verbs). An agent can genuinely
PLAY its game — and an LLM in `--mode step` plays like chess, because
the world is frozen while it thinks.

```
frogoe play examples/flappy --cols 96 --fps 2 --record session
→ {"legend":"bg '#4EC0CA' → . … ramp @%&*8=+~;:,-^`'","version":"0.2.0"}
→ {"frame":"HUD Score 0 …\n…map…","gate":"ready","score":"0","state":"playing","reason":"tick","t":0.5}
← {"click":"[data-block-play]"}
→ {"frame":"…","gate":"run","score":"1","finishes":[],"reason":"tick","t":1.0}
```

## Three eye channels per frame

| Channel | What | Use |
| --- | --- | --- |
| `live` | the game's `live()` coordinate snapshot (module export, frogoe-core → live()) | exact numbers — decide from these when present |
| `frame` | the canvas ASCII map (+ HUD text first line) | visual context, universal floor |
| `gate`/`score`/`state`/`finishes` | DOM/contract ground truth | facts, never infer them from glyphs |

## Recap: the expedition's product

`frogoe recap [dir] [--session name]` analyzes a recorded session
(`snapshots/<name>.jsonl`) into machine facts — started? actions?
deaths? retry? score trail? errors? — plus **anomaly detectors**:
machine-checkable bug signals over the evidence. The AI that played
(or reads it) examines each machine anomaly, adds the ones machines
cannot see, and they become tests. Recap is the AUTHOR'S input, never
a check gate.

Detectors (conservative by design — they no-op when their channel is
absent, so unknown games never produce false positives):

| code | catches | needs |
| --- | --- | --- |
| `hazard-overlap-no-death` | player inside a hazard ≥2 frames with no death — collision that doesn't collide (the AABB class) | `live()` with `kind:"hazard"` entities |
| `position-teleport` | >250px in one frame with no gate change or death | `live()` |
| `player-out-of-bounds` | player outside the viewport (+40px sprite margin) | `live()` |
| `world-frozen-despite-input` | "playing", position+score unchanged ≥4s while actions land | `live()` + actions |
| `input-never-landed` | ≥3 actions, zero observable effect | `live()` or score |
| `score-regression` | displayed score decreases mid-run (resets after death are legit) | score |
| `game-over-without-finish` | state "over" but finish() never fired | ground truth |
| `error-cluster` | the same session error ≥3 times | errors |

## Read the GROUND TRUTH first, the map second

Every frame carries DOM facts as data — do NOT infer them from the ASCII
(canvas heuristics about DOM furniture lie; the title was never IN the
canvas):

- **`gate`**: `"ready"` (start screen up) | `"run"` — drive
  `[data-block-play]` / `[data-block-retry]` by SELECTOR
- **`score`**: the live score text; **`finishes`**: score(s) of each
  death (fires once per run)
- **`state`**: contract state (`playing` / `paused` / `over`)
- The frame's first line is the flattened HUD text; the rest is the
  canvas map — use the map for what it is for: WHERE things are (bird
  cluster, saw discs, pipe gaps)

## Time: step mode is the point

Default `--mode step` **pauses the game between commands** via the
contract's own `window.__frogoe.pause()` — the world is FROZEN while you
think (an LLM inference is fine; the game waits), `{"step":30}` advances
exactly half a second. Fast games become chess. `--mode realtime` never
pauses and streams at `--fps` (default 2): for scripts and heuristics —
an LLM's raw latency will die there, and that death is honest.

## Commands

| Command | Effect |
| --- | --- |
| `{"tap":[x,y]}` / `{"press":"Space"}` / `{"type":"cat"}` | contract input — immediate in realtime, after a settle in step mode |
| `{"hold":["ArrowLeft",30]}` | key DOWN for N frames, then up — steering (platformers read `input.keys` continuously) |
| `{"click":"[data-block-retry]"}` | selector click — buttons by NAME, never by guessed pixels |
| `{"step":30}` | advance exactly N frames (step mode: then freeze again) |
| `{"resize":[960,640]}` | change the viewport (free-size window doctrine) |
| `{"quit":true}` or stdin EOF | clean exit — retry buttons reload the page; the session survives (eyes reinstall per navigation) |

Bad JSON and unknown commands return `{"error":…}` lines — the session
never crashes. `--record <name>` writes `snapshots/<name>.jsonl` (every
frame + input, each row carries its `reason`): diffable session evidence.
`--headed` opens a REAL Chrome window — watch yourself play.

## The agent workflow (how a coding agent drives this)

1. **Interactive drive (short games, step mode):** run `frogoe play` as
   a background process with piped stdio; per frame: read `gate`/`score`
   → read the map for geometry → emit one command. Frozen time means
   latency is irrelevant.
2. **Brain authoring (the natural pattern):** write a small policy
   script (see the engine repo's `scripts/agent-player.mjs` for the
   shape: ground-truth state machine + spatial map reading), run it with
   `--record`, then read the evidence JSONL and ITERATE on the brain —
   the same loop as writing code against tests.
3. **Verdict:** a session proves gameplay only when it cycles (run →
   death → retry → run) AND the score rose above zero. Survival alone
   can be luck; points are not.

## Limits, stated plainly

- The map is semantic, not pretty — pixel-beauty stays with
  `frogoe vision`; small canvas text (falling words) is NOT readable in
  live frames (test stubs render text as real characters via
  `game.view()` — live streams cannot)
- An LLM in realtime mode dies to its own latency — use step mode, or
  author a brain
- WebGL canvases fall back to screenshots (flickier in `--headed`)
