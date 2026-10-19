import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// CSRF protection for OAuth: the `state` parameter is a short-lived signed
// token bound to the signed-in user and to a nonce kept in an HttpOnly cookie.

export const OAUTH_NONCE_COOKIE = "pm_oauth_nonce";
const TTL_SECONDS = 600;

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function createOAuthState(userId: string, agencyId: string, platform: string, clientId?: string) {
  const nonce = randomBytes(16).toString("base64url");
  // `cid`: the client record the connection was started from, if any.
  const state = await new SignJWT({ nonce, aid: agencyId, p: platform, ...(clientId ? { cid: clientId } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
  return { state, nonce, maxAge: TTL_SECONDS };
}

export async function verifyOAuthState(state: string, nonceCookie: string | undefined, userId: string, platform: string) {
  const { payload } = await jwtVerify(state, secret());
  if (!nonceCookie || payload.nonce !== nonceCookie) throw new Error("OAuth state does not match this browser session");
  if (payload.sub !== userId) throw new Error("OAuth flow was started by a different user");
  if (payload.p !== platform) throw new Error("OAuth state is for a different platform");
  return { agencyId: String(payload.aid), clientId: typeof payload.cid === "string" ? payload.cid : null };
}

/**
 * Public URL for a path. Behind a proxy (Railway) the request URL is the
 * internal address (e.g. localhost:8080), so APP_URL comes first.
 */
export function publicUrl(path: string, requestUrl: string): URL {
  return new URL(path, process.env.APP_URL ?? new URL(requestUrl).origin);
}

/** Redirect URI registered with the OAuth client. APP_URL must match it exactly in production. */
export function redirectUri(path: string, requestUrl: string): string {
  const base = process.env.APP_URL ?? new URL(requestUrl).origin;
  return new URL(path, base).toString();
}
