/** Playtest telemetry — pure transforms. The page sampler beacons fps
 *  buckets + lifecycle events to the dev server; these functions turn a
 *  beacon into report records and printable lines. Wall-clock per record
 *  is reconstructed from the beacon arrival time and per-record uptime
 *  (± the beacon interval — honest precision, cheap transport). */

export interface TelemetryEvent {
  msg?: string;
  type: string;
  up: number;
}

export interface BeaconPayload {
  /** fps per one-second buckets since the previous beacon */
  fps?: number[];
  /** usedJSHeapSize in MB when the platform exposes it (Chrome only) */
  mem?: number;
  /** page uptime in seconds at beacon time */
  up: number;
  /** errors / rejections / visibility transitions since previous beacon */
  events?: TelemetryEvent[];
}

/** the floor a bucket must not fall below during play (matches the
 *  live sandbox FPS_FLOOR — one number, quoted everywhere) */
export const FPS_FLOOR = 30;

export interface TelemetryRecord {
  fps?: number;
  msg?: string;
  /** HH:MM:SS local — when this happened, wall clock */
  time: string;
  type: "error" | "fps" | "hidden" | "rejection" | "session" | "visible";
  /** page uptime in seconds at the record (resets on reload) */
  up: number;
  /** epoch ms — survives reloads, spans the whole session (legacy
   *  sessions predate this field) */
  wall?: number;
}

export interface PrintableLine {
  record: TelemetryRecord;
  text: string;
}

export const formatClock = (wall: number): string => {
  const d = new Date(wall);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** consecutive buckets below the floor, for the report's dip summary */
export const dipSpans = (buckets: number[]): Array<{ fps: number; len: number; start: number }> => {
  const spans: Array<{ fps: number; len: number; start: number }> = [];
  let start = -1;
  let worst = 0;
  for (let i = 0; i <= buckets.length; i++) {
    const low = i < buckets.length && (buckets[i] ?? 0) > 0 && (buckets[i] ?? 0) < FPS_FLOOR;
    if (low && start === -1) {
      start = i;
      worst = buckets[i] ?? 0;
    } else if (low) {
      worst = Math.min(worst, buckets[i] ?? 0);
    } else if (start !== -1) {
      spans.push({ fps: worst, len: i - start, start });
      start = -1;
    }
  }
  return spans;
};

/** Beacon → records (+ printable lines for the terminal). Pure: given the
 *  payload and the server wall-clock at arrival, reconstruct per-record
 *  times and decide what the operator sees live. */
export const beaconToRecords = (payload: BeaconPayload, arrivalWall: number): PrintableLine[] => {
  const out: PrintableLine[] = [];
  const arrivalUp = payload.up;
  const wallAt = (up: number): number => arrivalWall - Math.max(0, arrivalUp - up) * 1000;

  const buckets = payload.fps ?? [];
  const spans = dipSpans(buckets);
  const spanEnd = new Map(spans.map((s) => [s.start + s.len - 1, s]));
  for (let i = 0; i < buckets.length; i++) {
    const fps = buckets[i] ?? 0;
    const up = Math.max(0, arrivalUp - (buckets.length - 1 - i));
    const wall = wallAt(up);
    const time = formatClock(wall);
    out.push({
      record: { fps, time, type: "fps", up, wall },
      text: "",
    });
    const span = spanEnd.get(i);
    if (span) {
      // report the span once, at its closing second
      out.push({
        record: { fps: span.fps, time, type: "fps", up, wall },
        text: `⚠ ${time}  fps ${span.fps} — dip ${span.len}s`,
      });
    }
  }
  for (const event of payload.events ?? []) {
    const wall = wallAt(event.up);
    const time = formatClock(wall);
    const type =
      event.type === "error" ||
      event.type === "rejection" ||
      event.type === "hidden" ||
      event.type === "visible"
        ? event.type
        : "error";
    const msg = (event.msg ?? "").slice(0, 160);
    const text =
      type === "hidden"
        ? `· ${time}  phone hidden`
        : type === "visible"
          ? `· ${time}  phone visible`
          : `✖ ${time}  ${type === "rejection" ? "unhandled rejection" : "page error"}: ${msg}`;
    out.push({ record: { msg, time, type, up: event.up, wall }, text });
  }
  return out;
};

export interface SessionSummary {
  buckets: number;
  dips: number;
  /** wall-clock span of the whole session — survives reloads */
  durationS: number;
  errors: number;
  hiddenS: number;
  meanFps: number | undefined;
  /** page loads in the session (a reload resets page uptime; we count) */
  pageLoads: number;
  worst: { fps: number; len: number; time: string } | undefined;
}

/** jsonl records → the one-screen session story. Pure. Wall-clock based:
 *  page uptime resets on reload, the epoch does not. Legacy records
 *  (pre-wall sessions) fall back to page-uptime semantics. */
export const summarizeRecords = (records: TelemetryRecord[]): SessionSummary => {
  const fps = records.filter((r) => r.type === "fps" && typeof r.fps === "number");
  const buckets = fps.map((r) => r.fps ?? 0).filter((n) => n > 0);
  const spans = dipSpans(buckets);
  // hidden periods pair by wall order (a reload between hidden/visible
  // must not orphan the pair); legacy records pair by uptime instead.
  // An orphaned hidden (visible event lost to a retry reload before the
  // beacon flushed) closes at the NEXT record — rAF-based records only
  // exist while the page is visible, so that is a resume signal.
  const orderKey = (r: TelemetryRecord): number =>
    typeof r.wall === "number" ? r.wall : r.up * 1000;
  let hiddenS = 0;
  let pendingHidden: number | undefined;
  for (const r of records) {
    if (pendingHidden !== undefined) {
      hiddenS += Math.max(0, orderKey(r) - pendingHidden) / 1000;
      pendingHidden = undefined;
    }
    if (r.type === "hidden") {
      pendingHidden = orderKey(r);
    }
  }
  const worstSpan = spans.reduce<{ fps: number; len: number; start: number } | undefined>(
    (acc, s) => (acc === undefined || s.len > acc.len ? s : acc),
    undefined,
  );
  const worst = worstSpan
    ? {
        fps: worstSpan.fps,
        len: worstSpan.len,
        time: fps[worstSpan.start + worstSpan.len - 1]?.time ?? "?",
      }
    : undefined;
  // a page load boundary = page uptime jumping backwards mid-session
  let pageLoads = records.length > 0 ? 1 : 0;
  let prevUp = -1;
  for (const r of records) {
    if (prevUp !== -1 && r.up + 2 < prevUp) pageLoads += 1;
    prevUp = r.up;
  }
  const first = records[0];
  const last = records[records.length - 1];
  const durationS =
    first && last && typeof first.wall === "number" && typeof last.wall === "number"
      ? // +1s: the first bucket already covers one second of play
        Math.round((last.wall - first.wall + 1000) / 1000)
      : Math.round(last?.up ?? 0);
  return {
    buckets: buckets.length,
    dips: spans.length,
    durationS,
    errors: records.filter((r) => r.type === "error" || r.type === "rejection").length,
    hiddenS: Math.round(hiddenS),
    meanFps:
      buckets.length > 0
        ? Math.round(buckets.reduce((a, b) => a + b, 0) / buckets.length)
        : undefined,
    pageLoads,
    worst,
  };
};
