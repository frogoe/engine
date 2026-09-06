/** The relay — the game-side half of the frogoe-card protocol. Injected
 *  by `frogoe embed` right before </body> of the bundled artifact, it
 *  translates the contract's own surfaces (window.__frogoe, the
 *  frogoe:finish event) into card messages. Race-repair comes from the
 *  hyperframes bridge: it posts "loading" the moment it installs, so a
 *  host that booted before the listener existed still learns the frame
 *  is alive; the poll (200 ms) then reports only CHANGES —
 *  "paused" is a transient contract state and maps to running (the
 *  game is alive), and a finished run without a captured score reports
 *  0, exactly like the contract's `Number(score) || 0`. */
import { CARD_PROTOCOL_VERSION, CARD_SOURCE_TAG, parseHostControl } from "./protocol.ts";

export const RELAY_SCRIPT = `<script>
(function () {
  // the pure protocol validator, injected as source — the tested code IS
  // the shipped code (same pattern as the raster/vision analyzers)
  var parseHostControl = ${parseHostControl.toString()};
  var post = function (payload) {
    try {
      window.parent.postMessage(
        Object.assign({ source: "${CARD_SOURCE_TAG}", v: ${String(CARD_PROTOCOL_VERSION)} }, payload),
        "*"
      );
    } catch (e) { /* parent gone — sandbox lifecycle, not a crash */ }
  };
  var score = 0;
  var last = "";
  var map = function (state) {
    if (state === "over") return "over";
    if (state === "playing" || state === "paused") return "running";
    return "loading";
  };
  var emit = function (card) {
    if (card === last) return;
    last = card;
    if (card === "over") post({ type: "state", state: "over", score: score });
    else post({ type: "state", state: card });
  };
  // The embed context mark: this relay exists ONLY inside embed cards,
  // so the class is the truthful "you are embedded" signal — games use
  // it to surface touch controls (iframes cannot rely on keyboards).
  try { document.documentElement.classList.add("frogoe-embed"); } catch (e) {}
  document.addEventListener("frogoe:finish", function (event) {
    var detail = event && event.detail;
    score = detail && typeof detail.score === "number" && isFinite(detail.score)
      ? detail.score
      : 0;
    emit("over");
  });
  window.addEventListener("error", function () {
    post({ type: "error" });
  });

  // host → game control (play/pause/mute parity): validated by version,
  // source tag AND frame identity (event.source must be the parent) —
  // the relay only ever calls the contract's own handle, never game code
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var control = parseHostControl(event.data);
    if (!control) return;
    try {
      var api = window.__frogoe;
      if (!api) return;
      if (control.action === "pause" && typeof api.pause === "function") api.pause();
      if (control.action === "resume" && typeof api.resume === "function") api.resume();
      if (control.action === "mute" && typeof api.mute === "function") api.mute(control.muted);
    } catch (e) { /* control is best-effort — never kills the game */ }
  });
  emit("loading"); // alive-signal: the host may have booted before us
  setInterval(function () {
    var api = window.__frogoe;
    if (!api || typeof api.state !== "string") return;
    emit(map(api.state));
  }, 200);
})();
</script>`;
