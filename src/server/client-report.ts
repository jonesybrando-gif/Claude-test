import "server-only";
import { prisma } from "./db";
import { loadPacing } from "./pacing-service";
import { getClientPerformance } from "./reporting";
import { getClientTemplate } from "./report-templates";
import { comparisonRange, resolveRange, type CompareMode, type RangePreset } from "@/lib/date-ranges";
import { addDays, dateToIso, isoToDate, maxDate, minDate, monthBounds, todayInTimeZone } from "@/lib/pacing/dates";

const PRESETS: RangePreset[] = ["mtd", "last_month", "last_7", "last_30", "last_90", "custom"];
const COMPARE: CompareMode[] = ["previous_period", "previous_month", "none"];

export interface ChartNoteInfo {
  id: string;
  date: string;
  text: string;
  clientVisible: boolean;
  authorId: string | null;
  taggedUserId: string | null;
}

export interface ReportParams {
  range?: string;
  compare?: string;
  from?: string;
  to?: string;
}

/** Client, template and the resolved date ranges: cheap, and needed by everything else. */
async function loadReportBase(clientId: string, params: ReportParams, now: Date) {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: { accounts: { include: { campaigns: { where: { excludedAt: null } }, syncRuns: { orderBy: { startedAt: "desc" }, take: 1 } }, orderBy: { platform: "asc" } } },
  });
  const today = todayInTimeZone(client.timezone, now);
  const { template, custom: hasCustomTemplate } = await getClientTemplate(client.agencyId, clientId);
  // The template sets the default range and comparison; the URL can override both.
  const preset: RangePreset = PRESETS.includes(params.range as RangePreset) ? (params.range as RangePreset) : template.defaultRange;
  const compareMode: CompareMode = COMPARE.includes(params.compare as CompareMode) ? (params.compare as CompareMode) : template.compare;
  let range;
  try {
    range = resolveRange(preset, today, { from: params.from, to: params.to });
  } catch {
    range = resolveRange(template.defaultRange, today);
  }
  const cmpRange = comparisonRange(range, compareMode);
  return { client, today, preset, compareMode, range, cmpRange, template, hasCustomTemplate };
}

type ReportBase = Awaited<ReturnType<typeof loadReportBase>>;

/** The data-heavy part: performance for the range and comparison, budget history and chart notes. */
async function loadReportDetail(base: ReportBase, now: Date) {
  const { client, today, range, cmpRange } = base;
  const clientId = client.id;
  // The three previous months for budget history.
  const historyDates = [1, 2, 3].map((n) => {
    let d = monthBounds(today).start;
    for (let i = 0; i < n; i++) d = monthBounds(addDays(d, -1)).start;
    return d;
  });
  const month = monthBounds(today);
  const [history, perf, cmpPerf, noteRows] = await Promise.all([
    Promise.all(historyDates.map((d) => loadPacing({ id: clientId }, now, d).then((r) => r[0]))),
    getClientPerformance(clientId, range),
    cmpRange ? getClientPerformance(clientId, cmpRange) : Promise.resolve(null),
    // Chart notes for the report range and the current budget period.
    prisma.chartNote.findMany({
      where: { clientId, date: { gte: isoToDate(minDate(range.from, month.start)), lte: isoToDate(maxDate(range.to, month.end)) } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const notes: ChartNoteInfo[] = noteRows.map((n) => ({ id: n.id, date: dateToIso(n.date), text: n.text, clientVisible: n.clientVisible, authorId: n.authorId, taggedUserId: n.taggedUserId }));
  return { history, perf, cmpPerf, notes };
}

/**
 * Everything a client report needs, shared by the client page, the PDF and
 * the CSV export so they always show identical numbers. Callers must check
 * that the user may view the client first.
 */
export async function loadClientReport(clientId: string, params: ReportParams, now: Date = new Date()) {
  const base = await loadReportBase(clientId, params, now);
  const [[pacing], detail] = await Promise.all([loadPacing({ id: clientId }, now), loadReportDetail(base, now)]);
  return { ...base, pacing, ...detail };
}

/**
 * The quick part of a client report (client, template, ranges and current
 * pacing): enough for the client page header, so the page can stream while
 * `completeClientReport` loads the rest. Same access rule as loadClientReport.
 */
export async function loadClientReportHead(clientId: string, params: ReportParams, now: Date = new Date()) {
  const base = await loadReportBase(clientId, params, now);
  const [pacing] = await loadPacing({ id: clientId }, now);
  return { ...base, pacing };
}

export type ClientReportHead = Awaited<ReturnType<typeof loadClientReportHead>>;

/** Loads the rest of a report started with loadClientReportHead (pass the same `now`). */
export async function completeClientReport(head: ClientReportHead, now: Date): Promise<ClientReport> {
  return { ...head, ...(await loadReportDetail(head, now)) };
}

export type ClientReport = Awaited<ReturnType<typeof loadClientReport>>;
