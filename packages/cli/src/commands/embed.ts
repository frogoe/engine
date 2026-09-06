/** frogoe embed — wrap the bundle in a card. Order discipline is law:
 *  check → bundle → embed. This command refuses to compose around a
 *  dirty project (any static error) or a missing artifact, because the
 *  card's poster, icon and sha256 are all downstream of a clean build.
 *  Outputs (dist/ is liftable whole):
 *    · embed.html     the card — poster loading state + sandboxed game
 *    · manifest.json  the feed's machine-readable identity card */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { defineCommand } from "citty";

import { checkProject } from "@frogoe/lint";

import { composeEmbedHtml } from "../embed/card.ts";
import { composePayload } from "../embed/compose.ts";
import { buildManifest } from "../manifest.ts";

const dataUri = (file: string): string | null =>
  existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString("base64")}` : null;

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
  },
  async run({ args }) {
    const dir = args.dir ? String(args.dir) : process.cwd();
    const artifactPath = path.join(dir, "dist", "index.html");
    if (!existsSync(artifactPath)) {
      throw new Error(
        "frogoe embed: no dist/index.html — run `frogoe bundle` first (and `frogoe check` before it: check → bundle → embed)",
      );
    }
    const staticResult = checkProject(dir);
    if (staticResult.errors > 0) {
      const first = staticResult.findings.find((f) => f.severity === "error");
      throw new Error(
        `frogoe embed: project is not gate-clean (${first?.code ?? "unknown"} at ${first?.file ?? "?"}) — run \`frogoe check\` first`,
      );
    }

    const manifest = buildManifest({ dir });
    if (!manifest) {
      throw new Error("frogoe embed: could not build the manifest from BRIEF.md");
    }

    const posterDataUri = dataUri(path.join(dir, "dist", "assets", "poster.png"));
    const iconDataUri = dataUri(path.join(dir, "dist", "assets", "icon.png"));

    const gameHtml = readFileSync(artifactPath, "utf-8");
    const { payloadB64 } = composePayload(gameHtml);
    const html = composeEmbedHtml({ iconDataUri, manifest, payloadB64, posterDataUri });

    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(
      path.join(dir, "dist", "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf-8",
    );
    const outPath = path.join(dir, "dist", "embed.html");
    writeFileSync(outPath, html, "utf-8");

    console.log(`  frogoe embed → ${outPath}`);
    console.log(
      `  ${html.length.toLocaleString("en-US")} bytes · sandbox allow-scripts · sha256 ${manifest.artifactSha256.slice(0, 12)}`,
    );
    console.log(
      `  poster: ${manifest.poster ? "authored art (rasterized)" : "MISSING — run frogoe bundle"} · icon: ${manifest.icon ? "authored art (rasterized)" : "MISSING — run frogoe bundle"}`,
    );
  },
  meta: {
    description: "wrap the bundle in a card (poster loading state + manifest)",
  },
});
