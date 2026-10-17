// KPI catalog shared by dashboards, report templates, PDFs and the AI assistant.
// Every KPI is computed from summed MetricTotals, so blended (cross-platform)
// values are true ratios rather than averages of averages.

import { derive, pctChange, type MetricTotals } from "./metrics";
import { formatMoney, formatNumber, formatPct } from "./money";

export type KpiKey =
  | "spend"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "conversions"
  | "conversionRate"
  | "costPerConversion"
  | "conversionValue"
  | "roas"
  | "leads"
  | "costPerLead";

type Kind = "money" | "count" | "pct" | "ratio";

export interface KpiDef {
  key: KpiKey;
  label: string;
  short: string;
  kind: Kind;
  /** Is an increase good, bad, or neither (spend)? Drives the colour of changes. */
  better: "up" | "down" | "neutral";
  description: string;
  value: (t: MetricTotals) => number | null;
}

export const KPIS: KpiDef[] = [
  { key: "spend", label: "Ad spend", short: "Spend", kind: "money", better: "neutral", description: "Total cost across platforms.", value: (t) => t.costMinor },
  { key: "impressions", label: "Impressions", short: "Impr.", kind: "count", better: "up", description: "Times ads were shown.", value: (t) => t.impressions },
  { key: "clicks", label: "Clicks", short: "Clicks", kind: "count", better: "up", description: "Clicks on ads.", value: (t) => t.clicks },
  { key: "ctr", label: "Click-through rate", short: "CTR", kind: "pct", better: "up", description: "Clicks ÷ impressions.", value: (t) => derive(t).ctr },
  { key: "cpc", label: "Cost per click", short: "CPC", kind: "money", better: "down", description: "Spend ÷ clicks.", value: (t) => derive(t).cpcMinor },
  { key: "cpm", label: "Cost per 1,000 impressions", short: "CPM", kind: "money", better: "down", description: "Spend ÷ impressions × 1,000.", value: (t) => derive(t).cpmMinor },
  { key: "conversions", label: "Conversions", short: "Conv.", kind: "count", better: "up", description: "Platform-reported conversions.", value: (t) => t.conversions },
  { key: "conversionRate", label: "Conversion rate", short: "Conv. rate", kind: "pct", better: "up", description: "Conversions ÷ clicks.", value: (t) => derive(t).conversionRate },
  { key: "costPerConversion", label: "Cost per conversion", short: "CPA", kind: "money", better: "down", description: "Spend ÷ conversions.", value: (t) => derive(t).costPerConversionMinor },
  { key: "conversionValue", label: "Conversion value", short: "Value", kind: "money", better: "up", description: "Platform-reported revenue from conversions.", value: (t) => (t.conversionValueMinor > 0 ? t.conversionValueMinor : null) },
  { key: "roas", label: "Return on ad spend", short: "ROAS", kind: "ratio", better: "up", description: "Conversion value ÷ spend.", value: (t) => derive(t).roas },
  { key: "leads", label: "Leads", short: "Leads", kind: "count", better: "up", description: "Leads reported by Meta and Local Services. Shown as — when no platform reported leads.", value: (t) => (t.leads > 0 ? t.leads : null) },
  { key: "costPerLead", label: "Cost per lead", short: "CPL", kind: "money", better: "down", description: "Spend ÷ leads.", value: (t) => derive(t).costPerLeadMinor },
];

export const KPI_BY_KEY = Object.fromEntries(KPIS.map((k) => [k.key, k])) as Record<KpiKey, KpiDef>;
export const ALL_KPI_KEYS = KPIS.map((k) => k.key);
export const DEFAULT_KPIS: KpiKey[] = ["spend", "impressions", "clicks", "ctr", "cpc", "conversions", "conversionRate", "costPerConversion", "leads", "costPerLead", "conversionValue", "roas"];

export function isKpiKey(k: unknown): k is KpiKey {
  return typeof k === "string" && k in KPI_BY_KEY;
}

/** A single day's value for charts: counts read 0 rather than "not reported" so lines don't break. */
export function dailyKpiValue(d: MetricTotals, key: KpiKey): number | null {
  const def = KPI_BY_KEY[key];
  return def.value(d) ?? (def.kind === "count" ? 0 : null);
}

export function formatKpi(key: KpiKey, v: number | null, currency = "USD", opts: { compact?: boolean } = {}): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const def = KPI_BY_KEY[key];
  switch (def.kind) {
    case "money":
      // Totals in whole currency; unit costs (CPC, CPL…) keep cents.
      return formatMoney(v, currency, { whole: key === "spend" || key === "conversionValue" || (opts.compact ?? false) });
    case "count":
      return formatNumber(v, key === "conversions" && v < 1000 ? 1 : 0);
    case "pct":
      return formatPct(v, 2);
    case "ratio":
      return `${v.toFixed(2)}×`;
  }
}

export interface KpiValue {
  key: KpiKey;
  value: number | null;
  previous: number | null;
  changePct: number | null;
  /** "good" | "bad" | "neutral" for colouring; null when no comparison. */
  tone: "good" | "bad" | "neutral" | null;
}

export function kpiValues(keys: KpiKey[], cur: MetricTotals, prev: MetricTotals | null): KpiValue[] {
  return keys.map((key) => {
    const def = KPI_BY_KEY[key];
    const value = def.value(cur);
    const previous = prev ? def.value(prev) : null;
    const changePct = value !== null && previous !== null ? pctChange(value, previous) : null;
    let tone: KpiValue["tone"] = null;
    if (changePct !== null) {
      if (def.better === "neutral" || Math.abs(changePct) < 0.5) tone = "neutral";
      else tone = (changePct > 0) === (def.better === "up") ? "good" : "bad";
    }
    return { key, value, previous, changePct, tone };
  });
}
