import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { OAUTH_NONCE_COOKIE, publicUrl, redirectUri, verifyOAuthState } from "@/server/integrations/oauth-state";
import { storeDataSourceTokens } from "@/server/data-sources/credentials";
import { exchangeGoogleCode, GOOGLE_DS_CALLBACK_PATH, GOOGLE_DS_STATE_PLATFORM, googleIdentity } from "@/server/data-sources/google/oauth";

const COOKIE_PATH = "/api/data-sources/google";

function back(req: NextRequest, error: string) {
  const res = NextResponse.redirect(publicUrl(`/integrations?error=${encodeURIComponent(error)}`, req.url));
  res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: COOKIE_PATH });
  return res;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "AGENCY_ADMIN") return NextResponse.redirect(publicUrl("/login", req.url));
  const q = req.nextUrl.searchParams;
  const providerError = q.get("error");
  if (providerError) {
    return back(req, providerError === "access_denied" ? "Google authorization was cancelled" : `Google returned: ${q.get("error_description") ?? providerError}`);
  }
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return back(req, "Missing authorization code");
  try {
    await verifyOAuthState(state, req.cookies.get(OAUTH_NONCE_COOKIE)?.value, user.id, GOOGLE_DS_STATE_PLATFORM);
  } catch (e) {
    return back(req, (e as Error).message);
  }

  let connectionId: string;
  try {
    const tokens = await exchangeGoogleCode(code, redirectUri(GOOGLE_DS_CALLBACK_PATH, req.url));
    const { sub, email } = await googleIdentity(tokens);
    // Reconnecting the same Google login updates its connection (keeps linked assets).
    const existing = sub ? await prisma.dataSourceConnection.findFirst({ where: { agencyId: user.agencyId, provider: "GOOGLE", externalId: sub }, orderBy: { createdAt: "desc" } }) : null;
    if (!tokens.refreshToken && !existing?.encryptedRefreshToken) {
      return back(req, "Google did not return a refresh token. Remove this app's access at myaccount.google.com/permissions and connect again.");
    }
    const label = email ?? `Google — connected by ${user.name}`;
    const connection = existing
      ? await prisma.dataSourceConnection.update({ where: { id: existing.id }, data: { label } })
      : await prisma.dataSourceConnection.create({ data: { agencyId: user.agencyId, provider: "GOOGLE", label, externalId: sub ?? null, createdById: user.id } });
    await storeDataSourceTokens(connection.id, { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt, refreshToken: tokens.refreshToken ?? null, scopes: tokens.scopes ?? null });
    if (existing) {
      // Assets paused by a previous disconnect or auth failure resume (ones set to "Don't monitor" stay off).
      await prisma.dataAsset.updateMany({ where: { connectionId: connection.id, status: "NEEDS_REAUTH" }, data: { status: "ACTIVE", lastError: null } });
    }
    connectionId = connection.id;
  } catch (e) {
    return back(req, (e as Error).message || "Could not complete Google authorization");
  }
  const res = NextResponse.redirect(publicUrl(`/integrations/data-sources/${connectionId}`, req.url));
  res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: COOKIE_PATH });
  return res;
}
