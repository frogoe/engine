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

/** Where the contract runtime lives, given a base dir (pure, so both
 *  layouts are testable):
 *  - repo source mode: packages/cli/src → ../../contract/src/contract.js
 *  - dist mode (published tarball): the bundle at dist/cli.js, with the
 *    contract copied BESIDE it at dist/contract/contract.js (build-copy).
 *    The old `../contract/contract.js` looked one level too high and broke
 *    every `frogoe init` from an npm install. */
export const contractSourceFor = (base: string): string => {
  const repo = path.join(base, "../../contract/src/contract.js");
  if (existsSync(repo)) return repo;
  return path.join(base, "contract/contract.js");
};

const CONTRACT_SOURCE = contractSourceFor(here);

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

/** Registry resolution (pure on `base`): monorepo checkout first, then the
 *  packaged copy that ships beside the bundle (dist/registry — build-copy).
 *  The old `../registry` candidate looked one level too high and broke every
 *  `frogoe add` from an npm install. */
export const registryRootFor = (base: string): string => {
  const candidates = [
    path.resolve(base, "../../../registry"), // repo source mode
    path.resolve(base, "registry"), // dist mode: beside the bundle
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "registry.json"))) {
      return candidate;
    }
  }
  throw new Error(
    "frogoe: registry not found (expected the repo registry or the packaged copy beside the CLI). Run from the repo or reinstall frogoe.",
  );
};

/** Registry resolution: monorepo checkout first, packaged copy second. */
export const registryRoot = (): string => registryRootFor(here);
