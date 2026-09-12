/** Dev-time font proxy — the CDN-p99 antidote.
 *
 *  A render-blocking font stylesheet holds domcontentloaded hostage:
 *  browsers wait for pending head CSS before executing module scripts,
 *  so a 20s fonts.googleapis.com hiccup turned into
 *  "live sandbox crashed: Navigation timeout" and a flaky gate. The
 *  dev server therefore serves font CSS/woff2 through this proxy:
 *  upstream is fetched AT MOST ONCE per URL (8s budget, fail fast so
 *  DCL unblocks with a fallback font), and every response is cached
 *  under .frogoe/font-cache — check, `frogoe run` phone playtests, and
 *  the art rasterizer all become deterministic. The bundler is
 *  untouched: it reads the raw index.html and dissolves the original
 *  CDN links itself.
 *
 *  SSRF guard: tokens decode to https URLs on the two font hosts only
 *  — a crafted token can never aim the dev server elsewhere. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ALLOWED_FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/** modern-UA string: css2 serves woff2-only css to real browsers.
 *  SHARED with the bundler (bundle.ts imports it) — the cache is only
 *  byte-honest if every consumer fetches upstream with the same UA. */
export const FONT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// 4s upstream budget: fast-fail keeps a dead CDN from holding the
// page's domcontentloaded hostage — AND stays well under the sandbox's
// 8s retry-navigation window, so a slow-failing css can never race a
// reload into a false live/retry-dead. The disk cache makes cold
// fetches rare; anything slower than this is a dead window anyway.
const UPSTREAM_TIMEOUT_MS = 4_000;

const FONT_LINK_PATTERN =
  /href="(https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\/[^"]+)"/gu;
const CSS_URL_PATTERN = /url\((https:\/\/[^)]+)\)/gu;

export const proxyPathFor = (url: string): string =>
  `/__frogoe/font/${Buffer.from(url, "utf-8").toString("base64url")}`;

export const PROXY_PATH_PREFIX = "/__frogoe/font/";

/** A css cache entry written by the pre-raw-cache code holds PROXY
 *  TOKENS instead of upstream URLs — unusable to the bundler (and to
 *  any re-rewrite). Such entries are stale by construction. */
export const isLegacyCachedCss = (css: string): boolean => css.includes(PROXY_PATH_PREFIX);

/** Point every font-host link in an HTML document at the proxy. Pure. */
export const rewriteFontLinks = (html: string): string =>
  html.replaceAll(FONT_LINK_PATTERN, (_match, url: string) => `href="${proxyPathFor(url)}"`);

const allowedUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_FONT_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};

/** Token → upstream URL, or null when it is not an allowed https font
 *  URL (the SSRF guard — refuse before any fetch). */
export const decodeProxyToken = (token: string): string | null => {
  const url = Buffer.from(token, "base64url").toString("utf-8");
  return allowedUrl(url) ? url : null;
};

/** Font refs inside a css2 body → proxy refs (allowed hosts only). */
const rewriteCssFontRefs = (css: string): string =>
  css.replaceAll(CSS_URL_PATTERN, (match, url: string) =>
    allowedUrl(url) ? `url(${proxyPathFor(url)})` : match,
  );

export interface ProxyFontResult {
  /** css → rewritten string; woff2 → the raw Buffer (fonts are binary —
   *  never forced through a utf-8 round-trip) */
  body: Buffer | string;
  /** set only when a cache file exists (written or read) */
  cachePath?: string;
  contentType: string;
  fromCache: boolean;
  status: number;
}

const typeFor = (file: string): string =>
  file.endsWith(".css") ? "text/css; charset=utf-8" : "font/woff2";

const cacheFileFor = (cacheDir: string, url: string): string => {
  const ext = url.includes("css2?") || url.endsWith(".css") ? ".css" : ".woff2";
  return path.join(cacheDir, createHash("sha256").update(url).digest("hex") + ext);
};

const isBinaryEntry = (file: string): boolean => file.endsWith(".woff2");

/** The disk cache stores RAW upstream bytes (the css un-rewritten) so
 *  the BUNDLER can read the same entries: one cache, two consumers,
 *  byte-identical. Transformations (proxy rewriting, data-URI inlining)
 *  happen at the edges, never in the cache.
 *
 *  BINARY SAFETY, VERSIONED: the first cache format wrote woff2 through
 *  a utf-8 text round-trip, corrupting the bytes — browsers then failed
 *  the font silently and raster lettering rendered in a FALLBACK mono.
 *  New binary entries carry a magic prefix; a woff2 entry WITHOUT it is
 *  legacy (possibly corrupt) and never serves — it is refetched and
 *  rewritten. css stays plain text (css really is text; legacy css is
 *  caught by isLegacyCachedCss instead). */
const CACHE_MAGIC = Buffer.from("FROGOEF1");

export const readCachedFont = (url: string, cacheDir: string): Buffer | null => {
  const file = cacheFileFor(cacheDir, url);
  if (!existsSync(file)) return null;
  const raw = readFileSync(file);
  if (isBinaryEntry(file)) {
    if (
      raw.length < CACHE_MAGIC.length ||
      !raw.subarray(0, CACHE_MAGIC.length).equals(CACHE_MAGIC)
    ) {
      return null; // legacy/corrupt binary entry — stale by construction
    }
    return raw.subarray(CACHE_MAGIC.length);
  }
  return raw;
};

export const writeCachedFont = (url: string, cacheDir: string, body: Buffer | string): string => {
  const file = cacheFileFor(cacheDir, url);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, isBinaryEntry(file) ? Buffer.concat([CACHE_MAGIC, Buffer.from(body)]) : body);
  return file;
};

/** Serve one font URL through the cache. Fetch at most once per URL;
 *  upstream trouble answers as a FAST 5xx (an empty css/font fails the
 *  stylesheet load cleanly and the page boots on a fallback font —
 *  the sandbox gates gameplay, not typography). */
export const proxyFontRequest = async (
  url: string,
  cacheDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProxyFontResult> => {
  if (!allowedUrl(url)) {
    return { body: "", contentType: "text/plain; charset=utf-8", fromCache: false, status: 403 };
  }
  const cachePath = cacheFileFor(cacheDir, url);
  const isCss = cachePath.endsWith(".css");
  const raw = readCachedFont(url, cacheDir);
  if (raw !== null && !(isCss && isLegacyCachedCss(raw.toString("utf-8")))) {
    const body = isCss ? rewriteCssFontRefs(raw.toString("utf-8")) : raw;
    return { body, cachePath, contentType: typeFor(cachePath), fromCache: true, status: 200 };
  }
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": FONT_UA },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        body: "",
        contentType: typeFor(cachePath),
        fromCache: false,
        status: 502,
      };
    }
    // cache the RAW bytes (binary-safe); rewrite only what we serve
    const rawBody = Buffer.from(await res.arrayBuffer());
    writeCachedFont(url, cacheDir, rawBody);
    const body = isCss ? rewriteCssFontRefs(rawBody.toString("utf-8")) : rawBody;
    return { body, cachePath, contentType: typeFor(cachePath), fromCache: false, status: 200 };
  } catch {
    // timeout / network dead / body read failed — fail fast, cache nothing
    return { body: "", contentType: typeFor(cachePath), fromCache: false, status: 504 };
  }
};
