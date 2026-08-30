/** frogoe report — the last playtest session, on one screen: duration,
 *  fps story, dips below the floor with their wall-clock moment, errors,
 *  hidden periods. Reads .frogoe/sessions/<stamp>.jsonl (tool-owned). */
import { readFileSync } from "node:fs";
import { defineCommand } from "citty";

import { summarizeRecords, type TelemetryRecord } from "../telemetry/records.ts";
import { latestSessionFile } from "../telemetry/session.ts";

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
  },
  async run({ args }) {
    const dir = args.dir ? String(args.dir) : process.cwd();
    const file = latestSessionFile(dir);
    if (!file) {
      console.log(`frogoe report: no sessions in ${dir} — play a run under \`frogoe run\` first`);
      return;
    }
    const records = readFileSync(file, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TelemetryRecord);
    const s = summarizeRecords(records);
    console.log(`\n  frogoe report — ${file}`);
    console.log(
      `  playtest ${Math.floor(s.durationS / 60)}m ${s.durationS % 60}s · ${s.pageLoads} page load${s.pageLoads === 1 ? "" : "s"} · ${s.buckets} fps buckets`,
    );
    if (s.meanFps !== undefined) {
      console.log(`  fps mean ${s.meanFps} · dips < 30: ${s.dips}`);
    }
    if (s.worst) {
      console.log(`  worst dip: ${s.worst.fps} fps for ${s.worst.len}s at ${s.worst.time}`);
    }
    console.log(`  errors: ${s.errors} · hidden: ${s.hiddenS}s`);
    console.log("");
  },
  meta: { description: "summarize the last playtest session (fps dips, errors)" },
});
