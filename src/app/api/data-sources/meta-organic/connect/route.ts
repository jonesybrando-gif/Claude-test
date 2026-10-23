import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { createOAuthState, OAUTH_NONCE_COOKIE, publicUrl, redirectUri } from "@/server/integrations/oauth-state";
import { META_ORGANIC_CALLBACK_PATH, META_ORGANIC_COOKIE_PATH, META_ORGANIC_STATE_PLATFORM, metaOrganicAuthorizationUrl, metaOrganicConfig } from "@/server/data-sources/meta-organic/oauth";

/** Starts Facebook Login for Pages + Instagram insights (separate from the Meta Ads login). Admin only. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "AGENCY_ADMIN") return NextResponse.json({ error: "Only agency administrators can connect data sources" }, { status: 403 });
  const cfg = metaOrganicConfig();
  if (!cfg) return NextResponse.redirect(publicUrl(`/integrations?error=${encodeURIComponent("Facebook & Instagram: META_APP_ID and META_APP_SECRET are not configured on the server.")}`, req.url));

  const { state, nonce, maxAge } = await createOAuthState(user.id, user.agencyId, META_ORGANIC_STATE_PLATFORM);
  const res = NextResponse.redirect(metaOrganicAuthorizationUrl(cfg, state, redirectUri(META_ORGANIC_CALLBACK_PATH, req.url)));
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge, path: META_ORGANIC_COOKIE_PATH });
  return res;
}
