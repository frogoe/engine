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
  type ExportConfig,
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

  // 3) icons: one command feeds every platform's set (mac/win/linux now,
  //    ios/android mipmaps the moment E2 attaches them)
  const iconSource = path.join(gameDir, "dist", "assets", "icon.png");
  const runner = options?.iconRunner ?? defaultIconRunner;
  runner(exportDir, iconSource);

  // 4) record: file hashes + artifact integrity
  const files: Record<string, string> = {};
  for (const rel of walkFiles(exportDir)) {
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

export const command = defineCommand({
  args: {
    target: { type: "positional", required: false, description: "desktop (ios/android ship next)" },
    dir: { type: "string", description: "game folder (default: cwd)" },
    force: { type: "boolean", description: "overwrite creator-edited tool files" },
    json: { type: "boolean", description: "machine-readable report" },
    "no-bundle": { type: "boolean", description: "skip bundling, use dist/ as-is" },
  },
  async run({ args }) {
    const dir = args.dir ? path.resolve(String(args.dir)) : process.cwd();
    if (args.target && String(args.target) !== "desktop") {
      throw new Error(
        `frogoe export: unknown target "${String(args.target)}" — desktop ships now; ios/android attach to this same project next`,
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

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`  frogoe export → ${result.dir}`);
      console.log(
        `  artifact sha256 ${result.artifactSha.slice(0, 12)} · ${result.written.length} file(s) written`,
      );
      if (result.skipped.length > 0) {
        console.log(`  ⚠ kept your edits (${result.skipped.length}):`);
        for (const rel of result.skipped) console.log(`    · ${rel}`);
        console.log("    (frogoe export --force overwrites them)");
      }
      console.log("  next: open export/README.md — build & signing steps live there");
    }
  },
});
