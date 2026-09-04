# The contract — every guarantee and every teaching error

~180 lines of platform. Source of truth: `packages/contract/src/contract.js`.

## The four nouns

| Noun            | Gives                                                                                                                | Guarantees                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `stage`         | `width/height`, `safe` (live insets), `play` (capped centered column: `left/right/center/width`), `ctx`, `refresh()` | DPR-capped canvas (≤2), notch-proof insets, identical challenge on every screen width                                |
| `input`         | `on("down"\|"drag"\|"up", fn)`, `pointer {x,y,dx,dy,down}`                                                           | unified touch+mouse, full cancel path (pointercancel/blur release the pointer), dx/dy anchor-relative                |
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
