// Microsoft Advertising adapter: the official JSON REST interface of API v13
// (Microsoft is retiring the SOAP interface on 2027-01-31), authorized with the
// Microsoft identity platform (OAuth 2.0 with rotating refresh tokens).
//
// Reporting is asynchronous: submit a CampaignPerformanceReportRequest, poll
// until it is ready, then download a ZIP containing a CSV.

import { assertIsoDate, type IsoDate } from "@/lib/pacing/dates";
import { IntegrationError, type IntegrationErrorKind } from "../errors";
import { completeThrough, decimalToMinor, readJson } from "../common";
import type { DailyPerformanceResult, OAuthTokens, PlatformAdapter, RemoteAccount, RemoteCampaign, RemoteDailyRow } from "../types";
import { microsoftAdsConfig, type MicrosoftAdsConfig } from "./config";
import { microsoftTimeZoneToIana } from "./timezones";
import { unzipEntries } from "./zip";
import { parseCsv } from "./csv";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const MICROSOFT_SCOPE = "https://ads.microsoft.com/msads.manage offline_access";
const CUSTOMER_API = "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13";
const REPORTING_API = "https://reporting.api.bingads.microsoft.com/Reporting/v13";

const REPORT_COLUMNS = ["TimePeriod", "AccountId", "CampaignId", "CampaignName", "CampaignStatus", "CurrencyCode", "Spend", "Impressions", "Clicks", "Conversions", "Revenue"];

/** Known Microsoft Advertising error codes → handling. Matched by name anywhere in the error body. */
const ERROR_KINDS: [RegExp, IntegrationErrorKind, number?][] = [
  [/AuthenticationTokenExpired/i, "AUTH_REVOKED", 401], // 401 → the token layer refreshes once and retries
  [/InvalidCredentials/i, "AUTH_REVOKED", 401],
  [/UserIsNotAuthorized|NotAuthorized|AccountNotAuthorized|CustomerNotAuthorized/i, "PERMISSION_DENIED"],
  [/DeveloperToken/i, "NOT_APPROVED"],
  [/CallRateExceeded|TooManyRequests|ConcurrentRequestOverLimit/i, "RATE_LIMITED"],
  [/InternalError|ServiceUnavailable|Timeout/i, "TRANSIENT"],
];

export function classifyMicrosoftError(status: number, body: unknown): IntegrationError {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const messageMatch = text.match(/"Message"\s*:\s*"([^"]+)"/i);
  const message = messageMatch?.[1] ?? (typeof body === "string" && body ? body.slice(0, 300) : `Microsoft Advertising API returned HTTP ${status}`);
  for (const [re, kind, forcedStatus] of ERROR_KINDS) {
    const m = text.match(re);
    if (m) return new IntegrationError(kind, `${m[0]}: ${message}`, undefined, forcedStatus ?? status);
  }
  if (status === 401) return new IntegrationError("AUTH_REVOKED", message, undefined, status);
  if (status === 403) return new IntegrationError("PERMISSION_DENIED", message, undefined, status);
  if (status === 429) return new IntegrationError("RATE_LIMITED", message, undefined, status);
  if (status >= 500) return new IntegrationError("TRANSIENT", message, undefined, status);
  return new IntegrationError("INVALID_REQUEST", message, undefined, status);
}

const STATUS_MAP: Record<string, RemoteCampaign["status"]> = {
  Active: "ENABLED",
  Paused: "PAUSED",
  BudgetPaused: "PAUSED",
  BudgetAndManualPaused: "PAUSED",
  Suspended: "PAUSED",
  Deleted: "REMOVED",
};

/** "2026-10-16" or "10/16/2026" → ISO date. */
export function parseReportDate(v: string): IsoDate | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/** Campaign performance CSV rows → leaf daily rows. Conversions and Revenue are as reported by Microsoft Advertising. */
export function parseCampaignReport(records: Record<string, string>[]): { rows: RemoteDailyRow[]; campaigns: RemoteCampaign[] } {
  const out = new Map<string, RemoteDailyRow>();
  const campaigns = new Map<string, RemoteCampaign>();
  const num = (v: string | undefined) => {
    const n = Number((v ?? "").replace(/,/g, "").replace(/%$/, ""));
    return Number.isFinite(n) ? n : 0;
  };
  for (const r of records) {
    const date = parseReportDate(r.TimePeriod ?? "");
    const id = r.CampaignId;
    if (!date || !id) continue; // skips footer / copyright lines
    campaigns.set(id, { externalId: id, name: r.CampaignName || `Campaign ${id}`, status: STATUS_MAP[r.CampaignStatus] ?? "UNKNOWN" });
    const key = `${id}|${date}`;
    const row = out.get(key) ?? { campaignExternalId: id, date, costMinor: 0, costIsEstimated: false, impressions: 0, clicks: 0, conversions: 0, conversionValueMinor: 0 };
    row.costMinor += decimalToMinor(r.Spend);
    row.impressions += Math.round(num(r.Impressions));
    row.clicks += Math.round(num(r.Clicks));
    row.conversions += num(r.Conversions);
    row.conversionValueMinor += decimalToMinor(r.Revenue);
    out.set(key, row);
  }
  return { rows: [...out.values()], campaigns: [...campaigns.values()] };
}

export function campaignReportRequest(accountId: string, from: IsoDate, to: IsoDate) {
  const d = (iso: IsoDate) => {
    const [Year, Month, Day] = iso.split("-").map(Number);
    return { Day, Month, Year };
  };
  return {
    ReportRequest: {
      Type: "CampaignPerformanceReportRequest",
      ReportName: "pacing-daily-campaign",
      Format: "Csv",
      FormatVersion: "2.0",
      ExcludeColumnHeaders: false,
      ExcludeReportHeader: true,
      ExcludeReportFooter: true,
      ReturnOnlyCompleteData: false,
      Aggregation: "Daily",
      Columns: REPORT_COLUMNS,
      Filter: null,
      Scope: { AccountIds: [Number(accountId)], Campaigns: null },
      Time: { CustomDateRangeStart: d(from), CustomDateRangeEnd: d(to), PredefinedTime: null, ReportTimeZone: null },
    },
  };
}

export function createMicrosoftAdsAdapter(
  opts: { config?: MicrosoftAdsConfig | null; fetch?: FetchLike; sleep?: (ms: number) => Promise<void>; pollIntervalMs?: number; maxPollMs?: number } = {},
): PlatformAdapter {
  const fetchImpl = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollInterval = opts.pollIntervalMs ?? 3000;
  const maxPoll = opts.maxPollMs ?? 10 * 60_000;
  const cfg = () => {
    const c = opts.config === undefined ? microsoftAdsConfig() : opts.config;
    if (!c) throw new IntegrationError("NOT_CONFIGURED", "Microsoft Advertising credentials are not configured on the server");
    return c;
  };
  const tokenUrl = () => `https://login.microsoftonline.com/${cfg().tenant}/oauth2/v2.0/token`;

  async function tokenRequest(params: Record<string, string>): Promise<OAuthTokens> {
    const exchanging = params.grant_type === "authorization_code";
    let res: Response;
    try {
      res = await fetchImpl(tokenUrl(), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
    } catch (e) {
      throw new IntegrationError("TRANSIENT", `Network error contacting Microsoft identity platform: ${(e as Error).message}`);
    }
    const body = ((await readJson(res)) ?? {}) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      if (exchanging && body.error === "invalid_grant") {
        // During the initial connection this means the sign-in code was bad, reused or expired.
        throw new IntegrationError("INVALID_REQUEST", "Microsoft did not accept the sign-in code (it may have expired or been used already). Please connect again.", undefined, res.status);
      }
      if (body.error === "invalid_grant" || body.error === "interaction_required") {
        throw new IntegrationError("AUTH_REVOKED", "Microsoft authorization was revoked or expired. Reconnect the account.", undefined, res.status);
      }
      if (body.error === "invalid_client" || body.error === "unauthorized_client") {
        throw new IntegrationError("NOT_CONFIGURED", `Microsoft rejected the app registration (${body.error}). Check MICROSOFT_ADS_CLIENT_ID and MICROSOFT_ADS_CLIENT_SECRET.`, undefined, res.status);
      }
      if (res.status >= 500) throw new IntegrationError("TRANSIENT", `Microsoft identity platform error ${res.status}`, undefined, res.status);
      throw new IntegrationError("INVALID_REQUEST", `Microsoft OAuth error: ${body.error ?? res.status} ${(body.error_description ?? "").split("\n")[0]}`.trim(), undefined, res.status);
    }
    return {
      accessToken: body.access_token,
      // Microsoft rotates refresh tokens: always store the newest one.
      refreshToken: body.refresh_token,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : undefined,
      scopes: body.scope,
    };
  }

  async function call<T>(url: string, token: string, body: unknown, ids: { customerId?: string | null; accountId?: string | null } = {}): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      DeveloperToken: cfg().developerToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (ids.customerId) headers.CustomerId = ids.customerId;
    if (ids.accountId) headers.CustomerAccountId = ids.accountId;
    let res: Response;
    try {
      res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e) {
      throw new IntegrationError("TRANSIENT", `Network error calling Microsoft Advertising API: ${(e as Error).message}`);
    }
    const parsed = await readJson(res);
    // Faults can arrive with HTTP 200 and an Errors/OperationErrors array.
    const hasFault = parsed && typeof parsed === "object" && ["Errors", "OperationErrors", "BatchErrors"].some((k) => Array.isArray((parsed as Record<string, unknown>)[k]) && ((parsed as Record<string, unknown[]>)[k]).length > 0);
    if (!res.ok || hasFault) throw classifyMicrosoftError(res.ok ? 400 : res.status, parsed);
    return parsed as T;
  }

  return {
    platform: "MICROSOFT_ADS",
    connectionPlatform: "MICROSOFT_ADS",
    linkablePlatforms: ["MICROSOFT_ADS"],
    spendIsVerified: true,
    restatementWindowDays: 14,
    initialBackfillDays: 400,
    maxRangeDays: 92,

    isConfigured: () => opts.config !== undefined ? !!opts.config : microsoftAdsConfig() !== null,

    authorizationUrl(state, redirectUri) {
      const q = new URLSearchParams({
        client_id: cfg().clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        response_mode: "query",
        scope: MICROSOFT_SCOPE,
        state,
        prompt: "select_account",
      });
      return `https://login.microsoftonline.com/${cfg().tenant}/oauth2/v2.0/authorize?${q.toString()}`;
    },

    exchangeCode: (code, redirectUri) =>
      tokenRequest({ client_id: cfg().clientId, client_secret: cfg().clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code", scope: MICROSOFT_SCOPE }),

    refresh: (refreshToken) => tokenRequest({ client_id: cfg().clientId, client_secret: cfg().clientSecret, refresh_token: refreshToken, grant_type: "refresh_token", scope: MICROSOFT_SCOPE }),

    /** Every ad account the signed-in user can access (GetUser → SearchAccounts by UserId, paged). */
    async listAccounts(token) {
      const me = await call<{ User?: { Id?: number | string } }>(`${CUSTOMER_API}/User/Query`, token, { UserId: null });
      const userId = me.User?.Id;
      if (userId === undefined || userId === null) throw new IntegrationError("INVALID_REQUEST", "Microsoft Advertising did not return the signed-in user's id");
      const out: RemoteAccount[] = [];
      const size = 1000;
      for (let index = 0; index < 100; index++) {
        const page = await call<{ Accounts?: { Id?: number | string; Name?: string; Number?: string; CurrencyCode?: string; TimeZone?: string; AccountLifeCycleStatus?: string; ParentCustomerId?: number | string }[] }>(
          `${CUSTOMER_API}/Accounts/Search`,
          token,
          { Predicates: [{ Field: "UserId", Operator: "Equals", Value: String(userId) }], Ordering: null, PageInfo: { Index: index, Size: size }, ReturnAdditionalFields: null },
        );
        const accounts = page.Accounts ?? [];
        for (const a of accounts) {
          if (a.Id === undefined) continue;
          const iana = microsoftTimeZoneToIana(a.TimeZone);
          const notes = [a.AccountLifeCycleStatus && a.AccountLifeCycleStatus !== "Active" ? a.AccountLifeCycleStatus : null, !iana && a.TimeZone ? `time zone ${a.TimeZone} not mapped; client time zone will be used` : null].filter(Boolean);
          out.push({
            externalId: String(a.Id),
            displayId: a.Number ?? String(a.Id),
            name: a.Name ?? `Account ${a.Id}`,
            currency: a.CurrencyCode ?? "USD",
            timezone: iana ?? "",
            isManager: false,
            loginCustomerId: a.ParentCustomerId !== undefined ? String(a.ParentCustomerId) : undefined,
            statusNote: notes.length ? notes.join("; ") : undefined,
          });
        }
        if (accounts.length < size) break;
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },

    /** Campaigns are discovered from the performance report itself. */
    listCampaigns: async () => [],

    async fetchDailyPerformance(token, account, from, to): Promise<DailyPerformanceResult> {
      assertIsoDate(from);
      assertIsoDate(to);
      const ids = { customerId: account.loginCustomerId, accountId: account.externalId };
      const submitted = await call<{ ReportRequestId?: string }>(`${REPORTING_API}/GenerateReport/Submit`, token, campaignReportRequest(account.externalId, from, to), ids);
      const requestId = submitted.ReportRequestId;
      if (!requestId) throw new IntegrationError("INVALID_REQUEST", "Microsoft Advertising did not return a report request id");

      let url: string | null | undefined;
      for (let waited = 0; ; waited += pollInterval) {
        const polled = await call<{ ReportRequestStatus?: { Status?: string; ReportDownloadUrl?: string | null } }>(`${REPORTING_API}/GenerateReport/Poll`, token, { ReportRequestId: requestId }, ids);
        const status = polled.ReportRequestStatus?.Status;
        if (status === "Success") {
          url = polled.ReportRequestStatus?.ReportDownloadUrl;
          break;
        }
        if (status === "Error") throw new IntegrationError("TRANSIENT", "Microsoft Advertising report generation failed");
        if (waited >= maxPoll) throw new IntegrationError("TRANSIENT", "Timed out waiting for the Microsoft Advertising report");
        await sleep(pollInterval);
      }
      // A successful report with no download URL means there was no data in the range.
      if (!url) return { rows: [], campaigns: [] };
      if (!/^https:\/\/[^/]*\.(microsoft\.com|bingads\.com|blob\.core\.windows\.net)\//.test(url)) {
        throw new IntegrationError("INVALID_REQUEST", "Unexpected report download host");
      }
      let res: Response;
      try {
        res = await fetchImpl(url);
      } catch (e) {
        throw new IntegrationError("TRANSIENT", `Network error downloading report: ${(e as Error).message}`);
      }
      if (!res.ok) throw new IntegrationError(res.status >= 500 ? "TRANSIENT" : "INVALID_REQUEST", `Report download failed (HTTP ${res.status})`, undefined, res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
      const csv = isZip ? unzipEntries(buf).find((e) => e.name.toLowerCase().endsWith(".csv"))?.data.toString("utf8") ?? "" : buf.toString("utf8");
      return parseCampaignReport(parseCsv(csv));
    },

    dataCompleteThrough: (tz, now) => completeThrough(tz, now, 6),
  };
}
