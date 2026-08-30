#!/usr/bin/env node
/** Release guards — the publish workflow's decision logic, extracted
 *  into a script so it is TESTED, not just executed (the HyperFrames
 *  validate-release-channel / publish-workflow-test pattern). The
 *  workflow calls these as CLI subcommands; the unit tests import the
 *  functions. Every rule that once lived as inline YAML shell is here. */

const STABLE = /^\d+\.\d+\.\d+$/u;
const PRERELEASE = /^(\d+\.\d+\.\d+)-([0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*$/u;

/** stable → latest; prerelease → its channel id (0.2.3-beta.1 → beta) */
export const resolveChannel = (version) => {
  if (STABLE.test(version)) {
    return { channel: "stable", distTag: "latest" };
  }
  const match = PRERELEASE.exec(version);
  if (match) {
    return { channel: "prerelease", distTag: match[2] };
  }
  return null;
};

export const PACK_MIN_FILES = 20;
export const PACK_MUST_CONTAIN = ["bin/frogoe.mjs", "dist/cli.js", "dist/contract/contract.js"];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** npm pack --dry-run output → errors. A gutted tarball (the 2-file,
 *  779-byte 0.2.1 attempt) must never reach the registry: unpublish
 *  windows are narrow and thousands may install within minutes. */
export const packManifestErrors = (
  packLog,
  { minFiles = PACK_MIN_FILES, mustContain = PACK_MUST_CONTAIN } = {},
) => {
  const errors = [];
  for (const must of mustContain) {
    if (!new RegExp(`\\s${escape(must)}(\\s|$)`, "u").test(packLog)) {
      errors.push(`missing ${must}`);
    }
  }
  const total = /total files: (\d+)/u.exec(packLog);
  if (!total) {
    errors.push("no 'total files:' line — not an npm pack log?");
  } else if (Number(total[1]) < minFiles) {
    errors.push(`only ${total[1]} files (min ${minFiles}) — the build did not land in the tarball`);
  }
  return errors;
};

/** npm floor for trusted publishing (OIDC auth landed in 11.5.1) */
export const NPM_TRUSTED_PUBLISHING_FLOOR = "11.5.1";

export const npmSupportsTrustedPublishing = (npmVersion) => {
  const parse = (v) => {
    const parts = v.split(".").map((n) => Number.parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts;
  };
  const [am, ap, apatch] = parse(npmVersion);
  const [bm, bp, bpatch] = parse(NPM_TRUSTED_PUBLISHING_FLOOR);
  if (am !== bm) return am > bm;
  if (ap !== bp) return ap > bp;
  return apatch >= bpatch;
};

const fail = (lines) => {
  for (const line of lines) console.error(`::error::${line}`);
  process.exit(1);
};

// CLI only when executed directly — importing (from tests) must be
// side-effect free
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const [command, argument] = process.argv.slice(2);

  switch (command) {
    case "resolve": {
      if (!argument) fail(["usage: release-guards.mjs resolve <version>"]);
      const resolved = resolveChannel(argument);
      if (!resolved) fail([`'${argument}' is not a version`]);
      console.log(`channel=${resolved.channel}`);
      console.log(`dist_tag=${resolved.distTag}`);
      break;
    }
    case "pack": {
      if (!argument) fail(["usage: release-guards.mjs pack <pack-dry-run-log>"]);
      let log = "";
      try {
        log = (await import("node:fs")).readFileSync(argument, "utf-8");
      } catch {
        fail([`cannot read ${argument}`]);
      }
      console.log(log.trim());
      const errors = packManifestErrors(log);
      if (errors.length > 0) fail(errors);
      console.log("packed manifest ok");
      break;
    }
    case "npm-floor": {
      if (!argument) fail(["usage: release-guards.mjs npm-floor <npm-version>"]);
      if (!npmSupportsTrustedPublishing(argument)) {
        fail([
          `npm ${argument} predates trusted publishing (needs >= ${NPM_TRUSTED_PUBLISHING_FLOOR})`,
        ]);
      }
      console.log(`npm ${argument} ok (>= ${NPM_TRUSTED_PUBLISHING_FLOOR})`);
      break;
    }
    case undefined:
      fail(["usage: release-guards.mjs <resolve|pack> [arg]"]);
      break;
    default:
      fail([`unknown command '${command}'`]);
  }
}
