/** dist/manifest.json — the game's machine-readable identity card,
 *  emitted by `frogoe embed`. A feed reads it before running anything:
 *  title, description, palette + fonts for card theming, the contract
 *  pin, artifact integrity (sha256), and the publish media paths — all
 *  relative to dist/ so the folder can be lifted whole. Deterministic
 *  by construction: no timestamps, fixed key order (alphabetical),
 *  media fields honestly null when the rasterized assets are absent. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseBrief } from "@frogoe/lint";

export interface GameManifest {
  artifact: string;
  artifactSha256: string;
  contract: string;
  description: string | null;
  entry: string;
  fonts: string | null;
  icon: string | null;
  mood: string | null;
  palette: { accent: string; bg: string; fg: string; outline?: string };
  poster: string | null;
  posterSha256: string | null;
  iconSha256: string | null;
  title: string;
  verb: string;
}

const DESCRIPTION_CAP = 280;

/** First non-empty paragraph of the BRIEF body, collapsed, capped —
 *  the Google-Play short-description discipline (no hype, no CTA) is
 *  authoring guidance in the skill; this only trims honestly. */
export const descriptionFrom = (source: string): string | null => {
  const split = source.split(/^---\r?\n[\s\S]*?\r?\n---/u);
  const body = split[1] ?? split[0] ?? "";
  for (const block of body.split(/\n\s*\n/u)) {
    const text = block.replaceAll(/\s+/gu, " ").trim();
    if (text.length > 0) {
      return text.length > DESCRIPTION_CAP
        ? `${text.slice(0, DESCRIPTION_CAP - 1).trimEnd()}…`
        : text;
    }
  }
  return null;
};

export interface BuildManifestOptions {
  dir: string;
  /** override the hashed artifact (tests) */
  artifactHtml?: string;
}

/** Build the manifest for a game folder. Reads BRIEF.md, frogoe.json
 *  and dist/index.html; never writes — callers decide where it lands. */
export const buildManifest = (options: BuildManifestOptions): GameManifest | null => {
  const dir = path.resolve(options.dir);
  const briefSource = readFileSync(path.join(dir, "BRIEF.md"), "utf-8");
  const brief = parseBrief(briefSource);
  if (!brief?.title) return null;

  const pin = existsSync(path.join(dir, "frogoe.json"))
    ? ((JSON.parse(readFileSync(path.join(dir, "frogoe.json"), "utf-8")) as { contract?: string })
        .contract ?? "0.1.0")
    : "0.1.0";

  const artifact =
    options.artifactHtml ?? readFileSync(path.join(dir, "dist", "index.html"), "utf-8");
  const sha256 = createHash("sha256").update(artifact, "utf-8").digest("hex");

  const mediaSha = (file: string): string | null => {
    const full = path.join(dir, "dist", "assets", file);
    return existsSync(full) ? createHash("sha256").update(readFileSync(full)).digest("hex") : null;
  };

  return {
    artifact: "index.html",
    artifactSha256: sha256,
    contract: pin,
    description: descriptionFrom(briefSource),
    entry: "index.html",
    fonts: brief.fonts ?? null,
    icon: existsSync(path.join(dir, "dist", "assets", "icon.png")) ? "assets/icon.png" : null,
    iconSha256: mediaSha("icon.png"),
    mood: brief.mood ?? null,
    palette: {
      accent: brief.accent ?? "",
      bg: brief.bg ?? "",
      fg: brief.fg ?? "",
      ...(brief.outline ? { outline: brief.outline } : {}),
    },
    poster: existsSync(path.join(dir, "dist", "assets", "poster.png")) ? "assets/poster.png" : null,
    posterSha256: mediaSha("poster.png"),
    title: brief.title,
    verb: brief.verb ?? "tap",
  };
};
