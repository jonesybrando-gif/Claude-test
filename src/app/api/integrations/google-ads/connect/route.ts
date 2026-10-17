import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { createGoogleAdsAdapter } from "@/server/integrations/google-ads/adapter";
import { createOAuthState, OAUTH_NONCE_COOKIE, redirectUri } from "@/server/integrations/oauth-state";

const CALLBACK_PATH = "/api/integrations/google-ads/callback";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "AGENCY_ADMIN") return NextResponse.json({ error: "Only agency administrators can connect platforms" }, { status: 403 });
  const adapter = createGoogleAdsAdapter();
  if (!adapter.isConfigured()) return NextResponse.redirect(new URL("/integrations?error=google_ads_not_configured", req.url));

  const { state, nonce, maxAge } = await createOAuthState(user.id, user.agencyId, "GOOGLE_ADS");
  const res = NextResponse.redirect(adapter.authorizationUrl(state, redirectUri(CALLBACK_PATH, req.url)));
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge, path: "/api/integrations" });
  return res;
}
