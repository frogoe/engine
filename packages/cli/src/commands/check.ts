import { defineCommand } from "citty";

import { checkProject, formatFindings, type Finding } from "../check.ts";

/** frogoe check — the FULL gate (hyperframes `check` parity): the static pass
 *  plus the live headless-Chrome sandbox, always. There is no way to run the
 *  browser half optionally — that optionality is exactly what let broken
 *  games ship. `frogoe lint` is the fast static-only loop; check reruns the
 *  static pass first, so do not prepend a redundant lint. */
export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    json: { type: "boolean", description: "machine-readable findings" },
    live: {
      type: "boolean",
      description: "deprecated no-op — the live sandbox always runs now",
    },
  },
  async run({ args }) {
    if (args.live) {
      // 0.2.2 shipped `--live` as an opt-in; the flag is a no-op now. stderr,
      // never stdout — `check --json` output must stay machine-clean.
      console.error("  note: --live is deprecated — the live sandbox always runs now");
    }
    const dir = args.dir ? String(args.dir) : process.cwd();
    const result = checkProject(dir);
    const { collectLive } = await import("../live/index.ts");
    console.log("  live pass: boot → play → end → retry (headless chrome)…");
    const live = await collectLive({ dir });
    result.findings = [...result.findings, ...live.findings].sort(
      (a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0),
    ) as Finding[];
    result.errors = result.findings.filter((f) => f.severity === "error").length;
    result.warnings = result.findings.filter((f) => f.severity === "warning").length;
    if (live.screenshots.length > 0) {
      console.log(`  snapshots: ${live.screenshots.join(", ")}`);
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
  meta: {
    description:
      "full gate: contract lint + live browser sandbox (FPS, playability, HUD outline, audio recovery, screenshots)",
  },
});
