import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, EyeOff, Plug, RefreshCw, Unplug } from "lucide-react";
import type { PacingRow } from "@/server/pacing-service";
import type { ClientReport } from "@/server/client-report";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { derive, type MetricTotals } from "@/lib/metrics";
import { dailyKpiValue, KPI_BY_KEY, kpiValues, type KpiKey } from "@/lib/kpis";
import type { SectionKey } from "@/lib/report-template";
import { formatMoney, formatNumber, formatPct } from "@/lib/money";
import { formatDate, relativeTime } from "@/lib/time";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { formatCustomerId } from "@/server/integrations/google-ads/gaql";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KpiCard } from "@/components/kpi/kpi-card";
import { NoBudgetBadge, NotConnectedBadge, StaleBadge, StatusBadge } from "@/components/status-badge";
import { PlatformLabel } from "@/components/platform-badge";
import { PacingChart } from "@/components/charts/pacing-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { RefreshAccountButton } from "@/components/refresh-account-button";
import { CampaignTable, type CampaignRow } from "./campaign-table";

// The building blocks of a client report. The client page arranges them in
// tabs for staff; the client-facing report (client logins and shared links)
// shows them on one page. `staff` adds internal detail only.

export const TREND_EXTRAS: KpiKey[] = ["spend", "conversions", "leads", "costPerLead", "clicks", "impressions", "conversionRate"];

/** Shown to staff on sections the client-facing report leaves out. */
export function HiddenFromClient() {
  return <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-normal text-text-3"><EyeOff className="h-3 w-3" aria-hidden /> Hidden from client report</span>;
}

/** Marker for staff when the client-facing report leaves a section out. */
export function hiddenMarker(rep: ClientReport, staff: boolean) {
  return function marker(k: SectionKey) {
    return staff && !rep.template.sections[k] ? <HiddenFromClient /> : null;
  };
}

export function KpiSection({ rep, marker }: { rep: ClientReport; marker?: ReactNode }) {
  const { template, perf, cmpPerf, client } = rep;
  const t = perf.totals;
  const kvs = kpiValues(template.kpis, t, cmpPerf?.totals ?? null);
  return (
    <section aria-label="Key metrics" className="flex flex-col gap-2">
      {marker}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kvs.map((kv) => <KpiCard key={kv.key} kv={kv} currency={client.currency} trend={perf.byDate.map((d) => dailyKpiValue(d, kv.key))} note={kv.value === null && KPI_BY_KEY[kv.key].kind !== "count" ? "not reported" : undefined} />)}
      </div>
      {t.hasEstimatedCost && <p className="text-xs text-warning-ink">Spend includes estimated Local Services cost.</p>}
      {noActivity(rep) && client.accounts.length > 0 && <p className="text-xs text-text-3">No advertising activity was recorded from {formatDate(rep.range.from)} to {formatDate(rep.range.to)}. Try a different date range, or check the accounts under Setup.</p>}
    </section>
  );
}

export function NoteSection({ rep, marker }: { rep: ClientReport; marker?: ReactNode }) {
  const text = rep.template.summary.trim();
  if (!text) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2"><CardTitle>Note</CardTitle>{marker}</div>
      </CardHeader>
      <CardContent><p className="max-w-[80ch] whitespace-pre-line text-sm text-text-2">{text}</p></CardContent>
    </Card>
  );
}

/** "This month · October 2026" for a calendar month, else the period's dates. */
export function pacingPeriodLabel(rep: ClientReport): string {
  const { start, end } = rep.pacing.period;
  const monthly = start.endsWith("-01") && formatDate(start, { month: "long", year: "numeric" }) === formatDate(end, { month: "long", year: "numeric" });
  const current = start <= rep.today && rep.today <= end;
  if (monthly) return `${current ? "This month · " : ""}${formatDate(start, { month: "long", year: "numeric" })}`;
  return `${current ? "Current period · " : ""}${formatDate(start)} – ${formatDate(end, { month: "short", day: "numeric", year: "numeric" })}`;
}

const lineName = (r: PacingRow, staff: boolean) => (r.level === "CLIENT" ? (staff ? "Combined client budget" : "Total budget") : r.label);

export function PacingSection({ rep, staff, basePath, query, marker, showLines = true }: { rep: ClientReport; staff: boolean; basePath: string; query: Record<string, string | undefined>; marker?: ReactNode; showLines?: boolean }) {
  const { pacing, client, preset, range } = rep;
  const c = client.currency;
  const total = pacing.total;
  const allLines: PacingRow[] = [...pacing.rows, ...pacing.subRows];
  const selectedKey = query.line && pacing.seriesByKey[query.line] ? query.line : null;
  const selectedRow = selectedKey ? allLines.find((r) => r.key === selectedKey) ?? null : null;
  const shown = selectedRow?.result ?? total;
  const shownSeries = selectedKey ? pacing.seriesByKey[selectedKey] : total?.series;
  const lineHref = (key: string | null) => {
    const q = new URLSearchParams(Object.entries(query).filter(([k, v]) => k !== "line" && v) as [string, string][]);
    if (key) q.set("line", key);
    return `${basePath}?${q.toString()}`;
  };
  // The report's range and the budget period can differ (e.g. "Last month" vs this month's budget).
  const differentPeriod = range.from > pacing.period.end || range.to < pacing.period.start || preset !== "mtd";
  const caveats = [...new Set(allLines.flatMap((r) => r.warnings))];
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Budget pacing · {pacingPeriodLabel(rep)}</CardTitle>
              {marker}
            </div>
            {shown && <StatusBadge status={shown.status} />}
          </div>
          <CardDescription>
            {shown?.asOf ? <>Complete data through {formatDate(shown.asOf)}. Today&apos;s partial spend is excluded.</> : "No complete days of data in this period yet."}
            {differentPeriod && <> Pacing always covers the current budget period, not the {PRESET_LABEL[preset].toLowerCase()} range shown elsewhere.</>}
          </CardDescription>
          {allLines.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1 text-xs" aria-label="Pacing level">
              <Link href={lineHref(null)} className={`rounded-md px-2.5 py-1 ${!selectedKey ? "bg-surface-2 font-medium ring-1 ring-border" : "text-text-2 hover:text-text"}`}>Client total</Link>
              {allLines.filter((r) => pacing.seriesByKey[r.key]).map((r) => (
                <Link key={r.key} href={lineHref(r.key)} className={`rounded-md px-2.5 py-1 ${selectedKey === r.key ? "bg-surface-2 font-medium ring-1 ring-border" : "text-text-2 hover:text-text"}`}>
                  {r.level === "CLIENT" ? (staff ? "Combined budget" : "Total budget") : r.label}
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
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="text-sm text-text-2">No budget is set for this period{staff ? ". Add a monthly budget to get pacing, month-end forecasts, daily spend targets and alerts." : "."}</p>
              {staff && <Link className={buttonVariants({ size: "sm" })} href={`/clients/${client.id}/budgets`}>Add a budget</Link>}
            </div>
          )}
        </CardContent>
      </Card>

      {caveats.length > 0 && (
        <div className="rounded-lg border border-border bg-warning-bg px-4 py-3 text-sm text-warning-ink" role="note">
          <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden /> Data notes</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{caveats.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      {showLines && allLines.length > (staff ? 0 : 1) && <BudgetLinesCard rep={rep} staff={staff} />}
    </>
  );
}

/**
 * Every budget line for the period. Staff see sub-allocations, unbudgeted
 * accounts and recommendations; the client-facing version is a plain "Budget"
 * table without internal terms.
 */
export function BudgetLinesCard({ rep, staff }: { rep: ClientReport; staff: boolean }) {
  const { pacing, client } = rep;
  const c = client.currency;
  const sub = new Set(pacing.subRows);
  const lines: PacingRow[] = staff ? [...pacing.rows, ...pacing.subRows] : [...pacing.rows, ...pacing.subRows].filter((r) => r.level !== "UNBUDGETED" && !r.notConnected);
  if (lines.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{staff ? "Budget lines" : "Budget"}</CardTitle>
        <CardDescription>
          {staff
            ? "Lines marked “sub-allocation” are paced individually but already included in a parent budget, so they are not added to the client total."
            : "Each budget and how it is tracking this period."}
        </CardDescription>
      </CardHeader>
      {/* Phones: one card per budget. */}
      <ul className="flex flex-col gap-2 px-3 md:hidden">
        {lines.map((r) => (
          <li key={r.key + (sub.has(r) ? ":sub" : "")} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{lineName(r, staff)}</p>
                <p className="text-xs text-text-3">{r.platforms.map((p) => PLATFORM_LABEL[p]).join(" + ")}{staff && sub.has(r) && " · sub-allocation"}</p>
              </div>
              {r.notConnected ? <NotConnectedBadge /> : r.result ? <StatusBadge status={r.result.status} /> : <NoBudgetBadge />}
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-text-3">Spent</dt><dd className="font-medium tabular">{r.notConnected ? "—" : formatMoney(r.result?.actualToDateMinor ?? r.unbudgetedSpendMinor, c, { whole: true })}</dd></div>
              <div><dt className="text-text-3">of</dt><dd className="font-medium tabular">{r.result ? formatMoney(r.result.budgetMinor, c, { whole: true }) : "—"}</dd></div>
              <div><dt className="text-text-3">Projected</dt><dd className="font-medium tabular">{r.result && !r.notConnected ? formatMoney(r.result.projectedMinor, c, { whole: true }) : "—"}</dd></div>
            </dl>
            {staff && <p className="mt-2 text-xs text-text-2">{r.action.headline}. {r.action.detail}</p>}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
      <Table>
        <THead>
          <tr>
            <TH className="pl-5">{staff ? "Line" : "Budget"}</TH><TH>Status</TH><TH className="text-right">Amount</TH><TH className="text-right">Spent</TH><TH className="text-right">Pacing</TH><TH className="text-right">Projected</TH><TH className={staff ? "text-right" : "pr-5 text-right"}>Required / day</TH>{staff && <TH className="pr-5">Recommendation</TH>}
          </tr>
        </THead>
        <TBody>
          {lines.map((r) => {
            const isSub = sub.has(r);
            return (
              <TR key={r.key + (isSub ? ":sub" : "")}>
                <TD className="pl-5">
                  <div className="font-medium">{lineName(r, staff)}</div>
                  <div className="text-xs text-text-3">{r.platforms.map((p) => PLATFORM_LABEL[p]).join(" + ")}{staff && isSub && " · sub-allocation"}{r.level === "UNBUDGETED" && " · not budgeted"}</div>
                </TD>
                <TD>{r.notConnected ? <NotConnectedBadge label={r.accounts.length ? "Awaiting first sync" : "Not connected"} /> : r.result ? <StatusBadge status={r.result.status} /> : <NoBudgetBadge />}</TD>
                <TD className="text-right">{r.result ? formatMoney(r.result.budgetMinor, c, { whole: true }) : "—"}</TD>
                <TD className="text-right">{r.notConnected ? "—" : formatMoney(r.result?.actualToDateMinor ?? r.unbudgetedSpendMinor, c, { whole: true })}</TD>
                <TD className="text-right">{r.result && !r.notConnected ? formatPct(r.result.pacingPct) : "—"}</TD>
                <TD className="text-right">{r.result && !r.notConnected ? formatMoney(r.result.projectedMinor, c, { whole: true }) : "—"}</TD>
                <TD className={staff ? "text-right" : "pr-5 text-right"}>{r.result?.requiredDailyMinor != null && !r.notConnected ? formatMoney(r.result.requiredDailyMinor, c, { whole: true }) : "—"}</TD>
                {staff && <TD className="pr-5 text-xs text-text-2 whitespace-normal min-w-64">{r.action.headline}. {r.action.detail}</TD>}
              </TR>
            );
          })}
        </TBody>
      </Table>
      </div>
      <div className="h-3" />
    </Card>
  );
}

/** Spend and results per ad account. With `status`, adds sync state and refresh (staff setup view). */
export function PlatformSection({ rep, staff, marker, status = false, title = "Platform breakdown" }: { rep: ClientReport; staff: boolean; marker?: ReactNode; status?: boolean; title?: string }) {
  const { client, perf, pacing, preset } = rep;
  const c = client.currency;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2"><CardTitle>{title}</CardTitle>{marker}</div>
        <CardDescription>{PRESET_LABEL[preset]} · conversions are platform-reported and defined differently by each platform.</CardDescription>
      </CardHeader>
      <Table>
        <THead>
          <tr>
            <TH className="pl-5">Account</TH><TH className="text-right">Spend</TH><TH className="text-right">Impr.</TH><TH className="text-right">Clicks</TH><TH className="text-right">CTR</TH><TH className="text-right">CPC</TH><TH className="text-right">Conv.</TH><TH className="text-right">Cost / conv.</TH><TH className="text-right">Leads</TH><TH className={status ? "text-right" : "pr-5 text-right"}>ROAS</TH>{status && <TH className="pr-5">Data status</TH>}
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
                <TD className="text-right">{m ? formatNumber(m.conversions, 0) : "—"}</TD>
                <TD className="text-right">{x?.costPerConversionMinor == null ? "—" : formatMoney(x.costPerConversionMinor, c)}</TD>
                <TD className="text-right">{m && (m.leads || m.leadsReported) ? formatNumber(m.leads) : "—"}</TD>
                <TD className={status ? "text-right" : "pr-5 text-right"}>{x?.roas == null || lsa ? "—" : `${x.roas.toFixed(2)}×`}</TD>
                {status && (
                  <TD className="pr-5 text-xs">
                    <div className="flex flex-col items-start gap-1">
                      {a.status === "NEEDS_REAUTH" || a.status === "DISCONNECTED" ? <StaleBadge label="Disconnected" /> : !meta.lastSuccessfulSyncAt ? <StaleBadge label="Not synced yet" /> : meta.stale ? <StaleBadge /> : <span className="text-text-2">Synced {relativeTime(meta.lastSuccessfulSyncAt).toLowerCase()}</span>}
                      {meta.dataCompleteThrough && <span className="text-text-3">Complete through {formatDate(meta.dataCompleteThrough)}</span>}
                      {a.timezone && a.timezone !== client.timezone && <span className="text-warning-ink">Account time zone: {a.timezone}</span>}
                      {a.isDemo ? <span className="text-info-ink">Demo data</span> : staff && a.connectionId && <RefreshAccountButton accountId={a.id} />}
                      {staff && a.syncRuns[0]?.status === "FAILED" && <span className="flex items-start gap-1 text-critical-ink whitespace-normal max-w-56"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{a.syncRuns[0].error}</span>}
                    </div>
                  </TD>
                )}
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
  );
}

export function TrendsSection({ rep, marker, metrics, title = "Performance trends" }: { rep: ClientReport; marker?: ReactNode; metrics?: KpiKey[]; title?: string }) {
  const { range, cmpRange, perf, cmpPerf, template, client } = rep;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2"><CardTitle>{title}</CardTitle>{marker}</div>
        <CardDescription>Daily values, {formatDate(range.from)} – {formatDate(range.to)}{cmpRange && " with the comparison period (dashed) aligned day-by-day"}.</CardDescription>
      </CardHeader>
      <CardContent>
        {noActivity(rep) ? (
          <p className="py-6 text-center text-sm text-text-3">No activity in this period, so there is nothing to chart yet.</p>
        ) : (
        <TrendChart current={perf.byDate} comparison={cmpPerf?.byDate ?? null} currency={client.currency} metrics={metrics ?? [...new Set([...template.trendKpis, ...TREND_EXTRAS])]} />
        )}
      </CardContent>
    </Card>
  );
}

export function campaignRows(rep: ClientReport): CampaignRow[] {
  return rep.client.accounts.flatMap((a) =>
    a.campaigns.map((cmp) => {
      const m = rep.perf.byCampaign[cmp.id];
      return {
        id: cmp.id,
        name: cmp.name,
        platform: a.platform,
        status: cmp.status,
        costMinor: m?.costMinor ?? 0,
        clicks: m?.clicks ?? 0,
        conversions: m?.conversions ?? 0,
        conversionValueMinor: m?.conversionValueMinor ?? 0,
      };
    }),
  );
}

export function CampaignsSection({ rep, staff, basePath, marker }: { rep: ClientReport; staff: boolean; basePath: string; marker?: ReactNode }) {
  const { preset, range } = rep;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2"><CardTitle>Campaigns</CardTitle>{marker}</div>
          {staff && <Link href={`${basePath}/campaigns?range=${preset}&from=${range.from}&to=${range.to}`} className="text-sm font-medium text-brand hover:underline">Add or remove campaigns</Link>}
        </div>
        <CardDescription>{PRESET_LABEL[preset]} · sorted by spend. Click a column to re-sort.</CardDescription>
      </CardHeader>
      <CampaignTable rows={campaignRows(rep)} currency={rep.client.currency} />
      <div className="h-4" />
    </Card>
  );
}

export function HistorySection({ rep, marker, hideEmpty = false }: { rep: ClientReport; marker?: ReactNode; hideEmpty?: boolean }) {
  const c = rep.client.currency;
  const rows = hideEmpty ? rep.history.filter((h) => h.total) : rep.history;
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2"><CardTitle>Historical budget performance</CardTitle>{marker}</div>
        <CardDescription>Final spend against budget for previous months.</CardDescription>
      </CardHeader>
      <Table>
        <THead>
          <tr><TH className="pl-5">Period</TH><TH className="text-right">Budget</TH><TH className="text-right">Spent</TH><TH className="text-right">Variance</TH><TH className="text-right">Budget used</TH><TH className="pr-5">Result</TH></tr>
        </THead>
        <TBody>
          {rows.map((h) => {
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
  );
}

/**
 * "Synced 59 min ago · complete through Oct 20" for the report header. Turns
 * amber (for staff) when any account is stale, disconnected or failing.
 */
export function DataFreshness({ rep, staff, setupHref }: { rep: ClientReport; staff: boolean; setupHref?: string }) {
  const { client, pacing } = rep;
  const metas = pacing.accounts;
  if (metas.length === 0) {
    return staff ? (
      <Link href={setupHref ?? `/clients/${client.id}/accounts`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-text-2 hover:text-text">
        <Unplug className="h-3.5 w-3.5" aria-hidden /> No ad accounts linked
      </Link>
    ) : null;
  }
  const syncs = metas.map((a) => a.lastSuccessfulSyncAt).filter((s): s is string => !!s).sort();
  const through = metas.map((a) => a.dataCompleteThrough).filter((d): d is string => !!d).sort();
  const problems = client.accounts.filter((a) => {
    const m = metas.find((x) => x.id === a.id);
    return a.status === "NEEDS_REAUTH" || a.status === "DISCONNECTED" || a.syncRuns[0]?.status === "FAILED" || (m && !m.isDemo && (m.stale || !m.lastSuccessfulSyncAt));
  });
  const warn = staff && problems.length > 0;
  const parts = [
    syncs.length ? `Synced ${relativeTime(syncs[0]).toLowerCase()}` : "Not synced yet",
    through.length ? `complete through ${formatDate(through[0])}` : null,
    warn ? `${problems.length} account${problems.length === 1 ? "" : "s"} need${problems.length === 1 ? "s" : ""} attention` : null,
  ].filter(Boolean);
  const cls = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${warn ? "bg-warning-bg text-warning-ink" : "border border-border bg-surface-2 text-text-2"}`;
  const Icon = warn ? AlertTriangle : RefreshCw;
  const body = (
    <>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {parts.join(" · ")}
    </>
  );
  return staff && setupHref ? (
    <Link href={setupHref} className={`${cls} hover:underline`} title={syncs.length > 1 ? "Oldest sync across this client's accounts" : undefined}>{body}</Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** Empty state for a client with no ad accounts: says what to do next instead of showing $0 everywhere. */
export function NoAccountsState({ rep, staff }: { rep: ClientReport; staff: boolean }) {
  const href = `/clients/${rep.client.id}/accounts`;
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Plug className="mt-0.5 h-5 w-5 shrink-0 text-text-3" aria-hidden />
          <div>
            <p className="font-medium">{staff ? `No ad accounts are linked to ${rep.client.name} yet` : "Your report is being set up"}</p>
            <p className="text-sm text-text-2">
              {staff ? "Connect Google Ads, Meta, Microsoft Advertising or Local Services Ads and link this client's account. About 13 months of history imports automatically." : "Figures appear here once your agency connects your advertising accounts."}
            </p>
          </div>
        </div>
        {staff && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={href} className={buttonVariants()}>Connect Google Ads</Link>
            <Link href={href} className={buttonVariants({ variant: "outline" })}>Other platforms</Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** True when the report's range has no spend, clicks, impressions, conversions or leads at all. */
export function noActivity(rep: ClientReport): boolean {
  const t = rep.perf.totals;
  return t.costMinor === 0 && t.clicks === 0 && t.impressions === 0 && t.conversions === 0 && t.leads === 0;
}
