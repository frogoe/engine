/** verify-games — the examples gauntlet, auto-discovered.
 *
 *  Adding an example used to mean appending three chained commands per
 *  package.json line; now examples/ is the single source of truth:
 *  every folder with a frogoe.json IS a game, discovered at run time —
 *  a new reference game costs zero script edits.
 *
 *    node scripts/verify-games.mjs lint  → frogoe lint per example
 *    node scripts/verify-games.mjs art   → check → bundle → embed per
 *                                           example, plus the embed-card
 *                                           e2e for games that END under
 *                                           scripted play (BRIEF session
 *                                           blitz; round/toy never reach
 *                                           frogoe:finish, so the e2e
 *                                           would hang by design and is
 *                                           skipped with a printed note)
 *
 *  Sequential on purpose: the live sandbox owns a headless Chrome per
 *  game — parallel runs fight for CPU and muddy FPS gates. */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join("packages", "cli", "src", "cli.ts");
const examplesDir = path.join(root, "examples");

/** Every folder with a frogoe.json is a game — the lockstep-free list. */
const discoverGames = () =>
  readdirSync(examplesDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(path.join(examplesDir, entry.name, "frogoe.json")),
    )
    .map((entry) => entry.name)
    .sort();

/** Declared run shape from BRIEF.md frontmatter (absent = blitz). */
const sessionOf = (game) => {
  const brief = readFileSync(path.join(examplesDir, game, "BRIEF.md"), "utf-8");
  const found = /^---\r?\n[\s\S]*?^session:\s*(\w+)/mu.exec(brief);
  return found?.[1] ?? "blitz";
};

const frogoe = (args, label) => {
  console.log(`$ frogoe ${args.join(" ")}   (${label})`);
  execFileSync("bun", [cli, ...args], { cwd: root, stdio: "inherit" });
};

const mode = process.argv[2] ?? "";
const games = discoverGames();
if (games.length === 0) throw new Error("no games found in examples/ — nothing to verify");
console.log(`verify-games [${mode}] → ${games.join(", ")}`);

if (mode === "lint") {
  for (const game of games) {
    frogoe(["lint", `examples/${game}`], "static gate");
  }
} else if (mode === "art") {
  for (const game of games) {
    const dir = `examples/${game}`;
    frogoe(["check", dir], "full gate");
    frogoe(["bundle", dir], "one-file artifact");
    frogoe(["embed", dir], "the card");
    if (sessionOf(game) === "blitz") {
      console.log(`$ bun test/embed.e2e.ts ${dir}/dist/embed.html   (card lifecycle e2e)`);
      execFileSync(
        "bun",
        [path.join("packages", "cli", "test", "embed.e2e.ts"), `${dir}/dist/embed.html`],
        {
          cwd: root,
          stdio: "inherit",
        },
      );
    } else {
      console.log(
        `  (session ${sessionOf(game)}: no card e2e — ${game} never finishes under scripted play)`,
      );
    }
  }
} else {
  throw new Error("usage: node scripts/verify-games.mjs lint|art");
}

console.log(`\nverify-games OK — ${games.length} game(s) passed the ${mode} gauntlet.`);
