import { describe, expect, test } from "bun:test";
/** frogoe lint — static contract check rules. Fixtures are hand-built (no
 *  CLI scaffold dependency — lint is a dependency OF the CLI, not vice versa). */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { checkProject, parseBrief } from "../src/index.ts";

const tmpRoot = path.join(import.meta.dir, "../.tmp");

const freshDir = (name: string): string => {
  const dir = path.join(tmpRoot, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
};

const writeGame = (
  dir: string,
  options?: {
    brief?: string;
    game?: string;
    html?: string;
    pin?: string;
  },
): void => {
  mkdirSync(path.join(dir, ".frogoe"), { recursive: true });
  writeFileSync(
    path.join(dir, "BRIEF.md"),
    options?.brief ??
      `---
title: Test Game
verb: tap
mood: cheerful
palette:
  bg: "#101418"
  fg: "#fffdf7"
  accent: "#ffd166"
  outline: "#26180a"
---
One tap flaps.
`,
  );
  writeFileSync(
    path.join(dir, "frogoe.json"),
    options?.pin ?? JSON.stringify({ contract: "0.1.0" }),
  );
  writeFileSync(
    path.join(dir, "index.html"),
    options?.html ??
      `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>html, body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }</style>
<script type="importmap">{"imports":{"frogoe":"./.frogoe/contract.js"}}</script>
</head><body>
<canvas id="c"></canvas>
<div class="hud"></div>
<script type="module" src="game.js"></script>
</body></html>`,
  );
  writeFileSync(
    path.join(dir, "game.js"),
    options?.game ??
      `defineGame(({ input, loop }) => {
  input.on("down", () => {});
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
  );
  writeFileSync(
    path.join(dir, ".frogoe", "contract.js"),
    "// frogoe contract v0.1.0 (materialized by frogoe init — do not edit)\nexport {};\n",
  );
};

describe("frogoe check", () => {
  test("clean game has zero errors", () => {
    const dir = freshDir("clean");
    writeGame(dir);
    const result = checkProject(dir);
    expect(result.errors).toBe(0);
  });

  test("every rule fires on purpose", () => {
    const dir = freshDir("rules");
    writeGame(dir);

    // brief/missing
    rmSync(path.join(dir, "BRIEF.md"));
    let codes = checkProject(dir).findings.map((f) => f.code);
    expect(codes).toContain("brief/missing");

    // brief/todo + brief/frontmatter
    writeFileSync(
      path.join(dir, "BRIEF.md"),
      '---\ntitle: TODO game\nverb: fly\nmood: \npalette:\n  bg: "#111"\n---\nx\n',
    );
    codes = checkProject(dir).findings.map((f) => f.code);
    expect(codes).toContain("brief/todo");
    expect(codes).toContain("brief/frontmatter");
    writeGame(dir);

    // folder/canvas + viewport-fit + touch-select + importmap
    const originalHtml = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>html, body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }</style>
<script type="importmap">{"imports":{"frogoe":"./.frogoe/contract.js"}}</script>
</head><body>
<canvas id="c"></canvas>
</body></html>`;
    writeFileSync(
      path.join(dir, "index.html"),
      originalHtml
        .replace(/<canvas[^>]*>/u, "")
        .replace("viewport-fit=cover", "")
        .replace(/<style>.*<\/style>/su, "")
        .replace(/"frogoe":[^,}]+/u, '"frogoe": "./wrong.js"'),
    );
    codes = checkProject(dir).findings.map((f) => f.code);
    expect(codes).toContain("folder/canvas");
    expect(codes).toContain("folder/viewport-fit");
    expect(codes).toContain("folder/touch-select");
    expect(codes).toContain("folder/importmap");
    writeFileSync(path.join(dir, "index.html"), originalHtml);

    // input/incremental-drag (the shipped wall-rocket bug)
    writeFileSync(
      path.join(dir, "game.js"),
      `defineGame(({ input, loop }) => {
  input.on("drag", (p) => { x += p.dx * 1.15; });
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
    );
    codes = checkProject(dir).findings.map((f) => f.code);
    expect(codes).toContain("input/incremental-drag");
    writeGame(dir);

    // audio/suspended-only (the shipped iOS silence bug)
    writeFileSync(
      path.join(dir, "game.js"),
      `const Sfx = { ctx: null, init() { this.ctx ??= new AudioContext(); if (this.ctx.state === "suspended") void this.ctx.resume(); } };
defineGame(({ input, loop }) => {
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
    );
    codes = checkProject(dir).findings.map((f) => f.code);
    expect(codes).toContain("audio/suspended-only");
    writeGame(dir);

    // folder/contract-pin drift
    writeFileSync(path.join(dir, "frogoe.json"), JSON.stringify({ contract: "9.9.9" }));
    codes = checkProject(dir).findings.map((f) => f.code);
    expect(codes).toContain("folder/contract-pin");
  });

  test("dogfood: the reference game (examples/flappy) passes clean", () => {
    const result = checkProject(path.join(import.meta.dir, "../../../examples/flappy"));
    expect(result.errors).toBe(0);
  });
});

describe("brief parsing", () => {
  test("parses frontmatter with nested palette and inline comments", () => {
    const brief = parseBrief(
      '---\ntitle: Ember\nverb: tap # one word\nmood: dawn\npalette:\n  bg: "#111111"  # base\n  fg: "#eeeeee"\n  accent: "#ff9e5e"\n  outline: "#333"\n---\n',
    );
    expect(brief?.title).toBe("Ember");
    expect(brief?.verb).toBe("tap");
    expect(brief?.bg).toBe("#111111");
    expect(brief?.outline).toBe("#333");
    expect(brief?.accent).toBe("#ff9e5e");
  });

  test("outline-aware contrast: fg vs outline when declared", () => {
    const dir = freshDir("contrast-outline");
    writeGame(dir, {
      brief: `---
title: Contrast
verb: tap
mood: test
palette:
  bg: "#4EC0CA"
  fg: "#FAFAFA"
  accent: "#F8B733"
  outline: "#543847"
---
x
`,
    });
    // fg (#FAFAFA) vs outline (#543847) = high contrast → should pass
    const result = checkProject(dir);
    expect(result.findings.some((f) => f.code === "brief/contrast")).toBeFalse();
  });
});

rmSync(tmpRoot, { recursive: true, force: true });
