import "server-only";
import { addDays, eachDay, maxDate, minDate } from "@/lib/pacing/dates";
import type { MetricRow, SyncContext } from "../types";
import { chunkRange, GraphError, insightDay, numericValue, postLabel, uniqueLabels, unixDay, type GraphClient, type InsightSeries } from "./graph";
import { fetchInsights, type InsightSpec } from "./insights";
import { dateInZone, isRecent, todayUtc, type FetchOutcome } from "./shared";

/**
 * Instagram professional account metrics (Graph API v26.0, /{ig-user-id}/insights).
 *
 * - `reach` is available as a daily time series (period=day), up to 30 days per request.
 * - `follower_count` (new followers per day) is a time series for the last 30 days only (not today).
 * - views, accounts_engaged, total_interactions, profile_views and website_clicks
 *   only come as `metric_type=total_value` (one number for since..until), so they
 *   are requested one day at a time, for the most recent IG_DAILY_TOTAL_DAYS days.
 *   `impressions` was removed in v22 (replaced by `views`).
 */
export const IG_SERIES_SPECS: InsightSpec[] = [{ key: "instagram.reach", candidates: ["reach"] }];
export const IG_FOLLOWER_SPEC: InsightSpec = { key: "instagram.newFollowers", candidates: ["follower_count"] };
export const IG_TOTAL_SPECS: InsightSpec[] = [
  { key: "instagram.views", candidates: ["views", "impressions"] },
  { key: "instagram.accountsEngaged", candidates: ["accounts_engaged"] },
  { key: "instagram.interactions", candidates: ["total_interactions"] },
  { key: "instagram.profileViews", candidates: ["profile_views"] },
  { key: "instagram.websiteClicks", candidates: ["website_clicks"] },
];

export const IG_SERIES_MAX_DAYS = 30;
/** follower_count only covers the last 30 days. */
export const IG_FOLLOWER_DAYS = 30;
/** total_value metrics cost one request per day, so history is limited to this many days. */
export const IG_DAILY_TOTAL_DAYS = 90;
const MEDIA_PAGES = 20;

interface MediaNode {
  id: string;
  caption?: string;
  timestamp?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
  insights?: { data?: InsightSeries[] };
}

export async function fetchInstagramAccount(client: GraphClient, ctx: SyncContext, token: string, now: Date): Promise<FetchOutcome> {
  const igId = ctx.asset.externalId;
  const tz = ctx.asset.timezone ?? "UTC";
  const today = todayUtc(now);
  const warnings: string[] = [];
  const calls = { ok: 0, failed: [] as GraphError[] };
  const tolerant = <T,>(fn: () => Promise<T>) => tolerantCall(fn, calls);
  const skipped = new Set<string>();
  const byKey = new Map<string, MetricRow>();
  const put = (r: MetricRow) => byKey.set(`${r.metric}|${r.date}|${r.dimension ?? ""}|${r.dimensionValue ?? ""}`, r);
  const putSeries = (key: string, s: InsightSeries, from: string, to: string) => {
    for (const v of s.values ?? []) {
      if (!v.end_time) continue;
      const date = insightDay(v.end_time);
      const value = numericValue(v.value);
      if (value !== null && date >= from && date <= to) put({ date, metric: key, value });
    }
  };

  // 1. Daily time series (reach), 30 days per request.
  for (const w of chunkRange(ctx.from, ctx.to, IG_SERIES_MAX_DAYS)) {
    const specs = IG_SERIES_SPECS.filter((s) => !skipped.has(s.key));
    const res = await tolerant(() => fetchInsights(client, `${igId}/insights`, token, specs, { period: "day", since: unixDay(w.from), until: unixDay(addDays(w.to, 1)) }));
    res?.skipped.forEach((k) => skipped.add(k));
    for (const [key, s] of res?.series ?? []) putSeries(key, s, w.from, w.to);
  }

  // 2. New followers per day: last 30 days only, excluding today.
  const fFrom = maxDate(ctx.from, addDays(today, -(IG_FOLLOWER_DAYS - 1)));
  const fTo = minDate(ctx.to, addDays(today, -1));
  if (fFrom <= fTo) {
    const res = await tolerant(() => fetchInsights(client, `${igId}/insights`, token, [IG_FOLLOWER_SPEC], { period: "day", since: unixDay(fFrom), until: unixDay(addDays(fTo, 1)) }));
    res?.skipped.forEach((k) => skipped.add(k));
    const s = res?.series.get(IG_FOLLOWER_SPEC.key);
    if (s) putSeries(IG_FOLLOWER_SPEC.key, s, fFrom, fTo);
  }

  // 3. total_value metrics, one request per day for recent days.
  const tFrom = maxDate(ctx.from, addDays(today, -IG_DAILY_TOTAL_DAYS));
  let totals = IG_TOTAL_SPECS;
  for (const day of tFrom <= ctx.to ? eachDay(tFrom, ctx.to) : []) {
    if (!totals.length) break;
    const res = await tolerant(() => fetchInsights(client, `${igId}/insights`, token, totals, { period: "day", metric_type: "total_value", since: unixDay(day), until: unixDay(addDays(day, 1)) }));
    if (!res) continue;
    res.skipped.forEach((k) => skipped.add(k));
    // Later days only ask for what Graph accepted, under the name it accepted.
    totals = totals.filter((t) => res.series.has(t.key)).map((t) => ({ key: t.key, candidates: [res.series.get(t.key)!.name] }));
    for (const [key, s] of res.series) {
      const value = s.total_value?.value;
      if (typeof value === "number" && Number.isFinite(value)) put({ date: day, metric: key, value });
    }
  }
  // Every insights request failed (e.g. missing instagram_manage_insights): fail the sync rather than store nothing.
  if (!calls.ok && calls.failed.length) throw calls.failed[0];
  for (const e of calls.failed) warnings.push(e.message);
  if (skipped.size) warnings.push(`Instagram did not return: ${[...skipped].join(", ")}`);

  // 4. Followers and media count today (aggregation "last").
  if (isRecent(ctx.to, now)) {
    const acct = await client.get<{ followers_count?: number; media_count?: number }>(igId, token, { fields: "followers_count,media_count" });
    if (typeof acct.followers_count === "number") put({ date: ctx.to, metric: "instagram.followers", value: acct.followers_count });
    if (typeof acct.media_count === "number") put({ date: ctx.to, metric: "instagram.mediaCount", value: acct.media_count });
  }

  // 5. Media published in the window (newest first), with engagement so far.
  try {
    const media = await listMedia(client, igId, token, ctx.from);
    const label = uniqueLabels();
    for (const m of media) {
      if (!m.timestamp) continue;
      const date = dateInZone(m.timestamp, tz);
      if (date < ctx.from || date > ctx.to) continue;
      const ins = new Map((m.insights?.data ?? []).map((d) => [d.name, numericValue(d.values?.[0]?.value) ?? d.total_value?.value ?? null]));
      const engagements = ins.get("total_interactions") ?? (m.like_count ?? 0) + (m.comments_count ?? 0);
      const name = label(postLabel(date, m.caption));
      put({ date, metric: "instagram.postEngagements", value: engagements, dimension: "post", dimensionValue: name });
      const reach = ins.get("reach");
      if (typeof reach === "number") put({ date, metric: "instagram.postReach", value: reach, dimension: "post", dimensionValue: name });
    }
  } catch (e) {
    if (e instanceof GraphError && e.kind === "AUTH") throw e;
    warnings.push(`Instagram media skipped: ${(e as Error).message}`);
  }

  return { rows: [...byKey.values()], warnings };
}

/** Lists media newest-first until it passes `from`. Media insights are optional (older media can reject them). */
async function listMedia(client: GraphClient, igId: string, token: string, from: string): Promise<MediaNode[]> {
  const base = "id,caption,timestamp,media_type,like_count,comments_count";
  const stop = (page: MediaNode[]) => page.some((m) => !!m.timestamp && m.timestamp.slice(0, 10) < addDays(from, -1));
  try {
    return await client.getAll<MediaNode>(`${igId}/media`, token, { fields: `${base},insights.metric(reach,total_interactions)`, limit: "50" }, { stop, maxPages: MEDIA_PAGES });
  } catch (e) {
    if (e instanceof GraphError && (e.kind === "AUTH" || e.kind === "TRANSIENT")) throw e;
    return client.getAll<MediaNode>(`${igId}/media`, token, { fields: base, limit: "50" }, { stop, maxPages: MEDIA_PAGES });
  }
}

/** Run one insights request; a non-auth Graph failure is recorded so the rest of the sync continues. */
async function tolerantCall<T>(fn: () => Promise<T>, calls: { ok: number; failed: GraphError[] }): Promise<T | null> {
  try {
    const r = await fn();
    calls.ok++;
    return r;
  } catch (e) {
    if (e instanceof GraphError && e.kind !== "AUTH") {
      calls.failed.push(e);
      return null;
    }
    throw e;
  }
}
