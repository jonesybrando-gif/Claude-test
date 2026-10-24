import { describe, expect, it } from "vitest";
import type { DataAsset, DataSourceConnection } from "@prisma/client";
import { createGa4Module, dateChunks, ga4Date, ga4RowsToMetricRows, parseGa4Report, topPerDay, GA4_SCOPE, type Ga4Report } from "../ga4";
import { googleScopes, GOOGLE_MODULES } from "../modules";
import { createGoogleAdapter } from "../adapter";
import { decodeIdToken, googleAuthorizationUrl } from "../oauth";
import type { GoogleKindModule } from "../types";
import { isMetricKey, METRIC_BY_KEY } from "@/lib/metrics-registry";
import { aggregateMetric } from "@/lib/metrics-registry/aggregate";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";

const conn = { id: "c1", provider: "GOOGLE" } as DataSourceConnection;
const asset = (kind: DataAsset["kind"], externalId = "123") => ({ id: "a1", kind, externalId, clientId: "cl" }) as DataAsset;

function mockFetch(handler: (url: string, body: unknown) => { status?: number; body: unknown }) {
  const calls: { url: string; body: unknown; auth?: string }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    let body: unknown = init?.body;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      // form-encoded (OAuth token endpoint)
    }
    calls.push({ url, body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    const r = handler(url, body);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { fn, calls };
}

const report: Ga4Report = {
  dimensionHeaders: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
  metricHeaders: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "totalRevenue" }],
  rows: [
    { dimensionValues: [{ value: "20261020" }, { value: "Organic Search" }], metricValues: [{ value: "100" }, { value: "60" }, { value: "12.5" }] },
    { dimensionValues: [{ value: "20261020" }, { value: "Direct" }], metricValues: [{ value: "40" }, { value: "10" }, { value: "0" }] },
  ],
  rowCount: 2,
};

describe("GA4 response mapping", () => {
  it("converts GA4 dates", () => {
    expect(ga4Date("20261023")).toBe("2026-10-23");
    expect(() => ga4Date("2026-10-23")).toThrow();
  });

  it("maps a breakdown report to metric rows with derived bounced sessions", () => {
    const rows = ga4RowsToMetricRows(parseGa4Report(report, "sessionDefaultChannelGroup"), "channel");
    expect(rows).toContainEqual({ date: "2026-10-20", metric: "ga4.sessions", value: 100, dimension: "channel", dimensionValue: "Organic Search" });
    expect(rows).toContainEqual({ date: "2026-10-20", metric: "ga4.totalRevenue", value: 1250, dimension: "channel", dimensionValue: "Organic Search" });
    expect(rows).toContainEqual({ date: "2026-10-20", metric: "ga4.bouncedSessions", value: 30, dimension: "channel", dimensionValue: "Direct" });
    expect(rows).toHaveLength(8);
    for (const r of rows) expect(isMetricKey(r.metric)).toBe(true);
  });

  it("maps a totals report with no dimension", () => {
    const totals: Ga4Report = { dimensionHeaders: [{ name: "date" }], metricHeaders: [{ name: "sessions" }], rows: [{ dimensionValues: [{ value: "20261021" }], metricValues: [{ value: "7" }] }] };
    expect(ga4RowsToMetricRows(parseGa4Report(totals))).toEqual([{ date: "2026-10-21", metric: "ga4.sessions", value: 7 }]);
  });

  it("rejects reports without the date dimension", () => {
    expect(() => parseGa4Report({ dimensionHeaders: [{ name: "x" }], rows: [] })).toThrow(/date/);
  });

  it("keeps the top N values per day by sessions", () => {
    const parsed = parseGa4Report(report, "sessionDefaultChannelGroup");
    expect(topPerDay(parsed, 1).map((r) => r.value)).toEqual(["Organic Search"]);
    expect(topPerDay(parsed, Infinity)).toHaveLength(2);
  });

  it("splits ranges into chunks", () => {
    expect(dateChunks("2026-01-01", "2026-02-15", 31)).toEqual([{ from: "2026-01-01", to: "2026-01-31" }, { from: "2026-02-01", to: "2026-02-15" }]);
    expect(dateChunks("2026-01-01", "2026-01-01", 31)).toEqual([{ from: "2026-01-01", to: "2026-01-01" }]);
  });

  it("weights engagement rate, bounce rate and average duration", () => {
    const d = (v: number) => [{ date: "2026-10-20", value: v }];
    const by = { "ga4.engagedSessions": d(60), "ga4.sessions": d(200), "ga4.bouncedSessions": d(140), "ga4.userEngagementDuration": d(9000) };
    expect(aggregateMetric("ga4.engagementRate", [], by)).toBe(30);
    expect(aggregateMetric("ga4.bounceRate", [], by)).toBe(70);
    expect(aggregateMetric("ga4.averageSessionDuration", [], by)).toBe(45);
    expect(METRIC_BY_KEY["ga4.totalRevenue"].format).toBe("money");
  });

  it("fetches totals and every breakdown via runReport", async () => {
    const m = mockFetch((url, body) => {
      const b = body as { dimensions: { name: string }[] };
      const second = b.dimensions[1]?.name;
      return {
        body: {
          dimensionHeaders: b.dimensions,
          metricHeaders: [{ name: "sessions" }, { name: "engagedSessions" }],
          rows: [{ dimensionValues: [{ value: "20261020" }, ...(second ? [{ value: `v-${second}` }] : [])], metricValues: [{ value: "10" }, { value: "4" }] }],
          rowCount: 1,
        },
      };
    });
    const ga4 = createGa4Module({ fetch: m.fn });
    const rows = await ga4.fetchMetrics({ connection: conn, asset: asset("GA4_PROPERTY", "987"), accessToken: "tok", from: "2026-10-20", to: "2026-10-22" });
    expect(m.calls).toHaveLength(5); // totals + 4 breakdowns
    expect(m.calls[0].url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/987:runReport");
    expect(m.calls[0].auth).toBe("Bearer tok");
    expect((m.calls[0].body as { dateRanges: unknown }).dateRanges).toEqual([{ startDate: "2026-10-20", endDate: "2026-10-22" }]);
    expect(rows.filter((r) => !r.dimension).map((r) => r.metric).sort()).toEqual(["ga4.bouncedSessions", "ga4.engagedSessions", "ga4.sessions"]);
    expect(new Set(rows.map((r) => r.dimension ?? ""))).toEqual(new Set(["", "channel", "source", "page", "device"]));
    expect(rows).toContainEqual({ date: "2026-10-20", metric: "ga4.sessions", value: 10, dimension: "page", dimensionValue: "v-landingPage" });
  });

  it("lists properties from account summaries with time zones", async () => {
    const m = mockFetch((url) => {
      if (url.includes("/accountSummaries")) return { body: { accountSummaries: [{ account: "accounts/1", displayName: "Acme", propertySummaries: [{ property: "properties/55", displayName: "Acme site" }] }] } };
      if (url.includes("/properties?")) return { body: { properties: [{ name: "properties/55", timeZone: "America/Los_Angeles", currencyCode: "USD" }] } };
      return { status: 404, body: {} };
    });
    const assets = await createGa4Module({ fetch: m.fn }).listAssets("tok");
    expect(assets).toEqual([{ kind: "GA4_PROPERTY", externalId: "55", name: "Acme site", group: "Acme", timezone: "America/Los_Angeles", settings: { account: "accounts/1", propertyType: null, currencyCode: "USD" } }]);
  });
});

describe("Google scopes", () => {
  it("merges openid, email and every module's scopes without duplicates", () => {
    const a = { scopes: ["s1", "s2"] } as GoogleKindModule;
    const b = { scopes: ["s2", "s3"] } as GoogleKindModule;
    expect(googleScopes([a, b])).toEqual(["openid", "email", "s1", "s2", "s3"]);
  });

  it("covers GA4, Search Console and Business Profile", () => {
    const s = googleScopes(GOOGLE_MODULES);
    expect(s).toContain(GA4_SCOPE);
    expect(s).toContain("https://www.googleapis.com/auth/webmasters.readonly");
    expect(s).toContain("https://www.googleapis.com/auth/business.manage");
  });

  it("builds an offline, consent authorization URL", () => {
    const u = new URL(googleAuthorizationUrl("st", "https://app.example.com/api/data-sources/google/callback", { clientId: "cid", clientSecret: "x" }, ["openid", "email", GA4_SCOPE]));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("scope")).toBe(`openid email ${GA4_SCOPE}`);
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/data-sources/google/callback");
  });

  it("reads email and sub from an id_token", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "42", email: "a@b.com" })).toString("base64url");
    expect(decodeIdToken(`h.${payload}.s`)).toEqual({ sub: "42", email: "a@b.com" });
    expect(decodeIdToken("garbage")).toEqual({});
  });
});

describe("GOOGLE adapter", () => {
  const mod = (kind: DataAsset["kind"], over: Partial<GoogleKindModule> = {}): GoogleKindModule => ({
    kind,
    scopes: [],
    listAssets: async () => [{ kind, externalId: `${kind}-1`, name: kind }],
    fetchMetrics: async (ctx) => [{ date: ctx.from, metric: `${kind}:${ctx.asset.externalId}`, value: 1 }],
    ...over,
  });

  it("dispatches fetchMetrics by asset kind", async () => {
    const adapter = createGoogleAdapter({ modules: [mod("GA4_PROPERTY"), mod("GSC_SITE")] });
    const rows = await adapter.fetchMetrics({ connection: conn, asset: asset("GSC_SITE", "s"), accessToken: "t", from: "2026-10-01", to: "2026-10-02" });
    expect(rows).toEqual([{ date: "2026-10-01", metric: "GSC_SITE:s", value: 1 }]);
    await expect(adapter.fetchMetrics({ connection: conn, asset: asset("FB_PAGE"), accessToken: "t", from: "2026-10-01", to: "2026-10-02" })).rejects.toThrow(/FB_PAGE/);
  });

  it("takes refetch/backfill windows from modules and clamps per module", async () => {
    const adapter = createGoogleAdapter({ modules: [mod("GA4_PROPERTY", { refetchDays: 3, backfillDays: 395 }), mod("GSC_SITE", { refetchDays: 5, backfillDays: 480 })] });
    expect(adapter.refetchDays).toBe(5);
    expect(adapter.backfillDays).toBe(480);
    const rows = await adapter.fetchMetrics({ connection: conn, asset: asset("GA4_PROPERTY"), accessToken: "t", from: "2025-01-01", to: "2026-10-01" });
    expect(rows[0].date).toBe("2025-09-01"); // 395 days before 2026-10-01
  });

  it("merges assets and tolerates one module failing", async () => {
    const adapter = createGoogleAdapter({ modules: [mod("GA4_PROPERTY"), mod("GBP_LOCATION", { listAssets: async () => { throw new Error("Google API 403: API not enabled"); } })] });
    const r = await adapter.listAssetsWithWarnings({ connection: conn, accessToken: "t" });
    expect(r.assets.map((a) => a.kind)).toEqual(["GA4_PROPERTY"]);
    expect(r.warnings).toEqual(["Business Profile: Google API 403: API not enabled"]);
    expect(await adapter.listAssets({ connection: conn, accessToken: "t" })).toHaveLength(1);
  });

  it("throws when every module fails", async () => {
    const fail = { listAssets: async () => { throw new Error("Google API 401: revoked"); } };
    const adapter = createGoogleAdapter({ modules: [mod("GA4_PROPERTY", fail), mod("GSC_SITE", fail)] });
    await expect(adapter.listAssets({ connection: conn, accessToken: "t" })).rejects.toThrow(/401/);
  });

  it("refreshes tokens at Google's token endpoint", async () => {
    const m = mockFetch(() => ({ body: { access_token: "new", expires_in: 3600 } }));
    const adapter = createGoogleAdapter({ client: { clientId: "cid", clientSecret: "sec" }, fetch: m.fn });
    const r = await adapter.refreshAccessToken!("rt");
    expect(r.accessToken).toBe("new");
    expect(m.calls[0].url).toBe("https://oauth2.googleapis.com/token");
    const bad = mockFetch(() => ({ status: 400, body: { error: "invalid_grant" } }));
    await expect(createGoogleAdapter({ client: { clientId: "c", clientSecret: "s" }, fetch: bad.fn }).refreshAccessToken!("rt")).rejects.toThrow(/invalid_grant/);
  });
});

describe("GA4 dashboard template", () => {
  it("only uses registered GA4 metrics", () => {
    const t = DASHBOARD_TEMPLATES.find((x) => x.key === "ga4-overview")!;
    expect(t).toBeTruthy();
    for (const w of t.widgets) for (const k of w.metrics ?? []) expect(isMetricKey(k)).toBe(true);
  });
});

describe("googleOAuthClient", () => {
  it("prefers the dedicated data-source client and falls back to the Google Ads client", async () => {
    const { googleOAuthClient } = await import("../oauth");
    expect(googleOAuthClient({ GOOGLE_DATA_CLIENT_ID: "d", GOOGLE_DATA_CLIENT_SECRET: "ds", GOOGLE_ADS_CLIENT_ID: "a", GOOGLE_ADS_CLIENT_SECRET: "as" } as unknown as NodeJS.ProcessEnv)).toEqual({ clientId: "d", clientSecret: "ds" });
    expect(googleOAuthClient({ GOOGLE_ADS_CLIENT_ID: "a", GOOGLE_ADS_CLIENT_SECRET: "as" } as unknown as NodeJS.ProcessEnv)).toEqual({ clientId: "a", clientSecret: "as" });
  });
});
