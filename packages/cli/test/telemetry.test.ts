import { describe, expect, test } from "bun:test";
/** Playtest telemetry — pure beacon→records transforms and the session
 *  store. No network, no page: the sampler side is covered by the
 *  server-integration test in cli.test.ts. */
import {
  beaconToRecords,
  dipSpans,
  summarizeRecords,
  type TelemetryRecord,
} from "../src/telemetry/records.ts";
import { createSessionStore, latestSessionFile } from "../src/telemetry/session.ts";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

describe("dipSpans", () => {
  test("marks consecutive below-floor buckets as one span with the worst fps", () => {
    expect(dipSpans([60, 18, 20, 17, 60, 60, 25, 60])).toEqual([
      { fps: 17, len: 3, start: 1 },
      { fps: 25, len: 1, start: 6 },
    ]);
  });
  test("zeros and emptiness are not dips", () => {
    expect(dipSpans([0, 0])).toEqual([]);
    expect(dipSpans([])).toEqual([]);
    expect(dipSpans([60, 59])).toEqual([]);
  });
});

describe("beaconToRecords", () => {
  const wall = new Date("2026-08-30T14:03:30").getTime();
  test("fps buckets become records; a dip prints once at its closing second", () => {
    const lines = beaconToRecords({ fps: [60, 18, 20, 60], up: 30 }, wall);
    const fps = lines.filter((l) => l.record.type === "fps" && l.text === "");
    expect(fps).toHaveLength(4);
    expect(fps[0]?.record.up).toBe(27); // reconstructed per-bucket uptime
    const prints = lines.filter((l) => l.text !== "");
    expect(prints).toHaveLength(1);
    expect(prints[0]?.text).toContain("fps 18 — dip 2s");
    expect(prints[0]?.text).toContain("14:03:2");
  });
  test("errors and visibility print with their own clock", () => {
    const lines = beaconToRecords(
      {
        events: [
          { msg: "TypeError: x is not a function", type: "error", up: 3 },
          { type: "hidden", up: 10 },
          { type: "visible", up: 22 },
        ],
        up: 25,
      },
      wall,
    );
    const texts = lines.filter((l) => l.text !== "").map((l) => l.text);
    expect(texts[0]).toContain("page error: TypeError");
    expect(texts[1]).toContain("phone hidden");
    expect(texts[2]).toContain("phone visible");
  });
});

describe("summarizeRecords", () => {
  const t0 = new Date("2026-08-30T14:03:00").getTime();
  const rec = (i: number, over: Partial<TelemetryRecord>): TelemetryRecord => ({
    time: `14:03:${String(i).padStart(2, "0")}`,
    type: "fps",
    up: i,
    wall: t0 + i * 1000,
    ...over,
  });
  test("tells the one-screen story", () => {
    const s = summarizeRecords([
      rec(1, { fps: 60 }),
      rec(5, { fps: 18 }),
      rec(6, { fps: 20 }),
      rec(7, { fps: 60 }),
      rec(60, { type: "error", msg: "boom" }),
      rec(120, { type: "hidden" }),
      rec(132, { type: "visible" }),
      rec(180, { fps: 60 }),
    ]);
    expect(s.buckets).toBe(5);
    expect(s.meanFps).toBe(44);
    expect(s.dips).toBe(1);
    expect(s.worst).toEqual({ fps: 18, len: 2, time: "14:03:06" });
    expect(s.errors).toBe(1);
    expect(s.hiddenS).toBe(12);
    expect(s.durationS).toBe(180);
  });
  test("a mid-session reload resets page uptime — duration and loads survive it", () => {
    // the exact field shape from the first real phone session: 20s of
    // buckets, reload, 15s more — report must span the WALL, not uptime
    const records: TelemetryRecord[] = [];
    for (let i = 1; i <= 20; i++) records.push(rec(i, { fps: 60 }));
    for (let i = 1; i <= 15; i++) records.push(rec(20 + i, { fps: 60, up: i }));
    const s = summarizeRecords(records);
    expect(s.pageLoads).toBe(2);
    expect(s.durationS).toBe(35);
    expect(s.buckets).toBe(35);
  });
  test("hidden across a reload still pairs by wall order", () => {
    const s = summarizeRecords([
      rec(10, { type: "hidden" }),
      rec(11, { fps: 60, up: 11 }), // rAF resumed — closes the span at 11s
      rec(1, { type: "visible", up: 1, wall: t0 + 12_000 }), // new page, up resets
    ]);
    expect(s.hiddenS).toBe(1);
    expect(s.pageLoads).toBe(2);
  });
  test("orphaned hidden (visible lost to a retry reload) closes at the next record", () => {
    // the exact shape from the first real phone session: hidden at 23.8,
    // visible lost, page reloads — first page-2 bucket is the resume
    const s = summarizeRecords([
      rec(20, { fps: 61 }),
      rec(23.8, { type: "hidden" }),
      rec(2, { fps: 61, up: 2, wall: t0 + 28_000 }),
    ]);
    expect(s.hiddenS).toBe(4); // 23.8s → 28s wall, not "rest of session"
    expect(s.pageLoads).toBe(2);
  });
  test("trailing hidden with no following record counts zero (duration unknown)", () => {
    const s = summarizeRecords([rec(10, { fps: 60 }), rec(20, { type: "hidden" })]);
    expect(s.hiddenS).toBe(0);
  });
  test("legacy records without wall still summarize (pre-wall sessions)", () => {
    const legacy = Array.from({ length: 20 }, (_, i) => ({
      fps: 60,
      time: "14:00:00",
      type: "fps" as const,
      up: i + 1,
    }));
    const s = summarizeRecords(legacy);
    expect(Number.isNaN(s.durationS)).toBeFalse();
    expect(s.buckets).toBe(20);
    expect(s.pageLoads).toBe(1);
  });
});

describe("session store", () => {
  const tmp = path.join(import.meta.dir, "../.tmp-telemetry");
  test("lazy file creation and jsonl appends; report finds the latest", () => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const store = createSessionStore(tmp, new Date("2026-08-30T14:00:00").getTime());
    expect(store.file()).toBeUndefined(); // empty session leaves no file
    store.write([{ fps: 60, time: "14:00:01", type: "fps", up: 1, wall: 1 }]);
    const file = store.file();
    if (!file) throw new Error("session file missing after first write");
    expect(file).toBeDefined();
    expect(existsSync(file ?? "")).toBeTrue();
    store.write([{ fps: 30, time: "14:00:02", type: "fps", up: 2, wall: 2 }]);
    const lines = readFileSync(file ?? "", "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
    const parsed = lines.map((line) => JSON.parse(line) as { fps?: number });
    expect(parsed[1]?.fps).toBe(30);
    expect(latestSessionFile(tmp)).toBe(file);
    expect(latestSessionFile(path.join(tmp, "nope"))).toBeNull();
    rmSync(tmp, { recursive: true, force: true });
  });
});
