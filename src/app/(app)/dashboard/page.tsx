import { Suspense } from "react";
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
import { SetupChecklist } from "@/components/setup-checklist";
import { BudgetRolloverBanner } from "@/components/dashboard/budget-rollover-banner";
import { setupChecklist } from "@/server/first-run";
import { PageSkeleton } from "@/components/ui/skeleton";
import { HomeSummary } from "@/components/dashboard/home-summary";
import { NeedsAttention, type AttentionClient } from "@/components/dashboard/needs-attention";
import { applyEfficiencyAdvice, clientAttention, highCostPerResultClients, portfolioResults } from "@/server/portfolio";
import { attentionWeight, forecastSplit } from "@/lib/portfolio";
import { displayPacingStatus } from "@/lib/pacing/display-status";
import { todayInTimeZone } from "@/lib/pacing/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireAgencyStaff();
  const { status: initialStatus } = await searchParams;
  // The shell streams at once; pacing loads inside an in-page boundary (not a
  // route loading.tsx, which made value-returning server actions hang).
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1500px]"><PageSkeleton tiles={3} cards={3} /></div>}>
      <PacingDashboard user={user} initialStatus={initialStatus} />
    </Suspense>
  );
}

async function PacingDashboard({ user, initialStatus }: { user: Awaited<ReturnType<typeof requireAgencyStaff>>; initialStatus?: string }) {
  const agency = await prisma.agency.findUniqueOrThrow({ where: { id: user.agencyId }, select: { defaultTimezone: true } });
  const [clients, labels, clientLabels, results] = await Promise.all([
    loadPacing(visibleClientsWhere(user)),
    prisma.clientLabel.findMany({ where: { agencyId: user.agencyId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: visibleClientsWhere(user), select: { id: true, labels: { select: { id: true } } } }),
    portfolioResults(visibleClientsWhere(user), todayInTimeZone(agency.defaultTimezone)),
  ]);
  // Underspend advice checks efficiency first (H6); then who needs attention and why (H1).
  applyEfficiencyAdvice(clients, highCostPerResultClients(results));
  const reasons = await clientAttention(clients, results);
  const attention: AttentionClient[] = clients
    .map((c) => ({ id: c.client.id, name: c.client.name, reasons: reasons.get(c.client.id) ?? [], spend: results.byClient.get(c.client.id)?.current.spendMinor ?? 0 }))
    .filter((c) => c.reasons.length > 0)
    .sort((a, b) => attentionWeight(b.reasons) - attentionWeight(a.reasons) || b.spend - a.spend);
  const labelsByClient = Object.fromEntries(clientLabels.map((c) => [c.id, c.labels.map((l) => l.id)]));
  const rows = clients.flatMap((c) => c.rows);
  // Never add budgets in different currencies: pace totals for the most common one and say so.
  const lineCurrencies = [...new Set(rows.filter((r) => !r.notConnected && r.result).map((r) => r.currency))];
  const mainCurrency = mode(rows.filter((r) => !r.notConnected && r.result).map((r) => r.currency)) ?? clients[0]?.client.currency ?? "USD";
  const s = summarize(lineCurrencies.length > 1 ? clients.filter((c) => c.client.currency === mainCurrency) : clients);
  const split = forecastSplit(
    rows.filter((r) => !r.notConnected && r.result && r.result.phase === "ACTIVE").map((r) => ({ currency: r.currency, shownStatus: displayPacingStatus(r.result!).status, projectedVarianceMinor: r.result!.projectedVarianceMinor })),
    mainCurrency,
  );
  // Budget lines with no ad account (or never synced), grouped by client for the banner.
  const unconnected = [...new Map(rows.filter((r) => r.notConnected).map((r) => [r.clientId, { id: r.clientId, name: r.clientName, linked: r.accounts.length > 0 }])).values()];
  const isDemo = rows.some((r) => r.isDemo);
  const c = lineCurrencies.length > 1 ? mainCurrency : s.currency;
  const variance = s.projectedMinor - s.totalBudgetMinor;
  const whole = (m: number) => formatMoney(m, c, { whole: true });
  const period = s.combined ? `${formatDate(s.combined.periodStart, { month: "long", year: "numeric" })}` : "";

  const checklist = user.role === "AGENCY_ADMIN" ? await setupChecklist(user.agencyId) : null;
  const showChecklist = checklist && !checklist.dismissed;

  if (clients.length === 0) {
    return (
      <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold">Welcome. Let&apos;s set up budget pacing</h1>
          <p className="text-sm text-text-2">You don&apos;t have any clients yet. Work through these steps and this page fills in.</p>
        </div>
        {checklist ? (
          <SetupChecklist steps={checklist.steps} dismissible={false} />
        ) : (
          <p className="text-sm text-text-2">No clients are assigned to you yet. Ask an administrator to assign you a client.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Home</h1>
          <p className="text-sm text-text-2">
            {`${clients.length} client${clients.length === 1 ? "" : "s"}`}
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

      <BudgetRolloverBanner user={user} />

      <HomeSummary r={results} />

      <NeedsAttention clients={attention} total={clients.length} />

      {showChecklist && <SetupChecklist steps={checklist.steps} />}

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

      <h2 className="-mb-2 pt-2 text-base font-semibold">
        Budget pacing
        <span className="font-normal text-text-2">{[period, `${s.rowsTotal} budget line${s.rowsTotal === 1 ? "" : "s"} with data`].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
      </h2>
      {lineCurrencies.length > 1 && (
        <p className="rounded-lg border border-border bg-warning-bg px-3 py-2 text-xs text-warning-ink">
          Budgets use more than one currency ({lineCurrencies.join(", ")}). The totals below cover {c} budgets only; amounts are never added across currencies.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Total monthly budget" value={formatMoney(s.totalBudgetMinor, c, { whole: true })} sub={s.unbudgetedSpendMinor > 0 ? `+ ${formatMoney(s.unbudgetedSpendMinor, c, { whole: true })} unbudgeted spend` : "across budgeted lines"} />
        <StatTile label="Month-to-date spend" value={formatMoney(s.actualToDateMinor, c, { whole: true })} sub={`${formatPct(s.totalBudgetMinor ? (s.actualToDateMinor / s.totalBudgetMinor) * 100 : null, 0)} of budget used`} />
        <StatTile label="Expected spend to date" value={formatMoney(s.expectedToDateMinor, c, { whole: true })} sub={`Agency pacing ${formatPct(s.expectedToDateMinor ? (s.actualToDateMinor / s.expectedToDateMinor) * 100 : null)}`} />
        <StatTile
          label="Projected month-end"
          value={whole(s.projectedMinor)}
          sub={
            <>
              <span className={split.overLines ? "text-critical-ink" : ""}>Over: {whole(split.overMinor)} across {split.overLines} line{split.overLines === 1 ? "" : "s"}</span>
              {" · "}
              <span className={split.underLines ? "text-warning-ink" : ""}>Under: {whole(split.underMinor)} across {split.underLines} line{split.underLines === 1 ? "" : "s"}</span>
              <span className="mt-0.5 block text-[11px] text-text-3">Net {variance >= 0 ? "+" : "−"}{whole(Math.abs(variance))} vs budget</span>
            </>
          }
        />
        <StatTile label="Lines requiring attention" value={`${s.rowsNeedingAttention} of ${s.rowsTotal}`} tone={s.rowsNeedingAttention ? "critical" : "good"} sub={[s.staleRows ? `${s.staleRows} with stale data` : "all data current", s.notConnectedRows ? `${s.notConnectedRows} not connected` : null].filter(Boolean).join(" · ")} />
      </div>

      {/* Each card is sized to its own content (no stretched, half-empty chart card). */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
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
            {s.combined ? (
              <PacingChart series={s.combined.series} budgetMinor={s.combined.budgetMinor} asOf={s.combined.asOf} currency={c} />
            ) : (
              <div className="flex flex-col items-start gap-3 py-6">
                <p className="text-sm text-text-2">{s.notConnectedRows ? "None of this period's budgets has an ad account with data yet." : "No budgets are set for this period yet."} The chart fills in once a client has a monthly budget and a synced ad account.</p>
                <Link href={s.notConnectedRows ? "/integrations" : "/clients"} className={buttonVariants({ size: "sm" })}>{s.notConnectedRows ? "Connect ad accounts" : "Set a budget"}</Link>
              </div>
            )}
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

function mode<T>(xs: T[]): T | null {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
