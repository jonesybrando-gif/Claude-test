// Minimal CallRail API v3 client (official REST API, API-key auth).
// https://apidocs.callrail.com/
// The API key is only ever placed in the Authorization header. It is never
// logged, never included in error messages, and never sent to any host other
// than api.callrail.com (pagination URLs are checked before following).

export const CALLRAIL_API = "https://api.callrail.com/v3";
const API_HOST = "api.callrail.com";
const MAX_RETRIES = 4;
const MAX_RETRY_WAIT_MS = 120_000;

export class CallRailError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "CallRailError";
  }
}

export interface CallRailClientOptions {
  fetch?: typeof fetch;
  /** Injected in tests so retries don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Rejects keys that could break or smuggle extra content into the header. */
export function normalizeCallRailKey(raw: unknown): string | null {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key || key.length > 200 || !/^[A-Za-z0-9_\-.]+$/.test(key)) return null;
  return key;
}

function retryAfterMs(res: Response, attempt: number): number {
  const h = res.headers.get("retry-after");
  if (h) {
    const secs = Number(h);
    if (Number.isFinite(secs)) return Math.min(Math.max(secs, 0) * 1000, MAX_RETRY_WAIT_MS);
    const at = Date.parse(h);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_WAIT_MS);
  }
  return Math.min(2 ** attempt * 1000, MAX_RETRY_WAIT_MS);
}

function describeStatus(status: number): string {
  if (status === 401) return "CallRail rejected the API key (401 unauthorized). Paste a new key in Settings › Connections.";
  if (status === 403) return "This CallRail API key isn't allowed to read that data (403 forbidden).";
  if (status === 404) return "CallRail couldn't find that account or company (404).";
  if (status === 429) return "CallRail's rate limit was reached (429). Syncing will retry later.";
  return `CallRail API error (${status}).`;
}

/** GET a CallRail URL with the key, sequentially, retrying 429/5xx (honouring Retry-After). */
export async function callrailGet<T>(key: string, url: string, opts: CallRailClientOptions = {}): Promise<T> {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.host !== API_HOST) throw new CallRailError("Refusing to call a non-CallRail URL.");
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(parsed.toString(), {
        headers: { Authorization: `Token token="${key}"`, Accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      if (attempt < MAX_RETRIES) { await sleep(retryAfterMs(new Response(null), attempt)); continue; }
      throw new CallRailError("Couldn't reach CallRail. Check the connection and try again.");
    }
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await sleep(retryAfterMs(res, attempt));
      continue;
    }
    throw new CallRailError(describeStatus(res.status), res.status);
  }
}

interface PageEnvelope {
  page?: number;
  total_pages?: number;
  has_next_page?: boolean;
  next_page?: string | null;
  [k: string]: unknown;
}

/**
 * Fetch every page of a list endpoint. Supports CallRail's relative
 * pagination (`has_next_page` + `next_page` URL) and offset pagination
 * (`page` / `total_pages`).
 */
export async function callrailList<T>(key: string, url: string, field: string, opts: CallRailClientOptions = {}, maxPages = 1000): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  for (let i = 0; next && i < maxPages; i++) {
    const body: PageEnvelope = await callrailGet<PageEnvelope>(key, next, opts);
    const items = body[field];
    if (Array.isArray(items)) out.push(...(items as T[]));
    if (body.has_next_page !== undefined || body.next_page !== undefined) {
      next = body.has_next_page && body.next_page ? body.next_page : null;
    } else if (typeof body.page === "number" && typeof body.total_pages === "number" && body.page < body.total_pages) {
      const u: URL = new URL(next);
      u.searchParams.set("page", String(body.page + 1));
      next = u.toString();
    } else {
      next = null;
    }
  }
  return out;
}

export interface CallRailAccount { id: string; name: string }
export interface CallRailCompany { id: string; name: string; time_zone?: string | null; status?: string | null }

export async function listCallRailAccounts(key: string, opts: CallRailClientOptions = {}): Promise<CallRailAccount[]> {
  const rows = await callrailList<{ id: string | number; name?: string }>(key, `${CALLRAIL_API}/a.json?per_page=250`, "accounts", opts);
  return rows.map((a) => ({ id: String(a.id), name: a.name?.trim() || `CallRail account ${a.id}` }));
}

export async function listCallRailCompanies(key: string, accountId: string, opts: CallRailClientOptions = {}): Promise<CallRailCompany[]> {
  const rows = await callrailList<{ id: string | number; name?: string; time_zone?: string | null; status?: string | null }>(
    key,
    `${CALLRAIL_API}/a/${encodeURIComponent(accountId)}/companies.json?per_page=250&sort=name`,
    "companies",
    opts,
  );
  return rows.map((c) => ({ id: String(c.id), name: c.name?.trim() || `Company ${c.id}`, time_zone: c.time_zone ?? null, status: c.status ?? null }));
}

export interface ValidatedKey { accountId: string; accountName: string; accounts: CallRailAccount[] }

/**
 * Check a pasted key against GET /v3/a.json. Throws CallRailError with a
 * message that is safe to show an admin (never contains the key).
 */
export async function validateCallRailKey(rawKey: unknown, opts: CallRailClientOptions = {}): Promise<ValidatedKey> {
  const key = normalizeCallRailKey(rawKey);
  if (!key) throw new CallRailError("Paste a CallRail API key (letters and numbers only).");
  let accounts: CallRailAccount[];
  try {
    accounts = await listCallRailAccounts(key, { ...opts, sleep: opts.sleep ?? (() => Promise.resolve()) });
  } catch (e) {
    if (e instanceof CallRailError) {
      if (e.status === 401 || e.status === 403) throw new CallRailError("CallRail didn't accept that API key. Check that it's a v3 key that is still active.", e.status);
      if (e.status === 429) throw new CallRailError("CallRail is rate limiting this key right now. Try again in a few minutes.", 429);
      throw e;
    }
    throw new CallRailError("Couldn't check the key with CallRail. Try again.");
  }
  if (!accounts.length) throw new CallRailError("That API key works but can't see any CallRail accounts.");
  return { accountId: accounts[0].id, accountName: accounts[0].name, accounts };
}
