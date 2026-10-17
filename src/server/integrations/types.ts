import type { Platform } from "@prisma/client";
import type { IsoDate } from "@/lib/pacing/dates";

/**
 * Contract every advertising-platform integration implements. Adding a
 * platform = implementing this interface and registering it in registry.ts;
 * the sync runner, pacing engine and reports do not change.
 */
export interface PlatformAdapter {
  platform: Platform;
  /** Build the OAuth consent URL for this platform. */
  authorizationUrl(state: string, redirectUri: string): string;
  /** Exchange an OAuth code for tokens (caller encrypts and stores them). */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  /** Accounts the authorized login can access (e.g. every customer under a Google Ads MCC). */
  listAccounts(tokens: OAuthTokens): Promise<RemoteAccount[]>;
  listCampaigns(tokens: OAuthTokens, accountExternalId: string): Promise<RemoteCampaign[]>;
  /**
   * Daily leaf-level performance for [from, to] in the account's own timezone.
   * Must return one row per campaign per day (or per account per day if the
   * platform has no campaign granularity) and never pre-aggregated totals.
   */
  fetchDailyPerformance(tokens: OAuthTokens, accountExternalId: string, from: IsoDate, to: IsoDate): Promise<RemoteDailyRow[]>;
  /**
   * Last date whose numbers the platform considers final enough to pace on.
   * Platforms report with a delay; the dashboard never paces past this date.
   */
  dataCompleteThrough(accountTimezone: string, now: Date): IsoDate;
  /** How far back to re-fetch on each sync, because conversions are restated. */
  restatementWindowDays: number;
  /** Whether cost from this platform is verified billed spend. */
  spendIsVerified: boolean;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
}

export interface RemoteAccount {
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  isManager: boolean;
  parentExternalId?: string;
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
  namedConversions?: { name: string; value: number; valueMinor?: number }[];
}
