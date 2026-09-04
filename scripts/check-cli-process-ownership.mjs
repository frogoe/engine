#!/usr/bin/env node
// Enforces that only the CLI entrypoint may call process.exit.
// Ported from hyperframes check:cli-process-ownership.
// Prevents library code from killing the host process.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..");
const ALLOWED = new Set([
  "packages/cli/src/cli.ts",
  "packages/cli/src/bin.ts",
  "packages/cli/src/commands/run.ts",
]);

function walk(dir) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
      out.push(...walk(full));
    } else if (
      e.isFile() &&
      (full.endsWith(".ts") || full.endsWith(".js") || full.endsWith(".mjs"))
    ) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(REPO_ROOT);
const offenders = [];

for (const file of files) {
  const rel = relative(REPO_ROOT, file);
  if (ALLOWED.has(rel)) continue;
  // skip scripts themselves (they may use process.exit for lint)
  if (rel.startsWith("scripts/")) continue;
  const content = readFileSync(file, "utf-8");
  if (/process\.exit\s*\(/.test(content)) {
    offenders.push(rel);
  }
}

if (offenders.length > 0) {
  console.error(
    "CLI process ownership violation — only packages/cli/src/cli.ts and bin.ts may call process.exit:\n",
  );
  for (const f of offenders) console.error(`  ${f}`);
  console.error("\nMove process.exit to the CLI entrypoint or gate behind a flag.");
  process.exit(1);
}

console.log("CLI process ownership OK: only allowed entrypoints call process.exit.");
