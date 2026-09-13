import { describe, expect, test } from "bun:test";
/** frogoe add — injection shapes. The wrapper-vs-direct distinction is the
 *  shipped-twice bug class (self-positioning blocks mis-anchored inside a
 *  shrink-wrapped div). These tests pin the three placements. */
import { injectIntoHtml } from "../src/add.ts";

/** Non-null wrapper: these tests exercise the happy path — a null return
 *  means the shell failed to parse, which should fail the test loudly. */
const inject = (
  html: string,
  name: string,
  css: string | null,
  markup: string,
  placement: string,
  pos?: string,
): string => {
  const out = injectIntoHtml(html, name, css, markup, placement, pos);
  if (out === null) throw new Error("injectIntoHtml returned null — shell not recognized");
  return out;
};

const SHELL = `<!doctype html>
<html><head><style>html { margin: 0; }</style></head><body>
  <canvas id="c"></canvas>
  <div class="hud">
    <div data-pos="top-left"><span class="existing">x</span></div>
  </div>
  <script type="module" src="game.js"></script>
</body></html>`;

describe("frogoe add — injection shapes", () => {
  test("overlay blocks land inside a data-pos wrapper from the registry corner", () => {
    const out = inject(
      SHELL,
      "score-card",
      ".a { color: red; }",
      '<div class="a" data-block-score>0</div>',
      "overlay",
      "top-left",
    );
    expect(out).toContain('<div data-pos="top-left">');
    expect(out).toContain("data-block-score");

    const centered = inject(
      SHELL,
      "hearts-row",
      null,
      "<div data-block-hearts></div>",
      "overlay",
      "top-center",
    );
    expect(centered).toContain('<div data-pos="top-center">');
  });

  test("overlay without a registry pos falls back to top-left", () => {
    const out = inject(SHELL, "combo", null, "<div data-block-combo>0</div>", "overlay");
    expect(out).toContain('<div data-pos="top-left">');
  });

  test("overlay-fullscreen blocks are DIRECT .hud children — no wrapper, ever", () => {
    const out = inject(
      SHELL,
      "game-over-card",
      null,
      '<div class="block-game-over" data-block-gameover>over</div>',
      "overlay-fullscreen",
    );
    // direct child: the marker is immediately followed by the block markup
    expect(out).toContain("<!-- frogoe:block:game-over-card -->\n" + "        " + "<div");
    // no data-pos wrapper was created for it
    const block = out.slice(
      out.indexOf("data-block-gameover") - 60,
      out.indexOf("data-block-gameover") + 40,
    );
    expect(block).not.toContain("data-pos=");
  });

  test("overlay-anchored blocks (docked keyboards) are also direct children", () => {
    const out = inject(
      SHELL,
      "hud-keyboard",
      null,
      '<div class="block-hud-keyboard" data-block-keyboard>keys</div>',
      "overlay-anchored",
    );
    const block = out.slice(
      out.indexOf("data-block-keyboard") - 60,
      out.indexOf("data-block-keyboard") + 40,
    );
    expect(block).not.toContain("data-pos=");
  });

  test("re-adding replaces idempotently (one install, not two)", () => {
    const once = inject(
      SHELL,
      "score-card",
      ".a{}",
      "<div data-block-score>0</div>",
      "overlay",
      "top-left",
    );
    const twice = inject(
      once ?? "",
      "score-card",
      ".a{}",
      "<div data-block-score>1</div>",
      "overlay",
      "top-left",
    );
    expect(twice).not.toBeNull();
    expect(twice?.match(/data-block-score/g)?.length).toBe(1);
    expect(twice).toContain("<div data-block-score>1</div>");
  });
});
