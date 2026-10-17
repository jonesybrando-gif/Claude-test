export type PacingStatus =
  | "UNDERSPENDING"
  | "SLIGHTLY_UNDER"
  | "ON_TARGET"
  | "SLIGHTLY_OVER"
  | "OVERSPENDING"
  | "NOT_STARTED"
  | "NO_BUDGET";

/**
 * Pacing thresholds, as pacing percentages (actual ÷ expected × 100).
 *   pacing <  under            → UNDERSPENDING
 *   under ≤ pacing < slightlyUnder → SLIGHTLY_UNDER
 *   slightlyUnder ≤ pacing ≤ slightlyOver → ON_TARGET
 *   slightlyOver < pacing ≤ over → SLIGHTLY_OVER
 *   pacing > over              → OVERSPENDING
 */
export interface PacingThresholds {
  under: number;
  slightlyUnder: number;
  slightlyOver: number;
  over: number;
}

export const DEFAULT_THRESHOLDS: PacingThresholds = {
  under: 85,
  slightlyUnder: 95,
  slightlyOver: 105,
  over: 115,
};

export function validateThresholds(t: PacingThresholds): void {
  const vals = [t.under, t.slightlyUnder, t.slightlyOver, t.over];
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) throw new Error("Thresholds must be non-negative numbers");
  if (!(t.under <= t.slightlyUnder && t.slightlyUnder <= 100 && 100 <= t.slightlyOver && t.slightlyOver <= t.over)) {
    throw new Error("Thresholds must satisfy under ≤ slightlyUnder ≤ 100 ≤ slightlyOver ≤ over");
  }
}

export function classifyPacing(pacingPct: number, t: PacingThresholds = DEFAULT_THRESHOLDS): PacingStatus {
  if (pacingPct < t.under) return "UNDERSPENDING";
  if (pacingPct < t.slightlyUnder) return "SLIGHTLY_UNDER";
  if (pacingPct <= t.slightlyOver) return "ON_TARGET";
  if (pacingPct <= t.over) return "SLIGHTLY_OVER";
  return "OVERSPENDING";
}

export const STATUS_LABEL: Record<PacingStatus, string> = {
  UNDERSPENDING: "Underspending",
  SLIGHTLY_UNDER: "Slightly under",
  ON_TARGET: "On target",
  SLIGHTLY_OVER: "Slightly over",
  OVERSPENDING: "Overspending",
  NOT_STARTED: "Not started",
  NO_BUDGET: "No budget",
};

/** Higher = needs attention sooner. Used for default sort order. */
export const STATUS_SEVERITY: Record<PacingStatus, number> = {
  OVERSPENDING: 5,
  UNDERSPENDING: 4,
  SLIGHTLY_OVER: 3,
  SLIGHTLY_UNDER: 2,
  NO_BUDGET: 1,
  NOT_STARTED: 0,
  ON_TARGET: 0,
};

export function needsAttention(s: PacingStatus): boolean {
  return s === "OVERSPENDING" || s === "UNDERSPENDING";
}
