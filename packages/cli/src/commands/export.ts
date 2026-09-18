/** frogoe export <target> — turn the verified artifact into a native app
 *  project. Deterministic end to end: bundle → fill templates → payload →
 *  icons. What remains (signing, store submission) needs the creator's
 *  credentials and is documented in the generated README — agent-completes
 *  by design; the CLI never touches credentials. */
import { defineCommand } from "citty";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseBrief } from "@frogoe/lint";
import { bundle } from "../bundle.ts";
import {
  ExportConfigError,
  GEN_DIR,
  type ExportConfig,
  ciTemplatesFor,
  deriveExportConfig,
  exportTemplatesFor,
  fill,
} from "../export.ts";

export interface ExportResult {
  artifactSha: string;
  dir: string;
  skipped: string[];
  written: string[];
}

const sha = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

const walkFiles = (dir: string, base = dir): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
};

/** The integrity record walks the export dir EXCEPT generated bulk:
 *  node_modules (installed), target/ (cargo build), gen/ (tauri ios/
 *  android init) — machine-produced, never creator-edited templates,
 *  and collectively thousands of files that would bloat the record. */
const walkRecordedFiles = (dir: string, base = dir): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "target" || entry === "gen") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkRecordedFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
};

/** Generate or refresh the export project. Idempotent by content hash:
 *  files we generated and nobody touched are refreshed silently; files
 *  whose current hash no longer matches our record were edited by the
 *  creator — they are SKIPPED (and listed) unless force. */
export const generateShell = (
  gameDir: string,
  config: ExportConfig,
  options?: { force?: boolean; iconRunner?: IconRunner },
): ExportResult => {
  const exportDir = path.join(gameDir, "export");
  const templates = exportTemplatesFor(path.dirname(new URL(import.meta.url).pathname));
  const recordPath = path.join(exportDir, "frogoe-export.json");

  type Record_ = { artifactSha?: string; files?: Record<string, string> };
  const previous: Record_ = existsSync(recordPath)
    ? (JSON.parse(readFileSync(recordPath, "utf-8")) as Record_)
    : {};

  const written: string[] = [];
  const skipped: string[] = [];

  // 1) template files (fill + hash-protected overwrite)
  for (const rel of walkFiles(templates)) {
    const filled = fill(readFileSync(path.join(templates, rel), "utf-8"), config, rel);
    const dest = path.join(exportDir, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    const currentHash = existsSync(dest) ? sha(readFileSync(dest)) : null;
    const recordedHash = previous.files?.[rel] ?? null;
    if (
      !options?.force &&
      currentHash !== null &&
      recordedHash !== null &&
      currentHash !== recordedHash
    ) {
      skipped.push(rel); // creator edited it — theirs now
      continue;
    }
    writeFileSync(dest, filled, "utf-8");
    written.push(rel);
  }

  // 2) payload: the verified artifact, byte-identical — at web/, where
  //    the template's frontendDist ("../web", relative to src-tauri/) points
  const artifact = readFileSync(path.join(gameDir, "dist", "index.html"));
  const webDir = path.join(exportDir, "web");
  mkdirSync(webDir, { recursive: true });
  writeFileSync(path.join(webDir, "index.html"), artifact);

  // 2b) the shell's own deps: `bun tauri …` (icon, later dev/build) runs
  //     against export/package.json — a fresh checkout has no node_modules
  //     yet, so export installs them itself. Once. The CLI owns the shell's
  //     lifecycle; "clone and export" must work without a manual install.
  if (!existsSync(path.join(exportDir, "node_modules"))) {
    const install = spawnSync("bun", ["install"], { cwd: exportDir, encoding: "utf-8" });
    if (install.status !== 0) {
      throw new ExportConfigError(
        `frogoe export: bun install failed in export/ (${(install.stderr || "").slice(0, 120)}) — fix your network or run it manually, then re-export`,
      );
    }
  }

  // 3) icons: one command feeds every platform's set (mac/win/linux now,
  //    ios/android mipmaps the moment E2 attaches them)
  const iconSource = path.join(gameDir, "dist", "assets", "icon.png");
  const runner = options?.iconRunner ?? defaultIconRunner;
  runner(exportDir, iconSource);

  // 4) record: file hashes + artifact integrity
  const files: Record<string, string> = {};
  for (const rel of walkRecordedFiles(exportDir)) {
    if (rel === "frogoe-export.json") continue;
    files[rel] = sha(readFileSync(path.join(exportDir, rel)));
  }
  const artifactSha = sha(artifact);
  writeFileSync(recordPath, `${JSON.stringify({ artifactSha, files }, null, 2)}\n`, "utf-8");

  ensureGitignored(gameDir);
  return { artifactSha, dir: exportDir, skipped, written };
};

export type IconRunner = (exportDir: string, iconSource: string) => void;

const defaultIconRunner: IconRunner = (exportDir, iconSource) => {
  if (!existsSync(path.join(exportDir, "src-tauri", "icons", "icon.icns"))) {
    const install = spawnSync("bun", ["install"], { cwd: exportDir, encoding: "utf-8" });
    if (install.status !== 0) {
      throw new ExportConfigError(
        `frogoe export: bun install failed in export/ (${install.stderr.slice(0, 120)}) — check the network and re-run`,
      );
    }
  }
  const icon = spawnSync("bun", ["tauri", "icon", iconSource], {
    cwd: exportDir,
    encoding: "utf-8",
  });
  if (icon.status !== 0) {
    throw new ExportConfigError(
      `frogoe export: tauri icon failed (${(icon.stderr || icon.stdout).slice(0, 120)}) — the icon must be a square PNG ≥1024`,
    );
  }
};

/** The game's .gitignore must exclude the whole export dir (tool-owned,
 *  regenerable — same doctrine as dist/). */
const ensureGitignored = (gameDir: string): void => {
  const gitignore = path.join(gameDir, ".gitignore");
  const current = existsSync(gitignore) ? readFileSync(gitignore, "utf-8") : "";
  if (!/^export\/$/mu.test(current)) {
    writeFileSync(gitignore, `${current.trimEnd()}\nexport/\n`.replace(/^\n/u, ""), "utf-8");
  }
};

export const MOBILE_TARGETS = ["ios", "android"] as const;
export type Target = "desktop" | (typeof MOBILE_TARGETS)[number];

/** Drop the CI workflow at the GAME ROOT — the no-Rust build path. Only
 *  when the game folder IS a git root: a workflow must be tracked to run,
 *  and in nested layouts (an engine repo's examples/) the paths would
 *  lie. Write-if-changed, so re-export never dirties the tree silently. */
export const ensureCiWorkflow = (gameDir: string, config: ExportConfig): string | null => {
  if (!existsSync(path.join(gameDir, ".git"))) return null;
  const templates = ciTemplatesFor(path.dirname(new URL(import.meta.url).pathname));
  const workflowDir = path.join(gameDir, ".github", "workflows");
  const dest = path.join(workflowDir, "frogoe-build-desktop.yml");
  const filled = fill(
    readFileSync(path.join(templates, "build-desktop.yml"), "utf-8"),
    config,
    "frogoe-build-desktop.yml",
  );
  if (existsSync(dest) && readFileSync(dest, "utf-8") === filled) return null;
  mkdirSync(workflowDir, { recursive: true });
  writeFileSync(dest, filled, "utf-8");
  return dest;
};

/** Attach a mobile target to the export project: `tauri ios/android init`
 *  generates gen/<target> (XcodeGen project / Gradle project). Runs ONLY
 *  when the gen dir is missing — a re-init regenerates and would clobber
 *  creator customizations (entitlements, plist tweaks); --force is the
 *  explicit path back. */
export const ensureMobileInit = (
  exportDir: string,
  target: "ios" | "android",
  options?: { force?: boolean; initRunner?: InitRunner },
): "initialized" | "skipped" => {
  const gen = path.join(exportDir, "src-tauri", "gen", GEN_DIR[target]);
  if (existsSync(gen) && options?.force !== true) return "skipped";
  const runner = options?.initRunner ?? defaultInitRunner;
  runner(exportDir, target);
  return "initialized";
};

export type InitRunner = (exportDir: string, target: "ios" | "android") => void;

const defaultInitRunner: InitRunner = (exportDir, target) => {
  const init = spawnSync("bun", ["tauri", target, "init"], {
    cwd: exportDir,
    encoding: "utf-8",
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (init.status !== 0) {
    throw new ExportConfigError(
      `frogoe export ${target}: bun tauri ${target} init failed — ${target === "ios" ? "Xcode and its command line tools are required" : "Android SDK and Java are required (see export/README-android.md)"}`,
    );
  }
};

export const command = defineCommand({
  args: {
    target: {
      type: "positional",
      required: false,
      description: "desktop | ios | android (they share one export/ project)",
    },
    dir: { type: "string", description: "game folder (default: cwd)" },
    force: { type: "boolean", description: "overwrite creator-edited tool files" },
    json: { type: "boolean", description: "machine-readable report" },
    noBundle: { type: "boolean", description: "skip bundling, use dist/ as-is" },
  },
  async run({ args }) {
    const dir = args.dir ? path.resolve(String(args.dir)) : process.cwd();
    const target = (args.target ?? "desktop") as Target;
    if (!["desktop", "ios", "android"].includes(target)) {
      throw new Error(
        `frogoe export: unknown target "${String(args.target)}" — valid: desktop, ios, android (they share one export/ project)`,
      );
    }
    const brief = parseBrief(readFileSync(path.join(dir, "BRIEF.md"), "utf-8"));
    const pin = JSON.parse(readFileSync(path.join(dir, "frogoe.json"), "utf-8")) as {
      appId?: string;
      version?: string;
    };

    if (args.noBundle !== true) {
      console.log("  bundling first — export always carries the freshest verified artifact");
      await bundle({ dir });
    }

    const config = deriveExportConfig({
      appId: pin.appId,
      title: brief?.title,
      version: pin.version,
    });
    const result = generateShell(dir, config, { force: args.force === true });
    ensureGitignored(dir);
    const workflow = target === "desktop" ? ensureCiWorkflow(dir, config) : null;
    if (target === "ios" || target === "android") {
      // attach/refresh the native target, then regenerate the icon set —
      // `tauri icon` populates gen/apple's AppIcon and gen/android's res
      // the moment those dirs exist
      const init = ensureMobileInit(result.dir, target, { force: args.force === true });
      spawnSync("bun", ["tauri", "icon", path.join(dir, "dist", "assets", "icon.png")], {
        cwd: result.dir,
        encoding: "utf-8",
      });
      if (init === "initialized") {
        console.log(`  attached ${target} → export/src-tauri/gen/${GEN_DIR[target]}/`);
      }
    }

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`  frogoe export → ${result.dir}`);
      if (config.appIdIsDefault) {
        console.log(
          '  ⚠ appId defaulted to com.frogoe.* — fine for local dev, but stores require your own reverse-DNS id (frogoe.json → "appId": "com.yourname.game")',
        );
      }
      console.log(
        `  artifact sha256 ${result.artifactSha.slice(0, 12)} · ${result.written.length} file(s) written`,
      );
      if (workflow !== null) {
        console.log(
          `  ci → ${path.relative(dir, workflow)} (tracked — push, and GitHub builds your .dmg without local Rust)`,
        );
      }
      if (result.skipped.length > 0) {
        console.log(`  ⚠ kept your edits (${result.skipped.length}):`);
        for (const rel of result.skipped) console.log(`    · ${rel}`);
        console.log("    (frogoe export --force overwrites them)");
      }
      console.log("  next: open export/README.md — build & signing steps live there");
    }
  },
});
