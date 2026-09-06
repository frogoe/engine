/** The card — dist/embed.html. YouTube embed model: the authored key
 *  art (poster) shows while the game boots, fades when the relay
 *  reports running. No badge, no buttons, no chrome beyond the poster
 *  itself — the game IS the card. The payload arrives as an inert
 *  base64 blob decoded into the sandboxed iframe's srcdoc; the frame
 *  identity check (event.source) plus the protocol's closed payloads
 *  are the only doors in. Poster and icon come from dist/assets/ —
 *  rasterized from the AUTHORED SVGs, never generated here. */
import type { GameManifest } from "../manifest.ts";

export interface CardOptions {
  /** base64 of (game html + relay) — decoded by the loader into srcdoc */
  payloadB64: string;
  /** data: URI of the rasterized poster — the loading state */
  posterDataUri: string | null;
  /** data: URI of the rasterized icon — the card's favicon */
  iconDataUri: string | null;
  manifest: GameManifest;
}

const BOOT_TIMEOUT_MS = 10_000;
const LOADING_TIMEOUT_MS = 45_000;

/** The <frogoe-card> custom element — drop-in embed for hosts. Wraps the
 *  standalone embed.html in a Shadow-DOM component with the same API as
 *  window.__frogoeCard, plus lifecycle hygiene (the hyperframes lesson:
 *  disconnectedCallback pauses + tears down everything — no orphaned
 *  rAF/listeners after removal from DOM). The srcdoc payload rides as
 *  a child <script type="application/octet-stream"> — inert until boot.
 *
 *  Usage:
 *    <frogoe-card src="./dist/embed.html" width="390" height="844"></frogoe-card>
 *  Or inline:
 *    <frogoe-card poster="..." payload="base64..."></frogoe-card>
 */
const CARD_ELEMENT_SCRIPT = `
if (!customElements.get("frogoe-card")) {
  customElements.define("frogoe-card", class FrogoeCard extends HTMLElement {
    static get observedAttributes() {
      return ["src", "width", "height", "poster", "payload"];
    }
    constructor() {
      super();
      this._frame = null;
      this._card = null;
      this._bootTimer = null;
      this._loadingTimer = null;
      this._state = "loading";
      this._score = null;
      this._manifest = null;
    }
    connectedCallback() { this._build(); }
    disconnectedCallback() { this._destroy(); }
    attributeChangedCallback(name, oldVal, newVal) {
      if (oldVal === newVal) return;
      if (name === "src" && this._frame) this._frame.src = newVal;
      if (name === "width") this.style.width = newVal + "px";
      if (name === "height") this.style.height = newVal + "px";
      if ((name === "poster" || name === "payload") && this._frame) this._build();
    }
    get state() { return this._state; }
    get score() { return this._score; }
    get manifest() { return this._manifest; }
    get cardWindow() { return this._card ? this._card.__frogoeCard : null; }
    pause() { if (this._card) this._card.__frogoeCard.pause(); }
    resume() { if (this._card) this._card.__frogoeCard.resume(); }
    mute(m) { if (this._card) this._card.__frogoeCard.mute(m); }
    restart() { if (this._card) this._card.__frogoeCard.restart(); }
    _build() {
      this._destroy();
      const shadow = this.shadowRoot || this.attachShadow({ mode: "open" });
      shadow.innerHTML = "";
      const frame = document.createElement("iframe");
      frame.style.cssText = "border:0;display:block;width:100%;height:100%";
      frame.sandbox = "allow-scripts allow-same-origin";
      frame.referrerPolicy = "no-referrer";
      frame.title = "frogoe game";
      const src = this.getAttribute("src");
      if (src) frame.src = src;
      shadow.appendChild(frame);
      this._frame = frame;
      frame.addEventListener("load", () => {
        try {
          const card = frame.contentWindow;
          if (card && card.__frogoeCard) {
            this._card = card;
            card.addEventListener("frogoe:card-state", (e) => {
              this._state = e.detail.state;
              this._score = e.detail.score;
              this.dispatchEvent(new CustomEvent("frogoe:card-state", { detail: e.detail, bubbles: true }));
            });
          }
        } catch (e) { /* cross-origin */ }
      });
    }
    _destroy() {
      if (this._frame) {
        this._frame.remove();
        this._frame = null;
      }
      this._card = null;
      this._state = "loading";
      this._score = null;
    }
  });
}
`;

export const composeEmbedHtml = (options: CardOptions): string => {
  const { manifest, payloadB64, posterDataUri, iconDataUri } = options;
  const p = manifest.palette;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(manifest.title)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'">
${iconDataUri ? `<link rel="icon" href="${iconDataUri}">` : ""}
<style>
html,body{margin:0;height:100%;overflow:hidden;background:${p.bg || "#111"};}
iframe{border:0;display:block;width:100%;height:100%}
.p{position:absolute;inset:0;z-index:2;background:${posterDataUri ? `url("${posterDataUri}") center / cover no-repeat` : p.bg || "#111"};transition:opacity 500ms ease}
.p.off{opacity:0;pointer-events:none}
@media (prefers-reduced-motion: reduce){.p{transition:none}}
</style>
</head>
<body>
<script type="application/octet-stream" id="frogoe-game">${payloadB64}</script>
<iframe id="frame" title="${escapeHtml(manifest.title)}" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
<div class="p" id="poster"></div>
<script>
(function () {
  var frame = document.getElementById("frame");
  var poster = document.getElementById("poster");
  var BOOT_TIMEOUT = ${String(BOOT_TIMEOUT_MS)};
  var LOADING_TIMEOUT = ${String(LOADING_TIMEOUT_MS)};
  var bootTimer, loadingTimer;

  var postControl = function (payload) {
    try {
      frame.contentWindow.postMessage(
        Object.assign({ source: "frogoe-card-host", v: 1, type: "control" }, payload),
        "*"
      );
    } catch (e) {}
  };
  window.__frogoeCard = { state: "loading", score: null,
    restart: function () { boot(); },
    pause: function () { postControl({ action: "pause" }); },
    resume: function () { postControl({ action: "resume" }); },
    mute: function (m) { muted = m === true; postControl({ action: "mute", muted: m === true }); },
    destroy: function () {
      clearTimeout(bootTimer); clearTimeout(loadingTimer);
      postControl({ action: "pause" });
      try { frame.srcdoc = ""; } catch (e) {}
      frame.remove();
      poster.remove();
      var carrier = document.getElementById("frogoe-game");
      if (carrier) carrier.remove();
      window.__frogoeCard.state = "destroyed";
    } };
  window.__frogoeManifest = ${safeJson(manifest)};

  function setState(state, score) {
    window.__frogoeCard.state = state;
    if (state === "over") window.__frogoeCard.score = score === undefined ? 0 : score;
    if (state === "running") {
      poster.classList.add("off");
      try { frame.contentWindow?.focus(); } catch (e) {}
      if (muted) postControl({ action: "mute", muted: true });
    }
    document.dispatchEvent(new CustomEvent("frogoe:card-state", {
      detail: { state: state, score: window.__frogoeCard.score }
    }));
  }
  function fail() { setState("error"); }

  var muted = false;
  function boot() {
    clearTimeout(bootTimer); clearTimeout(loadingTimer);
    poster.classList.remove("off");
    window.__frogoeCard.state = "loading"; window.__frogoeCard.score = null;
    var b64 = document.getElementById("frogoe-game").textContent;
    var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    frame.srcdoc = new TextDecoder().decode(bytes);
    bootTimer = setTimeout(function () { if (window.__frogoeCard.state === "loading") fail(); }, BOOT_TIMEOUT);
    loadingTimer = setTimeout(function () {
      if (window.__frogoeCard.state === "loading") fail();
    }, LOADING_TIMEOUT);
  }

  function parseMsg(data) {
    if (typeof data !== "object" || data === null) return null;
    if (data.v !== 1 || data.source !== "frogoe-card") return null;
    if (data.type === "error") return { type: "error" };
    if (data.type !== "state") return null;
    var s = data.state;
    if (s !== "loading" && s !== "running" && s !== "over") return null;
    if (s === "over") {
      if (typeof data.score !== "number" || !isFinite(data.score)) return null;
      return { type: "state", state: "over", score: data.score };
    }
    if ("score" in data) return null;
    return { type: "state", state: s };
  }

  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow) return;
    var parsed = parseMsg(event.data);
    if (!parsed) return;
    clearTimeout(bootTimer); clearTimeout(loadingTimer);
    if (parsed.type === "error") { fail(); return; }
    if (parsed.state === "loading") return;
    setState(parsed.state, parsed.score);
    try { parent.postMessage(event.data, "*"); } catch (e) {}
  });

  boot();
})();
</script>
<script>
${CARD_ELEMENT_SCRIPT}
</script>
</body>
</html>`;
};

/** JSON that is safe to embed inside an inline <script>: escapes the
 *  HTML-significant characters JSON.stringify leaves raw (`</script>`
 *  in a game title must never break into the HOST page's context —
 *  the card runs unsandboxed; only the iframe is the sandbox). */
const safeJson = (value: GameManifest): string =>
  JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

const escapeHtml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
