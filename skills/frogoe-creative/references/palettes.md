# Named palettes

Starting points — declare one in BRIEF.md, then let the game bend it. Each entry:
bg / fg / accent + the mood it serves.

| Name        | bg        | fg        | accent    | Mood                         |
| ----------- | --------- | --------- | --------- | ---------------------------- |
| arcade-neon | `#0b0e1a` | `#eaf2ff` | `#ffd166` | cabinets, coins, high scores |
| crt-amber   | `#140f06` | `#ffd9a0` | `#ff9d2e` | retro terminals, radars      |
| cozy-pastel | `#fdf6ec` | `#4a3b32` | `#ff8f6b` | puzzles, baking, gardens     |
| deep-sea    | `#071522` | `#d7ecf5` | `#4dd8ff` | divers, bubbles, pressure    |
| volcano     | `#1a0f0d` | `#ffe9d4` | `#ff7a3d` | climbing, heat, urgency      |
| forest-dusk | `#101a12` | `#e3f0dc` | `#9be564` | fireflies, stealth           |
| candy       | `#fff1f6` | `#572a3a` | `#ff5d8f` | match-3, sweets, combo joy   |
| noir        | `#0c0c0e` | `#e8e8ec` | `#d3b062` | detectives, one accent lamp  |
| sunrise-run | `#2b1b3d` | `#ffedd8` | `#ff9e5e` | endless runners, dawn        |

## Using one

```yaml
# BRIEF.md
palette:
  bg: "#1a0f0d"
  fg: "#ffe9d4"
  accent: "#ff7a3d"
```

Derive two more tokens from the family (no new hues):

- `readout` — a dimmed fg for secondary state (`color-mix(in srgb, fg 62%, bg)`)
- `danger` — the accent pushed toward warning within the same warmth

```css
.hud {
  --hud-accent: #ff7a3d; /* brief accent */
  --hud-fg: #ffe9d4; /* brief fg */
  --hud-outline: #241005; /* near-bg — sticker depth, never pure black */
}
```

Theme the HUD layer from these (see frogoe-core → hud-bindings). The
palette is a promise: `check` measures the shipped HUD pixels against it,
theme-lock forbids any screen inventing a hue outside it, and the rotation
rule says never ship the same family twice in a row in a feed.
