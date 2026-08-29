/** Live sandbox types — the shape shared by decisions, phases, and the
 *  driver seam. Findings stay lint-compatible (they merge into the same
 *  report); `phase` adds where in the lifecycle a finding was observed. */
import type { Finding, Severity } from "@frogoe/lint";

export type LivePhase = "boot" | "play" | "end" | "retry" | "stability";

export type LiveFinding = Finding & { phase: LivePhase };

export type Playability = "pass" | "fail" | "no-input";

export interface FinishEvent {
  at: number;
  score: number | null;
}

export interface LifecycleMetrics {
  ends: boolean;
  retryReloads: number;
}

export interface LiveMetrics {
  desktopFps?: number;
  lifecycle: LifecycleMetrics;
  mobileFps?: number;
  playability: Playability;
}

export interface LiveResult {
  findings: LiveFinding[];
  metrics: LiveMetrics;
  screenshots: string[];
}

export interface LiveOptions {
  dir: string;
  settleMs?: number;
}

export interface OutlineMeasure {
  hasOutline: boolean;
  label: string;
}

export interface CollapseMeasure {
  height: number;
  label: string;
  width: number;
}

/** Everything the pure decision functions may need to shape a finding. */
export type Shape = {
  code: string;
  file: string;
  fix: string;
  message: string;
  phase: LivePhase;
  recipe?: string;
  severity: Severity;
};

export const finding = (shape: Shape): LiveFinding => shape;
