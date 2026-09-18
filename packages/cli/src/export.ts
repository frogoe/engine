/** frogoe export — deterministic shell generation from token templates.
 *  NO code generation: the templates are fixed, versioned files in this
 *  repo (proven once by the E1 spike on macOS + iOS simulator); each game
 *  differs only by DATA injected into token slots. Games are payloads,
 *  shells are code — the same doctrine the contract applies to HUD. */
import { existsSync } from "node:fs";
import path from "node:path";

/** Tauri's gen dir names don't match the target names: ios → apple. */
export const GEN_DIR: Record<"ios" | "android", string> = {
  android: "android",
  ios: "apple",
};

/** Every token a template may carry. fill() throws if a template uses a
 *  token outside this set (typo guard) and if any token survives a fill
 *  (completeness guard) — a half-filled shell must never exist. */
export const TOKENS = [
  "FROGOE_APP_NAME",
  "FROGOE_APP_ID",
  "FROGOE_APP_VERSION",
  "FROGOE_CRATE",
  "FROGOE_CRATE_LIB",
] as const;

export type Token = (typeof TOKENS)[number];

export interface ExportConfig {
  /** display name — BRIEF title (also productName; Tauri forbids /\:*?"<>|) */
  appName: string;
  /** reverse-DNS identifier. Defaults to com.frogoe.<crate> (local dev —
   *  Expo-style instant start); store submission needs the author's own. */
  appId: string;
  /** true when appId came from the com.frogoe.* default, not the author */
  appIdIsDefault: boolean;
  /** semver-ish display version, default "1.0.0" */
  version: string;
  /** cargo package name — kebab(title) */
  crate: string;
  /** crate lib name — snake(crate) + "_lib" (main.rs calls it) */
  crateLib: string;
}

const APP_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/u;
const PRODUCT_NAME_FORBIDDEN = /[/\\:*?"<>|]/u;

export const validateAppId = (id: string): boolean => APP_ID_PATTERN.test(id);

const kebab = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['’]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

const snake = (value: string): string => value.replaceAll("-", "_");

export class ExportConfigError extends Error {}

/** Derive the full export config from author-owned inputs. Throws
 *  ExportConfigError with a teaching message — these are the gates a
 *  creator meets before any file is written. */
export const deriveExportConfig = (input: {
  appId?: string;
  title?: string;
  version?: string;
}): ExportConfig => {
  const title = input.title?.trim() ?? "";
  if (title.length === 0) {
    throw new ExportConfigError(
      "frogoe export: BRIEF.md has no title — the shell's display name comes from it",
    );
  }
  if (PRODUCT_NAME_FORBIDDEN.test(title)) {
    throw new ExportConfigError(
      `frogoe export: the BRIEF title "${title}" contains a character Tauri forbids in product names (/\\:*?"<>|) — retitle it`,
    );
  }
  const crate = kebab(title);
  if (crate.length === 0 || /^[0-9]/u.test(crate)) {
    throw new ExportConfigError(
      `frogoe export: the BRIEF title "${title}" yields no valid crate name — it needs at least one letter`,
    );
  }
  const authorAppId = input.appId?.trim() ?? "";
  if (authorAppId.length > 0 && !validateAppId(authorAppId)) {
    throw new ExportConfigError(
      `frogoe export: appId "${authorAppId}" is not reverse-DNS (lowercase segments, at least two, e.g. "com.yourname.typefall") — fix frogoe.json`,
    );
  }
  // Expo-style instant start: a working default for local dev; the export
  // command warns that com.frogoe.* is reserved and stores need your own
  const appIdIsDefault = authorAppId.length === 0;
  const appId = appIdIsDefault ? `com.frogoe.${crate}` : authorAppId;
  const version = input.version?.trim() || "1.0.0";
  if (!/^\d+(\.\d+){0,3}(-[a-z0-9.-]+)?$/u.test(version)) {
    throw new ExportConfigError(
      `frogoe export: version "${version}" is not semver-ish (e.g. "1.0.0") — fix frogoe.json`,
    );
  }
  return { appName: title, appId, appIdIsDefault, version, crate, crateLib: `${snake(crate)}_lib` };
};

const tokenPattern = /\{\{FROGOE_[A-Z_]+\}\}/gu;

/** Replace every known token; throw naming the file if an unknown or
 *  unresolved token remains. `label` is the template-relative path used
 *  in errors. */
export const fill = (source: string, config: ExportConfig, label: string): string => {
  const values: Record<Token, string> = {
    FROGOE_APP_NAME: config.appName,
    FROGOE_APP_ID: config.appId,
    FROGOE_APP_VERSION: config.version,
    FROGOE_CRATE: config.crate,
    FROGOE_CRATE_LIB: config.crateLib,
  };
  let out = source;
  for (const token of TOKENS) {
    out = out.replaceAll(`{{${token}}}`, values[token]);
  }
  const leftover = tokenPattern.exec(out);
  if (leftover !== null) {
    throw new ExportConfigError(
      `frogoe export: template file "${label}" contains unknown token ${leftover[0]} — a template edit introduced it; report it`,
    );
  }
  tokenPattern.lastIndex = 0;
  return out;
};

/** Where the export templates live, given a base dir (the same repo-vs-
 *  package resolution pattern as contractSourceFor/registryRootFor):
 *  repo source mode → packages/cli/src/export-templates; dist mode →
 *  the copy shipped beside the bundle (build-copy.mjs). */
export const exportTemplatesFor = (base: string): string => {
  const repo = path.join(base, "export-templates");
  if (existsSync(path.join(repo, "package.json"))) return repo;
  const dist = path.join(base, "..", "export-templates");
  if (existsSync(path.join(dist, "package.json"))) return dist;
  throw new ExportConfigError(
    "frogoe export: templates not found (neither src/export-templates nor dist) — the CLI install is broken; report it",
  );
};

/** Where the CI workflow templates live (same repo-vs-package resolution
 *  as exportTemplatesFor). Kept OUTSIDE export-templates on purpose:
 *  the walk in generateShell copies that whole tree into export/ — which
 *  is gitignored, so GitHub would never see a workflow placed there.
 *  CI workflows belong at the GAME ROOT, tracked. */
export const ciTemplatesFor = (base: string): string => {
  const repo = path.join(base, "ci-templates");
  const marker = path.join(repo, "build-desktop.yml");
  if (existsSync(marker)) return repo;
  const dist = path.join(base, "..", "ci-templates");
  if (existsSync(path.join(dist, "build-desktop.yml"))) return dist;
  throw new ExportConfigError(
    "frogoe export: ci templates not found (neither src/ci-templates nor dist) — the CLI install is broken; report it",
  );
};

/** Dev-loop config transform for the shell: point `tauri dev` at the
 *  frogoe dev server (live reload flows through the native webview) and
 *  drop beforeDevCommand — the CLI owns the server, not Tauri. Injecting
 *  an empty url strips both (self-heal after a crashed session, and the
 *  release shape export expects). */
export const injectDevUrl = (confJson: string, url: string): string => {
  const conf = JSON.parse(confJson) as {
    build?: { beforeDevCommand?: string; devUrl?: string; frontendDist?: string };
  };
  conf.build ??= {};
  delete conf.build.beforeDevCommand;
  if (url.length === 0) {
    delete conf.build.devUrl;
  } else {
    conf.build.devUrl = url;
  }
  return `${JSON.stringify(conf, null, 2)}\n`;
};
