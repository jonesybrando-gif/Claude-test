import "server-only";
import type { Platform } from "@prisma/client";
import { prisma } from "./db";
import type { RemoteAccount } from "./integrations/types";

// One ad account per platform per client: linking an account from a client's
// "Ad accounts" page replaces whatever that client had for the platform. The
// replaced account stops syncing; its history is kept.

export type LinkResult = { ok: true; accountIds: string[]; replaced: number } | { ok: false; error: string };

export async function linkAccountToClient(opts: {
  agencyId: string;
  clientId: string;
  connectionId: string;
  remote: RemoteAccount;
  /** GOOGLE_ADS and/or GOOGLE_LSA for Google; the connection's platform otherwise. */
  platforms: Platform[];
}): Promise<LinkResult> {
  const { agencyId, clientId, connectionId, remote, platforms } = opts;
  if (remote.isManager) return { ok: false, error: "That's a manager account. Choose the client's own advertising account." };

  return prisma.$transaction(async (tx) => {
    // The same account can't be live under two clients.
    for (const platform of platforms) {
      const elsewhere = await tx.adAccount.findFirst({
        where: { platform, externalId: remote.externalId, isDemo: false, status: { not: "DISCONNECTED" }, clientId: { not: clientId }, client: { agencyId } },
        select: { client: { select: { name: true } } },
      });
      if (elsewhere) return { ok: false as const, error: `${remote.name} is already linked to ${elsewhere.client.name}. Stop tracking it there first.` };
    }
    const accountIds: string[] = [];
    let replaced = 0;
    for (const platform of platforms) {
      const { count } = await tx.adAccount.updateMany({
        where: { clientId, platform, isDemo: false, status: { not: "DISCONNECTED" }, externalId: { not: remote.externalId } },
        data: { status: "DISCONNECTED", connectionId: null },
      });
      replaced += count;
      const data = {
        connectionId,
        name: platform === "GOOGLE_LSA" ? `${remote.name} — Local Services` : remote.name,
        currency: remote.currency,
        timezone: remote.timezone || null,
        loginCustomerId: remote.loginCustomerId ?? null,
        isDemo: false,
        status: "ACTIVE" as const,
      };
      const row = await tx.adAccount.upsert({
        where: { platform_externalId_clientId: { platform, externalId: remote.externalId, clientId } },
        update: data,
        create: { ...data, clientId, platform, externalId: remote.externalId },
      });
      accountIds.push(row.id);
    }
    return { ok: true as const, accountIds, replaced };
  });
}

/** Stop syncing one of a client's accounts; its history stays. */
export async function stopTrackingAccount(agencyId: string, clientId: string, accountId: string): Promise<boolean> {
  const { count } = await prisma.adAccount.updateMany({
    where: { id: accountId, clientId, isDemo: false, client: { agencyId } },
    data: { status: "DISCONNECTED", connectionId: null },
  });
  return count > 0;
}
