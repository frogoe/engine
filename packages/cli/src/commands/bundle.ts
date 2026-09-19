import { defineCommand } from "citty";

import { materializeBundle } from "../bundle.ts";
import { writeFileSync } from "node:fs";
import path from "node:path";

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    json: { type: "boolean", description: "machine-readable report" },
    out: { type: "string", description: "output path (default: dist/index.html)" },
  },
  async run({ args }) {
    const dir = args.dir ? String(args.dir) : process.cwd();
    const { art, report } = await materializeBundle({ dir });
    if (args.out) {
      const outPath = path.resolve(String(args.out));
      // dist/ stays materialized (the canonical copy); --out adds a copy
      // where the caller wants it (the embed pipeline, e2e fixtures)
      writeFileSync(outPath, report.artifact, "utf-8");
    }
    for (const warning of [...report.warnings, ...art.warnings]) {
      console.log(`  ⚠ ${warning}`);
    }
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            art: art.files,
            artifact: path.join(dir, "dist", "index.html"),
            assets: report.assets,
            bytes: report.bytes,
            sha256: report.sha256,
            warnings: report.warnings,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`  frogoe bundle → ${path.join(dir, "dist", "index.html")}`);
      if (args.out) {
        console.log(`  copy → ${path.resolve(String(args.out))}`);
      }
      console.log(
        `  ${report.bytes} bytes · ${report.assets.length} dissolved asset(s) · sha256 ${report.sha256.slice(0, 12)}`,
      );
      for (const asset of report.assets) {
        console.log(`    ${asset.kind.padEnd(5)} ${asset.source}`);
      }
      for (const file of art.files) {
        console.log(`    art   ${file.file} (${file.bytes} bytes)`);
      }
    }
  },
  meta: { description: "dissolve externals into one self-contained HTML" },
});
