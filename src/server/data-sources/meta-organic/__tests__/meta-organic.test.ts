import { describe, expect, it } from "vitest";
import type { DataAsset, DataSourceConnection } from "@prisma/client";
import { createMetaOrganicAdapter } from "../adapter";
import { chunkRange, classifyGraphError, insightDay, postLabel } from "../graph";
import { metaOrganicAuthorizationUrl, META_ORGANIC_SCOPES } from "../oauth";
import { FB_PAGE_SPECS } from "../facebook";
import { IG_FOLLOWER_SPEC, IG_SERIES_SPECS, IG_TOTAL_SPECS } from "../instagram";
import { isMetricKey, METRIC_BY_KEY } from "@/lib/metrics-registry";
import type { MetricRow, SyncContext } from "../../types";

const config = { appId: "123", appSecret: "shh", apiVersion: "v26.0", loginConfigId: null };
const NOW = new Date("2026-10-23T18:00:00Z");
const USER_TOKEN = "user-token-secret";
const PAGE_TOKEN = "page-token-secret";

type Handler = (url: URL, token: string | null) => { status?: number; body: unknown };

function mockFetch(handler: Handler) {
  const calls: { url: URL; token: string | null }[] = [];
  const fn = async (u: string, init?: RequestInit) => {
    const url = new URL(u);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    const token = auth ? auth.replace(/^Bearer /, "") : null;
    calls.push({ url, token });
    const { status = 200, body } = handler(url, token);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { fn, calls };
}

const adapterWith = (h: Handler) => {
  const m = mockFetch(h);
  return { adapter: createMetaOrganicAdapter({ config, fetch: m.fn, now: () => NOW, sleep: async () => {} }), calls: m.calls };
};

function ctx(kind: "FB_PAGE" | "IG_ACCOUNT", externalId: string, from: string, to: string): SyncContext {
  return {
    connection: { id: "conn1" } as DataSourceConnection,
    asset: { id: "asset1", kind, externalId, timezone: "America/Los_Angeles" } as DataAsset,
    accessToken: USER_TOKEN,
    from,
    to,
  };
}

const graphError = (code: number, message = "err", extra: Record<string, unknown> = {}) => ({ status: 400, body: { error: { message, type: "OAuthException", code, ...extra } } });
const endTime = (d: string) => `${d}T07:00:00+0000`; // end of the previous day in Los Angeles
const find = (rows: MetricRow[], metric: string, date?: string) => rows.filter((r) => r.metric === metric && (!date || r.date === date));

describe("helpers", () => {
  it("maps insights end_time to the day it closes", () => {
    expect(insightDay("2026-10-02T07:00:00+0000")).toBe("2026-10-01"); // Los Angeles
    expect(insightDay("2026-10-02T00:00:00+0000")).toBe("2026-10-01"); // UTC
    expect(insightDay("2026-10-01T14:00:00+0000")).toBe("2026-10-01"); // Sydney (+10)
  });

  it("chunks ranges to a maximum number of days", () => {
    const c = chunkRange("2026-01-01", "2026-07-01", 90);
    expect(c).toEqual([
      { from: "2026-01-01", to: "2026-03-31" },
      { from: "2026-04-01", to: "2026-06-29" },
      { from: "2026-06-30", to: "2026-07-01" },
    ]);
  });

  it("labels posts with date and the first 60 characters", () => {
    expect(postLabel("2026-10-01", "Hello\nworld")).toBe("2026-10-01 · Hello world");
    expect(postLabel("2026-10-01", "x".repeat(80))).toBe(`2026-10-01 · ${"x".repeat(59)}…`);
    expect(postLabel("2026-10-01", undefined)).toBe("2026-10-01 · (no caption)");
  });

  it("classifies OAuthException 190 so the runner marks the connection for reauth", () => {
    const e = classifyGraphError(400, { error: { code: 190, message: "Error validating access token" } });
    expect(e.kind).toBe("AUTH");
    expect(e.message).toMatch(/expired|revoked/);
    expect(classifyGraphError(400, { error: { code: 100, message: "(#100) The value must be a valid insights metric" } }).kind).toBe("INVALID_METRIC");
    expect(classifyGraphError(500, { error: { code: 2 } }).kind).toBe("TRANSIENT");
  });

  it("builds the login URL with scopes, or a Login for Business config_id", () => {
    const u = new URL(metaOrganicAuthorizationUrl(config, "st", "https://app.example.com/api/data-sources/meta-organic/callback"));
    expect(u.pathname).toBe("/v26.0/dialog/oauth");
    expect(u.searchParams.get("scope")).toBe(META_ORGANIC_SCOPES.join(","));
    const b = new URL(metaOrganicAuthorizationUrl({ ...config, loginConfigId: "cfg9" }, "st", "https://x/cb"));
    expect(b.searchParams.get("config_id")).toBe("cfg9");
    expect(b.searchParams.get("scope")).toBeNull();
  });
});

describe("metrics registry", () => {
  it("registers every key the adapter stores", () => {
    const keys = [
      ...FB_PAGE_SPECS.map((s) => s.key),
      "facebook.postEngagements",
      ...IG_SERIES_SPECS.map((s) => s.key),
      IG_FOLLOWER_SPEC.key,
      ...IG_TOTAL_SPECS.map((s) => s.key),
      "instagram.followers",
      "instagram.mediaCount",
      "instagram.postEngagements",
      "instagram.postReach",
    ];
    for (const k of keys) expect(isMetricKey(k), k).toBe(true);
    expect(METRIC_BY_KEY["facebook.followers"].aggregation).toBe("last");
    expect(METRIC_BY_KEY["instagram.followers"].aggregation).toBe("last");
  });
});

describe("listAssets", () => {
  it("returns Pages and linked Instagram accounts, paginating, without storing page tokens", async () => {
    const { adapter } = adapterWith((url) => {
      if (url.pathname.endsWith("/me/accounts") && !url.searchParams.get("after")) {
        return { body: { data: [{ id: "p1", name: "Acme Dental", access_token: "pt1", instagram_business_account: { id: "ig1", username: "acmedental" } }], paging: { next: "https://graph.facebook.com/v26.0/me/accounts?after=abc&access_token=leak" } } };
      }
      if (url.searchParams.get("after") === "abc") {
        expect(url.searchParams.get("access_token")).toBeNull(); // token only in the header
        return { body: { data: [{ id: "p2", name: "Acme Ortho", access_token: "pt2" }] } };
      }
      throw new Error(`unexpected ${url}`);
    });
    const assets = await adapter.listAssets({ connection: {} as DataSourceConnection, accessToken: USER_TOKEN });
    expect(assets.map((a) => [a.kind, a.externalId, a.name, a.group])).toEqual([
      ["FB_PAGE", "p1", "Acme Dental", "Facebook Pages"],
      ["IG_ACCOUNT", "ig1", "@acmedental", "Acme Dental"],
      ["FB_PAGE", "p2", "Acme Ortho", "Facebook Pages"],
    ]);
    expect(JSON.stringify(assets)).not.toContain("pt1");
  });
});

describe("Facebook Page metrics", () => {
  it("maps insights to MetricRows, uses the Page token, stores followers as the latest value and posts by dimension", async () => {
    const { adapter, calls } = adapterWith((url, token) => {
      const p = url.pathname;
      if (p === "/v26.0/p1") return { body: { access_token: PAGE_TOKEN, followers_count: 1234 } };
      if (p === "/v26.0/p1/insights") {
        expect(token).toBe(PAGE_TOKEN);
        const metrics = url.searchParams.get("metric")!.split(",");
        return {
          body: {
            data: metrics.map((name) => ({
              name,
              period: "day",
              values: [
                { value: name === "page_follows" ? 1200 : 10, end_time: endTime("2026-10-21") },
                { value: name === "page_follows" ? 1210 : 20, end_time: endTime("2026-10-22") },
                { value: name === "page_follows" ? 1220 : 30, end_time: endTime("2026-10-23") },
              ],
            })),
          },
        };
      }
      if (p === "/v26.0/p1/posts") {
        return {
          body: {
            data: [
              { id: "p1_1", message: "Big news today", created_time: "2026-10-22T17:00:00+0000", shares: { count: 2 }, reactions: { summary: { total_count: 10 } }, comments: { summary: { total_count: 3 } } },
              { id: "p1_2", created_time: "2026-10-22T18:00:00+0000" },
              { id: "p1_3", created_time: "2026-10-22T19:00:00+0000", reactions: { summary: { total_count: 1 } } },
            ],
          },
        };
      }
      throw new Error(`unexpected ${p}`);
    });
    const rows = await adapter.fetchMetrics(ctx("FB_PAGE", "p1", "2026-10-20", "2026-10-22"));

    expect(find(rows, "facebook.reach")).toEqual([
      { date: "2026-10-20", metric: "facebook.reach", value: 10 },
      { date: "2026-10-21", metric: "facebook.reach", value: 20 },
      { date: "2026-10-22", metric: "facebook.reach", value: 30 },
    ]);
    expect(find(rows, "facebook.views", "2026-10-21")[0].value).toBe(20);
    // Followers: daily totals from page_follows, today's from followers_count.
    expect(find(rows, "facebook.followers", "2026-10-21")[0].value).toBe(1210);
    expect(find(rows, "facebook.followers", "2026-10-22")).toEqual([{ date: "2026-10-22", metric: "facebook.followers", value: 1234 }]);
    const posts = find(rows, "facebook.postEngagements");
    expect(posts).toEqual([
      { date: "2026-10-22", metric: "facebook.postEngagements", value: 15, dimension: "post", dimensionValue: "2026-10-22 · Big news today" },
      { date: "2026-10-22", metric: "facebook.postEngagements", value: 0, dimension: "post", dimensionValue: "2026-10-22 · (no caption)" },
      { date: "2026-10-22", metric: "facebook.postEngagements", value: 1, dimension: "post", dimensionValue: "2026-10-22 · (no caption) (2)" },
    ]);
    // Tokens never appear in URLs.
    for (const c of calls) expect(c.url.toString()).not.toMatch(/token-secret/);
    expect(calls.every((c) => c.url.searchParams.has("appsecret_proof"))).toBe(true);
  });

  it("chunks page insights to 90 days and does not store followers on backfilled history", async () => {
    const windows: [string, string][] = [];
    const { adapter } = adapterWith((url) => {
      const p = url.pathname;
      if (p === "/v26.0/p1") return { body: { access_token: PAGE_TOKEN, followers_count: 99 } };
      if (p === "/v26.0/p1/insights") {
        windows.push([url.searchParams.get("since")!, url.searchParams.get("until")!]);
        return { body: { data: url.searchParams.get("metric")!.split(",").map((name) => ({ name, values: [] })) } };
      }
      if (p === "/v26.0/p1/posts") return { body: { data: [] } };
      throw new Error(`unexpected ${p}`);
    });
    const rows = await adapter.fetchMetrics(ctx("FB_PAGE", "p1", "2025-01-01", "2025-07-01"));
    const day = (s: string) => new Date(Number(s) * 1000).toISOString().slice(0, 10);
    // First request per window is the combined one; empty series make fallbacks run, so de-duplicate.
    const unique = [...new Set(windows.map(([s, u]) => `${day(s)}..${day(u)}`))];
    expect(unique).toEqual(["2025-01-01..2025-04-01", "2025-04-01..2025-06-30", "2025-06-30..2025-07-02"]);
    expect(find(rows, "facebook.followers")).toEqual([]);
  });

  it("tolerates deprecated metrics: falls back per metric and skips ones Graph rejects", async () => {
    const asked: string[] = [];
    const { adapter } = adapterWith((url) => {
      const p = url.pathname;
      if (p === "/v26.0/p1") return { body: { access_token: PAGE_TOKEN } };
      if (p === "/v26.0/p1/posts") return { body: { data: [] } };
      if (p === "/v26.0/p1/insights") {
        const metric = url.searchParams.get("metric")!;
        asked.push(metric);
        if (metric.includes(",")) return graphError(100, "(#100) The value must be a valid insights metric");
        if (metric === "page_media_view" || metric === "page_video_views") return graphError(100, "(#100) The value must be a valid insights metric");
        return { body: { data: [{ name: metric, values: [{ value: 5, end_time: endTime("2026-10-21") }] }] } };
      }
      throw new Error(`unexpected ${p}`);
    });
    const rows = await adapter.fetchMetrics(ctx("FB_PAGE", "p1", "2026-10-20", "2026-10-20"));
    expect(asked).toContain("page_impressions"); // fallback for page_media_view
    expect(find(rows, "facebook.views")).toEqual([{ date: "2026-10-20", metric: "facebook.views", value: 5 }]);
    expect(find(rows, "facebook.videoViews")).toEqual([]);
    expect(find(rows, "facebook.reach")[0].value).toBe(5);
  });

  it("throws on OAuthException 190 with a message the runner treats as reauth", async () => {
    const { adapter } = adapterWith(() => graphError(190, "Error validating access token: Session has expired"));
    await expect(adapter.fetchMetrics(ctx("FB_PAGE", "p1", "2026-10-20", "2026-10-22"))).rejects.toThrow(/expired|revoked/);
  });

  it("retries once on a transient error", async () => {
    let n = 0;
    const { adapter } = adapterWith((url) => {
      if (url.pathname === "/v26.0/me/accounts") {
        n++;
        return n === 1 ? { status: 500, body: { error: { code: 2, message: "Service temporarily unavailable", is_transient: true } } } : { body: { data: [] } };
      }
      throw new Error("unexpected");
    });
    await expect(adapter.listAssets({ connection: {} as DataSourceConnection, accessToken: USER_TOKEN })).resolves.toEqual([]);
    expect(n).toBe(2);
  });
});

describe("Instagram metrics", () => {
  it("maps time series, total_value days, followers and media", async () => {
    const totalDays: string[] = [];
    const { adapter } = adapterWith((url) => {
      const p = url.pathname;
      if (p === "/v26.0/ig1") return { body: { followers_count: 5000, media_count: 321 } };
      if (p === "/v26.0/ig1/media") {
        return {
          body: {
            data: [
              { id: "m1", caption: "Smile!", timestamp: "2026-10-21T20:00:00+0000", like_count: 40, comments_count: 2, insights: { data: [{ name: "reach", values: [{ value: 900 }] }, { name: "total_interactions", values: [{ value: 50 }] }] } },
              { id: "m0", caption: "Old", timestamp: "2026-09-01T20:00:00+0000", like_count: 1, comments_count: 0 },
            ],
            paging: { next: "https://graph.facebook.com/v26.0/ig1/media?after=zzz" },
          },
        };
      }
      if (p === "/v26.0/ig1/insights") {
        const metric = url.searchParams.get("metric")!;
        if (url.searchParams.get("metric_type") === "total_value") {
          totalDays.push(new Date(Number(url.searchParams.get("since")) * 1000).toISOString().slice(0, 10));
          return { body: { data: metric.split(",").map((name) => ({ name, period: "day", total_value: { value: name === "views" ? 700 : 7 } })) } };
        }
        if (metric === "reach") return { body: { data: [{ name: "reach", period: "day", values: [{ value: 300, end_time: endTime("2026-10-21") }, { value: 400, end_time: endTime("2026-10-22") }] }] } };
        if (metric === "follower_count") return { body: { data: [{ name: "follower_count", period: "day", values: [{ value: 4, end_time: endTime("2026-10-21") }] }] } };
      }
      throw new Error(`unexpected ${url}`);
    });
    const rows = await adapter.fetchMetrics(ctx("IG_ACCOUNT", "ig1", "2026-10-20", "2026-10-22"));
    expect(find(rows, "instagram.reach").map((r) => [r.date, r.value])).toEqual([["2026-10-20", 300], ["2026-10-21", 400]]);
    expect(find(rows, "instagram.newFollowers")).toEqual([{ date: "2026-10-20", metric: "instagram.newFollowers", value: 4 }]);
    expect(totalDays).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(find(rows, "instagram.views", "2026-10-21")[0].value).toBe(700);
    expect(find(rows, "instagram.profileViews")).toHaveLength(3);
    expect(find(rows, "instagram.followers")).toEqual([{ date: "2026-10-22", metric: "instagram.followers", value: 5000 }]);
    expect(find(rows, "instagram.mediaCount")[0].value).toBe(321);
    expect(find(rows, "instagram.postEngagements")).toEqual([{ date: "2026-10-21", metric: "instagram.postEngagements", value: 50, dimension: "post", dimensionValue: "2026-10-21 · Smile!" }]);
    expect(find(rows, "instagram.postReach")[0].value).toBe(900);
  });

  it("keeps going when some metrics fail and skips ones Graph rejects on later days", async () => {
    const asked: string[] = [];
    const { adapter } = adapterWith((url) => {
      const p = url.pathname;
      if (p === "/v26.0/ig1") return { body: { followers_count: 10 } };
      if (p === "/v26.0/ig1/media") return graphError(10, "Application does not have permission for this action");
      if (p === "/v26.0/ig1/insights") {
        const metric = url.searchParams.get("metric")!;
        asked.push(metric);
        if (metric.split(",").some((m) => ["website_clicks", "views", "impressions"].includes(m))) return graphError(100, "(#100) metric not supported");
        if (metric === "reach") return graphError(100, "(#100) reach not available for this range");
        return { body: { data: metric.split(",").map((name) => ({ name, total_value: { value: 1 }, values: [] })) } };
      }
      throw new Error(`unexpected ${p}`);
    });
    const rows = await adapter.fetchMetrics(ctx("IG_ACCOUNT", "ig1", "2026-10-21", "2026-10-22"));
    expect(find(rows, "instagram.accountsEngaged")).toHaveLength(2);
    expect(find(rows, "instagram.websiteClicks")).toEqual([]);
    expect(find(rows, "instagram.followers")[0].value).toBe(10);
    // Second day asks only for metrics accepted on the first day, in one combined request.
    expect(asked.filter((m) => m.includes("website_clicks"))).toHaveLength(2); // day 1: combined + on its own
    expect(asked.at(-1)).toBe("accounts_engaged,total_interactions,profile_views");
  });

  it("fails the sync when every insights request fails", async () => {
    const { adapter } = adapterWith((url) => {
      if (url.pathname === "/v26.0/ig1/insights") return graphError(10, "(#10) Application does not have permission for this action");
      return { body: { data: [] } };
    });
    await expect(adapter.fetchMetrics(ctx("IG_ACCOUNT", "ig1", "2026-10-21", "2026-10-22"))).rejects.toThrow(/permission/);
  });
});
