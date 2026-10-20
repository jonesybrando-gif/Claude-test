// Turns report data into the text block the AI assistant is grounded in.
// Every number is pre-formatted (money in currency, not minor units) so the
// model quotes figures rather than computing them, and anything the platforms
// didn't report is written as "not reported" instead of 0.

import { formatKpi, KPI_BY_KEY, kpiValues, type KpiKey } from "./kpis";
import { formatMoney, formatPct } from "./money";
import { derive, type MetricTotals } from "./metrics";
import { STATUS_LABEL, type PacingStatus } from "./pacing/status";
import { hasPlaceholderValues } from "./insights";

export interface AiPacing {
  periodStart: string;
  periodEnd: string;
  asOf: string | null;
  status: PacingStatus;
  forecastStatus: PacingStatus;
  budgetMinor: number;
  actualToDateMinor: number;
  expectedToDateMinor: number;
  projectedMinor: number;
  requiredDailyMinor: number | null;
  currentDailyRateMinor: number;
  remainingActiveDays: number;
  pacingPct: number | null;
}

/** A campaign's own budget for the current month, when it has one. */
export interface CampaignBudget {
  status: PacingStatus;
  currentDailyRateMinor: number;
  requiredDailyMinor: number | null;
}

export interface AiContextInput {
  clientName: string;
  currency: string;
  isDemo: boolean;
  rangeLabel: string;
  range: { from: string; to: string };
  comparison: { from: string; to: string } | null;
  kpis: KpiKey[];
  totals: MetricTotals;
  previous: MetricTotals | null;
  accounts: { platform: string; name: string; totals: MetricTotals | null; spendVerified: boolean; dataNote: string | null }[];
  campaigns: { name: string; platform: string; status: string; totals: MetricTotals; previous: MetricTotals | null; budget?: CampaignBudget | null }[];
  pacing: AiPacing | null;
  /** Final budget result when the reporting period is exactly a past budget month. */
  pastBudget?: { month: string; budgetMinor: number; spentMinor: number; status: PacingStatus } | null;
  notes: string[];
}

const ACCOUNT_KPIS: KpiKey[] = ["spend", "impressions", "clicks", "ctr", "cpc", "conversions", "costPerConversion", "leads", "costPerLead", "roas"];
const CAMPAIGN_KPIS: KpiKey[] = ["spend", "clicks", "ctr", "conversions", "conversionRate", "costPerConversion", "leads", "costPerLead"];
const MAX_CAMPAIGNS = 25;

const pct = (p: number) => (Math.abs(p) < 0.05 ? "no change" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);

function kpiLine(keys: KpiKey[], cur: MetricTotals, prev: MetricTotals | null, currency: string): string {
  return kpiValues(keys, cur, prev)
    .map((kv) => {
      const v = kv.value === null ? "not reported" : formatKpi(kv.key, kv.value, currency);
      const change = kv.changePct === null ? "" : ` (${pct(kv.changePct)} vs ${formatKpi(kv.key, kv.previous, currency)})`;
      return `${KPI_BY_KEY[kv.key].short}: ${v}${change}`;
    })
    .join("; ");
}

export function buildAiContext(i: AiContextInput): string {
  const c = i.currency;
  const m = (v: number | null) => (v === null ? "n/a" : formatMoney(v, c, { whole: true }));
  const lines: string[] = [];
  lines.push(`Client: ${i.clientName}`);
  lines.push(`Currency: ${c}`);
  if (i.isDemo) lines.push("IMPORTANT: this client's accounts contain illustrative demo data, not real advertising results.");
  lines.push(`Reporting period: ${i.rangeLabel}, ${i.range.from} to ${i.range.to} (complete days only)`);
  lines.push(i.comparison ? `Comparison period: ${i.comparison.from} to ${i.comparison.to}` : "Comparison period: none");
  lines.push("");
  lines.push("## Totals, all platforms");
  for (const kv of kpiValues(i.kpis, i.totals, i.previous)) {
    const def = KPI_BY_KEY[kv.key];
    const v = kv.value === null ? "not reported" : formatKpi(kv.key, kv.value, c);
    const prev = i.previous ? `; comparison ${kv.previous === null ? "not reported" : formatKpi(kv.key, kv.previous, c)}` : "";
    const change = kv.changePct === null ? "" : `; change ${pct(kv.changePct)}${def.better === "neutral" ? "" : kv.tone === "good" ? " (favourable)" : kv.tone === "bad" ? " (unfavourable)" : ""}`;
    lines.push(`- ${def.label}: ${v}${prev}${change}`);
  }
  if (i.totals.hasEstimatedCost) lines.push("- Note: spend includes estimated Local Services Ads cost.");
  if (hasPlaceholderValues(i.totals)) lines.push("- Note: conversion value is exactly 1 per conversion, the ad platform's default when no values are set, so conversion value and ROAS don't reflect revenue. Don't present them as results.");

  lines.push("", "## By ad account");
  if (i.accounts.length === 0) lines.push("- No ad accounts connected.");
  for (const a of i.accounts) {
    const body = a.totals ? kpiLine(ACCOUNT_KPIS, a.totals, null, c) : "no data in this period";
    lines.push(`- ${a.platform} · ${a.name}: ${body}${a.spendVerified ? "" : " [spend estimated or incomplete]"}${a.dataNote ? ` [${a.dataNote}]` : ""}`);
  }

  const campaigns = [...i.campaigns].sort((a, b) => b.totals.costMinor - a.totals.costMinor);
  lines.push("", `## Campaigns by spend${campaigns.length > MAX_CAMPAIGNS ? ` (top ${MAX_CAMPAIGNS} of ${campaigns.length})` : ""}`);
  if (campaigns.length === 0) lines.push("- No campaign spend in this period.");
  // Pre-computed comparisons with the whole report, so the model quotes them instead of doing arithmetic.
  const avgCpa = derive(i.totals).costPerConversionMinor;
  for (const cmp of campaigns.slice(0, MAX_CAMPAIGNS)) {
    const share = i.totals.costMinor > 0 ? `; share of spend: ${formatPct((cmp.totals.costMinor / i.totals.costMinor) * 100, 0)}` : "";
    const cpa = derive(cmp.totals).costPerConversionMinor;
    const vsAvg = cpa !== null && avgCpa ? `; cost per conversion vs report average: ${formatPct(Math.abs(cpa / avgCpa - 1) * 100, 0)} ${cpa <= avgCpa ? "lower" : "higher"}` : "";
    const b = cmp.budget;
    const own = b ? `; own budget this month: ${STATUS_LABEL[b.status].toLowerCase()}, spending ${m(b.currentDailyRateMinor)} a day${b.requiredDailyMinor === null ? "" : ` against ${m(b.requiredDailyMinor)} a day needed to land on budget`}` : "";
    lines.push(`- ${cmp.name} (${cmp.platform}, ${cmp.status.toLowerCase()}): ${kpiLine(CAMPAIGN_KPIS, cmp.totals, cmp.previous, c)}${share}${vsAvg}${own}`);
  }

  lines.push("", "## Monthly budget pacing");
  const p = i.pacing;
  if (!p) lines.push("- No budget is set for the current month.");
  else {
    lines.push(`- Month: ${p.periodStart} to ${p.periodEnd}; data complete through ${p.asOf ?? "no complete days yet"}`);
    lines.push(`- Budget ${m(p.budgetMinor)}; spent ${m(p.actualToDateMinor)}; expected by now ${m(p.expectedToDateMinor)}; pacing ${formatPct(p.pacingPct)} of expected`);
    lines.push(`- Status to date: ${STATUS_LABEL[p.status]}; month-end forecast: ${STATUS_LABEL[p.forecastStatus]}, projected ${m(p.projectedMinor)} (${p.projectedMinor >= p.budgetMinor ? "+" : "-"}${m(Math.abs(p.projectedMinor - p.budgetMinor))} vs budget)`);
    lines.push(`- Current daily rate (7-day): ${m(p.currentDailyRateMinor)}; required daily to land on budget: ${p.requiredDailyMinor === null ? "n/a" : `${m(p.requiredDailyMinor)} over ${p.remainingActiveDays} remaining days`}`);
  }

  if (i.pastBudget) {
    const b = i.pastBudget;
    lines.push("", `## Budget result for ${b.month} (the reporting period)`);
    lines.push(`- Budget ${m(b.budgetMinor)}; final spend ${m(b.spentMinor)} (${formatPct(b.budgetMinor ? (b.spentMinor / b.budgetMinor) * 100 : null, 0)} of budget); result: ${STATUS_LABEL[b.status]}`);
  }

  if (i.notes.length) {
    lines.push("", "## Data notes");
    for (const n of i.notes) lines.push(`- ${n}`);
  }
  lines.push("", "Conversions and conversion value are reported by each platform under its own attribution settings; platforms count them differently.");
  return lines.join("\n");
}
