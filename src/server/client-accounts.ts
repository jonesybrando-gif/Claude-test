import "server-only";
import type { Platform } from "@prisma/client";
import { prisma } from "./db";
import type { RemoteAccount } from "./integrations/types";

// One ad account per platform per client: linking an account from a client's
// "Ad accounts" page replaces whatever that client had for the platform. The
// replaced account stops syncing; its history is kept.
//
// One ad account can be shared by several clients (e.g. an agency account that
// holds campaigns for several practices). Each client gets its own record and
// its own campaign selection. When a client joins an account another client
// already tracks, every campaign starts out left out of the new client's
// reports, so no spend is counted twice until its own campaigns are added.

export type LinkResult =
  | { ok: true; accountIds: string[]; replaced: number; /** Other clients already tracking this account. */ sharedWith: string[] }
  | { ok: false; error: string };

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
    const accountIds: string[] = [];
    const sharedWith = new Set<string>();
    let replaced = 0;
    for (const platform of platforms) {
      const elsewhere = await tx.adAccount.findMany({
        where: { platform, externalId: remote.externalId, isDemo: false, status: { not: "DISCONNECTED" }, clientId: { not: clientId }, client: { agencyId } },
        select: { client: { select: { name: true } } },
      });
      for (const e of elsewhere) sharedWith.add(e.client.name);
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
        // Shared with another client: start with every campaign left out.
        create: { ...data, clientId, platform, externalId: remote.externalId, includeNewCampaigns: elsewhere.length === 0 },
      });
      accountIds.push(row.id);
    }
    return { ok: true as const, accountIds, replaced, sharedWith: [...sharedWith].sort() };
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
