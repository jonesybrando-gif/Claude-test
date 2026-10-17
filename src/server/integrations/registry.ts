import type { Platform } from "@prisma/client";
import type { PlatformAdapter } from "./types";
import { createGoogleAdsAdapter } from "./google-ads/adapter";
import { missingGoogleAdsEnv } from "./google-ads/config";
import { createMetaAdsAdapter } from "./meta-ads/adapter";
import { missingMetaEnv } from "./meta-ads/config";
import { createMicrosoftAdsAdapter } from "./microsoft-ads/adapter";
import { missingMicrosoftEnv } from "./microsoft-ads/config";

export type IntegrationState = "not_implemented" | "awaiting_credentials" | "built_unverified" | "verified";

export interface IntegrationInfo {
  platform: Platform;
  /** URL slug of the connection flow for this platform (null when it reuses another platform's connection). */
  slug: string | null;
  connectVia?: Platform;
  state: IntegrationState;
  api: string;
  requirements: string[];
  limitations: string[];
  missingEnv?: string[];
  supportsTokenConnect?: boolean;
}

const adapters: Record<Platform, () => PlatformAdapter> = {
  GOOGLE_ADS: () => createGoogleAdsAdapter(),
  GOOGLE_LSA: () => createGoogleAdsAdapter({ localServices: true }),
  META_ADS: () => createMetaAdsAdapter(),
  MICROSOFT_ADS: () => createMicrosoftAdsAdapter(),
};

/** Platforms with their own login, by URL slug. */
export const CONNECTION_SLUGS: Record<string, Platform> = {
  "google-ads": "GOOGLE_ADS",
  "meta-ads": "META_ADS",
  "microsoft-ads": "MICROSOFT_ADS",
};

export const SLUG_FOR_PLATFORM: Partial<Record<Platform, string>> = Object.fromEntries(Object.entries(CONNECTION_SLUGS).map(([s, p]) => [p, s]));

export function getAdapter(platform: Platform): PlatformAdapter {
  return adapters[platform]();
}

export function platformForSlug(slug: string): Platform | null {
  return CONNECTION_SLUGS[slug] ?? null;
}

/**
 * Honest status of each integration. "built_unverified" means the code exists
 * and is unit-tested against documented request/response formats, but has not
 * yet been exercised against a real, authorized account.
 */
export function integrationStatus(): IntegrationInfo[] {
  const ga = missingGoogleAdsEnv();
  const meta = missingMetaEnv();
  const ms = missingMicrosoftEnv();
  const state = (missing: string[]): IntegrationState => (missing.length ? "awaiting_credentials" : "built_unverified");
  return [
    {
      platform: "GOOGLE_ADS",
      slug: "google-ads",
      state: state(ga),
      missingEnv: ga,
      api: "Google Ads API (official REST interface, OAuth 2.0)",
      requirements: [
        "Google Cloud project with the Google Ads API enabled and an OAuth client (type: web application)",
        "Authorized redirect URI: <APP_URL>/api/integrations/google-ads/callback",
        "Developer token from your manager (MCC) account's API Center. Test access only works with test accounts; production accounts need Basic access or higher",
        "Server env vars: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN",
      ],
      limitations: [
        "Local Services campaigns are excluded here and reported under Google LSA, so their cost is never counted twice.",
        "Yesterday counts as complete after 3am account time; the last 14 days are re-fetched on every sync to pick up restated conversions.",
        "Conversions are Google Ads platform-reported conversions under each account's conversion settings.",
      ],
    },
    {
      platform: "META_ADS",
      slug: "meta-ads",
      state: state(meta),
      missingEnv: meta,
      supportsTokenConnect: true,
      api: "Meta Graph / Marketing API v26.0 (official, Facebook Login)",
      requirements: [
        "Meta developer app (type Business) with the Marketing API product",
        "Facebook Login redirect URI: <APP_URL>/api/integrations/meta-ads/callback",
        "ads_read and business_management permissions (Advanced Access requires Meta App Review and business verification for accounts you don't own)",
        "Server env vars: META_APP_ID, META_APP_SECRET",
      ],
      limitations: [
        "Facebook Login tokens last about 60 days and cannot be refreshed; reconnect before they expire, or use a Business Manager system-user token, which does not expire.",
        "Conversions = leads + purchases as reported by Meta under each ad account's attribution setting; the last 28 days are re-fetched every sync.",
        "Daily reach is stored per day and never summed across days.",
      ],
    },
    {
      platform: "MICROSOFT_ADS",
      slug: "microsoft-ads",
      state: state(ms),
      missingEnv: ms,
      api: "Microsoft Advertising API v13, JSON REST interface (Microsoft identity platform OAuth)",
      requirements: [
        "Microsoft Advertising developer token (Developer Portal, signed in as a Super Admin)",
        "Azure / Microsoft Entra app registration with redirect URI <APP_URL>/api/integrations/microsoft-ads/callback and a client secret",
        "Server env vars: MICROSOFT_ADS_CLIENT_ID, MICROSOFT_ADS_CLIENT_SECRET, MICROSOFT_ADS_DEVELOPER_TOKEN (optional MICROSOFT_ADS_TENANT)",
      ],
      limitations: [
        "Reports are generated asynchronously and downloaded, so each sync takes longer than other platforms.",
        "Yesterday counts as complete after 6am account time; the last 14 days are re-fetched every sync.",
        "Account time zones are mapped to standard time zones; an unmapped one falls back to the client's time zone and is flagged.",
      ],
    },
    {
      platform: "GOOGLE_LSA",
      slug: null,
      connectVia: "GOOGLE_ADS",
      state: state(ga),
      missingEnv: ga,
      api: "Google Ads API: LOCAL_SERVICES campaigns and the local_services_lead resource (uses your Google Ads connection)",
      requirements: [
        "A connected Google Ads login with access (normally through your MCC) to the accounts that run Local Services Ads",
        "Link each account under “Local Services Ads” in the Google Ads account picker",
      ],
      limitations: [
        "Spend comes from the Local Services campaign's cost in the Google Ads API. If Google reports charged leads but no cost, spend is marked “not reported” rather than estimated.",
        "Leads = all Local Services leads created that day; conversions = charged leads.",
        "Lead-level details such as phone numbers are not imported.",
      ],
    },
  ];
}
