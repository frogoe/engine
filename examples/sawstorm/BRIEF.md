---
title: Sawstorm
verb: tap
mood: pixel-art panic — a storm of sawblades from the sky, dark red retro arcade
palette:
  bg: "#1a1424"
  fg: "#f2ecff"
  accent: "#ff3b3b"
fonts: Press Start 2P
---

A boxed arena, no timer — the score is the only number on screen. The player
moves freely left/right (on-screen buttons / arrows) and jumps + double-jump
somersaults (JUMP button / space); touching a wall mid-air bounces off it.
Sawblades drop from the sky with NO warning indicator, then FLOAT in straight
constant-speed diagonals, reflecting off the floor/walls/ceiling forever —
they never roll and never slow down, and they are all the same size. Jumping
over a sawblade makes it EXPLODE for +1 score — the only way to reduce arena
density. Pressure comes from the arena itself: when saws saturate the arena
cap (14) and the player goes ~5 seconds without a clear, the sky overflows —
SUDDEN DEATH, a brutal downpour until death, while the score keeps counting.
One life, best score via localStorage. Red = danger, white = safe.
