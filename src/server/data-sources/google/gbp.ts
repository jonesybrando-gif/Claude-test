// Google Business Profile (GBP_LOCATION) module for the GOOGLE data source.
// - Assets: Account Management API (accounts) + Business Information API (locations).
// - Daily metrics: Business Profile Performance API fetchMultiDailyMetricsTimeSeries.
// - Search keywords: Performance API searchkeywords/impressions/monthly, stored on
//   the first day of each month with dimension "keyword".
// - Reviews: legacy My Business API v4 (needs separate approval; skipped on 403/404).
// Requests are sequential; 429/5xx are retried once. Tokens are never logged.
import { addDays, type IsoDate } from "@/lib/pacing/dates";
import type { MetricRow, RemoteAsset, SyncContext } from "../types";
import type { GoogleKindModule } from "./types";

const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const PERF_BASE = "https://businessprofileperformance.googleapis.com/v1";
const V4_BASE = "https://mybusiness.googleapis.com/v4";

/** Tunables (tests set retryDelayMs to 0). */
export const gbpInternals = { retryDelayMs: 1000, reviewCacheMs: 10 * 60 * 1000 };

// ---------------------------------------------------------------------------
// HTTP

export class GbpApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GbpApiError";
  }
}

async function googleGet<T>(url: string, token: string, what: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt === 0) {
      if (gbpInternals.retryDelayMs > 0) await new Promise((r) => setTimeout(r, gbpInternals.retryDelayMs));
      continue;
    }
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string; status?: string } };
      detail = [body.error?.status, body.error?.message].filter(Boolean).join(": ");
    } catch {
      /* non-JSON body */
    }
    throw new GbpApiError(res.status, `Business Profile ${what} failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
}

function withParams(base: string, params: [string, string | number][]): string {
  const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}

// ---------------------------------------------------------------------------
// Assets

interface GAccount { name: string; accountName?: string }
interface GLocation { name: string; title?: string; storefrontAddress?: { locality?: string; administrativeArea?: string } }

async function listAccounts(token: string): Promise<GAccount[]> {
  const out: GAccount[] = [];
  let pageToken = "";
  do {
    const page = await googleGet<{ accounts?: GAccount[]; nextPageToken?: string }>(
      withParams(ACCOUNTS_URL, [["pageSize", 20], ...(pageToken ? [["pageToken", pageToken] as [string, string]] : [])]),
      token,
      "accounts list",
    );
    out.push(...(page.accounts ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

async function listLocations(token: string, account: string): Promise<GLocation[]> {
  const out: GLocation[] = [];
  let pageToken = "";
  do {
    const page = await googleGet<{ locations?: GLocation[]; nextPageToken?: string }>(
      withParams(`${INFO_BASE}/${account}/locations`, [
        ["readMask", "name,title,storefrontAddress,metadata"],
        ["pageSize", 100],
        ...(pageToken ? [["pageToken", pageToken] as [string, string]] : []),
      ]),
      token,
      "locations list",
    );
    out.push(...(page.locations ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

export function locationDisplayName(loc: GLocation): string {
  const title = loc.title?.trim() || loc.name;
  const city = loc.storefrontAddress?.locality?.trim();
  return city ? `${title} (${city})` : title;
}

async function listAssets(token: string): Promise<RemoteAsset[]> {
  const assets: RemoteAsset[] = [];
  for (const acct of await listAccounts(token)) {
    for (const loc of await listLocations(token, acct.name)) {
      assets.push({
        kind: "GBP_LOCATION",
        externalId: loc.name, // "locations/{id}"
        name: locationDisplayName(loc),
        group: acct.accountName || acct.name,
        settings: { account: acct.name },
      });
    }
  }
  return assets;
}

// ---------------------------------------------------------------------------
// Daily performance metrics

const DAILY_METRICS = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "gbp.viewsDesktopMaps",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "gbp.viewsDesktopSearch",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "gbp.viewsMobileMaps",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "gbp.viewsMobileSearch",
  CALL_CLICKS: "gbp.calls",
  WEBSITE_CLICKS: "gbp.websiteClicks",
  BUSINESS_DIRECTION_REQUESTS: "gbp.directions",
  BUSINESS_CONVERSATIONS: "gbp.conversations",
  BUSINESS_BOOKINGS: "gbp.bookings",
  BUSINESS_FOOD_ORDERS: "gbp.foodOrders",
} as const;
type DailyMetric = keyof typeof DAILY_METRICS;

interface GDate { year?: number; month?: number; day?: number }
export interface MultiDailyResponse {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: { dailyMetric?: string; timeSeries?: { datedValues?: { date?: GDate; value?: string }[] } }[];
  }[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const gDateToIso = (d?: GDate): IsoDate | null =>
  d?.year && d.month && d.day ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : null;

/** Map a fetchMultiDailyMetricsTimeSeries response to rows, including derived totals. */
export function mapDailyMetrics(res: MultiDailyResponse, from: IsoDate, to: IsoDate): MetricRow[] {
  const byDate = new Map<IsoDate, Partial<Record<DailyMetric, number>>>();
  for (const group of res.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      const metric = series.dailyMetric as DailyMetric;
      if (!(metric in DAILY_METRICS)) continue;
      for (const dv of series.timeSeries?.datedValues ?? []) {
        const date = gDateToIso(dv.date);
        if (!date || date < from || date > to) continue;
        const value = Number(dv.value ?? 0); // zero values are omitted by the API
        const day = byDate.get(date) ?? {};
        day[metric] = (day[metric] ?? 0) + (Number.isFinite(value) ? value : 0);
        byDate.set(date, day);
      }
    }
  }
  const rows: MetricRow[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date)!;
    const v = (k: DailyMetric) => day[k] ?? 0;
    for (const k of Object.keys(DAILY_METRICS) as DailyMetric[]) rows.push({ date, metric: DAILY_METRICS[k], value: v(k) });
    const search = v("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") + v("BUSINESS_IMPRESSIONS_MOBILE_SEARCH");
    const maps = v("BUSINESS_IMPRESSIONS_DESKTOP_MAPS") + v("BUSINESS_IMPRESSIONS_MOBILE_MAPS");
    rows.push({ date, metric: "gbp.searchViews", value: search });
    rows.push({ date, metric: "gbp.mapsViews", value: maps });
    rows.push({ date, metric: "gbp.views", value: search + maps });
    rows.push({ date, metric: "gbp.actions", value: v("CALL_CLICKS") + v("WEBSITE_CLICKS") + v("BUSINESS_DIRECTION_REQUESTS") });
  }
  return rows;
}

function dateParams(prefix: string, d: IsoDate): [string, number][] {
  const [y, m, day] = d.split("-").map(Number);
  return [[`${prefix}.year`, y], [`${prefix}.month`, m], [`${prefix}.day`, day]];
}

async function fetchDaily(token: string, location: string, from: IsoDate, to: IsoDate): Promise<MetricRow[]> {
  const url = withParams(`${PERF_BASE}/${location}:fetchMultiDailyMetricsTimeSeries`, [
    ...(Object.keys(DAILY_METRICS) as DailyMetric[]).map((k) => ["dailyMetrics", k] as [string, string]),
    ...dateParams("dailyRange.start_date", from),
    ...dateParams("dailyRange.end_date", to),
  ]);
  return mapDailyMetrics(await googleGet<MultiDailyResponse>(url, token, "performance metrics"), from, to);
}

// ---------------------------------------------------------------------------
// Search keywords (monthly)

export interface SearchKeywordsResponse {
  searchKeywordsCounts?: { searchKeyword?: string; insightsValue?: { value?: string; threshold?: string } }[];
  nextPageToken?: string;
}

/** Map one month's keyword counts to rows on `monthStart`. Thresholded values store the threshold. */
export function mapKeywordCounts(res: SearchKeywordsResponse, monthStart: IsoDate): MetricRow[] {
  const rows: MetricRow[] = [];
  for (const c of res.searchKeywordsCounts ?? []) {
    const keyword = c.searchKeyword?.trim();
    if (!keyword) continue;
    const raw = c.insightsValue?.value ?? c.insightsValue?.threshold;
    const value = Number(raw);
    if (raw == null || !Number.isFinite(value)) continue;
    rows.push({ date: monthStart, metric: "gbp.keywordImpressions", value, dimension: "keyword", dimensionValue: keyword });
  }
  return rows;
}

/** First days of the months that fall in [from, to] and are complete (before the current UTC month). */
export function keywordMonths(from: IsoDate, to: IsoDate, now: Date = new Date()): IsoDate[] {
  const currentMonth = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-01`;
  const out: IsoDate[] = [];
  let [y, m] = from.split("-").map(Number);
  if (!from.endsWith("-01")) m += 1;
  for (;;) {
    if (m > 12) { y += 1; m = 1; }
    const first = `${y}-${pad(m)}-01`;
    if (first > to || first >= currentMonth) break;
    out.push(first);
    m += 1;
  }
  return out;
}

async function fetchKeywords(token: string, location: string, from: IsoDate, to: IsoDate): Promise<MetricRow[]> {
  const rows: MetricRow[] = [];
  for (const month of keywordMonths(from, to)) {
    const [y, m] = month.split("-").map(Number);
    let pageToken = "";
    do {
      const url = withParams(`${PERF_BASE}/${location}/searchkeywords/impressions/monthly`, [
        ["monthlyRange.start_month.year", y], ["monthlyRange.start_month.month", m],
        ["monthlyRange.end_month.year", y], ["monthlyRange.end_month.month", m],
        ["pageSize", 100],
        ...(pageToken ? [["pageToken", pageToken] as [string, string]] : []),
      ]);
      const page = await googleGet<SearchKeywordsResponse>(url, token, "search keywords");
      rows.push(...mapKeywordCounts(page, month));
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Reviews (legacy v4)

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export interface GReview { reviewId?: string; starRating?: string; createTime?: string }
interface ReviewsResponse { reviews?: GReview[]; nextPageToken?: string; totalReviewCount?: number; averageRating?: number }

/**
 * Review rows for [from, to]:
 * - gbp.newReviews / gbp.newReviewsStars per day of createTime (UTC date)
 * - gbp.reviewCount / gbp.averageRating ("last") as of each day in the window,
 *   cumulative over every review created on or before that day.
 */
export function aggregateReviews(reviews: GReview[], from: IsoDate, to: IsoDate): MetricRow[] {
  const perDay = new Map<IsoDate, { count: number; rated: number; stars: number }>();
  let beforeCount = 0, beforeRated = 0, beforeStars = 0;
  for (const r of reviews) {
    const date = r.createTime?.slice(0, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > to) continue;
    const stars = STARS[r.starRating ?? ""] ?? 0;
    if (date < from) {
      beforeCount += 1;
      if (stars) { beforeRated += 1; beforeStars += stars; }
      continue;
    }
    const d = perDay.get(date) ?? { count: 0, rated: 0, stars: 0 };
    d.count += 1;
    if (stars) { d.rated += 1; d.stars += stars; }
    perDay.set(date, d);
  }
  const rows: MetricRow[] = [];
  let count = beforeCount, rated = beforeRated, stars = beforeStars;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const d = perDay.get(date);
    if (d) {
      rows.push({ date, metric: "gbp.newReviews", value: d.count });
      rows.push({ date, metric: "gbp.newReviewsStars", value: d.stars });
      count += d.count; rated += d.rated; stars += d.stars;
    }
    rows.push({ date, metric: "gbp.reviewCount", value: count });
    if (rated) rows.push({ date, metric: "gbp.averageRating", value: Math.round((stars / rated) * 100) / 100 });
  }
  return rows;
}

const reviewCache = new Map<string, { at: number; reviews: GReview[] }>();
export const clearGbpReviewCache = () => reviewCache.clear();

/** All reviews for a location (cached briefly: the runner calls fetchMetrics once per 90-day chunk). */
async function listReviews(token: string, account: string, location: string): Promise<GReview[]> {
  const key = `${account}/${location}`;
  const hit = reviewCache.get(key);
  if (hit && Date.now() - hit.at < gbpInternals.reviewCacheMs) return hit.reviews;
  const out: GReview[] = [];
  let pageToken = "";
  do {
    const page = await googleGet<ReviewsResponse>(
      withParams(`${V4_BASE}/${account}/${location}/reviews`, [["pageSize", 50], ...(pageToken ? [["pageToken", pageToken] as [string, string]] : [])]),
      token,
      "reviews",
    );
    out.push(...(page.reviews ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  reviewCache.set(key, { at: Date.now(), reviews: out });
  return out;
}

// ---------------------------------------------------------------------------
// Sync

function accountFor(ctx: SyncContext): string | null {
  const s = ctx.asset.settings;
  const account = s && typeof s === "object" && !Array.isArray(s) ? (s as Record<string, unknown>).account : null;
  return typeof account === "string" && account.startsWith("accounts/") ? account : null;
}

async function fetchMetrics(ctx: SyncContext): Promise<MetricRow[]> {
  const token = ctx.accessToken;
  if (!token) throw new Error("Business Profile sync needs a Google access token.");
  const location = ctx.asset.externalId;
  if (!/^locations\/[^/]+$/.test(location)) throw new Error(`Unexpected Business Profile location id "${location}".`);

  const rows: MetricRow[] = [];
  rows.push(...(await fetchDaily(token, location, ctx.from, ctx.to)));
  rows.push(...(await fetchKeywords(token, location, ctx.from, ctx.to)));

  let reviewsSkipped: string | null = null;
  const account = accountFor(ctx);
  if (!account) {
    reviewsSkipped = "Reviews skipped: the location has no account in its settings (re-link it from the asset picker).";
  } else {
    try {
      rows.push(...aggregateReviews(await listReviews(token, account, location), ctx.from, ctx.to));
    } catch (e) {
      if (e instanceof GbpApiError && (e.status === 403 || e.status === 404)) {
        reviewsSkipped = `Reviews skipped: the My Business API v4 (reviews) is not enabled or approved for this Google Cloud project. ${e.message}`;
      } else {
        throw e;
      }
    }
  }
  // Surface the reason in the asset's lastError only when nothing else synced.
  if (reviewsSkipped && rows.length === 0) throw new Error(reviewsSkipped);
  return rows;
}

export const gbpModule: GoogleKindModule = {
  kind: "GBP_LOCATION",
  scopes: ["https://www.googleapis.com/auth/business.manage"],
  listAssets,
  fetchMetrics,
  refetchDays: 7, // performance data lags ~3-5 days
  backfillDays: 540, // the API keeps ~18 months
};
