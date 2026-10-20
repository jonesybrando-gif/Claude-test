import "server-only";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";

/**
 * Disconnects one platform login. Stored tokens are always deleted.
 *
 * For Google we also revoke the grant at Google, but only when this is the
 * agency's last active Google connection: Google's revoke cancels the app's
 * access for the whole Google login, so it would also break any other
 * connection made with the same login. We can't tell which login a
 * connection belongs to (the Google Ads scope doesn't include the email), so
 * we only revoke when nothing else could depend on it.
 */
export async function disconnectPlatformConnection(
  agencyId: string,
  connectionId: string,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ revokedAtGoogle: boolean }> {
  const connection = await prisma.platformConnection.findFirstOrThrow({ where: { id: connectionId, agencyId } });
  const cred = await prisma.oAuthCredential.findUnique({ where: { connectionId } });
  let revokedAtGoogle = false;
  if (cred?.encryptedRefreshToken && connection.platform === "GOOGLE_ADS") {
    const others = await prisma.platformConnection.count({ where: { agencyId, platform: "GOOGLE_ADS", id: { not: connectionId }, status: { not: "DISCONNECTED" } } });
    if (others === 0) {
      try {
        const res = await (deps.fetch ?? fetch)("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: decryptSecret(cred.encryptedRefreshToken) }).toString(),
        });
        revokedAtGoogle = res.ok;
      } catch {
        /* revocation is best effort */
      }
    }
  }
  await prisma.$transaction([
    prisma.oAuthCredential.deleteMany({ where: { connectionId } }),
    prisma.platformConnection.update({ where: { id: connectionId }, data: { status: "DISCONNECTED", lastError: "Disconnected by an administrator" } }),
    prisma.adAccount.updateMany({ where: { connectionId }, data: { status: "DISCONNECTED" } }),
  ]);
  return { revokedAtGoogle };
}
