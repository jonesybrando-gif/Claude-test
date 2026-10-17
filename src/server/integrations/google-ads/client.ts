// Google Ads API REST client (official API, OAuth 2.0). Uses fetch directly
// so there is no dependency on unofficial client libraries.

import { IntegrationError, type IntegrationErrorKind } from "../errors";
import { normalizeCustomerId, type SearchStreamBatch } from "./gaql";
import type { GoogleAdsConfig } from "./config";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const API_HOST = "https://googleads.googleapis.com";

const CODE_KIND: Record<string, IntegrationErrorKind> = {
  // authorizationError
  USER_PERMISSION_DENIED: "PERMISSION_DENIED",
  CUSTOMER_NOT_ENABLED: "PERMISSION_DENIED",
  DEVELOPER_TOKEN_NOT_APPROVED: "NOT_APPROVED",
  DEVELOPER_TOKEN_PROHIBITED: "NOT_APPROVED",
  // quotaError
  RESOURCE_EXHAUSTED: "RATE_LIMITED",
  RESOURCE_TEMPORARILY_EXHAUSTED: "RATE_LIMITED",
  // internalError
  INTERNAL_ERROR: "TRANSIENT",
  TRANSIENT_ERROR: "TRANSIENT",
  DEADLINE_EXCEEDED: "TRANSIENT",
};

/** Parses "30s" / "1.5s" durations used by Google APIs. */
function parseDuration(s: unknown): number | undefined {
  if (typeof s !== "string") return undefined;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(s);
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

function findRetryDelay(obj: unknown): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (k === "retryDelay") {
      const d = parseDuration(v);
      if (d !== undefined) return d;
    }
    const nested = findRetryDelay(v);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** Turns a failed Google Ads API response into a classified IntegrationError. */
export function classifyGoogleAdsError(status: number, body: unknown): IntegrationError {
  const payload = Array.isArray(body) ? body[0] : body;
  const error = (payload as { error?: { message?: string; status?: string; details?: unknown[] } } | undefined)?.error;
  const codes: string[] = [];
  const messages: string[] = [];
  for (const d of error?.details ?? []) {
    for (const e of (d as { errors?: { errorCode?: Record<string, string>; message?: string }[] }).errors ?? []) {
      codes.push(...Object.values(e.errorCode ?? {}));
      if (e.message) messages.push(e.message);
    }
  }
  const message = messages[0] ?? error?.message ?? `Google Ads API returned HTTP ${status}`;
  const retryAfter = findRetryDelay(error);
  for (const c of codes) {
    const kind = CODE_KIND[c];
    if (kind) return new IntegrationError(kind, `${c}: ${message}`, retryAfter, status);
  }
  if (status === 401) return new IntegrationError("AUTH_REVOKED", message, undefined, status);
  if (status === 403) return new IntegrationError("PERMISSION_DENIED", message, undefined, status);
  if (status === 429) return new IntegrationError("RATE_LIMITED", message, retryAfter, status);
  if (status >= 500) return new IntegrationError("TRANSIENT", message, retryAfter, status);
  return new IntegrationError("INVALID_REQUEST", codes.length ? `${codes.join(", ")}: ${message}` : message, undefined, status);
}

export class GoogleAdsClient {
  constructor(
    private config: GoogleAdsConfig,
    private accessToken: string,
    private fetchImpl: FetchLike = fetch,
  ) {}

  private headers(loginCustomerId?: string | null): HeadersInit {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "developer-token": this.config.developerToken,
      "Content-Type": "application/json",
    };
    if (loginCustomerId) h["login-customer-id"] = normalizeCustomerId(loginCustomerId);
    return h;
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, init);
    } catch (e) {
      throw new IntegrationError("TRANSIENT", `Network error calling Google Ads API: ${(e as Error).message}`);
    }
    const text = await res.text();
    let body: unknown = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    if (!res.ok) throw classifyGoogleAdsError(res.status, body);
    // searchStream can report an error inside a 200 stream
    if (Array.isArray(body) && body.some((b) => b && typeof b === "object" && "error" in b)) {
      throw classifyGoogleAdsError(500, body.find((b) => "error" in b));
    }
    return body as T;
  }

  /** Customer ids the OAuth user can access directly (not including sub-accounts). */
  async listAccessibleCustomers(): Promise<string[]> {
    const body = await this.request<{ resourceNames?: string[] }>(`${API_HOST}/${this.config.apiVersion}/customers:listAccessibleCustomers`, {
      method: "GET",
      headers: this.headers(),
    });
    return (body?.resourceNames ?? []).map(normalizeCustomerId);
  }

  /** Runs a GAQL query with searchStream and returns all result rows. */
  async searchStream<T>(customerId: string, query: string, loginCustomerId?: string | null): Promise<SearchStreamBatch<T>[]> {
    const id = normalizeCustomerId(customerId);
    const body = await this.request<SearchStreamBatch<T>[] | SearchStreamBatch<T>>(`${API_HOST}/${this.config.apiVersion}/customers/${id}/googleAds:searchStream`, {
      method: "POST",
      headers: this.headers(loginCustomerId),
      body: JSON.stringify({ query }),
    });
    if (!body) return [];
    return Array.isArray(body) ? body : [body];
  }
}
