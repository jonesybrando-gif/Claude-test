import Link from "next/link";
import { Unplug } from "lucide-react";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { prisma } from "@/server/db";
import { loadPacing, summarize } from "@/server/pacing-service";
import { formatMoney, formatPct } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { StatTile } from "@/components/stat-tile";
import { ActionCenter } from "@/components/dashboard/action-center";
import { PacingTable } from "@/components/dashboard/pacing-table";
import { PacingChart } from "@/components/charts/pacing-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoBadge, StatusBadge } from "@/components/status-badge";
import { ExportButtons } from "@/components/export-buttons";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireAgencyStaff();
  const { status: initialStatus } = await searchParams;
  const [clients, labels, clientLabels] = await Promise.all([
    loadPacing(visibleClientsWhere(user)),
    prisma.clientLabel.findMany({ where: { agencyId: user.agencyId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: visibleClientsWhere(user), select: { id: true, labels: { select: { id: true } } } }),
  ]);
  const labelsByClient = Object.fromEntries(clientLabels.map((c) => [c.id, c.labels.map((l) => l.id)]));
  const rows = clients.flatMap((c) => c.rows);
  const s = summarize(clients);
  // Budget lines with no ad account (or never synced), grouped by client for the banner.
  const unconnected = [...new Map(rows.filter((r) => r.notConnected).map((r) => [r.clientId, { id: r.clientId, name: r.clientName, linked: r.accounts.length > 0 }])).values()];
  const isDemo = rows.some((r) => r.isDemo);
  const c = s.currency;
  const variance = s.projectedMinor - s.totalBudgetMinor;
  const period = s.combined ? `${formatDate(s.combined.periodStart, { month: "long", year: "numeric" })}` : "";

  if (clients.length === 0) {
    const steps = [
      { href: "/clients", title: "Add your first client", body: "Create a client with its reporting time zone." },
      { href: "/integrations", title: "Connect an ad platform", body: "Sign in to Google Ads, Meta or Microsoft and link each ad account to a client." },
      { href: "/clients", title: "Set monthly budgets", body: "Open a client and choose Budgets. Pacing, forecasts and alerts start from there." },
    ];
    return (
      <div className="mx-auto flex max-w-[900px] flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold">Welcome — let&apos;s set up your budget monitor</h1>
          <p className="text-sm text-text-2">You don&apos;t have any clients yet. Three steps and the dashboard fills in.</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map((st, i) => (
            <li key={st.title}>
              <a href={st.href} className="flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-4 hover:bg-surface-2">
                <span className="text-xs font-medium text-text-3">Step {i + 1}</span>
                <span className="font-medium">{st.title}</span>
                <span className="text-sm text-text-2">{st.body}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Advertising Budget Monitor</h1>
          <p className="text-sm text-text-2">
            {[period, `${clients.length} client${clients.length === 1 ? "" : "s"}`, `${s.rowsTotal} budget line${s.rowsTotal === 1 ? "" : "s"} with data`].filter(Boolean).join(" · ")}
            {s.typicalAsOf && <> · data through {formatDate(s.typicalAsOf, { month: "short", day: "numeric" })}</>}
            {s.staleRows > 0 && <span className="text-warning-ink"> · {s.staleRows} line{s.staleRows === 1 ? "" : "s"} with older data</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons base="/api/reports/agency" />
          {isDemo && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-info-bg px-3 py-1.5 text-xs text-info-ink">
              <DemoBadge /> {rows.every((r) => r.isDemo || r.notConnected) ? "Illustrative sample data — no live advertising accounts are connected." : "Some accounts show illustrative sample data, marked “Demo data” on their client pages."}
            </div>
          )}
        </div>
      </div>

      {s.notConnectedRows > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-start sm:justify-between" role="note">
          <div className="flex min-w-0 gap-3">
            <Unplug className="mt-0.5 h-4 w-4 shrink-0 text-text-3" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {s.notConnectedRows} budget line{s.notConnectedRows === 1 ? " has" : "s have"} no ad account connected, so {s.notConnectedRows === 1 ? "it is" : "they are"} left out of the totals, actions and alerts below.
              </p>
              <p className="mt-0.5 text-xs text-text-2">
                {unconnected.slice(0, 8).map((u, i) => (
                  <span key={u.id}>
                    {i > 0 && ", "}
                    <Link href={`/clients/${u.id}/accounts`} className="hover:underline">{u.name}</Link>
                  </span>
                ))}
                {unconnected.length > 8 && <> and {unconnected.length - 8} more</>}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/dashboard?status=NOT_CONNECTED#pacing" className={buttonVariants({ variant: "outline", size: "sm" })}>Show them</Link>
            <Link href="/integrations" className={buttonVariants({ size: "sm" })}>Connect accounts</Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Total monthly budget" value={formatMoney(s.totalBudgetMinor, c, { whole: true })} sub={s.unbudgetedSpendMinor > 0 ? `+ ${formatMoney(s.unbudgetedSpendMinor, c, { whole: true })} unbudgeted spend` : "across budgeted lines"} />
        <StatTile label="Month-to-date spend" value={formatMoney(s.actualToDateMinor, c, { whole: true })} sub={`${formatPct(s.totalBudgetMinor ? (s.actualToDateMinor / s.totalBudgetMinor) * 100 : null, 0)} of budget used`} />
        <StatTile label="Expected spend to date" value={formatMoney(s.expectedToDateMinor, c, { whole: true })} sub={`Agency pacing ${formatPct(s.expectedToDateMinor ? (s.actualToDateMinor / s.expectedToDateMinor) * 100 : null)}`} />
        <StatTile label="Projected month-end" value={formatMoney(s.projectedMinor, c, { whole: true })} sub={<span className={variance > 0 ? "text-critical-ink" : variance < 0 && s.totalBudgetMinor && -variance > s.totalBudgetMinor * 0.05 ? "text-warning-ink" : ""}>{variance >= 0 ? "+" : "−"}{formatMoney(Math.abs(variance), c, { whole: true })} vs budget</span>} />
        <StatTile label="Lines requiring attention" value={`${s.rowsNeedingAttention} of ${s.rowsTotal}`} tone={s.rowsNeedingAttention ? "critical" : "good"} sub={[s.staleRows ? `${s.staleRows} with stale data` : "all data current", s.notConnectedRows ? `${s.notConnectedRows} not connected` : null].filter(Boolean).join(" · ")} />
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
              All connected budget lines on the {period} calendar ({s.combinedRowCount} clients). Lines on other billing periods, or with no ad account connected, are excluded from this chart.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.combined ? <PacingChart series={s.combined.series} budgetMinor={s.combined.budgetMinor} asOf={s.combined.asOf} currency={c} /> : <p className="text-sm text-text-3">No budgets for this period yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card id="pacing" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Client budget pacing</CardTitle>
          <CardDescription>Sorted by urgency. Click a column to re-sort, or filter by client or label.</CardDescription>
        </CardHeader>
        <PacingTable rows={rows} labels={labels} labelsByClient={labelsByClient} initialStatus={initialStatus} />
      </Card>
    </div>
  );
}
