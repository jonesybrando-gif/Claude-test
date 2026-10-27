import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { MetricCard } from "../ui/metric-card";
import { formatMoney, formatNumber } from "@/lib/money";
import { costPerResult, describeChange, type ChangeWords } from "@/lib/portfolio";
import type { PortfolioResults } from "@/server/portfolio";

function ChangeLine({ c, short }: { c: ChangeWords; short: string }) {
  const tone = c.verdict === "better" ? "text-good-ink" : c.verdict === "worse" ? "text-critical-ink" : "text-text-2";
  const Icon = c.pct === null || c.verdict === "same" || c.verdict === "none" || c.verdict === "too_few" ? Minus : c.pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`flex items-center gap-1 ${tone}`} title={c.text}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span aria-hidden>{short}</span>
      <span className="sr-only">{c.text}</span>
    </p>
  );
}

/** "Down 24% vs Sep 1–25", "About the same as Sep 1–25", "Too few to compare", "Up 8% vs Sep 1–25 · still counting". */
function shortChange(c: ChangeWords, vs: string): string {
  if (c.verdict === "too_few") return "Too few to compare";
  if (c.verdict === "none" || c.pct === null) return "No earlier data";
  if (c.verdict === "same") return `About the same as ${vs}`;
  const base = `${c.pct > 0 ? "Up" : "Down"} ${Math.round(Math.abs(c.pct))}% vs ${vs}`;
  return c.verdict === "counting" ? `${base} · still counting` : base;
}

/**
 * Home's four headline figures for the month so far, compared with the same
 * days last month: spend, results, cost per result, and how many clients
 * need attention.
 */
export function HomeSummary({ r, vs, attention, critical, total, counting = false }: { r: PortfolioResults; vs: string; attention: number; critical: number; total: number; counting?: boolean }) {
  const c = r.currency;
  const { current: cur, previous: prev } = r.totals;
  const money = (m: number) => formatMoney(m, c, { whole: true });
  const counts = { current: cur.results, previous: prev.results };
  const cpr = costPerResult(cur);
  const prevCpr = costPerResult(prev);
  const spend = describeChange({ current: cur.spendMinor, previous: prev.spendMinor, better: "neutral", format: money });
  const results = describeChange({ current: cur.results, previous: prev.results, better: "up", format: (n) => formatNumber(n, 0), counts, stillCounting: counting });
  const cost = describeChange({ current: cpr, previous: prevCpr, better: "down", format: (n) => formatMoney(n, c), counts, stillCounting: counting });
  return (
    <section aria-label="Agency performance this month" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Ad spend" info="Total ad spend across your clients this month so far. More or less spend is neither good nor bad on its own." value={money(cur.spendMinor)} change={<ChangeLine c={spend} short={shortChange(spend, vs)} />} />
      <MetricCard label="Results" info="Each client's main result, as set by its goal: leads, calls, sales or bookings reported by the ad platforms, each counted once. Clicks for awareness clients aren't added in when other goals are present." value={formatNumber(cur.results, 0)} change={<ChangeLine c={results} short={shortChange(results, vs)} />} />
      <MetricCard label="Cost per result" info="Ad spend divided by results: what one result cost on average. Lower is better." value={cpr === null ? "—" : formatMoney(cpr, c)} change={<ChangeLine c={cost} short={shortChange(cost, vs)} />} />
      <MetricCard
        label="Clients needing attention"
        info="Critical: a lost connection, broken tracking, spend stopped, or a budget forecast to run over. Watch: smaller budget misses, falling results, rising costs or old data. Judged on the last 30 complete days."
        value={<>{attention} <span className="text-base font-medium tracking-normal text-text-3">of {total}</span></>}
        href="/clients?filter=attention"
        ariaLabel={`${attention} of ${total} clients need attention, ${critical} critical`}
        change={<span className={critical ? "font-medium text-critical-ink" : "text-text-2"}>{critical ? `${critical} critical` : attention ? "None critical" : "All clear"}</span>}
      />
    </section>
  );
}
