/** frogoe recap — the expedition's product. A play session's recorded
 *  evidence (snapshots/<name>.jsonl) becomes FACTS: did it start, did
 *  input land, deaths and retry cycles, the score trajectory, errors,
 *  which eye channels the game offered. The machine skeleton ends with
 *  a verdict line; an AI that played (or reads) the session annotates
 *  the anomalies above it — recap is the AUTHOR'S input, never a gate:
 *  anomalies get fixed and become tests (the month's pattern). */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { defineCommand } from "citty";

import { analyzeFacts, detectAnomalies, verdictOf, type SessionRow } from "../recap-analysis.ts";

const latestSession = (dir: string): string | null => {
  const snapDir = path.join(dir, "snapshots");
  if (!existsSync(snapDir)) return null;
  const files = readdirSync(snapDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, m: statSync(path.join(snapDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files[0]?.f ?? null;
};

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    session: {
      type: "string",
      description: "session name (snapshots/<name>.jsonl; default: latest)",
    },
  },
  async run({ args }) {
    const dir = args.dir ? path.resolve(String(args.dir)) : process.cwd();
    const name =
      typeof args.session === "string"
        ? args.session.endsWith(".jsonl")
          ? args.session
          : `${args.session}.jsonl`
        : latestSession(dir);
    if (name === null) {
      console.log("frogoe recap: no sessions — run `frogoe play --record <name>` first");
      process.exitCode = 1;
      return;
    }
    const file = path.join(dir, "snapshots", name);
    if (!existsSync(file)) {
      console.log(`frogoe recap: ${path.join("snapshots", name)} not found`);
      process.exitCode = 1;
      return;
    }
    const rows = readFileSync(file, "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as SessionRow);
    const facts = analyzeFacts(rows);
    const anomalies = detectAnomalies(rows);
    const mark = (b: boolean) => (b ? "✓" : "✗");
    console.log(`# session recap — ${name}`);
    console.log(`- started: ${mark(facts.started)}  ·  recorded actions: ${facts.actions}`);
    console.log(
      `- deaths: ${facts.deaths}  ·  retried after death: ${mark(facts.retriedAfterDeath)}`,
    );
    console.log(
      `- score: ${facts.scoreTrail.length > 0 ? facts.scoreTrail.join(" → ") : "(none observed)"}`,
    );
    console.log(
      `- eye channels: ASCII ✓  ·  live() coordinates: ${facts.liveChannel ? "✓" : "— (game without live())"}`,
    );
    console.log(
      `- ${facts.frames} frames · ${facts.gameSecs}s game-time · errors: ${facts.errors.length}`,
    );
    for (const e of facts.errors.slice(0, 3)) console.log(`    · ${e.slice(0, 100)}`);
    if (anomalies.length > 0) {
      console.log(`\nmachine anomalies (${anomalies.length}):`);
      for (const a of anomalies) console.log(`  ⚠ ${a.code} @frame ${a.at} — ${a.detail}`);
    } else {
      console.log("\nmachine anomalies: none detected");
    }
    console.log(`\nverdict: ${verdictOf(facts, anomalies.length)}`);
    console.log(
      "\n(AI annotation: examine each anomaly above, add the ones machines cannot see — then make them tests)",
    );
  },
  meta: {
    description: "session evidence → machine facts + verdict skeleton (the AI annotates anomalies)",
  },
});
