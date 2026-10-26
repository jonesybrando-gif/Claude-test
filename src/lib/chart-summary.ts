// One-line plain-English summaries of charts, for people who can't see the
// chart (screen readers) or don't read charts easily. Pure and shared by the
// trend, series and breakdown charts.

import { isKpiKey, KPI_BY_KEY } from "./kpis";
import { METRIC_BY_KEY } from "./metrics-registry";
import { pctChange } from "./metrics";
import { formatDate } from "./time";

/** Below this change (in %), a difference is described as "about the same". */
export const NEUTRAL_CHANGE_PCT = 5;
/** Counts smaller than this in both periods are too few to compare. */
export const MIN_COUNT_TO_COMPARE = 10;

/** True when daily values can be added up into a period total (spend, clicks, sessions), not for rates and averages. */
export function isAdditiveMetric(key: string): boolean {
  const ad = key.startsWith("ads.") ? key.slice(4) : key;
  if (isKpiKey(ad)) {
    const d = KPI_BY_KEY[ad];
    return d.kind === "count" || ad === "spend" || ad === "conversionValue";
  }
  return METRIC_BY_KEY[key]?.aggregation === "sum";
}

/** "up 12%", "down 8%", "about the same as" style comparison words. */
export function changePhrase(current: number, previous: number, opts: { count?: boolean } = {}): string {
  if (opts.count && Math.max(Math.abs(current), Math.abs(previous)) < MIN_COUNT_TO_COMPARE) return "too few to compare with the comparison period";
  if (previous === 0) return current === 0 ? "the same as the comparison period" : "none in the comparison period";
  const pct = pctChange(current, previous) ?? 0;
  if (Math.abs(pct) < NEUTRAL_CHANGE_PCT) return "about the same as the comparison period";
  return `${pct > 0 ? "up" : "down"} ${Math.round(Math.abs(pct))}% on the comparison period`;
}

export interface SeriesSummaryInput {
  label: string;
  dates: string[];
  values: (number | null)[];
  previous?: (number | null)[] | null;
  /** Exact whole-period values when known (e.g. cost per lead from summed totals); otherwise additive metrics are summed. */
  period?: { current: number | null; previous: number | null };
  additive: boolean;
  /** Count metrics get the small-sample rule. */
  count?: boolean;
  format: (v: number) => string;
}

/** e.g. "Spend for the period: $1,234, up 12% on the comparison period. Highest on Sep 12 ($120)." */
export function summarizeSeries(s: SeriesSummaryInput): string {
  const points = s.dates.map((d, i) => ({ d, v: s.values[i] })).filter((p): p is { d: string; v: number } => p.v !== null && p.v !== undefined && Number.isFinite(p.v));
  if (!points.length) return `${s.label}: no data for this period.`;
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, v) => a + (v ?? 0), 0);
  const hasPrev = !!s.previous && s.previous.some((v) => v !== null);
  const cur = s.period ? s.period.current : s.additive ? sum(s.values) : null;
  const prev = s.period ? s.period.previous : s.additive && hasPrev ? sum(s.previous!) : null;
  const parts: string[] = [];
  if (cur !== null) {
    let first = `${s.label} for the period: ${s.format(cur)}`;
    if (prev !== null && (hasPrev || s.period)) first += `, ${changePhrase(cur, prev, { count: s.count })}`;
    parts.push(`${first}.`);
  }
  if (points.length > 1) {
    const hi = points.reduce((a, p) => (p.v > a.v ? p : a));
    const lo = points.reduce((a, p) => (p.v < a.v ? p : a));
    if (hi.v === lo.v) parts.push(`${cur === null ? `${s.label} was` : "It was"} ${s.format(hi.v)} every day.`);
    else parts.push(`${cur === null ? `${s.label} was h` : "H"}ighest on ${formatDate(hi.d)} (${s.format(hi.v)}) and lowest on ${formatDate(lo.d)} (${s.format(lo.v)}).`);
  } else if (cur === null) {
    parts.push(`${s.label}: ${s.format(points[0].v)} on ${formatDate(points[0].d)}.`);
  }
  return parts.join(" ");
}

/** e.g. "Google Ads had the most spend: $1,200 (62% of the total), then Meta Ads ($700)." */
export function summarizeBreakdown(label: string, rows: { label: string; value: number | null }[], format: (v: number) => string, opts: { share?: boolean } = {}): string {
  const pos = rows.filter((r): r is { label: string; value: number } => r.value !== null && Number.isFinite(r.value)).sort((a, b) => b.value - a.value);
  if (!pos.length || pos[0].value === 0) return `${label}: nothing to show for this period.`;
  const total = pos.reduce((a, r) => a + Math.max(0, r.value), 0);
  const share = opts.share && total > 0 ? ` (${Math.round((pos[0].value / total) * 100)}% of the total)` : "";
  let text = `${pos[0].label} had the highest ${label.toLowerCase()}: ${format(pos[0].value)}${share}`;
  if (pos[1]) text += `, then ${pos[1].label} (${format(pos[1].value)})`;
  return `${text}.`;
}
