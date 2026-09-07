/** verify:npm — the USER journey gate. Everything else in verify tests
 *  the repo; this tests what npm users actually run: the PACKAGED CLI
 *  (dist build, packed tarball) under NODE (not bun), in a cold folder.
 *
 *  Born from a real regression: `frogoe vision` shipped with a Bun.file
 *  call — fine under bun (repo), a crash under node (every npm user).
 *  This gate would have caught it in seconds:
 *
 *    build → npm pack → install tarball → node runs:
 *      frogoe --version · init · lint (findings, no crash) ·
 *      vision + embed in a BRIEF-less dir (clean errors, no crash)
 *
 *  Chrome-free by design (heavy gates live in verify:art). */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = path.join(root, "packages", "cli");

const run = (cmd, args, cwd, { expectFail = false } = {}) => {
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: "utf-8", stdio: "pipe" });
    if (expectFail) {
      throw new Error(`expected a non-zero exit, got success: ${cmd} ${args.join(" ")}`);
    }
    return out;
  } catch (error) {
    if (!expectFail) {
      throw error;
    }
    const out = [error.stdout, error.stderr].filter(Boolean).join("\n");
    if (/ReferenceError|SyntaxError|Cannot find module|is not defined/u.test(out)) {
      throw new Error(`command crashed instead of failing cleanly:\n${out.slice(0, 400)}`);
    }
    return out;
  }
};

console.log("$ frogoe build (tsup + build-copy)");
execFileSync("bun", ["run", "build"], { cwd: cliDir, stdio: "inherit" });

console.log("$ npm pack");
const tarball = execFileSync("npm", ["pack", "--json"], { cwd: cliDir, encoding: "utf-8" });
const packed = JSON.parse(tarball)[0]?.filename;
if (!packed) throw new Error("npm pack produced no tarball");
console.log(`  ${packed}`);

const tmp = mkdtempSync(path.join(os.tmpdir(), "frogoe-npm-"));
try {
  console.log("$ npm install <tarball> (the user's very first command)");
  mkdirSync(path.join(tmp, "game"), { recursive: true });
  writeFileSync(path.join(tmp, "game", "package.json"), '{"name":"user-game","private":true}\n');
  run("npm", ["install", path.join(cliDir, packed)], path.join(tmp, "game"));
  const frogoe = path.join(tmp, "game", "node_modules", ".bin", "frogoe");

  console.log("$ node frogoe --version");
  const version = run("node", [frogoe, "--version"], tmp).trim();
  if (!/^\d+\.\d+\.\d+/u.test(version)) throw new Error(`unexpected --version output: ${version}`);
  console.log(`  ${version}`);

  console.log("$ node frogoe init demo");
  const initOut = run("node", [frogoe, "init", "demo"], tmp);
  if (!/frogoe init|game/iu.test(initOut)) throw new Error("init printed nothing sane");
  const demo = path.join(tmp, "demo");

  console.log("$ node frogoe lint demo (scaffold: teaching findings, zero crashes)");
  const lintOut = run("node", [frogoe, "lint", demo], tmp, { expectFail: true });
  if (!/brief\/todo/u.test(lintOut)) {
    throw new Error(`scaffold lint should teach brief/todo:\n${lintOut.slice(0, 300)}`);
  }
  if (/Bun is not defined|Cannot find module/u.test(lintOut)) {
    throw new Error("lint crashed under node");
  }

  console.log("$ node frogoe vision (BRIEF-less dir: clean error, node-portable)");
  const visionOut = run("node", [frogoe, "vision"], tmp, { expectFail: true });
  if (!/no BRIEF\.md in this folder/u.test(visionOut)) {
    throw new Error(`vision should fail with the BRIEF error, got:\n${visionOut.slice(0, 300)}`);
  }

  console.log("$ node frogoe embed demo (no dist yet: clean discipline error)");
  const embedOut = run("node", [frogoe, "embed", "demo"], tmp, { expectFail: true });
  if (!/check → bundle → embed/u.test(embedOut)) {
    throw new Error(`embed should teach the order, got:\n${embedOut.slice(0, 300)}`);
  }

  console.log("\nverify:npm OK — the packaged CLI runs the user journey under node.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
  // the tarball is build detritus for CI — dist/ stays (repo tests need it)
  rmSync(path.join(cliDir, packed), { force: true });
}
