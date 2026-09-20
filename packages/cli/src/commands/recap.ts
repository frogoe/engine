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

interface SessionRow {
  action?: Record<string, unknown>;
  error?: string;
  finishes?: Array<number | null>;
  gate?: string;
  live?: unknown;
  plain?: string;
  reason?: string;
  score?: string | null;
  state?: string;
  t?: number;
}

export interface Facts {
  actions: number;
  deaths: number;
  errors: string[];
  frames: number;
  gameSecs: number;
  liveChannel: boolean;
  retriedAfterDeath: boolean;
  scoreTrail: string[];
  started: boolean;
}

export const analyzeSession = (rows: SessionRow[]): Facts => {
  const frames = rows.filter((r) => r.plain !== undefined);
  const actions = rows.filter((r) => r.action !== undefined);
  const errors = rows.filter((r) => r.error !== undefined).map((r) => String(r.error));
  let deaths = 0;
  for (const f of frames) deaths += (f.finishes ?? []).length;
  const started = frames.some((f) => f.gate === "run") || frames.some((f) => f.state === "playing");
  let sawDeath = false;
  let retried = false;
  const scores: string[] = [];
  for (const f of frames) {
    if ((f.finishes ?? []).length > 0) sawDeath = true;
    if (sawDeath && f.gate === "ready") {
      retried = true;
      sawDeath = false;
    }
    const s = f.score ?? null;
    if (s !== null && s !== "" && scores[scores.length - 1] !== s) scores.push(s);
  }
  const times = frames.map((f) => f.t ?? 0);
  return {
    actions: actions.length,
    deaths,
    errors,
    frames: frames.length,
    gameSecs: times.length > 0 ? Math.round((times[times.length - 1] ?? 0) * 10) / 10 : 0,
    liveChannel: frames.some((f) => f.live !== null && f.live !== undefined),
    retriedAfterDeath: retried,
    scoreTrail: scores.length > 0 ? scores.slice(0, 12) : [],
    started,
  };
};

export const verdictOf = (f: Facts): string => {
  if (f.frames === 0) return "NO-EVIDENCE";
  if (!f.started) return "TIDAK — sesi tak pernah mulai (ready gate tak terlewati)";
  if (f.actions === 0) return "UNKNOWN — tak ada aksi tercatat (agent pasif?)";
  if (f.errors.length > 0) return `TIDAK — ${f.errors.length} error sesi`;
  if (f.deaths === 0) return "YA (hidup terus) — tak ada kematian teramati";
  return f.retriedAfterDeath
    ? "YA — mulai, bermain, mati, dan mencoba lagi"
    : "YA (sekali jalan) — mati tanpa retry teramati";
};

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
    const facts = analyzeSession(rows);
    const mark = (b: boolean) => (b ? "✓" : "✗");
    console.log(`# rekap sesi — ${name}`);
    console.log(`- mulai: ${mark(facts.started)}  ·  aksi tercatat: ${facts.actions}`);
    console.log(
      `- kematian: ${facts.deaths}  ·  retry setelah mati: ${mark(facts.retriedAfterDeath)}`,
    );
    console.log(
      `- skor: ${facts.scoreTrail.length > 0 ? facts.scoreTrail.join(" → ") : "(tak teramati)"}`,
    );
    console.log(
      `- kanal mata: ASCII ✓  ·  koordinat live(): ${facts.liveChannel ? "✓" : "— (game tanpa live())"}`,
    );
    console.log(
      `- ${facts.frames} frame · ${facts.gameSecs}s waktu-game · error: ${facts.errors.length}`,
    );
    for (const e of facts.errors.slice(0, 3)) console.log(`    · ${e.slice(0, 100)}`);
    console.log(`\nverdict: ${verdictOf(facts)}`);
    console.log("\n(anotasi AI: sebut anomali/keanehan di atas verdict — lalu jadikan test)");
  },
  meta: {
    description: "session evidence → machine facts + verdict skeleton (the AI annotates anomalies)",
  },
});
