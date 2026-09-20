/** Recap analysis — pure session-forensics. Facts (did it start, die,
 *  retry, score) plus ANOMALY DETECTORS: machine-checkable bug signals
 *  over recorded evidence, so the AI that annotates a recap starts from
 *  measured irregularities instead of eyeballing raw frames.
 *
 *  Every detector is conservative by design: unknown games must never
 *  produce false positives — detectors no-op when their channel is
 *  absent (no live() → no geometry; no hazards → no overlap check), and
 *  thresholds sit outside legitimate gameplay ranges (documented per
 *  detector). Pure module: no browser, no fs — unit-tested here, the
 *  recap command renders it. */

export interface SessionRow {
  action?: Record<string, unknown>;
  error?: string;
  finishes?: Array<number | null>;
  frame?: string;
  gate?: string;
  live?: LiveSnap | null;
  meta?: { cols?: number; mode?: string; viewport?: { h: number; w: number } };
  plain?: string;
  reason?: string;
  score?: string | null;
  state?: string;
  t?: number;
}

export interface LiveSnap {
  entities?: Array<{ kind?: string; r?: number; x: number; y: number }>;
  player?: { r?: number; x: number; y: number } | null;
  [key: string]: unknown;
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

export interface Anomaly {
  code: string;
  detail: string;
  /** evidence frame index (0-based over frame rows) where it was seen */
  at: number;
}

// ── facts ────────────────────────────────────────────────────────────────────

export const analyzeFacts = (rows: SessionRow[]): Facts => {
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

export const verdictOf = (f: Facts, anomalies: number): string => {
  const suffix = anomalies > 0 ? ` · ${anomalies} anomal${anomalies === 1 ? "y" : "ies"}` : "";
  if (f.frames === 0) return "NO-EVIDENCE";
  if (!f.started)
    return `NO — the session never started (the ready gate was never passed)${suffix}`;
  if (f.actions === 0) return `UNKNOWN — no recorded actions (a passive agent?)${suffix}`;
  if (f.errors.length > 0) return `NO — ${f.errors.length} session error(s)${suffix}`;
  if (f.deaths === 0) return `YES (endured) — no death observed${suffix}`;
  return f.retriedAfterDeath
    ? `YES — started, played, died, and retried${suffix}`
    : `YES (single run) — died without an observed retry${suffix}`;
};

// ── helpers ──────────────────────────────────────────────────────────────────

interface FrameView {
  i: number;
  row: SessionRow;
  player?: { r?: number; x: number; y: number };
  t: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const hazardTouch = (
  player: { r?: number; x: number; y: number },
  e: { r?: number; x: number; y: number },
): boolean => dist(player, e) <= (e.r ?? 18) + (player.r ?? 10);

// ── detectors ────────────────────────────────────────────────────────────────

/** A player INSIDE a hazard for ≥2 consecutive frames with no death —
 *  collision that does not collide (the AABB class). Pass-through frames
 *  (single-frame contact) are legitimate at coarse sampling, hence the
 *  streak requirement. */
const overlapWithoutDeath = (frames: FrameView[]): Anomaly | null => {
  let streak = 0;
  let startAt = 0;
  for (const f of frames) {
    const hazards = (f.row.live?.entities ?? []).filter((e) => e.kind === "hazard");
    if (f.player !== undefined && hazards.some((h) => hazardTouch(f.player!, h))) {
      if (streak === 0) startAt = f.i;
      streak += 1;
      if (streak >= 2 && (f.row.finishes ?? []).length === 0 && f.row.state !== "over") {
        return {
          at: startAt,
          code: "hazard-overlap-no-death",
          detail: `player inside a hazard for ${streak} consecutive frames with no death (frames ${startAt}-${f.i})`,
        };
      }
    } else {
      streak = 0;
    }
  }
  return null;
};

/** Position teleports > 250px in one frame — physics inconsistency.
 *  Excused: gate transitions (a retry reload legitimately resets the
 *  world) and death frames. */
const teleport = (frames: FrameView[]): Anomaly[] => {
  const out: Anomaly[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1]!;
    const cur = frames[i]!;
    if (prev.player === undefined || cur.player === undefined) continue;
    if (prev.row.gate !== cur.row.gate) continue; // reload/start resets
    if (cur.row.state === "over" || (cur.row.finishes ?? []).length > 0) continue;
    const jump = dist(prev.player, cur.player);
    if (jump > 250) {
      out.push({
        at: cur.i,
        code: "position-teleport",
        detail: `player moved +${Math.round(jump)}px in one frame (no gate change, no death)`,
      });
    }
  }
  return out.slice(0, 3);
};

/** Player beyond the viewport (+40px sprite margin) — the misplaced-
 *  object class, detectable without knowing the game. */
const outOfBounds = (frames: FrameView[], viewport: { h: number; w: number }): Anomaly | null => {
  for (const f of frames) {
    if (f.player === undefined) continue;
    const { x, y } = f.player;
    if (x < -40 || x > viewport.w + 40 || y < -40 || y > viewport.h + 40) {
      return {
        at: f.i,
        code: "player-out-of-bounds",
        detail: `player at (${Math.round(x)},${Math.round(y)}) — outside the ${viewport.w}×${viewport.h} viewport`,
      };
    }
  }
  return null;
};

/** World frozen while "playing" despite live input — the stuck-state
 *  class. Requires: ≥4s unchanged player position AND score AND actions
 *  inside the window. */
const frozenDespiteInput = (frames: FrameView[], actionTimes: number[]): Anomaly | null => {
  if (frames.length < 2 || actionTimes.length === 0) return null;
  let anchorIdx = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const anchor = frames[anchorIdx]!;
    const cur = frames[i]!;
    if (cur.row.state !== "playing") {
      anchorIdx = i;
      continue;
    }
    const moved =
      anchor.player !== undefined && cur.player !== undefined
        ? dist(anchor.player, cur.player) > 2
        : false;
    const scored = anchor.row.score !== cur.row.score;
    if (moved || scored || cur.row.state !== anchor.row.state) {
      anchorIdx = i;
      continue;
    }
    const span = cur.t - anchor.t;
    if (span >= 4) {
      const acted = actionTimes.some((a) => a >= anchor.t && a <= cur.t);
      if (acted) {
        return {
          at: cur.i,
          code: "world-frozen-despite-input",
          detail: `state "playing", position and score unchanged for ${span.toFixed(1)}s while actions were sent`,
        };
      }
    }
  }
  return null;
};

/** Actions were sent the whole session and NOTHING ever moved — dead
 *  input wiring (stronger than a passive agent). */
const inputNeverLanded = (facts: Facts, frames: FrameView[]): Anomaly | null => {
  if (facts.actions < 3 || !facts.started) return null;
  const positions = frames
    .map((f) => f.player)
    .filter((p): p is NonNullable<FrameView["player"]> => p !== undefined);
  if (positions.length < 3) return null;
  const everMoved = positions.some((p, i) => i > 0 && dist(p, positions[i - 1]!) > 2);
  const scoresChanged = new Set(frames.map((f) => f.row.score ?? "")).size > 1;
  if (!everMoved && !scoresChanged) {
    return {
      at: 0,
      code: "input-never-landed",
      detail: `${facts.actions} actions, zero observable effect on positions or score`,
    };
  }
  return null;
};

/** Score going DOWN in a run — most arcade scores are monotonic; a
 *  regression usually means the wrong binding is displayed. */
const scoreRegression = (frames: FrameView[]): Anomaly | null => {
  let prev = -1;
  for (const f of frames) {
    // a death or a fresh ready gate legitimately restarts the run
    if ((f.row.finishes ?? []).length > 0 || f.row.gate === "ready") {
      prev = -1;
      continue;
    }
    const n = Number.parseInt(String(f.row.score ?? ""), 10);
    if (!Number.isFinite(n)) continue;
    if (prev >= 0 && n < prev) {
      return { at: f.i, code: "score-regression", detail: `score went ${prev} → ${n} mid-run` };
    }
    prev = n;
  }
  return null;
};

/** game-over observed but finish never fired — the results-card /
 *  finish wiring is out of sync with the contract. */
const overWithoutFinish = (rows: SessionRow[]): Anomaly | null => {
  const sawOver = rows.some((r) => r.state === "over" && r.plain !== undefined);
  const finishes = rows.reduce((n, r) => n + (r.finishes ?? []).length, 0);
  if (sawOver && finishes === 0) {
    return {
      at: 0,
      code: "game-over-without-finish",
      detail: 'state read "over" but finish() never fired',
    };
  }
  return null;
};

/** The same error ≥3 times — one clustered anomaly, not a wall of noise. */
const errorCluster = (errors: string[]): Anomaly | null => {
  const counts = new Map<string, number>();
  for (const e of errors) counts.set(e, (counts.get(e) ?? 0) + 1);
  for (const [msg, n] of counts) {
    if (n >= 3) {
      return { at: 0, code: "error-cluster", detail: `"${msg.slice(0, 60)}" ×${n}` };
    }
  }
  return null;
};

// ── the board ────────────────────────────────────────────────────────────────

export const detectAnomalies = (rows: SessionRow[]): Anomaly[] => {
  const meta = rows.find((r) => r.meta !== undefined)?.meta;
  const viewport = meta?.viewport ?? { h: 844, w: 390 };
  const frames: FrameView[] = rows
    .filter((r) => r.plain !== undefined)
    .map((row, i) => ({ i, player: row.live?.player ?? undefined, row, t: row.t ?? 0 }));
  const facts = analyzeFacts(rows);
  const actionTimes = rows.filter((r) => r.action !== undefined).map((r) => r.t ?? 0);
  const anomalies: Anomaly[] = [];
  const push = (a: Anomaly | Anomaly[] | null): void => {
    if (a === null) return;
    if (Array.isArray(a)) anomalies.push(...a);
    else anomalies.push(a);
  };
  push(overlapWithoutDeath(frames));
  push(teleport(frames));
  push(outOfBounds(frames, viewport));
  push(frozenDespiteInput(frames, actionTimes));
  push(inputNeverLanded(facts, frames));
  push(scoreRegression(frames));
  push(overWithoutFinish(rows));
  push(errorCluster(facts.errors));
  return anomalies;
};
