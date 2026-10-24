import "server-only";
import { addDays } from "@/lib/pacing/dates";
import type { MetricRow, SyncContext } from "../types";
import { chunkRange, GraphError, insightDay, numericValue, postLabel, uniqueLabels, unixDay, type GraphClient } from "./graph";
import { fetchInsights, type InsightSpec } from "./insights";
import { dateInZone, isRecent, type FetchOutcome } from "./shared";

/**
 * Facebook Page metrics (Graph API v26.0, period=day).
 *
 * Meta removed several Page metrics in 2024–2025 (on every API version):
 * page_impressions → page_media_view (Nov 2025), page_impressions_unique →
 * page_total_media_view_unique (Jun 2025), page_fans / page_fan_adds (Nov 2025;
 * page_follows / page_daily_follows_unique instead). Each stored metric lists
 * the current name first and the old name as a fallback; a metric Graph
 * rejects is skipped without failing the sync.
 */
export const FB_PAGE_SPECS: InsightSpec[] = [
  { key: "facebook.views", candidates: ["page_media_view", "page_impressions"] },
  { key: "facebook.reach", candidates: ["page_total_media_view_unique", "page_impressions_unique"] },
  { key: "facebook.engagements", candidates: ["page_post_engagements"] },
  { key: "facebook.newFollows", candidates: ["page_daily_follows_unique", "page_fan_adds_unique", "page_fan_adds"] },
  { key: "facebook.unfollows", candidates: ["page_daily_unfollows_unique", "page_fan_removes_unique"] },
  { key: "facebook.pageViews", candidates: ["page_views_total"] },
  { key: "facebook.videoViews", candidates: ["page_video_views"] },
  // Daily follower totals: history for the "followers" line; today's value comes from followers_count.
  { key: "facebook.followers", candidates: ["page_follows"] },
];

/** Page insights accept at most ~93 days between since and until. */
export const FB_INSIGHTS_MAX_DAYS = 90;
const POST_PAGES = 10;

interface PostNode {
  id: string;
  message?: string;
  story?: string;
  created_time?: string;
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
}

export async function fetchFacebookPage(client: GraphClient, ctx: SyncContext, userToken: string, now: Date): Promise<FetchOutcome> {
  const pageId = ctx.asset.externalId;
  const tz = ctx.asset.timezone ?? "UTC";
  const warnings: string[] = [];

  // Page access tokens are derived from the user token on every sync; never stored.
  const page = await client.get<{ access_token?: string; followers_count?: number }>(pageId, userToken, { fields: "access_token,followers_count" });
  if (!page.access_token) throw new Error("This Facebook login can no longer manage the Page (no Page access token). Reconnect with a Page admin's account.");
  const pageToken = page.access_token;

  const byKey = new Map<string, MetricRow>();
  const put = (r: MetricRow) => byKey.set(`${r.metric}|${r.date}|${r.dimension ?? ""}|${r.dimensionValue ?? ""}`, r);

  const skipped = new Set<string>();
  for (const w of chunkRange(ctx.from, ctx.to, FB_INSIGHTS_MAX_DAYS)) {
    const specs = FB_PAGE_SPECS.filter((s) => !skipped.has(s.key));
    const res = await fetchInsights(client, `${pageId}/insights`, pageToken, specs, { period: "day", since: unixDay(w.from), until: unixDay(addDays(w.to, 1)) });
    res.skipped.forEach((k) => skipped.add(k));
    for (const [key, s] of res.series) {
      for (const v of s.values ?? []) {
        if (!v.end_time) continue;
        const date = insightDay(v.end_time);
        const value = numericValue(v.value);
        if (value === null || date < w.from || date > w.to) continue;
        put({ date, metric: key, value });
      }
    }
  }
  if (skipped.size) warnings.push(`Facebook did not return: ${[...skipped].join(", ")}`);

  // Followers today (snapshot, aggregation "last").
  if (typeof page.followers_count === "number" && isRecent(ctx.to, now)) put({ date: ctx.to, metric: "facebook.followers", value: page.followers_count });

  // Posts published in the window, with lifetime engagement so far.
  try {
    const label = uniqueLabels();
    const posts = await client.getAll<PostNode>(`${pageId}/posts`, pageToken, {
      fields: "id,message,story,created_time,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)",
      since: unixDay(ctx.from),
      until: unixDay(addDays(ctx.to, 1)),
      limit: "50",
    }, { maxPages: POST_PAGES });
    for (const p of posts) {
      if (!p.created_time) continue;
      const date = dateInZone(p.created_time, tz);
      if (date < ctx.from || date > ctx.to) continue;
      const value = (p.reactions?.summary?.total_count ?? 0) + (p.comments?.summary?.total_count ?? 0) + (p.shares?.count ?? 0);
      put({ date, metric: "facebook.postEngagements", value, dimension: "post", dimensionValue: label(postLabel(date, p.message ?? p.story)) });
    }
  } catch (e) {
    if (e instanceof GraphError && e.kind === "AUTH") throw e;
    warnings.push(`Facebook posts skipped: ${(e as Error).message}`);
  }

  return { rows: [...byKey.values()], warnings };
}
