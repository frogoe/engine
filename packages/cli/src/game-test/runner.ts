/** Runs game.test.js under bun and folds the outcome into check findings.
 *  spawnSync with a hard timeout — a hung test (infinite loop, unawaited
 *  promise) is a finding, never a dead CLI. Output is parsed, not trusted:
 *  failing test names come from bun's own (fail) lines. */
import { spawnSync } from "node:child_process";

import type { Finding } from "@frogoe/lint";

import { ensureTestStub, hasGameTests } from "./materialize.ts";

export interface UnitResult {
  findings: Finding[];
  /** tests run (undefined when the game ships no game.test.js) */
  ran: boolean;
}

const TIMEOUT_MS = 30_000;

const finding = (shape: Omit<Finding, "file">): Finding => ({ file: "game.test.js", ...shape });

export const runGameTests = (dir: string, options?: { timeoutMs?: number }): UnitResult => {
  const timeoutMs = options?.timeoutMs ?? TIMEOUT_MS;
  if (!hasGameTests(dir)) return { findings: [], ran: false };
  const stubbed = ensureTestStub(dir);
  if ("error" in stubbed) {
    return {
      findings: [
        finding({
          code: stubbed.code,
          fix: stubbed.error,
          message:
            stubbed.code === "test/deps"
              ? "test dependencies could not be installed"
              : "the frogoe test stub could not be installed",
          severity: "error",
        }),
      ],
      ran: true,
    };
  }
  const proc = spawnSync("bun", ["test", "game.test.js"], {
    cwd: dir,
    encoding: "utf-8",
    timeout: timeoutMs,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  if (proc.status === 0) {
    return { findings: [], ran: true };
  }
  if (proc.signal === "SIGTERM") {
    return {
      findings: [
        finding({
          code: "test/timeout",
          fix: `game.test.js hung past ${Math.round(timeoutMs / 1000)}s — an infinite loop in a test, or an await that never resolves`,
          message: "tests timed out",
          severity: "error",
        }),
      ],
      ran: true,
    };
  }
  const out = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`;
  const failed = [...out.matchAll(/\(fail\)\s*(.+)/gu)].map((m) => (m[1] ?? "").trim());
  if (failed.length > 0) {
    return {
      findings: [
        finding({
          code: "test/failed",
          fix: `${failed.length} failing test(s): ${failed.slice(0, 3).join(" | ")} — run \`bun test game.test.js\` locally for the full trace`,
          message: `${failed.length} game test(s) failing`,
          severity: "error",
        }),
      ],
      ran: true,
    };
  }
  return {
    findings: [
      finding({
        code: "test/crash",
        fix: `the test run itself crashed before reporting — ${(out.trim().split("\n").pop() ?? "(no output)").slice(0, 140)}`,
        message: "game.test.js crashed (syntax error or boot-time throw)",
        severity: "error",
      }),
    ],
    ran: true,
  };
};
