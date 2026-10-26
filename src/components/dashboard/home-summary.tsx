import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { MetricCard } from "../ui/metric-card";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { costPerResult, describeChange, type ChangeWords } from "@/lib/portfolio";
import type { PortfolioResults } from "@/server/portfolio";

function ChangeLine({ c }: { c: ChangeWords }) {
  const tone = c.verdict === "better" ? "text-good-ink" : c.verdict === "worse" ? "text-critical-ink" : "text-text-2";
  const Icon = c.pct === null || c.verdict === "same" ? Minus : c.pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={`flex items-center gap-1 ${tone}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{c.text}</span>
    </p>
  );
}

function Tile({ label, value, change, info }: { label: string; value: string; change: ChangeWords; info?: string }) {
  return <MetricCard label={label} value={value} info={info} change={<ChangeLine c={change} />} ariaLabel={`${label}: ${value}. ${change.text}.`} />;
}

/** Home: spend, results and cost per result for the last 30 complete days vs the 30 before, across all clients. */
export function HomeSummary({ r }: { r: PortfolioResults }) {
  const c = r.currency;
  const { current: cur, previous: prev } = r.totals;
  const money = (m: number) => formatMoney(m, c, { whole: true });
  const counts = { current: cur.results, previous: prev.results };
  const cpr = costPerResult(cur);
  const prevCpr = costPerResult(prev);
  return (
    <section aria-labelledby="home-summary" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="home-summary" className="text-sm font-semibold">All clients · last 30 days</h2>
        <p className="text-xs text-text-3">
          {formatDate(r.range.from, { month: "short", day: "numeric" })} – {formatDate(r.range.to, { month: "short", day: "numeric" })}, compared with the 30 days before
        </p>
      </div>
      {r.otherCurrencyClients > 0 && (
        <p className="rounded-lg border border-border bg-warning-bg px-3 py-2 text-xs text-warning-ink">
          Clients report in more than one currency ({r.currencies.join(", ")}). These totals include only {c} clients; {r.otherCurrencyClients} client{r.otherCurrencyClients === 1 ? " is" : "s are"} left out rather than added without conversion.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Spent" value={money(cur.spendMinor)} change={describeChange({ current: cur.spendMinor, previous: prev.spendMinor, better: "neutral", format: money })} info="Total ad spend across clients. More or less spend is neither good nor bad on its own." />
        <Tile label="Results" value={formatNumber(cur.results, 0)} change={describeChange({ current: cur.results, previous: prev.results, better: "up", format: (n) => formatNumber(n, 0), counts })} info="Conversions or leads reported by the ad platforms, each counted once." />
        <Tile label="Cost per result" value={cpr === null ? "—" : formatMoney(cpr, c)} change={describeChange({ current: cpr, previous: prevCpr, better: "down", format: (n) => formatMoney(n, c), counts })} info="Spend divided by results: what one result cost on average. Lower is better." />
      </div>
    </section>
  );
}
