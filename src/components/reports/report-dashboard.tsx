import type { ReactNode } from "react";
import { reportResults, type ClientReport } from "@/server/client-report";
import { budgetTile } from "@/lib/at-a-glance";
import { changeVerdict, changeWords } from "@/lib/change";
import { derive, pctChange, type MetricTotals } from "@/lib/metrics";
import { formatMoney, formatNumber, formatPct } from "@/lib/money";
import { lineResults } from "@/lib/results";
import { displayCampaignName } from "@/lib/campaign-name";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { formatDate } from "@/lib/time";
import { DailyResultsChart } from "./daily-results-chart";

// The client-facing report dashboard: navy KPI tiles with a change badge on
// each, dark section bands, a daily spend and results chart, where the budget
// went, and a campaign table with a totals row and the change under every
// figure. Every number comes from the same report data as the PDF and CSV.

type Tone = "good" | "bad" | "neutral";
type Change = { badge: string; tone: Tone; aria: string } | null;

/** The badge for a figure's change: "▲ 17%", "About the same", "Too few to compare"; null with nothing to compare. */
export function changeBadge(label: string, cur: number | null, prev: number | null | undefined, previousText: string, opts: { better: "up" | "down" | "neutral"; sample?: { current: number; previous: number } | null; stillCounting?: boolean }): Change {
  if (cur === null || prev === null || prev === undefined) return null;
  const pct = pctChange(cur, prev);
  const { verdict, tone } = changeVerdict({ changePct: pct, ...opts });
  if (!verdict || pct === null) return null;
  const { aria } = changeWords(verdict, pct, previousText, label);
  const badge = verdict === "few" ? "Too few to compare" : verdict === "same" ? "About the same" : `${pct > 0 ? "▲" : "▼"} ${Math.round(Math.abs(pct))}%${verdict === "counting" ? " so far" : ""}`;
  return { badge, tone: tone ?? "neutral", aria };
}

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
  const c = rep.client.currency;
  const t = rep.perf.totals;
  const p = rep.cmpPerf?.totals ?? null;
  const d = derive(t);
  const pd = p ? derive(p) : null;
  const { current: r, previous: pr, stillCounting } = reportResults(rep);
  const awareness = r.goal === "AWARENESS";
  const counting = stillCounting && !awareness;
  const sample = pr ? { current: r.value, previous: pr.value } : null;
  const money = (m: number) => formatMoney(m, c, { whole: true });
  const cost = (m: number) => formatMoney(m, c, { whole: Math.abs(m) >= 10000 });
  const was = (s: string | null) => (s === null ? null : `Previous period: ${s}`);
  const calls = rep.callsFromAds;

  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label={t.hasEstimatedCost ? "Spent (incl. estimate)" : "Spent"}
        value={money(t.costMinor)}
        change={p ? changeBadge("Spent", t.costMinor, p.costMinor, money(p.costMinor), { better: "neutral" }) : null}
        sub={p ? was(money(p.costMinor)) : null}
      />
      {!awareness && (
        <KpiTile
          label={r.label}
          value={formatNumber(Math.round(r.value))}
          change={pr ? changeBadge(r.label, r.value, pr.value, formatNumber(Math.round(pr.value)), { better: "up", sample, stillCounting: counting }) : null}
          sub={pr ? was(formatNumber(Math.round(pr.value))) : null}
        />
      )}
      {!awareness && (
        <KpiTile
          label={`Cost per ${r.singular}`}
          value={r.costPerMinor === null ? "—" : cost(r.costPerMinor)}
          change={pr && r.costPerMinor !== null && pr.costPerMinor !== null ? changeBadge(`Cost per ${r.singular}`, r.costPerMinor, pr.costPerMinor, cost(pr.costPerMinor), { better: "down", sample, stillCounting: counting }) : null}
          sub={pr?.costPerMinor != null ? was(cost(pr.costPerMinor)) : r.costPerMinor === null ? `No ${r.label.toLowerCase()} yet` : null}
        />
      )}
      <KpiTile
        label="Clicks"
        value={formatNumber(t.clicks)}
        change={p ? changeBadge("Clicks", t.clicks, p.clicks, formatNumber(p.clicks), { better: "up", sample: { current: t.clicks, previous: p.clicks } }) : null}
        sub={p ? was(formatNumber(p.clicks)) : null}
      />
      <KpiTile
        label="Click-through rate"
        value={d.ctr === null ? "—" : formatPct(d.ctr, 2)}
        change={pd && d.ctr !== null && pd.ctr !== null ? changeBadge("Click-through rate", d.ctr, pd.ctr, formatPct(pd.ctr, 2), { better: "up" }) : null}
        sub={pd?.ctr != null ? was(formatPct(pd.ctr, 2)) : "Clicks ÷ times ads were shown"}
      />
      {calls ? (
        <KpiTile
          label="Calls from ads (CallRail)"
          value={formatNumber(calls.current)}
          change={calls.previous !== null ? changeBadge("Calls from ads", calls.current, calls.previous, formatNumber(calls.previous), { better: "up", sample: { current: calls.current, previous: calls.previous } }) : null}
          sub="Tracked by CallRail; not added to the total"
        />
      ) : (
        <KpiTile
          label="Times ads were shown"
          value={formatNumber(t.impressions)}
          change={p ? changeBadge("Impressions", t.impressions, p.impressions, formatNumber(p.impressions), { better: "neutral" }) : null}
          sub={p ? was(formatNumber(p.impressions)) : null}
        />
      )}
      {awareness && (
        <KpiTile
          label="Cost per click"
          value={d.cpcMinor === null ? "—" : formatMoney(d.cpcMinor, c)}
          change={pd && d.cpcMinor !== null && pd.cpcMinor !== null ? changeBadge("Cost per click", d.cpcMinor, pd.cpcMinor, formatMoney(pd.cpcMinor, c), { better: "down", sample: { current: t.clicks, previous: p!.clicks } }) : null}
          sub={pd?.cpcMinor != null ? was(formatMoney(pd.cpcMinor, c)) : null}
        />
      )}
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

/** One row per campaign that ran: current figures plus the previous period's, per campaign. */
function campaignLines(rep: ClientReport) {
  const awareness = reportResults(rep).current.goal === "AWARENESS";
  const resultsOf = (m: MetricTotals) => (awareness ? m.clicks : lineResults(m));
  return rep.client.accounts
    .flatMap((a) =>
      a.campaigns.map((cmp) => {
        const m = rep.perf.byCampaign[cmp.id];
        const pm = rep.cmpPerf?.byCampaign[cmp.id] ?? null;
        return { id: cmp.id, name: displayCampaignName(cmp.name), platform: PLATFORM_LABEL[a.platform] ?? a.platform, status: cmp.status, m, pm, results: m ? resultsOf(m) : 0, prevResults: pm ? resultsOf(pm) : null };
      }),
    )
    .filter((x): x is typeof x & { m: MetricTotals } => !!x.m && (x.m.costMinor > 0 || x.m.impressions > 0 || x.m.clicks > 0))
    .sort((a, b) => b.m.costMinor - a.m.costMinor || a.name.localeCompare(b.name));
}

/** "Where the budget went": spend share by campaign as a ring, top five plus everything else. */
export function SpendShare({ rep }: { rep: ClientReport }) {
  const c = rep.client.currency;
  const total = rep.perf.totals.costMinor;
  const lines = campaignLines(rep).filter((l) => l.m.costMinor > 0);
  if (total <= 0 || lines.length === 0) return null;
  const top = lines.slice(0, 5).map((l) => ({ name: l.name, minor: l.m.costMinor }));
  const rest = lines.slice(5).reduce((n, l) => n + l.m.costMinor, 0);
  const slices = [...top, ...(rest > 0 ? [{ name: "Other campaigns", minor: rest }] : [])];
  const COLORS = ["#2f6fa8", "#e08a3c", "#14304a", "#5fa59a", "#9b7ed9", "#b9bec6"];
  let acc = 0;
  const stops = slices.map((s, i) => {
    const from = acc;
    acc += (s.minor / total) * 100;
    return `${COLORS[i % COLORS.length]} ${from}% ${acc}%`;
  });
  const pct = (m: number) => `${Math.round((m / total) * 100)}%`;
  return (
    <section aria-labelledby="spend-share-title" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <h3 id="spend-share-title" className="text-[15px] font-semibold">Where the budget went</h3>
      <div className="flex justify-center">
        <div role="img" aria-label={`Spend by campaign: ${slices.map((s) => `${s.name} ${pct(s.minor)}`).join(", ")}`} className="flex h-44 w-44 items-center justify-center rounded-full" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-surface">
            <span className="text-xl font-extrabold tracking-tight tabular">{formatMoney(total, c, { whole: true })}</span>
            <span className="text-xs text-text-3">total spend</span>
          </div>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {slices.map((s, i) => (
          <li key={s.name} className="grid grid-cols-[12px_minmax(0,1fr)_auto_2.5rem] items-center gap-2.5 text-[13px]">
            <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="truncate" title={s.name}>{s.name}</span>
            <span className="font-semibold tabular">{formatMoney(s.minor, c, { whole: true })}</span>
            <span className="text-right text-text-3 tabular">{pct(s.minor)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The daily chart card: spend bars and results (or conversions) per day. */
export function DailyCard({ rep }: { rep: ClientReport }) {
  const { current: r } = reportResults(rep);
  const awareness = r.goal === "AWARENESS";
  // Daily figures are blended across accounts, so results can only be split by day exactly for one account.
  const single = rep.client.accounts.length === 1;
  const label = awareness ? "Clicks" : single ? r.label : "Conversions";
  const days = rep.perf.byDate.map((d) => ({ date: d.date, spendMinor: d.costMinor, results: awareness ? d.clicks : single ? lineResults(d) : d.conversions }));
  if (!days.some((d) => d.spendMinor > 0 || d.results > 0)) return null;
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
  const c = rep.client.currency;
  const lines = campaignLines(rep);
  if (lines.length === 0) return <p className="rounded-xl border border-border bg-surface px-5 py-6 text-sm text-text-3">No campaign ran in this period.</p>;
  const { current: r, previous: pr, stillCounting } = reportResults(rep);
  const awareness = r.goal === "AWARENESS";
  const counting = stillCounting && !awareness;
  const t = rep.perf.totals;
  const p = rep.cmpPerf?.totals ?? null;
  const money = (m: number) => formatMoney(m, c, { whole: true });
  const cost = (m: number | null) => (m === null ? "—" : formatMoney(m, c, { whole: Math.abs(m) >= 10000 }));
  const ctr = (m: MetricTotals) => derive(m).ctr;
  const per = (spend: number, n: number) => (n > 0 ? spend / n : null);
  const resultsHead = awareness ? "Clicks" : r.label;

  type Cell = { v: string; ch: Change };
  const row = (m: MetricTotals, pm: MetricTotals | null, res: number, prevRes: number | null): Cell[] => {
    const cpr = per(m.costMinor, res);
    const pcpr = pm && prevRes !== null ? per(pm.costMinor, prevRes) : null;
    const s = prevRes !== null ? { current: res, previous: prevRes } : null;
    return [
      { v: money(m.costMinor), ch: pm ? changeBadge("Spend", m.costMinor, pm.costMinor, money(pm.costMinor), { better: "neutral" }) : null },
      { v: formatNumber(m.impressions), ch: pm ? changeBadge("Impressions", m.impressions, pm.impressions, formatNumber(pm.impressions), { better: "neutral" }) : null },
      { v: formatNumber(m.clicks), ch: pm ? changeBadge("Clicks", m.clicks, pm.clicks, formatNumber(pm.clicks), { better: "up", sample: { current: m.clicks, previous: pm.clicks } }) : null },
      { v: ctr(m) === null ? "—" : formatPct(ctr(m)!, 2), ch: pm && ctr(m) !== null && ctr(pm) !== null ? changeBadge("Click-through rate", ctr(m)!, ctr(pm)!, formatPct(ctr(pm)!, 2), { better: "up" }) : null },
      { v: formatNumber(Math.round(res)), ch: prevRes !== null ? changeBadge(resultsHead, res, prevRes, formatNumber(Math.round(prevRes)), { better: "up", sample: s, stillCounting: counting }) : null },
      { v: cost(cpr), ch: cpr !== null && pcpr !== null ? changeBadge(`Cost per ${awareness ? "click" : r.singular}`, cpr, pcpr, cost(pcpr), { better: "down", sample: s, stillCounting: counting }) : null },
    ];
  };
  const heads = ["Spend", "Impressions", "Clicks", "Click-through rate", resultsHead, `Cost per ${awareness ? "click" : r.singular}`];
  const totals = row(t, p, r.value, pr?.value ?? null);

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
            {lines.length > 1 && (
              <tr className="bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] font-bold">
                <th scope="row" className="px-5 py-3.5 text-left text-[15px]">Total</th>
                {totals.map((cell, i) => (
                  <td key={heads[i]} className={`py-3.5 text-right align-top tabular ${i === totals.length - 1 ? "pr-5 pl-3" : "px-3"}`}>{cell.v}<Delta ch={cell.ch} /></td>
                ))}
              </tr>
            )}
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <th scope="row" className="max-w-80 px-5 py-3.5 text-left align-top font-semibold">
                  <span className="block">{l.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5 text-xs font-normal text-text-3">
                    <span>{l.platform}</span>
                    <span aria-hidden>·</span>
                    <span>{l.status.charAt(0) + l.status.slice(1).toLowerCase()}</span>
                  </span>
                </th>
                {row(l.m, l.pm, l.results, l.prevResults).map((cell, i) => (
                  <td key={heads[i]} className={`py-3.5 text-right align-top tabular ${i === heads.length - 1 ? "pr-5 pl-3" : "px-3"}`}>{cell.v}<Delta ch={cell.ch} /></td>
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
