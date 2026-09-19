/** agent-player — a reactive policy that READS frogoe play's ASCII frames
 *  and drives the game: the demo that an AI can genuinely play. Two
 *  screens: the real Chrome window (--headed) shows the game; this
 *  terminal shows what the agent SEES (the ground strip) and DECIDES.
 *
 *  Usage: bun scripts/agent-player.mjs <gameDir> [--headed] [--secs 60]
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const repo = new URL("..", import.meta.url).pathname;
const gameDir = process.argv[2] ?? "examples/sawstorm";
const headed = process.argv.includes("--headed");
const secs = Number(process.argv.find((_, i, a) => a[i - 1] === "--secs") ?? 60);

const proc = spawn(
  "bun",
  [
    `${repo}packages/cli/src/cli.ts`,
    "play",
    gameDir,
    "--cols",
    "60",
    "--mode",
    "realtime", // the world runs continuously — watchable, not frozen
    ...(headed ? ["--headed"] : []),
    "--record",
    "agent-session",
  ],
  // stderr MUST be inherited: the dev server's banner would fill the
  // pipe buffer and deadlock the child (the bug that hung this demo)
  { env: { ...process.env, NO_COLOR: "1" }, stdio: ["pipe", "pipe", "inherit"] },
);

const send = (cmd) => proc.stdin.write(`${JSON.stringify(cmd)}\n`);
let started = false;
let lastDecision = 0;

const decide = (msg) => {
  const lines = msg.frame.split("\n");
  const cut = Math.floor(lines.length * 0.8);
  const bottom = lines.slice(cut); // actor lane
  // saw zone: the approach field EXCLUDING the actor's own lane — the
  // actor carries accent pixels that read as X
  const field = lines.slice(Math.floor(lines.length * 0.55), cut);
  const t = msg.t ?? 0;

  if (!started) {
    if (msg.state === "paused" || msg.state === "playing") {
      started = true;
      send({ tap: [195, 435] }); // start: ON the PLAY button (the gate ignores taps above it)
    }
    return;
  }

  // the actor: the widest contiguous non-'.' cluster in the bottom lane
  let playerCol = null;
  for (const row of bottom) {
    let run = 0;
    for (let c = 0; c <= row.length; c += 1) {
      if (c < row.length && row[c] !== ".") {
        run += 1;
      } else if (run > 0) {
        if (run >= 4 && run <= 16) {
          playerCol = Math.floor(c - run / 2);
          break;
        }
        run = 0;
      }
    }
    if (playerCol !== null) break;
  }
  if (playerCol === null) return;

  // a saw is a CONTIGUOUS X run (the disc is wide; the actor's own accent
  // flecks are scattered singles) — airborne self-detection dies here
  let nearest = null;
  let dist = 999;
  for (const row of field) {
    let run = 0;
    for (let c = 0; c <= row.length; c += 1) {
      if (c < row.length && row[c] === "X") {
        run += 1;
      } else {
        if (run >= 1) {
          const center = Math.floor(c - run / 2);
          const d = Math.abs(center - playerCol);
          if (d < dist) {
            dist = d;
            nearest = center;
          }
        }
        run = 0;
      }
    }
  }

  if (nearest === null) {
    if (t - lastDecision > 0.5) {
      lastDecision = t;
      send({ step: 12 }); // heartbeat: a frame stream even when idle
    }
    return;
  }
  if (dist < 8 && t - lastDecision > 0.6) {
    lastDecision = t;
    send({ tap: [195, 400] }); // jump clears saws
    log("JUMP", `saw at +${dist}`, field);
  } else if (dist < 20 && t - lastDecision > 0.4) {
    const away = nearest < playerCol ? "ArrowRight" : "ArrowLeft";
    send({ hold: [away, 22] });
    lastDecision = t;
    log(`STEER ${away === "ArrowLeft" ? "←" : "→"}`, `saw at +${dist}`, field);
  }
};

const log = (action, why, ground) => {
  const strip = ground.map((r) => r.slice(0, 96)).join("\n");
  process.stdout.write(`\x1b[2J\x1b[H${action}  (${why})\n${strip}\n`);
};

const rl = createInterface({ input: proc.stdout });
rl.on("line", (raw) => {
  if (raw.trim().length === 0) return;
  try {
    const msg = JSON.parse(raw);
    if (msg.frame !== undefined) decide(msg);
  } catch {
    /* banners */
  }
});

setTimeout(() => {
  send({ quit: true });
}, secs * 1000);
proc.on("exit", (code) => {
  console.log(`\nagent session over (exit ${code}) — evidence: snapshots/agent-session.jsonl`);
  process.exit(0);
});
