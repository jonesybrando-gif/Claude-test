// Google Search Console (Search Analytics API) behind the GOOGLE login.
// The GOOGLE adapter (./adapter.ts) dispatches GSC_SITE assets here.
//
// Stored per day (MetricDaily):
// - totals (dimension ""): gsc.clicks, gsc.impressions, gsc.positionWeighted
// - breakdowns by query, page, country, device: the same three metrics
// gsc.ctr and gsc.position are "weighted" registry metrics derived from those
// sums, so they combine correctly over any range. Position is stored as
// position × impressions so the average is impression-weighted.
import type { MetricRow, RemoteAsset, SyncContext } from "../types";
import type { GoogleKindModule } from "./types";
import { addDays, minDate, type IsoDate } from "@/lib/pacing/dates";

const API = "https://www.googleapis.com/webmasters/v3";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** Max rows per Search Analytics request (API maximum). */
export const ROW_LIMIT = 25_000;
/** Keep at most this many queries/pages per day (rows arrive sorted by clicks). */
export const PER_DAY_CAP = 1_000;
/** Capped breakdowns are fetched in windows of this many days so pagination can stop once every day is full. */
const CAPPED_WINDOW_DAYS = 7;
/** Safety limit on pages per request series. */
const MAX_PAGES = 40;
const DEFAULT_RETRY_DELAY_MS = 2_000;

export interface GscFetchOptions {
  /** Base delay before the single retry on 429/5xx (Retry-After wins when present). */
  retryDelayMs?: number;
}

interface SearchAnalyticsRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

type Breakdown = "query" | "page" | "country" | "device";
const BREAKDOWNS: { dimension: Breakdown; capped: boolean }[] = [
  { dimension: "query", capped: true },
  { dimension: "page", capped: true },
  { dimension: "country", capped: false },
  { dimension: "device", capped: false },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with one retry on 429/5xx. Never includes the token in errors. */
async function gscFetch(url: string, init: RequestInit, opts: GscFetchOptions): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt === 0) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const base = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : base);
      continue;
    }
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ? `: ${body.error.message}` : "";
    } catch {
      /* non-JSON body */
    }
    throw new Error(`Search Console API ${res.status}${detail}`);
  }
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Readable name for a Search Console property. */
export function siteDisplayName(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) return `${siteUrl.slice("sc-domain:".length)} (domain)`;
  try {
    const u = new URL(siteUrl);
    const path = u.pathname === "/" ? "" : u.pathname;
    const scheme = u.protocol === "http:" ? "http://" : "";
    return `${scheme}${u.host}${path}`;
  } catch {
    return siteUrl;
  }
}

export async function listGscSites(accessToken: string, opts: GscFetchOptions = {}): Promise<RemoteAsset[]> {
  const data = (await gscFetch(`${API}/sites`, { headers: authHeaders(accessToken) }, opts)) as {
    siteEntry?: { siteUrl: string; permissionLevel?: string }[];
  };
  return (data.siteEntry ?? [])
    .filter((s) => s.siteUrl && s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({
      kind: "GSC_SITE" as const,
      externalId: s.siteUrl,
      name: siteDisplayName(s.siteUrl),
      group: "Search Console",
      settings: {
        permissionLevel: s.permissionLevel ?? null,
        propertyType: s.siteUrl.startsWith("sc-domain:") ? "domain" : "url-prefix",
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface QueryArgs {
  siteUrl: string;
  accessToken: string;
  from: IsoDate;
  to: IsoDate;
  dimensions: string[];
}

/**
 * Run a Search Analytics query, paginating with startRow. `onPage` returns
 * false to stop early (e.g. every day already has PER_DAY_CAP rows).
 */
export async function querySearchAnalytics(
  args: QueryArgs,
  opts: GscFetchOptions = {},
  onPage?: (rows: SearchAnalyticsRow[]) => boolean | void,
): Promise<SearchAnalyticsRow[]> {
  const url = `${API}/sites/${encodeURIComponent(args.siteUrl)}/searchAnalytics/query`;
  const all: SearchAnalyticsRow[] = [];
  for (let page = 0, startRow = 0; page < MAX_PAGES; page++, startRow += ROW_LIMIT) {
    const body = {
      startDate: args.from,
      endDate: args.to,
      dimensions: args.dimensions,
      type: "web",
      dataState: "final",
      rowLimit: ROW_LIMIT,
      startRow,
    };
    const data = (await gscFetch(
      url,
      { method: "POST", headers: { ...authHeaders(args.accessToken), "Content-Type": "application/json" }, body: JSON.stringify(body) },
      opts,
    )) as { rows?: SearchAnalyticsRow[] };
    const rows = data.rows ?? [];
    all.push(...rows);
    if (onPage && onPage(rows) === false) break;
    if (rows.length < ROW_LIMIT) break;
  }
  return all;
}

function normalizeValue(dimension: Breakdown, v: string): string {
  if (dimension === "country") return v.toUpperCase();
  if (dimension === "device") return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  return v;
}

/** Map one Search Analytics row to stored MetricRows. keys[0] must be the date. */
export function rowToMetrics(row: SearchAnalyticsRow, dimension?: Breakdown): MetricRow[] {
  const date = row.keys?.[0];
  if (!date) return [];
  const clicks = row.clicks ?? 0;
  const impressions = row.impressions ?? 0;
  const position = row.position ?? 0;
  const base = dimension
    ? { dimension, dimensionValue: normalizeValue(dimension, row.keys?.[1] ?? "") }
    : {};
  return [
    { date, metric: "gsc.clicks", value: clicks, ...base },
    { date, metric: "gsc.impressions", value: impressions, ...base },
    { date, metric: "gsc.positionWeighted", value: position * impressions, ...base },
  ];
}

/** Fetch a capped breakdown (query/page) in windows, keeping the top PER_DAY_CAP rows per day. */
async function fetchCapped(ctx: QueryArgs, dimension: Breakdown, opts: GscFetchOptions): Promise<MetricRow[]> {
  const out: MetricRow[] = [];
  for (let start = ctx.from; start <= ctx.to; start = addDays(start, CAPPED_WINDOW_DAYS)) {
    const end = minDate(addDays(start, CAPPED_WINDOW_DAYS - 1), ctx.to);
    const days = new Set<string>();
    for (let d = start; d <= end; d = addDays(d, 1)) days.add(d);
    const perDay = new Map<string, number>();
    await querySearchAnalytics({ ...ctx, from: start, to: end, dimensions: ["date", dimension] }, opts, (rows) => {
      for (const row of rows) {
        const date = row.keys?.[0];
        if (!date) continue;
        const n = perDay.get(date) ?? 0;
        if (n >= PER_DAY_CAP) continue;
        perDay.set(date, n + 1);
        out.push(...rowToMetrics(row, dimension));
      }
      // Stop once every day in the window is full.
      return ![...days].every((d) => (perDay.get(d) ?? 0) >= PER_DAY_CAP);
    });
  }
  return out;
}

export async function fetchGscMetrics(ctx: SyncContext, opts: GscFetchOptions = {}): Promise<MetricRow[]> {
  if (!ctx.accessToken) throw new Error("Search Console sync needs a Google access token");
  const args: QueryArgs = { siteUrl: ctx.asset.externalId, accessToken: ctx.accessToken, from: ctx.from, to: ctx.to, dimensions: ["date"] };
  const out: MetricRow[] = [];

  // Totals by date (stored as their own rows; breakdowns omit anonymized queries).
  const totals = await querySearchAnalytics(args, opts);
  for (const row of totals) out.push(...rowToMetrics(row));

  // Breakdowns, sequentially to respect per-site quotas.
  for (const b of BREAKDOWNS) {
    if (b.capped) {
      out.push(...(await fetchCapped(args, b.dimension, opts)));
    } else {
      const rows = await querySearchAnalytics({ ...args, dimensions: ["date", b.dimension] }, opts);
      for (const row of rows) out.push(...rowToMetrics(row, b.dimension));
    }
  }
  return out;
}

export const gscModule: GoogleKindModule = {
  kind: "GSC_SITE",
  scopes: [GSC_SCOPE],
  listAssets: (accessToken) => listGscSites(accessToken),
  fetchMetrics: (ctx) => fetchGscMetrics(ctx),
  // GSC data lags ~2–3 days and "final" data fills in late.
  refetchDays: 5,
  // GSC keeps 16 months.
  backfillDays: 480,
};
