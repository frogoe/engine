#!/usr/bin/env node
/** Version lockstep — release-please bumps ONLY packages/cli (v17 resolves
 *  extra-files paths against the package dir and forbids `..`, so files
 *  outside packages/cli can never ride the bot's bump; two releases shipped
 *  that way and the lockstep was patched by hand each time).
 *
 *  This script is the deterministic replacement, wired into the release
 *  pipeline: the publish job syncs the working tree before verify/build, and
 *  the lockstep job lands the same sync on main after publishing. lefthook
 *  runs --check locally so a human commit can never reintroduce drift.
 *
 *  Source of truth: packages/cli/package.json#version. Targets never
 *  published standalone (lint/contract are bundled into the CLI dist; the
 *  plugin manifests are store metadata read from main), so their versions
 *  are consistency-only — this exists so nothing ever reads a stale one.
 *
 *  Plain JS on purpose: the release pipeline runs this with bare `node`. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const LOCKSTEP_TARGETS = [
  "packages/lint/package.json",
  "packages/contract/package.json",
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".codex-plugin/plugin.json",
];

function readVersion(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error(`no "version" field in ${file}`);
  }
  return parsed.version;
}

export function syncLockstep(root, opts = {}) {
  const check = opts.check === true;
  const version = readVersion(join(root, "packages/cli/package.json"));
  const report = { version, changed: [], current: [] };
  for (const rel of LOCKSTEP_TARGETS) {
    const file = join(root, rel);
    if (!existsSync(file)) throw new Error(`lockstep target missing: ${rel}`);
    const raw = readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    if (data.version === version) {
      report.current.push(rel);
      continue;
    }
    if (check) {
      report.changed.push(rel);
      continue;
    }
    // Surgical single-line rewrite, NOT JSON.stringify: the tree's files
    // are oxfmt-formatted (short arrays stay collapsed on one line) and a
    // full rewrite would expand them and fail format:check in the publish
    // job. Replace only the version value; every other byte is preserved.
    const patched = raw.replace(/^(\s*"version"\s*:\s*")[^"]*(")/m, `$1${version}$2`);
    if (patched === raw) throw new Error(`could not rewrite "version" in ${rel}`);
    writeFileSync(file, patched);
    report.changed.push(rel);
  }
  return report;
}

function main() {
  const check = process.argv.includes("--check");
  const report = syncLockstep(REPO_ROOT, { check });
  if (check) {
    if (report.changed.length > 0) {
      console.error(`version lockstep drift (packages/cli@${report.version}):`);
      for (const rel of report.changed) console.error(`  ${rel}`);
      console.error("fix: node scripts/sync-lockstep-versions.mjs");
      process.exitCode = 1;
      return;
    }
    console.log(`Version lockstep OK — all targets at ${report.version}.`);
    return;
  }
  if (report.changed.length === 0) {
    console.log(`Version lockstep already in sync at ${report.version}.`);
    return;
  }
  console.log(`Synced ${report.changed.length} target(s) to ${report.version}:`);
  for (const rel of report.changed) console.log(`  ${rel}`);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryPath === fileURLToPath(import.meta.url)) main();
