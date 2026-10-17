export interface MicrosoftAdsConfig {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  /** Microsoft identity tenant: "common" (default) accepts work and personal Microsoft accounts. */
  tenant: string;
}

export const MICROSOFT_ENV_VARS = ["MICROSOFT_ADS_CLIENT_ID", "MICROSOFT_ADS_CLIENT_SECRET", "MICROSOFT_ADS_DEVELOPER_TOKEN"] as const;

export function missingMicrosoftEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return MICROSOFT_ENV_VARS.filter((k) => !env[k]);
}

export function microsoftAdsConfig(env: NodeJS.ProcessEnv = process.env): MicrosoftAdsConfig | null {
  if (missingMicrosoftEnv(env).length) return null;
  const tenant = env.MICROSOFT_ADS_TENANT || "common";
  if (!/^[\w.-]+$/.test(tenant)) throw new Error("MICROSOFT_ADS_TENANT is not valid");
  return { clientId: env.MICROSOFT_ADS_CLIENT_ID!, clientSecret: env.MICROSOFT_ADS_CLIENT_SECRET!, developerToken: env.MICROSOFT_ADS_DEVELOPER_TOKEN!, tenant };
}
