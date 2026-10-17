import { addDays, todayInTimeZone } from "@/lib/pacing/dates";
import { IntegrationError } from "../errors";
import type { AccountRef, OAuthTokens, PlatformAdapter, RemoteAccount } from "../types";
import { GoogleAdsClient, type FetchLike } from "./client";
import { googleAdsConfig, type GoogleAdsConfig } from "./config";
import { CAMPAIGNS_QUERY, CUSTOMER_CLIENT_QUERY, dailyPerformanceQuery, flattenStream, parseCampaigns, parseCustomerClients, parseDailyPerformance, type CampaignRow, type CustomerClientRow, type PerformanceRow } from "./gaql";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

/**
 * Hour (account-local) after which yesterday's numbers are used for pacing.
 * Google Ads statistics for a day keep settling for a few hours after it
 * ends; this is a conservative heuristic, not a documented guarantee, and
 * recent days are re-fetched on every sync anyway.
 */
export const YESTERDAY_COMPLETE_AFTER_HOUR = 3;

function localHour(timeZone: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
}

export function createGoogleAdsAdapter(opts: { config?: GoogleAdsConfig | null; fetch?: FetchLike } = {}): PlatformAdapter {
  const fetchImpl = opts.fetch ?? fetch;
  const cfg = () => {
    const c = opts.config === undefined ? googleAdsConfig() : opts.config;
    if (!c) throw new IntegrationError("NOT_CONFIGURED", "Google Ads credentials are not configured on the server");
    return c;
  };
  const client = (token: string) => new GoogleAdsClient(cfg(), token, fetchImpl);

  async function tokenRequest(params: Record<string, string>): Promise<OAuthTokens> {
    let res: Response;
    try {
      res = await fetchImpl(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
    } catch (e) {
      throw new IntegrationError("TRANSIENT", `Network error contacting Google OAuth: ${(e as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      if (body.error === "invalid_grant") throw new IntegrationError("AUTH_REVOKED", "Google authorization was revoked or expired. Reconnect the account.", undefined, res.status);
      if (body.error === "invalid_client" || body.error === "unauthorized_client") {
        throw new IntegrationError("NOT_CONFIGURED", `Google rejected the OAuth client (${body.error}). Check GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET.`, undefined, res.status);
      }
      if (res.status >= 500) throw new IntegrationError("TRANSIENT", `Google OAuth error ${res.status}`, undefined, res.status);
      throw new IntegrationError("INVALID_REQUEST", `Google OAuth error: ${body.error ?? res.status} ${body.error_description ?? ""}`.trim(), undefined, res.status);
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : undefined,
      scopes: body.scope,
    };
  }

  return {
    platform: "GOOGLE_ADS",
    spendIsVerified: true,
    restatementWindowDays: 14,
    initialBackfillDays: 400,

    isConfigured: () => googleAdsConfig() !== null || !!opts.config,

    authorizationUrl(state, redirectUri) {
      const q = new URLSearchParams({
        client_id: cfg().clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GOOGLE_ADS_SCOPE,
        access_type: "offline", // we need a refresh token for background syncs
        prompt: "consent", // always return a refresh token, even on reconnect
        include_granted_scopes: "true",
        state,
      });
      return `${AUTH_URL}?${q.toString()}`;
    },

    exchangeCode: (code, redirectUri) =>
      tokenRequest({ code, client_id: cfg().clientId, client_secret: cfg().clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),

    refresh: (refreshToken) => tokenRequest({ refresh_token: refreshToken, client_id: cfg().clientId, client_secret: cfg().clientSecret, grant_type: "refresh_token" }),

    /**
     * Accessible customers, expanded through every manager's hierarchy. An
     * account reachable both directly and through a manager is listed once,
     * preferring direct access.
     */
    async listAccounts(accessToken) {
      const c = client(accessToken);
      const roots = await c.listAccessibleCustomers();
      const found = new Map<string, RemoteAccount>();
      for (const root of roots) {
        let rows: RemoteAccount[];
        try {
          rows = parseCustomerClients(flattenStream(await c.searchStream<CustomerClientRow>(root, CUSTOMER_CLIENT_QUERY, root)), root);
        } catch (e) {
          // A directly accessible but disabled/cancelled account can refuse queries; skip it.
          if (e instanceof IntegrationError && e.kind === "PERMISSION_DENIED") continue;
          throw e;
        }
        for (const a of rows) {
          const existing = found.get(a.externalId);
          if (!existing || (existing.loginCustomerId && !a.loginCustomerId)) found.set(a.externalId, a);
        }
      }
      return [...found.values()].sort((a, b) => Number(a.isManager) - Number(b.isManager) || a.name.localeCompare(b.name));
    },

    async listCampaigns(accessToken, account: AccountRef) {
      const batches = await client(accessToken).searchStream<CampaignRow>(account.externalId, CAMPAIGNS_QUERY, account.loginCustomerId);
      return parseCampaigns(flattenStream(batches));
    },

    async fetchDailyPerformance(accessToken, account, from, to) {
      const batches = await client(accessToken).searchStream<PerformanceRow>(account.externalId, dailyPerformanceQuery(from, to), account.loginCustomerId);
      return parseDailyPerformance(flattenStream(batches));
    },

    dataCompleteThrough(accountTimezone, now) {
      const today = todayInTimeZone(accountTimezone, now);
      return addDays(today, localHour(accountTimezone, now) >= YESTERDAY_COMPLETE_AFTER_HOUR ? -1 : -2);
    },
  };
}
