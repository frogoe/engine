import { describe, expect, test } from "bun:test";
/** Version lockstep — the deterministic replacement for release-please
 *  extra-files (v17 forbids paths outside the package dir, so the bot can
 *  never bump lint/contract/plugin manifests itself). */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { syncLockstep } from "./sync-lockstep-versions.mjs";

const tmpRoot = path.join(import.meta.dir, "../.tmp-lockstep");

const freshDir = (): string => {
  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });
  return tmpRoot;
};

const writeJson = (root: string, rel: string, data: Record<string, unknown>): void => {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
};

const setup = (cliVersion: string, targetVersion: string): string => {
  const root = freshDir();
  writeJson(root, "packages/cli/package.json", { name: "frogoe", version: cliVersion });
  writeJson(root, "packages/lint/package.json", { name: "@frogoe/lint", version: targetVersion });
  writeJson(root, "packages/contract/package.json", {
    name: "@frogoe/contract",
    version: targetVersion,
  });
  writeJson(root, ".claude-plugin/plugin.json", { name: "frogoe", version: targetVersion });
  writeJson(root, ".cursor-plugin/plugin.json", { name: "frogoe", version: targetVersion });
  writeJson(root, ".codex-plugin/plugin.json", { name: "frogoe", version: targetVersion });
  return root;
};

describe("syncLockstep", () => {
  test("syncs every drifted target to the packages/cli version", () => {
    const root = setup("0.3.0", "0.2.2");
    const report = syncLockstep(root);
    expect(report.version).toBe("0.3.0");
    expect(report.changed).toHaveLength(5);
    for (const rel of report.changed) {
      const data = JSON.parse(readFileSync(path.join(root, rel), "utf8")) as {
        version: string;
      };
      expect(data.version).toBe("0.3.0");
    }
  });

  test("preserves 2-space indent + trailing newline (no reformat churn)", () => {
    const root = setup("0.3.0", "0.2.2");
    syncLockstep(root);
    const raw = readFileSync(path.join(root, ".claude-plugin/plugin.json"), "utf8");
    expect(raw.endsWith("\n")).toBeTrue();
    expect(raw).toContain('  "version": "0.3.0"');
  });

  test("already-in-sync tree is a no-op and reports current", () => {
    const root = setup("0.3.0", "0.3.0");
    const report = syncLockstep(root);
    expect(report.changed).toHaveLength(0);
    expect(report.current).toHaveLength(5);
  });

  test("--check reports drift WITHOUT writing", () => {
    const root = setup("0.3.0", "0.2.2");
    const before = readFileSync(path.join(root, "packages/lint/package.json"), "utf8");
    const report = syncLockstep(root, { check: true });
    expect(report.changed).toHaveLength(5);
    const after = readFileSync(path.join(root, "packages/lint/package.json"), "utf8");
    expect(after).toBe(before);
  });

  test("a target without a version field is healed (only the source must carry one)", () => {
    const root = setup("0.3.0", "0.2.2");
    writeJson(root, ".codex-plugin/plugin.json", { name: "frogoe" });
    const report = syncLockstep(root);
    expect(report.changed).toContain(".codex-plugin/plugin.json");
    const healed = JSON.parse(
      readFileSync(path.join(root, ".codex-plugin/plugin.json"), "utf8"),
    ) as { version: string };
    expect(healed.version).toBe("0.3.0");
  });

  test("a source without a version field aborts (never sync from garbage)", () => {
    const root = setup("0.3.0", "0.2.2");
    writeJson(root, "packages/cli/package.json", { name: "frogoe" });
    expect(() => syncLockstep(root)).toThrow(/no "version" field/);
  });

  test("a missing target fails loudly (typo'd path can never skip silently)", () => {
    const root = setup("0.3.0", "0.2.2");
    rmSync(path.join(root, ".cursor-plugin", "plugin.json"), { force: true });
    expect(() => syncLockstep(root)).toThrow(/lockstep target missing/);
  });
});

rmSync(tmpRoot, { recursive: true, force: true });
