import { afterAll, describe, expect, test } from "bun:test";
/** net/font-proxy — the dev-time font proxy with disk cache. The
 *  browser's render-blocking font CSS must never hold the sandbox (or a
 *  phone playtest) hostage to a CDN's p99: the dev server serves fonts
 *  from .frogoe/font-cache, fetching upstream at most once per URL. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { decodeProxyToken, proxyFontRequest, rewriteFontLinks } from "../src/net/font-proxy.ts";

const TEMP: string[] = [];
const tempDir = (label: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), `frogoe-font-${label}-`));
  TEMP.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of TEMP) rmSync(dir, { recursive: true, force: true });
});

describe("rewriteFontLinks", () => {
  test("font links point at the proxy; everything else is untouched", () => {
    const html = `<head>
  <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&display=swap" rel="stylesheet">
  <link href="style.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/x/y.css" rel="stylesheet">
</head>`;
    const out = rewriteFontLinks(html);
    expect(out).toContain('href="/__frogoe/font/');
    expect(out).not.toContain("fonts.googleapis.com");
    // local and non-font CDN links are not the proxy's business
    expect(out).toContain('href="style.css"');
    expect(out).toContain("cdn.jsdelivr.net");
  });

  test("gstatic hrefs are proxied too", () => {
    const out = rewriteFontLinks(
      '<link rel="stylesheet" href="https://fonts.gstatic.com/s/q.woff2">',
    );
    expect(out).toContain("/__frogoe/font/");
  });
});

describe("decodeProxyToken (the SSRF guard)", () => {
  test("round-trips an allowed https URL", () => {
    const url = "https://fonts.googleapis.com/css2?family=Quicksand";
    const token = Buffer.from(url, "utf-8").toString("base64url");
    expect(decodeProxyToken(token)).toBe(url);
  });
  test("rejects http, foreign hosts, and garbage", () => {
    const http = Buffer.from("http://fonts.googleapis.com/x", "utf-8").toString("base64url");
    expect(decodeProxyToken(http)).toBeNull();
    const evil = Buffer.from("https://evil.example/font?x=1", "utf-8").toString("base64url");
    expect(decodeProxyToken(evil)).toBeNull();
    expect(decodeProxyToken("!!!not-base64!!!")).toBeNull();
  });
});

describe("proxyFontRequest", () => {
  const CSS_URL = "https://fonts.googleapis.com/css2?family=Quicksand&display=swap";
  const WOFF_URL = "https://fonts.gstatic.com/s/quicksand/v37/body.woff2";

  const makeFetch = (responses: Record<string, { body: Buffer | string; status?: number }>) => {
    const calls: string[] = [];
    const impl = (async (input: string | URL): Promise<Response> => {
      const url = String(input);
      calls.push(url);
      const hit = responses[url];
      if (!hit) return new Response("missing", { status: 404 });
      return new Response(hit.body, { status: hit.status ?? 200 });
    }) as typeof fetch;
    return { calls, impl };
  };

  test("css: fetches upstream once, serves rewritten, caches the RAW bytes", async () => {
    const cacheDir = tempDir("css");
    const upstream = makeFetch({
      [CSS_URL]: {
        body: `@font-face{font-family:Q;src:url(${WOFF_URL}) format("woff2")}`,
      },
    });
    const first = await proxyFontRequest(CSS_URL, cacheDir, upstream.impl);
    expect(first.status).toBe(200);
    expect(first.contentType).toBe("text/css; charset=utf-8");
    expect(first.fromCache).toBeFalse();
    // the SERVED css has gstatic refs tokenized for the proxy…
    expect(first.body).toContain("/__frogoe/font/");
    expect(String(first.body)).not.toContain("fonts.gstatic.com");
    // …but the CACHE stores the raw upstream bytes (the bundler reads them)
    expect(first.cachePath !== undefined).toBeTrue();
    expect(readFileSync(first.cachePath ?? "", "utf-8")).toContain(WOFF_URL);

    // second call: served from cache, upstream untouched for the css
    const callsAfterFirst = upstream.calls.length;
    const second = await proxyFontRequest(CSS_URL, cacheDir, upstream.impl);
    expect(second.fromCache).toBeTrue();
    expect(String(second.body)).toBe(String(first.body));
    expect(upstream.calls.length).toBe(callsAfterFirst);
  });

  test("woff2: binary bytes round-trip EXACTLY (utf-8 never touches fonts)", async () => {
    const cacheDir = tempDir("woff");
    // a binary blob with bytes that are ILLEGAL in utf-8 — a text
    // round-trip would replace them and corrupt the font
    const bytes = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x80, 0x9f, 0xfe, 0xff, 0xd8]);
    const upstream = makeFetch({ [WOFF_URL]: { body: bytes } });
    const first = await proxyFontRequest(WOFF_URL, cacheDir, upstream.impl);
    expect(first.contentType).toBe("font/woff2");
    expect(Buffer.isBuffer(first.body)).toBeTrue();
    expect((first.body as Buffer).equals(bytes)).toBeTrue();
    const second = await proxyFontRequest(WOFF_URL, cacheDir, upstream.impl);
    expect(second.fromCache).toBeTrue();
    expect((second.body as Buffer).equals(bytes)).toBeTrue();
  });

  test("LEGACY woff2 entries (no cache magic) never serve — the silent-fallback-font bug", async () => {
    // regression: the first cache format corrupted woff2 via a utf-8
    // round-trip; the browser then failed the font SILENTLY and every
    // rasterized poster lettering rendered in generic monospace. A
    // binary entry without the version magic is stale by construction.
    const cacheDir = tempDir("legacy-woff");
    const bytes = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x80, 0xfe]);
    const upstream = makeFetch({ [WOFF_URL]: { body: bytes } });
    const warm = await proxyFontRequest(WOFF_URL, cacheDir, upstream.impl);
    if (warm.cachePath === undefined) throw new Error("no cache path");
    // simulate the legacy format: raw bytes, no magic prefix
    writeFileSync(warm.cachePath, bytes);
    const served = await proxyFontRequest(WOFF_URL, cacheDir, upstream.impl);
    expect(served.fromCache).toBeFalse(); // refused the legacy entry
    expect(upstream.calls.length).toBe(2); // refetched upstream
    expect((served.body as Buffer).equals(bytes)).toBeTrue();
  });

  test("upstream failure fails FAST (a dead CDN must not hang DCL)", async () => {
    const cacheDir = tempDir("fail");
    const upstream = makeFetch({}); // everything 404
    const result = await proxyFontRequest(CSS_URL, cacheDir, upstream.impl);
    expect(result.status).toBeGreaterThanOrEqual(500);
    // nothing poisoned into the cache
    expect(result.cachePath).toBeUndefined();
  });

  test("foreign host URLs are refused before any fetch", async () => {
    const cacheDir = tempDir("guard");
    const upstream = makeFetch({});
    const result = await proxyFontRequest("https://evil.example/x.css", cacheDir, upstream.impl);
    expect(result.status).toBe(403);
    expect(upstream.calls.length).toBe(0);
  });

  test("pre-seeded cache serves without any network", async () => {
    // warm a donor cache once, then serve the same URL from it with a
    // dead upstream — the disk file alone must satisfy the request
    const donor = tempDir("warm-donor");
    const upstream = makeFetch({ [CSS_URL]: { body: "body{}" } });
    const warm = await proxyFontRequest(CSS_URL, donor, upstream.impl);
    if (warm.cachePath === undefined) throw new Error("no cache path");
    const dead = makeFetch({});
    const fromCache = await proxyFontRequest(CSS_URL, donor, dead.impl);
    expect(fromCache.fromCache).toBeTrue();
    expect(dead.calls.length).toBe(0);
  });

  test("LEGACY css entries (proxy tokens inside) are stale — refetched and healed", async () => {
    // the pre-raw-cache code wrote REWRITTEN css (proxy token refs).
    // Such an entry must never serve from cache: the bundler would see
    // no upstream urls and ship an artifact with broken font refs.
    const cacheDir = tempDir("legacy");
    const upstream = makeFetch({ [CSS_URL]: { body: `@font-face{src:url(${WOFF_URL})}` } });
    const first = await proxyFontRequest(CSS_URL, cacheDir, upstream.impl);
    // simulate the legacy format by overwriting the cache with a
    // token-rewritten body
    writeFileSync(
      first.cachePath ?? "",
      `@font-face{src:url(/__frogoe/font/${Buffer.from(WOFF_URL, "utf-8").toString("base64url")})}`,
    );
    const healed = await proxyFontRequest(CSS_URL, cacheDir, upstream.impl);
    expect(healed.fromCache).toBeFalse(); // treated the legacy entry as a miss
    expect(upstream.calls.length).toBe(2); // refetched upstream
    // the cache now holds RAW bytes (healed for good)
    expect(readFileSync(healed.cachePath ?? "", "utf-8")).toContain(WOFF_URL);
  });
});
