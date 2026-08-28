/** frogoe bundle — externals dissolve. A game FOLDER becomes ONE
 *  self-contained HTML file: import-map modules bundled (esbuild + CDN
 *  plugin), stylesheets inlined, fonts embedded as base64 @font-face,
 *  local media as data URIs. Zero runtime requests, guaranteed by a
 *  final self-scan. Provenance banner carries the contract pin + sha256.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Plugin } from "esbuild";

import { fetchWithPolicy, type FetchImpl } from "./fetch-policy.ts";

export interface BundleAsset {
  bytes: number;
  sha256: string;
  source: string;
  kind: "css" | "font" | "js" | "media";
}

export interface BundleReport {
  artifact: string;
  assets: BundleAsset[];
  bytes: number;
  sha256: string;
  warnings: string[];
}

export interface BundleOptions {
  dir: string;
  extraAllowedHosts?: string[];
  fetchImpl?: FetchImpl;
  fetchLocalAssets?: boolean;
}

const ALLOWED_HOSTS = new Set([
  "cdn.jsdelivr.net",
  "esm.sh",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "unpkg.com",
]);
// Font hosts serve content-addressed paths — no @version segment possible.
const PIN_EXEMPT_HOSTS = new Set([
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "fonts.googleapis.test",
  "fonts.gstatic.test",
]);
const FONT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const MIME: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  png: "image/png",
  svg: "image/svg+xml",
  wav: "audio/wav",
  webp: "image/webp",
  woff2: "font/woff2",
};

const sha256 = (data: string): string => createHash("sha256").update(data).digest("hex");

const dataUri = (mime: string, body: string): string => {
  const base64 = Buffer.from(body, "binary").toString("base64");
  return `data:${mime};base64,${base64}`;
};

export const assertAllowedRemote = (url: string, extraHosts?: string[]): void => {
  const host = new URL(url).host;
  if (!ALLOWED_HOSTS.has(host) && !(extraHosts ?? []).includes(host)) {
    throw new Error(
      `bundle/blocked-origin: ${host} is not on the allowlist (${[...ALLOWED_HOSTS].join(", ")}).`,
    );
  }
  if (
    !PIN_EXEMPT_HOSTS.has(host) &&
    !/@v?\d+(\.\d+)+[^/]*\//u.test(url) &&
    !/@\d+\.\d+\.\d+[^/]*$/u.test(url)
  ) {
    throw new Error(
      `bundle/unpinned: ${url} — exact versions only (@latest and bare tags are forbidden; the pin is hashed).`,
    );
  }
};

const cdnPlugin = (options: BundleOptions, assets: BundleAsset[]): Plugin => ({
  name: "frogoe-cdn",
  setup(build) {
    build.onResolve({ filter: /^https?:\/\// }, (args) => ({
      namespace: "frogoe-cdn",
      path: args.path,
    }));
    build.onResolve({ filter: /.*/, namespace: "frogoe-cdn" }, (args) => ({
      namespace: "frogoe-cdn",
      path: new URL(args.path, args.importer).href,
    }));
    build.onLoad({ filter: /.*/, namespace: "frogoe-cdn" }, async (args) => {
      assertAllowedRemote(args.path, options.extraAllowedHosts);
      const body = await fetchWithPolicy(args.path, {
        fetchImpl: options.fetchImpl,
      });
      assets.push({
        bytes: body.length,
        kind: "js",
        sha256: sha256(body),
        source: args.path,
      });
      return {
        contents: body,
        loader: args.path.endsWith(".css") ? "css" : "js",
      };
    });
  },
});

/** Every import-map entry becomes a resolve rule — bare names never escape
 *  the bundle. "frogoe" defaults to the pinned contract even without a map. */
const importMapPlugin = (dir: string, imports: Record<string, string>): Plugin => ({
  name: "frogoe-importmap",
  setup(build) {
    const rules = new Map<string, string>(Object.entries(imports));
    if (!rules.has("frogoe")) {
      rules.set("frogoe", "./.frogoe/contract.js");
    }
    for (const [name, target] of rules) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      build.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => {
        if (/^https?:\/\//.test(target)) {
          return { namespace: "frogoe-cdn", path: target };
        }
        return { path: path.resolve(dir, target) };
      });
    }
  },
});

const inlineFontCss = async (
  cssUrl: string,
  options: BundleOptions,
  assets: BundleAsset[],
): Promise<string> => {
  const css = await fetchWithPolicy(cssUrl, {
    fetchImpl: options.fetchImpl,
    headers: { "user-agent": FONT_UA },
  });
  assets.push({
    bytes: css.length,
    kind: "css",
    sha256: sha256(css),
    source: cssUrl,
  });
  const seen = new Map<string, string>();
  const resolveFont = async (url: string): Promise<string> => {
    const cached = seen.get(url);
    if (cached) {
      return cached;
    }
    assertAllowedRemote(url, options.extraAllowedHosts);
    const res = options.fetchImpl
      ? await options.fetchImpl(url, { headers: { "user-agent": FONT_UA } })
      : await fetch(url, { headers: { "user-agent": FONT_UA } });
    const buffer = Buffer.from(await res.arrayBuffer());
    const uri = `data:font/woff2;base64,${buffer.toString("base64")}`;
    seen.set(url, uri);
    assets.push({
      bytes: buffer.length,
      kind: "font",
      sha256: sha256(buffer.toString("binary")),
      source: url,
    });
    return uri;
  };
  let out = css;
  const urls = [...css.matchAll(/url\((https:\/\/[^)]+)\)/gu)].map((m) => m[1] ?? "");
  for (const url of urls) {
    if (url) {
      out = out.replaceAll(url, await resolveFont(url));
    }
  }
  return out;
};

const localDataUri = (dir: string, href: string): string => {
  const file = path.resolve(dir, href.replace(/^\.\//u, ""));
  if (!existsSync(file)) {
    throw new Error(`bundle/missing-asset: ${href} not found in the game folder`);
  }
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    throw new Error(`bundle/unsupported-asset: .${ext} (${href})`);
  }
  return dataUri(mime, readFileSync(file, "binary"));
};

const LEAK_PATTERN = /(?:src|href)\s*=\s*"(https?:\/\/[^"]+)"/gi;

export const bundle = async (options: BundleOptions): Promise<BundleReport> => {
  const dir = path.resolve(options.dir);
  const indexPath = path.join(dir, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error("frogoe bundle: no index.html — run from a game folder");
  }
  const html = readFileSync(indexPath, "utf-8");
  const assets: BundleAsset[] = [];
  const warnings: string[] = [];
  let out = html;

  // 1) module entry: bundle game.js (+ import-map names) into one module
  const importMapMatch = /<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/iu.exec(html);
  const entryMatch = /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/iu.exec(html);
  let imports: Record<string, string> = {};
  if (importMapMatch?.[1]) {
    try {
      imports =
        (JSON.parse(importMapMatch[1]) as { imports?: Record<string, string> }).imports ?? {};
    } catch {
      throw new Error("frogoe bundle: import map in index.html is not valid JSON");
    }
  }
  let bundled = "";
  if (entryMatch?.[1]) {
    const { build } = await import("esbuild");
    const result = await build({
      bundle: true,
      entryPoints: [path.resolve(dir, entryMatch[1])],
      format: "esm",
      logLevel: "silent",
      plugins: [importMapPlugin(dir, imports), cdnPlugin(options, assets)],
      target: "es2022",
      write: false,
    });
    bundled = result.outputFiles[0]?.text ?? "";
    out = out.replace(entryMatch[0], `<script type="module">\n${bundled}\n</script>`);
  }
  if (importMapMatch) {
    // every mapped bare name is now inside the bundle — the map is dead weight
    out = out.replace(importMapMatch[0], "");
  }

  // 2) stylesheets: local inline, font CSS fetched + fonts embedded
  for (const match of html.matchAll(/<link[^>]*href="([^"]+)"[^>]*>/giu)) {
    const href = match[1] ?? "";
    if (!/rel\s*=\s*"stylesheet"/iu.test(match[0])) {
      continue;
    }
    let replacement: string;
    if (href.startsWith("https://")) {
      assertAllowedRemote(href, options.extraAllowedHosts);
      const css = await inlineFontCss(href, options, assets);
      replacement = `<style>\n${css}\n</style>`;
    } else {
      const css = readFileSync(path.resolve(dir, href), "utf-8");
      replacement = `<style>\n${css}\n</style>`;
    }
    out = out.replace(match[0], replacement);
  }

  // 3) local media → data URIs
  for (const match of out.matchAll(/(src|href)\s*=\s*"(\.{0,2}\/[^":]+)"/gu)) {
    const href = match[2] ?? "";
    if (href.startsWith("data:") || href.startsWith("#")) {
      continue;
    }
    if (href.endsWith(".js") && entryMatch?.[1] === href) {
      continue; // already bundled
    }
    if (existsSync(path.resolve(dir, href))) {
      out = out.replaceAll(href, localDataUri(dir, href));
    }
  }

  // 4) self-scan: zero runtime requests, or we failed (no-cheat)
  const leaked = [...out.matchAll(LEAK_PATTERN)].map((m) => m[1] ?? "");
  if (leaked.length > 0) {
    throw new Error(
      `bundle/leaked-remote: artifact still references ${[...new Set(leaked)].join(", ")} — nothing ships half-dissolved.`,
    );
  }

  const artifactHash = sha256(out);
  const banner = `<!-- frogoe bundle | contract 0.1.0 | assets: ${assets.length} | sha256:${artifactHash} -->\n`;
  const artifact = banner + out;
  const bytes = Buffer.byteLength(artifact, "utf-8");
  if (bytes > 3_000_000) {
    warnings.push(
      `bundle/size: ${Math.round(bytes / 100_000) / 10} MB — feed caching stays sane, but check whether every asset earns its bytes`,
    );
  }
  return {
    artifact,
    assets,
    bytes,
    sha256: sha256(artifact),
    warnings,
  };
};
