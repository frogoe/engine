/** Copy non-code assets next to dist (the hyperframes build:copy pattern):
 *  the registry and the contract source must ship inside the package. */
import { cpSync, mkdirSync } from "node:fs";
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
