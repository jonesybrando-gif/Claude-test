import type { ReactNode } from "react";
import type { ClientReport } from "@/server/client-report";
import { campaignTable, dailySeries, kpiTiles, spendSlices, type Change, type Tone } from "@/server/report-dashboard-data";
import { budgetTile } from "@/lib/at-a-glance";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { DailyResultsChart } from "./daily-results-chart";

export { changeBadge } from "@/server/report-dashboard-data";

// The client-facing report dashboard: navy KPI tiles with a change badge on
// each, dark section bands, a daily spend and results chart, where the budget
// went, and a campaign table with a totals row and the change under every
// figure. The figures come from src/server/report-dashboard-data.ts, which the
// PDF (src/server/pdf/client-dashboard.ts) draws from too.

const PILL: Record<Tone, string> = {
  good: "bg-[#ddf3ee] text-[#0b5e57]",
  bad: "bg-[#fde7e4] text-[#9f1f14]",
  neutral: "bg-tile-track text-tile-ink",
};
const INK: Record<Tone, string> = { good: "text-good-ink", bad: "text-critical-ink", neutral: "text-text-3" };

/** A dark full-width band that opens a section, as in classic agency reports. */
export function ReportBand({ title, note, id }: { title: string; note?: string; id?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-band px-5 py-3.5 text-band-ink">
      <h2 id={id} className="text-lg font-bold tracking-tight">{title}</h2>
      {note && <p className="text-sm text-band-muted">{note}</p>}
    </div>
  );
}

function KpiTile({ label, value, change, sub }: { label: string; value: string; change: Change; sub?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-tile px-4 py-4 text-tile-ink">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-tile-muted">{label}</h3>
        {change && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${PILL[change.tone]}`}>
            <span aria-hidden>{change.badge}</span>
            <span className="sr-only">{change.aria}</span>
          </span>
        )}
      </div>
      <p className="text-3xl font-extrabold tracking-tight tabular">{value}</p>
      {sub && <p className="text-xs text-tile-muted">{sub}</p>}
    </div>
  );
}

/** The headline figures as tiles: spend, results, cost per result, clicks, click-through rate and impressions (plus CallRail calls when linked). */
export function ReportKpiTiles({ rep }: { rep: ClientReport }) {
  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {kpiTiles(rep).map((t) => <KpiTile key={t.label} label={t.label} value={t.value} change={t.change} sub={t.sub} />)}
    </section>
  );
}

/** Spend against the current budget, on a navy card. Null when no budget is set. */
export function BudgetCard({ rep }: { rep: ClientReport }) {
  const p = rep.pacing.total;
  if (!p || p.budgetMinor <= 0) return null;
  const c = rep.client.currency;
  const tile = budgetTile(p, c);
  const used = Math.max(0, Math.min(100, (p.actualToDateMinor / p.budgetMinor) * 100));
  const month = p.periodStart.endsWith("-01") && p.periodStart.slice(0, 7) === p.periodEnd.slice(0, 7);
  const name = month ? formatDate(p.periodStart, { month: "long", year: "numeric" }) : `${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}`;
  return (
    <section aria-labelledby="budget-card-title" className="flex min-w-0 flex-col gap-3 rounded-xl bg-tile px-5 py-5 text-tile-ink">
      <div className="flex items-start justify-between gap-2">
        <h2 id="budget-card-title" className="text-[15px] font-bold">Budget · {name}</h2>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${PILL[tile.tone]}`}>{tile.short}</span>
      </div>
      <p className="text-3xl font-extrabold tracking-tight tabular">
        {formatMoney(p.actualToDateMinor, c, { whole: true })} <span className="text-base font-semibold text-tile-muted">of {formatMoney(p.budgetMinor, c, { whole: true })}</span>
      </p>
      <div className="h-2.5 overflow-hidden rounded-full bg-tile-track" role="img" aria-label={`${Math.round(used)}% of the budget spent`}>
        <div className="h-full rounded-full bg-[#f2a766]" style={{ width: `${used}%` }} />
      </div>
      <p className="text-sm text-tile-muted">
        {p.phase === "ENDED" ? "Final spend for the period." : `At the current pace this period ends near ${formatMoney(p.projectedMinor, c, { whole: true })} (estimate).`}
      </p>
    </section>
  );
}

/** "Where the budget went": spend share by campaign as a ring, top five plus everything else. */
export function SpendShare({ rep }: { rep: ClientReport }) {
  const c = rep.client.currency;
  const total = rep.perf.totals.costMinor;
  const slices = spendSlices(rep);
  if (slices.length === 0) return null;
  let acc = 0;
  const stops = slices.map((s) => {
    const from = acc;
    acc += s.pct;
    return `${s.color} ${from}% ${acc}%`;
  });
  const pct = (p: number) => `${Math.round(p)}%`;
  return (
    <section aria-labelledby="spend-share-title" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <h3 id="spend-share-title" className="text-[15px] font-semibold">Where the budget went</h3>
      <div className="flex justify-center">
        <div role="img" aria-label={`Spend by campaign: ${slices.map((s) => `${s.name} ${pct(s.pct)}`).join(", ")}`} className="flex h-44 w-44 items-center justify-center rounded-full" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-surface">
            <span className="text-xl font-extrabold tracking-tight tabular">{formatMoney(total, c, { whole: true })}</span>
            <span className="text-xs text-text-3">total spend</span>
          </div>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {slices.map((s) => (
          <li key={s.name} className="grid grid-cols-[12px_minmax(0,1fr)_auto_2.5rem] items-center gap-2.5 text-[13px]">
            <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: s.color }} />
            <span className="truncate" title={s.name}>{s.name}</span>
            <span className="font-semibold tabular">{formatMoney(s.minor, c, { whole: true })}</span>
            <span className="text-right text-text-3 tabular">{pct(s.pct)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The daily chart card: spend bars and results (or conversions) per day. */
export function DailyCard({ rep }: { rep: ClientReport }) {
  const { label, days } = dailySeries(rep);
  if (days.length === 0) return null;
  return (
    <section aria-labelledby="daily-title" className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <h3 id="daily-title" className="text-[15px] font-semibold">Spend and {label.toLowerCase()} by day</h3>
      <DailyResultsChart days={days} resultLabel={label} currency={rep.client.currency} notes={rep.notes.filter((n) => n.clientVisible).map((n) => ({ date: n.date, text: n.text }))} />
    </section>
  );
}

function Delta({ ch }: { ch: Change }) {
  if (!ch) return <span className="block h-4" aria-hidden />;
  return (
    <span className={`block text-xs font-semibold ${INK[ch.tone]}`}>
      <span aria-hidden>{ch.badge}</span>
      <span className="sr-only">{ch.aria}</span>
    </span>
  );
}

/** Campaigns that ran, with a totals row first and the change under every figure. */
export function CampaignPerformance({ rep }: { rep: ClientReport }) {
  const { heads, totals, rows } = campaignTable(rep);
  if (rows.length === 0) return <p className="rounded-xl border border-border bg-surface px-5 py-6 text-sm text-text-3">No campaign ran in this period.</p>;
  const cellClass = (i: number) => `py-3.5 text-right align-top tabular ${i === heads.length - 1 ? "pr-5 pl-3" : "px-3"}`;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-[13px]">
          <caption className="sr-only">Campaign performance with the change from the previous period</caption>
          <thead>
            <tr className="bg-surface-2 text-text-2">
              <th scope="col" className="px-5 py-3 text-left font-semibold">Campaign</th>
              {heads.map((h, i) => (
                <th key={h} scope="col" className={`py-3 text-right font-semibold ${i === heads.length - 1 ? "pr-5 pl-3" : "px-3"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totals && (
              <tr className="bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] font-bold">
                <th scope="row" className="px-5 py-3.5 text-left text-[15px]">Total</th>
                {totals.map((cell, i) => (
                  <td key={heads[i]} className={cellClass(i)}>{cell.v}<Delta ch={cell.ch} /></td>
                ))}
              </tr>
            )}
            {rows.map(({ line: l, cells }) => (
              <tr key={l.id} className="border-t border-border">
                <th scope="row" className="max-w-80 px-5 py-3.5 text-left align-top font-semibold">
                  <span className="block">{l.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5 text-xs font-normal text-text-3">
                    <span>{l.platform}</span>
                    <span aria-hidden>·</span>
                    <span>{l.status.charAt(0) + l.status.slice(1).toLowerCase()}</span>
                  </span>
                </th>
                {cells.map((cell, i) => (
                  <td key={heads[i]} className={cellClass(i)}>{cell.v}<Delta ch={cell.ch} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rep.cmpRange && <p className="border-t border-border px-5 py-2.5 text-xs text-text-3">Change compared with {formatDate(rep.cmpRange.from)} – {formatDate(rep.cmpRange.to, { month: "short", day: "numeric", year: "numeric" })}.</p>}
    </div>
  );
}

/** Two-column row that collapses to one: the summary beside the budget card. */
export function SummaryRow({ summary, budget }: { summary: ReactNode; budget: ReactNode }) {
  if (!summary) return budget ? <div className="max-w-md">{budget}</div> : null;
  if (!budget) return <>{summary}</>;
  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">{summary}{budget}</div>;
}
