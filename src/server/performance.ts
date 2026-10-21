import "server-only";
import type { Platform, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { INCLUDED_ROWS } from "./campaign-selection";
import { addInto, emptyTotals, reportsLeads, type MetricTotals } from "@/lib/metrics";
import { dateToIso, eachDay, isoToDate, type IsoDate } from "@/lib/pacing/dates";
import type { DateRange } from "@/lib/date-ranges";

export interface ClientKpiRow {
  clientId: string;
  clientName: string;
  managerName: string | null;
  platforms: Platform[];
  totals: MetricTotals;
  isDemo: boolean;
}

export interface AgencyPerformance {
  range: DateRange;
  totals: MetricTotals;
  byDate: ({ date: IsoDate } & MetricTotals)[];
  byPlatform: Partial<Record<Platform, MetricTotals>>;
  byClient: ClientKpiRow[];
  /** Daily spend per client, one value per day of the range (for sparklines). */
  dailySpendByClient: Record<string, number[]>;
  currencies: string[];
}

/**
 * KPI totals across every client matching `where`, summed in the database by
 * account and day (so cost stays fast with hundreds of accounts).
 */
export async function getAgencyPerformance(where: Prisma.ClientWhereInput, range: DateRange): Promise<AgencyPerformance> {
  const clients = await prisma.client.findMany({
    where,
    select: { id: true, name: true, primaryManager: { select: { name: true } }, accounts: { select: { id: true, platform: true, currency: true, spendIsVerified: true, isDemo: true } } },
    orderBy: { name: "asc" },
  });
  const accountInfo = new Map(clients.flatMap((c) => c.accounts.map((a) => [a.id, { ...a, clientId: c.id }] as const)));
  const sums = accountInfo.size
    ? await prisma.dailyPerformance.groupBy({
        by: ["accountId", "date"],
        where: { accountId: { in: [...accountInfo.keys()] }, date: { gte: isoToDate(range.from), lte: isoToDate(range.to) }, ...INCLUDED_ROWS },
        _sum: { costMinor: true, impressions: true, clicks: true, conversions: true, conversionValueMinor: true, leads: true },
      })
    : [];

  const totals = emptyTotals();
  const byDate = new Map<IsoDate, MetricTotals>(eachDay(range.from, range.to).map((d) => [d, emptyTotals()]));
  const byPlatform: Partial<Record<Platform, MetricTotals>> = {};
  const byClientTotals = new Map<string, MetricTotals>();
  const days = eachDay(range.from, range.to);
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const dailySpendByClient: Record<string, number[]> = Object.fromEntries(clients.map((c) => [c.id, days.map(() => 0)]));
  for (const s of sums) {
    const a = accountInfo.get(s.accountId)!;
    const m = {
      costMinor: Number(s._sum.costMinor ?? 0),
      impressions: Number(s._sum.impressions ?? 0),
      clicks: Number(s._sum.clicks ?? 0),
      conversions: Number(s._sum.conversions ?? 0),
      conversionValueMinor: Number(s._sum.conversionValueMinor ?? 0),
      leads: Number(s._sum.leads ?? 0),
      hasEstimatedCost: !a.spendIsVerified,
      leadsReported: reportsLeads(a.platform),
    };
    addInto(totals, m);
    addInto(byDate.get(dateToIso(s.date))!, m);
    addInto((byPlatform[a.platform] ??= emptyTotals()), m);
    addInto(byClientTotals.get(a.clientId) ?? (byClientTotals.set(a.clientId, emptyTotals()), byClientTotals.get(a.clientId)!), m);
    const di = dayIndex.get(dateToIso(s.date));
    if (di !== undefined) dailySpendByClient[a.clientId][di] += m.costMinor;
  }
  return {
    range,
    totals,
    byDate: [...byDate.entries()].map(([date, t]) => ({ date, ...t })),
    byPlatform,
    byClient: clients.map((c) => ({
      clientId: c.id,
      clientName: c.name,
      managerName: c.primaryManager?.name ?? null,
      platforms: [...new Set(c.accounts.map((a) => a.platform))],
      totals: byClientTotals.get(c.id) ?? emptyTotals(),
      isDemo: c.accounts.some((a) => a.isDemo),
    })),
    dailySpendByClient,
    currencies: [...new Set(clients.flatMap((c) => c.accounts.map((a) => a.currency)))],
  };
}
