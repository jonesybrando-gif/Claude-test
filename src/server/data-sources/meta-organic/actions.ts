"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";

/**
 * Disconnect a Facebook & Instagram login: forget its token and stop syncing
 * its Pages and Instagram accounts. Stored history is kept. Meta permissions
 * are not revoked, because the same Facebook user may also power the Meta Ads
 * connection (that would break it too).
 */
export async function disconnectMetaOrganic(connectionId: string): Promise<void> {
  const user = await requireAdmin();
  const c = await prisma.dataSourceConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId, provider: "META_ORGANIC" }, select: { id: true } });
  if (!c) throw new Error("Connection not found");
  await prisma.$transaction([
    prisma.dataSourceConnection.update({ where: { id: c.id }, data: { status: "DISCONNECTED", encryptedAccessToken: null, encryptedRefreshToken: null, accessTokenExpiresAt: null, lastError: null } }),
    // Paused, not unlinked: reconnecting the same Facebook user resumes them (assets set to "Don't monitor" stay off).
    prisma.dataAsset.updateMany({ where: { connectionId: c.id, status: "ACTIVE" }, data: { status: "NEEDS_REAUTH", lastError: "The login was disconnected." } }),
  ]);
  revalidatePath("/integrations");
}
