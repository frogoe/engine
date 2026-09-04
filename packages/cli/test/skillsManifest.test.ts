import { describe, expect, test } from "bun:test";
/** Behavioral tests for the skillsManifest port (hyperframes parity).
 *  Hash determinism, CRLF equivalence, diff tiers, scope precedence, and an
 *  offline end-to-end checkSkills run against a local manifest — the network
 *  path is never touched (source is an absolute local path). */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildManifest,
  checkSkills,
  diffSkills,
  FALLBACK_CORE_SKILLS,
  hashSkillBundle,
  isCoreSkill,
  MANIFEST_FILE,
  type SkillEntry,
  type SkillsManifest,
} from "../src/utils/skillsManifest.ts";

const tmpRoot = path.join(import.meta.dir, "../.tmp-sm");

const freshDir = (name: string): string => {
  const dir = path.join(tmpRoot, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
};

const writeSkill = (root: string, name: string, files: Record<string, string>): void => {
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, name, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
};

const skillMd = (name: string): string =>
  `---\nname: ${name}\ndescription: test skill\n---\n\n# ${name}\n`;

describe("hashSkillBundle", () => {
  test("deterministic across write order (sorted paths, not fs order)", () => {
    const a = freshDir("hash-a");
    const b = freshDir("hash-b");
    // same content, opposite creation order
    writeSkill(a, "s", {
      "SKILL.md": skillMd("s"),
      "references/z.md": "z",
      "references/a.md": "a",
    });
    writeSkill(b, "s", {
      "references/a.md": "a",
      "references/z.md": "z",
      "SKILL.md": skillMd("s"),
    });
    expect(hashSkillBundle(path.join(a, "s")).hash).toBe(hashSkillBundle(path.join(b, "s")).hash);
  });

  test("CRLF vs LF text hashes identically (Windows checkout is not outdated)", () => {
    const lf = freshDir("hash-lf");
    const crlf = freshDir("hash-crlf");
    writeSkill(lf, "s", { "SKILL.md": "one\ntwo\n" });
    writeSkill(crlf, "s", { "SKILL.md": "one\r\ntwo\r\n" });
    expect(hashSkillBundle(path.join(lf, "s")).hash).toBe(
      hashSkillBundle(path.join(crlf, "s")).hash,
    );
  });

  test("moving a file changes the hash (relative path is folded in)", () => {
    const a = freshDir("hash-move-a");
    const b = freshDir("hash-move-b");
    writeSkill(a, "s", { "x.md": "same", "SKILL.md": skillMd("s") });
    writeSkill(b, "s", { "y.md": "same", "SKILL.md": skillMd("s") });
    expect(hashSkillBundle(path.join(a, "s")).hash).not.toBe(
      hashSkillBundle(path.join(b, "s")).hash,
    );
  });

  test(".DS_Store is skipped and the file count is real", () => {
    const dir = freshDir("hash-dsstore");
    writeSkill(dir, "s", { "SKILL.md": skillMd("s"), ".DS_Store": "junk" });
    const entry: SkillEntry = hashSkillBundle(path.join(dir, "s"));
    expect(entry.files).toBe(1);
  });
});

describe("buildManifest + tiers", () => {
  test("only SKILL.md dirs are listed, sorted", () => {
    const dir = freshDir("build");
    writeSkill(dir, "zeta", { "SKILL.md": skillMd("zeta") });
    writeSkill(dir, "alpha", { "SKILL.md": skillMd("alpha") });
    writeSkill(dir, "not-a-skill", { "README.md": "x" });
    const manifest = buildManifest(dir, { source: "frogoe/engine" });
    expect(Object.keys(manifest.skills)).toEqual(["alpha", "zeta"]);
    expect(manifest.source).toBe("frogoe/engine");
  });

  test("isCoreSkill: frogoe + frogoe-* are core; FALLBACK is pinned to the shipped five", () => {
    expect(isCoreSkill("frogoe")).toBeTrue();
    expect(isCoreSkill("frogoe-core")).toBeTrue();
    expect(isCoreSkill("other-tool")).toBeFalse();
    expect(FALLBACK_CORE_SKILLS).toEqual([
      "frogoe",
      "frogoe-core",
      "frogoe-creative",
      "frogoe-cli",
      "frogoe-registry",
    ]);
    expect(MANIFEST_FILE).toBe("skills-manifest.json");
  });

  test("diffSkills tiers: current / outdated / missing-core / missing-on-demand", () => {
    const latest: SkillsManifest = {
      source: "frogoe/engine",
      skills: {
        frogoe: { hash: "aaa", files: 1 },
        "frogoe-core": { hash: "bbb", files: 1 },
        "other-tool": { hash: "ccc", files: 1 }, // on-demand, not core
      },
    };
    const installed: Record<string, SkillEntry> = {
      frogoe: { hash: "aaa", files: 1 }, // current
      "frogoe-core": { hash: "drift", files: 1 }, // outdated
      // other-tool: missing (on-demand)
    };
    const diff = diffSkills(installed, latest);
    expect(diff.summary.current).toBe(1);
    expect(diff.summary.outdated).toBe(1);
    expect(diff.summary.missing).toBe(1);
    expect(diff.summary.coreMissing).toBe(0); // the missing skill is on-demand
    expect(diff.updateAvailable).toBeTrue(); // outdated alone flips it
  });

  test("a missing on-demand skill alone is NOT an update (partial installs stay partial)", () => {
    const latest: SkillsManifest = {
      source: "frogoe/engine",
      skills: {
        frogoe: { hash: "aaa", files: 1 },
        "other-tool": { hash: "ccc", files: 1 },
      },
    };
    const diff = diffSkills({ frogoe: { hash: "aaa", files: 1 } }, latest);
    expect(diff.updateAvailable).toBeFalse();
    expect(diff.summary.missing).toBe(1);
    expect(diff.summary.coreMissing).toBe(0);
  });

  test("a missing CORE skill flips updateAvailable", () => {
    const latest: SkillsManifest = {
      source: "frogoe/engine",
      skills: { frogoe: { hash: "aaa", files: 1 } },
    };
    const diff = diffSkills({}, latest);
    expect(diff.summary.coreMissing).toBe(1);
    expect(diff.updateAvailable).toBeTrue();
  });
});

describe("checkSkills (offline, local manifest source)", () => {
  const setup = (): { manifestFile: string; installRoot: string } => {
    const dir = freshDir("e2e");
    // the published tree
    const sourceRoot = path.join(dir, "published", "skills");
    writeSkill(sourceRoot, "frogoe", { "SKILL.md": skillMd("frogoe") });
    writeSkill(sourceRoot, "frogoe-core", {
      "SKILL.md": skillMd("frogoe-core"),
      "references/audio.md": "audio",
    });
    const manifest = buildManifest(sourceRoot, { source: "frogoe/engine" });
    const manifestFile = path.join(dir, MANIFEST_FILE);
    writeFileSync(manifestFile, JSON.stringify(manifest));
    // the installed mirror (identical content)
    const installRoot = path.join(dir, "install", "skills");
    writeSkill(installRoot, "frogoe", { "SKILL.md": skillMd("frogoe") });
    writeSkill(installRoot, "frogoe-core", {
      "SKILL.md": skillMd("frogoe-core"),
      "references/audio.md": "audio",
    });
    return { manifestFile, installRoot };
  };

  test("identical install reads all current, no update, project scope under cwd", async () => {
    const { manifestFile, installRoot } = setup();
    const result = await checkSkills({
      dir: installRoot,
      source: manifestFile,
      cwd: process.cwd(),
    });
    expect(result.location).toBe(installRoot);
    expect(result.summary.current).toBe(2);
    expect(result.updateAvailable).toBeFalse();
    expect(result.lockMissing).toBeFalse();
    expect(result.scope).toBe("project"); // under cwd
  });

  test("tampered install skill reads outdated", async () => {
    const { manifestFile, installRoot } = setup();
    writeFileSync(path.join(installRoot, "frogoe", "SKILL.md"), skillMd("frogoe") + "\nchanged");
    const result = await checkSkills({
      dir: installRoot,
      source: manifestFile,
      cwd: process.cwd(),
    });
    expect(result.summary.outdated).toBe(1);
    expect(result.updateAvailable).toBeTrue();
  });

  test("removed core skill reads coreMissing and flips updateAvailable", async () => {
    const { manifestFile, installRoot } = setup();
    rmSync(path.join(installRoot, "frogoe-core"), { recursive: true, force: true });
    const result = await checkSkills({
      dir: installRoot,
      source: manifestFile,
      cwd: process.cwd(),
    });
    expect(result.summary.coreMissing).toBe(1);
    expect(result.updateAvailable).toBeTrue();
  });

  test("scope precedence: dir under fake HOME (not cwd) reads global", async () => {
    // the fake home MUST live outside cwd — CWD-containment wins over HOME by
    // design (a project install under ~/work is project, not global)
    const fakeHome = path.join(tmpdir(), `frogoe-sm-home-${process.pid}`);
    rmSync(fakeHome, { recursive: true, force: true });
    const installRoot = path.join(fakeHome, ".claude", "skills");
    writeSkill(installRoot, "frogoe", { "SKILL.md": skillMd("frogoe") });
    const sourceRoot = path.join(freshDir("scope"), "published", "skills");
    writeSkill(sourceRoot, "frogoe", { "SKILL.md": skillMd("frogoe") });
    const manifestFile = path.join(tmpRoot, "scope", MANIFEST_FILE);
    writeFileSync(
      manifestFile,
      JSON.stringify(buildManifest(sourceRoot, { source: "frogoe/engine" })),
    );
    const result = await checkSkills({
      dir: installRoot,
      source: manifestFile,
      cwd: process.cwd(),
      home: fakeHome,
    });
    expect(result.scope).toBe("global");
    expect(result.agent).toBe("claude-code");
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test("nonexistent install dir: location null, everything missing", async () => {
    const dir = freshDir("noinstall");
    const sourceRoot = path.join(dir, "published", "skills");
    writeSkill(sourceRoot, "frogoe", { "SKILL.md": skillMd("frogoe") });
    const manifestFile = path.join(dir, MANIFEST_FILE);
    writeFileSync(
      manifestFile,
      JSON.stringify(buildManifest(sourceRoot, { source: "frogoe/engine" })),
    );
    const result = await checkSkills({
      dir: path.join(dir, "nope", "skills"),
      source: manifestFile,
      cwd: process.cwd(),
    });
    expect(result.location).toBeNull();
    expect(result.summary.missing).toBe(1);
    expect(result.summary.coreMissing).toBe(1);
    expect(result.updateAvailable).toBeTrue();
  });
});

rmSync(tmpRoot, { recursive: true, force: true });
