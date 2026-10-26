// Portfolio-level results, change wording and "needs attention" reasons, shared
// by Home (/dashboard), Clients › Performance (/clients) and the daily alert run.
// Pure: no database access.

import type { PlatformKey } from "./platforms";
import { formatMoney, formatNumber } from "./money";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Results for one platform's totals, counted once (ad-platform data only).
 *
 * - Meta: leads are already inside conversions, so results = conversions.
 * - Google LSA: "conversions" are charged leads, a subset of all leads, so
 *   results = leads (the larger of the two, in case leads were not reported).
 * - Google Ads / Microsoft: conversions.
 *
 * TODO(integration): Agent B's goal-based `resultsFor(goal, totals)` in
 * src/lib/results.ts replaces this once merged; keep callers going through
 * this one function (and `clientResults` below) so the swap is one place.
 */
export function resultCount(platform: PlatformKey, m: { conversions: number; leads: number }): number {
  if (platform === "GOOGLE_LSA") return Math.max(m.leads, m.conversions);
  return m.conversions;
}

export interface PeriodResults {
  spendMinor: number;
  results: number;
}

export interface ClientResults {
  clientId: string;
  currency: string;
  current: PeriodResults;
  previous: PeriodResults;
}

export const MIN_RESULTS_TO_COMPARE = 10;
/** Changes smaller than this (in %) are "about the same". */
export const NEUTRAL_CHANGE_PCT = 5;

export const costPerResult = (p: PeriodResults): number | null => (p.results > 0 ? p.spendMinor / p.results : null);

export function pctChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

// ---------------------------------------------------------------------------
// Change in words
// ---------------------------------------------------------------------------

export type ChangeVerdict = "better" | "worse" | "same" | "too_few" | "none" | "neutral";

export interface ChangeWords {
  pct: number | null;
  verdict: ChangeVerdict;
  /** e.g. "Up 8% from $1,200, worse" — also usable as an aria-label. */
  text: string;
}

/**
 * Describes a change in plain words. Changes under 5% are "about the same";
 * results-based figures with fewer than 10 results in either period are "too
 * few to compare". Spend gets no verdict: more or less spend is neither good
 * nor bad on its own.
 */
export function describeChange(o: {
  current: number | null;
  previous: number | null;
  better: "up" | "down" | "neutral";
  format: (n: number) => string;
  /** Result counts behind the figure, when it depends on results. */
  counts?: { current: number; previous: number };
}): ChangeWords {
  if (o.counts && (o.counts.current < MIN_RESULTS_TO_COMPARE || o.counts.previous < MIN_RESULTS_TO_COMPARE)) {
    return { pct: null, verdict: "too_few", text: "Too few results to compare" };
  }
  if (o.current === null || o.previous === null || o.previous <= 0) return { pct: null, verdict: "none", text: "No earlier period to compare" };
  const pct = ((o.current - o.previous) / o.previous) * 100;
  if (Math.abs(pct) < NEUTRAL_CHANGE_PCT) return { pct, verdict: "same", text: `About the same as ${o.format(o.previous)}` };
  const dir = pct > 0 ? "Up" : "Down";
  const base = `${dir} ${Math.round(Math.abs(pct))}% from ${o.format(o.previous)}`;
  if (o.better === "neutral") return { pct, verdict: "neutral", text: base };
  const good = (pct > 0) === (o.better === "up");
  return { pct, verdict: good ? "better" : "worse", text: `${base}, ${good ? "better" : "worse"}` };
}

// ---------------------------------------------------------------------------
// Efficiency (feeds the underspend advice)
// ---------------------------------------------------------------------------

/** Cost per result at or above this multiple of the benchmark is "high". */
export const HIGH_CPR_MULTIPLE = 1.3;

/** Median cost per result per currency, across clients with enough results. */
export function medianCostPerResult(clients: ClientResults[]): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const c of clients) {
    if (c.current.results < MIN_RESULTS_TO_COMPARE) continue;
    by.set(c.currency, [...(by.get(c.currency) ?? []), c.current.spendMinor / c.current.results]);
  }
  const out = new Map<string, number>();
  for (const [cur, xs] of by) {
    if (xs.length < 3) continue; // a median of one or two clients is not a benchmark
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    out.set(cur, s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
  }
  return out;
}

/** Cost per result ≥1.3× the client's previous period, or ≥1.3× the agency median (≥10 results). */
export function costPerResultHigh(c: ClientResults, medians: Map<string, number>): boolean {
  if (c.current.results < MIN_RESULTS_TO_COMPARE) return false;
  const cpr = c.current.spendMinor / c.current.results;
  const prev = c.previous.results >= MIN_RESULTS_TO_COMPARE ? c.previous.spendMinor / c.previous.results : null;
  const median = medians.get(c.currency);
  return (prev !== null && cpr >= prev * HIGH_CPR_MULTIPLE) || (median !== undefined && cpr >= median * HIGH_CPR_MULTIPLE);
}

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------

export type AttentionKind = "disconnected" | "alerts" | "over" | "under" | "cpr_up" | "results_down" | "stale";

export interface AttentionReason {
  kind: AttentionKind;
  label: string;
  tone: "critical" | "warning";
}

const WEIGHT: Record<AttentionKind, number> = { disconnected: 6, alerts: 5, over: 4, cpr_up: 3, results_down: 3, under: 2, stale: 2 };

export interface AttentionInput {
  currency: string;
  /**
   * Open (unacknowledged, not snoozed) alerts that make a client Critical: a
   * lost connection, failed sync, conversion tracking at zero, spend stopped, or
   * overspending. See CRITICAL_ALERT_TYPES.
   */
  openCriticalAlerts: number;
  /** Other open critical-severity alerts (an underspend, a cost spike…): Watch, not Critical. */
  openOtherAlerts?: number;
  /** Connected, budgeted lines in their current period. */
  lines: {
    phase: "NOT_STARTED" | "ACTIVE" | "ENDED";
    budgetMinor: number;
    projectedVarianceMinor: number;
    currency: string;
    /** Pacing so far and month-end forecast states; "OVERSPENDING" in either makes an overrun Critical. */
    status?: string;
    forecastStatus?: string;
    /** Spent so far; at or above the budget means it is used up (Critical). */
    actualToDateMinor?: number;
  }[];
  results: ClientResults | null;
  /** Hours since the oldest live account last synced; null when none is linked. */
  oldestSyncHours: number | null;
  disconnected: boolean;
}

export const STALE_ATTENTION_HOURS = 36;
export const CPR_UP_PCT = 20;
export const RESULTS_DOWN_PCT = 30;

/** A month-end forecast off budget by more than max($100, 5% of the budget). */
export function forecastOffBudget(budgetMinor: number, varianceMinor: number): boolean {
  return Math.abs(varianceMinor) > Math.max(10000, budgetMinor * 0.05);
}

/** Every reason a client needs attention, most important first. Empty = all clear. */
export function attentionReasons(i: AttentionInput): AttentionReason[] {
  const out: AttentionReason[] = [];
  const money = (m: number, c = i.currency) => formatMoney(Math.abs(m), c, { whole: true });
  if (i.disconnected) out.push({ kind: "disconnected", label: "Ad account disconnected", tone: "critical" });
  if (i.openCriticalAlerts > 0) out.push({ kind: "alerts", label: `${i.openCriticalAlerts} critical alert${i.openCriticalAlerts === 1 ? "" : "s"}`, tone: "critical" });
  const active = i.lines.filter((l) => l.phase === "ACTIVE" && forecastOffBudget(l.budgetMinor, l.projectedVarianceMinor));
  const over = active.filter((l) => l.projectedVarianceMinor > 0);
  const under = active.filter((l) => l.projectedVarianceMinor < 0);
  if (over.length) {
    // Critical only when a line is clearly overspending or has used up its budget; "a bit over" is Watch.
    const serious = over.some((l) => l.status === "OVERSPENDING" || l.forecastStatus === "OVERSPENDING" || (l.actualToDateMinor ?? 0) >= l.budgetMinor);
    const amount = money(over.reduce((s, l) => s + l.projectedVarianceMinor, 0), over[0].currency);
    out.push(serious ? { kind: "over", label: `Forecast ${amount} over budget`, tone: "critical" } : { kind: "over", label: `A bit over budget · forecast +${amount}`, tone: "warning" });
  }
  if (under.length) out.push({ kind: "under", label: `Forecast ${money(under.reduce((s, l) => s + l.projectedVarianceMinor, 0), under[0].currency)} under budget`, tone: "warning" });
  const r = i.results;
  if (r && r.current.results >= MIN_RESULTS_TO_COMPARE && r.previous.results >= MIN_RESULTS_TO_COMPARE) {
    const up = pctChange(costPerResult(r.current)!, costPerResult(r.previous)!);
    if (up !== null && up >= CPR_UP_PCT) out.push({ kind: "cpr_up", label: `Cost per result up ${Math.round(up)}%`, tone: "warning" });
  }
  if (r && r.previous.results >= MIN_RESULTS_TO_COMPARE) {
    const ch = pctChange(r.current.results, r.previous.results);
    if (ch !== null && ch <= -RESULTS_DOWN_PCT) out.push({ kind: "results_down", label: `Results down ${Math.round(-ch)}% (${formatNumber(r.current.results, 0)} vs ${formatNumber(r.previous.results, 0)})`, tone: "warning" });
  }
  if (!i.disconnected && i.oldestSyncHours !== null && i.oldestSyncHours > STALE_ATTENTION_HOURS) {
    out.push({ kind: "stale", label: Number.isFinite(i.oldestSyncHours) ? `Data ${Math.round(i.oldestSyncHours)} hours old` : "Data never synced", tone: "warning" });
  }
  // Other open alerts mostly repeat a reason above (an underspend alert and "Forecast under budget");
  // they only count on their own when nothing else explains them.
  if ((i.openOtherAlerts ?? 0) > 0 && out.length === 0) out.push({ kind: "alerts", label: `${i.openOtherAlerts} open alert${i.openOtherAlerts === 1 ? "" : "s"}`, tone: "warning" });
  return out.sort((a, b) => WEIGHT[b.kind] - WEIGHT[a.kind] || (a.tone === b.tone ? 0 : a.tone === "critical" ? -1 : 1));
}

/** Alert types that make a client Critical; every other alert is Watch. */
export const CRITICAL_ALERT_TYPES = ["ACCOUNT_DISCONNECTED", "SYNC_FAILED", "TRACKING_ZERO", "SPEND_STOPPED", "OVERSPENDING"] as const;

/**
 * Critical: a lost connection, broken tracking, spend stopped, or a budget
 * that is overspending or already used up. Watch: "a bit over", underspend,
 * performance drops and old data. Null when nothing needs attention.
 */
export function attentionTier(reasons: AttentionReason[]): "critical" | "watch" | null {
  if (!reasons.length) return null;
  return reasons.some((r) => r.tone === "critical") ? "critical" : "watch";
}

/** Sort weight for a client: its most important reason, then the number of reasons. */
export function attentionWeight(reasons: AttentionReason[]): number {
  return reasons.length ? Math.max(...reasons.map((r) => WEIGHT[r.kind])) * 10 + reasons.length : 0;
}

// ---------------------------------------------------------------------------
// Month-end forecast, split by direction (H5)
// ---------------------------------------------------------------------------

export interface ForecastSplit {
  currency: string;
  overMinor: number;
  overLines: number;
  underMinor: number;
  underLines: number;
  netMinor: number;
  /** Other currencies present among the lines; their lines are not in the sums. */
  otherCurrencies: string[];
}

/**
 * Over- and under-spend kept apart, so +$4,000 on one client and −$4,000 on
 * another don't read as "on budget". Lines count by their shown status (the
 * worse of pacing to date and forecast). Only lines in `currency` are summed.
 */
export function forecastSplit(
  lines: { currency: string; shownStatus: string; projectedVarianceMinor: number }[],
  currency: string,
): ForecastSplit {
  const out: ForecastSplit = { currency, overMinor: 0, overLines: 0, underMinor: 0, underLines: 0, netMinor: 0, otherCurrencies: [] };
  const others = new Set<string>();
  for (const l of lines) {
    if (l.currency !== currency) {
      others.add(l.currency);
      continue;
    }
    out.netMinor += l.projectedVarianceMinor;
    if ((l.shownStatus === "OVERSPENDING" || l.shownStatus === "SLIGHTLY_OVER") && l.projectedVarianceMinor > 0) {
      out.overMinor += l.projectedVarianceMinor;
      out.overLines++;
    } else if ((l.shownStatus === "UNDERSPENDING" || l.shownStatus === "SLIGHTLY_UNDER") && l.projectedVarianceMinor < 0) {
      out.underMinor += -l.projectedVarianceMinor;
      out.underLines++;
    }
  }
  out.otherCurrencies = [...others];
  return out;
}
