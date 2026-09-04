import { defineCommand } from "citty";

import { checkProject, formatFindings } from "../check.ts";

/** frogoe lint — the fast static half of the gate (hyperframes `lint` parity).
 *  Use for iteration; `frogoe check` is the full gate and always reruns this
 *  pass before the live sandbox — do not prepend a redundant lint before it. */
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
  meta: { description: "static contract lint only — fast iteration (check is the full gate)" },
});
