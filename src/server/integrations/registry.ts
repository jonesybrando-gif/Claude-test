import type { Platform } from "@prisma/client";

export type IntegrationState = "not_implemented" | "awaiting_credentials" | "awaiting_platform_approval" | "available";

export interface IntegrationInfo {
  platform: Platform;
  state: IntegrationState;
  phase: number;
  api: string;
  requirements: string[];
  limitations: string[];
}

// Honest status of each integration. Nothing here is "available" until a real
// authenticated connection has been built and tested end to end.
export const INTEGRATIONS: IntegrationInfo[] = [
  {
    platform: "GOOGLE_ADS",
    state: "not_implemented",
    phase: 2,
    api: "Google Ads API (official, OAuth 2.0)",
    requirements: [
      "Google Cloud OAuth client (web application) with the Google Ads API enabled",
      "Google Ads developer token from your manager (MCC) account's API Center — Basic access or higher for production accounts",
      "Agency user with access to the MCC to authorize the connection",
    ],
    limitations: ["Recent days' cost and conversions can be restated, so recent days are re-synced on every run."],
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
