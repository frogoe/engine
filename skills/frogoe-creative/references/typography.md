# Typography for games

One display voice per game, chosen from the mood. Numbers are the HUD's
heroes — set them like it.

## Voice → mood table

| Mood                       | Voice                      | Examples (bundled at build)       |
| -------------------------- | -------------------------- | --------------------------------- |
| comedy / party / kids      | chunky rounded             | Fredoka, Baloo 2, Luckiest Guy    |
| arcade / retro cabinet     | pixel or terminal          | Press Start 2P, VT323, Silkscreen |
| cockpit / tactics / sci-fi | mono, tabular              | IBM Plex Mono, Space Mono         |
| cozy / editorial / quiet   | humanist sans or serif     | Quicksand, Lora (sparingly)       |
| horror / noir              | condensed or high-contrast | Oswald, Playfair (title only)     |

## Rules

- ONE display voice. A second family is allowed only as a utility mono for
  numbers (e.g. chunky display + mono timer).
- **Banned as defaults**: `system-ui` as the identity voice, Inter/Roboto/
  Arial/Open Sans anywhere, and the LLM-favorite display serifs
  (`Fraunces`, `Instrument Serif`) — they are the fastest "AI made this"
  tell in existence.
- Hierarchy via **weight + color + placement**, not raw scale. Score that
  matters: heavier, accent-tinted, top-center. Everything else: smaller,
  quieter, corners.
- All state numerals **tabular** (`font-variant-numeric: tabular-nums`);
  DENSITY 7+ goes full mono.
- Combo/celebration numerals may hit `clamp(3rem, 14vmin, 6rem)` for one
  beat — permanent oversized is a layout bug.
- Italic display with descenders (y g j p q): give the line `1.1` leading
  minimum or the descender clips.
- Emphasis inside a display line = bold/italic of the SAME family. Never a
  second family mid-line.
- Real typographic quotes in any prose (`" "` not `"`); no em-dashes (`—`)
  — hyphen or restructure.

## Loading fonts

Author-time `<link>` to Google Fonts; the bundler inlines woff2 as base64
(see frogoe-core → externals). Two weights per family maximum — every
extra weight is bytes the feed pays for on every load.
