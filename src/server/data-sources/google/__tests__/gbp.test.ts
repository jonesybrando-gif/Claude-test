import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataAsset, DataSourceConnection } from "@prisma/client";
import {
  aggregateReviews,
  clearGbpReviewCache,
  gbpInternals,
  gbpModule,
  keywordMonths,
  mapDailyMetrics,
  mapKeywordCounts,
  type MultiDailyResponse,
} from "../gbp";
import type { MetricRow, SyncContext } from "../../types";
import { METRIC_BY_KEY, isMetricKey } from "@/lib/metrics-registry";
import { aggregateMetric } from "@/lib/metrics-registry/aggregate";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";

const TOKEN = "ya29.secret-token";
const val = (rows: MetricRow[], date: string, metric: string, dimensionValue?: string) =>
  rows.find((r) => r.date === date && r.metric === metric && (dimensionValue === undefined || r.dimensionValue === dimensionValue))?.value;

const dv = (y: number, m: number, d: number, value?: string) => ({ date: { year: y, month: m, day: d }, ...(value !== undefined ? { value } : {}) });

const DAILY: MultiDailyResponse = {
  multiDailyMetricTimeSeries: [
    {
      dailyMetricTimeSeries: [
        { dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", timeSeries: { datedValues: [dv(2026, 9, 1, "3"), dv(2026, 9, 2)] } },
        { dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", timeSeries: { datedValues: [dv(2026, 9, 1, "10"), dv(2026, 9, 2, "4")] } },
        { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", timeSeries: { datedValues: [dv(2026, 9, 1, "20"), dv(2026, 9, 2, "1")] } },
        { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", timeSeries: { datedValues: [dv(2026, 9, 1, "40"), dv(2026, 9, 2, "2")] } },
      ],
    },
    {
      dailyMetricTimeSeries: [
        { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [dv(2026, 9, 1, "2"), dv(2026, 9, 2, "1")] } },
        { dailyMetric: "WEBSITE_CLICKS", timeSeries: { datedValues: [dv(2026, 9, 1, "5")] } },
        { dailyMetric: "BUSINESS_DIRECTION_REQUESTS", timeSeries: { datedValues: [dv(2026, 9, 1, "1")] } },
        { dailyMetric: "BUSINESS_CONVERSATIONS", timeSeries: { datedValues: [dv(2026, 9, 1, "1")] } },
        { dailyMetric: "BUSINESS_BOOKINGS", timeSeries: { datedValues: [dv(2026, 9, 1)] } },
        { dailyMetric: "BUSINESS_FOOD_ORDERS", timeSeries: { datedValues: [dv(2026, 9, 1)] } },
        { dailyMetric: "SOMETHING_NEW", timeSeries: { datedValues: [dv(2026, 9, 1, "99")] } },
        // outside window: dropped
        { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [dv(2026, 8, 31, "7")] } },
      ],
    },
  ],
};

describe("mapDailyMetrics", () => {
  it("maps each daily metric and derives views, search/maps views and actions", () => {
    const rows = mapDailyMetrics(DAILY, "2026-09-01", "2026-09-02");
    expect(val(rows, "2026-09-01", "gbp.viewsDesktopMaps")).toBe(3);
    expect(val(rows, "2026-09-01", "gbp.viewsMobileSearch")).toBe(40);
    expect(val(rows, "2026-09-01", "gbp.searchViews")).toBe(50);
    expect(val(rows, "2026-09-01", "gbp.mapsViews")).toBe(23);
    expect(val(rows, "2026-09-01", "gbp.views")).toBe(73);
    expect(val(rows, "2026-09-01", "gbp.actions")).toBe(8);
    expect(val(rows, "2026-09-01", "gbp.conversations")).toBe(1);
    expect(val(rows, "2026-09-01", "gbp.bookings")).toBe(0);
    // missing value = 0
    expect(val(rows, "2026-09-02", "gbp.viewsDesktopMaps")).toBe(0);
    expect(val(rows, "2026-09-02", "gbp.views")).toBe(7);
    expect(val(rows, "2026-09-02", "gbp.websiteClicks")).toBe(0);
    expect(val(rows, "2026-09-02", "gbp.actions")).toBe(1);
    expect(rows.some((r) => r.date === "2026-08-31")).toBe(false);
    // every metric key is registered and totals have no dimension
    for (const r of rows) {
      expect(isMetricKey(r.metric)).toBe(true);
      expect(r.dimension).toBeUndefined();
    }
  });
});

describe("search keywords", () => {
  it("stores values and thresholds on the first of the month", () => {
    const rows = mapKeywordCounts(
      {
        searchKeywordsCounts: [
          { searchKeyword: "dentist near me", insightsValue: { value: "120" } },
          { searchKeyword: "emergency dentist", insightsValue: { threshold: "15" } },
          { searchKeyword: "", insightsValue: { value: "3" } },
          { searchKeyword: "no value" },
        ],
      },
      "2026-08-01",
    );
    expect(rows).toEqual([
      { date: "2026-08-01", metric: "gbp.keywordImpressions", value: 120, dimension: "keyword", dimensionValue: "dentist near me" },
      { date: "2026-08-01", metric: "gbp.keywordImpressions", value: 15, dimension: "keyword", dimensionValue: "emergency dentist" },
    ]);
  });

  it("lists complete months whose first day is in the window", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    expect(keywordMonths("2026-07-01", "2026-10-23", now)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(keywordMonths("2026-07-02", "2026-09-30", now)).toEqual(["2026-08-01", "2026-09-01"]);
    expect(keywordMonths("2025-11-15", "2026-02-10", now)).toEqual(["2025-12-01", "2026-01-01", "2026-02-01"]);
    expect(keywordMonths("2026-10-01", "2026-10-23", now)).toEqual([]);
  });
});

describe("aggregateReviews", () => {
  const reviews = [
    { starRating: "FIVE", createTime: "2026-01-10T10:00:00Z" },
    { starRating: "THREE", createTime: "2026-08-31T23:00:00Z" },
    { starRating: "FOUR", createTime: "2026-09-02T08:00:00Z" },
    { starRating: "FIVE", createTime: "2026-09-02T09:00:00Z" },
    { starRating: "STAR_RATING_UNSPECIFIED", createTime: "2026-09-03T09:00:00Z" },
    { starRating: "ONE", createTime: "2026-10-01T09:00:00Z" }, // after window
  ];
  const rows = aggregateReviews(reviews, "2026-09-01", "2026-09-03");

  it("counts new reviews and their stars per day", () => {
    expect(val(rows, "2026-09-01", "gbp.newReviews")).toBeUndefined();
    expect(val(rows, "2026-09-02", "gbp.newReviews")).toBe(2);
    expect(val(rows, "2026-09-02", "gbp.newReviewsStars")).toBe(9);
    expect(val(rows, "2026-09-03", "gbp.newReviews")).toBe(1);
    expect(val(rows, "2026-09-03", "gbp.newReviewsStars")).toBe(0);
  });

  it("stores cumulative review count and average rating as of each day", () => {
    expect(val(rows, "2026-09-01", "gbp.reviewCount")).toBe(2);
    expect(val(rows, "2026-09-01", "gbp.averageRating")).toBe(4);
    expect(val(rows, "2026-09-02", "gbp.reviewCount")).toBe(4);
    expect(val(rows, "2026-09-02", "gbp.averageRating")).toBe(4.25);
    // unrated review counts toward total but not the average
    expect(val(rows, "2026-09-03", "gbp.reviewCount")).toBe(5);
    expect(val(rows, "2026-09-03", "gbp.averageRating")).toBe(4.25);
  });

  it("aggregates over a range per the registry", () => {
    const series = (metric: string) => rows.filter((r) => r.metric === metric).map((r) => ({ date: r.date, value: r.value }));
    expect(METRIC_BY_KEY["gbp.reviewCount"].aggregation).toBe("last");
    expect(aggregateMetric("gbp.reviewCount", series("gbp.reviewCount"))).toBe(5);
    expect(aggregateMetric("gbp.averageRating", series("gbp.averageRating"))).toBe(4.25);
    expect(aggregateMetric("gbp.newReviews", series("gbp.newReviews"))).toBe(3);
    const byMetric = { "gbp.newReviews": series("gbp.newReviews"), "gbp.newReviewsStars": series("gbp.newReviewsStars") };
    expect(aggregateMetric("gbp.newReviewsRating", [], byMetric)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// fetch-level tests

type Handler = (url: URL) => { status: number; body: unknown };
let fetchMock: ReturnType<typeof vi.fn>;
const calls: string[] = [];

function mockFetch(handler: Handler) {
  fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const { status, body } = handler(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
}

function ctx(from: string, to: string, settings: unknown = { account: "accounts/1" }): SyncContext {
  return {
    connection: { id: "c1" } as DataSourceConnection,
    asset: { id: "a1", externalId: "locations/9", settings } as unknown as DataAsset,
    accessToken: TOKEN,
    from,
    to,
  };
}

beforeEach(() => {
  gbpInternals.retryDelayMs = 0;
  clearGbpReviewCache();
  calls.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gbpModule", () => {
  it("declares kind, scope and windows", () => {
    expect(gbpModule.kind).toBe("GBP_LOCATION");
    expect(gbpModule.scopes).toEqual(["https://www.googleapis.com/auth/business.manage"]);
    expect(gbpModule.refetchDays).toBe(40);
    expect(gbpModule.backfillDays).toBe(540);
  });

  it("lists locations across paginated accounts and locations", async () => {
    mockFetch((url) => {
      if (url.host === "mybusinessaccountmanagement.googleapis.com") {
        return url.searchParams.get("pageToken")
          ? { status: 200, body: { accounts: [{ name: "accounts/2", accountName: "Second" }] } }
          : { status: 200, body: { accounts: [{ name: "accounts/1", accountName: "Acme Group" }], nextPageToken: "p2" } };
      }
      expect(url.searchParams.get("readMask")).toBe("name,title,storefrontAddress,metadata");
      if (url.pathname === "/v1/accounts/1/locations") {
        return url.searchParams.get("pageToken")
          ? { status: 200, body: { locations: [{ name: "locations/11", title: "Acme Service Area" }] } }
          : { status: 200, body: { locations: [{ name: "locations/10", title: "Acme Dental", storefrontAddress: { locality: "Carlsbad" } }], nextPageToken: "x" } };
      }
      return { status: 200, body: {} };
    });
    const assets = await gbpModule.listAssets(TOKEN);
    expect(assets).toEqual([
      { kind: "GBP_LOCATION", externalId: "locations/10", name: "Acme Dental (Carlsbad)", group: "Acme Group", settings: { account: "accounts/1" } },
      { kind: "GBP_LOCATION", externalId: "locations/11", name: "Acme Service Area", group: "Acme Group", settings: { account: "accounts/1" } },
    ]);
  });

  it("fetches daily metrics, keywords and reviews; retries once on 5xx", async () => {
    let perfAttempts = 0;
    mockFetch((url) => {
      if (url.pathname.endsWith(":fetchMultiDailyMetricsTimeSeries")) {
        perfAttempts++;
        if (perfAttempts === 1) return { status: 503, body: { error: { message: "backend" } } };
        expect(url.searchParams.getAll("dailyMetrics")).toHaveLength(10);
        expect(url.searchParams.get("dailyRange.start_date.year")).toBe("2026");
        expect(url.searchParams.get("dailyRange.start_date.month")).toBe("8");
        expect(url.searchParams.get("dailyRange.end_date.day")).toBe("2");
        return { status: 200, body: DAILY };
      }
      if (url.pathname.endsWith("/searchkeywords/impressions/monthly")) {
        expect(url.searchParams.get("monthlyRange.start_month.month")).toBe("9");
        expect(url.searchParams.get("monthlyRange.end_month.month")).toBe("9");
        return { status: 200, body: { searchKeywordsCounts: [{ searchKeyword: "dentist", insightsValue: { threshold: "15" } }] } };
      }
      if (url.host === "mybusiness.googleapis.com") {
        expect(url.pathname).toBe("/v4/accounts/1/locations/9/reviews");
        expect(url.searchParams.get("pageSize")).toBe("50");
        return url.searchParams.get("pageToken")
          ? { status: 200, body: { reviews: [{ starRating: "FOUR", createTime: "2026-09-02T00:00:00Z" }] } }
          : { status: 200, body: { reviews: [{ starRating: "FIVE", createTime: "2026-01-01T00:00:00Z" }], nextPageToken: "r2" } };
      }
      return { status: 404, body: {} };
    });
    const rows = await gbpModule.fetchMetrics(ctx("2026-08-15", "2026-09-02"));
    expect(perfAttempts).toBe(2);
    expect(val(rows, "2026-09-01", "gbp.views")).toBe(73);
    expect(val(rows, "2026-09-01", "gbp.keywordImpressions", "dentist")).toBe(15);
    expect(val(rows, "2026-09-02", "gbp.newReviews")).toBe(1);
    expect(val(rows, "2026-09-02", "gbp.reviewCount")).toBe(2);
    expect(val(rows, "2026-09-02", "gbp.averageRating")).toBe(4.5);
    expect(val(rows, "2026-08-15", "gbp.reviewCount")).toBe(1);
    expect(calls.every((c) => !c.includes(TOKEN))).toBe(true);
  });

  it("skips reviews on 403 and keeps the rest", async () => {
    mockFetch((url) => {
      if (url.pathname.endsWith(":fetchMultiDailyMetricsTimeSeries")) return { status: 200, body: DAILY };
      if (url.host === "mybusiness.googleapis.com") return { status: 403, body: { error: { status: "PERMISSION_DENIED", message: "API not enabled" } } };
      return { status: 200, body: {} };
    });
    const rows = await gbpModule.fetchMetrics(ctx("2026-09-01", "2026-09-02"));
    expect(val(rows, "2026-09-01", "gbp.views")).toBe(73);
    expect(rows.some((r) => r.metric.startsWith("gbp.review") || r.metric.startsWith("gbp.newReview"))).toBe(false);
  });

  it("throws the reviews reason when nothing else synced", async () => {
    mockFetch((url) => {
      if (url.host === "mybusiness.googleapis.com") return { status: 404, body: { error: { message: "Not found" } } };
      return { status: 200, body: {} };
    });
    await expect(gbpModule.fetchMetrics(ctx("2026-09-01", "2026-09-02"))).rejects.toThrow(/Reviews skipped.*v4/);
  });

  it("propagates other errors after one retry, without the token", async () => {
    mockFetch(() => ({ status: 429, body: { error: { status: "RESOURCE_EXHAUSTED", message: "Quota" } } }));
    const err = await gbpModule.fetchMetrics(ctx("2026-09-01", "2026-09-02")).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/HTTP 429.*RESOURCE_EXHAUSTED/);
    expect((err as Error).message).not.toContain(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("registry and template", () => {
  it("template widgets only reference registered gbp metrics", () => {
    const t = DASHBOARD_TEMPLATES.find((d) => d.key === "gbp");
    expect(t?.name).toBe("Google Business Profile");
    for (const w of t!.widgets) for (const m of w.metrics ?? []) expect(isMetricKey(m)).toBe(true);
    expect(t!.widgets.filter((w) => w.kind === "kpi")).toHaveLength(6);
  });
});
