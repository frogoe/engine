#!/usr/bin/env node
/** frogoe CLI — thin entry: guards first (version, EPIPE, errors), then citty.
 *  Modeled on the hyperframes entry: cheap exits before heavy imports, and
 *  piped agents may close stdout early — EPIPE is lifecycle, not a crash.
 *
 *  Error boundary (the hyperframes production pattern): teaching errors
 *  print MESSAGE-ONLY (no stack trace — agents burn 50K+ tokens reading
 *  bundled dist/ they should never open). Unexpected errors show the full
 *  stack. FROGOE_DEBUG=1 forces full output for CLI debugging. */
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

if (process.argv.includes("--source")) {
  console.log("# frogoe CLI source of truth");
  console.log("# repo:   https://github.com/frogoe/engine");
  console.log("# cli:    packages/cli/src/");
  console.log("# skills: skills/");
  console.log("# Never read the installed dist/ — it is bundled/minified.");
  console.log("# Clone the repo to read the readable source:");
  console.log("#   git clone https://github.com/frogoe/engine");
  process.exit(0);
}

const HELP = `frogoe ${VERSION} — write a closure, ship a game

Commands:
  init [name]              scaffold a runnable game folder
  add <block>              copy a registry HUD block into blocks/
  run [dir]                serve with live reload + phone QR (--tunnel: any network)
  lint [dir]               static contract lint — fast iteration (stable codes; --json)
  check [dir]              full gate: lint + live Chrome sandbox (FPS, HUD outline)
                           --fast: static only, no Chrome (quick iteration)
  report [dir]             last playtest session: fps dips, errors, when
  bundle [dir]             dissolve externals → one self-contained HTML
  embed [dir]              wrap the bundle in a card (poster + manifest)
  vision [dir]             see the game: objects, frames, art as ASCII maps
                           --poster/--icon/--gameplay/--objects: one window only
                           --full: all windows (default is poster + gameplay)
  skills [check|update]    skill freshness — check or update via npx skills add

Docs: skills/frogoe-core — the whole contract in five references.`;

// ── Teaching-error boundary ────────────────────────────────────────────────
// frogoe errors are designed to be self-resolving: the message carries a
// fix, a code, or a "run this next" hint. Printing a stack trace for
// those is token waste — agents open dist/cli.js and burn 50K+ tokens
// reading minified code that has nothing to teach. This boundary prints
// message-only for known patterns; FROGOE_DEBUG=1 forces full output.

const TEACHING_ERROR_PATTERNS: RegExp[] = [
  /^frogoe /u, // "frogoe add: unknown block..."
  /^bundle\//u, // "bundle/art-missing — ..."
  /^art-/u, // "art-crash — ..."
  /— run /u, // "— run `frogoe check` first"
  /— see /u, // "— see frogoe-creative → references/art.md"
  /Available: /u, // "Available: score-card, fuel-gauge, ..."
  /fix: /u, // lint findings carry fix:
  /recipe: /u, // lint findings carry recipe:
];

const isTeachingError = (message: string): boolean =>
  TEACHING_ERROR_PATTERNS.some((pattern) => pattern.test(message));

const ORIGINAL_CONSOLE_ERROR = console.error;

console.error = (...args: unknown[]): void => {
  const first = args[0];
  if (first instanceof Error && process.env.FROGOE_DEBUG !== "1") {
    const msg = first.message;
    if (isTeachingError(msg)) {
      // Teaching error: message only, plus the "don't read dist" hint
      ORIGINAL_CONSOLE_ERROR(`\n  ${msg}\n`);
      ORIGINAL_CONSOLE_ERROR(
        `  (self-resolving: apply the fix above. This CLI is open-source —\n` +
          `   readable code at packages/cli/src/, never read dist/.)\n`,
      );
      return;
    }
  }
  ORIGINAL_CONSOLE_ERROR(...args);
};

// ── Unknown flag rejection (the hyperframes typo-protection lesson) ───────
// citty silently ignores unknown flags, dropping their value — a typo like
// `--jsn` instead of `--json` produces a human-readable dump an agent
// then parses as prose. Fail loudly instead: a rejected typo costs 50
// tokens; a silently-wrong run costs 100K+.
const KNOWN_FLAGS = new Set([
  "--json",
  "--fast",
  "--force",
  "--out",
  "--tunnel",
  "--port",
  "--pretty",
  "--full",
  "--poster",
  "--icon",
  "--gameplay",
  "--objects",
  "--check",
  "--update",
  "--verbose",
]);

const UNKNOWN_FLAG = /^--[a-z][a-z0-9-]*$/u;
const unknownFlags = process.argv.filter(
  (arg) =>
    UNKNOWN_FLAG.test(arg) &&
    !KNOWN_FLAGS.has(arg) &&
    arg !== "--version" &&
    arg !== "-v" &&
    arg !== "--help" &&
    arg !== "-h",
);
if (unknownFlags.length > 0 && process.env.FROGOE_DEBUG !== "1") {
  ORIGINAL_CONSOLE_ERROR(`\n  frogoe: unknown flag ${unknownFlags[0]} — did you mean --json?`);
  ORIGINAL_CONSOLE_ERROR(`  (this fails loudly so a typo can't silently produce wrong output.)\n`);
  process.exit(1);
}

// ── Non-TTY output shedding (the hyperframes piped-agent pattern) ────────
// When stdout is piped (agent context), suppress decorative output that
// costs tokens without carrying information.

const main = defineCommand({
  meta: { description: HELP },
  subCommands: {
    add: () => import("./commands/add.ts").then((m) => m.command),
    bundle: () => import("./commands/bundle.ts").then((m) => m.command),
    check: () => import("./commands/check.ts").then((m) => m.command),
    embed: () => import("./commands/embed.ts").then((m) => m.command),
    vision: () => import("./commands/vision.ts").then((m) => m.command),
    init: () => import("./commands/init.ts").then((m) => m.command),
    lint: () => import("./commands/lint.ts").then((m) => m.command),
    report: () => import("./commands/report.ts").then((m) => m.command),
    run: () => import("./commands/run.ts").then((m) => m.command),
    skills: () => import("./commands/skills.ts").then((m) => m.command),
  },
});

await runMain(main);
