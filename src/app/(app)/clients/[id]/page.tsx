import Link from "next/link";
import { AlertTriangle, Settings2 } from "lucide-react";
import { prisma } from "@/server/db";
import { requireClientView } from "@/server/access";
import { loadPacing, type PacingRow } from "@/server/pacing-service";
import { getClientPerformance } from "@/server/reporting";
import { comparisonRange, resolveRange, PRESET_LABEL, type CompareMode, type RangePreset } from "@/lib/date-ranges";
import { addDays, monthBounds, todayInTimeZone } from "@/lib/pacing/dates";
import { derive, pctChange, type MetricTotals } from "@/lib/metrics";
import { formatMoney, formatNumber, formatPct } from "@/lib/money";
import { formatDate, relativeTime } from "@/lib/time";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { formatCustomerId } from "@/server/integrations/google-ads/gaql";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { StatTile } from "@/components/stat-tile";
import { DemoBadge, NoBudgetBadge, StaleBadge, StatusBadge } from "@/components/status-badge";
import { PlatformLabel } from "@/components/platform-badge";
import { PacingChart } from "@/components/charts/pacing-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { RangeControls } from "@/components/range-controls";
import { RefreshAccountButton } from "@/components/refresh-account-button";

export const dynamic = "force-dynamic";

const PRESETS: RangePreset[] = ["mtd", "last_month", "last_7", "last_30", "last_90", "custom"];

function Delta({ cur, prev, invert, neutral }: { cur: number; prev: number | undefined; invert?: boolean; neutral?: boolean }) {
  if (prev === undefined) return null;
  const c = pctChange(cur, prev);
  if (c === null) return <span className="text-text-3">no prior data</span>;
  const good = invert ? c < 0 : c > 0;
  return (
    <span className={neutral || Math.abs(c) < 0.5 ? "text-text-2" : good ? "text-good-ink" : "text-critical-ink"}>
      {c > 0 ? "▲" : c < 0 ? "▼" : ""} {formatPct(Math.abs(c))} vs. comparison
    </span>
  );
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireClientView(id);
  const staff = user.role !== "CLIENT_USER";

  const client = await prisma.client.findUniqueOrThrow({
    where: { id },
    include: { accounts: { include: { campaigns: true, syncRuns: { orderBy: { startedAt: "desc" }, take: 1 } }, orderBy: { platform: "asc" } } },
  });
  const today = todayInTimeZone(client.timezone);
  const preset: RangePreset = PRESETS.includes(sp.range as RangePreset) ? (sp.range as RangePreset) : "mtd";
  const compareMode: CompareMode = (["previous_period", "previous_month", "none"] as const).includes(sp.compare as CompareMode) ? (sp.compare as CompareMode) : "previous_month";
  let range;
  try {
    range = resolveRange(preset, today, { from: sp.from, to: sp.to });
  } catch {
    range = resolveRange("mtd", today);
  }
  const cmpRange = comparisonRange(range, compareMode);

  // Current pacing, plus the three previous months for budget history.
  const historyDates = [1, 2, 3].map((n) => {
    let d = monthBounds(today).start;
    for (let i = 0; i < n; i++) d = monthBounds(addDays(d, -1)).start;
    return d;
  });
  const [[pacing], history, perf, cmpPerf] = await Promise.all([
    loadPacing({ id }),
    Promise.all(historyDates.map((d) => loadPacing({ id }, new Date(), d).then((r) => r[0]))),
    getClientPerformance(id, range),
    cmpRange ? getClientPerformance(id, cmpRange) : Promise.resolve(null),
  ]);

  const total = pacing.total;
  const allLines: PacingRow[] = [...pacing.rows, ...pacing.subRows];
  const selectedKey = sp.line && pacing.seriesByKey[sp.line] ? sp.line : null;
  const selectedRow = selectedKey ? allLines.find((r) => r.key === selectedKey) ?? null : null;
  const shown = selectedRow?.result ?? total;
  const shownSeries = selectedKey ? pacing.seriesByKey[selectedKey] : total?.series;
  const c = client.currency;
  const t = perf.totals;
  const d = derive(t);
  const ct = cmpPerf?.totals;
  const cd = ct ? derive(ct) : null;
  const isDemo = client.accounts.some((a) => a.isDemo);
  const lineHref = (key: string | null) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "line" && v) as [string, string][]);
    if (key) q.set("line", key);
    return `/clients/${id}?${q.toString()}`;
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{client.name}</h1>
            {isDemo && <DemoBadge />}
          </div>
          <p className="text-sm text-text-2">
            {PRESET_LABEL[preset]}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
            {cmpRange && <> · compared with {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
            {pacing.client.managerName && staff && <> · Manager: {pacing.client.managerName}</>}
            {" "}· {client.timezone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeControls preset={preset} compare={compareMode} from={range.from} to={range.to} />
          {staff && (
            <Link href={`/clients/${id}/budgets`} className={buttonVariants({ variant: "outline" })}>
              <Settings2 className="h-4 w-4" /> Budgets
            </Link>
          )}
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label={`Ad spend · ${PRESET_LABEL[preset].toLowerCase()}`} value={formatMoney(t.costMinor, c, { whole: true })} sub={<>{t.hasEstimatedCost && <span className="text-warning-ink">Includes estimated LSA cost · </span>}<Delta cur={t.costMinor} prev={ct?.costMinor} neutral /></>} />
        <StatTile label="Monthly budget" value={total ? formatMoney(total.budgetMinor, c, { whole: true }) : "Not set"} sub={total ? <StatusBadge status={total.status} /> : <NoBudgetBadge />} />
        <StatTile label="Conversions (platform-reported)" value={formatNumber(t.conversions, 1)} sub={<Delta cur={t.conversions} prev={ct?.conversions} />} />
        <StatTile label="Leads" value={formatNumber(t.leads)} sub={<Delta cur={t.leads} prev={ct?.leads} />} />
        <StatTile label="Cost per lead" value={d.costPerLeadMinor === null ? "—" : formatMoney(d.costPerLeadMinor, c)} sub={d.costPerLeadMinor !== null && cd?.costPerLeadMinor != null ? <Delta cur={d.costPerLeadMinor} prev={cd.costPerLeadMinor} invert /> : "leads from Meta & LSA"} />
        <StatTile label="ROAS" value={d.roas === null ? "—" : `${d.roas.toFixed(2)}×`} sub={d.roas !== null && cd?.roas != null ? <Delta cur={d.roas} prev={cd.roas} /> : "conversion value ÷ spend"} />
      </div>

      {/* Budget pacing */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Budget pacing · {formatDate(pacing.period.start, { month: "long", year: "numeric" })}</CardTitle>
            {shown && <StatusBadge status={shown.status} />}
          </div>
          <CardDescription>
            {shown?.asOf ? <>Complete data through {formatDate(shown.asOf)}. Today&apos;s partial spend is excluded.</> : "No complete days of data in this period yet."}
          </CardDescription>
          {allLines.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1 text-xs" aria-label="Pacing level">
              <Link href={lineHref(null)} className={`rounded-md px-2.5 py-1 ${!selectedKey ? "bg-surface-2 font-medium ring-1 ring-border" : "text-text-2 hover:text-text"}`}>Client total</Link>
              {allLines.filter((r) => pacing.seriesByKey[r.key]).map((r) => (
                <Link key={r.key} href={lineHref(r.key)} className={`rounded-md px-2.5 py-1 ${selectedKey === r.key ? "bg-surface-2 font-medium ring-1 ring-border" : "text-text-2 hover:text-text"}`}>
                  {r.level === "CLIENT" ? "Combined budget" : r.label}
                </Link>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {shown && shownSeries ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <PacingChart series={shownSeries} budgetMinor={shown.budgetMinor} asOf={shown.asOf} currency={c} height={300} />
              <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-3 text-sm lg:grid-cols-1">
                {[
                  ["Spent to date", formatMoney(shown.actualToDateMinor, c, { whole: true })],
                  ["Expected to date", formatMoney(shown.expectedToDateMinor, c, { whole: true })],
                  ["Pacing (actual ÷ expected)", formatPct(shown.pacingPct)],
                  ["Budget used / month elapsed", `${formatPct(shown.pctBudgetConsumed, 0)} / ${formatPct(shown.pctPeriodElapsed, 0)}`],
                  ["Remaining budget", formatMoney(shown.remainingBudgetMinor, c, { whole: true })],
                  ["Projected month-end", `${formatMoney(shown.projectedMinor, c, { whole: true })} (${shown.projectedVarianceMinor >= 0 ? "+" : "−"}${formatMoney(Math.abs(shown.projectedVarianceMinor), c, { whole: true })})`],
                  ["Required daily spend", shown.requiredDailyMinor === null ? "—" : `${formatMoney(shown.requiredDailyMinor, c, { whole: true })} × ${shown.remainingActiveDays} days`],
                  ["Current daily rate (7-day)", formatMoney(shown.currentDailyRateMinor, c, { whole: true })],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-text-3">{k}</dt>
                    <dd className="font-medium tabular">{v}</dd>
                  </div>
                ))}
                {staff && selectedRow && (
                  <div className="col-span-2 rounded-lg bg-surface-2 p-3 text-xs lg:col-span-1">
                    <p className="font-medium text-text">{selectedRow.action.headline}</p>
                    <p className="text-text-2">{selectedRow.action.detail}</p>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            <p className="text-sm text-text-3">
              No budget is set for this period.{staff && <> <Link className="underline" href={`/clients/${id}/budgets`}>Add a budget</Link> to enable pacing.</>}
            </p>
          )}
        </CardContent>
      </Card>

      {(() => {
        const caveats = [...new Set(allLines.flatMap((r) => r.warnings))];
        return caveats.length > 0 ? (
          <div className="rounded-lg border border-border bg-warning-bg px-4 py-3 text-sm text-warning-ink" role="note">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden /> Data notes</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{caveats.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        ) : null;
      })()}

      {/* Pacing lines */}
      {allLines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Budget lines</CardTitle>
            <CardDescription>Lines marked “sub-allocation” are paced individually but already included in a parent budget, so they are not added to the client total.</CardDescription>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <TH className="pl-5">Line</TH><TH>Status</TH><TH className="text-right">Budget</TH><TH className="text-right">Spent</TH><TH className="text-right">Pacing</TH><TH className="text-right">Projected</TH><TH className="text-right">Required / day</TH>{staff && <TH className="pr-5">Recommendation</TH>}
              </tr>
            </THead>
            <TBody>
              {allLines.map((r) => {
                const sub = pacing.subRows.includes(r);
                return (
                  <TR key={r.key + (sub ? ":sub" : "")}>
                    <TD className="pl-5">
                      <div className="font-medium">{r.level === "CLIENT" ? "Combined client budget" : r.label}</div>
                      <div className="text-xs text-text-3">{r.platforms.map((p) => PLATFORM_LABEL[p]).join(" + ")}{sub && " · sub-allocation"}{r.level === "UNBUDGETED" && " · not budgeted"}</div>
                    </TD>
                    <TD>{r.result ? <StatusBadge status={r.result.status} /> : <NoBudgetBadge />}</TD>
                    <TD className="text-right">{r.result ? formatMoney(r.result.budgetMinor, c, { whole: true }) : "—"}</TD>
                    <TD className="text-right">{formatMoney(r.result?.actualToDateMinor ?? r.unbudgetedSpendMinor, c, { whole: true })}</TD>
                    <TD className="text-right">{r.result ? formatPct(r.result.pacingPct) : "—"}</TD>
                    <TD className="text-right">{r.result ? formatMoney(r.result.projectedMinor, c, { whole: true }) : "—"}</TD>
                    <TD className="text-right">{r.result?.requiredDailyMinor != null ? formatMoney(r.result.requiredDailyMinor, c, { whole: true }) : "—"}</TD>
                    {staff && <TD className="pr-5 text-xs text-text-2 whitespace-normal min-w-64">{r.action.headline}. {r.action.detail}</TD>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <div className="h-3" />
        </Card>
      )}

      {/* Platform breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Platform breakdown</CardTitle>
          <CardDescription>{PRESET_LABEL[preset]} · conversions are platform-reported and defined differently by each platform.</CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <TH className="pl-5">Account</TH><TH className="text-right">Spend</TH><TH className="text-right">Impr.</TH><TH className="text-right">Clicks</TH><TH className="text-right">CTR</TH><TH className="text-right">CPC</TH><TH className="text-right">Conv.</TH><TH className="text-right">Cost / conv.</TH><TH className="text-right">Leads</TH><TH className="text-right">ROAS</TH><TH className="pr-5">Data status</TH>
            </tr>
          </THead>
          <TBody>
            {client.accounts.map((a) => {
              const m: MetricTotals | undefined = perf.byAccount[a.id];
              const x = m ? derive(m) : null;
              const meta = pacing.accounts.find((p) => p.id === a.id)!;
              const lsa = a.platform === "GOOGLE_LSA";
              return (
                <TR key={a.id}>
                  <TD className="pl-5">
                    <PlatformLabel platform={a.platform} />
                    <div className="text-xs text-text-3">{a.name} · {a.platform === "GOOGLE_ADS" && /^\d{10}$/.test(a.externalId) ? formatCustomerId(a.externalId) : a.externalId}</div>
                  </TD>
                  <TD className="text-right font-medium">{m ? formatMoney(m.costMinor, c, { whole: true }) : "—"}{!a.spendIsVerified && <div className="text-[11px] font-normal text-warning-ink">estimated</div>}</TD>
                  <TD className="text-right">{lsa ? "n/a" : m ? formatNumber(m.impressions) : "—"}</TD>
                  <TD className="text-right">{lsa ? "n/a" : m ? formatNumber(m.clicks) : "—"}</TD>
                  <TD className="text-right">{lsa ? "n/a" : formatPct(x?.ctr ?? null, 2)}</TD>
                  <TD className="text-right">{lsa || x?.cpcMinor == null ? (lsa ? "n/a" : "—") : formatMoney(x.cpcMinor, c)}</TD>
                  <TD className="text-right">{m ? formatNumber(m.conversions, 1) : "—"}</TD>
                  <TD className="text-right">{x?.costPerConversionMinor == null ? "—" : formatMoney(x.costPerConversionMinor, c)}</TD>
                  <TD className="text-right">{m?.leads ? formatNumber(m.leads) : "—"}</TD>
                  <TD className="text-right">{x?.roas == null || lsa ? "—" : `${x.roas.toFixed(2)}×`}</TD>
                  <TD className="pr-5 text-xs">
                    <div className="flex flex-col items-start gap-1">
                      {a.status === "NEEDS_REAUTH" || a.status === "DISCONNECTED" ? <StaleBadge label="Disconnected" /> : !meta.lastSuccessfulSyncAt ? <StaleBadge label="Not synced yet" /> : meta.stale ? <StaleBadge /> : <span className="text-text-2">Synced {relativeTime(meta.lastSuccessfulSyncAt)}</span>}
                      {meta.dataCompleteThrough && <span className="text-text-3">Complete through {formatDate(meta.dataCompleteThrough)}</span>}
                      {a.timezone && a.timezone !== client.timezone && <span className="text-warning-ink">Account time zone: {a.timezone}</span>}
                      {a.isDemo ? <span className="text-info-ink">Demo data</span> : staff && a.connectionId && <RefreshAccountButton accountId={a.id} />}
                      {staff && a.syncRuns[0]?.status === "FAILED" && <span className="flex items-start gap-1 text-critical-ink whitespace-normal max-w-56"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{a.syncRuns[0].error}</span>}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {client.accounts.some((a) => a.platform === "GOOGLE_LSA") && (
          <p className="px-5 pt-3 text-xs text-text-3">
            Google Local Services Ads: spend shown is <strong className="font-medium text-text-2">estimated</strong> from charged leads × lead cost, because the LSA reporting API does not provide verified daily ad spend. Treat it as an estimate, not billed spend.
          </p>
        )}
        <div className="h-4" />
      </Card>

      {/* Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Performance trends</CardTitle>
          <CardDescription>Daily values, {formatDate(range.from)} – {formatDate(range.to)}{cmpRange && " with the comparison period (dashed) aligned day-by-day"}.</CardDescription>
        </CardHeader>
        <CardContent>
          <TrendChart current={perf.byDate} comparison={cmpPerf?.byDate ?? null} currency={c} />
        </CardContent>
      </Card>

      {/* Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle>Campaigns</CardTitle>
          <CardDescription>{PRESET_LABEL[preset]}</CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <tr><TH className="pl-5">Campaign</TH><TH>Platform</TH><TH>Status</TH><TH className="text-right">Spend</TH><TH className="text-right">Clicks</TH><TH className="text-right">Conv.</TH><TH className="text-right">Cost / conv.</TH><TH className="pr-5 text-right">ROAS</TH></tr>
          </THead>
          <TBody>
            {client.accounts.flatMap((a) =>
              a.campaigns.map((cmp) => {
                const m = perf.byCampaign[cmp.id];
                const x = m ? derive(m) : null;
                return (
                  <TR key={cmp.id}>
                    <TD className="pl-5 font-medium">{cmp.name}</TD>
                    <TD className="text-xs"><PlatformLabel platform={a.platform} /></TD>
                    <TD className="text-xs text-text-2">{cmp.status.toLowerCase()}</TD>
                    <TD className="text-right">{m ? formatMoney(m.costMinor, c, { whole: true }) : formatMoney(0, c, { whole: true })}</TD>
                    <TD className="text-right">{m ? formatNumber(m.clicks) : 0}</TD>
                    <TD className="text-right">{m ? formatNumber(m.conversions, 1) : 0}</TD>
                    <TD className="text-right">{x?.costPerConversionMinor == null ? "—" : formatMoney(x.costPerConversionMinor, c)}</TD>
                    <TD className="pr-5 text-right">{x?.roas == null ? "—" : `${x.roas.toFixed(2)}×`}</TD>
                  </TR>
                );
              }),
            )}
          </TBody>
        </Table>
        <div className="h-4" />
      </Card>

      {/* Budget history */}
      <Card>
        <CardHeader>
          <CardTitle>Historical budget performance</CardTitle>
          <CardDescription>Final spend against budget for previous periods.</CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <tr><TH className="pl-5">Period</TH><TH className="text-right">Budget</TH><TH className="text-right">Spent</TH><TH className="text-right">Variance</TH><TH className="text-right">Budget used</TH><TH className="pr-5">Result</TH></tr>
          </THead>
          <TBody>
            {history.map((h) => {
              const r = h.total;
              return (
                <TR key={h.period.start}>
                  <TD className="pl-5">{formatDate(h.period.start, { month: "long", year: "numeric" })}</TD>
                  <TD className="text-right">{r ? formatMoney(r.budgetMinor, c, { whole: true }) : "—"}</TD>
                  <TD className="text-right">{r ? formatMoney(r.actualToDateMinor, c, { whole: true }) : "—"}</TD>
                  <TD className="text-right">{r ? `${r.actualToDateMinor - r.budgetMinor >= 0 ? "+" : "−"}${formatMoney(Math.abs(r.actualToDateMinor - r.budgetMinor), c, { whole: true })}` : "—"}</TD>
                  <TD className="text-right">{r ? formatPct(r.pctBudgetConsumed) : "—"}</TD>
                  <TD className="pr-5">{r ? <StatusBadge status={r.status} /> : <NoBudgetBadge />}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="h-4" />
      </Card>
    </div>
  );
}
