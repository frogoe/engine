#!/usr/bin/env node
/** frogoe CLI — thin entry: guards first (version, EPIPE), then citty.
 *  Modeled on the hyperframes entry: cheap exits before heavy imports, and
 *  piped agents may close stdout early — EPIPE is lifecycle, not a crash. */
import { defineCommand, runMain } from "citty";

import { VERSION } from "./version.ts";

for (const stream of [process.stdout, process.stderr]) {
  stream.on?.("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      process.exit(0);
    }
  });
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}

const HELP = `frogoe ${VERSION} — write a closure, ship a game

Commands:
  init [name]   scaffold a runnable game folder
  add <block>   copy a registry HUD block into hud/
  run [dir]     serve with live reload + phone QR
  check [dir]   contract lint (stable finding codes; --json)

Docs: skills/frogoe-core — the whole contract in five references.`;

const main = defineCommand({
  meta: { description: HELP },
  subCommands: {
    add: () => import("./commands/add.ts").then((m) => m.command),
    check: () => import("./commands/check.ts").then((m) => m.command),
    init: () => import("./commands/init.ts").then((m) => m.command),
    run: () => import("./commands/run.ts").then((m) => m.command),
  },
});

await runMain(main);
