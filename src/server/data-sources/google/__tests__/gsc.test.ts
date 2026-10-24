import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataAsset, DataSourceConnection } from "@prisma/client";
import { fetchGscMetrics, gscModule, listGscSites, PER_DAY_CAP, querySearchAnalytics, ROW_LIMIT, rowToMetrics, siteDisplayName } from "../gsc";
import type { SyncContext } from "../../types";
import { aggregateMetric } from "@/lib/metrics-registry/aggregate";
import { METRIC_BY_KEY } from "@/lib/metrics-registry";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function ctx(from: string, to: string, siteUrl = "sc-domain:example.com"): SyncContext {
  return {
    connection: {} as DataSourceConnection,
    asset: { externalId: siteUrl } as DataAsset,
    accessToken: "secret-token",
    from,
    to,
  };
}

interface Call { url: string; body: { dimensions: string[]; startRow: number; startDate: string; endDate: string; rowLimit: number; dataState: string } }

function mockFetch(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const c = { url, body: init?.body ? JSON.parse(String(init.body)) : undefined } as Call;
    calls.push(c);
    return handler(c);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("gsc module", () => {
  it("declares kind, scope and windows", () => {
    expect(gscModule.kind).toBe("GSC_SITE");
    expect(gscModule.scopes).toEqual(["https://www.googleapis.com/auth/webmasters.readonly"]);
    expect(gscModule.refetchDays).toBe(5);
    expect(gscModule.backfillDays).toBe(480);
  });

  it("lists sites, skipping unverified ones, with readable names", async () => {
    const { calls } = mockFetch(() =>
      json({
        siteEntry: [
          { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
          { siteUrl: "https://www.example.com/blog/", permissionLevel: "siteFullUser" },
          { siteUrl: "https://nope.com/", permissionLevel: "siteUnverifiedUser" },
        ],
      }),
    );
    const sites = await listGscSites("tok");
    expect(calls[0].url).toBe("https://www.googleapis.com/webmasters/v3/sites");
    expect(sites.map((s) => s.externalId)).toEqual(["sc-domain:example.com", "https://www.example.com/blog/"]);
    expect(sites[0]).toMatchObject({ kind: "GSC_SITE", name: "example.com (domain)", settings: { propertyType: "domain" } });
    expect(sites[1].name).toBe("www.example.com/blog/");
    expect(siteDisplayName("http://shop.example.com/")).toBe("http://shop.example.com");
  });

  it("maps rows to MetricRows with impression-weighted position", () => {
    expect(rowToMetrics({ keys: ["2026-10-01"], clicks: 10, impressions: 200, ctr: 0.05, position: 4.5 })).toEqual([
      { date: "2026-10-01", metric: "gsc.clicks", value: 10 },
      { date: "2026-10-01", metric: "gsc.impressions", value: 200 },
      { date: "2026-10-01", metric: "gsc.positionWeighted", value: 900 },
    ]);
    expect(rowToMetrics({ keys: ["2026-10-01", "mobile"], clicks: 1, impressions: 2, position: 3 }, "device")[0]).toEqual({
      date: "2026-10-01", metric: "gsc.clicks", value: 1, dimension: "device", dimensionValue: "Mobile",
    });
    expect(rowToMetrics({ keys: ["2026-10-01", "usa"], clicks: 1, impressions: 2, position: 3 }, "country")[0].dimensionValue).toBe("USA");
  });

  it("weighted position aggregates by impressions, not a plain mean", () => {
    // Day 1: position 2 on 900 impressions; day 2: position 20 on 100 impressions.
    const rows = [
      ...rowToMetrics({ keys: ["2026-10-01"], clicks: 90, impressions: 900, position: 2 }),
      ...rowToMetrics({ keys: ["2026-10-02"], clicks: 1, impressions: 100, position: 20 }),
    ];
    const by: Record<string, { date: string; value: number }[]> = {};
    for (const r of rows) (by[r.metric] ??= []).push({ date: r.date, value: r.value });
    expect(aggregateMetric("gsc.position", [], by)).toBeCloseTo(3.8); // (1800 + 2000) / 1000
    expect(aggregateMetric("gsc.ctr", [], by)).toBeCloseTo(9.1);
    expect(METRIC_BY_KEY["gsc.position"]).toMatchObject({ format: "position", better: "down", aggregation: "weighted" });
  });

  it("paginates with startRow until a short page", async () => {
    const full = Array.from({ length: ROW_LIMIT }, (_, i) => ({ keys: ["2026-10-01", `q${i}`], clicks: 1, impressions: 1, position: 1 }));
    const { calls } = mockFetch((c) => json({ rows: c.body.startRow === 0 ? full : [{ keys: ["2026-10-01", "last"], clicks: 0, impressions: 1, position: 9 }] }));
    const rows = await querySearchAnalytics({ siteUrl: "https://www.example.com/", accessToken: "t", from: "2026-10-01", to: "2026-10-01", dimensions: ["date", "query"] });
    expect(rows).toHaveLength(ROW_LIMIT + 1);
    expect(calls.map((c) => c.body.startRow)).toEqual([0, ROW_LIMIT]);
    expect(calls[0].url).toBe("https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.example.com%2F/searchAnalytics/query");
    expect(calls[0].body).toMatchObject({ dataState: "final", rowLimit: ROW_LIMIT, dimensions: ["date", "query"] });
  });

  it("fetches totals and breakdowns, capping queries/pages per day and stopping once days are full", async () => {
    const { calls } = mockFetch((c) => {
      const dims = c.body.dimensions;
      if (dims.length === 1) return json({ rows: [{ keys: ["2026-10-01"], clicks: 5, impressions: 50, position: 3 }] });
      if (dims[1] === "query") {
        // One full page for the single day: more than the per-day cap.
        if (c.body.startRow > 0) throw new Error("should stop paginating once the day is full");
        return json({ rows: Array.from({ length: ROW_LIMIT }, (_, i) => ({ keys: ["2026-10-01", `q${i}`], clicks: 1, impressions: 2, position: 4 })) });
      }
      if (dims[1] === "page") return json({ rows: [{ keys: ["2026-10-01", "https://example.com/a"], clicks: 2, impressions: 4, position: 6 }] });
      if (dims[1] === "device") return json({ rows: [{ keys: ["2026-10-01", "DESKTOP"], clicks: 5, impressions: 50, position: 3 }] });
      return json({ rows: [] });
    });
    const rows = await fetchGscMetrics(ctx("2026-10-01", "2026-10-01"));
    expect(calls.map((c) => c.body.dimensions.join(","))).toEqual(["date", "date,query", "date,page", "date,country", "date,device"]);
    const totals = rows.filter((r) => !r.dimension);
    expect(totals).toEqual([
      { date: "2026-10-01", metric: "gsc.clicks", value: 5 },
      { date: "2026-10-01", metric: "gsc.impressions", value: 50 },
      { date: "2026-10-01", metric: "gsc.positionWeighted", value: 150 },
    ]);
    const queries = new Set(rows.filter((r) => r.dimension === "query").map((r) => r.dimensionValue));
    expect(queries.size).toBe(PER_DAY_CAP);
    expect(rows.find((r) => r.dimension === "device")?.dimensionValue).toBe("Desktop");
    expect(rows.every((r) => r.metric in METRIC_BY_KEY)).toBe(true);
  });

  it("splits capped breakdowns into 7-day windows", async () => {
    const { calls } = mockFetch(() => json({ rows: [] }));
    await fetchGscMetrics(ctx("2026-10-01", "2026-10-10"));
    const q = calls.filter((c) => c.body.dimensions[1] === "query").map((c) => [c.body.startDate, c.body.endDate]);
    expect(q).toEqual([["2026-10-01", "2026-10-07"], ["2026-10-08", "2026-10-10"]]);
  });

  it("retries once on 429/5xx, then fails without leaking the token", async () => {
    let n = 0;
    mockFetch(() => (++n === 1 ? json({}, 429) : json({ rows: [] })));
    await expect(querySearchAnalytics({ siteUrl: "sc-domain:x.com", accessToken: "t", from: "2026-10-01", to: "2026-10-01", dimensions: ["date"] }, { retryDelayMs: 0 })).resolves.toEqual([]);
    expect(n).toBe(2);

    const { fn } = mockFetch(() => json({ error: { message: "Backend Error" } }, 503));
    const err = await fetchGscMetrics(ctx("2026-10-01", "2026-10-01"), { retryDelayMs: 0 }).catch((e: Error) => e);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(String(err)).toContain("Search Console API 503: Backend Error");
    expect(String(err)).not.toContain("secret-token");

    const forbidden = mockFetch(() => json({ error: { message: "denied" } }, 403));
    await expect(listGscSites("tok", { retryDelayMs: 0 })).rejects.toThrow("403");
    expect(forbidden.fn).toHaveBeenCalledTimes(1);
  });

  it("registers the SEO dashboard template with known metrics", () => {
    const t = DASHBOARD_TEMPLATES.find((d) => d.key === "seo");
    expect(t?.name).toBe("SEO (Search Console)");
    for (const w of t!.widgets) for (const m of w.metrics ?? []) expect(METRIC_BY_KEY[m]).toBeDefined();
    expect(t!.widgets.filter((w) => w.kind === "kpi").map((w) => w.metrics![0])).toEqual(["gsc.clicks", "gsc.impressions", "gsc.ctr", "gsc.position"]);
  });
});
