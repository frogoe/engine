#!/usr/bin/env node
// Verifies skills-manifest.json hash + files count matches source tree.
// Ported from hyperframes verify:packed-manifests — deterministic SHA256.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { countFiles, hashSkillBundle } from "./lib/hashSkill.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const MANIFEST_PATH = join(REPO_ROOT, "skills-manifest.json");

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
} catch (e) {
  console.error(`Failed to read ${MANIFEST_PATH}: ${e.message}`);
  process.exit(1);
}

if (!manifest.skills || typeof manifest.skills !== "object") {
  console.error("skills-manifest.json missing 'skills' mapping");
  process.exit(1);
}

let problems = 0;
for (const [name, meta] of Object.entries(manifest.skills)) {
  const dir = join(REPO_ROOT, "skills", name);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`Manifest lists skill "${name}" but skills/${name} directory missing`);
    problems++;
    continue;
  }
  const actual = countFiles(dir);
  const declared = meta.files;
  if (actual !== declared) {
    console.error(
      `Skill "${name}" manifest files:${declared} != actual:${actual} — run: node scripts/gen-skills-manifest.mjs --write`,
    );
    problems++;
    continue;
  }
  if (meta.hash) {
    const computed = hashSkillBundle(dir);
    if (computed.hash !== meta.hash) {
      console.error(
        `Skill "${name}" manifest hash:${meta.hash} != computed:${computed.hash} — run: node scripts/gen-skills-manifest.mjs --write`,
      );
      problems++;
    }
  }
}

// check for extra skills on disk not in manifest
const onDisk = readdirSync(join(REPO_ROOT, "skills"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
for (const name of onDisk) {
  if (!(name in manifest.skills)) {
    console.error(`Skill "${name}" exists on disk but missing in skills-manifest.json`);
    problems++;
  }
}

if (problems > 0) {
  console.error(`\n${problems} manifest mismatch(es) found.`);
  process.exit(1);
}

console.log(`Packed manifests OK: ${onDisk.length} skill(s) counts match.`);
