import Link from "next/link";
import type { SessionUser } from "@/lib/access";
import { prisma } from "@/server/db";
import { visibleClientsWhere } from "@/server/access";
import { loadPacing, summarize } from "@/server/pacing-service";
import { applyEfficiencyAdvice, highCostPerResultClients, portfolioResults } from "@/server/portfolio";
import { forecastSplit } from "@/lib/portfolio";
import { displayPacingStatus } from "@/lib/pacing/display-status";
import { formatMoney, formatPct } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { MetricCard } from "@/components/ui/metric-card";
import { Banner } from "@/components/ui/banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ActionCenter } from "@/components/dashboard/action-center";
import { PacingTable } from "@/components/dashboard/pacing-table";
import { PacingChart } from "@/components/charts/pacing-chart";
import { StatusBadge } from "@/components/status-badge";

/**
 * Clients › Budgets: the full pacing picture for the current period — the
 * agency totals, what to change today, the cumulative chart and every budget
 * line. Nothing here is simplified; this is where the detail lives.
 */
export async function BudgetsView({ user, today, initialStatus }: { user: SessionUser; today: string; initialStatus?: string }) {
  const visible = visibleClientsWhere(user);
  const [clients, labels, clientLabels, results] = await Promise.all([
    loadPacing(visible),
    prisma.clientLabel.findMany({ where: { agencyId: user.agencyId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: visible, select: { id: true, labels: { select: { id: true } } } }),
    portfolioResults(visible, today),
  ]);
  // Underspend advice checks efficiency first, as on Home.
  applyEfficiencyAdvice(clients, highCostPerResultClients(results));
  const rows = clients.flatMap((c) => c.rows);
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center">
        <p className="text-base font-semibold">No budgets yet</p>
        <p className="mt-1 text-sm text-text-2">Add a monthly budget to a client to get pacing, month-end forecasts and alerts.</p>
        <Link href="/clients?view=manage" className="mt-3 inline-block text-sm font-semibold text-brand-text hover:underline">Choose a client</Link>
      </div>
    );
  }
  const labelsByClient = Object.fromEntries(clientLabels.map((c) => [c.id, c.labels.map((l) => l.id)]));
  // Never add budgets in different currencies: total the most common one and say so.
  const withData = rows.filter((r) => !r.notConnected && r.result);
  const lineCurrencies = [...new Set(withData.map((r) => r.currency))];
  const mainCurrency = mode(withData.map((r) => r.currency)) ?? clients[0]?.client.currency ?? "USD";
  const s = summarize(lineCurrencies.length > 1 ? clients.filter((c) => c.client.currency === mainCurrency) : clients);
  const c = lineCurrencies.length > 1 ? mainCurrency : s.currency;
  const split = forecastSplit(
    rows.filter((r) => !r.notConnected && r.result && r.result.phase === "ACTIVE").map((r) => ({ currency: r.currency, shownStatus: displayPacingStatus(r.result!).status, projectedVarianceMinor: r.result!.projectedVarianceMinor })),
    mainCurrency,
  );
  const whole = (m: number) => formatMoney(m, c, { whole: true });
  const variance = s.projectedMinor - s.totalBudgetMinor;
  const period = s.combined ? formatDate(s.combined.periodStart, { month: "long", year: "numeric" }) : "";
  const unconnected = [...new Map(rows.filter((r) => r.notConnected).map((r) => [r.clientId, { id: r.clientId, name: r.clientName }])).values()];

  return (
    <div className="flex flex-col gap-6">
      {lineCurrencies.length > 1 && (
        <Banner tone="warning">Budgets use more than one currency ({lineCurrencies.join(", ")}). The totals cover {c} budgets only; amounts are never added across currencies.</Banner>
      )}
      {s.notConnectedRows > 0 && (
        <Banner
          action={<Link href="/integrations" className={buttonVariants({ size: "sm", variant: "outline" })}>Connect accounts</Link>}
        >
          {s.notConnectedRows} budget line{s.notConnectedRows === 1 ? " has" : "s have"} no ad account, so {s.notConnectedRows === 1 ? "it is" : "they are"} left out of the totals:{" "}
          {unconnected.slice(0, 6).map((u, i) => (
            <span key={u.id}>{i > 0 && ", "}<Link href={`/clients/${u.id}/accounts`} className="hover:underline">{u.name}</Link></span>
          ))}
          {unconnected.length > 6 && <> and {unconnected.length - 6} more</>}.
        </Banner>
      )}

      <section aria-label={`Budget totals${period ? `, ${period}` : ""}`} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={`Budget${period ? ` · ${formatDate(s.combined!.periodStart, { month: "long" })}` : ""}`}
          info="The total of every budgeted line in the current period that has an ad account with data."
          value={whole(s.totalBudgetMinor)}
          change={<span className="text-text-2">{s.unbudgetedSpendMinor > 0 ? `+ ${whole(s.unbudgetedSpendMinor)} spent without a budget` : `${s.rowsTotal} budget line${s.rowsTotal === 1 ? "" : "s"}`}</span>}
        />
        <MetricCard
          label="Spent so far"
          info="Spend from the start of the period through the last complete day. Today's partial spend is left out."
          value={whole(s.actualToDateMinor)}
          change={<span className="text-text-2">{formatPct(s.totalBudgetMinor ? (s.actualToDateMinor / s.totalBudgetMinor) * 100 : null, 0)} of budget · plan by now {whole(s.expectedToDateMinor)}</span>}
        />
        <MetricCard
          label="Projected month-end"
          info="An estimate at each line's recent rate of spend. Over and under are counted separately so they don't cancel out."
          value={whole(s.projectedMinor)}
          change={
            <span className="text-text-2">
              {variance >= 0 ? "+" : "−"}{whole(Math.abs(variance))} vs budget · <span className={split.overLines ? "text-critical-ink" : ""}>{split.overLines} over</span> · <span className={split.underLines ? "text-warning-ink" : ""}>{split.underLines} under</span>
            </span>
          }
        />
        <MetricCard
          label="Lines needing action"
          info="Budget lines whose pacing or forecast is off plan, or whose data is old or disconnected."
          value={`${s.rowsNeedingAttention} of ${s.rowsTotal}`}
          change={<span className="text-text-2">{[s.staleRows ? `${s.staleRows} with old data` : "all data current", s.notConnectedRows ? `${s.notConnectedRows} not connected` : null].filter(Boolean).join(" · ")}</span>}
        />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <ActionCenter rows={rows} />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Cumulative spend{period && ` · ${period}`}</CardTitle>
              {s.combined && <StatusBadge status={s.combined.status} />}
            </div>
            <CardDescription>All connected budget lines on this calendar ({s.combinedRowCount} clients). Lines on other billing periods are left out.</CardDescription>
          </CardHeader>
          <CardContent>
            {s.combined ? (
              <PacingChart series={s.combined.series} budgetMinor={s.combined.budgetMinor} asOf={s.combined.asOf} currency={c} />
            ) : (
              <p className="py-6 text-sm text-text-2">The chart fills in once a client has a monthly budget and a synced ad account.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="pacing" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Every budget line</CardTitle>
          <CardDescription>Most urgent first. Sort by any column, or filter by client, label, platform or status.</CardDescription>
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
