import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { SessionUser } from "@/lib/access";
import { visibleClientsWhere } from "@/server/access";
import { getAgencyPerformance } from "@/server/performance";
import type { DateRange } from "@/lib/date-ranges";
import { dailyKpiValue, DEFAULT_KPIS, kpiValues, type KpiKey } from "@/lib/kpis";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/platforms";
import { emptyTotals } from "@/lib/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Banner } from "@/components/ui/banner";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiTable } from "@/components/kpi/kpi-table";
import { TrendChart } from "@/components/charts/trend-chart";

const TABLE_KPIS: KpiKey[] = ["spend", "impressions", "clicks", "ctr", "cpc", "conversions", "conversionRate", "costPerConversion", "leads", "costPerLead", "roas"];

/**
 * Clients › Performance › All clients combined: every advertising metric
 * added up across clients, a daily trend, and the same figures by platform
 * and by client — the detailed agency report behind the one-line table.
 */
export async function CombinedView({ user, range, cmpRange, rangeQuery }: { user: SessionUser; range: DateRange; cmpRange: DateRange | null; rangeQuery: string }) {
  const where = visibleClientsWhere(user);
  const [cur, prev] = await Promise.all([getAgencyPerformance(where, range), cmpRange ? getAgencyPerformance(where, cmpRange) : Promise.resolve(null)]);
  const currency = cur.currencies[0] ?? "USD";
  const kvs = kpiValues(DEFAULT_KPIS, cur.totals, prev?.totals ?? null);
  const trendFor = (k: KpiKey) => cur.byDate.map((d) => dailyKpiValue(d, k));
  const prevByClient = new Map(prev?.byClient.map((c) => [c.clientId, c.totals]) ?? []);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/clients?${rangeQuery}`} className="-mt-2 inline-flex w-fit items-center gap-1 text-sm text-text-2 hover:text-text">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Back to the client list
      </Link>
      {cur.currencies.length > 1 && <Banner tone="warning">Accounts use more than one currency ({cur.currencies.join(", ")}). These totals add amounts without conversion.</Banner>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kvs.map((kv) => <KpiCard key={kv.key} kv={kv} currency={currency} trend={trendFor(kv.key)} />)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily trend · all clients</CardTitle>
          {cmpRange && <CardDescription>The dashed line is the comparison period, aligned day by day.</CardDescription>}
        </CardHeader>
        <CardContent><TrendChart current={cur.byDate} comparison={prev?.byDate ?? null} currency={currency} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By platform</CardTitle>
          <CardDescription>Each platform counts and attributes conversions its own way.</CardDescription>
        </CardHeader>
        <KpiTable
          firstHeader="Platform"
          currency={currency}
          kpis={TABLE_KPIS}
          showChange={["spend", "cpc", "conversions", "costPerConversion"]}
          rows={PLATFORMS.filter((p) => cur.byPlatform[p]).map((p) => ({ id: p, label: PLATFORM_LABEL[p], totals: cur.byPlatform[p]!, previous: prev?.byPlatform[p] ?? emptyTotals(), badge: cur.byPlatform[p]!.hasEstimatedCost ? "spend estimated" : undefined }))}
        />
        <div className="h-3" />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By client</CardTitle>
          <CardDescription>Click a column to sort. Changes compare with the comparison period.</CardDescription>
        </CardHeader>
        <KpiTable
          firstHeader="Client"
          currency={currency}
          kpis={TABLE_KPIS}
          showChange={["spend", "cpc", "conversions", "costPerConversion", "costPerLead"]}
          rows={cur.byClient.map((c) => ({
            id: c.clientId,
            label: c.clientName,
            href: `/clients/${c.clientId}?${rangeQuery}`,
            sub: c.platforms.map((p) => PLATFORM_LABEL[p]).join(", ") || "No accounts",
            totals: c.totals,
            previous: prevByClient.get(c.clientId) ?? null,
          }))}
        />
        <div className="h-3" />
      </Card>
    </div>
  );
}
