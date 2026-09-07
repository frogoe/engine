/** art/* — static validation of the authored identity art.
 *
 *  Poster and icon are ART drawn BY THE GAME'S OWN CODE: authored
 *  canvas scenes (assets/poster.js, assets/icon.js) that import the
 *  sprites and palette from game.js and compose the key-art moment —
 *  one renderer, so the art is 1:1 with the shipped game by
 *  construction, not by imitation. These checks enforce that contract
 *  statically: the scene must exist, must export its draw entry, must
 *  import from ../game.js (no parallel universes), must not use a
 *  single color the game never draws, and any canvas lettering must be
 *  the BRIEF font — the same webfont the game loads. Linear scans
 *  only (CodeQL discipline), zero deps. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseBrief } from "./brief.ts";
import type { Finding } from "./check.ts";

interface SceneSpec {
  draw: string;
  file: string;
}

const SPECS: SceneSpec[] = [
  { draw: "drawPoster", file: "assets/poster.js" },
  { draw: "drawIcon", file: "assets/icon.js" },
];

const MIN_DRAW_CALLS = 2;
const DRAW_CALL =
  /(?:fillRect|strokeRect|clearRect|beginPath|closePath|arc|ellipse|moveTo|lineTo|quadraticCurveTo|bezierCurveTo|fillText|strokeText|drawImage|roundRect|fill|stroke)\s*\(/gu;
/** sprite delegation — scenes compose via the game's own draw* fns */
const SPRITE_CALL = /\bdraw[A-Z]\w*\s*\(/gu;

export const checkArt = (dir: string, findings: Finding[]): void => {
  // a missing BRIEF is brief/missing's finding — art checks still run
  const briefPath = path.join(dir, "BRIEF.md");
  const brief = existsSync(briefPath) ? parseBrief(readFileSync(briefPath, "utf-8")) : undefined;
  const briefFonts = (brief?.fonts ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  const gamePath = path.join(dir, "game.js");
  const gameSource = existsSync(gamePath) ? readFileSync(gamePath, "utf-8") : "";
  const gameColors = hexColorsOf(stripComments(gameSource));
  const htmlSource = existsSync(path.join(dir, "index.html"))
    ? readFileSync(path.join(dir, "index.html"), "utf-8")
    : "";

  for (const spec of SPECS) {
    const scenePath = path.join(dir, spec.file);
    if (!existsSync(scenePath)) {
      findings.push({
        code: "art/missing",
        file: spec.file,
        fix: "author the scene — a canvas composition importing the game's own sprites (frogoe-creative → references/art.md)",
        message: `${spec.file} is missing — poster and icon are authored art, not generated`,
        recipe: "frogoe-creative → references/art.md",
        severity: "error",
      });
      continue;
    }
    const source = stripComments(readFileSync(scenePath, "utf-8"));
    checkScene(source, spec, gameColors, briefFonts, htmlSource, findings);
  }
};

const checkScene = (
  source: string,
  spec: SceneSpec,
  gameColors: Set<string>,
  briefFonts: string[],
  htmlSource: string,
  findings: Finding[],
): void => {
  // the scene's entry point — bundle's raster page imports it by name
  if (
    !new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${spec.draw}\\b`, "u").test(source)
  ) {
    findings.push({
      code: "art/scene-export",
      file: spec.file,
      fix: `export the entry the rasterizer calls — export function ${spec.draw}(ctx, w, h)`,
      message: `${spec.file} does not export ${spec.draw}()`,
      severity: "error",
    });
  }

  // one renderer: the scene must draw with the game's own code
  if (!/from\s+["']\.\.\/game\.js["']/u.test(source)) {
    findings.push({
      code: "art/scene-source",
      file: spec.file,
      fix: 'import the sprites/palette from the game — `import { … } from "../game.js"` — identity art renders with the game\'s own code',
      message: `${spec.file} does not import from ../game.js (the art must be 1:1 by construction)`,
      severity: "error",
    });
  }

  // color lock: no hex the game never draws (case/short-form normalized)
  for (const hex of hexColorsOf(source)) {
    if (!gameColors.has(hex)) {
      findings.push({
        code: "art/color-drift",
        file: spec.file,
        fix: `use the game's own color for "${hex}" — import the palette from ../game.js; a color the game never draws has no business in its key art`,
        message: `${spec.file} uses "${hex}", which game.js never draws`,
        severity: "error",
      });
    }
  }

  // lettering: canvas fonts must be the BRIEF voice, actually linked.
  // values may nest quotes ('700 96px "Press Start 2P"') — pair the
  // outer quote kind, allow the inner one.
  const fontStrings = [
    ...source.matchAll(/\.font\s*=\s*'([^']+)'/gu),
    ...source.matchAll(/\.font\s*=\s*"([^"]+)"/gu),
  ]
    .map((match) => match[1] ?? "")
    .filter((value) => value.length > 0);
  for (const font of fontStrings) {
    const lower = font.toLowerCase();
    if (!briefFonts.some((family) => lower.includes(family))) {
      findings.push({
        code: "art/text-font",
        file: spec.file,
        fix:
          briefFonts.length > 0
            ? `lettering must use the BRIEF font (${briefFonts.join(", ")}) — ctx.font = \`700 96px ${briefFonts[0]}\` — or drop the text`
            : "this BRIEF declares no fonts — the poster carries no canvas lettering",
        message: `canvas font "${font.slice(0, 40)}" is not the game's typography`,
        severity: "error",
      });
      continue;
    }
    const family = briefFonts.find((name) => lower.includes(name)) ?? "";
    // the stylesheet link URL-encodes spaces (+ or %20) — normalize both
    const haystack = htmlSource.toLowerCase().replaceAll("+", " ").replaceAll("%20", " ");
    if (!haystack.includes(family)) {
      findings.push({
        code: "art/text-font",
        file: spec.file,
        fix: `index.html never loads "${family}" — add the Google Fonts <link> (the rasterizer dissolves the same stylesheet)`,
        message: `font "${family}" is used in the art but the game never loads it`,
        severity: "error",
      });
    }
  }

  const entryCalls = new Set([`drawPoster(`, `drawIcon(`]);
  const spriteCalls = [...source.matchAll(SPRITE_CALL)]
    .map((match) => match[0] ?? "")
    .filter((call) => !entryCalls.has(call)).length;
  const drawCalls = [...source.matchAll(DRAW_CALL)].length + spriteCalls;
  if (drawCalls < MIN_DRAW_CALLS) {
    findings.push({
      code: "art/empty",
      file: spec.file,
      fix: `compose the scene with real draw calls (found ${drawCalls}) — an empty or placeholder scene is not key art`,
      message: `${spec.file} barely draws anything`,
      severity: "error",
    });
  }

  // the declared safe-zone band — the collision gate reads it at
  // bundle; an undeclared band silently disables that gate
  if (spec.draw === "drawPoster" && !source.includes("__frogoeTitleBand")) {
    findings.push({
      code: "art/title-band",
      file: spec.file,
      fix: "declare the lettering block from the layout variables — ctx.__frogoeTitleBand = [x0, y0, x1, y1] (never hand-typed: the render is the only truth)",
      message: "the poster declares no title band — bundle's safe-zone collision check stays off",
      recipe: "frogoe-creative → references/art.md",
      severity: "warning",
    });
  }

  // the identity layer — Steam's first capsule rule is a readable
  // product logotype; shape-drawn lettering stays legal, so this
  // teaches (warning) instead of banning. Rendered contrast is gated
  // separately at bundle time (bundle/art-title-readability).
  if (spec.draw === "drawPoster" && !/fillText|strokeText/u.test(source)) {
    findings.push({
      code: "art/title-presence",
      file: spec.file,
      fix: "draw the logotype — ctx.font with the BRIEF font, strokeText outline first (frogoe-creative → references/art.md); shape-drawn lettering is the legal alternative",
      message:
        "the poster has no canvas lettering — Steam's capsule rules require a readable logotype",
      recipe: "frogoe-creative → references/art.md",
      severity: "warning",
    });
  }
};

/** Lowercased, short-form-expanded hex set (#abc → #aabbcc). */
export const hexColorsOf = (source: string): Set<string> => {
  const colors = new Set<string>();
  for (const match of source.matchAll(/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/gu)) {
    const hex = (match[0] ?? "").toLowerCase();
    colors.add(hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex);
  }
  return colors;
};

/** Strip // and /* comments with linear indexOf passes (keeps "https://"
 *  inside strings — a "//" preceded by ":" is a protocol, not a comment). */
const stripComments = (source: string): string => {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const line = source.indexOf("//", i);
    const block = source.indexOf("/*", i);
    if (line === -1 && block === -1) {
      out += source.slice(i);
      break;
    }
    const at = block !== -1 && (line === -1 || block < line) ? block : line !== -1 ? line : -1;
    if (at === block) {
      out += source.slice(i, at);
      const end = source.indexOf("*/", at + 2);
      i = end === -1 ? source.length : end + 2;
    } else {
      // line comment — but "https://" is not one
      const isProtocol = at > 0 && source[at - 1] === ":";
      if (isProtocol) {
        out += source.slice(i, at + 2);
        i = at + 2;
      } else {
        out += source.slice(i, at);
        const end = source.indexOf("\n", at);
        i = end === -1 ? source.length : end;
      }
    }
  }
  return out;
};
