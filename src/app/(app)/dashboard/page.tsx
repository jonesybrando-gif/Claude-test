import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { loadPacing, summarize } from "@/server/pacing-service";
import { formatMoney, formatPct } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { StatTile } from "@/components/stat-tile";
import { ActionCenter } from "@/components/dashboard/action-center";
import { PacingTable } from "@/components/dashboard/pacing-table";
import { PacingChart } from "@/components/charts/pacing-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoBadge, StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireAgencyStaff();
  const clients = await loadPacing(visibleClientsWhere(user));
  const rows = clients.flatMap((c) => c.rows);
  const s = summarize(clients);
  const isDemo = rows.some((r) => r.isDemo);
  const c = s.currency;
  const variance = s.projectedMinor - s.totalBudgetMinor;
  const period = s.combined ? `${formatDate(s.combined.periodStart, { month: "long", year: "numeric" })}` : "";

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Advertising Budget Monitor</h1>
          <p className="text-sm text-text-2">
            {period} · {clients.length} clients · {rows.length} budget lines
            {s.typicalAsOf && <> · data through {formatDate(s.typicalAsOf, { month: "short", day: "numeric" })}</>}
            {s.staleRows > 0 && <span className="text-warning-ink"> · {s.staleRows} line{s.staleRows === 1 ? "" : "s"} with older data</span>}
          </p>
        </div>
        {isDemo && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-info-bg px-3 py-1.5 text-xs text-info-ink">
            <DemoBadge /> {rows.every((r) => r.isDemo || r.accounts.length === 0) ? "Illustrative sample data — no live advertising accounts are connected." : "Some accounts show illustrative sample data, marked “Demo data” on their client pages."}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Total monthly budget" value={formatMoney(s.totalBudgetMinor, c, { whole: true })} sub={s.unbudgetedSpendMinor > 0 ? `+ ${formatMoney(s.unbudgetedSpendMinor, c, { whole: true })} unbudgeted spend` : "across budgeted lines"} />
        <StatTile label="Month-to-date spend" value={formatMoney(s.actualToDateMinor, c, { whole: true })} sub={`${formatPct(s.totalBudgetMinor ? (s.actualToDateMinor / s.totalBudgetMinor) * 100 : null, 0)} of budget used`} />
        <StatTile label="Expected spend to date" value={formatMoney(s.expectedToDateMinor, c, { whole: true })} sub={`Agency pacing ${formatPct(s.expectedToDateMinor ? (s.actualToDateMinor / s.expectedToDateMinor) * 100 : null)}`} />
        <StatTile label="Projected month-end" value={formatMoney(s.projectedMinor, c, { whole: true })} sub={<span className={variance > 0 ? "text-critical-ink" : ""}>{variance >= 0 ? "+" : "−"}{formatMoney(Math.abs(variance), c, { whole: true })} vs budget</span>} />
        <StatTile label="Lines requiring attention" value={`${s.rowsNeedingAttention} of ${s.rowsTotal}`} tone={s.rowsNeedingAttention ? "critical" : "good"} sub={s.staleRows ? `${s.staleRows} with stale data` : "all data current"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <ActionCenter rows={rows} />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Agency pacing — cumulative spend</CardTitle>
              {s.combined && <StatusBadge status={s.combined.status} />}
            </div>
            <CardDescription>
              All budgeted lines on the {period} calendar ({s.combinedRowCount} clients). Lines on other billing periods are excluded from this chart.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.combined ? <PacingChart series={s.combined.series} budgetMinor={s.combined.budgetMinor} asOf={s.combined.asOf} currency={c} /> : <p className="text-sm text-text-3">No budgets for this period yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client budget pacing</CardTitle>
          <CardDescription>Sorted by urgency. Click a column to re-sort.</CardDescription>
        </CardHeader>
        <PacingTable rows={rows} />
      </Card>
    </div>
  );
}
