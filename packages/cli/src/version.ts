/** Single source of truth: package.json. Inlined at build time by
 *  esbuild/tsup, so release-please's version bump IS the CLI's version —
 *  no hardcoded copy to drift (the 0.2.1-shipped-as-0.1.0 lesson). */
import pkg from "../package.json";

export const VERSION: string = pkg.version;
