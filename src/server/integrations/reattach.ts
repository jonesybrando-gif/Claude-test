import "server-only";
import { prisma } from "../db";
import { getAdapter } from "./registry";
import { withAccessToken } from "./tokens";
import { pickReattachments, type OrphanAccount } from "@/lib/reattach";

// When a platform login is reconnected, the OAuth callback creates a new
// connection. Ad accounts linked through the old one (now NEEDS_REAUTH or
// DISCONNECTED) used to stay pointed at it, so clients kept showing
// "Ad account disconnected" until each account was linked again by hand.
//
// This moves those accounts onto a live connection that can reach them.
// Accounts someone chose to stop tracking (connectionId cleared) are left alone.

/** Accounts of this platform family that lost their connection but were never deliberately unlinked. */
async function orphanedAccounts(agencyId: string, platforms: string[]): Promise<OrphanAccount[]> {
  const rows = await prisma.adAccount.findMany({
    where: {
      isDemo: false,
      platform: { in: platforms as never },
      client: { agencyId, archivedAt: null },
      connectionId: { not: null },
      OR: [{ status: { not: "ACTIVE" } }, { connection: { status: { not: "ACTIVE" } } }],
    },
    select: { id: true, clientId: true, platform: true, externalId: true, connectionId: true, status: true },
  });
  if (!rows.length) return [];
  // Skip a row when its client already has another live account on that platform
  // (it was replaced on purpose).
  const live = await prisma.adAccount.findMany({
    where: { clientId: { in: [...new Set(rows.map((r) => r.clientId))] }, isDemo: false, status: "ACTIVE", connection: { status: "ACTIVE" } },
    select: { id: true, clientId: true, platform: true, externalId: true },
  });
  return rows.map((r) => ({ ...r, connectionId: r.connectionId! })).filter((r) => !live.some((l) => l.clientId === r.clientId && l.platform === r.platform && l.externalId !== r.externalId));
}

/**
 * Re-points orphaned accounts the given live connection can reach. Returns the
 * ids of accounts moved (so callers can sync them). Never throws.
 */
export async function reattachAccounts(agencyId: string, connectionId: string): Promise<string[]> {
  try {
    const connection = await prisma.platformConnection.findFirst({ where: { id: connectionId, agencyId, status: "ACTIVE" } });
    if (!connection) return [];
    const adapter = getAdapter(connection.platform);
    const platforms = adapter.linkablePlatforms as string[];
    const orphans = await orphanedAccounts(agencyId, platforms);
    if (!orphans.length) return [];
    const remote = await withAccessToken(connection.id, adapter, (t) => adapter.listAccounts(t));
    const moves = pickReattachments(orphans, remote, connection.id);
    for (const m of moves) {
      await prisma.adAccount.update({ where: { id: m.accountId }, data: { connectionId: connection.id, status: "ACTIVE", loginCustomerId: m.loginCustomerId } });
    }
    return moves.map((m) => m.accountId);
  } catch (e) {
    console.error(`[reattach] connection ${connectionId}:`, e instanceof Error ? e.message : e);
    return [];
  }
}

/** Runs reattachAccounts for every live connection that has orphans to adopt. */
export async function reattachAllAccounts(): Promise<string[]> {
  try {
    return await reattachEverywhere();
  } catch (e) {
    console.error("[reattach] failed", e instanceof Error ? e.message : e);
    return [];
  }
}

async function reattachEverywhere(): Promise<string[]> {
  const connections = await prisma.platformConnection.findMany({ where: { status: "ACTIVE" }, select: { id: true, agencyId: true, platform: true }, orderBy: { createdAt: "desc" } });
  const moved: string[] = [];
  for (const c of connections) {
    const platforms = getAdapter(c.platform).linkablePlatforms as string[];
    if (!(await orphanedAccounts(c.agencyId, platforms)).length) continue;
    moved.push(...(await reattachAccounts(c.agencyId, c.id)));
  }
  return moved;
}
