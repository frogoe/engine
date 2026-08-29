/** frogoe check — thin wrapper over @frogoe/lint + live browser pass. */
export { checkProject, type CheckResult, type Finding, type Severity } from "@frogoe/lint";
export { type Brief, parseBrief } from "@frogoe/lint";
export { contrastRatio } from "@frogoe/lint";

// formatting stays here (CLI presentation concern)
import type { CheckResult } from "@frogoe/lint";

export const formatFindings = (result: CheckResult): string =>
  result.findings
    .map((f) => {
      const at = f.line !== undefined ? `:${f.line}` : "";
      const head = `${f.severity === "error" ? "\u2716" : "\u26a0"} ${f.code}  ${f.file}${at}`;
      return `${head}\n    ${f.message}\n    fix: ${f.fix}`;
    })
    .join("\n") || "clean — 0 findings";
