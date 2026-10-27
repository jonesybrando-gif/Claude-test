import Link from "next/link";
import type { SessionUser } from "@/lib/access";
import { prisma } from "@/server/db";
import { visibleClientsWhere } from "@/server/access";
import { getAgencyPerformance } from "@/server/performance";
import { loadPacing } from "@/server/pacing-service";
import { clientAttention, portfolioResults, portfolioResultsFor } from "@/server/portfolio";
import { attentionWeight, costPerResult, describeChange } from "@/lib/portfolio";
import { stillCounting } from "@/lib/results";
import { displayPacingStatus } from "@/lib/pacing/display-status";
import { STATUS_SEVERITY } from "@/lib/pacing/status";
import { pctChange } from "@/lib/metrics";
import { formatMoney, formatNumber } from "@/lib/money";
import type { CompareMode, DateRange, RangePreset } from "@/lib/date-ranges";
import type { BudgetState } from "@/lib/budget-status";
import { Banner } from "@/components/ui/banner";
import { PortfolioTable, type PortfolioRow, type PortfolioTotals } from "./portfolio-table";

/**
 * Clients › Performance: every client on one line — spend, results, cost per
 * result, budget status and a spend trend — for the range picked on the page.
 * Attention (the dot) always uses the last 30 complete days, as on Home.
 */
export async function PerformanceView({ user, today, range, cmpRange, preset, compareMode, initialFilter }: { user: SessionUser; today: string; range: DateRange; cmpRange: DateRange | null; preset: RangePreset; compareMode: CompareMode; initialFilter?: string }) {
  const visible = visibleClientsWhere(user);
  const [pickable, labels, cur, results, attentionResults, pacing] = await Promise.all([
    prisma.client.findMany({ where: visible, select: { id: true, labels: { select: { id: true, name: true, color: true } } } }),
    prisma.clientLabel.findMany({ where: { agencyId: user.agencyId }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    getAgencyPerformance(visible, range),
    portfolioResultsFor(visible, range, cmpRange),
    portfolioResults(visible, today),
    loadPacing(visible),
  ]);
  if (pickable.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center">
        <p className="text-base font-semibold">No clients yet</p>
        <p className="mt-1 text-sm text-text-2">Add a client, link its ad accounts, and its performance shows here.</p>
        {user.role === "AGENCY_ADMIN" && <Link href="/clients?new=1" className="mt-3 inline-block text-sm font-semibold text-brand-text hover:underline">Add your first client</Link>}
      </div>
    );
  }

  const reasons = await clientAttention(pacing, attentionResults);
  const pacingBy = new Map(pacing.map((p) => [p.client.id, p]));
  const labelsBy = new Map(pickable.map((c) => [c.id, c.labels]));
  // Same rule as the client page: recent results may still rise, so no better/worse verdict on them yet.
  const counting = stillCounting(range.to, today);
  const rangeQuery = `range=${preset}&compare=${compareMode}${preset === "custom" ? `&from=${range.from}&to=${range.to}` : ""}`;
  const hasCmp = !!cmpRange;

  const rows: PortfolioRow[] = cur.byClient.map((c) => {
    const p = pacingBy.get(c.clientId);
    const currency = p?.client.currency ?? "USD";
    const r = results.byClient.get(c.clientId);
    const now = r?.current ?? { spendMinor: 0, results: 0 };
    const before = hasCmp ? r?.previous ?? { spendMinor: 0, results: 0 } : null;
    const live = p?.accounts.filter((a) => !a.isDemo || a.lastSuccessfulSyncAt) ?? [];
    const syncs = live.map((a) => a.lastSuccessfulSyncAt).filter((x): x is string => !!x).sort();
    const connected = p?.rows.filter((row) => !row.notConnected) ?? [];
    const why = reasons.get(c.clientId) ?? [];
    const money = (n: number) => formatMoney(n, currency);
    const counts = before ? { current: now.results, previous: before.results } : undefined;
    const cpr = costPerResult(now);
    const prevCpr = before ? costPerResult(before) : null;
    const pacingState: BudgetState =
      !p || (p.rows.length > 0 && connected.length === 0) || p.accounts.length === 0 ? "NOT_CONNECTED" : p.connectedTotal ? displayPacingStatus(p.connectedTotal).status : "NO_BUDGET";
    // The most pressing recommendation among the client's budget lines.
    const next = [...connected]
      .filter((row) => row.action.severity !== "ok")
      .sort((a, b) => (b.result ? STATUS_SEVERITY[displayPacingStatus(b.result).status] : 0) - (a.result ? STATUS_SEVERITY[displayPacingStatus(a.result).status] : 0))[0];
    return {
      id: c.clientId,
      name: c.clientName,
      href: `/clients/${c.clientId}?${rangeQuery}`,
      labels: labelsBy.get(c.clientId) ?? [],
      owner: c.managerName,
      platforms: c.platforms,
      currency,
      spendMinor: c.totals.costMinor,
      spendChangePct: before ? pctChange(c.totals.costMinor, before.spendMinor) : null,
      results: now.results,
      resultUnit: r?.goal === "AWARENESS" ? "clicks" : null,
      resultsChange: before ? describeChange({ current: now.results, previous: before.results, better: "up", format: (n) => formatNumber(n, 0), counts, stillCounting: counting }) : null,
      costPerResultMinor: cpr,
      costPerResultChange: before ? describeChange({ current: cpr, previous: prevCpr, better: "down", format: money, counts, stillCounting: counting }) : null,
      pacing: pacingState,
      varianceMinor: p?.connectedTotal?.projectedVarianceMinor ?? null,
      reasons: why,
      attentionTone: why.some((x) => x.tone === "critical") ? "critical" : why.length ? "watch" : null,
      attentionWeight: attentionWeight(why),
      nextStep: next ? next.action.headline : null,
      dailySpend: c.dailySpend,
      lastSyncAt: syncs[0] ?? null,
      stale: live.some((a) => a.stale),
      isDemo: c.isDemo,
    };
  });

  // Totals in the most common currency only; amounts are never added across currencies.
  const tc = results.currency;
  const { current: tNow, previous: tPrev } = results.totals;
  const tCounts = hasCmp ? { current: tNow.results, previous: tPrev.results } : undefined;
  const tCpr = costPerResult(tNow);
  const inMain = rows.filter((r) => r.currency === tc).length;
  const totals: PortfolioTotals = {
    label: inMain < rows.length ? `All ${tc} clients` : "All clients",
    spend: formatMoney(tNow.spendMinor, tc, { whole: true }),
    spendChangePct: hasCmp ? pctChange(tNow.spendMinor, tPrev.spendMinor) : null,
    results: formatNumber(tNow.results, 0),
    resultsChange: hasCmp ? describeChange({ current: tNow.results, previous: tPrev.results, better: "up", format: (n) => formatNumber(n, 0), counts: tCounts, stillCounting: counting }) : null,
    costPerResult: tCpr === null ? "—" : formatMoney(tCpr, tc),
    costPerResultChange: hasCmp ? describeChange({ current: tCpr, previous: costPerResult(tPrev), better: "down", format: (n) => formatMoney(n, tc), counts: tCounts, stillCounting: counting }) : null,
  };

  return (
    <div className="flex flex-col gap-4">
      {results.currencies.length > 1 && (
        <Banner tone="warning">Clients report in more than one currency ({results.currencies.join(", ")}). Each row is in its own currency; the totals cover {tc} clients only.</Banner>
      )}
      <PortfolioTable rows={rows} totals={totals} labels={labels} initialFilter={initialFilter} combinedHref={`/clients?view=combined&${rangeQuery}`} />
    </div>
  );
}
