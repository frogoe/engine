/** Embed e2e — drives a real card in headless Chrome (not part of the
 *  bun test glob: chrome is heavy; run directly when touching embed):
 *
 *    bun test/embed.e2e.ts [card.html]
 *
 *  Without an argument it composes a card from a fixture game (a page
 *  publishing window.__frogoe + frogoe:finish — the contract surfaces
 *  the relay translates) and asserts the full lifecycle:
 *  boot → running → finish(score) → over+score → restart() → running. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { composeEmbedHtml } from "../src/embed/card.ts";
import { composePayload } from "../src/embed/compose.ts";
import { buildManifest } from "../src/manifest.ts";
import { launchBrowser } from "../src/browser/launch.ts";

const FIXTURE_GAME = `<!doctype html><html><body>
<script>
window.__frogoe = { state: "loading", version: "0.1.0", muted: false,
  pause: function () { this.state = "paused"; },
  resume: function () { this.state = "playing"; },
  mute: function (m) { this.muted = m === true; } };
setTimeout(function () { window.__frogoe.state = "playing"; }, 80);
document.addEventListener("frogoe:finish", function () {
  window.__frogoe.state = "over";
});
</script>
</body></html>`;

const buildFixtureCard = async (): Promise<string> => {
  const dir = path.join(import.meta.dir, "../.tmp-e2e");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "dist"), { recursive: true });
  writeFileSync(
    path.join(dir, "BRIEF.md"),
    `---
title: E2E Fixture
verb: tap
mood: test lab
palette:
  bg: "#1a1424"
  fg: "#f2ecff"
  accent: "#ff3b3b"
---

Tap once. The run ends.
`,
  );
  writeFileSync(path.join(dir, "dist", "index.html"), FIXTURE_GAME);
  const manifest = buildManifest({ dir, artifactHtml: FIXTURE_GAME });
  if (!manifest) throw new Error("fixture manifest failed");
  const { payloadB64 } = composePayload(FIXTURE_GAME);
  const html = composeEmbedHtml({
    iconDataUri: null,
    manifest,
    payloadB64,
    posterDataUri: null,
  });
  const cardPath = path.join(dir, "dist", "embed.html");
  writeFileSync(cardPath, html, "utf-8");
  return cardPath;
};

const main = async (): Promise<void> => {
  const cardPath = path.resolve(process.argv[2] ?? (await buildFixtureCard()));
  const browser = await launchBrowser({ defaultViewport: { height: 844, width: 390 } });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`file://${cardPath}`, { timeout: 15_000, waitUntil: "domcontentloaded" });

    await page.waitForFunction("window.__frogoeCard && window.__frogoeCard.state === 'running'", {
      timeout: 10_000,
      polling: 100,
    });

    // mute state survives restart (race-replay pattern)
    await page.evaluate("window.__frogoeCard.mute(true)");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await page.evaluate("window.__frogoeCard.restart()");
    await page.waitForFunction("window.__frogoeCard.state === 'running'", {
      timeout: 10_000,
      polling: 100,
    });
    const mutedAfterRestart = await page
      .frames()
      .find((f) => f !== page.mainFrame())
      ?.evaluate("window.__frogoe && window.__frogoe.muted");
    if (mutedAfterRestart !== true) throw new Error("mute state lost across restart");

    // finish(score 7) fired inside the sandbox → relay → card
    const frame = page.frames().find((f) => f !== page.mainFrame());
    if (!frame) throw new Error("no sandbox frame");

    // host→game control: pause/resume/mute reach the contract's own
    // handle (verified from INSIDE the frame — the host cannot read an
    // opaque-origin contentWindow)
    await page.evaluate("window.__frogoeCard.pause()");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const pausedState: unknown = await frame.evaluate("window.__frogoe && window.__frogoe.state");
    if (pausedState !== "paused") {
      throw new Error(`pause() did not reach the game (state=${String(pausedState)})`);
    }
    await page.evaluate("window.__frogoeCard.resume()");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const resumed = await frame.evaluate("window.__frogoe && window.__frogoe.state");
    if (resumed !== "playing") throw new Error(`resume() failed (state=${String(resumed)})`);
    await page.evaluate("window.__frogoeCard.mute(true)");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const muted = await frame.evaluate("window.__frogoe && window.__frogoe.muted");
    if (muted !== true) throw new Error("mute(true) did not reach the game");

    // pad gate (games with an on-screen pad): the pad is DEVICE-gated
    // (pointer: coarse) and lives only once the run starts — verified on
    // a dedicated TOUCH-posture page (mid-session viewport switches do
    // not flip pointer media queries): boot → PLAY → REAL press must
    // flip the game's own data-held state
    const hasPad = await frame.evaluate("!!document.getElementById('btnJ')");
    if (hasPad) {
      const touchPage = await browser.newPage();
      try {
        await touchPage.setViewport({
          deviceScaleFactor: 2,
          hasTouch: true,
          height: 844,
          isMobile: true,
          width: 390,
        });
        await touchPage.goto(page.url(), { timeout: 15_000, waitUntil: "domcontentloaded" });
        await touchPage.waitForFunction(
          "window.__frogoeCard && window.__frogoeCard.state === 'running'",
          { timeout: 12_000, polling: 100 },
        );
        const tFrame = touchPage.frames().find((f) => f !== touchPage.mainFrame());
        if (!tFrame) throw new Error("no sandbox frame in touch posture");
        const play = await tFrame.$("[data-block-play]");
        const pbox = await play?.boundingBox();
        if (!pbox) throw new Error("ready screen has no PLAY box");
        await touchPage.mouse.click(pbox.x + pbox.width / 2, pbox.y + pbox.height / 2);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const coarse = await tFrame.evaluate("matchMedia('(pointer: coarse)').matches");
        const padState = await tFrame.evaluate(
          "getComputedStyle(document.getElementById('btnJ').closest('.pad')).pointerEvents",
        );
        if (!coarse || padState !== "auto") {
          throw new Error(
            `pad not interactive in touch posture (coarse=${String(coarse)}, pointer-events=${String(padState)})`,
          );
        }
        const jb = await tFrame.$("#btnJ");
        const box = await jb?.boundingBox();
        if (!box) throw new Error("pad button has no box");
        await touchPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await touchPage.mouse.down();
        await new Promise((resolve) => setTimeout(resolve, 150));
        const held = await tFrame.evaluate(
          "document.getElementById('btnJ').hasAttribute('data-held')",
        );
        await touchPage.mouse.up();
        if (held !== true) throw new Error("real pointer press on the pad never reached the game");
      } finally {
        await touchPage.close();
      }
    }

    // the relay must have marked the embed context on the game's root
    const embedded = await frame.evaluate(
      "document.documentElement.classList.contains('frogoe-embed')",
    );
    if (embedded !== true) throw new Error("relay did not mark frogoe-embed");

    // REAL INPUT: a genuine mouse click inside the sandboxed frame must
    // reach the game (the faded poster is pointer-events:none — if the
    // click never lands, the card swallows input and games are unplayable).
    // The tap counter is injected at runtime — works for ANY card, no
    // cooperation from the game required.
    await frame.evaluate(
      "window.__e2eTap = 0; window.addEventListener('pointerdown', () => { window.__e2eTap++; }, true);",
    );
    await page.mouse.click(190, 350);
    const taps = (await frame.evaluate("window.__e2eTap ?? 0")) as number;
    if (taps < 1) throw new Error("real pointer input never reached the game");

    // the card focuses the frame on running — keyboard games work in
    // embeds without the player clicking first
    const focused = await page.evaluate(
      "document.activeElement && document.activeElement.id === 'frame'",
    );
    if (focused !== true) throw new Error("card did not focus the sandbox frame");
    await frame.evaluate(
      'document.dispatchEvent(new CustomEvent("frogoe:finish", { detail: { score: 7 } }))',
    );
    await page.waitForFunction(
      "window.__frogoeCard.state === 'over' && window.__frogoeCard.score === 7",
      { timeout: 10_000, polling: 100 },
    );

    // restart() reboots the sandbox → running again, score reset
    await page.evaluate("window.__frogoeCard.restart()");
    await page.waitForFunction(
      "window.__frogoeCard.state === 'running' && window.__frogoeCard.score === null",
      { timeout: 10_000, polling: 100 },
    );

    if (errors.length > 0) throw new Error(`page errors: ${errors.join(" | ")}`);
    console.log(
      `embed e2e OK — boot → running → over(score 7) → restart() → running (${path.basename(cardPath)})`,
    );
  } finally {
    await browser.close();
  }
  rmSync(path.join(import.meta.dir, "../.tmp-e2e"), { recursive: true, force: true });
};

await main();
