import { afterAll, describe, expect, test } from "bun:test";
/** Embed units — protocol validation, relay, payload composer, card
 *  composer, manifest builder. Everything pure: the browser path
 *  (card e2e) is driven separately in embed.e2e.ts. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseHostControl, parseHostMessage } from "../src/embed/protocol.ts";
import { RELAY_SCRIPT } from "../src/embed/relay.ts";
import { composePayload, injectRelay } from "../src/embed/compose.ts";
import { composeEmbedHtml } from "../src/embed/card.ts";
import { buildManifest, descriptionFrom } from "../src/manifest.ts";

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

Player holds to charge.

One life, best score is the loop.
`;

describe("embed protocol (parseHostMessage)", () => {
  test("accepts the three states; score only on over", () => {
    expect(
      parseHostMessage({ source: "frogoe-card", state: "loading", type: "state", v: 1 }),
    ).toEqual({ type: "state", state: "loading" });
    expect(
      parseHostMessage({ source: "frogoe-card", state: "running", type: "state", v: 1 }),
    ).toEqual({ state: "running", type: "state" });
    expect(
      parseHostMessage({ source: "frogoe-card", state: "over", type: "state", v: 1, score: 7 }),
    ).toEqual({ score: 7, state: "over", type: "state" });
  });
  test("rejects everything untrusted", () => {
    const bad = [
      null,
      "string",
      42,
      {},
      { source: "frogoe-card", type: "state", v: 2 },
      { source: "evil", state: "over", type: "state", v: 1 },
      { source: "frogoe-card", type: "navigate", v: 1 },
      { source: "frogoe-card", state: "paused", type: "state", v: 1 },
      { source: "frogoe-card", state: "over", type: "state", v: 1, score: "9" },
      { source: "frogoe-card", state: "over", type: "state", v: 1, score: Number.NaN },
      { source: "frogoe-card", state: "running", type: "state", v: 1, score: 1 },
    ];
    for (const payload of bad) expect(parseHostMessage(payload)).toBeNull();
  });
  test("host control: closed action set, mute needs a boolean", () => {
    expect(
      parseHostControl({ action: "pause", source: "frogoe-card-host", type: "control", v: 1 }),
    ).toEqual({
      action: "pause",
    });
    expect(
      parseHostControl({
        action: "mute",
        muted: true,
        source: "frogoe-card-host",
        type: "control",
        v: 1,
      }),
    ).toEqual({ action: "mute", muted: true });
    const bad = [
      null,
      {},
      { action: "pause", source: "frogoe-card-host", type: "control", v: 2 },
      { action: "pause", source: "evil", type: "control", v: 1 },
      { action: "seek", source: "frogoe-card-host", type: "control", v: 1 },
      { action: "mute", source: "frogoe-card-host", type: "control", v: 1 }, // no boolean
      { action: "mute", muted: "yes", source: "frogoe-card-host", type: "control", v: 1 },
    ];
    for (const payload of bad) expect(parseHostControl(payload)).toBeNull();
  });

  test("error carries no payload — a nameless, unforgeable failure signal", () => {
    expect(parseHostMessage({ source: "frogoe-card", type: "error", v: 1 })).toEqual({
      type: "error",
    });
    expect(parseHostMessage({ message: "x", source: "frogoe-card", type: "error", v: 1 })).toEqual({
      type: "error",
    });
  });
});

describe("relay (contract → card translation)", () => {
  test("alive-signal first, 200 ms change poll, finish score, error trap", () => {
    expect(RELAY_SCRIPT).toContain('emit("loading")'); // race-repair, before the poll
    expect(RELAY_SCRIPT.indexOf('emit("loading")')).toBeLessThan(
      RELAY_SCRIPT.indexOf("setInterval"),
    );
    expect(RELAY_SCRIPT).toContain("setInterval(function ()");
    expect(RELAY_SCRIPT).toContain("200");
    expect(RELAY_SCRIPT).toContain("frogoe:finish");
    expect(RELAY_SCRIPT).toContain('type: "error"');
  });
  test("the relay ships the control validator as source + parent-source check", () => {
    expect(RELAY_SCRIPT).toContain("var parseHostControl =");
    expect(RELAY_SCRIPT).toContain("event.source !== window.parent");
    expect(RELAY_SCRIPT).toContain('action === "pause"');
    expect(RELAY_SCRIPT).toContain('action === "mute"');
  });

  test("the relay marks the embed context (frogoe-embed on the root)", () => {
    expect(RELAY_SCRIPT).toContain('classList.add("frogoe-embed")');
  });

  test("paused maps to running; a finish without a score reports 0", () => {
    expect(RELAY_SCRIPT).toContain('"playing" || state === "paused"');
    expect(RELAY_SCRIPT).toContain("isFinite(detail.score)");
  });
});

describe("payload composer", () => {
  test("relay lands before </body>; base64 roundtrips to the exact srcdoc", () => {
    const game = `<!doctype html><html><body><script>console.log("game")</script></body></html>`;
    const srcdoc = injectRelay(game, "<script>RELAY</script>");
    expect(srcdoc.indexOf("<script>RELAY</script>")).toBeLessThan(srcdoc.lastIndexOf("</body>"));
    const { payloadB64, srcdoc: viaComposer } = composePayload(game);
    expect(Buffer.from(payloadB64, "base64").toString("utf-8")).toBe(viaComposer);
    expect(viaComposer).toContain("frogoe:finish");
  });
});

describe("card composer", () => {
  const manifest = {
    artifact: "index.html",
    artifactSha256: "a".repeat(64),
    contract: "0.1.0",
    description: null,
    entry: "index.html",
    fonts: null,
    icon: null,
    mood: null,
    palette: { accent: "#ff3b3b", bg: "#1a1424", fg: "#f2ecff" },
    poster: null,
    posterSha256: null,
    iconSha256: null,
    title: "Ember Climb",
    verb: "hold",
  };
  const opts = {
    iconDataUri: null as string | null,
    manifest,
    payloadB64: "aGk=",
    posterDataUri: null as string | null,
  };
  test("poster is the loading state; sandbox allow-scripts only; host handle", () => {
    const html = composeEmbedHtml(opts);
    expect(html).toContain('sandbox="allow-scripts"');
    // the CARD iframe (game sandbox) is opaque-origin — no allow-same-origin;
    // the custom ELEMENT wrapper uses allow-same-origin to bridge the API
    // to a same-origin embed.html (different trust domain, by design)
    expect(html).toContain('frame.sandbox = "allow-scripts allow-same-origin"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain('class="p"'); // poster loading div
    expect(html).toContain("off"); // fade class on running
    expect(html).toContain("prefers-reduced-motion");
    expect(html).not.toContain("data-embed-retry");
    expect(html).not.toContain("data-embed-badge");
    expect(html).toContain("__frogoeCard");
    expect(html).toContain("frogoe:card-state");
    expect(html).toContain("parent.postMessage");
    expect(html).toContain("restart");
    expect(html).toContain("pause");
    expect(html).toContain("resume");
    expect(html).toContain("mute");
    expect(html).toContain("destroy");
    expect(html).toContain('source: "frogoe-card-host"');
    // lifecycle: destroy tears everything down (hyperframes lesson)
    expect(html).toContain('frame.srcdoc = ""');
    expect(html).toContain("frame.remove()");
    // mute state survives restart (race-replay)
    expect(html).toContain("if (muted) postControl");
    // custom element <frogoe-card> ships in every embed
    expect(html).toContain('customElements.define("frogoe-card"');
    expect(html).toContain("disconnectedCallback");
    expect(composeEmbedHtml(opts)).toBe(html); // byte-stable
  });
  test("poster and icon inline when present; favicon only with an icon", () => {
    const html = composeEmbedHtml({
      ...opts,
      iconDataUri: "data:image/png;base64,QUJD",
      posterDataUri: "data:image/png;base64,REFUQQ==",
    });
    expect(html).toContain('url("data:image/png;base64,REFUQQ==") center / cover');
    expect(html).toContain('<link rel="icon" href="data:image/png;base64,QUJD">');
    expect(composeEmbedHtml(opts)).not.toContain('rel="icon"');
  });
});

const tmpRoot = path.join(import.meta.dir, "../.tmp-embed");

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("manifest builder", () => {
  const fresh = (): string => {
    const dir = path.join(tmpRoot, "game");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(path.join(dir, "BRIEF.md"), BRIEF);
    writeFileSync(path.join(dir, "frogoe.json"), JSON.stringify({ contract: "0.1.0" }));
    writeFileSync(path.join(dir, "dist", "index.html"), "<!-- artifact -->");
    return dir;
  };
  test("identity + integrity, deterministic key order, media null when absent", () => {
    const manifest = buildManifest({ dir: fresh() });
    expect(manifest).not.toBeNull();
    expect(Object.keys(manifest ?? {})).toEqual([
      "artifact",
      "artifactSha256",
      "contract",
      "description",
      "entry",
      "fonts",
      "icon",
      "iconSha256",
      "mood",
      "palette",
      "poster",
      "posterSha256",
      "title",
      "verb",
    ]);
    expect(manifest?.title).toBe("Ember Climb");
    expect(manifest?.fonts).toBe("Press Start 2P");
    expect(manifest?.description).toBe("Player holds to charge.");
    expect(manifest?.poster).toBeNull();
    expect(manifest?.icon).toBeNull();
    expect(manifest?.posterSha256).toBeNull();
    expect(manifest?.iconSha256).toBeNull();
    expect(manifest?.artifactSha256).toMatch(/^[a-f0-9]{64}$/u);
  });
  test("rasterized media surfaces when dist/assets exists", () => {
    const dir = fresh();
    mkdirSync(path.join(dir, "dist", "assets"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "assets", "poster.png"), "");
    writeFileSync(path.join(dir, "dist", "assets", "icon.png"), "");
    const manifest = buildManifest({ dir });
    expect(manifest?.poster).toBe("assets/poster.png");
    expect(manifest?.icon).toBe("assets/icon.png");
    expect(manifest?.posterSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest?.iconSha256).toMatch(/^[a-f0-9]{64}$/u);
  });
  test("description is the first body paragraph, capped at 280", () => {
    expect(descriptionFrom(BRIEF)).toBe("Player holds to charge.");
    const long = `---\ntitle: X\nverb: tap\n---\n\n${"x".repeat(400)}\n`;
    expect(descriptionFrom(long)?.length).toBe(280);
  });
});
