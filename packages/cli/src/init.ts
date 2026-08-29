/** frogoe init — scaffold a runnable game folder from nothing.
 *  The result boots: `frogoe run` inside it shows a living world. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  briefTemplate,
  gitignoreTemplate,
  contractHeader,
  CONTRACT_VERSION,
  frogoeJsonTemplate,
  gameTemplate,
  indexTemplate,
} from "./templates.ts";

export interface InitResult {
  dir: string;
  files: string[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
// source mode (repo): workspace contract; dist mode (published): copied asset
const CONTRACT_SOURCE = existsSync(path.join(here, "../../contract/src/contract.js"))
  ? path.join(here, "../../contract/src/contract.js")
  : path.join(here, "../contract/contract.js");

export const scaffold = (name: string, options?: { force?: boolean; dir?: string }): InitResult => {
  const root = options?.dir ?? process.cwd();
  const target = path.resolve(root, name);
  if (existsSync(target)) {
    const occupied = existsSync(path.join(target, "frogoe.json"));
    if (occupied && !options?.force) {
      throw new Error(
        `frogoe init: ${target} already has a frogoe game (frogoe.json present). Use --force to rematerialize .frogoe/ and scaffolds.`,
      );
    }
  }
  mkdirSync(path.join(target, ".frogoe"), { recursive: true });
  mkdirSync(path.join(target, "blocks"), { recursive: true });

  const contract = contractHeader(CONTRACT_VERSION) + readFileSync(CONTRACT_SOURCE, "utf-8");
  const sharedDir = path.join(here, "templates/_shared");
  const agentDocs = existsSync(path.join(sharedDir, "CLAUDE.md"))
    ? readFileSync(path.join(sharedDir, "CLAUDE.md"), "utf-8")
    : "";
  const agentsDocs = existsSync(path.join(sharedDir, "AGENTS.md"))
    ? readFileSync(path.join(sharedDir, "AGENTS.md"), "utf-8")
    : "";

  // --force rematerializes scaffold but NEVER overwrites user game code
  const files: Array<[string, string, boolean]> = [
    [".gitignore", gitignoreTemplate, true],
    ...(agentDocs ? ([["CLAUDE.md", agentDocs, true]] as Array<[string, string, boolean]>) : []),
    ...(agentsDocs ? ([["AGENTS.md", agentsDocs, true]] as Array<[string, string, boolean]>) : []),
    ["BRIEF.md", briefTemplate, true],
    ["frogoe.json", frogoeJsonTemplate(CONTRACT_VERSION), true],
    ["index.html", indexTemplate, false],
    ["game.js", gameTemplate, false],
    [".frogoe/contract.js", contract, true],
    ["blocks/.gitkeep", "", true],
  ];
  for (const [rel, body, overwrite] of files) {
    const dest = path.join(target, rel);
    if (!overwrite && existsSync(dest)) continue;
    writeFileSync(dest, body, "utf-8");
  }
  return { dir: target, files: files.map(([rel]) => rel) };
};

/** Re-materialize only .frogoe/ from the pin (upgrade path). */
export const rematerializeContract = (projectDir: string): string => {
  const pinPath = path.join(projectDir, "frogoe.json");
  if (!existsSync(pinPath)) {
    throw new Error("frogoe: no frogoe.json here — is this a frogoe game folder?");
  }
  const pin = JSON.parse(readFileSync(pinPath, "utf-8")) as { contract?: string };
  const version = pin.contract ?? CONTRACT_VERSION;
  const contract = contractHeader(version) + readFileSync(CONTRACT_SOURCE, "utf-8");
  mkdirSync(path.join(projectDir, ".frogoe"), { recursive: true });
  const out = path.join(projectDir, ".frogoe/contract.js");
  writeFileSync(out, contract, "utf-8");
  return out;
};

/** Registry resolution: monorepo checkout first, packaged copy second. */
export const registryRoot = (): string => {
  const candidates = [
    path.resolve(here, "../../../registry"), // repo source mode
    path.resolve(here, "../registry"), // dist mode (build:copy)
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "registry.json"))) {
      return candidate;
    }
  }
  throw new Error(
    "frogoe: registry not found (expected ../registry or packaged copy). Run from the repo or install @frogoe/cli fully.",
  );
};
