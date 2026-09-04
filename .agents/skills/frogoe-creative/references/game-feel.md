# Game feel — motion, feedback, death

Feel is why a player retries. It lives in the sim layer (canvas), not the HUD.

## Motion

- Nothing linear, ever: ease-out for arrivals, ease-in for departures, a tiny
  overshoot (spring) for things that matter (score pop, door, catch).
- Ambient life in the READY state: drift the world, bob the actor — feed players
  never see a dead screen before the first tap.
- `prefers-reduced-motion`: blocks ship their own rules; keep custom motion
  behind the same query when it is decorative.

## Feedback

Every player-relevant event answers in the same frame:

| Event          | Minimum                                                     |
| -------------- | ----------------------------------------------------------- |
| pickup / score | sound + a small burst + HUD bump                            |
| hit / damage   | sound + flash + shake + HUD state (hearts pop)              |
| death          | freeze-frame ~60 ms + burst + sound, THEN the card          |
| retry press    | button pushes in (blocks do this) — plus your own tap sound |

Particles are squares/circles with velocity and drag — 5–20 of them, not 200.
Screen shake: 4–8 px, decays over ~300 ms, never shakes the HUD layer.

## Death and retry

- One tap anywhere retries (the card's button is the affordance, the whole screen
  is the target). Arm it ~400 ms after death so the death tap cannot skip the card.
- Show score, best, and NEW BEST (the card block does all three) — persistence
  via localStorage is the game's two lines.
- `finish(score)` before the card appears — the host hears the run ended.

## Sound

WebAudio synth is enough: pop (rising sine ~90 ms), hit (falling saw + noise),
death (long fall), combo (pitch climbs with the streak). Unlock on first touch,
respect `frogoe:mute`. Keep one register per game — cute is high-pitched, dread
is low; never both.
