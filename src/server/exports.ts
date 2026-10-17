import "server-only";
import { prisma } from "./db";
import { loadPacing } from "./pacing-service";
import type { DateRange } from "@/lib/date-ranges";
import { isoToDate, dateToIso } from "@/lib/pacing/dates";
import { derive } from "@/lib/metrics";
import { minorToDecimal, round, toCsv, type Cell } from "@/lib/csv";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { STATUS_LABEL } from "@/lib/pacing/status";
import type { Prisma } from "@prisma/client";

/** One row per date × account × campaign (leaf rows as stored), for a client and range. */
export async function clientDailyCsv(clientId: string, range: DateRange): Promise<string> {
  const rows = await prisma.dailyPerformance.findMany({
    where: { account: { clientId }, date: { gte: isoToDate(range.from), lte: isoToDate(range.to) } },
    include: { account: { select: { name: true, platform: true, externalId: true, client: { select: { name: true } } } }, campaign: { select: { name: true, externalId: true } } },
    orderBy: [{ date: "asc" }, { accountId: "asc" }, { campaignId: "asc" }],
  });
  const header = [
    "Date", "Client", "Platform", "Account", "Account ID", "Campaign", "Campaign ID", "Currency",
    "Spend", "Spend is estimated", "Impressions", "Clicks", "CTR %", "CPC",
    "Conversions (platform-reported)", "Conversion value", "Cost per conversion", "Leads", "ROAS", "Demo data",
  ];
  const body: Cell[][] = rows.map((r) => {
    const t = {
      costMinor: Number(r.costMinor),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      conversions: Number(r.conversions),
      conversionValueMinor: Number(r.conversionValueMinor),
      leads: r.leads === null ? 0 : Number(r.leads),
      hasEstimatedCost: r.costIsEstimated,
    };
    const d = derive(t);
    return [
      dateToIso(r.date), r.account.client.name, PLATFORM_LABEL[r.account.platform], r.account.name, r.account.externalId,
      r.campaign?.name ?? "", r.campaign?.externalId ?? "", r.currency,
      minorToDecimal(t.costMinor), r.costIsEstimated, t.impressions, t.clicks, round(d.ctr), minorToDecimal(d.cpcMinor === null ? null : Math.round(d.cpcMinor)),
      round(t.conversions), minorToDecimal(t.conversionValueMinor), minorToDecimal(d.costPerConversionMinor === null ? null : Math.round(d.costPerConversionMinor)),
      r.leads === null ? null : round(t.leads), round(d.roas), r.isDemo,
    ];
  });
  return toCsv(header, body);
}

/** Every budget line on the agency dashboard with its pacing figures. */
export async function agencyPacingCsv(where: Prisma.ClientWhereInput): Promise<string> {
  const clients = await loadPacing(where);
  const header = [
    "Client", "Account manager", "Budget line", "Level", "Platforms", "Currency", "Period start", "Period end", "Data complete through",
    "Monthly budget", "Spend to date", "Expected to date", "Pacing % (actual ÷ expected)", "Budget used %", "Period elapsed %",
    "Remaining budget", "Projected month-end", "Projected variance", "Required daily spend", "Current daily rate (7-day)",
    "Status", "Forecast status", "Recommendation", "Last successful sync", "Stale data", "Disconnected", "Includes estimated spend", "Demo data", "Data notes",
  ];
  const body: Cell[][] = clients.flatMap((c) =>
    c.rows.map((r) => {
      const res = r.result;
      return [
        r.clientName, r.managerName ?? "", r.level === "CLIENT" ? "Combined client budget" : r.label, r.level.toLowerCase(), r.platforms.map((p) => PLATFORM_LABEL[p]).join(" + "), r.currency,
        res?.periodStart ?? c.period.start, res?.periodEnd ?? c.period.end, res?.asOf ?? "",
        minorToDecimal(res?.budgetMinor), minorToDecimal(res?.actualToDateMinor ?? r.unbudgetedSpendMinor), minorToDecimal(res?.expectedToDateMinor),
        round(res?.pacingPct), round(res?.pctBudgetConsumed), round(res?.pctPeriodElapsed),
        minorToDecimal(res?.remainingBudgetMinor), minorToDecimal(res?.projectedMinor), minorToDecimal(res?.projectedVarianceMinor),
        minorToDecimal(res?.requiredDailyMinor), minorToDecimal(res?.currentDailyRateMinor),
        res ? STATUS_LABEL[res.status] : "No budget", res ? STATUS_LABEL[res.forecastStatus] : "", `${r.action.headline}. ${r.action.detail}`,
        r.lastSuccessfulSyncAt ?? "", r.stale, r.disconnected, r.hasEstimatedSpend, r.isDemo, r.warnings.join(" | "),
      ];
    }),
  );
  return toCsv(header, body);
}
