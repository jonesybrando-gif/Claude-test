// KPI catalog shared by dashboards, report templates, PDFs and the AI assistant.
// Every KPI is computed from summed MetricTotals, so blended (cross-platform)
// values are true ratios rather than averages of averages.

import { derive, pctChange, type MetricTotals } from "./metrics";
import { formatMoney, formatNumber, formatPct } from "./money";
import { changeVerdict, changeWords, type Verdict } from "./change";
import { tracksValue } from "./results";

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
  /** One-line plain-English definition for readers with no advertising knowledge (the ⓘ text). */
  plain: string;
  /** What the figure rests on (clicks, conversions, leads): small samples get no verdict. */
  sample?: (t: MetricTotals) => number;
  /** A result metric: platforms keep adding late-counted results for a while. */
  result?: boolean;
  value: (t: MetricTotals) => number | null;
}

const clicksOf = (t: MetricTotals) => t.clicks;
const convOf = (t: MetricTotals) => t.conversions;
const leadsOf = (t: MetricTotals) => t.leads;

export const KPIS: KpiDef[] = [
  { key: "spend", label: "Ad spend", short: "Spend", kind: "money", better: "neutral", description: "Total cost across platforms.", plain: "What was spent on ads, across every ad platform.", value: (t) => t.costMinor },
  { key: "impressions", label: "Impressions", short: "Impr.", kind: "count", better: "up", description: "Times ads were shown.", plain: "How many times your ads were shown.", sample: (t) => t.impressions, value: (t) => t.impressions },
  { key: "clicks", label: "Clicks", short: "Clicks", kind: "count", better: "up", description: "Clicks on ads.", plain: "How many times people clicked your ads.", sample: clicksOf, value: (t) => t.clicks },
  { key: "ctr", label: "Click-through rate", short: "CTR", kind: "pct", better: "up", description: "Clicks ÷ impressions.", plain: "Out of every 100 times your ads were shown, how many got a click.", sample: clicksOf, value: (t) => derive(t).ctr },
  { key: "cpc", label: "Cost per click", short: "CPC", kind: "money", better: "down", description: "Spend ÷ clicks.", plain: "The average cost of one click: ad spend divided by clicks.", sample: clicksOf, value: (t) => derive(t).cpcMinor },
  { key: "cpm", label: "Cost per 1,000 impressions", short: "CPM", kind: "money", better: "down", description: "Spend ÷ impressions × 1,000.", plain: "What it cost to show your ads 1,000 times.", value: (t) => derive(t).cpmMinor },
  { key: "conversions", label: "Conversions", short: "Conv.", kind: "count", better: "up", description: "Platform-reported conversions.", plain: "Actions the ad platforms counted as valuable, such as a call, a form or a purchase.", sample: convOf, result: true, value: (t) => t.conversions },
  { key: "conversionRate", label: "Conversion rate", short: "Conv. rate", kind: "pct", better: "up", description: "Conversions ÷ clicks.", plain: "Out of every 100 clicks, how many turned into a conversion.", sample: convOf, result: true, value: (t) => derive(t).conversionRate },
  { key: "costPerConversion", label: "Cost per conversion", short: "CPA", kind: "money", better: "down", description: "Spend ÷ conversions.", plain: "The average cost of one conversion: ad spend divided by conversions.", sample: convOf, result: true, value: (t) => derive(t).costPerConversionMinor },
  { key: "conversionValue", label: "Conversion value", short: "Value", kind: "money", better: "up", description: "Platform-reported revenue from conversions.", plain: "The sales value the ad platforms credited to your ads.", sample: convOf, result: true, value: (t) => (t.conversionValueMinor > 0 ? t.conversionValueMinor : null) },
  { key: "roas", label: "Return on ad spend", short: "ROAS", kind: "ratio", better: "up", description: "Conversion value ÷ spend.", plain: "Sales value the ad platforms credited to your ads for each unit of ad spend (4.00× means $4 for every $1). This is not profit.", sample: convOf, result: true, value: (t) => derive(t).roas },
  { key: "leads", label: "Leads", short: "Leads", kind: "count", better: "up", description: "Leads reported by Meta and Local Services. Shown as — when no connected platform reports leads.", plain: "Enquiries reported by Meta and Google Local Services ads.", sample: leadsOf, result: true, value: (t) => (t.leads > 0 ? t.leads : t.leadsReported ? 0 : null) },
  { key: "costPerLead", label: "Cost per lead", short: "CPL", kind: "money", better: "down", description: "Spend ÷ leads.", plain: "The average cost of one lead: ad spend divided by leads.", sample: leadsOf, result: true, value: (t) => derive(t).costPerLeadMinor },
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

/** `whole` rounds conversions to whole numbers, as tables show them. */
export function formatKpi(key: KpiKey, v: number | null, currency = "USD", opts: { compact?: boolean; whole?: boolean } = {}): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const def = KPI_BY_KEY[key];
  switch (def.kind) {
    case "money":
      // Totals in whole currency; unit costs (CPC, CPL…) keep cents.
      return formatMoney(v, currency, { whole: key === "spend" || key === "conversionValue" || (opts.compact ?? false) });
    case "count":
      return formatNumber(v, key === "conversions" && v < 100 && !opts.whole ? 1 : 0);
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
  /** The verdict in words (see ./change.ts); null when no comparison. */
  verdict: Verdict | null;
}

export interface KpiValueOptions {
  /** Recent results are still being counted: result metrics get no verdict. */
  stillCounting?: boolean;
}

export function kpiValues(keys: KpiKey[], cur: MetricTotals, prev: MetricTotals | null, opts: KpiValueOptions = {}): KpiValue[] {
  return keys.map((key) => {
    const def = KPI_BY_KEY[key];
    const value = def.value(cur);
    const previous = prev ? def.value(prev) : null;
    const changePct = value !== null && previous !== null ? pctChange(value, previous) : null;
    const { verdict, tone } = changeVerdict({
      changePct,
      better: def.better,
      sample: def.sample && prev ? { current: def.sample(cur), previous: def.sample(prev) } : null,
      stillCounting: !!(def.result && opts.stillCounting),
    });
    return { key, value, previous, changePct, tone, verdict };
  });
}

/** "Up 8% from $5,790 · better" and the spoken sentence, for a KPI value. */
export function kpiChangeWords(kv: KpiValue, currency: string): { text: string; aria: string } {
  return changeWords(kv.verdict, kv.changePct, formatKpi(kv.key, kv.previous, currency), KPI_BY_KEY[kv.key].label);
}

/**
 * KPIs the client doesn't track, which the client page hides (staff can still
 * add them with Edit KPIs): value and ROAS without real conversion values (none,
 * or the $1-per-conversion placeholder), leads and cost per lead when no
 * leads were reported in either period.
 */
export function untrackedKpis(cur: MetricTotals, prev: MetricTotals | null = null): Set<KpiKey> {
  const out = new Set<KpiKey>();
  const any = (f: (t: MetricTotals) => boolean) => f(cur) || (prev ? f(prev) : false);
  if (!any(tracksValue)) out.add("conversionValue").add("roas");
  if (!any((t) => t.leads > 0)) out.add("leads").add("costPerLead");
  return out;
}
