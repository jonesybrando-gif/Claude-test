import type { Platform } from "@prisma/client";
import type { PlatformAdapter } from "./types";
import { createGoogleAdsAdapter } from "./google-ads/adapter";
import { missingGoogleAdsEnv } from "./google-ads/config";

export type IntegrationState = "not_implemented" | "awaiting_credentials" | "built_unverified" | "verified";

export interface IntegrationInfo {
  platform: Platform;
  state: IntegrationState;
  phase: number;
  api: string;
  requirements: string[];
  limitations: string[];
  missingEnv?: string[];
}

const adapters: Partial<Record<Platform, () => PlatformAdapter>> = {
  GOOGLE_ADS: () => createGoogleAdsAdapter(),
};

export function getAdapter(platform: Platform): PlatformAdapter | null {
  return adapters[platform]?.() ?? null;
}

/**
 * Honest status of each integration. "built_unverified" means the code exists
 * and is unit-tested against documented response shapes, but has not yet been
 * exercised against a real, authenticated account.
 */
export function integrationStatus(): IntegrationInfo[] {
  const gaMissing = missingGoogleAdsEnv();
  return [
    {
      platform: "GOOGLE_ADS",
      state: gaMissing.length ? "awaiting_credentials" : "built_unverified",
      missingEnv: gaMissing,
      phase: 2,
      api: "Google Ads API (official REST interface, OAuth 2.0)",
      requirements: [
        "Google Cloud project with the Google Ads API enabled and an OAuth client (type: web application)",
        "Authorized redirect URI: <APP_URL>/api/integrations/google-ads/callback",
        "Developer token from your manager (MCC) account's API Center. Test access only works with test accounts; production accounts need Basic access or higher",
        "Server env vars: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN (optional GOOGLE_ADS_API_VERSION)",
      ],
      limitations: [
        "Yesterday is treated as complete after 3am in the account's timezone; the last 14 days are re-fetched on every sync to pick up restated conversions.",
        "Conversions are Google Ads platform-reported conversions under each account's conversion settings.",
        "Dates come in the Google Ads account's timezone; if it differs from the client's reporting timezone, the client page shows a warning.",
      ],
    },
    {
      platform: "META_ADS",
      state: "not_implemented",
      phase: 3,
      api: "Meta Marketing API (official, Facebook Login)",
      requirements: ["Meta developer app with Marketing API access", "App Review approval for ads_read (and business_management for Business Manager accounts)", "Business verification"],
      limitations: ["Meta conversions (leads, purchases) are platform-reported and use Meta's attribution settings."],
    },
    {
      platform: "MICROSOFT_ADS",
      state: "not_implemented",
      phase: 3,
      api: "Microsoft Advertising API (official, Microsoft identity platform OAuth)",
      requirements: ["Microsoft Advertising developer token", "Azure app registration for OAuth", "User with access to the manager account"],
      limitations: ["Reports are generated asynchronously and downloaded, so syncs take longer than other platforms."],
    },
    {
      platform: "GOOGLE_LSA",
      state: "not_implemented",
      phase: 3,
      api: "To be confirmed against current Google documentation before building",
      requirements: ["Verify which official API currently exposes Local Services leads and charges, and whether it reports daily cost"],
      limitations: [
        "Until verified, LSA spend is treated as an estimate and labelled as such everywhere.",
        "If the official API does not provide verified daily spend, pacing for LSA will remain clearly marked as estimated.",
      ],
    },
  ];
}
