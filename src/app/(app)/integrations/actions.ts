"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireAdmin, requireClientEdit } from "@/server/access";
import { decryptSecret } from "@/server/crypto";
import { getAdapter } from "@/server/integrations/registry";
import { withAccessToken } from "@/server/integrations/tokens";
import { IntegrationError } from "@/server/integrations/errors";
import { syncAccount, type SyncResult } from "@/server/sync/sync-account";

export type LinkState = { ok?: string; errors?: string[] } | undefined;

async function loadConnection(connectionId: string, agencyId: string) {
  const c = await prisma.platformConnection.findFirst({ where: { id: connectionId, agencyId } });
  if (!c) throw new Error("Connection not found");
  return c;
}

/**
 * Link selected platform accounts to clients. Form fields: `client:<externalId>` = clientId or "".
 * Only accounts the connection can actually reach (re-listed from the API) are accepted.
 */
export async function linkAccounts(connectionId: string, _prev: LinkState, form: FormData): Promise<LinkState> {
  const user = await requireAdmin();
  const connection = await loadConnection(connectionId, user.agencyId);
  const adapter = getAdapter(connection.platform);
  if (!adapter) return { errors: ["This platform is not supported yet."] };

  let remote;
  try {
    remote = await withAccessToken(connection.id, adapter, (t) => adapter.listAccounts(t));
  } catch (e) {
    return { errors: [e instanceof IntegrationError ? e.message : "Could not list accounts from the platform."] };
  }
  const clients = new Set((await prisma.client.findMany({ where: { agencyId: user.agencyId }, select: { id: true } })).map((c) => c.id));

  const linked: string[] = [];
  for (const acc of remote.filter((a) => !a.isManager)) {
    const clientId = String(form.get(`client:${acc.externalId}`) ?? "");
    if (!clientId) continue;
    if (!clients.has(clientId)) return { errors: ["Unknown client selected."] };
    const existing = await prisma.adAccount.findFirst({ where: { platform: connection.platform, externalId: acc.externalId, client: { agencyId: user.agencyId } } });
    const data = {
      clientId,
      connectionId: connection.id,
      name: acc.name,
      currency: acc.currency,
      timezone: acc.timezone,
      loginCustomerId: acc.loginCustomerId ?? null,
      isDemo: false,
      status: "ACTIVE" as const,
    };
    const row = existing
      ? await prisma.adAccount.update({ where: { id: existing.id }, data })
      : await prisma.adAccount.create({ data: { ...data, platform: connection.platform, externalId: acc.externalId } });
    linked.push(row.id);
  }
  // Initial history import runs after the response is sent.
  after(async () => {
    for (const id of linked) await syncAccount(id, "scheduled");
  });
  revalidatePath("/integrations", "layout");
  revalidatePath("/dashboard");
  return { ok: linked.length ? `Linked ${linked.length} account${linked.length === 1 ? "" : "s"}. Historical data is importing in the background; refresh in a few minutes.` : "No accounts selected." };
}

export async function disconnectConnection(connectionId: string): Promise<void> {
  const user = await requireAdmin();
  const connection = await loadConnection(connectionId, user.agencyId);
  const cred = await prisma.oAuthCredential.findUnique({ where: { connectionId: connection.id } });
  // Best effort: revoke the grant at Google so the refresh token stops working.
  if (cred?.encryptedRefreshToken && connection.platform === "GOOGLE_ADS") {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptSecret(cred.encryptedRefreshToken) }).toString(),
      });
    } catch {
      /* revocation is best effort */
    }
  }
  await prisma.$transaction([
    prisma.oAuthCredential.deleteMany({ where: { connectionId: connection.id } }),
    prisma.platformConnection.update({ where: { id: connection.id }, data: { status: "DISCONNECTED", lastError: "Disconnected by an administrator" } }),
    prisma.adAccount.updateMany({ where: { connectionId: connection.id }, data: { status: "DISCONNECTED" } }),
  ]);
  revalidatePath("/integrations", "layout");
  revalidatePath("/dashboard");
}

/** Manual "Refresh now" for one live account. */
export async function refreshAccount(accountId: string): Promise<SyncResult> {
  const account = await prisma.adAccount.findUnique({ where: { id: accountId }, select: { clientId: true } });
  if (!account) throw new Error("Account not found");
  await requireClientEdit(account.clientId);
  const result = await syncAccount(accountId, "manual");
  revalidatePath(`/clients/${account.clientId}`);
  revalidatePath("/dashboard");
  return result;
}
