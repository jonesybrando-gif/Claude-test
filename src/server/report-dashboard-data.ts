import { reportResults, type ClientReport } from "./client-report";
import { changeVerdict, changeWords } from "@/lib/change";
import { derive, pctChange, type MetricTotals } from "@/lib/metrics";
import { formatMoney, formatNumber, formatPct } from "@/lib/money";
import { lineResults } from "@/lib/results";
import { displayCampaignName } from "@/lib/campaign-name";
import { PLATFORM_LABEL } from "@/lib/platforms";

// The figures behind the client report dashboard, shared by the page
// (src/components/reports/report-dashboard.tsx) and the PDF
// (src/server/pdf/client-dashboard.ts) so both always show the same numbers,
// badges and wording.

export type Tone = "good" | "bad" | "neutral";
export type Change = { badge: string; tone: Tone; aria: string } | null;

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

export interface KpiTileData {
  label: string;
  value: string;
  change: Change;
  sub: string | null;
}

/** The headline tiles: spend, results, cost per result, clicks, click-through rate and impressions (or CallRail calls; cost per click for awareness). */
export function kpiTiles(rep: ClientReport): KpiTileData[] {
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
  const tiles: KpiTileData[] = [
    {
      label: t.hasEstimatedCost ? "Spent (incl. estimate)" : "Spent",
      value: money(t.costMinor),
      change: p ? changeBadge("Spent", t.costMinor, p.costMinor, money(p.costMinor), { better: "neutral" }) : null,
      sub: p ? was(money(p.costMinor)) : null,
    },
  ];
  if (!awareness) {
    tiles.push(
      {
        label: r.label,
        value: formatNumber(Math.round(r.value)),
        change: pr ? changeBadge(r.label, r.value, pr.value, formatNumber(Math.round(pr.value)), { better: "up", sample, stillCounting: counting }) : null,
        sub: pr ? was(formatNumber(Math.round(pr.value))) : null,
      },
      {
        label: `Cost per ${r.singular}`,
        value: r.costPerMinor === null ? "—" : cost(r.costPerMinor),
        change: pr && r.costPerMinor !== null && pr.costPerMinor !== null ? changeBadge(`Cost per ${r.singular}`, r.costPerMinor, pr.costPerMinor, cost(pr.costPerMinor), { better: "down", sample, stillCounting: counting }) : null,
        sub: pr?.costPerMinor != null ? was(cost(pr.costPerMinor)) : r.costPerMinor === null ? `No ${r.label.toLowerCase()} yet` : null,
      },
    );
  }
  tiles.push(
    {
      label: "Clicks",
      value: formatNumber(t.clicks),
      change: p ? changeBadge("Clicks", t.clicks, p.clicks, formatNumber(p.clicks), { better: "up", sample: { current: t.clicks, previous: p.clicks } }) : null,
      sub: p ? was(formatNumber(p.clicks)) : null,
    },
    {
      label: "Click-through rate",
      value: d.ctr === null ? "—" : formatPct(d.ctr, 2),
      change: pd && d.ctr !== null && pd.ctr !== null ? changeBadge("Click-through rate", d.ctr, pd.ctr, formatPct(pd.ctr, 2), { better: "up" }) : null,
      sub: pd?.ctr != null ? was(formatPct(pd.ctr, 2)) : "Clicks ÷ times ads were shown",
    },
    calls
      ? {
          label: "Calls from ads (CallRail)",
          value: formatNumber(calls.current),
          change: calls.previous !== null ? changeBadge("Calls from ads", calls.current, calls.previous, formatNumber(calls.previous), { better: "up", sample: { current: calls.current, previous: calls.previous } }) : null,
          sub: "Tracked by CallRail; not added to the total",
        }
      : {
          label: "Times ads were shown",
          value: formatNumber(t.impressions),
          change: p ? changeBadge("Impressions", t.impressions, p.impressions, formatNumber(p.impressions), { better: "neutral" }) : null,
          sub: p ? was(formatNumber(p.impressions)) : null,
        },
  );
  if (awareness) {
    tiles.push({
      label: "Cost per click",
      value: d.cpcMinor === null ? "—" : formatMoney(d.cpcMinor, c),
      change: pd && d.cpcMinor !== null && pd.cpcMinor !== null ? changeBadge("Cost per click", d.cpcMinor, pd.cpcMinor, formatMoney(pd.cpcMinor, c), { better: "down", sample: { current: t.clicks, previous: p!.clicks } }) : null,
      sub: pd?.cpcMinor != null ? was(formatMoney(pd.cpcMinor, c)) : null,
    });
  }
  return tiles;
}

export interface CampaignLine {
  id: string;
  name: string;
  platform: string;
  status: string;
  m: MetricTotals;
  pm: MetricTotals | null;
  results: number;
  prevResults: number | null;
}

/** Campaigns that ran in the period, busiest first, with the previous period's figures per campaign. */
export function campaignLines(rep: ClientReport): CampaignLine[] {
  const awareness = reportResults(rep).current.goal === "AWARENESS";
  const resultsOf = (m: MetricTotals) => (awareness ? m.clicks : lineResults(m));
  return rep.client.accounts
    .flatMap((a) =>
      a.campaigns.map((cmp) => {
        const m = rep.perf.byCampaign[cmp.id];
        const pm = rep.cmpPerf?.byCampaign[cmp.id] ?? null;
        return { id: cmp.id, name: displayCampaignName(cmp.name), platform: PLATFORM_LABEL[a.platform] ?? a.platform, status: String(cmp.status), m: m as MetricTotals | undefined, pm, results: m ? resultsOf(m) : 0, prevResults: pm ? resultsOf(pm) : null };
      }),
    )
    .filter((x): x is CampaignLine & { m: MetricTotals } => !!x.m && (x.m.costMinor > 0 || x.m.impressions > 0 || x.m.clicks > 0))
    .sort((a, b) => b.m.costMinor - a.m.costMinor || a.name.localeCompare(b.name));
}

export interface CampaignTableData {
  heads: string[];
  totals: { v: string; ch: Change }[] | null;
  rows: { line: CampaignLine; cells: { v: string; ch: Change }[] }[];
}

/** The campaign table: column heads, a totals row (when more than one campaign ran) and one row per campaign. */
export function campaignTable(rep: ClientReport): CampaignTableData {
  const c = rep.client.currency;
  const lines = campaignLines(rep);
  const { current: r, previous: pr, stillCounting } = reportResults(rep);
  const awareness = r.goal === "AWARENESS";
  const counting = stillCounting && !awareness;
  const money = (m: number) => formatMoney(m, c, { whole: true });
  const cost = (m: number | null) => (m === null ? "—" : formatMoney(m, c, { whole: Math.abs(m) >= 10000 }));
  const ctr = (m: MetricTotals) => derive(m).ctr;
  const per = (spend: number, n: number) => (n > 0 ? spend / n : null);
  const resultsHead = awareness ? "Clicks" : r.label;
  const unit = awareness ? "click" : r.singular;
  const row = (m: MetricTotals, pm: MetricTotals | null, res: number, prevRes: number | null) => {
    const cpr = per(m.costMinor, res);
    const pcpr = pm && prevRes !== null ? per(pm.costMinor, prevRes) : null;
    const s = prevRes !== null ? { current: res, previous: prevRes } : null;
    const mc = ctr(m);
    const pc = pm ? ctr(pm) : null;
    return [
      { v: money(m.costMinor), ch: pm ? changeBadge("Spend", m.costMinor, pm.costMinor, money(pm.costMinor), { better: "neutral" }) : null },
      { v: formatNumber(m.impressions), ch: pm ? changeBadge("Impressions", m.impressions, pm.impressions, formatNumber(pm.impressions), { better: "neutral" }) : null },
      { v: formatNumber(m.clicks), ch: pm ? changeBadge("Clicks", m.clicks, pm.clicks, formatNumber(pm.clicks), { better: "up", sample: { current: m.clicks, previous: pm.clicks } }) : null },
      { v: mc === null ? "—" : formatPct(mc, 2), ch: mc !== null && pc !== null && pc !== undefined ? changeBadge("Click-through rate", mc, pc, formatPct(pc, 2), { better: "up" }) : null },
      { v: formatNumber(Math.round(res)), ch: prevRes !== null ? changeBadge(resultsHead, res, prevRes, formatNumber(Math.round(prevRes)), { better: "up", sample: s, stillCounting: counting }) : null },
      { v: cost(cpr), ch: cpr !== null && pcpr !== null ? changeBadge(`Cost per ${unit}`, cpr, pcpr, cost(pcpr), { better: "down", sample: s, stillCounting: counting }) : null },
    ];
  };
  const p = rep.cmpPerf?.totals ?? null;
  return {
    heads: ["Spend", "Impressions", "Clicks", "Click-through rate", resultsHead, `Cost per ${unit}`],
    totals: lines.length > 1 ? row(rep.perf.totals, p, r.value, pr?.value ?? null) : null,
    rows: lines.map((line) => ({ line, cells: row(line.m, line.pm, line.results, line.prevResults) })),
  };
}

export const SHARE_COLORS = ["#2f6fa8", "#e08a3c", "#14304a", "#5fa59a", "#9b7ed9", "#b9bec6"];

/** Spend by campaign for the ring: the top five, then everything else together. */
export function spendSlices(rep: ClientReport): { name: string; minor: number; pct: number; color: string }[] {
  const total = rep.perf.totals.costMinor;
  const lines = campaignLines(rep).filter((l) => l.m.costMinor > 0);
  if (total <= 0 || lines.length === 0) return [];
  const top = lines.slice(0, 5).map((l) => ({ name: l.name, minor: l.m.costMinor }));
  const rest = lines.slice(5).reduce((n, l) => n + l.m.costMinor, 0);
  return [...top, ...(rest > 0 ? [{ name: "Other campaigns", minor: rest }] : [])].map((s, i) => ({ ...s, pct: (s.minor / total) * 100, color: SHARE_COLORS[i % SHARE_COLORS.length] }));
}

/** Spend and results per day. Results can only be split by day exactly for one ad account, so blends show conversions. */
export function dailySeries(rep: ClientReport): { label: string; days: { date: string; spendMinor: number; results: number }[] } {
  const { current: r } = reportResults(rep);
  const awareness = r.goal === "AWARENESS";
  const single = rep.client.accounts.length === 1;
  const label = awareness ? "Clicks" : single ? r.label : "Conversions";
  const days = rep.perf.byDate.map((d) => ({ date: d.date, spendMinor: d.costMinor, results: awareness ? d.clicks : single ? lineResults(d) : d.conversions }));
  return { label, days: days.some((d) => d.spendMinor > 0 || d.results > 0) ? days : [] };
}
