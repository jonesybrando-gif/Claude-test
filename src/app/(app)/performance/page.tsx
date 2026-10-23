import { prisma } from "@/server/db";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { getAgencyPerformance } from "@/server/performance";
import { comparisonRange, resolveRange, PRESET_LABEL, type CompareMode, type RangePreset } from "@/lib/date-ranges";
import { todayInTimeZone } from "@/lib/pacing/dates";
import { dailyKpiValue, DEFAULT_KPIS, kpiValues, type KpiKey } from "@/lib/kpis";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/platforms";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiTable } from "@/components/kpi/kpi-table";
import { TrendChart } from "@/components/charts/trend-chart";
import { RangeControls } from "@/components/range-controls";
import { DemoBadge } from "@/components/status-badge";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { loadPacing } from "@/server/pacing-service";
import { derive, emptyTotals, pctChange } from "@/lib/metrics";
import { ClientPicker } from "./client-picker";
import { PortfolioTable, type PortfolioRow } from "./portfolio-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performance" };

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
  const visible = visibleClientsWhere(user);
  const [pickable, labels] = await Promise.all([
    prisma.client.findMany({ where: visible, select: { id: true, name: true, labels: { select: { id: true, name: true, color: true } } }, orderBy: { name: "asc" } }),
    prisma.clientLabel.findMany({ where: { agencyId: user.agencyId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
  ]);
  const pickerClients = pickable.map((c) => ({ id: c.id, name: c.name, labelIds: c.labels.map((l) => l.id) }));
  // A client must be chosen; "all" is an explicit choice, never the default.
  const chosen = sp.client === "all" ? "all" : pickable.find((c) => c.id === sp.client)?.id ?? null;
  const rangeQuery = `range=${preset}&compare=${compareMode}${preset === "custom" ? `&from=${range.from}&to=${range.to}` : ""}`;

  if (!chosen) {
    // Portfolio: every client with spend, results, pacing and a trend.
    const [cur, prev, pacing] = await Promise.all([
      getAgencyPerformance(visible, range),
      cmpRange ? getAgencyPerformance(visible, cmpRange) : Promise.resolve(null),
      loadPacing(visible),
    ]);
    const prevBy = new Map(prev?.byClient.map((c) => [c.clientId, c.totals]) ?? []);
    const pacingBy = new Map(pacing.map((p) => [p.client.id, p]));
    const labelsBy = new Map(pickable.map((c) => [c.id, c.labels]));
    const change = (a: number, b: number | undefined) => (b === undefined ? null : pctChange(a, b));
    const rows: PortfolioRow[] = cur.byClient.map((c) => {
      const p = pacingBy.get(c.clientId);
      const live = p?.accounts.filter((a) => !a.isDemo || a.lastSuccessfulSyncAt) ?? [];
      const syncs = live.map((a) => a.lastSuccessfulSyncAt).filter((x): x is string => !!x).sort();
      const connected = p?.rows.filter((r) => !r.notConnected) ?? [];
      const before = prevBy.get(c.clientId);
      return {
        id: c.clientId,
        name: c.clientName,
        href: `/clients/${c.clientId}?${rangeQuery}`,
        labels: labelsBy.get(c.clientId) ?? [],
        owner: c.managerName,
        platforms: c.platforms,
        currency: p?.client.currency ?? "USD",
        spendMinor: c.totals.costMinor,
        spendChangePct: change(c.totals.costMinor, before?.costMinor),
        conversions: c.totals.conversions,
        conversionsChangePct: change(c.totals.conversions, before?.conversions),
        costPerConversionMinor: derive(c.totals).costPerConversionMinor,
        pacing: !p || (p.rows.length > 0 && connected.length === 0) || p.accounts.length === 0 ? "NOT_CONNECTED" : p.connectedTotal ? p.connectedTotal.status : "NO_BUDGET",
        attention: connected.some((r) => r.attention),
        dailySpend: c.dailySpend,
        lastSyncAt: syncs[0] ?? null,
        stale: live.some((a) => a.stale),
        isDemo: c.isDemo,
      };
    });
    return (
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Performance</h1>
            <p className="text-sm text-text-2">
              All clients · {PRESET_LABEL[preset]}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
              {cmpRange && <> · compared with {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
            </p>
          </div>
          <RangeControls preset={preset} compare={compareMode} from={range.from} to={range.to} />
        </div>
        {cur.currencies.length > 1 && (
          <p className="rounded-lg border border-border bg-warning-bg px-3 py-2 text-sm text-warning-ink">Accounts use more than one currency ({cur.currencies.join(", ")}). Each client is shown in its own currency.</p>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Portfolio</CardTitle>
            <CardDescription>Click a column to sort; click a row to open the client.</CardDescription>
          </CardHeader>
          {pickable.length === 0 ? (
            <CardContent className="text-sm text-text-3">No clients yet. <Link href="/clients" className="text-brand hover:underline">Add your first client</Link>.</CardContent>
          ) : (
            <PortfolioTable rows={rows} labels={labels} rangeQuery={rangeQuery} periodLabel={PRESET_LABEL[preset]} />
          )}
        </Card>
      </div>
    );
  }

  const where = chosen === "all" ? visible : { ...visible, id: chosen };
  const chosenName = chosen === "all" ? "All clients" : pickable.find((c) => c.id === chosen)!.name;
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
          <Link href={`/performance?${rangeQuery}`} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" aria-hidden /> Portfolio</Link>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Performance · {chosenName}</h1>
            {isDemo && <DemoBadge />}
          </div>
          <p className="text-sm text-text-2">
            {chosenName}, all platforms · {PRESET_LABEL[preset]}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
            {cmpRange && <> · compared with {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ClientPicker clients={pickerClients} labels={labels} current={chosen} />
          <RangeControls preset={preset} compare={compareMode} from={range.from} to={range.to} />
          {chosen !== "all" && <Link href={`/clients/${chosen}?${rangeQuery}`} className="text-sm text-brand hover:underline">Full client report</Link>}
        </div>
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
          <CardDescription>{chosen === "all" ? "All clients combined" : chosenName}{cmpRange ? "; the dashed line is the comparison period, aligned day by day" : ""}.</CardDescription>
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

      {chosen === "all" && <Card>
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
      </Card>}
    </div>
  );
}
