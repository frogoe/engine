import { defineCommand } from "citty";
import { execFileSync, spawn } from "node:child_process";

import { checkSkills, isCoreSkill } from "../utils/skillsManifest.ts";

function hasNpx(): boolean {
  try {
    const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const exe = process.platform === "win32" ? "cmd.exe" : cmd;
    const args =
      process.platform === "win32" ? ["/d", "/s", "/c", "npx.cmd", "--version"] : ["--version"];
    execFileSync(exe, args, { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    try {
      execFileSync("npx", ["--version"], { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function buildNpxCommand(args: readonly string[]): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "npx.cmd", ...args] };
  }
  return { command: "npx", args: [...args] };
}

function spawnNpx(args: string[]): Promise<void> {
  const npx = buildNpxCommand(args);
  return new Promise((resolve, reject) => {
    const child = spawn(npx.command, npx.args, {
      stdio: ["inherit", 2, 2],
      timeout: 300_000,
      env: {
        ...process.env,
        GIT_CLONE_PROTECTION_ACTIVE: "0",
        GIT_LFS_SKIP_SMUDGE: "1",
      },
    });
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else if (signal === "SIGINT" || code === 130) resolve();
      else reject(new Error(`npx ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

const GLOBAL_INSTALL_ARGS_TAIL = [
  "--global",
  "--agent",
  "claude-code",
  "universal",
  "--copy",
  "--full-depth",
  "--yes",
];

const SOURCE_URL = "https://github.com/frogoe/engine";

async function installSkills(selection: "*" | readonly string[]): Promise<void> {
  const skillArgs =
    selection === "*" ? ["--skill", "*"] : (selection as string[]).flatMap((n) => ["--skill", n]);
  if (!hasNpx()) throw new Error("npx not found. Install Node.js and retry.");
  if (!hasGit()) throw new Error("git not found. Install git and retry.");
  await spawnNpx(["skills", "add", SOURCE_URL, ...skillArgs, ...GLOBAL_INSTALL_ARGS_TAIL]);
}

function renderCheck(result: Awaited<ReturnType<typeof checkSkills>>): void {
  console.log();
  console.log("frogoe skills");
  console.log();
  if (!result.location) {
    console.log("  No frogoe skills found in the usual locations.");
    console.log("  Install: npx skills add frogoe/engine");
    console.log("  Or: frogoe skills update");
    console.log();
    return;
  }
  console.log(`  Location  ${result.location} (${result.agent})`);
  console.log();
  const parts: string[] = [];
  parts.push(`✓ ${result.summary.current} current`);
  if (result.summary.outdated) parts.push(`↑ ${result.summary.outdated} outdated`);
  if (result.summary.coreMissing) parts.push(`◦ ${result.summary.coreMissing} core not installed`);
  const onDemandMissing = result.summary.missing - result.summary.coreMissing;
  if (onDemandMissing) parts.push(`◦ ${onDemandMissing} available on demand`);
  console.log(`  ${parts.join("   ")}`);
  for (const s of result.skills.filter((x) => x.status === "outdated")) {
    console.log(`    ↑ ${s.name}`);
  }
  for (const s of result.skills.filter((x) => x.status === "missing" && isCoreSkill(x.name))) {
    console.log(`    ◦ ${s.name} (core)`);
  }
  console.log();
  if (result.updateAvailable) {
    console.log("  Update: frogoe skills update  or  npx skills add frogoe/engine");
  } else {
    console.log("  Installed skills are up to date");
  }
  console.log();
}

const checkCommand = defineCommand({
  meta: { name: "check", description: "Check whether installed skills are the latest version" },
  args: {
    json: { type: "boolean", description: "Output as JSON", default: false },
    dir: { type: "string", description: "Skills directory to check" },
    source: { type: "string", description: "Where 'latest' comes from" },
  },
  async run({ args }) {
    try {
      const result = await checkSkills({
        dir: args.dir as string | undefined,
        source: args.source as string | undefined,
        canonical: true,
      });
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        renderCheck(result);
      }
      if (result.updateAvailable) process.exitCode = 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Malformed") || msg.includes("HTTP") || msg.includes("fetch")) {
        console.error(`Skills check failed (offline or GitHub unreachable): ${msg}`);
        console.error("Try: npx skills add frogoe/engine  — or retry when online.");
      } else {
        console.error(`Skills check failed: ${msg}`);
      }
      process.exitCode = 1;
    }
  },
});

const updateCommand = defineCommand({
  meta: {
    name: "update",
    description:
      "Update frogoe skills to the latest (core + installed). Pass names to also install them.",
  },
  args: {
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  async run({ args }) {
    const requested = ((args._ as unknown[] | undefined) ?? []).map(String).filter(Boolean);
    const invalid = requested.filter((n) => !/^[a-z0-9][a-z0-9._-]*$/i.test(n));
    if (invalid.length) {
      console.error(`Invalid skill name(s): ${invalid.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    try {
      const check = await checkSkills({ canonical: true });
      const toInstall = new Set<string>();
      for (const s of check.skills) {
        if (s.status === "outdated" || (s.status === "missing" && isCoreSkill(s.name)))
          toInstall.add(s.name);
      }
      for (const n of requested) toInstall.add(n);
      if (toInstall.size === 0) {
        const msg = "Installed skills are already up to date.";
        if (args.json) console.log(JSON.stringify({ ...check, message: msg }, null, 2));
        else console.log(msg);
        return;
      }
      const list = [...toInstall];
      console.log(`Updating ${list.length} skill(s): ${list.join(", ")}`);
      await installSkills(list);
      const verify = await checkSkills({ canonical: true });
      if (args.json) console.log(JSON.stringify(verify, null, 2));
      else renderCheck(verify);
      if (verify.updateAvailable) process.exitCode = 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Update failed: ${msg}`);
      if (msg.includes("npx") || msg.includes("git")) {
        console.error("Install Node.js and git, then retry: npx skills add frogoe/engine");
      }
      process.exitCode = 1;
    }
  },
});

export const command = defineCommand({
  meta: {
    name: "skills",
    description: "Install, check, and update frogoe skills for AI coding tools",
  },
  subCommands: { check: checkCommand, update: updateCommand },
  args: {},
  async run() {
    // bare `frogoe skills` — install all (like `hyperframes skills`)
    try {
      console.log("Installing all frogoe skills...");
      await installSkills("*");
      const result = await checkSkills({ canonical: true });
      renderCheck(result);
    } catch (err) {
      console.error(`Install failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  },
});
