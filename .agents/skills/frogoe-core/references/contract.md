# The contract — every guarantee and every teaching error

~180 lines of platform. Source of truth: `packages/contract/src/contract.js`.

## The four nouns

| Noun            | Gives                                                                                                                | Guarantees                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `stage`         | `width/height`, `safe` (live insets), `play` (capped centered column: `left/right/center/width`), `ctx`, `refresh()` | DPR-capped canvas (≤2), notch-proof insets, identical challenge on every screen width                                |
| `input`         | `on("down"\|"drag"\|"up"\|"move"\|"key", fn)`, `pointer {x,y,dx,dy,down}`, `keys: Set<code>`                       | unified multi-touch (per-touch snapshots with `id`; `pointer` mirrors the FIRST touch), keyboard edges via `on("key")` with OS repeat suppressed, held codes in `input.keys` (blur-cleared), hover via `on("move")`, full cancel path, dx/dy anchor-relative |
| `loop`          | you fill `loop.update(dt)` + `loop.render(ctx)`                                                                      | fixed 60 Hz steps, dt clamped, pauses when hidden/blur, resumes cleanly                                              |
| `finish(score)` | report the run's end                                                                                                 | fires once, flips `__frogoe.state` to `over`, broadcasts a `frogoe:finish` DOM event — hosts bring their own adapter |

## frogoe:finish — the host seam

The contract is host-blind. `finish()` broadcasts a standard DOM event:

```js
document.addEventListener("frogoe:finish", (e) => {
  // e.detail.score — your shell's business now
});
```

Any host wraps this the same way — SwiftUI's WKWebView, Flutter's WebView,
Kotlin's Android WebView, an iframe feed parent (`window.parent.postMessage`)
— each injects its own adapter and relays. The engine never names a host and
ships no host-specific code.

## The input surface (contract 0.2.0)

**Pointer — multi-touch with per-touch snapshots.** Handlers receive
`{x, y, dx, dy, down, id}`; every touch keeps its own anchor, so two thumbs
never fight over one dx. `input.pointer` mirrors the FIRST simultaneous touch
— single-pointer games poll it and never see the second finger:

```js
input.on("down", (p) => {
  const button = hitTest(p.x, p.y); // route p.id → whatever it landed on
  if (button) fingers.set(p.id, button);
});
input.on("up", (p) => {
  const button = fingers.get(p.id);
  if (button) fingers.delete(p.id); // this finger's release, not any finger's
});
```

NEVER hand-roll `setPointerCapture` + per-button listener stacks for pads —
the contract's cancel/blur discipline already releases every touch.

**Keyboard — edges + held state.** `input.on("key")` fires once per press
(OS auto-repeat is suppressed): `{key, code, dir, mods}`. `code` is the
physical, layout-independent identity (`"KeyW"` — WASD survives AZERTY);
`key` is the display glyph. Held state is a poll surface:

```js
input.on("key", (k) => {
  if (k.dir === "down" && k.code === "Space") jump();
});
loop.update = (dt) => {
  const dir = (input.keys.has("ArrowLeft") ? -1 : 0) + (input.keys.has("ArrowRight") ? 1 : 0);
};
```

Blur fires a synthetic keyup per held key and clears the set — alt-tab can
never leave a stuck key. Modifier chords (Ctrl/Cmd/Alt) and editable targets
pass through natively; Space/arrows never scroll the page. Touch screens
never fire keydown: a `type`-verb game pairs this with the registry's
`hud-keyboard` block (its presses are real KeyboardEvents, the contract
hears them natively).

**Hover — `input.on("move")`** fires for pointer movement with no button
held, anchored to the previous hover point. Only registers when a handler
exists; never preventDefaulted. Desktop previews, aim guides.

**Strict events.** `input.on("typo")` throws a TypeError listing the valid
events — a silent no-op would ship dead handlers with zero errors.

## window.__frogoe — the host's handle (never touched by game code)

```js
__frogoe.state; // "loading" | "playing" | "paused" | "over"
__frogoe.pause() / resume(); // feed scrolls past → pause; back → resume
__frogoe.mute(bool); // broadcasts "frogoe:mute" on document — audio recipes listen
__frogoe.version; // contract version, matches frogoe.json pin
```

Published by the platform at boot — guaranteed by construction, not by game
cooperation. This is what lets a feed control a game the way a video player
controls an mp4.

## Teaching errors (fail fast, fix-forward)

| Trigger                        | Error shape                                   |
| ------------------------------ | --------------------------------------------- |
| no `<canvas id="c">`           | names the exact element the contract boots on |
| closure fills no `loop.update` | shows the assignment shape + dt semantics     |
| closure fills no `loop.render` | shows the assignment shape                    |

Every error names the fix inline — a game author (human or agent) recovers in one
read, without docs.

## What the contract deliberately does NOT do

No HUD drawing. No fonts. No colors. No audio. No results screen. No widget API.
Anything visible comes from game code or registry blocks — the platform having a
visual opinion is classified as a defect (this rule is paid for).
