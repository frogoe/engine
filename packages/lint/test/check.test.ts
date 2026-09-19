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
    options?.pin ?? JSON.stringify({ contract: "0.2.0" }),
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
      `const C = { bg: "#101418", accent: "#ffd166" };
export { C };
defineGame(({ input, loop }) => {
  input.on("down", () => {});
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
  );
  writeFileSync(
    path.join(dir, ".frogoe", "contract.js"),
    "// frogoe contract v0.2.0 (materialized by frogoe init — do not edit)\nexport {};\n",
  );
  // authored identity art — part of the shippable game (art/* checks)
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  writeFileSync(
    path.join(dir, "assets", "poster.js"),
    `import { C } from "../game.js";\n\nexport function drawPoster(ctx, w, h) {\n  ctx.fillStyle = C.bg;\n  ctx.fillRect(0, 0, w, h);\n  ctx.fillStyle = C.accent;\n  ctx.beginPath();\n  ctx.arc(w / 2, h / 2, 120, 0, 7);\n  ctx.fill();\n}\n`,
  );
  writeFileSync(
    path.join(dir, "assets", "icon.js"),
    `import { C } from "../game.js";\n\nexport function drawIcon(ctx, size) {\n  ctx.fillStyle = C.bg;\n  ctx.fillRect(0, 0, size, size);\n  ctx.fillStyle = C.accent;\n  ctx.beginPath();\n  ctx.arc(size / 2, size / 2, 180, 0, 7);\n  ctx.fill();\n}\n`,
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

  test("input/raw-keyboard: raw keydown listener flagged, contract listener clean", () => {
    const dir = freshDir("raw-keyboard");
    writeGame(dir, {
      game: `defineGame(({ input, loop }) => {
  input.on("down", () => {});
  window.addEventListener("keydown", (e) => {});
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
    });
    const finding = checkProject(dir).findings.find((f) => f.code === "input/raw-keyboard");
    expect(finding?.severity).toBe("error");
    expect(finding?.line).toBe(3);

    writeGame(dir, {
      game: `defineGame(({ input, loop }) => {
  input.on("down", () => {});
  input.on("key", (k) => {});
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
    });
    expect(checkProject(dir).findings.some((f) => f.code === "input/raw-keyboard")).toBeFalse();
  });

  test("test/logic-untested: logic verbs require game.test.js", () => {
    const dir = freshDir("logic-untested");
    writeGame(dir, {
      brief: `---
title: Test Game
verb: type
mood: cheerful
palette:
  bg: "#101418"
  fg: "#fffdf7"
  accent: "#ffd166"
  outline: "#26180a"
---
Type words.
`,
    });
    const fired = checkProject(dir).findings.find((f) => f.code === "test/logic-untested");
    expect(fired?.severity).toBe("error");

    writeFileSync(
      path.join(dir, "game.test.js"),
      'import { test } from "bun:test";\ntest("t", () => {});\n',
    );
    expect(checkProject(dir).findings.some((f) => f.code === "test/logic-untested")).toBeFalse();

    // tap games stay optional
    const tapDir = freshDir("logic-untested-tap");
    writeGame(tapDir);
    expect(checkProject(tapDir).findings.some((f) => f.code === "test/logic-untested")).toBeFalse();
  });

  test("stage/cached-metrics: const geometry snapshot flagged, per-tick helper clean", () => {
    const dir = freshDir("cached-metrics");
    writeGame(dir, {
      game: `defineGame(({ input, loop, stage }) => {
  input.on("down", () => {});
  const { width, left } = stage.play;
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
    });
    const finding = checkProject(dir).findings.find((f) => f.code === "stage/cached-metrics");
    expect(finding?.severity).toBe("error");
    expect(finding?.line).toBe(3);

    writeGame(dir, {
      game: `defineGame(({ input, loop, stage }) => {
  input.on("down", () => {});
  const layout = () => ({ w: stage.play.width, l: stage.play.left });
  loop.update = (dt) => { const L = layout(); };
  loop.render = (ctx) => {};
});
`,
    });
    expect(checkProject(dir).findings.some((f) => f.code === "stage/cached-metrics")).toBeFalse();
  });

  test("hud/magic-anchor: inline tuned offset on a data-pos wrapper warns, registry overlay clean", () => {
    const dir = freshDir("magic-anchor");
    writeGame(dir, {
      html: `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>html, body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }</style>
<script type="importmap">{"imports":{"frogoe":"./.frogoe/contract.js"}}</script>
</head><body>
<canvas id="c"></canvas>
<div class="hud"><div data-pos="top-center" style="top: 44%; translate: -50% -50%;"><div class="gate">PLAY</div></div></div>
<script type="module" src="game.js"></script>
</body></html>`,
    });
    const finding = checkProject(dir).findings.find((f) => f.code === "hud/magic-anchor");
    expect(finding?.severity).toBe("warning");
    expect(finding?.line).toBe(9);
  });

  test("folder/contract-stale: old pin warns, current pin silent", () => {
    const dir = freshDir("stale-pin");
    writeGame(dir, { pin: JSON.stringify({ contract: "0.1.0" }) });
    writeFileSync(
      path.join(dir, ".frogoe", "contract.js"),
      "// frogoe contract v0.1.0 (materialized by frogoe init — do not edit)\nexport {};\n",
    );
    const stale = checkProject(dir).findings.find((f) => f.code === "folder/contract-stale");
    expect(stale?.severity).toBe("warning");
    expect(stale?.message).toContain("0.1.0");

    // current pin: no stale, no drift
    writeGame(dir);
    const codes = checkProject(dir).findings.map((f) => f.code);
    expect(codes).not.toContain("folder/contract-stale");
    expect(codes).not.toContain("folder/contract-pin");
  });

  test('type verb requires input.on("key") wiring', () => {
    const dir = freshDir("type-verb");
    writeGame(dir, {
      brief: `---
title: Word Game
verb: type
mood: cheerful
palette:
  bg: "#101418"
  fg: "#fffdf7"
  accent: "#ffd166"
  outline: "#26180a"
---
Type words.
`,
      game: `defineGame(({ input, loop }) => {
  input.on("down", () => {});
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
    });
    const mismatch = checkProject(dir).findings.find((f) => f.code === "input/verb-mismatch");
    expect(mismatch?.severity).toBe("error");
    expect(mismatch?.fix).toContain('input.on("key"');

    writeGame(dir, {
      brief: `---
title: Word Game
verb: type
mood: cheerful
palette:
  bg: "#101418"
  fg: "#fffdf7"
  accent: "#ffd166"
  outline: "#26180a"
---
Type words.
`,
      game: `defineGame(({ input, loop }) => {
  input.on("down", () => {});
  input.on("key", (k) => {});
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
    });
    expect(checkProject(dir).findings.some((f) => f.code === "input/verb-mismatch")).toBeFalse();
  });
});

describe("genre taxonomy: verbs and sessions", () => {
  test("all nine verbs pass the enum and the session enum is exactly three", () => {
    const dir = freshDir("verbs");
    for (const verb of ["tap", "hold", "steer", "aim", "swap", "place", "type", "draw", "idle"]) {
      writeGame(dir, {
        brief: `---
title: Enum Walk
verb: ${verb}
session: blitz
mood: taxonomy walk
palette:
  bg: "#101418"
  fg: "#fffdf7"
  accent: "#ffd166"
  outline: "#26180a"
---
x
`,
        // wire every handler so no verb-mismatch clouds the enum check
        game: `defineGame(({ input, loop }) => {
  input.on("down", () => {});
  input.on("drag", () => {});
  input.on("up", () => {});
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
      });
      const result = checkProject(dir);
      expect(result.findings.some((f) => f.code.startsWith("brief/"))).toBeFalse();
    }
    for (const session of ["blitz", "round", "toy"]) {
      writeGame(dir, {
        brief: `---
title: Enum Walk
verb: tap
session: ${session}
mood: taxonomy walk
palette:
  bg: "#101418"
  fg: "#fffdf7"
  accent: "#ffd166"
  outline: "#26180a"
---
x
`,
      });
      expect(checkProject(dir).findings.some((f) => f.code === "brief/session")).toBeFalse();
    }
  });

  test("an unknown verb gets its own teaching finding (not folded into frontmatter)", () => {
    const dir = freshDir("verb-bad");
    writeGame(dir, {
      brief: `---
title: Flyer
verb: flutter
mood: test
palette:
  bg: "#101418"
  fg: "#fffdf7"
  accent: "#ffd166"
  outline: "#26180a"
---
x
`,
    });
    const codes = checkProject(dir).findings.map((f) => f.code);
    expect(codes).toContain("brief/verb");
    expect(codes).toContain("brief/frontmatter"); // verb still counts as missing/invalid
  });

  test("an unknown session shape is a brief/session error", () => {
    const dir = freshDir("session-bad");
    writeGame(dir, {
      brief: `---
title: Sessioned
verb: tap
session: marathon
mood: test
palette:
  bg: "#101418"
  fg: "#fffdf7"
  accent: "#ffd166"
  outline: "#26180a"
---
x
`,
    });
    const codes = checkProject(dir).findings.map((f) => f.code);
    expect(codes).toContain("brief/session");
  });

  test("session is optional — absent means blitz, never a finding", () => {
    const dir = freshDir("session-absent");
    writeGame(dir);
    expect(checkProject(dir).errors).toBe(0);
  });

  test("verb ↔ wiring: every verb's required handlers are enforced", () => {
    // draw needs down+drag+up; hold needs down+up; steer/aim need down+drag;
    // tap/swap/place/type/idle need down
    const cases: Array<{ game: string; clean: boolean; verb: string }> = [
      { verb: "draw", clean: false, game: `input.on("down", () => {}); input.on("up", () => {});` },
      { verb: "hold", clean: false, game: `input.on("down", () => {});` },
      {
        verb: "steer",
        clean: false,
        game: `input.on("down", () => {}); input.on("up", () => {});`,
      },
      { verb: "tap", clean: true, game: `input.on("down", () => {});` },
      {
        verb: "type",
        clean: true,
        game: `input.on("down", () => {}); input.on("key", () => {});`,
      },
    ];
    for (const c of cases) {
      const dir = freshDir(`mismatch-${c.verb}-${c.clean ? "ok" : "bad"}`);
      writeGame(dir, {
        brief: `---
title: Wiring
verb: ${c.verb}
mood: test
palette:
  bg: "#101418"
  fg: "#fffdf7"
  accent: "#ffd166"
  outline: "#26180a"
---
x
`,
        game: `defineGame(({ input, loop }) => {
  ${c.game}
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
      });
      const has = checkProject(dir).findings.some((f) => f.code === "input/verb-mismatch");
      expect(has).toBe(!c.clean);
    }
  });

  test("declared tap but only drag wired — the documented mismatch, now real", () => {
    const dir = freshDir("tap-drag");
    writeGame(dir, {
      game: `defineGame(({ input, loop }) => {
  input.on("drag", (p) => { const x = grab + p.dx; });
  loop.update = (dt) => {};
  loop.render = (ctx) => {};
});
`,
    });
    const finding = checkProject(dir).findings.find((f) => f.code === "input/verb-mismatch");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("error");
    expect(finding?.fix).toContain('input.on("down"');
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

  test("comment stripping is linear and exact (ReDoS regression)", () => {
    // a leading # is a VALUE (hex color), never a comment — only
    // whitespace-preceded # starts one
    expect(parseBrief("---\nverb: hold\t# note\n---\n")?.verb).toBe("hold");
    expect(parseBrief('---\nmood: "#cozy fire"\n---\n')?.mood).toBe("#cozy fire");
    // 8k spaces with no comment terminator: must complete instantly and
    // trim to empty — the old \s+#.*$ regex backtracked quadratically here
    const padded = `---\ntitle: ${" ".repeat(8000)}\n---\n`;
    expect(parseBrief(padded)?.title).toBe("");
  });

  test("quoted values unwrap; lines without a colon are ignored", () => {
    const brief = parseBrief('---\ntitle: "Ember"\nthis line has no colon\n---\n');
    expect(brief?.title).toBe("Ember");
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
