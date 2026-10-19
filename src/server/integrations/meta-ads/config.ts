export interface MetaAdsConfig {
  appId: string;
  appSecret: string;
  /** e.g. "v26.0". Meta supports each version for about two years. */
  apiVersion: string;
  /**
   * Facebook Login for Business configuration ID. Business-type apps sign in
   * with a configuration (token type, assets, permissions) instead of a
   * `scope` list; without one the classic scope parameter is sent.
   */
  loginConfigId: string | null;
}

export const DEFAULT_META_API_VERSION = "v26.0";
export const META_ENV_VARS = ["META_APP_ID", "META_APP_SECRET"] as const;

export function missingMetaEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return META_ENV_VARS.filter((k) => !env[k]);
}

export function metaAdsConfig(env: NodeJS.ProcessEnv = process.env): MetaAdsConfig | null {
  if (missingMetaEnv(env).length) return null;
  const apiVersion = env.META_GRAPH_API_VERSION || DEFAULT_META_API_VERSION;
  if (!/^v\d+\.\d+$/.test(apiVersion)) throw new Error("META_GRAPH_API_VERSION must look like v26.0");
  return { appId: env.META_APP_ID!, appSecret: env.META_APP_SECRET!, apiVersion, loginConfigId: env.META_LOGIN_CONFIG_ID || null };
}
