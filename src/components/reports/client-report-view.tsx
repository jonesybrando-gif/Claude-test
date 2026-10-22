import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { AlertTriangle, EyeOff } from "lucide-react";
import type { PacingRow } from "@/server/pacing-service";
import type { ClientReport } from "@/server/client-report";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { derive, type MetricTotals } from "@/lib/metrics";
import { dailyKpiValue, KPI_BY_KEY, kpiValues, type KpiKey } from "@/lib/kpis";
import type { SectionKey } from "@/lib/report-template";
import { formatMoney, formatNumber, formatPct } from "@/lib/money";
import { formatDate, relativeTime } from "@/lib/time";
import { addDays } from "@/lib/pacing/dates";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { formatCustomerId } from "@/server/integrations/google-ads/gaql";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KpiCard } from "@/components/kpi/kpi-card";
import { NoBudgetBadge, StaleBadge, StatusBadge } from "@/components/status-badge";
import { PlatformLabel } from "@/components/platform-badge";
import { PacingChart } from "@/components/charts/pacing-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { RefreshAccountButton } from "@/components/refresh-account-button";
import { ExecutiveSummary } from "./executive-summary";
import { CampaignTable } from "./campaign-table";

export type ReportTab = "overview" | "campaigns" | "trends" | "insights";

const TREND_EXTRAS: KpiKey[] = ["spend", "conversions", "leads", "costPerLead", "clicks", "impressions", "conversionRate"];

/** Shown to staff on sections the client-facing report leaves out. */
function HiddenFromClient() {
  return <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-normal text-text-3"><EyeOff className="h-3 w-3" aria-hidden /> Hidden from client report</span>;
}

/**
 * The body of a client report: used by the client page (staff and client
 * logins) and by shared report links. Only `staff` adds internal detail:
 * recommendations, sync errors, refresh buttons and hidden sections.
 */
export function ClientReportView({
  rep,
  staff,
  basePath,
  query,
  afterKpis,
  tab,
  tabHref,
}: {
  rep: ClientReport;
  staff: boolean;
  /** Where the pacing-line links point (the page showing this report). */
  basePath: string;
  query: Record<string, string | undefined>;
  /** Staff-only AI assistant, shown on the Insights tab. */
  afterKpis?: ReactNode;
  /** Staff client page: show one tab's sections. Omitted: the full client-facing report. */
  tab?: ReportTab;
  tabHref?: (tab: ReportTab) => string;
}) {
  const { client, preset, range, cmpRange, pacing, history, perf, cmpPerf, template } = rep;
  // Client users see only the sections the report template includes; staff
  // see everything, with a marker on what the client won't see.
  const show = (k: SectionKey) => staff || template.sections[k];
  const hiddenMark = (k: SectionKey) => (staff && !template.sections[k] ? <HiddenFromClient /> : null);
  const trendMetrics = [...new Set([...template.trendKpis, ...TREND_EXTRAS])];

  const total = pacing.total;
  // Months without a budget would only show rows of dashes.
  const pastBudgets = history.filter((h) => h.total);
  const pacingIsCurrent = pacing.period.start <= rep.today && rep.today <= pacing.period.end;
  const rangeCoversPacing = range.from <= pacing.period.start && range.to >= addDays(rep.today, -1);
  const allLines: PacingRow[] = [...pacing.rows, ...pacing.subRows];
  const selectedKey = query.line && pacing.seriesByKey[query.line] ? query.line : null;
  const selectedRow = selectedKey ? allLines.find((r) => r.key === selectedKey) ?? null : null;
  const shown = selectedRow?.result ?? total;
  const shownSeries = selectedKey ? pacing.seriesByKey[selectedKey] : total?.series;
  const c = client.currency;
  const t = perf.totals;
  const kvs = kpiValues(template.kpis, t, cmpPerf?.totals ?? null);
  const lineHref = (key: string | null) => {
    const q = new URLSearchParams(Object.entries(query).filter(([k, v]) => k !== "line" && v) as [string, string][]);
    if (key) q.set("line", key);
    return `${basePath}?${q.toString()}`;
  };

  const blocks = {
    kpis: <>
      {/* KPI scorecards */}
      {show("kpis") && (
        <section aria-label="Key metrics" className="flex flex-col gap-2">
          {hiddenMark("kpis")}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {kvs.map((kv) => <KpiCard key={kv.key} kv={kv} currency={c} trend={perf.byDate.map((d) => dailyKpiValue(d, kv.key))} note={kv.value === null && KPI_BY_KEY[kv.key].kind !== "count" ? "not reported" : undefined} />)}
          </div>
          {t.hasEstimatedCost && <p className="text-xs text-warning-ink">Spend includes estimated Local Services cost.</p>}
        </section>
      )}

    </>,
    note: <>
      {show("summary") && template.summary.trim() && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2"><CardTitle>Note</CardTitle>{hiddenMark("summary")}</div>
          </CardHeader>
          <CardContent><p className="max-w-[80ch] whitespace-pre-line text-sm text-text-2">{template.summary.trim()}</p></CardContent>
        </Card>
      )}

    </>,
    pacing: <>
      {/* Budget pacing */}
      {show("pacing") && <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Budget pacing · {pacingIsCurrent ? "This month, " : ""}{formatDate(pacing.period.start, { month: "long", year: "numeric" })}</CardTitle>
              {hiddenMark("pacing")}
            </div>
            {shown && <StatusBadge status={shown.status} />}
          </div>
          <CardDescription>
            {shown?.asOf ? <>Complete data through {formatDate(shown.asOf)}. Today&apos;s partial spend is excluded.</> : "No complete days of data in this period yet."}
            {!rangeCoversPacing && <> Pacing always follows the current budget month; the rest of this page shows {PRESET_LABEL[preset].toLowerCase()} ({formatDate(range.from)} – {formatDate(range.to)}).</>}
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
              No budget is set for this period.{staff && <> <Link className="underline" href={`/clients/${client.id}/budgets`}>Add a budget</Link> to enable pacing.</>}
            </p>
          )}
        </CardContent>
      </Card>}

      {show("pacing") && (() => {
        const caveats = [...new Set(allLines.flatMap((r) => r.warnings))];
        return caveats.length > 0 ? (
          <div className="rounded-lg border border-border bg-warning-bg px-4 py-3 text-sm text-warning-ink" role="note">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden /> Data notes</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{caveats.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        ) : null;
      })()}

      {/* Pacing lines */}
      {show("pacing") && allLines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{staff ? "Budget lines" : "Budget"}</CardTitle>
            {staff && pacing.subRows.length > 0 && <CardDescription>Lines marked “sub-allocation” are paced individually but already included in a parent budget, so they are not added to the client total.</CardDescription>}
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
                      <div className="font-medium">{r.level === "CLIENT" ? (staff ? "Combined client budget" : "Total budget") : r.label}</div>
                      <div className="text-xs text-text-3">{r.platforms.map((p) => PLATFORM_LABEL[p]).join(" + ")}{sub && staff && " · sub-allocation"}{r.level === "UNBUDGETED" && " · not budgeted"}</div>
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

    </>,
    platforms: <>
      {/* Platform breakdown */}
      {show("platforms") && <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Platform breakdown</CardTitle>{hiddenMark("platforms")}</div>
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
                  <TD className="text-right">{m ? formatNumber(m.conversions, m.conversions < 100 ? 1 : 0) : "—"}</TD>
                  <TD className="text-right">{x?.costPerConversionMinor == null ? "—" : formatMoney(x.costPerConversionMinor, c)}</TD>
                  <TD className="text-right">{m && (m.leads || m.leadsReported) ? formatNumber(m.leads) : "—"}</TD>
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
      </Card>}

    </>,
    trends: <>
      {/* Trends */}
      {show("trends") && <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Performance trends</CardTitle>{hiddenMark("trends")}</div>
          <CardDescription>Daily values, {formatDate(range.from)} – {formatDate(range.to)}{cmpRange && " with the comparison period (dashed) aligned day-by-day"}.</CardDescription>
        </CardHeader>
        <CardContent>
          <TrendChart current={perf.byDate} comparison={cmpPerf?.byDate ?? null} currency={c} metrics={trendMetrics} />
        </CardContent>
      </Card>}

    </>,
    campaigns: show("campaigns") ? (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2"><CardTitle>Campaigns</CardTitle>{hiddenMark("campaigns")}</div>
            {staff && <Link href={`${basePath}/campaigns?range=${preset}&from=${range.from}&to=${range.to}`} className="text-sm font-medium text-brand hover:underline">Add or remove campaigns</Link>}
          </div>
          <CardDescription>{PRESET_LABEL[preset]} · sorted by spend</CardDescription>
        </CardHeader>
        <CampaignTable
          currency={c}
          rows={client.accounts.flatMap((a) =>
            a.campaigns.map((cmp) => {
              const m = perf.byCampaign[cmp.id];
              return { id: cmp.id, name: cmp.name, platform: a.platform, status: cmp.status, costMinor: m?.costMinor ?? 0, clicks: m?.clicks ?? 0, conversions: m?.conversions ?? 0, conversionValueMinor: m?.conversionValueMinor ?? 0 };
            }),
          )}
        />
        <div className="h-4" />
      </Card>
    ) : null,
    history: <>
      {/* Budget history */}
      {show("history") && pastBudgets.length > 0 && <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Historical budget performance</CardTitle>{hiddenMark("history")}</div>
          <CardDescription>Final spend against budget for previous periods.</CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <tr><TH className="pl-5">Period</TH><TH className="text-right">Budget</TH><TH className="text-right">Spent</TH><TH className="text-right">Variance</TH><TH className="text-right">Budget used</TH><TH className="pr-5">Result</TH></tr>
          </THead>
          <TBody>
            {pastBudgets.map((h) => {
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
      </Card>}
    </>,
    summary: show("executive") ? <ExecutiveSummary rep={rep} marker={<>{hiddenMark("executive")}{staff && tab === "insights" && <Link href={`${basePath}/report`} className="text-xs font-normal text-brand hover:underline">{template.sections.executive ? "Shown to the client" : "Not shown to the client"} · change</Link>}</>} copyable={staff} compact={tab !== "insights"} fullHref={tab === "overview" ? tabHref?.("insights") : undefined} /> : null,
  };

  // Staff see one tab at a time; the client-facing report shows everything,
  // numbers first: KPI tiles, one chart, then the written summary.
  const order: Record<ReportTab | "all", (keyof typeof blocks | "ai")[]> = {
    all: ["kpis", "trends", "summary", "note", "pacing", "campaigns", "platforms", "history"],
    overview: ["kpis", "summary", "note", "pacing", "history"],
    campaigns: ["campaigns"],
    trends: ["trends", "platforms"],
    insights: ["summary", "ai"],
  };
  return (
    <>
      {order[tab ?? "all"].map((k) => (k === "ai" ? <Fragment key={k}>{afterKpis}</Fragment> : <Fragment key={k}>{blocks[k]}</Fragment>))}
    </>
  );
}
