/** Resolves the test stub source — shipped VERBATIM, like injected-runtime
 *  (never bundled: the materialized node_modules/frogoe/index.js must be
 *  plain browser-less ESM that bun loads directly in game folders). Same
 *  three-candidate resolution as runtimeSource: src mode, dist/game-test,
 *  dist/cli.js sibling. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const stubSourceFor = (): string => {
  const candidates = [
    path.join(here, "frogoe-stub.js"), // source mode (src/game-test/)
    path.join(here, "dist", "frogoe-stub.js"), // dist mode
    path.join(here, "..", "frogoe-stub.js"), // dist/cli.js sibling
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf-8");
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "frogoe-stub.js not found (looked in src/game-test/, dist/) — the CLI install is broken; report it",
  );
};
