import "server-only";
import { createHmac } from "node:crypto";
import { addDays, type IsoDate } from "@/lib/pacing/dates";

// Minimal Graph API client for Facebook Page / Instagram organic insights.
// Official Graph API only. Tokens travel in the Authorization header and are
// never logged or put into error messages.

export const GRAPH_HOST = "graph.facebook.com";
const MAX_PAGES = 50;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface GraphConfig {
  appId: string;
  appSecret: string;
  apiVersion: string;
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean };
}

export type GraphErrorKind = "AUTH" | "TRANSIENT" | "INVALID_METRIC" | "OTHER";

export class GraphError extends Error {
  constructor(
    public kind: GraphErrorKind,
    message: string,
    public code?: number,
    public status?: number,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export function classifyGraphError(status: number, body: unknown): GraphError {
  const err = (body as GraphErrorBody | null)?.error;
  const code = err?.code;
  const msg = err?.message ?? `HTTP ${status}`;
  if (code === 190 || code === 102) {
    // The runner marks the connection NEEDS_REAUTH when the message mentions "expired"/"revoked".
    return new GraphError("AUTH", `Facebook authorization expired or was revoked (OAuthException ${code}). Reconnect Facebook & Instagram.`, code, status);
  }
  if (err?.is_transient || code === 1 || code === 2 || status >= 500) return new GraphError("TRANSIENT", `Meta API temporarily unavailable: ${msg}`, code, status);
  // (#100) "The value must be a valid insights metric" / unsupported metric or period for this object.
  if (code === 100) return new GraphError("INVALID_METRIC", `Meta API rejected the request: ${msg}`, code, status);
  return new GraphError("OTHER", `Meta API error${code ? ` ${code}` : ""}: ${msg}`, code, status);
}

export interface GraphClient {
  get<T>(path: string, token: string, params?: Record<string, string>): Promise<T>;
  getAll<T>(path: string, token: string, params?: Record<string, string>, opts?: { stop?: (page: T[]) => boolean; maxPages?: number }): Promise<T[]>;
}

export function createGraphClient(opts: { config: () => GraphConfig; fetch?: FetchLike; sleep?: (ms: number) => Promise<void> }): GraphClient {
  const fetchImpl = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const proof = (token: string) => createHmac("sha256", opts.config().appSecret).update(token).digest("hex");

  async function once<T>(url: URL, token: string): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      throw new GraphError("TRANSIENT", `Network error calling Meta API: ${(e as Error).message}`);
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok || (body as GraphErrorBody | null)?.error) throw classifyGraphError(res.status, body);
    return body as T;
  }

  async function get<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
    const cfg = opts.config();
    const url = path.startsWith("https://") ? new URL(path) : new URL(`https://${GRAPH_HOST}/${cfg.apiVersion}/${path.replace(/^\//, "")}`);
    if (url.host !== GRAPH_HOST) throw new GraphError("OTHER", "Refusing to call a host other than graph.facebook.com");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    // Paging links already carry access_token; drop it so the token only travels in the header.
    url.searchParams.delete("access_token");
    url.searchParams.set("appsecret_proof", proof(token));
    try {
      return await once<T>(url, token);
    } catch (e) {
      if (e instanceof GraphError && e.kind === "TRANSIENT") {
        await sleep(750);
        return once<T>(url, token); // retry once
      }
      throw e;
    }
  }

  async function getAll<T>(path: string, token: string, params: Record<string, string> = {}, o: { stop?: (page: T[]) => boolean; maxPages?: number } = {}): Promise<T[]> {
    const out: T[] = [];
    let page = await get<{ data?: T[]; paging?: { next?: string } }>(path, token, params);
    for (let i = 0; i < (o.maxPages ?? MAX_PAGES); i++) {
      const data = page.data ?? [];
      out.push(...data);
      if (!page.paging?.next || o.stop?.(data)) return out;
      page = await get(page.paging.next, token);
    }
    return out;
  }

  return { get, getAll };
}

// ---------- insights helpers ----------

export interface InsightValue {
  value?: number | Record<string, number>;
  end_time?: string;
}
export interface InsightSeries {
  name: string;
  period?: string;
  values?: InsightValue[];
  total_value?: { value?: number };
}

/**
 * Day an insights value belongs to. Graph returns `end_time` = the END of the
 * day (midnight in the Page / account time zone, expressed in UTC), e.g.
 * "2026-10-02T07:00:00+0000" for Oct 1 in Los Angeles. Stepping back 12 hours
 * lands inside the right day for UTC offsets from -11 to +12.
 */
export function insightDay(endTime: string): IsoDate {
  const ms = Date.parse(endTime.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return new Date(ms - 12 * 3_600_000).toISOString().slice(0, 10);
}

export function numericValue(v: InsightValue["value"]): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object") return Object.values(v).reduce((a, n) => a + (Number(n) || 0), 0);
  return null;
}

/** Split [from, to] into windows of at most `days` days. */
export function chunkRange(from: IsoDate, to: IsoDate, days: number): { from: IsoDate; to: IsoDate }[] {
  const out: { from: IsoDate; to: IsoDate }[] = [];
  for (let s = from; s <= to; s = addDays(s, days)) {
    const e = addDays(s, days - 1);
    out.push({ from: s, to: e < to ? e : to });
  }
  return out;
}

/** UNIX seconds at 00:00 UTC of a date (Graph accepts since/until as timestamps or dates). */
export const unixDay = (d: IsoDate) => String(Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000));

/** "2026-10-01 · First 60 chars of the caption" (single line). */
export function postLabel(date: IsoDate, text: string | undefined | null): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  const short = clean.length > 60 ? `${clean.slice(0, 59)}…` : clean;
  return `${date} · ${short || "(no caption)"}`;
}

/** Make labels unique within one sync window (two captionless posts on one day). */
export function uniqueLabels() {
  const seen = new Map<string, number>();
  return (label: string) => {
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label} (${n})`;
  };
}
