import { after, NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getAdapter, platformForSlug } from "@/server/integrations/registry";
import { OAUTH_NONCE_COOKIE, publicUrl, redirectUri, verifyOAuthState } from "@/server/integrations/oauth-state";
import { storeTokens } from "@/server/integrations/tokens";
import { reattachAccounts } from "@/server/integrations/reattach";
import { syncAccount } from "@/server/sync/sync-account";
import { IntegrationError } from "@/server/integrations/errors";
import { PLATFORM_LABEL } from "@/lib/platforms";

function back(req: NextRequest, error: string) {
  const res = NextResponse.redirect(publicUrl(`/integrations?error=${encodeURIComponent(error)}`, req.url));
  res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: "/api/integrations" });
  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const platform = platformForSlug(slug);
  if (!platform) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user || user.role !== "AGENCY_ADMIN") return NextResponse.redirect(publicUrl("/login", req.url));
  const label = PLATFORM_LABEL[platform];
  const q = req.nextUrl.searchParams;
  const providerError = q.get("error");
  if (providerError) {
    const cancelled = providerError === "access_denied" || q.get("error_reason") === "user_denied";
    return back(req, cancelled ? `${label} authorization was cancelled` : `${label} returned: ${q.get("error_description") ?? providerError}`);
  }
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return back(req, "Missing authorization code");
  let clientId: string | null;
  try {
    ({ clientId } = await verifyOAuthState(state, req.cookies.get(OAUTH_NONCE_COOKIE)?.value, user.id, platform));
  } catch (e) {
    return back(req, (e as Error).message);
  }
  const client = clientId ? await prisma.client.findFirst({ where: { id: clientId, agencyId: user.agencyId }, select: { id: true, name: true } }) : null;

  const adapter = getAdapter(platform);
  try {
    const tokens = await adapter.exchangeCode(code, redirectUri(`/api/integrations/${slug}/callback`, req.url));
    if (adapter.refresh && !tokens.refreshToken) {
      return back(req, `${label} did not return a refresh token. Remove this app's access in your account's security settings and connect again.`);
    }
    const connection = await prisma.platformConnection.create({
      data: { agencyId: user.agencyId, platform, label: client ? `${label} — ${client.name}` : `${label} — connected by ${user.name}`, status: "ACTIVE", createdById: user.id },
    });
    await storeTokens(connection.id, tokens);
    // A reconnect: move accounts left on the old, dead connection onto this one.
    const moved = await reattachAccounts(user.agencyId, connection.id);
    if (moved.length) {
      after(async () => {
        for (const id of moved) await syncAccount(id, "scheduled");
      });
    }
    const next = client ? `/clients/${client.id}/accounts/${slug}?connection=${connection.id}` : `/integrations/${slug}/${connection.id}`;
    const res = NextResponse.redirect(publicUrl(next, req.url));
    res.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: "/api/integrations" });
    return res;
  } catch (e) {
    return back(req, e instanceof IntegrationError ? e.message : `Could not complete ${label} authorization`);
  }
}
