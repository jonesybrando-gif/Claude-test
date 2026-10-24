// Pure mapping from CallRail calls / form submissions to daily MetricDaily rows.
import { eachDay, type IsoDate } from "@/lib/pacing/dates";
import type { MetricRow } from "../types";

export interface CallRailCall {
  id?: string;
  start_time: string; // ISO 8601 with offset, e.g. "2026-10-01T23:30:00.000-07:00"
  answered?: boolean | null;
  voicemail?: boolean | null;
  duration?: number | null;
  first_call?: boolean | null;
  lead_status?: string | null;
  source?: string | null;
  source_name?: string | null;
  campaign?: string | null;
  keywords?: string | null;
  tracking_phone_number?: string | null;
  company_time_zone?: string | null;
}

export interface CallRailFormSubmission {
  id?: string;
  submitted_at: string;
  source?: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function validTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Local calendar date of an ISO timestamp in `timeZone`. Without a usable time
 * zone, falls back to the date as written (CallRail writes times in the
 * company's own time zone).
 */
export function localDate(iso: string, timeZone?: string | null): IsoDate | null {
  if (typeof iso !== "string") return null;
  const t = Date.parse(iso);
  if (validTimeZone(timeZone) && Number.isFinite(t)) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(t));
    const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  return ISO_DATE.test(iso) ? iso.slice(0, 10) : null;
}

/** Missed = not answered, or went to voicemail. Answered is the complement, so answered + missed = calls. */
export function isAnswered(c: Pick<CallRailCall, "answered" | "voicemail">): boolean {
  return c.answered === true && c.voicemail !== true;
}

const clean = (s: string | null | undefined) => (typeof s === "string" ? s.trim() : "");

/** Campaign label: CallRail campaign, else the tracker (tracking number) name, else the tracking number. */
export function campaignOf(c: CallRailCall): string {
  return clean(c.campaign) || clean(c.source_name) || clean(c.tracking_phone_number) || "(none)";
}

class Acc {
  private m = new Map<string, MetricRow>();
  add(date: IsoDate, metric: string, value: number, dimension = "", dimensionValue = "") {
    const k = `${date}|${metric}|${dimension}|${dimensionValue}`;
    const row = this.m.get(k);
    if (row) row.value += value;
    else this.m.set(k, { date, metric, value, dimension, dimensionValue });
  }
  rows(): MetricRow[] {
    return [...this.m.values()];
  }
}

const CALL_TOTALS = ["callrail.calls", "callrail.answered", "callrail.missed", "callrail.firstTimeCallers", "callrail.leads", "callrail.durationSeconds"];

/**
 * Bucket calls by local date in `timeZone` (dates outside [from, to] are
 * dropped). Every day in the window gets total rows, so a quiet day reads 0
 * rather than "no data".
 */
export function callsToRows(calls: CallRailCall[], opts: { timeZone?: string | null; from: IsoDate; to: IsoDate }): MetricRow[] {
  const acc = new Acc();
  for (const d of eachDay(opts.from, opts.to)) for (const m of CALL_TOTALS) acc.add(d, m, 0);
  const seen = new Set<string>();
  for (const c of calls) {
    if (c.id) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
    }
    const date = localDate(c.start_time, opts.timeZone);
    if (!date || date < opts.from || date > opts.to) continue;
    const answered = isAnswered(c);
    const first = c.first_call === true;
    const lead = c.lead_status === "good_lead";
    const duration = answered && typeof c.duration === "number" && c.duration > 0 ? c.duration : 0;

    acc.add(date, "callrail.calls", 1);
    acc.add(date, "callrail.answered", answered ? 1 : 0);
    acc.add(date, "callrail.missed", answered ? 0 : 1);
    acc.add(date, "callrail.firstTimeCallers", first ? 1 : 0);
    acc.add(date, "callrail.leads", lead ? 1 : 0);
    acc.add(date, "callrail.durationSeconds", duration);

    const source = clean(c.source) || "(unknown)";
    const campaign = campaignOf(c);
    for (const [dim, val] of [["source", source], ["campaign", campaign]] as const) {
      acc.add(date, "callrail.calls", 1, dim, val);
      acc.add(date, "callrail.answered", answered ? 1 : 0, dim, val);
      acc.add(date, "callrail.firstTimeCallers", first ? 1 : 0, dim, val);
      acc.add(date, "callrail.leads", lead ? 1 : 0, dim, val);
    }
    const keyword = clean(c.keywords);
    if (keyword) acc.add(date, "callrail.calls", 1, "keyword", keyword);
  }
  return acc.rows();
}

export function formsToRows(forms: CallRailFormSubmission[], opts: { timeZone?: string | null; from: IsoDate; to: IsoDate }): MetricRow[] {
  const acc = new Acc();
  for (const d of eachDay(opts.from, opts.to)) acc.add(d, "callrail.forms", 0);
  const seen = new Set<string>();
  for (const f of forms) {
    if (f.id) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
    }
    const date = localDate(f.submitted_at, opts.timeZone);
    if (!date || date < opts.from || date > opts.to) continue;
    acc.add(date, "callrail.forms", 1);
    acc.add(date, "callrail.forms", 1, "source", clean(f.source) || "(unknown)");
  }
  return acc.rows();
}
