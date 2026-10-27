import type { FetchLike } from "./http";
import { googleScopes } from "./modules";

// OAuth for the GOOGLE data-source login (GA4, Search Console, Business
// Profile). Uses its own OAuth client (GOOGLE_DATA_CLIENT_ID/SECRET, a
// separate Cloud project so its scopes never touch the Google Ads app's
// verification). Never falls back to the Google Ads client: these scopes
// must not appear on the verified Ads app.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const GOOGLE_DS_CALLBACK_PATH = "/api/data-sources/google/callback";
/** Platform tag in the signed OAuth state (distinct from the Google Ads flow). */
export const GOOGLE_DS_STATE_PLATFORM = "DS_GOOGLE";

export interface GoogleOAuthClient { clientId: string; clientSecret: string }

export function googleOAuthClient(env: NodeJS.ProcessEnv = process.env): GoogleOAuthClient | null {
  if (env.GOOGLE_DATA_CLIENT_ID && env.GOOGLE_DATA_CLIENT_SECRET) return { clientId: env.GOOGLE_DATA_CLIENT_ID, clientSecret: env.GOOGLE_DATA_CLIENT_SECRET };
  return null;
}

function requireClient(c?: GoogleOAuthClient | null): GoogleOAuthClient {
  const client = c ?? googleOAuthClient();
  if (!client) throw new Error("Google OAuth is not configured on the server (GOOGLE_DATA_CLIENT_ID / GOOGLE_DATA_CLIENT_SECRET).");
  return client;
}

export function googleAuthorizationUrl(state: string, redirectUri: string, client?: GoogleOAuthClient, scopes: string[] = googleScopes()): string {
  const q = new URLSearchParams({
    client_id: requireClient(client).clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    // Keeps earlier grants when a product (e.g. Business Profile) is added later with a Reconnect.
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export interface GoogleTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes?: string;
  idToken?: string;
}

interface TokenBody { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string }

async function tokenRequest(params: Record<string, string>, f: FetchLike): Promise<GoogleTokenResult> {
  let res: Response;
  try {
    res = await f(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
  } catch (e) {
    throw new Error(`Network error contacting Google OAuth: ${(e as Error).message}`);
  }
  const body = (await res.json().catch(() => ({}))) as TokenBody;
  if (!res.ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      throw new Error(params.grant_type === "refresh_token" ? "invalid_grant: Google authorization was revoked or expired. Reconnect Google." : "Google did not accept the sign-in code (it may have expired or been used). Please connect again.");
    }
    throw new Error(`Google OAuth error ${res.status}: ${body.error ?? "unknown"}${body.error_description ? ` (${body.error_description})` : ""}`.slice(0, 300));
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
    scopes: body.scope,
    idToken: body.id_token,
  };
}

export function exchangeGoogleCode(code: string, redirectUri: string, opts: { client?: GoogleOAuthClient; fetch?: FetchLike } = {}) {
  const c = requireClient(opts.client);
  return tokenRequest({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }, opts.fetch ?? fetch);
}

export function refreshGoogleToken(refreshToken: string, opts: { client?: GoogleOAuthClient; fetch?: FetchLike } = {}) {
  const c = requireClient(opts.client);
  return tokenRequest({ refresh_token: refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token" }, opts.fetch ?? fetch);
}

/** Claims from an id_token received directly from Google's token endpoint over TLS (so not re-verified). */
export function decodeIdToken(idToken: string | undefined): { sub?: string; email?: string } {
  if (!idToken) return {};
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: unknown; email?: unknown };
    return { sub: typeof payload.sub === "string" ? payload.sub : undefined, email: typeof payload.email === "string" ? payload.email : undefined };
  } catch {
    return {};
  }
}

/** The Google account behind the tokens (id_token first, then the userinfo endpoint). */
export async function googleIdentity(t: GoogleTokenResult, f: FetchLike = fetch): Promise<{ sub?: string; email?: string }> {
  const fromId = decodeIdToken(t.idToken);
  if (fromId.email && fromId.sub) return fromId;
  try {
    const res = await f(USERINFO_URL, { headers: { Authorization: `Bearer ${t.accessToken}` } });
    if (!res.ok) return fromId;
    const b = (await res.json()) as { sub?: string; email?: string };
    return { sub: b.sub ?? fromId.sub, email: b.email ?? fromId.email };
  } catch {
    return fromId;
  }
}

/** Revokes this OAuth client's whole grant for the token's Google login. Best effort: false on any failure. */
export async function revokeGoogleToken(token: string, f: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await f(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
    return res.ok;
  } catch {
    return false;
  }
}
