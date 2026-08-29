import { describe, expect, test } from "bun:test";
/** Behavioral tests for frogoe CLI: init, add, check, run. Fixtures live in
 *  temp dirs; the reference game (examples/flappy) is dogfooded by check. */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { addBlock } from "../src/add.ts";
import { checkProject, parseBrief, type Finding } from "@frogoe/lint";
import { scaffold } from "../src/init.ts";
import { startServer } from "../src/run.ts";

const tmpRoot = path.join(import.meta.dir, "../.tmp");

const freshDir = (name: string): string => {
  const dir = path.join(tmpRoot, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
};

const fillBrief = (dir: string): void => {
  writeFileSync(
    path.join(dir, "BRIEF.md"),
    [
      "---",
      "title: Ember Glide",
      "verb: tap",
      "mood: dawn uplift",
      "palette:",
      '  bg: "#2b1b3d"',
      '  fg: "#ffedd8"',
      '  accent: "#ff9e5e"',
      "---",
      "",
      "One tap flaps. Death ends the run.",
      "",
    ].join("\n"),
  );
};

describe("frogoe init", () => {
  test("scaffolds a complete, bootable folder", () => {
    const parent = freshDir("init-parent");
    const result = scaffold("my-game", { dir: parent });
    for (const file of [
      "AGENTS.md",
      "CLAUDE.md",
      "BRIEF.md",
      "frogoe.json",
      "index.html",
      "game.js",
      ".frogoe/contract.js",
      "blocks/.gitkeep",
    ]) {
      expect(existsSync(path.join(result.dir, file))).toBeTrue();
    }
    const html = readFileSync(path.join(result.dir, "index.html"), "utf-8");
    expect(html).toContain('<canvas id="c">');
    expect(html).toContain('"frogoe": "./.frogoe/contract.js"');
    expect(html).toContain("viewport-fit=cover");
    const game = readFileSync(path.join(result.dir, "game.js"), "utf-8");
    expect(game).toContain("loop.update");
    expect(game).toContain("loop.render");
  });

  test("materialized contract carries the version marker matching the pin", () => {
    const parent = freshDir("init-pin");
    scaffold("g", { dir: parent });
    const pin = JSON.parse(readFileSync(path.join(parent, "g", "frogoe.json"), "utf-8")) as {
      contract: string;
    };
    const header = readFileSync(path.join(parent, "g", ".frogoe", "contract.js"), "utf-8").slice(
      0,
      200,
    );
    expect(header).toContain(`frogoe contract v${pin.contract}`);
  });

  test("refuses to overwrite an existing game without --force", () => {
    const parent = freshDir("init-refuse");
    scaffold("g", { dir: parent });
    expect(() => scaffold("g", { dir: parent })).toThrow(/--force/u);
    expect(() => scaffold("g", { dir: parent, force: true })).not.toThrow();
  });
});

describe("frogoe add", () => {
  test("copies a valid block and reports its bindings", () => {
    const parent = freshDir("add-ok");
    scaffold("g", { dir: parent });
    const result = addBlock("score-card", { dir: path.join(parent, "g") });
    expect(result.block).toBe("score-card");
    expect(result.injected).toBeTrue();
    expect(existsSync(path.join(parent, "g", "hud", "score-card.html"))).toBeTrue();
    expect(result.bindings).toContain("data-block-score");
  });

  test("unknown block teaches what exists", () => {
    const dir = freshDir("add-unknown");
    expect(() => addBlock("hud-teleporter", { dir })).toThrow(/score-card/u);
  });
});

describe("frogoe check", () => {
  test("clean scaffold (brief filled) has zero errors", () => {
    const parent = freshDir("check-clean");
    scaffold("g", { dir: parent });
    const dir = path.join(parent, "g");
    fillBrief(dir);
    const result = checkProject(dir);
    expect(result.errors).toBe(0);
  });

  test("every rule fires on purpose (mutations)", () => {
    const parent = freshDir("check-rules");
    scaffold("g", { dir: parent });
    const dir = path.join(parent, "g");
    fillBrief(dir);

    const indexFile = path.join(dir, "index.html");
    const gameFile = path.join(dir, "game.js");
    const pinFile = path.join(dir, "frogoe.json");

    // brief/todo + brief/frontmatter
    writeFileSync(
      path.join(dir, "BRIEF.md"),
      '---\ntitle: TODO game\nverb: fly\nmood: \npalette:\n  bg: "#111"\n---\nx\n',
    );
    let codes = checkProject(dir).findings.map((f: Finding) => f.code);
    expect(codes).toContain("brief/todo");
    expect(codes).toContain("brief/frontmatter");

    // brief/contrast: fg ≈ bg
    fillBrief(dir);
    writeFileSync(
      path.join(dir, "BRIEF.md"),
      '---\ntitle: Low\nverb: tap\nmood: dim\npalette:\n  bg: "#121212"\n  fg: "#1a1a1a"\n  accent: "#ff9e5e"\n---\nx\n',
    );
    codes = checkProject(dir).findings.map((f: Finding) => f.code);
    expect(codes).toContain("brief/contrast");
    fillBrief(dir);

    // folder/canvas + folder/viewport-fit + folder/importmap
    const html = readFileSync(indexFile, "utf-8");
    writeFileSync(
      indexFile,
      html
        .replace(/<canvas[^>]*id="c"[^>]*>/u, "")
        .replace("viewport-fit=cover", "")
        .replace(/"frogoe":[^,}]+/u, '"frogoe": "./wrong.js"'),
    );
    codes = checkProject(dir).findings.map((f: Finding) => f.code);
    expect(codes).toContain("folder/canvas");
    expect(codes).toContain("folder/viewport-fit");
    expect(codes).toContain("folder/importmap");
    writeFileSync(indexFile, html);

    // input/incremental-drag (exact shipped-defect pattern)
    writeFileSync(
      gameFile,
      readFileSync(gameFile, "utf-8") + '\ninput.on("drag", (p) => { x += p.dx * 1.15; });\n',
    );
    codes = checkProject(dir).findings.map((f: Finding) => f.code);
    expect(codes).toContain("input/incremental-drag");
    scaffold("g", { dir: parent, force: true });
    fillBrief(dir);

    // folder/contract-pin drift
    writeFileSync(pinFile, JSON.stringify({ contract: "9.9.9" }));
    codes = checkProject(dir).findings.map((f: Finding) => f.code);
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
      '---\ntitle: Ember\nverb: tap # one word\nmood: dawn\npalette:\n  bg: "#111111"  # base\n  fg: "#eeeeee"\n  accent: "#ff9e5e"\n---\n',
    );
    expect(brief?.title).toBe("Ember");
    expect(brief?.verb).toBe("tap");
    expect(brief?.bg).toBe("#111111");
    expect(brief?.accent).toBe("#ff9e5e");
  });
});

describe("frogoe run", () => {
  test("serves index.html with the reload script injected", async () => {
    const parent = freshDir("run-serve");
    scaffold("g", { dir: parent });
    const server = await startServer(path.join(parent, "g"));
    try {
      const res = await fetch(`http://localhost:${server.port}/`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("/__frogoe/reload");
      expect(body).toContain('<canvas id="c">');
      const missing = await fetch(`http://localhost:${server.port}/nope.js`);
      expect(missing.status).toBe(404);
      const contract = await fetch(`http://localhost:${server.port}/.frogoe/contract.js`);
      expect(contract.status).toBe(200);
    } finally {
      server.stop();
    }
  });

  test("SSE endpoint answers with event-stream headers", async () => {
    const parent = freshDir("run-sse");
    scaffold("g", { dir: parent });
    const server = await startServer(path.join(parent, "g"));
    try {
      const res = await fetch(`http://localhost:${server.port}/__frogoe/reload`);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      await res.body?.cancel();
    } finally {
      server.stop();
    }
  });

  test("snapshot writes are tool output — they must not reload the page", async () => {
    const parent = freshDir("run-watch");
    scaffold("g", { dir: parent });
    const gameDir = path.join(parent, "g");
    const server = await startServer(gameDir);
    try {
      // let the scaffold's own write-events drain through the watcher's
      // 100ms debounce BEFORE connecting — otherwise scaffold noise reads
      // as a snapshot-triggered reload
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`http://localhost:${server.port}/__frogoe/reload`);
      const reader = res.body?.getReader();
      expect(reader).toBeDefined();
      const events: string[] = [];
      const pump = (async () => {
        try {
          for (;;) {
            const chunk = await reader?.read();
            if (!chunk || chunk.done) break;
            if (new TextDecoder().decode(chunk.value).includes("data: reload")) {
              events.push("reload");
            }
          }
        } catch {
          /* stream closed by server.stop() */
        }
      })();

      // the live sandbox writes screenshots mid-run: no reload may fire
      mkdirSync(path.join(gameDir, "snapshots"), { recursive: true });
      writeFileSync(path.join(gameDir, "snapshots", "live-mobile.png"), "png");
      await new Promise((r) => setTimeout(r, 400));
      expect(events).toEqual([]);

      // a real game-file change still reloads
      writeFileSync(path.join(gameDir, "game.js"), "// touch\n");
      await new Promise((r) => setTimeout(r, 400));
      expect(events).toEqual(["reload"]);

      await reader?.cancel();
      await pump;
    } finally {
      server.stop();
    }
  });
});

rmSync(tmpRoot, { recursive: true, force: true });
