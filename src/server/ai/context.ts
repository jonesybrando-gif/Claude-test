import "server-only";
import type { ClientReport } from "../client-report";
import { buildAiContext } from "@/lib/ai-context";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { formatDate } from "@/lib/time";

/** The grounding text for one client's report, as the page and PDF show it. */
export function contextForReport(rep: ClientReport): string {
  const { client, pacing, perf, cmpPerf, template } = rep;
  const total = pacing.total;
  const metaById = new Map(pacing.accounts.map((a) => [a.id, a]));
  return buildAiContext({
    clientName: client.name,
    currency: client.currency,
    isDemo: client.accounts.some((a) => a.isDemo),
    rangeLabel: PRESET_LABEL[rep.preset],
    range: rep.range,
    comparison: rep.cmpRange,
    kpis: template.kpis,
    totals: perf.totals,
    previous: cmpPerf?.totals ?? null,
    accounts: client.accounts.map((a) => {
      const meta = metaById.get(a.id);
      const dataNote =
        a.status === "NEEDS_REAUTH" || a.status === "DISCONNECTED"
          ? "disconnected; data may be missing"
          : meta?.stale
            ? `stale: last synced ${meta.lastSuccessfulSyncAt ? formatDate(meta.lastSuccessfulSyncAt.slice(0, 10)) : "never"}`
            : null;
      return { platform: PLATFORM_LABEL[a.platform], name: a.name, totals: perf.byAccount[a.id] ?? null, spendVerified: a.spendIsVerified, dataNote };
    }),
    campaigns: client.accounts.flatMap((a) =>
      a.campaigns
        .filter((cmp) => (perf.byCampaign[cmp.id]?.costMinor ?? 0) > 0)
        .map((cmp) => ({ name: cmp.name, platform: PLATFORM_LABEL[a.platform], status: cmp.status, totals: perf.byCampaign[cmp.id], previous: cmpPerf?.byCampaign[cmp.id] ?? null })),
    ),
    pacing: total
      ? {
          periodStart: pacing.period.start,
          periodEnd: pacing.period.end,
          asOf: total.asOf,
          status: total.status,
          forecastStatus: total.forecastStatus,
          budgetMinor: total.budgetMinor,
          actualToDateMinor: total.actualToDateMinor,
          expectedToDateMinor: total.expectedToDateMinor,
          projectedMinor: total.projectedMinor,
          requiredDailyMinor: total.requiredDailyMinor,
          currentDailyRateMinor: total.currentDailyRateMinor,
          remainingActiveDays: total.remainingActiveDays,
          pacingPct: total.pacingPct,
        }
      : null,
    notes: [...new Set([...pacing.rows, ...pacing.subRows].flatMap((r) => r.warnings))],
  });
}
