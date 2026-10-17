import type { Platform } from "@prisma/client";
import type { IsoDate } from "@/lib/pacing/dates";

/**
 * Contract every advertising-platform integration implements. Adding a
 * platform = implementing this interface and registering it in registry.ts;
 * the sync runner, pacing engine and reports do not change.
 */
export interface PlatformAdapter {
  platform: Platform;
  /** True when the server has the credentials this integration needs. */
  isConfigured(): boolean;
  /** Build the OAuth consent URL for this platform. */
  authorizationUrl(state: string, redirectUri: string): string;
  /** Exchange an OAuth code for tokens (caller encrypts and stores them). */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  /** Use a refresh token to get a fresh access token. */
  refresh(refreshToken: string): Promise<OAuthTokens>;
  /** Accounts the authorized login can reach (e.g. every customer under a Google Ads MCC). */
  listAccounts(accessToken: string): Promise<RemoteAccount[]>;
  listCampaigns(accessToken: string, account: AccountRef): Promise<RemoteCampaign[]>;
  /**
   * Daily leaf-level performance for [from, to] in the account's own timezone.
   * Returns one row per campaign per day (or per account per day when the
   * platform has no campaign granularity), never pre-aggregated totals.
   * Days with no activity may be absent; absent means zero.
   */
  fetchDailyPerformance(accessToken: string, account: AccountRef, from: IsoDate, to: IsoDate): Promise<{ rows: RemoteDailyRow[]; campaigns: RemoteCampaign[] }>;
  /**
   * Last local date whose numbers are complete enough to pace on. The
   * dashboard never paces past this date.
   */
  dataCompleteThrough(accountTimezone: string, now: Date): IsoDate;
  /** Days re-fetched on every sync because the platform restates recent data (e.g. late conversions). */
  restatementWindowDays: number;
  /** Days of history imported when an account is first connected. */
  initialBackfillDays: number;
  /** Whether cost from this platform is verified billed spend. */
  spendIsVerified: boolean;
}

export interface AccountRef {
  externalId: string;
  loginCustomerId?: string | null;
  timezone?: string | null;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string;
}

export interface RemoteAccount {
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  isManager: boolean;
  isTestAccount?: boolean;
  /** Manager id to send as login-customer-id when reaching this account. */
  loginCustomerId?: string;
  level?: number;
}

export interface RemoteCampaign {
  externalId: string;
  name: string;
  status: "ENABLED" | "PAUSED" | "REMOVED" | "UNKNOWN";
  dailyBudgetMinor?: number;
}

export interface RemoteDailyRow {
  campaignExternalId: string | null;
  date: IsoDate;
  costMinor: number;
  costIsEstimated: boolean;
  impressions: number;
  clicks: number;
  reach?: number;
  conversions: number;
  conversionValueMinor: number;
  leads?: number;
}
