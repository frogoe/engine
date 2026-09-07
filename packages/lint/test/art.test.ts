import { afterAll, describe, expect, test } from "bun:test";
/** art/* findings — the authored-scene contract. Every rule fires on
 *  purpose against hand-built fixtures; the happy path is the exact
 *  poster/icon shape the examples ship (canvas scenes importing the
 *  game's own sprites). */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { checkArt } from "../src/art.ts";
import type { Finding } from "../src/check.ts";

const tmpRoot = path.join(import.meta.dir, "../.tmp-art");

const fresh = (name: string): string => {
  const dir = path.join(tmpRoot, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  return dir;
};

const BRIEF = `---
title: Ember Climb
verb: hold
mood: urgent warmth
palette:
  bg: "#1a1424"
  fg: "#f2ecff"
  accent: "#ff3b3b"
fonts: Press Start 2P
---
Body.
`;

const GAME = `// the game — sprites the art must reuse
export const C = { bg: "#1a1424", fg: "#f2ecff", accent: "#ff3b3b" };
export function drawPlayer(ctx, x, y) {
  ctx.fillStyle = C.fg;
  ctx.fillRect(x - 10, y - 10, 20, 20);
}
`;

const HTML = `<!doctype html>
<html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap">
</head><body></body></html>
`;

const POSTER_OK = `import { C, drawPlayer } from "../game.js";

export function drawPoster(ctx, w, h) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  drawPlayer(ctx, w / 2, h / 2);
  ctx.font = '96px "Press Start 2P"';
  ctx.fillStyle = C.fg;
  ctx.fillText("EMBER", 60, 120);
  ctx.__frogoeTitleBand = [60, 40, w - 60, 140];
}
`;

const ICON_OK = `import { C, drawPlayer } from "../game.js";

export function drawIcon(ctx, size) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size, size);
  drawPlayer(ctx, size / 2, size / 2);
}
`;

const write = (dir: string, poster: string | null, icon: string | null): void => {
  writeFileSync(path.join(dir, "BRIEF.md"), BRIEF);
  writeFileSync(path.join(dir, "game.js"), GAME);
  writeFileSync(path.join(dir, "index.html"), HTML);
  if (poster !== null) writeFileSync(path.join(dir, "assets", "poster.js"), poster);
  if (icon !== null) writeFileSync(path.join(dir, "assets", "icon.js"), icon);
};

const run = (dir: string): Finding[] => {
  const findings: Finding[] = [];
  checkArt(dir, findings);
  return findings;
};

const codes = (dir: string): string[] => run(dir).map((f) => f.code);

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("art findings (canvas scenes)", () => {
  test("clean authored scenes pass silently", () => {
    const dir = fresh("clean");
    write(dir, POSTER_OK, ICON_OK);
    expect(run(dir)).toEqual([]);
  });

  test("art/missing — a game without a face is not shippable", () => {
    const dir = fresh("missing");
    write(dir, null, null);
    const findings = run(dir);
    expect(findings.map((f) => f.code)).toEqual(["art/missing", "art/missing"]);
    expect(findings.every((f) => f.file.startsWith("assets/"))).toBeTrue();
    expect(findings[0]?.recipe).toBe("frogoe-creative → references/art.md");
  });

  test("art/scene-export — the rasterizer calls the entry by name", () => {
    const dir = fresh("export");
    write(
      dir,
      POSTER_OK.replace("export function drawPoster", "function drawPoster"),
      ICON_OK.replace("export function drawIcon", "export const drawMark"),
    );
    expect(codes(dir)).toEqual(["art/scene-export", "art/scene-export"]);
  });

  test("art/scene-source — no parallel renderers", () => {
    const dir = fresh("source");
    const orphan = POSTER_OK.replace('from "../game.js"', 'from "./local-sprites.js"');
    write(dir, orphan, ICON_OK.replace('import { C, drawPlayer } from "../game.js";\n\n', ""));
    expect(codes(dir)).toEqual(["art/scene-source", "art/scene-source"]);
  });

  test("art/color-drift — every hex must be one the game draws", () => {
    const dir = fresh("drift");
    write(
      dir,
      POSTER_OK.replace("ctx.fillText", 'ctx.fillStyle = "#00ff00";\n  ctx.fillText'),
      ICON_OK,
    );
    expect(codes(dir)).toEqual(["art/color-drift"]);
  });

  test("art/color-drift — short hex normalizes (#f53 ≡ #ff5533) and matches case-free", () => {
    const dir = fresh("short");
    write(
      dir,
      POSTER_OK.replace("ctx.fillText", 'ctx.fillStyle = "#F53";\n  ctx.fillText'),
      ICON_OK,
    );
    const drift = run(dir);
    expect(drift.map((f) => f.code)).toEqual(["art/color-drift"]); // game has no #ff5533
    writeFileSync(
      path.join(dir, "game.js"),
      GAME.replace('accent: "#ff3b3b"', 'accent: "#ff3b3b", warn: "#FF5533"'),
    );
    expect(codes(dir)).toEqual([]); // now it does
  });

  test("comments are not colors — hexes in comments don't fire, https:// survives", () => {
    const dir = fresh("comments");
    const poster = POSTER_OK.replace(
      "ctx.fillText",
      "// stray ideas: #00ff00 #abc — and see https://example.com/x\n  ctx.fillText",
    );
    write(dir, poster, ICON_OK);
    expect(codes(dir)).toEqual([]);
  });

  test("art/text-font — canvas lettering must be the BRIEF font AND actually linked", () => {
    const dir = fresh("font");
    write(dir, POSTER_OK.replace('96px "Press Start 2P"', "96px serif"), ICON_OK);
    expect(codes(dir)).toEqual(["art/text-font"]);
    // right family, but the game never loads it
    const dir2 = fresh("font-link");
    write(dir2, POSTER_OK, ICON_OK);
    writeFileSync(
      path.join(dir2, "index.html"),
      HTML.replace(
        "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap",
        "https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&display=swap",
      ),
    );
    expect(codes(dir2)).toEqual(["art/text-font"]);
  });

  test("no BRIEF fonts → no canvas lettering allowed", () => {
    const dir = fresh("nofonts");
    write(dir, POSTER_OK, ICON_OK);
    writeFileSync(path.join(dir, "BRIEF.md"), BRIEF.replace("fonts: Press Start 2P\n", ""));
    expect(codes(dir)).toEqual(["art/text-font"]);
  });

  test("art/empty — placeholder scenes are not key art", () => {
    const dir = fresh("empty");
    write(
      dir,
      `import { C } from "../game.js";\n\nexport function drawPoster(ctx, w, h) {\n  ctx.font = '96px "Press Start 2P"';\n  ctx.__frogoeTitleBand = [0, 0, w, 60];\n}\n`,
      `import { C } from "../game.js";\n\nexport function drawIcon(ctx, size) {}\n`,
    );
    expect(codes(dir)).toEqual(["art/empty", "art/title-presence", "art/empty"]);
  });

  test("art/title-band — undeclared safe-zone band disables the collision gate (warning)", () => {
    const dir = fresh("band");
    write(dir, POSTER_OK.replace("__frogoeTitleBand", "deadBand"), ICON_OK); // band gone from source
    const findings = run(dir);
    expect(findings.map((f) => f.code)).toContain("art/title-band");
    expect(findings.find((f) => f.code === "art/title-band")?.severity).toBe("warning");
  });

  test("art/title-presence — letterless posters teach the logotype law (warning)", () => {
    const dir = fresh("title");
    const letterless =
      ICON_OK.replace("export function drawIcon", "export function drawPoster").replace(
        /\(ctx, size\)/u,
        "(ctx, w, h)",
      ) + "ctx.__frogoeTitleBand = [0, 0, w, 60];\n";
    write(dir, letterless, ICON_OK);
    const findings = run(dir);
    expect(findings.map((f) => f.code)).toEqual(["art/title-presence"]);
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.recipe).toBe("frogoe-creative → references/art.md");
  });
});
