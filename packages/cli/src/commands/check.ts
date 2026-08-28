import { defineCommand } from "citty";

import { checkProject, formatFindings } from "../check.ts";

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    json: { type: "boolean", description: "machine-readable findings" },
  },
  async run({ args }) {
    const dir = args.dir ? String(args.dir) : process.cwd();
    const result = checkProject(dir);
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
