import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { createGoogleAdsAdapter } from "@/server/integrations/google-ads/adapter";
import { OAUTH_NONCE_COOKIE, redirectUri, verifyOAuthState } from "@/server/integrations/oauth-state";
import { storeTokens } from "@/server/integrations/tokens";
import { IntegrationError } from "@/server/integrations/errors";

const CALLBACK_PATH = "/api/integrations/google-ads/callback";

function back(req: NextRequest, error: string) {
  const res = NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(error)}`, req.url));
  res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: "/api/integrations" });
  return res;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "AGENCY_ADMIN") return NextResponse.redirect(new URL("/login", req.url));
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back(req, params.get("error") === "access_denied" ? "Google authorization was cancelled" : `Google returned: ${params.get("error")}`);

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back(req, "Missing authorization code");
  try {
    await verifyOAuthState(state, req.cookies.get(OAUTH_NONCE_COOKIE)?.value, user.id, "GOOGLE_ADS");
  } catch (e) {
    return back(req, (e as Error).message);
  }

  const adapter = createGoogleAdsAdapter();
  try {
    const tokens = await adapter.exchangeCode(code, redirectUri(CALLBACK_PATH, req.url));
    if (!tokens.refreshToken) return back(req, "Google did not return a refresh token. Remove the app's access in your Google account settings and connect again.");
    const connection = await prisma.platformConnection.create({
      data: { agencyId: user.agencyId, platform: "GOOGLE_ADS", label: `Google Ads — connected by ${user.name}`, status: "ACTIVE", createdById: user.id },
    });
    await storeTokens(connection.id, tokens);
    const res = NextResponse.redirect(new URL(`/integrations/google-ads/${connection.id}`, req.url));
    res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: "/api/integrations" });
    return res;
  } catch (e) {
    return back(req, e instanceof IntegrationError ? e.message : "Could not complete Google authorization");
  }
}
