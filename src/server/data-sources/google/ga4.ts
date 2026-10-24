import { addDays, type IsoDate } from "@/lib/pacing/dates";
import type { MetricRow, RemoteAsset, SyncContext } from "../types";
import type { GoogleKindModule } from "./types";
import { googleJson, type FetchLike } from "./http";

// Google Analytics 4: properties are listed with the Admin API
// (accountSummaries) and daily metrics come from the Data API (runReport).
// Totals are their own query (not sums of breakdown rows, which GA4 may
// threshold or sample differently).

export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DATA = "https://analyticsdata.googleapis.com/v1beta";

/** Data API metric names we request (max 10 per request), stored as `ga4.<name>`. */
export const GA4_API_METRICS = ["sessions", "totalUsers", "newUsers", "engagedSessions", "userEngagementDuration", "screenPageViews", "keyEvents", "totalRevenue"] as const;

/** Breakdowns: our stored dimension name → GA4 dimension, and how many values to keep per day. */
export const GA4_BREAKDOWNS = [
  { dimension: "channel", apiDimension: "sessionDefaultChannelGroup", topPerDay: Infinity },
  { dimension: "source", apiDimension: "sessionSourceMedium", topPerDay: 50 },
  { dimension: "page", apiDimension: "landingPage", topPerDay: 100 },
  { dimension: "device", apiDimension: "deviceCategory", topPerDay: Infinity },
] as const;

/** Days per breakdown request, rows per page and max rows per request window (quota friendly). */
const BREAKDOWN_CHUNK_DAYS = 31;
const PAGE_SIZE = 50_000;
const MAX_ROWS = 100_000;

export interface Ga4Report {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string; type?: string }[];
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
  rowCount?: number;
}

interface ParsedRow { date: IsoDate; value: string; metrics: Record<string, number> }

/** "20261023" → "2026-10-23". */
export function ga4Date(d: string): IsoDate {
  if (!/^\d{8}$/.test(d)) throw new Error(`Unexpected GA4 date "${d}"`);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Parse a runReport response that has the `date` dimension and optionally one more. */
export function parseGa4Report(report: Ga4Report, apiDimension?: string): ParsedRow[] {
  const dims = (report.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (report.metricHeaders ?? []).map((h) => h.name);
  const di = dims.indexOf("date");
  const vi = apiDimension ? dims.indexOf(apiDimension) : -1;
  if (di < 0) throw new Error("GA4 report is missing the date dimension");
  if (apiDimension && vi < 0) throw new Error(`GA4 report is missing the ${apiDimension} dimension`);
  return (report.rows ?? []).map((r) => {
    const metrics: Record<string, number> = {};
    mets.forEach((m, i) => {
      const n = Number(r.metricValues?.[i]?.value ?? 0);
      // Money metrics are stored in minor units (cents), like ad spend.
      metrics[m] = !Number.isFinite(n) ? 0 : m === "totalRevenue" ? Math.round(n * 100) : n;
    });
    return { date: ga4Date(r.dimensionValues?.[di]?.value ?? ""), value: vi >= 0 ? r.dimensionValues?.[vi]?.value ?? "" : "", metrics };
  });
}

/** Keep the top `n` dimension values (by sessions) for each day. */
export function topPerDay(rows: ParsedRow[], n: number): ParsedRow[] {
  if (!Number.isFinite(n)) return rows;
  const byDay = new Map<string, ParsedRow[]>();
  for (const r of rows) {
    const day = byDay.get(r.date);
    if (day) day.push(r);
    else byDay.set(r.date, [r]);
  }
  return [...byDay.values()].flatMap((day) => [...day].sort((a, b) => (b.metrics.sessions ?? 0) - (a.metrics.sessions ?? 0)).slice(0, n));
}

/** Parsed rows → MetricRows (`ga4.<metric>`), adding derived bounced sessions. dimension "" = totals. */
export function ga4RowsToMetricRows(rows: ParsedRow[], dimension = ""): MetricRow[] {
  const out: MetricRow[] = [];
  for (const r of rows) {
    const base = dimension ? { dimension, dimensionValue: r.value } : {};
    for (const [m, v] of Object.entries(r.metrics)) out.push({ date: r.date, metric: `ga4.${m}`, value: v, ...base });
    if ("sessions" in r.metrics && "engagedSessions" in r.metrics) {
      out.push({ date: r.date, metric: "ga4.bouncedSessions", value: Math.max(0, r.metrics.sessions - r.metrics.engagedSessions), ...base });
    }
  }
  return out;
}

/** Split [from, to] into windows of at most `days` days. */
export function dateChunks(from: IsoDate, to: IsoDate, days: number): { from: IsoDate; to: IsoDate }[] {
  const out: { from: IsoDate; to: IsoDate }[] = [];
  for (let s = from; s <= to; s = addDays(s, days)) {
    const e = addDays(s, days - 1);
    out.push({ from: s, to: e < to ? e : to });
  }
  return out;
}

interface AccountSummaries {
  accountSummaries?: { account?: string; displayName?: string; propertySummaries?: { property?: string; displayName?: string; propertyType?: string }[] }[];
  nextPageToken?: string;
}
interface PropertiesList { properties?: { name?: string; timeZone?: string; currencyCode?: string }[]; nextPageToken?: string }

export function createGa4Module(opts: { fetch?: FetchLike; sleep?: (ms: number) => Promise<void> } = {}): GoogleKindModule {
  const call = <T>(url: string, token: string, body?: unknown) => googleJson<T>(url, token, { body, fetch: opts.fetch, sleep: opts.sleep });

  async function runReport(token: string, propertyId: string, from: IsoDate, to: IsoDate, apiDimension?: string): Promise<Ga4Report> {
    const url = `${DATA}/properties/${encodeURIComponent(propertyId)}:runReport`;
    const req = {
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "date" }, ...(apiDimension ? [{ name: apiDimension }] : [])],
      metrics: GA4_API_METRICS.map((name) => ({ name })),
      keepEmptyRows: false,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    };
    const rows: NonNullable<Ga4Report["rows"]> = [];
    let first: Ga4Report | null = null;
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
      const page = await call<Ga4Report>(url, token, { ...req, limit: PAGE_SIZE, offset });
      first ??= page;
      rows.push(...(page.rows ?? []));
      if (!page.rows?.length || offset + PAGE_SIZE >= (page.rowCount ?? 0)) break;
    }
    return { ...first, rows };
  }

  return {
    kind: "GA4_PROPERTY",
    scopes: [GA4_SCOPE],
    refetchDays: 3,
    backfillDays: 395,

    async listAssets(token) {
      const accounts: NonNullable<AccountSummaries["accountSummaries"]> = [];
      let pageToken: string | undefined;
      do {
        const q = new URLSearchParams({ pageSize: "200", ...(pageToken ? { pageToken } : {}) });
        const page = await call<AccountSummaries>(`${ADMIN}/accountSummaries?${q}`, token);
        accounts.push(...(page.accountSummaries ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);

      // Time zone and currency are not in the summaries; fetch them per account, best effort.
      const details = new Map<string, { timeZone?: string; currencyCode?: string }>();
      await Promise.all(
        accounts.filter((a) => a.account && a.propertySummaries?.length).map(async (a) => {
          try {
            let pt: string | undefined;
            do {
              const q = new URLSearchParams({ filter: `parent:${a.account}`, pageSize: "200", ...(pt ? { pageToken: pt } : {}) });
              const page = await call<PropertiesList>(`${ADMIN}/properties?${q}`, token);
              for (const p of page.properties ?? []) if (p.name) details.set(p.name, { timeZone: p.timeZone, currencyCode: p.currencyCode });
              pt = page.nextPageToken;
            } while (pt);
          } catch {
            // Without details the client's time zone is used.
          }
        }),
      );

      const out: RemoteAsset[] = [];
      for (const a of accounts) {
        for (const p of a.propertySummaries ?? []) {
          if (!p.property) continue;
          const id = p.property.replace(/^properties\//, "");
          const d = details.get(p.property);
          out.push({
            kind: "GA4_PROPERTY",
            externalId: id,
            name: p.displayName || p.property,
            group: a.displayName || a.account,
            timezone: d?.timeZone,
            settings: { account: a.account ?? null, propertyType: p.propertyType ?? null, currencyCode: d?.currencyCode ?? null },
          });
        }
      }
      return out;
    },

    async fetchMetrics(ctx: SyncContext) {
      const token = ctx.accessToken;
      if (!token) throw new Error("Google API 401: missing access token");
      const propertyId = ctx.asset.externalId;
      const out: MetricRow[] = [];
      for (const w of dateChunks(ctx.from, ctx.to, 90)) {
        out.push(...ga4RowsToMetricRows(parseGa4Report(await runReport(token, propertyId, w.from, w.to))));
      }
      for (const b of GA4_BREAKDOWNS) {
        for (const w of dateChunks(ctx.from, ctx.to, BREAKDOWN_CHUNK_DAYS)) {
          const parsed = parseGa4Report(await runReport(token, propertyId, w.from, w.to, b.apiDimension), b.apiDimension);
          out.push(...ga4RowsToMetricRows(topPerDay(parsed, b.topPerDay), b.dimension));
        }
      }
      return out;
    },
  };
}

export const ga4Module = createGa4Module();
