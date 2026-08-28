import { describe, expect, test } from "bun:test";
/** frogoe bundle — externals dissolve. All network goes through a LOCAL
 *  fixture server (the inject-fetch pattern, taken one step further: the
 *  whole CDN is fake and deterministic; no real network, no flake). */
import http from "node:http";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { assertAllowedRemote, bundle } from "../src/bundle.ts";
import { scaffold } from "../src/init.ts";

const tmp = path.join(import.meta.dir, "../.tmp-bundle");

const fixtureDir = (name: string): string => {
  const dir = path.join(tmp, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
};

// ── the fake CDN ────────────────────────────────────────────────────────────
const TINY_LIB = `export const tiny = () => "tiny-lib@1.2.3";\n`;
const FONT_CSS =
  '@font-face{font-family:Dream;font-style:normal;font-weight:600;src:url(https://fonts.gstatic.test/s/dream/v3/dream-600.woff2) format("woff2");}';
const FONT_BYTES = new Uint8Array([119, 111, 102, 50, 1, 2, 3, 4]); // "woff2"+junk

// host-agnostic: route by path shape so real and .test hosts both land here.
// NOTE: node:http on purpose — Bun.serve responses get hijacked (Bun runtime
// quirk) once @hono/node-server has served in this process (cli.test.ts).
// A fresh server per startCdn() call: tests stop their own instance.
const startCdn = (): {
  fetchImpl: typeof fetch;
  origin: string;
  stop: () => void;
} => {
  const fixture = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://fixture.local");
    const send = (body: string | Uint8Array, type: string): void => {
      res.setHeader("content-type", type);
      res.end(body);
    };
    if (url.pathname.endsWith(".woff2")) {
      send(FONT_BYTES, "font/woff2");
    } else if (url.pathname.startsWith("/css2")) {
      send(FONT_CSS, "text/css");
    } else if (url.pathname.includes("tiny-lib")) {
      send(TINY_LIB, "text/javascript");
    } else {
      res.statusCode = 404;
      send("not found", "text/plain");
    }
  });
  fixture.listen(0, "127.0.0.1");
  const address = fixture.address() as { port: number };
  const rewrite = (target: string): string => {
    const url = new URL(target);
    return `http://127.0.0.1:${address.port}${url.pathname}${url.search}`;
  };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const target =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return fetch(rewrite(target), init);
  }) as typeof fetch;
  return {
    fetchImpl,
    origin: `http://127.0.0.1:${address.port}`,
    stop: () => {
      fixture.closeAllConnections?.();
      fixture.close();
    },
  };
};

const buildGame = (dir: string, overrides?: { importExtra?: string }): string => {
  scaffold("g", { dir, force: true });
  const gameDir = path.join(dir, "g");
  const html = readFileSync(path.join(gameDir, "index.html"), "utf-8");
  const extra = overrides?.importExtra ? `,\n      ${overrides.importExtra}` : "";
  const withCdn = html
    .replace('"frogoe": "./.frogoe/contract.js"', `"frogoe": "./.frogoe/contract.js"${extra}`)
    .replace(
      "</head>",
      `  <link rel="stylesheet" href="https://fonts.googleapis.test/css2?family=Dream:wght@600&display=swap">\n</head>`,
    );
  writeFileSync(path.join(gameDir, "index.html"), withCdn);
  writeFileSync(
    path.join(gameDir, "game.js"),
    `import { defineGame } from "frogoe";\nimport { tiny } from "tiny-lib";\n\ndefineGame(({ stage, loop }) => {\n  loop.update = (dt) => {};\n  loop.render = (ctx) => { ctx.fillText(tiny(), 10, 10); };\n});\n`,
  );
  return gameDir;
};

describe("frogoe bundle", () => {
  test("allowlist + pin discipline", () => {
    expect(() => assertAllowedRemote("https://evil.example.com/x.js")).toThrow(/blocked-origin/u);
    expect(() => assertAllowedRemote("https://cdn.jsdelivr.net/npm/three/@latest/x.js")).toThrow(
      /unpinned/u,
    );
    expect(() =>
      assertAllowedRemote("https://cdn.jsdelivr.net/npm/three@0.170.0/x.js"),
    ).not.toThrow();
    expect(() => assertAllowedRemote("https://fonts.gstatic.com/s/dream/v3/a.woff2")).not.toThrow();
  });

  test("dissolves CDN module, font CSS + woff2, and drops the import map", async () => {
    const cdn = startCdn();
    try {
      const parent = fixtureDir("full");
      const gameDir = buildGame(parent, {
        importExtra: `"tiny-lib": "https://cdn.jsdelivr.test/npm/tiny-lib@1.2.3/lib.js"`,
      });
      const report = await bundle({
        dir: gameDir,
        extraAllowedHosts: ["cdn.jsdelivr.test", "fonts.googleapis.test", "fonts.gstatic.test"],
        fetchImpl: cdn.fetchImpl,
      });

      // artifact is one file, zero runtime requests, banner provenance
      expect(report.artifact).not.toContain('src="http');
      expect(report.artifact).not.toContain('href="http');
      expect(report.artifact).not.toContain("importmap");
      expect(report.artifact.startsWith("<!-- frogoe bundle")).toBeTrue();
      expect(report.artifact).toContain("sha256:");

      // the module graph made it in: contract + tiny-lib + game code
      expect(report.artifact).toContain("defineGame");
      expect(report.artifact).toContain("tiny-lib@1.2.3");
      // provenance rides the banner (esbuild strips source comments);
      // the host handle proves the contract itself is inside
      expect(report.artifact).toContain("contract 0.1.0");
      expect(report.artifact).toContain("__frogoe");

      // fonts dissolved: css inlined as <style>, woff2 as data:font
      expect(report.artifact).toContain(
        "fonts.googleapis.test/css2".replace("fonts.googleapis.test/css2", "font-family:Dream"),
      );
      expect(report.artifact).toMatch(/data:font\/woff2;base64,/u);

      // report accounts for every dissolved asset
      const kinds = report.assets.map((a) => a.kind).sort();
      expect(kinds).toContain("js");
      expect(kinds).toContain("css");
      expect(kinds).toContain("font");
    } finally {
      cdn.stop();
    }
  });

  test("blocked origin fails closed with the stable code", async () => {
    const cdn = startCdn();
    try {
      const parent = fixtureDir("blocked");
      const gameDir = buildGame(parent, {
        importExtra: `"tiny-lib": "https://evilcdn.example.net/npm/tiny-lib@1.2.3/lib.js"`,
      });
      await expect(
        bundle({
          dir: gameDir,
          extraAllowedHosts: ["fonts.googleapis.test", "fonts.gstatic.test"],
          fetchImpl: cdn.fetchImpl,
        }),
      ).rejects.toThrow(/blocked-origin/u);
    } finally {
      cdn.stop();
    }
  });

  test("unpinned dependency is rejected before any fetch", async () => {
    const cdn = startCdn();
    try {
      const parent = fixtureDir("unpinned");
      const gameDir = buildGame(parent, {
        importExtra: `"tiny-lib": "https://cdn.jsdelivr.test/npm/tiny-lib/lib.js"`,
      });
      await expect(
        bundle({
          dir: gameDir,
          extraAllowedHosts: ["cdn.jsdelivr.test", "fonts.googleapis.test", "fonts.gstatic.test"],
          fetchImpl: cdn.fetchImpl,
        }),
      ).rejects.toThrow(/unpinned/u);
    } finally {
      cdn.stop();
    }
  });

  test("flappy reference bundles clean through the real path", async () => {
    const cdn = startCdn();
    try {
      const report = await bundle({
        dir: path.join(import.meta.dir, "../../../examples/flappy"),
        extraAllowedHosts: ["fonts.googleapis.test", "fonts.gstatic.test"],
        fetchImpl: cdn.fetchImpl,
      });
      expect(report.artifact).toContain("defineGame");
      expect(report.warnings).toEqual([]);
    } finally {
      cdn.stop();
    }
  });
});

rmSync(tmp, { recursive: true, force: true });
