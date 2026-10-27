import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { INCLUDED_ROWS } from "./campaign-selection";
import type { ClientPacing, PacingRow } from "./pacing-service";
import { recommendAction } from "@/lib/action-center";
import { comparisonRange, resolveRange, type DateRange } from "@/lib/date-ranges";
import { isoToDate, type IsoDate } from "@/lib/pacing/dates";
import { emptyTotals, reportsLeads, type MetricTotals } from "@/lib/metrics";
import { resolveGoal, resultsFor } from "@/lib/results";
import {
  attentionReasons,
  CRITICAL_ALERT_TYPES,
  costPerResultHigh,
  medianCostPerResult,
  type AttentionReason,
  type ClientResults,
  type PeriodResults,
} from "@/lib/portfolio";

export interface PortfolioResults {
  range: DateRange;
  /** Null when there is nothing to compare with. */
  previousRange: DateRange | null;
  byClient: Map<string, ClientResults>;
  /** Currency used for the agency totals: the one most clients report in. */
  currency: string;
  currencies: string[];
  /** Clients left out of the totals because they report in another currency. */
  otherCurrencyClients: number;
  totals: { current: PeriodResults; previous: PeriodResults };
}


/**
 * Spend and results for the last 30 complete days and the 30 before, per
 * client and in total.
 */
export async function portfolioResults(where: Prisma.ClientWhereInput, today: IsoDate): Promise<PortfolioResults> {
  const range = resolveRange("last_30", today);
  return portfolioResultsFor(where, range, comparisonRange(range, "previous_period")!);
}

/**
 * The same figures for any range and comparison range (the Clients table uses
 * the range picked on the page). With no comparison, `previous` stays at zero.
 *
 * Results follow each client's goal with `resultsFor`, exactly as on the client's
 * own page: leads, calls, sales or bookings from the ad platforms (each counted
 * once), or clicks for awareness clients. Agency totals leave awareness clients'
 * clicks out of "results" when other goals are present (their spend still counts).
 */
export async function portfolioResultsFor(where: Prisma.ClientWhereInput, range: DateRange, previousRange: DateRange | null): Promise<PortfolioResults> {
  const clients = await prisma.client.findMany({ where, select: { id: true, currency: true, goal: true, accounts: { select: { id: true, platform: true } } } });
  const accountInfo = new Map(clients.flatMap((c) => c.accounts.map((a) => [a.id, { clientId: c.id, platform: a.platform }] as const)));
  const sum = (r: DateRange) =>
    accountInfo.size
      ? prisma.dailyPerformance.groupBy({
          by: ["accountId"],
          where: { accountId: { in: [...accountInfo.keys()] }, date: { gte: isoToDate(r.from), lte: isoToDate(r.to) }, ...INCLUDED_ROWS },
          _sum: { costMinor: true, impressions: true, clicks: true, conversions: true, conversionValueMinor: true, leads: true },
        })
      : Promise.resolve([]);
  const [cur, prev] = await Promise.all([sum(range), previousRange ? sum(previousRange) : Promise.resolve([])]);

  // One MetricTotals line per ad account, so leads and conversions combine per platform without double counting.
  const linesFor = (rows: Awaited<ReturnType<typeof sum>>) => {
    const out = new Map<string, MetricTotals[]>();
    for (const s of rows) {
      const a = accountInfo.get(s.accountId)!;
      out.set(a.clientId, [
        ...(out.get(a.clientId) ?? []),
        {
          ...emptyTotals(),
          costMinor: Number(s._sum.costMinor ?? 0),
          impressions: Number(s._sum.impressions ?? 0),
          clicks: Number(s._sum.clicks ?? 0),
          conversions: Number(s._sum.conversions ?? 0),
          conversionValueMinor: Number(s._sum.conversionValueMinor ?? 0),
          leads: Number(s._sum.leads ?? 0),
          leadsReported: reportsLeads(a.platform),
        },
      ]);
    }
    return out;
  };
  const curLines = linesFor(cur);
  const prevLines = linesFor(prev);

  const byClient = new Map<string, ClientResults>();
  for (const c of clients) {
    const now = curLines.get(c.id) ?? [];
    const before = prevLines.get(c.id) ?? [];
    const { goal, guessed } = resolveGoal(c.goal, now, before);
    const a = resultsFor(goal, now, guessed);
    const b = resultsFor(goal, before, guessed);
    byClient.set(c.id, {
      clientId: c.id,
      currency: c.currency,
      goal,
      unit: a.singular,
      current: { spendMinor: a.costMinor, results: a.value },
      previous: { spendMinor: b.costMinor, results: b.value },
    });
  }

  // Never add amounts in different currencies: total the most common one and say what was left out.
  const counts = new Map<string, number>();
  for (const c of clients) counts.set(c.currency, (counts.get(c.currency) ?? 0) + 1);
  const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const same = [...byClient.values()].filter((c) => c.currency === currency);
  const mixedGoals = new Set(same.map((c) => c.goal)).size > 1;
  const totals = { current: { spendMinor: 0, results: 0, resultSpendMinor: 0 }, previous: { spendMinor: 0, results: 0, resultSpendMinor: 0 } };
  for (const c of same) {
    const countsResults = !(mixedGoals && c.goal === "AWARENESS");
    for (const k of ["current", "previous"] as const) {
      totals[k].spendMinor += c[k].spendMinor;
      if (countsResults) {
        totals[k].results += c[k].results;
        totals[k].resultSpendMinor += c[k].spendMinor;
      }
    }
  }
  return {
    range,
    previousRange,
    byClient,
    currency,
    currencies: [...counts.keys()],
    otherCurrencyClients: clients.filter((c) => c.currency !== currency).length,
    totals,
  };
}

/** Clients whose cost per result is high enough that underspend advice should say "fix efficiency first". */
export function highCostPerResultClients(results: PortfolioResults): Set<string> {
  const all = [...results.byClient.values()];
  const medians = medianCostPerResult(all);
  return new Set(all.filter((c) => costPerResultHigh(c, medians)).map((c) => c.clientId));
}

/**
 * Re-words the recommendation on underspending lines of clients with a high
 * cost per result (H6). Pacing figures are unchanged; only `action` is.
 */
export function applyEfficiencyAdvice(pacing: ClientPacing[], highCpr: Set<string>): void {
  if (!highCpr.size) return;
  const redo = (r: PacingRow) => {
    if (!r.result || r.notConnected || !highCpr.has(r.clientId)) return;
    r.action = recommendAction({ ...r.result, currency: r.currency, stale: r.stale, disconnected: r.disconnected, costPerResultHigh: true });
  };
  for (const c of pacing) {
    c.rows.forEach(redo);
    c.subRows.forEach(redo);
  }
}

/**
 * Open, unacknowledged, un-snoozed alerts per client, split into the types that
 * make a client Critical and other critical-severity alerts (Watch).
 */
async function openAlertsByClient(clientIds: string[], now: Date): Promise<Map<string, { critical: number; other: number }>> {
  if (!clientIds.length) return new Map();
  const rows = await prisma.alert.groupBy({
    by: ["clientId", "type", "severity"],
    where: { clientId: { in: clientIds }, status: "OPEN", OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
    _count: { _all: true },
  });
  const critical = new Set<string>(CRITICAL_ALERT_TYPES);
  const out = new Map<string, { critical: number; other: number }>();
  for (const r of rows) {
    const id = r.clientId ?? "";
    const c = out.get(id) ?? { critical: 0, other: 0 };
    if (critical.has(r.type)) c.critical += r._count._all;
    else if (r.severity === "critical") c.other += r._count._all;
    out.set(id, c);
  }
  return out;
}

/**
 * "Needs attention" reasons for every client in `pacing`, shared by Home and
 * Clients › Performance so both pages agree on who needs attention and why.
 */
export async function clientAttention(pacing: ClientPacing[], results: PortfolioResults, now: Date = new Date()): Promise<Map<string, AttentionReason[]>> {
  const alerts = await openAlertsByClient(pacing.map((p) => p.client.id), now);
  const out = new Map<string, AttentionReason[]>();
  for (const p of pacing) {
    const live = p.accounts.filter((a) => !a.isDemo);
    const synced = live.filter((a) => a.status === "ACTIVE" && a.lastSuccessfulSyncAt);
    const oldest = synced.map((a) => a.lastSuccessfulSyncAt!).sort()[0];
    out.set(
      p.client.id,
      attentionReasons({
        currency: p.client.currency,
        openCriticalAlerts: alerts.get(p.client.id)?.critical ?? 0,
        openOtherAlerts: alerts.get(p.client.id)?.other ?? 0,
        lines: p.rows
          .filter((r) => !r.notConnected && r.result)
          .map((r) => ({
            phase: r.result!.phase,
            budgetMinor: r.result!.budgetMinor,
            projectedVarianceMinor: r.result!.projectedVarianceMinor,
            currency: r.currency,
            status: r.result!.status,
            forecastStatus: r.result!.forecastStatus,
            actualToDateMinor: r.result!.actualToDateMinor,
          })),
        results: results.byClient.get(p.client.id) ?? null,
        oldestSyncHours: oldest ? (now.getTime() - new Date(oldest).getTime()) / 3_600_000 : null,
        disconnected: live.some((a) => a.status === "DISCONNECTED" || a.status === "NEEDS_REAUTH"),
      }),
    );
  }
  return out;
}
