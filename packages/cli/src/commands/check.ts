import { defineCommand } from "citty";

import { checkProject, formatFindings, type Finding } from "../check.ts";

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    json: { type: "boolean", description: "machine-readable findings" },
    live: { type: "boolean", description: "also run the headless-browser sandbox pass" },
  },
  async run({ args }) {
    const dir = args.dir ? String(args.dir) : process.cwd();
    const result = checkProject(dir);
    if (args.live) {
      const { collectLive } = await import("../live.ts");
      console.log("  live pass: launching headless chrome…");
      const live = await collectLive({ dir });
      result.findings = [...result.findings, ...live.findings].sort(
        (a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0),
      ) as Finding[];
      result.errors = result.findings.filter((f) => f.severity === "error").length;
      result.warnings = result.findings.filter((f) => f.severity === "warning").length;
      if (live.screenshots.length > 0) {
        console.log(`  snapshots: ${live.screenshots.join(", ")}`);
      }
    }
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatFindings(result));
      console.log(`\n  ${result.errors} error(s), ${result.warnings} warning(s)`);
    }
    if (result.errors > 0) {
      process.exitCode = 1;
    }
  },
  meta: { description: "contract lint with stable finding codes" },
});
