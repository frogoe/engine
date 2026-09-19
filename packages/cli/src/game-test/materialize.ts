/** Materializes the frogoe test stub as node_modules/frogoe beside a game
 *  that ships game.test.js — on demand ONLY (games without tests never see
 *  a node_modules). Bun resolves game.js's bare `import "frogoe"` through
 *  the standard node_modules walk; the browser and bundler keep using the
 *  import map (enforced: the artifact must not change when the stub is
 *  present). The stub file is shipped VERBATIM, like injected-runtime. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { stubSourceFor } from "./stub-source.ts";

const STUB_PKG_JSON = `${JSON.stringify({ main: "index.js", name: "frogoe", type: "module" }, null, 2)}\n`;

export const TEST_FILE = "game.test.js";
export const STUB_MARKER = "__frogoeAnyNode"; // a string unique to the stub

export const hasGameTests = (dir: string): boolean => existsSync(path.join(dir, TEST_FILE));

/** Write node_modules/frogoe (two small files) unless a foreign package
 *  already owns the name — never clobber, always teach. Also wires the
 *  property-testing dependency when a test file asks for it. */
export const ensureTestStub = (
  dir: string,
): { ok: true } | { code: "test/deps" | "test/stub-conflict"; error: string } => {
  const pkgDir = path.join(dir, "node_modules", "frogoe");
  const pkgMarker = path.join(pkgDir, "package.json");
  const ours = (source: string): boolean =>
    source.includes(STUB_MARKER) || source === STUB_PKG_JSON;
  if (existsSync(pkgMarker)) {
    const current = readFileSync(pkgMarker, "utf-8");
    if (!ours(current)) {
      return {
        code: "test/stub-conflict",
        error: `node_modules/frogoe exists but is not the frogoe test stub — remove it (a foreign package shadowing the contract name will break tests)`,
      };
    }
  }
  const index = path.join(pkgDir, "index.js");
  if (!existsSync(index) || readFileSync(index, "utf-8") !== stubSourceFor()) {
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(pkgMarker, STUB_PKG_JSON, "utf-8");
    writeFileSync(index, stubSourceFor(), "utf-8");
  }
  // package root marker: bun hoists WORKSPACE packages by name above the
  // node_modules walk — inside the engine repo (examples!) a bare
  // `import "frogoe"` would resolve to packages/cli instead of this stub.
  // A game-local package.json without "workspaces" ends the climb; the
  // nearest node_modules (this stub) wins again.
  const gamePkg = path.join(dir, "package.json");
  if (!existsSync(gamePkg)) {
    writeFileSync(gamePkg, `${JSON.stringify({ private: true }, null, 2)}\n`, "utf-8");
  } else if (/"workspaces"/u.test(readFileSync(gamePkg, "utf-8"))) {
    return {
      code: "test/stub-conflict",
      error: `game package.json declares workspaces — a game folder is a leaf, not a workspace root; remove the workspaces field so the test stub resolves`,
    };
  }
  // property testing: a test file importing fast-check gets the dependency
  // wired (pinned caret, bun-resolved, cached after first install). Proven:
  // bun add does NOT prune the stub beside it.
  const testSource = readFileSync(path.join(dir, TEST_FILE), "utf-8");
  if (/from\s+"fast-check"/u.test(testSource)) {
    const installed = existsSync(path.join(dir, "node_modules", "fast-check"));
    if (!installed) {
      const add = spawnSync("bun", ["add", "fast-check@^4.10.1"], { cwd: dir, encoding: "utf-8" });
      if (add.status !== 0 || !existsSync(path.join(dir, "node_modules", "fast-check"))) {
        return {
          code: "test/deps",
          error: `bun add fast-check failed (${(add.stderr || add.stdout || "").slice(0, 120).trim()}) — fix your network and re-run frogoe check`,
        };
      }
    }
  }
  // keep the materialized bits out of the creator's tree
  const gitignore = path.join(dir, ".gitignore");
  const current = existsSync(gitignore) ? readFileSync(gitignore, "utf-8") : "";
  let next = current;
  if (!/^node_modules\/$/mu.test(next)) next = `${next.trimEnd()}\nnode_modules/\n`;
  if (!/^package\.json$/mu.test(next)) next = `${next.trimEnd()}\npackage.json\n`;
  if (!/^bun\.lock$/mu.test(next)) next = `${next.trimEnd()}\nbun.lock\n`;
  if (next !== current) {
    writeFileSync(gitignore, next.replace(/^\n/u, ""), "utf-8");
  }
  return { ok: true };
};
