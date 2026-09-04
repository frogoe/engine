# Capability menu — what frogoe can bring to a game

One list, three readers. The **pitch round** speaks it before anyone reads it as a menu: each pitch names the capability or two its concept rides. The **intent layer** recommends from it — one or two rows the confirmed concept specifically calls for. The **build** uses it as a checklist for what could be added next.

Each row's last column reads **home → entry → what you get**: the owning skill, the exact doc or command to start from, and the artifact that comes back.

| Capability | Say it to the user as… | Home → entry → what you get |
| ---------- | ---------------------- | --------------------------- |
| **Palette & typography** — one declared palette (bg/fg/accent + optional outline) and one display font that locks the game's look | "a palette and font that make this game unmistakably yours" | `frogoe-creative` → `references/palettes.md` + `typography.md` → `BRIEF.md` palette + fonts |
| **HUD blocks** — 11 installable HUD parts (score, hearts, fuel, timer, game-over) themed from one parent rule | "ready-made HUD we can drop in and retheme" | `frogoe-registry` → `frogoe add <block>` → `blocks/<block>.html` + bindings |
| **Game feel & juice** — motion, easing, screen shake, hit stop, particle bursts, death and retry feel | "the game feel — hit feedback, juice, death and retry" | `frogoe-creative` → `references/game-feel.md` → `game.js` loop polish |
| **Audio** — gesture-unlocked WebAudio, resume after interrupted, SFX and ambience | "sound that survives phones — gesture unlock, no silent bugs" | `frogoe-core` → `references/audio.md` → `game.js` audio wiring |
| **Externals: three.js** — 3D scene inside the canvas, camera, lights | "real 3D inside the canvas — three.js" | `frogoe-core` → `references/externals.md` → `game.js` + importmap |
| **Externals: gsap** — timeline-grade tweening for HUD or canvas objects | "gsap for HUD and canvas motion" | `frogoe-core` → `references/externals.md` → `game.js` + importmap |
| **Externals: fonts** — Google Fonts inlined at bundle | "a display font that ships inside the artifact" | `frogoe-core` → `references/externals.md` + `frogoe-creative` → `typography.md` → `@font-face` in `dist/` |
| **Live dev loop** — run with QR, tunnel, playtest telemetry, check until clean | "live reload on phone plus contract checks" | `frogoe-cli` → `frogoe run / check / report` → `check` findings + `snapshots/` |
| **One-file artifact** — externals dissolved, single HTML, provenance banner | "one self-contained HTML — verified means played" | `frogoe-cli` → `frogoe bundle` → `dist/index.html` |

Offer, do not unload: the intent layer recommends the one or two rows the confirmed concept itself calls for, each traced to something in the brief, and asks once — the full table appears only when the user asks what else is possible.
