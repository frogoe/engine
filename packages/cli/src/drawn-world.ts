/** drawn-world — the engine's coordinate measurement. The prototype
 *  patch (eyes-frame) records every draw call the REAL game makes on
 *  the REAL canvas; this PURE module turns that stream into entities:
 *  background filtered → spatial clusters → cross-frame tracking → a
 *  player hint. No fabrication — measurement of what was actually
 *  drawn, validated against game-declared live() by the oracle tests.
 *
 *  Pure module (the decisions.ts pattern): no browser, no fs — every
 *  threshold documented, every behavior unit-tested with trigger AND
 *  no-false-positive fixtures. */

export interface DrawRecord {
  /** absolute (post-transform) bounding box, CSS pixels */
  h: number;
  w: number;
  x: number;
  y: number;
  /** fillStyle at draw time ("" when none) */
  color: string;
}

export interface WorldEntity {
  /** centroid */
  x: number;
  y: number;
  /** bounding box size */
  w: number;
  h: number;
  /** dominant fill color of the cluster */
  color: string;
  /** per-frame motion vs the tracked predecessor (px/frame), 0 when new */
  dx: number;
  dy: number;
  /** consecutive frames the cluster has been tracked */
  age: number;
}

export interface WorldSnap {
  entities: WorldEntity[];
  /** index into entities — heuristic (smallest persistent cluster in the
   *  lower 2/3), a HINT, never a claim */
  playerHint: number | null;
}

/** records covering more than this share of the viewport are background */
export const BACKGROUND_SHARE = 0.5;
/** clusters whose bboxes come within this distance merge (single link).
 *  Sprite PARTS touch or overlap (<16px); separate game objects keep
 *  visual separation — a bird 17px from a pipe edge must not fuse into
 *  it (the flappy adjacency case, caught by the unit test). */
export const LINK_DIST = 16;
/** clusters smaller than this (px²) are specks, not entities */
export const MIN_AREA = 24;
/** tracking: a cluster continues a previous one within this centroid jump */
export const TRACK_DIST = 140;

interface Cluster extends WorldEntity {
  colors: Map<string, number>;
}

const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by);

const bboxGap = (a: Cluster, r: DrawRecord): number => {
  const ax0 = a.x - a.w / 2;
  const ax1 = a.x + a.w / 2;
  const bx0 = r.x - r.w / 2;
  const bx1 = r.x + r.w / 2;
  const gx = Math.max(0, Math.max(ax0 - bx1, bx0 - ax1));
  const gy = Math.max(
    0,
    Math.max(a.y - a.h / 2 - (r.y + r.h / 2), r.y - r.h / 2 - (a.y + a.h / 2)),
  );
  return Math.hypot(gx, gy);
};

const grow = (c: Cluster, r: DrawRecord): void => {
  const x0 = Math.min(c.x - c.w / 2, r.x - r.w / 2);
  const x1 = Math.max(c.x + c.w / 2, r.x + r.w / 2);
  const y0 = Math.min(c.y - c.h / 2, r.y - r.h / 2);
  const y1 = Math.max(c.y + c.h / 2, r.y + r.h / 2);
  c.x = (x0 + x1) / 2;
  c.y = (y0 + y1) / 2;
  c.w = x1 - x0;
  c.h = y1 - y0;
  const key = r.color || "(none)";
  c.colors.set(key, (c.colors.get(key) ?? 0) + 1);
};

const dominant = (colors: Map<string, number>): string => {
  let best = "";
  let n = -1;
  for (const [c, k] of colors) {
    if (k > n) {
      n = k;
      best = c;
    }
  }
  return best;
};

/** Frame N analysis: records → entities. prev carries the previous
 *  frame's entities for motion/age tracking (pass [] on the first). */
export const analyzeDraws = (
  records: DrawRecord[],
  prev: WorldEntity[],
  viewport: { h: number; w: number },
): WorldSnap => {
  const bgArea = viewport.w * viewport.h * BACKGROUND_SHARE;
  const usable = records.filter((r) => r.w * r.h < bgArea);

  const clusters: Cluster[] = [];
  for (const r of usable) {
    let target: Cluster | undefined;
    for (const c of clusters) {
      if (bboxGap(c, r) <= LINK_DIST) {
        target = c;
        break;
      }
    }
    if (target === undefined) {
      clusters.push({
        color: r.color || "(none)",
        colors: new Map([[r.color || "(none)", 1]]),
        dx: 0,
        dy: 0,
        age: 0,
        h: r.h,
        w: r.w,
        x: r.x,
        y: r.y,
      });
    } else {
      grow(target, r);
      target.color = dominant(target.colors);
    }
  }

  const entities: WorldEntity[] = clusters
    .filter((c) => c.w * c.h >= MIN_AREA)
    .map((c) => ({ age: 0, color: c.color, dx: 0, dy: 0, h: c.h, w: c.w, x: c.x, y: c.y }));

  // track against the previous frame: nearest centroid within TRACK_DIST
  for (const e of entities) {
    let best: WorldEntity | undefined;
    let bestD = TRACK_DIST;
    for (const p of prev) {
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best !== undefined) {
      e.dx = e.x - best.x;
      e.dy = e.y - best.y;
      e.age = best.age + 1;
    }
  }

  // player hint: smallest persistent cluster in the lower 2/3 — small
  // (the actor is rarely a full-column wall) and settled (age ≥ 2)
  let hint: number | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let i = 0; i < entities.length; i += 1) {
    const e = entities[i]!;
    if (e.age < 2) continue;
    if (e.y < viewport.h / 3) continue;
    if (e.w * e.h < bestArea) {
      bestArea = e.w * e.h;
      hint = i;
    }
  }

  return { entities, playerHint: hint };
};
