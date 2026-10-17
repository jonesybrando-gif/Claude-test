import { prisma } from "@/server/db";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { getAgencyPerformance } from "@/server/performance";
import { comparisonRange, resolveRange, PRESET_LABEL, type CompareMode, type RangePreset } from "@/lib/date-ranges";
import { todayInTimeZone } from "@/lib/pacing/dates";
import { dailyKpiValue, DEFAULT_KPIS, kpiValues, type KpiKey } from "@/lib/kpis";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/platforms";
import { formatDate } from "@/lib/time";
import { emptyTotals } from "@/lib/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiTable } from "@/components/kpi/kpi-table";
import { TrendChart } from "@/components/charts/trend-chart";
import { RangeControls } from "@/components/range-controls";
import { DemoBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

const PRESETS: RangePreset[] = ["mtd", "last_month", "last_7", "last_30", "last_90", "custom"];
const TABLE_KPIS: KpiKey[] = ["spend", "impressions", "clicks", "ctr", "cpc", "conversions", "conversionRate", "costPerConversion", "leads", "costPerLead", "roas"];

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAgencyStaff();
  const sp = await searchParams;
  const agency = await prisma.agency.findUniqueOrThrow({ where: { id: user.agencyId }, select: { defaultTimezone: true } });
  const today = todayInTimeZone(agency.defaultTimezone);
  const preset: RangePreset = PRESETS.includes(sp.range as RangePreset) ? (sp.range as RangePreset) : "last_30";
  const compareMode: CompareMode = (["previous_period", "previous_month", "none"] as const).includes(sp.compare as CompareMode) ? (sp.compare as CompareMode) : "previous_period";
  let range;
  try {
    range = resolveRange(preset, today, { from: sp.from, to: sp.to });
  } catch {
    range = resolveRange("last_30", today);
  }
  const cmpRange = comparisonRange(range, compareMode);
  const where = visibleClientsWhere(user);
  const [cur, prev] = await Promise.all([getAgencyPerformance(where, range), cmpRange ? getAgencyPerformance(where, cmpRange) : Promise.resolve(null)]);
  const currency = cur.currencies[0] ?? "USD";
  const kvs = kpiValues(DEFAULT_KPIS, cur.totals, prev?.totals ?? null);
  const trendFor = (k: KpiKey) => cur.byDate.map((d) => dailyKpiValue(d, k));
  const prevByClient = new Map(prev?.byClient.map((c) => [c.clientId, c.totals]) ?? []);
  const isDemo = cur.byClient.some((c) => c.isDemo);

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Performance</h1>
            {isDemo && <DemoBadge />}
          </div>
          <p className="text-sm text-text-2">
            All clients, all platforms · {PRESET_LABEL[preset]}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
            {cmpRange && <> · compared with {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
          </p>
        </div>
        <RangeControls preset={preset} compare={compareMode} from={range.from} to={range.to} />
      </div>
      {cur.currencies.length > 1 && (
        <p className="rounded-lg border border-border bg-warning-bg px-3 py-2 text-sm text-warning-ink">Accounts use more than one currency ({cur.currencies.join(", ")}). Totals add amounts without conversion.</p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kvs.map((kv) => <KpiCard key={kv.key} kv={kv} currency={currency} trend={trendFor(kv.key)} />)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily trends</CardTitle>
          <CardDescription>All clients combined{cmpRange ? "; the dashed line is the comparison period, aligned day by day" : ""}.</CardDescription>
        </CardHeader>
        <CardContent><TrendChart current={cur.byDate} comparison={prev?.byDate ?? null} currency={currency} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By platform</CardTitle>
          <CardDescription>Conversions are platform-reported; each platform defines and attributes them differently.</CardDescription>
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
            href: `/clients/${c.clientId}?range=${preset}&compare=${compareMode}${preset === "custom" ? `&from=${range.from}&to=${range.to}` : ""}`,
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
