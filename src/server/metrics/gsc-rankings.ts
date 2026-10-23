import "server-only";
import { addDays, diffDays, type IsoDate } from "@/lib/pacing/dates";
import { metricBreakdown } from "./query";

// "Organic rankings from Search Console": top queries with their average
// position, the change vs the previous period, clicks and impressions, plus
// how many queries rank in each position bucket. Pure data for dashboards,
// reports and the AI assistant.

export interface QueryStats {
  query: string;
  clicks: number;
  impressions: number;
  /** Percent (0–100), or null without impressions. */
  ctr: number | null;
  /** Impression-weighted average position over the period, or null. */
  position: number | null;
}

export interface RankedQuery extends QueryStats {
  previousPosition: number | null;
  /** position − previousPosition. Negative = moved up (better); null if either is missing. */
  positionChange: number | null;
}

export interface PositionBuckets {
  /** Positions 1–3 */
  top3: number;
  /** Positions 4–10 */
  top10: number;
  /** Positions 11–20 */
  top20: number;
  /** Positions 21+ */
  beyond20: number;
  total: number;
}

export interface GscRankings {
  from: IsoDate;
  to: IsoDate;
  compareFrom: IsoDate;
  compareTo: IsoDate;
  queries: RankedQuery[];
  buckets: PositionBuckets;
  previousBuckets: PositionBuckets;
}

/**
 * Count queries per position bucket. Each query counts once, at its own
 * impression-weighted average position for the period, rounded to the nearest
 * whole position (3.4 → 1–3, 3.5 → 4–10). Queries without a position are skipped.
 */
export function bucketPositions(rows: Pick<QueryStats, "position">[]): PositionBuckets {
  const b: PositionBuckets = { top3: 0, top10: 0, top20: 0, beyond20: 0, total: 0 };
  for (const r of rows) {
    if (r.position == null || !Number.isFinite(r.position) || r.position <= 0) continue;
    const p = Math.max(1, Math.round(r.position));
    if (p <= 3) b.top3++;
    else if (p <= 10) b.top10++;
    else if (p <= 20) b.top20++;
    else b.beyond20++;
    b.total++;
  }
  return b;
}

/** Join current and previous period query stats; top `limit` by clicks (then impressions). */
export function rankQueries(current: QueryStats[], previous: QueryStats[], limit = 50): RankedQuery[] {
  const prev = new Map(previous.map((q) => [q.query, q.position]));
  return [...current]
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.query.localeCompare(b.query))
    .slice(0, limit)
    .map((q) => {
      const previousPosition = prev.get(q.query) ?? null;
      const positionChange = q.position != null && previousPosition != null ? q.position - previousPosition : null;
      return { ...q, previousPosition, positionChange };
    });
}

const KEYS = ["gsc.clicks", "gsc.impressions", "gsc.ctr", "gsc.position"];

async function queryStats(clientId: string, from: IsoDate, to: IsoDate): Promise<QueryStats[]> {
  const rows = await metricBreakdown(clientId, "query", KEYS, from, to, Number.MAX_SAFE_INTEGER);
  return rows.map((r) => ({
    query: r.value,
    clicks: r.metrics["gsc.clicks"] ?? 0,
    impressions: r.metrics["gsc.impressions"] ?? 0,
    ctr: r.metrics["gsc.ctr"],
    position: r.metrics["gsc.position"],
  }));
}

/** Rankings for [from, to] vs the previous period (default: same length immediately before). */
export async function gscRankings(
  clientId: string,
  from: IsoDate,
  to: IsoDate,
  opts: { limit?: number; compareFrom?: IsoDate; compareTo?: IsoDate } = {},
): Promise<GscRankings> {
  const len = diffDays(from, to) + 1;
  const compareTo = opts.compareTo ?? addDays(from, -1);
  const compareFrom = opts.compareFrom ?? addDays(from, -len);
  const current = await queryStats(clientId, from, to);
  const previous = await queryStats(clientId, compareFrom, compareTo);
  return {
    from,
    to,
    compareFrom,
    compareTo,
    queries: rankQueries(current, previous, opts.limit ?? 50),
    buckets: bucketPositions(current),
    previousBuckets: bucketPositions(previous),
  };
}
