/** Session verifier — machine-checked, no eyeballs. A GOOD session:
 *  frames never gap > 5s, and at least N full cycles complete
 *  (title → run → death → title again). Exit 1 otherwise. */
import { readFileSync } from "node:fs";

const file = process.argv[2];
const minCycles = Number(process.argv[3] ?? 2);
const rows = readFileSync(file, "utf-8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));
const frames = rows.filter((r) => r.plain);
const title = (r) => r.plain.split("\n").some((line) => /X{8,}/u.test(line));
const errs = rows.filter((r) => r.error);

let cycles = 0;
let phase = "start";
for (const f of frames) {
  const t = title(f);
  if (phase !== "run" && !t && f.state === "playing") phase = "run";
  if (phase === "run" && f.state === "over") phase = "died";
  if (phase === "died" && t) {
    cycles += 1;
    phase = "start";
  }
}
const gaps = [];
for (let i = 1; i < frames.length; i += 1) {
  gaps.push(frames[i].t - frames[i - 1].t);
}
const maxGap = Math.max(0, ...gaps);
const scored = frames.some((f) => f.score && f.score !== "0");
const ok = cycles >= minCycles && maxGap < 5 && errs.length === 0 && scored;
console.log(
  `frames:${frames.length} cycles:${cycles} scored:${scored} maxGap:${maxGap.toFixed(1)}s errors:${errs.length} → ${ok ? "PASS" : "FAIL"}`,
);
process.exit(ok ? 0 : 1);
