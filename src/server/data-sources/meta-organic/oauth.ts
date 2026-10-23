import "server-only";
import { metaAdsConfig, missingMetaEnv } from "@/server/integrations/meta-ads/config";
import { classifyGraphError, createGraphClient, GRAPH_HOST, type FetchLike, type GraphConfig } from "./graph";

// Facebook Login for the organic data source (Pages + Instagram). Separate from
// the Meta Ads login: same Meta app (META_APP_ID / META_APP_SECRET), its own
// permissions and redirect URI.

export const META_ORGANIC_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  "business_management",
] as const;

export const META_ORGANIC_CALLBACK_PATH = "/api/data-sources/meta-organic/callback";
/** The OAuth nonce cookie is scoped to these routes. */
export const META_ORGANIC_COOKIE_PATH = "/api/data-sources/meta-organic";
export const META_ORGANIC_STATE_PLATFORM = "META_ORGANIC";
/** Long-lived user tokens last ~60 days and cannot be refreshed. */
export const META_ORGANIC_TOKEN_DAYS = 60;

export interface MetaOrganicConfig extends GraphConfig {
  /** Facebook Login for Business configuration for this login (optional). */
  loginConfigId: string | null;
}

export function metaOrganicConfig(env: NodeJS.ProcessEnv = process.env): MetaOrganicConfig | null {
  const c = metaAdsConfig(env);
  if (!c) return null;
  return { appId: c.appId, appSecret: c.appSecret, apiVersion: c.apiVersion, loginConfigId: env.META_ORGANIC_LOGIN_CONFIG_ID || null };
}

export const missingMetaOrganicEnv = (env: NodeJS.ProcessEnv = process.env) => missingMetaEnv(env);

export function metaOrganicAuthorizationUrl(cfg: MetaOrganicConfig, state: string, redirectUri: string): string {
  const q = new URLSearchParams({ client_id: cfg.appId, redirect_uri: redirectUri, state, response_type: "code" });
  if (cfg.loginConfigId) {
    // Facebook Login for Business: the configuration carries the permissions.
    q.set("config_id", cfg.loginConfigId);
    q.set("override_default_response_type", "true");
  } else {
    q.set("scope", META_ORGANIC_SCOPES.join(","));
  }
  return `https://www.facebook.com/${cfg.apiVersion}/dialog/oauth?${q.toString()}`;
}

async function oauthGet(cfg: MetaOrganicConfig, params: Record<string, string>, fetchImpl: FetchLike): Promise<{ access_token: string; expires_in?: number }> {
  const url = new URL(`https://${GRAPH_HOST}/${cfg.apiVersion}/oauth/access_token`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetchImpl(url.toString());
  } catch (e) {
    throw new Error(`Network error contacting Meta: ${(e as Error).message}`);
  }
  let body: { access_token?: string; expires_in?: number; error?: unknown } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || body?.error || !body?.access_token) {
    const err = (body as { error?: { code?: number } } | null)?.error;
    if (err?.code === 101) throw new Error("Meta rejected the app credentials. Check META_APP_ID and META_APP_SECRET.");
    throw new Error(`Meta authorization failed: ${classifyGraphError(res.status, body).message}`);
  }
  return { access_token: body.access_token, expires_in: body.expires_in };
}

/** Code → short-lived user token → long-lived user token (~60 days). */
export async function exchangeMetaOrganicCode(cfg: MetaOrganicConfig, code: string, redirectUri: string, fetchImpl: FetchLike = fetch, now = new Date()) {
  const short = await oauthGet(cfg, { client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: redirectUri, code }, fetchImpl);
  const long = await oauthGet(cfg, { grant_type: "fb_exchange_token", client_id: cfg.appId, client_secret: cfg.appSecret, fb_exchange_token: short.access_token }, fetchImpl);
  const seconds = long.expires_in && long.expires_in > 0 ? long.expires_in : META_ORGANIC_TOKEN_DAYS * 86_400;
  return { accessToken: long.access_token, expiresAt: new Date(now.getTime() + seconds * 1000) };
}

/** The Facebook user behind a token and the permissions they granted (declined ones are left out). */
export async function fetchMetaOrganicUser(cfg: MetaOrganicConfig, token: string, fetchImpl: FetchLike = fetch): Promise<{ id: string; name: string; granted: string[] }> {
  const client = createGraphClient({ config: () => cfg, fetch: fetchImpl });
  const me = await client.get<{ id: string; name?: string }>("me", token, { fields: "id,name" });
  let granted: string[] = [];
  try {
    const perms = await client.get<{ data?: { permission: string; status: string }[] }>("me/permissions", token);
    granted = (perms.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
  } catch {
    granted = [];
  }
  return { id: me.id, name: me.name ?? `Facebook user ${me.id}`, granted };
}
