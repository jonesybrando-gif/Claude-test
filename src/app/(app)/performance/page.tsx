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
import { LabelBadge } from "@/components/label-badge";
import Link from "next/link";
import { ClientPicker } from "./client-picker";

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
    return (
      <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold">Performance</h1>
          <p className="text-sm text-text-2">Choose a client to see its performance summary.</p>
        </div>
        <ClientPicker clients={pickerClients} labels={labels} current={null} />
        <Card>
          <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
            {pickable.map((c) => (
              <li key={c.id}>
                <Link href={`/performance?client=${c.id}&${rangeQuery}`} className="flex h-full flex-col gap-1.5 rounded-lg px-5 py-3 hover:bg-surface-2">
                  <span className="font-medium">{c.name}</span>
                  {c.labels.length > 0 && <span className="flex flex-wrap gap-1">{c.labels.map((l) => <LabelBadge key={l.id} label={l} />)}</span>}
                </Link>
              </li>
            ))}
          </ul>
          {pickable.length === 0 && <CardContent className="py-6 text-sm text-text-3">No clients yet.</CardContent>}
        </Card>
        {pickable.length > 1 && <p className="text-sm text-text-3">Or <Link href={`/performance?client=all&${rangeQuery}`} className="text-brand hover:underline">view all clients combined</Link>.</p>}
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
