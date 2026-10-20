import "server-only";
import { prisma } from "./db";
import { loadPacing } from "./pacing-service";
import { getClientPerformance } from "./reporting";
import { getClientTemplate } from "./report-templates";
import { comparisonRange, resolveRange, type CompareMode, type RangePreset } from "@/lib/date-ranges";
import { addDays, monthBounds, todayInTimeZone } from "@/lib/pacing/dates";

const PRESETS: RangePreset[] = ["mtd", "last_month", "last_7", "last_30", "last_90", "custom"];
const COMPARE: CompareMode[] = ["previous_period", "previous_month", "none"];

export interface ReportParams {
  range?: string;
  compare?: string;
  from?: string;
  to?: string;
}

/**
 * Everything a client report needs, shared by the client page, the PDF and
 * the CSV export so they always show identical numbers. Callers must check
 * that the user may view the client first.
 */
export async function loadClientReport(clientId: string, params: ReportParams, now: Date = new Date()) {
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

  // Current pacing, plus the three previous months for budget history.
  const historyDates = [1, 2, 3].map((n) => {
    let d = monthBounds(today).start;
    for (let i = 0; i < n; i++) d = monthBounds(addDays(d, -1)).start;
    return d;
  });
  const [[pacing], history, perf, cmpPerf] = await Promise.all([
    loadPacing({ id: clientId }, now),
    Promise.all(historyDates.map((d) => loadPacing({ id: clientId }, now, d).then((r) => r[0]))),
    getClientPerformance(clientId, range),
    cmpRange ? getClientPerformance(clientId, cmpRange) : Promise.resolve(null),
  ]);
  return { client, today, preset, compareMode, range, cmpRange, pacing, history, perf, cmpPerf, template, hasCustomTemplate };
}

export type ClientReport = Awaited<ReturnType<typeof loadClientReport>>;
