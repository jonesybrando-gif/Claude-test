import "server-only";
import type { AiWebContext, AiWebMetric } from "@/lib/ai-context";
import { formatMetric } from "@/lib/dashboards/metrics";
import { METRIC_BY_KEY } from "@/lib/metrics-registry";
import { diffDays, type IsoDate } from "@/lib/pacing/dates";
import { metricBreakdown, metricTotals } from "../metrics/query";
import { keywordRankTable } from "../metrics/rankings";

// Website, organic search and keyword-rank figures for the AI context, so
// summaries, suggestions and answers can connect ad results with what happens
// on the site and in organic search. Read-only; every source is optional.

const ANALYTICS = ["ga4.sessions", "ga4.keyEvents", "ga4.engagementRate", "ga4.totalRevenue"];
const SEARCH = ["gsc.clicks", "gsc.impressions", "gsc.ctr", "gsc.position"];
const MAX_CHANNELS = 6;
const MAX_MOVERS = 6;

type Range = { from: IsoDate; to: IsoDate };

function change(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function metric(key: string, cur: number | null, prev: number | null | undefined, currency: string): AiWebMetric {
  const def = METRIC_BY_KEY[key];
  const info = { key, format: def?.format ?? "count" } as const;
  return {
    label: def?.label ?? key,
    value: cur === null ? "not reported" : formatMetric(info, cur, currency),
    previous: prev === undefined ? null : prev === null ? "not reported" : formatMetric(info, prev, currency),
    changePct: prev === undefined ? null : change(cur, prev),
  };
}

/** Returns null when the client has none of these sources connected. */
export async function webContextFor(clientId: string, currency: string, range: Range, cmp: Range | null): Promise<AiWebContext | null> {
  const keys = [...ANALYTICS, ...SEARCH];
  const [cur, prev, channelsNow, channelsBefore, ranks] = await Promise.all([
    metricTotals(clientId, keys, range.from, range.to),
    cmp ? metricTotals(clientId, keys, cmp.from, cmp.to) : Promise.resolve(null),
    metricBreakdown(clientId, "channel", ["ga4.sessions", "ga4.keyEvents"], range.from, range.to, MAX_CHANNELS),
    cmp ? metricBreakdown(clientId, "channel", ["ga4.sessions", "ga4.keyEvents"], cmp.from, cmp.to, 50) : Promise.resolve([]),
    keywordRankTable(clientId, { to: range.to, days: 1, changeDays: Math.min(Math.max(diffDays(range.from, range.to) + 1, 7), 90) }).catch(() => []),
  ]);

  const has = (ks: string[]) => ks.some((k) => cur[k] !== null && cur[k] !== undefined);
  const pick = (ks: string[]) =>
    ks
      // Revenue only matters for sites that record it.
      .filter((k) => k !== "ga4.totalRevenue" || (cur[k] ?? 0) > 0)
      .map((k) => metric(k, cur[k] ?? null, prev ? (prev[k] ?? null) : undefined, currency));

  const before = new Map(channelsBefore.map((r) => [r.value, r.metrics]));
  const channels = channelsNow.map((r) => {
    const b = cmp ? (before.get(r.value) ?? { "ga4.sessions": null, "ga4.keyEvents": null }) : undefined;
    return {
      channel: r.value,
      visits: metric("ga4.sessions", r.metrics["ga4.sessions"] ?? null, b ? (b["ga4.sessions"] ?? null) : undefined, currency),
      goals: metric("ga4.keyEvents", r.metrics["ga4.keyEvents"] ?? null, b ? (b["ga4.keyEvents"] ?? null) : undefined, currency),
    };
  });

  // Rank change is "positions gained": a move from 8 to 3 is +5.
  const moved = ranks.filter((r) => r.change !== null && r.change !== 0);
  const rankings = ranks.length
    ? {
        tracked: ranks.length,
        inTop3: ranks.filter((r) => r.position !== null && r.position <= 3).length,
        inTop10: ranks.filter((r) => r.position !== null && r.position <= 10).length,
        improved: moved.filter((r) => r.change! < 0).length,
        declined: moved.filter((r) => r.change! > 0).length,
        changeDays: Math.min(Math.max(diffDays(range.from, range.to) + 1, 7), 90),
        movers: [...moved]
          .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
          .slice(0, MAX_MOVERS)
          .map((r) => ({ keyword: r.keyword, position: r.position, change: -r.change! })),
      }
    : null;

  const analytics = has(ANALYTICS) ? pick(ANALYTICS) : null;
  const search = has(SEARCH) ? pick(SEARCH) : null;
  if (!analytics && !search && !rankings) return null;
  return { analytics, channels, search, rankings };
}
