import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { OAUTH_NONCE_COOKIE, publicUrl, redirectUri, verifyOAuthState } from "@/server/integrations/oauth-state";
import { storeDataSourceTokens } from "@/server/data-sources/credentials";
import {
  exchangeMetaOrganicCode,
  fetchMetaOrganicUser,
  META_ORGANIC_CALLBACK_PATH,
  META_ORGANIC_COOKIE_PATH,
  META_ORGANIC_STATE_PLATFORM,
  metaOrganicConfig,
} from "@/server/data-sources/meta-organic/oauth";

const LABEL = "Facebook & Instagram";

function back(req: NextRequest, error: string) {
  const res = NextResponse.redirect(publicUrl(`/integrations?error=${encodeURIComponent(error)}`, req.url));
  res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: META_ORGANIC_COOKIE_PATH });
  return res;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "AGENCY_ADMIN") return NextResponse.redirect(publicUrl("/login", req.url));
  const q = req.nextUrl.searchParams;
  const providerError = q.get("error");
  if (providerError) {
    const cancelled = providerError === "access_denied" || q.get("error_reason") === "user_denied";
    return back(req, cancelled ? `${LABEL} authorization was cancelled` : `${LABEL} returned: ${q.get("error_description") ?? providerError}`);
  }
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return back(req, "Missing authorization code");
  try {
    await verifyOAuthState(state, req.cookies.get(OAUTH_NONCE_COOKIE)?.value, user.id, META_ORGANIC_STATE_PLATFORM);
  } catch (e) {
    return back(req, (e as Error).message);
  }
  const cfg = metaOrganicConfig();
  if (!cfg) return back(req, `${LABEL}: META_APP_ID and META_APP_SECRET are not configured on the server.`);

  let tokens: Awaited<ReturnType<typeof exchangeMetaOrganicCode>>;
  let fbUser: Awaited<ReturnType<typeof fetchMetaOrganicUser>>;
  try {
    tokens = await exchangeMetaOrganicCode(cfg, code, redirectUri(META_ORGANIC_CALLBACK_PATH, req.url));
    fbUser = await fetchMetaOrganicUser(cfg, tokens.accessToken);
  } catch (e) {
    // These messages are built by our Graph helpers and never include tokens.
    return back(req, (e as Error).message || `Could not complete ${LABEL} authorization`);
  }

  const label = `${LABEL} — ${fbUser.name}`;
  // Reconnecting the same Facebook user updates the existing connection, so linked Pages keep working.
  const existing = await prisma.dataSourceConnection.findFirst({ where: { agencyId: user.agencyId, provider: "META_ORGANIC", externalId: fbUser.id }, select: { id: true } });
  const connection = existing
    ? await prisma.dataSourceConnection.update({ where: { id: existing.id }, data: { label }, select: { id: true } })
    : await prisma.dataSourceConnection.create({ data: { agencyId: user.agencyId, provider: "META_ORGANIC", label, externalId: fbUser.id, createdById: user.id }, select: { id: true } });
  await storeDataSourceTokens(connection.id, { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt, scopes: fbUser.granted.join(",") || null });

  const res = NextResponse.redirect(publicUrl(`/integrations/data-sources/${connection.id}`, req.url));
  res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: META_ORGANIC_COOKIE_PATH });
  return res;
}
