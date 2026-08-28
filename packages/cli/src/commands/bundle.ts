import { defineCommand } from "citty";

import { bundle } from "../bundle.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    json: { type: "boolean", description: "machine-readable report" },
    out: { type: "string", description: "output path (default: dist/index.html)" },
  },
  async run({ args }) {
    const dir = args.dir ? String(args.dir) : process.cwd();
    const report = await bundle({ dir });
    const outPath = args.out
      ? path.resolve(String(args.out))
      : path.join(dir, "dist", "index.html");
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, report.artifact, "utf-8");
    for (const warning of report.warnings) {
      console.log(`  ⚠ ${warning}`);
    }
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            artifact: outPath,
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
      console.log(`  frogoe bundle → ${outPath}`);
      console.log(
        `  ${report.bytes} bytes · ${report.assets.length} dissolved asset(s) · sha256 ${report.sha256.slice(0, 12)}`,
      );
      for (const asset of report.assets) {
        console.log(`    ${asset.kind.padEnd(5)} ${asset.source}`);
      }
    }
  },
  meta: { description: "dissolve externals into one self-contained HTML" },
});
