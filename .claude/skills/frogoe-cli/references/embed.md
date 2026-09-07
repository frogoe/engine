# Embed — the card and the manifest

`frogoe embed` turns a clean build into an embeddable unit. Order is law:
**check → bundle → embed** — embed refuses a missing `dist/index.html` or
any static error, because poster, icon and sha256 are downstream of a clean
build.

```
dist/
  index.html      the game artifact (bundler output, untouched)
  assets/
    poster.png    1080×1920 — rasterized from assets/poster.svg at bundle
    icon.png      1024×1024 — rasterized from assets/icon.svg at bundle
  embed.html      the card
  manifest.json   the feed's identity card
```

## The card (embed.html)

YouTube-embed model: the **authored poster** shows while the game boots and
fades when the relay reports `running` (prefers-reduced-motion respected).
No badge, no buttons — the game IS the card.

- The game payload (bundle + relay) rides as base64 inside an inert
  `<script type="application/octet-stream">` carrier; the loader decodes it
  into the iframe's `srcdoc`. One file, zero fetches.
- `iframe sandbox="allow-scripts"` — **no** `allow-same-origin`: the game
  runs at an opaque origin (UGC posture). `referrerpolicy="no-referrer"`,
  page CSP ends in `connect-src 'none'`.
- Poster/icon inline as `data:` URIs (loading state + favicon).

## The protocol (game → host, v1)

The relay (injected before `</body>` by embed) translates the contract's own
surfaces — `window.__frogoe.state` (`loading|playing|paused|over`) and the
`frogoe:finish` event — into card messages. It also marks the game's root
with the `frogoe-embed` class: games surface touch controls under it
(keyboards are unreliable inside iframes):

```
{v:1, source:"frogoe-card", type:"state", state:"loading"|"running"}
{v:1, source:"frogoe-card", type:"state", state:"over", score: <finite number>}
{v:1, source:"frogoe-card", type:"error"}        // nameless — unforgeable
```

Host → game (control, the hyperframes play/pause parity):
`{v:1, source:"frogoe-card-host", type:"control", action:"pause"|"resume"|"mute", muted?}` —
the relay validates version + tag + parent identity and only calls the
contract handle. Host API: `__frogoeCard.pause()/.resume()/.mute(bool)`.

Host-side rules (hyperframes discipline): validate `v` and the source tag,
match `event.source === iframe.contentWindow`, treat payloads as closed
(score only on `over`; `error` carries nothing). The relay posts `loading`
immediately on install (race-repair) and then reports state **changes** at
200 ms — `paused` maps to `running` (alive), a finish without a score
reports 0.

Card API for host pages: `window.__frogoeCard` (`{state, score, restart()}`),
`frogoe:card-state` CustomEvent, and messages forwarded to the card's own
parent. Boot timeout 10 s, loading timeout 45 s → `error` state.

## The manifest (manifest.json)

Deterministic (fixed key order, no timestamps): `title`, `description`
(first BRIEF paragraph, ≤280 chars), `verb`, `mood`, `fonts`,
`palette {bg,fg,accent,outline?}` (card theming), `contract` pin,
`entry`/`artifact` + `artifactSha256` (integrity), `poster`/`icon` paths
relative to dist/ (`null` honestly if absent). Feeds read it before running
anything; `dist/` is liftable whole.

## The embed survival checklist (lessons, each with its guard)

Every failure below happened; every guard is now permanent:

| Failure class | Guard (permanent) |
| --- | --- |
| Poster overlay swallows clicks before/after fade | `.off` sets `pointer-events: none`; the e2e clicks INSIDE the sandboxed frame with a real mouse and asserts the game received it (`__e2eTap`, runtime-injected — works for any card) |
| Keyboard dead in the iframe (focus lands on the card) | The card calls `frame.contentWindow?.focus()` on `running`; the e2e asserts `document.activeElement === #frame` |
| localStorage throws at the opaque origin | Games wrap storage in try/catch (`safeStore` pattern, frogoe-core → contract docs); the live sandbox exercises the same origin posture |
| Touch controls hidden when they matter / shown when they don't | Gate on the DEVICE (`@media (pointer: coarse)`) — it evaluates identically in direct pages and iframes; never on context guesses |
| Retry inside the sandbox (`location.reload()` on srcdoc) | Verified by the e2e restart path (`__frogoeCard.restart()` re-sets srcdoc) and by the real in-game retry button |
| A game that boots but cannot be PLAYED (input never wired) | `frogoe check` playability phase taps the game in the live sandbox; the card e2e taps the shipped card — both must move the world |
| Protocol races (host booted before the relay installed) | Relay posts `loading` immediately on install (race-repair); card boot/loading timeouts fail loudly |
| Control messages forged/unsafe | Closed action set + version + source tag + `event.source === parent`; relay only calls the contract handle, best-effort try/catch |
| Game crashes INSIDE the sandbox (opaque-origin traps like raw localStorage) | The card e2e asserts ZERO page errors — and `pageerror` demonstrably captures sandboxed-frame exceptions |

Repo maintainers: the card e2e (`bun run verify:art` in the engine repo)
drives boot → REAL INPUT → finish → restart on the fixture and both
example games — every card/relay/contract change must pass it. Game
authors: your gates are the normal pipeline (`frogoe check` → `frogoe
bundle` → `frogoe embed`); the embed guards above are built into those
commands.
