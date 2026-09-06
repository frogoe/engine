# Embed spec — the card, the protocol, the manifest

**Status: LIVE (`frogoe embed`; requires check → bundle first).**

A clean build becomes an embeddable unit in `dist/`:

```
dist/
  index.html      game artifact (bundler output, embed never touches it)
  assets/
    poster.png    1080×1920 — rendered from authored assets/poster.js at bundle
    icon.png      1024×1024 — rendered from authored assets/icon.js at bundle
  embed.html      the card
  manifest.json   the feed's machine-readable identity card
```

## The card

YouTube-embed model: the authored poster is the loading state; it fades
when the game reports `running` (`prefers-reduced-motion` respected). No
badge, no buttons, no host chrome — the game IS the card.

- Payload: `dist/index.html` + the relay script, base64, inside an inert
  `<script type="application/octet-stream">` carrier; the loader decodes it
  into the iframe's `srcdoc`. One file, zero fetches.
- Sandbox: `sandbox="allow-scripts"` only — **no** `allow-same-origin`
  (opaque origin; UGC posture, stricter than the hyperframes player which
  needs same-origin for media adoption). `referrerpolicy="no-referrer"`.
- Page CSP: `default-src 'none'; script-src 'unsafe-inline';
  style-src 'unsafe-inline'; img-src data:; font-src data:; media-src
  data:; connect-src 'none'` — srcdoc inherits it, so the game artifact
  must be fully dissolved (guaranteed by the bundler's self-scan).
- Poster/icon inline as `data:` URIs (loading state + favicon).
- Boot timeout 10 s, loading timeout 45 s → `error` state (probe-timeout
  pattern from the hyperframes player).

## The protocol — game → host, v1

```
{v:1, source:"frogoe-card", type:"state", state:"loading"|"running"}
{v:1, source:"frogoe-card", type:"state", state:"over", score: <finite>}
{v:1, source:"frogoe-card", type:"error"}
```

## The protocol — host → game control, v1

```
{v:1, source:"frogoe-card-host", type:"control", action:"pause"}
{v:1, source:"frogoe-card-host", type:"control", action:"resume"}
{v:1, source:"frogoe-card-host", type:"control", action:"mute", muted: <boolean>}
```

The relay validates version + source tag + frame identity
(`event.source === window.parent`) and only ever calls the contract's
own handle (`__frogoe.pause/resume/mute`) — never game code, best-effort
by design (control can never crash a game). Host API:
`__frogoeCard.pause() / .resume() / .mute(bool)`. This is the
hyperframes play/pause/set-muted parity, minus seek (games have no
timeline).

- The **relay** (injected by embed before `</body>`) translates the
  contract's own surfaces: `window.__frogoe.state`
  (`loading|playing|paused|over`) and the `frogoe:finish` event.
  It posts `loading` immediately on install (race-repair — hyperframes
  `ready` pattern), then polls at 200 ms and reports **changes only**.
  `paused` maps to `running` (alive); a finish without a captured score
  reports `0` (the contract's own `Number(score) || 0`).
- Host validation: `v === 1`, `source === "frogoe-card"`,
  `event.source === iframe.contentWindow`, closed payloads — score exists
  only on `over` and must be finite; `error` carries no payload (a
  nameless, unforgeable failure signal; no UGC text reaches host logs).
- Restart = fresh `srcdoc` (a reload); pause/resume/mute ride the control channel above.
- Card API for host pages: `window.__frogoeCard` `{state, score,
  restart(), pause(), resume(), mute(bool), destroy()}`,
  `frogoe:card-state` CustomEvent, and child messages
  forwarded to the card's own parent. On `running` the card focuses
  the frame (cross-origin `.focus()` is permitted) so keyboard games
  work immediately, and replays the mute state (race-replay — the
  frame's listener may not exist at boot time).
- `destroy()` tears everything down: timers cleared, pause sent,
  srcdoc emptied, DOM removed, state set to `"destroyed"` — no
  orphaned listeners or rAF after removal (the hyperframes
  disconnectedCallback lesson).
- `<frogoe-card>` custom element ships in every embed.html — drop-in
  Shadow-DOM wrapper with observed attributes (`src`, `width`,
  `height`), state/score/manifest getters, pause/resume/mute/restart
  methods, full teardown on `disconnectedCallback`.
- Protocol capabilities (monotonic, never removed): `state`, `error`,
  `control-pause`, `control-resume`, `control-mute`,
  `card-state-event`, `destroy`.

## The manifest

Deterministic: fixed key order, no timestamps. Feeds read it before
running anything; paths are relative to `dist/` so the folder lifts whole.

| Field | Source |
| ----- | ------ |
| `title`, `verb`, `mood`, `fonts`, `palette {bg,fg,accent,outline?}` | BRIEF.md |
| `description` | first non-empty BRIEF paragraph, collapsed, ≤280 chars |
| `contract` | frogoe.json pin (default `0.1.0`) |
| `entry`, `artifact` | `index.html` |
| `artifactSha256` | sha256 of dist/index.html (bundler provenance) |
| `poster`, `icon` | `assets/poster.png`, `assets/icon.png` — `null` honestly when absent |
| `posterSha256`, `iconSha256` | media integrity — feeds verify what they lift (content-addressing, the hyperframes precedent) |

## Command discipline

`embed` refuses: missing `dist/index.html` (run bundle) and any static
check error (run check). Order is law: **check → bundle → embed**.
