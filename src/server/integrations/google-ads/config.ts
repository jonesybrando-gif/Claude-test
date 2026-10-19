export interface GoogleAdsConfig {
  clientId: string;
  clientSecret: string;
  /**
   * Optional. Google retired developer tokens on 2026-09-09: API access now
   * belongs to the Google Cloud project behind the OAuth client. A token set
   * here is still sent, for older setups.
   */
  developerToken: string | null;
  /** e.g. "v26". Google now releases often; older versions are sunset on a schedule. */
  apiVersion: string;
}

export const DEFAULT_GOOGLE_ADS_API_VERSION = "v26";

export const GOOGLE_ADS_ENV_VARS = ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"] as const;

export function missingGoogleAdsEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return GOOGLE_ADS_ENV_VARS.filter((k) => !env[k]);
}

export function googleAdsConfig(env: NodeJS.ProcessEnv = process.env): GoogleAdsConfig | null {
  if (missingGoogleAdsEnv(env).length) return null;
  const apiVersion = env.GOOGLE_ADS_API_VERSION || DEFAULT_GOOGLE_ADS_API_VERSION;
  if (!/^v\d+$/.test(apiVersion)) throw new Error("GOOGLE_ADS_API_VERSION must look like v26");
  return {
    clientId: env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET!,
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN || null,
    apiVersion,
  };
}
