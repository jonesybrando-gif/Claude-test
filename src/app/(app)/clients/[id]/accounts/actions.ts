"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Platform } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { getAdapter } from "@/server/integrations/registry";
import { withAccessToken } from "@/server/integrations/tokens";
import { IntegrationError } from "@/server/integrations/errors";
import { linkAccountToClient, stopTrackingAccount } from "@/server/client-accounts";
import { syncAccount } from "@/server/sync/sync-account";

export type PickState = { error?: string } | undefined;

/** Link the account chosen on a client's picker page (one per platform; replaces the previous one). */
export async function linkClientAccountAction(clientId: string, connectionId: string, _prev: PickState, form: FormData): Promise<PickState> {
  const user = await requireAdmin();
  const [client, connection] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, agencyId: user.agencyId }, select: { id: true } }),
    prisma.platformConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId, status: { not: "DISCONNECTED" } } }),
  ]);
  if (!client || !connection) return { error: "That client or connection no longer exists." };
  const externalId = String(form.get("account") ?? "");
  if (!externalId) return { error: "Choose an account." };
  const adapter = getAdapter(connection.platform);
  let remote;
  try {
    // Re-list so only accounts this login can actually reach are accepted.
    remote = (await withAccessToken(connection.id, adapter, (t) => adapter.listAccounts(t))).find((a) => a.externalId === externalId && !a.isManager);
  } catch (e) {
    return { error: e instanceof IntegrationError ? e.message : "Could not load accounts from the platform." };
  }
  if (!remote) return { error: "That account isn't available to this login any more." };
  const platforms: Platform[] =
    connection.platform === "GOOGLE_ADS"
      ? [...(form.get("ads") === "on" ? (["GOOGLE_ADS"] as const) : []), ...(form.get("lsa") === "on" ? (["GOOGLE_LSA"] as const) : [])]
      : [connection.platform];
  if (platforms.length === 0) return { error: "Choose Google Ads, Local Services Ads, or both." };
  const result = await linkAccountToClient({ agencyId: user.agencyId, clientId, connectionId: connection.id, remote, platforms });
  if (!result.ok) return { error: result.error };
  // Import history after the response is sent.
  after(async () => {
    for (const id of result.accountIds) await syncAccount(id, "scheduled");
  });
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/dashboard");
  redirect(`/clients/${clientId}/accounts?linked=${result.accountIds.length}&replaced=${result.replaced}`);
}

export async function stopTrackingAction(clientId: string, accountId: string): Promise<void> {
  const user = await requireAdmin();
  await stopTrackingAccount(user.agencyId, clientId, accountId);
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/dashboard");
}
