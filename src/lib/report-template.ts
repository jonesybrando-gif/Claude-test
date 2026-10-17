// Report templates: which KPIs and sections a client report shows. Stored as
// JSON on the Report model; always read through parseTemplate so a stale or
// hand-edited value can never break a report.

import { DEFAULT_KPIS, isKpiKey, type KpiKey } from "./kpis";
import type { CompareMode, RangePreset } from "./date-ranges";

export const SECTION_KEYS = ["executive", "summary", "kpis", "trends", "pacing", "platforms", "campaigns", "history", "notes"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABEL: Record<SectionKey, string> = {
  executive: "Executive summary",
  summary: "Written note",
  kpis: "KPI scorecards",
  trends: "Trend charts",
  pacing: "Budget pacing",
  platforms: "Platform breakdown",
  campaigns: "Campaign table",
  history: "Budget history",
  notes: "Notes and definitions",
};

export interface ReportTemplate {
  title: string;
  kpis: KpiKey[];
  trendKpis: KpiKey[];
  sections: Record<SectionKey, boolean>;
  summary: string;
  /** Executive summary written by AI when it's set up; otherwise built from the figures. */
  executiveAi: boolean;
  defaultRange: Exclude<RangePreset, "custom">;
  compare: CompareMode;
}

export const MAX_KPIS = 12;
export const MAX_TRENDS = 3;
const RANGES = ["mtd", "last_month", "last_7", "last_30", "last_90"] as const;
const COMPARES = ["previous_period", "previous_month", "none"] as const;

export const DEFAULT_TEMPLATE: ReportTemplate = {
  title: "Advertising performance report",
  kpis: DEFAULT_KPIS,
  trendKpis: ["spend", "conversions"],
  sections: { executive: true, summary: true, kpis: true, trends: true, pacing: true, platforms: true, campaigns: true, history: true, notes: true },
  summary: "",
  executiveAi: true,
  defaultRange: "last_month",
  compare: "previous_period",
};

const uniqueKpis = (v: unknown, max: number): KpiKey[] | null =>
  Array.isArray(v) ? [...new Set(v.filter(isKpiKey))].slice(0, max) : null;

export function parseTemplate(raw: unknown, base: ReportTemplate = DEFAULT_TEMPLATE): ReportTemplate {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sections = { ...base.sections };
  if (o.sections && typeof o.sections === "object") {
    for (const k of SECTION_KEYS) {
      const v = (o.sections as Record<string, unknown>)[k];
      if (typeof v === "boolean") sections[k] = v;
    }
  }
  const kpis = uniqueKpis(o.kpis, MAX_KPIS);
  const trendKpis = uniqueKpis(o.trendKpis, MAX_TRENDS);
  return {
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 120) : base.title,
    kpis: kpis && kpis.length ? kpis : base.kpis,
    trendKpis: trendKpis ?? base.trendKpis,
    sections,
    summary: typeof o.summary === "string" ? o.summary.slice(0, 5000) : base.summary,
    executiveAi: typeof o.executiveAi === "boolean" ? o.executiveAi : base.executiveAi,
    defaultRange: RANGES.includes(o.defaultRange as (typeof RANGES)[number]) ? (o.defaultRange as ReportTemplate["defaultRange"]) : base.defaultRange,
    compare: COMPARES.includes(o.compare as CompareMode) ? (o.compare as CompareMode) : base.compare,
  };
}

/** Builds a template from a submitted builder form. KPIs keep the submitted order. */
export function templateFromForm(form: { getAll(k: string): unknown[]; get(k: string): unknown }): { template: ReportTemplate; problems: string[] } {
  const problems: string[] = [];
  const kpis = form.getAll("kpis").filter(isKpiKey);
  const trendKpis = form.getAll("trendKpis").filter(isKpiKey);
  if (kpis.length === 0) problems.push("Choose at least one KPI.");
  if (kpis.length > MAX_KPIS) problems.push(`Choose at most ${MAX_KPIS} KPIs.`);
  if (trendKpis.length > MAX_TRENDS) problems.push(`Choose at most ${MAX_TRENDS} trend charts.`);
  const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, form.get(`section:${k}`) === "on"]));
  const template = parseTemplate({
    title: form.get("title"),
    kpis, // in the order arranged in the builder
    trendKpis,
    sections,
    summary: form.get("summary"),
    executiveAi: form.get("executiveAi") !== "auto",
    defaultRange: form.get("defaultRange"),
    compare: form.get("compare"),
  });
  if (String(form.get("summary") ?? "").length > 5000) problems.push("The summary can be at most 5,000 characters.");
  return { template, problems };
}
