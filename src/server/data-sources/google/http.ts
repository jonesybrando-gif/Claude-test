import { IntegrationError, withRetry } from "@/server/integrations/errors";

// Small JSON client for Google REST APIs (Analytics, Search Console, Business
// Profile). Official endpoints via fetch only; never logs tokens. Error
// messages start with "Google API <status>" so the data-source runner can
// recognise 401s (re-authorization needed).

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface GoogleErrorBody { error?: { code?: number; message?: string; status?: string } | string; error_description?: string }

export function googleErrorMessage(status: number, body: unknown): string {
  const b = (body ?? {}) as GoogleErrorBody;
  const msg = typeof b.error === "string" ? `${b.error}${b.error_description ? `: ${b.error_description}` : ""}` : b.error?.message ?? "";
  return `Google API ${status}${msg ? `: ${msg}` : ""}`.slice(0, 500);
}

function classify(status: number, message: string, retryAfter: string | null): IntegrationError {
  const ra = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined;
  if (status === 401) return new IntegrationError("AUTH_REVOKED", message, undefined, status);
  if (status === 429) return new IntegrationError("RATE_LIMITED", message, ra ?? 30_000, status);
  if (status >= 500) return new IntegrationError("TRANSIENT", message, ra, status);
  if (status === 403) return new IntegrationError("PERMISSION_DENIED", message, undefined, status);
  return new IntegrationError("INVALID_REQUEST", message, undefined, status);
}

export interface GoogleJsonOptions {
  method?: "GET" | "POST";
  body?: unknown;
  fetch?: FetchLike;
  /** Attempts for 429/5xx (default 3). */
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** GET (or POST with `body`) a Google JSON API with a bearer token; retries 429/5xx. */
export async function googleJson<T>(url: string, accessToken: string, opts: GoogleJsonOptions = {}): Promise<T> {
  const f = opts.fetch ?? fetch;
  return withRetry(
    async () => {
      let res: Response;
      try {
        res = await f(url, {
          method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}) },
          ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
          cache: "no-store",
        });
      } catch (e) {
        throw new IntegrationError("TRANSIENT", `Network error contacting Google: ${(e as Error).message}`);
      }
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) throw classify(res.status, googleErrorMessage(res.status, body), res.headers.get("retry-after"));
      return body as T;
    },
    { attempts: opts.attempts ?? 3, baseDelayMs: 2000, sleep: opts.sleep },
  );
}
