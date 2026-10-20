import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getAdapter, platformForSlug } from "@/server/integrations/registry";
import { createOAuthState, OAUTH_NONCE_COOKIE, publicUrl, redirectUri } from "@/server/integrations/oauth-state";
import { prisma } from "@/server/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const platform = platformForSlug(slug);
  if (!platform) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user || user.role !== "AGENCY_ADMIN") return NextResponse.json({ error: "Only agency administrators can connect platforms" }, { status: 403 });
  const adapter = getAdapter(platform);
  if (!adapter.isConfigured()) return NextResponse.redirect(publicUrl(`/integrations?error=${encodeURIComponent(`${slug}_not_configured`)}`, req.url));

  // ?client=<id>: started from a client record, so return there to pick that client's account.
  const clientId = req.nextUrl.searchParams.get("client");
  if (clientId && !(await prisma.client.findFirst({ where: { id: clientId, agencyId: user.agencyId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  const { state, nonce, maxAge } = await createOAuthState(user.id, user.agencyId, platform, clientId ?? undefined);
  const res = NextResponse.redirect(adapter.authorizationUrl(state, redirectUri(`/api/integrations/${slug}/callback`, req.url)));
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge, path: "/api/integrations" });
  return res;
}
