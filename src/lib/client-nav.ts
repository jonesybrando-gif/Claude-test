// Small helpers that keep the client page's date range and tab when moving
// between the report, its setup sub-pages and other clients. Pure, so both
// server pages and client components use them.

type Query = Record<string, string | string[] | undefined>;

/** The query keys that describe what the report is showing. */
export const RANGE_KEYS = ["range", "compare", "from", "to"] as const;
const REPORT_KEYS = [...RANGE_KEYS, "tab"] as const;

/** Name of the cookie that remembers the last date range chosen with RangeControls. */
export const RANGE_COOKIE = "mn_range";
export const RANGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** "range=…&compare=…&tab=…" for the report keys present in `q` (no leading "?"). */
export function reportQuery(q: Query, opts: { tab?: boolean } = {}): string {
  const out = new URLSearchParams();
  for (const k of opts.tab === false ? RANGE_KEYS : REPORT_KEYS) {
    const v = first(q[k]);
    if (v) out.set(k, v);
  }
  return out.toString();
}

/** Appends the report's range (and tab) to an href, before any #hash. */
export function withReportQuery(href: string, q: Query, opts: { tab?: boolean } = {}): string {
  const qs = reportQuery(q, opts);
  if (!qs) return href;
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}${qs}${hash !== undefined ? `#${hash}` : ""}`;
}

/** Link back to a client's report from one of its sub-pages, keeping range, comparison and tab. */
export function clientBackHref(clientId: string, q: Query, fallbackTab?: string): string {
  const query = { ...q };
  if (!first(query.tab) && fallbackTab) query.tab = fallbackTab;
  return withReportQuery(`/clients/${clientId}`, query);
}

/**
 * The same page for another client: /clients/A/budgets?range=… becomes
 * /clients/B/budgets?range=…. Only report keys are carried over (not notices,
 * dashboard ids and the like); deeper pages fall back to the client's report.
 */
export function switchClientHref(pathname: string, search: string, nextId: string): string {
  const m = pathname.match(/^\/clients\/[^/]+(\/(accounts|budgets|campaigns|rankings|report|share|email|dashboards))?(\/.*)?$/);
  const sub = m?.[1] && !m[3] ? m[1] : "";
  const q = Object.fromEntries(new URLSearchParams(search));
  return withReportQuery(`/clients/${nextId}${sub}`, q);
}

/** Cookie value for a range choice: a small query string. */
export function encodeRangeCookie(v: { range?: string | null; compare?: string | null; from?: string | null; to?: string | null }): string {
  const out = new URLSearchParams();
  for (const k of RANGE_KEYS) {
    const x = v[k];
    if (x) out.set(k, x);
  }
  return out.toString();
}

/**
 * Fills range/compare/from/to from the remembered cookie when the URL names no
 * range of its own. An explicit range in the URL always wins (and its own
 * compare too, so a shared link shows what was shared).
 */
export function withRangeFallback<T extends Record<string, string | undefined>>(sp: T, cookie: string | undefined | null): T {
  if (!cookie || sp.range) return sp;
  const saved = new URLSearchParams(cookie);
  const range = saved.get("range");
  if (!range) return sp;
  const out: Record<string, string | undefined> = { ...sp, range };
  if (!sp.compare && saved.get("compare")) out.compare = saved.get("compare")!;
  if (range === "custom") {
    out.from = saved.get("from") ?? undefined;
    out.to = saved.get("to") ?? undefined;
  }
  return out as T;
}

/** Short one-line range label for phones: "Sep 1–30", "Aug 28 – Sep 3", "Dec 1, 2025 – Jan 3, 2026". */
export function shortRangeLabel(from: string, to: string): string {
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${fmt(from, { month: "short", day: "numeric", year: "numeric" })} – ${fmt(to, { month: "short", day: "numeric", year: "numeric" })}`;
  if (from === to) return fmt(from, { month: "short", day: "numeric" });
  if (from.slice(0, 7) === to.slice(0, 7)) return `${fmt(from, { month: "short", day: "numeric" })}–${Number(to.slice(8))}`;
  return `${fmt(from, { month: "short", day: "numeric" })} – ${fmt(to, { month: "short", day: "numeric" })}`;
}
