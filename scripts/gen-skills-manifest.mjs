#!/usr/bin/env node
// Generate skills-manifest.json with per-skill SHA256 hash over entire bundle.
// Ported from hyperframes packages/cli/src/utils/skillsManifest.ts:hashSkillBundle

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { hashSkillBundle } from "./lib/hashSkill.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const SKILLS_ROOT = join(REPO_ROOT, "skills");
const MANIFEST_PATH = join(REPO_ROOT, "skills-manifest.json");
const SOURCE = "frogoe/engine";

function buildManifest() {
  const names = readdirSync(SKILLS_ROOT)
    .filter((n) => existsSync(join(SKILLS_ROOT, n, "SKILL.md")))
    .sort();
  const skills = {};
  for (const name of names) skills[name] = hashSkillBundle(join(SKILLS_ROOT, name));
  return { source: SOURCE, skills };
}

const args = process.argv.slice(2);
const shouldWrite = args.includes("--write");
const shouldCheck = args.includes("--check");

const manifest = buildManifest();

if (shouldWrite) {
  let onDisk = null;
  try {
    onDisk = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch {}
  const inSync =
    onDisk &&
    onDisk.source === manifest.source &&
    JSON.stringify(onDisk.skills) === JSON.stringify(manifest.skills);
  if (inSync) {
    console.log("Manifest already in sync — no write needed.");
  } else {
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`Wrote ${MANIFEST_PATH} — ${Object.keys(manifest.skills).length} skills`);
    for (const [name, entry] of Object.entries(manifest.skills)) {
      console.log(`  ${name}: ${entry.hash} (${entry.files} files)`);
    }
  }
} else if (shouldCheck) {
  let onDisk;
  try {
    onDisk = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    console.error("skills-manifest.json missing or unreadable — run with --write");
    process.exit(1);
  }
  const mismatches = [];
  for (const [name, entry] of Object.entries(manifest.skills)) {
    const existing = onDisk.skills?.[name];
    if (!existing || existing.hash !== entry.hash || existing.files !== entry.files) {
      mismatches.push(name);
      console.error(
        `Mismatch ${name}: expected ${entry.hash} (${entry.files}) got ${existing?.hash ?? "missing"} (${existing?.files ?? 0})`,
      );
    }
  }
  for (const name of Object.keys(onDisk.skills ?? {})) {
    if (!(name in manifest.skills)) {
      mismatches.push(name);
      console.error(`Extra skill in manifest not on disk: ${name}`);
    }
  }
  if (mismatches.length > 0) process.exit(1);
  console.log("Manifest hashes OK");
} else {
  console.log(JSON.stringify(manifest, null, 2));
}
