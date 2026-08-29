/** Page-side scripts for the live sandbox. Kept as strings in one place:
 *  the PROBE installs via evaluateOnNewDocument (it re-installs on every
 *  navigation, so the retry reload gets a fresh probe for free), the
 *  reads are evaluate()d against it. The driver knows the semantics;
 *  phases never see raw script. */

/** Installed before any navigation. Captures frogoe:finish events and
 *  counts rAF ticks into one-second buckets. defineProperty so game code
 *  cannot casually reassign it. */
export const PROBE_SCRIPT = `(() => {
  if (window.__frogoeProbe) return;
  const probe = { finish: [], fps: [] };
  Object.defineProperty(window, "__frogoeProbe", { value: probe });
  document.addEventListener("frogoe:finish", (e) => {
    const d = e && e.detail;
    const score = d && typeof d.score === "number" ? d.score : null;
    probe.finish.push({ at: Math.round(performance.now()), score });
  });
  let count = 0;
  let secStart = performance.now();
  const tick = () => {
    count++;
    const now = performance.now();
    if (now - secStart >= 1000) {
      probe.fps.push(count);
      count = 0;
      secStart = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

/** DOM + contract presence probe. */
export const DOM_PROBE_SCRIPT = `(() => {
  return {
    canvasPresent: Boolean(document.querySelector("#c")),
    hudPresent: Boolean(document.querySelector(".hud")),
    state: window.__frogoe?.state ?? "(missing)",
  };
})()`;

/** Painted check — center 50% sample; the top-left corner is empty on
 *  wide screens. */
export const CANVAS_PAINTED_SCRIPT = `(() => {
  const c = document.querySelector("#c");
  if (!c) return false;
  const g = c.getContext("2d");
  if (!g) return false;
  const px = Math.floor(c.width * 0.25), py = Math.floor(c.height * 0.25);
  const pw = Math.floor(c.width * 0.5), ph = Math.floor(c.height * 0.5);
  const s = g.getImageData(px, py, pw, ph).data;
  for (let i = 3; i < s.length; i += 4) { if (s[i] !== 0) return true; }
  return false;
})()`;

/** Cheap scene signature — the same center sample hashed to an int. */
export const CANVAS_HASH_SCRIPT = `(() => {
  const c = document.querySelector("#c");
  if (!c) return null;
  const g = c.getContext("2d");
  if (!g) return null;
  const cx = Math.floor(c.width * 0.25), cy = Math.floor(c.height * 0.25);
  const cw = Math.floor(c.width * 0.5), ch = Math.floor(c.height * 0.5);
  const d = g.getImageData(cx, cy, cw, ch).data;
  let hash = 0;
  for (let i = 0; i < d.length; i += 4) {
    hash = (hash * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0;
  }
  return hash;
})()`;

/** The contract state, with a "(missing)" sentinel for an absent
 *  contract (its own error finding). */
export const GAME_STATE_SCRIPT = `window.__frogoe?.state ?? "(missing)"`;

/** Finish events captured so far (copied out of the probe). */
export const FINISH_EVENTS_SCRIPT = `(() => {
  const p = window.__frogoeProbe;
  return p ? p.finish.slice() : [];
})()`;

/** How many one-second FPS buckets exist right now (a mark to read
 *  deltas from). */
export const FPS_MARK_SCRIPT = `window.__frogoeProbe ? window.__frogoeProbe.fps.length : 0`;

/** Buckets appended after a mark (unique placeholder — replaced
 *  everywhere, never evaluated as an identifier). */
export const FPS_SINCE_SCRIPT = `(() => {
  const p = window.__frogoeProbe;
  const mark = __MARK__;
  return p ? p.fps.slice(mark) : [];
})()`;

/** Replaces the mark placeholder with the concrete offset before
 *  evaluate. */
export const fpsSinceScript = (mark: number): string =>
  FPS_SINCE_SCRIPT.replaceAll("__MARK__", String(mark));

/** Outline + collapse measures over .hud text owners. */
export const HUD_MEASURE_SCRIPT = `(() => {
  const out = [];
  for (const el of document.querySelectorAll(".hud *")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!own) continue;
    const text = el.textContent ?? "";
    const s = getComputedStyle(el);
    const hasOutline =
      (s.webkitTextStroke && s.webkitTextStrokeWidth !== "0px") ||
      (s.textShadow && s.textShadow !== "none");
    const r = el.getBoundingClientRect();
    out.push({ hasOutline, height: r.height, label: text.trim().slice(0, 24), width: r.width });
  }
  return out;
})()`;

/** Retry affordance presence, independent of visibility. */
export const RETRY_PRESENCE_SCRIPT = `(() => ({
  gameover: Boolean(document.querySelector("[data-block-gameover]")),
  retry: Boolean(document.querySelector("[data-block-retry]")),
}))()`;
