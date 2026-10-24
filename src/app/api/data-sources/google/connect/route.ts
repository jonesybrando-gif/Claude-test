import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { createOAuthState, OAUTH_NONCE_COOKIE, publicUrl, redirectUri } from "@/server/integrations/oauth-state";
import { GOOGLE_DS_CALLBACK_PATH, GOOGLE_DS_STATE_PLATFORM, googleAuthorizationUrl, googleOAuthClient } from "@/server/data-sources/google/oauth";

// Start the Google data-source login (Analytics, Search Console, Business Profile).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "AGENCY_ADMIN") return NextResponse.json({ error: "Only agency administrators can connect data sources" }, { status: 403 });
  if (!googleOAuthClient()) return NextResponse.redirect(publicUrl(`/integrations?error=${encodeURIComponent("Google OAuth is not configured on the server (GOOGLE_DATA_CLIENT_ID / GOOGLE_DATA_CLIENT_SECRET).")}`, req.url));
  const { state, nonce, maxAge } = await createOAuthState(user.id, user.agencyId, GOOGLE_DS_STATE_PLATFORM);
  const res = NextResponse.redirect(googleAuthorizationUrl(state, redirectUri(GOOGLE_DS_CALLBACK_PATH, req.url)));
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge, path: "/api/data-sources/google" });
  return res;
}
