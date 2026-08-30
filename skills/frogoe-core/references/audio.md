# Audio on phones — the mobile lifecycle

Feed games run on phones first (iOS and Android), and desktop browsers gate
audio too. The rules below are universal unless marked iOS-only; every game
that synthesizes sound must respect all of them or audio "sometimes works,
sometimes goes quiet for ages".

## The three rules

1. **Create + resume the AudioContext inside a real user gesture** — on
   every phone AND desktop Chrome (autoplay policy). The contract fires
   `input.on("down")` synchronously inside the native `pointerdown`
   listener, and `input.on("up")` inside `pointerup` — both count as
   gestures. Anything called from `loop.update`/rAF does not.
2. **Resume anything that is not `"running"`.** Interruptions (screen lock,
   phone call, tab switch, headphone unplug) suspend the context
   everywhere; iOS additionally reports a non-standard `"interrupted"`
   state that a `state === "suspended"` check silently misses — the game
   goes quiet until the next full page reload, which looks like "random"
   audio loss.
3. **Silent-buffer unlock.** `resume()` alone is not always honored;
   playing a 1-sample silent buffer inside the gesture hard-unlocks the
   route.

## The pattern (copy this)

```js
const Sfx = {
  ctx: null,
  init() {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "running") return; // fast path: already live
      void this.ctx.resume();                    // suspended + interrupted
      const src = this.ctx.createBufferSource(); // silent-buffer unlock
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {}
  },
};

defineGame(({ input }) => {
  input.on("down", () => { Sfx.init(); /* ... */ });
  input.on("up", () => { Sfx.init(); }); // touchend is the gesture iOS trusts most
  // belt-and-braces: some iOS builds ignore resume() from pointer events
  // alone — the native paths below are honored most reliably
  for (const type of ["touchend", "click", "keydown"]) {
    document.addEventListener(type, () => Sfx.init(), { capture: true, passive: true });
  }
});
```

Call `Sfx.init()` on **every** `down` (and `up`): it is a no-op once
running, and every tap becomes a repair attempt after any interruption.

**The unlocking tap must itself be audible.** When a tone is requested
while the context is not yet running: call `init()`, then schedule the
note with a small lookahead (`t0 = ctx.currentTime + 0.08`) instead of
dropping it — the moment `resume()` lands inside that same gesture, the
note fires. Dropping it instead trains players to "tap the background
first", which reads as a bug. A note queued on a context that never
resumes dies with that context when it is closed/replaced — self-cleaning.

**The ready gate: the first gesture is a discrete TAP.** A swipe is the
worst-case unlock gesture (`pointermove` is not a standalone activation —
resume issued mid-swipe often only takes effect at `touchend`, while the
first slice was already scheduled into the frozen clock). Gate gameplay
behind a tap-to-start overlay: the tap unlocks audio in the gesture iOS
honors best, and the first swipe of the run already sounds. This is the
industry-standard tap-to-start screen doing double duty.

**The visibility kick.** iOS 17/18 can leave the context zombie-suspended
after the page returns from background even when `resume()` is honored —
a `suspend()` + `resume()` pair ~100ms after `visibilitychange → visible`
snaps it back (the fix Phaser ships since 3.88 for issue #6829):

```js
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !Sfx.ctx) return;
  setTimeout(() => {
    try { void Sfx.ctx?.suspend(); void Sfx.ctx?.resume(); } catch {}
  }, 100);
});
```

**Recreate a context that stays dead.** If the context is still not
running more than ~2s after gesture-scoped resume attempts, `close()` it
and create a fresh one inside the next gesture — Howler (`unload()`),
Phaser (`setAudioContext`) and pixi-sound (`close()+init()`) all ship
context recreation for exactly this.

## The sandbox measures recovery

`frogoe check --live` wraps the AudioContext constructors, injects an
interruption (suspend on every context — the iOS "interrupted" shape),
follows with real scripted input, and requires the game's own wiring to
have recovered: contexts still suspended → `live/audio-locked` (error).
The fault is injected; the recovery is measured, never simulated. The
static pass adds a matching signature check: `audio/suspended-only`
warns on `state === "suspended"` gates.

## What the production libraries do (measured from source)

| | events | unlock action | sound while suspended |
| --- | --- | --- | --- |
| Howler.js | touchstart, touchend, click, keydown (capture) | 1-sample silent buffer @22050 + resume() | queued until `resume` lands (`once('resume')` + playLock) |
| Phaser 3 | touchstart, touchend, mousedown, mouseup, keydown | resume() only | scheduled into the frozen clock — fires on resume |
| pixi-sound | mousedown, touchstart, touchend (capture) | 1-sample silent buffer @22050 + resume() | scheduled into the frozen clock — fires on resume |

All three check the non-standard iOS `"interrupted"` state; all three
ship context recreation; none of them drops sounds requested during the
locked state. The pattern above is their intersection plus the lookahead
so the unlocking tap itself is audible.

## The selection-UI bug it comes bundled with

A long-press on a page without `user-select: none` summons the phone's
text-selection UI mid-game — the loupe on iOS, selection handles on
Android. The tap cycle around that system UI is often what accidentally
resumes a stuck context ("sound came back when I selected text"). The game
must never show selection UI at all; `frogoe check` enforces it as
`folder/touch-select`:

```css
html, body {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none; /* kills the long-press callout too */
}
```

## Environment, not code

The iPhone's **ring/silent switch mutes WebAudio entirely** — by OS design,
no code overrides it (iOS-only hardware quirk). If a game is silent on one
phone but perfect on another, check the switch before reading the code.

## Notes

- Host muting: the platform dispatches `document` event `frogoe:mute`
  (`detail.muted`) and mirrors it on `window.__frogoe.muted`; games gate
  their own synth on it (see `contract.md`).
- Audio is the game's own concern. The platform has no audio noun by
  design — this file is the recipe, not an API.
