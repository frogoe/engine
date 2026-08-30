/** Session persistence — one jsonl file per `frogoe run --telemetry`
 *  session, under the game's .frogoe/sessions/ (tool-owned, gitignored).
 *  Nothing ever leaves the machine. */
import { appendFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import type { TelemetryRecord } from "./records.ts";

export interface SessionStore {
  /** session file path once the first record landed (lazy — empty
   *  sessions leave no file) */
  file: () => string | undefined;
  write: (records: TelemetryRecord[]) => void;
}

const pad = (n: number): string => String(n).padStart(2, "0");

const sessionStamp = (wall: number): string => {
  const d = new Date(wall);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

export const createSessionStore = (gameDir: string, startedWall: number): SessionStore => {
  const dir = path.join(gameDir, ".frogoe", "sessions");
  let file: string | undefined;
  return {
    file: () => file,
    write: (records) => {
      if (records.length === 0) return;
      if (!file) {
        mkdirSync(dir, { recursive: true });
        file = path.join(dir, `${sessionStamp(startedWall)}.jsonl`);
      }
      appendFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
    },
  };
};

/** newest session file for `frogoe report`, or null when none exist */
export const latestSessionFile = (gameDir: string): string | null => {
  const dir = path.join(gameDir, ".frogoe", "sessions");
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort();
    return files.length > 0 ? path.join(dir, files[files.length - 1] ?? "") : null;
  } catch {
    return null;
  }
};
