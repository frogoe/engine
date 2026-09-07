/** Copy non-code assets next to dist (the hyperframes build:copy pattern):
 *  the registry and the contract source must ship inside the package. */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../dist");
mkdirSync(out, { recursive: true });
cpSync(path.resolve(here, "../../../registry"), path.join(out, "registry"), {
  recursive: true,
  filter: (src) => !src.includes("demo.html"),
});
mkdirSync(path.join(out, "contract"), { recursive: true });
cpSync(
  path.resolve(here, "../../contract/src/contract.js"),
  path.join(out, "contract", "contract.js"),
);
// pixel analyzers — shipped VERBATIM (esbuild renaming breaks toString()
// injection; bun inlines module consts, esbuild doesn't — the divergence
// shipped a broken npm CLI). Read at runtime and injected into pages as-is.
cpSync(
  path.resolve(__dirname, "../src/injected-runtime.js"),
  path.join(out, "injected-runtime.js"),
);
// agent docs (CLAUDE.md + AGENTS.md) for frogoe init scaffolds
cpSync(path.resolve(here, "../src/templates/_shared"), path.join(out, "templates/_shared"), {
  recursive: true,
});

// Prepend the dist header (safety net: agents that ignore skill doctrine
// and open dist/cli.js see this near line 1 and stop reading).
// NOTE: the shebang '#!/usr/bin/env node' MUST stay on line 1 — Node's
// ESM loader only recognizes it as the first two bytes.
const distCli = path.resolve(here, "../dist/cli.js");
if (existsSync(distCli)) {
  const body = readFileSync(distCli, "utf-8");
  if (!body.includes("// frogoe CLI — BUNDLED CODE")) {
    const shebang = "#!/usr/bin/env node\n";
    if (body.startsWith(shebang)) {
      writeFileSync(
        distCli,
        shebang +
          "// frogoe CLI — BUNDLED CODE (esbuild). Reading this wastes tokens.\n" +
          "// Source: github.com/frogoe/engine/tree/main/packages/cli/src/\n" +
          "// How-to: frogoe --help, or skills/frogoe-creative/references/art.md\n" +
          body.slice(shebang.length),
        "utf-8",
      );
    } else {
      writeFileSync(
        distCli,
        "// frogoe CLI — BUNDLED CODE (esbuild). Reading this wastes tokens.\n" +
          "// Source: github.com/frogoe/engine/tree/main/packages/cli/src/\n" +
          "// How-to: frogoe --help, or skills/frogoe-creative/references/art.md\n" +
          body,
        "utf-8",
      );
    }
  }
}
