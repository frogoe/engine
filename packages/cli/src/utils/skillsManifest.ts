// Frogoe skills freshness — ported from hyperframes skillsManifest.ts (773 LOC)
// Simplified for 5 repo-owned skills, but keeps the production guarantees:
// per-bundle SHA16, global-first discovery, SHA-pinned remote fetch.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TEXT_EXT = new Set([
  ".md",
  ".txt",
  ".mjs",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".html",
  ".css",
  ".json",
  ".svg",
  ".csv",
  ".yml",
  ".yaml",
]);

export interface SkillEntry {
  hash: string;
  files: number;
}

export interface SkillsManifest {
  source: string;
  skills: Record<string, SkillEntry>;
}

export type SkillStatus = "current" | "outdated" | "missing";

export interface SkillDiff {
  name: string;
  status: SkillStatus;
  installedHash?: string;
  latestHash?: string;
}

export interface SkillsDiff {
  updateAvailable: boolean;
  summary: { current: number; outdated: number; missing: number; coreMissing: number };
  skills: SkillDiff[];
}

export interface SkillsCheckResult {
  location: string | null;
  agent: string | null;
  scope: "project" | "global" | null;
  updateAvailable: boolean;
  summary: { current: number; outdated: number; missing: number; coreMissing: number };
  skills: SkillDiff[];
  /** Always false here — frogoe does not cross-reference the upstream skills
   *  lock (5 stable skills, no runtime prune). Kept in the shape so agents
   *  parsing --json share one schema with the hyperframes convention. */
  lockMissing: boolean;
}

const DEFAULT_REPO_SLUG = "frogoe/engine";
export const MANIFEST_FILE = "skills-manifest.json";
const FETCH_TIMEOUT_MS = 4000;

const ENTRY_SKILL = "frogoe";

export function isCoreSkill(name: string): boolean {
  return name === ENTRY_SKILL || name.startsWith("frogoe-");
}

export const FALLBACK_CORE_SKILLS: readonly string[] = [
  "frogoe",
  "frogoe-core",
  "frogoe-creative",
  "frogoe-cli",
  "frogoe-registry",
];

function listFilesSorted(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      if (name === ".DS_Store") continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

export function hashSkillBundle(skillDir: string): SkillEntry {
  const files = listFilesSorted(skillDir);
  const h = createHash("sha256");
  for (const f of files) {
    const rel = relative(skillDir, f).split(sep).join("/");
    h.update(rel);
    h.update("\0");
    const ext = rel.slice(rel.lastIndexOf("."));
    const buf = readFileSync(f);
    if (TEXT_EXT.has(ext)) h.update(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    else h.update(buf);
    h.update("\0");
  }
  return { hash: h.digest("hex").slice(0, 16), files: files.length };
}

export function buildManifest(skillsRoot: string, meta: { source: string }): SkillsManifest {
  const names = readdirSync(skillsRoot)
    .filter((n) => existsSync(join(skillsRoot, n, "SKILL.md")))
    .sort();
  const skills: Record<string, SkillEntry> = {};
  for (const name of names) skills[name] = hashSkillBundle(join(skillsRoot, name));
  return { source: meta.source, skills };
}

interface SkillRoot {
  dir: string;
  agent: string;
  scope: "project" | "global";
}

function agentLabel(hostDir: string): string {
  const name = hostDir.replace(/^\.+/, "");
  return name === "claude" ? "claude-code" : name || "unknown";
}

function agentFromDir(dir: string): string {
  const parts = dir.split(sep).filter(Boolean);
  const i = parts.lastIndexOf("skills");
  return agentLabel(i > 0 ? parts[i - 1]! : (parts[parts.length - 1] ?? ""));
}

function listSubdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function discoverSkillRoots(base: string, scope: "project" | "global"): SkillRoot[] {
  const candidates: SkillRoot[] = [];
  const add = (hostBase: string, host: string): void => {
    const dir = join(hostBase, host, "skills");
    if (existsSync(dir) && statSync(dir).isDirectory())
      candidates.push({ dir, agent: agentLabel(host), scope });
  };
  for (const host of listSubdirs(base)) add(base, host);
  const xdg = join(base, ".config");
  for (const host of listSubdirs(xdg)) add(xdg, host);
  return candidates.sort((a, b) => {
    if (a.agent !== b.agent) {
      if (a.agent === "claude-code") return -1;
      if (b.agent === "claude-code") return 1;
      return a.agent.localeCompare(b.agent);
    }
    return a.dir.localeCompare(b.dir);
  });
}

function scopeForDir(dir: string, home: string, cwd: string): "project" | "global" {
  const norm = (p: string): string => {
    const r = resolve(p);
    return r.endsWith(sep) ? r : r + sep;
  };
  const d = norm(dir);
  if (d.startsWith(norm(cwd))) return "project";
  if (d.startsWith(norm(home))) return "global";
  return "project";
}

function locateInstall(
  skillNames: string[],
  opts: { dir?: string; cwd?: string; home?: string } = {},
): SkillRoot | null {
  if (opts.dir) {
    return existsSync(opts.dir)
      ? {
          dir: opts.dir,
          agent: agentFromDir(opts.dir),
          scope: scopeForDir(opts.dir, opts.home ?? homedir(), opts.cwd ?? process.cwd()),
        }
      : null;
  }
  const roots = [
    ...discoverSkillRoots(opts.home ?? homedir(), "global"),
    ...discoverSkillRoots(opts.cwd ?? process.cwd(), "project"),
  ];
  for (const root of roots) {
    if (skillNames.some((n) => existsSync(join(root.dir, n, "SKILL.md")))) return root;
  }
  return null;
}

function hashInstalled(root: SkillRoot, skillNames: string[]): Record<string, SkillEntry> {
  const out: Record<string, SkillEntry> = {};
  for (const name of skillNames) {
    const skillDir = join(root.dir, name);
    if (existsSync(join(skillDir, "SKILL.md"))) out[name] = hashSkillBundle(skillDir);
  }
  return out;
}

export function diffSkills(
  installed: Record<string, SkillEntry>,
  latest: SkillsManifest,
): SkillsDiff {
  const skills: SkillDiff[] = [];
  const summary = { current: 0, outdated: 0, missing: 0, coreMissing: 0 };
  for (const name of Object.keys(latest.skills).sort()) {
    const latestEntry = latest.skills[name]!;
    const installedEntry = installed[name];
    let status: SkillStatus;
    if (!installedEntry) status = "missing";
    else if (installedEntry.hash === latestEntry.hash) status = "current";
    else status = "outdated";
    if (status === "current") summary.current++;
    else if (status === "outdated") summary.outdated++;
    else {
      summary.missing++;
      if (isCoreSkill(name)) summary.coreMissing++;
    }
    skills.push({
      name,
      status,
      installedHash: installedEntry?.hash,
      latestHash: latestEntry.hash,
    });
  }
  return {
    updateAvailable: summary.outdated > 0 || summary.coreMissing > 0,
    summary,
    skills,
  };
}

function findRepoManifest(cwd = process.cwd()): string | null {
  let dir = cwd;
  for (let i = 0; i < 16; i++) {
    const p = join(dir, MANIFEST_FILE);
    if (existsSync(p)) return p;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function asSkillsManifest(data: unknown, sourceLabel: string): SkillsManifest {
  const m = data as Partial<SkillsManifest> | null;
  if (!m || typeof m !== "object" || typeof m.skills !== "object" || m.skills === null) {
    throw new Error(`Malformed skills manifest from ${sourceLabel}`);
  }
  return m as SkillsManifest;
}

async function fetchManifest(url: string): Promise<SkillsManifest> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Connection: "close" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return asSkillsManifest(await res.json(), url);
  } finally {
    clearTimeout(timeout);
  }
}

async function remoteHeadSha(repoSlug: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-remote", `https://github.com/${repoSlug}.git`, "refs/heads/main"],
      { timeout: FETCH_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    );
    const sha = stdout.split(/\s+/)[0]?.trim() ?? "";
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function resolveLocalManifest(source: string): SkillsManifest {
  const direct = source.endsWith(".json") ? source : join(source, MANIFEST_FILE);
  if (existsSync(direct)) return JSON.parse(readFileSync(direct, "utf8")) as SkillsManifest;
  const skillsRoot = source.endsWith("skills") ? source : join(source, "skills");
  if (existsSync(skillsRoot)) return buildManifest(skillsRoot, { source: skillsRoot });
  throw new Error(`No skills manifest found at: ${source}`);
}

async function fetchRemoteManifest(source?: string): Promise<SkillsManifest> {
  if (source?.startsWith("http")) return fetchManifest(source);
  const repoSlug = source ?? DEFAULT_REPO_SLUG;
  const sha = await remoteHeadSha(repoSlug);
  if (sha) {
    try {
      return await fetchManifest(
        `https://raw.githubusercontent.com/${repoSlug}/${sha}/${MANIFEST_FILE}`,
      );
    } catch {}
  }
  return fetchManifest(`https://raw.githubusercontent.com/${repoSlug}/main/${MANIFEST_FILE}`);
}

async function resolveLatestManifest(
  source?: string,
  cwd = process.cwd(),
  opts: { canonical?: boolean } = {},
): Promise<SkillsManifest> {
  if (source && (source.startsWith(".") || isAbsolute(source))) {
    return resolveLocalManifest(source);
  }
  if (!source && !opts.canonical) {
    const repoManifest = findRepoManifest(cwd);
    if (repoManifest) return JSON.parse(readFileSync(repoManifest, "utf8")) as SkillsManifest;
  }
  return fetchRemoteManifest(source);
}

export async function checkSkills(
  opts: {
    dir?: string;
    source?: string;
    cwd?: string;
    home?: string;
    canonical?: boolean;
  } = {},
): Promise<SkillsCheckResult> {
  const latest = await resolveLatestManifest(opts.source, opts.cwd, { canonical: opts.canonical });
  const skillNames = Object.keys(latest.skills);
  const root = locateInstall(skillNames, { dir: opts.dir, cwd: opts.cwd, home: opts.home });
  const installed = root ? hashInstalled(root, skillNames) : {};
  const diff = diffSkills(installed, latest);
  return {
    location: root?.dir ?? null,
    agent: root?.agent ?? null,
    scope: root?.scope ?? null,
    updateAvailable: diff.updateAvailable,
    summary: diff.summary,
    skills: diff.skills,
    lockMissing: false,
  };
}
