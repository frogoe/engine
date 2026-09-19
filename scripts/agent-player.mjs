/** agent-player — a reactive policy that READS frogoe play's frames and
 *  drives the game: the demo that an AI can genuinely play. Two screens:
 *  the real Chrome window (--headed) shows the game; this terminal shows
 *  what the agent SEES and DECIDES.
 *
 *  Architecture lesson paid for in front of human eyes: the state machine
 *  runs on GROUND TRUTH (gate/score/state — DOM facts delivered as data),
 *  and the canvas map is used only for what it is actually for — spatial
 *  play (where the saws are). Canvas heuristics about DOM furniture lied:
 *  the title was never IN the canvas; screenshot pixels made it look so.
 *
 *  Usage: bun scripts/agent-player.mjs <gameDir> [--headed] [--secs 90]
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const repo = new URL("..", import.meta.url).pathname;
const gameDir = process.argv[2] ?? "examples/sawstorm";
const headed = process.argv.includes("--headed");
const secs = Number(process.argv.find((_, i, a) => a[i - 1] === "--secs") ?? 90);

const proc = spawn(
  "bun",
  [
    `${repo}packages/cli/src/cli.ts`,
    "play",
    gameDir,
    "--cols",
    "60",
    "--mode",
    "realtime",
    ...(headed ? ["--headed"] : []),
    "--record",
    "agent-session",
  ],
  // stderr inherited: the dev-server banner would fill a never-read pipe
  { env: { ...process.env, NO_COLOR: "1" }, stdio: ["pipe", "pipe", "inherit"] },
);

const send = (cmd) => proc.stdin.write(`${JSON.stringify(cmd)}\n`);
let phase = "boot";
let runs = 0;
let lastAct = 0; // framesSeen at the last action (frame cadence, not game
let framesSeen = 0; // time — t only advances when commands flow)

const show = (action, why, strip) => {
  process.stdout.write(`\x1b[2J\x1b[H${action}  (${why})  runs:${runs}\n${strip}\n`);
};

const groundTruth = (msg) => {
  // death is a loop: retry → reload drops us back to the ready gate
  if (msg.state === "over") {
    if (phase !== "over") {
      phase = "over";
      show("DIED", `score ${msg.score ?? "?"} — retrying`, "");
    }
    if (framesSeen - lastAct > 3) {
      lastAct = framesSeen;
      send({ click: "[data-block-retry]" }); // by name, not by pixels
    }
    return null;
  }
  if (msg.gate === "ready") {
    if (phase !== "ready") phase = "ready";
    if (framesSeen - lastAct > 3) {
      lastAct = framesSeen;
      send({ click: "[data-block-play]" });
    }
    return null;
  }
  if (phase !== "running") {
    phase = "running";
    runs += 1;
  }
  return msg.frame.split("\n");
};

const spatial = (lines, msg) => {
  // the actor: the widest mid-size glyph cluster in the bottom lane
  const lane = lines.slice(Math.floor(lines.length * 0.78));
  let playerCol = null;
  for (const row of lane) {
    let run = 0;
    for (let c = 0; c <= row.length; c += 1) {
      if (c < row.length && row[c] !== ".") run += 1;
      else if (run >= 3 && run <= 14) {
        playerCol = Math.floor(c - run / 2);
        break;
      } else run = 0;
    }
    if (playerCol !== null) break;
  }
  if (playerCol === null) return;

  // saws: only LOW ones — the jump apex (~154px) can only clear a saw
  // whose center sits near the ground band; airborne bouncers are
  // unjumpable and attacking them is how eight runs died at score 0
  const cut = Math.floor(lines.length * 0.68);
  let nearest = null;
  let dist = 999;
  for (let i = cut; i < lines.length; i += 1) {
    const row = lines[i];
    let run = 0;
    for (let c = 0; c <= row.length; c += 1) {
      if (c < row.length && row[c] === "X") run += 1;
      else {
        if (run >= 1) {
          const center = Math.floor(c - run / 2);
          const d = Math.abs(center - playerCol);
          if (d > 5 && d < dist) {
            dist = d;
            nearest = center;
          }
        }
        run = 0;
      }
    }
  }
  const field = lines.slice(cut);
  if (nearest === null) return;

  // THE CLEARER: sawstorm scores when the actor crosses a saw's column
  // while airborne. Avoiding saws forever scores nothing (12 deaths at
  // score 0 was the honest evidence). Strike whenever a saw is in
  // range — sparse cooldowns starve the timing (the forensic probe
  // that scored attacked every single frame).
  const toward = nearest < playerCol ? "ArrowLeft" : "ArrowRight";
  if (framesSeen - lastAct > 2) {
    lastAct = framesSeen;
    send({ press: "Space" }); // THE jump: key edges, not taps
    send({ hold: [toward, 16] }); // carry over the saw
    show(
      `STRIKE ${toward === "ArrowLeft" ? "←" : "→"}+JUMP`,
      `saw +${dist} · score ${msg.score ?? 0}`,
      field.join("\n").slice(-400),
    );
  }
};

const rl = createInterface({ input: proc.stdout });
rl.on("line", (raw) => {
  if (raw.trim().length === 0) return;
  try {
    const msg = JSON.parse(raw);
    if (msg.frame === undefined) return;
    framesSeen += 1;
    const lines = groundTruth(msg);
    if (lines !== null) spatial(lines, msg);
  } catch {
    /* banners */
  }
});

setTimeout(() => {
  send({ quit: true });
}, secs * 1000);
proc.on("exit", (code) => {
  console.log(
    `\nagent session over (exit ${code}) — runs:${runs} — evidence: snapshots/agent-session.jsonl`,
  );
  process.exit(0);
});
